/* LAS PIEZAS DE NÚMEROS, MEDIDAS Y CAMPOS, SIN PANTALLA.

   js/piezas.js (sección 3) trae cuentas que no se ven y que un error vuelve plausibles: una
   rueda que alinea el total por la izquierda gira las unidades como si fueran centenas; un
   imán que gana a otro más cercano deja el anticipo en $6,300 cuando se pidió el 50 %; un
   teléfono que la pieza da por completo y WhatsApp lee distinto abre el chat de otra persona
   con la palomita puesta. Nada de eso truena: sale un número que parece bueno.

   Tres cosas se defienden aquí:
     1. que js/piezas.js se carga en node sin `window` y no truena —lo leen otras pruebas, y un
        guion que falla al cargar se lleva el toast() de las cuatro superficies—;
     2. que la sección 3 no toca el documento al cargar (solo define), evaluada sola con un
        documento que truena al primer acceso;
     3. la lógica pura de cada pieza, y que la regla de teléfono de la pieza es LA MISMA que
        `telWhatsApp` del cotizador y `telWa` de la plataforma, caso por caso: la pieza no
        puede tener un tercer criterio.

   Uso: node pruebas/piezas-numeros.mjs   (o pruebas/correr.sh, que corre todas) */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => readFileSync(join(RAIZ, f), 'utf8');
let fallas = 0;
const cierto = (cond, que) => { console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que); if (!cond) fallas++; };
const eq = (que, dio, esp) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esp);
  cierto(a === b, que + (a === b ? '' : '\n           dio: ' + a + '\n           esp: ' + b));
};

const fuente = leer('js/piezas.js');

console.log('\nSE CARGA EN NODE SIN VENTANA');
{
  let error = null;
  try { vm.runInNewContext(fuente, {}, { filename: 'js/piezas.js' }); } catch (e) { error = e; }
  cierto(!error, 'js/piezas.js corre en un contexto sin window ni document' + (error ? ': ' + error.message : ''));
  const ctx = vm.createContext({ window: { }, console });
  let error2 = null;
  try { vm.runInContext(fuente, ctx); } catch (e) { error2 = e; }
  cierto(!error2 && ctx.window.Piezas === undefined, 'y con un window sin document sale sin colgar nada');
}

/* La sección 3 sola, entre su encabezado y su marca de fin. Se evalúa con un documento que
   truena al primer acceso: si la sección tocara el DOM al cargar, esto lo diría. */
console.log('\nLA SECCIÓN 3 NO TOCA EL DOCUMENTO AL CARGAR');
const ini = fuente.indexOf('3 · NÚMEROS, MEDIDAS Y CAMPOS');
const fin = fuente.indexOf('/* ── fin de 3 ── */');
cierto(ini > 0 && fin > ini, 'la sección tiene su encabezado y su marca de fin');
const seccion = fuente.slice(fuente.indexOf('*/', ini) + 2, fin);
const trampa = new Proxy({}, { get(_, k) { throw new Error('la sección tocó document.' + String(k) + ' al cargar'); } });
const P = {
  sinMovimiento: () => false, punteroFino: () => false,
  esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
};
{
  let error = null;
  try { new Function('g', 'd', 'P', '"use strict";' + seccion)({ matchMedia: () => ({ matches: false }) }, trampa, P); } catch (e) { error = e; }
  cierto(!error, 'se evalúa sola y no toca el documento' + (error ? ': ' + error.message : ''));
}
const piezas = ['rodarCifra', 'diferenciaViva', 'fichaQueViaja', 'fichasQueViajan', 'arrastrarMedida', 'arrastrarMedidas',
  'opcionesDeslizantes', 'opcionesDeslizantesHTML', 'casillasCodigo', 'casillasCodigoHTML', 'telefonoVivo', 'telefonoVivoHTML',
  'medidorHTML', 'pintarMedidor', 'deslizadorConImanes'];
