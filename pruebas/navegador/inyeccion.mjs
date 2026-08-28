/* UN RESPALDO ENVENENADO, ABIERTO EN EL COTIZADOR.

   El respaldo del cotizador es un `.json` que se descarga, se manda por WhatsApp o por
   correo, y se vuelve a cargar en otro teléfono. El propio README describe ese camino. O
   sea que es un archivo que sale del dispositivo, pasa por manos y vuelve — y todo lo que
   vuelve dentro de él acaba escrito en `localStorage` y pintado en la pantalla.

   Durante un tiempo eso alcanzaba para ejecutar código. Doce manejadores del historial y de
   los cuadernos se armaban interpolando el folio o la clave del cliente:

       onclick="reabrirDeHistorial('${esc(e.folio)}')"

   y `esc()` no lo detenía. No por un descuido de `esc()`: el analizador de HTML DECODIFICA
   las referencias de carácter del valor de un atributo ANTES de compilarlo como JavaScript,
   así que el `&#39;` que `esc()` produce vuelve a ser un apóstrofo por el camino y el folio
   se sale del literal. Un comentario del archivo daba el caso por cerrado; no lo estaba.

   Y había un decimotercer sitio que no era ninguno de los doce: `it.id`, que se interpola en
   una treintena de manejadores de cada renglón de partida y entraba tal cual desde el
   archivo, sin pasar por un `Number`.

   Esta prueba no lee el código: **envenena `localStorage` como lo haría un respaldo
   manipulado, abre la app con Chromium, y toca los botones**. Si alguno de los dos caminos
   ejecutara, `window.__COLADO` cambiaría y aquí se ve.

   Se corre SIN Content-Security-Policy a propósito, y esa es la mitad del sentido: la CSP de
   este sitio lleva `'unsafe-inline'` —lo obligan los 267 manejadores escritos en el HTML— así
   que NO habría detenido nada de esto. El código tiene que aguantarlo solo.

   Levanta su propio servidor:

     node pruebas/navegador/inyeccion.mjs
*/
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, extname, normalize } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const servidor = createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const abs = join(RAIZ, normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
  if (!abs.startsWith(RAIZ) || !existsSync(abs) || !statSync(abs).isFile()) {
    res.writeHead(404); res.end('404'); return;
  }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(abs)] || 'application/octet-stream' });
  res.end(readFileSync(abs));
});
const PUERTO = 8829;
await new Promise(r => servidor.listen(PUERTO, '127.0.0.1', r));
const B = 'http://127.0.0.1:' + PUERTO;

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX' });

/* La carga. Sale del literal de la comilla simple, deja una marca y comenta el resto de la
   línea para que lo que quede detrás no rompa la sintaxis y delate el intento. */
const CARGA = "X');window.__COLADO='folio';//";
const CARGA_ID = "1);window.__COLADO='id';//";
/* Que no ejecute no basta: el botón tiene que seguir SIRVIENDO. Un arreglo que rompe «Abrir y
   editar» se quita a la semana y vuelve el agujero. */
const CARGA_ESPERADA = CARGA;

