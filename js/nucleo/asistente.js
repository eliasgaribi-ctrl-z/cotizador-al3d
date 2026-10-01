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
        llave en la hoja (Qwen, DeepSeek o Gemini), y la pregunta sale por el puente: las llaves
        ya no viven en ningún teléfono. La primera vez que algo va a salir
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
import * as Puente from '../datos/puente.js';
import { armarResumen, promptSistema, mdLite, cadenaIA, PROVEEDOR_NOMBRE, INTENCIONES,
         detectarIntencion, respuestaLocal, resumenDelDia, sugerirIntenciones } from '../datos/asistente-contexto.js';
import { $, ico, esc, money, toast, voz, scrollSuave, abrirCapa, cerrarCapa, copiarTexto, hoyISO, fmtFecha } from './ui.js';

const CAPA = 'pf-ia';
const CLAVE_OK = Prefs.CLAVES.IA_OK;    // «entendido»: lo que pregunte a la IA viaja con un resumen
const TIMEOUT = 60000;
const MAX_HISTORIA = 8;                   // pares pregunta/respuesta que viajan de contexto
const FRESCURA_MS = 45000;                // cuánto vale una lectura del taller antes de releer

/* La conversación vive en memoria mientras la pestaña esté abierta. No se guarda: es una
   consulta, no un registro, y guardarla sería guardar copias del resumen del negocio. */
let _msgs = [];                 // [{rol:'yo'|'bot'|'traza'|'error'|'permiso', texto, ts, con?, local?, intent?, nodo?}]
let _ctx = null;
let _ocupado = false;
let _abort = null;
/* Qué proveedores tienen llave en la hoja, según /salud. Se pregunta al abrir el panel; null
   mientras no se sepa, y entonces se ofrece la IA igual: si no hay llave, la hoja lo dice. */
let _iaEstado = null;
function refrescarIA() {
  Puente.hablar('salud', {}).then(r => { if (r && r.ok && r.ia) { _iaEstado = r.ia; pintar(); } }).catch(() => {});
}
/* Cerrar el panel CANCELA la pregunta en vuelo. La cancelación se leía de `!_ocupado`, que
   durante una petición es siempre falso, así que el abort de `cerrar()` se reportaba como «el
   proveedor tardó demasiado» y el bucle pasaba al siguiente: el resumen del negocio —4.5 KB,
   con importes— salía a Groq cuando la persona ya había cerrado el asistente. Una bandera
   propia, puesta por quien cierra, es lo único que distingue «me fui» de «no contestó». */
let _cancelado = false;
/* Quién canceló, para decirlo con verdad en el hilo: «cerraste el asistente» y «la detuviste» no
   son lo mismo, y poner la primera frase cuando se tocó «Detener» era mentirle a quien lo tocó. */
let _canceloPor = '';
/* Verdadero SOLO mientras se espera a la IA (no al contestar con lo que se calcula aquí, que
   tarda decenas de milisegundos y no hay nada que detener). Es lo que vuelve «Preguntar» en
   «Detener» (F2). */
let _detenible = false;
/* Lo último que se pintó en el hilo —cuántos mensajes y de cuándo es el último—: sirve para saber
   si un pintar() trae algo NUEVO (y entonces se acomoda el scroll y entra la burbuja) o es un
   repintado cualquiera, que no debe mover a quien está leyendo (F15). */
let _firma = '';
let _trazas = 0;                // para darle a cada traza un id que no se repita
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
  if (b) {
    b.addEventListener('click', abrir);
    /* En el teléfono el botón se aparta mientras se baja por la página y vuelve al subir: con el
       dock y la barra de acción eran tres capas flotantes encima de la lista que se está
       leyendo. Al llegar al final vuelve, que es donde ya tiene su hueco reservado. */
    let y0 = window.scrollY, pend = false;
    window.addEventListener('scroll', () => {
      if (pend) return; pend = true;
      requestAnimationFrame(() => {
        pend = false;
        const y = window.scrollY, dy = y - y0;
        const alFondo = y + innerHeight >= document.documentElement.scrollHeight - 8;
        if (Math.abs(dy) < 12 && !alFondo) return;
        const telefono = matchMedia('(max-width:759px)').matches;
        b.classList.toggle('apartado', telefono && dy > 0 && y > 80 && !alFondo);
        y0 = y;
      });
    }, { passive: true });
  }
  const capa = $(CAPA);
  if (capa) {
    capa.addEventListener('click', alClic);
    capa.addEventListener('keydown', alTecla);
    capa.addEventListener('input', alEscribir);
  }
  /* La tira de preguntas rápidas se corta por la derecha sin decir que hay más (F30). El fundido
     solo sale del lado donde todavía hay contenido, y como se pasa un SELECTOR sirve para la tira
     de cada repintado del panel: se pide una vez aquí y no hay que volver a pedirla. */
  if (window.Piezas && window.Piezas.bordesDesvanecidos) window.Piezas.bordesDesvanecidos('.ia-tira', { eje: 'x' });
}

