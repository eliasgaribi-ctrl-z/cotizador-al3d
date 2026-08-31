/* Genera los iconos de las dos PWA desde logo-al3d.svg.
 *
 * Los dos webmanifest declaraban `{"src":"logo-al3d.png","sizes":"any","purpose":"any"}` sobre
 * un mapa de bits de 260x130. Eso está mal de tres maneras a la vez y ninguna da error:
 *
 *   - `sizes:"any"` es la convención de un SVG, que escala. Un PNG no: Chrome estira 130 px de
 *     alto hasta los 512 del splash de Android y sale borroso.
 *   - No hay `purpose:"maskable"`. Sin él, Android mete el icono entero dentro de un círculo
 *     encogido con un plato blanco detrás. Con un logotipo 2:1 el resultado es un sello
 *     minúsculo en medio de un disco vacío.
 *   - `apple-touch-icon` apuntaba al mismo archivo. iOS lo obliga a ser cuadrado y compone la
 *     transparencia —el 51 % del archivo— SOBRE NEGRO. En la pantalla de inicio de un iPhone
 *     salía la marca estirada sobre una loseta negra.
 *
 * De ahí las cuatro piezas de abajo. El maskable lleva SOLO el emblema, sin el «AL3D»: la
 * máscara de Android recorta un círculo y de un bloque 2:1 se come justo las letras. El emblema
 * solo es casi cuadrado y sobrevive al recorte.
 *
 * Se rasteriza con el Chromium que ya usan las pruebas, así que no entra ninguna dependencia
 * nueva. Es una herramienta de autoría: se corre cuando cambia el logotipo, y los PNG que
 * produce se suben al repositorio.
 *
 * Uso:  node herramientas/iconos.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(RAIZ, 'logo-al3d.svg'), 'utf8');

const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
const [ANCHO, ALTO] = [Number(vb[1]), Number(vb[2])];

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

/* El emblema son los lóbulos, sin el «AL3D». No se recorta por un porcentaje a ojo —lo intenté y
   partía el lóbulo grande por la mitad—: se le pregunta al navegador dónde está cada figura y se
   suman las cajas de las que caen a la izquierda del filete. Así el recorte sigue siendo correcto
   el día que el logotipo se retrace y las proporciones cambien un poco. */
async function cajaDelEmblema() {
  const ctx = await nav.newContext({ viewport: { width: ANCHO, height: ALTO } });
  const pag = await ctx.newPage();
  await pag.setContent(`<!doctype html><style>html,body{margin:0}svg{display:block}</style>${svg}`,
    { waitUntil: 'load' });
  const caja = await pag.evaluate(ANCHO => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of document.querySelectorAll('svg path')) {
      const b = p.getBBox(), m = p.getCTM();
      const ix = b.x + (m ? m.e : 0), iy = b.y + (m ? m.f : 0);
      if (ix + b.width > ANCHO * 0.66) continue;      // eso ya es el filete o el «AL3D»
      x0 = Math.min(x0, ix); y0 = Math.min(y0, iy);
      x1 = Math.max(x1, ix + b.width); y1 = Math.max(y1, iy + b.height);
    }
    return { x0, y0, x1, y1 };
  }, ANCHO);
  await ctx.close();
  return caja;
}

const e = await cajaDelEmblema();
const emblema = svg.replace(vb[0],
  `viewBox="${Math.round(e.x0)} ${Math.round(e.y0)} ${Math.round(e.x1 - e.x0)} ${Math.round(e.y1 - e.y0)}"`);
console.log(`  emblema recortado a ${Math.round(e.x1 - e.x0)}×${Math.round(e.y1 - e.y0)} del lienzo de ${ANCHO}×${ALTO}`);

/* Las cuatro piezas. `zona` es cuánto del lado ocupa el dibujo: en un maskable Android puede
   recortar hasta el 20 % de cada borde, así que el contenido vive en el 60 % central.
   El plato va BLANCO en las cuatro, incluida la maskable: la marca es azul, y sobre una placa
   azul —que fue lo primero que probé— el lóbulo grande desaparece y solo queda su contorno. */
const PIEZAS = [
  { archivo: 'icono-192.png',          lado: 192, arte: svg,     zona: 0.86 },
  { archivo: 'icono-512.png',          lado: 512, arte: svg,     zona: 0.86 },
  { archivo: 'icono-maskable-512.png', lado: 512, arte: emblema, zona: 0.58 },
  { archivo: 'apple-touch-icon.png',   lado: 180, arte: svg,     zona: 0.84 },
];
const PLATO = '#ffffff';

for (const p of PIEZAS) {
  const ctx = await nav.newContext({ viewport: { width: p.lado, height: p.lado }, deviceScaleFactor: 1 });
  const pag = await ctx.newPage();
  /* Fondo OPACO siempre: es la mitad del arreglo. Un icono con alfa acaba compuesto sobre negro
     en iOS y sobre un plato blanco en Android, y en los dos casos no es lo que se dibujó. */
  await pag.setContent(`<!doctype html><style>
    html,body{margin:0;width:${p.lado}px;height:${p.lado}px;background:${PLATO};
      display:flex;align-items:center;justify-content:center;overflow:hidden}
    .m{width:${Math.round(p.lado * p.zona)}px}
    svg{width:100%;height:auto;display:block}</style>
    <div class="m">${p.arte}</div>`, { waitUntil: 'load' });
  await pag.screenshot({ path: path.join(RAIZ, p.archivo), type: 'png' });
  await ctx.close();
  const kb = (fs.statSync(path.join(RAIZ, p.archivo)).size / 1024).toFixed(1);
  console.log(`  ✓ ${p.archivo.padEnd(24)} ${p.lado}×${p.lado}  ${kb} KB`);
}

await nav.close();
console.log('\nRecuerda que los cuatro tienen que estar declarados en los dos .webmanifest y en sw.js.');
