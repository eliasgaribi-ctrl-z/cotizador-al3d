/* LAS PIEZAS QUE SEÑALAN, EXPLICAN Y SELLAN, TOCADAS COMO LAS VAN A TOCAR.
 *
 * La sección 4 de js/piezas.js entra en unas veinte pantallas: el globo que explica el precio,
 * el nombre de los iconos, el neón al autorizar, los pasos con su reloj, el riel, las esquinas
 * que caen sobre lo que falta, la carga del logo, el letrero y la búsqueda con fichas. Una pieza
 * frágil aquí se multiplica, y casi ninguna falla con un error: fallan en silencio, y cada
 * síntoma parece de otra cosa.
 *
 *   · el toque largo sobre el bote de la partida, que solo quería saber qué era, la BORRA;
 *   · un Escape con el globo abierto dentro de una hoja se lleva el globo Y la hoja;
 *   · el globo se sale ocho píxeles por la derecha en un teléfono de 360;
 *   · las esquinas caen debajo de la barra fija, o donde estaba el campo antes del scroll;
 *   · el riel deja marcar un paso que no toca;
 *   · algo se queda moviéndose en bucle cuando ya nadie espera nada.
 *
 * Se recorre pruebas/navegador/piezas-senales.html, que monta cada pieza como la montaría una
 * pantalla, a 360 y 420 px, con y sin movimiento reducido, en claro y oscuro: en cada una, una
 * vez con ratón y teclado y otra con el dedo (hasTouch, toques de verdad por el protocolo de
 * Chrome). En todas: ningún error de página, nada desborda a lo ancho y, en reposo, ninguna
 * animación infinita.
 *
 * Uso:  PUERTO=8814 node pruebas/navegador/piezas-senales.mjs
 *       CAPTURAS=/ruta node …  guarda capturas de cada combinación en esa carpeta.
 *       SOLO='360 px · sin movimiento' node …  corre solo las combinaciones que digan eso.
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const PAGINA = B + '/pruebas/navegador/piezas-senales.html';
const CAPTURAS = process.env.CAPTURAS || '';
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0, pasan = 0, combo = '';
const mal = m => { console.log('  ✗ ' + combo + ' · ' + m); fallos++; };
const bien = () => { pasan++; };
const cierto = (v, m) => (v ? bien() : mal(m));
const cerca = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

async function abrirPagina({ ancho, mov, tema, dedo }) {
  const ctx = await nav.newContext({ viewport: { width: ancho, height: 760 }, locale: 'es-MX', timezoneId: 'America/Mexico_City',
    serviceWorkers: 'block', reducedMotion: mov, hasTouch: !!dedo, isMobile: !!dedo });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) { /* nada */ } }, tema);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('consola: ' + m.text()); });
  await p.goto(PAGINA, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  return { ctx, p, errs };
}

/* Lo que se mira en todas: ni errores, ni desborde, ni nada infinito en reposo. */
async function reposo(p, errs, cuando) {
  cierto(!errs.length, cuando + ': sin errores de página — ' + errs.join(' | '));
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  cierto(sw <= iw, cuando + `: nada desborda a lo ancho (${sw} > ${iw})`);
  const inf = await p.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect.getComputedTiming().iterations === Infinity)
    .map(a => { const t = a.effect.target; return (t && (t.className.baseVal ?? t.className)) + ' · ' + a.animationName; }));
  cierto(!inf.length, cuando + ': en reposo no hay animaciones infinitas — ' + inf.join(', '));
}

/* Del globo abierto: su nodo, si está abierto, su rectángulo y el de su ancla. */
const globo = (p, anclaSel) => p.evaluate(sel => {
  const a = document.querySelector(sel);
  const id = a && a.getAttribute('aria-controls');
  const n = id ? document.getElementById(id) : document.querySelector('.vistazo:popover-open');
  if (!n) return null;
  const r = n.getBoundingClientRect(), ra = a ? a.getBoundingClientRect() : null;
  return { abierto: n.matches(':popover-open'), clase: n.className, rol: n.getAttribute('role'), texto: n.textContent.trim(),
    r: { l: r.left, t: r.top, rr: r.right, b: r.bottom }, a: ra && { l: ra.left, t: ra.top, rr: ra.right, b: ra.bottom },
    foco: n.contains(document.activeElement), activo: document.activeElement && (document.activeElement.id || document.activeElement.textContent.trim().slice(0, 20)),
    expandido: a && a.getAttribute('aria-expanded'), vw: innerWidth, vh: innerHeight, abiertos: document.querySelectorAll('.vistazo:popover-open').length };
}, anclaSel);
const esperar = ms => new Promise(r => setTimeout(r, ms));
const tip = p => p.evaluate(() => { const t = document.querySelector('.nombre-tip'); if (!t || !t.matches(':popover-open')) return null;
  const r = t.getBoundingClientRect(); return { texto: t.textContent, t: r.top, b: r.bottom, l: r.left, rr: r.right }; });
