-- =====================================================================================================
-- 0006_rpc_obra.sql — las acciones de obra: ganar, descartar, vender, editar, mover de etapa, agendar
-- =====================================================================================================
-- Qué deja (todas `SECURITY DEFINER`, `search_path = ''`, EXECUTE solo para `authenticated`):
--   · `ganar_proyecto`, `descartar_cotizacion`, `alta_venta`;
--   · `proyecto_actualizar` (la compuerta de sellos por campo + el permiso por campo);
--   · `mover_etapa` (+ `interno.mover_etapa_core`, `interno.emitir_salidas`) y `emitir_salidas_derivadas`;
--   · `instalacion_guardar`;
--   · los ayudantes que comparten: `fecha_json`, `sellos_limpios`, `proyecto_remoto`, `etapa_nombre`.
--
-- Depende de: 0003 (proyectos), 0004 (`normalizar_iva`) y 0005 (la salida del corte lee `requerimientos` y escribe `almacen_movimientos`).
--
-- Reglas que se imponen AQUÍ y que hoy solo viven en el cliente o en el servidor permisivo (R3, R5, Q-05):
--   · el sello de cada dato decide quién gana (`interno.compuerta`); una operación SIN sellos ya no gana siempre (Q-A05);
--   · la etapa por rol: Dirección cualquiera; Fabricación solo dentro de «ganado…listo» en origen Y destino; Pagos ninguna;
--   · la salida de material del corte es idempotente por id (`mov-salida:<req.id>`) y no se duplica aunque la emitan dos teléfonos;
--   · las dos transiciones automáticas de etapa (instalación hecha ⇒ instalado; cobro ⇒ instalado en filas importadas) no se pierden.
-- Toda validación y todo chequeo de rol ocurre ANTES de la primera escritura, y los mensajes jamás llevan importes.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. Ayudantes
-- -----------------------------------------------------------------------------------------------------

