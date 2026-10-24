// Los GASTOS en la nube (0020, decidido por Elías el 2026-10-24: toda la información de la plataforma vive en Supabase) y la pestaña
// «Gastos» de la hoja en la copia diaria (scripts/importador, función `importar-diario`). Hojas de mentiras: ni un dato real.
//
//   GA-01  quién lee: Dirección y Pagos de su empresa; Fabricación, la persona ajena, la baja y otra empresa, nada; anon, ni la tabla
//   GA-02  nadie escribe desde la app y nadie borra (ni el dueño); M-6: sin estadísticas en texto y fecha; la auditoría sigue limpia
//   GA-03  la base no acepta lo que la hoja tampoco (las reglas de gastoValidar_ del .gs)
//   GA-04  la copia trae la pestaña: altas, la segunda vez nada, lo corregido en la hoja pisa, lo que sale de la hoja queda con lápida
//          (y la pierde si vuelve), sin la pestaña no se toca nada, y lo que no entra se cuenta sin frenar la copia
//   GA-05  la copia diaria entera (`copiar`): con gastos que no entran la copia se aplica y cuadra; el resumen dice cuántos y en qué
//          filas, nunca qué decían
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, como, sql, una, conCopia } from '../comun/semilla.js';
import { volcado, dia } from '../comun/hoja-de-mentiras.js';
import { planear } from '../../../scripts/importador/plan.mjs';
import { sqlDeImportacion } from '../../../scripts/importador/sql.mjs';
import { copiar } from '../../functions/importar-diario/copia.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  return db;
}, { limpiar: db => db.close() });

/* La pestaña como la arma gastosPestana_ del .gs (GASTO_COLUMNAS, en su orden). */
const ENCABEZADO = ['ID', 'Fecha', 'Concepto', 'Categoría', 'Monto', 'Cuenta', 'Folio del proyecto', 'Registró', 'Registrado el', 'Anulado', 'Anuló', 'Anulado el', 'Subió'];
const cuando = iso => ({ $fecha: iso.slice(0, 10), $hora: iso.slice(11, 16), $ms: Date.parse(iso) });
const gasto = (id, o = {}) => [id, o.fecha ?? dia('2026-10-23'), o.concepto ?? 'Lámina de acrílico 3 mm', o.categoria ?? 'Material', o.monto ?? 1500,
  o.cuenta ?? 'Elias BBVA', o.folio ?? '', o.registro ?? 'Ana · pagos · K7QM', o.registrado ?? cuando('2026-10-23T17:05:00.000Z'),
  o.anulado ?? '', o.anulo ?? '', o.anuladoEn ?? '', o.subio ?? 'pag@al3d.test'];
function conGastos(renglones) {
  const v = volcado({ ventas: [] });
  if (renglones) v.pestanas['Gastos'] = [ENCABEZADO, ...renglones];
  return v;
}
/** Una corrida de la copia con el SQL de importar.sql (cada lote en su transacción); devuelve lo que anotó en _imp_cambios. */
async function copia(db, v) {
  const plan = await planear({ volcado: v });
  const r = await sql(db, sqlDeImportacion(plan));
  return { plan, cambios: r.filter(x => x.tabla === 'gastos').map(x => [x.accion, x.filas]) };
}
const fila = (db, id) => una(db, `select id, fecha::text, concepto, categoria, monto::text, cuenta, folio, anulado, anulo, (anulado_en is not null) as con_hora,
                                         (deleted_at is not null) as con_lapida, fila_hoja, procedencia from public.gastos where empresa_id = 'al3d' and id = $1`, [id]);
const MANO = ['hoja-mano1', '24/10/2026', 'Gasolina de la camioneta', 'transporte y Gasolina', '$1,234.50', 'Efectivo', '', '', '', '', '', '', ''];

