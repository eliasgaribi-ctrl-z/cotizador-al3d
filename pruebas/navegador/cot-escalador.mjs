/* EL ESCALADOR CON LAS PIEZAS, Y EL LETRERO SOBRE LA FOTO DE LA FACHADA.
 *
 * El escalador se usa de pie, delante del cliente, con una mano sosteniendo el teléfono y la
 * otra midiendo sobre la foto. Casi todo lo que aquí se defiende es de ese momento: lo que la
 * mano tapa, lo que no se alcanza a leer, y lo que parece que no pasó.
 *
 *   · H4 · La cifra de la medida se dibujaba SOBRE la línea, que es justo donde está el dedo.
 *     Ahora va pegada bajo la lupa, entre el círculo y la mano. Es HERMANA de la lupa —dentro
 *     del círculo, con su overflow, se cortaría—, va centrada bajo ella, nunca se sale de la
 *     pantalla y no cae bajo la yema del dedo.
 *   · H5 · El pegado a una guía solo se marcaba en el lienzo de atrás, tapado por la mano. La
 *     lupa tiene que decirlo: la cruz se cierra en cuatro esquinas, la guía se pinta sólida y la
 *     mano lo siente UNA vez, al engancharse. Se mide que el cierre de 120 ms no deje estela
 *     (cada cuadro vuelve a dibujar la lupa entera), que con menos movimiento no se pida un solo
 *     cuadro, y que agarrar un extremo que ya estaba sobre la guía no vibre.
 *   · H11 · Los tres pasos de la calibración se DERIVAN de SC. Si alguien los guardara aparte,
 *     «Re-calibrar» y cargar otra foto los dejarían mintiendo.
 *   · H30 · Las medidas de siempre eran cinco emojis que escribían un número sin dejar rastro.
 *     Aquí se defiende lo que se rompe callado: que sean un grupo de radio de verdad (flechas,
 *     aria-checked), que teclear otra cifra las DESMARQUE —el campo manda—, que las flechas no
 *     saquen al teclado del grupo, y que el foco salte a «Confirmar escala» solo con un toque.
 *   · H24 · Una medida nueva tiene que verse llegar, y en el teléfono eso quiere decir ENCIMA del
 *     pie pegado del panel —debajo de él llegaba una tarjeta de la que solo se veía el filo—,
 *     sin mover la página: desplazar la página mientras el dedo mide corre el lienzo bajo la mano.
 *   · H26 · Deslizar un renglón lo borra (con su Deshacer), la × sigue estando, la palomita de
 *     «Agregada» se dibuja solo en la que acaba de nacer, la etiqueta de los cm se arrastra de
 *     centímetro en centímetro —también desde el campo vacío— y la ficha de las cotas viaja.
 *   · H28 · La pista cruza en vez de parpadear, si el texto es el MISMO no toca el DOM, y cuando
 *     el cruce termina el lienzo recupera la altura que se le había quitado de más.
 *   · H12 · Un PDF que falla deja el motivo DENTRO del lienzo, en una tarjeta que se lee sobre
 *     cualquier foto, con «Elegir otro archivo»; uno que abre muestra sus pasos con reloj y no
 *     deja nada girando; y si se pide otro archivo a medias, gana el último.
 *   · Función 32 · El letrero sobre la foto: su alto es el alto REAL en la fachada (la escala
 *     calibrada), su luz es la del material según el catálogo, y su precio sale de lineTotal(),
 *     la misma función que cobra la partida en el PDF. Lo que no puede pasar nunca es que este
 *     letrero invente una tarifa: se comprueba contra el ejemplo del brief (acrílico $40 × 45 cm
 *     × 9 letras = $16,200), contra la luz apagada (−20 %) y contra la regla de los 10 cm.
 *
 * Y las ocho rondas de siempre: 360 y 420 px, con y sin movimiento reducido, en claro y oscuro,
 * sin errores de página, sin desborde horizontal, sin nada animándose solo en reposo y con el
 * contraste medido sobre el render (no sobre la hoja de estilos) de lo que esta zona pinta.
 *
 * El dedo va por el protocolo de Chrome (CDP Input.dispatchTouchEvent) donde hace falta
 * arrastrar sobre el lienzo, y por p.tap() en los botones.
 *
 * Uso:  PUERTO=8915 node pruebas/navegador/cot-escalador.mjs
 *       CAPTURAS=/tmp/capturas-escalador PUERTO=8915 node pruebas/navegador/cot-escalador.mjs
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
  await p.evaluate(() => { const f = document.querySelector('#scalermodal .sp-actions'); if (f) f.style.visibility = 'hidden'; });
  let buf; try { buf = await el.screenshot({ timeout: 5000 }); } catch (_) { buf = null; }
  await p.evaluate(() => { const f = document.querySelector('#scalermodal .sp-actions'); if (f) f.style.visibility = ''; });
  if (!buf) { mal(nombre + ': no se pudo rasterizar'); return; }
  const m = medirRaster(buf);
  if (!m) { mal(nombre + ': un solo color, no hay nada que medir'); return; }
  cierto(m.r >= minimo, nombre + ': ' + m.r.toFixed(2) + ':1');
}

/* Una fachada de mentira con tres rectángulos: uno alto que sirve de referencia (400 px de foto
   = 200 cm), uno ancho y uno claro que medir. */
const FOTO = () => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
  const g = c.getContext('2d');
  g.fillStyle = '#d9cbb5'; g.fillRect(0, 0, 1200, 800);
  g.fillStyle = '#333333'; g.fillRect(100, 100, 400, 100); g.fillRect(700, 300, 200, 400);
  g.fillStyle = '#a5c4d4'; g.fillRect(150, 300, 480, 320);
  return c.toDataURL('image/png');
};
const PARTIDA = { material: 'acr-vol', comp: 'recta', luz: true, ilumTipo: 'fria', n: 9, altura: 45, textoAuto: 'PANADERÍA', desc: 'PANADERÍA' };

/* Abre el cotizador en blanco, con cliente y una partida de letras, y deja el escalador
   abierto con la foto cargada y, si se pide, la escala calibrada contra el rectángulo alto. */
async function montar(p, { calibrar = true, partida = null, linea = false } = {}) {
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForTimeout(1100);
  await p.fill('#f-cli', 'Farmacia San Juan');
  await p.fill('#f-tel', '33 1234 5678');
  await p.fill('#f-proy', 'Letrero de fachada sucursal Centro');
  await p.waitForTimeout(300);
  if (partida) await p.evaluate(d => {
    const it = Q.items.find(x => x.tipo === 'letras') || addItem({ enfocar: false });
    Object.assign(it, d);
    renderItems();
  }, partida);
  const foto = await p.evaluate(FOTO);
  await p.evaluate(async src => { abrirScaler(); await new Promise(r => scLoadImgSrc(src, 'fachada.png', r)); }, foto);
  await p.waitForTimeout(500);
  if (calibrar || linea) {
    await p.evaluate(() => {
      SC.refLine = { nx1: 700 / 1200, ny1: 300 / 800, nx2: 700 / 1200, ny2: 700 / 800 };
      SC.mode = 'ref-drawn';
      document.getElementById('sc-ref-confirm-row').style.display = '';
      scPintarCalibRiel(); scPintarRefRapidos();
    });
  }
  if (calibrar) {
    await p.evaluate(() => { document.getElementById('sc-ref-cm-input').value = '200'; scConfirmCalib(); });
    await p.waitForTimeout(350);
  }
  await limpiarAvisos(p);
}
const limpiarAvisos = p => p.evaluate(() => { try { Piezas.aviso.limpiar(); } catch (_) {} });
/* Traza una medida por el mismo camino por el que termina la de un dedo. */
const trazar = (p, a, b, c, d) => p.evaluate(([a, b, c, d]) => {
  scSetMeasMode('libre');
  scCommitLine({ x: a * SC.cvsW, y: b * SC.cvsH }, { x: c * SC.cvsW, y: d * SC.cvsH });
}, [a, b, c, d]);
/* Lógico → cliente, para poner el dedo justo encima de un punto de la foto. */
const aPantalla = (p, nx, ny) => p.evaluate(([nx, ny]) => {
  const r = document.getElementById('scalerCanvas').getBoundingClientRect(), v = scViewCenter();
  return { x: (nx * SC.cvsW - v.cx) * v.k + SC.vw / 2 + r.left, y: (ny * SC.cvsH - v.cy) * v.k + SC.vh / 2 + r.top };
}, [nx, ny]);
/* Un evento «de dedo» de mentira, con lo que scDown, scMove y scLoupe leen. */
const EV = `(x, y) => ({ preventDefault() {}, touches: [{ clientX: x, clientY: y }], targetTouches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] })`;
const cap = async (p, nombre) => { if (CAP) { await limpiarAvisos(p); await p.waitForTimeout(150); await p.screenshot({ path: CAP + '/' + nombre + '.png' }); } };
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => { try { return a.effect.getComputedTiming().iterations === Infinity; } catch (_) { return false; } })
  .map(a => { const n = a.effect.target; return (n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className) + ''; })
  .filter(c => !/\bai-btn\b|\bsp-ai\b/.test(c)));
/* El dedo de verdad, por el protocolo de Chrome. */
const dedoDe = cdp => {
  const punto = (q, i) => ({ x: q.x, y: q.y, radiusX: 8, radiusY: 8, force: 1, id: i });
  return {
    bajar: (...q) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: q.map(punto) }),
    mover: (...q) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: q.map(punto) }),
    subir: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  };
};

