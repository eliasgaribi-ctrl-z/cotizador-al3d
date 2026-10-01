/* COMISIONES, PRIMERO LAS CHICAS: la cuenta de «¿a cuántas les alcanza?».
 *
 * Es la aritmética de la función 54 de Control. Con un monto en la mano, la dirección quiere
 * saber cuántas comisiones COMPLETAS puede liquidar hoy, empezando por las más chicas, para
 * bajar el número de pendientes. Lo que se defiende aquí no se ve mirando la pantalla:
 *
 *   · que las que alcanzan sean exactamente las primeras de la lista de menor a mayor (una
 *     que no cabe deja fuera a todas las que siguen);
 *   · que contar así sea lo mejor posible: se compara contra la fuerza bruta, probando TODAS
 *     las combinaciones de listas chicas, para que la frase «empezar por las chicas es lo
 *     óptimo» sea un hecho comprobado y no una intuición;
 *   · que la frontera sea exacta: con centavos enteros, «alcanza justo» alcanza y «le faltan
 *     tres centavos» no (0.1 + 0.2 no es 0.3 en punto flotante);
 *   · que lo que se teclea («$4,000», «4000.50», basura) se lea siempre como un monto;
 *   · que de la regla de la hoja (`comisionDe`) solo entre lo ABONABLE: la comisión de una
 *     venta ya liquidada, y lo que la hoja dice que falta, no lo que ya se abonó.
 *
 * Uso:  node pruebas/comisiones.mjs
 */
import { alcanceDeComisiones, montoDeTexto } from '../js/datos/ventas.js';
import { comisionDe } from '../js/datos/asistente-contexto.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const ok = (que, cond) => { if (cond) { bien++; console.log('  ok   ' + que); } else { mal++; console.log('  FALLA ' + que); } };
const lista = (...montos) => montos.map((monto, i) => ({ id: 'c' + i, monto, nombre: 'Venta ' + i, sub: monto * 10 }));

console.log('\nEL MONTO QUE SE TECLEA');
eq('con pesos y coma de miles', montoDeTexto('$4,000'), 4000);
eq('con centavos', montoDeTexto(' 4,000.50 '), 4000.5);
eq('sin nada', montoDeTexto(''), 0);
eq('basura', montoDeTexto('abc'), 0);
eq('negativo no es un monto', montoDeTexto('-500'), 0);
eq('dos puntos: se queda con el primero', montoDeTexto('1.2.3'), 1.23);
eq('null y undefined', [montoDeTexto(null), montoDeTexto(undefined)], [0, 0]);
eq('redondea a centavos', montoDeTexto('10.006'), 10.01);

console.log('\nLAS QUE ALCANZAN SON LAS PRIMERAS, DE MENOR A MAYOR');
let r = alcanceDeComisiones(lista(900, 600, 1200, 1000, 1380), 4000);
eq('se ordenan de menor a mayor', r.orden.map(x => x.monto), [600, 900, 1000, 1200, 1380]);
eq('con 4,000 alcanzan cuatro: 600 + 900 + 1,000 + 1,200 = 3,700', r.k, 4);
eq('suma de las que alcanzan: 3,700', r.suma, 3700);
eq('sobran 300', r.sobra, 300);
eq('la siguiente es la de 1,380', r.siguiente && r.siguiente.monto, 1380);
eq('y le faltan 1,080 (1,380 menos los 300 que sobran)', r.falta, 1080);
eq('el total pendiente es lo que suman todas', r.total, 5080);
eq('«disponible» regresa tal cual', r.disponible, 4000);

console.log('\nLAS FRONTERAS');
r = alcanceDeComisiones(lista(600, 900), 1500);
eq('alcanza justo: las dos', r.k, 2);
eq('y no sobra nada', r.sobra, 0);
eq('sin siguiente no falta nada', [r.siguiente, r.falta], [null, 0]);
r = alcanceDeComisiones(lista(600, 900), 1499.97);
eq('le faltan tres centavos: solo la primera', r.k, 1);
eq('y se dice cuánto falta, a los centavos', r.falta, 0.03);
r = alcanceDeComisiones(lista(0.1, 0.2), 0.3);
eq('0.1 y 0.2 caben en 0.3 (el punto flotante diría que no)', r.k, 2);
r = alcanceDeComisiones(lista(600, 900), 0);
eq('con cero no alcanza ninguna', [r.k, r.suma, r.sobra], [0, 0, 0]);
eq('y la primera es la siguiente, con todo su monto por faltar', [r.siguiente.monto, r.falta], [600, 600]);
r = alcanceDeComisiones(lista(600, 900), -50);
eq('un monto negativo se trata como cero', r.k, 0);
r = alcanceDeComisiones([], 5000);
eq('sin comisiones: nada que pagar, todo sobra', [r.k, r.total, r.sobra, r.siguiente], [0, 0, 5000, null]);
r = alcanceDeComisiones(null, 5000);
eq('una lista que no es lista tampoco truena', r.orden, []);
r = alcanceDeComisiones([{ id: 'a', monto: 0 }, { id: 'b', monto: -3 }, null, { id: 'c', monto: 500 }], 1000);
eq('lo que vale cero, lo negativo y lo vacío no cuentan como comisión', [r.orden.length, r.k], [1, 1]);

