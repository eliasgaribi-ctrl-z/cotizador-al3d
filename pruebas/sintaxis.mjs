/* ¿Compila todo lo que se publica?
   
   Esta prueba existe por un incidente que estuvo en producción sin que nadie lo viera.
   `js/mod/agenda.js` se quedó con una llave sin cerrar: `desmontar()` nunca cerraba, y las
   1 115 líneas que venían después —el calendario entero, la hoja de agendar, el .ics—
   quedaron anidadas dentro de esa función. El archivo dejó de parsear.
   
   Lo que se veía: la pestaña de Agenda pintaba «No se pudo cargar «Agenda» — puede ser que
   la app se haya actualizado a medias». Ese texto es el catch de app.js, y está escrito para
   una actualización a medias, así que el mensaje era razonable y falso al mismo tiempo: no
   había ninguna actualización a medias, había un archivo roto. Alguien recargando, que es lo
   que el botón invita a hacer, no arreglaba nada nunca.
   
   Y lo peor es por qué duró: los módulos se cargan con `await import()` DENTRO de un try, o
   sea que un archivo que no parsea no rompe la app — rompe una pestaña, en silencio, y el
   resto sigue funcionando. Nada en `pruebas/` importa `js/mod/*.js`, así que ninguna prueba
   lo tocaba. La única señal era abrir esa pestaña.
   
   Treinta líneas y no vuelve a pasar. Se corre con pruebas/correr.sh, como todas.
*/
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import vm from 'vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

/* Todo lo que hay debajo de una carpeta, sin entrar a lo que no es nuestro. */
function archivos(dir, exts, out = []) {
  let hijos;
  try { hijos = readdirSync(dir); } catch (_) { return out; }
  for (const n of hijos) {
    if (['node_modules', '.git', 'vendor'].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, exts, out);
    else if (exts.some(e => n.endsWith(e))) out.push(p);
  }
  return out;
}

/* ----- Los módulos ES -----
   Se comprueban con `node --check` por la entrada estándar y con --input-type=module. Por el
   nombre del archivo no basta: un `.js` sin package.json lo lee node como CommonJS, y ahí un
   `export` es error de sintaxis aunque el archivo esté perfecto. */
const modulos = [
  ...archivos(join(RAIZ, 'js'), ['.js']),
  ...archivos(join(RAIZ, 'herramientas'), ['.mjs']),
  ...archivos(join(RAIZ, 'pruebas'), ['.mjs']),
];
const rotos = [];
for (const p of modulos) {
  try { execFileSync(process.execPath, ['--input-type=module', '--check'],
                     { input: readFileSync(p), stdio: ['pipe', 'ignore', 'pipe'] }); }
  catch (e) {
    /* De la salida de node interesan dos renglones y no la pila: el `[stdin]:NNN`, que da
       la línea, y el `SyntaxError: …`, que da la causa. La pila que viene detrás es de los
       flujos internos de node y no dice nada del archivo. */
    const l = String((e && e.stderr) || '').split('\n');
    const donde = (l.find(x => /^\[stdin\]:\d+/.test(x)) || '').replace('[stdin]:', 'línea ');
    const causa = l.find(x => /Error:/.test(x)) || 'no compila';
    rotos.push(relative(RAIZ, p) + ' — ' + causa.trim() + (donde ? ' (' + donde.trim() + ')' : ''));
  }
}
if (rotos.length) rotos.forEach(r => mal('no parsea: ' + r));
else bien('los ' + modulos.length + ' módulos ES parsean');

/* ----- Los guiones clásicos -----
   El service worker y el <script> en línea del cotizador no son módulos: son guiones
   clásicos, y `vm.Script` los compila igual que el navegador, sin ejecutarlos. */
function guionClasico(nombre, fuente, desfase = 0) {
  try { new vm.Script(fuente, { filename: nombre, lineOffset: desfase }); return true; }
  catch (e) { mal('no parsea: ' + nombre + ' — ' + (e && e.message)); return false; }
}

if (guionClasico('sw.js', readFileSync(join(RAIZ, 'sw.js'), 'utf8'))) bien('sw.js parsea');

/* El anidador de vectores son guiones clásicos también —el motor vendorizado, sus
   dependencias y nuestra interfaz— cargados con <script src> en orden. Ninguno es un
   módulo, así que van por aquí y no por `node --check` con --input-type=module, donde el
   `var JSON;` del polyfill y compañía darían errores que el navegador no da. */
const guionesAnidador = archivos(join(RAIZ, 'anidador-vectores'), ['.js']);
const anidadorRotos = guionesAnidador.filter(p => !guionClasico(relative(RAIZ, p), readFileSync(p, 'utf8')));
if (!guionesAnidador.length) mal('no encontré los guiones del anidador en anidador-vectores/');
else if (!anidadorRotos.length) bien('los ' + guionesAnidador.length + ' guiones del anidador parsean');

/* El cotizador son diez mil líneas sin una sola prueba de unidad, repartidas en los once
   guiones clásicos de js/cotizador/ que cotizador.html carga en orden. Se compila cada uno; el
   número de línea que sale si truena es el del archivo, que es donde hay que ir. Y el tema, que
   es el otro guion clásico que comparten las tres páginas. */
const cot = readFileSync(join(RAIZ, 'cotizador.html'), 'utf8');
const guionesCot = [...cot.matchAll(/<script src="(js\/cotizador\/[a-z]+\.js)"><\/script>/g)].map(m => m[1]);
if (guionesCot.length < 11) mal('cotizador.html carga ' + guionesCot.length + ' guiones de js/cotizador/: ¿cambió el formato?');
else {
  const rotos = guionesCot.filter(p => !guionClasico(p, readFileSync(join(RAIZ, p), 'utf8')));
  if (!rotos.length) {
    const lineas = guionesCot.reduce((n, p) => n + readFileSync(join(RAIZ, p), 'utf8').split('\n').length, 0);
    bien('los ' + guionesCot.length + ' guiones del cotizador parsean (' + lineas + ' líneas)');
  }
}
if (guionClasico('js/tema.js', readFileSync(join(RAIZ, 'js/tema.js'), 'utf8'))) bien('js/tema.js parsea');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTodo lo que se publica compila.');
process.exit(fallos ? 1 : 0);
