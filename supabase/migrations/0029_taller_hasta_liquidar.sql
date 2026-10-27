-- =====================================================================================================
-- 0029_taller_hasta_liquidar.sql — las obras se quedan en el taller hasta LIQUIDADO, y Dirección puede ocultar las que nunca se van a cobrar
-- =====================================================================================================
-- Lo pidió Elías y lo decidió él (auditoría del 2026-10-26, T1-9), con sus palabras: «quiero que los proyectos que salen en fabricación se
-- queden en la tabla hasta que pasen a Liquidados; tengo proyectos que los instalo después de su fecha acordada y se quitan de la tabla». Eligió
-- «Hasta liquidar, con columna nueva». La causa: la transición automática 2 de 0007 (`interno.etapa_por_cobro`) daba por INSTALADA una venta
-- importada en cuanto pasaba a COBRANDO, y una obra en «Instalado» ya no sale en «El taller» del Tablero. Pero COBRANDO no quiere decir que se
-- instaló: Pagos pasa a cobrar en cuanto el trabajo está listo, a veces días antes de la instalación, y esa obra desaparecía de la tabla.
--
-- Y una segunda petición, del mismo día: «Berna - Merlacsa (Rotulacion Vehicular), Omar - M3 Arquitectos y Proyectos, Gamaliel - Tacos Taquería
-- son proyectos con los que quedé mal con el cliente, entonces probablemente nunca me liquiden; por favor ponles un botón para ocultar». Con las
-- obras en la tabla hasta LIQUIDADO, ésas se quedarían ahí para siempre.
--
-- QUÉ CAMBIA (las copias íntegras llevan el cambio marcado «0029:», el patrón de 0013–0028):
--   1. interno.etapa_por_cobro      solo LIQUIDADO da la obra por instalada. Sus tres llamadores no cambian: `registrar_cobro` (0028) marca
--                                   LIQUIDADO y la llama; `corregir_venta` (0007) la llama con COBRANDO o con LIQUIDADO, y ahora ella misma mira el
--                                   estatus que QUEDÓ y con COBRANDO no hace nada. La obra que se cobra sin instalarse sigue en su estación.
--   2. proyectos.oculto_taller      la columna nueva («Ocultar del taller»): `boolean not null default false`. Ocultar NO toca el dinero —ni el
--                                   estatus, ni el saldo, ni las comisiones, ni Control—: solo saca la obra de «El taller», de la cuenta del
--                                   Tablero, de sus avisos y de «Lo que viene» del Calendario (eso lo hace el teléfono) y de la pantalla del
--                                   taller (aquí, punto 5). Vale para todo el equipo: se guarda aquí y baja a cada teléfono con la obra.
--      interno.sellos_validos       la de 0001 con el grupo `oculto_taller`: ocultar lleva su sello como los demás datos de la obra (gana el
--                                   cambio más reciente, Q-06), así un teléfono con un «mostrar» viejo en la bandeja no la vuelve a sacar.
--   3. interno.matriz_permisos      la de 0028 con `oculto_taller` en lo que Dirección escribe por `proyecto_actualizar`. SOLO Dirección
--                                   (decisión por omisión de este frente): Fabricación y Pagos lo reciben en `rechazadas`, con su nombre.
--   4. public.proyecto_actualizar   la de 0014 con el grupo sellado `oculto_taller` (sí o no; jamás «vacío») y su propia línea en la bitácora:
--                                   «X se ocultó del taller» / «X volvió a mostrarse en el taller», con el antes y el después.
--   5. public.pantalla_tablero      la de 0022 sin las obras ocultas: la TV del taller tampoco las enseña.
--
-- Por qué `proyecto_actualizar` y no una RPC nueva: es la función que ya escribe los datos de la obra con su sello y su permiso por campo, el
-- teléfono ya la llama (js/datos/supa-traductor.js, `OBRA`) y la matriz que lee el teléfono (`mi_acceso().permisos`) ya decide con ella qué
-- se manda. Una RPC nueva habría pedido entrar a la lista cerrada de TODAS las versiones de `interno.auditoria()` (ver 0027).
--
-- QUIEN TOQUE LA MATRIZ DESPUÉS: la de esta migración es la vigente. Una migración posterior que redefina `interno.matriz_permisos()` tiene que
--   partir de ésta (con `oculto_taller` en Dirección), no de la de 0028, o Dirección deja de poder ocultar. Lo mismo `proyecto_actualizar`
--   (parte de ésta, no de la de 0014). supabase/tests/acceso/matriz.mjs fija la tabla y lo vería.
--
-- LA HOJA no sabe de esto, a propósito: con la hoja mandando el botón no sale (Elías: «con la hoja mandando no hace falta que funcione»). La
--   copia de cada 3 horas no escribe `oculto_taller` (no está en sus columnas) y la deja como esté.
--
-- LA AUDITORÍA: ninguna función, tabla, vista ni publicación nueva; ninguna firma cambia. Las listas cerradas de `interno.auditoria()` (la de
--   0027) siguen siendo correctas tal cual, y la aduana corre al final, como en cada migración.
--
-- Depende de: 0001…0028. Idempotente (add column if not exists, create or replace). Termina corriendo la auditoría.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. La transición automática 2: solo LIQUIDADO da la obra por instalada
-- -----------------------------------------------------------------------------------------------------
-- Copia de 0007 con el cambio marcado «0029:». Lo demás —solo filas importadas (`fuente` 'hoja' o 'manual', no históricas) entre «ganado» y
-- «listo», sin emitir salidas, con el sello de etapa de la hora del SERVIDOR (Q-A12) para que una operación vieja de la bandeja no la revierta—
-- es idéntico. Mira el estatus que tiene la fila AHORA: sus llamadores la llaman después de escribirlo.
create or replace function interno.etapa_por_cobro(p_id text, p_ctx interno.contexto_t) returns boolean language plpgsql set search_path = '' as $$
declare p public.proyectos; v_ord int;
begin
  select * into p from public.proyectos x where x.id = p_id;
  if not found then return false; end if;
  -- 0029: COBRANDO ya no mueve la etapa (auditoría 2026-10-26, T1-9). Pasar a cobrar no es haber instalado: la obra se queda en su estación
  --       del taller hasta que se instale de verdad (la cita «hecha» la mueve, 0017) o hasta que la venta se liquide.
  if p.estatus is distinct from 'LIQUIDADO' then return false; end if;
  v_ord := interno.orden_etapa(p.etapa);
  if p.fuente in ('hoja', 'manual') and not p.historica and v_ord is not null and v_ord between 0 and 4 then
    update public.proyectos set etapa = 'instalado', sellos = sellos || pg_catalog.jsonb_build_object('etapa', interno.ahora_ms()) where id = p.id;
    perform interno.anotar(p_ctx, 'general', 'etapa', 'proyecto', p.id, p.nombre || ' pasó a ' || interno.etapa_nombre('instalado'),
                           'Estaba en ' || interno.etapa_nombre(p.etapa) || ' y la venta se liquidó', pg_catalog.jsonb_build_object('etapa', p.etapa),
                           pg_catalog.jsonb_build_object('etapa', 'instalado'));
    return true;
  end if;
  return false;
