// El IMPORTADOR de la fase 2 (scripts/importar-hoja.mjs) — supabase/DISENO.md §10.15, casos IM-01..IM-12.
//
// Todo con hojas de mentiras (comun/hoja-de-mentiras.js): volcados con la forma exacta de getValues() y respaldos de teléfono inventados.
// Cada caso arma su plan con `planear`, genera el SQL con `sqlDeImportacion` y lo corre en una base PGlite con TODAS las migraciones, como
// lo correría una persona en el Editor SQL (superusuario). El cuadre se comprueba con el mismo `cuadre.sql` que se le entrega a Elías.
import { mkdtempSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describir, prueba, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sql, una, CLAVE_SELLO_FALSA } from '../comun/semilla.js';
import { volcado, filaVentas, dia } from '../comun/hoja-de-mentiras.js';
import { cincuentaFilas, escenarioRico } from '../comun/escenarios-importador.js';
import { planear } from '../../../scripts/importador/plan.mjs';
import { sqlDeImportacion, sqlDeCuadre } from '../../../scripts/importador/sql.mjs';
import { correr, RAIZ_DEL_REPO, dentroDelRepo } from '../../../scripts/importar-hoja.mjs';
import { firmar, codigoDe, verificar } from '../../functions/_shared/sello.js';

/** Corre el plan en una base nueva; devuelve la base (ciérrala) y lo que hizo la corrida. */
async function importar(plan, db) {
  db ??= await crearBaseDePruebas();
  const cambios = await sql(db, sqlDeImportacion(plan));
  return { db, cambios };
}
const diferencias = (db, plan) => sql(db, sqlDeCuadre(plan).split('select public.cuadre_hoja')[0]);
const cerrar = async db => { try { await db.close(); } catch { /* ya cerrada */ } };

/* ============================================================================
   IM-01 — 50 filas con todos los casos borde de §6.4: cero diferencias
   ============================================================================ */
describir('IM-01 cincuenta filas con los casos borde de §6.4: el cuadre por folio da cero diferencias', () => {
  prueba('importar.sql + cuadre.sql: 0 diferencias en H, K, R, S, T, X, O, V y W; las 50 filas y sus abonos están', async () => {
    const filas = cincuentaFilas();
    const v = volcado({ ventas: filas.map(f => f.fila), abonos: filas.flatMap(f => f.abonos.map(a => [f.folio, '', Number(a), dia('2026-09-15'), 'abono', ''])) });
    const plan = await planear({ volcado: v });
    igual(plan.reporte.rechazos, [], 'ninguna fila rechazada');
    const { db } = await importar(plan);
    try {
      igual(await diferencias(db, plan), [], 'cero diferencias por folio');
      const q = (await una(db, `select public.cuadre_hoja('al3d') as c`)).c;
      igual(q.ventas.filas, 50);
      igual(q.abonos.n, filas.reduce((a, f) => a + f.abonos.length, 0));
      igual(q.invariantes.proyectos_sin_dinero, 0);
    } finally { await cerrar(db); }
  });
  prueba('y el cuadre NO es mudo: un centavo distinto en H de la hoja sale como diferencia', async () => {
    const filas = cincuentaFilas();
    const v = volcado({ ventas: filas.map(f => f.fila), abonos: filas.flatMap(f => f.abonos.map(a => [f.folio, '', Number(a), dia('2026-09-15'), 'abono', ''])) });
    const plan = await planear({ volcado: v });
    const { db } = await importar(plan);
    try {
      plan.esperado[3].h = Number(plan.esperado[3].h) + 0.01;
      plan.esperado[7].x = 'Cobrado de más (inventado)';
      const d = await diferencias(db, plan);
      igual(d.map(x => x.folio + ':' + x.col), [plan.esperado[3].folio + ':H', plan.esperado[7].folio + ':X']);
    } finally { await cerrar(db); }
  });
});

/* ============================================================================
   El escenario «rico»: hoja + tres teléfonos (IM-02, IM-04, IM-06, IM-07, IM-11, IM-12)
   ============================================================================ */
const TABLAS_CON_CURSOR = ['proyectos:id', 'ventas_dinero:proyecto_id', 'abonos:id', 'instalaciones:id', 'materiales:id', 'requerimientos:id',
  'almacen_movimientos:id', 'almacen_costos:id', 'cotizaciones:folio_global', 'miembros:correo', 'constantes:clave'];
