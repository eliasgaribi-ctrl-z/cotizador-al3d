/* COTIZAR CON IA: LA ESPERA SE VE, EL ARCHIVO SE RECONOCE Y EL BORRADOR SE REVISA ANTES DE SALIR.
 *
 * Esta pantalla es la que más se usa delante del cliente y la que más tarda: entre diez segundos
 * y un minuto con el teléfono en la mano. Lo que defiende esta prueba es lo que se rompía ahí, y
 * ninguno de los cinco se ve mirando la pantalla una sola vez:
 *
 *  · H1 · El modal se cerraba SOLO a los 1,5 s y dejaba las partidas apareciendo de golpe en la
 *    lista de atrás. Lo que faltó se decía con un número en un aviso que también se iba solo
 *    («una medida se quedó sin partida — revisa cuál falta»: cuál, nunca). Ahora se queda, y
 *    enseña un renglón por partida con ✓ si ya cotiza o «!» —con la palabra, no solo el color—
 *    si le falta algo. Aquí se comprueba que a los tres segundos el modal SIGUE abierto: un
 *    cierre automático que vuelva a colarse mata toda la ficha sin dar ningún error.
 *
 *  · H7 · La miniatura de 52 px no dejaba comprobar que se mandó el plano correcto, que es la
 *    única pregunta que uno se hace mientras espera. Ahora crece y la recorre una banda de luz
 *    MIENTRAS HAY ANÁLISIS, y solo entonces: la regla del sistema de diseño dice que una sola
 *    pieza se mueve sola. Se comprueban las dos mitades —que se mueva trabajando y que no se
 *    mueva en reposo—, porque la mitad fácil de romper es la segunda.
 *
 *  · H13 · «Se reemplazarán tus 3 partidas» con la lista tapada por el propio modal. Ahora se
 *    ven y se tachan al apagar «Conservar». El tachado NO puede bajar la opacidad del texto
 *    (§4.3), y eso es justo lo que hace cualquiera que implemente un tachado a ojo.
 *
 *  · H20 · El icono de la zona de arrastre respiraba en bucle en una pantalla vacía (falla 3 del
 *    brief). Ahora la carpeta se abre al acercar el archivo y se está quieta el resto del tiempo.
 *
 *  · Pieza 8 · La espera era un renglón que se reescribía encima de sí mismo. Ahora es una traza
 *    que avanza por eventos reales: el proveedor sin llave se salta, el que contesta se palomea.
 *
 *  · Lo que se descubrió al probarlo con la app entera y NO con el resumen aislado:
 *      – el resumen enseñaba los importes en claro, y el cotizador los difumina mientras la
 *        cotización es borrador porque se captura delante del cliente;
 *      – «Ver partidas» llamaba a irAPantalla en el mismo golpe que cerraba el modal, y el
 *        `history.back()` de la capa devolvía la app a «Cliente» cuando el modal se había abierto
 *        desde otra pantalla (nucleo.js documenta el cruce); y el desplazamiento hasta la partida
 *        se lo pisaba ese mismo atrás, que devuelve el scroll que la página tenía al abrir el modal;
 *      – con el resumen a la vista seguía puesto el interruptor de «Conservar» diciendo «se
 *        reemplazará» de partidas que ya se habían reemplazado, y «Analizar y cotizar» con su
 *        relleno junto a «Ver partidas»: dos botones llenos;
 *      – un segundo error metía el motivo entero dentro del botón «Reintentar», que salía
 *        cortado con puntos suspensivos justo en la palabra «Reintentar»;
 *      – los dos lienzos (escalador y vectorizador) solo pintaban un punteado sin decir qué iba
 *        a pasar al soltar;
 *      – al acercar el archivo, la carpeta cambiaba sus dos líneas de instrucciones por una y el
 *        recuadro se encogía 26 px: todo lo de abajo subía justo cuando la mano iba hacia allá.
 *
 *  · Contraste medido sobre el render —claro y oscuro—, con la pastilla y el velo sobre una imagen
 *    BLANCA, que es el peor fondo posible: pruebas/navegador/contraste.mjs no llega a esta zona.
 *
 * Todo con ratón, con el dedo y con el teclado, a 360 y 420 px, en claro y en oscuro, con y sin
 * movimiento reducido, sin errores de página y sin desborde horizontal.
 *
 * Uso:  npx --yes http-server -p 8905 -c-1 --silent &
 *       PUERTO=8905 node pruebas/navegador/cot-ia.mjs
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { inflateSync } from 'zlib';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8905');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, q) => c ? bien(q) : mal(q);

/* ---- La hoja de mentiras de ESTA prueba ----------------------------------------------------
   La de pruebas/navegador/hoja-de-mentiras.js contesta SIN_LLAVE a la IA a propósito, que es lo
   correcto para las demás pruebas: ninguna llama a un proveedor de verdad. Aquí hace falta una
   que SÍ conteste, porque lo que se prueba es lo que pasa con la respuesta. `window.__ia` la
   gobierna desde la prueba: qué proveedores tienen llave, cuánto tarda y si el primero falla. */
