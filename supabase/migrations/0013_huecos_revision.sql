-- =====================================================================================================
-- 0013_huecos_revision.sql — cierra los hallazgos «Abierto, a propósito» de la revisión adversarial
-- =====================================================================================================
-- docs/ESTADO-SUPABASE.md (sección «Revisión adversarial del SQL») dejó abiertos, porque todo está apagado, seis huecos de severidad
-- media o baja que BLOQUEAN encender la subida única, la fase de almacén y los sellos. Esta migración los cierra. Cada arreglo tiene su
-- prueba en supabase/tests/rls-y-dinero/huecos-revision.mjs, que FALLA sin este archivo y pasa con él.
--
--   H-1  subida_unica · bitácora   El servidor pone `usuario_texto` (el correo verificado de quien sube), `rol` (su área real) y `ts` (now());
--                                  lo que el teléfono dijo de su hora queda en `procedencia.ts_cliente`, como dato declarado. El `op_id` lleva
--                                  el uid de quien sube: «tel:<uid>:<disp>:<id>» (antes «tel:<disp>:<id>», que cualquiera podía ocupar
--                                  antes que el teléfono dueño). Lo que manda el teléfono en `usuario` y `rol` se ignora.
--   H-2  subida_unica · cotizaciones Una entrada del historial ya NO nace `autorizada` por decirlo el teléfono: solo si en `autorizaciones` hay
--                                  una fila `vigente` de ese folio global cuyo código es el del sello local. Si no, nace `retirada` (ni
--                                  autorizada ni esperando a Dirección) y `procedencia.sin_sello_valido = true`; el sello local se conserva.
--   H-3  sellos (Q-06)             DECISIÓN PROVISIONAL, la confirma o la cambia Elías: (a) la holgura hacia el futuro de un sello baja de
--                                  10 min a 60 s para Fabricación, Pagos y lo que no viene de una RPC; Dirección conserva los 10 min; (b) ante
--                                  un conflicto, Dirección GANA cuando el sello guardado lo puso Fabricación o Pagos: su cambio se escribe con
--                                  el sello guardado + 1 ms. Contra otro teléfono de Dirección, o contra un sello de origen desconocido (la
--                                  importación), sigue «gana el más reciente». Para saber quién puso cada sello, `proyectos.sellos_area`
--                                  ({grupo: área}) lo llena un trigger con el área que fijó el preámbulo de la RPC.
--   H-4  almacen_movimientos.ts    Tope: no más de 1 día en el futuro respecto de now(). Lo impone un trigger (para la RPC Y para el importador);
--                                  `almacen_aplicar` lo contesta como DATO_INVALIDO (definitivo).
--   H-5  requerimientos            Pagos ya no CREA un requerimiento: solo marca `estado` de uno que existe (ROL_SIN_PERMISO si no existe).
--   H-6  tablas temporales         Se le quita a `authenticated` (y a `anon`) el privilegio TEMPORARY sobre la base: se revoca de PUBLIC y se le
--                                  devuelve a cada rol que ya existía, salvo esos dos. Si el rol que corre la migración no puede (en Supabase
--                                  `postgres` no es superusuario y puede no ser dueño de la base), NO aborta: avisa con un NOTICE y la prueba de
--                                  humo lo dice (caso C30). Ver docs/supabase/NOTAS-SEGUNDA-ENTREGA-SERVIDOR.md.
--
-- Lo que NO se hace aquí, a propósito (documentado en las notas): los de severidad «baja» que dependen de dar de alta una SEGUNDA empresa
-- (ids y contadores globales, `folio_cot:*` sin tope, invitación cruzada), la lista blanca de `origen_obra` y la hoja espejo fuera de RLS.
--
-- Cómo cambia lo que ya existía (copias íntegras con el cambio marcado «0013:», el mismo patrón de 0012):
--   · interno.preambulo         además fija `al3d.area` (GUC local a la transacción) con el área de quien llama;
--   · interno.sello_valido      la holgura depende de `al3d.area` (stable, ya no immutable); interno.sellos_limpios y interno.compuerta, stable;
--   · interno.compuerta_con_autor (nueva) = la compuerta + la prioridad de Dirección; la usan mover_etapa, proyecto_actualizar e
--     instalacion_guardar (copias de 0006 con esa única línea cambiada);
--   · interno.proyecto_remoto   no devuelve `sellos_area` (el contrato con el teléfono no cambia);
--   · public.subida_unica       (copia de 0008) H-1 y H-2;   · public.almacen_aplicar (copia de 0005) H-5.
--
-- Depende de: 0001…0012. Idempotente (create or replace, if not exists, drop … if exists). Termina corriendo la auditoría de 0011: si algo
-- quedó abierto, aborta como ella.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. El área de quien llama, para la transacción (H-3)
-- -----------------------------------------------------------------------------------------------------
-- `al3d.area` es un parámetro LOCAL a la transacción: lo fija el preámbulo de cada RPC de cliente con el área que salió de `miembros` (nunca
-- del cliente: PostgREST no deja fijar parámetros que no sean `request.*`, y aunque alguien lo hiciera, el preámbulo lo pisa antes de cualquier
-- escritura). Una escritura que no pasa por el preámbulo (service_role, el importador, un superusuario) lo ve vacío: área desconocida.
create or replace function interno.preambulo(p_empresa text, p_areas text[], out c interno.contexto_t, out e jsonb)
language plpgsql volatile set search_path = '' as $$
begin
  e := interno.guardia_contrato();
  if e is not null then return; end if;
  c := interno.ctx(p_empresa);
  if    c.motivo = 'acceso_revocado'  then e := interno.err('ACCESO_REVOCADO',   'Tu acceso a esta empresa ya no está activo.');
  elsif c.motivo = 'sin_acceso'       then e := interno.err('SIN_ACCESO',        'Esta cuenta no tiene acceso. Pídele a Dirección que te agregue.');
  elsif c.motivo = 'empresa_requerida' then e := interno.err('EMPRESA_REQUERIDA', 'Tienes acceso a varias empresas: indica con cuál trabajar.');
  elsif c.motivo <> 'ok' or c.area is null or not (c.area = any (p_areas)) then e := interno.err('ROL_SIN_PERMISO', 'No tienes permiso para esto.');
  end if;
  -- 0013: el área de quien llama queda para la transacción (la usan la holgura de los sellos y el trigger de `sellos_area`)
  perform pg_catalog.set_config('al3d.area', case when e is null then c.area else '' end, true);