// ════════════════════════════════════════════════════════════════════════════
// PARTE 1 · el comportamiento, con ratón y teclado
// ════════════════════════════════════════════════════════════════════════════
{
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-MX' });
  await ctx.addInitScript(() => {
    window.__vib = [];
    navigator.vibrate = pat => { window.__vib.push(pat); return true; };
    Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: true }, configurable: true });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  // ── H11 · los tres pasos salen de SC, no de una variable aparte ───────────
  console.log('\nH11 · LA CALIBRACIÓN, TRES PASOS QUE SE DERIVAN DEL ESTADO');
  await montar(p, { calibrar: false });
  cierto(await p.evaluate(() => scPasoCalib() === 0), 'con la foto recién cargada va en el paso 1: marcar dos puntos');
  cierto(await p.evaluate(() => document.querySelectorAll('#sc-calib-riel .riel-paso').length === 3), 'y el riel enseña los tres pasos, no uno');
  cierto(/Marca 2 puntos/.test(await p.evaluate(() => document.querySelector('#sc-calib-riel [aria-current="step"]').textContent)),
    'el paso actual es el primero, y lo dice con aria-current="step"');
  await p.evaluate(() => {
    SC.refLine = { nx1: 700 / 1200, ny1: 300 / 800, nx2: 700 / 1200, ny2: 700 / 800 };
    SC.mode = 'ref-drawn';
    document.getElementById('sc-ref-confirm-row').style.display = '';
    scPintarCalibRiel(); scPintarRefRapidos();
  });
  await p.waitForTimeout(200);
  cierto(await p.evaluate(() => scPasoCalib() === 1), 'con la línea trazada pasa al 2: escribir cuánto mide');
  await p.evaluate(() => { document.getElementById('sc-ref-cm-input').value = '200'; scConfirmCalib(); });
  await p.waitForTimeout(300);
  const trasCalib = await p.evaluate(() => ({ paso: scPasoCalib(), hechos: [...document.querySelectorAll('#sc-calib-riel .riel-paso')].map(x => x.dataset.estado) }));
  cierto(trasCalib.paso === 2, 'calibrada, va en el 3: medir');
  cierto(trasCalib.hechos.join() === 'hecho,hecho,actual', 'los dos primeros quedan palomeados y el tercero es el actual: ' + trasCalib.hechos.join(' · '));
  await p.evaluate(() => scResetCalib());
  await p.waitForTimeout(250);
  cierto(await p.evaluate(() => scPasoCalib() === 0 && document.querySelector('#sc-calib-riel [aria-current="step"]').textContent.includes('Marca 2 puntos')),
    '«Re-calibrar» devuelve el riel al primer paso: el estado no se guarda aparte, se deriva');
  /* Deshacer un vaciado repone la foto CON su escala: el riel tiene que volver a decir «Mide». */
  await p.evaluate(() => { SC.refLine = { nx1: .5, ny1: .1, nx2: .5, ny2: .6 }; SC.nativePxPerCm = 3; SC.refCm = 200; const s = scSnapshot(); scReset(); scRestaurar(s); });
  await p.waitForTimeout(250);
  cierto(await p.evaluate(() => scPasoCalib() === 2 && document.querySelector('#sc-calib-riel [aria-current="step"]').textContent.includes('Mide')),
    'y tras restaurar una foto ya calibrada, el riel dice «Mide» y no «Marca 2 puntos»');

  // ── H30 · las medidas de siempre ──────────────────────────────────────────
  console.log('\nH30 · LAS MEDIDAS DE SIEMPRE, COMO OPCIONES ELEGIDAS Y SIN EMOJIS');
  await p.evaluate(() => {
    scResetCalib();
    SC.refLine = { nx1: 700 / 1200, ny1: 300 / 800, nx2: 700 / 1200, ny2: 700 / 800 };
    SC.mode = 'ref-drawn';
    document.getElementById('sc-ref-confirm-row').style.display = '';
    scPintarRefRapidos();
  });
  await p.waitForTimeout(200);
  const grupo = await p.evaluate(() => {
    const g = document.querySelector('#sc-ref-rapidos [role="radiogroup"]');
    return { hay: !!g, n: g ? g.querySelectorAll('[role="radio"]').length : 0, alto: g ? Math.round(g.querySelector('[role="radio"]').getBoundingClientRect().height) : 0 };
  });
  cierto(grupo.hay && grupo.n === 5, 'son un grupo de radio de verdad, con las cinco medidas');
  cierto(grupo.alto >= 44, 'y cada una mide ' + grupo.alto + ' px de alto (44 como mínimo)');
  cierto(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(await p.evaluate(() => document.getElementById('sc-ref-rapidos').textContent)),
    'sin un solo emoji: los rótulos dicen qué objeto es y cuánto mide');
  cierto(/200/.test(await p.evaluate(() => [...document.querySelectorAll('#sc-ref-rapidos [role="radio"]')].find(b => /Puerta/.test(b.textContent)).textContent)),
    'la puerta sigue siendo la del repo: 200 cm');
  cierto(await p.evaluate(() => document.querySelector('[data-sc-puerta]').textContent === String(SC_REF_PUERTA_CM)),
    'y el «200» del texto de ayuda sale de la misma constante que la ficha de la puerta y que el letrero');
  await p.click('#sc-ref-rapidos [role="radio"][data-v="200"]');
  await p.waitForTimeout(220);
  const traChip = await p.evaluate(() => ({ v: document.getElementById('sc-ref-cm-input').value, marcada: document.querySelector('#sc-ref-rapidos [aria-checked="true"]').dataset.v, foco: document.activeElement.id }));
  cierto(traChip.v === '200' && traChip.marcada === '200', 'elegirla escribe los 200 en el campo Y queda marcada');
  cierto(traChip.foco === 'sc-btn-confirm-calib', 'y con un clic el foco salta a «Confirmar escala», que es lo único que falta');
  await p.keyboard.press('Shift+Tab');
  const foco0 = await p.evaluate(() => document.activeElement.getAttribute('data-v'));
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(200);
  const traFlecha = await p.evaluate(() => ({ marcada: document.querySelector('#sc-ref-rapidos [aria-checked="true"]').dataset.v, foco: document.activeElement.getAttribute('role'), en: document.activeElement.getAttribute('data-v') }));
  cierto(foco0 === '200' && traFlecha.marcada === '175', 'las flechas recorren el grupo como un radio de verdad: la siguiente son los 175 de una persona');
  cierto(traFlecha.foco === 'radio' && traFlecha.en === '175',
    'y el foco se QUEDA en el grupo: si cada flecha mandara el foco a «Confirmar escala», quien recorre con el teclado saldría en la primera');
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(150);
  cierto(await p.evaluate(() => document.activeElement.getAttribute('data-v') === '120'), 'y la segunda flecha sigue en el grupo: ahora en los 120 de una ventana');
  await p.fill('#sc-ref-cm-input', '182');
  await p.waitForTimeout(200);
  cierto(await p.evaluate(() => !document.querySelector('#sc-ref-rapidos [aria-checked="true"]')), 'teclear otra cifra las desmarca todas: el campo manda sobre la opción elegida');

  // ── H26 #3 · arrastrar sobre la etiqueta de los cm ────────────────────────
  console.log('\nH26 #3 · LA ETIQUETA DE LOS CENTÍMETROS SE ARRASTRA, DE CENTÍMETRO EN CENTÍMETRO');
  const et = p.locator('label[for="sc-ref-cm-input"]');
  cierto(await et.evaluate(e => e.classList.contains('arrastrable')), 'la etiqueta es el mango');
  await p.fill('#sc-ref-cm-input', '175');
  let caja = await et.boundingBox();
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.mouse.down();
  await p.mouse.move(caja.x + caja.width / 2 + 44, caja.y + caja.height / 2, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(250);
  const desde175 = Number(await p.evaluate(() => document.getElementById('sc-ref-cm-input').value));
  cierto(desde175 >= 184 && desde175 <= 187, 'arrastrar 44 px a la derecha sube unos 10 cm y no una décima: de 175 a ' + desde175);
  cierto(await p.evaluate(() => !!document.querySelector('#sc-ref-rapidos [aria-checked="true"]') === false || document.querySelector('#sc-ref-rapidos [aria-checked="true"]').dataset.v === document.getElementById('sc-ref-cm-input').value),
    'y las opciones de arriba siguen al campo mientras se arrastra');
  await p.fill('#sc-ref-cm-input', '');
  caja = await et.boundingBox();
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.mouse.down();
  await p.mouse.move(caja.x + caja.width / 2 - 40, caja.y + caja.height / 2, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(250);
  const desdeVacio = Number(await p.evaluate(() => document.getElementById('sc-ref-cm-input').value));
  cierto(desdeVacio > 150 && desdeVacio < 200, 'con el campo vacío el gesto no arranca en 0.1: parte de la puerta (200) y baja a ' + desdeVacio);
  await p.fill('#sc-ref-cm-input', '');
  await p.click('label[for="sc-ref-cm-input"]');
  await p.waitForTimeout(200);
  cierto(await p.evaluate(() => document.getElementById('sc-ref-cm-input').value === '' && document.activeElement.id === 'sc-ref-cm-input'),
    'y un simple toque en la etiqueta enfoca el campo VACÍO: no le deja escrito un «200» que nadie eligió');

  // ── H28 · la pista cruza, y no se toca si dice lo mismo ───────────────────
  console.log('\nH28 · LA PISTA DEL LIENZO CRUZA EN VEZ DE PARPADEAR');
  const cruce = await p.evaluate(() => {
    scSetHint('Primera pista de prueba');
    const antes = document.querySelector('.sp-hint-txt .rotulo-a');
    scSetHint('Segunda pista de prueba');
    const bar = document.getElementById('sp-hint-bar');
    return { sale: !!bar.querySelector('.rotulo-sale'), viejoSigue: bar.textContent.includes('Primera pista'), nuevo: bar.textContent.includes('Segunda pista'), mismoNodo: antes === document.querySelector('.sp-hint-txt .rotulo-a') };
  });
  cierto(cruce.sale && cruce.viejoSigue && cruce.nuevo, 'el texto viejo sale mientras entra el nuevo: los dos conviven el cruce');
  cierto(!cruce.mismoNodo, 'y el rótulo que se ve es otro nodo, no el mismo reescrito de golpe');
  await p.waitForTimeout(400);
  cierto(await p.evaluate(() => !document.querySelector('#sp-hint-bar .rotulo-sale') && !document.getElementById('sp-hint-bar').textContent.includes('Primera')), 'y al terminar el cruce el viejo se va: no se acumulan textos');
  const igual = await p.evaluate(() => {
    scSetHint('Una pista que se repite');
    const n = document.querySelector('.sp-hint-txt .rotulo-a');
    const cambio = Piezas.cambiarRotulo(document.querySelector('.sp-hint-txt'), 'Una pista que se repite');
    return { cambio, mismo: n === document.querySelector('.sp-hint-txt .rotulo-a') };
  });
  cierto(igual.cambio === false && igual.mismo, 'si la pista dice lo mismo no se toca el DOM: nada parpadea al repintar');
  const conBoton = await p.evaluate(() => {
    scSetHint('Con salida', { label: 'Quitar punto', fn: () => {} });
    const hay = !!document.querySelector('.sp-hint-act');
    scSetHint('Sin salida');
    return { hay, sigue: !!document.querySelector('.sp-hint-act') };
  });
  cierto(conBoton.hay && !conBoton.sigue, 'el botón de la pista se va con ella: con .hide la barra solo baja su opacidad y un botón olvidado seguiría en el tabulador');

  // ── H24 y H26 · la lista de medidas ───────────────────────────────────────
  console.log('\nH24 · LA MEDIDA NUEVA SE VE LLEGAR, SIN MOVER LA PÁGINA');
  await montar(p);
  await trazar(p, .1, .1, .5, .1);
  await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, 0));
  const antesY = await p.evaluate(() => window.scrollY);
  for (let i = 0; i < 5; i++) { await trazar(p, .1, .2 + i * .1, .4, .2 + i * .1); await p.waitForTimeout(220); }
  await p.waitForTimeout(400);
  const llegada = await p.evaluate(() => {
    const l = document.getElementById('sc-medidas-list'), ultima = l.lastElementChild;
    return { y: window.scrollY, marcada: !!l.querySelector('.lista-nueva'), ultimaMarcada: ultima.classList.contains('lista-nueva'),
      alcanza: ultima.offsetTop + ultima.offsetHeight <= l.scrollTop + l.clientHeight + 2 };
  });
  cierto(llegada.marcada && llegada.ultimaMarcada, 'la tarjeta nueva queda marcada como recién llegada');
  cierto(llegada.y === antesY, 'y la página no se movió ni un píxel mientras tanto (scrollY ' + llegada.y + ')');
  cierto(llegada.alcanza, 'la lista sí se desplazó hasta ella: se ve entera sin buscarla');
  cierto(await p.evaluate(() => document.getElementById('sc-mcount').textContent === '6'), 'y el contador dice las seis');
  const bordes = await p.evaluate(() => { const l = document.getElementById('sc-medidas-list'), cs = getComputedStyle(l); return { clase: l.classList.contains('bordes'), antes: l.classList.contains('hay-antes'), sobra: l.scrollHeight > l.clientHeight + 4, mascara: (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none' }; });
  cierto(bordes.clase && bordes.sobra, 'H26 #10 · la lista con seis medidas se desplaza y lleva la pieza de bordes que se desvanecen');
  cierto(bordes.antes && bordes.mascara, 'y como ya bajó hasta la última, el borde de ARRIBA se funde: dice que arriba hay más, en vez de cortar seco');
  cierto(await p.evaluate(() => document.getElementById('sc-mcount').classList.contains('sc-cuenta-salta')), 'el contador dio su salto: subió');
  await p.evaluate(() => scDelMedida(SC.items[SC.items.length - 1].id));
  await p.waitForTimeout(250);
  cierto(await p.evaluate(() => !document.getElementById('sc-mcount').classList.contains('sc-cuenta-salta') || SC.items.length === 5),
    'y al bajar no salta: un brinco al borrar se lee como que algo salió mal');
  /* Una foto nueva reinicia los números de las medidas en 1: la lista viva recordaba el «1» de
     la foto anterior y la primera medida de la nueva no se marcaba ni se acercaba. */
  const foto2 = await p.evaluate(FOTO);
  await p.evaluate(async src => { await new Promise(r => scLoadImgSrc(src, 'otra.png', r)); }, foto2);
  await p.waitForTimeout(300);
  await p.evaluate(() => { SC.refLine = { nx1: 700 / 1200, ny1: 300 / 800, nx2: 700 / 1200, ny2: 700 / 800 }; SC.mode = 'ref-drawn'; document.getElementById('sc-ref-cm-input').value = '200'; scConfirmCalib(); });
  await p.waitForTimeout(300);
  await trazar(p, .1, .1, .5, .1);
  await p.waitForTimeout(400);
  cierto(await p.evaluate(() => !!document.querySelector('#sc-medidas-list .sp-mfila.lista-nueva') && SC.items[0].id === 1),
    'con otra foto, la primera medida (otra vez la número 1) también llega marcada: la lista se olvidó de la anterior');

  console.log('\nH26 · DESLIZAR PARA BORRAR, LA × QUE SIGUE ESTANDO Y LA PALOMITA QUE SE DIBUJA');
  await trazar(p, .1, .3, .4, .3);
  await p.waitForTimeout(300);
  const atajo = await p.evaluate(() => {
    const f = document.querySelector('#sc-medidas-list .sp-mfila'), acc = f.querySelector('.desliza-acciones');
    return { hay: !!acc, oculta: acc.getAttribute('aria-hidden') === 'true', fueraDelTab: acc.querySelector('button').tabIndex === -1, equis: !!f.querySelector('.sp-ibtn') };
  });
  cierto(atajo.hay, 'cada renglón esconde su «Borrar» detrás del deslizamiento');
  cierto(atajo.equis, 'y la × sigue a la vista: deslizar es un atajo, no el único camino');
  cierto(atajo.oculta && atajo.fueraDelTab, 'por eso el atajo va aria-hidden y fuera del tabulador: si no, el Tab y el lector lo encontrarían dos veces');
  const borrado = await p.evaluate(() => {
    const n = SC.items.length;
    document.querySelector('#sc-medidas-list .desliza-acciones button').click();
    return { antes: n, ahora: SC.items.length, deshacer: /Deshacer/.test(document.getElementById('toast').textContent) };
  });
  cierto(borrado.ahora === borrado.antes - 1, 'el «Borrar» del atajo borra de verdad');
  cierto(borrado.deshacer, 'y con su Deshacer, que es lo que hace que deslizar no dé miedo');
  await p.evaluate(() => { scDeshacerMedida(); });
  await p.waitForTimeout(250);
  const palomita = await p.evaluate(() => {
    scUsarMedida(SC.items[0].id);
    return new Promise(r => setTimeout(() => {
      const b = document.querySelector('.sp-mitem-add.done');
      r({ hay: !!b, dibuja: !!(b && b.querySelector('.palomita.dibuja')), sinCheck: !/i-check/.test(b ? b.innerHTML : '') });
    }, 300));
  });
  cierto(palomita.hay && palomita.dibuja, '«Agregada» lleva la palomita que se dibuja, no el ✓ de la hoja');
  cierto(palomita.sinCheck, 'y ya no usa el símbolo del sprite para eso: una sola implementación del patrón');
  await p.evaluate(() => scUpdateList());
  await p.waitForTimeout(250);
  cierto(await p.evaluate(() => { const s = document.querySelector('.sp-mitem-add.done .palomita'); return !!s && !s.classList.contains('dibuja'); }),
    'al repintar la lista, la que ya estaba aparece ya dibujada: no se vuelve a trazar con cada tecla');
  await p.evaluate(() => { scSetMeasMode('libre'); });
  await trazar(p, .1, .5, .5, .5);
  await p.waitForTimeout(400);
  const cotasViaja = await p.evaluate(() => {
    scSetCotas('foco');
    return new Promise(r => setTimeout(() => r({ ficha: !!document.querySelector('#sc-cotas-todas').parentElement.querySelector('.ficha-viaja'), grupo: document.querySelector('#sc-cotas-todas').parentElement.classList.contains('con-ficha') }), 30));
  });
  cierto(cotasViaja.grupo, 'H26 #2 · el selector de cotas es un grupo de ficha que viaja');
  cierto(cotasViaja.ficha, 'y al cambiar de «Todas» a «La elegida» la ficha se ve pasar, no aparece de golpe');
  await p.waitForTimeout(500);
  cierto(await p.evaluate(() => !document.querySelector('.ficha-viaja')), 'y se va al llegar: en reposo no queda nada');
  await p.evaluate(() => scSetCotas('todas'));

  // ── H4 y H5 · la lupa ─────────────────────────────────────────────────────
  console.log('\nH4 y H5 · LA LUPA DICE CUÁNTO MIDE Y AVISA CUANDO SE PEGA');
  cierto(await p.evaluate(() => { const lupa = document.getElementById('sc-loupe'), cifra = document.getElementById('sc-loupe-cifra'); return !!cifra && cifra.parentElement === lupa.parentElement; }),
    'la cifra es HERMANA de la lupa y no hija: dentro del círculo, con su overflow, se cortaría');
  const lectura = await p.evaluate(`(() => {
    const ev = ${EV};
    const r = document.getElementById('scalerCanvas').getBoundingClientRect();
    scSetMeasMode('libre');
    scDown(ev(r.left + 60, r.top + 60));
    SC.sp = { x: .2 * SC.cvsW, y: .3 * SC.cvsH };
    SC.cp = { x: .6 * SC.cvsW, y: .3 * SC.cvsH };
    scLoupe(ev(r.left + 200, r.top + 120));
    const t = document.getElementById('sc-loupe-cifra');
    const visible = getComputedStyle(t).display !== 'none', texto = t.textContent;
    scUp(ev(r.left + 200, r.top + 120));
    scCancelarPunto();
    return { visible, texto };
  })()`);
  cierto(lectura.visible, 'con el dedo encima la cifra se ve');
  cierto(/^\d+(\.\d)? cm$/.test(lectura.texto), 'y dice los centímetros vivos de la línea: «' + lectura.texto + '»');
  const pegado = await p.evaluate(`(() => {
    const ev = ${EV};
    scAddGuide('h');
    const g = SC.guides[SC.guides.length - 1];
    const r = document.getElementById('scalerCanvas').getBoundingClientRect();
    scSetMeasMode('libre');
    SC.down = true; SC.sp = { x: .2 * SC.cvsW, y: g.pos * SC.cvsH };
    SC.cp = scSnapGuides({ x: .6 * SC.cvsW, y: g.pos * SC.cvsH });
    scLoupe(ev(r.left + 200, r.top + 120));
    const conGuia = { esq: SC_ESQ.hasta, texto: document.getElementById('sc-loupe-cifra').textContent };
    SC.cp = scSnapGuides({ x: .6 * SC.cvsW, y: g.pos * SC.cvsH + 120 });
    scLoupe(ev(r.left + 200, r.top + 120));
    const sinGuia = { esq: SC_ESQ.hasta, texto: document.getElementById('sc-loupe-cifra').textContent };
    SC.down = false; SC.sp = SC.cp = null; scHideLoupe(); scClearGuides();
    return { conGuia, sinGuia };
  })()`);
  cierto(pegado.conGuia.esq === 1, 'pegado a una guía, la cruz de la lupa se cierra en cuatro esquinas');
  cierto(/en la guía$/.test(pegado.conGuia.texto), 'y la cifra lo dice con letra: «' + pegado.conGuia.texto + '»');
  cierto(pegado.sinGuia.esq === 0 && !/en la guía/.test(pegado.sinGuia.texto), 'al despegarse vuelven la cruz y la cifra sola: el aviso es del momento, no un estado pegado');
  cierto(await p.evaluate(() => document.getElementById('sc-loupe-cifra').style.display === 'none'), 'y al soltar el dedo la cifra se va con la lupa');
  /* La estela: el cierre de 120 ms pedía cuadros que solo repintaban la mira, encima de lo que ya
     había, y cada cuadro dejaba su juego de esquinas. Al terminar, la lupa tiene que ser
     idéntica a una lupa dibujada limpia. */
  const estela = await p.evaluate(`(async () => {
    const ev = ${EV};
    scAddGuide('v');
    const g = SC.guides[SC.guides.length - 1];
    const r = document.getElementById('scalerCanvas').getBoundingClientRect();
    scSetMeasMode('libre');
    SC.down = true; SC.sp = { x: .2 * SC.cvsW, y: .3 * SC.cvsH };
    SC.cp = scSnapGuides({ x: g.pos * SC.cvsW, y: .5 * SC.cvsH });
    scLoupe(ev(r.left + 200, r.top + 120));
    await new Promise(f => setTimeout(f, 320));
    const cv = document.getElementById('sc-loupe-cvs');
    const conAnimacion = cv.toDataURL();
    scLoupeDibujar();
    const limpia = cv.toDataURL();
    const raf = SC_ESQ.raf;
    SC.down = false; SC.sp = SC.cp = null; scHideLoupe(); scClearGuides();
    return { igual: conAnimacion === limpia, raf, nivel: SC_ESQ.hasta };
  })()`);
  cierto(estela.igual, 'terminado el cierre de esquinas, la lupa es idéntica a una dibujada limpia: no queda estela de los cuadros de en medio');
  cierto(estela.raf === 0, 'y terminado el cierre no queda ningún cuadro pedido: nada en bucle');

  // ── H5 · la mano lo siente una vez, y solo al enganchar ───────────────────
  console.log('\nH5 · UN GOLPECITO AL ENGANCHAR, Y SOLO AL ENGANCHAR');
  const vibra = await p.evaluate(`(() => {
    const ev = ${EV};
    __vib.length = 0;
    scAddGuide('v');
    const g = SC.guides[SC.guides.length - 1], r = document.getElementById('scalerCanvas').getBoundingClientRect(), v = scViewCenter();
    const px = nx => (nx * SC.cvsW - v.cx) * v.k + SC.vw / 2 + r.left, py = ny => (ny * SC.cvsH - v.cy) * v.k + SC.vh / 2 + r.top;
    scSetMeasMode('libre');
    const lejos = ev(px(g.pos) - 90, py(.4)), cerca = ev(px(g.pos) + 3, py(.4));
    scDown(lejos);
    const alBajar = __vib.length;
    scMove(cerca); const alLlegar = __vib.length;
    scMove(ev(px(g.pos) + 2, py(.41))); const alQuedarse = __vib.length;
    scMove(lejos); const alIrse = __vib.length;
    scMove(cerca); const alVolver = __vib.length;
    scUp(cerca); scCancelarPunto(); scClearGuides();
    return { alBajar, alLlegar, alQuedarse, alIrse, alVolver, patron: JSON.stringify(__vib[0]) };
  })()`);
  cierto(vibra.alBajar === 0, 'tocar lejos de la guía no vibra');
  cierto(vibra.alLlegar === 1 && vibra.patron === '[6]', 'al llegar a la guía vibra UNA vez, corto: ' + vibra.patron);
  cierto(vibra.alQuedarse === 1, 'quedarse sobre ella no vuelve a vibrar: sería ruido en la mano');
  cierto(vibra.alIrse === 1, 'soltarla tampoco');
  cierto(vibra.alVolver === 2, 'y volver a engancharla sí: es otro enganche');
  const agarrar = await p.evaluate(`(() => {
    const ev = ${EV};
    __vib.length = 0;
    const m = SC.items[0], r = document.getElementById('scalerCanvas').getBoundingClientRect(), v = scViewCenter();
    scAddGuide('h'); const g = SC.guides[SC.guides.length - 1]; g.pos = m.ny1;
    const x = (m.nx1 * SC.cvsW - v.cx) * v.k + SC.vw / 2 + r.left, y = (m.ny1 * SC.cvsH - v.cy) * v.k + SC.vh / 2 + r.top;
    scSetMeasMode('libre');
    scDown(ev(x, y));
    const texto = document.getElementById('sc-loupe-cifra').textContent, arrastrando = !!SC.dragH, n = __vib.length;
    scUp(ev(x, y)); scClearGuides();
    return { texto, arrastrando, n };
  })()`);
  cierto(agarrar.arrastrando && /en la guía/.test(agarrar.texto), 'agarrar un extremo que ya está sobre una guía lo dice desde el primer cuadro: «' + agarrar.texto + '»');
  cierto(agarrar.n === 0, 'pero no vibra: no hay nada que enganchar, ya estaba ahí');

  // ── H12 · el PDF se abre dentro del lienzo, y su error se queda ahí ───────
  console.log('\nH12 · EL PDF SE ABRE DENTRO DEL LIENZO, Y SU ERROR SE QUEDA AHÍ');
  await p.route('**/cdnjs.cloudflare.com/**', r => r.abort());
  await p.evaluate(() => { try { delete window.pdfjsLib; } catch (_) { window.pdfjsLib = undefined; } });
  await p.evaluate(async () => { await scLoadPDF(new File([new Blob(['%PDF-1.4 nada'], { type: 'application/pdf' })], 'plano.pdf', { type: 'application/pdf' })); });
  await p.waitForTimeout(500);
  const pdf = await p.evaluate(() => ({
    caraVisible: !document.getElementById('sc-overlay-pdf').hidden && !document.getElementById('sp-overlay').classList.contains('hide'),
    vacioEscondido: document.getElementById('sc-overlay-vacio').hidden,
    motivo: document.getElementById('sc-overlay-motivo').textContent,
    otro: !!document.querySelector('#sc-overlay-mal [data-sc-accion="elegir"]'),
    seguir: !document.getElementById('sc-overlay-seguir').hidden,
    pasos: document.getElementById('sc-overlay-pasos').textContent.replace(/\s+/g, ' ').trim(),
    detalle: document.querySelector('#sc-overlay-pasos .traza-d') ? document.querySelector('#sc-overlay-pasos .traza-d').textContent : '',
    girando: document.querySelectorAll('#sc-overlay-pasos [data-estado="trabaja"]').length,
    clase: document.getElementById('sc-overlay-pdf').classList.contains('mal'),
  }));
  cierto(pdf.caraVisible && pdf.vacioEscondido, 'el recuadro del lienzo deja de invitar a cargar una imagen y enseña lo que está pasando');
  cierto(/conexión|no se pudo leer|archivo/i.test(pdf.motivo), 'el motivo se queda ahí mismo: «' + pdf.motivo.slice(0, 70) + '…»');
  cierto(pdf.otro, 'con «Elegir otro archivo» a un toque, en el mismo sitio donde se está mirando');
  cierto(pdf.seguir, 'y, como ya había una foto cargada, con la salida para dejarla como estaba');
  cierto(/lector/i.test(pdf.pasos), 'la traza nombra el paso que falló: «' + pdf.pasos.slice(0, 40) + '»');
  cierto(!pdf.detalle.includes('conexión'), 'y el motivo NO se repite dentro del paso: se lee una vez, completo, debajo');
  cierto(pdf.girando === 0, 'ningún paso se queda girando después del fallo');
  await p.waitForTimeout(100);
  cierto((await infinitas(p)).length === 0, 'y nada se anima solo tras el fallo');
  const elegir = await p.evaluate(() => { let abrio = false; const i = document.getElementById('scaler-img-input'); i.addEventListener('click', e => { abrio = true; e.preventDefault(); }, { once: true }); document.querySelector('#sc-overlay-mal [data-sc-accion="elegir"]').click(); return abrio; });
  cierto(elegir, '«Elegir otro archivo» abre el selector de archivos (sin un manejador en línea en el marcado)');
  await p.evaluate(() => document.querySelector('#sc-overlay-mal [data-sc-accion="dejar"]').click());
  await p.waitForTimeout(250);
  cierto(await p.evaluate(() => document.getElementById('sp-overlay').classList.contains('hide')), '«Volver a la foto» devuelve el lienzo: un error no secuestra una medición a medias');
  await p.unroute('**/cdnjs.cloudflare.com/**');

  /* El camino feliz, con un lector de PDF de mentira que tarda: los pasos corren con su reloj,
     al terminar la foto está cargada y no queda nada girando. */
  const LECTOR = `window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: new Promise(r => setTimeout(() => r({ destroy() {},
    getPage: async () => ({ getViewport: ({ scale }) => ({ width: 600 * scale, height: 400 * scale }),
      render: ({ canvasContext, viewport }) => ({ promise: new Promise(rr => setTimeout(() => { canvasContext.fillStyle = '#c9b99f'; canvasContext.fillRect(0, 0, viewport.width, viewport.height); rr(); }, window.__tarda || 900)) }) }) }), 300)) }) };`;
  await p.evaluate(LECTOR);
  await p.evaluate(() => { window.__tarda = 900; window.__pdf = scLoadPDF(new File([new Blob(['%PDF-1.4'])], 'uno.pdf', { type: 'application/pdf' })); });
  await p.waitForTimeout(650);
  const trabajando = await p.evaluate(() => ({
    visible: !document.getElementById('sp-overlay').classList.contains('hide') && !document.getElementById('sc-overlay-pdf').hidden,
    girando: document.querySelectorAll('#sc-overlay-pasos [data-estado="trabaja"]').length,
    reloj: (document.querySelector('#sc-overlay-pasos [data-estado="trabaja"] .traza-reloj') || {}).textContent || '',
    sinAviso: !/Cargando PDF/.test(document.getElementById('toast').textContent),
  }));
  cierto(trabajando.visible && trabajando.girando === 1, 'mientras abre, el recuadro enseña el paso que corre (uno solo gira)');
  cierto(/^\d+\.\d s$/.test(trabajando.reloj), 'con su reloj en décimas: «' + trabajando.reloj + '»');
  cierto(trabajando.sinAviso, 'y ya no hay el aviso de 8 s de «Cargando PDF…» abajo, con el lienzo diciendo otra cosa');
  await p.evaluate(() => window.__pdf);
  await p.waitForTimeout(700);
  const listo = await p.evaluate(() => ({ img: !!SC.img && SC.imgW > 0, oculto: document.getElementById('sp-overlay').classList.contains('hide') }));
  cierto(listo.img && listo.oculto, 'al terminar, la hoja del PDF es la foto y el recuadro se retira');
  cierto((await infinitas(p)).length === 0, 'y nada queda girando');
  /* Se pide un segundo archivo cuando el primero todavía no termina: el último gana. */
  await p.evaluate(() => { window.__tarda = 1200; window.__a = scLoadPDF(new File([new Blob(['%PDF-1.4'])], 'lento.pdf', { type: 'application/pdf' })); });
  await p.waitForTimeout(500);
  await p.evaluate(() => { window.__tarda = 100; window.__b = scLoadPDF(new File([new Blob(['%PDF-1.4'])], 'rapido.pdf', { type: 'application/pdf' })); });
  await p.evaluate(() => Promise.all([window.__a, window.__b]));
  await p.waitForTimeout(600);
  cierto(await p.evaluate(() => document.querySelectorAll('#sc-overlay-pasos .traza-paso').length <= 2), 'los pasos del segundo PDF empiezan de cero: no arrastran los del primero');
  cierto(await p.evaluate(() => document.getElementById('sp-overlay').classList.contains('hide')), 'y al terminar los dos, el recuadro está recogido: el lento no lo vuelve a levantar');

  /* El plano que analizó la IA también puede ser un PDF: entra por el mismo recuadro, con un paso
     más —traerlo— y su propio error. */
  await p.evaluate(() => { window.__tarda = 250; Q.aiFile = { url: 'data:application/pdf;base64,JVBERi0xLjQK', type: 'application/pdf', name: 'plano-ia.pdf' }; window.__ia = usarImagenAIEnScaler(); });
  await p.waitForTimeout(120);
  const traer = await p.evaluate(() => document.getElementById('sc-overlay-pasos').textContent.replace(/\s+/g, ' '));
  cierto(/Trayendo el plano que analizó la IA|Abriendo la primera hoja/.test(traer), 'el PDF de la IA abre por el mismo recuadro, con su paso de traer el archivo: «' + traer.slice(0, 50) + '»');
  await p.evaluate(() => window.__ia);
  await p.waitForTimeout(900);
  cierto(await p.evaluate(() => !!SC.img && document.getElementById('sp-overlay').classList.contains('hide') && document.querySelectorAll('#sc-overlay-pasos [data-estado="trabaja"]').length === 0),
    'y al terminar es la foto, y nada queda girando');
  await p.evaluate(() => { Q.aiFile = { url: 'http://127.0.0.1:1/no-existe.pdf', type: 'application/pdf', name: 'x.pdf' }; window.__ia = usarImagenAIEnScaler(); });
  await p.waitForTimeout(900);
  const iaMal = await p.evaluate(() => ({ motivo: document.getElementById('sc-overlay-motivo').textContent, visible: !document.getElementById('sc-overlay-mal').hidden, girando: document.querySelectorAll('#sc-overlay-pasos [data-estado="trabaja"]').length }));
  cierto(/No se pudo traer el PDF analizado/.test(iaMal.motivo) && iaMal.visible && iaMal.girando === 0,
    'si el archivo de la IA no se puede traer, el motivo se queda en el recuadro y nada gira: «' + iaMal.motivo.slice(0, 44) + '…»');
  await p.evaluate(() => { document.querySelector('#sc-overlay-mal [data-sc-accion="dejar"]').click(); Q.aiFile = null; });

  // ── Función 32 · el letrero sobre la foto ─────────────────────────────────
  console.log('\nFUNCIÓN 32 · EL LETRERO SOBRE LA FOTO DE LA FACHADA');
  await montar(p, { partida: PARTIDA });
  await p.evaluate(() => { document.getElementById('sc-sec-letrero').open = true; });
  await p.waitForTimeout(400);
  const letrero = await p.evaluate(() => {
    const caja = document.getElementById('sc-letrero'), el = document.getElementById('sc-letrero-texto');
    return { visible: !caja.hidden, texto: el.textContent, clases: el.className, etiqueta: el.getAttribute('aria-label') || '', rol: caja.getAttribute('role'),
      nombreCaja: caja.getAttribute('aria-label'), ayuda: !!document.getElementById(caja.getAttribute('aria-describedby')),
      nota: (() => { const n = document.getElementById('sc-letrero-nota'); return !n.hidden && /ilustrativo/i.test(n.textContent); })() };
  });
  cierto(letrero.visible && letrero.texto === 'PANADERÍA', 'el texto de la partida se pinta sobre la foto');
  cierto(/letrero-acrilico/.test(letrero.clases), 'acrílico, así que la cara ES la luz: LED frontal, no posterior');
  cierto(/ilustrativo/i.test(letrero.etiqueta), 'la letra dice que es ilustrativo para el lector de pantalla');
  cierto(letrero.nota, 'y la foto lo dice a la vista, en una esquina que no se mueve: «Letrero ilustrativo»');
  cierto(letrero.rol === 'group' && /letrero/i.test(letrero.nombreCaja) && letrero.ayuda, 'la caja que se agarra es un grupo con nombre y con su ayuda enlazada (mueve con las flechas), y la letra de dentro queda como imagen');
  cierto(await p.evaluate(() => { const c = document.getElementById('sc-letrero'); return c.tabIndex === 0 && getComputedStyle(document.getElementById('sc-letrero-texto')).pointerEvents === 'none'; }),
    'y es la caja —no la letra— la que recibe el toque y el teclado');
  await p.evaluate(() => { scLetreroAlto(45); });
  await p.waitForTimeout(300);
  const cuenta = await p.evaluate(() => ({ precio: document.getElementById('sc-lf-precio').textContent, lineal: lineTotal({ ...scLetreroItem(), altura: 45 }) }));
  cierto(/\$40 × 45 cm × 9 letras/.test(cuenta.precio) && /16,200/.test(cuenta.precio), 'la cuenta es la del brief: acrílico $40 × 45 cm × 9 letras = $16,200 («' + cuenta.precio.slice(-40) + '»)');
  cierto(cuenta.lineal === 16200, 'y sale de lineTotal(), la misma función que cobra la partida en el PDF — no de una tarifa inventada');
  const altoReal = await p.evaluate(() => {
    const el = document.getElementById('sc-letrero-texto'), cs = getComputedStyle(el);
    const cx = document.createElement('canvas').getContext('2d');
    cx.font = '800 100px ' + cs.fontFamily;
    return (parseFloat(cs.fontSize) * cx.measureText('H').actualBoundingBoxAscent / 100) / (scLetreroPxPorCm() * (SC.z || 1));
  });
  cierto(Math.abs(altoReal - 45) < 2.5, 'y el alto que se ve en la foto son 45 cm de verdad, medidos de vuelta (' + altoReal.toFixed(1) + ')');
  const orden = await p.evaluate(() => {
    const p = document.getElementById('sc-lf-precio').getBoundingClientRect(), s = document.getElementById('sc-lf-alto').getBoundingClientRect(), t = document.getElementById('sc-lf-texto').getBoundingClientRect();
    return s.top < p.top && p.top < t.top;
  });
  cierto(orden, 'el deslizador y el precio van ARRIBA y juntos, antes del campo de texto: en el teléfono es lo primero que se ve al abrir la sección');

  // la luz sale del catálogo, no del nombre de la clave
  for (const [mat, clase, que] of [['acero', 'letrero-aluminio', 'el acero lleva la luz por detrás, como el aluminio'], ['acr-vinil', 'letrero-acrilico', 'el acrílico con vinil lleva la luz al frente'], ['al-brush', 'letrero-aluminio', 'el aluminio cepillado, luz posterior']]) {
    await p.evaluate(m => { scLetreroItem().material = m; scLetreroPintar(); }, mat);
    cierto(await p.evaluate(c => document.getElementById('sc-letrero-texto').classList.contains(c), clase), que);
  }
  await p.evaluate(() => { const it = scLetreroItem(); it.material = 'acr-vol'; it.luz = false; scLetreroPintar(); });
  const sinLuz = await p.evaluate(() => ({ precio: document.getElementById('sc-lf-precio').textContent, sin: document.getElementById('sc-letrero-texto').classList.contains('sin-luz'), total: lineTotal({ ...scLetreroItem(), altura: SC_LF.cm }) }));
  cierto(sinLuz.sin && /sin luz −20 %/.test(sinLuz.precio) && /12,960/.test(sinLuz.precio) && sinLuz.total === 12960,
    'sin luz baja el 20 % y la cuenta lo escribe para que el número sea el resultado de lo escrito: «' + sinLuz.precio.slice(-52) + '»');
  await p.evaluate(() => { const it = scLetreroItem(); it.luz = true; scLetreroPintar(); });

  // mover, con teclado y con dedo
  const mover = await p.evaluate(() => {
    const antes = { x: SC_LF.nx, y: SC_LF.ny }, el = document.getElementById('sc-letrero');
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    const pocas = SC_LF.nx - antes.x;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
    return { movio: pocas > 0, mismaY: SC_LF.ny === antes.y, mayus: (SC_LF.nx - antes.x) > pocas * 3 };
  });
  cierto(mover.movio && mover.mismaY, 'las flechas lo mueven: el arrastre siempre tiene su alternativa de teclado');
  cierto(mover.mayus, 'y con Mayús se mueve más rápido');
  const conZoom = await p.evaluate(() => { const el = document.getElementById('sc-letrero-texto'), nx = SC_LF.nx, ny = SC_LF.ny; const sin = parseFloat(getComputedStyle(el).fontSize); scZoomBy(2); return { nx: SC_LF.nx === nx && SC_LF.ny === ny, fs: parseFloat(getComputedStyle(el).fontSize), sin }; });
  cierto(conZoom.nx, 'al acercar la foto el letrero se queda sobre el mismo ladrillo: su sitio se guarda contra la FOTO, no contra la pantalla');
  cierto(conZoom.fs > conZoom.sin * 1.9, 'y crece con ella, porque su alto es el alto real en la fachada (' + conZoom.sin.toFixed(1) + ' → ' + conZoom.fs.toFixed(1) + ' px)');
  await p.evaluate(() => scZoomReset());
  // no se le pide a la pieza lo mismo dos veces: scRender corre con cada movimiento del dedo
  const llamadas = await p.evaluate(() => {
    let n = 0; const orig = Piezas.letrero; Piezas.letrero = (...a) => { n++; return orig(...a); };
    for (let i = 0; i < 30; i++) scRender();
    const sinCambios = n;
    scZoomBy(1.5);
    const conZoomPedido = n;
    scZoomReset(); Piezas.letrero = orig;
    return { sinCambios, conZoomPedido };
  });
  cierto(llamadas.sinCambios === 0, 'treinta repintados del lienzo no le piden nada a la pieza: solo se recoloca con transform');
  cierto(llamadas.conZoomPedido === 1, 'y un cambio de zoom se lo pide una sola vez');
  const recorte = await p.evaluate(() => { scLetreroAlto(8); return document.getElementById('sc-lf-precio').textContent; });
  cierto(/recorte de acrílico/.test(recorte) && !/\$/.test(recorte), 'por debajo de 10 cm dice que ya no es letra 3D — y NO enseña precio: el acabado del recorte lo elige una persona');
  cierto(await p.evaluate(() => { const r = document.getElementById('sc-letrero').getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }), 'aun a 5 cm de letra la caja que se agarra mide 44 px como mínimo');
  await p.evaluate(() => scLetreroAlto(60));
  await p.waitForTimeout(250);
  const pasar = await p.evaluate(() => { scLetreroPasarAlto(); return { altura: scLetreroItem().altura, tipo: scLetreroItem().tipo, toast: document.getElementById('toast').textContent }; });
  cierto(pasar.altura === 60, '«Pasar este alto a la partida» escribe los 60 cm en la partida, y solo cuando se toca');
  cierto(/Deshacer/.test(pasar.toast), 'y el aviso ofrece Deshacer: cambiar la altura mueve el precio');
  await p.evaluate(() => { document.querySelector('#toast .toast-act').click(); });
  await p.waitForTimeout(300);
  cierto(await p.evaluate(() => scLetreroItem().altura === 45), 'y Deshacer regresa la partida a sus 45 cm');
  const faltaMat = await p.evaluate(() => { scLetreroItem().material = ''; scLetreroPintar(); return document.getElementById('sc-lf-precio').textContent; });
  cierto(/Falta elegir el material/.test(faltaMat) && !/\$0/.test(faltaMat), 'sin material dice que falta, en vez de enseñar un $0 que parece un precio');
  await p.evaluate(() => { scLetreroItem().material = 'acr-vol'; scLetreroPintar(); });
  // el letrero pasa por debajo de los botones de zoom, no por encima
  const zorden = await p.evaluate(() => {
    const z = document.querySelector('#sp-zoom button').getBoundingClientRect(), x = z.left + z.width / 2, y = z.top + z.height / 2;
    SC_LF.nx = Math.min(1, (x - document.getElementById('scalerCanvas').getBoundingClientRect().left) / SC.cvsW); SC_LF.ny = Math.min(1, (y - document.getElementById('scalerCanvas').getBoundingClientRect().top) / SC.cvsH);
    scLetreroColocar();
    const arriba = document.elementFromPoint(x, y);
    return !!arriba && !!arriba.closest('#sp-zoom');
  });
  cierto(zorden, 'si el letrero cae sobre el botón de acercar, el botón sigue encima: no se pierde el zoom');
  // se vuelve a montar con lo que la partida dice ahora
  await p.evaluate(() => { scLetreroItem().textoAuto = 'FARMACIA'; cerrarScaler(); });
  await p.waitForTimeout(200);
  await p.evaluate(() => { abrirScaler(); });
  await p.waitForTimeout(400);
  cierto(await p.evaluate(() => document.getElementById('sc-lf-texto').value === 'FARMACIA' && document.getElementById('sc-letrero-texto').textContent === 'FARMACIA'),
    'al cerrar y volver a abrir el escalador, el letrero enseña lo que la partida dice ahora y no lo de la vez pasada');
  await p.evaluate(() => { document.getElementById('sc-sec-letrero').open = false; });
  await p.waitForTimeout(250);
  cierto(await p.evaluate(() => document.getElementById('sc-letrero').hidden && document.getElementById('sc-letrero-nota').hidden), 'plegar la sección lo apaga —y su nota—: el lienzo vuelve entero a medir');
  await p.evaluate(() => { scResetCalib(); document.getElementById('sc-sec-letrero').open = true; scLetreroPintar(); });
  cierto(await p.evaluate(() => document.getElementById('sc-letrero').hidden && /Calibra la escala primero: una puerta mide 200 cm/.test(document.getElementById('sc-lf-falta').textContent)),
    'sin escala calibrada no hay letrero y se dice qué falta, con la puerta de la misma constante');

  console.log('');
  errs.length ? mal('errores de página: ' + [...new Set(errs)].slice(0, 3).join(' | ')) : bien('cero errores de página');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE 2 · con el dedo, en un teléfono de 360 px
// ════════════════════════════════════════════════════════════════════════════
{
  console.log('\nCON EL DEDO, EN UN TELÉFONO DE 360 px');
  const ctx = await nav.newContext({ viewport: { width: 360, height: 780 }, locale: 'es-MX', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    window.__vib = [];
    navigator.vibrate = pat => { window.__vib.push(pat); return true; };
    Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: true }, configurable: true });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const dedo = dedoDe(await ctx.newCDPSession(p));
  await montar(p, { calibrar: false, linea: true, partida: PARTIDA });
  const encima = sel => p.evaluate(s => { const e = document.querySelector(s).getBoundingClientRect(), pie = document.querySelector('#scalermodal .sp-actions').getBoundingClientRect(), caja = document.querySelector('#scalermodal .sp-side').getBoundingClientRect(); return { arriba: e.top >= caja.top - 1, abajo: e.bottom <= pie.top + 1, top: Math.round(e.top), bottom: Math.round(e.bottom), pie: Math.round(pie.top) }; }, sel);

  // ── H30 · el dedo elige, y «Confirmar escala» queda a la vista ────────────
  console.log('\nH30 · EL DEDO ELIGE LA PUERTA Y «CONFIRMAR ESCALA» QUEDA A LA VISTA');
  await cap(p, '360-claro-1-referencia');
  await p.tap('#sc-ref-rapidos [role="radio"][data-v="200"]');
  await p.waitForTimeout(700);
  cierto(await p.evaluate(() => document.getElementById('sc-ref-cm-input').value === '200'), 'el dedo elige la puerta de 200 cm y el campo la recibe');
  cierto(await p.evaluate(() => document.activeElement.id === 'sc-btn-confirm-calib'), 'y con el toque el foco salta a «Confirmar escala»');
  const vista = await encima('#sc-btn-confirm-calib');
  cierto(vista.abajo, 'y el botón queda ENCIMA del pie pegado del panel, no debajo de él: termina en ' + vista.bottom + ' y el pie empieza en ' + vista.pie);
  await p.tap('#sc-btn-confirm-calib');
  await p.waitForTimeout(400);
  cierto(await p.evaluate(() => SC.nativePxPerCm > 0), 'y «Confirmar escala» calibra con un toque');
  cierto(await p.evaluate(() => scPasoCalib() === 2), 'con el riel en el tercer paso');

  // ── H4 y H5 con el dedo de verdad ─────────────────────────────────────────
  console.log('\nH4 · LA CIFRA DE LA LUPA, CON EL DEDO Y JUNTO A LOS BORDES');
  await limpiarAvisos(p);
  await p.evaluate(() => { scSetMeasMode('libre'); scAddGuide('v'); });
  await p.waitForTimeout(250);
  const a = await aPantalla(p, .2, .25);
  for (const [x, nombre] of [[16, 'pegada al borde izquierdo'], [180, 'al centro'], [344, 'pegada al borde derecho']]) {
    await dedo.bajar({ x: a.x, y: a.y });
    await p.waitForTimeout(80);
    await dedo.mover({ x, y: a.y + 60 });
    await p.waitForTimeout(140);
    const m = await p.evaluate(() => {
      const c = document.getElementById('sc-loupe-cifra').getBoundingClientRect(), l = document.getElementById('sc-loupe').getBoundingClientRect();
      return { cIzq: c.left, cDer: c.right, cTop: c.top, cBot: c.bottom, lCen: (l.left + l.right) / 2, lBot: l.bottom, w: innerWidth, txt: document.getElementById('sc-loupe-cifra').textContent };
    });
    const centrada = Math.abs((m.cIzq + m.cDer) / 2 - m.lCen) <= 1.5;
    cierto(m.cIzq >= 7.5 && m.cDer <= m.w - 7.5, 'lupa ' + nombre + ': la cifra «' + m.txt + '» cabe en la pantalla (' + Math.round(m.cIzq) + '–' + Math.round(m.cDer) + ' de ' + m.w + ')');
    cierto(centrada || m.cIzq <= 8.5 || m.cDer >= m.w - 8.5, 'lupa ' + nombre + ': va centrada bajo el círculo (o pegada al margen cuando no cabe)');
    cierto(m.cTop >= m.lBot && m.cBot <= a.y + 60 - 24, 'lupa ' + nombre + ': cae entre el círculo y el dedo, no debajo de la yema (' + Math.round(m.cBot) + ' contra un dedo en ' + Math.round(a.y + 60) + ')');
    if (x === 344) await cap(p, '360-claro-2-lupa-borde');
    await dedo.subir();
    await p.waitForTimeout(150);
  }
  console.log('\nH5 · LA LUPA SE PEGA A LA GUÍA CON EL DEDO, SIN ESTELA');
  await p.evaluate(() => { __vib.length = 0; });
  const g = await p.evaluate(() => SC.guides[0].pos);
  const gx = await aPantalla(p, g, .3);
  await dedo.bajar({ x: gx.x - 70, y: gx.y });
  await p.waitForTimeout(80);
  await dedo.mover({ x: gx.x - 30, y: gx.y });
  await p.waitForTimeout(80);
  const vibAntes = await p.evaluate(() => __vib.length);
  await dedo.mover({ x: gx.x + 2, y: gx.y });
  await p.waitForTimeout(380);
  const pegada = await p.evaluate(() => {
    const cv = document.getElementById('sc-loupe-cvs'), viva = cv.toDataURL();
    scLoupeDibujar();
    return { esq: SC_ESQ.hasta, txt: document.getElementById('sc-loupe-cifra').textContent, igual: viva === cv.toDataURL(), vib: __vib.length };
  });
  cierto(pegada.esq === 1 && /en la guía/.test(pegada.txt), 'el dedo llega a la guía y la lupa lo dice: «' + pegada.txt + '»');
  cierto(pegada.igual, 'y con el dedo quieto sobre ella la lupa no arrastra estela de los cuadros del cierre');
  cierto(vibAntes === 0 && pegada.vib === 1, 'la mano lo siente una sola vez, al llegar');
  await cap(p, '360-claro-3-lupa-guia');
  await dedo.subir();
  await p.waitForTimeout(150);
  await p.evaluate(() => { scCancelarPunto(); scClearGuides(); });

  // ── H24 · la medida nueva llega ENCIMA del pie del panel ──────────────────
  console.log('\nH24 · EN EL TELÉFONO, LA MEDIDA NUEVA LLEGA ENCIMA DEL PIE DEL PANEL');
  /* Las pruebas de la lupa dejaron puntos y medidas a medias: se vuelve a empezar limpio, ya
     calibrado, para que «la primera medida» sea la primera. */
  await montar(p, { partida: PARTIDA });
  await p.evaluate(() => { scSetMeasMode('libre'); });
  const a1 = await aPantalla(p, .15, .25);
  await dedo.bajar(a1); await p.waitForTimeout(60); await dedo.subir(); await p.waitForTimeout(600);
  const traPrimero = await p.evaluate(() => ({ armando: SC.building, pista: document.getElementById('sp-hint-bar').textContent }));
  cierto(traPrimero.armando && /Primer punto/.test(traPrimero.pista), 'el primer toque del dedo deja el punto puesto y la pista lo dice');
  /* La pista de dos renglones le quita alto al lienzo y la foto se reacomoda: el segundo punto se
     apunta DESPUÉS de eso, donde ahora está la foto. */
  const b1 = await aPantalla(p, .55, .25);
  await dedo.bajar(b1); await p.waitForTimeout(60); await dedo.subir(); await p.waitForTimeout(1100);
  cierto(await p.evaluate(() => SC.items.length === 1), 'el segundo toque cierra la medida');
  cierto(await p.evaluate(() => localStorage.getItem('al3d_pista_medidas') === '1'), 'y la pista de deslizar asomó una vez, con la primera medida ya a la vista, y quedó anotada');
  for (let i = 1; i < 5; i++) { await trazar(p, .1, .2 + i * .1, .4, .2 + i * .1); await p.waitForTimeout(650); }
  await limpiarAvisos(p);
  const ultima = await encima('#sc-medidas-list .sp-mfila:last-child');
  cierto(ultima.abajo && ultima.arriba, 'con cinco medidas, la quinta se ve ENTERA sobre el pie del panel (' + ultima.top + '–' + ultima.bottom + ', pie en ' + ultima.pie + ')');
  cierto(await p.evaluate(() => window.scrollY === 0 && document.getElementById('sc-medidas-list').lastElementChild.classList.contains('lista-nueva')), 'sin mover la página, y llega marcada como nueva');
  await cap(p, '360-claro-4-medidas');

  // ── H26 #9 · deslizar con el dedo ─────────────────────────────────────────
  console.log('\nH26 #9 · DESLIZAR EL RENGLÓN CON EL DEDO DESCUBRE «BORRAR»');
  const fila = await p.evaluate(() => { const r = document.querySelector('#sc-medidas-list .sp-mfila:last-child .sp-mitem-cm').getBoundingClientRect(); return { y: r.top + 6 }; });
  await dedo.bajar({ x: 260, y: fila.y }); await p.waitForTimeout(40);
  for (let i = 1; i <= 8; i++) { await dedo.mover({ x: 260 - i * 14, y: fila.y }); await p.waitForTimeout(16); }
  await dedo.subir(); await p.waitForTimeout(450);
  const abierta = await p.evaluate(() => { const d = document.querySelector('#sc-medidas-list .sp-mfila:last-child'); return { clase: d.classList.contains('abierta'), x: new DOMMatrix(getComputedStyle(d.querySelector('.desliza-cara')).transform).m41, n: SC.items.length, sel: SC.sel }; });
  cierto(abierta.clase && abierta.x < -40, 'deslizar a la izquierda deja abierto el lado de «Borrar» (la cara se corrió ' + Math.round(abierta.x) + ' px)');
  await cap(p, '360-claro-5-desliza');
  await p.tap('#sc-medidas-list .sp-mfila:last-child .desliza-acc.peligro');
  await p.waitForTimeout(500);
  cierto(await p.evaluate(() => SC.items.length === 4 && /Deshacer/.test(document.getElementById('toast').textContent)), 'tocar «Borrar» borra la medida y ofrece Deshacer');
  await p.evaluate(() => scDeshacerMedida()); await p.waitForTimeout(400); await limpiarAvisos(p);

  // ── H28 · el lienzo recupera lo que el cruce le quitó ─────────────────────
  console.log('\nH28 · CUANDO EL CRUCE TERMINA, EL LIENZO RECUPERA SU ALTO');
  await p.evaluate(() => scSetHint('Modo corto'));
  await p.waitForTimeout(450);
  const vhCorto = await p.evaluate(() => SC.vh);
  await p.evaluate(() => scSetHint('Una pista larga que a 360 px de ancho necesita dos renglones enteros en la barra de ayuda del lienzo'));
  await p.waitForTimeout(450);
  const vhLargo = await p.evaluate(() => SC.vh);
  await p.evaluate(() => scSetHint('Modo corto'));
  await p.waitForTimeout(500);
  const vhVuelta = await p.evaluate(() => SC.vh);
  cierto(vhLargo < vhCorto, 'una pista de dos renglones le quita alto al lienzo (' + vhCorto + ' → ' + vhLargo + ')');
  cierto(Math.abs(vhVuelta - vhCorto) <= 1, 'y al volver a una de un renglón lo recupera entero, ya ido el texto viejo (' + vhVuelta + '): no se queda un renglón de aire de más');

  // ── Función 32 con el dedo ────────────────────────────────────────────────
  console.log('\nFUNCIÓN 32 · EL LETRERO SE ARRASTRA Y SE AGRANDA CON EL DEDO');
  await p.evaluate(() => { document.getElementById('sc-sec-letrero').open = true; });
  await p.waitForTimeout(800);
  await limpiarAvisos(p);
  const sec = await encima('#sc-lf-alto');
  cierto(sec.abajo, 'al abrir la sección, el deslizador de alto queda sobre el pie del panel');
  cierto(await p.evaluate(() => { const p = document.getElementById('sc-lf-precio').getBoundingClientRect(), pie = document.querySelector('#scalermodal .sp-actions').getBoundingClientRect(); return p.bottom <= pie.top; }),
    'y el precio también: se ve mientras se mueve el deslizador, sin desplazar el panel');
  await cap(p, '360-claro-6-letrero');
  const L = await p.evaluate(() => { const r = document.getElementById('sc-letrero').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const antes = await p.evaluate(() => ({ nx: SC_LF.nx, ny: SC_LF.ny, tx: SC.tx, n: SC.items.length }));
  await dedo.bajar(L); await p.waitForTimeout(50);
  for (let i = 1; i <= 6; i++) { await dedo.mover({ x: L.x - i * 10, y: L.y + i * 8 }); await p.waitForTimeout(16); }
  await dedo.subir(); await p.waitForTimeout(250);
  const despues = await p.evaluate(() => ({ nx: SC_LF.nx, ny: SC_LF.ny, tx: SC.tx, n: SC.items.length, armando: SC.building }));
  cierto(despues.nx < antes.nx - .05 && despues.ny > antes.ny + .05, 'arrastrar el letrero con el dedo lo mueve en los dos ejes');
  cierto(despues.tx === antes.tx && despues.n === antes.n && !despues.armando, 'y no toca la foto de abajo: no la desplaza ni deja un punto de medida');
  const c1 = { x: 110, y: 345 }, c2 = { x: 250, y: 345 };
  await dedo.bajar(c1, c2); await p.waitForTimeout(50);
  for (let i = 1; i <= 6; i++) { await dedo.mover({ x: c1.x - i * 10, y: c1.y }, { x: c2.x + i * 10, y: c2.y }); await p.waitForTimeout(16); }
  const mid = await p.evaluate(() => ({ z: SC.z, gesto: SC.gesture, tr: document.getElementById('sc-letrero').style.transform, fs: parseFloat(getComputedStyle(document.getElementById('sc-letrero-texto')).fontSize) }));
  await dedo.subir(); await p.waitForTimeout(350);
  const fin = await p.evaluate(() => ({ z: SC.z, gesto: SC.gesture, tr: document.getElementById('sc-letrero').style.transform, fs: parseFloat(getComputedStyle(document.getElementById('sc-letrero-texto')).fontSize) }));
  cierto(mid.gesto && mid.z > 1.5 && /scale\(/.test(mid.tr), 'con el pellizco, el letrero crece con un scale de compositor (' + mid.tr.replace(/.*(scale\([^)]*\)).*/, '$1') + ')');
  cierto(Math.abs(mid.fs - antes.fs || 0) >= 0 && mid.fs < fin.fs * .8, 'sin cambiar su tamaño de letra en cada cuadro del gesto (' + mid.fs.toFixed(1) + ' px), que es lo caro');
  cierto(!fin.gesto && !/scale\(/.test(fin.tr) && fin.fs > mid.fs * 1.5, 'y al soltar recibe su tamaño de verdad (' + fin.fs.toFixed(1) + ' px) y el scale se va');
  await p.evaluate(() => scZoomReset());
  await limpiarAvisos(p);
  console.log('');
  errs.length ? mal('errores de página con el dedo: ' + [...new Set(errs)].slice(0, 3).join(' | ')) : bien('cero errores de página con el dedo');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE 3 · las ocho rondas: 360/420 × con y sin movimiento × claro y oscuro
// ════════════════════════════════════════════════════════════════════════════
console.log('\nLAS OCHO RONDAS');
const LECTOR_RONDA = `window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: new Promise(r => setTimeout(() => r({ destroy() {},
  getPage: async () => ({ getViewport: ({ scale }) => ({ width: 600 * scale, height: 400 * scale }),
    render: ({ canvasContext, viewport }) => ({ promise: new Promise(rr => setTimeout(() => { canvasContext.fillStyle = '#c9b99f'; canvasContext.fillRect(0, 0, viewport.width, viewport.height); rr(); }, 5000)) }) }) }), 100)) }) };`;
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

      /* Fase A · la referencia trazada: el riel, las medidas de siempre y la pista. */
      await montar(p, { calibrar: false, linea: true, partida: PARTIDA });
      await p.evaluate(() => document.getElementById('sc-sec-calib').scrollIntoView());
      await p.tap('#sc-ref-rapidos [role="radio"][data-v="175"]');
      await p.waitForTimeout(700);
      await limpiarAvisos(p);
      const A = await p.evaluate(() => ({
        tema: document.documentElement.getAttribute('data-tema'),
        desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        riel: document.querySelectorAll('#sc-calib-riel .riel-paso').length,
        recortado: [...document.querySelectorAll('#sc-calib-riel .riel-t')].some(t => t.scrollWidth > t.clientWidth + 1),
        chips: document.querySelectorAll('#sc-ref-rapidos [role="radio"]').length,
        altos: [...document.querySelectorAll('#sc-ref-rapidos [role="radio"]')].every(b => b.getBoundingClientRect().height >= 44),
      }));
      cierto(A.tema === tema, etq + ' · el tema es el que se pidió');
      cierto(A.desborde <= 1, etq + ' · sin desborde horizontal (' + A.desborde + ' px)');
      cierto(A.riel === 3 && !A.recortado, etq + ' · el riel enseña sus tres pasos y ninguno se corta');
      cierto(A.chips === 5 && A.altos, etq + ' · las cinco medidas de siempre miden 44 px o más');
      await contraste(p, '#sc-calib-riel [aria-current="step"] .riel-t', etq + ' · el paso actual');
      await contraste(p, '#sc-calib-riel .riel-paso[data-estado="pendiente"] .riel-t', etq + ' · un paso que falta');
      await contraste(p, '#sc-ref-rapidos [aria-checked="true"]', etq + ' · la medida elegida');
      await contraste(p, '#sc-ref-rapidos [aria-checked="false"]', etq + ' · una medida sin elegir');
      await contraste(p, '#sp-hint-bar .sp-hint-txt', etq + ' · la pista del lienzo');
      if (laDeCaptura) await cap(p, nombre('1-referencia'));

      /* Fase B · el PDF, trabajando y roto. */
      await p.evaluate(LECTOR_RONDA);
      await p.evaluate(() => { window.__pdf = scLoadPDF(new File([new Blob(['%PDF-1.4'])], 'plano.pdf', { type: 'application/pdf' })); });
      await p.waitForTimeout(700);
      await contraste(p, '#sc-overlay-pasos', etq + ' · el PDF abriendo, sobre la foto');
      const B1 = await p.evaluate(() => { const c = document.querySelector('#scalermodal .sp-overlay-tarjeta').getBoundingClientRect(), a = document.getElementById('sp-canvas-area').getBoundingClientRect(); return { dentro: c.top >= a.top - 1 && c.bottom <= a.bottom + 1 && c.left >= a.left - 1 && c.right <= a.right + 1 }; });
      cierto(B1.dentro, etq + ' · la tarjeta del PDF cabe dentro del lienzo');
      if (laDeCaptura) await cap(p, nombre('2-pdf-abriendo'));
      await p.evaluate(() => { delete window.pdfjsLib; });
      await p.route('**/cdnjs.cloudflare.com/**', r => r.abort());
      await p.evaluate(async () => { await scLoadPDF(new File([new Blob(['%PDF-1.4'])], 'plano.pdf', { type: 'application/pdf' })); });
      await p.waitForTimeout(450);
      const B2 = await p.evaluate(() => {
        const c = document.querySelector('#scalermodal .sp-overlay-tarjeta').getBoundingClientRect(), a = document.getElementById('sp-canvas-area').getBoundingClientRect();
        const btns = [...document.querySelectorAll('#sc-overlay-mal .sp-overlay-btn')].filter(b => !b.hidden);
        return { dentro: c.top >= a.top - 1 && c.bottom <= a.bottom + 1 && c.left >= a.left - 1 && c.right <= a.right + 1,
          altos: btns.every(b => b.getBoundingClientRect().height >= 44), n: btns.length,
          libres: btns.every(b => { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e); }) };
      });
      cierto(B2.dentro, etq + ' · la tarjeta del error cabe dentro del lienzo');
      cierto(B2.n === 2 && B2.altos && B2.libres, etq + ' · sus dos salidas miden 44 px o más y nada las tapa (ni los botones de zoom)');
      await contraste(p, '#scalermodal .sp-overlay-tarjeta', etq + ' · el error del PDF, sobre la foto');
      await contraste(p, '#scalermodal .sp-overlay-btn.pri', etq + ' · «Elegir otro archivo»');
      if (laDeCaptura) await cap(p, nombre('3-pdf-error'));
      cierto((await infinitas(p)).length === 0, etq + ' · con el error puesto nada se anima solo');
      await p.unroute('**/cdnjs.cloudflare.com/**');

      /* Fase C · calibrado, con medidas y con el letrero. */
      await montar(p, { partida: PARTIDA });
      await trazar(p, .1, .2, .5, .2);
      await trazar(p, .1, .3, .5, .55);
      await p.waitForTimeout(500);
      await p.evaluate(() => { document.getElementById('sc-sec-letrero').open = true; });
      await p.waitForTimeout(800);
      await limpiarAvisos(p);
      const C = await p.evaluate(() => ({
        desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        filas: document.querySelectorAll('#sc-medidas-list .sp-mfila').length,
        letrero: !document.getElementById('sc-letrero').hidden,
        salto: document.getElementById('sc-mcount').classList.contains('sc-cuenta-salta'),
        cruce: !!document.querySelector('#sp-hint-bar .rotulo-sale'),
      }));
      cierto(C.desborde <= 1, etq + ' · con medidas y letrero, sin desborde horizontal (' + C.desborde + ' px)');
      cierto(C.filas === 2 && C.letrero, etq + ' · la lista y el letrero se pintan');
      if (movimiento === 'reduce') {
        cierto(!C.cruce && !(await p.evaluate(() => !!document.querySelector('.lista-entra, .ficha-viaja'))), etq + ' · con menos movimiento no hay cruce, ni entrada, ni ficha que viaje');
        cierto(await p.evaluate(() => { SC_ESQ.hasta = 0; scEsqCambia(1); return SC_ESQ.raf === 0 && scEsqNivel() === 1; }), etq + ' · las esquinas de la lupa saltan a su sitio sin pedir un solo cuadro');
        cierto(await p.evaluate(() => { const b = document.querySelector('.sp-mitem-add'); return !!b; }), etq + ' · la información sigue: la lista trae sus botones');
        await p.evaluate(() => { SC_ESQ.hasta = 0; SC_ESQ.desde = 0; });
      }
      await contraste(p, '#sc-lf-precio', etq + ' · el precio del letrero');
      await p.evaluate(() => { scLetreroAlto(8); });
      await contraste(p, '#sc-lf-precio', etq + ' · el aviso de menos de 10 cm (ámbar)');
      await p.evaluate(() => { scLetreroAlto(45); });
      await contraste(p, '#sc-lf-dice', etq + ' · lo que dice el letrero de sí mismo');
      await contraste(p, '#sc-letrero-nota', etq + ' · «Letrero ilustrativo»');
      /* Los botones que flotan sobre la foto son blancos en los dos temas: su icono no puede
         seguir al tema, o de noche era un «+» casi blanco sobre blanco. */
      await contraste(p, '#sp-zoom button:first-child', etq + ' · el «+» del zoom');
      await contraste(p, '#sc-btn-cotas', etq + ' · el ojo de las cotas');
      await contraste(p, '#sc-medidas-list .sp-mfila:last-child .sp-mitem', etq + ' · la tarjeta de una medida');
      await p.evaluate(() => { scUsarMedida(SC.items[0].id); });
      await p.waitForTimeout(500);
      await limpiarAvisos(p);
      await contraste(p, '.sp-mitem-add.done', etq + ' · «Agregada» con su palomita');
      /* La lupa, con su cifra, a la vista. */
      await p.evaluate(`(() => { const ev = ${EV}; const r = document.getElementById('scalerCanvas').getBoundingClientRect(); scSetMeasMode('libre'); scDown(ev(r.left + 90, r.top + 60)); SC.sp = { x: .2 * SC.cvsW, y: .3 * SC.cvsH }; SC.cp = { x: .6 * SC.cvsW, y: .3 * SC.cvsH }; scLoupe(ev(r.left + 90, r.top + 130)); })()`);
      await contraste(p, '#sc-loupe-cifra', etq + ' · la cifra de la lupa');
      await p.evaluate(`(() => { const ev = ${EV}; scUp(ev(10, 10)); scCancelarPunto(); })()`);
      await p.waitForTimeout(300);
      if (laDeCaptura) { await p.evaluate(() => document.getElementById('sc-sec-letrero').scrollIntoView()); await p.waitForTimeout(300); await cap(p, nombre('4-letrero')); }
      cierto((await infinitas(p)).length === 0, etq + ' · nada se mueve solo en reposo');
      cierto(errs.length === 0, etq + ' · cero errores de página' + (errs.length ? ': ' + errs[0] : ''));
      await ctx.close();
    }
  }
}

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl escalador dice lo que mide, dónde se pega y cuánto cuesta el letrero en la fachada.');
await nav.close();
process.exit(fallos ? 1 : 0);
