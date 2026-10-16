// LA COPIA DIARIA hoja → base (función `importar-diario`, decidida por Elías el 2026-10-16) y su bitácora `cuadre_diario` (0018).
//
// Con PGlite y TODAS las migraciones, el camino de verdad: `copiar` (supabase/functions/importar-diario/copia.js) corre el SQL del
// importador (scripts/importador) dentro de UNA transacción de la base, el cuadre por folio y el renglón de cuadre_diario. La base aquí
// es PGlite; en Supabase es postgres.js sobre SUPABASE_DB_URL (base.js), con la misma interfaz { transaccion }. Hojas de mentiras:
// ni un dato real.
//
//   CD-01  0018: la tabla, su RLS (solo Dirección lee), nadie escribe desde la app, nadie cambia ni borra, y la auditoría sigue limpia
//   CD-02  día 1 sobre la base vacía: se aplica, cuadra, y el renglón no lleva nombres ni importes
//   CD-03  día 2 con la misma hoja: no cambia nada y sigue cuadrando; día 3 con cambios: los toma y cuadra
//   CD-04  el plan con un conflicto o una fila que no entra: NO se aplica nada, se anota y no cuadra
//   CD-05  lo que la BASE no deja cambiar (viva → histórica): se anota como conflicto, lo demás se aplica, no cuadra
//   CD-06  si algo truena a media copia, se deshace ENTERA y el fallo se anota sin el mensaje de la base
import { describir, prueba, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, como, sql, una } from '../comun/semilla.js';
import { volcado, filaVentas, dia } from '../comun/hoja-de-mentiras.js';
import { cincuentaFilas } from '../comun/escenarios-importador.js';
import { planear } from '../../../scripts/importador/plan.mjs';
import { copiar } from '../../functions/importar-diario/copia.js';

/** La base de la función, sobre PGlite: la misma interfaz que base.js le da a postgres.js. */
const basePGlite = (db, trampa) => ({
  transaccion: fn => db.transaction(tx => fn({
    ejecutar: async t => { await tx.exec(t); if (trampa) await trampa(t); },
    consultar: async (t, p) => (await tx.query(t, p)).rows,
  })),
});
const cerrar = async db => { try { await db.close(); } catch { /* ya cerrada */ } };
let reloj = 0;
async function corre(db, v, trampa) {
  const plan = await planear({ volcado: v });
  return copiar({ base: basePGlite(db, trampa), plan, volcado: v, ahora: () => (reloj += 7), inicio: reloj });
}
const hojaDeCincuenta = (cambiar = f => f) => {
  const filas = cincuentaFilas().map(cambiar);
  return { filas, v: volcado({ ventas: filas.map(f => f.fila), abonos: filas.flatMap(f => f.abonos.map(a => [f.folio, '', Number(a), dia('2026-09-15'), 'abono', ''])) }) };
};
/** Lo que la base tiene de negocio (para ver que una copia rechazada no tocó nada). */
const foto = db => sql(db, `select (select count(*)::int from public.proyectos) as proyectos, (select count(*)::int from public.abonos) as abonos,
                                   (select coalesce(sum(subtotal), 0)::text from public.ventas_dinero) as subtotal,
                                   (select coalesce(max(updated_at), 'epoch')::text from public.proyectos) as u_proy,
                                   (select coalesce(max(updated_at), 'epoch')::text from public.ventas_dinero) as u_din`);

/** Que el resumen no traiga un nombre ni un importe: ni los nombres de la hoja ni un número que no sea una cuenta chica. */
function sinDatosDeClientes(resumen, filas) {
  const texto = JSON.stringify(resumen);
  const nombres = filas.map(f => String(f.fila[1])).filter(Boolean);
  igual(nombres.filter(n => texto.includes(n)), [], 'ningún nombre de cliente en el resumen');
  igual(/Cliente|Negocio|Tacos|Eva|Estética/.test(texto), false, 'ni pedazos de nombres');
  // los números: cuentas y números de fila (enteros chicos); los textos con cifras: solo folios V-###, el código de un error y la hora del volcado
  const raros = [];
  const recorrer = (x, llave) => {
    if (typeof x === 'number') { if (!Number.isInteger(x) || x > 400) raros.push(llave + '=' + x); }
    else if (typeof x === 'string') { if (/\d/.test(x) && !['hecho', 'puente_version'].includes(llave) && !/^V-\d{3,7}$/.test(x) && !/^[0-9A-Z]{5}$/.test(x)) raros.push(llave + '=' + x); }
    else if (Array.isArray(x)) x.forEach(y => recorrer(y, llave));
    else if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) recorrer(y, k);
  };
  recorrer(resumen, '');
  igual(raros, [], 'ningún importe (ni decimales, ni cifras grandes, ni cifras dentro de un texto)');
}

