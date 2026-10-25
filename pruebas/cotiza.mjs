/* LA PÁGINA DEL AGENTE DE VENTAS (cotiza.html + js/cotiza.js + css/cotiza.css), sin navegador.

   Lo que se vigila:
     1. Habla con el MISMO proyecto que la app: la dirección de su función y el connect-src de su CSP salen de
        js/datos/supabase-config.js, y la función es `agente`.
     2. El secreto de la conversación viaja en el CUERPO, nunca en la dirección: ni «?t=» en lo que se pide, ni GET.
        En el link va después del «#», que no sale del navegador, y se quita de la barra en cuanto se lee.
     3. Lo que llega se pinta con textContent: nada de innerHTML con texto del cliente o del agente.
     4. Nada en línea que la CSP bloquee: ni <script> con cuerpo ni atributos on…=.
     5. El saludo es el mismo que guarda la función, y el service worker la conoce como a las otras páginas sueltas.

   Se corre con pruebas/correr.sh (o node pruebas/cotiza.mjs). */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SALUDO } from '../supabase/functions/agente/handler.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');

const html = leer('cotiza.html'), js = leer('js/cotiza.js'), sw = leer('sw.js');
const config = leer('js/datos/supabase-config.js');
const codigo = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

console.log('\n1. EL MISMO PROYECTO QUE LA APP');
{
  const urls = [...config.matchAll(/https:\/\/[a-z0-9]{20}\.supabase\.co/g)].map(m => m[0]);
  const funcion = (/var FUNCION = '([^']+)'/.exec(js) || [])[1] || '';
  const proyecto = funcion.replace('/functions/v1/agente', '');
  const csp = (/Content-Security-Policy" content="([^"]+)"/.exec(html) || [])[1] || '';
  eq('la función es /functions/v1/agente de un proyecto de la app', [funcion.endsWith('/functions/v1/agente'), urls.includes(proyecto)], [true, true]);
  eq('y la CSP solo deja hablar con ese proyecto', (/connect-src ([^;]+)/.exec(csp) || [])[1], proyecto);
  eq('guiones solo de la misma página', /script-src 'self';/.test(csp), true);
}

console.log('\n2. EL SECRETO NUNCA EN LA DIRECCIÓN');
{
  eq('ninguna petición lleva «?t=» ni «&t=»', /[?&]t=/.test(codigo), false);
  eq('todo por POST', [/method: 'POST'/.test(codigo), /method: 'GET'/.test(codigo)], [true, false]);
  eq('el del link se lee del «#» y se quita de la barra', [/location\.hash/.test(codigo), /history\.replaceState/.test(codigo)], [true, true]);
}

console.log('\n3. LO QUE LLEGA ES UN DATO');
{
  eq('nada de innerHTML, outerHTML, insertAdjacentHTML ni document.write', /innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(codigo), false);
  eq('se pinta con textContent', /\.textContent = cuerpo/.test(codigo), true);
}

console.log('\n4. NADA EN LÍNEA QUE LA CSP BLOQUEE');
{
  eq('ningún <script> con cuerpo en la página', [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].length, 0);
  eq('ningún atributo on…= en la página', /\son[a-z]+="/.test(html), false);
}

console.log('\n5. EL SALUDO Y EL SERVICE WORKER');
{
  eq('el saludo de la página es el de la función', (/var SALUDO = '([^']+)'/.exec(js) || [])[1], SALUDO);
  eq('APP_FILES la conoce, con su guion y su hoja', ['./cotiza.html', './js/cotiza.js', './css/cotiza.css'].every(f => sw.includes("'" + f + "'")), true);
  eq('y PAGINAS también', /\|cotiza\)\(\\\.html\)\?\$\//.test(sw), true);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
