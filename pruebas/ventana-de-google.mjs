/* NADA DE FONDO ABRE LA VENTANA DE GOOGLE (auditoría 2026-10-26, T1-8).
 *
 * Con la base mandando, lo que sigue en el Apps Script —el sello, la IA, la copia de precios— todavía
 * pide el permiso de Google de la hoja, que dura una hora. Y TODA pregunta suelta a la hoja
 * (`Puente.hablar`) lo pedía con ventana si había un toque en los últimos cinco segundos: abrir el
 * asistente, abrir el modal de la IA, la espera de una autorización cada quince segundos, la cola de
 * Dirección. Resultado: una ventana de Google que se abría sola más o menos cada hora y que, si se
 * cerraba, volvía al minuto. Y al revés, el primer «Solicitar» de un teléfono nuevo cortaba la ventana de
 * consentimiento a los cinco segundos y mandaba la solicitud sin permiso.
 *
 * Las pruebas de antes usaban aparatos de mentiras CON token, y así se escapaba. Aquí el aparato es el de
 * verdad de hoy: un teléfono con la base mandando (`al3d_pf_supa` encendido y `al3d_pf_supa_modo` en
 * "base"), que entró por el botón de Google de la puerta (solo el correo guardado), SIN token de
 * dispositivo y SIN permiso de Google de la hoja vivo. Lo que corre es el código de verdad: ingreso.js,
 * puente.js, el asistente, el notario entero, la ventanilla del marco tal como la escribe
 * js/mod/cotizador.js, y la puerta de la hoja (doPost del .gs, para las preguntas sin permiso). Google es
 * un doble que cuenta cuántas veces se pidió su ventana; el reloj y los topes largos los mueve la prueba.
 *
 * Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { hojaDeMentiras } from './comun/hoja-de-mentiras.mjs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const leer = r => readFileSync(new URL('../' + r, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* `function nombre(...){...}` completo, contando llaves y saltándose cadenas y comentarios (la receta de
   pruebas/supabase-cotizador.mjs). */
function funcion(texto, nombre) {
  const ini = texto.search(new RegExp('(async )?function ' + nombre.replace(/\$/g, '\\$') + '\\('));
  if (ini < 0) throw new Error('no está function ' + nombre);
  let p = 0, j = texto.indexOf('(', ini);
  for (; j < texto.length; j++) { if (texto[j] === '(') p++; if (texto[j] === ')' && --p === 0) break; }
  let i = texto.indexOf('{', j), prof = 0;
  for (; i < texto.length; i++) {
    const c = texto[i], s = texto[i + 1];
    if (c === '/' && s === '/') { i = texto.indexOf('\n', i); continue; }
    if (c === '/' && s === '*') { i = texto.indexOf('*/', i) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++;
      continue;
    }
    if (c === '{') prof++;
    if (c === '}' && --prof === 0) return texto.slice(ini, i + 1);
  }
  throw new Error('function ' + nombre + ' no cierra');
}

/* ── El reloj, y los topes largos a mano ──────────────────────────────────────────────────────────────
   Date.now() lo mueve la prueba (el permiso de una hora, el freno de diez minutos). Los temporizadores de
   cinco segundos o más —el corte viejo de MS_RENOVAR, el tope de dos minutos de la ventana, el de la
   petición— no corren solos: se guardan, y la prueba dispara el que quiera. Los cortos son los de verdad. */
const setTimeoutReal = globalThis.setTimeout, clearTimeoutReal = globalThis.clearTimeout;
let reloj = Math.floor(Date.now() / 3600000) * 3600000;
Date.now = () => reloj;
const pasan = ms => { reloj += ms; };
const topes = [];
globalThis.setTimeout = (f, ms, ...a) => {
  if (ms >= 5000) { const t = { f, ms, vivo: true, deMentiras: true }; topes.push(t); return t; }
  return setTimeoutReal(f, ms, ...a);
};
globalThis.clearTimeout = t => { if (t && t.deMentiras) { t.vivo = false; return; } clearTimeoutReal(t); };
const vivos = ms => topes.filter(t => t.vivo && t.ms === ms).length;
const dispararTope = ms => { const t = topes.find(x => x.vivo && x.ms === ms); if (!t) return false; t.vivo = false; t.f(); return true; };
const esperar = (ms = 0) => new Promise(r => setTimeoutReal(r, ms));

