/* ============================================================================
   EL ASISTENTE — un botón, una pregunta, una respuesta con los datos del taller.

   «¿Qué comisiones ya se pueden abonar?», «¿quién nos debe?», «¿qué va tarde?». Las
   respuestas están en la plataforma, repartidas en ocho pantallas; el asistente las
   junta y contesta en un renglón. Es de SOLO LECTURA: no mueve etapas, no cambia estatus,
   no escribe en Notion. Si le piden hacer algo, dice en qué pantalla se hace.

   Dos caminos, y el orden importa:
     1. LO QUE SE PUEDE CALCULAR SE CALCULA AQUÍ. Las preguntas de siempre —comisiones,
        cobranza, atrasos, agenda, ventas, material, sin decidir— tienen respuesta exacta en
        los datos del dispositivo y se contestan al instante, sin red, sin llave y sin que
        nada salga del teléfono (js/datos/asistente-contexto.js, `responderLocal`). Una
        pregunta escrita que case con una de ellas también se contesta así.
     2. LO DEMÁS VA A LA IA, con el mismo resumen como contexto, al proveedor que YA tenga
        llave guardada en el cotizador (Gemini, Groq u OpenRouter). La plataforma no pide
        una segunda llave y no escribe las del cotizador. La primera vez que algo va a salir
        del dispositivo se dice con todas sus letras y se pide un «entendido».

   La respuesta —venga de donde venga— se pinta como texto: negritas, viñetas y nada más.
   Nunca se interpreta como marcado. Y cada respuesta dice de dónde salió: «calculado aquí»
   o el nombre del proveedor.
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
import { armarResumen, promptSistema, mdLite, cadenaIA, PROVEEDOR_NOMBRE, INTENCIONES,
         detectarIntencion, respuestaLocal, resumenDelDia, sugerirIntenciones } from '../datos/asistente-contexto.js';
import { $, ico, esc, money, toast, abrirCapa, cerrarCapa, copiarTexto, hoyISO, fmtFecha } from './ui.js';

const CAPA = 'pf-ia';
const CLAVE_OK = Prefs.CLAVES.IA_OK;    // «entendido»: lo que pregunte a la IA viaja con un resumen
const TIMEOUT = 60000;
const MAX_HISTORIA = 8;                   // pares pregunta/respuesta que viajan de contexto
const FRESCURA_MS = 45000;                // cuánto vale una lectura del taller antes de releer

/* La conversación vive en memoria mientras la pestaña esté abierta. No se guarda: es una
   consulta, no un registro, y guardarla sería guardar copias del resumen del negocio. */
let _msgs = [];                 // [{rol:'yo'|'bot'|'espera'|'error', texto, ts, con?, local?, intent?}]
let _ctx = null;
let _ocupado = false;
let _abort = null;
/* Cerrar el panel CANCELA la pregunta en vuelo. La cancelación se leía de `!_ocupado`, que
   durante una petición es siempre falso, así que el abort de `cerrar()` se reportaba como «el
   proveedor tardó demasiado» y el bucle pasaba al siguiente: el resumen del negocio —4.5 KB,
   con importes— salía a Groq cuando la persona ya había cerrado el asistente. Una bandera
   propia, puesta por quien cierra, es lo único que distingue «me fui» de «no contestó». */
let _cancelado = false;
let _montado = false;
let _resumen = null;            // la última lectura del taller
let _leido = 0;                 // cuándo
let _pendienteIA = null;        // la pregunta que espera el «entendido»

/* Las preguntas de siempre, agrupadas como se piensan: primero el dinero, luego el taller. */
const GRUPOS = [
  { titulo: 'Dinero', dinero: true, intents: ['cobranza', 'comisiones', 'ventas', 'sin_decidir'] },
  { titulo: 'Taller', dinero: false, intents: ['tarde', 'semana', 'material'] },
];
const ICONO_INTENT = { hoy: 'i-taller', comisiones: 'i-venta', cobranza: 'i-wa', tarde: 'i-reloj', semana: 'i-agenda',
  ventas: 'i-control', material: 'i-material', sin_decidir: 'i-doc' };
