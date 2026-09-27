/* LAS PIEZAS DE AVISOS Y BOTONES, EN LO QUE SE PUEDE PROBAR SIN PANTALLA.

   js/piezas.js es un guion clásico que cargan las cuatro superficies, y dos cosas de él se
   prueban mejor aquí que en un navegador:

     · Que se CARGA en node sin tronar. Hay pruebas que leen guiones de la app dentro de un vm, y
       un archivo compartido que truena al cargar sin `window` las tumba a todas de golpe, con un
       error que no dice nada de avisos.
     · La lógica que decide, que es donde un error no se ve: qué aviso cede su lugar a cuál (un
       informativo sí, un error o un «Deshacer» nunca — la falla 2 del brief era justo eso), cuánto
       dura un aviso con botón, cómo se cuenta lo que falta de una mecha, que el reloj que se pausa
       de verdad se pause, que el relleno del botón que trabaja nunca llegue al 100 % antes de
       tiempo, y que el sello y el glifo de estado se pinten escapados y con ids que no chocan.

   Para lo segundo el guion corre con una ventana de mentiras: un documento que contesta a todo
   sin hacer nada, porque las funciones que se prueban aquí no tocan el DOM.

   Se corre con pruebas/correr.sh, como todas. */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, v, detalle) => eq(que + (v || detalle === undefined ? '' : ' — ' + JSON.stringify(detalle)), !!v, true);
const espera = ms => new Promise(r => setTimeout(r, ms));
const fuente = readFileSync(new URL('../js/piezas.js', import.meta.url), 'utf8');

console.log('\nSE CARGA EN NODE SIN VENTANA');
{
  let error = null, ctx = {};
  try { vm.runInNewContext(fuente, ctx, { filename: 'js/piezas.js' }); } catch (e) { error = e.message; }
  eq('en un contexto vacío (sin window ni document) no truena', error, null);
  eq('  y no cuelga nada: sin documento, la IIFE se sale', Object.keys(ctx), []);
  error = null;
  try { new Function(fuente)(); } catch (e) { error = e.message; }
  eq('tampoco como función suelta en el ámbito de node', error, null);
}

/* ----- La ventana de mentiras -----
   `nada` contesta a cualquier propiedad, llamada o construcción con otro `nada`: las secciones
   que al cargar cuelgan un oyente o piden un elemento no truenan, y las funciones puras que se
   prueban abajo no lo tocan. */
const nada = new Proxy(function () {}, {
  get(_, k) { return k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : nada; },
  apply() { return nada; }, construct() { return nada; }, set() { return true; },
});
const ventana = {
  document: nada, navigator: {}, performance, setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: f => setTimeout(f, 0),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  addEventListener() {}, removeEventListener() {}, getComputedStyle: () => nada,
};
new Function('window', fuente)(ventana);
const P = ventana.Piezas;
cierto('con ventana, window.Piezas existe y trae el aviso', P && typeof P.aviso === 'function');

