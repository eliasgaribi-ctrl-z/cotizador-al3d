/* Contornos (anidador-vectores/js/contornos.js): juntar líneas sueltas y quitar lo que no se corta.
 *
 * Es lo que el equipo hacía a mano con «Reparar problema», y un error aquí sale en la máquina:
 * una letra que se corta dos veces (repetida), una letra que se corta entera y además en sus
 * mitades (el contorno de guía del archivo de AVIDA), una tira de 2 mm (línea doble), o una «C»
 * que el motor cerraba con una recta. Se prueba con figuras armadas a mano.
 *
 * Uso: node pruebas/anidador-contornos.mjs   (o pruebas/correr.sh, que corre todas)
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const K = createRequire(import.meta.url)(join(RAIZ, 'anidador-vectores/js/contornos.js'));

let fallos = 0;
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, que, extra) => (c ? bien(que) : mal(que, extra));

const P = (...xy) => { const o = []; for (let i = 0; i < xy.length; i += 2) o.push({ x: xy[i], y: xy[i + 1] }); return o; };
const rect = (x, y, w, h) => P(x, y, x + w, y, x + w, y + h, x, y + h);
const arco = (cx, cy, r, a0, a1, n = 16) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + (a1 - a0) * k / n; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; });

console.log('\nUNIR: LÍNEAS SUELTAS EN CONTORNOS CERRADOS');
{
  /* Un cuadrado de 4 LINE con huecos de dibujo crecientes (0, 0.004, 0.3 mm), de ida y de vuelta. */
  const t = [
    { puntos: P(0, 0, 100, 0) }, { puntos: P(100.004, 0, 100, 100) },
    { puntos: P(0.3, 100, 100, 100) },   // al revés y con 0.3 mm de hueco
    { puntos: P(0, 100, 0, 0) }
  ];
  const u = K.unir(t);
  cierto(u.cerrados.length === 1 && !u.abiertos.length, 'cuatro LINE con huecos de hasta 0.3 mm: un contorno cerrado', [u.cerrados.length, u.abiertos.length]);
  cierto(Math.abs(Math.abs(K.area(u.cerrados[0].puntos)) - 10000) < 20 && u.cerrados[0].trazos === 4, 'de 100 × 100 y con sus cuatro tramos', [K.area(u.cerrados[0].puntos), u.cerrados[0].trazos]);
}
{
  /* Una «C»: dos arcos y dos rectas, revueltos. */
  const t = [{ puntos: arco(0, 0, 50, 0.5, 2 * Math.PI - 0.5) }, { puntos: arco(0, 0, 30, 2 * Math.PI - 0.5, 0.5) },
    { puntos: [arco(0, 0, 50, 0.5, 0.5, 1)[0], arco(0, 0, 30, 0.5, 0.5, 1)[0]] }, { puntos: [arco(0, 0, 30, -0.5, -0.5, 1)[0], arco(0, 0, 50, -0.5, -0.5, 1)[0]] }];
  const u = K.unir(t);
  cierto(u.cerrados.length === 1 && !u.abiertos.length, 'una «C» de dos arcos y dos rectas sueltas: un contorno', [u.cerrados.length, u.abiertos.length]);
}
{
  /* Tramos repetidos y rectos encimados no se juntan entre sí. */
  const t = [{ puntos: P(0, 0, 60, 0) }, { puntos: P(40, 0, 100, 0) },   // encimados: [0,60] y [40,100]
    { puntos: P(100, 0, 100, 50, 0, 50) }, { puntos: P(0, 50, 0, 0) }, { puntos: P(0, 50, 0, 0) }];   // el último, repetido
  const u = K.unir(t);
  cierto(u.cerrados.length === 1 && !u.abiertos.length && u.encimados + u.repetidos === 2, 'dos rectas encimadas se funden en una, y el tramo repetido no estorba (los dos se cuentan para el aviso)', [u.cerrados.length, u.abiertos.length, u.encimados, u.repetidos]);
  cierto(Math.abs(Math.abs(K.area(u.cerrados[0].puntos)) - 5000) < 1, 'el contorno queda de 100 × 50', K.area(u.cerrados[0].puntos));
}
{
  const u = K.unir([{ puntos: P(0, 0, 10, 0, 10, 10) }, { puntos: P(50, 50, 60, 60) }]);
  cierto(!u.cerrados.length && u.abiertos.length === 2, 'lo que no cierra con nada se devuelve aparte (para avisarlo), no se pierde', [u.cerrados.length, u.abiertos.length]);
  cierto(K.unir([{ puntos: P(0, 0, 10, 0, 10, 10), cerrado: true }]).cerrados.length === 1, 'lo que ya viene cerrado pasa tal cual');
}

