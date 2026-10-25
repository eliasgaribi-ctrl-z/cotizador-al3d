-- PRUEBA DE HUMO de las migraciones sobre una base REAL de Supabase.
--
-- Para qué sirve: las pruebas de supabase/tests corren sobre PGlite (PostgreSQL en WASM), que valida el
-- SQL y las políticas pero NO es Supabase. Esto se ejecuta en el Editor SQL del panel del proyecto, con
-- las migraciones 0001..0017 ya aplicadas (el bloque 7 es de la 0013 y la 0014; el 8, de la 0015; el 9, de la 0016; el 10 y C08/C12, de la 0017), y comprueba ahí lo que más importa: que cada área ve y puede
-- hacer solo lo que le toca. Simula a las personas igual que PostgREST (rol + claims del JWT), con
-- usuarios de prueba creados DENTRO de la misma transacción. El bloque 11 es de opcional/storage.sql (las
-- imágenes de las cotizaciones; C70–C74, de Q-02 bis): sin el bucket, deja un solo caso que dice que no aplica.
--
-- No deja nada en la base: la última línea lanza un error A PROPÓSITO (con el informe como mensaje) y
-- eso deshace todo, incluidos los usuarios de prueba. El error «HUMO_RESULTADO …» es el resultado
-- esperado; lee el JSON: {"fallos":0,...} es verde. Cualquier otro error es un problema de verdad.
--
-- Corre igual en una base VACÍA que en una con datos reales (producción tiene 219 ventas): cada caso que
-- cuenta filas cuenta solo las de la prueba (ids «humo…», folios «@HUMO», correos «@humo.test»). Los que
-- esperan CERO filas (Fabricación y el dinero, la persona ajena, anon) cuentan TODO a propósito: ahí la
-- respuesta correcta es cero haya lo que haya, y contar todo es la prueba más fuerte. Lo mismo C44, que
-- compara los libros completos antes y después de purgar, y C72, que cuenta TODAS las imágenes que ve
-- Fabricación (cada una tiene que ser de una obra ganada: desde Q-02 bis, en producción sí ve algunas). Las purgas del bloque 9 sí recorren los datos
-- reales, pero lo que borren se deshace con el error final, como todo lo demás.
-- (supabase/tests/humo/prueba-de-humo.mjs la corre en PGlite vacía, con datos, y con Storage.)
--
-- Uso: pegar TODO este archivo en el Editor SQL (no por partes) y ejecutar.
-- El bloque 12 (casos D01–D05) es de la 0018 (la copia diaria y su bitácora cuadre_diario): sin ella, D01 sale en rojo y dice que falta.
-- El bloque 1 bis (E01–E02) es de la 0026: con la hoja mandando, la base no da de alta una venta sin cotización. Sin la 0026, E01 y E02 salen en rojo.
-- Desde la 0026 `alta_venta` pide la base mandando: para sembrar su venta (C01), la prueba pone la empresa en 'base' DENTRO de su transacción
-- (el error final lo deshace, como todo lo demás: la empresa sigue en el modo en que estaba) y el bloque 1 bis la regresa a 'hoja' para probarlo.

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
  r jsonb; k jsonb; n numeric; t text; b boolean; ts_humo timestamptz; q_borrar text; n_v numeric;
  con_modo boolean := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'empresas' and column_name = 'modo');
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
  -- La base mandando, solo dentro de esta transacción (0026: `alta_venta` solo da de alta así; el bloque 1 bis prueba la hoja).
  if con_modo then execute 'update public.empresas set modo = ''base'' where id = ''al3d'''; end if;

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

  -- 1 bis) La venta sin cotización, solo con la base mandando (0026, decidida por Elías el 2026-10-25): los casos E01–E02. Van aquí, antes de que
  --     el bloque 8 suba el contador V a V-9999999 (con él lleno, un alta ya no cabría y el caso no diría nada). Como dueño, la empresa vuelve a
  --     'hoja' (dentro de esta transacción: el error final lo deshace) y Dirección intenta un alta válida: la base se niega, no escribe nada ni gasta
  --     un V-###. Después la empresa sigue en 'hoja': nada de lo que sigue da de alta ventas sin cotización.
  if not con_modo then
    inf := inf || jsonb_build_object('caso', 'E01 empresas.modo no existe: falta aplicar supabase/migrations/0024_modo.sql (y la 0026)', 'ok', false, 'det', 'falta 0024');
  else
    execute 'update public.empresas set modo = ''hoja'' where id = ''al3d''';
    select coalesce(max(c.n), 0) into n_v from public.contadores c where c.empresa_id = 'al3d' and c.clave = 'V';
    perform pg_temp.como('authenticated', u_dir, 'dir@humo.test');
    begin
      r := public.alta_venta(jsonb_build_object('id', 'humo-e1', 'nombre', 'Prueba - Humo con la hoja', 'cuenta', 'Moni MPago', 'subtotal', 100, 'anticipo', 0,
             'tel', '33 2222 3333', 'entrega', 'recoleccion', 'sellos', jsonb_build_object('tel', ahora)));
      t := coalesce(r->>'codigo', 'ok') || case when (r->>'definitivo')::boolean then ' definitivo' else '' end;
    exception when others then t := sqlstate || ' ' || sqlerrm;
    end;
    execute 'reset role';
    inf := inf || jsonb_build_object('caso', 'E01 con la hoja mandando, Dirección NO da de alta una venta sin cotización (DATO_INVALIDO definitivo; «ok» = falta la 0026)',
                                     'ok', t = 'DATO_INVALIDO definitivo', 'det', t);
    select coalesce(max(c.n), 0) into n from public.contadores c where c.empresa_id = 'al3d' and c.clave = 'V';
    n := n - n_v + (select count(*) from public.proyectos x where x.id = 'humo-e1');          -- folios gastados + proyectos escritos
    inf := inf || jsonb_build_object('caso', 'E02 y no escribió nada: ni el proyecto ni un V-### del contador (0)', 'ok', n = 0, 'det', n::text);
  end if;

  -- 2) Fabricación ve la obra pero NADA de dinero, y no puede cobrar ni cancelar (0017: fuera de eso mueve cualquier etapa; ver el bloque 10).
  perform pg_temp.como('authenticated', u_fab, 'fab@humo.test');
  begin
    select count(*) into n from public.proyectos where id = 'humo1';
    inf := inf || jsonb_build_object('caso', 'C03 Fabricación ve la obra (el proyecto humo1)', 'ok', n = 1, 'det', n::text);
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C03 Fabricación ve la obra', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  begin
    select count(*) into n from public.ventas_dinero;               -- TODAS: cero haya lo que haya
    inf := inf || jsonb_build_object('caso', 'C04 Fabricación NO lee ventas_dinero (0 filas, de ninguna venta)', 'ok', n = 0, 'det', n::text);
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C04 Fabricación NO lee ventas_dinero (permission denied)', 'ok', sqlstate = '42501', 'det', sqlstate);
  end;
  begin
    select count(*) into n from public.ventas_calculadas;           -- TODAS: cero haya lo que haya
    inf := inf || jsonb_build_object('caso', 'C05 Fabricación NO lee la vista de fórmulas (0 filas, de ninguna venta)', 'ok', n = 0, 'det', n::text);
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
    r := public.mover_etapa('humo1', 'cancelado', ahora + 2000, '', null);
    inf := inf || jsonb_build_object('caso', 'C08 Fabricación NO cancela (ROL_SIN_PERMISO; desde 0017 es lo único de la etapa que no puede)', 'ok', r->>'codigo' = 'ROL_SIN_PERMISO', 'det', coalesce(r->>'codigo', 'ok'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C07-C08 (Fabricación mueve etapa)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';

  -- 3) Pagos cobra, lee el dinero y NO cancela (0017: fuera de eso mueve cualquier etapa; ver el bloque 10); reenviar el mismo cobro no lo suma dos veces.
  perform pg_temp.como('authenticated', u_pag, 'pag@humo.test');
  begin
    select count(*) into n from public.ventas_dinero where proyecto_id = 'humo1';
    inf := inf || jsonb_build_object('caso', 'C09 Pagos lee ventas_dinero (la fila de humo1)', 'ok', n = 1, 'det', n::text);
    r := public.registrar_cobro('humo1', 1000, null, false, 'humo-op-1', null);
    inf := inf || jsonb_build_object('caso', 'C10 Pagos registra un cobro de 1000', 'ok', coalesce((r->>'ok')::boolean, false), 'det', coalesce(r->>'codigo', 'ok'));
    r := public.registrar_cobro('humo1', 1000, null, false, 'humo-op-1', null);
    select to_jsonb(v) into k from public.ventas_calculadas v where v.proyecto_id = 'humo1';
    inf := inf || jsonb_build_object('caso', 'C11 el mismo cobro reenviado NO suma dos veces (saldo 2640)', 'ok', coalesce((k->>'k_saldo')::numeric = 2640, false), 'det', k->>'k_saldo');
    r := public.mover_etapa('humo1', 'cancelado', ahora + 3000, '', null);
    inf := inf || jsonb_build_object('caso', 'C12 Pagos NO cancela (ROL_SIN_PERMISO; desde 0017 es lo único de la etapa que no puede)', 'ok', r->>'codigo' = 'ROL_SIN_PERMISO', 'det', coalesce(r->>'codigo', 'ok'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C09-C12 (Pagos)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';

  -- 4) Quien NO es del equipo (cuenta de Google cualquiera) no ve ni hace nada.
  perform pg_temp.como('authenticated', u_ext, 'ext@humo.test');
  begin
    r := public.mi_acceso();
    inf := inf || jsonb_build_object('caso', 'C13 persona ajena: mi_acceso = sin_acceso', 'ok', r->>'estado' = 'sin_acceso', 'det', coalesce(r->>'estado', r->>'codigo'));
    select count(*) into n from public.proyectos;                   -- TODOS: cero haya lo que haya
    inf := inf || jsonb_build_object('caso', 'C14 persona ajena ve 0 proyectos (de ninguna venta)', 'ok', n = 0, 'det', n::text);
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
  --    H-3 (Q-06) lo decidió Elías el 2026-10-16 y lo dejó 0014: gana el cambio más reciente, con 10 min de holgura para TODAS las áreas
  --    (la decisión provisional de 0013 —60 s para los roles bajos y Dirección gana ante ellos— ya no existe).
  perform pg_temp.como('authenticated', u_fab, 'fab@humo.test');
  begin
    r := public.proyecto_actualizar(jsonb_build_object('id', 'humo1', 'campos', jsonb_build_object('notas', 'reloj adelantado'),
                                                       'sellos', jsonb_build_object('notas', ahora + 3600000)), null);
    select (p.sellos ->> 'notas')::bigint - (extract(epoch from clock_timestamp()) * 1000)::bigint into n from public.proyectos p where p.id = 'humo1';
    inf := inf || jsonb_build_object('caso', 'C28 Fabricación con el reloj 1 h adelantado: su sello queda a 10 min en el futuro, como el de Dirección (0014)', 'ok', coalesce(n between 540000 and 601000, false), 'det', coalesce(n::text, r->>'codigo'));
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
    -- Fabricación dejó «notas» con un sello de ~ahora + 10 min (C28): un sello de Dirección más viejo PIERDE y uno más nuevo gana.
    r := public.proyecto_actualizar(jsonb_build_object('id', 'humo1', 'campos', jsonb_build_object('notas', 'Dirección, vieja'),
                                                       'sellos', jsonb_build_object('notas', ahora)), null);
    t := coalesce(r->'viejos' @> '[{"nombre":"notas"}]'::jsonb, false)::text;
    r := public.proyecto_actualizar(jsonb_build_object('id', 'humo1', 'campos', jsonb_build_object('notas', 'Dirección, nueva'),
                                                       'sellos', jsonb_build_object('notas', ahora + 3600000)), null);
    inf := inf || jsonb_build_object('caso', 'C31 gana el más reciente (notas): Dirección con un sello más viejo que el de Fabricación pierde; con uno más nuevo, gana', 'ok',
                                     coalesce(t = 'true' and r->'escritos' ? 'notas', false), 'det', 'vieja perdió: ' || t || ' / nueva: ' || coalesce(r->>'escritos', r->>'codigo'));
    -- Fabricación dejó la etapa con el sello ahora + 1000 (C07): ahora + 500 pierde, ahora + 1500 gana.
    r := public.mover_etapa('humo1', 'armado', ahora + 500, '', null);
    t := coalesce(r->'viejos' @> '[{"nombre":"etapa"}]'::jsonb, false)::text;
    r := public.mover_etapa('humo1', 'armado', ahora + 1500, '', null);
    inf := inf || jsonb_build_object('caso', 'C32 gana el más reciente (etapa): Dirección con un sello más viejo que el de Fabricación pierde; con uno más nuevo, mueve', 'ok',
                                     coalesce(t = 'true' and r->>'etapa' = 'armado', false), 'det', 'vieja perdió: ' || t || ' / nueva: ' || coalesce(r->>'etapa', r->>'viejos', r->>'codigo'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C31-C32 (gana el más reciente, 0014)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
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
  inf := inf || jsonb_build_object('caso', 'C36 la auditoría de 0011 sigue limpia después de 0013, 0014 y 0015', 'ok', coalesce(n = 0, false), 'det', n::text);

  -- 8) El folio de la hoja (0015, Q-07): una venta nueva entra con el V-### que ya le dio la hoja; uno ocupado se rechaza; el contador no queda abajo.
  perform pg_temp.como('authenticated', u_dir, 'dir@humo.test');
  begin
    r := public.ganar_proyecto(jsonb_build_object('id', 'humo-v1', 'folio_global', 'COT-9002@HUMO', 'folio_local', 'COT-9002', 'dispositivo', 'HUMO',
           'nombre', 'Humo - folio de la hoja', 'venta', jsonb_build_object('sub', 1000, 'anti', 0, 'cuenta', 'Moni MPago'), 'folio_hoja', 'V-9999999'), null);
    inf := inf || jsonb_build_object('caso', 'C37 ganar_proyecto con el folio de la hoja: la venta queda con ESE V-###', 'ok', coalesce(r->>'folio_hoja' = 'V-9999999', false), 'det', coalesce(r->>'folio_hoja', r->>'codigo'));
    r := public.ganar_proyecto(jsonb_build_object('id', 'humo-v2', 'folio_global', 'COT-9003@HUMO', 'folio_local', 'COT-9003', 'dispositivo', 'HUMO',
           'nombre', 'Humo - folio repetido', 'venta', jsonb_build_object('sub', 1000, 'anti', 0, 'cuenta', 'Moni MPago'), 'folio_hoja', 'V-9999999'), null);
    inf := inf || jsonb_build_object('caso', 'C38 el mismo folio de la hoja otra vez: DATO_INVALIDO folio_ocupado', 'ok', coalesce(r->>'causa' = 'folio_ocupado', false), 'det', coalesce(r->>'causa', r->>'codigo', r->>'folio_hoja'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C37-C38 (folio de la hoja, 0015)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  select c.n into n from public.contadores c join public.proyectos p on p.empresa_id = c.empresa_id where p.id = 'humo-v1' and c.clave = 'V' and c.ventana = '';
  inf := inf || jsonb_build_object('caso', 'C39 el contador V quedó a la altura del folio de la hoja (no por debajo)', 'ok', coalesce(n >= 9999999, false), 'det', coalesce(n::text, 'no está'));

  -- 9) Los plazos de conservación (0016, decididos por Elías el 2026-10-16). Todo como dueño; las purgas corren con un «ahora» movido y lo
  --    que borran (aunque sea real) se deshace con el error final, como todo lo demás de esta prueba.
  begin
    insert into public.cotizaciones (empresa_id, folio_global, folio, disp, estado, datos) values
      ('al3d', 'COT-9100@HUMO', 'COT-9100', 'HUMO', 'retirada', '{"proy":"Humo no ganada"}'),
      ('al3d', 'COT-9002@HUMO', 'COT-9002', 'HUMO', 'retirada', '{"proy":"Humo ganada"}')
    on conflict (empresa_id, folio_global) do nothing;
    insert into public.cotizaciones (empresa_id, folio_global, folio, disp, estado, datos, deleted_at) values
      ('al3d', 'COT-9101@HUMO', 'COT-9101', 'HUMO', 'retirada', '{"proy":"Humo borrada"}', now() - interval '30 days');
    select x.updated_at into ts_humo from public.cotizaciones x where x.folio_global = 'COT-9100@HUMO';
    r := interno.purgar_cotizaciones_no_ganadas(ts_humo + interval '8 months' - interval '1 second');
    select count(*) into n from public.cotizaciones where folio_global = 'COT-9100@HUMO';
    r := interno.purgar_cotizaciones_no_ganadas(ts_humo + interval '8 months');
    select n::text || ' / ' || count(*)::text into t from public.cotizaciones where folio_global = 'COT-9100@HUMO';
    inf := inf || jsonb_build_object('caso', 'C40 cotización no ganada: a 8 meses menos 1 s se queda; a los 8 meses justos se borra', 'ok', coalesce(t = '1 / 0', false), 'det', t);
    select count(*)::text into t from public.cotizaciones where folio_global = 'COT-9002@HUMO';
    inf := inf || jsonb_build_object('caso', 'C41 la cotización de una venta ganada (humo-v1) NO se borra aunque tenga 8 meses', 'ok', coalesce(t = '1', false), 'det', t);
    r := interno.purgar_borrados(now());
    select count(*)::text into t from public.cotizaciones where folio_global = 'COT-9101@HUMO';
    inf := inf || jsonb_build_object('caso', 'C42 lo borrado en la app hace 30 días se purga', 'ok', coalesce(t = '0', false), 'det', t);
    insert into public.bitacora (empresa_id, ts, nivel, accion, entidad, titulo) values
      ('al3d', now() - interval '1 year', 'general', 'humo', 'sistema', 'Humo: justo un año'),
      ('al3d', now() - interval '1 year' + interval '1 second', 'general', 'humo', 'sistema', 'Humo: un segundo más joven');
    perform interno.purgar_bitacora(now());
    select string_agg(titulo, ' | ' order by id) into t from public.bitacora where accion = 'humo';
    inf := inf || jsonb_build_object('caso', 'C43 bitácora: la de justo un año se borra; la de un segundo menos se queda', 'ok', coalesce(t = 'Humo: un segundo más joven', false), 'det', coalesce(t, 'ninguna'));
    select (select count(*) from public.ventas_dinero)::text || '/' || (select count(*) from public.abonos)::text || '/' || (select count(*) from public.autorizaciones)::text
           || '/' || (select count(*) from public.proyectos where folio_hoja is not null)::text into t;
    r := interno.purgar_plazos(now() + interval '10 years');
    select (select count(*) from public.ventas_dinero)::text || '/' || (select count(*) from public.abonos)::text || '/' || (select count(*) from public.autorizaciones)::text
           || '/' || (select count(*) from public.proyectos where folio_hoja is not null)::text = t into b;
    inf := inf || jsonb_build_object('caso', 'C44 purgar_plazos con «ahora» en 10 años: ventas, dinero, abonos y autorizaciones quedan EXACTOS', 'ok', coalesce(b and jsonb_array_length(r->'errores') = 0, false),
                                     'det', t || ' errores: ' || coalesce(r->>'errores', '?'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C40-C44 (plazos, 0016)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  begin
    delete from public.ventas_dinero where proyecto_id = 'humo1';     -- la venta de C01: un libro, nunca se purga
    get diagnostics n = row_count;
    inf := inf || jsonb_build_object('caso', 'C45 después de las purgas, el libro de ventas sigue sin poder borrarse (sin_borrar), ni como dueño', 'ok', false, 'det', case when n = 0 then 'no había qué borrar' else 'se borró' end);
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C45 después de las purgas, el libro de ventas sigue sin poder borrarse (sin_borrar), ni como dueño', 'ok', sqlerrm like '%no se borran%', 'det', sqlstate || ' ' || sqlerrm);
  end;
  begin
    select has_function_privilege('service_role', 'interno.purgar_plazos(timestamptz)', 'EXECUTE') or has_function_privilege('authenticated', 'interno.purgar_plazos(timestamptz)', 'EXECUTE')
        or has_function_privilege('anon', 'interno.purgar_plazos(timestamptz)', 'EXECUTE') into b;
    inf := inf || jsonb_build_object('caso', 'C46 las purgas no las ejecuta service_role, authenticated ni anon', 'ok', not b, 'det', b::text);
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C46 (purgas, 0016)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  if to_regclass('cron.job') is not null then
    execute $q$select count(*) from cron.job where jobname = 'al3d-plazos' and schedule = '15 9 * * *' and active$q$ into n;
    inf := inf || jsonb_build_object('caso', 'C47 pg_cron tiene programado al3d-plazos (diario, 09:15 UTC)', 'ok', n = 1, 'det', n::text);
  elsif exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    inf := inf || jsonb_build_object('caso', 'C47 pg_cron tiene programado al3d-plazos (diario, 09:15 UTC)', 'ok', false, 'det', 'pg_cron está disponible pero no habilitado: revisa el NOTICE de 0016');
  else
    inf := inf || jsonb_build_object('caso', 'C47 pg_cron: no existe en esta base (PGlite): no aplica', 'ok', true, 'det', 'sin pg_cron');
  end if;
  select coalesce(cardinality(interno.auditoria()), -1) into n;
  inf := inf || jsonb_build_object('caso', 'C48 la auditoría de 0011 sigue limpia después de 0016', 'ok', coalesce(n = 0, false), 'det', n::text);

  -- 10) Las decisiones de Elías del 2026-10-16 (0017). Q-05: los tres roles mueven cualquier etapa y SOLO Dirección cancela (o saca de
  --     «cancelado»). Q-19: 50 consultas de IA al día por persona, aunque quien llama pida más. humo1 viene en «armado» (C32), con el sello
  --     de etapa en ahora + 1500.
  perform pg_temp.como('authenticated', u_pag, 'pag@humo.test');
  begin
    r := public.mover_etapa('humo1', 'listo', ahora + 4000, '', null);
    inf := inf || jsonb_build_object('caso', 'C49 Pagos mueve la etapa (armado → listo)', 'ok', coalesce(r->>'etapa' = 'listo', false), 'det', coalesce(r->>'etapa', r->>'codigo'));
    r := public.mover_etapa('humo1', 'cancelado', ahora + 4500, '', null);
    inf := inf || jsonb_build_object('caso', 'C50 Pagos NO cancela (ROL_SIN_PERMISO)', 'ok', coalesce(r->>'codigo' = 'ROL_SIN_PERMISO', false), 'det', coalesce(r->>'codigo', r->>'etapa'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C49-C50 (Pagos y la etapa, 0017)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  perform pg_temp.como('authenticated', u_fab, 'fab@humo.test');
  begin
    r := public.mover_etapa('humo1', 'instalado', ahora + 5000, '', null);
    k := public.mover_etapa('humo1', 'garantia', ahora + 5500, '', null);
    inf := inf || jsonb_build_object('caso', 'C51 Fabricación mueve fuera de ganado…listo (listo → instalado → garantía)', 'ok',
                                     coalesce(r->>'etapa' = 'instalado' and k->>'etapa' = 'garantia', false), 'det', concat_ws(' / ', coalesce(r->>'etapa', r->>'codigo'), coalesce(k->>'etapa', k->>'codigo')));
    r := public.mover_etapa('humo1', 'cancelado', ahora + 6000, '', null);
    inf := inf || jsonb_build_object('caso', 'C52 Fabricación NO cancela (ROL_SIN_PERMISO)', 'ok', coalesce(r->>'codigo' = 'ROL_SIN_PERMISO', false), 'det', coalesce(r->>'codigo', r->>'etapa'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C51-C52 (Fabricación y la etapa, 0017)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  perform pg_temp.como('authenticated', u_dir, 'dir@humo.test');
  begin
    r := public.mover_etapa('humo1', 'cancelado', ahora + 6500, '', null);
    inf := inf || jsonb_build_object('caso', 'C53 Dirección sí cancela («No se dio»)', 'ok', coalesce(r->>'etapa' = 'cancelado', false), 'det', coalesce(r->>'etapa', r->>'codigo'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C53 (Dirección cancela, 0017)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  perform pg_temp.como('authenticated', u_fab, 'fab@humo.test');
  begin
    r := public.mover_etapa('humo1', 'ganado', ahora + 7000, '', null);
    t := coalesce(r->>'codigo', r->>'etapa');
    execute 'reset role';
    perform pg_temp.como('authenticated', u_pag, 'pag@humo.test');
    r := public.mover_etapa('humo1', 'ganado', ahora + 7500, '', null);
    inf := inf || jsonb_build_object('caso', 'C54 ni Fabricación ni Pagos sacan un proyecto de «cancelado» (ROL_SIN_PERMISO)', 'ok',
                                     coalesce(t = 'ROL_SIN_PERMISO' and r->>'codigo' = 'ROL_SIN_PERMISO', false), 'det', t || ' / ' || coalesce(r->>'codigo', r->>'etapa'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C54 (sacar de cancelado, 0017)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
  begin
    for i in 1..50 loop r := public.ia_cuota(u_dir, 200, now()); end loop;
    k := public.ia_cuota(u_dir, 200, now());
    inf := inf || jsonb_build_object('caso', 'C55 IA: 50 consultas al día por persona aunque se pidan 200; la 51.ª es CUPO_AGOTADO', 'ok',
                                     coalesce((r->>'usadas')::int = 50 and (r->>'limite')::int = 50 and k->>'codigo' = 'CUPO_AGOTADO', false),
                                     'det', concat_ws(' / ', r->>'usadas', r->>'limite', k->>'codigo', k->>'mensaje'));
    r := public.ia_cuota(u_fab, p_ahora => now());
    inf := inf || jsonb_build_object('caso', 'C56 IA: sin tope pedido, el de la base es 50 y cada persona tiene el suyo', 'ok',
                                     coalesce((r->>'usadas')::int = 1 and (r->>'limite')::int = 50, false), 'det', concat_ws(' / ', r->>'usadas', r->>'limite', r->>'codigo'));
  exception when others then
    inf := inf || jsonb_build_object('caso', 'C55-C56 (IA, 0017)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
  end;
  select coalesce(cardinality(interno.auditoria()), -1) into n;
  inf := inf || jsonb_build_object('caso', 'C57 la auditoría de 0011 sigue limpia después de 0017', 'ok', coalesce(n = 0, false), 'det', n::text);

  -- 11) Las imágenes de las cotizaciones en Storage (opcional/storage.sql, 2026-10-16). Las personas se simulan insertando y leyendo en
  --     storage.objects con su rol y su JWT, que es lo que hace el servicio de Storage antes de guardar el archivo: aquí no se sube ningún
  --     archivo (solo la fila, y se deshace con todo lo demás). Lo que esto NO prueba es el servicio en sí (la subida, las URLs firmadas).
  --     Pagos ve y sube solo en SU cotización; Dirección todo; Fabricación no sube nada y solo VE las de una obra GANADA (Q-02 bis, decidido
  --     por Elías el 2026-10-16: C70–C74, al final del bloque); cambiar y borrar, solo Dirección.
  if to_regclass('storage.objects') is null then
    inf := inf || jsonb_build_object('caso', 'C58 Storage: no existe en esta base (PGlite sin sustituto): no aplica', 'ok', true, 'det', 'sin storage');
  elsif not exists (select 1 from storage.buckets where id = 'cotizacion-imagenes') then
    inf := inf || jsonb_build_object('caso', 'C58 Storage: el bucket cotizacion-imagenes no existe (falta aplicar opcional/storage.sql): no aplica', 'ok', true,
                                     'det', 'aplica supabase/opcional/storage.sql y vuelve a correr esta prueba');
  else
    -- La condición de la política de borrar, para evaluarla como cada rol en C65 y C67 (ver allí por qué no se usa DELETE).
    select pg_get_expr(p.polqual, p.polrelid) into q_borrar from pg_policy p
     where p.polrelid = 'storage.objects'::regclass and p.polname = 'cotizacion_imagenes_borrar';
    q_borrar := coalesce(q_borrar, 'false');
    insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos) values
      ('al3d', 'COT-9300@HUMO', 'COT-9300', 'HUMO', u_pag, 'pendiente', '{"proy":"Humo: imágenes de Pagos"}'),
      ('al3d', 'COT-9301@HUMO', 'COT-9301', 'HUMO', u_dir, 'pendiente', '{"proy":"Humo: imágenes de Dirección"}');
    -- Pagos: sube a SU cotización; no a la de Dirección ni a un folio que la base no tiene.
    perform pg_temp.como('authenticated', u_pag, 'pag@humo.test');
    begin
      insert into storage.objects (bucket_id, name, owner_id) values ('cotizacion-imagenes', 'al3d/COT-9300@HUMO/img-humo-1.jpg', u_pag::text);
      inf := inf || jsonb_build_object('caso', 'C58 Pagos sube una imagen a SU cotización', 'ok', true, 'det', 'ok');
    exception when others then
      inf := inf || jsonb_build_object('caso', 'C58 Pagos sube una imagen a SU cotización', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into storage.objects (bucket_id, name, owner_id) values ('cotizacion-imagenes', 'al3d/COT-9301@HUMO/img-humo-x.jpg', u_pag::text);
      t := 'pudo';
    exception when others then t := sqlstate;
    end;
    begin
      insert into storage.objects (bucket_id, name, owner_id) values ('cotizacion-imagenes', 'al3d/COT-9302@HUMO/img-humo-x.jpg', u_pag::text);
      t := t || ' / pudo';
    exception when others then t := t || ' / ' || sqlstate;
    end;
    inf := inf || jsonb_build_object('caso', 'C59 Pagos NO sube a la cotización de Dirección ni a un folio que la base no tiene (42501)', 'ok', t = '42501 / 42501', 'det', t);
    execute 'reset role';
    -- Fabricación: ni sube ni ve las de una cotización que no se ganó (las cotizaciones llevan precios). Desde Q-02 bis SÍ ve las de una obra
    -- ganada, y en producción las hay: por eso C60 cuenta solo las de la prueba, y C72 (abajo) cuenta TODAS las que ve, una por una contra su obra.
    perform pg_temp.como('authenticated', u_fab, 'fab@humo.test');
    begin
      insert into storage.objects (bucket_id, name, owner_id) values ('cotizacion-imagenes', 'al3d/COT-9300@HUMO/img-humo-f.jpg', u_fab::text);
      t := 'pudo subir';
    exception when others then t := sqlstate;
    end;
    begin
      select count(*) into n from storage.objects where bucket_id = 'cotizacion-imagenes' and name like 'al3d/COT-930_@HUMO/%';   -- las de la prueba
      inf := inf || jsonb_build_object('caso', 'C60 Fabricación NO sube (42501) y NO ve la imagen de una cotización que no se ganó (0)', 'ok', t = '42501' and n = 0, 'det', t || ' / ve ' || n::text);
    exception when others then
      inf := inf || jsonb_build_object('caso', 'C60 Fabricación NO sube ni ve imágenes', 'ok', false, 'det', t || ' / ' || sqlstate || ' ' || sqlerrm);
    end;
    execute 'reset role';
    -- Dirección: sube a cualquier carpeta de su empresa, también a un folio que la base todavía no tiene; una ruta mal formada, no.
    perform pg_temp.como('authenticated', u_dir, 'dir@humo.test');
    begin
      insert into storage.objects (bucket_id, name, owner_id) values
        ('cotizacion-imagenes', 'al3d/COT-9300@HUMO/img-humo-2.jpg', u_dir::text),
        ('cotizacion-imagenes', 'al3d/COT-9302@HUMO/img-humo-3.jpg', u_dir::text);
      inf := inf || jsonb_build_object('caso', 'C61 Dirección sube a la cotización de Pagos y a un folio que la base todavía no tiene', 'ok', true, 'det', 'ok');
    exception when others then
      inf := inf || jsonb_build_object('caso', 'C61 Dirección sube a la cotización de Pagos y a un folio que la base todavía no tiene', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into storage.objects (bucket_id, name, owner_id) values ('cotizacion-imagenes', 'al3d/humo-suelta.jpg', u_dir::text);
      t := 'pudo';
    exception when others then t := sqlstate;
    end;
    inf := inf || jsonb_build_object('caso', 'C62 una ruta que no es <empresa>/<folio_global>/<id>.jpg se rechaza, también a Dirección (42501)', 'ok', t = '42501', 'det', t);
    begin
      select string_agg(o.name, ' ' order by o.name) into t from storage.objects o where o.bucket_id = 'cotizacion-imagenes' and o.name like 'al3d/COT-93%@HUMO/%';
      inf := inf || jsonb_build_object('caso', 'C63 Dirección ve las tres imágenes de la prueba (también la del folio que la base no tiene)', 'ok',
                                       coalesce(t = 'al3d/COT-9300@HUMO/img-humo-1.jpg al3d/COT-9300@HUMO/img-humo-2.jpg al3d/COT-9302@HUMO/img-humo-3.jpg', false), 'det', coalesce(t, 'ninguna'));
    exception when others then
      inf := inf || jsonb_build_object('caso', 'C63 Dirección ve las imágenes', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
    end;
    execute 'reset role';
    perform pg_temp.como('authenticated', u_pag, 'pag@humo.test');
    begin
      select string_agg(o.name, ' ' order by o.name) into t from storage.objects o where o.bucket_id = 'cotizacion-imagenes' and o.name like 'al3d/COT-93%@HUMO/%';
      inf := inf || jsonb_build_object('caso', 'C64 Pagos ve las dos de SU cotización (también la que subió Dirección) y no la del folio que la base no tiene', 'ok',
                                       coalesce(t = 'al3d/COT-9300@HUMO/img-humo-1.jpg al3d/COT-9300@HUMO/img-humo-2.jpg', false), 'det', coalesce(t, 'ninguna'));
      update storage.objects set metadata = '{"humo": true}'::jsonb where bucket_id = 'cotizacion-imagenes' and name like 'al3d/COT-9300@HUMO/%';
      get diagnostics n = row_count;
      t := n::text;
      -- Borrar no se prueba con DELETE: en Supabase real `protect_objects_delete` es un disparador POR SENTENCIA que rechaza
      -- cualquier DELETE por SQL antes de mirar la política (los borrados van por la API de Storage, que sí la aplica). Se evalúa
      -- la condición de la política de borrar, tal cual, como este rol: las filas que deja son las que la API dejaría borrar.
      execute format('select count(*) from storage.objects where bucket_id = %L and name like %L and (%s)',
                     'cotizacion-imagenes', 'al3d/COT-9300@HUMO/%', q_borrar) into n;
      inf := inf || jsonb_build_object('caso', 'C65 Pagos NO cambia ni borra, ni lo de su cotización (0 y 0 filas)', 'ok', t = '0' and n = 0, 'det', t || ' / ' || n::text);
    exception when others then
      inf := inf || jsonb_build_object('caso', 'C64-C65 (Pagos y sus imágenes)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
    end;
    execute 'reset role';
    perform pg_temp.como('authenticated', u_ext, 'ext@humo.test');
    begin
      select count(*) into n from storage.objects where bucket_id = 'cotizacion-imagenes';      -- TODAS: cero haya lo que haya
      t := n::text;
    exception when others then t := sqlstate;
    end;
    execute 'reset role';
    perform pg_temp.como('anon', null, null);
    begin
      select count(*) into n from storage.objects where bucket_id = 'cotizacion-imagenes';
      t := t || ' / ' || n::text;
    exception when others then t := t || ' / ' || sqlstate;
    end;
    inf := inf || jsonb_build_object('caso', 'C66 la persona ajena y anon NO ven ninguna imagen (0 / 0, o permission denied)', 'ok', t in ('0 / 0', '0 / 42501'), 'det', t);
    execute 'reset role';
    -- Borrar: solo Dirección. Igual que en C65 se evalúa la condición de la política de borrar (no un DELETE, que el disparador por
    -- sentencia de Supabase rechaza para todos, sin decir nada de la política).
    perform pg_temp.como('authenticated', u_dir, 'dir@humo.test');
    begin
      execute format('select count(*) from storage.objects where bucket_id = %L and name = %L and (%s)',
                     'cotizacion-imagenes', 'al3d/COT-9302@HUMO/img-humo-3.jpg', q_borrar) into n;
      inf := inf || jsonb_build_object('caso', 'C67 Dirección borra una imagen (la política la deja)', 'ok', n = 1, 'det', n::text || ' fila');
    exception when others then
      inf := inf || jsonb_build_object('caso', 'C67 Dirección borra una imagen (la política la deja)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
    end;
    execute 'reset role';
    select bk.public = false and bk.file_size_limit = 2097152 and bk.allowed_mime_types @> array['image/jpeg']
           and bk.allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp'] into b
      from storage.buckets bk where bk.id = 'cotizacion-imagenes';
    inf := inf || jsonb_build_object('caso', 'C68 el bucket es privado, con tope de 2 MB y solo imágenes', 'ok', coalesce(b, false), 'det', coalesce(b::text, 'no está'));
    select string_agg(p.polname, ', ' order by p.polname) into t from pg_policy p
     where p.polrelid = 'storage.objects'::regclass and p.polpermissive
       and p.polname not in ('cotizacion_imagenes_leer', 'cotizacion_imagenes_subir', 'cotizacion_imagenes_cambiar', 'cotizacion_imagenes_borrar')
       and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%cotizacion-imagenes%'
            or (coalesce(pg_get_expr(p.polqual, p.polrelid), '') not like '%bucket_id%' and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%bucket_id%'));
    inf := inf || jsonb_build_object('caso', 'C69 ninguna otra política de storage.objects abre el bucket (ni una que no mire bucket_id)', 'ok', t is null, 'det', coalesce(t, 'ninguna'));

    -- Q-02 bis (decidido por Elías el 2026-10-16): Fabricación VE las imágenes de las obras GANADAS (las necesita para fabricar; no llevan
    -- precios) y nada más; sigue sin subir, cambiar ni borrar. Tres obras de la prueba, como dueño: una ganada (con V-###, en diseño), una venta
    -- que se canceló y la lápida «No se dio» (sin V-###). Los V-### son de siete cifras, como el de C37, para no chocar con los de verdad, y
    -- ninguna de esas cotizaciones está en la base: lo que cuenta es la obra. Dirección sube una imagen a la carpeta de cada una.
    insert into public.proyectos (id, empresa_id, folio_hoja, folio_global, folio_local, dispositivo, fuente, nombre, etapa) values
      ('humo-img-gan', 'al3d', 'V-9999931', 'COT-9310@HUMO', 'COT-9310', 'HUMO', 'cotizacion', 'Humo - obra ganada', 'en_diseno'),
      ('humo-img-can', 'al3d', 'V-9999932', 'COT-9311@HUMO', 'COT-9311', 'HUMO', 'cotizacion', 'Humo - venta cancelada', 'cancelado'),
      ('humo-img-lap', 'al3d', null,        'COT-9312@HUMO', 'COT-9312', 'HUMO', 'cotizacion', 'Humo - No se dio', 'cancelado');
    perform pg_temp.como('authenticated', u_dir, 'dir@humo.test');
    begin
      insert into storage.objects (bucket_id, name, owner_id) values
        ('cotizacion-imagenes', 'al3d/COT-9310@HUMO/img-humo-g.jpg', u_dir::text),
        ('cotizacion-imagenes', 'al3d/COT-9311@HUMO/img-humo-c.jpg', u_dir::text),
        ('cotizacion-imagenes', 'al3d/COT-9312@HUMO/img-humo-l.jpg', u_dir::text);
      t := 'ok';
    exception when others then t := sqlstate || ' ' || sqlerrm;
    end;
    execute 'reset role';
    perform pg_temp.como('authenticated', u_fab, 'fab@humo.test');
    begin
      select count(*) into n from storage.objects where bucket_id = 'cotizacion-imagenes' and name = 'al3d/COT-9310@HUMO/img-humo-g.jpg';
      inf := inf || jsonb_build_object('caso', 'C70 Fabricación VE la imagen de una obra GANADA (aunque su cotización no esté en la base)', 'ok', t = 'ok' and n = 1,
                                       'det', 'Dirección subió: ' || t || ' / Fabricación ve ' || n::text);
      select count(*) into n from storage.objects where bucket_id = 'cotizacion-imagenes' and name in ('al3d/COT-9311@HUMO/img-humo-c.jpg', 'al3d/COT-9312@HUMO/img-humo-l.jpg');
      inf := inf || jsonb_build_object('caso', 'C71 Fabricación NO ve la de una venta cancelada ni la de una cotización «No se dio» (0)', 'ok', n = 0, 'det', n::text);
      -- TODAS las que ve, de la prueba o reales: cada una tiene que ser de una obra ganada (cero haya lo que haya).
      select count(*) into n from storage.objects o
       where o.bucket_id = 'cotizacion-imagenes'
         and not exists (select 1 from public.proyectos p
                          where p.empresa_id = (storage.foldername(o.name))[1] and p.folio_global = (storage.foldername(o.name))[2]
                            and p.folio_hoja is not null and p.etapa <> 'cancelado' and p.deleted_at is null);
      inf := inf || jsonb_build_object('caso', 'C72 Fabricación no ve NINGUNA imagen fuera de una obra ganada (0, contando todas las que ve)', 'ok', n = 0, 'det', n::text);
    exception when others then
      inf := inf || jsonb_build_object('caso', 'C70-C72 (Fabricación y las obras ganadas)', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into storage.objects (bucket_id, name, owner_id) values ('cotizacion-imagenes', 'al3d/COT-9310@HUMO/img-humo-f.jpg', u_fab::text);
      t := 'pudo subir';
    exception when others then t := sqlstate;
    end;
    begin
      update storage.objects set metadata = '{"humo": true}'::jsonb where bucket_id = 'cotizacion-imagenes' and name like 'al3d/COT-9310@HUMO/%';
      get diagnostics n = row_count;
      t := t || ' / ' || n::text;
      -- Borrar, como en C65: la condición de la política evaluada como este rol (no un DELETE).
      execute format('select count(*) from storage.objects where bucket_id = %L and name like %L and (%s)',
                     'cotizacion-imagenes', 'al3d/COT-9310@HUMO/%', q_borrar) into n;
      t := t || ' / ' || n::text;
    exception when others then t := t || ' / ' || sqlstate;
    end;
    inf := inf || jsonb_build_object('caso', 'C73 Fabricación NO sube, ni cambia ni borra, en la carpeta de la obra ganada que sí ve (42501 / 0 / 0)', 'ok', t = '42501 / 0 / 0', 'det', t);
    execute 'reset role';
    perform pg_temp.como('authenticated', u_pag, 'pag@humo.test');
    begin
      select count(*) into n from storage.objects where bucket_id = 'cotizacion-imagenes' and name like 'al3d/COT-931_@HUMO/%';
      inf := inf || jsonb_build_object('caso', 'C74 la obra ganada se le abre SOLO a Fabricación: Pagos no ve su imagen (no es su cotización) (0)', 'ok', n = 0, 'det', n::text);
    exception when others then
      inf := inf || jsonb_build_object('caso', 'C74 Pagos y la obra ganada', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
    end;
    execute 'reset role';
  end if;

  -- 12) La copia diaria hoja → nube (0018, decidida por Elías el 2026-10-16): su bitácora `cuadre_diario`. Solo Dirección la lee,
  --     nadie la escribe desde la app (la escribe la función importar-diario) y nadie la cambia ni la borra. Se siembra UN renglón de
  --     la prueba (resumen {"humo": true}) como dueño; lo que Dirección ve se cuenta solo de ese renglón; lo que debe ser cero, de todo.
  if to_regclass('public.cuadre_diario') is null then
    inf := inf || jsonb_build_object('caso', 'D01 cuadre_diario no existe: falta aplicar supabase/migrations/0018_cuadre_diario.sql', 'ok', false, 'det', 'falta 0018');
  else
    insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, rechazos, resumen, duracion_ms)
      values ('al3d', true, true, 0, 0, 0, '{"humo": true}', 1);
    perform pg_temp.como('authenticated', u_dir, 'dir@humo.test');
    begin
      select count(*) into n from public.cuadre_diario where resumen @> '{"humo": true}';
      inf := inf || jsonb_build_object('caso', 'D01 Dirección lee la copia diaria (el renglón de la prueba)', 'ok', n = 1, 'det', n::text);
    exception when others then
      inf := inf || jsonb_build_object('caso', 'D01 Dirección lee la copia diaria', 'ok', false, 'det', sqlstate || ' ' || sqlerrm);
    end;
    begin
      insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, duracion_ms) values ('al3d', true, true, 0, 0, 1);
      t := 'pudo';
    exception when others then t := sqlstate;
    end;
    inf := inf || jsonb_build_object('caso', 'D02 Dirección NO escribe en cuadre_diario (42501: la escribe solo la función)', 'ok', t = '42501', 'det', t);
    execute 'reset role';
    t := '';
    perform pg_temp.como('authenticated', u_fab, 'fab@humo.test');
    begin select count(*) into n from public.cuadre_diario; t := n::text;                 -- TODAS: cero haya lo que haya
    exception when others then t := sqlstate; end;
    execute 'reset role';
    perform pg_temp.como('authenticated', u_pag, 'pag@humo.test');
    begin select count(*) into n from public.cuadre_diario; t := t || ' / ' || n::text;
    exception when others then t := t || ' / ' || sqlstate; end;
    execute 'reset role';
    perform pg_temp.como('authenticated', u_ext, 'ext@humo.test');
    begin select count(*) into n from public.cuadre_diario; t := t || ' / ' || n::text;
    exception when others then t := t || ' / ' || sqlstate; end;
    execute 'reset role';
    inf := inf || jsonb_build_object('caso', 'D03 Fabricación, Pagos y la persona ajena NO ven ningún renglón de cuadre_diario (0 / 0 / 0)', 'ok', t = '0 / 0 / 0', 'det', t);
    perform pg_temp.como('anon', null, null);
    begin select count(*) into n from public.cuadre_diario; t := n::text;
    exception when others then t := sqlstate; end;
    execute 'reset role';
    inf := inf || jsonb_build_object('caso', 'D04 anon NO lee cuadre_diario (permission denied)', 'ok', t = '42501', 'det', t);
    begin
      update public.cuadre_diario set cuadra = cuadra where resumen @> '{"humo": true}';
      t := 'pudo';
    exception when others then t := sqlstate;
    end;
    begin
      delete from public.cuadre_diario where resumen @> '{"humo": true}';
      t := t || ' / pudo';
    exception when others then t := t || ' / ' || sqlstate;
    end;
    inf := inf || jsonb_build_object('caso', 'D05 ni el dueño cambia ni borra cuadre_diario (solo_agregar y sin_borrar: P0001 / P0001)', 'ok', t = 'P0001 / P0001', 'det', t);
  end if;

  -- Informe: el error es a propósito (deshace los usuarios y las filas de prueba).
  raise exception 'HUMO_RESULTADO %', jsonb_build_object(
    'fallos', (select count(*) from jsonb_array_elements(inf) e where not (e->>'ok')::boolean),
    'total', jsonb_array_length(inf),
    'casos', inf)::text;
end $humo$;
