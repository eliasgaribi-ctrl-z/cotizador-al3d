/* LAS FACTURAS DE LAS VENTAS FISCALES — js/datos/facturas.js y la pestaña «Facturas» de Control (js/mod/facturas.js), 0027
 * (decidido por Elías el 2026-10-25; docs/DINERO-Y-FACTURAS.md).
 *
 * Con un DOBLE de supabase-js (no toca Supabase ni Google). Lo que se vigila:
 *   · el RFC y la razón social con las MISMAS reglas que la base (interno.rfc_limpio / interno.rfc_problema de 0027);
 *   · el archivo de la constancia: PDF o foto de hasta 5 MB, y su ruta con la forma que exige la política del bucket
 *     (opcional/constancias.sql) y `constancia_registrar`;
 *   · la lista: solo las ventas de una cuenta fiscal, sin las canceladas; un cliente con varias ventas es UNO, con una constancia;
 *     qué está pendiente de factura; los filtros (pendientes, todas, periodo, búsqueda) y las cuentas de arriba;
 *   · lo que se manda: cada acción a SU función con sus argumentos exactos y su op_id; marcar no pregunta, desmarcar sí (peligro);
 *     un RFC nuevo pide su razón social;
 *   · las respuestas: lo que la base no aceptó se dice con su frase y «no se guardó nada»; lo que no contestó, como incierto;
 *   · la subida: archivo y registro, y el reintento de un registro sin respuesta NO vuelve a subir el archivo;
 *   · y la pantalla: no guarda nada en el teléfono, escucha Realtime, abre la ventana de la constancia dentro del toque.
 *
 * Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');

/* El entorno de la pantalla (como pruebas/pagos-supa.mjs): almacenamiento de mentiras, la ventana como blanco de eventos y un doble de
   supabase-js que contesta según el escenario de ahora. */
const mapa = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; };
globalThis.localStorage = mapa();
globalThis.sessionStorage = mapa();
globalThis.document = { activeElement: null, getElementById: () => null };
{ const et = new EventTarget(); globalThis.addEventListener = et.addEventListener.bind(et); globalThis.removeEventListener = et.removeEventListener.bind(et); globalThis.dispatchEvent = et.dispatchEvent.bind(et); }
const llamadas = [];
let ESC = {};
const dobleGlobal = {
  auth: { getSession: async () => ({ data: { session: ESC.sesion ? { access_token: 'falso' } : null } }) },
  rpc: async (n, a) => { llamadas.push(['rpc', n]); return ESC.rpc ? ESC.rpc(n, a) : { data: { ok: true }, error: null }; },
  from: t => {
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q,
      range: async (a, b) => { llamadas.push(['from', t]); return { data: ((ESC.tablas || {})[t] || []).slice(a, b + 1), error: null }; } };
    return q;
  },
};
globalThis.supabase = { createClient: () => dobleGlobal };

const F = await import('../js/datos/facturas.js');
const HOY = '2026-10-25';

/* ============================================================================ */
console.log('\nEL RFC: las reglas de la base');
{
  eq('limpio: mayúsculas (la ñ también), sin espacios, puntos ni guiones', [F.rfcLimpio(' abc-010203 xy1 '), F.rfcLimpio('ñ&o.990101.ab9'), F.rfcLimpio(null)],
    ['ABC010203XY1', 'Ñ&O990101AB9', '']);
  const casos = [['ABC010203XY1', null], ['GOMA850615H2A', null], ['Ñ&O990101AB9', null], ['MAG000229AB1', null],
    ['', /Falta el RFC/], ['AB010203XY1', /forma del SAT/], ['ABCDE010203XY1', /forma del SAT/], ['ABC0102031XY', /forma del SAT/], ['ABC010203XYB', /forma del SAT/],
    ['ABC011303XY1', /no existe/], ['ABC010231XY1', /no existe/], ['ABC010229XY1', /no existe/], ['XAXX010101000', /genérico/], ['XEXX010101000', /genérico/]];
  for (const [rfc, esperado] of casos) {
    const m = F.rfcProblema(rfc);
    eq('«' + rfc + '» → ' + (esperado ? esperado.source : 'sirve'), esperado ? esperado.test(m || '') : m, esperado ? true : null);
  }
  /* La forma es LA MISMA expresión que la base (el CHECK de la tabla, interno.rfc_problema y la política del bucket). */
  const sql = leer('supabase/migrations/0027_dinero_y_facturas.sql'), bucket = leer('supabase/opcional/constancias.sql');
  const FORMA = '[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2}[0-9A]';
  cierto('la forma del teléfono es la del CHECK de clientes_fiscales, la de interno.rfc_problema y la de la política de subir',
    leer('js/datos/facturas.js').includes('/^' + FORMA + '$/') && sql.includes("rfc ~ '^" + FORMA + "$'") && sql.includes("if p !~ '^" + FORMA + "$' then") && bucket.includes('/' + FORMA + '/csf-'));
  cierto('los mismos dos genéricos', /p in \('XAXX010101000', 'XEXX010101000'\)/.test(sql));
  eq('la razón social: sin espacios de más; vacía o de más de 300, no', [F.leerRazon('  Ana   Gómez ').valor, F.leerRazon(' ').ok, F.leerRazon('x'.repeat(301)).ok], ['Ana Gómez', false, false]);
}

