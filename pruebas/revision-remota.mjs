/* LA REVISIÓN REMOTA, RENGLÓN POR RENGLÓN. Sin Google y sin pantalla, en node.

   Quien cotiza sin ser Dirección solicita; Dirección revisa la solicitud desde SU teléfono
   (abrirRevisionRemota, js/cotizador/notario.js) y la sella. Hasta octubre de 2026 esa revisión
   solo movía el total y mandaba `itemsAuth: {}`. Ahora cada renglón tiene su campo, y lo que se
   comprueba aquí es la cadena entera, con las piezas de verdad:

     1. `cuentaRemota()` —la cuenta de la ventana, sacada del texto de notario.js— convierte lo
        tecleado en lo que se manda a sellar: los renglones que se apartan del calculado, el
        total que sale de ellos, y el atajo de un total tecleado encima.
     2. Eso se le manda a la hoja —puente/hoja-apps-script.gs, por `doPost`, como el teléfono—, que
        recalcula con su catálogo, firma y devuelve el sello. Se pide como lo pidió un teléfono con
        la versión ANTERIOR (la solicitud no trae ajustes: los pone quien revisa), porque así son
        las que ya están en vuelo.
     3. El teléfono que pidió recibe el sello por /estado y lo aplica con las cuentas de siempre
        de nucleo.js (precioFinal, preciosCliente, desgloseFinal): el total que imprime es el que
        firmó la hoja y cada renglón dice su precio autorizado. Un descuento se le enseña al
        cliente; un aumento se reparte entre las partidas.

   Los dobles de Google son los de pruebas/notario.mjs, en corto: aquí solo hacen falta la hoja,
   las propiedades, la caché, el candado y el tokeninfo.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { createHmac, createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, v) => eq(que, !!v, true);
const leer = ruta => readFileSync(new URL('../' + ruta, import.meta.url), 'utf8');

/* ===================== La hoja, con sus dobles ===================== */
/* Lo que se escribe con apóstrofo se guarda como texto; lo demás se queda como venga. Basta para
   lo de aquí: notario.mjs es el que muerde las fórmulas y las fechas. */
const guardar = v => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);
function hojaFalsa() {
  const filas = [];
  const celda = (r, c) => (filas[r - 1] && filas[r - 1][c - 1] !== undefined ? filas[r - 1][c - 1] : '');
  const poner = (r, c, v) => { while (filas.length < r) filas.push([]); filas[r - 1][c - 1] = guardar(v); };
  const rango = (r, c, nr = 1, nc = 1) => {
    const self = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => celda(r + i, c + j))),
      getValue: () => celda(r, c),
      setValues: vs => { vs.forEach((fila, i) => fila.forEach((v, j) => poner(r + i, c + j, v))); return self; },
      setValue: v => { poner(r, c, v); return self; },
    };
    for (const m of ['setFontWeight', 'setBackground', 'setFontColor', 'setNumberFormat', 'setDataValidation',
                     'setFontStyle', 'setHorizontalAlignment']) self[m] = () => self;
    return self;
  };
  return {
    filas, getRange: rango,
    getLastRow: () => { for (let i = filas.length; i > 0; i--) if ((filas[i - 1] || []).some(x => x !== '' && x !== undefined)) return i; return 0; },
    setFrozenRows() {}, setColumnWidth() {}, hideSheet() {},
  };
}
const hojas = {};
const ss = { getSheetByName: n => hojas[n] || null, insertSheet: n => (hojas[n] = hojaFalsa()), getSpreadsheetTimeZone: () => 'America/Mexico_City' };
const aBytes = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const Utilities = {
  DigestAlgorithm: { SHA_256: 'sha256' },
  getUuid: () => randomUUID(),
  computeDigest: (_alg, s) => aBytes(createHash('sha256').update(String(s), 'utf8').digest()),
  computeHmacSha256Signature: (valor, clave) => aBytes(createHmac('sha256', String(clave)).update(String(valor), 'utf8').digest()),
  base64EncodeWebSafe: bytes => Buffer.from(bytes.map(b => (b + 256) % 256)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  formatDate: d => d.toISOString().slice(0, 10),
};
const m = new Map();
const props = { getProperty: k => (m.has(k) ? m.get(k) : null), setProperty: (k, v) => { m.set(k, String(v)); },
                deleteProperty: k => { m.delete(k); }, getProperties: () => Object.fromEntries(m) };
const CLIENT_ID = '1057893837924-3np1vkcbpqmkh6sio0ktse00kd9b5ulr.apps.googleusercontent.com';
const tokens = { 'tok-elias-direccion-xxxxxxxxxxxx': 'elias@al3d.mx' };
const UrlFetchApp = {
  fetch(url) {
    let codigo = 200, cuerpo = {};
    const t = decodeURIComponent(String(url).split('access_token=')[1] || '');
    if (tokens[t]) cuerpo = { aud: CLIENT_ID, email: tokens[t], email_verified: 'true' }; else codigo = 400;
    return { getResponseCode: () => codigo, getContentText: () => JSON.stringify(cuerpo), getHeaders: () => ({}) };
  },
};
const cache = new Map();
const candado = { tomado: false };
const ctx = vm.createContext({
  SpreadsheetApp: { getActive: () => ss, flush() {} },
  PropertiesService: { getScriptProperties: () => props },
  CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => { cache.set(k, String(v)); } }) },
  LockService: { getScriptLock: () => ({
    tryLock() { if (candado.tomado) return false; candado.tomado = true; return true; },
    waitLock() { if (candado.tomado) throw new Error('ocupado'); candado.tomado = true; },
    releaseLock() { candado.tomado = false; },
  }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  Utilities, UrlFetchApp, console,
});
vm.runInContext(leer('puente/hoja-apps-script.gs'), ctx);
ss.insertSheet('Accesos').getRange(1, 1, 2, 2).setValues([['Correo', 'Rol'], ['elias@al3d.mx', 'direccion']]);
ss.insertSheet('Ventas');
const TOK_PAGOS = 'dispositivo-pagos-' + 'x'.repeat(24);
props.setProperty('PUENTE_TOKENS', JSON.stringify({ [TOK_PAGOS]: 'pagos' }));
const post = cuerpo => { cache.clear(); return JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify(cuerpo) } }).s); };
const ELIAS = 'tok-elias-direccion-xxxxxxxxxxxx';
/* El catálogo de la hoja es el que decide, así que es el que hace de lineTotal() también del
   lado del teléfono: lo que se comprueba aquí es lo que se manda, no el catálogo (para eso está
   pruebas/precio-servidor.mjs, que los compara entre sí). */
