// El almacén: catálogo, listas de compra, libro de movimientos y costos — A.md §5.9 y §10.10, casos AL-01..AL-19 y R1-07/R1-17.
// (AL-20, sembrar la semilla dos veces, está en almacen/semilla.mjs.)
//
// `almacen_aplicar` es la ÚNICA puerta de escritura: ~60 reglas del .gs (permiso por área, validación por tipo, «un cambio atrasado no pisa»,
// «consumido no vuelve atrás», costos solo para quien los ve…). Cada operación va en su subtransacción; el lote puede ser atómico.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sembrarAlmacen, sesionDe, rpcT, sql, como, conCopia, una } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  await sembrarAlmacen(db);
  return db;
}, { limpiar: db => db.close() });

const AHORA = () => Date.now();
const mov = (id, datos = {}, op = {}) => ({ id: 'op-' + id, almacen: 'movimientos', tipo: 'apendice', registro_id: id,
  datos: { id, material_id: 'acr-3mm', tipo: 'entrada', cantidad: 5, unidad_compra: 'lamina', origen: 'manual', nota: 'prueba', usuario: 'Fab', rol: 'fabricacion', dispositivo: 'D1', firma: 'Fab · fabricacion (D1)', ts: AHORA(), ...datos }, ...op });
const mat = (id, datos = {}, op = {}) => ({ id: 'op-' + id, almacen: 'materiales', tipo: 'actualizar', registro_id: id, datos: { id, ...datos }, ...op });
const req = (id, datos = {}, op = {}) => ({ id: 'op-' + id, almacen: 'requerimientos', tipo: 'actualizar', registro_id: id, datos: { id, ...datos }, ...op });
const aplicar = async (db, quien, ops, atomico = false) => (await sesionDe(db, db.u[quien]).rpc('almacen_aplicar', { p_ops: ops, p_atomico: atomico }))[0].almacen_aplicar;
const enT = (db, quien, fn) => sesionDe(db, db.u[quien]).transaccion(fn);
const lote = (t, ops, atomico = false) => rpcT(t, 'almacen_aplicar', { p_ops: ops, p_atomico: atomico });

describir('AL-01 y AL-02 el libro: idempotente por id, sin gastar seq', () => {
  prueba('AL-01 Fabricación crea un movimiento nuevo («creada»); el MISMO id otra vez es «ya_estaba» y `seq` NO avanza', async () => {
    const db = await plantilla();
    const x = await enT(db, 'fab', async t => {
      const seq0 = (await t.query(`select max(seq)::int as s from public.almacen_movimientos`))[0].s;
      const a = await lote(t, [mov('nuevo-1')]);
      const seq1 = (await t.query(`select max(seq)::int as s from public.almacen_movimientos`))[0].s;
      const b = await lote(t, [mov('nuevo-1', { cantidad: 999 })]);       // mismo id con OTRO contenido: el segundo se pierde en silencio
      const seq2 = (await t.query(`select max(seq)::int as s from public.almacen_movimientos`))[0].s;
      return { a, b, seq: [seq0, seq1, seq2], fila: (await t.query(`select cantidad::text as c, usuario_id, origen from public.almacen_movimientos where id = 'nuevo-1'`))[0] };
    });
    igual(x.a, { ok: true, resultados: [{ id: 'op-nuevo-1', ok: true, creada: true }] });
    igual(x.b.resultados, [{ id: 'op-nuevo-1', ok: true, ya_estaba: true }]);
    igual(x.seq, [6, 7, 7], 'la seq sube una vez');
    igual([x.fila.c, x.fila.usuario_id], ['5', '00000000-0000-4000-8000-0000000000f1']);
  });
  prueba('AL-02 dos operaciones con el mismo id en el mismo lote: [creada, ya_estaba]', async () => {
    const db = await plantilla();
    const r = await enT(db, 'fab', t => lote(t, [mov('dup'), mov('dup')]));
    igual(r.resultados.map(x => [x.creada ?? null, x.ya_estaba ?? null]), [[true, null], [null, true]]);
  });
  prueba('el trigger asigna `seq` (un teléfono no puede fijarla) y las altas del libro quedan en orden de llegada', async () => {
    const db = await plantilla();
    const x = await enT(db, 'fab', async t => {
      await lote(t, [mov('a1', { seq: 1 }), mov('a2'), mov('a3')]);
      return (await t.query(`select id, seq::int as seq from public.almacen_movimientos where id in ('a1', 'a2', 'a3') order by seq`));
    });
    igual(x.map(r => [r.id, r.seq]), [['a1', 7], ['a2', 8], ['a3', 9]]);
  });
});

