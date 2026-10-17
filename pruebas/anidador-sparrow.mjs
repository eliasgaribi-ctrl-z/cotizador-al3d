/* El motor sparrow de la mesa de corte: la traducción de ida y vuelta, y el motor de verdad.
 *
 * Elías pidió un acomodo «bien optimizado», como el que su taller hace a mano, y el motor nuevo
 * (sparrow, MIT) lo da. Lo que aquí se defiende no se ve mirando la pantalla y se descubre en la
 * máquina: una pieza que sale de espejo (la tira se gira a la hoja con un GIRO, no con un volteo),
 * una pieza que se monta en otra, o una que queda a menos de la separación pedida —la broca no
 * pasa—. Por eso, además de las cuentas, se corre el motor compilado (anidador-vectores/motor/)
 * con piezas de verdad y se mide el resultado con geometría propia, sin creerle al motor.
 *
 * Uso: node pruebas/anidador-sparrow.mjs   (o pruebas/correr.sh, que corre todas)
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = createRequire(import.meta.url)(join(RAIZ, 'anidador-vectores/js/motor-sparrow.js'));

let fallos = 0;
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, que, extra) => (c ? bien(que) : mal(que, extra));
const igual = (a, b, que) => (JSON.stringify(a) === JSON.stringify(b) ? bien(que) : mal(que + ': esperaba ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)));
const cerca = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const rot = (g, p) => { const a = g * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; };
const rect = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
/* Una «L» (no simétrica: si sale de espejo, se nota). */
const L = (x, y) => [{ x, y }, { x: x + 40, y }, { x: x + 40, y: y + 160 }, { x: x + 120, y: y + 160 }, { x: x + 120, y: y + 200 }, { x, y: y + 200 }];
const areaFirmada = p => p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q.x * r.y - r.x * q.y; }, 0) / 2;

console.log('\nLOS GIROS Y LOS TIEMPOS');
igual(S.girosDe('libre'), undefined, '«libre» es cualquier ángulo (el motor lo entiende como lista vacía de giros)');
igual(S.girosDe('2'), [0, 180], 'con veta: 0° y 180°');
igual(S.girosDe('4'), [0, 90, 180, 270], 'cada 90°');
igual(S.girosDe('1'), [0], 'ninguno: como vienen');
igual([S.segundosPara(5), S.segundosPara(10), S.segundosPara(45), S.segundosPara(9999)], [10, 10, 60, 600], 'el tiempo se sube a uno de los que acepta el motor');

console.log('\nLA ENTRADA DEL MOTOR');
{
  const prep = S.preparar([{ id: 'a', contorno: rect(500, 300, 100, 50) }, { id: 'b', contorno: L(10, 20) }]);
  igual(prep[0].o, { x: 500, y: 300 }, 'cada pieza se lleva a su esquina y se recuerda cuánto se movió');
  igual(prep[0].local[0], [0, 0], 'su contorno empieza en (0, 0)');
  const e = JSON.parse(S.entrada(prep, { ancho: 1200, giros: '2' }));
  cierto(e.strip_height === 1200 && e.items.length === 2 && e.items.every(i => i.demand === 1 && i.shape.type === 'simple_polygon'), 'la tira es del ancho de la hoja y va una pieza por contorno', e);
  igual(e.items[1].allowed_orientations, [0, 180], 'con los giros pedidos');
  cierto(!('allowed_orientations' in JSON.parse(S.entrada(prep, { ancho: 1200, giros: 'libre' })).items[0]), 'con giro libre no se manda lista: el motor gira a cualquier ángulo');
}

console.log('\nDEL MOTOR A LA HOJA: UN GIRO, NUNCA UN ESPEJO');
{
  const piezas = [{ id: 'L', contorno: L(300, 700) }];
  const prep = S.preparar(piezas);
  for (const parada of [true, false]) {
    const hoja = S.geometriaDeHoja(parada ? 1200 : 2400, parada ? 2400 : 1200);
    for (const th of [0, 37, 90, 180, 270]) {
      const sol = { layout: { placed_items: [{ item_id: 0, transformation: { rotation: th, translation: [250, 410] } }] } };
      const [c] = S.colocaciones(sol, prep, hoja);
      /* Lo que debe quedar: la tira (S = R(θ)(P − o) + t) llevada a la hoja. */
      const esperado = piezas[0].contorno.map(P => { const s = rot(th, { x: P.x - 300, y: P.y - 700 }); const tira = { x: s.x + 250, y: s.y + 410 }; if (!parada) return tira; const q = rot(90, tira); return { x: q.x + 1200, y: q.y }; });
      const obtenido = piezas[0].contorno.map(P => { const q = rot(c.r, P); return { x: q.x + c.x, y: q.y + c.y }; });
      cierto(obtenido.every((q, i) => cerca(q.x, esperado[i].x, 1e-6) && cerca(q.y, esperado[i].y, 1e-6)), `hoja ${parada ? 'parada' : 'acostada'}, giro ${th}°: «translate(x y) rotate(r)» deja la pieza justo donde la puso el motor`);
      cierto(Math.sign(areaFirmada(obtenido)) === Math.sign(areaFirmada(piezas[0].contorno)), `   y sin espejo (el sentido del contorno no se invierte)`);
    }
  }
  const hp = S.geometriaDeHoja(1200, 2400);
  cierto(hp.parada && hp.anchoTira === 1200 && hp.largoTira === 2400, 'en la hoja parada la tira corre a lo largo (2.40 m)');
  igual(S.retazo(2093, hp, 4.5), { ancho: 1200, alto: 302.5 }, 'lo que no usó la tira queda de retazo, de lado a lado');
  igual(S.retazo(2400, hp, 0), null, 'si la usó toda, no hay retazo');
}

