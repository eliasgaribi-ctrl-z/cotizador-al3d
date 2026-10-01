/* LAS PIEZAS QUE SEÑALAN, EXPLICAN Y SELLAN: LO QUE SE PUEDE PROBAR SIN NAVEGADOR.

   La sección 4 de js/piezas.js la van a llamar unas veinte pantallas. Casi todo es interfaz y
   se prueba en pruebas/navegador/piezas-senales.mjs, pero hay cuentas que no se ven cuando
   fallan: un globo que en 360 px se sale ocho píxeles por la derecha, una búsqueda que marca
   «Panadería» una letra corrida, un «&amp;» que se rompe al resaltar «amp», un riel que dice
   «paso actual» en dos pasos. Salen números y marcado plausibles, y se descubren delante del
   cliente. Esto las mira en node.

   Y lo primero: el archivo se carga en node SIN window y no truena. Las pruebas de otros
   archivos leen js/piezas.js, y un guion clásico que toca el DOM al cargar las tumbaría a todas.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA = join(RAIZ, 'js/piezas.js');
const FUENTE = readFileSync(RUTA, 'utf8');

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + nombre + (ok ? '' : '  → dio ' + JSON.stringify(real) + ', esperaba ' + JSON.stringify(esperado)));
  if (!ok) fallos++;
};
const cierto = (nombre, v) => eq(nombre, !!v, true);

console.log('\nSE CARGA EN NODE SIN WINDOW');
{
  let error = null;
  const caja = {};
  try { vm.runInNewContext(FUENTE, caja, { filename: 'js/piezas.js' }); } catch (e) { error = e.message; }
  eq('como guion clásico, sin window: no truena', error, null);
  eq('y no deja nada colgado en el ámbito global', Object.keys(caja), []);
  error = null;
  try { await import(pathToFileURL(RUTA).href + '?sin-window'); } catch (e) { error = e.message; }
  eq('importado como módulo, tampoco', error, null);
}

/* Un documento de mentira que contesta a todo con nada: la sección 4 no toca el DOM al cargar,
   pero las otras tres secciones se escriben a la vez y alguna podría colgar un oyente al cargar.
   Con esto, un addEventListener o un getElementById al cargar no tumba esta prueba. */
const nada = new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : nada),
  apply: () => nada,
  construct: () => nada,
});
const ventana = { document: nada, matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {},
  setTimeout, clearTimeout, performance, navigator: {} };
ventana.window = ventana;
{
  let error = null;
  try { vm.runInNewContext(FUENTE, { window: ventana }, { filename: 'js/piezas.js' }); } catch (e) { error = e.message; }
  eq('con un window de mentira, carga', error, null);
}
const P = ventana.Piezas || {};
const NOMBRES = ['vistazo', 'vistazoHTML', 'porqueHTML', 'nombres', 'encenderNeon', 'traza', 'trazaHTML', 'riel', 'rielHTML',
  'senalar', 'reticulaHTML', 'cargaLogo', 'cargaLogoHTML', 'letrero', 'letreroHTML', 'plegar', 'coincide', 'resaltar',
  'esNumerica', 'fichas', 'fichasHTML'];
eq('y cuelga de window.Piezas todas las piezas de la sección 4', NOMBRES.filter(n => typeof P[n] !== 'function'), []);