const eventos = p => p.evaluate(() => window.V.eventos.slice());
const alCentro = async (p, sel) => { await p.locator(sel).scrollIntoViewIfNeeded(); await p.waitForTimeout(120); };
const fuera = async (p, dedo) => { const h = await p.locator('#t-vistazo').boundingBox(); if (dedo) await p.touchscreen.tap(h.x + 5, h.y + 5); else await p.mouse.click(h.x + 5, h.y + 5); await p.waitForTimeout(150); };

/* =========================== Con ratón y teclado =========================== */
async function conRaton(p, { ancho, mov }) {
  const quieto = mov === 'reduce';

  /* ---- 4 · el globo ---- */
  await alCentro(p, '#precio');
  await p.click('#precio');
  await p.waitForTimeout(250);
  let g = await globo(p, '#precio');
  cierto(g && g.abierto && g.expandido === 'true', 'el precio abre su desglose y dice aria-expanded=true');
  cierto(g && g.r.l >= 0 && g.r.rr <= g.vw && g.r.t >= 0 && g.r.b <= g.vh, 'el desglose cabe en la pantalla');
  cierto(g && (cerca(g.r.t, g.a.b + 8) || cerca(g.r.b, g.a.t - 8)), 'y sale pegado a su ancla (8 px)');
  cierto(g && g.foco, 'el foco entra al globo');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  g = await globo(p, '#precio');
  cierto(g && !g.abierto && g.activo === 'precio', 'Escape lo cierra y devuelve el foco al precio');
  await p.focus('#precio');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  cierto((await globo(p, '#precio')).abierto, 'con el teclado (Enter) también abre');
  await fuera(p);
  cierto(!(await globo(p, '#precio')).abierto, 'tocar fuera lo cierra');
  /* Llamarla otra vez sobre la misma ancla no cuelga un segundo oyente: un clic sigue abriendo. */
  const mismo = await p.evaluate(() => window.Piezas.vistazo('precio', { titulo: 'Cómo sale el precio' }) === window.V.precio);
  await p.click('#precio');
  await p.waitForTimeout(150);
  cierto(mismo && (await globo(p, '#precio')).abierto, 'es idempotente: la segunda llamada es el mismo control y un clic abre una vez');
  await p.keyboard.press('Escape');

  /* El mensaje de WhatsApp: en el teléfono sale como hoja, y «Copiar» cierra y devuelve el foco. */
  await p.focus('#ver-msg');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(250);
  g = await globo(p, '#ver-msg');
  cierto(g && g.abierto && /en-hoja/.test(g.clase) && cerca(g.r.b, g.vh, 2), `a ${ancho} px el mensaje sale como hoja de abajo`);
  await p.keyboard.press('Tab');
  cierto((await p.evaluate(() => document.activeElement.id)) === 'copiar-msg', 'el tabulador sigue dentro del globo, en «Copiar»');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  g = await globo(p, '#ver-msg');
  cierto(!g.abierto && g.activo === 'ver-msg' && (await eventos(p)).includes('copiado'), '«Copiar» hace lo suyo, cierra y el foco vuelve a su botón');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  await p.keyboard.press('Tab');
  await p.keyboard.press('Tab');
  await p.waitForTimeout(100);
  g = await globo(p, '#ver-msg');
  cierto(!g.abierto && g.activo === 'abrir-modal', 'pasando el último control, el globo se cierra y el tabulador sigue después de su botón');

  /* El menú de la cuenta: sale de su esquina, con flechas. */
  await p.click('#cuenta');
  await p.waitForTimeout(250);
  g = await globo(p, '#cuenta');
  cierto(g && g.rol === 'menu' && cerca(g.r.rr, g.a.rr) && g.r.rr <= g.vw - 11, 'el menú de la cuenta se alinea a su botón sin salirse por la derecha');
  cierto((await p.evaluate(() => document.activeElement.textContent)) === 'Ajustes', 'y el foco cae en su primer renglón');
  await p.keyboard.press('ArrowDown');
  cierto((await p.evaluate(() => document.activeElement.textContent)) === 'Cambiar de rol', 'la flecha baja al siguiente');
  await p.keyboard.press('End');
  cierto((await p.evaluate(() => document.activeElement.textContent)) === 'Cerrar sesión', 'Fin va al último');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(100);
  cierto((await p.evaluate(() => document.activeElement.id)) === 'cuenta', 'Escape vuelve al botón de la cuenta');

  /* El «?» declarativo (data-vistazo), pintado con innerHTML. */
  await p.click('[data-vistazo="por-que-plazo"]');
  await p.waitForTimeout(200);
  g = await globo(p, '[data-vistazo="por-que-plazo"]');
  cierto(g && g.abierto && /2\.5 semanas/.test(g.texto), 'el «?» abre su porqué sin que la pantalla llame a nada');
  await p.click('[data-vistazo="por-que-plazo"]');
  await p.waitForTimeout(150);
  cierto(!(await globo(p, '[data-vistazo="por-que-plazo"]')).abierto, 'y el mismo «?» lo cierra');

  /* Delegación: las barras de los meses, un solo globo que cambia de ancla. */
  await alCentro(p, '#meses');
  await p.click('.mes[data-mes="3"]');
  await p.waitForTimeout(150);
  g = await globo(p, '.mes[data-mes="3"]');
  cierto(g && g.abierto && /^abr/.test(g.texto), 'tocar abril abre sus ventas');
  await p.click('.mes[data-mes="8"]');
  await p.waitForTimeout(150);
  g = await globo(p, '.mes[data-mes="8"]');
  cierto(g && g.abierto && /^sep/.test(g.texto) && g.abiertos === 1, 'tocar septiembre cambia el globo de ancla: sigue habiendo uno');
  await p.keyboard.press('Escape');

  /* Una nota sobre una pieza del SVG: no se lleva el foco, describe al ancla. */
  await p.focus('#pz-1');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  g = await globo(p, '#pz-1');
  const desc = await p.evaluate(() => document.getElementById('pz-1').getAttribute('aria-describedby'));
  cierto(g && g.abierto && g.rol === 'note' && /Pieza 1/.test(g.texto) && !g.foco && desc, 'una pieza del anidador enseña su ficha como nota, sin llevarse el foco');
  await fuera(p);

  /* Dentro de una hoja: el globo queda ENCIMA del velo, y un Escape se lleva solo el globo. */
  await alCentro(p, '#abrir-modal');
  await p.click('#abrir-modal');
  await p.waitForTimeout(150);
  await p.click('#precio-modal');
  await p.waitForTimeout(250);
  const encima = await p.evaluate(() => {
    const n = document.getElementById(document.getElementById('precio-modal').getAttribute('aria-controls'));
    const r = n.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return n.matches(':popover-open') && n.contains(e);
  });
  cierto(encima, 'dentro de la hoja, el globo se ve encima del velo');
  await p.keyboard.press('Tab');
  await p.waitForTimeout(100);
  const tab = await p.evaluate(() => ({ activo: document.activeElement.id, velo: !document.getElementById('velo').hidden, abierto: !!document.querySelector('.vistazo:popover-open') }));
  cierto(tab.activo === 'ico-modal' && tab.velo && !tab.abierto, 'el tabulador sale del globo al control que sigue DENTRO de la hoja');
  await p.click('#precio-modal');
  await p.waitForTimeout(200);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  const tras1 = await p.evaluate(() => ({ velo: !document.getElementById('velo').hidden, ev: window.V.eventos.includes('modal-escape'),
    abierto: !!document.querySelector('.vistazo:popover-open') }));
  cierto(tras1.velo && !tras1.ev && !tras1.abierto, 'el primer Escape cierra el globo y la hoja se queda');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  cierto(await p.evaluate(() => document.getElementById('velo').hidden), 'el segundo Escape ya es de la hoja');

  /* ---- los nombres de los iconos (ratón y teclado) ---- */
  await alCentro(p, '#iconos');
  await p.mouse.move(2, 400);
  await p.waitForTimeout(700);                       // el «caliente» de antes se enfría
  const b1 = await p.locator('#ico-deshacer').boundingBox();
  await p.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await p.waitForTimeout(150);
  cierto(!(await tip(p)), 'con ratón, el primer nombre espera');
  await p.waitForTimeout(450);
  let t = await tip(p);
  cierto(t && t.texto === 'Deshacer' && t.b <= b1.y, 'y a los 400 ms sale arriba del icono');
  const b2 = await p.locator('#ico-clientes').boundingBox();
  await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await p.waitForTimeout(80);
  t = await tip(p);
  cierto(t && t.texto === 'Clientes', 'el vecino sale al instante: el grupo sigue caliente');
  const b3 = await p.locator('#ico-duplicar').boundingBox();
  await p.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2);
  await p.waitForTimeout(80);
  t = await tip(p);
  const sinTitle = await p.evaluate(() => !document.getElementById('ico-duplicar').hasAttribute('title'));
  cierto(t && t.texto === 'Duplicar la partida' && sinTitle, 'uno que solo tiene title lo usa, y lo guarda para que el nativo no se encime');
  await p.mouse.move(2, 400);
  await p.waitForTimeout(100);
  cierto(await p.evaluate(() => document.getElementById('ico-duplicar').getAttribute('title') === 'Duplicar la partida'), 'y al salir se lo devuelve');
  await p.waitForTimeout(700);
  const b4 = await p.locator('#con-texto').boundingBox();
  await p.mouse.move(b4.x + b4.width / 2, b4.y + b4.height / 2);
  await p.waitForTimeout(600);
  cierto(!(await tip(p)), 'un botón con su texto a la vista no necesita nombre');
  await alCentro(p, '#lateral');
  const b5 = await p.locator('#lateral button >> nth=1').boundingBox();
  await p.mouse.move(b5.x + b5.width / 2, b5.y + b5.height / 2);
  await p.waitForTimeout(600);
  t = await tip(p);
  cierto(t && /Proyectos/.test(t.texto) && / 2$/.test(t.texto), 'la barra lateral enseña la tecla del atajo');
  await p.mouse.move(2, 400);
  await alCentro(p, '#iconos');
  const antes = await p.evaluate(() => window.__borrados || 0);
  await p.click('#ico-borrar');
  cierto((await p.evaluate(() => window.__borrados || 0)) === antes + 1, 'un clic normal sobre el bote sí borra');
  await p.mouse.move(2, 400);
  await p.focus('#ico-deshacer');
  await p.keyboard.press('Tab');
  await p.waitForTimeout(100);
  t = await tip(p);
  cierto(t && t.texto === 'Clientes', 'con el tabulador, el nombre sale al enfocar');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(100);
  cierto(!(await tip(p)), 'y Escape lo quita');

  /* ---- 7 · el neón: un momento, y se va ---- */
  await alCentro(p, '#s-neon');
  await p.click('#encender');
  await p.click('#encender-titulo');
  await p.click('#encender-logo');
  await p.waitForTimeout(120);
  const n1 = await p.evaluate(() => ({ capa: !!document.querySelector('#sellada .neon-capa'), haz: !!document.querySelector('#sellada .neon-haz'),
    titulo: document.getElementById('titulo-neon').classList.contains('neon-encendido'), copia: !!document.querySelector('#logo .neon-logo-copia'),
    finitas: document.getAnimations().filter(a => a.effect.target && a.effect.target.closest && a.effect.target.closest('#s-neon')).every(a => a.effect.getComputedTiming().iterations !== Infinity) }));
  cierto(n1.capa && n1.titulo && n1.copia, 'la tarjeta, el título y el logo se encienden');
  cierto(quieto ? !n1.haz : n1.haz, quieto ? 'con menos movimiento no hay haz que dé vueltas' : 'el haz recorre el borde');
  cierto(n1.finitas, 'todo lo del neón es finito');
  await p.waitForTimeout(2900);
  const n2 = await p.evaluate(() => ({ capa: !!document.querySelector('.neon-capa,.neon-halo,.neon-logo-copia'),
    clases: ['sellada', 'titulo-neon', 'logo'].map(id => document.getElementById(id).className).join(' | '),
    apagado: document.getElementById('logo').classList.contains('neon-apagado') }));
  cierto(!n2.capa && !/neon-encendido/.test(n2.clases), 'a los 3 s no queda nada del neón');
  cierto(!n2.apagado, 'y el logo se queda encendido');

  /* ---- 8 · la traza: avanza por eventos, con su reloj, y se pliega ---- */
  await alCentro(p, '#traza');
  await p.evaluate(() => window.V.traza.paso('foto', 'Reduciendo la foto', 'trabaja', '6.4 MB'));
  await p.waitForTimeout(1150);
  const r1 = await p.evaluate(() => document.querySelector('#traza [data-clave="foto"] .traza-reloj').textContent);
  cierto(r1 === '1 s', 'el reloj del paso cuenta el tiempo real (' + r1 + ')');
  await p.evaluate(() => { const T = window.V.traza; T.hecho('foto', '1.1 MB'); T.paso('qwen', 'Qwen', 'trabaja'); T.salta('qwen', 'sin llave'); T.paso('gemini', 'Preguntando a Gemini', 'trabaja'); });
  const tr = await p.evaluate(() => ({ estados: [...document.querySelectorAll('#traza .traza-paso')].map(li => li.dataset.estado),
    voz: document.querySelector('#traza .traza-voz').textContent, nace: !!document.querySelector('#traza .nace') }));
  cierto(tr.estados.join() === 'ok,salta,trabaja', 'cada paso guarda su estado: hecho, saltado, trabajando (' + tr.estados + ')');
  cierto(tr.voz === 'Preguntando a Gemini', 'la región viva dice en qué va, sin el reloj');
  cierto(quieto ? !tr.nace : true, 'con menos movimiento los pasos no entran desplazándose');
  const congelado = await p.evaluate(() => document.querySelector('#traza [data-clave="foto"] .traza-reloj').textContent);
  await p.evaluate(() => window.V.traza.terminar({ ok: true, resumen: 'Contestó Gemini en 1 s' }));
  await p.waitForTimeout(1100);
  const tf = await p.evaluate(() => ({ pliegue: !!document.querySelector('#traza details.traza-pliegue:not([open])'),
    resumen: (document.querySelector('#traza .traza-resumen') || {}).textContent, trabaja: !!document.querySelector('#traza [data-estado="trabaja"]'),
    reloj: document.querySelector('#traza [data-clave="foto"] .traza-reloj').textContent }));
  cierto(tf.pliegue && tf.resumen === 'Contestó Gemini en 1 s' && !tf.trabaja, 'al terminar se pliega en su resumen y nada sigue trabajando');
  cierto(tf.reloj === congelado, 'y el reloj de un paso hecho se queda con lo que tardó');
  await p.click('#traza .traza-resumen');
  cierto(await p.evaluate(() => document.querySelector('#traza details').open), 'el resumen se abre para ver por qué tardó');
  await p.evaluate(() => window.V.arranque.paso('datos', null, 'trabaja'));
  await p.waitForTimeout(350);
  const ds = await p.evaluate(() => document.querySelector('#arranque [data-clave="datos"] .traza-reloj').textContent);
  cierto(/^0\.\d s$/.test(ds), 'la traza de marcado fijo se adopta tal cual, con reloj de décimas (' + ds + ')');
  await p.evaluate(() => window.V.arranque.terminar({ ok: true }));

  /* ---- 16 · el riel ---- */
  await alCentro(p, '#caja-riel-v');
  await p.click('#caja-riel-v .riel-boton[data-riel-i="2"]');
  await p.waitForTimeout(80);
  let rv = await p.evaluate(() => ({ actual: document.querySelector('#caja-riel-v [aria-current="step"]').dataset.rielI, ev: window.V.eventos.join(),
    voz: (document.querySelector('#caja-riel-v > .solo-voz') || {}).textContent || '' }));
  cierto(rv.actual === '0' && !/hito-2/.test(rv.ev) && /Sigue: PDF generado/.test(rv.voz), 'el riel no deja marcar un paso que no toca, y dice cuál sigue');
  await p.click('#caja-riel-v .riel-boton[data-riel-i="0"]');
  await p.waitForTimeout(60);
  rv = await p.evaluate(() => ({ estados: [...document.querySelectorAll('#caja-riel-v .riel-paso')].map(li => li.dataset.estado).join(),
    actuales: document.querySelectorAll('#caja-riel-v [aria-current="step"]').length, recien: !!document.querySelector('#caja-riel-v .recien'),
    trans: getComputedStyle(document.querySelector('#caja-riel-v .riel-paso'), '::after').transitionDuration }));
  cierto(rv.estados === 'hecho,actual,pendiente' && rv.actuales === 1, 'el paso que toca se marca y el siguiente pasa a actual');
  cierto(quieto ? !rv.recien && rv.trans === '0s' : rv.recien, quieto ? 'con menos movimiento ni la palomita entra ni el conector se llena' : 'la palomita entra solo cuando cambia');
  await alCentro(p, '#caja-riel-h');
  await p.focus('#caja-riel-h .riel-boton[data-riel-i="1"]');
  await p.keyboard.press('Enter');
  await p.click('#caja-riel-h .riel-boton[data-riel-i="3"]');
  await p.click('#caja-riel-h .riel-boton[data-riel-i="0"]');
  const ev = (await eventos(p)).join();
  cierto(/paso-1/.test(ev) && !/paso-3/.test(ev) && /paso-0/.test(ev), 'horizontal: el actual responde a Enter, adelantarse no, volver a uno hecho sí');
  await alCentro(p, '#caja-lista');
  await p.click('#caja-lista .riel-boton[data-riel-i="1"]');
  await p.click('#caja-lista .riel-boton[data-riel-i="0"]');
  const lista = (await eventos(p)).filter(e => e.startsWith('lista:'));
  cierto(lista.join(' ') === 'lista:actual,hecho,pendiente lista:hecho,hecho,actual', 'la lista de Google Cloud se palomea y el primero sin palomear queda como «vas aquí»');

  /* ---- 17 · las esquinas ---- */
  await p.evaluate(() => scrollTo(0, 0));
  await alCentro(p, '#llevar');
  await p.click('#llevar');
  await p.waitForFunction(() => document.querySelector('.mira.ve.sigue'), null, { timeout: 3500 }).catch(() => {});
  const m = await p.evaluate(() => {
    const n = document.querySelector('.mira.ve'); if (!n) return null;
    const c = document.getElementById('campo-falta').getBoundingClientRect();
    const e = [...n.children].map(i => i.getBoundingClientRect());
    return { c: { l: c.left, t: c.top, r: c.right, b: c.bottom }, e: e.map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })),
      tono: n.dataset.tono, trans: getComputedStyle(n.children[0]).transitionProperty, arriba: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-fijo')) };
  });
  cierto(m && m.c.t >= m.arriba, 'el campo que falta queda debajo de la barra fija, no detrás');
  cierto(m && cerca(m.e[0].l, m.c.l - 4) && cerca(m.e[0].t, m.c.t - 4) && cerca(m.e[3].r, m.c.r + 4) && cerca(m.e[3].b, m.c.b + 4),
    'las cuatro esquinas caen exactamente sobre el campo, con el scroll ya hecho' + (m ? ' ' + JSON.stringify([m.c, m.e[0], m.e[3]]) : ''));
  cierto(m && m.tono === 'av', 'en el tono que se pidió');
  cierto(m && !/transform/.test(m.trans), 'ya cerradas, siguen al campo sin transición');
  await p.waitForFunction(() => window.V.eventos.includes('senal-fin'), null, { timeout: 3000 }).catch(() => {});
  cierto(await p.evaluate(() => window.V.eventos.includes('senal-fin') && !document.querySelector('.mira:popover-open')), 'y se van solas');
  cierto(await p.evaluate(() => document.getElementById('lupa').getContext('2d').getImageData(40, 44, 1, 1).data[3] > 0), 'las mismas esquinas se dibujan en el lienzo de la lupa');

  /* ---- 25 · la carga: se mueve mientras espera y se detiene al terminar ---- */
  await alCentro(p, '#carga');
  await p.click('#consultar');
  await p.waitForTimeout(150);
  const c1 = await p.evaluate(() => document.getAnimations().filter(a => a.effect.target && a.effect.target.closest && a.effect.target.closest('.carga-logo')).map(a => a.animationName));
  cierto(quieto ? c1.join() === 'pulso-lento' : c1.filter(n => n === 'goo-va').length === 3, quieto ? 'con menos movimiento la espera es un pulso lento' : 'los tres círculos se mueven mientras espera');
  await p.evaluate(() => window.V.carga.terminar('ok', 'Registro consultado'));
  await p.waitForTimeout(600);
  const c2 = await p.evaluate(() => ({ estado: document.querySelector('.carga-logo').dataset.carga,
    vivas: document.getAnimations().filter(a => a.playState === 'running' && a.effect.target && a.effect.target.closest && a.effect.target.closest('.carga-logo')).length }));
  cierto(c2.estado === 'ok' && c2.vivas === 0, 'al terminar se queda quieta en la forma del logo');

  /* ---- 26 · el letrero ---- */
  await alCentro(p, '#txt-letrero');
  await p.fill('#txt-letrero', 'PANADERÍA LA ESPIGA DE ORO');
  await p.waitForTimeout(100);
  const l1 = await p.evaluate(() => { const l = document.getElementById('letrero-vista'), pa = l.parentElement, cs = getComputedStyle(pa);
    return { texto: l.textContent, ancho: l.getBoundingClientRect().width, cabe: pa.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      filtro: getComputedStyle(l).filter, label: l.getAttribute('aria-label') }; });
  cierto(l1.texto === 'PANADERÍA LA ESPIGA DE ORO' && l1.ancho <= l1.cabe + 1, `el letrero se escribe mientras se teclea y cabe en su pared (${Math.round(l1.ancho)} de ${Math.round(l1.cabe)})`);
  cierto(/drop-shadow/.test(l1.filtro) && /LED posterior/.test(l1.label), 'aluminio: el halo va detrás (LED posterior)');
  await p.click('#elige-material [data-ficha="acrilico"]');
  const l2 = await p.evaluate(() => { const l = document.getElementById('letrero-vista'); return { cls: l.className, sombra: getComputedStyle(l).textShadow, label: l.getAttribute('aria-label') }; });
  cierto(/letrero-acrilico/.test(l2.cls) && /LED frontal/.test(l2.label) && /0px 0px/.test(l2.sombra), 'acrílico: la cara brilla (LED frontal)');
  const fs = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('letrero-foto')).fontSize));
  cierto(fs > 50 && fs < 62, 'sobre la foto, 40 px de mayúscula piden su cuerpo medido en la tipografía (' + fs + ' px)');

  /* ---- búsqueda con fichas ---- */
  await alCentro(p, '#q');
  await p.fill('#q', 'panaderia');
  const b = await p.evaluate(() => ({ n: document.getElementById('cuenta-h').textContent, marca: [...document.querySelectorAll('#resultados mark')].map(x => x.textContent) }));
  cierto(b.n === '1 de 4' && b.marca.join() === 'Panadería', 'buscar sin acento encuentra y marca «Panadería»');
  await p.fill('#q', '&');
  const amp = await p.evaluate(() => document.getElementById('resultados').innerHTML);
  cierto(/<mark class="coincide">&amp;<\/mark>/.test(amp) && !/&amp;amp;/.test(amp), 'buscar «&» marca el & sin romper el texto');
  await p.fill('#q', '');
  await p.click('#caja-fichas [data-ficha="pdf"]');
  const f1 = await p.evaluate(() => ({ n: document.getElementById('cuenta-h').textContent, pres: [...document.querySelectorAll('#caja-fichas [data-ficha]')].map(x => x.getAttribute('aria-pressed')).join() }));
  cierto(f1.n === '1 de 4' && f1.pres === 'false,true,false', 'la ficha filtra y dice que está presionada');
  await p.click('#caja-fichas [data-ficha="pdf"]');
  cierto((await p.evaluate(() => window.V.fichas.valor())) === 'todas', 'tocar la activa la suelta y vuelve a «Todas»');
  await p.focus('#caja-fichas [data-ficha="venta"]');
  await p.keyboard.press('Space');
  cierto((await p.evaluate(() => window.V.fichas.valor())) === 'venta', 'con el teclado también');
}

