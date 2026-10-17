/* El NFP rápido del motor (anidador-vectores/js/lib/minkowski.js) da EXACTAMENTE la misma figura
 * que la suma de Minkowski de Clipper que usaba SVGnest.
 *
 * El primer acomodo de 24 letras tardaba ~20 s y casi todo era la suma de Clipper: un
 * cuadrilátero por cada par de lados. La convolución llega a la misma figura con muchos menos
 * tramos, pero un error ahí no se ve en la pantalla: se ve en la máquina, con dos letras
 * encimadas o una separación que no se respetó. Así que aquí se compara contra la suma de
 * Clipper, figura contra figura (el área de lo que tiene una y no la otra), con formas que
 * provocan los casos difíciles —lados paralelos, vértices cóncavos, curvas, una «C» con la boca
 * angosta— y con las letras del logotipo del taller, en varios giros.
 *
 * Uso: node pruebas/anidador-minkowski.mjs   (o pruebas/correr.sh, que corre todas)
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const C = req(join(RAIZ, 'anidador-vectores/js/lib/clipper.js'));
globalThis.ClipperLib = C;
const MK = req(join(RAIZ, 'anidador-vectores/js/lib/minkowski.js'));

let fallos = 0;
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, que, extra) => (c ? bien(que) : mal(que, extra));

/* ---------- Formas ---------- */
const rect = (w, h) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
const ele = () => [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 60 }, { x: 0, y: 60 }];
const estrella = (n, r1, r2) => Array.from({ length: 2 * n }, (_, i) => { const a = Math.PI * i / n, r = i % 2 ? r2 : r1; return { x: 100 + r * Math.cos(a), y: 100 + r * Math.sin(a) }; });
const engrane = () => Array.from({ length: 48 }, (_, i) => { const a = 2 * Math.PI * Math.floor(i / 2) / 24 + (i % 2) * 2 * Math.PI / 48, r = (Math.floor(i / 2) % 2) ? 40 : 52; return { x: 300 + r * Math.cos(a), y: -50 + r * Math.sin(a) }; });
/* Una «C» gruesa con la boca angosta: el caso de «buscar dentro de las concavidades». */
const ce = (abre, N = 40) => {
  const p = [];
  for (let i = 0; i <= N; i++) { const a = abre + (2 * Math.PI - 2 * abre) * i / N; p.push({ x: 60 * Math.cos(a), y: 60 * Math.sin(a) }); }
  for (let i = N; i >= 0; i--) { const a = abre + (2 * Math.PI - 2 * abre) * i / N; p.push({ x: 40 * Math.cos(a), y: 40 * Math.sin(a) }); }
  return p;
};
const peine = () => { const p = [{ x: 0, y: 0 }, { x: 90, y: 0 }]; for (let i = 4; i >= 0; i--) { p.push({ x: i * 20 + 10, y: 50 }); p.push({ x: i * 20, y: 50 }); if (i) p.push({ x: i * 20, y: 10 }); if (i) p.push({ x: i * 20 - 10, y: 10 }); } return p; };

/* Las letras del logotipo (logo-al3d.svg, del repo): trazos M/C/L/Z absolutos de VTracer, con
   su translate. Se aplanan las curvas y se limpian a 1.5 unidades (de 3120 que mide el lienzo): siguen siendo
   letras de verdad, con menos vértices, para que Clipper no tarde un minuto en compararlas. */
function letrasDelLogo() {
  const svg = readFileSync(join(RAIZ, 'logo-al3d.svg'), 'utf8');
  const out = [];
  for (const [etiqueta] of svg.matchAll(/<path\s[^>]*>/g)) {
    const d = /\sd="([^"]+)"/.exec(etiqueta), tr = /translate\(([-\d.]+),([-\d.]+)\)/.exec(etiqueta);
    if (!d || !tr || +tr[1] < 3120 * 0.75) continue;
    const tx = +tr[1], ty = +tr[2], toks = d[1].match(/[MCLZ]|-?[\d.]+/g);
    let i = 0, cmd = '', p = [], x = 0, y = 0;
    const num = () => +toks[i++];
    while (i < toks.length) {
      if (/[MCLZ]/.test(toks[i])) cmd = toks[i++];
      if (cmd === 'Z') { if (p.length > 2) out.push(p.map(q => ({ x: q.x + tx, y: q.y + ty }))); p = []; continue; }
      if (cmd === 'M' || cmd === 'L') { x = num(); y = num(); p.push({ x, y }); }
      else if (cmd === 'C') {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
        for (let k = 1; k <= 6; k++) { const t = k / 6, u = 1 - t; p.push({ x: u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, y: u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3 }); }
        x = x3; y = y3;
      }
    }
    if (p.length > 2) out.push(p.map(q => ({ x: q.x + tx, y: q.y + ty })));
  }
  /* Como en el motor: sin autointersecciones y el polígono más grande. */
  return out.map(p => {
    const c = p.map(q => ({ X: Math.round(q.x * 1e4), Y: Math.round(q.y * 1e4) }));
    let s = C.Clipper.SimplifyPolygon(c, C.PolyFillType.pftNonZero);
    s.sort((a, b) => Math.abs(C.Clipper.Area(b)) - Math.abs(C.Clipper.Area(a)));
    s = C.Clipper.CleanPolygon(s[0], 1.5 * 1e4);
    return s.map(q => ({ x: q.X / 1e4, y: q.Y / 1e4 }));
  }).filter(p => p.length > 2);
}

