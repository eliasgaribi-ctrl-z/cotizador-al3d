/* ============================================================================
   EL SHIM DE SUPABASE para PGlite.

   Lo carga arnes.mjs UNA vez, como superusuario, sobre una base recién creada y ANTES de
   las migraciones del proyecto. Pone lo justo de Supabase para que las migraciones, las
   políticas RLS y las funciones RPC se puedan probar sin Docker: los roles, los esquemas
   `auth` y `extensions`, las funciones `auth.uid()`/`auth.jwt()`…, la publicación de
   Realtime y un esquema `public` con los permisos de un proyecto de verdad.

   NO es Supabase. No hay GoTrue, ni PostgREST, ni Realtime, ni pg_cron, ni pg_net, ni
   Vault, ni Storage. Lo que falta está en el README, en «Límites».

   LO ESTRICTO, y por qué: el proyecto real tiene «exponer tablas automáticamente» APAGADO.
   Con eso encendido, Supabase deja `ALTER DEFAULT PRIVILEGES … GRANT ALL … TO anon,
   authenticated, service_role` y toda tabla nueva nace abierta a la API; apagado, nace
   cerrada, y cada migración tiene que pedir sus propios GRANT. Aquí NO hay ningún
   privilegio por defecto (la autoprueba lo comprueba contra pg_default_acl): si una
   migración olvida un GRANT, la prueba debe fallar con «permission denied», no pasar
   porque el shim fue generoso.

   Con las FUNCIONES pasa lo contrario, a propósito: no se toca el comportamiento de
   Postgres, que da EXECUTE a PUBLIC a toda función nueva. Es lo que hace el proyecto real, y
   es un peligro conocido (anon puede llamar por la API cualquier función de `public` que no
   se haya revocado). Si el shim lo cerrara por defecto, las migraciones pasarían las
   pruebas con el defecto escondido; dejándolo como está, `auditarRLS()` lo encuentra.

   Una cosa NO está aquí, aunque parezca que debería: el `search_path` de la base
   («$user», public, extensions, como el de Supabase). Un ALTER DATABASE no afecta a la
   conexión que ya está abierta, y PGlite solo tiene una; se fija al arrancar, en
   arnes.mjs (`paramsDeArranque`).
   ============================================================================ */

/* ── Roles ─────────────────────────────────────────────────────────────────────
   Los cuatro de siempre. anon y authenticated son lo que PostgREST asume según el JWT;
   service_role es la llave secreta, y salta RLS (BYPASSRLS) pero NO los GRANT: sin permiso
   de tabla, service_role también recibe «permission denied». authenticator es el que abre
   la conexión en producción y cambia a uno de los otros tres con SET ROLE. Aquí tampoco
   se conecta nadie con él (PGlite tiene una sola conexión, de superusuario), pero arnes.mjs
   lo usa igual que PostgREST: cada petición pone la sesión como authenticator y de ahí hace
   el SET LOCAL ROLE, así que sus membresías (abajo) son las que permiten el cambio. */
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;
create role authenticator login   noinherit;
grant anon, authenticated, service_role to authenticator;

/* ── extensions + pgcrypto ─────────────────────────────────────────────────────
   Supabase instala sus extensiones en un esquema aparte, y los tres roles pueden usarlo.
   Por eso se escribe `extensions.hmac(...)`: dentro de una función con `search_path = ''`
   (lo correcto en una SECURITY DEFINER) `hmac` a secas NO se encuentra. El bundle de
   pgcrypto lo carga arnes.mjs al crear PGlite; aquí solo se instala en su esquema. */
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension pgcrypto with schema extensions;

/* ── auth ──────────────────────────────────────────────────────────────────────
   Los tres roles ven el esquema (hace falta: `auth.uid()` se evalúa DENTRO de las
   políticas, con los permisos de quien consulta), pero ninguno ve las tablas: en Supabase
   anon y authenticated no leen auth.users, y una política que lo intentara fallaría en
   producción y tiene que fallar aquí. Las claves foráneas hacia auth.users sí funcionan
   para ellos: Postgres comprueba la clave con los permisos del dueño de la tabla.

   auth.users trae lo mínimo que usan las migraciones corrientes (claves foráneas,
   disparadores de alta de perfil, consultas por correo). Las columnas de GoTrue que no
   están (teléfono, tokens, contraseña…) se agregan en la migración que las necesite. */
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key,
  aud                text,
  role               text,
  email              text,
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  last_sign_in_at    timestamptz
);
create unique index users_email_partial_key on auth.users (email);

/* Las funciones de Supabase, tal cual: leen lo que PostgREST deja en la transacción. El
   `nullif(…, '')` no es adorno: una variable de sesión que alguna vez se fijó con
   set_config(…, true) NO vuelve a «no existe» al terminar la transacción, sino a texto
   vacío, y `''::uuid` truena. La clave suelta (`request.jwt.claim.sub`) es la forma
   antigua; PostgREST actual pone el JSON completo en `request.jwt.claims`. Se leen las dos,
   en ese orden, como las de verdad. */
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create function auth.email() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

/* ── Realtime ──────────────────────────────────────────────────────────────────
   Una publicación vacía, como la deja Supabase. Las migraciones agregan sus tablas con
   `alter publication supabase_realtime add table …`; aquí solo se puede comprobar que
   lo hacen, no que Realtime entregue algo. */
create publication supabase_realtime;

/* ── public ────────────────────────────────────────────────────────────────────
   USAGE para los tres y nada más. En PostgreSQL 15 en adelante `public` ya no deja crear
   objetos a PUBLIC, pero se revoca explícito para no depender de la versión: el proyecto
   real corre otra que PGlite, y un `create table` hecho por authenticated tiene que
   fallar en las dos. */
revoke create on schema public from public;
grant usage on schema public to anon, authenticated, service_role;