/* ============================================================================
   CD-01 — la tabla de 0018
   ============================================================================ */
describir('CD-01 0018 cuadre_diario: solo Dirección la lee, nadie escribe desde la app, nadie la cambia ni la borra', () => {
  prueba('RLS por área, sin INSERT para authenticated, sin UPDATE/DELETE para nadie, el CHECK de «cuadra», y la auditoría limpia', async () => {
    const db = await crearBaseDePruebas();
    try {
      const u = await sembrarUsuarios(db);
      igual((await una(db, `select interno.auditoria() as p`)).p, [], 'la auditoría de 0011 sigue limpia con 0018');
      await sql(db, `insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, rechazos, resumen, duracion_ms)
                     values ('al3d', true, true, 0, 0, 0, '{"v":1}', 10), ('otra', true, false, 2, 0, 0, '{"v":1}', 10)`);
      const ve = async quien => (await sesionDe(db, u[quien]).query(`select count(*)::int as n from public.cuadre_diario`))[0].n;
      igual(await ve('dir'), 1, 'Dirección de al3d ve el suyo (y no el de otra empresa)');
      igual([await ve('fab'), await ve('pag'), await ve('ext'), await ve('baja')], [0, 0, 0, 0], 'Fabricación, Pagos, la persona ajena y la baja: cero');
      await esperarError(como(db, { rol: 'anon' }).query(`select count(*) from public.cuadre_diario`), '42501', 'anon: permission denied');
      await esperarError(sesionDe(db, u.dir).query(`insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, duracion_ms) values ('al3d', true, true, 0, 0, 1)`),
        '42501', 'Dirección no escribe (solo la función)');
      await esperarError(como(db, { rol: 'service_role' }).query(`delete from public.cuadre_diario`), '42501', 'service_role no tiene DELETE');
      const s = como(db, { rol: 'service_role' });
      igual((await s.query(`insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, duracion_ms) values ('al3d', false, false, 0, 1, 5) returning fecha::text as f`))[0].f.length, 10,
        'service_role sí inserta, y la fecha sale sola (día de México)');
      await esperarError(sql(db, `update public.cuadre_diario set cuadra = false`), /libro/, 'ni el dueño la edita (solo_agregar)');
      await esperarError(sql(db, `delete from public.cuadre_diario`), /no se borran/, 'ni el dueño la borra (sin_borrar)');
      await esperarError(sql(db, `insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, duracion_ms) values ('al3d', true, true, 3, 0, 1)`),
        /cuadre_diario_cuadra/, '«cuadra» con diferencias no entra');
      await esperarError(sql(db, `insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, resumen, duracion_ms) values ('al3d', false, false, 0, 0, '[]', 1)`),
        /check/, 'el resumen es un objeto');
      const pub = await sql(db, `select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'cuadre_diario'`);
      igual(pub[0].n, 0, 'no va por Realtime');
    } finally { await cerrar(db); }
  });
});

/* ============================================================================
   CD-02 / CD-03 — los días normales
   ============================================================================ */
