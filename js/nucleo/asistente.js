/* ============================================================================
   EL ASISTENTE — un botón, una pregunta, una respuesta con los datos del taller.

   «¿Qué comisiones ya se pueden abonar?», «¿quién nos debe y cuánto?», «¿qué va tarde?».
   Las respuestas están en la plataforma, repartidas en seis pantallas; el asistente las
   junta y contesta en un renglón. Es de SOLO LECTURA: no mueve etapas, no cambia estatus,
   no escribe en Notion. Si le piden hacer algo, dice en qué pantalla se hace.

   Cómo funciona, sin misterio:
     1. Al preguntar, se leen los datos de ESTE dispositivo por la capa de datos —proyectos,
        agenda, ventanas de taller, cartera, lista de compra, avisos, bitácora— y se arman en
        un resumen (js/datos/asistente-contexto.js). El resumen respeta el rol: fabricación
        no manda importes porque no los tiene.
     2. Ese resumen viaja con la pregunta al proveedor de IA que YA tenga llave guardada en
        el cotizador (Gemini, Groq u OpenRouter). La plataforma no pide una segunda llave y
        no escribe las del cotizador: las lee con la misma receta con la que se guardaron.
     3. La respuesta se pinta como texto —negritas, viñetas y nada más—. Nunca se interpreta
        como marcado.

   Lo que se manda sale del teléfono y llega a un tercero: por eso la primera vez se dice
   con todas sus letras y se pide un toque de «entendido», que se recuerda en este aparato.
   Sin llave no hay asistente, y la pantalla lo dice y lleva a donde se pone.
   ============================================================================ */

import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Proy from '../datos/proyectos.js';
import * as Cot from '../datos/cotizador.js';
import * as Agenda from '../datos/agenda.js';
import * as Taller from '../datos/taller.js';
import * as Material from '../datos/material.js';
import * as Ventas from '../datos/ventas.js';
import * as Bitacora from '../datos/bitacora.js';
import { armarResumen, promptSistema, mdLite, cadenaIA, PROVEEDOR_NOMBRE } from '../datos/asistente-contexto.js';
import { $, ico, esc, toast, abrirCapa, cerrarCapa, copiarTexto, hoyISO } from './ui.js';

const CAPA = 'pf-ia';
const CLAVE_OK = 'al3d_pf_ia_ok';       // «entendido»: lo que pregunte viaja con un resumen
const TIMEOUT = 60000;
const MAX_HISTORIA = 8;                   // pares pregunta/respuesta que viajan de contexto

/* La conversación vive en memoria mientras la pestaña esté abierta. No se guarda: es una
   consulta, no un registro, y guardarla sería guardar copias del resumen del negocio. */
let _msgs = [];                 // [{rol:'yo'|'bot', texto, ts, con?}]
let _ctx = null;
let _ocupado = false;
let _abort = null;
let _montado = false;

const SUGERIDAS = [
  '¿Qué comisiones ya se pueden abonar y cuánto suman?',
  '¿Quién nos debe y cuánto?',
  '¿Qué va tarde en el taller y por cuántos días?',
  '¿Qué se instala esta semana?',
  '¿Cuánto vendimos este mes contra el anterior?',
  '¿Qué material falta comprar y para qué proyecto?',
  '¿Qué cotizaciones autorizadas siguen sin decidir?',
];

/** Una vez, desde app.js: cuelga el oyente del botón flotante. El panel se pinta al abrir. */
export function montar(ctx) {
  _ctx = ctx || null;
  if (_montado) return;
  _montado = true;
  const b = $('pf-ia-btn');
  if (b) b.addEventListener('click', abrir);
  const capa = $(CAPA);
  if (capa) {
    capa.addEventListener('click', alClic);
    capa.addEventListener('keydown', alTecla);
  }
}

export function abrir() {
  pintar();
  abrirCapa(CAPA, { hist: true });
  const ta = $('ia-pregunta');
  if (ta) requestAnimationFrame(() => { try { ta.focus(); } catch (_) {} });
}

export function cerrar() {
  if (_abort) { try { _abort.abort(); } catch (_) {} _abort = null; }
  cerrarCapa(CAPA);
}

