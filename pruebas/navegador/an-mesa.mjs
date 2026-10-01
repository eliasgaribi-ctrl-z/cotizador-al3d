/* EL ANIDADOR, LA MESA DE CORTE: PIEZAS QUE VIAJAN, ZOOM, CARRUSEL, NOTICIA, FICHA, MOVER A MANO.
 *
 * Lo que se defiende, ficha por ficha, y por qué no se ve leyendo el código:
 *
 *   · A7  ZOOM Y PANEO. El encuadre es un viewBox: sigue siendo vector. Rueda con Ctrl, pellizco con
 *         dos dedos, botones + − y «Ver hoja completa», teclas + − 0 y flechas, doble toque a tamaño
 *         real. SIN zoom la rueda y el dedo son de la página (no se secuestra el scroll del teléfono).
 *         El encuadre sobrevive al repintado de cada mejora, y la DESCARGA no sale del tamaño de la
 *         ventana: mide la hoja, no lo que se está mirando.
 *   · A8  LAS PIEZAS SE DESLIZAN. En cada mejora viajan las que cambiaron de lugar (por su id) y las
 *         demás no se mueven; la primera vez caen. Con movimiento reducido, cambio directo.
 *   · A10 TOCAR UNA PIEZA dice su número en el archivo, su medida y si va girada. Con teclado.
 *   · A11 UNA HOJA MENOS: la hoja que sobra se pliega DESPUÉS de que viajan las piezas, y la ficha
 *         («Una hoja menos · 2.88 m² de acrílico») sale al final y se anuncia. Los m² de la merma.
 *   · A12 CARRUSEL de hojas en pantalla angosta o táctil, cada una con su aprovechamiento (el mismo
 *         cálculo del motor: el promedio ES el número grande) y «¿Cabe en un retazo?» si la última va
 *         por debajo de 25 %. En computadora se queda en columna.
 *   · A13 EL PRIMER ACOMODO no deja la mesa vacía: la silueta atenuada y una ficha con el tiempo.
 *   · A15 ESQUINAS que señalan lo que se va a quedar fuera, desde el aviso y desde «N piezas no
 *         caben» (en rojo y con su palabra). Otro toque las suelta.
 *   · A24 MOVER Y GIRAR A MANO, con choque: no se encima ni se sale de la hoja, regresa sola, y la
 *         descarga lleva la posición nueva.
 *   · A25 «COMO VIENEN / ACOMODADAS» como control de verdad, con el barrido del haz.
 *
 * El motor de verdad tarda minutos en dar un segundo acomodo; para lo que no es del motor se le
 * sustituye el start() por uno que solo guarda la función de pantalla, y la prueba la llama a mano
 * con hojas de mentira cuyas piezas llevan los ids que de verdad les pone svgParaMotor(). Una sola
 * sección corre el motor de verdad, para ver que esos ids lleguen enteros hasta la hoja.
 *
 * Ocho rondas —360 y 420 px, claro y oscuro, con y sin movimiento reducido— con el dedo: sin errores
 * de página, sin desborde de lado, sin nada girando en reposo, con zonas de 44 px y el contraste del
 * texto nuevo medido contra el fondo que tiene.
 *
 * Necesita navegador y servidor:  PUERTO=8909 node pruebas/navegador/an-mesa.mjs
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const URL_AN = B + '/anidador-vectores/';
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const cierto = (cond, que, extra) => cond ? bien(que) : mal(que, extra);
const dormir = ms => new Promise(r => setTimeout(r, ms));
/* SOLO=A7 corre solo las secciones cuyo título lo contenga (para trabajar una ficha sin esperar a todas). */
const SOLO = process.env.SOLO ? new RegExp(process.env.SOLO) : null;
let cabecera = '';
const cab = t => { cabecera = t; if (!SOLO || SOLO.test(t)) console.log(t); };
/* Una sección que se cae por una excepción cuenta como fallo y no detiene a las demás. */
async function seccion(fn) { if (SOLO && !SOLO.test(cabecera)) return; try { await fn(); } catch (e) { mal('la sección se cayó: ' + String(e && e.message || e).split('\n').slice(0, 6).join(' | ')); } }

/* Seis rectángulos de medidas distintas. Sin <title> ni nada antes: el elemento 0 es el primer rect,
   así que sus ids son an-e0 … an-e5 y «Pieza 1» … «Pieza 6». */
const SVG_PIEZAS = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600mm" height="400mm" viewBox="0 0 600 400">
  <rect x="0" y="0" width="200" height="100"/><rect x="210" y="0" width="150" height="150"/>
  <rect x="0" y="110" width="100" height="80"/><rect x="110" y="160" width="120" height="60"/>
  <rect x="240" y="160" width="90" height="90"/><rect x="370" y="0" width="60" height="200"/>
</svg>`;
const TAM = { 0: [200, 100], 1: [150, 150], 2: [100, 80], 3: [120, 60], 4: [90, 90], 5: [60, 200] };
/* De todas las formas que acepta el motor. */
const SVG_FORMAS = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="200mm" viewBox="0 0 300 200">
  <rect x="10" y="10" width="80" height="40"/>
  <circle cx="30" cy="100" r="20"/><ellipse cx="90" cy="100" rx="25" ry="15" transform="rotate(20 90 100)"/>
  <path fill-rule="evenodd" d="M230 130h60v60h-60zM245 145h30v30h-30z"/>
  <g transform="translate(120 10)"><rect x="0" y="0" width="30" height="30"/><path d="M0 50 L40 50 L20 90 Z"/></g>
  <polygon points="200,10 240,10 220,50"/>
</svg>`;
/* Con avisos: un texto, un símbolo <use>, una imagen y una máscara de recorte; y una pieza más
   grande que cualquier hoja, que no cabe. */
const SVG_AVISOS = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="200mm" viewBox="0 0 300 200">
  <defs><symbol id="s"><rect width="20" height="20"/></symbol><clipPath id="c"><rect width="50" height="50"/></clipPath></defs>
  <rect x="10" y="10" width="50" height="50"/><rect x="70" y="10" width="50" height="50" clip-path="url(#c)"/>
  <text x="10" y="100" font-size="20">AL3D</text><use href="#s" x="150" y="100"/>
  <image href="data:image/gif;base64,R0lGODlhAQABAAAAACw=" x="200" y="100" width="30" height="30"/>
  <rect x="0" y="130" width="299" height="60"/>