describir('CD-02/03 la copia de cada día: se aplica en una transacción, cuadra, y el renglón no lleva datos de clientes', () => {
  prueba('día 1 (base vacía): aplica y cuadra; día 2 (misma hoja): nada cambia y cuadra; día 3 (la hoja cambió): toma los cambios y cuadra', async () => {
    const db = await crearBaseDePruebas();
    try {
      const { filas, v } = hojaDeCincuenta();
      const d1 = await corre(db, v);
      igual([d1.aplicado, d1.cuadra, d1.diferencias, d1.conflictos, d1.rechazos], [true, true, 0, 0, 0], 'día 1');
      igual((await una(db, `select count(*)::int as n from public.proyectos`)).n, 50, 'las 50 ventas quedaron en la base');
      cierto(d1.resumen.cambios.some(c => c.tabla === 'proyectos' && c.accion === 'alta' && c.n === 50), 'el resumen dice 50 altas de proyectos');
      sinDatosDeClientes(d1.resumen, filas);
      const r = await una(db, `select aplicado, cuadra, diferencias, conflictos, rechazos, resumen, duracion_ms, fecha::text as fecha from public.cuadre_diario where id = $1::bigint`, [d1.id]);
      igual([r.aplicado, r.cuadra, r.diferencias, r.conflictos, r.rechazos, r.duracion_ms > 0, r.fecha], [true, true, 0, 0, 0, true, d1.fecha], 'el renglón de cuadre_diario');
      sinDatosDeClientes(r.resumen, filas);
      igual((await sql(db, `select count(*)::int as n from pg_class where relname in ('_lote', '_imp_cambios')`))[0].n, 0, 'no quedan tablas temporales en la conexión');

      const antes = await foto(db);
      const d2 = await corre(db, hojaDeCincuenta().v);
      igual([d2.aplicado, d2.cuadra, d2.diferencias, d2.resumen.cambios], [true, true, 0, []], 'día 2: ningún cambio');
      igual(await foto(db), antes, 'ni un updated_at se movió');

      // día 3: la hoja cambió (un anticipo, una venta nueva, un abono nuevo)
      const otra = hojaDeCincuenta(f => (f.folio === 'V-110' ? { ...f, fila: filaVentas({ celdas: { A: 'V-110', B: 'Cliente 10 - Negocio 10', C: 'COBRANDO', F: 'Sí', G: 1000, I: 900, L: dia('2026-07-04') }, abonos: ['150', '25'] }), abonos: ['150', '25'] } : f));
      otra.filas.push({ folio: 'V-300', abonos: [], fila: filaVentas({ celdas: { A: 'V-300', B: 'Nueva - Nueva', C: 'COBRANDO', F: 'No', G: 2500, L: dia('2026-10-10') } }) });
      otra.v = volcado({ ventas: otra.filas.map(f => f.fila), abonos: otra.filas.flatMap(f => f.abonos.map(a => [f.folio, '', Number(a), dia('2026-09-15'), 'abono', ''])) });
      const d3 = await corre(db, otra.v);
      igual([d3.aplicado, d3.cuadra, d3.diferencias, d3.conflictos], [true, true, 0, 0], 'día 3 cuadra');
      igual((await una(db, `select d.anticipo::text as a from public.ventas_dinero d join public.proyectos p on p.id = d.proyecto_id where p.folio_hoja = 'V-110'`)).a, '900', 'el anticipo nuevo');
      igual((await una(db, `select count(*)::int as n from public.proyectos where folio_hoja = 'V-300'`)).n, 1, 'la venta nueva');
      igual((await una(db, `select count(*)::int as n from public.abonos where folio_hoja = 'V-110'`)).n, 2, 'el abono nuevo');
      sinDatosDeClientes(d3.resumen, otra.filas);
      igual((await sql(db, `select cuadra from public.cuadre_diario order by id`)).map(x => x.cuadra), [true, true, true], 'tres días, tres renglones');
    } finally { await cerrar(db); }
  });
});

/* ============================================================================
   CD-04 — el plan con conflictos o filas que no entran
   ============================================================================ */
describir('CD-04 si el PLAN trae conflictos o filas que no entran, no se aplica NADA (y se anota)', () => {
  prueba('un folio repetido en Ventas: la base queda como estaba, el renglón dice el tema y el folio, sin nombres', async () => {
    const db = await crearBaseDePruebas();
    try {
      await corre(db, hojaDeCincuenta().v);
      const antes = await foto(db);
      const { filas } = hojaDeCincuenta(f => (f.folio === 'V-120' ? { ...f, fila: f.fila.map((x, i) => (i === 8 ? 1 : x)) } : f));
      filas.push({ ...filas[3], fila: filas[3].fila.map((x, i) => (i === 1 ? 'Repetido - Repetido' : x)) });     // otra fila con el folio de la 4.ª
      const v = volcado({ ventas: filas.map(f => f.fila) });
      const r = await corre(db, v);
      igual([r.aplicado, r.cuadra, r.conflictos > 0, r.rechazos], [false, false, true, 0]);
      igual(await foto(db), antes, 'nada se escribió (ni el anticipo que sí cambió en V-120)');
      igual(r.resumen.conflictos_plan, [{ tema: 'folio repetido en Ventas', n: 1, folios: ['V-103'] }], 'el tema y el folio, nada más');
      cierto(/no se aplicó nada/.test(r.resumen.motivo), 'y dice por qué');
      cierto(r.diferencias > 0 && r.resumen.diferencias.folios.length > 0, 'el cuadre corrió igual y dice dónde no cuadra (la hoja ya es otra)');
      sinDatosDeClientes(r.resumen, filas);
      const fila = await una(db, `select aplicado, cuadra, conflictos from public.cuadre_diario order by id desc limit 1`);
      igual([fila.aplicado, fila.cuadra, fila.conflictos], [false, false, r.conflictos]);
    } finally { await cerrar(db); }
  });
  prueba('una fila que no entra (G con texto): tampoco se aplica nada; el renglón dice la pestaña y la fila', async () => {
    const db = await crearBaseDePruebas();
    try {
      await corre(db, hojaDeCincuenta().v);
      const antes = await foto(db);
      const { filas, v } = hojaDeCincuenta(f => (f.folio === 'V-105' ? { ...f, fila: f.fila.map((x, i) => (i === 6 ? 'mil quinientos' : x)) } : f));
      const r = await corre(db, v);
      igual([r.aplicado, r.cuadra, r.rechazos, r.conflictos], [false, false, 1, 0]);
      igual(r.resumen.rechazos, [{ donde: 'Ventas', n: 1, filas: [7] }], 'la pestaña y la fila (la 7: encabezado + 6), nunca lo que decía');
      igual(await foto(db), antes);
      sinDatosDeClientes(r.resumen, filas);
    } finally { await cerrar(db); }
  });
});

