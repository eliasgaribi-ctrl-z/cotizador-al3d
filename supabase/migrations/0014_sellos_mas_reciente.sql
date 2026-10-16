-- =====================================================================================================
-- 0014_sellos_mas_reciente.sql — Q-06 decidida: gana el cambio más reciente, con 10 minutos de holgura para TODOS
-- =====================================================================================================
-- Elías decidió el 2026-10-16 (docs/DECISIONES-SUPABASE.md, Q-06) que los sellos funcionan como hoy en el `.gs`: ante dos cambios del mismo
-- dato gana el MÁS RECIENTE, sea del área que sea, y un sello puede adelantarse al reloj del servidor a lo más 10 minutos (SELLO_HOLGURA_MS),
-- igual para Dirección, Fabricación, Pagos y lo que no viene de una RPC. Eso deshace la decisión PROVISIONAL de 0013 (H-3):
--   (a) la holgura de 60 s para los roles bajos  → vuelve a 10 min para todos;
--   (b) «Dirección gana ante Fabricación o Pagos» → ya no hay prioridad por área.
--
-- Lo demás de 0013 NO se toca y sigue igual: H-1 (la bitácora de subida_unica la firma el servidor), H-2 (una cotización subida sin sello del
-- servidor nace «retirada»), H-4 (tope de 1 día al `ts` del almacén), H-5 (Pagos no crea requerimientos) y H-6 (tablas temporales).
--
-- Qué se hace (copias íntegras con el cambio marcado «0014:», el mismo patrón de 0012 y 0013):
--   · interno.sello_valido      vuelve a la de 0001: tope `ahora + 600000` para todos, e immutable otra vez (ya no depende de la transacción);
--   · interno.compuerta         vuelve a la de 0001 (immutable), sin excepción por área;
--   · interno.sellos_limpios    vuelve a immutable (como en 0006);
--   · interno.proyecto_remoto   vuelve a la de 0006 (ya no hay `sellos_area` que quitar);
--   · interno.preambulo         vuelve a la de 0002 (stable; ya no fija `al3d.area`, que nadie lee);
--   · public.mover_etapa, public.proyecto_actualizar, public.instalacion_guardar: las copias de 0013 con la compuerta de siempre en lugar de la
--     compuerta con autor (y nada más cambia);
--   · se BORRAN, porque ya nada los usa: la columna `proyectos.sellos_area`, su trigger `proyectos_sellos_autor` y su función, y las funciones
--     interno.compuerta_con_autor, interno.holgura_sello_ms e interno.area_actual.
--
-- Por qué se quita `sellos_area` y no se deja «por si acaso»: solo servía para la prioridad de Dirección; nadie más la lee (el teléfono no la
-- recibía en `remoto`, la lectura en vivo no la pide, el importador no la escribe). Dejarla sería un trigger corriendo en cada escritura de
-- proyectos para llenar un dato muerto. Los sellos en sí (`proyectos.sellos`) no se tocan: ningún dato se pierde.
--
-- Depende de: 0001…0013. Idempotente (create or replace, drop … if exists). Termina corriendo la auditoría de 0011: si algo quedó abierto,
-- aborta como ella.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. La holgura y la compuerta de siempre (0001)
-- -----------------------------------------------------------------------------------------------------
-- El sello que llega del teléfono, saneado: `floor(Number(x))`; si no es número finito o es <= 0, vale 0; si no, se acota a `ahora + 10 min`
-- (SELLO_HOLGURA_MS del .gs), para TODAS las áreas: un reloj adelantado no puede ganarle a todo lo futuro.
create or replace function interno.sello_valido(p_x jsonb, p_ahora_ms bigint) returns bigint
language plpgsql immutable set search_path = '' as $$
declare n numeric;
begin
  if p_x is null or pg_catalog.jsonb_typeof(p_x) not in ('number','string') then return 0; end if;
  begin n := floor((p_x #>> '{}')::numeric); exception when others then return 0; end;
  if n is null or n in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) or n <= 0 then return 0; end if;
  return least(n, (p_ahora_ms + 600000)::numeric)::bigint;      -- 0014: 10 min para todos (0013 daba 60 s a los roles bajos)
end $$;
revoke all on function interno.sello_valido(jsonb, bigint) from public, anon, authenticated, service_role;

-- Decide si un cambio entra: devuelve (accion, sello_nuevo, motivo) con accion = escribir | viejo | rechazar.
--   · ya hay un sello MÁS nuevo que el que llega  -> 'viejo' (no es error: otro teléfono lo cambió después y gana), sea del área que sea;
--   · el empate ESCRIBE (la comparación es estricta, como en el .gs);
--   · vaciar sin sello no borra; etapa y entrega jamás se vacían;
--   · el sello guardado solo sube (greatest): un valor sin sello no crea sello.
create or replace function interno.compuerta(p_tiene bigint, p_sellos_op jsonb, p_grupo text, p_ahora_ms bigint,
                                             p_vacio boolean, p_borrable boolean)
returns table (accion text, sello_nuevo bigint, motivo text)
language plpgsql immutable set search_path = '' as $$
declare v_tiene bigint := coalesce(p_tiene, 0);
        v_llega bigint := interno.sello_valido(p_sellos_op -> p_grupo, p_ahora_ms);
begin
  if v_tiene > 0 and v_llega < v_tiene then
    return query select 'viejo'::text, v_tiene, 'ya tenía un cambio más reciente'::text; return;
  end if;
  if p_vacio and v_llega = 0 then
    return query select 'rechazar'::text, v_tiene, 'vacío sin sello no borra'::text; return;
  end if;
  if p_vacio and not p_borrable then
    return query select 'rechazar'::text, v_tiene, 'este dato no se puede vaciar'::text; return;
  end if;
  return query select 'escribir'::text, greatest(v_tiene, v_llega), null::text;
end $$;
revoke all on function interno.compuerta(bigint, jsonb, text, bigint, boolean, boolean) from public, anon, authenticated, service_role;

-- Los sellos que llegan con un alta, acotados: solo los 8 grupos, cada uno `sello_valido` y mayor que cero (un valor sin sello no crea sello).
create or replace function interno.sellos_limpios(p_sellos jsonb, p_ahora bigint) returns jsonb language plpgsql immutable set search_path = '' as $$
declare g text; v bigint; r jsonb := '{}'::jsonb;
begin
  if pg_catalog.jsonb_typeof(p_sellos) is distinct from 'object' then return r; end if;
  foreach g in array array['etapa','notas','plazo_k','tel','dir_texto','ubicacion','entrega','instalacion'] loop
    v := interno.sello_valido(p_sellos -> g, p_ahora);
    if v > 0 then r := r || pg_catalog.jsonb_build_object(g, v); end if;
  end loop;
  return r;
end $$;
revoke all on function interno.sellos_limpios(jsonb, bigint) from public, anon, authenticated, service_role;

-- Lo que vuelve al teléfono tras una escritura (`remoto`): la fila del proyecto como quedó, SIN la copia de la cotización ni la procedencia.
-- Sale SOLO de `proyectos` (jamás de `ventas_dinero`): a Fabricación no le llega ni una cifra.
create or replace function interno.proyecto_remoto(p_id text) returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.to_jsonb(p) - 'origen_obra' - 'procedencia' from public.proyectos p where p.id = p_id $$;      -- 0014: ya no hay sellos_area
revoke all on function interno.proyecto_remoto(text) from public, anon, authenticated, service_role;

-- El preámbulo de 0002, tal cual: ya no fija `al3d.area` (solo lo leían la holgura por área y el trigger de `sellos_area`).
create or replace function interno.preambulo(p_empresa text, p_areas text[], out c interno.contexto_t, out e jsonb)
language plpgsql stable set search_path = '' as $$
begin
  e := interno.guardia_contrato();
  if e is not null then return; end if;
  c := interno.ctx(p_empresa);
  if    c.motivo = 'acceso_revocado'  then e := interno.err('ACCESO_REVOCADO',   'Tu acceso a esta empresa ya no está activo.');
  elsif c.motivo = 'sin_acceso'       then e := interno.err('SIN_ACCESO',        'Esta cuenta no tiene acceso. Pídele a Dirección que te agregue.');
  elsif c.motivo = 'empresa_requerida' then e := interno.err('EMPRESA_REQUERIDA', 'Tienes acceso a varias empresas: indica con cuál trabajar.');
  elsif c.motivo <> 'ok' or c.area is null or not (c.area = any (p_areas)) then e := interno.err('ROL_SIN_PERMISO', 'No tienes permiso para esto.');
  end if;
end $$;
revoke all on function interno.preambulo(text, text[]) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. Las tres RPC de obra que deciden con sellos: las copias de 0013 con la compuerta de siempre
-- -----------------------------------------------------------------------------------------------------
-- Única diferencia con 0013: `interno.compuerta(…)` en lugar de `interno.compuerta_con_autor(…, p.sellos_area ->> grupo)`, marcada «0014:».
create or replace function public.mover_etapa(p_proyecto text, p_etapa text, p_sello bigint default null, p_motivo text default '', p_empresa text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pre record; p public.proyectos; v_perm jsonb; r record; v_sal int; v_ok boolean;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion']);        -- Pagos: ROL_SIN_PERMISO (no mueve la etapa)
  if pre.e is not null then return pre.e; end if;
  if p_etapa is null or p_etapa <> all (array['ganado','en_diseno','cortado','armado','listo','instalado','garantia','cancelado']) then
    return interno.err('DATO_INVALIDO', 'La etapa no existe.'); end if;
  select * into p from public.proyectos x where x.empresa_id = (pre.c).empresa_id and x.id = p_proyecto and x.deleted_at is null for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Ese proyecto no existe.'); end if;
  if p.etapa is null then return interno.err('DATO_INVALIDO', 'Una fila histórica no es una tarjeta de obra: no tiene etapa.'); end if;
  v_perm := interno.matriz_permisos() -> (pre.c).area -> 'etapas';
  v_ok := (v_perm -> 'origen') ? p.etapa and (v_perm -> 'destino') ? p_etapa;
  if not v_ok then return interno.err('ROL_SIN_PERMISO', 'Tu área no puede mover un proyecto de esa etapa a esa otra.'); end if;
  if p.folio_hoja is null then      -- una lápida: sacarla de `cancelado` sin darle folio violaría el libro, y no hay dinero que darle (Q-A23)
    return interno.err('DATO_INVALIDO', 'Una cotización que no se dio no cambia de etapa.'); end if;
  if p.etapa = p_etapa then return pg_catalog.jsonb_build_object('ok', true, 'sin_cambio', true); end if;      -- el doble toque de un dedo
  if p_sello is null then return interno.err('DATO_INVALIDO', 'Falta el sello del cambio de etapa.'); end if;
  select * into r from interno.compuerta((p.sellos ->> 'etapa')::bigint, pg_catalog.jsonb_build_object('etapa', p_sello), 'etapa', interno.ahora_ms(), false, false);      -- 0014: la compuerta de siempre (gana el más reciente)
  if r.accion = 'viejo' then      -- otro teléfono la movió después y gana: no es un error, y el teléfono recibe lo vigente
    return pg_catalog.jsonb_build_object('ok', true, 'viejos', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'etapa', 'por', r.motivo)),
                                         'remoto', interno.proyecto_remoto(p.id));
  end if;
  v_sal := interno.mover_etapa_core(p, p_etapa, r.sello_nuevo, 'manual', coalesce(p_motivo, ''), pre.c);
  return pg_catalog.jsonb_build_object('ok', true, 'etapa', p_etapa, 'salidas', v_sal, 'remoto', interno.proyecto_remoto(p.id));
