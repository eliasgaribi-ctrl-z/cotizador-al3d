/* EL VECTORIZADOR CON LAS PIEZAS: AJUSTES QUE SE VEN, TRAZO QUE SE DIBUJA Y AVISOS EN SU SITIO.
 *
 * El vectorizador se usa con el cliente al lado: se carga su logotipo, se prueban ajustes hasta que
 * el trazo se parece y se le enseña lo que va a cortar la máquina. Lo que aquí se defiende es de
 * ese momento, y casi todo es lo que se rompe callado:
 *
 *   · H9 · Mover un ajuste solo decía «Ajustes cambiados». Ahora los cuatro rangos llevan marcas,
 *     la pastilla del valor pegada al pulgar y un pulgar de 44 px; y al SOLTAR —nunca mientras se
 *     arrastra, que congela el dedo en un teléfono de gama media— se vuelve a trazar solo, si ya
 *     había trazo, con una barra fina y no con el velo que tapaba lo que se quería comparar. Tres
 *     ajustes seguidos mientras corre son UNA corrida más, no tres ni una perdida.
 *   · H10 · Al terminar de vectorizar el contorno recorre cada forma y se rellena, con los MISMOS
 *     caminos que el SVG que se entrega. Solo la primera vez de cada imagen, nunca con menos
 *     movimiento, ni con más de 3000 nodos o 150 lazos, y un toque lo termina. No deja un <svg>
 *     huérfano ni nada animándose en reposo.
 *   · H22 · Las muestras de color eran cuadritos que, quitados, se ponían al 25 % de opacidad
 *     (§4.3 lo prohíbe): ahora son fichas de 44 px con su nombre y un ✓ que se vuelve ✕, con el
 *     nombre tachado. Cambian su estado EN SU SITIO —con innerHTML cada toque soltaba el foco— y
 *     con muchos colores se abrevian al número.
 *   · H12 · Un PDF se abre dentro del lienzo, con los pasos y su reloj, y su error se queda ahí con
 *     «Elegir otro archivo»; con una imagen ya cargada hay además una salida para dejarla como
 *     estaba. Si se pide otra cosa mientras se abre, gana la última y el reloj del PDF deja de
 *     contar.
 *   · H18 · «Copiar el código SVG» confirma en su propio botón (lo hace copiarTexto() con la pieza
 *     de copiar; aquí se comprueba que el botón de este modal lo recibe).
 *   · H26 · La ficha viaja entre los modos y entre las vistas (que nacían apagadas y nada las
 *     encendía), la etiqueta de alto y ancho reales se arrastra de centímetro en centímetro, también
 *     desde el campo vacío, y las cuatro cifras del resultado ruedan al cambiar, pero no la primera
 *     vez de cada imagen.
 *
 * Y las ocho rondas de siempre: 360 y 420 px, con y sin movimiento reducido, en claro y oscuro, sin
 * errores de página, sin desborde horizontal, sin nada animándose solo en reposo y con el contraste
 * medido sobre el render (no sobre la hoja de estilos) de lo que esta zona pinta.
 *
 * El dedo va por el protocolo de Chrome (CDP Input.dispatchTouchEvent) donde hay que arrastrar, y
 * por p.tap() en los botones.
 *
 * Uso:  PUERTO=8907 node pruebas/navegador/cot-vector.mjs
 *       CAPTURAS=/tmp/capturas-vector PUERTO=8907 node pruebas/navegador/cot-vector.mjs
 *       (con CAPTURAS guarda, fuera del repo, una imagen de cada pantalla a 360 px en claro y oscuro)
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { inflateSync } from 'zlib';
import { mkdirSync } from 'fs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const CAP = process.env.CAPTURAS || '';
if (CAP) mkdirSync(CAP, { recursive: true });
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, m) => c ? bien(m) : mal(m);

/* ---------- El contraste, medido sobre el render (el método de contraste.mjs) ---------- */
function leerPNG(buf) {
  let i = 8, idat = [], w, h, ct;
  while (i < buf.length) {
    const ln = buf.readUInt32BE(i), tipo = buf.toString('ascii', i + 4, i + 8);
    const dat = buf.subarray(i + 8, i + 8 + ln);
    i += 12 + ln;
    if (tipo === 'IHDR') { w = dat.readUInt32BE(0); h = dat.readUInt32BE(4); ct = dat[9]; }
    else if (tipo === 'IDAT') idat.push(dat);
    else if (tipo === 'IEND') break;
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp, px = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    if (f === 1) for (let x = bpp; x < stride; x++) line[x] = (line[x] + line[x - bpp]) & 255;
    else if (f === 2) for (let x = 0; x < stride; x++) line[x] = (line[x] + prev[x]) & 255;
    else if (f === 3) for (let x = 0; x < stride; x++) { const a = x >= bpp ? line[x - bpp] : 0; line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255; }
    else if (f === 4) for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    line.copy(px, y * stride); prev = line;
  }
  return { w, h, bpp, px };
}
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const Lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const razon = (a, b) => { const l1 = Lum(a), l2 = Lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
function medirRaster(buf) {
  const { w, h, bpp, px } = leerPNG(buf), cuenta = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * bpp;
    if (bpp === 4 && px[o + 3] < 200) continue;
    const k = (px[o] >> 2) + ',' + (px[o + 1] >> 2) + ',' + (px[o + 2] >> 2);
    const v = cuenta.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    v.n++; v.r += px[o]; v.g += px[o + 1]; v.b += px[o + 2]; cuenta.set(k, v);
  }
  const cols = [...cuenta.values()].map(v => ({ n: v.n, c: [v.r / v.n, v.g / v.n, v.b / v.n] })).sort((a, b) => b.n - a.n);
  if (cols.length < 2) return null;
  const bg = cols[0]; let fg = null, mejor = -1;
  for (const c of cols.slice(0, 60)) { const d = Math.abs(Lum(c.c) - Lum(bg.c)); if (d > mejor) { mejor = d; fg = c; } }
  return { r: razon(fg.c, bg.c) };
}
/* El pie del panel va pegado encima del fondo de la caja, y una captura del elemento fotografía
   lo que hay ENCIMA de él: un renglón que quedó bajo los botones de agregar «medía» el contraste
   de los botones. Se esconde el pie (visibility, para que nada se recoloque) solo mientras se
   fotografía. */
async function contraste(p, sel, nombre, minimo = 4.5) {
  const el = await p.$(sel);
  if (!el) { mal(nombre + ': «' + sel + '» no existe'); return; }
  await p.evaluate(() => { const f = document.querySelector('#vectormodal .sp-actions'); if (f) f.style.visibility = 'hidden'; });
  let buf; try { buf = await el.screenshot({ timeout: 5000 }); } catch (_) { buf = null; }
  await p.evaluate(() => { const f = document.querySelector('#vectormodal .sp-actions'); if (f) f.style.visibility = ''; });
  if (!buf) { mal(nombre + ': no se pudo rasterizar'); return; }
  const m = medirRaster(buf);
  if (!m) { mal(nombre + ': un solo color, no hay nada que medir'); return; }
  cierto(m.r >= minimo, nombre + ': ' + m.r.toFixed(2) + ':1');
}


/* Un logotipo de mentira: cuatro letras en negro y un cuadro rojo, sobre blanco. En modo
   Logotipo sale con el fondo, la tinta, el rojo y los grises del suavizado: seis capas. */