eq('cuelga de Piezas las quince piezas', piezas.filter(n => typeof P[n] !== 'function'), []);
cierto(P.cifras && P.telefono && P.codigo, 'y sus tres juegos de cuentas: P.cifras, P.telefono, P.codigo');
const { cifras: C, telefono: T, codigo: K } = P;

console.log('\n1 · LA RUEDA SE ALINEA POR LA DERECHA');
{
  const plan = C.plan('$9,999.00', '$10,000.00');
  eq('«$9,999.00 → $10,000.00»: las unidades siguen siendo unidades',
    plan.filter(c => c.digito).map(c => c.desde + '→' + c.hasta), ['0→1', '9→0', '9→0', '9→0', '9→0', '0→0', '0→0']);
  eq('  y el uno que nace sale del cero, y el «$» que se corre se marca como nuevo',
    [plan[0].ch, plan[0].cambia, plan[1].desde], ['$', true, 0]);
  eq('lo que no cambia no gira', C.plan('$1,234.00', '$1,284.00').filter(c => c.cambia).map(c => c.ch), ['8']);
  eq('una rueda interrumpida sigue desde donde iba (posiciones contadas desde la derecha)',
    C.plan('12', '15', [3.4, 1]).map(c => c.desde), [1, 3.4]);
  eq('sin número anterior, cada cifra sale del cero', C.plan(null, '42').map(c => c.desde), [0, 0]);
}

console.log('\nLA DIFERENCIA CON SU SIGNO');
{
  eq('«+0.6 láminas»', C.diferencia(3 - 2.4, { decimales: 1, unidad: 'láminas' }), '+0.6 láminas');
  eq('el menos es el de la columna del dinero (U+2212)', C.diferencia(-1.25, { decimales: 2 }), '−1.25');
  eq('lo que redondea a cero es cero, sin signo', C.diferencia(0.04, { decimales: 1, unidad: 'láminas' }), '0 láminas');
  eq('  y su signo también', [C.signo(0.04, 1), C.signo(0.6, 1), C.signo(-2, 0)], ['cero', 'mas', 'menos']);
  eq('con el formato de la pantalla (pesos)', C.diferencia(-1200, { formato: v => '$' + v.toLocaleString('es-MX') }), '−$1,200');
  eq('un campo vacío no es una diferencia', [C.diferencia('', {}), C.diferencia(NaN, { nada: '' })], ['—', '']);
  eq('miles con coma', C.diferencia(12345.5, { decimales: 1 }), '+12,345.5');
}

console.log('\n«TRES VECES MÁS DE LO QUE DICE EL LIBRO»');
{
  cierto(C.proporcionDudosa(2.4, 30), 'un «30» en lugar de «3.0» con el libro en 2.4 se pregunta');
  cierto(C.proporcionDudosa(3, 1), 'y un tercio también');
  cierto(!C.proporcionDudosa(2.4, 3), 'corregir a 3 no');
  cierto(!C.proporcionDudosa(0, 5), 'con el libro en cero no hay proporción: un primer conteo no es un error');
  cierto(C.proporcionDudosa(2.4, 0), 'contar cero con el libro en 2.4 sí se pregunta');
  cierto(!C.proporcionDudosa(2, 5, 4) && C.proporcionDudosa(2, 8, 4), 'el umbral se puede cambiar');
}

console.log('\n3 · ARRASTRAR LA MEDIDA');
{
  eq('un paso cada 6 px', C.pasoDeArrastre(30, 36, { px: 6, paso: 0.5, min: 0 }), 33);
  eq('hacia la izquierda, y nunca debajo del mínimo', C.pasoDeArrastre(1, -600, { px: 6, paso: 0.5, min: 0 }), 0);
  eq('Shift multiplica por diez', C.pasoDeArrastre(9, 12, { px: 6, paso: 1, mult: 10 }), 29);
  eq('los m² no se llenan de decimales falsos', C.pasoDeArrastre(0.72, 6 * 3, { px: 6, paso: 0.01 }), 0.75);
  eq('y respetan el máximo', C.pasoDeArrastre(19.99, 600, { px: 6, paso: 0.01, max: 20 }), 20);
  eq('un valor tecleado fuera de la rejilla conserva sus decimales', C.pasoDeArrastre(30.25, 6, { px: 6, paso: 0.5 }), 30.75);
}

