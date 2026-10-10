// El libro de comisión: abonos sueltos, reparto FIFO y correcciones — A.md §5.7 y §10.7, casos PG-12..PG-25.
//
//   · `registrar_abono_comision`: un abono a UNA venta (positivo y de menos de 1e7); puede exceder la comisión (la vista lo marca);
//   · `repartir_abono_fifo` / `vista_previa_reparto`: un depósito se reparte entre las comisiones pendientes, de la más antigua (por NÚMERO
//     de folio) a la más nueva, con el MISMO `P-###`; lo que sobra NO se aplica; todos los renglones o ninguno;
//   · `corregir_abono`: el contra-asiento (solo Dirección); `comisiones_cobradas`: «Comisiones por periodo».
// Se arman sobre una base SIN la semilla de proyectos, para que las comisiones pendientes sean exactamente las de cada caso.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, rpcT, crearVenta, sql, como, conCopia } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await crearVenta(db, { folio: 'V-001', sub: 1000 });         // comisión 100.00
  await crearVenta(db, { folio: 'V-002', sub: 505 });          // comisión  50.50
  await crearVenta(db, { folio: 'V-003', sub: 2000 });         // comisión 200.00
  return db;
}, { limpiar: db => db.close() });

const abonos = (t, extra = '') => t.query(`select folio_hoja, importe::text as importe, tipo, pago_id, nota, fecha::text as fecha, op_id from public.abonos ${extra} order by id`);
const T = (t, folio) => t.query(`select t_restante::text as t, s_abonado::text as s, u_pagos as u, x_revisar as x from public.ventas_calculadas where a_folio = $1`, [folio]).then(r => r[0]);

describir('PG-12 a PG-14 registrar_abono_comision', () => {
  for (const quien of ['dir', 'pag']) {
    prueba(`PG-12 (${quien}) abono de 0, −1 y 1e7 → DATO_INVALIDO; de 100 → ok con abonado y restante; el mismo op_id devuelve lo mismo y no lo repite`, async () => {
      const db = await plantilla();
      const x = await sesionDe(db, db.u[quien]).transaccion(async t => {
        const malos = [];
        for (const m of [0, -1, 10000000, null]) malos.push(await rpcT(t, 'registrar_abono_comision', { p_proyecto: 'v001', p_monto: m }));
        const a = await rpcT(t, 'registrar_abono_comision', { p_proyecto: 'v001', p_monto: 100, p_op_id: 'ab-1' });
        const b = await rpcT(t, 'registrar_abono_comision', { p_proyecto: 'v001', p_monto: 100, p_op_id: 'ab-1' });
        return { malos, a, b, n: (await abonos(t, `where folio_hoja = 'V-001'`)).length };
      });
      for (const m of x.malos) igual([m.ok, m.codigo, m.definitivo], [false, 'DATO_INVALIDO', true]);
      igual([x.a.ok, String(x.a.importe), String(x.a.abonado), String(x.a.restante)], [true, '100', '100', '0']);
      igual([x.b.repetida, String(x.b.abonado), x.n], [true, '100', 1]);
    });
  }
  prueba('PG-13 un abono sin nota ni fecha: nota «Registrado desde la plataforma» y fecha de HOY de México; con nota y fecha las respeta', async () => {
    const db = await plantilla();
    const hoy = (await sql(db, `select interno.hoy_mx()::text as h`))[0].h;
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      await rpcT(t, 'registrar_abono_comision', { p_proyecto: 'v001', p_monto: 10 });
      await rpcT(t, 'registrar_abono_comision', { p_proyecto: 'v002', p_monto: 5, p_nota: 'Depósito del 3', p_fecha: '2026-10-03' });
      await rpcT(t, 'registrar_abono_comision', { p_proyecto: 'v003', p_monto: 5, p_nota: '   ' });
      return abonos(t);
    });
    igual(x.map(a => [a.folio_hoja, a.nota, a.fecha, a.tipo, a.pago_id]), [['V-001', 'Registrado desde la plataforma', hoy, 'abono', null], ['V-002', 'Depósito del 3', '2026-10-03', 'abono', null],
                                                                           ['V-003', 'Registrado desde la plataforma', hoy, 'abono', null]]);
  });
  prueba('PG-14 un abono MAYOR que la comisión se acepta: T queda negativo y la vista marca «Comisión pagada de más» (no se impide)', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const r = await rpcT(t, 'registrar_abono_comision', { p_proyecto: 'v001', p_monto: 150 });
      return { r, v: await T(t, 'V-001') };
    });
    igual([x.r.ok, String(x.r.restante), x.v.t, x.v.x], [true, '-50', '-50.00', 'Comisión pagada de más']);
  });
  prueba('un abono sobre una lápida, un proyecto sin folio o uno inexistente → NO_ENCONTRADO', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `insert into public.proyectos (id, empresa_id, folio_global, fuente, nombre, etapa) values ('lapida', 'al3d', 'COT-9000@K7QM', 'cotizacion', 'Lápida', 'cancelado')`);
      const x = await sesionDe(db, db.u.pag).transaccion(async t => {
        const r = [];
        for (const id of ['lapida', 'no-existe']) r.push(await rpcT(t, 'registrar_abono_comision', { p_proyecto: id, p_monto: 10 }));
        return r;
      });
      for (const r of x) igual([r.ok, r.codigo], [false, 'NO_ENCONTRADO']);
    });
  });
  prueba('la bitácora anota el abono en el nivel dinero, y un abono repetido (mismo op_id) no anota otra vez', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      await rpcT(t, 'registrar_abono_comision', { p_proyecto: 'v001', p_monto: 10, p_op_id: 'k' });
      await rpcT(t, 'registrar_abono_comision', { p_proyecto: 'v001', p_monto: 10, p_op_id: 'k' });
      return t.query(`select nivel, titulo from public.bitacora where accion = 'abono'`);
    });
    igual(x.map(b => [b.nivel, b.titulo]), [['dinero', 'Abono de comisión de $10.00 en V-001']]);
  });
});

