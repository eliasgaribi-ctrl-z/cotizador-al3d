/* Vuelve a escribir los números que la documentación afirma sobre el cotizador.

   pruebas/publicacion.mjs CUENTA los manejadores en línea de cotizador.html y compara contra
   la cifra que dicen el README, js/mod/cotizador.js y la cabecera de cada guion de
   js/cotizador/ —porque de esa cifra cuelga el argumento de por qué el cotizador no se porta a
   módulos ES—. Cada vez que un modal nuevo trae sus onclick, esas quince frases se quedan
   atrás. Esto las pone al día de una vez, con los mismos patrones que usa la prueba:

     node herramientas/recontar.mjs

   No toca nada más que esos números. Si una frase cambió de redacción y ya no casa, lo dice. */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8');
const cot = leer('cotizador.html');
const total = (cot.match(/\bon[a-z]+\s*=\s*"/g) || []).length;
const porTipo = t => (cot.match(new RegExp('\\b' + t + '\\s*=\\s*"', 'g')) || []).length;

const cambios = [];
function poner(ruta, patron, valor) {
  const t = leer(ruta);
  if (!patron.test(t)) { console.log('  ¡ojo! ' + ruta + ': no encontré ' + patron); return; }
  const n = t.replace(patron, (m, ...g) => m.replace(/\d+/, String(valor)));
  if (n !== t) { writeFileSync(join(RAIZ, ruta), n); cambios.push(ruta); }
}

poner('README.md', /los \d+ manejadores en línea/, total);
poner('js/mod/cotizador.js', /tiene \d+ manejadores en línea/, total);
poner('js/mod/cotizador.js', /que los \d+ dejarían/, total);
poner('js/mod/cotizador.js', /\d+ `onclick`/, porTipo('onclick'));
poner('js/mod/cotizador.js', /\d+ `oninput`/, porTipo('oninput'));
for (const f of readdirSync(join(RAIZ, 'js/cotizador'))) {
  const t = leer('js/cotizador/' + f);
  if (/\d+ manejadores en línea del marcado/.test(t)) poner('js/cotizador/' + f, /\d+ manejadores en línea del marcado/, total);
}
console.log(total + ' manejadores (' + porTipo('onclick') + ' onclick, ' + porTipo('oninput') + ' oninput)');
console.log(cambios.length ? 'Al día: ' + [...new Set(cambios)].join(', ') : 'Ya estaba todo al día.');
