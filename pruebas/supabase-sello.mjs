/* EL SELLO PARA SUPABASE, CONTRA EL APPS SCRIPT DE VERDAD. Sin Google, sin cuenta, en node.

   supabase/functions/_shared/sello.js y verificar.js reescriben la firma de los PDF y la ruta
   pública /verificar del Apps Script (puente/hoja-apps-script.gs). La regla de oro es una sola: un
   PDF ya impreso tiene que seguir verificando, y eso solo es cierto si el texto que se firma y el
   HMAC salen idénticos al byte. Así que aquí no se prueba «que firme algo»: se carga el .gs REAL
   en un contexto de vm, con un Utilities de mentira, y a la reescritura se le exige LO MISMO.

   Cinco bloques, en el orden en que se pidieron:
     1. Los vectores del mapa 04 §1.8 (clave falsa), contra el .gs y contra la reescritura.
     2. La prueba diferencial: más de trescientos casos —aleatorios con semilla fija y de borde—
        con acentos, «», ·, ×, emojis, caracteres astrales que cambian el orden UTF-16, importes con
        decimales de sobra, 0, -0, 1e21, vacíos, null, partidas desordenadas, v1 y v2.
     3. La verificación: sellos buenos, alterados en cada campo, de otra clave, truncados, con espacios,
        y con la codificación propia de la fila (se prueba SOLO esa) o sin ella (primero ASCII-?, luego UTF-8).
     4. /verificar: una respuesta por estado, nada sensible hacia un anónimo, el cupo y los errores de
        configuración (la falla que el .gs tiene y la reescritura no: decir «falso» cuando falta la clave).
     5. El hecho comprobado: con qué codificación vuelve bytes Apps Script (doce HMAC reales).

   EL HECHO QUE MANDA SOBRE TODO LO DEMÁS. Comprobado el 2026-10-10 en un proyecto real de Apps
   Script, con claves FALSAS: Utilities.computeHmacSha256Signature(String, String) NO codifica en
   UTF-8. Pasa el texto y la clave a bytes como US-ASCII, con un «?» por cada punto de código que no
   sea ASCII (un emoji es UN «?»). Los doce HMAC que devolvió están en
   pruebas/datos/hmac-apps-script-real.json y el bloque 5 exige que sello.js los reproduzca al byte.
   Ya no es una hipótesis. De ahí sale cómo se prueba todo lo demás:
     · El Utilities de mentira con el que se carga el .gs (gsDe) hace LO MISMO que el de verdad, y el
       bloque 5 comprueba que reproduce esos doce HMAC: si el doble se desviara de la realidad, se cae.
     · A sello.js se le exige lo que hace el .gs real: por omisión (los sellos nuevos) y con
       { codificacion: 'ascii-?' } da los mismos bytes que el .gs, caso por caso.
     · La opción 'utf-8' (la de los sellos fuertes de más adelante, y el segundo intento de verificar)
       NO es lo que hace Apps Script, así que no se compara con el .gs sino con node:crypto, que
       codifica en UTF-8 por su cuenta y no comparte nada con el WebCrypto de la reescritura.
     · Casi todo sello v2 ya impreso se firmó con ASCII-?: por eso verificar() lo prueba primero.

   LA PRUEBA DE ORO, CON FILAS REALES (opcional; sin las dos variables de entorno no se corre). Ya no
   hace falta para decidir la codificación, pero sigue siendo lo único que prueba la clave REAL (más de
   64 bytes si la creó el .gs: tres UUID, que los doce vectores no cubren) y filas reales de punta a punta:
     · En el editor de Apps Script, correr esta función y copiar lo que deja en el registro (va sin
       cliente ni nota, que no se firman, para no sacar datos de más):
         function exportarFilasParaPrueba() {
           var h = SpreadsheetApp.getActive().getSheetByName('Autorizaciones');
           var v = h.getRange(2, 1, h.getLastRow() - 1, 17).getValues();
           v.forEach(function (r) { r[3] = ''; r[15] = ''; });
           Logger.log(JSON.stringify(v));
         }
     · Guardarlo en un archivo FUERA del repositorio (el sitio publica el árbol entero).
     · La clave (propiedad de script SELLO_AUTORIZACION) solo en el entorno de tu terminal, sin que
       quede en el historial ni en ningún archivo:
         read -rs AL3D_SELLO_CLAVE_REAL; export AL3D_SELLO_CLAVE_REAL
         AL3D_SELLO_FILAS_REALES=/ruta/fuera/del/repo/filas.json node pruebas/supabase-sello.mjs
     · Imprime cuántas filas cuadran y con qué codificación. Nunca imprime la clave ni el contenido.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { createHmac, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import vm from 'node:vm';
import * as Sello from '../supabase/functions/_shared/sello.js';
import * as Ver from '../supabase/functions/_shared/verificar.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0, pasan = 0, casos = 0, casosUtf8 = 0;
const recortar = (s, n = 320) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => { console.log('  ✓ ' + m); pasan++; };
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) bien(que);
  else mal(que + '\n         dio: ' + recortar(a) + '\n         esp: ' + recortar(b));
};
const cierto = (que, x) => eq(que, !!x, true);
/* Que algo lance un ErrorDeSello con ese código. */
async function lanza(que, fn, codigo) {
  try { await fn(); mal(que + ' (no lanzó nada)'); }
  catch (e) { eq(que, [e && e.name, e && e.codigo], ['ErrorDeSello', codigo]); }
}

/* ============================================================================
   Lo que se repite: la clave falsa, el azar con semilla, y el Apps Script de mentiras
   ============================================================================ */

/* Claves FALSAS, marcadas como tales. La primera es la del mapa 04 §1.8 (126 caracteres), para
   poder reproducir sus vectores; la segunda es para todo lo demás. Ninguna es un secreto. */
const CLAVE_DEL_MAPA = 'FALSO-0000aaaa-1111-2222-3333-444455556666FALSO-0000bbbb-1111-2222-3333-444455556666FALSO-0000cccc-1111-2222-3333-444455556666';
const CLAVE = 'clave-falsa-solo-para-pruebas';
const ZONA = 'America/Mexico_City';

/* mulberry32: el mismo azar en cada corrida, para que un fallo se pueda repetir. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* El Utilities de Apps Script. computeHmacSha256Signature hace lo que hace el de verdad, comprobado
   el 2026-10-10 en Apps Script real (doce HMAC en pruebas/datos/hmac-apps-script-real.json; el
   bloque 5 exige que ESTE doble los reproduzca): el valor Y la clave se vuelven bytes US-ASCII, con
   un «?» por cada punto de código que no sea ASCII (un emoji es UN «?»); el U+0000 pasa tal cual.
   Los bytes salen CON SIGNO (−128..127), como allá: así el aHex() del .gs trabaja su rama de
   (b + 256) % 256 de verdad. El camino es node:crypto, que no comparte nada con el WebCrypto de la
   reescritura. computeDigest usa la misma conversión, pero NO está medido en Apps Script real (solo
   computeHmacSha256Signature lo está): el .gs lo llama aquí con el folio, que es ASCII. */
const asciiInterr = s => Uint8Array.from([...String(s)].map(c => (c.codePointAt(0) < 128 ? c.codePointAt(0) : 63)));
const aSigno = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const noImplementado = new Proxy({}, { get: () => () => { throw new Error('servicio de Google no disponible en la prueba'); } });
const FUENTE_GS = readFileSync(new URL('../puente/hoja-apps-script.gs', import.meta.url), 'utf8');

/* Un .gs cargado en su propio contexto, con el Utilities fiel de arriba. `e` es su mundo: la hoja de
   Autorizaciones (filas de 17 columnas, como getValues()), la propiedad del sello, el reloj y la
   caché de los cupos. */
function gsDe() {
  const e = { filas: [], clave: null, hoja: true, ahora: Date.UTC(2026, 9, 10, 12), cache: new Map(), cacheActiva: false, uuids: 0 };
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    getUuid: () => 'uuid-falso-' + (++e.uuids),
    computeHmacSha256Signature: (valor, clave) => aSigno(createHmac('sha256', asciiInterr(clave)).update(asciiInterr(valor)).digest()),
    computeDigest: (_alg, s) => aSigno(createHash('sha256').update(asciiInterr(s)).digest()),
    base64EncodeWebSafe: b => Buffer.from(b.map(x => (x + 256) % 256)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    formatDate: (d, tz, fmt) => {
      if (fmt !== 'dd/MM/yyyy') throw new Error('el doble solo sabe dd/MM/yyyy');
      const p = {};
      for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d)) p[x.type] = x.value;
      return p.day + '/' + p.month + '/' + p.year;
    },
  };
  const hoja = {
    getLastRow: () => e.filas.length + 1,
    getRange: (f, c, nf, nc) => ({ getValues: () => e.filas.slice(f - 2, f - 2 + nf).map(r => r.slice(c - 1, c - 1 + nc)) }),
  };
  const SpreadsheetApp = { getActive: () => ({ getSheetByName: n => (n === 'Autorizaciones' && e.hoja ? hoja : null), getSpreadsheetTimeZone: () => ZONA }) };
  const props = { getProperty: k => (k === 'SELLO_AUTORIZACION' ? e.clave : null), setProperty: (k, v) => { if (k === 'SELLO_AUTORIZACION') e.clave = String(v); } };
  /* La caché de los cupos, con caducidad de verdad sobre el reloj de `e`. Apagada, truena: el .gs
     la envuelve en try/catch y deja pasar, que es lo que se quiere cuando el cupo no es el tema. */
  const CacheService = {
    getScriptCache: () => {
      if (!e.cacheActiva) throw new Error('caché apagada en la prueba');
      return {
        get: k => { const x = e.cache.get(k); if (!x) return null; if (x.hasta <= e.ahora) { e.cache.delete(k); return null; } return x.v; },
        put: (k, v, ttl = 600) => { e.cache.set(k, { v: String(v), hasta: e.ahora + ttl * 1000 }); },
      };
    },
  };
  const ctx = vm.createContext({
    SpreadsheetApp, PropertiesService: { getScriptProperties: () => props }, CacheService, Utilities,
    ContentService: noImplementado, LockService: noImplementado, HtmlService: noImplementado, UrlFetchApp: noImplementado,
    ScriptApp: noImplementado, MailApp: noImplementado, Session: noImplementado, Logger: noImplementado, console,
    __reloj: () => e.ahora,
  });
  vm.runInContext('Date.now = function () { return __reloj(); };', ctx);
  vm.runInContext(FUENTE_GS, ctx);
  const api = vm.runInContext('({ canonDe, firmar, codigoDe, normalizarCodigo, dinero2, itemsAuthCanon, itemsAuthDeCanon,' +
    ' cotHuella, folioDePapel_, folioCorto_, renglonesDeTexto, ultimaFilaDeVerificar_, rutaVerificar_,' +
    ' secretoDelSello_, registroDeFila, aHex })', ctx);
  return { e, api, Utilities };
}
const GS = gsDe();

/* Una fila de la hoja (17 columnas, como getValues()) firmada con las funciones del .gs, y la
   misma fila como la tendría la base. El .gs firma; la reescritura comprueba: independientes. */
function filaHoja(gs, c) {
  const v = new Array(17).fill('');
  v[0] = c.ts; v[1] = c.folio; v[2] = c.proyecto; v[3] = c.cliente === undefined ? 'Cliente Privado' : c.cliente;
  v[4] = c.subCalc; v[5] = c.precioAuth; v[6] = c.total; v[7] = c.pct === undefined ? 0 : c.pct; v[8] = c.itemsAuth;
  v[9] = c.huella; v[10] = c.correo; v[11] = c.solicito === undefined ? c.correo : c.solicito;
  v[14] = c.estado === undefined ? 'vigente' : c.estado; v[15] = c.nota === undefined ? '' : c.nota; v[16] = c.renglones;
  const firma = gs.api.firmar(gs.api.registroDeFila(v), gs.e.clave);
  v[13] = firma; v[12] = gs.api.codigoDe(firma);
  return v;
}
const aFilaBD = (v, extra = {}) => ({ id: 0, ts_iso: v[0], folio_global: v[1], proyecto: v[2], cliente: v[3],
  sub_calc: v[4], precio_auth: v[5], total: v[6], ajuste_pct: v[7], items_auth: v[8], huella: v[9], autorizo: v[10],
  solicito: v[11], codigo: v[12], firma: v[13], estado: v[14], nota: v[15], renglones: v[16], ...extra });

/* Compara dos maneras de hacer lo mismo sobre muchos casos. fn(caso) devuelve [lo de la referencia,
   lo de la reescritura] ya como texto. Cuenta los casos y enseña el primero que difiere. La
   referencia es casi siempre el .gs real; la opción 'utf-8', que el Apps Script NO hace, se compara
   con node:crypto y se cuenta aparte, para que «comparados contra el .gs» siga diciendo la verdad. */
async function comparar(que, lista, fn, otraReferencia) {
  let n = 0, difieren = 0, muestra = null;
  for (const c of lista) {
    n++;
    const [a, b] = await fn(c);
    if (a !== b) { difieren++; if (!muestra) muestra = { caso: c, referencia: a, nuevo: b }; }
  }
  if (otraReferencia) casosUtf8 += n; else casos += n;
  if (!difieren) bien(que + ': idéntico ' + (otraReferencia ? 'a ' + otraReferencia : 'al .gs') + ' en ' + n + ' casos');
  else mal(que + ': difieren ' + difieren + ' de ' + n + ' (referencia: ' + (otraReferencia || 'el .gs') + '). Primero: ' + recortar(JSON.stringify(muestra), 700));
  return n;
}
const j = x => JSON.stringify(x);

/* verificarPublico, anotando cada `motivo` que contesta: al final se exige que se ejercieron TODOS
   los de la lista que exporta el módulo y que no salió ninguno que no esté en ella. */
const motivosVistos = new Set();
const vp = async (...args) => { const r = await Ver.verificarPublico(...args); motivosVistos.add(r.motivo); return r; };

/* ============================================================================
   Los textos y los números de la prueba diferencial
   ============================================================================ */

/* Pedazos de texto que muerden: acentos, comillas, separadores, controles, espacios raros,
   emojis y caracteres astrales, y los dos que cambian el orden UTF-16 contra el de puntos de
   código (un par sustituto empieza en D8xx, MENOS que ～ o , aunque valga más). */
const PEDAZOS = ['Tacos', 'El Güero', 'Letras', 'Bastidor', 'Acrílico', 'ñandú', 'Ñoño', 'Ü', '«TACOS»', '«', '»',
  '·', '×', '€', '°', '½', 'a"b', 'a\\b', 'a|b', "o'k", '=1+1', '@x', ',', ':', '~', '[', ']', '{', '}', '/',
  '<b>', '&amp;', ' ', '  ', '\t', '\n', '\r\n', ' ', ' ', ' ', '​', '﻿', '‮',
  '\u0000', '\u0001', '\u001f', '\u007f', '\u0085', '😀', '🇲🇽', '👨‍👩‍👧', '𝒜', '𠜎', '～', '', '￿',
  '\ud83d', '\ude00', 'ﬀ', 'ß', 'İ', 'ı', 'é', 'é', '10', '9', '2', '1'];
const ASCII = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.'.split('');
function cadena(azar, max) {
  let s = '';
  const n = Math.floor(azar() * (max + 1));
  for (let i = 0; i < n; i++) s += azar() < 0.5 ? ASCII[Math.floor(azar() * ASCII.length)] : PEDAZOS[Math.floor(azar() * PEDAZOS.length)];
  return s;
}
/* Importes: de los que se redondean mal, de los que traen ruido de flotante, y los extremos. */
const NUMEROS = [0, -0, 1, -1, 0.1, 0.2, 0.1 + 0.2, 0.005, 0.015, 0.025, 1.005, 2.675, 1.115, 0.045, 33.335,
  1234.5678, 11310, 11310.000000000002, 13119.6, 12500, 14000, 99999999.995, 1e9, 1e15, 1e21, 1e-7, 5e-324,
  123456789.125, 9007199254740991, 2469.12, -0.004, -0.005, -1.5, 0.30000000000000004, 1e300];
/* Lo que no es un número y se firma de todos modos (el .gs no valida): nulos, vacíos, textos. */
const RAROS = [null, undefined, '', NaN, Infinity, -Infinity, '12.5', '1e3', ' 7 ', 'abc', true, false, [], [5], {}];
const numero = azar => { const x = azar(); return x < 0.55 ? NUMEROS[Math.floor(azar() * NUMEROS.length)]
  : x < 0.8 ? Math.round(azar() * 1e8) / 100 : x < 0.95 ? azar() * 1e6 : RAROS[Math.floor(azar() * RAROS.length)]; };

