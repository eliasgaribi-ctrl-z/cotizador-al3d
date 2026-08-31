/* Comprueba que el PDF de la cotización SEA una hoja carta y no se pase de ella.
 *
 * Vivía en herramientas/ y no lo corría NADIE: pruebas/correr.sh solo recorre pruebas/*.mjs y
 * pruebas/navegador/*.mjs, y este archivo no estaba en ninguno de los dos. O sea que la única
 * prueba que vigila el reparto de filas entre hojas llevaba meses sin ejecutarse salvo que
 * alguien se acordara de escribir su nombre a mano. Ahora vive donde se corre. El reparto de filas entre hojas es aritmética sobre alturas medidas —
 * cuántos píxeles mide una fila de tres renglones, cuánto ocupan los totales, cuánto la nota,
 * cuánto el plano— y equivocarse ahí no se ve: sale un documento plausible al que le falta el
 * pie, o con una hoja física de más en blanco. Solo se detecta midiendo el DOM ya maquetado.
 *
 * Y ya cazó uno: al entrar el plano, el tope de la última hoja bajó de 556 a 244 px, el recorte
 * de un solo tijeretazo dejó de alcanzar y una cotización de 14 partidas armaba una hoja de
 * 1 107 px sobre una carta de 1 056, con el pie fuera del papel.
 *
 * Uso:  node pruebas/navegador/pdf-hoja-carta.mjs   (o pruebas/correr.sh --navegador)
 * Pide playwright. Si no está: npm i -g playwright  (el navegador ya suele venir en el sistema)
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALTO_CARTA = 1056;   // 8.5 x 11 pulgadas a 96 ppp
const ANCHO_CARTA = 816;

let chromium;
try {
  chromium = (await import('playwright')).chromium;
} catch (_) {
  try {
    const req = createRequire(import.meta.url);
    chromium = req('/opt/node22/lib/node_modules/playwright').chromium;
  } catch (__) {
    console.log('Falta playwright. Instálalo con:  npm i -g playwright');
    process.exit(2);
  }
}

/* Un plano de mentiras pero con medidas de verdad: 600x260 es la proporción que traen los
   planos cotados de las cotizaciones reales. */
const PLANO = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="260">' +
  '<rect width="600" height="260" fill="#3a4ad8"/>' +
  '<text x="300" y="140" font-family="Arial" font-size="40" fill="#fff" text-anchor="middle">PLANO</text></svg>'
).toString('base64');

/* Los tres casos que importan: la cotización completa con todo puesto, la mínima que solo
   lleva cotización y términos, y la larga que es la que parte las hojas. */
const CASOS = [
  { nombre: 'completa · plano, anticipo, límite y datos de instalación',
    plano: true,  anti: 15000, entrega: 'JUEVES 27 DE AGOSTO', tel: '33-1122-3344', partidas: 3,  hojasMin: 5 },
  { nombre: 'mínima · una partida, sin plano ni anticipo ni fechas',
    plano: false, anti: 0,     entrega: '',                    tel: '',             partidas: 1,  hojasMin: 2 },
  { nombre: 'larga · 14 partidas con plano (la que parte hojas)',
    plano: true,  anti: 20000, entrega: 'VIERNES 04 DE SEPTIEMBRE', tel: '33-1122-3344', partidas: 14, hojasMin: 6 },
  { nombre: 'orden de trabajo SIN plano (el reparto que reservaba hueco de más)',
    plano: false, anti: 0,     entrega: 'LUNES 07 DE SEPTIEMBRE', tel: '',             partidas: 9,  hojasMin: 3 },
  { nombre: 'sin IVA y con partida oculta del PDF',
    plano: true,  anti: 0,     entrega: '',                    tel: '',             partidas: 4,  hojasMin: 2, sinIva: true, oculta: true },
];

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0;