-- Un valor jsonb como fecha: solo un texto «YYYY-MM-DD» que sea una fecha real (2026-02-31 no lo es). Cualquier otra cosa: NULL.
create or replace function interno.fecha_json(j jsonb) returns date language plpgsql immutable set search_path = '' as $$
begin
  if pg_catalog.jsonb_typeof(j) is distinct from 'string' or (j #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  return (j #>> '{}')::date;
exception when others then return null;
end $$;
revoke all on function interno.fecha_json(jsonb) from public, anon, authenticated, service_role;

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
  select pg_catalog.to_jsonb(p) - 'origen_obra' - 'procedencia' from public.proyectos p where p.id = p_id $$;
revoke all on function interno.proyecto_remoto(text) from public, anon, authenticated, service_role;

create or replace function interno.etapa_nombre(e text) returns text language sql immutable set search_path = '' as $$
  select case e when 'ganado' then 'Ganado' when 'en_diseno' then 'En diseño' when 'cortado' then 'Cortado' when 'armado' then 'Armado'
                when 'listo' then 'Listo para instalar' when 'instalado' then 'Instalado' when 'garantia' then 'En garantía'
                when 'cancelado' then 'No se dio' else coalesce(e, '') end $$;
revoke all on function interno.etapa_nombre(text) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. La salida de material del corte y el cambio de etapa (núcleo)
-- -----------------------------------------------------------------------------------------------------

-- La salida de material de un proyecto: una por requerimiento, idempotente por `mov-salida:<req.id>` (`ON CONFLICT DO NOTHING`): si otro teléfono
-- (o una llamada anterior) ya la emitió, solo se marca el requerimiento. Los `descartado` no se emiten; una línea en cero tampoco (ni desaparece);
-- `cantidad_ajustada`, si existe, MANDA sobre `cantidad_compra`. Devuelve cuántas salidas insertó. Corre con los privilegios de la RPC que la llama.
create or replace function interno.emitir_salidas(p public.proyectos, p_origen text, p_nota text, p_ctx interno.contexto_t) returns int
language plpgsql set search_path = '' as $$
declare r record; v_cant numeric; v_n int := 0; v_ins int; v_ts bigint := interno.ahora_ms(); v_correo text := coalesce(interno.correo_verificado(), '');
begin
  for r in select q.* from public.requerimientos q
            where q.empresa_id = p.empresa_id and q.proyecto_id = p.id and q.estado not in ('consumido', 'descartado')
            order by q.material_id loop
    v_cant := coalesce(r.cantidad_ajustada, r.cantidad_compra);
    if not (v_cant > 0) then continue; end if;
    insert into public.almacen_movimientos (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, nota, usuario, rol, dispositivo, proyecto_id,
                                            requerimiento_id, firma, ts, usuario_id)
    values (p.empresa_id, 'mov-salida:' || r.id, r.material_id, 'salida', -v_cant, r.unidad_compra, p_origen, coalesce(p_nota, ''), v_correo, coalesce(p_ctx.area, ''),
            'srv', p.id, r.id, v_correo || ' · ' || coalesce(p_ctx.area, '') || ' (srv)', v_ts, p_ctx.usuario_id)
    on conflict (empresa_id, id) do nothing;
    get diagnostics v_ins = row_count;
    update public.requerimientos set estado = 'consumido', sellos = sellos || pg_catalog.jsonb_build_object('estado', v_ts)
     where empresa_id = r.empresa_id and id = r.id;                                  -- uno por uno, como el cliente
    v_n := v_n + v_ins;
  end loop;
  return v_n;
end $$;
revoke all on function interno.emitir_salidas(public.proyectos, text, text, interno.contexto_t) from public, anon, authenticated, service_role;

-- El cambio de etapa ya autorizado y ya pasado por la compuerta: escribe la etapa y su sello y, si CRUZA EL CORTE, emite las salidas.
-- «Cruza» es ALCANZAR, no tocar: ganado → listo también emite; y desde garantía/cancelado (sin orden) hacia cortado o más también cruza.
-- Devuelve cuántas salidas emitió.
create or replace function interno.mover_etapa_core(p public.proyectos, p_etapa text, p_sello bigint, p_origen text, p_nota text, p_ctx interno.contexto_t) returns int
language plpgsql set search_path = '' as $$
declare v_cruza boolean; v_n int := 0; v_o int := interno.orden_etapa(p.etapa); v_d int := interno.orden_etapa(p_etapa); v_verbo text;
begin
  v_cruza := v_d >= 2 and (v_o is null or v_o < 2);
  update public.proyectos set etapa = p_etapa, sellos = sellos || pg_catalog.jsonb_build_object('etapa', p_sello) where id = p.id;
  if v_cruza then v_n := interno.emitir_salidas(p, p_origen, p_nota, p_ctx); end if;
  v_verbo := case when v_o is not null and v_d is not null and v_d < v_o then 'regresó a' else 'pasó a' end;
  perform interno.anotar(p_ctx, 'general', 'etapa', 'proyecto', p.id, p.nombre || ' ' || v_verbo || ' ' || interno.etapa_nombre(p_etapa),
                         'Estaba en ' || interno.etapa_nombre(p.etapa) || case when v_n > 0 then '; salieron ' || v_n || ' materiales del almacén' else '' end,
                         pg_catalog.jsonb_build_object('etapa', p.etapa), pg_catalog.jsonb_build_object('etapa', p_etapa));
  return v_n;
end $$;
revoke all on function interno.mover_etapa_core(public.proyectos, text, bigint, text, text, interno.contexto_t) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. mover_etapa
-- -----------------------------------------------------------------------------------------------------
-- Permiso (Q-05), que el servidor de hoy NO impone (solo vive en el cliente, `TOPE_ROL`):
--   Dirección: cualquier origen y destino (incluso `cancelado` y `garantia`; «resucitar» un cancelado también).
--   Fabricación: origen Y destino dentro de ganado…listo (también retroceder dentro del rango); lo demás, ROL_SIN_PERMISO. ENDURECE: hoy
--     `puedeMover` mira solo el destino y deja «regresar» un `instalado`.
--   Pagos: ninguno (mueve `estatus`, el otro eje).
-- La tabla vive en `matriz_permisos()` (clave `etapas`), la misma que entrega `mi_acceso()` al cliente.
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
  select * into r from interno.compuerta((p.sellos ->> 'etapa')::bigint, pg_catalog.jsonb_build_object('etapa', p_sello), 'etapa', interno.ahora_ms(), false, false);
  if r.accion = 'viejo' then      -- otro teléfono la movió después y gana: no es un error, y el teléfono recibe lo vigente
    return pg_catalog.jsonb_build_object('ok', true, 'viejos', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('nombre', 'etapa', 'por', r.motivo)),
                                         'remoto', interno.proyecto_remoto(p.id));
  end if;
  v_sal := interno.mover_etapa_core(p, p_etapa, r.sello_nuevo, 'manual', coalesce(p_motivo, ''), pre.c);
  return pg_catalog.jsonb_build_object('ok', true, 'etapa', p_etapa, 'salidas', v_sal, 'remoto', interno.proyecto_remoto(p.id));
