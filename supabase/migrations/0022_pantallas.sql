-- =====================================================================================================
-- 0022_pantallas.sql — la PANTALLA DEL TALLER: una TV que enseña las obras por etapa, sin dinero
-- =====================================================================================================
-- Elías lo pidió el 2026-10-24: «la pantalla del taller: obras por etapa, próximas instalaciones y atrasos, sin dinero».
-- Una TV (o cualquier navegador) abre `taller.html` y enseña las cinco estaciones del Tablero con sus obras, quién va tarde y las
-- instalaciones que vienen. La lee el equipo entero, así que NUNCA lleva montos: sale de las columnas de `proyectos` que ve
-- Fabricación (y de `origen_obra`, que por su CHECK no puede traer dinero), no de las de Pagos.
--
-- CÓMO SE VINCULA UNA PANTALLA (sin contraseñas y sin que un secreto pase por nadie)
--   1. La TV le pide a la función `pantalla` (supabase/functions/pantalla) un código. La función inventa un SECRETO al azar
--      (32 bytes), se queda con él la TV (en su localStorage) y a la base solo le llega su huella sha256 y un código de 6 letras
--      sin letras que se confundan (`pantalla_solicitar`). El código vale 15 minutos.
--   2. Dirección, con su sesión de siempre en la app, escribe ese código en Ajustes → Supabase → «Pantallas del taller»
--      (`pantalla_aprobar`). La fila pasa a `activa`, queda en SU empresa y el código se borra.
--   3. Desde ahí la TV pregunta cada minuto con su secreto (`pantalla_tablero`, por la función). Si Dirección la desconecta
--      (`pantalla_revocar`), la TV lo ve en la siguiente vuelta, olvida el secreto y vuelve al paso 1.
--   La base NUNCA ve el secreto: con la huella no se puede pedir el tablero (la función vuelve a sacar la huella de lo que manda
--   la TV), así que leer esta tabla no deja hacerse pasar por una pantalla.
--
-- QUIÉN PUEDE QUÉ (la auditoría de 0011, al final, lo vuelve a comprobar)
--   · `pantalla_solicitar`, `pantalla_tablero`: RPC de SERVICIO (solo `service_role`, es decir, la función). Ni anon ni la app.
--   · `pantalla_aprobar`, `pantalla_revocar`: RPC de cliente, y por dentro solo Dirección (`interno.preambulo`). Dejan línea en
--     la bitácora.
--   · La tabla: Dirección de la empresa lee sus pantallas (nombre, estado, última conexión) por RLS y por columnas: la huella y
--     el código no se leen desde la app. Nadie escribe directo; todo pasa por las RPC de arriba.
--
-- LO QUE NO HACE
--   · No calcula atrasos. Eso es `Taller.ventanaTaller()` (js/datos/taller.js) y lo corre la función con ESE mismo archivo:
--     dos respuestas a «¿va tarde?» serían dos verdades. Esto solo entrega los datos que esa función ya lee en la app.
--   · No sabe de la frescura de los datos: dice la hora de la última copia aplicada de la hoja (`cuadre_diario`) y la pantalla
--     la enseña («Actualizado a las …»). Mientras la hoja mande, la pantalla va tan al día como la copia.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. La tabla
-- -----------------------------------------------------------------------------------------------------
create table if not exists public.pantallas (
  id            uuid primary key default pg_catalog.gen_random_uuid(),
  empresa_id    text references public.empresas (id),                                   -- NULL mientras espera: nadie la ha aprobado
  nombre        text not null default '' check (length(nombre) <= 60),
  secreto_hash  text not null unique check (secreto_hash ~ '^[0-9a-f]{64}$'),           -- sha256 del secreto que guarda la TV
  codigo        text check (codigo ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),        -- solo mientras espera
  codigo_vence  timestamptz,
  estado        text not null default 'pendiente' check (estado in ('pendiente','activa','revocada')),
  aprobada_por  uuid,
  aprobada_en   timestamptz,
  revocada_por  uuid,
  revocada_en   timestamptz,
  ultima_vez    timestamptz,                                                            -- la última vez que pidió el tablero
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default clock_timestamp(),
  constraint pantallas_espera  check ((estado = 'pendiente') = (codigo is not null and codigo_vence is not null)),
  constraint pantallas_empresa check (estado = 'pendiente' or empresa_id is not null)
);
create unique index if not exists pantallas_codigo_pendiente on public.pantallas (codigo) where estado = 'pendiente';
create index if not exists pantallas_por_empresa on public.pantallas (empresa_id, estado);

