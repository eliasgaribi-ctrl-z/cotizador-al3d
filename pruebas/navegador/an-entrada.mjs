/* La mesa abre un DXF, lo limpia, respeta la separación y dice el retazo útil.
 *
 *   1. Un DXF en centímetros con lo que llega de verdad (archivo de AVIDA, 17/10/2026): una «L»
 *      hecha de LINE sueltas con un huequito de dibujo, un cuadro repetido, una letra con su
 *      contorno completo de guía y sus dos mitades encimadas, una línea doble a 2 mm, una línea
 *      que no cierra con nada y un texto. Entra por el selector de archivos como cualquier otro.
 *   2. La limpieza: cuántas piezas quedan, qué avisa, y que «Conservar» y «Quitarlos» funcionen.
 *   3. A 3 mm, 6 mm y 1 cm: ninguna pieza a menos de la separación (la revisión de la mesa y
 *      cabe()), el retazo útil a la vista y la separación en el pie de la hoja.
 *   4. La puerta para otro motor: colocar(posiciones()) deja el mismo acomodo, piezasLimpias()
 *      entrega cada pieza en su esquina mínima, y unas posiciones encimadas se marcan.
 *
 * Uso:  PUERTO=8814 node pruebas/navegador/an-entrada.mjs
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX' });
const p = await ctx.newPage();
let fallos = 0;
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, que, extra) => (c ? bien(que) : mal(que, extra));
const errs = []; p.on('pageerror', e => errs.push(e.message));
const dormir = ms => p.waitForTimeout(ms);
const estado = () => p.evaluate(() => window.Anidador.estado());
const mesa = () => p.evaluate(() => window.Anidador.mesa());

/* ---------- El DXF, en centímetros ---------- */
const g = (...xs) => xs.join('\r\n');
const linea = (x1, y1, x2, y2) => g(0, 'LINE', 8, 'Corte', 10, x1, 20, y1, 11, x2, 21, y2);
const cuadro = (x, y, w, h) => g(0, 'LWPOLYLINE', 8, 'Corte', 90, 4, 70, 1, 10, x, 20, y, 10, x + w, 20, y, 10, x + w, 20, y + h, 10, x, 20, y + h);
const ents = [
  /* La «L», de seis LINE, con 0.01 cm de hueco en una esquina. */
  linea(0, 0, 10, 0), linea(10, 0, 10, 2), linea(10, 2, 2.01, 2), linea(2, 2, 2, 15), linea(2, 15, 0, 15), linea(0, 15, 0, 0),
  /* Un cuadro, y el mismo otra vez. */
  cuadro(20, 0, 20, 20), cuadro(20, 0, 20, 20),
  /* Una letra de 30 × 40 con su contorno completo y sus dos mitades encimadas. */
  cuadro(50, 0, 30, 40), cuadro(50, 0, 15, 40), cuadro(65, 0, 15, 40),
  /* Una línea doble: un cuadro de 10 y otro a 2 mm alrededor. */
  cuadro(90, 0, 10, 10), cuadro(89.8, -0.2, 10.4, 10.4),
  /* Una línea que no cierra con nada, y un texto. */
  linea(0, 50, 30, 60), g(0, 'TEXT', 8, 'Notas', 10, 0, 20, 70, 40, 3, 1, 'AVIDA')
].join('\r\n');
const DXF = g(0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 5, 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES', ents, 0, 'ENDSEC', 0, 'EOF') + '\r\n';

await p.goto(B + '/anidador-vectores/', { waitUntil: 'load' });

console.log('\nABRIR EL DXF');
await p.setInputFiles('#an-file', { name: 'letrero.dxf', mimeType: 'application/dxf', buffer: Buffer.from(DXF) });
await dormir(700);
let e = await estado();
const av = (e.archivo && e.archivo.avisos || []).join(' | ');
cierto(e.archivo && e.archivo.nombre === 'letrero.dxf' && e.archivo.k > 0, 'el DXF entra por el selector, con su medida', e.archivo && [e.archivo.nombre, e.archivo.k]);
cierto(/centímetros/.test(await p.textContent('#an-medida-txt')), '«El DXF viene en centímetros»', await p.textContent('#an-medida-txt'));
cierto(e.archivo.piezas === 5, 'quedan 5 piezas: la «L», el cuadro, las dos mitades y el cuadro de dentro de la línea doble', e.archivo.piezas);
cierto(/Se juntaron 6 tramos sueltos en 1 contorno/.test(av), 'avisa que juntó las seis LINE de la «L»', av);
cierto(/contorno repetido/.test(av), 'avisa del cuadro repetido', av);
cierto(/contorno completo/.test(av) && /línea doble a 2\smm/.test(av), 'avisa del contorno de guía y de la línea doble a 2 mm', av);
cierto(/no cierra/.test(av) && /textos/.test(av), 'avisa de la línea que no cierra y del texto', av);
cierto(e.limpieza && e.limpieza.guias === 1 && e.limpieza.dobles === 1, 'la limpieza: un contorno de guía y una línea doble', e.limpieza);
const quitados = await p.evaluate(() => document.querySelectorAll('#an-orig .an-quitado').length);
const sueltas = await p.evaluate(() => document.querySelectorAll('#an-orig .an-suelta').length);
cierto(quitados === 2 && sueltas === 1, 'en la vista previa, lo quitado punteado (2) y lo suelto en ámbar (1)', [quitados, sueltas]);

console.log('\nCONSERVAR Y QUITAR');
await p.click('#an-avisos [data-aviso-accion]:text("Conservar los contornos completos")');
await dormir(300);
e = await estado();
cierto(e.limpieza.quitados === 1 && /Se conserva/.test(e.archivo.avisos.join()), '«Conservar los contornos completos» lo devuelve al acomodo', [e.limpieza, e.archivo.piezas]);
await p.click('#an-avisos [data-aviso-accion]:text("Quitarlos")');
await dormir(300);
e = await estado();
cierto(e.limpieza.quitados === 2 && e.archivo.piezas === 5, 'y «Quitarlos» lo vuelve a quitar', [e.limpieza, e.archivo.piezas]);

console.log('\nNINGUNA PIEZA A MENOS DE LA SEPARACIÓN');
await p.evaluate(() => { const f = (id, x) => { const el = document.getElementById(id); el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); }; f('an-ancho', 600); f('an-alto', 400); });
for (const [chip, sep] of [['3', 3], ['6', 6], ['10', 10]]) {
  await p.click('#an-sepchips .chip[data-sep="' + chip + '"]');
  cierto(await p.inputValue('#an-sep') === chip && await p.getAttribute('#an-sepchips .chip[data-sep="' + chip + '"]', 'aria-pressed') === 'true', 'el chip de ' + (sep === 10 ? '1 cm' : sep + ' mm') + ' pone la separación y queda marcado');
  await p.evaluate(() => window.Anidador.iniciar());
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { const s = await estado(); if (s.mejor && !s.corriendo) break; await dormir(250); }
  await dormir(400);
  e = await estado();
  const m = await mesa();
  const cabe = await p.evaluate(() => [...document.querySelectorAll('#an-res .an-hoja>svg>g[id]')].map(gg => window.Anidador.mesa.cabe(gg.id)).filter(x => x !== ''));
  cierto(e.mejor && e.mejor.colocadas === 5 && m.juntas.length === 0 && cabe.length === 0, 'a ' + sep + ' mm: las 5 colocadas, ninguna a menos de la separación ni fuera de lugar', [e.mejor, m.juntas, cabe]);
  cierto(m.sobrante && m.sobrante.w >= 100 && m.sobrante.h >= 100 && /\d/.test(await p.textContent('#an-st-sobra')), 'y dice el retazo útil: ' + (await p.textContent('#an-st-sobra')), m.sobrante);
  cierto(new RegExp('separación ' + sep + ' mm').test(await p.textContent('#an-res figcaption')), 'el pie de la hoja dice la separación');
}
const recordado = await p.evaluate(() => JSON.parse(localStorage.getItem('al3d_anidador_material') || '{}').sep);
cierto(recordado === '10', 'la separación se recuerda en el aparato', recordado);