/* ── El teléfono de verdad de hoy ───────────────────────────────────────────────────────────────────── */
const ls = {};
globalThis.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
const CORREO = 'vendedor@al3d.mx';
ls.al3d_pf_supa = JSON.stringify({ encendido: true, desde: 1 });
ls.al3d_pf_supa_modo = JSON.stringify({ modo: 'base', area: 'pagos', visto: 1 });
ls.al3d_pf_ingreso = JSON.stringify({ correo: CORREO });   // lo deja el botón de Google de la puerta
/* Sin `al3d_pf_puente` (la dirección de fábrica, sin token de dispositivo) y sin `al3d_pf_gtok`. */
const BASE_MODO = ls.al3d_pf_supa_modo;

/* Un toque reciente de la persona (`navigator.userActivation`). Las vueltas de fondo se prueban CON él:
   es el caso que abría la ventana (un toque cualquiera que coincidía con la vuelta). */
const toque = si => {
  if (si) Object.defineProperty(globalThis.navigator, 'userActivation', { value: { isActive: true, hasBeenActive: true }, configurable: true });
  else delete globalThis.navigator.userActivation;
};

/* ── Google: un doble de Identity Services que cuenta sus ventanas ──────────────────────────────────
   `GOOGLE.hace(cli)` decide qué hace la persona: null = la ventana se queda abierta (la está leyendo, o en
   un iPhone con la app instalada no regresa nunca); `darPermiso`; o cerrarla. */
const GOOGLE = { ventanas: 0, abierta: null, ultimaOp: null, hace: null };
globalThis.window = globalThis;
globalThis.google = { accounts: { oauth2: { initTokenClient(cfg) {
  const cli = { cfg, callback: cfg.callback, requestAccessToken(op) {
    GOOGLE.ventanas++; GOOGLE.ultimaOp = op; GOOGLE.abierta = this;
    if (GOOGLE.hace) GOOGLE.hace(this, op);
  } };
  return cli;
} } } };
let _n = 0;
const darPermiso = cli => cli.callback({ access_token: 'tok-google-' + (++_n) + '-xxxxxxxxxxxxxxxxxxxx', expires_in: 3600 });
const cerrarVentana = cli => cli.cfg.error_callback({ type: 'popup_closed' });

/* ── La hoja ──────────────────────────────────────────────────────────────────────────────────────────
   Sin ninguna de sus dos puertas, contesta la puerta de VERDAD (doPost del .gs): ROL_SIN_PERMISO con su
   frase. Con un permiso de Google de los que dio el doble, contesta cada ruta como la hoja. */
const H = hojaDeMentiras();
const HOJA = { pedidas: [] };
const respuesta = c => {
  if (c.ruta === 'salud') return { ok: true, version: 'puente-sheets-16', ia: { qwen: true, deepseek: true, gemini: true } };
  if (c.ruta === 'estado') return { ok: true, folios: Object.fromEntries((c.folios || []).map(f => [f, { estado: 'pendiente', sello: null }])) };
  if (c.ruta === 'pendientes') return { ok: true, solicitudes: [] };
  if (c.ruta === 'ia') return { ok: true, texto: 'Vendieron dos.' };
  return { ok: true };
};
globalThis.fetch = async (url, init = {}) => {
  if (/oauth2\/v3\/userinfo/.test(String(url))) return { ok: true, json: async () => ({ email: CORREO, email_verified: true }) };
  const c = JSON.parse(init.body || '{}');
  HOJA.pedidas.push(c);
  const conPermiso = /^tok-google-\d+-x+$/.test(String(c.google_token || ''));
  const cuerpo = (!c.google_token && !c.token) ? H.doPost(init.body) : conPermiso ? respuesta(c)
    : { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'token desconocido' };
  return { status: 200, json: async () => cuerpo };
};
const pedidasDesde = n => HOJA.pedidas.slice(n);

/* Lo que el asistente toca de la página al abrirse: nada que exista en node, y así se queda en paz. */
globalThis.document = { getElementById: () => null, addEventListener() {}, querySelector: () => null, activeElement: null, body: null };
globalThis.matchMedia = () => ({ matches: false });