drop trigger if exists pantallas_tocar on public.pantallas;
create trigger pantallas_tocar before insert or update on public.pantallas for each row execute function interno.tocar();

alter table public.pantallas enable row level security;
revoke all on public.pantallas from public, anon, authenticated, service_role;
-- Dirección lee lo suyo, y solo estas columnas: la huella y el código no salen hacia la app.
grant select (id, empresa_id, nombre, estado, aprobada_en, revocada_en, ultima_vez, created_at) on public.pantallas to authenticated;
grant select, insert, update on public.pantallas to service_role;   -- sin DELETE, como todas; el respaldo semanal la lee
drop policy if exists pantallas_sel_direccion on public.pantallas;
create policy pantallas_sel_direccion on public.pantallas for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion'])));
-- M-6: sin estadísticas en las columnas de texto (el planificador no guarda muestras de la huella ni del nombre).
alter table public.pantallas alter column secreto_hash set statistics 0;
alter table public.pantallas alter column codigo set statistics 0;
alter table public.pantallas alter column nombre set statistics 0;


-- -----------------------------------------------------------------------------------------------------
-- 2. Pedir un código (la función, por la TV que todavía no está vinculada)
-- -----------------------------------------------------------------------------------------------------
-- La función manda la huella del secreto que acaba de inventar y un código ya armado. Aquí se comprueba la forma, se limpia lo
-- que venció hace más de un día (SECURITY DEFINER: lo borra el dueño; ni service_role tiene DELETE) y se pone un TOPE de pantallas
-- esperando a la vez, para que nadie llene la tabla pidiendo códigos. Un código repetido contesta DUPLICADO y la función pide otro.
create or replace function public.pantalla_solicitar(p_secreto_hash text, p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_vence timestamptz := pg_catalog.now() + interval '15 minutes'; v_esperando int;
begin
  if p_secreto_hash is null or p_secreto_hash !~ '^[0-9a-f]{64}$' then return interno.err('DATO_INVALIDO', 'Falta la huella de la pantalla.'); end if;
  if p_codigo is null or p_codigo !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then return interno.err('DATO_INVALIDO', 'El código no tiene la forma de siempre.'); end if;
  delete from public.pantallas where estado = 'pendiente' and codigo_vence < pg_catalog.now() - interval '1 day';
  select pg_catalog.count(*) into v_esperando from public.pantallas where estado = 'pendiente' and codigo_vence > pg_catalog.now();
  if v_esperando >= 20 then
    return interno.err('CUPO_AGOTADO', 'Hay demasiadas pantallas esperando su código. Prueba en unos minutos.');
  end if;
  if exists (select 1 from public.pantallas where secreto_hash = p_secreto_hash) then
    return interno.err('DUPLICADO', 'Esa pantalla ya pidió su código.');
  end if;
  if exists (select 1 from public.pantallas where estado = 'pendiente' and codigo = p_codigo) then
    return interno.err('DUPLICADO', 'Ese código ya está en uso.');
  end if;
  insert into public.pantallas (secreto_hash, codigo, codigo_vence) values (p_secreto_hash, p_codigo, v_vence);
  return pg_catalog.jsonb_build_object('ok', true, 'codigo', p_codigo, 'vence', v_vence);
end $$;
revoke all on function public.pantalla_solicitar(text, text) from public, anon, authenticated, service_role;
grant execute on function public.pantalla_solicitar(text, text) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. Lo que ve la pantalla (la función, con la huella de lo que mandó la TV)
-- -----------------------------------------------------------------------------------------------------
-- Contesta el estado de la pantalla y, si está activa, los datos que `ventanaTaller` lee en la app, de las cinco estaciones
-- (ganado … listo): las obras con sus columnas SIN dinero, sus instalaciones vivas (no canceladas ni borradas), las dos constantes
-- del plazo y la hora de la última copia aplicada de la hoja. `origen` son SOLO las piezas (`items`) de `origen_obra` (la copia sin
-- precios de la cotización; su CHECK `contiene_dinero` lo garantiza): es lo único que lee el plazo sugerido. El resto de `origen_obra`
-- (cliente, teléfono, dirección) no sale de la base, aunque no sea dinero. Para las obras EN PRODUCCIÓN (diseño, corte, armado)
-- van además el límite de fabricación (`entrega`), la nota y los ids de los renders, y el `folio_global` (la carpeta de sus imágenes
-- en Storage): con eso la función arma su ORDEN DE TRABAJO para la TV (las piezas con sus medidas y el plano, sin precios), que la
-- pantalla enseña rotando (Elías, 2026-10-24: «que la hoja de fabricación del proyecto también aparezca»).
-- La «última vez» se escribe como mucho cada 5 minutos: la TV pregunta cada minuto y no hace falta una escritura por pregunta.
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
                        where p.empresa_id = v_emp and p.deleted_at is null and not p.historica
                          and p.etapa in ('ganado', 'en_diseno', 'cortado', 'armado', 'listo')), '[]'::jsonb),
    'instalaciones', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                                  'proyecto_id', i.proyecto_id, 'fecha', i.fecha, 'hora', i.hora, 'ventana', i.ventana, 'estado', i.estado)
                                  order by i.fecha, (i.hora is null), i.hora, i.created_at)
                                 from public.instalaciones i
                                 join public.proyectos p on p.empresa_id = i.empresa_id and p.id = i.proyecto_id
                                where i.empresa_id = v_emp and i.deleted_at is null and i.estado <> 'cancelada'
                                  and p.deleted_at is null and not p.historica
                                  and p.etapa in ('ganado', 'en_diseno', 'cortado', 'armado', 'listo')), '[]'::jsonb));
