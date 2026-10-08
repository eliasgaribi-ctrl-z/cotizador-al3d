/* ============================================================================
   El editor de publicaciones — elegir una plantilla, escribir encima y bajarla.

   Llegó como una página suelta (al3d-editor) y entra a la plataforma como herramienta, igual
   que la mesa de corte: un documento propio dentro de un <iframe>, ver js/mod/herramientas.js.
   Lo que cambió al entrar, además de vestirse con el sistema de diseño:

   · Ningún manejador en el marcado ni guiones en línea: la política de esta página no los deja
     correr (pruebas/csp.mjs), igual que la de la plataforma.
   · Sin alert(): los avisos salen abajo, en el aviso de la app, y no detienen la página.
   · «Mi lista» se quitaba con doble clic —en el teléfono eso es hacer zoom— y ahora cada pieza
     trae su ✕.
   · El editor del teléfono es una hoja que se baja con el dedo, con velocidad: un tirón corto
     basta, no hay que arrastrarla hasta abajo.
   · Las miniaturas de video no se mueven hasta que se les pasa el ratón (ver el CSS).
   ============================================================================ */

import { cargar, P, porId, esc, textoDe, piezaNueva, nodo, png, video, bajar, INSTANTE_QUIETO } from './plantillas.js';
import { SERIES, SUELTAS, slug } from './series.js';
import { zip } from './zip.js';

const $ = id => document.getElementById(id);
const html = document.documentElement;
const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const telefono = () => matchMedia('(max-width: 759px)').matches;

const FORMATOS = [
  ['todo', 'Todas'], ['post@1x1', 'Post 1:1'], ['post@3x4', 'Post 3:4'], ['post@4x5', 'Post 4:5'],
  ['carrusel', 'Carrusel'], ['historia', 'Historias'], ['video', 'Videos'], ['portada', 'Portadas'], ['perfil', 'Foto de perfil'],
];
const ROTULO = {
  titulo: 'Título', titulo2: 'Título (2ª parte)', texto: 'Texto', boton: 'Botón', etiqueta: 'Etiqueta', subtitulo: 'Subtítulo',
  sub: 'Subtítulo', cliente: 'Cliente', cliente2: 'Cliente (2ª línea)', telefono: 'Teléfono', correo: 'Correo',
  direccion: 'Dirección', cita: 'Frase del cliente', autor: 'Autor', empresa: 'Empresa', pregunta: 'Pregunta',
  respuesta: 'Respuesta', numero: 'Número', cifra: 'Cifra', label: 'Texto de la cifra', pagina: 'Página', palabra: 'Palabra',
  eslogan: 'Eslogan', marca: 'Marca', ciudad: 'Ciudad', lugar: 'Lugar', pie: 'Pie de foto', cta: 'Botón', nombre: 'Nombre',
  cargo: 'Cargo', tema: 'Tema', antes: 'Etiqueta antes', despues: 'Etiqueta después', precio: 'Precio', dato: 'Dato', frase: 'Frase',
};
const rotulo = k => ROTULO[k] || (/^t(\d+)$/.test(k) ? 'Texto ' + k.slice(1)
  : k.replace(/(\d+)/, ' $1').replace(/^./, c => c.toUpperCase()));
const ico = id => '<svg class="svgi" aria-hidden="true"><use href="#' + id + '"/></svg>';
const LLAVE_LISTA = 'al3d-editor-lista';
/* Lo que se escribió encima de cada lámina de carrusel, por plantilla. Un conjunto se baja con
   lo que se le escribió a cada una; sin esto, «Descargar conjunto» bajaba los textos de ejemplo
   y había que volver a escribir lámina por lámina. */
const LLAVE_CONJUNTOS = 'al3d-editor-conjuntos';
let editadas = {};
try { editadas = JSON.parse(localStorage.getItem(LLAVE_CONJUNTOS) || '{}') || {}; } catch (_) { editadas = {}; }
function guardarEditadas() {
  try { localStorage.setItem(LLAVE_CONJUNTOS, JSON.stringify(editadas)); }
  catch (_) { aviso('No cabe lo escrito en la memoria del navegador: las fotos pesan mucho.', 'err'); }
}

let formato = 'todo';
let cur = null;        // la plantilla elegida
let item = null;       // la pieza que se está editando
let enLista = -1;      // si la pieza es una de «Mi lista», cuál
let lista = [];
try { lista = JSON.parse(localStorage.getItem(LLAVE_LISTA) || '[]'); if (!Array.isArray(lista)) lista = []; } catch (_) { lista = []; }

const enFormato = (p, f = formato) => {
  if (f === 'todo') return true;
  const [t, r] = f.split('@');
  return p.tipo === t && (!r || p.id.endsWith('@' + r));
};

/* ============================================================================
   El aviso de abajo
   ============================================================================ */
let _relojAviso = 0;
function aviso(texto, tipo) {
  const t = $('pb-toast');
  t.className = 'toast' + (tipo ? ' ' + tipo : '');
  t.textContent = texto;
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(_relojAviso);
  /* Se detiene mientras la pestaña no se ve: un aviso que se va solo mientras nadie mira es un
     aviso que nadie leyó. */
  const esperar = ms => { _relojAviso = setTimeout(() => {
    if (document.hidden) return esperar(1200);
    t.classList.remove('show');
  }, ms); };
  esperar(tipo === 'err' ? 5200 : 2800);
}

/* ============================================================================
   La rejilla
   ============================================================================ */

/* Congela las animaciones de una miniatura en la mitad del ciclo, respetando el retraso que
   ya traiga cada pieza (las plantillas entran escalonadas). */
