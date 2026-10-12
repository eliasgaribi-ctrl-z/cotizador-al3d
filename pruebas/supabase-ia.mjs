/* LA FUNCIÓN IA DE SUPABASE, CONTRA EL .gs DE VERDAD.

   supabase/functions/_shared/ia.js es la lógica pura de la función Edge `ia`: qué se acepta, qué
   se le manda a cada proveedor, qué se contesta con lo que ellos devuelven, a quién le toca qué
   llave y cuándo se acaba el cupo del día. Es una copia —en otro archivo, para otro servidor— de
   lo que hoy hace `rutaIA_` en puente/hoja-apps-script.gs, y una copia que nadie compara es la
   que se separa sin que nadie lo note. Aquí el síntoma sería el peor: el día que la función
   arme un cuerpo distinto, el proveedor contestará 400 a TODAS las cotizaciones con IA, y el
   teléfono no sabe leer eso de otra manera que «rechazó la petición».

   Así que se carga el .gs REAL en un contexto de node, con un Google de mentiras —las
   propiedades del script, el candado, el reloj y la red— que anota lo que el .gs mandaría por
   `UrlFetchApp`, y se le dan al .gs y al módulo las mismas entradas. Se compara la dirección, las
   cabeceras y el cuerpo, byte por byte; lo que contesta el proveedor; los rechazos; el turno de
   las llaves; y el bucle que prueba la siguiente llave. Cuando el .gs truena con una respuesta
   rara del proveedor se dice, y se comprueba que el módulo no.

   Lo que NO se compara contra el .gs es lo que a propósito cambia, y se prueba aparte, con sus
   razones: el día del cupo (México y no GMT, decisión Q-19), que ninguna llave salga jamás en lo
   que se devuelve, y que no se pase de largo cuando no se pudo contar.

   Las llaves son de mentiras y dicen que lo son. No hay red: el «proveedor» es un guion de
   respuestas que se le da por igual al .gs y al módulo. Se corre con pruebas/correr.sh, como
   todas, y no depende de la zona horaria de la máquina. */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as IA from '../supabase/functions/_shared/ia.js';
import * as Asis from '../js/datos/asistente-contexto.js';

let fallos = 0, aciertos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => { console.log('  ✓ ' + m); aciertos++; };
const recorta = (s, n = 400) => { s = String(s); return s.length > n ? s.slice(0, n) + '… (' + s.length + ' caracteres)' : s; };
const igual = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) bien(que); else mal(que + '\n         dio: ' + recorta(a) + '\n         esp: ' + recorta(b));
};
const cierto = (que, v) => (v ? bien(que) : mal(que));
/* Lo que viene del contexto de vm trae otro Object.prototype: se compara por su JSON. */
const plano = x => JSON.parse(JSON.stringify(x));

const leer = ruta => readFileSync(new URL('../' + ruta, import.meta.url), 'utf8');
const GS = leer('puente/hoja-apps-script.gs');
const MX = 'America/Mexico_City';

/* ============================================================================
   LAS LLAVES — de mentiras, y marcadas
   ============================================================================ */
const MARCA = 'clave-falsa-solo-para-pruebas';
const LLAVES = {
  qwen: [1, 2, 3, 4].map(i => MARCA + '-qwen-000' + i),
  deepseek: [1, 2].map(i => MARCA + '-deepseek-000' + i),
  gemini: [1, 2, 3].map(i => MARCA + '-gemini-000' + i),
};
/* Con todo lo que una dirección tiene que codificar: la de Gemini lleva la llave dentro. */
const LLAVE_RARA = MARCA + '+/=&?#% ñ-gemini-rara';
const TODAS_LAS_LLAVES = [...Object.values(LLAVES).flat(), LLAVE_RARA];

/* ============================================================================
   EL PROVEEDOR — un guion de respuestas, igual para el .gs y para el módulo
   Cada entrada es 'ok' (una respuesta buena con la forma de ese proveedor), 'lanza' (la red se
   cae, y el mensaje de la excepción lleva la dirección, como pasa en Deno: con la llave de
   Gemini dentro) o `{codigo, cuerpo}`. Una sola entrada vale para todas las llamadas; una lista
   se gasta en orden y su última entrada se repite.
   ============================================================================ */
const okSegunUrl = url => (url.includes('generativelanguage')
  ? { codigo: 200, cuerpo: { candidates: [{ content: { parts: [{ text: 'listo' }] }, finishReason: 'STOP' }] } }
  : { codigo: 200, cuerpo: { choices: [{ message: { content: 'listo' }, finish_reason: 'stop' }] } });
function respuestaDelGuion(guion, n, url) {
  const g = Array.isArray(guion) ? guion[Math.min(n, guion.length) - 1] : guion;
  if (g === 'lanza') throw new TypeError('error sending request for url (' + url + '): connection refused');
  if (g === undefined || g === 'ok') return okSegunUrl(url);
  return g;
}
const textoDe = cuerpo => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
const R = (codigo, cuerpo) => ({ codigo, cuerpo });

/* ============================================================================
   EL .gs DE VERDAD, EN UN CONTEXTO CON GOOGLE DE MENTIRAS
   ============================================================================ */
const mundo = (() => {
  const estado = { ahora: Date.UTC(2026, 9, 10, 18, 0, 0), ocupado: false, fallaAlEscribir: false, guion: 'ok' };
  const memoria = new Map();
  const props = {
    getProperty: k => (memoria.has(k) ? memoria.get(k) : null),
    setProperty: (k, v) => { if (estado.fallaAlEscribir) throw new Error('PropertiesService: no hay espacio'); memoria.set(k, String(v)); },
    deleteProperty: k => { memoria.delete(k); },
    getProperties: () => Object.fromEntries(memoria),
  };
  const llamadas = [];
  const UrlFetchApp = {
    fetch(url, opts) {
      llamadas.push({ url, opts: plano(opts) });
      const r = respuestaDelGuion(estado.guion, llamadas.length, url);
      return { getResponseCode: () => r.codigo, getContentText: () => textoDe(r.cuerpo) };
    },
  };
  /* El candado del script: si «lo tiene otra ejecución», tryLock contesta que no. */
  const LockService = { getScriptLock: () => ({ tryLock: () => !estado.ocupado, waitLock() {}, releaseLock() {} }) };
  const aBytes = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));   // los bytes de Apps Script van con signo
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (_alg, s) => aBytes(createHash('sha256').update(String(s), 'utf8').digest()),
    base64EncodeWebSafe: bytes => Buffer.from(bytes.map(b => (b + 256) % 256)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    /* Solo lo que rutaIA_ usa: el día con la zona que se le pida. Intl trae la base de zonas de
       la IANA, como el Java de Apps Script. */
    formatDate: (d, zona, patron) => {
      if (patron !== 'yyyyMMdd') throw new Error('formatDate de mentiras: solo conozco yyyyMMdd, no «' + patron + '»');
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(d.getTime()).map(x => [x.type, x.value]));
      return p.year + p.month + p.day;
    },
  };
  const noImplementado = new Proxy({}, { get: () => () => { throw new Error('servicio de Google no disponible en la prueba'); } });
  const ctx = vm.createContext({
    PropertiesService: { getScriptProperties: () => props }, LockService, UrlFetchApp, Utilities,
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
    SpreadsheetApp: noImplementado, ScriptApp: noImplementado,
    MailApp: noImplementado, HtmlService: noImplementado, Logger: noImplementado, console,
    __reloj: () => estado.ahora,
  });
  /* `new Date()` del .gs lee el reloj de la prueba, parado donde ella lo deje. */
  vm.runInContext('Date = class extends Date { constructor(...a) { if (a.length) super(...a); else super(__reloj()); } static now() { return __reloj(); } };', ctx);
  vm.runInContext(GS, ctx);
  const f = nombre => vm.runInContext(nombre, ctx);
  return {
    llamadas, estado,
    /* Todo de cero: propiedades, cuentas del día, llamadas anotadas, guion y candado. */
    reiniciar({ llaves = LLAVES, rotacionTexto = null, guion = 'ok' } = {}) {
      memoria.clear(); llamadas.length = 0;
      estado.guion = guion; estado.ocupado = false; estado.fallaAlEscribir = false;
      memoria.set('IA_KEYS', JSON.stringify(llaves));
      if (rotacionTexto !== null) memoria.set('IA_ROTACION', rotacionTexto);
    },
    reloj: ms => { estado.ahora = ms; },
    poner: (k, v) => { memoria.set(k, String(v)); },
    /* La puerta de verdad: `doPost` con el cuerpo en texto, como lo manda el teléfono. */
    doPost: texto => JSON.parse(f('doPost')({ postData: { contents: texto } }).s),
    rutaIA: (cuerpo, quien) => plano(f('rutaIA_')(cuerpo, quien)),
    iaRespuesta: (prov, model, codigo, txt) => plano(f('iaRespuesta')(prov, model, codigo, txt)),
    iaEstado: () => plano(f('iaEstado')()),
    constante: nombre => plano(f(nombre)),
    propiedad: k => props.getProperty(k),
    propiedades: () => props.getProperties(),
  };
})();

/* ============================================================================
   LOS DOS LADOS DE LA COMPARACIÓN
   ============================================================================ */
/* Lo que el .gs le pasa a UrlFetchApp, visto como lo recibe `fetch`: `contentType` es la cabecera
   Content-Type y `payload` es el cuerpo. Se anotan las llaves de `opts` que se ven para avisar
   si el .gs un día agrega una (followRedirects, timeout…) que este traslado no conoce. */
const OPCIONES_VISTAS = new Set();
const comoFetch = ({ url, opts }) => {
  Object.keys(opts).forEach(k => OPCIONES_VISTAS.add(k));
  return { url, init: { method: String(opts.method).toUpperCase(), headers: { 'Content-Type': opts.contentType, ...(opts.headers || {}) }, body: opts.payload } };
};
const canon = x => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const llaveDe = (url, cabeceras) => {
  const m = /[?&]key=([^&]*)/.exec(url);
  return m ? decodeURIComponent(m[1]) : String((cabeceras || {}).Authorization || '').replace(/^Bearer /, '');
};

/* Lo que sale hacia el teléfono, de todo lo que hace el módulo en esta prueba. Al final se busca
   en ello cualquier llave: ver «NINGUNA LLAVE SALE». */
const alTelefono = [];
const sale = x => { alTelefono.push(JSON.stringify(x)); return x; };

/* Lo que hace el .gs con un cuerpo: rutaIA_, entera. */
function porElGs(cuerpo, { guion = 'ok', llaves = LLAVES, rotacionTexto = null, quien = 't:caso' } = {}) {
  mundo.reiniciar({ llaves, rotacionTexto, guion });
  const respuesta = mundo.rutaIA(cuerpo, quien);
  return { respuesta, llamadas: mundo.llamadas.map(comoFetch) };
}
/* Lo que haría la función Edge con las piezas del módulo, en el orden de rutaIA_ y sin el cupo
   (que es de la base y se prueba aparte). Lo del `rotacion` lo lee quien llama, igual que el .gs
   lo lee de su propiedad: `JSON.parse(texto || '{}') || {}`, y si no se entiende, vacío. */
const leerRotacion = texto => { try { return JSON.parse(texto || '{}') || {}; } catch (_) { return {}; } };
async function porElModulo(cuerpo, { guion = 'ok', llaves = LLAVES, rotacionTexto = null, signal } = {}) {
  const llamadas = [];
  let n = 0;
  const miFetch = async (url, init) => {
    llamadas.push({ url, init });
    const r = respuestaDelGuion(guion, ++n, url);
    return { status: r.codigo, text: async () => textoDe(r.cuerpo) };
  };
  const v = IA.validarPeticion(cuerpo);
  if (!v.ok) return { respuesta: sale(v), llamadas };
  const e = IA.elegirProveedor({ prov: v.peticion.prov, llaves, rotacion: leerRotacion(rotacionTexto) });
  if (!e.ok) return { respuesta: sale(e), llamadas };
  const respuesta = sale(await IA.consultarIA({ peticion: v.peticion, llaves: e.llaves, fetch: miFetch, signal }));
  return { respuesta, llamadas, rotacion: e.rotacion };
}

