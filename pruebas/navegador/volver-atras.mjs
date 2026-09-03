/* Volver a una pestaña anterior, que era lo que se volvía un caos.
 *
 * Tres cosas distintas se juntaban en la misma queja y las tres se prueban aquí, porque las tres
 * fallan en silencio: no hay error de consola, no hay pantalla en blanco, solo una app que no
 * hace lo que el dedo pidió.
 *
 *   1. La barra de pasos contestaba con UNA función dos preguntas que no son la misma —«en qué
 *      punto está la cotización» y «qué pestaña estoy mirando»—. Con la cotización autorizada,
 *      pasoActual() devolvía 4 pasara lo que pasara: tocabas «2 · Partidas» y la pestaña 4 seguía
 *      encendida. Medido antes de arreglarlo: 4 antes de tocar, 4 después.
 *   2. `irAPantalla` nunca tocaba el historial, así que el gesto de atrás —que en Android es el
 *      «cerrar» universal, y la app se instala en standalone— se salía de la cotización con todo
 *      lo capturado a medias. Medido: desde Partidas, un atrás dejaba la página en about:blank.
 *   3. `_histAlCerrar` hacía un history.back() sin la guarda que sí tiene js/nucleo/ui.js, y hay
 *      dos botones que cierran una capa y abren otra en el mismo tick. Son justo el gesto de
 *      cambiar de pestaña entre dos vistas de los mismos datos: el panel nuevo se cerraba solo.
 *
 * Uso:  PUERTO=8814 node pruebas/navegador/volver-atras.mjs
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
/* En un teléfono, que es donde el gesto de atrás es un gesto y no un botón del navegador. */
const ctx = await nav.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'es-MX' });
const p = await ctx.newPage();
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const errs = []; p.on('pageerror', e => errs.push(e.message));

const encendida = () => p.evaluate(() =>
  [...document.querySelectorAll('#pasos .paso-tab')].findIndex(e => e.classList.contains('on')) + 1);

await p.goto(B + '/cotizador.html', { waitUntil: 'load' });
await p.waitForTimeout(1200);
await p.fill('#f-cli', 'Andrey');
await p.fill('#f-tel', '33 1234 5678');
await p.fill('#f-proy', 'Healthylicious sucursal La Perla');
await p.waitForTimeout(400);

// ── 1. Las pestañas responden hacia atrás ──────────────────────────────────
console.log('\nLAS PESTAÑAS RESPONDEN HACIA ATRÁS');
await p.evaluate(() => {
  irAPantalla('partidas');
  Q.items = [{ id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true,
               ilumTipo: 'fria', altura: 40, n: 8, _lt: 0 }];
  renderItems(); pintarPantalla();
});
await p.waitForTimeout(300);
(await encendida()) === 2 ? bien('en borrador con una partida, la 2') : mal('la 2 no está encendida');

await p.evaluate(() => { Q.estado = 'autorizada'; Q.autorizador = 'Elías'; Q.itemsAuth = { 1: 17600 }; pintarPantalla(); });
await p.waitForTimeout(300);
(await encendida()) === 4 ? bien('autorizada, la 4') : mal('autorizada no enciende la 4');

await p.evaluate(() => irAPaso(2));
await p.waitForTimeout(300);
(await encendida()) === 2
  ? bien('y tocando «2 · Partidas» se enciende la 2, que es lo que no pasaba')
  : mal('tocar la 2 sobre una cotización autorizada NO la enciende');
/* Y lo que no puede pasar: que las palomitas de «hecho» mientan por mirar otra pestaña. */
(await p.evaluate(() => pasoDerivado())) === 4
  ? bien('mientras el paso derivado sigue siendo 4: mirar no cambia el estado')
  : mal('mirar la pestaña 2 cambió el estado de la cotización');

await p.evaluate(() => irAPaso(3)); await p.waitForTimeout(250);
(await encendida()) === 3 ? bien('lo mismo con «3 · Precio»') : mal('tocar la 3 no la enciende');

/* Caduca sola: en cuanto la cotización se mueve, la barra vuelve a decir la verdad sin que
   nadie tenga que acordarse de limpiar nada. */
await p.evaluate(() => { Q.estado = 'borrador'; pintarPasos(); });
await p.waitForTimeout(200);
(await encendida()) === 2
  ? bien('y al soltarse la autorización el pedido caduca solo')
  : mal('el paso pedido no caducó al cambiar el estado');

// ── 2. El atrás se queda dentro de la cotización ───────────────────────────
console.log('\nEL ATRÁS SE QUEDA DENTRO DE LA COTIZACIÓN');
await p.evaluate(() => { Q.estado = 'autorizada'; Q.itemsAuth = { 1: 17600 }; pintarPantalla(); });
await p.evaluate(() => irAPantalla('cliente')); await p.waitForTimeout(300);
await p.evaluate(() => irAPantalla('partidas')); await p.waitForTimeout(300);

await p.goBack(); await p.waitForTimeout(700);
const sigueViva = await p.evaluate(() => typeof _pantalla !== 'undefined');
if (!sigueViva) mal('el atrás salió de la app, que es el fallo original');
else {
  (await p.evaluate(() => _pantalla)) === 'cliente'
    ? bien('desde Partidas, un atrás devuelve a Cliente') : mal('el atrás no volvió a Cliente');
  (await p.evaluate(() => document.getElementById('f-cli').value)) === 'Andrey'
    ? bien('y lo capturado sigue ahí') : mal('se perdió lo capturado');
}
await p.goForward(); await p.waitForTimeout(600);
(await p.evaluate(() => _pantalla)) === 'partidas'
  ? bien('y el adelante vuelve a Partidas') : mal('el adelante no funciona');

// ── 3. Cambiar entre dos vistas de los mismos datos ────────────────────────
console.log('\nCAMBIAR DE HISTORIAL A CLIENTES Y VOLVER');
await p.evaluate(() => abrirHistorial()); await p.waitForTimeout(500);
await p.evaluate(() => !!document.querySelector('#histmodal.show'))
  ? bien('el Historial abre') : mal('el Historial no abrió');

await p.evaluate(() => delHistorialALosClientes()); await p.waitForTimeout(700);
const cua = await p.evaluate(() => !!document.querySelector('#climodal.show'));
const his = await p.evaluate(() => !!document.querySelector('#histmodal.show'));
cua && !his
  ? bien('tocando «Clientes» queda abierto Cuadernos, y SE QUEDA abierto')
  : mal('el cruce dejó cuadernos=' + cua + ' historial=' + his);

await p.goBack(); await p.waitForTimeout(700);
const cerrado = await p.evaluate(() => !document.querySelector('#climodal.show'));
const dentro = await p.evaluate(() => typeof _pantalla !== 'undefined');
cerrado && dentro
  ? bien('y un solo atrás lo cierra sin sacar de la cotización')
  : mal('el atrás tras el cruce dejó cerrado=' + cerrado + ' dentroDeLaApp=' + dentro);

// ── 4. Nada se rompió ──────────────────────────────────────────────────────
console.log('');
errs.length ? mal('errores de página: ' + [...new Set(errs)].slice(0, 3).join(' | '))
            : bien('cero errores de página');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nVolver a una pestaña anterior ya no es un caos.');
await nav.close();
process.exit(fallos ? 1 : 0);