function congelarMiniatura(el) {
  for (const n of [el, ...el.querySelectorAll('*')]) {
    if (!n.style.animationName || n.style.animationName === 'none') continue;
    n.style.animationDelay = ((parseFloat(n.style.animationDelay) || 0) + INSTANTE_QUIETO) + 's';
  }
}

function escalar(marco) {
  const inn = marco.firstElementChild;
  const p = porId[marco.dataset.id];
  if (!inn || !p) return;
  inn.style.transform = 'scale(' + (marco.clientWidth / p.vista[0]) + ')';
}

const vigia = new IntersectionObserver(es => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    const marco = e.target;
    const p = porId[marco.dataset.id];
    vigia.unobserve(marco);
    if (!p) continue;
    const inn = document.createElement('div');
    inn.className = 'pb-in';
    inn.style.width = p.vista[0] + 'px';
    inn.style.height = p.vista[1] + 'px';
    const el = nodo(p, cur && cur.id === p.id ? item : (editadas[p.id] || null));
    congelarMiniatura(el);
    inn.appendChild(el);
    marco.prepend(inn);
    escalar(marco);
  }
}, { rootMargin: '600px 0px' });

/* Cuando cambia el ancho de la columna cambia el de cada miniatura (la rejilla es 1fr): la
   escala que se calculó al pintarla ya no es la buena. */
let _rzPend = 0;
const medidor = new ResizeObserver(() => {
  if (_rzPend) return;
  _rzPend = requestAnimationFrame(() => {
    _rzPend = 0;
    for (const m of document.querySelectorAll('.pb-marco[data-id]')) if (m.firstElementChild) escalar(m);
  });
});

function pintarFormatos() {
  $('pb-formatos').innerHTML = FORMATOS.map(([k, n]) =>
    '<button type="button" class="chip' + (k === formato ? ' on' : '') + '" data-f="' + k + '" aria-pressed="' + (k === formato) + '">' +
    esc(n) + '<em>' + P.filter(p => enFormato(p, k)).length + '</em></button>').join('');
}

function pintarRejilla() {
  const q = $('pb-q').value.trim().toLowerCase();
  const g = $('pb-rejilla');
  vigia.disconnect();
  const visibles = P.filter(p => enFormato(p) && (!q || (p.id + ' ' + (p.nombre || '') + ' ' + p.tipo).toLowerCase().includes(q)));
  const frag = document.createDocumentFragment();
  /* Carrusel sin búsqueda: por conjunto, cada uno con sus láminas en orden y su botón para
     bajarlo entero. Con búsqueda se vuelve a la rejilla plana, que es lo que se busca. */
  if (formato === 'carrusel' && !q) {
    for (const s of SERIES.concat([SUELTAS])) {
      const ps = s.ids.map(id => porId[id]).filter(Boolean);
      if (!ps.length) continue;
      const sec = document.createElement('section');
      sec.className = 'pb-serie';
      sec.setAttribute('aria-label', s.nombre);
      sec.innerHTML = '<header class="pb-serie-cab"><div><b>' + esc(s.nombre) + '</b><span>' +
        (s.suelta ? ps.length + ' estilos para armar a mano' : ps.length + ' láminas, en el orden en que se suben') + '</span></div>' +
        (s.suelta ? '' : '<button type="button" class="btn btn-gho pb-bajar-serie" data-serie="' + esc(s.id) + '">' +
          '<span class="pb-btx">' + ico('i-bajar') + 'Descargar conjunto</span></button>') + '</header>';
      const rej = document.createElement('div');
      rej.className = 'pb-serie-rej';
      for (const p of ps) rej.appendChild(tarjeta(p, s.suelta ? 0 : s.ids.indexOf(p.id) + 1));
      sec.appendChild(rej);
      frag.appendChild(sec);
    }
    g.classList.add('por-serie');
    g.replaceChildren(frag);
    $('pb-cuenta').textContent = SERIES.length + ' conjuntos de carrusel · ' + visibles.length + ' láminas';
    return;
  }
  g.classList.remove('por-serie');
  for (const p of visibles) frag.appendChild(tarjeta(p));
  g.replaceChildren(frag);
  if (!visibles.length) {
    g.innerHTML = '<div class="pb-nada"><b>Ningún diseño con «' + esc(q) + '»</b>Prueba con otra palabra o con el número (P12, H04…).</div>';
  }
  $('pb-cuenta').textContent = visibles.length === P.length ? P.length + ' plantillas'
    : visibles.length + ' de ' + P.length + ' plantillas';
}

/* Una miniatura. `orden` (1…n) es su lugar en el conjunto, y se pinta sobre la esquina. */
function tarjeta(p, orden = 0) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pb-tarj' + (p.tipo === 'video' ? ' es-video' : '') + (cur && cur.id === p.id ? ' on' : '');
    b.dataset.id = p.id;
    b.setAttribute('aria-label', p.id.replace('@', ' ') + (p.nombre ? ', ' + p.nombre : ''));
    if (cur && cur.id === p.id) b.setAttribute('aria-current', 'true');
    const m = document.createElement('div');
    m.className = 'pb-marco';
    m.dataset.id = p.id;
    m.style.aspectRatio = p.vista[0] + '/' + p.vista[1];
    if (p.tipo === 'video') m.insertAdjacentHTML('beforeend', '<span class="pb-sello">' + ico('i-video') + '6 s</span>');
    const pie = document.createElement('div');
    pie.className = 'pb-pie';
    pie.innerHTML = (orden ? '<i class="pb-orden" aria-label="lámina ' + orden + '">' + String(orden).padStart(2, '0') + '</i>' : '') +
      '<b>' + esc(p.id.replace('@', ' · ')) + '</b><span>' + esc(p.nombre || p.tipo) + '</span>';
    if (editadas[p.id]) m.insertAdjacentHTML('beforeend', '<span class="pb-sello pb-editada">Editada</span>');
    b.append(m, pie);
    vigia.observe(m);
    return b;
}

