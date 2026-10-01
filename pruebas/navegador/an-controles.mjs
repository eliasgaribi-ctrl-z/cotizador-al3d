/* EL ANIDADOR, LA COLUMNA DE CONTROLES: PARO, VETA, COTAS, DESCARGA, ORIENTACIÓN Y ARRANQUE.
 *
 * Lo que se defiende, ficha por ficha, y por qué no se ve leyendo el código:
 *
 *   · A4  LA MECHA DEL PARO. El motor se detiene solo con DOS condiciones (25 intentos sin mejorar
 *         Y 40 s desde la última mejora). La mecha es el reloj de los 40 s y la frase dice las dos:
 *         si la mecha se acaba con menos de 25 intentos, el texto tiene que decirlo, o la mecha
 *         miente. Se rellena de golpe al mejorar, y con menos movimiento queda solo la frase.
 *   · A5  LA VETA. Al ELEGIR aluminio o MDF salen los giros de 0° y 180° y una pregunta; «sin veta»
 *         los devuelve. Volver a tocar el material ya elegido no pregunta, y al pasar a uno sin
 *         veta los giros vuelven si nadie los tocó. Las piezas giradas se pintan rayadas.
 *   · A6  LAS COTAS, en el clon de la vista y NUNCA en el archivo que va al motor ni al láser:
 *         el número cambia al teclear, la cota del campo con foco se engruesa y sin escala dice
 *         «¿? mm» en ámbar. Y la silueta se ve también de noche (era lavanda sobre blanco).
 *   · A9  DESHACER CON MECHA al volver a acomodar desde cero: «Recuperar» devuelve el acomodo, la
 *         hoja y la escala con las que se calculó, y no ofrece «Seguir buscando» (el motor ya no
 *         lo tiene). Quitar un retazo ya se deshacía con el mismo aviso.
 *   · A16 DESCARGAR POR HOJA DESDE UN MENÚ, y mandar el archivo con navigator.share si existe.
 *   · A21 LA ORIENTACIÓN DE LA HOJA: la hojita de cada tarjeta gira con «Girar la hoja», y al abrir
 *         la página ya acostada nace girada, sin verse girar.
 *   · A29 EL REFLEJO sobre el logo, una vez al terminar la carga.
 *   · A30 EL ARRANQUE con los cuatro rectángulos del ícono, una sola vez.
 *   · A31 PROBAR CON UN EJEMPLO: las letras del logo, la banda que dice «Ejemplo», el trazo que
 *         se dibuja y se rellena.
 *   · A32 EL TEMA EN CÍRCULO, que ya da js/tema.js: aquí tiene que funcionar, y saltarse con el
 *         motor corriendo.
 *
 * El motor de verdad tarda minutos en dar un segundo acomodo y su paro tarda 40 s; para lo que no
 * es del motor se le sustituye el start() por uno que solo guarda la función de pantalla, y la
 * prueba la llama a mano con hojas de mentira: así cada caso es exacto y dura milisegundos. (El
 * motor de verdad ya lo prueba pruebas/navegador/anidador.mjs.)
 *
 * Ocho rondas —360 y 420 px, claro y oscuro, con y sin movimiento reducido— con el dedo: sin
 * errores de página, sin desborde de lado, sin nada girando en reposo, con zonas de 44 px y el
 * contraste del texto nuevo medido contra el fondo que tiene.
 *
 * Necesita navegador y servidor:  PUERTO=8919 node pruebas/navegador/an-controles.mjs
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const URL_AN = B + '/anidador-vectores/';
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const cierto = (cond, que, extra) => cond ? bien(que) : mal(que, extra);
const dormir = ms => new Promise(r => setTimeout(r, ms));

const SVG_MM = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="200mm" viewBox="0 0 300 200">
  <rect x="10" y="10" width="80" height="40"/><rect x="100" y="10" width="80" height="40"/><rect x="190" y="10" width="80" height="40"/>
  <circle cx="30" cy="100" r="20"/><circle cx="90" cy="100" r="20"/>
  <path fill-rule="evenodd" d="M230 130h60v60h-60zM245 145h30v30h-30z"/>
</svg>`;
/* Sin unidades: la escala falta y hay que pedirla. */
const SVG_PX = `<svg xmlns="http://www.w3.org/2000/svg" width="400px" height="200px" viewBox="0 0 400 200"><rect x="0" y="0" width="150" height="200"/><rect x="250" y="0" width="150" height="200"/></svg>`;
/* Dos tiras de 280 × 40 mm: en una hoja de 100 × 300 solo caben giradas 90° (o 270°). */
const SVG_TIRAS = `<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="100mm" viewBox="0 0 300 100"><rect x="10" y="5" width="280" height="40"/><rect x="10" y="55" width="280" height="40"/></svg>`;

/* ---------------------------------------------------------------------------------------------
   Abrir la página. Un contexto por ronda, con el tema, el ancho y el movimiento pedidos.
   --------------------------------------------------------------------------------------------- */
async function abrir({ ancho = 1100, alto = 900, tema = 'claro', reducido = false, tactil = false, antes, ir = true } = {}) {
  const ctx = await nav.newContext({ viewport: { width: ancho, height: alto }, locale: 'es-MX', serviceWorkers: 'block',
    hasTouch: tactil, isMobile: tactil, deviceScaleFactor: 1, acceptDownloads: true, reducedMotion: reducido ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(t => { try { if (!localStorage.getItem('al3d_tema')) localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  if (antes) await ctx.addInitScript(antes);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  if (ir) { await p.goto(URL_AN, { waitUntil: 'load' }); await p.waitForFunction(() => window.Anidador && !document.getElementById('an-arranque')); }
  return { ctx, p, errs };
}

/* El motor de mentira: start() guarda la función de pantalla y no arranca nada. */
const motorFalso = p => p.evaluate(() => {
  window.SvgNest.start = function (_avance, pantalla) { window.__pantalla = pantalla; return true; };
});
/* Una mejora de mentira: `hojas` hojas de 1200 × 2400 con una pieza, la segunda girada 90°. */
const mejora = (p, hojas, ef, col, tot) => p.evaluate(([h, e, c, t]) => {
  const ns = 'http://www.w3.org/2000/svg', lista = [];
  for (let i = 0; i < h; i++) {
    const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 1200 2400');
    const bin = document.createElementNS(ns, 'rect'); bin.setAttribute('class', 'bin'); bin.setAttribute('width', '1200'); bin.setAttribute('height', '2400');
    s.appendChild(bin);
    const g = document.createElementNS(ns, 'g'); g.setAttribute('transform', 'translate(10 10) rotate(' + (i % 2 ? 90 : 0) + ')');
    const r = document.createElementNS(ns, 'path'); r.setAttribute('d', 'M0 0h200v100h-200z'); g.appendChild(r); s.appendChild(g);
    lista.push(s);
  }
  window.__pantalla(lista, e, c, t);
}, [hojas, ef, col, tot]);
const sinMejora = p => p.evaluate(() => window.__pantalla(null, 0, 0, 0));

const cargar = (p, svg, nombre = 'prueba.svg') => p.evaluate(([s, n]) => window.Anidador.cargarTexto(s, n), [svg, nombre]);
const estado = p => p.evaluate(() => window.Anidador.estado());
const texto = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/ /g, ' ').trim() : null; }, sel);
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => { try { return a.effect.getComputedTiming().iterations === Infinity; } catch (_) { return false; } })
  .map(a => a.animationName || a.transitionProperty || '?'));
const desborde = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const abrirAvanzado = p => p.evaluate(() => { document.getElementById('an-avanzado').open = true; });
const aviso = p => p.evaluate(() => window.Piezas.aviso.vivos());

/* Contraste del color de un elemento contra el primer fondo opaco que tenga detrás; para texto
   de SVG se pasa `fondo` fijo (la hoja blanca). Con los colores ya resueltos por el navegador. */
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
    const a = L(fg), b = L(bg);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }, [sel, fondo || null, propiedad]);
}
/* ¿Cabe entero en la ventana? (un globo pegado al borde de un teléfono de 360). */
const dentroDeLaVentana = (p, sel) => p.evaluate(s => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect();
  return { izq: Math.round(r.left), der: Math.round(r.right), ancho: innerWidth, ok: r.left >= -0.5 && r.right <= innerWidth + 0.5 };
}, sel);
const alto = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null; }, sel);
const abierto = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && e.matches(':popover-open'); }, sel);

