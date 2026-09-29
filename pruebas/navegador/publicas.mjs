/* LAS PÁGINAS PÚBLICAS Y LA PÁGINA DE «SIN SEÑAL», CON LAS PIEZAS COMPARTIDAS
 * (fichas A1, A2, A3, A14, A17, A19, A20, A23, A26, A27 y A28 del paquete de UI).
 *
 * Son las únicas pantallas que ve alguien de fuera de AL3D —un cliente con su papel en la mano,
 * un revisor de Google—, así que lo que se defiende aquí es lo que se nota delante de esa
 * persona y no se ve mirando el código:
 *
 *   · verificar.html, con el folio que SÍ viene en el papel. El formulario acepta «COT-0042»
 *     tal como sale impreso (y «COT-0042@K7QM», como sale de la liga del QR) y manda a la
 *     hoja lo que se escribió; el código va en doce casillas que aguantan que lo peguen, lo
 *     tecleen con la O donde va el cero y rechazan lo que no es 0-9A-F. La espera son las
 *     tres manchas del logo, y se convierte en el veredicto: un glifo con su palabra, el título
 *     que pasa a ser la respuesta, el sello (uno solo, aunque se consulte dos veces) y el
 *     cotejo renglón por renglón con el papel, con ratón, con el dedo y con el teclado.
 *   · condiciones.html y privacidad.html, SIN una línea de JavaScript propio: el índice que se
 *     pliega en el teléfono y se queda al lado en una pantalla grande (y dice en qué sección
 *     vas), el título que destella al saltar, y el filete de marca que se llena al leer.
 *   · acerca.html: el título que se enciende como neón (una vez, discreto), las cuatro
 *     tarjetas y los créditos, con los tres archivos de licencia que dicen que existen.
 *   · la página de «sin señal y sin copia» del service worker: por su propio camino, con el
 *     service worker de verdad y la red cortada, no leyendo el texto de sw.js.
 *
 * Se recorre a 360 y 420 px, con y sin menos movimiento, en claro y en oscuro, con dedo, con
 * ratón y con teclado. En cada estado: sin error de página, sin desborde de lado y sin una sola
 * animación infinita en reposo (la carga del logo se mueve solo MIENTRAS espera).
 *
 * Los contrastes se miden sobre el render, en los dos temas.
 *
 * Uso:  PUERTO=8927 node pruebas/navegador/publicas.mjs
 *       (con un servidor estático en la raíz del repo: npx http-server -p 8927 -c-1 --silent)
 */

/* Sin esto, `context.route()` no ve las peticiones que hace el service worker, y la página de
   «sin señal» solo aparece cuando la red de VERDAD le falla al worker. Tiene que estar puesto
   antes de lanzar el navegador. */
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const PUERTO = process.env.PUERTO || '8814';
const B = 'http://127.0.0.1:' + PUERTO;
const CAP = process.env.CAPTURAS || '/tmp/publicas-capturas/';
mkdirSync(CAP, { recursive: true });

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0, aciertos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => { aciertos++; };
const cierto = (ok, m, extra) => { if (ok) bien(m); else mal(m + (extra === undefined ? '' : '  → ' + JSON.stringify(extra))); };
const espera = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------------------- el contexto */
/* Un teléfono es dedo (hasTouch + isMobile: `pointer:coarse`, `hover:none`); lo demás, ratón. */
async function abrir({ ancho, alto = 800, reducido = false, tema = 'claro', dedo = true, sw = false, esquema }) {
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, locale: 'es-MX', timezoneId: 'America/Mexico_City',
    hasTouch: dedo, isMobile: dedo, deviceScaleFactor: 1,
    reducedMotion: reducido ? 'reduce' : 'no-preference',
    colorScheme: esquema || (tema === 'oscuro' ? 'dark' : 'light'),
    serviceWorkers: sw ? 'allow' : 'block',
  });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|ERR_FAILED|Failed to load resource/.test(m.text())) errs.push('consola: ' + m.text()); });
  /* Las fuentes de Google no se piden: en esta máquina el proxy las rechaza por certificado y
     eso ensuciaría la consola sin decir nada de lo que se prueba. */
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  return { ctx, p, errs };
}

/* La hoja de mentiras: contesta lo que contestaría la hoja de verdad —«autentica» si el folio
   corto es COT-0042 y el código son los doce de siempre; «no_autentica» si no—, guarda lo que
   le llegó para poder comparar, y se puede hacer caer o tardar. */
const CODIGO_BUENO = 'A1B2C3D4E5F6';
async function hoja(p, opciones = {}) {
  const est = { caida: false, retraso: opciones.retraso || 0, estado: opciones.estado || null, visto: [] };
  await p.route('https://script.google.com/**', async r => {
    let cuerpo = {};
    try { cuerpo = JSON.parse(r.request().postData() || '{}'); } catch (_) {}
    est.visto.push(cuerpo);
    if (est.retraso) await espera(est.retraso);
    if (est.caida) return r.abort('failed');
    const corto = String(cuerpo.f || '').split('@')[0].toUpperCase();
    const cod = String(cuerpo.c || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    const bueno = corto === 'COT-0042' && cod === CODIGO_BUENO;
    const salida = !bueno ? { ok: true, estado: 'no_autentica' }
      : { ok: true, estado: est.estado || 'autentica', folio: 'COT-0042', fecha: '20/09/2026', proyecto: 'Tacos El Güero', total: 11600 };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(salida) });
  });
  return est;
}

/* ------------------------------------------------------------------------ las medidas */
const desborde = p => p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => { try { return a.effect.getComputedTiming().iterations === Infinity; } catch (_) { return false; } })
  .map(a => (a.animationName || a.transitionProperty || a.constructor.name) + ' en ' + ((a.effect.target && (a.effect.target.className && a.effect.target.className.baseVal !== undefined ? a.effect.target.className.baseVal : a.effect.target.className)) || '?')));
/* Lo que todo estado tiene que cumplir. */
async function reposo(p, errs, donde) {
  const d = await desborde(p);
  cierto(d === 0, donde + ': sin desborde de lado', d);
  const inf = await infinitas(p);
  cierto(inf.length === 0, donde + ': nada gira ni late en reposo', inf);
  cierto(errs.length === 0, donde + ': sin errores de página', errs.slice());
  errs.length = 0;
}

/* El contraste de lo que de verdad se pinta: color del texto contra el fondo opaco que queda
   debajo, componiendo las capas translúcidas. Devuelve el peor de los que casan. */