describir('AL-03 y AL-04 lo que no puede entrar al libro, venga de quien venga', () => {
  prueba('AL-03 salida en positivo, entrada en negativo, conteo negativo y ajuste en cero → DATO_INVALIDO ×4; el conteo en CERO sí vale («no queda nada» es un dato)', async () => {
    const db = await plantilla();
    const r = await enT(db, 'fab', t => lote(t, [mov('s', { tipo: 'salida', cantidad: 5 }), mov('e', { tipo: 'entrada', cantidad: -5 }), mov('c', { tipo: 'conteo', cantidad: -1 }),
                                               mov('a', { tipo: 'ajuste', cantidad: 0 }), mov('c0', { tipo: 'conteo', cantidad: 0, origen: 'conteo' }), mov('aj', { tipo: 'ajuste', cantidad: -3 }),
                                               mov('me', { tipo: 'merma', cantidad: -1 }), mov('de', { tipo: 'devolucion', cantidad: 2 })]));
    igual(r.resultados.map(x => x.ok), [false, false, false, false, true, true, true, true]);
    for (const x of r.resultados.slice(0, 4)) igual([x.codigo, x.definitivo], ['DATO_INVALIDO', true]);
  });
  prueba('AL-04 tipo, unidad u origen inventados; ts 0 o ausente; cantidad no numérica o mayor que 1e7 → DATO_INVALIDO', async () => {
    const db = await plantilla();
    const malos = [['tipo', { tipo: 'regalo' }], ['unidad', { unidad_compra: 'caja de 10' }], ['origen', { origen: 'robado' }], ['ts 0', { ts: 0 }], ['sin ts', { ts: undefined }], ['ts texto', { ts: 'ayer' }],
                   ['cantidad texto', { cantidad: 'mucho' }], ['cantidad vacía', { cantidad: '' }], ['cantidad null', { cantidad: null }], ['cantidad 1e7+1', { cantidad: 10000001 }],
                   ['sin material', { material_id: '  ' }], ['costo no numérico', { costo_total: 'caro' }]];
    const r = await enT(db, 'fab', t => lote(t, malos.map(([n, d], i) => mov('m' + i, d))));
    r.resultados.forEach((x, i) => igual([malos[i][0], x.ok, x.codigo], [malos[i][0], false, 'DATO_INVALIDO']));
    igual((await enT(db, 'fab', t => lote(t, [mov('lim', { cantidad: 10000000 })]))).resultados[0].ok, true, '1e7 exacto sí cabe');
  });
  prueba('la cantidad como texto numérico («5»), el signo por tipo y los ids largos: se aceptan los números como texto y se rechaza un id de más de 200', async () => {
    const db = await plantilla();
    const r = await enT(db, 'fab', t => lote(t, [mov('t1', { cantidad: '5' }), mov('x'.repeat(201))]));
    igual([r.resultados[0].ok, r.resultados[1].ok, r.resultados[1].codigo], [true, false, 'DATO_INVALIDO']);
  });
  prueba('el movimiento NO valida contra el catálogo: un material que no existe se acepta (el libro es evidencia)', async () => {
    const db = await plantilla();
    igual((await enT(db, 'fab', t => lote(t, [mov('fuera', { material_id: 'cosa-rara' })]))).resultados[0].creada, true);
  });
});

describir('AL-05 y AL-06 quién escribe qué', () => {
  prueba('AL-05 Pagos: entrada manual, derivado+entrada y el catálogo → ROL_SIN_PERMISO; derivado+salida → ok; requerimiento con campos [estado] y consumido → ok; con campos [cantidad_ajustada] → ROL_SIN_PERMISO', async () => {
    const db = await plantilla();
    const r = await enT(db, 'pag', t => lote(t, [
      mov('p1'),
      mov('p2', { origen: 'derivado', tipo: 'entrada', cantidad: 3 }),
      mov('p3', { origen: 'derivado', tipo: 'salida', cantidad: -3 }),
      mat('acr-3mm', { nombre: 'Otro nombre', actualizado_en: AHORA() }, { campos: ['nombre'] }),
      req('p1:acr-3mm', { estado: 'consumido', actualizado_en: AHORA() }, { campos: ['estado'] }),
      req('p1:led-12v', { cantidad_ajustada: 3, actualizado_en: AHORA() }, { campos: ['cantidad_ajustada'] }),
      req('p1:pegamento', { estado: 'consumido', folio_hoja: 'V-001', actualizado_en: AHORA() }, { campos: ['estado', 'folio_hoja'] }),
      req('p1:acr-3mm', { estado: 'apartado', actualizado_en: AHORA() }, { campos: ['estado'] }),
      req('p1:acr-3mm', { estado: 'consumido' }, {}),                // sin `campos`: no es la forma que Pagos puede usar
    ]));
    igual(r.resultados.map(x => (x.ok ? 'ok' : x.codigo)), ['ROL_SIN_PERMISO', 'ROL_SIN_PERMISO', 'ok', 'ROL_SIN_PERMISO', 'ok', 'ROL_SIN_PERMISO', 'ok', 'ROL_SIN_PERMISO', 'ROL_SIN_PERMISO']);
    igual(r.resultados.filter(x => !x.ok).every(x => x.definitivo === true), true);
  });
  for (const quien of ['dir', 'fab']) {
    prueba(`AL-06 ${quien}: todo el almacén permitido (movimientos de cualquier tipo y origen, catálogo, listas de compra)`, async () => {
      const db = await plantilla();
      const r = await enT(db, quien, t => lote(t, [mov('x1'), mov('x2', { tipo: 'conteo', cantidad: 4, origen: 'conteo' }), mov('x3', { tipo: 'ajuste', cantidad: -2 }),
                                                  mat('nuevo-mat', { nombre: 'Nuevo', unidad_compra: 'caja', unidad_consumo: 'pieza', factor: 100, actualizado_en: AHORA() }),
                                                  mat('led-12v', { nombre: 'Tira LED nueva', actualizado_en: AHORA() }, { campos: ['nombre'] }),
                                                  req('p1:led-12v', { cantidad_ajustada: 8, motivo_ajuste: 'sobró', actualizado_en: AHORA() }, { campos: ['cantidad_ajustada', 'motivo_ajuste'] })]));
      igual(r.resultados.map(x => x.ok), [true, true, true, true, true, true]);
    });
  }
});