// ═══ A4 · LA MECHA DEL PARO ═══════════════════════════════════════════════════════════════════
console.log('\nA4 · LA MECHA DEL PARO');
{
  const { ctx, p, errs } = await abrir();
  /* La frase, pura: las cuatro combinaciones de las dos condiciones. */
  const tp = (ms, n) => p.evaluate(([a, b]) => window.Anidador.textoParo(a, b), [ms, n]);
  cierto(await tp(18000, 18) === 'Sin mejora hace 18 s · faltan 7 intentos y 22 s', 'las dos condiciones pendientes: dice las dos', await tp(18000, 18));
  cierto(await tp(52000, 18) === 'Sin mejora hace 52 s · ya pasó el tiempo, faltan 7 intentos', 'mecha acabada con menos de 25 intentos: el texto lo dice', await tp(52000, 18));
  cierto(await tp(18000, 25) === 'Sin mejora hace 18 s · ya van 25 intentos, faltan 22 s', '25 intentos y tiempo pendiente: dice cuánto falta', await tp(18000, 25));
  cierto(await tp(18000, 24) === 'Sin mejora hace 18 s · faltan 1 intento y 22 s', 'un intento: en singular', await tp(18000, 24));
  cierto(/se detiene ya/.test(await tp(41000, 25)), 'las dos cumplidas: «se detiene ya»');
  cierto(/1 min 05 s/.test(await tp(65000, 3)), 'pasado el minuto se dice en minutos (P.reloj)', await tp(65000, 3));

  await cargar(p, SVG_MM); await motorFalso(p);
  cierto(await p.evaluate(() => document.getElementById('an-paro').hidden), 'sin motor corriendo, el bloque del paro no se ve');
  cierto(await p.evaluate(() => !document.getElementById('an-prog-bar') && !document.querySelector('.an-prog-track')), 'la barra que iba y venía ya no existe');
  await p.evaluate(() => window.Anidador.iniciar());
  cierto((await estado(p)).corriendo, 'arrancó');
  cierto(await p.evaluate(() => document.getElementById('an-paro').hidden), 'antes de la primera mejora no hay de dónde contar: el bloque sigue escondido');
  await mejora(p, 2, 0.5, 6, 6);
  cierto(await p.evaluate(() => !document.getElementById('an-paro').hidden), 'con el primer acomodo aparece bajo «Detener»');
  const orden = await p.evaluate(() => { const ir = document.getElementById('an-ir'), par = document.getElementById('an-paro'); return ir.compareDocumentPosition(par) & Node.DOCUMENT_POSITION_FOLLOWING; });
  cierto(!!orden, 'y va debajo del botón');
  const mecha = () => p.evaluate(() => {
    const m = document.querySelector('#an-mecha-paro .mecha'); if (!m) return null;
    const a = m.getAnimations()[0];
    return a ? { dur: a.effect.getComputedTiming().duration, t: Math.round(a.currentTime), estado: a.playState } : { sinAnimacion: true };
  });
  let m = await mecha();
  cierto(m && m.dur === 40000 && m.estado === 'running', 'la mecha dura exactamente LIMITE_MS (40 s) y corre', m);
  cierto(/^Sin mejora hace \d+ s · faltan 25 intentos y \d+ s$/.test(await texto(p, '#an-paro-t')), 'la frase: «' + await texto(p, '#an-paro-t') + '»');
  /* El hilo se consume: tras 2.2 s va por ~2200 ms. */
  await dormir(2200);
  m = await mecha();
  cierto(m && m.t >= 1900 && m.t <= 3500, 'a los 2 s la mecha va por ~2 s', m);
  for (let i = 0; i < 5; i++) await sinMejora(p);
  cierto(/faltan 20 intentos y \d+ s$/.test(await texto(p, '#an-paro-t')), 'cinco intentos sin mejorar y la frase lo cuenta: «' + await texto(p, '#an-paro-t') + '»');
  /* Una mejora rellena la mecha de golpe y pone los intentos en cero. */
  await mejora(p, 2, 0.6, 6, 6);
  m = await mecha();
  cierto(m && m.t < 400, 'al mejorar la mecha se rellena de golpe', m);
  cierto(/^Sin mejora hace 0 s · faltan 25 intentos y 40 s$/.test(await texto(p, '#an-paro-t')), 'y la frase vuelve a empezar: «' + await texto(p, '#an-paro-t') + '»');
  cierto((await p.evaluate(() => document.querySelectorAll('#an-mecha-paro .mecha').length)) === 1, 'una sola mecha, no una por mejora');
  /* La mecha vacía con pocos intentos: el reloj corre +45 s y el texto no miente. */
  await p.evaluate(() => { const real = Date.now.bind(Date); window.__salto = 45000; Date.now = () => real() + window.__salto; });
  await sinMejora(p);
  cierto(/ya pasó el tiempo, faltan 24 intentos$/.test(await texto(p, '#an-paro-t')) && (await estado(p)).corriendo,
    'mecha acabada y 1 intento: NO se detiene y la frase dice que faltan intentos: «' + await texto(p, '#an-paro-t') + '»');
  /* Hasta completar los 25, y entonces sí. */
  for (let i = 0; i < 24; i++) await sinMejora(p);
  const e = await estado(p);
  cierto(!e.corriendo && e.detenidoSolo, 'con las dos cumplidas se detiene solo', e);
  cierto(await p.evaluate(() => document.getElementById('an-paro').hidden && !document.querySelector('#an-mecha-paro .mecha')), 'y el bloque y la mecha se quitan');
  cierto(/Se detuvo solo: 25 intentos y 40 s/.test(await texto(p, '#an-msg')), 'el mensaje de siempre dice por qué se detuvo');
  cierto((await infinitas(p)).length === 0, 'en reposo no gira ni late nada', await infinitas(p));
  /* «Seguir buscando» vuelve a encender la mecha en cuanto hay un acomodo del que contar: ya lo hay. */
  await p.evaluate(() => { window.__salto = 0; });
  await p.evaluate(() => document.getElementById('an-seguir').click());
  cierto(await p.evaluate(() => !document.getElementById('an-paro').hidden && !!document.querySelector('#an-mecha-paro .mecha')), '«Seguir buscando» vuelve a encender la mecha');
  cierto(/^Sin mejora hace 0 s/.test(await texto(p, '#an-paro-t')), 'contando desde cero');
  await p.evaluate(() => window.Anidador.detener());
  cierto(await p.evaluate(() => document.getElementById('an-paro').hidden), '«Detener» la esconde');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}
{
  /* Con menos movimiento queda solo la frase. */
  const { ctx, p, errs } = await abrir({ reducido: true });
  await cargar(p, SVG_MM); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar()); await mejora(p, 1, 0.5, 6, 6);
  cierto(await p.evaluate(() => getComputedStyle(document.querySelector('.an-paro-hilo')).display === 'none'), 'con menos movimiento la mecha ni se ve');
  cierto(/^Sin mejora hace \d+ s · faltan/.test(await texto(p, '#an-paro-t')) && await p.evaluate(() => document.getElementById('an-paro-t').getBoundingClientRect().height > 0),
    'y la frase se queda, con su cuenta');
  await dormir(1200);
  cierto(/Sin mejora hace [1-9] s/.test(await texto(p, '#an-paro-t')), 'y sigue contando cada segundo: «' + await texto(p, '#an-paro-t') + '»');
  await p.evaluate(() => window.Anidador.detener());
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}

