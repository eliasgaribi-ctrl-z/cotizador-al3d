/* El anidador acomoda de verdad, en milímetros, y recoge lo que le deja el cotizador.
 *
 * Lo que aquí se prueba es lo que no se ve leyendo el código y sí se rompe en silencio:
 *
 *   1. Que el motor ARRANQUE. Corre en Web Workers que se crean por URL —js/lib/eval.js— y
 *      cargan sus dependencias con importScripts() relativo a esa URL. Una carpeta movida o
 *      un archivo que falte no da error en la página: da un cálculo que nunca termina.
 *   2. Que las UNIDADES se respeten de punta a punta: un SVG que dice 300 mm entra como 300 mm,
 *      se acomoda en una lámina en mm y sale con width="100mm". Antes de esto el motor recibía
 *      las unidades del archivo tal cual y una lámina de 1 220 «cabía» una pieza de 1 200 px.
 *   3. Que lo que no es una medida —px, nada— NO se adivine, se pida.
 *   4. Que el trazo que deja el vectorizador del cotizador se recoja al abrir y se borre, para
 *      que la siguiente apertura no traiga el de la vez pasada.
 *
 * Uso:  PUERTO=8814 node pruebas/navegador/anidador.mjs
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX' });
const p = await ctx.newPage();
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const errs = []; p.on('pageerror', e => errs.push(e.message));

/* Seis piezas en milímetros, con la tinta de (10,10) a (290,190): 280 × 180 mm. La «O» es un
   trazo compuesto con hueco, que el motor tiene que partir en contorno y agujero y seguir
   contando como UNA pieza. El primer rectángulo trae un onmouseover, como el que puede traer
   un SVG que llega de fuera: tiene que salir del acomodo y del archivo de corte sin él. */
const SVG_MM = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="200mm" viewBox="0 0 300 200">
  <title>prueba</title>
  <rect x="10" y="10" width="80" height="40" onmouseover="window.__pwn='hover'"/>
  <rect x="100" y="10" width="80" height="40"/>
  <rect x="190" y="10" width="80" height="40"/>
  <circle cx="30" cy="100" r="20"/>
  <circle cx="90" cy="100" r="20"/>
  <path fill-rule="evenodd" d="M230 130h60v60h-60zM245 145h30v30h-30z"/>
</svg>`;
const SVG_PX = `<svg xmlns="http://www.w3.org/2000/svg" width="400px" height="200px" viewBox="0 0 400 200">
  <rect x="0" y="0" width="150" height="200"/><rect x="250" y="0" width="150" height="200"/>
</svg>`;
const SVG_TEXTO = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <defs><symbol id="s"><rect width="10" height="10"/></symbol></defs>
  <text x="5" y="20">AL3D</text><use href="#s" x="50" y="10"/><rect x="5" y="30" width="40" height="15"/>
</svg>`;
const SVG_GRANDE = `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="200mm" viewBox="0 0 200 200">
  <rect x="10" y="10" width="150" height="150"/>
</svg>`;

const estado = () => p.evaluate(() => window.Anidador.estado());
const cargar = (svg, nombre) => p.evaluate(([s, n]) => window.Anidador.cargarTexto(s, n), [svg, nombre]);
const escribir = async (sel, v) => { await p.fill(sel, ''); await p.type(sel, String(v)); };
async function esperar(cond, ms = 90000, paso = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await cond()) return true; await p.waitForTimeout(paso); }
  return false;
}
/* Los números de los pasos visibles, como se PINTAN. Los pone un contador de CSS, así que el
   DOM no los tiene y getComputedStyle solo devuelve «counter(an-paso)»; el árbol de
   accesibilidad de Chrome sí trae el texto ya resuelto. Las fichas van con aria-hidden (el
   número no se lee en voz alta), y se les quita solo mientras se mira. */
const cdp = await ctx.newCDPSession(p);
async function numerosDePaso() {
  await p.evaluate(() => document.querySelectorAll('.an-num').forEach(s => s.removeAttribute('aria-hidden')));
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.an-paso:not([hidden]) .an-num' });
  const back = [];
  for (const nodeId of nodeIds) back.push((await cdp.send('DOM.describeNode', { nodeId })).node.backendNodeId);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const porId = new Map(nodes.map(n => [n.nodeId, n]));
  const texto = n => !n ? '' : (n.role && n.role.value === 'StaticText') ? n.name.value : (n.childIds || []).map(c => texto(porId.get(c))).join('');
  const out = back.map(b => texto(nodes.find(n => n.backendDOMNodeId === b)));
  await p.evaluate(() => document.querySelectorAll('.an-num').forEach(s => s.setAttribute('aria-hidden', 'true')));
  return out.join(' ');
}

await p.goto(B + '/anidador-vectores/', { waitUntil: 'load' });
await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
await p.goto(B + '/anidador-vectores/', { waitUntil: 'load' });
await p.waitForTimeout(600);

// ── 1. Recién abierta ──────────────────────────────────────────────────────
console.log('\nRECIÉN ABIERTA');
(await p.evaluate(() => typeof window.Anidador === 'object' && typeof window.SvgNest === 'object'))
  ? bien('la interfaz y el motor cargaron') : mal('falta window.Anidador o window.SvgNest: algún <script> no cargó');
(await p.evaluate(() => document.getElementById('an-ir').disabled))
  ? bien('sin archivo, «Acomodar las piezas» está apagado') : mal('el botón principal está encendido sin archivo');
(await p.evaluate(() => document.getElementById('an-sec-medida').hidden))
  ? bien('y el paso de la medida no se enseña todavía') : mal('el paso 2 se ve sin archivo');
