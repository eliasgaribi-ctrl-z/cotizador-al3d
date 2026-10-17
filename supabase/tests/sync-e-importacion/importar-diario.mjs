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
//   CD-05  una venta que la hoja pasa de FABRICACION a COBRANDO sin folio de cotización sigue VIVA (opción a): estatus y montos
//          nuevos, sin conflicto, cuadra; y lo que la base sigue sin dejar (histórica → viva) es conflicto
//   CD-06  si algo truena a media copia, se deshace ENTERA y el fallo se anota sin el mensaje de la base
//   CD-07  las autorizaciones con el veredicto de la hoja (2026-10-17): entran solo las de firma buena, verbatim, y se verifican después
//          con la clave desde la base; las demás no frenan la copia; la revocación llega; sin el permiso explícito no entra ninguna
import { describir, prueba, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, como, sql, una, CLAVE_SELLO_FALSA } from '../comun/semilla.js';
import { firmar, codigoDe, canonDe, verificar } from '../../functions/_shared/sello.js';
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
   CD-05 — una venta viva que la hoja haría histórica
   ============================================================================ */
describir('CD-05 una venta que pasa de FABRICACION a COBRANDO (o LIQUIDADO) sin folio de cotización: sigue viva (opción a, 2026-10-16)', () => {
  prueba('en la base sigue VIVA con el estatus, los montos y la fecha de liquidación nuevos, sin conflicto, y el día cuadra; la etapa se queda', async () => {
    const db = await crearBaseDePruebas();
    try {
      const fila = (C, o = {}) => filaVentas({ celdas: { A: 'V-200', B: 'Eva - Estética Eva', C, F: 'Sí', G: 1000, I: 500, L: dia('2026-10-01'), Z: C === 'FABRICACION' ? 'En diseño' : '', ...o } });
      const otra = G => filaVentas({ celdas: { A: 'V-201', B: 'Fer - Ferretería', C: 'COBRANDO', F: 'Sí', G, L: dia('2026-09-01') } });
      const d1 = await corre(db, volcado({ ventas: [fila('FABRICACION', { M: dia('2026-10-20') }), otra(700)] }));
      igual([d1.aplicado, d1.cuadra], [true, true]);
      igual(await una(db, `select historica, estatus, etapa from public.proyectos where folio_hoja = 'V-200'`), { historica: false, estatus: 'FABRICACION', etapa: 'en_diseno' }, 'día 1: viva, en diseño');
      // día 2: la hoja la pasa a COBRANDO, con otro subtotal y otro anticipo, y conserva la fecha de instalación (que en una histórica iría a fecha_instalacion_hist)
      const d2 = await corre(db, volcado({ ventas: [fila('COBRANDO', { G: 1200, I: 700, M: dia('2026-10-20') }), otra(800)] }));
      igual([d2.aplicado, d2.cuadra, d2.diferencias, d2.conflictos, d2.rechazos, d2.resumen.conflictos_base], [true, true, 0, 0, 0, []], 'día 2: sin conflicto y cuadra');
      igual(await una(db, `select p.historica, p.estatus, p.etapa, p.fecha_instalacion_hist, d.subtotal::text as g, d.anticipo::text as i
                             from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id where p.folio_hoja = 'V-200'`),
        { historica: false, estatus: 'COBRANDO', etapa: 'en_diseno', fecha_instalacion_hist: null, g: '1200', i: '700' }, 'sigue viva, con el estatus y los montos de la hoja; la etapa de la base');
      igual((await una(db, `select d.subtotal::text as g from public.ventas_dinero d join public.proyectos p on p.id = d.proyecto_id where p.folio_hoja = 'V-201'`)).g, '800', 'lo demás también');
      // día 3: LIQUIDADO con su fecha y su liquidación; y la misma hoja otra vez no cambia nada
      const d3 = await corre(db, volcado({ ventas: [fila('LIQUIDADO', { G: 1200, I: 700, J: 692, N: dia('2026-10-30'), Z: 'Instalado' }), otra(800)] }));
      igual([d3.aplicado, d3.cuadra, d3.conflictos], [true, true, 0], 'día 3: liquidada, cuadra');
      igual(await una(db, `select p.historica, p.estatus, p.etapa, d.fecha_liquidacion::text as n from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id where p.folio_hoja = 'V-200'`),
        { historica: false, estatus: 'LIQUIDADO', etapa: 'instalado', n: '2026-10-30' }, 'sigue viva; la etapa que la hoja sí trae (Z) se toma');
      const d4 = await corre(db, volcado({ ventas: [fila('LIQUIDADO', { G: 1200, I: 700, J: 692, N: dia('2026-10-30'), Z: 'Instalado' }), otra(800)] }));
      igual([d4.cuadra, d4.resumen.cambios], [true, []], 'día 4, la misma hoja: ningún cambio');
    } finally { await cerrar(db); }
  });
  prueba('la base NO se afloja: una histórica que la hoja vuelve viva (COBRANDO → REPARANDO) sigue siendo conflicto y ese día no cuadra', async () => {
    const db = await crearBaseDePruebas();
    try {
      const fila = C => filaVentas({ celdas: { A: 'V-210', B: 'Gil - Gil', C, F: 'Sí', G: 900, L: dia('2026-09-01'), Z: C === 'REPARANDO' ? 'En diseño' : '' } });
      await corre(db, volcado({ ventas: [fila('COBRANDO')] }));
      const r = await corre(db, volcado({ ventas: [fila('REPARANDO')] }));
      igual([r.aplicado, r.cuadra, r.conflictos, r.resumen.conflictos_base], [true, false, 1,
        [{ tabla: 'proyectos', tipo: 'en la base es histórica de hoja y ahora sería viva de hoja', n: 1, folios: ['V-210'] }]]);
      igual(await una(db, `select historica, estatus from public.proyectos where folio_hoja = 'V-210'`), { historica: true, estatus: 'COBRANDO' }, 'esa fila no se toca');
      await esperarError(sql(db, `update public.proyectos set historica = false where folio_hoja = 'V-210'`), /no se cambia|no puede|inmutable|cambiar/i, 'y la base sigue sin dejar cambiar historica');
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

/* ============================================================================
   CD-07 — las autorizaciones, con el veredicto de la hoja (decidido 2026-10-17 para que Elías no tenga que mover secretos)
   ============================================================================ */
/** Una fila de «Autorizaciones» como la deja autorizar() de Código.gs, firmada con la clave FALSA en ascii-? (como Apps Script), y el
 *  veredicto que mandaría copia-diaria.gs. Aquí el veredicto se arma con sello.js; que la hoja diga EXACTAMENTE eso con Código.gs real
 *  lo comprueba pruebas/supabase-importar-diario.mjs (sección 9 bis). Lo que se prueba aquí es lo que la base guarda. */
async function autorizacion(fila, o) {
  const r = { folio: o.folio, huella: 'c|1:x', subCalc: 12500, precioAuth: 0, itemsAuth: o.items ?? '', total: o.total ?? 14500, proyecto: o.proyecto,
    correo: 'dir@al3d.test', ts: o.ts, renglones: o.renglones ?? '' };
  const firma = await firmar(r, CLAVE_SELLO_FALSA, { codificacion: 'ascii-?' });
  const celdas = [r.ts, r.folio, r.proyecto, 'Cliente', r.subCalc, r.precioAuth, r.total, '', r.itemsAuth, r.huella, r.correo, 'pag@al3d.test', codigoDe(firma), firma,
    o.estado ?? 'vigente', '', r.renglones];
  if (o.alterar) o.alterar(celdas);
  const veredicto = o.alterar ? { fila, firma_ok: false, motivo: 'firma_no_coincide' } : { fila, firma_ok: true, codificacion: 'ascii-?', canon: canonDe(r) };
  return { celdas, veredicto };
}
async function hojaConAutorizaciones(estado2 = 'vigente') {
  const { filas, v } = hojaDeCincuenta();
  const auts = [
    await autorizacion(2, { folio: 'COT-0101@K7QM', ts: '2026-09-01T16:00:00.000Z', proyecto: 'Tacos Ana', estado: estado2 }),
    await autorizacion(3, { folio: 'COT-0102@K7QM', ts: '2026-09-02T16:00:00.000Z', proyecto: 'Taquería «El Güero»', items: '1:500.00',
      renglones: '[["Letras 3D · 8 × 40 cm «Acrílico»",8,12500]]' }),
    await autorizacion(4, { folio: 'COT-0103@K7QM', ts: '2026-09-03T16:00:00.000Z', proyecto: 'Óptica Luz', estado: 'superada' }),
    await autorizacion(5, { folio: 'COT-0104@K7QM', ts: '2026-09-04T16:00:00.000Z', proyecto: 'Total movido', alterar: c => { c[6] = 15500; } }),
  ];
  const conAut = volcado({ ventas: v.pestanas['Ventas'].slice(1), abonos: v.pestanas['Abonos comisión'].slice(1), autorizaciones: auts.map(a => a.celdas) },
    { autorizaciones_comprobadas: { version: 1, filas: auts.map(a => a.veredicto) } });
  return { filas, v: conAut };
}
async function correConVeredictos(db, v) {
  const plan = await planear({ volcado: v, aceptarVeredictosDeLaHoja: true });
  return copiar({ base: basePGlite(db), plan, volcado: v, ahora: () => (reloj += 7), inicio: reloj });
}
const AUTS = `select folio_global, ts_iso, proyecto, sub_calc::text as sub_calc, precio_auth::text as precio_auth, total::text as total, items_auth, huella,
                     autorizo, renglones, codigo, firma, estado, codificacion, origen, fila_hoja from public.autorizaciones order by folio_global`;

describir('CD-07 las autorizaciones entran con el veredicto de la hoja: solo las de firma buena, tal cual se firmaron, y las demás no frenan la copia', () => {
  prueba('día 1: entran 3 de 4 con ascii-?, se verifican después con la clave desde la base; la alterada se cuenta con su fila; día 2 igual; día 3 la revocación llega', async () => {
    const db = await crearBaseDePruebas();
    try {
      const { filas, v } = await hojaConAutorizaciones();
      const d1 = await correConVeredictos(db, v);
      igual([d1.aplicado, d1.cuadra, d1.rechazos, d1.conflictos], [true, true, 0, 0], 'día 1: la copia se aplica y cuadra; la autorización alterada no la frena');
      const a = await sql(db, AUTS);
      igual(a.map(x => [x.folio_global, x.estado, x.codificacion, x.origen, x.fila_hoja]),
        [['COT-0101@K7QM', 'vigente', 'ascii-?', 'importada_hoja', 2], ['COT-0102@K7QM', 'vigente', 'ascii-?', 'importada_hoja', 3], ['COT-0103@K7QM', 'superada', 'ascii-?', 'importada_hoja', 4]],
        'las tres buenas, con la codificación con que la hoja las firmó');
      for (const f of a) {
        const r = await verificar(f, CLAVE_SELLO_FALSA);
        cierto(r.valida && r.codificacion === 'ascii-?', `${f.folio_global}: /verificar de Supabase la recalcula desde la base con la clave (texto verbatim) — ${r.motivo}`);
      }
      igual(d1.resumen.no_importado.find(x => x.que === 'Autorizaciones'), { que: 'Autorizaciones', n: 1, filas: [5], motivos: { firma_no_coincide: 1 } }, 'la alterada: su fila y su motivo');
      sinDatosDeClientes(d1.resumen, filas);
      igual((await sql(db, `select count(*)::int as n from public.cotizaciones where procedencia->>'stub' = 'Autorizaciones'`))[0].n, 3, 'y su talón de cotización');

      const d2 = await correConVeredictos(db, (await hojaConAutorizaciones()).v);
      igual([d2.cuadra, d2.resumen.cambios], [true, []], 'día 2, la misma hoja: ni una alta ni un cambio');

      const d3 = await correConVeredictos(db, (await hojaConAutorizaciones('revocada')).v);
      igual([d3.cuadra, d3.resumen.cambios.filter(c => c.tabla === 'autorizaciones')], [true, [{ tabla: 'autorizaciones', accion: 'cambio', n: 1 }]], 'día 3: la hoja revocó la 2');
      igual((await una(db, `select estado from public.autorizaciones where folio_global = 'COT-0101@K7QM'`)).estado, 'revocada', 'y la base también (el estado no se firma)');
    } finally { await cerrar(db); }
  });
  prueba('sin aceptarVeredictosDeLaHoja (el importador de línea de comandos), el mismo volcado no mete ninguna', async () => {
    const { v } = await hojaConAutorizaciones();
    const plan = await planear({ volcado: v });
    igual([plan.tablas.autorizaciones.length, plan.reporte.no_importado.map(x => x.que + ':' + x.n)], [0, ['Autorizaciones:4']]);
  });
});

await resumen();