function contrasteDe(p, selector) {
  return p.evaluate(sel => {
    const num = c => (c.match(/[\d.]+/g) || []).map(Number);
    const leer = c => { const m = num(c); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
    const sobre = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const fondoDe = el => {
      const capas = [];
      for (let e = el; e; e = e.parentElement) {
        const bg = leer(getComputedStyle(e).backgroundColor);
        if (bg.a > 0) { capas.push(bg); if (bg.a === 1) break; }
      }
      let base = { r: 255, g: 255, b: 255, a: 1 };
      for (const c of capas.reverse()) base = sobre(c, base);
      return base;
    };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    let peor = Infinity, n = 0;
    for (const el of document.querySelectorAll(sel)) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      const cs = getComputedStyle(el);
      const fondo = fondoDe(el);
      const tinta = sobre(leer(cs.color), fondo);
      const l1 = lum(tinta), l2 = lum(fondo);
      const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      peor = Math.min(peor, r); n++;
    }
    return n ? { peor: Math.round(peor * 100) / 100, n } : null;
  }, selector);
}
async function contrastes(p, lista, donde) {
  for (const [sel, min = 4.5] of lista) {
    const c = await contrasteDe(p, sel);
    if (!c) { mal(donde + ': no hay nada que medir en «' + sel + '»'); continue; }
    cierto(c.peor >= min, donde + ': «' + sel + '» a ' + c.peor + ':1 (mínimo ' + min + ')', c);
  }
}

/* Esperar a que algo pase SIN tronar la tanda: si no pasa, se dice qué se esperaba y se sigue
   (o se devuelve false, para que quien llama lo cuente a su manera). */
async function esperaF(p, fn, arg = null, opciones = { timeout: 4000 }, avisar = true) {
  try { await p.waitForFunction(fn, arg, opciones); return true; }
  catch (_) {
    if (avisar) mal('no ocurrió a tiempo (' + (opciones.timeout || 30000) + ' ms): ' + String(fn).replace(/\s+/g, ' ').slice(0, 110));
    return false;
  }
}

/* Vaciar el código como lo hace una persona: seleccionar todo y borrar. `page.fill('')` no
   sirve aquí: selecciona y manda «Supr», y la pieza deja el cursor al final cada vez que el
   campo toma el foco (las casillas no saben dibujar un cursor a la mitad), así que en un campo
   que no tenía el foco esa selección se pierde antes de borrar. */
async function vaciarCodigo(p) {
  await p.focus('#f-c');
  await p.keyboard.press('Control+A');
  await p.keyboard.press('Backspace');
}

const foto = (p, nombre) => p.screenshot({ path: CAP + nombre + '.png', fullPage: true }).catch(() => {});
const veredictoListo = (p, titulo) => esperaF(p, t => document.getElementById('ver-titulo').textContent === t
  && !!document.querySelector('#ver-est .marca-estado'), titulo, { timeout: 8000 });
const activar = async (p, sel, modo) => {
  if (modo === 'dedo') await p.tap(sel);
  else if (modo === 'teclado') { await p.focus(sel); await p.keyboard.press('Enter'); }
  else await p.click(sel);
};

/* ======================================================================================
   VERIFICAR
   ====================================================================================== */
