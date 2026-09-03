/* Las unidades del anidador: lo que no se puede revisar mirando.
 *
 * El motor de anidamiento acomoda números y no sabe si son milímetros o píxeles. Con un
 * archivo que dice `width="300mm" viewBox="0 0 1200 400"`, para el motor la pieza mide 1200 y
 * en una lámina de 1220 «cabe justo una» — cuando mide 300 mm y caben cuatro. El resultado
 * sale plausible, se ve bien en pantalla y se descubre en la máquina, con la lámina cortada.
 *
 * Por eso la aritmética vive en anidador-vectores/js/medidas.js, pura y sin DOM, y se prueba
 * aquí con node y nada más: cada unidad del SVG, el viewBox que falta, el px que NO es una
 * medida, la medida tecleada a mano y el «¿cabe girada?».
 *
 * Uso: node pruebas/anidador-medidas.mjs   (o pruebas/correr.sh, que corre todas)
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const M = createRequire(import.meta.url)(join(RAIZ, 'anidador-vectores/js/medidas.js'));

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const es = (a, b, que) => (Math.abs(a - b) < 1e-9 ? bien(que + ' → ' + b) : mal(que + ': esperaba ' + b + ' y salió ' + a));
const igual = (a, b, que) => (JSON.stringify(a) === JSON.stringify(b) ? bien(que) : mal(que + ': esperaba ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)));

console.log('\nLEER UNA LONGITUD');
igual(M.leerLongitud('300mm'), { valor: 300, unidad: 'mm' }, '«300mm»');
igual(M.leerLongitud(' 12.5 cm '), { valor: 12.5, unidad: 'cm' }, '«12.5 cm» con espacios');
igual(M.leerLongitud('595.28px'), { valor: 595.28, unidad: 'px' }, '«595.28px»');
igual(M.leerLongitud('400'), { valor: 400, unidad: '' }, '«400» sin unidad');
igual(M.leerLongitud('1e3'), { valor: 1000, unidad: '' }, '«1e3» en notación científica');
igual(M.leerLongitud('100%'), null, '«100%» no es una medida');
igual(M.leerLongitud('0'), null, '«0» no mide nada');
igual(M.leerLongitud('auto'), null, '«auto» no es un número');
igual(M.leerLongitud(null), null, 'sin atributo');

console.log('\nLEER UN VIEWBOX');
igual(M.leerViewBox('0 0 1200 400'), { x: 0, y: 0, w: 1200, h: 400 }, 'con espacios');
igual(M.leerViewBox('0,0,1200,400'), { x: 0, y: 0, w: 1200, h: 400 }, 'con comas');
igual(M.leerViewBox('-10 -5 20 10'), { x: -10, y: -5, w: 20, h: 10 }, 'con origen negativo');
igual(M.leerViewBox('0 0 1200'), null, 'con tres números no vale');
igual(M.leerViewBox('0 0 0 400'), null, 'con ancho cero no vale');
igual(M.leerViewBox(''), null, 'vacío');

console.log('\nLA ESCALA QUE DECLARA EL ARCHIVO');
let e = M.escalaDelArchivo({ width: '300mm', height: '100mm', viewBox: '0 0 1200 400' });
es(e.mmPorUnidad, 0.25, 'width=300mm con viewBox de 1200 → 0.25 mm por unidad');
igual(e.origen, 'archivo', 'y la escala sale del archivo');
es(e.anchoMm, 300, 'el lienzo mide 300 mm de ancho');
es(e.altoMm, 100, 'y 100 de alto');
igual(e.noUniforme, false, 'ancho y alto cuadran entre sí');

e = M.escalaDelArchivo({ width: '12.3cm', height: '4.1cm', viewBox: '0 0 1230 410' });
es(e.mmPorUnidad, 0.1, 'el SVG del vectorizador (cm con viewBox en píxeles) → 0.1 mm por unidad');
igual(e.unidad, 'cm', 'y dice que venía en cm');

e = M.escalaDelArchivo({ width: '8.5in', height: '11in', viewBox: '0 0 612 792' });
es(e.mmPorUnidad, 215.9 / 612, 'una carta en pulgadas a 72 por pulgada');

e = M.escalaDelArchivo({ width: '200mm', height: '100mm', viewBox: null });
igual(e.viewBox, { x: 0, y: 0, w: 200, h: 100 }, 'sin viewBox, el lienzo son los números del width/height');
es(e.mmPorUnidad, 1, 'y en mm cada unidad es un milímetro');

e = M.escalaDelArchivo({ width: '20cm', height: '10cm', viewBox: null });
es(e.mmPorUnidad, 10, 'sin viewBox y en cm, cada unidad son 10 mm');

e = M.escalaDelArchivo({ width: null, height: '50mm', viewBox: '0 0 400 200' });
es(e.mmPorUnidad, 0.25, 'si solo el alto trae unidad, se usa el alto');

e = M.escalaDelArchivo({ width: '300mm', height: '100mm', viewBox: '0 0 1200 800' });
es(e.mmPorUnidad, 0.25, 'con alto y ancho que no cuadran manda el ancho');
igual(e.noUniforme, true, 'y se avisa que no cuadran');

console.log('\nLO QUE NO ES UNA MEDIDA: PX Y NADA');
e = M.escalaDelArchivo({ width: '400px', height: '200px', viewBox: '0 0 400 200' });
igual(e.mmPorUnidad, null, 'px no da escala: Illustrator escribe px a 72 por pulgada y el estándar dice 96');
igual(e.origen, 'falta', 'así que la medida falta y se pide');
igual(e.unidad, 'px', 'diciendo que venía en px');
igual(e.viewBox, { x: 0, y: 0, w: 400, h: 200 }, 'pero el lienzo sí se conoce');

e = M.escalaDelArchivo({ width: '400', height: '200', viewBox: '0 0 400 200' });
igual(e.origen, 'falta', 'sin unidad tampoco se adivina (el SVG del vectorizador sin medida real)');
igual(e.unidad, '', 'y se dice que no declaraba ninguna');

e = M.escalaDelArchivo({ width: null, height: null, viewBox: '0 0 400 200' });
igual(e.origen, 'falta', 'solo viewBox: falta');
igual(e.viewBox, { x: 0, y: 0, w: 400, h: 200 }, 'con el lienzo del viewBox');

e = M.escalaDelArchivo({});
igual(e.viewBox, null, 'sin nada, no hay lienzo');
igual(e.origen, 'falta', 'y falta todo');

console.log('\nLA MEDIDA TECLEADA A MANO');
const bbox = { x: 10, y: 10, w: 330, h: 180 };
es(M.escalaPorDiseno(bbox, 660, null), 2, 'el diseño mide 660 mm de ancho y la tinta 330 → 2 mm por unidad');
es(M.escalaPorDiseno(bbox, null, 90), 0.5, 'o 90 mm de alto con tinta de 180 → 0.5');
es(M.escalaPorDiseno(bbox, 660, 90), 2, 'con los dos, manda el ancho');
igual(M.escalaPorDiseno(bbox, 0, 0), null, 'con ceros no hay escala');
igual(M.escalaPorDiseno(null, 660, null), null, 'sin tinta que medir tampoco');

console.log('\n¿CABE EN LA LÁMINA?');
const lam = { ancho: 1220, alto: 2440 };
igual(M.cabe({ w: 1000, h: 500 }, lam, 1), true, '1000 × 500 cabe derecha');
igual(M.cabe({ w: 1300, h: 500 }, lam, 1), false, '1300 × 500 no cabe sin girar (1300 > 1220)');
igual(M.cabe({ w: 1300, h: 500 }, lam, 2), false, 'ni con giro de 180°, que no cambia nada');
igual(M.cabe({ w: 1300, h: 500 }, lam, 4), true, 'pero girada 90° sí');
igual(M.cabe({ w: 1300, h: 1300 }, lam, 4), false, '1300 × 1300 no cabe de ninguna manera');
igual(M.cabe({ w: 1220, h: 2440 }, lam, 1), true, 'la lámina entera cabe justa');
igual(M.cabe({ w: 1220.0000001, h: 2440 }, lam, 1), true, 'y una décima de micra de más no la echa fuera');

console.log('\nCÓMO SE ESCRIBEN');
/* Los espacios son NO SEPARABLES (U+00A0) a propósito, los dos: el de millar para que «1 220» no
   se parta a fin de renglón, y el de la unidad para que «mm» no se quede solo en el siguiente. */
igual(M.formatoMm(1220), '1\u00A0220\u00A0mm', '1 220 mm con espacio de millar no separable');
igual(M.formatoMm(12.34), '12.3\u00A0mm', 'un decimal debajo de 100');
igual(M.formatoMm(99.96), '100\u00A0mm', 'y se redondea al pasar');
igual(M.formatoMm(2440.4), '2\u00A0440\u00A0mm', 'entero de 100 para arriba');
igual(M.formatoMm(NaN), '—', 'lo que no es número es una raya');
igual(M.formatoPct(0.634), '63\u00A0%', '63 % de aprovechamiento');
igual(M.formatoPct(1), '100\u00A0%', 'el cien');
igual(M.formatoPct(undefined), '—', 'y sin dato, raya');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nLas unidades del anidador cuadran.');
process.exit(fallos ? 1 : 0);