const DESC_INTENT = {
  comisiones: 'Las que ya se pueden pagar y las que esperan liquidación',
  cobranza: 'Saldos por proyecto, lo instalado primero',
  ventas: 'Este mes contra el anterior, pipeline y conversión',
  sin_decidir: 'Autorizadas que nadie ha marcado como ganadas',
  tarde: 'Trabajos fuera de su ventana, por días de atraso',
  semana: 'De hoy a siete días, y las que pasaron sin marcarse',
  material: 'Lo que falta comprar y lo que está bajo mínimo',
};

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
    capa.addEventListener('input', alEscribir);
  }
}

export async function abrir() {
  pintar();
  abrirCapa(CAPA, { hist: true });
  /* El resumen de hoy se lee al abrir —es local y tarda decenas de milisegundos— y se pinta
     en cuanto llega. Si tarda, el panel ya está abierto con las preguntas; nada espera. */
  try { await leerSiHaceFalta(); } catch (_) {}
  pintar();
  enfocarCampo();
}

export function cerrar() {
  if (_ocupado) _cancelado = true;
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
  const quien = cadena[0] ? (PROVEEDOR_NOMBRE[cadena[0].prov] || cadena[0].prov) + ' · ' + cadena[0].model : '';
  const hayHilo = _msgs.length > 0;

  capa.innerHTML = '<div class="pf-panel ia-panel">' +
    '<div class="pf-panel-h">' + ico('i-ia', 'ia-ico') +
      '<div class="ia-titulo"><h2>Asistente del taller</h2>' +
        '<span class="ia-sub">' + (hayLlave ? 'Solo lectura · lo calculable se contesta aquí; lo demás, ' + esc(quien) : 'Solo lectura · sin llave de IA: contesta lo que se calcula aquí') + '</span></div>' +
      (hayHilo ? '<button type="button" class="pf-cerrar" data-ia-limpiar title="Empezar de nuevo" aria-label="Borrar la conversación">' + ico('i-basura') + '</button>' : '') +
      '<button type="button" class="pf-cerrar" data-ia-cerrar aria-label="Cerrar el asistente">' + ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b ia-cuerpo" id="ia-cuerpo">' + (hayHilo ? hiloHTML() : portadaHTML()) + '</div>' +
    '<div class="ia-pie-caja">' +
      (hayHilo ? tiraHTML() : '') +
      '<div class="pf-panel-f ia-pie">' +
        '<textarea id="ia-pregunta" rows="1" placeholder="Escribe tu pregunta…" aria-label="Tu pregunta"' + (_ocupado ? ' disabled' : '') + '></textarea>' +
        '<button type="button" class="btn btn-pri ia-enviar" data-ia-enviar' + (_ocupado ? ' disabled' : '') + ' aria-label="Preguntar">' + ico('i-subir') + '</button>' +
      '</div>' +
      '<p class="ia-pista">Enter envía · Shift+Enter hace renglón' + (hayLlave ? '' : ' · para preguntas libres, pega una llave de IA en el cotizador') + '</p>' +
    '</div>' +
  '</div>';
  abajo();
}

/* La portada: el resumen de hoy en cinco cifras, y las preguntas de siempre como renglones
   que se tocan. Nada flota en medio de un hueco: lo primero que se ve es lo que hay hoy. */
function portadaHTML() {
  const dinero = Prefs.veDinero();
  const filas = GRUPOS.filter(g => !g.dinero || dinero).map(g =>
    '<p class="ag-grupo">' + esc(g.titulo) + '</p>' +
    g.intents.map(k => {
      const it = INTENCIONES[k];
      return '<button type="button" class="ia-frecuente" data-ia-intent="' + k + '">' +
        '<span class="pf-fila-ico">' + ico(ICONO_INTENT[k] || 'i-doc') + '</span>' +
        '<span class="ia-frecuente-tx"><b>' + esc(it.titulo) + '</b><small>' + esc(DESC_INTENT[k] || it.pregunta) + '</small></span>' +
        '<span class="ia-frecuente-ir">' + ico('i-atras') + '</span></button>';
    }).join('')).join('');
  return resumenHTML() + '<div class="ia-frecuentes">' + filas + '</div>';
}

