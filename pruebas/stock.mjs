/* Prueba de cuantoComprar(), el redondeo agregado de la lista de compra.
   Es el único cálculo de stock.js cuyo error se paga en dinero y en un almacén lleno de
   retazos, así que se prueba solo, sin base de datos y sin navegador.
   Correr:  node /tmp/probar-stock.mjs                                          */

import { cuantoComprar } from '../js/datos/stock.js';

const LAMINA   = { fraccionable: true,  min_compra: 1 };   // acr-3mm: un retazo sirve
const FUENTE   = { fraccionable: false, min_compra: 1 };   // no hay media fuente
const REMACHES = { fraccionable: false, min_compra: 30 };  // bolsa de 30, no se venden 4

let fallas = 0;
const caso = (titulo, dado, esperado) => {
  const ok = Math.abs(dado - esperado) < 1e-9;
  if (!ok) fallas++;
  console.log((ok ? '  ok  ' : ' FALLA') + '  ' + titulo + '  ->  ' + dado +
              (ok ? '' : '   (se esperaba ' + esperado + ')'));
};

console.log('\ncuantoComprar(faltante, material)\n');

/* El caso del documento (§6.4). Dos proyectos piden 0.484 y 0.700 láminas y hay 0.5 en el
   almacén: agregando primero es UNA lámina. Redondear por proyecto daría DOS, y esa
   segunda lámina es la que se queda de retazo para siempre. */
const requerido  = 0.484 + 0.700;
const disponible = 0.5;
const faltante   = Math.max(0, requerido - disponible);
caso('agregado: 0.484 + 0.700 con 0.5 en almacén (faltante ' + faltante.toFixed(3) + ')',
     cuantoComprar(faltante, LAMINA), 1);

/* Y la comparación que justifica todo el diseño: lo mismo redondeando por proyecto, donde
   cada proyecto redondea lo suyo porque ninguno sabe del otro ni del retazo del almacén. */
const porProyecto = cuantoComprar(0.484, LAMINA) + cuantoComprar(0.700, LAMINA);
caso('redondeando por proyecto (lo que NO se hace): 0.484 y 0.700 por separado',
     porProyecto, 2);

caso('no fraccionable, faltante 0.1  ->  max(min_compra, 1)',
     cuantoComprar(0.1, FUENTE), Math.max(FUENTE.min_compra, 1));

caso('faltante 0 (ya está cubierto)', cuantoComprar(0, LAMINA), 0);

caso('min_compra 30 con faltante 4 (la bolsa de remaches)',
     cuantoComprar(4, REMACHES), 30);

/* Los bordes que rompen un redondeo hecho a mano. */
console.log('');
caso('fraccionable, faltante 0.5 exacto (no debe pedir 0.75)', cuantoComprar(0.5, LAMINA), 1);
caso('fraccionable, faltante 2.01 -> cuartos', cuantoComprar(2.01, LAMINA), 2.25);
caso('fraccionable, faltante 3 exacto', cuantoComprar(3, LAMINA), 3);
caso('faltante negativo (sobra material)', cuantoComprar(-2, LAMINA), 0);
caso('faltante basura (undefined)', cuantoComprar(undefined, LAMINA), 0);
caso('material sin datos: se trata como no fraccionable', cuantoComprar(1.2, {}), 2);

console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'todo bien') + '\n');
process.exit(fallas ? 1 : 0);