for (const caso of CASOS) {
  const pag = await nav.newPage({ viewport: { width: 1000, height: 1300 } });
  const erroresJs = [];
  pag.on('pageerror', e => erroresJs.push(e.message));
  await pag.goto('file://' + path.join(RAIZ, 'index.html'));
  await pag.waitForTimeout(900);

  const doc = await pag.evaluate(async ({ c, plano }) => {
    /* generarPDF() abre una pestaña con un blob. Aquí se le quita la pestaña y se le
       queda el blob, que es lo único que hay que medir. */
    let blob = null;
    const crear = URL.createObjectURL;
    URL.createObjectURL = b => { blob = b; return 'blob:medido'; };
    window.open = () => null;
    window.mostrarEnlacePDF = () => {};

    Q.cliente = 'Juan Carlos Ramírez';
    Q.proy    = 'Juan Carlos - Centro Dental';
    Q.dirRaw  = 'Av. Vallarta 1234, Col. Americana, 44160 Guadalajara, Jal.';
    Q.fecha   = '21 ago 2026';
    Q.folio   = 'COT-0042';
    Q.iva     = !c.sinIva;
    Q.tel = c.tel; Q.entrecalles = c.tel ? 'Chapultepec y Unión' : '';
    Q.entrega = c.entrega; Q.anti = c.anti;
    Q.estado = 'autorizada'; Q.autorizador = 'Elias Guerrero';
    Q.notaCliente = 'Solo 1 de los 2 conceptos tiene iluminación Led. El cliente debe dejar '
                  + 'salidas eléctricas para una instalación limpia.';
    Q.aiFile = c.plano ? { name: 'plano.svg', type: 'image/svg+xml', url: plano } : null;
    Q.items = Array.from({ length: c.partidas }, (_, i) => ({
      id: i + 1, tipo: 'letras', material: i % 2 ? 'al-paint' : 'acr-vol', comp: 'recta',
      luz: i % 2 === 0, ilumTipo: 'fria', altura: 66, n: 14, _lt: 0,
      showInPdf: (c.oculta && i === 1) ? false : undefined,
    }));
    if (typeof recalc === 'function') recalc();
    Q.itemsAuth = {}; Q.items.forEach(it => { Q.itemsAuth[it.id] = 9000; });

    generarPDF();
    URL.createObjectURL = crear;
    return blob ? await blob.text() : null;
  }, { c: caso, plano: PLANO });

  const problemas = [];
  if (erroresJs.length) problemas.push('errores de JS: ' + erroresJs.join(' / '));

  if (!doc) {
    problemas.push('no se generó ningún documento');
  } else {
    const hoja = await nav.newPage({ viewport: { width: ANCHO_CARTA, height: ALTO_CARTA } });
    /* El documento ya no se auto-imprime —la barra del visor lo hace cuando el usuario lo pide—
       así que no hay ningún script que quitar. El reemplazo se queda por si un documento viejo
       llega hasta aquí desde una caché del service worker. */
    await hoja.setContent(doc.replace(/<scr'\+'ipt>[\s\S]*?<\/scr'\+'ipt>/g, ''));
    await hoja.emulateMedia({ media: 'print' });
    await hoja.waitForTimeout(350);

    const hojas = await hoja.$$('.pg');
    for (let i = 0; i < hojas.length; i++) {
      const caja = await hojas[i].boundingBox();
      if (caja.height > ALTO_CARTA + 1) {
        problemas.push(`la hoja ${i + 1} mide ${Math.round(caja.height)} px sobre una carta de ${ALTO_CARTA}`);
      }
    }
    /* El pie de cada hoja dice «Hoja X de Y». Si Y no es el número de hojas que salieron, el
       cliente recibe un juego que dice que le falta una. */
    const declaradas = (doc.match(/Hoja \d+ de (\d+)/) || [])[1];
    if (String(hojas.length) !== declaradas) {
      problemas.push(`salieron ${hojas.length} hojas pero el pie dice «de ${declaradas}»`);
    }
    if (hojas.length < caso.hojasMin) {
      problemas.push(`se esperaban al menos ${caso.hojasMin} hojas y salieron ${hojas.length}`);
    }
    /* El plano tiene que estar impreso si se capturó, y no puede estar si no. */
    const conPlano = doc.includes('alt="Plano del anuncio cotizado"');
    if (caso.plano && !conPlano) problemas.push('había plano capturado y no se imprimió');
    if (!caso.plano && conPlano) problemas.push('se imprimió un plano que no existe');
    /* El taller no debe ver el precio. */
    const ot = doc.indexOf('>ORDEN DE TRABAJO<');
    if (ot > -1) {
      const finOt = doc.indexOf('class="pg"', ot);
      const hoja_ot = doc.slice(ot, finOt > -1 ? finOt : undefined);
      if (hoja_ot.includes('Precio unitario') || hoja_ot.includes('Total Neto')) {
        problemas.push('la orden de trabajo lleva precios');
      }
    }
    /* Y ahora en PANTALLA, que es lo que de verdad mira una persona antes de imprimir. Esta
       aserción no existía y por eso el defecto vivió tanto: durante mucho tiempo cada .pg medía
       lo que midiera la ventana —1440x900 en un portátil— mientras el arnés, que fuerza
       media:'print', las veía perfectas a 816x1056 y decía que todo estaba bien. El documento
       cabía en la hoja y no se parecía a una hoja. */
    await hoja.emulateMedia({ media: 'screen' });
    await hoja.setViewportSize({ width: 1440, height: 900 });
    await hoja.waitForTimeout(120);
    const enPantalla = await hoja.$$('.pg');
    for (let i = 0; i < enPantalla.length; i++) {
      const caja = await enPantalla[i].boundingBox();
      if (Math.round(caja.width) !== ANCHO_CARTA || Math.round(caja.height) !== ALTO_CARTA) {
        problemas.push(`en pantalla la hoja ${i + 1} mide ${Math.round(caja.width)}x${Math.round(caja.height)}, no ${ANCHO_CARTA}x${ALTO_CARTA}`);
        break;
      }
    }
    /* Y en un teléfono se encoge en vez de salirse a lo ancho, que era la queja literal. */
    await hoja.setViewportSize({ width: 430, height: 932 });
    await hoja.waitForTimeout(120);
    if (await hoja.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
      problemas.push('en un teléfono de 430 px el documento se sale a lo ancho');
    }
    /* La barra del visor no puede salir en el papel, y tiene que ir ANTES de la primera hoja:
       si fuera después, la última .pg deja de ser :last-child, recupera el salto de página y
       cada cotización sale con una hoja de más en blanco. */
    if (!/<div class="visor">[\s\S]*?<div class="pg"/.test(doc)) {
      problemas.push('la barra del visor no está antes de la primera hoja');
    }
    await hoja.emulateMedia({ media: 'print' });
    if (await hoja.evaluate(() => getComputedStyle(document.querySelector('.visor')).display) !== 'none') {
      problemas.push('la barra del visor se imprimiría');
    }
    await hoja.close();
  }

  if (problemas.length) { fallos++; console.log(`  FALLA  ${caso.nombre}`); problemas.forEach(p => console.log(`          · ${p}`)); }
  else console.log(`  ok     ${caso.nombre}`);
  await pag.close();
}

await nav.close();
console.log('');
if (fallos) { console.log(`${fallos} caso(s) con problemas.`); process.exit(1); }
console.log(`El PDF es una hoja carta y cabe en ella, en los ${CASOS.length} casos.`);