function resumenHTML() {
  const dinero = Prefs.veDinero();
  if (!_resumen) {
    return '<div class="ia-hoy ia-hoy-cargando" aria-busy="true"><p class="ia-hoy-t">' + ico('i-reloj') + ' Leyendo el taller…</p></div>';
  }
  const d = resumenDelDia(_resumen);
  const cifra = (v, t, cls) => '<button type="button" class="ia-cifra' + (cls ? ' ' + cls : '') + '" data-ia-intent="' + (cls === 'dinero' ? 'cobranza' : 'hoy') + '"><b>' + esc(v) + '</b><span>' + esc(t) + '</span></button>';
  const c = [];
  c.push('<button type="button" class="ia-cifra' + (d.tarde ? ' urge' : '') + '" data-ia-intent="tarde"><b>' + d.enTaller + '</b><span>' + (d.enTaller === 1 ? 'en el taller' : 'en el taller') + (d.tarde ? ' · <em>' + d.tarde + ' tarde</em>' : '') + '</span></button>');
  c.push('<button type="button" class="ia-cifra' + (d.vencidas ? ' urge' : '') + '" data-ia-intent="semana"><b>' + d.semana + '</b><span>' + (d.semana === 1 ? 'instalación en 7 días' : 'instalaciones en 7 días') + (d.vencidas ? ' · <em>' + d.vencidas + ' sin marcar</em>' : '') + '</span></button>');
  if (dinero) {
    c.push('<button type="button" class="ia-cifra dinero" data-ia-intent="cobranza"><b>' + esc(money(d.porCobrar)) + '</b><span>por cobrar · ' + d.conSaldo + (d.conSaldo === 1 ? ' proyecto' : ' proyectos') + '</span></button>');
    c.push('<button type="button" class="ia-cifra' + (d.comisionAbonable > 0 ? ' bien' : '') + '" data-ia-intent="comisiones"><b>' + esc(d.comisionAbonable > 0 ? money(d.comisionAbonable) : '—') + '</b><span>' + (d.comisionAbonable > 0 ? 'comisiones abonables ya' : 'sin comisiones abonables') + '</span></button>');
  } else {
    c.push('<button type="button" class="ia-cifra' + (d.comprar ? ' urge' : '') + '" data-ia-intent="material"><b>' + d.comprar + '</b><span>' + (d.comprar === 1 ? 'material por comprar' : 'materiales por comprar') + '</span></button>');
  }
  void cifra;
  return '<div class="ia-hoy">' +
    '<p class="ia-hoy-t">' + ico('i-taller') + ' Hoy, ' + esc(fmtFecha(_resumen.hoy)) +
      '<button type="button" class="ia-hoy-mas" data-ia-intent="hoy">Ver el resumen</button></p>' +
    '<div class="ia-cifras">' + c.join('') + '</div>' +
  '</div>';
}

function hiloHTML() {
  const hayLlave = cadenaIA(localStorage).length > 0;
  return '<div class="ia-hilo">' + _msgs.map(m => {
    if (m.rol === 'yo') return '<div class="ia-msg yo"><div class="ia-burbuja">' + esc(m.texto) + '</div></div>';
    if (m.rol === 'espera') return '<div class="ia-msg bot"><div class="ia-burbuja ia-espera">' + ico('i-reloj') + ' ' + esc(m.texto) + '</div></div>';
    if (m.rol === 'error') return '<div class="ia-msg bot"><div class="ia-burbuja ia-mal">' + ico('i-aviso') + ' ' + esc(m.texto) + '</div></div>';
    if (m.rol === 'permiso') {
      return '<div class="ia-msg bot"><div class="ia-burbuja ia-permiso">' + ico('i-aviso') +
        '<div><b>Esta pregunta va a la IA.</b> Viaja a <b>' + esc(m.con || '') + '</b> junto con un resumen de lo que hay en este dispositivo: ' +
        'proyectos con su etapa' + (Prefs.veDinero() ? ', importes y saldos' : '') + ', agenda, material y los últimos movimientos. Sin teléfonos ni direcciones. Se pregunta una sola vez.</div>' +
        '<div class="btn-fila"><button type="button" class="btn btn-pri pf-btn-corto" data-ia-ok>Entendido, enviar</button>' +
        '<button type="button" class="btn btn-gho pf-btn-corto" data-ia-no>Mejor no</button></div></div></div>';
    }
    const hora = horaDe(m.ts);
    const fuente = m.local
      ? '<span class="ia-fuente local" title="Calculado en este dispositivo, sin mandar nada a la IA">' + ico('i-candado') + ' Calculado aquí · ' + hora + '</span>'
      : '<span class="ia-fuente">' + ico('i-ia') + ' ' + esc(m.con || 'IA') + ' · ' + hora + '</span>';
    return '<div class="ia-msg bot"><div class="ia-burbuja">' + mdLite(m.texto) + '</div>' +
      accionesHTML(m.acciones) +
      '<div class="ia-meta">' + fuente +
        (m.local && hayLlave ? '<button type="button" class="ia-copiar" data-ia-ampliar="' + esc(m.ts) + '" title="Mandar la misma pregunta a la IA, con estos datos">' + ico('i-ia') + ' Preguntarle a la IA</button>' : '') +
        '<button type="button" class="ia-copiar" data-ia-copiar="' + esc(m.ts) + '">' + ico('i-copiar') + ' Copiar</button></div></div>';
  }).join('') + '</div>';
}

