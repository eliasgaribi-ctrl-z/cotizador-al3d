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
import { join, dirname, sep } from 'path';
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
      '      Los archivos son: ' + conLlaves.map(relativa).join(', ') + '\n' +
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
   carpeta del repo, `existsSync` dice que sí, y la entrada pasa sin comprobar nada. Lo mismo
   para cualquier carpeta que termine en «/», como `./anidador-vectores/`. */
const archivos = [...lista.matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//, ''))
  .map(f => (f === '' || f.endsWith('/')) ? f + 'index.html' : f);
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
/* `join` usa la barra del sistema, y en Windows es la otra. Sin normalizar, la ruta
   nunca empieza por RAIZ + '/', el recorte no recorta, y cada módulo del repo se
   reporta como «no cacheado» con su ruta absoluta entera. El fallo era de la prueba,
   no de sw.js. */
const relativa = p => p.split(sep).join('/').replace(RAIZ.split(sep).join('/') + '/', '');
function jsDe(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) jsDe(p, out);
    else if (n.endsWith('.js')) out.push(relativa(p));
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

/* El anidador de vectores va con la plataforma —caché primero, el conjunto completo— y son
   diez guiones que se cargan en orden y se llaman entre sí, más los Web Workers, que piden
   sus archivos por su cuenta: uno que falte en la caché no rompe la página, rompe el
   motor a medio cálculo y sin un solo error visible. Se cuenta todo lo que hay en la
   carpeta y no una lista: la lista es lo que se olvida. */
const anidador = [
  'anidador-vectores/index.html', 'anidador-vectores/css/anidador.css',
  ...jsDe(join(RAIZ, 'anidador-vectores')),
];
const anidadorFuera = anidador.filter(f => !archivos.includes(f));
if (anidadorFuera.length) {
  mal(anidadorFuera.length + ' archivo(s) del anidador NO están en APP_FILES: ' + anidadorFuera.join(', ') + '\n' +
      '      Con señal funciona; sin señal el motor se queda sin sus workers.\n' +
      '      Arreglo: añadirlos a APP_FILES en sw.js y subir APP_VERSION.');
} else bien('los ' + anidador.length + ' archivos del anidador están todos en APP_FILES');
if (!/anidador-vectores/.test((/function esDeLaPlataforma[\s\S]*?\n\}/.exec(sw) || [''])[0])) {
  mal('esDeLaPlataforma() en sw.js no reconoce /anidador-vectores/: sus archivos irían por la ruta del cotizador ' +
      'y la caché del anidador no se usaría nunca');
} else bien('sw.js manda el anidador por la ruta de la plataforma');

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
   módulo; el cotizador carga sus guiones clásicos de js/cotizador/, con el catálogo al frente. */
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
else if (!cotiz.includes('<script src="js/cotizador/catalogo.js"></script>')) mal('cotizador.html no carga js/cotizador/catalogo.js: no es el cotizador');
else if (!readFileSync(join(RAIZ, 'js/cotizador/catalogo.js'), 'utf8').includes('const MATERIALES')) mal('js/cotizador/catalogo.js no trae el catálogo de precios');
else bien('cotizador.html es el cotizador (carga js/cotizador/, con su catálogo)');
/* Y los once guiones se cargan en el orden que arranque.js exige: él va al final, porque init()
   llama a funciones de todos los demás y en un script clásico solo existen las ya cargadas. */
const guiones = [...cotiz.matchAll(/<script src="js\/cotizador\/([a-z]+)\.js"><\/script>/g)].map(m => m[1]);
if (guiones.length < 11) mal('cotizador.html carga ' + guiones.length + ' guiones de js/cotizador/: faltan');
else if (guiones[guiones.length - 1] !== 'arranque') mal('arranque.js no es el último guion del cotizador: init() correría antes de que existan las funciones que llama');
else bien('los ' + guiones.length + ' guiones del cotizador se cargan con arranque.js al final');

/* ----- Los números que la documentación afirma -----
   Este repositorio decide cosas con números escritos en prosa, y el más caro de todos es el
   de los manejadores en línea: de él cuelga el argumento de por qué el cotizador NO se porta
   a módulos ES —«dejarían de resolver EN SILENCIO»— repetido en los once guiones, en el
   README y en js/mod/cotizador.js. Un número que ya no es cierto no tumba el argumento, pero
   sí le quita el peso que tenía, que era justamente ser una medición.

   Una auditoría de septiembre de 2026 los encontró los cuatro corridos a la vez: 273
   manejadores cuando eran 157, cuarenta archivos en el conjunto cuando eran 74, quince
   pruebas de navegador cuando eran 17 y 25 módulos de plataforma cuando eran 31. Ninguno se
   descubre leyendo: hay que contar. Así que se cuentan, que es lo mismo que `correr.sh` ya
   hace con su propia lista de pruebas y `pruebas/taller.mjs` con las dos tablas de plazos. */