const FOTO = () => {
  const c = document.createElement('canvas'); c.width = 900; c.height = 400;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 400);
  g.fillStyle = '#111'; g.font = 'bold 300px sans-serif'; g.textBaseline = 'middle'; g.fillText('AL3D', 30, 210);
  g.fillStyle = '#c33'; g.fillRect(780, 40, 90, 90);
  return c.toDataURL('image/png');
};
/* Doce cuadros de doce colores, para que el modo Foto salga con más de ocho capas. */
const FOTO_ARCOIRIS = () => {
  const c = document.createElement('canvas'); c.width = 600; c.height = 400;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 400);
  for (let i = 0; i < 12; i++) { g.fillStyle = 'hsl(' + (i * 30) + ',80%,' + (i % 2 ? 35 : 55) + '%)'; g.fillRect(20 + (i % 4) * 145, 20 + Math.floor(i / 4) * 125, 120, 100); }
  return c.toDataURL('image/png');
};
const limpiarAvisos = p => p.evaluate(() => { try { Piezas.aviso.limpiar(); } catch (_) {} });
/* Abre el cotizador en blanco y deja el vectorizador abierto con la imagen cargada y, si se pide,
   ya vectorizada (con su momento de dibujo, si el movimiento lo permite). */
async function montar(p, { trazo = false, modo = null, foto = FOTO } = {}) {
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForTimeout(1100);
  const src = await p.evaluate(foto);
  await p.evaluate(s => { abrirVector(); vtLoadImgSrc(s, 'logo.png'); }, src);
  await p.waitForFunction(() => VT.img && VT.imgW > 0);
  if (modo) await p.evaluate(m => vtSetModo(m), modo);
  /* La cuenta de corridas: se envuelve la función global, que es por la que entran tanto el botón
     como lo que sale solo al soltar un ajuste. */
  await p.evaluate(() => { window.__runs = 0; const o = window.vtVectorizar; window.vtVectorizar = function () { window.__runs++; return o.apply(this, arguments); }; });
  if (trazo) { await p.evaluate(() => vtVectorizar()); await p.waitForTimeout(300); }
  await p.evaluate(() => { window.__runs = 0; });
  await limpiarAvisos(p);
}
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => { try { return a.effect.getComputedTiming().iterations === Infinity; } catch (_) { return false; } })
  .map(a => { const n = a.effect.target; return (n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className) + ''; })
  .filter(c => !/\bai-btn\b|\bsp-ai\b/.test(c)));
const cap = async (p, nombre) => { if (CAP) { await limpiarAvisos(p); await p.waitForTimeout(150); await p.screenshot({ path: CAP + '/' + nombre + '.png' }); } };
/* El dedo de verdad, por el protocolo de Chrome. */
const dedoDe = cdp => {
  const punto = (q, i) => ({ x: q.x, y: q.y, radiusX: 8, radiusY: 8, force: 1, id: i });
  return {
    bajar: (...q) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: q.map(punto) }),
    mover: (...q) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: q.map(punto) }),
    subir: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  };
};
/* pdf.js de mentira: abre un documento de una hoja que tarda `ms` en pintarse. */
const LECTOR = ms => `window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: new Promise(r => setTimeout(() => r({ destroy() {},
  getPage: async () => ({ getViewport: ({ scale }) => ({ width: 600 * scale, height: 400 * scale }),
    render: ({ canvasContext, viewport }) => ({ promise: new Promise(rr => setTimeout(() => { canvasContext.fillStyle = '#fff'; canvasContext.fillRect(0, 0, viewport.width, viewport.height); canvasContext.fillStyle = '#111'; canvasContext.fillRect(40, 40, 200, 100); rr(); }, ${ms})) }) }) }), 100)) }) };`;
const PDF = () => new File([new Blob(['%PDF-1.4'])], 'plano.pdf', { type: 'application/pdf' });
const quieto = p => p.waitForFunction(() => !VT.corriendo && !document.querySelector('.vt-corte'), null, { timeout: 8000 });
const trazarYEsperar = async p => { await p.evaluate(() => vtVectorizar()); await quieto(p); };