const Ingreso = await import('../js/nucleo/ingreso.js');
const Puente = await import('../js/datos/puente.js');
const Asistente = await import('../js/nucleo/asistente.js');

/* ── La ventanilla del marco, con el código de js/mod/cotizador.js tal cual ────────────────────────── */
const MOD = leer('js/mod/cotizador.js');
const pedazo = re => { const m = re.exec(MOD); if (!m) throw new Error('no está en js/mod/cotizador.js: ' + re); return m[0]; };
const VENTANILLA = [
  pedazo(/async sesion\(\) \{[\s\S]*?\n {4}\},/),
  pedazo(/hablar\(ruta, cuerpo, espera, opciones\) \{[\s\S]*?\n {4}\},/),
  pedazo(/permiso\(\) \{ return Puente\.permiso\(\); \},/),
].join('\n');
const ventanilla = identidad => new Function('Puente', 'Ingreso', 'quien',
  'return { identidad() { return quien; },\n' + VENTANILLA + '\n avisar() { return false; } };')(Puente, Ingreso, identidad);

/* ── El cotizador: notario.js entero, con lo mínimo alrededor (la receta de pruebas/defensas-del-cotizador.mjs) ── */
const NOTARIO = leer('js/cotizador/notario.js'), IA = leer('js/cotizador/ia.js'), PROC = leer('js/cotizador/proceso.js');
const VENDEDOR = { correo: CORREO, rol: 'pagos' }, DIRECCION = { correo: 'dir@al3d.mx', rol: 'direccion' };
function montarNotario(quien) {
  const avisos = [], cola = [], el = { textContent: '', innerHTML: '' };
  const ctx = vm.createContext({
    console, JSON, Date, Math, Number, String, Object, Array, Set, Map, Promise, isNaN, isFinite,
    /* El vigilante de quince segundos no se programa solo: la prueba da cada vuelta. */
    setTimeout: (f, ms) => (ms >= 1000 ? 0 : setTimeoutReal(f, ms)), clearTimeout: t => { if (t) clearTimeoutReal(t); },
    document: { addEventListener() {}, querySelector: () => null, visibilityState: 'visible' },
    navigator: { onLine: true },
    Q: { folio: 'COT-0042', estado: 'pendiente', solicitud: null, reauth: null, items: [{ id: 1, desc: 'Letras' }], proy: 'Farmacia', cliente: 'Ana', iva: false, rol: 'vendedor' },
    toast: (msg, tipo) => avisos.push({ msg, tipo: tipo || '' }),
    getQueue: () => JSON.parse(JSON.stringify(cola)),
    updateQueueEntry: (folio, cambios) => { const e = cola.find(x => x.folio === folio); if (e) Object.assign(e, JSON.parse(JSON.stringify(cambios))); },
    removeFromQueue() {}, saveState() {}, renderItems() {}, pintarPasos() {},
    renderAuth: () => { ctx.__pintadas++; },
    huellaTrabajo: () => 'H1', money: n => '$' + n, dispositivo: () => 'K7QM', loadQueueEntry: async () => {},
    puenteCfg: () => null, totals: () => ({ sub: 1000 }), _CAMPOS_PRECIO: [], addEventListener() {},
    accionesDirectas() {}, ACC: {}, __pintadas: 0, $: () => el,
    esc: s => String(s),
  });
  ctx.window = ctx; ctx.parent = ctx;
  ctx.AL3D = ventanilla(quien);
  vm.runInContext(NOTARIO, ctx, { filename: 'notario.js' });
  /* Lo que abre el modal de la IA (aiOpen → aiConsultarHoja) y la espera de la solicitud (esperaHTML), con
     su código de verdad. */
  vm.runInContext("const AI_PROVS=['qwen','deepseek','gemini']; const AI_NOMBRE={qwen:'Qwen',deepseek:'DeepSeek',gemini:'Gemini'};" +
    'let _iaEnHoja=null; let _iaSinPermiso=false;\n' + funcion(IA, 'aiConsultarHoja') + '\n' + funcion(IA, 'aiPintarProveedores') + '\n' +
    (/const _DICE_ETAPA=\{[^\n]*\};/.exec(PROC) || [''])[0] + '\n' +
    ['etapasEspera', 'esperaHTML', 'haceTexto'].map(n => funcion(PROC, n)).join('\n'), ctx);
  return { ctx, avisos, cola, el, correr: s => vm.runInContext(s, ctx) };
}