const girar = (P, g) => { const a = g * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return P.map(q => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c })); };

/* La de SVGnest: suma de Clipper con B reflejado, el polígono más grande, en el marco de B[0]. */
function sumaDeClipper(A, B) {
  const E = 1e4, Ac = A.map(q => ({ X: Math.round((q.x - A[0].x) * E), Y: Math.round((q.y - A[0].y) * E) }));
  const Bc = B.map(q => ({ X: -Math.round((q.x - B[0].x) * E), Y: -Math.round((q.y - B[0].y) * E) }));
  const sol = C.Clipper.MinkowskiSum(Ac, Bc, true);
  let ext = null, aa = 0;
  for (const s of sol) { const a = C.Clipper.Area(s); if (Math.abs(a) > aa) { aa = Math.abs(a); ext = s; } }
  return ext.map(q => ({ x: q.X / E + A[0].x, y: q.Y / E + A[0].y }));
}
const aClip = (P, E) => P.map(q => ({ X: Math.round(q.x * E), Y: Math.round(q.y * E) }));
function areaXor(P, Q) {
  const E = 1e3, c = new C.Clipper(), sol = new C.Paths();
  c.AddPath(aClip(P, E), C.PolyType.ptSubject, true); c.AddPath(aClip(Q, E), C.PolyType.ptClip, true);
  c.Execute(C.ClipType.ctXor, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return sol.reduce((s, x) => s + Math.abs(C.Clipper.Area(x)), 0) / E / E;
}
const areaDe = P => Math.abs(C.Clipper.Area(aClip(P, 1e3))) / 1e6;

console.log('\nLA CONVOLUCIÓN DA LA MISMA FIGURA QUE LA SUMA DE CLIPPER');
const letras = letrasDelLogo();
cierto(letras.length >= 4, 'se leyeron las letras del logotipo (' + letras.length + ' contornos)', letras.length);
const formas = { rect: rect(80, 30), cuadro: rect(50, 50), ele: ele(), estrella: estrella(7, 60, 25), engrane: engrane(), ce: ce(0.35, 16), peine: peine() };
letras.forEach((l, i) => { formas['logo' + i] = l; });
const nombres = Object.keys(formas);
let pares = 0, peor = 0, peorPar = '', nulos = [], tConv = 0, tClip = 0;
/* Todas contra todas las sintéticas en cuatro giros; las del logotipo, que tienen cientos de
   vértices y a Clipper le cuestan segundos por par, entre sí en un giro chueco (37°) y contra
   la «L» y la «C» de pocos vértices. */
const sinteticas = nombres.filter(n => !/^logo/.test(n)), delLogo = nombres.filter(n => /^logo/.test(n));
const casos = [];
for (const a of sinteticas) for (const b of sinteticas) for (const g of [0, 90, 37]) casos.push([a, b, g]);
for (const a of delLogo) for (const b of delLogo) if (a <= b) for (const g of [37]) casos.push([a, b, g]);
for (const a of delLogo) for (const b of ['ele', 'ce']) casos.push([a, b, 90], [b, a, 180]);
for (const [na, nb, g] of casos) {
  {
    {
      const i = nombres.indexOf(na), j = nombres.indexOf(nb);
      const A = formas[nombres[i]], B = girar(formas[nombres[j]], g);
      let t = performance.now();
      const conv = MK.nfpExterior(A, B, false);
      tConv += performance.now() - t;
      t = performance.now();
      const ref = sumaDeClipper(A, B);
      tClip += performance.now() - t;
      pares++;
      if (!conv) { nulos.push(nombres[i] + '/' + nombres[j] + '@' + g); continue; }
      const rel = areaXor(conv[0], ref) / areaDe(ref);
      if (rel > peor) { peor = rel; peorPar = nombres[i] + '/' + nombres[j] + '@' + g; }
    }
  }
}
cierto(peor < 1e-5, pares + ' pares en varios giros: la diferencia más grande entre las dos figuras es ' + (peor * 100).toExponential(2) + ' % del área (' + peorPar + ')', { peor, peorPar });
cierto(nulos.length <= pares * 0.02, 'la convolución sale en casi todos los pares (' + (pares - nulos.length) + '/' + pares + '; los demás usan la suma de Clipper)', nulos.slice(0, 10));
cierto(tConv * 3 < tClip, 'y es más rápida: ' + Math.round(tConv) + ' ms contra ' + Math.round(tClip) + ' ms de la suma de Clipper', { tConv, tClip });

console.log('\nEL MARCO ES EL DE SVGNEST: LA POSICIÓN DEL PRIMER VÉRTICE DE B');
{
  /* Dos cuadrados de 10: B toca a A por la derecha cuando su primer vértice (0,0) está en x = 10. */
  const n = MK.nfpExterior(rect(10, 10), rect(10, 10), false)[0];
  const xs = n.map(q => q.x), ys = n.map(q => q.y);
  cierto(Math.abs(Math.min(...xs) + 10) < 1e-6 && Math.abs(Math.max(...xs) - 10) < 1e-6 && Math.abs(Math.min(...ys) + 10) < 1e-6 && Math.abs(Math.max(...ys) - 10) < 1e-6,
    'dos cuadrados de 10: el NFP va de −10 a 10 en los dos ejes', { xs, ys });
  /* Trasladar A traslada el NFP; trasladar B no lo mueve (el marco es su primer vértice). */
  const A = estrella(5, 40, 15), B = ele();
  const n1 = MK.nfpExterior(A, B, false)[0];
  const n2 = MK.nfpExterior(A.map(q => ({ x: q.x + 1000, y: q.y - 500 })), B.map(q => ({ x: q.x - 777, y: q.y + 333 })), false)[0];
  cierto(areaXor(n1.map(q => ({ x: q.x + 1000, y: q.y - 500 })), n2) < 1e-3, 'mover A mueve el NFP lo mismo; mover B no lo mueve');
}

console.log('\nLOS HUECOS DEL NFP: DÓNDE CABE B DENTRO DE UNA CONCAVIDAD CERRADA');
{
  /* Una «C» casi cerrada (boca de 2×60·sin(0.05) ≈ 6) y un cuadrito de 10 que no pasa por la boca
     pero cabe adentro: el NFP tiene un hueco, y SOLO se devuelve si se pide. */
  const A = ce(0.05), B = rect(10, 10);
  const sin = MK.nfpExterior(A, B, false), con = MK.nfpExterior(A, B, true);
  cierto(sin && sin.length === 1, 'sin pedirlos, solo el contorno de fuera', sin && sin.length);
  cierto(con && con.length === 2, 'pidiéndolos, el contorno y un hueco', con && con.length);
  if (con && con.length === 2) {
    const h = con[1], cx = h.reduce((s, q) => s + q.x, 0) / h.length, cy = h.reduce((s, q) => s + q.y, 0) / h.length;
    /* Puesto en el centro del hueco, el cuadrito no toca la «C». */
    const Bc = B.map(q => ({ x: q.x + cx - B[0].x, y: q.y + cy - B[0].y }));
    const c = new C.Clipper(), sol = new C.Paths();
    c.AddPath(aClip(A, 1e3), C.PolyType.ptSubject, true); c.AddPath(aClip(Bc, 1e3), C.PolyType.ptClip, true);
    c.Execute(C.ClipType.ctIntersection, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    cierto(sol.length === 0, 'y en el hueco el cuadrito no toca a la «C»', sol.length);
  }
}

console.log('\nEL NFP DE UN HUECO DE VERDAD (UNA «O»): DÓNDE QUEDA B ENTERO ADENTRO');
{
  const O = Array.from({ length: 64 }, (_, i) => ({ x: 50 * Math.cos(2 * Math.PI * i / 64), y: 50 * Math.sin(2 * Math.PI * i / 64) }));
  const B = rect(20, 20);
  const r = MK.nfpHueco(O, B);
  cierto(r && r.length === 1, 'un cuadrito de 20 en un círculo de radio 50: una región', r && r.length);
  if (r && r.length) {
    /* El primer vértice de B (su esquina) puede ir de −35.36 a 15.36 en x: el cuadrado de 20 dentro
       del círculo; el centro (−10,−10) está, y una esquina pegada a la orilla no. */
    const xs = r[0].map(q => q.x);
    cierto(Math.min(...xs) > -50 && Math.max(...xs) < 31, 'la región queda dentro del círculo, corrida por el tamaño de B', [Math.min(...xs), Math.max(...xs)]);
    const dentro = (P, p) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i].y > p.y) !== (P[j].y > p.y) && p.x < (P[j].x - P[i].x) * (p.y - P[i].y) / (P[j].y - P[i].y) + P[i].x) c = !c; return c; };
    cierto(dentro(r[0], { x: -10, y: -10 }) && !dentro(r[0], { x: 30, y: 30 }), 'B centrado cabe; B en la orilla no');
  }
  cierto(!(MK.nfpHueco(O, rect(90, 90)) || []).length, 'una pieza de 90 no cabe en el círculo de radio 50: ninguna región');
}

console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