const foto = db => sql(db, TABLAS_CON_CURSOR.map(x => { const [t, k] = x.split(':'); return `select '${t}' as t, ${k}::text as k, updated_at::text as u from public.${t}`; })
  .join(' union all ') + ' order by 1, 2');

describir('IM-02 una segunda corrida idéntica no cambia nada', () => {
  prueba('con hoja y tres teléfonos: la segunda corrida no registra cambios y ningún updated_at se mueve', async () => {
    const e = escenarioRico();
    const plan = await planear(e);
    const { db, cambios } = await importar(plan);
    try {
      cierto(cambios.length > 0, 'la primera corrida sí escribió');
      const antes = await foto(db);
      const segunda = await sql(db, sqlDeImportacion(await planear(e)));
      igual(segunda, [], 'el reporte de cambios de la segunda corrida está vacío');
      igual(await foto(db), antes, 'ningún updated_at se movió');
      igual(await diferencias(db, plan), [], 'y sigue cuadrando');
    } finally { await cerrar(db); }
  });
});

describir('El ensayo (ensayo.sql) no deja nada escrito', () => {
  prueba('termina con el error a propósito que dice lo que habría hecho, y la base queda como estaba', async () => {
    const plan = await planear(escenarioRico());
    const db = await crearBaseDePruebas();
    try {
      let mensaje = '';
      try { await sql(db, sqlDeImportacion(plan, { ensayo: true })); } catch (e) { mensaje = String(e.message); }
      cierto(/ENSAYO TERMINADO SIN ERRORES/.test(mensaje) && /proyectos alta 4/.test(mensaje), mensaje);
      igual((await una(db, `select (select count(*) from public.proyectos)::int + (select count(*) from public.abonos)::int
                                 + (select count(*) from public.materiales)::int as n`)).n, 0, 'nada quedó escrito');
      // y el archivo de verdad, sobre la misma base, sí escribe
      await sql(db, sqlDeImportacion(plan));
      igual((await una(db, `select count(*)::int as n from public.proyectos`)).n, 4);
    } finally { await cerrar(db); }
  });
});

describir('IM-04 cómo se decide qué es cada fila (§3.0)', () => {
  prueba('Y válida con proyecto de teléfono ⇒ cotización fusionada; FABRICACION sin Y ⇒ viva; COBRANDO/LIQUIDADO sin Y ⇒ histórica', async () => {
    const plan = await planear(escenarioRico());
    const { db } = await importar(plan);
    try {
      const p = await sql(db, `select folio_hoja, id, fuente, historica, folio_global, etapa, dispositivo from public.proyectos order by folio_hoja`);
      igual(p, [
        { folio_hoja: 'V-010', id: 'proy-a1', fuente: 'cotizacion', historica: false, folio_global: 'COT-0001@K7QM', etapa: 'cortado', dispositivo: 'K7QM' },
        { folio_hoja: 'V-011', id: 'proy-hoja-V-011', fuente: 'hoja', historica: false, folio_global: null, etapa: 'armado', dispositivo: 'hoja' },
        { folio_hoja: 'V-012', id: 'proy-hoja-V-012', fuente: 'hoja', historica: true, folio_global: null, etapa: null, dispositivo: 'hoja' },
        { folio_hoja: 'V-013', id: 'proy-hoja-V-013', fuente: 'hoja', historica: true, folio_global: null, etapa: null, dispositivo: 'hoja' },
      ]);
      // el dinero manda la hoja; la obra, el sello mayor (V-011: el teléfono con 5000 gana a la hoja con 4000)
      const d = await una(db, `select subtotal::text, anticipo::text, cuenta, precio_auth::text, origen_dinero from public.ventas_dinero where proyecto_id = 'proy-a1'`);
      igual([d.subtotal, d.anticipo, d.cuenta, d.precio_auth], ['12500', '6000', 'Constru BNT', '14500']);
      cierto(d.origen_dinero.precioAuth === 14500 && d.origen_dinero.venta.neto === 14500, 'los precios del origen quedan del lado del dinero');
      const o = await una(db, `select origen_obra, tel, plazo_k, entrega, lat, sellos from public.proyectos where id = 'proy-a1'`);
      cierto(o.origen_obra && !JSON.stringify(o.origen_obra).includes('14500'), 'la parte de obra no lleva precios');
      igual([o.tel, o.plazo_k, o.entrega, o.lat], ['33 1234 5678', 3, 'instalacion', 20.6597]);
      igual(o.sellos, { etapa: 3000, instalacion: 2500 }, 'cada grupo con su sello mayor');
      const r = await una(db, `select h.fecha_instalacion_hist::text as f from public.proyectos h where id = 'proy-hoja-V-012'`);
      igual(r.f, '2025-03-10', 'la cita de una histórica queda en fecha_instalacion_hist, sin instalación');
      cierto(plan.reporte.conflictos.some(c => c.que === 'V-011' && /etapa: gana telB/.test(c.detalle)), 'la etapa distinta queda en el reporte');
    } finally { await cerrar(db); }
  });
});

