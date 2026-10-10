/* ============================================================================
   Primitivas de interfaz de la plataforma.

   Son las mismas del cotizador, reescritas como módulo ES. No es una reimplementación
   "parecida": el aviso emergente tiene la misma firma de cuatro parámetros, el mismo
   mínimo de 8 segundos cuando trae botón y la misma región que habla; los modales usan
   el mismo registro de capas con Escape, cerco de tabulador y botón atrás del teléfono.
   Si divergieran, la plataforma se sentiría como otra app, y de ahí sale la sensación de
   que uno de los dos está a medias.

   Lo que NO se copió: nada que dependa de Q, de las partidas o del PDF. Esto solo sabe
   de pantalla.
   ============================================================================ */

import { partesISO, hoyISO, fechaLocal, diasEntre } from './fechas.js';

export const $ = id => document.getElementById(id);

/* Mismo escapado que el cotizador, con el apóstrofo incluido: la plataforma también arma
   HTML por interpolación y también pasa folios dentro de onclick="f('${...}')". */
export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const money = n => '$' + Number(n || 0).toLocaleString('es-MX',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* La cifra de una tarjeta de cuentas que puede ser LARGA: un importe. Se cortaba. Las cuentas
   se reparten en una rejilla de mínimo 150 px y la tarjeta recorta lo que se sale, así que en
   una computadora de 1 280 px —seis por fila, 121 px de caja— «$212,900.00» se leía
   «$212,90» en las dos primeras de Control, y en el Tablero «$1,228,200.00» se quedaba en
   «$1,228,20». Los centavos no se quitan: el dinero lleva dos decimales siempre. Lo que cede
   es el tamaño, y solo lo que haga falta: la cifra lleva su largo en `--c` y la hoja la
   achica hasta que quepa en su tarjeta (ver `.pf-cuenta b.ajusta` en css/plataforma.css). */
export const cifraQueCabe = (t, largo) => {
  const s = String(t == null ? '' : t);
  /* `largo` es para una fila entera al mismo tamaño: el de la cifra más larga de la fila. */
  const n = Math.max(1, Number(largo) || 0, s.length);
  return '<b class="ajusta" style="--c:' + n + '">' + esc(s) + '</b>';
};

/* Cantidades de material. El dinero lleva dos decimales siempre porque son pesos; una
   cantidad de material NO: «2 láminas» y «2.00 láminas» dicen lo mismo y la segunda se
   lee como si alguien hubiera medido hasta el centésimo. Se enseñan hasta dos decimales
   pero solo los que hacen falta. */
export const cant = (n, u) => {
  const v = Number(n || 0);
  const t = (Math.round(v * 100) / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 });
  return u ? t + ' ' + (Math.abs(v) === 1 ? u : plural(u)) : t;
};
const PLURALES = { lamina: 'láminas', caja: 'cajas', bolsa: 'bolsas', unidad: 'unidades',
                   litro: 'litros', metro: 'metros', pieza: 'piezas', 'm²': 'm²', m: 'm', cm: 'cm' };
export const plural = u => PLURALES[u] || (u ? u + 's' : '');

/* ----- Cuánto hay en el almacén -----
   La existencia es la suma de movimientos sobre el último conteo, así que puede salir
   NEGATIVA: significa que se consumió material que nunca se registró como entrada. Es un
   dato correcto y útil —dice que el libro está incompleto—, pero «hay -0.31 láminas» se lee
   como un error del programa y hace que alguien deje de creerle a la pantalla. Se dice con
   palabras: no hay nada, y de cuánto va el hueco. */
export const cantHay = (n, u) => {
  const v = Number(n || 0);
  if (v > 0) return cant(v, u);
  if (v === 0) return 'nada';
  return 'nada (y el libro va ' + cant(-v, u) + ' abajo)';
};

export const ico = (n, cls) =>
  '<svg class="svgi' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + n + '"/></svg>';

/* ----- Fechas -----
   Todo lo que se guarda es 'YYYY-MM-DD'. Todo lo que se lee es es-MX. La conversión pasa
   por aquí y por ningún otro lado, y NUNCA por `new Date('2026-08-23')`, que se interpreta
   como UTC y en México devuelve el día anterior. Ese error costó un día de instalación en
   más de un sistema y aquí no cabe: se parte la cadena.

   La ARITMÉTICA —sumar días, contar días, el fin de mes, el bisiesto— vive en `fechas.js`,
   que es la capa de abajo y la que tiene pruebas. Aquí queda lo de PANTALLA: cómo se lee una
   fecha en español. Las tres primitivas se reexportan con el mismo nombre que tenían para
   que los seis módulos que ya piden `partesISO` a este archivo no cambien una línea. */
export { partesISO, hoyISO, fechaLocal } from './fechas.js';
import { MES_CORTO } from './fechas.js';
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const fmtFecha = iso => {
  const p = partesISO(iso); if (!p) return '';
  return p.d + ' ' + MES_CORTO[p.m - 1] + ' ' + p.a;
};
export const fmtFechaDia = iso => {
  const f = fechaLocal(iso); if (!f) return '';
  return DIA_CORTO[f.getDay()] + ' ' + fmtFecha(iso);
};
/** Días de hoy a `iso`. Negativo = ya pasó. Contra el reloj del dispositivo, que es lo
 *  correcto para pintar una tarjeta; lo que se tiene que poder probar usa `diasEntre` con
 *  un `hoy` que entra. */
export const diasHasta = iso => diasEntre(hoyISO(), iso);
/** «hoy», «mañana», «en 3 días», «hace 2 días». Es lo que se lee en las tarjetas. */
export const cuando = iso => {
  const d = diasHasta(iso);
  if (d === null) return '';
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  return d > 0 ? 'en ' + d + ' días' : 'hace ' + (-d) + ' días';
};
export const fmtHora = h => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); if (!m) return '';
  const H = +m[1], ap = H < 12 ? 'a.m.' : 'p.m.', h12 = H % 12 === 0 ? 12 : H % 12;
  return h12 + ':' + m[2] + ' ' + ap;
};

/* ----- Lo que habla -----
   Dos regiones que nunca se ocultan. El aviso emergente se escribe con el elemento
   todavía en visibility:hidden —o sea fuera del árbol de accesibilidad—, así que
   volverlo visible con el texto ya puesto no es una mutación que el lector de pantalla
   vea. Por eso el mensaje se repite aquí. Es la misma razón y el mismo arreglo que en el
   cotizador. */
export function voz(msg, urgente) {
  const el = $(urgente ? 'vozAlert' : 'vozStatus'); if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = String(msg || ''); });
}

/**
 * Aviso emergente. Misma firma que el del cotizador, y el mismo cuerpo: la pieza compartida
 * (js/piezas.js, P.aviso), que la plataforma pide por window.Piezas porque es un guion clásico
 * que index.html carga antes que este módulo.
 *
 * Era un solo #toast con un solo temporizador, y un aviso reescribía al otro: en Material,
 * hacerContar() lanza dos seguidos y el segundo se comía el primero aunque ése trajera
 * «Deshacer». Ahora #toast es una pila de dos: un error y uno con botón no se pisan —se apilan
 * o esperan su turno—, los informativos se reemplazan como siempre, y la mecha de 2 px dice
 * cuánto le queda y se pausa con el dedo, el cursor o el foco encima y con la app en segundo
 * plano. Se quita deslizándolo hacia abajo. Lo que es contrato no cambia: con botón dura 8 s
 * como mínimo —quien lo oye en vez de verlo tiene que encontrar el botón deslizando, y 2.6 s no
 * alcanzan ni para llegar—, el texto va por textContent y cada aviso se dice en la región que
 * habla (la asertiva para los errores), también el que espera su turno.
 * @param {string} msg
 * @param {''|'ok'|'err'} type
 * @param {number} dur ms
 * @param {{label:string, fn:Function}|null} accion
 * @returns {{cerrar:Function, vivo:boolean}|null}
 */