/* ============================================================================ */
console.log('\nLA CONSTANCIA: el archivo');
{
  const MB = 1024 * 1024;
  eq('un PDF, una foto JPG, PNG o WebP: sí, con su extensión', ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].map(t => F.validarConstancia({ type: t, size: 1000, name: 'x' }).ext),
    ['pdf', 'jpg', 'png', 'webp']);
  eq('un navegador que no dice el tipo: por la extensión', F.validarConstancia({ type: '', size: 10, name: 'CSF ABC.PDF' }).tipo, 'application/pdf');
  cierto('una foto HEIC del iPhone: no, y dice cómo', /HEIC/.test(F.validarConstancia({ type: 'image/heic', size: 10, name: 'IMG_1.HEIC' }).mensaje));
  cierto('un HTML o un Word: no', !F.validarConstancia({ type: 'text/html', size: 10, name: 'a.html' }).ok && !F.validarConstancia({ type: 'application/msword', size: 10, name: 'a.doc' }).ok);
  cierto('vacío: no', !F.validarConstancia({ type: 'application/pdf', size: 0, name: 'a.pdf' }).ok);
  eq('hasta 5 MB justos sí; un byte más, no (y dice cuánto pesa)', [F.validarConstancia({ type: 'application/pdf', size: 5 * MB }).ok, /5\.1 MB.*5 MB/.test(F.validarConstancia({ type: 'image/jpeg', size: 5.1 * MB }).mensaje)], [true, true]);
  eq('el tope del teléfono es el del bucket y el de la base', F.TOPE_CONSTANCIA, 5242880);
  cierto('… y lo dicen constancias.sql y 0027', /values \('constancias-fiscales', 'constancias-fiscales', false, 5242880,/.test(leer('supabase/opcional/constancias.sql')) &&
    /v_bytes > 5242880/.test(leer('supabase/migrations/0027_dinero_y_facturas.sql')));
  /* La ruta: la que arma el teléfono pasa la expresión de la política de subir y la de constancia_registrar. */
  const pol = /name ~ '(\^\[a-z\][^']*)'/.exec(leer('supabase/opcional/constancias.sql'))[1].replace(/\\\./g, '\\.');
  const re = new RegExp(pol);
  const id = F.idDeConstancia();
  const ruta = F.rutaDeConstancia('al3d', 'ABC010203XY1', 'pdf', id);
  eq('la ruta: <empresa>/<RFC>/csf-<id>.<ext>', ruta.replace(id, 'ID'), 'al3d/ABC010203XY1/csf-ID.pdf');
  cierto('y pasa la expresión de la política de SUBIR del bucket (' + pol + ')', re.test(ruta) && re.test(F.rutaDeConstancia('al3d', 'GOMA850615H2A', 'webp', F.idDeConstancia())));
  cierto('un id de ruta, de 8 a 64 letras, números y guiones, distinto cada vez', /^[A-Za-z0-9-]{8,64}$/.test(id) && F.idDeConstancia() !== id);
  eq('el bucket acepta lo mismo que el teléfono', F.ACEPTA, 'application/pdf,image/jpeg,image/png,image/webp');
}

