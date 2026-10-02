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
  ...['m2Total', 'lineTotal', 'lineTotalCrudo', 'totals', 'huellaTrabajo', 'huellaOrdenada', 'authVigente',
      'precioFinal', 'desgloseFinal',
      /* Lo que imprime cada renglón del PDF: el sello lo firma desde puente-sheets-8. */
      'itemPrecio', 'subAjustado', 'netoAjustado', 'ajusteAuth', 'hayAumentoAuth', 'piezasDe',
      'preciosCliente'].map(n => fuente(nucleo, n)),
  /* Y los renglones como los arma el PDF antes de decidir si imprime el QR (entrega.js), con la
     descripción que viaja a la hoja (notario.js → partidas.js). */
  /const RENGLON_DESC_MAX=\d+;/.exec(leer('js/cotizador/entrega.js'))[0],
  ...['renglonesDelPapel', 'selloDeOtrosRenglones'].map(n => fuente(leer('js/cotizador/entrega.js'), n)),
  fuente(leer('js/cotizador/notario.js'), 'descParaHoja'),
  fuente(leer('js/cotizador/partidas.js'), 'shortDescAuth'),
].join('\n'), cot);
const C = vm.runInContext('({MATERIALES,COMPLEJIDAD,RECORTES,RECORTE_COMP_EXTRA,BASTIDORES,M2_MINIMO,' +
  '_CAMPOS_PRECIO,lineTotal,huellaTrabajo,desgloseFinal,preciosCliente,piezasDe,renglonesDelPapel,' +
  'selloDeOtrosRenglones,descParaHoja,Q:()=>Q,setQ:q=>{Q=q;}})', cot);

/* ----- El lado de la hoja: el .gs completo, sin Google ----- */
const hoja = vm.createContext({});
vm.runInContext(leer('puente/hoja-apps-script.gs'), hoja);
const H = vm.runInContext('({COT_MATERIALES,COT_COMPLEJIDAD,COT_RECORTES,COT_RECORTE_COMP_EXTRA,' +
  'COT_BASTIDORES,COT_M2_MINIMO,COT_CAMPOS_PRECIO,cotLineTotal,cotSubtotal,cotHuella,cotTotalFinal,' +
  'cotPiezas,cotPrecioFinal,cotPreciosCliente,renglonesDe,renglonesDeTexto,itemsAuthCanon,itemsAuthDeCanon,dinero2})', hoja);

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

/* ----- Los renglones que firma el sello (puente-sheets-8) -----
   La hoja firma, por partida, el importe que IMPRIME el PDF: el de preciosCliente(), con el
   ajuste por partida y el aumento repartido al centavo. Si la copia de la hoja se separara de
   nucleo.js aunque fuera un centavo en una cotización de cada mil, verificar.html le diría a un
   cliente con un papel legítimo que un renglón no coincide. Se arma la autorización como la
   arma rutaAutorizar_ —precio a centavo, ajustes por su canon— y se compara contra lo que el
   teléfono calcula después de aplicarSello. */