console.log('\nLA PUERTA PARA OTRO MOTOR');
const antes = await p.evaluate(() => [...document.querySelectorAll('#an-res .an-hoja>svg>g[id]')].map(gg => gg.id + ' ' + gg.getAttribute('transform')).sort());
const pos = await p.evaluate(() => window.Anidador.posiciones());
cierto(await p.evaluate(ps => window.Anidador.colocar(ps), pos), 'colocar() acepta las posiciones de la mesa');
await dormir(500);
const despues = await p.evaluate(() => [...document.querySelectorAll('#an-res .an-hoja>svg>g[id]')].map(gg => gg.id + ' ' + gg.getAttribute('transform')).sort());
const num = t => (t.match(/-?[\d.]+(e-?\d+)?/g) || []).map(Number);
const iguales = antes.length === despues.length && antes.every((a, i) => a.split(' ')[0] === despues[i].split(' ')[0] && num(a.slice(a.indexOf(' '))).every((v, k) => Math.abs(v - num(despues[i].slice(despues[i].indexOf(' ')))[k]) < 1e-6));
cierto(iguales, 'colocar(posiciones()) deja el mismo acomodo', [antes.slice(0, 2), despues.slice(0, 2)]);
const pz = await p.evaluate(() => window.Anidador.piezasLimpias());
cierto(pz.length === 5 && pz.every(q => Math.abs(Math.min(...q.contorno.map(v => v.x))) < 1e-9 && Math.abs(Math.min(...q.contorno.map(v => v.y))) < 1e-9 && q.id && q.origen), 'piezasLimpias(): 5 piezas, cada una en su esquina mínima, con su id y su origen', pz.map(q => [q.id, q.contorno.length]));
const dxf = await p.evaluate(() => window.Anidador.armarDxf(null));
cierto(dxf && (dxf.match(/\nPOLYLINE\r?\n/g) || []).length >= 5, 'el DXF de salida se arma con lo colocado');
/* Dos piezas encimadas a propósito: la mesa las marca. */
await p.evaluate(ps => window.Anidador.colocar(ps.map((q, i) => ({ id: q.id, x: 20 + (i < 2 ? 0 : 200 * i), y: 20, giro: 0, hoja: 0 }))), pz);
await dormir(500);
const m2 = await mesa();
cierto(m2.juntas.some(j => !j.orilla) && await p.evaluate(() => document.querySelectorAll('#an-res g.junta').length >= 2) && /Más juntas que la separación/.test(await p.textContent('#an-juntas-t')),
  'dos piezas encimadas a propósito: se marcan y el pie lo dice', m2.juntas);

cierto(!errs.length, 'sin errores de JavaScript', errs);
console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\nLa mesa abre el DXF, lo limpia y respeta la separación.');
await nav.close();
process.exit(fallos ? 1 : 0);
