/* Abrir un DXF en la mesa (anidador-vectores/js/dxf-entrada.js), y el retazo útil (js/sobrante.js).
 *
 * El DXF se arma aquí a mano, entidad por entidad, con lo que mandan AutoCAD y Corel: LINE sueltas
 * que forman una letra, una polilínea con bulge (tramos curvos), CIRCLE, ARC, ELLIPSE, SPLINE
 * (NURBS), un bloque insertado girado y escalado, un texto que no se corta, y las unidades en
 * $INSUNITS. Se revisan las medidas que salen: un DXF en centímetros leído como milímetros sale
 * diez veces más chico y nadie lo nota hasta la máquina.
 *
 * Uso: node pruebas/anidador-dxf-entrada.mjs   (o pruebas/correr.sh, que corre todas)
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const D = req(join(RAIZ, 'anidador-vectores/js/dxf-entrada.js'));
const K = req(join(RAIZ, 'anidador-vectores/js/contornos.js'));
const S = req(join(RAIZ, 'anidador-vectores/js/sobrante.js'));

let fallos = 0;
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, que, extra) => (c ? bien(que) : mal(que, extra));
const cerca = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
/* Áreas: las curvas se enderezan a 0.05 mm (cuerdas por dentro), así que el área queda apenas abajo. */
const areaCerca = (a, b) => a <= b + 0.01 && a >= b * 0.995;