end $$;
revoke all on function interno.preambulo(text, text[]) from public, anon, authenticated, service_role;

-- El área que fijó el preámbulo en ESTA transacción, o NULL.
create or replace function interno.area_actual() returns text language sql stable set search_path = '' as $$
  select nullif(pg_catalog.current_setting('al3d.area', true), '') $$;
revoke all on function interno.area_actual() from public, anon, authenticated, service_role;

-- Cuánto puede adelantarse un sello al reloj del servidor (H-3a, PROVISIONAL): Dirección 10 min (lo de siempre, SELLO_HOLGURA_MS del .gs);
-- todos los demás —y lo que no trae área— 60 s. Un reloj de taller adelantado ya no «congela» un campo por diez minutos.
create or replace function interno.holgura_sello_ms() returns bigint language sql stable set search_path = '' as $$
  select case when interno.area_actual() = 'direccion' then 600000 else 60000 end::bigint $$;
revoke all on function interno.holgura_sello_ms() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. Sellos: la holgura por área y la prioridad de Dirección (H-3)
-- -----------------------------------------------------------------------------------------------------
-- La misma función de 0001; solo cambia el tope (`ahora + holgura_sello_ms()`) y por eso deja de ser immutable.
create or replace function interno.sello_valido(p_x jsonb, p_ahora_ms bigint) returns bigint
language plpgsql stable set search_path = '' as $$
declare n numeric;
begin
  if p_x is null or pg_catalog.jsonb_typeof(p_x) not in ('number','string') then return 0; end if;
  begin n := floor((p_x #>> '{}')::numeric); exception when others then return 0; end;
  if n is null or n in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) or n <= 0 then return 0; end if;
  return least(n, (p_ahora_ms + interno.holgura_sello_ms())::numeric)::bigint;      -- 0013: antes `p_ahora_ms + 600000` para todos
end $$;
revoke all on function interno.sello_valido(jsonb, bigint) from public, anon, authenticated, service_role;

-- La compuerta de 0001, igual (la usa el almacén); solo pasa a stable porque `sello_valido` ya lo es.
create or replace function interno.compuerta(p_tiene bigint, p_sellos_op jsonb, p_grupo text, p_ahora_ms bigint,
                                             p_vacio boolean, p_borrable boolean)
returns table (accion text, sello_nuevo bigint, motivo text)
language plpgsql stable set search_path = '' as $$
begin
  return query select * from interno.compuerta_con_autor(p_tiene, p_sellos_op, p_grupo, p_ahora_ms, p_vacio, p_borrable, null);
end $$;

-- La compuerta con el AUTOR del sello guardado (el área que lo puso, de `proyectos.sellos_area`). Es la regla de 0001 más una excepción:
--   · Dirección llega con un sello (> 0) MÁS VIEJO que el guardado, y el guardado lo puso Fabricación o Pagos → Dirección GANA: se escribe, y el
--     sello nuevo es el guardado + 1 ms (sube, como siempre; y un reintento del teléfono bajo con el mismo sello ya no empata).
--   · Todo lo demás, idéntico: el más reciente gana, el empate escribe, vacío sin sello no borra, etapa y entrega no se vacían.
-- La excepción NO aplica si el guardado es de Dirección (otro teléfono suyo: gana el más reciente) ni si su autor es desconocido (importación).
create or replace function interno.compuerta_con_autor(p_tiene bigint, p_sellos_op jsonb, p_grupo text, p_ahora_ms bigint,
                                                       p_vacio boolean, p_borrable boolean, p_autor_tiene text)
returns table (accion text, sello_nuevo bigint, motivo text)
language plpgsql stable set search_path = '' as $$
declare v_tiene bigint := coalesce(p_tiene, 0);
        v_llega bigint := interno.sello_valido(p_sellos_op -> p_grupo, p_ahora_ms);
        v_prioridad boolean;
begin
  v_prioridad := v_tiene > 0 and v_llega > 0 and v_llega < v_tiene
                 and interno.area_actual() = 'direccion' and coalesce(p_autor_tiene, '') in ('fabricacion', 'pagos');
  if v_tiene > 0 and v_llega < v_tiene and not v_prioridad then
    return query select 'viejo'::text, v_tiene, 'ya tenía un cambio más reciente'::text; return;
  end if;
  if p_vacio and v_llega = 0 then
    return query select 'rechazar'::text, v_tiene, 'vacío sin sello no borra'::text; return;
  end if;
  if p_vacio and not p_borrable then
    return query select 'rechazar'::text, v_tiene, 'este dato no se puede vaciar'::text; return;
  end if;
  if v_prioridad then
    return query select 'escribir'::text, v_tiene + 1, null::text; return;
  end if;
  return query select 'escribir'::text, greatest(v_tiene, v_llega), null::text;
end $$;
revoke all on function interno.compuerta_con_autor(bigint, jsonb, text, bigint, boolean, boolean, text) from public, anon, authenticated, service_role;
revoke all on function interno.compuerta(bigint, jsonb, text, bigint, boolean, boolean) from public, anon, authenticated, service_role;

-- `sellos_limpios` (las altas) llama a `sello_valido`: pasa a stable con ella. `proyecto_remoto` deja fuera `sellos_area`.
create or replace function interno.sellos_limpios(p_sellos jsonb, p_ahora bigint) returns jsonb language plpgsql stable set search_path = '' as $$
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
  select pg_catalog.to_jsonb(p) - 'origen_obra' - 'procedencia' - 'sellos_area' from public.proyectos p where p.id = p_id $$;
revoke all on function interno.proyecto_remoto(text) from public, anon, authenticated, service_role;

-- Quién puso cada sello de un proyecto. La llena el trigger de abajo (nadie la escribe a mano): en cada INSERT o UPDATE, cada grupo cuyo sello
-- CAMBIÓ queda con el área de la transacción, o sin entrada si no hay área (importación, service_role). La leen las RPC de obra; el teléfono
-- no la recibe en `remoto` (sí puede leerla por la tabla: son nombres de área, no dinero).
alter table public.proyectos add column if not exists sellos_area jsonb not null default '{}'::jsonb check (jsonb_typeof(sellos_area) = 'object');

-- SECURITY DEFINER, como interno.movimiento_seq de 0005: el importador (service_role) escribe directo y no tiene, ni debe tener, EXECUTE sobre area_actual.
create or replace function interno.proyectos_sellos_autor() returns trigger language plpgsql security definer set search_path = '' as $$
declare g text; v jsonb := coalesce(new.sellos_area, '{}'::jsonb); v_area text := interno.area_actual();
begin
  if tg_op = 'UPDATE' and new.sellos is not distinct from old.sellos then return new; end if;
  for g in select k from pg_catalog.jsonb_object_keys(coalesce(new.sellos, '{}'::jsonb)) k loop
    if tg_op = 'INSERT' or (new.sellos -> g) is distinct from (old.sellos -> g) then
      v := case when v_area is null then v - g else v || pg_catalog.jsonb_build_object(g, v_area) end;
    end if;
  end loop;
  new.sellos_area := v;
  return new;
end $$;
revoke all on function interno.proyectos_sellos_autor() from public, anon, authenticated, service_role;

drop trigger if exists proyectos_sellos_autor on public.proyectos;
create trigger proyectos_sellos_autor before insert or update on public.proyectos for each row execute function interno.proyectos_sellos_autor();


-- -----------------------------------------------------------------------------------------------------
-- 3. Las tres RPC de obra que deciden con sellos: copias de 0006 con la compuerta con autor (H-3b)
-- -----------------------------------------------------------------------------------------------------
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
  select * into r from interno.compuerta_con_autor((p.sellos ->> 'etapa')::bigint, pg_catalog.jsonb_build_object('etapa', p_sello), 'etapa', interno.ahora_ms(), false, false,
                                                 p.sellos_area ->> 'etapa');      -- 0013: con el autor del sello guardado
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
    select * into r from interno.compuerta_con_autor((v_sel ->> g)::bigint, v_sellos, g, v_ahora, v_vacio, v_borrable, p.sellos_area ->> g);      -- 0013: con el autor
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
    select * into r from interno.compuerta_con_autor((p.sellos ->> 'instalacion')::bigint, pg_catalog.jsonb_build_object('instalacion', v_sello), 'instalacion', v_ahora, false, true,
                                                   p.sellos_area ->> 'instalacion');      -- 0013: con el autor
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
      select * into r from interno.compuerta_con_autor((p.sellos ->> 'instalacion')::bigint, pg_catalog.jsonb_build_object('instalacion', v_sello), 'instalacion', v_ahora, false, true,
                                                   p.sellos_area ->> 'instalacion');      -- 0013: con el autor
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
-- 4. subida_unica: el servidor pone quién, cuándo y con qué rol; nada nace autorizado sin sello (H-1, H-2)
-- -----------------------------------------------------------------------------------------------------
-- Copia de 0008 con dos cambios, marcados «0013:».
--   · cotizaciones del historial: `autorizada` SOLO si `autorizaciones` tiene la fila `vigente` de ese folio global y su código es el del sello local
--     (`e.sello.codigo`, comparado sin guiones ni mayúsculas); entonces queda con su `autorizacion_id`. Si no, `retirada` y
--     `procedencia.sin_sello_valido = true`. La base no puede comprobar la firma (no tiene la clave): exige que el sello EXISTA del lado del servidor.
--     Cuando el importador cargue «Autorizaciones» DESPUÉS de una subida, su pasada de vínculo (DISENO.md §2.9) debe poner `autorizada` las que
--     enlace con una `vigente`: queda escrito en las notas.
--   · bitácora: `usuario_texto` = correo verificado de quien sube, `rol` = su área, `ts` = now(), `op_id` = 'tel:<uid>:<disp>:<id>'.
create or replace function public.subida_unica(p_lote jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; v_disp text; v_acuse jsonb := '[]'::jsonb; e jsonb; q jsonb; b jsonb; k text; v jsonb; v_max bigint := 0; v_n bigint; v_disp_e text; v_fg text; co public.cotizaciones;
  v_datos jsonb; v_inferido boolean; v_creadas int := 0; v_ya int := 0; v_conf int := 0; v_rech int := 0; v_cot jsonb; v_corr text := coalesce(interno.correo_verificado(), '');
  v_nivel text; v_ts timestamptz; v_ent text; v_cnt int; v_folio text; v_motivo text; v_idb text; v_nota text; v_hitos jsonb;
  v_aut public.autorizaciones; v_cod_local text; v_valido boolean; v_ts_cliente timestamptz;      -- 0013
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  c := pre.c;
  if pg_catalog.jsonb_typeof(p_lote) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'El lote está mal formado.'); end if;
  v_disp := nullif(p_lote ->> 'disp', '');
  if v_disp is not null and v_disp !~ '^[A-Za-z0-9_-]{1,24}$' then return interno.err('DATO_INVALIDO', 'El aparato del lote no es válido.'); end if;
  for k in select unnest(array['cotizaciones', 'cola', 'bitacora']) loop
    if p_lote ? k and pg_catalog.jsonb_typeof(p_lote -> k) not in ('array', 'null') then return interno.err('DATO_INVALIDO', 'El lote está mal formado: «' || k || '» debe ser una lista.'); end if;
  end loop;
  for k in select unnest(array['hitos', 'canva', 'cuadernos']) loop
    if p_lote ? k and pg_catalog.jsonb_typeof(p_lote -> k) not in ('object', 'null') then return interno.err('DATO_INVALIDO', 'El lote está mal formado: «' || k || '» debe ser un objeto.'); end if;
  end loop;
  if pg_catalog.jsonb_array_length(coalesce(nullif(p_lote -> 'cotizaciones', 'null'::jsonb), '[]'::jsonb)) > 50
     or pg_catalog.jsonb_array_length(coalesce(nullif(p_lote -> 'cola', 'null'::jsonb), '[]'::jsonb)) > 50
     or pg_catalog.jsonb_array_length(coalesce(nullif(p_lote -> 'bitacora', 'null'::jsonb), '[]'::jsonb)) > 200 then
    return interno.err('DATO_INVALIDO', 'El lote excede el tope (50 cotizaciones, 50 de la cola y 200 de bitácora).'); end if;
  v_max := coalesce(interno.num(p_lote -> 'folio_max'), 0);
  if v_max < 0 or v_max > 1000000000 then return interno.err('DATO_INVALIDO', 'El folio máximo del aparato no es válido.'); end if;
  v_hitos := coalesce(nullif(p_lote -> 'hitos', 'null'::jsonb), '{}'::jsonb);
  -- 1. el contador del aparato: el mayor entre lo que ya tiene, el `folio_max` y el número más alto de la cola (también los renglones «fantasma»: autorizada + q nulo)
  for q in select x.value from pg_catalog.jsonb_array_elements(coalesce(nullif(p_lote -> 'cola', 'null'::jsonb), '[]'::jsonb)) x loop
    if pg_catalog.jsonb_typeof(q) = 'object' then
      v_folio := pg_catalog.substring(coalesce(q ->> 'folio', ''), '[0-9]+');
      if v_folio is not null and pg_catalog.length(v_folio) <= 9 and v_folio::bigint > v_max then v_max := v_folio::bigint; end if;
    end if;
  end loop;
  if v_disp is not null then
    insert into public.contadores as ct (empresa_id, clave, ventana, n) values ('*', 'folio_cot:' || v_disp, '', v_max)
    on conflict (empresa_id, clave, ventana) do update set n = greatest(ct.n, excluded.n), updated_at = clock_timestamp();
  end if;
  -- 2. las cotizaciones del historial
  for e in select x.value from pg_catalog.jsonb_array_elements(coalesce(nullif(p_lote -> 'cotizaciones', 'null'::jsonb), '[]'::jsonb)) x loop
    v_folio := case when pg_catalog.jsonb_typeof(e) = 'object' then e ->> 'folio' end;
    if v_folio is null or v_folio !~ '^[A-Za-z0-9-]{1,24}$' then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', coalesce(v_folio, ''), 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO'));
      v_rech := v_rech + 1; continue;
    end if;
    v_inferido := false;                              -- solo se INFIERE cuando no hay de dónde sacar el aparato (abajo): el del sello y el del lote son exactos
    v_disp_e := coalesce(nullif(e ->> 'disp', ''), nullif(pg_catalog.split_part(coalesce(e #>> '{sello,folio}', ''), '@', 2), ''), v_disp);
    if v_disp_e is null then
      v_disp_e := 'HIST' || pg_catalog.left(pg_catalog.md5(v_folio || coalesce(e ->> 'cliente', '') || coalesce(e ->> 'fecha', '')), 6); v_inferido := true; end if;
    v_fg := v_folio || '@' || v_disp_e;
    v_datos := interno.datos_cotizacion(e);
    if v_disp_e !~ '^[A-Za-z0-9_-]{1,24}$' or pg_catalog.length(v_datos::text) > 200000 then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_folio, 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO'));
      v_rech := v_rech + 1; continue;
    end if;
    select * into co from public.cotizaciones x where x.empresa_id = c.empresa_id and x.folio_global = v_fg for update;
    if not found then
      -- 0013 (H-2): «autorizada» solo con la fila vigente del servidor y el MISMO código que el sello local; si no, «retirada»
      v_cod_local := pg_catalog.upper(pg_catalog.regexp_replace(coalesce(case when pg_catalog.jsonb_typeof(e -> 'sello') = 'object' then e #>> '{sello,codigo}' end, ''), '[^0-9A-Fa-f]', '', 'g'));
      select * into v_aut from public.autorizaciones a where a.empresa_id = c.empresa_id and a.folio_global = v_fg and a.estado = 'vigente';
      v_valido := found and pg_catalog.length(v_cod_local) = 12 and pg_catalog.replace(v_aut.codigo, '-', '') = v_cod_local;
      insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos, hitos, procedencia, autorizacion_id)
      values (c.empresa_id, v_fg, v_folio, v_disp_e, c.usuario_id, case when v_valido then 'autorizada' else 'retirada' end, v_datos,
              coalesce(v_hitos -> v_folio, '{}'::jsonb) || case when pg_catalog.jsonb_typeof(p_lote -> 'canva' -> v_folio) = 'object'
                                                               then pg_catalog.jsonb_build_object('propuesta', p_lote -> 'canva' -> v_folio) else '{}'::jsonb end,
              pg_catalog.jsonb_build_object('telefonos', case when v_disp is null then '[]'::jsonb else pg_catalog.jsonb_build_array(v_disp) end,
                                            'sello_local', e -> 'sello', 'disp_inferido', v_inferido, 'subida_unica', now())
              || case when v_valido then '{}'::jsonb else '{"sin_sello_valido": true}'::jsonb end,
              case when v_valido then v_aut.id end);
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'creada')); v_creadas := v_creadas + 1;
    elsif c.area <> 'direccion' and co.creado_por is distinct from c.usuario_id then      -- se decide PRIMERO: lo ajeno no se compara ni se revela
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'rechazada', 'motivo', 'ROL_SIN_PERMISO')); v_rech := v_rech + 1;
    elsif interno.datos_cotizacion(co.datos) = v_datos then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'ya_estaba')); v_ya := v_ya + 1;
    else      -- datos distintos: NO se sobrescribe; se anota qué teléfono la trae
      if v_disp is not null and not (coalesce(co.procedencia -> 'telefonos', '[]'::jsonb) ? v_disp) then
        update public.cotizaciones set procedencia = pg_catalog.jsonb_set(procedencia, '{telefonos}', coalesce(procedencia -> 'telefonos', '[]'::jsonb) || pg_catalog.to_jsonb(v_disp))
         where empresa_id = c.empresa_id and folio_global = v_fg;
      end if;
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cotizacion', 'id', v_fg, 'estado', 'conflicto', 'motivo', 'Los datos son distintos de los que ya hay: no se sobrescribe.'));
      v_conf := v_conf + 1;
    end if;
  end loop;
  -- 3. la cola de pendientes: crea la cotización y la solicitud `pendiente`; los «fantasma» (sin `q`) solo aportaron su folio al contador
  for q in select x.value from pg_catalog.jsonb_array_elements(coalesce(nullif(p_lote -> 'cola', 'null'::jsonb), '[]'::jsonb)) x loop
    v_folio := case when pg_catalog.jsonb_typeof(q) = 'object' then q ->> 'folio' end;
    if v_folio is null or v_folio !~ '^[A-Za-z0-9-]{1,24}$' then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', coalesce(v_folio, ''), 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO'));
      v_rech := v_rech + 1; continue;
    end if;
    if q ->> 'estado' is distinct from 'pendiente' or pg_catalog.jsonb_typeof(q -> 'q') is distinct from 'object' then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', v_folio, 'estado', 'ya_estaba', 'motivo', 'Sin datos que subir.')); v_ya := v_ya + 1; continue;
    end if;
    if v_disp is null then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', v_folio, 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO'));
      v_rech := v_rech + 1; continue;
    end if;
    v_fg := v_folio || '@' || v_disp;
    v_cot := interno.limpiar_cotizacion(q -> 'q');
    if v_cot ? 'error' then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', v_fg, 'estado', 'rechazada', 'motivo', v_cot ->> 'error')); v_rech := v_rech + 1; continue;
    end if;
    if exists (select 1 from public.cotizaciones x where x.empresa_id = c.empresa_id and x.folio_global = v_fg)
       or exists (select 1 from public.solicitudes x where x.empresa_id = c.empresa_id and x.folio_global = v_fg and x.estado = 'pendiente') then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', v_fg, 'estado', 'ya_estaba')); v_ya := v_ya + 1; continue;
    end if;
    insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos, procedencia)
    values (c.empresa_id, v_fg, v_folio, v_disp, c.usuario_id, 'pendiente',
            pg_catalog.jsonb_build_object('proy', v_cot ->> 'proyecto', 'cliente', v_cot ->> 'cliente', 'iva', v_cot -> 'iva', 'subtotal', v_cot -> 'subtotal', 'items', v_cot -> 'items'),
            pg_catalog.jsonb_build_object('telefonos', pg_catalog.jsonb_build_array(v_disp), 'subida_unica', now()));
    insert into public.solicitudes (empresa_id, folio_global, proyecto, cliente, subtotal, iva, cotizacion, solicito_id, solicito_texto, estado, nota, procedencia)
    values (c.empresa_id, v_fg, v_cot ->> 'proyecto', v_cot ->> 'cliente', (v_cot ->> 'subtotal')::numeric, (v_cot ->> 'iva')::boolean, v_cot, c.usuario_id, v_corr, 'pendiente',
            pg_catalog.left(coalesce(q ->> 'nota', ''), 500), pg_catalog.jsonb_build_object('subida_unica', now()));
    v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cola', 'id', v_fg, 'estado', 'creada')); v_creadas := v_creadas + 1;
  end loop;
  -- 4a. los cuadernos de cliente (la nota es POR AUTOR; una distinta de la que ya hay no se sobrescribe)
  for k, v in select x.key, x.value from pg_catalog.jsonb_each(coalesce(nullif(p_lote -> 'cuadernos', 'null'::jsonb), '{}'::jsonb)) x loop
    if k !~ '^(tel:[0-9]{10}|nom:.{1,200})$' or pg_catalog.jsonb_typeof(v) <> 'string' or pg_catalog.length(v #>> '{}') > 1200 then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cuaderno', 'id', k, 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO')); v_rech := v_rech + 1; continue;
    end if;
    v_nota := null;
    select n.nota into v_nota from public.cuaderno_notas n where n.empresa_id = c.empresa_id and n.clave = k and n.autor_id = c.usuario_id and n.deleted_at is null;
    if v_nota is null then
      insert into public.cuaderno_notas (empresa_id, clave, autor_id, nota) values (c.empresa_id, k, c.usuario_id, v #>> '{}')
      on conflict (empresa_id, clave, autor_id) do update set nota = excluded.nota, deleted_at = null;
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cuaderno', 'id', k, 'estado', 'creada')); v_creadas := v_creadas + 1;
    elsif v_nota = v #>> '{}' then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cuaderno', 'id', k, 'estado', 'ya_estaba')); v_ya := v_ya + 1;
    else
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'cuaderno', 'id', k, 'estado', 'conflicto', 'motivo', 'Ya hay otra nota: no se sobrescribe.')); v_conf := v_conf + 1;
    end if;
  end loop;
  -- 4b. la bitácora local: idempotente por op_id; el nivel sale de una LISTA BLANCA de acciones sin importes (etapa y agenda → general); todo lo demás es de dinero
  --     porque `ganar` anota precio y anticipo en el detalle y `actualizar` guarda antes/después de la cuenta y los anticipos
  for b in select x.value from pg_catalog.jsonb_array_elements(coalesce(nullif(p_lote -> 'bitacora', 'null'::jsonb), '[]'::jsonb)) x loop
    v_idb := case when pg_catalog.jsonb_typeof(b) = 'object' then nullif(b ->> 'id', '') end;
    if v_idb is null or v_disp is null or pg_catalog.length(v_idb) > 100 then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'bitacora', 'id', coalesce(v_idb, ''), 'estado', 'rechazada', 'motivo', 'DATO_INVALIDO')); v_rech := v_rech + 1; continue;
    end if;
    v_nivel := case when b ->> 'accion' in ('etapa', 'agendo', 'reagendo', 'marco', 'cancelo') then 'general' else 'dinero' end;
    v_ent := case when b ->> 'entidad' in ('proyecto','instalacion','material','constante','almacen','cotizacion','autorizacion','abono','venta','miembro','plataforma','sistema')
                  then b ->> 'entidad' else 'plataforma' end;
    -- 0013 (H-1): la hora es la del servidor; la que dice el teléfono queda en procedencia.ts_cliente si es una fecha razonable (2020 … mañana)
    v_ts := now(); v_ts_cliente := null;
    begin
      if pg_catalog.jsonb_typeof(b -> 'ts') = 'number' and (b ->> 'ts')::numeric > 0 then v_ts_cliente := pg_catalog.to_timestamp(((b ->> 'ts')::numeric) / 1000.0);
      elsif pg_catalog.jsonb_typeof(b -> 'ts') = 'string' then v_ts_cliente := (b ->> 'ts')::timestamptz; end if;
    exception when others then v_ts_cliente := null; end;
    if v_ts_cliente is not null and (v_ts_cliente < '2020-01-01'::timestamptz or v_ts_cliente > now() + interval '1 day') then v_ts_cliente := null; end if;
    insert into public.bitacora (empresa_id, ts, nivel, accion, entidad, entidad_id, titulo, detalle, antes, despues, usuario_id, usuario_texto, rol, dispositivo, op_id, procedencia)
    values (c.empresa_id, v_ts, v_nivel, coalesce(nullif(pg_catalog.left(b ->> 'accion', 80), ''), 'subida'), v_ent, pg_catalog.left(coalesce(b ->> 'entidad_id', ''), 200),
            pg_catalog.left(coalesce(nullif(pg_catalog.btrim(b ->> 'titulo'), ''), 'Evento de un teléfono'), 200), pg_catalog.left(coalesce(b ->> 'detalle', ''), 600),
            case when pg_catalog.jsonb_typeof(b -> 'antes') in ('object', 'array') then b -> 'antes' end, case when pg_catalog.jsonb_typeof(b -> 'despues') in ('object', 'array') then b -> 'despues' end,
            c.usuario_id, v_corr, c.area, v_disp, 'tel:' || c.usuario_id::text || ':' || v_disp || ':' || v_idb,      -- 0013 (H-1): quién, su área y el op_id con su uid
            pg_catalog.jsonb_build_object('subida_unica', true, 'sello', b -> 'sello')
              || case when v_ts_cliente is null then '{}'::jsonb else pg_catalog.jsonb_build_object('ts_cliente', v_ts_cliente) end)
    on conflict (empresa_id, op_id) where op_id is not null do nothing;
    get diagnostics v_cnt = row_count;
    if v_cnt = 1 then
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'bitacora', 'id', v_idb, 'estado', 'creada')); v_creadas := v_creadas + 1;
    else
      v_acuse := v_acuse || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('tipo', 'bitacora', 'id', v_idb, 'estado', 'ya_estaba')); v_ya := v_ya + 1;
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('ok', true, 'acuse', v_acuse,
           'resumen', pg_catalog.jsonb_build_object('creadas', v_creadas, 'ya_estaban', v_ya, 'conflictos', v_conf, 'rechazadas', v_rech));
