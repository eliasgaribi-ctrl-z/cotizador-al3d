/* El DXF del anidador: lo que va a la máquina.
 *
 * El taller lo pidió en un audio (16/10/2026): el SVG llega al programa del router con cada
 * curva partida en tramitos sueltos y encimados, y hay que juntarlos uno por uno o pasarle
 * «Reparar problema». El DXF tiene que traer cada contorno como UNA polilínea cerrada: el de
 * fuera de una «A» y el de su hueco, dos polilíneas y nada más.
 *
 * Nada de esto se ve mirando la pantalla —el error se descubre en la máquina, con la lámina
 * puesta—, así que se prueba aquí: el archivo se vuelve a leer par por par, como lo leería el
 * programa del router, y se revisa que cada polilínea esté cerrada, sin puntos repetidos, en
 * su capa, a escala y SIN ESPEJO (en DXF la Y va hacia arriba; en SVG, hacia abajo).
 *
 * Uso: node pruebas/anidador-dxf.mjs   (o pruebas/correr.sh, que corre todas)
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = createRequire(import.meta.url)(join(RAIZ, 'anidador-vectores/js/dxf.js'));

let fallos = 0;
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, que, extra) => (c ? bien(que) : mal(que, extra));
const igual = (a, b, que) => (JSON.stringify(a) === JSON.stringify(b) ? bien(que) : mal(que + ': esperaba ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)));

/* Un lector mínimo de DXF, como el de un programa de corte: pares (código, valor). */
function leer(texto) {
  const lineas = texto.split('\r\n');
  if (lineas[lineas.length - 1] === '') lineas.pop();
  const pares = [];
  for (let i = 0; i + 1 < lineas.length; i += 2) pares.push([lineas[i].trim(), lineas[i + 1]]);
  const r = { pares, impares: lineas.length % 2 !== 0, header: {}, capas: [], polilineas: [] };
  let seccion = null, actual = null, varHeader = null;
  for (let i = 0; i < pares.length; i++) {
    const [c, v] = pares[i];
    if (c === '0' && v === 'SECTION') { seccion = pares[i + 1][1]; continue; }
    if (c === '0' && v === 'ENDSEC') { seccion = null; continue; }
    if (seccion === 'HEADER') {
      if (c === '9') varHeader = v;
      else if (varHeader) (r.header[varHeader] = r.header[varHeader] || []).push([c, v]);
    }
    if (seccion === 'TABLES' && c === '0' && v === 'LAYER') r.capas.push({ nombre: pares[i + 1][1], color: (pares.slice(i, i + 6).find(p => p[0] === '62') || [])[1] });
    if (seccion === 'ENTITIES') {
      if (c === '0' && v === 'POLYLINE') { actual = { capa: null, cerrada: false, puntos: [] }; r.polilineas.push(actual); continue; }
      if (c === '0' && v === 'VERTEX') { actual.puntos.push({ x: NaN, y: NaN }); continue; }
      if (c === '0' && v === 'SEQEND') { actual = null; continue; }
      if (actual) {
        const ult = actual.puntos[actual.puntos.length - 1];
        if (c === '8' && !actual.puntos.length) actual.capa = v;
        if (c === '70' && !actual.puntos.length) actual.cerrada = (parseInt(v, 10) & 1) === 1;
        if (c === '10' && ult) ult.x = Number(v);
        if (c === '20' && ult) ult.y = Number(v);
      }
    }
  }
  return r;
}
const cuadrado = (x, y, l) => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + l }, { x, y: y + l }];

console.log('\nLIMPIAR UN CONTORNO');
igual(D.limpiar(cuadrado(0, 0, 10)), cuadrado(0, 0, 10), 'un cuadrado se queda igual');
igual(D.limpiar([...cuadrado(0, 0, 10), { x: 0, y: 0 }]), cuadrado(0, 0, 10), 'el último igual al primero se quita: la polilínea ya va cerrada');
igual(D.limpiar([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0.00001 }, { x: 10, y: 10 }]), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 'los puntos repetidos seguidos (o a menos de una diezmilésima) se quitan');
igual(D.limpiar([{ x: 0, y: 0 }, { x: 5, y: 5 }]), null, 'con dos puntos no encierra nada');
igual(D.limpiar([{ x: 0, y: 0 }, { x: NaN, y: 1 }, { x: 5, y: 5 }, { x: 9, y: 0 }]), [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 0 }], 'un punto sin número se descarta, no se escribe «NaN»');
igual(D.limpiar(null), null, 'sin puntos');

