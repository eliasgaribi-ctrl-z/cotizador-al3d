/* EL ANIDADOR CON EL MOTOR NUEVO (SPARROW), DE VERDAD, EN LA PÁGINA.
 *
 * Elías (17/10/2026): «quiero que me optimices bien los espacios… que todo sea a fondo». El motor
 * de omisión es sparrow compilado a WebAssembly (js/motor-sparrow*.js y motor/). La traducción y
 * el motor en node ya los prueba pruebas/anidador-sparrow.mjs; aquí, lo que solo se ve en la página:
 *
 *   1. Que ARRANQUE: el Worker de módulo carga motor/<simd|nosimd>/sparrow_web.js, su .wasm y su
 *      carpeta snippets/ (si falta un archivo, el Worker da «Failed to fetch dynamically imported
 *      module» y la mesa nunca se llena), y la CSP deja compilar el WebAssembly.
 *   2. Que el acomodo llegue a la MESA como el del motor viejo —una figura por hoja, un <g> por
 *      pieza, con sus huecos— y que la mesa (la que rechaza lo que se encima al mover a mano) no
 *      encuentre ninguna pieza encimada, a menos de la separación ni fuera de la orilla.
 *   3. La SEPARACIÓN medida en el DXF, con las curvas finas (0.05 mm): ningún contorno a menos de
 *      lo pedido de otro, ni de la orilla. Las curvas le llegan al motor enderezadas a 0.3 mm, y
 *      por eso se le pide la separación con 0.6 mm de más (js/app.js, iniciarSparrow).
 *   4. Que se pare solo al tiempo pedido, que «Detener» se quede con lo mejor, y que el marcador
 *      diga el aprovechamiento de lo gastado y el retazo.
 *   5. LA VETA: con aluminio, todas las piezas a 0° o 180° EN LA HOJA (la tira del motor entra
 *      girada 90° a la hoja parada; ver S.entrada).
 *   6. VARIAS HOJAS: el % de cada hoja sale de la misma cuenta que el marcador.
 *
 * El tiempo se acorta con window.__anidadorSegundos = 10 (lo menos que acepta el motor).
 *
 * Necesita navegador y servidor:  PUERTO=8919 node pruebas/navegador/an-sparrow.mjs
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const URL_AN = B + '/anidador-vectores/';
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const cierto = (cond, que, extra) => cond ? bien(que) : mal(que, extra);

/* Siete piezas de letrero: dos «L», una «O» con hueco, un círculo, dos tiras largas y un
   rectángulo. 400 × 300 mm de dibujo; se acomodan en una hoja de 600 × 900 con 4 mm. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="300mm" viewBox="0 0 400 300">
  <path d="M10 10h40v120h60v40h-100z"/>
  <path d="M130 10h40v120h60v40h-100z"/>
  <path fill-rule="evenodd" d="M260 10h80v80h-80zM280 30h40v40h-40z"/>
  <circle cx="60" cy="230" r="40"/>
  <rect x="120" y="200" width="250" height="30"/>
  <rect x="120" y="240" width="250" height="30"/>
  <rect x="260" y="110" width="60" height="70"/>
</svg>`;
const ANCHO = 600, ALTO = 900, SEP = 4;

async function abrir(segundos) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-MX', serviceWorkers: 'block' });
  await ctx.addInitScript(s => { window.__anidadorSegundos = s; }, segundos);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('consola: ' + m.text()); });
  await p.goto(URL_AN, { waitUntil: 'load' });
  await p.waitForFunction(() => window.Anidador && !document.getElementById('an-arranque'));
  await p.evaluate(s => window.Anidador.cargarTexto(s, 'letrero.svg'), SVG);
  await p.fill('#an-ancho', String(ANCHO)); await p.fill('#an-alto', String(ALTO)); await p.fill('#an-sep', String(SEP));
  return { ctx, p, errs };
}
const estado = p => p.evaluate(() => window.Anidador.estado());
const texto = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/ /g, ' ').trim() : null; }, sel);
async function esperar(p, cond, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await cond()) return true; await p.waitForTimeout(250); }
  return false;
}
/* Las polilíneas de un DXF R12, con sus vértices. */
function polilineas(dxf) {
  const l = dxf.split('\r\n'), polis = [];
  let cur = null, v = null;
  for (let i = 0; i + 1 < l.length; i += 2) {
    const c = l[i].trim(), x = l[i + 1];
    if (c === '0') {
      v = null;
      if (x === 'POLYLINE') polis.push(cur = { capa: null, cerrada: false, pts: [] });
      else if (x === 'VERTEX' && cur) cur.pts.push(v = { x: 0, y: 0 });
      else if (x === 'SEQEND') cur = null;
    } else if (cur && !v && c === '8') cur.capa = x;
    else if (cur && !v && c === '70') cur.cerrada = x.trim() === '1';
    else if (v && c === '10') v.x = Number(x);
    else if (v && c === '20') v.y = Number(x);
  }
  return polis;
}
const dseg = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
const dentro = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };

