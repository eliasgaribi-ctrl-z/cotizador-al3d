// Cobros y correcciones de la venta — A.md §5.7 y §10.7, casos PG-01..PG-11, PG-29, PG-30 (PG-04 incluido), y R1-10/R1-16 (Fabricación no entra).
//
//   · `registrar_cobro`: la Liquidación es ACUMULATIVA (un reintento sin idempotencia la sumaría dos veces); numeric exacto;
//   · `corregir_venta`: lo que Pagos hace «a mano» en la hoja, con la matriz por campo y el IVA que manda la cuenta;
//   · todo cambio de dinero queda en `bitacora` de nivel `dinero`; Fabricación recibe `ROL_SIN_PERMISO` igual para una venta que existe y para una que no.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, rpcT, crearVenta, sql, conCopia } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await crearVenta(db, { folio: 'V-001', sub: 1000, anti: 500, cuenta: 'Constru BNT', iva: true, estatus: 'COBRANDO' });                  // neto 1160, saldo 660
  await crearVenta(db, { folio: 'V-002', sub: 1000, anti: 100, cuenta: 'Constru BNT', iva: true, estatus: 'COBRANDO', fuente: 'cotizacion', etapa: 'armado' });
  await crearVenta(db, { folio: 'V-003', sub: 2000, anti: 0, cuenta: 'Elias BBVA', iva: true, estatus: 'COBRANDO' });                      // IVA que no corresponde a la cuenta
  await crearVenta(db, { folio: 'V-004', sub: 500, anti: 0, cuenta: 'Elias BBVA', iva: false, estatus: 'LIQUIDADO' });
  await sql(db, `insert into public.proyectos (id, empresa_id, folio_global, fuente, nombre, etapa) values ('lapida', 'al3d', 'COT-9000@K7QM', 'cotizacion', 'Lápida', 'cancelado')`);
  return db;
}, { limpiar: db => db.close() });

const HOY = db => sql(db, `select interno.hoy_mx()::text as h`).then(r => r[0].h);
const venta = (t, id) => t.query(`select d.liquidacion::text as liq, d.fecha_liquidacion::text as fliq, p.estatus, p.iva, p.etapa, d.cuenta, d.subtotal::text as sub, d.anticipo::text as anti, p.nombre, d.pct_comision::text as pct
                                    from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id where p.id = $1`, [id]).then(r => r[0]);
const K = (t, id) => t.query(`select k_saldo::text as k from public.ventas_calculadas where proyecto_id = $1`, [id]).then(r => r[0].k);

