// LA PANTALLA DE COBROS Y ABONOS contra la base de verdad (paso 5 de «la base manda», docs/BASE-MANDA.md): con la empresa en modo 'base',
// Pagos y Dirección cobran desde Control → «Cobros y abonos» (js/mod/pagos-supa.js). pruebas/pagos-supa.mjs prueba la pantalla con un doble
// de supabase-js; aquí, que las MISMAS llamadas que arma su capa pura (js/datos/pagos-supa.js: `plan`, `enviar`, `leerVentas`,
// `vistaPrevia`, `clasificar`) las acepta la base real (migraciones, RLS y funciones, en PGlite), y que el dinero queda como se prometió.
//
//   PA-01  el cobro: la liquidación ACUMULA una vez por op_id (el reintento de un envío sin respuesta no suma dos veces; el siguiente
//          formulario, con op_id nuevo, sí); un cobro de más se pregunta con peligro y la base lo acepta (saldo negativo)
//   PA-02  anticipo y liquidación corregidos con el valor TOTAL: mandarlo dos veces deja lo mismo
//   PA-03  el abono y el reparto FIFO: lo que la vista previa enseña es lo que se reparte; el reintento con el mismo op_id es «ya estaba» y
//          no agrega renglones; si otro teléfono abona en medio, la vista previa nueva ya no es la misma (la pantalla no manda nada)
//   PA-04  la venta sin cotización (`alta_venta`): el V-### del contador de la base, el IVA que manda la cuenta, la cita propuesta (Pagos) o
//          confirmada (Dirección), el reintento es la MISMA venta (mismo folio, una fila) y aparece en las ventas de la pantalla con su saldo
//   PA-05  Fabricación: la pantalla no le lee ni una venta y la base le niega cada llamada, como error SEGURO (nada se registró)
//   PA-06  Realtime: las tablas de las que sale el saldo (proyectos, ventas_dinero, abonos) están publicadas: otro teléfono se entera
//   PA-07  «Datos de la venta» (paso 6, solo Dirección): `corregir_venta` con solo lo que cambió; la base queda como dijo la pregunta (neto, saldo,
//          comisión, el IVA que pone la cuenta), con UNA línea de nivel dinero con lo de antes; mandarlo otra vez no escribe otra; si otro teléfono
//          corrige el mismo campo en medio, la revisión de antes de preguntar lo ve; el IVA a mano, solo en una venta LIQUIDADA
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, llamar, sql, una, conCopia, crearVenta } from '../comun/semilla.js';
import * as PS from '../../../js/datos/pagos-supa.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'modo_cambiar', { p_modo: 'base' });
  await crearVenta(db, { folio: 'V-210', sub: 10000, anti: 5000, cuenta: 'Constru BNT', iva: true, estatus: 'COBRANDO' });   // neto 11600, saldo 6600, comisión 1000
  await crearVenta(db, { folio: 'V-205', sub: 2000, anti: 2320, cuenta: 'Constru BNT', iva: true, estatus: 'LIQUIDADO' });    // saldo 0, comisión 200
  await crearVenta(db, { folio: 'V-208', sub: 5000, anti: 5000, cuenta: 'Elias BBVA', iva: false, estatus: 'LIQUIDADO' });    // saldo 0, comisión 500
  return db;
}, { limpiar: db => db.close() });

/* Lo que supabase-js le daría a la pantalla sobre una sesión de PGlite: `rpc` como /rpc/ de PostgREST y la única lectura que hace
   (`from('ventas_calculadas').select(columnas)`), con la RLS de esa cuenta. Un error de Postgres vuelve como lo devuelve PostgREST. */
