// La importación desde la hoja, en lo que le toca a la BASE — A.md §6.4, §6.5 y §10.15, casos IM-02, IM-05, IM-08 (y lo que se puede comprobar de IM-06, IM-07, IM-11, IM-12).
//
// El script importador (fase 2: lee la hoja con `getValues()`, remapea ids, clasifica y escribe con `service_role`) NO existe todavía en esta rama: no se
// prueba aquí. Lo que sí se prueba es todo lo que el importador necesita de la BASE para ser repetible y verificable:
//   · un upsert con los mismos valores no «ensucia» ninguna fila ni gasta números de `seq` (IM-02, IM-11);
//   · las firmas heredadas de la hoja se pueden importar tal cual, con la `codificacion` con que cuadran, y se recalculan idénticas desde la base (IM-05);
//   · los contadores `V`, `P` y `alm` se siembran por ENCIMA de lo que hay y las altas siguientes continúan (IM-08);
//   · lo que el importador resuelve en su lado (una instalación viva por venta, un requerimiento por par (proyecto, material), una salida por par)
//     la base lo IMPIDE por llave, así que un error del importador no puede dejar datos duplicados (IM-06, IM-07, IM-11).
// IM-01, IM-03, IM-04, IM-09, IM-10 (hoja de mentiras, celdas sucias, clasificación, ruta de reportes, «Accesos») son del script y NO están verificados.
import { createHmac } from 'node:crypto';
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sembrarAlmacen, sesionDe, llamar, una, sql, conCopia, como } from '../comun/semilla.js';
import { CLAVE_DEL_MAPA } from '../comun/notario.js';
import * as Sello from '../../functions/_shared/sello.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  await sembrarAlmacen(db);
  return db;
}, { limpiar: db => db.close() });
const SRC = db => como(db, { rol: 'service_role', confirmar: true });
const AHORA = () => Date.now();

/* ------------------------------------------------------------------------------------------------------------------------
   IM-02: un «importador» de juguete que usa los mismos caminos que el de verdad (service_role, upsert por llave natural)
   ------------------------------------------------------------------------------------------------------------------------ */
const PROYECTOS = [
  { id: 'imp1', folio: 'V-801', hist: false, nombre: 'Tarjeta viva importada', etapa: 'ganado', estatus: 'FABRICACION', iva: true, fecha: '2026-09-01', sub: 5000, anti: 2000, liq: 0, cuenta: 'Constru BNT' },
  { id: 'imp2', folio: 'V-802', hist: true, nombre: 'Histórica importada', etapa: null, estatus: 'LIQUIDADO', iva: false, fecha: '2024-03-01', sub: 3000, anti: 1000, liq: 2000, cuenta: 'Elias BBVA' },
];
const importar = (db, cambios = {}) => SRC(db).transaccion(async t => {
  for (const base of PROYECTOS) {
    const p = { ...base, ...(cambios[base.id] ?? {}) };
    await t.query(`insert into public.proyectos (id, empresa_id, folio_hoja, folio_local, dispositivo, fuente, historica, nombre, etapa, estatus, iva, fecha_anticipo)
                   values ($1, 'al3d', $2, $2, 'hoja', 'hoja', $3, $4, $5, $6, $7, $8::date)
                   on conflict (id) do update set folio_hoja = excluded.folio_hoja, historica = excluded.historica, nombre = excluded.nombre, etapa = excluded.etapa, estatus = excluded.estatus, iva = excluded.iva, fecha_anticipo = excluded.fecha_anticipo`,
      [p.id, p.folio, p.hist, p.nombre, p.etapa, p.estatus, p.iva, p.fecha]);
    await t.query(`insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta)
                   values ($1, 'al3d', $2::numeric, $3::numeric, $4::numeric, $5)
                   on conflict (proyecto_id) do update set subtotal = excluded.subtotal, anticipo = excluded.anticipo, liquidacion = excluded.liquidacion, cuenta = excluded.cuenta`,
      [p.id, p.sub, p.anti, p.liq, p.cuenta]);
  }
  await t.query(`insert into public.abonos (empresa_id, folio_hoja, importe, fecha, nota, tipo, op_id) values ('al3d', 'V-801', 100, '2026-09-02', 'importado', 'abono', 'imp:fila:2'), ('al3d', 'V-802', 50, '2026-09-03', 'importado', 'historico', 'imp:fila:3')
                 on conflict (empresa_id, op_id, folio_hoja) where op_id is not null do nothing`);
  await t.query(`insert into public.materiales (empresa_id, id, nombre, unidad_compra, unidad_consumo, factor) values ('al3d', 'imp-mat', 'Material importado', 'lamina', 'm2', 2.9768)
                 on conflict (empresa_id, id) do update set nombre = excluded.nombre, unidad_compra = excluded.unidad_compra, unidad_consumo = excluded.unidad_consumo, factor = excluded.factor`);
  await t.query(`insert into public.requerimientos (empresa_id, id, proyecto_id, material_id, cantidad_compra, unidad_compra, estado) values ('al3d', 'imp1:imp-mat', 'imp1', 'imp-mat', 2, 'lamina', 'calculado')
                 on conflict (empresa_id, id) do update set cantidad_compra = excluded.cantidad_compra, estado = excluded.estado`);
  await t.query(`insert into public.constantes (empresa_id, clave, valor, unidad) values ('al3d', 'imp_merma', 0.05, '') on conflict (empresa_id, clave) do update set valor = excluded.valor, unidad = excluded.unidad`);
  await t.query(`insert into public.almacen_movimientos (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, ts) values ('al3d', 'imp-mov-1', 'imp-mat', 'entrada', 10, 'lamina', 'compra', 1), ('al3d', 'imp-mov-2', 'imp-mat', 'entrada', 5, 'lamina', 'compra', 2)
                 on conflict (empresa_id, id) do nothing`);
});
const foto = db => sql(db, `select 'proyectos' as t, id as k, updated_at::text as u from public.proyectos
                            union all select 'ventas_dinero', proyecto_id, updated_at::text from public.ventas_dinero
                            union all select 'abonos', id::text, updated_at::text from public.abonos
                            union all select 'materiales', id, updated_at::text from public.materiales
                            union all select 'requerimientos', id, updated_at::text from public.requerimientos
                            union all select 'constantes', clave, updated_at::text from public.constantes
                            union all select 'almacen_movimientos', id || '/' || seq, updated_at::text from public.almacen_movimientos
                            union all select 'contadores', empresa_id || '/' || clave || '/' || ventana || '=' || n, updated_at::text from public.contadores
                            order by 1, 2`);