/* Repintar solo la miniatura elegida, para que refleje lo que se escribe, sin tocar las demás. */
let _miniPend = 0;
function refrescarMiniatura() {
  if (_miniPend || !cur) return;
  _miniPend = requestAnimationFrame(() => {
    _miniPend = 0;
    const m = document.querySelector('.pb-marco[data-id="' + CSS.escape(cur.id) + '"]');
    const inn = m && m.firstElementChild && m.firstElementChild.classList.contains('pb-in') ? m.firstElementChild : null;
    if (!inn) return;
    const el = nodo(cur, item);
    congelarMiniatura(el);
    inn.replaceChildren(el);
  });
}

/* ============================================================================
   El editor
   ============================================================================ */

function elegir(id, pieza, indice = -1) {
  const p = porId[id];
  if (!p) return;
  const antes = cur && cur.id;
  cur = p;
  item = pieza || (editadas[id] ? copia(editadas[id]) : piezaNueva(p));
  item.campos = { ...p.campos, ...(item.campos || {}) };
  item.fotos = Array.from({ length: p.fotos || 0 }, (_, i) => (item.fotos || [])[i] || '');
  enLista = indice;
  /* Se cambia la clase de dos tarjetas en vez de repintar la rejilla entera: repintar re-crea
     554 botones y le quita el foco a la que se acaba de tocar. */
  if (antes !== id) {
    for (const t of document.querySelectorAll('.pb-tarj.on')) { t.classList.remove('on'); t.removeAttribute('aria-current'); }
    const t = document.querySelector('.pb-tarj[data-id="' + CSS.escape(id) + '"]');
    if (t) { t.classList.add('on'); t.setAttribute('aria-current', 'true'); }
  }
  pintarEditor();
  refrescarMiniatura();
  abrirHoja();
}

function pintarEditor() {
  const ed = $('pb-ed');
  ed.replaceChildren();
  ed.scrollTop = 0;

  /* ----- La vista previa ----- */
  const prev = document.createElement('div');
  prev.className = 'pb-prev';
  const ancho = Math.min(telefono() ? window.innerWidth - 32 : 340, ($('pb-editor').clientWidth || 400) - 40);
  const alto = telefono() ? Math.min(window.innerHeight * 0.42, 420) : 440;
  const sc = Math.min(ancho / cur.vista[0], alto / cur.vista[1], 1.4);
  const caja = document.createElement('div');
  caja.className = 'pb-caja';
  caja.style.width = cur.vista[0] * sc + 'px';
  caja.style.height = cur.vista[1] * sc + 'px';
  const el = nodo(cur, item);
  el.style.transform = 'scale(' + sc + ')';
  el.style.borderRadius = '0';
  el.style.boxShadow = 'none';
  caja.appendChild(el);
  prev.appendChild(caja);

  el.querySelectorAll('[data-slot]').forEach(n => {
    /* Solo texto: pegar desde Word o desde WhatsApp metía negritas y colores que luego no
       salen en la imagen. Firefox viejo no lo conoce y lanza; ahí queda el editable normal. */
    try { n.contentEditable = 'plaintext-only'; } catch (_) { n.contentEditable = 'true'; }
    if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
    n.spellcheck = false;
    n.setAttribute('role', 'textbox');
    n.setAttribute('aria-label', rotulo(n.dataset.slot));
    n.addEventListener('input', () => {
      const k = n.dataset.slot;
      item.campos[k] = textoDe(n);
      const f = ed.querySelector('[data-f="' + CSS.escape(k) + '"]');
      if (f) f.value = item.campos[k];
      el.querySelectorAll('[data-slot="' + CSS.escape(k) + '"]').forEach(o => { if (o !== n) o.innerHTML = esc(item.campos[k]); });
      cambio();
    });
  });
  el.querySelectorAll('[data-foto]').forEach(n => {
    const i = +n.dataset.foto - 1;
    n.addEventListener('click', ev => { if (!ev.target.closest('[data-slot]')) pedirFoto(i); });
    n.addEventListener('dragover', ev => { ev.preventDefault(); n.classList.add('soltar'); });
    n.addEventListener('dragleave', () => n.classList.remove('soltar'));
    n.addEventListener('drop', ev => {
      ev.preventDefault(); n.classList.remove('soltar');
      const f = ev.dataTransfer.files[0];
      if (f) leerFoto(f, i);
    });
  });

  /* ----- Qué es ----- */
  const info = document.createElement('div');
  info.className = 'pb-info';
  info.innerHTML = '<b>' + esc(cur.id.replace('@', ' · ') + (cur.nombre ? ' — ' + cur.nombre : '')) + '</b>' +
    '<span>' + cur.ancho + ' × ' + cur.alto + ' px · toca el diseño para escribir' + (cur.fotos ? ' o poner fotos' : '') + '</span>';

  /* ----- Los campos ----- */
  const form = document.createElement('div');
  form.className = 'pb-form';
  for (const k of Object.keys(item.campos)) {
    const v = item.campos[k] || '';
    const largo = v.length > 28 || v.includes('\n');
    const d = document.createElement('div');
    d.className = 'fld';
    const id = 'pb-c-' + k;
    d.innerHTML = '<label for="' + esc(id) + '">' + esc(rotulo(k)) + '</label>';
    const i = document.createElement(largo ? 'textarea' : 'input');
    i.id = id;
    if (largo) i.rows = Math.min(4, Math.ceil(v.length / 30) + (v.split('\n').length - 1));
    i.value = v;
    i.dataset.f = k;
    i.addEventListener('input', () => {
      item.campos[k] = i.value;
      el.querySelectorAll('[data-slot="' + CSS.escape(k) + '"]').forEach(n => { if (document.activeElement !== n) n.innerHTML = esc(i.value); });
      cambio();
    });
    d.appendChild(i);
    form.appendChild(d);
  }
  for (let n = 0; n < (cur.fotos || 0); n++) {
    const d = document.createElement('div');
    d.className = 'fld';
    const u = item.fotos[n];
    d.innerHTML = '<label>Foto ' + (n + 1) + '</label>';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pb-foto';
    b.innerHTML = '<i class="' + (u ? 'con' : '') + '">' + ico('i-imagen') + '</i><span>' + (u ? 'Cambiar foto' : 'Poner foto') + '</span>';
    if (u) b.firstElementChild.style.backgroundImage = 'url("' + u + '")';
    b.addEventListener('click', () => pedirFoto(n));
    d.appendChild(b);
    form.appendChild(d);
  }
  if (!Object.keys(item.campos).length && !cur.fotos) form.innerHTML = '<p class="pb-sin">Este diseño no lleva textos: bájalo tal cual.</p>';

  /* ----- Mi lista ----- */
  const li = document.createElement('div');
  li.className = 'pb-lista';
  li.id = 'pb-lista';

  /* ----- Avanzado ----- */
  const adv = document.createElement('details');
  adv.className = 'pb-avanzado';
  adv.innerHTML = '<summary>Avanzado: JSON para automatizar</summary><textarea id="pb-json" readonly spellcheck="false" aria-label="JSON de la pieza y de tu lista"></textarea>' +
    '<button type="button" class="btn btn-gho" id="pb-copiar">' + ico('i-copiar') + 'Copiar</button>';

  /* ----- Las acciones ----- */
  const acc = document.createElement('div');
  acc.className = 'pb-acc';
  acc.innerHTML =
    '<button type="button" class="btn btn-pri" id="pb-png"><span class="pb-btx">' + ico('i-bajar') + 'Descargar PNG</span></button>' +
    (cur.tipo === 'video'
      ? '<button type="button" class="btn btn-gho" id="pb-vid"><span class="pb-btx">' + ico('i-video') + 'Descargar video (6 s)</span><span class="pb-prog"></span></button>' +
        '<label class="pb-croma"><input type="checkbox" id="pb-croma"> Fondo verde para encimarlo sobre tu grabación</label>'
      : '') +
    '<div class="pb-fila2">' +
      '<button type="button" class="btn btn-gho" id="pb-guardar"><span class="pb-btx">' + ico('i-mas') + (enLista >= 0 ? 'Actualizar en mi lista' : 'Guardar en mi lista') + '</span></button>' +
      '<button type="button" class="btn btn-gho" id="pb-todo"><span class="pb-btx">' + ico('i-bajar') + 'Bajar mi lista</span></button>' +
    '</div>';

  ed.append(prev, info, form, li, adv, acc);

  $('pb-png').addEventListener('click', descargarPng);
  if ($('pb-vid')) $('pb-vid').addEventListener('click', descargarVideo);
  $('pb-guardar').addEventListener('click', guardarEnLista);
  $('pb-todo').addEventListener('click', bajarLista);
  $('pb-copiar').addEventListener('click', copiarJson);
  pintarLista();
  pintarJson();
}