describir('PG-01 a PG-06 registrar_cobro', () => {
  for (const quien of ['dir', 'pag']) {
    prueba(`PG-01 (${quien}) cobros de 100.00 y 50.25: liquidación = 150.25 exacto; la fecha es HOY de México; LIQUIDADO con p_liquidar; el saldo devuelto es el K de la vista`, async () => {
      const db = await plantilla(), hoy = await HOY(db);
      const x = await sesionDe(db, db.u[quien]).transaccion(async t => {
        const a = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 100, p_liquidar: false });
        const b = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 50.25 });
        return { a, b, v: await venta(t, 'v001'), k: await K(t, 'v001') };
      });
      igual([x.a.ok, String(x.a.liquidacion), String(x.a.saldo)], [true, '100', '560']);
      igual([String(x.b.liquidacion), String(x.b.saldo), x.b.estatus, x.b.fecha_liquidacion, x.b.en_ceros], ['150.25', '509.75', 'LIQUIDADO', hoy, false]);
      igual([x.v.liq, x.v.fliq, x.v.estatus, x.k], ['150.25', hoy, 'LIQUIDADO', '509.75'], 'el saldo devuelto es el K de la vista');
    });
  }
  prueba('PG-01 con p_fecha se usa esa fecha; el saldo en ceros se avisa (en_ceros) y el exceso deja K negativo', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const exacto = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 660, p_fecha: '2026-09-30' });
      const demas = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v002', p_monto: 5000 });
      return { exacto, demas, v: await venta(t, 'v001') };
    });
    igual([String(x.exacto.saldo), x.exacto.en_ceros, x.v.fliq], ['0', true, '2026-09-30']);
    igual([String(x.demas.saldo), x.demas.en_ceros], ['-3940', true], 'se acepta: la vista lo marca «Cobrado de más»');
  });
  prueba('PG-02 Pagos reintenta con el MISMO op_id: la misma respuesta y NO suma dos veces; otro op_id sí suma', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const a = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 100, p_liquidar: false, p_op_id: 'op-1' });
      const b = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 100, p_liquidar: false, p_op_id: 'op-1' });
      const c = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 100, p_liquidar: false, p_op_id: 'op-2' });
      return { a, b, c, v: await venta(t, 'v001') };
    });
    igual(x.b, x.a);
    igual([String(x.c.liquidacion), x.v.liq], ['200', '200']);
  });
  prueba('PG-02 el op_id es por empresa: el mismo op_id de otra empresa no lo repite', async () => {
    await conCopia(plantilla, async db => {
      await crearVenta(db, { folio: 'V-001', empresa: 'otra', id: 'otra-v001', sub: 1000, anti: 0 });
      const a = await sesionDe(db, db.u.pag).transaccion(t => rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 100, p_op_id: 'op-x' }), { confirmar: true });
      const o = await sesionDe(db, db.u.otra).transaccion(t => rpcT(t, 'registrar_cobro', { p_proyecto: 'otra-v001', p_monto: 100, p_op_id: 'op-x' }), { confirmar: true });
      igual([a.ok, o.ok, String(o.liquidacion)], [true, true, '100']);
    });
  });
  prueba('PG-03 monto 0, negativo o null → DATO_INVALIDO (definitivo); no se escribe nada', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const r = [];
      for (const m of [0, -5, null]) r.push(await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: m }));
      return { r, v: await venta(t, 'v001') };
    });
    for (const r of x.r) igual([r.ok, r.codigo, r.definitivo], [false, 'DATO_INVALIDO', true]);
    igual(x.v.liq, '0');
  });
  prueba('PG-05 con p_liquidar = false el estatus NO cambia y el IVA se normaliza por la cuenta (Elias BBVA no factura)', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      await rpcT(t, 'registrar_cobro', { p_proyecto: 'v003', p_monto: 10, p_liquidar: false });
      return venta(t, 'v003');
    });
    igual([x.estatus, x.iva], ['COBRANDO', false]);
  });
  prueba('PG-05 con p_liquidar (por omisión) el estatus pasa a LIQUIDADO y el IVA NO se normaliza (una venta liquidada no se reescribe)', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => { await rpcT(t, 'registrar_cobro', { p_proyecto: 'v003', p_monto: 10 }); return venta(t, 'v003'); });
    igual([x.estatus, x.iva], ['LIQUIDADO', true]);
  });
  prueba('PG-06 cobro sobre una lápida, un proyecto sin folio, uno inexistente o uno borrado → NO_ENCONTRADO', async () => {
    const db = await plantilla();
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa, deleted_at) values ('borrado', 'al3d', 'V-099', 'hoja', 'Borrado', 'ganado', now())`);
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const r = {};
      for (const id of ['lapida', 'no-existe', 'borrado']) r[id] = await rpcT(t, 'registrar_cobro', { p_proyecto: id, p_monto: 10 });
      return r;
    });
    for (const [id, r] of Object.entries(x)) igual([id, r.ok, r.codigo, r.definitivo], [id, false, 'NO_ENCONTRADO', true]);
  });
  prueba('la bitácora anota el cobro en el nivel DINERO con antes/después, y devuelve lo mismo guardado para el reintento', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 100, p_liquidar: false, p_op_id: 'op-b' });
      return t.query(`select nivel, titulo, antes, despues, op_id, resultado from public.bitacora where accion = 'cobro'`);
    });
    igual(x.map(b => [b.nivel, b.titulo, b.op_id]), [['dinero', 'Cobro de $100.00 registrado en V-001', 'cobro:op-b']]);
    igual([String(x[0].antes.liquidacion), String(x[0].despues.liquidacion), x[0].antes.estatus], ['0', '100', 'COBRANDO']);
    igual(x[0].resultado.ok, true);
  });
});

describir('PG-07 a PG-11 corregir_venta', () => {
  prueba('PG-07 Dirección corrige la cuenta a Elias BBVA en una venta COBRANDO con IVA: el IVA queda en no; en una LIQUIDADO no cambia; con Rul HSBC queda en sí', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      await rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: { cuenta: 'Elias BBVA' } });
      const abierta = await venta(t, 'v001');
      await rpcT(t, 'corregir_venta', { p_proyecto: 'v004', p_cambios: { cuenta: 'Constru BNT' } });
      const liquidada = await venta(t, 'v004');
      await rpcT(t, 'corregir_venta', { p_proyecto: 'v003', p_cambios: { cuenta: 'Rul HSBC' } });
      return { abierta, liquidada, hsbc: await venta(t, 'v003') };
    });
    igual([x.abierta.cuenta, x.abierta.iva], ['Elias BBVA', false]);
    igual([x.liquidada.cuenta, x.liquidada.iva], ['Constru BNT', false], 'LIQUIDADO: el histórico no se reescribe');
    igual([x.hsbc.cuenta, x.hsbc.iva], ['Rul HSBC', true]);
  });
  prueba('PG-07 una venta SIN cuenta no se toca al corregir otro dato', async () => {
    await conCopia(plantilla, async db => {
      await crearVenta(db, { folio: 'V-010', sub: 100, iva: false, cuenta: null, estatus: 'FABRICACION' });
      const x = await sesionDe(db, db.u.dir).transaccion(async t => { await rpcT(t, 'corregir_venta', { p_proyecto: 'v010', p_cambios: { subtotal: 200 } }); return venta(t, 'v010'); });
      igual([x.sub, x.iva, x.cuenta], ['200', false, null]);
    });
  });
  prueba('PG-08 corregir_venta(iva) en una venta abierta con cuenta: «la cuenta dicta el IVA»; en una LIQUIDADO o sin cuenta, Dirección sí lo escribe; Pagos NUNCA', async () => {
    await conCopia(plantilla, async db => {
      await crearVenta(db, { folio: 'V-011', sub: 100, iva: true, cuenta: null, estatus: 'COBRANDO' });
      const D = await sesionDe(db, db.u.dir).transaccion(async t => {
        const abierta = await rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: { iva: false } });
        const liquidada = await rpcT(t, 'corregir_venta', { p_proyecto: 'v004', p_cambios: { iva: true } });
        const sinCuenta = await rpcT(t, 'corregir_venta', { p_proyecto: 'v011', p_cambios: { iva: false } });
        const liquidando = await rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: { iva: false, estatus: 'LIQUIDADO' } });     // con el estatus que lo deja LIQUIDADO sí queda
        return { abierta, liquidada, sinCuenta, liquidando, v: await venta(t, 'v001'), l: await venta(t, 'v004'), s: await venta(t, 'v011') };
      });
      igual(D.abierta.rechazadas.map(r => r.nombre), ['iva']);
      igual(D.abierta.rechazadas[0].por.startsWith('la cuenta dicta el IVA'), true);
      igual([D.liquidada.escritos, D.l.iva], [['iva'], true]);
      igual([D.sinCuenta.escritos, D.s.iva], [['iva'], false]);
      igual([D.liquidando.escritos.sort(), D.v.iva, D.v.estatus], [['estatus', 'iva'], false, 'LIQUIDADO']);
      const P = await sesionDe(db, db.u.pag).transaccion(async t => rpcT(t, 'corregir_venta', { p_proyecto: 'v004', p_cambios: { iva: true } }));
      igual([P.escritos, P.rechazadas.map(r => r.nombre)], [[], ['iva']]);
    });
  });
  prueba('PG-09 Pagos corrige nombre, subtotal, anticipo, liquidación, cuenta, estatus (los cuatro), fecha de liquidación y pct_comision: todo permitido', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const r = await rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: { nombre: 'Nombre corregido', subtotal: 2500.5, anticipo: 100, liquidacion: 50, cuenta: 'Tatis BNT',
                                                                               estatus: 'REPARANDO', fecha_liquidacion: '2026-10-01', pct_comision: 12.5 } });
      return { r, v: await venta(t, 'v001') };
    });
    igual(x.r.escritos.sort(), ['anticipo', 'cuenta', 'estatus', 'fecha_liquidacion', 'liquidacion', 'nombre', 'pct_comision', 'subtotal']);
    igual(x.r.rechazadas, []);
    igual([x.v.nombre, x.v.sub, x.v.anti, x.v.liq, x.v.cuenta, x.v.estatus, x.v.fliq, x.v.pct, x.v.iva], ['Nombre corregido', '2500.5', '100', '50', 'Tatis BNT', 'REPARANDO', '2026-10-01', '12.5', true]);
    igual(x.r.venta.estatus, 'REPARANDO');
  });
  for (const quien of ['dir', 'pag']) {
    prueba(`PG-10 (${quien}) anticipo −1, liquidación −5, cuenta null, estatus «X», pct 101, fecha «10/10/26» y nombre vacío → 7 rechazadas; el subtotal negativo SÍ se acepta`, async () => {
      const db = await plantilla();
      const x = await sesionDe(db, db.u[quien]).transaccion(async t => {
        const r = await rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: { anticipo: -1, liquidacion: -5, cuenta: null, estatus: 'X', pct_comision: 101, fecha_liquidacion: '10/10/26', nombre: '', subtotal: -500 } });
        return { r, v: await venta(t, 'v001') };
      });
      igual(x.r.rechazadas.map(r => r.nombre).sort(), ['anticipo', 'cuenta', 'estatus', 'fecha_liquidacion', 'liquidacion', 'nombre', 'pct_comision']);
      igual(x.r.escritos, ['subtotal']);
      igual([x.v.sub, x.v.anti, x.v.liq, x.v.cuenta, x.v.estatus, x.v.nombre], ['-500', '500', '0', 'Constru BNT', 'COBRANDO', 'Proyecto V-001']);
    });
  }
  prueba('PG-10 valores raros: texto en un importe, un booleano, la fecha imposible 2026-02-31 → rechazadas; una cuenta vaciada con "" también', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(t => rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: { subtotal: 'mucho', anticipo: true, fecha_liquidacion: '2026-02-31', cuenta: '' } }));
    igual(x.rechazadas.map(r => r.nombre).sort(), ['anticipo', 'cuenta', 'fecha_liquidacion', 'subtotal']);
    igual(x.escritos, []);
  });
  prueba('PG-10 fecha_liquidacion null y pct_comision null SÍ se aceptan (se vacían)', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      await rpcT(t, 'corregir_venta', { p_proyecto: 'v004', p_cambios: { fecha_liquidacion: '2026-10-01', pct_comision: 10 } });
      await rpcT(t, 'corregir_venta', { p_proyecto: 'v004', p_cambios: { fecha_liquidacion: null, pct_comision: null } });
      return venta(t, 'v004');
    });
    igual([x.fliq, x.pct], [null, null]);
  });
  prueba('PG-11 la bitácora de nivel dinero lleva antes/después SOLO de lo que cambió (un valor igual no aparece)', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      await rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: { subtotal: 1500, anticipo: 500, nombre: 'Otro nombre' } });      // el anticipo ya era 500
      return t.query(`select nivel, titulo, antes, despues from public.bitacora where accion = 'cambio' and entidad_id = 'v001'`);
    });
    igual(x.length, 1);
    igual([x[0].nivel, x[0].titulo], ['dinero', 'Se corrigió V-001']);
    igual([String(x[0].antes.subtotal), String(x[0].despues.subtotal), x[0].antes.nombre, x[0].despues.nombre, 'anticipo' in x[0].antes], ['1000', '1500', 'Proyecto V-001', 'Otro nombre', false]);
  });
  prueba('una corrección sin cambios, o con todo rechazado, no escribe ni anota; sin p_cambios → DATO_INVALIDO', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const igualesR = await rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: { anticipo: 500 } });      // mismo valor: se acepta pero no cambia nada
      const rechazo = await rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: { folio_hoja: 'V-999' } });
      const vacio = await rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: {} });
      const nulo = await rpcT(t, 'corregir_venta', { p_proyecto: 'v001', p_cambios: null });
      return { igualesR, rechazo, vacio, nulo, n: (await t.query(`select count(*)::int as n from public.bitacora where accion = 'cambio'`))[0].n };
    });
    igual([x.igualesR.escritos, x.rechazo.rechazadas.map(r => r.nombre), x.vacio.codigo, x.nulo.codigo, x.n], [['anticipo'], ['folio_hoja'], 'DATO_INVALIDO', 'DATO_INVALIDO', 0]);
  });
  prueba('corregir_venta sobre una lápida o un proyecto inexistente → NO_ENCONTRADO', async () => {
    const db = await plantilla();
    for (const id of ['lapida', 'no-existe']) igual((await sesionDe(db, db.u.dir).rpc('corregir_venta', { p_proyecto: id, p_cambios: { subtotal: 1 } }))[0].corregir_venta.codigo, 'NO_ENCONTRADO', id);
  });
});

describir('PG-29 y PG-30 estatus de cobro', () => {
  prueba('PG-29 Pagos liquida una venta con saldo restante: la vista la marca «Liquidado con saldo»', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 100, p_liquidar: true });
      return (await t.query(`select x_revisar, k_saldo::text as k from public.ventas_calculadas where proyecto_id = 'v001'`))[0];
    });
    igual(x, { x_revisar: 'Liquidado con saldo', k: '560.00' });
  });
  prueba('PG-30 Pagos puede poner los CUATRO estatus (FABRICACION, REPARANDO, COBRANDO, LIQUIDADO)', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const r = [];
      for (const e of ['FABRICACION', 'REPARANDO', 'COBRANDO', 'LIQUIDADO']) { await rpcT(t, 'corregir_venta', { p_proyecto: 'v002', p_cambios: { estatus: e } }); r.push((await venta(t, 'v002')).estatus); }
      return r;
    });
    igual(x, ['FABRICACION', 'REPARANDO', 'COBRANDO', 'LIQUIDADO']);
  });
});

describir('R1-10 y R1-16 Fabricación no entra: el mismo ROL_SIN_PERMISO exista o no la venta, sin cifras ni nombres en el mensaje', () => {
  const LLAMADAS = id => [
    ['registrar_cobro', { p_proyecto: id, p_monto: 100 }], ['registrar_abono_comision', { p_proyecto: id, p_monto: 10 }], ['repartir_abono_fifo', { p_monto: 100 }],
    ['vista_previa_reparto', { p_monto: 100 }], ['corregir_venta', { p_proyecto: id, p_cambios: { subtotal: 1 } }], ['corregir_abono', { p_proyecto: id, p_monto: -5, p_nota: 'x' }],
    ['comisiones_cobradas', { p_desde: '2026-01-01', p_hasta: '2026-12-31' }],
    ['alta_venta', { p_op: { id: id, nombre: 'X', cuenta: 'Moni MPago', subtotal: 1, tel: '33 1234 5678', entrega: 'recoleccion' } }],
  ];
  prueba('PG-04 Fabricación: registrar_cobro (y las otras siete RPC de dinero) dan ROL_SIN_PERMISO idéntico para un proyecto que EXISTE y para uno que NO (definitivo)', async () => {
    const db = await plantilla(), F = sesionDe(db, db.u.fab);
    for (const [fn, args] of LLAMADAS('v001')) {
      const a = (await F.rpc(fn, args))[0][fn];
      const b = (await F.rpc(fn, Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v === 'v001' ? 'no-existe' : v]))))[0][fn];
      igual([fn, a.ok, a.codigo, a.definitivo], [fn, false, 'ROL_SIN_PERMISO', true]);
      igual(b, a, fn + ': la respuesta no cambia con la existencia del proyecto');
    }
  });
  prueba('R1-16 los mensajes de error no contienen cifras ni el nombre del proyecto', async () => {
    const db = await plantilla(), F = sesionDe(db, db.u.fab);
    for (const [fn, args] of LLAMADAS('v001')) {
      const m = (await F.rpc(fn, args))[0][fn].mensaje;
      cierto(!/[0-9]/.test(m) && !/Proyecto V-001/.test(m), fn + ': «' + m + '»');
    }
  });
  prueba('Fabricación no escribe NADA: ninguna de las ocho dejó rastro (libro de abonos y liquidaciones intactos)', async () => {
    const db = await plantilla(), F = sesionDe(db, db.u.fab);
    const antes = (await sql(db, `select (select count(*) from public.abonos)::int as a, (select sum(liquidacion) from public.ventas_dinero)::text as l, (select count(*) from public.bitacora)::int as b`))[0];
    for (const [fn, args] of LLAMADAS('v001')) await F.rpc(fn, args, { confirmar: true });
    igual((await sql(db, `select (select count(*) from public.abonos)::int as a, (select sum(liquidacion) from public.ventas_dinero)::text as l, (select count(*) from public.bitacora)::int as b`))[0], antes);
  });
  prueba('anon no puede ejecutar ninguna de ellas (permission denied)', async () => {
    const db = await plantilla();
    const { como } = await import('../comun/semilla.js');
    const A = como(db, { rol: 'anon' });
    for (const [fn, args] of LLAMADAS('v001')) {
      const r = await A.intentar(`select * from public.${fn}(${Object.keys(args).map((k, i) => `${k} => $${i + 1}`).join(', ')})`, Object.values(args).map(v => (typeof v === 'object' ? JSON.stringify(v) : v)));
      igual([fn, r.ok, r.error?.codigo], [fn, false, '42501']);
    }
  });
});

await resumen();