console.log('\nQUIÉN CEDE SU LUGAR EN LA PILA');
{
  const A = P.aviso;
  eq('prioridad: error 2, con botón 1, informativo 0',
    [A.prioridad({ tipo: 'err' }), A.prioridad({ fn: () => {} }), A.prioridad({ accion: { label: 'Deshacer', fn: () => {} } }), A.prioridad({ tipo: 'ok' }), A.prioridad({})],
    [2, 1, 1, 0, 0]);
  eq('  un botón sin función no cuenta como botón', A.prioridad({ accion: { label: 'Deshacer' } }), 0);
  eq('duración: sin número, 2.6 s; con botón, 8 s como mínimo; lo que se pida de más se respeta',
    [A.duracion(), A.duracion(0), A.duracion(NaN), A.duracion(Infinity), A.duracion(1200), A.duracion(2000, {}), A.duracion(12000, {}), A.duracion('4000')],
    [2600, 2600, 2600, 2600, 1200, 8000, 12000, 4000]);
  const f1 = () => {}, f2 = () => {};
  const av = (msg, o = {}) => ({ msg, tipo: o.tipo || '', label: o.fn ? (o.label || 'Deshacer') : '', fn: o.fn || null, clave: o.clave || '', prio: A.prioridad({ tipo: o.tipo, fn: o.fn }) });
  /* La falla 2: aplicarSello() avisa el error y en el mismo tick llega el «✓ autorizó». */
  eq('la falla 2: con el error del notario a la vista, el «✓ autorizó» se AGREGA, no lo pisa',
    A.decidir([av('El total no es el que selló la hoja', { tipo: 'err' })], av('✓ direccion@al3d.mx autorizó COT-0042', { tipo: 'ok' }), 2), { que: 'agregar', i: 1 });
  eq('un informativo reemplaza al informativo', A.decidir([av('Guardada', { tipo: 'ok' })], av('Copiado', { tipo: 'ok' }), 2), { que: 'reemplazar', i: 0 });
  eq('  y también cede ante uno con botón («Mandando…» → «Venta registrada · Abrir plataforma»)',
    A.decidir([av('Mandando la venta a la hoja…')], av('Venta registrada en la hoja', { fn: f2, label: 'Abrir plataforma' }), 2), { que: 'reemplazar', i: 0 });
  eq('  y el «No se escribió…» de después se agrega: «Abrir plataforma» ya no se pierde',
    A.decidir([av('Venta registrada en la hoja', { fn: f2, label: 'Abrir plataforma' })], av('No se escribió: Anticipo', { tipo: 'err' }), 2), { que: 'agregar', i: 1 });
  eq('el mismo aviso tal cual se reusa', A.decidir([av('Partida 2 eliminada', { fn: f1 })], av('Partida 2 eliminada', { fn: f1 }), 2), { que: 'reusar', i: 0 });
  eq('dos «Deshacer» de la MISMA función: el nuevo toma el lugar del viejo (deshacerBorrado solo sabe deshacer el último)',
    A.decidir([av('Partida 1 eliminada', { fn: f1 }), av('Guardada')], av('Partida 3 eliminada', { fn: f1 }), 2), { que: 'reemplazar', i: 0 });
  eq('dos «Deshacer» de funciones distintas conviven', A.decidir([av('Retazo A quitado', { fn: f1 })], av('Retazo B quitado', { fn: f2 }), 2), { que: 'agregar', i: 1 });
  eq('la misma clave reemplaza aunque cambie el texto', A.decidir([av('Página 1 de 20', { clave: 'traer' }), av('x', { tipo: 'err' })], av('Página 2 de 20', { clave: 'traer' }), 2), { que: 'reemplazar', i: 0 });
  eq('con un error y un «Deshacer» a la vista, el tercero ESPERA', A.decidir([av('No se pudo', { tipo: 'err' }), av('Borrada', { fn: f1 })], av('Otro error', { tipo: 'err' }), 2), { que: 'esperar', i: -1 });
  eq('  también un informativo', A.decidir([av('No se pudo', { tipo: 'err' }), av('Borrada', { fn: f1 })], av('Guardada'), 2), { que: 'esperar', i: -1 });
  eq('  y un error nunca le quita el lugar a otro error', A.decidir([av('Uno', { tipo: 'err' }), av('Dos', { tipo: 'err' })], av('Tres', { tipo: 'err' }), 2), { que: 'esperar', i: -1 });
  eq('si hay lugar, se agrega', A.decidir([], av('Hola'), 2), { que: 'agregar', i: 0 });
  eq('de dos informativos cede el más nuevo', A.decidir([av('Uno'), av('Dos')], av('Tres'), 2), { que: 'reemplazar', i: 1 });
}

console.log('\nLO QUE FALTA, CON LETRA');
eq('P.reloj cuenta segundos enteros hacia abajo', [0, 999, 6400, 59999, 60000, 65000, 600000].map(ms => P.reloj(ms)),
  ['0 s', '0 s', '6 s', '59 s', '1 min', '1 min 05 s', '10 min']);
eq('  y con {falta:true} hacia arriba: «0 s» con la mecha viva se lee como que se trabó',
  [0, 1, 4999, 5000, 5001, 59500].map(ms => P.reloj(ms, { falta: true })), ['0 s', '1 s', '5 s', '5 s', '6 s', '1 min']);
eq('  un valor que no es número cuenta como cero', [P.reloj(undefined), P.reloj(-5), P.reloj('x')], ['0 s', '0 s', '0 s']);

console.log('\nEL RELLENO DEL BOTÓN QUE TRABAJA NO FINGE');
{
  const tau = 4000;
  eq('empieza en cero', P.avance(0, tau), 0);
  cierto('en τ va en 0,9·(1 − 1/e) ≈ 56.9 %', Math.abs(P.avance(tau, tau) - 0.9 * (1 - Math.exp(-1))) < 1e-9);
  const serie = [0, 500, 1000, 4000, 8000, 20000, 60000, 1e7].map(t => P.avance(t, tau));
  cierto('siempre sube', serie.every((v, i) => i === 0 || v > serie[i - 1] || v === serie[i - 1]), serie);
  cierto('y NUNCA llega al 90 %: el final solo lo pone la respuesta', serie.every(v => v < 0.9 + 1e-12) && serie[serie.length - 1] > 0.89, serie);
  const c = P.curvaAvance(tau);
  eq('la curva en cuadros dura 6τ', c.duracion, 6 * tau);
  cierto('  con offsets de 0 a 1 en orden', c.cuadros[0].offset === 0 && c.cuadros[c.cuadros.length - 1].offset === 1 && c.cuadros.every((q, i) => i === 0 || q.offset > c.cuadros[i - 1].offset));
  eq('  y el último cuadro es el de 6τ', c.cuadros[c.cuadros.length - 1].transform, 'scaleX(' + P.avance(6 * tau, tau).toFixed(4) + ')');
  eq('un τ inválido cae en 4 s', P.curvaAvance(-1).duracion, 24000);
}

