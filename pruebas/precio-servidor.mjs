/* EL PRECIO DE LA HOJA ES EL PRECIO DEL COTIZADOR.

   El notario del Apps Script (puente/hoja-apps-script.gs) recalcula el subtotal de cada
   cotización antes de sellarla, y se niega si no le da lo mismo que al teléfono. Para eso
   lleva una COPIA del catálogo de js/cotizador/catalogo.js y de lineTotal() de
   js/cotizador/nucleo.js. Una copia que nadie compara es la que se separa sin que nadie lo
   note, y aquí el síntoma sería el peor posible: el día que suba el aluminio y se cambie un
   lado solo, NINGUNA cotización se podría autorizar —o, al revés, la hoja sellaría precios
   viejos—.

   Así que se leen los dos lados como texto, se evalúan en contextos aparte y se comparan:
   las tablas, los importes de una batería fija y de dos mil partidas al azar, la huella del
   trabajo y el total final que va impreso. Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};

const leer = ruta => readFileSync(new URL('../' + ruta, import.meta.url), 'utf8');

/* `function nombre(...){...}` completo, contando llaves y saltándose textos y comentarios.
   La misma receta que pruebas/replicas.mjs. */
function fuente(texto, nombre) {
  const ini = texto.indexOf('function ' + nombre + '(');
  if (ini < 0) throw new Error('no está function ' + nombre);
  let i = texto.indexOf('{', ini), prof = 0;
  for (; i < texto.length; i++) {
    const c = texto[i], s = texto[i + 1];
    if (c === '/' && s === '/') { i = texto.indexOf('\n', i); continue; }
    if (c === '/' && s === '*') { i = texto.indexOf('*/', i) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++;
      continue;
    }
    if (c === '{') prof++;
    if (c === '}' && --prof === 0) return texto.slice(ini, i + 1);
  }
  throw new Error('function ' + nombre + ' no cierra');
}

/* ----- El lado del cotizador: el catálogo entero y las funciones del precio ----- */
const nucleo = leer('js/cotizador/nucleo.js');
const cot = vm.createContext({});
vm.runInContext(leer('js/cotizador/catalogo.js'), cot);
const camposPrecio = /const _CAMPOS_PRECIO=\[[^\]]*\];/.exec(nucleo)[0];
vm.runInContext([
  'var Q={items:[],iva:true,estado:"borrador",precioAuth:0,itemsAuth:{},huellaAuth:""};',
  'const M2_MINIMO=1;', camposPrecio,
  ...['m2Total', 'lineTotal', 'lineTotalCrudo', 'totals', 'huellaTrabajo', 'authVigente',
      'precioFinal', 'desgloseFinal'].map(n => fuente(nucleo, n)),
].join('\n'), cot);
const C = vm.runInContext('({MATERIALES,COMPLEJIDAD,RECORTES,RECORTE_COMP_EXTRA,BASTIDORES,M2_MINIMO,' +
  '_CAMPOS_PRECIO,lineTotal,huellaTrabajo,desgloseFinal,Q:()=>Q,setQ:q=>{Q=q;}})', cot);

/* ----- El lado de la hoja: el .gs completo, sin Google ----- */
const hoja = vm.createContext({});
vm.runInContext(leer('puente/hoja-apps-script.gs'), hoja);
const H = vm.runInContext('({COT_MATERIALES,COT_COMPLEJIDAD,COT_RECORTES,COT_RECORTE_COMP_EXTRA,' +
  'COT_BASTIDORES,COT_M2_MINIMO,COT_CAMPOS_PRECIO,cotLineTotal,cotSubtotal,cotHuella,cotTotalFinal})', hoja);

const mapa = (arr, campo) => Object.fromEntries(arr.map(x => [x.key, x[campo]]));
/* Los objetos vienen de otro contexto de vm: se comparan por su JSON, no por identidad. */
const plano = x => JSON.parse(JSON.stringify(x));

console.log('\nLAS TABLAS — la hoja cobra lo mismo que el catálogo');
eq('materiales de letras', plano(H.COT_MATERIALES), mapa(C.MATERIALES, 'precio'));
eq('complejidad', plano(H.COT_COMPLEJIDAD), mapa(C.COMPLEJIDAD, 'extra'));
eq('acabados de recorte', plano(H.COT_RECORTES), mapa(C.RECORTES, 'precio'));
eq('el extra del sándwich complejo', H.COT_RECORTE_COMP_EXTRA, C.RECORTE_COMP_EXTRA);
eq('bastidores', plano(H.COT_BASTIDORES), mapa(C.BASTIDORES, 'tarifa'));
eq('el mínimo de un metro cuadrado', H.COT_M2_MINIMO, C.M2_MINIMO);
eq('los campos que mueven el precio, en el mismo orden', plano(H.COT_CAMPOS_PRECIO), plano(C._CAMPOS_PRECIO));