/* Los botones de una respuesta local: la pantalla que toca y los proyectos que nombra. Van
   como acciones de verdad, no como texto: «Abrir COT-0038» abre la ficha, «Ver la cartera»
   abre Control en Por cobrar. Un enlace de fuera (Notion) se abre en otra pestaña. */
function accionesHTML(acciones) {
  if (!Array.isArray(acciones) || !acciones.length) return '';
  /* Sin los botones a pantallas que este rol no tiene: «Ver la lista de compra» le salía a
     pagos, que no tiene Material, y el toque cerraba el asistente y dejaba el Tablero donde
     estaba. La lista de qué rol tiene qué es la del router (`ctx.tieneRuta`). */
  const puede = a => !((a.tipo === 'ir' || a.tipo === 'pasar') && _ctx && typeof _ctx.tieneRuta === 'function' &&
                       !_ctx.tieneRuta(a.ruta));
  acciones = acciones.filter(puede);
  if (!acciones.length) return '';
  return '<div class="ia-acciones">' + acciones.map((a, i) => {
    if (a.tipo === 'link') {
      return '<a class="chip" href="' + esc(a.href) + '" target="_blank" rel="noopener">' + ico('i-libre') + ' ' + esc(a.label) + '</a>';
    }
    const datos = a.tipo === 'proyecto' ? 'data-ia-proyecto="' + esc(a.id) + '"'
      : a.tipo === 'intent' ? 'data-ia-intent="' + esc(a.intent) + '"'
      : a.tipo === 'pasar' ? 'data-ia-pasar="' + esc(a.ruta) + '" data-ia-dato="' + esc(JSON.stringify(a.dato || {})) + '"'
      : 'data-ia-ir="' + esc(a.ruta) + '"';
    return '<button type="button" class="chip' + (i === 0 && a.tipo !== 'proyecto' ? ' on' : '') + '" ' + datos + '>' +
      (a.tipo === 'proyecto' ? ico('i-proyectos') + ' ' : '') + esc(a.label) + '</button>';
  }).join('') + '</div>';
}

/* La tira de preguntas rápidas encima del campo, cuando ya hay conversación. Se desliza. */
function tiraHTML() {
  const dinero = Prefs.veDinero();
  const lista = Object.keys(INTENCIONES).filter(k => k !== 'hoy' && (dinero || !INTENCIONES[k].dinero));
  return '<div class="ia-tira" role="group" aria-label="Preguntas rápidas">' + lista.map(k =>
    '<button type="button" class="chip" data-ia-intent="' + k + '">' + esc(INTENCIONES[k].titulo) + '</button>').join('') + '</div>';
}