(await numerosDePaso()) === '1 2'
  ? bien('los pasos a la vista se numeran 1 y 2: sin el de la medida, «La hoja» es el 2 y no el 3') : mal('los pasos a la vista dicen «' + await numerosDePaso() + '» y son 1 y 2');

// ── 2. Un SVG en milímetros ────────────────────────────────────────────────
console.log('\nUN SVG QUE DICE SUS MEDIDAS');
(await cargar(SVG_MM, 'prueba.svg')) ? bien('el SVG en mm se cargó') : mal('cargarTexto devolvió false con un SVG válido');
let e = await estado();
e.archivo && e.archivo.piezas === 6 ? bien('cuenta 6 piezas: tres rectángulos, dos círculos y una «O» con su hueco como UNA')
                                    : mal('contó ' + (e.archivo && e.archivo.piezas) + ' piezas y son 6');
e.archivo && e.archivo.origen === 'archivo' && Math.abs(e.archivo.k - 1) < 1e-9
  ? bien('la escala salió del archivo: 1 mm por unidad') : mal('escala ' + JSON.stringify(e.archivo && { k: e.archivo.k, origen: e.archivo.origen }));
const anchoD = await p.inputValue('#an-ancho-d'), altoD = await p.inputValue('#an-alto-d');
anchoD === '280' && altoD === '180'
  ? bien('el paso 2 llegó lleno con la tinta: 280 × 180 mm') : mal('el paso 2 dice ' + anchoD + ' × ' + altoD + ' y la tinta es 280 × 180');
(await p.evaluate(() => !document.getElementById('an-sec-medida').hidden && !document.getElementById('fld-ancho-d').classList.contains('falta')))
  ? bien('se enseña sin ámbar, porque no falta nada') : mal('el paso 2 está oculto o en ámbar con la medida ya puesta');
(await numerosDePaso()) === '1 2 3' ? bien('y con él los pasos se vuelven 1, 2 y 3') : mal('con la medida a la vista, los pasos dicen «' + await numerosDePaso() + '»');
(await p.evaluate(() => document.getElementById('an-st-diseno').textContent)) === '280 × 180 mm'
  ? bien('y la ficha del diseño dice 280 × 180 mm') : mal('la ficha del diseño dice «' + await p.evaluate(() => document.getElementById('an-st-diseno').textContent) + '»');

// ── 3. Una hoja chica para obligar a dos ───────────────────────────────────
console.log('\nLA HOJA');
const hojaOn = () => p.evaluate(() => document.querySelector('.an-tile.on').getAttribute('data-hoja'));
(await hojaOn()) === '1200x2400' ? bien('de entrada, la hoja completa de 1.20 × 2.40') : mal('la hoja de entrada es ' + await hojaOn());
(await p.inputValue('#an-ancho')) === '1200' && (await p.inputValue('#an-alto')) === '2400' ? bien('con sus 1200 × 2400 mm en los campos') : mal('los campos dicen ' + await p.inputValue('#an-ancho') + ' × ' + await p.inputValue('#an-alto'));
await escribir('#an-ancho', 100); await escribir('#an-alto', 100); await escribir('#an-sep', 2);
(await hojaOn()) === 'retazo' ? bien('teclear una medida que no es de ninguna hoja marca «Retazo»') : mal('la tarjeta no pasó a «Retazo»: ' + await hojaOn());
(await p.evaluate(() => !document.getElementById('an-retazos').hidden)) ? bien('y aparece el bloque de retazos guardados') : mal('el bloque de retazos no apareció');
await p.click('.an-tile[data-hoja="600x1200"]');
(await p.inputValue('#an-ancho')) === '600' && (await p.inputValue('#an-alto')) === '1200'
  ? bien('elegir «Cuarto de hoja» llena 600 × 1200') : mal('la tarjeta no llenó los campos: ' + await p.inputValue('#an-ancho') + ' × ' + await p.inputValue('#an-alto'));
await p.click('#an-girar');
(await p.inputValue('#an-ancho')) === '1200' && (await p.inputValue('#an-alto')) === '600'
  ? bien('«Girar la hoja» intercambia ancho y alto') : mal('girar no intercambió: ' + await p.inputValue('#an-ancho') + ' × ' + await p.inputValue('#an-alto'));
(await hojaOn()) === '600x1200' ? bien('y sigue siendo el cuarto de hoja, acostado') : mal('girar cambió la hoja a ' + await hojaOn());
await p.click('.an-tile[data-hoja="1200x2400"]');
(await p.inputValue('#an-ancho')) === '2400' && (await p.inputValue('#an-alto')) === '1200' ? bien('la hoja completa respeta la orientación acostada: 2400 × 1200') : mal('la completa acostada dio ' + await p.inputValue('#an-ancho') + ' × ' + await p.inputValue('#an-alto'));
await p.click('.an-mats .chip[data-mat="aluminio"]');
(await p.evaluate(() => document.getElementById('an-mesa').getAttribute('data-mat'))) === 'aluminio' ? bien('elegir aluminio cambia el acabado de la mesa') : mal('la mesa no cambió de material');
await escribir('#an-ancho', 100); await escribir('#an-alto', 100);
(await p.evaluate(() => !document.getElementById('an-ir').disabled)) ? bien('con archivo, medida y hoja, el botón se encendió') : mal('el botón principal sigue apagado con todo puesto');