cierto('el aparato es el de hoy: la base manda, sin token de dispositivo y sin permiso de Google vivo',
  /"modo":"base"/.test(ls.al3d_pf_supa_modo) && !ls.al3d_pf_puente && !ls.al3d_pf_gtok && !Ingreso.dentro() && Ingreso.correo() === CORREO);
cierto('  y la hoja, sin puerta, contesta ROL_SIN_PERMISO con la frase de los tokens (la que ya no sirve con la base)',
  /Pégalo otra vez en Ajustes/.test(H.doPost(JSON.stringify({ ruta: 'salud' })).mensaje));

console.log('\n1 · ABRIR EL ASISTENTE no abre la ventana de Google');
{
  toque(true);   // el toque del botón flotante
  const v0 = GOOGLE.ventanas, p0 = HOJA.pedidas.length;
  try { await Asistente.abrir(); } catch (_) { /* sin página: lo que importa es lo que salió a la red */ }
  await esperar(10);
  eq('abrir el asistente con el permiso vencido y el toque fresco: 0 ventanas', GOOGLE.ventanas - v0, 0);
  eq('  y sí le preguntó a la hoja qué llaves hay, de fondo y sin permiso', pedidasDesde(p0).map(c => [c.ruta, 'google_token' in c]), [['salud', false]]);
  cierto('  sin dejar ningún permiso a medias', !Ingreso.dentro());
}

console.log('\n2 · ABRIR EL MODAL DE LA IA no abre la ventana de Google');
{
  const N = montarNotario(VENDEDOR);
  toque(true);   // el toque de «Cotizar con IA»
  const v0 = GOOGLE.ventanas;
  await N.correr('aiConsultarHoja()');
  eq('abrir el modal: 0 ventanas', GOOGLE.ventanas - v0, 0);
  cierto('  y en vez de «Consultando la hoja…» para siempre, dice que el permiso se pide al analizar',
    /permiso de Google/.test(N.el.textContent) && /Analizar/.test(N.el.textContent));
  const abrir = funcion(IA, 'aiOpen');
  cierto('  aiOpen() no pregunta nada más a la hoja ni pide el permiso', /aiConsultarHoja\(\)/.test(abrir) && !/hablarHoja|permisoDeLaHoja/.test(abrir));
}