/* ============================================================================ */
console.log('\nLA LISTA');
/* Lo que contesta la base: ventas_calculadas (la vista de fórmulas), ventas_fiscales y clientes_fiscales. */
const calc = (id, folio, cuenta, o = {}) => ({ proyecto_id: id, a_folio: folio, b_proyecto: 'Cliente ' + folio, c_estatus: 'COBRANDO', d_cuenta: cuenta, h_neto: 11600,
  i_anticipo: 5000, j_liquidacion: 0, k_saldo: 6600, l_fecha_anticipo: '2026-10-01', n_fecha_liquidacion: null, etapa: 'armado', ...o });
const CALC = [
  calc('p1', 'V-101', 'Constru BNT'),
  calc('p2', 'V-102', 'Moni MPago', { j_liquidacion: 6600, n_fecha_liquidacion: '2026-10-20', l_fecha_anticipo: '2026-09-01' }),
  calc('p3', 'V-103', 'Tatis BNT', { i_anticipo: 0, l_fecha_anticipo: '2026-10-10' }),                     // sin cobrar todavía
  calc('p4', 'V-104', 'Elias BBVA'),                                                                       // no factura: fuera
  calc('p5', 'V-105', 'Constru BNT', { etapa: 'cancelado' }),                                              // cancelada: fuera
  calc('p6', 'V-106', 'Constru BNT', { l_fecha_anticipo: '2025-03-01', j_liquidacion: 1000, n_fecha_liquidacion: '2025-04-01' }),
  calc('p7', 'V-107', 'Rul HSBC'),                                                                         // no factura: fuera
];
const FISC = [
  { proyecto_id: 'p1', rfc: 'ABC010203XY1', factura_anticipo: true, factura_anticipo_por: 'pag@al3d.test', factura_anticipo_en: '2026-10-03T18:00:00Z',
    factura_liquidacion: false, factura_liquidacion_por: '', factura_liquidacion_en: null },
  { proyecto_id: 'p2', rfc: 'ABC010203XY1', factura_anticipo: true, factura_anticipo_por: 'dir@al3d.test', factura_anticipo_en: '2026-09-02T18:00:00Z',
    factura_liquidacion: false, factura_liquidacion_por: '', factura_liquidacion_en: null },
  { proyecto_id: 'p4', rfc: null, factura_anticipo: false, factura_liquidacion: false },
];
const CLI = [
  { rfc: 'ABC010203XY1', razon_social: 'Constructora ABC', csf_ruta: 'al3d/ABC010203XY1/csf-11111111.pdf', csf_tipo: 'application/pdf', csf_bytes: 1000,
    csf_subida_en: '2026-10-02T18:00:00Z', csf_subio: 'pag@al3d.test' },
  { rfc: 'GOMA850615H2A', razon_social: 'Ana Gómez', csf_ruta: null },
];
const L = F.armarLista(CALC, FISC, CLI);
{
  eq('solo las de una cuenta fiscal (Constru, Moni, Tatis), sin la cancelada, de la más nueva a la más vieja', L.ventas.map(v => v.folio), ['V-106', 'V-103', 'V-102', 'V-101']);
  const v1 = L.ventas.find(v => v.id === 'p1');
  eq('una venta con su cliente, su constancia y sus casillas', [v1.rfc, v1.razon, v1.csf.ruta, v1.fa, v1.fl.marcada, v1.deQuien],
    ['ABC010203XY1', 'Constructora ABC', 'al3d/ABC010203XY1/csf-11111111.pdf', { marcada: true, por: 'pag@al3d.test', en: '2026-10-03T18:00:00Z' }, false, 'ConstruImagen']);
  eq('qué falta facturar: p1 nada (no se ha liquidado); p2 la liquidación; p3 nada (no se ha cobrado); p6 las dos',
    L.ventas.map(v => v.folio + ':' + (v.pendientes.anticipo ? 'A' : '') + (v.pendientes.liquidacion ? 'L' : '')), ['V-106:AL', 'V-103:', 'V-102:L', 'V-101:']);
  const abc = L.clientes.find(c => c.rfc === 'ABC010203XY1');
  eq('un cliente con DOS ventas es UNO, con una sola constancia', [abc.nVentas, abc.ventas, !!abc.csf], [2, ['V-102', 'V-101'], true]);
  eq('un cliente sin ventas también está (para subir su constancia antes)', L.clientes.map(c => c.rfc + ':' + c.nVentas), ['GOMA850615H2A:0', 'ABC010203XY1:2']);
  eq('sin nada: listas vacías', F.armarLista(null, null, null), { ventas: [], clientes: [] });
}
{
  eq('PENDIENTES en «Todo»: las que deben una factura', F.filtrar(L.ventas, { filtro: 'pendientes', periodo: 'todo', hoy: HOY }).map(v => v.folio), ['V-106', 'V-102']);
  eq('PENDIENTES en 3 meses (por la fecha del anticipo): V-106 es de 2025', F.filtrar(L.ventas, { filtro: 'pendientes', periodo: '3m', hoy: HOY }).map(v => v.folio), ['V-102']);
  eq('TODAS de este mes', F.filtrar(L.ventas, { filtro: 'todas', periodo: 'mes', hoy: HOY }).map(v => v.folio), ['V-103', 'V-101']);
  eq('buscar por RFC, por razón social sin acentos y por folio', [F.filtrar(L.ventas, { filtro: 'todas', periodo: 'todo', busca: 'abc0102' }).length,
    F.filtrar(L.ventas, { filtro: 'todas', periodo: 'todo', busca: 'constructora' }).length, F.filtrar(L.ventas, { filtro: 'todas', periodo: 'todo', busca: 'v-103' }).length], [2, 2, 1]);
  eq('buscar clientes por razón social sin acentos y por folio de su venta', [F.filtrarClientes(L.clientes, 'gomez').map(c => c.rfc), F.filtrarClientes(L.clientes, 'V-101').map(c => c.rfc)],
    [['GOMA850615H2A'], ['ABC010203XY1']]);
  eq('las cuentas de arriba', F.resumen(L.ventas), { n: 4, pendientes: 2, anticipo: 1, liquidacion: 2, sinCliente: 2, sinConstancia: 0 });
}

