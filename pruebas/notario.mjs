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
   hoja de verdad. Y un texto sin apóstrofo que parece fecha se vuelve fecha: es lo que la hoja
   hace, y es la razón de que el notario escriba todo con apóstrofo. Si alguien lo quita, la
   prueba de «la firma se comprueba desde el renglón» truena aquí y no en producción. */
const guardar = v => {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v);
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

const ss = libro();
const props = propiedades();
const cache = new Map();
const ctx = vm.createContext({
  SpreadsheetApp: { getActive: () => ss, flush() {} },
  PropertiesService: { getScriptProperties: () => props },
  CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  Utilities, UrlFetchApp, console,
});
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
  const r = post({ ruta: 'autorizar', google_token: G.elias, folio: 'COT-0030@K7QM', cotizacion: cot({ proyecto: '=IMPORTXML("http://x.mx","//a")' }) });
  const fila = hojaAut().filas[hojaAut().getLastRow() - 1];
  cierto('un negocio que empieza con = se sella', r.ok);
  eq('  queda escrito como texto, tal cual', fila[2], '=IMPORTXML("http://x.mx","//a")');
  eq('  y verifica', post({ ruta: 'verificar', f: 'COT-0030@K7QM', c: r.sello.codigo }).estado, 'autentica');
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

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