const primeraDif = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
function diferencias(g, m) {
  const dif = [];
  if (g.llamadas.length !== m.llamadas.length) dif.push('el .gs hizo ' + g.llamadas.length + ' llamada(s) y el módulo ' + m.llamadas.length);
  for (let i = 0; i < Math.min(g.llamadas.length, m.llamadas.length); i++) {
    const a = g.llamadas[i], b = m.llamadas[i];
    if (a.url !== b.url) dif.push('llamada ' + (i + 1) + ': dirección distinta\n           .gs:    ' + recorta(a.url, 200) + '\n           módulo: ' + recorta(b.url, 200));
    if (a.init.method !== b.init.method) dif.push('llamada ' + (i + 1) + ': método ' + a.init.method + ' contra ' + b.init.method);
    if (canon(a.init.headers) !== canon(b.init.headers)) dif.push('llamada ' + (i + 1) + ': cabeceras ' + canon(a.init.headers) + ' contra ' + canon(b.init.headers));
    if (canon(Object.keys(b.init).sort()) !== canon(['body', 'headers', 'method'])) dif.push('llamada ' + (i + 1) + ': `opciones` trae ' + Object.keys(b.init) + ' y no solo method, headers y body');
    if (a.init.body !== b.init.body) {
      const k = primeraDif(a.init.body, b.init.body);
      dif.push('llamada ' + (i + 1) + ': el cuerpo difiere desde el carácter ' + k + '\n           .gs:    …' + recorta(a.init.body.slice(Math.max(0, k - 30), k + 60), 120)
        + '\n           módulo: …' + recorta(b.init.body.slice(Math.max(0, k - 30), k + 60), 120));
    }
  }
  if (JSON.stringify(g.respuesta) !== JSON.stringify(m.respuesta)) {
    dif.push('respuesta distinta\n           .gs:    ' + recorta(JSON.stringify(g.respuesta), 300) + '\n           módulo: ' + recorta(JSON.stringify(m.respuesta), 300));
  }
  return dif;
}
let comparadas = 0;
async function igualAlGs(nombre, cuerpo, opc = {}) {
  const g = porElGs(cuerpo, opc);
  const m = await porElModulo(cuerpo, opc);
  const dif = diferencias(g, m);
  comparadas++;
  if (dif.length) mal(nombre + ' — ' + dif.join('\n         '));
  else {
    const bytes = g.llamadas.reduce((s, l) => s + l.url.length + l.init.body.length, 0);
    bien(nombre + (g.llamadas.length ? ' — ' + g.llamadas.length + ' llamada(s) idéntica(s) a la del .gs (' + bytes + ' caracteres) y la misma respuesta' : ' — el mismo rechazo'));
  }
  return { g, m };
}

/* ============================================================================
   LAS ENTRADAS
   ============================================================================ */
const B64 = Buffer.from('imagen de mentiras, solo para probar el armado de la petición').toString('base64');
const PROMPT = 'Lee el plano y devuelve SOLO un JSON con las partidas.';
/* El cuerpo como lo manda el teléfono: con la ruta y el token, que el .gs ignora. */
const cot = (prov, model, extra = {}) => ({ ruta: 'ia', token: 'dispositivo-de-mentiras-' + 'x'.repeat(20), modo: 'cotizar', prov, model, prompt: PROMPT, imagen: { b64: B64, mime: 'image/jpeg' }, ...extra });
const chat = (prov, model, extra = {}) => ({ ruta: 'ia', token: 'dispositivo-de-mentiras-' + 'x'.repeat(20), modo: 'chat', prov, model, sistema: 'Eres el asistente de AL3D.', pregunta: '¿Cuánto vendimos hoy?', mensajes: [], ...extra });
const hilo = n => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'mensaje número ' + (i + 1) + ' del hilo, con acento y ñ' }));
const MODELOS = Object.entries(IA.IA_MODELOS).flatMap(([prov, ms]) => ms.map(model => [prov, model]));

/* ============================================================================
   0 · EL MÓDULO ES PURO
   ============================================================================ */
console.log('\nEL MÓDULO ES PURO — corre en Deno y en node, y no sabe dónde está');
{
  const fuente = leer('supabase/functions/_shared/ia.js');
  /* Sin comentarios: los de este repo nombran justo lo que se prohíbe. */
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const prohibido = [
    ['process', /\bprocess\b/], ['Buffer', /\bBuffer\b/], ['require', /\brequire\b/], ['import', /^\s*import\b/m],
    ['node:', /node:/], ['Deno', /\bDeno\b/], ['__dirname', /__(dir|file)name/], ['un fetch global', /(?<![\w.])fetch\s*\(/],
    ['Date.now', /Date\.now/], ['new Date', /new Date\b/], ['Math.random', /Math\.random/], ['crypto', /\bcrypto\b/],
    ['temporizadores', /setTimeout|setInterval/], ['console', /\bconsole\b/], ['el entorno', /\.env\b|localStorage|sessionStorage/],
    ['la zona de la máquina', /\.(getDate|getDay|getHours|getMonth|getFullYear|getTimezoneOffset|toLocale\w*String)\b/],
  ];
  for (const [nombre, re] of prohibido) cierto('no usa ' + nombre, !re.test(codigo));
  cierto('no importa nada: es un módulo solo, sin dependencias', !/^\s*import\b/m.test(codigo) && !/\bimport\s*\(/.test(codigo));

  /* Y se corre de verdad en un contexto sin nada de node. */
  const nombres = [...fuente.matchAll(/^export (?:async )?(?:function|const) ([\w$]+)/gm)].map(m => m[1]);
  const guion = fuente.replace(/^export (?=(?:async )?(?:function|const) )/gm, '');
  const vacio = vm.createContext({});
  const API = vm.runInContext('(function () {\n' + guion + '\nreturn { ' + nombres.join(', ') + ' };\n})()', vacio);
  igual('en un contexto SIN process, Buffer, require, fetch ni temporizadores',
        vm.runInContext('[typeof process, typeof Buffer, typeof require, typeof fetch, typeof setTimeout, typeof URL, typeof TextEncoder]', vacio),
        ['undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined']);
  igual('  exporta lo mismo que el módulo importado', Object.keys(API).sort(), Object.keys(IA).sort());
  const c = cot('qwen', 'qwen3.7-flash');
  igual('  y valida igual', plano(API.validarPeticion(c)), plano(IA.validarPeticion(c)));
  const v = IA.validarPeticion(cot('gemini', 'gemini-3.6-flash'));
  igual('  y arma igual la llamada a Gemini', plano(API.construirLlamada('gemini', v.peticion, LLAVES.gemini[0])), plano(IA.construirLlamada('gemini', v.peticion, LLAVES.gemini[0])));
  igual('  y cuenta el día igual, con una Date que viene de otro mundo', [API.cuotaDelDia(new Date(Date.UTC(2026, 9, 11, 0, 30)), MX), API.cuotaDelDia(Date.UTC(2026, 9, 11, 6, 0))], ['2026-10-10', '2026-10-11']);
  igual('  y decide el cupo igual', plano(API.decidirCuota(201)), plano(IA.decidirCuota(201)));
  const consultada = await API.consultarIA({ peticion: v.peticion, llaves: [LLAVES.gemini[0]], fetch: async () => ({ status: 200, text: async () => textoDe(okSegunUrl('generativelanguage').cuerpo) }) });
  igual('  y corre el bucle de llaves con un fetch inyectado', plano(consultada), { ok: true, texto: 'listo', prov: 'gemini', model: 'gemini-3.6-flash' });
}

/* ============================================================================
   1 · LAS LISTAS — tres copias, una verdad
   ============================================================================ */
console.log('\nLAS LISTAS — el .gs, el módulo y el cotizador piden lo mismo');
{
  /* `const NOMBRE=…;` de un guion clásico: el valor, contando llaves aunque ocupe varias líneas. */
  const literalDe = (texto, nombre) => {
    const m = new RegExp('const ' + nombre + '\\s*=\\s*').exec(texto);
    if (!m) throw new Error('no está const ' + nombre);
    const ini = m.index + m[0].length, abre = texto[ini];
    if (abre !== '{' && abre !== '[') return Function('return (' + /^[^;]*/.exec(texto.slice(ini))[0] + ')')();
    const cierra = abre === '{' ? '}' : ']';
    let prof = 0;
    for (let i = ini; i < texto.length; i++) {
      const c = texto[i];
      if (c === '\'' || c === '"') { for (i++; texto[i] !== c; i++) if (texto[i] === '\\') i++; continue; }
      if (c === abre) prof++;
      if (c === cierra && --prof === 0) return Function('return (' + texto.slice(ini, i + 1) + ')')();
    }
    throw new Error('const ' + nombre + ' no cierra');
  };
  const cliente = leer('js/cotizador/ia.js');
  igual('los proveedores, en el orden del .gs', plano(IA.IA_PROVS), mundo.constante('IA_PROVS'));
  igual('  y en el del cotizador', plano(IA.IA_PROVS), literalDe(cliente, 'AI_PROVS'));
  igual('  y en el del asistente', plano(IA.IA_PROVS), plano(Asis.PROVEEDORES));
  igual('los nombres', plano(IA.IA_NOMBRE), mundo.constante('IA_NOMBRE'));
  igual('  y los del cotizador y del asistente', [literalDe(cliente, 'AI_NOMBRE'), plano(Asis.PROVEEDOR_NOMBRE)], [plano(IA.IA_NOMBRE), plano(IA.IA_NOMBRE)]);
  igual('las direcciones de Qwen y DeepSeek (dashscope-intl, la región internacional)', plano(IA.IA_URLS), mundo.constante('IA_URLS'));
  igual('la lista blanca de modelos', plano(IA.IA_MODELOS), mundo.constante('IA_MODELOS'));
  igual('los tipos de archivo', plano(IA.IA_MIMES), mundo.constante('IA_MIMES'));
  igual('el tope diario por persona', IA.IA_LIMITE_DIARIO, mundo.constante('IA_LIMITE_DIARIO'));
  igual('el tope del cuerpo (15 MB)', IA.IA_MAX_CUERPO, mundo.constante('IA_MAX_CUERPO'));
  igual('la espera del cotizador: la que tiene el teléfono (100 s)', IA.IA_ESPERA_MS, Number(/const AI_TIMEOUT=(\d+)/.exec(cliente)[1]));
  igual('  y la del asistente (60 s), que es más corta', IA.IA_ESPERA_CHAT_MS, Number(/const TIMEOUT = (\d+)/.exec(leer('js/nucleo/asistente.js'))[1]));
  /* Cada modelo que el teléfono pide tiene que estar en la lista blanca: uno que no, es un
     intento gastado en un «no». */
  const defectos = literalDe(cliente, 'AI_DEFAULTS'), respaldo = literalDe(cliente, 'AI_RESPALDO');
  const pide = IA.IA_PROVS.flatMap(p => [defectos[p], ...(respaldo[p] || []), Asis.MODELO_DEFECTO[p]].filter(Boolean).map(m => [p, m]));
  igual('cada modelo que el cotizador y el asistente piden, el módulo lo acepta', pide.filter(([p, m]) => !IA.IA_MODELOS[p].includes(m)), []);
  igual('  y el cotizador no deja sin pedir ninguno de los de la lista', IA.IA_PROVS.flatMap(p => IA.IA_MODELOS[p].filter(m => ![defectos[p], ...(respaldo[p] || [])].includes(m))), []);
  const congeladas = [IA.IA_PROVS, IA.IA_NOMBRE, IA.IA_URLS, IA.IA_MODELOS, IA.IA_MODELOS.qwen, IA.IA_MIMES];
  cierto('las listas están congeladas: nadie de afuera puede ampliar la lista blanca', congeladas.every(Object.isFrozen));
}

/* ============================================================================
   2 · PETICIÓN POR PETICIÓN — la dirección, las cabeceras y el cuerpo, byte por byte
   ============================================================================ */
console.log('\nPETICIÓN POR PETICIÓN — lo que el .gs le manda al proveedor y lo que arma el módulo');
{
  const antes = comparadas;
  /* Cada proveedor con cada uno de sus modelos: con imagen (los tres formatos), sin pedir JSON, y
     como chat —sin imagen, con y sin historial—. */
  for (const [prov, model] of MODELOS) {
    const et = prov + ' · ' + model;
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) await igualAlGs(et + ' · cotizar con ' + mime, cot(prov, model, { imagen: { b64: B64, mime } }));
    await igualAlGs(et + ' · cotizar sin pedir JSON (sinJson)', cot(prov, model, { sinJson: true }));
    await igualAlGs(et + ' · chat sin historial', chat(prov, model));
    await igualAlGs(et + ' · chat con historial de 3', chat(prov, model, { mensajes: hilo(3) }));
  }
  for (const model of IA.IA_MODELOS.gemini) await igualAlGs('gemini · ' + model + ' · cotizar un PDF', cot('gemini', model, { imagen: { b64: B64, mime: 'application/pdf' } }));

  console.log('  — los parámetros extremos —');
  const ancho = n => 'palabra '.repeat(Math.ceil(n / 8)).slice(0, n);
  await igualAlGs('un prompt de exactamente 30 000 caracteres', cot('qwen', 'qwen3.7-flash', { prompt: ancho(30000) }));
  await igualAlGs('chat con todos los topes llenos (40 000 + 4 000 + 20 mensajes de 8 000)', chat('deepseek', 'deepseek-flash',
    { sistema: ancho(40000), pregunta: ancho(4000), mensajes: Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: ancho(8000) })) }));
  await igualAlGs('chat pasado de los topes: se recorta en silencio (40 001, 4 001, 25 mensajes de 8 001)', chat('gemini', 'gemini-3.1-flash-lite',
    { sistema: ancho(40001), pregunta: ancho(4001), mensajes: Array.from({ length: 25 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: ancho(8001) + i })) }));
  await igualAlGs('un hilo de 100 mensajes: viajan los últimos 20', chat('qwen', 'qwen3.6-flash', { mensajes: hilo(100) }));
  await igualAlGs('acentos, ñ, emoji y secuencias con unión (ZWJ)', cot('qwen', 'qwen3.7-flash', { prompt: 'Cotiza «LETRAS» — niño, canción, ¿cuánto? 😀 👩‍🔧 🇲🇽 ñandú ü' }));
  await igualAlGs('comillas, barras, saltos, tabuladores, U+2028/U+2029 y un carácter nulo', chat('gemini', 'gemini-3.6-flash',
    { sistema: 'dice "hola" \\ y \'adiós\'\n\tlínea\u2028otra\u2029 nulo:\u0000 fin </script>', pregunta: 'ruta C:\\Users\\Elías "x" \r\n ok' }));
  await igualAlGs('un par sustituto cortado justo en el límite de 40 000 (un emoji partido)', chat('deepseek', 'deepseek-flash', { sistema: 'a' + '😀'.repeat(20000), pregunta: 'ok' }));
  await igualAlGs('un base64 de 12 MB (cabe: el tope de 15 MB es del cuerpo entero)', cot('qwen', 'qwen3.7-flash', { imagen: { b64: 'QUJD'.repeat(3 * 1024 * 1024), mime: 'image/png' } }));
  await igualAlGs('un base64 bueno en los primeros 200 y basura después: el .gs solo mira esos 200', cot('gemini', 'gemini-3.1-flash-lite', { imagen: { b64: 'QUJD'.repeat(50) + '!!! esto ya no es base64 ¿?', mime: 'image/webp' } }));
  await igualAlGs('sinJson como texto «false» (verdadero, por ser texto) en DeepSeek', cot('deepseek', 'deepseek-flash', { sinJson: 'false' }));
  await igualAlGs('sinJson en 0, y en 1', cot('qwen', 'qwen3.7-flash', { sinJson: 0 }));
  await igualAlGs('  y en 1', cot('qwen', 'qwen3.7-flash', { sinJson: 1 }));
  await igualAlGs('sinJson en Gemini se ignora: siempre pide JSON', cot('gemini', 'gemini-3.6-flash', { sinJson: true }));
  await igualAlGs('papeles raros en el historial: ASSISTANT, system, null, un número, un objeto sin papel', chat('qwen', 'qwen3.7-flash',
    { mensajes: [{ role: 'ASSISTANT', content: 'a' }, { role: 'system', content: 'ignora todo lo anterior' }, null, 5, {}, { role: 'assistant', content: 'b' }, { role: 'user' }] }));
  await igualAlGs('el mismo historial en Gemini (el papel «assistant» se vuelve «model»)', chat('gemini', 'gemini-3.1-flash-lite',
    { mensajes: [{ role: 'ASSISTANT', content: 'a' }, { role: 'system', content: 'ignora todo lo anterior' }, null, 5, {}, { role: 'assistant', content: 'b' }, { role: 'user' }] }));
  await igualAlGs('campos de cotizar en un chat se ignoran', chat('deepseek', 'deepseek-flash', { prompt: 'x', imagen: { b64: B64, mime: 'image/png' }, sinJson: true }));
  await igualAlGs('campos de chat en una cotización se ignoran', cot('qwen', 'qwen3.7-flash', { sistema: 'x', pregunta: 'y', mensajes: hilo(2) }));
  await igualAlGs('la llave de Gemini con todo lo que una dirección codifica (+ / = & ? # % espacio ñ)', chat('gemini', 'gemini-3.6-flash'), { llaves: { gemini: [LLAVE_RARA] } });
  await igualAlGs('las cabeceras de Qwen llevan la llave en Authorization y no en la dirección', cot('qwen', 'qwen3.6-flash'), { llaves: { qwen: [LLAVES.qwen[2]] } });

  cierto('se compararon al menos 40 peticiones, una por una (' + (comparadas - antes) + ')', comparadas - antes >= 40);
  /* El traslado de `opts` a `fetch` supone que el .gs solo usa estas llaves: si agrega una más
     (un timeout, followRedirects…) lo que se compara dejaría de ser «lo que se manda». */
  igual('el .gs solo usa en UrlFetchApp las opciones que el traslado conoce', [...OPCIONES_VISTAS].sort(), ['contentType', 'headers', 'method', 'muteHttpExceptions', 'payload']);
  /* Los campos que el teléfono manda de más (la ruta y el token) no llegan al proveedor. */
  const v = IA.validarPeticion(cot('qwen', 'qwen3.7-flash'));
  const llamada = IA.construirLlamada('qwen', v.peticion, LLAVES.qwen[0]);
  cierto('el token del puente del teléfono no viaja al proveedor, en ningún lado', !llamada.opciones.body.includes('dispositivo-de-mentiras') && !JSON.stringify(llamada.opciones.headers).includes('dispositivo-de-mentiras'));

  /* construirLlamada es lo último antes de la red: aunque alguien se salte validarPeticion, no
     arma una llamada con un modelo que cuesta de más ni con algo que no es UNA llave. */
  console.log('  — construirLlamada no se deja engañar —');
  const lanza = f => { try { f(); return null; } catch (e) { return e; } };
  const pet = v.peticion;
  const e1 = lanza(() => IA.construirLlamada('qwen', { ...pet, model: 'qwen-max' }, LLAVES.qwen[0]));
  cierto('un modelo fuera de la lista no se arma, aunque se salte validarPeticion', e1 instanceof RangeError && /qwen-max/.test(e1.message));
  cierto('  ni el modelo de otro proveedor', lanza(() => IA.construirLlamada('qwen', { ...pet, model: 'gemini-3.1-flash-lite' }, LLAVES.qwen[0])) instanceof RangeError);
  cierto('  ni una petición sin modelo', lanza(() => IA.construirLlamada('qwen', undefined, LLAVES.qwen[0])) instanceof RangeError);
  cierto('un proveedor que no existe tampoco', lanza(() => IA.construirLlamada('openai', pet, LLAVES.qwen[0])) instanceof RangeError);
  for (const [nombre, malo] of [['una lista de llaves', LLAVES.qwen], ['el objeto de llaves', LLAVES], ['un texto vacío', ''], ['indefinida', undefined], ['un número', 12345678901]]) {
    const e = lanza(() => IA.construirLlamada('qwen', pet, malo));
    cierto('la llave es UNA cadena, y con ' + nombre + ' lanza un error que no repite ninguna llave',
           e instanceof TypeError && !TODAS_LAS_LLAVES.some(k => e.message.includes(k)));
  }
}

