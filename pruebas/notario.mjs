/* EL NOTARIO, CORRIENDO DE VERDAD. Sin Google, sin cuenta, en node.

   puente/hoja-apps-script.gs sella los precios autorizados, los comprueba con el QR del PDF
   y llama a la IA con las llaves que ya no viven en los teléfonos. Todo eso toca la hoja, las
   propiedades del script, la caché y la red, así que aquí se le dan dobles de los seis
   servicios de Google —una hoja en memoria que se porta como la de verdad donde importa— y
   se le habla por la MISMA puerta que usa el teléfono: `doPost`, con el cuerpo en JSON.

   Lo que se comprueba es lo que haría daño si fallara: que solo dirección con su cuenta de
   Google selle, que un catálogo alterado no pase, que un renglón editado a mano deje de
   verificar, que /verificar no suelte nada privado, y que la llave de la IA no salga nunca.

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

/* ===================== Los dobles de Google ===================== */

/* Una celda de texto escrita con apóstrofo se guarda como texto y se lee SIN él, como en la
   hoja de verdad. Y un texto SIN apóstrofo se guarda como lo reconocería Sheets: es la razón de
   que el notario escriba todo con txt(). Hasta septiembre de 2026 este doble solo convertía la
   fecha ISO, y quitarle txt() al negocio, al cliente, a los ajustes o a la huella no rompía
   ninguna prueba. Ahora:
     · lo que empieza con = + - @ y no es un número sería una FÓRMULA: el doble truena, porque
       en la hoja de verdad eso ejecuta, no guarda;
     · «0042» o «1e3» se vuelven número (y «0042» se lee 42), «TRUE» un booleano;
     · una fecha («2026-09-25», «25/09/2026», el ISO con hora) se vuelve Date;
     · y «1:8500.00» o «10:30», hora —un Date—, que es lo que le pasaba a los ajustes por
       partida sin apóstrofo. */
const guardar = v => {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  const s = v.trim();
  if (s === '') return v;
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number(s);
  if (/^[=+\-@]/.test(s)) throw new Error('la hoja de mentiras: «' + v.slice(0, 40) + '» sin apóstrofo sería una fórmula');
  if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
  if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(s)) return new Date(s);
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return new Date(s);
  if (/^\d+:\d+(:\d+)?(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30));   // el día cero de Sheets, a «esa hora»
  return v;
};
function hojaFalsa(nombre) {
  const filas = [];   // filas[r-1][c-1]
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
    nombre, filas, oculta: false,
    getRange: rango,
    getLastRow: () => { for (let i = filas.length; i > 0; i--) if ((filas[i - 1] || []).some(x => x !== '' && x !== undefined)) return i; return 0; },
    setFrozenRows() {}, setColumnWidth() {},
    hideSheet() { this.oculta = true; },
  };
}
function libro() {
  const hojas = {};
  return {
    hojas,
    getSheetByName: n => hojas[n] || null,
    insertSheet: n => (hojas[n] = hojaFalsa(n)),
    getSpreadsheetTimeZone: () => 'America/Mexico_City',
  };
}
const aBytes = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));   // los bytes de Apps Script son con signo
const Utilities = {
  DigestAlgorithm: { SHA_256: 'sha256' },
  getUuid: () => randomUUID(),
  computeDigest: (_alg, s) => aBytes(createHash('sha256').update(String(s), 'utf8').digest()),
  computeHmacSha256Signature: (valor, clave) => aBytes(createHmac('sha256', String(clave)).update(String(valor), 'utf8').digest()),
  base64EncodeWebSafe: bytes => Buffer.from(bytes.map(b => (b + 256) % 256)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  formatDate: (d, _tz, fmt) => {
    const p = n => String(n).padStart(2, '0');
    if (fmt === 'dd/MM/yyyy') return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
    if (fmt === 'yyyyMMdd') return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
    return d.toISOString().slice(0, 10);
  },
};
function propiedades() {
  const m = new Map();
  return { m, getProperty: k => (m.has(k) ? m.get(k) : null), setProperty: (k, v) => { m.set(k, String(v)); },
           deleteProperty: k => { m.delete(k); }, getProperties: () => Object.fromEntries(m) };
}

/* La red: tokeninfo de Google y los proveedores de IA. Cada prueba decide qué contestan. */
const CLIENT_ID = '1057893837924-3np1vkcbpqmkh6sio0ktse00kd9b5ulr.apps.googleusercontent.com';
const tokens = {   // token de Google → correo
  'tok-elias-direccion-xxxxxxxxxxxx': 'elias@al3d.mx',
  'tok-omar-pagos-xxxxxxxxxxxxxxxxx': 'omar@al3d.mx',
  'tok-taller-fab-xxxxxxxxxxxxxxxxx': 'taller@al3d.mx',
};
let proveedor = () => ({ codigo: 200, cuerpo: {} });
const llamadas = [];
const UrlFetchApp = {
  fetch(url, opts = {}) {
    llamadas.push({ url, opts });
    let codigo = 200, cuerpo = {};
    if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      const t = decodeURIComponent(url.split('access_token=')[1]);
      if (tokens[t]) cuerpo = { aud: CLIENT_ID, email: tokens[t], email_verified: 'true' };
      else codigo = 400;
    } else ({ codigo, cuerpo } = proveedor(url, opts));
    return { getResponseCode: () => codigo, getContentText: () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)), getHeaders: () => ({}) };
  },
};

/* El reloj de los cupos. Date.now() del .gs lee ESTE reloj, parado al principio de una hora
   —que es principio de una ventana de 60 s y de una de 600 s—, para que un conteo no caiga
   partido entre dos ventanas por la velocidad de la máquina. Solo se mueve cuando una prueba lo
   mueve (`pasan`). `new Date()` sigue siendo el reloj de verdad: es el que fecha los renglones. */