console.log('\n3 · LA ESPERA DE UNA AUTORIZACIÓN: 10 vueltas, 0 ventanas');
{
  const N = montarNotario(VENDEDOR);
  N.ctx.Q.solicitud = { enviada: true, ts: reloj, error: '' };
  const v0 = GOOGLE.ventanas, p0 = HOJA.pedidas.length;
  for (let i = 0; i < 10; i++) { pasan(15000); toque(true); await N.correr('consultarSolicitudes()'); }
  eq('10 vueltas de quince segundos, cada una con un toque fresco: 0 ventanas', GOOGLE.ventanas - v0, 0);
  eq('  las diez le preguntaron a la hoja, sin permiso', pedidasDesde(p0).map(c => c.ruta + (c.google_token ? '+google' : '')),
    new Array(10).fill('estado'));
  eq('  y lo que volvió se lee como «falta el permiso», no como «sin señal»', N.correr('_sinPermisoHoja'), Puente.SIN_PERMISO_DE_GOOGLE);
  const espera = N.correr('esperaHTML()');
  cierto('  la espera lo dice, sin el reloj de «revisado hace» encima', /falta el permiso de Google de la hoja/.test(espera) && /Revisar ahora/.test(espera));
  cierto('  y el panel ofrece «Revisar ahora», que es un botón', /_sinPermisoHoja&&Q\.solicitud&&Q\.solicitud\.enviada&&_esperaViva\(Q\.solicitud\)\?`<button class="btn btn-gho" data-acc="revisarSolicitudesAhora\(\)"/.test(PROC));

  /* «Revisar ahora»: un botón, así que sí puede pedirla. Una vez, y la espera se pone al día. */
  GOOGLE.hace = darPermiso;
  toque(true);
  await N.correr('revisarSolicitudesAhora()');
  eq('«Revisar ahora» sí pide el permiso: una ventana', GOOGLE.ventanas - v0, 1);
  eq('  y la vuelta sale con él, y la espera deja de decir que falta', [pedidasDesde(p0).at(-1).ruta, !!pedidasDesde(p0).at(-1).google_token, N.correr('_sinPermisoHoja')],
    ['estado', true, '']);
  GOOGLE.hace = null;
}

console.log('\n4 · LA COLA DE DIRECCIÓN, EL REINTENTO DE /solicitar Y EL REPINTADO DEL AUTORIZADOR: de fondo');
{
  pasan(2 * 3600000);   // el permiso de «Revisar ahora» ya venció
  const D = montarNotario(DIRECCION);
  D.ctx.Q.rol = 'autorizador'; D.ctx.Q.estado = 'borrador'; D.ctx.Q.solicitud = null;
  const v0 = GOOGLE.ventanas, p0 = HOJA.pedidas.length;
  for (let i = 0; i < 4; i++) { pasan(15000); toque(true); await D.correr('consultarSolicitudes()'); }
  eq('la cola de Dirección, cuatro vueltas con toque: 0 ventanas', GOOGLE.ventanas - v0, 0);
  eq('  preguntó por las de los otros teléfonos sin permiso, y lo dice', [pedidasDesde(p0).map(c => c.ruta), D.correr('_sinPermisoHoja')],
    [['pendientes', 'pendientes', 'pendientes', 'pendientes'], Puente.SIN_PERMISO_DE_GOOGLE]);
  /* renderAuth() del Autorizador: sin permiso no vuelve a preguntar en cada repintado, y la nota lleva el botón. */
  cierto('  el repintado del Autorizador no pregunta por su cuenta sin permiso, y ofrece «Revisar ahora»',
    /if\(!_sinPermisoHoja&&\(!_remotasTs\|\|Date\.now\(\)-_remotasTs>VIGILA_MS\)\) setTimeout\(consultarSolicitudes,0\);/.test(PROC) &&
    /\+\(_sinPermisoHoja\?`<button class="btn btn-gho" data-acc="revisarSolicitudesAhora\(\)"/.test(PROC));

  const N = montarNotario(VENDEDOR);
  N.ctx.Q.solicitud = { enviada: false, ts: reloj, error: '' };   // no subió: la vuelta la reintenta
  const p1 = HOJA.pedidas.length;
  pasan(15000); toque(true);
  await N.correr('consultarSolicitudes()');
  eq('el reintento de /solicitar en la vuelta: 0 ventanas', GOOGLE.ventanas - v0, 0);
  eq('  salió sin permiso', pedidasDesde(p1).filter(c => c.ruta === 'solicitar').map(c => 'google_token' in c), [false]);
  const err = N.ctx.Q.solicitud.error;
  cierto('  y dice que falta el permiso y cómo se manda, no «sin señal»', /permiso de Google/.test(err) && /Reintentar el envío/.test(err) && !/Sin señal/.test(err));
  eq('  sigue sin subir (la manda el botón)', N.ctx.Q.solicitud.enviada, false);
}