// ═══ A5 · LA VETA ═════════════════════════════════════════════════════════════════════════════
console.log('\nA5 · LA VETA');
{
  const { ctx, p, errs } = await abrir();
  await cargar(p, SVG_MM);
  const rot = () => p.inputValue('#an-rot');
  cierto(await rot() === '4', 'de entrada: cada 90° (como siempre)');
  for (const mat of ['acrilico', 'galvanizada', 'alucobond']) {
    await p.click(`#an-mats [data-mat="${mat}"]`);
    cierto(await rot() === '4' && !(await abierto(p, '.an-pregunta-veta')), `${mat}: no tiene veta, no pregunta y no toca los giros`);
  }
  await p.click('#an-mats [data-mat="aluminio"]');
  cierto(await rot() === '2', 'aluminio: por omisión quedan solo 0° y 180°');
  cierto(await abierto(p, '.an-pregunta-veta'), 'y sale la pregunta');
  const t = await texto(p, '.an-pregunta-veta');
  cierto(/¿Lleva veta\?/.test(t) && /0° y 180°/.test(t) && /blanco, negro o pintado/.test(t), 'dice que es una pregunta y que el aluminio blanco, negro o pintado no tiene veta', t);
  cierto((await estado(p)).veta, 'estado: lleva veta');
  cierto(await p.evaluate(() => document.getElementById('an-mesa').classList.contains('con-veta')), 'y la mesa enciende el rayado de las giradas');
  cierto(await p.evaluate(() => { const a = document.querySelector('#an-mats [data-mat="aluminio"]'); return a.getAttribute('aria-expanded') === 'true' && !!a.getAttribute('aria-controls'); }), 'el globo está atado a la ficha del material (aria-expanded + aria-controls)');
  /* Escape cierra y devuelve el foco a la ficha; los giros se quedan en 0° y 180°. */
  await p.keyboard.press('Escape');
  cierto(!(await abierto(p, '.an-pregunta-veta')) && await p.evaluate(() => document.activeElement.getAttribute('data-mat')) === 'aluminio', 'Escape la cierra y el foco vuelve a la ficha');
  cierto(await rot() === '2', 'no contestar es «dejar así»: siguen 0° y 180°');
  /* Volver a tocar el material ya elegido no es elegir otro: no repite la pregunta. */
  await p.click('#an-mats [data-mat="aluminio"]');
  cierto(!(await abierto(p, '.an-pregunta-veta')) && await rot() === '2', 'volver a tocar aluminio no repite la pregunta');
  /* De aluminio a un material sin veta: si los quitó la veta y nadie los tocó, vuelven. */
  await p.click('#an-mats [data-mat="acrilico"]');
  cierto(await rot() === '4', 'de aluminio a acrílico los 4 giros vuelven (los había quitado la veta)');
  /* MDF pregunta igual; «Sin veta» devuelve los 4 giros y lo recuerda. */
  await p.click('#an-mats [data-mat="mdf"]');
  cierto(await abierto(p, '.an-pregunta-veta') && await rot() === '2', 'MDF también pregunta');
  await p.click('.an-pregunta-veta [data-veta="no"]');
  cierto(await rot() === '4' && !(await abierto(p, '.an-pregunta-veta')), '«Sin veta: cada 90°» devuelve los 4 giros y cierra');
  cierto(!(await estado(p)).veta && !(await p.evaluate(() => document.getElementById('an-mesa').classList.contains('con-veta'))), 'y la mesa deja de rayar');
  cierto((await aviso(p)).some(a => /no tiene veta/.test(a.msg)), 'con un aviso que lo dice');
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => window.Anidador && !document.getElementById('an-arranque'));
  cierto(await rot() === '4' && (await estado(p)).material === 'mdf' && !(await abierto(p, '.an-pregunta-veta')) && !(await estado(p)).veta,
    'al abrir la página otra vez: MDF, 4 giros, sin preguntar y sin rayar (la respuesta se guardó)');
  /* Elegir OTRO material con veta vuelve a preguntar. */
  await p.click('#an-mats [data-mat="aluminio"]');
  cierto(await abierto(p, '.an-pregunta-veta') && await rot() === '2', 'elegir otro material con veta vuelve a preguntar');
  await p.click('.an-pregunta-veta [data-veta="si"]');
  cierto(!(await abierto(p, '.an-pregunta-veta')) && await rot() === '2', '«Dejar así» cierra y deja 0° y 180°');
  /* Un giro que ya respeta la veta no pregunta nada. */
  await p.click('#an-mats [data-mat="acrilico"]');
  await abrirAvanzado(p); await p.selectOption('#an-rot', '1');
  await p.click('#an-mats [data-mat="aluminio"]');
  cierto(await rot() === '1' && !(await abierto(p, '.an-pregunta-veta')), 'con «Ninguno» ya se respeta la veta: no se toca y no se pregunta');
  /* Teclado: Enter en la ficha abre; el foco entra al globo; Tab llega a los botones. */
  await p.click('#an-mats [data-mat="acrilico"]'); await p.selectOption('#an-rot', '4');
  await p.focus('#an-mats [data-mat="galvanizada"]');
  await p.focus('#an-mats [data-mat="mdf"]'); await p.keyboard.press('Enter');
  cierto(await abierto(p, '.an-pregunta-veta') && await p.evaluate(() => !!document.activeElement.closest('.an-pregunta-veta')), 'con el teclado: Enter abre la pregunta y el foco entra');
  await p.keyboard.press('Tab');
  cierto(await p.evaluate(() => document.activeElement.getAttribute('data-veta')) === 'no', 'Tab llega a «Sin veta»');
  await p.keyboard.press('Tab');
  cierto(await p.evaluate(() => document.activeElement.getAttribute('data-veta')) === 'si', 'y a «Dejar así»');
  await p.keyboard.press('Enter');
  cierto(!(await abierto(p, '.an-pregunta-veta')) && await rot() === '2', 'Enter en «Dejar así» cierra');
  /* Cambiar los giros a mano olvida lo que había: al volver a un material sin veta no los pisa. */
  await p.click('#an-mats [data-mat="acrilico"]');
  cierto(await rot() === '4', 'acrílico: 4 giros otra vez');
  await p.click('#an-mats [data-mat="aluminio"]'); await p.keyboard.press('Escape');
  await p.selectOption('#an-rot', '8');
  await p.click('#an-mats [data-mat="acrilico"]');
  cierto(await rot() === '8', 'si alguien eligió los giros a mano, cambiar a un material sin veta no se los quita');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}
{
  /* El rayado, en la mesa. Dos tiras de 280 × 40 en una hoja de 100 × 300 solo caben giradas. */
  const { ctx, p, errs } = await abrir();
  await cargar(p, SVG_TIRAS); await motorFalso(p);
  await p.fill('#an-ancho', '100'); await p.fill('#an-alto', '300');
  await p.click('#an-mats [data-mat="aluminio"]'); await p.click('.an-pregunta-veta [data-veta="si"]');
  await abrirAvanzado(p); await p.selectOption('#an-rot', '4');
  await p.evaluate(() => window.Anidador.iniciar());
  await mejora(p, 2, 0.5, 2, 2);
  const r = await p.evaluate(() => [...document.querySelectorAll('#an-res .an-hoja>svg>g')].map(g => ({ t: g.getAttribute('transform'), girada: g.classList.contains('girada') })));
  cierto(r.length === 2 && !r[0].girada && r[1].girada, 'la pieza con rotate(90) se marca «girada» y la de rotate(0) no', r);
  const relleno = () => p.evaluate(() => { const g = document.querySelectorAll('#an-res .an-hoja>svg>g'); return [...g].map(x => getComputedStyle(x.firstElementChild).fill); });
  let f = await relleno();
  cierto(/^url\(.*#an-raya-\d"?\)$/.test(f[1]) && !/url/.test(f[0]), 'con veta, solo la girada se rellena con el patrón de rayas', f);
  cierto(await p.evaluate(() => !!document.getElementById('an-raya-0') && document.querySelectorAll('pattern[id^="an-raya-"]').length === 6), 'hay un patrón por cada uno de los seis tonos');
  await p.click('#an-mats [data-mat="acrilico"]');
  f = await relleno();
  cierto(!f.some(x => /url/.test(x)), 'sin veta (acrílico) no se raya nada', f);
  /* Los giros de 45° también cruzan la veta; el 180° no. */
  await p.click('#an-mats [data-mat="mdf"]'); await p.click('.an-pregunta-veta [data-veta="si"]');
  await p.evaluate(() => {
    const gs = document.querySelectorAll('#an-res .an-hoja>svg>g');
    gs[0].setAttribute('transform', 'translate(0 0) rotate(180)'); gs[1].setAttribute('transform', 'translate(0 0) rotate(45)');
    const rc = document.getElementById('an-res'); rc.appendChild(document.createElement('span')); rc.lastChild.remove();
  });
  await dormir(80);
  const g45 = await p.evaluate(() => [...document.querySelectorAll('#an-res .an-hoja>svg>g')].map(g => g.classList.contains('girada')));
  cierto(g45[0] === false && g45[1] === true, '180° no se raya y 45° sí (cruza la veta)', g45);
  /* El archivo de corte no lleva clases ni rayas: se descarga como siempre. */
  const salida = await p.evaluate(() => window.Anidador.armarSalida());
  cierto(!/girada|an-raya|class="an-p/.test(salida), 'el SVG de salida no trae nada del rayado ni de los colores de la mesa');
  await p.evaluate(() => window.Anidador.detener());
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}

// ═══ A6 · LAS COTAS ═══════════════════════════════════════════════════════════════════════════
console.log('\nA6 · LAS COTAS SOBRE EL DIBUJO');
for (const tema of ['claro', 'oscuro']) {
  const { ctx, p, errs } = await abrir({ tema });
  console.log('  — tema ' + tema);
  await cargar(p, SVG_MM);
  const cotas = () => p.evaluate(() => ({
    ancho: (document.querySelector('#an-orig .an-cota-ancho .num') || {}).textContent,
    alto: (document.querySelector('#an-orig .an-cota-alto .num') || {}).textContent,
    n: document.querySelectorAll('#an-orig .an-cotas').length,
  }));
  let c = await cotas();
  const limpia = s => (s || '').replace(/ /g, ' ');
  cierto(c.n === 1 && limpia(c.ancho) === '280 mm' && limpia(c.alto) === '180 mm', 'dos cotas sobre la silueta: «280 mm» de ancho y «180 mm» de alto', c);
  cierto(await p.evaluate(() => !!document.querySelector('#an-orig .an-cotas[aria-hidden="true"]')), 'son adorno para el lector de pantalla (los números están en los campos)');
  /* Teclear cambia el número, y el otro lado se calcula. */
  await p.fill('#an-ancho-d', '140');
  c = await cotas();
  cierto(limpia(c.ancho) === '140 mm' && limpia(c.alto) === '90 mm' && c.n === 1, 'al teclear 140 la cota dice «140 mm» y la otra «90 mm», sin duplicarse', c);
  /* La cota del campo con foco se enciende. */
  const grosor = () => p.evaluate(() => ({
    a: parseFloat(getComputedStyle(document.querySelector('#an-orig .an-cota-ancho .linea')).strokeWidth),
    l: parseFloat(getComputedStyle(document.querySelector('#an-orig .an-cota-alto .linea')).strokeWidth) }));
  await p.focus('#an-ancho-d'); await dormir(250);
  let g = await grosor();
  cierto(g.a > g.l + 1, 'con el foco en el ancho, la cota del ancho se engruesa y la otra no', g);
  await p.focus('#an-alto-d'); await dormir(250);
  g = await grosor();
  cierto(g.l > g.a + 1, 'con el foco en el alto, es la del alto', g);
  await p.type('#an-alto-d', '1');   // teclear reconstruye las cotas: la enfocada se queda enfocada
  g = await grosor();
  cierto(g.l > g.a + 1, 'y teclear (que redibuja las cotas) no le quita el encendido', g);
  await p.evaluate(() => document.activeElement.blur()); await dormir(250);
  g = await grosor();
  cierto(Math.abs(g.l - g.a) < 0.5, 'sin foco, las dos iguales', g);
  /* Nunca en lo que va al motor ni al láser. */
  await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar()); await mejora(p, 1, 0.5, 6, 6);
  const salida = await p.evaluate(() => window.Anidador.armarSalida());
  cierto(!/an-cota|¿\?|\bmm<\/text>/.test(salida) && !/<text/.test(salida), 'el SVG de salida no lleva cotas');
  await p.evaluate(() => window.Anidador.detener());
  /* Contraste del número contra la hoja blanca, en los dos temas. */
  await cargar(p, SVG_MM);
  const razon = await contraste(p, '#an-orig .an-cota-ancho .num', { fondo: [255, 255, 255], propiedad: 'fill' });
  cierto(razon >= 4.5, 'el número de la cota, en tinta contra la hoja blanca: ' + razon + ':1', razon);
  /* La silueta también se ve de noche: tinta fija sobre hoja blanca. */
  const sil = await contraste(p, '#an-orig svg>rect', { fondo: [255, 255, 255], propiedad: 'fill' });
  cierto(sil >= 7, 'la silueta contra la hoja blanca: ' + sil + ':1' + (tema === 'oscuro' ? ' (de noche era lavanda sobre blanco)' : ''), sil);
  /* Cabe todo: las cotas no se recortan contra el borde del lienzo. */
  const recortado = await p.evaluate(() => {
    const svg = document.querySelector('#an-orig svg'), r = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('.an-cotas .num')].filter(t => { const b = t.getBoundingClientRect(); return b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1; }).length;
  });
  cierto(recortado === 0, 'los dos números caben dentro de la hoja (el lienzo se agranda para las cotas)');
  /* Sin escala: «¿? mm» en ámbar. */
  await cargar(p, SVG_PX, 'sin-escala.svg');
  c = await cotas();
  cierto(limpia(c.ancho) === '¿? mm' && limpia(c.alto) === '¿? mm', 'sin escala las dos dicen «¿? mm»', c);
  const rf = await contraste(p, '#an-orig .an-cota-ancho .num.falta', { fondo: [255, 255, 255], propiedad: 'fill' });
  const color = await p.evaluate(() => getComputedStyle(document.querySelector('#an-orig .an-cota-ancho .num')).fill);
  cierto(rf >= 4.5 && color === 'rgb(138, 81, 0)', 'en el ámbar oscuro de --av: ' + rf + ':1 (' + color + ')', rf);
  await p.fill('#an-ancho-d', '200');
  c = await cotas();
  cierto(limpia(c.ancho) === '200 mm' && limpia(c.alto) === '100 mm' && !(await p.evaluate(() => !!document.querySelector('#an-orig .num.falta'))), 'al dar la medida dejan el ámbar y dicen los mm', c);
  await p.fill('#an-ancho-d', '');
  c = await cotas();
  cierto(limpia(c.ancho) === '¿? mm', 'y al vaciar el campo vuelven a pedirla', c);
  /* El lienzo original no se agranda con cada tecla. */
  const vb = () => p.evaluate(() => document.querySelector('#an-orig svg').getAttribute('viewBox'));
  const antes = await vb(); await p.type('#an-ancho-d', '1'); await p.type('#an-ancho-d', '2'); await p.type('#an-ancho-d', '3');
  cierto(await vb() === antes, 'teclear no agranda el lienzo cada vez', [antes, await vb()]);
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}

// ═══ A9 · DESHACER CON MECHA ══════════════════════════════════════════════════════════════════
console.log('\nA9 · DESHACER CON MECHA AL VOLVER A ACOMODAR');
{
  const { ctx, p, errs } = await abrir();
  await cargar(p, SVG_MM); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar()); await mejora(p, 2, 0.78, 6, 6);
  cierto((await aviso(p)).length === 0, 'la primera vez no hay nada que recuperar: no sale ningún aviso');
  await p.evaluate(() => window.Anidador.detener());
  cierto(await texto(p, '#an-ir') === 'Volver a acomodar desde cero', 'el botón ofrece volver a acomodar desde cero');
  /* Otra hoja: «Seguir buscando» ya no vale y el acomodo anterior se tiraría. */
  await p.fill('#an-sep', '5');
  await p.click('#an-ir');
  const a1 = await aviso(p);
  cierto(a1.length === 1 && /^Se guardó el acomodo anterior \(78 %, 2 hojas\)$/.test(a1[0].msg) && a1[0].label === 'Recuperar', 'sale «Se guardó el acomodo anterior (78 %, 2 hojas)» con «Recuperar»', a1);
  cierto(a1[0] && a1[0].resta > 6500 && a1[0].resta <= 8000, 'con la mecha de 8 s del contrato (§6.2)', a1[0] && a1[0].resta);
  cierto(await p.evaluate(() => !!document.querySelector('#toast .toast-uno .mecha')), 'y se ve la mecha');
  cierto((await estado(p)).anterior, 'T.anterior guarda el acomodo');
  cierto((await estado(p)).corriendo && (await estado(p)).mejor === null, 'mientras, el motor arrancó de cero');
  /* Recuperar con el teclado, desde el aviso. */
  await p.focus('#toast .toast-act'); await p.keyboard.press('Enter');
  await dormir(150);
  const e = await estado(p);
  cierto(!e.corriendo && e.mejor && Math.abs(e.mejor.eficiencia - 0.78) < 1e-9 && e.mejor.hojas === 2, 'Recuperar detiene lo nuevo y devuelve el acomodo (78 %, 2 hojas)', e.mejor);
  cierto(await p.inputValue('#an-sep') === '3', 'y devuelve la hoja y la separación con las que se calculó (3 mm, no los 5 de ahora)');
  cierto(await p.evaluate(() => document.getElementById('an-seguir').hidden), '«Seguir buscando» sigue escondido: el motor ya no lo tiene');
  cierto(await p.evaluate(() => !document.getElementById('an-dl').disabled), 'queda listo para descargar');
  cierto(await p.evaluate(() => document.querySelectorAll('#an-res figure.an-hoja').length) === 2, 'y las dos hojas se vuelven a ver en la mesa');
  cierto(/Recuperado el acomodo anterior \(78 %, 2 hojas\)/.test(await texto(p, '#an-msg')), 'el mensaje lo dice: «' + await texto(p, '#an-msg') + '»');
  cierto(await texto(p, '#an-st-uso') !== '—' && (await texto(p, '#an-st-hojas')) === '2', 'y el marcador enseña el acomodo recuperado');
  cierto(!(await estado(p)).anterior, 'ya no queda «anterior»');
  /* Con el dedo, en otra página: el mismo camino con tap. */
  await ctx.close();
}
{
  const { ctx, p, errs } = await abrir({ ancho: 420, tactil: true });
  await cargar(p, SVG_MM); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar()); await mejora(p, 1, 0.5, 6, 6);
  await p.evaluate(() => window.Anidador.detener());
  await p.tap('#an-ir');
  cierto((await aviso(p)).length === 1, 'con el dedo, el mismo aviso (1 hoja → «1 hoja», en singular): ' + JSON.stringify((await aviso(p)).map(a => a.msg)));
  cierto(/\(50 %, 1 hoja\)/.test((await aviso(p))[0].msg), 'singular correcto');
  cierto(await alto(p, '#toast .toast-act') >= 44, '«Recuperar» mide 44 px con el dedo', await alto(p, '#toast .toast-act'));
  await p.tap('#toast .toast-act'); await dormir(150);
  cierto(!(await estado(p)).corriendo && (await estado(p)).mejor && (await estado(p)).mejor.eficiencia === 0.5, 'tocar «Recuperar» lo devuelve');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}
{
  /* El aviso solo vale mientras el archivo y el acomodo guardado sean los mismos. */
  const { ctx, p, errs } = await abrir();
  await cargar(p, SVG_MM); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar()); await mejora(p, 1, 0.5, 6, 6); await p.evaluate(() => window.Anidador.detener());
  await p.click('#an-ir');
  await p.evaluate(() => { window.__viejo = document.querySelector('#toast .toast-act'); });
  await cargar(p, SVG_TIRAS, 'otro.svg');
  await p.evaluate(() => window.__viejo.click()); await dormir(150);
  cierto((await estado(p)).mejor === null && (await estado(p)).archivo.nombre === 'otro.svg', 'si entre tanto se cargó otro SVG, «Recuperar» no resucita el acomodo del archivo anterior');
  /* Dos «volver a acomodar» seguidos: el primer aviso ya no vale, el segundo sí. */
  await cargar(p, SVG_MM); await p.evaluate(() => window.Anidador.iniciar()); await mejora(p, 1, 0.4, 6, 6); await p.evaluate(() => window.Anidador.detener());
  await p.click('#an-ir'); await mejora(p, 1, 0.6, 6, 6); await p.evaluate(() => window.Anidador.detener());
  await p.evaluate(() => { window.__primero = document.querySelector('#toast .toast-act'); });
  await p.click('#an-ir');
  await p.evaluate(() => window.__primero && window.__primero.click()); await dormir(150);
  const s = await estado(p);
  cierto(s.corriendo, 'el aviso del primer «volver a acomodar» ya no recupera nada (hay otro acomodo guardado después)', s);
  await p.evaluate(() => window.Anidador.detener());
  /* Si el motor no arranca, el acomodo de antes no se pierde. */
  await p.evaluate(() => { window.SvgNest.start = () => false; });
  await cargar(p, SVG_MM); await p.evaluate(() => { window.SvgNest.start = function (a, d) { window.__pantalla = d; return true; }; });
  await p.evaluate(() => window.Anidador.iniciar()); await mejora(p, 1, 0.5, 6, 6); await p.evaluate(() => window.Anidador.detener());
  await p.evaluate(() => { window.SvgNest.start = () => false; });
  await p.click('#an-ir');
  cierto((await estado(p)).mejor && (await estado(p)).mejor.eficiencia === 0.5 && await p.evaluate(() => !document.getElementById('an-dl').disabled), 'si el motor no pudo arrancar, el acomodo de antes sigue ahí y se puede descargar');
  cierto(await p.evaluate(() => document.getElementById('an-seguir').hidden), 'y sin «Seguir buscando»');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}
{
  /* Con el motor DE VERDAD: las hojas que guarda T.anterior son nodos del DOM que el motor creó, y
     config() y parsesvg() de la corrida nueva no pueden dejarlos vacíos ni a medias. Seis piezas en
     hojas de 100 × 100: no caben en una. */
  const { ctx, p, errs } = await abrir();
  await cargar(p, SVG_MM);
  await p.fill('#an-ancho', '100'); await p.fill('#an-alto', '100'); await p.fill('#an-sep', '3');
  await p.evaluate(() => window.Anidador.iniciar());
  let llego = false;
  for (let i = 0; i < 360 && !llego; i++) { llego = !!(await estado(p)).mejor; if (!llego) await dormir(250); }
  cierto(llego, 'el motor de verdad da un primer acomodo');
  await p.evaluate(() => window.Anidador.detener());
  const antes = await p.evaluate(() => ({ hojas: document.querySelectorAll('#an-res figure.an-hoja').length, piezas: document.querySelectorAll('#an-res .an-hoja>svg>g').length, ef: window.Anidador.estado().mejor.eficiencia }));
  await p.fill('#an-sep', '5');
  await p.click('#an-ir');
  cierto((await aviso(p)).some(a => a.label === 'Recuperar' && new RegExp('\\(' + Math.round(antes.ef * 100) + ' %, ' + antes.hojas + ' hojas\\)').test(a.msg)), 'el aviso dice el acomodo que tenía (' + Math.round(antes.ef * 100) + ' %, ' + antes.hojas + ' hojas)', await aviso(p));
  await dormir(1500);   // la corrida nueva ya está pintando lo suyo
  await p.click('#toast .toast-act'); await dormir(300);
  const luego = await p.evaluate(() => ({ hojas: document.querySelectorAll('#an-res figure.an-hoja').length, piezas: document.querySelectorAll('#an-res .an-hoja>svg>g').length,
    ef: window.Anidador.estado().mejor.eficiencia, sep: document.getElementById('an-sep').value, corriendo: window.Anidador.estado().corriendo,
    caja: [...document.querySelectorAll('#an-res .an-hoja>svg')].every(s => s.getBoundingClientRect().width > 50) }));
  cierto(!luego.corriendo && luego.hojas === antes.hojas && luego.piezas === antes.piezas && luego.ef === antes.ef && luego.sep === '3' && luego.caja,
    'Recuperar vuelve a pintar las mismas hojas y piezas del motor de verdad, con su separación', { antes, luego });
  const salida = await p.evaluate(() => window.Anidador.armarSalida());
  cierto((salida.match(/<g id="hoja-\d+"/g) || []).length === antes.hojas, 'y el archivo que se descarga tiene las mismas hojas');
  cierto(await p.evaluate(() => document.getElementById('an-seguir').hidden), 'sin «Seguir buscando»');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}
{
  /* Quitar un retazo: ya se deshacía con el aviso de la pieza 12; se comprueba que siga con su mecha. */
  const { ctx, p, errs } = await abrir();
  await p.click('.an-tile[data-hoja="retazo"]');
  await p.fill('#an-ancho', '500'); await p.fill('#an-alto', '300');
  await p.fill('#an-retazo-nombre', 'Sobrante de prueba'); await p.click('#an-retazo-guardar');
  cierto((await estado(p)).retazos.length === 1, 'un retazo guardado');
  await p.click('.an-retazo-x');
  cierto((await estado(p)).retazos.length === 0, 'la × lo quita');
  const av = await aviso(p);
  cierto(av.some(a => /quitado/.test(a.msg) && a.label === 'Deshacer' && a.resta > 6500) && await p.evaluate(() => !!document.querySelector('#toast .toast-uno .mecha')), 'con «Deshacer» y su mecha de 8 s', av);
  await p.click('#toast .toast-act'); await dormir(150);
  cierto((await estado(p)).retazos.length === 1, 'Deshacer lo devuelve');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}