function horaDe(ts) {
  const d = new Date(Number(ts) || Date.now());
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* El hilo se lee de abajo —lo último que se contestó—; la portada se lee de arriba, que es
   donde están las cifras de hoy. Desplazar la portada al fondo le cortaba el encabezado. */
function abajo() {
  const c = $('ia-cuerpo');
  if (c) requestAnimationFrame(() => { c.scrollTop = _msgs.length ? c.scrollHeight : 0; });
}

function enfocarCampo() {
  const ta = $('ia-pregunta');
  if (ta && !_ocupado) requestAnimationFrame(() => { try { ta.focus({ preventScroll: true }); } catch (_) {} });
}

/* ============================================================================
   Eventos
   ============================================================================ */

function alClic(ev) {
  const t = ev.target;
  if (t === $(CAPA)) { cerrar(); return; }              // tocar el velo cierra, como las demás capas
  if (t.closest('[data-ia-cerrar]')) { cerrar(); return; }
  if (t.closest('[data-ia-limpiar]')) { _msgs = []; _pendienteIA = null; pintar(); enfocarCampo(); return; }
  if (t.closest('[data-ia-ok]')) {
    Prefs.set(CLAVE_OK, true);
    _msgs = _msgs.filter(m => m.rol !== 'permiso');
    const q = _pendienteIA; _pendienteIA = null;
    if (q) preguntarIA(q, { yaAnotada: true }); else pintar();
    return;
  }
  if (t.closest('[data-ia-no]')) {
    _msgs = _msgs.filter(m => m.rol !== 'permiso');
    _pendienteIA = null;
    _msgs.push({ rol: 'bot', local: true, ts: Date.now(), texto: 'Está bien, no se mandó nada. Las preguntas rápidas de abajo se contestan aquí, sin IA.' });
    pintar(); enfocarCampo();
    return;
  }
  const intent = t.closest('[data-ia-intent]');
  if (intent) { preguntarLocal(intent.dataset.iaIntent); return; }
  const proy = t.closest('[data-ia-proyecto]');
  if (proy) { salirA('proyectos', { proyecto_id: proy.dataset.iaProyecto }); return; }
  const pasar = t.closest('[data-ia-pasar]');
  if (pasar) {
    let dato = {}; try { dato = JSON.parse(pasar.dataset.iaDato || '{}'); } catch (_) {}
    salirA(pasar.dataset.iaPasar, dato); return;
  }
  const ir = t.closest('[data-ia-ir]');
  if (ir) { salirA(ir.dataset.iaIr, null); return; }
  const amp = t.closest('[data-ia-ampliar]');
  if (amp) {
    const i = _msgs.findIndex(x => String(x.ts) === amp.dataset.iaAmpliar);
    const pregunta = i > 0 ? _msgs.slice(0, i).reverse().find(x => x.rol === 'yo') : null;
    if (pregunta) preguntarIA(pregunta.texto, {});
    return;
  }
  if (t.closest('[data-ia-enviar]')) { enviarDelCampo(); return; }
  const cp = t.closest('[data-ia-copiar]');
  if (cp) {
    const m = _msgs.find(x => String(x.ts) === cp.dataset.iaCopiar);
    if (m) copiarTexto(m.texto, 'Respuesta copiada');
  }
}

/* Cerrar el panel y llegar a la pantalla con el dato en la mano: la ficha abierta, la
   pestaña puesta. La conversación se queda: al volver a abrir, sigue donde estaba.

   El panel se abrió con una entrada de historial (para que el botón atrás del teléfono lo
   cierre), así que cerrarlo dispara `history.back()`, que es ASÍNCRONO: si se cambia el hash
   antes de que llegue ese popstate, el back lo pisa y la pantalla se queda donde estaba.
   Costó verlo: el botón «cerraba» y no iba a ningún lado. Se navega cuando el popstate
   llegue, con un tope por si no llega. */
function salirA(ruta, dato) {
  const capa = $(CAPA);
  const conHist = !!(capa && capa.dataset.hist === '1');
  let hecho = false;
  const irse = () => {
    if (hecho) return; hecho = true;
    if (!_ctx) { location.hash = '#/' + ruta; return; }
    if (dato && _ctx.pasar) _ctx.pasar(ruta, dato);
    else if (_ctx.ir) _ctx.ir(ruta);
  };
  if (!conHist) { cerrar(); irse(); return; }
  const tope = setTimeout(irse, 450);
  window.addEventListener('popstate', () => { clearTimeout(tope); setTimeout(irse, 0); }, { once: true });
  cerrar();
}

function alTecla(ev) {
  const ta = ev.target;
  if (!ta || ta.id !== 'ia-pregunta') return;
  /* Enter manda; Shift+Enter hace renglón. En el teléfono el teclado trae su propio botón y
     Enter también manda, que es lo que espera quien escribe en un chat. */
  if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviarDelCampo(); }
}

/* El campo crece con lo que se escribe, hasta cuatro renglones. */
function alEscribir(ev) {
  const ta = ev.target;
  if (!ta || ta.id !== 'ia-pregunta') return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 132) + 'px';
}

function enviarDelCampo() {
  const ta = $('ia-pregunta'); if (!ta) return;
  const q = ta.value.trim();
  if (!q) return;
  ta.value = ''; ta.style.height = 'auto';
  preguntar(q);
}

/* ============================================================================
   Preguntar
   ============================================================================ */