let ahora = Math.floor(Date.now() / 3600000) * 3600000;
const pasan = segundos => { ahora += segundos * 1000; };
/* La caché, con caducidad de verdad: un put con TTL vive TTL segundos del reloj de arriba, y un
   put sobre una clave viva le REINICIA la caducidad, como en CacheService. Es lo que hacía que
   los cupos «deslizaran» y es lo que tiene que poder verse aquí. */
const cache = new Map();
const cacheGoogle = {
  get: k => { const x = cache.get(k); if (!x) return null; if (x.hasta <= ahora) { cache.delete(k); return null; } return x.v; },
  put: (k, v, ttl = 600) => { cache.set(k, { v: String(v), hasta: ahora + ttl * 1000 }); },
};
/* El candado del script, con estado: si está tomado, tryLock contesta false y waitLock truena,
   como el de verdad. `candado.ajeno` lo simula tomado por otra ejecución. */
const candado = { tomado: false, ajeno: false, veces: 0 };
const LockService = { getScriptLock: () => ({
  tryLock() { if (candado.tomado || candado.ajeno) return false; candado.tomado = true; candado.veces++; return true; },
  waitLock() { if (candado.tomado || candado.ajeno) throw new Error('ocupado'); candado.tomado = true; candado.veces++; },
  releaseLock() { candado.tomado = false; },
}) };

const ss = libro();
const props = propiedades();
const ctx = vm.createContext({
  SpreadsheetApp: { getActive: () => ss, flush() {} },
  PropertiesService: { getScriptProperties: () => props },
  CacheService: { getScriptCache: () => cacheGoogle },
  LockService,
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  Utilities, UrlFetchApp, console, __reloj: () => ahora,
});
vm.runInContext('Date.now = function () { return __reloj(); };', ctx);
vm.runInContext(readFileSync(new URL('../puente/hoja-apps-script.gs', import.meta.url), 'utf8'), ctx);

/* «Accesos», con los tres roles, y los tokens de dispositivo de siempre. */
const acc = ss.insertSheet('Accesos');
acc.getRange(1, 1, 4, 2).setValues([['Correo', 'Rol'], ['elias@al3d.mx', 'direccion'], ['omar@al3d.mx', 'pagos'], ['taller@al3d.mx', 'fabricacion']]);
const TOK_DIR = 'dispositivo-direccion-' + 'x'.repeat(20);
const TOK_PAGOS = 'dispositivo-pagos-' + 'x'.repeat(24);
props.setProperty('PUENTE_TOKENS', JSON.stringify({ [TOK_DIR]: 'direccion', [TOK_PAGOS]: 'pagos' }));
ss.insertSheet('Ventas');

/* Hablarle como el teléfono. */
const post = cuerpo => { cache.clear(); return JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify(cuerpo) } }).s); };
const conCache = cuerpo => JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify(cuerpo) } }).s);
const G = { elias: 'tok-elias-direccion-xxxxxxxxxxxx', omar: 'tok-omar-pagos-xxxxxxxxxxxxxxxxx', taller: 'tok-taller-fab-xxxxxxxxxxxxxxxxx' };

const partidas = [
  { id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, altura: 40, n: 8, desc: 'Letras «TACOS»' },
  { id: 2, tipo: 'bastidor', bas: 'lamina', ancho: 300, alto: 60, desc: 'Bastidor' },
];
const sub = 30 * 40 * 8 + 950 * (300 * 60 / 10000);   // 9600 + 1710 = 11310
const cot = (extra = {}) => ({ proyecto: 'Tacos El Güero', cliente: 'Güero', iva: true, subtotal: sub, items: partidas, ...extra });
const hojaAut = () => ss.hojas['Autorizaciones'];

console.log('\nQUIÉN SELLA — dirección, con su cuenta de Google, y nadie más');
{
  const r = post({ ruta: 'autorizar', token: TOK_DIR, folio: 'COT-0001@K7QM', cotizacion: cot() });
  eq('el token de dirección NO basta: no dice quién eres', r.codigo, 'ROL_SIN_PERMISO');
  const p = post({ ruta: 'autorizar', google_token: G.omar, folio: 'COT-0001@K7QM', cotizacion: cot() });
  eq('una cuenta de pagos tampoco', p.codigo, 'ROL_SIN_PERMISO');
  cierto('  y el mensaje nombra su rol', /pagos/.test(p.mensaje));
  const x = post({ ruta: 'autorizar', google_token: 'tok-que-google-no-conoce-xxxxxx', folio: 'COT-0001@K7QM', cotizacion: cot() });
  eq('un token que Google no reconoce no entra ni a la puerta', x.codigo, 'ROL_SIN_PERMISO');
  eq('y nada de eso escribió un renglón', hojaAut() ? hojaAut().getLastRow() : 0, 0);
}

console.log('\nEL CATÁLOGO — la hoja recalcula, y un precio alterado no se sella');
{
  const r = post({ ruta: 'autorizar', google_token: G.elias, folio: 'COT-0001@K7QM', cotizacion: cot({ subtotal: 1 }) });
  eq('el teléfono dice $1 y el catálogo dice otra cosa', r.codigo, 'CATALOGO_DESINCRONIZADO');
  cierto('  y lo dice con los dos números', /1\.00/.test(r.mensaje) && /11310\.00/.test(r.mensaje));
  const precioCambiado = partidas.map(p => ({ ...p }));
  const alterado = post({ ruta: 'autorizar', google_token: G.elias, folio: 'COT-0001@K7QM',
    cotizacion: cot({ subtotal: 1 * 40 * 8 + 1710, items: precioCambiado }) });
  eq('ni con el subtotal que daría un aluminio a $1', alterado.codigo, 'CATALOGO_DESINCRONIZADO');
  const cero = post({ ruta: 'autorizar', google_token: G.elias, folio: 'COT-0002@K7QM',
    cotizacion: cot({ subtotal: 0, items: [{ id: 1, tipo: 'letras', material: 'al-paint', altura: 0, n: 0 }] }) });
  eq('una cotización en $0 no se autoriza', cero.codigo, 'DATO_INVALIDO');
  const folioMalo = post({ ruta: 'autorizar', google_token: G.elias, folio: 'COT-0001', cotizacion: cot() });
  eq('un folio sin su aparato no se acepta: el corto se repite entre teléfonos', folioMalo.codigo, 'DATO_INVALIDO');
}