/* ============================================================================
   Pintar
   ============================================================================ */

function pintar() {
  const capa = $(CAPA); if (!capa) return;
  const cadena = cadenaIA(localStorage);
  const hayLlave = cadena.length > 0;
  const ok = Prefs.get(CLAVE_OK, false) === true;
  const quien = cadena[0] ? (PROVEEDOR_NOMBRE[cadena[0].prov] || cadena[0].prov) + ' · ' + cadena[0].model : '';

  let cuerpo;
  if (!hayLlave) {
    cuerpo = '<div class="ia-aviso">' + ico('i-candado') +
      '<div><b>Todavía no hay una llave de IA en este dispositivo.</b> El asistente usa la misma que el cotizador ' +
      'para «Cotizar con IA» (Gemini, Groq u OpenRouter). Se pega una vez, en el cotizador, y sirve para las dos apps.</div>' +
      '<button type="button" class="btn btn-pri pf-btn-corto" data-ia-ir="cotizador">Ir al cotizador</button></div>';
  } else if (!ok) {
    cuerpo = '<div class="ia-aviso">' + ico('i-aviso') +
      '<div><b>Antes de la primera pregunta.</b> Lo que preguntes viaja a <b>' + esc(quien) + '</b> junto con un ' +
      'resumen de lo que hay en este dispositivo: proyectos con su etapa, importes y saldos' + (Prefs.veDinero() ? '' : ' (sin importes, por tu rol)') +
      ', agenda, material y los últimos movimientos. Sin teléfonos ni direcciones. El asistente solo lee: no cambia nada.</div>' +
      '<button type="button" class="btn btn-pri pf-btn-corto" data-ia-ok>Entendido, preguntar</button></div>';
  } else {
    cuerpo = mensajesHTML() + sugeridasHTML();
  }

  capa.innerHTML = '<div class="pf-panel ia-panel">' +
    '<div class="pf-panel-h">' + ico('i-ia', 'ia-ico') +
      '<h2>Asistente del taller</h2>' +
      (hayLlave ? '<span class="folio ia-prov" title="Proveedor y modelo del cotizador">' + esc(quien) + '</span>' : '') +
      (_msgs.length ? '<button type="button" class="pf-cerrar" data-ia-limpiar title="Borrar la conversación" aria-label="Borrar la conversación">' + ico('i-basura') + '</button>' : '') +
      '<button type="button" class="pf-cerrar" data-ia-cerrar aria-label="Cerrar el asistente">' + ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b ia-cuerpo" id="ia-cuerpo">' + cuerpo + '</div>' +
    (hayLlave && ok ? '<div class="pf-panel-f ia-pie">' +
      '<textarea id="ia-pregunta" rows="1" placeholder="Pregunta sobre proyectos, cobranza, comisiones, agenda o material…" aria-label="Tu pregunta"' + (_ocupado ? ' disabled' : '') + '></textarea>' +
      '<button type="button" class="btn btn-pri ia-enviar" data-ia-enviar' + (_ocupado ? ' disabled' : '') + ' aria-label="Preguntar">' + ico('i-subir') + '</button>' +
    '</div>' : '') +
  '</div>';
  abajo();
}

function mensajesHTML() {
  if (!_msgs.length) {
    return '<div class="ia-hola">' + ico('i-ia') +
      '<p class="vacio-t">Pregunta lo que quieras saber del taller</p>' +
      '<p class="vacio-d">Contesto con lo que hay en este dispositivo: proyectos, cobranza, comisiones, agenda y material. ' +
      'Solo leo; si algo hay que cambiar, te digo dónde.</p></div>';
  }
  return '<div class="ia-hilo">' + _msgs.map(m => {
    if (m.rol === 'yo') return '<div class="ia-msg yo"><div class="ia-burbuja">' + esc(m.texto) + '</div></div>';
    if (m.rol === 'espera') return '<div class="ia-msg bot"><div class="ia-burbuja ia-espera">' + ico('i-reloj') + ' ' + esc(m.texto) + '</div></div>';
    if (m.rol === 'error') return '<div class="ia-msg bot"><div class="ia-burbuja ia-mal">' + ico('i-aviso') + ' ' + esc(m.texto) + '</div></div>';
    return '<div class="ia-msg bot"><div class="ia-burbuja">' + mdLite(m.texto) + '</div>' +
      '<div class="ia-meta"><span>' + esc(m.con || '') + '</span>' +
      '<button type="button" class="ia-copiar" data-ia-copiar="' + esc(m.ts) + '">' + ico('i-copiar') + ' Copiar</button></div></div>';
  }).join('') + '</div>';
}

