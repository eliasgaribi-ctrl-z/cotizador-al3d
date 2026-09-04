/* Cuánto se enseña de las cotas del escalador.
 *
 * Medir tres o cuatro elementos de la misma fachada llena la foto de cotas, y a partir de la
 * tercera estorban justo donde hay que trazar la siguiente: el número de una queda encima del
 * borde que se está apuntando y sus líneas de extensión cruzan el elemento de al lado. Hasta
 * ahora no había manera de bajarles el volumen — o estaban todas, o había que borrar medidas que
 * costaron su trabajo—. El mando nuevo tiene tres modos (todas · la elegida · ninguna), un ojo
 * en el lienzo y un selector en el panel.
 *
 * Lo que se prueba aquí es lo que se rompe en silencio, que es de lo que trata pruebas/:
 *
 *   · Lo que sale del escalador —la imagen que se descarga y la que se le manda a la IA— tiene
 *     que llevar SIEMPRE todas las cotas. Es el único punto donde esto se puede colar sin que
 *     nadie lo vea: la pantalla se ve bien, el PDF sale sin medidas y quien lo descubre es el
 *     cliente. Se mide dibujando la exportación en un lienzo aparte y contando tinta.
 *   · Un extremo que no se ve no se puede agarrar. Si no, con las cotas apagadas el toque para
 *     empezar una medida nueva se lo come el extremo invisible de otra, y lo que se ve es una
 *     foto que no reacciona.
 *   · Una medida trazada con las cotas apagadas se guarda igual, y se dice — si no, se lee como
 *     que la app dejó de funcionar.
 *   · Una foto nueva no hereda «ninguna»: empezaría a medir sin ver nada.
 *
 * Uso:  PUERTO=8814 node pruebas/navegador/escalador-cotas.mjs
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 950 }, locale: 'es-MX' });
const p = await ctx.newPage();
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, m) => c ? bien(m) : mal(m);
const errs = []; p.on('pageerror', e => errs.push(e.message));

await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
await p.waitForTimeout(1200);

/* Una fachada de mentira: un rectángulo que medir y otro que sirve de referencia. */
const foto = await p.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1200, 800);
  g.fillStyle = '#333'; g.fillRect(100, 100, 400, 100); g.fillRect(700, 300, 200, 400);
  return c.toDataURL('image/png');
});
await p.evaluate(async src => { abrirScaler(); await new Promise(r => scLoadImgSrc(src, 'fachada.png', r)); }, foto);
await p.waitForTimeout(600);
/* Calibrado contra el rectángulo alto (400 px de foto = 200 cm) y tres medidas trazadas por el
   mismo camino que un dedo: scCommitLine es donde termina cada medida. */
await p.evaluate(() => {
  SC.refLine = { nx1: 700 / 1200, ny1: 300 / 800, nx2: 700 / 1200, ny2: 700 / 800 };
  SC.mode = 'ref-drawn';
  document.getElementById('sc-ref-cm-input').value = '200';
  scConfirmCalib();
  const L = (a, b, c, d) => { scSetMeasMode('libre'); scCommitLine({ x: a * SC.cvsW, y: b * SC.cvsH }, { x: c * SC.cvsW, y: d * SC.cvsH }); };
  L(100 / 1200, 100 / 800, 500 / 1200, 100 / 800);
  L(100 / 1200, 100 / 800, 100 / 1200, 200 / 800);
  L(700 / 1200, 300 / 800, 900 / 1200, 300 / 800);
});
await p.waitForTimeout(400);
cierto(await p.evaluate(() => SC.items.length === 3), 'de partida: tres medidas trazadas sobre la foto');

// ── 1. El ojo del lienzo ───────────────────────────────────────────────────
console.log('\nEL OJO DEL LIENZO');
cierto(await p.locator('#sc-cotas-fab').isVisible(), 'con más de una medida el ojo aparece en el lienzo');
const ciclo = [];
for (let i = 0; i < 3; i++) {
  await p.click('#sc-btn-cotas');
  await p.waitForTimeout(120);
  ciclo.push(await p.evaluate(() => ({ modo: SC.cotas, pista: document.getElementById('sp-hint-bar').textContent.trim() })));
}
cierto(ciclo[0].modo === 'foco' && ciclo[1].modo === 'ninguna' && ciclo[2].modo === 'todas',
  'cada toque pasa al siguiente modo y vuelve al principio: ' + ciclo.map(c => c.modo).join(' → '));
cierto(ciclo.every(c => /^Cotas:/.test(c.pista)),
  'y cada uno dice en qué quedó: «' + ciclo[1].pista + '»');

// ── 2. El mismo interruptor, visto desde el panel ──────────────────────────
console.log('\nEL SELECTOR DEL PANEL Y EL OJO SON EL MISMO INTERRUPTOR');
await p.click('#sc-cotas-ninguna');
await p.waitForTimeout(150);
cierto(await p.evaluate(() => SC.cotas === 'ninguna'), 'el panel apaga las cotas');
cierto(await p.evaluate(() => document.getElementById('sc-btn-cotas').classList.contains('off')),
  'y el ojo del lienzo se pone tachado');