describir('IM-06 remapeo de ids con dos teléfonos para la misma venta', () => {
  prueba('hijos al id canónico; huérfanos al reporte; UID canónico = mayor movida y la otra cancelada sin tocar el calendario', async () => {
    const plan = await planear(escenarioRico());
    igual(plan.remapeo['proy-b1'], 'proy-a1', 'la copia de telB apunta al proyecto del teléfono que emitió el folio');
    const { db } = await importar(plan);
    try {
      const ins = await sql(db, `select id, proyecto_id, estado, fecha::text, hora, movida, uid_ics, procedencia->>'fusionada_en' as fusion from public.instalaciones order by id`);
      igual(ins, [
        { id: 'ins-a', proyecto_id: 'proy-a1', estado: 'cancelada', fecha: '2026-10-20', hora: null, movida: 1, uid_ics: 'inst-ins-a@al3d.mx', fusion: 'ins-b' },
        { id: 'ins-b', proyecto_id: 'proy-a1', estado: 'reagendada', fecha: '2026-10-22', hora: '09:00', movida: 2, uid_ics: 'inst-ins-b@al3d.mx', fusion: null },
      ]);
      const req = await sql(db, `select id, proyecto_id from public.requerimientos order by id`);
      cierto(req.every(r => r.proyecto_id === 'proy-a1'), 'todos los requerimientos al id canónico');
      const mov = await sql(db, `select id, proyecto_id, requerimiento_id, procedencia->>'proyecto_id_local' as local from public.almacen_movimientos order by id`);
      igual(mov.find(m => m.id === 'mov-x'), { id: 'mov-x', proyecto_id: null, requerimiento_id: null, local: 'proy-desconocido' }, 'el huérfano entra sin proyecto y con su id local');
      igual(mov.find(m => m.id === 'mov-salida:proy-a1:acr-3mm').requerimiento_id, 'proy-a1:acr-3mm');
      cierto(plan.reporte.rechazos.some(r => r.donde === 'requerimientos' && r.fila === 'proy-zzz:acr-3mm'), 'el requerimiento sin proyecto va al reporte');
      cierto(plan.reporte.conflictos.some(c => c.tema === 'dos citas vivas para un proyecto'), 'las dos citas quedan en el reporte');
    } finally { await cerrar(db); }
  });
});

describir('IM-07 requerimientos duplicados (proyecto, material)', () => {
  prueba('gana comprado sobre calculado aunque tenga un sello más viejo; un empate de estado y sello va al reporte', async () => {
    const plan = await planear(escenarioRico());
    const { db } = await importar(plan);
    try {
      const r = await sql(db, `select id, estado, cantidad_compra::text as c from public.requerimientos order by id`);
      igual(r, [{ id: 'proy-a1:acr-3mm', estado: 'comprado', c: '1' }, { id: 'proy-a1:vinil', estado: 'calculado', c: '1' }]);
      cierto(plan.reporte.conflictos.some(c => c.tema === 'requerimiento duplicado sin ganador' && c.que === 'proy-a1:vinil'), 'el empate se reporta');
    } finally { await cerrar(db); }
  });
});

describir('IM-11 salidas de material duplicadas entre teléfonos', () => {
  prueba('una salida derivada por (venta, material): la de menor ts; el mismo id en dos teléfonos entra una vez; su costo también', async () => {
    const plan = await planear(escenarioRico());
    const { db } = await importar(plan);
    try {
      const s = await sql(db, `select id from public.almacen_movimientos where tipo = 'salida' and origen = 'derivado'`);
      igual(s, [{ id: 'mov-salida:proy-a1:acr-3mm' }]);
      igual((await una(db, `select count(*)::int as n from public.almacen_movimientos where id = 'mov-e1'`)).n, 1);
      igual((await una(db, `select importe::text as i from public.almacen_costos where movimiento_id = 'mov-e1'`)).i, '4250');
      cierto(plan.reporte.conflictos.some(c => c.tema === 'salida de material repetida'), 'la repetida se reporta');
    } finally { await cerrar(db); }
  });
});

