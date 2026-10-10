/* ============================================================================
   «Datos para la entrega» — el bloque que pide teléfono, cómo se entrega y a dónde.

   No es una pantalla: es un pedazo de panel que usan tres. «Se ganó» del Calendario
   (fabricacion.js), el de Qué atender (inicio.js) y el de la lista de Proyectos (proyectos.js) lo
   ponen debajo de la fecha, y el Tablero lo usa en «Completar», con solo los campos que le faltan
   al proyecto. Es el mismo bloque en los cuatro a propósito: si «Se ganó» pidiera el teléfono de
   una manera y «Completar» de otra, uno de los dos se quedaría atrás la primera vez que alguien
   cambie la regla.

   Lo que decide qué falta y qué se puede guardar es PURO y vive en js/datos/datos-de-entrega.js,
   con su prueba. Aquí está lo que toca el DOM y la red:
     · `html()` pinta el bloque con lo que ya se sabe (el teléfono y la dirección de la
       cotización, el link de Maps si lo traía).
     · `cablear()` cambia lo que se pide según la entrega SIN repintar el panel: con
       instalación, dirección y link; con paquetería, el destino; con recolección, la dirección
       del taller y nada que llenar. Repintar se llevaría lo que ya se escribió.
     · `leer()` / `marcar()` leen lo capturado y enseñan junto a cada campo por qué no se guarda.
     · `ubicar()` lee el link. El corto de WhatsApp se lo pide a la hoja (`/expandir`, por
       `Geo.resolverLink`); sin señal el link se guarda igual y el pin se pone solo en la
       siguiente sincronización (`proyectos.resolverLinksPendientes`).
   ============================================================================ */

import { ENTREGAS, ENTREGA_NOMBRE, TALLER_NOMBRE, DIRECCION_TALLER, entregaLimpia } from '../datos/entrega.js';
import { FALTAS, validarDatos } from '../datos/datos-de-entrega.js';
import { telefonoLimpio } from '../datos/proyectos.js';
import * as Geo from '../datos/geo.js';
import * as Sync from '../datos/sync.js';
import { esc, ico, segmento } from '../nucleo/ui.js';

/* Un solo prefijo de ids: el bloque vive en la capa `pf-pide`, que es una sola en todo el
   documento, así que nunca hay dos bloques a la vez. */
const ID = 'pf-de';

const campoRequerido = '<span class="req" aria-hidden="true">*</span>';

/**
 * El bloque, como HTML.
 * @param {{tel?:string, entrega?:string, dir?:string, maps?:string, pendiente?:boolean}} v lo que ya se sabe
 * @param {{modo?:'ganar'|'completar', pide?:string[], entregaActual?:string, titulo?:boolean,
 *          noPuede?:Object<string,string>}} [o]
 *   `pide`: qué de FALTAS se pregunta (por omisión, todo). `entregaActual`: la del proyecto, para
 *   decidir qué se pide cuando la entrega no está entre lo que se pregunta. `noPuede`: lo que
 *   falta pero este rol no escribe, con la frase de quién lo completa.
 */