/* ============================================================================
   3 · LOS RECHAZOS — mismas frases, mismo orden
   ============================================================================ */
console.log('\nLOS RECHAZOS — lo que el .gs no deja pasar, el módulo tampoco, con las mismas palabras');
{
  const antes = comparadas;
  const rechazos = [];
  const R_ = (nombre, cuerpo, mensaje) => rechazos.push({ nombre, cuerpo, mensaje });
  const base = () => cot('qwen', 'qwen3.7-flash');
  /* El proveedor */
  R_('sin cuerpo (null)', null, 'Ese proveedor de IA no existe.');
  R_('cuerpo vacío', {}, 'Ese proveedor de IA no existe.');
  R_('proveedor que no existe', { ...base(), prov: 'openai' }, 'Ese proveedor de IA no existe.');
  R_('proveedor en mayúsculas', { ...base(), prov: 'QWEN' }, 'Ese proveedor de IA no existe.');
  R_('proveedor con un espacio', { ...base(), prov: ' qwen' }, 'Ese proveedor de IA no existe.');
  R_('proveedor «constructor» (que NO sea llave de la lista)', { ...base(), prov: 'constructor' }, 'Ese proveedor de IA no existe.');
  R_('proveedor «__proto__»', { ...base(), prov: '__proto__' }, 'Ese proveedor de IA no existe.');
  R_('proveedor «toString»', { ...base(), prov: 'toString' }, 'Ese proveedor de IA no existe.');
  R_('proveedor numérico', { ...base(), prov: 123 }, 'Ese proveedor de IA no existe.');
  R_('proveedor ausente', (({ prov, ...resto }) => resto)(base()), 'Ese proveedor de IA no existe.');
  /* El modelo */
  R_('modelo ausente', (({ model, ...resto }) => resto)(base()), 'Qwen: el modelo «» no está en la lista de la hoja.');
  R_('modelo de otro proveedor', { ...base(), model: 'gemini-3.1-flash-lite' }, 'Qwen: el modelo «gemini-3.1-flash-lite» no está en la lista de la hoja.');
  R_('modelo con un espacio al final', { ...base(), model: 'qwen3.7-flash ' }, 'Qwen: el modelo «qwen3.7-flash » no está en la lista de la hoja.');
  R_('modelo en mayúsculas', { ...base(), model: 'QWEN3.7-FLASH' }, 'Qwen: el modelo «QWEN3.7-FLASH» no está en la lista de la hoja.');
  R_('un modelo caro que no está en la lista', { ...base(), model: 'qwen-max' }, 'Qwen: el modelo «qwen-max» no está en la lista de la hoja.');
  R_('modelo vacío', { ...base(), model: '' }, 'Qwen: el modelo «» no está en la lista de la hoja.');
  R_('modelo de DeepSeek pedido a Gemini', { ...base(), prov: 'gemini', model: 'deepseek-flash' }, 'Gemini: el modelo «deepseek-flash» no está en la lista de la hoja.');
  /* La cotización */
  R_('sin prompt', (({ prompt, ...resto }) => resto)(base()), 'Falta la instrucción para la IA.');
  R_('prompt vacío', { ...base(), prompt: '' }, 'Falta la instrucción para la IA.');
  R_('prompt de 30 001 caracteres', { ...base(), prompt: 'a'.repeat(30001) }, 'Falta la instrucción para la IA.');
  R_('prompt en cero (falso en JavaScript)', { ...base(), prompt: 0 }, 'Falta la instrucción para la IA.');
  R_('sin imagen', (({ imagen, ...resto }) => resto)(base()), 'Falta el archivo que se va a analizar.');
  R_('imagen sin base64', { ...base(), imagen: { mime: 'image/png' } }, 'Falta el archivo que se va a analizar.');
  R_('base64 con un espacio en los primeros 200', { ...base(), imagen: { b64: 'QUJD QUJD', mime: 'image/png' } }, 'Falta el archivo que se va a analizar.');
  R_('base64 con un carácter inválido en la posición 100', { ...base(), imagen: { b64: 'A'.repeat(100) + '*' + 'A'.repeat(50), mime: 'image/png' } }, 'Falta el archivo que se va a analizar.');
  R_('base64 «seguro para direcciones» (- y _): no es el alfabeto', { ...base(), imagen: { b64: 'QUJD-_QUJD', mime: 'image/png' } }, 'Falta el archivo que se va a analizar.');
  R_('sin tipo de archivo', { ...base(), imagen: { b64: B64 } }, 'Solo se analizan JPG, PNG, WEBP o PDF.');
  R_('tipo GIF', { ...base(), imagen: { b64: B64, mime: 'image/gif' } }, 'Solo se analizan JPG, PNG, WEBP o PDF.');
  R_('tipo en mayúsculas', { ...base(), imagen: { b64: B64, mime: 'IMAGE/JPEG' } }, 'Solo se analizan JPG, PNG, WEBP o PDF.');
  R_('tipo con un espacio al final', { ...base(), imagen: { b64: B64, mime: 'image/jpeg ' } }, 'Solo se analizan JPG, PNG, WEBP o PDF.');
  R_('un PDF a Qwen: solo Gemini los lee', { ...base(), imagen: { b64: B64, mime: 'application/pdf' } }, 'Solo Gemini lee PDF.');
  R_('un PDF a DeepSeek', cot('deepseek', 'deepseek-flash', { imagen: { b64: B64, mime: 'application/pdf' } }), 'Solo Gemini lee PDF.');
  R_('modo «CHAT» en mayúsculas es una cotización, y le falta el prompt', chat('qwen', 'qwen3.7-flash', { modo: 'CHAT' }), 'Falta la instrucción para la IA.');
  R_('modo desconocido: también es una cotización', chat('qwen', 'qwen3.7-flash', { modo: 'conversar' }), 'Falta la instrucción para la IA.');
  /* El chat */
  R_('chat sin pregunta', (({ pregunta, ...resto }) => resto)(chat('qwen', 'qwen3.7-flash')), 'Falta la pregunta.');
  R_('chat con pregunta vacía', chat('qwen', 'qwen3.7-flash', { pregunta: '' }), 'Falta la pregunta.');
  R_('chat con pregunta nula', chat('gemini', 'gemini-3.6-flash', { pregunta: null }), 'Falta la pregunta.');
  for (const r of rechazos) {
    const { g } = await igualAlGs('rechazo · ' + r.nombre, r.cuerpo);
    igual('  y dice «' + r.mensaje + '»', g.respuesta, { ok: false, codigo: 'DATO_INVALIDO', mensaje: r.mensaje });
    if (g.llamadas.length) mal('  el .gs llamó al proveedor con algo que debía rechazar');
  }
  cierto('se compararon al menos 25 casos de borde, cada uno con su frase (' + rechazos.length + ')', rechazos.length >= 25);

  console.log('  — lo que el .gs deja pasar, y el módulo también (rarezas heredadas de las coerciones de JavaScript) —');
  await igualAlGs('proveedor dentro de un arreglo: String([\'qwen\']) es «qwen»', { ...base(), prov: ['qwen'] });
  await igualAlGs('modelo dentro de un arreglo', { ...base(), model: ['qwen3.7-flash'] });
  await igualAlGs('prompt de solo espacios (no se recorta)', { ...base(), prompt: '     ' });
  await igualAlGs('prompt numérico: es el texto del número', { ...base(), prompt: 12345 });
  await igualAlGs('prompt que es un objeto: «[object Object]»', cot('deepseek', 'deepseek-flash', { prompt: { a: 1 } }));
  await igualAlGs('chat con pregunta de solo espacios (no se recorta)', chat('qwen', 'qwen3.7-flash', { pregunta: '   ' }));
  await igualAlGs('chat con pregunta de 4 001 caracteres: se recorta, no se rechaza', chat('gemini', 'gemini-3.1-flash-lite', { pregunta: 'p'.repeat(4001) }));
  await igualAlGs('chat con un historial que no es arreglo: se ignora', chat('qwen', 'qwen3.7-flash', { mensajes: { 0: { role: 'user', content: 'x' }, length: 1 } }));
  await igualAlGs('chat con un historial que es un texto: se ignora', chat('deepseek', 'deepseek-flash', { mensajes: 'hola' }));
  await igualAlGs('un PDF en modo chat: el tipo de archivo ni se mira', chat('qwen', 'qwen3.7-flash', { imagen: { b64: B64, mime: 'application/pdf' } }));
  await igualAlGs('chat sin sistema: viaja vacío', (({ sistema, ...resto }) => resto)(chat('deepseek', 'deepseek-flash')));
  await igualAlGs('cotizar con el tipo «image/webp» a DeepSeek', cot('deepseek', 'deepseek-flash', { imagen: { b64: B64, mime: 'image/webp' } }));
  cierto('en total se compararon ' + comparadas + ' entradas contra el .gs', comparadas >= 65);
}