/* Un cambio de texto o de foto: la miniatura de la rejilla, el JSON y, si la pieza es de la
   lista, la lista guardada. */
let _guardaPend = 0;
function cambio() {
  refrescarMiniatura();
  pintarJson();
  if (cur && cur.tipo === 'carrusel') {
    clearTimeout(_editPend);
    const id = cur.id, pieza = item;
    _editPend = setTimeout(() => { editadas[id] = copia(pieza); guardarEditadas(); }, 400);
  }
  if (enLista >= 0) {
    clearTimeout(_guardaPend);
    _guardaPend = setTimeout(() => { lista[enLista] = copia(item); guardarLista(true); }, 400);
  }
}
const copia = o => JSON.parse(JSON.stringify(o));
let _editPend = 0;

function leerFoto(f, i) {
  if (!/^image\//.test(f.type)) { aviso('Eso no es una imagen: usa JPG, PNG o WEBP.', 'err'); return; }
  const r = new FileReader();
  r.onload = () => { item.fotos[i] = r.result; pintarEditor(); cambio(); };
  r.onerror = () => aviso('No se pudo leer la foto.', 'err');
  r.readAsDataURL(f);
}
function pedirFoto(i) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.addEventListener('change', () => { if (inp.files[0]) leerFoto(inp.files[0], i); });
  inp.click();
}

/* El rótulo de un botón que cambia, con el desenfoque corto del CSS. */
function rotular(btn, icono, texto) {
  const tx = btn.querySelector('.pb-btx');
  if (!tx) return;
  const poner = () => { tx.innerHTML = (icono ? ico(icono) : '') + esc(texto); tx.classList.remove('cambia'); };
  if (quieto()) return poner();
  tx.classList.add('cambia');
  setTimeout(poner, 90);
}

const nombreArchivo = it => (it.nombre || it.plantilla || 'al3d').replace(/[^\w.-]+/g, '-');

async function descargarPng() {
  const b = $('pb-png');
  if (b.disabled) return;
  b.disabled = true;
  rotular(b, null, 'Generando…');
  try {
    bajar(await png(item), nombreArchivo(item) + '.png');
    rotular(b, 'i-check', 'Descargado');
    setTimeout(() => { if (b.isConnected) rotular(b, 'i-bajar', 'Descargar PNG'); }, 1600);
  } catch (e) {
    rotular(b, 'i-bajar', 'Descargar PNG');
    aviso('No se pudo generar la imagen: ' + (e && e.message || e), 'err');
  } finally { b.disabled = false; }
}