console.log('\nUNA HOJA CON UNA «A» (contorno de fuera y su hueco)');
{
  const A = [{ x: 10, y: 40 }, { x: 25, y: 5 }, { x: 40, y: 40 }];         // la de fuera, hacia abajo como en SVG
  const hueco = [{ x: 20, y: 30 }, { x: 25, y: 18 }, { x: 30, y: 30 }];
  const { texto, contornos } = D.armar([{ ancho: 100, alto: 50, contornos: [A, hueco] }], { hueco: 25, contorno: true });
  const r = leer(texto);
  cierto(!r.impares && r.pares.length > 10, 'el archivo son pares código/valor completos');
  cierto(r.pares.every(([c]) => /^\d+$/.test(c)), 'todos los códigos son enteros');
  cierto(/\r\n0\r\nEOF\r\n$/.test(texto), 'termina en «0 / EOF» con renglones de Windows');
  igual(r.header.$ACADVER, [['1', 'AC1009']], 'DXF R12 (AC1009): lo abre cualquier programa de corte');
  igual(r.header.$INSUNITS, [['70', '4']], 'en milímetros ($INSUNITS = 4)');
  igual(r.header.$EXTMAX, [['10', '100'], ['20', '50'], ['30', '0']], 'la extensión es la hoja: 100 × 50');
  igual(r.capas.map(c => c.nombre), ['HOJA-1', 'CONTORNO-HOJA'], 'una capa para la hoja y otra para su contorno');
  igual(r.capas.find(c => c.nombre === 'CONTORNO-HOJA').color, '5', 'el contorno de la hoja va en azul');
  const piezas = r.polilineas.filter(p => p.capa === 'HOJA-1');
  igual(contornos, 2, 'dice cuántos contornos de pieza lleva');
  igual(piezas.length, 2, 'la «A» son DOS polilíneas: la de fuera y la del hueco, no un montón de líneas sueltas');
  cierto(r.polilineas.every(p => p.cerrada), 'todas cerradas (70 = 1)');
  cierto(r.polilineas.every(p => p.puntos.every(q => Number.isFinite(q.x) && Number.isFinite(q.y))), 'cada vértice con su X y su Y');
  igual(piezas[0].puntos, [{ x: 10, y: 10 }, { x: 25, y: 45 }, { x: 40, y: 10 }], 'la Y se voltea (50 − y): la punta de la «A» queda ARRIBA, sin espejo');
  const borde = r.polilineas.find(p => p.capa === 'CONTORNO-HOJA');
  igual(borde.puntos, [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 0 }, { x: 0, y: 0 }], 'el contorno de la hoja es su rectángulo exacto');
  const sinRepetir = pts => pts.every((p, i) => { const q = pts[(i + 1) % pts.length]; return p.x !== q.x || p.y !== q.y; });
  cierto(r.polilineas.every(p => sinRepetir(p.puntos)), 'ningún tramo de largo cero (ni el que cierra)');
}

console.log('\nVARIAS HOJAS, UNA DEBAJO DE OTRA');
{
  const { texto, contornos } = D.armar([
    { ancho: 100, alto: 50, contornos: [cuadrado(0, 0, 10)] },
    { ancho: 100, alto: 50, contornos: [cuadrado(0, 0, 10), cuadrado(50, 20, 5)] }
  ], { hueco: 25, contorno: true });
  const r = leer(texto);
  igual(contornos, 3, 'tres contornos de pieza');
  igual(r.header.$EXTMAX, [['10', '100'], ['20', '125'], ['30', '0']], 'alto total: 50 + 25 + 50');
  igual(r.capas.map(c => c.nombre), ['HOJA-1', 'HOJA-2', 'CONTORNO-HOJA'], 'una capa por hoja, como el SVG');
  const h1 = r.polilineas.filter(p => p.capa === 'HOJA-1'), h2 = r.polilineas.filter(p => p.capa === 'HOJA-2');
  igual([h1.length, h2.length], [1, 2], 'cada pieza en la capa de su hoja');
  igual(h1[0].puntos[0], { x: 0, y: 125 }, 'la esquina de arriba de la hoja 1 es la de arriba del dibujo');
  igual(h2[0].puntos[0], { x: 0, y: 50 }, 'la hoja 2 empieza 75 mm más abajo (50 de la hoja + 25 de hueco)');
  igual(r.polilineas.filter(p => p.capa === 'CONTORNO-HOJA').length, 2, 'un contorno por hoja');
}

console.log('\nSIN EL CONTORNO DE LA HOJA');
{
  const { texto } = D.armar([{ ancho: 100, alto: 50, contornos: [cuadrado(0, 0, 10)] }], { hueco: 25, contorno: false });
  const r = leer(texto);
  igual(r.capas.map(c => c.nombre), ['HOJA-1'], 'sin la capa del contorno');
  igual(r.polilineas.length, 1, 'y sin su rectángulo: solo la pieza');
}

console.log('\nNÚMEROS QUE LA MÁQUINA LEE');
{
  const { texto } = D.armar([{ ancho: 1200, alto: 2400, contornos: [[{ x: 1e-9, y: 0.12345678 }, { x: 1199.99999, y: 2399.5 }, { x: 600.00004, y: 2400 }]] }], { contorno: false });
  const r = leer(texto);
  const valores = r.pares.filter(([c]) => c === '10' || c === '20').map(([, v]) => v);
  cierto(valores.every(v => !/e/i.test(v)), 'sin notación científica', valores);
  cierto(valores.every(v => v !== '-0'), 'sin «-0»');
  cierto(valores.every(v => !/\.\d{5,}/.test(v)), 'a lo más cuatro decimales (una diezmilésima de mm)', valores);
  igual(r.polilineas[0].puntos, [{ x: 0, y: 2399.8765 }, { x: 1200, y: 0.5 }, { x: 600, y: 0 }], 'redondeado a la diezmilésima');
}

console.log('\nUN CONTORNO QUE NO ENCIERRA NADA NO SE ESCRIBE');
{
  const { texto, contornos } = D.armar([{ ancho: 100, alto: 50, contornos: [[{ x: 0, y: 0 }, { x: 5, y: 5 }], cuadrado(1, 1, 3)] }], { contorno: false });
  igual(contornos, 1, 'solo el que encierra algo');
  igual(leer(texto).polilineas.length, 1, 'y en el archivo, una polilínea');
}

console.log('');
if (fallos) { console.log(fallos + ' fallo(s).'); process.exit(1); }
console.log('Todo bien.');
