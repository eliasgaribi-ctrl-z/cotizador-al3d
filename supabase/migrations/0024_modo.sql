-- =====================================================================================================
-- 0024_modo.sql — QUIÉN MANDA: la hoja o la base. Un interruptor por empresa, guardado en la base
-- =====================================================================================================
-- Elías lo pidió el 2026-10-25: que todo se guarde en Supabase y se sincronice en todos los teléfonos, y dejar de tocar el
-- puente y los scripts de la hoja. Es el primer paso del «día del cambio» (docs/ESTADO-SUPABASE.md, «Lo que falta para el día
-- del cambio»; el plan por pasos, docs/BASE-MANDA.md).
--
-- POR QUÉ UN INTERRUPTOR DE LA EMPRESA Y NO UNO POR TELÉFONO
--   Mientras la hoja manda, la copia de cada 3 horas (importar-diario) pisa la base con lo de la hoja: la liquidación, la etapa,
--   el anticipo. Un cobro capturado solo en la base desde un teléfono «encendido» se revertiría en la siguiente copia. Y habría
--   dos contadores de V-###: el de la hoja y el de la base. Por eso el modo es UNO para toda la empresa y vive aquí: cada
--   teléfono lo lee de `mi_acceso`, y la copia lo mira antes de aplicar nada.
--
-- LOS DOS MODOS
--   · 'hoja' (el de hoy, el de siempre): la hoja es la fuente; la base recibe la copia de cada 3 horas.
--   · 'base': la base es la fuente. La copia ya no aplica nada (solo cuadra, para ver si alguien siguió escribiendo en la hoja).
--
-- QUIÉN PUEDE QUÉ
--   · `modo_cambiar`: RPC de cliente; por dentro solo Dirección. Deja línea en la bitácora (nivel dirección).
--   · `mi_acceso` dice el modo (de cada empresa y el de la elegida): cualquier sesión, como antes.
--
-- LO QUE NO HACE
--   · No cambia el modo: la empresa queda en 'hoja'. Pasar a 'base' es el día del cambio, con su lista (docs/BASE-MANDA.md).
-- =====================================================================================================

alter table public.empresas add column if not exists modo text not null default 'hoja';
alter table public.empresas add column if not exists modo_desde timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_modo_valido' and conrelid = 'public.empresas'::regclass) then
    alter table public.empresas add constraint empresas_modo_valido check (modo in ('hoja', 'base'));
  end if;
end $$;

