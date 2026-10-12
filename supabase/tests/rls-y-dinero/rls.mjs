// RLS: matriz tabla × rol × operación (R1, R9) — A.md §10.3, casos RL-01..RL-21 (y, en cuanto existen las
// tablas de dinero, el RL-04 y compañía). Cada tabla se prueba PERMITIDA y DENEGADA por rol.
//
// El esquema de seguridad que se comprueba (§4.2):
//   · `authenticated` NO tiene INSERT/UPDATE/DELETE en ninguna tabla (se escribe por RPC), solo SELECT donde hay política.
//   · `anon` no tiene nada. `contadores` no la lee nadie (RLS activa, sin política, sin GRANT).
//   · `service_role` salta RLS pero NO los GRANT: tiene SELECT/INSERT/UPDATE y NO DELETE. El dueño sí podría
//     borrar, y lo frena el trigger `sin_borrar` (segunda defensa).
//   · cada política compara el `empresa_id` DE LA FILA con las empresas donde la persona es miembro con esa área.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, contar, como, sql } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  // una fila de bitácora por nivel en al3d y una en otra (como superusuario: no depende de ninguna RPC)
  await sql(db, `insert into public.bitacora (empresa_id, nivel, accion, entidad, titulo) values
    ('al3d', 'general',   'prueba', 'proyecto', 'Un hecho de obra'),
    ('al3d', 'dinero',    'prueba', 'venta',    'Un hecho de dinero'),
    ('al3d', 'direccion', 'prueba', 'miembro',  'Un hecho de Dirección'),
    ('otra', 'general',   'prueba', 'proyecto', 'Un hecho de otra empresa')`);
  return db;
}, { limpiar: db => db.close() });

const nombresDeTablas = async db => (await sql(db,
  `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`)).map(r => r.t);

// cuántas filas ve cada rol, por tabla, con la semilla de arriba. null = el rol recibe `permission denied`.
const VISIBLES = {
  //             dir  fab  pag  ext  otra baja
  empresas:     { dir: 1, fab: 1, pag: 1, ext: 0, otra: 1, baja: 0 },
  miembros:     { dir: 8, fab: 1, pag: 1, ext: 0, otra: 2, baja: 1 },    // Dirección: toda su empresa; los demás, la suya
  bitacora:     { dir: 3, fab: 1, pag: 2, ext: 0, otra: 1, baja: 0 },    // por nivel: Dir 3, Pag general+dinero, Fab solo general
  // RL-03: los tres roles leen TODOS los proyectos de su empresa (lápida e histórica incluidas); RL-05 instalaciones
  proyectos:      { dir: 6, fab: 6, pag: 6, ext: 0, otra: 0, baja: 0 },
  instalaciones:  { dir: 2, fab: 2, pag: 2, ext: 0, otra: 0, baja: 0 },
  // RL-04 / R1: el dinero, solo Dirección y Pagos; Fabricación, CERO filas (y sin error: la política no le abre nada)
  ventas_dinero:  { dir: 5, fab: 0, pag: 5, ext: 0, otra: 0, baja: 0 },
  abonos:         { dir: 4, fab: 0, pag: 4, ext: 0, otra: 0, baja: 0 },
  // RL-15: las vistas heredan la RLS de las tablas base (security_invoker)
  ventas_calculadas:     { dir: 5, fab: 0, pag: 5, ext: 0, otra: 0, baja: 0 },
  comisiones_pendientes: { dir: 5, fab: 0, pag: 5, ext: 0, otra: 0, baja: 0 },
};