async function verificarTodo(cfg, modo, etiqueta) {
  const { ctx, p, errs } = await abrir(cfg);
  const est = await hoja(p);
  const d = etiqueta + ' · verificar';

  /* ── sin código: el formulario abierto, y el logo del tema que es ── */
  await p.goto(B + '/verificar.html', { waitUntil: 'load' });
  await esperaF(p, () => document.querySelectorAll('.casillas .casilla').length === 12);
  cierto(await p.$eval('#ver-titulo', e => e.textContent) === '¿Esta cotización es auténtica?', d + ': sin código, el título sigue preguntando');
  cierto(await p.$eval('#ver-form-caja', e => e.open), d + ': sin código, el formulario está abierto (es su única salida)');
  cierto((await p.$$('.casillas-grupo')).length === 3, d + ': las casillas van en tres grupos de cuatro');
  const logo = await p.$eval('.pub-marca img', e => ({ clase: e.className, src: e.getAttribute('src') }));
  cierto(/\blogoimg\b/.test(logo.clase), d + ': el logo lleva .logoimg (falla 4: de noche el «AL» se perdía)', logo);
  cierto(logo.src === (cfg.tema === 'oscuro' ? 'logo-al3d-oscuro.svg' : 'logo-al3d.svg'), d + ': y tema.js le puso el logo de ' + cfg.tema, logo);
  const fuente = await p.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
  cierto(/Sora/.test(fuente), d + ': la página usa la letra de la marca (vidrio.css enlazada)', fuente);
  await reposo(p, errs, d + ' (sin código)');

  /* ── el código: mayúsculas, O→0, I/L→1, y lo que no es hexadecimal se rechaza ── */
  await p.focus('#f-c');
  await p.keyboard.type('o1l1-ab2c');
  await p.keyboard.type('d3e4');
  const casillas = () => p.$$eval('.casilla', xs => xs.map(x => x.textContent).join(''));
  cierto(await casillas() === '0111AB2CD3E4', d + ': «o1l1-ab2c d3e4» queda «0111AB2CD3E4» (O→0, I y L→1, mayúsculas, sin guiones)', await casillas());
  cierto(est.visto.length === 0, d + ': completar el código SIN folio no consulta nada', est.visto);
  await vaciarCodigo(p);
  await p.keyboard.type('g');
  cierto(await p.$eval('#f-c', e => e.value) === '', d + ': la «G» no entra');
  cierto(await p.$eval('.casillas', e => e.classList.contains('rechazo')), d + ': y la fila lo dice (borde rojo, con o sin movimiento)');
  cierto(await esperaF(p, () => /G/.test(document.querySelector('.casillas-voz').textContent), null, { timeout: 2000 }, false),
    d + ': y el lector de pantalla oye qué letra se quitó');
  await vaciarCodigo(p);
  await p.keyboard.insertText('zz');
  cierto(await p.$eval('#f-c', e => e.value) === '', d + ': lo pegado que no es 0-9A-F no entra');

  /* ── el folio como sale en el papel, y el código pegado: consulta solo al completar ── */
  await vaciarCodigo(p);
  await p.fill('#f-f', 'cot-0042');
  await p.focus('#f-c');
  await p.keyboard.insertText('a1b2-c3d4-e5f6');
  await veredictoListo(p, 'Auténtica.');
  cierto(est.visto.length === 1, d + ': con el folio ya escrito, pegar los doce consulta una sola vez', est.visto);
  cierto(est.visto[0] && est.visto[0].f === 'COT-0042' && est.visto[0].c === CODIGO_BUENO,
    d + ': la hoja recibe el folio tal como está impreso (sin «@»), en mayúsculas, y el código limpio', est.visto[0]);
  cierto(await p.$eval('#f-f', e => e.value) === 'COT-0042', d + ': el folio quedó normalizado en el campo');
  cierto(/f=COT-0042&c=A1B2C3D4E5F6/.test(await p.evaluate(() => location.search)), d + ': la dirección guarda lo consultado');
  cierto(await p.$eval('#ver-est .marca-estado', e => e.dataset.estado) === 'ok', d + ': el veredicto es un glifo ✓ y no el anillo de antes');
  cierto(await p.$eval('#ver-est b', e => e.textContent) === 'Auténtica', d + ': y lleva su palabra al lado (el color nunca va solo)');
  cierto(await p.$eval('#ver-titulo', e => e.textContent) === 'Auténtica.', d + ': el título ya no pregunta: contesta');
  cierto(!!(await p.$('.casillas.acierto')), d + ': las casillas se lavan en verde al acertar');
  cierto((await p.$$('#ver-sello .sello-circular')).length === 1, d + ': hay UN sello');
  cierto(await p.$eval('#ver-sello-caja', e => !e.hidden && /no la imagen/.test(e.textContent)), d + ': con la línea «La prueba es esta dirección, no la imagen»');
  cierto(await p.evaluate(() => /COTIZACIÓN AUTÉNTICA/.test(document.querySelector('#ver-sello textPath').textContent)
    && document.querySelector('#ver-sello textPath').textContent.includes(location.host)), d + ': y el sello lleva la dirección y la leyenda alrededor');
  cierto((await p.$$('#ver-datos .ver-reng')).length === 4 && await p.$eval('#ver-datos', e => !e.hidden), d + ': los cuatro datos para comparar con el papel');
  await p.waitForTimeout(700);
  await reposo(p, errs, d + ' (auténtica)');
  await foto(p, `verificar-autentica-${etiqueta}`);

  /* ── A14 · comparar con el papel, renglón por renglón ── */
  const boton = (cual, v) => `#ver-datos .ver-reng[data-reng="${cual}"] .ver-cot-${v}`;
  for (const cual of ['folio', 'fecha', 'negocio', 'total']) {
    const b = boton(cual, 'si');
    const caja = await p.$eval(b, e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    cierto(caja.h >= 44 && caja.w >= 44, d + ': «Coincide» de ' + cual + ' mide ≥ 44 px', caja);
    if (cual === 'negocio') { await p.focus(b); await p.keyboard.press('Space'); }   // el teclado, con Espacio
    else await activar(p, b, modo);
    await esperaF(p, s => document.querySelector(s).getAttribute('aria-pressed') === 'true', b, { timeout: 2000 });
    cierto(!!(await p.$(b + ' .palomita')), d + ': ' + cual + ' dibuja su palomita');
    cierto(await p.$eval(`#ver-datos .ver-reng[data-reng="${cual}"]`, e => e.classList.contains('coincide')
      && getComputedStyle(e).opacity === '1' && getComputedStyle(e.querySelector('.ver-valor')).opacity === '1'),
      d + ': el renglón queda con su filete verde y SIN atenuarse (el estado no se dice con opacity)');
  }
  cierto(await p.$eval('#ver-cotejo-fin', e => !e.hidden && e.textContent === 'Todo coincide con tu papel.'), d + ': con los cuatro sale «Todo coincide con tu papel»');
  await reposo(p, errs, d + ' (todo coincide)');
  await foto(p, `verificar-coincide-${etiqueta}`);
  await activar(p, boton('total', 'no'), modo);
  await esperaF(p, () => !document.getElementById('ver-alterado').hidden, null, { timeout: 2000 });
  cierto(await p.$eval('#ver-cotejo-fin', e => e.hidden), d + ': un «No coincide» quita el «todo coincide»');
  const alterada = await p.evaluate(() => ({ clase: document.getElementById('ver').className, titulo: document.getElementById('ver-titulo').textContent,
    palabra: document.querySelector('#ver-est b').textContent, glifo: document.querySelector('#ver-est .marca-estado').dataset.estado,
    sello: document.getElementById('ver-sello-caja').hidden }));
  cierto(/\bmal\b/.test(alterada.clase) && alterada.titulo === 'Documento alterado.' && alterada.palabra === 'No coincide con tu papel' && alterada.glifo === 'mal',
    d + ': la TARJETA pasa al aviso de documento alterado (rojo, ✕ y su palabra), no queda un «Auténtica» verde al lado', alterada);
  cierto(alterada.sello, d + ': y el sello de «Auténtica» se va: una captura no puede llevarse los dos mensajes juntos');
  cierto(await p.$eval(boton('total', 'si'), e => e.getAttribute('aria-pressed') === 'false') && await p.$eval(boton('total', 'no'), e => e.getAttribute('aria-pressed') === 'true'),
    d + ': y el renglón cambia de lado (no queda «Coincide» y «No coincide» a la vez)');
  const correo = decodeURIComponent(await p.$eval('#ver-escribir', e => e.getAttribute('href')));
  cierto(/^mailto:eliasgaribi@gmail\.com\?/.test(correo) && /COT-0042/.test(correo) && /no coincide: total\./.test(correo),
    d + ': el correo a AL3D sale con el folio y el dato que no cuadra ya escritos', correo);
  await foto(p, `verificar-alterado-${etiqueta}`);
  await reposo(p, errs, d + ' (no coincide)');
  await activar(p, boton('total', 'no'), modo);
  await esperaF(p, () => document.getElementById('ver-alterado').hidden, null, { timeout: 2000 });
  cierto(await p.$eval('#ver-cotejo-fin', e => e.hidden), d + ': volver a tocar «No coincide» lo desmarca y no dice «todo coincide» con un renglón sin marcar');
  const vuelta = await p.evaluate(() => ({ clase: document.getElementById('ver').className, titulo: document.getElementById('ver-titulo').textContent,
    glifo: document.querySelector('#ver-est .marca-estado').dataset.estado, sello: !document.getElementById('ver-sello-caja').hidden,
    sellos: document.querySelectorAll('#ver-sello .sello-circular').length }));
  cierto(/\bok\b/.test(vuelta.clase) && vuelta.titulo === 'Auténtica.' && vuelta.glifo === 'ok' && vuelta.sello && vuelta.sellos === 1,
    d + ': y la tarjeta vuelve a lo que contestó la hoja, con su sello (uno)', vuelta);

  /* ── consultar otra vez: sigue habiendo UN sello, y el cotejo empieza de cero ── */
  await p.evaluate(() => { document.getElementById('ver-form-caja').open = true; });
  await vaciarCodigo(p);
  await p.focus('#f-c');
  await p.keyboard.insertText(CODIGO_BUENO);
  await esperaF(p, () => document.querySelectorAll('#ver-datos .ver-cot[aria-pressed="true"]').length === 0
    && !document.getElementById('ver-datos').hidden, null, { timeout: 8000 });
  cierto((await p.$$('#ver-sello .sello-circular')).length === 1, d + ': consultar otra vez NO deja dos sellos');
  cierto(est.visto.length === 2, d + ': y fue una consulta más, no dos', est.visto.length);

  /* ── «Ya no vigente» y «Revocada»: el sello sale gris y cruzado ── */
  est.estado = 'superada';
  await vaciarCodigo(p);
  await p.focus('#f-c');
  await p.keyboard.insertText(CODIGO_BUENO);
  await veredictoListo(p, 'Ya no vigente.');
  cierto(await p.$eval('#ver-sello .sello-circular', e => e.classList.contains('gris')) && (await p.$$('#ver-sello .sello-circular')).length === 1,
    d + ': «Ya no vigente»: un solo sello, gris y cruzado');
  cierto(await p.$eval('#ver-est .marca-estado', e => e.dataset.estado) === 'av', d + ': con el glifo de aviso');
  await foto(p, `verificar-no-vigente-${etiqueta}`);
  await reposo(p, errs, d + ' (ya no vigente)');

  /* ── llegar por el QR: formulario plegado y el folio con su «@aparato» tal cual ── */
  est.estado = null;
  await p.goto(B + '/verificar.html?f=COT-0042%40K7QM&c=A1B2-C3D4-E5F6', { waitUntil: 'load' });
  await veredictoListo(p, 'Auténtica.');
  cierto(await p.$eval('#ver-form-caja', e => !e.open), d + ': por el QR, el formulario está plegado en su <details>');
  const visto = est.visto[est.visto.length - 1];
  cierto(visto.f === 'COT-0042@K7QM', d + ': el folio con «@aparato» del QR se manda intacto', visto);
  cierto(await p.$eval('#f-f', e => e.value) === 'COT-0042@K7QM', d + ': y aparece en el campo');
  await p.waitForTimeout(700);
  await reposo(p, errs, d + ' (por el QR)');
  // se abre con el dedo o el teclado, sin guion
  await activar(p, '#ver-form-caja > summary', modo === 'teclado' ? 'teclado' : modo);
  await esperaF(p, () => document.getElementById('ver-form-caja').open, null, { timeout: 2000 });
  cierto(await p.$eval('#ver-form-caja > summary', e => e.getBoundingClientRect().height) >= 44, d + ': el renglón que abre el formulario mide ≥ 44 px');

  /* ── un código que no existe: «No auténtica», el formulario se abre y se vacía en cascada ── */
  await p.goto(B + '/verificar.html?f=COT-0042&c=000000000000', { waitUntil: 'load' });
  await veredictoListo(p, 'No auténtica.');
  cierto(await p.$eval('#ver-est .marca-estado', e => e.dataset.estado) === 'mal', d + ': «No auténtica» con el glifo ✕');
  cierto(await p.$eval('#ver-form-caja', e => e.open), d + ': y el formulario se abre para reintentar');
  cierto(await p.$eval('#ver-sello-caja', e => e.hidden), d + ': sin sello');
  cierto(await esperaF(p, () => document.getElementById('f-c').value === '', null, { timeout: 4000 }, false),
    d + ': el código se vacía en cascada al fallar');
  await p.waitForTimeout(900);
  await foto(p, `verificar-no-autentica-${etiqueta}`);
  await reposo(p, errs, d + ' (no auténtica)');

  /* ── sin respuesta: se reintenta SOLA al volver la señal, una vez por caída ── */
  est.caida = true;
  const antes = est.visto.length;
  await p.goto(B + '/verificar.html?f=COT-0042&c=' + CODIGO_BUENO, { waitUntil: 'load' });
  await esperaF(p, () => /Sin respuesta/.test(document.getElementById('ver-est').textContent) && !!document.querySelector('#ver-est .marca-estado'), null, { timeout: 8000 });
  cierto(await p.$eval('#ver-est .marca-estado', e => e.dataset.estado) === 'av', d + ': «Sin respuesta» con el glifo «!»');
  cierto(await p.$eval('#ver-titulo', e => e.textContent) === '¿Esta cotización es auténtica?', d + ': y el título no afirma nada');
  await p.waitForTimeout(600);
  await foto(p, `verificar-sin-respuesta-${etiqueta}`);
  await reposo(p, errs, d + ' (sin respuesta)');
  est.caida = false;
  await p.evaluate(() => { dispatchEvent(new Event('online')); dispatchEvent(new Event('online')); });
  await veredictoListo(p, 'Auténtica.');
  cierto(est.visto.length === antes + 2, d + ': al volver la señal reintenta una vez (aunque el aviso llegue dos)', est.visto.length - antes);

  /* ── la espera: las tres manchas del logo se mueven MIENTRAS espera y solo entonces ── */
  est.retraso = 1200;
  await p.goto(B + '/verificar.html?f=COT-0042&c=' + CODIGO_BUENO, { waitUntil: 'load' });
  await p.waitForSelector('#ver-est .carga-logo[data-carga="espera"]', { timeout: 4000 });
  cierto(await p.$eval('#ver-titulo', e => e.textContent) === '¿Esta cotización es auténtica?', d + ': esperando, el título pregunta');
  cierto(await p.$eval('#ver-est', e => /Consultando/.test(e.textContent)), d + ': esperando, dice «Consultando» además de moverse');
  const moviendose = await p.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && document.querySelector('#ver-est .carga-logo')?.contains(a.effect.target)).length);
  cierto(moviendose > 0, d + ': las manchas se mueven mientras espera (con menos movimiento, laten en opacidad)', moviendose);
  cierto((await infinitas(p)).length > 0, d + ': (control) el detector ve el movimiento infinito de la espera, así que su «nada en reposo» no es vacío');
  cierto(await p.$eval('#ver-est .carga-logo', e => e.getAttribute('role') === 'status' && /Consultando el registro/.test(e.textContent)), d + ': y el lector oye qué se espera');
  await foto(p, `verificar-espera-${etiqueta}`);
  await veredictoListo(p, 'Auténtica.');
  await p.waitForTimeout(800);
  cierto(!(await p.$('#ver-est .carga-logo')), d + ': al contestar, las manchas se van y queda el glifo');
  await reposo(p, errs, d + ' (después de esperar)');
  est.retraso = 0;

  await ctx.close();
}