function clienteDe(sesion) {
  return {
    llamadas: [],
    async rpc(n, a) {
      this.llamadas.push(n);
      try { return { data: await llamar(sesion, n, a), error: null }; }
      catch (e) { return { data: null, error: { code: String(e.codigo || e.code || 'XX000'), message: String(e.message || e) } }; }
    },
    from(tabla) {
      return {
        select: async cols => {
          try { return { data: (await sesion.query(`select ${cols} from public.${tabla}`)).map(r => ({ ...r })), error: null }; }
          catch (e) { return { data: null, error: { code: String(e.codigo || e.code || 'XX000'), message: String(e.message || e) } }; }
        },
      };
    },
  };
}
const quien = (db, u) => clienteDe(sesionDe(db, db.u[u], { confirmar: true }));
const ventasDe = async c => { const r = await PS.leerVentas(c); if (!r.ok) throw new Error(r.mensaje); return r.ventas; };
const ventaDe = async (c, folio) => (await ventasDe(c)).find(v => v.folio === folio);
const HOY = db => una(db, 'select interno.hoy_mx()::text as h').then(r => r.h);
const n = v => Number(v);
const ALTA_FAB = { nombre: 'X - Y', cuenta: 'Moni MPago', subtotal: '100', tel: '3312345678', entrega: 'recoleccion' };

describir('PA-01 el cobro, como lo manda la pantalla', () => {
  prueba('el reintento de un envío sin respuesta (mismo op_id) no suma dos veces; el formulario siguiente (op_id nuevo) sí', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'pag'), hoy = await HOY(db);
    let b = PS.borradorNuevo('cobro');
    b.campos = { proyecto: 'v210', monto: '1,500.50' };
    const v = await ventaDe(c, 'V-210');
    igual([v.saldo, v.liquidacion], [6600, 0], 'la pantalla lee el saldo de la vista de fórmulas');
    const p = PS.plan('cobro', b.campos, { opId: b.opId, hoy, venta: v, area: 'pagos' });
    igual([p.ok, p.args.p_liquidar, p.peligro], [true, false, false], 'un cobro parcial: sin LIQUIDADO y sin peligro');
    const r1 = await PS.enviar(c, p);
    const r2 = await PS.enviar(c, PS.plan('cobro', b.campos, { opId: b.opId, hoy, venta: v, area: 'pagos' }));
    igual([r1.ok, n(r1.data.liquidacion), n(r1.data.saldo)], [true, 1500.5, 5099.5]);
    igual(r2.data, r1.data, 'el reintento contesta lo mismo');
    igual(n((await ventaDe(c, 'V-210')).liquidacion), 1500.5, 'y la liquidación se sumó UNA vez');
    b = PS.despuesDeEnviar(b, p, r1);
    b.campos = { proyecto: 'v210', monto: '1,500.50' };
    const r3 = await PS.enviar(c, PS.plan('cobro', b.campos, { opId: b.opId, hoy, venta: await ventaDe(c, 'V-210'), area: 'pagos' }));
    igual([r3.ok, n(r3.data.liquidacion)], [true, 3001], 'otro cobro (otro formulario, otro op_id) sí suma');
    igual((await una(db, "select count(*)::int as n from public.bitacora where op_id like 'cobro:%'")).n, 2, 'dos líneas de dinero en la bitácora, no tres');
  }));
  prueba('un cobro de más: la pantalla lo pregunta con peligro y la base lo acepta (la vista lo deja en negativo); con el saldo en ceros, LIQUIDADO', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'dir'), hoy = await HOY(db);
    const v = await ventaDe(c, 'V-210');
    /* Como la pantalla: sin tocar la casilla, LIQUIDADO se sugiere (y se manda explícito) solo si el saldo queda en ceros. */
    const exacto = PS.plan('cobro', { proyecto: 'v210', monto: '6600', liquidar: PS.sugerirLiquidar(v, '6600') }, { opId: PS.nuevoOpId(), hoy, venta: v, area: 'direccion' });
    igual([exacto.args.p_liquidar, !!exacto.peligro], [true, false], 'el saldo queda en ceros: se sugiere LIQUIDADO, sin peligro');
    const demas = PS.plan('cobro', { proyecto: 'v210', monto: '7000', liquidar: PS.sugerirLiquidar(v, '7000') }, { opId: PS.nuevoOpId(), hoy, venta: v, area: 'direccion' });
    igual([demas.peligro, /de más por \$400\.00/.test(demas.texto)], [true, true]);
    const r = await PS.enviar(c, demas);
    igual([r.ok, n(r.data.saldo), r.data.estatus], [true, -400, 'LIQUIDADO']);
  }));
  prueba('NaN, Infinity o un monto vacío no salen de la pantalla, y si salieran la base tampoco los toma', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'pag'), v = await ventaDe(c, 'V-210');
    for (const m of ['NaN', 'Infinity', '', '1e9', '0']) igual(PS.plan('cobro', { proyecto: 'v210', monto: m }, { opId: 'pf-x', venta: v }).ok, false, 'monto ' + m);
    const r = await PS.enviar(c, { rpc: 'registrar_cobro', args: { p_proyecto: 'v210', p_monto: 'NaN', p_liquidar: false, p_op_id: 'pf-nan' } });
    igual([r.ok, r.incierto, r.codigo], [false, false, 'DATO_INVALIDO'], 'la base: seguro, nada se registró');
    igual(n((await ventaDe(c, 'V-210')).liquidacion), 0);
  }));
});