console.log('\n5 · TOCAR «SOLICITAR» sí puede pedirla, UNA vez, y la ESPERA');
{
  pasan(2 * 3600000);
  const N = montarNotario(VENDEDOR);
  N.ctx.Q.solicitud = { enviada: false, ts: reloj, error: '' };
  GOOGLE.hace = null;   // un teléfono nuevo: la pantalla de consentimiento, y la persona leyéndola
  const v0 = GOOGLE.ventanas, p0 = HOJA.pedidas.length, cortesAntes = vivos(5000);
  toque(true);
  const envio = N.correr('enviarSolicitud(true)');
  await esperar(10);
  eq('el botón abre la ventana de Google: una', GOOGLE.ventanas - v0, 1);
  eq('  con la cuenta de la puerta y sin el selector de cuentas', GOOGLE.ultimaOp, { prompt: '', login_hint: CORREO });
  eq('  sin el corte de cinco segundos de antes (MS_RENOVAR)', vivos(5000) - cortesAntes, 0);
  pasan(45000); toque(false);
  await esperar(10);
  eq('  45 s después la solicitud todavía no salió: espera a la persona en vez de irse sin permiso', pedidasDesde(p0).length, 0);
  /* Mientras tanto cae la vuelta de quince segundos (con un toque fresco: el peor caso). */
  toque(true);
  await N.correr('consultarSolicitudes()');
  eq('  la vuelta que cae mientras tanto no abre otra ventana', GOOGLE.ventanas - v0, 1);
  eq('  ni vuelve a mandar la solicitud que va en camino', pedidasDesde(p0).filter(c => c.ruta === 'solicitar').length, 0);
  darPermiso(GOOGLE.abierta);   // la persona acepta
  await envio;
  const sol = pedidasDesde(p0).filter(c => c.ruta === 'solicitar');
  eq('con el permiso dado, la solicitud sale UNA vez, con él', [sol.length, !!(sol[0] && sol[0].google_token)], [1, true]);
  eq('  y queda enviada, sin error', [N.ctx.Q.solicitud.enviada, N.ctx.Q.solicitud.error], [true, '']);
  pasan(15000); toque(true);
  await N.correr('consultarSolicitudes()');
  eq('  la vuelta siguiente usa el permiso vivo: ni una ventana más', GOOGLE.ventanas - v0, 1);
  eq('  y la espera ya no dice que falta', N.correr('_sinPermisoHoja'), '');
}

console.log('\n6 · TRAS UN «NO», la ventana no vuelve sola en diez minutos');
{
  pasan(2 * 3600000);   // el permiso del punto 5 venció
  const N = montarNotario(VENDEDOR);
  N.ctx.Q.solicitud = { enviada: false, ts: reloj, error: '' };
  GOOGLE.hace = cerrarVentana;
  const v0 = GOOGLE.ventanas, p0 = HOJA.pedidas.length;
  toque(true);
  await N.correr('enviarSolicitud(true)');
  eq('la persona cierra la ventana: fue una, y la solicitud no sale', [GOOGLE.ventanas - v0, pedidasDesde(p0).filter(c => c.ruta === 'solicitar').length], [1, 0]);
  const err = N.ctx.Q.solicitud.error;
  cierto('  se dice que la cerró y qué tocar, no «sin señal»', /Cerraste la ventana de Google/.test(err) && /Reintentar el envío/.test(err) && !/Sin señal/.test(err));
  cierto('  y se avisa aunque no sea el primer error: lo pidió un botón', N.avisos.some(a => a.tipo === 'err' && /Cerraste/.test(a.msg)));

  /* Nueve minutos y tres cuartos de vueltas, con toques, y el asistente y el modal de la IA abiertos otra vez. */
  for (let i = 0; i < 39; i++) { pasan(15000); toque(true); await N.correr('consultarSolicitudes()'); }
  toque(true);
  try { await Asistente.abrir(); } catch (_) {}
  await N.correr('aiConsultarHoja()');
  await esperar(10);
  eq('39 vueltas, el asistente y el modal de la IA en 9 min 45 s, todo con toques: ninguna ventana más', GOOGLE.ventanas - v0, 1);

  /* El freno de diez minutos es lo que detiene al relevo de la hoja (la bandeja con la hoja mandando),
     que es lo único de fondo que todavía puede renovar con un toque. Con la base mandando ni eso. */
  delete ls.al3d_pf_supa_modo;   // la hoja manda
  GOOGLE.hace = darPermiso;
  const relevo = Puente.crear({ url: 'https://puente.test/exec', token: '' });
  toque(true);
  try { await relevo.salud(); } catch (_) {}
  eq('con la hoja mandando, a los 9 min 45 s del «no», el relevo no la abre aunque haya toque', GOOGLE.ventanas - v0, 1);
  pasan(30000); toque(true);
  try { await relevo.salud(); } catch (_) {}
  eq('  pasados los diez minutos, sí (con un toque, uno por minuto: lo de siempre)', GOOGLE.ventanas - v0, 2);
  ls.al3d_pf_supa_modo = BASE_MODO;
  pasan(2 * 3600000);

  /* Un botón, dentro del freno, sí: es la persona volviendo a pedirlo, no la app insistiendo. */
  GOOGLE.hace = cerrarVentana;
  toque(true);
  N.ctx.Q.solicitud = { enviada: false, ts: reloj, error: '' };
  await N.correr('enviarSolicitud(true)');
  pasan(60000);
  GOOGLE.hace = darPermiso;
  toque(true);
  await N.correr('enviarSolicitud(true)');
  eq('dentro del freno, «Reintentar el envío» (un botón) sí vuelve a pedirla, y sale', [GOOGLE.ventanas - v0, N.ctx.Q.solicitud.enviada], [4, true]);
  pasan(2 * 3600000);
}

