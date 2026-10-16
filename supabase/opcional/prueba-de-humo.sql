-- PRUEBA DE HUMO de las migraciones sobre una base REAL de Supabase.
--
-- Para qué sirve: las pruebas de supabase/tests corren sobre PGlite (PostgreSQL en WASM), que valida el
-- SQL y las políticas pero NO es Supabase. Esto se ejecuta en el Editor SQL del panel del proyecto, con
-- las migraciones 0001..0013 ya aplicadas (el bloque 7 es de la 0013), y comprueba ahí lo que más importa: que cada área ve y puede
-- hacer solo lo que le toca. Simula a las personas igual que PostgREST (rol + claims del JWT), con
-- usuarios de prueba creados DENTRO de la misma transacción.
--
-- No deja nada en la base: la última línea lanza un error A PROPÓSITO (con el informe como mensaje) y
-- eso deshace todo, incluidos los usuarios de prueba. El error «HUMO_RESULTADO …» es el resultado
-- esperado; lee el JSON: {"fallos":0,...} es verde. Cualquier otro error es un problema de verdad.
--
-- Uso: pegar TODO este archivo en el Editor SQL (no por partes) y ejecutar.

create function pg_temp.como(p_rol text, p_uid uuid, p_correo text) returns void language plpgsql as $f$
begin
  -- Lo mismo que hace PostgREST antes de cada petición: claims del JWT, cabecera de contrato y rol.
  perform set_config('request.jwt.claims',
    case when p_uid is null then jsonb_build_object('role', p_rol)::text
         else jsonb_build_object('sub', p_uid, 'email', p_correo, 'role', p_rol, 'aud', 'authenticated')::text end, true);
  perform set_config('request.headers', '{"x-al3d-contrato":"1"}', true);
  execute format('set local role %I', p_rol);
end $f$;

do $humo$
declare
  inf   jsonb := '[]'::jsonb;
  u_dir uuid := gen_random_uuid();
  u_fab uuid := gen_random_uuid();
  u_pag uuid := gen_random_uuid();
  u_ext uuid := gen_random_uuid();
  u_ema uuid := gen_random_uuid();
  ahora bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  r jsonb; k jsonb; n numeric; t text; b boolean;