console.log('\nLOS IMANES DEL DESLIZADOR');
{
  const T0 = 12528, o = { min: 0, max: T0, redondeo: 100, radio: 150, imanes: [{ v: T0 / 2, radio: T0 * .02 }, { v: T0 }] };
  eq('cerca del 50 % gana el 50 % exacto, aunque no sea redondo', C.imanar(6400, o), 6264);
  eq('fuera de los imanes, a cientos', C.imanar(4321, o), 4300);
  eq('el tope es el total', C.imanar(12500, o), 12528);
  eq('y nunca sale del rango', C.imanar(-50, o), 0);
  eq('entre dos imanes gana el más cercano', C.imanar(96, { imanes: [90, 100], radio: 10 }), 100);
  eq('los del autorizador: −5 % de 10,800', C.imanar(10200, { min: 8640, max: 11880, redondeo: 100, radio: 120, imanes: [10800, 10260, 9720, 9180] }), 10260);
  cierto(C.decaer(0, 40) === 0 && C.decaer(40, 40) > 18 && C.decaer(4000, 40) <= 40 && C.decaer(80, 40) < 31, 'la liga cede rápido y se frena contra los 40 px');
}

console.log('\nLOS RÓTULOS QUE CABEN');
{
  /* Colores del vectorizador, 2–24, en 300 px útiles: 23 marcas cada 12.5 px con rótulos de 14. */
  const marcas = Array.from({ length: 23 }, (_, i) => ({ x: 22 + i * 12.5, w: i + 2 >= 10 ? 14 : 7, prioridad: (i === 0 || i === 22) ? 2 : 0 }));
  const ver = C.marcasQueCaben(marcas, 6);
  cierto(ver[0] && ver[22], 'el primero y el último siempre');
  const puestas = marcas.filter((m, i) => ver[i]);
  cierto(puestas.every((m, i) => i === 0 || m.x - m.w / 2 >= puestas[i - 1].x + puestas[i - 1].w / 2), 'ningún rótulo pisa a otro');
  cierto(puestas.length >= 8 && puestas.length < 23, 'y caben varios, no todos (' + puestas.length + ' de 23)');
  eq('un imán gana sobre una marca común', C.marcasQueCaben([{ x: 10, w: 20 }, { x: 20, w: 20, prioridad: 1 }], 0), [false, true]);
}

console.log('\n20 · EL MEDIDOR QUIETO');
{
  const m = C.medidor({ valor: 2.4, max: 5, rayado: 1, meta: 3, muesca: 2 });
  eq('lleno, rayado, meta y muesca en fracciones', [m.v, m.r, m.meta, m.muesca], [.48, .2, .6, .4]);
  eq('lo que tiene dueño no pasa de lo que hay', C.medidor({ valor: 1, max: 5, rayado: 3 }).r, .2);
  eq('una meta que ya se alcanzó no pinta hueco', C.medidor({ valor: .8, meta: .5 }).meta, null);
  const neg = C.medidor({ valor: -1, max: 4, muesca: 1 });
  eq('el libro en rojo sale vacío y marcado', [neg.v, neg.bajoCero, neg.muesca], [0, true, .25]);
  eq('lo que se pasa del máximo se queda lleno', C.medidor({ valor: 9, max: 5 }).v, 1);
  const html = P.medidorHTML({ valor: 2.4, max: 5, rayado: 1, meta: 3, muesca: 2 });
  cierto(/aria-hidden="true"/.test(html) && /--v:0\.48;--r:0\.2;--meta:0\.6;--muesca:0\.4/.test(html), 'sin texto va aria-hidden, con sus cuatro variables');
  cierto(/role="img" aria-label="Cobrado 50 %"/.test(P.medidorHTML({ valor: .5, texto: 'Cobrado 50 %', tono: 'ok' })) &&
    / tono-ok/.test(P.medidorHTML({ valor: .5, tono: 'ok' })), 'con texto es una imagen con su frase, y lleva su tono');
  cierto(!/tono-/.test(P.medidorHTML({ valor: .5, tono: '<b>' })), 'un tono que no existe no entra como clase');
}

