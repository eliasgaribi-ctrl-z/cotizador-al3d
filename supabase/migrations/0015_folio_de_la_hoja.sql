-- =====================================================================================================
-- 0015_folio_de_la_hoja.sql — una venta nueva lleva en la base el MISMO V-### que le dio la hoja
-- =====================================================================================================
-- Elías decidió el 2026-10-16 (docs/DECISIONES-SUPABASE.md, Q-07) que, mientras la hoja sea la fuente, Supabase usa el mismo número de venta
-- que la hoja. Hasta aquí, `ganar_proyecto` sacaba el V-### de su propio contador (`siguiente('V')`) y la venta que la sombra copiaba podía quedar
-- con otro número en la base (docs/supabase/NOTAS-SEGUNDA-ENTREGA-CLIENTE.md, decisión 3).
--
-- Qué cambia:
--   · public.ganar_proyecto acepta `p_op.folio_hoja` (opcional). Si viene:
--       - debe tener el formato del libro, ESCRITO como lo escribe la base (`interno.folio_texto`: V-042, V-1000; no «V-0042» ni «v-42»), o
--         DATO_INVALIDO definitivo;
--       - si otro proyecto de la empresa ya tiene ese folio, DATO_INVALIDO definitivo con `causa: 'folio_ocupado'`, el folio y el proyecto que
--         lo tiene. La sombra lo aparta como «rechazada» con ese motivo y sigue con lo demás: nunca bloquea (js/datos/supa-sombra.js);
--       - si no, la venta se da de alta con ESE folio y el contador no se gasta.
--     Sin `folio_hoja`, todo igual que en 0006: el folio sale del contador. Un reintento del mismo «Se ganó» sigue siendo `ya_existia` (y si el
--     folio que se pidió no es el que la base ya tenía, lo dice con `folio_hoja_pedido`, sin cambiar nada).
--   · El contador `V` NUNCA queda por debajo del folio más alto que existe: un trigger en `proyectos` lo sube (solo sube) cada vez que una fila
--     recibe un `folio_hoja`, venga de `ganar_proyecto`, de `alta_venta`, de la importación (service_role) o de una fusión. Así, el siguiente
--     número que la base reparta por sí sola no choca con uno que trajo la hoja. Y al aplicar esta migración se emparejan los contadores con
--     lo que ya hay.
--
-- Concurrencia: dos altas que piden el mismo folio se serializan con un candado por (empresa, folio); la segunda ve la primera y contesta
-- `folio_ocupado`. La restricción `proyectos_folio_hoja_unico` (0003) sigue siendo la última palabra.
--
-- Depende de: 0001…0014. Idempotente (create or replace, drop … if exists; el emparejado solo sube). Termina corriendo la auditoría de 0011.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. El contador V nunca por debajo del folio más alto
-- -----------------------------------------------------------------------------------------------------
-- SECURITY DEFINER, como interno.movimiento_seq de 0005: el importador (service_role) inserta directo y no tiene —ni debe tener— privilegios
-- sobre `contadores`. Solo SUBE (`greatest`), y no toca la fila si ya está a la altura (el `where` del `do update`): repetir no mueve `updated_at`.
create or replace function interno.proyectos_folio_contador() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.folio_hoja is null or new.folio_hoja !~ '^V-[0-9]{3,7}$' then return null; end if;
  if tg_op = 'UPDATE' and new.folio_hoja is not distinct from old.folio_hoja then return null; end if;
  insert into public.contadores as c (empresa_id, clave, ventana, n) values (new.empresa_id, 'V', '', pg_catalog.substr(new.folio_hoja, 3)::bigint)
  on conflict (empresa_id, clave, ventana) do update set n = excluded.n, updated_at = clock_timestamp() where c.n < excluded.n;
  return null;
end $$;
revoke all on function interno.proyectos_folio_contador() from public, anon, authenticated, service_role;

drop trigger if exists proyectos_folio_contador on public.proyectos;
create trigger proyectos_folio_contador after insert or update of folio_hoja on public.proyectos for each row execute function interno.proyectos_folio_contador();