describir('PG-15 a PG-22 repartir_abono_fifo y vista_previa_reparto', () => {
  prueba('PG-15 repartir 120.00 con pendientes V-001 100.00, V-002 50.50 y V-003 200.00: V-001 100 (queda 0), V-002 20 (queda 30.50), V-003 nada; MISMO pago_id P-001; nota «Reparto P-001 de $120.00»; sobrante 0', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const r = await rpcT(t, 'repartir_abono_fifo', { p_monto: 120 });
      return { r, a: await abonos(t) };
    });
    igual([x.r.ok, x.r.pago_id, String(x.r.sobrante), String(x.r.repartido_total)], [true, 'P-001', '0', '120']);
    igual(x.r.repartido.map(f => [f.folio, String(f.pend), String(f.abono), String(f.queda)]), [['V-001', '100', '100', '0'], ['V-002', '50.5', '20', '30.5']]);
    igual(x.a.map(a => [a.folio_hoja, a.importe, a.tipo, a.pago_id, a.nota]), [['V-001', '100.00', 'reparto', 'P-001', 'Reparto P-001 de $120.00'], ['V-002', '20.00', 'reparto', 'P-001', 'Reparto P-001 de $120.00']]);
  });
  prueba('PG-15 con nota del usuario: «<nota> · Reparto P-001 de $120.00»; con fecha la respeta, sin fecha es HOY', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => { await rpcT(t, 'repartir_abono_fifo', { p_monto: 10, p_nota: 'BBVA 3 oct', p_fecha: '2026-10-03' }); return abonos(t); });
    igual([x[0].nota, x[0].fecha], ['BBVA 3 oct · Reparto P-001 de $10.00', '2026-10-03']);
  });
  prueba('PG-16 repartir 400: reparte 350.50 (todo lo pendiente) y el sobrante de 49.50 NO se aplica', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const r = await rpcT(t, 'repartir_abono_fifo', { p_monto: 400 });
      return { r, n: (await abonos(t)).length, v: await T(t, 'V-003') };
    });
    igual([String(x.r.sobrante), String(x.r.repartido_total), x.n, x.v.t], ['49.5', '350.5', 3, '0.00']);
  });
  prueba('PG-17 sin comisiones pendientes → DATO_INVALIDO; monto 0, negativo o nulo → DATO_INVALIDO', async () => {
    await conCopia(plantilla, async db => {
      const x = await sesionDe(db, db.u.pag).transaccion(async t => {
        const malos = [];
        for (const m of [0, -5, null, 0.001]) malos.push(await rpcT(t, 'repartir_abono_fifo', { p_monto: m }));
        await rpcT(t, 'repartir_abono_fifo', { p_monto: 350.5 });
        return { malos, vacio: await rpcT(t, 'repartir_abono_fifo', { p_monto: 10 }), preview: await rpcT(t, 'vista_previa_reparto', { p_monto: 10 }) };
      });
      for (const m of x.malos) igual([m.ok, m.codigo], [false, 'DATO_INVALIDO']);
      igual([x.vacio.codigo, x.vacio.mensaje], ['DATO_INVALIDO', 'No hay comisiones pendientes que abonar.']);
      igual(x.preview.ok, true, 'la vista previa no falla: simplemente no hay filas');
      igual(x.preview.filas, []);
    });
  });
  prueba('PG-18 el orden es ASCENDENTE POR NÚMERO de folio: V-010, V-100, V-999, V-1000 (el texto pondría V-1000 antes de V-999)', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `delete from public.ventas_dinero where false`);
      for (const f of ['V-1000', 'V-100', 'V-999', 'V-010']) await crearVenta(db, { folio: f, sub: 100 });                // comisión 10 c/u, creadas en desorden
      const x = await sesionDe(db, db.u.pag).transaccion(async t => rpcT(t, 'vista_previa_reparto', { p_monto: 10000 }));
      igual(x.filas.map(f => f.folio), ['V-001', 'V-002', 'V-003', 'V-010', 'V-100', 'V-999', 'V-1000']);
    });
  });
  prueba('PG-19 T = 0.00, 0.004 y 0.01: solo la de 0.01 entra al reparto (T > 0.004)', async () => {
    const db = await crearBaseDePruebas();
    db.u = await sembrarUsuarios(db);
    await crearVenta(db, { folio: 'V-001', sub: 1000, abonos: ['100'] });          // T = 0.00
    await crearVenta(db, { folio: 'V-002', sub: 1000, abonos: ['99.996'] });       // T = round(0.004, 2) = 0.00
    await crearVenta(db, { folio: 'V-003', sub: 1000, abonos: ['99.99'] });        // T = 0.01
    const x = await sesionDe(db, db.u.pag).transaccion(async t => rpcT(t, 'vista_previa_reparto', { p_monto: 1 }));
    igual(x.filas.map(f => [f.folio, String(f.pend)]), [['V-003', '0.01']]);
    igual([String(x.total_pendiente), x.cuantas, String(x.sobrante)], ['0.01', 1, '0.99']);
    await db.close();
  });
  prueba('PG-20 repetir el reparto con el mismo op_id: no escribe renglones nuevos y devuelve el mismo reparto', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const a = await rpcT(t, 'repartir_abono_fifo', { p_monto: 120, p_op_id: 'rep-1' });
      const b = await rpcT(t, 'repartir_abono_fifo', { p_monto: 120, p_op_id: 'rep-1' });
      const otro = await rpcT(t, 'repartir_abono_fifo', { p_monto: 120, p_op_id: 'rep-2' });
      return { a, b, otro, n: (await abonos(t)).length, pagos: (await abonos(t)).map(r => r.pago_id) };
    });
    igual([x.b.repetida, x.b.pago_id, String(x.b.repartido_total)], [true, 'P-001', '120']);
    igual(x.b.repartido.map(f => [f.folio, String(f.abono)]), x.a.repartido.map(f => [f.folio, String(f.abono)]));
    igual([x.otro.pago_id, x.n], ['P-002', 4], 'otro op_id sí reparte (2 renglones del primero y 2 del segundo)');
  });
  prueba('PG-21 con el contador P sembrado en 999 el siguiente depósito es P-1000 (no «P-000», como desbordaba la hoja)', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `insert into public.contadores (empresa_id, clave, n) values ('al3d', 'P', 999)`);
      const x = await sesionDe(db, db.u.pag).transaccion(async t => { const r = await rpcT(t, 'repartir_abono_fifo', { p_monto: 10 }); return { r, a: await abonos(t) }; });
      igual([x.r.pago_id, x.a[0].pago_id, x.a[0].nota], ['P-1000', 'P-1000', 'Reparto P-1000 de $10.00']);
    });
  });
  prueba('PG-22 vista_previa_reparto(120) NO escribe y coincide con lo que reparte PG-15', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const p = await rpcT(t, 'vista_previa_reparto', { p_monto: 120 });
      const antes = (await abonos(t)).length;
      const r = await rpcT(t, 'repartir_abono_fifo', { p_monto: 120 });      // si la vista previa hubiera gastado un P-###, este sería P-002
      return { p, antes, r };
    });
    igual([x.p.ok, x.antes, x.r.pago_id], [true, 0, 'P-001']);
    igual(x.p.filas.map(f => [f.folio, String(f.pend), String(f.abono), String(f.queda)]), x.r.repartido.map(f => [f.folio, String(f.pend), String(f.abono), String(f.queda)]));
    igual([String(x.p.sobrante), String(x.p.total_pendiente), x.p.cuantas, x.p.filas[0].nombre], ['0', '350.5', 3, 'Proyecto V-001']);
  });
  prueba('el reparto es de Dirección y Pagos; a Fabricación se le niega igual (R1-10); la bitácora anota el reparto de nivel dinero', async () => {
    const db = await plantilla();
    igual((await sesionDe(db, db.u.fab).rpc('repartir_abono_fifo', { p_monto: 100 }))[0].repartir_abono_fifo.codigo, 'ROL_SIN_PERMISO');
    const x = await sesionDe(db, db.u.dir).transaccion(async t => { await rpcT(t, 'repartir_abono_fifo', { p_monto: 120 }); return t.query(`select nivel, titulo from public.bitacora where accion = 'reparto'`); });
    igual(x.map(b => [b.nivel, b.titulo]), [['dinero', 'Reparto de $120.00 (P-001)']]);
  });
});

