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
  /* El autorizador SUBIÓ el precio. Lo que el cliente no puede ver es que lo subieron: ni un
     renglón de «Ajuste» debajo del subtotal, ni la nota de prorrateo al pie. El aumento va
     repartido entre las partidas, así que la tabla tiene que sumar el subtotal ella sola. */
  { nombre: 'aumento autorizado · repartido entre las partidas, sin renglón de ajuste',
    plano: true,  anti: 0,     entrega: '',                    tel: '',             partidas: 3,  hojasMin: 2, aumento: true },
  { nombre: 'aumento autorizado sin IVA, con partida ajustada a mano y otra oculta del PDF',
    plano: false, anti: 9000,  entrega: '',                    tel: '',             partidas: 5,  hojasMin: 2, aumento: true, sinIva: true, ajustePartida: true, oculta: true },
  /* Y el descuento, que sí se enseña: es un argumento de venta. */
  { nombre: 'descuento autorizado · su renglón sigue saliendo',
    plano: false, anti: 0,     entrega: '',                    tel: '',             partidas: 2,  hojasMin: 2, descuento: true },
];

/* «$1,234.50» → 1234.5 · la única forma de comprobar lo que de verdad se imprimió. */
const aNumero = s => Number(String(s).replace(/[$,\s]/g, '').replace(/ /g, ''));
/* Los importes de la columna «Total» de la tabla de cotización. */
const filasTotal = doc => [...doc.matchAll(/class="r num tot">([^<]+)</g)].map(m => aNumero(m[1]));
const renglonTotales = (doc, etiqueta) => {
  const m = doc.match(new RegExp('<span>' + etiqueta + '</span><span>([^<]+)</span>'));
  return m ? aNumero(m[1]) : null;
};

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0;