// ── 4. Acomodar de verdad ──────────────────────────────────────────────────
console.log('\nACOMODAR DE VERDAD, CON LOS WEB WORKERS');
await p.click('#an-ir');
await p.waitForTimeout(200);
e = await estado();
e.corriendo ? bien('arrancó') : mal('no arrancó: ' + await p.evaluate(() => document.getElementById('an-msg').textContent));
(await p.evaluate(() => document.getElementById('an-ir').textContent.trim())) === 'Detener'
  ? bien('y el botón ahora dice «Detener»') : mal('el botón no cambió a «Detener»');
const llego = await esperar(async () => !!(await estado()).mejor);
if (!llego) mal('en 90 s no hubo un solo acomodo: los workers no corren (¿ruta de eval.js?)');
else {
  e = await estado();
  bien('primer acomodo en ' + e.intentos + ' intento(s)');
  e.mejor.colocadas === 6 && e.mejor.total === 6 ? bien('colocó las 6 piezas') : mal('colocó ' + e.mejor.colocadas + ' de ' + e.mejor.total);
  e.mejor.laminas >= 2 ? bien('en ' + e.mejor.laminas + ' hojas de 100 × 100: no cabían en una (14 800 mm² en 10 000)') : mal('dice ' + e.mejor.laminas + ' hoja(s) y no caben en una');
  const figs = await p.evaluate(() => document.querySelectorAll('#an-res figure.an-hoja').length);
  figs === e.mejor.laminas ? bien('se pinta una figura por hoja') : mal('se pintan ' + figs + ' figuras para ' + e.mejor.laminas + ' hojas');
  const capt = await p.evaluate(() => document.querySelector('#an-res figcaption').textContent);
  /^Hoja 1 · \d+ piezas? · 100\u00A0mm × 100\u00A0mm$/.test(capt) ? bien('con su leyenda: «' + capt + '»') : mal('leyenda rara: «' + capt + '»');
  (await p.evaluate(() => !document.getElementById('an-dl').disabled)) ? bien('y «Descargar» se encendió') : mal('«Descargar» sigue apagado con resultado');
  const botonesHoja = await p.evaluate(() => document.querySelectorAll('#an-dl-hojas button').length);
  botonesHoja === e.mejor.laminas ? bien('con un botón por hoja para bajarla sola') : mal(botonesHoja + ' botones de hoja para ' + e.mejor.laminas + ' hojas');
  (await p.evaluate(() => document.getElementById('an-st-col').textContent)) === '6/6' ? bien('la ficha dice 6/6') : mal('la ficha de colocadas dice ' + await p.evaluate(() => document.getElementById('an-st-col').textContent));
}
if (llego) {
  /* El atributo del rectángulo de SVG_MM: ni en la mesa, ni al pasarle el ratón encima. */
  const conOn = await p.evaluate(() => document.querySelectorAll('#an-res [onmouseover]').length);
  const caja = await p.evaluate(() => { const r = document.querySelector('#an-res g rect'); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  if (caja) { await p.mouse.move(caja.x, caja.y); await p.waitForTimeout(100); }
  conOn === 0 && !(await p.evaluate(() => window.__pwn))
    ? bien('el onmouseover del archivo no llegó a la mesa: pasarle el ratón no ejecuta nada') : mal('el acomodo trae ' + conOn + ' onmouseover y __pwn=' + await p.evaluate(() => window.__pwn));
}
await p.evaluate(() => window.Anidador.detener());
await p.waitForTimeout(300);
e = await estado();
!e.corriendo ? bien('«Detener» detiene') : mal('sigue corriendo tras detener');
(await p.evaluate(() => document.getElementById('an-ir').textContent.trim())) === 'Volver a acomodar desde cero'
  ? bien('el botón ofrece volver a acomodar desde cero') : mal('el botón dice «' + await p.evaluate(() => document.getElementById('an-ir').textContent.trim()) + '»');
(await p.evaluate(() => !document.getElementById('an-seguir').hidden)) ? bien('y aparece «Seguir buscando»') : mal('no aparece «Seguir buscando»');
/* stop() del motor solo apaga su reloj: el intento que ya iba en los workers termina y llama
   igual. Detenido, nada de lo que llegue tarde puede mover el marcador ni el resultado. */
await p.waitForTimeout(2500);
const trasParar = await estado();
trasParar.intentos === e.intentos && JSON.stringify(trasParar.mejor) === JSON.stringify(e.mejor)
  ? bien('detenido, el intento que venía en camino no mueve el marcador ni el acomodo (' + e.intentos + ' intentos)')
  : mal('después de detener llegó otro intento: ' + e.intentos + ' → ' + trasParar.intentos + ' intentos');
/* «Seguir buscando» sigue el MISMO cálculo; con otra separación ya no hay nada que seguir. */
await escribir('#an-sep', 5);
(await p.evaluate(() => document.getElementById('an-seguir').hidden)) ? bien('con otra separación, «Seguir buscando» se esconde: el motor seguiría con la de antes') : mal('«Seguir buscando» sigue a la vista con la separación cambiada');
await escribir('#an-sep', 2);
(await p.evaluate(() => !document.getElementById('an-seguir').hidden)) ? bien('y vuelve al regresar a la separación con la que se acomodó') : mal('«Seguir buscando» no volvió con la separación original');

// ── 5. El SVG que sale ─────────────────────────────────────────────────────
console.log('\nEL SVG QUE SALE');
if (e.mejor) {
  const n = e.mejor.laminas;
  const todo = await p.evaluate(() => window.Anidador.armarSalida(null));
  const alto = 100 * n + 25 * (n - 1);
  todo.includes('width="100mm"') && todo.includes('height="' + alto + 'mm"')
    ? bien('mide 100 mm de ancho y ' + alto + ' de alto: ' + n + ' hojas y 25 mm entre ellas, EN MILÍMETROS')
    : mal('las medidas de salida no cuadran: ' + (todo.match(/<svg[^>]*>/) || [''])[0]);
  todo.includes('viewBox="0 0 100 ' + alto + '"') ? bien('con su viewBox en las mismas unidades') : mal('viewBox raro: ' + (todo.match(/viewBox="[^"]*"/) || [''])[0]);
  (todo.match(/id="hoja-\d+"/g) || []).length === n ? bien('una capa por hoja') : mal('capas de hoja: ' + (todo.match(/id="hoja-\d+"/g) || []).length);
  (todo.match(/id="contorno-hoja-\d+"/g) || []).length === n && todo.includes('stroke="#4060f8"') && todo.includes('fill="none"')
    ? bien('cada una con su contorno en azul, sin relleno, por atributo y no por CSS') : mal('el contorno de la lámina no salió como se esperaba');
  (todo.match(/<g transform="translate\([^)]*\) rotate\(/g) || []).length === 6 ? bien('y las 6 piezas, cada una con su traslación y su giro') : mal('grupos de pieza: ' + (todo.match(/<g transform="translate\([^)]*\) rotate\(/g) || []).length);
  todo.includes('class="hole"') || todo.includes(' hole"') ? bien('el hueco de la «O» viene marcado como hueco') : mal('el hueco de la «O» no quedó marcado');
  const una = await p.evaluate(() => window.Anidador.armarSalida(0));
  una.includes('height="100mm"') && (una.match(/id="hoja-\d+"/g) || []).length === 1 ? bien('una hoja sola sale con su alto de 100 mm y una sola capa') : mal('la salida de una hoja no cuadra');
  !/an-p\d|--i:/.test(todo) ? bien('y las clases de color y el turno de caída de la mesa no salen en el archivo') : mal('el archivo de corte trae clases de la mesa');
  !/onmouseover|\son[a-z]+=/i.test(todo) ? bien('ni el onmouseover que traía el archivo de entrada') : mal('el archivo de corte trae manejadores de eventos del SVG de entrada');
  /* El interruptor vive en el pliegue de lo avanzado, que nace cerrado: se abre como lo
     abriría una persona, tocando el resumen. */
  await p.click('#an-avanzado summary');
  await p.click('#an-contorno');
  const sinContorno = await p.evaluate(() => window.Anidador.armarSalida(null));
  !/contorno-hoja/.test(sinContorno) ? bien('apagando el interruptor, el contorno no sale — sin volver a acomodar') : mal('el contorno sigue saliendo con el interruptor apagado');
  await p.click('#an-contorno');
  (await p.evaluate(() => document.getElementById('an-contorno').getAttribute('aria-checked'))) === 'true'
    ? bien('y volviéndolo a tocar, vuelve') : mal('el interruptor no volvió a encenderse');
}

// ── 6. Lo que no es una medida ─────────────────────────────────────────────
console.log('\nUN SVG EN PX: LA MEDIDA SE PIDE, NO SE ADIVINA');
await cargar(SVG_PX, 'logo.svg');
e = await estado();
e.archivo.origen === 'falta' && e.archivo.k === null ? bien('en px no hay escala: falta') : mal('con px salió ' + JSON.stringify({ k: e.archivo.k, origen: e.archivo.origen }));
(await p.evaluate(() => document.getElementById('an-ir').disabled)) ? bien('y el botón se apaga hasta tenerla') : mal('el botón está encendido sin medida');
(await p.evaluate(() => document.getElementById('fld-ancho-d').classList.contains('falta') && document.getElementById('an-medida-txt').classList.contains('falta')))
  ? bien('el paso 2 va en ámbar') : mal('el paso 2 no marca que falta');
(await p.evaluate(() => document.getElementById('an-medida-txt').textContent)).includes('px')
  ? bien('y dice que venía en px') : mal('la nota no dice en qué venía: «' + await p.evaluate(() => document.getElementById('an-medida-txt').textContent) + '»');
(await p.inputValue('#an-ancho-d')) === '' ? bien('los campos llegan vacíos: nada que borrar antes de teclear') : mal('el ancho llegó con «' + await p.inputValue('#an-ancho-d') + '»');
await escribir('#an-ancho-d', 800);
e = await estado();
Math.abs(e.archivo.k - 2) < 1e-9 ? bien('800 mm de ancho sobre 400 unidades de tinta → 2 mm por unidad') : mal('k salió ' + e.archivo.k);
(await p.inputValue('#an-alto-d')) === '400' ? bien('y el alto se calculó solo: 400 mm') : mal('el alto dice ' + await p.inputValue('#an-alto-d'));
(await p.evaluate(() => !document.getElementById('an-ir').disabled && !document.getElementById('fld-ancho-d').classList.contains('falta')))
  ? bien('el botón se encendió y el ámbar se fue') : mal('con la medida puesta el botón sigue apagado o el ámbar sigue');

// ── 6b. Lo que trae un SVG de fuera ────────────────────────────────────────
/* Esta página comparte el origen —y el localStorage, con las API keys de la IA— con el
   cotizador, y el SVG llega de un cliente. Cada uno de estos corría antes con solo cargarlo:
   el <set onbegin>, el <image onerror> y el onload de la raíz. */
console.log('\nUN SVG CON CÓDIGO: SE CARGA LIMPIO');
const SVG_ACTIVO = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:html="http://www.w3.org/1999/xhtml"
    width="100mm" height="50mm" viewBox="0 0 100 50" onload="window.__pwn=(window.__pwn||[]).concat('onload')">
  <defs><symbol id="s"><rect width="10" height="10"/></symbol></defs>
  <script>window.__pwn=(window.__pwn||[]).concat('script')</script>
  <rect x="5" y="5" width="40" height="20"><set attributeName="x" to="6" begin="0s" onbegin="window.__pwn=(window.__pwn||[]).concat('set')"/></rect>
  <image href="data:x" onerror="window.__pwn=(window.__pwn||[]).concat('image')"/>
  <image xlink:href="https://ejemplo.invalid/rastreo.png" width="5" height="5"/>
  <a href="javascript:window.__pwn='a'"><rect x="50" y="5" width="40" height="20"/></a>
  <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="window.__pwn=(window.__pwn||[]).concat('fo')"/></div></foreignObject>
  <html:img src="x" onerror="window.__pwn=(window.__pwn||[]).concat('html')"/>
  <use href="#s" x="60" y="30"/>
</svg>`;
await p.evaluate(() => { window.__pwn = []; });
(await cargar(SVG_ACTIVO, 'cliente.svg')) ? bien('el SVG se cargó') : mal('cargarTexto rechazó el SVG');
await p.waitForTimeout(600);
const pwn = await p.evaluate(() => window.__pwn);
pwn.length === 0 ? bien('no corrió nada: ni <script>, ni onload, ni <set onbegin>, ni <image onerror>, ni HTML metido') : mal('corrió: ' + JSON.stringify(pwn));
const vista = await p.evaluate(() => {
  const s = document.querySelector('#an-orig svg');
  const todos = [s, ...s.querySelectorAll('*')];
  return {
    on: todos.filter(n => [...n.attributes].some(a => /^on/i.test(a.localName))).length,
    activos: s.querySelectorAll('script,set,foreignObject').length + [...s.querySelectorAll('*')].filter(n => n.namespaceURI === 'http://www.w3.org/1999/xhtml').length,
    hrefs: [...s.querySelectorAll('*')].map(n => n.getAttribute('href') || n.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).filter(Boolean),
  };
});
vista.on === 0 && vista.activos === 0 ? bien('la vista previa no trae ni un on* ni un elemento activo') : mal('la vista previa trae ' + vista.on + ' on* y ' + vista.activos + ' elementos activos');
JSON.stringify(vista.hrefs) === JSON.stringify(['#s'])
  ? bien('de los enlaces solo queda el de dentro del archivo (#s): ni javascript:, ni data: roto, ni la dirección de fuera')
  : mal('enlaces que quedaron: ' + JSON.stringify(vista.hrefs));
e = await estado();
e.archivo.piezas === 2 ? bien('y las piezas siguen siendo las dos que son') : mal('contó ' + e.archivo.piezas + ' piezas y son 2');
e.archivo.avisos.some(a => /imágenes incrustadas/.test(a)) && e.archivo.avisos.some(a => /<use>/.test(a))
  ? bien('los avisos se cuentan sobre el archivo como llegó: sus dos imágenes y su <use>') : mal('avisos: ' + JSON.stringify(e.archivo.avisos));

// ── 6c. Sin viewBox, y la tinta que sí se corta ─────────────────────────────
console.log('\nSIN VIEWBOX, LAS UNIDADES SON PX DEL ESTÁNDAR');
/* 200 × 100 mm en cualquier navegador: sin viewBox, 755.9 unidades son 755.9 px CSS. */
await cargar('<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm"><rect x="0" y="0" width="755.9" height="377.95"/></svg>', 'sin-viewbox.svg');
e = await estado();
Math.abs(e.archivo.k - 25.4 / 96) < 1e-9 ? bien('k = 25.4/96 mm por unidad') : mal('k salió ' + e.archivo.k + ' y es 25.4/96');
(await p.evaluate(() => document.getElementById('an-st-diseno').textContent)) === '200 × 100 mm'
  ? bien('la ficha dice 200 × 100 mm, lo que mide en el navegador') : mal('la ficha dice «' + await p.evaluate(() => document.getElementById('an-st-diseno').textContent) + '»');
/^0 0 755\.9/.test(await p.evaluate(() => document.querySelector('#an-orig svg').getAttribute('viewBox')))
  ? bien('y la vista previa encuadra el dibujo entero, en px') : mal('viewBox de la vista: ' + await p.evaluate(() => document.querySelector('#an-orig svg').getAttribute('viewBox')));

console.log('\nLA MEDIDA DEL DISEÑO ES LA DE LO QUE SE CORTA');
/* Una letra de 100 unidades junto a una imagen de referencia de 1000: «el diseño mide 400 mm»
   es la letra, no la foto de fondo. */
await cargar(`<svg xmlns="http://www.w3.org/2000/svg" width="1000px" height="600px" viewBox="0 0 1000 600">
  <image x="0" y="0" width="1000" height="600" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="/>
  <text x="10" y="590" font-size="80">REFERENCIA</text>
  <rect x="100" y="100" width="100" height="50"/></svg>`, 'con-imagen.svg');
e = await estado();
e.archivo.bbox && e.archivo.bbox.w === 100 && e.archivo.bbox.h === 50 ? bien('la tinta mide 100 × 50: la imagen y el texto no entran') : mal('tinta: ' + JSON.stringify(e.archivo.bbox));
await escribir('#an-ancho-d', 400);
e = await estado();
Math.abs(e.archivo.k - 4) < 1e-9 ? bien('«400 mm de ancho» → 4 mm por unidad: la letra mide 400') : mal('k salió ' + e.archivo.k + ' y es 4');

console.log('\nVACIAR LA MEDIDA VUELVE A LA DEL ARCHIVO');
await cargar('<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="200mm" viewBox="0 0 300 200"><rect x="10" y="10" width="280" height="180"/></svg>', 'mm.svg');
await p.click('#an-ancho-d'); await p.keyboard.press('End'); await p.keyboard.press('Backspace');
e = await estado();
e.archivo.origen === 'mano' && Math.abs(e.archivo.k - 0.1) < 1e-9 ? bien('borrar un dígito (280 → 28) es una medida a mano') : mal('tras borrar un dígito: ' + JSON.stringify({ k: e.archivo.k, origen: e.archivo.origen }));
await p.fill('#an-ancho-d', '');
e = await estado();
e.archivo.origen === 'archivo' && Math.abs(e.archivo.k - 1) < 1e-9 && (await p.inputValue('#an-ancho-d')) === '280'
  ? bien('y vaciar el campo devuelve la escala del archivo: 1 mm por unidad, 280 en el campo') : mal('tras vaciar: ' + JSON.stringify({ k: e.archivo.k, origen: e.archivo.origen, campo: await p.inputValue('#an-ancho-d') }));

// ── 7. Lo que se avisa antes de empezar ────────────────────────────────────
console.log('\nLO QUE SE QUEDA FUERA SE DICE ANTES');
await cargar(SVG_TEXTO, 'texto.svg');
e = await estado();
e.archivo.avisos.some(a => /texto/.test(a)) ? bien('avisa del texto sin convertir') : mal('no avisó del <text>: ' + JSON.stringify(e.archivo.avisos));
e.archivo.avisos.some(a => /<use>/.test(a)) ? bien('y del símbolo reutilizado') : mal('no avisó del <use>');
e.archivo.piezas === 1 ? bien('y cuenta solo la pieza de verdad: el rectángulo') : mal('contó ' + e.archivo.piezas + ' piezas; el texto, el <use> y el símbolo de <defs> no son piezas');
(await p.evaluate(() => document.querySelectorAll('#an-avisos .hintnote.nota-av').length)) === 2 ? bien('dos fichas ámbar en pantalla') : mal('fichas ámbar: ' + await p.evaluate(() => document.querySelectorAll('#an-avisos .hintnote.nota-av').length));

await cargar(SVG_GRANDE, 'grande.svg');
await escribir('#an-ancho', 100); await escribir('#an-alto', 100);
await p.evaluate(() => window.Anidador.iniciar());
await p.waitForTimeout(300);
e = await estado();
const msg = await p.evaluate(() => ({ t: document.getElementById('an-msg').textContent, c: document.getElementById('an-msg').className }));
!e.corriendo && /Ninguna/.test(msg.t) && /mal/.test(msg.c)
  ? bien('una pieza de 150 × 150 en una hoja de 100 × 100 no arranca: «' + msg.t.slice(0, 60) + '…»')
  : mal('con una pieza que no cabe: corriendo=' + e.corriendo + ' msg=«' + msg.t + '»');

/* El motor engorda cada pieza media separación por lado y adelgaza la hoja otro tanto: en una
   hoja de 400 con 3 mm cabe hasta 394, no hasta 397. Una de 396 sin giros no cabe, y se dice. */
await cargar('<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="200mm" viewBox="0 0 400 200"><rect x="0" y="0" width="396" height="100"/></svg>', 'larga.svg');
await escribir('#an-ancho', 400); await escribir('#an-alto', 400); await escribir('#an-sep', 3);
await p.selectOption('#an-rot', '1');
await p.evaluate(() => window.Anidador.iniciar());
await p.waitForTimeout(300);
e = await estado();
const msgSep = await p.evaluate(() => document.getElementById('an-msg').textContent);
!e.corriendo && /Ninguna/.test(msgSep)
  ? bien('396 mm en una hoja de 400 con 3 mm de separación y sin giros no cabe: la separación se descuenta de los dos lados')
  : mal('la pieza de 396 arrancó o no avisó: corriendo=' + e.corriendo + ' msg=«' + msgSep + '»');
if (e.corriendo) await p.evaluate(() => window.Anidador.detener());
await p.selectOption('#an-rot', '4');

// ── 7b. Volver a acomodar con otra separación ──────────────────────────────
/* El caso que dejaba la corrida nueva colgada: se detiene la primera durante su primer intento
   —con la caché fría, ese intento lo calcula todo y sale bueno— y se vuelve a acomodar con una
   separación que pide más hojas. Sin el número de corrida del motor (svgnest.js), ese intento
   viejo llegaba después, se quedaba como el «mejor» del motor, y la corrida nueva no podía
   superarlo: «Calculando el primer acomodo…» para siempre. */
console.log('\nVOLVER A ACOMODAR CON OTRA SEPARACIÓN');
await cargar(SVG_MM, 'prueba.svg');
await escribir('#an-ancho', 100); await escribir('#an-alto', 100); await escribir('#an-sep', 2);
await p.evaluate(() => new Promise(res => {
  window.Anidador.iniciar();
  const t = setInterval(() => { if (window.SvgNest.working) { clearInterval(t); window.Anidador.detener(); res(); } }, 5);
}));
await escribir('#an-sep', 8);
await p.evaluate(() => window.Anidador.iniciar());
const llego2 = await esperar(async () => !!(await estado()).mejor, 45000);
e = await estado();
llego2 ? bien('la corrida nueva enseña su propio acomodo (' + e.mejor.laminas + ' hojas, ' + e.intentos + ' intento(s))') : mal('la corrida nueva no enseñó nada en 45 s: ' + e.intentos + ' intentos sin resultado');
await p.evaluate(() => window.Anidador.detener());

// ── 8. Lo que deja el cotizador ────────────────────────────────────────────
console.log('\nEL TRAZO QUE DEJA EL COTIZADOR');
await p.evaluate(s => localStorage.setItem('al3d_anidar', JSON.stringify({ svg: s, nombre: 'al3d-farmacia-san-juan.svg', folio: 'COT-0042', cliente: 'Farmacia San Juan', proyecto: 'Letrero de fachada', ts: Date.now() })), SVG_MM);
await p.goto(B + '/anidador-vectores/', { waitUntil: 'load' });
await p.waitForTimeout(600);
e = await estado();
e.archivo && e.archivo.nombre === 'al3d-farmacia-san-juan.svg' && e.archivo.piezas === 6 ? bien('al abrir, el trazo ya está cargado') : mal('no recogió el trazo: ' + JSON.stringify(e.archivo && e.archivo.nombre));
const banda = await p.evaluate(() => { const b = document.getElementById('an-origen'); return { hidden: b.hidden, t: b.textContent }; });
!banda.hidden && /COT-0042/.test(banda.t) && /Farmacia San Juan/.test(banda.t) ? bien('y la banda dice de qué folio y cliente vino') : mal('la banda: ' + JSON.stringify(banda));
/medida real\./.test(banda.t) ? bien('y que trae su medida real') : mal('la banda no dice si trae medida: «' + banda.t + '»');
(await p.evaluate(() => localStorage.getItem('al3d_anidar'))) === null ? bien('la entrega se borró: era una entrega, no un guardado') : mal('al3d_anidar sigue en localStorage');
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(500);
(await p.evaluate(() => document.getElementById('an-origen').hidden && !window.Anidador.estado().archivo)) ? bien('y al recargar no vuelve a aparecer') : mal('al recargar volvió el trazo de la vez pasada');
(await p.inputValue('#an-ancho')) === '100' && (await p.inputValue('#an-alto')) === '100' ? bien('la última hoja usada se recordó (100 × 100)') : mal('la hoja no se recordó: ' + await p.inputValue('#an-ancho') + ' × ' + await p.inputValue('#an-alto'));
(await p.evaluate(() => document.getElementById('an-mesa').getAttribute('data-mat'))) === 'aluminio' ? bien('y el material también: aluminio') : mal('el material no se recordó: ' + await p.evaluate(() => document.getElementById('an-mesa').getAttribute('data-mat')));

// ── 8c. Los retazos del taller ─────────────────────────────────────────────
console.log('\nLOS RETAZOS SE GUARDAN CON SU NOMBRE');
await p.fill('#an-retazo-nombre', 'sobrante acrílico 3 mm');
await p.click('#an-retazo-guardar');
let ret = await p.evaluate(() => window.Anidador.estado().retazos);
ret.length === 1 && ret[0].nombre === 'sobrante acrílico 3 mm' && ret[0].ancho === 100 && ret[0].alto === 100
  ? bien('la medida de la hoja se guardó como retazo con su nombre') : mal('retazos: ' + JSON.stringify(ret));
(await p.evaluate(() => document.querySelectorAll('#an-retazo-lista .chip').length)) === 1 ? bien('y aparece como chip') : mal('no apareció el chip del retazo');
await p.click('#an-retazo-guardar');
(await p.evaluate(() => window.Anidador.estado().retazos.length)) === 1 ? bien('guardarlo dos veces con la misma medida no lo duplica') : mal('se duplicó el retazo');
await p.click('.an-tile[data-hoja="1200x1200"]');
(await p.inputValue('#an-ancho')) === '1200' ? bien('se cambia a media hoja…') : mal('no cambió a media hoja');
await p.click('#an-retazo-lista .chip');
(await p.inputValue('#an-ancho')) === '100' && (await p.inputValue('#an-alto')) === '100' && (await hojaOn()) === 'retazo'
  ? bien('…y tocar el retazo devuelve sus 100 × 100 y marca «Retazo»') : mal('tocar el retazo dejó ' + await p.inputValue('#an-ancho') + ' × ' + await p.inputValue('#an-alto') + ' / ' + await hojaOn());
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(500);
(await p.evaluate(() => document.querySelectorAll('#an-retazo-lista .chip').length)) === 1 ? bien('el retazo sigue ahí al recargar') : mal('el retazo se perdió al recargar');
await p.click('#an-retazo-lista .an-retazo-x');
(await p.evaluate(() => window.Anidador.estado().retazos.length)) === 0 ? bien('y la × lo quita') : mal('la × no quitó el retazo');
/* Los interruptores de lo avanzado también se recuerdan: son de este taller, no de este archivo. */
await p.click('#an-avanzado summary'); await p.click('#an-concavas');
(await p.evaluate(() => document.getElementById('an-concavas').getAttribute('aria-checked'))) === 'true' ? bien('«Buscar también dentro de las concavidades» se enciende') : mal('el interruptor de concavidades no encendió');
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(500);
(await p.evaluate(() => document.getElementById('an-concavas').getAttribute('aria-checked'))) === 'true' ? bien('y sigue encendido al recargar') : mal('el interruptor de concavidades no se recordó');
await p.click('#an-avanzado summary'); await p.click('#an-concavas');
(await p.evaluate(() => document.getElementById('an-concavas').getAttribute('aria-checked'))) === 'false' ? bien('y se apaga') : mal('el interruptor de concavidades no se apagó');

// ── 8b. De punta a punta: el botón del vectorizador ────────────────────────
/* Lo de arriba planta la clave a mano. Esto la planta como la planta el cotizador: con su
   botón, desde el vectorizador, con la cotización capturada. Es el camino que una persona
   recorre y el que se rompería si el nombre de la clave cambiara de un lado y no del otro. */
console.log('\nDESDE EL VECTORIZADOR DEL COTIZADOR, DE PUNTA A PUNTA');
const cot = await ctx.newPage();
const errsCot = []; cot.on('pageerror', e => errsCot.push(e.message));
await cot.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
await cot.waitForTimeout(1200);
await cot.fill('#f-cli', 'Farmacia San Juan'); await cot.fill('#f-tel', '33 1234 5678'); await cot.fill('#f-proy', 'Letrero de fachada');
await cot.waitForTimeout(300);
await cot.evaluate(() => { irAPaso(2); });
await cot.waitForTimeout(300);
await cot.evaluate(() => abrirVector());
await cot.waitForTimeout(600);
(await cot.evaluate(() => document.getElementById('vt-anidar').disabled)) ? bien('sin trazo, «Acomodar en hoja» está apagado') : mal('el botón del anidador está encendido sin trazo');
/* Un trazo como el que arma el vectorizador con medida real: cm en el width, píxeles en el viewBox. */
const boton = await cot.evaluate(() => {
  VT.svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="40.000cm" height="20.000cm">\n  <title>logo</title>\n  <path fill="#000000" fill-rule="evenodd" d="M10 10L150 10L150 190L10 190Z"/>\n  <path fill="#000000" fill-rule="evenodd" d="M250 10L390 10L390 190L250 190ZM290 50L350 50L350 150L290 150Z"/>\n</svg>\n';
  VT.hecho = true; VT.cmPorPx = 0.1;
  vtHabilitarSalidas();
  return { disabled: document.getElementById('vt-anidar').disabled, texto: document.getElementById('vt-anidar').textContent.trim() };
});
!boton.disabled ? bien('con trazo, se enciende') : mal('con trazo hecho, el botón sigue apagado');
boton.texto === 'Acomodar en hoja · anidador' ? bien('y dice «' + boton.texto + '»') : mal('el botón dice «' + boton.texto + '»');
const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null), cot.evaluate(() => vtAnidar())]);
if (!popup) mal('vtAnidar() no abrió ninguna pestaña');
else {
  await popup.waitForLoadState('load'); await popup.waitForTimeout(900);
  /\/anidador-vectores\/$/.test(popup.url()) ? bien('abre el anidador en otra pestaña: la cotización se queda en la suya') : mal('abrió ' + popup.url());
  const ea = await popup.evaluate(() => window.Anidador.estado().archivo);
  ea && ea.piezas === 2 ? bien('con el trazo puesto: 2 piezas') : mal('el anidador no recibió el trazo: ' + JSON.stringify(ea));
  ea && Math.abs(ea.k - 1) < 1e-9 && ea.origen === 'archivo' ? bien('a escala real: 40 cm sobre 400 unidades → 1 mm por unidad, sin preguntar nada') : mal('escala: ' + JSON.stringify(ea && { k: ea.k, origen: ea.origen }));
  const bd = await popup.evaluate(() => document.getElementById('an-origen').textContent);
  /Farmacia San Juan/.test(bd) && /Letrero de fachada/.test(bd) && /COT-/.test(bd) ? bien('la banda dice de quién es: «' + bd.slice(0, 90) + '…»') : mal('la banda: «' + bd + '»');
  (await popup.evaluate(() => localStorage.getItem('al3d_anidar'))) === null ? bien('y la entrega ya no está en localStorage') : mal('al3d_anidar sigue guardado tras recibirlo');
  await popup.close();
}
(await cot.evaluate(() => document.getElementById('toast').textContent)).includes('a escala real') ? bien('el cotizador avisó: «El anidador abrió con el trazo a escala real»') : mal('el aviso del cotizador dice «' + await cot.evaluate(() => document.getElementById('toast').textContent) + '»');
errsCot.length ? mal('errores en el cotizador: ' + [...new Set(errsCot)].slice(0, 3).join(' | ')) : bien('cero errores de página en el cotizador');
await cot.close();

// ── 9. En el teléfono no se desplaza de lado ───────────────────────────────
console.log('\nEN EL TELÉFONO');
const ctxTel = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'es-MX' });
const tel = await ctxTel.newPage();
await tel.goto(B + '/anidador-vectores/', { waitUntil: 'load' });
await tel.waitForTimeout(500);
await tel.evaluate(([s]) => window.Anidador.cargarTexto(s, 'prueba.svg'), [SVG_MM]);
await tel.waitForTimeout(300);
const anchos = await tel.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
anchos.doc <= anchos.win ? bien('a 390 px la página no se desplaza de lado (' + anchos.doc + ' de ' + anchos.win + ')') : mal('a 390 px la página mide ' + anchos.doc + ' y la pantalla ' + anchos.win + ': se desplaza de lado');
const columnas = await tel.evaluate(() => getComputedStyle(document.querySelector('.an-wrap')).gridTemplateColumns.split(' ').length);
columnas === 1 ? bien('y va en una columna') : mal('a 390 px la rejilla tiene ' + columnas + ' columnas');
await ctxTel.close();

// ── 10. Nada se rompió ─────────────────────────────────────────────────────
console.log('');
errs.length ? mal('errores de página: ' + [...new Set(errs)].slice(0, 3).join(' | ')) : bien('cero errores de página');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl anidador acomoda en milímetros y recoge lo que le deja el cotizador.');
await nav.close();
process.exit(fallos ? 1 : 0);