describir('IM-02 una segunda corrida idéntica no cambia nada', () => {
  prueba('IM-02 la misma importación dos veces: NINGUNA fila cambia (updated_at intacto en proyectos, ventas_dinero, abonos, materiales, requerimientos, constantes, almacén y contadores); el reporte de cambios queda vacío', () => conCopia(plantilla, async db => {
    await importar(db);
    const f1 = await foto(db);
    cierto(f1.filter(x => x.k === 'imp1' || x.k === 'imp2').length >= 2, 'la primera corrida sí escribió');
    await new Promise(r => setTimeout(r, 15));                       // para que un updated_at tocado en falso se note
    await importar(db);
    const f2 = await foto(db);
    const cambios = f2.filter((x, i) => x.u !== f1[i]?.u || x.k !== f1[i]?.k || x.t !== f1[i]?.t);
    igual([f2.length, cambios], [f1.length, []], 'cero filas distintas');
  }));
  prueba('IM-02 si cambia UN dato en la hoja, solo esa fila avanza su updated_at (y su sello de lectura incremental); las demás siguen intactas', () => conCopia(plantilla, async db => {
    await importar(db);
    const f1 = await foto(db);
    await new Promise(r => setTimeout(r, 15));
    await importar(db, { imp1: { nombre: 'Tarjeta viva CAMBIADA' } });
    const f2 = await foto(db);
    const cambios = f2.filter((x, i) => x.u !== f1[i].u).map(x => x.t + ':' + x.k);
    igual(cambios, ['proyectos:imp1']);
    igual((await una(db, `select nombre from public.proyectos where id = 'imp1'`)).nombre, 'Tarjeta viva CAMBIADA');
  }));
  prueba('IM-02 / IM-11 un id de movimiento que ya existe NO gasta `seq` (el ON CONFLICT DO NOTHING lo descarta): el contador alm no sube en la segunda corrida y no quedan huecos', () => conCopia(plantilla, async db => {
    await importar(db);
    const alm1 = (await una(db, `select n::int as n from public.contadores where empresa_id = 'al3d' and clave = 'alm' and ventana = ''`)).n;
    const seqs1 = (await sql(db, `select seq::int as s from public.almacen_movimientos order by seq`)).map(r => r.s);
    await importar(db); await importar(db);
    const alm2 = (await una(db, `select n::int as n from public.contadores where empresa_id = 'al3d' and clave = 'alm' and ventana = ''`)).n;
    igual([alm2, (await sql(db, `select seq::int as s from public.almacen_movimientos order by seq`)).map(r => r.s)], [alm1, seqs1]);
    igual(seqs1, Array.from({ length: seqs1.length }, (_, i) => i + 1), 'el libro tiene 1..N sin huecos');
  }));
  prueba('IM-11 la salida del corte es una por par (proyecto, material) por id determinista `mov-salida:<req.id>`: un segundo intento (otro teléfono, otra corrida) no duplica ni gasta seq', () => conCopia(plantilla, async db => {
    const ins = () => SRC(db).query(`insert into public.almacen_movimientos (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, ts, proyecto_id, requerimiento_id)
                                     values ('al3d', 'mov-salida:p1:acr-3mm', 'acr-3mm', 'salida', -2.5, 'lamina', 'derivado', 9, 'p1', 'p1:acr-3mm') on conflict (empresa_id, id) do nothing`);
    await ins();
    const antes = (await una(db, `select max(seq)::int as s, count(*)::int as n from public.almacen_movimientos`));
    await ins(); await ins();
    igual(await una(db, `select max(seq)::int as s, count(*)::int as n from public.almacen_movimientos`), antes);
    igual((await una(db, `select count(*)::int as n from public.almacen_movimientos where id = 'mov-salida:p1:acr-3mm'`)).n, 1);
  }));
});