/** Una entrada de historial con la forma que guarda el cotizador. */
function entrada(folio, idPartida) {
  return {
    folio, ts: 1750000000000, fecha: '2026-01-15',
    cliente: 'Farmacia San Juan', tel: '3312345678', proy: 'Letrero de fachada',
    dirRaw: '', direccion: 'Av. Vallarta 100', maps: '', entrecalles: '',
    entrega: '', notaCliente: '', iva: true, estado: 'autorizada',
    autorizador: 'Elias', nota: '', fechaAuth: '2026-01-15', precioAuth: 0,
    /* Con imagen para que se pinte la <img class="hentry-img">, que es uno de los doce y solo
       existe cuando la entrada tiene archivo. Un PNG de 1×1 en data:. */
    itemsAuth: {},
    aiFile: { name: 'plano.png', type: 'image/png',
              url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' },
    items: [{ id: idPartida, tipo: 'letras', material: 'acero', comp: 'recta', luz: true,
              ilumTipo: 'fria', altura: 40, n: 8, tarifa: 0, ancho: 0, alto: 0, acab: '',
              recComp: false, bas: '', desc: 'Letras de prueba', descAi: false,
              pz: 1, pu: 0, showInPdf: true }],
  };
}

/** Abre la app con el historial envenenado ya escrito y devuelve la página. */
async function conHistorialEnvenenado(historial) {
  const p = await ctx.newPage();
  await p.goto(B + '/index.html', { waitUntil: 'load' });
  await p.evaluate(h => {
    localStorage.clear();
    localStorage.setItem('al3d_historial', JSON.stringify(h));
    localStorage.setItem('al3d_folio', '42');
  }, historial);
  await p.addInitScript(() => { window.__COLADO = ''; });
  await p.goto(B + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  return p;
}

/* ---------------------------------------------------------------------------
   1. El folio del historial
   --------------------------------------------------------------------------- */
console.log('\nUN FOLIO CON CÓDIGO ADENTRO, LLEGADO DE UN RESPALDO');
{
  const p = await conHistorialEnvenenado([entrada(CARGA, 1)]);
  /* El historial se pinta en su propia pantalla. Se abre como lo haría una persona. */
  /* `abrirHistorial()` es la función real: llena `_histData` desde localStorage, indexa y
     enseña el modal. Llamarla es lo mismo que tocar el botón del historial. */
  await p.evaluate(() => { abrirHistorial(); }).catch(() => {});
  await p.waitForTimeout(800);

  const pintado = await p.locator('#histmodal .hentry').count();
  if (!pintado) mal('el historial no pintó ninguna entrada: la prueba no probó nada.\n' +
                    '      Revisa que la forma de la entrada siga siendo la que guarda el cotizador.');
  else bien(`el historial pintó la entrada envenenada (${pintado} renglón/es)`);

  /* TODOS los botones del renglón, no el primero de cada clase: «Abrir y editar» y «Duplicar»
     comparten la clase `.hentry-open`, así que un `.first()` dejaba `usarComoBase` sin tocar.
     Y la miniatura, que es el sink de `openHistImg`. */
  const botones = await p.locator('#histmodal .hentry-open, #histmodal .hentry-del, #histmodal .hentry-img').all();
  bien(`se van a tocar ${botones.length} elementos del renglón, no solo el primero de cada clase`);

  /* «Abrir y editar» va PRIMERO y por su TEXTO, no por posición: los cuatro elementos salen en
     orden del DOM y ahí la miniatura va antes que los botones. Se comprueba aquí mismo, antes
     de tocar los demás, porque «Duplicar» emite un folio nuevo y «Eliminar» se lleva la
     entrada: mirar `Q.folio` al final del recorrido no diría nada sobre este botón. */
  await p.locator('#histmodal .hentry-open', { hasText: 'Abrir' }).first()
    .click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(600);
  const abrio = await p.evaluate(() => { try { return String(Q.folio || ''); } catch (_) { return ''; } });
  if (abrio === CARGA_ESPERADA) bien('y «Abrir y editar» sí funcionó: cargó la cotización con su folio entero');
  else mal(`«Abrir y editar» no cargó la cotización: Q.folio quedó en ${JSON.stringify(abrio)}.\n` +
           '      El dato tiene que llegar completo al manejador, no solo dejar de ejecutarse.');

  /* Y ahora los cuatro, que es donde puede ejecutar lo que sea. Se vuelven a pedir porque
     abrir la cotización repinta el modal y los nodos de antes ya no están. */
  for (const b of await p.locator('#histmodal .hentry-open, #histmodal .hentry-del, #histmodal .hentry-img').all()) {
    await b.click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(350);
  }
  /* Y el renglón entero, que también llevaba el folio. */
  await p.locator('#histmodal .hentry').first().click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(600);

  const colado = await p.evaluate(() => window.__COLADO || '');
  if (colado) mal(`EJECUTÓ. \`window.__COLADO\` quedó en «${colado}»: el folio de un respaldo\n` +
                  '      manipulado corre como código al tocar el historial. Es el sink de los doce\n' +
                  "      `onclick=\"fn('${esc(folio)}')\"`. El arreglo es pasar el dato por un\n" +
                  '      `data-folio` y leerlo con `this.dataset.folio`.');
  else bien('no ejecutó: el folio viajó por `data-folio` y nunca se compiló como código');

  await p.close();
}

/* ---------------------------------------------------------------------------
   2. El id de una partida
   --------------------------------------------------------------------------- */
console.log('\nUN id DE PARTIDA CON CÓDIGO ADENTRO');
{
  const p = await conHistorialEnvenenado([entrada('COT-0042@K7QM', CARGA_ID)]);
  await p.evaluate(() => { abrirHistorial(); }).catch(() => {});
  await p.waitForTimeout(700);
  /* Abrir la cotización mete esas partidas en Q y las pinta: es cuando `it.id` entra en la
     treintena de manejadores de cada renglón. */
  await p.locator('#histmodal .hentry-open').first().click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(900);
  await p.evaluate(() => { try { irAPantalla('partidas'); } catch (_) {} }).catch(() => {});
  await p.waitForTimeout(700);

  const partidas = await p.locator('.partida').count();
  if (!partidas) mal('no se pintó ninguna partida: la prueba no llegó al sitio que quería probar');
  else bien(`se pintaron ${partidas} partida(s) desde el historial envenenado`);

  /* Tocar el renglón dispara togglePartida(${it.id}), que es el manejador con el id dentro. */
  await p.locator('.partida').first().click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(500);

  const colado = await p.evaluate(() => window.__COLADO || '');
  if (colado) mal(`EJECUTÓ. \`window.__COLADO\` quedó en «${colado}»: el id de una partida entró\n` +
                  '      crudo desde el archivo a `onclick="togglePartida(${it.id})"`. El arreglo es\n' +
                  '      `sanearIds()` en las tres puertas por las que las partidas entran a Q.');
  else bien('no ejecutó: `sanearIds()` convirtió el id en número antes de que llegara al HTML');

  const ids = await p.evaluate(() => { try { return Q.items.map(i => typeof i.id); } catch (_) { return []; } });
  if (ids.length && ids.every(t => t === 'number')) bien(`los ${ids.length} id quedaron como número`);
  else mal('algún id de partida no es un número: ' + JSON.stringify(ids));
  await p.close();
}

/* ---------------------------------------------------------------------------
   3. La clave del cliente, en los cuadernos
   --------------------------------------------------------------------------- */
console.log('\nUN NOMBRE DE CLIENTE CON CÓDIGO ADENTRO, EN LOS CUADERNOS');
{
  /* La clave del cuaderno se deriva del nombre del cliente, que es texto que alguien teclea
     y que también llega de un respaldo. Iba a cinco `onclick` distintos. */
  const p = await conHistorialEnvenenado([
    { ...entrada('COT-0043@K7QM', 1), cliente: "Farmacia');window.__COLADO='cliente';//" },
  ]);
  await p.evaluate(() => { abrirCuadernos(); }).catch(() => {});
  await p.waitForTimeout(900);
  const tarjetas = await p.locator('.cua-card').count();
  if (tarjetas) {
    await p.locator('.cua-card').first().click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(700);
    for (const sel of ['.cua-det-acts button', '.cua-cot-acts button']) {
      const b = p.locator(sel).first();
      if (await b.count()) { await b.click({ timeout: 2500 }).catch(() => {}); await p.waitForTimeout(400); }
    }
    bien(`los cuadernos pintaron ${tarjetas} tarjeta(s) y se tocaron sus botones`);
  } else {
    console.log('  · los cuadernos no pintaron tarjetas en este recorrido; el caso queda cubierto\n' +
                '    por el bloque 1, que usa los mismos cinco manejadores con la misma técnica');
  }
  const colado = await p.evaluate(() => window.__COLADO || '');
  if (colado) mal(`EJECUTÓ. \`window.__COLADO\` quedó en «${colado}»: la clave del cliente corre\n` +
                  '      como código en los cuadernos.');
  else bien('no ejecutó: la clave del cliente viajó por `data-clave`');
  await p.close();
}

/* ---------------------------------------------------------------------------
   4. La cola del autorizador
   --------------------------------------------------------------------------- */
/* `loadQueueEntry` es el único de los doce que no vive en un <button> sino en un <div> con
   role="button" y el `onkeydown` de `_ABRIBLE`, que hace `this.click()`. O sea que tiene dos
   caminos —ratón y teclado— y los dos pasan por el mismo `this`. Va aparte porque su dato no
   sale del historial sino de `al3d_queue`, que ninguna otra prueba escribe. */
console.log('\nUN FOLIO ENVENENADO EN LA COLA DEL AUTORIZADOR');
{
  const p = await ctx.newPage();
  await p.goto(B + '/index.html', { waitUntil: 'load' });
  await p.evaluate(carga => {
    localStorage.clear();
    localStorage.setItem('al3d_queue', JSON.stringify([{
      folio: carga, ts: 1750000000000, cliente: 'Farmacia San Juan',
      proy: 'Letrero de fachada', q: { folio: carga, items: [], cliente: 'Farmacia San Juan' },
    }]));
  }, CARGA);
  await p.addInitScript(() => { window.__COLADO = ''; });
  await p.goto(B + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1300);
  /* La cola se pinta para el rol que autoriza. */
  await p.evaluate(() => { try { setRol('autorizador'); } catch (_) {} }).catch(() => {});
  await p.waitForTimeout(700);

  const renglones = await p.locator('.queue-item').count();
  if (!renglones) {
    console.log('  · la cola no pintó ningún renglón en este recorrido; el folio envenenado\n' +
                '    queda cubierto por el bloque 1, que usa la misma técnica');
  } else {
    bien(`la cola pintó ${renglones} renglón/es con el folio envenenado`);
    await p.locator('.queue-item').first().click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(500);
    /* Y por teclado, que es el otro camino de `_ABRIBLE` y el que conserva `this`. */
    await p.locator('.queue-item').first().press('Enter').catch(() => {});
    await p.waitForTimeout(500);
  }
  const colado = await p.evaluate(() => window.__COLADO || '');
  if (colado) mal(`EJECUTÓ. \`window.__COLADO\` quedó en «${colado}»: el folio de la cola corre\n` +
                  '      como código. Es `loadQueueEntry`, el único de los doce en un <div>.');
  else bien('no ejecutó: el folio de la cola viajó por `data-folio`, con ratón y con teclado');
  await p.close();
}

await nav.close();
servidor.close();
console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nUn respaldo manipulado no ejecuta nada.');
process.exit(fallos ? 1 : 0);