/* ============================================================================
   CD-05 — lo que la base no deja cambiar
   ============================================================================ */
describir('CD-05 una venta que pasa de FABRICACION a COBRANDO sin folio de cotización (viva → histórica)', () => {
  prueba('la base no deja cambiar `historica`: el SQL del importador no toca ese proyecto y lo anota; lo demás sí se aplica; el día NO cuadra', async () => {
    const db = await crearBaseDePruebas();
    try {
      const fila = (C, G = 1000) => filaVentas({ celdas: { A: 'V-200', B: 'Eva - Estética Eva', C, F: 'Sí', G, I: 500, L: dia('2026-10-01'), Z: C === 'FABRICACION' ? 'En diseño' : '' } });
      const otra = G => filaVentas({ celdas: { A: 'V-201', B: 'Fer - Ferretería', C: 'COBRANDO', F: 'Sí', G, L: dia('2026-09-01') } });
      const d1 = await corre(db, volcado({ ventas: [fila('FABRICACION'), otra(700)] }));
      igual([d1.aplicado, d1.cuadra], [true, true]);
      const d2 = await corre(db, volcado({ ventas: [fila('COBRANDO'), otra(800)] }));
      igual([d2.aplicado, d2.cuadra, d2.conflictos, d2.rechazos], [true, false, 1, 0]);
      igual(d2.resumen.conflictos_base, [{ tabla: 'proyectos', tipo: 'en la base es viva de hoja y ahora sería histórica de hoja', n: 1, folios: ['V-200'] }]);
      igual((await una(db, `select estatus, historica from public.proyectos where folio_hoja = 'V-200'`)), { estatus: 'FABRICACION', historica: false }, 'ese proyecto se quedó como estaba');
      igual((await una(db, `select d.subtotal::text as s from public.ventas_dinero d join public.proyectos p on p.id = d.proyecto_id where p.folio_hoja = 'V-201'`)).s, '800', 'lo demás sí se aplicó');
      const d3 = await corre(db, volcado({ ventas: [fila('COBRANDO'), otra(800)] }));
      igual([d3.cuadra, d3.conflictos], [false, 1], 'y vuelve a salir cada día hasta que una persona lo decida (la racha no avanza)');
    } finally { await cerrar(db); }
  });
});

/* ============================================================================
   CD-06 — un fallo a media copia
   ============================================================================ */
describir('CD-06 si algo truena a media copia, no queda NADA de ella y el fallo se anota sin el mensaje de la base', () => {
  prueba('la base rechaza la copia después de escribirla: se deshace entera; el renglón lleva el código y la tabla, no el texto', async () => {
    const db = await crearBaseDePruebas();
    try {
      await corre(db, hojaDeCincuenta().v);
      const antes = await foto(db);
      const { filas, v } = hojaDeCincuenta(f => (f.folio === 'V-110' ? { ...f, fila: filaVentas({ celdas: { A: 'V-110', B: 'Cliente 10 - Negocio 10', C: 'COBRANDO', F: 'Sí', G: 1000, I: 999, L: dia('2026-07-04') }, abonos: f.abonos }) } : f));
      const trampa = async t => {
        if (!/insert into _imp_cambios/.test(t)) return;
        const e = new Error('new row for relation "proyectos" violates check constraint: Failing row contains (Cliente 10 - Negocio 10, 999)');
        Object.assign(e, { code: '23514', table_name: 'proyectos', constraint_name: 'proyectos_inventada' });
        throw e;
      };
      const r = await corre(db, v, trampa);
      igual([r.aplicado, r.cuadra], [false, false]);
      igual(r.error, { codigo: '23514', tabla: 'proyectos', restriccion: 'proyectos_inventada' });
      igual(await foto(db), antes, 'nada de la copia quedó escrito (el anticipo de V-110 sigue igual)');
      cierto(!JSON.stringify(r.resumen).includes('Failing') && !JSON.stringify(r.resumen).includes('Cliente'), 'el mensaje de la base no se guarda');
      cierto(r.diferencias > 0, 'y el cuadre de cómo quedó la base sí (la hoja ya dice otro anticipo)');
      const fila = await una(db, `select aplicado, cuadra, resumen->'error' as e from public.cuadre_diario order by id desc limit 1`);
      igual([fila.aplicado, fila.cuadra, fila.e], [false, false, { codigo: '23514', tabla: 'proyectos', restriccion: 'proyectos_inventada' }]);
      sinDatosDeClientes(r.resumen, filas);
    } finally { await cerrar(db); }
  });
});

await resumen();
