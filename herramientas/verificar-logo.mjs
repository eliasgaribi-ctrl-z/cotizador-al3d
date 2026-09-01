/* Comprueba que logo-al3d.svg sigue siendo el logotipo, y no un dibujo parecido.
 *
 * herramientas/trazar-logo.py convierte un PNG de 260x130 en curvas, y ese paso tiene cuatro
 * decisiones —cómo se amplía, cómo se decide de qué color es un píxel de borde, qué blancos son
 * papel y cuáles son el ojal de una letra— donde equivocarse no da un error: da un logotipo con
 * halos, o con la D rellena, o con los bordes dentados. Se ve a simple vista y aun así se
 * escapa, porque a 38 px de alto en la barra los cuatro fallos parecen iguales de bien.
 *
 * Esto lo convierte en un número. Pinta el SVG y el PNG original al mismo tamaño, los compara
 * píxel a píxel, y falla si difieren en más del tope. Lo que queda por debajo es el antialias
 * del propio PNG, que el vector no tiene por qué reproducir.
 *
 * La comparación se hace DENTRO del navegador, sobre dos <canvas>: así no hace falta ningún
 * decodificador de PNG en node, y lo que se mide es exactamente lo que un navegador pinta.
 *
 * Uso:  node herramientas/verificar-logo.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOPE_PCT = 4.0;    // % de píxeles que pueden diferir
const TOLERANCIA = 24;   // cuánto tiene que diferir un canal para que cuente
const TOPE_CRUDO_KB = 80;// techo sin comprimir: el documento del PDF lo lleva incrustado
const ANCHO = 260, ALTO = 130;

const png = fs.readFileSync(path.join(RAIZ, 'logo-al3d.png')).toString('base64');
const svg = fs.readFileSync(path.join(RAIZ, 'logo-al3d.svg'), 'utf8');

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pag = await (await nav.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 })).newPage();

/* Los dos sobre BLANCO: el PNG es 51 % transparente y el SVG no tiene fondo, así que
   compararlos sin papel debajo compara dos transparencias, no dos dibujos. */
await pag.setContent(`<!doctype html><style>html,body{margin:0;background:#fff}
  #svg{width:${ANCHO}px;height:${ALTO}px}</style>
  <div id="svg">${svg}</div>
  <img id="png" src="data:image/png;base64,${png}" width="${ANCHO}" height="${ALTO}" style="display:none">`,
  { waitUntil: 'load' });
await pag.waitForFunction(() => document.getElementById('png').complete);

const r = await pag.evaluate(async ({ ANCHO, ALTO, TOLERANCIA }) => {
  const pinta = async fuente => {
    const c = document.createElement('canvas');
    c.width = ANCHO; c.height = ALTO;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, ANCHO, ALTO);
    if (fuente === 'png') g.drawImage(document.getElementById('png'), 0, 0, ANCHO, ALTO);
    else {
      const s = new XMLSerializer().serializeToString(document.querySelector('#svg svg'));
      const im = new Image();
      await new Promise(ok => { im.onload = ok; im.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s))); });
      g.drawImage(im, 0, 0, ANCHO, ALTO);
    }
    return g.getImageData(0, 0, ANCHO, ALTO).data;
  };
  const a = await pinta('png'), b = await pinta('svg');
  let distintos = 0, suma = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    suma += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    if (d > TOLERANCIA) distintos++;
  }
  const total = a.length / 4;
  return { pct: (distintos / total) * 100, medio: suma / total, total };
}, { ANCHO, ALTO, TOLERANCIA });

await nav.close();

/* El peso hay que medirlo COMPRIMIDO y contra el PNG al que sustituye, no en crudo y contra la
   nada. GitHub Pages sirve gzip, y un SVG es texto que se comprime cinco veces mejor que un
   base64 —que ya viene comprimido y no baja más—. En crudo el SVG parece el triple de grande; en
   la red pesa menos que lo que había. Si algún día deja de pesar menos, es que el trazado se
   volvió a llenar de puntos de control y hay que mirar path_precision. */
const crudo = Buffer.byteLength(svg);
const comprimido = zlib.gzipSync(svg).length;
const pesoPng = zlib.gzipSync(fs.readFileSync(path.join(RAIZ, 'logo-al3d.png'))).length;

console.log(`  diferencia   ${r.pct.toFixed(2)} % de ${r.total} píxeles (tope ${TOPE_PCT} %)`);
console.log(`  error medio  ${r.medio.toFixed(2)} por canal`);
console.log(`  trazos       ${(svg.match(/<path/g) || []).length}`);
console.log(`  peso         ${(comprimido / 1024).toFixed(1)} KB comprimido · ${(crudo / 1024).toFixed(1)} KB en crudo`);
console.log(`               el PNG que sustituye pesa ${(pesoPng / 1024).toFixed(1)} KB comprimido`);

let mal = false;
if (r.pct > TOPE_PCT) {
  console.log(`\n✗ El SVG ya no se parece al original. Revisa herramientas/trazar-logo.py.`);
  mal = true;
}
if (comprimido > pesoPng) {
  console.log(`\n✗ El SVG pesa más que el PNG al que sustituye. Mira path_precision en trazar-logo.py.`);
  mal = true;
}
/* Y un techo en crudo, porque el documento que se manda a imprimir lo lleva incrustado y ahí
   no hay compresión que valga: son bytes en la memoria del navegador. */
if (crudo > TOPE_CRUDO_KB * 1024) {
  console.log(`\n✗ En crudo pesa ${(crudo / 1024).toFixed(1)} KB y va dentro de cada PDF. Tope: ${TOPE_CRUDO_KB} KB.`);
  mal = true;
}
if (mal) process.exit(1);
console.log('\n✓ El logotipo trazado se parece al original y pesa menos que el PNG que sustituye.');
