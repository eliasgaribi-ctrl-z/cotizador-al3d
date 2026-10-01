/* VERIFICAR CON EL FOLIO QUE SÍ VIENE EN EL PAPEL (falla 1 del paquete de UI, ficha A1).
 *
 * Qué defiende, que es lo que le pasaba a un cliente de verdad:
 *
 *   El PDF imprime «COT-0042» en la cabecera, y junto al QR nada más la dirección y el
 *   código. El folio largo —«COT-0042@K7QM», con el aparato que lo emitió— no sale impreso en
 *   ningún lado. Quien no podía escanear y tecleaba lo que veía mandaba «COT-0042»,
 *   folioValido() lo rechazaba por no traer «@», y /verificar contestaba `no_autentica`: la
 *   página que existe para dar confianza le decía a un cliente que su cotización buena,
 *   autorizada y firmada por AL3D, era falsa. No hay error peor en esta pantalla.
 *
 * Lo que se arregló y esta prueba sostiene:
 *
 *   · folioValido() NO se aflojó. El folio corto se repite entre teléfonos —cada aparato
 *     numera el suyo desde COT-0001—, así que en las rutas que ESCRIBEN sigue siendo
 *     ambiguo y sigue rechazándose. Si alguien lo afloja «para que /verificar funcione»,
 *     aquí se cae.
 *   · /verificar acepta el folio del papel con su propia regla (folioDePapel_), porque ahí
 *     quien identifica no es el folio sino el código: doce hexadecimales del HMAC del
 *     renglón. Se busca por código, el folio solo estrecha, y la firma se recalcula entera.
 *   · Un folio corto no abre ninguna puerta: sin el código bueno no hay renglón, y con el
 *     renglón cambiado a mano en la hoja la firma deja de cuadrar y vuelve `no_autentica`.
 *
 * El archivo .gs no es un módulo y no se puede importar: se evalúa en un contexto aparte con
 * los servicios de Google de mentiras, como hace pruebas/puente-hoja.mjs. La hoja de mentiras
 * de aquí es más chica que la de allá a propósito: solo la pestaña de Autorizaciones, que es
 * lo único que /verificar toca.
 *
 * Se corre con pruebas/correr.sh, como todas.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const falso = (que, x) => eq(que, !!x, false);

const aqui = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(aqui, '..', 'puente', 'hoja-apps-script.gs'), 'utf8');

/* ---------------------------------------------------------------- los servicios de mentiras */
const SECRETO = 'secreto-de-prueba-no-es-el-de-produccion';
const noImplementado = new Proxy({}, { get: () => () => { throw new Error('servicio de Google no disponible en la prueba'); } });

/* Apps Script devuelve bytes CON SIGNO (−128..127) y aHex() los vuelve a subir con
   (b+256)%256. Se devuelven sin signo: aHex da lo mismo con unos y con otros, y así la firma
   de la prueba es la misma que la de la hoja. */
const Utilities = {
  computeHmacSha256Signature: (texto, clave) => [...createHmac('sha256', String(clave)).update(String(texto), 'utf8').digest()],
  formatDate: (d, _tz, patron) => {
    const p = new Date(d);
    const dd = String(p.getUTCDate()).padStart(2, '0'), mm = String(p.getUTCMonth() + 1).padStart(2, '0');
    return String(patron).replace('dd', dd).replace('MM', mm).replace('yyyy', String(p.getUTCFullYear()));
  },
  getUuid: () => 'uuid-de-prueba',
};

/* La pestaña «Autorizaciones» y nada más: getLastRow y getRange().getValues(), que es lo
   único que filasDe() usa. La primera fila es la cabecera, como en la hoja de verdad. */
let RENGLONES = [];
const hojaAutorizacionesFalsa = {
  getLastRow: () => RENGLONES.length + 1,
  getRange: (fila, col, nFilas, nCols) => ({
    getValues: () => RENGLONES.slice(fila - 2, fila - 2 + nFilas).map(r => r.slice(col - 1, col - 1 + nCols)),
  }),
};
const SpreadsheetApp = {
  getActive: () => ({
    getSheetByName: nombre => (nombre === 'Autorizaciones' ? hojaAutorizacionesFalsa : null),
    getSpreadsheetTimeZone: () => 'America/Mexico_City',
  }),
};
const PropertiesService = { getScriptProperties: () => ({ getProperty: () => SECRETO, setProperty: () => {} }) };