export function toast(msg, type = '', dur = 2600, accion = null) {
  if (accion && dur < 8000) dur = 8000;
  const P = window.Piezas;
  if (!P || !P.aviso) { voz(msg + (accion && accion.label ? ' — ' + accion.label + ' disponible' : ''), type === 'err'); return null; }
  return P.aviso(String(msg == null ? '' : msg), { tipo: type, dur, accion, pila: 'toast' });
}

/** Todo `Resultado` fallido se enseña igual. El mensaje ya viene escrito por la capa de datos. */
export function avisarResultado(r, msgOk) {
  if (r && r.ok) { if (msgOk) toast(msgOk, 'ok', 3200); return true; }
  toast((r && r.mensaje) || 'No se pudo completar', 'err', 4600);
  return false;
}

/* ----- El desplazamiento, con o sin animación -----
   Cuatro pantallas llevaban al renglón pedido con `scrollIntoView({behavior:'smooth'})` a
   secas —el Tablero, Qué atender, el Mapa y el Calendario— y la hoja de estilos ya apaga las
   animaciones con `prefers-reduced-motion`, pero un desplazamiento pedido desde JS no pasa
   por la hoja: a quien le marea el movimiento le seguía corriendo la pantalla entera. Se
   pregunta aquí, en el momento, porque la preferencia se puede cambiar con la app abierta. */
export function scrollSuave() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; }
  catch (_) { return 'auto'; }
}

/* ============================================================================
   Capas: modales, Escape, cerco de tabulador y el botón atrás del teléfono.

   El registro está ordenado de arriba hacia abajo por z-index, igual que en el
   cotizador. Escape cierra la de arriba, no todas.
   ============================================================================ */

const _CAPAS = [];   // [{id, cerrar}]

/** Se llama una vez por modal, al arrancar. El orden de registro ES el z-index. */
export function registrarCapa(id, cerrar) {
  if (!_CAPAS.some(c => c.id === id)) _CAPAS.unshift({ id, cerrar });
}

const _visible = id => { const e = $(id); return !!(e && e.classList.contains('show')); };
const _capaDeArriba = () => { for (const c of _CAPAS) if (_visible(c.id)) return $(c.id); return null; };

const _SEL_FOCO = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
                  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function _focablesDe(cont) {
  return Array.from(cont.querySelectorAll(_SEL_FOCO))
    .filter(e => e.offsetWidth || e.offsetHeight || e.getClientRects().length);
}

/* Devolver el foco al cerrar. Sin esto el foco se cae al <body> y quien navega con teclado
   vuelve al principio del documento: en la plataforma eso son seis módulos de distancia.

   Un MAPA por id de capa, no una variable suelta. Con una sola, al apilar dos capas —la
   ficha de un proyecto y encima el «¿seguro?» de #pf-pide, que es el camino normal— la
   segunda pisaba lo guardado por la primera; al cerrar la segunda se restauraba y se
   ponía a null, y al cerrar la primera ya no quedaba nada que restaurar: el cursor se
   caía al principio del documento, a seis módulos de donde estaba. El cotizador ya usaba
   un Map (index.html, _focoAntes) y esta era la misma pieza sin esa corrección. */
const _focoPrevio = new Map();

/* Cuántos `history.back()` salieron de `cerrarCapa` y todavía no llegan como popstate. El
   oyente de popstate no distingue el atrás del teléfono del que dispara el propio cierre, y
   trataba los dos igual: cerraba la siguiente capa con entrada. Así, cerrar la orden de trabajo
   con su X cerraba también la ficha de abajo, «Guardar el material» cerraba el catálogo, y
   «No se dio» desde la ficha no se podía contestar nunca —la ficha se cerraba, se abría la
   pregunta y el popstate de la ficha la cerraba al milisegundo—: Dirección no podía descartar
   un proyecto. Con la cuenta, el popstate propio solo se consume. */
let _backPropio = 0;
/* Las capas que se abrieron con `hist` mientras un back propio iba en vuelo. Su pushState se
   aplaza hasta que ese back llegue: en Chromium, `history.back()` seguido de `pushState()` en
   el mismo tick aterriza en la entrada de abajo y la nueva se pierde, así que la pregunta de
   «No se dio» quedaba abierta sin entrada y el atrás del teléfono se salía de la pantalla con
   ella puesta. Medido: estado final null y una entrada menos. */
const _pushPendiente = new Set();

/* El fondo entero detrás del velo: no solo el contenido, también las dos barras. Sin
   `inert`, el lector de pantalla seguía recorriendo la plataforma de atrás y leyéndola
   como si fuera del modal, y el tabulador se escapaba por la barra de arriba. La clase en
   <html> es la que bloquea el scroll del fondo, que en un teléfono es lo que hace que al
   deslizar dentro de una ficha se mueva la página de abajo. Mismo arreglo que el
   cotizador ya tenía en _fondoInerte(). */
/* La lista incluye el esqueleto NUEVO de la plataforma —la barra lateral, el encabezado y la
   barra de módulos del teléfono—, que sustituyeron a `.topbar`. `.topbar` se queda porque el
   cotizador suelto y el anidador la siguen teniendo. Sin las tres nuevas, con una ficha de
   proyecto abierta el tabulador se escapaba por la barra lateral y el lector de pantalla leía
   los seis módulos como si fueran del modal: exactamente el defecto que esta función existe
   para no tener. */
function _fondoInerte(v) {
  /* .pf-ia-btn también: flota fuera de todo y, con un panel abierto, seguía en el árbol de
     accesibilidad aunque el tabulador ya estuviera cercado. */
  document.querySelectorAll('.wrap,.topbar,.mbar,.pf-lat,.pf-cab,.pf-abajo,.pf-ia-btn')
    .forEach(e => { try { e.inert = v; } catch (_) {} });
  document.documentElement.classList.toggle('modal-abierto', v);
}

/**
 * Abre un modal. `volverA` es lo que recupera el foco al cerrar; si no se pasa, se usa
 * lo que estaba enfocado.
 * @param {string} id
 * @param {{volverA?:Element, hist?:boolean}} opts  hist=true empuja una entrada de
 *        historial para que el botón atrás del teléfono cierre el modal en vez de salir
 *        de la app. Es el mismo patrón que el escalador y el vectorizador.
 */
export function abrirCapa(id, opts = {}) {
  const el = $(id); if (!el) return false;
  /* Antes de inertar, o ya se perdió. Y no se guarda algo que viva dentro de OTRA capa:
     al cerrar esta, aquello va a estar desconectado o inerte. */
  const prev = opts.volverA || (document.activeElement !== document.body ? document.activeElement : null);
  const enOtraCapa = prev && prev.closest && _CAPAS.some(c => { const x = $(c.id); return x && x.contains(prev); });
  _focoPrevio.set(id, enOtraCapa ? null : prev);
  /* `entra` acota la entrada del panel al momento de abrir: ficha, hoja y asistente se
     repintan con la capa abierta, y sin esto cada repintado volvía a hacerlo subir. */
  el.classList.add('show', 'entra');
  clearTimeout(el._tEntra); el._tEntra = setTimeout(() => el.classList.remove('entra'), 360);
  _fondoInerte(true);
  if (opts.hist) {
    if (_backPropio > 0) { el.dataset.hist = '1'; _pushPendiente.add(id); }
    else { try { history.pushState({ capa: id }, ''); el.dataset.hist = '1'; } catch (_) {} }
  }
  const f = _focablesDe(el);
  /* Al primer elemento tocable, no al contenedor: un contenedor enfocado no anuncia nada
     y el primer Tab se va al principio del modal de todas formas. */
  if (f.length) requestAnimationFrame(() => { try { f[0].focus(); } catch (_) {} });
  return true;
}