console.log('\n19 · LAS CASILLAS DEL CÓDIGO');
{
  const HEX = Object.assign({ n: 12 }, K.HEX);
  eq('pegar «a1b2-c3d4-e5f6» deja el código limpio', K.normalizar('a1b2-c3d4-e5f6', HEX), { valor: 'A1B2C3D4E5F6', rechazados: [], sobran: [] });
  eq('la O es cero y la I y la L son uno: lo que se lee mal del papel', K.normalizar('OIL0 abcd ef12', HEX).valor, '0110ABCDEF12');
  eq('lo que no es del alfabeto se rechaza, y se dice qué', K.normalizar('A1G2', HEX), { valor: 'A12', rechazados: ['G'], sobran: [] });
  eq('lo que sobra del largo también se rechaza, y se sabe que sobró (no que no va)', K.normalizar('A1B2C3D4E5F6A', HEX), { valor: 'A1B2C3D4E5F6', rechazados: ['A'], sobran: ['A'] });
  eq('el folio pegado donde va el código: la O de «COT» ya es un cero, y lo que no es hexadecimal se dice',
    K.normalizar('COT-0042@K7QM', HEX), { valor: 'C000427', rechazados: ['T', '@', 'K', 'Q', 'M'], sobran: [] });
  eq('agrupado de cuatro en cuatro', K.agrupar('A1B2C3D4E5F6', 4), 'A1B2-C3D4-E5F6');
  eq('«borrar» en minúsculas cuenta', K.normalizar('borrar', { n: 6, alfabeto: /[A-ZÑ]/ }).valor, 'BORRAR');
  eq('un alfabeto con la bandera g no se descompone entre letras', K.normalizar('ABAB', { n: 4, alfabeto: /[AB]/g }).valor, 'ABAB');
  const h = P.casillasCodigoHTML({ id: 'x', n: 12, grupo: 4 });
  cierto((h.match(/class="casilla"/g) || []).length === 12 && (h.match(/casillas-grupo/g) || []).length === 3,
    'el HTML trae doce casillas en tres grupos');
  cierto(/aria-hidden="true"/.test(h) && /autocapitalize="characters"/.test(h) && !/on[a-z]+="/.test(h),
    'dibujadas aria-hidden, con el campo en mayúsculas y sin manejadores en línea');
}