/** Una pregunta escrita: lo calculable se contesta aquí; lo demás va a la IA. */
async function preguntar(texto) {
  if (_ocupado) return;
  const q = String(texto || '').trim().slice(0, 1500);
  if (!q) return;
  const intent = detectarIntencion(q);
  const hayLlave = cadenaIA(localStorage).length > 0;
  if (intent && (!hayLlave || intent !== 'hoy')) { await preguntarLocal(intent, q); return; }
  if (intent) { await preguntarLocal(intent, q); return; }
  if (!hayLlave) {
    _msgs.push({ rol: 'yo', texto: q, ts: Date.now() });
    const cerca = sugerirIntenciones(q).filter(k => Prefs.veDinero() || !INTENCIONES[k].dinero);
    _msgs.push({ rol: 'bot', local: true, ts: Date.now(),
      texto: 'Eso no lo puedo calcular aquí, y este dispositivo no tiene llave de IA para preguntas libres. ' +
        (cerca.length ? '¿Buscabas alguna de estas?' : '') +
        '\n\nPara preguntas libres, pega una llave de Gemini, Groq u OpenRouter en el cotizador (Cotizar con IA → Configuración): sirve para las dos apps.',
      acciones: cerca.map(k => ({ tipo: 'intent', intent: k, label: INTENCIONES[k].titulo })).concat([{ tipo: 'ir', ruta: 'cotizador', label: 'Ir al cotizador' }]) });
    pintar(); enfocarCampo();
    return;
  }
  await preguntarIA(q, {});
}

/** Una de las siete: se lee el taller y se contesta con la aritmética de Control. */
async function preguntarLocal(intent, textoPregunta) {
  if (_ocupado || !INTENCIONES[intent]) return;
  _ocupado = true;
  _msgs.push({ rol: 'yo', texto: textoPregunta || INTENCIONES[intent].pregunta, ts: Date.now() });
  pintar();
  try {
    await leerSiHaceFalta(true);
    const r = respuestaLocal(intent, _resumen);
    _msgs.push({ rol: 'bot', local: true, intent, ts: Date.now(),
      texto: (r && r.texto) || 'No supe contestar eso con lo que hay aquí.', acciones: (r && r.acciones) || [] });
  } catch (e) {
    _msgs.push({ rol: 'error', ts: Date.now(), texto: 'No pude leer los datos de este dispositivo: ' + (e && e.message ? e.message : 'error desconocido') });
  }
  _ocupado = false;
  pintar(); enfocarCampo();
}

/** Una pregunta libre, a la IA. Pide el «entendido» la primera vez. */
async function preguntarIA(q, opts) {
  if (_ocupado) return;
  const cadena = cadenaIA(localStorage);
  if (!cadena.length) { pintar(); return; }
  if (!opts.yaAnotada) _msgs.push({ rol: 'yo', texto: q, ts: Date.now() });

  if (Prefs.get(CLAVE_OK, false) !== true) {
    _pendienteIA = q;
    _msgs.push({ rol: 'permiso', ts: Date.now(), con: (PROVEEDOR_NOMBRE[cadena[0].prov] || cadena[0].prov) + ' · ' + cadena[0].model });
    pintar();
    return;
  }

  _ocupado = true;
  _cancelado = false;
  _msgs.push({ rol: 'espera', texto: 'Leyendo el taller…', ts: Date.now() });
  pintar();

  let resumen;
  try {
    await leerSiHaceFalta(true);
    resumen = _resumen;
  } catch (e) {
    quitarEspera();
    _msgs.push({ rol: 'error', texto: 'No pude leer los datos de este dispositivo: ' + (e && e.message ? e.message : 'error desconocido'), ts: Date.now() });
    _ocupado = false; pintar(); return;
  }

  /* Lo que queda en el hilo cuando se cerró el panel antes de la respuesta: se dice, para que
     al volver a abrirlo la pregunta no parezca colgada, y se dice que no salió a nadie más. */
  const cancelada = () => {
    quitarEspera();
    _msgs.push({ rol: 'error', ts: Date.now(),
      texto: 'Quedó sin respuesta: cerraste el asistente y la pregunta se canceló, así que no se le mandó a ningún otro proveedor.' });
    _cancelado = false; _ocupado = false;
    pintar();
  };
  if (_cancelado) { cancelada(); return; }

  const sistema = promptSistema(resumen);
  /* El hilo que viaja: las últimas vueltas, sin los avisos de espera ni los errores. Las
     respuestas locales van también: la IA sabe qué se le contestó ya y puede seguir de ahí. */
  const previos = _msgs.filter(m => m.rol === 'yo' || m.rol === 'bot').slice(0, -1).slice(-MAX_HISTORIA * 2)
    .map(m => ({ role: m.rol === 'yo' ? 'user' : 'assistant', content: m.texto }));

  let ultimoError = null;
  for (let i = 0; i < Math.min(cadena.length, 4); i++) {
    const c = cadena[i];
    ponerEspera('Preguntando a ' + (PROVEEDOR_NOMBRE[c.prov] || c.prov) + (i ? ' (intento ' + (i + 1) + ')' : '') + '…');
    try {
      const r = await llamar(c, sistema, previos, q);
      /* Una respuesta que llegó justo después de cerrar tampoco se pinta como si nada. */
      if (_cancelado) { cancelada(); return; }
      quitarEspera();
      _msgs.push({ rol: 'bot', texto: r, ts: Date.now(), con: (PROVEEDOR_NOMBRE[c.prov] || c.prov) + ' · ' + c.model });
      ultimoError = null;
      break;
    } catch (e) {
      /* Antes de pasar al siguiente proveedor: si se cerró el panel, no hay siguiente. */
      if (_cancelado || (e && e.cancelado)) { cancelada(); return; }
      ultimoError = e;
      /* Una llave inválida o un modelo que no existe no se arregla reintentando con la misma:
         se pasa a la siguiente. Un 429/5xx también pasa a la siguiente, que es la cuota nueva. */
      continue;
    }
  }
  if (ultimoError) {
    quitarEspera();
    _msgs.push({ rol: 'error', texto: (ultimoError.message || 'No hubo respuesta') + '. Revisa la llave en el cotizador o inténtalo en un momento. Las preguntas rápidas siguen funcionando sin IA.', ts: Date.now() });
  }
  _ocupado = false;
  pintar(); enfocarCampo();
}