// ════════════════════════════════════════════════════════════════════════════
// PARTE 1 · el comportamiento, con ratón y teclado
// ════════════════════════════════════════════════════════════════════════════
{
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-MX' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B }).catch(() => {});
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  // ── H9 · marcas, pastilla, re-trazo al soltar ─────────────────────────────
  console.log('\nH9 · LOS DESLIZADORES, CON MARCAS, PASTILLA Y RE-TRAZO AL SOLTAR');
  await montar(p, { modo: 'logo' });
  const D = await p.evaluate(() => ['vt-colores', 'vt-detalle', 'vt-ruido', 'vt-esq'].map(id => {
    const i = document.getElementById(id), c = i.closest('.desl-caja');
    return { id, caja: !!c, pastilla: c && c.querySelector('.desl-pastilla') ? c.querySelector('.desl-pastilla').textContent : null,
      marcas: c ? [...c.querySelectorAll('.desl-marca')].length : 0, alto: Math.round(i.getBoundingClientRect().height),
      rotulos: c ? [...c.querySelectorAll('.desl-marca b')].map(b => b.textContent) : [],
      valVisible: getComputedStyle(document.getElementById(id + '-v')).display !== 'none' };
  }));
  cierto(D.every(x => x.caja && x.pastilla !== null), 'los cuatro rangos viven en la caja de la pieza, con su pastilla pegada al pulgar');
  cierto(D.every(x => x.alto >= 44), 'y su pulgar mide 44 px o más (alto del rango: ' + D.map(x => x.alto).join('/') + ')');
  cierto(D[0].marcas === 23 && D[1].marcas === 3 && D[2].marcas === 5 && D[3].marcas === 3,
    'Colores 2–24 lleva una rayita por paso (23), Detalle y Esquinas sus tres y las motas una cada diez: ' + D.map(x => x.marcas).join('/'));
  cierto(D[1].rotulos.join() === 'Bajo,Medio,Alto' && D[3].rotulos.join() === 'Suaves,Medio,Vivas', 'las marcas dicen «Bajo · Medio · Alto» y «Suaves · Medio · Vivas», no un número');
  cierto(D[0].pastilla === '6' && D[1].pastilla === 'Medio' && D[2].pastilla === '14 px' && D[3].pastilla === 'Medio',
    'la pastilla dice el valor de cada uno: ' + D.map(x => x.pastilla).join(' · '));
  cierto(D.every(x => !x.valVisible), 'y la píldora de la etiqueta, que decía lo mismo, se esconde: el valor no se dice dos veces');
  await p.focus('#vt-detalle');
  await p.keyboard.press('ArrowRight');
  const traTecla = await p.evaluate(() => ({ past: document.querySelector('#vt-detalle').closest('.desl-caja').querySelector('.desl-pastilla').textContent,
    texto: document.getElementById('vt-detalle').getAttribute('aria-valuetext'), opt: VT.opts.detalle, v: document.getElementById('vt-detalle-v').textContent }));
  cierto(traTecla.past === 'Alto' && traTecla.texto === 'Alto' && traTecla.opt === 2 && traTecla.v === 'Alto',
    'con el teclado la flecha mueve el pulgar, la pastilla, el aria-valuetext y la opción: todo dice «Alto»');
  cierto(await p.evaluate(() => __runs === 0 && !VT.hecho && document.getElementById('vt-badge-txt').textContent === 'Sin vectorizar'),
    'sin trazo todavía, soltar un ajuste NO vectoriza: «Vectorizar» sigue siendo del botón');
  await p.evaluate(() => vtSetModo('logo'));

  /* El primer trazo de una imagen: con velo oscuro, y con el momento del trazo de corte. */
  console.log('\nH10 · EL TRAZO DE CORTE SE DIBUJA AL TERMINAR (SOLO LA PRIMERA VEZ DE CADA IMAGEN)');
  await p.evaluate(() => {
    window.__cortes = 0; window.__ruedas = 0;
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('vt-corte')) window.__cortes++; }))).observe(document.getElementById('vt-stage'), { childList: true });
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('rueda-vista')) window.__ruedas++; }))).observe(document.getElementById('vt-res'), { childList: true, subtree: true });
  });
  const primero = await p.evaluate(async () => {
    const pr = vtVectorizar(), prog = document.getElementById('vt-prog');
    const velo = { fina: prog.classList.contains('fina'), bg: getComputedStyle(prog).backgroundColor };
    let visto = null; const t0 = performance.now();
    while (performance.now() - t0 < 5000 && !visto) {
      const s = document.querySelector('.vt-corte');
      if (s) visto = { en: s.parentElement.id, trazos: s.querySelectorAll('.vt-corte-trazo').length, rellenos: s.querySelectorAll('.vt-corte-relleno').length,
        veloQuitado: !prog.classList.contains('on'), vista: VT.vista, ancho: getComputedStyle(s.querySelector('.vt-corte-trazo')).strokeWidth,
        dRel: [...s.querySelectorAll('.vt-corte-relleno')].map(x => x.getAttribute('d')).join(''), lazos: VT.trazos, hex: [...s.querySelectorAll('.vt-corte-relleno')].map(x => x.getAttribute('fill')) };
      else await new Promise(r => requestAnimationFrame(r));
    }
    await pr;
    return { velo, visto, vistaFinal: VT.vista, svg: VT.svg };
  });
  cierto(!primero.velo.fina && primero.velo.bg !== 'rgba(0, 0, 0, 0)', 'la primera vez no hay nada que mirar: la espera es el velo oscuro de siempre');
  cierto(primero.visto && primero.visto.en === 'vt-stage', 'al terminar aparece un <svg> DENTRO del escenario (escala con el zoom)');
  cierto(primero.visto && primero.visto.veloQuitado, 'con el velo ya quitado: se ve la imagen mientras el contorno la recorre');
  cierto(primero.visto && primero.visto.trazos === primero.visto.lazos && primero.visto.rellenos >= 1, 'hay un trazo por lazo (' + (primero.visto && primero.visto.trazos) + ') y un relleno por color');
  const dsSvg = [...primero.svg.matchAll(/ d="([^"]*)"/g)].map(m => m[1]).join('');
  cierto(primero.visto && primero.visto.dRel === dsSvg, 'y son los MISMOS caminos que el SVG que se entrega: lo que se ve dibujarse es lo que se descarga');
  cierto(primero.visto && parseFloat(primero.visto.ancho) > 0, 'el grosor está en unidades de la imagen (' + (primero.visto && primero.visto.ancho) + '), para que sean ~2 px de pantalla');
  cierto(primero.vistaFinal === 'cmp', 'y al terminar se abre la comparación');
  await quieto(p);
  cierto(await p.evaluate(() => !document.querySelector('.vt-corte') && __cortes === 1), 'el <svg> se retira solo: no queda nada en el escenario (' + await p.evaluate(() => __cortes) + ' dibujo)');
  cierto(await p.evaluate(() => document.getElementById('vt-stage').querySelectorAll('svg').length === 0), 'ni un <svg> huérfano');
  cierto((await infinitas(p)).length === 0, 'y nada se mueve solo en reposo');
  cierto(await p.evaluate(() => __ruedas === 0), 'las cifras del resultado no rodaron la primera vez: no es «el número cambió», es una imagen nueva');

  /* Los guardas. */
  const guardas = await p.evaluate(() => {
    const n = VT.nodos, t = VT.trazos, r = [];
    VT.nodos = 3001; r.push(vtDibujarCorte() === null); VT.nodos = n;
    VT.trazos = 151; r.push(vtDibujarCorte() === null); VT.trazos = t;
    VT.nodos = 0; r.push(vtDibujarCorte() === null); VT.nodos = n;
    return r;
  });
  cierto(guardas.every(Boolean), 'con más de 3000 nodos, más de 150 lazos o ninguno, no se dibuja nada: getTotalLength() cuesta en un teléfono de gama media');
  await trazarYEsperar(p);
  cierto(await p.evaluate(() => __cortes === 1), 'volver a trazar NO repite el dibujo: con cada ajuste soltado sería casi un segundo de espera antes de ver el resultado');

  /* Un toque lo termina en el acto. */
  await montar(p, { modo: 'logo' });
  await p.evaluate(() => { window.__t = vtVectorizar(); });
  await p.waitForFunction(() => !!document.querySelector('.vt-corte'), null, { timeout: 5000 });
  const t0 = Date.now();
  const area = await p.locator('#vt-canvas-area').boundingBox();
  await p.mouse.click(area.x + 40, area.y + 40);
  await p.waitForFunction(() => !document.querySelector('.vt-corte'), null, { timeout: 2000 });
  const tardo = Date.now() - t0;
  cierto(tardo < 450, 'un toque sobre el lienzo termina el dibujo en el acto (' + tardo + ' ms, no los ~800 del momento entero)');
  cierto(await p.evaluate(async () => { await window.__t; return VT.vista === 'cmp' && VT.hecho; }), 'y la comparación se abre igual');

  /* ── H9 · soltar vuelve a trazar ── */
  console.log('\nH9 · SOLTAR UN AJUSTE VUELVE A TRAZAR, CON UNA BARRA FINA Y NO CON EL VELO');
  await quieto(p);
  await p.evaluate(() => { window.__runs = 0; });
  await p.focus('#vt-detalle');
  await p.keyboard.press('ArrowLeft');
  await p.waitForFunction(() => __runs >= 1 && !VT.corriendo, null, { timeout: 8000 });
  await p.waitForTimeout(300);
  cierto(await p.evaluate(() => __runs === 1 && VT.opts.detalle === 0), 'con el teclado, una tecla es un re-trazo (el `change` sale una vez por tecla)');
  /* Con el ratón: mientras se arrastra no se traza; al soltar, una vez. */
  await p.evaluate(() => { window.__runs = 0; document.getElementById('vt-colores').scrollIntoView({ block: 'center' }); });
  const rc = await p.locator('#vt-colores').boundingBox();
  const px = v => rc.x + 22 + ((v - 2) / 22) * (rc.width - 44);
  await p.mouse.move(px(6), rc.y + rc.height / 2);
  await p.mouse.down();
  await p.mouse.move(px(10), rc.y + rc.height / 2, { steps: 4 });
  await p.mouse.move(px(14), rc.y + rc.height / 2, { steps: 4 });
  const durante = await p.evaluate(() => ({ runs: __runs, c: VT.opts.colores, past: document.querySelector('#vt-colores').closest('.desl-caja').querySelector('.desl-pastilla').textContent, sucio: VT.sucio, badge: document.getElementById('vt-badge-txt').textContent }));
  cierto(durante.runs === 0, 'arrastrando, el trazo NO se rehace a cada píxel (el dedo no se congela): ' + durante.runs + ' corridas');
  cierto(durante.c >= 12 && durante.past === String(durante.c), 'pero la opción y la pastilla siguen al pulgar: Colores ' + durante.c);
  cierto(durante.sucio && durante.badge === 'Ajustes cambiados', 'y mientras tanto el letrero dice «Ajustes cambiados»');
  await p.mouse.up();
  await p.waitForFunction(() => __runs >= 1 && !VT.corriendo, null, { timeout: 8000 });
  cierto(await p.evaluate(() => __runs === 1 && !VT.sucio && /formas/.test(document.getElementById('vt-badge-txt').textContent)), 'al soltar se traza UNA vez y el letrero vuelve a decir cuántas formas salieron');
  /* La barra fina. */
  const barra = await p.evaluate(async () => {
    const el = document.getElementById('vt-detalle'); el.value = '0';
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    const pr = document.getElementById('vt-prog'), cs = getComputedStyle(pr), tr = pr.querySelector('.vt-prog-track').getBoundingClientRect();
    const txt = pr.querySelector('.vt-prog-txt').getBoundingClientRect();
    const o = { fina: pr.classList.contains('fina'), on: pr.classList.contains('on'), bg: cs.backgroundColor, blur: cs.backdropFilter, pe: cs.pointerEvents, h: Math.round(pr.getBoundingClientRect().height),
      top: Math.round(pr.getBoundingClientRect().top - document.getElementById('vt-canvas-area').getBoundingClientRect().top),
      ancho: Math.round(tr.width), canvas: Math.round(document.getElementById('vt-canvas-area').getBoundingClientRect().width), txt: txt.width,
      busy: document.getElementById('vt-canvas-area').getAttribute('aria-busy'), badge: document.getElementById('vt-badge-txt').textContent };
    while (VT.corriendo) await new Promise(r => setTimeout(r, 30));
    o.busyDespues = document.getElementById('vt-canvas-area').getAttribute('aria-busy');
    o.badgeDespues = document.getElementById('vt-badge-txt').textContent;
    return o;
  });
  cierto(barra.fina && barra.on, 'el re-trazo usa la barra fina (`.fina`), no el velo');
  cierto(barra.bg === 'rgba(0, 0, 0, 0)' && barra.blur === 'none', 'sin fondo oscuro ni desenfoque: el trazo anterior se sigue viendo');
  cierto(barra.pe === 'none', 'y no intercepta el dedo: el lienzo sigue siendo tocable mientras corre');
  cierto(barra.h <= 4 && barra.top === 0 && barra.ancho >= barra.canvas - 2, 'es una línea de ' + barra.h + ' px pegada al borde de arriba y de todo el ancho del lienzo');
  cierto(barra.txt <= 2, 'su texto no se pinta (se queda para el lector de pantalla)');
  cierto(barra.busy === 'true' && barra.busyDespues === null, 'el lienzo dice `aria-busy` mientras corre y lo quita al terminar');
  cierto(barra.badge === 'Trazando de nuevo…' && /formas/.test(barra.badgeDespues), 'y el letrero dice «Trazando de nuevo…» en vez de «Ajustes cambiados» mientras se aplica: ' + barra.badgeDespues);
  /* Tres ajustes seguidos mientras corre: una sola corrida más. */
  const pend = await p.evaluate(async () => {
    __runs = 0;
    const pr = vtVectorizar();
    for (const v of [0, 2, 1]) { const el = document.getElementById('vt-esq'); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    const anota = VT.pendiente;
    await pr;
    await new Promise(r => setTimeout(r, 1500));
    return { runs: __runs, anota, esq: VT.opts.esquinas, pend: VT.pendiente, corre: VT.corriendo };
  });
  cierto(pend.anota, 'si se suelta otro ajuste mientras corre, se anota como pendiente en vez de empalmar dos corridas');
  cierto(pend.runs === 2 && pend.esq === 1 && !pend.pend && !pend.corre, 'y tres ajustes seguidos son UNA corrida más, con el valor último: ' + pend.runs + ' corridas, Esquinas ' + pend.esq);

  // ── H26 #2 · la ficha que viaja ───────────────────────────────────────────
  console.log('\nH26 #2 · LA FICHA VIAJA ENTRE LOS MODOS Y ENTRE LAS VISTAS');
  await montar(p, {});
  cierto(await p.evaluate(() => [document.getElementById('vt-view-orig').disabled, document.getElementById('vt-view-cmp').disabled, document.getElementById('vt-view-vec').disabled].join() === 'false,true,true'),
    'sin trazo, «Original» está encendida y «Comparar» y «Vector» no: no hay nada que comparar');
  await p.click('#vt-modo-foto');
  const viajaModo = await p.evaluate(() => ({ ficha: !!document.querySelector('.vt-modo .ficha-viaja'), foto: document.getElementById('vt-modo-foto').getAttribute('aria-pressed'), logo: document.getElementById('vt-modo-logo').getAttribute('aria-pressed') }));
  cierto(viajaModo.ficha && viajaModo.foto === 'true' && viajaModo.logo === 'false', 'al elegir «Foto» una ficha viaja del modo de antes al nuevo, y aria-pressed ya dice cuál es');
  await p.waitForTimeout(450);
  cierto(await p.evaluate(() => !document.querySelector('.ficha-viaja')), 'y la ficha solo existe durante el viaje: en reposo el elegido se pinta con su regla de siempre');
  await p.focus('#vt-modo-bn');
  await p.keyboard.press('Enter');
  cierto(await p.evaluate(() => document.getElementById('vt-modo-bn').getAttribute('aria-pressed') === 'true' && !!document.querySelector('.vt-modo .ficha-viaja')), 'con el teclado (Enter) también viaja');
  await p.waitForTimeout(450);
  await montar(p, { modo: 'logo', trazo: true });
  cierto(await p.evaluate(() => ['orig', 'cmp', 'vec'].every(x => !document.getElementById('vt-view-' + x).disabled)), 'con trazo, las tres vistas se encienden (nacían apagadas y nada las encendía jamás)');
  /* La ficha vive lo que dura el viaje —unos cientos de milisegundos— y con la máquina cargada ya
     se había ido cuando se buscaba después del toque: la prueba fallaba una de cada dos veces sin
     que la app hiciera nada mal. Se vigila desde ANTES del toque y se anota si llegó a nacer. */
  await p.evaluate(() => {
    const grupo = document.querySelector('#vt-view-vec').parentElement;
    window.__fichaVec = false;
    const mo = new MutationObserver(() => { if (grupo.querySelector('.ficha-viaja')) { window.__fichaVec = true; mo.disconnect(); } });
    mo.observe(grupo, { childList: true, subtree: true });
  });
  await p.click('#vt-view-vec');
  const vista = await p.evaluate(() => ({ ficha: window.__fichaVec || !!document.querySelector('#vt-view-vec').parentElement.querySelector('.ficha-viaja'), v: VT.vista, src: getComputedStyle(document.getElementById('vt-cvs-src')).visibility, out: getComputedStyle(document.getElementById('vt-cvs-out')).display }));
  cierto(vista.ficha && vista.v === 'vec' && vista.src === 'hidden' && vista.out !== 'none', '«Vector» enseña solo el trazo, y la ficha viaja hasta él');
  await p.waitForTimeout(450);
  await p.click('#vt-view-orig');
  cierto(await p.evaluate(() => VT.vista === 'orig' && getComputedStyle(document.getElementById('vt-cvs-out')).display === 'none' && document.getElementById('vt-view-orig').getAttribute('aria-pressed') === 'true'), '«Original» enseña solo la imagen');
  await p.click('#vt-view-cmp');
  cierto(await p.evaluate(() => VT.vista === 'cmp' && document.getElementById('vt-split').classList.contains('on')), 'y «Comparar» vuelve a abrir la cortina');
  await p.waitForTimeout(450);

  // ── H22 · fichas de color ────────────────────────────────────────────────
  console.log('\nH22 · LOS COLORES SON FICHAS DE 44 PX QUE DICEN SU ESTADO CON ICONO Y PALABRA');
  const chips = () => p.evaluate(() => [...document.querySelectorAll('#vt-swatches .vt-sw')].map(b => ({ nombre: b.querySelector('.vt-sw-n').textContent, on: b.getAttribute('aria-pressed'), h: Math.round(b.getBoundingClientRect().height),
    op: getComputedStyle(b).opacity, linea: getComputedStyle(b.querySelector('.vt-sw-n')).textDecorationLine, label: b.getAttribute('aria-label'),
    iconoSi: getComputedStyle(b.querySelector('.vt-sw-si')).opacity, iconoNo: getComputedStyle(b.querySelector('.vt-sw-no')).opacity })));
  const c0 = await chips();
  cierto(c0.length >= 3 && c0[0].nombre === 'Fondo' && c0.slice(1).every((c, i) => c.nombre === 'Color ' + (i + 2)), 'cada capa es una ficha con su nombre —«Fondo» y «Color N»—, no un cuadrito mudo: ' + c0.map(c => c.nombre).join(' · '));
  cierto(c0.every(c => c.h >= 44), 'todas miden 44 px o más de alto (' + Math.min(...c0.map(c => c.h)) + ')');
  cierto(c0.every(c => c.op === '1'), 'y ninguna dice su estado con opacidad (§4.3): todas al 100 %');
  cierto(c0[0].on === 'false' && c0[0].linea === 'line-through' && c0[0].iconoNo === '1' && c0[0].iconoSi === '0', 'el fondo, quitado, lleva ✕ y su nombre tachado');
  cierto(c0[1].on === 'true' && c0[1].linea === 'none' && c0[1].iconoSi === '1' && c0[1].iconoNo === '0', 'un color incluido lleva ✓ y su nombre sin tachar');
  cierto(/\(el fondo\).*quitado/.test(c0[0].label) && /incluido, toca para quitarlo/.test(c0[1].label), 'el nombre accesible sigue diciendo qué es y qué pasa al tocarlo');
  const n0 = await p.evaluate(() => Number(document.getElementById('vt-st-colores').textContent));
  const chip1 = p.locator('#vt-swatches .vt-sw').nth(1);
  await p.evaluate(() => { window.__ruedas = 0; window.__chip = document.querySelectorAll('#vt-swatches .vt-sw')[1];
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('rueda-vista')) window.__ruedas++; }))).observe(document.getElementById('vt-res'), { childList: true, subtree: true }); });
  await chip1.click();
  await p.waitForTimeout(120);
  const tras = await p.evaluate(() => ({ mismo: document.querySelectorAll('#vt-swatches .vt-sw')[1] === window.__chip, foco: document.activeElement === window.__chip, n: document.getElementById('vt-st-colores').textContent, ruedas: __ruedas, voz: '' }));
  await p.waitForTimeout(250);
  const c1 = await chips();
  cierto(c1[1].on === 'false' && c1[1].linea === 'line-through' && c1[1].iconoNo === '1', 'tocar un color lo quita: ✕ y el nombre tachado, en un solo gesto');
  cierto(tras.mismo && tras.foco, 'y la ficha es la MISMA (cambia su estado en su sitio) y conserva el foco: quien recorre con el teclado no pierde su lugar');
  cierto(Number(tras.n) === n0 - 1, 'la cifra de «Colores» baja a ' + tras.n);
  cierto(tras.ruedas >= 1, 'y rueda (H26 #1): la capa del odómetro nació al cambiar la cifra');
  await p.waitForTimeout(100);
  cierto((await p.evaluate(() => document.getElementById('vozStatus').textContent)).includes('quitado del trazo'), '«voz» lo anuncia: «' + await p.evaluate(() => document.getElementById('vozStatus').textContent) + '»');
  await p.keyboard.press('Space');
  await p.waitForTimeout(120);
  const c2 = await chips();
  cierto(c2[1].on === 'true' && c2[1].linea === 'none' && await p.evaluate(() => document.activeElement === window.__chip), 'con el teclado (Espacio) lo vuelve a incluir, sin perder el foco');
  cierto(await p.evaluate(n => Number(document.getElementById('vt-st-colores').textContent) === n, n0), 'y la cifra regresa a ' + n0);
  await p.waitForTimeout(500);
  cierto(await p.evaluate(() => VT.keep.filter(Boolean).length === Number(document.getElementById('vt-st-colores').textContent)), 'el texto de la cifra es siempre el número de verdad, aunque esté rodando');

  /* Con muchos colores. */
  await montar(p, { modo: 'foto', foto: FOTO_ARCOIRIS, trazo: true });
  const muchos = await p.evaluate(() => ({ n: VT.layers.length, denso: document.getElementById('vt-swatches').classList.contains('denso'), nombres: [...document.querySelectorAll('#vt-swatches .vt-sw-n')].map(x => x.textContent), alto: Math.min(...[...document.querySelectorAll('#vt-swatches .vt-sw')].map(b => b.getBoundingClientRect().height)) }));
  cierto(muchos.n > 8 && muchos.denso, 'con ' + muchos.n + ' colores la rejilla pasa a densa');
  cierto(muchos.nombres.filter(x => x !== 'Fondo').every(x => /^\d+$/.test(x)), 'y los nombres se abrevian al número (ocho renglones de fichas no caben en un panel)');
  cierto(muchos.alto >= 44, 'sin dejar de medir 44 px de alto');

  // ── H26 #3 · arrastrar sobre la etiqueta ──────────────────────────────────
  console.log('\nH26 #3 · LA ETIQUETA DE ALTO Y ANCHO REALES SE ARRASTRA, DE CENTÍMETRO EN CENTÍMETRO');
  await montar(p, { modo: 'logo', trazo: true });
  cierto(await p.evaluate(() => ['vt-alto-cm', 'vt-ancho-cm'].every(id => document.querySelector('label[for="' + id + '"]').classList.contains('arrastrable'))), 'las dos etiquetas son un mango');
  const et = p.locator('label[for="vt-alto-cm"]');
  await et.scrollIntoViewIfNeeded();
  let caja = await et.boundingBox();
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.mouse.down();
  await p.mouse.move(caja.x + caja.width / 2 + 44, caja.y + caja.height / 2, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(250);
  const arr = await p.evaluate(() => ({ alto: parseFloat(document.getElementById('vt-alto-cm').value), ancho: parseFloat(document.getElementById('vt-ancho-cm').value), cm: VT.cmPorPx, res: document.getElementById('vt-esc-res').style.display }));
  cierto(arr.alto >= 46 && arr.alto <= 51, 'con el campo VACÍO el gesto no arranca en 0.1: parte del «Ej. 40» del campo y 44 px suben a ' + arr.alto + ' cm');
  cierto(arr.cm > 0 && arr.ancho > arr.alto && arr.res !== 'none', 'y el resto sale solo, como si se tecleara: el ancho (' + arr.ancho + ' cm), la escala y el perímetro de corte');
  const antes = arr.alto;
  caja = await et.boundingBox();
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.mouse.down();
  await p.mouse.move(caja.x + caja.width / 2 - 20, caja.y + caja.height / 2, { steps: 5 });
  await p.mouse.up();
  const despues = await p.evaluate(() => parseFloat(document.getElementById('vt-alto-cm').value));
  cierto(despues === antes - 4, 'cada 4 px es un centímetro: 20 px a la izquierda bajan ' + (antes - despues) + ' cm (de ' + antes + ' a ' + despues + ')');
  await montar(p, {});
  await p.click('label[for="vt-alto-cm"]');
  await p.waitForTimeout(150);
  cierto(await p.evaluate(() => document.getElementById('vt-alto-cm').value === '' && document.activeElement.id === 'vt-alto-cm'), 'un simple toque en la etiqueta enfoca el campo VACÍO: no le deja escrito un «40» que nadie eligió');
  await p.fill('#vt-ancho-cm', '120');
  cierto(await p.evaluate(() => document.getElementById('vt-ancho-cm').value === '120'), 'y el campo se sigue tecleando como siempre');

  // ── H12 · el PDF dentro del lienzo ────────────────────────────────────────
  console.log('\nH12 · EL PDF SE ABRE DENTRO DEL LIENZO, CON SU RELOJ Y SU ERROR EN SU SITIO');
  await montar(p, {});
  await p.evaluate(LECTOR(1500));
  await p.evaluate(() => { window.__pdf = vtLoadPDF(new File([new Blob(['%PDF-1.4'])], 'plano.pdf', { type: 'application/pdf' })); });
  await p.waitForTimeout(700);
  const ab = await p.evaluate(() => ({ cara: !document.getElementById('vt-overlay-pdf').hidden, vacio: document.getElementById('vt-overlay-vacio').hidden, oculto: document.getElementById('vt-overlay').classList.contains('hide'),
    paso: (document.querySelector('#vt-overlay-pasos .traza-paso[data-estado="trabaja"] .traza-t') || {}).textContent, reloj: (document.querySelector('#vt-overlay-pasos .traza-paso[data-estado="trabaja"] .traza-reloj') || {}).textContent,
    aviso: (document.getElementById('toast') || {}).textContent || '', mal: !document.getElementById('vt-overlay-mal').hidden }));
  cierto(ab.cara && ab.vacio && !ab.oculto, 'el mismo recuadro del lienzo pasa a la cara del PDF (la invitación se esconde)');
  cierto(ab.paso === 'Abriendo la primera hoja' && /^\d\.\d s$/.test(ab.reloj || ''), 'dice en qué paso va y con su reloj de décimas: «' + ab.paso + '» · ' + ab.reloj);
  cierto(!/Cargando PDF/.test(ab.aviso) && !ab.mal, 'y ya no hay un aviso de 8 s abajo diciendo «Cargando PDF…»');
  await p.evaluate(() => window.__pdf);
  await p.waitForFunction(() => VT.nombre === 'plano.pdf', null, { timeout: 5000 });
  await p.waitForTimeout(300);
  const fin = await p.evaluate(() => ({ oculto: document.getElementById('vt-overlay').classList.contains('hide'), estado: document.getElementById('vt-overlay-pasos').dataset.estado, vacio: !document.getElementById('vt-overlay-vacio').hidden }));
  cierto(fin.oculto && fin.estado === 'ok' && fin.vacio, 'al abrir, el recuadro se va con sus pasos en ✓ y no deja nada girando');
  cierto((await infinitas(p)).length === 0, 'y en reposo nada se anima solo');

  /* El error, en su sitio. */
  await p.evaluate(() => { delete window.pdfjsLib; });
  await p.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  await p.evaluate(async () => { document.getElementById('vt-img-input').click = () => { window.__elegir = (window.__elegir || 0) + 1; }; await vtLoadPDF(new File([new Blob(['%PDF-1.4'])], 'plano.pdf', { type: 'application/pdf' })); });
  await p.waitForTimeout(350);
  const m12 = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('#vt-overlay-mal .sp-overlay-btn')].filter(b => !b.hidden);
    return { visible: !document.getElementById('vt-overlay-mal').hidden, motivo: document.getElementById('vt-overlay-motivo').textContent,
      n: btns.length, altos: btns.every(b => b.getBoundingClientRect().height >= 44), nombres: btns.map(b => b.textContent),
      libres: btns.every(b => { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e); }),
      pasoMal: !!document.querySelector('#vt-overlay-pasos .traza-paso[data-estado="mal"]'), girando: !!document.querySelector('#vt-overlay-pasos .traza-paso[data-estado="trabaja"]') };
  });
  cierto(m12.visible && /conexión/.test(m12.motivo), 'sin conexión, el motivo se queda en el recuadro: «' + m12.motivo.slice(0, 60) + '…»');
  cierto(m12.pasoMal && !m12.girando, 'el paso que falló lleva su ✕ y ninguno se queda girando');
  cierto(m12.nombres.join('|') === 'Elegir otro archivo|Volver a la imagen', 'con la imagen ya cargada hay dos salidas: «' + m12.nombres.join('» y «') + '»');
  cierto(m12.altos && m12.libres, 'las dos miden 44 px o más y nada las tapa (ni los botones de zoom)');
  cierto((await infinitas(p)).length === 0, 'con el error puesto nada se anima solo');
  await p.click('#vt-overlay-mal [data-vt-accion="elegir"]');
  cierto(await p.evaluate(() => window.__elegir === 1), '«Elegir otro archivo» abre el selector de archivos');
  await p.click('#vt-overlay-mal [data-vt-accion="dejar"]');
  cierto(await p.evaluate(() => document.getElementById('vt-overlay').classList.contains('hide') && !!VT.img && !document.getElementById('vt-overlay-vacio').hidden), '«Volver a la imagen» deja todo como estaba: el error no secuestra el trazo');
  await p.unroute('**/cdnjs.cloudflare.com/**');

  /* Gana el último. */
  await montar(p, {});
  await p.evaluate(LECTOR(1500));
  await p.evaluate(async src => { const b = await (await fetch(src)).blob(); window.__fb = new File([b], 'b.png', { type: 'image/png' }); }, await p.evaluate(FOTO));
  await p.evaluate(() => { window.__pdf = vtLoadPDF(new File([new Blob(['%PDF-1.4'])], 'plano.pdf', { type: 'application/pdf' })); });
  await p.waitForTimeout(300);
  await p.evaluate(() => vtCargarImagen({ files: [window.__fb], value: '' }));
  await p.waitForFunction(() => VT.nombre === 'b.png', null, { timeout: 5000 });
  await p.waitForTimeout(2200);
  cierto(await p.evaluate(() => VT.nombre === 'b.png' && document.getElementById('vt-overlay').classList.contains('hide')), 'si se elige otra imagen mientras el PDF se abre, gana la imagen: el PDF, más lento, calla y no la pisa');
  cierto(await p.evaluate(() => !document.querySelector('#vt-overlay-pasos .traza-paso[data-estado="trabaja"]')), 'y su reloj deja de contar (no queda escondido corriendo)');
  /* La imagen de la IA que es un PDF. */
  await p.evaluate(() => { Q.aiFile = { url: 'data:application/pdf;base64,JVBERi0xLjQK', name: 'plano-ia.pdf', type: 'application/pdf' }; vtUsarImagenAI(); });
  await p.waitForFunction(() => VT.nombre === 'plano-ia.pdf', null, { timeout: 6000 });
  cierto(await p.evaluate(() => !!document.querySelector('#vt-overlay-pasos .traza-paso[data-clave="traer"]')), 'el PDF que analizó la IA también pasa por el recuadro: «Trayendo el plano» es un paso más de la misma traza');
  await p.evaluate(() => { Q.aiFile = { url: 'http://127.0.0.1:1/x.pdf', name: 'x.pdf', type: 'application/pdf' }; vtUsarImagenAI(); });
  await p.waitForFunction(() => !document.getElementById('vt-overlay-mal').hidden, null, { timeout: 6000 });
  cierto(await p.evaluate(() => /No se pudo traer el PDF/.test(document.getElementById('vt-overlay-motivo').textContent)), 'y si no se puede traer, el motivo se queda en el recuadro y no en un aviso que se va');
  await p.evaluate(() => vtCerrarOverlayPdf());

  // ── H18 · copiar confirma en el botón ─────────────────────────────────────
  console.log('\nH18 · COPIAR EL CÓDIGO SVG CONFIRMA EN EL MISMO BOTÓN');
  await montar(p, { modo: 'logo', trazo: true });
  const rot0 = await p.evaluate(() => document.getElementById('vt-copy-svg').textContent.trim());
  await p.click('#vt-copy-svg');
  await p.waitForFunction(() => !!document.querySelector('#vt-copy-svg .rotulo.alt'), null, { timeout: 3000 });
  await p.waitForTimeout(200);
  const cop = await p.evaluate(() => { const b = document.getElementById('vt-copy-svg'); return { texto: b.querySelector('.rotulo-b').textContent.trim(), a: b.querySelector('.rotulo-a').getAttribute('aria-hidden'), b: b.querySelector('.rotulo-b').getAttribute('aria-hidden'), aviso: document.getElementById('toast').textContent }; });
  cierto(/Copiado/.test(cop.texto) && cop.a === 'true' && cop.b === null, 'el rótulo del botón pasa a «' + cop.texto + '» (y el lector de pantalla oye el nuevo, no el viejo)');
  cierto(/Código SVG copiado/.test(cop.aviso), 'el aviso de abajo se queda con su instrucción («pégalo en Illustrator…»)');
  const portapapeles = await p.evaluate(() => navigator.clipboard.readText().catch(() => null));
  if (portapapeles !== null) cierto(portapapeles.startsWith('<?xml') && /<svg/.test(portapapeles), 'el portapapeles recibe el SVG de verdad');
  await p.waitForFunction(() => !document.querySelector('#vt-copy-svg .rotulo.alt'), null, { timeout: 4000 });
  cierto(await p.evaluate(r => document.querySelector('#vt-copy-svg .rotulo-a').textContent.trim() === r, rot0), 'y a los ~2 s vuelve a su rótulo de siempre: «' + rot0 + '»');
  await p.focus('#vt-copy-svg');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => !!document.querySelector('#vt-copy-svg .rotulo.alt'), null, { timeout: 3000 });
  cierto(true, 'con el teclado (Enter) también confirma en el botón (la espera de arriba falla si no lo hace)');

  console.log('');
  errs.length ? mal(errs.length + ' errores de página: ' + [...new Set(errs)].slice(0, 3).join(' | ')) : bien('cero errores de página con ratón y teclado');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE 2 · con el dedo (hasTouch + tap, y el protocolo de Chrome donde hay que arrastrar)
