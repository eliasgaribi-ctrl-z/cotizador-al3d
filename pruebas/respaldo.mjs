/* El respaldo completo: un archivo con las dos mitades, y las dos listas de claves iguales.

   La plataforma arma la mitad del cotizador LEYENDO su almacenamiento con una lista de claves
   propia, porque cotizador.html es un archivo sin módulos y no se puede importar. Dos listas
   de lo mismo es exactamente la duplicación que se separa sin que nadie lo note: alguien
   añade una clave al cotizador, el respaldo completo deja de llevarla, y se descubre al
   restaurar en el teléfono nuevo, cuando ya no hay de dónde sacarla. Esta prueba las
   compara. Y comprueba que lo que arma la plataforma tenga la forma que `restaurarDesde()`
   del cotizador valida.

   Se corre con pruebas/correr.sh, como todas.
*/
import { readFileSync } from 'fs';
import { RESPALDO_KEYS, armarRespaldoCotizador } from '../js/datos/cotizador.js';

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + nombre + (ok ? '' : '  → dio ' + JSON.stringify(real) + ', esperaba ' + JSON.stringify(esperado)));
  if (!ok) fallos++;
};

/* La lista vive en js/cotizador/historial.js; las constantes que nombra pueden estar en cualquiera
   de los once guiones, así que se leen todos, en el orden en que los carga cotizador.html. */
const html = ['catalogo','nucleo','partidas','proceso','ia','entrega','historial','escalador','venta','vectorizador','arranque']
  .map(n => readFileSync(new URL('../js/cotizador/' + n + '.js', import.meta.url), 'utf8')).join('\n');

console.log('\nLAS DOS LISTAS DE CLAVES');
/* La lista del cotizador nombra constantes (CANVA_KEY, PREF_RV_PCT…). Se resuelven buscando
   su `const X='…'` en el mismo archivo, que es lo que haría alguien leyéndolo. */
const lista = (/const RESPALDO_KEYS=\[([\s\S]*?)\];/.exec(html) || [, ''])[1];
const tokens = lista.split(',').map(t => t.trim()).filter(Boolean);
const constantes = {};
for (const m of html.matchAll(/\b([A-Z_]+)=\s*'([a-z0-9_]+)'/g)) if (!(m[1] in constantes)) constantes[m[1]] = m[2];
const delCotizador = tokens.map(t => {
  const lit = /^'([^']+)'$/.exec(t);
  if (lit) return lit[1];
  return constantes[t] || ('<<' + t + ' sin resolver>>');
});
eq('la lista del cotizador se pudo leer entera', delCotizador.filter(k => k.startsWith('<<')), []);
eq('tiene 17 claves', delCotizador.length, 17);
eq('la plataforma lleva EXACTAMENTE las mismas', [...RESPALDO_KEYS].sort(), [...delCotizador].sort());

console.log('\nLA FORMA DE LO QUE ARMA LA PLATAFORMA');
/* En node no hay localStorage: se simula uno mínimo con dos claves puestas y una ausente. */
globalThis.localStorage = {
  _d: { al3d_historial: '[{"folio":"COT-0001"}]', al3d_folio: '7' },
  getItem(k) { return k in this._d ? this._d[k] : null; },
};
const r = armarRespaldoCotizador();
eq('app es la del cotizador', r.app, 'cotizador-al3d');
eq('formato 1', r.formato, 1);
eq('trae fecha ISO', /^\d{4}-\d{2}-\d{2}T/.test(r.fecha), true);
eq('datos es un objeto de textos', Object.values(r.datos).every(v => typeof v === 'string'), true);
eq('solo las claves que existen', Object.keys(r.datos).sort(), ['al3d_folio', 'al3d_historial']);
eq('y el texto va tal cual, sin parsear', r.datos.al3d_historial, '[{"folio":"COT-0001"}]');

/* Y lo que `restaurarDesde()` exige del cotizador: que `al3d_historial` sea un arreglo y
   `al3d_q` un objeto con items. Se comprueba contra el texto del cotizador que esas dos
   validaciones siguen ahí, para que si alguien las cambia esta prueba lo diga. */
console.log('\nLO QUE EL COTIZADOR VALIDA AL RESTAURAR');
eq('acepta el respaldo completo y toma su mitad', html.includes("paquete.app==='al3d-completo'&&paquete.cotizador"), true);
eq('exige que el historial sea un arreglo', html.includes("!Array.isArray(JSON.parse(D['al3d_historial']))"), true);
eq('ofrece la restauración que deja la plataforma al arrancar', /ofrecerRestauracionPendiente\(\);\s*\n\}/.test(html), true);
eq('y la lee de la clave que la plataforma escribe', html.includes("const RESTAURAR_PF_KEY='al3d_pf_restaurar'"), true);

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl respaldo completo cuadra de los dos lados.');
process.exit(fallos ? 1 : 0);