console.log('\nEL SELLO — se firma, se anota, y es el mismo si se repite');
let primero;
{
  const r = post({ ruta: 'autorizar', google_token: G.elias, folio: 'COT-0001@K7QM', cotizacion: cot(), precioAuth: 12500, nota: 'cliente frecuente' });
  primero = r.sello;
  cierto('dirección con su cuenta sella', r.ok);
  cierto('el código son doce hexadecimales en tres grupos', /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(r.sello.codigo));
  eq('lo firma el correo de la cuenta, no un nombre tecleado', r.sello.correo, 'elias@al3d.mx');
  eq('el calculado es el de la hoja', r.sello.subCalc, 11310);
  eq('el total es el autorizado', r.sello.total, 12500);
  cierto('la fecha la pone el reloj de la hoja', Math.abs(Date.parse(r.sello.ts) - Date.now()) < 5000);
  eq('queda un renglón en «Autorizaciones»', hojaAut().getLastRow(), 2);
  cierto('  y la pestaña está oculta', hojaAut().oculta);
  const fila = hojaAut().filas[1];
  eq('  vigente', fila[14], 'vigente');
  eq('  la fecha sigue siendo TEXTO, no una fecha que la hoja reinterpretó', typeof fila[0], 'string');
  eq('  el ajuste contra el calculado con IVA, en %', fila[7], Math.round((11310 * 1.16 - 12500) / (11310 * 1.16) * 1000) / 10);

  const otra = post({ ruta: 'autorizar', google_token: G.elias, folio: 'COT-0001@K7QM', cotizacion: cot(), precioAuth: 12500 });
  eq('el doble toque devuelve el MISMO sello', otra.sello.codigo, primero.codigo);
  cierto('  y lo dice', otra.repetida);
  eq('  sin escribir otro renglón', hojaAut().getLastRow(), 2);
  cierto('el secreto vive en las propiedades del script', (props.getProperty('SELLO_AUTORIZACION') || '').length > 60);
}

console.log('\nVERIFICAR — el QR del PDF, desde el teléfono de cualquiera');
let segundo;
{
  const v = post({ ruta: 'verificar', f: 'COT-0001@K7QM', c: primero.codigo });
  eq('sin token y sin cuenta, contesta', v.estado, 'autentica');
  eq('y solo lo que se puede enseñar', Object.keys(v).sort(), ['estado', 'fecha', 'folio', 'ok', 'proyecto', 'total']);
  eq('  el folio corto, el que lleva el papel', v.folio, 'COT-0001');
  eq('  el total', v.total, 12500);
  eq('  el negocio', v.proyecto, 'Tacos El Güero');
  eq('el código se acepta sin guiones y en minúsculas', post({ ruta: 'verificar', f: 'COT-0001@K7QM', c: primero.codigo.replace(/-/g, '').toLowerCase() }).estado, 'autentica');
  eq('un código inventado no', post({ ruta: 'verificar', f: 'COT-0001@K7QM', c: 'AAAA-BBBB-CCCC' }).estado, 'no_autentica');
  eq('  y no suelta nada más', Object.keys(post({ ruta: 'verificar', f: 'COT-0001@K7QM', c: 'AAAA-BBBB-CCCC' })).sort(), ['estado', 'ok']);
  eq('el código bueno en otro folio tampoco', post({ ruta: 'verificar', f: 'COT-0009@K7QM', c: primero.codigo }).estado, 'no_autentica');

  /* Volver a autorizar con otro precio: el PDF viejo no es falso, es de antes. */
  const r = post({ ruta: 'autorizar', google_token: G.elias, folio: 'COT-0001@K7QM', cotizacion: cot(), precioAuth: 11900 });
  segundo = r.sello;
  cierto('reautorizar da otro código', r.ok && r.sello.codigo !== primero.codigo);
  eq('el PDF viejo verifica como «superada»', post({ ruta: 'verificar', f: 'COT-0001@K7QM', c: primero.codigo }).estado, 'superada');
  eq('el nuevo como auténtico', post({ ruta: 'verificar', f: 'COT-0001@K7QM', c: segundo.codigo }).estado, 'autentica');

  /* Alguien abre la hoja y le baja el total a mano al renglón vigente. */
  const f = hojaAut().filas.findIndex(x => x[12] === segundo.codigo);
  const antes = hojaAut().filas[f][6];
  hojaAut().filas[f][6] = 5000;
  eq('un total editado a mano en la hoja rompe la firma', post({ ruta: 'verificar', f: 'COT-0001@K7QM', c: segundo.codigo }).estado, 'no_autentica');
  hojaAut().filas[f][6] = antes;
  hojaAut().filas[f][2] = 'Otro Negocio';
  eq('y el negocio también', post({ ruta: 'verificar', f: 'COT-0001@K7QM', c: segundo.codigo }).estado, 'no_autentica');
  hojaAut().filas[f][2] = 'Tacos El Güero';
  eq('devuelto a como estaba, vuelve a verificar', post({ ruta: 'verificar', f: 'COT-0001@K7QM', c: segundo.codigo }).estado, 'autentica');

  const sinPermiso = post({ ruta: 'revocar', google_token: G.omar, folio: 'COT-0001@K7QM' });
  eq('pagos no revoca', sinPermiso.codigo, 'ROL_SIN_PERMISO');
  cierto('dirección sí', post({ ruta: 'revocar', google_token: G.elias, folio: 'COT-0001@K7QM' }).ok);
  eq('y el QR dice «revocada»', post({ ruta: 'verificar', f: 'COT-0001@K7QM', c: segundo.codigo }).estado, 'revocada');

  /* El cupo de verificar se cuenta por folio, sin identidad. */
  let tope = null;
  for (let i = 0; i < 40 && !tope; i++) { const x = conCache({ ruta: 'verificar', f: 'COT-0077@K7QM', c: 'AAAA-BBBB-CCCC' }); if (x.ok === false) tope = i; }
  eq('probar códigos contra un folio se frena a los 30', tope, 30);
}