console.log('\n19 · EL TELÉFONO, CON LA MISMA REGLA QUE WHATSAPP');
{
  /* `telWhatsApp` sale del texto de entrega.js, como en pruebas/replicas.mjs; `telWa` se importa. */
  const ent = leer('js/cotizador/entrega.js');
  const a = ent.indexOf('function telWhatsApp(');
  let i = ent.indexOf('{', a), prof = 0, fuenteTel = '';
  for (; i < ent.length; i++) {
    const c = ent[i], s = ent[i + 1];
    if (c === '/' && s === '/') { i = ent.indexOf('\n', i); continue; }
    if (c === '/' && s === '*') { i = ent.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { for (i++; i < ent.length && ent[i] !== c; i++) if (ent[i] === '\\') i++; continue; }
    if (c === '{') prof++;
    if (c === '}' && --prof === 0) { fuenteTel = ent.slice(a, i + 1); break; }
  }
  const cot = vm.createContext({});
  vm.runInContext(fuenteTel, cot);
  const UI = await import('../js/nucleo/ui.js');
  const casos = ['', '  ', '33', '33 12', '3312345', '33 1234 5678', '+52 33 1234 5678', '+52 3328130092',
    '521 33 1234 5678', '+1 415 555 2671', 'ext. 204', '(33) 1234-5678', '1234567890123456', 'no tiene',
    '01 33 1234 5678', '044 33 1234 5678', '045 33 1234 5678', '00 52 33 1234 5678', '00 1 415 555 2671',
    '0 33 1234 5678', '01 03 1234 5678', '044 33 12', '+52 33 1234 56', '33 1234 56789'];
  const distintos = casos.filter(t => T.numeroWa(t) !== cot.telWhatsApp(t) || T.numeroWa(t) !== UI.telWa(t));
  eq('los ' + casos.length + ' teléfonos dan el mismo número en la pieza, el cotizador y la plataforma', distintos, []);

  const L = t => { const r = T.leer(t, cot.telWhatsApp); return [r.estado, r.nacional, T.contador(r)]; };
  eq('«+52 3328130092» queda en diez, con su palomita', L('+52 3328130092'), ['completo', '3328130092', '✓']);
  eq('  y se escribe «33 2813 0092»', T.formato('3328130092'), '33 2813 0092');
  eq('a medias cuenta los que van', L('33 2813'), ['faltan', '332813', '6/10']);
  eq('el 01 y el 044 de antes se quitan y el número queda completo', [L('01 33 1234 5678')[0], L('044 33 1234 5678')[1]], ['completo', '3312345678']);
  eq('«+52 33 1234 56» son diez dígitos para la regla y ocho para quien los tecleó: se revisa, sin palomita',
    L('+52 33 1234 56'), ['revisa', '33123456', '8/10']);
  eq('once dígitos sin «+» son casi siempre uno de más', L('33 1234 56789'), ['revisa', '', '11/10']);
  eq('con «+» y otra lada es internacional y completo', L('+1 415 555 2671'), ['internacional', '', '✓']);
  eq('  y mientras se escribe, dice que va', L('+1 415'), ['internacional-parcial', '', '+4']);
  eq('un teléfono de México no empieza con 0', L('0 33 1234 5678')[0], 'no');
  eq('  tampoco detrás del +52: sin palomita y sin reescribirlo en un número que la regla ya no abre',
    [L('+52 0248 0602 12'), L('5210000026866')[0]], [['no', '0248060212', '10/10'], 'no']);
  eq('vacío', L(''), ['vacio', '', '0/10']);
  eq('la frase de estado para el lector', [T.frase(T.leer('33 2813')), T.frase(T.leer('33 2813 009')), T.frase(T.leer('+52 33 1234 56'))],
    ['Faltan 4 dígitos', 'Falta 1 dígito', 'Después del +52 van 10 dígitos: llevas 8']);
  eq('el cursor se queda después del mismo número de DÍGITOS', [T.cursor('33 2813 0092', 2), T.cursor('33 2813 0092', 3), T.cursor('33 2813 0092', 10)], [2, 4, 12]);
  eq('agrupa dos, cuatro y cuatro también a medias', [T.formato('33'), T.formato('332'), T.formato('3328130')], ['33', '33 2', '33 2813 0']);
  const th = P.telefonoVivoHTML({ id: 'f-tel', valor: '+52 3328130092' });
  cierto(/value="33 2813 0092"/.test(th) && /tel-vivo completo/.test(th) && />✓</.test(th), 'el HTML del campo nace ya formateado y completo');

  /* Veinticuatro casos escogidos a mano prueban lo que a alguien se le ocurrió. La regla tiene
     seis ramas y los números se dictan de mil maneras, así que además se generan cinco mil
     teléfonos —con prefijos de antes, ladas de país, separadores, letras y largos de 0 a 17— y
     en TODOS la pieza tiene que leer lo mismo que el cotizador y que la plataforma. Con una
     semilla fija: si algo falla, falla igual la siguiente vez. */
  let semilla = 20260927;
  const azar = n => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  const uno = xs => xs[azar(xs.length)];
  const genera = () => {
    let t = uno(['', '', '', '+', '+ ', '00', '00 ', '01 ', '044 ', '045', '0', '(', 'Tel. ']);
    t += uno(['', '', '52', '52 1', '521', '1', '44', '34 ', '52 ']);
    const n = azar(14);
    for (let i = 0; i < n; i++) {
      t += String(azar(10));
      if (azar(5) === 0) t += uno([' ', '-', '.', ') ', ' ', '/']);
    }
    if (azar(12) === 0) t += uno([' ext 12', 'x', ' cel', '#']);
    return t;
  };
  /* telIncompleto(), la que frena el paso 1 del cotizador, también del texto de proceso.js. */
  const proc = leer('js/cotizador/proceso.js');
  const lin = proc.match(/function telIncompleto\([^)]*\)\{[^\n]*\}/);
  const cot2 = vm.createContext({});
  if (lin) vm.runInContext(lin[0], cot2);
  cierto(!!lin && typeof cot2.telIncompleto === 'function', 'telIncompleto() se lee de proceso.js');
  const distintos2 = [], falsaPalomita = [], noVuelve = [], cuentaMal = [];
  for (let i = 0; i < 5000; i++) {
    const t = genera();
    const a = T.numeroWa(t), b = cot.telWhatsApp(t), c = UI.telWa(t);
    if (a !== b || a !== c) distintos2.push([t, a, b, c]);
    const r = T.leer(t, cot.telWhatsApp);
    /* El ✓ nunca sobre algo que el cotizador todavía frena, ni sobre algo que WhatsApp no abre. */
    if (r.completo && (!r.wa || (cot2.telIncompleto && cot2.telIncompleto(t)))) falsaPalomita.push(t);
    /* Lo que la pieza escribe en el campo (el nacional con espacios) es la MISMA línea para la
       regla: reescribir el campo no puede cambiar a quién le llega el chat. El único cambio que
       se permite es quitar el «1» del formato viejo (521 → 52), que es la misma línea desde
       2019 y es justo lo que C8 pide: «+52 1 33…» queda «33 …». */
    if (r.estado === 'completo') {
      const w2 = cot.telWhatsApp(T.formato(r.nacional));
      if (w2 !== r.wa && !(r.wa.length === 13 && r.wa.startsWith('521') && w2 === '52' + r.wa.slice(3))) noVuelve.push(t);
    }
    if (r.estado === 'faltan' && !(r.cuenta < 10)) cuentaMal.push(t);
  }
  eq('5,000 teléfonos generados: la pieza, el cotizador y la plataforma leen el mismo número', distintos2.slice(0, 5), []);
  eq('  ninguno lleva ✓ si el cotizador lo frena o si WhatsApp no lo abre', falsaPalomita.slice(0, 5), []);
  eq('  el número que la pieza deja escrito le llega al mismo chat', noVuelve.slice(0, 5), []);
  eq('  y «faltan» siempre cuenta menos de diez', cuentaMal.slice(0, 5), []);
}