// ═══ A16 · DESCARGAR POR HOJA DESDE UN MENÚ ═══════════════════════════════════════════════════
console.log('\nA16 · DESCARGAR POR HOJA DESDE UN MENÚ');
{
  const { ctx, p, errs } = await abrir();
  await cargar(p, SVG_MM); await motorFalso(p);
  cierto(await p.evaluate(() => document.getElementById('an-dl').disabled && !document.getElementById('an-dl-hojas')), 'sin acomodo, «Descargar SVG» está apagado y ya no hay fila de botones por hoja');
  await p.evaluate(() => window.Anidador.iniciar());
  /* Una hoja y sin dónde compartir: descarga directo, sin flecha ni menú. */
  await mejora(p, 1, 0.5, 6, 6);
  cierto(await p.evaluate(() => { const b = document.getElementById('an-dl'); return !b.disabled && document.getElementById('an-dl-flecha').hidden && !b.hasAttribute('aria-haspopup'); }), 'con una hoja y sin compartir: sin flecha y sin aria-haspopup');
  let [d] = await Promise.all([p.waitForEvent('download'), p.click('#an-dl')]);
  cierto(/-acrilico-acomodado\.svg$/.test(d.suggestedFilename()) && !(await abierto(p, '.an-menu-dl')), 'y un clic descarga directo: ' + d.suggestedFilename());
  /* Tres hojas: el menú. */
  await mejora(p, 3, 0.6, 6, 6);
  cierto(await p.evaluate(() => !document.getElementById('an-dl-flecha').hidden && document.getElementById('an-dl').getAttribute('aria-haspopup') === 'menu'), 'con tres hojas: flecha y aria-haspopup="menu"');
  await p.click('#an-dl');
  cierto(await abierto(p, '.an-menu-dl'), 'el clic abre el menú');
  await dormir(260);   // el globo entra con un escalado de 0.98: se mide asentado
  const items = await p.evaluate(() => [...document.querySelectorAll('.an-menu-dl [role="menuitem"]')].map(b => ({ t: b.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(b.getBoundingClientRect().height) })));
  cierto(items.map(i => i.t).join('|') === 'Todas las hojas una capa por hoja|Hoja 1|Hoja 2|Hoja 3', 'Todas (una capa por hoja), Hoja 1, 2 y 3 — y no «Compartir» porque aquí no hay con qué', items.map(i => i.t));
  cierto(items.every(i => i.h >= 44), 'renglones de 44 px', items.map(i => i.h));
  cierto(await p.evaluate(() => document.getElementById('an-dl').getAttribute('aria-expanded') === 'true'), 'aria-expanded="true" en el botón');
  cierto(await p.evaluate(() => document.querySelector('.an-menu-dl').getAttribute('role') === 'menu'), 'rol de menú');
  cierto(await p.evaluate(() => document.activeElement.textContent.includes('Todas las hojas')), 'el foco entra al primer renglón');
  /* Un solo resaltado que viaja con transform. */
  await p.keyboard.press('ArrowDown');
  cierto(await p.evaluate(() => document.activeElement.textContent.trim() === 'Hoja 1'), 'las flechas mueven el foco (↓ → Hoja 1)');
  await dormir(260);
  const res = () => p.evaluate(() => { const r = document.querySelector('.an-menu-resalte'); const cs = getComputedStyle(r); return { n: document.querySelectorAll('.an-menu-resalte').length, on: r.classList.contains('on'), op: cs.opacity, tr: cs.transform, y: Math.round(new DOMMatrix(cs.transform).m42), h: r.style.height }; });
  let r1 = await res();
  cierto(r1.n === 1 && r1.on && r1.y > 40 && r1.h, 'el resaltado es UN div y se puso sobre el renglón enfocado', r1);
  await p.keyboard.press('ArrowDown'); await dormir(260);
  const r2 = await res();
  cierto(r2.y > r1.y, 'y viajó al siguiente con transform (' + r1.y + ' → ' + r2.y + ')', [r1, r2]);
  const caja3 = await p.evaluate(() => { const b = [...document.querySelectorAll('.an-menu-dl [role="menuitem"]')][3].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await p.mouse.move(caja3.x, caja3.y); await dormir(300);
  const r3 = await res();
  cierto(r3.y > r2.y, 'con el puntero también (→ Hoja 3, y=' + r3.y + ')', r3);
  cierto(await p.evaluate(() => getComputedStyle(document.querySelector('.an-menu-dl [role="menuitem"]:nth-of-type(2)')).backgroundColor === 'rgba(0, 0, 0, 0)'), 'el :hover del sistema no pinta un segundo resaltado');
  /* Hoja 2: baja SOLO la hoja 2, y el foco vuelve al botón. */
  [d] = await Promise.all([p.waitForEvent('download'), p.click('.an-menu-dl [role="menuitem"]:nth-of-type(3)')]);
  cierto(/-acrilico-acomodado-hoja-2\.svg$/.test(d.suggestedFilename()), 'Hoja 2 baja «' + d.suggestedFilename() + '»');
  let svg = fs.readFileSync(await d.path(), 'utf8');
  cierto((svg.match(/<g id="hoja-\d+"/g) || []).length === 1, 'con una sola capa de hoja');
  cierto(!(await abierto(p, '.an-menu-dl')) && await p.evaluate(() => document.activeElement.id) === 'an-dl', 'el menú se cierra y el foco vuelve a «Descargar SVG»');
  /* Todas: una capa por hoja. */
  await p.click('#an-dl');
  [d] = await Promise.all([p.waitForEvent('download'), p.click('.an-menu-dl [role="menuitem"]:nth-of-type(1)')]);
  svg = fs.readFileSync(await d.path(), 'utf8');
  cierto(/-acrilico-acomodado\.svg$/.test(d.suggestedFilename()) && (svg.match(/<g id="hoja-\d+"/g) || []).length === 3, 'Todas baja el archivo completo: una capa por hoja (3)');
  /* Escape y Tab. */
  await p.click('#an-dl'); await p.keyboard.press('Escape');
  cierto(!(await abierto(p, '.an-menu-dl')) && await p.evaluate(() => document.activeElement.id) === 'an-dl', 'Escape cierra y el foco vuelve al botón');
  await p.click('#an-dl'); await p.mouse.click(5, 400); await dormir(150);
  cierto(!(await abierto(p, '.an-menu-dl')), 'tocar fuera lo cierra');
  /* Menos hojas: el menú se reconstruye con lo que hay. */
  await mejora(p, 2, 0.7, 6, 6); await p.click('#an-dl');
  cierto((await p.evaluate(() => document.querySelectorAll('.an-menu-dl [role="menuitem"]').length)) === 3, 'tras una mejora con 2 hojas el menú tiene 3 renglones (Todas, Hoja 1, Hoja 2)');
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.Anidador.detener());
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}
{
  /* Compartir: solo donde el aparato puede, y con el nombre del archivo. */
  const compartible = tipos => `window.__compartidos = []; navigator.canShare = d => d.files.every(f => ${JSON.stringify(tipos)}.includes(f.type)); navigator.share = async d => { window.__compartidos.push({ n: d.files[0].name, t: d.files[0].type, tam: d.files[0].size, titulo: d.title }); };`;
  for (const [tipos, esperado] of [[['image/svg+xml', 'text/plain'], 'image/svg+xml'], [['text/plain'], 'text/plain']]) {
    const { ctx, p, errs } = await abrir({ antes: compartible(tipos) });
    await cargar(p, SVG_MM); await motorFalso(p);
    await p.evaluate(() => window.Anidador.iniciar()); await mejora(p, 1, 0.5, 6, 6);
    cierto(await p.evaluate(() => !document.getElementById('an-dl-flecha').hidden), `${esperado}: con una hoja pero con dónde compartir, el botón lleva menú`);
    await p.click('#an-dl');
    const t = await p.evaluate(() => [...document.querySelectorAll('.an-menu-dl [role="menuitem"]')].map(b => b.innerText.replace(/\s+/g, ' ').trim()));
    cierto(t.join('|') === 'Descargar SVG|Compartir WhatsApp, correo…', 'el menú: Descargar SVG y Compartir', t);
    await p.click('.an-menu-dl [data-descarga="compartir"]'); await dormir(150);
    const cp = await p.evaluate(() => window.__compartidos);
    cierto(cp.length === 1 && /-acrilico-acomodado\.svg$/.test(cp[0].n) && cp[0].t === esperado && cp[0].tam > 200, 'comparte «' + (cp[0] && cp[0].n) + '» como ' + esperado + (esperado === 'text/plain' ? ' (Chrome de Android no deja SVG)' : ''), cp);
    cierto(await p.evaluate(() => document.activeElement.id) === 'an-dl', 'y el foco vuelve al botón');
    await p.evaluate(() => window.Anidador.detener());
    cierto(errs.length === 0, 'sin errores de página', errs);
    await ctx.close();
  }
  /* Un aparato que dice que no puede: no se ofrece. Y cerrar la hoja de compartir no es un fallo. */
  const { ctx, p, errs } = await abrir({ antes: 'navigator.canShare = () => false; navigator.share = async () => {};' });
  await cargar(p, SVG_MM); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar()); await mejora(p, 1, 0.5, 6, 6);
  cierto(await p.evaluate(() => document.getElementById('an-dl-flecha').hidden), 'si canShare dice que no, no hay menú ni «Compartir»');
  await ctx.close();
  const c2 = await abrir({ antes: 'navigator.canShare = () => true; navigator.share = async () => { const e = new Error("x"); e.name = "AbortError"; throw e; };' });
  await cargar(c2.p, SVG_MM); await motorFalso(c2.p);
  await c2.p.evaluate(() => window.Anidador.iniciar()); await mejora(c2.p, 1, 0.5, 6, 6);
  await c2.p.click('#an-dl'); await c2.p.click('.an-menu-dl [data-descarga="compartir"]'); await dormir(200);
  cierto(!(await aviso(c2.p)).some(a => /No se pudo compartir/.test(a.msg)), 'si la persona cierra la hoja de compartir (AbortError) no sale ningún error');
  await c2.ctx.close();
  const c3 = await abrir({ antes: 'navigator.canShare = () => true; navigator.share = async () => { throw new Error("falló"); };' });
  await cargar(c3.p, SVG_MM); await motorFalso(c3.p);
  await c3.p.evaluate(() => window.Anidador.iniciar()); await mejora(c3.p, 1, 0.5, 6, 6);
  await c3.p.click('#an-dl'); await c3.p.click('.an-menu-dl [data-descarga="compartir"]'); await dormir(200);
  cierto((await aviso(c3.p)).some(a => /No se pudo compartir\. Descárgalo/.test(a.msg)), 'si compartir falla de verdad, lo dice y manda a descargar');
  await c3.ctx.close();
}