console.log('\nLA SOLICITUD VIAJA — el vendedor pide, dirección ve, el sello regresa');
{
  const F = 'COT-0014@PAG1';
  const s = post({ ruta: 'solicitar', token: TOK_PAGOS, folio: F, cotizacion: cot(), nota: 'le urge' });
  eq('pagos, con su token de siempre, solicita', s.estado, 'pendiente');
  const mala = post({ ruta: 'solicitar', token: TOK_PAGOS, folio: 'COT-0015@PAG1', cotizacion: cot({ subtotal: 99 }) });
  eq('una solicitud con el catálogo alterado se frena desde aquí', mala.codigo, 'CATALOGO_DESINCRONIZADO');
  eq('fabricación no ve la cola de dirección', post({ ruta: 'pendientes', google_token: G.taller }).codigo, 'ROL_SIN_PERMISO');
  const pend = post({ ruta: 'pendientes', google_token: G.elias });
  eq('dirección la ve', pend.solicitudes.map(x => x.folio), [F]);
  eq('  con quién la pidió', pend.solicitudes[0].solicito, 'token de pagos');
  eq('  y las partidas, para revisarlas', pend.solicitudes[0].cotizacion.items.length, 2);
  eq('  sin campos que nadie pidió', Object.keys(pend.solicitudes[0].cotizacion.items[0]).sort(),
     ['altura', 'comp', 'desc', 'id', 'luz', 'material', 'n', 'tipo']);
  eq('el que pidió pregunta y le dicen «pendiente»', post({ ruta: 'estado', token: TOK_PAGOS, folios: [F] }).folios[F].estado, 'pendiente');

  const a = post({ ruta: 'autorizar', google_token: G.elias, folio: F, cotizacion: pend.solicitudes[0].cotizacion, precioAuth: 0 });
  cierto('dirección la autoriza desde su teléfono', a.ok);
  const e = post({ ruta: 'estado', token: TOK_PAGOS, folios: [F, 'COT-9999@PAG1'] });
  eq('el que pidió recibe el sello', e.folios[F].sello.codigo, a.sello.codigo);
  eq('  con la huella del trabajo que se autorizó', e.folios[F].sello.huella, a.sello.huella);
  eq('  y el total calculado, que es el que se autorizó', e.folios[F].sello.total, +(sub * 1.16).toFixed(2));
  eq('un folio que nadie pidió: nada', e.folios['COT-9999@PAG1'].estado, null);
  eq('la solicitud ya no está en la cola', post({ ruta: 'pendientes', google_token: G.elias }).solicitudes.length, 0);
  eq('  y en su renglón dice quién resolvió', ss.hojas['Solicitudes de autorización'].filas[1][10], 'elias@al3d.mx');

  const G2 = 'COT-0016@PAG1';
  post({ ruta: 'solicitar', token: TOK_PAGOS, folio: G2, cotizacion: cot() });
  eq('pagos no rechaza', post({ ruta: 'rechazar', google_token: G.omar, folio: G2 }).codigo, 'ROL_SIN_PERMISO');
  eq('dirección sí, con su nota', post({ ruta: 'rechazar', google_token: G.elias, folio: G2, nota: 'muy barato' }).estado, 'rechazada');
  const er = post({ ruta: 'estado', token: TOK_PAGOS, folios: [G2] }).folios[G2];
  eq('y el vendedor se entera, con la nota', [er.estado, er.nota], ['rechazada', 'muy barato']);

  const H3 = 'COT-0017@PAG1';
  post({ ruta: 'solicitar', token: TOK_PAGOS, folio: H3, cotizacion: cot() });
  eq('el vendedor reabre para editar y la cancela', post({ ruta: 'cancelar', token: TOK_PAGOS, folio: H3 }).estado, 'cancelada');
  eq('  y ya no se le ofrece a dirección', post({ ruta: 'pendientes', google_token: G.elias }).solicitudes.length, 0);
}