console.log('\nLAS CUENTAS AGUANTAN LO QUE NO SE ESCOGIÓ A MANO');
{
  let semilla = 7;
  const azar = n => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  const money = n => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const malPlan = [], malPaso = [], malIman = [], malMarca = [], malMed = [];
  for (let i = 0; i < 3000; i++) {
    const a = money(azar(2000000) / 100), b = money(azar(2000000) / 100);
    const plan = C.plan(a, b);
    /* El plan pinta exactamente el texto nuevo, cada tira sale de 0–9 y llega a su cifra. */
    if (plan.map(x => x.ch).join('') !== b || plan.some(x => x.digito && (x.desde < 0 || x.desde > 9 || x.hasta !== +x.ch))) malPlan.push([a, b]);
    const paso = [0.5, 1, 0.01, 0.1][azar(4)], v0 = azar(400) * paso, dx = azar(800) - 400, min = 0, max = azar(2) ? 20 : Infinity;
    const v = C.pasoDeArrastre(v0, dx, { px: 6, paso, min, max });
    const pasos = (v - v0) / paso;
    if (v < min || v > max || (v > min && v < max && Math.abs(pasos - Math.round(pasos)) > 1e-6)) malPaso.push([v0, dx, paso, v]);
    const T0 = 1000 + azar(50000), o = { min: 0, max: T0, redondeo: 100, radio: 150, imanes: [{ v: T0 / 2, radio: T0 * .02 }, { v: T0 }] };
    const im = C.imanar(azar(T0 + 2000) - 1000, o);
    if (im < 0 || im > T0 || !(im === T0 / 2 || im === T0 || im % 100 === 0 || im === 0)) malIman.push(im);
    const marcas = Array.from({ length: 2 + azar(30) }, (_, j) => ({ x: 22 + j * (3 + azar(20)), w: 4 + azar(40), prioridad: azar(3) }));
    const ver = C.marcasQueCaben(marcas, 6), puestas = marcas.filter((m, j) => ver[j]);
    if (puestas.some((m, j) => puestas.some((q, k) => k !== j && Math.abs(m.x - q.x) < (m.w + q.w) / 2 + 6 - 1e-9))) malMarca.push(marcas.length);
    const m = C.medidor({ valor: azar(300) - 100, max: 1 + azar(200), rayado: azar(300), meta: azar(3) ? azar(300) : null, muesca: azar(300) });
    if (![m.v, m.r].every(x => x >= 0 && x <= 1) || m.r > m.v || (m.meta != null && (m.meta <= m.v || m.meta > 1)) || (m.muesca != null && (m.muesca < 0 || m.muesca > 1))) malMed.push(m);
  }
  eq('3,000 totales al azar: la rueda pinta el texto nuevo y cada tira va de una cifra a otra', malPlan.slice(0, 3), []);
  eq('3,000 arrastres: siempre dentro del rango y en pasos enteros del campo', malPaso.slice(0, 3), []);
  eq('3,000 anticipos: el imán deja el 50 %, el total o un múltiplo de cien, nunca fuera del rango', malIman.slice(0, 3), []);
  eq('3,000 rieles: ningún rótulo pisa a otro', malMarca.slice(0, 3), []);
  eq('3,000 medidores: todas las fracciones entre 0 y 1, y el rayado nunca pasa del lleno', malMed.slice(0, 3), []);
}