end $$;
revoke all on function public.mover_etapa(text, text, bigint, text, text) from public, anon, authenticated, service_role;
grant execute on function public.mover_etapa(text, text, bigint, text, text) to authenticated;

-- «Degradación»: un proyecto cuya instalación es mañana (o ANTES) y nadie marcó el corte emite sus salidas igual, con origen `derivado`.
-- Se llamaba desde `reglas.js` en cualquier teléfono, así que la pueden llamar los tres roles. NO mueve la etapa. El sesgo es el falso
-- positivo: «mañana o antes» (fecha − día ≤ 1). Idempotente: una segunda llamada emite 0.
create or replace function public.emitir_salidas_derivadas(p_hoy date default null, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; p public.proyectos; v_dia date; v_proy int := 0; v_mov int := 0; v_n int; v_fecha date;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  v_dia := coalesce(p_hoy, interno.hoy_mx());
  for p in select x.* from public.proyectos x
            where x.empresa_id = (pre.c).empresa_id and x.deleted_at is null and x.etapa is distinct from 'cancelado'
              and exists (select 1 from public.instalaciones i where i.empresa_id = x.empresa_id and i.proyecto_id = x.id
                             and i.estado <> 'cancelada' and i.deleted_at is null and i.fecha - v_dia <= 1)
            order by x.id loop
    select min(i.fecha) into v_fecha from public.instalaciones i
     where i.empresa_id = p.empresa_id and i.proyecto_id = p.id and i.estado <> 'cancelada' and i.deleted_at is null;
    v_n := interno.emitir_salidas(p, 'derivado', 'Derivado, nunca confirmado: se instala ' || v_fecha::text || ' y nadie marcó el corte.', pre.c);
    if v_n > 0 then v_proy := v_proy + 1; v_mov := v_mov + v_n; end if;
  end loop;
  return pg_catalog.jsonb_build_object('ok', true, 'proyectos', v_proy, 'movimientos', v_mov);
end $$;
revoke all on function public.emitir_salidas_derivadas(date, text) from public, anon, authenticated, service_role;
grant execute on function public.emitir_salidas_derivadas(date, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 4. ganar_proyecto, descartar_cotizacion y alta_venta
-- -----------------------------------------------------------------------------------------------------

-- «Se ganó»: la cotización autorizada se vuelve proyecto y venta (con su folio V-###). SOLO Dirección: los botones solo los pinta Dirección,
-- pero `drenarBuzon` los ejecuta en cualquier teléfono hoy: aquí decide la base. Idempotente por `id` y por `folio_global`: reintentar el mismo
-- «Se ganó» devuelve `ya_existia` y NO mueve la etapa (un reintento tardío del cotizador no puede regresar un proyecto que ya va en «armado»).
--   p_op = { id, folio_global, folio_local, dispositivo, entrada:{…la entrada del historial, con precios…}, nombre, contacto, negocio, tel,
--            tipo_trabajo[], fecha_anticipo, compromiso_texto, dir_texto, entrecalles, maps_url, lat, lng, geo_fuente, ubicacion_pendiente,
--            entrega, plazo_k, notas, venta:{sub, neto, anti, iva, cuenta, estatus, pct_comision, precio_auth, liquidacion?, fecha_liquidacion?},
--            fecha_instalacion?, hora?, instalacion_id?, sellos:{etapa, tel, dir_texto, ubicacion, entrega, plazo_k?}, op_id }
-- La base PARTE la entrada (`partir_origen`): no confía en que el cliente la haya partido, y el dinero va a `ventas_dinero.origen_dinero`.
create or replace function public.ganar_proyecto(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; v_id text; v_fg text; v_venta jsonb; v_nombre text; e public.proyectos; v_obra jsonb; v_din jsonb; v_folio text;
  v_ahora bigint := interno.ahora_ms(); v_sub numeric; v_anti numeric; v_liq numeric; v_cuenta text; v_estatus text; v_iva boolean; v_pct numeric; v_prec numeric;
  v_tel text; v_tipo text[]; v_entrega text; v_plazo smallint; v_lat double precision; v_lng double precision; v_fant date; v_fliq date; v_notas text;
  v_finst date; v_hora text; v_inst_id text; v_sellos jsonb; v_disp text; v_vtipo jsonb; v_neto numeric;
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
      return pg_catalog.jsonb_build_object('ok', true, 'ya_existia', true, 'proyecto_id', e.id, 'folio_hoja', e.folio_hoja); end if;
    return interno.err('DUPLICADO', 'Esa cotización ya es otro proyecto.', pg_catalog.jsonb_build_object('proyecto_id', e.id));
  end if;
  if exists (select 1 from public.proyectos x where x.id = v_id) then return interno.err('DATO_INVALIDO', 'Ese id de proyecto ya existe.'); end if;
  -- la entrada se parte en obra (los tres roles) y dinero (Dirección y Pagos)
  if pg_catalog.jsonb_typeof(p_op -> 'entrada') = 'object' then select o.obra, o.dinero into v_obra, v_din from interno.partir_origen(p_op -> 'entrada') o;
  else select o.obra, o.dinero into v_obra, v_din from interno.partir_origen('{}'::jsonb) o; end if;
  v_folio := interno.folio_texto('V', interno.siguiente(c.empresa_id, 'V', '', 1));     -- nunca se reparte dos veces
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

-- «No se dio»: la LÁPIDA (`proyectos.js:739-793`). Existe para que la cotización deje de contar como «sin decidir». SOLO Dirección. NO se crea
-- `ventas_dinero`: no es una venta («un alta metía en el libro un subtotal, un anticipo que nunca se cobró y una comisión pendiente»), y por eso
-- tampoco consume folio V-###. Idempotente por `folio_global`: la misma lápida otra vez es ok; si esa cotización ya es OTRO proyecto, DUPLICADO.
--   p_op = { id, folio_global, folio_local, dispositivo, entrada, nombre, motivo, sellos:{etapa} }
create or replace function public.descartar_cotizacion(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; c interno.contexto_t; v_id text; v_fg text; e public.proyectos; v_obra jsonb; v_nombre text; v_disp text; v_ahora bigint := interno.ahora_ms();
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  c := pre.c;
  if pg_catalog.jsonb_typeof(p_op) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'La operación está mal formada.'); end if;
  v_id := p_op ->> 'id'; v_fg := p_op ->> 'folio_global';
  if v_id is null or v_id !~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$' then return interno.err('DATO_INVALIDO', 'El id del proyecto no es válido.'); end if;
  if v_fg is null or v_fg !~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$' then return interno.err('DATO_INVALIDO', 'El folio de la cotización necesita su aparato (COT-0042-B@K7QM).'); end if;
  v_nombre := coalesce(nullif(pg_catalog.btrim(p_op ->> 'nombre'), ''), 'Sin nombre');
  if pg_catalog.length(v_nombre) > 2000 or pg_catalog.length(coalesce(p_op ->> 'motivo', '')) > 40000 then return interno.err('DATO_INVALIDO', 'Un texto es demasiado largo.'); end if;
  v_disp := coalesce(p_op ->> 'dispositivo', '');
  if v_disp !~ '^[A-Za-z0-9_-]{0,24}$' then return interno.err('DATO_INVALIDO', 'El aparato no es válido.'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.empresa_id || ':' || v_fg, 0));
  select * into e from public.proyectos x where x.empresa_id = c.empresa_id and x.folio_global = v_fg;
  if found then
    if e.id = v_id and e.folio_hoja is null then return pg_catalog.jsonb_build_object('ok', true, 'ya_existia', true, 'proyecto_id', e.id); end if;
    return interno.err('DUPLICADO', 'Esa cotización ya es otro proyecto.', pg_catalog.jsonb_build_object('proyecto_id', e.id));
  end if;
  if exists (select 1 from public.proyectos x where x.id = v_id) then return interno.err('DATO_INVALIDO', 'Ese id de proyecto ya existe.'); end if;
  if pg_catalog.jsonb_typeof(p_op -> 'entrada') = 'object' then select o.obra into v_obra from interno.partir_origen(p_op -> 'entrada') o;
  else select o.obra into v_obra from interno.partir_origen('{}'::jsonb) o; end if;
  insert into public.proyectos (id, empresa_id, folio_global, folio_local, dispositivo, fuente, historica, nombre, etapa, notas, sellos, origen_obra, creado_por)
  values (v_id, c.empresa_id, v_fg, coalesce(p_op ->> 'folio_local', ''), v_disp, 'cotizacion', false, v_nombre, 'cancelado', coalesce(p_op ->> 'motivo', ''),
          interno.sellos_limpios(pg_catalog.jsonb_build_object('etapa', p_op -> 'sellos' -> 'etapa'), v_ahora), v_obra, c.usuario_id);
  perform interno.anotar(c, 'general', 'descarto', 'proyecto', v_id, 'No se dio ' || v_nombre);
  return pg_catalog.jsonb_build_object('ok', true, 'proyecto_id', v_id);
end $$;
revoke all on function public.descartar_cotizacion(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.descartar_cotizacion(jsonb, text) to authenticated;

-- «Registrar nueva venta» (el menú de la hoja, que Pagos usa): una venta que NO viene de una cotización de la plataforma. Dirección y Pagos
-- (`Q-A03`). Valida como el diálogo: nombre, cuenta (obligatoria), subtotal, anticipo ≥ 0, y el teléfono (≥ 10 dígitos) y la entrega son
-- OBLIGATORIOS. Idempotente por `id`. Con `fecha_instalacion`, la cita nace `confirmada` si la da Dirección y `propuesta` si la da Pagos.
--   p_op = { id, nombre, cuenta, estatus?, tipo_trabajo[], subtotal, anticipo?, fecha_anticipo?, fecha_instalacion?, hora?, tel, entrega,
--            dir_texto?, maps_url?, lat?, lng?, notas?, plazo_k?, sellos, instalacion_id? }
create or replace function public.alta_venta(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; v_id text; v_nombre text; v_cuenta text; v_estatus text; v_sub numeric; v_anti numeric; v_tel text; v_entrega text; v_tipo text[];
  v_plazo smallint; v_lat double precision; v_lng double precision; v_fant date; v_finst date; v_hora text; v_inst_id text; v_folio text; e public.proyectos;
  v_ahora bigint := interno.ahora_ms(); v_sellos jsonb;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  c := pre.c;
  if pg_catalog.jsonb_typeof(p_op) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'La operación está mal formada.'); end if;
  v_id := p_op ->> 'id'; v_nombre := p_op ->> 'nombre'; v_cuenta := nullif(p_op ->> 'cuenta', ''); v_estatus := coalesce(nullif(p_op ->> 'estatus', ''), 'FABRICACION');
  if v_id is null or v_id !~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$' then return interno.err('DATO_INVALIDO', 'El id de la venta no es válido.'); end if;
  if pg_catalog.btrim(coalesce(v_nombre, '')) = '' or pg_catalog.length(v_nombre) > 2000 then return interno.err('DATO_INVALIDO', 'Falta el nombre del proyecto.'); end if;
  if v_cuenta is null or v_cuenta <> all (array['Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT']) then
    return interno.err('DATO_INVALIDO', 'La cuenta es obligatoria y debe ser una de las cuentas de AL3D.'); end if;
  if v_estatus <> all (array['FABRICACION','REPARANDO','COBRANDO','LIQUIDADO']) then return interno.err('DATO_INVALIDO', 'El estatus de cobro no existe.'); end if;
  v_sub := interno.num(p_op -> 'subtotal');
  if v_sub is null then return interno.err('DATO_INVALIDO', 'El subtotal debe ser un número.'); end if;
  v_anti := coalesce(interno.num(p_op -> 'anticipo'), 0);
  if v_anti < 0 then return interno.err('DATO_INVALIDO', 'El anticipo no puede ser negativo.'); end if;
  v_tel := interno.telefono_limpio(p_op ->> 'tel');
  v_entrega := nullif(p_op ->> 'entrega', '');
  if v_tel is null or pg_catalog.length(pg_catalog.regexp_replace(v_tel, '[^0-9]', '', 'g')) < 10 or v_entrega is null then
    return interno.err('DATO_INVALIDO', 'El teléfono (de 10 dígitos o más) y la forma de entrega son obligatorios.'); end if;
  if v_entrega <> all (array['instalacion','paqueteria','recoleccion']) then return interno.err('DATO_INVALIDO', 'La forma de entrega no existe.'); end if;
  if p_op ? 'tipo_trabajo' and pg_catalog.jsonb_typeof(p_op -> 'tipo_trabajo') <> 'null' then
    if pg_catalog.jsonb_typeof(p_op -> 'tipo_trabajo') <> 'array' or exists (select 1 from pg_catalog.jsonb_array_elements(p_op -> 'tipo_trabajo') x where pg_catalog.jsonb_typeof(x) <> 'string') then
      return interno.err('DATO_INVALIDO', 'Los tipos de trabajo deben ser una lista de textos.'); end if;
    v_tipo := array(select pg_catalog.jsonb_array_elements_text(p_op -> 'tipo_trabajo'));
    if not (v_tipo <@ array['Caja de luz con iluminacion','Caja de luz sin iluminacion','Letras 3D con iluminacion','Letras 3D sin iluminacion','Rotulacion de vinil','Recorte acrilico','Custome / Proyecto Especial']) then
      return interno.err('DATO_INVALIDO', 'Uno de los tipos de trabajo no existe.'); end if;
  else v_tipo := '{}'; end if;
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
  if pg_catalog.length(coalesce(p_op ->> 'notas', '')) > 40000 or pg_catalog.length(coalesce(p_op ->> 'dir_texto', '')) > 2000 then
    return interno.err('DATO_INVALIDO', 'Un texto del proyecto es demasiado largo.'); end if;
  v_fant := coalesce(interno.fecha_json(p_op -> 'fecha_anticipo'), interno.hoy_mx());
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
  end if;
  -- idempotente por id: reintentar la misma alta no crea otra venta ni gasta otro folio
  select * into e from public.proyectos x where x.id = v_id;
  if found then
    if e.empresa_id = c.empresa_id then return pg_catalog.jsonb_build_object('ok', true, 'ya_existia', true, 'proyecto_id', e.id, 'folio_hoja', e.folio_hoja); end if;
    return interno.err('DATO_INVALIDO', 'Ese id de venta ya existe.');
  end if;
  if v_finst is not null and exists (select 1 from public.instalaciones i where i.id = v_inst_id) then return interno.err('DATO_INVALIDO', 'Ese id de instalación ya existe.'); end if;
  v_folio := interno.folio_texto('V', interno.siguiente(c.empresa_id, 'V', '', 1));
  v_sellos := interno.sellos_limpios(p_op -> 'sellos', v_ahora);
  insert into public.proyectos (id, empresa_id, folio_hoja, folio_local, dispositivo, fuente, historica, nombre, tel, etapa, tipo_trabajo, fecha_anticipo, dir_texto, maps_url,
                                lat, lng, entrega, plazo_k, notas, estatus, iva, sellos, creado_por)
  values (v_id, c.empresa_id, v_folio, v_folio, '', 'manual', false, v_nombre, v_tel, 'ganado', v_tipo, v_fant, coalesce(p_op ->> 'dir_texto', ''), coalesce(p_op ->> 'maps_url', ''),
          v_lat, v_lng, v_entrega, v_plazo, coalesce(p_op ->> 'notas', ''), v_estatus, (v_cuenta <> 'Elias BBVA'), v_sellos, c.usuario_id);
  insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, anticipo, cuenta, pct_comision) values (v_id, c.empresa_id, v_sub, v_anti, v_cuenta, 10);
  perform interno.normalizar_iva(v_id);
  if v_finst is not null then
    insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, hora, ventana, duracion_min, estado, movida, uid_ics, creado_por)
    values (v_inst_id, c.empresa_id, v_id, v_finst, v_hora, 'dia', 180, case when c.area = 'direccion' then 'confirmada' else 'propuesta' end, 0,
            'inst-' || v_inst_id || '@al3d.mx', c.usuario_id);
  end if;
  perform interno.anotar(c, 'general', 'alta', 'proyecto', v_id, 'Se registró ' || v_nombre);
  perform interno.anotar(c, 'dinero', 'alta', 'venta', v_id, 'Venta registrada ' || v_folio, '', null,
                         pg_catalog.jsonb_build_object('subtotal', v_sub, 'anticipo', v_anti, 'cuenta', v_cuenta, 'estatus', v_estatus));
  return pg_catalog.jsonb_build_object('ok', true, 'proyecto_id', v_id, 'folio_hoja', v_folio);
end $$;
revoke all on function public.alta_venta(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.alta_venta(jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 5. proyecto_actualizar: la compuerta de sellos por campo y el permiso por campo (R3)
-- -----------------------------------------------------------------------------------------------------
-- NO toca dinero (eso es `corregir_venta`) ni la etapa (`mover_etapa`) ni la cita (`instalacion_guardar`). Hace, en este orden:
--   1. PERMISO POR CAMPO (la matriz de `matriz_permisos()`), antes de escribir: un campo que el rol no puede escribir —o desconocido, o de dinero,
--      `etapa`, `id`, `folio_*`, `iva`…— va a `rechazadas` y NO aborta el resto.
--   2. por cada GRUPO sellado presente (notas, tel, dir_texto, ubicacion, entrega, plazo_k): se normaliza el valor y decide `interno.compuerta`:
--      `viejo` → `viejos` (NO es error: otro teléfono lo cambió después y gana); `rechazar` → `rechazadas`; `escribir` → se aplica y sube el sello.
--      Sin objeto `sellos` y con campos sellados: DATO_INVALIDO (Q-A05; hoy una operación sin sellos se sella con la hora de llegada y GANA SIEMPRE,
--      lo que dejaba a un reintento tardío regresar el dato). Con el objeto presente, el sello de un grupo que falte vale 0.
--   3. los campos SIN sello (entrecalles, ubicacion_pendiente, contacto, negocio, tipo_trabajo, compromiso_texto, fecha_anticipo): se validan y se
--      escriben (el último en llegar gana, como en el .gs).
--   4. `origen` (solo Dirección): se parte (`partir_origen`): la obra a `proyectos.origen_obra`, el dinero a `ventas_dinero.origen_dinero`.
-- Solo cambian las columnas que CAMBIARON de verdad («volver a guardar la misma nota no la vuelve la más reciente»: ni el valor ni `updated_at` se
-- mueven). Un mismo valor con un sello más nuevo sí sube el sello (converge), y entonces `updated_at` sube. La respuesta trae `remoto`: la fila del
-- proyecto como quedó (jamás dinero).
--   p_op = { id, op_id, campos:{…}, sellos:{ notas:ms, tel:ms, dir_texto:ms, ubicacion:ms, entrega:ms, plazo_k:ms } }
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
    select * into r from interno.compuerta((v_sel ->> g)::bigint, v_sellos, g, v_ahora, v_vacio, v_borrable);
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


-- -----------------------------------------------------------------------------------------------------
-- 6. instalacion_guardar: la cita, su UID y su acoplamiento con la etapa
-- -----------------------------------------------------------------------------------------------------
-- Dirección crea la cita `confirmada`; Fabricación la crea `propuesta` y puede mover y marcar cualquier estado; Pagos no toca la agenda (ROL_SIN_PERMISO).
-- El cliente no elige el estado inicial. UNA cita viva por proyecto: agendar sobre un proyecto que ya tiene una viva la REAGENDA (y devuelve
-- `id_canonico`). `uid_ics` sale del id y no cambia: si el UID cambiara, el calendario duplicaría el evento. `movida` (el SEQUENCE del .ics) sube al
-- reagendar y AL CANCELAR, y nunca baja. El sello de la cita (grupo `instalacion`) vive en `proyectos.sellos`. `anexo` es el RENGLÓN nuevo del registro
-- acumulativo de notas (dos teléfonos no se pisan). Una instalación `hecha` marcada por Dirección pasa el proyecto a `instalado` (transición
-- automática 1; con Fabricación el proyecto se queda donde está).
--   p_op = { id, proyecto_id, fecha, hora, ventana, duracion_min, estado?, anexo?, notas? (solo al crear), sello }
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
    select * into r from interno.compuerta((p.sellos ->> 'instalacion')::bigint, pg_catalog.jsonb_build_object('instalacion', v_sello), 'instalacion', v_ahora, false, true);
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
      select * into r from interno.compuerta((p.sellos ->> 'instalacion')::bigint, pg_catalog.jsonb_build_object('instalacion', v_sello), 'instalacion', v_ahora, false, true);
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