/* ============================================================================ */
console.log('\nLO QUE SE MANDA');
{
  const v1 = L.ventas.find(v => v.id === 'p1'), v3 = L.ventas.find(v => v.id === 'p3');
  eq('ligar a un RFC que ya es cliente: sin razón social, sin pregunta', F.planLigar(v3, 'abc 010203 xy1', '', L.clientes, 'op-1'),
    { ok: true, rpc: 'venta_cliente_fiscal', args: { p_op: { op_id: 'op-1', proyecto_id: 'p3', rfc: 'ABC010203XY1' } }, sinPregunta: true, titulo: 'Cliente fiscal de V-103', texto: '', si: 'Guardar' });
  eq('un RFC nuevo pide su razón social', [F.planLigar(v3, 'XYZ991231AB1', '', L.clientes, 'x').errores.razon.includes('todavía no está dado de alta'),
    F.planLigar(v3, 'XYZ991231AB1', ' Equis  Ye ', L.clientes, 'x').args.p_op.razon_social], [true, 'Equis Ye']);
  eq('un RFC malo no sale', F.planLigar(v3, 'XAXX010101000', 'Público', L.clientes, 'x').ok, false);
  eq('el mismo RFC que ya tiene: sin cambio', F.planLigar(v1, 'ABC010203XY1', '', L.clientes, 'x').sinCambio, true);
  const q = F.planLigar(v1, '', '', L.clientes, 'op-q');
  eq('quitarle el cliente: rfc vacío, se pregunta con el botón de peligro', [q.args.p_op, q.peligro, q.sinPregunta], [{ op_id: 'op-q', proyecto_id: 'p1', rfc: '' }, true, undefined]);
  eq('quitárselo a una que no tiene: nada que hacer', F.planLigar(v3, '', '', L.clientes, 'x').sinCambio, true);
  eq('marcar: sin pregunta, con sus argumentos exactos', F.planMarcar(v1, 'liquidacion', true, 'op-m'),
    { ok: true, rpc: 'venta_factura_marcar', args: { p_op: { op_id: 'op-m', proyecto_id: 'p1', cual: 'liquidacion', marcada: true } }, sinPregunta: true, titulo: '', texto: '', si: '' });
  const d = F.planMarcar(v1, 'anticipo', false, 'op-d');
  eq('desmarcar: se pregunta con peligro y dice quién y cuándo la había marcado', [d.peligro, d.si, /marcada por pag@al3d\.test el 03\/10\/2026/.test(d.texto), d.args.p_op.marcada],
    [true, 'Desmarcar', true, false]);
  eq('lo que ya está así: sin cambio', [F.planMarcar(v1, 'anticipo', true, 'x').sinCambio, F.planMarcar(v1, 'iva', true, 'x').ok], [true, false]);
  eq('dar de alta un cliente', F.planCliente(' xyz991231ab1', 'Equis', L.clientes, 'op-c').args, { p_op: { op_id: 'op-c', rfc: 'XYZ991231AB1', razon_social: 'Equis' } });
  eq('la razón social que ya tiene: sin cambio; la otra, sí', [F.planCliente('GOMA850615H2A', 'Ana Gómez', L.clientes, 'x').sinCambio, F.planCliente('GOMA850615H2A', 'Ana Gómez Martínez', L.clientes, 'x').ok],
    [true, true]);
  eq('el día de un instante, en la hora de México', [F.diaDe('2026-10-03T05:00:00Z'), F.diaDe('2026-10-03T07:00:00Z'), F.diaDe('')], ['02/10/2026', '03/10/2026', '']);
}