let _videoEnCurso = null;
async function descargarVideo() {
  const b = $('pb-vid');
  /* El mismo botón cancela: un video tarda y quien lo pidió por error no tiene por qué esperar. */
  if (_videoEnCurso) { _videoEnCurso.abort(); return; }
  const ctl = new AbortController();
  _videoEnCurso = ctl;
  const barra = b.querySelector('.pb-prog');
  rotular(b, null, 'Preparando… toca para cancelar');
  try {
    const { blob, ext } = await video(item, {
      croma: $('pb-croma') && $('pb-croma').checked,
      senal: ctl.signal,
      alAvanzar: (fase, x) => {
        /* Preparar los cuadros es la mitad lenta; grabar, la otra. Una sola barra de 0 a 1. */
        if (barra) barra.style.transform = 'scaleX(' + (fase === 'preparar' ? x * 0.7 : 0.7 + x * 0.3) + ')';
        if (fase === 'grabar' && x < 0.05) rotular(b, null, 'Grabando… toca para cancelar');
      },
    });
    bajar(URL.createObjectURL(blob), nombreArchivo(item) + '.' + ext);
    aviso(ext === 'webm' ? 'Video listo (.webm). Instagram y TikTok lo aceptan desde la computadora.' : 'Video listo.', 'ok');
  } catch (e) {
    if (e && e.name === 'AbortError') aviso('Video cancelado.');
    else aviso('No se pudo generar el video: ' + (e && e.message || e), 'err');
  } finally {
    _videoEnCurso = null;
    if (b.isConnected) {
      rotular(b, 'i-video', 'Descargar video (6 s)');
      if (barra) barra.style.transform = 'scaleX(0)';
    }
  }
}

/* ============================================================================
   Mi lista
   ============================================================================ */
function guardarLista(callado) {
  try { localStorage.setItem(LLAVE_LISTA, JSON.stringify(lista)); return true; }
  catch (_) {
    if (!callado) aviso('Tu lista ya no cabe en este aparato: las fotos pesan. Baja lo que tengas y quita piezas.', 'err');
    return false;
  }
}

function guardarEnLista() {
  const b = $('pb-guardar');
  if (enLista >= 0) {
    lista[enLista] = copia(item);
  } else {
    lista.push(copia(item));
    enLista = lista.length - 1;
  }
  if (!guardarLista()) { if (enLista === lista.length - 1) { lista.pop(); enLista = -1; } return; }
  pintarLista(enLista);
  pintarJson();
  rotular(b, 'i-check', 'En tu lista');
  setTimeout(() => { if (b.isConnected) rotular(b, 'i-mas', 'Actualizar en mi lista'); }, 1400);
}

function pintarLista(nuevo = -1) {
  const li = $('pb-lista');
  if (!li) return;
  const t = $('pb-todo');
  if (t) t.disabled = !lista.length;
  if (!lista.length) { li.replaceChildren(); li.hidden = true; return; }
  li.hidden = false;
  li.innerHTML = '<p class="pb-lista-t">Mi lista · ' + lista.length + '</p><div class="pb-lista-f"></div>';
  const f = li.lastElementChild;
  lista.forEach((it, i) => {
    const s = document.createElement('span');
    s.className = 'pb-item' + (i === nuevo ? ' nuevo' : '');
    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.textContent = String(it.plantilla || '').replace('@', ' · ');
    abrir.title = 'Abrir ' + (it.nombre || it.plantilla);
    if (i === enLista) abrir.setAttribute('aria-current', 'true');
    abrir.addEventListener('click', () => elegir(it.plantilla, copia(it), i));
    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.innerHTML = ico('i-cerrar');
    quitar.setAttribute('aria-label', 'Quitar ' + (it.nombre || it.plantilla) + ' de mi lista');
    quitar.addEventListener('click', () => {
      const [fuera] = lista.splice(i, 1);
      if (enLista === i) enLista = -1; else if (enLista > i) enLista--;
      guardarLista(true);
      pintarLista();
      pintarJson();
      const g = $('pb-guardar');
      if (g && enLista < 0) rotular(g, 'i-mas', 'Guardar en mi lista');
      avisoDeshacer('Quitada de tu lista', () => { lista.splice(i, 0, fuera); guardarLista(true); pintarLista(i); pintarJson(); });
    });
    s.append(abrir, quitar);
    f.appendChild(s);
  });
}

/* Quitar es inmediato y se puede deshacer: preguntar «¿seguro?» por una pieza que se vuelve a
   armar en diez segundos es más caro que el error. */
function avisoDeshacer(texto, deshacer) {
  const t = $('pb-toast');
  aviso(texto);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toast-act';
  b.textContent = 'Deshacer';
  b.addEventListener('click', () => { deshacer(); t.classList.remove('show'); }, { once: true });
  t.appendChild(b);
}

async function bajarLista() {
  const b = $('pb-todo');
  if (!lista.length || b.disabled) return;
  b.disabled = true;
  try {
    for (let i = 0; i < lista.length; i++) {
      rotular(b, null, (i + 1) + ' de ' + lista.length + '…');
      bajar(await png(lista[i]), nombreArchivo(lista[i]) + '.png');
      await new Promise(r => setTimeout(r, 350));
    }
    aviso(lista.length === 1 ? 'Se bajó tu pieza.' : 'Se bajaron las ' + lista.length + ' piezas de tu lista.', 'ok');
  } catch (e) {
    aviso('Se detuvo la descarga: ' + (e && e.message || e), 'err');
  } finally {
    if (b.isConnected) { b.disabled = !lista.length; rotular(b, 'i-bajar', 'Bajar mi lista'); }
  }
}

