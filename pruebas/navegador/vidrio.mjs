/* LA CAPA DE VIDRIO HACE LO QUE DICE, Y SE APAGA CUANDO SE LE PIDE.
 *
 * css/vidrio.css es la única hoja que se lee DESPUÉS de todas las demás, y casi todo lo que
 * escribe son selectores de UNA clase: `.topbar`, `.card`, `.btn`, `.pf-cab`. O sea que su
 * efecto no depende de nada más que del orden de carga, y el orden de carga es justo lo que no
 * se ve al mirar la página. `pruebas/hojas-de-estilo.mjs` vigila ese orden en el HTML; lo que
 * falta —y es lo que se comprueba aquí— es que el navegador acabe pintando lo que la hoja dice.
 *
 * Las chispas de los botones de IA se miden aparte porque son lo ÚNICO que esta capa estrena
 * de verdad —el degradado y el barrido ya existían, medidos, en sistema.css— y porque nacieron
 * con un fallo que no se ve a ojo: un `@media` NO suma especificidad, así que la regla de
 * `prefers-reduced-motion` perdía contra la de `:hover` y las chispas saltaban igual con la
 * preferencia puesta. Se ve con getComputedStyle y no se ve mirando.
 *
 * Necesita navegador y servidor, así que va en pruebas/navegador/:
 *
 *   pruebas/correr.sh --navegador
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const cierto = (cond, que) => cond ? bien(que) : mal(que);

/* Deja el cotizador en el paso 2, que es donde vive «Cotizar con IA». */
async function enPartidas(p) {
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForTimeout(1300);
  await p.fill('#f-cli', 'Farmacia San Juan');
  await p.fill('#f-tel', '33 1234 5678');
  await p.fill('#f-proy', 'Letrero de fachada');
  await p.evaluate(() => irAPaso(2));
  await p.waitForTimeout(700);
}

const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX' });
const p = await ctx.newPage();
await enPartidas(p);

console.log('\nLA HOJA LLEGA, Y LLEGA LA ÚLTIMA');
const tokens = await p.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return { cifra: cs.getPropertyValue('--f-cifra').trim(), texto: cs.getPropertyValue('--f-texto').trim(),
           accion: cs.getPropertyValue('--cv-accion').trim() };
});
cierto(/^'?Sora'?/.test(tokens.cifra), '--f-cifra empieza por Sora (' + tokens.cifra.slice(0, 24) + '…)');
cierto(/^'?Manrope'?/.test(tokens.texto), '--f-texto empieza por Manrope (' + tokens.texto.slice(0, 24) + '…)');
/* La reserva de emoji y símbolos es lo que la entrega se dejaba por el camino. */
cierto(/Noto Color Emoji/.test(tokens.texto) && /Noto Sans Symbols 2/.test(tokens.texto),
  'y conserva la reserva de emoji y símbolos del sistema');
cierto(tokens.accion !== '', 'el degradado de acción existe como token');

/* El radio es la prueba más barata de que la hoja GANÓ: son pastillas de 999 px contra los
   4-12 px de sistema.css, y si la hoja se leyera antes no habría ninguna. */
const radios = await p.evaluate(() => {
  const r = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).borderRadius : null; };
  return { pasos: r('.pasos'), chip: r('#items .chip'), aibtn: r('#aibtn'), card: r('.card') };
});
cierto(parseFloat(radios.pasos) >= 100, 'el riel de los cuatro pasos es una pastilla (' + radios.pasos + ')');
cierto(parseFloat(radios.chip) >= 100, 'un chip de partida es una pastilla (' + radios.chip + ')');
cierto(parseFloat(radios.aibtn) >= 100, '«Cotizar con IA» es una pastilla (' + radios.aibtn + ')');
cierto(parseFloat(radios.card) >= 20, 'y una tarjeta va a 20 px (' + radios.card + ')');

console.log('\nEL VIDRIO ESTÁ EN EL CROMADO Y NO EN LAS PARTIDAS');
/* Veinte tarjetas traslúcidas seguidas cansan la vista y cuestan batería: es una decisión
   escrita en la hoja, así que se vigila que siga siendo verdad. */
const desenfoque = await p.evaluate(() => {
  const b = s => { const e = document.querySelector(s); if (!e) return null;
    const c = getComputedStyle(e); return (c.backdropFilter || c.webkitBackdropFilter || 'none'); };
  return { topbar: b('.topbar'), pasos: b('.pasos'), sum: b('.side>.sum'), partida: b('#items .partida') };
});
cierto(/blur/.test(desenfoque.topbar || ''), 'la barra de arriba lleva vidrio');
cierto(/blur/.test(desenfoque.pasos || ''), 'el riel de pasos lleva vidrio');
cierto(/blur/.test(desenfoque.sum || ''), 'la columna del dinero lleva vidrio');
cierto(desenfoque.partida === null || !/blur/.test(desenfoque.partida),
  'y una partida NO lo lleva, que es a propósito (' + desenfoque.partida + ')');

console.log('\nLAS CHISPAS DEL BOTÓN DE IA');
const chispas = () => p.evaluate(() => {
  const s = getComputedStyle(document.querySelector('#aibtn > span'), '::after');
  return { anim: s.animationName, op: s.opacity };
});
cierto((await chispas()).anim === 'none', 'en reposo no animan');
await p.hover('#aibtn');
await p.waitForTimeout(250);
cierto((await chispas()).anim === 'vid-chispas', 'al pasar el cursor saltan');
await ctx.close();

console.log('\nY CON prefers-reduced-motion NO SALTAN');
/* El caso que se coló: la regla de `:hover` tiene una pseudoclase más que la del `@media`, y
   como un `@media` no suma especificidad, ganaba la del hover. */
const ctxR = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX',
                                    reducedMotion: 'reduce' });
const pr = await ctxR.newPage();
await enPartidas(pr);
await pr.hover('#aibtn');
await pr.waitForTimeout(250);
const quieto = await pr.evaluate(() => {
  const s = getComputedStyle(document.querySelector('#aibtn > span'), '::after');
  return { anim: s.animationName, op: s.opacity };
});
cierto(quieto.anim === 'none', 'con el cursor encima siguen sin animar (' + quieto.anim + ')');
cierto(quieto.op === '0', 'y siguen invisibles (opacidad ' + quieto.op + ')');
await ctxR.close();

console.log(fallos ? '\n' + fallos + ' fallo(s) en la capa de vidrio.'
                   : '\nLa capa de vidrio llega entera, y se apaga cuando se le pide.');
await nav.close();
process.exit(fallos ? 1 : 0);