describir('AL-07 y AL-08 el catálogo y las listas: sello por campo y estados que no retroceden', () => {
  prueba('AL-07 dos roles editan campos DISTINTOS del mismo material y coexisten; un cambio atrasado va a «viejos» sin error; el empate escribe', async () => {
    const db = await plantilla();
    const x = await enT(db, 'dir', async t => {
      const a = await lote(t, [mat('acr-3mm', { nombre: 'Acrílico nuevo', actualizado_en: 500 }, { campos: ['nombre'] })]);
      const b = await lote(t, [mat('acr-3mm', { proveedor: 'Plásticos SA', actualizado_en: 400 }, { campos: ['proveedor'] })]);          // otro campo: coexiste
      const viejo = await lote(t, [mat('acr-3mm', { nombre: 'Acrílico viejo', actualizado_en: 300 }, { campos: ['nombre'] })]);          // atrasado
      const empate = await lote(t, [mat('acr-3mm', { nombre: 'Acrílico empate', actualizado_en: 500 }, { campos: ['nombre'] })]);          // empate escribe
      return { a, b, viejo, empate, fila: (await t.query(`select nombre, proveedor, sellos from public.materiales where id = 'acr-3mm'`))[0] };
    });
    igual([x.a.resultados[0].ok, x.b.resultados[0].ok], [true, true]);
    igual(x.viejo.resultados[0], { id: 'op-acr-3mm', ok: true, sin_cambio: true, viejos: ['nombre'] });
    igual([x.empate.resultados[0].ok, x.empate.resultados[0].viejos], [true, []]);
    igual([x.fila.nombre, x.fila.proveedor, x.fila.sellos.nombre, x.fila.sellos.proveedor, x.fila.sellos._editado], ['Acrílico empate', 'Plásticos SA', 500, 400, 500]);
  });
  prueba('AL-07 una operación SIN `campos` (versión anterior de la app) aplica «todos» los datos con la misma regla del sello, y un reenvío idéntico reescribe', async () => {
    const db = await plantilla();
    const x = await enT(db, 'fab', async t => {
      const a = await lote(t, [mat('acr-3mm', { nombre: 'Por todos', proveedor: 'P1', actualizado_en: 700 }, { campos: undefined })]);
      const atras = await lote(t, [mat('acr-3mm', { nombre: 'Atrasado', proveedor: 'P2', actualizado_en: 600 })]);
      return { a, atras, fila: (await t.query(`select nombre, proveedor from public.materiales where id = 'acr-3mm'`))[0] };
    });
    igual(x.a.resultados[0].ok, true);
    igual(x.atras.resultados[0].viejos.sort(), ['nombre', 'proveedor']);
    igual(x.fila, { nombre: 'Por todos', proveedor: 'P1' });
  });
  prueba('AL-08 consumido→calculado, comprado→apartado → «viejos»; comprado→consumido y calculado→comprado → ok', async () => {
    const db = await plantilla();
    await sql(db, `update public.requerimientos set estado = 'consumido' where id = 'p1:acr-3mm'; update public.requerimientos set estado = 'comprado' where id = 'p1:led-12v'`);
    const r = await enT(db, 'fab', async t => {
      const cons = await lote(t, [req('p1:acr-3mm', { estado: 'calculado', actualizado_en: AHORA() }, { campos: ['estado'] })]);
      const comp = await lote(t, [req('p1:led-12v', { estado: 'apartado', actualizado_en: AHORA() }, { campos: ['estado'] })]);
      const compCons = await lote(t, [req('p1:led-12v', { estado: 'consumido', actualizado_en: AHORA() + 1 }, { campos: ['estado'] })]);
      const calcComp = await lote(t, [req('p3:acr-3mm', { estado: 'comprado', actualizado_en: AHORA() }, { campos: ['estado'] })]);
      return { cons, comp, compCons, calcComp, e: (await t.query(`select id, estado from public.requerimientos where id in ('p1:acr-3mm','p1:led-12v','p3:acr-3mm') order by id`)) };
    });
    igual(r.cons.resultados[0].viejos, ['estado']);
    igual(r.comp.resultados[0].viejos, ['estado']);
    igual([r.compCons.resultados[0].ok, r.compCons.resultados[0].viejos, r.calcComp.resultados[0].viejos], [true, [], []]);
    igual(r.e.map(f => [f.id, f.estado]), [['p1:acr-3mm', 'consumido'], ['p1:led-12v', 'consumido'], ['p3:acr-3mm', 'comprado']]);
  });
  prueba('el mismo estado repetido (consumido→consumido) y un campo que no es el estado no se ven afectados por la regla', async () => {
    const db = await plantilla();
    await sql(db, `update public.requerimientos set estado = 'consumido' where id = 'p1:acr-3mm'`);
    const r = await enT(db, 'fab', t => lote(t, [req('p1:acr-3mm', { estado: 'consumido', cantidad_ajustada: 7, actualizado_en: AHORA() }, { campos: ['estado', 'cantidad_ajustada'] })]));
    igual([r.resultados[0].ok, r.resultados[0].viejos], [true, []]);
  });
});