/* ----- Un conjunto entero -----
   Cada lámina con lo que se le escribió (`editadas`) y, si no se tocó, con su texto de ejemplo;
   numeradas 01, 02… en el orden de la serie, que es el orden en que se suben. En la computadora,
   un .zip; en el teléfono, si puede compartir archivos, la hoja de compartir con las imágenes en
   orden —un .zip en el teléfono no se sube a Instagram—. Compartir pide un toque del usuario y
   generar diez láminas tarda más de lo que el navegador espera ese toque, así que primero se
   generan y el mismo botón pasa a «Compartir las N». */
let _listas = null;      // { serie, archivos: File[] } ya generadas, esperando el toque de compartir
async function bajarSerie(b) {
  const s = SERIES.find(x => x.id === b.dataset.serie);
  if (!s || b.disabled) return;
  if (_listas && _listas.serie === s.id) {
    const files = _listas.archivos;
    _listas = null;
    try { await navigator.share({ files, title: s.nombre }); }
    catch (e) { if (!e || e.name !== 'AbortError') aviso('No se pudo compartir: ' + (e && e.message || e), 'err'); }
    rotular(b, 'i-bajar', 'Descargar conjunto');
    return;
  }
  const ps = s.ids.filter(id => porId[id]);
  b.disabled = true;
  const carpeta = slug(s.nombre);
  try {
    const archivos = [];
    for (let i = 0; i < ps.length; i++) {
      rotular(b, null, (i + 1) + ' de ' + ps.length + '…');
      const id = ps[i];
      const url = await png(editadas[id] || piezaNueva(porId[id]));
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      archivos.push({ nombre: String(i + 1).padStart(2, '0') + '-' + id.replace('@', '-').toLowerCase() + '.png', bytes });
    }
    const files = typeof File === 'function' ? archivos.map(a => new File([a.bytes], a.nombre, { type: 'image/png' })) : [];
    if (telefono() && files.length && navigator.canShare && navigator.canShare({ files })) {
      _listas = { serie: s.id, archivos: files };
      rotular(b, 'i-bajar', 'Compartir las ' + files.length);
      aviso('Listas. Toca «Compartir las ' + files.length + '» para mandarlas en orden.', 'ok');
      return;
    }
    const z = zip(archivos.map(a => ({ nombre: carpeta + '/' + a.nombre, bytes: a.bytes })));
    bajar(URL.createObjectURL(new Blob([z], { type: 'application/zip' })), 'al3d-' + carpeta + '.zip');
    rotular(b, 'i-check', 'Descargado');
    aviso('«' + s.nombre + '»: ' + archivos.length + ' láminas en un .zip, numeradas en orden.', 'ok');
    setTimeout(() => { if (b.isConnected && !_listas) rotular(b, 'i-bajar', 'Descargar conjunto'); }, 1800);
  } catch (e) {
    rotular(b, 'i-bajar', 'Descargar conjunto');
    aviso('No se pudo armar el conjunto: ' + (e && e.message || e), 'err');
  } finally { b.disabled = false; }
}

function pintarJson() {
  const j = $('pb-json');
  if (j) j.value = JSON.stringify(enLista >= 0 ? lista : lista.concat(item ? [item] : []), null, 2);
}
async function copiarJson() {
  const j = $('pb-json');
  try { await navigator.clipboard.writeText(j.value); aviso('JSON copiado.', 'ok'); }
  catch (_) { j.select(); aviso('Selecciónalo y cópialo con Ctrl+C.'); }
}

/* ============================================================================
   La hoja del teléfono
   ============================================================================ */
function abrirHoja() {
  if (!telefono()) return;
  const ed = $('pb-editor'), velo = $('pb-velo');
  velo.hidden = false;
  void velo.offsetWidth;
  velo.classList.add('abierto');
  ed.classList.add('abierto');
  ed.style.transform = '';
  html.style.overflow = 'hidden';
}
function cerrarHoja() {
  const ed = $('pb-editor'), velo = $('pb-velo');
  if (!ed.classList.contains('abierto')) return;
  ed.classList.remove('abierto');
  ed.style.transform = '';
  velo.classList.remove('abierto');
  html.style.overflow = '';
  setTimeout(() => { if (!velo.classList.contains('abierto')) velo.hidden = true; }, 280);
  const t = cur && document.querySelector('.pb-tarj[data-id="' + CSS.escape(cur.id) + '"]');
  if (t) t.focus({ preventScroll: true });
}

/* Se baja con el dedo desde el asa. Cuenta la velocidad y no solo la distancia: un tirón corto
   y rápido cierra igual que arrastrarla hasta abajo. Hacia arriba no hay tope duro: se estira
   con resistencia, que es como se siente una hoja de verdad. */
function arrastreDeHoja() {
  const asa = $('pb-asa'), ed = $('pb-editor');
  let y0 = 0, t0 = 0, dy = 0, id = null;
  asa.addEventListener('pointerdown', e => {
    if (id !== null || !ed.classList.contains('abierto')) return;
    id = e.pointerId; y0 = e.clientY; t0 = performance.now(); dy = 0;
    asa.setPointerCapture(id);
    ed.classList.add('arrastra');
  });
  asa.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const d = e.clientY - y0;
    dy = d < 0 ? -Math.sqrt(-d) * 2 : d;
    ed.style.transform = 'translateY(' + dy + 'px)';
  });
  const soltar = e => {
    if (e.pointerId !== id) return;
    id = null;
    ed.classList.remove('arrastra');
    const v = Math.abs(dy) / Math.max(1, performance.now() - t0);
    if (dy > 120 || (dy > 12 && v > 0.11)) cerrarHoja();
    else ed.style.transform = '';
  };
  asa.addEventListener('pointerup', soltar);
  asa.addEventListener('pointercancel', soltar);
}