describir('IM-12 cotización con aparato desconocido', () => {
  prueba('disp = HIST + hash de 6, procedencia.disp_inferido y aviso en el reporte; la del aparato conocido conserva el suyo', async () => {
    const plan = await planear(escenarioRico());
    const { db } = await importar(plan);
    try {
      const c = await sql(db, `select folio_global, disp, procedencia->>'disp_inferido' as inf from public.cotizaciones order by folio_global`);
      igual(c.length, 2);
      igual(c[0], { folio_global: 'COT-0001@K7QM', disp: 'K7QM', inf: null });
      cierto(/^HIST[0-9a-f]{6}$/.test(c[1].disp) && c[1].inf === 'true' && c[1].folio_global === 'COT-0500@' + c[1].disp, 'el aparato inferido: ' + JSON.stringify(c[1]));
      cierto(plan.reporte.avisos.some(a => a.donde === 'cotizaciones' && a.fila === c[1].folio_global), 'y se lista en el reporte');
      igual(plan.contadores.find(x => x.clave === 'folio_cot:K7QM').n, 7, 'el folio del aparato se siembra con su al3d_folio');
    } finally { await cerrar(db); }
  });
});

/* ============================================================================
   IM-03 — celdas sucias
   ============================================================================ */
describir('IM-03 celdas sucias', () => {
  prueba('texto en G y negativo en I no entran (reporte); fecha como texto → NULL + aviso; Y = V-014 → NULL y procedencia.celdas.Y', async () => {
    const v = volcado({ ventas: [
      filaVentas({ celdas: { A: 'V-014', B: 'Uno - Uno', C: 'COBRANDO', F: 'Sí', G: 'mil pesos', L: dia('2026-09-01') }, formulas: false }),
      filaVentas({ celdas: { A: 'V-015', B: 'Dos - Dos', C: 'COBRANDO', F: 'Sí', G: 100, I: -5, L: dia('2026-09-01') } }),
      filaVentas({ celdas: { A: 'V-016', B: 'Tres - Tres', C: 'FABRICACION', F: 'Sí', G: 100, L: '01/09/2026', Y: 'V-014' } }),
      filaVentas({ celdas: { A: 'v-17', B: 'Cuatro', C: 'COBRANDO', F: 'Sí', G: 100 } }),
      filaVentas({ celdas: { A: '', B: '' } }),
    ] });
    const plan = await planear({ volcado: v });
    igual(plan.reporte.rechazos.map(r => r.fila + ':' + r.que), ['2:V-014', '3:V-015', '5:A «Folio»']);
    cierto(plan.reporte.avisos.some(a => a.que === 'V-016' && /L «Fecha Anticipo» tiene texto/.test(a.por)), 'la fecha tecleada como texto se avisa');
    const { db } = await importar(plan);
    try {
      const p = await una(db, `select folio_global, fecha_anticipo, procedencia->'celdas' as celdas from public.proyectos where folio_hoja = 'V-016'`);
      igual(p.folio_global, null);
      igual(p.fecha_anticipo, null);
      igual(p.celdas, { Y: 'V-014', L: '01/09/2026' });
      igual((await una(db, `select count(*)::int as n from public.proyectos`)).n, 1, 'solo entra la fila sana');
    } finally { await cerrar(db); }
  });
});

/* ============================================================================
   IM-05 — prueba de oro de firmas
   ============================================================================ */
async function filaAutorizacion({ folio, proyecto, ts, renglones = '', codificacion, alterar }) {
  const r = { folio, huella: 'c|1:x', subCalc: 12500, precioAuth: 0, itemsAuth: '', total: 14500, proyecto, correo: 'dir@al3d.test', ts, renglones };
  const firma = await firmar(r, CLAVE_SELLO_FALSA, { codificacion });
  const fila = [r.ts, r.folio, r.proyecto, 'Cliente', r.subCalc, r.precioAuth, r.total, '', r.itemsAuth, r.huella, r.correo, 'pag@al3d.test', codigoDe(firma), firma, 'vigente', '', r.renglones];
  if (alterar) alterar(fila);
  return fila;
}