-- -----------------------------------------------------------------------------------------------------
-- mi_acceso: lo mismo de 0002, y además el modo
-- -----------------------------------------------------------------------------------------------------
create or replace function public.mi_acceso(p_empresa text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_estado text; v_emp jsonb; v_correo text; v_n_activo int; v_n_baja int;
        v_area text; v_modo text; v_contrato jsonb := public.version_contrato();
begin
  if v_uid is null then return interno.err('SIN_SESION', 'No hay sesión.'); end if;
  select count(*) filter (where estado = 'activo'), count(*) filter (where estado = 'baja') into v_n_activo, v_n_baja
    from public.miembros where usuario_id = v_uid;
  v_correo := interno.correo_verificado();
  v_estado := case when v_n_activo > 0 then 'activo'
                   when v_n_baja   > 0 then 'acceso_revocado'
                   when v_correo is not null
                        and exists (select 1 from public.miembros m where m.correo = v_correo and m.estado = 'invitado' and m.usuario_id is null)
                        then 'invitacion_pendiente'
                   else 'sin_acceso' end;
  select coalesce(jsonb_agg(jsonb_build_object('empresa_id', m.empresa_id, 'area', m.area, 'estado', m.estado, 'modo', e.modo) order by m.empresa_id), '[]'::jsonb)
    into v_emp from public.miembros m join public.empresas e on e.id = m.empresa_id where m.usuario_id = v_uid;
  -- el área de la empresa elegida: la pedida, o la única donde está activo
  select m.area, e.modo into v_area, v_modo from public.miembros m join public.empresas e on e.id = m.empresa_id
   where m.usuario_id = v_uid and m.estado = 'activo' and (p_empresa is null or m.empresa_id = p_empresa)
   order by m.empresa_id limit 1;
  if p_empresa is null and v_n_activo > 1 then v_area := null; v_modo := null; end if;
  return jsonb_build_object('ok', true, 'estado', v_estado,
                            'usuario', jsonb_build_object('id', v_uid, 'correo', v_correo),
                            'empresas', v_emp,
                            'contrato', jsonb_build_object('actual', v_contrato -> 'actual', 'minimo', v_contrato -> 'minimo'),
                            'permisos', case when v_area is null then null else interno.matriz_permisos() -> v_area end,
                            'modo', v_modo);
end $$;
revoke all on function public.mi_acceso(text) from public, anon, authenticated, service_role;
grant execute on function public.mi_acceso(text) to authenticated;

-- -----------------------------------------------------------------------------------------------------
-- modo_cambiar: Dirección dice quién manda
-- -----------------------------------------------------------------------------------------------------
create or replace function public.modo_cambiar(p_modo text, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; v_antes text;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  if coalesce(p_modo, '') not in ('hoja', 'base') then return interno.err('DATO_INVALIDO', 'El modo es «hoja» o «base».'); end if;
  select modo into v_antes from public.empresas where id = (pre.c).empresa_id for update;
  if v_antes = p_modo then return pg_catalog.jsonb_build_object('ok', true, 'sin_cambio', true, 'modo', v_antes); end if;
  update public.empresas set modo = p_modo, modo_desde = pg_catalog.now() where id = (pre.c).empresa_id;
  perform interno.anotar(pre.c, 'direccion', 'modo', 'plataforma', p_modo,
                         case p_modo when 'base' then 'La base pasa a mandar: la hoja ya no es la fuente'
                                     else 'La hoja vuelve a mandar: la base recibe la copia' end,
                         '', pg_catalog.jsonb_build_object('modo', v_antes), pg_catalog.jsonb_build_object('modo', p_modo));
  return pg_catalog.jsonb_build_object('ok', true, 'modo', p_modo);
end $$;
revoke all on function public.modo_cambiar(text, text) from public, anon, authenticated, service_role;
grant execute on function public.modo_cambiar(text, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- La auditoría, con modo_cambiar en la lista cerrada de cliente
-- -----------------------------------------------------------------------------------------------------
create or replace function interno.auditoria() returns text[]
language plpgsql stable set search_path = '' as $$
declare
  -- 0027: las cinco de los clientes fiscales y el dinero disponible entran aquí también (volver a correr este archivo sobre una base con 0027 no aborta).
  c_cliente     constant text[] := array['agente_decidir','almacen_aplicar','alta_venta','cancelar_solicitud','cliente_fiscal_guardar','comisiones_cobradas','constancia_registrar','constante_guardar','corregir_abono','corregir_venta','cotizacion_guardar',
                                         'cuaderno_guardar','cuentas_disponibles_guardar','descartar_cotizacion','emitir_salidas_derivadas','estado_solicitudes','ganar_proyecto','gasto_anular','gasto_registrar','instalacion_guardar','mi_acceso','miembro_alta',
                                         'miembro_baja','miembro_cambiar_area','modo_cambiar','mover_etapa','pantalla_aprobar','pantalla_revocar','proyecto_actualizar','rechazar_solicitud','reclamar_acceso','registrar_abono_comision','registrar_cobro',
                                         'repartir_abono_fifo','revocar_autorizacion','solicitar','subida_unica','tarifas_guardar','tarifas_leer','venta_cliente_fiscal','venta_factura_marcar','version_contrato','vista_previa_reparto'];
  c_servicio    constant text[] := array['agente_abrir','agente_guardar','agente_leer','autorizacion_para_verificar','contador_sembrar','cuadre_hoja','ia_cuota','ia_turno','pantalla_solicitar','pantalla_tablero','registrar_autorizacion','tarifas_de','verificar_cupo'];
  c_int_cliente constant text[] := array['comision','empresas_donde','hoy_mx','neto'];
  c_int_servicio constant text[] := array['comision','contiene_dinero','empresas_donde','hoy_mx','neto','sellos_validos'];
  c_vistas_cli  constant text[] := array['comisiones_pendientes','ventas_calculadas'];
  c_publicadas  constant text[] := array['abonos','almacen_costos','almacen_movimientos','bitacora','constantes','cotizaciones','instalaciones','materiales','miembros','proyectos',
                                         'requerimientos','solicitudes','ventas_dinero'];
  -- 0025: `gastos` entra a Realtime con sus RPC (0025_gastos.sql). Esta auditoría es de antes: la ADMITE publicada (volver a correr este archivo
  --       sobre una base con 0025 no debe abortar), pero no la exige (la primera vez que corre, todavía no lo está). La de 0025 sí la exige.
  c_publicables constant text[] := array['gastos'];
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
    if not (r.tablename = any (c_publicadas) or r.tablename = any (c_publicables)) then
      v := v || format('GR-05 public.%I está publicada en supabase_realtime y no es de las 13 de la lista cerrada', r.tablename);
    end if;
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
    raise exception E'AUDITORIA DE SEGURIDAD (0024): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;