export function cerrarCapa(id) {
  const el = $(id); if (!el) return;
  clearTimeout(el._tEntra);
  el.classList.remove('show', 'entra');
  if (el.dataset.hist === '1') {
    delete el.dataset.hist;
    /* Si su pushState seguía aplazado, no hay entrada que consumir: solo se olvida. */
    _pushPendiente.delete(id);
    /* history.back() es asíncrono. Si quien cierra abre otra cosa enseguida, se cruzan y
       el atrás del teléfono cierra lo recién abierto. Por eso el consumo de la entrada
       vive aquí y en el oyente de popstate, y en ningún otro lado. Y se cuenta: el popstate
       que va a llegar es de este cierre, no del botón atrás (ver `_backPropio`). */
    try { if (history.state && history.state.capa === id) { _backPropio++; history.back(); } } catch (_) {}
  }
  const prev = _focoPrevio.get(id); _focoPrevio.delete(id);
  /* El velo solo se levanta cuando no queda NINGUNA capa: con la ficha abierta debajo del
     «¿seguro?», quitar el inerte al cerrar el de arriba dejaba el fondo navegable con un
     modal todavía puesto. */
  if (!_capaDeArriba()) _fondoInerte(false);
  /* Solo se devuelve el foco si el elemento sigue existiendo Y sigue a la vista: el botón
     que abrió un modal a veces deja de existir mientras el modal está abierto —se repinta
     la lista de abajo—, y enfocar un huérfano es lo mismo que no enfocar nada. */
  if (prev && prev.isConnected && (prev.offsetWidth || prev.offsetHeight)) {
    requestAnimationFrame(() => { try { prev.focus(); } catch (_) {} });
  }
}

/* ----- Las hojas del teléfono se bajan con el dedo -----
   La ficha, la hoja de trabajo, el asistente y las preguntas son hojas altas pegadas abajo, y
   la × queda lejos del pulgar. El gesto era una copia del del cotizador, y las dos llevaban el
   mismo defecto —el velo se aclaraba con `opacity` sobre el padre de la hoja, así que la ficha
   entera se iba al 35 % con el dedo encima—; ahora es UNA pieza, P.hojasDeslizables() en
   js/piezas.js, con sus medidas y su porqué. Aquí solo se le dice qué es hoja en la plataforma
   y con qué se cierra cada una: la función de su capa, la misma de la ×, de Escape y del atrás,
   así que el cierre por gesto consume la entrada de historial igual que ellos.
   Solo en un documento: este módulo también lo importan las pruebas de node. */
const _piezas = typeof window !== 'undefined' ? window.Piezas : null;
if (_piezas && _piezas.hojasDeslizables) {
  _piezas.hojasDeslizables({
    hoja: '.pf-modal-bg.show>.pf-panel', cabeza: '.pf-panel-h', cuerpo: '.pf-panel-b',
    excluir: 'input,textarea,select,[contenteditable="true"],canvas,.leaflet-container',
    cierre: velo => { const c = _CAPAS.find(x => x.id === velo.id); return c ? c.cerrar : null; },
  });
}
/* Y lo que pasa por debajo de la barra de módulos del teléfono —y de la barra de acción, cuando
   un módulo la pone encima— se funde en vez de cortarse contra su canto (pieza 11). */
if (_piezas && _piezas.desenfoqueProgresivo) _piezas.desenfoqueProgresivo(['#pf-abajo', '#pf-mbar'], { lado: 'abajo' });

/* ----- Repintar una capa abierta sin perder el lugar -----
   La ficha de un proyecto, la hoja de trabajo y las hojas del Calendario se rehacen con
   innerHTML después de cada toque (Etapa, Estatus, Cuenta, guardar un material). El
   `.pf-panel-b` nuevo nacía con el scroll en 0 y el foco se caía al <body>: quien tocaba algo
   al pie de la ficha volvía arriba de todo, en una hoja casi a pantalla completa. Esto guarda el
   scroll del cuerpo y el control enfocado —por su primer atributo data-*, que es lo que los
   identifica en estos paneles— y los devuelve. */
export function repintarEnSitio(capa, html) {
  if (!capa) return;
  const b = capa.querySelector('.pf-panel-b'), y = b ? b.scrollTop : 0;
  const a = document.activeElement;
  const at = a && capa.contains(a) ? Array.from(a.attributes).find(x => x.name.startsWith('data-')) : null;
  capa.innerHTML = html;
  const nb = capa.querySelector('.pf-panel-b'); if (nb) nb.scrollTop = y;
  if (at) {
    let f = null;
    try { f = capa.querySelector('[' + at.name + '="' + CSS.escape(at.value) + '"]'); } catch (_) {}
    if (f) { try { f.focus({ preventScroll: true }); } catch (_) {} }
  }
}

/* ----- El foco sobrevive a un repintado -----
   Los módulos repintan con innerHTML después de cada toque —una estación del Tablero, «Mes
   siguiente», una pestaña de Material o de Control—, y el botón enfocado deja de existir: quien
   navega con teclado caía al <body>, al principio del documento. Esto envuelve un manejador:
   recuerda los atributos data-* del control enfocado dentro del contenedor y, si después del
   repintado el foco se perdió, lo devuelve al control equivalente.
   Solo cuando la acción vino del teclado (una tecla, o el clic que dispara Enter/Espacio, que
   llega con detail 0): con el ratón el foco no se ve, y devolverlo a un control que no es el
   que se tocó deja un Enter posterior apuntando a otra cosa. Si el control trae data-clave, es
   su identidad estable y se busca solo por ella (el data-acc del Tablero es una posición en la
   lista y cambia de dueño al repintar). */
export function conservandoFoco(fn, contFijo) {
  return async function (ev) {
    const cont = contFijo || ev.currentTarget;
    const a = document.activeElement;
    const teclado = !!ev && ev.detail === 0;
    const at = a && cont && cont.contains && cont.contains(a)
      ? (a.hasAttribute('data-clave') ? [a.getAttributeNode('data-clave')]
                                      : Array.from(a.attributes).filter(x => x.name.startsWith('data-')))
      : null;
    await fn.call(this, ev);
    if (!teclado || !at || !at.length || a.isConnected) return;
    if (document.activeElement && document.activeElement !== document.body) return;   // otro lo tomó
    let b = null;
    try { b = cont.querySelector(at.map(x => '[' + x.name + '="' + CSS.escape(x.value) + '"]').join('')); } catch (_) {}
    if (b) { try { b.focus({ preventScroll: true }); } catch (_) {} }
  };
}

/* ----- Repintar alrededor de un campo vivo -----
   Una búsqueda que repinta la pantalla entera con innerHTML reemplaza también el <input> en el
   que se está escribiendo: en iPhone el teclado se cierra en cada pausa, y re-enfocar desde un
   setTimeout no lo vuelve a abrir. Esto pinta el HTML nuevo aparte y lo injerta alrededor del
   campo, que NUNCA sale del documento: se sustituye todo lo que no es su camino. Si la forma no
   coincide (otra pestaña, otro módulo), contesta false y quien llama repinta como siempre. */