console.log('\nLA SECCIÓN 4 SE QUEDA EN SU SITIO');
{
  const i = FUENTE.indexOf('4 · SEÑALAR, EXPLICAR Y SELLAR'), f = FUENTE.indexOf('/* ── fin de 4 ── */');
  cierto('tiene su encabezado y su marca de fin, en ese orden', i > 0 && f > i);
  const s4 = FUENTE.slice(i, f);
  const sinComentarios = s4.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* La plataforma no deja correr manejadores en línea (su política no trae 'unsafe-inline'): un
     onclick="…" en el marcado que genera esta sección sería un botón muerto sin error. */
  eq('no escribe manejadores en línea (on…="…") en su marcado', (sinComentarios.match(/[\s"'<]on[a-z]{3,}\s*=\s*\\?["']/g) || []), []);
  /* Dos secciones que cuelgan la misma pieza de P: la segunda pisa a la primera sin avisar. */
  const repetidas = NOMBRES.filter(n => (FUENTE.match(new RegExp('\\bP\\.' + n + '\\s*=[^=]', 'g')) || []).length !== 1);
  eq('cada nombre de la sección se asigna una sola vez en todo el archivo', repetidas, []);
  cierto('lo propio vive dentro de un bloque { … }: un const suyo no choca con los de otras secciones',
    /SELLAR\s*=+\s*\*\/[\s\S]*?\*\/\s*\{/.test(s4.slice(0, 5000)) && /\n  \}\n\s*$/.test(s4));
}

console.log('\nBUSCAR SIN ACENTOS NI MAYÚSCULAS, Y MARCAR DONDE CAE');
eq('«panaderia» encuentra «Panadería La Espiga»', P.coincide('Panadería La Espiga', 'panaderia'), true);
eq('«OPTICA» encuentra «Óptica Visión»', P.coincide('Óptica Visión', 'OPTICA'), true);
eq('«ñu» encuentra «Ñuñoa» y «nu» también', [P.coincide('Ñuñoa', 'ñu'), P.coincide('Ñuñoa', 'nu')], [true, true]);
eq('una búsqueda vacía coincide con todo', P.coincide('lo que sea', '   '), true);
eq('lo que no está, no está', P.coincide('Gym Titanio', 'panaderia'), false);
eq('la marca cae en «Panadería», con su acento, aunque se buscó sin él',
  P.resaltar('Panadería La Espiga', 'panaderia'), '<mark class="coincide">Panadería</mark> La Espiga');
eq('marca todas las veces que aparece', P.resaltar('Caja de luz · caja nube', 'caja'),
  '<mark class="coincide">Caja</mark> de luz · <mark class="coincide">caja</mark> nube');
eq('los espacios de más en la búsqueda no cuentan', P.resaltar('La Espiga', '  la   espiga '), '<mark class="coincide">La Espiga</mark>');
eq('escapa por tramos: buscar «amp» no rompe un &', P.resaltar('Los Primos & Hijos', 'amp'), 'Los Primos &amp; Hijos');
eq('y buscar «&» marca el & ya escapado', P.resaltar('Los Primos & Hijos', '&'), 'Los Primos <mark class="coincide">&amp;</mark> Hijos');
eq('un nombre con marcado no entra como marcado', P.resaltar('<b>x</b>', 'x'), '&lt;b&gt;<mark class="coincide">x</mark>&lt;/b&gt;');
eq('sin búsqueda, solo escapa', P.resaltar('A & B', ''), 'A &amp; B');

console.log('\nUN TELÉFONO SE BUSCA COMO SE PEGA');
eq('«331234» es búsqueda de números', P.esNumerica('331234'), true);
eq('«33 1234» también', P.esNumerica('33 1234'), true);
eq('«COT-0042» no: lleva letras', P.esNumerica('COT-0042'), false);
eq('«331234» encuentra «33 1234 5678»', P.coincide('33 1234 5678', '331234'), true);
eq('y lo marca sin los espacios de en medio fuera', P.resaltar('33 1234 5678', '331234'), '<mark class="coincide">33 1234</mark> 5678');
eq('«2813 0092» encuentra el +52 pegado', P.coincide('+52 33 2813 0092', '2813 0092'), true);
eq('un texto sin dígitos no coincide con una búsqueda de números', P.coincide('Gym Titanio', '0092'), false);
eq('plegar lleva la cuenta de dónde empieza cada letra', P.plegarTexto('Óp', false), { txt: 'op', ini: [0, 1], fin: [1, 2] });
eq('y no se corre con un emoji delante', P.resaltar('🔥 Óptica', 'optica'), '🔥 <mark class="coincide">Óptica</mark>');

console.log('\nLAS FICHAS DE FILTRO');
{
  const h = P.fichasHTML([{ id: 'todas', texto: 'Todas', n: 41 }, { id: 'pdf', texto: 'Sin PDF', n: 3 }], { activo: 'pdf', etiqueta: 'Filtrar' });
  cierto('son botones con aria-pressed', /<button type="button" class="chip ficha" data-ficha="todas" aria-pressed="false">/.test(h));
  cierto('la activa dice que está presionada', /data-ficha="pdf" aria-pressed="true"/.test(h));
  cierto('con su conteo', h.includes('Sin PDF <span class="ficha-n">3</span>'));
  cierto('en un grupo con nombre', h.startsWith('<div class="fichas" role="group" aria-label="Filtrar">'));
  cierto('el texto se escapa', P.fichasHTML([{ id: 'x', texto: '<i>' }]).includes('&lt;i&gt;'));
}

console.log('\nEL GLOBO NO SE SALE DE UN TELÉFONO DE 360');
{
  const V = { w: 360, h: 740 };
  const ancla = (left, top, w = 60, h = 44) => ({ left, top, width: w, height: h, right: left + w, bottom: top + h });
  let u = P.vistazo.ubicar(ancla(20, 100), { w: 300, h: 160 }, V, {});
  eq('abajo del ancla, pegado a su izquierda, con 8 px de hueco', [u.x, u.y, u.lado, u.alto], [20, 152, 'abajo', null]);
  u = P.vistazo.ubicar(ancla(300, 100), { w: 300, h: 160 }, V, {});
  eq('un ancla en el borde derecho corre el globo para que quepa (12 px de margen)', u.x, 360 - 12 - 300);
  u = P.vistazo.ubicar(ancla(300, 100, 44), { w: 200, h: 120 }, V, { alinear: 'fin' });
  eq('alineado al final, su borde derecho es el del ancla (el menú de la cuenta)', u.x + 200, 344);
  u = P.vistazo.ubicar(ancla(150, 100), { w: 120, h: 80 }, V, { alinear: 'centro' });
  eq('centrado, el centro es el del ancla', u.x + 60, 180);
  u = P.vistazo.ubicar(ancla(20, 640), { w: 300, h: 160 }, V, {});
  eq('abajo no cabe y arriba sí: se voltea', [u.lado, u.y], ['arriba', 640 - 8 - 160]);
  u = P.vistazo.ubicar(ancla(20, 10), { w: 300, h: 160 }, V, { lado: 'arriba' });
  eq('arriba no cabe: baja', u.lado, 'abajo');
  u = P.vistazo.ubicar(ancla(20, 300), { w: 300, h: 900 }, V, {});
  cierto('un globo más alto que la pantalla se limita y se desplaza por dentro', u.alto != null && u.y >= 12 && u.y + u.alto <= 740 - 12);
  u = P.vistazo.ubicar(ancla(0, 100), { w: 500, h: 100 }, V, {});
  eq('uno más ancho que la pantalla se queda en el margen, con el ancho de la pantalla', [u.x, u.ancho], [12, 336]);
  u = P.vistazo.ubicar(ancla(20, 5, 60, 20), { w: 300, h: 200 }, { w: 360, h: 120 }, {});
  cierto('con el teclado abierto (120 px de alto) no se sale ni por arriba ni por abajo', u.y >= 12 && u.y + (u.alto || 200) <= 108);
  u = P.vistazo.ubicar(ancla(20, 900), { w: 300, h: 100 }, V, {});
  cierto('un ancla que ya se fue de la vista no saca el globo de la pantalla', u.y + 100 <= 740 - 12);
}

console.log('\nLAS ESQUINAS CAEN SOBRE EL CAMPO');
{
  const e = P.senalar.esquinas({ left: 100, top: 200, width: 150, height: 44 }, 4);
  eq('arriba a la izquierda, a 4 px', e[0], { x: 96, y: 196 });
  eq('arriba a la derecha: la caja de 14 px termina a 4 px del borde', e[1], { x: 100 + 150 + 4 - 14, y: 196 });
  eq('abajo a la izquierda', e[2], { x: 96, y: 200 + 44 + 4 - 14 });
  eq('abajo a la derecha', e[3], { x: 240, y: 234 });
  const lejos = P.senalar.esquinas({ left: 100, top: 200, width: 150, height: 44 }, 22);
  eq('de donde vienen (18 px más abiertas) es el mismo marco, más grande', [lejos[0].x, lejos[3].y], [78, 252]);
}

console.log('\nEL RELOJ DE LA TRAZA');
eq('menos de un segundo no se escribe', P.traza.reloj(400, 's'), '');
eq('14.7 s son «14 s»', P.traza.reloj(14700, 's'), '14 s');
eq('en décimas, «2.3 s» (como se escribe en México)', P.traza.reloj(2340, 'ds'), '2.3 s');
eq('pasado el minuto, en minutos', P.traza.reloj(125000, 's'), '2 min 05 s');
eq('sin reloj, nada', P.traza.reloj(5000, false), '');
{
  const h = P.trazaHTML({ etiqueta: 'Arranque', pasos: [{ clave: 'a', texto: 'Tu sesión', estado: 'ok' }, { clave: 'b', texto: '<b>', estado: 'raro' }] });
  cierto('la traza fija lleva su región viva aparte, no sobre la lista', /<ol class="traza-pasos">/.test(h) && /<p class="solo-voz traza-voz" role="status" aria-live="polite">/.test(h) && !/<ol[^>]*aria-live/.test(h));
  cierto('el reloj no se lee en voz alta', /class="traza-reloj" aria-hidden="true"/.test(h));
  cierto('un estado desconocido queda en espera', /data-clave="b" data-estado="espera"/.test(h));
  cierto('y el texto se escapa', h.includes('&lt;b&gt;'));
}

console.log('\nEL RIEL DE PASOS');
{
  const h = P.rielHTML(['Cliente', 'Partidas', 'Revisar', 'Entregar'], { forma: 'horizontal', actual: 1, etiqueta: 'Pasos' });
  eq('sin estados, los de antes van hechos, uno actual y el resto pendientes',
    [...h.matchAll(/data-estado="(\w+)"/g)].map(m => m[1]), ['hecho', 'actual', 'pendiente', 'pendiente']);
  eq('uno y solo uno lleva aria-current="step"', (h.match(/aria-current="step"/g) || []).length, 1);
  cierto('es una lista ordenada con nombre', h.startsWith('<ol class="riel riel-h" aria-label="Pasos">'));
  cierto('cada paso dice su estado en palabras al lector', h.includes('<span class="solo-voz riel-e"> · hecho</span>'));
  const t = P.rielHTML([{ texto: 'PDF', estado: 'hecho' }, { texto: 'Chat', estado: 'tarde' }, { texto: 'Venta', estado: 'espera' }], { tocable: true });
  eq('con estados escritos se respetan (tarde, espera)', [...t.matchAll(/data-estado="(\w+)"/g)].map(m => m[1]), ['hecho', 'tarde', 'espera']);
  eq('tocable: cada paso es un botón', (t.match(/<button type="button" class="riel-boton" data-riel-i="\d">/g) || []).length, 3);
  eq('sin actual escrito y con estados, nadie inventa un paso actual', (t.match(/aria-current/g) || []).length, 0);
  cierto('el texto se escapa y el extra entra como HTML de la pantalla',
    P.rielHTML([{ texto: '<x>', extra: '<button type="button">Marcar</button>' }]).includes('&lt;x&gt;') &&
    P.rielHTML([{ texto: 'a', extra: '<button type="button">Marcar</button>' }]).includes('<div class="riel-extra"><button type="button">Marcar</button></div>'));
  const m = P.rielHTML(['Propuesta', 'PDF', 'Chat', 'Venta'], { forma: 'mini', actual: 1 });
  cierto('mini: una imagen con la lista entera en su nombre', m.includes('role="img" aria-label="Propuesta: hecho · PDF: paso actual · Chat: pendiente · Venta: pendiente"'));
  cierto('y el punto lleno lleva palomita, no solo color', /data-estado="hecho"><svg class="riel-palomita"/.test(m));
  const k = P.rielHTML([{ texto: 'Cortar', pos: -1 }, { texto: 'Listo', pos: 7 }], { forma: 'marcas', hoy: 0.5 });
  eq('marcas: la posición se queda entre 0 y 1', [...k.matchAll(/--riel-pos:([\d.]+)/g)].map(x => +x[1]), [0, 1, 0.5]);
  cierto('y el dibujo va aria-hidden: la frase de al lado es la que se lee', k.includes('aria-hidden="true"'));
}

console.log('\nEL LETRERO: LA LUZ CORRECTA DEL MATERIAL');
{
  const al = P.letreroHTML('PANADERÍA', { material: 'aluminio', luz: 'fria' });
  cierto('aluminio lleva LED posterior', al.includes('class="letrero letrero-aluminio luz-fria"') && al.includes('aluminio con LED posterior'));
  const ac = P.letreroHTML('CAFÉ', { material: 'acrilico', luz: 'calida' });
  cierto('acrílico lleva LED frontal', ac.includes('letrero-acrilico luz-calida') && ac.includes('acrílico con LED frontal'));
  cierto('se lee como imagen ilustrativa', al.includes('role="img" aria-label="Letrero ilustrativo: «PANADERÍA»'));
  cierto('sin luz lo dice', P.letreroHTML('X', { luz: 'ninguna' }).includes('sin-luz') && P.letreroHTML('X', { luz: 'ninguna' }).includes('aluminio sin luz'));
  cierto('una luz de color va como variable', P.letreroHTML('X', { luz: '#ff0000' }).includes('--letrero-luz:#ff0000'));
  cierto('el color de la cara, también', P.letreroHTML('X', { color: '#1a1d33' }).includes('--letrero-cara:#1a1d33'));
  cierto('con pared, dice «Ilustrativo»', P.letreroHTML('X', { pared: true }).includes('<span class="letrero-nota" aria-hidden="true">Ilustrativo</span>'));
  cierto('el texto se escapa', P.letreroHTML('<A&B>').includes('&lt;A&amp;B&gt;'));
  eq('una letra de 45 px de alto con la H al 0.72 pide 62.5 px de cuerpo', P.letrero.tamLetra(45, 0.72), 62.5);
  eq('y sin razón medida usa 0.72', P.letrero.tamLetra(36), 50);
  cierto('letreroHTML con alto pone ese cuerpo', P.letreroHTML('X', { alto: 36 }).includes('font-size:50.0px'));
}

console.log('\nEL GLOBO, EL «?» Y LA CARGA COMO CADENA');
{
  const v = P.vistazoHTML({ id: 'g1', titulo: 'Por qué "2.5"', cuerpo: '<p>x</p>' });
  cierto('el globo es un popover manual con rol de diálogo', v.includes('id="g1" popover="manual" role="dialog"'));
  cierto('su nombre se escapa', v.includes('aria-label="Por qué &quot;2.5&quot;"'));
  cierto('y se puede enfocar para que el lector lo lea', v.includes('tabindex="-1"'));
  cierto('con rol de nota, lo dice', P.vistazoHTML({ id: 'n', rol: 'nota' }).includes('role="note" data-rol="nota"'));
  const q = P.porqueHTML({ id: 'pq', etiqueta: 'Por qué ese plazo', cuerpo: '<ul><li>a</li></ul>' });
  cierto('el «?» abre su globo por data-vistazo, sin manejador en línea', q.includes('data-vistazo="pq"') && !/onclick/.test(q));
  cierto('y anuncia que abre un diálogo y si está abierto', q.includes('aria-haspopup="dialog" aria-expanded="false" aria-controls="pq"'));
  const a = P.cargaLogoHTML({ etiqueta: 'Consultando' }), b = P.cargaLogoHTML();
  const id = s => (s.match(/filter id="([^"]+)"/) || [])[1];
  cierto('cada carga lleva su propio filtro: dos en la página no se pisan', id(a) && id(b) && id(a) !== id(b) && a.includes(`url(#${id(a)})`));
  cierto('con etiqueta es una región de estado; sin ella, adorno', a.includes('role="status"') && b.includes('aria-hidden="true"'));
  cierto('nace esperando', a.includes('data-carga="espera"'));
  cierto('la retícula es adorno', P.reticulaHTML().includes('aria-hidden="true"'));
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nLas piezas que señalan cuentan bien sin navegador.');
process.exit(fallos ? 1 : 0);
