-- =====================================================================================================
-- 0019_tarifas.sql — los precios del cotizador, editables por Dirección (decidido por Elías el 2026-10-23)
-- =====================================================================================================
-- Hasta aquí el catálogo de precios vivía escrito a mano en tres copias (js/cotizador/catalogo.js, el Apps Script y
-- supabase/functions/_shared/precio.js). Elías pidió (nota de voz del 2026-10-23) que Dirección mueva los precios y agregue u
-- oculte materiales desde el cotizador. Mientras la hoja manda, la tabla vive en su pestaña «Tarifas» (puente/hoja-apps-script.gs,
-- «Las tarifas, editables») y la copia diaria la trae aquí (scripts/importador). Esta migración deja la casa del lado de la nube,
-- para que el día que se encienda Supabase el precio que sella `autorizar` sea el mismo que cobra el teléfono:
--
--   · `public.tarifas`: un renglón por precio (grupo, clave). Las claves de fábrica no se borran —las cotizaciones guardadas las
--     nombran—: se ocultan (`visible = false`) y siguen cobrando donde ya están. Un renglón nuevo dice `como`: de cuál de fábrica
--     de su grupo se fabrica (de ese hereda la iluminación, el texto del PDF y el material de compra, en el cliente).
--   · `interno.tarifas_fabrica()`: el catálogo de fábrica, la CUARTA copia escrita a mano (pruebas/tarifas.mjs la compara con
--     catalogo.js). Con la tabla vacía, o sin un renglón de fábrica, se cobra con él.
--   · `interno.tarifas_tabla(empresa)`: la tabla que manda, completa: lo guardado más lo de fábrica que falte, en orden.
--   · RPC de cliente `tarifas_leer(empresa)`: cualquier área la lee (quien cotiza necesita los precios).
--   · RPC de cliente `tarifas_guardar(filas, empresa)`: SOLO Dirección. Todo o nada (un renglón malo frena el guardado entero, con
--     su razón), nunca borra, fecha y firma lo que cambió y lo anota en la bitácora. Las mismas reglas que /guardar_tarifas del .gs.
--   · RPC de servicio `tarifas_de(empresa)`: la que pide la función `autorizar` antes de recalcular el subtotal.
--
-- Quién escribe la tabla: `tarifas_guardar` (dueño, SECURITY DEFINER) y el importador de la copia diaria (el dueño `postgres`).
-- `authenticated` solo lee (RLS: las tres áreas de la empresa). `service_role` tiene SELECT/INSERT/UPDATE por uniformidad con las
-- demás tablas; nadie tiene DELETE (sin_borrar). No va a Realtime: la lista cerrada de 0011 no cambia.
--
-- Las listas cerradas de RPC de `interno.auditoria()` sí cambian (tres funciones nuevas), así que la función se vuelve a crear AQUÍ,
-- idéntica a la de 0011 salvo esas listas. Termina corriendo la aduana.
-- Depende de: 0001…0018. Idempotente.
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. La tabla
-- -----------------------------------------------------------------------------------------------------
create table if not exists public.tarifas (
  empresa_id      text not null references public.empresas (id),
  grupo           text not null check (grupo in ('material','complejidad','recorte','recorte-extra','bastidor','caja')),
  clave           text not null check (clave ~ '^[a-z0-9-]{2,24}$'),
  nombre          text not null check (pg_catalog.length(pg_catalog.btrim(nombre)) between 1 and 60),
  precio          numeric(12,2) not null check (precio >= 0 and precio <= 1000000),
  como            text not null default '' check (como = '' or como ~ '^[a-z0-9-]{2,24}$'),
  visible         boolean not null default true,
  orden           integer not null default 0,
  detalle         text not null default '' check (pg_catalog.length(detalle) <= 120),
  actualizado_por text not null default '',
  actualizado_en  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default clock_timestamp(),
  primary key (empresa_id, grupo, clave)
);

