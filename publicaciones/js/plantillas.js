/* ============================================================================
   Las plantillas de publicaciones — cargar, llenar y sacar a PNG o a video.

   Lo comparten el editor (index.html) y el motor por lotes (motor.html). Antes cada página
   traía su propia copia de estas mismas funciones y de los 30 @keyframes, y ya se habían
   separado: el motor quitaba el fondo del video con `transparent` y el editor con verde.

   Tres decisiones que no se ven leyendo el código:

   · Los @keyframes viven en plantillas.json (`keyframes`), que es donde los escribe quien
     agrega una plantilla. Aquí se inyectan una vez. Copiarlos a cada HTML era la tercera
     copia que se iba a olvidar.

   · La letra de las publicaciones va EMBEBIDA y se calcula una sola vez. html-to-image, si
     no se le da, recorre todas las hojas del documento y baja cada @font-face que encuentre
     —las de la app incluidas— en CADA captura. Un video son 144 capturas: ésa era la mayor
     parte de «tarda de 30 a 90 segundos». Con las dos tipografías de las plantillas en data:
     URL, calculadas al primer uso, cada cuadro solo clona y pinta.

   · Las dos tipografías (Plus Jakarta Sans y Figtree, variables, solo latín) están en
     publicaciones/fuentes/. No se piden a Google: sin señal la imagen saldría con la letra
     del sistema y nadie lo notaría hasta verla publicada.
   ============================================================================ */

const FUENTES = [
  { familia: 'Plus Jakarta Sans', archivo: 'fuentes/plus-jakarta-sans-latin.woff2', pesos: '200 800' },
  { familia: 'Figtree', archivo: 'fuentes/figtree-latin.woff2', pesos: '300 900' },
];

/* Los segundos de un ciclo de video. Lo dice la guía de plantillas (CLAUDE.md): todas las
   animaciones en línea están escritas para ciclos de 6 s. */
export const SEGUNDOS_VIDEO = 6;
export const CUADROS_POR_SEGUNDO = 24;
/* El instante de la animación que se fotografía para el PNG y para las miniaturas: la mitad
   del ciclo, donde todas las piezas ya entraron y ninguna ha empezado a salir. */
export const INSTANTE_QUIETO = -3;

export const P = [];
export const porId = Object.create(null);

let _carga = null;
export function cargar(url = 'automatizacion/plantillas.json') {
  if (!_carga) {
    _carga = fetch(url).then(r => {
      if (!r.ok) throw new Error('No se pudieron leer las plantillas (' + r.status + ')');
      return r.json();
    }).then(lib => {
      P.length = 0;
      for (const p of lib.plantillas || []) { P.push(p); porId[p.id] = p; }
      if (lib.keyframes && !document.getElementById('pb-keyframes')) {
        const st = document.createElement('style');
        st.id = 'pb-keyframes';
        st.textContent = lib.keyframes;
        document.head.appendChild(st);
      }
      return P;
    });
    _carga.catch(() => { _carga = null; });
  }
  return _carga;
}

/* Texto a marcado: solo se escapa lo que abre etiqueta, y el salto de renglón pasa a <br>. */
export const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/\n/g, '<br>');

/* El texto de un nodo editable, con sus saltos de renglón. contentEditable mete <br> o <div>
   según el navegador; los dos son un salto. */
export function textoDe(nodo) {
  const c = nodo.cloneNode(true);
  c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  c.querySelectorAll('div').forEach(d => d.prepend('\n'));
  return c.textContent.replace(/ /g, ' ');
}

/* Una pieza nueva a partir de una plantilla: sus textos de ejemplo y las fotos vacías. */
export function piezaNueva(p) {
  return {
    nombre: p.id.replace('@', '-').toLowerCase(),
    plantilla: p.id,
    campos: { ...p.campos },
    fotos: Array(p.fotos || 0).fill(''),
  };
}

/* Pone los textos y las fotos de una pieza encima del marcado de su plantilla. La foto va
   por `style.backgroundImage` —una propiedad, no marcado—, así que una URL con comillas no
   puede salirse del atributo. */
export function aplicar(el, pieza) {
  if (!pieza) return el;
  for (const [k, v] of Object.entries(pieza.campos || {})) {
    el.querySelectorAll('[data-slot="' + CSS.escape(k) + '"]').forEach(n => { n.innerHTML = esc(v); });
  }
  (pieza.fotos || []).forEach((u, i) => {
    if (!u) return;
    el.querySelectorAll('[data-foto="' + (i + 1) + '"]').forEach(n => {
      n.textContent = '';
      n.style.backgroundImage = 'url("' + String(u).replace(/["\\\n]/g, '') + '")';
      n.style.backgroundSize = 'cover';
      n.style.backgroundPosition = 'center';
      n.style.backgroundRepeat = 'no-repeat';
    });
  });
  return el;
}

/* El nodo raíz de una plantilla, ya llenado. */
export function nodo(p, pieza) {
  const w = document.createElement('div');
  w.innerHTML = p.html;
  const el = w.firstElementChild;
  aplicar(el, pieza);
  return el;
}

/* Congela todas las animaciones en un instante del ciclo. Se escribe en línea y no con una
   clase porque html-to-image copia el estilo calculado nodo por nodo, y así el instante
   viaja con la copia. */
function congelar(el, t, base) {
  for (const n of [el, ...el.querySelectorAll('*')]) {
    if (!n.style.animationName || n.style.animationName === 'none') continue;
    const d = base ? (base.get(n) || 0) : (parseFloat(n.style.animationDelay) || 0);
    n.style.animationPlayState = 'paused';
    n.style.animationDelay = (d - t) + 's';
  }
}

/* ----- La letra embebida ----- */
let _fuentes = null;
function fuentesEmbebidas() {
  if (!_fuentes) {
    _fuentes = Promise.all(FUENTES.map(async f => {
      const b = await (await fetch(f.archivo)).blob();
      const url = await new Promise((ok, mal) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = mal;
        r.readAsDataURL(b);
      });
      return "@font-face{font-family:'" + f.familia + "';font-style:normal;font-weight:" + f.pesos +
        ";font-display:block;src:url(" + url + ") format('woff2')}";
    })).then(r => r.join('\n'));
    _fuentes.catch(() => { _fuentes = null; });
  }
  return _fuentes;
}

