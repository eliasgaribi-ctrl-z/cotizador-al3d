/* Vuelve a escribir los números que la documentación afirma sobre el cotizador.

   pruebas/publicacion.mjs CUENTA las acciones que el marcado del cotizador nombra —los
   `data-acc="…"` y compañía, que el repartidor de js/cotizador/nucleo.js busca en `window` por
   su nombre— y compara contra la cifra que dicen el README, js/mod/cotizador.js y la cabecera
   de cada guion de js/cotizador/, porque de esa cifra cuelga el argumento de por qué el
   cotizador no se porta a módulos ES. Hasta octubre de 2026 se contaban los manejadores en
   línea (onclick=…) de cotizador.html; ya no queda ninguno (M6). Cada vez que un modal nuevo
   suma sus acciones a una lista de accionesDirectas(), esas frases se quedan atrás. Esto las
   pone al día de una vez, con los mismos patrones que usa la prueba:

     node herramientas/recontar.mjs

   No toca nada más que esos números. Si una frase cambió de redacción y ya no casa, lo dice. */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8');
/* Los nombres de todas las listas accionesDirectas([...]) de js/cotizador/. La misma cuenta que
   pruebas/publicacion.mjs. */
let total = 0;
for (const f of readdirSync(join(RAIZ, 'js/cotizador'))) {
  for (const m of leer('js/cotizador/' + f).matchAll(/accionesDirectas\(\[([\s\S]*?)\]\)/g))
    total += (m[1].match(/'[\w$]+'/g) || []).length;
}

const cambios = [];
function poner(ruta, patron, valor) {
  const t = leer(ruta);
  if (!patron.test(t)) { console.log('  ¡ojo! ' + ruta + ': no encontré ' + patron); return; }
  const n = t.replace(patron, (m, ...g) => m.replace(/\d+/, String(valor)));
  if (n !== t) { writeFileSync(join(RAIZ, ruta), n); cambios.push(ruta); }
}

poner('README.md', /las \d+ acciones que el marcado nombra/, total);
poner('js/mod/cotizador.js', /nombra \d+\s+acciones/, total);
poner('js/mod/cotizador.js', /que las \d+ dejarían/, total);
for (const f of readdirSync(join(RAIZ, 'js/cotizador'))) {
  const t = leer('js/cotizador/' + f);
  if (/\d+ acciones que el marcado nombra/.test(t)) poner('js/cotizador/' + f, /\d+ acciones que el marcado nombra/, total);
}
console.log(total + ' acciones con nombre');
console.log(cambios.length ? 'Al día: ' + [...new Set(cambios)].join(', ') : 'Ya estaba todo al día.');