console.log('\nEL RELOJ QUE SE PAUSA');
{
  let fin = 0;
  const m = P.mecha(null, { ms: 400, alTerminar: () => { fin++; } });
  m.pausar('puntero');
  await espera(250);
  const r1 = m.resta();
  cierto('pausado, lo que falta no baja', r1 > 380, r1);
  m.pausar('oculto');
  m.seguir('puntero');
  await espera(150);
  cierto('con dos razones, quitar una no lo reanuda', m.resta() > 380 && fin === 0, m.resta());
  m.seguir('oculto');
  await espera(480);
  eq('sin razones, corre y termina una sola vez', fin, 1);
  eq('  y al terminar no queda nada', [m.vivo, m.resta()], [false, 0]);
  m.reiniciar(200);
  await espera(260);
  eq('reiniciar() lo rellena de golpe y vuelve a correr (la mecha del paro del anidador)', fin, 2);
  const c = P.mecha(null, { ms: 100, alTerminar: () => { fin++; } });
  c.cancelar();
  await espera(160);
  eq('cancelado, no termina', fin, 2);
  const corto = P.mecha(null, { ms: 2000 });
  await espera(1800);
  corto.pausar('dedo');
  const antes = corto.resta();
  corto.seguir('dedo');
  const despues = corto.resta();
  cierto('al volver de una pausa quedan por lo menos 1.5 s (el mismo piso de los dos toast())', antes < 400 && despues >= 1490, { antes, despues });
  corto.cancelar();
}

console.log('\nEL SELLO Y EL GLIFO, ESCAPADOS');
{
  eq('el círculo del texto empieza a la izquierda y va por arriba', P.circulo(80, 80, 61), 'M19,80 a61,61 0 1,1 122,0 a61,61 0 1,1 -122,0');
  eq('la letra circular: corto = 10, largo = no baja de 6.5', [P.letraCircular('AL3D', 61), P.letraCircular('x'.repeat(200), 61)], [10, 6.5]);
  const l = P.letraCircular('AL3D · COTIZACIÓN AUTÉNTICA · al3d.mx · CONSULTADA 27/09/2026 14:32 ·', 61);
  cierto('  y un texto de sello de verdad cabe entre las dos', l > 6.5 && l < 10, l);
  const a = P.selloHTML({ texto: 'AL3D · <b>COTIZACIÓN</b> "AUTÉNTICA" ·', centro: 'AL3D', sub: 'AUTÉNTICA' }), b = P.selloHTML({});
  cierto('el texto del sello va escapado', a.includes('&lt;b&gt;COTIZACIÓN&lt;/b&gt; &quot;AUTÉNTICA&quot;') && !a.includes('<b>'));
  const ia = /id="([^"]+)"/.exec(a)[1], ib = /id="([^"]+)"/.exec(b)[1];
  cierto('dos sellos no comparten id, y cada textPath apunta al suyo', ia !== ib && a.includes('href="#' + ia + '"') && b.includes('href="#' + ib + '"'), [ia, ib]);
  cierto('el texto da la vuelta exacta: textLength es el perímetro menos el respiro', a.includes('textLength="' + (2 * Math.PI * 61 - 4).toFixed(1) + '"'));
  cierto('gris y sin caída cuando se pide', /class="sello-circular gris"/.test(P.selloHTML({ gris: true, estampar: false })));
  cierto('es decorativo por omisión (aria-hidden) y lleva nombre si se le da',
    /aria-hidden="true"/.test(b) && /role="img" aria-label="Sello de AL3D: cotizaci&#39;ón"/.test(P.selloHTML({ etiqueta: "Sello de AL3D: cotizaci'ón" })));
  const g = P.marcaEstadoHTML('ok', { tam: 44, etiqueta: 'Auténtica' });
  cierto('el glifo de estado lleva su estado, su tamaño y su nombre', /data-estado="ok"/.test(g) && /--tam:44px/.test(g) && /role="img" aria-label="Auténtica"/.test(g));
  eq('  un estado desconocido cae en «espera»', /data-estado="([^"]+)"/.exec(P.marcaEstadoHTML('<script>'))[1], 'espera');
  cierto('  y sin nombre es decorativo', /aria-hidden="true"/.test(P.marcaEstadoHTML('mal')) && !/role=/.test(P.marcaEstadoHTML('mal')));
  cierto('la palomita nueva se dibuja; la que se repinta, no', /class="palomita dibuja"/.test(P.palomitaHTML()) && /class="palomita"/.test(P.palomitaHTML({ dibujar: false })));
  cierto('  y la de círculo lleva su círculo', /class="palomita con-circulo dibuja"/.test(P.palomitaHTML({ circulo: true })) && /<circle/.test(P.palomitaHTML({ circulo: true })));
  eq('los dos rótulos en una celda, para quien pinta con innerHTML', P.rotuloHTML('Copiar', '✓ Copiado'),
    '<span class="rotulo"><span class="rotulo-a">Copiar</span><span class="rotulo-b" aria-hidden="true">✓ Copiado</span></span>');
}

console.log(`\n${bien} bien, ${mal} mal`);
console.log(mal ? 'LAS PIEZAS DE AVISOS NO SE PUEDEN PUBLICAR ASÍ.' : 'Las piezas de avisos y botones deciden bien, y se cargan en node sin ventana.');
process.exit(mal ? 1 : 0);