export function repintarAlrededor(cont, html, vivo) {
  if (!cont || !vivo || !cont.contains(vivo)) return false;
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  const injertar = (viejo, nuevo, copiarAtributos) => {
    const vk = Array.from(viejo.childNodes), nk = Array.from(nuevo.childNodes);
    const i = vk.findIndex(n => n === vivo || (n.contains && n.contains(vivo)));
    if (i < 0 || !nk[i] || nk[i].nodeName !== vk[i].nodeName) return false;
    if (copiarAtributos) {
      Array.from(viejo.attributes).forEach(a => { if (!nuevo.hasAttribute(a.name)) viejo.removeAttribute(a.name); });
      Array.from(nuevo.attributes).forEach(a => { if (viejo.getAttribute(a.name) !== a.value) viejo.setAttribute(a.name, a.value); });
    }
    const ancla = vk[i];
    if (ancla !== vivo && !injertar(ancla, nk[i], true)) return false;
    vk.forEach((n, k) => { if (k !== i) n.remove(); });
    nk.slice(0, i).forEach(n => viejo.insertBefore(n, ancla));
    nk.slice(i + 1).forEach(n => viejo.appendChild(n));
    return true;
  };
  return injertar(cont, tmp, false);
}

/* Durante dos cuadros no corre ninguna transición: para cerrar con el teclado sin la salida. */
export function sinMovimiento() {
  const h = document.documentElement;
  h.classList.add('sin-transicion');
  requestAnimationFrame(() => requestAnimationFrame(() => h.classList.remove('sin-transicion')));
}

export function cerrarCapaDeArriba() {
  for (const c of _CAPAS) if (_visible(c.id)) { try { c.cerrar(); } catch (_) {} return true; }
  return false;
}

/* ----- Preguntar antes, sin el confirm() del navegador -----
   La misma pieza que `confirmar()` del cotizador (js/cotizador/nucleo.js): una capa de la app
   —con su foco, su Escape y su atrás del teléfono— que contesta con una promesa. Vive en su
   propio nodo y no en #pf-pide porque ése lo rellenan seis módulos con su propio contenido y
   sus propios clics; una pregunta genérica encima de uno de ellos se pisaría con él. El nodo
   se crea la primera vez que hace falta. */
let _confPf = null;
export function confirmarPf(o = {}) {
  let capa = $('pf-confirma');
  if (!capa) {
    capa = document.createElement('div');
    capa.className = 'modal-bg pf-modal-bg'; capa.id = 'pf-confirma';
    capa.setAttribute('role', 'alertdialog'); capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-labelledby', 'pf-confirma-t'); capa.setAttribute('aria-describedby', 'pf-confirma-d');
    capa.innerHTML = '<div class="pf-panel"><div class="pf-panel-h"><h2 id="pf-confirma-t"></h2></div>' +
      '<div class="pf-panel-b"><p class="pf-nota conf-texto" id="pf-confirma-d"></p></div>' +
      '<div class="pf-panel-f"><button type="button" class="btn btn-gho" data-conf="no" id="pf-confirma-no"></button>' +
      '<button type="button" class="btn btn-pri" data-conf="si" id="pf-confirma-si"></button></div></div>';
    capa.addEventListener('click', ev => {
      const b = ev.target.closest('[data-conf]');
      if (b) _cerrarConfPf(b.dataset.conf === 'si'); else if (ev.target === capa) _cerrarConfPf(false);
    });
    document.body.appendChild(capa);
    registrarCapa('pf-confirma', () => _cerrarConfPf(false));
  }
  return new Promise(res => {
    if (_confPf) _confPf(false);
    _confPf = res;
    $('pf-confirma-t').textContent = o.titulo || '¿Continuar?';
    $('pf-confirma-d').textContent = o.texto || '';
    const si = $('pf-confirma-si');
    si.textContent = o.si || 'Continuar'; si.className = 'btn ' + (o.peligro ? 'btn-dgr' : 'btn-pri');
    $('pf-confirma-no').textContent = o.no || 'Cancelar';
    abrirCapa('pf-confirma', { hist: true });
  });
}
function _cerrarConfPf(v) {
  cerrarCapa('pf-confirma');
  const r = _confPf; _confPf = null; if (r) r(v);
}
/** true si hay un panel, ficha u hoja abierta encima de la pantalla. */
export const hayCapaAbierta = () => !!_capaDeArriba();

/** Una vez, desde app.js. */
export function vigilarCapas() {
  window.addEventListener('keydown', e => {
    /* Cerrar con Escape no anima: lo que dispara el teclado se va en el acto (ver .sin-mov). */
    if (e.key === 'Escape') { sinMovimiento(); if (cerrarCapaDeArriba()) e.preventDefault(); return; }
    if (e.key !== 'Tab') return;
    /* El tabulador se escapa del modal al primer golpe y sigue recorriendo la plataforma
       que está detrás del velo. Solo se interviene en los dos extremos, así que dentro del
       modal el orden natural no cambia. */
    const m = _capaDeArriba(); if (!m) return;
    const f = _focablesDe(m); if (!f.length) return;
    const pri = f[0], ult = f[f.length - 1], act = document.activeElement;
    if (e.shiftKey && (act === pri || !m.contains(act))) { e.preventDefault(); ult.focus(); }
    else if (!e.shiftKey && (act === ult || !m.contains(act))) { e.preventDefault(); pri.focus(); }
  });
  window.addEventListener('popstate', () => {
    /* Este popstate lo pidió `cerrarCapa`, no el dedo: la capa ya se cerró y no hay que
       cerrar otra. Cuando llega el último en vuelo, se empujan las entradas que se aplazaron
       para las capas que se abrieron mientras tanto y siguen abiertas. */
    if (_backPropio > 0) {
      _backPropio--;
      if (!_backPropio) {
        for (const id of _pushPendiente) {
          const el = $(id);
          if (!el || !el.classList.contains('show') || el.dataset.hist !== '1') continue;
          try { history.pushState({ capa: id }, ''); } catch (_) { delete el.dataset.hist; }
        }
        _pushPendiente.clear();
      }
      return;
    }
    /* El atrás del teléfono ya consumió la entrada: aquí solo se cierra, sin volver a
       llamar a history.back(). */
    for (const c of _CAPAS) {
      const el = $(c.id);
      if (el && el.classList.contains('show') && el.dataset.hist === '1') {
        delete el.dataset.hist;
        try { c.cerrar(); } catch (_) {}
        return;
      }
    }
  });
}

/* ----- Chips y grupos de opciones -----
   El elegido se marca con fondo tenue del acento y su tinta, no con una píldora azul con
   degradado: multiplicado por cada opción de cada renglón, lo ya decidido era lo más
   ruidoso de la pantalla justo por estar decidido. Es la regla del sistema y se respeta. */
export function chip(txt, on, attrs = '') {
  return '<button type="button" class="chip' + (on ? ' on' : '') + '" aria-pressed="' +
    (on ? 'true' : 'false') + '" ' + attrs + '>' + esc(txt) + '</button>';
}
/* `etiqueta` es el nombre del grupo. Un `role="group"` sin nombre no se expone: quien navega
   con lector oye tres botones sueltos y no sabe qué eligen. Es opcional para no tocar a los
   que ya llaman, pero todo segmento nuevo lo lleva. */
export function segmento(opciones, actual, atributo, etiqueta) {
  return '<div class="tipo-seg" role="group"' + (etiqueta ? ' aria-label="' + esc(etiqueta) + '"' : '') + '>' + opciones.map(o =>
    '<button type="button" class="' + (o.v === actual ? 'on' : '') + '" aria-pressed="' +
    (o.v === actual ? 'true' : 'false') + '" ' + atributo + '="' + esc(o.v) + '">' +
    esc(o.t) + '</button>').join('') + '</div>';
}

/* ----- Copiar al portapapeles, con respaldo -----
   En iOS y en páginas no seguras la API moderna falla. El respaldo es el mismo que el del
   cotizador porque es la misma función: P.copiar, en js/piezas.js. Sin él, copiar dependía del
   botón que tocaras. Y el botón que se tocó lo dice él mismo —«✓ Copiado» con su palomita,
   1.8 s— además del aviso, que trae la instrucción («pégala en el chat del instalador»): el
   botón sale del clic que está corriendo (P.botonDelEvento), así que ninguna llamada cambia. */
