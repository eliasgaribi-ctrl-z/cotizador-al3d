// El TALÓN de la hoja y la subida única (0021, 2026-10-24) — caso NO-25.
//
// La copia diaria de la hoja arma, por cada fila de «Autorizaciones» que no trae teléfono, un TALÓN de su cotización
// (`procedencia.stub = 'Autorizaciones'`: proyecto, cliente y subtotal, sin partidas). La primera subida de verdad (el aparato 5D93 de
// Elías, 2026-10-24) encontró que `subida_unica` no lo llenaba: las 5 cotizaciones AUTORIZADAS salían «conflicto». Se prueba:
//   · Dirección llena el talón con la cotización del aparato; el talón queda en procedencia.talon; el estado y la autorización no cambian;
//     la segunda subida es «ya_estaba»;
//   · Pagos y Fabricación no lo llenan (el talón no tiene autor: lo ajeno no se compara) y el talón queda igual;
//   · la copia de la hoja de la madrugada siguiente (scripts/importador/sql.mjs) ya no la vuelve talón, y un talón sigue al día con otro talón.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { sesionDe, llamar, una, sql, conCopia } from '../comun/semilla.js';
import { crearBaseNotario } from '../comun/notario.js';
import { sqlDeImportacion } from '../../../scripts/importador/sql.mjs';

const plantilla = dato(crearBaseNotario, { limpiar: db => db.close() });
const FG = 'COT-0058@5D93';
const subir = (db, quien, lote) => llamar(sesionDe(db, db.u[quien], { confirmar: true }), 'subida_unica', { p_lote: lote });
/* El talón como lo escribe la copia de la hoja (plan.mjs, sección 12): el mismo SQL, con un plan hecho a mano. */
const talon = (sub = 9500, fila = 7) => ({ empresa_id: 'al3d', folio_global: FG, folio: 'COT-0058', disp: '5D93', estado: 'autorizada',
  datos: { proy: 'Letras Tacos', cliente: 'Juan', subtotal: sub, huellaAuth: 'c|1:x', items: [] }, hitos: {}, procedencia: { stub: 'Autorizaciones', fila_hoja: fila } });
const copiaDeLaHoja = (db, fila) => sql(db, sqlDeImportacion({ empresa: 'al3d', tablas: { cotizaciones: [fila] }, contadores: [], gastos_en_hoja: null }));
const delAparato = (extra = {}) => ({ folio: 'COT-0058', disp: '5D93', proy: 'Letras Tacos', cliente: 'Juan', tel: '33 1234 5678', neto: 11020,
  items: [{ id: 1, tipo: 'Letras 3D', pu: 9500 }], sello: { folio: FG, codigo: 'ABCD-1234-EF56' }, ...extra });
const fila = db => una(db, `select estado, datos, hitos, procedencia, creado_por::text as por from public.cotizaciones where folio_global = '${FG}'`);

describir('NO-25 el talón de la hoja y la cotización del aparato que emitió el folio', () => {
  prueba('Dirección lo llena: datos del aparato, el talón entero en procedencia.talon, mismo estado; la segunda vez «ya_estaba»', () => conCopia(plantilla, async db => {
    await copiaDeLaHoja(db, talon());
    const r = await subir(db, 'dir', { disp: '5D93', cotizaciones: [delAparato()], hitos: { 'COT-0058': { pdf: 1 } } });
    igual([r.ok, r.acuse, r.resumen], [true, [{ tipo: 'cotizacion', id: FG, estado: 'creada', talon: true }], { creadas: 1, ya_estaban: 0, conflictos: 0, rechazadas: 0 }]);
    const c = await fila(db);
    igual([c.estado, c.datos.items.length, c.datos.neto, c.hitos.pdf, c.por], ['autorizada', 1, 11020, 1, db.u.dir.uid]);
    igual([c.procedencia.stub, c.procedencia.talon.stub, c.procedencia.talon.fila_hoja, c.procedencia.telefonos], [undefined, 'Autorizaciones', 7, ['5D93']]);
    igual(c.procedencia.sello_local, { folio: FG, codigo: 'ABCD-1234-EF56' });
    igual((await subir(db, 'dir', { disp: '5D93', cotizaciones: [delAparato()] })).acuse.map(a => a.estado), ['ya_estaba']);
  }));
  prueba('Pagos y Fabricación no lo llenan, y el talón se queda igual', () => conCopia(plantilla, async db => {
    await copiaDeLaHoja(db, talon());
    for (const q of ['pag', 'fab']) {
      const r = await subir(db, q, { disp: '5D93', cotizaciones: [delAparato()] });
      igual([r.acuse[0].estado, r.acuse[0].motivo], ['rechazada', 'ROL_SIN_PERMISO'], q);
    }
    const c = await fila(db);
    igual([c.procedencia.stub, c.datos.items.length, c.por], ['Autorizaciones', 0, null]);
  }));
  prueba('la copia de la madrugada siguiente ya no la vuelve talón; un talón sí sigue al día con la hoja', () => conCopia(plantilla, async db => {
    await copiaDeLaHoja(db, talon());
    const otraFila = await copiaDeLaHoja(db, talon(9900, 8));
    cierto(JSON.stringify(otraFila).includes('"cotizaciones"'), 'mientras es talón, la hoja lo actualiza');
    igual((await fila(db)).datos.subtotal, 9900);
    await subir(db, 'dir', { disp: '5D93', cotizaciones: [delAparato()] });
    const despues = await copiaDeLaHoja(db, talon(9900, 9));
    cierto(!JSON.stringify(despues).includes('"cotizaciones"'), 'la copia no toca la cotización del aparato');
    const c = await fila(db);
    igual([c.datos.items.length, c.datos.neto, c.procedencia.stub, c.procedencia.talon.fila_hoja], [1, 11020, undefined, 8]);
  }));
});

await resumen();