// ════════════════════════════════════════════════════════════════════════════
{
  const ctx = await nav.newContext({ viewport: { width: 360, height: 780 }, locale: 'es-MX', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  const dedo = dedoDe(cdp);
  console.log('\nCON EL DEDO · TOQUES Y ARRASTRES');
  await montar(p, { modo: 'logo', trazo: true });
  await p.evaluate(() => { document.getElementById('vt-detalle').scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(300);
  const rd = await p.locator('#vt-detalle').boundingBox();
  const centro = v => ({ x: rd.x + 22 + (v / 2) * (rd.width - 44), y: rd.y + rd.height / 2 });
  await p.evaluate(() => { __runs = 0; });
  await dedo.bajar(centro(1));
  await p.waitForTimeout(40);
  for (let i = 1; i <= 6; i++) { await dedo.mover({ x: centro(1).x + i * 30, y: centro(1).y }); await p.waitForTimeout(20); }
  const mientras = await p.evaluate(() => ({ runs: __runs, d: VT.opts.detalle, past: document.querySelector('#vt-detalle').closest('.desl-caja').querySelector('.desl-pastilla').textContent }));
  cierto(mientras.runs === 0 && mientras.d === 2 && mientras.past === 'Alto', 'arrastrando el pulgar con el dedo, la pastilla dice «Alto» y todavía no se traza');
  await dedo.subir();
  await p.waitForFunction(() => __runs >= 1 && !VT.corriendo, null, { timeout: 8000 });
  cierto(await p.evaluate(() => __runs === 1), 'al levantar el dedo se traza una vez');
  await p.waitForTimeout(300);
  /* Toques en los modos y las vistas. */
  await p.evaluate(() => { document.getElementById('vt-modo-bn').scrollIntoView({ block: 'center' }); });
  await p.tap('#vt-modo-foto');
  cierto(await p.evaluate(() => !!document.querySelector('.vt-modo .ficha-viaja') && document.getElementById('vt-modo-foto').getAttribute('aria-pressed') === 'true'), 'un toque en «Foto» y la ficha viaja');
  await p.waitForTimeout(450);
  await p.evaluate(() => { vtSetModo('logo'); });
  await p.tap('#vt-view-vec');
  cierto(await p.evaluate(() => VT.vista === 'vec' && !!document.querySelector('#vt-view-vec').parentElement.querySelector('.ficha-viaja')), 'un toque en «Vector» y la ficha viaja hasta él');
  await p.waitForTimeout(450);
  await p.tap('#vt-view-cmp');
  await p.waitForTimeout(450);
  /* Las fichas de color con el dedo. */
  await p.evaluate(() => { document.getElementById('vt-swatches').scrollIntoView({ block: 'center' }); });
  const n0 = await p.evaluate(() => Number(document.getElementById('vt-st-colores').textContent));
  await p.tap('#vt-swatches .vt-sw:nth-child(2)');
  await p.waitForTimeout(150);
  cierto(await p.evaluate(n => document.querySelectorAll('#vt-swatches .vt-sw')[1].getAttribute('aria-pressed') === 'false' && Number(document.getElementById('vt-st-colores').textContent) === n - 1, n0), 'un toque en una ficha de color la quita y la cifra baja');
  await p.tap('#vt-swatches .vt-sw:nth-child(2)');
  /* Arrastrar la etiqueta del alto con el dedo. */
  await p.evaluate(() => { document.getElementById('vt-alto-cm').value = ''; document.querySelector('label[for="vt-alto-cm"]').scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(300);
  const eb = await p.locator('label[for="vt-alto-cm"]').boundingBox();
  const e0 = { x: eb.x + eb.width / 2, y: eb.y + eb.height / 2 };
  await dedo.bajar(e0);
  await p.waitForTimeout(40);
  for (let i = 1; i <= 8; i++) { await dedo.mover({ x: e0.x + i * 6, y: e0.y }); await p.waitForTimeout(16); }
  await dedo.subir();
  await p.waitForTimeout(250);
  const dedoAlto = await p.evaluate(() => parseFloat(document.getElementById('vt-alto-cm').value));
  cierto(dedoAlto >= 48 && dedoAlto <= 52, 'con el dedo, 48 px a la derecha desde el campo vacío son unos 12 cm: ' + dedoAlto);
  cierto(await p.evaluate(() => window.scrollY === 0 && VT.cmPorPx > 0), 'sin mover la página y con la escala puesta');
  /* Copiar con un toque. */
  await p.evaluate(() => { document.getElementById('vt-copy-svg').scrollIntoView({ block: 'center' }); });
  await p.tap('#vt-copy-svg');
  await p.waitForFunction(() => !!document.querySelector('#vt-copy-svg .rotulo.alt'), null, { timeout: 3000 });
  cierto(true, 'con un toque, «Copiar el código SVG» confirma en su botón');
  console.log('');
  errs.length ? mal('errores de página con el dedo: ' + [...new Set(errs)].slice(0, 3).join(' | ')) : bien('cero errores de página con el dedo');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE 3 · las ocho rondas: 360/420 × con y sin movimiento × claro y oscuro
// ════════════════════════════════════════════════════════════════════════════
console.log('\nLAS OCHO RONDAS');
for (const ancho of [360, 420]) {
  for (const movimiento of ['reduce', 'no-preference']) {
    for (const tema of ['claro', 'oscuro']) {
      const etq = ancho + ' px · ' + (movimiento === 'reduce' ? 'menos movimiento' : 'con movimiento') + ' · ' + tema;
      const ctx = await nav.newContext({ viewport: { width: ancho, height: 780 }, locale: 'es-MX', hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: movimiento });
      await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      const laDeCaptura = ancho === 360 && movimiento === 'no-preference';
      const nombre = n => '360-' + tema + '-' + n;

      /* Fase A · trazado: los deslizadores, las fichas de color y las cifras. */
      await montar(p, { modo: 'logo' });
      await p.evaluate(() => {
        window.__cortes = 0; window.__ruedas = 0;
        new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('vt-corte')) window.__cortes++; }))).observe(document.getElementById('vt-stage'), { childList: true });
      });
      await trazarYEsperar(p);
      await p.evaluate(() => { document.getElementById('vt-ruido').scrollIntoView({ block: 'center' }); });
      await p.waitForTimeout(300);
      await limpiarAvisos(p);
      const A = await p.evaluate(() => {
        const ancho = el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; };
        const cajas = [...document.querySelectorAll('#vectormodal .desl-caja')];
        return { tema: document.documentElement.getAttribute('data-tema'),
          desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          desbordeModal: document.getElementById('vectormodal').scrollWidth - document.getElementById('vectormodal').clientWidth,
          pulgares: [...document.querySelectorAll('#vectormodal input.desl-iman')].map(i => Math.round(i.getBoundingClientRect().height)),
          marcasDentro: cajas.every(c => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('.desl-marca b')].every(b => { const q = b.getBoundingClientRect(); return !q.width || (q.left >= r.left - 1 && q.right <= r.right + 1); }); }),
          pastillasDentro: cajas.every(c => { const r = c.getBoundingClientRect(), p = c.querySelector('.desl-pastilla'); if (!p) return true; const q = p.getBoundingClientRect(); return q.left >= r.left - 1 && q.right <= r.right + 1; }),
          fichas: [...document.querySelectorAll('#vt-swatches .vt-sw')].map(b => Math.round(b.getBoundingClientRect().height)),
          fichasDentro: [...document.querySelectorAll('#vt-swatches .vt-sw')].every(b => ancho(b)),
          cortes: window.__cortes };
      });
      cierto(A.tema === tema, etq + ' · el tema es el que se pidió');
      cierto(A.desborde <= 1 && A.desbordeModal <= 1, etq + ' · sin desborde horizontal (' + A.desborde + '/' + A.desbordeModal + ' px)');
      cierto(A.pulgares.length === 4 && A.pulgares.every(h => h >= 44), etq + ' · los cuatro pulgares miden 44 px o más (' + A.pulgares.join('/') + ')');
      cierto(A.marcasDentro && A.pastillasDentro, etq + ' · ningún rótulo de marca ni pastilla se sale de su caja');
      cierto(A.fichas.length >= 3 && A.fichas.every(h => h >= 44) && A.fichasDentro, etq + ' · las ' + A.fichas.length + ' fichas de color miden 44 px o más y caben a lo ancho');
      if (movimiento === 'reduce') cierto(A.cortes === 0, etq + ' · con menos movimiento no se dibuja el trazo de corte: ni un <svg>');
      else cierto(A.cortes === 1, etq + ' · con movimiento se dibujó una vez, y se retiró');
      await contraste(p, '#vt-detalle ~ .desl-marcas, #vectormodal .desl-caja:has(#vt-detalle) .desl-marcas', etq + ' · las marcas de Detalle');
      await contraste(p, '#vectormodal .desl-caja:has(#vt-detalle) .desl-pastilla', etq + ' · la pastilla del valor');
      await p.evaluate(() => { document.getElementById('vt-swatches').scrollIntoView({ block: 'center' }); });
      await p.waitForTimeout(250);
      await contraste(p, '#vt-swatches .vt-sw:not(.off) .vt-sw-n', etq + ' · el nombre de un color incluido');
      await contraste(p, '#vt-swatches .vt-sw.off .vt-sw-n', etq + ' · el nombre tachado de uno quitado');
      await contraste(p, '#vt-swatches .vt-sw:not(.off) .vt-sw-e', etq + ' · el ✓', 3);
      await contraste(p, '#vt-swatches .vt-sw.off .vt-sw-e', etq + ' · el ✕', 3);
      if (laDeCaptura) await cap(p, nombre('1-ajustes-y-colores'));

      /* Fase B · quitar un color: la cifra y la ficha. */
      await p.evaluate(() => { window.__chip = document.querySelectorAll('#vt-swatches .vt-sw')[1]; window.__ruedas = 0;
        new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('rueda-vista')) window.__ruedas++; }))).observe(document.getElementById('vt-res'), { childList: true, subtree: true }); });
      await p.tap('#vt-swatches .vt-sw:nth-child(2)');
      await p.waitForTimeout(200);
      const Bq = await p.evaluate(() => ({ n: document.getElementById('vt-st-colores').textContent, de: VT.keep.filter(Boolean).length, ruedas: window.__ruedas, mismo: document.querySelectorAll('#vt-swatches .vt-sw')[1] === window.__chip }));
      cierto(Bq.n === String(Bq.de) && Bq.mismo, etq + ' · la cifra de colores es la de verdad (' + Bq.n + ') y la ficha es la misma');
      if (movimiento === 'reduce') cierto(Bq.ruedas === 0, etq + ' · con menos movimiento la cifra cambia sin rodar');
      else cierto(Bq.ruedas >= 1, etq + ' · con movimiento la cifra rueda');
      await p.evaluate(() => { document.getElementById('vt-modo-bn').scrollIntoView({ block: 'center' }); });
      await p.tap('#vt-modo-foto');
      const Bf = await p.evaluate(() => !!document.querySelector('.ficha-viaja'));
      if (movimiento === 'reduce') cierto(!Bf, etq + ' · con menos movimiento la ficha de modo no viaja: el elegido cambia como cambiaba');
      else cierto(Bf, etq + ' · con movimiento la ficha de modo viaja');
      await p.waitForTimeout(450);
      await p.evaluate(() => vtSetModo('logo'));

      /* Fase C · la barra fina en un re-trazo (la información se queda con menos movimiento). */
      const Cb = await p.evaluate(async () => {
        const el = document.getElementById('vt-detalle'); el.value = '2';
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        const pr = document.getElementById('vt-prog'), o = { fina: pr.classList.contains('fina') && pr.classList.contains('on') };
        while (VT.corriendo) await new Promise(r => setTimeout(r, 30));
        return o;
      });
      cierto(Cb.fina, etq + ' · el re-trazo muestra su barra fina también con ' + (movimiento === 'reduce' ? 'menos movimiento (es avance, no adorno)' : 'movimiento'));
      await p.evaluate(() => { document.getElementById('vt-copy-svg').scrollIntoView({ block: 'center' }); });
      await p.tap('#vt-copy-svg');
      await p.waitForFunction(() => !!document.querySelector('#vt-copy-svg .rotulo.alt'), null, { timeout: 3000 });
      await limpiarAvisos(p);
      await contraste(p, '#vt-copy-svg .rotulo-b', etq + ' · «Copiado» en el botón');
      await p.waitForFunction(() => !document.querySelector('#vt-copy-svg .rotulo.alt'), null, { timeout: 4000 });
      await p.waitForTimeout(500);
      cierto((await infinitas(p)).length === 0, etq + ' · nada se anima solo en reposo');

      /* Fase D · el PDF, trabajando y roto. */
      await p.evaluate(LECTOR(5000));
      await p.evaluate(() => { window.__pdf = vtLoadPDF(new File([new Blob(['%PDF-1.4'])], 'plano.pdf', { type: 'application/pdf' })); });
      await p.waitForTimeout(700);
      await contraste(p, '#vt-overlay-pasos', etq + ' · el PDF abriendo, sobre la imagen');
      const D1 = await p.evaluate(() => { const c = document.querySelector('#vt-overlay .sp-overlay-tarjeta').getBoundingClientRect(), a = document.getElementById('vt-canvas-area').getBoundingClientRect(); return { dentro: c.top >= a.top - 1 && c.bottom <= a.bottom + 1 && c.left >= a.left - 1 && c.right <= a.right + 1 }; });
      cierto(D1.dentro, etq + ' · la tarjeta del PDF cabe dentro del lienzo');
      if (laDeCaptura) await cap(p, nombre('2-pdf-abriendo'));
      await p.evaluate(() => { delete window.pdfjsLib; });
      await p.route('**/cdnjs.cloudflare.com/**', r => r.abort());
      await p.evaluate(async () => { await vtLoadPDF(new File([new Blob(['%PDF-1.4'])], 'plano.pdf', { type: 'application/pdf' })); });
      await p.waitForTimeout(450);
      const D2 = await p.evaluate(() => {
        const c = document.querySelector('#vt-overlay .sp-overlay-tarjeta').getBoundingClientRect(), a = document.getElementById('vt-canvas-area').getBoundingClientRect();
        const btns = [...document.querySelectorAll('#vt-overlay-mal .sp-overlay-btn')].filter(b => !b.hidden);
        return { dentro: c.top >= a.top - 1 && c.bottom <= a.bottom + 1 && c.left >= a.left - 1 && c.right <= a.right + 1, n: btns.length, altos: btns.every(b => b.getBoundingClientRect().height >= 44),
          libres: btns.every(b => { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e); }) };
      });
      cierto(D2.dentro, etq + ' · la tarjeta del error cabe dentro del lienzo');
      cierto(D2.n === 2 && D2.altos && D2.libres, etq + ' · sus dos salidas miden 44 px o más y nada las tapa');
      await contraste(p, '#vt-overlay .sp-overlay-tarjeta', etq + ' · el error del PDF, sobre la imagen');
      await contraste(p, '#vt-overlay .sp-overlay-btn.pri', etq + ' · «Elegir otro archivo»');
      if (laDeCaptura) await cap(p, nombre('3-pdf-error'));
      cierto((await infinitas(p)).length === 0, etq + ' · con el error puesto nada se anima solo');
      await p.unroute('**/cdnjs.cloudflare.com/**');
      cierto(errs.length === 0, etq + ' · cero errores de página' + (errs.length ? ': ' + errs[0] : ''));
      await ctx.close();
    }
  }
}

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl vectorizador dice qué ajusta, dibuja lo que se va a cortar y avisa en su sitio.');
await nav.close();
process.exit(fallos ? 1 : 0);