const lineTotal = it => vm.runInContext('cotLineTotal', ctx)(it);

/* ===================== Las funciones del cotizador, sacadas del texto ===================== */
function fuente(texto, nombre) {
  const ini = texto.indexOf('function ' + nombre + '(');
  if (ini < 0) throw new Error('no está function ' + nombre);
  let i = texto.indexOf('{', ini), prof = 0;
  for (; i < texto.length; i++) {
    const c = texto[i], s = texto[i + 1];
    if (c === '/' && s === '/') { i = texto.indexOf('\n', i); continue; }
    if (c === '/' && s === '*') { i = texto.indexOf('*/', i) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') { for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++; continue; }
    if (c === '{') prof++;
    if (c === '}' && --prof === 0) return texto.slice(ini, i + 1);
  }
  throw new Error('function ' + nombre + ' no cierra');
}
const NOTARIO = leer('js/cotizador/notario.js'), NUCLEO = leer('js/cotizador/nucleo.js');
const money = n => '$' + (+n).toFixed(2);
const cliente = vm.createContext({ Math, Number, String, Array, Object, JSON, isFinite, lineTotal, money, Q: null,
  /* La huella se comprueba en aplicarSello/atenderRespuesta; aquí el trabajo no cambia. */
  authVigente: () => true });
vm.runInContext(['cuentaRemota', 'fraseAjuste', 'totals', 'precioFinal', 'subAjustado', 'netoAjustado', 'ajusteAuth',
  'desgloseFinal', 'itemPrecio', 'piezasDe', 'hayAumentoAuth', 'preciosCliente']
  .map(n => fuente(n === 'cuentaRemota' ? NOTARIO : NUCLEO, n)).join('\n'), cliente);
const cuentaRemota = vm.runInContext('cuentaRemota', cliente);

/* ===================== La cotización ===================== */
const partidas = [
  { id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, altura: 40, n: 8, desc: 'Letras «TACOS»' },
  { id: 2, tipo: 'bastidor', bas: 'lamina', ancho: 300, alto: 60, desc: 'Bastidor' },
];
const SUB = 30 * 40 * 8 + 950 * (300 * 60 / 10000);   // 9600 + 1710 = 11310
eq('el catálogo da lo que se espera (9,600 + 1,710)', partidas.map(lineTotal), [9600, 1710]);
const cot = () => ({ proyecto: 'Tacos El Güero', cliente: 'Güero', iva: true, subtotal: SUB, items: partidas });

/* Lo que hace la ventana al tocar «Autorizar»: el mismo cuerpo que autorizarRemota(). */
function sellar(folio, sol, cu) {
  return post({ ruta: 'autorizar', google_token: ELIAS, folio, cotizacion: { ...sol.cotizacion, subtotal: SUB },
                precioAuth: cu.precioAuth, itemsAuth: cu.itemsAuth, nota: '' });
}
/* Lo que hace el teléfono que pidió: pregunta por /estado y aplica el sello a su Q (aplicarSello
   copia precioAuth e itemsAuth tal cual). Devuelve lo que imprimiría el PDF. */
function alQuePidio(folio) {
  const x = post({ ruta: 'estado', token: TOK_PAGOS, folios: [folio] }).folios[folio];
  const Q = { estado: x.estado === 'autorizada' ? 'autorizada' : 'pendiente', iva: true,
              items: partidas.map(p => ({ ...p, pz: 1 })),
              precioAuth: Number(x.sello && x.sello.precioAuth) || 0,
              itemsAuth: JSON.parse(JSON.stringify((x.sello && x.sello.itemsAuth) || {})) };
  cliente.Q = Q;
  const filas = vm.runInContext('preciosCliente()', cliente);
  return { x, filas: [filas[1], filas[2]], d: vm.runInContext('desgloseFinal()', cliente),
           ajuste: vm.runInContext('ajusteAuth()', cliente) };
}
function pedir(folio) {
  eq('  pagos lo pide como siempre, sin ajustes', post({ ruta: 'solicitar', token: TOK_PAGOS, folio, cotizacion: cot() }).estado, 'pendiente');
  const sol = post({ ruta: 'pendientes', google_token: ELIAS }).solicitudes.find(s => s.folio === folio);
  cierto('  y Dirección la ve en su cola', sol);
  return sol;
}

console.log('\nLA CUENTA DE LA VENTANA — de lo tecleado a lo que se sella');
{
  eq('sin tocar nada: sin ajuste, como antes', cuentaRemota(partidas, {}, SUB, true),
     { subCalc: 11310, subBase: 11310, subFinal: 11310, itemsAuth: {}, precioAuth: 0, ajustadas: 0 });
  eq('el atajo de siempre: solo el total', cuentaRemota(partidas, {}, 10000, true),
     { subCalc: 11310, subBase: 11310, subFinal: 10000, itemsAuth: {}, precioAuth: 11600, ajustadas: 0 });
  eq('un renglón: el total sale de la suma', cuentaRemota(partidas, { 2: 1200 }, 0, true),
     { subCalc: 11310, subBase: 10800, subFinal: 10800, itemsAuth: { 2: 1200 }, precioAuth: 12528, ajustadas: 1 });
  eq('  igual si el campo de arriba trae la suma, que es lo que escribe remotaPartida()', cuentaRemota(partidas, { 2: 1200 }, 10800, true).precioAuth, 12528);
  eq('un renglón y un total encima', cuentaRemota(partidas, { 2: 1200 }, 11000, true),
     { subCalc: 11310, subBase: 10800, subFinal: 11000, itemsAuth: { 2: 1200 }, precioAuth: 12760, ajustadas: 1 });
  eq('sin IVA el precio autorizado es el subtotal', cuentaRemota(partidas, { 2: 1200 }, 0, false).precioAuth, 10800);
  eq('un renglón igual al calculado no viaja: cambiaría la firma sin cambiar el precio', cuentaRemota(partidas, { 1: 9600, 2: '1710.004' }, 0, true).itemsAuth, {});
  eq('vacío, negativo o un texto tampoco: es «sin ajuste», no $0', cuentaRemota(partidas, { 1: '', 2: -5 }, 0, true).itemsAuth, {});
  eq('  pero un $0 tecleado a propósito sí', cuentaRemota(partidas, { 2: 0 }, 0, true).itemsAuth, { 2: 0 });
  eq('un ajuste de una partida que la solicitud no trae se ignora: la hoja lo rechazaría', cuentaRemota(partidas, { 9: 100 }, 0, true).itemsAuth, {});
  eq('dos renglones que se compensan: el total queda en el calculado y los renglones sí viajan',
     cuentaRemota(partidas, { 1: 9100, 2: 2210 }, 0, true), { subCalc: 11310, subBase: 11310, subFinal: 11310, itemsAuth: { 1: 9100, 2: 2210 }, precioAuth: 0, ajustadas: 2 });
  eq('los centavos se redondean al centavo, como compara la hoja', cuentaRemota(partidas, { 2: 1200.006 }, 0, true).itemsAuth, { 2: 1200.01 });
}

console.log('\nUNA SOLICITUD EN VUELO, AJUSTADA RENGLÓN POR RENGLÓN');
{
  const F = 'COT-0041@PAG1';
  const sol = pedir(F);
  const cu = cuentaRemota(sol.cotizacion.items, { 2: 1200 }, 0, sol.cotizacion.iva);
  const r = sellar(F, sol, cu);
  cierto('la hoja la sella: recalcula con su catálogo y acepta los renglones', r.ok);
  eq('  el total firmado sale de los renglones', r.sello.total, 12528);
  eq('  y los renglones van en el sello', r.sello.itemsAuth, { 2: 1200 });
  const t = alQuePidio(F);
  eq('el que pidió los recibe por /estado', t.x.sello.itemsAuth, { 2: 1200 });
  eq('  su PDF imprime cada renglón con su precio autorizado', t.filas, [9600, 1200]);
  eq('  y el total que selló la hoja, sin un ajuste global encima', [t.d.neto, t.d.sub, t.ajuste], [12528, 10800, 0]);
  eq('el QR lo da por auténtico, con ese total', [post({ ruta: 'verificar', f: F, c: r.sello.codigo }).estado, post({ ruta: 'verificar', f: F, c: r.sello.codigo }).total], ['autentica', 12528]);
  /* Los renglones están dentro de la firma: cambiarlos a mano en la hoja la rompe. */
  const h = hojas['Autorizaciones'], i = h.filas.findIndex(x => x[12] === r.sello.codigo), antes = h.filas[i][8];
  h.filas[i][8] = '2:500.00';
  eq('un renglón cambiado a mano en «Autorizaciones» ya no verifica', post({ ruta: 'verificar', f: F, c: r.sello.codigo }).estado, 'no_autentica');
  h.filas[i][8] = antes;
}

console.log('\nRENGLONES Y UN TOTAL ENCIMA — el atajo sigue, con el mecanismo de siempre');
{
  const F = 'COT-0042@PAG1';
  const sol = pedir(F);
  const r = sellar(F, sol, cuentaRemota(sol.cotizacion.items, { 2: 1200 }, 11000, true));
  eq('un aumento sobre las partidas ajustadas: la hoja firma el total que se cobra', [r.ok, r.sello.total], [true, 12760]);
  const t = alQuePidio(F);
  eq('  el aumento se reparte entre las partidas y las filas suman el subtotal', +(t.filas[0] + t.filas[1]).toFixed(2), 11000);
  cierto('  sin bajar del precio que Dirección le puso a cada una', t.filas[0] >= 9600 && t.filas[1] >= 1200);
  eq('  y el total es el sellado', t.d.neto, r.sello.total);

  const G = 'COT-0043@PAG1';
  const sol2 = pedir(G);
  const r2 = sellar(G, sol2, cuentaRemota(sol2.cotizacion.items, { 2: 1200 }, 10500, true));
  const t2 = alQuePidio(G);
  eq('un descuento encima: los renglones se quedan como los puso Dirección', t2.filas, [9600, 1200]);
  eq('  y el descuento se enseña en su renglón: subtotal ajustado − descuento = subtotal', [t2.d.sub, +(t2.ajuste / 1.16).toFixed(2)], [10500, 300]);
  eq('  con el total sellado', t2.d.neto, r2.sello.total);
}

console.log('\nCOMPATIBLE — solo el total, como hasta ahora');
{
  const F = 'COT-0044@PAG1';
  const sol = pedir(F);
  const r = sellar(F, sol, cuentaRemota(sol.cotizacion.items, {}, 10000, true));
  eq('el sello sale sin renglones, igual que antes', [r.ok, r.sello.total, r.sello.itemsAuth], [true, 11600, {}]);
  const t = alQuePidio(F);
  eq('  y el que pidió lo aplica como siempre: descuento sobre el subtotal', [t.filas, t.d.neto], [[9600, 1710], 11600]);
}

console.log('\nLA VENTANA MANDA LO QUE CUENTA');
{
  const a = fuente(NOTARIO, 'autorizarRemota');
  cierto('autorizarRemota pasa la cuenta de los renglones a sellar, no un {} fijo',
    /cuentaRemota\(items,_remIa,v,c\.iva\)/.test(a) && /cu\.precioAuth,cu\.itemsAuth/.test(a) && !/,\{\},nota\)/.test(a));
  const ab = fuente(NOTARIO, 'abrirRevisionRemota');
  cierto('cada renglón trae su campo, con el calculado a la vista', /id="rem-ia-\$\{i\}"/.test(ab) && /ia-calc/.test(ab));
  cierto('  identificado por posición: el id de la partida llega de otro teléfono y no va al marcado', /remotaPartida\(\$\{i\},this\.value\)/.test(ab) && !/\$\{it\.id\}/.test(ab));
  cierto('abrir otra revisión empieza sin los ajustes de la anterior', /_remIa=\{\}/.test(ab) && /_remIa=\{\}/.test(fuente(NOTARIO, 'cerrarRevisionRemota')));
  cierto('el contrato del puente no cambió: /autorizar ya firmaba los renglones', /itemsAuthCanon\(ia\.valor\)/.test(leer('puente/hoja-apps-script.gs')));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
