-- =====================================================================================================
-- 0025_gastos.sql — LA BASE MANDA, paso 3: los GASTOS se escriben en la base y van por Realtime
-- =====================================================================================================
-- Paso 3 de «la base manda» (docs/BASE-MANDA.md). `0020` les dio casa a los gastos, pero solo los escribía la copia de la hoja: «las RPC
-- para capturar y anular desde la plataforma llegan cuando se encienda Supabase en los teléfonos». Con la empresa en modo 'base' (0024) la
-- bandeja del teléfono escribe directo en la base (js/datos/supa-relevo.js), y hasta este archivo los gastos se quedaban esperando en cada
-- teléfono porque no había a dónde mandarlos. Aquí está a dónde.
--
-- LAS DOS FUNCIONES, con la regla de `/empujar_gastos` (`gastoUnaOperacion_` de puente/hoja-apps-script.gs), para que pasar de la hoja a
-- la base no cambie lo que pasa con un gasto:
--   · `gasto_registrar(p_op)`: el alta, con el id que puso el teléfono (`gas-…`). Si ese id ya está, «ya estaba» y no se escribe nada;
--     salvo que traiga la anulación y el de la base no la tenga: entonces se anula, y nada más (ni el monto ni el concepto se tocan). Si
--     no está, se da de alta con lo que trae, anulado o no. Así el orden en que lleguen el alta y la anulación no importa.
--   · `gasto_anular(p_op)`: «Anulado: Sí», quién y cuándo. Uno ya anulado es «ya estaba». Si la base no lo tiene y la operación trae el
--     gasto entero (`p_op.gasto`: el teléfono lo manda siempre, como a la hoja), se da de alta ya anulado: es la misma regla de la hoja.
--   Un gasto no se corrige ni se borra: se anula y se vuelve a capturar. No hay «editar» por la misma razón que en la hoja.
--   Las mismas validaciones que `gastoValidar_` del .gs y `validar` de js/datos/gastos.js (el día, el concepto de 1 a 200, la categoría de
--   la lista, el monto mayor que cero y hasta diez millones, la cuenta de las cinco o vacía, el folio hasta 40). La categoría la cuida el
--   CHECK de la tabla (0020): una lista menos que copiar.
--
-- QUIÉN. Los mismos de la hoja (`GASTOS_ROLES` del .gs: dirección y pagos, para escribir y para leer; la misma frontera que `VE_EL_DINERO`)
--   y de la app de hoy (js/datos/gastos.js: `registrar` y `anular` piden `Prefs.veDinero()`). Fabricación recibe ROL_SIN_PERMISO en las
--   dos, definitivo: el teléfono lo aparta con su razón y no insiste. Cualquiera de las dos áreas anula cualquier gasto de su empresa,
--   como en la hoja.
--
-- IDEMPOTENTES POR `op_id`. El id de la operación de la bandeja viaja como `p_op.op_id` y se guarda en la línea de la bitácora
--   (`gasto:<op>` el alta, `anulo:<op>` la anulación) con la respuesta: el reintento de una respuesta que se perdió devuelve lo mismo. Y
--   además por el id del gasto: aunque la operación sea otra (un gasto que se volvió a encolar), el mismo gasto no entra dos veces.
--
-- LA BITÁCORA. Una línea de nivel DINERO por lo que sí se escribió (`interno.anotar`, dentro de la misma transacción): «Gasto de $1,500.00:
--   …» o «Se anuló el gasto de …». La tabla de la bitácora aprende la entidad `gasto` (su CHECK de 0001 no la tenía). «Ya estaba» no anota.
--
-- REALTIME. `gastos` entra a `supabase_realtime` con su identidad de réplica por DEFAULT (en un UPDATE o DELETE solo viaja la llave), y la
--   lista cerrada de la auditoría pasa de 13 a 14. Realtime respeta la RLS de 0020: el aviso solo llega a Dirección y Pagos de esa empresa,
--   y un gasto no se borra nunca (`sin_borrar`). La lectura no cambia (0020: `gastos_sel_dinero`, Dirección y Pagos; Fabricación no ve ni
--   una fila, como hoy en la app, donde Control y los gastos no son suyos).
--
-- LAS AUDITORÍAS DE ANTES. Las dos funciones nuevas entran a la lista cerrada de cliente de TODAS las versiones de `interno.auditoria()`
--   (0011, 0019, 0022, 0023, 0024 y esta), como hizo 0024 con `modo_cambiar`: volver a correr un archivo anterior no debe abortar. La
--   lista de Realtime crece a 14 SOLO aquí: las auditorías de antes corren cuando `gastos` todavía no está publicada, así que no la pueden
--   exigir; pero sí la ADMITEN publicada (`c_publicables`), porque volver a correr `0011` sobre una base con 0025 —el README lo recomienda
--   después de cada migración— no debe abortar.
--
-- LO QUE NO HACE
--   · No cambia el modo. Con la hoja mandando nadie llama a estas funciones: la bandeja va a la hoja y la sombra no copia gastos (la copia
--     de cada 3 horas ya los trae). Si alguien las llamara con la hoja mandando, la copia le pondría lápida a lo que no está en la hoja.
--   · No revive un gasto con lápida (`deleted_at`: alguien lo quitó de la pestaña mientras la hoja mandaba): «ya estaba», sin tocarlo.
--
-- Depende de: 0001…0024. Idempotente. Termina corriendo la auditoría.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. La bitácora aprende la entidad `gasto`
-- -----------------------------------------------------------------------------------------------------
-- El CHECK de 0001 (columna `entidad`, nombre por omisión `bitacora_entidad_check`), con `gasto` al final. Se quita y se vuelve a poner:
-- idempotente, y una fila de antes ya cumple la lista nueva (que solo crece).
alter table public.bitacora drop constraint if exists bitacora_entidad_check;
alter table public.bitacora add constraint bitacora_entidad_check
  check (entidad in ('proyecto','instalacion','material','constante','almacen','cotizacion','autorizacion','abono','venta','miembro','plataforma','sistema','gasto'));