// ═══ 1-4 · ACOMODA, SE PARA SOLO Y LO QUE SALE ═══════════════════════════════════════════════
console.log('\nSPARROW EN LA PÁGINA: ACOMODA, SE PARA SOLO Y LO QUE SALE');
{
  const { ctx, p, errs } = await abrir(10);
  cierto(await p.evaluate(() => !!(window.AnidadorSparrowMesa && window.AnidadorSparrowMesa.disponible())), 'el motor nuevo está disponible en este navegador (Web Workers de módulo y WebAssembly)');
  await p.evaluate(() => window.Anidador.iniciar());
  let e = await estado(p);
  cierto(e.motor === 'sparrow' && e.corriendo, 'arrancó con sparrow', { motor: e.motor, corriendo: e.corriendo });
  cierto(/^Buscando el acomodo que gaste menos material/.test(await texto(p, '#an-msg')), 'y dice qué hace: «' + await texto(p, '#an-msg') + '»');
  cierto(/faltan 0:\d\d/.test(await texto(p, '#an-paro-t') || ''), 'el reloj dice cuánto falta: «' + await texto(p, '#an-paro-t') + '»');
  const llego = await esperar(p, async () => !!(await estado(p)).mejor, 30000);
  cierto(llego, 'llegó un acomodo a la mesa mientras busca (el Worker, el .wasm y snippets/ cargaron)', errs);
  const paro = await esperar(p, async () => !(await estado(p)).corriendo, 40000);
  e = await estado(p);
  cierto(paro && e.detenidoSolo, 'se detuvo solo al tiempo pedido', { corriendo: e.corriendo, detenidoSolo: e.detenidoSolo });
  cierto(e.mejor && e.mejor.colocadas === 7 && e.mejor.total === 7 && e.mejor.hojas === 1, 'las 7 piezas en una hoja', e.mejor);
  cierto(/^Listo: el acomodo más apretado/.test(await texto(p, '#an-msg')), 'el mensaje del final: «' + await texto(p, '#an-msg') + '»');
  cierto(await p.evaluate(() => document.getElementById('an-seguir').hidden), 'sin «Seguir buscando» (el motor nuevo no retoma: se vuelve a acomodar con más tiempo)');

  /* La mesa: una figura, siete <g>, el hueco de la «O» marcado, y nada encimado según la mesa. */
  const m = await p.evaluate(() => {
    const gs = [...document.querySelectorAll('#an-res .an-hoja>svg>g[id]')];
    return { figs: document.querySelectorAll('#an-res figure.an-hoja').length, n: gs.length, huecos: gs.filter(g => g.querySelector('.hole')).length,
             noCaben: gs.map(g => [g.id, window.Anidador.mesa.cabe(g.id)]).filter(c => c[1] !== ''),
             giros: gs.map(g => { const t = /rotate\(([-\d.e]+)/.exec(g.getAttribute('transform') || ''); return t ? Number(t[1]) : 0; }) };
  });
  cierto(m.figs === 1 && m.n === 7, 'en la mesa: una hoja y siete piezas', m);
  cierto(m.huecos === 1, 'el hueco de la «O» viaja con su pieza, marcado como hueco', m.huecos);
  cierto(m.noCaben.length === 0, 'la mesa no encuentra ninguna pieza encimada, a menos de ' + SEP + ' mm ni fuera de la orilla', m.noCaben);
  cierto(m.giros.some(r => Math.abs(((r % 90) + 90) % 90) > 0.5), 'con giro libre hay piezas a ángulos que no son de 90° (' + m.giros.map(r => Math.round(r)).join('°, ') + '°)', m.giros);

  /* El marcador: aprovechamiento de lo gastado y el retazo que queda. */
  const busca = [await texto(p, '#an-st-int-k'), await texto(p, '#an-st-int')];
  cierto(busca.join(' ') === 'Busca 10 s', 'la ficha de los intentos dice cuánto buscó: «' + busca.join(' ') + '» (sparrow no cuenta intentos)', busca);
  const sobra = await texto(p, '#an-st-sobra'), mm = await p.evaluate(() => window.Anidador.mesa().sobrante);
  cierto(mm && mm.w >= 100 && mm.h >= 100 && /\d/.test(sobra || ''), 'y la del retazo, el rectángulo libre más grande que dejó: «' + sobra + '»', mm);
  cierto(e.areaUsada > 0 && e.areaUsada < ANCHO * ALTO && e.mejor.eficiencia > 0.2 && e.mejor.eficiencia <= 1,
    'el aprovechamiento es de lo gastado (' + Math.round(e.mejor.eficiencia * 100) + ' % de ' + Math.round(e.areaUsada / 100) / 100 + ' dm²), no de la hoja entera', { ef: e.mejor.eficiencia, areaUsada: e.areaUsada });

  /* El DXF, con las curvas finas: cada contorno cerrado, y la separación medida de verdad. */
  const dxf = await p.evaluate(() => window.Anidador.armarDxf(null));
  const polis = polilineas(dxf), piezas = polis.filter(q => q.capa === 'HOJA-1');
  cierto(piezas.length === 8 && polis.every(q => q.cerrada), 'el DXF: 8 polilíneas cerradas (7 piezas y el hueco de la «O»)', polis.map(q => [q.capa, q.cerrada, q.pts.length]));
  /* Cada hueco va con la pieza que lo rodea; entre piezas distintas se mide la distancia. */
  const duena = piezas.map((q, i) => piezas.findIndex((o, j) => j !== i && q.pts.every(v => dentro(v, o.pts))));
  let minD = Infinity, orilla = Infinity;
  for (let i = 0; i < piezas.length; i++) {
    for (const v of piezas[i].pts) orilla = Math.min(orilla, v.x, v.y, ANCHO - v.x, ALTO - v.y);
    for (let j = i + 1; j < piezas.length; j++) {
      if (duena[i] === j || duena[j] === i) continue;
      for (const [P, Q] of [[piezas[i].pts, piezas[j].pts], [piezas[j].pts, piezas[i].pts]])
        for (const v of P) for (let k = 0; k < Q.length; k++) minD = Math.min(minD, dseg(v, Q[k], Q[(k + 1) % Q.length]));
    }
  }
  cierto(minD >= SEP - 0.02, 'en el archivo de corte, ninguna pieza a menos de ' + SEP + ' mm de otra: la más cercana a ' + minD.toFixed(2) + ' mm', minD);
  cierto(orilla >= SEP / 2 - 0.02, 'ni de la orilla: la más cercana a ' + orilla.toFixed(2) + ' mm', orilla);
  cierto(errs.length === 0, 'sin errores de página ni de consola', errs);
  await ctx.close();
}

// ═══ 5 · LA VETA ════════════════════════════════════════════════════════════════════════════
console.log('\nCON VETA: TODAS A 0° O 180° EN LA HOJA');
{
  const { ctx, p, errs } = await abrir(10);
  await p.click('#an-mats [data-mat="aluminio"]');
  await p.click('.an-pregunta-veta [data-veta="si"]');
  cierto(await p.inputValue('#an-rot') === '2', 'aluminio con veta: giros de 0° y 180°');
  await p.evaluate(() => window.Anidador.iniciar());
  await esperar(p, async () => { const e = await estado(p); return e.mejor && !e.corriendo; }, 45000);
  const e = await estado(p);
  const r = await p.evaluate(() => [...document.querySelectorAll('#an-res .an-hoja>svg>g[id]')].map(g => {
    const t = /rotate\(([-\d.e]+)/.exec(g.getAttribute('transform') || ''); return { r: t ? Number(t[1]) : 0, girada: g.classList.contains('girada') };
  }));
  const a180 = x => { const m = ((x % 180) + 180) % 180; return Math.min(m, 180 - m); };
  cierto(e.mejor && e.mejor.colocadas === 7 && r.length === 7, 'las 7 piezas acomodadas', e.mejor);
  cierto(r.every(x => a180(x.r) < 0.01), 'todas a 0° o 180° en la hoja, con la veta (' + r.map(x => Math.round(x.r)).join('°, ') + '°)', r);
  cierto(r.every(x => !x.girada), 'ninguna rayada como atravesada a la veta');
  const noCaben = await p.evaluate(() => [...document.querySelectorAll('#an-res .an-hoja>svg>g[id]')].map(g => window.Anidador.mesa.cabe(g.id)).filter(c => c !== ''));
  cierto(noCaben.length === 0, 'y nada encimado', noCaben);
  cierto(errs.length === 0, 'sin errores de página ni de consola', errs);
  await ctx.close();
}

// ═══ 6 · VARIAS HOJAS: EL % DE CADA UNA CUADRA CON EL MARCADOR ════════════════════════════════
console.log('\nVARIAS HOJAS: EL % DE CADA UNA CUADRA CON EL MARCADOR');
{
  /* En 200 × 300 las 7 no caben en una. Las hojas llenas cuentan entera su superficie; la última,
     solo el rectángulo que usó (lo demás es retazo). Ponderado así, el % de cada hoja da el del
     marcador. */
  const { ctx, p, errs } = await abrir(10);
  await p.fill('#an-ancho', '200'); await p.fill('#an-alto', '300');
  await p.evaluate(() => window.Anidador.iniciar());
  await esperar(p, async () => { const e = await estado(p); return e.mejor && !e.corriendo; }, 120000);
  const e = await estado(p);
  const pcts = await p.evaluate(() => [...document.querySelectorAll('#an-res .an-cap-pct')].map(x => parseInt(x.textContent, 10)));
  cierto(e.mejor && e.mejor.hojas >= 2 && e.mejor.colocadas === 7, 'en 200 × 300 no caben en una: ' + (e.mejor && e.mejor.hojas) + ' hojas, con las 7 piezas', e.mejor);
  const H = 200 * 300, n = pcts.length, ultima = e.areaUsada - (n - 1) * H;
  const ponderado = n ? (pcts.slice(0, -1).reduce((s, x) => s + x * H, 0) + pcts[n - 1] * ultima) / e.areaUsada : NaN;
  cierto(e.mejor && n === e.mejor.hojas && pcts.every(x => x > 0 && x <= 100) && Math.abs(ponderado - e.mejor.eficiencia * 100) <= 1.5,
    'cada hoja dice su % (' + pcts.join(' %, ') + ' %) y, ponderados, dan el del marcador (' + ponderado.toFixed(1) + ' contra ' + (e.mejor && (e.mejor.eficiencia * 100).toFixed(1)) + ')',
    { pcts, ef: e.mejor && e.mejor.eficiencia, areaUsada: e.areaUsada });
  cierto(errs.length === 0, 'sin errores de página ni de consola', errs);
  await ctx.close();
}

// ═══ «DETENER» SE QUEDA CON LO MEJOR ═════════════════════════════════════════════════════════
console.log('\n«DETENER» SE QUEDA CON EL MEJOR ACOMODO QUE LLEVA');
{
  const { ctx, p, errs } = await abrir(120);
  await p.evaluate(() => window.Anidador.iniciar());
  cierto(/faltan (2:00|1:5\d)$/.test(await texto(p, '#an-paro-t') || ''), 'con 2 minutos el reloj empieza en «faltan 2:00» (y nunca dice «1:60»): «' + await texto(p, '#an-paro-t') + '»');
  await esperar(p, async () => !!(await estado(p)).mejor, 30000);
  const antes = await estado(p);
  const t0 = Date.now();
  await p.evaluate(() => window.Anidador.detener());
  const e = await estado(p);
  cierto(!e.corriendo && !e.detenidoSolo && Date.now() - t0 < 2000, 'se detiene en el acto, mucho antes de los 2 minutos');
  cierto(e.mejor && e.mejor.colocadas === antes.mejor.colocadas, 'y se queda con el acomodo que llevaba (' + (e.mejor && e.mejor.colocadas) + ' piezas)', e.mejor);
  cierto(/^Detenido: quedó el mejor acomodo/.test(await texto(p, '#an-msg')), 'lo dice: «' + await texto(p, '#an-msg') + '»');
  cierto(await p.evaluate(() => !document.getElementById('an-dl').disabled), 'y queda listo para descargar');
  /* Lo que el motor mande después de detenido ya no mueve la mesa. */
  const huella = await p.evaluate(() => [...document.querySelectorAll('#an-res .an-hoja>svg>g[id]')].map(g => g.getAttribute('transform')).join('|'));
  await p.waitForTimeout(2000);
  cierto(huella === await p.evaluate(() => [...document.querySelectorAll('#an-res .an-hoja>svg>g[id]')].map(g => g.getAttribute('transform')).join('|')), 'detenido, nada que llegue tarde mueve las piezas');
  cierto(errs.length === 0, 'sin errores de página ni de consola', errs);
  await ctx.close();
}

await nav.close();
console.log('');
if (fallos) { console.log(fallos + ' fallo(s).'); process.exit(1); }
console.log('Todo bien.');