/* Un escenario fuera de pantalla para lo que se va a fotografiar: html-to-image necesita el
   nodo en el documento para calcular su estilo. */
function escenario(el) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none;contain:layout paint';
  host.appendChild(el);
  document.body.appendChild(host);
  return host;
}

function opciones(p, extra) {
  return fuentesEmbebidas().then(css => ({
    pixelRatio: p.escala || (p.ancho / p.vista[0]),
    width: p.vista[0], height: p.vista[1],
    fontEmbedCSS: css,
    ...extra,
  }));
}

function preparar(pieza, o = {}) {
  const p = porId[pieza.plantilla];
  if (!p) throw new Error('No existe la plantilla ' + pieza.plantilla);
  const el = nodo(p, pieza);
  el.style.borderRadius = '0';
  el.style.boxShadow = 'none';
  if (o.croma && p.tipo === 'video') {
    el.style.background = '#00FF00';
    el.querySelectorAll('[data-video]').forEach(n => n.remove());
  }
  return { p, el };
}

/** La pieza como PNG en data URL, al tamaño real de exportación. */
export async function png(pieza, o = {}) {
  const { p, el } = preparar(pieza, o);
  congelar(el, -INSTANTE_QUIETO);
  const host = escenario(el);
  try {
    await document.fonts.ready;
    return await window.htmlToImage.toPng(el, await opciones(p));
  } finally { host.remove(); }
}

/** El video de 6 s, como Blob. `alAvanzar(fase, 0..1)` y `senal` (AbortSignal) opcionales. */
export async function video(pieza, o = {}) {
  const { p, el } = preparar(pieza, o);
  const N = SEGUNDOS_VIDEO * CUADROS_POR_SEGUNDO;
  const W = Math.round(p.vista[0] * (p.escala || 1)), H = Math.round(p.vista[1] * (p.escala || 1));
  const avanza = o.alAvanzar || (() => {});
  const cortar = () => { if (o.senal && o.senal.aborted) throw new DOMException('Cancelado', 'AbortError'); };

  const base = new Map();
  for (const n of [el, ...el.querySelectorAll('*')]) {
    if (n.style.animationName && n.style.animationName !== 'none') base.set(n, parseFloat(n.style.animationDelay) || 0);
  }
  const host = escenario(el);
  const cuadros = [];
  try {
    await document.fonts.ready;
    const op = await opciones(p);
    for (let i = 0; i < N; i++) {
      cortar();
      congelar(el, i / CUADROS_POR_SEGUNDO, base);
      const c = await window.htmlToImage.toCanvas(el, op);
      /* JPEG y no el lienzo tal cual: 144 cuadros de 1080×1920 sin comprimir son más de un
         giga de memoria, y en una computadora modesta la pestaña se cae a media grabación. */
      cuadros.push(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)));
      avanza('preparar', (i + 1) / N);
    }
  } finally { host.remove(); }

  /* La grabación va a tiempo real: MediaRecorder toma lo que el lienzo muestre en cada
     instante, así que cada cuadro se dibuja a su hora y no lo más rápido posible. */
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  const tipo = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
    .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if (!tipo) throw new Error('Este navegador no graba video. Usa Chrome o Edge en la computadora.');
  const mr = new MediaRecorder(cv.captureStream(CUADROS_POR_SEGUNDO), { mimeType: tipo, videoBitsPerSecond: 8e6 });
  const trozos = [];
  mr.ondataavailable = e => { if (e.data.size) trozos.push(e.data); };
  const primero = await createImageBitmap(cuadros[0]);
  cx.drawImage(primero, 0, 0, W, H);
  primero.close();
  const fin = new Promise(r => { mr.onstop = r; });
  mr.start();
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    if (o.senal && o.senal.aborted) { mr.stop(); await fin; cortar(); }
    const bm = await createImageBitmap(cuadros[i]);
    const espera = t0 + i * 1000 / CUADROS_POR_SEGUNDO - performance.now();
    if (espera > 0) await new Promise(r => setTimeout(r, espera));
    cx.drawImage(bm, 0, 0, W, H);
    bm.close();
    avanza('grabar', (i + 1) / N);
  }
  await new Promise(r => setTimeout(r, 1000 / CUADROS_POR_SEGUNDO));
  mr.stop();
  await fin;
  return { blob: new Blob(trozos, { type: tipo }), ext: tipo.includes('mp4') ? 'mp4' : 'webm' };
}

/* Bajar un archivo. El enlace se quita después del clic: si se queda, cada descarga deja un
   <a> huérfano con una data URL de un megabyte colgada del documento. */
export function bajar(url, nombre) {
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 4000);
}