console.log('\nFÓRMULAS — lo que se escribe como texto no se ejecuta');
{
  /* Primero, que la hoja de mentiras muerda como la de verdad: sin eso, quitar un txt() no
     rompería nada aquí. */
  let truena = false;
  try { guardar('=IMPORTXML("x")'); } catch (e) { truena = true; }
  cierto('la hoja de mentiras no guarda una fórmula sin apóstrofo: truena', truena);
  eq('  vuelve número «0042»', guardar('0042'), 42);
  cierto('  y hora «1:8500.00», como Sheets', guardar('1:8500.00') instanceof Date);
  eq('  con apóstrofo, todo se queda como texto', [guardar("'=1+1"), guardar("'0042"), guardar("'1:8500.00")], ['=1+1', '0042', '1:8500.00']);

  const r = post({ ruta: 'autorizar', google_token: G.elias, folio: 'COT-0030@K7QM',
    cotizacion: cot({ proyecto: '=IMPORTXML("http://x.mx","//a")', cliente: '=HYPERLINK("http://x.mx","y")' }), nota: '+52 por volumen' });
  const fila = hojaAut().filas[hojaAut().getLastRow() - 1];
  cierto('un negocio que empieza con = se sella', r.ok);
  eq('  queda escrito como texto, tal cual', fila[2], '=IMPORTXML("http://x.mx","//a")');
  eq('  el cliente y la nota también', [fila[3], fila[15]], ['=HYPERLINK("http://x.mx","y")', '+52 por volumen']);
  eq('  y verifica', post({ ruta: 'verificar', f: 'COT-0030@K7QM', c: r.sello.codigo }).estado, 'autentica');

  /* Lo que la hoja «ayuda» a convertir: un negocio que parece número y unos ajustes por
     partida que parecen hora. Sin el apóstrofo, al leerlos ya no son lo que se firmó. */
  const n = post({ ruta: 'autorizar', google_token: G.elias, folio: 'COT-0031@K7QM',
    cotizacion: cot({ proyecto: '0042', cliente: '-Güero' }), itemsAuth: { 1: 8500 }, precioAuth: 11000 });
  cierto('un negocio «0042» con un ajuste «1:8500.00» se sella', n.ok);
  const vn = post({ ruta: 'verificar', f: 'COT-0031@K7QM', c: n.sello.codigo });
  eq('  y verifica, con el negocio como se escribió', [vn.estado, vn.proyecto], ['autentica', '0042']);
  eq('  y el ajuste vuelve como número', post({ ruta: 'estado', google_token: G.elias, folios: ['COT-0031@K7QM'] }).folios['COT-0031@K7QM'].sello.itemsAuth, { 1: 8500 });
}

console.log('\nLOS CUPOS — ventanas fijas: el conteo vuelve a cero aunque el tráfico no pare');
{
  /* Al principio de una ventana de `s` segundos (el reloj de los cupos solo avanza). */
  const alVentana = s => { ahora = Math.ceil(ahora / (s * 1000)) * s * 1000; };
  alVentana(600); cache.clear();
  /* Con la caducidad que se reiniciaba en cada put, este teléfono llegaba a 60 a la media hora
     y ya no volvía a entrar mientras siguiera sincronizando. */
  let fuera = null;
  for (let i = 0; i < 80 && fuera === null; i++) { if (!conCache({ ruta: 'salud', token: TOK_PAGOS }).ok) fuera = i; pasan(30); }
  eq('un teléfono que sincroniza cada 30 s durante 40 minutos no se queda fuera', fuera, null);

  alVentana(600); cache.clear();
  let n = 0;
  while (n < 70 && conCache({ ruta: 'salud', token: TOK_PAGOS }).ok) n++;
  eq('sesenta peticiones por minuto, y la sesenta y uno se frena', n, 60);
  pasan(59);
  eq('  a los 59 segundos sigue frenado', conCache({ ruta: 'salud', token: TOK_PAGOS }).codigo, 'SIN_RED');
  pasan(1);
  eq('  y en el minuto siguiente vuelve a entrar, aunque nunca dejó de pedir', conCache({ ruta: 'salud', token: TOK_PAGOS }).ok, true);

  /* El cupo de todos en /verificar: un anónimo lo llena y lo quiere mantener cerrado con una
     consulta justo antes de que caduque. */
  alVentana(600); cache.clear();
  for (let i = 0; i < 400; i++) conCache({ ruta: 'verificar', f: 'COT-' + String(i).padStart(4, '0') + '@ANON', c: 'AAAA-BBBB-CCCC' });
  eq('el cupo total de /verificar se cierra a las 400 en diez minutos', conCache({ ruta: 'verificar', f: 'COT-9000@ANON', c: 'AAAA-BBBB-CCCC' }).codigo, 'SIN_RED');
  pasan(590);
  conCache({ ruta: 'verificar', f: 'COT-9001@ANON', c: 'AAAA-BBBB-CCCC' });
  pasan(20);
  eq('  y a los diez minutos se abre, aunque el anónimo pidió justo antes', conCache({ ruta: 'verificar', f: 'COT-0001@K7QM', c: primero.codigo }).ok, true);

  /* Las consultas a Google de todos: ciento veinte por minuto. */
  alVentana(60); cache.clear();
  const aGoogle = () => llamadas.filter(l => l.url.includes('tokeninfo')).length;
  llamadas.length = 0;
  for (let i = 0; i < 125; i++) conCache({ ruta: 'salud', google_token: 'tok-inventado-' + i + '-xxxxxxxxxxxx' });
  eq('ciento veinte consultas a Google por minuto, y ahí para', aGoogle(), 120);
  eq('  en ese minuto ni dirección entra con Google', conCache({ ruta: 'salud', google_token: G.elias }).codigo, 'ROL_SIN_PERMISO');
  for (let i = 0; i < 4; i++) { pasan(50); conCache({ ruta: 'salud', google_token: 'tok-otro-anonimo-' + i + '-xxxxxxxx' }); }
  eq('  y pasado el minuto sí, aunque el anónimo siguió mandando uno cada 50 s', conCache({ ruta: 'salud', google_token: G.elias }).ok, true);
  cache.clear();
}