/* ============================================================================
   LA LLAVE QUE FALTA — SIN_LLAVE, y sin gastar cupo
   ============================================================================ */
console.log('\nSIN LLAVE — el .gs lo dice así, y no cuenta la consulta');
{
  for (const [nombre, llaves] of [
    ['ningún proveedor tiene llave', {}],
    ['solo Gemini tiene llave y se le pide a Qwen', { gemini: LLAVES.gemini }],
    ['las llaves son demasiado cortas (menos de 10 caracteres)', { qwen: ['corta', 'tambien-9'] }],
    ['la lista de llaves no es una lista', { qwen: 'clave-falsa-solo-para-pruebas-sin-lista' }],
    ['la lista trae cosas que no son texto', { qwen: [null, 5, { a: 1 }, ['x'.repeat(20)]] }],
    ['la lista está vacía', { qwen: [] }],
  ]) {
    const { g } = await igualAlGs(nombre, cot('qwen', 'qwen3.7-flash'), { llaves });
    igual('  codigo SIN_LLAVE, no transitorio y con el proveedor', [g.respuesta.codigo, g.respuesta.transitorio, g.respuesta.prov], ['SIN_LLAVE', false, 'qwen']);
    igual('  y no gastó ni un lugar del cupo del día', Object.keys(mundo.propiedades()).filter(k => k.startsWith('IA_CUOTA_')), []);
  }
  /* El otro lado: la lista de llaves que acepta el módulo es la misma que la del .gs. */
  const mezcla = { qwen: ['corta', LLAVES.qwen[0], 7, null, LLAVES.qwen[1]], deepseek: [], gemini: 'no-es-una-lista-aunque-sea-larga' };
  mundo.reiniciar({ llaves: mezcla });
  igual('proveedoresConLlave es lo que el .gs contesta en /salud (`ia`)', IA.proveedoresConLlave(mezcla), mundo.iaEstado());
  igual('  con todas las llaves', IA.proveedoresConLlave(LLAVES), { qwen: true, deepseek: true, gemini: true });
  igual('  con ninguna', IA.proveedoresConLlave({}), { qwen: false, deepseek: false, gemini: false });
  igual('  y sin nada (null o indefinido) no truena', [IA.proveedoresConLlave(null), IA.proveedoresConLlave(undefined)], [{ qwen: false, deepseek: false, gemini: false }, { qwen: false, deepseek: false, gemini: false }]);
  cierto('  y no trae llaves: solo sí o no', Object.values(IA.proveedoresConLlave(LLAVES)).every(x => typeof x === 'boolean'));
}

/* ============================================================================
   4 · LA RESPUESTA DEL PROVEEDOR — los mismos códigos, los mismos textos
   ============================================================================ */
console.log('\nLA RESPUESTA DEL PROVEEDOR — lo que contestó, en el idioma que el teléfono ya lee');
{
  const bodyOpenAI = (content, fin = 'stop') => ({ choices: [{ message: { content }, finish_reason: fin }] });
  const bodyGemini = (partes, fin = 'STOP', extra = {}) => ({ candidates: [{ content: { parts: partes }, finishReason: fin }], ...extra });
  const casos = [
    /* Lo que sí contesta */
    ['una respuesta buena, con espacios alrededor', 200, bodyOpenAI('  {"partidas":[]}  ')],
    ['una buena en la forma de Gemini, en dos partes', 200, bodyGemini([{ text: 'Hola ' }, { text: 'mundo\n' }])],
    ['Gemini con MAX_TOKENS pero con texto: se contesta lo que hay', 200, bodyGemini([{ text: '{"partidas":[{"desc":"x"' }], 'MAX_TOKENS')],
    ['un vacío con `finish_reason: length`', 200, bodyOpenAI(null, 'length')],
    ['un vacío con `finish_reason: content_filter`', 200, bodyOpenAI('', 'content_filter')],
    ['un vacío sin razón: un hipo, vale reintentar', 200, bodyOpenAI('')],
    ['sin `choices`', 200, {}],
    ['`choices` vacío', 200, { choices: [] }],
    ['solo espacios', 200, bodyOpenAI('   \n  ')],
    ['Gemini bloqueó la petición por seguridad (promptFeedback)', 200, { promptFeedback: { blockReason: 'SAFETY' } }],
    ['Gemini bloqueó la imagen (finishReason IMAGE_SAFETY, sin contenido)', 200, { candidates: [{ finishReason: 'IMAGE_SAFETY' }] }],
    ['Gemini: RECITATION', 200, { candidates: [{ finishReason: 'RECITATION', content: { parts: [] } }] }],
    ['Gemini: PROHIBITED_CONTENT en promptFeedback', 200, { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' }, candidates: [] }],
    ['Gemini: MAX_TOKENS sin texto', 200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { role: 'model' } }] }],
    ['Gemini sin candidatos y sin motivo', 200, { candidates: [] }],
    ['Gemini con las partes vacías', 200, bodyGemini([])],
    ['Gemini con una parte sin texto (una llamada a función)', 200, bodyGemini([{ functionCall: { name: 'x' } }])],
    /* Los fallos del proveedor */
    ['429 de Qwen (código en texto, que no cuenta)', 429, { error: { message: 'Requests rate limit exceeded, please try again later.', code: 'rate_limit' } }],
    ['429 de Gemini', 429, { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }],
    ['503 de Gemini', 503, { error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } }],
    ['500 con una página HTML de un intermediario', 500, '<html><body><h1>Internal   Server Error</h1></body></html>'],
    ['502 con una página larga: se corta en 140', 502, '<html>' + 'Bad Gateway '.repeat(40) + '</html>'],
    ['408', 408, { error: { message: 'Request timeout' } }],
    ['401 de DeepSeek', 401, { error: { message: 'Authentication Fails, Your api key: ****abcd is invalid', type: 'authentication_error', param: null, code: 'invalid_request_error' } }],
    ['403 de Qwen', 403, { error: { message: 'Access denied.', code: 'AccessDenied' } }],
    ['402 de DeepSeek (sin saldo)', 402, { error: { message: 'Insufficient Balance', type: 'unknown_error' } }],
    ['404 de Gemini: el modelo', 404, { error: { code: 404, message: 'models/gemini-x is not found for API version v1beta', status: 'NOT_FOUND' } }],
    ['413: el archivo pesa demasiado', 413, 'Payload Too Large'],
    ['400 de Gemini: llave inválida', 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }],
    ['400 de Qwen por response_format con imagen', 400, { error: { message: "<400> InternalError.Algo.InvalidParameter: 'response_format' is not supported with image input" } }],
    ['un 200 con un error adentro (code 500)', 200, { error: { code: 500, message: 'internal' } }],
    ['un 200 con un error adentro, sin code', 200, { error: { message: 'boom' } }],
    ['el error es un texto', 400, { error: 'bad request' }],
    ['el error trae `msg` en vez de `message`', 400, { error: { msg: 'formato inválido' } }],
    ['el mensaje viene suelto, fuera de `error`', 401, { message: 'Unauthorized' }],
    ['un error con saltos de línea y espacios de más', 400, { error: { message: 'línea uno\n   línea   dos\t\ttres' } }],
    ['un mensaje de 500 caracteres', 400, { error: { message: 'x'.repeat(500) } }],
    ['`error` vacío con el mensaje suelto', 400, { error: '', message: 'el de afuera' }],
    ['`code` numérico menor a 100: no cuenta', 400, { error: { code: 42, message: 'raro' } }],
    ['una redirección que nadie siguió (301)', 301, ''],
    /* Los bordes de «2xx»: un cuerpo que parece bueno solo cuenta como éxito entre 200 y 299. */
    ['199 con un cuerpo que parece bueno: no es un éxito', 199, bodyOpenAI('hola')],
    ['200 con un cuerpo bueno', 200, bodyOpenAI('hola')],
    ['299 con un cuerpo bueno', 299, bodyOpenAI('hola')],
    ['300 con un cuerpo que parece bueno: no es un éxito', 300, bodyOpenAI('hola')],
    ['301 con un cuerpo de Gemini que parece bueno', 301, bodyGemini([{ text: 'hola' }])],
    ['cuerpo vacío con un 500', 500, ''],
    ['cuerpo vacío con un 200', 200, ''],
    ['JSON roto en un 200', 200, '{"choices":[{"message":{"content":"par'],
    ['JSON roto en un 502', 502, '{"error": {"mess'],
    ['un JSON que es `null`', 200, 'null'],
    ['un JSON que es un número', 200, '42'],
    ['un JSON que es un arreglo', 400, '[1,2,3]'],
    ['texto plano en un 400', 400, 'Bad Request'],
    ['solo espacios en un 503', 503, '   \n  '],
  ];
  let n = 0;
  for (const [nombre, status, cuerpo] of casos) {
    const txt = textoDe(cuerpo), malos = [];
    for (const prov of IA.IA_PROVS) for (const model of IA.IA_MODELOS[prov]) {
      const gs = JSON.stringify(mundo.iaRespuesta(prov, model, status, txt));
      const yo = JSON.stringify(sale(IA.interpretarRespuesta(prov, { status, texto: txt }, model)));
      n++;
      if (gs !== yo) malos.push(prov + '/' + model + '\n           .gs:    ' + recorta(gs, 260) + '\n           módulo: ' + recorta(yo, 260));
    }
    if (malos.length) mal(nombre + ' — distinto en ' + malos.length + ' de 5\n         ' + malos.join('\n         '));
    else bien(nombre + ' — igual que el .gs para los 3 proveedores y los 5 modelos');
  }
  cierto('se compararon ' + n + ' respuestas simuladas (' + casos.length + ' casos × 5 modelos, cada una en la forma de cada proveedor)', n >= 200);

  /* Lo que debe decir, escrito a mano: no solo «igual que el .gs». */
  console.log('  — lo que dice cada una, a mano —');
  const di = (prov, status, cuerpo, model = IA.IA_MODELOS[prov][0]) => IA.interpretarRespuesta(prov, { status, texto: textoDe(cuerpo) }, model);
  igual('contestó: lo recorta y dice quién', di('qwen', 200, bodyOpenAI('  {"a":1}  ')), { ok: true, texto: '{"a":1}', prov: 'qwen', model: 'qwen3.7-flash' });
  igual('Gemini bloqueó por seguridad: VACIO con la razón tal cual, y no vale reintentar',
        di('gemini', 200, { promptFeedback: { blockReason: 'SAFETY' } }), { ok: false, codigo: 'VACIO', razon: 'SAFETY', transitorio: false, prov: 'gemini', mensaje: 'Gemini respondió vacío' });
  igual('un vacío SIN razón es un hipo, y vale reintentar: transitorio', [di('deepseek', 200, { choices: [{ message: { content: '' } }] }).transitorio, di('qwen', 200, {}).transitorio], [true, true]);
  igual('un vacío CON razón (length, content_filter) no es un hipo: no se reintenta', [di('deepseek', 200, bodyOpenAI(null, 'length')).transitorio, di('qwen', 200, bodyOpenAI('', 'content_filter')).razon], [false, 'content_filter']);
  igual('429: transitorio, y con la frase de siempre', di('gemini', 429, { error: { code: 429, message: 'cuota' } }),
        { ok: false, codigo: 'PROVEEDOR', status: 429, transitorio: true, crudo: 'cuota', prov: 'gemini', mensaje: 'Gemini alcanzó su límite de peticiones — cuota' });
  igual('503: «está saturado» y transitorio', [di('qwen', 503, '').mensaje, di('qwen', 503, '').transitorio], ['Qwen está saturado', true]);
  igual('408 es transitorio, como los 5xx', di('qwen', 408, '').transitorio, true);
  igual('401: la llave no sirve, y no es transitorio', [di('deepseek', 401, { error: { message: 'x' } }).mensaje, di('deepseek', 401, '').transitorio],
        ['la llave de DeepSeek que está en la hoja no es válida o no tiene saldo — x', false]);
  igual('404: nombra el modelo', di('gemini', 404, '', 'gemini-3.6-flash').mensaje, 'Gemini no reconoce el modelo «gemini-3.6-flash»');
  igual('413: el archivo pesa demasiado', di('qwen', 413, '').mensaje, 'el archivo pesa demasiado para Qwen');
  igual('cualquier otro: «rechazó la petición» con su número', di('qwen', 400, '').mensaje, 'Qwen rechazó la petición (HTTP 400)');
  igual('el `code` numérico del error manda sobre el estado HTTP', di('gemini', 200, { error: { code: 429, message: 'x' } }).status, 429);
  igual('lo que dijo el proveedor sin etiquetas HTML ni espacios de más', di('qwen', 502, '<html><h1>Bad   Gateway</h1>\n</html>').crudo, 'Bad Gateway');
  igual('y se corta en 140 caracteres', di('qwen', 400, { error: { message: 'x'.repeat(500) } }).crudo.length, 140);
  igual('un 200 vacío NO es un éxito: «rechazó la petición (HTTP 200)»', di('qwen', 200, '').mensaje, 'Qwen rechazó la petición (HTTP 200)');
  igual('sin `respuesta` no truena', IA.interpretarRespuesta('qwen', undefined, 'qwen3.7-flash').codigo, 'PROVEEDOR');
  igual('el modelo también se lee de `respuesta.model` si no se pasa aparte',
        [IA.interpretarRespuesta('qwen', { status: 200, texto: textoDe(bodyOpenAI('x')), model: 'qwen3.6-flash' }).model, IA.interpretarRespuesta('gemini', { status: 404, texto: '', model: 'gemini-3.6-flash' }).mensaje],
        ['qwen3.6-flash', 'Gemini no reconoce el modelo «gemini-3.6-flash»']);
  let lanzo = null; try { IA.interpretarRespuesta('openai', { status: 200, texto: '{}' }, 'x'); } catch (e) { lanzo = e; }
  cierto('un proveedor que no existe es un error de quien llama: lanza, no inventa una respuesta', lanzo instanceof RangeError);

  /* Las respuestas con una forma que el .gs no espera: ahí el .gs truena y el módulo no. */
  console.log('  — las respuestas con una forma rara: el .gs truena, el módulo sigue —');
  const raras = [
    ['`error.message` es un número', 'qwen', 400, { error: { message: 123 } }],
    ['`error.message` es un objeto', 'deepseek', 500, { error: { message: { detalle: 'x' } } }],
    ['`error.message` es verdadero', 'gemini', 400, { error: { message: true } }],
    ['el contenido es un arreglo de partes', 'qwen', 200, bodyOpenAI([{ type: 'text', text: 'hola' }])],
    ['el contenido es un número', 'deepseek', 200, bodyOpenAI(7)],
    ['`parts` es un objeto y no un arreglo', 'gemini', 200, { candidates: [{ content: { parts: { text: 'x' } } }] }],
    ['una parte nula en `parts`', 'gemini', 200, bodyGemini([null, { text: 'sí hay texto' }])],
    ['`message` suelto que es un número', 'qwen', 401, { message: 5 }],
  ];
  for (const [nombre, prov, status, cuerpo] of raras) {
    const model = IA.IA_MODELOS[prov][0];
    let gsLanza = null, gsDijo = null;
    try { gsDijo = mundo.iaRespuesta(prov, model, status, textoDe(cuerpo)); } catch (e) { gsLanza = e; }
    let yo = null, yoLanza = null;
    try { yo = IA.interpretarRespuesta(prov, { status, texto: textoDe(cuerpo) }, model); } catch (e) { yoLanza = e; }
    if (yoLanza) { mal(nombre + ' — el módulo lanzó: ' + yoLanza.message); continue; }
    const forma = yo && typeof yo.ok === 'boolean' && (yo.ok ? typeof yo.texto === 'string' && yo.texto !== '' : typeof yo.codigo === 'string' && typeof yo.mensaje === 'string');
    if (!forma) { mal(nombre + ' — el módulo no devolvió una respuesta bien formada: ' + recorta(JSON.stringify(yo))); continue; }
    sale(yo);
    if (gsLanza) {
      const causa = (/(\.\w+ is not a function)/.exec(gsLanza.message) || /(Cannot read properties of \w+)/.exec(gsLanza.message) || [, gsLanza.message])[1];
      bien(nombre + ' — el .gs truena (' + causa + ') y el teléfono leería «El puente falló procesando eso»; el módulo contesta ' + (yo.ok ? 'ok «' + yo.texto + '»' : yo.codigo + ': ' + recorta(yo.mensaje, 90)));
    }
    else if (JSON.stringify(gsDijo) === JSON.stringify(yo)) bien(nombre + ' — el .gs lo resuelve igual que el módulo');
    else mal(nombre + ' — el .gs no truena y contesta otra cosa\n           .gs:    ' + recorta(JSON.stringify(gsDijo)) + '\n           módulo: ' + recorta(JSON.stringify(yo)));
  }
}