// ═══ A21 · LA ORIENTACIÓN DE LA HOJA ══════════════════════════════════════════════════════════
console.log('\nA21 · LA ORIENTACIÓN DE LA HOJA, A LA VISTA');
{
  const { ctx, p, errs } = await abrir();
  const rotada = () => p.evaluate(() => ({ cls: document.getElementById('an-tiles').classList.contains('acostada'),
    rot: getComputedStyle(document.querySelector('.an-tile-hoja')).rotate, ico: getComputedStyle(document.querySelector('#an-girar .svgi')).rotate }));
  let r = await rotada();
  cierto(!r.cls && r.rot === 'none', 'la hoja nace parada y la hojita también', r);
  await p.click('#an-girar'); await dormir(600);
  r = await rotada();
  cierto(r.cls && r.rot === '90deg' && r.ico === '90deg', '«Girar la hoja»: las hojitas giran 90° y el ícono con ellas', r);
  const caja = await p.evaluate(() => { const f = document.querySelector('.an-tile-fig').getBoundingClientRect(), h = document.querySelector('.an-tile-hoja').getBoundingClientRect(); return { fig: [f.left, f.top, f.right, f.bottom].map(Math.round), hoja: [h.left, h.top, h.right, h.bottom].map(Math.round), w: Math.round(h.width), h: Math.round(h.height) }; });
  cierto(caja.w === 44 && caja.h === 22, 'la completa acostada mide 44 × 22', caja);
  cierto(caja.hoja[0] >= caja.fig[0] - 1 && caja.hoja[2] <= caja.fig[2] + 1 && caja.hoja[1] >= caja.fig[1] - 1 && caja.hoja[3] <= caja.fig[3] + 1, 'y cabe en el marco de la figura (no se sale)', caja);
  const base = await p.evaluate(() => { const f = document.querySelector('.an-tile-fig').getBoundingClientRect(), h = document.querySelector('.an-tile-hoja').getBoundingClientRect(); return Math.abs(f.bottom - h.bottom); });
  cierto(base < 1.5, 'queda posada sobre la misma base que parada (no flota)', base);
  /* Entre medias el giro es una transición con rebote: pasa de 90°. */
  await p.click('#an-girar');
  let max = 0; for (let i = 0; i < 14; i++) { await dormir(30); const g = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.an-tile-hoja')).rotate) || 0); if (g > max) max = g; }
  await dormir(500);
  r = await rotada();
  cierto(!r.cls && r.rot === 'none', 'girar otra vez la deja parada', r);
  await p.click('#an-girar');   // otra vez acostada y a medio giro: mirar si rebasa
  max = 0; for (let i = 0; i < 16; i++) { await dormir(25); const g = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.an-tile-hoja')).rotate) || 0); if (g > max) max = g; }
  cierto(max > 90, 'el giro rebasa los 90° un instante y se asienta (rebote): máximo ' + max.toFixed(1) + '°', max);
  await dormir(500);
  /* Elegir hoja respeta la orientación; la cuadrada nunca está acostada. */
  await p.click('.an-tile[data-hoja="600x1200"]');
  cierto((await rotada()).cls, 'elegir el cuarto de hoja con la hoja acostada la deja acostada');
  await p.click('.an-tile[data-hoja="1200x1200"]');
  cierto(!(await rotada()).cls, 'la media hoja, cuadrada, no está acostada');
  /* Persistencia: al abrir la página con la hoja acostada, nace girada y no se ve girar. */
  await p.click('.an-tile[data-hoja="1200x2400"]'); await p.click('#an-girar'); await dormir(500);
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => window.Anidador && !document.getElementById('an-arranque'));
  const nacio = await p.evaluate(() => ({ cls: document.getElementById('an-tiles').classList.contains('acostada'),
    rot: getComputedStyle(document.querySelector('.an-tile-hoja')).rotate,
    giros: document.getAnimations().filter(a => a.transitionProperty === 'rotate' || a.transitionProperty === 'translate').length }));
  cierto(nacio.cls && nacio.rot === '90deg' && nacio.giros === 0, 'al recargar con la hoja acostada ya nace girada y sin transición en marcha', nacio);
  /* El levantarse del ratón sigue sirviendo: transform, sin rebote. */
  await p.hover('.an-tile[data-hoja="1200x2400"]'); await dormir(300);
  const hv = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.an-tile[data-hoja="1200x2400"] .an-tile-hoja')); return { t: c.transform, r: c.rotate }; });
  cierto(hv.t !== 'none' && hv.r === '90deg', 'el hover levanta la hojita sin quitarle el giro', hv);
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}
{
  const { ctx, p } = await abrir({ reducido: true });
  await p.click('#an-girar');
  const d = await p.evaluate(() => ({ t: getComputedStyle(document.querySelector('.an-tile-hoja')).transitionDuration, i: getComputedStyle(document.querySelector('#an-girar .svgi')).transitionDuration, cls: document.getElementById('an-tiles').classList.contains('acostada') }));
  cierto(d.cls && /^0s(, 0s)*$/.test(d.t) && /^0s(, 0s)*$/.test(d.i), 'con menos movimiento la hojita y el ícono giran de golpe (sin transición)', d);
  await ctx.close();
}

// ═══ A29 + A30 · EL REFLEJO DEL LOGO Y EL ARRANQUE ════════════════════════════════════════════
console.log('\nA29 · EL REFLEJO DE ALUMINIO CRUZA EL LOGO UNA VEZ');
for (const tema of ['claro', 'oscuro']) {
  const { ctx, p, errs } = await abrir({ tema, ir: false });
  await p.goto(URL_AN, { waitUntil: 'commit' });
  let visto = null;
  for (let i = 0; i < 100 && !visto; i++) {
    visto = await p.evaluate(() => { const m = document.getElementById('brandLogo'); if (!m || !m.classList.contains('brilla')) return null;
      const cs = getComputedStyle(m, '::after'); return { anim: cs.animationName, dur: cs.animationDuration, n: cs.animationIterationCount, mask: cs.maskImage || cs.webkitMaskImage, w: cs.width, h: cs.height }; }).catch(() => null);
    if (!visto) await dormir(50);
  }
  cierto(!!visto && visto.anim === 'an-brillo' && visto.dur === '0.6s' && visto.n === '1', `(${tema}) el reflejo dura 600 ms y se repite UNA vez`, visto);
  cierto(visto && /logo-al3d\.svg/.test(visto.mask) && !/oscuro/.test(visto.mask), '(' + tema + ') la máscara es el logotipo, el mismo archivo en los dos temas', visto && visto.mask);
  cierto(visto && visto.w === '76px' && visto.h === '38px', 'y mide lo que el logo: 76 × 38 px', visto);
  await dormir(1300);
  const luego = await p.evaluate(() => ({ cls: document.getElementById('brandLogo').classList.contains('brilla'), anim: document.getAnimations().filter(a => a.animationName === 'an-brillo').length }));
  cierto(!luego.cls && luego.anim === 0, 'al terminar la clase se quita y no queda nada animándose', luego);
  /* No se repite al cambiar de pantalla ni al cargar un archivo. */
  await p.evaluate(s => window.Anidador.cargarTexto(s, 'x.svg'), SVG_MM); await dormir(300);
  cierto(!(await p.evaluate(() => document.getElementById('brandLogo').classList.contains('brilla'))), 'cargar un archivo no lo repite');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}
{
  const { ctx, p } = await abrir({ reducido: true, ir: false });
  await p.goto(URL_AN, { waitUntil: 'commit' });
  let alguna = false;
  for (let i = 0; i < 30; i++) { alguna = alguna || await p.evaluate(() => !!document.getElementById('brandLogo') && document.getElementById('brandLogo').classList.contains('brilla')).catch(() => false); await dormir(40); }
  cierto(!alguna, 'con menos movimiento no hay reflejo');
  await ctx.close();
}
console.log('\nA30 · EL ARRANQUE CON SU PROPIO ÍCONO');
for (const reducido of [false, true]) {
  const { ctx, p } = await abrir({ reducido, ir: false });
  await p.route('**/anidador-vectores/js/app.js', async r => { await dormir(1800); await r.continue(); });
  await p.goto(URL_AN, { waitUntil: 'commit' });
  await p.waitForSelector('#an-arranque .an-arranque-ico', { state: 'attached', timeout: 15000 });
  await dormir(250);
  const a = await p.evaluate(() => {
    const ico = document.querySelector('#an-arranque .an-arranque-ico');
    return { rects: ico.querySelectorAll('rect').length, giro: !!document.querySelector('#an-arranque .esq-giro'),
      w: Math.round(ico.getBoundingClientRect().width), visible: getComputedStyle(document.getElementById('an-arranque')).display !== 'none',
      anims: [...ico.querySelectorAll('rect')].map(r => r.getAnimations().map(x => x.animationName + ':' + x.effect.getComputedTiming().iterations + ':' + x.effect.getComputedTiming().delay)),
      txt: document.querySelector('#an-arranque .arranque-t').textContent.trim() };
  });
  cierto(a.rects === 4 && !a.giro && a.visible && /Abriendo el anidador/.test(a.txt), `(${reducido ? 'menos movimiento' : 'con movimiento'}) el arranque lleva los cuatro rectángulos y no el punto que gira`, a);
  if (!reducido) {
    const pasos = a.anims.map(x => x[0] || '');
    cierto(pasos.every(x => /^an-pieza-cae:1:/.test(x)) && new Set(pasos.map(x => x.split(':')[2])).size === 4, 'cada pieza cae UNA vez y con su retardo (escalonado)', a.anims);
  } else cierto(a.anims.every(x => x.length === 0), 'con menos movimiento el ícono está quieto', a.anims);
  await p.waitForFunction(() => window.Anidador && !document.getElementById('an-arranque'), null, { timeout: 15000 });
  cierto(await p.evaluate(() => !document.getElementById('an-arranque') && !document.documentElement.classList.contains('arrancando')), 'y desaparece con el esqueleto');
  await ctx.close();
}

// ═══ A31 · PROBAR CON UN EJEMPLO ══════════════════════════════════════════════════════════════
console.log('\nA31 · PROBAR CON UN EJEMPLO');
{
  const { ctx, p, errs } = await abrir();
  cierto(await p.evaluate(() => !!document.querySelector('#an-orig .an-vacio .an-ejemplo') && !document.getElementById('an-ejemplo-drop').hidden), 'la mesa vacía trae el botón y bajo el recuadro de arrastrar hay un enlace al mismo ejemplo');
  /* Con el teclado, desde el enlace. */
  await p.focus('#an-ejemplo-drop'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.Anidador.estado().archivo, null, { timeout: 8000 });
  await dormir(150);
  let e = await estado(p);
  cierto(e.archivo.nombre === 'ejemplo-al3d.svg' && e.archivo.piezas === 4 && e.archivo.origen === 'archivo' && e.archivo.k > 0, 'carga «ejemplo-al3d.svg»: 4 piezas (A, L, 3 y D) a escala conocida', e.archivo);
  const alto = e.archivo.bbox.h * e.archivo.k;
  cierto(Math.abs(alto - 400) < 0.5, 'de 400 mm de alto: ' + alto.toFixed(1), alto);
  cierto(await p.evaluate(() => document.getElementById('an-ejemplo-drop').hidden), 'el enlace se esconde con un archivo cargado');
  const banda = await p.evaluate(() => { const b = document.getElementById('an-origen'); return { h: b.hidden, t: b.textContent.replace(/\s+/g, ' ').trim(), c: b.className }; });
  cierto(!banda.h && /^Ejemplo · /.test(banda.t) && /no es un trabajo para mandar a cortar/.test(banda.t) && /ejemplo/.test(banda.c), 'la banda dice «Ejemplo» y que no es un trabajo para cortar', banda);
  cierto(await p.evaluate(() => getComputedStyle(document.getElementById('an-origen')).color) !== await p.evaluate(() => getComputedStyle(document.querySelector('.an-nota')).color) && await contraste(p, '#an-origen') >= 4.5, 'en ámbar y con contraste: ' + await contraste(p, '#an-origen') + ':1');
  cierto(!/^Trazo recibido/.test(banda.t), 'no se hace pasar por un trazo del vectorizador');
  /* El trazo se dibuja y se rellena. */
  const tr = await p.evaluate(() => { const svg = document.querySelector('#an-orig svg'); const ps = [...svg.querySelectorAll(':scope > path')];
    return { n: ps.length, clase: svg.classList.contains('dibuja-ejemplo'), pl: ps.every(x => x.getAttribute('pathLength') === '1'),
      anims: ps.map(x => x.getAnimations().map(a => a.animationName).sort().join('+')) }; });
  cierto(tr.n === 4 && tr.clase && tr.pl && tr.anims.every(a => a === 'an-rellena+an-traza'), 'cada contorno se traza (an-traza) y se rellena (an-rellena), con pathLength=1', tr);
  await dormir(500);
  const trazo = await p.evaluate(() => { const x = document.querySelector('#an-orig svg > path'); const c = getComputedStyle(x); return { off: parseFloat(c.strokeDashoffset), fo: parseFloat(c.fillOpacity) }; });
  cierto(trazo.off < 1 && trazo.fo < 1, 'a la mitad el trazo va dibujándose (dashoffset ' + trazo.off.toFixed(2) + ') y aún sin relleno', trazo);
  await dormir(2300);
  const fin = await p.evaluate(() => { const svg = document.querySelector('#an-orig svg'); const x = svg.querySelector(':scope > path'); const c = getComputedStyle(x);
    return { clase: svg.classList.contains('dibuja-ejemplo'), fo: c.fillOpacity, stroke: c.stroke, fill: c.fill, anims: document.getAnimations().filter(a => /an-traza|an-rellena/.test(a.animationName)).length }; });
  cierto(!fin.clase && fin.fo === '1' && fin.stroke === 'none' && fin.fill === 'rgb(26, 29, 51)' && fin.anims === 0, 'al llegar queda relleno como cualquier silueta y sin animaciones puestas', fin);
  /* Pasa por el mismo camino: se puede acomodar. */
  await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar());
  cierto((await estado(p)).corriendo, 'y se puede acomodar como cualquier archivo');
  await mejora(p, 1, 0.5, 4, 4);
  const salida = await p.evaluate(() => window.Anidador.armarSalida());
  cierto(/ejemplo-al3d/.test(salida) && !/fill="#/.test(salida), 'el archivo de salida lleva el nombre del ejemplo y sin los colores del logo');
  await p.evaluate(() => window.Anidador.detener());
  /* Cargar otro archivo apaga la banda de ejemplo y su color. */
  await cargar(p, SVG_MM);
  const b2 = await p.evaluate(() => { const b = document.getElementById('an-origen'); return { h: b.hidden, c: b.className, t: b.textContent }; });
  cierto(b2.h && b2.c === 'an-banda' && b2.t === '', 'al cargar otro archivo la banda de ejemplo se va y no deja su color', b2);
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}
{
  /* Con menos movimiento aparece ya relleno. */
  const { ctx, p } = await abrir({ reducido: true });
  await p.click('.an-vacio .an-ejemplo');
  await p.waitForFunction(() => window.Anidador.estado().archivo, null, { timeout: 8000 });
  const r = await p.evaluate(() => ({ clase: document.querySelector('#an-orig svg').classList.contains('dibuja-ejemplo'), anims: document.getAnimations().filter(a => /an-traza|an-rellena/.test(a.animationName)).length }));
  cierto(!r.clase && r.anims === 0, 'con menos movimiento el ejemplo aparece ya relleno, sin trazarse', r);
  await ctx.close();
}
{
  /* Sin el logo (sin red) no se rompe: lo dice. */
  const { ctx, p, errs } = await abrir();
  await p.route('**/logo-al3d.svg', r => r.abort());
  await p.click('#an-ejemplo-drop'); await dormir(600);
  cierto((await aviso(p)).some(a => /No se pudo abrir el ejemplo/.test(a.msg)) && !(await estado(p)).archivo, 'si el logo no baja, lo dice y la pantalla sigue como estaba');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}

// ═══ A32 · EL TEMA SE ABRE EN CÍRCULO ═════════════════════════════════════════════════════════
console.log('\nA32 · EL TEMA SE ABRE EN CÍRCULO');
{
  const { ctx, p, errs } = await abrir({ tema: 'claro' });
  const tema = () => p.evaluate(() => document.documentElement.getAttribute('data-tema'));
  cierto(await tema() === 'claro', 'arranca en claro');
  await p.click('[data-tema-btn]');
  const revelando = await p.evaluate(() => document.documentElement.classList.contains('tema-revela') || !!document.documentElement.getAnimations({ subtree: true }).length);
  /* El tema cambia DENTRO de la transición, un par de cuadros después del clic: se espera. */
  await p.waitForFunction(() => document.documentElement.getAttribute('data-tema') === 'oscuro', null, { timeout: 2000 }).catch(() => {});
  cierto(await tema() === 'oscuro', 'el botón cambia a oscuro');
  const durante = await p.evaluate(() => document.getAnimations().some(a => a.pseudoElement === '::view-transition-new(root)'));
  cierto(revelando || durante, 'con View Transitions se abre en círculo (html.tema-revela o la animación de ::view-transition-new(root))', { revelando, durante });
  await dormir(700);
  cierto(!(await p.evaluate(() => document.documentElement.classList.contains('tema-revela'))), 'al terminar se quita la clase del revelado');
  await p.click('[data-tema-btn]'); await dormir(700);
  cierto(await tema() === 'claro', 'y vuelve a claro');
  /* Con el teclado: Enter sobre el botón. */
  await p.focus('[data-tema-btn]'); await p.keyboard.press('Enter'); await dormir(700);
  cierto(await tema() === 'oscuro', 'con el teclado también (Enter)');
  /* Con el motor corriendo, de golpe: se salta el revelado. */
  await cargar(p, SVG_MM); await motorFalso(p);
  await p.evaluate(() => window.Anidador.iniciar());
  cierto(await p.evaluate(() => document.documentElement.classList.contains('sin-revelado')), 'con el motor corriendo, html.sin-revelado');
  await p.evaluate(() => { window.__revela = false; new MutationObserver(() => { if (document.documentElement.classList.contains('tema-revela')) window.__revela = true; }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); });
  await p.click('[data-tema-btn]');
  const sync = await tema();
  await dormir(300);
  cierto(sync === 'claro' && !(await p.evaluate(() => window.__revela)), 'el tema cambia en el mismo instante y sin foto de la mesa llena', { sync });
  await mejora(p, 1, 0.5, 6, 6);
  await p.evaluate(() => window.Anidador.detener());
  cierto(!(await p.evaluate(() => document.documentElement.classList.contains('sin-revelado'))), 'detenido el motor, el revelado vuelve');
  cierto(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}
{
  const { ctx, p } = await abrir({ reducido: true, tema: 'claro' });
  await p.click('[data-tema-btn]');
  const t = await p.evaluate(() => ({ t: document.documentElement.getAttribute('data-tema'), r: document.documentElement.classList.contains('tema-revela') }));
  cierto(t.t === 'oscuro' && !t.r, 'con menos movimiento cambia directo, sin revelado', t);
  await ctx.close();
}

// ═══ LAS OCHO RONDAS ══════════════════════════════════════════════════════════════════════════
console.log('\nLAS OCHO RONDAS: 360 y 420 px × claro y oscuro × con y sin movimiento reducido, con el dedo');
for (const ancho of [360, 420]) for (const tema of ['claro', 'oscuro']) for (const reducido of [false, true]) {
  const nombre = `${ancho} px · ${tema} · ${reducido ? 'sin movimiento' : 'con movimiento'}`;
  console.log('  — ' + nombre);
  const { ctx, p, errs } = await abrir({ ancho, alto: 780, tema, reducido, tactil: true });
  const ok = (cond, que, extra) => cierto(cond, `[${nombre}] ${que}`, extra);
  ok(await desborde(p) <= 0, 'la mesa vacía no desborda de lado', await desborde(p));
  ok(await alto(p, '#an-ejemplo-drop') >= 44 && await alto(p, '.an-vacio .an-ejemplo') >= 44, 'los dos accesos al ejemplo miden 44 px', [await alto(p, '#an-ejemplo-drop'), await alto(p, '.an-vacio .an-ejemplo')]);
  ok(await contraste(p, '#an-ejemplo-drop') >= 4.5, 'el enlace al ejemplo se lee: ' + await contraste(p, '#an-ejemplo-drop') + ':1');
  await cargar(p, SVG_MM); await motorFalso(p);
  ok(await desborde(p) <= 0, 'con archivo y cotas no desborda', await desborde(p));
  ok(await p.evaluate(() => document.querySelectorAll('#an-orig .an-cotas').length) === 1, 'las cotas están');
  /* La veta, con el dedo. */
  await p.tap('#an-mats [data-mat="aluminio"]'); await dormir(250);
  ok(await abierto(p, '.an-pregunta-veta'), 'tocar aluminio abre la pregunta');
  const caja = await dentroDeLaVentana(p, '.an-pregunta-veta');
  ok(caja && caja.ok, 'el globo cabe en la pantalla', caja);
  ok(await desborde(p) <= 0, 'con la pregunta abierta no desborda', await desborde(p));
  ok((await p.evaluate(() => [...document.querySelectorAll('.an-pregunta-veta .btn')].map(b => Math.round(b.getBoundingClientRect().height)))).every(h => h >= 44), 'sus botones miden 44 px');
  const tx = await contraste(p, '.an-pregunta-veta p');
  ok(tx >= 4.5, 'el texto del globo se lee: ' + tx + ':1', tx);
  const tn = await contraste(p, '.an-pregunta-veta .an-veta-nota');
  ok(tn >= 4.5, 'y su nota: ' + tn + ':1', tn);
  await p.tap('.an-pregunta-veta [data-veta="si"]');
  ok(!(await abierto(p, '.an-pregunta-veta')), '«Dejar así» la cierra');
  /* Girar la hoja con el dedo. */
  await p.tap('#an-girar'); await dormir(500);
  ok(await p.evaluate(() => document.getElementById('an-tiles').classList.contains('acostada')), 'tocar «Girar la hoja» acuesta las hojitas');
  ok(await desborde(p) <= 0, 'las hojitas acostadas no desbordan', await desborde(p));
  /* Acomodar, el paro y la descarga. */
  await p.tap('#an-ir');
  await mejora(p, 3, 0.7, 6, 6);
  ok(await desborde(p) <= 0, 'con el paro a la vista no desborda', await desborde(p));
  const tp = await contraste(p, '#an-paro-t');
  ok(tp >= 4.5, 'la frase del paro se lee: ' + tp + ':1', tp);
  ok(reducido ? await p.evaluate(() => getComputedStyle(document.querySelector('.an-paro-hilo')).display === 'none') : await p.evaluate(() => !!document.querySelector('.an-paro-hilo .mecha') && document.querySelector('.an-paro-hilo').getBoundingClientRect().height >= 3), reducido ? 'sin movimiento: solo la frase' : 'con movimiento: la mecha se ve (4 px)');
  await p.tap('#an-ir');   // Detener
  ok(!(await estado(p)).corriendo, 'tocar «Detener» detiene');
  ok((await infinitas(p)).length === 0, 'en reposo no gira ni late nada', await infinitas(p));
  ok(await alto(p, '#an-dl') >= 44, '«Descargar SVG» mide 44 px', await alto(p, '#an-dl'));
  await p.tap('#an-dl'); await dormir(250);
  ok(await abierto(p, '.an-menu-dl'), 'tocar «Descargar SVG» abre el menú');
  const m = await dentroDeLaVentana(p, '.an-menu-dl');
  ok(m && m.ok, 'el menú cabe en la pantalla', m);
  ok((await p.evaluate(() => [...document.querySelectorAll('.an-menu-dl [role="menuitem"]')].map(b => Math.round(b.getBoundingClientRect().height)))).every(h => h >= 44), 'sus renglones miden 44 px');
  const tm = await contraste(p, '.an-menu-dl [role="menuitem"] .an-menu-t');
  const ts = await contraste(p, '.an-menu-dl [role="menuitem"] small');
  ok(tm >= 4.5 && ts >= 4.5, 'el texto del menú y su letra chica se leen: ' + tm + ' y ' + ts, [tm, ts]);
  ok(await desborde(p) <= 0, 'con el menú abierto no desborda', await desborde(p));
  const [d] = await Promise.all([p.waitForEvent('download'), p.tap('.an-menu-dl [role="menuitem"]:nth-of-type(3)')]);
  ok(/-hoja-2\.svg$/.test(d.suggestedFilename()), 'tocar «Hoja 2» baja solo esa: ' + d.suggestedFilename());
  /* Recuperar con el dedo ya se probó arriba; aquí, el aviso no desborda ni se sale. */
  await p.tap('#an-ir'); await p.tap('#an-ir');
  const toast = await dentroDeLaVentana(p, '#toast .toast-uno');
  ok(!toast || toast.ok, 'el aviso de «Recuperar» cabe en la pantalla', toast);
  const tt = await contraste(p, '#toast .toast-uno .toast-msg');
  ok(tt === null || tt >= 4.5, 'y se lee: ' + tt + ':1', tt);
  await p.evaluate(() => window.Anidador.detener());
  ok(errs.length === 0, 'sin errores de página', errs);
  await ctx.close();
}

await nav.close();
console.log('\n' + (fallos === 0 ? 'La columna de controles del anidador, completa.' : fallos + ' fallo(s).'));
process.exit(fallos ? 1 : 0);