console.log('\nLIMPIAR: REPETIDOS, CONTORNO DE GUÍA Y LÍNEA DOBLE');
{
  /* Una «D» de guía: su contorno entero (con su ojo) y sus dos mitades, una que se sale 1 mm. Una
     letra repetida. Una «O» de verdad (hueco a 20 mm de la orilla). Una línea doble a 2 mm. */
  const D = rect(0, 0, 200, 300), ojo = rect(60, 60, 80, 180);
  const mitadA = P(0, 0, 100, 0, 100, 300, 0, 300), mitadB = P(100, 0, 201, 0, 201, 300, 100, 300);
  const O = rect(400, 0, 200, 300), hueco = rect(420, 20, 160, 260);
  const letra = rect(700, 0, 100, 100), copia = P(800, 100, 700, 100, 700, 0, 800, 0);
  const doble = rect(898, -2, 104, 104), adentro = rect(900, 0, 100, 100);
  const c = [D, ojo, mitadA, mitadB, O, hueco, letra, copia, doble, adentro, P(0, 400, 50, 400, 25, 400)].map((p, i) => ({ id: i, puntos: p }));
  const r = K.limpiar(c);
  cierto(r.modo === 'contorno', 'de omisión se corta el contorno completo (Elías, 17/10/2026: «tiene que ser el contorno»)', r.modo);
  cierto(r.repetidos.length === 1 && r.repetidos[0] === 7, 'la letra repetida (al revés y desde otra esquina) sale una vez', r.repetidos);
  cierto(r.guias.length === 1 && r.guias[0].id === 0 && r.guias[0].partes.join() === '2,3' && r.guias[0].huecos.join() === '1', 'la «D» de guía: su contorno, su ojo y sus dos mitades (aunque una se salga 1 mm)', r.guias);
  const rp = K.limpiar(c, { modo: 'partes' });
  cierto(rp.modo === 'partes' && rp.guias.length === 1 && rp.guias[0].partes.join() === '2,3' && rp.guias[0].huecos.join() === '1', 'con modo «partes», la misma guía (ahí se quita el contorno con su ojo)', rp.guias);
  cierto(r.dobles.length === 1 && r.dobles[0].id === 8 && r.dobles[0].dentro === 9 && r.dobles[0].mm === 2, 'la línea doble a 2 mm: se quita la de fuera', r.dobles);
  cierto(r.sinArea.length === 1 && r.sinArea[0] === 10, 'lo que no tiene área sale', r.sinArea);
  const quitados = new Set([...r.repetidos, ...r.sinArea, ...r.dobles.map(d => d.id), ...r.guias.flatMap(g => g.partes)]);
  cierto(!quitados.has(4) && !quitados.has(5), 'la «O» con su hueco de verdad no se toca');
  cierto(!quitados.has(0) && !quitados.has(1) && quitados.has(2) && quitados.has(3), 'con «contorno» se quitan las mitades y quedan la «D» entera y su ojo');
}
{
  /* La «i» de Primaria: el punto y el palo traen UNA tira dentro cada uno (24 de 36 mm). Con
     «contorno» basta una parte; con «partes» hacen falta dos (una sola no dice que sea guía). */
  const palo = rect(0, 0, 36, 220), tira = rect(0, 0, 24, 220);
  const c = [palo, tira].map((p, i) => ({ id: i, puntos: p }));
  cierto(K.limpiar(c).guias.map(g => g.id + ':' + g.partes.join()).join() === '0:1', 'la «i» con una sola tira: se corta la «i» entera y la tira se quita');
  cierto(!K.limpiar(c, { modo: 'partes' }).guias.length, 'con «partes», una tira sola no hace guía');
}
{
  /* La primera «A» de AVIDA: una mitad viene dos veces, la de fuera 3 mm más grande y saliéndose
     del contorno de la letra. Con «contorno» la de dentro es parte y la de fuera, su línea doble:
     las dos se van y la letra queda entera. */
  const A = rect(0, 0, 200, 300), m1 = rect(0, 0, 200, 150), m2 = rect(0, 150, 200, 150), m2f = rect(-2, 148, 204, 154);
  const r = K.limpiar([A, m1, m2, m2f].map((p, i) => ({ id: i, puntos: p })));
  const fuera = new Set([...r.guias.flatMap(g => g.partes), ...r.dobles.map(d => d.id)]);
  cierto(!fuera.has(0) && fuera.has(1) && fuera.has(2) && fuera.has(3), 'la mitad repetida a 2 mm también se va: queda solo la letra entera', [r.guias, r.dobles]);
}
{
  /* Un «8» de dos huecos (suman más del 60 %) NO es un contorno de guía: sus huecos no tocan la orilla. */
  const ocho = rect(0, 0, 100, 200), h1 = rect(10, 10, 80, 85), h2 = rect(10, 105, 80, 85);
  const r = K.limpiar([ocho, h1, h2].map((p, i) => ({ id: i, puntos: p })));
  cierto(!r.guias.length && !r.dobles.length, 'un «8» con dos huecos grandes sigue siendo un «8»', r);
}

console.log('\nPIEZAS: HUECO ES LO QUE QUEDA ESTRICTAMENTE DENTRO');
{
  const O = rect(0, 0, 100, 100), hueco = rect(20, 20, 60, 60), isla = rect(40, 40, 20, 20);
  const mitad = P(0, 0, 50, 0, 50, 100, 0, 100);   // toca la orilla de O: es otra pieza
  const pz = K.piezas([O, hueco, isla, mitad].map((p, i) => ({ id: i, puntos: p })));
  const de = id => pz.find(x => x.id === id);
  cierto(de(0) && de(0).huecos.map(h => h.id).join() === '1', 'la «O» lleva su hueco', pz.map(x => [x.id, x.huecos.map(h => h.id)]));
  cierto(!!de(2) && !!de(3), 'lo que está dentro del hueco es otra pieza, y lo que toca la orilla también');
}

console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