/* ---------- Un DXF de texto, pares código/valor ---------- */
const g = (...pares) => pares.join('\r\n');
const linea = (x1, y1, x2, y2) => g(0, 'LINE', 8, 'Corte', 10, x1, 20, y1, 11, x2, 21, y2);
function dxf(insunits, entidades, bloques = '') {
  const h = insunits === null ? '' : g(9, '$INSUNITS', 70, insunits);
  return g(0, 'SECTION', 2, 'HEADER', h, 0, 'ENDSEC', 0, 'SECTION', 2, 'BLOCKS', bloques, 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES', entidades, 0, 'ENDSEC', 0, 'EOF').replace(/\r\n\r\n/g, '\r\n') + '\r\n';
}
const caja = P => K.caja(P);

console.log('\nUNIDADES Y LÍNEAS SUELTAS');
{
  /* Una «L» de seis LINE en centímetros, con un hueco de dibujo de 0.01 cm (0.1 mm) en una esquina. */
  const L = [linea(0, 0, 10, 0), linea(10, 0, 10, 2), linea(10, 2, 2.01, 2), linea(2, 2, 2, 15), linea(2, 15, 0, 15), linea(0, 15, 0, 0)].join('\r\n');
  const r = D.leer(dxf(5, L));
  cierto(r.unidad === 'centímetros' && r.mmPorUnidad === 10 && !r.avisos.length, 'lee $INSUNITS = 5: centímetros, sin avisos', [r.unidad, r.avisos]);
  const u = K.unir(r.trazos);
  cierto(u.cerrados.length === 1 && !u.abiertos.length, 'las seis LINE de la «L» se juntan en un contorno', [u.cerrados.length, u.abiertos.length]);
  const b = caja(u.cerrados[0].puntos);
  cierto(cerca(b.x1 - b.x0, 100) && cerca(b.y1 - b.y0, 150), 'y mide 100 × 150 mm (10 × 15 cm)', [b.x1 - b.x0, b.y1 - b.y0]);
  const r2 = D.leer(dxf(null, L));
  cierto(r2.mmPorUnidad === 1 && r2.avisos.length === 1 && /no dice en qué unidades/.test(r2.avisos[0]), 'sin $INSUNITS se lee en mm y se avisa', r2.avisos);
  cierto(D.esDxf(dxf(4, L)) && !D.esDxf('<svg/>'), 'esDxf() reconoce un DXF y no un SVG');
}

console.log('\nCURVAS: BULGE, CÍRCULO, ARCO, ELIPSE Y SPLINE');
{
  /* Una ranura: LWPOLYLINE cerrada de 4 vértices con bulge 1 en los extremos (medias vueltas). */
  const ranura = g(0, 'LWPOLYLINE', 8, '0', 90, 4, 70, 1, 10, 0, 20, 0, 10, 100, 20, 0, 42, 1, 10, 100, 20, 40, 10, 0, 20, 40, 42, 1);
  const circulo = g(0, 'CIRCLE', 8, '0', 10, 300, 20, 20, 40, 25);
  /* Media luna: un ARC y una LINE que lo cierra. */
  const arc = g(0, 'ARC', 8, '0', 10, 500, 20, 0, 40, 30, 50, 0, 51, 180), cuerda = linea(470, 0, 530, 0);
  const elipse = g(0, 'ELLIPSE', 8, '0', 10, 700, 20, 0, 11, 50, 21, 0, 40, 0.4, 41, 0, 42, 2 * Math.PI);
  /* Una SPLINE cerrada de grado 1 (un cuadrado de 20) y otra de grado 2 con pesos (un cuarto de círculo exacto + rectas). */
  const sp1 = g(0, 'SPLINE', 8, '0', 70, 1, 71, 1, 72, 7, 73, 5, ...[0, 0, 1, 2, 3, 4, 4].flatMap(k => [40, k]), ...[[900, 0], [920, 0], [920, 20], [900, 20], [900, 0]].flatMap(p => [10, p[0], 20, p[1]]));
  const w = Math.SQRT1_2;
  const sp2 = g(0, 'SPLINE', 8, '0', 70, 4, 71, 2, 72, 6, 73, 3, ...[0, 0, 0, 1, 1, 1].flatMap(k => [40, k]), ...[1, w, 1].flatMap(v => [41, v]), ...[[1100, 0], [1100, 50], [1050, 50]].flatMap(p => [10, p[0], 20, p[1]]));
  const cierreSp2 = linea(1050, 50, 1050, 0) + '\r\n' + linea(1050, 0, 1100, 0);
  const texto = g(0, 'TEXT', 8, '0', 10, 0, 20, 0, 40, 5, 1, 'AL3D');
  const r = D.leer(dxf(4, [ranura, circulo, arc, cuerda, elipse, sp1, sp2, cierreSp2, texto].join('\r\n')));
  cierto(/1 textos/.test(r.avisos.join()), 'el texto no se corta: se cuenta y se avisa', r.avisos);
  const u = K.unir(r.trazos), cs = u.cerrados.map(c => ({ c, b: caja(c.puntos), a: Math.abs(K.area(c.puntos)) }));
  cierto(u.cerrados.length === 6 && !u.abiertos.length, 'seis figuras cerradas, nada suelto', [u.cerrados.length, u.abiertos.length]);
  const en = x => cs.find(z => z.b.x0 <= x && z.b.x1 >= x);
  const ra = en(50);
  cierto(ra && cerca(ra.b.x0, -20, 0.1) && cerca(ra.b.x1, 120, 0.1) && cerca(ra.b.y1 - ra.b.y0, 40, 0.1), 'la ranura con bulge: sus extremos son medias vueltas de radio 20', ra && ra.b);
  cierto(ra && areaCerca(ra.a, 100 * 40 + Math.PI * 400), 'y su área es la de la ranura (rectángulo + círculo)', ra && ra.a);
  const ci = en(300);
  cierto(ci && areaCerca(ci.a, Math.PI * 625), 'el círculo de radio 25, a 0.05 mm', ci && ci.a);
  const ml = en(500);
  cierto(ml && areaCerca(ml.a, Math.PI * 900 / 2) && cerca(ml.b.y1, 30, 0.05), 'el ARC con su cuerda: media luna de radio 30 hacia arriba', ml && [ml.a, ml.b]);
  const el = en(700);
  cierto(el && areaCerca(el.a, Math.PI * 50 * 20) && cerca(el.b.y1 - el.b.y0, 40, 0.1), 'la elipse de 100 × 40', el && [el.a, el.b]);
  const s1 = en(910);
  cierto(s1 && cerca(s1.a, 400, 0.01), 'la SPLINE de grado 1: el cuadrado de 20', s1 && s1.a);
  const s2 = en(1075);
  cierto(s2 && cerca(s2.a, 2500 - (2500 - Math.PI * 2500 / 4), 1), 'la SPLINE racional (pesos): un cuarto de círculo exacto', s2 && s2.a);
}

console.log('\nBLOQUES Y EXTRUSIÓN AL REVÉS');
{
  /* Un bloque «cuadro» de 10 × 10 con base en (5,5), insertado en (100,100) al doble y girado 90°. */
  const bloque = g(0, 'BLOCK', 8, '0', 2, 'cuadro', 70, 0, 10, 5, 20, 5, 0, 'LWPOLYLINE', 8, '0', 90, 4, 70, 1, 10, 0, 20, 0, 10, 10, 20, 0, 10, 10, 20, 10, 10, 0, 20, 10, 0, 'ENDBLK', 8, '0');
  const ins = g(0, 'INSERT', 8, '0', 2, 'cuadro', 10, 100, 20, 100, 41, 2, 42, 2, 50, 90);
  /* Un círculo con extrusión (0,0,−1): su centro en x = −50 del dibujo. */
  const espejo = g(0, 'CIRCLE', 8, '0', 10, 50, 20, 0, 40, 5, 210, 0, 220, 0, 230, -1);
  const r = D.leer(dxf(4, [ins, espejo].join('\r\n'), bloque));
  const u = K.unir(r.trazos), b = u.cerrados.map(c => caja(c.puntos));
  const cuadro = b.find(x => x.x0 > 0), circ = b.find(x => x.x1 < 0);
  /* (0,0)−base = (−5,−5) ×2 = (−10,−10), girado 90° = (10,−10), + (100,100) = (110, 90); la caja va de 90 a 110. */
  cierto(cuadro && cerca(cuadro.x0, 90) && cerca(cuadro.x1, 110) && cerca(cuadro.y0, 90) && cerca(cuadro.y1, 110), 'el bloque insertado: en su lugar, al doble y girado', cuadro);
  cierto(circ && cerca((circ.x0 + circ.x1) / 2, -50, 0.1), 'la extrusión al revés voltea la X, como en el CAD', circ);
}

console.log('\nEL SVG QUE ENTRA A LA MESA');
{
  const u = { cerrados: [{ puntos: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }] }, { puntos: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }] }],
    abiertos: [{ puntos: [{ x: 0, y: 60 }, { x: 50, y: 60 }] }] };
  const svg = D.aSvg(u.cerrados, u.abiertos, [[0, 1]]);
  cierto(/width="100mm" height="60mm" viewBox="0 0 100 60"/.test(svg), 'en milímetros, con su caja', svg.slice(0, 120));
  cierto(/fill-rule="evenodd" d="M0 60L100 60L100 10L0 10ZM10 50L20 50L20 40L10 40Z"/.test(svg), 'la pieza y su hueco en un trazo compuesto, con la Y hacia abajo', svg);
  cierto(/class="an-suelta" fill="none" d="M0 0L50 0"/.test(svg), 'lo que no cerró va abierto y marcado (no va al motor)');
}

