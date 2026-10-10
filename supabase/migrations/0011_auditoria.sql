-- =====================================================================================================
-- 0011_auditoria.sql — la aduana del despliegue: si algo quedó abierto, la migración SE DETIENE
-- =====================================================================================================
-- Qué deja:
--   · `interno.auditoria()`: UNA consulta de solo lectura que mira los privilegios REALES de la base (no lo que las migraciones dicen que hicieron) y devuelve la
--     lista de problemas, cada uno con su id (GR-01…GR-09). Lista vacía = limpio. Se puede volver a correr cuando se quiera, en el SQL Editor como `postgres`:
--         select interno.auditoria();
--     y conviene correrla después de CADA migración nueva (una tabla o función nueva que no esté en las listas cerradas de abajo sale nombrada).
--   · un bloque `DO` que la corre ahora y, si encuentra aunque sea UN problema, ABORTA con todos ellos: el despliegue no queda a medias y no queda nada abierto.
--
-- Por qué existe. Todo lo que protege este diseño es un privilegio: leer por RLS, escribir solo por RPC `SECURITY DEFINER`, nada para `anon`. Un `GRANT` de más, una
-- función sin `REVOKE`, una vista sin `security_invoker` o una tabla publicada con la fila vieja completa (`replica identity full`) abre un hueco que ninguna prueba de
-- funcionalidad nota. Las pruebas de PGlite hacen esta misma comprobación; aquí se repite DENTRO del despliegue real, donde los privilegios por defecto de Supabase
-- («exponer tablas automáticamente», «RLS automático») pueden no ser los del arnés. Por eso se mira el catálogo, no la intención.
--
-- Depende de: todas las anteriores. No escribe nada (salvo crear la función de consulta) y no usa extensiones.
--
-- LISTAS CERRADAS. Son lo que el diseño promete; una función o tabla fuera de ellas es un hallazgo, aunque «parezca inofensiva»:
--   · 30 RPC de cliente (`authenticated` las ejecuta) y 7 de servicio (solo `service_role`: las llaman las Edge Functions);
--   · en el esquema `interno` (que PostgREST NO expone): `authenticated` ejecuta solo `empresas_donde`, `neto`, `comision` y `hoy_mx` (las que usan las políticas y la
--     vista) y `service_role` esas cuatro más `sellos_validos` y `contiene_dinero` (los CHECK que dispara el importador);
--   · las 13 tablas de Realtime y las 2 vistas que `authenticated` puede leer.
-- Las funciones que pertenecen a una EXTENSIÓN no se auditan (no son nuestras).
-- =====================================================================================================

create or replace function interno.auditoria() returns text[]
language plpgsql stable set search_path = '' as $$
declare
  c_cliente     constant text[] := array['almacen_aplicar','alta_venta','cancelar_solicitud','comisiones_cobradas','constante_guardar','corregir_abono','corregir_venta','cotizacion_guardar',
                                         'cuaderno_guardar','descartar_cotizacion','emitir_salidas_derivadas','estado_solicitudes','ganar_proyecto','instalacion_guardar','mi_acceso','miembro_alta',
                                         'miembro_baja','miembro_cambiar_area','mover_etapa','proyecto_actualizar','rechazar_solicitud','reclamar_acceso','registrar_abono_comision','registrar_cobro',
                                         'repartir_abono_fifo','revocar_autorizacion','solicitar','subida_unica','version_contrato','vista_previa_reparto'];
  c_servicio    constant text[] := array['autorizacion_para_verificar','contador_sembrar','cuadre_hoja','ia_cuota','ia_turno','registrar_autorizacion','verificar_cupo'];
  c_int_cliente constant text[] := array['comision','empresas_donde','hoy_mx','neto'];
  c_int_servicio constant text[] := array['comision','contiene_dinero','empresas_donde','hoy_mx','neto','sellos_validos'];
  c_vistas_cli  constant text[] := array['comisiones_pendientes','ventas_calculadas'];
  c_publicadas  constant text[] := array['abonos','almacen_costos','almacen_movimientos','bitacora','constantes','cotizaciones','instalaciones','materiales','miembros','proyectos',
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
    if not r.tablename = any (c_publicadas) then v := v || format('GR-05 public.%I está publicada en supabase_realtime y no es de las 13 de la lista cerrada', r.tablename); end if;
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

  -- ---- GR-09: nada de negocio se borra: toda tabla de `public` (salvo `contadores`, que limpia sus ventanas vencidas) lleva su trigger `sin_borrar` ----------
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'contadores'
              and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and not g.tgisinternal and g.tgenabled <> 'D' and g.tgfoid = 'interno.sin_borrar()'::regprocedure)
            order by 1 loop
    v := v || format('GR-09 la tabla public.%I no tiene su trigger sin_borrar (o está desactivado)', r.relname);
  end loop;

  return v;
end $$;
-- Solo la lee quien administra (el dueño y los superusuarios): ningún rol de la aplicación la ejecuta (GR-08).
revoke all on function interno.auditoria() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- La aduana: corre la auditoría y, si encuentra algo, ABORTA el despliegue con la lista completa
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD: se encontraron % problema(s) y el despliegue se detiene (nada de esto debe quedar abierto):\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