export function html(v = {}, o = {}) {
  const modo = o.modo === 'completar' ? 'completar' : 'ganar';
  const pide = new Set(Array.isArray(o.pide) ? o.pide : FALTAS);
  /* En «Se ganó» la entrega nace marcada en Instalación: es lo que es casi todo, y obligar a
     tocarla sería un toque de más en cada venta. En «Completar» no se marca ninguna: lo que falta
     es justo que alguien lo diga. */
  const elegida = ENTREGAS.includes(v.entrega) ? v.entrega : (modo === 'ganar' ? 'instalacion' : '');
  const ent = elegida || entregaLimpia(o.entregaActual);
  const req = modo === 'ganar' ? campoRequerido : '';

  const partes = [];
  if (o.titulo !== false) {
    partes.push('<legend class="pf-de-t">' + ico('i-camion') + ' Datos para la entrega</legend>');
  }

  if (pide.has('tel')) {
    partes.push('<div class="fld" data-de-campo="tel">' +
      '<label for="' + ID + '-tel">Teléfono del cliente' + req + '</label>' +
      '<input type="tel" id="' + ID + '-tel" inputmode="tel" autocomplete="off" maxlength="30"' +
        ' placeholder="33 1234 5678" value="' + esc(v.tel || '') + '"' +
        (modo === 'ganar' ? ' aria-required="true"' : '') + ' aria-describedby="' + ID + '-tel-m">' +
      msg('tel') + '</div>');
  }

  if (pide.has('entrega')) {
    partes.push('<div class="fld" data-de-campo="entrega">' +
      '<div class="fld-lab" id="' + ID + '-ent-l">Cómo se entrega' + req + '</div>' +
      segmento(ENTREGAS.map(e => ({ v: e, t: ENTREGA_NOMBRE[e] })), elegida, 'data-de-entrega', 'Cómo se entrega') +
      msg('entrega') + '</div>');
  }

  /* La dirección es una sola, y lo que cambia es cómo se llama: con instalación es a dónde va
     la camioneta, con paquetería el destino de la guía. Con recolección no se pide. En
     «Completar» solo aparece si es lo que falta: al que ya tiene dirección y le falta el
     teléfono no se le enseña un campo vacío que parece pedírsela otra vez. */
  if (pide.has('dir')) {
    partes.push('<div class="fld" data-de-campo="dir"' + (verDir(ent, pide) ? '' : ' hidden') + '>' +
      '<label for="' + ID + '-dir"><span data-de-dir-l>' + esc(rotuloDir(ent)) + '</span></label>' +
      '<textarea id="' + ID + '-dir" rows="2" maxlength="400" placeholder="Calle y número, colonia, ciudad" ' +
        'aria-describedby="' + ID + '-dir-m">' + esc(v.dir || '') + '</textarea>' +
      msg('dir') + '</div>');
  }
  if (pide.has('pin')) {
    partes.push('<div class="fld" data-de-campo="maps"' + (verMaps(ent, pide) ? '' : ' hidden') + '>' +
      '<label for="' + ID + '-maps">Pega el link de Maps (el de WhatsApp sirve)</label>' +
      '<textarea id="' + ID + '-maps" rows="2" maxlength="2000" inputmode="url" autocomplete="off" ' +
        'placeholder="https://maps.app.goo.gl/…" aria-describedby="' + ID + '-maps-m ' + ID + '-maps-a">' +
        esc(v.maps || '') + '</textarea>' +
      msg('maps') +
      '<p class="hintnote" id="' + ID + '-maps-a">El corto que llega por WhatsApp se lee con la hoja; si no hay señal se guarda y el pin se pone solo después.</p>' +
      '</div>');
  }
  if (modo === 'ganar' && (pide.has('dir') || pide.has('pin'))) {
    const si = !!v.pendiente;
    partes.push('<div class="fld" data-de-campo="pendiente"' + (ent === 'instalacion' ? '' : ' hidden') + '>' +
      '<button type="button" class="switch" role="switch" data-de-pendiente aria-checked="' + (si ? 'true' : 'false') + '">' +
        '<span class="tg' + (si ? ' on' : '') + '" aria-hidden="true"></span> Todavía no la tengo</button>' +
      '<p class="hintnote">Se guarda sin dirección ni pin, y el Tablero la enseña en «Faltan datos» hasta que alguien la complete.</p>' +
      '</div>');
  }
  if (pide.has('entrega')) {
    partes.push('<p class="hintnote pf-de-taller" data-de-campo="taller"' + (ent === 'recoleccion' ? '' : ' hidden') + '>' +
      ico('i-taller') + ' <span>No hace falta la dirección del cliente: lo recoge en el taller, ' + esc(TALLER_NOMBRE) + ', ' +
      esc(DIRECCION_TALLER) + '</span></p>');
  }

  for (const [k, frase] of Object.entries(o.noPuede || {})) {
    partes.push('<p class="hintnote pf-de-nopuede" data-de-nopuede="' + esc(k) + '">' + ico('i-candado') + ' ' + esc(frase) + '</p>');
  }

  return '<fieldset class="pf-de" data-de data-de-modo="' + modo + '" data-de-entrega-actual="' + esc(entregaLimpia(o.entregaActual)) + '"' +
    ' data-de-pide="' + esc([...pide].join(' ')) + '">' + partes.join('') + '</fieldset>';
}

const msg = k => '<p class="hintnote nota-av pf-de-msg" id="' + ID + '-' + k + '-m" hidden></p>';
const rotuloDir = ent => ent === 'paqueteria' ? 'Destino del envío' : 'Dirección';
const verDir = (ent, pide) => (ent === 'instalacion' || ent === 'paqueteria') && pide.has('dir');
const verMaps = (ent, pide) => ent === 'instalacion' && pide.has('pin');