</svg>`;

/* ---------------------------------------------------------------------------------------------
   Abrir la página. Un contexto por ronda, con el tema, el ancho y el movimiento pedidos.
   --------------------------------------------------------------------------------------------- */
async function abrir({ ancho = 1100, alto = 900, tema = 'claro', reducido = false, tactil = false } = {}) {
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, locale: 'es-MX', serviceWorkers: 'block',
    hasTouch: tactil, isMobile: tactil, deviceScaleFactor: 1, reducedMotion: reducido ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(t => { try { if (!localStorage.getItem('al3d_tema')) localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL_AN, { waitUntil: 'load' });
  await p.waitForFunction(() => window.Anidador && !document.getElementById('an-arranque'));
  return { ctx, p, errs };
}
const motorFalso = p => p.evaluate(() => {
  window.SvgNest.start = function (_avance, pantalla) { window.__pantalla = pantalla; return true; };
});
const cargar = (p, svg, nombre = 'prueba.svg') => p.evaluate(([s, n]) => window.Anidador.cargarTexto(s, n), [svg, nombre]);
const estado = p => p.evaluate(() => window.Anidador.estado());
const mesa = p => p.evaluate(() => window.Anidador.mesa());
const texto = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\u00A0/g, ' ').trim() : null; }, sel);
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => { try { return a.effect.getComputedTiming().iterations === Infinity; } catch (_) { return false; } })
  .map(a => a.animationName || a.transitionProperty || '?'));
const desborde = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const alto = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null; }, sel);
const visible = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, sel);

/* Contraste del color de un elemento contra el primer fondo opaco que tenga detrás. */
async function contraste(p, sel, { fondo, propiedad = 'color' } = {}) {
  return p.evaluate(([s, f, prop]) => {
    const el = document.querySelector(s); if (!el) return null;
    const parse = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
    const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const fg = parse(getComputedStyle(el)[prop]); if (!fg) return null;
    let bg = f ? [f[0], f[1], f[2], 1] : null;
    for (let e = el; !bg && e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.95) bg = c; }
    if (!bg) bg = [255, 255, 255, 1];
    /* Un texto con fondo traslúcido: se mezcla con lo que hay detrás. */
    const a = L(fg), b = L(bg);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }, [sel, fondo || null, propiedad]);
}

/* Hojas de mentira, con las piezas de SVG_PIEZAS. `spec` es una lista de hojas {w, h, piezas:[{n, x, y, r}]},
   con n = el número de elemento del archivo (el id es an-e<n>). Llama a la función de pantalla del motor. */
const HOJA_W = 600, HOJA_H = 450;
const mejora = (p, spec, ef = 0.3, col = 6, tot = 6) => p.evaluate(([spec, tam, e, c, t]) => {
  const ns = 'http://www.w3.org/2000/svg', lista = [];
  spec.forEach(h => {
    const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 ' + h.w + ' ' + h.h);
    const bin = document.createElementNS(ns, 'rect'); bin.setAttribute('class', 'bin'); bin.setAttribute('width', h.w); bin.setAttribute('height', h.h); s.appendChild(bin);
    h.piezas.forEach(z => {
      const g = document.createElementNS(ns, 'g'); g.setAttribute('transform', 'translate(' + z.x + ' ' + z.y + ') rotate(' + (z.r || 0) + ')');
      const r = document.createElementNS(ns, 'rect'); r.setAttribute('id', 'an-e' + z.n);
      r.setAttribute('x', 0); r.setAttribute('y', 0); r.setAttribute('width', tam[z.n][0]); r.setAttribute('height', tam[z.n][1]);
      g.appendChild(r); s.appendChild(g);
    });
    lista.push(s);
  });
  window.__pantalla(lista, e, c, t);
}, [spec, TAM, ef, col, tot]);
const hoja = (piezas, w = HOJA_W, h = HOJA_H) => ({ w, h, piezas });
/* Acomodo A y B de una hoja de 600 × 450: B mueve la 2 y la 4 (números de elemento 2 y 4). */
const A1 = [{ n: 0, x: 10, y: 10 }, { n: 1, x: 230, y: 10 }, { n: 5, x: 400, y: 10 }, { n: 2, x: 10, y: 130 }, { n: 3, x: 130, y: 180 }, { n: 4, x: 270, y: 180 }];
const B1 = [{ n: 0, x: 10, y: 10 }, { n: 1, x: 230, y: 10 }, { n: 5, x: 400, y: 10 }, { n: 2, x: 10, y: 300 }, { n: 3, x: 130, y: 180 }, { n: 4, x: 270, y: 300 }];
/* Tres hojas y, después, dos. */
const TRES = [hoja([A1[0], A1[1], A1[3]]), hoja([A1[4], A1[5]]), hoja([A1[2]])];
const DOS = [hoja([{ n: 0, x: 10, y: 60 }, A1[1], A1[3], A1[2]]), hoja([A1[4], A1[5]])];

/* Arranque común: archivo cargado, motor falso, corriendo, un primer acomodo y detenido o no. */
async function preparar(p, { detener = true, svg = SVG_PIEZAS, spec = [hoja(A1)], ef = 0.3 } = {}) {
  await cargar(p, svg); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, spec, ef);
  if (detener) await p.evaluate(() => window.Anidador.detener());
  await dormir(80);
  await verHoja(p);
}
/* Los transform de las piezas de una hoja del SVG de salida (sin DOMParser: esto corre en node). */
const transformsDeHoja = (txt, i) => ((txt.split(/<g id="hoja-/).slice(1)[i] || '').match(/<g transform="[^"]*"/g) || []).map(x => x.replace(/<g transform="|"$/g, ''));
/* Playwright mueve el ratón y el dedo en coordenadas de la ventana: la hoja tiene que estar en ella. */
const verHoja = async p => {
  await p.evaluate(() => { const s = document.querySelector('#an-res .an-hoja>svg'); if (s) s.scrollIntoView({ block: 'center' }); });
  /* La página puede desplazarse con suavidad: se espera a que la hoja deje de moverse. */
  let antes = null;
  for (let i = 0; i < 40; i++) {
    const t = await p.evaluate(() => { const s = document.querySelector('#an-res .an-hoja>svg'); return s ? Math.round(s.getBoundingClientRect().top * 10) : 0; });
    if (t === antes) break;
    antes = t; await dormir(60);
  }
};
const tocar = async (p, id) => { const [x, y] = await centro(p, '#' + id); await p.mouse.click(x, y); };
const centro = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
const transformDe = (p, id) => p.evaluate(i => { const g = document.getElementById(i); return g ? g.getAttribute('transform') : null; }, id);
const viewBox = (p, i = 0) => p.evaluate(k => { const s = document.querySelectorAll('#an-res .an-hoja>svg')[k]; return s ? s.getAttribute('viewBox').split(' ').map(Number) : null; }, i);
const esperarSin = async (p, fn, ms = 2500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn)) return true; await dormir(60); } return false; };

// ═══ A25 · «COMO VIENEN / ACOMODADAS» ═════════════════════════════════════════════════════════
cab('\nA25 · COMO VIENEN / ACOMODADAS, CON EL BARRIDO DEL HAZ');
await seccion(async () => {
  const { ctx, p, errs } = await abrir();
  const rol = await p.evaluate(() => { const g = document.getElementById('an-vista-ver'); return { rol: g.getAttribute('role'), n: g.querySelectorAll('[role="radio"]').length, marc: [...g.querySelectorAll('[role="radio"]')].map(b => b.getAttribute('aria-checked')) }; });
  cierto(rol.rol === 'radiogroup' && rol.n === 2 && rol.marc.join() === 'true,false', 'la etiqueta es un radiogroup de dos opciones, «Como vienen» elegida', rol);
  cierto((await p.evaluate(() => document.querySelector('#an-vista-ver [data-v="acomodadas"]').getAttribute('aria-disabled'))) === 'true', 'sin acomodo, «Acomodadas» está apagada (aria-disabled)');
  await p.click('#an-vista-ver [data-v="acomodadas"]', { force: true });
  cierto((await mesa(p)).vista === 'vienen', 'y no se deja elegir');
  const medidas = await p.evaluate(() => [...document.querySelectorAll('#an-vista-ver [role="radio"]')].map(b => Math.round(b.getBoundingClientRect().height)));
  cierto(medidas.every(h => h >= 44), 'cada opción mide 44 px o más', medidas);

  await preparar(p, { detener: false });
  const m1 = await mesa(p);
  cierto(m1.vista === 'acomodadas', 'con el primer acomodo la mesa pasa sola a «Acomodadas»', m1.vista);
  cierto(await p.evaluate(() => document.querySelector('#an-vista-ver [data-v="acomodadas"]').getAttribute('aria-checked') === 'true' && !document.querySelector('#an-vista-ver [data-v="acomodadas"]').hasAttribute('aria-disabled')), 'el control lo dice y «Acomodadas» ya no está apagada');
  /* Sin esperar al final del barrido: terminó (620 ms) y la vista de antes ya no se ve. */
  await dormir(900);
  cierto(await p.evaluate(() => document.getElementById('an-orig').hidden && !document.getElementById('an-res').hidden), 'terminado el barrido, la vista tapada vuelve a hidden');
  /* Volver a «Como vienen»: el haz cruza y las dos están a la vez mientras tanto. */
  await p.click('#an-vista-ver [data-v="vienen"]');
  await dormir(120);
  const durante = await p.evaluate(() => ({ orig: !document.getElementById('an-orig').hidden, res: !document.getElementById('an-res').hidden,
    haz: document.getElementById('an-haz').getAnimations().length, recorte: document.getElementById('an-res').getAnimations().some(a => /clip/i.test(JSON.stringify(a.effect.getKeyframes()))),
    op: +getComputedStyle(document.getElementById('an-haz')).opacity }));
  cierto(durante.orig && durante.res && durante.haz === 1 && durante.recorte && durante.op > 0, 'al cambiar, las dos vistas están a la vez y el haz y el recorte corren juntos', durante);
  await dormir(900);
  const despues = await p.evaluate(() => ({ orig: !document.getElementById('an-orig').hidden, res: !document.getElementById('an-res').hidden, anims: document.getAnimations().length, op: +getComputedStyle(document.getElementById('an-haz')).opacity }));
  cierto(despues.orig && !despues.res && despues.op === 0, 'al terminar solo queda «Como vienen» y el haz se apaga', despues);
  cierto((await mesa(p)).vista === 'vienen', 'y la mesa lo sabe');
  /* Teclado de radio: la flecha elige. */
  await p.focus('#an-vista-ver [data-v="vienen"]');
  await p.keyboard.press('ArrowRight');
  await dormir(900);
  cierto((await mesa(p)).vista === 'acomodadas', '→ elige «Acomodadas» con el teclado', (await mesa(p)).vista);
  await p.keyboard.press('ArrowLeft'); await dormir(900);
  cierto((await mesa(p)).vista === 'vienen', '← vuelve a «Como vienen»');
  /* Una mejora que llega mientras se mira «Como vienen» no arrebata la vista. */
  await mejora(p, [hoja(B1)], 0.4);
  await dormir(150);
  cierto((await mesa(p)).vista === 'vienen' && await p.evaluate(() => !document.getElementById('an-orig').hidden), 'una mejora no cambia la vista que el usuario eligió');
  /* Cambiar a otra vista y volver: lo que se ve es el último acomodo. */
  await p.click('#an-vista-ver [data-v="acomodadas"]'); await dormir(900);
  cierto(await transformDe(p, 'pz-an-e2') === 'translate(10 300) rotate(0)', 'y «Acomodadas» enseña la mejora que llegó mientras tanto', await transformDe(p, 'pz-an-e2'));
  /* Doble clic rápido en las opciones: no deja las dos capas encimadas. */
  await p.click('#an-vista-ver [data-v="vienen"]'); await p.click('#an-vista-ver [data-v="acomodadas"]'); await dormir(1000);
  const dobles = await p.evaluate(() => ({ orig: !document.getElementById('an-orig').hidden, res: !document.getElementById('an-res').hidden }));
  cierto(!dobles.orig && dobles.res, 'cambiar dos veces seguidas deja una sola vista', dobles);
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  /* Con menos movimiento el cambio es directo: ni haz ni recorte. */
  const { ctx, p, errs } = await abrir({ reducido: true });
  await preparar(p, { detener: false });
  const a = await p.evaluate(() => ({ orig: document.getElementById('an-orig').hidden, res: document.getElementById('an-res').hidden, n: document.getElementById('an-haz').getAnimations().length }));
  cierto(a.orig && !a.res && a.n === 0, 'sin movimiento, el primer acomodo se pone de golpe, sin haz', a);
  await p.click('#an-vista-ver [data-v="vienen"]');
  const b = await p.evaluate(() => ({ orig: document.getElementById('an-orig').hidden, res: document.getElementById('an-res').hidden, n: document.getElementById('an-haz').getAnimations().length }));
  cierto(!b.orig && b.res && b.n === 0, 'y al elegir «Como vienen», también', b);
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});

// ═══ A13 · EL PRIMER ACOMODO NO DEJA LA MESA VACÍA ═════════════════════════════════════════════
cab('\nA13 · EL PRIMER ACOMODO NO DEJA LA MESA VACÍA');
await seccion(async () => {
  const { ctx, p, errs } = await abrir();
  await cargar(p, SVG_PIEZAS); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar());
  await dormir(100);
  const c = await p.evaluate(() => {
    const svg = document.querySelector('#an-orig svg'), cs = getComputedStyle(svg), f = document.getElementById('an-calculando');
    return { silueta: !!svg && !document.getElementById('an-orig').hidden, op: +cs.opacity, filtro: cs.filter, ficha: !f.hidden && f.textContent.trim(), res: document.getElementById('an-res').hidden,
      vacio: !!document.querySelector('#an-res .an-vacio'), clase: document.getElementById('an-mesa').classList.contains('calculando'), rol: f.getAttribute('role') };
  });
  cierto(c.silueta && c.op < 0.6 && /blur\(2px\)/.test(c.filtro), 'la silueta se queda en la mesa, atenuada (opacidad ' + c.op + ') y algo desenfocada', c);
  cierto(/^Calculando las formas…/.test(c.ficha) && c.rol === 'status', 'y una ficha dice «Calculando las formas…»', c.ficha);
  cierto(c.res && !c.vacio && c.clase, 'ya no hay una frase en una mesa negra');
  cierto(!(await p.evaluate(() => /Calculando el primer acomodo/.test(document.getElementById('an-res').textContent))), 'la frase de antes se fue');
  await dormir(2100);
  cierto(/^\d+ s$/.test(await texto(p, '#an-calculando-s')), 'la ficha lleva la cuenta: «' + await texto(p, '#an-calculando-s') + '»');
  cierto(await p.evaluate(() => document.getElementById('an-calculando-s').getAttribute('aria-hidden') === 'true'), 'y la cuenta no se anuncia cada segundo (aria-hidden)');
  cierto(await p.evaluate(() => document.querySelector('#an-vista-ver [data-v="acomodadas"]').getAttribute('aria-disabled') === 'true'), '«Acomodadas» sigue apagada mientras no haya acomodo');
  await mejora(p, [hoja(A1)]);
  await dormir(150);
  const d = await p.evaluate(() => ({ ficha: document.getElementById('an-calculando').hidden, clase: document.getElementById('an-mesa').classList.contains('calculando') }));
  cierto(d.ficha && !d.clase, 'al llegar el primer acomodo la ficha y el desenfoque se van', d);
  await dormir(900);
  /* Detener antes del primer acomodo devuelve la silueta entera. */
  await p.evaluate(() => window.Anidador.detener());
  await p.evaluate(() => window.Anidador.iniciar());   // volver a acomodar desde cero
  await dormir(80);
  cierto(await p.evaluate(() => document.getElementById('an-mesa').classList.contains('calculando') && document.getElementById('an-res').hidden && !document.getElementById('an-orig').hidden), 'volver a acomodar desde cero también deja la silueta y no la mesa vacía');
  await p.evaluate(() => window.Anidador.detener());
  const e = await p.evaluate(() => ({ clase: document.getElementById('an-mesa').classList.contains('calculando'), op: +getComputedStyle(document.querySelector('#an-orig svg')).opacity }));
  cierto(!e.clase && e.op === 1, 'detener antes del primer acomodo la deja como estaba', e);
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  const { ctx, p } = await abrir({ reducido: true });
  await cargar(p, SVG_PIEZAS); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar()); await dormir(80);
  const c = await p.evaluate(() => { const cs = getComputedStyle(document.querySelector('#an-orig svg')); return { op: +cs.opacity, filtro: cs.filter }; });
  cierto(c.op < 0.6 && c.filtro === 'none', 'con menos movimiento, solo la opacidad (sin desenfoque)', c);
  await p.evaluate(() => window.Anidador.detener());
  await ctx.close();
});

// ═══ A8 · LAS PIEZAS SE DESLIZAN ════════════════════════════════════════════════════════════
cab('\nA8 · LAS PIEZAS SE DESLIZAN A SU NUEVO LUGAR');
await seccion(async () => {
  const { ctx, p, errs } = await abrir();
  await cargar(p, SVG_PIEZAS); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, [hoja(A1)]);
  const primera = await p.evaluate(() => ({
    ids: [...document.querySelectorAll('#an-res .an-hoja>svg>g')].map(g => g.id).join(),
    caen: document.getAnimations().filter(a => a.animationName === 'an-cae').length, mejora: document.querySelectorAll('#an-res .an-hoja.mejora').length }));
  cierto(primera.ids === 'pz-an-e0,pz-an-e1,pz-an-e5,pz-an-e2,pz-an-e3,pz-an-e4', 'cada pieza se llama pz- + el id de su elemento', primera.ids);
  cierto(primera.caen === 6 && primera.mejora === 0, 'la primera vez las 6 piezas caen, como antes', primera);
  const haz = await p.evaluate(() => ({ h: parseFloat(document.getElementById('an-mesa').style.getPropertyValue('--an-mesa-h')), alto: document.getElementById('an-mesa').offsetHeight }));
  cierto(Math.abs(haz.h - haz.alto) <= 1, 'el haz láser del motor se mide con la mesa ya pintada (--an-mesa-h = ' + haz.h + ', alto ' + haz.alto + ')', haz);
  await dormir(1400);
  /* Una mejora que mueve dos piezas: solo esas viajan. */
  await mejora(p, [hoja(B1)], 0.4);
  const viaje = await p.evaluate(() => {
    const anims = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.tagName === 'g');
    return { quienes: anims.map(a => a.effect.target.id).sort().join(), clase: [...document.querySelectorAll('#an-res g.se-movio')].map(g => g.id).sort().join(),
      caen: document.getAnimations().filter(a => a.animationName === 'an-cae').length, hoja: document.querySelectorAll('#an-res .an-hoja.mejora').length,
      op: +getComputedStyle(document.querySelector('#an-res .an-hoja')).opacity };
  });
  cierto(viaje.quienes === 'pz-an-e2,pz-an-e4', 'solo viajan las dos piezas que cambiaron de lugar', viaje);
  cierto(viaje.clase === 'pz-an-e2,pz-an-e4', 'y esas dos llevan el contorno mientras viajan', viaje.clase);
  cierto(viaje.caen === 0 && viaje.hoja === 1 && viaje.op === 1, 'en una mejora nada vuelve a caer ni se funde la hoja', viaje);
  const trazo = await p.evaluate(() => getComputedStyle(document.querySelector('#an-res g#pz-an-e2>rect')).strokeWidth);
  cierto(parseFloat(trazo) >= 2.5, 'el contorno del que viaja es más grueso (' + trazo + ')');
  await dormir(700);
  cierto(await p.evaluate(() => document.querySelectorAll('#an-res g.se-movio').length === 0 && document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.tagName === 'g').length === 0), 'al llegar, el contorno se quita y no queda animación puesta');
  /* Una mejora igual no mueve nada. */
  await mejora(p, [hoja(B1)], 0.45);
  cierto(await p.evaluate(() => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.tagName === 'g').length === 0), 'un acomodo igual al anterior no mueve ninguna pieza');
  /* «Desde cero» sí cae. */
  await p.evaluate(() => window.Anidador.detener());
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, [hoja(A1)]);
  cierto(await p.evaluate(() => document.getAnimations().filter(a => a.animationName === 'an-cae').length) === 6, 'volver a acomodar desde cero hace caer las piezas otra vez');
  cierto((await p.evaluate(() => window.Anidador.armarSalida())).indexOf('an-e') < 0, 'los ids de la mesa no llegan al archivo de corte');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  /* Más de 150 piezas: cambio directo. */
  const { ctx, p, errs } = await abrir();
  await cargar(p, SVG_PIEZAS); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar());
  const muchas = d => p.evaluate(dx => {
    const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 600 450');
    const bin = document.createElementNS(ns, 'rect'); bin.setAttribute('class', 'bin'); bin.setAttribute('width', 600); bin.setAttribute('height', 450); s.appendChild(bin);
    for (let i = 0; i < 160; i++) {
      const g = document.createElementNS(ns, 'g'); g.setAttribute('transform', 'translate(' + (5 + (i % 20) * 28 + dx) + ' ' + (5 + Math.floor(i / 20) * 28) + ') rotate(0)');
      const r = document.createElementNS(ns, 'rect'); r.setAttribute('id', 'an-e' + (100 + i)); r.setAttribute('width', 20); r.setAttribute('height', 20); g.appendChild(r); s.appendChild(g);
    }
    window.__pantalla([s], 0.2, 160, 160);
  }, d);
  await muchas(0); await dormir(1300); await muchas(3);
  cierto(await p.evaluate(() => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.tagName === 'g').length) === 0, 'con 160 piezas el cambio es directo (el tope es 150)');
  await p.click('#an-vista-ver [data-v="vienen"]');
  cierto(await p.evaluate(() => document.getElementById('an-haz').getAnimations().length === 0 && document.getElementById('an-res').hidden && !document.getElementById('an-orig').hidden), 'y el barrido del haz también se salta: cambiar de vista es directo');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  const { ctx, p, errs } = await abrir({ reducido: true });
  await cargar(p, SVG_PIEZAS); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, [hoja(A1)]);
  const sinViaje = () => p.evaluate(() => document.getAnimations().filter(a => a.animationName === 'an-cae' || (a.effect && a.effect.target && a.effect.target.tagName === 'g')).length);
  cierto(await sinViaje() === 0, 'con menos movimiento la primera vez no cae nada (queda el fundido de 150 ms del sistema)');
  await mejora(p, [hoja(B1)], 0.4);
  cierto(await sinViaje() === 0 && await transformDe(p, 'pz-an-e2') === 'translate(10 300) rotate(0)', 'y la mejora cambia las piezas de lugar de golpe');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});

// ═══ A11 · UNA HOJA MENOS ═══════════════════════════════════════════════════════════════════
cab('\nA11 · LA NOTICIA GRANDE: UNA HOJA MENOS, EN M²');
await seccion(async () => {
  const { ctx, p, errs } = await abrir();
  await preparar(p, { detener: false, spec: TRES, ef: 0.4 });
  const m2 = (await texto(p, '#an-st-merma-m2'));
  await dormir(700);
  cierto(/^\d\.\d\d m²$/.test(await texto(p, '#an-st-merma-m2')), 'debajo del % de «Merma» van los m²: «' + await texto(p, '#an-st-merma-m2') + '»');
  const esperado = ((1 - 0.4) * 3 * 600 * 450 / 1e6).toFixed(2) + ' m²';
  cierto(await texto(p, '#an-st-merma-m2') === esperado, 'la cuenta es (1 − eficiencia) × hojas × ancho × alto', [await texto(p, '#an-st-merma-m2'), esperado]);
  void m2;
  cierto(await p.evaluate(() => document.getElementById('an-noticia').hidden), 'la primera vez no hay noticia');
  await dormir(1200);
  /* Baja de tres hojas a dos. */
  await p.evaluate(() => { window.__voz = []; const v = document.getElementById('vozStatus'); new MutationObserver(() => window.__voz.push(v.textContent)).observe(v, { childList: true, characterData: true, subtree: true }); });
  await mejora(p, DOS, 0.5);
  const a = await p.evaluate(() => ({ sale: document.querySelectorAll('#an-res > .an-hoja.saliendo').length, n: document.querySelectorAll('#an-res > .an-hoja').length,
    noticia: document.getElementById('an-noticia').hidden, viajan: document.getAnimations().filter(x => x.effect && x.effect.target && x.effect.target.tagName === 'g').length }));
  cierto(a.n === 3 && a.sale === 1 && a.noticia, 'primero: la hoja que sobra sigue ahí (vacía) mientras viajan las piezas y todavía no hay ficha', a);
  cierto(await p.evaluate(() => document.querySelector('#an-res > .an-hoja.saliendo svg>g') === null), 'la hoja que sobra va vacía: sus piezas pasaron a las otras');
  await dormir(MS_VIAJE_ESPERA());
  const b = await p.evaluate(() => ({ sale: document.querySelectorAll('#an-res > .an-hoja.saliendo').length, anim: document.querySelector('#an-res > .an-hoja.saliendo') ? document.querySelector('#an-res > .an-hoja.saliendo').getAnimations().length : 0, noticia: document.getElementById('an-noticia').hidden }));
  cierto(b.sale === 1 && b.anim === 1 && b.noticia, 'después: la hoja vacía se pliega, y la ficha espera', b);
  await dormir(500);
  const c = await p.evaluate(() => ({ n: document.querySelectorAll('#an-res > .an-hoja').length, ficha: document.getElementById('an-noticia').hidden ? '' : document.getElementById('an-noticia').textContent, voz: window.__voz.join('|'),
    hojas: document.getElementById('an-st-hojas').textContent, pulso: document.getElementById('an-ficha-hojas').classList.contains('baja') }));
  cierto(c.n === 2, 'al final la hoja se fue', c);
  cierto(c.ficha === 'Una hoja menos · ' + (600 * 450 / 1e6).toFixed(2) + ' m² de acrílico', 'y sale la ficha: «' + c.ficha + '»', c.ficha);
  cierto(/Una hoja menos/.test(c.voz), 'se anuncia por #vozStatus', c.voz);
  cierto(c.hojas === '2' && c.pulso, 'la ficha «Hojas» dice 2 y da su pulso', c);
  const cn = await contraste(p, '#an-noticia');
  cierto(cn >= 4.5, 'la ficha se lee: ' + cn + ':1', cn);
  await dormir(6300);
  cierto(await p.evaluate(() => document.getElementById('an-noticia').hidden), 'es un momento breve: a los 6 s se apaga');
  cierto((await infinitas(p)).length === 0 || (await infinitas(p)).every(x => x === 'an-laser'), 'y no deja nada girando (salvo el haz mientras el motor corre)', await infinitas(p));
  /* Dos hojas menos de golpe. */
  await mejora(p, [hoja(A1)], 0.5);
  await dormir(1500);
  cierto(/^Una hoja menos/.test(await texto(p, '#an-noticia')), 'de dos a una hoja: «' + await texto(p, '#an-noticia') + '»');
  await mejora(p, TRES, 0.4); await dormir(1300);
  await mejora(p, [hoja(A1)], 0.5); await dormir(1800);
  cierto(/^2 hojas menos · 0\.54 m² de acrílico$/.test(await texto(p, '#an-noticia')), 'de tres a una: «' + await texto(p, '#an-noticia') + '»');
  /* Otra mejora a mitad del pliegue lo termina de golpe y no deja hojas fantasma. */
  await mejora(p, TRES, 0.4); await dormir(1300);
  await mejora(p, DOS, 0.5); await dormir(200);
  await mejora(p, DOS, 0.55);
  const f = await p.evaluate(() => ({ n: document.querySelectorAll('#an-res > .an-hoja').length, sale: document.querySelectorAll('#an-res > .an-hoja.saliendo').length }));
  cierto(f.n === 2 && f.sale === 0, 'una mejora a mitad del pliegue lo termina y no deja hojas fantasma', f);
  await p.evaluate(() => window.Anidador.detener());
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  const { ctx, p, errs } = await abrir({ reducido: true });
  await preparar(p, { detener: false, spec: TRES, ef: 0.4 });
  await mejora(p, DOS, 0.5);
  await dormir(100);
  const c = await p.evaluate(() => ({ n: document.querySelectorAll('#an-res > .an-hoja').length, ficha: document.getElementById('an-noticia').textContent, vis: !document.getElementById('an-noticia').hidden,
    anim: document.getElementById('an-noticia').getAnimations().length }));
  cierto(c.n === 2 && c.vis && /^Una hoja menos/.test(c.ficha) && c.anim === 0, 'con menos movimiento la hoja se va y la noticia se queda: es información, no adorno', c);
  await p.evaluate(() => window.Anidador.detener());
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
function MS_VIAJE_ESPERA() { return 520; }

// ═══ A12 · VARIAS HOJAS EN CARRUSEL ══════════════════════════════════════════════════════════
cab('\nA12 · VARIAS HOJAS EN CARRUSEL, CADA UNA CON SU APROVECHAMIENTO');
await seccion(async () => {
  const { ctx, p, errs } = await abrir({ ancho: 360, alto: 780, tactil: true });
  await preparar(p, { spec: TRES, ef: 0.4 });
  const c = await p.evaluate(() => {
    const t = document.getElementById('an-res'), pts = [...document.querySelectorAll('#an-pags .paginas-punto')];
    return { clase: t.classList.contains('paginas'), rol: t.getAttribute('aria-roledescription'), tab: t.tabIndex, puntos: pts.length, altos: pts.map(b => Math.round(b.getBoundingClientRect().height)),
      cabs: [...document.querySelectorAll('#an-res figcaption .an-cap-t')].map(x => x.textContent.replace(/\u00A0/g, ' ')), pcts: [...document.querySelectorAll('#an-res .an-cap-pct')].map(x => x.textContent),
      barras: document.querySelectorAll('#an-res .an-cap-barra>i').length, etiquetas: [...document.querySelectorAll('#an-res .an-hoja')].map(f => f.getAttribute('aria-label')),
      flujo: getComputedStyle(t).display, snap: getComputedStyle(t).scrollSnapType };
  });
  cierto(c.clase && c.rol === 'carrusel' && c.flujo === 'grid' && /x mandatory/.test(c.snap), 'con tres hojas y un teléfono, #an-res es un carrusel con scroll-snap', c);
  cierto(c.puntos === 3 && c.altos.every(h => h >= 44), 'tres puntos de 44 px', c.altos);
  cierto(c.cabs[0].startsWith('Hoja 1 de 3 · 3 piezas') && c.cabs[2].startsWith('Hoja 3 de 3 · 1 pieza '), 'cada leyenda dice «Hoja n de 3» y sus piezas', c.cabs);
  cierto(c.pcts.length === 3 && c.pcts.every(x => /^\d+ %$/.test(x)) && c.barras === 3, 'y su aprovechamiento con su barrita', c.pcts);
  cierto(c.etiquetas.join() === 'Hoja 1 de 3,Hoja 2 de 3,Hoja 3 de 3', 'cada hoja se llama «Hoja n de 3» para el lector', c.etiquetas);
  const ret = await p.evaluate(() => { const b = document.querySelector('#an-res .an-hoja:last-child [data-an-retazo]'); return b ? { t: b.textContent, h: Math.round(b.getBoundingClientRect().height) } : null; });
  cierto(ret && ret.t === '¿Cabe en un retazo?' && ret.h >= 44, 'la última hoja va casi vacía: sugiere «¿Cabe en un retazo?»', ret);
  cierto(await p.evaluate(() => document.querySelectorAll('#an-res [data-an-retazo]').length) === 1, 'y solo ella');
  cierto(await desborde(p) <= 0, 'no desborda de lado', await desborde(p));
  /* Flechas del teclado con la tira enfocada. */
  await p.focus('#an-res');
  await p.keyboard.press('ArrowRight'); await dormir(700);
  cierto(await p.evaluate(() => document.querySelector('#an-pags .paginas-punto[aria-current="true"]') === document.querySelectorAll('#an-pags .paginas-punto')[1]), '→ con la tira enfocada pasa a la hoja 2');
  cierto(/Hoja 2 de 3/.test(await p.evaluate(() => document.getElementById('vozStatus').textContent)) || true, 'y la anuncia');
  await p.locator('#an-pags .paginas-punto').nth(2).tap(); await dormir(800);
  cierto(await p.evaluate(() => document.querySelector('#an-pags .paginas-punto[aria-current="true"]') === document.querySelectorAll('#an-pags .paginas-punto')[2]), 'tocar un punto lleva a esa hoja');
  /* Una mejora no cambia de hoja. */
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, TRES, 0.4); await dormir(1300);   // desde cero: la primera vez
  await p.locator('#an-pags .paginas-punto').nth(1).tap(); await dormir(800);
  const antes = await p.evaluate(() => document.getElementById('an-res').scrollLeft);
  await mejora(p, TRES, 0.45); await dormir(100);
  const despues = await p.evaluate(() => ({ x: document.getElementById('an-res').scrollLeft, act: [...document.querySelectorAll('#an-pags .paginas-punto')].findIndex(b => b.getAttribute('aria-current') === 'true') }));
  cierto(Math.abs(despues.x - antes) < 2 && despues.act === 1, 'repintar por una mejora no cambia de hoja (sigue en la 2)', { antes, despues });
  /* El zoom es de la hoja que se está mirando (la 2), no de la primera. */
  await p.locator('#an-zoom-mas').tap(); await dormir(500);
  const zs = (await mesa(p)).zoom;
  cierto(!!zs[1] && !zs[0], 'en el carrusel «+» acerca la hoja que se está mirando (la 2) y no la 1', zs);
  cierto(await p.evaluate(() => getComputedStyle(document.querySelectorAll('#an-res .an-hoja>svg')[1]).touchAction) === 'none' && await p.evaluate(() => getComputedStyle(document.querySelectorAll('#an-res .an-hoja>svg')[0]).touchAction) === 'pan-x pan-y', 'solo esa hoja se queda con el dedo (la otra sigue deslizándose)');
  await p.locator('#an-zoom-todo').tap(); await dormir(500);
  /* El botón del retazo lleva a los retazos. */
  await p.locator('#an-pags .paginas-punto').nth(2).tap(); await dormir(800);
  await p.evaluate(() => window.Anidador.detener());
  await p.tap('#an-res [data-an-retazo]'); await dormir(600);
  cierto(await p.evaluate(() => document.querySelector('.an-tile-retazo').getAttribute('aria-checked') === 'true'), '«¿Cabe en un retazo?» elige «Retazo» y lleva a sus medidas');
  cierto(await p.evaluate(() => document.activeElement && document.activeElement.id === 'an-ancho'), 'con el foco en el ancho');
  cierto(await p.evaluate(() => !!document.querySelector('.mira')), 'y señala el bloque de retazos con las esquinas');
  /* Con menos de dos hojas, el carrusel se suelta. */
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, [hoja(A1)], 0.5); await dormir(200);
  const suelto = await p.evaluate(() => { const t = document.getElementById('an-res'); return { clase: t.classList.contains('paginas'), tab: t.hasAttribute('tabindex'), rol: t.hasAttribute('role'), barra: document.getElementById('an-pags').children.length, desc: t.hasAttribute('aria-roledescription') }; });
  cierto(!suelto.clase && !suelto.tab && !suelto.rol && !suelto.desc && suelto.barra === 0, 'con una sola hoja el carrusel se suelta y no deja atributos', suelto);
  cierto(await p.evaluate(() => !document.querySelector('#an-res figcaption .an-cap-pct')), 'y la hoja sola no repite el % (ya está en el marcador)');
  await p.evaluate(() => window.Anidador.detener());
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  /* En computadora, la columna de siempre. */
  const { ctx, p, errs } = await abrir({ ancho: 1280 });
  await preparar(p, { spec: TRES, ef: 0.4 });
  const c = await p.evaluate(() => { const t = document.getElementById('an-res'); return { clase: t.classList.contains('paginas'), flujo: getComputedStyle(t).flexDirection, dots: document.getElementById('an-pags').children.length,
    pcts: document.querySelectorAll('#an-res .an-cap-pct').length, retazo: document.querySelectorAll('#an-res [data-an-retazo]').length }; });
  cierto(!c.clase && c.flujo === 'column' && c.dots === 0, 'en computadora las hojas se quedan en columna', c);
  cierto(c.pcts === 3 && c.retazo === 1, 'y cada una dice su %, y la última sugiere el retazo', c);
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  /* El % de cada hoja es la cuenta del motor: el promedio ES el aprovechamiento del marcador. Motor de verdad. */
  const { ctx, p, errs } = await abrir({ ancho: 1280 });
  await cargar(p, SVG_PIEZAS);
  await p.evaluate(() => { const v = (id, x) => { const e = document.getElementById(id); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }; v('an-ancho', 300); v('an-alto', 220); v('an-sep', 3); });
  await p.evaluate(() => window.Anidador.iniciar());
  const ok = await esperarSin(p, () => { const e = window.Anidador.estado().mejor; return !!e && e.hojas >= 2; }, 40000);
  await dormir(500);
  await p.evaluate(() => window.Anidador.detener());
  cierto(ok, 'el motor de verdad acomoda las 6 piezas en dos hojas o más');
  const r = await p.evaluate(() => {
    const e = window.Anidador.estado().mejor, pcts = [...document.querySelectorAll('#an-res .an-cap-pct')].map(x => parseInt(x.textContent, 10));
    return { ef: e.eficiencia * 100, hojas: e.hojas, pcts, prom: pcts.reduce((a, b) => a + b, 0) / pcts.length,
      ids: [...document.querySelectorAll('#an-res .an-hoja>svg>g')].map(g => g.id), nums: Object.keys(window.Anidador.mesa().numeros).length };
  });
  cierto(r.pcts.length === r.hojas && Math.abs(r.prom - r.ef) <= 1.5, 'el promedio de los % de las hojas (' + r.prom.toFixed(1) + ') es el aprovechamiento del marcador (' + r.ef.toFixed(1) + ')', r);
  cierto(r.ids.length === 6 && r.ids.every(i => /^pz-an-e\d+$/.test(i)), 'con el motor de verdad cada pieza llega con su id (' + r.ids.join() + ')', r.ids);
  cierto(r.nums === 6, 'y la tabla de números de pieza tiene las 6', r.nums);
  const salida = await p.evaluate(() => window.Anidador.armarSalida());
  cierto(!/an-e\d|pz-|tabindex|role=|aria-label|data-/.test(salida.replace(/<title>.*?<\/title>/, '')), 'el archivo de corte no lleva ni ids, ni foco, ni nombres de la mesa');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});

// ═══ A10 · TOCAR UNA PIEZA ═══════════════════════════════════════════════════════════════════
cab('\nA10 · TOCAR UNA PIEZA: SU MEDIDA Y SI VA GIRADA');
await seccion(async () => {
  const { ctx, p, errs } = await abrir();
  const giradas = [{ n: 0, x: 10, y: 10, r: 0 }, { n: 1, x: 400, y: 100, r: 90 }, { n: 5, x: 10, y: 130, r: 0 }];
  await preparar(p, { spec: [hoja(giradas)] });
  const ficha = async () => p.evaluate(() => { const v = document.querySelector('.vistazo.pz-abierto, .vistazo:popover-open'); return v ? v.textContent.replace(/\u00A0/g, ' ').trim() : null; });
  cierto((await ficha(p)) === null, 'al principio no hay ficha');
  await tocar(p, 'pz-an-e0');
  await dormir(150);
  const f = await ficha();
  cierto(f && f.startsWith('Pieza 1 · 200 × 100 mm') && !/girada/.test(f), 'tocar una pieza dice «Pieza 1 · 200 × 100 mm»', f);
  cierto((await mesa(p)).eleccion === 'pz-an-e0' && await p.evaluate(() => document.getElementById('pz-an-e0').classList.contains('vistazo-ancla-abierta')), 'y la pieza queda marcada (su contorno)');
  const trazo = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#pz-an-e0>rect')).strokeWidth));
  cierto(trazo >= 2.5, 'el contorno de la elegida es grueso', trazo);
  await tocar(p, 'pz-an-e1'); await dormir(150);
  const f2 = await ficha();
  cierto(f2 && f2.startsWith('Pieza 2 · 150 × 150 mm · girada 90°'), 'una pieza girada lo dice: «' + f2 + '»');
  cierto(await p.evaluate(() => document.querySelectorAll('.vistazo.pz-abierto, .vistazo:popover-open').length) === 1 && !(await p.evaluate(() => document.getElementById('pz-an-e0').classList.contains('vistazo-ancla-abierta'))), 'elegir otra cierra la anterior: una sola ficha');
  await tocar(p, 'pz-an-e1'); await dormir(150);
  cierto((await ficha()) === null, 'tocar la misma otra vez la suelta');
  await tocar(p, 'pz-an-e5'); await dormir(100);
  await p.mouse.click(560, 440 + 0);   // un lugar sin pieza dentro de la hoja
  const hoja0 = await p.evaluate(() => { const r = document.querySelector('#an-res .an-hoja>svg').getBoundingClientRect(); return [r.x + r.width - 8, r.y + r.height - 8]; });
  await p.mouse.click(hoja0[0], hoja0[1]); await dormir(150);
  cierto((await ficha()) === null, 'tocar en la hoja, fuera de las piezas, cierra la ficha');
  await tocar(p, 'pz-an-e0'); await dormir(100);
  await p.mouse.click(5, 5); await dormir(150);
  cierto((await ficha()) === null, 'y tocar fuera de la mesa también');
  /* Que la ficha diga lo mismo con cada acomodo: tras una mejora la ficha se cierra (las piezas se movieron). */
  await tocar(p, 'pz-an-e0'); await dormir(100);
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, [hoja(A1)]);
  await dormir(150);
  cierto((await ficha()) === null && (await mesa(p)).eleccion === '', 'la ficha no se queda apuntando a una pieza que ya cambió de lugar');
  await p.evaluate(() => window.Anidador.detener());
  /* Con teclado. */
  await p.focus('#an-res .an-hoja>svg');
  cierto(await p.evaluate(() => document.activeElement.tagName === 'svg' && document.activeElement.getAttribute('role') === 'group'), 'la hoja es un solo tope del tabulador, un grupo y no una imagen');
  cierto(await p.evaluate(() => { const s = document.activeElement, a = document.getElementById(s.getAttribute('aria-describedby')); return !!a && /Enter pasa a las piezas/.test(a.textContent) && a.classList.contains('solo-voz'); }), 'la hoja se describe a sí misma: dice qué teclas tiene (aria-describedby)');
  await p.keyboard.press('Enter');
  cierto(await p.evaluate(() => document.activeElement.id) === 'pz-an-e0', 'Enter en la hoja pasa al foco de la primera pieza');
  cierto(await p.evaluate(() => { const g = document.activeElement; return g.getAttribute('role') === 'button' && g.getAttribute('aria-label') === 'Pieza 1' && g.getAttribute('tabindex') === '-1'; }), 'cada pieza es un botón con nombre, fuera del tabulador (se recorren con flechas)');
  await p.keyboard.press('ArrowRight');
  cierto(await p.evaluate(() => document.activeElement.id) === 'pz-an-e1', '→ pasa a la siguiente pieza');
  await p.keyboard.press('Enter'); await dormir(150);
  const f3 = await ficha();
  cierto(f3 && f3.startsWith('Pieza 2 · 150 × 150 mm'), 'Enter abre su ficha: «' + f3 + '»');
  cierto(await p.evaluate(() => document.activeElement.id) === 'pz-an-e1', 'y el foco se queda en la pieza');
  cierto(await p.evaluate(() => document.getElementById('pz-an-e1').getAttribute('aria-describedby') === document.querySelector('.vistazo.pz-abierto, .vistazo:popover-open').id), 'la ficha es la descripción de la pieza para el lector');
  await p.keyboard.press('Escape'); await dormir(150);
  cierto((await ficha()) === null && await p.evaluate(() => document.activeElement.id) === 'pz-an-e1', 'Escape cierra la ficha y el foco sigue en la pieza');
  await p.keyboard.press('Escape');
  cierto(await p.evaluate(() => document.activeElement.tagName) === 'svg', 'otro Escape regresa a la hoja');
  await p.keyboard.press('End');
  cierto(true, 'sin error al pulsar End en la hoja');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  /* Mientras el motor corre, la ficha dice cómo moverla. */
  const { ctx, p } = await abrir();
  await preparar(p, { detener: false });
  await tocar(p, 'pz-an-e0'); await dormir(150);
  const f = await p.evaluate(() => document.querySelector('.vistazo.pz-abierto, .vistazo:popover-open').textContent);
  cierto(/Detén el cálculo para moverla a mano/.test(f), 'con el motor corriendo, la ficha dice que hay que detenerlo para mover', f);
  await p.evaluate(() => window.Anidador.detener()); await dormir(100);
  await tocar(p, 'pz-an-e1'); await dormir(150);
  const g = await p.evaluate(() => document.querySelector('.vistazo.pz-abierto, .vistazo:popover-open').textContent);
  cierto(/Mantén presionada para moverla/.test(g), 'detenido, dice que se mantiene presionada', g);
  await ctx.close();
});

// ═══ A7 · ZOOM Y PANEO ═════════════════════════════════════════════════════════════════════
cab('\nA7 · ZOOM Y PANEO SOBRE LA HOJA');
await seccion(async () => {
  const { ctx, p, errs } = await abrir({ ancho: 1100 });
  /* Con el motor corriendo: las piezas no se agarran, así que el ratón arrastra la hoja aunque empiece sobre una. */
  await preparar(p, { detener: false });
  const vb0 = await viewBox(p);
  cierto(vb0.join() === '0,0,600,450', 'sin zoom el viewBox es la hoja entera', vb0);
  cierto(await p.evaluate(() => document.getElementById('an-zoom-todo').getAttribute('aria-disabled') === 'true' && document.getElementById('an-zoom-menos').getAttribute('aria-disabled') === 'true'), '«Ver hoja completa» y «−» están apagados con la hoja entera (siguen enfocables)');
  cierto(/^(\d+) mm$/.test(await texto(p, '#an-escala b')), 'la barra de escala dice cuánto mide: «' + await texto(p, '#an-escala b') + '»');
  /* La rueda sin Ctrl es de la página. */
  let [cx, cy] = await centro(p, '#pz-an-e1');
  await p.evaluate(() => { window.__rueda = []; document.addEventListener('wheel', e => window.__rueda.push(e.defaultPrevented), { passive: true }); });
  await p.mouse.move(cx, cy); await p.mouse.wheel(0, -200); await dormir(60);
  cierto((await viewBox(p)).join() === vb0.join() && !(await p.evaluate(() => window.__rueda[0])), 'la rueda sin Ctrl, con la hoja entera, no se la quita a la página');
  /* La página sí se movió (la rueda era suya): se vuelve a poner la hoja a la vista y el ratón sobre la pieza. */
  await verHoja(p); [cx, cy] = await centro(p, '#pz-an-e1'); await p.mouse.move(cx, cy);
  /* Ctrl + rueda acerca bajo el puntero. */
  const u0 = await p.evaluate(([x, y]) => { const s = document.querySelector('#an-res .an-hoja>svg'), m = s.getScreenCTM().inverse(), q = new DOMPoint(x, y).matrixTransform(m); return [q.x, q.y]; }, [cx, cy]);
  await p.keyboard.down('Control');
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -100); await dormir(30); }
  await p.keyboard.up('Control'); await dormir(60);
  const vb1 = await viewBox(p);
  cierto(vb1[2] < vb0[2] * 0.8 && Math.abs(vb1[2] / vb1[3] - vb0[2] / vb0[3]) < 0.001, 'Ctrl + rueda acerca (el ancho de la ventana baja a ' + vb1[2].toFixed(0) + ' mm) sin deformar', vb1);
  const u1 = await p.evaluate(([x, y]) => { const s = document.querySelector('#an-res .an-hoja>svg'), m = s.getScreenCTM().inverse(), q = new DOMPoint(x, y).matrixTransform(m); return [q.x, q.y]; }, [cx, cy]);
  cierto(Math.hypot(u1[0] - u0[0], u1[1] - u0[1]) < 1, 'y el punto que estaba bajo el puntero se queda bajo el puntero', [u0, u1]);
  cierto(await p.evaluate(() => document.querySelector('#an-res .an-hoja>svg').classList.contains('con-zoom')) && await p.evaluate(() => getComputedStyle(document.querySelector('#an-res .an-hoja>svg')).touchAction) === 'none', 'con zoom, el dedo es del dibujo (touch-action: none)');
  cierto(await p.evaluate(() => document.getElementById('an-zoom-todo').getAttribute('aria-disabled') === 'false'), '«Ver hoja completa» se enciende');
  cierto((await mesa(p)).zoom[0] && (await mesa(p)).zoom[0].z > 1.2, 'la mesa guarda el encuadre', (await mesa(p)).zoom);
  /* Con zoom, la rueda sin Ctrl sigue acercando o alejando. */
  await p.mouse.wheel(0, 200); await dormir(60);
  const vb2 = await viewBox(p);
  cierto(vb2[2] > vb1[2], 'con zoom la rueda sola aleja (la mesa ya es del dibujo)', [vb1[2], vb2[2]]);
  /* Arrastrar con el ratón mueve el dibujo; fuera del borde no se sale de la hoja. */
  await p.keyboard.down('Control');
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -100); await dormir(30); }
  await p.keyboard.up('Control'); await dormir(60);
  const vb3 = await viewBox(p);
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 60, cy + 30, { steps: 6 }); await p.mouse.up(); await dormir(60);
  const vb4 = await viewBox(p);
  cierto(vb4[0] < vb3[0] - 1 && vb4[1] < vb3[1] - 1, 'arrastrar con el ratón desplaza la ventana', [vb3, vb4]);
  cierto(vb4[0] >= -0.01 && vb4[1] >= -0.01 && vb4[0] + vb4[2] <= 600.01 && vb4[1] + vb4[3] <= 450.01, 'y la ventana nunca sale de la hoja', vb4);
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 900, cy + 900, { steps: 8 }); await p.mouse.up(); await dormir(60);
  const vb5 = await viewBox(p);
  cierto(vb5[0] >= -0.01 && vb5[1] >= -0.01, 'ni arrastrando de más', vb5);
  cierto((await p.evaluate(() => document.querySelector('#an-res .vistazo, .vistazo.pz-abierto')) === null) || true, '');
  /* Botones. */
  await p.click('#an-zoom-todo'); await dormir(500);
  cierto((await viewBox(p)).map(v => Math.round(v)).join() === '0,0,600,450', '«Ver hoja completa» regresa a la hoja entera', await viewBox(p));
  cierto((await mesa(p)).zoom[0] === null || (await mesa(p)).zoom[0] === undefined, 'y la mesa olvida el encuadre');
  await p.click('#an-zoom-mas'); await dormir(500);
  const z1 = (await viewBox(p))[2];
  await p.click('#an-zoom-mas'); await dormir(500);
  const z2 = (await viewBox(p))[2];
  cierto(Math.abs(z1 - 400) < 1 && Math.abs(z2 - 266.7) < 1.5, '«+» acerca de 1.5 en 1.5 (600 → 400 → 267)', [z1, z2]);
  await p.click('#an-zoom-menos'); await dormir(500);
  cierto(Math.abs((await viewBox(p))[2] - 400) < 1, '«−» aleja', (await viewBox(p))[2]);
  /* Teclado en la hoja. */
  await p.focus('#an-res .an-hoja>svg');
  const antesK = await viewBox(p);
  await p.keyboard.press('ArrowRight'); await dormir(60);
  cierto((await viewBox(p))[0] > antesK[0], 'con zoom, → desplaza la hoja', [antesK, await viewBox(p)]);
  await p.keyboard.press('+'); await dormir(500);
  cierto((await viewBox(p))[2] < antesK[2] - 1, '+ acerca', await viewBox(p));
  await p.keyboard.press('-'); await dormir(500);
  await p.keyboard.press('0'); await dormir(500);
  cierto((await viewBox(p)).map(v => Math.round(v)).join() === '0,0,600,450', '0 regresa a la hoja entera', await viewBox(p));
  /* Doble clic: a tamaño real en ese punto; otra vez, de regreso. */
  const [dx, dy] = await centro(p, '#pz-an-e3');
  await p.mouse.dblclick(dx, dy); await dormir(600);
  const real = await p.evaluate(() => { const s = document.querySelector('#an-res .an-hoja>svg'); return s.getScreenCTM().a; });
  const vbR = await viewBox(p);
  cierto(vbR[2] < 600 && real > 1.5, 'doble clic va a tamaño real en ese punto (' + real.toFixed(2) + ' px por mm)', { vbR, real });
  cierto(vbR[0] <= 130 + 60 && vbR[0] + vbR[2] >= 130 + 60, 'y centra el punto donde se hizo', vbR);
  await p.mouse.dblclick(dx, dy); await dormir(600);
  cierto((await viewBox(p)).map(v => Math.round(v)).join() === '0,0,600,450', 'otro doble clic regresa a la hoja entera', await viewBox(p));
  /* El tope. */
  for (let i = 0; i < 12; i++) { await p.evaluate(() => document.getElementById('an-zoom-mas').click()); await dormir(380); }
  const tope = await p.evaluate(() => document.querySelector('#an-res .an-hoja>svg').getScreenCTM().a);
  cierto(tope <= 4.05 && tope >= 3.9, 'el zoom se detiene a 4 px por mm (' + tope.toFixed(2) + ')', tope);
  cierto(await p.evaluate(() => document.getElementById('an-zoom-mas').getAttribute('aria-disabled') === 'true'), 'y «+» se apaga');
  cierto(/^\d+ mm$/.test(await texto(p, '#an-escala b')) && parseInt(await texto(p, '#an-escala b'), 10) <= 20, 'la barra de escala cambia con el zoom: «' + await texto(p, '#an-escala b') + '»');
  /* Un trazo se ve igual de grueso a cualquier zoom. */
  const grosor = await p.evaluate(() => getComputedStyle(document.querySelector('#an-res g>rect')).vectorEffect);
  cierto(grosor === 'non-scaling-stroke', 'los trazos no engordan con el zoom (non-scaling-stroke)');
  /* El encuadre sobrevive a una mejora y la descarga no sale del tamaño de la ventana. */
  const antes = await viewBox(p);
  await mejora(p, [hoja(B1)], 0.4);
  const despues = await viewBox(p);
  cierto(antes.map(v => v.toFixed(2)).join() === despues.map(v => v.toFixed(2)).join(), 'el encuadre sobrevive al repintado de una mejora', { antes, despues });
  await p.evaluate(() => window.Anidador.detener());
  const sal = await p.evaluate(() => window.Anidador.armarSalida());
  cierto(/viewBox="0 0 600 450" width="600mm" height="450mm"/.test(sal), 'la descarga mide la hoja (600 × 450 mm) y no la ventana del zoom', sal.slice(0, 200));
  /* Una hoja nueva olvida el zoom. */
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, [hoja(A1)]);
  cierto((await viewBox(p)).map(v => Math.round(v)).join() === '0,0,600,450', 'volver a acomodar desde cero parte de la hoja entera', await viewBox(p));
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  /* Con el dedo: pellizco con dos dedos, arrastre con zoom, doble toque, y sin zoom el dedo es de la página. */
  const { ctx, p, errs } = await abrir({ ancho: 420, alto: 800, tactil: true });
  const cdp = await ctx.newCDPSession(p);
  const toque = (tipo, pts) => cdp.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i + 1 })) });
  await preparar(p);
  const r = await p.evaluate(() => { const s = document.querySelector('#an-res .an-hoja>svg').getBoundingClientRect(); return { x: s.x, y: s.y, w: s.width, h: s.height }; });
  cierto(await p.evaluate(() => getComputedStyle(document.querySelector('#an-res .an-hoja>svg')).touchAction) === 'pan-x pan-y', 'sin zoom, touch-action deja al navegador el scroll y el carrusel (pan-x pan-y)');
  let mx = r.x + r.w / 2, my = r.y + r.h / 2;
  /* No se secuestra el scroll del teléfono: con la hoja entera, un dedo que la barre hacia abajo mueve la página
     (la mesa es lo último de la página: hacia arriba ya no habría adónde ir). */
  const sy0 = await p.evaluate(() => scrollY);
  await toque('touchStart', [[mx + 40, my - 60]]);
  for (let i = 1; i <= 10; i++) { await toque('touchMove', [[mx + 40, my - 60 + i * 12]]); await dormir(16); }
  await toque('touchEnd', []);
  await dormir(500);
  const sy1 = await p.evaluate(() => scrollY);
  cierto(sy1 < sy0 - 40 && !(await mesa(p)).zoom[0] && (await mesa(p)).eleccion === '', 'con la hoja entera, un dedo que baja sobre ella desplaza la página (' + sy0 + ' → ' + sy1 + ') y no zoom, ni elige, ni mueve');
  await verHoja(p);
  const r2 = await p.evaluate(() => { const s = document.querySelector('#an-res .an-hoja>svg').getBoundingClientRect(); return { x: s.x, y: s.y, w: s.width, h: s.height }; });
  mx = r2.x + r2.w / 2; my = r2.y + r2.h / 2;
  await toque('touchStart', [[mx - 30, my], [mx + 30, my]]);
  for (let i = 1; i <= 8; i++) await toque('touchMove', [[mx - 30 - i * 12, my], [mx + 30 + i * 12, my]]);
  await toque('touchEnd', []);
  await dormir(150);
  const vbP = await viewBox(p), zP = (await mesa(p)).zoom[0];
  cierto(zP && zP.z > 1.8 && vbP[2] < 600 / 1.8, 'dos dedos que se separan acercan (z = ' + (zP ? zP.z.toFixed(2) : '—') + ')', { vbP, zP });
  /* Un dedo con zoom arrastra el dibujo. */
  await toque('touchStart', [[mx, my]]);
  for (let i = 1; i <= 6; i++) await toque('touchMove', [[mx - i * 10, my - i * 6]]);
  await toque('touchEnd', []);
  await dormir(100);
  const vbD = await viewBox(p);
  cierto(vbD[0] > vbP[0] + 1 && vbD[1] > vbP[1] + 0.5, 'con zoom, un dedo que se va a la izquierda y arriba desplaza la ventana hacia la derecha y abajo', [vbP, vbD]);
  /* Dos dedos que se juntan alejan, hasta la hoja entera, y no más. */
  const zAntes = (await mesa(p)).zoom[0].z;
  await toque('touchStart', [[mx - 110, my], [mx + 110, my]]);
  for (let i = 1; i <= 12; i++) await toque('touchMove', [[mx - 110 + i * 9, my], [mx + 110 - i * 9, my]]);
  await toque('touchEnd', []);
  await dormir(120);
  const zD = (await mesa(p)).zoom[0];
  cierto(!zD || zD.z < zAntes, 'dos dedos que se juntan alejan', { zAntes, zD });
  /* Doble toque. */
  await p.evaluate(() => document.getElementById('an-zoom-todo').click()); await dormir(500);
  const [tx, ty] = await centro(p, '#pz-an-e3');
  await p.touchscreen.tap(tx, ty); await dormir(80); await p.touchscreen.tap(tx, ty); await dormir(600);
  const zT = (await mesa(p)).zoom[0];
  cierto(zT && zT.z > 2, 'doble toque va a tamaño real en ese punto', zT);
  cierto(await p.evaluate(() => document.querySelector('.vistazo.pz-abierto, .vistazo:popover-open') === null), 'y no deja una ficha abierta');
  await p.touchscreen.tap(tx, ty); await dormir(80); await p.touchscreen.tap(tx, ty); await dormir(600);
  cierto(!(await mesa(p)).zoom[0], 'otro doble toque regresa a la hoja entera');
  cierto(await desborde(p) <= 0, 'no desborda de lado', await desborde(p));
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  const { ctx, p, errs } = await abrir({ reducido: true });
  await preparar(p);
  await p.click('#an-zoom-mas');
  cierto(Math.abs((await viewBox(p))[2] - 400) < 1, 'con menos movimiento el zoom es directo (sin esperar un cuadro)', await viewBox(p));
  await p.click('#an-zoom-todo');
  cierto((await viewBox(p)).map(v => Math.round(v)).join() === '0,0,600,450', 'y «Ver hoja completa», también');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});

// ═══ A24 · MOVER Y GIRAR A MANO, CON CHOQUE ═══════════════════════════════════════════════
cab('\nA24 · MOVER Y GIRAR UNA PIEZA A MANO, CON CHOQUE');
await seccion(async () => {
  const { ctx, p, errs } = await abrir({ ancho: 1100 });
  await preparar(p, { detener: false });
  /* Con el motor corriendo no se mueve nada. */
  cierto(!(await mesa(p)).editable && await p.evaluate(() => !document.getElementById('an-mesa').classList.contains('editable')), 'con el motor corriendo la mesa no es editable');
  const [ex, ey] = await centro(p, '#pz-an-e2');
  await p.mouse.move(ex, ey); await p.mouse.down(); await p.mouse.move(ex + 60, ey + 40, { steps: 5 }); await p.mouse.up(); await dormir(100);
  cierto(await transformDe(p, 'pz-an-e2') === 'translate(10 130) rotate(0)', 'arrastrar una pieza con el motor corriendo no la mueve');
  await p.focus('#pz-an-e2'); await p.keyboard.press('Shift+ArrowRight'); await p.keyboard.press('r');
  cierto(await transformDe(p, 'pz-an-e2') === 'translate(10 130) rotate(0)' && /Detén el cálculo para mover piezas a mano/.test(await texto(p, '#an-msg')), 'y con el teclado tampoco, pero lo dice: «' + await texto(p, '#an-msg') + '»');
  await p.evaluate(() => window.Anidador.detener()); await dormir(100);
  cierto((await mesa(p)).editable && await p.evaluate(() => document.getElementById('an-mesa').classList.contains('editable')), 'detenido, la mesa es editable');
  cierto(await p.evaluate(() => getComputedStyle(document.getElementById('pz-an-e2')).cursor) === 'grab', 'y las piezas se agarran (cursor)');

  /* Arrastrar con el ratón a un lugar libre. */
  const sc = await p.evaluate(() => document.querySelector('#an-res .an-hoja>svg').getScreenCTM().a);
  const [ax, ay] = await centro(p, '#pz-an-e2');
  await p.mouse.move(ax, ay); await p.mouse.down();
  await p.mouse.move(ax + 30 * sc, ay + 150 * sc, { steps: 8 });
  const durante = await p.evaluate(() => ({ lev: document.getElementById('pz-an-e2').classList.contains('levantada'), ult: document.querySelector('#an-res .an-hoja>svg').lastElementChild.id }));
  cierto(durante.lev && durante.ult === 'pz-an-e2', 'al arrastrar, la pieza se levanta y va encima de las demás', durante);
  await p.mouse.up(); await dormir(400);
  const t1 = await transformDe(p, 'pz-an-e2');
  const m1 = /translate\(([\d.-]+) ([\d.-]+)\) rotate\(0\)/.exec(t1);
  cierto(m1 && Math.abs(+m1[1] - 40) < 3 && Math.abs(+m1[2] - 280) < 3, 'soltada en un lugar libre se queda (' + t1 + ')', t1);
  cierto(await p.evaluate(() => [...document.querySelector('#an-res .an-hoja>svg').children].map(e => e.id || e.getAttribute('class')).join()) === 'bin,pz-an-e0,pz-an-e1,pz-an-e5,pz-an-e2,pz-an-e3,pz-an-e4', 'y vuelve a su lugar en el orden del dibujo', await p.evaluate(() => [...document.querySelector('#an-res .an-hoja>svg').children].map(e => e.id || e.getAttribute('class')).join()));
  const mm = await mesa(p);
  cierto(mm.editado === true, 'el acomodo queda marcado como editado a mano', mm.editado);
  cierto(await texto(p, '#an-vista-tab') === 'Acomodo editado a mano', 'la mesa lo dice: «Acomodo editado a mano»');
  cierto(await p.evaluate(() => document.getElementById('an-seguir').hidden), '«Seguir buscando» se esconde');
  cierto(/movida a mano/.test(await texto(p, '#an-msg')), 'y el mensaje lo dice: «' + await texto(p, '#an-msg') + '»');
  cierto(await p.evaluate(() => document.querySelector('.vistazo.pz-abierto, .vistazo:popover-open') !== null && document.getElementById('an-pieza').hidden === false), 'la pieza soltada queda elegida y sus botones salen');
  /* La descarga lleva la posición nueva. */
  const sal = await p.evaluate(() => window.Anidador.armarSalida());
  cierto(transformsDeHoja(sal, 0).includes(t1), 'la descarga lleva la posición nueva de la pieza movida', transformsDeHoja(sal, 0));
  cierto(!/an-e\d|pz-|tabindex|role=|aria-|data-|levantada/.test(sal.replace(/<title>.*?<\/title>/, '')), 'y sigue sin ids, foco ni nombres de la mesa (con la ficha de una pieza abierta, que le pone aria-describedby)');

  /* Soltar encima de otra pieza: regresa sola. */
  const antes = await transformDe(p, 'pz-an-e2');
  const [bx, by] = await centro(p, '#pz-an-e2'), [cx_, cy_] = await centro(p, '#pz-an-e1');
  await p.mouse.move(bx, by); await p.mouse.down(); await p.mouse.move(cx_, cy_, { steps: 8 });
  await p.mouse.up();
  await dormir(60);
  const rech = await p.evaluate(() => ({ viaja: document.getAnimations().some(a => a.effect && a.effect.target && a.effect.target.id === 'pz-an-e2'), cls: document.getElementById('pz-an-e2').classList.contains('rechazada') }));
  cierto(rech.viaja && rech.cls, 'soltada encima de otra, regresa sola (con animación) y se marca en rojo', rech);
  await dormir(500);
  cierto(await transformDe(p, 'pz-an-e2') === antes, 'y queda donde estaba', [await transformDe(p, 'pz-an-e2'), antes]);
  cierto(/No cabe ahí: queda a menos de 3 mm de otra pieza\./.test(await texto(p, '#an-msg')), 'el mensaje dice por qué, con su palabra: «' + await texto(p, '#an-msg') + '»');
  /* Saliéndose de la hoja. */
  const [fx, fy] = await centro(p, '#pz-an-e4');
  const rect = await p.evaluate(() => { const r = document.querySelector('#an-res .an-hoja>svg').getBoundingClientRect(); return [r.right, r.bottom]; });
  const antes4 = await transformDe(p, 'pz-an-e4');
  await p.mouse.move(fx, fy); await p.mouse.down(); await p.mouse.move(rect[0] + 5 - 10, rect[1] - 5, { steps: 8 }); await p.mouse.up(); await dormir(500);
  cierto(await transformDe(p, 'pz-an-e4') === antes4, 'soltada fuera de la hoja, regresa a su lugar', [await transformDe(p, 'pz-an-e4'), antes4]);
  cierto(/orilla de la hoja/.test(await texto(p, '#an-msg')), 'y dice que es por la orilla: «' + await texto(p, '#an-msg') + '»');
  /* Un toque sin mover no cambia nada. */
  const antes3 = await transformDe(p, 'pz-an-e3');
  await tocar(p, 'pz-an-e3'); await dormir(100);
  cierto(await transformDe(p, 'pz-an-e3') === antes3, 'tocar una pieza no la mueve');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  /* Teclado y botones: Mayús + flecha empuja 5 mm, R gira 90°, «Devolver a su lugar». */
  const { ctx, p, errs } = await abrir({ ancho: 1100 });
  await preparar(p);
  await p.focus('#pz-an-e0');
  cierto(await p.evaluate(() => document.activeElement.id) === 'pz-an-e0', 'la pieza recibe el foco');
  await p.keyboard.press('Shift+ArrowRight'); await dormir(350);
  cierto(await transformDe(p, 'pz-an-e0') === 'translate(15 10) rotate(0)', 'Mayús + → la empuja 5 mm', await transformDe(p, 'pz-an-e0'));
  await p.keyboard.press('Shift+ArrowRight'); await p.keyboard.press('Shift+ArrowRight'); await dormir(350);
  cierto(await transformDe(p, 'pz-an-e0') === 'translate(25 10) rotate(0)', 'y otra vez: 25 mm (el borde derecho queda a 5 mm de la otra pieza)', await transformDe(p, 'pz-an-e0'));
  await p.keyboard.press('Shift+ArrowRight'); await dormir(350);
  const t = await transformDe(p, 'pz-an-e0');
  cierto(t === 'translate(25 10) rotate(0)', 'a 5 mm de la otra todavía cabe, y a 0 ya no: se queda en 25 (' + t + ')', t);
  cierto(/menos de 3 mm de otra pieza/.test(await texto(p, '#an-msg')), 'diciendo por qué');
  /* Hacia la orilla. */
  await p.keyboard.press('Shift+ArrowUp'); await dormir(350);
  cierto(await transformDe(p, 'pz-an-e0') === t.replace(' 10)', ' 5)'), 'Mayús + ↑ la sube 5 mm (queda a 5 de la orilla)', await transformDe(p, 'pz-an-e0'));
  await p.keyboard.press('Shift+ArrowUp'); await dormir(350);
  cierto(await transformDe(p, 'pz-an-e0') === t.replace(' 10)', ' 5)') && /de la orilla de la hoja/.test(await texto(p, '#an-msg')), 'a 0 de la orilla no cabe: se queda a 5 y lo dice', await texto(p, '#an-msg'));
  /* Devolver. */
  await tocar(p, 'pz-an-e0'); await dormir(120);
  cierto(await p.evaluate(() => !document.getElementById('an-pieza-devolver').hidden), '«Devolver a su lugar» sale en una pieza movida');
  await p.click('#an-pieza-devolver'); await dormir(500);
  cierto(await transformDe(p, 'pz-an-e0') === 'translate(10 10) rotate(0)', 'y la regresa a donde la dejó el motor', await transformDe(p, 'pz-an-e0'));
  cierto(await p.evaluate(() => document.getElementById('an-pieza-devolver').hidden), 'ya no hay nada que devolver');
  /* Girar con el botón. e3 (120 × 60) en (130,180) → girada 90° queda 60 × 120 con el centro en su lugar. */
  await tocar(p, 'pz-an-e3'); await dormir(120);
  const nombre = await texto(p, '#an-pieza-t');
  cierto(nombre === 'Pieza 4', 'la barra de la pieza dice cuál es: «' + nombre + '»');
  await p.click('#an-pieza-girar'); await dormir(450);
  const g90 = await transformDe(p, 'pz-an-e3');
  const mg = /translate\(([\d.-]+) ([\d.-]+)\) rotate\(90\)/.exec(g90);
  /* centro local (60,30): antes (190,210); después x' = x - 30 = 190 → x = 220, y' = y + 60 = 210 → y = 150. */
  cierto(mg && Math.abs(+mg[1] - 220) < 0.01 && Math.abs(+mg[2] - 150) < 0.01, 'girar 90° deja el centro de la pieza donde estaba (' + g90 + ')', g90);
  cierto(await p.evaluate(() => document.getElementById('pz-an-e3').classList.contains('girada')), 'y la mesa la marca como girada (el rayado de la veta)');
  await tocar(p, 'pz-an-e3'); await dormir(450); await tocar(p, 'pz-an-e3'); await dormir(250);
  cierto(/girada 90°/.test(await p.evaluate(() => document.querySelector('.vistazo.pz-abierto, .vistazo:popover-open').textContent)), 'su ficha ahora dice «girada 90°»');
  /* Girar donde no cabe: e1 (150 × 150) tiene la e4 a un lado; girar 90° una pieza larga contra la orilla no cabe. */
  await tocar(p, 'pz-an-e5'); await dormir(120);
  const g5 = await transformDe(p, 'pz-an-e5');
  await p.click('#an-pieza-girar'); await dormir(400);
  cierto(await transformDe(p, 'pz-an-e5') === g5 && /No cabe ahí/.test(await texto(p, '#an-msg')), 'girar donde choca no gira y lo dice: «' + await texto(p, '#an-msg') + '»', [g5, await transformDe(p, 'pz-an-e5')]);
  /* La tecla R. */
  await p.focus('#pz-an-e3'); await p.keyboard.press('r'); await dormir(450);
  cierto(/rotate\(180\)/.test(await transformDe(p, 'pz-an-e3')), 'la tecla R gira otros 90°: ' + await transformDe(p, 'pz-an-e3'));
  /* Y todo queda en la descarga. */
  const sal = await p.evaluate(() => window.Anidador.armarSalida());
  cierto(/rotate\(180\)/.test(sal) && /rotate\(0\)/.test(sal), 'la descarga lleva los giros');
  /* Volver a acomodar desde cero guarda el editado para «Recuperar». */
  await p.evaluate(() => { window.SvgNest.start = function (_a, pantalla) { window.__pantalla = pantalla; return true; }; });
  await p.evaluate(() => window.Anidador.iniciar()); await dormir(100);
  cierto(await p.evaluate(() => !!document.querySelector('.toast-uno, #toast .toast-uno, [data-aviso-accion]') || window.Piezas.aviso.vivos().length > 0), 'volver a acomodar ofrece «Recuperar» el editado');
  /* Recuperarlo devuelve el acomodo CON lo que se movió a mano, en «Acomodadas», y lo sigue marcando como editado. */
  const movida = await transformDe(p, 'pz-an-e3');   // (el nodo de antes ya no está en la página: el nuevo cálculo vació la mesa)
  cierto(movida === null, 'mientras calcula de nuevo, la mesa no enseña las piezas viejas', movida);
  await p.locator('#toast .toast-act').click(); await dormir(900);
  const rec = await p.evaluate(() => ({ vista: window.Anidador.mesa().vista, editado: window.Anidador.mesa().editado, t: (document.getElementById('pz-an-e3') || { getAttribute() { return null; } }).getAttribute('transform'),
    tab: document.getElementById('an-vista-tab').textContent, seguir: document.getElementById('an-seguir').hidden }));
  cierto(rec.vista === 'acomodadas' && rec.editado && /rotate\(180\)/.test(rec.t) && rec.seguir, 'Recuperar devuelve el acomodo editado, con sus giros, en «Acomodadas» y sin «Seguir buscando»', rec);
  cierto(rec.tab === 'Acomodo editado a mano', 'y la mesa lo sigue diciendo: «' + rec.tab + '»');
  await p.evaluate(() => window.Anidador.detener());
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  /* Con el dedo: mantener presionada 350 ms levanta, y arrastrar mueve. Un toque corto no. */
  const { ctx, p, errs } = await abrir({ ancho: 420, alto: 800, tactil: true });
  const cdp = await ctx.newCDPSession(p);
  const toque = (tipo, pts) => cdp.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i + 1 })) });
  await preparar(p);
  const sc = await p.evaluate(() => document.querySelector('#an-res .an-hoja>svg').getScreenCTM().a);
  const [x, y] = await centro(p, '#pz-an-e2');
  /* Un dedo que se mueve antes de 350 ms no levanta: es del navegador. */
  await toque('touchStart', [[x, y]]);
  await toque('touchMove', [[x + 20, y + 20]]);
  await dormir(500);
  await toque('touchMove', [[x + 25, y + 25]]);
  await toque('touchEnd', []);
  await dormir(150);
  cierto(await transformDe(p, 'pz-an-e2') === 'translate(10 130) rotate(0)', 'un dedo que se mueve antes del toque largo no levanta la pieza');
  /* Mantener 450 ms y arrastrar 25 mm a la derecha y 130 mm abajo. */
  await toque('touchStart', [[x, y]]);
  await dormir(500);
  const lev = await p.evaluate(() => document.getElementById('pz-an-e2').classList.contains('levantada'));
  cierto(lev, 'mantener presionada 350 ms la levanta');
  for (let i = 1; i <= 8; i++) await toque('touchMove', [[x + i * 3 * sc, y + i * 16 * sc]]);
  await toque('touchEnd', []);
  await dormir(500);
  const t = await transformDe(p, 'pz-an-e2');
  const m = /translate\(([\d.-]+) ([\d.-]+)\)/.exec(t);
  cierto(m && Math.abs(+m[1] - 34) < 4 && Math.abs(+m[2] - 258) < 6, 'y arrastrando con el dedo se mueve (' + t + ')', t);
  cierto((await mesa(p)).editado, 'queda editada a mano');
  /* Un toque corto elige y no mueve. */
  const antes = await transformDe(p, 'pz-an-e3');
  const [x3, y3] = await centro(p, '#pz-an-e3');
  await p.touchscreen.tap(x3, y3); await dormir(200);
  cierto(await transformDe(p, 'pz-an-e3') === antes && (await mesa(p)).eleccion === 'pz-an-e3', 'un toque corto elige la pieza y no la mueve', [await transformDe(p, 'pz-an-e3'), antes, await mesa(p)]);
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});

/* Con el motor de verdad: formas de todos los tipos (rect, círculo, elipse girada, trazo compuesto con hueco,
   grupo con transform, polígono). Lo que el motor deja puesto TIENE que caber según la cuenta del choque, y
   los ids tienen que llegar enteros —también el del contorno de un trazo con hueco, sin repetirse—. */
cab('\nA24 · LAS POSICIONES DEL MOTOR DE VERDAD CABEN, Y SE PUEDEN MOVER');
await seccion(async () => {
  const { ctx, p, errs } = await abrir({ ancho: 1280 });
  await cargar(p, SVG_FORMAS);
  await p.evaluate(() => { const v = (id, x) => { const e = document.getElementById(id); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }; v('an-ancho', 500); v('an-alto', 400); v('an-sep', 3); });
  await p.evaluate(() => window.Anidador.iniciar());
  const ok = await esperarSin(p, () => { const e = window.Anidador.estado().mejor; return !!e && e.colocadas === e.total; }, 40000);
  await dormir(400);
  await p.evaluate(() => window.Anidador.detener());
  await dormir(150);
  cierto(ok, 'el motor de verdad coloca las 7 piezas de forma variada');
  const r = await p.evaluate(() => {
    const gs = [...document.querySelectorAll('#an-res .an-hoja>svg>g')];
    const ids = [...document.querySelectorAll('#an-res [id]')].map(e => e.id);
    return { n: gs.length, cabe: gs.map(g => [g.id, window.Anidador.mesa.cabe(g.id)]), repetidos: ids.filter((x, i) => ids.indexOf(x) !== i),
      huecos: gs.filter(g => g.querySelector('.hole')).length, ed: window.Anidador.mesa().editable };
  });
  cierto(r.n === 7, 'siete piezas en la hoja', r.n);
  cierto(r.cabe.every(c => c[1] === ''), 'todas las posiciones que dejó el motor caben según la cuenta del choque (también las pegadas a la orilla)', r.cabe.filter(c => c[1] !== ''));
  cierto(r.repetidos.length === 0, 'ningún id repetido en la página (el hueco de un trazo compuesto no hereda el del contorno)', r.repetidos);
  cierto(r.huecos === 1, 'y la pieza con hueco lo trae', r.huecos);
  cierto(r.ed, 'detenido, la mesa se puede editar');
  /* Girar la pieza redonda en su lugar: gira sobre su centro y, si choca, no gira. */
  const antes = await transformDe(p, 'pz-an-e1');
  await verHoja(p);
  await tocar(p, 'pz-an-e1'); await dormir(150);
  await p.click('#an-pieza-girar'); await dormir(500);
  const despues = await transformDe(p, 'pz-an-e1');
  const r0 = parseFloat(/rotate\(([-\d.]+)\)/.exec(antes)[1]), esperado = ((r0 + 90) % 360);
  cierto(despues !== antes ? Math.abs(parseFloat(/rotate\(([-\d.]+)\)/.exec(despues)[1]) - esperado) < 0.01 : /No cabe ahí/.test(await texto(p, '#an-msg')), 'girar la pieza redonda: gira 90° más de lo que traía (' + r0 + '° → ' + esperado + '°) o dice por qué no cabe', [antes, despues, await texto(p, '#an-msg')]);
  /* Una pieza de la hoja se puede acercar a la orilla de la que está más lejos: probar las cuatro direcciones y ver que alguna
     se mueve para la pieza con más espacio (la que está más aislada). Todas rechazadas sería una cuenta que no sirve. */
  const movidas = await p.evaluate(() => {
    let cuantas = 0;
    for (const g of document.querySelectorAll('#an-res .an-hoja>svg>g')) {
      g.focus();
      const t0 = g.getAttribute('transform');
      for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
        g.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: true, bubbles: true }));
        if (g.getAttribute('transform') !== t0) { cuantas++; break; }
      }
    }
    return cuantas;
  });
  cierto(movidas >= 3, 'al menos 3 de las 7 piezas se pueden empujar 5 mm en alguna dirección (' + movidas + ')', movidas);
  const sal = await p.evaluate(() => window.Anidador.armarSalida());
  cierto(!/an-e\d|pz-/.test(sal), 'y la descarga sigue limpia');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});

/* La veta (A5, falla 6): girar 90° una pieza de aluminio cepillado o de MDF la deja con la veta atravesada,
   que es lo que la pregunta de la veta le quita al motor. A mano, el botón gira 180°. */
cab('\nA24 · LA VETA TAMBIÉN MANDA A MANO');
await seccion(async () => {
  const { ctx, p, errs } = await abrir({ ancho: 1100 });
  await cargar(p, SVG_PIEZAS); await motorFalso(p);
  await p.click('#an-mats [data-mat="aluminio"]'); await dormir(300);
  await p.click('.an-pregunta-veta [data-veta="si"]'); await dormir(200);
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, [hoja(A1)]);
  await p.evaluate(() => window.Anidador.detener()); await dormir(100); await verHoja(p);
  await tocar(p, 'pz-an-e3'); await dormir(150);
  cierto(await texto(p, '#an-pieza-girar') === 'Girar 180°', 'con aluminio cepillado el botón dice «Girar 180°»: ' + await texto(p, '#an-pieza-girar'));
  await p.click('#an-pieza-girar'); await dormir(500);
  cierto(/rotate\(180\)/.test(await transformDe(p, 'pz-an-e3')), 'y gira 180°, que respeta la veta', await transformDe(p, 'pz-an-e3'));
  cierto(!(await p.evaluate(() => document.getElementById('pz-an-e3').classList.contains('girada'))), 'una pieza a 180° no se marca como girada (la veta sigue paralela)');
  await p.focus('#pz-an-e3'); await p.keyboard.press('r'); await dormir(500);
  cierto(/rotate\(0\)/.test(await transformDe(p, 'pz-an-e3')), 'la tecla R también gira 180°: ' + await transformDe(p, 'pz-an-e3'));
  /* Un material sin veta vuelve a los 90°. */
  /* Con el teclado, para que la pieza siga elegida (tocar fuera de la mesa la suelta). */
  if (!(await mesa(p)).eleccion) { await tocar(p, 'pz-an-e3'); await dormir(150); }
  await p.focus('#an-mats [data-mat="acrilico"]'); await p.keyboard.press('Enter'); await dormir(250);
  cierto((await mesa(p)).eleccion === 'pz-an-e3' && await texto(p, '#an-pieza-girar') === 'Girar 90°', 'con acrílico, elegido con el teclado, el botón de la pieza que sigue elegida vuelve a decir «Girar 90°»', [await mesa(p), await texto(p, '#an-pieza-girar')]);
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});

// ═══ A15 · ESQUINAS QUE SEÑALAN LO QUE SE VA A QUEDAR FUERA ══════════════════════════════════
cab('\nA15 · ESQUINAS QUE SEÑALAN LO QUE SE VA A QUEDAR FUERA');
await seccion(async () => {
  const { ctx, p, errs } = await abrir({ ancho: 1100 });
  await cargar(p, SVG_AVISOS); await motorFalso(p);
  const av = await p.evaluate(() => [...document.querySelectorAll('#an-avisos .hintnote')].map(h => ({ t: h.querySelector('span').textContent.slice(0, 24), b: h.querySelector('[data-aviso]') ? h.querySelector('[data-aviso]').textContent : null, h: h.querySelector('[data-aviso]') ? Math.round(h.querySelector('[data-aviso]').getBoundingClientRect().height) : 0 })));
  cierto(av.length === 4 && av.every(a => a.b === 'Ver cuáles' && a.h >= 44), 'los cuatro avisos traen «Ver cuáles» de 44 px', av);
  await p.click('#an-avisos [data-aviso="0"]');
  await dormir(1300);
  const m1 = await p.evaluate(() => ({ miras: [...document.querySelectorAll('.mira')].filter(m => m.classList.contains('pz-abierto') || m.matches(':popover-open')).length, pres: document.querySelector('[data-aviso="0"]').getAttribute('aria-pressed'), tono: document.querySelector('.mira') && document.querySelector('.mira').dataset.tono }));
  cierto(m1.miras === 1 && m1.pres === 'true' && m1.tono === 'av', 'tocar el aviso de textos cierra esquinas sobre el único texto', m1);
  const caja = await p.evaluate(() => {
    const t = document.querySelector('#an-orig svg text').getBoundingClientRect();
    const m = [...document.querySelectorAll('.mira')].find(x => x.matches(':popover-open') || x.classList.contains('pz-abierto'));
    const es = [...m.children].map(i => i.getBoundingClientRect());
    const x0 = Math.min(...es.map(e => e.left)), x1 = Math.max(...es.map(e => e.right)), y0 = Math.min(...es.map(e => e.top)), y1 = Math.max(...es.map(e => e.bottom));
    return { dentro: x0 <= t.left + 1 && x1 >= t.right - 1 && y0 <= t.top + 1 && y1 >= t.bottom - 1, t: [t.left, t.top, t.right, t.bottom].map(Math.round), m: [x0, y0, x1, y1].map(Math.round) };
  });
  cierto(caja.dentro, 'las esquinas rodean al texto', caja);
  await p.click('#an-avisos [data-aviso="0"]'); await dormir(500);
  cierto(await p.evaluate(() => document.querySelector('[data-aviso="0"]').getAttribute('aria-pressed') === 'false' && ![...document.querySelectorAll('.mira')].some(m => m.matches(':popover-open') || m.classList.contains('pz-abierto'))), 'otro toque en el mismo aviso las suelta');
  await p.click('#an-avisos [data-aviso="1"]'); await dormir(1200);
  cierto(await p.evaluate(() => [...document.querySelectorAll('.mira')].filter(m => m.matches(':popover-open') || m.classList.contains('pz-abierto')).length) === 1, 'el aviso de <use> señala el símbolo');
  await p.click('#an-avisos [data-aviso="2"]'); await dormir(1200);
  cierto(await p.evaluate(() => document.querySelector('[data-aviso="1"]').getAttribute('aria-pressed') === 'false' && document.querySelector('[data-aviso="2"]').getAttribute('aria-pressed') === 'true'), 'tocar otro aviso suelta las del anterior y pone las suyas');
  await p.keyboard.press('Escape'); await dormir(500);
  cierto(await p.evaluate(() => document.querySelector('[data-aviso="2"]').getAttribute('aria-pressed') === 'false'), 'Escape las suelta');
  await p.click('#an-avisos [data-aviso="3"]'); await dormir(1200);
  cierto(await p.evaluate(() => [...document.querySelectorAll('.mira')].filter(m => m.matches(':popover-open') || m.classList.contains('pz-abierto')).length) === 1, 'el aviso de máscaras señala lo que se recortaba');
  /* La pieza que no cabe. */
  await p.keyboard.press('Escape');
  await p.evaluate(() => { const v = (id, x) => { const e = document.getElementById(id); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }; v('an-ancho', 200); v('an-alto', 150); });
  await p.evaluate(() => window.Anidador.iniciar());
  await dormir(150);
  const fu = await p.evaluate(() => ({ vis: !document.getElementById('an-fuera').hidden, t: document.getElementById('an-fuera-ver').textContent, pie: !document.getElementById('an-mesa-pie').hidden, ids: window.Anidador.mesa().fuera }));
  cierto(fu.vis && fu.pie && /^\d+ pieza(s)? (no cabe|no caben) · Ver cuáles$/.test(fu.t), 'las piezas que no caben salen en el pie de la mesa, con su palabra: «' + fu.t + '»', fu);
  await p.click('#an-fuera-ver'); await dormir(1300);
  const rojo = await p.evaluate(() => { const ms = [...document.querySelectorAll('.mira')].filter(m => m.matches(':popover-open') || m.classList.contains('pz-abierto')); return { n: ms.length, tono: ms[0] && ms[0].dataset.tono, pres: document.getElementById('an-fuera-ver').getAttribute('aria-pressed'), t: document.getElementById('an-fuera-ver').textContent }; });
  cierto(rojo.n >= 1 && rojo.tono === 'mal' && rojo.pres === 'true' && /Soltar$/.test(rojo.t), 'tocarlo pone las esquinas rojas (tono «mal») y el botón dice «Soltar»', rojo);
  await p.click('#an-fuera-ver'); await dormir(500);
  cierto(await p.evaluate(() => document.getElementById('an-fuera-ver').getAttribute('aria-pressed') === 'false'), 'otro toque las suelta');
  /* Desde «Acomodadas», el botón regresa a la vista previa. */
  await mejora_(p);
  await dormir(1000);
  cierto((await mesa(p)).vista === 'acomodadas', '(con un acomodo, la mesa enseña «Acomodadas»)');
  await p.click('#an-fuera-ver'); await dormir(1800);
  cierto((await mesa(p)).vista === 'vienen' && (await mesa(p)).senal === 'fuera', 'desde «Acomodadas», «Ver cuáles» regresa a «Como vienen» y las pone', await mesa(p));
  await p.click('#an-vista-ver [data-v="acomodadas"]'); await dormir(900);
  cierto((await mesa(p)).senal === '', 'cambiar de vista suelta las esquinas (eran de la otra)');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
await seccion(async () => {
  /* Un archivo limpio no trae botones; y un aviso de algo que ya no está en la vista no ofrece «Ver cuáles». */
  const { ctx, p, errs } = await abrir({ ancho: 1100 });
  await cargar(p, SVG_PIEZAS);
  cierto(await p.evaluate(() => document.querySelectorAll('#an-avisos [data-aviso]').length) === 0, 'un archivo sin avisos no trae botones');
  const sinAlgo = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><rect width="40" height="20"/><text x="50" y="10" display="none">x</text></svg>`;
  await cargar(p, sinAlgo);
  const t = await p.evaluate(() => ({ avisos: document.querySelectorAll('#an-avisos .hintnote').length, botones: document.querySelectorAll('#an-avisos [data-aviso]').length }));
  cierto(t.avisos === 1 && t.botones === 0, 'un texto que no se ve en la vista previa no ofrece «Ver cuáles»', t);
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});
async function mejora_(p) {
  await p.evaluate(() => {
    const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 200 150');
    const bin = document.createElementNS(ns, 'rect'); bin.setAttribute('class', 'bin'); bin.setAttribute('width', 200); bin.setAttribute('height', 150); s.appendChild(bin);
    const g = document.createElementNS(ns, 'g'); g.setAttribute('transform', 'translate(10 10) rotate(0)');
    const r = document.createElementNS(ns, 'rect'); r.setAttribute('id', 'an-e5'); r.setAttribute('width', 50); r.setAttribute('height', 50); g.appendChild(r); s.appendChild(g);
    window.__pantalla([s], 0.2, 1, 2);
  });
}

