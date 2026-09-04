/* EL TOTAL VIAJA DEL PASO 1 AL PASO 2, Y NO VIAJA PARA QUIEN PIDIÓ MENOS MOVIMIENTO.
 *
 * La transición de elemento compartido es la única animación de la app que enseña una
 * RELACIÓN en vez de decorar un cambio: el total vive chiquito en la barra de pasos mientras
 * se captura al cliente y grande en la columna del dinero mientras se capturan las partidas, y
 * al cambiar de paso el número recorre el camino de un sitio al otro. Sin ella son dos
 * números, uno que desaparece y otro que aparece media pantalla más allá.
 *
 * Y es de las cosas que se rompen EN SILENCIO. Cuatro maneras, todas vistas al escribirla:
 *
 *   1. El vuelo colgado del sitio equivocado. Nació dentro de `irAPaso()` y ahí solo lo
 *      recorría uno de los cuatro caminos: el botón «Continuar a partidas» llama a
 *      `continuarAPartidas()` → `irAPantalla()`, la barra fija del teléfono también, y el
 *      botón de atrás del navegador también. Tres de cuatro no volaban, y en pantalla eso no
 *      se ve como un error: se ve como que a veces sí y a veces no.
 *   2. La medida en coordenadas de la VENTANA. Entre medir y volar, `irAPantalla` sube la
 *      página al principio; con un rect de ventana ese scroll se suma entero al
 *      desplazamiento y el número sale volando desde fuera de la pantalla.
 *   3. La ESCALA sacada de una caja estirada. `.pasos` es una fila con `align-items:stretch`,
 *      así que la caja del total chiquito medía los 51 px de la barra aunque su letra midiera
 *      15. El número salía encogiéndose desde 1,8 veces su destino: la transición contaba lo
 *      contrario de lo que pasa.
 *   4. Un `transform` que se queda puesto al terminar. Un transform declarado —aunque esté
 *      vacío— crea un contexto de apilamiento propio, y el resumen fijo de una partida le
 *      pasaba por encima al hacer scroll.
 *
 * Ninguna de las cuatro da error de consola ni rompe una prueba de flujo. Se ven midiendo.
 *
 * Necesita navegador y servidor, así que va en pruebas/navegador/:
 *
 *   pruebas/correr.sh --navegador
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

/* `?solo=1` abre el cotizador como página suelta. Sin él se reenvía a `./#/cotizador`, o sea
   a la plataforma con el cotizador empotrado, y entonces todo esto vive dentro de un iframe. */
async function correr(reducido) {
  const ctx = await nav.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: reducido ? 'reduce' : 'no-preference',
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForTimeout(700);

  /* Los tres obligatorios: sin ellos el paso 2 está cerrado con llave y no hay vuelo que
     medir, que es justo lo que pasaba al escribir esta prueba la primera vez. */
  await p.fill('#f-cli', 'Farmacia San Juan');
  await p.fill('#f-tel', '33 1234 5678');
  await p.fill('#f-proy', 'Letrero de fachada FARMACIA');
  await p.waitForTimeout(300);

  const enPaso1 = await p.evaluate(() => {
    const v = [...document.querySelectorAll('[data-shared="total"]')].filter(e => e.offsetParent !== null);
    return { n: v.length, id: v[0] ? v[0].id : null };
  });
  enPaso1.n === 1 && enPaso1.id === 'paso-total'
    ? bien('en el paso 1 se ve UN total compartido, y es el chiquito de la barra')
    : mal('en el paso 1 se ven ' + enPaso1.n + ' totales compartidos (' + enPaso1.id + ')');

  /* Se congela el instante siguiente al cambio de paso. Dos `requestAnimationFrame` porque es
     lo que espera el propio código antes de soltar la transformación: leer antes daría el
     estado inicial y leer mucho después, el final. */
  const vuelo = await p.evaluate(() => new Promise(res => {
    const antes = document.querySelector('[data-shared="total"]:not([hidden])').getBoundingClientRect();
    /* Por el botón de la pantalla, no por la pestaña: es el camino que de verdad usa una
       persona, y el que se quedaba fuera cuando el vuelo colgaba de `irAPaso`. */
    continuarAPartidas();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector('[data-shared="total"]:not([hidden])');
      const cs = getComputedStyle(el);
      res({ id: el.id, transform: cs.transform, alto: antes.height });
    }));
  }));

  const hay = vuelo.transform && vuelo.transform !== 'none';

  if (reducido) {
    hay
      ? mal('con prefers-reduced-motion sigue habiendo vuelo: ' + vuelo.transform)
      : bien('con prefers-reduced-motion el número NO vuela: se cambia de paso y ya');
  } else {
    vuelo.id === 's-neto'
      ? bien('en el paso 2 el total compartido es el grande de la columna del dinero')
      : mal('en el paso 2 el total compartido es «' + vuelo.id + '», no #s-neto');
    hay
      ? bien('el número arranca desplazado desde donde estaba: ' + vuelo.transform)
      : mal('no se aplicó ninguna transformación: el número no vuela');

    /* La escala de partida tiene que ser MENOR que 1: sale de una letra de 15 px y llega a una
       de 28. Mayor que 1 significa que la caja de origen venía estirada por su contenedor. */
    const m = /matrix\(([-\d.]+)/.exec(vuelo.transform || '');
    const s = m ? Number(m[1]) : null;
    (s !== null && s > 0.4 && s < 0.95)
      ? bien('y arranca encogido, en la escala de la letra chica (' + s.toFixed(3) + ')')
      : mal('la escala de arranque es ' + s + ' — con la caja del origen sin estirar tiene que quedar entre 0,4 y 0,95');
    vuelo.alto < 30
      ? bien('porque la caja del total chiquito mide lo que su letra (' + vuelo.alto.toFixed(1) + ' px), no lo que la barra')
      : mal('la caja del total chiquito mide ' + vuelo.alto.toFixed(1) + ' px: se está estirando con la barra de pasos');
  }

  await p.waitForTimeout(900);
  const fin = await p.evaluate(() => {
    const el = document.querySelector('[data-shared="total"]:not([hidden])');
    return { computed: getComputedStyle(el).transform, inline: el.style.transform, op: getComputedStyle(el).opacity };
  });
  (fin.computed === 'none' && fin.inline === '')
    ? bien('y al terminar no queda transform puesto: nada crea un contexto de apilamiento de más')
    : mal('quedó transform al terminar (computed=' + fin.computed + ', inline=«' + fin.inline + '»)');
  Number(fin.op) === 1
    ? bien('y la opacidad vuelve a 1')
    : mal('la opacidad quedó en ' + fin.op);

  errs.length === 0 ? bien('cero errores de página') : mal('errores de página: ' + errs.join(' | '));
  await ctx.close();
}

console.log('\nEL TOTAL VIAJA DEL PASO 1 AL PASO 2');
await correr(false);
console.log('\nY NO VIAJA PARA QUIEN PIDIÓ MENOS MOVIMIENTO');
await correr(true);

await nav.close();
console.log('');
if (fallos) { console.log(fallos + ' mal.'); process.exit(1); }
console.log('La transición de elemento compartido funciona, y se apaga cuando toca.');
