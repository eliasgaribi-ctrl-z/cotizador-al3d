-- =====================================================================================================
-- 0001_fundacion.sql — la base común sobre la que se apoya todo lo demás
-- =====================================================================================================
-- Qué deja:
--   · los privilegios por defecto (nada nace abierto), el esquema `interno` y los triggers comunes;
--   · las utilidades PURAS (sin leer tablas) que los CHECK, las vistas y las RPC comparten: la compuerta de
--     sellos, el IVA y la comisión, el folio, el teléfono, el día de México…;
--   · las tablas `empresas`, `contadores` (+ `siguiente`) y `bitacora`, y la semilla `al3d`.
--
-- Depende de: nada. Compatible con PostgreSQL 15 a 18; no usa ninguna extensión de Supabase (ni pgcrypto,
-- pg_cron, pg_net ni vault): el HMAC del sello lo calcula una Edge Function y esta base jamás guarda la clave.
--
-- Cómo se escribe y se lee (regla de oro del diseño, docs/DECISIONES-SUPABASE.md §A):
--   · LEER  = PostgREST sobre tablas y vistas, filtrado por RLS.
--   · ESCRIBIR = SOLO por RPC `SECURITY DEFINER` (las trae cada migración). `authenticated` no recibe
--     INSERT/UPDATE/DELETE en NINGUNA tabla: así «cambiar el rol en Ajustes no da permisos» se cumple en la
--     base y no en la pantalla.
--   · El proyecto de Supabase se configura con «exponer tablas automáticamente» APAGADO y «RLS automático»
--     ENCENDIDO. Por eso cada objeto declara aquí su propio GRANT/REVOKE y su ENABLE ROW LEVEL SECURITY.
--     `service_role` salta RLS (BYPASSRLS) pero NO los privilegios: también lleva su GRANT explícito. Cada tabla
--     empieza con `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` y solo después da lo que da: así los
--     privilegios finales son EXACTAMENTE los escritos, sea cual sea el estado de «exponer tablas automáticamente» en
--     el proyecto (si estuviera encendido, `service_role` habría nacido con DELETE; la auditoría de 0011 lo mira).
--
-- Una nota de orden: las políticas de `empresas` y `bitacora` llegan en 0002, porque usan
-- `interno.empresas_donde()`, que necesita la tabla `miembros`. Entre 0001 y 0002 esas dos tablas tienen
-- RLS encendida y ninguna política: nadie las lee (denegado por defecto).
-- =====================================================================================================


-- -----------------------------------------------------------------------------------------------------
-- 1. Privilegios por defecto y esquema `interno`
-- -----------------------------------------------------------------------------------------------------

-- En PostgreSQL TODA función nace con EXECUTE para PUBLIC. Con `anon` ejecutándola, una RPC sería una puerta
-- abierta a internet. Se cierra de raíz para lo que cree `postgres` desde aquí (y cada función, además, lleva
-- su REVOKE explícito: si este ALTER no surtiera efecto en algún proyecto, la auditoría de 0011 lo atrapa).
revoke create on schema public from public;
alter default privileges for role postgres                  revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- `interno` guarda los ayudantes y los núcleos de las reglas. NO está en los esquemas que PostgREST expone, así
-- que ninguna de sus funciones es una RPC pública. `authenticated` y `service_role` necesitan USAGE porque las
-- políticas RLS, la vista de fórmulas y los CHECK se evalúan con los privilegios de quien consulta o escribe.
create schema if not exists interno;
revoke all on schema interno from public, anon, authenticated;
grant usage on schema interno to authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 2. Triggers comunes (cada tabla se los pone en su propio archivo)
-- -----------------------------------------------------------------------------------------------------

-- `updated_at` es el CURSOR DE SINCRONIZACIÓN (nunca un sello de «quién gana»). Solo se mueve si la fila CAMBIÓ de
-- verdad: un upsert idempotente del importador con los mismos valores no la «ensucia» ni obliga a los teléfonos
-- a volver a bajarla. `clock_timestamp()` (y no `now()`) para que el orden refleje el momento de la escritura
-- dentro de la transacción.
create or replace function interno.tocar() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new is distinct from old then new.updated_at := clock_timestamp(); end if;
  return new;