function sugeridasHTML() {
  if (_msgs.length) return '';
  const lista = SUGERIDAS.filter(s => Prefs.veDinero() || !/comision|debe|vendimos/i.test(s));
  return '<div class="ia-sugeridas">' + lista.map(s =>
    '<button type="button" class="chip" data-ia-sugerida="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>';
}

function abajo() {
  const c = $('ia-cuerpo');
  if (c) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

/* ============================================================================
   Eventos
   ============================================================================ */

function alClic(ev) {
  const t = ev.target;
  if (t === $(CAPA)) { cerrar(); return; }              // tocar el velo cierra, como las demás capas
  if (t.closest('[data-ia-cerrar]')) { cerrar(); return; }
  if (t.closest('[data-ia-limpiar]')) { _msgs = []; pintar(); return; }
  if (t.closest('[data-ia-ok]')) { Prefs.set(CLAVE_OK, true); pintar(); const ta = $('ia-pregunta'); if (ta) ta.focus(); return; }
  const ir = t.closest('[data-ia-ir]');
  if (ir) { cerrar(); if (_ctx && _ctx.ir) _ctx.ir(ir.dataset.iaIr); else location.hash = '#/' + ir.dataset.iaIr; return; }
  const sug = t.closest('[data-ia-sugerida]');
  if (sug) { preguntar(sug.dataset.iaSugerida); return; }
  if (t.closest('[data-ia-enviar]')) { enviarDelCampo(); return; }
  const cp = t.closest('[data-ia-copiar]');
  if (cp) {
    const m = _msgs.find(x => String(x.ts) === cp.dataset.iaCopiar);
    if (m) copiarTexto(m.texto, 'Respuesta copiada');
  }
}

function alTecla(ev) {
  const ta = ev.target;
  if (!ta || ta.id !== 'ia-pregunta') return;
  /* Enter manda; Shift+Enter hace renglón. En el teléfono el teclado trae su propio botón y
     Enter también manda, que es lo que espera quien escribe en un chat. */
  if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviarDelCampo(); }
}

function enviarDelCampo() {
  const ta = $('ia-pregunta'); if (!ta) return;
  const q = ta.value.trim();
  if (!q) return;
  ta.value = '';
  preguntar(q);
}

/* ============================================================================
   Preguntar
   ============================================================================ */

async function preguntar(texto) {
  if (_ocupado) return;
  const q = String(texto || '').trim().slice(0, 1500);
  if (!q) return;
  const cadena = cadenaIA(localStorage);
  if (!cadena.length) { pintar(); return; }

  _ocupado = true;
  _msgs.push({ rol: 'yo', texto: q, ts: Date.now() });
  _msgs.push({ rol: 'espera', texto: 'Leyendo el taller…', ts: Date.now() });
  pintar();

  let resumen;
  try {
    resumen = await leerTaller();
  } catch (e) {
    console.warn('no se pudo armar el contexto', e);
    quitarEspera();
    _msgs.push({ rol: 'error', texto: 'No pude leer los datos de este dispositivo: ' + (e && e.message ? e.message : 'error desconocido'), ts: Date.now() });
    _ocupado = false; pintar(); return;
  }

  const sistema = promptSistema(resumen);
  /* El hilo que viaja: las últimas vueltas, sin los avisos de espera ni los errores. */
  const previos = _msgs.filter(m => m.rol === 'yo' || m.rol === 'bot').slice(0, -1).slice(-MAX_HISTORIA * 2)
    .map(m => ({ role: m.rol === 'yo' ? 'user' : 'assistant', content: m.texto }));

  let ultimoError = null;
  for (let i = 0; i < Math.min(cadena.length, 4); i++) {
    const c = cadena[i];
    ponerEspera('Preguntando a ' + (PROVEEDOR_NOMBRE[c.prov] || c.prov) + (i ? ' (intento ' + (i + 1) + ')' : '') + '…');
    try {
      const r = await llamar(c, sistema, previos, q);
      quitarEspera();
      _msgs.push({ rol: 'bot', texto: r, ts: Date.now(), con: (PROVEEDOR_NOMBRE[c.prov] || c.prov) + ' · ' + c.model });
      ultimoError = null;
      break;
    } catch (e) {
      if (e && e.cancelado) { quitarEspera(); ultimoError = null; break; }
      ultimoError = e;
      /* Una llave inválida o un modelo que no existe no se arregla reintentando con la misma:
         se pasa a la siguiente. Un 429/5xx también pasa a la siguiente, que es la cuota nueva. */
      continue;
    }
  }
  if (ultimoError) {
    quitarEspera();
    _msgs.push({ rol: 'error', texto: (ultimoError.message || 'No hubo respuesta') + '. Revisa la llave en el cotizador o inténtalo en un momento.', ts: Date.now() });
  }
  _ocupado = false;
  pintar();
  const ta = $('ia-pregunta'); if (ta) { try { ta.focus(); } catch (_) {} }
}

function ponerEspera(texto) {
  const e = _msgs.find(m => m.rol === 'espera');
  if (e) e.texto = texto; else _msgs.push({ rol: 'espera', texto, ts: Date.now() });
  const el = document.querySelector('#ia-cuerpo .ia-espera');
  if (el) el.innerHTML = ico('i-reloj') + ' ' + esc(texto);
}
function quitarEspera() { _msgs = _msgs.filter(m => m.rol !== 'espera'); }

/* ----- Leer el taller: todo local, por la capa de datos ----- */
async function leerTaller() {
  if (!DB.estado().ok) throw new Error(DB.motivoTexto() || 'la base no abrió');
  const hoy = hoyISO();
  const veDinero = Prefs.veDinero();
  const [proyectos, insts, cts, mat] = await Promise.all([
    Proy.listar({}), Agenda.listar({ vivas: true }), Material.constantes(), Agenda.contextoMaterial(),
  ]);
  const instDe = new Map();
  for (const i of insts) if (i && i.proyecto_id && !instDe.has(i.proyecto_id)) instDe.set(i.proyecto_id, i);
  const ventanas = new Map();
  for (const p of proyectos) {
    if (!p || p.etapa === 'cancelado' || p.etapa === 'instalado') continue;
    try { ventanas.set(p.id, Taller.ventanaTaller(p, instDe.get(p.id) || null, { hoy, cts })); } catch (_) {}
  }
  const materialDe = id => {
    try {
      const p = proyectos.find(x => x.id === id);
      const d = Agenda.dictamen([{ proyecto_id: id, titulo: (p && p.nombre) || '', fecha: (instDe.get(id) || {}).fecha || null }], mat, hoy);
      return d && d.texto ? String(d.texto).slice(0, 120) : undefined;
    } catch (_) { return undefined; }
  };
  const ganados = new Set(proyectos.map(p => p.folio_global));
  const sinDecidir = Cot.sinDecidir(ganados);
  const kpi = veDinero ? Ventas.indicadores(proyectos, sinDecidir, { hoy, valorDe: Cot.totalVendido }) : null;
  const conversion = veDinero ? Ventas.conversion(Cot.historial(), proyectos, Prefs.dispositivo()) : null;

  let faltantes = [], bajoMinimo = [], avisos = [], bitacora = [];
  try { const S = await import('../datos/stock.js'); [faltantes, bajoMinimo] = await Promise.all([S.listaCompra({ hastaDias: 30 }), S.bajoMinimo()]); } catch (_) {}
  try { const R = await import('../datos/reglas.js'); avisos = await R.refrescar({ hoy }); } catch (_) {}
  try { bitacora = await Bitacora.listar({ limite: 25 }); } catch (_) {}

  return armarResumen({
    hoy, rol: Prefs.ROL_NOMBRE[Prefs.rol()] || Prefs.rol(), nombre: Prefs.nombre(), veDinero,
    proyectos, instalaciones: insts, ventanas, materialDe, kpi, conversion, faltantes, bajoMinimo,
    avisos, sinDecidir, cola: Cot.cola(), bitacora, valorDe: Cot.totalVendido,
  });
}

/* ----- La llamada al proveedor -----
   Gemini con su API propia; Groq y OpenRouter hablan el mismo dialecto de chat. Sin modo
   JSON: aquí se quiere texto. Un solo intento por candidato; la cadena decide el siguiente. */
async function llamar(c, sistema, previos, pregunta) {
  const ctl = new AbortController();
  _abort = ctl;
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    if (c.prov === 'gemini') {
      const contents = previos.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
        .concat([{ role: 'user', parts: [{ text: pregunta }] }]);
      const body = { systemInstruction: { parts: [{ text: sistema }] }, contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 1200 } };
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(c.model) +
        ':generateContent?key=' + encodeURIComponent(c.key);
      const r = await pedir(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      if (!r.res.ok || (r.data && r.data.error) || !r.data) throw errorDe(r, c);
      const cand = (r.data.candidates || [])[0];
      const txt = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || '').join('').trim();
      if (!txt) throw new Error((PROVEEDOR_NOMBRE[c.prov] || c.prov) + ' respondió vacío' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : ''));
      return txt;
    }
    const URLS = { groq: 'https://api.groq.com/openai/v1/chat/completions', openrouter: 'https://openrouter.ai/api/v1/chat/completions' };
    const hdrs = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key };
    if (c.prov === 'openrouter') { hdrs['HTTP-Referer'] = location.origin; hdrs['X-Title'] = 'Plataforma AL3D'; }
    const body = { model: c.model, temperature: 0.2, max_tokens: 1200,
      messages: [{ role: 'system', content: sistema }].concat(previos, [{ role: 'user', content: pregunta }]) };
    const r = await pedir(URLS[c.prov], { method: 'POST', headers: hdrs, body: JSON.stringify(body), signal: ctl.signal });
    if (!r.res.ok || (r.data && r.data.error) || !r.data) throw errorDe(r, c);
    const ch = (r.data.choices || [])[0];
    const txt = ((ch && ch.message && ch.message.content) || '').trim();
    if (!txt) throw new Error((PROVEEDOR_NOMBRE[c.prov] || c.prov) + ' respondió vacío');
    return txt;
  } finally {
    clearTimeout(t);
    if (_abort === ctl) _abort = null;
  }
}