describir('PA-02 anticipo y liquidación con el valor TOTAL', () => {
  prueba('mandarlo dos veces deja lo mismo (no hace falta op_id), y la bitácora guarda el valor de antes', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'pag'), v = await ventaDe(c, 'V-210');
    const p = PS.plan('cobro', { modo: 'anticipo', proyecto: 'v210', monto: '6000' }, { opId: 'pf-a', venta: v, area: 'pagos' });
    const r1 = await PS.enviar(c, p), r2 = await PS.enviar(c, p);
    igual([r1.ok, r2.ok, (await ventaDe(c, 'V-210')).anticipo], [true, true, 6000]);
    const q = PS.plan('correccion', { que: 'liquidacion', proyecto: 'v210', monto: '250' }, { opId: 'pf-b', venta: v, area: 'pagos' });
    await PS.enviar(c, q); await PS.enviar(c, q);
    const w = await ventaDe(c, 'V-210');
    igual([w.liquidacion, w.saldo], [250, 11600 - 6000 - 250]);
    const r3 = await PS.enviar(c, q);
    igual(PS.resumen(q, r3.data, v), 'Liquidación de V-210: $250.00.');
  }));
});

describir('PA-03 el abono y el reparto FIFO', () => {
  prueba('lo que la vista previa enseña es lo que se reparte; el reintento (mismo op_id) es «ya estaba» y no agrega renglones', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'pag'), hoy = await HOY(db);
    const vp = await PS.vistaPrevia(c, '900');
    igual(vp.data.filas.map(f => [f.folio, n(f.abono)]), [['V-205', 200], ['V-208', 500], ['V-210', 200]], 'de la más antigua a la más nueva (por número de folio)');
    cierto(PS.mismoReparto(vp.data, (await PS.vistaPrevia(c, '900')).data), 'sin cambios en medio, la vista previa de antes de preguntar es la misma');
    const b = PS.borradorNuevo('reparto');
    const p = PS.plan('reparto', { monto: '900' }, { opId: b.opId, hoy, vistaPrevia: vp.data, area: 'pagos' });
    igual([p.ok, p.peligro], [true, true]);
    const r1 = await PS.enviar(c, p), r2 = await PS.enviar(c, p);
    igual([r1.ok, n(r1.data.repartido_total), r1.data.repartido.length], [true, 900, 3]);
    igual([r2.ok, r2.data.repetida, r2.data.pago_id], [true, true, r1.data.pago_id], 'el reintento contesta la primera respuesta');
    igual((await una(db, 'select count(*)::int as n from public.abonos where op_id = $1', [b.opId])).n, 3, 'tres renglones, no seis');
    cierto(/no se sumó otra vez/.test(PS.resumen(p, r2.data)), 'y la pantalla lo dice');
  }));
  prueba('si otro teléfono abona en medio, la vista previa nueva ya no es la misma (la pantalla enseña la nueva y no manda nada)', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'pag'), otro = quien(db, 'dir'), hoy = await HOY(db);
    const antes = (await PS.vistaPrevia(c, '900')).data;
    const a = PS.plan('abono', { proyecto: 'v205', monto: '200', nota: 'depósito BBVA' }, { opId: PS.nuevoOpId(), hoy, venta: await ventaDe(otro, 'V-205'), area: 'direccion' });
    igual((await PS.enviar(otro, a)).ok, true, 'el abono del otro teléfono entra');
    const ahora = (await PS.vistaPrevia(c, '900')).data;
    cierto(!PS.mismoReparto(antes, ahora), 'ya no es el mismo reparto');
    igual(ahora.filas.map(f => f.folio), ['V-208', 'V-210'], 'V-205 ya no debe nada');
  }));
});