-- -----------------------------------------------------------------------------------------------------
-- 2. Ayudantes (solo los llaman las dos RPC: nadie más tiene EXECUTE)
-- -----------------------------------------------------------------------------------------------------

-- Un instante que manda el teléfono, en milisegundos (`registrado_en`, `anulado_en` de js/datos/gastos.js), como timestamptz; NULL si no
-- es un número o no es razonable (antes de 2020 o después de mañana: un reloj mal puesto no escribe un gasto del año 2099). Quien llama
-- pone entonces la hora del servidor. Es un dato DECLARADO por el teléfono, como en la columna «Registrado el» de la hoja.
create or replace function interno.gasto_instante(j jsonb) returns timestamptz language plpgsql stable set search_path = '' as $$
declare v numeric := interno.num(j); t timestamptz;
begin
  if v is null or v <= 0 then return null; end if;
  t := pg_catalog.to_timestamp(v / 1000.0);
  if t < timestamptz '2020-01-01 00:00:00+00' or t > pg_catalog.now() + interval '1 day' then return null; end if;
  return t;
exception when others then return null;
end $$;
revoke all on function interno.gasto_instante(jsonb) from public, anon, authenticated, service_role;

-- El alta de un gasto que la base NO tiene. Valida como `gastoValidar_` del .gs y escribe con su línea de bitácora. Si otro lo dio de alta
-- en este mismo instante (el mismo id, dos teléfonos), «ya estaba». `p_op_id` ya trae su prefijo (`gasto:` o `anulo:`).
create or replace function interno.gasto_alta(p_ctx interno.contexto_t, p jsonb, p_op_id text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_id text; v_fecha date; v_concepto text; v_cat text; v_monto numeric; v_cuenta text; v_folio text; v_correo text := coalesce(interno.correo_verificado(), '');
        v_anulado boolean; v_anulo text; v_restr text; v_n int; v_resp jsonb;
begin
  v_id := pg_catalog.btrim(coalesce(p ->> 'id', ''));
  if v_id !~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,79}$' then
    return interno.err('DATO_INVALIDO', 'La base no aceptó ese gasto: no trae su id, o no sirve.'); end if;
  v_fecha := interno.fecha_json(p -> 'fecha');
  if v_fecha is null or v_fecha < date '2000-01-01' or v_fecha > date '2100-12-31' then
    return interno.err('DATO_INVALIDO', 'La base no aceptó ese gasto: no dice qué día se pagó.'); end if;
  v_concepto := pg_catalog.btrim(coalesce(p ->> 'concepto', ''));
  if v_concepto = '' then return interno.err('DATO_INVALIDO', 'La base no aceptó ese gasto: no dice en qué se gastó.'); end if;
  if pg_catalog.length(v_concepto) > 200 then return interno.err('DATO_INVALIDO', 'La base no aceptó ese gasto: el concepto es demasiado largo.'); end if;
  v_cat := coalesce(p ->> 'categoria', '');
  v_monto := interno.num(p -> 'monto');
  if v_monto is null or v_monto <= 0 then return interno.err('DATO_INVALIDO', 'La base no aceptó ese gasto: el monto no es un número mayor que cero.'); end if;
  if v_monto > 10000000 then return interno.err('DATO_INVALIDO', 'La base no aceptó ese gasto: el monto es de más de diez millones.'); end if;
  v_monto := round(v_monto, 2);
  if v_monto <= 0 then return interno.err('DATO_INVALIDO', 'La base no aceptó ese gasto: el monto no es un número mayor que cero.'); end if;
  -- la cuenta: vacía (efectivo u otra) o una de las cinco de la hoja (`CUENTAS` del .gs y de js/datos/puente.js, como en 0006 y 0007)
  v_cuenta := pg_catalog.btrim(coalesce(p ->> 'cuenta', ''));
  if v_cuenta <> '' and v_cuenta <> all (array['Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT']) then
    return interno.err('DATO_INVALIDO', 'La base no aceptó ese gasto: esa cuenta no es una de las de la empresa.'); end if;
  v_folio := pg_catalog.btrim(coalesce(p ->> 'folio', ''));
  if pg_catalog.length(v_folio) > 40 then return interno.err('DATO_INVALIDO', 'La base no aceptó ese gasto: el folio es demasiado largo.'); end if;
  v_anulado := (p -> 'anulado') = 'true'::jsonb;
  v_anulo := case when v_anulado then pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p ->> 'anulo'), ''), v_correo), 200) else '' end;

  begin
    insert into public.gastos (empresa_id, id, fecha, concepto, categoria, monto, cuenta, folio, registro_por, registrado_en,
                               anulado, anulo, anulado_en, subio, procedencia)
    values (p_ctx.empresa_id, v_id, v_fecha, v_concepto, v_cat, v_monto, v_cuenta, v_folio,
            pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p ->> 'registro_por'), ''), v_correo), 200),
            coalesce(interno.gasto_instante(p -> 'registrado_en'), pg_catalog.now()),
            v_anulado, v_anulo, case when v_anulado then coalesce(interno.gasto_instante(p -> 'anulado_en'), pg_catalog.now()) end,
            -- «Subió» de la hoja: con qué cuenta entró. Aquí, el correo que Google confirmó (nunca lo que diga el teléfono)
            pg_catalog.left(v_correo, 200),
            pg_catalog.jsonb_build_object('via', 'plataforma', 'op_id', p_op_id))
    on conflict (empresa_id, id) do nothing;
    get diagnostics v_n = row_count;
  exception when check_violation then
    get stacked diagnostics v_restr = constraint_name;
    return interno.err('DATO_INVALIDO', case when v_restr = 'gastos_categoria_check' then 'La base no aceptó ese gasto: «' || pg_catalog.left(v_cat, 60) || '» no es una categoría de gasto.'
                                             else 'La base no aceptó ese gasto (' || coalesce(v_restr, 'una regla de la tabla') || ').' end);
  end;
  if v_n = 0 then return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'ya_estaba', true); end if;

  v_resp := pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'creado', true, 'anulado', v_anulado);
  perform interno.anotar(p_ctx, 'dinero', 'registro', 'gasto', v_id,
                         'Gasto de ' || interno.pesos(v_monto) || ': ' || v_concepto,
                         v_cat || case when v_cuenta <> '' then ' · ' || v_cuenta else '' end || case when v_folio <> '' then ' · ' || v_folio else '' end
                           || ' · ' || v_fecha::text || case when v_anulado then ' · llegó ya anulado' else '' end,
                         null, pg_catalog.jsonb_build_object('fecha', v_fecha, 'concepto', v_concepto, 'categoria', v_cat, 'monto', v_monto,
                                                             'cuenta', v_cuenta, 'folio', v_folio, 'anulado', v_anulado),
                         p_op_id, v_resp);
  return v_resp;