console.log('\nLAS SOLICITUDES — cada quien la suya, y el sello de ESA solicitud');
{
  /* Un respiro de unos milisegundos entre pasos cuyo orden importa: las fechas de los renglones
     son las del reloj de verdad y dos pasos seguidos pueden caer en el mismo milisegundo. */
  const espera = ms => { const t = Date.now() + ms; while (Date.now() < t); };
  const hs = () => ss.hojas['Solicitudes de autorización'];
  const renglones = f => hs().filas.filter(x => x[1] === f).length;
  const enCola = f => post({ ruta: 'pendientes', google_token: G.elias }).solicitudes.find(x => x.folio === f);
  const estado = (quien, f) => post({ ruta: 'estado', ...quien, folios: [f] }).folios[f];
  const PAGOS = { token: TOK_PAGOS }, FAB = { google_token: G.taller }, DIR = { google_token: G.elias };

  const F = 'COT-0060@PAG1';
  post({ ruta: 'solicitar', ...PAGOS, folio: F, cotizacion: cot(), nota: 'la de pagos' });
  const pisa = post({ ruta: 'solicitar', ...FAB, folio: F, cotizacion: cot() });
  eq('fabricación no pisa la solicitud pendiente de pagos', pisa.codigo, 'ROL_SIN_PERMISO');
  cierto('  y lo dice', /otra persona/.test(pisa.mensaje));
  eq('  la de pagos sigue siendo de pagos, con su nota', [enCola(F).solicito, enCola(F).nota], ['token de pagos', 'la de pagos']);
  eq('pagos sí vuelve a pedir la suya', post({ ruta: 'solicitar', ...PAGOS, folio: F, cotizacion: cot(), nota: 'otra vez' }).estado, 'pendiente');
  eq('  en el mismo renglón', renglones(F), 1);
  eq('fabricación no la cancela', post({ ruta: 'cancelar', ...FAB, folio: F }).codigo, 'ROL_SIN_PERMISO');
  cierto('  y sigue en la cola de dirección', !!enCola(F));

  /* Ya resuelta, fabricación —que conoce todos los folios por /jalar— pide sobre el ajeno. */
  const a = post({ ruta: 'autorizar', ...DIR, folio: F, cotizacion: cot(), precioAuth: 13000 });
  espera(3);
  eq('con la de pagos resuelta, fabricación puede pedir sobre ese folio', post({ ruta: 'solicitar', ...FAB, folio: F, cotizacion: cot() }).estado, 'pendiente');
  const suya = estado(FAB, F);
  eq('  pero /estado no le entrega el precio que se autorizó para pagos', [suya.estado, suya.sello], ['pendiente', null]);
  eq('pagos, que pidió aquélla, sigue recibiendo su sello', (estado(PAGOS, F).sello || {}).codigo, a.sello.codigo);
  eq('dirección ve la pendiente de detrás, no el sello de antes', estado(DIR, F).estado, 'pendiente');
  eq('dirección sí cancela la de otro', post({ ruta: 'cancelar', ...DIR, folio: F }).estado, 'cancelada');
  /* Y si dirección le autoriza a fabricación la suya, el sello nuevo es de fabricación: pagos
     ya no recibe ése —es el precio de otra solicitud— aunque la suya diga «autorizada». */
  espera(3);
  post({ ruta: 'solicitar', ...FAB, folio: F, cotizacion: cot() });
  const af = post({ ruta: 'autorizar', ...DIR, folio: F, cotizacion: cot(), precioAuth: 12800 });
  eq('fabricación recibe el sello de la suya', (estado(FAB, F).sello || {}).codigo, af.sello.codigo);
  eq('  y pagos ya no recibe ninguno: el vigente se emitió para otra solicitud', estado(PAGOS, F).sello, null);

  /* Volver a pedir con un sello vigente de antes. */
  const R = 'COT-0061@PAG1';
  post({ ruta: 'solicitar', ...PAGOS, folio: R, cotizacion: cot() });
  const a1 = post({ ruta: 'autorizar', ...DIR, folio: R, cotizacion: cot(), precioAuth: 12000 });
  eq('la primera, autorizada, trae su sello', estado(PAGOS, R).sello.codigo, a1.sello.codigo);
  espera(3);
  post({ ruta: 'solicitar', ...PAGOS, folio: R, cotizacion: cot(), nota: 'otro precio' });
  const re = estado(PAGOS, R);
  eq('pidió re-autorizar: contesta «pendiente», no el sello viejo que cerraba solo el teléfono', [re.estado, re.sello], ['pendiente', null]);
  post({ ruta: 'rechazar', ...DIR, folio: R, nota: 'así no' });
  const rr = estado(PAGOS, R);
  eq('y si dirección rechaza la nueva, el teléfono se entera en vez de esperar para siempre', [rr.estado, rr.sello, rr.nota], ['rechazada', null, 'así no']);
  eq('  dirección también la ve rechazada', estado(DIR, R).estado, 'rechazada');
  espera(3);
  post({ ruta: 'solicitar', ...PAGOS, folio: R, cotizacion: cot() });
  const a2 = post({ ruta: 'autorizar', ...DIR, folio: R, cotizacion: cot(), precioAuth: 11500 });
  const otra = estado(PAGOS, R);
  eq('autorizada otra vez, recibe el sello NUEVO', [otra.estado, otra.sello.codigo, otra.sello.total], ['autorizada', a2.sello.codigo, 11500]);

  /* S_TS vuelve de la hoja como Date y A_TS es texto: las dos se comparan en milisegundos. */
  const msDe = vm.runInContext('msDe', ctx);
  eq('una fecha de la hoja y un ISO en texto se comparan igual', [msDe(vm.runInContext('new Date(Date.UTC(2026, 8, 25, 10))', ctx)), msDe('2026-09-25T10:00:00.000Z')],
     [Date.UTC(2026, 8, 25, 10), Date.UTC(2026, 8, 25, 10)]);
  cierto('  y lo que no se entiende no es «después» de nada', !(msDe('basura') >= 0));
}