describir('IM-05 prueba de oro de firmas', () => {
  prueba('firmadas con la clave FALSA en ascii-? y en UTF-8: entran todas las buenas, cada una con su codificación, y la firma se recalcula idéntica desde la base', async () => {
    const auts = [
      await filaAutorizacion({ folio: 'COT-0101@K7QM', proyecto: 'Tacos Ana', ts: '2026-09-01T16:00:00.000Z', codificacion: 'ascii-?' }),
      await filaAutorizacion({ folio: 'COT-0102@K7QM', proyecto: 'Taquería «El Güero»', ts: '2026-09-02T16:00:00.000Z', codificacion: 'ascii-?' }),
      await filaAutorizacion({ folio: 'COT-0103@K7QM', proyecto: 'Café Ñandú', ts: '2026-09-03T16:00:00.000Z', codificacion: 'utf-8' }),
      await filaAutorizacion({ folio: 'COT-0104@K7QM', proyecto: 'Óptica Luz', ts: '2026-09-04T16:00:00.000Z', renglones: '[["Letras",8,12500]]', codificacion: 'ascii-?' }),
      await filaAutorizacion({ folio: 'COT-0105@K7QM', proyecto: 'Hora movida', ts: '2026-09-05T16:00:00.000Z', codificacion: 'ascii-?', alterar: f => { f[0] = '2026-09-05T16:00:01.000Z'; } }),
      await filaAutorizacion({ folio: 'COT-0106@K7QM', proyecto: 'Renglones', ts: '2026-09-06T16:00:00.000Z', renglones: '[["Letras",8,12500]]', codificacion: 'ascii-?', alterar: f => { f[16] = '[["Letras",9,12500]]'; } }),
      await filaAutorizacion({ folio: 'COT-0107@K7QM', proyecto: 'Nombre', ts: '2026-09-07T16:00:00.000Z', codificacion: 'utf-8', alterar: f => { f[2] = 'Nombre cambiado'; } }),
    ];
    const v = volcado({ ventas: [], autorizaciones: auts });
    const plan = await planear({ volcado: v, clave: CLAVE_SELLO_FALSA });
    igual(plan.reporte.rechazos.map(r => r.que), ['COT-0105@K7QM', 'COT-0106@K7QM', 'COT-0107@K7QM'], 'las alteradas a mano van al reporte y no abortan');
    const { db } = await importar(plan);
    try {
      const filas = await sql(db, `select folio_global, ts_iso, proyecto, sub_calc::text as sub_calc, precio_auth::text as precio_auth, total::text as total, items_auth, huella,
                                         autorizo, renglones, codigo, firma, estado, codificacion, origen from public.autorizaciones order by folio_global`);
      igual(filas.map(f => f.folio_global + ':' + f.codificacion), ['COT-0101@K7QM:utf-8', 'COT-0102@K7QM:ascii-?', 'COT-0103@K7QM:utf-8', 'COT-0104@K7QM:ascii-?']);
      for (const f of filas) {
        const r = await verificar(f, CLAVE_SELLO_FALSA);
        cierto(r.valida, `${f.folio_global}: la firma se recalcula idéntica desde la base (${r.motivo})`);
        igual(f.origen, 'importada_hoja');
      }
      const c = await sql(db, `select c.folio_global, c.estado, c.autorizacion_id = a.id as ligada, c.procedencia->>'stub' as stub
                                 from public.cotizaciones c join public.autorizaciones a using (empresa_id, folio_global) order by 1`);
      igual(c.length, 4);
      cierto(c.every(x => x.ligada && x.stub === 'Autorizaciones' && x.estado === 'autorizada'), 'cada folio sin cotización tiene su talón ligado a su autorización');
    } finally { await cerrar(db); }
  });
  prueba('sin la clave no se importa ninguna y el reporte dice por qué', async () => {
    const v = volcado({ ventas: [], autorizaciones: [await filaAutorizacion({ folio: 'COT-0101@K7QM', proyecto: 'Tacos', ts: '2026-09-01T16:00:00.000Z', codificacion: 'ascii-?' })] });
    const plan = await planear({ volcado: v });
    igual(plan.tablas.autorizaciones, []);
    igual(plan.reporte.no_importado.map(x => x.que + ':' + x.n), ['Autorizaciones:1']);
  });
});

/* ============================================================================
   IM-08 — contadores
   ============================================================================ */