end $$;
revoke all on function interno.gasto_alta(interno.contexto_t, jsonb, text) from public, anon, authenticated, service_role;

-- La anulación de un gasto que la base tiene vivo (sin anular y sin lápida). Quién: lo que mande el teléfono (su sello, como en la hoja) o,
-- si no manda nada, el correo de la cuenta; cuándo: lo que mande, si es razonable, o ahora.
create or replace function interno.gasto_anulacion(p_ctx interno.contexto_t, g public.gastos, p jsonb, p_op_id text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_anulo text := pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p ->> 'anulo'), ''), interno.correo_verificado(), ''), 200);
        v_resp jsonb;
begin
  update public.gastos set anulado = true, anulo = v_anulo, anulado_en = coalesce(interno.gasto_instante(p -> 'anulado_en'), pg_catalog.now())
   where empresa_id = g.empresa_id and id = g.id;
  v_resp := pg_catalog.jsonb_build_object('ok', true, 'id', g.id, 'anulado', true);
  perform interno.anotar(p_ctx, 'dinero', 'anulo', 'gasto', g.id,
                         'Se anuló el gasto de ' || interno.pesos(g.monto) || ': ' || g.concepto, g.categoria || ' · ' || g.fecha::text,
                         pg_catalog.jsonb_build_object('anulado', false), pg_catalog.jsonb_build_object('anulado', true, 'anulo', v_anulo),
                         p_op_id, v_resp);
  return v_resp;
