/* FABRICACIÓN Y CALENDARIO CON LAS PIEZAS — lo que se puede probar sin navegador.
 *
 * Casi todo lo de esta zona es interfaz y se ejerce en pruebas/navegador/pf-fabricacion.mjs. Aquí
 * van las dos cosas que fallan EN SILENCIO y que salen marcado plausible:
 *
 *   · LAS MARCAS DEL RIEL DEL TALLER (F5). Cada hito de la ventana (en diseño, cortado, armado,
 *     listo) se pinta rellena si la etapa real del proyecto ya llegó a él, roja con muesca si quedó
 *     detrás de hoy sin hacerse, y hueca si no. `marcasDelRiel()` decide eso con dos fechas y la
 *     etapa; si el orden de las etapas que repite `ui.js` se desfasa de `ETAPAS` de datos, un
 *     proyecto «armado» se vería con el corte pendiente y nadie lo notaría hasta ir tarde de
 *     verdad. Se prueba contra ventanas que calcula `ventanaTaller()` de verdad, no inventadas.
 *   · QUE LA HOJA DE ESTILOS Y EL CÓDIGO NO VUELVAN A TENER LO QUE SE QUITÓ: ningún guion en línea
 *     en esta pantalla (la plataforma no los permite), ningún bucle infinito en el bloque nuevo
 *     del CSS, y cada animación nueva con su apagado para menos movimiento.
 *
 * Se corre con pruebas/correr.sh, como todas.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as UI from '../js/nucleo/ui.js';
import * as T from '../js/datos/taller.js';
import { ETAPAS } from '../js/datos/proyectos.js';
import { masDias } from '../js/nucleo/fechas.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');

let fallos = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  const ok = a === b;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + que + (ok ? '' : '\n      dio: ' + a + '\n      esp: ' + b));
  if (!ok) fallos++;
};
const cierto = (que, cond, extra) => {
  console.log('  ' + (cond ? '✓' : '✗') + ' ' + que + (cond ? '' : '  → ' + (extra === undefined ? '' : JSON.stringify(extra))));
  if (!cond) fallos++;
};

const HOY = '2026-10-01';
const letras = { tipo: 'letras', altura: 40, n: 8, luz: true };
/* Un proyecto con instalación a 9 días: plazo de 2 semanas (14 días) → empieza hace 5, listo en 8,
   y los hitos de en medio caen en hoy-1 (cortado) y hoy+4 (armado). */
const proy = (etapa, o = {}) => ({ id: 'p1', nombre: 'Tacos Don Beto', etapa, tipo_trabajo: ['Letras 3D con iluminacion'],
  fecha_ganado: '2026-09-20', plazo_k: 3, origen: { items: [letras] }, ...o });
const ventana = (etapa, o = {}, inst) => T.ventanaTaller(proy(etapa, o),
  inst === undefined ? { fecha: masDias(HOY, 9), estado: 'confirmada' } : inst, { hoy: HOY });
const estados = v => UI.marcasDelRiel(v, HOY).marcas.map(m => m.estado);

console.log('\nA · EL ORDEN DE LAS ETAPAS QUE REPITE ui.js ES EL DE DATOS');
eq('ORDEN_DEL_RIEL = las etapas de datos/proyectos.js sin «cancelado»', UI.ORDEN_DEL_RIEL, ETAPAS.filter(e => e !== 'cancelado'));
const v0 = ventana('ganado');
eq('los hitos que el riel marca son los de la ventana, en su orden',
   UI.HITOS_DEL_RIEL.map(h => h[0]), Object.keys(v0.hitos).filter(k => k !== 'instalado'));
cierto('cada hito del riel cae después o el mismo día que el anterior (monotonía de datos)',
  UI.HITOS_DEL_RIEL.every(([k], i, a) => i === 0 || v0.hitos[k] >= v0.hitos[a[i - 1][0]]), v0.hitos);

console.log('\nB · QUÉ MARCA ESTÁ RELLENA, CUÁL ROJA Y CUÁL HUECA');
console.log('   hitos: ' + JSON.stringify(v0.hitos) + ' · hoy ' + HOY);
eq('ganado: en diseño y cortado ya pasaron sin hacerse → rojos; armado y listo, huecos',
   estados(v0), ['tarde', 'tarde', 'pendiente', 'pendiente']);
eq('en diseño: la primera se rellena; cortado sigue rojo (era hace un día)',
   estados(ventana('en_diseno')), ['hecho', 'tarde', 'pendiente', 'pendiente']);
eq('cortado: dos rellenas, el resto hueco (armado es dentro de 4 días: no va tarde)',
   estados(ventana('cortado')), ['hecho', 'hecho', 'pendiente', 'pendiente']);
eq('armado: tres rellenas', estados(ventana('armado')), ['hecho', 'hecho', 'hecho', 'pendiente']);
eq('listo: las cuatro rellenas', estados(ventana('listo')), ['hecho', 'hecho', 'hecho', 'hecho']);
eq('instalado: nada se queda rojo aunque la fecha ya pasó', estados(ventana('instalado')), ['hecho', 'hecho', 'hecho', 'hecho']);
eq('una etapa que no conoce (cancelado) no inventa marcas rellenas', estados(ventana('cancelado')).filter(e => e === 'hecho'), []);