export function copiarTexto(txt, msgOk, extra) {
  const ok = () => { if (msgOk) toast(msgOk, 'ok', 3400); if (typeof extra === 'function') extra(); };
  const noSe = () => toast('Este navegador no dejó copiar — selecciona el texto a mano', 'err', 4200);
  const P = window.Piezas;
  if (!P || !P.copiar) {
    try { navigator.clipboard.writeText(txt).then(ok, noSe); } catch (_) { noSe(); }
    return;
  }
  P.copiar(txt, { boton: P.botonDelEvento() }).then(bien => { bien ? ok() : noSe(); });
}

/* ----- Descargar un archivo generado en el momento -----
   `<a download>` es lo único que funciona igual en Android y en iOS moderno. Mismo código
   que el cotizador, incluido el `return false` cuando no se pudo: quien llame tiene que
   poder enterarse, porque hay flujos que prometen un respaldo antes de reemplazar algo. */
export function descargarArchivo(texto, nombre, tipo) {
  try {
    const blob = texto instanceof Blob ? texto : new Blob([texto], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    if ('download' in a) {
      a.href = url; a.download = nombre; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
    } else window.open(url, '_blank');
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 60000);
    return true;
  } catch (_) {
    toast('Este navegador no permitió descargar el archivo', 'err', 3400);
    return false;
  }
}

/** Compartir un archivo. wa.me solo lleva texto, así que un .ics va por aquí o se descarga. */
export async function compartirArchivo(texto, nombre, tipo) {
  try {
    const f = new File([texto], nombre, { type: tipo });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], title: nombre });
      return true;
    }
  } catch (_) { /* el usuario canceló, o el navegador dijo que sí y luego no */ }
  return descargarArchivo(texto, nombre, tipo);
}

/* ----- WhatsApp -----
   Un `<a>` a wa.me. Cero infraestructura, y es la única manera de que el instalador
   reciba la orden de trabajo sin tener acceso a la plataforma, que es lo que el director
   pidió expresamente. Solo texto: wa.me no adjunta archivos. */
/* Un teléfono capturado, convertido en el número que wa.me entiende, o '' si no lo parece.
   Es la MISMA regla que `telWhatsApp` del cotizador (js/cotizador/entrega.js), y aquí
   faltaba entera: se mandaba a wa.me cualquier cadena de dígitos.

   Lo que eso hacía está escrito en el cotizador, que ya lo arregló: un «33 12» a medias
   «abría el chat de un número que no era el del cliente mientras el aviso decía WhatsApp
   abierto». Aquí el caso llega por dos puertas: el teléfono del cliente viene de
   cotizaciones de cuando el teléfono no era obligatorio, y el del proveedor se teclea a
   mano en el catálogo de material —donde un «ext. 204» es un renglón normal—.

   Lo que NO se toca: un teléfono vacío sigue dando '', y `linkWa('', texto)` tiene que
   seguir abriendo WhatsApp SIN número para que la persona elija el contacto. De eso
   depende «mandar la orden de trabajo» en js/mod/fabricacion.js. */
export function telWa(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  /* Los prefijos de marcación de antes —044 y 045 de celular, 01 de larga distancia— y el 00
     de salida internacional, igual que en el cotizador: ningún número de WhatsApp empieza con
     0, y aun así «01 33 1234 5678» caía en la rama internacional y se mandaba tal cual, al
     chat de un número que no es de nadie. Se quita el prefijo cuando lo que queda es un número
     que esta misma regla reconoce; si no, '' y WhatsApp abre para elegir el contacto. */
  if (d[0] === '0') {
    if (/^(044|045|01)[1-9]\d{9}$/.test(d)) d = d.slice(-10);   // lo que queda son los diez de México
    else if (/^00[1-9]/.test(d)) d = d.slice(2);                // lo que queda lleva su lada de país
    else return '';
  }
  if (d.length === 10) return '52' + d;                  // celular mexicano sin lada de país
  if (d.length === 12 && d.startsWith('52')) return d;   // ya viene con 52
  if (d.length === 13 && d.startsWith('521')) return d;  // formato viejo, con el 1
  /* De aquí para abajo no se adivina, igual que en el cotizador: un 11 dígitos que empieza
     con 1 se lee igual como número de Estados Unidos que como el formato mexicano viejo, así
     que se manda tal cual. Lo que se rechaza es lo que NO puede ser un teléfono de nadie. */
  if (d.length >= 11 && d.length <= 15) return d;        // internacional con lada plausible
  return '';
}