export async function abrir() {
  pintar();
  abrirCapa(CAPA, { hist: true });
  refrescarIA();
  /* El resumen de hoy se lee al abrir —es local y tarda decenas de milisegundos— y se pinta
     en cuanto llega. Si tarda, el panel ya está abierto con las preguntas; nada espera. */
  try { await leerSiHaceFalta(); } catch (_) {}
  pintar();
  enfocarCampo();
}

export function cerrar() {
  if (_ocupado) { _cancelado = true; _canceloPor = 'cerro'; }
  if (_abort) { try { _abort.abort(); } catch (_) {} _abort = null; }
  cerrarCapa(CAPA);
}

/* «Detener» (F2): cancela la pregunta en vuelo SIN cerrar el panel, por el mismo camino que
   `cerrar()` —la bandera `_cancelado` y el corte de `_abort`—. Antes la única forma de no seguir
   esperando era cerrar el asistente, y una respuesta que se tarda 60 s por proveedor (hasta cuatro)
   obligaba a irse de la pantalla donde estaba la conversación. */
function detener() {
  if (!_ocupado || !_detenible || _cancelado) return;
  _cancelado = true; _canceloPor = 'detuvo';
  if (_abort) { try { _abort.abort(); } catch (_) {} _abort = null; }
  voz('Pregunta detenida');
}

/* ============================================================================
   Pintar
   ============================================================================ */