console.log('\nEL DESEMPATE ES ESTABLE');
r = alcanceDeComisiones([
  { id: 'z', monto: 500, nombre: 'Zeta', sub: 5000 },
  { id: 'a', monto: 500, nombre: 'Álamo', sub: 5000 },
  { id: 'm', monto: 500, nombre: 'Mar', sub: 4000 },
], 1000);
eq('mismo monto: gana el subtotal menor, y luego el nombre', r.orden.map(x => x.id), ['m', 'a', 'z']);
eq('y alcanzan dos', r.k, 2);
const antes = lista(900, 600);
const copia = JSON.stringify(antes);
alcanceDeComisiones(antes, 5000);
eq('no desordena la lista que le dieron', JSON.stringify(antes), copia);

console.log('\nEMPEZAR POR LAS CHICAS ES LO ÓPTIMO (contra la fuerza bruta)');
/* Un generador determinista (no Math.random: una falla tiene que poderse repetir). */
let semilla = 20260926;
const azar = n => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla % n; };
let corridas = 0, distintas = 0;
for (let t = 0; t < 400; t++) {
  const n = 1 + azar(9);
  const montos = Array.from({ length: n }, () => (1 + azar(4000)) / 4);   // con centavos
  const disp = azar(12000) / 4;
  const res = alcanceDeComisiones(lista(...montos), disp);
  /* Todas las combinaciones: el máximo de comisiones que cabe en `disp`. */
  let mejor = 0;
  for (let m = 0; m < (1 << n); m++) {
    let suma = 0, cuantas = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i)) { suma += Math.round(montos[i] * 100); cuantas++; }
    if (suma <= Math.round(disp * 100) && cuantas > mejor) mejor = cuantas;
  }
  corridas++;
  if (res.k !== mejor) distintas++;
  /* Y que las k primeras sumen lo que dice, sin pasarse. */
  const sumaPrefijo = res.orden.slice(0, res.k).reduce((s, x) => s + Math.round(x.monto * 100), 0);
  if (sumaPrefijo !== Math.round(res.suma * 100) || sumaPrefijo > Math.round(disp * 100)) distintas++;
}
ok(corridas + ' listas al azar: la cuenta de las chicas coincide siempre con la mejor posible y nunca se pasa del monto', distintas === 0);

console.log('\nCON LA REGLA DE LA HOJA (comisionDe)');
const venta = (o = {}) => ({ id: 'v', etapa: 'instalado', sub: 12000, neto: 13920, precio_auth: 13920, iva: true, estatus_notion: 'LIQUIDADO', ...o });
eq('liquidada: la comisión es abonable, 10 % del subtotal', comisionDe(venta()).abonable, 1200);
eq('sin liquidar: no es abonable todavía, es restante', [comisionDe(venta({ estatus_notion: 'COBRANDO' })).abonable, comisionDe(venta({ estatus_notion: 'COBRANDO' })).restante], [0, 1200]);
eq('con lo que la hoja ya abonó (restante de la hoja) manda la restante', comisionDe(venta({ comisiones: 1200, comision_restante: 700 })).abonable, 700);
eq('cancelada: nada', comisionDe(venta({ etapa: 'cancelado' })).abonable, 0);
const ventas = [venta({ id: 'a', sub: 6000 }), venta({ id: 'b', sub: 17004 }), venta({ id: 'c', sub: 9300, estatus_notion: 'COBRANDO' }), venta({ id: 'd', sub: 12150 })];
const entradas = ventas.map(p => ({ id: p.id, monto: comisionDe(p).abonable, sub: p.sub })).filter(x => x.monto > 0);
r = alcanceDeComisiones(entradas, 2000);
eq('la de una venta sin liquidar ni entra a la lista', r.orden.map(x => x.id), ['a', 'd', 'b']);
eq('con 2,000: 600 + 1,215 = 1,815; la de 1,700.40 ya no cabe', r.k, 2);
eq('y sobran 185', r.sobra, 185);

console.log('\n' + (mal ? mal + ' FALLAS' : 'Todo bien') + ' · ' + bien + ' comprobaciones');
process.exit(mal ? 1 : 0);