export function linkWa(tel, texto) {
  const num = telWa(tel);
  return 'https://wa.me/' + num + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

/* La barra fija del teléfono se mide después de pintar y se publica como variable: el
   aviso emergente se posa encima y no debajo, donde no se ve. Mismo truco que el
   escalador y el vectorizador. */
export function ajustarAltoBarra() {
  const b = document.querySelector('.mbar');
  if (!b) { document.documentElement.style.setProperty('--mbar-h', '0px'); return; }
  requestAnimationFrame(() => {
    const h = Math.round(b.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--mbar-h', (h > 0 ? h : 0) + 'px');
  });
}

/** Estado vacío. Uno solo, para que las seis pantallas digan «no hay nada» igual. */
/* ============================================================================
   Los esqueletos
   ============================================================================
   La silueta de lo que viene, con brillo, mientras un módulo o un marco carga. Existen por
   una medición: entre pedir una pestaña y verla pintada pasan 56-87 ms en una computadora
   —ahí no debe verse NADA, y el CSS los enseña con 180 ms de retardo—, pero el marco del
   cotizador se quedaba en blanco 240-500 ms y el del anidador 700-950, y en un teléfono
   viejo con la red mal son segundos. Un esqueleto con la geometría de lo que viene dice
   «está cargando, y va a aparecer AQUÍ»; un hueco blanco dice «se rompió».

   Las clases `esq-*` las pinta css/sistema.css (el brillo y las medidas de cada barra) y
   css/plataforma.css (dónde va cada esqueleto). Son marcado inerte: `aria-hidden` en el
   dibujo, y el texto de estado aparte, que es lo único que un lector de pantalla necesita. */
const _esqFila = '<div class="pf-fila esq"><div class="pf-fila-ico esq-b"></div>' +
  '<div class="pf-fila-tx"><div class="esq-b esq-t"></div><div class="esq-b esq-d"></div></div></div>';
const _esqCuenta = '<p class="pf-cuenta esq"><b class="esq-b esq-n"></b><span class="esq-b esq-d"></span></p>';
const _esqTarjeta = (dentro, cls) => '<div class="card esq' + (cls ? ' ' + cls : '') + '"><div class="card-b">' + dentro + '</div></div>';

/** El esqueleto de un módulo de la plataforma. `mod` elige la geometría: el mapa es un bloque,
 *  Ajustes una lista, y el resto la cinta de cuentas con tres renglones, que es lo que pintan. */
export function esqueletoModulo(mod, nombre) {
  let cuerpo;
  /* El mapa ocupa la sección entera y las cuentas viven en su hoja: la silueta es el bloque solo. */
  if (mod === 'mapa') cuerpo = '<div class="esq-b esq-bloque esq-mapa"></div>';
  else if (mod === 'ajustes') cuerpo = _esqTarjeta(_esqFila.repeat(4));
  else cuerpo = '<div class="pf-cuentas">' + _esqCuenta.repeat(4) + '</div>' + _esqTarjeta(_esqFila.repeat(3));
  return '<div class="pf-esqueleto" data-mod="' + esc(mod) + '" aria-busy="true"><div aria-hidden="true">' + cuerpo + '</div>' +
    '<p class="pf-esqueleto-t"><span class="esq-giro" aria-hidden="true"></span> <span>Cargando ' + esc(nombre) + '…</span></p></div>';
}

/** Lo que tapa un <iframe> mientras su documento arranca: la silueta del cotizador (riel,
 *  tarjeta y columna del dinero) o la del anidador (paso a paso y mesa de corte). Va DENTRO de
 *  `.pf-marco-caja`, que lleva `.pf-marco-cargando` hasta que el marco está vivo. */
export function esqueletoMarco(tipo, texto) {
  let cuerpo;
  if (tipo === 'anidador') {
    cuerpo = '<div class="esq-cols an-esq"><div>' +
      _esqTarjeta('<div class="esq-b esq-t"></div><div class="esq-b esq-bloque esq-drop"></div>') +
      _esqTarjeta('<div class="esq-b esq-t"></div><div class="esq-b esq-campo"></div><div class="esq-b esq-campo"></div>') +
      '</div>' + _esqTarjeta('<div class="esq-b esq-t"></div><div class="esq-b esq-bloque esq-mesa"></div>') + '</div>';
  } else if (tipo === 'publicaciones') {
    /* La rejilla de miniaturas y el panel del editor: la silueta de lo que va a aparecer, para
       que la pantalla no salte de «un formulario» a «una galería» al terminar de cargar. */
    let mini = '';
    for (let i = 0; i < 6; i++) mini += '<div class="esq-b esq-mini"></div>';
    cuerpo = '<div class="esq-cols pb-esq-cols"><div><div class="esq-b esq-campo"></div><div class="esq-mosaico">' + mini + '</div></div>' +
      _esqTarjeta('<div class="esq-b esq-bloque esq-drop"></div><div class="esq-b esq-campo"></div><div class="esq-b esq-boton"></div>', 'esq-lado') +
      '</div>';
  } else {
    cuerpo = '<div class="esq-b esq-riel"></div><div class="esq-cols cot-esq">' +
      _esqTarjeta('<div class="esq-b esq-t"></div><div class="esq-b esq-campo"></div><div class="esq-b esq-campo"></div><div class="esq-b esq-campo esq-largo"></div>') +
      _esqTarjeta('<div class="esq-b esq-d"></div><div class="esq-b esq-n"></div><div class="esq-b esq-campo"></div><div class="esq-b esq-boton"></div>', 'esq-lado') +
      '</div>';
  }
  return '<div class="pf-marco-esq" aria-hidden="true">' + cuerpo + '</div>' +
    '<p class="pf-marco-esq-t"><span class="esq-giro" aria-hidden="true"></span> <span class="tx">' + esc(texto) + '</span></p>';
}

export function vacio(titulo, detalle, accionHTML) {
  return '<div class="vacio">' + ico('i-carpeta') +
    '<p class="vacio-t">' + esc(titulo) + '</p>' +
    (detalle ? '<p class="vacio-d">' + esc(detalle) + '</p>' : '') +
    (accionHTML || '') + '</div>';
}

/* ----- El rótulo del papel -----
   Los dos caminos de impresión de la plataforma —la lista de compra y la orden de obra—
   comparten el encabezado que vive en plataforma.html. Lo único que cambia entre ellos es qué
   dice y de cuándo es, y eso se pone aquí para que ninguno de los dos tenga que saber cómo está
   hecho el encabezado. */
export function rotularPapel(titulo) {
  const t = document.getElementById('imp-titulo');
  if (t) t.textContent = titulo;
  const f = document.getElementById('imp-fecha');
  if (f) {
    const d = new Date();
    f.textContent = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

/* ============================================================================
   El renglón del taller, y lo que lo acompaña

   Vive aquí y no en un módulo porque lo pintan DOS pantallas: la lente de Taller del
   Calendario y la lista del Tablero. Estaba escrito solo en fabricacion.js, y copiarlo al
   Tablero habría garantizado que el mismo trabajo se lea distinto según por dónde se
   entre —el mismo defecto que ya se evitó subiendo `ETAPA_NOMBRE` a la capa de datos—.

   No calcula NADA del taller: recibe la ventana que `datos/taller.js` ya resolvió y la
   pinta. Si aquí se decidiera cuándo algo va tarde habría dos respuestas a la misma
   pregunta, y la que se ve sería la que nadie probó.
   ============================================================================ */

/** El verbo de lo que toca hacer, no el nombre del estado: «hay que cortar», no «cortado».
 *  Quien lee el renglón está decidiendo qué hacer hoy, no clasificando. */
export const VERBO_TALLER = {
  ganado: 'hay que ponerlo en diseño', en_diseno: 'hay que cortar', cortado: 'hay que armar',
  armado: 'falta dejarlo listo', listo: 'ya está listo',
};

/** El tono del icono según el estado que devolvió `ventanaTaller`. Vacío es a tiempo: un
 *  renglón sin color es el caso normal y no hay que gritarlo. */
export const TONO_TALLER = { no_llega: 'mal', tarde: 'urge', justo: 'urge', a_tiempo: '', sin_fecha: '' };

/** Fecha corta para la pista: «16 sep». Por `partesISO` y nunca por `new Date(iso)`, que
 *  interpreta la cadena como UTC y en México devuelve el día anterior. */
export function corta(iso) {
  const p = partesISO(iso); if (!p) return '';
  return p.d + ' ' + MES_CORTO[p.m - 1];
}

/* ----- El riel con sus hitos (F5) -----
   Antes el riel era una barra de «empezar» a «listo» con un punto en «hoy», y los hitos de en
   medio —cuándo hay que haber cortado, armado, dejado listo— y cuál de ellos ya pasó el
   proyecto estaban solo en la frase. Quien miraba treinta renglones tenía que leerlos todos para
   saber cuál iba tarde. Ahora el riel lleva una marca por hito, en su fecha, y se ve de un
   vistazo en qué va cada uno:

     · rellena (verde)  — la etapa real del proyecto ya llegó a ese hito;
     · hueca            — todavía no toca, o todavía no ha pasado;
     · roja, con muesca — el hito quedó DETRÁS del punto de hoy y sigue sin hacerse: «voy tarde»
                          dicho con una forma, no solo con un color (uno de cada doce no
                          distingue el rojo del verde).

   La marca de «en diseño» cae en el extremo de la izquierda —empezar y entrar a diseño son el
   mismo día en `ventanaTaller`— y es la que hace que un proyecto recién ganado se vea «en
   camino» y no con las tres marcas vacías. Las cuatro vienen en `v.hitos`; este archivo no las
   calcula ni decide cuándo algo va tarde: compara dos fechas que ya trae la ventana y la etapa
   que ya trae el proyecto. El orden de las etapas se repite aquí (`ORDEN_DEL_RIEL`) solo para
   decir «ya llegó»; pruebas/pf-fabricacion.mjs lo compara con `ETAPAS` de datos/proyectos.js
   para que no se desfasen en silencio. */
export const HITOS_DEL_RIEL = [['en_diseno', 'En diseño'], ['cortado', 'Cortado'], ['armado', 'Armado'], ['listo', 'Listo']];
export const ORDEN_DEL_RIEL = ['ganado', 'en_diseno', 'cortado', 'armado', 'listo', 'instalado', 'garantia'];

/** Las marcas del riel de una ventana y dónde cae hoy, ambos de 0 a 1 sobre el largo de la
 *  ventana. Función pura (sin DOM) para poder probarla en node. Una ventana sin fechas
 *  —«Ganado sin fecha y sin venta», que no tiene de dónde contar— no lleva marcas: un riel que
 *  inventara posiciones diría un plan que nadie hizo. */
export function marcasDelRiel(v, hoy) {
  const vacio = { marcas: [], hoy: 0 };
  if (!v || !partesISO(v.empezar) || !partesISO(v.listo)) return vacio;
  const dia = partesISO(hoy) ? hoy : hoyISO();
  const largo = Math.max(1, diasEntre(v.empezar, v.listo) || 1);
  const sobre = iso => Math.max(0, Math.min(1, (diasEntre(v.empezar, iso) || 0) / largo));
  const llego = ORDEN_DEL_RIEL.indexOf(v.etapa_real);
  const marcas = [];
  for (const [clave, nombre] of HITOS_DEL_RIEL) {
    const f = v.hitos && v.hitos[clave];
    if (!partesISO(f)) continue;
    const hecho = llego >= ORDEN_DEL_RIEL.indexOf(clave);
    const estado = hecho ? 'hecho' : f < dia ? 'tarde' : 'pendiente';
    marcas.push({ clave, texto: nombre, pos: sobre(f), estado,
      titulo: nombre + ' · ' + corta(f) + (estado === 'hecho' ? ' · hecho' : estado === 'tarde' ? ' · va tarde' : '') });
  }
  return { marcas, hoy: sobre(dia) };
}

/** El riel pintado con la pieza 16 (`P.rielHTML`, forma «marcas»). `aria-hidden` lo pone la
 *  pieza: la frase de arriba es la que se lee y el riel es su dibujo. */
function rielDelTaller(v, dia, clases) {
  const r = marcasDelRiel(v, dia);
  const P = typeof window !== 'undefined' ? window.Piezas : null;
  if (!P || !P.rielHTML) return '<span class="riel riel-marcas tal-riel' + clases + '" aria-hidden="true"></span>';
  return P.rielHTML(r.marcas, { forma: 'marcas', hoy: r.hoy, clase: 'tal-riel' + clases });
}

/**
 * Un renglón de trabajo del taller.
 *
 * @param {Object} v      la ventana de `Taller.ventanaTaller()`
 * @param {string} hoy    ISO. Se pasa y no se lee del reloj: las treinta filas de una lista
 *                        tienen que compartir el MISMO hoy, o la que se pinte a medianoche
 *                        sale de otro día que la de arriba.
 * @param {{icono?:string, plazoEditable?:boolean, accionesHTML?:string, extraHTML?:string}} [opts]
 *        `icono` por omisión es `i-taller` (el Calendario pinta el banco de trabajo); el
 *        Tablero le pasa el de la etapa. `plazoEditable` decide si la ficha del plazo es un
 *        botón o un rótulo: corregir el plazo se hace en el Calendario, que es quien tiene
 *        el modal.
 */
export function filaTaller(v, hoy, opts = {}) {
  const dia = partesISO(hoy) ? hoy : hoyISO();
  const tono = TONO_TALLER[v.estado] || '';
  const verbo = VERBO_TALLER[v.etapa_real] || '';
  const mano = v.plazo_fuente === 'elegido';
  const plazo = mano ? 'a mano' : 'calculado';
  return '<div class="pf-fila tal-fila" data-proyecto="' + esc(v.proyecto_id || '') + '">' +
    '<div class="pf-fila-ico' + (tono ? ' ' + tono : '') + '">' + ico(opts.icono || 'i-taller') + '</div>' +
    '<div class="pf-fila-tx">' +
      '<div class="pf-fila-t">' + esc(v.titulo || 'Proyecto sin nombre') + (verbo ? ' · ' + esc(verbo) : '') + '</div>' +
      '<div class="pf-fila-d">' + esc(v.texto) + '</div>' +
      (opts.extraHTML || '') +
      '<div class="tal-pista" aria-hidden="true">' +
        '<span class="tal-fecha">' + esc(corta(v.empezar)) + '</span>' +
        rielDelTaller(v, dia, (v.ancla === 'ganado' ? ' propuesta' : '') + (tono === 'mal' || tono === 'urge' ? ' tarde' : '')) +
        '<span class="tal-fecha">' + esc(corta(v.listo)) + (v.instalacion ? ' · instala ' + esc(corta(v.instalacion)) : '') + '</span>' +
      '</div>' +
      '<div class="pf-fila-d">' +
        (opts.plazoEditable
          ? '<button type="button" class="cal-plazo' + (mano ? ' mano' : '') + '" data-plazo="' + esc(v.proyecto_id || '') + '"' +
            ' title="Cambiar cuánto tarda en el taller" aria-label="Plazo de taller: ' + esc(v.plazo_etiqueta) + ', ' + (mano ? 'puesto a mano' : 'calculado') + '. Tocar para cambiarlo">' +
            ico('i-reloj') + esc(v.plazo_etiqueta) + ' · ' + plazo + '</button>'
          : '<span class="cal-plazo' + (mano ? ' mano' : '') + '" title="' + esc(v.plazo_razon) + '">' +
            ico('i-reloj') + esc(v.plazo_etiqueta) + ' · ' + plazo + '</span>') +
      '</div>' +
    '</div>' +
    (opts.accionesHTML ? '<div class="pf-fila-acc">' + opts.accionesHTML + '</div>' : '') +
  '</div>';
}

/* ----- La línea de frescura -----
   Qué tan al día está lo que se está viendo. La pintan el Tablero y «Qué atender», y estaba
   escrita solo en inicio.js. Cuando todo está al día NO devuelve nada: «una franja verde
   diciendo al día todos los días es una felicitación diaria que se deja de leer».

   @param {Object|null} f       lo que devolvió `Sync.frescura()`
   @param {boolean} disponible  `Sync.disponible()`. Se pasa para que este archivo no
                                importe la capa de datos y siga siendo puro de pintado. */
export function bandaFrescura(f, disponible) {
  if (!disponible) {
    /* Fase 1: no hay puente, así que no hay nada viejo de nadie. Decir «al día» aquí sería
       prometer que se está viendo lo de los tres teléfonos, y lo que se está viendo es lo
       de este. */
    return '<p class="pf-frescura">' + ico('i-nube-off') +
      /* Neutro para los tres roles: esto lo lee también el teléfono de Fabricación, y ahí
         «lo que Fabricación mueva en su teléfono no llega aquí» se leía desde ese teléfono. */
      '<span>Todo lo que ves vive en este dispositivo. Lo que se mueva en otro teléfono no llega aquí todavía.</span></p>';
  }
  if (f && f.al_dia) {
    const n = Number(f.pendientes);
    return '<p class="pf-frescura">' + ico('i-nube') + '<span>Al día' +
      (n > 0
        ? (n === 1 ? ' · queda 1 cambio de este dispositivo por mandar'
                   : ' · quedan ' + n + ' cambios de este dispositivo por mandar')
        : '') + '</span></p>';
  }
  const txt = (f && (f.texto || f.mensaje)) || 'Hay datos de otro dispositivo que llevan días sin llegar.';
  return '<div class="pf-banda" role="status">' + ico('i-aviso') + '<span>' + esc(txt) + '</span></div>';
}

/* ============================================================================
   Los marcos empotrados

   El Cotizador y el Anidador viven dentro de un <iframe> del mismo origen. Un iframe no
   tiene alto propio: sin esto se queda en los 150 px que manda la especificación, y con
   `height:100%` se queda en cero porque su padre no tiene alto fijo. Se mide.

   Y aquí está la razón por la que existe `insetInferior()`, que es el defecto que este
   reacomodo tenía que resolver: DENTRO de un iframe todas las `env(safe-area-inset-*)`
   valen 0. El cotizador tiene treinta, y su barra fija de teléfono cuelga de ellas: sin
   compensar, su botón principal quedaría debajo del indicador de inicio del iPhone. La
   compensación no puede ir dentro del documento hijo —ahí `env()` ya es 0—: la pone el
   PADRE, apartando la caja del marco de la zona insegura. Así, dentro del marco no hay
   zona insegura que proteger y sus treinta declaraciones en 0 son correctas.
   ============================================================================ */

/** El inset inferior de verdad, en píxeles. Se lee de un elemento de prueba porque
 *  `env()` no se puede leer desde JS. Devuelve 0 donde no hay muesca, que es lo normal. */
export function insetInferior() {
  try {
    const s = document.createElement('div');
    s.style.cssText = 'position:fixed;left:-9999px;bottom:0;height:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(s);
    const h = s.getBoundingClientRect().height || 0;
    s.remove();
    return Math.max(0, Math.round(h));
  } catch (_) { return 0; }
}

/**
 * Le da al marco el alto que le queda a la ventana debajo del encabezado, ya descontada la
 * barra fija del teléfono y la zona insegura de abajo.
 *
 * Escribe una variable CSS en `:root` en vez del `style` del iframe a propósito: cambiar el
 * atributo `style` de un `<iframe>` no lo recarga, pero cambiar el alto por una variable
 * deja que la hoja de estilos decida el resto (radio, sombra, fondo) sin que este archivo
 * sepa nada de eso.
 *
 * @param {string} id el id del <iframe>
 */
/* ----- Medir DESPUÉS de que la sección acabe de entrar -----
   `.pf-mod` entra con `animation:entra .32s` y esa animación empieza en `translateY(10px)`
   (css/plataforma.css y css/sistema.css). Durante esos .32 s el marco está diez píxeles más
   abajo de donde va a quedarse, y `medirMarco` —que resta `getBoundingClientRect().top`— sale
   diez píxeles corto. Medido: 522 px contra los 532 de verdad.

   No se ve casi nunca porque quien mide de verdad suele llegar tarde: el vigilante del marco
   remide cuando el documento de dentro ya arrancó, y para eso pasan más de .32 s. Se nota
   cuando el marco YA está —una pantalla conservada que se vuelve a enseñar, o un documento
   que venía de la caché— y ahí la única medición cae a media animación.

   Se escucha el final de la animación en vez de escribir aquí los 320 ms: el número vive en
   la hoja de estilos y el día que cambie no hay dos sitios que desempatar. Si el aparato
   pide movimiento reducido no hay animación, `animationend` no llega nunca y la medición de
   antes ya era la buena, así que esto sobra sin estorbar.

   @param {Element} seccion la <section> del módulo
   @param {Function} fn qué hacer cuando termine de entrar
   @returns {Function} la que lo cancela, para el que se va antes de que termine */
export function alTerminarDeEntrar(seccion, fn) {
  if (!seccion || typeof fn !== 'function') return () => {};
  const quitar = () => seccion.removeEventListener('animationend', al);
  /* Solo la animación DE LA SECCIÓN: lo que anime dentro —una silueta, una tarjeta— burbujea
     hasta aquí y mediría antes de tiempo, que es justo lo que se viene a evitar. */
  function al(ev) { if (ev.target !== seccion) return; quitar(); fn(); }
  seccion.addEventListener('animationend', al);
  return quitar;
}

export function medirMarco(id) {
  const m = document.getElementById(id);
  if (!m) return;
  const arriba = m.getBoundingClientRect().top;
  const mbar = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--mbar-h') || '0', 10) || 0;
  /* El piso de 320 px es para que un teclado abierto en el teléfono —que encoge el
     viewport a la mitad— no deje el marco en veinte píxeles de alto justo mientras
     alguien escribe dentro de él. */
  /* La barra de módulos del teléfono es fija y va ENCIMA de todo: si el marco no termina donde
     ella empieza, su borde de abajo —y lo que la app empotrada ponga fijo ahí— queda tapado. */
  const alto = Math.max(320, Math.round(window.innerHeight - arriba - mbar - (altoBarraAbajo() || (insetInferior() + 8))));
  document.documentElement.style.setProperty('--pf-marco-h', alto + 'px');
}

/**
 * Cuánto SITIO se lleva la barra de módulos del teléfono (`.pf-abajo`) contado desde el borde
 * de abajo del visor, o 0 donde no está —de 760 px para arriba la sustituye la barra lateral—.
 *
 * Devolvía su ALTO, y eso valía mientras la barra estuviera pegada al borde: alto y sitio eran
 * el mismo número. Desde que es un dock de vidrio que flota —separado del borde por su margen
 * y por el área segura— dejaron de serlo, y los dos únicos usos de esta función quieren el
 * segundo: los dos calculan dónde TERMINA el marco del cotizador empotrado, que es donde
 * EMPIEZA la barra. Con el alto, el marco se metía esos píxeles por debajo del dock y la barra
 * fija del cotizador —el total y «Autorizar»— volvía a quedar tapada, que es exactamente la
 * regresión que pruebas/navegador/plegable.mjs vigila.
 *
 * Medido contra el borde, en vez de contra sí misma, el número sale bien esté la barra pegada,
 * flotando, o donde la ponga mañana la hoja de estilos: aquí no se escribe ni un margen.
 */
export function altoBarraAbajo() {
  const b = document.getElementById('pf-abajo');
  if (!b) return 0;
  try { if (getComputedStyle(b).display === 'none') return 0; } catch (_) { return 0; }
  const r = b.getBoundingClientRect();
  if (!r.height) return 0;
  return Math.max(0, Math.round(window.innerHeight - r.top));
}

/* ============================================================================
   El Fold a medio doblar

   Cuando un Galaxy Z Fold se usa medio abierto —como un libro, o apoyado en la mesa como una
   laptop— el navegador parte el visor en dos segmentos y lo dice: `window.viewport.segments`
   (Chrome 135+) y, para los que todavía no traen esa API, las variables `env(viewport-
   segment-*)` de CSS. Abierto del todo no hay segmentos y esto devuelve null.

   Devuelve dónde está la bisagra en píxeles del visor: `{tipo:'v', a, b}` si es vertical (libro)
   y `{tipo:'h', a, b}` si es horizontal (mesa); `a` es donde empieza y `b` donde termina. Quien
   la necesita en las coordenadas de un marco le resta la posición del marco.
   ============================================================================ */
export function pliegueDelVisor() {
  let seg = null;
  try {
    const s = window.viewport && window.viewport.segments;
    if (s && s.length === 2) seg = s;
  } catch (_) {}
  if (seg) {
    const [s0, s1] = seg;
    if (s1.left >= s0.left + s0.width - 1) return { tipo: 'v', a: s0.left + s0.width, b: s1.left };
    if (s1.top >= s0.top + s0.height - 1) return { tipo: 'h', a: s0.top + s0.height, b: s1.top };
    return null;
  }
  /* Sin la API, las variables de entorno: `env()` no se puede leer desde JS, así que se mide
     un elemento de prueba puesto exactamente sobre la bisagra. */
  try {
    const horiz = matchMedia('(horizontal-viewport-segments: 2)').matches;
    const vert = !horiz && matchMedia('(vertical-viewport-segments: 2)').matches;
    if (!horiz && !vert) return null;
    const p = document.createElement('div');
    p.style.cssText = horiz
      ? 'position:fixed;top:0;height:1px;left:env(viewport-segment-right 0 0,0px);width:calc(env(viewport-segment-left 1 0,0px) - env(viewport-segment-right 0 0,0px));visibility:hidden;pointer-events:none'
      : 'position:fixed;left:0;width:1px;top:env(viewport-segment-bottom 0 0,0px);height:calc(env(viewport-segment-top 0 1,0px) - env(viewport-segment-bottom 0 0,0px));visibility:hidden;pointer-events:none';
    document.body.appendChild(p);
    const r = p.getBoundingClientRect(); p.remove();
    if (horiz) return r.left > 0 ? { tipo: 'v', a: r.left, b: r.right } : null;
    return r.top > 0 ? { tipo: 'h', a: r.top, b: r.bottom } : null;
  } catch (_) { return null; }
}