/* ======================================================================================
   LAS PÁGINAS DE TEXTO: índice, avance de lectura y salto a una sección
   ====================================================================================== */
const fraccion = p => p.evaluate(() => {
  const m = getComputedStyle(document.querySelector('.pub-avance')).transform.match(/matrix\(([^)]+)\)/);
  return m ? +m[1].split(',')[0] : NaN;
});
async function legales(cfg, modo, etiqueta, pagina, secciones) {
  const { ctx, p, errs } = await abrir(cfg);
  const d = etiqueta + ' · ' + pagina;
  await p.goto(B + '/' + pagina + '.html', { waitUntil: 'load' });
  await p.waitForTimeout(400);
  const grande = cfg.ancho >= 1000;

  /* Cero JavaScript propio: lo defiende la política de la página y el guion que Google lee. */
  const guiones = await p.evaluate(() => [...document.scripts].map(s => s.getAttribute('src') || '(en línea)'));
  cierto(guiones.length === 1 && guiones[0] === 'js/tema.js', d + ': el único guion es tema.js', guiones);

  cierto((await p.$$('.pub-doc-texto h2[id]')).length === secciones && (await p.$$('.pub-indice a')).length === secciones,
    d + ': cada título tiene su id y su renglón en el índice (' + secciones + ')');
  const huerfanos = await p.evaluate(() => [...document.querySelectorAll('.pub-indice a')].filter(a => !document.getElementById(a.getAttribute('href').slice(1))).map(a => a.getAttribute('href')));
  cierto(huerfanos.length === 0, d + ': ningún renglón del índice apunta a un título que no existe', huerfanos);

  cierto(await p.evaluate(() => CSS.supports('selector(:target-current)') && CSS.supports('animation-timeline: scroll(root)')),
    d + ': este Chromium sabe de :target-current y de animation-timeline (si no, lo de abajo no probaría nada)');

  /* ── el filete que se llena al leer (A26) ── */
  const alto = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  cierto(alto > 200, d + ': el documento es más largo que la pantalla', alto);
  const f0 = await fraccion(p);
  cierto(f0 < 0.02, d + ': arriba del todo, el filete de lectura está en 0', f0);
  cierto(await p.evaluate(() => getComputedStyle(document.body, '::before').backgroundColor !== 'rgba(0, 0, 0, 0)'), d + ': y la marca no desaparece al 0 % (la parte vacía va en --a-suave)');
  for (const frac of [0.5, 1]) {
    await p.evaluate(y => scrollTo(0, y), Math.round(alto * frac));
    await p.waitForTimeout(250);
    const f = await fraccion(p);
    cierto(Math.abs(f - frac) < 0.05, d + ': a ' + Math.round(frac * 100) + ' % del documento, el filete lleva ' + Math.round(f * 100) + ' %' + (cfg.reducido ? ' (con menos movimiento también: es información)' : ''), f);
  }
  await p.evaluate(() => scrollTo(0, 0));
  await p.waitForTimeout(200);

  if (!grande) {
    /* ── el teléfono: el índice plegado, y se abre con el dedo o con el teclado ── */
    cierto(await p.$eval('.pub-indice', e => !e.open), d + ': el índice llega plegado en «En esta página»');
    cierto(await p.$eval('.pub-indice > summary', e => e.getBoundingClientRect().height) >= 44, d + ': su renglón mide ≥ 44 px');
    cierto(await p.evaluate(() => getComputedStyle(document.querySelector('.pub-indice .pliegue-flecha')).display !== 'none'), d + ': con su flecha');
    await activar(p, '.pub-indice > summary', modo);
    await esperaF(p, () => document.querySelector('.pub-indice').open, null, { timeout: 2000 });
    await p.waitForTimeout(400);
    const bajos = await p.$$eval('.pub-indice a', xs => xs.map(a => Math.round(a.getBoundingClientRect().height)).filter(h => h < 44));
    cierto(bajos.length === 0, d + ': cada renglón del índice mide ≥ 44 px', bajos);
    await foto(p, `${pagina}-indice-${etiqueta}`);
    await reposo(p, errs, d + ' (índice abierto)');
    /* el salto: a un título de la mitad, que sí puede subir hasta arriba (el último no, porque el
       documento se acaba antes) */
    const destino = await p.$$eval('.pub-indice a', xs => xs[Math.floor(xs.length / 2)].getAttribute('href'));
    if (modo === 'teclado') {
      await p.focus('.pub-indice a:nth-child(1)').catch(() => {});
      await p.evaluate(h => document.querySelector(`.pub-indice a[href="${h}"]`).focus(), destino);
      await p.keyboard.press('Enter');
    } else await activar(p, `.pub-indice a[href="${destino}"]`, modo);
    await esperaF(p, h => location.hash === h, destino, { timeout: 2000 });
    const animacion = await p.evaluate(h => getComputedStyle(document.querySelector(h)).animationName, destino);
    cierto(animacion === (cfg.reducido ? 'none' : 'scFlash'), d + ': al saltar, el título ' + (cfg.reducido ? 'no destella (menos movimiento)' : 'destella una vez'), animacion);
    await p.waitForTimeout(700);
    const sitio = await p.evaluate(h => { const r = document.querySelector(h).getBoundingClientRect(); return { top: Math.round(r.top), alto: innerHeight }; }, destino);
    cierto(sitio.top >= 0 && sitio.top < sitio.alto * 0.4, d + ': y queda a la vista, despegado del filete y sin salirse del documento', sitio);
    /* el que sigue al scroll */
    const actual = await p.evaluate(() => { const a = document.querySelector('.pub-indice a:target-current'); return a ? a.getAttribute('href') : null; })
      .catch(() => 'sin soporte');
    if (actual !== 'sin soporte') cierto(actual !== null, d + ': el índice marca en qué sección vas (:target-current)', actual);
    await p.waitForTimeout(1600);
    await reposo(p, errs, d + ' (después de saltar)');
  } else {
    /* ── la pantalla grande: el índice al lado, siempre a la vista, pegado al scroll ── */
    const caja = await p.evaluate(() => {
      const t = document.querySelector('.pub-doc-texto').getBoundingClientRect(), i = document.querySelector('.pub-indice').getBoundingClientRect();
      return { texto: [Math.round(t.left), Math.round(t.right)], indice: [Math.round(i.left), Math.round(i.right)],
               resumen: getComputedStyle(document.querySelector('.pub-indice > summary')).display,
               posicion: getComputedStyle(document.querySelector('.pub-indice')).position };
    });
    cierto(caja.texto[1] <= caja.indice[0], d + ': el texto y el índice no se encimen', caja);
    cierto(caja.resumen === 'none', d + ': el botón de plegar no está: en una columna al lado no hay nada que plegar', caja.resumen);
    cierto(caja.posicion === 'sticky', d + ': el índice va pegado al scroll', caja.posicion);
    const visibles = await p.$$eval('.pub-indice a', xs => xs.filter(a => a.getBoundingClientRect().height >= 44).length);
    cierto(visibles === secciones, d + ': todos los renglones están a la vista y miden ≥ 44 px', visibles);
    await p.evaluate(() => document.querySelector('.pub-indice a').focus());
    cierto(await p.evaluate(() => document.activeElement && document.activeElement.tagName === 'A' && !!document.activeElement.closest('.pub-indice')), d + ': con el teclado se llega a sus enlaces aunque el <details> esté cerrado');
    await p.evaluate(y => scrollTo(0, y), Math.round(alto * 0.6));
    await p.waitForTimeout(300);
    const pegado = await p.evaluate(() => Math.round(document.querySelector('.pub-indice').getBoundingClientRect().top));
    cierto(pegado >= 0 && pegado < 120, d + ': bajando el documento, el índice se queda arriba', pegado);
    const actual = await p.evaluate(() => { const a = document.querySelector('.pub-indice a:target-current'); return a ? { href: a.getAttribute('href'), peso: getComputedStyle(a).fontWeight } : null; })
      .catch(() => 'sin soporte');
    if (actual !== 'sin soporte') cierto(actual && +actual.peso >= 700, d + ': y marca en negrita la sección que se está leyendo', actual);
    await foto(p, `${pagina}-escritorio-${etiqueta}`);
    await reposo(p, errs, d + ' (escritorio)');
  }

  /* ── el pie lleva «Créditos» ── */
  cierto(await p.$$eval('.pub-pie a', xs => xs.some(a => /acerca\.html#creditos$/.test(a.getAttribute('href')))), d + ': el pie enlaza a «Créditos»');
  await ctx.close();
}

/* ======================================================================================
   ACERCA: el neón del título, las tarjetas y los créditos
   ====================================================================================== */
async function acerca(cfg, etiqueta) {
  const { ctx, p, errs } = await abrir(cfg);
  const d = etiqueta + ' · acerca';
  await p.goto(B + '/acerca.html', { waitUntil: 'load' });
  const grande = cfg.ancho >= 1000;

  cierto((await p.evaluate(() => [...document.scripts].map(s => s.getAttribute('src')))).join() === 'js/tema.js', d + ': el único guion es tema.js');
  /* El neón (A27): el título se lee igual sin el halo, el halo va en un ::after que copia el
     texto y nunca cambia el color del propio título, y se enciende una vez. */
  const titulo = await p.evaluate(() => {
    const h = document.querySelector('h1');
    return { texto: h.textContent, copia: h.dataset.neon, clases: h.className, color: getComputedStyle(h).color };
  });
  cierto(titulo.texto === 'La plataforma del taller' && titulo.copia === titulo.texto && /neon-texto/.test(titulo.clases), d + ': el título es el de siempre y lleva su copia para el halo', titulo);
  await p.waitForTimeout(cfg.reducido ? 1400 : 2600);
  const halo = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('h1'), '::after'); return { opacidad: c.opacity, animacion: c.animationName, sombra: c.textShadow }; });
  cierto(halo.opacidad === '1' && /rgba?\(/.test(halo.sombra), d + ': pasado el encendido, el halo se queda prendido y quieto', halo);
  const alfas = (halo.sombra.match(/rgba\([^)]*\)/g) || []).map(s => +s.split(',')[3].replace(')', ''));
  cierto(alfas.length > 0 && Math.max(...alfas) <= 0.25 + 1e-9, d + ': y es discreto (alfa ≤ .25, no el neón fuerte de autorizar)', alfas);
  cierto((await contrasteDe(p, 'h1')).peor >= 4.5, d + ': el título se lee igual sin el halo (contraste propio)');

  /* Las cuatro tarjetas (A28). */
  const tarjetas = await p.$$eval('.pub-tarjeta', xs => xs.map(x => { const r = x.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width) }; }));
  cierto(tarjetas.length === 4, d + ': «Qué hace» son cuatro tarjetas', tarjetas.length);
  const columnas = new Set(tarjetas.map(t => t.l)).size;
  cierto(columnas === (cfg.ancho > 480 ? 2 : 1), d + ': ' + (cfg.ancho > 480 ? '2 × 2 en pantalla ancha' : 'una columna bajo 480 px'), tarjetas);
  cierto((await p.$$('.pub-tarjeta svg[aria-hidden="true"]')).length === 4, d + ': cada una con su dibujo (adorno: aria-hidden)');
  cierto(await p.$$eval('.pub-tarjeta svg *', xs => xs.every(x => { const cs = getComputedStyle(x); return [cs.fill, cs.stroke].every(c => !/^rgb\(0, 0, 0\)$/.test(c) || c === 'none'); })), d + ': los dibujos salen de los tokens, ninguno se pinta en negro por defecto');

  /* Los créditos (A20). */
  const lista = await p.$$eval('.pub-creditos li', xs => xs.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  for (const nombre of ['SVGnest', 'Leaflet', 'QR Code generator', 'OpenStreetMap', 'Carto', 'React Bits', 'Vengeance UI', 'Skiper UI'])
    cierto(lista.some(t => t.includes(nombre)), d + ': los créditos nombran a ' + nombre);
  cierto(lista.some(t => /Commons Clause/.test(t)) && lista.some(t => /piden atribución/.test(t)), d + ': con la restricción de React Bits y la atribución que pide Skiper');
  const rel = await p.$$eval('.pub-creditos a', xs => xs.filter(a => a.target === '_blank' && !/noopener/.test(a.rel)).length);
  cierto(rel === 0, d + ': los enlaces que abren aparte llevan rel=noopener', rel);
  const archivos = await p.$$eval('.pub-creditos code', xs => xs.map(x => x.textContent));
  cierto(archivos.length === 3, d + ': los tres archivos de licencia que los créditos dicen que existen', archivos);
  for (const a of archivos) {
    const r = await p.evaluate(async ruta => { const x = await fetch('/' + ruta); return { s: x.status, n: (await x.text()).length }; }, a);
    cierto(r.s === 200 && r.n > 100, d + ': ' + a + ' existe y no está vacío', r);
  }
  cierto(await p.$$eval('.pub-pie a', xs => xs.some(a => a.getAttribute('href') === '#creditos')) && !!(await p.$('h2#creditos')), d + ': el pie enlaza a «Créditos» y el título existe');
  await activar(p, '.pub-pie a[href="#creditos"]', grande ? 'raton' : 'dedo');
  await esperaF(p, () => location.hash === '#creditos', null, { timeout: 2000 });
  await p.waitForTimeout(600);
  const top = await p.$eval('#creditos', e => Math.round(e.getBoundingClientRect().top));
  cierto(top >= 0 && top < 300, d + ': el pie lleva a los créditos y quedan a la vista', top);

  await contrastes(p, [['.pub-tarjeta'], ['.pub-creditos li'], ['.pub-creditos a'], ['.pub-lic', 4.5]], d);
  await foto(p, `acerca-${etiqueta}`);
  await reposo(p, errs, d);

  /* El pie de «Créditos» también está en las otras tres páginas. */
  for (const otra of ['verificar', 'condiciones', 'privacidad']) {
    await p.goto(B + '/' + otra + '.html', { waitUntil: 'load' });
    cierto(await p.$$eval('.pub-pie a', xs => xs.some(a => /acerca\.html#creditos$/.test(a.getAttribute('href')))), d + ': ' + otra + '.html enlaza a «Créditos»');
  }
  await ctx.close();
}

/* ======================================================================================
   SIN SEÑAL Y SIN COPIA — con el service worker de verdad y la red del worker cortada
   ====================================================================================== */
async function sinSenal(cfg, etiqueta) {
  const { ctx, p, errs } = await abrir({ ...cfg, sw: true });
  const d = etiqueta + ' · sin señal';
  await p.goto(B + '/verificar.html', { waitUntil: 'load' });
  const listo = await p.evaluate(async () => {
    try {
      await navigator.serviceWorker.register('sw.js');
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('no activó en 15 s')), 15000))]);
      return true;
    } catch (e) { return String(e.message || e); }
  });
  cierto(listo === true, d + ': el service worker activó', listo);
  await p.waitForTimeout(1500);
  /* «Sin copia»: se borran las cachés. «Sin señal»: la petición del worker a esta dirección
     se corta, que es lo que le pasa a un teléfono sin red. */
  await p.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
  let golpes = 0;
  await ctx.route('**/__sin-senal-de-prueba.html', r => { golpes++; r.abort('internetdisconnected'); });
  const r = await p.goto(B + '/__sin-senal-de-prueba.html', { waitUntil: 'load' });
  cierto(r && r.status() === 503, d + ': sigue siendo un 503, no un 200 que se pase por la app', r && r.status());
  cierto(/text\/html/.test(r.headers()['content-type'] || ''), d + ': y es una página HTML de AL3D, no la línea de texto plano');
  cierto(/no-store/.test(r.headers()['cache-control'] || ''), d + ': que no se guarda en ninguna caché');
  cierto(await p.$eval('h1', e => e.textContent) === 'Sin señal' && /ábrela una vez con señal/.test(await p.textContent('main')), d + ': dice qué pasó y qué hacer');
  const boton = await p.$eval('#otra', e => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; });
  cierto(boton.h >= 44 && boton.w >= 44, d + ': el botón «Reintentar» se toca con el dedo', boton);
  const logo = await p.$eval('#logo img', e => ({ ok: e.complete && e.naturalWidth > 0, oscuro: /oscuro/.test(e.currentSrc) }));
  cierto(logo.ok, d + ': el logo llegó (lo sirve la caché de la marca)', logo);
  cierto(logo.oscuro === (cfg.tema === 'oscuro'), d + ': y es el del tema de ' + cfg.tema, logo);
  const apagado = await p.$eval('#logo', e => getComputedStyle(e).filter);
  cierto(/grayscale\(1\)/.test(apagado), d + ': el logo está apagado, en gris', apagado);
  await p.waitForTimeout(300);
  await contrastes(p, [['h1'], ['p:not(.aviso)'], ['button']], d);
  await foto(p, `sin-senal-${etiqueta}`);
  await reposo(p, errs, d);
  const d0 = await desborde(p);
  cierto(d0 === 0, d + ': sin desborde de lado', d0);

  /* Al volver la señal: el logo se enciende y la página recarga sola. */
  const golpesAntes = golpes;
  /* Se lee en el mismo instante del aviso: con menos movimiento la página recarga al momento y
     el nodo ya no existiría un instante después. */
  const alVolver = await p.evaluate(() => {
    dispatchEvent(new Event('online'));
    return { viva: document.getElementById('logo').classList.contains('viva'),
             aviso: document.getElementById('aviso').textContent, rol: document.getElementById('aviso').getAttribute('role') };
  });
  cierto(alVolver.viva, d + ': al volver la señal el logo se enciende', alVolver);
  cierto(/Volvió la señal/.test(alVolver.aviso) && alVolver.rol === 'status', d + ': y lo dice en una región viva', alVolver);
  await p.waitForTimeout(cfg.reducido ? 700 : 1800);
  cierto(golpes > golpesAntes, d + ': después recarga sola (' + (cfg.reducido ? 'sin espera con menos movimiento' : 'tras el encendido') + ')', { golpes, golpesAntes });
  await p.waitForTimeout(400);
  cierto(errs.filter(e => !/ERR_/.test(e)).length === 0, d + ': sin errores', errs);
  await ctx.close();
}