describir('GA-01 quién lee los gastos', () => {
  prueba('Dirección y Pagos de al3d ven los suyos; Fabricación, la ajena, la baja y otra empresa no ven nada; anon ni la tabla', async () => conCopia(plantilla, async db => {
    await copia(db, conGastos([gasto('gas-a1'), gasto('gas-a2', { monto: 300 })]));
    await sql(db, `insert into public.gastos (empresa_id, id, fecha, concepto, categoria, monto) values ('otra', 'gas-o1', '2026-10-23', 'De otra', 'Otros', 10)`);
    const ve = async quien => (await sesionDe(db, db.u[quien]).query(`select count(*)::int as n, coalesce(sum(monto), 0)::text as s from public.gastos`))[0];
    igual([await ve('dir'), await ve('pag')], [{ n: 2, s: '1800.00' }, { n: 2, s: '1800.00' }], 'los que ven el dinero');
    for (const q of ['fab', 'ext', 'baja']) igual((await ve(q)).n, 0, q);
    igual((await ve('otra')).n, 1, 'Dirección de otra empresa solo ve el suyo');
    await esperarError(como(db, { rol: 'anon' }).query(`select count(*) from public.gastos`), '42501', 'anon: permission denied');
  }));
});

describir('GA-02 nadie escribe desde la app y nadie borra', () => {
  prueba('authenticated no inserta, no cambia ni borra; service_role no borra; ni el dueño borra (sin_borrar); la auditoría sigue limpia', async () => conCopia(plantilla, async db => {
    await copia(db, conGastos([gasto('gas-a1')]));
    const dir = sesionDe(db, db.u.dir, { confirmar: true });
    await esperarError(dir.query(`insert into public.gastos (empresa_id, id, fecha, concepto, categoria, monto) values ('al3d', 'gas-x', '2026-10-23', 'x', 'Otros', 1)`), '42501', 'Dirección no inserta');
    await esperarError(dir.query(`update public.gastos set monto = 1`), '42501', 'Dirección no cambia');
    await esperarError(dir.query(`delete from public.gastos`), '42501', 'Dirección no borra');
    await esperarError(como(db, { rol: 'service_role', confirmar: true }).query(`delete from public.gastos`), '42501', 'service_role no tiene DELETE');
    await esperarError(sql(db, `delete from public.gastos`), /no se borran/, 'ni el dueño (sin_borrar)');
    igual((await una(db, `select count(*)::int as n from public.gastos`)).n, 1);
    igual((await una(db, `select interno.auditoria() as p`)).p, [], 'la auditoría de 0011 sigue limpia con 0020');
    const est = await sql(db, `select a.attname, a.attstattarget::int as e from pg_attribute a where a.attrelid = 'public.gastos'::regclass and a.attnum > 0 and not a.attisdropped
                                  and a.atttypid in ('text'::regtype, 'date'::regtype) order by 1`);
    igual(est.filter(x => x.e !== 0).map(x => x.attname), [], 'M-6: ninguna columna de texto o fecha con estadísticas');
    igual((await una(db, `select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'gastos'`)).n, 0, 'no va por Realtime');
  }));
});

describir('GA-03 la base no acepta lo que la hoja tampoco', () => {
  prueba('monto cero o de más de diez millones, categoría fuera de la lista, sin concepto, un id raro o «quién anuló» sin anular', async () => conCopia(plantilla, async db => {
    const meter = (cols, vals) => sql(db, `insert into public.gastos (empresa_id, id, fecha, concepto, categoria, monto${cols}) values ('al3d', ${vals})`);
    await esperarError(meter('', `'g1', '2026-10-23', 'x', 'Otros', 0`), /gastos_monto_check|check/i, 'monto 0');
    await esperarError(meter('', `'g2', '2026-10-23', 'x', 'Otros', 10000000.01`), /check/i, 'más de diez millones');
    await esperarError(meter('', `'g3', '2026-10-23', 'x', 'Gasolina', 5`), /check/i, 'una categoría que no es de la lista');
    await esperarError(meter('', `'g4', '2026-10-23', '   ', 'Otros', 5`), /check/i, 'sin concepto');
    await esperarError(meter('', `'gasto 5', '2026-10-23', 'x', 'Otros', 5`), /check/i, 'un id con espacios');
    await esperarError(meter('', `'g6', '1999-12-31', 'x', 'Otros', 5`), /check/i, 'un día fuera de 2000–2100');
    await esperarError(meter(', anulo', `'g7', '2026-10-23', 'x', 'Otros', 5, 'Elías'`), /gastos_anulacion/, 'quién anuló, sin anular');
    await meter(', anulado, anulo', `'g8', '2026-10-23', 'x', 'Otros', 10000000, true, 'Elías'`);
    igual((await una(db, `select count(*)::int as n from public.gastos`)).n, 1, 'el bueno sí entra');
  }));
});