const ctx = vm.createContext({
  SpreadsheetApp, PropertiesService, Utilities,
  /* CacheService no se implementa a propósito: cupoDeVerificar() lo envuelve en try/catch y
     devuelve true cuando falla, que es justo lo que se quiere en la prueba —el cupo no es lo
     que se está probando aquí, y de paso queda dicho que su fallo no bloquea la consulta. */
  CacheService: noImplementado, ScriptApp: noImplementado, MailApp: noImplementado,
  LockService: noImplementado, ContentService: noImplementado, HtmlService: noImplementado,
  UrlFetchApp: noImplementado, Session: noImplementado, Logger: noImplementado, console,
});
vm.runInContext(src, ctx);
const api = vm.runInContext(
  '({ folioValido, folioDePapel_, folioCorto_, ultimaFilaDeVerificar_, rutaVerificar_,' +
  '   firmar, codigoDe, normalizarCodigo, registroDeFila, COLS_AUT, A_FOLIO, A_CODIGO,' +
  '   A_FIRMA, A_ESTADO, A_TOTAL, A_PROY, A_TS })', ctx);

/* Un renglón de Autorizaciones como lo escribe la hoja, ya firmado. Se firma con las mismas
   funciones del .gs para que la prueba no tenga una copia de la regla: si la firma cambia,
   cambia aquí sola. */
function renglon({ folio, proyecto = 'Tacos El Güero', cliente = 'Ana', sub = 10000, precio = 10000,
                   total = 11600, ts = '2026-09-20T18:04:11.000Z', correo = 'elias@al3d.mx',
                   estado = 'vigente', huella = 'h1', items = '' }) {
  const v = new Array(api.COLS_AUT.length).fill('');
  v[0] = ts; v[1] = folio; v[2] = proyecto; v[3] = cliente; v[4] = sub; v[5] = precio;
  v[6] = total; v[7] = 0; v[8] = items; v[9] = huella; v[10] = correo; v[11] = correo;
  v[14] = estado; v[15] = '';
  const firma = api.firmar(api.registroDeFila(v), SECRETO);
  v[api.A_FIRMA] = firma;
  v[api.A_CODIGO] = api.codigoDe(firma);
  return v;
}
const verificar = (f, c) => api.rutaVerificar_({ f, c });

console.log('\nfolioValido() SIGUE SIENDO ESTRICTO — las rutas que escriben no aceptan folio corto');
{
  cierto('el folio con aparato pasa', api.folioValido('COT-0042@K7QM'));
  falso('el folio corto NO pasa, y así tiene que quedarse', api.folioValido('COT-0042'));
  falso('ni vacío', api.folioValido(''));
  falso('ni un no-texto', api.folioValido(42));
  /* Por qué importa: el corto se repite entre teléfonos. Si autorizar o revocar lo
     aceptaran, tocarían el renglón de la cotización de otro aparato con el mismo número. */
}

console.log('\nfolioDePapel_() — lo que sí puede llegar de un papel');
{
  cierto('con aparato (lo que trae el QR)', api.folioDePapel_('COT-0042@K7QM'));
  cierto('sin aparato (lo que está impreso)', api.folioDePapel_('COT-0042'));
  falso('con arroba y nada después', api.folioDePapel_('COT-0042@'));
  falso('con dos arrobas', api.folioDePapel_('COT-0042@a@b'));
  falso('con espacios', api.folioDePapel_('COT 0042'));
  falso('con una comilla, que en la hoja es texto pero aquí no es folio', api.folioDePapel_("COT-0042'"));
  falso('vacío', api.folioDePapel_(''));
  eq('folioCorto_ quita el aparato', api.folioCorto_('COT-0042@K7QM'), 'COT-0042');
  eq('y deja en paz al que no lo trae', api.folioCorto_('COT-0042'), 'COT-0042');
}

console.log('\nLA FALLA 1, DE PUNTA A PUNTA — la cotización buena tecleada del papel');
{
  const fila = renglon({ folio: 'COT-0042@K7QM' });
  RENGLONES = [fila];
  const cod = String(fila[api.A_CODIGO]);            // «A1B2-C3D4-E5F6», como va impreso

  const porQR = verificar('COT-0042@K7QM', cod);
  eq('escaneando el QR: auténtica (esto ya funcionaba)', porQR.estado, 'autentica');

  const aMano = verificar('COT-0042', cod);
  eq('tecleando el folio del papel: auténtica  ← la falla', aMano.estado, 'autentica');
  eq('y contesta lo mismo que el QR', [aMano.folio, aMano.total, aMano.proyecto],
     [porQR.folio, porQR.total, porQR.proyecto]);
  eq('el folio que contesta es el corto, el que se compara con el papel', aMano.folio, 'COT-0042');
  eq('con la fecha formateada', aMano.fecha, '20/09/2026');

  eq('en minúsculas también, que es como se teclea en un teclado de verdad',
     verificar('cot-0042', cod).estado, 'autentica');
  eq('y el código con separadores raros, que normalizarCodigo ya limpiaba',
     verificar('COT-0042', cod.replace(/-/g, ' ')).estado, 'autentica');
}