function pintar() {
  const capa = $(CAPA); if (!capa) return;
  /* El panel se reescribe entero, con el <textarea> dentro. Cuando /salud contestaba con la
     pregunta a medio escribir —con mala señal tarda segundos—, el texto desaparecía. Se guarda
     lo escrito, el foco y el cursor, y se devuelven al final. */
  const ta0 = $('ia-pregunta');
  const borrador = ta0 ? ta0.value : '';
  const conFoco = !!ta0 && document.activeElement === ta0;
  const sel = ta0 ? [ta0.selectionStart, ta0.selectionEnd] : null;
  const enviarConFoco = !!document.activeElement && document.activeElement.classList &&
    document.activeElement.classList.contains('ia-enviar') && capa.contains(document.activeElement);
  /* Y el lugar donde se iba leyendo. Cada repintado nacía con el scroll en 0 y lo mandaba al
     fondo: quien leía el principio de una respuesta larga perdía el sitio cuando /salud contestaba. */
  const cuerpo0 = $('ia-cuerpo');
  const y0 = cuerpo0 ? cuerpo0.scrollTop : 0;
  /* Al abrir, el panel se pinta ANTES de mostrarse (ver abrir()): ahí no hay animación que valga. */
  const alAbrir = !capa.classList.contains('show');
  const ultimo = _msgs[_msgs.length - 1];
  const firma = _msgs.length + ':' + (ultimo ? ultimo.ts : '');
  const nuevo = firma !== _firma;
  _firma = firma;
  const cadena = cadenaIA(_iaEstado);
  const hayLlave = cadena.length > 0;
  const quien = cadena[0] ? (PROVEEDOR_NOMBRE[cadena[0].prov] || cadena[0].prov) + ' · ' + cadena[0].model : '';
  const hayHilo = _msgs.length > 0;

  const inner =
    '<div class="pf-panel-h">' + ico('i-ia', 'ia-ico') +
      '<div class="ia-titulo"><h2>Asistente del taller</h2>' +
        '<span class="ia-sub">' + (hayLlave ? 'Solo lectura · lo calculable se contesta aquí; lo demás, ' + esc(quien) : 'Solo lectura · sin llave de IA: contesta lo que se calcula aquí') + '</span></div>' +
      (hayHilo ? '<button type="button" class="pf-cerrar" data-ia-limpiar title="Empezar de nuevo" aria-label="Borrar la conversación">' + ico('i-basura') + '</button>' : '') +
      '<button type="button" class="pf-cerrar" data-ia-cerrar aria-label="Cerrar el asistente">' + ico('i-cerrar') + '</button>' +
    '</div>' +
    '<div class="pf-panel-b ia-cuerpo" id="ia-cuerpo">' + (hayHilo ? hiloHTML(nuevo && !alAbrir) : portadaHTML()) + '</div>' +
    '<div class="ia-pie-caja">' +
      (hayHilo ? tiraHTML() : '') +
      '<div class="pf-panel-f ia-pie">' +
        '<textarea id="ia-pregunta" rows="1" placeholder="Escribe tu pregunta…" aria-label="Tu pregunta"' + (_ocupado ? ' disabled' : '') + '></textarea>' +
        /* «Preguntar» nace fantasma y se llena de color en cuanto hay texto (`.listo`, ver
           `alEscribir`); mientras la IA contesta se vuelve el cuadro de «Detener». Siempre
           `aria-disabled` y nunca `disabled`: un botón apagado no recibe el toque, y «Detener»
           tiene que recibirlo justo cuando todo lo demás está esperando (F2). */
        (_detenible
          ? '<button type="button" class="btn ia-enviar detener" data-ia-enviar aria-label="Detener la pregunta">' + '<span class="ia-parar" aria-hidden="true"></span></button>'
          : '<button type="button" class="btn ia-enviar" data-ia-enviar aria-disabled="true" aria-label="Preguntar">' + ico('i-subir') + '</button>') +
      '</div>' +
      '<p class="ia-pista">Enter envía · Shift+Enter hace renglón' + (hayLlave ? '' : ' · para preguntas libres, Dirección pega una llave de IA en la hoja') + '</p>' +
    '</div>';
  /* El panel se conserva y solo se rehace lo de adentro: abrirCapa() deja la entrada viva 360 ms
     (.entra, ui.js), y un panel nuevo en ese plazo —/salud contesta enseguida— volvía a entrar
     desde abajo en el segundo pintado. */
  const panel = capa.querySelector(':scope>.ia-panel');
  if (panel) panel.innerHTML = inner;
  else capa.innerHTML = '<div class="pf-panel ia-panel">' + inner + '</div>';
  /* Las trazas (la espera y las ya plegadas) viven en su propio nodo, con su reloj andando: se
     devuelven a su sitio en vez de pintarse otra vez, porque repintarlas reiniciaría el «14 s». */
  capa.querySelectorAll('[data-ia-traza]').forEach(ph => {
    const m = _msgs.find(x => x.id === ph.dataset.iaTraza);
    if (m && m.nodo) ph.replaceWith(m.nodo);
  });
  const ta = $('ia-pregunta');
  if (ta && borrador) { ta.value = borrador; alEscribir({ target: ta }); }
  if (ta && conFoco && !_ocupado) {
    try { ta.focus({ preventScroll: true }); if (sel) ta.setSelectionRange(sel[0], sel[1]); } catch (_) {}
  }
  /* Si el foco estaba en el campo y empieza la espera, o ya estaba en «Detener», se queda en
     «Detener»: quien navega con teclado no puede caer al <body> justo cuando necesita cancelar. */
  if (_detenible && (conFoco || enviarConFoco)) {
    const b = capa.querySelector('.ia-enviar');
    if (b) { try { b.focus({ preventScroll: true }); } catch (_) {} }
  }
  acomodar(y0, alAbrir, nuevo);
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
    /* La forma de lo que va a llegar, en vez de un reloj fijo con un renglón: cuatro cajas con el
       alto y el ritmo de `.ia-cifras`, así que al llegar las cifras no se mueve nada (F16). La
       pieza ya trae `aria-busy` y el texto de estado en un `role="status"`. */
    const P = window.Piezas;
    if (P && P.silueta) {
      return '<div class="ia-hoy ia-hoy-cargando">' + P.silueta('cifras', { cifras: dinero ? 4 : 3, texto: 'Leyendo el taller…' }) + '</div>';
    }
    return '<div class="ia-hoy ia-hoy-cargando" aria-busy="true"><p class="ia-hoy-t">Leyendo el taller…</p></div>';
  }
  const d = resumenDelDia(_resumen);
  const cifra = (v, t, cls) => '<button type="button" class="ia-cifra' + (cls ? ' ' + cls : '') + '" data-ia-intent="' + (cls === 'dinero' ? 'cobranza' : 'hoy') + '"><b>' + esc(v) + '</b><span>' + esc(t) + '</span></button>';
  const c = [];
  c.push('<button type="button" class="ia-cifra' + (d.tarde ? ' urge' : '') + '" data-ia-intent="tarde"><b>' + d.enTaller + '</b><span>' + (d.enTaller === 1 ? 'en el taller' : 'en el taller') + (d.tarde ? ' · <em>' + d.tarde + ' tarde</em>' : '') + '</span></button>');
  c.push('<button type="button" class="ia-cifra' + (d.vencidas ? ' urge' : '') + '" data-ia-intent="semana"><b>' + d.semana + '</b><span>' + (d.semana === 1 ? 'instalación en 7 días' : 'instalaciones en 7 días') + (d.vencidas ? ' · <em>' + d.vencidas + ' sin marcar</em>' : '') + '</span></button>');
  if (dinero) {
    /* «Ventas»: `conSaldo` cuenta la cartera del récord, con las que solo están en la hoja y no
       tienen ficha aquí. Decía «3 proyectos» con dos botones «Abrir» y Control diciendo «3 ventas». */
    c.push('<button type="button" class="ia-cifra dinero" data-ia-intent="cobranza"><b>' + esc(money(d.porCobrar)) + '</b><span>por cobrar · ' + d.conSaldo + (d.conSaldo === 1 ? ' venta' : ' ventas') + '</span></button>');
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

/* `conNueva`: el último mensaje acaba de llegar. Solo ESE entra con su subida de 150 ms (F15): como
   el panel se pinta entero en cada cambio, una entrada en todas las burbujas las haría saltar a
   todas cada vez. */
function hiloHTML(conNueva) {
  const hayLlave = cadenaIA(_iaEstado).length > 0;
  const ult = _msgs.length - 1;
  const bot = i => '<div class="ia-msg bot"' + (conNueva && i === ult ? ' data-nueva' : '') + '>';
  return '<div class="ia-hilo">' + _msgs.map((m, i) => {
    if (m.rol === 'yo') return '<div class="ia-msg yo"><div class="ia-burbuja">' + esc(m.texto) + '</div></div>';
    /* La traza no se pinta aquí: se deja el hueco y `pintar()` mete su nodo, que lleva el reloj. */
    if (m.rol === 'traza') {
      return '<div class="ia-msg bot"><div class="ia-burbuja ia-traza-caja" data-ia-traza="' + esc(m.id) + '">' +
        (m.nodo ? '' : esc(m.texto || 'Preguntando…')) + '</div></div>';
    }
    if (m.rol === 'error') return bot(i) + '<div class="ia-burbuja ia-mal">' + ico('i-aviso') + ' ' + esc(m.texto) + '</div></div>';
    if (m.rol === 'permiso') {
      return bot(i) + '<div class="ia-burbuja ia-permiso">' + ico('i-aviso') +
        '<div><b>Esta pregunta va a la IA.</b> Viaja a <b>' + esc(m.con || '') + '</b> junto con un resumen de lo que hay en este dispositivo: ' +
        'proyectos con su etapa' + (Prefs.veDinero() ? ', importes y saldos' : '') + ', agenda, material y los últimos movimientos. Sin teléfonos ni direcciones. Se pregunta una sola vez.</div>' +
        '<div class="btn-fila"><button type="button" class="btn btn-pri pf-btn-corto" data-ia-ok>Entendido, enviar</button>' +
        '<button type="button" class="btn btn-gho pf-btn-corto" data-ia-no>Mejor no</button></div></div></div>';
    }
    const hora = horaDe(m.ts);
    const fuente = m.local
      ? '<span class="ia-fuente local" title="Calculado en este dispositivo, sin mandar nada a la IA">' + ico('i-candado') + ' Calculado aquí · ' + hora + '</span>'
      : '<span class="ia-fuente">' + ico('i-ia') + ' ' + esc(m.con || 'IA') + ' · ' + hora + '</span>';
    return bot(i) + '<div class="ia-burbuja">' + mdLite(m.texto) + '</div>' +
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

/* Dónde queda el scroll después de pintar (F15).

   La portada se lee de arriba, que es donde están las cifras de hoy: desplazarla al fondo le
   cortaba el encabezado. El hilo, en cambio, se bajaba SIEMPRE hasta `scrollHeight`, y una
   cobranza de 20 renglones se abría mostrando su final: había que subir con el dedo para leer
   por dónde empezaba. Ahora una respuesta nueva se ancla en SU principio, y lo que se escribe
   (tu pregunta, la traza de la espera) sigue bajando al fondo porque ahí es donde pasa algo.

   Un repintado sin nada nuevo —/salud que contesta, un cambio de llave— devuelve el scroll
   adonde estaba: antes mandaba al fondo a quien leía el principio. Y al abrir el panel con una
   conversación empezada se ve el principio de lo último que se contestó, sin animar. */
function acomodar(y0, alAbrir, nuevo) {
  const c = $('ia-cuerpo');
  if (!c) return;
  if (!_msgs.length) { c.scrollTop = 0; return; }
  if (!nuevo && !alAbrir) { c.scrollTop = y0; return; }
  c.scrollTop = alAbrir ? 0 : y0;
  requestAnimationFrame(() => {
    const cuerpo = $('ia-cuerpo');
    if (!cuerpo) return;
    const ult = _msgs[_msgs.length - 1];
    const respuesta = !!ult && (ult.rol === 'bot' || ult.rol === 'error');
    const el = respuesta ? cuerpo.querySelector('.ia-hilo > .ia-msg:last-child') : null;
    /* Se mide y se desplaza el cuerpo a mano, sin scrollIntoView: éste además corre los
       antepasados con scroll, y el panel no tiene por qué mover la página de abajo. */
    const top = el ? cuerpo.scrollTop + el.getBoundingClientRect().top - cuerpo.getBoundingClientRect().top - 4
                   : cuerpo.scrollHeight;
    try { cuerpo.scrollTo({ top: Math.max(0, top), behavior: alAbrir ? 'auto' : scrollSuave() }); }
    catch (_) { cuerpo.scrollTop = Math.max(0, top); }
  });
}

/* Con el dedo, no: en el teléfono un focus() abre el teclado, que tapaba justo la respuesta y
   sus botones después de cada pregunta. El teclado lo abre quien toca el campo. */
const conDedo = () => { try { return matchMedia('(pointer:coarse)').matches; } catch (_) { return false; } };
function enfocarCampo() {
  if (conDedo()) return;
  const capa = $(CAPA);
  if (!capa || !capa.classList.contains('show')) return;      // con el panel cerrado no hay campo que enfocar
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
  const env = t.closest('[data-ia-enviar]');
  if (env) {
    /* Durante la espera de la IA este mismo botón es «Detener». Con el campo vacío no hace nada,
       pero tampoco se queda mudo: lleva al campo, que es lo que falta. */
    if (_detenible) { detener(); return; }
    if (_ocupado) return;
    if (env.getAttribute('aria-disabled') === 'true') { const ta = $('ia-pregunta'); if (ta) { try { ta.focus(); } catch (_) {} } return; }
    enviarDelCampo();
    return;
  }
  const cp = t.closest('[data-ia-copiar]');
  if (cp) {
    const m = _msgs.find(x => String(x.ts) === cp.dataset.iaCopiar);
    if (m) copiarRespuesta(m.texto, cp);
  }
}

/* Copiar una respuesta (F31). El botón que se tocó lo dice él mismo —la palomita se dibuja y el
   rótulo pasa a «Copiada» 1.8 s—, además del aviso de siempre, que es el que se oye. `copiarTexto`
   también confirma en su botón, pero con su «Copiado» genérico; una respuesta es femenina y aquí se
   quiere el rótulo bien dicho. Si la pieza no está, se cae a `copiarTexto` como antes. */
function copiarRespuesta(texto, boton) {
  const P = window.Piezas;
  if (!P || !P.copiar) { copiarTexto(texto, 'Respuesta copiada'); return; }
  P.copiar(texto, { boton, ok: 'Copiada' }).then(bien => {
    if (bien) toast('Respuesta copiada', 'ok', 3400);
    else toast('Este navegador no dejó copiar — selecciona el texto a mano', 'err', 4200);
  });
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
  /* El botón de enviar se llena de color SOLO cuando hay algo que enviar (F2). Un botón de color
     con el campo vacío miente: parece lo que hay que tocar y no hace nada, y en esta pantalla hay
     un solo botón de color a la vez. Sin texto vuelve a fantasma y a `aria-disabled`. */
  const b = document.querySelector('#' + CAPA + ' .ia-enviar');
  if (b && !_detenible) {
    const listo = ta.value.trim().length > 0 && !_ocupado;
    b.classList.toggle('listo', listo);
    b.setAttribute('aria-disabled', listo ? 'false' : 'true');
  }
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
  const hayLlave = cadenaIA(_iaEstado).length > 0;
  if (intent && (!hayLlave || intent !== 'hoy')) { await preguntarLocal(intent, q); return; }
  if (intent) { await preguntarLocal(intent, q); return; }
  if (!hayLlave) {
    _msgs.push({ rol: 'yo', texto: q, ts: Date.now() });
    const cerca = sugerirIntenciones(q).filter(k => Prefs.veDinero() || !INTENCIONES[k].dinero);
    _msgs.push({ rol: 'bot', local: true, ts: Date.now(),
      texto: 'Eso no lo puedo calcular aquí, y la hoja no tiene ninguna llave de IA para preguntas libres. ' +
        (cerca.length ? '¿Buscabas alguna de estas?' : '') +
        '\n\nPara preguntas libres, Dirección pega una llave de Qwen, DeepSeek o Gemini en la hoja (⚡ AL3D → Llaves de IA): sirve para el cotizador y para aquí.',
      acciones: cerca.map(k => ({ tipo: 'intent', intent: k, label: INTENCIONES[k].titulo })) });
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
  const cadena = cadenaIA(_iaEstado);
  if (!cadena.length) { pintar(); return; }
  if (!opts.yaAnotada) _msgs.push({ rol: 'yo', texto: q, ts: Date.now() });

  if (Prefs.get(CLAVE_OK, false) !== true) {
    _pendienteIA = q;
    _msgs.push({ rol: 'permiso', ts: Date.now(), con: (PROVEEDOR_NOMBRE[cadena[0].prov] || cadena[0].prov) + ' · ' + cadena[0].model });
    pintar();
    return;
  }

  _ocupado = true; _detenible = true;
  _cancelado = false; _canceloPor = '';
  /* Las banderas se sueltan SIEMPRE: la función tiene seis salidas y cada una lo repetía a mano.
     Una que lo olvidara dejaba el asistente mudo («Detener» sin nada que detener, o el campo
     apagado) hasta recargar la página. */
  try { await correrIA(q, cadena); }
  finally { _ocupado = false; _detenible = false; _cancelado = false; _canceloPor = ''; }
  pintar(); enfocarCampo();
}

/* La espera como una lista que avanza (F14), en vez de un renglón que se reescribe.

   Antes: «Preguntando a Gemini (intento 2)…» BORRABA que Qwen no tenía llave y por qué, y a los
   40 s nadie sabía si la app trabajaba o se había colgado. Ahora cada cosa que pasa de verdad es un
   paso —«Leí el taller», «Qwen · sin llave», «Preguntando a Gemini · 14 s»— con su reloj, y al
   contestar la lista se pliega en «Contestó Gemini en 18 s», con los pasos adentro por si alguien
   quiere ver por qué tardó. La pieza (P.traza) no inventa progreso: aquí se llama a `paso()` en
   cada vuelta del recorrido REAL por los proveedores.

   La traza vive en su propio nodo, guardado en el mensaje del hilo, y `pintar()` lo devuelve a su
   sitio cada vez: el panel se reescribe entero con innerHTML, y un nodo nuevo reiniciaría el reloj.
   Los textos y los motivos —que llegan de la hoja— entran como texto, nunca como marcado. */
function abrirTraza() {
  const nodo = document.createElement('div');
  nodo.className = 'ia-burbuja ia-traza-caja';
  const P = window.Piezas;
  const t = P && P.traza ? P.traza(nodo, { reloj: 's' }) : null;
  /* Con `id` propio y no con `ts`: la pregunta y su traza nacen en el mismo milisegundo, y buscar la
     traza por la hora devolvía la pregunta —que no trae nodo—, así que la espera salía vacía. */
  const msg = { rol: 'traza', id: 'traza-' + (++_trazas), ts: Date.now(), nodo: t ? nodo : null, texto: 'Preguntando…' };
  _msgs.push(msg);
  const desde = Date.now();
  const enCuanto = () => {
    const r = P && P.traza && P.traza.reloj ? P.traza.reloj(Date.now() - desde, 's') : '';
    return r ? ' en ' + r : '';
  };
  return {
    paso(clave, texto, estado, detalle) { if (t) t.paso(clave, texto, estado, detalle); else msg.texto = texto; },
    cerrar(ok, resumen) { if (t) t.terminar({ ok, resumen }); },
    enCuanto,
  };
}

/* Cada motivo cabe en un renglón del hilo: el de la hoja puede traer un párrafo. Y sin el nombre del
   proveedor delante: el paso ya lo dice («DeepSeek» + «DeepSeek no contestó» se leía repetido). */
const motivoCorto = (e, nombre) => {
  let m = String((e && e.message) || 'no contestó').replace(/\s+/g, ' ').trim();
  if (nombre && m.toLowerCase().startsWith(String(nombre).toLowerCase() + ' ')) m = m.slice(nombre.length + 1);
  return m.slice(0, 120);
};

async function correrIA(q, cadena) {
  const tz = abrirTraza();
  tz.paso('taller', 'Leyendo el taller', 'trabaja');
  pintar();

  let resumen;
  try {
    await leerSiHaceFalta(true);
    resumen = _resumen;
    tz.paso('taller', 'Leí el taller', 'ok');
  } catch (e) {
    const msg = 'No pude leer los datos de este dispositivo: ' + (e && e.message ? e.message : 'error desconocido');
    tz.paso('taller', 'No pude leer el taller', 'mal');
    tz.cerrar(false, 'Sin respuesta');
    _msgs.push({ rol: 'error', texto: msg, ts: Date.now() });
    return;
  }

  /* Lo que queda en el hilo cuando se cerró el panel o se tocó «Detener» antes de la respuesta: se
     dice, para que la pregunta no parezca colgada, y se dice que no salió a nadie más. */
  const cancelada = () => {
    tz.cerrar(false, 'Detenida');
    _msgs.push({ rol: 'error', ts: Date.now(),
      texto: 'Quedó sin respuesta: ' + (_canceloPor === 'detuvo' ? 'la detuviste' : 'cerraste el asistente') +
        ' y la pregunta se canceló, así que no se le mandó a ningún otro proveedor.' });
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
    const nombre = PROVEEDOR_NOMBRE[c.prov] || c.prov;
    const clave = 'prov' + i;
    tz.paso(clave, 'Preguntando a ' + nombre + (i ? ' (intento ' + (i + 1) + ')' : ''), 'trabaja', '');
    try {
      const r = await llamar(c, sistema, previos, q);
      /* Una respuesta que llegó justo después de cerrar tampoco se pinta como si nada. */
      if (_cancelado) { tz.paso(clave, nombre, 'mal', 'detenida'); cancelada(); return; }
      tz.paso(clave, nombre, 'ok', '');
      tz.cerrar(true, 'Contestó ' + nombre + tz.enCuanto());
      _msgs.push({ rol: 'bot', texto: r, ts: Date.now(), con: nombre + ' · ' + c.model });
      ultimoError = null;
      break;
    } catch (e) {
      /* Antes de pasar al siguiente proveedor: si se cerró el panel o se detuvo, no hay siguiente. */
      if (_cancelado || (e && e.cancelado)) { tz.paso(clave, nombre, 'mal', 'detenida'); cancelada(); return; }
      ultimoError = e;
      /* Sin llave no es una falla: es un paso que se salta, y se lee distinto (guion ámbar). */
      if (e && e.sinLlave) tz.paso(clave, nombre, 'salta', 'sin llave');
      else tz.paso(clave, nombre, 'mal', motivoCorto(e, nombre));
      if (e && e.definitivo) break;   // cupo del día o cuenta sin permiso: es de la persona, no del proveedor
      /* Una llave inválida o un modelo que no existe no se arregla reintentando con la misma:
         se pasa a la siguiente. Un 429/5xx también pasa a la siguiente, que es la cuota nueva. */
      continue;
    }
  }
  if (ultimoError) {
    tz.cerrar(false, 'Ningún proveedor contestó');
    _msgs.push({ rol: 'error', texto: (ultimoError.message || 'No hubo respuesta') + '. Inténtalo en un momento. Las preguntas rápidas siguen funcionando sin IA.', ts: Date.now() });
  }
}

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

  /* `proyectos` arma el taller; `ventas`, el dinero. Se le pasaba solo `proyectos`, y la
     comisión de cada renglón salía del subtotal de este aparato mientras la restante venía de
     la hoja: dos cifras que se contradecían, y las ventas que solo están en la hoja no
     entraban a las comisiones. Sin dinero no viaja: a fabricación no le toca el récord. */
  return armarResumen({
    hoy, rol: Prefs.ROL_NOMBRE[Prefs.rol()] || Prefs.rol(), nombre: Prefs.nombre(), veDinero,
    proyectos, ventas: veDinero ? ventas : null, instalaciones: insts, ventanas, materialDe, kpi, conversion, faltantes, bajoMinimo,
    avisos, sinDecidir, cola: Cot.cola(), bitacora, valorDe: Cot.totalVendido,
  });
}

/* ----- La llamada, por la hoja -----
   Un intento por candidato; la cadena decide el siguiente. La hoja arma la petición de cada
   proveedor —Gemini con su API propia, Qwen y DeepSeek con el dialecto de chat— y contesta el
   texto, o por qué no. La petición no se puede cortar a medio vuelo: cerrar el panel marca la
   espera como cancelada y lo que llegue se tira. */
async function llamar(c, sistema, previos, pregunta) {
  /* La petición a la hoja no se puede cortar a medio vuelo (el puente no recibe señal de aborto),
     pero ESPERARLA sí: `abort()` rechaza una promesa de corte que compite con la respuesta. Antes
     cerrar el panel dejaba `_ocupado` puesto hasta que la hoja contestara —hasta 60 s—, y «Detener»
     no habría servido de nada: la pregunta siguiente se ignoraba mientras tanto. Lo que la hoja
     conteste después se tira. */
  const ctl = { abortado: false, abort() { this.abortado = true; if (this._corta) this._corta(); } };
  _abort = ctl;
  const cancelado = () => { const x = new Error('cancelado'); x.cancelado = true; return x; };
  const corte = new Promise((_, no) => { ctl._corta = () => no(cancelado()); });
  try {
    let r;
    try {
      r = await Promise.race([
        Puente.hablar('ia', { modo: 'chat', prov: c.prov, model: c.model, sistema, mensajes: previos, pregunta }, TIMEOUT),
        corte]);
    } catch (e) {
      if (ctl.abortado) throw cancelado();
      const x = new Error(e && e.codigo === 'ROL_SIN_PERMISO' ? e.message : 'no se pudo llegar a la hoja (revisa tu conexión)');
      x.definitivo = !!(e && e.codigo === 'ROL_SIN_PERMISO');
      throw x;
    }
    if (ctl.abortado) throw cancelado();
    if (r && r.ok && r.texto) return String(r.texto);
    if (r && r.codigo === 'SIN_LLAVE' && _iaEstado) _iaEstado[c.prov] = false;
    const x = new Error((r && r.mensaje) || ((PROVEEDOR_NOMBRE[c.prov] || c.prov) + ' no contestó'));
    x.definitivo = !!(r && (r.codigo === 'CUPO_AGOTADO' || r.codigo === 'ROL_SIN_PERMISO'));
    x.sinLlave = !!(r && r.codigo === 'SIN_LLAVE');
    throw x;
  } finally {
    if (_abort === ctl) _abort = null;
  }
}