describir('PA-04 la venta sin cotización (alta_venta)', () => {
  const ALTA = { nombre: 'Ana - Tacos El Güero', cuenta: 'Moni MPago', tipos: ['Rotulacion de vinil'], subtotal: '4,000', anticipo: '1000',
    tel: '33 1234 5678', entrega: 'instalacion', dir: 'Av. Vallarta 100', maps: 'https://maps.app.goo.gl/abc', cita: '2027-01-15' };
  prueba('Pagos: el V-### del contador de la base, el IVA por la cuenta, la cita PROPUESTA; el reintento es la misma venta', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'pag'), hoy = await HOY(db);
    const b = PS.borradorNuevo('venta');
    const p = PS.plan('venta', ALTA, { opId: b.opId, hoy, area: 'pagos', baseManda: true, ahora: Date.now() });
    const r1 = await PS.enviar(c, p);
    igual([r1.ok, r1.data.folio_hoja, r1.data.proyecto_id], [true, 'V-211', PS.idDeAlta(b.opId)], 'el siguiente después del V-210');
    const r2 = await PS.enviar(c, PS.plan('venta', ALTA, { opId: b.opId, hoy, area: 'pagos', baseManda: true, ahora: Date.now() + 5000 }));
    igual([r2.ok, r2.data.ya_existia, r2.data.folio_hoja], [true, true, 'V-211'], 'el reintento: «ya existía», el mismo folio');
    igual((await una(db, "select count(*)::int as n from public.proyectos where nombre = 'Ana - Tacos El Güero'")).n, 1, 'una sola venta');
    cierto(/Ya estaba registrada/.test(PS.resumen(p, r2.data)), 'y la pantalla lo dice');
    const x = await una(db, `select p.fuente, p.etapa, p.iva, p.estatus, p.tel, p.entrega, p.dir_texto, p.maps_url, p.tipo_trabajo, p.fecha_anticipo::text as fa,
      d.subtotal::float8 as sub, d.anticipo::float8 as anti, d.cuenta, i.estado as cita, i.fecha::text as fcita, p.sellos ? 'tel' as sello_tel
      from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id left join public.instalaciones i on i.proyecto_id = p.id where p.folio_hoja = 'V-211'`);
    igual([x.fuente, x.etapa, x.iva, x.estatus, x.tel, x.entrega, x.dir_texto, x.maps_url, x.tipo_trabajo, x.fa, x.sub, x.anti, x.cuenta, x.cita, x.fcita, x.sello_tel],
      ['manual', 'ganado', true, 'FABRICACION', '33 1234 5678', 'instalacion', 'Av. Vallarta 100', 'https://maps.app.goo.gl/abc', ['Rotulacion de vinil'], hoy, 4000, 1000,
       'Moni MPago', 'propuesta', '2027-01-15', true]);
    const v = await ventaDe(c, 'V-211');
    igual([v.neto, v.anticipo, v.saldo, v.comision], [4640, 1000, 3640, 400], 'y aparece en las ventas de la pantalla con su saldo (neto = subtotal × 1.16, como dijo la pregunta)');
    cierto(/neto \$4,640\.00/.test(p.texto), 'la pregunta dijo el mismo neto que calcula la base');
  }));
  prueba('Dirección con Elias BBVA: sin IVA y la cita CONFIRMADA; el contador sigue (V-211, V-212)', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'dir'), hoy = await HOY(db);
    const r1 = await PS.enviar(c, PS.plan('venta', ALTA, { opId: PS.nuevoOpId(), hoy, area: 'direccion', baseManda: true, ahora: Date.now() }));
    const r2 = await PS.enviar(c, PS.plan('venta', { ...ALTA, nombre: 'Luis - Farmacia', cuenta: 'Elias BBVA' }, { opId: PS.nuevoOpId(), hoy, area: 'direccion', baseManda: true, ahora: Date.now() }));
    igual([r1.data.folio_hoja, r2.data.folio_hoja], ['V-211', 'V-212']);
    const x = await una(db, "select p.iva, i.estado from public.proyectos p join public.instalaciones i on i.proyecto_id = p.id where p.folio_hoja = 'V-212'");
    igual([x.iva, x.estado], [false, 'confirmada']);
    igual((await ventaDe(c, 'V-212')).neto, 4000, 'sin IVA, el neto es el subtotal');
  }));
  prueba('lo que la pantalla deja salir, la base lo acepta: sin cita, sin tipos, recolección, anticipo vacío', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'pag'), hoy = await HOY(db);
    const p = PS.plan('venta', { nombre: 'Rosa - Estética', cuenta: 'Rul HSBC', subtotal: '850.5', tel: '+52 33 9876 5432', entrega: 'recoleccion', estatus: 'COBRANDO' },
      { opId: PS.nuevoOpId(), hoy, area: 'pagos', baseManda: true, ahora: Date.now() });
    const r = await PS.enviar(c, p);
    igual([r.ok, r.data.folio_hoja], [true, 'V-211']);
    const x = await una(db, "select p.entrega, p.dir_texto, p.estatus, d.anticipo::float8 as anti, (select count(*)::int from public.instalaciones i where i.proyecto_id = p.id) as citas from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id where p.folio_hoja = 'V-211'");
    igual([x.entrega, x.dir_texto, x.estatus, x.anti, x.citas], ['recoleccion', '', 'COBRANDO', 0, 0]);
  }));
});