end $$;
revoke all on function interno.etapa_por_cobro(text, interno.contexto_t) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. «Ocultar del taller»: la columna y su sello
-- -----------------------------------------------------------------------------------------------------
-- Visible a las TRES áreas (no es dinero: el GRANT de 0003 es de la tabla entera, así que Fabricación la lee como lee la etapa). La escribe
-- solo `proyecto_actualizar`, y solo Dirección (la matriz, punto 3).
alter table public.proyectos add column if not exists oculto_taller boolean not null default false;
comment on column public.proyectos.oculto_taller is
  'Ocultar del taller (0029, T1-9): fuera de «El taller», de sus avisos, de «Lo que viene» y de la pantalla del taller. No toca el dinero. Solo Dirección.';

-- La de 0001 con el grupo `oculto_taller` al final. Es la que revisa el CHECK de `proyectos.sellos`: sin esto, el sello de ocultar no entraba.
create or replace function interno.sellos_validos(j jsonb) returns boolean language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_typeof(j) = 'object'
     and not exists (
       select 1 from pg_catalog.jsonb_each(j) e
        where e.key <> all (array['etapa','notas','plazo_k','tel','dir_texto','ubicacion','entrega','instalacion','oculto_taller'])      -- 0029: + oculto_taller
           or case when pg_catalog.jsonb_typeof(e.value) = 'number'
                   then (e.value #>> '{}')::numeric < 0 or (e.value #>> '{}')::numeric <> pg_catalog.trunc((e.value #>> '{}')::numeric)
                   else true end) $$;
revoke all on function interno.sellos_validos(jsonb) from public, anon, authenticated, service_role;
grant execute on function interno.sellos_validos(jsonb) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. La matriz de permisos: Dirección oculta
-- -----------------------------------------------------------------------------------------------------
-- La de 0028 (la fuente única de 0002; `mi_acceso()` se la entrega al teléfono). Solo cambia `direccion.proyecto_actualizar`.
create or replace function interno.matriz_permisos() returns jsonb language sql immutable set search_path = '' as $$
  -- 0017: «etapas» de Fabricación y de Pagos = todas menos «cancelado», en origen y en destino (Q-05, Elías, 2026-10-16).
  -- 0028: Pagos `ganar_proyecto` = true (CZ-1, auditoría del 2026-10-25): la venta del Cotizador entra a la base desde su teléfono, como ya
  --       entraba la venta sin cotización (`alta_venta`). Solo con la base mandando: lo decide `ganar_proyecto`, no la matriz.
  -- 0029: Dirección `proyecto_actualizar` + "oculto_taller" (auditoría 2026-10-26, T1-9): solo Dirección oculta una obra del taller.
  select '{
    "direccion": {
      "proyecto_actualizar": ["notas","tel","dir_texto","lat","lng","maps_url","geo_fuente","entrega","plazo_k","entrecalles",
                              "ubicacion_pendiente","contacto","negocio","tipo_trabajo","compromiso_texto","fecha_anticipo","origen","oculto_taller"],
      "corregir_venta": ["nombre","subtotal","anticipo","liquidacion","cuenta","estatus","fecha_liquidacion","pct_comision","iva"],
      "etapas": {"origen": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia","cancelado"],
                 "destino": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia","cancelado"]},
      "instalacion": "confirmada",
      "alta": {"ganar_proyecto": true, "descartar_cotizacion": true, "alta_venta": true},
      "ve_dinero": true
    },
    "fabricacion": {
      "proyecto_actualizar": ["notas","tel","dir_texto","lat","lng","maps_url","geo_fuente","entrega","plazo_k","entrecalles","ubicacion_pendiente"],
      "corregir_venta": [],
      "etapas": {"origen": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia"],
                 "destino": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia"]},
      "instalacion": "propuesta",
      "alta": {"ganar_proyecto": false, "descartar_cotizacion": false, "alta_venta": false},
      "ve_dinero": false
    },
    "pagos": {
      "proyecto_actualizar": ["notas","tel"],
      "corregir_venta": ["nombre","subtotal","anticipo","liquidacion","cuenta","estatus","fecha_liquidacion","pct_comision"],
      "etapas": {"origen": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia"],
                 "destino": ["ganado","en_diseno","cortado","armado","listo","instalado","garantia"]},
      "instalacion": null,
      "alta": {"ganar_proyecto": true, "descartar_cotizacion": false, "alta_venta": true},
      "ve_dinero": true
    }
  }'::jsonb $$;
revoke all on function interno.matriz_permisos() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 4. proyecto_actualizar: el grupo sellado `oculto_taller`
-- -----------------------------------------------------------------------------------------------------
-- Copia de 0014 con los cambios marcados «0029:». Lo demás —el permiso por campo de la matriz, la compuerta de sellos (gana el más reciente),
-- las validaciones, `origen` solo para Dirección, un solo UPDATE y la bitácora sin importes— es idéntico. `oculto_taller` es un dato de la obra
-- con sello, como las notas o el plazo: un «ocultar» que llega con un sello más viejo que el que ya hay se contesta en `viejos` y no escribe.
create or replace function public.proyecto_actualizar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; p public.proyectos; v_ahora bigint := interno.ahora_ms(); v_campos jsonb; v_sellos jsonb; v_permitidos jsonb;
  v_esc text[] := '{}'; v_vie jsonb := '[]'::jsonb; v_rec jsonb := '[]'::jsonb; k text; g text; r record; v_hay boolean; v_alguno boolean := false;
  v_vacio boolean; v_borrable boolean; v_ok boolean; v_sel jsonb;
  n_notas text; n_tel text; n_dir text; n_lat double precision; n_lng double precision; n_maps text; n_geo text; n_ent text; n_plazo smallint;
  n_entrecalles text; n_ubpend boolean; n_contacto text; n_negocio text; n_tipo text[]; n_comp text; n_fant date; n_obra jsonb; n_dinero jsonb;
  v_val jsonb; v_lat numeric; v_lng numeric; v_tel text; v_origen_viejo jsonb; v_t jsonb;
  n_oculto boolean;      -- 0029
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
  foreach g in array array['notas','tel','dir_texto','ubicacion','entrega','plazo_k','oculto_taller'] loop      -- 0029: y «ocultar del taller»
    v_hay := case g when 'ubicacion' then v_campos ?| array['lat','lng','maps_url','geo_fuente'] else v_campos ? g end;
    if v_hay then v_alguno := true; end if;
  end loop;
  if v_alguno and pg_catalog.jsonb_typeof(v_sellos) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'Faltan los sellos de los datos que se editan.'); end if;
  -- valores de partida: los actuales
  n_notas := p.notas; n_tel := p.tel; n_dir := p.dir_texto; n_lat := p.lat; n_lng := p.lng; n_maps := p.maps_url; n_geo := p.geo_fuente; n_ent := p.entrega; n_plazo := p.plazo_k;
  n_entrecalles := p.entrecalles; n_ubpend := p.ubicacion_pendiente; n_contacto := p.contacto; n_negocio := p.negocio; n_tipo := p.tipo_trabajo; n_comp := p.compromiso_texto;
  n_fant := p.fecha_anticipo; n_obra := p.origen_obra; v_sel := p.sellos;
  n_oculto := p.oculto_taller;      -- 0029
  -- 2b. los grupos sellados
  foreach g in array array['notas','tel','dir_texto','ubicacion','entrega','plazo_k','oculto_taller'] loop      -- 0029: y «ocultar del taller»
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
    elsif g = 'oculto_taller' then      -- 0029: sí o no. Nunca «vacío»: volver a mostrarla es `false`, un valor como cualquiera
      if pg_catalog.jsonb_typeof(v_campos -> 'oculto_taller') is distinct from 'boolean' then
        v_rec := v_rec || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'oculto_taller', 'por', 'ocultar del taller es sí o no')); continue; end if;
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
      elsif g = 'oculto_taller' then n_oculto := (v_campos ->> 'oculto_taller')::boolean;      -- 0029
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
                              compromiso_texto = n_comp, fecha_anticipo = n_fant, origen_obra = n_obra, oculto_taller = n_oculto, sellos = v_sel
   where id = p.id;
  if n_dinero is not null then
    select d.origen_dinero -> 'venta' into v_t from public.ventas_dinero d where d.proyecto_id = p.id;
    -- lo que el modal «Registrar venta» mandó (`venta`) se conserva si el origen nuevo no trae el suyo
    update public.ventas_dinero set origen_dinero = case when n_dinero ? 'venta' or v_t is null then n_dinero else n_dinero || pg_catalog.jsonb_build_object('venta', v_t) end
     where proyecto_id = p.id;
  end if;
  -- 7. bitácora de obra: la lista de campos, SIN importes
  -- 0029: «ocultar del taller» lleva su propia línea (abajo); la de «Se editó» es para lo demás.
  if pg_catalog.cardinality(pg_catalog.array_remove(v_esc, 'oculto_taller')) > 0 then
    perform interno.anotar(c, 'general', 'cambio', 'proyecto', p.id, 'Se editó ' || p.nombre,
                           'Campos: ' || pg_catalog.array_to_string(pg_catalog.array_remove(v_esc, 'oculto_taller'), ', '));
  end if;
  -- 0029: quién la ocultó o la volvió a mostrar, y cuándo, con el antes y el después. Sin importes: no los toca.
  if n_oculto is distinct from p.oculto_taller then
    perform interno.anotar(c, 'general', case when n_oculto then 'ocultar' else 'mostrar' end, 'proyecto', p.id,
                           p.nombre || case when n_oculto then ' se ocultó del taller' else ' volvió a mostrarse en el taller' end,
                           'No cambia el dinero: el estatus de cobro, el saldo y las comisiones siguen igual.',
                           pg_catalog.jsonb_build_object('oculto_taller', p.oculto_taller), pg_catalog.jsonb_build_object('oculto_taller', n_oculto));
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'escritos', pg_catalog.to_jsonb(v_esc), 'viejos', v_vie, 'rechazadas', v_rec, 'remoto', interno.proyecto_remoto(p.id));
end $$;
revoke all on function public.proyecto_actualizar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.proyecto_actualizar(jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 5. pantalla_tablero: la TV del taller tampoco enseña lo oculto
-- -----------------------------------------------------------------------------------------------------
-- Copia de 0022 con el cambio marcado «0029:» en las obras y en sus instalaciones. Lo demás es idéntico.
create or replace function public.pantalla_tablero(p_secreto_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.pantallas; v_emp text; v_hoy date := interno.hoy_mx();
begin
  if p_secreto_hash is null or p_secreto_hash !~ '^[0-9a-f]{64}$' then return interno.err('DATO_INVALIDO', 'Falta la huella de la pantalla.'); end if;
  select * into s from public.pantallas where secreto_hash = p_secreto_hash;
  if not found then return interno.err('NO_ENCONTRADO', 'Esta pantalla no está vinculada.'); end if;
  if s.estado = 'revocada' then return pg_catalog.jsonb_build_object('ok', true, 'estado', 'revocada'); end if;
  if s.estado = 'pendiente' then
    if s.codigo_vence <= pg_catalog.now() then return pg_catalog.jsonb_build_object('ok', true, 'estado', 'vencida'); end if;
    return pg_catalog.jsonb_build_object('ok', true, 'estado', 'pendiente', 'codigo', s.codigo, 'vence', s.codigo_vence);
  end if;
  v_emp := s.empresa_id;
  if s.ultima_vez is null or s.ultima_vez < pg_catalog.now() - interval '5 minutes' then
    update public.pantallas set ultima_vez = pg_catalog.now() where id = s.id;
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'estado', 'activa', 'nombre', s.nombre, 'hoy', v_hoy, 'empresa', v_emp,
    'actualizado', (select pg_catalog.max(c.hecho_en) from public.cuadre_diario c where c.empresa_id = v_emp and c.aplicado),
    'constantes', coalesce((select pg_catalog.jsonb_object_agg(k.clave, k.valor) from public.constantes k
                             where k.empresa_id = v_emp and k.clave in ('PLAZO_COLCHON_DIAS', 'PLAZO_PROVEEDOR_DIAS')), '{}'::jsonb),
    'obras', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                          'id', p.id, 'nombre', p.nombre, 'negocio', p.negocio, 'etapa', p.etapa, 'tipo_trabajo', pg_catalog.to_jsonb(p.tipo_trabajo),
                          'fecha_ganado', p.fecha_anticipo, 'plazo_k', p.plazo_k, 'folio_global', p.folio_global,
                          'origen', pg_catalog.jsonb_build_object('items', coalesce(p.origen_obra -> 'items', '[]'::jsonb))
                                    || case when p.etapa in ('en_diseno', 'cortado', 'armado')
                                            then interno.solo_claves(coalesce(p.origen_obra, '{}'::jsonb), array['entrega', 'notaCliente', 'renders'])
                                            else '{}'::jsonb end) order by p.id)
                         from public.proyectos p
                        where p.empresa_id = v_emp and p.deleted_at is null and not p.historica and not p.oculto_taller      -- 0029
                          and p.etapa in ('ganado', 'en_diseno', 'cortado', 'armado', 'listo')), '[]'::jsonb),
    'instalaciones', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                                  'proyecto_id', i.proyecto_id, 'fecha', i.fecha, 'hora', i.hora, 'ventana', i.ventana, 'estado', i.estado)
                                  order by i.fecha, (i.hora is null), i.hora, i.created_at)
                                 from public.instalaciones i
                                 join public.proyectos p on p.empresa_id = i.empresa_id and p.id = i.proyecto_id
                                where i.empresa_id = v_emp and i.deleted_at is null and i.estado <> 'cancelada'
                                  and p.deleted_at is null and not p.historica and not p.oculto_taller      -- 0029
                                  and p.etapa in ('ganado', 'en_diseno', 'cortado', 'armado', 'listo')), '[]'::jsonb));
end $$;
revoke all on function public.pantalla_tablero(text) from public, anon, authenticated, service_role;
grant execute on function public.pantalla_tablero(text) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez (la auditoría de 0027: las listas cerradas no cambian)
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0029): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