describir('AL-09 y R1-07 los costos: solo Dirección los escribe; Dirección y Pagos los leen; Fabricación ni los recibe', () => {
  const sin = (o, claves) => claves.every(k => !JSON.stringify(o).includes(k));
  prueba('AL-09 Fabricación manda costo_compra y costo_total: se IGNORAN en silencio, no se guardan y no se devuelven', async () => {
    const db = await plantilla();
    const x = await enT(db, 'fab', async t => {
      const r = await lote(t, [mov('c1', { costo_total: 123.45 }), mat('nuevo-f', { nombre: 'Nuevo', unidad_compra: 'caja', unidad_consumo: 'pieza', factor: 1, costo_compra: 77, actualizado_en: AHORA() }),
                              mat('acr-3mm', { costo_compra: 999, actualizado_en: AHORA() }, { campos: ['costo_compra'] })]);
      return { r };
    });
    igual(x.r.resultados.map(r => r.ok), [true, true, true]);
    igual(sin(x.r, ['costo', '123.45', '999', '77']), true, 'ninguna cifra vuelve en la respuesta');
    igual(x.r.resultados[2].sin_cambio, true, 'un cambio de solo costo de Fabricación no cambia nada');
  });
  prueba('AL-09 lo mismo con la base CONFIRMADA: Fabricación manda costos y la tabla almacen_costos no recibe nada', async () => {
    await conCopia(plantilla, async db => {
      const antes = (await sql(db, `select count(*)::int as n from public.almacen_costos`))[0].n;
      await sesionDe(db, db.u.fab).rpc('almacen_aplicar', { p_ops: [mov('cf', { costo_total: 50 }), mat('nuevo-f', { nombre: 'N', unidad_compra: 'caja', unidad_consumo: 'pieza', factor: 1, costo_compra: 70, actualizado_en: AHORA() })] }, { confirmar: true });
      igual((await sql(db, `select count(*)::int as n from public.almacen_costos`))[0].n, antes);
      igual((await sql(db, `select count(*)::int as n from public.almacen_movimientos where id = 'cf'`))[0].n, 1, 'el movimiento sí se guardó');
    });
  });
  prueba('AL-09 Dirección guarda costo_total del movimiento y costo_compra del material en almacen_costos (con su sello); sin devolver cifras', async () => {
    await conCopia(plantilla, async db => {
      const r = (await sesionDe(db, db.u.dir).rpc('almacen_aplicar', { p_ops: [mov('cd', { costo_total: 250.5, ts: 4000 }),
          mat('nuevo-d', { nombre: 'Nuevo', unidad_compra: 'caja', unidad_consumo: 'pieza', factor: 1, costo_compra: 70.25, actualizado_en: 800 }),
          mat('acr-3mm', { costo_compra: 900, actualizado_en: 700 }, { campos: ['costo_compra'] })] }, { confirmar: true }))[0].almacen_aplicar;
      igual(r.resultados.map(x => x.ok), [true, true, true]);
      igual(sin(r, ['250.5', '70.25', '900']), true);
      const k = await sql(db, `select material_id, movimiento_id, importe::text as importe, sello::int as sello from public.almacen_costos order by id`);
      igual(Object.fromEntries(k.filter(x => x.material_id).map(x => [x.material_id, [x.importe, x.sello]])), { 'acr-3mm': ['900', 700], 'nuevo-d': ['70.25', 800] });
      igual(Object.fromEntries(k.filter(x => x.movimiento_id).map(x => [x.movimiento_id, [x.importe, x.sello]])), { m1: ['8505', 1000], cd: ['250.5', 4000] });
    });
  });
  prueba('AL-09 el costo de un material tiene su PROPIO sello: un cambio atrasado de costo va a «viejos»; null con sello nuevo lo borra', async () => {
    await conCopia(plantilla, async db => {
      const D = sesionDe(db, db.u.dir);
      const a = (await D.rpc('almacen_aplicar', { p_ops: [mat('acr-3mm', { costo_compra: 1, actualizado_en: 50 }, { campos: ['costo_compra'] })] }, { confirmar: true }))[0].almacen_aplicar;
      igual(a.resultados[0].viejos, ['costo_compra'], 'el sello del costo sembrado es 100: 50 es más viejo');
      const b = (await D.rpc('almacen_aplicar', { p_ops: [mat('acr-3mm', { costo_compra: 1200, actualizado_en: 200 }, { campos: ['costo_compra'] })] }, { confirmar: true }))[0].almacen_aplicar;
      igual(b.resultados[0].ok, true);
      const c = (await D.rpc('almacen_aplicar', { p_ops: [mat('acr-3mm', { costo_compra: null, actualizado_en: 300 }, { campos: ['costo_compra'] })] }, { confirmar: true }))[0].almacen_aplicar;
      igual(c.resultados[0].ok, true);
      igual((await sql(db, `select importe, sello::int as sello from public.almacen_costos where material_id = 'acr-3mm'`))[0], { importe: null, sello: 300 });
    });
  });
  prueba('Pagos NO escribe costos (no escribe el catálogo) y sus movimientos derivados no guardan costo', async () => {
    await conCopia(plantilla, async db => {
      await sesionDe(db, db.u.pag).rpc('almacen_aplicar', { p_ops: [mov('pd', { origen: 'derivado', tipo: 'salida', cantidad: -1, costo_total: 40 })] }, { confirmar: true });
      igual((await sql(db, `select count(*)::int as n from public.almacen_costos where movimiento_id = 'pd'`))[0].n, 0);
    });
  });
  prueba('R1-07 / AL-09 quién LEE los costos: Dirección y Pagos sí (8505 y 850.5); Fabricación 0 filas', async () => {
    const db = await plantilla();
    for (const [quien, n] of [['dir', 2], ['pag', 2], ['fab', 0]]) igual((await sesionDe(db, db.u[quien]).query(`select count(*)::int as n from public.almacen_costos`))[0].n, n, quien);
  });
  prueba('R1-17 ninguna tabla que lee Fabricación tiene una columna de costo (almacen_movimientos, materiales, requerimientos, constantes)', async () => {
    const db = await plantilla();
    const c = await sql(db, `select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('almacen_movimientos', 'materiales', 'requerimientos', 'constantes')
                              and (column_name like 'costo%' or column_name like '%precio%' or column_name like '%importe%')`);
    igual(c, []);
  });
});