console.log('\nLA IA — las llaves están aquí y no salen');
{
  const base = { ruta: 'ia', token: TOK_PAGOS, modo: 'cotizar', prov: 'qwen', model: 'qwen3.7-flash',
                 prompt: 'Analiza', imagen: { b64: 'QUJD', mime: 'image/jpeg' } };
  eq('sin llave en la hoja lo dice', post(base).codigo, 'SIN_LLAVE');
  const guardado = vm.runInContext('guardarLlavesIA', ctx)({ qwen: { nuevas: 'sk-qwen-primera-1111\nsk-qwen-segunda-2222' }, gemini: { nuevas: 'AIza-gemini-3333333' } });
  cierto('se guardan desde el menú de la hoja', /Qwen: 2 llaves/.test(guardado));
  const salud = post({ ruta: 'salud', token: TOK_PAGOS });
  eq('/salud dice qué proveedores están armados', salud.ia, { qwen: true, deepseek: false, gemini: true });
  cierto('  y ninguna llave viaja en la respuesta', !/sk-qwen|AIza-gemini/.test(JSON.stringify(salud)));

  llamadas.length = 0;
  let n = 0;
  proveedor = () => (++n === 1 ? { codigo: 429, cuerpo: { error: { message: 'rate limit' } } }
                               : { codigo: 200, cuerpo: { choices: [{ message: { content: '{"partidas":[]}' } }] } });
  const r = post(base);
  eq('con la primera llave agotada pasa sola a la segunda', [r.ok, r.texto], [true, '{"partidas":[]}']);
  const aProveedor = llamadas.filter(l => l.url.includes('dashscope'));
  eq('  y fueron dos llamadas a Qwen', aProveedor.length, 2);
  cierto('  con llaves distintas', aProveedor[0].opts.headers.Authorization !== aProveedor[1].opts.headers.Authorization);
  cierto('la respuesta al teléfono no trae la llave', !/sk-qwen/.test(JSON.stringify(r)));

  proveedor = () => ({ codigo: 404, cuerpo: { error: { message: 'model not found' } } });
  llamadas.length = 0;
  const nf = post(base);
  eq('un 404 no se reintenta con otra llave: otra llave no lo arregla', llamadas.filter(l => l.url.includes('dashscope')).length, 1);
  eq('  y no es transitorio', [nf.status, nf.transitorio], [404, false]);

  eq('un modelo fuera de la lista no gasta ni una llamada', post({ ...base, model: 'qwen-max-carisimo' }).codigo, 'DATO_INVALIDO');
  eq('un PDF a Qwen se frena: solo Gemini los lee', post({ ...base, imagen: { b64: 'QUJD', mime: 'application/pdf' } }).codigo, 'DATO_INVALIDO');
  eq('sin token ni cuenta no hay IA', post({ ...base, token: '' }).codigo, 'ROL_SIN_PERMISO');

  proveedor = (url, opts) => ({ codigo: 200, cuerpo: { candidates: [{ content: { parts: [{ text: 'Hola' }] } }] } });
  llamadas.length = 0;
  const chat = post({ ruta: 'ia', google_token: G.elias, modo: 'chat', prov: 'gemini', model: 'gemini-3.1-flash-lite',
                      sistema: 'Eres el asistente', mensajes: [{ role: 'assistant', content: 'antes' }], pregunta: '¿qué hay hoy?' });
  eq('el asistente pregunta por el mismo camino', chat.texto, 'Hola');
  const cuerpoGemini = JSON.parse(llamadas.find(l => l.url.includes('generativelanguage')).opts.payload);
  eq('  con los papeles de Gemini', cuerpoGemini.contents.map(c => c.role), ['model', 'user']);

  /* El tope de 64 KB se abre solo para /ia. */
  const grande = 'A'.repeat(200000);
  proveedor = () => ({ codigo: 200, cuerpo: { choices: [{ message: { content: 'ok' } }] } });
  eq('una imagen de 200 KB entra por /ia', post({ ...base, imagen: { b64: grande, mime: 'image/jpeg' } }).ok, true);
  eq('200 KB por cualquier otra ruta, no', post({ ruta: 'solicitar', token: TOK_PAGOS, folio: 'COT-0040@PAG1', relleno: grande }).mensaje, 'El cuerpo es demasiado grande.');

  /* El cupo diario por persona. */
  let agotado = null;
  for (let i = 0; i < 205 && agotado === null; i++) { const x = post({ ...base, token: TOK_DIR }); if (x.codigo === 'CUPO_AGOTADO') agotado = i; }
  eq('doscientas consultas al día por persona, y ahí se frena', agotado, 200);
  cierto('  sin frenar a los demás', post({ ...base, google_token: G.omar, token: '' }).ok);
}

