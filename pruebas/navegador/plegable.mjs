/* EL GALAXY Z FOLD, EN SUS TRES ESTADOS. Con Chromium de verdad.

   El Fold es el teléfono de la oficina y tiene tres formas que un iPhone no tiene: la portada
   (344-384 px, alta y angosta), la pantalla interna abierta del todo (una tableta táctil de
   ~825 × 960) y las dos posturas a medio doblar, en las que Chrome parte el visor en dos
   segmentos con la bisagra en medio —de libro (bisagra vertical) y de mesa, lo que Samsung
   llama Flex mode (bisagra horizontal)—. Y pasa de una a otra SIN recargar: doblarlo es un
   resize, y todo lo que se midió al cargar deja de valer.

   Lo que se prueba es lo que no se puede revisar mirando una sola captura:

   · Que en la portada la barra fija del cotizador —el total y la acción principal— quede A LA
     VISTA, encima de la barra de módulos de la plataforma. Medido antes del arreglo: quedaba
     58 de sus 64 px debajo de ella, y solo aparecía desplazando la página de afuera hasta el
     fondo, cosa que nadie sabe que hay que hacer.
   · Que al abrir y cerrar el teléfono el marco se vuelva a medir y nada desborde a lo ancho.
   · Que acostado (960 px) el cotizador empotrado gane sus dos columnas: a sangre el marco
     mide 792 px, y esa banda es la del diseño «Fold abierto».
   · Que de mesa, con el escalador abierto, el lienzo se quede en la mitad de arriba y la
     barra y el panel bajen a la mitad de la mesa: la bisagra no parte la foto.
   · Que de libro, en el cotizador suelto, la columna de las partidas termine en la bisagra y
     la del dinero empiece después de ella.

   Los segmentos se emulan con el protocolo de DevTools (Emulation.setDeviceMetricsOverride
   con displayFeature), que es lo mismo que hace la pestaña «dual screen» del inspector. Es
   la única forma de probar esto sin un Fold en la mano.

   Necesita navegador y un servidor, así que va en pruebas/navegador/ y no en
   pruebas/correr.sh, que es de node puro:

     pruebas/correr.sh --navegador

   o a mano:

     python3 -m http.server 8814 &
     PUERTO=8814 node pruebas/navegador/plegable.mjs
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const ok = (que, v, detalle) => v ? bien(que) : mal(que + (detalle ? ' — ' + detalle : ''));

/* Un contexto por tamaño de pantalla, siempre táctil: lo que se mide aquí es un teléfono. */
async function pantalla(w, h, dpr) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr || 2.5,
    isMobile: true, hasTouch: true, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  return { ctx, p, errs };
}
/* Partir el visor con una bisagra. `null` la quita. Coordenadas en píxeles CSS. */
async function bisagra(ctx, p, w, h, dpr, feature) {
  const cdp = await ctx.newCDPSession(p);
  const params = { width: w, height: h, deviceScaleFactor: dpr || 2.5, mobile: true };
  if (feature) params.displayFeature = feature;
  await cdp.send('Emulation.setDeviceMetricsOverride', params);
  try { await cdp.send('Emulation.setDevicePostureOverride', { posture: { type: feature ? 'folded' : 'continuous' } }); } catch (_) {}
  await p.waitForTimeout(500);
  return cdp;
}
/* El cotizador empotrado, con un cliente y dos partidas capturadas. */
async function cotizadorConDatos(p) {
  await p.goto(B + '/#/cotizador', { waitUntil: 'load' });
  const marco = await p.waitForSelector('#pf-cot-marco', { timeout: 15000 });
  const f = await marco.contentFrame();
  await f.waitForSelector('#pasos', { timeout: 15000 });
  await f.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await f.fill('#f-cli', 'Farmacia San Juan');
  await f.fill('#f-tel', '33 1234 5678');
  await f.fill('#f-proy', 'Letrero de fachada');
  await f.evaluate(() => { irAPantalla('partidas'); agregarPartida(); agregarPartida(); });
  await p.waitForTimeout(700);
  return f;
}
/* Dónde queda el marco y dónde su barra fija, en píxeles del visor DE AFUERA. */
const medidas = async (p) => p.evaluate(() => {
  const m = document.getElementById('pf-cot-marco'); const r = m.getBoundingClientRect();
  const nav = document.getElementById('pf-abajo'); const nr = nav ? nav.getBoundingClientRect() : null;
  const navVisible = !!(nav && getComputedStyle(nav).display !== 'none');
  const d = m.contentDocument; const mb = d && d.querySelector('.mbar'); const mr = mb ? mb.getBoundingClientRect() : null;
  const wrap = d && d.querySelector('.wrap');
  const cols = wrap ? getComputedStyle(wrap).gridTemplateColumns.split(' ').filter(x => x && x !== 'none').length : 0;
  return {
    vw: innerWidth, vh: innerHeight, docScroll: document.documentElement.scrollHeight,
    desbordeAfuera: document.documentElement.scrollWidth - innerWidth,
    desbordeAdentro: d ? d.documentElement.scrollWidth - m.clientWidth : 0,
    marco: { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
    nav: navVisible ? { top: nr.top, height: nr.height } : null,
    mbar: (mb && getComputedStyle(mb).display !== 'none') ? { top: r.top + mr.top, bottom: r.top + mr.bottom } : null,
    columnas: cols,
  };
});

/* ---------------------------------------------------------------------------------------- */
console.log('\n── La portada, y la barra fija que quedaba escondida ──');
{
  const { ctx, p, errs } = await pantalla(344, 748, 2.8);
  await cotizadorConDatos(p);
  let m = await medidas(p);
  ok('la barra de módulos está a la vista en la portada', !!m.nav);
  ok('el marco termina donde empieza la barra de módulos (' + Math.round(m.marco.bottom) + ' ≤ ' + (m.nav ? Math.round(m.nav.top) : '?') + ')',
     m.nav && m.marco.bottom <= m.nav.top + 1);
  ok('la barra fija del cotizador se ve ENTERA sin desplazar nada (' + (m.mbar ? Math.round(m.mbar.bottom) : '?') + ' ≤ ' + (m.nav ? Math.round(m.nav.top) : '?') + ')',
     m.mbar && m.nav && m.mbar.bottom <= m.nav.top + 1 && m.mbar.top >= 0);
  ok('la página de afuera no tiene nada que desplazar hacia abajo (' + m.docScroll + ' ≤ ' + m.vh + ')', m.docScroll <= m.vh + 1);
  ok('el marco va a sangre: mide lo que la pantalla (' + Math.round(m.marco.width) + ' de ' + m.vw + ')', Math.round(m.marco.width) === m.vw);
  ok('nada desborda a lo ancho, ni afuera ni adentro', m.desbordeAfuera <= 0 && m.desbordeAdentro <= 0,
     'afuera ' + m.desbordeAfuera + ' · adentro ' + m.desbordeAdentro);

  console.log('\n── Se abre: la pantalla interna, de pie ──');
  await p.setViewportSize({ width: 825, height: 960 });
  await p.waitForTimeout(700);
  m = await medidas(p);
  ok('la barra de módulos se apaga y manda la lateral', !m.nav);
  ok('el marco se volvió a medir: llega hasta abajo (' + Math.round(m.marco.bottom) + ' de ' + m.vh + ')',
     m.marco.bottom >= m.vh - 12 && m.marco.bottom <= m.vh + 1);
  ok('nada desborda a lo ancho', m.desbordeAfuera <= 0 && m.desbordeAdentro <= 0,
     'afuera ' + m.desbordeAfuera + ' · adentro ' + m.desbordeAdentro);

  console.log('\n── Se acuesta: 960 px, y el cotizador gana su columna del dinero ──');
  await p.setViewportSize({ width: 960, height: 825 });
  await p.waitForTimeout(700);
  m = await medidas(p);
  ok('el marco mide ≥ 760 px (' + Math.round(m.marco.width) + '): la banda de dos columnas', m.marco.width >= 760);
  ok('y adentro hay dos columnas —partidas y dinero—, no una', m.columnas === 2, 'columnas: ' + m.columnas);
  ok('sin barra fija: el total ya está al lado', !m.mbar);
  ok('nada desborda a lo ancho', m.desbordeAfuera <= 0 && m.desbordeAdentro <= 0,
     'afuera ' + m.desbordeAfuera + ' · adentro ' + m.desbordeAdentro);

  console.log('\n── Se vuelve a cerrar: todo regresa ──');
  await p.setViewportSize({ width: 344, height: 748 });
  await p.waitForTimeout(700);
  m = await medidas(p);
  ok('la barra fija del cotizador vuelve a verse entera encima de la de módulos',
     m.mbar && m.nav && m.mbar.bottom <= m.nav.top + 1 && m.mbar.top >= 0);
  ok('una sola columna otra vez', m.columnas === 1, 'columnas: ' + m.columnas);
  ok('sin errores de JavaScript en el camino', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------------------------------- */
console.log('\n── De mesa (Flex mode): el escalador reparte lienzo arriba y controles abajo ──');
{
  const W = 960, H = 825, DPR = 2.25;
  const { ctx, p, errs } = await pantalla(W, H, DPR);
  const f = await cotizadorConDatos(p);
  /* La bisagra a media pantalla, horizontal: la mitad de arriba de pie, la de abajo en la mesa. */
  const cdp = await bisagra(ctx, p, W, H, DPR, { orientation: 'horizontal', offset: 412, maskLength: 1 });
  await p.evaluate(() => window.dispatchEvent(new Event('resize')));
  await p.waitForTimeout(600);
  const seg = await p.evaluate(() => ({
    dos: matchMedia('(vertical-viewport-segments: 2)').matches,
    segs: window.viewport && window.viewport.segments ? window.viewport.segments.length : 0,
  }));
  ok('Chromium reporta dos segmentos verticales (emulación de DevTools)', seg.dos && seg.segs === 2, JSON.stringify(seg));

  await f.evaluate(() => abrirScaler());
  await p.waitForTimeout(600);
  const r = await f.evaluate(() => {
    const h = document.documentElement;
    const st = h.style;
    const rect = id => { const e = document.getElementById(id) || document.querySelector(id); const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height }; };
    return {
      clase: h.classList.contains('pliegue-h'), a: parseFloat(st.getPropertyValue('--pliegue-a')), b: parseFloat(st.getPropertyValue('--pliegue-b')),
      lienzo: rect('sp-canvas-area'), barra: rect('#scalermodal .sp-topbar'), panel: rect('#scalermodal .sp-side'),
      alto: innerHeight,
    };
  });
  const marcoTop = (await medidas(p)).marco.top;
  ok('el cotizador empotrado recibió la bisagra del padre en SUS coordenadas (a=' + r.a + ', esperado ≈ ' + Math.round(412 - marcoTop) + ')',
     r.clase && Math.abs(r.a - (412 - marcoTop)) <= 2);
  ok('el lienzo termina en la bisagra (' + Math.round(r.lienzo.bottom) + ' ≈ ' + r.a + ')', Math.abs(r.lienzo.bottom - r.a) <= 2);
  ok('la barra de herramientas bajó a la mitad de la mesa', r.barra.top >= r.b - 1, 'barra en ' + Math.round(r.barra.top));
  ok('y el panel de medidas debajo de ella, hasta el fondo', r.panel.top >= r.barra.bottom - 1 && r.panel.bottom >= r.alto - 2,
     'panel ' + Math.round(r.panel.top) + '–' + Math.round(r.panel.bottom) + ' de ' + r.alto);

  /* Se abre del todo: la bisagra desaparece y el escalador vuelve a su reparto normal. */
  await bisagra(ctx, p, W, H, DPR, null);
  await p.evaluate(() => window.dispatchEvent(new Event('resize')));
  await p.waitForTimeout(600);
  const plano = await f.evaluate(() => ({
    clase: document.documentElement.classList.contains('pliegue-h'),
    barraArriba: document.querySelector('#scalermodal .sp-topbar').getBoundingClientRect().top < 40,
  }));
  ok('abierto del todo, la clase se quita y la barra vuelve arriba', !plano.clase && plano.barraArriba);
  ok('sin errores de JavaScript', errs.length === 0, errs.join(' | '));
  await cdp.detach().catch(() => {});
  await ctx.close();
}

/* ---------------------------------------------------------------------------------------- */
console.log('\n── De libro: el cotizador suelto acomoda una columna en cada mitad ──');
{
  const W = 825, H = 960, DPR = 2.25;
  const { ctx, p, errs } = await pantalla(W, H, DPR);
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.fill('#f-cli', 'Farmacia San Juan');
  await p.fill('#f-tel', '33 1234 5678');
  await p.fill('#f-proy', 'Letrero de fachada');
  await p.evaluate(() => { irAPantalla('partidas'); agregarPartida(); });
  await p.waitForTimeout(500);
  const cdp = await bisagra(ctx, p, W, H, DPR, { orientation: 'vertical', offset: 412, maskLength: 1 });
  await p.evaluate(() => window.dispatchEvent(new Event('resize')));
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const h = document.documentElement;
    const main = document.querySelector('.wrap > main').getBoundingClientRect();
    const aside = document.querySelector('.wrap > aside').getBoundingClientRect();
    return { clase: h.classList.contains('pliegue-v'), a: parseFloat(h.style.getPropertyValue('--pliegue-a')),
             b: parseFloat(h.style.getPropertyValue('--pliegue-b')), mainDer: main.right, asideIzq: aside.left,
             desborde: h.scrollWidth - innerWidth };
  });
  ok('el documento suelto lee la bisagra por sí mismo (a=' + r.a + ')', r.clase && Math.abs(r.a - 412) <= 2);
  ok('las partidas terminan en la bisagra (' + Math.round(r.mainDer) + ' ≤ ' + r.a + ')', r.mainDer <= r.a + 1 && r.mainDer >= r.a - 30);
  ok('y el dinero empieza después de ella (' + Math.round(r.asideIzq) + ' ≥ ' + r.b + ')', r.asideIzq >= r.b - 1);
  ok('sin desborde a lo ancho', r.desborde <= 0, 'desborde ' + r.desborde);
  await bisagra(ctx, p, W, H, DPR, null);
  await p.evaluate(() => window.dispatchEvent(new Event('resize')));
  await p.waitForTimeout(500);
  const plano = await p.evaluate(() => document.documentElement.classList.contains('pliegue-v'));
  ok('abierto del todo, vuelve el reparto normal', !plano);
  ok('sin errores de JavaScript', errs.length === 0, errs.join(' | '));
  await cdp.detach().catch(() => {});
  await ctx.close();
}

await nav.close();
console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\nEl Fold pasa en sus tres estados.');
process.exit(fallos ? 1 : 0);