end $$;
revoke all on function public.pantalla_tablero(text) from public, anon, authenticated, service_role;
grant execute on function public.pantalla_tablero(text) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 4. Aprobar y desconectar (Dirección, desde la app)
-- -----------------------------------------------------------------------------------------------------
create or replace function public.pantalla_aprobar(p_codigo text, p_nombre text default '', p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; s public.pantallas;
        v_codigo text := pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
        v_nombre text := pg_catalog.left(pg_catalog.btrim(coalesce(p_nombre, '')), 60);
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  if v_codigo !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then return interno.err('DATO_INVALIDO', 'El código son 6 letras y números, como sale en la TV.'); end if;
  if v_nombre = '' then v_nombre := 'Pantalla del taller'; end if;
  select * into s from public.pantallas where estado = 'pendiente' and codigo = v_codigo for update;
  if not found or s.codigo_vence <= pg_catalog.now() then
    return interno.err('NO_ENCONTRADO', 'Ese código no existe o ya venció. En la TV sale uno nuevo solo; escribe el que se vea ahora.');
  end if;
  update public.pantallas set estado = 'activa', empresa_id = (pre.c).empresa_id, nombre = v_nombre, codigo = null, codigo_vence = null,
                              aprobada_por = auth.uid(), aprobada_en = pg_catalog.now()
   where id = s.id;
  perform interno.anotar(pre.c, 'direccion', 'alta', 'plataforma', 'pantalla:' || s.id::text, 'Pantalla vinculada: ' || v_nombre, '',
                         null, pg_catalog.jsonb_build_object('nombre', v_nombre, 'estado', 'activa'));
  return pg_catalog.jsonb_build_object('ok', true, 'id', s.id, 'nombre', v_nombre);
end $$;
revoke all on function public.pantalla_aprobar(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.pantalla_aprobar(text, text, text) to authenticated;

create or replace function public.pantalla_revocar(p_id uuid, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record; s public.pantallas;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  select * into s from public.pantallas where id = p_id and empresa_id = (pre.c).empresa_id for update;
  if not found then return interno.err('NO_ENCONTRADO', 'No existe esa pantalla.'); end if;
  if s.estado = 'revocada' then return pg_catalog.jsonb_build_object('ok', true, 'sin_cambio', true); end if;
  update public.pantallas set estado = 'revocada', revocada_por = auth.uid(), revocada_en = pg_catalog.now() where id = s.id;
  perform interno.anotar(pre.c, 'direccion', 'baja', 'plataforma', 'pantalla:' || s.id::text, 'Pantalla desconectada: ' || s.nombre, '',
                         pg_catalog.jsonb_build_object('estado', s.estado), pg_catalog.jsonb_build_object('estado', 'revocada'));
  return pg_catalog.jsonb_build_object('ok', true);
end $$;
revoke all on function public.pantalla_revocar(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.pantalla_revocar(uuid, text) to authenticated;


-- -----------------------------------------------------------------------------------------------------
-- 5. La auditoría de 0011 con las cuatro RPC nuevas en sus listas cerradas (lo demás, idéntico a 0019)
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
    raise exception E'AUDITORIA DE SEGURIDAD (0022): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