/* ============================================================================
   5 · EL BUCLE DE LLAVES — la siguiente solo si el problema era de ESA llave
   ============================================================================ */
console.log('\nEL BUCLE DE LLAVES — igual que rutaIA_: qué se prueba con la siguiente llave y qué corta');
{
  const e429 = R(429, { error: { code: 429, message: 'cuota agotada' } });
  const e401 = R(401, { error: { message: 'llave inválida' } });
  const e403 = R(403, { error: { message: 'sin permiso' } });
  const e500 = R(500, { error: { message: 'se cayó' } });
  const e404 = R(404, { error: { message: 'no hay modelo' } });
  const e400 = R(400, { error: { message: 'petición mal hecha' } });
  const e402 = R(402, { error: { message: 'Insufficient Balance' } });
  const eGemini400 = R(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
  const vacio200 = R(200, { choices: [{ message: { content: '' }, finish_reason: 'stop' }] });
  const bloqueo = R(200, { promptFeedback: { blockReason: 'SAFETY' } });
  const escenarios = [
    ['una llave y contesta', 'qwen', ['ok'], 1],
    ['la primera llave agotada (429): pasa a la segunda', 'qwen', [e429, 'ok'], 2],
    ['401 y 403 seguidos: llega a la tercera', 'qwen', [e401, e403, 'ok'], 3],
    ['todas agotadas: devuelve el último error, tras recorrerlas todas', 'qwen', [e429], 4],
    ['un 500 no pasa a la siguiente: otra llave no lo arregla', 'qwen', [e500, 'ok'], 1],
    ['un 404 (el modelo) tampoco', 'qwen', [e404, 'ok'], 1],
    ['un 400 tampoco', 'deepseek', [e400, 'ok'], 1],
    ['un 402 de DeepSeek (sin saldo) tampoco: así lo hace el .gs hoy', 'deepseek', [e402, 'ok'], 1],
    ['una llave de Gemini inválida (400) tampoco: así lo hace el .gs hoy', 'gemini', [eGemini400, 'ok'], 1],
    ['la red falla en la primera: sigue con la segunda', 'qwen', ['lanza', 'ok'], 2],
    ['la red falla en todas', 'qwen', ['lanza'], 4],
    ['la red falla en todas, con Gemini (la dirección lleva la llave)', 'gemini', ['lanza'], 3],
    ['429 y luego la red falla', 'gemini', [e429, 'lanza'], 3],
    ['la red falla y luego un 500', 'qwen', ['lanza', e500, 'ok'], 2],
    ['un 200 vacío corta: otra llave no lo arregla', 'qwen', [vacio200, 'ok'], 1],
    ['Gemini bloquea por seguridad: corta', 'gemini', [bloqueo, 'ok'], 1],
    ['403 en la última llave', 'deepseek', [e403], 2],
    ['429, 429 y la tercera contesta (Gemini)', 'gemini', [e429, e429, 'ok'], 3],
    ['contesta la primera y no se tocan las demás', 'gemini', ['ok', e500], 1],
  ];
  for (const [nombre, prov, guion, llamadasEsperadas] of escenarios) {
    const model = IA.IA_MODELOS[prov][0];
    const cuerpo = chat(prov, model);
    const { g, m } = await igualAlGs(nombre, cuerpo, { guion });
    igual('  y las llaves van en orden: ' + g.llamadas.map(l => (llaveDe(l.url, l.init.headers) || '').slice(-4)).join(' → '),
          m.llamadas.map(l => llaveDe(l.url, l.init.headers)), g.llamadas.map(l => llaveDe(l.url, l.init.headers)));
    igual('  y fueron ' + llamadasEsperadas + ' llamada(s) al proveedor', m.llamadas.length, llamadasEsperadas);
  }

  /* La señal de aborto: el plazo vencido no lo arregla otra llave. */
  console.log('  — el plazo —');
  const peticion = IA.validarPeticion(chat('qwen', 'qwen3.7-flash')).peticion;
  const visto = [];
  const fetchQueVence = ctl => async (url, init) => { visto.push(init.signal); ctl.abort(); throw new DOMException('This operation was aborted', 'AbortError'); };
  const ctl = new AbortController();
  const r = await IA.consultarIA({ peticion, llaves: LLAVES.qwen, fetch: fetchQueVence(ctl), signal: ctl.signal });
  igual('con el plazo vencido deja de probar llaves (una llamada, no cuatro)', visto.length, 1);
  cierto('  la señal llegó a `fetch` tal cual', visto[0] === ctl.signal);
  igual('  y contesta lo mismo que una red caída', plano(sale(r)), { ok: false, codigo: 'PROVEEDOR', status: 0, transitorio: true, prov: 'qwen', mensaje: 'no se pudo conectar con Qwen' });
  const sinSenal = []; await IA.consultarIA({ peticion, llaves: [LLAVES.qwen[0]], fetch: async (u, init) => { sinSenal.push('signal' in init); return { status: 200, text: async () => '{}' }; } });
  igual('sin señal, `fetch` no recibe un campo `signal`', sinSenal, [false]);
  let lanzo = null; try { await IA.consultarIA({ peticion, llaves: LLAVES.qwen }); } catch (e) { lanzo = e; }
  cierto('sin `fetch` lanza: el módulo no abre conexiones por su cuenta', lanzo instanceof TypeError);
  lanzo = null; try { await IA.consultarIA({ peticion, llaves: { qwen: LLAVES.qwen }, fetch: async () => ({}) }); } catch (e) { lanzo = e; }
  cierto('y si le dan el objeto de llaves en vez de la lista ya en su turno, lanza y no adivina', lanzo instanceof TypeError);
  igual('sin llaves contesta SIN_LLAVE, no lanza', plano(await IA.consultarIA({ peticion, llaves: [], fetch: async () => ({}) })).codigo, 'SIN_LLAVE');
  /* Lo que se le da ya viene filtrado de elegirProveedor, pero un hueco en la lista no puede
     tumbarla ni gastar una llamada: se ignora lo que no es una llave. */
  const gastadas = [];
  const cuenta = async (url, init) => { gastadas.push(llaveDe(url, init.headers)); return { status: 200, text: async () => textoDe(okSegunUrl(url).cuerpo) }; };
  igual('una lista con huecos (vacía, nula, un número) solo prueba la llave de verdad', [plano(await IA.consultarIA({ peticion, llaves: ['', null, 5, LLAVES.qwen[2]], fetch: cuenta })).ok, gastadas], [true, [LLAVES.qwen[2]]]);
  igual('y una lista de puros huecos contesta SIN_LLAVE sin llamar a nadie', [plano(await IA.consultarIA({ peticion, llaves: ['', null, 5], fetch: cuenta })).codigo, gastadas.length], ['SIN_LLAVE', 1]);
}

/* ============================================================================
   6 · LA ROTACIÓN — a cada llamada le toca la siguiente llave
   ============================================================================ */
console.log('\nLA ROTACIÓN — el turno de las llaves, igual que IA_ROTACION en el .gs');
{
  /* Cada proveedor lleva su cuenta. Se llama al .gs varias veces seguidas (su `IA_ROTACION` se
     va quedando en las propiedades) y se hace lo mismo con el módulo, pasándole el estado que
     devolvió la vez anterior. */
  const secuencias = [
    ['Qwen con 4 llaves, 10 llamadas', ['qwen'], 10],
    ['DeepSeek con 2 llaves, 7 llamadas', ['deepseek'], 7],
    ['Gemini con 3 llaves, 8 llamadas', ['gemini'], 8],
    ['los tres, uno tras otro: cada uno con su cuenta', ['qwen', 'gemini', 'qwen', 'deepseek', 'gemini', 'qwen', 'deepseek', 'qwen', 'gemini'], 1],
  ];
  for (const [nombre, provs, vueltas] of secuencias) {
    mundo.reiniciar();
    let rotacion = {}, malos = [];
    const gs = [], yo = [];
    for (let v = 0; v < vueltas; v++) for (const prov of provs) {
      const cuerpo = chat(prov, IA.IA_MODELOS[prov][0]);
      mundo.llamadas.length = 0;
      mundo.rutaIA(cuerpo, 't:rotacion');
      gs.push(prov + ':' + llaveDe(mundo.llamadas[0].url, mundo.llamadas[0].opts.headers).slice(-4));
      const e = IA.elegirProveedor({ prov, llaves: LLAVES, rotacion });
      rotacion = e.rotacion;
      yo.push(prov + ':' + e.llaves[0].slice(-4));
      if (e.llaves.length !== LLAVES[prov].length || new Set(e.llaves).size !== e.llaves.length) malos.push('no es una permutación');
    }
    igual(nombre + ': el módulo empieza por la misma llave que el .gs, llamada tras llamada', yo, gs);
    igual('  y guarda el mismo estado', rotacion, JSON.parse(mundo.propiedad('IA_ROTACION')));
    if (malos.length) mal('  ' + malos[0]);
  }
  /* El orden completo, no solo la primera llave: las demás van detrás, por si la primera falla. */
  igual('con tres llaves y el turno en 1, el orden es 1, 2, 0 y el turno pasa a 2',
        (r => [r.llaves.map(k => k.slice(-1)), r.rotacion])(IA.elegirProveedor({ prov: 'gemini', llaves: LLAVES, rotacion: { gemini: 1 } })), [['2', '3', '1'], { gemini: 2 }]);
  igual('y desde el último, da la vuelta', IA.elegirProveedor({ prov: 'gemini', llaves: LLAVES, rotacion: { gemini: 2 } }).rotacion, { gemini: 0 });
  /* El orden completo contra el .gs, incluyendo lo que pasa cuando una llave falla. */
  mundo.reiniciar({ rotacionTexto: '{"qwen":2}', guion: [R(429, { error: { message: 'x' } }), R(401, { error: { message: 'y' } }), 'ok'] });
  mundo.rutaIA(chat('qwen', 'qwen3.7-flash'), 't:orden');
  igual('el orden en que el .gs recorre las llaves cuando fallan, el módulo lo reproduce',
        mundo.llamadas.map(l => llaveDe(l.url, l.opts.headers).slice(-4)), IA.elegirProveedor({ prov: 'qwen', llaves: LLAVES, rotacion: { qwen: 2 } }).llaves.slice(0, 3).map(k => k.slice(-4)));

  console.log('  — con una sola llave no hay nada que turnar —');
  mundo.reiniciar({ llaves: { qwen: [LLAVES.qwen[0]] } });
  mundo.rutaIA(chat('qwen', 'qwen3.7-flash'), 't:una');
  igual('el .gs no toca IA_ROTACION', mundo.propiedad('IA_ROTACION'), null);
  igual('el módulo devuelve el mismo estado, intacto', IA.elegirProveedor({ prov: 'qwen', llaves: { qwen: [LLAVES.qwen[0]] }, rotacion: { qwen: 5, gemini: 1 } }).rotacion, { qwen: 5, gemini: 1 });

  console.log('  — el estado puede venir roto, y el orden sigue siendo válido —');
  const estados = ['{"qwen":-1}', '{"qwen":1.5}', '{"qwen":"x"}', '{"qwen":null}', '{"qwen":99}', '{"qwen":true}', '{"qwen":[]}', '{"qwen":{}}', '{"qwen":"2"}', '{"qwen":-7}',
                   '{"qwen":1e400}', '[]', '5', '"texto"', 'null', 'esto no es JSON', '', '{"gemini":2}'];
  for (const texto of estados) {
    mundo.reiniciar({ rotacionTexto: texto });
    mundo.rutaIA(chat('qwen', 'qwen3.7-flash'), 't:roto');
    const gsPrimera = llaveDe(mundo.llamadas[0].url, mundo.llamadas[0].opts.headers);
    const e = IA.elegirProveedor({ prov: 'qwen', llaves: LLAVES, rotacion: leerRotacion(texto) });
    const permutacion = e.ok && [...e.llaves].sort().join() === [...LLAVES.qwen].sort().join();
    if (e.llaves[0] === gsPrimera && permutacion) bien('estado ' + (texto || '(vacío)') + ' → empieza por ' + gsPrimera.slice(-4) + ', igual que el .gs, y es un orden válido de las 4');
    else mal('estado ' + texto + ' → .gs empieza por ' + gsPrimera.slice(-4) + ', módulo por ' + e.llaves[0].slice(-4) + (permutacion ? '' : ' y no es una permutación'));
  }
  igual('un estado que no es un objeto se toma por vacío, y se devuelve uno nuevo', IA.elegirProveedor({ prov: 'qwen', llaves: LLAVES, rotacion: 5 }).rotacion, { qwen: 1 });

  console.log('  — el estado que se le pasa no se toca —');
  const congelado = Object.freeze({ qwen: 2, gemini: 1 });
  let lanzo = null, salida = null;
  try { salida = IA.elegirProveedor({ prov: 'qwen', llaves: LLAVES, rotacion: congelado }); } catch (e) { lanzo = e; }
  cierto('con el estado congelado no lanza (no lo modifica)', lanzo === null);
  igual('  y devuelve uno nuevo, con lo ajeno intacto', [salida.rotacion, congelado], [{ qwen: 3, gemini: 1 }, { qwen: 2, gemini: 1 }]);
  lanzo = null; try { IA.elegirProveedor({ prov: 'openai', llaves: LLAVES }); } catch (e) { lanzo = e; }
  cierto('un proveedor que no existe lanza (se valida antes, con validarPeticion)', lanzo instanceof RangeError);
}

/* ============================================================================
   7 · EL DÍA DEL CUPO — México, y no GMT
   ============================================================================ */
console.log('\nEL DÍA DEL CUPO — a las 18:00 de México no se reinicia nada; a la medianoche de México, sí');
{
  /* El instante en que en `zona` son las y-mo-d h:mi:s. Con Intl y el nombre de la zona, no con un
     desfase: se parte de «como si fuera UTC» y se corrige con lo que la zona dice a esa hora. */
  const partesEn = (ms, zona) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(ms).map(x => [x.type, x.value]));
  const instanteEn = (zona, y, mo, d, h = 0, mi = 0, s = 0) => {
    const pretendido = Date.UTC(y, mo - 1, d, h, mi, s);
    let ms = pretendido;
    for (let i = 0; i < 3; i++) {
      const p = partesEn(ms, zona);
      ms += pretendido - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    }
    return ms;
  };
  const horaDe = (ms, zona) => { const p = partesEn(ms, zona); return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute + ':' + p.second; };
  /* Las constantes de la prueba se verifican a sí mismas: si el traslado a la hora local fallara,
     todo lo de abajo mediría otra cosa. */
  const t = (...a) => { const ms = instanteEn(MX, ...a); const esperado = a[0] + '-' + String(a[1]).padStart(2, '0') + '-' + String(a[2]).padStart(2, '0') + ' ' + [a[3] || 0, a[4] || 0, a[5] || 0].map(x => String(x).padStart(2, '0')).join(':'); if (horaDe(ms, MX) !== esperado) throw new Error('instanteEn falló: ' + horaDe(ms, MX) + ' ≠ ' + esperado); return ms; };

  console.log('  — los instantes que importan, escritos a mano —');
  igual('17:59:59 en México (23:59:59 GMT del mismo día)', [IA.cuotaDelDia(Date.UTC(2026, 9, 10, 23, 59, 59)), horaDe(Date.UTC(2026, 9, 10, 23, 59, 59), MX)], ['2026-10-10', '2026-10-10 17:59:59']);
  igual('18:00:00 en México = 00:00:00 GMT del día siguiente: el día de México NO cambia', [IA.cuotaDelDia(Date.UTC(2026, 9, 11, 0, 0, 0)), horaDe(Date.UTC(2026, 9, 11, 0, 0, 0), MX)], ['2026-10-10', '2026-10-10 18:00:00']);
  igual('18:01:00 en México', IA.cuotaDelDia(Date.UTC(2026, 9, 11, 0, 1, 0)), '2026-10-10');
  igual('23:59:59 en México (05:59:59 GMT del 11)', [IA.cuotaDelDia(Date.UTC(2026, 9, 11, 5, 59, 59)), horaDe(Date.UTC(2026, 9, 11, 5, 59, 59), MX)], ['2026-10-10', '2026-10-10 23:59:59']);
  igual('00:00:00 en México (06:00:00 GMT del 11): ahora sí, otro día', [IA.cuotaDelDia(Date.UTC(2026, 9, 11, 6, 0, 0)), horaDe(Date.UTC(2026, 9, 11, 6, 0, 0), MX)], ['2026-10-11', '2026-10-11 00:00:00']);
  igual('la medianoche local de otro día: 31 de dic a 1 de ene', [IA.cuotaDelDia(t(2026, 12, 31, 23, 59, 59)), IA.cuotaDelDia(t(2027, 1, 1, 0, 0, 0))], ['2026-12-31', '2027-01-01']);
  igual('el 29 de febrero de un año bisiesto', [IA.cuotaDelDia(t(2028, 2, 28, 23, 59, 59)), IA.cuotaDelDia(t(2028, 2, 29, 0, 0, 0)), IA.cuotaDelDia(t(2028, 2, 29, 23, 59, 59)), IA.cuotaDelDia(t(2028, 3, 1, 0, 0, 0))],
        ['2028-02-28', '2028-02-29', '2028-02-29', '2028-03-01']);
  igual('sin zona, es la de México', IA.cuotaDelDia(Date.UTC(2026, 9, 11, 0, 1, 0)), IA.cuotaDelDia(Date.UTC(2026, 9, 11, 0, 1, 0), MX));
  igual('y la constante de la zona es esa', IA.IA_ZONA, MX);

  console.log('  — la base de zonas, no un desfase: México tuvo horario de verano hasta 2022 —');
  /* Con un −6 escrito a mano, el verano de 2021 daría otro día a la una de la madrugada. Hay que ver
     que el motor trae esa historia (si no, esta prueba mediría otra cosa). */
  const abreviatura = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: MX, timeZoneName: 'short' }).formatToParts(ms).find(x => x.type === 'timeZoneName').value;
  igual('el motor sabe que en julio de 2021 México iba en horario de verano (CDT), y en julio de 2023 ya no (CST)', [abreviatura(Date.UTC(2021, 6, 15)), abreviatura(Date.UTC(2023, 6, 15))], ['CDT', 'CST']);
  igual('julio de 2021 (UTC−5): la medianoche local es 05:00 GMT', [IA.cuotaDelDia(Date.UTC(2021, 6, 15, 4, 59, 59)), IA.cuotaDelDia(Date.UTC(2021, 6, 15, 5, 0, 0))], ['2021-07-14', '2021-07-15']);
  igual('diciembre de 2021 (UTC−6): la medianoche local es 06:00 GMT', [IA.cuotaDelDia(Date.UTC(2021, 11, 15, 5, 59, 59)), IA.cuotaDelDia(Date.UTC(2021, 11, 15, 6, 0, 0))], ['2021-12-14', '2021-12-15']);
  igual('julio de 2023 (ya sin horario de verano, UTC−6)', [IA.cuotaDelDia(Date.UTC(2023, 6, 15, 5, 59, 59)), IA.cuotaDelDia(Date.UTC(2023, 6, 15, 6, 0, 0))], ['2023-07-14', '2023-07-15']);
  igual('un desfase fijo de −6 habría dado otro día en julio de 2021 (la prueba sí distingue)', new Date(Date.UTC(2021, 6, 15, 5, 0, 0) - 6 * 3600000).toISOString().slice(0, 10), '2021-07-14');

  console.log('  — la zona es un parámetro —');
  igual('Tijuana sigue el horario de verano de EE. UU.: julio (UTC−7) y enero (UTC−8)',
        [IA.cuotaDelDia(Date.UTC(2026, 6, 15, 6, 59, 59), 'America/Tijuana'), IA.cuotaDelDia(Date.UTC(2026, 6, 15, 7, 0, 0), 'America/Tijuana'),
         IA.cuotaDelDia(Date.UTC(2026, 0, 15, 7, 59, 59), 'America/Tijuana'), IA.cuotaDelDia(Date.UTC(2026, 0, 15, 8, 0, 0), 'America/Tijuana')], ['2026-07-14', '2026-07-15', '2026-01-14', '2026-01-15']);
  igual('la India (UTC+5:30, media hora)', [IA.cuotaDelDia(Date.UTC(2026, 9, 10, 18, 29, 59), 'Asia/Kolkata'), IA.cuotaDelDia(Date.UTC(2026, 9, 10, 18, 30, 0), 'Asia/Kolkata')], ['2026-10-10', '2026-10-11']);
  igual('el mismo instante, en dos orillas del mundo: Kiritimati (UTC+14) y Pago Pago (UTC−11)',
        [IA.cuotaDelDia(Date.UTC(2026, 9, 10, 12), 'Pacific/Kiritimati'), IA.cuotaDelDia(Date.UTC(2026, 9, 10, 12), 'Pacific/Pago_Pago')], ['2026-10-11', '2026-10-10']);
  igual('UTC y GMT son el día de la hora universal', [IA.cuotaDelDia(Date.UTC(2026, 9, 10, 23, 59, 59), 'UTC'), IA.cuotaDelDia(Date.UTC(2026, 9, 11, 0, 0, 0), 'GMT')], ['2026-10-10', '2026-10-11']);
  let lanzo = null; try { IA.cuotaDelDia(Date.now(), 'Marte/Olimpo'); } catch (e) { lanzo = e; }
  cierto('una zona que no existe lanza un error que la nombra', lanzo instanceof RangeError && /Marte\/Olimpo/.test(lanzo.message));

  console.log('  — lo que se le puede pasar —');
  igual('una Date y los milisegundos dan lo mismo', [IA.cuotaDelDia(new Date(Date.UTC(2026, 9, 11, 0, 30))), IA.cuotaDelDia(Date.UTC(2026, 9, 11, 0, 30))], ['2026-10-10', '2026-10-10']);
  for (const [nombre, malo] of [['un texto con la fecha', '2026-10-10T12:00:00Z'], ['NaN', NaN], ['una Date inválida', new Date('nada')], ['indefinido', undefined], ['nulo', null], ['infinito', Infinity]]) {
    lanzo = null; try { IA.cuotaDelDia(malo); } catch (e) { lanzo = e; }
    cierto(nombre + ' lanza: la hora la pone quien llama, y no se adivina', lanzo instanceof TypeError);
  }
  igual('el año se rellena a cuatro cifras', IA.cuotaDelDia(Date.UTC(900, 5, 1), 'UTC'), '0900-06-01');

  console.log('  — contra otra forma de saberlo: el idioma sueco escribe la fecha aaaa-mm-dd —');
  /* Un oráculo que no comparte nada con la implementación: `toLocaleDateString` del motor. */
  const oraculo = (ms, zona) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: zona });
  cierto('el oráculo escribe aaaa-mm-dd', /^\d{4}-\d{2}-\d{2}$/.test(oraculo(Date.UTC(2026, 9, 10), MX)));
  let semilla = 20261010;
  const azar = () => { semilla = (semilla + 0x6D2B79F5) | 0; let x = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  for (const zona of [MX, 'UTC', 'America/Tijuana', 'America/New_York', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Australia/Lord_Howe', 'Europe/Madrid']) {
    const malos = [];
    for (let i = 0; i < 2500; i++) {
      const ms = Math.floor(Date.UTC(1995, 0, 1) + azar() * (Date.UTC(2060, 0, 1) - Date.UTC(1995, 0, 1)));
      const dio = IA.cuotaDelDia(ms, zona), esp = oraculo(ms, zona);
      if (dio !== esp) malos.push(new Date(ms).toISOString() + ' → ' + dio + ' ≠ ' + esp);
    }
    igual('2 500 instantes al azar de 1995 a 2060 en ' + zona + ' dan el día que dice el motor', malos.slice(0, 3), []);
  }
  /* Y el .gs: su día es el GMT, y con la zona GMT el módulo lo reproduce. */
  const malosGmt = [];
  for (let i = 0; i < 60; i++) {
    const ms = Math.floor(Date.UTC(2024, 0, 1) + azar() * (Date.UTC(2028, 0, 1) - Date.UTC(2024, 0, 1)));
    mundo.reiniciar(); mundo.reloj(ms);
    mundo.rutaIA(chat('qwen', 'qwen3.7-flash'), 't:dia');
    const clave = Object.keys(mundo.propiedades()).find(k => k.startsWith('IA_CUOTA_')).replace('IA_CUOTA_', '');
    if (IA.cuotaDelDia(ms, 'GMT').replace(/-/g, '') !== clave) malosGmt.push(new Date(ms).toISOString() + ': .gs ' + clave);
  }
  igual('con la zona GMT, el módulo da el mismo día que la propiedad IA_CUOTA_<día> del .gs, en 60 instantes', malosGmt, []);

  console.log('  — la cuenta de una persona a lo largo de un día —');
  /* Una base de mentiras: la cuenta es de (día, persona). Cada consulta la sube y devuelve el nuevo
     número en un paso, como lo haría un `insert … on conflict do update … returning`. */
  const base = new Map();
  const cuenta = (ms, quien) => { const k = IA.cuotaDelDia(ms) + '|' + quien; const n = (base.get(k) || 0) + 1; base.set(k, n); return n; };
  const pide = (ms, quien) => IA.decidirCuota(cuenta(ms, quien));
  const a1759 = t(2026, 10, 10, 17, 59, 0);
  let pasaron = 0;
  for (let i = 0; i < 200; i++) if (pide(a1759 + i * 100, 'elias').ok) pasaron++;
  igual('las primeras 200 consultas pasan (a las 17:59 de México)', pasaron, 200);
  igual('la 201 se niega con la frase del .gs', plano(pide(t(2026, 10, 10, 17, 59, 30), 'elias')),
        { ok: false, codigo: 'CUPO_AGOTADO', transitorio: false, mensaje: 'Llegaste al tope de 200 consultas de IA por hoy. Mañana se reinicia.' });
  igual('a las 18:00:00 de México (medianoche GMT) SIGUE negada: el cupo NO se reinicia', pide(t(2026, 10, 10, 18, 0, 0), 'elias').codigo, 'CUPO_AGOTADO');
  igual('  a las 18:01', pide(t(2026, 10, 10, 18, 1, 0), 'elias').codigo, 'CUPO_AGOTADO');
  igual('  a las 21:00', pide(t(2026, 10, 10, 21, 0, 0), 'elias').codigo, 'CUPO_AGOTADO');
  igual('  y a las 23:59:59', pide(t(2026, 10, 10, 23, 59, 59), 'elias').codigo, 'CUPO_AGOTADO');
  igual('a la medianoche de México SÍ se reinicia: la primera consulta del día nuevo pasa', plano(pide(t(2026, 10, 11, 0, 0, 0), 'elias')), { ok: true, usado: 1, restantes: 199 });
  igual('el cupo es de cada persona: otra, a las 18:01, empieza en uno', plano(pide(t(2026, 10, 10, 18, 1, 0), 'omar')), { ok: true, usado: 1, restantes: 199 });

  console.log('  — y lo que se está reemplazando: el .gs sí lo reinicia a las 18:00 —');
  /* Esto describe el sistema que se retira. Si el .gs algún día cambia de zona, esta parte se
     borra: no se arregla. Es la premisa de la decisión Q-19. */
  mundo.reiniciar();
  const cuerpoDia = chat('qwen', 'qwen3.7-flash');
  mundo.reloj(t(2026, 10, 10, 17, 59, 0));
  let pasaronGs = 0;
  for (let i = 0; i < 200; i++) if (mundo.rutaIA(cuerpoDia, 't:elias').ok) pasaronGs++;
  igual('el .gs deja pasar 200 a las 17:59 de México', pasaronGs, 200);
  igual('  y niega la 201', mundo.rutaIA(cuerpoDia, 't:elias').codigo, 'CUPO_AGOTADO');
  mundo.reloj(t(2026, 10, 10, 18, 0, 30));
  igual('  pero a las 18:00:30 de México, que ya es el 11 en GMT, el .gs vuelve a dejar pasar: ESE es el cambio', mundo.rutaIA(cuerpoDia, 't:elias').ok, true);
  igual('  y su propiedad cambió de día', Object.keys(mundo.propiedades()).filter(k => k.startsWith('IA_CUOTA_')), ['IA_CUOTA_20261011']);
}

/* ============================================================================
   8 · EL CUPO — contar primero, decidir con la cuenta
   ============================================================================ */
console.log('\nEL CUPO — contar ANTES de llamar, y la cuenta incluye a la consulta que se decide');
{
  for (const [usado, ok] of [[1, true], [100, true], [199, true], [200, true], [201, false], [202, false], [5000, false]]) {
    const r = IA.decidirCuota(usado);
    igual('con ' + usado + ' consulta(s) contadas hoy, ' + (ok ? 'pasa' : 'se niega'), [r.ok, r.codigo], [ok, ok ? undefined : 'CUPO_AGOTADO']);
  }
  igual('queda lo que falta', [IA.decidirCuota(1).restantes, IA.decidirCuota(150).restantes, IA.decidirCuota(200).restantes], [199, 50, 0]);
  igual('con otro tope', [IA.decidirCuota(5, 5).ok, IA.decidirCuota(6, 5).ok, IA.decidirCuota(6, 5).mensaje], [true, false, 'Llegaste al tope de 5 consultas de IA por hoy. Mañana se reinicia.']);
  igual('con tope cero, nada pasa', IA.decidirCuota(1, 0).codigo, 'CUPO_AGOTADO');

  /* El .gs cuenta primero y compara después: la 200 pasa y la 201 es la primera que se niega. */
  mundo.reiniciar();
  const cuerpo = chat('qwen', 'qwen3.7-flash');
  let primeraNegada = null;
  for (let i = 1; i <= 205 && primeraNegada === null; i++) {
    const gs = mundo.rutaIA(cuerpo, 't:tope');
    const yo = IA.decidirCuota(i);
    if (gs.ok !== yo.ok) { mal('en la consulta ' + i + ' el .gs dice ok=' + gs.ok + ' y el módulo ok=' + yo.ok); primeraNegada = -1; }
    else if (!gs.ok) { primeraNegada = i; igual('la primera que el .gs niega es la 201, con las mismas palabras que el módulo', [i, JSON.stringify(gs)], [201, JSON.stringify(yo)]); }
  }
  cierto('las 200 primeras coinciden consulta por consulta con el .gs', primeraNegada === 201);

  console.log('  — cuando no se pudo contar —');
  /* El .gs: con el candado ocupado, no cuenta a ciegas y niega con SIN_RED. */
  mundo.reiniciar(); mundo.estado.ocupado = true;
  const ocupado = mundo.rutaIA(cuerpo, 't:ocupado');
  igual('con el candado de la hoja ocupado el .gs niega con SIN_RED, transitorio, sin llamar al proveedor', [ocupado.codigo, ocupado.transitorio, mundo.llamadas.length], ['SIN_RED', true, 0]);
  igual('  y el módulo, cuando no hay cuenta, dice exactamente lo mismo (con el proveedor)', JSON.stringify(IA.decidirCuota(null, 200, 'qwen')), JSON.stringify(ocupado));
  for (const [nombre, malo] of [['nulo', null], ['indefinido', undefined], ['NaN', NaN], ['cero', 0], ['negativo', -3], ['fraccionario', 1.5], ['un texto numérico', '7'], ['infinito', Infinity], ['un objeto', { n: 7 }]]) {
    const r = IA.decidirCuota(malo);
    igual('una cuenta «' + nombre + '» se niega con SIN_RED y transitorio: contar a ciegas es lo que el cupo cierra', [r.ok, r.codigo, r.transitorio], [false, 'SIN_RED', true]);
  }
  igual('sin `prov`, el SIN_RED no inventa uno', 'prov' in IA.decidirCuota(null), false);
  /* Y la diferencia con el .gs, dicha: si leer o escribir la propiedad falla, el .gs deja pasar. */
  mundo.reiniciar(); mundo.estado.fallaAlEscribir = true;
  const sinCuenta = mundo.rutaIA(cuerpo, 't:falla');
  igual('el .gs, si no puede escribir su cuenta, deja pasar la consulta sin contarla (`catch → true`); el módulo no', [sinCuenta.ok, mundo.llamadas.length, IA.decidirCuota(undefined).ok], [true, 1, false]);
  let lanzo = null; try { IA.decidirCuota(5, -1); } catch (e) { lanzo = e; }
  cierto('un tope que no es un entero de cero en adelante lanza: es un error de quien llama', lanzo instanceof RangeError);

  console.log('  — el cuerpo, antes de parsearlo —');
  const tope = IA.IA_MAX_CUERPO;
  igual('lo que cabe y es JSON pasa', plano(IA.validarCuerpoCrudo('{"prov":"qwen"}')), { ok: true, cuerpo: { prov: 'qwen' } });
  igual('justo en el tope cabe', IA.validarCuerpoCrudo(' '.repeat(tope - 2) + '{}').ok, true);
  igual('un carácter de más, no: con la frase de doPost', plano(IA.validarCuerpoCrudo(' '.repeat(tope - 1) + '{}')), { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El cuerpo es demasiado grande.' });
  for (const [nombre, texto] of [['vacío', ''], ['un texto que no es JSON', 'hola'], ['JSON cortado', '{"prov":'], ['indefinido', undefined], ['un número', 42]]) {
    igual('cuerpo ' + nombre + ': «El cuerpo no es JSON.»', plano(IA.validarCuerpoCrudo(texto)), { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'El cuerpo no es JSON.' });
  }
  igual('con otro tope', IA.validarCuerpoCrudo('{"a":1}', 6).mensaje, 'El cuerpo es demasiado grande.');
  /* La puerta de verdad, `doPost`: el mismo 15 MB, contado en caracteres sobre el cuerpo entero, y
     las mismas dos frases. Se le pasa un token de dispositivo (de mentiras) para que llegue a /ia. */
  const TOKEN = 'dispositivo-de-mentiras-' + 'x'.repeat(20);
  const armado = n => '{"ruta":"ia","token":"' + TOKEN + '","modo":"chat","prov":"qwen","model":"qwen3.7-flash","pregunta":"hola","pad":"' + 'A'.repeat(n) + '"}';
  const relleno = tope - armado(0).length;
  const alPuente = texto => { mundo.reiniciar(); mundo.poner('PUENTE_TOKENS', JSON.stringify({ [TOKEN]: 'pagos' })); const r = mundo.doPost(texto); return { r, llamadas: mundo.llamadas.length }; };
  const justo = alPuente(armado(relleno)), pasado = alPuente(armado(relleno + 1));
  igual('un cuerpo de 15 MB exactos: el .gs lo atiende (llega hasta el proveedor)', [armado(relleno).length === tope, justo.r.ok, justo.llamadas], [true, true, 1]);
  igual('  y el módulo lo deja pasar', IA.validarCuerpoCrudo(armado(relleno)).ok, true);
  igual('uno de 15 MB + 1: el .gs lo rechaza, con la frase de siempre', [pasado.r.codigo, pasado.r.mensaje, pasado.llamadas], ['DATO_INVALIDO', 'El cuerpo es demasiado grande.', 0]);
  igual('  y el módulo, con la misma', plano(IA.validarCuerpoCrudo(armado(relleno + 1))), { ok: false, codigo: 'DATO_INVALIDO', mensaje: pasado.r.mensaje });
  for (const [nombre, texto] of [['vacío', ''], ['que no es JSON', 'hola'], ['cortado a la mitad', '{"ruta":"ia","prov":'],
                                 ['demasiado grande Y que no es JSON (se dice lo grande primero)', '{"ruta":"ia","x":"' + 'A'.repeat(tope)]]) {
    const gs = alPuente(texto).r;
    igual('un cuerpo ' + nombre + ': el .gs y el módulo dicen lo mismo', [gs.codigo, gs.mensaje], (m => [m.codigo, m.mensaje])(IA.validarCuerpoCrudo(texto)));
  }
}

/* ============================================================================
   9 · NINGUNA LLAVE SALE
   ============================================================================ */
console.log('\nNINGUNA LLAVE SALE — ni en una respuesta, ni en un error, ni cuando el proveedor la repite');
{
  const peticionDe = (prov, extra = {}) => IA.validarPeticion(cot(prov, IA.IA_MODELOS[prov][0], extra)).peticion;
  const sinLlave = (que, x, llaves = TODAS_LAS_LLAVES) => {
    const s = JSON.stringify(x), vistas = llaves.flatMap(k => [k, encodeURIComponent(k)]).filter(k => s.includes(k));
    if (vistas.length) mal(que + ' — SALIÓ la llave «' + vistas[0] + '» en ' + recorta(s, 300)); else bien(que);
  };
  const conFetch = guion => { let n = 0; return async (url, init) => { const r = respuestaDelGuion(guion, ++n, url); return { status: r.codigo, text: async () => textoDe(r.cuerpo) }; }; };
  const pregunta = async (prov, llaves, guion) => IA.consultarIA({ peticion: peticionDe(prov), llaves, fetch: conFetch(guion) });
  const K = LLAVES.qwen[0], K2 = LLAVES.qwen[1];

  console.log('  — un proveedor que repite la llave que recibió —');
  let r = await pregunta('qwen', [K, K2], [R(401, { error: { message: 'Incorrect API key provided: ' + K + '.' } }), R(401, { error: { message: 'llaves ' + K + ' y ' + K2 } })]);
  sinLlave('el error del proveedor trae la llave en su mensaje (dos llaves, y la última también falla)', sale(r));
  cierto('  y en su lugar queda la marca, en `crudo` y en el `mensaje` que lo lleva', /\[llave oculta\]/.test(r.crudo) && /\[llave oculta\]/.test(r.mensaje));
  igual('  con el resto del texto intacto', r.crudo, 'llaves [llave oculta] y [llave oculta]');
  r = await pregunta('deepseek', [LLAVES.deepseek[0]], R(500, '<html><body>Error con la llave ' + LLAVES.deepseek[0] + ' en la cabecera</body></html>'));
  sinLlave('una página HTML de error que la nombra', sale(r));
  r = await pregunta('gemini', [LLAVES.gemini[0]], R(400, { error: { code: 400, message: 'La dirección https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=' + LLAVES.gemini[0] + ' no sirve' } }));
  sinLlave('un mensaje que repite la dirección de Gemini con la llave', sale(r));
  r = await pregunta('gemini', [LLAVE_RARA], R(400, { error: { message: 'mala: ?key=' + encodeURIComponent(LLAVE_RARA) } }));
  sinLlave('la llave rara (con + / = & ? # % espacio ñ) repetida ya codificada, como viaja en la dirección', sale(r), [LLAVE_RARA]);
  r = await pregunta('qwen', [K], R(200, { choices: [{ message: { content: 'Tu llave es ' + K }, finish_reason: 'stop' }] }));
  sinLlave('incluso en una respuesta buena: el texto que contesta la IA', sale(r));
  r = await pregunta('gemini', [LLAVES.gemini[0]], R(200, { candidates: [{ finishReason: 'ERROR ' + LLAVES.gemini[0] }] }));
  sinLlave('la razón de un vacío', sale(r));
  r = await pregunta('qwen', [K], R(400, { message: K }));
  sinLlave('el mensaje suelto fuera de `error`', sale(r));

  console.log('  — la red se cae y la excepción lleva la dirección —');
  r = await pregunta('gemini', [LLAVES.gemini[0], LLAVES.gemini[1]], 'lanza');
  sinLlave('Gemini: el mensaje de la excepción lleva «…?key=<llave>» y no sale', sale(r));
  igual('  se contesta lo mismo que el .gs: «no se pudo conectar con Gemini»', r.mensaje, 'no se pudo conectar con Gemini');
  r = await pregunta('qwen', [K], 'lanza');
  sinLlave('Qwen, con la llave en la cabecera', sale(r));
  const fetchQueExplota = async (url, init) => { const e = new Error('boom ' + url + ' ' + JSON.stringify(init.headers)); e.cause = { url, headers: init.headers }; throw e; };
  r = await IA.consultarIA({ peticion: peticionDe('qwen'), llaves: [K], fetch: fetchQueExplota });
  sinLlave('una excepción con la cabecera Authorization en su mensaje y en su causa', sale(r));
  const fetchSinTexto = async () => ({ status: 200, text: async () => { throw new Error('flujo roto ' + K); } });
  r = await IA.consultarIA({ peticion: peticionDe('qwen'), llaves: [K], fetch: fetchSinTexto });
  sinLlave('leer el cuerpo de la respuesta falla con la llave en el mensaje', sale(r));
  igual('  y se trata como una red caída', [r.codigo, r.status, r.transitorio], ['PROVEEDOR', 0, true]);

  console.log('  — lo demás que sale hacia el teléfono —');
  sinLlave('SIN_LLAVE (y no dice cuáles llaves hay)', sale(IA.elegirProveedor({ prov: 'qwen', llaves: { gemini: LLAVES.gemini } })));
  sinLlave('proveedoresConLlave', IA.proveedoresConLlave(LLAVES));
  sinLlave('un rechazo de validarPeticion', IA.validarPeticion(cot('qwen', 'qwen-max')));
  sinLlave('una cuenta agotada', IA.decidirCuota(201));
  sinLlave('una cuenta que no se pudo contar', IA.decidirCuota(null, 200, 'gemini'));
  /* La llave puede venir en lo que MANDA el teléfono (un teléfono con un defecto la pegó en su
     prompt): eso no es una fuga del servidor, pero tampoco se le multiplica por el camino. */
  const llamadaReal = IA.construirLlamada('qwen', peticionDe('qwen'), K);
  cierto('construirLlamada SÍ lleva la llave: es lo único que sale hacia el proveedor, y no al teléfono',
         llamadaReal.opciones.headers.Authorization === 'Bearer ' + K && !llamadaReal.opciones.body.includes(K));
  cierto('  y la de Gemini va en la dirección y no en el cuerpo ni en las cabeceras', (g => g.url.includes('key=' + LLAVES.gemini[0]) && !g.opciones.body.includes(LLAVES.gemini[0]) && !JSON.stringify(g.opciones.headers).includes(LLAVES.gemini[0]))(IA.construirLlamada('gemini', peticionDe('gemini'), LLAVES.gemini[0])));

  console.log('  — la herramienta de esconder —');
  igual('cambia cada aparición, en textos anidados', IA.ocultarLlaves({ a: 'x ' + K + ' y ' + K, b: [K, { c: K2 }], n: 5, z: null }, [K, K2]), { a: 'x [llave oculta] y [llave oculta]', b: ['[llave oculta]', { c: '[llave oculta]' }], n: 5, z: null });
  igual('acepta una sola llave en texto', IA.ocultarLlaves('abc ' + K, K), 'abc [llave oculta]');
  const orig = { m: 'con ' + K }; IA.ocultarLlaves(orig, [K]);
  igual('no toca el original', orig, { m: 'con ' + K });
  igual('una llave que contiene a otra no queda a medias', IA.ocultarLlaves('x ' + K + '-extendida y ' + K, [K, K + '-extendida']), 'x [llave oculta] y [llave oculta]');
  igual('lo que mide menos de ocho caracteres no es una llave y no borra palabras', IA.ocultarLlaves('la casa de la plaza', ['la', 'casa']), 'la casa de la plaza');
  igual('sin llaves devuelve lo mismo', IA.ocultarLlaves({ a: 1 }, []), { a: 1 });
  cierto('una llave con medio par sustituto no hace tronar la codificación', (() => { try { IA.ocultarLlaves('x', ['abcdefgh\ud800']); return true; } catch (_) { return false; } })());

  console.log('  — y el .gs, hoy —');
  /* Esto es un hallazgo y no una regla: describe lo que el .gs hace si un proveedor repite la llave. */
  mundo.reiniciar({ llaves: { qwen: [K] }, guion: R(401, { error: { message: 'Incorrect API key provided: ' + K } }) });
  const delGs = mundo.rutaIA(chat('qwen', 'qwen3.7-flash'), 't:fuga');
  console.log('  · el .gs ' + (JSON.stringify(delGs).includes(K) ? 'SÍ devuelve la llave al teléfono si el proveedor la repite (crudo y mensaje): el módulo la esconde' : 'ya no devuelve la llave'));

  /* Y al final, todo lo que el módulo le devolvió al teléfono en TODA la prueba. */
  const copia = alTelefono.slice();
  const filtradas = copia.filter(s => TODAS_LAS_LLAVES.some(k => s.includes(k) || s.includes(encodeURIComponent(k))));
  igual('de las ' + copia.length + ' salidas hacia el teléfono que se anotaron en toda la prueba, ninguna trae una llave (ni su forma de dirección)', filtradas.map(s => recorta(s, 160)), []);
  cierto('  y ninguna trae siquiera la marca de las llaves de mentiras', !copia.some(s => s.includes(MARCA)));
  cierto('  (se anotaron cientos: el barrido no es de adorno)', copia.length > 300);
}

/* ============================================================================
   10 · PUREZA — lo que entra no se toca, y lo mismo da lo mismo
   ============================================================================ */
console.log('\nPUREZA — nada de lo que se le pasa se modifica, y lo mismo da siempre lo mismo');
{
  const congela = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(congela); } return o; };
  const intento = (nombre, f) => { try { f(); bien(nombre); } catch (e) { mal(nombre + ' — lanzó: ' + e.message); } };
  const cuerpo = chat('gemini', 'gemini-3.6-flash', { mensajes: hilo(25) });
  const copia = structuredClone(cuerpo);
  const congelado = congela(structuredClone(cuerpo));
  intento('validarPeticion con el cuerpo congelado', () => IA.validarPeticion(congelado));
  igual('  y no modifica el cuerpo', cuerpo, copia);
  const v = IA.validarPeticion(cuerpo);
  v.peticion.mensajes.push({ role: 'user', content: 'cambiado después' }); v.peticion.mensajes[0].content = 'tocado';
  igual('lo que devuelve no comparte arreglos ni objetos con el cuerpo', cuerpo.mensajes, copia.mensajes);
  const limpia = congela(IA.validarPeticion(cuerpo).peticion);
  intento('construirLlamada con la petición congelada', () => IA.construirLlamada('gemini', limpia, LLAVES.gemini[0]));
  intento('elegirProveedor con las llaves y el turno congelados', () => IA.elegirProveedor({ prov: 'gemini', llaves: congela(structuredClone(LLAVES)), rotacion: congela({ gemini: 1 }) }));
  intento('interpretarRespuesta con la respuesta congelada', () => IA.interpretarRespuesta('qwen', congela({ status: 200, texto: textoDe(okSegunUrl('x').cuerpo) }), 'qwen3.7-flash'));
  intento('ocultarLlaves con el valor y las llaves congelados', () => IA.ocultarLlaves(congela({ a: 'x ' + LLAVES.qwen[0] }), congela([...LLAVES.qwen])));
  const entradas = [
    ['validarPeticion', () => IA.validarPeticion(cuerpo)],
    ['construirLlamada', () => IA.construirLlamada('gemini', limpia, LLAVES.gemini[1])],
    ['elegirProveedor', () => IA.elegirProveedor({ prov: 'qwen', llaves: LLAVES, rotacion: { qwen: 3 } })],
    ['interpretarRespuesta', () => IA.interpretarRespuesta('gemini', { status: 429, texto: '{"error":{"code":429,"message":"x"}}' }, 'gemini-3.6-flash')],
    ['cuotaDelDia', () => IA.cuotaDelDia(Date.UTC(2026, 9, 10, 20))],
    ['decidirCuota', () => IA.decidirCuota(150)],
  ];
  for (const [nombre, f] of entradas) igual(nombre + ' da lo mismo cada vez que se le pregunta', JSON.stringify(f()), JSON.stringify(f()));
  const dos = await Promise.all([1, 2].map(() => IA.consultarIA({ peticion: limpia, llaves: [LLAVES.gemini[0]], fetch: async () => ({ status: 200, text: async () => textoDe(okSegunUrl('generativelanguage').cuerpo) }) })));
  igual('consultarIA, dos veces a la vez, contesta lo mismo (no guarda estado entre llamadas)', dos.map(x => JSON.stringify(x)).filter((x, i, a) => a.indexOf(x) === i).length, 1);
}

console.log('\n' + (fallos ? fallos + ' FALLO(S) de ' + (fallos + aciertos) + ' comprobaciones.' : 'Todo pasa. ' + aciertos + ' comprobaciones, ' + comparadas + ' entradas comparadas con el .gs real.'));
process.exit(fallos ? 1 : 0);