describir('RL-01..RL-05, RL-10, RL-15 lo que cada rol ve, tabla por tabla y vista por vista', () => {
  for (const [tabla, esperado] of Object.entries(VISIBLES)) {
    prueba(`${tabla}: Dirección ${esperado.dir}, Fabricación ${esperado.fab}, Pagos ${esperado.pag}; sin fila (u_ext) ${esperado.ext}; otra empresa ${esperado.otra}; en baja ${esperado.baja}`, async () => {
      const db = await plantilla();
      for (const k of Object.keys(esperado)) igual(await contar(sesionDe(db, db.u[k]), tabla), esperado[k], `${tabla} como ${k}`);
    });
  }
  prueba('anon recibe permission denied en todas (tablas y vistas)', async () => {
    const db = await plantilla();
    for (const tabla of Object.keys(VISIBLES)) await esperarError(como(db, { rol: 'anon' }).query(`select * from public.${tabla}`), '42501');
  });
  prueba('RL-10: la bitácora filtra por nivel dentro de la misma empresa (Fab no ve dinero ni direccion; Pag no ve direccion)', async () => {
    const db = await plantilla();
    const niveles = async k => (await sesionDe(db, db.u[k]).query(`select nivel from public.bitacora order by nivel`)).map(r => r.nivel);
    igual(await niveles('dir'), ['dinero', 'direccion', 'general']);
    igual(await niveles('pag'), ['dinero', 'general']);
    igual(await niveles('fab'), ['general']);
  });
  prueba('RL-02: Fabricación y Pagos ven SU fila de miembros y ninguna otra; Dirección ve todas las de SU empresa y ninguna de otra', async () => {
    const db = await plantilla();
    igual((await sesionDe(db, db.u.fab).query(`select correo from public.miembros`)).map(r => r.correo), ['fab@al3d.test']);
    const dir = (await sesionDe(db, db.u.dir).query(`select correo from public.miembros`)).map(r => r.correo);
    cierto(!dir.includes('otra@otra.test'), 'Dirección de al3d no ve a la Dirección de otra');
  });
});

describir('RL-11 contadores: ni leer', () => {
  prueba('authenticated y anon reciben permission denied al leer; RLS activa y SIN políticas', async () => {
    const db = await plantilla();
    await esperarError(sesionDe(db, db.u.dir).query('select * from public.contadores'), '42501');
    await esperarError(como(db, { rol: 'anon' }).query('select * from public.contadores'), '42501');
    igual((await sql(db, `select relrowsecurity as rls, (select count(*)::int from pg_policy p where p.polrelid = c.oid) as politicas
                            from pg_class c where c.oid = 'public.contadores'::regclass`))[0], { rls: true, politicas: 0 });
  });
});

describir('RL-12 y RL-13 ninguna escritura directa: ni authenticated ni anon (todo es por RPC)', () => {
  prueba('INSERT, UPDATE y DELETE directos como authenticated → permission denied (42501) en CADA tabla de public', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    const tablas = await nombresDeTablas(db);
    cierto(tablas.length >= 4, 'deben existir las tablas de la fundación: ' + tablas.join(', '));
    for (const t of tablas) {
      await esperarError(D.query(`insert into public.${t} default values`), '42501');
      await esperarError(D.query(`update public.${t} set updated_at = now()`), '42501');
      await esperarError(D.query(`delete from public.${t}`), '42501');
    }
  });
  prueba('lo mismo como anon, y como un usuario SIN fila: permission denied en cada tabla', async () => {
    const db = await plantilla(), A = como(db, { rol: 'anon' }), X = sesionDe(db, db.u.ext);
    for (const t of await nombresDeTablas(db)) {
      for (const S of [A, X]) {
        await esperarError(S.query(`insert into public.${t} default values`), '42501');
        await esperarError(S.query(`update public.${t} set updated_at = now()`), '42501');
        await esperarError(S.query(`delete from public.${t}`), '42501');
      }
    }
  });
  prueba('el privilegio de escribir tampoco está concedido por el catálogo (information_schema.role_table_grants)', async () => {
    const db = await plantilla();
    const g = await sql(db, `select grantee, table_name, privilege_type from information_schema.role_table_grants
                              where table_schema = 'public' and grantee in ('anon', 'authenticated')
                                and privilege_type not in ('SELECT') `);
    igual(g, [], 'authenticated y anon no tienen más que SELECT');
    const anon = await sql(db, `select table_name from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'`);
    igual(anon, [], 'anon no tiene NADA');
  });
});