/* =========================== Con el dedo =========================== */
async function conDedo(p, ctx) {
  const cdp = await ctx.newCDPSession(p);
  const mantener = async (sel, ms = 700, mover = 0) => {
    await alCentro(p, sel);
    const r = await p.locator(sel).boundingBox();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    if (mover) { await esperar(80); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + mover, y }] }); }
    await esperar(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(60);
  };
  cierto(!(await p.evaluate(() => window.Piezas.punteroFino())), 'con el dedo no hay puntero fino');

  /* El bote de la partida: mantener enseña el nombre y NO borra. */
  const antes = await p.evaluate(() => window.__borrados || 0);
  await mantener('#ico-borrar');
  const t = await tip(p);
  cierto(t && t.texto === 'Borrar partida', 'mantener el dedo sobre el bote enseña su nombre');
  cierto((await p.evaluate(() => window.__borrados || 0)) === antes, 'y ese toque largo NO borra la partida');
  await p.waitForTimeout(1000);
  cierto(!(await tip(p)), 'el nombre se va solo al soltar');
  await p.tap('#ico-borrar');
  await p.waitForTimeout(80);
  cierto((await p.evaluate(() => window.__borrados || 0)) === antes + 1 && !(await tip(p)), 'un toque corto sí borra, sin nombre de por medio');
  await mantener('#ico-deshacer', 700, 30);
  cierto(!(await tip(p)), 'si el dedo se desliza (desplazar la página), no hay nombre');
  await p.waitForTimeout(700);

  /* El globo con el dedo. */
  await alCentro(p, '[data-vistazo="por-que-plazo"]');
  await p.tap('[data-vistazo="por-que-plazo"]');
  await p.waitForTimeout(200);
  let g = await globo(p, '[data-vistazo="por-que-plazo"]');
  cierto(g && g.abierto && g.r.l >= 0 && g.r.rr <= g.vw, 'con el dedo, el «?» abre su globo dentro de la pantalla');
  await fuera(p, true);
  cierto(!(await globo(p, '[data-vistazo="por-que-plazo"]')).abierto, 'un toque fuera lo cierra');
  await p.tap('#ver-msg');
  await p.waitForTimeout(250);
  await p.tap('#copiar-msg');
  await p.waitForTimeout(150);
  cierto(!(await globo(p, '#ver-msg')).abierto && (await eventos(p)).includes('copiado'), 'la hoja del mensaje se copia y se cierra con el dedo');
  await alCentro(p, '#mesa');
  await p.tap('#pz-3');
  await p.waitForTimeout(150);
  g = await globo(p, '#pz-3');
  cierto(g && g.abierto && /Pieza 3/.test(g.texto), 'tocar una pieza de la mesa enseña su ficha');
  await fuera(p, true);

  /* El riel y las fichas con el dedo. */
  await alCentro(p, '#caja-riel-h');
  await p.tap('#caja-riel-h .riel-boton[data-riel-i="2"]');
  await p.tap('#caja-riel-h .riel-boton[data-riel-i="1"]');
  const ev = (await eventos(p)).join();
  cierto(/paso-1/.test(ev) && !/paso-2/.test(ev), 'el riel con el dedo: el que toca sí, el de adelante no');
  await alCentro(p, '#caja-fichas');
  await p.tap('#caja-fichas [data-ficha="venta"]');
  cierto((await p.evaluate(() => window.V.fichas.valor())) === 'venta', 'la ficha responde al dedo');

  /* 44 px de zona táctil en lo tocable de la sección. */
  const bajos = await p.evaluate(() => ['.porque', '.ficha', '.riel-boton'].flatMap(s => [...document.querySelectorAll(s)])
    .filter(e => e.getBoundingClientRect().height < 44).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().height)));
  cierto(!bajos.length, 'con el dedo, lo tocable mide 44 px o más — ' + bajos.join(', '));

  /* Las esquinas, desde un toque. */
  await p.evaluate(() => scrollTo(0, 0));
  await alCentro(p, '#llevar');
  await p.tap('#llevar');
  await p.waitForFunction(() => document.querySelector('.mira.ve.sigue'), null, { timeout: 3500 }).catch(() => {});
  const ok = await p.evaluate(() => {
    const n = document.querySelector('.mira.ve'); if (!n) return false;
    const c = document.getElementById('campo-falta').getBoundingClientRect(), e = n.children[0].getBoundingClientRect();
    return Math.abs(e.left - (c.left - 4)) <= 1.5 && Math.abs(e.top - (c.top - 4)) <= 1.5;
  });
  cierto(ok, 'con el dedo, las esquinas también caen sobre el campo');
  await p.waitForFunction(() => window.V.eventos.includes('senal-fin'), null, { timeout: 3000 }).catch(() => {});
}