function autorizarComoLaHoja(items, iva, precioTecleado, ajustesTecleados) {
  const subCalc = H.cotSubtotal(items);
  const precioAuth = +H.dinero2(precioTecleado);
  const ia = plano(H.itemsAuthDeCanon(H.itemsAuthCanon(ajustesTecleados)));
  const fin = H.cotPrecioFinal(subCalc, iva, precioAuth);
  C.setQ({ items, iva, estado: 'autorizada', precioAuth, itemsAuth: ia, huellaAuth: '' });
  vm.runInContext('Q.huellaAuth=huellaTrabajo();', cot);
  return { ia, fin };
}
console.log('\nLOS RENGLONES — el importe que firma la hoja es el que imprime el PDF');
for (const it of bateria) eq('piezas de la partida ' + it.id, H.cotPiezas(it), C.piezasDe(it));
{
  /* El caso de pruebas/precios-cliente.mjs: $5,560 + IVA autorizado en $7,200, que se reparte. */
  const items = [{ id: 1, tipo: 'manual', pz: 5, pu: 1000 }, { id: 2, tipo: 'manual', pz: 2, pu: 280 }];
  const { ia, fin } = autorizarComoLaHoja(items, true, 7200, {});
  eq('un aumento se reparte igual en los dos lados', plano(H.cotPreciosCliente(items, true, ia, fin)), plano(C.preciosCliente()));
}
let separadas = 0, conAumento = 0, conDescuento = 0, conAjustes = 0, primeraSeparada = null;
semilla = 20261001;
for (let i = 0; i < 3000; i++) {
  const n = 1 + Math.floor(azar() * 6), items = [];
  for (let j = 0; j < n; j++) {
    const tipo = uno(['letras', 'recorte', 'bastidor', 'caja', 'manual']);
    const it = { id: 100 + j, tipo };
    if (tipo === 'letras') Object.assign(it, { material: uno(C.MATERIALES).key, comp: uno(C.COMPLEJIDAD).key, luz: azar() < 0.6, altura: dec(80), n: Math.floor(azar() * 14) });
    if (tipo === 'recorte') Object.assign(it, { acab: uno(C.RECORTES).key, recComp: azar() < 0.5, altura: dec(10), n: Math.floor(azar() * 30) });
    if (tipo === 'bastidor') Object.assign(it, { bas: uno(C.BASTIDORES).key, ancho: dec(400), alto: dec(200) });
    if (tipo === 'caja') Object.assign(it, { tarifa: uno([3900, 4600]), ancho: dec(300), alto: dec(200) });
    if (tipo === 'manual') Object.assign(it, { pz: Math.floor(azar() * 9), pu: dec(9000) });
    items.push(it);
  }
  const iva = azar() < 0.7;
  const ajustes = {};
  if (azar() < 0.35) for (const it of items) if (azar() < 0.5) ajustes[it.id] = dec(C.lineTotal(it) * 1.5 + 1);
  if (Object.keys(ajustes).length) conAjustes++;
  const sub = H.cotSubtotal(items), neto = iva ? sub * 1.16 : sub;
  const precio = uno([0, 0, +(neto * (0.75 + azar() * 0.6)).toFixed(2), Math.round(neto / 100) * 100, +(neto + 0.01).toFixed(2)]);
  const { ia, fin } = autorizarComoLaHoja(items, iva, precio, ajustes);
  const hoja = JSON.stringify(plano(H.cotPreciosCliente(items, iva, ia, fin))), tel = JSON.stringify(plano(C.preciosCliente()));
  if (hoja !== tel) { separadas++; if (!primeraSeparada) primeraSeparada = { items, iva, precio, ajustes, hoja, tel }; }
  if (vm.runInContext('hayAumentoAuth()', cot)) conAumento++;
  else if (vm.runInContext('ajusteAuth()', cot) > 0.01) conDescuento++;
}
eq('tres mil cotizaciones autorizadas al azar, ningún importe distinto', separadas, 0);
if (primeraSeparada) console.log('         la primera: ' + JSON.stringify(primeraSeparada));
/* Que la batería de verdad pase por los tres caminos: sin esto, un azar que nunca reparte daría
   «ninguna distinta» sin haber comparado el reparto. */
console.log('         (' + conAumento + ' con aumento repartido, ' + conDescuento + ' con descuento, ' + conAjustes + ' con ajustes por partida)');
eq('  y el azar pasó por aumentos, descuentos y ajustes por partida', [conAumento > 300, conDescuento > 300, conAjustes > 300], [true, true, true]);

console.log('\nEL PAPEL Y EL SELLO — el PDF reconoce los renglones que firmó la hoja');
{
  const items = [
    { id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, altura: 40, n: 8, desc: 'Letras «TACOS», con "comillas", y comas' },
    { id: 2, tipo: 'bastidor', bas: 'lamina', ancho: 300, alto: 60 },                 // sin descripción: va la corta
    { id: 3, tipo: 'manual', pz: 2, pu: 450, desc: 'Instalación '.repeat(20) },        // más de 120 letras
  ];
  /* Lo que viaja a la hoja (cotParaHoja → limpiarCotizacion): los campos de precio y la
     descripción corta, cortada a 300. */
  const aLaHoja = items.map(it => ({ ...it, desc: String(C.descParaHoja(it)).slice(0, 300) }));
  const { ia, fin } = autorizarComoLaHoja(items, true, 15000, { 2: 1500 });
  const firmados = plano(H.renglonesDeTexto(H.renglonesDe(aLaHoja, true, ia, fin)));
  eq('uno por partida, en el orden del PDF', firmados.map(r => r.descripcion.slice(0, 14)), ['Letras «TACOS»', 'Bastidor · 300', 'Instalación In']);
  eq('la descripción se corta a 120', firmados[2].descripcion.length, 120);
  eq('las piezas, las de la columna «Pzas.»', firmados.map(r => r.cantidad), [8, 1, 2]);
  eq('los importes suman el subtotal autorizado', +firmados.reduce((s, r) => s + r.importe, 0).toFixed(2), C.desgloseFinal().sub);
  vm.runInContext('Q.sello={renglones:' + JSON.stringify(firmados) + '};', cot);
  eq('el PDF los reconoce: imprime el QR', C.selloDeOtrosRenglones(), false);
  eq('  y los arma idénticos', JSON.stringify(plano(C.renglonesDelPapel())), JSON.stringify(firmados));
  vm.runInContext('Q.items=[Q.items[2],Q.items[0],Q.items[1]];', cot);
  eq('reordenar las filas no lo suelta: el renglón es el mismo', C.selloDeOtrosRenglones(), false);
  vm.runInContext('Q.items[1]=Object.assign({},Q.items[1],{desc:"Letras «TACOS» en acero"});', cot);
  eq('una descripción corregida después de sellar sí: el QR enseñaría la de antes', C.selloDeOtrosRenglones(), true);
  vm.runInContext('Q.sello={codigo:"X"};', cot);
  eq('un sello de una hoja anterior, sin renglones, no tiene contra qué compararse', C.selloDeOtrosRenglones(), false);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