/* ======================================================================================
   LA TANDA
   ====================================================================================== */
console.log('\nVERIFICAR — código en casillas, folio del papel, veredicto, sello y cotejo');
for (const ancho of [360, 420]) for (const reducido of [false, true]) for (const tema of ['claro', 'oscuro']) {
  const etiqueta = `${ancho}-${reducido ? 'quieto' : 'mov'}-${tema}`;
  /* El dedo es el modo del teléfono; el teclado se recorre en cada uno (se alterna con Espacio y
     Enter dentro del cotejo) y el ratón va en la tanda de escritorio. */
  await verificarTodo({ ancho, reducido, tema }, 'dedo', etiqueta);
}
await verificarTodo({ ancho: 1280, alto: 900, dedo: false }, 'raton', '1280-raton-claro');
await verificarTodo({ ancho: 1280, alto: 900, dedo: false, tema: 'oscuro', reducido: true }, 'teclado', '1280-teclado-oscuro-quieto');

console.log('\nCONTRASTE MEDIDO SOBRE EL RENDER — verificar, en claro y oscuro');
for (const tema of ['claro', 'oscuro']) {
  const { ctx, p, errs } = await abrir({ ancho: 360, tema });
  await hoja(p);
  await p.goto(B + '/verificar.html?f=COT-0042&c=' + CODIGO_BUENO, { waitUntil: 'load' });
  await veredictoListo(p, 'Auténtica.');
  await p.waitForTimeout(500);
  /* Primero lo que se ve con el veredicto de la hoja (auténtica: tarjeta verde y sello)… */
  await contrastes(p, [['.ver-est-tx'], ['.ver-est b'], ['.ver-sello-nota'], ['.ver-datos dt'], ['.ver-datos dd'], ['.ver-cot']], 'verificar en ' + tema);
  await p.click('#ver-datos .ver-reng[data-reng="folio"] .ver-cot-si');
  await p.click('#ver-datos .ver-reng[data-reng="fecha"] .ver-cot-no');
  await p.click('#ver-form-caja > summary');
  await p.waitForTimeout(400);
  /* …y luego con un dato que no coincide: la tarjeta pasa a rojo. */
  await contrastes(p, [['.ver-est-tx'], ['.ver-est b'], ['.ver-datos dt'], ['.ver-datos dd'], ['.ver-cot'],
    ['.ver-cot[aria-pressed="true"]'], ['.ver-alterado p'], ['.ver-form-caja > summary'], ['.ver-form-ayuda'], ['.ver-ayuda'],
    ['.ver-form label'], ['.pub-pie a']], 'verificar (alterada) en ' + tema);
  /* Las otras dos tarjetas: rojo («No auténtica») y ámbar («Sin respuesta»), con su palabra en el
     color del estado sobre el fondo del estado, que es donde menos margen hay. */
  await p.goto(B + '/verificar.html?f=COT-0042&c=000000000000', { waitUntil: 'load' });
  await veredictoListo(p, 'No auténtica.');
  await p.waitForTimeout(500);
  await contrastes(p, [['.ver-est-tx'], ['.ver-est b']], 'verificar (no auténtica) en ' + tema);
  await p.unroute('https://script.google.com/**').catch(() => {});
  await p.route('https://script.google.com/**', r => r.abort('failed'));
  await p.goto(B + '/verificar.html?f=COT-0042&c=' + CODIGO_BUENO, { waitUntil: 'load' });
  await esperaF(p, () => /Sin respuesta/.test(document.getElementById('ver-est').textContent) && !!document.querySelector('#ver-est .marca-estado'), null, { timeout: 8000 });
  await p.waitForTimeout(500);
  await contrastes(p, [['.ver-est-tx'], ['.ver-est b']], 'verificar (sin respuesta) en ' + tema);
  await ctx.close();
}

