-- =====================================================================================================
-- 0017_decisiones_elias.sql — Q-05 (etapas) y Q-19 (IA), decididas por Elías el 2026-10-16
-- =====================================================================================================
-- Elías revisó las decisiones que quedaban con su valor por defecto (docs/DECISIONES-SUPABASE.md) y cambió dos:
--
--   · Q-05 Etapas. Los TRES roles (Dirección, Fabricación y Pagos) pueden mover cualquier etapa; SOLO Dirección cancela («No se dio», la
--     etapa `cancelado`). Se lee también al revés: sacar un proyecto de `cancelado` es deshacer esa decisión, y también es solo de Dirección
--     (así ya era para Fabricación en 0006). Antes (0006/0014): Fabricación solo dentro de ganado…listo en origen Y destino; Pagos, ninguna.
--     Las dos transiciones automáticas se quedan: cobro ⇒ instalado (0007, sin cambio) e instalación hecha ⇒ instalado, que ahora corre
--     para toda área que puede marcar «instalado» según la matriz (Dirección y Fabricación; Pagos no toca la agenda), igual que el teléfono.
--   · Q-19 IA. 50 consultas al día por persona (antes 200), contado en el día de México como ya hacía 0009. La base manda: `ia_cuota`
--     nunca deja más de 50 aunque quien llama pida más (una función desplegada con el 200 de antes también queda en 50).
--
-- Las demás decisiones de ese día (Q-02, Q-03, Q-09, Q-13 y Q-01 confirmadas; el resto aceptado por defecto) no cambian nada en la base.
--
-- Qué se hace (copias íntegras con el cambio marcado «0017:», el mismo patrón de 0013–0016):
--   · interno.matriz_permisos    la de 0002, con las `etapas` de Fabricación y Pagos = todas menos `cancelado` (mi_acceso() se la entrega
--                                al teléfono como `permisos`, así que el cliente con Supabase encendido recibe la regla nueva sin otro cambio);
--   · public.mover_etapa         la de 0014, con Pagos en el preámbulo y un mensaje que dice que cancelar es de Dirección;
--   · public.instalacion_guardar la de 0014, con la transición automática 1 decidida por la matriz en lugar de `c.area = 'direccion'`;
--   · public.ia_cuota            la de 0009, con el tope en 50 (por omisión y como máximo).
-- Ninguna firma cambia, no hay funciones, tablas ni privilegios nuevos: la auditoría de 0011 no tiene nada nuevo que revisar y debe seguir
-- limpia (se corre al final).
--
-- Depende de: 0001…0016. Idempotente (create or replace). Termina corriendo la auditoría de 0011: si algo quedó abierto, aborta como ella.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. La matriz de permisos (Q-05): Fabricación y Pagos mueven cualquier etapa menos `cancelado`
-- -----------------------------------------------------------------------------------------------------
-- La fuente única de 0002 (las RPC la consultan y mi_acceso() la entrega al cliente). Solo cambian las dos listas de `etapas`.
create or replace function interno.matriz_permisos() returns jsonb language sql immutable set search_path = '' as $$
  -- 0017: «etapas» de Fabricación y de Pagos = todas menos «cancelado», en origen y en destino (Q-05, Elías, 2026-10-16). Antes: Fabricación
  --       solo ganado…listo y Pagos ninguna. Dirección no cambia: es la única que cancela («No se dio») y la única que saca un proyecto de ahí.
  select '{
    "direccion": {
      "proyecto_actualizar": ["notas","tel","dir_texto","lat","lng","maps_url","geo_fuente","entrega","plazo_k","entrecalles",
                              "ubicacion_pendiente","contacto","negocio","tipo_trabajo","compromiso_texto","fecha_anticipo","origen"],
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
      "alta": {"ganar_proyecto": false, "descartar_cotizacion": false, "alta_venta": true},
      "ve_dinero": true
    }
  }'::jsonb $$;
