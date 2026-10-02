/* LAS PLANTILLAS DE PUBLICACIONES, UNA POR UNA.

   publicaciones/automatizacion/plantillas.json son 554 diseños escritos a mano —o por un
   modelo— como HTML en una cadena. Nada de eso se ve mal hasta que se abre ESA plantilla, y
   los fallos posibles son todos silenciosos:

     · un `data-slot` sin su campo: el texto de ejemplo sale publicado y el editor no enseña
       dónde cambiarlo;
     · un campo sin su `data-slot`: se escribe y no pasa nada;
     · `fotos: 2` con un solo recuadro: el editor pide una foto que no va a ningún lado;
     · un logotipo que no existe en assets/: la imagen sale sin logo;
     · una tipografía que no está en fuentes/: el PNG sale con la letra del sistema;
     · un @keyframes que no está en `keyframes`: el video sale quieto;
     · y lo único que no es cosmético: marcado que ejecuta. El editor pinta cada plantilla
       con innerHTML; un `<script>` no correría, pero un `<img onerror>` sí lo intentaría, y
       la política de la página es lo único que lo pararía.

   Es la lista de «Antes de terminar» de publicaciones/CLAUDE.md, hecha comprobación.
   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'publicaciones');
const lib = JSON.parse(readFileSync(join(DIR, 'automatizacion/plantillas.json'), 'utf8'));
const P = lib.plantillas;

/* Los nombres de lo que se repite, para que un fallo diga CUÁLES y no «47 mal». */
const cuales = f => P.filter(f).map(p => p.id);

console.log('\nEL ARCHIVO');
eq('trae plantillas', P.length > 500, true);
eq('cada id es único', P.length - new Set(P.map(p => p.id)).size, 0);
eq('cada id dice su tipo y su formato (P12@3x4)', cuales(p => !/^(P|C|H|V|F|PF|N)\d+[a-z]?@\w+$/.test(p.id)), []);
eq('los tipos son los que el editor sabe filtrar',
   [...new Set(P.map(p => p.tipo))].filter(t => !['post', 'carrusel', 'historia', 'video', 'portada', 'perfil'].includes(t)), []);

console.log('\nLAS MEDIDAS');
/* Con un píxel de holgura: las portadas se dibujan a 709×262 y se prometen a 851×315, y 262 ×
   1,2 da 314,4. Un píxel en 315 no se ve; diez sí. */
eq('ancho = vista × escala (sale al tamaño que se promete)', cuales(p => Math.abs(p.vista[0] * p.escala - p.ancho) > 1 || Math.abs(p.vista[1] * p.escala - p.alto) > 1), []);
eq('la raíz mide lo que dice su vista', cuales(p => {
  const m = /^<div style="([^"]*)"/.exec(p.html);
  if (!m) return true;
  const w = /(?:^|;)\s*width:\s*(\d+)px/.exec(m[1]), h = /(?:^|;)\s*height:\s*(\d+)px/.exec(m[1]);
  return !w || !h || +w[1] !== p.vista[0] || +h[1] !== p.vista[1];
}), []);
eq('y recorta lo que se salga (overflow:hidden)', cuales(p => !/^<div style="[^"]*overflow:\s*hidden/.test(p.html)), []);

console.log('\nLOS TEXTOS Y LAS FOTOS');
const slots = p => new Set([...p.html.matchAll(/data-slot="([^"]+)"/g)].map(m => m[1]));
eq('cada data-slot tiene su campo', cuales(p => [...slots(p)].some(s => !(s in (p.campos || {})))), []);
eq('cada campo tiene su data-slot', cuales(p => Object.keys(p.campos || {}).some(k => !slots(p).has(k))), []);
eq('fotos = el número más alto de data-foto', cuales(p => {
  const n = [...p.html.matchAll(/data-foto="(\d+)"/g)].map(m => +m[1]);
  return (n.length ? Math.max(...n) : 0) !== (p.fotos || 0);
}), []);

console.log('\nNADA QUE EJECUTE NI QUE SALGA');
eq('ni <script> ni <iframe> ni <object>', cuales(p => /<(script|iframe|object|embed)\b/i.test(p.html)), []);
eq('ni un manejador on…=', cuales(p => /\son[a-z]+\s*=/i.test(p.html)), []);
eq('ni javascript:', cuales(p => /javascript:/i.test(p.html)), []);
eq('ni un recurso de otro sitio (la política no lo dejaría cargar)', cuales(p => /(?:src|href)\s*=\s*"https?:|url\(\s*['"]?https?:/i.test(p.html)), []);

console.log('\nLOS LOGOTIPOS Y LA LETRA');
const recursos = [...new Set(P.flatMap(p => [...p.html.matchAll(/(assets\/[^"')\s]+)/g)].map(m => m[1])))];
eq('cada logotipo que se usa existe en publicaciones/assets', recursos.filter(r => !existsSync(join(DIR, r))), []);
const familias = [...new Set(P.flatMap(p => [...p.html.matchAll(/font-family:\s*'?([^',;"]+)/g)].map(m => m[1].trim())))];
eq('solo las dos tipografías que van en fuentes/', familias.filter(f => !['Plus Jakarta Sans', 'Figtree'].includes(f)), []);
eq('y las dos están', ['plus-jakarta-sans-latin.woff2', 'figtree-latin.woff2'].filter(f => !existsSync(join(DIR, 'fuentes', f))), []);

console.log('\nLAS ANIMACIONES DE LOS VIDEOS');
const definidos = new Set([...String(lib.keyframes || '').matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]));
eq('los @keyframes viven en el JSON', definidos.size > 10, true);
eq('cada animación que se usa está definida', cuales(p => [...p.html.matchAll(/animation:\s*([\w-]+)/g)].some(m => !definidos.has(m[1]))), []);

console.log('\nEL EDITOR LOS PIDE BIEN');
const pl = readFileSync(join(DIR, 'js/plantillas.js'), 'utf8');
eq('las tipografías embebidas son las de fuentes/', ['fuentes/plus-jakarta-sans-latin.woff2', 'fuentes/figtree-latin.woff2'].filter(f => !pl.includes(f)), []);
const ej = JSON.parse(readFileSync(join(DIR, 'automatizacion/contenido-ejemplo.json'), 'utf8'));
const porId = Object.fromEntries(P.map(p => [p.id, p]));
eq('el contenido de ejemplo usa plantillas que existen', ej.filter(x => !porId[x.plantilla]).map(x => x.plantilla), []);
eq('  y campos que esas plantillas tienen', ej.flatMap(x => Object.keys(x.campos || {}).filter(k => porId[x.plantilla] && !(k in porId[x.plantilla].campos)).map(k => x.plantilla + '.' + k)), []);

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