console.log('\n7 · EL TOPE: «Sellando…» no gira para siempre si la ventana no regresa (iPhone con la app instalada)');
{
  topes.forEach(t => { t.vivo = false; });
  GOOGLE.hace = null;   // la ventana se abre y nunca le contesta a la app
  const D = montarNotario(DIRECCION);
  const v0 = GOOGLE.ventanas, p0 = HOJA.pedidas.length;
  toque(true);
  const sellando = D.correr("sellarEnLaHoja('COT-0042@K7QM',{proyecto:'Farmacia',cliente:'Ana',iva:false,subtotal:1000,items:[]},0,{},'')")
    .then(() => 'selló', e => String(e && e.message));
  await esperar(10);
  eq('«Autorizar» abre la ventana de Google', GOOGLE.ventanas - v0, 1);
  eq('  y hay un tope de dos minutos esperándola', vivos(120000), 1);
  dispararTope(120000);
  const m = await sellando;
  cierto('a los dos minutos se rinde con un mensaje claro: no regresó, qué hacer, y la salida del iPhone',
    /no regresó a la app en dos minutos/.test(m) && /vuelve a tocar el botón/.test(m) && /Safari/.test(m));
  eq('  sin mandarle nada a la hoja', pedidasDesde(p0).length, 0);

  /* Lo mismo por el camino de `hablar` con un botón (Solicitar), y el permiso que llega tarde se guarda. */
  const N = montarNotario(VENDEDOR);
  N.ctx.Q.solicitud = { enviada: false, ts: reloj, error: '' };
  toque(true);
  const envio = N.correr('enviarSolicitud(true)');
  await esperar(10);
  dispararTope(120000);
  await envio;
  cierto('«Solicitar» con la ventana perdida: el mismo mensaje, y la solicitud sigue aquí', /no regresó a la app/.test(N.ctx.Q.solicitud.error) && N.ctx.Q.solicitud.enviada === false);
  const v1 = GOOGLE.ventanas;
  darPermiso(GOOGLE.abierta);   // la ventana por fin contesta, tarde
  await esperar(10);
  cierto('  si la ventana contesta después del tope, el permiso se guarda igual', Ingreso.dentro());
  toque(true);
  await N.correr('enviarSolicitud(true)');
  eq('  y el siguiente toque lo encuentra vivo: sale sin abrir otra ventana', [GOOGLE.ventanas - v1, N.ctx.Q.solicitud.enviada], [0, true]);
}

