-- =====================================================================================================
-- 0026_alta_venta_modo.sql — LA BASE MANDA, paso 6: con la hoja mandando, la base NO da de alta una venta sin cotización
-- =====================================================================================================
-- Decisión de Elías del 2026-10-25 («la base manda», docs/BASE-MANDA.md, «Paso 6»). Hasta aquí la regla «una venta sin cotización solo con la
-- base mandando» la cumplía el TELÉFONO: con la empresa en 'hoja' el formulario de «Cobros y abonos» no sale y la capa pura se niega
-- (js/datos/pagos-supa.js). La base, en cambio, aceptaba un `alta_venta` con la hoja mandando —alguien con la consola podía—, y esa alta
-- gastaba un V-### del contador de la BASE que la hoja no conoce: dos contadores repartiendo el mismo número, y una venta que la copia de cada
-- 3 horas no trae de vuelta. Ahora la base también se niega.
--
-- QUÉ CAMBIA: `alta_venta` (la de 0006; ninguna migración posterior la había vuelto a definir), con UN solo paso nuevo, marcado «0026:».
--   Lo demás es idéntico, letra por letra.
--
-- EN QUÉ ORDEN
--   1. el área (`interno.preambulo`): Fabricación sigue recibiendo ROL_SIN_PERMISO, igual exista o no la venta (R1-10), sin mirar el modo;
--   2. la validación de siempre: un alta mal hecha sigue diciendo QUÉ dato falla, mande quien mande;
--   3. «ya existía»: el reintento de un alta que SÍ entró con la base mandando y llega después de volver a la hoja contesta la verdad (la
--      misma venta, el mismo folio), no «no se registró»;
--   4. 0026: el modo. Con la empresa en 'hoja', un «no» definitivo y NADA escrito: ni proyecto, ni dinero, ni cita, ni bitácora, ni un número
--      del contador (el V-### se reparte DESPUÉS de este paso). El modo se lee con FOR SHARE: `modo_cambiar` lo lee con FOR UPDATE, así que
--      un cambio de modo y un alta no se cruzan (o el alta ve el modo de antes del cambio y termina primero, o espera y ve el nuevo).
--
-- EL CÓDIGO: DATO_INVALIDO. Es como la base se niega por el ESTADO de las cosas («No se agenda un proyecto cancelado», «Una fila histórica no
--   tiene instalaciones»: 0013/0017) y es definitivo: la bandeja y la pantalla no insisten, y «Cobros y abonos» enseña la frase tal cual
--   (`mensajeDe`: «… No se registró nada.»). No ROL_SIN_PERMISO: el área sí puede dar de alta (la matriz de 0017 no cambia), y la pantalla
--   diría «Dar de alta una venta es de Dirección y Pagos», que aquí es falso. Tampoco uno de los de la puerta (SIN_ACCESO, ACCESO_REVOCADO…):
--   esos no son definitivos y PARAN el bombeo de la bandeja (js/datos/supa-relevo.js), como si la cuenta no pudiera escribir nada.
--
-- QUIÉN MÁS LLAMA A `alta_venta` CON LA HOJA MANDANDO: nadie, y sigue funcionando todo lo de siempre.
--   · La copia de cada 3 horas (`importar-diario` → scripts/importador/sql.mjs) escribe las ventas de la hoja DIRECTO en las tablas, con
--     service_role (que ni siquiera puede ejecutar esta RPC: es de cliente). Lo comprueba supabase/tests/acceso/modo.mjs (MO-07).
--   · La sombra (js/datos/supa-sombra.js) y el relevo traducen la bandeja con js/datos/supa-traductor.js, que nunca produce `alta_venta`.
--   · La prueba de humo (opcional/prueba-de-humo.sql) la usaba para sembrar su venta: ahora pone la empresa en 'base' DENTRO de su
--     transacción (que se deshace sola) y su bloque 13 comprueba esto mismo con la hoja mandando.
--
-- LA AUDITORÍA: ninguna función nueva, así que las listas cerradas de cliente y de servicio (y la de Realtime, 14) no cambian, y las
--   auditorías de antes (0011, 0019, 0022–0025) siguen siendo correctas tal cual. Se vuelve a definir aquí, igual a la de 0025, y la aduana
--   corre al final, como en cada migración.
--
-- Depende de: 0001…0025 (`empresas.modo` es de 0024). Idempotente. Termina corriendo la auditoría.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. alta_venta: la de 0006, y con la hoja mandando, no
-- -----------------------------------------------------------------------------------------------------
-- «Registrar nueva venta» (el menú de la hoja, que Pagos usa): una venta que NO viene de una cotización de la plataforma. Dirección y Pagos
-- (`Q-A03`). Valida como el diálogo: nombre, cuenta (obligatoria), subtotal, anticipo ≥ 0, y el teléfono (≥ 10 dígitos) y la entrega son
-- OBLIGATORIOS. Idempotente por `id`. Con `fecha_instalacion`, la cita nace `confirmada` si la da Dirección y `propuesta` si la da Pagos.
-- 0026: solo con la empresa en modo 'base' (arriba, «EN QUÉ ORDEN»).
--   p_op = { id, nombre, cuenta, estatus?, tipo_trabajo[], subtotal, anticipo?, fecha_anticipo?, fecha_instalacion?, hora?, tel, entrega,
--            dir_texto?, maps_url?, lat?, lng?, notas?, plazo_k?, sellos, instalacion_id? }
create or replace function public.alta_venta(p_op jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; c interno.contexto_t; v_id text; v_nombre text; v_cuenta text; v_estatus text; v_sub numeric; v_anti numeric; v_tel text; v_entrega text; v_tipo text[];
  v_plazo smallint; v_lat double precision; v_lng double precision; v_fant date; v_finst date; v_hora text; v_inst_id text; v_folio text; e public.proyectos;
  v_ahora bigint := interno.ahora_ms(); v_sellos jsonb; v_modo text;
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
  -- 0026: lo nuevo, solo con la base mandando. Con la hoja, la venta sin cotización se registra en la hoja: aquí gastaría un V-### del contador
  --       de la base que la hoja no conoce. Antes de escribir nada y antes de repartir el folio; FOR SHARE frente al FOR UPDATE de modo_cambiar.
  select x.modo into v_modo from public.empresas x where x.id = c.empresa_id for share;
  if v_modo is distinct from 'base' then
    return interno.err('DATO_INVALIDO', 'La empresa todavía trabaja con la hoja: una venta sin cotización se registra en la hoja, con «Registrar nueva venta». '
                                        || 'Aquí saldría con un V-### que la hoja no conoce.');
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
-- 2. La auditoría (igual a la de 0025: las listas cerradas no cambian)
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
  -- 0026: sin funciones nuevas ni tablas publicadas: las listas son las de 0025.
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
    raise exception E'AUDITORIA DE SEGURIDAD (0026): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