async function pedir(url, opts) {
  let res;
  try { res = await fetch(url, opts); }
  catch (e) {
    if (opts.signal && opts.signal.aborted && !_ocupado) { const c = new Error('cancelado'); c.cancelado = true; throw c; }
    throw new Error(e && e.name === 'AbortError' ? 'el proveedor tardó demasiado en responder' : 'no se pudo conectar con el proveedor (revisa tu conexión)');
  }
  const txt = await res.text().catch(() => '');
  let data = null; try { data = JSON.parse(txt); } catch (_) {}
  return { res, data, txt };
}

function errorDe(r, c) {
  const e = r.data && r.data.error;
  const crudo = ((typeof e === 'string' ? e : (e && (e.message || e.msg))) || (r.data && r.data.message) ||
    (r.txt || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 140);
  const s = (e && typeof e.code === 'number' && e.code >= 100) ? e.code : r.res.status;
  const n = PROVEEDOR_NOMBRE[c.prov] || c.prov;
  let msg;
  if (s === 429) msg = n + ' alcanzó su límite de peticiones';
  else if (s === 408 || s >= 500) msg = n + ' está saturado';
  else if (s === 401 || s === 403) msg = 'la llave de ' + n + ' no es válida o no tiene permiso';
  else if (s === 404) msg = n + ' no reconoce el modelo «' + c.model + '»';
  else msg = n + ' rechazó la petición (HTTP ' + s + ')';
  return new Error(crudo ? msg + ' — ' + crudo : msg);
}