describir('AL-10 a AL-12 lo que no tiene columna, lo fijo y lo que apunta a un proyecto', () => {
  prueba('AL-10 un campo sin columna (color: «frío») va a procedencia.otros en el ALTA y en el CAMBIO, con su sello; no falla', async () => {
    const db = await plantilla();
    const x = await enT(db, 'fab', async t => {
      const alta = await lote(t, [mat('con-color', { nombre: 'Con color', unidad_compra: 'unidad', unidad_consumo: 'pieza', factor: 1, color: 'frío', actualizado_en: 900 })]);
      const cambio = await lote(t, [mat('con-color', { color: 'cálido', brillo: 5, actualizado_en: 950 }, { campos: ['color', 'brillo'] })]);
      const viejo = await lote(t, [mat('con-color', { color: 'viejo', actualizado_en: 10 }, { campos: ['color'] })]);
      return { alta, cambio, viejo, f: (await t.query(`select procedencia, sellos from public.materiales where id = 'con-color'`))[0] };
    });
    igual([x.alta.resultados[0].creada, x.cambio.resultados[0].ok, x.viejo.resultados[0].viejos], [true, true, ['color']]);
    igual(x.f.procedencia, { otros: { color: 'cálido', brillo: 5 } });
    igual([x.f.sellos.color, x.f.sellos.brillo], [950, 950]);
  });
  prueba('AL-11 cambiar id, proyecto_id y material_id de un requerimiento que ya existe: IGNORADOS (la identidad no se cambia)', async () => {
    const db = await plantilla();
    const x = await enT(db, 'fab', async t => {
      const r = await lote(t, [req('p1:acr-3mm', { id: 'otro', proyecto_id: 'p2', material_id: 'led-12v', cantidad_ajustada: 9, actualizado_en: AHORA() })]);
      return { r, f: (await t.query(`select id, proyecto_id, material_id, cantidad_ajustada::text as aj from public.requerimientos where id like '%acr-3mm' order by id`)) };
    });
    igual(x.r.resultados[0].ok, true);
    igual(x.f.map(f => [f.id, f.proyecto_id, f.material_id, f.aj]), [['p1:acr-3mm', 'p1', 'acr-3mm', '9'], ['p3:acr-3mm', 'p3', 'acr-3mm', null]]);
    const m = await enT(db, 'fab', t => lote(t, [mat('acr-3mm', { id: 'otro-id', nombre: 'N', actualizado_en: AHORA() })]));
    igual(m.resultados[0].ok, true);
  });
  prueba('AL-12 un requerimiento NUEVO con un proyecto inexistente → DATO_INVALIDO «ese proyecto no existe»; con id que no es proyecto:material también', async () => {
    const db = await plantilla();
    const r = await enT(db, 'fab', t => lote(t, [req('nada:acr-3mm', { proyecto_id: 'nada', material_id: 'acr-3mm', unidad_compra: 'lamina', cantidad_compra: 1 }),
                                                req('p2:led-12v', { proyecto_id: 'p2', material_id: 'acr-3mm', unidad_compra: 'lamina' }),
                                                req('p2:led-12v', { proyecto_id: 'p2', material_id: 'led-12v' }),
                                                req('p2:led-12v', { proyecto_id: 'p2', material_id: 'led-12v', unidad_compra: 'metro', cantidad_compra: 3 })]));
    igual(r.resultados.map(x => (x.ok ? 'ok' : x.codigo)), ['DATO_INVALIDO', 'DATO_INVALIDO', 'DATO_INVALIDO', 'ok']);
    igual(r.resultados[0].mensaje.includes('proyecto no existe'), true);
  });
  prueba('el requerimiento de un proyecto de OTRA empresa no se puede crear (el proyecto no existe para esta empresa)', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa) values ('ajeno', 'otra', 'V-001', 'hoja', 'Ajeno', 'ganado')`);
      const r = await enT(db, 'dir', t => lote(t, [req('ajeno:acr-3mm', { proyecto_id: 'ajeno', material_id: 'acr-3mm', unidad_compra: 'lamina' })]));
      igual([r.resultados[0].ok, r.resultados[0].codigo], [false, 'DATO_INVALIDO']);
    });
  });
  prueba('un material NUEVO sin unidades o factor (la tabla no las deja vacías) es DATO_INVALIDO y no DESCONOCIDO (que la bandeja reintentaría para siempre)', async () => {
    const db = await plantilla();
    const r = await enT(db, 'fab', t => lote(t, [mat('solo-nombre', { nombre: 'Sin lo obligatorio' }), mat('mal-factor', { nombre: 'x', unidad_compra: 'caja', unidad_consumo: 'pieza', factor: 0 }),
                                                mat('Mal Id', { nombre: 'x', unidad_compra: 'caja', unidad_consumo: 'pieza', factor: 1 }), mat('mal-unidad', { nombre: 'x', unidad_compra: 'cajita', unidad_consumo: 'pieza', factor: 1 }),
                                                mat('merma-rara', { nombre: 'x', unidad_compra: 'caja', unidad_consumo: 'pieza', factor: 1, merma_pct: 5 })]));
    igual(r.resultados.map(x => [x.ok, x.codigo, x.definitivo]), [[false, 'DATO_INVALIDO', true], [false, 'DATO_INVALIDO', true], [false, 'DATO_INVALIDO', true], [false, 'DATO_INVALIDO', true], [false, 'DATO_INVALIDO', true]]);
  });
});

describir('AL-13 a AL-15 lotes: atómico o no, tope de 25 y reloj adelantado', () => {
  const diez = malo => Array.from({ length: 10 }, (_, i) => mov('l' + i, i === 6 ? { tipo: 'salida', cantidad: 5 } : {}));     // el 7.º (índice 6) es inválido
  prueba('AL-13 un lote de 10 con el 7.º inválido: con p_atomico = true NINGUNA fila y LOTE_RECHAZADO con la op fallida; con false, 9 ok y 1 error', async () => {
    const db = await plantilla();
    const antes = (await sql(db, `select count(*)::int as n from public.almacen_movimientos`))[0].n;
    await conCopia(plantilla, async copia => {
      const at = (await sesionDe(copia, copia.u.fab).rpc('almacen_aplicar', { p_ops: diez(), p_atomico: true }, { confirmar: true }))[0].almacen_aplicar;
      igual([at.ok, at.codigo, at.op_fallida, at.definitivo], [false, 'LOTE_RECHAZADO', 'op-l6', true]);
      igual((await sql(copia, `select count(*)::int as n from public.almacen_movimientos`))[0].n, antes, 'ninguna fila entró');
      igual((await sql(copia, `select count(*)::int as n from public.contadores where clave = 'alm' and n > ${antes}`))[0].n, 0, 'y el contador de seq se deshizo');
    });
    await conCopia(plantilla, async copia => {
      const no = (await sesionDe(copia, copia.u.fab).rpc('almacen_aplicar', { p_ops: diez(), p_atomico: false }, { confirmar: true }))[0].almacen_aplicar;
      igual([no.ok, no.resultados.filter(r => r.ok).length, no.resultados.filter(r => !r.ok).length, no.resultados[6].codigo], [true, 9, 1, 'DATO_INVALIDO']);
      igual((await sql(copia, `select count(*)::int as n from public.almacen_movimientos`))[0].n, antes + 9);
    });
  });
  prueba('AL-13 un error de PERMISO también rechaza el lote atómico y es definitivo; un lote vacío es ok', async () => {
    const db = await plantilla();
    const r = (await sesionDe(db, db.u.pag).rpc('almacen_aplicar', { p_ops: [mov('ok', { origen: 'derivado', tipo: 'salida', cantidad: -1 }), mov('no')], p_atomico: true }))[0].almacen_aplicar;
    igual([r.codigo, r.op_fallida, r.definitivo], ['LOTE_RECHAZADO', 'op-no', true]);
    igual((await sesionDe(db, db.u.fab).rpc('almacen_aplicar', { p_ops: [] }))[0].almacen_aplicar, { ok: true, resultados: [] });
  });
  prueba('AL-14 un lote de 26 operaciones → DATO_INVALIDO; de 25, ok; algo que no es un arreglo → DATO_INVALIDO', async () => {
    const db = await plantilla();
    const veintiseis = Array.from({ length: 26 }, (_, i) => mov('b' + i));
    const r = await aplicar(db, 'fab', veintiseis);
    igual([r.ok, r.codigo, r.definitivo], [false, 'DATO_INVALIDO', true]);
    igual((await aplicar(db, 'fab', veintiseis.slice(0, 25))).resultados.length, 25);
    igual((await aplicar(db, 'fab', { id: 'x' })).codigo, 'DATO_INVALIDO');
  });
  prueba('AL-14 una operación mal formada (sin id, almacén inventado, datos que no son objeto) es DATO_INVALIDO y no tumba el resto', async () => {
    const db = await plantilla();
    const r = await aplicar(db, 'fab', [{ almacen: 'movimientos', datos: {} }, { id: 'x', almacen: 'cosas', datos: {} }, { id: 'y', almacen: 'movimientos', datos: 'texto' }, 7, mov('bueno')]);
    igual(r.resultados.map(x => (x.ok ? 'ok' : x.codigo)), ['DATO_INVALIDO', 'DATO_INVALIDO', 'DATO_INVALIDO', 'DATO_INVALIDO', 'ok']);
  });
  prueba('AL-15 el sello de un campo con el reloj adelantado 1 h se ACOTA a ahora + 10 min (ya no «congela» el campo)', async () => {
    const db = await plantilla();
    const ahora = AHORA();
    const x = await enT(db, 'fab', async t => {
      await lote(t, [mat('acr-3mm', { nombre: 'Del futuro', actualizado_en: ahora + 3_600_000 }, { campos: ['nombre'] })]);
      return (await t.query(`select sellos->>'nombre' as s, sellos->>'_editado' as e from public.materiales where id = 'acr-3mm'`))[0];
    });
    for (const v of [x.s, x.e]) cierto(Math.abs(Number(v) - (ahora + 600_000)) < 30_000, 'sello ' + (Number(v) - ahora));
  });
  prueba('sin actualizado_en (o en cero) el sello es la hora del servidor', async () => {
    const db = await plantilla();
    const antes = AHORA();
    const x = await enT(db, 'fab', async t => { await lote(t, [mat('acr-3mm', { nombre: 'Sin sello' }, { campos: ['nombre'] }), mat('led-12v', { nombre: 'Cero', actualizado_en: 0 }, { campos: ['nombre'] })]);
      return (await t.query(`select id, sellos->>'nombre' as s from public.materiales where id in ('acr-3mm', 'led-12v') order by id`)); });
    for (const f of x) cierto(Number(f.s) >= antes - 1000 && Number(f.s) <= AHORA() + 1000, f.id + ' ' + f.s);
  });
});

describir('AL-16 y AL-17 el libro y su seq', () => {
  prueba('AL-16 service_role no puede UPDATE (trigger del libro, P0001) ni DELETE (permission denied, 42501) en almacen_movimientos', async () => {
    const db = await plantilla(), S = como(db, { rol: 'service_role' });
    igual((await S.intentar(`update public.almacen_movimientos set nota = 'x'`)).error.codigo, 'P0001');
    igual((await S.intentar(`delete from public.almacen_movimientos`)).error.codigo, '42501');
  });
  prueba('AL-17 seq es monótono por empresa e independiente entre empresas; service_role también recibe su seq aunque mande uno propio', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `insert into public.almacen_movimientos (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, ts) values ('otra', 'o1', 'x', 'entrada', 1, 'unidad', 'manual', 1), ('otra', 'o2', 'x', 'entrada', 1, 'unidad', 'manual', 2)`);
      const S = como(db, { rol: 'service_role' });
      await S.query(`insert into public.almacen_movimientos (empresa_id, id, seq, material_id, tipo, cantidad, unidad_compra, origen, ts) values ('al3d', 'sr1', 999, 'x', 'entrada', 1, 'unidad', 'manual', 3)`, [], { confirmar: true });
      const f = await sql(db, `select empresa_id, id, seq::int as seq from public.almacen_movimientos where id in ('m1', 'm6', 'o1', 'o2', 'sr1') order by empresa_id, seq`);
      igual(f.map(x => [x.empresa_id, x.id, x.seq]), [['al3d', 'm1', 1], ['al3d', 'm6', 6], ['al3d', 'sr1', 7], ['otra', 'o1', 1], ['otra', 'o2', 2]]);
    });
  });
  prueba('AL-17 no hay huecos ni repeticiones: el índice único (empresa, seq) lo garantiza', async () => {
    const db = await plantilla();
    const r = await sql(db, `select count(*)::int as n, count(distinct seq)::int as d, min(seq)::int as lo, max(seq)::int as hi from public.almacen_movimientos where empresa_id = 'al3d'`);
    igual(r[0], { n: 6, d: 6, lo: 1, hi: 6 });
  });
});

describir('AL-18 constante_guardar', () => {
  const C = (extra = {}) => ({ p_op: { clave: 'K_ANCHO_CAJA', valor: 0.8, unidad: 'ancho ÷ altura', nota: 'medido', version: 'c-2026-10.abcd', ...extra } });
  for (const quien of ['dir', 'fab']) {
    prueba(`AL-18 (${quien}) guarda una constante nueva y la actualiza (upsert): el último gana; queda quién la cambió «correo · área»`, async () => {
      const db = await plantilla();
      const x = await enT(db, quien, async t => {
        const a = await rpcT(t, 'constante_guardar', C());
        const b = await rpcT(t, 'constante_guardar', C({ valor: '0.9' }));
        return { a, b, f: (await t.query(`select clave, valor::text as valor, unidad, nota, version, actualizado_por from public.constantes`)) };
      });
      igual([x.a.ok, x.b.ok], [true, true]);
      igual(x.f, [{ clave: 'K_ANCHO_CAJA', valor: '0.9', unidad: 'ancho ÷ altura', nota: 'medido', version: 'c-2026-10.abcd', actualizado_por: `${quien === 'dir' ? 'dir' : 'fab'}@al3d.test · ${quien === 'dir' ? 'direccion' : 'fabricacion'}` }]);
      igual([x.b.constante.valor, x.b.constante.clave], [0.9, 'K_ANCHO_CAJA']);
    });
  }
  prueba('AL-18 Pagos → ROL_SIN_PERMISO; la clave «_semilla», con caracteres raros o de más de 64, o un valor no numérico → DATO_INVALIDO', async () => {
    const db = await plantilla();
    const p = (await sesionDe(db, db.u.pag).rpc('constante_guardar', C()))[0].constante_guardar;
    igual([p.ok, p.codigo], [false, 'ROL_SIN_PERMISO']);
    const r = await enT(db, 'dir', async t => {
      const out = [];
      for (const extra of [{ clave: '_semilla' }, { clave: 'tiene espacio' }, { clave: 'x'.repeat(65) }, { clave: '' }, { valor: 'mucho' }, { valor: null }, { valor: '' }]) out.push(await rpcT(t, 'constante_guardar', C(extra)));
      return out;
    });
    for (const x of r) igual([x.ok, x.codigo, x.definitivo], [false, 'DATO_INVALIDO', true]);
  });
  prueba('la bitácora general anota la constante con antes/después del valor y SIN importes; las constantes las leen los tres roles', async () => {
    const db = await plantilla();
    const x = await enT(db, 'dir', async t => {
      await rpcT(t, 'constante_guardar', C({ valor: 1 }));
      await rpcT(t, 'constante_guardar', C({ valor: 2 }));
      return t.query(`select nivel, antes, despues from public.bitacora where accion = 'guardo' order by id`);
    });
    igual(x.map(b => [b.nivel, b.antes?.valor ?? null, b.despues.valor]), [['general', null, 1], ['general', 1, 2]]);
    await conCopia(plantilla, async copia => {
      await sesionDe(copia, copia.u.dir).rpc('constante_guardar', C(), { confirmar: true });
      for (const quien of ['dir', 'fab', 'pag']) igual((await sesionDe(copia, copia.u[quien]).query(`select count(*)::int as n from public.constantes`))[0].n, 1, quien);
      igual((await como(copia, { rol: 'anon' }).intentar(`select * from public.constantes`)).error.codigo, '42501');
    });
  });
});

describir('AL-19 y los CHECK de las tablas del almacén', () => {
  prueba('AL-19 requerimientos.id distinto de proyecto_id:material_id → check_violation; el proyecto debe existir (FK compuesta)', async () => {
    const db = await plantilla(), S = como(db, { rol: 'service_role' });
    const ins = (id, proy, mat) => `insert into public.requerimientos (empresa_id, id, proyecto_id, material_id, unidad_compra) values ('al3d', '${id}', '${proy}', '${mat}', 'unidad')`;
    igual((await S.intentar(ins('cualquiera', 'p2', 'acr-3mm'))).error.codigo, '23514');
    igual((await S.intentar(ins('nada:acr-3mm', 'nada', 'acr-3mm'))).error.codigo, '23503');
    igual((await S.intentar(ins('p2:acr-3mm', 'p2', 'acr-3mm'))).ok, true);
    igual((await S.intentar(ins('p1:acr-3mm', 'p1', 'acr-3mm'))).error.codigo, '23505', 'ya existe');
  });
  prueba('los CHECK de movimientos y materiales: signo por tipo, |cantidad| ≤ 1e7, unidades, factor > 0, merma < 1, id de material en minúsculas', async () => {
    const db = await plantilla(), S = como(db, { rol: 'service_role' });
    const mv = (tipo, c) => `insert into public.almacen_movimientos (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, ts) values ('al3d', 'z', 'x', '${tipo}', ${c}, 'unidad', 'manual', 1)`;
    for (const [t, c, esperado] of [['entrada', -1, '23514'], ['salida', 1, '23514'], ['conteo', -1, '23514'], ['ajuste', 0, '23514'], ['merma', 1, '23514'], ['entrada', 10000001, '23514'], ['conteo', 0, 'ok'], ['ajuste', -4, 'ok']]) {
      igual([t, c, (await S.intentar(mv(t, c))).error?.codigo ?? 'ok'], [t, c, esperado]);
    }
    const ma = (cols, vals) => `insert into public.materiales (empresa_id, id, unidad_compra, unidad_consumo, factor ${cols}) values ('al3d', 'zz', 'caja', 'pieza', 1 ${vals})`;
    igual((await S.intentar(`insert into public.materiales (empresa_id, id, unidad_compra, unidad_consumo, factor) values ('al3d', 'Mayus', 'caja', 'pieza', 1)`)).error.codigo, '23514');
    igual((await S.intentar(`insert into public.materiales (empresa_id, id, unidad_compra, unidad_consumo, factor) values ('al3d', 'ok-id', 'caja', 'pieza', 0)`)).error.codigo, '23514');
    igual((await S.intentar(`insert into public.materiales (empresa_id, id, unidad_compra, unidad_consumo, factor, merma_pct) values ('al3d', 'ok-id', 'caja', 'pieza', 1, 1)`)).error.codigo, '23514');
    igual((await S.intentar(ma(', merma_pct', ', 0.99'))).ok, true);
  });
  prueba('las constantes: clave con caracteres raros o «_semilla» → check_violation; el costo: exactamente UNO de material o movimiento', async () => {
    const db = await plantilla(), S = como(db, { rol: 'service_role' });
    for (const clave of ['_semilla', 'con espacio', '']) igual((await S.intentar(`insert into public.constantes (empresa_id, clave, valor) values ('al3d', '${clave}', 1)`)).error.codigo, '23514', clave);
    igual((await S.intentar(`insert into public.almacen_costos (empresa_id, importe) values ('al3d', 5)`)).error.codigo, '23514');
    igual((await S.intentar(`insert into public.almacen_costos (empresa_id, material_id, movimiento_id, importe) values ('al3d', 'acr-3mm', 'm1', 5)`)).error.codigo, '23514');
    igual((await S.intentar(`insert into public.almacen_costos (empresa_id, material_id, importe) values ('al3d', 'acr-3mm', 5)`)).error.codigo, '23505', 'un costo por material');
  });
});

describir('quién LEE el almacén (RLS) y quién no escribe directo', () => {
  prueba('los tres roles leen materiales, requerimientos, movimientos y constantes; anon y un usuario sin fila, nada', async () => {
    const db = await plantilla();
    for (const t of ['materiales', 'requerimientos', 'almacen_movimientos']) {
      for (const quien of ['dir', 'fab', 'pag']) cierto((await sesionDe(db, db.u[quien]).query(`select count(*)::int as n from public.${t}`))[0].n > 0, t + ' ' + quien);
      igual((await sesionDe(db, db.u.ext).query(`select count(*)::int as n from public.${t}`))[0].n, 0, t + ' ext');
      igual((await sesionDe(db, db.u.otra).query(`select count(*)::int as n from public.${t}`))[0].n, 0, t + ' otra empresa');
      igual((await como(db, { rol: 'anon' }).intentar(`select 1 from public.${t}`)).error.codigo, '42501');
    }
  });
  prueba('nadie escribe directo (ni Dirección): insert/update/delete en las cinco tablas del almacén → permission denied', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    for (const t of ['materiales', 'requerimientos', 'almacen_movimientos', 'almacen_costos', 'constantes']) {
      igual((await D.intentar(`update public.${t} set updated_at = now()`)).error.codigo, '42501', t);
      igual((await D.intentar(`delete from public.${t}`)).error.codigo, '42501', t);
    }
  });
});

await resumen();