-- El emparejado de una sola vez: cada empresa, a la altura de su folio más alto (si ya está igual o arriba, no se toca).
insert into public.contadores as c (empresa_id, clave, ventana, n)
select p.empresa_id, 'V', '', max(pg_catalog.substr(p.folio_hoja, 3)::bigint)
  from public.proyectos p where p.folio_hoja ~ '^V-[0-9]{3,7}$' group by p.empresa_id
on conflict (empresa_id, clave, ventana) do update set n = excluded.n, updated_at = clock_timestamp() where c.n < excluded.n;


-- -----------------------------------------------------------------------------------------------------
-- 2. ganar_proyecto con el folio de la hoja
-- -----------------------------------------------------------------------------------------------------
-- Copia de 0006 con los cambios marcados «0015:». Lo demás —validación, idempotencia por id y folio de cotización, la entrada partida, la venta,
-- la cita, la bitácora— es idéntico.
create or replace function public.ganar_proyecto(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; v_id text; v_fg text; v_venta jsonb; v_nombre text; e public.proyectos; v_obra jsonb; v_din jsonb; v_folio text;
  v_ahora bigint := interno.ahora_ms(); v_sub numeric; v_anti numeric; v_liq numeric; v_cuenta text; v_estatus text; v_iva boolean; v_pct numeric; v_prec numeric;
  v_tel text; v_tipo text[]; v_entrega text; v_plazo smallint; v_lat double precision; v_lng double precision; v_fant date; v_fliq date; v_notas text;
  v_finst date; v_hora text; v_inst_id text; v_sellos jsonb; v_disp text; v_vtipo jsonb; v_neto numeric;
  v_folio_pedido text; v_otro text;      -- 0015
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  c := pre.c;
  if pg_catalog.jsonb_typeof(p_op) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'La operación está mal formada.'); end if;
  v_id := p_op ->> 'id'; v_fg := p_op ->> 'folio_global'; v_venta := coalesce(p_op -> 'venta', '{}'::jsonb); v_nombre := p_op ->> 'nombre';
  -- validar (todo antes de escribir)
  if v_id is null or v_id !~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$' then return interno.err('DATO_INVALIDO', 'El id del proyecto no es válido.'); end if;
  if v_fg is null or v_fg !~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$' then return interno.err('DATO_INVALIDO', 'El folio de la cotización necesita su aparato (COT-0042-B@K7QM).'); end if;
  if pg_catalog.btrim(coalesce(v_nombre, '')) = '' or pg_catalog.length(v_nombre) > 2000 then return interno.err('DATO_INVALIDO', 'Falta el nombre del proyecto.'); end if;
  if pg_catalog.jsonb_typeof(v_venta) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'Los datos de la venta están mal formados.'); end if;
  v_sub := interno.num(v_venta -> 'sub');
  if v_sub is null then return interno.err('DATO_INVALIDO', 'El subtotal de la venta debe ser un número.'); end if;
  v_cuenta := nullif(v_venta ->> 'cuenta', '');
  if v_cuenta is not null and v_cuenta <> all (array['Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT']) then
    return interno.err('DATO_INVALIDO', 'La cuenta no es una de las cuentas de AL3D.'); end if;
  v_estatus := coalesce(nullif(v_venta ->> 'estatus', ''), 'FABRICACION');
  if v_estatus <> all (array['FABRICACION','REPARANDO','COBRANDO','LIQUIDADO']) then return interno.err('DATO_INVALIDO', 'El estatus de cobro no existe.'); end if;
  v_anti := coalesce(interno.num(v_venta -> 'anti'), 0);
  if v_anti < 0 then return interno.err('DATO_INVALIDO', 'El anticipo no puede ser negativo.'); end if;
  v_pct := coalesce(interno.num(v_venta -> 'pct_comision'), 10);
  if v_pct < 0 or v_pct > 100 then return interno.err('DATO_INVALIDO', 'El porcentaje de comisión va de 0 a 100.'); end if;
  v_prec := interno.num(v_venta -> 'precio_auth');
  v_iva := case when pg_catalog.jsonb_typeof(v_venta -> 'iva') = 'boolean' then (v_venta ->> 'iva')::boolean else true end;
  v_neto := interno.neto(v_sub, v_iva);
  if v_venta ? 'liquidacion' and pg_catalog.jsonb_typeof(v_venta -> 'liquidacion') <> 'null' then
    v_liq := interno.num(v_venta -> 'liquidacion');
    if v_liq is null or v_liq < 0 then return interno.err('DATO_INVALIDO', 'La liquidación no puede ser negativa.'); end if;
  else
    v_liq := case when v_estatus = 'LIQUIDADO' then greatest(0, v_neto - v_anti) else 0 end;      -- el modal con estatus LIQUIDADO
  end if;
  v_fliq := interno.fecha_json(v_venta -> 'fecha_liquidacion');
  v_tel := coalesce(interno.telefono_limpio(p_op ->> 'tel'), '');
  if p_op ? 'tipo_trabajo' and pg_catalog.jsonb_typeof(p_op -> 'tipo_trabajo') <> 'null' then
    if pg_catalog.jsonb_typeof(p_op -> 'tipo_trabajo') <> 'array' or exists (select 1 from pg_catalog.jsonb_array_elements(p_op -> 'tipo_trabajo') x where pg_catalog.jsonb_typeof(x) <> 'string') then
      return interno.err('DATO_INVALIDO', 'Los tipos de trabajo deben ser una lista de textos.'); end if;
    v_tipo := array(select pg_catalog.jsonb_array_elements_text(p_op -> 'tipo_trabajo'));
    if not (v_tipo <@ array['Caja de luz con iluminacion','Caja de luz sin iluminacion','Letras 3D con iluminacion','Letras 3D sin iluminacion','Rotulacion de vinil','Recorte acrilico','Custome / Proyecto Especial']) then
      return interno.err('DATO_INVALIDO', 'Uno de los tipos de trabajo no existe.'); end if;
  else v_tipo := '{}'; end if;
  v_entrega := nullif(p_op ->> 'entrega', '');
  if v_entrega is not null and v_entrega <> all (array['instalacion','paqueteria','recoleccion']) then return interno.err('DATO_INVALIDO', 'La forma de entrega no existe.'); end if;
  if p_op ? 'plazo_k' and pg_catalog.jsonb_typeof(p_op -> 'plazo_k') <> 'null' then
    if interno.num(p_op -> 'plazo_k') is null or interno.num(p_op -> 'plazo_k') <> pg_catalog.trunc(interno.num(p_op -> 'plazo_k')) or interno.num(p_op -> 'plazo_k') not between 1 and 5 then
      return interno.err('DATO_INVALIDO', 'El plazo de taller va de 1 a 5.'); end if;
    v_plazo := interno.num(p_op -> 'plazo_k')::smallint;
  end if;
  v_lat := interno.num(p_op -> 'lat'); v_lng := interno.num(p_op -> 'lng');
  if v_lat is not null or v_lng is not null then
    if v_lat is null or v_lng is null or abs(v_lat) > 90 or abs(v_lng) > 180 or (v_lat = 0 and v_lng = 0) then
      return interno.err('DATO_INVALIDO', 'Las coordenadas no son válidas.'); end if;
  end if;
  v_notas := coalesce(p_op ->> 'notas', '');
  if pg_catalog.length(v_notas) > 40000 or pg_catalog.length(coalesce(p_op ->> 'dir_texto', '')) > 2000 then return interno.err('DATO_INVALIDO', 'Un texto del proyecto es demasiado largo.'); end if;
  v_fant := coalesce(interno.fecha_json(p_op -> 'fecha_anticipo'), interno.hoy_mx());
  v_disp := coalesce(p_op ->> 'dispositivo', '');
  if v_disp !~ '^[A-Za-z0-9_-]{0,24}$' then return interno.err('DATO_INVALIDO', 'El aparato no es válido.'); end if;
  -- 0015: el V-### que la hoja ya le dio a esta venta (lo manda la sombra). Opcional; si viene, escrito como lo escribe la base (V-042, V-1000).
  if p_op ? 'folio_hoja' and pg_catalog.jsonb_typeof(p_op -> 'folio_hoja') <> 'null' then
    if pg_catalog.jsonb_typeof(p_op -> 'folio_hoja') <> 'string' or (p_op ->> 'folio_hoja') !~ '^V-[0-9]{3,7}$'
       or (p_op ->> 'folio_hoja') <> interno.folio_texto('V', pg_catalog.substr(p_op ->> 'folio_hoja', 3)::bigint) then
      return interno.err('DATO_INVALIDO', 'El folio de la hoja no tiene el formato del libro (V- y el número con al menos tres dígitos: V-042).'); end if;
    v_folio_pedido := p_op ->> 'folio_hoja';
  end if;
  v_finst := interno.fecha_json(p_op -> 'fecha_instalacion');
  if p_op ? 'fecha_instalacion' and pg_catalog.jsonb_typeof(p_op -> 'fecha_instalacion') <> 'null' and v_finst is null then
    return interno.err('DATO_INVALIDO', 'La fecha de instalación no es válida.'); end if;
  if v_finst is not null then
    v_hora := p_op ->> 'hora';
    if v_hora is not null and v_hora <> '' then
      if v_hora !~ '^[0-9]{1,2}:[0-9]{2}$' then return interno.err('DATO_INVALIDO', 'La hora de instalación no es válida.'); end if;
      v_hora := pg_catalog.lpad(pg_catalog.split_part(v_hora, ':', 1), 2, '0') || ':' || pg_catalog.split_part(v_hora, ':', 2);
      if v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return interno.err('DATO_INVALIDO', 'La hora de instalación no es válida.'); end if;
    else v_hora := null; end if;
    v_inst_id := coalesce(nullif(p_op ->> 'instalacion_id', ''), 'inst-' || v_id);
    if v_inst_id !~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$' then return interno.err('DATO_INVALIDO', 'El id de la instalación no es válido.'); end if;
    if exists (select 1 from public.instalaciones i where i.id = v_inst_id) then return interno.err('DATO_INVALIDO', 'Ese id de instalación ya existe.'); end if;
  end if;
  -- serializa dos «Se ganó» de la misma cotización
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.empresa_id || ':' || v_fg, 0));
  select * into e from public.proyectos x where x.empresa_id = c.empresa_id and x.folio_global = v_fg;
  if found then
    if e.id = v_id and e.folio_hoja is not null then      -- reintento idempotente: NO mueve la etapa
      return pg_catalog.jsonb_build_object('ok', true, 'ya_existia', true, 'proyecto_id', e.id, 'folio_hoja', e.folio_hoja)
             || case when v_folio_pedido is not null and v_folio_pedido <> e.folio_hoja      -- 0015: lo dice, sin cambiar nada
                     then pg_catalog.jsonb_build_object('folio_hoja_pedido', v_folio_pedido) else '{}'::jsonb end; end if;
    return interno.err('DUPLICADO', 'Esa cotización ya es otro proyecto.', pg_catalog.jsonb_build_object('proyecto_id', e.id));
  end if;
  if exists (select 1 from public.proyectos x where x.id = v_id) then return interno.err('DATO_INVALIDO', 'Ese id de proyecto ya existe.'); end if;
  -- la entrada se parte en obra (los tres roles) y dinero (Dirección y Pagos)
  if pg_catalog.jsonb_typeof(p_op -> 'entrada') = 'object' then select o.obra, o.dinero into v_obra, v_din from interno.partir_origen(p_op -> 'entrada') o;
  else select o.obra, o.dinero into v_obra, v_din from interno.partir_origen('{}'::jsonb) o; end if;
  -- 0015: con el folio de la hoja, ese (si nadie lo tiene); sin él, el del contador, como siempre. Al insertar, el trigger
  -- proyectos_folio_contador sube el contador hasta el folio de la hoja.
  if v_folio_pedido is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.empresa_id || ':folio:' || v_folio_pedido, 0));
    select x.id into v_otro from public.proyectos x where x.empresa_id = c.empresa_id and x.folio_hoja = v_folio_pedido;
    if found then
      return interno.err('DATO_INVALIDO', 'El folio ' || v_folio_pedido || ' de la hoja ya es de otro proyecto en la base: la venta no se da de alta con un folio repetido.',
                         pg_catalog.jsonb_build_object('causa', 'folio_ocupado', 'folio_hoja', v_folio_pedido, 'proyecto_id', v_otro));
    end if;
    v_folio := v_folio_pedido;
  else
    v_folio := interno.folio_texto('V', interno.siguiente(c.empresa_id, 'V', '', 1));     -- nunca se reparte dos veces
  end if;
  v_sellos := interno.sellos_limpios(p_op -> 'sellos', v_ahora);
  v_vtipo := pg_catalog.jsonb_build_object('sub', v_sub, 'neto', v_neto, 'anti', v_anti, 'iva', v_iva, 'precio_auth', v_prec);
  insert into public.proyectos (id, empresa_id, folio_hoja, folio_global, folio_local, dispositivo, fuente, historica, nombre, contacto, negocio, tel, etapa, tipo_trabajo,
                                fecha_anticipo, compromiso_texto, dir_texto, entrecalles, maps_url, lat, lng, geo_fuente, ubicacion_pendiente, entrega, plazo_k, notas,
                                estatus, iva, sellos, origen_obra, creado_por)
  values (v_id, c.empresa_id, v_folio, v_fg, coalesce(p_op ->> 'folio_local', ''), v_disp, 'cotizacion', false, v_nombre, coalesce(p_op ->> 'contacto', ''),
          coalesce(p_op ->> 'negocio', ''), v_tel, 'ganado', v_tipo, v_fant, coalesce(p_op ->> 'compromiso_texto', ''), coalesce(p_op ->> 'dir_texto', ''),
          coalesce(p_op ->> 'entrecalles', ''), coalesce(p_op ->> 'maps_url', ''), v_lat, v_lng, coalesce(p_op ->> 'geo_fuente', ''),
          case when pg_catalog.jsonb_typeof(p_op -> 'ubicacion_pendiente') = 'boolean' then (p_op ->> 'ubicacion_pendiente')::boolean else false end,
          v_entrega, v_plazo, v_notas, v_estatus, v_iva, v_sellos, v_obra, c.usuario_id);
  insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta, fecha_liquidacion, pct_comision, precio_auth, origen_dinero)
  values (v_id, c.empresa_id, v_sub, v_anti, v_liq, v_cuenta, v_fliq, v_pct, v_prec, v_din || pg_catalog.jsonb_build_object('venta', v_vtipo));
  perform interno.normalizar_iva(v_id);
  if v_finst is not null then
    insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, hora, ventana, duracion_min, estado, movida, uid_ics, creado_por)
    values (v_inst_id, c.empresa_id, v_id, v_finst, v_hora, 'dia', 180, 'confirmada', 0, 'inst-' || v_inst_id || '@al3d.mx', c.usuario_id);
  end if;
  perform interno.anotar(c, 'general', 'gano', 'proyecto', v_id, 'Se ganó ' || v_nombre);
  perform interno.anotar(c, 'dinero', 'gano', 'venta', v_id, 'Venta ganada ' || v_folio, '', null,
                         pg_catalog.jsonb_build_object('subtotal', v_sub, 'anticipo', v_anti, 'cuenta', v_cuenta, 'estatus', v_estatus, 'precio_auth', v_prec));
  return pg_catalog.jsonb_build_object('ok', true, 'proyecto_id', v_id, 'folio_hoja', v_folio);
end $$;
revoke all on function public.ganar_proyecto(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.ganar_proyecto(jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 3. La aduana otra vez: lo nuevo no puede dejar nada abierto
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0015): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