/* ============================================================================ */
console.log('\nLAS RESPUESTAS Y LAS LLAMADAS (con un doble de supabase-js)');
/* El doble: rpc() contesta lo que se le diga; from() arma la consulta y la contesta por tabla; storage.from() sube y firma. */
function doble(o = {}) {
  const llamadas = [];
  const consulta = tabla => {
    const q = { _t: tabla, _f: [] };
    for (const m of ['select', 'eq', 'in', 'order']) q[m] = (...a) => { q._f.push([m, ...a]); return q; };
    q.range = async (a, b) => { llamadas.push(['from', tabla, JSON.stringify(q._f), a, b]); return o.tablas && o.tablas[tabla] instanceof Error ? { data: null, error: o.tablas[tabla] } : { data: (o.tablas && o.tablas[tabla] || []).slice(a, b + 1), error: null }; };
    return q;
  };
  return {
    llamadas,
    rpc: async (n, args) => { llamadas.push(['rpc', n, args]); if (o.rpcLanza) throw new Error('Failed to fetch'); return o.rpc ? o.rpc(n, args) : { data: { ok: true }, error: null }; },
    from: consulta,
    storage: { from: b => ({
      upload: async (ruta, blob, op) => { llamadas.push(['subir', b, ruta, op.contentType, op.upsert]); return o.subir || { data: { path: ruta }, error: null }; },
      createSignedUrl: async (ruta, s) => { llamadas.push(['firmar', b, ruta, s]); return o.firmar || { data: { signedUrl: 'https://x.test/firmada?t=1' }, error: null }; },
    }) },
  };
}
{
  const c = doble({ rpc: () => ({ data: { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'V-104 cobra en «Elias BBVA», que no factura: solo las ventas de una cuenta fiscal llevan cliente fiscal.' }, error: null }) });
  const r = await F.enviar(c, { rpc: 'venta_cliente_fiscal', args: { p_op: { op_id: 'x' } } });
  eq('lo que la base no aceptó: su frase y «no se guardó nada», seguro', [r.ok, r.incierto, r.mensaje],
    [false, false, 'V-104 cobra en «Elias BBVA», que no factura: solo las ventas de una cuenta fiscal llevan cliente fiscal. No se guardó nada.']);
  const s = await F.enviar(doble({ rpc: () => ({ data: { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'No tienes permiso para esto.' }, error: null }) }), { rpc: 'venta_factura_marcar', args: {} });
  eq('Fabricación (si llegara): «es de Dirección y Pagos»', s.mensaje, 'Esto es de Dirección y Pagos. No se guardó nada.');
  const i = await F.enviar(doble({ rpcLanza: true }), { rpc: 'venta_factura_marcar', args: {} });
  eq('sin respuesta: incierto, y no dice «no se guardó»', [i.ok, i.incierto, /Reintentar/.test(i.mensaje), /No se guardó/.test(i.mensaje)], [false, true, true, false]);
  const ok = await F.enviar(doble({ rpc: () => ({ data: { ok: true, marcada: true }, error: null }) }), { rpc: 'venta_factura_marcar', args: {} });
  eq('lo que sí entró', ok, { ok: true, data: { ok: true, marcada: true } });
}
{
  const c = doble({ tablas: { ventas_calculadas: CALC.filter(x => ['Constru BNT', 'Moni MPago', 'Tatis BNT'].includes(x.d_cuenta)), ventas_fiscales: FISC, clientes_fiscales: CLI } });
  const r = await F.leer(c, 'al3d');
  eq('leer: las tres tablas de la empresa (las ventas, solo de las cuentas fiscales) y la lista armada', [r.ok, r.ventas.length, r.clientes.length], [true, 4, 2]);
  eq('las consultas: la empresa y las cuentas fiscales en el filtro', c.llamadas.filter(x => x[1] === 'ventas_calculadas').map(x => JSON.parse(x[2]).filter(f => f[0] !== 'select')),
    [[['eq', 'empresa_id', 'al3d'], ['in', 'd_cuenta', ['Constru BNT', 'Moni MPago', 'Tatis BNT']], ['order', 'proyecto_id']]]);
  const sin = await F.leer(doble({ tablas: { ventas_fiscales: Object.assign(new Error('relation "public.ventas_fiscales" does not exist'), { code: '42P01' }) } }), 'al3d');
  eq('sin la migración 0027: lo dice', [sin.ok, /0027/.test(sin.mensaje)], [false, true]);
}
{
  const archivo = { type: 'application/pdf', size: 1234, name: 'csf.pdf' };
  const valido = F.validarConstancia(archivo);
  const c = doble({ rpc: (n, a) => ({ data: { ok: true, rfc: a.p_op.rfc, ruta: a.p_op.ruta, reemplaza: false }, error: null }) });
  const r = await F.subirConstancia(c, { empresa: 'al3d', rfc: 'ABC010203XY1', archivo, valido, id: '0a0b0c0d-1111', opId: 'op-s' });
  eq('subir: primero el archivo (sin pisar nada), después le dice a la base cuál es', c.llamadas.map(x => x.slice(0, 2).concat(x[0] === 'subir' ? [x[2], x[3], x[4]] : [x[2]])),
    [['subir', 'constancias-fiscales', 'al3d/ABC010203XY1/csf-0a0b0c0d-1111.pdf', 'application/pdf', false],
     ['rpc', 'constancia_registrar', { p_op: { op_id: 'op-s', rfc: 'ABC010203XY1', ruta: 'al3d/ABC010203XY1/csf-0a0b0c0d-1111.pdf', tipo: 'application/pdf', bytes: 1234 } }]]);
  eq('y contesta la ruta', [r.ok, r.ruta], [true, 'al3d/ABC010203XY1/csf-0a0b0c0d-1111.pdf']);
  const sinResp = doble({ rpcLanza: true });
  const r2 = await F.subirConstancia(sinResp, { empresa: 'al3d', rfc: 'ABC010203XY1', archivo, valido, id: 'ffffffff-2222', opId: 'op-t' });
  eq('el registro sin respuesta: incierto, con la ruta ya subida', [r2.ok, r2.incierto, r2.ruta], [false, true, 'al3d/ABC010203XY1/csf-ffffffff-2222.pdf']);
  const otra = doble({ rpc: (n, a) => ({ data: { ok: true, ruta: a.p_op.ruta }, error: null }) });
  const r3 = await F.subirConstancia(otra, { empresa: 'al3d', rfc: 'ABC010203XY1', archivo, valido, opId: 'op-t', yaSubido: r2.ruta });
  eq('el reintento NO vuelve a subir el archivo: solo el registro, con el mismo op_id y la misma ruta', [r3.ok, otra.llamadas.map(x => x[0] + ':' + (x[2] && x[2].p_op ? x[2].p_op.op_id + '@' + x[2].p_op.ruta : ''))],
    [true, ['rpc:op-t@al3d/ABC010203XY1/csf-ffffffff-2222.pdf']]);
  const rls = await F.subirConstancia(doble({ subir: { error: { message: 'new row violates row-level security policy' } } }), { empresa: 'al3d', rfc: 'ABC010203XY1', archivo, valido, opId: 'x' });
  eq('el bucket no dejó (no es cliente, o no es su área): lo dice, sin registrar nada', [rls.ok, /cliente fiscal/.test(rls.mensaje)], [false, true]);
  const sinBucket = await F.subirConstancia(doble({ subir: { error: { message: 'Bucket not found' } } }), { empresa: 'al3d', rfc: 'ABC010203XY1', archivo, valido, opId: 'x' });
  cierto('sin el bucket: falta aplicar constancias.sql', /constancias\.sql/.test(sinBucket.mensaje));
  const u = doble();
  eq('ver: una URL firmada de cinco minutos del bucket privado', [await F.urlDeConstancia(u, 'al3d/R/csf-1.pdf'), u.llamadas[0]],
    [{ ok: true, url: 'https://x.test/firmada?t=1' }, ['firmar', 'constancias-fiscales', 'al3d/R/csf-1.pdf', 300]]);
  cierto('si no está: lo dice', /vuelve a subirla/.test((await F.urlDeConstancia(doble({ firmar: { data: null, error: { message: 'Object not found' } } }), 'x')).mensaje));
}