console.log('\nEL RETAZO ÚTIL (js/sobrante.js)');
{
  const vacio = S.mayorRectangulo({ w: 1200, h: 2400 }, [], { margen: 3 });
  cierto(vacio && vacio.w === 1200 && vacio.h === 2400, 'una hoja vacía es toda retazo', vacio);
  /* Piezas en la franja de arriba (hasta y = 500): queda 1200 × (2400 − 500 − 6). */
  const arriba = [[{ x: 3, y: 3 }, { x: 1197, y: 3 }, { x: 1197, y: 500 }, { x: 3, y: 500 }]];
  const r = S.mayorRectangulo({ w: 1200, h: 2400 }, arriba, { margen: 6 });
  cierto(r && r.w === 1200 && r.y >= 506 && r.h <= 1894 && r.h > 1880, 'piezas arriba: el retazo es todo el ancho, debajo, a la separación', r);
  /* Una pieza en medio parte la hoja: el más grande es la mitad de abajo o de arriba, nunca encima de ella. */
  const medio = [[{ x: 500, y: 1100 }, { x: 700, y: 1100 }, { x: 700, y: 1300 }, { x: 500, y: 1300 }]];
  const m = S.mayorRectangulo({ w: 1200, h: 2400 }, medio, { margen: 3 });
  const pisa = !(m.x + m.w <= 497 || m.x >= 703 || m.y + m.h <= 1097 || m.y >= 1303);
  cierto(m && !pisa && m.w * m.h >= 1200 * 1090, 'una pieza en medio: el rectángulo no la pisa y es el más grande', m);
  /* Una pieza triangular: lo de junto a la diagonal sí es libre (no solo la caja). */
  const tri = [[{ x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 0, y: 2400 }]];
  const t = S.mayorRectangulo({ w: 1200, h: 2400 }, tri, { margen: 0 });
  cierto(t && t.w * t.h > 0.2 * 1200 * 2400 && t.x + t.w === 1200, 'un triángulo: el retazo es el rectángulo bajo la diagonal, no cero', t);
  cierto(S.texto({ w: 1200, h: 1557 }) === '1.20 × 1.55 m' && S.texto({ w: 455, h: 300 }) === '45 × 30 cm', 'se dice en m (o en cm si es chico), redondeado hacia abajo', [S.texto({ w: 1200, h: 1557 }), S.texto({ w: 455, h: 300 })]);
}

console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