cierto(await p.evaluate(() => /cotas ocultas/.test(scModeHint())),
  'la pista del modo lo recuerda mientras dure');

// ── 3. Lo que no se ve no se agarra ────────────────────────────────────────
console.log('\nLO QUE NO SE VE NO SE AGARRA');
const agarre = await p.evaluate(() => {
  const m = SC.items[0], r = document.getElementById('scalerCanvas').getBoundingClientRect();
  const x = (m.nx1 * SC.cvsW - (SC.cvsW / 2 - SC.tx / SC.z)) * SC.z + SC.vw / 2 + r.left;
  const y = (m.ny1 * SC.cvsH - (SC.cvsH / 2 - SC.ty / SC.z)) * SC.z + SC.vh / 2 + r.top;
  const ev = t => document.getElementById('scalerCanvas').dispatchEvent(
    new MouseEvent(t, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
  ev('mousedown'); const apagadas = !!SC.dragH; ev('mouseup');
  /* Ese toque dejó un primer punto puesto, y con una medida a medias el escalador no busca
     extremos a propósito: se quita antes de probar el otro lado. */
  scCancelarPunto();
  scSetCotas('todas', false);
  ev('mousedown'); const encendidas = !!SC.dragH; ev('mouseup');
  scCancelarPunto();
  return { apagadas, encendidas };
});
cierto(!agarre.apagadas, 'con las cotas apagadas, tocar donde había un extremo no lo agarra');
cierto(agarre.encendidas, 'y encendidas se agarra igual que siempre');

// ── 4. Medir con las cotas apagadas ────────────────────────────────────────
console.log('\nMEDIR CON LAS COTAS APAGADAS');
const aviso = await p.evaluate(() => {
  scSetCotas('ninguna', false);
  scSetMeasMode('libre');
  scCommitLine({ x: .2 * SC.cvsW, y: .6 * SC.cvsH }, { x: .6 * SC.cvsW, y: .6 * SC.cvsH });
  const t = document.getElementById('toast');
  return { n: SC.items.length, texto: t.textContent.trim(), boton: !!t.querySelector('.toast-act') };
});
cierto(aviso.n === 4, 'la medida se guarda igual');
cierto(/cotas están ocultas/.test(aviso.texto), 'y se avisa de que no se va a ver');
cierto(aviso.boton, 'con el botón para volver a enseñarlas');
await p.click('#toast .toast-act');
await p.waitForTimeout(150);
cierto(await p.evaluate(() => SC.cotas === 'todas'), 'que las enciende de vuelta');

// ── 5. Lo que sale del escalador ───────────────────────────────────────────
console.log('\nLO QUE SALE DEL ESCALADOR LLEVA SIEMPRE TODAS LAS COTAS');
const tinta = await p.evaluate(() => {
  /* La misma llamada que hacen scExportImg, scImagenParaIA y la miniatura: sin `vista`. */
  const medir = () => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 400;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 400);
    scDrawDims(g, 600, 400, { s: 2 });
    const d = g.getImageData(0, 0, 600, 400).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) n++;
    return n;
  };
  scSetCotas('todas', false); const conTodas = medir();
  scSetCotas('ninguna', false); const conNinguna = medir();
  scSetCotas('foco', false); const conFoco = medir();
  return { conTodas, conNinguna, conFoco };
});
cierto(tinta.conTodas > 1000, 'la imagen que se descarga dibuja las cotas (' + tinta.conTodas + ' px de tinta)');
cierto(tinta.conNinguna === tinta.conTodas, 'con las cotas apagadas dibuja exactamente lo mismo');
cierto(tinta.conFoco === tinta.conTodas, 'y con solo la elegida en pantalla, también');

// ── 6. Una foto nueva empieza enseñando ────────────────────────────────────
console.log('\nAL CARGAR OTRA FOTO LAS COTAS VUELVEN');
await p.evaluate(async src => {
  scSetCotas('ninguna', false);
  window.confirm = () => true;   // sí, borra las medidas de la foto anterior
  await new Promise(r => scLoadImgSrc(src, 'otra.png', r));
}, foto);
await p.waitForTimeout(400);
cierto(await p.evaluate(() => SC.cotas === 'todas'), 'una foto nueva no hereda «ninguna»');
cierto(await p.evaluate(() => getComputedStyle(document.getElementById('sc-cotas-fab')).display === 'none'),
  'y sin medidas que estorben, el ojo se retira');

console.log('');
errs.length ? mal('errores de página: ' + [...new Set(errs)].slice(0, 3).join(' | '))
            : bien('cero errores de página');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nLas cotas se pueden bajar de volumen sin perder ninguna medida.');
await nav.close();
process.exit(fallos ? 1 : 0);
