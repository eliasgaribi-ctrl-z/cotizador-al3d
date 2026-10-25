// LA PRUEBA DE HUMO, EN PGlite — `supabase/opcional/prueba-de-humo.sql`.
//
// La prueba de humo se pega en el Editor SQL del proyecto real. En producción (219 ventas reales, 2026-10-16) el caso C09 «Pagos lee ventas_dinero (1 fila)»
// dio 220: contaba TODAS las filas y suponía una base vacía. Aquí se corre el archivo entero, tal cual, en cuatro bases:
//   1. vacía (solo las migraciones), como `al3d-pruebas` el primer día;
//   2. con datos que NO son de la prueba (personas, ventas, dinero, abonos, almacén, cotizaciones), como producción;
//   3. con datos y con Storage (un sustituto mínimo del esquema `storage` y `opcional/storage.sql` encima, más imágenes que no son de la prueba);
//   4. con el esquema `storage` pero sin `storage.sql`: el bloque 11 dice que no aplica, y no truena.
// En todas: el resultado es `HUMO_RESULTADO` con 0 fallos, el número de casos es el que dicen los documentos, y la base queda EXACTAMENTE como estaba (la
// prueba se deshace sola: el error final es a propósito).
//
// Se usa `db.exec` y no el `sql()` del arnés: el error final es el resultado, y `sql()` volvería a correr el archivo para ubicar «el fallo».
import { describir, prueba, igual, cierto, resumen } from '../arnes/marco.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sembrarAlmacen, sql } from '../comun/semilla.js';
import { SUSTITUTO_STORAGE, TEXTO_STORAGE, TEXTO_CONSTANCIAS } from '../comun/storage.js';

const HUMO = readFileSync(fileURLToPath(new URL('../../opcional/prueba-de-humo.sql', import.meta.url)), 'utf8');
/** Casos sin el bloque de Storage (C01…C57 y el C58 que dice «no aplica») y con él (C01…C74; C70–C74 son de Q-02 bis, Fabricación y las obras
 *  ganadas), más los cinco de cuadre_diario (D01…D05, 0018), los dos de la venta sin cotización con la hoja mandando (E01–E02, 0026) y los ocho del
 *  dinero disponible y las facturas (F01–F08, 0027) en los dos; y el bloque 14, las constancias en Storage: un caso que dice «no aplica» (G01) sin
 *  opcional/constancias.sql, cinco (G01–G05) con él. Los documentos dicen estas cifras. */
const SIN_STORAGE = 74, CON_STORAGE = 90, CON_CONSTANCIAS = 94;

/** Corre la prueba de humo y devuelve su informe (el JSON del error «HUMO_RESULTADO …»). */
async function humo(db) {
  try { await db.exec(HUMO); } catch (e) {
    const m = /HUMO_RESULTADO (\{[\s\S]*\})/.exec(String(e && e.message));
    if (!m) throw new Error('La prueba de humo tronó con otro error: ' + (e && e.message));
    return JSON.parse(m[1]);
  }
  throw new Error('La prueba de humo terminó sin su error final: no se deshizo.');
}
const rojos = inf => inf.casos.filter(c => !c.ok).map(c => c.caso + ' → ' + c.det);

/** Cuántas filas tiene cada tabla de public, auth.users y (si existe) storage.objects: la foto de «no dejó nada». */
async function foto(db) {
  const tablas = (await sql(db, `select format('%I.%I', n.nspname, c.relname) as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                  where c.relkind = 'r' and (n.nspname = 'public' or (n.nspname, c.relname) in (('auth', 'users'), ('storage', 'objects'), ('storage', 'buckets')))
                                  order by 1`)).map(r => r.t);
  const out = {};
  for (const t of tablas) out[t] = (await sql(db, `select count(*)::int as n from ${t}`))[0].n;
  return out;
}