console.log('\nLOS IMPORTES — partida por partida, al centavo');
const bateria = [
  { id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, altura: 40, n: 8 },
  { id: 2, tipo: 'letras', material: 'acero', comp: 'compleja', luz: false, altura: 25.5, n: 11 },
  { id: 3, tipo: 'letras', material: 'acr-vinil', comp: 'cursiva', luz: true, altura: 0, n: 5 },
  { id: 4, tipo: 'recorte', acab: 'sencillo', altura: 6, n: 11 },
  { id: 5, tipo: 'recorte', acab: 'sandwich', recComp: true, altura: 8.3, n: 3 },
  { id: 6, tipo: 'recorte', acab: 'vinil', recComp: true, altura: 7, n: 2 },
  { id: 7, tipo: 'bastidor', bas: 'lamina', ancho: 100.5, alto: 102 },       // el $973.845 de nucleo.js
  { id: 8, tipo: 'bastidor', bas: 'alucobond', ancho: 50, alto: 40 },         // debajo de 1 m²
  { id: 9, tipo: 'caja', tarifa: 3900, ancho: 120, alto: 90 },
  { id: 10, tipo: 'caja', tarifa: 4600, ancho: 30, alto: 30 },
  { id: 11, tipo: 'caja', tarifa: 5123.37, ancho: 0, alto: 90 },
  { id: 12, tipo: 'manual', pz: 3, pu: 1234.567 },
  { id: 13, tipo: 'manual', pz: 0, pu: 99 },
  { id: 14, tipo: 'letras', material: 'inventado', comp: 'recta', luz: true, altura: 30, n: 4 },
  { id: 15, tipo: 'bastidor', bas: 'lamina', ancho: '80', alto: '150' },      // números que llegan como texto
];
for (const it of bateria) eq('partida ' + it.id + ' (' + it.tipo + ')', H.cotLineTotal(it), C.lineTotal(it));

/* Y dos mil al azar, con decimales feos a propósito: el redondeo a centavo de un flotante
   es donde dos copias «iguales» se separan si el orden de las multiplicaciones cambia. */
let semilla = 20260925;
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const uno = arr => arr[Math.floor(azar() * arr.length)];
const dec = max => Math.round(azar() * max * 100) / 100;
let distintas = 0;
for (let i = 0; i < 2000; i++) {
  const tipo = uno(['letras', 'recorte', 'bastidor', 'caja', 'manual']);
  const it = { id: i, tipo };
  if (tipo === 'letras') Object.assign(it, { material: uno(C.MATERIALES).key, comp: uno(C.COMPLEJIDAD).key, luz: azar() < 0.6, altura: dec(120), n: Math.floor(azar() * 30) });
  if (tipo === 'recorte') Object.assign(it, { acab: uno(C.RECORTES).key, recComp: azar() < 0.5, altura: dec(10), n: Math.floor(azar() * 40) });
  if (tipo === 'bastidor') Object.assign(it, { bas: uno(C.BASTIDORES).key, ancho: dec(400), alto: dec(300) });
  if (tipo === 'caja') Object.assign(it, { tarifa: uno([3900, 4600, dec(9000)]), ancho: dec(400), alto: dec(300) });
  if (tipo === 'manual') Object.assign(it, { pz: Math.floor(azar() * 20), pu: dec(20000) });
  if (H.cotLineTotal(it) !== C.lineTotal(it)) distintas++;
}
eq('dos mil partidas al azar, ninguna distinta', distintas, 0);

console.log('\nLA HUELLA — el mismo trabajo se llama igual en los dos lados');
for (const iva of [true, false]) {
  C.setQ({ items: bateria, iva, estado: 'borrador', precioAuth: 0, itemsAuth: {}, huellaAuth: '' });
  eq('con IVA ' + (iva ? 'sí' : 'no'), H.cotHuella(iva, bateria), C.huellaTrabajo());
}
/* Lo que viaja por JSON es lo que la hoja ve: un campo undefined no llega, un null sí. */
const porJson = JSON.parse(JSON.stringify([{ id: 'a', tipo: 'manual', pz: 2, pu: null, material: undefined }]));
C.setQ({ items: [{ id: 'a', tipo: 'manual', pz: 2, pu: null, material: undefined }], iva: true, estado: 'borrador', precioAuth: 0, itemsAuth: {}, huellaAuth: '' });
eq('después de viajar por JSON, la misma', H.cotHuella(true, porJson), C.huellaTrabajo());

console.log('\nEL TOTAL — el que va impreso, con y sin precio autorizado');
const items = bateria.slice(0, 6);
const sub = H.cotSubtotal(items);
for (const iva of [true, false]) {
  for (const precio of [0, 12345.67, +(sub * (iva ? 1.16 : 1)).toFixed(2), +(sub * (iva ? 1.16 : 1) + 0.005).toFixed(3)]) {
    C.setQ({ items, iva, estado: 'autorizada', precioAuth: precio, itemsAuth: {}, huellaAuth: '' });
    vm.runInContext('Q.huellaAuth=huellaTrabajo();', cot);
    eq('IVA ' + (iva ? 'sí' : 'no') + ', autorizado ' + precio, H.cotTotalFinal(sub, iva, precio), C.desgloseFinal().neto);
  }
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