describir('IM-05 la prueba de oro de las firmas, en lo que le toca a la base', () => {
  /* Filas «de la hoja»: textos de todo tipo firmados con la clave FALSA, unos con ASCII-? y otros con UTF-8 (las heredadas no dicen con cuál). */
  const BASES = [
    ['ascii v1', { proyecto: 'Tacos de Antes', renglones: '', itemsAuth: '' }], ['v1 con ajustes', { proyecto: 'Tacos', renglones: '', itemsAuth: '1:8500.00,10:5.00,2:1500.00' }],
    ['v2 con «»', { proyecto: 'Tacos El Güero', renglones: '[["Letras «TACOS»",8,9600],["Bastidor",1,1710]]', itemsAuth: '' }], ['v2 con Ñ', { proyecto: 'Ñandú y Compañía', renglones: '[["Pieza",2,2469.12]]', itemsAuth: '' }],
    ['v2 con emoji', { proyecto: 'Pizzas 🍕 Roma', renglones: '[["Caja de luz",1,5000]]', itemsAuth: '2:1500.00' }], ['v2 ascii', { proyecto: 'Tacos El Guero', renglones: '[["Letras",8,9600]]', itemsAuth: '' }],
    ['v2 con U+2028 y comillas', { proyecto: 'Tacos "El Güero" |   x', renglones: '[["a \\"b\\"",1,1]]', itemsAuth: '' }],
  ];
  const construir = async () => {
    const filas = [];
    let n = 0;
    for (const cod of ['ascii-?', 'utf-8']) {
      for (const [que, b] of BASES) {
        n++;
        const r = { folio: `COT-${String(1000 + n).padStart(4, '0')}-B@K7QM`, huella: 'c|1:letras~al-paint~recta~true~40~8~~~~~~~~', subCalc: 1000 + n, precioAuth: n % 2 ? 0 : 1500, itemsAuth: b.itemsAuth, total: 1160 + n,
                    proyecto: b.proyecto, correo: 'elias@al3d.mx', ts: new Date(Date.UTC(2026, 0, 1, 12, 0, n, n)).toISOString(), renglones: b.renglones };
        const s = await Sello.sellar(r, CLAVE_DEL_MAPA, { codificacion: cod });
        filas.push({ que: `${que} (${cod})`, firmadaCon: cod, r, firma: s.firma, codigo: s.codigo, alterada: null });
      }
    }
    // tres alteradas a mano DESPUÉS de firmar: ts, renglones y proyecto
    for (const [i, campo] of [[2, 'ts'], [3, 'renglones'], [4, 'proyecto']]) {
      const f = filas[i];
      f.alterada = campo;
      f.r = { ...f.r, [campo]: campo === 'ts' ? '2026-01-01T12:00:59.999Z' : campo === 'renglones' ? f.r.renglones.replace('2', '3') : f.r.proyecto + ' (editado)' };
    }
    return filas;
  };
  const dinero2 = Sello.dinero2;
  /** Las columnas de una fila de «Autorizaciones» (17 de la hoja) como las llevaría el importador a `autorizaciones`. */
  const filaDeHoja = f => ({ folio_global: f.r.folio, huella: f.r.huella, sub_calc: dinero2(f.r.subCalc), precio_auth: dinero2(f.r.precioAuth), total: dinero2(f.r.total), items_auth: f.r.itemsAuth,
                             proyecto: f.r.proyecto, autorizo: f.r.correo, ts_iso: f.r.ts, renglones: f.r.renglones, codigo: f.codigo, firma: f.firma, estado: 'vigente' });   // SIN `codificacion`: la hoja no la tiene
  const asciiInterr = t => Uint8Array.from([...String(t)].map(c => (c.codePointAt(0) < 128 ? c.codePointAt(0) : 63)));
  const hmac = (texto, clave, cod) => (cod === 'utf-8' ? createHmac('sha256', Buffer.from(clave, 'utf8')).update(Buffer.from(texto, 'utf8')).digest('hex') : createHmac('sha256', asciiInterr(clave)).update(asciiInterr(texto)).digest('hex'));

  prueba('IM-05 filas firmadas con ASCII-? y con UTF-8 (más tres alteradas a mano): el importador clasifica con verificar() sin pedir la codificación, las guarda con la que cuadró, y desde la base TODAS las buenas se recalculan idénticas', () => conCopia(plantilla, async db => {
    const filas = await construir();
    const reporte = [];
    const S = SRC(db);
    for (const [i, f] of filas.entries()) {
      const hoja = filaDeHoja(f);
      const v = await Sello.verificar(hoja, CLAVE_DEL_MAPA);                        // legado: sin `codificacion` → prueba ascii-? y luego utf-8
      const cod = v.valida ? (v.codificacion === 'ascii' ? 'ascii-?' : v.codificacion) : 'ascii-?';        // «ascii» = texto todo ASCII: da lo mismo; se guarda la de los sellos nuevos
      if (!v.valida) reporte.push({ folio: hoja.folio_global, motivo: v.motivo, alterada: f.alterada });
      await S.query(`insert into public.autorizaciones (empresa_id, folio_global, huella, sub_calc_txt, precio_auth_txt, items_auth, total_txt, proyecto, autorizo, ts_iso, renglones, cliente, solicito, codigo, firma, estado, origen, fila_hoja, codificacion)
                     values ('al3d', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '', 'token de pagos', $11, $12, 'vigente', 'importada_hoja', $13, $14)`,
        [hoja.folio_global, hoja.huella, hoja.sub_calc, hoja.precio_auth, hoja.items_auth, hoja.total, hoja.proyecto, hoja.autorizo, hoja.ts_iso, hoja.renglones, hoja.codigo, hoja.firma, i + 2, cod]);
      f.codificacionGuardada = cod; f.veredicto = v;
    }
    // las tres alteradas aparecen en el reporte y NO abortaron la importación
    igual(reporte.map(x => [x.alterada, x.motivo]), [['ts', 'firma_no_coincide'], ['renglones', 'firma_no_coincide'], ['proyecto', 'firma_no_coincide']]);
    igual((await una(db, `select count(*)::int as n from public.autorizaciones`)).n, filas.length, 'todas se importaron, también las alteradas');
    // desde la base: cada buena se recalcula idéntica, con la codificación guardada
    const guardadas = await SRC(db).query(`select folio_global, ts_iso, proyecto, sub_calc_txt as sub_calc, precio_auth_txt as precio_auth, total_txt as total, items_auth, huella, autorizo, renglones, codigo, firma, estado, codificacion from public.autorizaciones order by fila_hoja`);
    let buenas = 0, conAscii = 0, conUtf8 = 0;
    for (const [i, g] of guardadas.entries()) {
      const f = filas[i];
      const v = await Sello.verificar(g, CLAVE_DEL_MAPA);
      if (f.alterada) { igual([f.que, v.valida], [f.que, false]); continue; }
      igual([f.que, v.valida, v.motivo], [f.que, true, 'ok']);
      igual(g.codificacion, f.codificacionGuardada, f.que);
      igual(hmac(Sello.canonDe(Sello.registroDeFila(g)), CLAVE_DEL_MAPA, g.codificacion), g.firma, f.que + ': firma idéntica recalculada con node:crypto');
      buenas++; if (g.codificacion === 'utf-8') conUtf8++; else conAscii++;
    }
    igual(buenas, filas.length - 3);
    // lo firmado con utf-8 y no ASCII se guardó «utf-8» (4); lo firmado con ascii-? y lo todo-ASCII, «ascii-?» (7): 11 buenas de 14
    igual([conAscii, conUtf8], [7, 4]);
    cierto(conUtf8 > 0 && conAscii > 0, 'hay filas de las dos codificaciones');
  }), { tiempo: 120_000 });
  prueba('IM-05 la base devuelve las importadas con la codificación guardada y verificar() las acepta: autorizacion_para_verificar → verificar()', () => conCopia(plantilla, async db => {
    const filas = await construir();
    const S = SRC(db);
    const buena = filas.find(f => !f.alterada && f.firmadaCon === 'utf-8' && f.que.startsWith('v2 con emoji'));
    const hoja = filaDeHoja(buena);
    await S.query(`insert into public.autorizaciones (empresa_id, folio_global, huella, sub_calc_txt, precio_auth_txt, items_auth, total_txt, proyecto, autorizo, ts_iso, renglones, cliente, solicito, codigo, firma, estado, origen, fila_hoja, codificacion)
                   values ('al3d', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '', 'token de pagos', $11, $12, 'vigente', 'importada_hoja', 2, 'utf-8')`,
      [hoja.folio_global, hoja.huella, hoja.sub_calc, hoja.precio_auth, hoja.items_auth, hoja.total, hoja.proyecto, hoja.autorizo, hoja.ts_iso, hoja.renglones, hoja.codigo, hoja.firma]);
    const r = await llamar(como(db, { rol: 'service_role' }), 'autorizacion_para_verificar', { p_folio: hoja.folio_global.split('@')[0], p_codigo: hoja.codigo });
    igual(r.filas.length, 1);
    igual([r.filas[0].codificacion, (await Sello.verificar(r.filas[0], CLAVE_DEL_MAPA)).valida], ['utf-8', true]);
    igual((await Sello.verificar({ ...r.filas[0], codificacion: 'ascii-?' }, CLAVE_DEL_MAPA)).valida, false, 'con la otra codificación no cuadra: por eso cada fila recuerda la suya');
  }));
});