end $$;
revoke all on function public.subida_unica(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.subida_unica(jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 5. Almacén: el sello de tiempo de un movimiento con tope (H-4) y Pagos sin altas de requerimientos (H-5)
-- -----------------------------------------------------------------------------------------------------
-- Un conteo con `ts` del año 2099 se queda como «el último conteo» para siempre: congela la existencia del material (nada posterior cuenta).
-- Tope: now() + 1 día (holgura para relojes y zonas). Vale para TODA escritura, también la del importador. SQLSTATE 22023: `almacen_aplicar`
-- lo contesta como DATO_INVALIDO (definitivo), no como DESCONOCIDO (que la bandeja reintentaría para siempre).
create or replace function interno.movimiento_ts_tope() returns trigger language plpgsql security definer set search_path = '' as $$      -- definer: service_role no ejecuta ahora_ms
begin
  if new.ts > interno.ahora_ms() + 86400000 then
    raise exception 'El sello de tiempo del movimiento está más de un día en el futuro' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function interno.movimiento_ts_tope() from public, anon, authenticated, service_role;

drop trigger if exists almacen_movimientos_ts_tope on public.almacen_movimientos;
create trigger almacen_movimientos_ts_tope before insert on public.almacen_movimientos for each row execute function interno.movimiento_ts_tope();

-- almacen_aplicar: copia de 0005 con una guarda ANTES de cada operación: Pagos sobre un requerimiento que NO existe → ROL_SIN_PERMISO
-- (definitivo). Sobre uno que existe sigue la regla de 0005 (solo `estado` = 'consumido' con `campos` ⊆ {estado, folio_hoja}). Como los
-- requerimientos no se borran, lo que existe al mirar sigue existiendo cuando `almacen_una` lo vuelve a mirar con el candado.
create or replace function public.almacen_aplicar(p_ops jsonb, p_atomico boolean default false, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; op jsonb; v_res jsonb := '[]'::jsonb; v_r jsonb; v_fallo jsonb; v_estado text; v_reg text;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if pg_catalog.jsonb_typeof(p_ops) is distinct from 'array' then
    return interno.err('DATO_INVALIDO', 'Las operaciones del almacén deben ir en un arreglo.'); end if;
  if pg_catalog.jsonb_array_length(p_ops) > 25 then return interno.err('DATO_INVALIDO', 'Hasta 25 operaciones por lote.'); end if;
  begin
    for op in select e.value from pg_catalog.jsonb_array_elements(p_ops) e loop
      begin
        -- 0013 (H-5): Pagos no CREA requerimientos; solo marca el estado de uno que ya existe
        v_reg := case when pg_catalog.jsonb_typeof(op) = 'object' then pg_catalog.btrim(coalesce(op ->> 'registro_id', op -> 'datos' ->> 'id', '')) end;
        if (pre.c).area = 'pagos' and pg_catalog.jsonb_typeof(op) = 'object' and op ->> 'almacen' = 'requerimientos' and pg_catalog.jsonb_typeof(op -> 'datos') = 'object'
           and v_reg is not null and v_reg <> ''
           and not exists (select 1 from public.requerimientos q where q.empresa_id = (pre.c).empresa_id and q.id = v_reg) then
          v_r := interno.almacen_error(op ->> 'id', 'ROL_SIN_PERMISO', 'Las listas de compra las crean Fabricación y Dirección; desde Pagos solo se marca lo que ya salió del almacén.');
        else
          v_r := interno.almacen_una(pre.c, op);
        end if;
      exception when others then
        get stacked diagnostics v_estado = returned_sqlstate;
        v_r := interno.almacen_error(case when pg_catalog.jsonb_typeof(op) = 'object' then op ->> 'id' end,
                 case when pg_catalog.left(v_estado, 2) in ('22', '23') then 'DATO_INVALIDO' else 'DESCONOCIDO' end,
                 case when pg_catalog.left(v_estado, 2) in ('22', '23') then 'La base no aceptó ese cambio: un dato no tiene el formato o los límites esperados.'
                      else 'No se pudo aplicar la operación; se reintenta.' end);
      end;
      v_res := v_res || pg_catalog.jsonb_build_array(v_r);
      if p_atomico and (v_r ->> 'ok')::boolean is not true then
        v_fallo := v_r;
        raise exception 'lote rechazado' using errcode = 'AL001';          -- deshace TODO lo que este bloque externo escribió
      end if;
    end loop;
  exception when sqlstate 'AL001' then
    return pg_catalog.jsonb_build_object('ok', false, 'codigo', 'LOTE_RECHAZADO', 'op_fallida', v_fallo ->> 'id', 'mensaje', v_fallo ->> 'mensaje',
                                         'definitivo', coalesce(v_fallo ->> 'codigo', '') in ('DATO_INVALIDO', 'ROL_SIN_PERMISO'));
  end;
  return pg_catalog.jsonb_build_object('ok', true, 'resultados', v_res);
end $$;
revoke all on function public.almacen_aplicar(jsonb, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.almacen_aplicar(jsonb, boolean, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 6. Tablas temporales (H-6)
-- -----------------------------------------------------------------------------------------------------
-- `authenticated` no necesita crear tablas temporales (escribe solo por RPC, y las RPC no las usan). En Postgres el privilegio TEMPORARY de la
-- base es de PUBLIC por omisión. Se revoca de PUBLIC y se le devuelve EXPLÍCITAMENTE a cada rol que ya existía (postgres, service_role,
-- authenticator, los de la plataforma…) menos `anon` y `authenticated`: nada de lo que hoy usa temporales lo pierde. Un rol que la plataforma
-- cree DESPUÉS no lo tendrá (riesgo aceptado y escrito en las notas).
-- Si quien corre esto no puede revocar (no es dueño de la base ni tiene el privilegio con GRANT OPTION), Postgres solo avisa; aquí se comprueba
-- el resultado y se deja un NOTICE en vez de abortar. La prueba de humo (H13) dice si quedó cerrado en el proyecto real.
do $temporales$
declare v_db text := pg_catalog.current_database(); r record;
begin
  begin
    execute pg_catalog.format('revoke temporary on database %I from public', v_db);
    for r in select rolname from pg_catalog.pg_roles
              where rolname not in ('anon', 'authenticated', 'public') and rolname !~ '^pg_' loop
      execute pg_catalog.format('grant temporary on database %I to %I', v_db, r.rolname);
    end loop;
    execute pg_catalog.format('revoke temporary on database %I from anon, authenticated', v_db);
  exception when insufficient_privilege then
    raise notice '0013: no se pudo cambiar el privilegio TEMPORARY de la base (%): authenticated sigue pudiendo crear tablas temporales', sqlerrm;
  end;
  if pg_catalog.has_database_privilege('authenticated', v_db, 'TEMPORARY') then
    raise notice '0013: authenticated TODAVÍA puede crear tablas temporales en %; ver docs/supabase/NOTAS-SEGUNDA-ENTREGA-SERVIDOR.md', v_db;
  end if;
end $temporales$;


-- -----------------------------------------------------------------------------------------------------
-- 7. La aduana otra vez: lo nuevo no puede dejar nada abierto
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0013): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