drop trigger if exists tarifas_tocar      on public.tarifas;
drop trigger if exists tarifas_sin_borrar on public.tarifas;
create trigger tarifas_tocar      before insert or update on public.tarifas for each row execute function interno.tocar();
create trigger tarifas_sin_borrar before delete          on public.tarifas for each row execute function interno.sin_borrar();

alter table public.tarifas enable row level security;
revoke all on public.tarifas from public, anon, authenticated, service_role;
grant select on public.tarifas to authenticated;
grant select, insert, update on public.tarifas to service_role;

drop policy if exists tarifas_sel_todos on public.tarifas;
create policy tarifas_sel_todos on public.tarifas for select to authenticated
  using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));


-- -----------------------------------------------------------------------------------------------------
-- 2. El catálogo de fábrica y la tabla que manda
-- -----------------------------------------------------------------------------------------------------
-- [grupo, clave, nombre, precio, detalle]: el mismo orden y los mismos valores que COT_TARIFAS_FABRICA del .gs.
create or replace function interno.tarifas_fabrica() returns jsonb language sql immutable set search_path = '' as $$
  select '[
    ["material","al-paint","Aluminio Blanco/Negro/Pintado",30,"LED posterior (cálida/fría)"],
    ["material","al-brush","Aluminio Brush Cepillado",35,"LED posterior (cálida/fría)"],
    ["material","acr-vol","Acrílico + Aluminio (Volumen)",40,"LED fría frontal"],
    ["material","acr-vinil","Acrílico + Vinil",45,"LED fría frontal"],
    ["material","acero","Acero Inoxidable",55,"LED posterior (cálida/fría)"],
    ["complejidad","recta","Recta",0,""],
    ["complejidad","cursiva","Cursiva",5,""],
    ["complejidad","compleja","Compleja",10,""],
    ["recorte","sencillo","Sencillo",20,""],
    ["recorte","vinil","Rotulación de vinil",25,""],
    ["recorte","sandwich","Tipo sándwich c/iluminación",55,""],
    ["recorte-extra","sandwich","Complejidad del sándwich",5,""],
    ["bastidor","lamina","Lámina",950,""],
    ["bastidor","alucobond","Alucobond",1500,""],
    ["caja","std","Estándar",3900,"Cuadrada / rectangular / circular"],
    ["caja","nube","Tipo nube / silueta",4600,"Silueta de logotipo o personaje"]
  ]'::jsonb
$$;
revoke all on function interno.tarifas_fabrica() from public, anon, authenticated, service_role;

-- La tabla completa de una empresa, con la forma que el teléfono ya sabe leer (la de /tarifas del .gs):
-- {filas:[{grupo, clave, nombre, precio, como, visible, orden, detalle, fabrica, actualizado, por}], actualizado, por}.
create or replace function interno.tarifas_tabla(p_empresa text) returns jsonb language sql stable set search_path = '' as $$
  with fab as (
    select f ->> 0 as grupo, f ->> 1 as clave, f ->> 2 as nombre, (f ->> 3)::numeric as precio, f ->> 4 as detalle, (o - 1)::int as n
      from pg_catalog.jsonb_array_elements(interno.tarifas_fabrica()) with ordinality as x(f, o)
  ), todas as (
    select t.grupo, t.clave, t.nombre, t.precio, t.como, t.visible, t.orden, t.detalle, (fab.clave is not null) as fabrica,
           t.actualizado_en, t.actualizado_por
      from public.tarifas t left join fab on fab.grupo = t.grupo and fab.clave = t.clave
     where t.empresa_id = p_empresa
    union all
    select fab.grupo, fab.clave, fab.nombre, fab.precio, '', true, 1000 + fab.n, fab.detalle, true, null, ''
      from fab
     where not exists (select 1 from public.tarifas t where t.empresa_id = p_empresa and t.grupo = fab.grupo and t.clave = fab.clave)
  ), ultimo as (
    select actualizado_en, actualizado_por from todas where actualizado_en is not null order by actualizado_en desc limit 1
  )
  select pg_catalog.jsonb_build_object(
    'filas', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'grupo', grupo, 'clave', clave, 'nombre', nombre, 'precio', precio, 'como', como, 'visible', visible, 'orden', orden,
               'detalle', detalle, 'fabrica', fabrica,
               'actualizado', coalesce(pg_catalog.to_char(actualizado_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''),
               'por', actualizado_por)
             order by pg_catalog.array_position(array['material','complejidad','recorte','recorte-extra','bastidor','caja'], grupo), orden, clave)
             from todas), '[]'::jsonb),
    'actualizado', coalesce((select pg_catalog.to_char(actualizado_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from ultimo), ''),
    'por', coalesce((select actualizado_por from ultimo), ''))