describir('IM-08 contadores', () => {
  prueba('V ≥ el máximo de Ventas, Ventas (respaldo), la bitácora y los abonos; la siguiente alta es máximo + 1; P y alm sembrados', async () => {
    const v = volcado({
      ventas: [filaVentas({ celdas: { A: 'V-001', B: 'Uno - Uno', C: 'COBRANDO', F: 'Sí', G: 100, L: dia('2026-09-01') } })],
      respaldo: [filaVentas({ celdas: { A: 'V-300', B: 'Viejo' }, formulas: false })],
      bitacora: [[dia('2026-09-01'), 'pagos', 'V-305', 2, 'Anticipo', '']],
      abonos: [['V-310', '', 100, dia('2026-09-02'), 'Reparto de depósito', 'P-007'], ['V-001', '', 5, dia('2026-09-03'), 'abono', '']],
    }, { almacen_secuencia: 40 });
    const plan = await planear({ volcado: v });
    const { db } = await importar(plan);
    try {
      const c = await sql(db, `select clave, n::int from public.contadores where empresa_id = 'al3d' and ventana = '' and clave in ('V','P','alm') order by clave`);
      igual(c, [{ clave: 'P', n: 7 }, { clave: 'V', n: 310 }, { clave: 'alm', n: 40 }]);
      igual((await una(db, `select interno.siguiente('al3d', 'V')::int as n`)).n, 311, 'la siguiente alta es el máximo + 1');
      const a = await sql(db, `select folio_hoja, tipo, pago_id from public.abonos order by folio_hoja`);
      igual(a, [{ folio_hoja: 'V-001', tipo: 'historico', pago_id: null }, { folio_hoja: 'V-310', tipo: 'reparto', pago_id: 'P-007' }]);
      cierto(plan.reporte.avisos.some(x => x.que === 'V-310' && /no tiene fila en Ventas/.test(x.por)), 'el abono huérfano entra y se avisa');
    } finally { await cerrar(db); }
  });
});

/* ============================================================================
   IM-09 — reportes dentro del árbol del repositorio
   ============================================================================ */
describir('IM-09 la salida dentro del repositorio', () => {
  prueba('se niega a escribir dentro del repo (también por una ruta relativa con ..) y sí escribe fuera', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'al3d-imp-'));
    try {
      const archivo = join(tmp, 'volcado.json');
      writeFileSync(archivo, JSON.stringify(volcado({ ventas: [filaVentas({ celdas: { A: 'V-001', B: 'Uno - Uno', C: 'COBRANDO', F: 'Sí', G: 100 } })] })));
      const adentro = join(RAIZ_DEL_REPO, 'reportes-de-prueba-im09');
      const r1 = await correr(['--volcado', archivo, '--salida', adentro], {});
      cierto(!r1.ok && /Me niego/.test(r1.mensaje), r1.mensaje);
      igual(existsSync(adentro), false, 'no creó la carpeta');
      cierto(dentroDelRepo(join(RAIZ_DEL_REPO, 'supabase', '..', 'docs')), 'una ruta con .. que cae dentro también se niega');
      const fuera = join(tmp, 'salida');
      const r2 = await correr(['--volcado', archivo, '--salida', fuera], {});
      cierto(r2.ok, r2.mensaje);
      igual(readdirSync(fuera).sort(), ['cuadre.sql', 'ensayo.sql', 'importar.sql', 'reporte.json', 'reporte.md']);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
});

/* ============================================================================
   IM-10 — «Accesos»
   ============================================================================ */
describir('IM-10 Accesos', () => {
  prueba('la fila de ayuda y el rol inválido se saltan; con otra grafía gana la primera; todos quedan invitados', async () => {
    const v = volcado({ ventas: [], accesos: [
      ['dueno@al3d.test', 'direccion', 'El dueño de la hoja. Se puso solo.'],
      ['Pagos@AL3D.test ', 'Pagos', ''],
      ['Escribe aquí el correo de Google de cada persona y su rol.', '', ''],
      ['fab@al3d.test', 'jefe', ''],
      ['pagos@al3d.test', 'fabricacion', 'otra grafía'],
    ] });
    const plan = await planear({ volcado: v });
    const { db } = await importar(plan);
    try {
      igual(await sql(db, `select correo, area, estado, usuario_id from public.miembros order by correo`), [
        { correo: 'dueno@al3d.test', area: 'direccion', estado: 'invitado', usuario_id: null },
        { correo: 'pagos@al3d.test', area: 'pagos', estado: 'invitado', usuario_id: null },
      ]);
      cierto(plan.reporte.avisos.some(a => a.donde === 'Accesos' && a.que === 'pagos@al3d.test'), 'el repetido se reporta');
    } finally { await cerrar(db); }
  });
});

await resumen();