console.log('\nCONDICIONES Y PRIVACIDAD — índice, avance de lectura y salto a una sección');
const PAGINAS = [['condiciones', 9], ['privacidad', 10]];
for (const [pagina, n] of PAGINAS) {
  for (const ancho of [360, 420]) for (const reducido of [false, true]) for (const tema of ['claro', 'oscuro']) {
    const etiqueta = `${ancho}-${reducido ? 'quieto' : 'mov'}-${tema}`;
    await legales({ ancho, reducido, tema }, ancho === 420 ? 'teclado' : 'dedo', etiqueta, pagina, n);
  }
  await legales({ ancho: 1280, alto: 800, dedo: false }, 'raton', '1280-claro', pagina, n);
  await legales({ ancho: 1280, alto: 800, dedo: false, tema: 'oscuro', reducido: true }, 'teclado', '1280-oscuro-quieto', pagina, n);
}
{
  const { ctx, p } = await abrir({ ancho: 360, tema: 'claro' });
  await p.goto(B + '/condiciones.html', { waitUntil: 'load' });
  await contrastes(p, [['.pub-indice > summary'], ['.pub-indice a'], ['.pub-fecha'], ['.pub-entrada']], 'condiciones');
  await p.click('.pub-indice > summary');
  await p.waitForTimeout(400);
  await contrastes(p, [['.pub-indice a']], 'condiciones (índice abierto)');
  await ctx.close();
  const o = await abrir({ ancho: 360, tema: 'oscuro' });
  await o.p.goto(B + '/privacidad.html', { waitUntil: 'load' });
  await o.p.click('.pub-indice > summary');
  await o.p.waitForTimeout(400);
  await contrastes(o.p, [['.pub-indice > summary'], ['.pub-indice a'], ['.pub-fecha'], ['.pub-caja p']], 'privacidad en oscuro');
  await o.ctx.close();
}

console.log('\nACERCA — neón discreto, cuatro tarjetas y créditos');
for (const ancho of [360, 420]) for (const reducido of [false, true]) for (const tema of ['claro', 'oscuro'])
  await acerca({ ancho, reducido, tema }, `${ancho}-${reducido ? 'quieto' : 'mov'}-${tema}`);
await acerca({ ancho: 1280, alto: 800, dedo: false }, '1280-claro');

console.log('\nSIN SEÑAL — el service worker de verdad, sin copia y sin red');
for (const [tema, reducido] of [['claro', false], ['oscuro', false], ['claro', true]])
  await sinSenal({ ancho: 360, alto: 700, tema, reducido }, `360-${reducido ? 'quieto' : 'mov'}-${tema}`);
await sinSenal({ ancho: 420, alto: 800, tema: 'oscuro', reducido: true }, '420-quieto-oscuro');

await nav.close();
console.log('\n' + aciertos + ' comprobaciones bien, ' + fallos + ' mal.  Capturas en ' + CAP);
process.exit(fallos ? 1 : 0);