console.log('\nC · UNA INSTALACIÓN QUE YA PASÓ: TODO LO NO HECHO ESTÁ ATRASADO');
const vTarde = ventana('ganado', {}, { fecha: masDias(HOY, -2), estado: 'confirmada' });
eq('instalación hace 2 días y el proyecto sigue en ganado: las cuatro rojas', estados(vTarde), ['tarde', 'tarde', 'tarde', 'tarde']);

console.log('\nD · POSICIONES');
const r = UI.marcasDelRiel(v0, HOY);
cierto('todas entre 0 y 1', r.marcas.every(m => m.pos >= 0 && m.pos <= 1) && r.hoy >= 0 && r.hoy <= 1, r);
eq('la primera marca (en diseño) cae en el extremo izquierdo y la última (listo) en el derecho', [r.marcas[0].pos, r.marcas[3].pos], [0, 1]);
cierto('crecen en el orden de los hitos', r.marcas.every((m, i, a) => i === 0 || m.pos >= a[i - 1].pos), r.marcas.map(m => m.pos));
cierto('«hoy» cae entre la segunda y la tercera: el corte quedó atrás y el armado adelante',
  r.hoy > r.marcas[1].pos && r.hoy < r.marcas[2].pos, { hoy: r.hoy, marcas: r.marcas.map(m => m.pos) });
const antes = UI.marcasDelRiel(ventana('ganado', {}, { fecha: masDias(HOY, 40), estado: 'confirmada' }), HOY);
eq('una ventana que todavía no empieza pega «hoy» al borde izquierdo', antes.hoy, 0);
const despues = UI.marcasDelRiel(vTarde, HOY);
eq('una que ya terminó lo pega al derecho', despues.hoy, 1);
cierto('cada marca trae un título con su nombre, su fecha y su estado cuando no es pendiente',
  /En diseño · 26 sep · va tarde/.test(r.marcas[0].titulo) && /Armado · 5 oct$/.test(r.marcas[2].titulo), r.marcas.map(m => m.titulo));

console.log('\nE · LO QUE NO TIENE DE DÓNDE CONTAR NO INVENTA UN RIEL');
const sinFechas = ventana('ganado', { fecha_ganado: null }, null);
eq('sin instalación y sin fecha de venta: ninguna marca', UI.marcasDelRiel(sinFechas, HOY), { marcas: [], hoy: 0 });
eq('null no truena', UI.marcasDelRiel(null, HOY), { marcas: [], hoy: 0 });
eq('sin instalación pero con fecha de venta SÍ hay marcas (la hipótesis se dibuja punteada en el CSS)',
   UI.marcasDelRiel(ventana('ganado', {}, null), HOY).marcas.length, 4);

console.log('\nF · LA FILA PINTADA (sin navegador no hay pieza; queda el riel vacío pero la fila entera)');
const html = UI.filaTaller(ventana('ganado'), HOY, { plazoEditable: true });
cierto('la fila no tiene el punto de «hoy» de antes (.tal-hoy)', !/tal-hoy/.test(html), html.slice(0, 120));
cierto('la pista sigue siendo aria-hidden (la frase es la que se lee)', /class="tal-pista" aria-hidden="true"/.test(html));
cierto('y lleva su riel con las clases de la hipótesis y del atraso', /riel-marcas tal-riel tarde/.test(html), html.match(/<span class="riel[^"]*"/));

console.log('\nG · LA HOJA DE ESTILOS Y EL CÓDIGO');
const css = leer('css/plataforma.css');
const trozo = (a, b) => { const i = css.indexOf(a), j = css.indexOf(b); return i >= 0 && j > i ? css.slice(i, j) : ''; };
const miBloque = trozo('/* ── Plataforma · Fabricación y calendario ── */', '/* ── fin de pf-fabricacion ── */');
const miRm = trozo('/* ── rm · pf-fabricacion ── */', '/* ── fin de rm · pf-fabricacion ── */');
cierto('el bloque de la zona existe y no está vacío', miBloque.length > 500, miBloque.length);
cierto('ninguna animación infinita en el bloque nuevo', !/infinite/.test(miBloque));
cierto('nada de `transition:all` ni `backdrop-filter` en el bloque nuevo', !/transition:\s*all|backdrop-filter/.test(miBloque));
cierto('el bloque de menos movimiento existe y apaga la subida de la lista del día',
  /\.dia-lista\[data-recien\]\{animation:none\}/.test(miRm), miRm.slice(0, 80));
cierto('y deja la barra de acción solo en fundido', /\.pf-mbar\.cal-mbar\{transition-duration:\.15s\}/.test(miRm));
cierto('el punto `.tal-hoy` ya no existe en la hoja de estilos', !/\.tal-hoy/.test(css));
const jsTodo = leer('js/mod/fabricacion.js');
/* Sin comentarios: el archivo explica en prosa justamente lo que prohíbe. */
const js = jsTodo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
cierto('esta pantalla no usa manejadores en línea (la plataforma no los permite)', !/\son(click|input|change|pointer\w*)=/.test(js));
cierto('ni `new Date(iso)`: las fechas pasan por nucleo/fechas.js', !/new Date\((iso|f|fecha)\)/.test(js));
cierto('ni el «Leyendo el calendario…» que tapaba la silueta del router (F16 ya estaba)',
  !/textContent\s*=\s*['"]Leyendo|vacio\(\s*['"]Leyendo|Leyendo el calendario…['"]\s*[,)]/.test(js));

console.log('\n' + (fallos ? fallos + ' fallo(s) en pf-fabricacion.' : 'Fabricación con las piezas (node): todo en verde.'));
process.exit(fallos ? 1 : 0);