end $$;
revoke all on function interno.tocar() from public, anon, authenticated, service_role;

-- Nada de negocio se borra: se da de baja con su estado o con `deleted_at` (lápida). Realtime no aplica RLS a
-- los DELETE, así que un borrado duro filtraría; y una corrección de un libro es otro asiento. Este trigger es
-- la segunda defensa: aunque alguien lograra el privilegio DELETE, la fila no se va.
create or replace function interno.sin_borrar() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Las filas de % no se borran: use su baja logica', tg_table_name using errcode = 'P0001'; end $$;
revoke all on function interno.sin_borrar() from public, anon, authenticated, service_role;

-- Los libros (abonos, almacén, bitácora) son evidencia: no se editan, se corrigen con otro asiento.
create or replace function interno.solo_agregar() returns trigger language plpgsql set search_path = '' as $$
begin raise exception '% es un libro: no se edita, se corrige con otro asiento', tg_table_name using errcode = 'P0001'; end $$;
revoke all on function interno.solo_agregar() from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 3. Utilidades puras
-- -----------------------------------------------------------------------------------------------------
-- Ninguna lee tablas (salvo `siguiente`, más abajo). Las que un CHECK, una política o una vista llaman llevan
-- EXECUTE para quien consulta; todas las demás solo las ejecuta el dueño, desde las RPC.

-- Reloj en milisegundos (epoch): el mismo formato de los sellos por campo que ya manda el teléfono.
create or replace function interno.ahora_ms() returns bigint language sql volatile set search_path = '' as $$
  select floor(extract(epoch from clock_timestamp()) * 1000)::bigint $$;
revoke all on function interno.ahora_ms() from public, anon, authenticated, service_role;

-- V-001 … V-999, V-1000 …: `lpad` TRUNCA si el texto ya es más largo que el ancho (lpad('1000', 3, '0') da '100'),
-- por eso el ancho nunca baja de lo que mide el número.
create or replace function interno.folio_texto(p_prefijo text, p_n bigint) returns text language sql immutable set search_path = '' as $$
  select p_prefijo || '-' || pg_catalog.lpad(p_n::text, greatest(3, pg_catalog.length(p_n::text)), '0') $$;
revoke all on function interno.folio_texto(text, bigint) from public, anon, authenticated, service_role;

-- Orden de las seis etapas de taller; garantía, cancelado y lo desconocido no tienen orden (NULL).
create or replace function interno.orden_etapa(e text) returns int language sql immutable set search_path = '' as $$
  select case e when 'ganado' then 0 when 'en_diseno' then 1 when 'cortado' then 2 when 'armado' then 3
                when 'listo' then 4 when 'instalado' then 5 end $$;
revoke all on function interno.orden_etapa(text) from public, anon, authenticated, service_role;

-- `telefonoLimpio` del Apps Script (probada por pruebas/puente.mjs): lo que no sea dígito, espacio, +, ( ) o -
-- se vuelve espacio; se colapsan los espacios; se exige al menos un dígito (si no, NULL = inválido); '' de
-- entrada es «vacío» (borrar); se recorta a 30.
create or replace function interno.telefono_limpio(t text) returns text language sql immutable set search_path = '' as $$
  select case when t is null then null
              when pg_catalog.btrim(t) = '' then ''
              else (select case when s ~ '[0-9]' then pg_catalog.btrim(pg_catalog.left(s, 30)) end
                      from (select pg_catalog.btrim(pg_catalog.regexp_replace(
                                     pg_catalog.regexp_replace(t, '[^0-9 +()-]', ' ', 'g'), '\s+', ' ', 'g')) as s) x)
         end $$;
revoke all on function interno.telefono_limpio(text) from public, anon, authenticated, service_role;

