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
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
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

let _toastT = 0;
/**
 * Aviso emergente. Misma firma que el del cotizador.
 * @param {string} msg
 * @param {''|'ok'|'err'} type
 * @param {number} dur ms
 * @param {{label:string, fn:Function}|null} accion
 */
export function toast(msg, type = '', dur = 2600, accion = null) {
  /* Con botón, 8 s como mínimo: quien lo oye en vez de verlo tiene que encontrar el
     botón deslizando, y 2.6 s no alcanzan ni para llegar. Si el llamador pide más, se
     respeta lo que pida. */
  if (accion && dur < 8000) dur = 8000;
  const t = $('toast'); if (!t) return;
  t.innerHTML = '';
  const sp = document.createElement('span');
  sp.textContent = msg;
  t.appendChild(sp);
  if (accion && accion.label && typeof accion.fn === 'function') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-act'; b.textContent = accion.label;
    b.onclick = () => { clearTimeout(_toastT); t.classList.remove('show'); accion.fn(); };
    t.appendChild(b);
  }
  t.className = 'toast ' + type;
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.remove('show'), dur);
  voz(msg + (accion && accion.label ? ' — ' + accion.label + ' disponible' : ''), type === 'err');
}

/** Todo `Resultado` fallido se enseña igual. El mensaje ya viene escrito por la capa de datos. */
export function avisarResultado(r, msgOk) {
  if (r && r.ok) { if (msgOk) toast(msgOk, 'ok', 3200); return true; }
  toast((r && r.mensaje) || 'No se pudo completar', 'err', 4600);
  return false;
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

/* El fondo entero detrás del velo: no solo el contenido, también las dos barras. Sin
   `inert`, el lector de pantalla seguía recorriendo la plataforma de atrás y leyéndola
   como si fuera del modal, y el tabulador se escapaba por la barra de arriba. La clase en
   <html> es la que bloquea el scroll del fondo, que en un teléfono es lo que hace que al
   deslizar dentro de una ficha se mueva la página de abajo. Mismo arreglo que el
   cotizador ya tenía en _fondoInerte(). */
function _fondoInerte(v) {
  document.querySelectorAll('.wrap,.topbar,.mbar').forEach(e => { try { e.inert = v; } catch (_) {} });
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
  el.classList.add('show');
  _fondoInerte(true);
  if (opts.hist) { try { history.pushState({ capa: id }, ''); el.dataset.hist = '1'; } catch (_) {} }
  const f = _focablesDe(el);
  /* Al primer elemento tocable, no al contenedor: un contenedor enfocado no anuncia nada
     y el primer Tab se va al principio del modal de todas formas. */
  if (f.length) requestAnimationFrame(() => { try { f[0].focus(); } catch (_) {} });
  return true;
}

export function cerrarCapa(id) {
  const el = $(id); if (!el) return;
  el.classList.remove('show');
  if (el.dataset.hist === '1') {
    delete el.dataset.hist;
    /* history.back() es asíncrono. Si quien cierra abre otra cosa enseguida, se cruzan y
       el atrás del teléfono cierra lo recién abierto. Por eso el consumo de la entrada
       vive aquí y en el oyente de popstate, y en ningún otro lado. */
    try { if (history.state && history.state.capa === id) history.back(); } catch (_) {}
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

export function cerrarCapaDeArriba() {
  for (const c of _CAPAS) if (_visible(c.id)) { try { c.cerrar(); } catch (_) {} return true; }
  return false;
}

/** Una vez, desde app.js. */
export function vigilarCapas() {
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (cerrarCapaDeArriba()) e.preventDefault(); return; }
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
   En iOS y en páginas no seguras la API moderna falla. Mismo respaldo que el cotizador:
   sin él, copiar dependía del botón que tocaras. */
export function copiarTexto(txt, msgOk, extra) {
  const ok = () => { if (msgOk) toast(msgOk, 'ok', 3400); if (typeof extra === 'function') extra(); };
  const manual = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.focus(); ta.select(); ta.setSelectionRange(0, txt.length);
      const bien = document.execCommand('copy');
      ta.remove();
      bien ? ok() : toast('Este navegador no dejó copiar — selecciona el texto a mano', 'err', 4200);
    } catch (_) { toast('Este navegador no dejó copiar', 'err', 3600); }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok).catch(manual);
    } else manual();
  } catch (_) { manual(); }
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
export function linkWa(tel, texto) {
  const d = String(tel || '').replace(/\D/g, '');
  /* Diez dígitos son un número nacional; se le pone 52 porque wa.me lo exige con lada de
     país y nadie lo escribe así. Doce que empiezan con 521 son el formato viejo de México
     y también funcionan. Lo que ya trae 52 se deja como está. */
  const num = d.length === 10 ? '52' + d : d;
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
  return p.d + ' ' + ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][p.m - 1];
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
  /* Dónde va hoy dentro de la ventana, de 0 a 100. Fuera de ella se pega a los bordes. */
  const largo = Math.max(1, diasEntre(v.empezar, v.listo) || 1);
  const pos = Math.max(0, Math.min(100, Math.round((diasEntre(v.empezar, dia) || 0) / largo * 100)));
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
        '<span class="tal-riel' + (v.ancla === 'ganado' ? ' propuesta' : '') + (tono === 'mal' || tono === 'urge' ? ' tarde' : '') + '">' +
          '<i class="tal-hoy" style="left:' + pos + '%"></i></span>' +
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
      '<span>Todo lo que ves vive en este dispositivo. Lo que Fabricación mueva en su teléfono no llega aquí todavía.</span></p>';
  }
  if (f && f.al_dia) {
    return '<p class="pf-frescura">' + ico('i-nube') + '<span>Al día' +
      (Number(f.pendientes) > 0
        ? ' · quedan ' + Number(f.pendientes) + ' cambios de este dispositivo por mandar'
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
export function medirMarco(id) {
  const m = document.getElementById(id);
  if (!m) return;
  const arriba = m.getBoundingClientRect().top;
  const mbar = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--mbar-h') || '0', 10) || 0;
  /* El piso de 320 px es para que un teclado abierto en el teléfono —que encoge el
     viewport a la mitad— no deje el marco en veinte píxeles de alto justo mientras
     alguien escribe dentro de él. */
  const alto = Math.max(320, Math.round(window.innerHeight - arriba - mbar - insetInferior() - 8));
  document.documentElement.style.setProperty('--pf-marco-h', alto + 'px');
}