describir('GA-04 la copia trae la pestaña «Gastos»', () => {
  prueba('altas; lo tecleado a mano se lee como en el teléfono; la segunda copia no cambia nada', async () => conCopia(plantilla, async db => {
    const v = conGastos([gasto('gas-a1', { folio: 'V-042' }), MANO]);
    const p = await copia(db, v);
    igual(p.cambios, [['alta', 2]]);
    igual([p.plan.reporte.rechazos, p.plan.reporte.conflictos], [[], []], 'nada se rechaza ni choca');
    const a = await fila(db, 'gas-a1');
    igual([a.fecha, a.concepto, a.categoria, a.monto, a.cuenta, a.folio, a.anulado, a.fila_hoja], ['2026-10-23', 'Lámina de acrílico 3 mm', 'Material', '1500.00', 'Elias BBVA', 'V-042', false, 2]);
    const m = await fila(db, 'hoja-mano1');
    igual([m.fecha, m.categoria, m.monto, m.cuenta, m.procedencia], ['2026-10-24', 'Transporte y gasolina', '1234.50', 'Efectivo', { categoria_hoja: 'transporte y Gasolina' }],
      'la fecha «24/10/2026», la categoría sin importar mayúsculas, el monto con «$» y comas, y la cuenta como venga');
    igual((await copia(db, v)).cambios, [], 'la segunda vez, nada');
  }));
  prueba('lo que se corrige o se anula en la hoja pisa lo de la nube', async () => conCopia(plantilla, async db => {
    await copia(db, conGastos([gasto('gas-a1'), gasto('gas-a2')]));
    const p = await copia(db, conGastos([gasto('gas-a1', { monto: 1450.5, categoria: 'Herramienta' }),
      gasto('gas-a2', { anulado: 'Sí', anulo: 'Elías · dirección', anuladoEn: cuando('2026-10-24T15:00:00.000Z') })]));
    igual(p.cambios, [['cambio', 2]]);
    const [a, b] = [await fila(db, 'gas-a1'), await fila(db, 'gas-a2')];
    igual([a.monto, a.categoria], ['1450.50', 'Herramienta']);
    igual([b.anulado, b.anulo, b.con_hora], [true, 'Elías · dirección', true]);
  }));
  prueba('un renglón que sale de la hoja queda con lápida (no se borra) y la pierde si vuelve', async () => conCopia(plantilla, async db => {
    await copia(db, conGastos([gasto('gas-a1'), gasto('gas-a2')]));
    const sale = await copia(db, conGastos([gasto('gas-a1')]));
    igual(sale.cambios, [['cambio: ya no está en la hoja', 1]]);
    igual([(await fila(db, 'gas-a1')).con_lapida, (await fila(db, 'gas-a2')).con_lapida], [false, true]);
    igual((await sesionDe(db, db.u.dir).query(`select count(*)::int as n from public.gastos`))[0].n, 2, 'sigue en la base (Dirección la ve, con su lápida)');
    igual((await copia(db, conGastos([gasto('gas-a1')]))).cambios, [], 'la lápida no se vuelve a poner');
    igual((await copia(db, conGastos([gasto('gas-a1'), gasto('gas-a2')]))).cambios, [['cambio', 1]], 'vuelve');
    igual((await fila(db, 'gas-a2')).con_lapida, false);
  }));
  prueba('sin la pestaña en el volcado, o sin su columna «ID», no se toca ningún gasto de la base', async () => conCopia(plantilla, async db => {
    await copia(db, conGastos([gasto('gas-a1')]));
    const sin = await copia(db, conGastos(null));
    igual([sin.plan.gastos_en_hoja, sin.cambios], [null, []], 'un copia-diaria.gs de antes del 2026-10-24 no manda la pestaña');
    const v = conGastos(null);
    v.pestanas['Gastos'] = [['Fecha', 'Concepto', 'Monto'], [dia('2026-10-23'), 'x', 5]];
    const sinId = await copia(db, v);
    igual([sinId.plan.gastos_en_hoja, sinId.cambios, sinId.plan.reporte.no_importado.map(x => [x.que, x.n])], [null, [], [['Gastos', 1]]]);
    igual((await fila(db, 'gas-a1')).con_lapida, false);
  }));
  prueba('lo que la base no acepta se cuenta con su fila y su motivo, sin frenar lo demás y sin ponerle lápida', async () => conCopia(plantilla, async db => {
    await copia(db, conGastos([gasto('gas-a1'), gasto('gas-a2')]));
    const p = await copia(db, conGastos([
      gasto('gas-a1'),
      gasto('gas-a2', { monto: 0 }),                                     // fila 3: alguien le borró el monto; NO es que haya salido de la hoja
      ['', '', 'Pago a proveedor', '', 800, '', '', '', '', '', '', '', ''],   // fila 4: sin ID (el puente se lo pone al pedir los gastos)
      ['', '', '', '', '', '', '', '', '', '', '', '', ''],              // fila 5: vacía
      gasto('gas-b1', { fecha: 'ayer' }),                                // fila 6
      gasto('gas-b2', { concepto: '  ' }),                               // fila 7
      gasto('gas b3'),                                                   // fila 8
      gasto('gas-b4'), gasto('gas-b4', { monto: 9 }),                    // filas 9 y 10: el mismo id dos veces
      gasto('gas-b5'),                                                   // fila 11: bueno
    ]));
    igual([p.plan.reporte.rechazos, p.plan.reporte.conflictos], [[], []], 'ni rechazos ni conflictos: la copia de las ventas no se frena');
    const ni = p.plan.reporte.no_importado.find(x => x.que === 'Gastos');
    igual([ni.n, ni.filas, ni.motivos], [7, [3, 4, 6, 7, 8, 9, 10],
      { monto_no_sirve: 1, sin_id: 1, fecha_no_se_entiende: 1, sin_concepto: 1, id_no_sirve: 1, id_repetido: 2 }]);
    igual(p.cambios, [['alta', 1]], 'entra solo gas-b5');
    igual([(await fila(db, 'gas-a2')).monto, (await fila(db, 'gas-a2')).con_lapida], ['1500.00', false], 'gas-a2 se queda como estaba, sin lápida');
  }));
});