$$;
revoke all on function interno.tarifas_tabla(text) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. Leer y guardar
-- -----------------------------------------------------------------------------------------------------
create or replace function public.tarifas_leer(p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pre record;
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion','fabricacion','pagos']);
  if pre.e is not null then return pre.e; end if;
  return pg_catalog.jsonb_build_object('ok', true, 'tabla', interno.tarifas_tabla((pre.c).empresa_id));
end $$;
revoke all on function public.tarifas_leer(text) from public, anon, authenticated, service_role;
grant execute on function public.tarifas_leer(text) to authenticated;

-- Las mismas reglas que cotMezclarTarifas_ del .gs, con los mismos mensajes. Primero se revisa TODO; si algo no sirve, no se
-- escribe nada.
create or replace function public.tarifas_guardar(p_filas jsonb, p_empresa text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pre record; f jsonb; v_g text; v_k text; v_nom text; v_p numeric; v_como text; v_vis boolean; v_fab boolean; v_gratis boolean;
  v_vistos text[] := '{}'; v_quien text; v_cambios integer := 0; v_prev public.tarifas; v_orden integer; v_detalle text;
  v_fabrica jsonb := interno.tarifas_fabrica();
begin
  select * into pre from interno.preambulo(p_empresa, array['direccion']);
  if pre.e is not null then return pre.e; end if;
  if pg_catalog.jsonb_typeof(p_filas) is distinct from 'array' or pg_catalog.jsonb_array_length(p_filas) = 0 or pg_catalog.jsonb_array_length(p_filas) > 80 then
    return interno.err('DATO_INVALIDO', 'La tabla de precios no se entiende.'); end if;

  -- 1. Revisar
  for f in select x from pg_catalog.jsonb_array_elements(p_filas) as e(x) loop
    if pg_catalog.jsonb_typeof(f) is distinct from 'object' then return interno.err('DATO_INVALIDO', 'Un renglón de la tabla no se entiende.'); end if;
    v_g := coalesce(f ->> 'grupo', ''); v_k := coalesce(f ->> 'clave', '');
    if not v_g = any (array['material','complejidad','recorte','recorte-extra','bastidor','caja']) then
      return interno.err('DATO_INVALIDO', 'El grupo «' || pg_catalog.left(v_g, 20) || '» no existe.'); end if;
    if v_k !~ '^[a-z0-9-]{2,24}$' then
      return interno.err('DATO_INVALIDO', 'La clave «' || pg_catalog.left(v_k, 30) || '» no sirve: van minúsculas, números y guiones.'); end if;
    if (v_g || '|' || v_k) = any (v_vistos) then return interno.err('DATO_INVALIDO', 'La clave «' || v_k || '» viene dos veces.'); end if;
    v_vistos := v_vistos || (v_g || '|' || v_k);
    v_nom := pg_catalog.btrim(coalesce(f ->> 'nombre', ''));
    if v_nom = '' or pg_catalog.length(v_nom) > 60 then return interno.err('DATO_INVALIDO', 'Cada renglón lleva un nombre de 1 a 60 letras.'); end if;
    if v_nom ~ '[<>&"`]' then
      return interno.err('DATO_INVALIDO', 'El nombre «' || pg_catalog.regexp_replace(v_nom, '[<>&"`]', '', 'g') || '» no puede llevar < > & " ni `.'); end if;
    v_gratis := v_g in ('complejidad', 'recorte-extra');
    v_p := case when pg_catalog.jsonb_typeof(f -> 'precio') = 'number' then (f ->> 'precio')::numeric
                when pg_catalog.jsonb_typeof(f -> 'precio') = 'string' and (f ->> 'precio') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (f ->> 'precio')::numeric end;
    if v_p is null or v_p < 0 or (not v_gratis and v_p <= 0) or v_p > 1000000 then
      return interno.err('DATO_INVALIDO', 'El precio de «' || v_nom || '» no sirve.'); end if;
    v_fab := exists (select 1 from pg_catalog.jsonb_array_elements(v_fabrica) z where z ->> 0 = v_g and z ->> 1 = v_k);
    if not v_fab then
      if v_gratis then return interno.err('DATO_INVALIDO', 'En «' || v_g || '» no se agregan renglones.'); end if;
      select t.* into v_prev from public.tarifas t where t.empresa_id = (pre.c).empresa_id and t.grupo = v_g and t.clave = v_k;
      v_como := coalesce(f ->> 'como', v_prev.como, '');
      if not exists (select 1 from pg_catalog.jsonb_array_elements(v_fabrica) z where z ->> 0 = v_g and z ->> 1 = v_como) then
        return interno.err('DATO_INVALIDO', '«' || v_nom || '» tiene que decir de cuál de fábrica se fabrica.'); end if;
    end if;
  end loop;

  -- 2. Escribir
  v_quien := coalesce(interno.correo_verificado(), '');
  for f in select x from pg_catalog.jsonb_array_elements(p_filas) as e(x) loop
    v_g := f ->> 'grupo'; v_k := f ->> 'clave'; v_nom := pg_catalog.btrim(f ->> 'nombre');
    v_p := pg_catalog.round((f ->> 'precio')::numeric, 2);
    v_fab := exists (select 1 from pg_catalog.jsonb_array_elements(v_fabrica) z where z ->> 0 = v_g and z ->> 1 = v_k);
    select t.* into v_prev from public.tarifas t where t.empresa_id = (pre.c).empresa_id and t.grupo = v_g and t.clave = v_k;
    v_como := case when v_fab then '' else coalesce(f ->> 'como', v_prev.como, '') end;
    v_vis := coalesce((f -> 'visible')::text <> 'false', true);
    if v_prev.clave is null then
      select coalesce(max(t.orden) + 1, 0) into v_orden from public.tarifas t where t.empresa_id = (pre.c).empresa_id and t.grupo = v_g;
      select coalesce(z ->> 4, '') into v_detalle from pg_catalog.jsonb_array_elements(v_fabrica) z
       where z ->> 0 = v_g and z ->> 1 = (case when v_fab then v_k else v_como end);
      insert into public.tarifas (empresa_id, grupo, clave, nombre, precio, como, visible, orden, detalle, actualizado_por, actualizado_en)
      values ((pre.c).empresa_id, v_g, v_k, v_nom, v_p, v_como, v_vis, v_orden, coalesce(v_detalle, ''), v_quien, pg_catalog.now());
      v_cambios := v_cambios + 1;
    elsif (v_prev.nombre, v_prev.precio, v_prev.visible, v_prev.como) is distinct from (v_nom, v_p, v_vis, v_como) then
      update public.tarifas t set nombre = v_nom, precio = v_p, visible = v_vis, como = v_como, actualizado_por = v_quien, actualizado_en = pg_catalog.now()
       where t.empresa_id = (pre.c).empresa_id and t.grupo = v_g and t.clave = v_k;
      v_cambios := v_cambios + 1;
    end if;
  end loop;

  -- Un grupo entero oculto no deja con qué cotizar: el primero vuelve a ofrecerse (la regla del .gs). «Entero» incluye lo de
  -- fábrica que todavía no tiene renglón: ese cuenta como visible.
  for v_g in select distinct t.grupo from public.tarifas t where t.empresa_id = (pre.c).empresa_id loop
    if not exists (select 1 from public.tarifas t where t.empresa_id = (pre.c).empresa_id and t.grupo = v_g and t.visible)
       and not exists (select 1 from pg_catalog.jsonb_array_elements(v_fabrica) z
                        where z ->> 0 = v_g
                          and not exists (select 1 from public.tarifas t where t.empresa_id = (pre.c).empresa_id and t.grupo = v_g and t.clave = z ->> 1)) then
      update public.tarifas t set visible = true
       where t.empresa_id = (pre.c).empresa_id and t.grupo = v_g
         and t.clave = (select x.clave from public.tarifas x where x.empresa_id = (pre.c).empresa_id and x.grupo = v_g order by x.orden, x.clave limit 1);
    end if;
  end loop;

  if v_cambios > 0 then
    -- En la bitácora va como una constante más (su lista de entidades es cerrada desde 0001): la «constante» tarifas.
    perform interno.anotar(pre.c, 'direccion', 'guardo', 'constante', 'tarifas', 'Precios guardados: ' || v_cambios || ' cambio(s)');
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'tabla', interno.tarifas_tabla((pre.c).empresa_id), 'cambios', v_cambios);
end $$;
revoke all on function public.tarifas_guardar(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.tarifas_guardar(jsonb, text) to authenticated;

-- La de la función `autorizar`: la tabla de una empresa, sin preguntar quién (eso ya lo hizo la función con la sesión).
create or replace function public.tarifas_de(p_empresa text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select interno.tarifas_tabla(p_empresa)
$$;
revoke all on function public.tarifas_de(text) from public, anon, authenticated, service_role;
grant execute on function public.tarifas_de(text) to service_role;


-- -----------------------------------------------------------------------------------------------------
-- 4. La auditoría de 0011 con las tres RPC nuevas en sus listas cerradas (lo demás, idéntico)
-- -----------------------------------------------------------------------------------------------------
create or replace function interno.auditoria() returns text[]
language plpgsql stable set search_path = '' as $$
declare
  c_cliente     constant text[] := array['almacen_aplicar','alta_venta','cancelar_solicitud','comisiones_cobradas','constante_guardar','corregir_abono','corregir_venta','cotizacion_guardar',
                                         'cuaderno_guardar','descartar_cotizacion','emitir_salidas_derivadas','estado_solicitudes','ganar_proyecto','instalacion_guardar','mi_acceso','miembro_alta',
                                         'miembro_baja','miembro_cambiar_area','mover_etapa','pantalla_aprobar','pantalla_revocar','proyecto_actualizar','rechazar_solicitud','reclamar_acceso','registrar_abono_comision','registrar_cobro',
                                         'repartir_abono_fifo','revocar_autorizacion','solicitar','subida_unica','tarifas_guardar','tarifas_leer','version_contrato','vista_previa_reparto'];
  c_servicio    constant text[] := array['autorizacion_para_verificar','contador_sembrar','cuadre_hoja','ia_cuota','ia_turno','pantalla_solicitar','pantalla_tablero','registrar_autorizacion','tarifas_de','verificar_cupo'];
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

  -- ---- GR-09: nada de negocio se borra: toda tabla de `public` (salvo `contadores`, que limpia sus ventanas vencidas, y `pantallas` de 0022, que borra códigos de vinculación vencidos) lleva su trigger `sin_borrar` ----------
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
-- La aduana otra vez: lo nuevo no puede dejar nada abierto
-- -----------------------------------------------------------------------------------------------------
do $auditoria$
declare v_problemas text[] := interno.auditoria();
begin
  if pg_catalog.cardinality(v_problemas) > 0 then
    raise exception E'AUDITORIA DE SEGURIDAD (0019): se encontraron % problema(s) y el despliegue se detiene:\n- %',
      pg_catalog.cardinality(v_problemas), pg_catalog.array_to_string(v_problemas, E'\n- ');
  end if;
end $auditoria$;