function ponerEspera(texto) {
  const e = _msgs.find(m => m.rol === 'espera');
  if (e) e.texto = texto; else _msgs.push({ rol: 'espera', texto, ts: Date.now() });
  const el = document.querySelector('#ia-cuerpo .ia-espera');
  if (el) el.innerHTML = ico('i-reloj') + ' ' + esc(texto);
}
function quitarEspera() { _msgs = _msgs.filter(m => m.rol !== 'espera'); }

/* ----- Leer el taller: todo local, por la capa de datos -----
   Se relee si la última lectura tiene más de 45 s o si se pide a la fuerza (antes de
   contestar): el resumen de la portada puede tener medio minuto; una respuesta, no. */
async function leerSiHaceFalta(forzar) {
  if (!forzar && _resumen && Date.now() - _leido < FRESCURA_MS) return _resumen;
  _resumen = await leerTaller();
  _leido = Date.now();
  return _resumen;
}

async function leerTaller() {
  if (!DB.estado().ok) throw new Error(DB.motivoTexto() || 'la base no abrió');
  const hoy = hoyISO();
  const veDinero = Prefs.veDinero();
  const [proyectos, insts, cts, mat, hoja] = await Promise.all([
    Proy.listar({}), Agenda.listar({ vivas: true }), Material.constantes(), Agenda.contextoMaterial(),
    /* El récord de la hoja, para que «¿cuánto vendimos?» conteste lo del negocio y no lo de
       este aparato: la misma lista unificada que pinta Control. Sin dinero no se lee. */
    veDinero ? DB.listar('ventas_hoja') : Promise.resolve([]),
  ]);
  const ventas = veDinero ? Ventas.unificar(proyectos, hoja).ventas : proyectos;
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
  const ganados = new Set(ventas.map(p => p.folio_global).filter(Boolean));
  const sinDecidir = Cot.sinDecidir(ganados);
  const kpi = veDinero ? Ventas.indicadores(ventas, sinDecidir, { hoy, valorDe: Cot.totalVendido }) : null;
  const conversion = veDinero ? Ventas.conversion(Cot.historial(), ventas, Prefs.dispositivo()) : null;

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
      /* La key va en la cabecera x-goog-api-key, como en ia.js del cotizador: un ?key= en la URL
         queda escrito en el historial de red, en los HAR que se comparten y en cualquier proxy. */
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(c.model) +
        ':generateContent';
      const r = await pedir(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key }, body: JSON.stringify(body), signal: ctl.signal });
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
    if (opts.signal && opts.signal.aborted && _cancelado) { const c = new Error('cancelado'); c.cancelado = true; throw c; }
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

void toast;