end $$;
revoke all on function public.mover_etapa(text, text, bigint, text, text) from public, anon, authenticated, service_role;
grant execute on function public.mover_etapa(text, text, bigint, text, text) to authenticated;

create or replace function public.proyecto_actualizar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; p public.proyectos; v_ahora bigint := interno.ahora_ms(); v_campos jsonb; v_sellos jsonb; v_permitidos jsonb;
  v_esc text[] := '{}'; v_vie jsonb := '[]'::jsonb; v_rec jsonb := '[]'::jsonb; k text; g text; r record; v_hay boolean; v_alguno boolean := false;
  v_vacio boolean; v_borrable boolean; v_ok boolean; v_sel jsonb;
  n_notas text; n_tel text; n_dir text; n_lat double precision; n_lng double precision; n_maps text; n_geo text; n_ent text; n_plazo smallint;
  n_entrecalles text; n_ubpend boolean; n_contacto text; n_negocio text; n_tipo text[]; n_comp text; n_fant date; n_obra jsonb; n_dinero jsonb;
  v_val jsonb; v_lat numeric; v_lng numeric; v_tel text; v_origen_viejo jsonb; v_t jsonb;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  c := pre.c;
  if pg_catalog.jsonb_typeof(p_op) is distinct from 'object' or pg_catalog.jsonb_typeof(p_op -> 'campos') is distinct from 'object' or pg_catalog.jsonb_typeof(p_op -> 'id') is distinct from 'string' then
    return interno.err('DATO_INVALIDO', 'La operación necesita el id del proyecto y sus campos.'); end if;
  v_campos := p_op -> 'campos'; v_sellos := p_op -> 'sellos';
  select * into p from public.proyectos x where x.empresa_id = c.empresa_id and x.id = p_op ->> 'id' and x.deleted_at is null for update;      -- el candado de fila serializa a dos teléfonos
  if not found then return interno.err('NO_ENCONTRADO', 'Ese proyecto no existe.'); end if;
  -- 1. permiso por campo
  v_permitidos := interno.matriz_permisos() -> c.area -> 'proyecto_actualizar';
  for k in select pg_catalog.jsonb_object_keys(v_campos) loop
    if not (v_permitidos ? k) then
      v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', k, 'por', 'el rol ' || c.area || ' no puede escribir esta propiedad'));
      v_campos := v_campos - k;
    end if;
  end loop;
  -- 2a. ¿hay algún grupo sellado? entonces el objeto `sellos` es obligatorio
  foreach g in array array['notas','tel','dir_texto','ubicacion','entrega','plazo_k'] loop
    v_hay := case g when 'ubicacion' then v_campos ?| array['lat','lng','maps_url','geo_fuente'] else v_campos ? g end;
    if v_hay then v_alguno := true; end if;
  end loop;
  if v_alguno and pg_catalog.jsonb_typeof(v_sellos) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'Faltan los sellos de los datos que se editan.'); end if;
  -- valores de partida: los actuales
  n_notas := p.notas; n_tel := p.tel; n_dir := p.dir_texto; n_lat := p.lat; n_lng := p.lng; n_maps := p.maps_url; n_geo := p.geo_fuente; n_ent := p.entrega; n_plazo := p.plazo_k;
  n_entrecalles := p.entrecalles; n_ubpend := p.ubicacion_pendiente; n_contacto := p.contacto; n_negocio := p.negocio; n_tipo := p.tipo_trabajo; n_comp := p.compromiso_texto;
  n_fant := p.fecha_anticipo; n_obra := p.origen_obra; v_sel := p.sellos;
  -- 2b. los grupos sellados
  foreach g in array array['notas','tel','dir_texto','ubicacion','entrega','plazo_k'] loop
    v_hay := case g when 'ubicacion' then v_campos ?| array['lat','lng','maps_url','geo_fuente'] else v_campos ? g end;
    if not v_hay then continue; end if;
    v_vacio := false; v_borrable := g <> 'entrega';
    if g = 'notas' then
      if pg_catalog.jsonb_typeof(v_campos -> 'notas') not in ('string', 'null') or pg_catalog.length(coalesce(v_campos ->> 'notas', '')) > 40000 then
        v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'notas', 'por', 'las notas deben ser un texto de hasta 40 000 caracteres')); continue; end if;
      v_vacio := pg_catalog.btrim(coalesce(v_campos ->> 'notas', '')) = '';
    elsif g = 'tel' then
      v_tel := interno.telefono_limpio(case when pg_catalog.jsonb_typeof(v_campos -> 'tel') in ('string', 'null') then v_campos ->> 'tel' else 'x' end);
      if v_tel is null and pg_catalog.jsonb_typeof(v_campos -> 'tel') <> 'null' then
        v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'tel', 'por', 'un teléfono lleva dígitos: números, espacios, + ( ) y guiones')); continue; end if;
      v_vacio := coalesce(v_tel, '') = '';
    elsif g = 'dir_texto' then
      if pg_catalog.jsonb_typeof(v_campos -> 'dir_texto') not in ('string', 'null') or pg_catalog.length(coalesce(v_campos ->> 'dir_texto', '')) > 2000 then
        v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'dir_texto', 'por', 'la dirección debe ser un texto de hasta 2 000 caracteres')); continue; end if;
      v_vacio := pg_catalog.btrim(coalesce(v_campos ->> 'dir_texto', '')) = '';
    elsif g = 'entrega' then
      v_vacio := coalesce(v_campos ->> 'entrega', '') = '';
      if not v_vacio and (pg_catalog.jsonb_typeof(v_campos -> 'entrega') <> 'string' or (v_campos ->> 'entrega') <> all (array['instalacion','paqueteria','recoleccion'])) then
        v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'entrega', 'por', 'la entrega es instalación, paquetería o recolección')); continue; end if;
    elsif g = 'plazo_k' then
      v_vacio := not (v_campos ? 'plazo_k') or pg_catalog.jsonb_typeof(v_campos -> 'plazo_k') = 'null';
      if not v_vacio and (interno.num(v_campos -> 'plazo_k') is null or interno.num(v_campos -> 'plazo_k') <> pg_catalog.trunc(interno.num(v_campos -> 'plazo_k'))
                          or interno.num(v_campos -> 'plazo_k') not between 1 and 5) then
        v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'plazo_k', 'por', 'el plazo de taller va de 1 a 5')); continue; end if;
    else      -- ubicacion: lat y lng ambos o ninguno, |lat| ≤ 90, |lng| ≤ 180, no (0, 0); vacía = lat y lng nulos y maps_url vacío
      v_lat := interno.num(v_campos -> 'lat'); v_lng := interno.num(v_campos -> 'lng');
      if (v_lat is null) <> (v_lng is null) or abs(coalesce(v_lat, 0)) > 90 or abs(coalesce(v_lng, 0)) > 180 or (v_lat = 0 and v_lng = 0)
         or pg_catalog.jsonb_typeof(coalesce(v_campos -> 'maps_url', '""'::jsonb)) not in ('string', 'null') or pg_catalog.jsonb_typeof(coalesce(v_campos -> 'geo_fuente', '""'::jsonb)) not in ('string', 'null') then
        v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'ubicacion', 'por', 'las coordenadas no son válidas (latitud y longitud juntas, y no 0, 0)')); continue; end if;
      v_vacio := v_lat is null and coalesce(v_campos ->> 'maps_url', '') = '';
    end if;
    select * into r from interno.compuerta((v_sel ->> g)::bigint, v_sellos, g, v_ahora, v_vacio, v_borrable);      -- 0014: la compuerta de siempre (gana el más reciente)
    if r.accion = 'viejo' then
      v_vie := v_vie || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', g, 'por', r.motivo));
    elsif r.accion = 'rechazar' then
      v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', g, 'por', r.motivo));
    else
      v_esc := v_esc || g;
      if g = 'notas' then n_notas := case when v_vacio then '' else coalesce(v_campos ->> 'notas', '') end;
      elsif g = 'tel' then n_tel := coalesce(v_tel, '');
      elsif g = 'dir_texto' then n_dir := case when v_vacio then '' else coalesce(v_campos ->> 'dir_texto', '') end;
      elsif g = 'entrega' then n_ent := nullif(v_campos ->> 'entrega', '');
      elsif g = 'plazo_k' then n_plazo := case when v_vacio then null else interno.num(v_campos -> 'plazo_k')::smallint end;
      else n_lat := v_lat; n_lng := v_lng; n_maps := coalesce(v_campos ->> 'maps_url', ''); n_geo := coalesce(v_campos ->> 'geo_fuente', '');
      end if;
      if r.sello_nuevo > 0 then v_sel := v_sel || pg_catalog.jsonb_build_object(g, r.sello_nuevo); end if;       -- un valor sin sello no crea sello
    end if;
  end loop;
  -- 3. los campos sin sello: se validan y se escriben
  foreach k in array array['entrecalles','ubicacion_pendiente','contacto','negocio','tipo_trabajo','compromiso_texto','fecha_anticipo'] loop
    if not (v_campos ? k) then continue; end if;
    v_val := v_campos -> k; v_ok := true;
    if k = 'entrecalles' or k = 'compromiso_texto' then
      if pg_catalog.jsonb_typeof(v_val) not in ('string', 'null') or pg_catalog.length(coalesce(v_val #>> '{}', '')) > 40000 then v_ok := false;
      elsif k = 'entrecalles' then n_entrecalles := coalesce(v_val #>> '{}', ''); else n_comp := coalesce(v_val #>> '{}', ''); end if;
    elsif k = 'contacto' or k = 'negocio' then
      if pg_catalog.jsonb_typeof(v_val) not in ('string', 'null') or pg_catalog.length(coalesce(v_val #>> '{}', '')) > 2000 then v_ok := false;
      elsif k = 'contacto' then n_contacto := coalesce(v_val #>> '{}', ''); else n_negocio := coalesce(v_val #>> '{}', ''); end if;
    elsif k = 'ubicacion_pendiente' then
      if pg_catalog.jsonb_typeof(v_val) <> 'boolean' then v_ok := false; else n_ubpend := (v_val #>> '{}')::boolean; end if;
    elsif k = 'tipo_trabajo' then
      if pg_catalog.jsonb_typeof(v_val) <> 'array' or exists (select 1 from pg_catalog.jsonb_array_elements(v_val) x where pg_catalog.jsonb_typeof(x) <> 'string')
         or not (array(select pg_catalog.jsonb_array_elements_text(v_val)) <@ array['Caja de luz con iluminacion','Caja de luz sin iluminacion','Letras 3D con iluminacion','Letras 3D sin iluminacion','Rotulacion de vinil','Recorte acrilico','Custome / Proyecto Especial']) then
        v_ok := false;
      else n_tipo := array(select pg_catalog.jsonb_array_elements_text(v_val)); end if;
    else      -- fecha_anticipo
      if pg_catalog.jsonb_typeof(v_val) = 'null' then n_fant := null;
      elsif interno.fecha_json(v_val) is null then v_ok := false;
      else n_fant := interno.fecha_json(v_val); end if;
    end if;
    if v_ok then v_esc := v_esc || k;
    else v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', k, 'por', 'el valor de ' || k || ' no es válido')); end if;
  end loop;
  -- 4. origen (solo Dirección): obra → proyectos, dinero → ventas_dinero
  if v_campos ? 'origen' then
    if pg_catalog.jsonb_typeof(v_campos -> 'origen') <> 'object' then
      v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'origen', 'por', 'el origen debe ser un objeto'));
    else
      select o.obra, o.dinero into n_obra, n_dinero from interno.partir_origen(v_campos -> 'origen') o;
      v_esc := v_esc || 'origen'::text;
    end if;
  end if;
  -- 5. nada que escribir
  if pg_catalog.cardinality(v_esc) = 0 then
    return pg_catalog.jsonb_build_object('ok', true, 'escritos', '[]'::jsonb, 'viejos', v_vie, 'rechazadas', v_rec, 'remoto', interno.proyecto_remoto(p.id));
  end if;
  -- 6. un solo UPDATE; `tocar` no mueve `updated_at` si ninguna columna cambió de verdad
  update public.proyectos set notas = n_notas, tel = n_tel, dir_texto = n_dir, lat = n_lat, lng = n_lng, maps_url = n_maps, geo_fuente = n_geo, entrega = n_ent, plazo_k = n_plazo,
                              entrecalles = n_entrecalles, ubicacion_pendiente = n_ubpend, contacto = n_contacto, negocio = n_negocio, tipo_trabajo = n_tipo,
                              compromiso_texto = n_comp, fecha_anticipo = n_fant, origen_obra = n_obra, sellos = v_sel
   where id = p.id;
  if n_dinero is not null then
    select d.origen_dinero -> 'venta' into v_t from public.ventas_dinero d where d.proyecto_id = p.id;
    -- lo que el modal «Registrar venta» mandó (`venta`) se conserva si el origen nuevo no trae el suyo
    update public.ventas_dinero set origen_dinero = case when n_dinero ? 'venta' or v_t is null then n_dinero else n_dinero || pg_catalog.jsonb_build_object('venta', v_t) end
     where proyecto_id = p.id;
  end if;
  -- 7. bitácora de obra: la lista de campos, SIN importes
  perform interno.anotar(c, 'general', 'cambio', 'proyecto', p.id, 'Se editó ' || p.nombre, 'Campos: ' || pg_catalog.array_to_string(v_esc, ', '));
  return pg_catalog.jsonb_build_object('ok', true, 'escritos', pg_catalog.to_jsonb(v_esc), 'viejos', v_vie, 'rechazadas', v_rec, 'remoto', interno.proyecto_remoto(p.id));
end $$;
revoke all on function public.proyecto_actualizar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.proyecto_actualizar(jsonb, text) to authenticated;

create or replace function public.instalacion_guardar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; p public.proyectos; e public.instalaciones; viva public.instalaciones; v_id text; v_fecha date; v_hora text; v_vent text; v_dur int;
  v_estado text; v_ahora bigint := interno.ahora_ms(); r record; v_cambio_cita boolean; v_cambio boolean; v_cancela boolean; v_nuevo text; v_notas text; v_movida int;
  v_final public.instalaciones; v_viejos jsonb := '[]'::jsonb; v_sello jsonb; v_sello_nuevo bigint; v_hay_e boolean := false; v_accion text; v_anexo text;
  v_p2 public.proyectos; v_ord int;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion']);       -- Pagos: ROL_SIN_PERMISO
  if pre.e is not null then return pre.e; end if;
  c := pre.c;
  if pg_catalog.jsonb_typeof(p_op) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'La operación está mal formada.'); end if;
  v_id := p_op ->> 'id';
  if v_id is null or v_id !~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$' then return interno.err('DATO_INVALIDO', 'El id de la instalación no es válido.'); end if;
  select * into p from public.proyectos x where x.empresa_id = c.empresa_id and x.id = p_op ->> 'proyecto_id' and x.deleted_at is null for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Ese proyecto no existe.'); end if;
  v_estado := nullif(p_op ->> 'estado', '');
  if v_estado is not null and v_estado <> all (array['propuesta','confirmada','reagendada','hecha','cancelada']) then return interno.err('DATO_INVALIDO', 'El estado de la instalación no existe.'); end if;
  if p.historica then return interno.err('DATO_INVALIDO', 'Una fila histórica no tiene instalaciones.'); end if;
  if p.etapa = 'cancelado' and v_estado is distinct from 'cancelada' then return interno.err('DATO_INVALIDO', 'No se agenda un proyecto cancelado.'); end if;
  v_fecha := interno.fecha_json(p_op -> 'fecha');
  if v_fecha is null then return interno.err('DATO_INVALIDO', 'La fecha de la instalación no es válida.'); end if;
  v_hora := nullif(p_op ->> 'hora', '');
  if v_hora is not null then
    if v_hora !~ '^[0-9]{1,2}:[0-9]{2}$' then return interno.err('DATO_INVALIDO', 'La hora de la instalación no es válida.'); end if;
    v_hora := pg_catalog.lpad(pg_catalog.split_part(v_hora, ':', 1), 2, '0') || ':' || pg_catalog.split_part(v_hora, ':', 2);
    if v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return interno.err('DATO_INVALIDO', 'La hora de la instalación no es válida.'); end if;
  end if;
  v_vent := coalesce(nullif(p_op ->> 'ventana', ''), 'dia');
  if v_vent in ('manana', 'tarde') then v_vent := 'dia'; end if;            -- las ventanas heredadas
  if v_vent <> all (array['dia','noche','madrugada']) then return interno.err('DATO_INVALIDO', 'La ventana de la instalación no existe.'); end if;
  if p_op ? 'duracion_min' and pg_catalog.jsonb_typeof(p_op -> 'duracion_min') <> 'null' then
    if interno.num(p_op -> 'duracion_min') is null or interno.num(p_op -> 'duracion_min') <> pg_catalog.trunc(interno.num(p_op -> 'duracion_min'))
       or interno.num(p_op -> 'duracion_min') not between 1 and 600 then return interno.err('DATO_INVALIDO', 'La duración va de 1 a 600 minutos.'); end if;
    v_dur := interno.num(p_op -> 'duracion_min')::int;
  else v_dur := 180; end if;
  v_sello := p_op -> 'sello';
  if pg_catalog.jsonb_typeof(v_sello) is null or pg_catalog.jsonb_typeof(v_sello) not in ('number', 'string') then
    return interno.err('DATO_INVALIDO', 'Falta el sello de la cita.'); end if;     -- también al crearla (Q-A05)
  if pg_catalog.length(coalesce(p_op ->> 'notas', '')) > 40000 or pg_catalog.length(coalesce(p_op ->> 'anexo', '')) > 40000 then
    return interno.err('DATO_INVALIDO', 'Un texto de la instalación es demasiado largo.'); end if;
  v_anexo := coalesce(p_op ->> 'anexo', '');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.empresa_id || ':inst:' || p.id, 0));
  select * into e from public.instalaciones x where x.empresa_id = c.empresa_id and x.id = v_id;
  v_hay_e := found;
  if v_hay_e and e.proyecto_id <> p.id then return interno.err('DATO_INVALIDO', 'Esa instalación es de otro proyecto.'); end if;
  select * into viva from public.instalaciones x
   where x.empresa_id = c.empresa_id and x.proyecto_id = p.id and x.estado <> 'cancelada' and x.deleted_at is null order by x.created_at limit 1;
  if not v_hay_e and viva.id is not null then e := viva; v_hay_e := true; end if;        -- agendar sobre una viva REAGENDA la existente
  if not v_hay_e then
    -- CASO A: no existe ninguna: se crea (la base elige el estado)
    select * into r from interno.compuerta((p.sellos ->> 'instalacion')::bigint, pg_catalog.jsonb_build_object('instalacion', v_sello), 'instalacion', v_ahora, false, true);      -- 0014: la compuerta de siempre (gana el más reciente)
    insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, hora, ventana, duracion_min, estado, movida, uid_ics, notas, creado_por)
    values (v_id, c.empresa_id, p.id, v_fecha, v_hora, v_vent, v_dur, case when c.area = 'direccion' then 'confirmada' else 'propuesta' end, 0,
            'inst-' || v_id || '@al3d.mx', coalesce(p_op ->> 'notas', ''), c.usuario_id);
    if r.accion = 'escribir' and r.sello_nuevo > 0 then update public.proyectos set sellos = sellos || pg_catalog.jsonb_build_object('instalacion', r.sello_nuevo) where id = p.id; end if;
    select * into v_final from public.instalaciones x where x.empresa_id = c.empresa_id and x.id = v_id;
    v_accion := 'agendo';
  else
    -- CASO B: existe (la de ese id, o la viva del proyecto)
    v_cambio_cita := (v_fecha, v_hora) is distinct from (e.fecha, e.hora);
    v_cambio := v_cambio_cita or (v_vent, v_dur) is distinct from (e.ventana, e.duracion_min);
    v_nuevo := coalesce(v_estado, case when v_cambio_cita then (case when e.estado = 'hecha' then 'hecha' else 'reagendada' end) else e.estado end);
    v_cancela := v_nuevo = 'cancelada' and e.estado <> 'cancelada';
    if v_cambio_cita or v_cancela then
      select * into r from interno.compuerta((p.sellos ->> 'instalacion')::bigint, pg_catalog.jsonb_build_object('instalacion', v_sello), 'instalacion', v_ahora, false, true);      -- 0014: la compuerta de siempre (gana el más reciente)
      if r.accion = 'viejo' then      -- otro teléfono la movió después: no es un error, y el teléfono recibe lo vigente
        return pg_catalog.jsonb_build_object('ok', true, 'viejos', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'instalacion', 'por', r.motivo)),
                                             'instalacion', pg_catalog.to_jsonb(e), 'id_canonico', e.id);
      end if;
      v_sello_nuevo := r.sello_nuevo;
    end if;
    v_movida := e.movida + (case when v_cambio then 1 else 0 end) + (case when v_cancela then 1 else 0 end);       -- cancelar SUBE movida; nunca baja
    v_notas := case when v_anexo = '' then e.notas when e.notas = '' then v_anexo else e.notas || E'\n' || v_anexo end;
    update public.instalaciones set fecha = v_fecha, hora = v_hora, ventana = v_vent, duracion_min = v_dur, estado = v_nuevo, movida = v_movida, notas = v_notas
     where empresa_id = e.empresa_id and id = e.id;
    if v_sello_nuevo is not null and v_sello_nuevo > 0 then update public.proyectos set sellos = sellos || pg_catalog.jsonb_build_object('instalacion', v_sello_nuevo) where id = p.id; end if;
    select * into v_final from public.instalaciones x where x.empresa_id = e.empresa_id and x.id = e.id;
    v_accion := case when v_cancela then 'cancelo' when v_cambio_cita then 'reagendo' when v_nuevo <> e.estado then 'marco' else 'agendo' end;
  end if;
  -- acoplamiento instalación ↔ etapa (transición automática 1): hecha + Dirección + etapa por debajo de «instalado» → instalado
  if v_final.estado = 'hecha' and c.area = 'direccion' then
    select * into v_p2 from public.proyectos x where x.id = p.id;
    v_ord := interno.orden_etapa(v_p2.etapa);
    if v_ord is not null and v_ord < 5 then perform interno.mover_etapa_core(v_p2, 'instalado', v_ahora, 'manual', 'Instalación hecha', c); end if;
  end if;
  perform interno.anotar(c, 'general', v_accion, 'instalacion', v_final.id, 'Cita de ' || p.nombre || ' (' || v_final.fecha::text || ')',
                         'Estado: ' || v_final.estado,
                         case when v_hay_e and e.id is not null then pg_catalog.jsonb_build_object('fecha', e.fecha, 'estado', e.estado) end,
                         pg_catalog.jsonb_build_object('fecha', v_final.fecha, 'estado', v_final.estado));
  return pg_catalog.jsonb_build_object('ok', true, 'instalacion', pg_catalog.to_jsonb(v_final), 'id_canonico', v_final.id, 'viejos', v_viejos);
end $$;
revoke all on function public.instalacion_guardar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.instalacion_guardar(jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 3. Lo que solo servía a la prioridad de Dirección, fuera
-- -----------------------------------------------------------------------------------------------------
-- Primero el trigger (llama a area_actual), después las funciones, al final la columna. Nada de esto lo llama ya ninguna RPC: las tres de
-- arriba se reemplazaron antes de borrar.
drop trigger if exists proyectos_sellos_autor on public.proyectos;
drop function if exists interno.proyectos_sellos_autor();
drop function if exists interno.compuerta_con_autor(bigint, jsonb, text, bigint, boolean, boolean, text);
drop function if exists interno.holgura_sello_ms();
drop function if exists interno.area_actual();
alter table public.proyectos drop column if exists sellos_area;


-- -----------------------------------------------------------------------------------------------------
-- 4. La aduana otra vez: lo nuevo no puede dejar nada abierto
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0014): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