begin
  -- 0) Siembra, como dueño de la base: cuatro cuentas de Auth y tres membresías (la cuarta persona no es del equipo).
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u_dir, 'authenticated', 'authenticated', 'dir@humo.test', now(), '{"provider":"google"}', '{}', now(), now()),
    (u_fab, 'authenticated', 'authenticated', 'fab@humo.test', now(), '{"provider":"google"}', '{}', now(), now()),
    (u_pag, 'authenticated', 'authenticated', 'pag@humo.test', now(), '{"provider":"google"}', '{}', now(), now()),
    (u_ext, 'authenticated', 'authenticated', 'ext@humo.test', now(), '{"provider":"google"}', '{}', now(), now());
  insert into public.miembros (empresa_id, correo, area, estado, usuario_id) values
    ('al3d', 'dir@humo.test', 'direccion',  'activo', u_dir),
    ('al3d', 'fab@humo.test', 'fabricacion', 'activo', u_fab),
    ('al3d', 'pag@humo.test', 'pagos',       'activo', u_pag);

  -- 1) Dirección da de alta una venta y la vista de fórmulas la calcula como la hoja:
  --    subtotal 4000 con IVA (cuenta que factura) -> neto 4640.00; menos anticipo 1000 -> saldo 3640.00; comisión 10 % = 400.00.
  perform pg_temp.como('authenticated', u_dir, 'dir@humo.test');
  begin
    r := public.alta_venta(jsonb_build_object('id', 'humo1', 'nombre', 'Prueba - Humo', 'cuenta', 'Moni MPago',
           'tipo_trabajo', jsonb_build_array('Rotulacion de vinil'), 'subtotal', 4000, 'anticipo', 1000, 'tel', '33 2222 3333',
           'entrega', 'paqueteria', 'sellos', jsonb_build_object('etapa', ahora)));
    inf := inf || jsonb_build_object('caso', 'C01 Dirección da de alta una venta', 'ok', coalesce((r->>'ok')::boolean, false), 'det', coalesce(r->>'codigo', 'ok'));
    select to_jsonb(v) into k from public.ventas_calculadas v where v.proyecto_id = 'humo1';
    inf := inf || jsonb_build_object('caso', 'C02 fórmulas H/K/R = 4640 / 3640 / 400', 'ok',
             coalesce((k->>'h_neto')::numeric = 4640 and (k->>'k_saldo')::numeric = 3640 and (k->>'r_comision')::numeric = 400, false),
             'det', concat_ws(' / ', k->>'h_neto', k->>'k_saldo', k->>'r_comision'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C01-C02 (Dirección)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';

  -- 2) Fabricación ve la obra pero NADA de dinero, y no puede cobrar ni mover a «instalado».
  perform pg_temp.como('authenticated', u_fab, 'fab@humo.test');
  begin
    select count(*) into n from public.proyectos;
    inf := inf || jsonb_build_object('caso', 'C03 Fabricación ve la obra (proyectos >= 1)', 'ok', n >= 1, 'det', n::text);
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C03 Fabricación ve la obra', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  begin
    select count(*) into n from public.ventas_dinero;
    inf := inf || jsonb_build_object('caso', 'C04 Fabricación NO lee ventas_dinero (0 filas)', 'ok', n = 0, 'det', n::text);
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C04 Fabricación NO lee ventas_dinero (permission denied)', 'ok', sqlstate = '42501', 'det', sqlstate);
  end;
  begin
    select count(*) into n from public.ventas_calculadas;
    inf := inf || jsonb_build_object('caso', 'C05 Fabricación NO lee la vista de fórmulas (0 filas)', 'ok', n = 0, 'det', n::text);
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C05 Fabricación NO lee la vista de fórmulas (permission denied)', 'ok', sqlstate = '42501', 'det', sqlstate);
  end;
  begin
    r := public.registrar_cobro('humo1', 100, null, false, 'humo-fab', null);
    inf := inf || jsonb_build_object('caso', 'C06 Fabricación NO puede cobrar (ROL_SIN_PERMISO)', 'ok', r->>'codigo' = 'ROL_SIN_PERMISO', 'det', coalesce(r->>'codigo', 'ok'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C06 Fabricación NO puede cobrar', 'ok', sqlstate = '42501', 'det', sqlstate || ' ' || sqlerrm);
  end;
  begin
    r := public.mover_etapa('humo1', 'en_diseno', ahora + 1000, '', null);
    inf := inf || jsonb_build_object('caso', 'C07 Fabricación mueve a en_diseno', 'ok', coalesce((r->>'ok')::boolean, false), 'det', coalesce(r->>'codigo', 'ok'));
    r := public.mover_etapa('humo1', 'instalado', ahora + 2000, '', null);
    inf := inf || jsonb_build_object('caso', 'C08 Fabricación NO mueve a instalado (ROL_SIN_PERMISO)', 'ok', r->>'codigo' = 'ROL_SIN_PERMISO', 'det', coalesce(r->>'codigo', 'ok'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C07-C08 (Fabricación mueve etapa)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';

  -- 3) Pagos cobra, lee el dinero y NO mueve etapa; reenviar el mismo cobro no lo suma dos veces.
  perform pg_temp.como('authenticated', u_pag, 'pag@humo.test');
  begin
    select count(*) into n from public.ventas_dinero;
    inf := inf || jsonb_build_object('caso', 'C09 Pagos lee ventas_dinero (1 fila)', 'ok', n = 1, 'det', n::text);
    r := public.registrar_cobro('humo1', 1000, null, false, 'humo-op-1', null);
    inf := inf || jsonb_build_object('caso', 'C10 Pagos registra un cobro de 1000', 'ok', coalesce((r->>'ok')::boolean, false), 'det', coalesce(r->>'codigo', 'ok'));
    r := public.registrar_cobro('humo1', 1000, null, false, 'humo-op-1', null);
    select to_jsonb(v) into k from public.ventas_calculadas v where v.proyecto_id = 'humo1';
    inf := inf || jsonb_build_object('caso', 'C11 el mismo cobro reenviado NO suma dos veces (saldo 2640)', 'ok', coalesce((k->>'k_saldo')::numeric = 2640, false), 'det', k->>'k_saldo');
    r := public.mover_etapa('humo1', 'armado', ahora + 3000, '', null);
    inf := inf || jsonb_build_object('caso', 'C12 Pagos NO mueve etapa (ROL_SIN_PERMISO)', 'ok', r->>'codigo' = 'ROL_SIN_PERMISO', 'det', coalesce(r->>'codigo', 'ok'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C09-C12 (Pagos)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';

  -- 4) Quien NO es del equipo (cuenta de Google cualquiera) no ve ni hace nada.
  perform pg_temp.como('authenticated', u_ext, 'ext@humo.test');
  begin
    r := public.mi_acceso();
    inf := inf || jsonb_build_object('caso', 'C13 persona ajena: mi_acceso = sin_acceso', 'ok', r->>'estado' = 'sin_acceso', 'det', coalesce(r->>'estado', r->>'codigo'));
    select count(*) into n from public.proyectos;
    inf := inf || jsonb_build_object('caso', 'C14 persona ajena ve 0 proyectos', 'ok', n = 0, 'det', n::text);
    r := public.alta_venta(jsonb_build_object('id', 'humo-x', 'nombre', 'X', 'cuenta', 'Moni MPago', 'tipo_trabajo', jsonb_build_array('Recorte acrilico'),
           'subtotal', 1, 'anticipo', 0, 'tel', '33 2222 3333', 'entrega', 'paqueteria', 'sellos', jsonb_build_object('etapa', ahora)));
    inf := inf || jsonb_build_object('caso', 'C15 persona ajena NO da de alta una venta', 'ok', coalesce((r->>'ok')::boolean, false) = false, 'det', coalesce(r->>'codigo', 'ok'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C13-C15 (persona ajena)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';

  -- 5) Sin sesión (anon) no se puede nada; y nadie escribe una tabla de negocio directamente.
  perform pg_temp.como('anon', null, null);
  begin
    perform 1 from public.proyectos limit 1;
    inf := inf || jsonb_build_object('caso', 'C16 anon NO lee proyectos', 'ok', false, 'det', 'pudo leer');
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C16 anon NO lee proyectos (permission denied)', 'ok', sqlstate = '42501', 'det', sqlstate);
  end;
  begin
    r := public.mi_acceso();
    inf := inf || jsonb_build_object('caso', 'C17 anon NO ejecuta mi_acceso', 'ok', false, 'det', 'pudo ejecutar');
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C17 anon NO ejecuta mi_acceso (permission denied)', 'ok', sqlstate = '42501', 'det', sqlstate);
  end;
  execute 'reset role';
  perform pg_temp.como('authenticated', u_dir, 'dir@humo.test');
  begin
    insert into public.ventas_dinero (empresa_id, proyecto_id, subtotal) values ('al3d', 'humo1', 1);
    inf := inf || jsonb_build_object('caso', 'C18 ni Dirección escribe ventas_dinero directo', 'ok', false, 'det', 'pudo insertar');
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C18 ni Dirección escribe ventas_dinero directo (permission denied)', 'ok', sqlstate = '42501', 'det', sqlstate);
  end;
  execute 'reset role';

  -- 5b) Lo que encontró la revisión adversarial (migración 0012): un importe que no es un importe se rechaza, y el correo solo cuenta si la cuenta es de Google.
  perform pg_temp.como('authenticated', u_pag, 'pag@humo.test');
  begin
    r := public.repartir_abono_fifo('NaN'::numeric, null, '', 'humo-nan', null);
    inf := inf || jsonb_build_object('caso', 'C24 repartir_abono_fifo(NaN) se rechaza (DATO_INVALIDO)', 'ok', r->>'codigo' = 'DATO_INVALIDO', 'det', coalesce(r->>'codigo', 'ok'));
    r := public.registrar_cobro('humo1', 'Infinity'::numeric, null, false, 'humo-inf', null);
    inf := inf || jsonb_build_object('caso', 'C25 registrar_cobro(Infinity) se rechaza (DATO_INVALIDO)', 'ok', r->>'codigo' = 'DATO_INVALIDO', 'det', coalesce(r->>'codigo', 'ok'));
    select to_jsonb(v) into k from public.ventas_calculadas v where v.proyecto_id = 'humo1';
    inf := inf || jsonb_build_object('caso', 'C26 y el saldo no se movió (sigue 2640)', 'ok', coalesce((k->>'k_saldo')::numeric = 2640, false), 'det', k->>'k_saldo');
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C24-C26 (importes no finitos)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (u_ema, 'authenticated', 'authenticated', 'jefe@humo.test', now(), '{"provider":"email"}', '{}', now(), now());
  insert into public.miembros (empresa_id, correo, area, estado) values ('al3d', 'jefe@humo.test', 'direccion', 'invitado');
  perform pg_temp.como('authenticated', u_ema, 'jefe@humo.test');
  begin
    r := public.reclamar_acceso();
    inf := inf || jsonb_build_object('caso', 'C27 una cuenta de correo (no Google) NO reclama la invitación de Dirección', 'ok', r->>'estado' = 'correo_no_verificado', 'det', coalesce(r->>'estado', r->>'codigo'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C27 (cuenta de correo)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';

  -- 6) El catálogo de la base REAL (lo mismo que audita la migración 0011, pero aquí a la vista).
  -- Se exime el tipo `event_trigger`: con «RLS automático» encendido Supabase instala public.rls_auto_enable() (no se puede llamar
  -- como RPC: «cannot display a value of type event_trigger»; comprobado contra el proyecto real el 2026-10-10).
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname in ('public', 'interno') and p.prorettype <> 'pg_catalog.event_trigger'::regtype and has_function_privilege('anon', p.oid, 'execute');
  select string_agg(p.proname, ', ') into t from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname in ('public', 'interno') and p.prorettype <> 'pg_catalog.event_trigger'::regtype and has_function_privilege('anon', p.oid, 'execute');
  inf := inf || jsonb_build_object('caso', 'C19 ninguna función de public/interno ejecutable por anon', 'ok', n = 0, 'det', coalesce(t, '0'));
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  inf := inf || jsonb_build_object('caso', 'C20 toda tabla de public tiene RLS', 'ok', n = 0, 'det', n::text);
  select count(*) into n from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  inf := inf || jsonb_build_object('caso', 'C21 authenticated sin INSERT/UPDATE/DELETE/TRUNCATE en tablas de public', 'ok', n = 0, 'det', n::text);
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'v' and not coalesce((select bool_or(o ~ '^security_invoker=(true|on)$') from unnest(c.reloptions) o), false);
  inf := inf || jsonb_build_object('caso', 'C22 toda vista de public es security_invoker', 'ok', n = 0, 'det', n::text);
  select (coalesce(bool_and(has_function_privilege('service_role', p.oid, 'execute')), false)
          and not coalesce(bool_or(has_function_privilege('authenticated', p.oid, 'execute')), true)) into b
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'registrar_autorizacion';
  inf := inf || jsonb_build_object('caso', 'C23 registrar_autorizacion solo la ejecuta service_role', 'ok', coalesce(b, false), 'det', coalesce(b::text, 'no existe'));

  -- 7) Los huecos que cerró la migración 0013 (H-1 … H-6). Necesita 0013 aplicada; sin ella estos casos salen en rojo.
  --    H-3 es una decisión PROVISIONAL (Q-06): holgura de 60 s para los roles bajos y Dirección gana ante Fabricación o Pagos.
  perform pg_temp.como('authenticated', u_fab, 'fab@humo.test');
  begin
    r := public.proyecto_actualizar(jsonb_build_object('id', 'humo1', 'campos', jsonb_build_object('notas', 'reloj adelantado'),
                                                       'sellos', jsonb_build_object('notas', ahora + 3600000)), null);
    select (p.sellos ->> 'notas')::bigint - (extract(epoch from clock_timestamp()) * 1000)::bigint into n from public.proyectos p where p.id = 'humo1';
    inf := inf || jsonb_build_object('caso', 'C28 Fabricación con el reloj 1 h adelantado: su sello queda a lo más 60 s en el futuro', 'ok', coalesce(n <= 61000, false), 'det', coalesce(n::text, r->>'codigo'));
    r := public.subida_unica(jsonb_build_object('disp', 'HUMO',
           'bitacora', jsonb_build_array(jsonb_build_object('id', 'h1', 'accion', 'cobro', 'titulo', 'Cobro falso de humo', 'usuario', 'pag@humo.test', 'rol', 'pagos', 'ts', 1500000000000)),
           'cotizaciones', jsonb_build_array(jsonb_build_object('folio', 'COT-9001', 'disp', 'HUMO', 'proy', 'Humo', 'items', '[]'::jsonb))), null);
    r := public.almacen_aplicar(jsonb_build_array(jsonb_build_object('id', 'humo-mov', 'almacen', 'movimientos', 'datos', jsonb_build_object('id', 'humo-mov',
           'material_id', 'humo-mat', 'tipo', 'conteo', 'cantidad', 1, 'unidad_compra', 'unidad', 'origen', 'conteo', 'ts', ahora + 2 * 86400000))), false, null);
    inf := inf || jsonb_build_object('caso', 'C29 un movimiento con sello de dentro de 2 días: DATO_INVALIDO', 'ok', coalesce(r #>> '{resultados,0,codigo}' = 'DATO_INVALIDO', false), 'det', coalesce(r #>> '{resultados,0,codigo}', r->>'codigo', 'ok'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C28-C29 (Fabricación, 0013)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  begin
    execute 'create temp table humo_temporal (i int)';
    inf := inf || jsonb_build_object('caso', 'C30 authenticated NO crea tablas temporales', 'ok', false, 'det', 'pudo crearla (ver NOTICE de 0013 y las notas de la segunda entrega)');
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C30 authenticated NO crea tablas temporales (permission denied)', 'ok', sqlstate = '42501', 'det', sqlstate);
  end;
  execute 'reset role';
  perform pg_temp.como('authenticated', u_dir, 'dir@humo.test');
  begin
    r := public.proyecto_actualizar(jsonb_build_object('id', 'humo1', 'campos', jsonb_build_object('notas', 'Dirección manda'),
                                                       'sellos', jsonb_build_object('notas', ahora)), null);
    inf := inf || jsonb_build_object('caso', 'C31 Dirección con un sello más viejo gana ante Fabricación (notas)', 'ok', coalesce(r->'escritos' ? 'notas', false), 'det', coalesce(r->>'viejos', r->>'codigo'));
    r := public.mover_etapa('humo1', 'armado', ahora + 500, '', null);
    inf := inf || jsonb_build_object('caso', 'C32 Dirección con un sello más viejo gana ante Fabricación (etapa)', 'ok', coalesce(r->>'etapa' = 'armado', false), 'det', coalesce(r->>'etapa', r->>'viejos', r->>'codigo'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C31-C32 (prioridad de Dirección, 0013)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  perform pg_temp.como('authenticated', u_pag, 'pag@humo.test');
  begin
    r := public.almacen_aplicar(jsonb_build_array(jsonb_build_object('id', 'humo-req', 'almacen', 'requerimientos', 'registro_id', 'humo1:humo-mat', 'campos', jsonb_build_array('estado'),
           'datos', jsonb_build_object('id', 'humo1:humo-mat', 'proyecto_id', 'humo1', 'material_id', 'humo-mat', 'unidad_compra', 'unidad', 'estado', 'consumido'))), false, null);
    inf := inf || jsonb_build_object('caso', 'C33 Pagos NO crea un requerimiento (ROL_SIN_PERMISO)', 'ok', coalesce(r #>> '{resultados,0,codigo}' = 'ROL_SIN_PERMISO', false), 'det', coalesce(r #>> '{resultados,0,codigo}', r->>'codigo', 'ok'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C33 (Pagos y requerimientos, 0013)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  select usuario_texto || ' / ' || rol || ' / ' || (abs(extract(epoch from (ts - now()))) < 600)::text into t from public.bitacora where titulo = 'Cobro falso de humo';
  inf := inf || jsonb_build_object('caso', 'C34 la bitácora subida queda a nombre de quien sube, con su rol y la hora del servidor', 'ok', coalesce(t = 'fab@humo.test / fabricacion / true', false), 'det', coalesce(t, 'no está'));
  select estado into t from public.cotizaciones where folio_global = 'COT-9001@HUMO';
  inf := inf || jsonb_build_object('caso', 'C35 una cotización subida sin sello del servidor NO nace autorizada (retirada)', 'ok', coalesce(t = 'retirada', false), 'det', coalesce(t, 'no está'));
  select coalesce(cardinality(interno.auditoria()), -1) into n;
  inf := inf || jsonb_build_object('caso', 'C36 la auditoría de 0011 sigue limpia después de 0013', 'ok', coalesce(n = 0, false), 'det', n::text);

  -- Informe: el error es a propósito (deshace los usuarios y las filas de prueba).
  raise exception 'HUMO_RESULTADO %', jsonb_build_object(
    'fallos', (select count(*) from jsonb_array_elements(inf) e where not (e->>'ok')::boolean),
    'total', jsonb_array_length(inf),
    'casos', inf)::text;
end $humo$;