console.log('\n8 · POR EL TEXTO: quién es botón y quién es fondo');
{
  const pt = sinComentarios(leer('js/datos/puente.js'));
  const hablar = funcion(pt, 'hablar');
  cierto('Puente.hablar solo pide la ventana con `opciones.toque === true`, y su pregunta va siempre de fondo',
    /if \(opciones && opciones\.toque === true\) \{[\s\S]*?permisoDelToque\(/.test(hablar) && /deFondo: true \}, espera\)/.test(hablar));
  const tg = funcion(pt, 'tokenDeGoogle');
  cierto('  lo de fondo sale sin abrir nada antes de mirar el toque', tg.indexOf('if (deFondo || laBaseManda()) return') > 0 &&
    tg.indexOf('if (deFondo || laBaseManda()) return') < tg.indexOf('Ingreso.hayGesto()'));
  cierto('  el relevo respeta el freno de diez minutos', /ahora < _renovarDesde/.test(tg) && /const MS_TRAS_NEGARSE = 10 \* 60000;/.test(pt));
  cierto('  y un «no» lo pone, venga de quien venga', /r\.codigo === 'DATO_INVALIDO'\) _renovarDesde = Date\.now\(\) \+ MS_TRAS_NEGARSE/.test(funcion(pt, 'anotarRespuesta')));
  const ptoque = funcion(pt, 'permisoDelToque');
  cierto('  el botón NO corta a los cinco segundos: espera la renovación entera', !/MS_RENOVAR/.test(ptoque) && /await renovarUnaVez\(/.test(ptoque));

  const no = sinComentarios(NOTARIO);
  cierto('notario: «Autorizar» y «Rechazar» (revisión remota) son botones', /hablarHoja\('autorizar',[^;]*,30000,true\)/.test(no) && /hablarHoja\('rechazar',\{folio:s\.folio,nota\},undefined,true\)/.test(no));
  cierto('  /estado, /pendientes y /cancelar son de fondo', /hablarHoja\('estado',\{folios:[^;]*\}\);/.test(no) && /hablarHoja\('pendientes',\{\}\);/.test(no) && /hablarHoja\('cancelar',\{folio:folioGlobal\(folio\)\}\)\.catch/.test(no));
  cierto('  /solicitar es botón solo si lo dice quien llama, y la vuelta la reintenta de fondo',
    /hablarHoja\('solicitar',\{[^;]*\},undefined,toque===true\)/.test(no) && /!Q\.solicitud\.cancelada\) await enviarSolicitud\(\);/.test(no));
  const pr = sinComentarios(PROC);
  cierto('proceso: «Solicitar autorización» y «Reintentar el envío / Volver a pedirla» son botones; el reenvío al cambiar de folio, fondo',
    /toast\('Precio bloqueado · mandando la solicitud a Dirección…','',3000\);\s*enviarSolicitud\(true\);/.test(pr) &&
    /data-acc="enviarSolicitud\(true\)"/.test(pr) && /if\(reenviar\) enviarSolicitud\(\);/.test(pr));
  cierto('  «Rechazar» de este teléfono es botón', /hablarHoja\('rechazar',\{folio:folioGlobal\(\),nota:Q\.nota\},undefined,true\)/.test(pr));
  const tar = sinComentarios(leer('js/cotizador/tarifas.js'));
  cierto('tarifas: «Guardar precios» es botón; la copia que se reintenta, de fondo',
    /hablarHoja\('guardar_tarifas',\{filas\},25000,true\)/.test(funcion(tar, 'guardarTarifas')) &&
    /hablarHoja\('guardar_tarifas',\{filas\},25000\);/.test(funcion(tar, '_tarEspejoHoja')));
  const an = funcion(sinComentarios(IA), 'aiAnalyze');
  cierto('ia: «Analizar» pide el permiso ANTES de cualquier espera (dentro del toque)',
    an.indexOf('permisoDeLaHoja()') > 0 && an.indexOf('permisoDeLaHoja()') < an.indexOf('await '));
  cierto('  y la cadena de proveedores va de fondo', /hablarHoja\('ia',cuerpo,AI_TIMEOUT\);/.test(funcion(sinComentarios(IA), 'aiPedirHoja')));
  const asis = sinComentarios(leer('js/nucleo/asistente.js'));
  const correr = funcion(asis, 'correrIA');
  cierto('asistente: «Preguntar» pide el permiso ANTES de leer el taller (dentro del toque)',
    correr.indexOf('Puente.permiso()') > 0 && correr.indexOf('Puente.permiso()') < correr.indexOf('await '));
  cierto('  y abrir el panel o preguntar a los proveedores van de fondo',
    /Puente\.hablar\('salud', \{\}\)\.then/.test(asis) && /Puente\.hablar\('ia', \{[^}]*\}, TIMEOUT\)/.test(asis));
  const ing = sinComentarios(leer('js/nucleo/ingreso.js'));
  cierto('ingreso: la espera de la ventana tiene tope, y cuenta como un «no»',
    /const MS_VENTANA = 120000;/.test(ing) && /tope = setTimeout\(\(\) => fin\(mal\('DATO_INVALIDO', MSG\.SIN_REGRESO\)\), MS_VENTANA\);/.test(ing));
  cierto('  más corto que el de la puerta, que espera esto y algo más', Number((/const MS_CON_PANTALLA = (\d+);/.exec(leer('js/nucleo/puerta.js')) || [])[1]) > 120000);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