/* ============================================================================
   Crear con mi idea
   ============================================================================ */
const TEL = '33 2813 0092';
const EJEMPLOS = [
  'Terminamos letras 3D para una cafetería en Zapopan',
  '¿Cuánto cuesta un anuncio luminoso? Quiero explicar de qué depende',
  'Promoción de cajas de luz para negocios nuevos',
  'Video del proceso de fabricación de un letrero de neón',
  'Testimonio de un cliente feliz con su fachada',
];
function temas(t) {
  t = t.toLowerCase();
  const r = [];
  const si = (k, re) => { if (re.test(t)) r.push(k); };
  si('proyecto', /terminam|instalam|proyecto|cliente|fachada|entreg|quedó|hicimos/);
  si('antes', /antes|después|despues|cambio|renov/);
  si('precio', /precio|cuesta|costo|cotiz|promo|descuento|oferta/);
  si('pregunta', /\?|pregunta|dudas|sabías|cómo|cuánto|por qué/);
  si('testimonio', /testimon|opini|reseña|cliente feliz|dijo|recomienda/);
  si('proceso', /proceso|paso|fabrica|taller|cómo se hace|armado/);
  si('contacto', /contact|whatsapp|teléfono|llám|escríb|ubicación|visít/);
  si('servicios', /servicio|tipos|opciones|neón|caja de luz|letras|materiales/);
  return r;
}
function formatoDe(t) {
  t = t.toLowerCase();
  if (/reel|video|tiktok/.test(t)) return 'video';
  if (/historia|story/.test(t)) return 'historia';
  if (/carrusel|pasos|guía|guia|lista/.test(t)) return 'carrusel';
  return 'post@3x4';
}
const CLAVES = {
  proyecto: /proyecto|foto|cliente|galer|mosaico|panorama|terminad|portafolio|marco|tarjeta flotante|sello|lateral|protagonista/i,
  antes: /antes|después|comparativa|día y noche/i,
  precio: /precio|etiqueta|boleto|cotiz|recibo|teléfono|sello/i,
  pregunta: /pregunta|quiz|sabías|signo|encuesta|glosario|respuesta|chat/i,
  testimonio: /cita|testimonio|estrellas|retrato/i,
  proceso: /paso|proceso|escalera|línea|avance|chevron|tres escenas|flecha|número|progreso/i,
  contacto: /contacto|teléfono|ubicación|mapa|horario|qr|cotiza/i,
  servicios: /servicio|materiales|chips|tipos|industrias|lista|checklist|cuadrícula/i,
};
function candidatas(txt, fmt, n) {
  const ts = temas(txt);
  const puntos = p => ts.reduce((s, t) => s + (CLAVES[t].test(p.nombre || '') ? 3 : 0), 0) + Math.random() * 1.5;
  return P.filter(p => enFormato(p, fmt)).map(p => [puntos(p), p]).sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]);
}
function titular(t) {
  let s = t.replace(/\s+/g, ' ').trim();
  const q = s.match(/¿[^?]+\?/);
  if (q) return q[0];
  s = s.split(/[.,;:\n]| quiero | para mostrar /i)[0];
  return s.split(' ').slice(0, 7).join(' ');
}
function clienteDe(t) {
  const m = t.match(/(?:para|de) (?:la |el |los |las )?(?:cafetería|tienda|restaurante|clínica|negocio|empresa|local|plaza)?\s*([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+(?: [A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]+)*)/);
  return m ? m[1] : null;
}
function ciudadDe(t) {
  const m = t.match(/\b(Zapopan|Guadalajara|Tlaquepaque|Tonalá|Tlajomulco|El Salto)\b/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ', Jal.' : null;
}
function llenar(p, txt) {
  const c = { ...p.campos };
  const tit = titular(txt), cl = clienteDe(txt), ci = ciudadDe(txt);
  let conTitulo = false;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (/^(titulo|pregunta|frase|eslogan|t1)$/.test(k) && !conTitulo) { c[k] = tit; conTitulo = true; }
    else if (/^(texto|respuesta|sub|subtitulo|definicion)$/.test(k)) c[k] = txt.length > 110 ? txt.slice(0, 108).replace(/\s\S*$/, '') + '…' : txt;
    else if (/cliente/.test(k) && cl) c[k] = k === 'cliente2' ? '' : cl;
    else if (/^(ciudad|lugar)$/.test(k) && ci) c[k] = ci;
    else if (/telefono/.test(k)) c[k] = TEL;
    else if (/^(boton|cta)$/.test(k)) c[k] = /precio|cotiz|cuesta/i.test(txt) ? 'Solicita tu cotización' : v;
  }
  if (!conTitulo) {
    const k = Object.keys(c).sort((a, b) => c[b].length - c[a].length)[0];
    if (k) c[k] = tit;
  }
  return c;
}

async function proponer() {
  const txt = $('pb-idea-tx').value.trim();
  const st = $('pb-idea-st');
  if (!txt) { st.textContent = 'Escribe tu idea primero.'; $('pb-idea-tx').focus(); return; }
  const fmt = $('pb-idea-fmt').value || formatoDe(txt), n = +$('pb-idea-n').value;
  st.textContent = 'Armando opciones…';
  let piezas = null;
  /* Si la página corre donde hay un modelo a la mano (window.claude), que reescriba los textos.
     En la plataforma no lo hay y se llena con las reglas de abajo, que no piden red. */
  if (window.claude && typeof window.claude.complete === 'function') {
    try {
      const cands = candidatas(txt, fmt, Math.min(40, n * 4));
      const prompt = 'Eres el community manager de AL3D (Anuncios Luminosos 3D, Zapopan, Jalisco; tel ' + TEL + '). ' +
        'Tono: tutea, frases cortas, sin emoji, sin mayúsculas para gritar, una idea por pieza, cierre con acción. ' +
        'Idea del usuario: "' + txt + '". Plantillas disponibles (id, nombre, campos con texto de ejemplo):\n' +
        cands.map(p => p.id + ' | ' + p.nombre + ' | ' + JSON.stringify(p.campos)).join('\n') +
        '\nElige las ' + n + ' plantillas que mejor cuenten la idea, variadas entre sí, y reescribe TODOS sus campos con textos ' +
        'de la misma longitud aproximada que el ejemplo (titulares de máximo 7 palabras; usa \\n donde el ejemplo tenga salto). ' +
        'Responde solo JSON: [{"plantilla":"ID","campos":{...}}]';
      const out = await window.claude.complete(prompt);
      const j = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
      piezas = j.filter(x => porId[x.plantilla]).map(x => ({ plantilla: x.plantilla, campos: { ...porId[x.plantilla].campos, ...x.campos } }));
    } catch (_) { piezas = null; }
  }
  if (!piezas || !piezas.length) piezas = candidatas(txt, fmt, n).map(p => ({ plantilla: p.id, campos: llenar(p, txt) }));
  const nombreFmt = (FORMATOS.find(f => f[0] === fmt) || [0, fmt])[1];
  st.textContent = piezas.length ? piezas.length + ' opciones · ' + nombreFmt : 'No encontré plantillas para ese formato.';

  const ops = $('pb-idea-ops');
  ops.replaceChildren();
  piezas.forEach((it, i) => {
    const p = porId[it.plantilla];
    it.nombre = p.id.replace('@', '-').toLowerCase();
    it.fotos = Array(p.fotos || 0).fill('');
    const d = document.createElement('div');
    d.className = 'pb-op';
    d.style.setProperty('--i', i);
    const m = document.createElement('div');
    m.className = 'pb-marco';
    m.dataset.id = p.id;
    m.style.aspectRatio = p.vista[0] + '/' + p.vista[1];
    const inn = document.createElement('div');
    inn.className = 'pb-in';
    inn.style.width = p.vista[0] + 'px';
    inn.style.height = p.vista[1] + 'px';
    const el = nodo(p, it);
    congelarMiniatura(el);
    inn.appendChild(el);
    m.appendChild(inn);
    const s = document.createElement('small');
    s.textContent = p.id.replace('@', ' · ') + (p.nombre ? ' — ' + p.nombre : '');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-gho';
    b.textContent = 'Usar esta';
    b.addEventListener('click', () => { $('pb-idea').close(); elegir(p.id, it); });
    d.append(m, s, b);
    ops.appendChild(d);
    requestAnimationFrame(() => escalar(m));
  });
}

function prepararIdea() {
  const dlg = $('pb-idea');
  $('pb-idea-abrir').addEventListener('click', () => {
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    $('pb-idea-tx').focus();
  });
  /* Tocar fuera de la caja cierra, como en cualquier diálogo de la app. */
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  $('pb-idea-ir').addEventListener('click', proponer);
  $('pb-idea-tx').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); proponer(); }
  });
  $('pb-idea-ej').innerHTML = EJEMPLOS.map(t => '<button type="button" class="chip">' + esc(t) + '</button>').join('');
  $('pb-idea-ej').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $('pb-idea-tx').value = b.textContent;
    proponer();
  });
}

