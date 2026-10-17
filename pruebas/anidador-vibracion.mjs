/* Cortes rectos muy juntos: donde el router vibra.
 *
 * El taller (audio del 16/10/2026): «entre línea y línea debe de haber un restante de aluminio
 * que no se corte, porque eso da la rigidez para que no vibre la máquina; no puedo poner dos L a
 * la par». La mesa de corte marca esos lugares para que solo se muevan esas piezas. Si la cuenta
 * se equivoca hacia un lado, marca media mesa y nadie le hace caso; hacia el otro, una tira de
 * 1 mm sale volando con la broca puesta. Ninguna de las dos se ve leyendo el código.
 *
 * Uso: node pruebas/anidador-vibracion.mjs   (o pruebas/correr.sh, que corre todas)
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = createRequire(import.meta.url)(join(RAIZ, 'anidador-vectores/js/vibracion.js'));

let fallos = 0;
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, que, extra) => (c ? bien(que) : mal(que, extra));
const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/* Una «L» de 200 de alto y 120 de ancho, con el palo de 40 y el pie abajo (y hacia abajo, como en
   SVG): su orilla izquierda es una recta de 200 mm y la punta del pie, una de 40 (de y 160 a 200). */
const L = (x, y) => [[{ x, y }, { x: x + 40, y }, { x: x + 40, y: y + 160 }, { x: x + 120, y: y + 160 }, { x: x + 120, y: y + 200 }, { x, y: y + 200 }]];
const rect = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const girar = (poli, grados, cx, cy) => { const a = grados * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return poli.map(p => ({ x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c })); };
const ROUTER = { broca: 3.175, minimo: 3, largoMin: 15, traslapeMin: 15, anguloMax: 5 };   // broca de 1/8″

console.log('\nLOS TRAMOS RECTOS DE UN CONTORNO');
{
  const t = V.tramosRectos(rect(0, 0, 100, 20), 15);
  cierto(t.length === 4, 'un rectángulo de 100 × 20: sus cuatro orillas miden 15 o más', t.length);
  cierto(V.tramosRectos(rect(0, 0, 100, 20), 30).length === 2, 'pidiendo 30 mm, solo las dos largas');
  /* La misma orilla partida en cinco nodos, y empezando a media recta. */
  const partida = [{ x: 50, y: 0 }, { x: 75, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 0, y: 20 }, { x: 0, y: 0 }, { x: 25, y: 0 }];
  const tp = V.tramosRectos(partida, 15);
  cierto(tp.length === 4 && tp.some(x => cerca(x.largo, 100)), 'una recta que el archivo partió en nodos (y que cruza el punto de inicio) es UN tramo de 100', tp.map(x => x.largo));
  /* Un círculo de radio 100 en 64 segmentos: cada uno gira 5.6°, ninguno es recta. */
  const circ = Array.from({ length: 64 }, (_, i) => ({ x: 100 * Math.cos(i * 2 * Math.PI / 64), y: 100 * Math.sin(i * 2 * Math.PI / 64) }));
  cierto(V.tramosRectos(circ, 15).length === 0, 'un círculo no tiene tramos rectos');
  /* Un cuarto de pastel de radio 300 con el arco en pasos de 1.5°: cada paso gira poco, pero juntos
     no son recta. Sus dos radios (300 mm) sí lo son. */
  const arco = Array.from({ length: 61 }, (_, i) => ({ x: 300 * Math.cos(i * 1.5 * Math.PI / 180), y: 300 * Math.sin(i * 1.5 * Math.PI / 180) }));
  const ta = V.tramosRectos([...arco, { x: 0, y: 0 }], 15);
  const radios = ta.filter(x => Math.abs(x.largo - 300) < 1e-6), delArco = ta.filter(x => Math.abs(x.largo - 300) >= 1e-6);
  cierto(radios.length === 2, 'los dos radios del pastel son tramos rectos de 300', ta.map(x => Math.round(x.largo)));
  cierto(delArco.every(x => x.largo < 25), 'y el arco no se junta en una «recta» larga: se compara contra la dirección inicial', delArco.map(x => Math.round(x.largo)));
}