describir('IM-06, IM-07 y IM-12 lo que la base impide aunque el importador se equivoque', () => {
  prueba('IM-06 una sola instalación viva por proyecto: una segunda viva choca (23505); la sobrante se importa «cancelada»; los ids de calendario no cambian de dueño', () => conCopia(plantilla, async db => {
    await sql(db, `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics, ventana, movida) values ('im-a', 'al3d', 'p2', '2026-11-01', 'confirmada', 'inst-im-a@al3d.mx', 'dia', 2)`);
    await esperarError(sql(db, `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics, ventana, movida) values ('im-b', 'al3d', 'p2', '2026-11-02', 'confirmada', 'inst-im-b@al3d.mx', 'dia', 1)`), '23505');
    await sql(db, `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics, ventana, movida) values ('im-b', 'al3d', 'p2', '2026-11-02', 'cancelada', 'inst-im-b@al3d.mx', 'dia', 1)`);
    igual(await sql(db, `select id, estado from public.instalaciones where proyecto_id = 'p2' order by id`).then(f => f.map(x => [x.id, x.estado])), [['im-a', 'confirmada'], ['im-b', 'cancelada']]);
    await esperarError(sql(db, `update public.instalaciones set proyecto_id = 'p1' where id = 'im-a'`), 'P0001');
  }));
  prueba('IM-07 un requerimiento por par (proyecto, material): el id ES proyecto:material (un duplicado choca por llave; un id distinto del par viola el CHECK)', () => conCopia(plantilla, async db => {
    await esperarError(sql(db, `insert into public.requerimientos (empresa_id, id, proyecto_id, material_id, cantidad_compra, unidad_compra, estado) values ('al3d', 'p1:acr-3mm', 'p1', 'acr-3mm', 9, 'lamina', 'consumido')`), '23505');
    await esperarError(sql(db, `insert into public.requerimientos (empresa_id, id, proyecto_id, material_id, cantidad_compra, unidad_compra, estado) values ('al3d', 'otro-id', 'p2', 'acr-3mm', 9, 'lamina', 'calculado')`), '23514');
  }));
  prueba('IM-12 una cotización con aparato desconocido entra con disp = HIST+hash6 y procedencia.disp_inferido = true (la subida única lo hace; aquí se comprueba en la tabla)', () => conCopia(plantilla, async db => {
    const r = await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'subida_unica', { p_lote: { cotizaciones: [{ folio: 'COT-0777-B', proy: 'x', cliente: 'y', fecha: '2026-01-01', items: [] }] } });
    igual(r.resumen.creadas, 1);
    const c = await una(db, `select disp, procedencia -> 'disp_inferido' as inf from public.cotizaciones where folio = 'COT-0777-B'`);
    cierto(/^HIST[0-9a-f]{6}$/.test(c.disp), c.disp);
    igual(c.inf, true);
  }));
});