describir('PG-23 y PG-24 corregir_abono y el libro', () => {
  prueba('PG-23 Dirección corrige −50 con nota: renglón «correccion» negativo, S baja y T sube; sin nota → DATO_INVALIDO; Pagos → ROL_SIN_PERMISO', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      await rpcT(t, 'registrar_abono_comision', { p_proyecto: 'v001', p_monto: 60 });
      const antes = await T(t, 'V-001');
      const r = await rpcT(t, 'corregir_abono', { p_proyecto: 'v001', p_monto: -50, p_nota: 'Se depositó de más' });
      const sinNota = await rpcT(t, 'corregir_abono', { p_proyecto: 'v001', p_monto: -5, p_nota: '  ' });
      const cero = await rpcT(t, 'corregir_abono', { p_proyecto: 'v001', p_monto: 0, p_nota: 'x' });
      const enorme = await rpcT(t, 'corregir_abono', { p_proyecto: 'v001', p_monto: -10000000, p_nota: 'x' });
      return { antes, r, sinNota, cero, enorme, despues: await T(t, 'V-001'), a: await abonos(t, `where tipo = 'correccion'`) };
    });
    igual([String(x.r.importe), String(x.r.abonado), String(x.r.restante)], ['-50', '10', '90']);
    igual([x.antes.s, x.antes.t, x.despues.s, x.despues.t, x.despues.u], ['60', '40.00', '10', '90.00', 2]);
    igual(x.a.map(a => [a.importe, a.tipo, a.nota]), [['-50', 'correccion', 'Se depositó de más']]);
    for (const m of [x.sinNota, x.cero, x.enorme]) igual([m.ok, m.codigo], [false, 'DATO_INVALIDO']);
    const P = (await sesionDe(db, db.u.pag).rpc('corregir_abono', { p_proyecto: 'v001', p_monto: -5, p_nota: 'x' }))[0].corregir_abono;
    igual([P.ok, P.codigo, P.definitivo], [false, 'ROL_SIN_PERMISO', true]);
  });
  prueba('corregir_abono admite una corrección POSITIVA (suma) y es idempotente por op_id', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      const a = await rpcT(t, 'corregir_abono', { p_proyecto: 'v001', p_monto: 25, p_nota: 'Faltaba', p_op_id: 'c-1' });
      const b = await rpcT(t, 'corregir_abono', { p_proyecto: 'v001', p_monto: 25, p_nota: 'Faltaba', p_op_id: 'c-1' });
      return { a, b, n: (await abonos(t)).length };
    });
    igual([x.b.repetida, x.n, String(x.b.abonado)], [true, 1, '25']);
  });
  prueba('PG-24 service_role no puede UPDATE (trigger del libro, P0001) ni DELETE (permission denied, 42501) en abonos', async () => {
    const db = await plantilla();
    await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe) values ('al3d', 'V-001', 5)`);
    const S = como(db, { rol: 'service_role' });
    igual((await S.intentar(`update public.abonos set nota = 'x'`)).error.codigo, 'P0001');
    igual((await S.intentar(`delete from public.abonos`)).error.codigo, '42501');
  });
});

describir('PG-25 comisiones_cobradas («Comisiones por periodo»)', () => {
  prueba('el rango es INCLUSIVO; un abono sin fecha no cuenta en ningún periodo; el de un folio inexistente SÍ suma en «cobrado»; los renglones sin pago_id cuentan como UN depósito distinto', async () => {
    const db = await plantilla();
    await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe, fecha, tipo, pago_id) values
        ('al3d', 'V-001', 100, '2026-10-01', 'reparto', 'P-001'),
        ('al3d', 'V-002',  50, '2026-10-01', 'reparto', 'P-001'),
        ('al3d', 'V-003',  25, '2026-10-05', 'abono', null),
        ('al3d', 'V-001',  10, '2026-10-06', 'abono', null),
        ('al3d', 'V-777',   7, '2026-10-05', 'abono', null),
        ('al3d', 'V-002',  99, null,         'abono', null),
        ('al3d', 'V-003',  -5, '2026-10-05', 'correccion', null),
        ('al3d', 'V-003',  40, '2026-11-01', 'reparto', 'P-002')`);
    const D = sesionDe(db, db.u.dir);
    const periodo = async (desde, hasta) => (await D.rpc('comisiones_cobradas', { p_desde: desde, p_hasta: hasta }))[0].comisiones_cobradas;
    const oct = await periodo('2026-10-01', '2026-10-05');                 // 1 al 5 de octubre, inclusivo en ambos extremos
    igual([oct.ok, String(oct.cobrado), oct.abonos, oct.proyectos, oct.depositos], [true, '177', 5, 4, 2]);
    // cobrado = 100 + 50 + 25 + 7 − 5 (la corrección) = 177; abonos = 5 renglones; proyectos distintos = V-001, V-002, V-003, V-777; depósitos distintos = P-001 y «sin pago»
    igual(Number(oct.promedio), 177 / 5);
    const todo = await periodo('2000-01-01', '2999-12-31');
    igual([String(todo.cobrado), todo.abonos], ['227', 7], 'el abono sin fecha (99) NO está ni siquiera en «Todo»');
    igual(todo.depositos, 3, 'P-001, P-002 y el «sin pago»');
    const vacio = await periodo('2000-01-01', '2000-12-31');
    igual([String(vacio.cobrado), vacio.abonos, vacio.proyectos, vacio.depositos, Number(vacio.promedio)], ['0', 0, 0, 0, 0]);
    const solo = await periodo('2026-10-06', '2026-10-06');
    igual([String(solo.cobrado), solo.abonos], ['10', 1], 'un solo día (inclusivo)');
  });
  prueba('fechas ausentes o invertidas → DATO_INVALIDO; Pagos también puede; Fabricación → ROL_SIN_PERMISO', async () => {
    const db = await plantilla();
    const P = sesionDe(db, db.u.pag);
    for (const args of [{ p_desde: null, p_hasta: '2026-10-01' }, { p_desde: '2026-10-02', p_hasta: '2026-10-01' }]) {
      igual((await P.rpc('comisiones_cobradas', args))[0].comisiones_cobradas.codigo, 'DATO_INVALIDO');
    }
    igual((await P.rpc('comisiones_cobradas', { p_desde: '2026-10-01', p_hasta: '2026-10-01' }))[0].comisiones_cobradas.ok, true);
    igual((await sesionDe(db, db.u.fab).rpc('comisiones_cobradas', { p_desde: '2026-10-01', p_hasta: '2026-10-02' }))[0].comisiones_cobradas.codigo, 'ROL_SIN_PERMISO');
  });
  prueba('es por empresa: Dirección de otra empresa no ve los abonos de al3d', async () => {
    const db = await plantilla();
    await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe, fecha) values ('al3d', 'V-001', 100, '2026-10-01')`);
    const r = (await sesionDe(db, db.u.otra).rpc('comisiones_cobradas', { p_desde: '2026-01-01', p_hasta: '2026-12-31' }))[0].comisiones_cobradas;
    igual([String(r.cobrado), r.abonos], ['0', 0]);
  });
});

await resumen();
