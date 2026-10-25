/* LA PÁGINA DE LA TV DEL TALLER (taller.html + js/taller-tv.js + css/taller.css), sin navegador.

   Lo que se vigila:
     1. Habla con el MISMO proyecto que la app: la dirección de su función y el connect-src de su CSP salen de
        js/datos/supabase-config.js (si un día la app cambia de proyecto, esto truena antes de publicar una TV muda).
     2. JavaScript VIEJO: el navegador de una TV de 2017 (Tizen 3, Chromium 47) no entiende módulos, flechas, let/const,
        plantillas, clases, padStart ni async. Un descuido así deja la pantalla en negro sin decir nada.
     3. Nada en línea que la CSP bloquee: ni <script> con cuerpo ni style="…" (la CSP es style-src 'self'; las columnas
        van por clase, ver css/taller.css).
     4. El secreto de la pantalla viaja en el cuerpo, nunca en la dirección.
     5. El service worker la conoce (APP_FILES y PAGINAS), como las otras páginas sueltas.

   Se corre con pruebas/correr.sh (o node pruebas/taller-tv.mjs). */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');

const html = leer('taller.html'), js = leer('js/taller-tv.js'), css = leer('css/taller.css'), sw = leer('sw.js');
const config = leer('js/datos/supabase-config.js');
/* El código sin comentarios: las reglas de abajo miran lo que corre, no lo que se explica. */
const codigo = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

console.log('\n1. EL MISMO PROYECTO QUE LA APP');
{
  const enUso = (/EN_USO\s*=\s*'([^']+)'/.exec(config) || [])[1];
  const urls = [...config.matchAll(/https:\/\/[a-z0-9]{20}\.supabase\.co/g)].map(m => m[0]);
  const funcion = (/var FUNCION = '([^']+)'/.exec(js) || [])[1] || '';
  const csp = (/Content-Security-Policy" content="([^"]+)"/.exec(html) || [])[1] || '';
  eq('la app usa producción', enUso, 'al3d-produccion');
  eq('la función de la TV es /functions/v1/pantalla del proyecto de la app', urls.includes(funcion.replace('/functions/v1/pantalla', '')) && funcion.endsWith('/functions/v1/pantalla'), true);
  eq('y la CSP solo deja hablar con ese proyecto', (/connect-src ([^;]+)/.exec(csp) || [])[1], funcion.replace('/functions/v1/pantalla', ''));
  eq('script-src y style-src solo de la misma página', [/script-src 'self';/.test(csp), /style-src 'self';/.test(csp)], [true, true]);
  eq('las imágenes: de la página y del Storage de ese proyecto (el plano de cada orden), de ningún otro lado', (/img-src ([^;]+)/.exec(csp) || [])[1], "'self' data: " + funcion.replace('/functions/v1/pantalla', ''));
}

console.log('\n2. JAVASCRIPT QUE ENTIENDE UNA TV DE 2017');
{
  const prohibido = [['flechas', /=>/], ['let', /\blet\s/], ['const', /\bconst\s/], ['plantillas', /`/], ['class', /\bclass\s+[A-Z]/],
    ['import/export', /^\s*(import|export)\s/m], ['async/await', /\b(async|await)\s/], ['padStart', /padStart/], ['fetch', /\bfetch\(/],
    ['spread', /\.\.\.[a-zA-Z]/], ['includes', /\.includes\(/], ['Object.assign', /Object\.assign/]];
  eq('nada de lo que Chromium 47 no entiende', prohibido.filter(([, re]) => re.test(codigo)).map(([n]) => n), []);
  eq('en modo estricto y dentro de su propia función (no ensucia window)', [/^\(function \(\) \{\n  'use strict';/m.test(codigo), /\}\)\(\);\s*$/.test(codigo)], [true, true]);
  const viejo = [['variables de CSS', /var\(--/], ['grid', /display:\s*grid/], ['gap', /\bgap:/]];
  eq('y CSS sin variables, grid ni gap', viejo.filter(([, re]) => re.test(css)).map(([n]) => n), []);
}

console.log('\n3. NADA EN LÍNEA QUE LA CSP BLOQUEE');
{
  eq('ningún <script> con cuerpo en la página', [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].length, 0);
  eq('ningún style="" en la página', /\sstyle="/.test(html), false);
  eq('ni el guion arma uno', /style=/.test(codigo), false);
  eq('las cinco columnas tienen su clase en el CSS', [0, 1, 2, 3, 4].map(i => new RegExp('\\.tv-col\\.c' + i + ' \\{ left: ' + (i * 366 || 0) + '(px)?; \\}').test(css)), [true, true, true, true, true]);
}

console.log('\n4. EL SECRETO, EN EL CUERPO');
{
  eq('una sola dirección y sin parámetros: x.open(\'POST\', FUNCION, true)', [...codigo.matchAll(/x\.open\(([^)]*)\)/g)].map(m => m[1]), ["'POST', FUNCION, true"]);
  eq('y el secreto va dentro del JSON que se manda', /llamar\(\{ accion: 'tablero', secreto: estado\.secreto \}/.test(codigo), true);
}

console.log('\n5. EL SERVICE WORKER LA CONOCE');
{
  eq('sus tres archivos en APP_FILES', ['./taller.html', './js/taller-tv.js', './css/taller.css'].filter(f => !sw.includes("'" + f + "'")), []);
  eq('y la página en PAGINAS (con y sin .html)', /const PAGINAS = \/[^\n]*\|taller[|)]/.test(sw), true);
}

console.log('\n' + (mal ? mal + ' FALLA(S) de ' + (bien + mal) + '.' : 'Todo pasa. ' + bien + ' comprobaciones.'));
process.exit(mal ? 1 : 0);
