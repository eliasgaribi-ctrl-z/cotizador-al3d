/* ¿Se va a poder publicar el sitio?
   
   Esta prueba existe por un incidente real y caro: durante DOS DÍAS y CINCO despliegues,
   GitHub Pages no publicó nada. La plataforma, los arreglos del cotizador, el Ctrl+Z, el
   PDF nuevo — todo se fusionó al repo y nada llegó al sitio. La causa fue un documento con
   «{{ secrets.SUPABASE_URL }}» dentro: GitHub Pages procesa el repo con Jekyll, Jekyll lee
   las llaves dobles como una etiqueta de plantilla Liquid, no la pudo interpretar, y tumbó
   la construcción completa.
   
   Y lo peor: GitHub no avisa. El sitio sigue sirviendo la versión anterior como si nada,
   así que la única señal es que alguien note que su cambio «no salió».
   
   El arreglo es `.nojekyll`, un archivo vacío en la raíz que le dice a Pages «no proceses
   esto, sírvelo tal cual». Está puesto. Pero está a un borrado de distancia de volver a
   tronar, y las llaves dobles siguen ahí porque son parte legítima de la documentación.
   
   Así que esto es el detector: si alguien borra `.nojekyll` mientras exista un solo `{{`
   en la documentación, la prueba falla y dice exactamente qué va a pasar.
   
   Se corre con pruebas/correr.sh, como todas.
*/
import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

/* Todos los .md del repo, sin entrar a lo que no es nuestro. */
function markdowns(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (['node_modules', '.git', 'vendor'].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) markdowns(p, out);
    else if (n.endsWith('.md')) out.push(p);
  }
  return out;
}

const hayNojekyll = existsSync(join(RAIZ, '.nojekyll'));
const conLlaves = markdowns(RAIZ).filter(p => readFileSync(p, 'utf8').includes('{{'));

if (hayNojekyll) bien('.nojekyll existe: Pages sirve los archivos tal cual, sin Jekyll');
else if (conLlaves.length) {
  mal('.nojekyll NO existe y hay ' + conLlaves.length + ' documento(s) con «{{»: ' +
      'Jekyll los va a leer como plantilla y el sitio NO SE VA A PUBLICAR.\n' +
      '      Los archivos son: ' + conLlaves.map(p => p.replace(RAIZ + '/', '')).join(', ') + '\n' +
      '      Arreglo: crear un archivo vacío llamado .nojekyll en la raíz del repo.');
} else {
  bien('.nojekyll no existe, pero ningún documento trae «{{»: Jekyll no tiene con qué tropezar');
}

/* Los archivos que el service worker promete cachear tienen que existir. Si falta uno,
   `addAll` rechaza; eso ya no tumba la instalación —se arregló—, pero la plataforma se
   queda sin funcionar sin señal y nadie se entera hasta que alguien está sin red. */
const sw = readFileSync(join(RAIZ, 'sw.js'), 'utf8');
const lista = (/const APP_FILES = \[([\s\S]*?)\];/.exec(sw) || [, ''])[1];
/* `./` es la portada: en Pages es index.html. Sin esta traducción, `join(RAIZ, '')` es la
   carpeta del repo, `existsSync` dice que sí, y la entrada pasa sin comprobar nada. */
const archivos = [...lista.matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//, '')).map(f => f === '' ? 'index.html' : f);
const faltantes = archivos.filter(f => { const p = join(RAIZ, f); return !existsSync(p) || !statSync(p).isFile(); });
if (!archivos.length) mal('no pude leer APP_FILES de sw.js: ¿cambió el formato?');
else if (faltantes.length) mal(faltantes.length + ' archivo(s) que sw.js promete cachear NO existen: ' + faltantes.join(', '));
else bien('los ' + archivos.length + ' archivos que sw.js promete cachear existen');

/* Y al revés, que es el fallo que de verdad pasa. La comprobación de arriba mira que no
   sobre nada en la lista; esta mira que no FALTE nada. Un módulo nuevo que nadie añade a
   APP_FILES funciona perfectamente mientras haya señal —lo sirve la red— y desaparece sin
   señal, que es el único escenario para el que el service worker existe. Y no se descubre
   probando: se descubre en la calle, delante del cliente.
   Se cuentan los .js de js/, que es donde viven los módulos que la plataforma importa. */
function jsDe(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) jsDe(p, out);
    else if (n.endsWith('.js')) out.push(p.replace(RAIZ + '/', ''));
  }
  return out;
}
const enDisco = jsDe(join(RAIZ, 'js'));
const sinCachear = enDisco.filter(f => !archivos.includes(f));
if (sinCachear.length) {
  mal(sinCachear.length + ' módulo(s) existen y sw.js NO los cachea: ' + sinCachear.join(', ') + '\n' +
      '      Con señal funcionan; sin señal la plataforma no abre.\n' +
      '      Arreglo: añadirlos a APP_FILES en sw.js y subir APP_VERSION.');
} else bien('los ' + enDisco.length + ' módulos de js/ están todos en APP_FILES');

/* Y que APP_VERSION exista, porque es la línea que hay que subir al publicar. */
if (!/const APP_VERSION = \d+;/.test(sw)) mal('sw.js no tiene APP_VERSION: sin eso, publicar un cambio de la plataforma no llega a los teléfonos');
else bien('sw.js tiene APP_VERSION (súbela al publicar cambios de la plataforma)');

/* ----- Quién es quién en la puerta -----
   Desde el cambio de puerta de entrada, index.html es la PLATAFORMA y cotizador.html es el
   COTIZADOR. Antes era al revés, y durante un año el ritual de publicar fue «renombrar el HTML
   nuevo a index.html y subirlo». Hacer eso hoy sobrescribe el cascarón de la app con el
   cotizador y borra la puerta de entrada en un commit, sin que nada avise. No es un riesgo
   técnico: es de memoria muscular. Este es el candado.
   Se distingue por lo único que no puede estar en los dos: el cascarón carga js/app.js como
   módulo; el cotizador es un solo archivo con el script en línea y no importa nada. */
const portada = existsSync(join(RAIZ, 'index.html')) ? readFileSync(join(RAIZ, 'index.html'), 'utf8') : '';
const cotiz   = existsSync(join(RAIZ, 'cotizador.html')) ? readFileSync(join(RAIZ, 'cotizador.html'), 'utf8') : '';
const MODULO  = '<script type="module" src="./js/app.js"></script>';
if (!portada) mal('no existe index.html: el sitio no tiene portada');
else if (!portada.includes(MODULO)) {
  mal('index.html NO es la plataforma: no carga js/app.js. ' +
      (portada.includes('const MATERIALES') ? '¡Es el cotizador! ' : '') +
      'Alguien subió el cotizador como index.html y la puerta de entrada se perdió.\n' +
      '      El cotizador se publica como cotizador.html; la raíz es la plataforma.');
} else bien('index.html es la plataforma (carga js/app.js)');
if (!cotiz) mal('no existe cotizador.html: el cotizador desapareció del sitio');
else if (cotiz.includes(MODULO)) mal('cotizador.html carga js/app.js: es la plataforma, no el cotizador');
else if (!cotiz.includes('const MATERIALES')) mal('cotizador.html no trae el catálogo de precios: no es el cotizador');
else bien('cotizador.html es el cotizador (script en línea, con su catálogo)');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl sitio se puede publicar.');
process.exit(fallos ? 1 : 0);