end $$;
revoke all on function interno.gasto_anulacion(interno.contexto_t, public.gastos, jsonb, text) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. Las dos RPC de cliente
-- -----------------------------------------------------------------------------------------------------
-- p_op = { op_id, id, fecha, concepto, categoria, monto, cuenta, folio, registro_por, registrado_en (ms), anulado, anulo, anulado_en (ms) }
create or replace function public.gasto_registrar(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_op text; v_id text; r jsonb; g public.gastos;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_op is null or pg_catalog.jsonb_typeof(p_op) <> 'object' then return interno.err('DATO_INVALIDO', 'La operación no trae el gasto.'); end if;
  v_op := nullif(pg_catalog.btrim(coalesce(p_op ->> 'op_id', '')), '');
  if pg_catalog.length(v_op) > 100 then return interno.err('DATO_INVALIDO', 'El id de la operación es demasiado largo.'); end if;
  if v_op is not null then
    select b.resultado into r from public.bitacora b where b.empresa_id = (pre.c).empresa_id and b.op_id = 'gasto:' || v_op;
    if found and r is not null then return r; end if;          -- el reintento de una respuesta que se perdió: lo mismo
  end if;
  v_id := pg_catalog.btrim(coalesce(p_op ->> 'id', ''));
  select * into g from public.gastos x where x.empresa_id = (pre.c).empresa_id and x.id = v_id for update;
  if found then
    -- ya está: «ya estaba», salvo que traiga la anulación y la base no la tenga (la regla de la hoja). Una lápida no se revive.
    if (p_op -> 'anulado') = 'true'::jsonb and not g.anulado and g.deleted_at is null then
      return interno.gasto_anulacion(pre.c, g, p_op, 'gasto:' || v_op);
    end if;
    return pg_catalog.jsonb_build_object('ok', true, 'id', g.id, 'ya_estaba', true);
  end if;
  return interno.gasto_alta(pre.c, p_op, 'gasto:' || v_op);
end $$;
revoke all on function public.gasto_registrar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.gasto_registrar(jsonb, text) to authenticated;

-- p_op = { op_id, id, anulo, anulado_en (ms), gasto? (el gasto entero, por si la base no lo tiene) }
create or replace function public.gasto_anular(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_op text; v_id text; r jsonb; g public.gastos;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','pagos']);
  if pre.e is not null then return pre.e; end if;
  if p_op is null or pg_catalog.jsonb_typeof(p_op) <> 'object' then return interno.err('DATO_INVALIDO', 'La operación no dice qué gasto anular.'); end if;
  v_op := nullif(pg_catalog.btrim(coalesce(p_op ->> 'op_id', '')), '');
  if pg_catalog.length(v_op) > 100 then return interno.err('DATO_INVALIDO', 'El id de la operación es demasiado largo.'); end if;
  if v_op is not null then
    select b.resultado into r from public.bitacora b where b.empresa_id = (pre.c).empresa_id and b.op_id = 'anulo:' || v_op;
    if found and r is not null then return r; end if;
  end if;
  v_id := pg_catalog.btrim(coalesce(p_op ->> 'id', ''));
  if v_id = '' then return interno.err('DATO_INVALIDO', 'La operación no dice qué gasto anular.'); end if;
  select * into g from public.gastos x where x.empresa_id = (pre.c).empresa_id and x.id = v_id for update;
  if not found then
    -- la anulación llegó y el alta no (o nunca llegará): con el gasto entero se da de alta ya anulado, como en la hoja
    if pg_catalog.jsonb_typeof(p_op -> 'gasto') = 'object' then
      return interno.gasto_alta(pre.c, (p_op -> 'gasto') || pg_catalog.jsonb_build_object('id', v_id, 'anulado', true,
                                  'anulo', coalesce(p_op -> 'anulo', 'null'::jsonb), 'anulado_en', coalesce(p_op -> 'anulado_en', 'null'::jsonb)),
                                'anulo:' || v_op);
    end if;
    return interno.err('NO_ENCONTRADO', 'Ese gasto no está en la base.');
  end if;
  if g.anulado or g.deleted_at is not null then return pg_catalog.jsonb_build_object('ok', true, 'id', g.id, 'ya_estaba', true); end if;
  return interno.gasto_anulacion(pre.c, g, p_op, 'anulo:' || v_op);
end $$;
revoke all on function public.gasto_anular(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.gasto_anular(jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 4. Realtime: la tabla entra a la publicación (lista cerrada, ahora de 14)
-- -----------------------------------------------------------------------------------------------------
-- Como las demás (0001, 0003, 0005…): identidad de réplica por DEFAULT, y el evento es solo un AVISO: el teléfono responde con una
-- lectura (js/datos/supa-relevo.js). La lectura y su RLS son las de 0020; no cambian.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.gastos replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gastos') then
    alter publication supabase_realtime add table public.gastos;
  end if;
end $$;


-- -----------------------------------------------------------------------------------------------------
-- 5. La auditoría, con las dos RPC en la lista cerrada de cliente y `gastos` en la de Realtime
-- -----------------------------------------------------------------------------------------------------
create or replace function interno.auditoria() returns text[]
language plpgsql stable set search_path = '' as $$
declare
  c_cliente     constant text[] := array['agente_decidir','almacen_aplicar','alta_venta','cancelar_solicitud','comisiones_cobradas','constante_guardar','corregir_abono','corregir_venta','cotizacion_guardar',
                                         'cuaderno_guardar','descartar_cotizacion','emitir_salidas_derivadas','estado_solicitudes','ganar_proyecto','gasto_anular','gasto_registrar','instalacion_guardar','mi_acceso','miembro_alta',
                                         'miembro_baja','miembro_cambiar_area','modo_cambiar','mover_etapa','pantalla_aprobar','pantalla_revocar','proyecto_actualizar','rechazar_solicitud','reclamar_acceso','registrar_abono_comision','registrar_cobro',
                                         'repartir_abono_fifo','revocar_autorizacion','solicitar','subida_unica','tarifas_guardar','tarifas_leer','version_contrato','vista_previa_reparto'];
  c_servicio    constant text[] := array['agente_abrir','agente_guardar','agente_leer','autorizacion_para_verificar','contador_sembrar','cuadre_hoja','ia_cuota','ia_turno','pantalla_solicitar','pantalla_tablero','registrar_autorizacion','tarifas_de','verificar_cupo'];
  c_int_cliente constant text[] := array['comision','empresas_donde','hoy_mx','neto'];
  c_int_servicio constant text[] := array['comision','contiene_dinero','empresas_donde','hoy_mx','neto','sellos_validos'];
  c_vistas_cli  constant text[] := array['comisiones_pendientes','ventas_calculadas'];
  -- 0025: `gastos` entra a Realtime con sus dos RPC. Desde aquí se EXIGE publicada (las auditorías de antes solo la admiten).
  c_publicadas  constant text[] := array['abonos','almacen_costos','almacen_movimientos','bitacora','constantes','cotizaciones','gastos','instalaciones','materiales','miembros','proyectos',
                                         'requerimientos','solicitudes','ventas_dinero'];
  v text[] := '{}'; r record; t text;
begin
  -- ---- GR-03: toda tabla de `public` con RLS; `contadores` sin NINGUNA política (denegado por defecto) ---------------------------------------------
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1 loop
    v := v || format('GR-03 la tabla public.%I no tiene RLS encendida', r.relname);
  end loop;
  for r in select p.polname, c.relname from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'contadores' order by 1 loop
    v := v || format('GR-03 public.contadores no debe tener políticas y tiene «%s»', r.polname);
  end loop;

  -- ---- GR-01 y GR-07: funciones de `public` e `interno` ---------------------------------------------------------------------------------------------
  for r in select n.nspname, p.proname, p.oid, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, p.proconfig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'interno') and p.prokind in ('f', 'p')
              and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
              -- Las funciones de DISPARADOR DE EVENTO no son una puerta: Postgres las rechaza si alguien intenta llamarlas como RPC
              -- («trigger functions can only be called as triggers»). Con «RLS automático» encendido en el proyecto, Supabase instala una
              -- así en `public` (`rls_auto_enable`); lo descubrió la primera corrida de esta auditoría contra el proyecto real de pruebas
              -- (2026-10-10), que abortó por ella. Solo se exime el tipo `event_trigger`: una función `trigger` nuestra sí se audita.
              and p.prorettype <> 'pg_catalog.event_trigger'::regtype
            order by 1, 2, 4 loop
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      v := v || format('GR-01 la función %s.%s(%s) es ejecutable por anon/PUBLIC (falta su REVOKE)', r.nspname, r.proname, r.args);
    end if;
    if r.prosecdef and not coalesce(r.proconfig, '{}') @> array['search_path=""'] then
      v := v || format('GR-07 la función SECURITY DEFINER %s.%s(%s) no fija search_path = ''''', r.nspname, r.proname, r.args);
    end if;
    -- ---- GR-02: qué ejecuta cada rol en `public` ----------------------------------------------------------------------------------------------
    if r.nspname = 'public' then
      if r.proname = any (c_cliente) then
        if not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la RPC de cliente public.%s(%s) no es ejecutable por authenticated (falta su GRANT)', r.proname, r.args);
        end if;
      elsif r.proname = any (c_servicio) then
        if has_function_privilege('authenticated', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la RPC de servicio public.%s(%s) es ejecutable por authenticated: solo service_role la llama', r.proname, r.args);
        end if;
        if not has_function_privilege('service_role', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la RPC de servicio public.%s(%s) no es ejecutable por service_role (falta su GRANT)', r.proname, r.args);
        end if;
      else
        v := v || format('GR-02 la función public.%s(%s) no está en las listas cerradas (RPC de cliente o de servicio): decide a quién pertenece y agrégala', r.proname, r.args);
        if has_function_privilege('authenticated', r.oid, 'EXECUTE') then
          v := v || format('GR-02 la función public.%s(%s) es ejecutable por authenticated y no es una RPC de cliente', r.proname, r.args);
        end if;
      end if;
    else
      -- ---- GR-08: el esquema `interno` ------------------------------------------------------------------------------------------------------
      if has_function_privilege('authenticated', r.oid, 'EXECUTE') and not r.proname = any (c_int_cliente) then
        v := v || format('GR-08 la función interno.%s(%s) es ejecutable por authenticated y no es de las cuatro que usan las políticas', r.proname, r.args);
      end if;
      if has_function_privilege('service_role', r.oid, 'EXECUTE') and not r.proname = any (c_int_servicio) then
        v := v || format('GR-08 la función interno.%s(%s) es ejecutable por service_role y no es de las seis permitidas', r.proname, r.args);
      end if;
      if r.proname = any (c_int_cliente) and not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
        v := v || format('GR-08 interno.%s(%s) debe ser ejecutable por authenticated: la evalúan las políticas y la vista', r.proname, r.args);
      end if;
    end if;
  end loop;
  if has_schema_privilege('anon', 'interno', 'USAGE') or has_schema_privilege('anon', 'interno', 'CREATE') then
    v := v || 'GR-08 anon tiene privilegios sobre el esquema interno'::text;
  end if;
  foreach t in array array['authenticated', 'service_role'] loop
    if not has_schema_privilege(t, 'interno', 'USAGE') then v := v || format('GR-08 %s no tiene USAGE sobre el esquema interno (las políticas y las vistas no corren)', t); end if;
    if has_schema_privilege(t, 'interno', 'CREATE') then v := v || format('GR-08 %s puede CREAR objetos en el esquema interno', t); end if;
  end loop;
  foreach t in array array['anon', 'authenticated'] loop
    if has_schema_privilege(t, 'public', 'CREATE') then v := v || format('GR-06 %s puede CREAR objetos en el esquema public', t); end if;
  end loop;

  -- ---- GR-04: toda vista con security_invoker (si no, corre con los privilegios de su dueño y SALTA la RLS); nada materializado en `public` -------------
  for r in select c.relname, c.relkind, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v', 'm') order by 1 loop
    if r.relkind = 'm' then
      v := v || format('GR-04 public.%I es una vista MATERIALIZADA: PostgREST la expondría sin RLS', r.relname);
    elsif not coalesce(r.reloptions, '{}') && array['security_invoker=true', 'security_invoker=on', 'security_invoker=1'] then
      v := v || format('GR-04 la vista public.%I no tiene security_invoker = true: saltaría la RLS de sus tablas', r.relname);
    end if;
  end loop;

  -- ---- GR-05: Realtime = lista cerrada, y ninguna con la fila vieja completa ------------------------------------------------------------------------
  for r in select pt.tablename from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' order by 1 loop
    if not r.tablename = any (c_publicadas) then v := v || format('GR-05 public.%I está publicada en supabase_realtime y no es de las 14 de la lista cerrada', r.tablename); end if;
  end loop;
  foreach t in array c_publicadas loop
    if not exists (select 1 from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = t) then
      v := v || format('GR-05 public.%I debe estar publicada en supabase_realtime', t);
    end if;
  end loop;
  for r in select c.relname, c.relreplident from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relreplident <> 'd'
              and exists (select 1 from pg_publication_tables pt where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = c.relname) order by 1 loop
    v := v || format('GR-05 public.%I está publicada con replica identity «%s» (full/index): un DELETE llevaría la fila vieja a quien no la puede leer', r.relname, r.relreplident);
  end loop;

  -- ---- GR-06: privilegios sobre tablas, vistas y secuencias de `public` -----------------------------------------------------------------------------
  --   anon: NADA. authenticated: solo SELECT, y en tablas solo donde hay política; en vistas, solo las dos de fórmulas. service_role: sin DELETE ni TRUNCATE.
  for r in select c.oid, c.relname, c.relkind, exists (select 1 from pg_policy p where p.polrelid = c.oid) as con_politica
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') order by 2 loop
    if has_table_privilege('anon', r.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') or has_any_column_privilege('anon', r.oid, 'SELECT, INSERT, UPDATE, REFERENCES') then
      v := v || format('GR-06 anon tiene privilegios sobre public.%I (debe tener ninguno)', r.relname);
    end if;
    if has_any_column_privilege('authenticated', r.oid, 'INSERT') then v := v || format('GR-06 authenticated puede INSERTAR en public.%I: se escribe solo por RPC', r.relname); end if;
    if has_any_column_privilege('authenticated', r.oid, 'UPDATE') then v := v || format('GR-06 authenticated puede ACTUALIZAR public.%I: se escribe solo por RPC', r.relname); end if;
    if has_table_privilege('authenticated', r.oid, 'DELETE') then v := v || format('GR-06 authenticated puede BORRAR en public.%I', r.relname); end if;
    if has_table_privilege('authenticated', r.oid, 'TRUNCATE, REFERENCES, TRIGGER') then v := v || format('GR-06 authenticated tiene TRUNCATE/REFERENCES/TRIGGER sobre public.%I', r.relname); end if;
    if has_any_column_privilege('authenticated', r.oid, 'SELECT') then
      if r.relkind in ('r', 'p') and not r.con_politica then
        v := v || format('GR-06 authenticated puede leer public.%I y la tabla no tiene ninguna política (la RLS la deja cerrada: el GRANT sobra)', r.relname);
      elsif r.relkind in ('v', 'm', 'f') and not r.relname = any (c_vistas_cli) then
        v := v || format('GR-06 authenticated puede leer la vista public.%I y no es de las dos de fórmulas', r.relname);
      end if;
    elsif r.relkind in ('v') and r.relname = any (c_vistas_cli) then
      v := v || format('GR-06 authenticated debe poder leer la vista public.%I (la usa el teléfono)', r.relname);
    end if;
    if has_table_privilege('service_role', r.oid, 'DELETE, TRUNCATE') then
      v := v || format('GR-06 service_role puede BORRAR en public.%I: nada de negocio se borra (BYPASSRLS salta la RLS, no los privilegios, y este no se le da)', r.relname);
    end if;
  end loop;
  for r in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'interno') and c.relkind = 'S' order by 2 loop
    if has_sequence_privilege('anon', r.oid, 'USAGE, SELECT, UPDATE') or has_sequence_privilege('authenticated', r.oid, 'USAGE, SELECT, UPDATE') then
      v := v || format('GR-06 anon o authenticated tienen privilegios sobre la secuencia %I', r.relname);
    end if;
  end loop;

  -- ---- GR-09: nada de negocio se borra: toda tabla de `public` (salvo `contadores`, que limpia sus ventanas vencidas, y `pantallas` (0022), que borra
  --      los CÓDIGOS de vinculación que vencieron hace más de un día: una TV que pidió código y nadie aprobó no es negocio) lleva su trigger `sin_borrar` ----
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname not in ('contadores', 'pantallas')
              and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and not g.tgisinternal and g.tgenabled <> 'D' and g.tgfoid = 'interno.sin_borrar()'::regprocedure)
            order by 1 loop
    v := v || format('GR-09 la tabla public.%I no tiene su trigger sin_borrar (o está desactivado)', r.relname);
  end loop;

  return v;
end $$;
-- Solo la lee quien administra (el dueño y los superusuarios): ningún rol de la aplicación la ejecuta (GR-08).
revoke all on function interno.auditoria() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- La aduana otra vez
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0025): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
