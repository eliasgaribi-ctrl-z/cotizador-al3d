/* La marca es UNA, y esto lo comprueba.
 *
 * El repositorio llegó a tener cuatro dibujos distintos del logotipo a la vez: el PNG en la
 * barra del cotizador, un SVG de tres círculos pegado a mano en la plataforma y en dos sitios
 * más del cotizador —con colores que no eran los del logotipo—, el texto «AL3D» suelto en las
 * barras del Vectorizador y del Escalador, y el favicon. Ninguno daba error. La única forma de
 * darse cuenta era abrir las dos apps una al lado de la otra y mirarlas.
 *
 * Ahora hay un solo archivo, logo-al3d.svg, y dos copias generadas de él: la constante
 * MARCA_SVG de index.html —que existe porque el documento que se imprime vive en un Blob, donde
 * una ruta relativa no resuelve— y los cuatro PNG de los iconos. Una copia generada que nadie
 * comprueba es una copia que se queda atrás; eso ya pasó con css/sistema.css. Esto lo cierra.
 *
 * Corre en node y nada más, así que entra en pruebas/correr.sh sin condiciones.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = f => fs.existsSync(path.join(RAIZ, f));

let fallas = 0;
const cierto = (cond, que) => {
  console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que);
  if (!cond) fallas++;
};

/* Sin comentarios: los de estos dos archivos NOMBRAN los colores que se quitaron, para que
   quien los lea sepa qué había antes. Buscarlos en el texto crudo haría fallar la prueba por
   la explicación de por qué pasa. */
const sinComentarios = t => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const svg = leer('logo-al3d.svg');
const html = sinComentarios(leer('index.html'));
const plataforma = sinComentarios(leer('plataforma.html'));

console.log('\nUN SOLO DIBUJO');
cierto(existe('logo-al3d.svg'), 'logo-al3d.svg existe');
cierto(existe('logo-al3d-oscuro.svg'), 'y su variante para fondo oscuro');

/* Los tres azules del logotipo, muestreados del PNG original. El SVG de tres círculos que se
   pegó a mano usaba #2f39d6 / #4a63f0 / #7b9bf7, que se parecen y no son. */
for (const c of ['#341efd', '#4267fe', '#6290ff']) {
  cierto(svg.includes(c), `el trazado usa el azul ${c} del logotipo`);
}
for (const c of ['#2f39d6', '#4a63f0', '#7b9bf7']) {
  cierto(!html.includes(c) && !plataforma.includes(c),
    `y ya no queda ningún ${c}, que era de la marca dibujada a mano`);
}
cierto(!html.includes('circle cx="34"') && !plataforma.includes('circle cx="34"'),
  'ninguna de las dos apps dibuja ya sus propios círculos');

/* El logotipo no puede llevar fondo: va sobre blanco en la barra, sobre #14162b en la variante
   oscura y sobre el plato del icono. Un trazo blanco que cubra el lienzo lo estropea en dos de
   los tres sitios, y solo se ve en el tercero. */
cierto(!/fill="#ffffff"/i.test(svg), 'el trazado no lleva ningún relleno blanco: es transparente');
cierto(svg.includes('fill-rule="evenodd"'),
  'las contraformas de la A y la D son agujeros de verdad, no parches blancos');

console.log('\nLA COPIA INCRUSTADA DEL DOCUMENTO');
const linea = html.split('\n').find(l => l.startsWith('const MARCA_SVG='));
cierto(!!linea, 'index.html declara MARCA_SVG');
if (linea) {
  const dentro = linea.slice("const MARCA_SVG='".length, -2);
  const esperado = svg
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .trim()
    .replace(/\s*\n\s*/g, '');
  cierto(dentro === esperado,
    'y es exactamente logo-al3d.svg (si falla: herramientas/trazar-logo.py)');
  cierto(dentro.startsWith('<svg') && dentro.endsWith('</svg>'), 'con el <svg> entero');
}

console.log('\nLOS ICONOS QUE DECLARAN LOS MANIFIESTOS');
for (const m of ['manifest.webmanifest', 'manifest-plataforma.webmanifest']) {
  const j = JSON.parse(leer(m));
  cierto(j.icons.length >= 3, `${m} declara al menos tres iconos`);
  for (const i of j.icons) {
    cierto(existe(i.src), `  ${i.src} existe`);
    /* `sizes:"any"` sobre un PNG es la trampa que había: es la convención de un SVG, y sobre un
       mapa de bits deja que Chrome lo estire hasta el splash de 512 px. */
    cierto(/^\d+x\d+$/.test(i.sizes), `  y dice su tamaño de verdad (${i.sizes}), no "any"`);
  }
  cierto(j.icons.some(i => i.purpose === 'maskable'),
    '  y hay uno maskable, o Android recorta el logotipo dentro de un círculo');
  /* El `id` de manifest-plataforma trae escrita la ruta de GitHub Pages, y ahí se queda: es lo
     que identifica a la app YA INSTALADA en los tres teléfonos. Cambiarlo no arregla nada
     visible y hace que el navegador la trate como una app distinta, o sea un icono duplicado en
     la pantalla de inicio y los datos de la anterior fuera de alcance. Lo que sí se comprueba es
     que resuelva al mismo sitio que el scope. */
  const base = 'https://ejemplo.test/cotizador-al3d/';
  cierto(new URL(j.id || './', base).href.startsWith(new URL(j.scope, base).href),
    '  el id cae dentro del scope declarado');
}

console.log('\nLO QUE EL SERVICE WORKER SE LLEVA SIN SEÑAL');
const sw = leer('sw.js');
for (const f of ['logo-al3d.svg', 'icono-192.png', 'icono-512.png', 'apple-touch-icon.png']) {
  cierto(sw.includes(`'./${f}'`), `sw.js precachea ${f}`);
}
cierto(!sw.includes('logo-al3d.png'), 'y ya no guarda el PNG que nadie usa');

console.log(`\n${fallas === 0 ? 'La marca es una sola.' : fallas + ' fallo(s).'}`);
process.exit(fallas ? 1 : 0);