/** El bloque dentro de `raiz`, o null. */
function bloque(raiz) {
  return raiz && raiz.querySelector ? (raiz.matches && raiz.matches('[data-de]') ? raiz : raiz.querySelector('[data-de]')) : null;
}

/**
 * Los oyentes del bloque: la entrega cambia lo que se pide sin repintar, la casilla se prende y se
 * apaga, y escribir en un campo marcado le quita la marca. Se cuelgan del bloque, así que se van
 * con él cuando el panel se rehace.
 */
export function cablear(raiz) {
  const b = bloque(raiz);
  if (!b || b.dataset.deCableado) return;
  b.dataset.deCableado = '1';
  b.addEventListener('click', ev => {
    const s = ev.target.closest('[data-de-entrega]');
    if (s && b.contains(s)) {
      ev.preventDefault();
      for (const x of b.querySelectorAll('[data-de-entrega]')) {
        const on = x === s;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      limpiar(b, 'entrega');
      ajustar(b);
      return;
    }
    const sw = ev.target.closest('[data-de-pendiente]');
    if (sw && b.contains(sw)) {
      ev.preventDefault();
      const si = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', si ? 'true' : 'false');
      const tg = sw.querySelector('.tg'); if (tg) tg.classList.toggle('on', si);
      limpiar(b, 'dir'); limpiar(b, 'maps');
    }
  });
  b.addEventListener('input', ev => {
    const c = ev.target.closest('[data-de-campo]');
    if (c) limpiar(b, c.dataset.deCampo);
  });
}

/* Enseña y esconde según la entrega elegida (o la que el proyecto ya tenía). */
function ajustar(b) {
  const pide = new Set(String(b.dataset.dePide || '').split(' ').filter(Boolean));
  const ent = entregaElegida(b) || entregaLimpia(b.dataset.deEntregaActual);
  const pon = (k, ver) => { const el = b.querySelector('[data-de-campo="' + k + '"]'); if (el) el.hidden = !ver; };
  pon('dir', verDir(ent, pide));
  pon('maps', verMaps(ent, pide));
  pon('pendiente', ent === 'instalacion');
  pon('taller', ent === 'recoleccion');
  const l = b.querySelector('[data-de-dir-l]');
  if (l) l.textContent = rotuloDir(ent);
}

function entregaElegida(b) {
  const on = b.querySelector('[data-de-entrega][aria-pressed="true"]');
  return on ? on.dataset.deEntrega : '';
}

function limpiar(b, k) {
  const c = b.querySelector('[data-de-campo="' + k + '"]');
  if (c) c.classList.remove('falta');
  const m = b.querySelector('#' + ID + '-' + k + '-m');
  if (m) { m.hidden = true; m.textContent = ''; }
}

/** Lo capturado. Lo que está escondido no cuenta: el destino que se escribió con «Paquetería»
 *  y luego se cambió a «Recolección» no se guarda. Con `{todo:true}` sí, para repintar el panel
 *  sin perder lo escrito (el link que se dejó al cambiar a paquetería vuelve si se regresa a
 *  instalación). */
export function leer(raiz, o = {}) {
  const b = bloque(raiz);
  if (!b) return {};
  const val = (k, sel) => {
    const c = b.querySelector('[data-de-campo="' + k + '"]');
    const el = b.querySelector(sel);
    return c && (o.todo || !c.hidden) && el ? String(el.value || '').trim() : '';
  };
  const sw = b.querySelector('[data-de-pendiente]');
  const swc = b.querySelector('[data-de-campo="pendiente"]');
  return {
    tel: val('tel', '#' + ID + '-tel'),
    entrega: entregaElegida(b),
    dir: val('dir', '#' + ID + '-dir'),
    maps: val('maps', '#' + ID + '-maps'),
    pendiente: !!(sw && swc && !swc.hidden && sw.getAttribute('aria-checked') === 'true'),
  };
}

/** Revisa lo capturado con la regla pura y, si algo no está, lo enseña junto a su campo y le
 *  lleva el foco. @returns {Object|null} lo capturado si se puede guardar; null si no. */
export function revisar(raiz, o = {}) {
  const b = bloque(raiz);
  if (!b) return null;
  const d = leer(b);
  const pide = String(b.dataset.dePide || '').split(' ').filter(Boolean);
  const r = validarDatos(d, { modo: b.dataset.deModo, pide, entregaActual: b.dataset.deEntregaActual });
  for (const k of ['tel', 'entrega', 'dir', 'maps']) limpiar(b, k);
  if (r.ok) return d;
  for (const [k, frase] of Object.entries(r.errores)) avisar(b, k, frase);
  /* `alFallar(frase, enSuCampo)`: si la frase ya quedó junto a un campo, quien llama no la
     tiene que repetir en pantalla (solo decirla en voz alta). */
  if (!r.primero) { if (typeof o.alFallar === 'function') o.alFallar(r.mensaje, false); return null; }
  const foco = r.primero === 'entrega' ? b.querySelector('[data-de-entrega]') : b.querySelector('#' + ID + '-' + r.primero);
  if (foco) { try { foco.focus({ preventScroll: false }); foco.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} }
  if (typeof o.alFallar === 'function') o.alFallar(r.mensaje, true);
  return null;
}

/** Enseña una frase junto al campo `k` ('tel', 'entrega', 'dir', 'maps'). */
export function avisar(raiz, k, frase) {
  const b = bloque(raiz);
  if (!b) return;
  const c = b.querySelector('[data-de-campo="' + k + '"]');
  if (c) c.classList.add('falta');
  const m = b.querySelector('#' + ID + '-' + k + '-m');
  if (m) { m.hidden = false; m.textContent = frase; }
}

/**
 * Lee el link y dice qué guardar. El corto se le pide a la hoja; sin señal se guarda el link y
 * el pin queda para la sincronización.
 * @returns {Promise<{ok:true, parche:Object, aviso:string}|{ok:false, mensaje:string}>}
 *   `parche`: `maps_url` y, si salió, `lat`, `lng` y `geo_fuente`. `aviso`: lo que hay que
 *   decirle a la persona aunque se guarde (el pin pendiente, o que es el de la cámara).
 */
export async function ubicar(maps) {
  const url = String(maps || '').trim();
  if (!url) return { ok: true, parche: {}, aviso: '' };
  const r = await Geo.resolverLink(url, Sync.expandir);
  if (r.ok) {
    if (r.sospechoso) {
      return { ok: false, mensaje: 'Ese pin cae fuera de México (' + r.lat.toFixed(4) + ', ' + r.lng.toFixed(4) +
        '). Casi siempre es un link a medio copiar: revísalo. Si de verdad es ahí, ponlo desde el Mapa.' };
    }
    return { ok: true, parche: { maps_url: url, lat: r.lat, lng: r.lng, geo_fuente: r.exacta ? 'maps_pin' : 'maps_camara' },
      aviso: r.exacta ? '' : 'El pin quedó donde apuntaba la cámara del link: revísalo en el Mapa.' };
  }
  if (r.motivo === 'pendiente') return { ok: true, parche: { maps_url: url }, aviso: r.mensaje };
  return { ok: false, mensaje: r.mensaje };
}

/**
 * Lo capturado, como parche del proyecto, sin la ubicación (ésa la da `ubicar`). Solo lo que se
 * pidió y se escribió: un campo vacío en «Completar» no borra nada.
 */
export function parcheDe(d, pide) {
  const p = new Set(Array.isArray(pide) ? pide : FALTAS);
  const out = {};
  if (p.has('tel') && d.tel) out.tel = telefonoLimpio(d.tel);
  if (p.has('entrega') && ENTREGAS.includes(d.entrega)) out.entrega = d.entrega;
  if (p.has('dir') && d.dir) out.dir_texto = d.dir;
  return out;
}

/**
 * Lo capturado en «Se ganó», como el `extra` de `Proyectos.ganar`. Aquí sí manda lo que quedó en
 * el campo aunque esté vacío —quien borró la dirección de la cotización la borró a propósito—,
 * salvo con recolección: ahí no se enseña, y la de la cotización se queda como estaba.
 * @param {Object} d lo de `revisar`   @param {Object} u lo de `ubicar`
 */
export function extraParaGanar(d, u) {
  const entrega = ENTREGAS.includes(d.entrega) ? d.entrega : 'instalacion';
  const x = { tel: telefonoLimpio(d.tel), entrega };
  if (entrega !== 'recoleccion') x.dir_texto = String(d.dir || '');
  if (entrega === 'instalacion') {
    Object.assign(x, { maps_url: String(d.maps || '') }, (u && u.parche) || {});
    if (d.pendiente) x.ubicacion_pendiente = true;
  }
  return x;
}