revoke all on function interno.matriz_permisos() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. mover_etapa (Q-05): Pagos entra; cancelar o sacar de `cancelado`, solo Dirección
-- -----------------------------------------------------------------------------------------------------
-- Copia de 0014 con los cambios marcados «0017:». El permiso sigue saliendo de la matriz (origen Y destino); con la de arriba:
--   Dirección: cualquier origen y destino; Fabricación y Pagos: cualquiera menos `cancelado`, en origen y en destino.
-- Lo demás —la lápida que no se mueve, el doble toque, el sello obligatorio, la compuerta, las salidas del corte— es idéntico. Una salida
-- de material que emite el movimiento de Pagos queda firmada con su área, como la de cualquier otra.
create or replace function public.mover_etapa(p_proyecto text, p_etapa text, p_sello bigint default null, p_motivo text default '', p_empresa text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pre record; p public.proyectos; v_perm jsonb; r record; v_sal int; v_ok boolean;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);        -- 0017: Pagos también mueve la etapa (Q-05)
  if pre.e is not null then return pre.e; end if;
  if p_etapa is null or p_etapa <> all (array['ganado','en_diseno','cortado','armado','listo','instalado','garantia','cancelado']) then
    return interno.err('DATO_INVALIDO', 'La etapa no existe.'); end if;
  select * into p from public.proyectos x where x.empresa_id = (pre.c).empresa_id and x.id = p_proyecto and x.deleted_at is null for update;
  if not found then return interno.err('NO_ENCONTRADO', 'Ese proyecto no existe.'); end if;
  if p.etapa is null then return interno.err('DATO_INVALIDO', 'Una fila histórica no es una tarjeta de obra: no tiene etapa.'); end if;
  v_perm := interno.matriz_permisos() -> (pre.c).area -> 'etapas';
  v_ok := (v_perm -> 'origen') ? p.etapa and (v_perm -> 'destino') ? p_etapa;
  if not v_ok then
    if 'cancelado' in (p.etapa, p_etapa) then      -- 0017: el «no» de siempre, con la razón que ahora es la única que queda
      return interno.err('ROL_SIN_PERMISO', 'Solo Dirección cancela un proyecto («No se dio») o lo saca de ahí.'); end if;
    return interno.err('ROL_SIN_PERMISO', 'Tu área no puede mover un proyecto de esa etapa a esa otra.');
  end if;
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


-- -----------------------------------------------------------------------------------------------------
-- 3. instalacion_guardar (Q-05): la transición automática «hecha ⇒ instalado» para quien puede marcar «instalado»
-- -----------------------------------------------------------------------------------------------------
-- Copia de 0014 con el cambio marcado «0017:» (el acoplamiento del final). Quién agenda no cambia: Dirección y Fabricación (Pagos sigue con
-- ROL_SIN_PERMISO en el preámbulo), y la cita nace «confirmada» o «propuesta» según la matriz, como antes.
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
  -- acoplamiento instalación ↔ etapa (transición automática 1): hecha + un área que puede marcar «instalado» + etapa por debajo de «instalado» → instalado
  -- 0017: «un área que puede marcar instalado» sale de la matriz (Dirección y, desde Q-05, Fabricación; Pagos no llega aquí: no toca la agenda).
  --       Antes era `c.area = 'direccion'` porque solo Dirección podía marcar «instalado». Es lo que hace el teléfono (instalarProyecto,
  --       js/datos/agenda.js): marca hecha → «Instalado», si el rol puede marcarlo.
  if v_final.estado = 'hecha' and (interno.matriz_permisos() -> c.area -> 'etapas' -> 'destino') ? 'instalado' then
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
-- 4. ia_cuota (Q-19): 50 consultas de IA por persona y por día de México
-- -----------------------------------------------------------------------------------------------------
-- Copia de 0009 con los cambios marcados «0017:». La cuenta sigue siendo atómica (`INSERT … ON CONFLICT DO UPDATE … WHERE n < tope`): el
-- contador nunca pasa del tope y la 51.ª recibe CUPO_AGOTADO (`transitorio: false`). El día sigue siendo el de México (interno.dia_mx).
create or replace function public.ia_cuota(p_usuario uuid, p_limite int default 50, p_ahora timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dia text := interno.dia_mx(p_ahora); v_n bigint; v_tope int;
begin
  if p_usuario is null or p_limite is null or p_limite < 1 then return interno.err('DATO_INVALIDO', 'Falta el usuario o el tope.'); end if;
  v_tope := least(p_limite, 50);      -- 0017: 50 al día por persona (Q-19, Elías, 2026-10-16). Quien llama puede pedir MENOS, nunca más: una función
                                      --       desplegada con el 200 de antes también queda en 50.
  delete from public.contadores where ctid in (                    -- limpieza perezosa: días de hace más de 3
    select x.ctid from public.contadores x where x.clave like 'ia:%' and x.ventana < interno.dia_mx(p_ahora - interval '3 days') limit 20);
  insert into public.contadores as c (empresa_id, clave, ventana, n) values ('*', 'ia:' || p_usuario::text, v_dia, 1)
  on conflict (empresa_id, clave, ventana) do update set n = c.n + 1, updated_at = clock_timestamp() where c.n < v_tope
  returning c.n into v_n;
  if v_n is null then
    return interno.err('CUPO_AGOTADO', 'Llegaste al tope de ' || v_tope || ' consultas de IA por hoy. Mañana se reinicia.',
                       pg_catalog.jsonb_build_object('transitorio', false, 'limite', v_tope, 'dia', v_dia));
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'usadas', v_n, 'limite', v_tope, 'dia', v_dia);
end $$;
revoke all on function public.ia_cuota(uuid, int, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.ia_cuota(uuid, int, timestamptz) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 5. La aduana otra vez: lo nuevo no puede dejar nada abierto
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0017): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