const HOJA = () => {
  if (!/cotizador\.html$/.test(location.pathname)) return;
  window.__ia = { tarda: 300, falla: false, transitorios: 0, llamadas: 0,
    llaves: { qwen: true, deepseek: false, gemini: true } };
  window.__ia.respuesta = { proyecto: 'Farmacia San Juan', cliente: 'Farmacia San Juan', partidas: [
    { tipo: 'letras', material: 'acr-vinil', complejidad: 'recta', altura_cm: 40, n_letras: 9, iluminacion: true, descripcion: 'Letras «FARMACIA»' },
    { tipo: 'caja', tarifa: 4600, ancho_cm: 120, alto_cm: 80, descripcion: 'Cruz médica' },
    { tipo: 'letras', material: '', complejidad: 'recta', altura_cm: 22, n_letras: 7, descripcion: 'Slogan «SAN JUAN»' },
  ] };
  const tarde = v => new Promise(r => setTimeout(() => r(v), window.__ia.tarda));
  window.AL3D = {
    identidad: () => ({ correo: 'Elías', rol: 'direccion' }),
    sesion: () => Promise.resolve({ ok: true, correo: 'Elías' }),
    hablar: (ruta, cuerpo) => {
      if (ruta === 'salud') return Promise.resolve({ ok: true, rol: 'direccion', escribibles: [],
        correo: 'Elías', ia: window.__ia.llaves });
      if (ruta === 'ia') {
        window.__ia.llamadas++;
        /* Qwen va primero en la cadena y aquí nunca contesta: sirve para ver el paso que se cae y
           el «lo resolvió Gemini» del resumen. Sin llave, para que no gaste reintentos. */
        if (cuerpo.prov !== 'gemini') return tarde({ ok: false, codigo: 'SIN_LLAVE', prov: cuerpo.prov,
          mensaje: (cuerpo.prov === 'qwen' ? 'Qwen' : 'DeepSeek') + ' no tiene llave en la hoja', transitorio: false });
        /* `transitorios` = cuántas contestaciones seguidas dicen «saturado»: lo que la app reintenta. */
        if (window.__ia.transitorios > 0) { window.__ia.transitorios--;
          return tarde({ ok: false, codigo: 'SATURADO', status: 503, transitorio: true, mensaje: 'Gemini está saturado' }); }
        if (window.__ia.falla) return tarde({ ok: false, codigo: 'VACIO', razon: 'SAFETY',
          mensaje: 'Gemini bloqueó la imagen con sus filtros', transitorio: false });
        return tarde({ ok: true, texto: JSON.stringify(window.__ia.respuesta) });
      }
      return Promise.resolve({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Camino desconocido.' });
    },
  };
};

/* Un PNG de un píxel: lo que importa es que sea un archivo de verdad con su tipo. */
const PNG = () => ({ name: 'plano-farmacia.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });

async function abrir({ ancho = 360, tema = 'claro', rm = false, dedo = false, dsf = 1 } = {}) {
  const ctx = await nav.newContext({ viewport: { width: ancho, height: 820 }, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block', hasTouch: dedo, deviceScaleFactor: dsf,
    reducedMotion: rm ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(HOJA);
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  const p = await ctx.newPage();
  p.__errs = []; p.on('pageerror', e => p.__errs.push(e.message));
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForTimeout(900);
  p.__ctx = ctx;
  return p;
}
/* Los tres obligatorios: sin ellos aiOpen() ni siquiera abre (y hace bien). */
async function conCliente(p) {
  await p.fill('#f-cli', 'Farmacia San Juan');
  await p.fill('#f-tel', '33 1234 5678');
  await p.fill('#f-proy', 'Letrero de fachada');
  await p.waitForTimeout(300);
}
/* Una partida capturada a mano, que es lo que hace aparecer el bloque de «Conservar». */
async function unaPartidaMia(p) {
  await p.evaluate(() => irAPantalla('partidas'));
  await p.waitForTimeout(300);
  await p.click('.chip:has-text("Acero Inoxidable")');
  await p.fill('#h-1', '30');
  await p.fill('#n-1', '5');
  await p.waitForTimeout(300);
}
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity)
  .map(a => {
    const t = a.effect.target;
    const cn = t && (typeof t.className === 'string' ? t.className : (t.className && t.className.baseVal) || t.tagName || '?');
    return cn + (a.effect.pseudoElement || '');
  }));
const desborde = p => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
/* Arrastrar de verdad: un DataTransfer con un archivo dentro, que es lo único que aiTraeArchivo()
   acepta (mira los `types`). */
async function arrastre(p, tipo, conArchivo) {
  const dt = await p.evaluateHandle(con => {
    const d = new DataTransfer();
    if (con) d.items.add(new File([new Uint8Array([1, 2, 3])], 'plano.png', { type: 'image/png' }));
    else d.items.add('hola', 'text/plain');
    return d;
  }, conArchivo);
  await p.dispatchEvent('#ai-drop', tipo, { dataTransfer: dt });
  await p.waitForTimeout(260);
}

// ═══ 1 · H20 · LA CARPETA SE ABRE AL ACERCAR EL ARCHIVO, Y EN REPOSO NO HACE NADA ═══════════
console.log('\nH20 · LA ZONA DE ARRASTRE');
{
  const p = await abrir({});
  await conCliente(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(400);

  const quieta = await infinitas(p);
  cierto(quieta.length === 0, 'con el modal abierto y esperando el archivo, nada se mueve solo'
    + (quieta.length ? ' — se mueven: ' + quieta.join(', ') : ''));
  cierto(await p.evaluate(() => !!document.querySelector('#ai-drop .ai-carpeta .cp-tapa')),
    'la carpeta tiene tapa y cuerpo por separado (una sola pieza no se puede abrir)');

  const altoReposo = await p.evaluate(() => document.getElementById('ai-drop').getBoundingClientRect().height);
  const tapaQuieta = await p.evaluate(() => getComputedStyle(document.querySelector('#ai-drop .cp-tapa')).transform);
  cierto(tapaQuieta === 'none' || tapaQuieta === 'matrix(1, 0, 0, 1, 0, 0)', 'en reposo la tapa está cerrada');

  await arrastre(p, 'dragenter', true);
  cierto(await p.evaluate(() => document.getElementById('ai-drop').classList.contains('sobre')),
    'con el archivo encima, el recuadro se enciende');
  const tapa = await p.evaluate(() => getComputedStyle(document.querySelector('#ai-drop .cp-tapa')).transform);
  cierto(tapa !== 'none' && tapa !== 'matrix(1, 0, 0, 1, 0, 0)', 'y la tapa se abre');
  cierto(await p.evaluate(() => {
    const h = document.querySelector('#ai-drop .cp-hoja');
    return h.textContent.trim() === 'Suéltalo aquí' && getComputedStyle(h).transform !== 'none';
  }), 'y asoma la hoja con «Suéltalo aquí»');
  cierto(await p.evaluate(() => {
    const s = document.querySelector('#ai-drop .ai-drop-sobre');
    return getComputedStyle(s).display !== 'none' && getComputedStyle(document.querySelector('#ai-drop .t')).visibility === 'hidden'
      && getComputedStyle(document.querySelector('#ai-drop .s')).visibility === 'hidden';
  }), 'el recuadro cambia sus dos líneas de instrucciones por una que dice qué va a pasar');
  /* La caja no se encoge al acercar el archivo: lo de abajo no sube justo cuando la mano va hacia allá. */
  const alto1 = await p.evaluate(() => document.getElementById('ai-drop').getBoundingClientRect().height);
  cierto(Math.abs(alto1 - altoReposo) < 0.5, 'y el recuadro conserva su alto (reposo ' + altoReposo.toFixed(1) + ' px, con el archivo ' + alto1.toFixed(1) + ' px): nada de abajo se mueve');
  cierto(await p.evaluate(() => { const s = document.querySelector('#ai-drop .ai-drop-sobre').getBoundingClientRect(), z = document.getElementById('ai-drop').getBoundingClientRect();
    return s.top >= z.top && s.bottom <= z.bottom && s.height > 0; }), 'la frase nueva cae dentro del recuadro');

  await arrastre(p, 'dragleave', true);
  cierto(!(await p.evaluate(() => document.getElementById('ai-drop').classList.contains('sobre'))),
    'al alejar el archivo, la carpeta se cierra');

  /* Lo que NO es un archivo no abre nada: el arrastre de reordenar partidas mueve texto. */
  await arrastre(p, 'dragenter', false);
  cierto(!(await p.evaluate(() => document.getElementById('ai-drop').classList.contains('sobre'))),
    'un arrastre que no trae archivos no abre la carpeta');

  await arrastre(p, 'drop', true);
  cierto(await p.evaluate(() => document.getElementById('ai-pick').style.display !== 'none'),
    'al soltarlo, el archivo queda elegido y con su ficha');

  cierto(await p.evaluate(() => {
    const z = document.getElementById('ai-drop');
    return z.getAttribute('role') === 'button' && z.tabIndex >= 0;
  }), 'el recuadro sigue siendo alcanzable con el teclado (hay alternativa al gesto)');
  cierto(!(await desborde(p)), 'a 360 px no hay desborde horizontal');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 2 · H20 · CON MENOS MOVIMIENTO, SIN TAPA, PERO LA HOJA SE QUEDA ════════════════════════
console.log('\nH20 · CON MENOS MOVIMIENTO');
{
  const p = await abrir({ rm: true });
  await conCliente(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  await arrastre(p, 'dragenter', true);
  const t = await p.evaluate(() => getComputedStyle(document.querySelector('#ai-drop .cp-tapa')).transform);
  cierto(t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)', 'la tapa no gira: es adorno');
  cierto(await p.evaluate(() => document.querySelector('#ai-drop .cp-hoja').textContent.trim() === 'Suéltalo aquí'
    && getComputedStyle(document.querySelector('#ai-drop .ai-drop-sobre')).display !== 'none'),
    'pero «Suéltalo aquí» se queda: eso es información, no adorno');
  cierto(p.__errs.length === 0, 'sin errores de página');
  await p.__ctx.close();
}

// ═══ 2b · H20 · LOS DOS LIENZOS DICEN QUÉ VA A PASAR AL SOLTAR ══════════════════════════════
console.log('\nH20 · LOS LIENZOS');
for (const rm of [false, true]) {
  const p = await abrir({ rm });
  await conCliente(p);
  const conArchivo = () => p.evaluateHandle(() => { const d = new DataTransfer();
    d.items.add(new File([new Uint8Array([1, 2, 3])], 'plano.png', { type: 'image/png' })); return d; });
  const soloTexto = () => p.evaluateHandle(() => { const d = new DataTransfer(); d.items.add('hola', 'text/plain'); return d; });
  const vacio = () => p.evaluateHandle(() => new DataTransfer());
  const estado = id => p.evaluate(i => { const e = document.getElementById(i), cs = getComputedStyle(e, '::after');
    return { suelta: e.classList.contains('suelta'), texto: e.dataset.suelta || '', contenido: cs.content,
             eventos: cs.pointerEvents, pos: cs.position, anim: cs.animationName,
             contorno: getComputedStyle(e).outlineStyle }; }, id);
  for (const [abrirFn, cerrarFn, id, hijo, texto] of [
    ['abrirScaler', 'cerrarScaler', 'sp-canvas-area', '#scalerCanvas', 'Suelta para medir'],
    ['abrirVector', 'cerrarVector', 'vt-canvas-area', '#vt-stage-wrap', 'Suelta para vectorizar']]) {
    const q = (rm ? 'menos movimiento · ' : '') + id;
    await p.evaluate(n => window[n](), abrirFn);
    await p.waitForTimeout(600);
    const sel = '#' + id;
    let dt = await conArchivo();
    await p.dispatchEvent(sel, 'dragenter', { dataTransfer: dt });
    await p.dispatchEvent(sel, 'dragover', { dataTransfer: dt });
    let e = await estado(id);
    cierto(e.suelta && e.texto === texto && e.contenido.includes(texto), q + ' · con un archivo encima el lienzo dice «' + texto + '»');
    cierto(e.pos === 'absolute' && e.eventos === 'none', q + ' · el velo cubre el lienzo y no se come el soltar (pointer-events:none)');
    cierto(e.contorno === 'none', q + ' · el punteado en línea del marcado queda neutralizado: no dice lo mismo dos veces');
    cierto(rm ? e.anim === 'none' : true, q + (rm ? ' · con menos movimiento el velo aparece sin fundido' : ' · (con movimiento: fundido de 150 ms)'));
    cierto((await infinitas(p)).length === 0, q + ' · el velo no deja nada moviéndose en bucle');
    /* dragleave también salta al pasar de un hijo a otro: cuatro eventos, y solo el cuarto lo apaga. */
    await p.dispatchEvent(hijo, 'dragenter', { dataTransfer: dt, bubbles: true });
    await p.dispatchEvent(sel, 'dragleave', { dataTransfer: dt });
    cierto((await estado(id)).suelta, q + ' · al pasar del lienzo a su hijo el velo NO parpadea');
    await p.dispatchEvent(hijo, 'dragleave', { dataTransfer: dt, bubbles: true });
    await p.dispatchEvent(sel, 'dragleave', { dataTransfer: dt });
    cierto(!(await estado(id)).suelta && (await estado(id)).texto === '', q + ' · al alejar el archivo, el velo se va y no deja su texto');
    /* Un arrastre de TEXTO —reordenar partidas, arrastrar una selección— no enciende nada. */
    dt = await soloTexto();
    await p.dispatchEvent(sel, 'dragenter', { dataTransfer: dt });
    cierto(!(await estado(id)).suelta, q + ' · un arrastre que no trae archivos no enciende el velo');
    /* Soltar lo apaga. Se suelta un DataTransfer vacío para que scOnDrop/vtOnDrop no intenten
       cargar un archivo de mentira: lo que se prueba es el velo, no la carga. */
    dt = await conArchivo();
    await p.dispatchEvent(sel, 'dragenter', { dataTransfer: dt });
    await p.dispatchEvent(sel, 'drop', { dataTransfer: await vacio() });
    cierto(!(await estado(id)).suelta, q + ' · al soltar, el velo se va');
    await p.evaluate(n => window[n](), cerrarFn);
    await p.waitForTimeout(300);
  }
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 3 · H13 · QUÉ PARTIDAS SE VAN A REEMPLAZAR ═════════════════════════════════════════════
console.log('\nH13 · EL TACHADO DE LO QUE SE REEMPLAZA');
{
  const p = await abrir({ dedo: true });
  await conCliente(p);
  await unaPartidaMia(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(400);

  cierto(await p.evaluate(() => {
    const li = document.querySelectorAll('#ai-merge-lista li');
    return li.length === 1 && /Acero Inoxidable/.test(li[0].textContent);
  }), 'la partida que se va a reemplazar se ve con su nombre, no como un número');

  const tachado = () => p.evaluate(() => {
    const s = document.querySelector('#ai-merge-lista span'), cs = getComputedStyle(s);
    return { clase: document.getElementById('ai-merge-lista').classList.contains('tacha'),
             tam: cs.backgroundSize, opacidad: cs.opacity };
  });
  const antes = await tachado();
  cierto(!antes.clase && /^0/.test(antes.tam), 'con «Conservar» encendido no hay tachado');

  await p.tap('#ai-merge-box .switch');          // con el dedo
  await p.waitForTimeout(450);
  const luego = await tachado();
  cierto(luego.clase && /100%/.test(luego.tam), 'al apagarlo con el dedo, el renglón se tacha entero');
  cierto(luego.opacidad === '1', 'y el texto NO baja de opacidad: el estado no se dice con opacity (§4.3)');

  /* Con el teclado, que es la otra manera de llegar al mismo interruptor. */
  await p.evaluate(() => document.querySelector('#ai-merge-box .switch').focus());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(450);
  cierto(!(await tachado()).clase, 'con el teclado se vuelve a encender y el tachado se retira');

  cierto((await infinitas(p)).length === 0, 'el tachado no deja nada moviéndose');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 3b · H13 · LA LISTA ES CORTA Y EL TACHADO SIGUE CADA RENGLÓN ══════════════════════════
console.log('\nH13 · LA LISTA CORTA');
{
  const p = await abrir({});
  await conCliente(p);
  await unaPartidaMia(p);
  /* Seis partidas más: siete capturadas. Y una con una descripción larga, para que dé dos renglones. */
  await p.evaluate(() => {
    for (let i = 1; i <= 6; i++) Q.items.push(Object.assign({}, Q.items[0], { id: ++pid,
      desc: i === 1 ? 'Letras «FARMACIA SAN JUAN DE LOS LAGOS» con cantos de aluminio y luz fría frontal' : 'Letras «PARTIDA ' + i + '»' }));
    Q.items.unshift(Q.items.splice(1, 1)[0]);   // la larga, arriba
    aiOpen();
  });
  await p.waitForTimeout(400);
  const li = await p.evaluate(() => [...document.querySelectorAll('#ai-merge-lista li')].map(x => x.textContent.trim()));
  cierto(li.length === 4 && li[3] === 'y 4 más', 'con siete capturadas la lista enseña tres y «y 4 más», no siete renglones (van ' + li.length + ': ' + li.join(' | ') + ')');
  cierto(await p.evaluate(() => /siete partidas|7 partidas/.test(document.getElementById('ai-merge-note').textContent)),
    'y el aviso de arriba sigue diciendo el total');
  await p.evaluate(() => toggleAiMerge());
  await p.waitForTimeout(450);
  cierto(await p.evaluate(() => [...document.querySelectorAll('#ai-merge-lista span')]
    .every(s => getComputedStyle(s).display === 'inline' && getComputedStyle(s).backgroundSize.startsWith('100%'))),
    'todos los renglones —también «y 4 más»— se tachan, y son texto en línea: el fondo sigue cada renglón del texto');
  cierto(await p.evaluate(() => {
    const s = document.querySelector('#ai-merge-lista span'); return s.getClientRects().length > 1;
  }), 'la descripción larga da dos renglones, y el tachado los cubre (no una sola raya entre los dos)');
  cierto(await p.evaluate(() => /^Apagado/.test(document.getElementById('ai-merge-note').textContent)
    && !/⚠/.test(document.getElementById('ai-merge-note').textContent)), 'el aviso de apagado va sin emoji');
  cierto(!(await desborde(p)), 'sin desborde horizontal');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 4 · H7 + PIEZA 8 · LA ESPERA SE VE, Y SE APAGA AL TERMINAR ═════════════════════════════
console.log('\nH7 · LA MINIATURA QUE SE LEE  ·  PIEZA 8 · LA TRAZA');
{
  const p = await abrir({});
  await conCliente(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  await p.setInputFiles('#ai-file', PNG());
  await p.waitForTimeout(300);
  /* Cada petición tarda lo mismo, así que la cadena entera son dos: Qwen se cae sin llave y
     Gemini contesta. Se mira en tres momentos, porque lo que se defiende es el ORDEN. */
  await p.evaluate(() => { window.__ia.tarda = 900; });

  p.evaluate(() => aiAnalyze()).catch(() => {});
  await p.waitForTimeout(450);

  cierto(await p.evaluate(() => document.getElementById('ai-pick').classList.contains('trabajando')),
    'mientras analiza, la ficha del archivo se pone a trabajar');
  cierto(await p.evaluate(() => document.querySelector('#ai-pick .ia-marco').offsetWidth > 150),
    'y el marco crece para poder reconocer el plano que se mandó');
  cierto(await p.evaluate(() => {
    const e = document.querySelector('#ai-pick .ia-etapa');
    return !e.hidden && /Analizando|Preparando|Reintentando|Leyendo/.test(e.textContent);
  }), 'la pastilla dice en qué etapa va');
  const enMarcha = await infinitas(p);
  cierto(enMarcha.some(x => /ia-marco/.test(x)), 'la banda recorre la miniatura mientras hay análisis');
  cierto(enMarcha.length <= 2, 'y no hay tres cosas girando por la misma espera (van ' + enMarcha.length + ')');
  /* La traza avanza por lo que pasó de verdad, y en orden. Primero: el archivo ya está listo y
     Qwen —que es el primero de la cadena— está esperando respuesta. */
  cierto(await p.evaluate(() => {
    const a = document.querySelector('#ai-traza li[data-clave="archivo"]');
    return a && a.dataset.estado === 'ok';
  }), 'el paso del archivo ya está palomeado: la traza avanza por hechos, no por un reloj');
  cierto(await p.evaluate(() => {
    const q = document.querySelector('#ai-traza li[data-clave="qwen"]');
    return q && q.dataset.estado === 'trabaja';
  }), 'y el primer proveedor de la cadena se ve preguntando');
  cierto(await p.evaluate(() => !document.querySelector('#ai-traza li[data-clave="gemini"]')),
    'el que todavía no se ha intentado no aparece: la traza no inventa progreso');

  await p.waitForTimeout(900);
  cierto(await p.evaluate(() => {
    const q = document.querySelector('#ai-traza li[data-clave="qwen"]');
    return q && q.dataset.estado === 'salta' && /llave/.test(q.textContent);
  }), 'el proveedor sin llave se queda como saltado, no como fallo: no es lo mismo');
  cierto(await p.evaluate(() => {
    const g = document.querySelector('#ai-traza li[data-clave="gemini"]');
    return g && g.dataset.estado === 'trabaja';
  }), 'y el siguiente ya se ve trabajando');

  await p.waitForTimeout(1800);
  cierto(!(await p.evaluate(() => document.getElementById('ai-pick').classList.contains('trabajando'))),
    'al terminar, la ficha deja de trabajar');
  cierto(await p.evaluate(() => document.querySelector('#ai-pick .ia-etapa').hidden), 'y la pastilla se retira');
  const reposo = await infinitas(p);
  cierto(reposo.length === 0, 'y no queda NADA moviéndose en reposo'
    + (reposo.length ? ' — se mueven: ' + reposo.join(', ') : ''));
  cierto(await p.evaluate(() => document.getElementById('ai-traza').dataset.estado === 'ok'
    && /Contestó Gemini/.test(document.getElementById('ai-traza').textContent)),
    'la traza se pliega en «Contestó Gemini en N s»');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 4b · PIEZA 8 · EL REINTENTO Y EL PDF CUENTAN LO QUE PASÓ ═══════════════════════════════
console.log('\nPIEZA 8 · REINTENTO Y PDF');
{
  const p = await abrir({});
  await conCliente(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  await p.setInputFiles('#ai-file', PNG());
  /* Gemini contesta «saturado» una vez: la app espera y vuelve a preguntar. Gemini es el segundo
     de la cadena, así que su espera es la de los de respaldo (1,5 s de fábrica); se acorta para no
     hacer esperar a la prueba, y el resto queda igual. */
  await p.evaluate(() => { window.__ia.tarda = 150; window.__ia.transitorios = 1; AI_ESPERAS_RESPALDO[0] = 700; });
  p.evaluate(() => aiAnalyze()).catch(() => {});
  await p.waitForTimeout(600);
  cierto(await p.evaluate(() => {
    const g = document.querySelector('#ai-traza li[data-clave="gemini"]');
    return g && g.dataset.estado === 'trabaja' && /saturado/.test(g.textContent) && /reintentando en/.test(g.textContent)
      && !/Gemini\s+Gemini/.test(g.textContent.replace(/\s+/g, ' '));
  }), 'mientras espera, el renglón de Gemini dice POR QUÉ espera y cuánto, sin repetir «Gemini Gemini»');
  cierto(await p.evaluate(() => /Reintentando/.test(document.querySelector('#ai-pick .ia-etapa').textContent)),
    'y la pastilla de la miniatura dice «Reintentando»');
  /* El segundo intento tarda más, para poder mirarlo mientras dura: contestado, el detalle vuelve
     a ser solo el modelo. */
  await p.evaluate(() => { window.__ia.tarda = 1500; });
  await p.waitForTimeout(500);
  cierto(await p.evaluate(() => {
    const g = document.querySelector('#ai-traza li[data-clave="gemini"]');
    return g && /intento 2 de 2/.test(g.textContent);
  }), 'al volver a preguntar el mismo renglón dice «intento 2 de 2»: un renglón por proveedor, no uno por intento');
  cierto(await p.evaluate(() => document.querySelectorAll('#ai-traza li[data-clave="gemini"]').length === 1),
    'y sigue siendo UN solo renglón de Gemini');
  await p.waitForTimeout(1800);
  cierto(await p.evaluate(() => !document.getElementById('ai-resumen').hidden), 'el segundo intento sale y el resumen aparece');
  cierto((await infinitas(p)).length === 0, 'y en reposo no queda nada moviéndose');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}
{
  /* Un PDF solo lo lee Gemini: Qwen y DeepSeek ni se intentan, así que ni aparecen en la traza. */
  const p = await abrir({});
  await conCliente(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  await p.setInputFiles('#ai-file', { name: 'plano-de-la-farmacia-de-san-juan-con-un-nombre-larguisimo-de-archivo.pdf',
    mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%fake\n') });
  await p.waitForTimeout(300);
  await p.evaluate(() => { window.__ia.tarda = 900; });
  p.evaluate(() => aiAnalyze()).catch(() => {});
  await p.waitForTimeout(500);
  const t = await p.evaluate(() => [...document.querySelectorAll('#ai-traza li')].map(l => l.dataset.clave));
  cierto(t.includes('gemini') && !t.includes('qwen') && !t.includes('deepseek'),
    'con un PDF la traza solo tiene a Gemini (' + t.join(', ') + ')');
  const marco = await p.evaluate(() => { const m = document.querySelector('#ai-pick .ia-marco').getBoundingClientRect();
    return { r: m.width / m.height, borde: getComputedStyle(document.querySelector('#ai-pick .ai-pick-ph')).borderTopStyle,
             nombre: (() => { const n = document.querySelector('#ai-pick .ai-pick-n'); return n.scrollWidth > n.clientWidth ? 'cortado' : 'entero'; })() }; });
  cierto(marco.r > 2 && marco.r < 2.6, 'el PDF no tiene nada que «leer»: su marco es una franja baja (16:7), no un cuadro 4:3 casi vacío (' + marco.r.toFixed(2) + ')');
  cierto(marco.borde === 'none', 'y sin el punteado rojo de la miniatura chica, que en grande y con «Analizando» encima se leía como error');
  cierto(marco.nombre === 'cortado' && await p.evaluate(() => getComputedStyle(document.querySelector('#ai-pick .ai-pick-n')).textOverflow === 'ellipsis'),
    'el nombre larguísimo se corta con puntos suspensivos y no ensancha la ficha');
  cierto(!(await desborde(p)), 'sin desborde horizontal con un nombre de archivo de setenta letras');
  await p.waitForTimeout(1500);
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 5 · H7 · EL ERROR QUEDA SOBRE LA IMAGEN, CON «REINTENTAR» ══════════════════════════════
console.log('\nH7 · EL ERROR Y SU REINTENTO');
{
  const p = await abrir({ dedo: true });
  await conCliente(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  await p.setInputFiles('#ai-file', PNG());
  await p.evaluate(() => { window.__ia.falla = true; window.__ia.tarda = 200; });
  await p.evaluate(() => aiAnalyze());
  await p.waitForTimeout(600);

  cierto(await p.evaluate(() => document.getElementById('ai-pick').classList.contains('mal')),
    'cuando la IA no puede, la ficha se queda marcada');
  cierto(await p.evaluate(() => {
    const v = document.querySelector('#ai-pick .ia-velo');
    return !v.hidden && /filtros|bloqueó|no se pudo/i.test(v.textContent);
  }), 'y el motivo queda encima de la imagen, en corto');
  /* §4.3: el velo va sobre la figura, nunca sobre texto. Se comprueba con las cajas: el nombre
     del archivo tiene que quedar fuera del rectángulo del velo. */
  cierto(await p.evaluate(() => {
    const v = document.querySelector('#ai-pick .ia-velo').getBoundingClientRect();
    const t = document.querySelector('#ai-pick .ai-pick-n').getBoundingClientRect();
    return t.top >= v.bottom - 1 || t.bottom <= v.top + 1;
  }), 'el velo no cae sobre el texto del nombre del archivo');
  cierto(await p.evaluate(() => {
    const b = document.querySelector('#ai-pick .ia-velo-re');
    return b.getBoundingClientRect().height >= 44;
  }), '«Reintentar» mide 44 px de alto: se toca con el pulgar');

  await p.evaluate(() => { window.__ia.falla = false; window.__ia.tarda = 200; });
  await p.tap('#ai-pick .ia-velo-re');
  await p.waitForTimeout(1600);
  cierto(await p.evaluate(() => document.querySelector('#ai-pick .ia-velo').hidden),
    'el reintento con el dedo vuelve a analizar y el velo se va');
  cierto(await p.evaluate(() => !document.getElementById('ai-resumen').hidden),
    'y esta vez sí sale el resumen');
  cierto((await infinitas(p)).length === 0, 'tras el error resuelto no queda nada en bucle');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 5b · H7 · UN SEGUNDO ERROR NO SE COME LA PALABRA «REINTENTAR», Y UN DOBLE TOQUE PAGA UNA VEZ
console.log('\nH7 · EL SEGUNDO ERROR Y EL DOBLE TOQUE');
{
  const p = await abrir({ dedo: true });
  await conCliente(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  await p.setInputFiles('#ai-file', PNG());
  await p.evaluate(() => { window.__ia.falla = true; window.__ia.tarda = 250; });
  await p.evaluate(() => aiAnalyze());
  await p.waitForTimeout(400);
  cierto(await p.evaluate(() => document.activeElement === document.querySelector('#ai-pick .ia-velo-re')),
    'con el error a la vista el foco cae en «Reintentar»: con el teclado no hay que recorrer el modal desde arriba');
  /* Dos toques seguidos sobre «Reintentar»: solo el primero paga. Cada análisis son dos llamadas a
     Gemini (sus dos modelos); Qwen ya se marcó sin llave en el primero. */
  const antes = await p.evaluate(() => window.__ia.llamadas);
  /* Dos clics en el mismo golpe: el primero desaparece el velo, así que con `tap` el segundo ni
     siquiera encontraría el botón; así se llega a la guardia de verdad. */
  await p.evaluate(() => { const b = document.querySelector('#ai-pick .ia-velo-re'); b.click(); b.click(); });
  await p.waitForTimeout(1500);
  const despues = await p.evaluate(() => window.__ia.llamadas);
  cierto(despues - antes === 2, 'dos toques seguidos en «Reintentar» pagan UN análisis (' + (despues - antes) + ' llamadas, no 4)');
  const b = await p.evaluate(() => { const bt = document.querySelector('#ai-pick .ia-velo-re'), t = bt.querySelector('.estado-t');
    return { txt: bt.textContent.trim(), h: bt.getBoundingClientRect().height, cortado: t ? t.scrollWidth > t.clientWidth + 1 : false,
             motivo: document.querySelector('#ai-pick .ia-velo-motivo').textContent }; });
  cierto(/^No se pudo · Reintentar$/.test(b.txt), 'tras el segundo error el botón dice «No se pudo · Reintentar» (dice: «' + b.txt + '»)');
  cierto(!b.cortado, 'y la palabra «Reintentar» no sale cortada con puntos suspensivos');
  cierto(/filtros/.test(b.motivo), 'el motivo largo se lee arriba, en el velo, que tiene el sitio para él');
  cierto(b.h >= 44, 'el botón sigue midiendo 44 px');
  cierto(await p.evaluate(() => document.querySelector('#ai-pick .ia-velo-re').getAttribute('aria-busy') !== 'true'),
    'y ya no está ocupado: se puede volver a tocar');
  await p.evaluate(() => { window.__ia.falla = false; });
  await p.tap('#ai-pick .ia-velo-re');
  await p.waitForTimeout(1500);
  cierto(await p.evaluate(() => document.querySelector('#ai-pick .ia-velo').hidden && !document.getElementById('ai-resumen').hidden),
    'el tercero sale bien: se va el velo y aparece el resumen');
  cierto(await p.evaluate(() => document.querySelector('#ai-pick .ia-velo-re').textContent.trim() === 'Reintentar'),
    'y el botón vuelve a decir «Reintentar», sin rastro del error anterior');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 6 · H1 · EL RESUMEN, Y QUE EL MODAL YA NO SE CIERRA SOLO ═══════════════════════════════
console.log('\nH1 · EL RESUMEN ANTES DE CERRAR');
{
  const p = await abrir({});
  await conCliente(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  await p.setInputFiles('#ai-file', PNG());
  await p.evaluate(() => aiAnalyze());
  await p.waitForTimeout(600);

  /* Lo primero, porque es lo que se vuelve a colar sin dar ningún error: el cierre a 1,5 s. */
  await p.waitForTimeout(2200);
  cierto(await p.evaluate(() => document.getElementById('aimodal').classList.contains('show')),
    'pasados tres segundos el modal SIGUE abierto: ya no se cierra solo');

  const r = await p.evaluate(() => {
    const b = document.getElementById('ai-resumen');
    const filas = [...b.querySelectorAll('.ia-p')].map(li => ({ e: li.dataset.e, txt: li.innerText }));
    return { oculto: b.hidden, filas, pri: b.querySelectorAll('.btn-pri').length,
             cabeza: b.querySelector('.ia-resumen-t').innerText, quien: (b.querySelector('.ia-resumen-quien') || {}).innerText || '' };
  });
  cierto(!r.oculto && r.filas.length === 3, 'se ve un renglón por partida detectada (' + r.filas.length + ')');
  cierto(r.filas.filter(f => f.e === 'ok').length === 2 && r.filas.filter(f => f.e === 'av').length === 1,
    'dos ya cotizan y una pide lo que le falta');
  cierto(/[Ff]alta material/.test(r.filas.find(f => f.e === 'av').txt),
    'el «!» ámbar va con la palabra, no solo con el color');
  cierto(r.pri === 1, 'hay UN solo botón con relleno en el resumen (van ' + r.pri + ')');
  cierto(/3 partidas/.test(r.cabeza) && /\$/.test(r.cabeza), 'la cabecera dice cuántas leyó y cuánto suman');
  cierto(/Qwen/.test(r.quien) && /Gemini/.test(r.quien),
    'y dice que contestó otra IA, que es lo que cambia cómo se revisa el borrador');

  cierto(await p.evaluate(() => document.activeElement === document.querySelector('#ai-resumen [data-ia="ver"]')),
    'el foco cae en «Ver partidas»: al volver de la espera, Enter hace lo que toca');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  cierto(!(await p.evaluate(() => document.getElementById('aimodal').classList.contains('show'))),
    '«Ver partidas» con el teclado cierra el modal');
  cierto(await p.evaluate(() => Q.items.length === 3), 'y las tres partidas están en la cotización');
  cierto(!(await desborde(p)), 'sin desborde horizontal');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 6b · H1 · CON EL RESUMEN A LA VISTA, EL MODAL CAMBIA DE FASE ═══════════════════════════
console.log('\nH1 · LA FASE DEL RESUMEN');
{
  const p = await abrir({});
  await conCliente(p);
  await unaPartidaMia(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  await p.setInputFiles('#ai-file', PNG());
  await p.evaluate(() => aiAnalyze());
  await p.waitForTimeout(1500);
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, sel);
  cierto(!(await vis('#ai-go-btn')), '«Analizar y cotizar» se va: un solo botón con relleno en pantalla, y es «Ver partidas»');
  cierto(!(await vis('#ai-merge-box')), 'y el interruptor de «Conservar» también: ya no hay nada que conservar ni que reemplazar');
  cierto(await p.evaluate(() => { const a = [...document.querySelectorAll('#aimodal .btn-pri')].filter(b => b.getClientRects().length > 0);
    return a.length === 1 && a[0].dataset.ia === 'ver'; }),
    'contando TODO el modal, el único botón con relleno a la vista es «Ver partidas»');

  /* Los importes van difuminados mientras la cotización es borrador, como en el resto del cotizador. */
  const blur = () => p.evaluate(() => [...document.querySelectorAll('#ai-resumen .ia-precio, #ai-resumen .ia-resumen-t .lt')]
    .map(e => getComputedStyle(e).filter));
  const f1 = await blur();
  cierto(f1.length >= 3 && f1.every(x => /blur/.test(x)), 'los importes del resumen —el de cada partida y la suma— salen difuminados (' + f1.length + ' importes)');
  /* Mantener tocado los destapa, con el mismo gesto de todo el cotizador. */
  await p.dispatchEvent('#ai-resumen .ia-precio', 'pointerdown', { bubbles: true });
  await p.waitForTimeout(350);           // el difuminado se suelta en 160 ms: se mide ya terminado
  cierto((await blur()).every(x => x === 'none'), 'con el dedo sostenido se destapan todos a la vez');
  await p.dispatchEvent('#ai-resumen .ia-precio', 'pointerup', { bubbles: true });
  await p.waitForTimeout(350);
  cierto((await blur()).every(x => /blur/.test(x)), 'y al soltar se vuelven a tapar');

  /* Elegir otro archivo devuelve el modal a su primera fase. */
  const nodo = await p.evaluate(() => { document.querySelector('#ai-resumen .ia-p').__marca = 1; return true; });
  await p.setInputFiles('#ai-file', { name: 'otro.png', mimeType: 'image/png', buffer: PNG().buffer });
  await p.waitForTimeout(300);
  cierto(await p.evaluate(() => document.getElementById('ai-resumen').hidden), 'al elegir otro archivo el resumen del anterior se va');
  cierto(await vis('#ai-go-btn') && await vis('#ai-merge-box'), 'y vuelven «Analizar y cotizar» y «Conservar»');
  cierto(await p.evaluate(() => /4 partidas/.test(document.getElementById('ai-merge-note').textContent)),
    'el aviso de «Conservar» recuenta: las tres de la IA ya son, para el análisis siguiente, partidas capturadas (1 + 3 = 4)');
  cierto(await p.evaluate(() => document.getElementById('ai-traza').hidden), 'y la traza del análisis anterior también se va');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 6c · H1 · «VER PARTIDAS» LLEVA A LA QUE PIDE ALGO, Y NO REGRESA A «CLIENTE» ═════════════
console.log('\nH1 · VER PARTIDAS');
for (const modo of ['ratón', 'dedo', 'teclado']) {
  const p = await abrir({ dedo: modo === 'dedo' });
  await conCliente(p);
  await unaPartidaMia(p);
  /* Cuatro partidas de las suyas más: la que pide algo queda lejos del principio de la lista. */
  await p.evaluate(() => { for (let i = 0; i < 3; i++) Q.items.push(Object.assign({}, Q.items[0], { id: ++pid })); renderItems(); });
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  await p.setInputFiles('#ai-file', PNG());
  await p.evaluate(() => aiAnalyze());
  await p.waitForTimeout(1500);
  const meta = await p.evaluate(() => { const f = aiPartidaFoco(_aiNuevos); return { id: f.id, pide: !aiYaCotiza(f), primera: _aiNuevos[0].id }; });
  cierto(meta.pide && meta.id !== meta.primera, modo + ' · el destino es la partida del «!» (id ' + meta.id + '), no la primera de la IA (id ' + meta.primera + ')');
  if (modo === 'ratón') await p.click('#ai-resumen [data-ia="ver"]');
  else if (modo === 'dedo') await p.tap('#ai-resumen [data-ia="ver"]');
  else { await p.keyboard.press('Enter'); }
  await p.waitForTimeout(1300);
  const r = await p.evaluate(id => { const e = document.getElementById('p-' + id), b = e.getBoundingClientRect();
    return { cerrado: !document.getElementById('aimodal').classList.contains('show'), pantalla: _pantalla,
             arriba: b.top, alto: innerHeight, scroll: scrollY, foco: document.activeElement && document.activeElement.tagName }; }, meta.id);
  cierto(r.cerrado, modo + ' · el modal se cierra');
  cierto(r.pantalla === 'partidas', modo + ' · y la app se queda en partidas');
  cierto(r.scroll > 100 && r.arriba > -40 && r.arriba < r.alto * 0.6, modo + ' · la partida del «!» quedó a la vista (arriba a ' + Math.round(r.arriba) + ' px, scroll ' + Math.round(r.scroll) + ')');
  cierto(p.__errs.length === 0, modo + ' · sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}
{
  /* Escape también cierra el modal con el resumen a la vista, y no deja nada a medias. */
  const p = await abrir({});
  await conCliente(p);
  await unaPartidaMia(p);
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  await p.setInputFiles('#ai-file', PNG());
  await p.evaluate(() => aiAnalyze());
  await p.waitForTimeout(1500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  cierto(!(await p.evaluate(() => document.getElementById('aimodal').classList.contains('show'))), 'Escape cierra el modal con el resumen a la vista');
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(300);
  cierto(await p.evaluate(() => document.getElementById('ai-resumen').hidden && !document.getElementById('aimodal').classList.contains('con-resumen')),
    'y al volver a abrirlo, el modal nace en su primera fase, sin el resumen de antes');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 7 · H1 · LAS COTAS DEL ESCALADOR, UNA POR UNA, Y EL «USAR» DE LO QUE LEYÓ ══════════════
console.log('\nH1 · LAS MEDIDAS QUE SE MANDARON A MEDIR');
{
  const p = await abrir({});
  await conCliente(p);
  /* Se entra como se entra de verdad: con la foto ya medida y sus cotas dibujadas encima. */
  await p.evaluate(() => {
    SC.items = [{ cm: 40, label: 'FARMACIA', type: 'v' }, { cm: 120, label: 'cruz', type: 'h' },
                { cm: 80, label: 'cruz', type: 'v' }, { cm: 85, label: 'rótulo bajo', type: 'v' }];
    aiOpen({ origen: 'escalador', mime: 'image/jpeg',
      url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
      medidas: SC.items.map(m => ({ cm: m.cm, label: m.label, dir: m.type })) });
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => aiAnalyze());
  await p.waitForTimeout(1400);

  const c = await p.evaluate(() => [...document.querySelectorAll('#ai-resumen .ia-cota')]
    .map(s => ({ e: s.dataset.e, txt: s.innerText.trim() })));
  cierto(c.length === 4, 'salen las cuatro medidas que se mandaron (van ' + c.length + ')');
  cierto(c.filter(x => x.e === 'ok').length === 3, 'tres quedaron explicadas por una partida');
  const sinPartida = c.find(x => x.e === 'av');
  cierto(!!sinPartida && /85/.test(sinPartida.txt) && /sin partida/.test(sinPartida.txt),
    'y la que se quedó sin partida se nombra por su cifra, no por un número de cuántas faltan');
  cierto(await p.evaluate(() => {
    const b = document.querySelector('#ai-resumen [data-ia="usar"]');
    return b && /Usar/.test(b.textContent);
  }), 'lo que la IA leyó distinto trae su botón «Usar»');
  /* Se marca una fila y se cuentan las medidas ANTES: «Usar» tiene que quitar SU renglón y nada más. */
  await p.evaluate(() => { document.querySelector('#ai-resumen .ia-p').__marca = 1; });
  cierto(await p.evaluate(() => document.querySelector('#ai-resumen [data-ia="usar"]').getBoundingClientRect().height >= 44),
    '«Usar» mide 44 px de alto');
  await p.click('#ai-resumen [data-ia="usar"]');
  await p.waitForTimeout(400);
  cierto(await p.evaluate(() => document.querySelector('#ai-resumen .ia-p').__marca === 1
    && document.querySelectorAll('#ai-resumen .ia-cota').length === 4),
    'y no repinta el resumen: las filas siguen siendo las mismas (no vuelven a entrar) y las cuatro medidas siguen ahí');
  cierto(await p.evaluate(() => document.activeElement === document.querySelector('#ai-resumen [data-ia="ver"]')),
    'y el foco pasa a «Ver partidas», no se pierde en el botón que desapareció');
  cierto(await p.evaluate(() => Q.proy === 'Farmacia San Juan' && document.getElementById('f-proy').value === 'Farmacia San Juan'),
    'y al tocarlo, el proyecto pasa a ser el que leyó la IA');
  cierto(await p.evaluate(() => !document.querySelector('#ai-resumen [data-ia="usar"]')),
    'el botón se retira al usarlo: tocarlo dos veces no tiene que dejar dudas');
  cierto(p.__errs.length === 0, 'sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
  await p.__ctx.close();
}

// ═══ 8 · EL MISMO CAMINO A 360 Y 420, EN CLARO Y OSCURO, CON Y SIN MOVIMIENTO ═══════════════
console.log('\nEL MISMO CAMINO EN LAS OCHO COMBINACIONES');
for (const ancho of [360, 420]) {
  for (const tema of ['claro', 'oscuro']) {
    for (const rm of [false, true]) {
      const etq = `${ancho} px · ${tema}${rm ? ' · menos movimiento' : ''}`;
      const p = await abrir({ ancho, tema, rm, dedo: true });
      await conCliente(p);
      await unaPartidaMia(p);
      await p.evaluate(() => aiOpen());
      await p.waitForTimeout(300);
      await p.setInputFiles('#ai-file', PNG());
      await p.evaluate(() => { window.__ia.tarda = 700; });
      p.evaluate(() => aiAnalyze()).catch(() => {});
      await p.waitForTimeout(500);
      const trabajando = await infinitas(p);
      /* Con menos movimiento la banda se va del todo; sin ella, la etapa la sigue diciendo con
         letra, que es la mitad que informa. */
      const bandaOk = rm ? !trabajando.some(x => /ia-marco/.test(x)) : trabajando.some(x => /ia-marco/.test(x));
      const etapaOk = await p.evaluate(() => {
        const e = document.querySelector('#ai-pick .ia-etapa');
        return !e.hidden && e.textContent.trim().length > 0;
      });
      await p.waitForTimeout(2200);
      const reposo = await infinitas(p);
      const ancho2 = await desborde(p);
      const tema2 = await p.evaluate(() => document.documentElement.getAttribute('data-tema'));
      const resumen = await p.evaluate(() => !document.getElementById('ai-resumen').hidden
        && document.querySelectorAll('#ai-resumen .ia-p').length === 3);
      cierto(tema2 === tema, etq + ' · la página está en el tema que se pidió');
      cierto(bandaOk, etq + ' · la banda ' + (rm ? 'no se pinta' : 'recorre la miniatura mientras trabaja'));
      cierto(etapaOk, etq + ' · la etapa se dice con letra');
      cierto(resumen, etq + ' · el resumen sale con sus tres renglones');
      cierto(reposo.length === 0, etq + ' · nada se mueve en reposo'
        + (reposo.length ? ' — ' + reposo.join(', ') : ''));
      cierto(!ancho2, etq + ' · sin desborde horizontal');
      cierto(p.__errs.length === 0, etq + ' · sin errores de página' + (p.__errs.length ? ': ' + p.__errs[0] : ''));
      await p.__ctx.close();
    }
  }
}

// ═══ 9 · CONTRASTE: NADA DE LO QUE LLEVA TEXTO BAJA DE 4.5:1, MEDIDO SOBRE EL RENDER ═════════
/* El método es el de pruebas/navegador/contraste.mjs —rasterizar el elemento, agrupar sus colores,
   el más frecuente es el fondo y el que más se le aleja en luminancia es el texto—, copiado aquí
   y no importado porque ese archivo mide la app entera al cargarse. Esta zona no estaba en su
   lista: el resumen, el ámbar de «!», las cotas, la pastilla y el velo son de esta ficha, y
   «se ve bien» a ojo es como se coló un 4,48 en otra pieza. */
function leerPNG(buf) {
  let i = 8, idat = [], w, h, bd, ct;
  while (i < buf.length) {
    const ln = buf.readUInt32BE(i), tipo = buf.toString('ascii', i + 4, i + 8);
    const dat = buf.subarray(i + 8, i + 8 + ln);
    i += 12 + ln;
    if (tipo === 'IHDR') { w = dat.readUInt32BE(0); h = dat.readUInt32BE(4); bd = dat[8]; ct = dat[9]; }
    else if (tipo === 'IDAT') idat.push(dat);
    else if (tipo === 'IEND') break;
  }
  if (bd !== 8) throw new Error('PNG de ' + bd + ' bits: se espera 8');
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp, px = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    if (f === 1) for (let x = bpp; x < stride; x++) line[x] = (line[x] + line[x - bpp]) & 255;
    else if (f === 2) for (let x = 0; x < stride; x++) line[x] = (line[x] + prev[x]) & 255;
    else if (f === 3) for (let x = 0; x < stride; x++) { const a = x >= bpp ? line[x - bpp] : 0; line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255; }
    else if (f === 4) for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    line.copy(px, y * stride); prev = line;
  }
  return { w, h, bpp, px };
}
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const Lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const razon = (a, b) => { const l1 = Lum(a), l2 = Lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
function medir(buf) {
  const { w, h, bpp, px } = leerPNG(buf);
  const cuenta = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * bpp;
    if (bpp === 4 && px[o + 3] < 200) continue;
    const k = (px[o] >> 2) + ',' + (px[o + 1] >> 2) + ',' + (px[o + 2] >> 2);
    const v = cuenta.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    v.n++; v.r += px[o]; v.g += px[o + 1]; v.b += px[o + 2];
    cuenta.set(k, v);
  }
  const cols = [...cuenta.values()].map(v => ({ n: v.n, c: [v.r / v.n, v.g / v.n, v.b / v.n] })).sort((a, b) => b.n - a.n);
  if (cols.length < 2) return null;
  const bg = cols[0];
  let fg = null, mejor = -1;
  for (const c of cols.slice(0, 60)) { const d = Math.abs(Lum(c.c) - Lum(bg.c)); if (d > mejor) { mejor = d; fg = c; } }
  return { r: razon(fg.c, bg.c), fg: fg.c.map(Math.round), bg: bg.c.map(Math.round) };
}
console.log('\nCONTRASTE');
const BLANCO = async p => Buffer.from((await p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 8;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 8, 8); return c.toDataURL('image/png'); })).split(',')[1], 'base64');
for (const tema of ['claro', 'oscuro']) {
  const p = await abrir({ tema, dsf: 3 });
  /* El aviso «1 partida tuya + 3 de la IA» —verde, con letra blanca— cae justo sobre el resumen y
     el rasterizado lo mide como si fuera parte de él: se quita de en medio, no es lo que se mide. */
  await p.addStyleTag({ content: '#toast{display:none!important}' });
  await conCliente(p);
  await unaPartidaMia(p);
  const comprobar = async (nombre, sel) => {
    const el = await p.$(sel);
    if (!el) { mal(tema + ' · ' + nombre + ': «' + sel + '» no encontró nada — ¿cambió el marcado?'); return; }
    let buf;
    try { buf = await el.screenshot({ timeout: 5000 }); } catch (_) { mal(tema + ' · ' + nombre + ': no se pudo rasterizar «' + sel + '»'); return; }
    const m = medir(buf);
    if (!m) { console.log('  · ' + nombre + ': un solo color, nada que medir'); return; }
    const txt = `${tema} · ${nombre}: ${m.r.toFixed(2)}:1  rgb(${m.fg}) / rgb(${m.bg})`;
    m.r >= 4.5 ? bien(txt) : mal(txt + '  ← por debajo de 4.5:1');
  };
  /* Fase 1 · el interruptor de «Conservar» con su lista, encendido y apagado (tachado). */
  await p.evaluate(() => aiOpen());
  await p.waitForTimeout(400);
  await comprobar('el aviso de «Conservar» y la lista de lo que se conserva', '#ai-merge-box');
  await p.evaluate(() => toggleAiMerge());
  await p.waitForTimeout(400);
  await comprobar('la lista de lo que se reemplaza, tachada, en ámbar', '#ai-merge-box');
  await p.evaluate(() => toggleAiMerge());
  /* Fase 2 · la carpeta con el archivo encima. */
  await arrastre(p, 'dragenter', true);
  await comprobar('«Suéltalo aquí» y la línea de debajo, con el archivo encima', '#ai-drop');
  await arrastre(p, 'dragleave', true);
  /* Fase 3 · trabajando: la pastilla sobre una imagen BLANCA, que es el peor fondo posible. */
  await p.setInputFiles('#ai-file', { name: 'blanco.png', mimeType: 'image/png', buffer: await BLANCO(p) });
  await p.evaluate(() => { window.__ia.tarda = 1200; });      // dos llamadas: Qwen sin llave y Gemini
  p.evaluate(() => aiAnalyze()).catch(() => {});
  await p.waitForTimeout(700);
  await comprobar('la pastilla de etapa sobre una imagen blanca', '#ai-pick .ia-etapa');
  await comprobar('el renglón de estado mientras trabaja', '#ai-status');
  await p.waitForTimeout(2200);
  /* Fase 4 · el resumen, con los importes a la vista (difuminados no se pueden medir). */
  await p.evaluate(() => togglePreciosALaVista());
  await p.waitForTimeout(300);
  await comprobar('el título del resumen y su línea', '#ai-resumen .ia-resumen-t');
  await comprobar('una partida que ya cotiza', '#ai-resumen .ia-p[data-e="ok"]');
  await comprobar('una partida que pide algo, en ámbar', '#ai-resumen .ia-p[data-e="av"]');
  await comprobar('el renglón de estado con el borrador listo', '#ai-status');
  await comprobar('la traza plegada', '#ai-traza');
  await comprobar('lo que la IA leyó distinto, con su «Usar»', '#ai-resumen .ia-dif');
  await comprobar('el botón «Ver partidas»', '#ai-resumen [data-ia="ver"]');
  await p.evaluate(() => togglePreciosALaVista());
  /* Fase 5 · el error, encima de una imagen BLANCA. */
  await p.evaluate(() => aiClose());
  await p.waitForTimeout(300);
  await p.evaluate(() => aiOpen());
  await p.setInputFiles('#ai-file', { name: 'blanco.png', mimeType: 'image/png', buffer: await BLANCO(p) });
  await p.evaluate(() => { window.__ia.falla = true; window.__ia.tarda = 150; });
  await p.evaluate(() => aiAnalyze());
  await p.waitForTimeout(500);
  await comprobar('el velo de error sobre una imagen blanca, con su motivo', '#ai-pick .ia-marco');
  await p.evaluate(() => aiClose());
  await p.__ctx.close();
  /* Fase 6 · las cotas del escalador, con la que se quedó sin partida. */
  const q = await abrir({ tema, dsf: 3 });
  await q.addStyleTag({ content: '#toast{display:none!important}' });
  await conCliente(q);
  await q.evaluate(() => { SC.items = [{ cm: 40, label: 'a', type: 'v' }, { cm: 120, label: 'b', type: 'h' }, { cm: 80, label: 'c', type: 'v' }, { cm: 85, label: 'd', type: 'v' }];
    aiOpen({ origen: 'escalador', mime: 'image/jpeg', url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
      medidas: SC.items.map(m => ({ cm: m.cm, label: m.label, dir: m.type })) }); });
  await q.waitForTimeout(400);
  await q.evaluate(() => { window.__ia.tarda = 150; });
  await q.evaluate(() => aiAnalyze());
  await q.waitForTimeout(600);
  const c2 = async (nombre, sel) => {
    const el = await q.$(sel); if (!el) { mal(tema + ' · ' + nombre + ': sin elemento'); return; }
    const m = medir(await el.screenshot());
    const txt = `${tema} · ${nombre}: ${m.r.toFixed(2)}:1  rgb(${m.fg}) / rgb(${m.bg})`;
    m.r >= 4.5 ? bien(txt) : mal(txt + '  ← por debajo de 4.5:1');
  };
  await c2('las medidas que se mandaron, con la que se quedó sin partida', '#ai-resumen .ia-cotas');
  await c2('la nota de qué IA contestó', '#ai-resumen .ia-resumen-quien');
  await q.__ctx.close();
}

console.log(fallos ? '\n' + fallos + ' FALLO(S)\n'
  : '\nLa espera se ve, el archivo se reconoce, lo que se reemplaza se lee y el borrador se revisa antes de salir.\n');
await nav.close();
process.exit(fallos ? 1 : 0);