describir('IM-08 los contadores se siembran por encima de lo que hay', () => {
  prueba('IM-08 V: sembrar con el máximo de la hoja, sus respaldos, la bitácora y los abonos; la siguiente alta es máximo + 1 (V-1000 no se trunca) y repetir la siembra con menos no baja nada', () => conCopia(plantilla, async db => {
    await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe, fecha, nota, tipo) values ('al3d', 'V-999', 1, interno.hoy_mx(), 'folio más alto de los abonos', 'abono')`);
    const maximo = Number((await una(db, `select greatest((select max(substr(folio_hoja, 3)::int) from public.proyectos), (select max(substr(folio_hoja, 3)::int) from public.abonos)) as m`)).m);
    igual(maximo, 999);
    const S = SRC(db);
    igual(Number((await S.rpc('contador_sembrar', { p_empresa: 'al3d', p_clave: 'V', p_minimo: maximo }))[0].contador_sembrar), 999);
    igual(Number((await S.rpc('contador_sembrar', { p_empresa: 'al3d', p_clave: 'V', p_minimo: 214 }))[0].contador_sembrar), 999, 'repetir con menos no baja');
    const alta = id => ({ p_op: { id, nombre: 'Venta ' + id, cuenta: 'Moni MPago', tipo_trabajo: ['Rotulacion de vinil'], tel: '33 2222 3333', entrega: 'paqueteria', subtotal: 100, anticipo: 10, sellos: { etapa: AHORA() } } });
    const D = sesionDe(db, db.u.dir, { confirmar: true });
    igual([(await llamar(D, 'alta_venta', alta('i1'))).folio_hoja, (await llamar(D, 'alta_venta', alta('i2'))).folio_hoja], ['V-1000', 'V-1001']);
  }));
  prueba('IM-08 P: sembrar con el máximo P-### de «Abonos comisión»; el siguiente reparto es P-(máximo + 1)', () => conCopia(plantilla, async db => {
    await SRC(db).rpc('contador_sembrar', { p_empresa: 'al3d', p_clave: 'P', p_minimo: 41 });
    const r = await llamar(sesionDe(db, db.u.pag, { confirmar: true }), 'repartir_abono_fifo', { p_monto: 50, p_op_id: 'im08' });
    igual([r.ok, r.pago_id], [true, 'P-042']);
  }));
  prueba('IM-08 alm: sembrar con ALMACEN_SECUENCIA (300); el siguiente movimiento sale con seq 301 y los anteriores conservan el suyo', () => conCopia(plantilla, async db => {
    const antes = (await una(db, `select max(seq)::int as s from public.almacen_movimientos`)).s;
    igual(antes, 6);
    await SRC(db).rpc('contador_sembrar', { p_empresa: 'al3d', p_clave: 'alm', p_minimo: 300 });
    const mov = { id: 'op-im8', almacen: 'movimientos', tipo: 'apendice', registro_id: 'im8', datos: { id: 'im8', material_id: 'acr-3mm', tipo: 'entrada', cantidad: 1, unidad_compra: 'lamina', origen: 'manual', nota: '', usuario: 'Fab', rol: 'fabricacion', dispositivo: 'D1', firma: 'Fab', ts: AHORA() } };
    igual((await llamar(sesionDe(db, db.u.fab, { confirmar: true }), 'almacen_aplicar', { p_ops: [mov] })).resultados[0].creada, true);
    igual((await una(db, `select seq::int as s from public.almacen_movimientos where id = 'im8'`)).s, 301);
    igual((await una(db, `select count(*)::int as n from public.almacen_movimientos where seq <= 6`)).n, 6);
  }));
});

await resumen();