describir('GA-05 la copia diaria entera, con gastos', () => {
  prueba('se aplica y cuadra aunque haya gastos que no entran; el resumen dice cuántos y en qué filas, sin conceptos ni montos', async () => conCopia(plantilla, async db => {
    const base = { transaccion: fn => db.transaction(tx => fn({ ejecutar: t => tx.exec(t), consultar: async (t, p) => (await tx.query(t, p)).rows })) };
    const v = conGastos([gasto('gas-a1', { concepto: 'Acrílico del Güero', monto: 4321.09 }), gasto('gas-a2', { monto: 0 })]);
    const plan = await planear({ volcado: v });
    let t = 0;
    const r = await copiar({ base, plan, volcado: v, ahora: () => (t += 5), inicio: 0 });
    igual([r.aplicado, r.cuadra, r.rechazos, r.conflictos], [true, true, 0, 0]);
    igual(r.resumen.plan.gastos, 1);
    igual(r.resumen.volcado.pestanas.Gastos, 2, 'la pestaña se cuenta por renglones');
    igual(r.resumen.cambios.filter(c => c.tabla === 'gastos'), [{ tabla: 'gastos', accion: 'alta', n: 1 }]);
    igual(r.resumen.no_importado.find(x => x.que === 'Gastos'), { que: 'Gastos', n: 1, filas: [3], motivos: { monto_no_sirve: 1 } });
    const texto = JSON.stringify(r.resumen);
    igual([texto.includes('Güero'), texto.includes('4321'), texto.includes('gas-a1')], [false, false, false], 'ni el concepto, ni el monto, ni el id');
    igual((await una(db, `select count(*)::int as n from public.gastos`)).n, 1);
  }));
});

await resumen();