for (const caso of CASOS) {
  const pag = await nav.newPage({ viewport: { width: 1000, height: 1300 } });
  const erroresJs = [];
  pag.on('pageerror', e => erroresJs.push(e.message));
  await pag.goto('file://' + path.join(RAIZ, 'cotizador.html'));
  await pag.waitForTimeout(900);

  const res = await pag.evaluate(async ({ c, plano }) => {
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
    Q.itemsAuth = {};
    /* Un ajuste por partida es la BASE del reparto, no lo repartido: se le baja el precio a la
       primera y el aumento global tiene que repartirse encima de ese precio ya ajustado. */
    if (c.ajustePartida) Q.itemsAuth[Q.items[0].id] = Math.round(lineTotal(Q.items[0]) * 0.6);
    /* sellarAuth() es lo que hace que la autorización corresponda a ESTE trabajo. Sin él
       authVigente() es false y todo lo que puso el autorizador se ignora, así que un caso
       que no lo llame no está probando ningún ajuste. */
    sellarAuth();
    const netoAjus = netoAjustado();
    if (c.aumento)   Q.precioAuth = Math.ceil(netoAjus * 1.14 / 100) * 100;
    if (c.descuento) Q.precioAuth = Math.floor(netoAjus * 0.88 / 100) * 100;

    generarPDF();
    URL.createObjectURL = crear;
    return { doc: blob ? await blob.text() : null, precioAuth: Q.precioAuth, netoAjus };
  }, { c: caso, plano: PLANO });
  const doc = res.doc;

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
    /* ---- Que el papel cuadre consigo mismo ----
       De las 25 cotizaciones de Canva que se revisaron, 4 traen una tabla que no suma lo que
       dice abajo, porque son celdas tecleadas a mano. Aquí las suma la máquina, así que tiene
       que cuadrar siempre: los renglones de la columna «Total» contra el Subtotal impreso, y
       subtotal más I.V.A. contra el total neto. Sin esto, un reparto mal hecho pasa como un
       documento perfectamente plausible. */
    const filas = filasTotal(doc);
    const sub = renglonTotales(doc, 'Subtotal');
    const neto = renglonTotales(doc, caso.sinIva ? 'Total' : 'Total neto');
    const sumaFilas = Math.round(filas.reduce((s, v) => s + v, 0) * 100) / 100;
    if (sub === null || neto === null) problemas.push('no se encontraron los renglones de totales');
    else {
      if (Math.abs(sumaFilas - sub) > 0.005) {
        problemas.push(`los ${filas.length} renglones suman ${sumaFilas.toFixed(2)} y el subtotal impreso dice ${sub.toFixed(2)}`);
      }
      const subFinal = renglonTotales(doc, 'Subtotal con descuento') ?? renglonTotales(doc, 'Subtotal ajustado') ?? sub;
      const iva = caso.sinIva ? 0 : renglonTotales(doc, 'I.V.A. 16%');
      if (Math.abs(subFinal + (iva || 0) - neto) > 0.02) {
        problemas.push(`subtotal ${subFinal} + I.V.A. ${iva} no da el total impreso ${neto}`);
      }
      /* Y el total impreso es el que autorizó una persona, no otro. */
      const esperado = res.precioAuth || res.netoAjus;
      if (Math.abs(neto - esperado) > 0.02) problemas.push(`el total impreso es ${neto} y lo autorizado fue ${esperado}`);
    }
    /* ---- Un aumento no se le anuncia al cliente ---- */
    if (caso.aumento) {
      if (/<span>Ajuste<\/span>/.test(doc)) problemas.push('el documento del cliente lleva un renglón de «Ajuste»: el aumento tenía que ir repartido en las partidas');
      if (/Subtotal ajustado/.test(doc)) problemas.push('el documento lleva «Subtotal ajustado», que delata el aumento');
    }
    /* ---- Que el unitario impreso multiplique, o que lo diga ----
       «Precio unitario» es el total entre las piezas. Cuando no divide al centavo, la fila
       lleva un `*` y el pie explica que el total de la partida es el que manda: la única
       cosa que no puede pasar es que imprima un unitario que no multiplica y NO lo diga.
       El reparto del aumento se hace justo sobre el unitario para que esto casi nunca haga
       falta —a lo sumo una fila por documento, y solo cuando ninguna partida tiene una
       pieza sola—, y esta comprobación es la que vigila que casi nunca no se vuelva a veces.
       Las celdas se leen renglón por renglón y no columna por columna: la fila agrupada de
       «Conceptos adicionales» imprime «—» en piezas y en unitario, así que dos regex por
       separado se desalinean y comparan el unitario de una fila con las piezas de otra. */
    let marcadas = 0;
    [...doc.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].forEach(([, fila], i) => {
      const celdas = [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].trim());
      if (celdas.length !== 5 || !/num tot/.test(fila)) return;   // solo la tabla con precios
      const [, , pzTxt, u, t] = celdas;
      if (u === '—' || !/^\d+$/.test(pzTxt)) return;              // la fila agrupada
      const marcada = u.endsWith('*');
      if (marcada) marcadas++;
      const cuadra = Math.abs(aNumero(u) * Number(pzTxt) - aNumero(t)) < 0.005;
      if (!cuadra && !marcada) problemas.push(`la fila ${i + 1} imprime ${u} × ${pzTxt} piezas y un total de ${t}: no multiplica y no lo dice`);
      if (cuadra && marcada) problemas.push(`la fila ${i + 1} lleva asterisco y sí multiplica: la nota del pie sobra`);
    });
    if (marcadas > 1) problemas.push(`${marcadas} filas con asterisco: el reparto reparte sobre el unitario justo para que a lo sumo quede una`);
    if (marcadas > 0 && !/prorrateado/.test(doc)) problemas.push('una fila lleva asterisco y el pie no explica qué significa');
    if (marcadas === 0 && /prorrateado/.test(doc)) problemas.push('salió la nota del prorrateo sin ninguna fila marcada');
    /* ---- Un descuento sí ---- */
    if (caso.descuento && !/<span>Descuento<\/span>/.test(doc)) {
      problemas.push('el descuento autorizado no salió en su renglón, y es un argumento de venta');
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