console.log('\nUNA TIRA MÁS LARGA QUE LA HOJA SE PARTE');
{
  const prep = S.preparar([{ id: 1, contorno: rect(0, 0, 100, 100) }, { id: 2, contorno: rect(0, 0, 100, 100) }, { id: 3, contorno: rect(0, 0, 100, 100) }]);
  const sol = { layout: { placed_items: [
    { item_id: 0, transformation: { rotation: 0, translation: [10, 10] } },
    { item_id: 1, transformation: { rotation: 0, translation: [2250, 10] } },     // de 2250 a 2350: cabe
    { item_id: 2, transformation: { rotation: 0, translation: [2380, 10] } },     // de 2380 a 2480: cruza el corte de 2400
  ] } };
  const r = S.partir(sol, prep, 2400, 4.5);
  igual(r, { dentro: [0, 1], fuera: [2] }, 'lo que cabe entero en el largo de la hoja es la primera hoja; lo que cruza el corte vuelve al motor');
}

console.log('\nEL MOTOR DE VERDAD, EN NODE');
{
  const dir = join(RAIZ, 'anidador-vectores/motor/simd');
  if (!fs.existsSync(join(dir, 'sparrow_web_bg.wasm'))) mal('falta el paquete compilado en anidador-vectores/motor/simd');
  else {
    /* El snippet de registro del motor manda líneas con postMessage; en node no hay a quién. */
    globalThis.postMessage = () => {};
    const motor = await import(pathToFileURL(join(dir, 'sparrow_web.js')).href);
    await motor.default({ module_or_path: fs.readFileSync(join(dir, 'sparrow_web_bg.wasm')) });
    const piezas = [];
    for (let i = 0; i < 6; i++) piezas.push({ id: 'L' + i, contorno: L(i * 200, 0) });
    for (let i = 0; i < 6; i++) piezas.push({ id: 'R' + i, contorno: rect(0, 0, 90 + i * 15, 60) });
    const SEP = 6, ANCHO = 400;
    const prep = S.preparar(piezas);
    let mejor = null, mensajes = 0, error = null;
    const t0 = Date.now();
    try {
      motor.run(S.entrada(prep, { ancho: ANCHO, giros: '4' }), 10, '42', SEP, 'standard', json => {
        const m = JSON.parse(json); mensajes++;
        if (m.type === 'candidate' && (!mejor || m.solution.strip_width < mejor.strip_width)) mejor = m.solution;
      }, undefined);
    } catch (e) { error = String(e); }
    const seg = Math.round((Date.now() - t0) / 100) / 10;
    cierto(!error && mejor && mejor.layout.placed_items.length === 12, `el motor acomodó las 12 piezas en ${seg} s (${mensajes} mensajes)`, error || (mejor && mejor.layout.placed_items.length));
    if (mejor) {
      const hoja = S.geometriaDeHoja(ANCHO, 1000);
      const col = S.colocaciones(mejor, prep, hoja);
      const puestas = col.map(c => piezas.find(p => p.id === c.id).contorno.map(P => { const q = rot(c.r, P); return { x: q.x + c.x, y: q.y + c.y }; }));
      const todos = puestas.flat();
      const x0 = Math.min(...todos.map(q => q.x)), x1 = Math.max(...todos.map(q => q.x)), y0 = Math.min(...todos.map(q => q.y)), y1 = Math.max(...todos.map(q => q.y));
      cierto(x0 >= -1e-6 && x1 <= ANCHO + 1e-6 && y0 >= -1e-6, `todo dentro del ancho de la hoja (x de ${x0.toFixed(1)} a ${x1.toFixed(1)} mm de ${ANCHO})`);
      cierto(cerca(y1, mejor.strip_width, 1.5) || y1 <= mejor.strip_width + 1e-6, `y el largo usado es el que dice el motor (${y1.toFixed(1)} contra ${Number(mejor.strip_width).toFixed(1)} mm)`);
      /* Distancia mínima entre piezas, medida aquí: segmento contra segmento por vértices. */
      const dseg = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, Lq = dx * dx + dy * dy; const t = Lq ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Lq)) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
      const dentro = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
      let minD = Infinity, encimadas = 0;
      for (let i = 0; i < puestas.length; i++) for (let j = i + 1; j < puestas.length; j++) {
        if (puestas[i].some(p => dentro(p, puestas[j])) || puestas[j].some(p => dentro(p, puestas[i]))) encimadas++;
        for (const [P, Q] of [[puestas[i], puestas[j]], [puestas[j], puestas[i]]]) for (const p of P) for (let k = 0; k < Q.length; k++) minD = Math.min(minD, dseg(p, Q[k], Q[(k + 1) % Q.length]));
      }
      cierto(encimadas === 0, 'ninguna pieza encima de otra');
      cierto(minD >= SEP - 0.05, `ninguna a menos de la separación: la más cercana a ${minD.toFixed(2)} mm (se pidieron ${SEP})`);
      cierto(col.every(c => { const p = piezas.find(q => q.id === c.id).contorno; return Math.sign(areaFirmada(p.map(P => rot(c.r, P)))) === Math.sign(areaFirmada(p)); }), 'y ninguna salió de espejo');
    }
  }
}

console.log('');
if (fallos) { console.log(fallos + ' fallo(s).'); process.exit(1); }
console.log('Todo bien.');