console.log('\nDOS «L» A LA PAR (EL CASO DEL AUDIO)');
{
  /* Una junto a otra a la separación de la broca de 1/8″ (4.5 mm): la punta del pie de la primera
     (x = 120) queda frente al palo de la segunda (x = 124.5) a lo largo de 40 mm. Entre los dos
     cortes quedan 4.5 − 3.175 = 1.325 mm de material. */
  const r = V.buscar([{ id: 'p1', contornos: L(0, 0) }, { id: 'p2', contornos: L(124.5, 0) }], ROUTER);
  cierto(r.length === 1 && r[0].a === 'p1' && r[0].b === 'p2', 'las marca como UN par', r.map(x => [x.a, x.b]));
  cierto(r.length && cerca(r[0].material, 4.5 - 3.175, 1e-9), 'con 1.325 mm de material entre los dos cortes', r[0] && r[0].material);
  cierto(r.length && cerca(r[0].traslape, 40, 1e-9), 'a lo largo de los 40 mm que corren juntos', r[0] && r[0].traslape);
  const q = r.length ? r[0].marcas[0] : [];
  cierto(q.length === 4 && q.every(p => p.x >= 120 - 1e-9 && p.x <= 124.5 + 1e-9 && p.y >= 160 - 1e-9 && p.y <= 200 + 1e-9), 'la marca es la tira entre las dos orillas (x de 120 a 124.5, y de 160 a 200)', q);
  /* Dos palos (dos «I») a la par: la tira corre los 200 mm. */
  const ii = V.buscar([{ id: 'i1', contornos: [rect(0, 0, 40, 200)] }, { id: 'i2', contornos: [rect(44.5, 0, 40, 200)] }], ROUTER);
  cierto(ii.length === 1 && cerca(ii[0].traslape, 200, 1e-9), 'dos palos a la par: la tira delgada corre 200 mm', ii.map(x => x.traslape));
  const lejos = V.buscar([{ id: 'p1', contornos: L(0, 0) }, { id: 'p2', contornos: L(130, 0) }], ROUTER);
  cierto(lejos.length === 0, 'separadas 10 mm (6.8 de material) ya no: hay material de sobra', lejos.map(x => x.material));
  const conMas = V.buscar([{ id: 'p1', contornos: L(0, 0) }, { id: 'p2', contornos: L(130, 0) }], { ...ROUTER, minimo: 8 });
  cierto(conMas.length === 1, 'y con un mínimo de 8 mm, sí: el número es del taller');
}

console.log('\nLO QUE NO ES RIESGO');
{
  /* Una esquina frente a una orilla: no hay tira larga. */
  const esquina = V.buscar([{ id: 'a', contornos: [rect(0, 0, 100, 100)] }, { id: 'b', contornos: [girar(rect(104, 30, 60, 60), 45, 134, 60)] }], ROUTER);
  cierto(esquina.length === 0, 'la punta de un rombo junto a una orilla no se marca');
  /* Paralelas, pero corren juntas solo 10 mm. */
  const poco = V.buscar([{ id: 'a', contornos: [rect(0, 0, 100, 100)] }, { id: 'b', contornos: [rect(104.5, 90, 50, 50)] }], ROUTER);
  cierto(poco.length === 0, 'paralelas que se enfrentan solo 10 mm no se marcan (el mínimo es 15)');
  /* Una pieza girada 3° sigue siendo casi paralela; girada 12°, ya no. */
  const g3 = V.buscar([{ id: 'a', contornos: [rect(0, 0, 100, 200)] }, { id: 'b', contornos: [girar(rect(104.5, 0, 100, 200), 3, 104.5, 100)] }], ROUTER);
  cierto(g3.length === 1, 'girada 3°: casi paralela, se marca');
  const g12 = V.buscar([{ id: 'a', contornos: [rect(0, 0, 100, 200)] }, { id: 'b', contornos: [girar(rect(110, 0, 100, 200), 12, 110, 100)] }], ROUTER);
  cierto(g12.length === 0, 'girada 12°: la tira se abre en cuña y no se marca');
  /* Dentro de la misma pieza: la tira entre el hueco de una «O» cuadrada y su orilla es la letra. */
  const o = V.buscar([{ id: 'o', contornos: [rect(0, 0, 100, 100), rect(3, 3, 94, 94)] }], ROUTER);
  cierto(o.length === 0, 'el trazo delgado de una misma letra no se marca: no es desperdicio');
  /* Sin broca (láser): la misma tira con 2 mm de separación ya no es de router. */
  const laser = V.buscar([{ id: 'p1', contornos: L(0, 0) }, { id: 'p2', contornos: L(42, 0) }], { ...ROUTER, broca: 0, minimo: 0 });
  cierto(laser.length === 0, 'con mínimo 0 y sin broca no hay nada que marcar');
}

console.log('\nUNA PIEZA DENTRO DEL HUECO DE OTRA');
{
  /* Un punto cuadrado metido en el hueco de una «O»: la tira entre los dos también es material que
     queda entre dos cortes. */
  const r = V.buscar([{ id: 'o', contornos: [rect(0, 0, 200, 200), rect(30, 30, 140, 140)] }, { id: 'punto', contornos: [rect(34.5, 34.5, 60, 60)] }], ROUTER);
  cierto(r.length === 1 && cerca(r[0].material, 4.5 - 3.175, 1e-9), 'se marca, con su 1.325 mm', r.map(x => x.material));
  cierto(r[0].marcas.length === 2, 'en sus dos orillas pegadas al hueco (la de arriba y la de la izquierda)', r[0].marcas.length);
}

console.log('\nVARIOS PARES: EL PEOR PRIMERO');
{
  const r = V.buscar([
    { id: 'a', contornos: [rect(0, 0, 100, 100)] },
    { id: 'b', contornos: [rect(105, 0, 100, 100)] },     // 5 mm de a: 1.825 de material
    { id: 'c', contornos: [rect(209, 0, 100, 100)] }      // 4 mm de b: 0.825 de material
  ], ROUTER);
  cierto(r.length === 2 && r[0].a === 'b' && r[0].b === 'c' && r[1].a === 'a', 'dos pares, el más delgado primero', r.map(x => [x.a, x.b, Math.round(x.material * 1000) / 1000]));
  cierto(V.buscar([], ROUTER).length === 0 && V.buscar(null, ROUTER).length === 0, 'sin piezas, nada');
}

console.log('');
if (fallos) { console.log(fallos + ' fallo(s).'); process.exit(1); }
console.log('Todo bien.');