console.log('\nLO QUE LA REVISIÓN ENCONTRÓ — y ya no pasa');
{
  /* /estado solo contesta de lo que pidió quien pregunta. */
  const F = 'COT-0050@PAG1';
  post({ ruta: 'solicitar', token: TOK_PAGOS, folio: F, cotizacion: cot() });
  post({ ruta: 'autorizar', google_token: G.elias, folio: F, cotizacion: cot(), precioAuth: 12000, nota: 'solo para el vendedor' });
  const ajeno = post({ ruta: 'estado', google_token: G.taller, folios: [F] }).folios[F];
  eq('fabricación no ve el sello de un folio que no pidió', [ajeno.estado, ajeno.sello, ajeno.nota], [null, null, '']);
  eq('quien lo pidió, sí', post({ ruta: 'estado', token: TOK_PAGOS, folios: [F] }).folios[F].sello.total, 12000);
  eq('y dirección también', post({ ruta: 'estado', google_token: G.elias, folios: [F] }).folios[F].estado, 'autorizada');

  /* El tope grande solo se abre a un cuerpo que EMPIEZA por la ruta de la IA, y con cupo. */
  const relleno = 'A'.repeat(200000);
  const escondido = JSON.stringify({ relleno, ruta: 'ia', token: TOK_PAGOS });
  eq('"ruta":"ia" escondido al final ya no abre el tope', JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: escondido } }).s).mensaje, 'El cuerpo es demasiado grande.');
  cache.clear();
  let frenado = null;
  proveedor = () => ({ codigo: 200, cuerpo: { choices: [{ message: { content: 'ok' } }] } });
  for (let i = 0; i < 45 && frenado === null; i++) {
    const r = conCache({ ruta: 'ia', token: TOK_DIR, modo: 'cotizar', prov: 'qwen', model: 'qwen3.7-flash', prompt: 'x', imagen: { b64: relleno, mime: 'image/jpeg' } });
    if (r.codigo === 'SIN_RED') frenado = i;
  }
  eq('y cuarenta cuerpos grandes por minuto, entre todos', frenado, 40);
  cache.clear();

  /* La firma no se deja correr la frontera entre dos campos. */
  const canon = vm.runInContext('canonDe', ctx);
  const base = { folio: 'COT-1@A', huella: 'h', subCalc: 1, precioAuth: 0, itemsAuth: '', total: 1, ts: 't' };
  cierto('«Tacos|x» + «y» no firma igual que «Tacos» + «x|y»',
    canon({ ...base, proyecto: 'Tacos|x', correo: 'y@al3d.mx' }) !== canon({ ...base, proyecto: 'Tacos', correo: 'x|y@al3d.mx' }));

  /* Lo que no cabe en una celda se rechaza con su razón, en vez de cortarse. */
  const enorme = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, tipo: 'manual', pz: 1, pu: 1, desc: 'x'.repeat(300),
    material: 'm'.repeat(60), comp: 'c'.repeat(60), acab: 'a'.repeat(60), bas: 'b'.repeat(60) }));
  const g = post({ ruta: 'solicitar', token: TOK_PAGOS, folio: 'COT-0051@PAG1', cotizacion: cot({ items: enorme, subtotal: 80 }) });
  eq('una cotización que no cabe en la hoja se rechaza', g.codigo, 'DATO_INVALIDO');
  cierto('  y dice qué hacer', /demasiado grande/.test(g.mensaje));
}

console.log('\nEL TOPE DE 64 KB — se pide contra la ruta que de verdad atiende');
{
  const relleno = 'A'.repeat(200000);
  const doPost = vm.runInContext('doPost', ctx);
  const de = x => JSON.parse(x.s);
  cache.clear();
  /* JSON.parse se queda con la última llave repetida: el husmeo veía "ia" y la ruta era otra. */
  const dos = '{"ruta":"ia","ruta":"empujar","token":"' + TOK_PAGOS + '","ops":[],"relleno":"' + relleno + '"}';
  eq('un cuerpo grande con dos "ruta" (ia primero, empujar después) se rechaza', de(doPost({ postData: { contents: dos } })).mensaje, 'El cuerpo es demasiado grande.');
  const cuerpoIA = JSON.stringify({ ruta: 'ia', token: TOK_PAGOS, relleno });
  eq('uno que empieza bien pero llega a /exec/empujar, también', de(doPost({ pathInfo: 'empujar', postData: { contents: cuerpoIA } })).mensaje, 'El cuerpo es demasiado grande.');
  eq('  y a /exec/verificar, también', de(doPost({ pathInfo: 'verificar', postData: { contents: cuerpoIA } })).mensaje, 'El cuerpo es demasiado grande.');
  cache.clear();
}

console.log('\nEL CUPO DE IA — se cuenta con candado, y el candado no espera a la IA');
{
  const base = { ruta: 'ia', token: TOK_PAGOS, modo: 'cotizar', prov: 'qwen', model: 'qwen3.7-flash',
                 prompt: 'Analiza', imagen: { b64: 'QUJD', mime: 'image/jpeg' } };
  /* La cuenta se escribe con el candado puesto: sin él, veinte consultas en paralelo leían la
     misma cuenta y contaban como una. */
  const escribir = props.setProperty;
  const alEscribirCuota = [];
  props.setProperty = (k, v) => { if (String(k).startsWith('IA_CUOTA_')) alEscribirCuota.push(candado.tomado); return escribir(k, v); };
  let alLlamar = null;
  proveedor = () => { alLlamar = candado.tomado; return { codigo: 200, cuerpo: { choices: [{ message: { content: 'ok' } }] } }; };
  cierto('una consulta normal pasa', post(base).ok);
  eq('  la cuenta del día se escribió con el candado tomado', alEscribirCuota, [true]);
  eq('  y se soltó antes de llamar a la IA: la hoja no se queda sin escrituras mientras contesta', alLlamar, false);

  const cuenta = () => Object.values(JSON.parse(props.getProperty(Object.keys(props.getProperties()).find(k => k.startsWith('IA_CUOTA_'))) || '{}')).reduce((s, x) => s + x, 0);
  const antes = cuenta();
  llamadas.length = 0;
  candado.ajeno = true;   // una subida del puente lo tiene
  const ocupada = post(base);
  candado.ajeno = false;
  eq('con el candado ocupado no cuenta a ciegas: niega, y el teléfono reintenta', [ocupada.codigo, ocupada.transitorio], ['SIN_RED', true]);
  cierto('  y lo dice', /ocupada/.test(ocupada.mensaje));
  eq('  sin gastar una llamada ni un lugar del cupo', [llamadas.filter(l => l.url.includes('dashscope')).length, cuenta()], [0, antes]);
  props.setProperty = escribir;
}

console.log('\nVERIFICAR.HTML — lo que llega de la hoja se escribe como texto');
{
  const pag = readFileSync(new URL('../verificar.html', import.meta.url), 'utf8');
  const guion = pag.split('<script type="module">')[1] || '';
  cierto('no usa innerHTML: el negocio lo escribió alguien y es un dato', !/innerHTML|insertAdjacentHTML|document\.write/.test(guion));
  cierto('pregunta por la ruta pública, sin token', /ruta: 'verificar'/.test(guion) && !/token/i.test(guion));
  cierto('y no la indexa un buscador', /<meta name="robots" content="noindex">/.test(pag));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