function cuentaDicha(texto, patron, fuente) {
  const m = patron.exec(texto);
  return m ? { n: Number(m[1]), donde: fuente } : null;
}
function comparar(que, real, dichas) {
  const malas = dichas.filter(d => d && d.n !== real);
  if (!dichas.filter(Boolean).length) { mal(que + ': ya no se afirma en ninguna parte, ¿se borró la frase?'); return; }
  if (!malas.length) { bien(que + ': la documentación dice ' + real + ', y son ' + real); return; }
  mal(que + ': son ' + real + ' y la documentación dice ' + [...new Set(malas.map(d => d.n))].join(' / ') +
      '\n      Está escrito en: ' + [...new Set(malas.map(d => d.donde))].join(', ') +
      '\n      Arreglo: corregir el número donde lo diga, no cambiar esta prueba.');
}

const readme = readFileSync(join(RAIZ, 'README.md'), 'utf8');
const modCot = readFileSync(join(RAIZ, 'js/mod/cotizador.js'), 'utf8');

/* 1 · Los manejadores en línea de cotizador.html. Se cuentan los atributos `on…="` del
   marcado, que son exactamente los que un módulo ES dejaría mudos. */
const manejadores = (cotiz.match(/\bon[a-z]+\s*=\s*"/g) || []).length;
comparar('los manejadores en línea de cotizador.html', manejadores, [
  cuentaDicha(readme, /los (\d+) manejadores en línea/, 'README.md'),
  cuentaDicha(modCot, /tiene (\d+) manejadores en línea/, 'js/mod/cotizador.js'),
  cuentaDicha(modCot, /así que los (\d+) dejarían/, 'js/mod/cotizador.js'),
  ...['arranque', 'catalogo', 'entrega', 'escalador', 'historial', 'ia', 'nucleo', 'partidas',
      'proceso', 'vectorizador', 'venta'].map(g => cuentaDicha(
    readFileSync(join(RAIZ, 'js/cotizador/' + g + '.js'), 'utf8'),
    /(\d+) manejadores en línea del marcado/, 'js/cotizador/' + g + '.js')),
]);
/* Y el desglose de js/mod/cotizador.js, que nombra los dos más numerosos. */
const porTipo = t => (cotiz.match(new RegExp('\\b' + t + '\\s*=\\s*"', 'g')) || []).length;
comparar('los onclick de cotizador.html', porTipo('onclick'),
  [cuentaDicha(modCot, /(\d+) `onclick`/, 'js/mod/cotizador.js')]);
comparar('los oninput de cotizador.html', porTipo('oninput'),
  [cuentaDicha(modCot, /(\d+) `oninput`/, 'js/mod/cotizador.js')]);

/* 2 · Los archivos del conjunto versionado, escrito con letra en el README. */
const NUM = { veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, 'setenta y cuatro': 74, 'setenta y cinco': 75, 'setenta y seis': 76, ochenta: 80, noventa: 90, cien: 100 };
const mConj = /Son ([a-zá-ú ]+?) archivos que se cargan en orden/.exec(readme);
if (!mConj) mal('el README ya no dice cuántos archivos son el conjunto versionado');
else if (NUM[mConj[1].trim()] === undefined) mal('el README dice «' + mConj[1].trim() + ' archivos» y esta prueba no sabe leer ese número; añádelo a NUM');
else comparar('los archivos de APP_FILES', archivos.length, [{ n: NUM[mConj[1].trim()], donde: 'README.md' }]);

/* 3 · Las pruebas de navegador, que el README enumera y correr.sh ya cuenta solo. */
const navegador = readdirSync(join(RAIZ, 'pruebas/navegador')).filter(n => n.endsWith('.mjs')).length;
comparar('las pruebas de navegador', navegador,
  [cuentaDicha(readme, /--navegador\s+(\d+) más/, 'README.md')]);
comparar('las pruebas de node', readdirSync(join(RAIZ, 'pruebas')).filter(n => n.endsWith('.mjs')).length,
  [cuentaDicha(readme, /correr\.sh\s+(\d+) archivos, solo node/, 'README.md')]);

/* 4 · Los módulos ES de LA PLATAFORMA, que es el argumento del service worker para servirla
   caché primero: «un módulo nuevo con uno viejo no es una app vieja, es una app rota».
   Quedan fuera los once guiones clásicos del cotizador —que comparten ámbito global y no se
   importan entre sí— y `js/tema.js`, que también es clásico y corre antes del primer pintado. */
const modulosES = enDisco.filter(f => f !== 'js/tema.js' && !f.startsWith('js/cotizador/')).length;
comparar('los módulos ES de la plataforma', modulosES, [
  cuentaDicha(sw, /La plataforma son (\d+) módulos ES/, 'sw.js'),
  cuentaDicha(sw, /la plataforma pide (\d+) módulos al arrancar/, 'sw.js'),
]);

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl sitio se puede publicar.');
process.exit(fallos ? 1 : 0);