/** Datos que NO son de la prueba: lo que tiene producción, en chico. */
async function conDatos(db) {
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  await sembrarAlmacen(db);
  const cot = (fg, autor, estado = 'autorizada') => sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos)
                                                             values ('al3d', $1, split_part($1, '@', 1), split_part($1, '@', 2), $2::uuid, $3, '{"proy":"Real"}')`, [fg, autor, estado]);
  await cot('COT-0001@K7QM', db.u.pag.uid);
  await cot('COT-0002@K7QM', db.u.dir.uid, 'pendiente');
  await cot('COT-0007@K7QM', db.u.fab.uid, 'retirada');
  await sql(db, `insert into public.bitacora (empresa_id, ts, nivel, accion, entidad, titulo) values ('al3d', now(), 'general', 'real', 'sistema', 'Una línea real')`);
}

describir('la prueba de humo pasa igual en una base vacía que en una con datos, y no deja nada', () => {
  prueba('1 · base VACÍA (solo migraciones): 0 fallos, ' + SIN_STORAGE + ' casos, y la base queda igual', async () => {
    const db = await crearBaseDePruebas();
    try {
      const antes = await foto(db);
      const inf = await humo(db);
      igual(rojos(inf), []);
      igual([inf.fallos, inf.total], [0, SIN_STORAGE]);
      cierto(inf.casos.some(c => /^C58 Storage: no existe/.test(c.caso)), 'sin storage, el bloque 11 dice que no aplica');
      igual(await foto(db), antes, 'no dejó ni una fila');
    } finally { await db.close(); }
  });
  prueba('2 · base CON DATOS que no son de la prueba (como producción): 0 fallos, ' + SIN_STORAGE + ' casos; C09 cuenta solo la venta de humo; la base queda igual', async () => {
    const db = await crearBaseDePruebas();
    try {
      await conDatos(db);
      const antes = await foto(db);
      cierto(antes['public.ventas_dinero'] >= 5 && antes['public.proyectos'] >= 6 && antes['public.cotizaciones'] >= 3, 'hay datos de verdad antes de empezar');
      const inf = await humo(db);
      igual(rojos(inf), []);
      igual([inf.fallos, inf.total], [0, SIN_STORAGE]);
      igual(inf.casos.filter(c => /^C09 /.test(c.caso)).map(c => c.det), ['1'], 'C09 ve 1 fila (la de humo1), no 1 + las de la base');
      igual(await foto(db), antes, 'no dejó ni una fila (ni las purgas del bloque 9, que recorren los datos reales)');
    } finally { await db.close(); }
  });
  prueba('3 · con datos y con STORAGE (sustituto + opcional/storage.sql + imágenes que no son de la prueba, de obras ganadas y de no ganadas): 0 fallos, ' + CON_STORAGE + ' casos; la base queda igual', async () => {
    const db = await crearBaseDePruebas();
    try {
      await conDatos(db);
      await sql(db, SUSTITUTO_STORAGE);
      await sql(db, TEXTO_STORAGE);
      /* COT-0001 y COT-0002 son obras GANADAS de la semilla (p1 y p2): Fabricación SÍ las ve, como en producción. COT-0005 es la lápida «No se dio»
         (p5) y COT-0007 una cotización retirada sin obra: esas no. */
      await sql(db, `insert into storage.objects (bucket_id, name, owner_id) values
                       ('cotizacion-imagenes', 'al3d/COT-0001@K7QM/img-real-1.jpg', $1), ('cotizacion-imagenes', 'al3d/COT-0002@K7QM/img-real-2.jpg', $2),
                       ('cotizacion-imagenes', 'al3d/COT-0005@K7QM/img-real-5.jpg', $2), ('cotizacion-imagenes', 'al3d/COT-0007@K7QM/img-real-7.jpg', $2),
                       ('otros', 'cualquier/cosa.jpg', $2)`, [db.u.pag.uid, db.u.dir.uid]);
      const antes = await foto(db);
      const inf = await humo(db);
      igual(rojos(inf), []);
      igual([inf.fallos, inf.total], [0, CON_STORAGE]);
      igual(inf.casos.filter(c => /^C(5[89]|6\d|7[0-4]) /.test(c.caso)).length, 17, 'los diecisiete casos de Storage (C58…C74) corrieron');
      igual(await foto(db), antes, 'no dejó ni una fila, tampoco en storage.objects');
    } finally { await db.close(); }
  });
  prueba('3 bis · SIN la rama de Q-02 bis (la política de leer de antes: Fabricación no ve ninguna), C70 sale en rojo y nada más', async () => {
    const db = await crearBaseDePruebas();
    try {
      await conDatos(db);
      await sql(db, SUSTITUTO_STORAGE);
      await sql(db, TEXTO_STORAGE);
      await sql(db, `drop policy cotizacion_imagenes_leer on storage.objects;
                     create policy cotizacion_imagenes_leer on storage.objects for select to authenticated
                       using (bucket_id = 'cotizacion-imagenes'
                              and ((storage.foldername(name))[1] in (select interno.empresas_donde(array['direccion']))
                                   or exists (select 1 from public.cotizaciones c
                                               where c.empresa_id = (storage.foldername(name))[1] and c.folio_global = (storage.foldername(name))[2])))`);
      const inf = await humo(db);
      igual(rojos(inf).map(r => r.slice(0, 3)), ['C70']);
    } finally { await db.close(); }
  });
  prueba('4 · con el esquema storage pero SIN storage.sql: el bloque 11 dice que falta aplicarlo (no truena), ' + SIN_STORAGE + ' casos', async () => {
    const db = await crearBaseDePruebas();
    try {
      await sql(db, SUSTITUTO_STORAGE);
      const inf = await humo(db);
      igual(rojos(inf), []);
      igual([inf.fallos, inf.total], [0, SIN_STORAGE]);
      cierto(inf.casos.some(c => /^C58 Storage: el bucket cotizacion-imagenes no existe/.test(c.caso)));
    } finally { await db.close(); }
  });
  prueba('el bloque 11 SÍ detecta una política de más: con una que deja leer el bucket a cualquiera con sesión, Fabricación, Pagos y la persona ajena ven de más: C60, C64, C66, C69, C71, C72 y C74 salen en rojo', async () => {
    const db = await crearBaseDePruebas();
    try {
      await conDatos(db);
      await sql(db, SUSTITUTO_STORAGE);
      await sql(db, TEXTO_STORAGE);
      await sql(db, `insert into storage.objects (bucket_id, name) values ('cotizacion-imagenes', 'al3d/COT-0001@K7QM/img-real-1.jpg')`);
      await sql(db, `create policy todos_leen on storage.objects for select to authenticated using (bucket_id = 'cotizacion-imagenes')`);
      const inf = await humo(db);
      igual(rojos(inf).map(r => r.slice(0, 3)).sort(), ['C60', 'C64', 'C66', 'C69', 'C71', 'C72', 'C74']);
    } finally { await db.close(); }
  });
  prueba('C72 cuenta TODAS las que ve Fabricación: una política de más que solo deja ver lo REAL que no se ganó (ninguna de la prueba) la pone en rojo', async () => {
    const db = await crearBaseDePruebas();
    try {
      await conDatos(db);
      await sql(db, SUSTITUTO_STORAGE);
      await sql(db, TEXTO_STORAGE);
      await sql(db, `insert into storage.objects (bucket_id, name) values ('cotizacion-imagenes', 'al3d/COT-0007@K7QM/img-real-7.jpg')`);
      await sql(db, `create policy fab_ve_retiradas on storage.objects for select to authenticated using (bucket_id = 'cotizacion-imagenes' and name like 'al3d/COT-0007@%')`);
      const inf = await humo(db);
      igual(rojos(inf).map(r => r.slice(0, 3)).sort(), ['C66', 'C69', 'C72']);
    } finally { await db.close(); }
  });
});

describir('los bloques 13 y 14 (0027: el dinero disponible, los clientes fiscales, las facturas y las constancias en Storage)', () => {
  prueba('5 · con datos, STORAGE y opcional/constancias.sql (más constancias que no son de la prueba): 0 fallos, ' + CON_CONSTANCIAS + ' casos; F01–F08 y G01–G05 en verde; la base queda igual', async () => {
    const db = await crearBaseDePruebas();
    try {
      await conDatos(db);
      await sql(db, SUSTITUTO_STORAGE);
      await sql(db, TEXTO_STORAGE);
      await sql(db, TEXTO_CONSTANCIAS);
      /* Lo que ya tendría producción: un cliente fiscal con su constancia, una venta ligada con su factura del anticipo y otras cuentas disponibles. */
      await sql(db, `insert into public.clientes_fiscales (empresa_id, rfc, razon_social, csf_ruta, csf_tipo, csf_bytes, csf_subida_en)
                       values ('al3d', 'REA010101AB1', 'Real', 'al3d/REA010101AB1/csf-real0001-0001.pdf', 'application/pdf', 1000, now());
                     insert into public.ventas_fiscales (proyecto_id, empresa_id, rfc, factura_anticipo, factura_anticipo_por, factura_anticipo_en)
                       values ('p1', 'al3d', 'REA010101AB1', true, 'dir@al3d.test', now());
                     update public.ajustes_dinero set cuentas_disponibles = array['Elias BBVA', 'Constru BNT'] where empresa_id = 'al3d';
                     insert into storage.objects (bucket_id, name) values ('constancias-fiscales', 'al3d/REA010101AB1/csf-real0001-0001.pdf')`);
      const antes = await foto(db);
      const inf = await humo(db);
      igual(rojos(inf), []);
      igual([inf.fallos, inf.total], [0, CON_CONSTANCIAS]);
      igual(inf.casos.filter(c => /^[FG]0\d /.test(c.caso)).map(c => c.caso.slice(0, 3)), ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'G01', 'G02', 'G03', 'G04', 'G05']);
      igual(inf.casos.filter(c => /^F0[4-8] |^G0[3-5] /.test(c.caso)).map(c => c.caso.slice(0, 3) + ':' + c.det),
        ['F04:ROL_SIN_PERMISO / ok / Elias BBVA, Rul HSBC', 'F05:ROL_SIN_PERMISO ROL_SIN_PERMISO ROL_SIN_PERMISO ROL_SIN_PERMISO ROL_SIN_PERMISO',
         'F06:0 / 0 / 0 / 0', 'F07:0 / 0 / 0', 'F08:42501 / 42501 / 42501', 'G03:42501 / 42501', 'G04:42501 / ve 0', 'G05:1 / 0'],
        'Fabricación cuenta TODO (también lo real) y sigue en cero');
      igual(await foto(db), antes, 'no dejó ni una fila, tampoco en storage.objects; las cuentas disponibles de verdad siguen como estaban');
      igual((await sql(db, `select cuentas_disponibles from public.ajustes_dinero where empresa_id = 'al3d'`))[0].cuentas_disponibles, ['Elias BBVA', 'Constru BNT']);
    } finally { await db.close(); }
  });
  prueba('el bloque 14 SÍ detecta una política de más: con una que deja leer las constancias a cualquiera con sesión, G04 y G05 salen en rojo', async () => {
    const db = await crearBaseDePruebas();
    try {
      await conDatos(db);
      await sql(db, SUSTITUTO_STORAGE);
      await sql(db, TEXTO_STORAGE);
      await sql(db, TEXTO_CONSTANCIAS);
      await sql(db, `create policy todos_leen_csf on storage.objects for select to authenticated using (bucket_id = 'constancias-fiscales')`);
      igual(rojos(await humo(db)).map(r => r.slice(0, 3)).sort(), ['G04', 'G05']);
    } finally { await db.close(); }
  });
  prueba('SIN la 0027 (una base de antes): F01 sale en rojo diciendo que falta, y el bloque 14 dice que no aplica', async () => {
    const db = await crearBaseDePruebas();
    try {
      await sql(db, `alter table public.clientes_fiscales rename to clientes_fiscales_antes`);
      const inf = await humo(db);
      igual(rojos(inf).map(r => r.slice(0, 3)), ['F01']);
      cierto(inf.casos.some(c => /^F01 clientes_fiscales no existe: falta aplicar/.test(c.caso)) && inf.casos.some(c => /^G01 Storage: no existe/.test(c.caso)));
    } finally { await db.close(); }
  });
});

describir('el bloque 12 (cuadre_diario, 0018): cuenta solo su renglón y no deja nada', () => {
  prueba('con renglones de verdad de la copia diaria en la base: D01 ve 1 (el de la prueba), D03 cero para los demás, y la base queda igual', async () => {
    const db = await crearBaseDePruebas();
    try {
      await conDatos(db);
      await sql(db, `insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, rechazos, resumen, duracion_ms) values
                       ('al3d', true, true, 0, 0, 0, '{"v":1}', 900), ('al3d', false, false, 3, 1, 0, '{"v":1}', 950)`);
      const antes = await foto(db);
      const inf = await humo(db);
      igual(rojos(inf), []);
      igual(inf.casos.filter(c => /^D0[1-5] /.test(c.caso)).map(c => c.caso.slice(0, 3) + ':' + c.det),
        ['D01:1', 'D02:42501', 'D03:0 / 0 / 0', 'D04:42501', 'D05:P0001 / P0001']);
      igual(await foto(db), antes, 'los dos renglones de verdad siguen y el de la prueba no quedó');
    } finally { await db.close(); }
  });
});

describir('el bloque 1 bis (la venta sin cotización con la hoja mandando, 0026): la base se niega y la empresa se queda en su modo', () => {
  prueba('con la empresa en «hoja» (como producción hoy): E01 y E02 en verde, y la empresa sigue en «hoja» (la prueba la puso en «base» y la regresó solo dentro de su transacción)', async () => {
    const db = await crearBaseDePruebas();
    try {
      await conDatos(db);
      const inf = await humo(db);
      igual(inf.casos.filter(c => /^E0[12] /.test(c.caso)).map(c => c.caso.slice(0, 3) + ':' + c.det), ['E01:DATO_INVALIDO definitivo', 'E02:0']);
      igual((await sql(db, "select modo from public.empresas where id = 'al3d'"))[0].modo, 'hoja');
    } finally { await db.close(); }
  });
  prueba('con la empresa ya en «base» (después del día del cambio): verde igual, y se queda en «base»', async () => {
    const db = await crearBaseDePruebas();
    try {
      await sql(db, "update public.empresas set modo = 'base' where id = 'al3d'");
      const inf = await humo(db);
      igual([rojos(inf), inf.total], [[], SIN_STORAGE]);
      igual((await sql(db, "select modo from public.empresas where id = 'al3d'"))[0].modo, 'base');
    } finally { await db.close(); }
  });
  prueba('SIN la 0026 (la alta_venta de 0006, que no mira el modo): E01 y E02 salen en rojo, y nada más', async () => {
    const db = await crearBaseDePruebas();
    try {
      const t = readFileSync(fileURLToPath(new URL('../../migrations/0006_rpc_obra.sql', import.meta.url)), 'utf8');
      const ini = t.indexOf('create or replace function public.alta_venta'), fin = t.indexOf('end $$;', ini) + 'end $$;'.length;
      await sql(db, t.slice(ini, fin));
      igual(rojos(await humo(db)).map(r => r.slice(0, 3)), ['E01', 'E02']);
    } finally { await db.close(); }
  });
});

await resumen();