/* ============================================================================
   0. LOS MÓDULOS SON PUROS — correrán en Deno y en Node sin cambiar una línea
   ============================================================================ */

console.log('\n0. LOS MÓDULOS SON PUROS — nada exclusivo de Node, nada del entorno, nada de red');
{
  /* Sin comentarios ni textos (que hablan de process, de Buffer y de node: sin ser código). */
  const sinTextos = t => {
    let out = '';
    for (let i = 0; i < t.length; i++) {
      const c = t[i], s = t[i + 1];
      if (c === '/' && s === '/') { const k = t.indexOf('\n', i); out += ' '; i = k < 0 ? t.length : k - 1; continue; }
      if (c === '/' && s === '*') { const k = t.indexOf('*/', i + 2); out += ' '; i = k < 0 ? t.length : k + 1; continue; }
      if (c === "'" || c === '"' || c === '`') {
        let k = i + 1;
        for (; k < t.length && t[k] !== c; k++) if (t[k] === '\\') k++;
        out += c + c; i = k; continue;
      }
      out += c;
    }
    return out;
  };
  const PROHIBIDO = [[/\bprocess\b/, 'process'], [/\bBuffer\b/, 'Buffer'], [/\brequire\s*\(/, 'require('], [/\bnode:/, 'node:'],
    [/\bDeno\b/, 'Deno'], [/\bfetch\s*\(/, 'fetch('], [/\bXMLHttpRequest\b/, 'XMLHttpRequest'], [/\bDate\.now\b/, 'Date.now'],
    [/\bnew Date\(\s*\)/, 'new Date() sin argumentos'], [/\bMath\.random\b/, 'Math.random'], [/\bimport\s*\(/, 'import()'],
    [/\b(window|document|localStorage|sessionStorage)\b/, 'APIs del navegador'],
    [/\b(readFileSync|writeFileSync|createHmac|createHash|randomBytes)\b/, 'node:fs / node:crypto']];
  for (const [archivo, nombre] of [['sello.js', 'sello.js'], ['verificar.js', 'verificar.js']]) {
    const t = readFileSync(join(RAIZ, 'supabase', 'functions', '_shared', archivo), 'utf8');
    const limpio = sinTextos(t);
    const hallados = PROHIBIDO.filter(([re]) => re.test(limpio)).map(([, n]) => n);
    eq(nombre + ': ni Node, ni entorno, ni red, ni reloj, ni azar dentro del código', hallados, []);
    const importa = [...t.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+'([^']+)'/gm)].map(m => m[1]);
    cierto(nombre + ': solo importa módulos de al lado (' + (importa.join(', ') || 'ninguno') + ')', importa.every(m => m.startsWith('./')));
    cierto(nombre + ': es un módulo ES (exporta) y no usa CommonJS', /^export /m.test(t) && !/module\.exports|exports\./.test(limpio));
    cierto(nombre + ': sin secretos a la vista (ninguna cadena de 64 hexadecimales ni de 100 caracteres seguidos, ni en el código ni en los comentarios)', !/[0-9a-f]{64}/i.test(t) && !/\S{100,}/.test(t));
  }
  const nombres = ['FORMATO_V1', 'FORMATO_V2', 'CAMPOS_PRECIO', 'CODIFICACIONES', 'CODIFICACION_DE_SELLOS_NUEVOS', 'COLUMNAS_DE_AUTORIZACION', 'ErrorDeSello',
    'dinero2', 'itemsAuthCanon', 'itemsAuthDeCanon', 'huellaDe', 'canonDe', 'formatoDe', 'aBytes', 'aHex', 'hmacHex', 'firmar', 'sellar',
    'codigoDe', 'normalizarCodigo', 'tsIso', 'iguales', 'registroDeFila', 'codificacionDeFila', 'verificar', 'claveUsable', 'exigirClave'];
  eq('sello.js exporta lo que los demás módulos van a pedirle', nombres.filter(n => !(n in Sello)), []);
  const de = ['verificarPublico', 'validarPeticion', 'decidirCupo', 'ventanaDe', 'clavesDeCupo', 'respuestaPublica', 'fechaDeVerificar',
    'ultimaFilaDeVerificar', 'renglonesDeTexto', 'folioDePapel', 'folioCorto', 'LIMITES_VERIFICAR', 'contadorEnMemoria'];
  eq('verificar.js también', de.filter(n => !(n in Ver)), []);
  cierto('WebCrypto está aquí (Node 24 lo trae global; Deno también)', globalThis.crypto && globalThis.crypto.subtle);
}

/* ============================================================================
   1. LOS VECTORES DEL MAPA 04 §1.8 — con clave falsa, contra el .gs y contra la reescritura
   ============================================================================ */

console.log('\n1. LOS VECTORES — el mapa 04 §1.8 (clave falsa de 126 caracteres), contra el .gs real y contra sello.js');
const PARTIDAS_TACOS = [
  { id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, altura: 40, n: 8, desc: 'Letras «TACOS»' },
  { id: 2, tipo: 'bastidor', bas: 'lamina', ancho: 300, alto: 60, desc: 'Bastidor' },
];
const HUELLA_TACOS = 'c|1:letras~al-paint~recta~true~40~8~~~~~~~~,2:bastidor~~~~~~~~lamina~300~60~~~';
const BASE_TACOS = { folio: 'COT-0042-B@K7QM', huella: HUELLA_TACOS, subCalc: 11310, precioAuth: 12500, itemsAuth: '', total: 12500,
  proyecto: 'Tacos El Güero', correo: 'elias@al3d.mx', ts: '2026-10-01T04:30:15.123Z', renglones: '[["Letras «TACOS»",8,9600],["Bastidor",1,1710]]' };
/* Los canon son el texto crudo que entra al HMAC. Con String.raw: los \" son barras y comillas de verdad.
   `firma` y `codigo` son lo que da el Apps Script real (ASCII-?; en V1, que es todo ASCII, es igual con UTF-8).
   `firmaUtf8` y `codigoUtf8` son lo que daría un Apps Script que codificara en UTF-8, que es lo que supuso el
   mapa 04: NO es lo que hace el real (hecho comprobado el 2026-10-10; bloque 5), y se conservan para
   comprobar la opción { codificacion: 'utf-8' }. */
const VECTORES = [
  { nombre: 'V1 (v1, sin renglones, todo ASCII)',
    r: { folio: 'COT-0007-B@K7QM', huella: 'c|1:letras~al-paint~recta~true~40~8~~~~~~~~', subCalc: 11310, precioAuth: 0, itemsAuth: '', total: 13119.6,
         proyecto: 'Tacos de Antes', correo: 'elias@al3d.mx', ts: '2026-09-26T17:00:00.000Z', renglones: '' },
    canon: String.raw`AL3D-AUTH-v1["COT-0007-B@K7QM","c|1:letras~al-paint~recta~true~40~8~~~~~~~~","11310.00","0.00","","13119.60","Tacos de Antes","elias@al3d.mx","2026-09-26T17:00:00.000Z"]`,
    firmaUtf8: '6c3baa7b19643e32c7cd2e371cef52ebdd49168582739d255dea2e8eef44b10b', codigoUtf8: '6C3B-AA7B-1964',
    firma: '6c3baa7b19643e32c7cd2e371cef52ebdd49168582739d255dea2e8eef44b10b', codigo: '6C3B-AA7B-1964' },
  { nombre: 'E2E-A (v2, precioAuth 12500, sin ajustes por partida)', r: BASE_TACOS,
    canon: String.raw`AL3D-AUTH-v2["COT-0042-B@K7QM","c|1:letras~al-paint~recta~true~40~8~~~~~~~~,2:bastidor~~~~~~~~lamina~300~60~~~","11310.00","12500.00","","12500.00","Tacos El Güero","elias@al3d.mx","2026-10-01T04:30:15.123Z","[[\"Letras «TACOS»\",8,9600],[\"Bastidor\",1,1710]]"]`,
    firmaUtf8: '103154b355d43c10258af78f53c9c94386c4ed7a414a221f975c120cedae7e0e', codigoUtf8: '1031-54B3-55D4',
    firma: 'f771d7a2c4cf885a4f156d4d98b9905a7546ca435326b6cf7cda4cb2cf943e73', codigo: 'F771-D7A2-C4CF' },
  { nombre: 'E2E-B (v2, aumento repartido: precioAuth 14000 e itemsAuth {2:1500})',
    r: { ...BASE_TACOS, folio: 'COT-0041-B@K7QM', precioAuth: 14000, itemsAuth: '2:1500.00', total: 14000, renglones: '[["Letras «TACOS»",8,10438],["Bastidor",1,1630.97]]' },
    canon: String.raw`AL3D-AUTH-v2["COT-0041-B@K7QM","c|1:letras~al-paint~recta~true~40~8~~~~~~~~,2:bastidor~~~~~~~~lamina~300~60~~~","11310.00","14000.00","2:1500.00","14000.00","Tacos El Güero","elias@al3d.mx","2026-10-01T04:30:15.123Z","[[\"Letras «TACOS»\",8,10438],[\"Bastidor\",1,1630.97]]"]`,
    firmaUtf8: '280b5ab35179d3b337025c83806bc3ab2173b5ac67491c4032a86d50319c06a9', codigoUtf8: '280B-5AB3-5179',
    firma: '094d3bd2fc3e3629cc8c039cbe916efffd006d2acf9bbf43b532ca316ff70e01', codigo: '094D-3BD2-FC3E' },
  { nombre: 'E2E-C (v2, precioAuth 0: total calculado con IVA)', r: { ...BASE_TACOS, folio: 'COT-0043-B@K7QM', precioAuth: 0, total: 13119.6 },
    canon: String.raw`AL3D-AUTH-v2["COT-0043-B@K7QM","c|1:letras~al-paint~recta~true~40~8~~~~~~~~,2:bastidor~~~~~~~~lamina~300~60~~~","11310.00","0.00","","13119.60","Tacos El Güero","elias@al3d.mx","2026-10-01T04:30:15.123Z","[[\"Letras «TACOS»\",8,9600],[\"Bastidor\",1,1710]]"]`,
    firmaUtf8: 'cf1881799dd06afc0c88dde657a3ba342a6a2d26520489cc5a98435d6ee166f2', codigoUtf8: 'CF18-8179-9DD0',
    firma: '744f2dbbf5b752976aeb833e908fdbc0a53e6ee9f227df26bcf1e3b024293cb8', codigo: '744F-2DBB-F5B7' },
  { nombre: 'V5 (v2 con comillas, «|» y Ñ en el negocio)',
    r: { folio: 'COT-0001-A@ABCD', huella: 's|7:manual~~~~~~~~~~~~2~1234.56', subCalc: 2469.12, precioAuth: 0, itemsAuth: '', total: 2469.12,
         proyecto: 'Tacos "El Güero" | Ñandú', correo: 'elias@al3d.mx', ts: '2026-10-09T23:59:59.999Z', renglones: '[["Pieza",2,2469.12]]' },
    canon: String.raw`AL3D-AUTH-v2["COT-0001-A@ABCD","s|7:manual~~~~~~~~~~~~2~1234.56","2469.12","0.00","","2469.12","Tacos \"El Güero\" | Ñandú","elias@al3d.mx","2026-10-09T23:59:59.999Z","[[\"Pieza\",2,2469.12]]"]`,
    firmaUtf8: '76f4c52c2bc6049dbb7f02d13993849867de269f34c5bb4520a6e2547cb8dc39', codigoUtf8: '76F4-C52C-2BC6',
    firma: '9bba89857cc480f302da9bf83f11cb000723dabc0b433542407f07ab1608075d', codigo: '9BBA-8985-7CC4' },
];
{
  const g = GS;
  g.e.clave = CLAVE_DEL_MAPA;
  eq('la clave falsa del mapa mide 126 caracteres y no es secreta', [CLAVE_DEL_MAPA.length, CLAVE_DEL_MAPA.startsWith('FALSO-')], [126, true]);
  for (const v of VECTORES) {
    eq(v.nombre + ' · el texto que entra al HMAC es el del mapa (.gs y reescritura)', [g.api.canonDe(v.r), Sello.canonDe(v.r)], [v.canon, v.canon]);
    /* La firma que da el Apps Script real: ASCII-?. El .gs con su Utilities fiel, la reescritura por
       omisión (que es con lo que se firman los sellos nuevos), la misma con la opción explícita, y lo congelado. */
    eq('  firma y código como los da el Apps Script (ASCII-?): el .gs, la reescritura por omisión y con la opción, y lo congelado',
       [g.api.firmar(v.r, CLAVE_DEL_MAPA), await Sello.firmar(v.r, CLAVE_DEL_MAPA), await Sello.firmar(v.r, CLAVE_DEL_MAPA, { codificacion: 'ascii-?' }), Sello.codigoDe(v.firma)],
       [v.firma, v.firma, v.firma, v.codigo]);
    /* Lo que supuso el mapa 04: UTF-8. No es lo del Apps Script; es lo que da la opción 'utf-8'. */
    eq('  y con { codificacion: \'utf-8\' } da lo que supuso el mapa (UTF-8), que NO es lo del Apps Script salvo en V1',
       [await Sello.firmar(v.r, CLAVE_DEL_MAPA, { codificacion: 'utf-8' }), Sello.codigoDe(v.firmaUtf8)], [v.firmaUtf8, v.codigoUtf8]);
    const sellado = await Sello.sellar(v.r, CLAVE_DEL_MAPA);
    eq('  sellar() devuelve firma, código, formato y la codificación que hay que guardar: ASCII-?', [sellado.firma, sellado.codigo, sellado.formato, sellado.codificacion],
       [v.firma, v.codigo, v.r.renglones ? 'AL3D-AUTH-v2' : 'AL3D-AUTH-v1', 'ascii-?']);
    const fuerte = await Sello.sellar(v.r, CLAVE_DEL_MAPA, { codificacion: 'utf-8' });
    eq('  y con la opción UTF-8, la firma fuerte y su codificación', [fuerte.firma, fuerte.codigo, fuerte.codificacion], [v.firmaUtf8, v.codigoUtf8, 'utf-8']);
  }
  eq('solo V1 es igual con las dos codificaciones: es la única con todo en ASCII',
     VECTORES.map(v => v.firma === v.firmaUtf8), [true, false, false, false, false]);
  eq('los sellos nuevos se firman con ASCII-? y verificar() prueba primero ASCII-? y luego UTF-8',
     [Sello.CODIFICACION_DE_SELLOS_NUEVOS, [...Sello.CODIFICACIONES], Object.isFrozen(Sello.CODIFICACIONES)], ['ascii-?', ['ascii-?', 'utf-8'], true]);
  eq('la huella de las partidas del mapa sale como la del .gs y como la impresa', [g.api.cotHuella(true, PARTIDAS_TACOS), Sello.huellaDe(true, PARTIDAS_TACOS)], [HUELLA_TACOS, HUELLA_TACOS]);
  eq('  y con las partidas en otro orden, la misma (se ordena entera)', Sello.huellaDe(true, [PARTIDAS_TACOS[1], PARTIDAS_TACOS[0]]), HUELLA_TACOS);
  eq('  la de V1 y la de V5', [Sello.huellaDe(true, [{ id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, altura: 40, n: 8 }]),
     Sello.huellaDe(false, [{ id: 7, tipo: 'manual', pz: 2, pu: 1234.56 }])], [VECTORES[0].r.huella, VECTORES[4].r.huella]);
  /* Los vectores sueltos del mapa. */
  eq('itemsAuthCanon({10:5, 2:1500, 1:8500.005}) ordena como texto: «1», «10», «2»', [g.api.itemsAuthCanon({ 10: 5, 2: 1500, 1: 8500.005 }), Sello.itemsAuthCanon({ 10: 5, 2: 1500, 1: 8500.005 })],
     ['1:8500.00,10:5.00,2:1500.00', '1:8500.00,10:5.00,2:1500.00']);
  eq('normalizarCodigo("a1b2-c3d4 e5f6zz9") = A1B2C3D4E5F6', [g.api.normalizarCodigo('a1b2-c3d4 e5f6zz9'), Sello.normalizarCodigo('a1b2-c3d4 e5f6zz9')], ['A1B2C3D4E5F6', 'A1B2C3D4E5F6']);
  eq('Math.round(1.005 * 100) / 100 es 1: dinero2(1.005) es «1.00», no «1.01»', [g.api.dinero2(1.005), Sello.dinero2(1.005)], ['1.00', '1.00']);
  /* 1e21 NO da «1e+21»: el *100/100 de dinero2 lo deja un pelo por debajo, y toFixed solo pasa a
     notación exponencial desde 1e21 (el .gs real da lo mismo; lo comprueba el bloque 2). */
  eq('dinero2: 13119.6 → «13119.60»; 0, -0, null y NaN → «0.00»; 1e21 → «999999999999999868928.00» (el ruido del *100/100); 1e22 → «1e+22»',
     [13119.6, 0, -0, null, NaN, 1e21, 1e22].map(Sello.dinero2), ['13119.60', '0.00', '0.00', '0.00', '0.00', '999999999999999868928.00', '1e+22']);
  eq('  y el .gs, igual', [1e21, 1e22].map(g.api.dinero2), ['999999999999999868928.00', '1e+22']);
  eq('un código se imprime en tres grupos y se lee de vuelta a doce', [Sello.codigoDe('1031' + '54b355d4' + 'ffff'), Sello.normalizarCodigo('1031-54b3-55d4')], ['1031-54B3-55D4', '103154B355D4']);
  /* El gotcha de los bytes con signo (−128..127) de Apps Script: aHex() los sube con (b + 256) % 256. Con
     los 0..255 de WebCrypto da lo mismo. Sin esa corrección, un byte negativo saldría como «-1». */
  eq('aHex con bytes con signo (Apps Script) y sin signo (WebCrypto) da lo mismo', [Sello.aHex([-1, -128, 0, 15, 127]), Sello.aHex([255, 128, 0, 15, 127])], ['ff80000f7f', 'ff80000f7f']);
  eq('  y con un Int8Array, que es como se ven allá (nunca un «-»)', [Sello.aHex(Int8Array.from([-1, -128, -17, 0, 127])), /-/.test(Sello.aHex(Int8Array.from([-1, -128, -17, 0, 127])))], ['ff80ef007f', false]);
  eq('tsIso da los 24 caracteres de toISOString(), con milisegundos', Sello.tsIso(Date.UTC(2026, 9, 1, 4, 30, 15, 123)), '2026-10-01T04:30:15.123Z');
  g.e.clave = null;
}

/* ============================================================================
   2. LA PRUEBA DIFERENCIAL — el .gs real contra la reescritura (con ASCII-?, como el Apps Script de verdad)
   ============================================================================ */

console.log('\n2. LA PRUEBA DIFERENCIAL — el .gs real (cargado en vm) contra sello.js: mismos casos, mismo resultado');
const SEMILLA = 20261010;
console.log('  (semilla fija ' + SEMILLA + ': cualquier diferencia se repite)');
{
  const azar = mulberry32(SEMILLA);
  const elige = a => a[Math.floor(azar() * a.length)];
  const BASE = { folio: 'COT-0042-B@K7QM', huella: 'c|1:x', subCalc: 11310, precioAuth: 12500, itemsAuth: '2:1500.00', total: 12500,
    proyecto: 'Tacos El Güero', correo: 'elias@al3d.mx', ts: '2026-10-01T04:30:15.123Z', renglones: '[["a",1,2]]' };

  /* --- los casos: de borde, uno por uno, y al azar --- */
  const bordes = [...VECTORES.map(v => v.r)];
  const TEXTOS_DE_BORDE = ['', ' ', 'ñ', 'Ñandú', 'Güero', '«TACOS»', 'Letras 3D · 8 × 40 cm', '€', '😀', '👨‍👩‍👧‍👦', '🇲🇽', '𝒜', '𠜎', '～', '',
    '\ud83d', '\ude00', 'a\u0000b', ' ', ' ', '\n', '\r\n', '\t', '"', '\\', '|', "'", '=SUM(A1)', '﻿', '‮', 'é', 'é',
    'a'.repeat(300), 'COT-0042-B@K7QM', null, undefined, 0, false, [], {}];
  for (const c of ['folio', 'huella', 'itemsAuth', 'proyecto', 'correo', 'ts']) for (const v of TEXTOS_DE_BORDE) bordes.push({ ...BASE, [c]: v });
  /* Los renglones: lo falsy es v1 y lo truthy es v2, aunque sea un espacio, «0», «false» o un arreglo vacío. */
  for (const v of ['', null, undefined, 0, false, NaN, ' ', '0', 'false', [], [[1]], 5, '[]', '[["Letras «TACOS»",8,9600]]', '[["😀 \ud83d",1,2]]'].concat(TEXTOS_DE_BORDE)) bordes.push({ ...BASE, renglones: v });
  for (const c of ['subCalc', 'precioAuth', 'total']) for (const v of NUMEROS.concat(RAROS)) bordes.push({ ...BASE, [c]: v });
  bordes.push({ folio: '', huella: '', subCalc: null, precioAuth: undefined, itemsAuth: '', total: '', proyecto: '', correo: '', ts: '', renglones: '' });
  bordes.push({ folio: null, huella: null, subCalc: NaN, precioAuth: Infinity, itemsAuth: null, total: -Infinity, proyecto: null, correo: null, ts: null, renglones: null });
  bordes.push({});
  const aleatorios = [];
  for (let i = 0; i < 1500; i++) {
    const v2 = azar() < 0.7;
    aleatorios.push({
      folio: azar() < 0.8 ? 'COT-' + String(Math.floor(azar() * 10000)).padStart(4, '0') + (azar() < 0.7 ? '-' + elige(['A', 'B', 'K', 'Z']) : '') + '@' + cadena(azar, 4) : cadena(azar, 30),
      huella: cadena(azar, 80), subCalc: numero(azar), precioAuth: numero(azar),
      itemsAuth: azar() < 0.5 ? '' : (azar() < 0.5 ? Sello.itemsAuthCanon({ [Math.floor(azar() * 50)]: azar() * 1e4 }) : cadena(azar, 40)),
      total: numero(azar), proyecto: cadena(azar, 40), correo: azar() < 0.7 ? 'p' + i + '@al3d.mx' : cadena(azar, 20),
      ts: azar() < 0.8 ? new Date(Date.UTC(2026, 8, 25) + Math.floor(azar() * 3e9)).toISOString() : cadena(azar, 30),
      renglones: !v2 ? '' : (azar() < 0.7 ? j([[cadena(azar, 30), Math.floor(azar() * 20), Math.round(azar() * 1e7) / 100]]) : cadena(azar, 60) || 'x'),
    });
  }
  const todos = bordes.concat(aleatorios);
  eq('hay casos de sobra (se pidieron 300): ' + todos.length + ' (' + bordes.length + ' de borde y ' + aleatorios.length + ' al azar)', todos.length >= 300, true);

  /* Claves de todo tipo: la de uso real (tres UUID), cortas, largas, con acentos y con basura. */
  const CLAVES = [CLAVE_DEL_MAPA, CLAVE, 'a', 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(65), 'x'.repeat(300), 'clavé-ñ-falsa', 'clave con espacios al final  ',
    'clave\n', '\ud83d clave 😀', '8c0d1f0a-0000-4000-8000-000000000001' + '8c0d1f0a-0000-4000-8000-000000000002' + '8c0d1f0a-0000-4000-8000-000000000003'];

  /* A la reescritura se le pide de las dos maneras con las que se la llama: por omisión (así se firman
     los sellos nuevos) y con la opción explícita { codificacion: 'ascii-?' }. Las dos tienen que dar lo
     mismo que el .gs real, con su Utilities fiel a Apps Script (el bloque 5 lo comprueba contra los
     doce HMAC reales). Si la omisión fuera otra, aquí se caen los miles de casos de «firmar». */
  const gs = GS;
  const llave = i => CLAVES[i % CLAVES.length];
  for (const [via, opciones] of [['por omisión', undefined], ['con { codificacion: \'ascii-?\' }', { codificacion: 'ascii-?' }]]) {
    console.log('  -- la reescritura ' + via);
    let i = 0;
    await comparar('canonDe (' + via + ')', todos, async r => [gs.api.canonDe(r), Sello.canonDe(r)]);
    i = 0;
    await comparar('firmar ' + via, todos, async r => {
      const clave = llave(i++);
      return [gs.api.firmar(r, clave), await Sello.firmar(r, clave, opciones)];
    });
    i = 0;
    await comparar('código impreso (primeros 12 en tres grupos) ' + via, todos, async r => {
      const clave = llave(i++);
      const fg = gs.api.firmar(r, clave), fn = await Sello.firmar(r, clave, opciones);
      return [gs.api.codigoDe(fg), Sello.codigoDe(fn)];
    });
  }

  /* La opción 'utf-8' NO es lo que hace el Apps Script, así que su referencia no puede ser el .gs: es
     node:crypto con Buffer, que codifica en UTF-8 por su cuenta (un sustituto suelto, como TextEncoder,
     queda en U+FFFD) y no comparte nada con el WebCrypto de la reescritura. Se cuentan aparte. */
  {
    const utf8 = (t, k) => createHmac('sha256', Buffer.from(k, 'utf8')).update(Buffer.from(t, 'utf8')).digest('hex');
    console.log('  -- la opción { codificacion: \'utf-8\' }, contra node:crypto (el Apps Script real no es UTF-8)');
    let i = 0;
    await comparar('firmar con { codificacion: \'utf-8\' }', todos, async r => {
      const clave = llave(i++);
      return [utf8(Sello.canonDe(r), clave), await Sello.firmar(r, clave, { codificacion: 'utf-8' })];
    }, 'node:crypto (UTF-8)');
    i = 0;
    await comparar('código impreso con { codificacion: \'utf-8\' }', todos, async r => {
      const clave = llave(i++);
      return [Sello.codigoDe(utf8(Sello.canonDe(r), clave)), Sello.codigoDe(await Sello.firmar(r, clave, { codificacion: 'utf-8' }))];
    }, 'node:crypto (UTF-8)');
  }

  /* --- las piezas sueltas, cada una contra la suya del .gs --- */
  const u = GS.api;
  await comparar('dinero2', NUMEROS.concat(RAROS, Array.from({ length: 600 }, () => numero(azar))), async n => [u.dinero2(n), Sello.dinero2(n)]);

  const ids = ['1', '2', '10', '9', '100', 'a', 'B', 'z9', '～', '😀', '', '\ud83d', 'é', 'é', '', '__proto__', 'a:b', 'ñ'];
  const mapasIA = Array.from({ length: 500 }, () => {
    const o = {};
    for (let k = Math.floor(azar() * 6); k > 0; k--) o[elige(ids)] = numero(azar);
    return o;
  });
  mapasIA.push(null, undefined, {}, { '～': 1, '😀': 2 }, { 10: 5, 2: 1500, 1: 8500.005 });
  await comparar('itemsAuthCanon (ids con emojis y astrales que cambian el orden UTF-16)', mapasIA, async m => [u.itemsAuthCanon(m), Sello.itemsAuthCanon(m)]);
  eq('  el orden es el UTF-16 y no el de puntos de código: el emoji va antes que \\uFF5E', Sello.itemsAuthCanon({ '～': 1, '😀': 2 }), '😀:2.00,～:1.00');
  eq('  y «1», «10», «2» se ordenan como texto', Sello.itemsAuthCanon({ 2: 1, 10: 1, 1: 1 }), '1:1.00,10:1.00,2:1.00');

  const textosCanon = mapasIA.map(m => Sello.itemsAuthCanon(m)).concat(Array.from({ length: 500 }, () => cadena(azar, 40)),
    ['', null, undefined, ':', ',', ',,', 'a:1,b:2', ':5', 'a:', 'a:b:1', 'a,b:1', '1:1.00,10:5.00']);
  await comparar('itemsAuthDeCanon', textosCanon, async s => [j(u.itemsAuthDeCanon(s)), j(Sello.itemsAuthDeCanon(s))]);

  const ITEM_IDS = [1, 2, 3, 10, 9, 100, 'a', 'B', '～', '😀', '', 'é', '', '7', 7];
  const CAMPOS_VALORES = [undefined, null, true, false, 0, -0, 1, 40, 8, 0.1 + 0.2, 1e21, 1e-7, NaN, '', 'letras', 'al-paint', 'recta', 'a~b', 'a,b', '😀', 'ñ', ' ', 'sandwich'];
  const partidas = Array.from({ length: 600 }, () => Array.from({ length: 1 + Math.floor(azar() * 6) }, () => {
    const it = { id: elige(ITEM_IDS), desc: cadena(azar, 10) };
    for (const c of Sello.CAMPOS_PRECIO) if (azar() < 0.6) it[c] = elige(CAMPOS_VALORES);
    return it;
  }));
  partidas.push([], [PARTIDAS_TACOS[1], PARTIDAS_TACOS[0]], PARTIDAS_TACOS);
  let k = 0;
  await comparar('huellaDe contra cotHuella (partidas desordenadas, campos null, undefined, 1e21, «~» y «,» dentro)', partidas, async items => {
    const iva = (k++ % 2) === 0;
    return [u.cotHuella(iva, items), Sello.huellaDe(iva, items)];
  });

  const codigos = Array.from({ length: 600 }, () => cadena(azar, 30)).concat(['a1b2-c3d4 e5f6zz9', 'ﬀﬀﬀﬀﬀﬀ', 'ﬀ', 'ﬃ', 'ı', 'İ', 'ǆ', 'ß', 'ABCDEFABCDEFABCD', '', null, undefined, 0, 12345, ['1031-54b3-55d4'], '103154B355D4'.toLowerCase()]);
  await comparar('normalizarCodigo (incluye la ligadura «ﬀ», que al pasar a mayúsculas son dos F)', codigos, async c => [u.normalizarCodigo(c), Sello.normalizarCodigo(c)]);
  eq('  la ligadura «ﬀ» cuenta como «FF»: está en el .gs y se queda (inofensivo: sigue haciendo falta el código completo)', Sello.normalizarCodigo('ﬀ'), 'FF');

  const folios = Array.from({ length: 800 }, () => (azar() < 0.5 ? 'COT-' + String(Math.floor(azar() * 9999)).padStart(4, '0') + (azar() < 0.6 ? '@' + cadena(azar, 5) : '') : cadena(azar, 30)))
    .concat(['COT-0042', 'COT-0042@K7QM', 'COT-0042-B@K7QM', 'COT-0042@', '@K7QM', 'COT-0042@a@b', 'COT 0042', "COT-0042'", '', 'a'.repeat(24), 'a'.repeat(25), 'a'.repeat(24) + '@' + 'b'.repeat(24), 'a'.repeat(24) + '@' + 'b'.repeat(25),
      'COT-0042\n', ' COT-0042', 'cot-0042', 'COT_0042', 'COT-0042@K_7-Q', null, undefined, 42, ['COT-1'], {}]);
  await comparar('folioDePapel contra folioDePapel_ (la regla de /verificar)', folios, async f => [String(u.folioDePapel_(f)), String(Ver.folioDePapel(f))]);
  await comparar('folioCorto contra folioCorto_', folios, async f => [u.folioCorto_(f), Ver.folioCorto(f)]);

  const textosRenglones = Array.from({ length: 400 }, () => cadena(azar, 40))
    .concat(['', null, undefined, '[]', '{}', 'null', '5', '"x"', '[1]', '[null]', '[["a"]]', '[["a",1]]', '[["a",1,2]]', '[["a","b","c"]]', '[[null,null,null]]', '[["Letras «TACOS»",8,9600],["Bastidor",1,1710]]',
      '[["x",1,2],', '[["😀",1e21,-0]]', '[[0,0,0]]', '[["a",1.5,"2.5"]]', '[{"0":"a"}]', '[[]]', '[ ]', ' ', 0, false, [], '[["a",1,2]]'.repeat(2)]);
  await comparar('renglonesDeTexto', textosRenglones, async s => [j(u.renglonesDeTexto(s)), j(Ver.renglonesDeTexto(s))]);

  /* Los registros de la base: la misma firma que la fila de la hoja de donde salen. */
  await comparar('registroDeFila (de la fila de la base) da el mismo registro que el del .gs', aleatorios.slice(0, 300).filter(r => typeof r.subCalc === 'number' && Number.isFinite(r.subCalc)
    && typeof r.precioAuth === 'number' && Number.isFinite(r.precioAuth) && typeof r.total === 'number' && Number.isFinite(r.total)), async r => {
    const v = new Array(17).fill('');
    v[0] = r.ts; v[1] = r.folio; v[2] = r.proyecto; v[4] = r.subCalc; v[5] = r.precioAuth; v[6] = r.total; v[8] = r.itemsAuth; v[9] = r.huella; v[10] = r.correo; v[16] = r.renglones;
    return [j(u.registroDeFila(v)), j(Sello.registroDeFila(aFilaBD(v)))];
  });
}

/* ============================================================================
   3. LA VERIFICACIÓN — sellos buenos, alterados en cada campo, de otra clave, truncados, con espacios
   ============================================================================ */

console.log('\n3. LA VERIFICACIÓN — lo que /verificar recalcula desde el renglón guardado');
let idFila = 0;
/* Una fila de la base, firmada por la reescritura con la codificación que se pida; por omisión la de
   los sellos nuevos (ASCII-?, como el Apps Script). La fila NO trae su columna `codificacion`, como
   las heredadas de la hoja: quien quiera una que la traiga la pasa en `extra`. */
async function filaFirmada(r, clave = CLAVE, codificacion = Sello.CODIFICACION_DE_SELLOS_NUEVOS, extra = {}) {
  const s = await Sello.sellar(r, clave, { codificacion });
  return { id: ++idFila, ts_iso: r.ts, folio_global: r.folio, proyecto: r.proyecto, cliente: 'CLIENTE-PRIVADO', sub_calc: r.subCalc,
    precio_auth: r.precioAuth, total: r.total, ajuste_pct: 7.7, items_auth: r.itemsAuth, huella: r.huella, autorizo: r.correo,
    solicito: 'SOLICITANTE-PRIVADO', codigo: s.codigo, firma: s.firma, estado: 'vigente', nota: 'NOTA-PRIVADA', renglones: r.renglones, ...extra };
}
const R_V2 = { ...BASE_TACOS, precioAuth: 12500, total: 12500 };
const R_V1 = { ...VECTORES[0].r };
{
  const v = (f, clave = CLAVE, op) => Sello.verificar(f, clave, op);
  for (const [nombre, r] of [['v2 con renglones y texto no ASCII', R_V2], ['v1 sin renglones, todo ASCII', R_V1]]) {
    const f = await filaFirmada(r);
    const ok = await v(f);
    eq('sello bueno (' + nombre + '): valida', [ok.valida, ok.motivo, ok.formato], [true, 'ok', r.renglones ? 'AL3D-AUTH-v2' : 'AL3D-AUTH-v1']);
    eq('  dice con qué codificación cuadró: la de los sellos nuevos (ASCII-?); en un v1 todo ASCII las dos dan lo mismo', ok.codificacion, r.renglones ? 'ascii-?' : 'ascii');
    cierto('  y nunca devuelve la firma recalculada (quien la tuviera podría falsificar esa fila)', !JSON.stringify(ok).includes(f.firma) && !('firma' in ok));
  }
  {
    /* Las filas heredadas de la hoja no traen su codificación: se prueban ASCII-? primero y UTF-8 después. */
    const fa = await filaFirmada(R_V2, CLAVE, 'ascii-?');
    const ok = await v(fa);
    eq('un sello firmado como el Apps Script real (ASCII-?) valida, y lo dice', [ok.valida, ok.codificacion], [true, 'ascii-?']);
    const soloUtf8 = await v(fa, CLAVE, { codificaciones: ['utf-8'] });
    eq('  y con solo UTF-8 permitido NO valida: la opción existe y manda cuando la fila no trae su codificación', [soloUtf8.valida, soloUtf8.motivo], [false, 'firma_no_coincide']);
    const fu = await filaFirmada(R_V2, CLAVE, 'utf-8');
    const okU = await v(fu);
    eq('un sello firmado con UTF-8 (la opción fuerte, que no es la del Apps Script) también valida: se prueba después, y lo dice', [okU.valida, okU.codificacion], [true, 'utf-8']);
    eq('  y con solo ASCII-? permitido NO valida', (await v(fu, CLAVE, { codificaciones: ['ascii-?'] })).valida, false);
  }

  /* LA CODIFICACIÓN PROPIA DE LA FILA (decisión C-13): si la trae (columna opcional `codificacion`), se
     prueba SOLO esa; si no, primero ASCII-? y después UTF-8. Qué se probó y en qué orden solo lo deja ver
     un espía sobre crypto.subtle.sign: con un texto no ASCII, de las dos codificaciones a lo sumo una
     puede coincidir, así que el resultado no distingue «la probó primero» de «la probó después». */
  {
    const fa = await filaFirmada(R_V2, CLAVE, 'ascii-?'), fu = await filaFirmada(R_V2, CLAVE, 'utf-8');
    const f1 = await filaFirmada(R_V1);                          // todo ASCII: las dos codificaciones dan lo mismo
    const propia = (f, c) => ({ ...f, codificacion: c });
    const canon = f => Sello.canonDe(Sello.registroDeFila(f));
    const bytesDe = (f, cod) => j([...Sello.aBytes(canon(f), cod)]);
    const espiar = async fn => {
      const subtle = globalThis.crypto.subtle, llamadas = [], original = subtle.sign;
      Object.defineProperty(subtle, 'sign', { configurable: true, writable: true,
        value(algoritmo, llave, datos) { llamadas.push(j([...new Uint8Array(datos)])); return original.call(this, algoritmo, llave, datos); } });
      try { await fn(); } finally { delete subtle.sign; }
      return llamadas;
    };
    /* Devuelve [veredicto, con cuáles codificaciones se calculó el HMAC, en orden]. */
    const probar = async (f, op) => {
      let r;
      const llamadas = await espiar(async () => { r = await v(f, CLAVE, op); });
      return [r, llamadas.map(b => (b === bytesDe(f, 'ascii-?') ? (b === bytesDe(f, 'utf-8') ? 'ambas' : 'ascii-?') : (b === bytesDe(f, 'utf-8') ? 'utf-8' : 'otra')))];
    };
    const resumen = ([r, intentos]) => [r.valida, r.codificacion, intentos];

    eq('sin codificación propia, una fila de ASCII-? valida al primer intento (solo se calcula el de ASCII-?)', resumen(await probar(fa)), [true, 'ascii-?', ['ascii-?']]);
    eq('  una de UTF-8 valida al segundo: primero se probó ASCII-?, luego UTF-8', resumen(await probar(fu)), [true, 'utf-8', ['ascii-?', 'utf-8']]);
    eq('  una que no cuadra con ninguna prueba las dos, en ese orden', resumen(await probar({ ...fa, firma: '0'.repeat(64) })), [false, null, ['ascii-?', 'utf-8']]);
    eq('  vacía o null es «no la trae»: lo mismo que sin ella', [await probar(propia(fu, '')), await probar(propia(fu, null)), await probar(propia(fu, undefined))].map(resumen),
       [[true, 'utf-8', ['ascii-?', 'utf-8']], [true, 'utf-8', ['ascii-?', 'utf-8']], [true, 'utf-8', ['ascii-?', 'utf-8']]]);
    eq('  y todo ASCII, con una sola pasada (las dos codificaciones dan los mismos bytes), y dice «ascii»', resumen(await probar(f1)), [true, 'ascii', ['ambas']]);
    eq('  y una todo ASCII que no cuadra también se calcula una sola vez, no dos', resumen(await probar({ ...f1, total: 1 })), [false, null, ['ambas']]);

    eq('con «ascii-?» propia, SOLO se calcula ASCII-?: una fila de ASCII-? valida', resumen(await probar(propia(fa, 'ascii-?'))), [true, 'ascii-?', ['ascii-?']]);
    eq('  con «utf-8» propia, SOLO UTF-8: una fila de UTF-8 valida', resumen(await probar(propia(fu, 'utf-8'))), [true, 'utf-8', ['utf-8']]);
    eq('  si dice «utf-8» y se firmó con ASCII-?: NO valida, y no se prueba la otra', resumen(await probar(propia(fa, 'utf-8'))), [false, null, ['utf-8']]);
    eq('  si dice «ascii-?» y se firmó con UTF-8: NO valida, y no se prueba la otra', resumen(await probar(propia(fu, 'ascii-?'))), [false, null, ['ascii-?']]);
    eq('  su codificación manda sobre `opciones.codificaciones` (que solo cuenta sin ella)',
       [resumen(await probar(propia(fa, 'ascii-?'), { codificaciones: ['utf-8'] })), resumen(await probar(propia(fu, 'utf-8'), { codificaciones: ['ascii-?'] }))],
       [[true, 'ascii-?', ['ascii-?']], [true, 'utf-8', ['utf-8']]]);
    eq('  y con todo ASCII, dice con cuál cuadró la de la fila (no «ascii»): una sola pasada', [resumen(await probar(propia(f1, 'utf-8'))), resumen(await probar(propia(f1, 'ascii-?')))],
       [[true, 'utf-8', ['ambas']], [true, 'ascii-?', ['ambas']]]);
    eq('  el motivo de una que no cuadra con su propia codificación es firma_no_coincide', (await v(propia(fa, 'utf-8'))).motivo, 'firma_no_coincide');
    eq('  y su código guardado sigue contando: con la firma buena y otro código, codigo_no_coincide', (await v(propia({ ...fa, codigo: '0000-0000-0000' }, 'ascii-?'))).motivo, 'codigo_no_coincide');

    eq('codificacionDeFila: lo que no trae es null; lo que trae, tal cual', [{}, { codificacion: undefined }, { codificacion: null }, { codificacion: '' }, { codificacion: 'utf-8' }, { codificacion: 'ascii-?' }].map(Sello.codificacionDeFila),
       [null, null, null, null, 'utf-8', 'ascii-?']);
    for (const [nombre, c] of [['«latin1»', 'latin1'], ['«UTF-8» en mayúsculas', 'UTF-8'], ['« utf-8» con un espacio', ' utf-8'], ['«ascii»', 'ascii'], ['un número', 5], ['un objeto', {}], ['un arreglo', ['utf-8']], ['true', true]]) {
      await lanza('una codificación propia que no existe (' + nombre + ') lanza TIPO_INVALIDO: una fila mal guardada no se contesta «falso»', () => v(propia(fa, c)), 'TIPO_INVALIDO');
    }
    eq('  y no se calcula ningún HMAC con una fila así', (await espiar(async () => { try { await v(propia(fa, 'latin1')); } catch (_) { /* esperado */ } })).length, 0);

    /* Lo que hay que guardar junto al registro es lo que verificar() usa luego. */
    for (const cod of Sello.CODIFICACIONES) {
      const s = await Sello.sellar(R_V2, CLAVE, { codificacion: cod });
      const fila = await filaFirmada(R_V2, CLAVE, cod, { codificacion: s.codificacion, codigo: s.codigo, firma: s.firma });
      eq('sellar() devuelve la codificación que se guarda, y la fila guardada con ella valida: ' + cod, [s.codificacion, resumen(await probar(fila))], [cod, [true, cod, [cod]]]);
    }
  }

  /* Alterado en cada campo que se firma: cada alteración tiene que invalidar. */
  const ALTERACIONES = [
    ['folio_global', f => f.folio_global.replace('K7QM', 'K7QN')],
    ['huella', f => f.huella + 'x'],
    ['sub_calc', f => f.sub_calc + 0.01],
    ['precio_auth', f => f.precio_auth + 0.01],
    ['items_auth', () => '2:1500.00'],
    ['total', f => f.total + 0.01],
    ['proyecto', f => f.proyecto + ' '],
    ['autorizo', () => 'otro@al3d.mx'],
    ['ts_iso', () => '2026-10-01T04:30:15.124Z'],
    ['renglones', f => f.renglones.replace('9600', '9601')],
  ];
  for (const cod of Sello.CODIFICACIONES) {
    const f0 = await filaFirmada(R_V2, CLAVE, cod);
    const bad = [];
    for (const [campo, cambia] of ALTERACIONES) {
      const r = await v({ ...f0, [campo]: cambia(f0) });
      if (r.valida) bad.push(campo);
    }
    eq('alterar CADA campo firmado invalida (firma en ' + cod + '): ' + ALTERACIONES.map(a => a[0]).join(', '), bad, []);
  }
  {
    const f0 = await filaFirmada(R_V2);
    eq('quitarle los renglones a un v2 lo comprueba como v1 y falla: no se puede «borrar» lo que el sello garantiza', (await v({ ...f0, renglones: '' })).valida, false);
    eq('  igual con null', (await v({ ...f0, renglones: null })).valida, false);
    const f1 = await filaFirmada(R_V1);
    eq('y ponerle renglones a un v1 lo comprueba como v2 y falla', (await v({ ...f1, renglones: '[["x",1,1]]' })).valida, false);
    eq('un v1 con renglones null o vacío valida igual (así se guardan los sellos de antes)', [(await v({ ...f1, renglones: null })).valida, (await v({ ...f1, renglones: '' })).valida], [true, true]);
    eq('dos importes intercambiados con el mismo total: falla', (await v({ ...f0, renglones: '[["Letras «TACOS»",8,1710],["Bastidor",1,9600]]' })).valida, false);
    eq('un cero de más en un importe: falla', (await v({ ...f0, total: 125000 })).valida, false);
    eq('el mismo negocio con otra capitalización: falla', (await v({ ...f0, proyecto: f0.proyecto.toUpperCase() })).valida, false);
    eq('el mismo folio con otra capitalización: falla', (await v({ ...f0, folio_global: f0.folio_global.toLowerCase() })).valida, false);
    eq('un decimal de ruido en un importe que se redondea al mismo centavo: valida (dinero2 lo absorbe)', (await v({ ...f0, total: 12500.0000001 })).valida, true);

    /* Lo que NO se firma. Cambiarlo no rompe la firma: lo cuidan los permisos de la tabla, no este módulo. */
    for (const [c, nuevo] of [['cliente', 'Otro Cliente'], ['nota', 'otra nota'], ['ajuste_pct', 99], ['solicito', 'alguien'], ['estado', 'revocada'], ['id', 999]]) {
      eq('«' + c + '» NO está firmado: cambiarlo no invalida (lo defienden RLS y las funciones de revocar)', (await v({ ...f0, [c]: nuevo })).valida, true);
    }

    /* De otra clave, con la clave tocada, y la propia. */
    eq('firmado con otra clave: falla', (await v(f0, CLAVE + 'x')).valida, false);
    eq('la clave con un espacio al final es otra clave: se usa byte a byte, sin trim', (await v(f0, CLAVE + ' ')).valida, false);
    eq('  y con un salto de línea', (await v(f0, CLAVE + '\n')).valida, false);
    eq('  y la clave en mayúsculas', (await v(f0, CLAVE.toUpperCase())).valida, false);
    const conEspacio = await filaFirmada(R_V2, CLAVE + '\n');
    eq('una fila firmada con un salto de línea al final de la clave valida SOLO con esa clave exacta', [(await v(conEspacio, CLAVE + '\n')).valida, (await v(conEspacio, CLAVE)).valida], [true, false]);

    /* La firma truncada, con espacios, en mayúsculas, con un carácter cambiado. */
    const flip = s => s.slice(0, -1) + (s.slice(-1) === '0' ? '1' : '0');
    const MALAS = [['truncada a 63', f0.firma.slice(0, 63)], ['truncada a 32', f0.firma.slice(0, 32)], ['solo el código', f0.firma.slice(0, 12)], ['vacía', ''], ['null', null],
      ['con un espacio al final', f0.firma + ' '], ['con un espacio al principio', ' ' + f0.firma], ['con un salto de línea', f0.firma + '\n'], ['en mayúsculas', f0.firma.toUpperCase()],
      ['con el último carácter cambiado', flip(f0.firma)], ['con el primero cambiado', (f0.firma[0] === '0' ? '1' : '0') + f0.firma.slice(1)], ['con 65 caracteres', f0.firma + '0'],
      ['con un espacio en medio', f0.firma.slice(0, 20) + ' ' + f0.firma.slice(20)]];
    const pasaron = [];
    for (const [nombre2, firma] of MALAS) if ((await v({ ...f0, firma })).valida) pasaron.push(nombre2);
    eq('la firma guardada truncada, con espacios, en mayúsculas o con un carácter cambiado NO valida: ' + MALAS.length + ' variantes', pasaron, []);
    eq('  (la mayúscula es estricta a propósito: el .gs compara con !== y guarda la firma en minúsculas)', (await v({ ...f0, firma: f0.firma.toUpperCase() })).motivo, 'firma_no_coincide');

    /* El código guardado. */
    eq('el código guardado de otra fila: falla, y dice que es el código', (await v({ ...f0, codigo: '0000-0000-0000' })).motivo, 'codigo_no_coincide');
    /* El código guardado se normaliza antes de compararse, como en el .gs: la hoja lo guardaba con
       guiones, pero quien lo importe puede traerlo de otra forma y sigue siendo el mismo código. */
    for (const c of [f0.codigo.toLowerCase(), f0.codigo.replace(/-/g, ''), f0.codigo.replace(/-/g, ' '), ' ' + f0.codigo + ' ']) {
      eq('el código guardado como «' + c + '» valida (se normaliza, como en el .gs)', (await v({ ...f0, codigo: c })).valida, true);
    }
    eq('el código guardado truncado o vacío: falla', [(await v({ ...f0, codigo: f0.codigo.slice(0, 9) })).valida, (await v({ ...f0, codigo: '' })).valida, (await v({ ...f0, codigo: null })).valida], [false, false, false]);

    /* La debilidad de ASCII-?: un carácter no ASCII es indistinguible de otro. Es la de todos los
       sellos ya impresos y, mientras los nuevos se firmen igual (para que el verificador viejo del Apps
       Script los acepte si hay que retroceder), también la de los nuevos. Solo los firmados con UTF-8
       (la opción { codificacion: 'utf-8' }) la detectan. */
    const fh = await filaFirmada(R_V2);                      // ASCII-?: como el Apps Script y como los sellos nuevos
    const fn = await filaFirmada(R_V2, CLAVE, 'utf-8');      // la opción fuerte
    eq('DEBILIDAD HEREDADA (y de los sellos nuevos, por decisión): con ASCII-? cambiar «ü» por «ä» en el negocio NO invalida el sello', (await v({ ...fh, proyecto: 'Tacos El Gäero' })).valida, true);
    eq('  un sello firmado con UTF-8 sí lo detecta: la salida para cuando ya no haya que retroceder al Apps Script', (await v({ ...fn, proyecto: 'Tacos El Gäero' })).valida, false);
    eq('  igual si la fila declara su codificación: «ascii-?» no lo detecta y «utf-8» sí',
       [(await v({ ...fh, codificacion: 'ascii-?', proyecto: 'Tacos El Gäero' })).valida, (await v({ ...fn, codificacion: 'utf-8', proyecto: 'Tacos El Gäero' })).valida], [true, false]);
    eq('  pero cambiar un carácter ASCII o añadir uno invalida a los dos',
       [(await v({ ...fh, proyecto: 'Tacos El Gcero' })).valida, (await v({ ...fh, proyecto: 'Tacos El Güero.' })).valida,
        (await v({ ...fn, proyecto: 'Tacos El Gcero' })).valida, (await v({ ...fn, proyecto: 'Tacos El Güero.' })).valida], [false, false, false, false]);
  }

  /* Lo que no es un veredicto sino un error de quien llama: se lanza, no se contesta «falso». */
  {
    const f0 = await filaFirmada(R_V2);
    for (const [nombre, c] of [['undefined', undefined], ['null', null], ['vacía', ''], ['de puros espacios', '   \n'], ['la palabra «undefined»', 'undefined'], ['la palabra «null»', 'null'], ['un número', 12345],
      ['un Uint8Array', new Uint8Array([1, 2, 3])], ['un objeto', {}]]) {
      await lanza('verificar sin clave (' + nombre + ') lanza CLAVE_AUSENTE: nunca contesta «falso»', () => Sello.verificar(f0, c), 'CLAVE_AUSENTE');
    }
    await lanza('firmar sin clave lanza CLAVE_AUSENTE (el .gs inventaba una nueva y firmaba TODO con ella)', () => Sello.firmar(R_V2, undefined), 'CLAVE_AUSENTE');
    await lanza('sellar sin clave también', () => Sello.sellar(R_V2, ''), 'CLAVE_AUSENTE');
    eq('el .gs, sin la propiedad del sello y pidiéndola con crear=true, INVENTA una clave nueva (por eso no se porta)',
       (() => { const g = gsDe(); const antes = g.e.clave; const s = g.api.secretoDelSello_(true); return [antes, s.length > 30, g.e.clave === s]; })(), [null, true, true]);

    const COLUMNAS = Sello.COLUMNAS_DE_AUTORIZACION;
    eq('son trece las columnas que una fila tiene que traer', COLUMNAS.length, 13);
    for (const c of COLUMNAS) {
      const incompleta = { ...f0 }; delete incompleta[c];
      await lanza('a la fila le falta «' + c + '»: lanza COLUMNA_AUSENTE (una consulta mal hecha no es un sello falso)', () => Sello.verificar(incompleta, CLAVE), 'COLUMNA_AUSENTE');
    }
    await lanza('«renglones» ya parseado (un jsonb) no se acepta: se firmaría otro texto', () => Sello.verificar({ ...f0, renglones: [['x', 1, 2]] }, CLAVE), 'TIPO_INVALIDO');
    await lanza('«ts_iso» como Date (un timestamptz) tampoco', () => Sello.verificar({ ...f0, ts_iso: new Date(f0.ts_iso) }, CLAVE), 'TIPO_INVALIDO');
    await lanza('«huella» como número tampoco', () => Sello.verificar({ ...f0, huella: 5 }, CLAVE), 'TIPO_INVALIDO');
    await lanza('un importe que no es número tampoco', () => Sello.verificar({ ...f0, total: 'doce mil' }, CLAVE), 'TIPO_INVALIDO');
    await lanza('ni la fila como cadena', () => Sello.verificar('no soy una fila', CLAVE), 'FILA_INVALIDA');
    eq('los importes pueden llegar como texto numérico («12500.00»), como los entregan algunos controladores',
       (await Sello.verificar({ ...f0, sub_calc: '11310.00', precio_auth: '12500.00', total: '12500.00' }, CLAVE)).valida, true);
    eq('y un null de la base es lo que en la hoja es una celda vacía', (await Sello.verificar(await filaFirmada({ ...R_V1, itemsAuth: '' }, CLAVE, undefined, { items_auth: null, renglones: null }), CLAVE)).valida, true);
    await lanza('una codificación que no existe lanza', () => Sello.verificar(f0, CLAVE, { codificaciones: ['latin1'] }), 'CODIFICACION_DESCONOCIDA');
  }

  /* sellar(): se niega a firmar lo que no es lo que se va a firmar. */
  {
    const malos = [['folio sin aparato', { folio: 'COT-0042-B' }], ['hora que no es toISOString()', { ts: '2026-10-01 04:30:15' }], ['hora sin milisegundos', { ts: '2026-10-01T04:30:15Z' }],
      ['importe como texto', { total: '12500' }], ['importe NaN', { total: NaN }], ['importe infinito', { subCalc: Infinity }], ['renglones como arreglo', { renglones: [['x', 1, 2]] }],
      ['huella nula', { huella: null }], ['negocio indefinido', { proyecto: undefined }], ['sin correo', { correo: '  ' }]];
    for (const [nombre, cambio] of malos) await lanza('sellar se niega: ' + nombre, () => Sello.sellar({ ...R_V2, ...cambio }, CLAVE), 'REGISTRO_INVALIDO');
    /* Lo firmado tiene que ser lo guardado: Postgres no guarda un NUL ni la mitad de un emoji. */
    for (const [nombre, cambio] of [['un NUL en el negocio', { proyecto: 'a\u0000b' }], ['un sustituto alto suelto (emoji cortado a la mitad)', { proyecto: 'x'.repeat(139) + '\ud83d' }],
      ['un sustituto bajo suelto', { proyecto: 'x\ude00' }], ['dos sustitutos altos seguidos', { proyecto: '\ud83d😀' }], ['un sustituto suelto en los renglones', { renglones: '[["\ud83d",1,2]]' }]]) {
      await lanza('sellar se niega: ' + nombre + ' (se firmaría una cosa y se guardaría otra)', () => Sello.sellar({ ...R_V2, ...cambio }, CLAVE), 'REGISTRO_INVALIDO');
    }
    eq('  un emoji COMPLETO sí se firma, y un negocio de 140 puntos de código cortado por puntos de código (no por unidades) también',
       await (async () => {
         const entero = await Sello.sellar({ ...R_V2, proyecto: 'Tacos 😀 👨‍👩‍👧 🇲🇽 𝒜 𠜎' }, CLAVE);
         const cortado = await Sello.sellar({ ...R_V2, proyecto: [...('x'.repeat(139) + '😀😀')].slice(0, 140).join('') }, CLAVE);
         return [entero.firma.length, cortado.firma.length];
       })(), [64, 64]);
    eq('  y verificar NO se mete en eso: lo heredado se comprueba con lo que traiga', (await Sello.verificar({ ...(await filaFirmada(R_V2)), proyecto: 'x\ud83d' }, CLAVE)).valida, false);
    await lanza('sellar se niega sin registro', () => Sello.sellar(null, CLAVE), 'REGISTRO_INVALIDO');
    await lanza('y aBytes con una codificación inventada', async () => Sello.aBytes('x', 'latin1'), 'CODIFICACION_DESCONOCIDA');
    await lanza('tsIso con algo que no es una hora', async () => Sello.tsIso('mañana'), 'TS_INVALIDO');
  }

  /* La comparación en tiempo constante. Del tiempo no se puede dar fe desde un script de node; sí
     de que da bien las cuentas y de que su forma no tiene salida temprana. */
  {
    eq('iguales: lo igual, lo distinto en cada posición, el largo distinto, lo vacío y Unicode',
       [['a', 'a'], ['', ''], ['abc', 'abd'], ['abc', 'xbc'], ['abc', 'abcd'], ['abcd', 'abc'], ['', 'a'], ['😀', '😀'], ['😀', '😁'], ['ñ', 'n'], [12, '12'], [null, 'null']].map(([a, b]) => Sello.iguales(a, b)),
       [true, true, false, false, false, false, false, true, false, false, true, true]);
    const fuente = readFileSync(join(RAIZ, 'supabase', 'functions', '_shared', 'sello.js'), 'utf8');
    const cuerpo = /export function iguales\(a, b\) \{([\s\S]*?)\n\}/.exec(fuente)[1].replace(/\/\*[\s\S]*?\*\//g, '');
    eq('su cuerpo recorre siempre el texto más largo entero: un solo return y ningún break ni salida a media vuelta', [(cuerpo.match(/\breturn\b/g) || []).length, /\bbreak\b/.test(cuerpo)], [1, false]);
    cierto('y la verificación compara la firma y el código con él, no con ===', /iguales\(f, guardada\)/.test(fuente) && /iguales\(normalizarCodigo\(codigoDe\(f\)\), codigoGuardado\)/.test(fuente));
  }

  /* --- La ruta entera contra la del .gs: filas firmadas POR EL .gs, preguntas a las dos --- */
  console.log('  -- /verificar entero contra rutaVerificar_ del .gs (filas firmadas por el .gs real, con ASCII-?; dos tandas, cada una con su semilla)');
  for (const tanda of [1, 2]) {
    const gs = GS, azar = mulberry32(SEMILLA + tanda);
    const elige = a => a[Math.floor(azar() * a.length)];
    gs.e.clave = CLAVE; gs.e.cacheActiva = false; gs.e.hoja = true;
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const filas = Array.from({ length: 60 }, (_, i) => {
      const items = [{ id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, altura: 40, n: 8, desc: cadena(azar, 15) }];
      const iva = azar() < 0.8;
      return filaHoja(gs, {
        folio: 'COT-' + String(1 + Math.floor(azar() * 9000)).padStart(4, '0') + (azar() < 0.7 ? '-' + elige(['A', 'B', 'K']) : '') + '@' + Array.from({ length: 4 }, () => elige(letras.split(''))).join(''),
        huella: Sello.huellaDe(iva, items), subCalc: Math.round(azar() * 1e6) / 100, precioAuth: azar() < 0.5 ? 0 : Math.round(azar() * 2e6) / 100,
        itemsAuth: azar() < 0.7 ? '' : '1:' + Sello.dinero2(azar() * 1e4), total: Math.round(azar() * 2e6) / 100,
        proyecto: cadena(azar, 14), correo: 'p' + i + '@al3d.mx', ts: new Date(Date.UTC(2026, 8, 25) + Math.floor(azar() * 17 * 86400000)).toISOString(),
        renglones: azar() < 0.75 ? j(items.map(it => [it.desc.slice(0, 120), it.n, Math.round(azar() * 1e6) / 100])) : '',
        estado: elige(['vigente', 'vigente', 'vigente', 'superada', 'revocada', 'otra cosa', '']),
      });
    });
    gs.e.filas = filas;
    const quita = (f, c) => c.slice(0, -1) + (c.slice(-1) === '0' ? '1' : '0');
    const consultas = [];
    for (const v of filas) {
      const f = v[1], c = v[12], corto = Ver.folioCorto(f);
      consultas.push({ f, c }, { f: corto, c }, { f: corto.toLowerCase(), c: c.replace(/-/g, '').toLowerCase() }, { f: '  ' + f + '  ', c: ' ' + c + ' ' },
        { f, c: quita(f, c) }, { f: 'COT-9999-Z@ZZZZ', c }, { f, c: '' }, { f: '', c }, { f: 'COT 0042', c }, { c }, { f }, { f: f + '@x', c }, { f, c: c.slice(0, 8) });
    }
    consultas.push(null, undefined, {}, { f: 42, c: 12345 }, { f: ['COT-1'], c: ['1031-54B3-55D4'] });
    /* Alteradas a mano en la hoja, una columna a la vez: la fila sigue ahí y su firma ya no cuadra. */
    const alteradas = [];
    for (const v of filas.slice(0, 20)) for (const col of [0, 2, 4, 5, 6, 8, 9, 10]) {
      const w = v.slice(); w[col] = typeof w[col] === 'number' ? w[col] + 0.01 : String(w[col]) + 'x'; alteradas.push([w, { f: v[1], c: v[12] }]);
    }
    const conClave = () => ({ clave: CLAVE, leerFilas: async () => gs.e.filas.map(w => aFilaBD(w)), contarCupo: Ver.contadorEnMemoria().contar, ahora: () => gs.e.ahora });
    await comparar('la respuesta pública de ' + consultas.length + ' consultas (tanda ' + tanda + '): mismas llaves, mismos valores, mismo orden', consultas, async q => {
      const del = j(gs.api.rutaVerificar_(q));
      const nuevo = j((await vp(q, conClave())).cuerpo);
      return [del, nuevo];
    });
    await comparar('filas alteradas a mano en la hoja (' + alteradas.length + ', tanda ' + tanda + '): las dos dicen no_autentica', alteradas, async ([w, q]) => {
      gs.e.filas = [w];
      const del = j(gs.api.rutaVerificar_(q));
      const nuevo = j((await vp(q, { ...conClave(), leerFilas: async () => [aFilaBD(w)] })).cuerpo);
      return [del, nuevo];
    });
    eq('  y ninguna de las alteradas pasó por buena', alteradas.every(([w, q]) => { gs.e.filas = [w]; return gs.api.rutaVerificar_(q).estado === 'no_autentica'; }), true);
    gs.e.filas = []; gs.e.clave = null;
  }
}

/* ============================================================================
   4. /VERIFICAR — una respuesta por estado, nada sensible hacia un anónimo, el cupo y la configuración
   ============================================================================ */

console.log('\n4. /VERIFICAR — el núcleo de la ruta pública');
const AHORA = Date.UTC(2026, 9, 10, 12, 0, 0);            // 2026-10-10 12:00 UTC: al principio de una ventana de 600 s
const depsDe = (filas, extra = {}) => ({ clave: CLAVE, leerFilas: async () => filas, contarCupo: Ver.contadorEnMemoria().contar, ahora: () => AHORA, ...extra });
const consulta = (f, c, filas, extra) => vp({ f, c }, depsDe(filas, extra));
{
  const fV = await filaFirmada(R_V2);
  const fSup = await filaFirmada({ ...R_V2, folio: 'COT-0050-B@K7QM', precioAuth: 11900, total: 11900, ts: '2026-09-28T17:00:00.000Z' }, CLAVE, undefined, { estado: 'superada' });
  const fRev = await filaFirmada({ ...R_V2, folio: 'COT-0055-B@K7QM' }, CLAVE, undefined, { estado: 'revocada' });
  const fV1 = await filaFirmada(R_V1);
  const TODAS = [fV, fSup, fRev, fV1];

  console.log('  -- un estado por respuesta');
  const r1 = await consulta('COT-0042-B@K7QM', fV.codigo, TODAS);
  eq('vigente → «autentica» (el nombre que la página ya sabe pintar; «vigente» la mandaría a «No auténtica»)', [r1.status, r1.cuerpo.ok, r1.cuerpo.estado, r1.motivo], [200, true, 'autentica', 'ok']);
  eq('  con el folio CORTO de la fila, la fecha del día, el total, el negocio y los renglones',
     [r1.cuerpo.folio, r1.cuerpo.fecha, r1.cuerpo.total, r1.cuerpo.proyecto, r1.cuerpo.renglones],
     ['COT-0042-B', '30/09/2026', 12500, 'Tacos El Güero', [{ descripcion: 'Letras «TACOS»', cantidad: 8, importe: 9600 }, { descripcion: 'Bastidor', cantidad: 1, importe: 1710 }]]);
  eq('  y las llaves son exactamente estas siete, en este orden', Object.keys(r1.cuerpo), ['ok', 'estado', 'folio', 'fecha', 'total', 'proyecto', 'renglones']);
  const r2 = await consulta('COT-0050-B@K7QM', fSup.codigo, TODAS);
  eq('superada → «superada», con SU total y SU fecha (un PDF viejo no es falso: es de antes)', [r2.cuerpo.estado, r2.cuerpo.total, r2.cuerpo.fecha], ['superada', 11900, '28/09/2026']);
  const r3 = await consulta('COT-0055-B@K7QM', fRev.codigo, TODAS);
  eq('revocada → «revocada»', r3.cuerpo.estado, 'revocada');
  const r4 = await consulta('COT-0042-B@K7QM', 'AAAA-BBBB-CCCC', TODAS);
  eq('un código que no existe → «no_autentica», solo estas dos llaves', [r4.cuerpo, r4.motivo, r4.alerta], [{ ok: true, estado: 'no_autentica' }, 'no_encontrada', false]);
  const r5 = await consulta('COT-0099-B@K7QM', fV.codigo, TODAS);
  eq('el código bueno de otro folio → «no_autentica»', r5.cuerpo, { ok: true, estado: 'no_autentica' });
  const r6 = await consulta('COT-0042-B@K7QM', fV.codigo, [{ ...fV, total: 5000 }]);
  eq('con la fila ahí pero el total cambiado a mano → «no_autentica», con alerta para quien lee el registro', [r6.cuerpo, r6.motivo, r6.alerta, r6.detalle], [{ ok: true, estado: 'no_autentica' }, 'firma_invalida', true, 'firma_no_coincide']);
  eq('«no se encontró» y «la firma no cuadra» se ven IGUAL desde fuera (distinguirlos le diría a quien prueba cuáles códigos existen)', j(r4.cuerpo), j(r6.cuerpo));
  const r7 = await consulta('COT-0007-B@K7QM', fV1.codigo, TODAS);
  eq('un sello v1 → auténtico, con `renglones: null` (solo responde del total)', [r7.cuerpo.estado, r7.cuerpo.renglones, r7.cuerpo.total], ['autentica', null, 13119.6]);
  const rOtro = await consulta('COT-0042-B@K7QM', fV.codigo, [{ ...fV, estado: 'cualquier otra cosa' }]);
  eq('un estado desconocido en la fila → «superada», como el .gs', rOtro.cuerpo.estado, 'superada');
  eq('el estado de una fila se traduce así', ['vigente', 'revocada', 'superada', 'x', null, undefined, ''].map(Ver.estadoPublico), ['autentica', 'revocada', 'superada', 'superada', 'superada', 'superada', 'superada']);

  console.log('  -- las formas del folio y del código');
  eq('el QR trae el folio largo y el código con guiones', (await consulta('COT-0042-B@K7QM', fV.codigo, TODAS)).cuerpo.estado, 'autentica');
  eq('lo impreso en el papel es el corto, y también vale', (await consulta('COT-0042-B', fV.codigo, TODAS)).cuerpo.estado, 'autentica');
  eq('en minúsculas, con espacios alrededor y el código sin guiones', (await consulta('  cot-0042-b  ', fV.codigo.replace(/-/g, '').toLowerCase(), TODAS)).cuerpo.estado, 'autentica');
  eq('con el folio largo, el aparato se compara EXACTO: otro aparato no encuentra nada', (await consulta('COT-0042-B@K7QX', fV.codigo, TODAS)).cuerpo.estado, 'no_autentica');
  eq('  y en minúsculas el aparato tampoco', (await consulta('COT-0042-B@k7qm', fV.codigo, TODAS)).cuerpo.estado, 'no_autentica');
  {
    const a = await filaFirmada({ ...R_V2, folio: 'COT-0042-B@K7QM', proyecto: 'Tacos El Güero', total: 11600, precioAuth: 11600 });
    const b = await filaFirmada({ ...R_V2, folio: 'COT-0042-B@M2PL', proyecto: 'Farmacia Luz', total: 23200, precioAuth: 23200 });
    const ra = await consulta('COT-0042-B', a.codigo, [a, b]), rb = await consulta('COT-0042-B', b.codigo, [a, b]);
    eq('dos teléfonos con el mismo COT-0042-B: el código desempata', [ra.cuerpo.proyecto, rb.cuerpo.proyecto], ['Tacos El Güero', 'Farmacia Luz']);
    const vieja = await filaFirmada({ ...R_V2, ts: '2026-09-20T18:04:11.000Z', total: 11600, precioAuth: 11600 }, CLAVE, undefined, { estado: 'superada' });
    const nueva = await filaFirmada({ ...R_V2, ts: '2026-09-25T10:00:00.000Z', total: 9280, precioAuth: 9280 });
    eq('una cotización reautorizada deja dos filas: cada código responde con la suya', [(await consulta('COT-0042-B', vieja.codigo, [vieja, nueva])).cuerpo.estado, (await consulta('COT-0042-B', nueva.codigo, [vieja, nueva])).cuerpo.estado], ['superada', 'autentica']);
    eq('  y si dos filas comparten folio y código, manda la ÚLTIMA (de atrás para adelante)', (await consulta('COT-0042-B', nueva.codigo, [{ ...nueva, estado: 'revocada' }, nueva])).cuerpo.estado, 'autentica');
  }
  eq('las peticiones mal formadas se contestan sin consultar nada (ni gastar cupo)',
     await (async () => {
       let lecturas = 0, cuentas = 0;
       const deps = depsDe(TODAS, { leerFilas: async () => { lecturas++; return TODAS; }, contarCupo: async () => { cuentas++; return 1; } });
       const out = [];
       for (const q of [{ f: 'COT 0042', c: fV.codigo }, { f: 'COT-0042-B@', c: fV.codigo }, { f: 'COT-0042-B', c: '1234' }, { f: 'COT-0042-B', c: '' }, { f: '', c: fV.codigo }, { f: 'x'.repeat(30), c: fV.codigo }, null, undefined, {}, 'texto', 7]) {
         out.push(j((await vp(q, deps)).cuerpo));
       }
       return [out.every(x => x === '{"ok":true,"estado":"no_autentica"}'), lecturas, cuentas];
     })(), [true, 0, 0]);
  eq('una entrada de más de 256 caracteres no es una petición: no se consulta (el .gs lo acotaba con 64 KB de cuerpo)',
     await (async () => { let l = 0; const r = await vp({ f: 'COT-0042-B' + ' '.repeat(300), c: fV.codigo }, depsDe(TODAS, { leerFilas: async () => { l++; return TODAS; } })); return [r.cuerpo, r.motivo, r.detalle, l]; })(),
     [{ ok: true, estado: 'no_autentica' }, 'forma_invalida', 'demasiado_largo', 0]);
  eq('lo que se le pasa a leerFilas es lo que hace falta para buscar', await (async () => { let p; await vp({ f: ' COT-0042-B@K7QM ', c: 'a1b2c3d4e5f6' }, depsDe([], { leerFilas: async x => { p = x; return []; } })); return p; })(),
     { folio: 'COT-0042-B@K7QM', folioCorto: 'COT-0042-B', conAparato: true, codigo: 'A1B2C3D4E5F6' });

  console.log('  -- lo que NO sale hacia un anónimo');
  {
    /* Cada dato privado lleva una marca que se reconoce en el texto de la respuesta. */
    const PRIV = { cliente: 'CLIENTE-PRIVADO-XYZ', nota: 'NOTA-PRIVADA-XYZ', solicito: 'SOLICITANTE-PRIVADO-XYZ', correo: 'autorizador-secreto@al3d.mx', huella: 'HUELLA-PRIVADA-XYZ',
      itemsAuth: '1:6543.21' };
    const r = { ...R_V2, folio: 'COT-0077-B@PRIV', correo: PRIV.correo, huella: PRIV.huella, itemsAuth: PRIV.itemsAuth, subCalc: 4321.1, precioAuth: 8765.43, total: 9999.99,
      ts: '2026-10-01T04:30:15.123Z', renglones: '[["Pieza",1,9999.99]]' };
    const f = await filaFirmada(r, CLAVE, undefined, { cliente: PRIV.cliente, nota: PRIV.nota, solicito: PRIV.solicito, ajuste_pct: 42.42 });
    const sale = await consulta('COT-0077-B@PRIV', f.codigo, [f]);
    const texto = JSON.stringify(sale.cuerpo);
    eq('la respuesta buena trae exactamente las siete llaves públicas', Object.keys(sale.cuerpo).sort(), ['estado', 'fecha', 'folio', 'ok', 'proyecto', 'renglones', 'total']);
    const privados = [PRIV.cliente, PRIV.nota, PRIV.solicito, PRIV.correo, 'autorizador', PRIV.huella, '6543.21', '4321.1', '8765.43', '42.42', f.firma, f.firma.slice(0, 12), f.codigo, f.codigo.replace(/-/g, ''),
      '04:30:15', '2026-10-01T', 'K7QM', 'PRIV', 'sub_calc', 'precio_auth', 'items_auth', 'huella', 'firma', 'codigo', 'autorizo', 'solicito', 'cliente', 'nota'];
    eq('  ninguno de estos aparece en lo que sale: cliente, nota, quién solicitó, correo, huella, subtotal, precio autorizado, ajustes, firma, código, hora, aparato',
       privados.filter(p => texto.includes(p)), []);
    eq('  el folio sale corto, sin el aparato, y la fecha solo el día', [sale.cuerpo.folio, sale.cuerpo.fecha], ['COT-0077-B', '30/09/2026']);
    eq('  ni el registro interno lleva datos de la fila (solo cómo fue la consulta)', Object.keys(sale).sort(), ['alerta', 'codificacion', 'cuerpo', 'motivo', 'status']);
    const noAut = await consulta('COT-0077-B@PRIV', 'AAAA-BBBB-CCCC', [f]);
    eq('  y lo que sale sin firma buena son dos llaves y nada más', Object.keys(noAut.cuerpo), ['ok', 'estado']);
    cierto('  el cuerpo de una respuesta de error tampoco trae nada de la fila ni de la excepción',
      !/PRIV|ERROR-INTERNO|SELECT|password/i.test(JSON.stringify((await consulta('COT-0077-B@PRIV', f.codigo, [f], { leerFilas: async () => { throw new Error('ERROR-INTERNO: SELECT password FROM x'); } })).cuerpo)));
    /* Una columna nueva en la tabla no se cuela: la respuesta se arma llave por llave. */
    const conColumnaNueva = await consulta('COT-0077-B@PRIV', f.codigo, [{ ...f, secreto_nuevo: 'COLUMNA-NUEVA-XYZ', telefono: '33 1234 5678' }]);
    eq('  una columna nueva en la tabla no se cuela a la respuesta', JSON.stringify(conColumnaNueva.cuerpo).includes('COLUMNA-NUEVA') || JSON.stringify(conColumnaNueva.cuerpo).includes('5678'), false);
  }

  console.log('  -- la fecha (zona de la hoja: NO CONFIRMADA; se pasa como parámetro, por omisión Ciudad de México)');
  {
    const F = ts => Ver.fechaDeVerificar(ts);
    eq('2026-10-01T04:30:15.123Z son las 22:30 del 30 de septiembre en México (UTC−6, sin horario de verano desde 2022)', F('2026-10-01T04:30:15.123Z'), '30/09/2026');
    eq('  y 2026-09-26T17:00:00.000Z, las 11:00 del mismo día', F('2026-09-26T17:00:00.000Z'), '26/09/2026');
    eq('  la medianoche de México es a las 06:00Z', [F('2026-10-10T05:59:59.999Z'), F('2026-10-10T06:00:00.000Z')], ['09/10/2026', '10/10/2026']);
    eq('  con otra zona, otro día (UTC)', Ver.fechaDeVerificar('2026-10-01T04:30:15.123Z', 'UTC'), '01/10/2026');
    eq('  la base de zonas trae el horario de verano que ya no hay: 2022-07-01T05:30Z era las 00:30 en México (UTC−5)', F('2022-07-01T05:30:00.000Z'), '01/07/2022');
    eq('  lo que no es fecha da vacío, no «NaN/NaN/NaN»', ['', 'mañana', 'basura', null, undefined].map(F), ['', '', '', '', '']);
    eq('  y una zona que no existe lanza (se detecta antes de contestar: ver la configuración)', (() => { try { Ver.fechaDeVerificar('2026-10-01T04:30:15.123Z', 'Mi/Casa'); return 'no lanzó'; } catch (e) { return e.name; } })(), 'RangeError');
    const rr = await consulta('COT-0042-B', fV.codigo, TODAS, { zonaHoraria: 'UTC' });
    eq('  y verificarPublico usa la zona que se le dé', rr.cuerpo.fecha, '01/10/2026');
  }

  console.log('  -- el cupo: 30 por folio y 400 en total en ventanas fijas de 600 s');
  {
    const L = Ver.LIMITES_VERIFICAR;
    eq('los límites son los del .gs', [L.porFolio, L.enTotal, L.ventanaSeg, Object.isFrozen(L)], [30, 400, 600, true]);
    const T0 = Math.floor(AHORA / 600000) * 600000;
    eq('decidirCupo: la 30 de un folio pasa y la 31 no', [Ver.decidirCupo({ porFolio: 30, enTotal: 30 }, T0).permitido, Ver.decidirCupo({ porFolio: 31, enTotal: 31 }, T0).permitido], [true, false]);
    eq('  la 400 del total pasa y la 401 no', [Ver.decidirCupo({ porFolio: 1, enTotal: 400 }, T0).permitido, Ver.decidirCupo({ porFolio: 1, enTotal: 401 }, T0).permitido], [true, false]);
    eq('  dice cuál tope fue (el del folio primero si fueron los dos)', [Ver.decidirCupo({ porFolio: 31, enTotal: 1 }, T0).tope, Ver.decidirCupo({ porFolio: 1, enTotal: 401 }, T0).tope, Ver.decidirCupo({ porFolio: 31, enTotal: 401 }, T0).tope, Ver.decidirCupo({ porFolio: 1, enTotal: 1 }, T0).tope], ['folio', 'total', 'folio', null]);
    eq('  cuánto falta para que cierre la ventana (para un Retry-After)', [T0, T0 + 1000, T0 + 599000, T0 + 599999].map(t => Ver.decidirCupo({ porFolio: 1, enTotal: 1 }, t).reintentarEnSeg), [600, 599, 1, 1]);
    eq('  la ventana cambia cada 600 s exactos', [T0, T0 + 599999, T0 + 600000].map(t => Ver.ventanaDe(t)).map((w, i, a) => w - a[0]), [0, 0, 1]);
    eq('  lo que no es un número válido cuenta como cero', [Ver.decidirCupo({ porFolio: NaN, enTotal: 'x' }, T0).permitido, Ver.decidirCupo({ porFolio: -5, enTotal: undefined }, T0).permitido, Ver.decidirCupo(null, T0).permitido, Ver.decidirCupo(undefined, T0).permitido], [true, true, true, true]);
    eq('  con otros límites', [Ver.decidirCupo({ porFolio: 3, enTotal: 3 }, T0, { porFolio: 3 }).permitido, Ver.decidirCupo({ porFolio: 4, enTotal: 4 }, T0, { porFolio: 3 }).permitido], [true, false]);
    eq('  un reloj que no es número es un error, no un «pasa»', (() => { try { Ver.decidirCupo({}, NaN); return 'no lanzó'; } catch (e) { return e.name; } })(), 'TypeError');
    eq('  y un límite que no es positivo, también', (() => { try { Ver.decidirCupo({}, T0, { porFolio: 0 }); return 'no lanzó'; } catch (e) { return e.name; } })(), 'RangeError');
    eq('las claves del cupo: por folio CORTO y en MAYÚSCULAS; el total no choca con ningún folio', [Ver.clavesDeCupo('COT-0042-B'), Ver.clavesDeCupo('cot-0042-b')],
       [{ porFolio: 'v_COT-0042-B', enTotal: 'v__total' }, { porFolio: 'v_COT-0042-B', enTotal: 'v__total' }]);

    /* Por la ruta entera: la consulta 31 de un folio se rechaza aunque el código sea el bueno. */
    {
      const cont = Ver.contadorEnMemoria();
      const deps = depsDe(TODAS, { contarCupo: cont.contar, ahora: () => T0 + 5000 });
      let primeraRechazada = null, ultimo = null;
      for (let i = 1; i <= 35 && primeraRechazada === null; i++) { ultimo = await vp({ f: 'COT-0042-B@K7QM', c: fV.codigo }, deps); if (ultimo.status === 429) primeraRechazada = i; }
      eq('la consulta 31 de un folio se rechaza AUNQUE el código sea el bueno', primeraRechazada, 31);
      eq('  con el cuerpo del .gs, palabra por palabra (SIN_RED), 429 y cuánto esperar', [ultimo.cuerpo, ultimo.status, ultimo.motivo, ultimo.reintentarEnSeg, ultimo.alerta],
         [{ ok: false, codigo: 'SIN_RED', mensaje: 'Demasiadas consultas seguidas. Espera unos minutos.' }, 429, 'cupo', 595, false]);
      eq('  y otro folio, en la misma ventana, sigue pasando', (await vp({ f: 'COT-0050-B@K7QM', c: fSup.codigo }, deps)).status, 200);
      eq('  «cot-0042-b» en minúsculas es el MISMO folio: no abre otra cubeta (el .gs sí la abría: ver abajo)', (await vp({ f: 'cot-0042-b', c: fV.codigo }, deps)).status, 429);
      const sig = { ...deps, ahora: () => T0 + 600000 + 1 };
      eq('  pasados los 600 s se abre otra ventana y el folio vuelve a pasar', (await vp({ f: 'COT-0042-B@K7QM', c: fV.codigo }, sig)).status, 200);
    }
    {
      const cont = Ver.contadorEnMemoria();
      const deps = depsDe([], { contarCupo: cont.contar, ahora: () => T0 + 1000 });
      let primera = null;
      for (let i = 0; i < 405 && primera === null; i++) { const r = await vp({ f: 'COT-' + String(i).padStart(4, '0') + '-A', c: 'AAAA-BBBB-CCCC' }, deps); if (r.status === 429) primera = i + 1; }
      eq('el tope TOTAL se cierra a la consulta 401, sean los folios que sean', primera, 401);
      eq('  con memoria acotada: las ventanas viejas se olvidan', await (async () => { const c2 = Ver.contadorEnMemoria(); await c2.contar('a', 1); await c2.contar('b', 1); await c2.contar('a', 2); return c2.tamano(); })(), 1);
    }

    /* Contra el cupo del .gs, con una caché de verdad (caducidad sobre el reloj) y el mismo reloj. */
    for (const tanda of [1, 2]) {
      const gs = GS, azar = mulberry32(SEMILLA + 6 + tanda);
      gs.e.cacheActiva = true; gs.e.cache.clear(); gs.e.filas = []; gs.e.clave = CLAVE; gs.e.hoja = true; gs.e.ahora = T0;
      const cont = Ver.contadorEnMemoria();
      const deps = { clave: CLAVE, leerFilas: async () => [], contarCupo: cont.contar, ahora: () => gs.e.ahora };
      const FOLIOS = Array.from({ length: 9 }, (_, i) => 'COT-' + String(40 + i).padStart(4, '0') + '-A');
      const eventos = Array.from({ length: 1400 }, () => ({ dt: Math.floor(azar() * 2500), f: FOLIOS[Math.floor(azar() * FOLIOS.length)] }));
      let n = 0, difieren = 0, rechazadas = 0, primera = null;
      for (const ev of eventos) {
        gs.e.ahora += ev.dt;
        const q = { f: ev.f, c: 'AAAA-BBBB-CCCC' };
        const delGs = gs.api.rutaVerificar_(q).codigo === 'SIN_RED';
        const nuevo = (await vp(q, deps)).status === 429;
        n++; if (delGs) rechazadas++;
        if (delGs !== nuevo) { difieren++; if (!primera) primera = { n, ev, delGs, nuevo }; }
      }
      casos += n;
      if (difieren === 0 && rechazadas > 100) bien('el cupo decide igual que el del .gs en ' + n + ' consultas (' + rechazadas + ' rechazadas, varias ventanas, nueve folios, tanda ' + tanda + ')');
      else mal('el cupo difiere del .gs: ' + difieren + ' de ' + n + ' (rechazadas ' + rechazadas + '). Primero: ' + j(primera));

      /* La diferencia deliberada: el .gs contaba por el folio TAL COMO LO TECLEARON. */
      gs.e.cache.clear(); gs.e.ahora = T0 + 10;
      let pasaron = 0;
      for (const f of ['COT-0042-B', 'cot-0042-b']) for (let i = 0; i < 40; i++) if (gs.api.rutaVerificar_({ f, c: 'AAAA-BBBB-CCCC' }).codigo !== 'SIN_RED') pasaron++;
      eq('el .gs (tanda ' + tanda + ') deja pasar 60 consultas a un mismo folio alternando la caja (30 + 30): el tope por folio se burla; la reescritura lo cierra en 30', pasaron, 60);
      gs.e.cacheActiva = false; gs.e.cache.clear(); gs.e.clave = null;
    }
    eq('si el contador falla, se deja pasar como el .gs, pero se avisa en el registro', await (async () => {
      const r = await consulta('COT-0042-B', fV.codigo, TODAS, { contarCupo: async () => { throw new Error('la tabla de cupos no contesta'); } });
      return [r.status, r.cuerpo.estado, r.alerta, r.cupoNoDisponible];
    })(), [200, 'autentica', true, 'la tabla de cupos no contesta']);
    eq('  y si devuelve algo que no es número, igual', await (async () => { const r = await consulta('COT-0042-B', fV.codigo, TODAS, { contarCupo: async () => 'muchas' }); return [r.status, r.cuerpo.estado]; })(), [200, 'autentica']);
  }

  console.log('  -- la configuración: faltar algo NO es «no auténtica» (el falso «No auténtica» a un cliente con su PDF bueno)');
  {
    const ES_ERROR = r => r.status === 503 && r.cuerpo.ok === false && r.cuerpo.codigo === 'CONFIGURACION' && r.alerta === true && !('estado' in r.cuerpo);
    const buena = { f: 'COT-0042-B@K7QM', c: fV.codigo };
    for (const [nombre, clave] of [['undefined', undefined], ['null', null], ['vacía', ''], ['de puros espacios', '  '], ['la palabra «undefined»', 'undefined'], ['la palabra «null»', 'null'], ['un número', 42]]) {
      const r = await vp(buena, depsDe(TODAS, { clave }));
      cierto('sin clave (' + nombre + '): error explícito de configuración, 503, alerta, y ni rastro de «no_autentica»', ES_ERROR(r) && r.motivo === 'clave_ausente');
    }
    const sin = await vp(buena, depsDe(TODAS, { clave: undefined }));
    eq('  el mensaje que ve el cliente no lo acusa de nada y no cuenta detalles', [sin.cuerpo.mensaje, /falsa|falso|auténtica|clave|secret/i.test(sin.cuerpo.mensaje.replace('no quiere decir que tu cotización sea falsa', ''))],
       [Ver.MENSAJE_CONFIGURACION, false]);
    eq('  (y la página lo pinta como «Espera un momento»: solo mira `ok`, y con `ok: false` muestra el mensaje)',
       /r\.ok !== true[\s\S]{0,200}Espera un momento/.test(readFileSync(join(RAIZ, 'verificar.html'), 'utf8')), true);
    eq('  pero una petición mal formada sigue siendo «no_autentica» aunque falte la clave: ese papel no puede existir',
       (await vp({ f: 'COT 0042', c: fV.codigo }, depsDe(TODAS, { clave: undefined }))).cuerpo, { ok: true, estado: 'no_autentica' });
    for (const d of ['leerFilas', 'contarCupo', 'ahora']) {
      const deps = depsDe(TODAS); delete deps[d];
      const r = await vp(buena, deps);
      cierto('sin «' + d + '»: error de configuración (dependencia_ausente)', ES_ERROR(r) && r.motivo === 'dependencia_ausente');
    }
    cierto('sin deps en absoluto (undefined o null): error de configuración', ES_ERROR(await vp(buena)) && ES_ERROR(await vp(buena, null)));
    {
      /* La configuración se dice ANTES de contar el cupo: con la clave faltando y el cupo agotado,
         lo que hay que oír es el error de configuración y no «espera unos minutos». */
      const rr = await vp(buena, depsDe(TODAS, { clave: undefined, contarCupo: async () => 99999 }));
      cierto('la configuración se dice antes que el cupo (sin clave y con el cupo agotado: 503, no 429)', ES_ERROR(rr) && rr.motivo === 'clave_ausente');
      let cuentas = 0;
      await vp(buena, depsDe(TODAS, { clave: undefined, contarCupo: async () => { cuentas++; return 1; } }));
      eq('  y no se gasta cupo por una consulta que no se pudo atender', cuentas, 0);
      /* Lo que nadie previó fuera de los try de adentro (aquí, una entrada que no se puede ni volver texto)
         sale como error inesperado, no como excepción hacia la función. */
      const hostil = { toString() { throw new Error('no se deja volver texto'); } };
      const rh = await vp({ f: hostil, c: fV.codigo }, depsDe(TODAS));
      eq('una entrada hostil que revienta al volverse texto: 500 DESCONOCIDO con alerta, no una excepción', [rh.status, rh.cuerpo.codigo, rh.motivo, rh.alerta], [500, 'DESCONOCIDO', 'error_inesperado', true]);
    }
    cierto('una zona horaria que no existe: error de configuración', ES_ERROR(await vp(buena, depsDe(TODAS, { zonaHoraria: 'Mi/Casa' }))));
    cierto('límites inválidos: error de configuración', ES_ERROR(await vp(buena, depsDe(TODAS, { limites: { porFolio: -1 } }))));
    for (const c of Sello.COLUMNAS_DE_AUTORIZACION) {
      const incompleta = { ...fV }; delete incompleta[c];
      const r = await vp(buena, depsDe([incompleta]));
      if (!(ES_ERROR(r) && r.motivo === 'columna_ausente' && r.detalle.includes('«' + c + '»'))) { mal('la fila sin «' + c + '» no dio error de configuración con su nombre: ' + j(r)); break; }
      if (c === Sello.COLUMNAS_DE_AUTORIZACION.at(-1)) bien('una fila sin cualquiera de sus trece columnas: error de configuración que nombra la columna (así una consulta mal hecha no vuelve «falsos» todos los PDF)');
    }
    cierto('«renglones» sin seleccionar en la consulta (el caso peor: todos los v2 se leerían como v1): error de configuración, no «no auténtica»',
      ES_ERROR(await vp(buena, depsDe([(({ renglones, ...resto }) => resto)(fV)]))));
    const sinColumnaPeroOtroFolio = await vp({ f: 'COT-0099-B@K7QM', c: 'AAAA-BBBB-CCCC' }, depsDe([(({ renglones, ...resto }) => resto)(fV)]));
    cierto('  incluso si la fila no es la que se busca: la consulta está mal hecha y se dice', ES_ERROR(sinColumnaPeroOtroFolio));
    cierto('un jsonb ya parseado en «renglones»: error de configuración con motivo tipo_invalido', await (async () => { const r = await vp(buena, depsDe([{ ...fV, renglones: [['x', 1, 2]] }])); return ES_ERROR(r) && r.motivo === 'tipo_invalido'; })());
    const caida = await vp(buena, depsDe(TODAS, { leerFilas: async () => { throw new Error('SELECT falló: password'); } }));
    eq('la base que no contesta: error 500 con el cuerpo del .gs (DESCONOCIDO), alerta, y sin soltar el mensaje de la excepción',
       [caida.status, caida.cuerpo, caida.motivo, caida.alerta, caida.detalle], [500, { ok: false, codigo: 'DESCONOCIDO', mensaje: 'El puente falló procesando eso.' }, 'origen_no_disponible', true, 'SELECT falló: password']);
    eq('  una lectura que no devuelve un arreglo es lo mismo', (await vp(buena, depsDe(TODAS, { leerFilas: async () => ({ filas: 1 }) }))).status, 500);
    cierto('una fila que ni es un objeto: error de configuración (fila_invalida)', await (async () => { const r = await vp(buena, depsDe([null])); return ES_ERROR(r) && r.motivo === 'fila_invalida'; })());
    cierto('una codificación que no existe en las dependencias: error de configuración (dependencia_invalida)',
      await (async () => { const r = await vp(buena, depsDe(TODAS, { codificaciones: ['latin1'] })); return ES_ERROR(r) && r.motivo === 'dependencia_invalida'; })());
    eq('algo que nadie previó (codificaciones que ni es una lista): 500 DESCONOCIDO con alerta, nunca una excepción hacia afuera ni un «no auténtica»',
       await (async () => { const r = await vp(buena, depsDe(TODAS, { codificaciones: 5 })); return [r.status, r.cuerpo.codigo, r.motivo, r.alerta]; })(), [500, 'DESCONOCIDO', 'error_inesperado', true]);
    {
      /* Sin WebCrypto (un entorno viejo): se dice, no se contesta «falso». */
      const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
      let r, e;
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
      try { r = await vp(buena, depsDe(TODAS)); e = await Sello.firmar(R_V2, CLAVE).catch(x => x); }
      finally { Object.defineProperty(globalThis, 'crypto', original); }
      cierto('sin WebCrypto: error de configuración (sin_webcrypto)', ES_ERROR(r) && r.motivo === 'sin_webcrypto');
      eq('  y firmar lanza SIN_WEBCRYPTO', [e && e.name, e && e.codigo], ['ErrorDeSello', 'SIN_WEBCRYPTO']);
      eq('  y WebCrypto vuelve a estar donde estaba', typeof globalThis.crypto.subtle.sign, 'function');
    }
    /* Las codificaciones en la ruta: con cuál cuadró sale en el registro (nunca en la respuesta pública). */
    {
      const fa = await filaFirmada(R_V2, CLAVE, 'ascii-?');     // como las heredadas de la hoja: sin su codificación
      const fu = await filaFirmada(R_V2, CLAVE, 'utf-8');
      const de = f => ({ f: 'COT-0042-B@K7QM', c: f.codigo });  // el código de cada una es el de SU firma
      const defecto = await vp(de(fa), depsDe([fa]));
      eq('un sello heredado firmado con ASCII-? (como el Apps Script) se contesta bien por omisión, y el registro dice con cuál cuadró', [defecto.cuerpo.estado, defecto.codificacion, defecto.alerta], ['autentica', 'ascii-?', false]);
      const soloUtf8 = await vp(de(fa), depsDe([fa], { codificaciones: ['utf-8'] }));
      eq('  y si solo se permite UTF-8 no cuadra: «no_autentica» hacia afuera y alerta hacia adentro', [soloUtf8.cuerpo, soloUtf8.motivo, soloUtf8.alerta], [{ ok: true, estado: 'no_autentica' }, 'firma_invalida', true]);
      const conUtf8 = await vp(de(fu), depsDe([fu]));
      eq('uno firmado con UTF-8 y sin codificación propia también se contesta bien (se prueba después de ASCII-?), y el registro dice «utf-8»', [conUtf8.cuerpo.estado, conUtf8.codificacion, conUtf8.alerta], ['autentica', 'utf-8', false]);
      for (const [c, f] of [['ascii-?', fa], ['utf-8', fu]]) {
        const r = await vp(de(f), depsDe([{ ...f, codificacion: c }]));
        eq('con su codificación propia («' + c + '») se contesta bien, y el registro dice con cuál cuadró', [r.cuerpo.estado, r.codificacion, r.alerta], ['autentica', c, false]);
        cierto('  y la respuesta pública no menciona la codificación: ni llave ni valor', !/codificacion|ascii|utf/i.test(JSON.stringify(r.cuerpo)));
      }
      const equivocada = await vp(de(fa), depsDe([{ ...fa, codificacion: 'utf-8' }]));
      eq('si la fila dice «utf-8» pero se firmó con ASCII-?: «no_autentica» hacia afuera y alerta hacia adentro (no se prueba la otra)',
         [equivocada.cuerpo, equivocada.motivo, equivocada.alerta, equivocada.detalle], [{ ok: true, estado: 'no_autentica' }, 'firma_invalida', true, 'firma_no_coincide']);
      const rara = await vp(de(fa), depsDe([{ ...fa, codificacion: 'latin1' }]));
      cierto('si la fila trae una codificación que no existe: error de configuración (tipo_invalido), no «no auténtica»', ES_ERROR(rara) && rara.motivo === 'tipo_invalido');
    }

    /* El .gs hoy, sin la propiedad del sello: contesta «no auténtica». Es el defecto que no se porta. */
    const gs = GS;
    gs.e.clave = CLAVE;
    gs.e.filas = [filaHoja(gs, { folio: 'COT-0042-B@K7QM', huella: 'h', subCalc: 1, precioAuth: 0, itemsAuth: '', total: 1, proyecto: 'P', correo: 'a@al3d.mx', ts: '2026-10-01T04:30:15.123Z', renglones: '' })];
    const codigoReal = gs.e.filas[0][12];
    const conClave = gs.api.rutaVerificar_({ f: 'COT-0042-B@K7QM', c: codigoReal });
    gs.e.clave = null;
    const sinClave = gs.api.rutaVerificar_({ f: 'COT-0042-B@K7QM', c: codigoReal });
    gs.e.clave = CLAVE; gs.e.hoja = false;
    const sinHoja = gs.api.rutaVerificar_({ f: 'COT-0042-B@K7QM', c: codigoReal });
    gs.e.hoja = true; gs.e.filas = []; gs.e.clave = null;
    eq('EL .gs HOY: con el PDF bueno en la mano, sin la propiedad del sello contesta «no_autentica» (falso), y sin la hoja también', [conClave.estado, sinClave.estado, sinHoja.estado], ['autentica', 'no_autentica', 'no_autentica']);
    eq('  la reescritura, en esos dos mismos casos, contesta un error y NO «no_autentica»',
       [(await vp({ f: 'COT-0042-B@K7QM', c: codigoReal }, depsDe([], { clave: undefined }))).cuerpo.ok, (await vp({ f: 'COT-0042-B@K7QM', c: codigoReal }, depsDe([], { leerFilas: async () => { throw new Error('no hay tabla'); } }))).cuerpo.ok], [false, false]);
  }

  console.log('  -- la página que consume esto (verificar.html) sigue entendiendo la respuesta');
  {
    const pagina = readFileSync(join(RAIZ, 'verificar.html'), 'utf8');
    const tabla = /const ESTADOS = \{([\s\S]*?)\n\};/.exec(pagina);
    const conocidos = tabla ? [...tabla[1].matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]) : [];
    eq('los cuatro estados públicos son los que la página sabe pintar (y «vigente» no: la mandaría a «No auténtica»)', [Ver.ESTADOS_PUBLICOS.every(e => conocidos.includes(e)), conocidos.includes('vigente')], [true, false]);
    cierto('  y usa justo las siete llaves: folio, fecha, proyecto, total y renglones (más ok y estado)', ['r.folio', 'r.fecha', 'r.proyecto', 'r.total', 'r.renglones', 'r.estado', 'r.ok'].every(k => pagina.includes(k)));
    cierto('  la página manda f y c con la forma que valida la reescritura (misma expresión regular)', pagina.includes('/^[A-Za-z0-9-]{1,24}(@[A-Za-z0-9_-]{1,24})?$/') && /ruta: 'verificar', f, c/.test(pagina));
  }

  /* El registro de la función habla un idioma cerrado: todo `motivo` que salió está en la lista que
     exporta el módulo, y cada uno de la lista se ejerció en esta prueba. */
  eq('todo motivo que contestó verificarPublico está en MOTIVOS', [...motivosVistos].filter(m => !Ver.MOTIVOS.includes(m)), []);
  eq('  y cada uno de MOTIVOS se ejerció al menos una vez en esta prueba (' + Ver.MOTIVOS.length + ')', Ver.MOTIVOS.filter(m => !motivosVistos.has(m)), []);
  eq('  los estados con los que se guarda una fila se traducen a los públicos', Ver.ESTADOS_DE_LA_FILA.map(Ver.estadoPublico), ['autentica', 'superada', 'revocada']);
}

/* ============================================================================
   5. EL HECHO COMPROBADO — con qué codificación vuelve bytes Apps Script (doce HMAC reales)
   ============================================================================ */

console.log('\n5. EL HECHO COMPROBADO — Utilities.computeHmacSha256Signature codifica en US-ASCII con «?», no en UTF-8');
console.log('  Comprobado el 2026-10-10 en un proyecto real de Apps Script, con claves falsas (doce HMAC en');
console.log('  pruebas/datos/hmac-apps-script-real.json). Ya no es una hipótesis: los sellos nuevos se firman con ASCII-?.');
{
  /* Los doce HMAC reales, tal cual salieron de Apps Script (el archivo trae su nota: qué son, cuándo y con qué
     claves). Son HMAC de textos cortos con claves falsas, no sellos: no llevan ningún dato de AL3D. */
  const archivo = JSON.parse(readFileSync(join(RAIZ, 'pruebas', 'datos', 'hmac-apps-script-real.json'), 'utf8'));
  const REALES = archivo.vectores;
  const traeNoAscii = v => /[^\x00-\x7f]/.test(v.clave + v.texto);
  const fallan = async fn => { const out = []; for (const [i, v] of REALES.entries()) if (!(await fn(v))) out.push(i + 1); return out; };

  cierto('el archivo conserva su nota: qué son, cuándo se obtuvieron y que las claves son falsas',
    typeof archivo._nota === 'string' && /Apps Script/.test(archivo._nota) && /2026-10-10/.test(archivo._nota) && /FALSAS/.test(archivo._nota));
  eq('trae doce vectores, cada uno con clave, texto y un HMAC de 64 hexadecimales en minúscula',
     [REALES.length, REALES.every(v => typeof v.clave === 'string' && typeof v.texto === 'string' && /^[0-9a-f]{64}$/.test(v.hex))], [12, true]);
  eq('  con dos claves, las dos falsas y una de ellas con acentos', [...new Set(REALES.map(v => v.clave))].map(k => [/falsa/.test(k), /[^\x00-\x7f]/.test(k)]), [[true, false], [true, true]]);
  cierto('  y cubren lo que importa: «·», «×», «, acentos, un emoji, un NUL, el texto vacío y una clave no ASCII',
    REALES.some(v => ['·', '×', '«', '»'].every(c => v.texto.includes(c))) && REALES.some(v => /[à-ÿ]/.test(v.texto)) &&
    REALES.some(v => /[\u{10000}-\u{10FFFF}]/u.test(v.texto)) && REALES.some(v => v.texto.includes('\u0000')) &&
    REALES.some(v => v.texto === '') && REALES.some(v => /[^\x00-\x7f]/.test(v.clave)));
  eq('  nueve traen algo no ASCII (en el texto o en la clave) y tres son todo ASCII', [REALES.filter(traeNoAscii).length, REALES.filter(v => !traeNoAscii(v)).length], [9, 3]);

  /* --- sello.js reproduce los doce al byte --- */
  eq('hmacHex con ASCII-? reproduce los doce HMAC reales, exactos: el texto Y la clave, con un «?» por punto de código',
     await fallan(async v => (await Sello.hmacHex(v.texto, v.clave, 'ascii-?')) === v.hex), []);
  eq('  y por omisión (la codificación de los sellos nuevos) también: los doce',
     await fallan(async v => (await Sello.hmacHex(v.texto, v.clave)) === v.hex), []);
  const utf8Coincide = await Promise.all(REALES.map(async v => (await Sello.hmacHex(v.texto, v.clave, 'utf-8')) === v.hex));
  eq('con UTF-8 NO coincide ninguno de los nueve que traen algo no ASCII: por eso importa', REALES.filter((v, i) => traeNoAscii(v) && utf8Coincide[i]).length, 0);
  eq('  y coincide en los tres que son todo ASCII (ahí no hay nada que decidir)', REALES.filter((v, i) => !traeNoAscii(v) && utf8Coincide[i]).length, 3);

  /* Un «?» por UNIDAD UTF-16 (y no por punto de código) daría dos «?» por emoji: se cae justo ahí. */
  const porUnidad = s => Uint8Array.from(Array.from({ length: s.length }, (_, i) => (s.charCodeAt(i) < 128 ? s.charCodeAt(i) : 63)));
  eq('un «?» por UNIDAD UTF-16, en vez de por punto de código, fallaría en los vectores con emoji y en ningún otro',
     REALES.filter(v => createHmac('sha256', porUnidad(v.clave)).update(porUnidad(v.texto)).digest('hex') !== v.hex).map(v => v.texto), ['😀 emoji', '😀 emoji']);
  eq('un emoji es UN solo «?» (un punto de código), no dos: es lo que distingue este modelo del de unidades UTF-16', [...Sello.aBytes('😀a', 'ascii-?')], [63, 97]);
  eq('  y un sustituto suelto también es uno (este caso no está entre los doce vectores: es lo que dice el hallazgo)', [...Sello.aBytes('\ud83dx', 'ascii-?')], [63, 120]);
  eq('  y la «ñ», la ««», la «·» y el «€»: un «?» cada uno', [...Sello.aBytes('ñ«·€', 'ascii-?')], [63, 63, 63, 63]);
  eq('  y el U+0000 pasa tal cual, como en el vector «a\\u0000b» (ni se vuelve «?» ni corta el texto)', [...Sello.aBytes('a\u0000b', 'ascii-?')], [97, 0, 98]);
  const canonConControl = Sello.canonDe({ ...R_V1, proyecto: 'a\u0000b\ud83dx' });
  eq('  (en un sello ni el NUL ni un sustituto suelto llegan a esa conversión: JSON.stringify los deja escapados, en ASCII; solo podrían contar en la clave)',
     [/^[\x00-\x7f]*$/.test(canonConControl), canonConControl.includes('a\\u0000b\\ud83dx')], [true, true]);
  eq('  mientras UTF-8 usa dos bytes para «ñ»', [...Sello.aBytes('ñ', 'utf-8')], [0xc3, 0xb1]);
  eq('  y sin decir la codificación, aBytes es ASCII-? (la de los sellos nuevos)', [...Sello.aBytes('ñ')], [63]);

  /* --- el hexadecimal: los bytes de Apps Script vienen con signo --- */
  eq('aHex() sobre los bytes CON SIGNO de cada HMAC real (b < 0 → b + 256) da el hexadecimal real, y sobre los 0..255 también',
     await fallan(async v => {
       const crudo = createHmac('sha256', Sello.aBytes(v.clave, 'ascii-?')).update(Sello.aBytes(v.texto, 'ascii-?')).digest();
       return Sello.aHex(new Int8Array(crudo.buffer, crudo.byteOffset, crudo.length)) === v.hex && Sello.aHex(crudo) === v.hex;
     }), []);

  /* --- el Utilities de mentira con el que se carga el .gs: si se desviara de la realidad, todo lo demás mentiría --- */
  eq('el Utilities de mentira del .gs reproduce los doce HMAC reales, pasando por el aHex() del propio .gs',
     await fallan(async v => GS.api.aHex(GS.Utilities.computeHmacSha256Signature(v.texto, v.clave)) === v.hex), []);
  cierto('  y sus bytes salen con signo (−128..127): el .gs ejerce de verdad su rama (b + 256) % 256',
     REALES.some(v => GS.Utilities.computeHmacSha256Signature(v.texto, v.clave).some(b => b < 0)));

  /* --- por qué importa: lo que firma el .gs REAL se verifica como ASCII-? y no como UTF-8 --- */
  const discriminan = VECTORES.filter(v => v.firma !== v.firmaUtf8).map(v => v.nombre.split(' ')[0]);
  eq('los sellos cuya firma cambia con la codificación son los que traen texto no ASCII: todos menos V1', discriminan, ['E2E-A', 'E2E-B', 'E2E-C', 'V5']);
  eq('  y un texto todo ASCII da lo mismo con las dos: ahí no hay nada que decidir', [await Sello.hmacHex('abc', CLAVE, 'utf-8'), await Sello.hmacHex('abc', CLAVE, 'ascii-?')].every((x, _, a) => x === a[0]), true);
  GS.e.clave = CLAVE;
  const delGs = aFilaBD(filaHoja(GS, R_V2));
  GS.e.clave = null;
  const conGs = await Sello.verificar(delGs, CLAVE);
  eq('un sello firmado por el .gs (con «Güero» y «TACOS») verifica por omisión y dice «ascii-?»: así se firmó', [conGs.valida, conGs.codificacion], [true, 'ascii-?']);
  eq('  y NO verifica si solo se permite UTF-8: los sellos ya impresos dejarían de valer', (await Sello.verificar(delGs, CLAVE, { codificaciones: ['utf-8'] })).valida, false);

  /* LA PRUEBA DE ORO — solo si se piden filas reales por el entorno. Nunca imprime la clave ni el contenido. */
  const claveReal = process.env.AL3D_SELLO_CLAVE_REAL, rutaFilas = process.env.AL3D_SELLO_FILAS_REALES;
  if (!claveReal || !rutaFilas) {
    console.log('  · sin AL3D_SELLO_CLAVE_REAL y AL3D_SELLO_FILAS_REALES no se prueba con la clave real (más de 64 bytes) ni con filas reales: eso sigue SIN VERIFICAR contra Apps Script.');
  } else {
    console.log('  -- prueba de oro: filas reales de «Autorizaciones» con la clave del entorno (no se imprime ni una ni otras)');
    const ruta = resolve(rutaFilas);
    if (!relative(RAIZ, ruta).startsWith('..') && !relative(RAIZ, ruta).includes(':')) {
      console.log('  OJO: ese archivo está DENTRO del repositorio, y el sitio publica el árbol entero. Sácalo de ahí y no lo subas.');
    }
    if (!claveReal.trim()) mal('AL3D_SELLO_CLAVE_REAL está vacía');
    let filas = [];
    /* Sin e.message: el de JSON.parse cita un pedazo del archivo, y ese archivo tiene datos de clientes. */
    try { filas = JSON.parse(readFileSync(ruta, 'utf8')); } catch (e) { mal('no pude leer ni entender el archivo de filas reales (' + (e && e.name) + ')'); }
    if (!Array.isArray(filas) || !filas.length || !filas.every(f => Array.isArray(f) && f.length >= 17)) {
      mal('el archivo tiene que ser un arreglo de filas de 17 columnas, como getValues() de «Autorizaciones»');
    } else {
      const cuenta = { 'utf-8': 0, 'ascii-?': 0, ascii: 0 }, invalidas = [];
      for (let i = 0; i < filas.length; i++) {
        let res;
        try { res = await Sello.verificar(aFilaBD(filas[i].map(x => (x === null ? '' : x))), claveReal); }
        catch (e) { invalidas.push([i + 1, e.codigo || e.message]); continue; }
        if (res.valida) cuenta[res.codificacion]++; else invalidas.push([i + 1, res.motivo]);
      }
      console.log('  · ' + filas.length + ' filas: ' + (cuenta['utf-8'] + cuenta['ascii-?'] + cuenta.ascii) + ' cuadran (' + cuenta.ascii + ' son todo ASCII y no distinguen; ' +
                  cuenta['utf-8'] + ' cuadran con UTF-8; ' + cuenta['ascii-?'] + ' con ASCII-?).');
      if (cuenta['ascii-?'] && !cuenta['utf-8']) console.log('  · VEREDICTO: la hoja real firma con ASCII-? — se CONFIRMA, con filas reales, lo comprobado con los doce vectores.');
      else if (cuenta['utf-8'] && !cuenta['ascii-?']) console.log('  · VEREDICTO: las filas reales solo cuadran con UTF-8 — CONTRADICE lo comprobado con los doce vectores: revisar de dónde salen.');
      else if (cuenta['utf-8'] && cuenta['ascii-?']) console.log('  · VEREDICTO: hay sellos de las dos clases (revisar de dónde salen).');
      else console.log('  · SIN VEREDICTO: ninguna fila con texto no ASCII cuadró (o no hay ninguna).');
      eq('todas las filas reales cuadran con la clave del entorno' + (invalidas.length ? ' — no cuadran (fila: motivo): ' + invalidas.slice(0, 10).map(x => x.join(': ')).join(', ') : ''), invalidas.length, 0);
      if (invalidas.length) {
        /* Diagnóstico: ¿alguna otra codificación las haría cuadrar? Solo imprime nombres de codificación. */
        const alternativas = {
          latin1: s => Buffer.from(s, 'latin1'), utf16le: s => Buffer.from(s, 'utf16le'),
          'latin1-?': s => Uint8Array.from(Array.from({ length: s.length }, (_, i) => (s.charCodeAt(i) < 256 ? s.charCodeAt(i) : 63))),
          'ascii-? por unidad UTF-16': s => Uint8Array.from(Array.from({ length: s.length }, (_, i) => (s.charCodeAt(i) < 128 ? s.charCodeAt(i) : 63))),
        };
        const hallazgos = new Set();
        for (const [n] of invalidas) {
          const f = filas[n - 1].map(x => (x === null ? '' : x));
          let canon;
          try { canon = Sello.canonDe(Sello.registroDeFila(aFilaBD(f))); } catch (_) { continue; }
          for (const [nombre, aB] of Object.entries(alternativas)) {
            if (createHmac('sha256', aB(claveReal)).update(aB(canon)).digest('hex') === String(f[13])) hallazgos.add(nombre);
          }
        }
        console.log('  · las que no cuadran, ¿cuadrarían con otra codificación? ' + (hallazgos.size ? 'SÍ, con: ' + [...hallazgos].join(', ') : 'no con las que conozco'));
      }
    }
  }
}

console.log('\n' + (fallos ? fallos + ' FALLO(S), ' : 'Todo pasa. ') + pasan + ' comprobaciones bien, ' + casos + ' casos comparados contra el .gs (y ' + casosUtf8 + ' de la opción utf-8 contra node:crypto).');
console.log('NOTA: los sellos se firman con ASCII-?, como el Apps Script real (comprobado el 2026-10-10; ver el bloque 5 y pruebas/datos/hmac-apps-script-real.json).');
process.exit(fallos ? 1 : 0);