/* ============================================================================ */
console.log('\nLA PANTALLA');
{
  const m = sinComentarios(leer('js/mod/facturas.js')), d = sinComentarios(leer('js/datos/facturas.js'));
  cierto('nada de esto se guarda en el teléfono (ni RFC, ni razón social, ni la lista)', !/localStorage|sessionStorage|indexedDB/.test(m + d));
  cierto('la capa de datos no toca el DOM', !/document|window\./.test(d));
  cierto('la regla de quién manda es la de supa.js, y escucha Realtime (`al3d-base-cambio`)', /import \{ laBaseManda \} from '\.\.\/nucleo\/supa\.js';/.test(m) &&
    /addEventListener\('al3d-base-cambio', alCambiarLaBase\)/.test(m));
  cierto('solo pide filas si la base dice Dirección o Pagos (queMostrar → «formularios»)', /_vista = v === 'formularios' \? 'lista'/.test(m) && /if \(_vista === 'lista'\) await leer\(Supa\);/.test(m));
  const marcar = /async function marcar[\s\S]*?\n\}/.exec(m)[0];
  cierto('desmarcar pregunta ANTES de mandar, con el botón de peligro; marcar no', marcar.indexOf('confirmarPf(') > 0 && marcar.indexOf('confirmarPf(') < marcar.indexOf('F.enviar(') &&
    /if \(!p\.sinPregunta\)/.test(marcar) && /peligro: true/.test(marcar));
  cierto('una a la vez por casilla, y después de cada respuesta se relee la base', /if \(!v \|\| _enviando\.has\(clave\)\)/.test(marcar) && /await releer\(\);\n\}$/.test(marcar));
  const ver = /async function verConstancia[\s\S]*?\n\}/.exec(m)[0];
  cierto('la ventana de la constancia se abre DENTRO del toque (antes de esperar a la red), y si no se abre, queda el enlace', ver.indexOf("window.open('', '_blank')") >= 0 &&
    ver.indexOf("window.open('', '_blank')") < ver.indexOf('await ') && /_enlace = \{ ruta, url: r\.url \}/.test(ver));
  cierto('el archivo se elige con los tipos del bucket', /accept="' \+ F\.ACEPTA \+ '"/.test(m));
  cierto('el reintento de una subida sin respuesta va con lo ya subido (yaSubido) y el mismo op_id', /yaSubido: s\.ruta \|\| ''/.test(m) && /opId: s\.opId/.test(m));
  cierto('Control se va: suelta el panel y los oyentes', /export function soltar\(\) \{[\s\S]*?cerrarPanel\(\);[\s\S]*?removeEventListener\('al3d-base-cambio', alCambiarLaBase\)/.test(m) &&
    /if \(_FX\) _FX\.soltar\(\);/.test(leer('js/mod/control.js')));
}