describir('RL-14 service_role: salta RLS pero no los GRANT; ni él ni el dueño borran', () => {
  prueba('service_role lee todas las tablas (menos lo que no se le dio) y no tiene el privilegio DELETE en ninguna', async () => {
    const db = await plantilla(), S = como(db, { rol: 'service_role' });
    for (const t of await nombresDeTablas(db)) {
      igual((await sql(db, `select has_table_privilege('service_role', 'public.${t}', 'SELECT') as s,
                                   has_table_privilege('service_role', 'public.${t}', 'INSERT') as i,
                                   has_table_privilege('service_role', 'public.${t}', 'UPDATE') as u,
                                   has_table_privilege('service_role', 'public.${t}', 'DELETE') as d,
                                   has_table_privilege('service_role', 'public.${t}', 'TRUNCATE') as tr`))[0],
            { s: true, i: true, u: true, d: false, tr: false }, t);
      await esperarError(S.query(`delete from public.${t} where false`), '42501');
    }
    igual(await contar(S, 'empresas'), 2, 'salta RLS: ve las dos empresas');
    igual(await contar(S, 'miembros'), 10, 'salta RLS: ve todos los miembros de las dos empresas (8 de al3d y 2 de otra)');
  });
  prueba('el DUEÑO (postgres) sí tendría el privilegio de borrar y lo frena el trigger sin_borrar (P0001), salvo en contadores', async () => {
    const db = await plantilla();
    for (const t of ['empresas', 'miembros', 'bitacora']) await esperarError(sql(db, `delete from public.${t}`), 'P0001');
    await sql(db, `delete from public.contadores`);       // contadores no lleva sin_borrar: sus ventanas vencidas las limpian las funciones de cupos
  });
  prueba('service_role puede insertar y actualizar en las tablas de la fundación (lo que hará el importador)', async () => {
    const db = await plantilla(), S = como(db, { rol: 'service_role' });
    const r = await S.transaccion(async t => {      // una sola petición: todo se deshace al final
      await t.query(`insert into public.empresas (id, nombre) values ('nueva', 'Nueva')`);
      await t.query(`update public.empresas set nombre = 'Nueva S.A.' where id = 'nueva'`);
      await t.query(`insert into public.contadores (empresa_id, clave, n) values ('nueva', 'V', 5)`);
      return { nombre: (await t.query(`select nombre from public.empresas where id = 'nueva'`))[0].nombre,
               n: (await t.query(`select n::int as n from public.contadores where empresa_id = 'nueva'`))[0].n };
    });
    igual(r, { nombre: 'Nueva S.A.', n: 5 });
  });
});

describir('RL-17 y RL-19 multiempresa y bajas', () => {
  prueba('RL-17: u_otra (Dirección en otra) no ve NADA de al3d en ninguna tabla con empresa_id', async () => {
    const db = await plantilla(), O = sesionDe(db, db.u.otra);
    igual((await O.query(`select id from public.empresas`)).map(r => r.id), ['otra']);
    igual(await contar(O, 'bitacora', `empresa_id = 'al3d'`), 0);
    igual(await contar(O, 'miembros', `empresa_id = 'al3d'`), 0);
  });
  prueba('RL-17: la misma consulta como u_dir (al3d) no ve nada de otra', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    igual(await contar(D, 'bitacora', `empresa_id = 'otra'`), 0);
    igual(await contar(D, 'miembros', `empresa_id = 'otra'`), 0);
  });
  prueba('RL-19: u_baja lee 0 filas de empresas y de bitácora (solo ve su propia fila baja en miembros)', async () => {
    const db = await plantilla(), B = sesionDe(db, db.u.baja);
    igual([await contar(B, 'empresas'), await contar(B, 'bitacora'), await contar(B, 'miembros')], [0, 0, 1]);
  });
  prueba('MT-03: u_multi (Dirección en al3d, Fabricación en otra) recibe los privilegios de CADA empresa en cada fila', async () => {
    const db = await plantilla(), M = sesionDe(db, db.u.multi);
    igual(await contar(M, 'bitacora', `empresa_id = 'al3d'`), 3, 'como Dirección en al3d: los tres niveles');
    igual(await contar(M, 'bitacora', `empresa_id = 'otra'`), 1, 'como Fabricación en otra: solo general');
  });
});

describir('RL-21 las políticas evalúan empresas_donde UNA vez por consulta, no una por fila', () => {
  prueba('EXPLAIN de select * from bitacora como Dirección muestra un SubPlan hasheado, no una llamada por fila', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    const plan = (await D.query(`explain select * from public.bitacora`)).map(r => r['QUERY PLAN']).join('\n');
    cierto(/hashed SubPlan/i.test(plan), 'el plan debe usar «hashed SubPlan»:\n' + plan);
    cierto(!/empresas_donde\([^)]*\)\s*(=|<>)/.test(plan.replace(/\s+/g, ' ')) || /hashed SubPlan/i.test(plan), 'sin llamada correlacionada por fila');
  });
});

await resumen();
