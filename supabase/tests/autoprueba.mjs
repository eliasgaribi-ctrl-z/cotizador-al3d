/* ============================================================================
   LA AUTOPRUEBA DEL ARNÉS.

   Prueba el PROPIO arnés (arnes/arnes.mjs, arnes/shim.sql, arnes/marco.mjs), no las
   migraciones del proyecto. Un arnés que miente es peor que no tener arnés: si el shim
   dejara pasar un GRANT olvidado, o si `como()` filtrara el rol de una petición a la
   siguiente, todas las pruebas de RLS que se escriban encima pasarían por una razón falsa.
   Así que aquí se comprueban, una por una, las promesas del arnés:

     · el shim: roles, esquemas, auth.*, pgcrypto en `extensions`, Realtime, `public`
       cerrado y SIN privilegios por defecto;
     · lo que Postgres hace con RLS, GRANT, SECURITY DEFINER y vistas, que es justo lo que
       las migraciones van a necesitar que se reproduzca igual;
     · las garantías de `como()`: el rol y los claims desaparecen, no se filtra nada entre
       sesiones ni aunque la prueba lo intente, los errores se informan con su sqlstate;
     · la carga de migraciones: orden, errores con archivo y línea, `antes`/`extra`;
     · `auditarRLS()` contra defectos sembrados a propósito;
     · el divisor de SQL, el marco y el código de salida, con procesos hijos de verdad.

   El orden importa (las pruebas corren una tras otra, en el orden en que se declaran) y se
   aprovecha: UNA base compartida, primero solo con el shim y después con un «laboratorio»
   de tablas de ejemplo. Cada instancia de PGlite pesa unos 250 MB, así que las bases
   transitorias se cierran en el acto.

   Se corre con `node autoprueba.mjs` o, junto con las demás, con `sh correr.sh`.
   También EXPORTA `auditarRLS` (y `describirAuditoria`, `exigirAuditoriaLimpia`, `partirSql`):
   las suites de las migraciones pueden importarla de aquí o, igual de bien, de
   arnes/arnes.mjs, donde vive. Importarla NO ejecuta las pruebas.
   ============================================================================ */

import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  crearBase, clonarBase, como, sql, crearUsuarioAuth, auditarRLS, describirAuditoria,
  exigirAuditoriaLimpia, partirSql, ErrorDeBase, ErrorDeMigracion,
} from './arnes/arnes.mjs';
import { describir, prueba, dato, igual, cierto, esperarError, resumen, esPrincipal, ErrorDeAfirmacion } from './arnes/marco.mjs';

export { auditarRLS, describirAuditoria, exigirAuditoriaLimpia, partirSql } from './arnes/arnes.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_MARCO = pathToFileURL(join(AQUI, 'arnes', 'marco.mjs')).href;
const URL_ARNES = pathToFileURL(join(AQUI, 'arnes', 'arnes.mjs')).href;
const URL_AUTOPRUEBA = import.meta.url;

/* Los usuarios de ejemplo. Los uuid son de mentira y obvios. */
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const CORREO_A = 'a@pruebas.invalid';
const CORREO_B = 'b@pruebas.invalid';
const comoA = db => como(db, { rol: 'authenticated', sub: A, correo: CORREO_A });
const comoB = db => como(db, { rol: 'authenticated', sub: B, correo: CORREO_B });
const comoAnon = db => como(db, { rol: 'anon' });
const comoServicio = db => como(db, { rol: 'service_role' });
const ids = filas => filas.map(f => f.id);

/* Una transacción de la base entera, que SIEMPRE se deshace: para sembrar defectos, auditar y
   dejar la base como estaba. Dentro no se pueden abrir sesiones con como() (el arnés se
   niega a abrir una petición sobre una transacción abierta, porque se estorbarían). */
async function aislado(db, fn) {
  await sql(db, 'begin');
  try { return await fn(); } finally { await sql(db, 'rollback'); }
}