describir('PA-05 Fabricación no ve ni mueve dinero', () => {
  prueba('la pantalla no le lee ni una venta, y la base le niega cada llamada como error SEGURO (nada se registró)', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'fab'), hoy = await HOY(db);
    igual(await ventasDe(c), [], 'ventas_calculadas: cero filas (RLS)');
    const v = { id: 'v210', folio: 'V-210', nombre: 'x', saldo: 6600, liquidacion: 0, restante: 1000, anticipo: 5000 };
    const planes = [
      PS.plan('cobro', { proyecto: 'v210', monto: '100' }, { opId: 'pf-f1', hoy, venta: v }),
      PS.plan('abono', { proyecto: 'v210', monto: '100' }, { opId: 'pf-f2', hoy, venta: v }),
      PS.plan('cobro', { modo: 'anticipo', proyecto: 'v210', monto: '1' }, { opId: 'pf-f3', venta: v }),
      PS.plan('venta', ALTA_FAB, { opId: 'pf-f4', hoy, baseManda: true, ahora: Date.now() }),
      PS.plan('datos', { proyecto: 'v210', subtotal: '1' }, { opId: 'pf-f5', hoy, venta: v, baseManda: true }),
    ];
    for (const p of planes) {
      cierto(p.ok, 'la capa pura arma el plan (sin área no lo frena: la base decide)');
      const r = await PS.enviar(c, p);
      igual([r.ok, r.incierto], [false, false], p.rpc + ': seguro');
      cierto(['ROL_SIN_PERMISO', 'RECHAZADO'].includes(r.codigo), p.rpc + ': ' + r.codigo);
      cierto(/No se registró nada\.$/.test(r.mensaje), p.rpc + ': lo dice');
    }
    igual((await PS.vistaPrevia(c, '100')).codigo, 'ROL_SIN_PERMISO', 'ni la vista previa del reparto');
    const d = await una(db, "select liquidacion::float8 as l, anticipo::float8 as a from public.ventas_dinero where proyecto_id = 'v210'");
    igual([d.l, d.a, (await una(db, 'select count(*)::int as n from public.abonos')).n, (await una(db, "select count(*)::int as n from public.proyectos where fuente = 'manual'")).n], [0, 5000, 0, 0]);
  }));
});
describir('PA-07 «Datos de la venta»: Dirección corrige una venta (paso 6)', () => {
  const oDir = async (db, v, x = {}) => ({ opId: PS.nuevoOpId(), hoy: await HOY(db), venta: v, area: 'direccion', baseManda: true, ...x });
  const lineas = db => sql(db, "select nivel, titulo, detalle, antes, despues from public.bitacora where entidad = 'venta' and entidad_id = 'v210' and accion = 'cambio' order by id");
  prueba('nombre, subtotal y cuenta: la base queda como dijo la pregunta, con UNA línea de dinero con lo de antes; otra vez, lo mismo y ninguna línea más', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'dir');
    const v = await ventaDe(c, 'V-210');
    igual([v.nombre, v.subtotal, v.cuenta, v.iva, v.fechaLiquidacion, v.pct], ['Proyecto V-210', 10000, 'Constru BNT', true, '', null], 'la pantalla lee lo que corrige');
    const campos = { proyecto: 'v210', nombre: 'Letras Farmacia Centro', subtotal: '12,000', cuenta: 'Elias BBVA', estatus: 'COBRANDO' };
    const p = PS.plan('datos', campos, await oDir(db, v));
    igual(p.args.p_cambios, { nombre: 'Letras Farmacia Centro', subtotal: 12000, cuenta: 'Elias BBVA' }, 'solo lo que cambió (el estatus es el mismo)');
    cierto(/IVA: con IVA → sin IVA \(lo pone la cuenta\)/.test(p.texto) && /neto \$12,000\.00 \(era \$11,600\.00\), saldo \$7,000\.00 \(era \$6,600\.00\), comisión \$1,200\.00 \(era \$1,000\.00\)/.test(p.texto), p.texto);
    const r1 = await PS.enviar(c, p);
    igual([r1.ok, [...r1.data.escritos].sort()], [true, ['cuenta', 'nombre', 'subtotal']]);
    const w = await ventaDe(c, 'V-210');
    igual([w.nombre, w.subtotal, w.cuenta, w.iva, w.neto, w.saldo, w.comision], ['Letras Farmacia Centro', 12000, 'Elias BBVA', false, 12000, 7000, 1200], 'lo que dijo la pregunta');
    const b = await lineas(db);
    igual(b.length, 1, 'una línea');
    igual([b[0].nivel, b[0].titulo, b[0].antes, b[0].despues], ['dinero', 'Se corrigió V-210',
      { nombre: 'Proyecto V-210', subtotal: 10000, cuenta: 'Constru BNT', iva: true }, { nombre: 'Letras Farmacia Centro', subtotal: 12000, cuenta: 'Elias BBVA', iva: false }],
      'nivel dinero, con lo de antes y lo de después de cada campo que cambió (el IVA también)');
    cierto(/^Venta V-210 corregida: .*cuenta Elias BBVA.*subtotal \$12,000\.00.*sin IVA\. Queda en la bitácora de la base con lo de antes\.$/.test(PS.resumen(p, r1.data, v)), PS.resumen(p, r1.data, v));
    const r2 = await PS.enviar(c, p);
    igual([r2.ok, (await lineas(db)).length, (await ventaDe(c, 'V-210')).subtotal], [true, 1, 12000], 'el reintento: lo mismo, sin otra línea');
    igual(PS.correccionAlDia(p, PS.plan('datos', campos, await oDir(db, w))), 'ya_estaba', 'y la revisión de antes de preguntar dice que ya está');
  }));
  prueba('si otro teléfono corrige el MISMO campo en medio, la revisión de antes de preguntar lo ve (y lo del otro se queda); otro campo, no estorba', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'dir'), otro = quien(db, 'pag');
    const v = await ventaDe(c, 'V-210');
    const campos = { proyecto: 'v210', subtotal: '12000' };
    const p = PS.plan('datos', campos, await oDir(db, v));
    igual((await PS.enviar(otro, { rpc: 'corregir_venta', args: { p_proyecto: 'v210', p_cambios: { nombre: 'Otro nombre' } } })).ok, true);
    igual(PS.correccionAlDia(p, PS.plan('datos', campos, await oDir(db, await ventaDe(c, 'V-210')))), 'seguir', 'el nombre cambió: no estorba (no se manda)');
    /* Pagos lo puede por la base (la matriz de 0017 se lo deja): «solo Dirección» es de la pantalla. */
    igual((await PS.enviar(otro, { rpc: 'corregir_venta', args: { p_proyecto: 'v210', p_cambios: { subtotal: 11000 } } })).ok, true);
    igual(PS.correccionAlDia(p, PS.plan('datos', campos, await oDir(db, await ventaDe(c, 'V-210')))), 'cambio', 'el subtotal cambió en medio: no se manda');
    igual((await ventaDe(c, 'V-210')).subtotal, 11000, 'y lo del otro se queda');
  }));
  prueba('el IVA a mano: en una venta LIQUIDADA la base lo acepta (y la pregunta avisa del cobro de más); en una que no, ni sale (y la base lo rechaza: nada escrito)', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'dir');
    const v = await ventaDe(c, 'V-205');
    const p = PS.plan('datos', { proyecto: 'v205', iva: 'no' }, await oDir(db, v));
    cierto(p.ok && /cobrada de más por \$320\.00/.test(p.texto), p.texto || JSON.stringify(p.errores));
    igual((await PS.enviar(c, p)).ok, true);
    const w = await ventaDe(c, 'V-205');
    igual([w.iva, w.neto, w.saldo], [false, 2000, -320]);
    igual(Object.keys(PS.plan('datos', { proyecto: 'v210', iva: 'no' }, await oDir(db, await ventaDe(c, 'V-210'))).errores), ['iva'], 'la pantalla no lo manda');
    const r = await PS.enviar(c, { rpc: 'corregir_venta', args: { p_proyecto: 'v210', p_cambios: { iva: false } } });
    igual([r.ok, r.incierto, r.codigo], [false, false, 'RECHAZADO'], 'y la base tampoco lo deja: seguro, nada se registró');
    igual((await ventaDe(c, 'V-210')).iva, true);
  }));
  prueba('el estatus, la fecha de liquidación y el % pactado', async () => conCopia(plantilla, async db => {
    const c = quien(db, 'dir'), hoy = await HOY(db);
    const p = PS.plan('datos', { proyecto: 'v210', estatus: 'LIQUIDADO', fliq: hoy, pct: '12.5' }, await oDir(db, await ventaDe(c, 'V-210')));
    igual(p.args.p_cambios, { estatus: 'LIQUIDADO', fecha_liquidacion: hoy, pct_comision: 12.5 });
    cierto(/queda LIQUIDADA con un saldo de \$6,600\.00/.test(p.texto), 'avisa del saldo');
    igual((await PS.enviar(c, p)).ok, true);
    const w = await ventaDe(c, 'V-210');
    igual([w.estatus, w.fechaLiquidacion, w.pct], ['LIQUIDADO', hoy, 12.5]);
    igual(PS.plan('datos', { proyecto: 'v210', ...PS.valoresDeLaVenta(w) }, await oDir(db, w)).sinCambios, true, 'lo que la pantalla lee de vuelta es lo que se mandó');
  }));
});

describir('PA-06 Realtime: otro teléfono se entera del saldo', () => {
  prueba('proyectos, ventas_dinero y abonos están en la publicación supabase_realtime (la pantalla relee al aviso)', async () => {
    const db = await plantilla();
    const filas = await sql(db, "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by tablename");
    const t = filas.map(r => r.tablename);
    for (const x of ['proyectos', 'ventas_dinero', 'abonos', 'instalaciones']) cierto(t.includes(x), x + ' publicada');
  });
});

await resumen();