console.log('\nEL FOLIO CORTO NO ABRE NINGUNA PUERTA');
{
  const fila = renglon({ folio: 'COT-0042@K7QM' });
  RENGLONES = [fila];
  const cod = String(fila[api.A_CODIGO]);

  eq('sin código no hay nada', verificar('COT-0042', '').estado, 'no_autentica');
  eq('con un código inventado tampoco', verificar('COT-0042', 'AAAA-BBBB-CCCC').estado, 'no_autentica');
  eq('con el código de otra cotización tampoco',
     verificar('COT-0042', String(renglon({ folio: 'COT-0099@K7QM' })[api.A_CODIGO])).estado, 'no_autentica');
  eq('un folio que no existe, con un código que sí', verificar('COT-7777', cod).estado, 'no_autentica');

  /* El caso que de verdad importa: alguien con la hoja abierta le sube el total al renglón.
     El renglón sigue ahí y el código impreso sigue siendo el mismo, pero la firma se
     recalcula desde el renglón y ya no cuadra. */
  const tocada = fila.slice();
  tocada[api.A_TOTAL] = 99999;
  RENGLONES = [tocada];
  eq('con el total cambiado a mano en la hoja: no auténtica', verificar('COT-0042', cod).estado, 'no_autentica');
  const tocada2 = fila.slice();
  tocada2[api.A_PROY] = 'Otro negocio';
  RENGLONES = [tocada2];
  eq('con el negocio cambiado a mano: no auténtica', verificar('COT-0042', cod).estado, 'no_autentica');
}

console.log('\nDOS TELÉFONOS CON EL MISMO COT-0042 — el código desempata');
{
  /* El escenario que folioValido() protege en las rutas que escriben, y que aquí no hace
     daño: dos aparatos numeran desde COT-0001, así que dos cotizaciones distintas de dos
     teléfonos pueden llamarse igual. Sus códigos no, porque son HMAC de renglones distintos. */
  const a = renglon({ folio: 'COT-0042@K7QM', proyecto: 'Tacos El Güero', total: 11600 });
  const b = renglon({ folio: 'COT-0042@M2PL', proyecto: 'Farmacia Luz', total: 23200 });
  RENGLONES = [a, b];
  cierto('los dos códigos son distintos', String(a[api.A_CODIGO]) !== String(b[api.A_CODIGO]));

  const ra = verificar('COT-0042', String(a[api.A_CODIGO]));
  eq('el código del primero trae el primero', [ra.estado, ra.proyecto, ra.total], ['autentica', 'Tacos El Güero', 11600]);
  const rb = verificar('COT-0042', String(b[api.A_CODIGO]));
  eq('el del segundo trae el segundo', [rb.estado, rb.proyecto, rb.total], ['autentica', 'Farmacia Luz', 23200]);

  /* Y con el folio largo, cada uno solo encuentra el suyo. */
  eq('el largo del primero con el código del segundo no encuentra nada',
     verificar('COT-0042@K7QM', String(b[api.A_CODIGO])).estado, 'no_autentica');
}

console.log('\nREAUTORIZADA Y REVOCADA — el estado sale del renglón que se encontró');
{
  const vieja = renglon({ folio: 'COT-0042@K7QM', total: 11600, ts: '2026-09-20T18:04:11.000Z', estado: 'superada' });
  const nueva = renglon({ folio: 'COT-0042@K7QM', total: 9280, ts: '2026-09-25T10:00:00.000Z', estado: 'vigente' });
  RENGLONES = [vieja, nueva];
  eq('el código viejo dice «ya no vigente»', verificar('COT-0042', String(vieja[api.A_CODIGO])).estado, 'superada');
  eq('y enseña el total que llevaba ESE papel', verificar('COT-0042', String(vieja[api.A_CODIGO])).total, 11600);
  eq('el código nuevo dice auténtica', verificar('COT-0042', String(nueva[api.A_CODIGO])).estado, 'autentica');
  eq('con el total nuevo', verificar('COT-0042', String(nueva[api.A_CODIGO])).total, 9280);

  const rev = renglon({ folio: 'COT-0055@K7QM', estado: 'revocada' });
  RENGLONES = [rev];
  eq('una revocada lo dice', verificar('COT-0055', String(rev[api.A_CODIGO])).estado, 'revocada');
}

console.log('\nultimaFilaDeVerificar_() — la búsqueda, suelta');
{
  const a = renglon({ folio: 'COT-0042@K7QM' });
  const b = renglon({ folio: 'COT-0042@K7QM', ts: '2026-09-26T10:00:00.000Z' });
  const filas = [a, b];
  const codB = api.normalizarCodigo(b[api.A_CODIGO]);
  eq('de atrás para adelante: encuentra el último de ese código',
     api.ultimaFilaDeVerificar_(filas, 'COT-0042', codB).fila, 3);
  eq('y el de más atrás con su propio código',
     api.ultimaFilaDeVerificar_(filas, 'COT-0042', api.normalizarCodigo(a[api.A_CODIGO])).fila, 2);
  eq('sin código que coincida, nada', api.ultimaFilaDeVerificar_(filas, 'COT-0042', '000000000000'), null);
  eq('con la hoja vacía, nada', api.ultimaFilaDeVerificar_([], 'COT-0042', codB), null);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