/* ============================================================================
   Arranque
   ============================================================================ */
function oyentes() {
  let pend = 0;
  $('pb-q').addEventListener('input', () => {
    if (pend) return;
    pend = requestAnimationFrame(() => { pend = 0; pintarRejilla(); });
  });
  $('pb-formatos').addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (!b || b.dataset.f === formato) return;
    formato = b.dataset.f;
    for (const c of $('pb-formatos').children) {
      const on = c.dataset.f === formato;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', on);
    }
    pintarRejilla();
  });
  $('pb-tam').addEventListener('click', e => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    for (const x of $('pb-tam').children) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }
    $('pb-rejilla').style.setProperty('--w', b.dataset.w + 'px');
  });
  $('pb-rejilla').addEventListener('click', e => {
    const bs = e.target.closest('.pb-bajar-serie[data-serie]');
    if (bs) { bajarSerie(bs); return; }
    const t = e.target.closest('.pb-tarj[data-id]');
    if (t) elegir(t.dataset.id);
  });
  $('pb-cerrar').addEventListener('click', cerrarHoja);
  $('pb-velo').addEventListener('click', cerrarHoja);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('pb-editor').classList.contains('abierto') && !$('pb-idea').open) cerrarHoja();
    /* «/» lleva a la búsqueda, como en cualquier biblioteca larga. Sin animación: es de teclado. */
    const escribiendo = e.target.closest && e.target.closest('input,textarea,select,[contenteditable]');
    if (e.key === '/' && !escribiendo && !e.metaKey && !e.ctrlKey) { e.preventDefault(); $('pb-q').focus(); }
  });
  /* Al pasar de teléfono a computadora con la hoja abierta, la hoja deja de ser hoja. */
  matchMedia('(max-width: 759px)').addEventListener('change', ev => { if (!ev.matches) cerrarHoja(); });
  arrastreDeHoja();
  prepararIdea();
  medidor.observe($('pb-rejilla'));
}

async function arrancar() {
  oyentes();
  try {
    await cargar();
    pintarFormatos();
    pintarRejilla();
  } catch (e) {
    $('pb-rejilla').innerHTML = '<div class="pb-nada"><b>No se pudieron leer las plantillas</b>' + esc(e && e.message || e) + '</div>';
  } finally {
    html.classList.remove('arrancando');
  }
}

arrancar();