for (const ancho of [360, 420]) {
  for (const mov of ['no-preference', 'reduce']) {
    for (const tema of ['claro', 'oscuro']) {
      for (const dedo of [false, true]) {
        combo = `${ancho} px · ${mov === 'reduce' ? 'sin movimiento' : 'con movimiento'} · ${tema} · ${dedo ? 'dedo' : 'ratón y teclado'}`;
        if (process.env.SOLO && !combo.includes(process.env.SOLO)) continue;
        const { ctx, p, errs } = await abrirPagina({ ancho, mov, tema, dedo });
        await reposo(p, errs, 'al cargar');
        try {
          if (dedo) await conDedo(p, ctx); else await conRaton(p, { ancho, mov });
        } catch (e) { mal('la corrida se cayó: ' + e.message.split('\n')[0]); }
        await p.waitForTimeout(400);
        await reposo(p, errs, 'al terminar');
        if (CAPTURAS && !dedo) await p.screenshot({ path: `${CAPTURAS}/piezas-senales-${ancho}-${mov}-${tema}.png`, fullPage: true });
        await ctx.close();
      }
    }
  }
}

await nav.close();
console.log(fallos ? `\n${fallos} FALLO(S) de ${fallos + pasan} comprobaciones.` : `\nLas ${pasan} comprobaciones pasan: las piezas que señalan responden al ratón, al dedo y al teclado.`);
process.exit(fallos ? 1 : 0);