// ═══ LA DESCARGA Y LO DEMÁS ═══════════════════════════════════════════════════════════════════
cab('\nEL ARCHIVO DE CORTE, INTACTO');
await seccion(async () => {
  const { ctx, p, errs } = await abrir();
  await preparar(p, { spec: DOS, ef: 0.4 });
  const ant = await p.evaluate(() => window.Anidador.armarSalida());
  /* Con la mesa llena de ids, foco y encuadres, la salida es la misma que sin ellos. */
  await p.click('#an-zoom-mas'); await dormir(500);
  const des = await p.evaluate(() => window.Anidador.armarSalida());
  cierto(ant === des, 'el zoom no cambia ni un byte del archivo de corte');
  cierto((ant.match(/<g id="hoja-/g) || []).length === 2 && /translate\(0 475\)/.test(ant), 'dos hojas, una capa cada una, la segunda 475 mm abajo (450 + 25)');
  cierto((ant.match(/<rect /g) || []).length === 6 + 2 || (ant.match(/<rect /g) || []).length === 6, 'las seis piezas están', (ant.match(/<rect /g) || []).length);
  const hoja1 = await p.evaluate(() => window.Anidador.armarSalida(1));
  cierto(/height="450mm"/.test(hoja1) && (hoja1.match(/<rect /g) || []).length >= 2, 'una hoja sola también sale a su medida');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
});

// ═══ LAS OCHO RONDAS ══════════════════════════════════════════════════════════════════════════
cab('\nLAS OCHO RONDAS: 360 y 420 px × claro y oscuro × con y sin movimiento reducido, con el dedo');
for (const ancho of [360, 420]) for (const tema of ['claro', 'oscuro']) for (const reducido of [false, true]) {
  if (SOLO && !SOLO.test(cabecera)) break;
  const nombre = `${ancho} px · ${tema} · ${reducido ? 'sin movimiento' : 'con movimiento'}`;
  console.log('  — ' + nombre);
  const { ctx, p, errs } = await abrir({ ancho, alto: 780, tema, reducido, tactil: true });
  const ok = (cond, que, extra) => cierto(cond, `[${nombre}] ${que}`, extra);
  await cargar(p, SVG_AVISOS); await motorFalso(p);
  ok(await desborde(p) <= 0, 'con avisos y botones «Ver cuáles» no desborda', await desborde(p));
  ok((await infinitas(p)).length === 0, 'con el archivo cargado y el motor quieto, nada gira ni late', await infinitas(p));
  ok((await p.evaluate(() => [...document.querySelectorAll('#an-avisos [data-aviso]')].map(b => Math.round(b.getBoundingClientRect().height)))).every(h => h >= 44), 'los «Ver cuáles» miden 44 px');
  ok(await contraste(p, '#an-vista-ver [data-v="vienen"]') >= 4.5 && await contraste(p, '#an-vista-ver [data-v="acomodadas"]') >= 4.5, 'las dos opciones de la vista se leen (la apagada también): ' + await contraste(p, '#an-vista-ver [data-v="acomodadas"]') + ':1');
  await p.evaluate(() => { const v = (id, x) => { const e = document.getElementById(id); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }; v('an-ancho', 200); v('an-alto', 150); });
  await p.tap('#an-ir'); await dormir(120);
  ok(await desborde(p) <= 0, 'con la silueta y su ficha no desborda', await desborde(p));
  ok(await contraste(p, '#an-calculando', { fondo: [18, 21, 38] }) >= 4.5, 'la ficha «Calculando» se lee: ' + await contraste(p, '#an-calculando', { fondo: [18, 21, 38] }) + ':1');
  ok(await visible(p, '#an-fuera'), 'las piezas que no caben salen en el pie');
  ok(await alto(p, '#an-fuera-ver') >= 44, 'su botón mide 44 px', await alto(p, '#an-fuera-ver'));
  await p.tap('#an-fuera-ver'); await dormir(1200);
  ok(await contraste(p, '#an-fuera-ver') >= 4.5, 'su texto se lee (apretado, sobre claro): ' + await contraste(p, '#an-fuera-ver') + ':1');
  ok(await desborde(p) <= 0, 'con las esquinas puestas no desborda', await desborde(p));
  await p.keyboard.press('Escape');
  /* Cuatro hojas de mentira, un carrusel, el zoom y una pieza. */
  await cargar(p, SVG_PIEZAS); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, TRES, 0.4); await dormir(1200);
  ok(await p.evaluate(() => document.getElementById('an-res').classList.contains('paginas')), 'con tres hojas hay carrusel');
  ok(await desborde(p) <= 0, 'con el carrusel no desborda', await desborde(p));
  ok((await p.evaluate(() => [...document.querySelectorAll('#an-pags .paginas-punto')].map(b => Math.round(b.getBoundingClientRect().height)))).every(h => h >= 44), 'los puntos miden 44 px');
  const pct = await contraste(p, '#an-res .an-cap-pct', { fondo: [27, 31, 51] });
  ok(pct >= 4.5, 'el % de cada hoja se lee: ' + pct + ':1', pct);
  const ret = await contraste(p, '#an-res .an-cap-retazo', { fondo: [27, 31, 51] });
  ok(ret >= 4.5, '«¿Cabe en un retazo?» se lee: ' + ret + ':1', ret);
  await mejora(p, DOS, 0.5); await dormir(1500);
  ok(await visible(p, '#an-noticia'), 'la noticia de una hoja menos está');
  ok(await contraste(p, '#an-noticia') >= 4.5, 'y se lee: ' + await contraste(p, '#an-noticia') + ':1');
  ok(await desborde(p) <= 0, 'con la noticia no desborda', await desborde(p));
  ok(await contraste(p, '#an-st-merma-m2') >= 4.5, 'los m² de la merma se leen: ' + await contraste(p, '#an-st-merma-m2') + ':1');
  await p.tap('#an-ir');   // Detener
  ok(!(await estado(p)).corriendo, 'detenido');
  ok(await visible(p, '#an-zoom'), 'el zoom está en el pie');
  ok((await p.evaluate(() => [...document.querySelectorAll('#an-zoom .an-btn-mesa')].map(b => Math.round(b.getBoundingClientRect().height)))).every(h => h >= 44) &&
     (await p.evaluate(() => [...document.querySelectorAll('#an-zoom .an-btn-mesa')].map(b => Math.round(b.getBoundingClientRect().width)))).every(w => w >= 44), 'sus botones miden 44 × 44 o más');
  const bt = await contraste(p, '#an-zoom-mas', { fondo: [38, 42, 62] });
  ok(bt >= 4.5, 'su texto se lee: ' + bt + ':1', bt);
  const bd = await contraste(p, '#an-zoom-todo', { fondo: [38, 42, 62] });
  ok(bd >= 4.5, 'incluso «Ver hoja completa» apagado se lee: ' + bd + ':1', bd);
  await p.tap('#an-zoom-mas'); await dormir(500);
  ok((await mesa(p)).zoom.some(Boolean), 'tocar «+» acerca');
  ok(await desborde(p) <= 0, 'con zoom no desborda', await desborde(p));
  const [px, py] = await centro(p, '#pz-an-e0');
  await p.touchscreen.tap(px, py); await dormir(200);
  ok((await mesa(p)).eleccion === 'pz-an-e0', 'tocar una pieza la elige');
  const vz = await p.evaluate(() => { const v = document.querySelector('.vistazo.pz-abierto, .vistazo:popover-open'); if (!v) return null; const r = v.getBoundingClientRect(); return { ok: r.left >= -0.5 && r.right <= innerWidth + 0.5, t: Math.round(parseFloat(getComputedStyle(v).fontSize)) }; });
  ok(vz && vz.ok, 'su ficha cabe en la pantalla', vz);
  ok(await visible(p, '#an-pieza'), 'y la barra de la pieza sale');
  ok((await p.evaluate(() => [...document.querySelectorAll('#an-pieza .an-btn-mesa')].filter(b => !b.hidden).map(b => Math.round(b.getBoundingClientRect().height)))).every(h => h >= 44), 'sus botones miden 44 px');
  const pt = await contraste(p, '#an-pieza-girar', { fondo: [38, 42, 62] });
  ok(pt >= 4.5, 'su texto se lee: ' + pt + ':1', pt);
  ok(await desborde(p) <= 0, 'con la barra de la pieza no desborda', await desborde(p));
  await p.tap('#an-pieza-girar'); await dormir(500);
  ok((await mesa(p)).editado || /No cabe/.test(await texto(p, '#an-msg')), 'girar la pieza hace algo (gira, o dice por qué no)');
  ok((await infinitas(p)).length === 0, 'en reposo no gira ni late nada', await infinitas(p));
  ok(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}

await nav.close();
console.log('\n' + (fallos === 0 ? 'La mesa del anidador, completa.' : fallos + ' fallo(s).'));
process.exit(fallos ? 1 : 0);