/* Una carpeta temporal con archivos, que se borra al terminar. */
async function conTemporal(archivos, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'al3d-arnes-'));
  try {
    for (const [nombre, texto] of Object.entries(archivos)) {
      mkdirSync(dirname(join(dir, nombre)), { recursive: true });
      writeFileSync(join(dir, nombre), texto);
    }
    return await fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* Una base transitoria: se crea, se usa y se cierra pase lo que pase. */
async function conBase(opciones, fn) {
  const db = await crearBase(opciones);
  try { return await fn(db); } finally { await db.close(); }
}

/* El laboratorio: tablas, vistas y funciones de ejemplo con las políticas típicas y, a
   propósito, CINCO defectos conocidos (abierta, v_normal, mv_notas, definer_sin_ruta,
   publica_sin_revoke) para comprobar que la auditoría encuentra exactamente esos. */
const LABORATORIO = `
  -- Con RLS y una política por dueño: lo normal.
  create table public.notas (
    id int primary key,
    dueno uuid not null references auth.users (id),
    texto text not null
  );
  alter table public.notas enable row level security;
  grant select, insert, update, delete on public.notas to authenticated;
  grant select on public.notas to service_role;
  create policy notas_del_dueno on public.notas for all to authenticated
    using (dueno = auth.uid()) with check (dueno = auth.uid());
  insert into public.notas values (1, '${A}', 'de A'), (2, '${B}', 'de B');

  -- RLS encendida, con GRANT y SIN ninguna política: nadie ve ni escribe nada.
  create table public.cerrada (id int primary key, dato text);
  alter table public.cerrada enable row level security;
  grant select, insert on public.cerrada to authenticated;
  insert into public.cerrada values (1, 'secreto');

  -- GRANT sin RLS: toda la tabla, para todo authenticated. (DEFECTO a propósito.)
  create table public.abierta (id int primary key, dato text);
  grant select on public.abierta to authenticated;
  insert into public.abierta values (1, 'x'), (2, 'y');

  -- RLS y política, pero ningún GRANT: permission denied, con o sin política.
  create table public.sin_grant (id int primary key);
  alter table public.sin_grant enable row level security;
  insert into public.sin_grant values (1);

  -- Una restricción DEFERRABLE INITIALLY DEFERRED: solo se revisa al hacer COMMIT.
  create table public.diferida (id int, constraint diferida_id_uk unique (id) deferrable initially deferred);
  alter table public.diferida enable row level security;
  grant select, insert on public.diferida to authenticated;
  create policy diferida_libre on public.diferida for all to authenticated using (true) with check (true);

  -- Una vista normal salta RLS (corre como su dueño); con security_invoker, no. (La normal es DEFECTO.)
  create view public.v_normal as select * from public.notas;
  create view public.v_invoker with (security_invoker = true) as select * from public.notas;
  grant select on public.v_normal, public.v_invoker to authenticated;
  -- Una vista materializada no admite RLS ni security_invoker. (DEFECTO a propósito.)
  create materialized view public.mv_notas as select id from public.notas;
  grant select on public.mv_notas to authenticated;

  -- SECURITY DEFINER con search_path vacío. Esta NO comprueba nada: salta RLS y cuenta todo.
  create function public.contar_todas() returns int language plpgsql security definer set search_path = '' as $$
  begin return (select count(*)::int from public.notas); end $$;
  -- Esta sí comprueba quién llama.
  create function public.mis_notas() returns int language plpgsql security definer set search_path = '' as $$
  begin
    if auth.uid() is null then raise exception 'se necesita una sesion' using errcode = '28000'; end if;
    return (select count(*)::int from public.notas where dueno = auth.uid());
  end $$;
  -- Con search_path vacío hay que calificar las extensiones: extensions.hmac, no hmac.
  -- ('clave' es una clave FALSA, solo para estas pruebas.)
  create function public.hash_ok(texto text) returns text language plpgsql security definer set search_path = '' as $$
  begin return encode(extensions.hmac(texto, 'clave', 'sha256'), 'hex'); end $$;
  create function public.hash_mal(texto text) returns text language plpgsql security definer set search_path = '' as $$
  begin return encode(hmac(texto, 'clave', 'sha256'), 'hex'); end $$;
  -- Para las pruebas de rpc().
  create function public.suma(a int, b int default 10) returns int language sql immutable as $$ select a + b $$;
  create function public.eco(datos jsonb) returns jsonb language sql immutable as $$ select datos $$;
  create function public.eco_texto(t text) returns text language sql immutable as $$ select t $$;
  revoke all on function public.contar_todas(), public.mis_notas(), public.hash_ok(text), public.hash_mal(text),
                         public.suma(int, int), public.eco(jsonb), public.eco_texto(text) from public;
  grant execute on function public.contar_todas(), public.mis_notas(), public.hash_ok(text), public.hash_mal(text),
                            public.suma(int, int), public.eco(jsonb), public.eco_texto(text) to authenticated;

  -- Los dos defectos de función. Sin REVOKE, Postgres deja EXECUTE a PUBLIC: anon la puede llamar.
  create function public.publica_sin_revoke() returns int language sql as $$ select 1 $$;
  -- SECURITY DEFINER sin search_path fijo (cerrada a PUBLIC para que cuente UNA vez).
  create function public.definer_sin_ruta() returns int language sql security definer as $$ select 1 $$;
  revoke all on function public.definer_sin_ruta() from public;
`;

function declarar() {
  /* La base compartida. Perezosa: nace en la primera prueba que la pide. */
  const base = dato(() => crearBase(), { limpiar: d => d.close() });

  /* ====================================================================== */
  describir('El shim: lo que simula de Supabase', () => {
    prueba('los cuatro roles existen con los atributos de Supabase, y authenticator llega a los otros tres', async () => {
      const db = await base();
      igual(await sql(db, `select rolname, rolcanlogin, rolinherit, rolbypassrls from pg_roles
                            where rolname in ('anon', 'authenticated', 'service_role', 'authenticator') order by 1`), [
        { rolname: 'anon', rolcanlogin: false, rolinherit: false, rolbypassrls: false },
        { rolname: 'authenticated', rolcanlogin: false, rolinherit: false, rolbypassrls: false },
        { rolname: 'authenticator', rolcanlogin: true, rolinherit: false, rolbypassrls: false },
        { rolname: 'service_role', rolcanlogin: false, rolinherit: false, rolbypassrls: true },
      ]);
      const miembros = await sql(db, `select r.rolname from pg_auth_members x
                                        join pg_roles r on r.oid = x.roleid join pg_roles u on u.oid = x.member
                                       where u.rolname = 'authenticator' order by 1`);
      igual(miembros.map(f => f.rolname), ['anon', 'authenticated', 'service_role']);
    });

    prueba('ESTRICTO: sin privilegios por defecto, una tabla nueva nace cerrada para los tres roles', async () => {
      const db = await base();
      igual(await sql(db, 'select count(*)::int n from pg_default_acl'), [{ n: 0 }], 'pg_default_acl debe estar vacío');
      await aislado(db, async () => {
        await sql(db, 'create table public.recien_nacida (id int)');
        igual(await sql(db, `select has_table_privilege('anon', 'public.recien_nacida', 'select') a,
                                    has_table_privilege('authenticated', 'public.recien_nacida', 'select') b,
                                    has_table_privilege('service_role', 'public.recien_nacida', 'select') c`),
          [{ a: false, b: false, c: false }]);
      });
    });

    prueba('public: los tres roles lo ven (usage) pero nadie puede crear objetos (permission denied)', async () => {
      const db = await base();
      const crear = 'create table public.no_deberia (id int)';
      for (const [nombre, sesion] of [['anon', comoAnon(db)], ['authenticated', comoA(db)], ['service_role', comoServicio(db)]]) {
        const r = await sesion.intentar(crear);
        igual([r.ok, r.error?.codigo], [false, '42501'], nombre + ' no debe poder crear tablas en public');
      }
      igual(await sql(db, `select has_schema_privilege('anon', 'public', 'usage') a, has_schema_privilege('authenticated', 'public', 'usage') b,
                                  has_schema_privilege('service_role', 'public', 'usage') c`), [{ a: true, b: true, c: true }]);
    });

    prueba('extensions.hmac produce el vector conocido HMAC-SHA256(clave, «abc»), y coincide con node:crypto', async () => {
      const db = await base();
      // 'clave' es una clave FALSA, solo para esta prueba (no es el sello de nada). El vector lo da node:crypto,
      // que es el segundo testigo: si los dos coinciden, extensions.hmac hace HMAC-SHA256 de verdad.
      const VECTOR = '4c2c26bd5557f7df65c9fdacb0697d0812c4a6b2e2069d5a3c2d678765215471';
      igual(createHmac('sha256', 'clave').update('abc').digest('hex'), VECTOR, 'el vector fijo no coincide con node:crypto: el vector está mal');
      igual(await sql(db, `select encode(extensions.hmac('abc', 'clave', 'sha256'), 'hex') h`), [{ h: VECTOR }]);
      igual(await sql(db, `select encode(extensions.digest('abc', 'sha256'), 'hex') h`),
        [{ h: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }], 'SHA-256 de «abc» (vector del NIST)');
      igual(await sql(db, 'select length(extensions.gen_random_bytes(16)) n'), [{ n: 16 }]);
    });

    prueba('el search_path es el de Supabase: «$user», public, extensions en la base y public, extensions en cada petición', async () => {
      const db = await base();
      igual(await sql(db, 'show search_path'), [{ search_path: '"$user",public,extensions' }]);
      igual(await comoA(db).query('show search_path'), [{ search_path: 'public, extensions' }]);
      igual(await comoA(db).query(`select encode(hmac('abc', 'clave', 'sha256'), 'hex') h`),
        [{ h: '4c2c26bd5557f7df65c9fdacb0697d0812c4a6b2e2069d5a3c2d678765215471' }], 'hmac a secas debe resolverse dentro de una petición');
      igual(await sql(db, 'show search_path'), [{ search_path: '"$user",public,extensions' }], 'tras la petición vuelve al de la base');
    });

    prueba('la publicación supabase_realtime existe, vacía, y admite tablas', async () => {
      const db = await base();
      igual(await sql(db, `select pubname from pg_publication where pubname = 'supabase_realtime'`), [{ pubname: 'supabase_realtime' }]);
      igual(await sql(db, `select count(*)::int n from pg_publication_tables where pubname = 'supabase_realtime'`), [{ n: 0 }]);
      await aislado(db, async () => {
        await sql(db, 'create table public.en_realtime (id int); alter publication supabase_realtime add table public.en_realtime');
        igual(await sql(db, `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`), [{ tablename: 'en_realtime' }]);
      });
    });

    prueba('auth.uid / role / email / jwt leen los claims, con la forma de un JWT de Supabase', async () => {
      const db = await base();
      const consulta = 'select auth.uid()::text uid, auth.role() rol, auth.email() correo, auth.jwt() jwt';
      const [u] = await comoA(db).query(consulta);
      igual([u.uid, u.rol, u.correo], [A, 'authenticated', CORREO_A]);
      igual([u.jwt.sub, u.jwt.aud, u.jwt.role, u.jwt.email], [A, 'authenticated', 'authenticated', CORREO_A]);
      igual(u.jwt.user_metadata, { email: CORREO_A, email_verified: true }, 'email_verified vive en user_metadata');
      cierto(!('email_verified' in u.jwt), 'en la raíz del JWT no hay email_verified: en Supabase tampoco, y una política que lo leyera de ahí pasaría aquí y fallaría allá');
      cierto(u.jwt.exp > u.jwt.iat && typeof u.jwt.session_id === 'string', 'iat/exp/session_id presentes');

      const [n] = await comoAnon(db).query(consulta);
      igual([n.uid, n.rol, n.correo, n.jwt.role], [null, 'anon', null, 'anon'], 'anon: sin usuario');
      const [s] = await comoServicio(db).query(consulta);
      igual([s.uid, s.rol, s.correo, s.jwt.role], [null, 'service_role', null, 'service_role'], 'service_role: sin usuario');
    });

    prueba('verificado:false y la ausencia de correo se reflejan en los claims', async () => {
      const db = await base();
      const [a] = await como(db, { rol: 'authenticated', sub: A, correo: CORREO_A, verificado: false })
        .query(`select auth.jwt() -> 'user_metadata' ->> 'email_verified' v`);
      igual(a.v, 'false');
      const [b] = await como(db, { rol: 'authenticated', sub: A }).query(`select auth.email() e, auth.jwt() ? 'email' tiene`);
      igual([b.e, b.tiene], [null, false], 'sin correo no hay claim email');
    });
  });

  /* ====================================================================== */
  describir('auditarRLS: defectos sembrados a propósito', () => {
    prueba('una base con solo el shim no tiene hallazgos, y exigirAuditoriaLimpia no lanza', async () => {
      const db = await base();
      const r = await auditarRLS(db);
      igual(r, { ok: true, total: 0, tablasSinRLS: [], vistasSinSecurityInvoker: [], vistasMaterializadasExpuestas: [],
                 funcionesDefinerSinSearchPath: [], funcionesEjecutablesPorAnon: [] });
      igual(describirAuditoria(r), '');
      await exigirAuditoriaLimpia(db);
    });

    prueba('tablas sin RLS en public e interno (también particiones), sin marcar las que sí la tienen', async () => {
      const db = await base();
      await aislado(db, async () => {
        await sql(db, `
          create schema interno;
          create table public.sin_rls (id int);
          create table public.con_rls (id int); alter table public.con_rls enable row level security;
          create table interno.sin_rls_interna (id int);
          create table interno.con_rls_interna (id int); alter table interno.con_rls_interna enable row level security;
          create table public.particionada (id int) partition by range (id);
          create table public.particion_1 partition of public.particionada for values from (0) to (10);`);
        const r = await auditarRLS(db);
        igual(r.tablasSinRLS, ['interno.sin_rls_interna', 'public.particion_1', 'public.particionada', 'public.sin_rls']);
        igual(await auditarRLS(db, { esquemas: ['public'] }).then(x => x.tablasSinRLS),
          ['public.particion_1', 'public.particionada', 'public.sin_rls'], 'el parámetro esquemas acota la revisión');
      });
    });

    prueba('vistas sin security_invoker, y vistas materializadas que anon/authenticated pueden leer', async () => {
      const db = await base();
      await aislado(db, async () => {
        await sql(db, `
          create schema interno;
          create view public.v_mala as select 1 as x;
          create view public.v_buena with (security_invoker = true) as select 1 as x;
          create view public.v_buena_on with (security_invoker = on) as select 1 as x;
          create view interno.v_interna_mala as select 1 as x;
          create materialized view public.mv_oculta as select 1 as x;
          create materialized view public.mv_expuesta as select 1 as x;
          grant select on public.mv_expuesta to authenticated;`);
        const r = await auditarRLS(db);
        igual(r.vistasSinSecurityInvoker, ['interno.v_interna_mala', 'public.v_mala']);
        igual(r.vistasMaterializadasExpuestas, ['public.mv_expuesta'], 'una matview sin grants a la API no es hallazgo');
      });
    });

    prueba('SECURITY DEFINER sin search_path fijado (y acepta «\'\'» y «public, pg_temp»)', async () => {
      const db = await base();
      await aislado(db, async () => {
        await sql(db, `
          create schema interno;
          create function public.d_mala() returns int language sql security definer as $$ select 1 $$;
          create function public.d_buena() returns int language sql security definer set search_path = '' as $$ select 1 $$;
          create function public.d_buena_2() returns int language plpgsql security definer set search_path = public, pg_temp as $$ begin return 1; end $$;
          create function public.i_normal() returns int language sql as $$ select 1 $$;
          create function interno.d_mala_interna(a int, b text) returns int language sql security definer as $$ select 1 $$;`);
        const r = await auditarRLS(db);
        igual(r.funcionesDefinerSinSearchPath, ['interno.d_mala_interna(a integer, b text)', 'public.d_mala()']);
      });
    });

    prueba('funciones de public ejecutables por anon: por PUBLIC y por GRANT directo; no las revocadas ni las de interno', async () => {
      const db = await base();
      await aislado(db, async () => {
        await sql(db, `
          create schema interno;
          create function public.f_abierta() returns int language sql as $$ select 1 $$;
          create function public.f_cerrada() returns int language sql as $$ select 1 $$;
          revoke all on function public.f_cerrada() from public;
          grant execute on function public.f_cerrada() to authenticated;
          create function public.f_directa() returns int language sql as $$ select 1 $$;
          revoke all on function public.f_directa() from public;
          grant execute on function public.f_directa() to anon;
          create function interno.f_interna() returns int language sql as $$ select 1 $$;`);
        const r = await auditarRLS(db);
        igual(r.funcionesEjecutablesPorAnon, [
          { funcion: 'public.f_abierta()', via: ['PUBLIC'] },
          { funcion: 'public.f_directa()', via: ['anon'] },
        ]);
      });
    });

    prueba('la lista de excepciones deja pasar lo que se declara a propósito (por nombre o con argumentos)', async () => {
      const db = await base();
      await aislado(db, async () => {
        await sql(db, `
          create table public.sin_rls (id int);
          create function public.verificar_pdf(codigo text) returns int language sql as $$ select 1 $$;
          create function public.verificar_pdf(codigo text, extra int) returns int language sql as $$ select 1 $$;`);
        const sin = await auditarRLS(db);
        igual(sin.total, 3, 'sin excepciones: la tabla y las dos sobrecargas');
        const todas = await auditarRLS(db, { permitir: { funciones: ['public.verificar_pdf'], tablas: ['public.sin_rls'] } });
        igual(todas.ok, true, 'por nombre cubre todas las sobrecargas');
        const una = await auditarRLS(db, { permitir: { funciones: ['public.verificar_pdf(codigo text)'], tablas: ['public.sin_rls'] } });
        igual(una.funcionesEjecutablesPorAnon.map(f => f.funcion), ['public.verificar_pdf(codigo text, extra integer)']);
      });
    });

    prueba('exigirAuditoriaLimpia lanza con un mensaje que dice qué y cómo arreglarlo; describirAuditoria igual', async () => {
      const db = await base();
      await aislado(db, async () => {
        await sql(db, 'create table public.sin_rls (id int); create function public.f_abierta() returns int language sql as $$ select 1 $$');
        const e = await esperarError(exigirAuditoriaLimpia(db), /public\.sin_rls/);
        cierto(/enable row level security/.test(e.message) && /public\.f_abierta\(\) \[PUBLIC\]/.test(e.message) && /revoke all on function/.test(e.message), e.message);
        igual(e.reporte.total, 2);
        igual(describirAuditoria(e.reporte), e.message);
      });
    });
  });

  /* ====================================================================== */
  describir('Sesiones: lo que garantiza como()', () => {
    prueba('cada petición corre con su rol y la sesión de PostgREST (authenticator), y después la conexión vuelve a postgres', async () => {
      const db = await base();
      for (const [rol, sesion] of [['anon', comoAnon(db)], ['authenticated', comoA(db)], ['service_role', comoServicio(db)]]) {
        igual(await sesion.query('select current_user cu, session_user su, current_setting($$role$$) r'),
          [{ cu: rol, su: 'authenticator', r: rol }], 'dentro de la petición: ' + rol);
        igual(await sql(db, 'select current_user cu, session_user su, current_setting($$role$$) r'),
          [{ cu: 'postgres', su: 'postgres', r: 'none' }], 'después de la petición de ' + rol);
      }
    });

    prueba('como en Supabase, dentro de una petición ni reset role ni set role postgres llevan a superusuario', async () => {
      const db = await base();
      const s = comoA(db);
      const [antes, despues] = await s.transaccion(async t => {
        const a = (await t.query('select current_user cu'))[0].cu;
        await t.query('reset role');
        return [a, (await t.query('select current_user cu, session_user su, current_setting($$is_superuser$$) su_root'))[0]];
      });
      igual([antes, despues], ['authenticated', { cu: 'authenticator', su: 'authenticator', su_root: 'off' }], 'reset role deja en authenticator, que no puede nada');
      const e = await esperarError(s.query('set role postgres'), '42501');
      cierto(/permission denied to set role/.test(e.message), e.message);
      await esperarError(s.query('create role intruso'), '42501');
    });

    prueba('LÍMITE CONOCIDO: dentro de una petición, set session authorization postgres SÍ escala (en Supabase no); al terminar se deshace', async () => {
      const db = await base();
      const r = await comoA(db).transaccion(async t => {
        await t.query('set session authorization postgres');
        return (await t.query('select current_user cu, current_setting($$is_superuser$$) su_root'))[0];
      });
      igual(r, { cu: 'postgres', su_root: 'on' }, 'si esto llegara a cambiar (PGlite lo impidiera), son buenas noticias: actualiza el README y el encabezado de arnes.mjs');
      igual(await sql(db, 'select current_user cu, session_user su'), [{ cu: 'postgres', su: 'postgres' }]);
    });

    prueba('una prueba que cambia la autorización de sesión por su cuenta (y confirma) no contamina a la siguiente', async () => {
      const db = await base();
      await comoA(db).query('set session authorization authenticator', [], { confirmar: true });
      igual(await sql(db, 'select current_user cu, session_user su'), [{ cu: 'postgres', su: 'postgres' }], 'la conexión vuelve al superusuario');
      // La trampa de PGlite: sin valor explícito, el SET LOCAL de la siguiente petición no se revertiría.
      igual((await comoB(db).query('select session_user su'))[0].su, 'authenticator');
      igual(await sql(db, 'select current_user cu, session_user su'), [{ cu: 'postgres', su: 'postgres' }], 'y la siguiente petición también se revierte');
      igual(await sql(db, 'create role se_pudo_crear_un_rol nologin; drop role se_pudo_crear_un_rol; select 1 as ok'), [{ ok: 1 }], 'con privilegios de superusuario');
    });

    prueba('la zona horaria es UTC, como en Supabase (la de PGlite sale del equipo y variaría según la máquina)', async () => {
      const db = await base();
      igual((await sql(db, 'show timezone'))[0].TimeZone, 'UTC');
      igual((await comoA(db).query('show timezone'))[0].TimeZone, 'UTC');
      await comoA(db).query(`set timezone = 'America/Mexico_City'`, [], { confirmar: true });
      igual((await sql(db, 'show timezone'))[0].TimeZone, 'UTC', 'un set timezone de una prueba no se queda');
      // A las 03:30 UTC, en UTC−6 todavía es el día anterior: con la zona del equipo esto daría otro día.
      igual(await sql(db, `select ('2026-03-02 03:30:00+00'::timestamptz)::text t, ('2026-03-02 03:30:00+00'::timestamptz)::date::text d`),
        [{ t: '2026-03-02 03:30:00+00', d: '2026-03-02' }], 'un timestamptz se muestra y se trunca en UTC');
    });

    prueba('…y lo es aunque el equipo tenga otra (proceso hijo con TZ=Pacific/Kiritimati, UTC+14)', async () => {
      // Lo de arriba solo prueba algo en un equipo que NO esté en UTC; en un CI en UTC pasaría aunque
      // faltara el arreglo. Aquí se fuerza una zona rara al proceso que arranca la base.
      const r = await conTemporal({ 'hijo.mjs': `import { crearBase, sql } from '${URL_ARNES}';
        const db = await crearBase();
        console.log('ZONA=' + (await sql(db, 'show timezone'))[0].TimeZone + ' DIA=' + (await sql(db, "select ('2026-03-02 03:30:00+00'::timestamptz)::date::text d"))[0].d);
        await db.close();
        process.exit(0);\n` }, dir =>
        spawnSync(process.execPath, [join(dir, 'hijo.mjs')], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, TZ: 'Pacific/Kiritimati' } }));
      igual(r.status, 0, r.stderr);
      igual(r.stdout.trim(), 'ZONA=UTC DIA=2026-03-02');
    });

    prueba('los claims se pierden al terminar la transacción: no hay fuga entre sesiones, ni aunque se confirme', async () => {
      const db = await base();
      igual((await comoA(db).query('select auth.uid()::text u', [], { confirmar: true }))[0].u, A);
      igual(await sql(db, `select auth.uid() u, auth.role() r, nullif(current_setting('request.jwt.claims', true), '') c,
                                  nullif(current_setting('request.jwt.claim.sub', true), '') s`),
        [{ u: null, r: null, c: null, s: null }], 'el superusuario no debe heredar los claims de A');
      igual((await comoAnon(db).query('select auth.uid() u, auth.role() r'))[0], { u: null, r: 'anon' }, 'la siguiente sesión (anon) no ve a A');
      igual((await comoB(db).query('select auth.uid()::text u'))[0].u, B, 'y B ve a B, no a A');
    });

    prueba('tras un error el rol y los claims también se limpian, y la siguiente petición no hereda «transacción abortada»', async () => {
      const db = await base();
      const r = await comoA(db).intentar('select 1 / 0');
      igual([r.ok, r.error.codigo], [false, '22012']);
      igual(await sql(db, 'select current_user cu'), [{ cu: 'postgres' }]);
      igual(await comoA(db).query('select 1 as uno'), [{ uno: 1 }]);
      igual((await sql(db, `select nullif(current_setting('request.jwt.claims', true), '') c`))[0].c, null);
    });

    prueba('una prueba que cambia el rol, el search_path o crea temporales por su cuenta no contamina a la siguiente', async () => {
      const db = await base();
      const s = comoA(db);
      await s.query('set role anon', [], { confirmar: true });
      igual((await sql(db, 'select current_user cu'))[0].cu, 'postgres', 'set role confirmado');
      await s.query('set search_path = pg_catalog', [], { confirmar: true });
      igual((await sql(db, 'show search_path'))[0].search_path, '"$user",public,extensions', 'set search_path confirmado');
      await s.query('create temp table fuga_temp (i int)', [], { confirmar: true });
      igual((await sql(db, `select to_regclass('pg_temp.fuga_temp')::text r`))[0].r, null, 'tabla temporal confirmada');
      await s.query(`select set_config('arnes.fuga', 'si', false)`, [], { confirmar: true });
      igual((await sql(db, `select coalesce(nullif(current_setting('arnes.fuga', true), ''), 'limpio') v`))[0].v, 'limpio', 'variable de sesión');
    });

    prueba('query lanza el error de Postgres con su sqlstate; intentar lo devuelve sin lanzar', async () => {
      const db = await base();
      const e = await esperarError(comoA(db).query('select * from public.no_existe'), '42P01');
      cierto(e instanceof ErrorDeBase && e.codigo === '42P01' && e.code === '42P01', 'es un ErrorDeBase con codigo y code');
      cierto(/does not exist/.test(e.message), 'el message es el de Postgres, sin adornos: ' + e.message);
      cierto(/no_existe/.test(e.sql), 'y trae el SQL');
      const r = await comoA(db).intentar('select * from public.no_existe');
      igual([r.ok, r.filas, r.error.codigo], [false, [], '42P01']);
      igual((await comoA(db).intentar('select 1 as uno')).filas, [{ uno: 1 }]);
    });

    prueba('query corre UNA sentencia: con varias da un error claro y manda a transaccion()', async () => {
      const db = await base();
      const e = await esperarError(comoA(db).query('select 1; select 2'), '42601');
      cierto(/transaccion\(\)/.test(e.pista), 'la pista dice qué hacer: ' + e.pista);
    });

    prueba('dos sesiones lanzadas a la vez no se mezclan (Promise.all), ni siquiera con una que ensucia la sesión', async () => {
      const db = await base();
      const [a, b, c, d] = await Promise.all([
        comoA(db).query('select auth.uid()::text u, current_user cu'),
        comoB(db).query('select auth.uid()::text u, current_user cu'),
        comoAnon(db).query('select auth.uid()::text u, current_user cu'),
        sql(db, 'select current_user cu'),
      ]);
      igual([a[0], b[0], c[0], d[0]], [{ u: A, cu: 'authenticated' }, { u: B, cu: 'authenticated' }, { u: null, cu: 'anon' }, { cu: 'postgres' }]);
      // Lo que la cola protege: la limpieza de una petición corre ANTES de que arranque la siguiente.
      // Sin ella, la segunda empezaría con lo que dejó la primera a nivel de sesión (aquí, una variable).
      const [, lee] = await Promise.all([
        comoA(db).query(`select set_config('arnes.fuga_concurrente', 'si', false)`, [], { confirmar: true }),
        comoB(db).query(`select coalesce(nullif(current_setting('arnes.fuga_concurrente', true), ''), 'limpio') v`),
      ]);
      igual(lee[0].v, 'limpio', 'la segunda petición no debe ver lo que la primera ensució');
    });

    prueba('transaccion: varias sentencias en una petición; lo que una hace lo ve la siguiente; intentar no la aborta', async () => {
      const db = await base();
      const r = await comoServicio(db).transaccion(async t => {
        await t.query('create temp table paso (n int)');
        await t.query('insert into paso values (1), (2)');
        const fallo = await t.intentar('insert into paso values (1 / 0)');
        const despues = await t.query('select count(*)::int n from paso');
        return { fallo: fallo.error.codigo, n: despues[0].n, quien: (await t.query('select current_user u'))[0].u };
      });
      igual(r, { fallo: '22012', n: 2, quien: 'service_role' });
      igual(await sql(db, `select to_regclass('pg_temp.paso')::text r`), [{ r: null }], 'y al terminar no queda nada');
    });

    // `tiempo` corto: si la detección se rompiera, la prueba se colgaría; que falle pronto y no en un minuto.
    prueba('dentro de transaccion, llamar a sql() o a otra sesión se detecta en vez de colgarse', async () => {
      const db = await base();
      await esperarError(comoA(db).transaccion(async () => { await sql(db, 'select 1'); }), /Reentrada/);
      await esperarError(comoA(db).transaccion(async () => { await comoB(db).query('select 1'); }), /Reentrada/);
      igual(await comoA(db).query('select 1 as uno'), [{ uno: 1 }], 'y la cola sigue sirviendo');
    }, { tiempo: 10_000 });

    prueba('una sesión se niega a abrirse sobre una transacción que dejó abierta un sql(), en vez de estorbarse', async () => {
      const db = await base();
      await sql(db, 'begin');
      try { await esperarError(comoA(db).query('select 1'), /transacción abierta/); }
      finally { await sql(db, 'rollback'); }
      igual(await comoA(db).query('select 1 as uno'), [{ uno: 1 }], 'cerrada la transacción, vuelve a funcionar');
    });

    prueba('un error de Postgres atrapado dentro de transaccion() sin SAVEPOINT se avisa, y al confirmar no se deshace en silencio', async () => {
      const db = await base();
      const torpe = async t => { try { await t.query('select 1 / 0'); } catch { /* atrapado sin savepoint: la transacción ya está abortada */ } };
      await esperarError(comoA(db).transaccion(torpe), /transacción abortada/);
      await esperarError(comoA(db).transaccion(torpe, { confirmar: true }), /deshecho todo en silencio/);
      igual(await comoA(db).query('select 1 as uno'), [{ uno: 1 }], 'y la base sigue sirviendo');
    });

    prueba('como valida sus argumentos: rol, sub, uuid', async () => {
      const db = await base();
      const intentar = f => esperarError((async () => f())(), /como\(\)/);
      await intentar(() => como(db, { rol: 'postgres' }));
      await intentar(() => como(db, { rol: 'authenticated' }));
      await intentar(() => como(db, { rol: 'authenticated', sub: 'no-es-uuid' }));
      await intentar(() => como(db, { rol: 'anon', sub: A }));
      await esperarError((async () => como({}, { rol: 'anon' }))(), /crearBase/);
      igual(como(db, { sub: A }).rol, 'authenticated', 'el rol por omisión es authenticated');
      igual(como(db, { uid: A }).sub, A, '`uid` (lo que devuelve crearUsuarioAuth) vale como `sub`');
    });

    prueba('claims a medida (custom claims, app_metadata) y cabeceras HTTP', async () => {
      const db = await base();
      const s = como(db, { sub: A, claims: { app_metadata: { rol: 'direccion' } }, cabeceras: { 'X-Forwarded-For': '203.0.113.7' } });
      igual(await s.query(`select auth.jwt() -> 'app_metadata' ->> 'rol' r, current_setting('request.headers')::json ->> 'x-forwarded-for' ip`),
        [{ r: 'direccion', ip: '203.0.113.7' }]);
      igual(s.claims.sub, A, 'sesion.claims da una copia de lo que viaja');
      s.claims.sub = 'otro';
      igual(s.claims.sub, A, 'y modificarla no cambia la sesión');
    });

    prueba('crearUsuarioAuth da de alta en auth.users como GoTrue, con los disparadores de la migración', async () => {
      const db = await base();
      await aislado(db, async () => {
        await sql(db, `
          create table public.perfiles (id uuid primary key, correo text);
          create function public.alta_de_perfil() returns trigger language plpgsql security definer set search_path = '' as $$
          begin insert into public.perfiles values (new.id, new.email); return new; end $$;
          create trigger al_dar_de_alta after insert on auth.users for each row execute function public.alta_de_perfil();`);
        const u = await crearUsuarioAuth(db, { uid: A, correo: CORREO_A });
        igual(u, { uid: A, correo: CORREO_A, verificado: true });
        const v = await crearUsuarioAuth(db, { correo: 'sin-verificar@pruebas.invalid', verificado: false });
        igual(await sql(db, 'select id::text i, correo from public.perfiles order by correo'),
          [{ i: A, correo: CORREO_A }, { i: v.uid, correo: 'sin-verificar@pruebas.invalid' }], 'el disparador de alta de perfil corrió');
        igual(await sql(db, `select email_confirmed_at is not null as ok, raw_user_meta_data ->> 'email_verified' as v, aud from auth.users where id = $1`, [A]),
          [{ ok: true, v: 'true', aud: 'authenticated' }]);
        igual(await sql(db, `select email_confirmed_at is null as sin from auth.users where id = $1`, [v.uid]), [{ sin: true }], 'verificado:false no confirma el correo');
        await esperarError(crearUsuarioAuth(db, { uid: A, correo: 'otro@pruebas.invalid' }), '23505');
        await esperarError(crearUsuarioAuth(db, { uid: 'no-es-uuid' }), /uuid/);
      });
    });
  });

  /* ====================================================================== */
  describir('El laboratorio: RLS, GRANT, SECURITY DEFINER y vistas, como Postgres los hace de verdad', () => {
    prueba('arma el laboratorio (tablas, vistas y funciones de ejemplo con sus defectos)', async () => {
      const db = await base();
      await crearUsuarioAuth(db, { uid: A, correo: CORREO_A });
      await crearUsuarioAuth(db, { uid: B, correo: CORREO_B });
      await sql(db, LABORATORIO);
    });

    prueba('lo que devuelve crearUsuarioAuth sirve tal cual para como()', async () => {
      const db = await base();
      const u = await crearUsuarioAuth(db, { uid: '00000000-0000-4000-8000-0000000000c1', correo: 'c@pruebas.invalid', verificado: false });
      try {
        igual(await como(db, { rol: 'authenticated', ...u }).query(`select auth.uid()::text id, auth.email() correo, auth.jwt() -> 'user_metadata' ->> 'email_verified' v`),
          [{ id: u.uid, correo: 'c@pruebas.invalid', v: 'false' }]);
      } finally { await sql(db, 'delete from auth.users where id = $1', [u.uid]); }
    });

    prueba('sin GRANT: permission denied (42501) aunque la tabla tenga RLS; con GRANT, authenticated llega a la tabla y RLS decide', async () => {
      const db = await base();
      for (const [nombre, sesion] of [['authenticated', comoA(db)], ['anon', comoAnon(db)]]) {
        await esperarError(sesion.query('select * from public.sin_grant'), /permission denied for table sin_grant/, nombre + ' sobre sin_grant (ningún GRANT)');
      }
      await esperarError(comoAnon(db).query('select * from public.notas'), /permission denied for table notas/, 'anon sobre notas (el GRANT es solo de authenticated)');
      igual(ids(await comoA(db).query('select id from public.notas')), [1], 'authenticated sí tiene GRANT sobre notas: no hay error, RLS filtra');
    });

    prueba('RLS encendida sin ninguna política: default-deny (0 filas al leer, rechazo al escribir)', async () => {
      const db = await base();
      igual(await comoA(db).query('select * from public.cerrada'), [], 'no ve la fila aunque tenga GRANT');
      await esperarError(comoA(db).query(`insert into public.cerrada values (2, 'x')`), /row-level security/);
      igual((await sql(db, 'select count(*)::int n from public.cerrada'))[0].n, 1, 'y el superusuario sí ve que la fila está ahí');
    });

    prueba('política por rol con auth.uid(): cada quien ve lo suyo, y anon no entra', async () => {
      const db = await base();
      igual(ids(await comoA(db).query('select id from public.notas order by id')), [1]);
      igual(ids(await comoB(db).query('select id from public.notas order by id')), [2]);
      await esperarError(comoAnon(db).query('select id from public.notas'), '42501');
    });

    prueba('WITH CHECK impide escribir a nombre de otro; un UPDATE ajeno no falla: afecta 0 filas', async () => {
      const db = await base();
      await esperarError(comoA(db).query(`insert into public.notas values (3, $1, 'a nombre de B')`, [B]), /row-level security/);
      const ajeno = await comoA(db).query(`update public.notas set texto = 'invadido' where id = 2`);
      igual([ajeno.afectadas, ajeno.comando], [0, 'UPDATE'], 'RLS filtra el UPDATE sin dar error');
      const propio = await comoA(db).query(`update public.notas set texto = 'mío' where id = 1 returning texto`);
      igual([propio.afectadas, propio[0].texto], [1, 'mío']);
      const borrar = await comoA(db).query('delete from public.notas where id = 2');
      igual(borrar.afectadas, 0, 'tampoco puede borrar lo de B');
    });

    prueba('una FK hacia auth.users funciona para authenticated aunque auth.users no se pueda leer', async () => {
      const db = await base();
      const r = await comoA(db).intentar(`insert into public.notas values (3, $1, 'mía') returning id`, [A]);
      igual([r.ok, r.filas], [true, [{ id: 3 }]]);
      const sinUsuario = '00000000-0000-4000-8000-0000000000ff';
      await esperarError(como(db, { sub: sinUsuario }).query(`insert into public.notas values (4, $1, 'huérfana')`, [sinUsuario]), '23503');
      const l = await comoA(db).intentar('select * from auth.users');
      igual([l.ok, l.error.codigo], [false, '42501'], 'authenticated no lee auth.users');
    });

    prueba('GRANT sin RLS entrega la tabla completa: nada filtra (el peligro, documentado)', async () => {
      const db = await base();
      igual(ids(await comoA(db).query('select id from public.abierta order by id')), [1, 2]);
      igual(ids(await comoB(db).query('select id from public.abierta order by id')), [1, 2], 'cualquier authenticated ve todo');
    });

    prueba('service_role salta RLS (BYPASSRLS) pero NO los GRANT: sin permiso de tabla también recibe permission denied', async () => {
      const db = await base();
      igual(ids(await comoServicio(db).query('select id from public.notas order by id')), [1, 2], 'con GRANT, ve todo salvo RLS');
      await esperarError(comoServicio(db).query('select * from public.cerrada'), /permission denied for table cerrada/);
    });

    prueba('una vista normal SALTA RLS (corre como su dueño); con security_invoker = true no', async () => {
      const db = await base();
      igual(ids(await comoA(db).query('select id from public.v_normal order by id')), [1, 2], 'A ve también lo de B');
      igual(ids(await comoA(db).query('select id from public.v_invoker order by id')), [1], 'con security_invoker solo lo suyo');
    });

    prueba('SECURITY DEFINER con search_path vacío funciona; sin chequeo salta RLS (el peligro) y con chequeo no', async () => {
      const db = await base();
      igual(await comoA(db).query('select public.contar_todas() n'), [{ n: 2 }], 'cuenta también lo de B: la función corre como su dueño');
      igual(await comoA(db).query('select public.mis_notas() n'), [{ n: 1 }]);
      igual(await comoB(db).query('select public.mis_notas() n'), [{ n: 1 }]);
      await esperarError(comoAnon(db).query('select public.mis_notas() n'), /permission denied for function mis_notas/);
      await esperarError(comoServicio(db).query('select public.mis_notas() n'), '42501', 'BYPASSRLS no da EXECUTE: service_role tampoco puede llamarla');
    });

    prueba('con search_path vacío hay que calificar las extensiones: extensions.hmac sirve, hmac a secas da 42883', async () => {
      const db = await base();
      igual(await comoA(db).query(`select public.hash_ok('abc') h`),
        [{ h: '4c2c26bd5557f7df65c9fdacb0697d0812c4a6b2e2069d5a3c2d678765215471' }]);
      await esperarError(comoA(db).query(`select public.hash_mal('abc') h`), '42883');
    });

    prueba('una función sin REVOKE queda ejecutable por anon (EXECUTE a PUBLIC por defecto); revocada, no', async () => {
      const db = await base();
      igual(await comoAnon(db).query('select public.publica_sin_revoke() n'), [{ n: 1 }], 'anon la llama: ese es el defecto que la auditoría debe cazar');
      await sql(db, 'revoke all on function public.publica_sin_revoke() from public');
      try { await esperarError(comoAnon(db).query('select public.publica_sin_revoke() n'), /permission denied for function/); }
      // El laboratorio tiene que quedar con su defecto: la prueba de la auditoría, más abajo, lo cuenta.
      finally { await sql(db, 'grant execute on function public.publica_sin_revoke() to public'); }
    });

    prueba('una restricción DEFERRABLE se revisa aunque la petición se deshaga (como en el COMMIT de verdad)', async () => {
      const db = await base();
      await comoA(db).transaccion(async t => { await t.query('insert into public.diferida values (1)'); });
      const e = await esperarError(comoA(db).transaccion(async t => {
        await t.query('insert into public.diferida values (1)');
        await t.query('insert into public.diferida values (1)');
      }), '23505');
      cierto(/diferida_id_uk/.test(e.message), e.message);
      igual((await sql(db, 'select count(*)::int n from public.diferida'))[0].n, 0, 'y no quedó nada');
    });

    prueba('por omisión se DESHACE; con {confirmar: true} persiste, y s.con() cambia la opción de la sesión', async () => {
      const db = await base();
      const s = comoA(db);
      await s.query(`insert into public.notas values (10, $1, 'efímera')`, [A]);
      igual((await sql(db, 'select count(*)::int n from public.notas where id = 10'))[0].n, 0, 'sin confirmar no persiste');
      await s.query(`insert into public.notas values (10, $1, 'persistente')`, [A], { confirmar: true });
      igual((await sql(db, 'select texto from public.notas where id = 10')), [{ texto: 'persistente' }], 'con confirmar sí');
      await s.con({ confirmar: true }).query(`insert into public.notas values (11, $1, 'por sesión')`, [A]);
      igual((await sql(db, 'select count(*)::int n from public.notas where id = 11'))[0].n, 1, 'confirmar como opción de la sesión');
      await sql(db, 'delete from public.notas where id in (10, 11)');
    });

    prueba('rpc llama con argumentos con nombre, en cualquier orden, con valores por omisión, con jsonb y con esquema', async () => {
      const db = await base();
      const s = comoA(db);
      igual(await s.rpc('suma', { b: 5, a: 1 }), [{ suma: 6 }], 'en cualquier orden');
      igual(await s.rpc('suma', { a: 1 }), [{ suma: 11 }], 'el valor por omisión de b');
      igual(await s.rpc('public.suma', { a: 2, b: 3 }), [{ suma: 5 }], 'con esquema');
      const datos = { x: [1, 2], y: 'ñandú', z: { n: null } };
      igual(await s.rpc('eco', { datos }), [{ eco: datos }], 'jsonb sale como entró');
      igual(await s.rpc('eco', { datos: [1, { a: 2 }] }), [{ eco: [1, { a: 2 }] }], 'un arreglo también viaja como jsonb');
      igual(await s.rpc('eco_texto', { t: { a: 1 } }), [{ eco_texto: '{"a":1}' }], 'un objeto en un parámetro text llega como su texto JSON, no como «[object Object]»');
      igual(await s.rpc('eco_texto', { t: 'hola' }), [{ eco_texto: 'hola' }], 'un texto es un texto');
      await esperarError(comoAnon(db).rpc('suma', { a: 1 }), '42501');
      await esperarError(s.rpc('suma; drop table x', {}), /no es un nombre de función/);
      await esperarError(s.rpc('suma', { 'a); drop': 1 }), /argumento válido/);
      await esperarError(s.rpc('suma', { c: 1 }), '42883');
    });

    prueba('la auditoría sobre el laboratorio encuentra EXACTAMENTE sus cinco defectos conocidos', async () => {
      const db = await base();
      const r = await auditarRLS(db);
      igual(r, {
        ok: false, total: 5,
        tablasSinRLS: ['public.abierta'],
        vistasSinSecurityInvoker: ['public.v_normal'],
        vistasMaterializadasExpuestas: ['public.mv_notas'],
        funcionesDefinerSinSearchPath: ['public.definer_sin_ruta()'],
        funcionesEjecutablesPorAnon: [{ funcion: 'public.publica_sin_revoke()', via: ['PUBLIC'] }],
      });
    });
  });

  /* ====================================================================== */
  describir('Independencia y copias', () => {
    prueba('dos crearBase() son independientes: ni tablas, ni roles, ni datos se comparten', async () => {
      const db = await base();
      await conBase({}, async otra => {
        await aislado(db, async () => {
          await sql(db, 'create table public.solo_en_la_primera (id int); create role solo_en_la_primera');
          igual(await sql(otra, `select to_regclass('public.solo_en_la_primera')::text t, (select count(*)::int from pg_roles where rolname = 'solo_en_la_primera') r`),
            [{ t: null, r: 0 }], 'la segunda no ve nada de la primera');
          igual((await sql(db, `select count(*)::int r from pg_roles where rolname = 'solo_en_la_primera'`))[0].r, 1);
        });
        igual(await sql(otra, `select to_regclass('public.notas')::text t`), [{ t: null }], 'el laboratorio es solo de la primera');
      });
    });

    prueba('clonarBase copia datos, roles, RLS, políticas y search_path, y las dos quedan independientes', async () => {
      const db = await base();
      const copia = await clonarBase(db);
      try {
        igual((await sql(copia, 'select count(*)::int n from public.notas'))[0].n, 2, 'los datos viajan');
        igual(ids(await comoA(copia).query('select id from public.notas order by id')), [1], 'la política y el rol funcionan en la copia');
        igual((await sql(copia, 'show search_path'))[0].search_path, '"$user",public,extensions', 'el search_path de arranque se conserva');
        igual(await comoA(copia).query(`select public.hash_ok('abc') h`), [{ h: '4c2c26bd5557f7df65c9fdacb0697d0812c4a6b2e2069d5a3c2d678765215471' }], 'pgcrypto viaja');
        await sql(copia, `insert into public.notas values (99, '${A}', 'solo en la copia')`);
        igual((await sql(db, 'select count(*)::int n from public.notas'))[0].n, 2, 'lo de la copia no llega al original');
        await sql(db, `insert into public.notas values (98, '${B}', 'solo en el original')`);
        igual((await sql(copia, 'select count(*)::int n from public.notas where id = 98'))[0].n, 0, 'ni al revés');
        await sql(db, 'delete from public.notas where id = 98');
      } finally { await copia.close(); }
    });

    prueba('sql() es atómico (una sentencia que falla deshace las anteriores del mismo texto) y localiza la línea', async () => {
      const db = await base();
      const e = await esperarError(sql(db, 'create table public.zeta (i int);\nselect 1 / 0'), '22012');
      igual([e.linea, e.sentencia], [2, 'select 1 / 0']);
      igual(await sql(db, `select to_regclass('public.zeta')::text t`), [{ t: null }], 'la tabla de la primera sentencia no quedó');
      igual(await sql(db, 'select current_user cu'), [{ cu: 'postgres' }], 'y la base quedó utilizable');
    });
  });

  /* ====================================================================== */
  describir('crearBase: la carga de migraciones', () => {
    prueba('las carga en orden alfabético; ignora lo que no es .sql; acepta .SQL, la marca BOM y archivos solo con comentarios', async () => {
      await conTemporal({
        'migraciones/20260102000000_b.sql': "alter table public.t add column extra text default 'b';\n",
        'migraciones/20260101000000_a.sql': 'create table public.t (id int primary key);\ninsert into public.t values (1);\n',
        'migraciones/20260103000000_c.SQL': 'insert into public.t (id) values (2);\n',
        'migraciones/20260104000000_bom.sql': String.fromCharCode(0xfeff) + 'insert into public.t (id) values (3);\n',
        'migraciones/20260105000000_vacia.sql': '-- solo un comentario\n',
        'migraciones/20260106000000_con_bloque.sql': 'begin;\ninsert into public.t (id) values (4);\ncommit;\n',
        // Lo que una migración deja a nivel de sesión (aquí un set suelto, y un rol activo) no debe llegar a las peticiones.
        'migraciones/20260199000000_ensucia_la_sesion.sql': 'set search_path = pg_catalog;\nset role anon;\n',
        'migraciones/LEEME.md': 'esto no es SQL y no se carga: ( syntax error',
        'migraciones/notas.txt': 'tampoco',
      }, dir => conBase({ migraciones: join(dir, 'migraciones') }, async db => {
        igual(await sql(db, 'select id, extra from public.t order by id'),
          [{ id: 1, extra: 'b' }, { id: 2, extra: 'b' }, { id: 3, extra: 'b' }, { id: 4, extra: 'b' }]);
        igual(await sql(db, 'select current_user cu'), [{ cu: 'postgres' }], 'la base se entrega como postgres');
        igual(await sql(db, 'show search_path'), [{ search_path: '"$user",public,extensions' }], 'y con el search_path de siempre');
      }));
    });

    prueba('«antes» carga dobles de lo que el shim no trae, «extra» siembra después, «extensiones» agrega contribs; la auditoría ignora lo de las extensiones', async () => {
      await conTemporal({
        'previos/cron.sql': "create schema cron;\ncreate function cron.schedule(nombre text, horario text, orden text) returns bigint language sql as 'select 1::bigint';\n",
        'migraciones/20260101000000_tabla.sql': [
          "select cron.schedule('semanal', '0 3 * * 0', 'select 1');",
          'create extension if not exists "uuid-ossp" with schema public;',
          'create table public.semillas (id int primary key);',
          'alter table public.semillas enable row level security;',
        ].join('\n'),
        'semillas/datos.sql': 'insert into public.semillas values (1), (2);\n',
      }, dir => conBase({
        migraciones: join(dir, 'migraciones'),
        antes: [join(dir, 'previos')],
        extra: [join(dir, 'semillas', 'datos.sql')],
        extensiones: ['uuid_ossp'],
      }, async db => {
        igual((await sql(db, 'select count(*)::int n from public.semillas'))[0].n, 2, 'extra se cargó después de las migraciones');
        igual((await sql(db, 'select length(uuid_generate_v4()::text) n'))[0].n, 36, 'uuid-ossp disponible');
        igual((await sql(db, `select has_function_privilege('anon', 'public.uuid_generate_v4()', 'execute') x`))[0].x, true,
          'las funciones de uuid-ossp en public SÍ son ejecutables por anon…');
        const r = await auditarRLS(db);
        igual(r.ok, true, '…y aun así no son un hallazgo: son de una extensión. ' + describirAuditoria(r));
      }));
    });

    prueba('un error de sintaxis dice el archivo y la línea', async () => {
      await conTemporal({
        'm/20260101000000_ok.sql': 'create table public.a (id int);\n',
        'm/20260102000000_mala.sql': '-- una migración con un error de sintaxis\ncreate table public.b (id int);\n\ncreate tabel public.c (id int);\n',
      }, async dir => {
        const e = await esperarError(crearBase({ migraciones: join(dir, 'm') }), '42601');
        cierto(e instanceof ErrorDeMigracion, 'es un ErrorDeMigracion');
        igual([e.archivo, e.linea, e.codigo], ['20260102000000_mala.sql', 4, '42601']);
        cierto(/20260102000000_mala\.sql/.test(e.message) && /línea 4/.test(e.message) && /create tabel/.test(e.message), e.message);
      });
    });

    prueba('un error de ejecución (Postgres no da posición) también dice la línea, saltando comentarios y funciones con «;» adentro', async () => {
      const lineas = [
        '/* un bloque ; con ; punto y coma',
        '   /* y otro adentro ; */',
        '   y sigue ; */',
        'create table public.v (id int primary key);',
        'create function public.f() returns int language plpgsql as $cuerpo$',
        'begin',
        '  insert into public.v values (1); return 1;',
        'end $cuerpo$;',
        "select 'a;b';",
        '-- comentario con ; y \'comilla',
        'insert into public.v values (1);',
        'insert into public.v values (1);',
      ];
      await conTemporal({ 'm/20260101000000_dup.sql': lineas.join('\n') + '\n' }, async dir => {
        const e = await esperarError(crearBase({ migraciones: join(dir, 'm') }), '23505');
        igual([e.archivo, e.linea], ['20260101000000_dup.sql', 12], 'el segundo insert, en la línea 12');
        cierto(/insert into public\.v values \(1\)/.test(e.sentencia), 'trae la sentencia culpable');
        cierto(/línea 12/.test(e.message), e.message);
      });
      await conTemporal({ 'm/20260101000000_do.sql': ['create table public.w (id int);', '', "do $$ begin raise exception 'boom' using errcode = 'P0001'; end $$;"].join('\n') }, async dir => {
        const e = await esperarError(crearBase({ migraciones: join(dir, 'm') }), /boom/);
        igual([e.linea, e.codigo], [3, 'P0001'], 'un RAISE dentro de un DO también se ubica');
      });
    });

    prueba('un error DENTRO de una función que la migración llama se ubica en la sentencia que la llama, y dice en qué función', async () => {
      await conTemporal({
        'm/20260101000000_interna.sql': ['create table public.w2 (id int);', 'create function public.f2() returns int language plpgsql as $$',
          'begin return (select 1 from public.no_existe_jamas); end $$;', 'select public.f2();'].join('\n'),
      }, async dir => {
        // Postgres da aquí la posición de la consulta INTERNA de la función, que no es una posición de este archivo.
        const e = await esperarError(crearBase({ migraciones: join(dir, 'm') }), '42P01');
        igual([e.linea, e.sentencia], [4, 'select public.f2()'], 'la línea del select que la llama, no una posición interna');
        cierto(/dentro de: PL\/pgSQL function f2\(\) line 2 at RETURN/.test(e.message), e.message);
      });
    });

    prueba('un archivo envuelto en BEGIN … COMMIT que falla a la mitad se ubica; con varios bloques ya confirmados se informa SIN línea antes que inventar una', async () => {
      await conTemporal({
        'uno/20260101000000_bloque.sql': ['begin;', 'create table public.p (id int primary key);', 'insert into public.p values (1);', 'insert into public.p values (1);', 'commit;'].join('\n'),
        'varios/20260101000000_bloques.sql': ['begin;', 'create table public.p (id int primary key);', 'insert into public.p values (1);', 'commit;', '', 'begin;',
          'insert into public.p values (2);', 'insert into public.p values (1);', 'commit;'].join('\n'),
      }, async dir => {
        const uno = await esperarError(crearBase({ migraciones: join(dir, 'uno') }), '23505');
        igual([uno.archivo, uno.linea], ['20260101000000_bloque.sql', 4], 'un solo bloque: la sentencia culpable es la 4');
        const varios = await esperarError(crearBase({ migraciones: join(dir, 'varios') }), '23505');
        igual([varios.archivo, varios.linea, varios.sentencia], ['20260101000000_bloques.sql', null, null], 'dos bloques: el primero ya se confirmó y repetirlo diverge');
        cierto(/20260101000000_bloques\.sql/.test(varios.message) && !/línea/.test(varios.message), varios.message);
      });
    });

    prueba('un BEGIN sin COMMIT al final del archivo se reporta (con la línea del último BEGIN) en vez de perder lo hecho en silencio', async () => {
      await conTemporal({ 'm/20260101000000_sin_commit.sql': '-- se les olvida el commit\nbegin;\ncreate table public.x (i int);\n' }, async dir => {
        const e = await esperarError(crearBase({ migraciones: join(dir, 'm') }), '25001');
        igual([e.archivo, e.linea], ['20260101000000_sin_commit.sql', 2]);
        cierto(/COMMIT/.test(e.message) && /línea 2/.test(e.message), e.message);
      });
    });

    prueba('rutas inexistentes fallan al instante (antes de arrancar PGlite) y explican cómo se cuentan las relativas', async () => {
      const t0 = performance.now();
      const e = await esperarError(crearBase({ migraciones: '../no-existe-jamas' }), /no existe/);
      cierto(/supabase\/tests/.test(e.message), e.message);
      await esperarError(crearBase({ extra: [join(tmpdir(), 'no-existe-jamas.sql')] }), /no existe/);
      await esperarError(crearBase({ extensiones: ['no_existe_esta_extension'] }), /no trae la extensión/);
      cierto(performance.now() - t0 < 1500, 'tres errores de ruta no deben haber arrancado ninguna base');
    });

    prueba('como() y sql() se niegan con claridad a trabajar con algo que no es una base del arnés', async () => {
      await esperarError(sql({}, 'select 1'), /crearBase/);
      await esperarError(clonarBase({}), /crearBase/);
    });
  });

  /* ====================================================================== */
  describir('El divisor de SQL', () => {
    const textos = (s) => partirSql(s).map(x => x.sql);

    prueba('parte en «;» y numera las líneas desde la primera sentencia real', () => {
      const r = partirSql('-- cabecera\n\nselect 1;\n\n  select 2;\nselect 3');
      igual(r.map(x => [x.sql, x.linea]), [['select 1', 3], ['select 2', 5], ['select 3', 6]]);
      igual(textos(';;  ;\n;'), [], 'los «;» sueltos no hacen sentencias vacías');
      igual(textos('-- solo un comentario\n/* y otro */'), []);
    });

    prueba('no corta dentro de textos, identificadores, comentarios (anidados) ni cuerpos con dólares', () => {
      igual(textos(String.raw`select 'a;b'; select "c;d" from t; select E'it\'s; ok'; select 'it''s; ok'`),
        ["select 'a;b'", 'select "c;d" from t', String.raw`select E'it\'s; ok'`, "select 'it''s; ok'"]);
      igual(textos('select 1; -- con ; adentro\nselect 2; /* con ; /* anidado ; */ aún ; */ select 3'), ['select 1', 'select 2', 'select 3']);
      igual(textos('create function f() returns int as $$ select 1; select 2; $$ language sql; select 3;'),
        ['create function f() returns int as $$ select 1; select 2; $$ language sql', 'select 3']);
      igual(textos("do $a$ begin perform '$$;$$'; end $a$; select 4"), ["do $a$ begin perform '$$;$$'; end $a$", 'select 4'], 'una etiqueta distinta de $$ no se cierra con $$');
    });

    prueba('entiende $1, nombres con «$» adentro y BEGIN ATOMIC … END (con CASE adentro)', () => {
      igual(textos('select $1, mi$nombre$ from t; select 2'), ['select $1, mi$nombre$ from t', 'select 2']);
      igual(textos('create function f() returns int language sql begin atomic select 1; select case when true then 2 else 3 end; end; select 4;'),
        ['create function f() returns int language sql begin atomic select 1; select case when true then 2 else 3 end; end', 'select 4']);
      igual(textos('begin; select 1; commit;'), ['begin', 'select 1', 'commit'], 'un BEGIN de transacción no es BEGIN ATOMIC');
    });
  });

  /* ====================================================================== */
  describir('El marco', () => {
    prueba('igual compara en profundidad y en estricto, y dice qué dio y qué esperaba', async () => {
      igual({ a: [1, { b: 'x' }], f: new Date(0), m: new Map([[1, 2]]), n: NaN }, { a: [1, { b: 'x' }], f: new Date(0), m: new Map([[1, 2]]), n: NaN });
      for (const [x, y] of [[1, '1'], [[1, 2], [1, 3]], [{ a: 1 }, { a: 1, b: undefined }], [1n, 1], [new Date(0), new Date(1)]]) {
        const e = await esperarError(Promise.resolve().then(() => igual(x, y, 'no deberían ser iguales')), /no deberían/);
        cierto(e instanceof ErrorDeAfirmacion && /dio:/.test(e.message) && /esp:/.test(e.message), 'el mensaje trae dio/esp');
      }
    });

    prueba('esperarError acepta regex (sobre «sqlstate mensaje»), sqlstate suelto y texto; falla si no hay error o si es otro', async () => {
      const falla = (codigo, mensaje) => Promise.reject(Object.assign(new Error(mensaje), { code: codigo }));
      await esperarError(falla('42501', 'permission denied for table t'), /permission denied/);
      await esperarError(falla('42501', 'permission denied for table t'), /42501/);
      await esperarError(falla('42501', 'permission denied for table t'), /denied|23505/, 'una alternativa basta');
      await esperarError(falla('42501', 'permission denied for table t'), '42501');
      await esperarError(falla('42501', 'permission denied for table t'), 'PERMISSION DENIED');
      await esperarError(Promise.reject(new Error('sin código')), /sin código/);
      const rx = /denied/g;                                       // una regex con /g no debe alternar aciertos y fallos
      await esperarError(falla('42501', 'denied'), rx); await esperarError(falla('42501', 'denied'), rx);
      // Las promesas se fabrican justo antes de esperarlas: una rechazada que espera su turno sin
      // nadie que la atienda dispara «unhandledRejection», que en node 24 mata el proceso.
      for (const [fabricar, patron, aviso] of [
        [() => Promise.resolve('bien'), /x/, /terminó bien/],
        [() => falla('42501', 'otra cosa'), '23505', /no es el esperado/],
        [() => falla('42501', 'otra cosa'), /nada/, /no es el esperado/],
        [() => falla('42501', 'otra cosa'), 'ERROR', /no es el esperado/],
      ]) await esperarError(esperarError(fabricar(), patron), aviso);
      const e = await esperarError(falla('P0001', 'boom'), '23505').catch(x => x);
      cierto(e instanceof ErrorDeAfirmacion);
    });

    prueba('una prueba que lanza cuenta como fallo y no tumba el script; resumen deja el código de salida 1 (y 0 si todo pasa)', async () => {
      // Procesos hijos de verdad: el código de salida y el formato de la salida solo se ven desde afuera.
      const hijo = cuerpo => conTemporal({ 'hijo.mjs': `import { describir, prueba, igual, cierto, dato, resumen } from '${URL_MARCO}';\n${cuerpo}\nawait resumen();\n` }, dir => {
        const t0 = Date.now();
        const r = spawnSync(process.execPath, [join(dir, 'hijo.mjs')], { encoding: 'utf8', timeout: 60_000 });
        return { ...r, ms: Date.now() - t0 };
      });
      const malo = await hijo(`describir('grupo', () => {
          prueba('pasa', () => igual(1, 1));
          prueba('falla por igual', () => igual(1, 2, 'uno no es dos'));
          prueba('lanza', () => { throw new Error('boom'); });
          prueba('asíncrona que pasa', async () => { await new Promise(r => setTimeout(r, 20)); });
        });
        prueba('después del grupo, otra', () => cierto(true));`);
      igual(malo.status, 1, 'código de salida con fallos. stderr: ' + malo.stderr);
      cierto(/✓ pasa/.test(malo.stdout) && /✗ falla por igual/.test(malo.stdout) && /uno no es dos/.test(malo.stdout) &&
             /✗ lanza/.test(malo.stdout) && /boom/.test(malo.stdout) && /✓ asíncrona que pasa/.test(malo.stdout) &&
             /✓ después del grupo, otra/.test(malo.stdout), 'salida del hijo con fallos:\n' + malo.stdout);
      cierto(/2 FALLO\(S\) de 5 verificaciones/.test(malo.stdout), 'el total: ' + malo.stdout.split('\n').slice(-3).join('|'));

      const bueno = await hijo(`prueba('todo bien', () => igual({ a: 1 }, { a: 1 }));
        const caro = dato(() => 42, { limpiar: () => console.log('limpiado') });
        prueba('usa un dato', async () => igual(await caro(), 42));`);
      igual(bueno.status, 0, 'código de salida sin fallos. stderr: ' + bueno.stderr);
      cierto(/Todo pasa\. 2 verificaciones\./.test(bueno.stdout) && /limpiado/.test(bueno.stdout), 'salida del hijo sin fallos:\n' + bueno.stdout);
      cierto(malo.ms < 15_000 && bueno.ms < 15_000, 'resumen termina el proceso sin esperar a nada más (' + malo.ms + ' y ' + bueno.ms + ' ms)');
    });

    prueba('describir no admite funciones async (avisa en vez de perder pruebas), y una prueba colgada se corta por tiempo', async () => {
      const hijo = cuerpo => conTemporal({ 'hijo.mjs': `import { describir, prueba, resumen } from '${URL_MARCO}';\n${cuerpo}\nawait resumen();\n` }, dir =>
        spawnSync(process.execPath, [join(dir, 'hijo.mjs')], { encoding: 'utf8', timeout: 60_000 }));
      const a = await hijo(`try { describir('x', async () => {}); } catch (e) { console.log('LANZO: ' + e.message); }`);
      cierto(/LANZO: describir\(«x»\): la función no puede ser async/.test(a.stdout), a.stdout + a.stderr);
      const b = await hijo(`prueba('colgada', () => new Promise(() => {}), { tiempo: 150 });`);
      igual(b.status, 1);
      cierto(/✗ colgada/.test(b.stdout) && /no terminó en 150 ms/.test(b.stdout), b.stdout);
    });

    prueba('importar autoprueba.mjs desde otro archivo exporta auditarRLS SIN correr las pruebas', async () => {
      const r = await conTemporal({ 'importa.mjs': `import * as m from '${URL_AUTOPRUEBA}';\nconsole.log(typeof m.auditarRLS, typeof m.describirAuditoria, typeof m.exigirAuditoriaLimpia, typeof m.partirSql);\n` }, dir =>
        spawnSync(process.execPath, [join(dir, 'importa.mjs')], { encoding: 'utf8', timeout: 60_000 }));
      igual(r.status, 0, r.stderr);
      igual(r.stdout.trim(), 'function function function function', 'exporta lo prometido');
      cierto(!/✓|✗|FALLO|Todo pasa/.test(r.stdout), 'y no ejecutó ninguna prueba al importarse');
    });
  });
}

if (esPrincipal(import.meta.url)) {
  declarar();
  await resumen();
}