/* ============================================================================ */
console.log('\nLA PESTAÑA, PINTADA (con la base mandando)');
{
  const Prefs = await import('../js/datos/prefs.js');
  const hoyDeVerdad = (await import('../js/nucleo/fechas.js')).hoyISO();
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const abiertas = [];
  async function pestana(nombre, { rolLocal, sesion, area }) {
    for (const x of abiertas.splice(0)) x.soltar();
    globalThis.localStorage.setItem('al3d_pf_supa', JSON.stringify({ encendido: true, desde: 1 }));
    globalThis.localStorage.setItem('al3d_pf_supa_modo', JSON.stringify({ modo: 'base', area }));
    Prefs.setRol(rolLocal);
    llamadas.length = 0;
    ESC = {
      sesion,
      rpc: n => (n === 'mi_acceso' ? { data: { ok: true, estado: 'activo', usuario: { correo: 'quien@al3d.test' }, empresas: [{ empresa_id: 'al3d', area, estado: 'activo' }], modo: 'base' }, error: null }
        : { data: { ok: true }, error: null }),
      /* La pantalla filtra con el día de HOY de verdad (3 meses): V-102 se pone en hoy para que la prueba no dependa de la fecha en que corre. */
      tablas: { ventas_calculadas: CALC.filter(x => ['Constru BNT', 'Moni MPago', 'Tatis BNT'].includes(x.d_cuenta)).map(x => (x.proyecto_id === 'p2' ? { ...x, l_fecha_anticipo: hoyDeVerdad } : x)),
                ventas_fiscales: FISC, clientes_fiscales: CLI },
    };
    const M = await import('../js/mod/facturas.js?' + nombre);
    abiertas.push(M);
    const el = { _h: '', isConnected: true, set innerHTML(h) { this._h = h; }, get innerHTML() { return this._h; }, addEventListener() {}, querySelector() { return null }, contains: () => false };
    el.innerHTML = M.html();
    M.cablear(el);
    for (let i = 0; i < 60 && /Preguntando|Leyendo/.test(el.innerHTML); i++) await espera(5);
    return { html: el.innerHTML, llamadas: llamadas.slice() };
  }
  let r = await pestana('pagos', { rolLocal: 'pagos', sesion: true, area: 'pagos' });
  eq('Pagos: pregunta quién es y lee las tres tablas, sin escribir nada', r.llamadas.map(x => x.join(':')).sort(),
    ['from:clientes_fiscales', 'from:ventas_calculadas', 'from:ventas_fiscales', 'rpc:mi_acceso'].sort());
  cierto('arranca en «Pendientes de factura» (3 meses): V-102 con su RFC, su constancia y las dos casillas', /aria-pressed="true" data-fx-filtro="pendientes"/.test(r.html) &&
    /V-102/.test(r.html) && /ABC010203XY1/.test(r.html) && /data-fx-ver="al3d\/ABC010203XY1\/csf-11111111\.pdf"/.test(r.html) &&
    /data-fx-marcar="anticipo" data-fx-id="p2" checked/.test(r.html) && /data-fx-marcar="liquidacion" data-fx-id="p2">/.test(r.html));
  cierto('quién y cuándo marcó la del anticipo; la de la liquidación dice lo cobrado', /hecha · dir@al3d\.test · 02\/09\/2026/.test(r.html) && /cobrado \$6,600\.00 · 20\/10\/2026/.test(r.html));
  cierto('V-101 no está (no debe nada) y V-106 tampoco (es de 2025: fuera de 3 meses)', !/V-101/.test(r.html) && !/V-106/.test(r.html));
  cierto('las cuentas de arriba (del periodo)', /<b>1<\/b><span class="pf-cuenta-t">Pendientes de factura/.test(r.html));
  r = await pestana('fab', { rolLocal: 'pagos', sesion: true, area: 'fabricacion' });
  eq('Fabricación según la base: solo se le pregunta quién es; ni una fila', r.llamadas.map(x => x.join(':')), ['rpc:mi_acceso']);
  cierto('y no se le pinta ni un importe ni un RFC', /son de Dirección y Pagos/.test(r.html) && !/\$\d/.test(r.html) && !/ABC010203XY1/.test(r.html));
  r = await pestana('sinsesion', { rolLocal: 'direccion', sesion: false, area: 'direccion' });
  eq('sin sesión de la base: no pregunta nada', r.llamadas, []);
  cierto('y dice cómo entrar', /Ajustes → Supabase/.test(r.html));
  for (const x of abiertas.splice(0)) x.soltar();
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