-- Los sellos de un proyecto: un objeto cuyas claves son los 8 grupos y cuyos valores son enteros >= 0 (epoch-ms).
-- Lo evalúa el CHECK de `proyectos.sellos`: por eso `service_role` (el importador escribe directo) la necesita.
create or replace function interno.sellos_validos(j jsonb) returns boolean language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_typeof(j) = 'object'
     and not exists (
       select 1 from pg_catalog.jsonb_each(j) e
        where e.key <> all (array['etapa','notas','plazo_k','tel','dir_texto','ubicacion','entrega','instalacion'])
           or case when pg_catalog.jsonb_typeof(e.value) = 'number'
                   then (e.value #>> '{}')::numeric < 0 or (e.value #>> '{}')::numeric <> pg_catalog.trunc((e.value #>> '{}')::numeric)
                   else true end) $$;
revoke all on function interno.sellos_validos(jsonb) from public, anon, authenticated, service_role;
grant execute on function interno.sellos_validos(jsonb) to service_role;

-- R1 (Fabricación no ve dinero): ninguna clave de dinero, a ningún nivel (objetos y arreglos anidados), sin
-- importar mayúsculas. Es el doble candado del CHECK de `proyectos.origen_obra`: aunque otra ruta intentara
-- escribir un precio en la parte de obra, la base lo rechaza.
create or replace function interno.contiene_dinero(j jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
begin
  case pg_catalog.jsonb_typeof(j)
    when 'object' then
      for k, v in select * from pg_catalog.jsonb_each(j) loop
        if pg_catalog.lower(k) = any (array['tarifa','pu','_lt','precioauth','neto','sub','anti','antimanual','itemsauth','huellaauth',
                                           'sello','autorizador','fechaauth','nota','total','importe','precio','costo','subtotal',
                                           'anticipo','liquidacion','comision','saldo'])
           or interno.contiene_dinero(v) then return true; end if;
      end loop;
    when 'array' then
      for v in select * from pg_catalog.jsonb_array_elements(j) loop
        if interno.contiene_dinero(v) then return true; end if;
      end loop;
    else null;
  end case;
  return false;
end $$;
revoke all on function interno.contiene_dinero(jsonb) from public, anon, authenticated, service_role;
grant execute on function interno.contiene_dinero(jsonb) to service_role;

-- Sobre de error: el cliente ya entiende {ok, codigo, mensaje, definitivo} (js/datos/puente.js). `definitivo`
-- solo para los errores que no se arreglan reintentando: la bandeja los aparta en vez de insistir. Los de acceso
-- (ACCESO_REVOCADO, SIN_ACCESO…) NO son definitivos: detienen el envío sin descartar nada.
create or replace function interno.err(p_codigo text, p_mensaje text, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('ok', false, 'codigo', p_codigo, 'mensaje', p_mensaje,
           'definitivo', p_codigo in ('ROL_SIN_PERMISO','NO_ENCONTRADO','DATO_INVALIDO','DUPLICADO')) || coalesce(p_extra, '{}'::jsonb)
$$;
revoke all on function interno.err(text, text, jsonb) from public, anon, authenticated, service_role;

-- Un valor de una operación jsonb como NÚMERO, a la manera de `Number(x)` del cliente pero sin sus sorpresas: un número, o un texto que
-- lo sea (con espacios a los lados). Cualquier otra cosa —null, '', un objeto, un booleano, un texto que no es número— es NULL.
-- (En JavaScript `Number('')` es 0 y `Number(true)` es 1: aquí un importe vacío es «falta el dato», no cero.)
create or replace function interno.num(j jsonb) returns numeric language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  if j is null or pg_catalog.jsonb_typeof(j) not in ('number', 'string') then return null; end if;
  if pg_catalog.jsonb_typeof(j) = 'string' and pg_catalog.btrim(j #>> '{}') = '' then return null; end if;
  v := pg_catalog.btrim(j #>> '{}')::numeric;
  if v in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then return null; end if;      -- no es un número finito
  return v;
exception when others then return null;
end $$;
revoke all on function interno.num(jsonb) from public, anon, authenticated, service_role;

-- ---- La compuerta de sellos por campo (R3) -----------------------------------------------------------
-- Hoy la regla «gana el cambio más reciente, dato por dato» vive en tres sitios (el teléfono sella, el servidor
-- decide al subir, el cliente decide al bajar). Con una sola fuente de verdad la base ES el servidor de subir.
-- Las dos funciones son puras e `immutable`: se prueban sin tablas.

-- El sello que llega del teléfono, saneado: `floor(Number(x))`; si no es número finito o es <= 0, vale 0; si no,
-- se acota a `ahora + 10 min` (SELLO_HOLGURA_MS del .gs): un reloj adelantado no puede ganarle a todo lo futuro.
create or replace function interno.sello_valido(p_x jsonb, p_ahora_ms bigint) returns bigint
language plpgsql immutable set search_path = '' as $$
declare n numeric;
begin
  if p_x is null or pg_catalog.jsonb_typeof(p_x) not in ('number','string') then return 0; end if;
  begin n := floor((p_x #>> '{}')::numeric); exception when others then return 0; end;
  if n is null or n in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) or n <= 0 then return 0; end if;
  return least(n, (p_ahora_ms + 600000)::numeric)::bigint;
end $$;
revoke all on function interno.sello_valido(jsonb, bigint) from public, anon, authenticated, service_role;

-- Decide si un cambio entra: devuelve (accion, sello_nuevo, motivo) con accion = escribir | viejo | rechazar.
--   · ya hay un sello MÁS nuevo que el que llega  -> 'viejo' (no es error: otro teléfono lo cambió después y gana).
--   · el empate ESCRIBE (la comparación es estricta, como en el .gs).
--   · vaciar sin sello no borra; etapa y entrega jamás se vacían.
--   · el sello guardado solo sube (greatest): un valor sin sello no crea sello.
create or replace function interno.compuerta(p_tiene bigint, p_sellos_op jsonb, p_grupo text, p_ahora_ms bigint,
                                             p_vacio boolean, p_borrable boolean)
returns table (accion text, sello_nuevo bigint, motivo text)
language plpgsql immutable set search_path = '' as $$
declare v_tiene bigint := coalesce(p_tiene, 0);
        v_llega bigint := interno.sello_valido(p_sellos_op -> p_grupo, p_ahora_ms);
begin
  if v_tiene > 0 and v_llega < v_tiene then
    return query select 'viejo'::text, v_tiene, 'ya tenía un cambio más reciente'::text; return;
  end if;
  if p_vacio and v_llega = 0 then
    return query select 'rechazar'::text, v_tiene, 'vacío sin sello no borra'::text; return;
  end if;
  if p_vacio and not p_borrable then
    return query select 'rechazar'::text, v_tiene, 'este dato no se puede vaciar'::text; return;
  end if;
  return query select 'escribir'::text, greatest(v_tiene, v_llega), null::text;
end $$;
revoke all on function interno.compuerta(bigint, jsonb, text, bigint, boolean, boolean) from public, anon, authenticated, service_role;

-- ---- Una sola aritmética para la vista de fórmulas y las RPC de pagos (R4) -----------------------------
-- H «Precio Neto» = subtotal + IVA 16 %, redondeado al centavo. `numeric` (decimal exacto), nunca `double`.
-- La vista `ventas_calculadas` (0004) las ejecuta con los privilegios de quien consulta: por eso llevan EXECUTE.
create or replace function interno.neto(p_subtotal numeric, p_iva boolean) returns numeric language sql immutable set search_path = '' as $$
  select round(coalesce(p_subtotal, 0) * (1 + case when p_iva then 0.16 else 0 end), 2) $$;
revoke all on function interno.neto(numeric, boolean) from public, anon, authenticated, service_role;
grant execute on function interno.neto(numeric, boolean) to authenticated, service_role;

-- R «Comisiones» = 10 % FIJO del SUBTOTAL (no del neto: el IVA no entra) y no lee `pct_comision`.
create or replace function interno.comision(p_subtotal numeric) returns numeric language sql immutable set search_path = '' as $$
  select round(coalesce(p_subtotal, 0) * 0.10, 2) $$;
revoke all on function interno.comision(numeric) from public, anon, authenticated, service_role;
grant execute on function interno.comision(numeric) to authenticated, service_role;

-- `pesos()` del .gs: para las notas legibles («Reparto P-007 de $1,234.50»).
create or replace function interno.pesos(n numeric) returns text language sql immutable set search_path = '' as $$
  select '$' || pg_catalog.to_char(round(n, 2), 'FM999,999,999,990.00') $$;
revoke all on function interno.pesos(numeric) from public, anon, authenticated, service_role;

-- «Hoy» en México y el día `yyyymmdd` en México (la cuota de IA se cuenta por día de México: en Apps Script era
-- GMT y cambiaba a las 18:00 hora local). La vista de fórmulas usa `hoy_mx()` para la antigüedad del saldo.
create or replace function interno.hoy_mx() returns date language sql stable set search_path = '' as $$
  select (pg_catalog.now() at time zone 'America/Mexico_City')::date $$;
revoke all on function interno.hoy_mx() from public, anon, authenticated, service_role;
grant execute on function interno.hoy_mx() to authenticated, service_role;

create or replace function interno.dia_mx(p_ts timestamptz default now()) returns text language sql stable set search_path = '' as $$
  select pg_catalog.to_char(p_ts at time zone 'America/Mexico_City', 'YYYYMMDD') $$;
revoke all on function interno.dia_mx(timestamptz) from public, anon, authenticated, service_role;

-- ---- Para devolver el sello al cliente en forma de objeto (no se firma nada desde aquí) ----------------
-- `itemsAuthDeCanon` del .gs: 'id:1500.00,id2:300.00' -> {"id":1500.00,"id2":300.00}. La clave es todo lo que
-- precede al ÚLTIMO «:»; un valor que no es número (Number(x) = NaN) sale como null.
create or replace function interno.items_auth_a_json(t text) returns jsonb language plpgsql immutable set search_path = '' as $$
declare r jsonb := '{}'::jsonb; par text; v_pos int; v_txt text; v_num numeric;
begin
  foreach par in array pg_catalog.string_to_array(coalesce(t, ''), ',') loop
    continue when par = '';
    v_pos := pg_catalog.strpos(pg_catalog.reverse(par), ':');              -- 1 = el último carácter es «:»
    if v_pos = 0 then continue; end if;
    v_pos := pg_catalog.length(par) - v_pos + 1;                           -- posición (base 1) del último «:»
    continue when v_pos <= 1;                                              -- sin clave (el .gs exige i > 0 en base 0)
    v_txt := pg_catalog.btrim(pg_catalog.substr(par, v_pos + 1));
    begin v_num := case when v_txt = '' then 0 else v_txt::numeric end; exception when others then v_num := null; end;
    r := r || pg_catalog.jsonb_build_object(pg_catalog.substr(par, 1, v_pos - 1), v_num);
  end loop;
  return r;
end $$;
revoke all on function interno.items_auth_a_json(text) from public, anon, authenticated, service_role;

-- `renglonesDeTexto` del .gs: el texto firmado de los renglones (un arreglo JSON de [descripción, cantidad, importe])
-- a [{descripcion, cantidad, importe}]. NULL = «este sello no guardó renglones» (los de antes de puente-sheets-8)
-- o un texto que no se entiende: ese no llega a verse porque la firma lo cubre.
create or replace function interno.renglones_a_json(t text) returns jsonb language plpgsql immutable set search_path = '' as $$
declare a jsonb; r jsonb; v_out jsonb := '[]'::jsonb; v_desc text; v_cant numeric; v_imp numeric;
begin
  if t is null or t = '' then return null; end if;
  begin a := t::jsonb; exception when others then return null; end;
  if pg_catalog.jsonb_typeof(a) <> 'array' then return null; end if;
  for r in select e.value from pg_catalog.jsonb_array_elements(a) e loop
    v_desc := ''; v_cant := 0; v_imp := 0;
    if pg_catalog.jsonb_typeof(r) = 'array' then
      if pg_catalog.jsonb_typeof(r -> 0) = 'string' then v_desc := r ->> 0;
      elsif pg_catalog.jsonb_typeof(r -> 0) in ('number','boolean') then v_desc := (r -> 0)::text; end if;
      begin v_cant := coalesce(case when pg_catalog.jsonb_typeof(r -> 1) in ('number','string') then (r ->> 1)::numeric end, 0); exception when others then v_cant := 0; end;
      begin v_imp  := coalesce(case when pg_catalog.jsonb_typeof(r -> 2) in ('number','string') then (r ->> 2)::numeric end, 0); exception when others then v_imp := 0; end;
    end if;
    v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('descripcion', v_desc, 'cantidad', v_cant, 'importe', v_imp));
  end loop;
  return v_out;
end $$;
revoke all on function interno.renglones_a_json(text) from public, anon, authenticated, service_role;


-- -----------------------------------------------------------------------------------------------------
-- 4. Tablas de la fundación
-- -----------------------------------------------------------------------------------------------------

-- ---- empresas: el ancla de multiempresa (R9) ------------------------------------------------------------
-- Hoy una sola fila (`al3d`). Toda tabla de negocio lleva `empresa_id` y RLS filtra por la empresa donde la
-- persona es miembro: sumar un negocio es una fila aquí y las invitaciones de `miembros`, sin tocar el esquema.
create table if not exists public.empresas (
  id         text primary key check (id ~ '^[a-z][a-z0-9_]{1,31}$'),
  nombre     text not null check (btrim(nombre) <> ''),
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp()
);

drop trigger if exists empresas_tocar      on public.empresas;
drop trigger if exists empresas_sin_borrar on public.empresas;
create trigger empresas_tocar      before insert or update on public.empresas for each row execute function interno.tocar();
create trigger empresas_sin_borrar before delete          on public.empresas for each row execute function interno.sin_borrar();

alter table public.empresas enable row level security;
revoke all on public.empresas from public, anon, authenticated, service_role;
grant select on public.empresas to authenticated;                    -- la política de lectura llega en 0002
grant select, insert, update on public.empresas to service_role;     -- sin DELETE: ni service_role borra; el alta de una empresa es migración o service_role

insert into public.empresas (id, nombre) values ('al3d', 'AL3D') on conflict (id) do nothing;

-- ---- contadores: todo lo que hoy es ESTADO en el script y una función sin estado no puede guardar (R11) -----
-- FOLIO_MAS_ALTO (V-###), la secuencia del almacén, los ids P-### de los depósitos, la cuota diaria de IA, las
-- ventanas de /verificar, el turno de las llaves de IA, el folio máximo por aparato, el cursor del espejo.
create table if not exists public.contadores (
  empresa_id text   not null,                -- '*' para los contadores globales (cuota IA por usuario, /verificar público); sin FK
  clave      text   not null,                -- 'V' | 'P' | 'alm' | 'ia:<uid>' | 'ia_turno:<prov>' | 'ver:<hash>' | 'ver:total' | 'ver:ip:<hash>' | 'folio_cot:<disp>' | 'espejo:ventas'
  ventana    text   not null default '',     -- '' = permanente; 'yyyymmdd' (día de México) o el número de ventana de 600 s
  n          bigint not null default 0 check (n >= 0),
  texto      text,                           -- p. ej. el cursor del espejo 'iso|id'
  updated_at timestamptz not null default clock_timestamp(),
  primary key (empresa_id, clave, ventana)
);

drop trigger if exists contadores_tocar on public.contadores;
create trigger contadores_tocar before insert or update on public.contadores for each row execute function interno.tocar();
-- (sin `sin_borrar`: las funciones SECURITY DEFINER de cupos limpian sus ventanas vencidas, 0009)

alter table public.contadores enable row level security;             -- RLS encendida y NINGUNA política: denegado por defecto
revoke all on public.contadores from public, anon, authenticated, service_role;    -- ni leer: authenticated no recibe ni siquiera SELECT
grant select, insert, update on public.contadores to service_role;

-- El siguiente número de un contador. `INSERT … ON CONFLICT DO UPDATE` toma el candado de la fila hasta el COMMIT:
-- los números salen en el ORDEN DE CONFIRMACIÓN, y uno que nunca se confirmó (rollback) puede reutilizarse sin que
-- nadie lo haya visto. Un folio confirmado jamás se vuelve a repartir (no hay borrado de ventas).
create or replace function interno.siguiente(p_empresa text, p_clave text, p_ventana text default '', p_n bigint default 1)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if p_n is null or p_n < 1 then raise exception 'p_n debe ser >= 1'; end if;
  insert into public.contadores as c (empresa_id, clave, ventana, n) values (p_empresa, p_clave, p_ventana, p_n)
  on conflict (empresa_id, clave, ventana) do update set n = c.n + p_n, updated_at = clock_timestamp()
  returning c.n into v;
  return v;
end $$;
revoke all on function interno.siguiente(text, text, text, bigint) from public, anon, authenticated, service_role;

-- ---- bitacora: historia con NIVEL DE VISIBILIDAD por fila (R1, R8) y diario de idempotencia --------------------
-- La escribe la base dentro de cada RPC (`interno.anotar`, 0002); el `anotar` local del teléfono deja de ser la
-- fuente. Niveles (los pone la RPC, NUNCA el cliente):
--   general   = hechos de obra sin importes (etapa, agenda, almacén sin costos, material): los tres roles.
--   dinero    = todo lo que lleve un importe, una cuenta o un estatus de cobro: Dirección y Pagos.
--   direccion = altas, bajas y cambios de área, y eventos del sistema (espejo, importación): solo Dirección.
create table if not exists public.bitacora (
  id            bigint generated always as identity primary key,
  empresa_id    text not null references public.empresas (id),
  ts            timestamptz not null default now(),
  nivel         text not null default 'general' check (nivel in ('general','dinero','direccion')),
  accion        text not null check (btrim(accion) <> ''),
  entidad       text not null check (entidad in ('proyecto','instalacion','material','constante','almacen',
                                                 'cotizacion','autorizacion','abono','venta','miembro','plataforma','sistema')),
  entidad_id    text not null default '',
  titulo        text not null check (btrim(titulo) <> '' and length(titulo) <= 200),
  detalle       text not null default '' check (length(detalle) <= 600),
  antes         jsonb,
  despues       jsonb,
  usuario_id    uuid,
  usuario_texto text not null default '',     -- correo (escrita por RPC) o nombre libre (subida desde un teléfono)
  rol           text not null default '',
  dispositivo   text not null default '',
  op_id         text,                          -- clave de idempotencia de las operaciones acumulativas y de la subida única
  resultado     jsonb,                         -- lo que se contestó, para devolver lo mismo en un reintento
  procedencia   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default clock_timestamp()
);
create unique index if not exists bitacora_op      on public.bitacora (empresa_id, op_id) where op_id is not null;
create index        if not exists bitacora_entidad on public.bitacora (empresa_id, entidad, entidad_id, ts desc);
create index        if not exists bitacora_sync    on public.bitacora (empresa_id, updated_at, id);

drop trigger if exists bitacora_tocar         on public.bitacora;
drop trigger if exists bitacora_sin_borrar    on public.bitacora;
drop trigger if exists bitacora_solo_agregar  on public.bitacora;
create trigger bitacora_tocar        before insert or update on public.bitacora for each row execute function interno.tocar();
create trigger bitacora_sin_borrar   before delete          on public.bitacora for each row execute function interno.sin_borrar();
create trigger bitacora_solo_agregar before update          on public.bitacora for each row execute function interno.solo_agregar();

alter table public.bitacora enable row level security;
revoke all on public.bitacora from public, anon, authenticated, service_role;
grant select on public.bitacora to authenticated;                    -- las políticas por nivel llegan en 0002
grant select, insert, update on public.bitacora to service_role;     -- (el UPDATE lo frena `solo_agregar`; el privilegio se da igual por uniformidad)

-- Realtime: la tabla entra a la publicación (lista cerrada) con su identidad de réplica por DEFAULT: en un DELETE viajaría solo la llave
-- primaria, nunca la fila vieja (con FULL sí). El evento es solo un AVISO: el cliente responde con una lectura incremental por cursor.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  alter table public.bitacora replica identity default;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bitacora') then
    alter publication supabase_realtime add table public.bitacora;
  end if;
end $$;