console.log('\n18 · LAS OPCIONES COMO CADENA');
{
  const h = P.opcionesDeslizantesHTML({ id: 'rv-cuentas', etiqueta: 'Cuenta de cobro', oculto: 'rv-cuenta', valor: 'Elias BBVA',
    opciones: [{ v: 'Moni MPago', sub: 'con IVA' }, { v: 'Elias BBVA', sub: 'sin IVA' }] });
  cierto(/role="radiogroup"/.test(h) && /aria-label="Cuenta de cobro"/.test(h), 'un radiogroup con su nombre');
  cierto(/aria-checked="true" tabindex="0" data-v="Elias BBVA"/.test(h) && /aria-checked="false" tabindex="-1" data-v="Moni MPago"/.test(h),
    'solo la elegida entra al tabulador');
  cierto(/<input type="hidden" id="rv-cuenta" value="Elias BBVA">/.test(h), 'y el valor va en el hidden, como lo lee datosParaLaHoja()');
  const sin = P.opcionesDeslizantesHTML({ opciones: [{ v: 'A', apagada: true }, { v: 'B' }] });
  cierto(/tabindex="-1" data-v="A" aria-disabled="true"/.test(sin) && /tabindex="0" data-v="B"/.test(sin),
    'sin elegida, entra la primera que se puede elegir');
  cierto(/&lt;b&gt;/.test(P.opcionesDeslizantesHTML({ opciones: [{ v: '<b>' }] })), 'lo interpolado pasa por esc()');
  const ton = P.opcionesDeslizantesHTML({ opciones: [{ v: 'Elias BBVA', sub: 'sin IVA', tono: 'av' }, { v: 'X', tono: '"><img>' }] });
  cierto(/class="chip tono-av"/.test(ton) && !/tono-"/.test(ton) && !/<img>/.test(ton), 'el tono de la línea de abajo entra como clase, y uno que no existe no entra');
}

console.log(`\n${fallas === 0 ? 'Las piezas de números, medidas y campos cuentan bien.' : fallas + ' fallo(s).'}`);
process.exit(fallas ? 1 : 0);
