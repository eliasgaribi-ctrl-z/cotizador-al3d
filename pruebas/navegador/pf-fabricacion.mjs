/* FABRICACIÓN Y CALENDARIO CON LAS PIEZAS COMPARTIDAS, EN UN NAVEGADOR DE VERDAD.
 *
 * Lo que se defiende, y por qué (cada punto trae el ID de su ficha del paquete de UI):
 *
 *   · EL RIEL DEL TALLER CON SUS HITOS (F5). Cada renglón lleva cuatro marcas sobre el riel: rellena
 *     si la etapa real ya llegó a ese hito, roja CON MUESCA (una forma, no solo un color) si quedó
 *     detrás de hoy sin hacerse, hueca si no. El riel sigue `aria-hidden`; el Tablero lo recibe
 *     igual porque pinta el mismo renglón; ya no hay punto `.tal-hoy`.
 *   · CAMBIAR DE MES (F11). Con ‹ › el foco se queda en el MISMO botón (el mismo nodo, no uno
 *     equivalente) y la cabecera no se rehace; con RePág/AvPág y ←/→ el foco cae en el mismo número
 *     de día del mes nuevo; con el dedo, arrastrar más de 48 px cambia de mes (o de semana), menos
 *     regresa el lienzo, lo vertical sigue siendo de la página, y tocar un día lo sigue abriendo.
 *     Con el ratón el arrastre no hace nada (están las flechas).
 *   · AL TOCAR UN DÍA, SU LISTA APARECE A LA VISTA (F18). El encabezado queda entre el borde de
 *     arriba y las barras de abajo, el foco va al título, y si ya estaba a la vista la página NO se
 *     mueve. Un repintado con el día ya abierto no trae `data-recien` ni roba el foco.
 *   · LA FICHA DE CADA DÍA CON EL RATÓN (F26). Espera 400 ms la primera vez, las siguientes salen al
 *     instante, dice lo del `aria-label` partido en renglones, con el dedo no sale, con el teclado
 *     sale al enfocar.
 *   · PROBAR EL PLAZO ANTES DE FIJARLO (F24). Cursor, foco de teclado y dedo deslizado enseñan «Entra
 *     al taller el … · listo el …» con las fechas que salen de `ventanaTaller()`, en días de
 *     CALENDARIO; pasar por un chip no lo guarda; con el dedo, soltar fuera no hace nada y soltar
 *     sobre uno lo toca.
 *   · FECHAS RÁPIDAS (P14). «Hoy · Mañana · sáb 3 · lun 5 · Sin fecha» son radios que escriben en el
 *     campo de fecha de «Se ganó» y se ponen al día si se escribe a mano; con teclado de radio.
 *   · LA BARRA DE ACCIÓN (F29). Es el MISMO botón cuando cambia de rótulo o de acción (el rótulo se
 *     cruza), sube al aparecer, su alto publicado (`--mbar-h`) es el del botón puesto, y se va con
 *     el módulo.
 *   · LA HOJA DE AGENDAR (F19, F17). Tres pasos con su riel, «‹ Otro proyecto» vuelve al buscador
 *     como se dejó, la capa se abre UNA vez (el historial no crece), el paso 3 no se cierra solo, y
 *     la ventana elegida dice qué implica debajo de los chips, con el texto de `Agenda.VENTANA_DESC`.
 *   · LAS CUENTAS RUEDAN (F23). La cifra que cambió rueda; la primera pintura no.
 *   · COPIAR LA ORDEN (F31) confirma en el botón («Copiada», con palomita) sin cambiar su ancho.
 *   · LAS ÓRDENES A CALENDAR (F7). El botón dice qué hace y cuánto lleva, sus hermanos se apagan, un
 *     segundo toque no manda dos peticiones, termina en «Creada» o en «No contestó · Reintentar», y
 *     reintentar funciona.
 *   · LA SILUETA (F16) ya estaba: la pantalla nunca pone «Leyendo el calendario…» encima de la del
 *     router.
 *
 * Cada ronda corre a 360, 420 o 1280 px, con y sin movimiento reducido, en claro y en oscuro;
 * siempre sin errores de página, sin desborde de lado y sin nada moviéndose en reposo. El contraste
 * de lo nuevo se mide contra el render.
 *
 * Necesita navegador y servidor:  PUERTO=8814 node pruebas/navegador/pf-fabricacion.mjs
 * (o pruebas/correr.sh --navegador).
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const PUERTO = process.env.PUERTO || '8814';
const B = 'http://127.0.0.1:' + PUERTO;
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const cierto = (cond, que, extra) => cond ? bien(que) : mal(que, extra);
const dormir = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------------------------------
   Fechas, escritas aquí a propósito y sin importar nada del repo: si la prueba usara las mismas
   funciones que la pantalla, un error de las dos pasaría en verde.
   ------------------------------------------------------------------------------------------ */
const sumar = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + n));
  return f.getUTCFullYear() + '-' + String(f.getUTCMonth() + 1).padStart(2, '0') + '-' + String(f.getUTCDate()).padStart(2, '0');
};
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dc = iso => {
  const [a, m, d] = iso.split('-').map(Number);
  const w = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return DOW[(w + 6) % 7] + ' ' + d + ' ' + MES[m - 1];
};
const DIAS_PLAZO = { 1: 7, 2: 11, 3: 14, 4: 18, 5: 21 };

/* ------------------------------------------------------------------------------------------
   Abrir la plataforma en el Calendario. Un contexto por ronda, con el tema, el rol y el movimiento
   pedidos. Un vigilante del DOM, puesto ANTES de que corra la página, anota lo que pasa aunque
   dure un cuadro: qué cifras rodaron, si el rótulo de la barra se cruzó y si algún «Leyendo…»
   estuvo a la vista.
   ------------------------------------------------------------------------------------------ */
async function abrir({ ancho = 360, alto = 780, tema = 'claro', reducido = false, tactil = true } = {}) {
  const movil = ancho < 760;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, hasTouch: tactil, isMobile: movil && tactil, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block', reducedMotion: reducido ? 'reduce' : 'no-preference',
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B }).catch(() => {});
  await ctx.addInitScript(t => {
    try {
      localStorage.setItem('al3d_tema', t);
      localStorage.setItem('al3d_pf_rol', 'direccion');
      localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
      /* Google Calendar «conectado»: un Client ID pegado y un invitado. El token y la red son falsos
         (abajo); lo que se prueba es el botón. */
      localStorage.setItem('al3d_pf_gcal', JSON.stringify({ clientId: 'prueba.apps.googleusercontent.com', calendarioId: 'primary', invitados: ['uno@prueba.mx'] }));
      /* Dos cotizaciones autorizadas que nadie decidió: la tarjeta que late y la barra «Decidir». */
      if (!localStorage.getItem('al3d_historial')) {
        const letras = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8 };
        const f = (n, c) => ({ folio: 'COT-910' + n, cliente: c, proy: c + ' — anuncio', ts: Date.now() - 86400000,
          estado: 'autorizada', items: [letras], neto: 40000, itemsAuth: { 1: 40000 } });
        localStorage.setItem('al3d_historial', JSON.stringify([f(1, 'Cliente Uno'), f(2, 'Cliente Dos')]));
      }
    } catch (_) {}
    window.google = { accounts: { oauth2: { initTokenClient: () => ({ callback: null,
      requestAccessToken() { setTimeout(() => this.callback({ access_token: 'token-de-prueba', expires_in: 3600 }), 20); } }) } } };
    window.__fab = { rodo: [], rotuloSale: 0, leyendo: false };
    const mirar = () => {
      const c = document.getElementById('mod-fabricacion');
      if (c) {
        for (const b of c.querySelectorAll('.pf-cuentas b.rueda-rodando')) { if (!__fab.rodo.includes(b.dataset.cuenta)) __fab.rodo.push(b.dataset.cuenta); }
        if (/Leyendo el calendario/.test(c.textContent)) __fab.leyendo = true;
      }
      if (document.querySelector('#pf-mbar .rotulo-sale')) __fab.rotuloSale++;
    };
    const arrancar = () => new MutationObserver(mirar).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    if (document.documentElement) arrancar();
    else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); arrancar(); } }).observe(document, { childList: true });
  }, tema);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push('consola: ' + m.text()); });
  await p.goto(B + '/#/hoy', { waitUntil: 'load' });
  await p.waitForFunction(() => !document.getElementById('pf-arranque') && [...document.querySelectorAll('.pf-mod')].some(x => !x.hidden && x.childNodes.length), null, { timeout: 30000 });
  return { ctx, p, errores };
}

const cargado = p => p.waitForFunction(() => {
  const c = document.getElementById('mod-fabricacion');
  return c && !c.hidden && c.querySelector('.pf-cuentas') && !document.querySelector('.pf-esqueleto');
}, null, { timeout: 30000 }).then(() => p.waitForTimeout(500));

/* Se siembra por la CAPA DE DATOS, como en tablero.mjs, para que la prueba recorra `ganar()` y
   `agendar()` de verdad. Las fechas son relativas a hoy:
     p1  instalación en 9 días, plazo de 2 semanas → empezó hace 5 días: lleva dos hitos atrasados
     p2  instalación en 16 días, ya «cortado»      → dos hitos hechos
     p3  instalación en 3 días, sigue en «ganado»  → atrasadísimo
     p4  ganado sin fecha                          → el riel punteado de la hipótesis
   más nueve ganados sin fecha de relleno, para que el buscador de «Agendar» aparezca (> 8). */
const sembrar = p => p.evaluate(async () => {
  const Proy = await import('/js/datos/proyectos.js');
  const Agenda = await import('/js/datos/agenda.js');
  const { masDias, hoyISO } = await import('/js/nucleo/fechas.js');
  const hoy = hoyISO();
  const letras = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8 };
  const cot = (folio, cliente) => ({ folio, cliente, proy: cliente + ' — anuncio', ts: Date.now(), estado: 'autorizada', items: [letras], neto: 40000, itemsAuth: { 1: 40000 } });
  const ids = {};
  for (const [k, folio, cl] of [['p1', 'COT-9001', 'Healthylicious'], ['p2', 'COT-9002', 'Parentesis'], ['p3', 'COT-9003', 'La Perla'], ['p4', 'COT-9004', 'Sin fecha SA']]) {
    const r = await Proy.ganar(cot(folio, cl), {});
    ids[k] = r.ok ? r.valor.id : null;
  }
  for (let i = 1; i <= 9; i++) await Proy.ganar(cot('COT-95' + String(i).padStart(2, '0'), 'Relleno ' + i), {});
  const fechas = { hoy, d1: masDias(hoy, 9), d2: masDias(hoy, 16), d3: masDias(hoy, 3) };
  const a1 = await Agenda.agendar(ids.p1, { fecha: fechas.d1 });
  const a2 = await Agenda.agendar(ids.p2, { fecha: fechas.d2 });
  const a3 = await Agenda.agendar(ids.p3, { fecha: fechas.d3 });
  await Proy.avanzarEtapa(ids.p2, 'cortado');
  const Mat = await import('/js/datos/material.js');
  const cts = await Mat.constantes();
  return { ids, fechas, ok: !!(a1.ok && a2.ok && a3.ok && ids.p1 && ids.p2 && ids.p3 && ids.p4), colchon: Number(cts.PLAZO_COLCHON_DIAS) };
});

async function hasta(p, fn, arg, ms = 6000) {
  const t0 = Date.now();
  for (;;) {
    if (await p.evaluate(fn, arg)) return true;
    if (Date.now() - t0 > ms) throw new Error('se acabó el tiempo esperando a que se cumpliera la condición: ' + String(fn).slice(0, 90));
    await dormir(80);
  }
}
const sinDesborde = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity)
  .filter(a => { const t = a.effect.target; return !(t && t.closest && t.closest('.pf-ia-btn')); })
  .map(a => (a.animationName || a.transitionProperty || '?') + ' en ' + ((a.effect.target && a.effect.target.className) || '?')));
const texto = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const contraste = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const rgba = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const mezcla = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  let fondo = { r: 255, g: 255, b: 255, a: 1 };
  const cadena = []; for (let n = el; n; n = n.parentElement) cadena.push(n);
  for (const n of cadena.reverse()) { const c = rgba(getComputedStyle(n).backgroundColor); if (c.a > 0) fondo = mezcla(c, fondo); }
  const t = mezcla(rgba(getComputedStyle(el).color), fondo);
  const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  const lum = c => .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b);
  const a = lum(t), b = lum(fondo);
  return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100;
}, sel);

/* El dedo de verdad, por el protocolo de Chrome: Playwright solo sabe tocar, y un arrastre con
   `touchmove` es lo que dispara pointermove con pointerType «touch». */
async function deslizar(p, x0, y0, x1, y1, pasos = 8) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= pasos; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / pasos, y: y0 + (y1 - y0) * i / pasos }] });
    await dormir(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach().catch(() => {});
}
/* Lo mismo pero SOLTANDO en otro sitio distinto del último movimiento: apoyar, ir hasta A, esperar,
   y soltar en B. Para «probar el plazo» hace falta poder quedarse a mirar antes de soltar. */
async function deslizarYMirar(p, desde, hasta2, alMirar, suelta) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: desde.x, y: desde.y }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: desde.x + (hasta2.x - desde.x) * i / 6, y: desde.y + (hasta2.y - desde.y) * i / 6 }] });
    await dormir(20);
  }
  await dormir(250);
  const visto = await alMirar();
  const f = suelta || hasta2;
  if (f !== hasta2) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: f.x, y: f.y }] });
  await dormir(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach().catch(() => {});
  return visto;
}
const centro = async (p, sel) => {
  const b = await p.locator(sel).first().boundingBox();
  return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2, b } : null;
};

/* ------------------------------------------------------------------------------------------
   Una ronda: toda la pantalla, con el tema, el ancho, el movimiento y el dispositivo de entrada
   que se pidan.
   ------------------------------------------------------------------------------------------ */
async function ronda(cfg) {
  const nombre = cfg.ancho + ' px · ' + cfg.tema + ' · ' + (cfg.reducido ? 'menos movimiento' : 'con movimiento') +
    ' · ' + (cfg.tactil ? 'dedo' : 'ratón y teclado');
  console.log('\n' + nombre.toUpperCase());
  const { ctx, p, errores } = await abrir(cfg);
  const toca = async sel => {
    const l = p.locator(sel).first();
    await l.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await (cfg.tactil ? l.tap() : l.click());
  };
  const tocaEnCapa = sel => (cfg.tactil ? p.locator(sel).first().tap() : p.locator(sel).first().click());
  const seccion = async (titulo, fn) => {
    console.log(' · ' + titulo);
    try { await fn(); } catch (e) {
      mal(titulo + ': la sección se rompió', String(e && e.message || e).split('\n')[0]);
      for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(250); }
    }
  };
  const teclado = async () => { await p.keyboard.press('Shift'); };     // para que :focus-visible valga
  const mesIso = () => p.evaluate(() => { const c = document.querySelector('.cal-dia[data-dia]'); return c ? c.dataset.dia.slice(0, 7) : null; });
  const titulo = () => texto(p, '.cal-mes');
  const irAlMesDe = async iso => {
    for (let i = 0; i < 14; i++) {
      if (await p.evaluate(d => !!document.querySelector('.cal-dia[data-dia="' + d + '"]'), iso)) return true;
      const a = await mesIso();
      await toca(a < iso.slice(0, 7) ? '[data-mueve="1"]' : '[data-mueve="-1"]');
      await p.waitForTimeout(450);
    }
    return false;
  };
  const cerrarCapas = async () => { for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(200); } };

  const sem = await sembrar(p);
  cierto(sem.ok, 'datos de prueba sembrados por la capa de datos', sem);
  const { ids, fechas } = sem;
  await p.goto(B + '/#/agenda', { waitUntil: 'load' });
  await p.reload({ waitUntil: 'load' });
  await cargado(p);
  await p.evaluate(() => { window.__fab.rodo = []; });
  const mov = !cfg.reducido;

  /* ---------- F16 · la silueta ---------- */
  await seccion('F16 · la pantalla no pone su propio «Leyendo…»', async () => {
    cierto(!(await p.evaluate(() => window.__fab.leyendo)), 'ningún «Leyendo el calendario…» estuvo a la vista');
    cierto(await p.evaluate(() => !document.querySelector('.pf-esqueleto')), 'y la silueta del router ya se fue');
  });

  /* ---------- F23 · primera pintura ---------- */
  await seccion('F23 · la primera pintura no rueda', async () => {
    const cifras = await p.$$eval('#mod-fabricacion .pf-cuentas b[data-cuenta]', bs => bs.map(b => b.dataset.cuenta + '=' + b.textContent));
    cierto(cifras.length >= 3 && cifras.includes('sinfecha=10'), 'las cuentas traen su clave y su cifra', cifras);
    cierto((await p.evaluate(() => window.__fab.rodo.length)) === 0, 'al entrar ninguna cifra giró', await p.evaluate(() => window.__fab.rodo));
  });

  /* ---------- F5 · el riel con sus hitos ---------- */
  await seccion('F5 · el riel del taller con sus hitos', async () => {
    const filas = await p.$$eval('#mod-fabricacion .tal-fila', fs => fs.map(f => ({
      t: f.querySelector('.pf-fila-t').textContent,
      estados: [...f.querySelectorAll('.tal-riel .riel-marca')].map(m => m.dataset.estado),
      muesca: [...f.querySelectorAll('.tal-riel .riel-marca')].map(m => getComputedStyle(m).clipPath !== 'none'),
      oculto: f.querySelector('.tal-pista').getAttribute('aria-hidden'),
      hoy: f.querySelectorAll('.tal-riel .riel-hoy').length,
      viejo: f.querySelectorAll('.tal-hoy').length,
      propuesta: !!f.querySelector('.tal-riel.propuesta'),
    })));
    const de = n => filas.find(f => f.t.includes(n));
    cierto(filas.length >= 4, 'hay un renglón por proyecto', filas.length);
    cierto(JSON.stringify(de('Healthylicious').estados) === '["tarde","tarde","pendiente","pendiente"]', 'Healthylicious (ganado, empezó hace 5 días): dos hitos rojos, dos huecos', de('Healthylicious').estados);
    cierto(JSON.stringify(de('Parentesis').estados) === '["hecho","hecho","pendiente","pendiente"]', 'Parentesis (cortado): dos rellenos, dos huecos', de('Parentesis').estados);
    cierto(JSON.stringify(de('La Perla').estados) === '["tarde","tarde","tarde","pendiente"]', 'La Perla (ganado, instala en 3 días): tres rojos', de('La Perla').estados);
    cierto(de('Sin fecha SA').propuesta && de('Sin fecha SA').estados.length === 4, 'el ganado sin fecha lleva su riel punteado (hipótesis) con las cuatro marcas');
    cierto(de('Healthylicious').muesca.slice(0, 2).every(x => x) && de('Healthylicious').muesca.slice(2).every(x => !x),
      'la marca atrasada lleva MUESCA (clip-path) y las demás no: la forma dice lo que el color');
    cierto(filas.every(f => f.oculto === 'true' && f.hoy === 1 && f.viejo === 0), 'el riel sigue aria-hidden, con su raya de hoy y sin el punto de antes');
    cierto(await p.evaluate(() => [...document.querySelectorAll('#mod-fabricacion .tal-riel')].every(r => r.getBoundingClientRect().width >= 70)),
      'el riel no se aplasta: 70 px o más para que quepan sus cuatro marcas');
    const ancho = await p.evaluate(() => [...document.querySelectorAll('#mod-fabricacion .tal-pista')].map(x => x.scrollWidth <= x.clientWidth + 1));
    cierto(ancho.every(Boolean), 'la pista (fecha, riel, fecha) cabe entera en una línea', ancho);
    cierto(await p.evaluate(() => [...document.querySelectorAll('#mod-fabricacion .riel-marca')].every(m => m.getBoundingClientRect().width === 12)),
      'las marcas miden 12 px');
  });

  /* ---------- F11 · cambiar de mes ---------- */
  await seccion('F11 · cambiar de mes sin perder el foco', async () => {
    await toca('[data-lente="instalaciones"]');
    await p.waitForTimeout(500);
    await p.evaluate(() => {
      document.querySelector('.cal-cab').__m = 1;
      document.querySelector('[data-mueve="1"]').__m = 1;
      window.__rej0 = document.querySelector('.cal-rej');
    });
    const t0 = await titulo();
    await toca('[data-mueve="1"]');
    await hasta(p, t => document.querySelector('.cal-mes').textContent.trim() !== t, t0);
    await p.waitForTimeout(400);
    const e = await p.evaluate(() => ({
      cab: !!document.querySelector('.cal-cab').__m, boton: !!document.querySelector('[data-mueve="1"]').__m,
      foco: document.activeElement === document.querySelector('[data-mueve="1"]'), vieja: window.__rej0.isConnected,
      voz: document.getElementById('vozStatus').textContent.trim(), tit: document.querySelector('.cal-mes').textContent.trim(),
    }));
    cierto(e.cab && e.boton, 'la cabecera y el botón › son los MISMOS nodos después de cambiar de mes', e);
    cierto(e.foco || cfg.tactil, '› conserva el foco (con ratón)', e);
    cierto(!e.vieja, 'la rejilla sí es nueva', e);
    cierto(e.voz === e.tit, 'el mes nuevo se dice en la región que habla', e);

    /* Teclado: RePág y AvPág dentro de la rejilla; el foco cae en el mismo número de día. */
    const dia15 = '.cal-dia[data-dia$="-15"]';
    await teclado();
    await p.evaluate(s => document.querySelector(s).focus(), dia15);
    const m0 = await mesIso();
    await p.keyboard.press('PageDown');
    await hasta(p, m => document.querySelector('.cal-dia[data-dia]').dataset.dia.slice(0, 7) !== m, m0);
    await p.waitForTimeout(350);
    const f1 = await p.evaluate(() => { const a = document.activeElement; return a && a.dataset && a.dataset.dia; });
    cierto(f1 && f1.endsWith('-15') && f1.slice(0, 7) !== m0, 'AvPág: el foco cae en el día 15 del mes siguiente', f1);
    await p.keyboard.press('PageUp');
    await hasta(p, m => document.querySelector('.cal-dia[data-dia]').dataset.dia.slice(0, 7) === m, m0);
    await p.waitForTimeout(350);
    cierto((await p.evaluate(() => { const a = document.activeElement; return a && a.dataset && a.dataset.dia; })) === m0 + '-15', 'RePág regresa al mismo día 15');
    await p.evaluate(() => document.body.focus());
    await p.keyboard.press('ArrowRight');
    await hasta(p, m => document.querySelector('.cal-dia[data-dia]').dataset.dia.slice(0, 7) !== m, m0);
    await p.keyboard.press('t');
    await hasta(p, m => document.querySelector('.cal-dia[data-dia]').dataset.dia.slice(0, 7) === m, fechas.hoy.slice(0, 7));
    bien('→ cambia de mes y «t» vuelve a hoy');
    cierto(await p.evaluate(() => getComputedStyle(document.querySelector('.cal-lienzo')).touchAction === 'pan-y'), 'el lienzo declara touch-action: pan-y');
    /* Mientras dura un viaje Chrome manda TODO toque al <html> (lo dice la pieza 22): el siguiente
       arrastre espera a que termine, como lo haría un dedo de verdad. */
    await hasta(p, () => !document.documentElement.classList.contains('vt-pieza'), null, 3000);
    await p.waitForTimeout(300);

    if (cfg.tactil) {
      const g = await centro(p, '.cal-rej');
      await p.locator('.cal-rej').evaluate(e => e.scrollIntoView({ block: 'center' }));
      const r = await p.locator('.cal-rej').boundingBox();
      const y = r.y + r.height / 2, xd = r.x + r.width - 30, xi = r.x + 30;
      const m1 = await mesIso();
      if (process.env.DEPURA) {
        await p.evaluate(() => { window.__ev = []; for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
          document.addEventListener(t, e => window.__ev.push(t + ' ' + e.pointerType + ' ' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ' ' + (e.target.className || e.target.tagName)), true); });
        console.log('rej', JSON.stringify(r), 'xd', xd, 'y', y, 'modal', await p.evaluate(() => [...document.querySelectorAll('.pf-modal-bg.show')].map(x => x.id)));
      }
      await deslizar(p, xd, y, xd - 160, y);
      if (process.env.DEPURA) { await p.waitForTimeout(600); console.log(await p.evaluate(() => window.__ev.join('\n'))); }
      await hasta(p, m => document.querySelector('.cal-dia[data-dia]').dataset.dia.slice(0, 7) !== m, m1);
      await p.waitForTimeout(450);
      const m2 = await mesIso();
      cierto(m2 > m1, 'arrastrar a la izquierda 160 px pasa al mes siguiente', { m1, m2 });
      cierto(await p.evaluate(() => !document.querySelector('.dia-lista')), 'soltar el dedo sobre un día NO lo abre');
      cierto(await p.evaluate(() => document.querySelector('.cal-lienzo').style.transform === ''), 'el lienzo no se queda corrido');
      await p.locator('.cal-rej').evaluate(e => e.scrollIntoView({ block: 'center' }));
      const r2 = await p.locator('.cal-rej').boundingBox();
      await deslizar(p, r2.x + 40, r2.y + r2.height / 2, r2.x + 200, r2.y + r2.height / 2);
      await hasta(p, m => document.querySelector('.cal-dia[data-dia]').dataset.dia.slice(0, 7) !== m, m2);
      await p.waitForTimeout(450);
      cierto((await mesIso()) === m1, 'arrastrar a la derecha regresa al mes anterior');
      /* Menos de 48 px: no cambia. */
      await deslizar(p, xd, y, xd - 30, y);
      await p.waitForTimeout(450);
      cierto((await mesIso()) === m1, 'arrastrar solo 30 px no cambia de mes');
      cierto(await p.evaluate(() => document.querySelector('.cal-lienzo').style.transform === ''), 'y el lienzo regresa a su sitio');
      /* Lo vertical es de la página. */
      const y0 = await p.evaluate(() => scrollY);
      await deslizar(p, xd - 100, y, xd - 100, y - 120);
      await p.waitForTimeout(400);
      cierto((await mesIso()) === m1, 'un arrastre vertical no cambia de mes');
      cierto((await p.evaluate(() => scrollY)) !== y0, 'y la página sí se desplazó');
      /* Semana. */
      await toca('[data-vista="semana"]');
      await p.waitForTimeout(500);
      const s0 = await titulo();
      await p.locator('.cal-lienzo').evaluate(e => e.scrollIntoView({ block: 'center' }));
      const rl = await p.locator('.cal-lienzo').boundingBox();
      const yv = 360;     // el lienzo de la semana es alto: la mitad del visor siempre cae sobre él
      await deslizar(p, rl.x + rl.width - 30, yv, rl.x + 40, yv);
      await hasta(p, t => document.querySelector('.cal-mes').textContent.trim() !== t, s0);
      await p.waitForTimeout(450);
      cierto((await titulo()) !== s0, 'en la vista de semana el arrastre pasa a la semana siguiente', { s0, ahora: await titulo() });
      await toca('[data-vista="mes"]');
      await p.waitForTimeout(500);
      await toca('[data-hoy]');
      await p.waitForTimeout(500);
    } else {
      const r = await p.locator('.cal-rej').boundingBox();
      const m1 = await mesIso();
      await p.mouse.move(r.x + r.width - 30, r.y + r.height / 2);
      await p.mouse.down();
      await p.mouse.move(r.x + 40, r.y + r.height / 2, { steps: 8 });
      await p.mouse.up();
      await p.waitForTimeout(450);
      cierto((await mesIso()) === m1, 'con el ratón, arrastrar la rejilla no cambia de mes (están las flechas)');
    }
    cierto(await sinDesborde(p), 'sin desborde de lado después de cambiar de mes');
    if (cfg.reducido) {
      /* Solo lo del calendario: la entrada de la sección (`.pf-mod`) es del router. */
      const vivas = await p.evaluate(() => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.cal-card')).map(a => (a.animationName || a.transitionProperty || '?') + ' en ' + ((a.effect && a.effect.target && (a.effect.target.className || a.effect.target.tagName)) || '?')));
      cierto(vivas.length === 0, 'con menos movimiento no queda ninguna animación después de cambiar de mes', vivas);
    }
  });

  /* ---------- F18 · la lista del día a la vista ---------- */
  await seccion('F18 · al tocar un día, su lista aparece a la vista', async () => {
    cierto(await irAlMesDe(fechas.d3), 'se llega al mes del día con instalación');
    const sel = '.cal-dia[data-dia="' + fechas.d3 + '"]';
    await p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
    await p.waitForTimeout(300);
    const y0 = await p.evaluate(() => scrollY);
    /* Caso 1: la celda en medio de la pantalla. En el teléfono la lista cabe debajo de ella, así que
       el encabezado YA está a la vista y la página no debe moverse. */
    await (cfg.tactil ? p.locator(sel).tap() : p.locator(sel).click());
    await hasta(p, () => !!document.querySelector('.dia-lista[data-recien]'));
    await p.waitForTimeout(900);
    const e = await p.evaluate(() => {
      const l = document.querySelector('.dia-lista[data-recien]'), t = l.querySelector('.dia-t');
      const r = t.getBoundingClientRect();
      const mbar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h') || '0', 10) || 0;
      const dock = document.getElementById('pf-abajo'); const dr = dock && getComputedStyle(dock).display !== 'none' ? dock.getBoundingClientRect() : null;
      const fondo = innerHeight - (dr ? innerHeight - dr.top : 0) - mbar;
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), fondo: Math.round(fondo), foco: document.activeElement === t,
               scrollY, anim: l.getAnimations().length };
    });
    cierto(e.top >= 0 && e.bottom <= e.fondo, 'el encabezado del día quedó entre el borde de arriba y las barras de abajo', e);
    cierto(e.foco, 'el foco está en el título del día', e);
    /* En el teléfono la lista cabe debajo de la celda que está en medio de la pantalla; en la
       computadora la rejilla es alta y la lista queda abajo del pliegue, y entonces sí baja. */
    if (cfg.ancho < 760) cierto(e.scrollY === y0, 'si el encabezado ya estaba a la vista la página NO se movió', { y0, ahora: e.scrollY });
    else cierto(e.scrollY >= y0, 'en la computadora la página baja lo justo (o no se mueve)', { y0, ahora: e.scrollY });
    cierto(await p.evaluate(() => !!document.querySelector('.dia-lista .pf-fila')), 'y la lista trae la instalación del día');
    cierto(await sinDesborde(p), 'sin desborde de lado con la lista abierta');
    /* Un segundo toque cierra. */
    await (cfg.tactil ? p.locator(sel).tap() : p.locator(sel).click());
    await hasta(p, () => !document.querySelector('.dia-lista'));
    bien('otro toque al mismo día cierra la lista');
    /* Caso 2 (teléfono): la celda cerca del borde de abajo, con la lista debajo de las barras. La
       página baja lo justo para enseñar el encabezado. */
    if (cfg.ancho < 760) {
      await p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); scrollTo(0, scrollY + r.top - (innerHeight - 270)); }, sel);
      await p.waitForTimeout(300);
      const antes = await p.evaluate(() => scrollY);
      await p.locator(sel).tap();
      await hasta(p, () => !!document.querySelector('.dia-lista[data-recien]'));
      await hasta(p, y => Math.abs(scrollY - y) > 20, antes, 3000).catch(() => {});
      await p.waitForTimeout(900);
      const f = await p.evaluate(() => {
        const t = document.querySelector('.dia-lista .dia-t').getBoundingClientRect();
        const mbar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h') || '0', 10) || 0;
        const dock = document.getElementById('pf-abajo').getBoundingClientRect();
        return { top: Math.round(t.top), bottom: Math.round(t.bottom), fondo: Math.round(dock.top - mbar), scrollY, foco: document.activeElement.className };
      });
      cierto(f.scrollY > antes, 'con la lista fuera de la pantalla la página baja', { antes, f });
      cierto(f.top >= 0 && f.bottom <= f.fondo, 'y el encabezado queda a la vista, encima de las barras', f);
      await p.locator(sel).tap();
      await hasta(p, () => !document.querySelector('.dia-lista'));
    }
    await (cfg.tactil ? p.locator(sel).tap() : p.locator(sel).click());
    await hasta(p, () => !!document.querySelector('.dia-lista'));
    if (cfg.reducido) cierto(await p.evaluate(() => document.querySelector('.dia-lista').getAnimations().length) === 0, 'con menos movimiento la lista no se anima');
  });

  /* ---------- F26 · la ficha de cada día con el ratón ---------- */
  await seccion('F26 · qué hay en un día sin abrirlo', async () => {
    const tip = () => p.evaluate(() => { const t = document.querySelector('.nombre-tip.pz-abierto'); return t ? { t: t.textContent, h: Math.round(t.getBoundingClientRect().height), corta: t.scrollWidth > t.clientWidth + 1 } : null; });
    const etiqueta = s => p.evaluate(x => document.querySelector(x).getAttribute('aria-label'), s);
    const a = '.cal-dia[data-dia="' + fechas.d3 + '"]', b = '.cal-dia[data-dia="' + sumar(fechas.d3, 1) + '"]';
    if (!cfg.tactil) {
      await p.mouse.move(2, 2);
      await p.waitForTimeout(900);
      const t0 = Date.now();
      await p.locator(a).hover();
      await hasta(p, () => !!document.querySelector('.nombre-tip.pz-abierto'), null, 3000);
      const espera = Date.now() - t0;
      cierto(espera >= 300, 'la primera ficha espera (≈ 400 ms)', espera);
      const t1 = await tip();
      const lab = await etiqueta(a);
      cierto(t1.t === lab.replace(/\.\s+/g, ' · '), 'dice el aria-label de la celda, con sus frases separadas', { dijo: t1.t, lab });
      cierto(t1.h > 30 && !t1.corta, 'se lee entera: baja de renglón, sin recortar con puntos suspensivos', t1);
      const t2 = Date.now();
      await p.locator(b).hover();
      await hasta(p, (l) => { const t = document.querySelector('.nombre-tip.pz-abierto'); return !!t && t.textContent === l; }, (await etiqueta(b)).replace(/\.\s+/g, ' · '), 2000);
      cierto(Date.now() - t2 < 300, 'la siguiente sale sin esperar (la rejilla sigue «caliente»)', Date.now() - t2);
      cierto(!(await p.evaluate(() => !!document.querySelector('.cal-sem[title]'))), 'el punto del semáforo ya no trae su `title` nativo encima');
      const c = await contraste(p, '.nombre-tip.pz-abierto');
      cierto(c >= 4.5, 'la ficha pasa 4.5:1', c);
      await p.mouse.move(2, 2);
      await p.waitForTimeout(1000);
      cierto(!(await tip()), 'al salir de la rejilla la ficha se va');
      const abiertoAntes = await p.evaluate(() => !!document.querySelector('.dia-lista'));
      await p.click(a);
      await p.waitForTimeout(500);
      cierto(await p.evaluate(() => !!document.querySelector('.dia-lista')) !== abiertoAntes, 'y el clic sigue alternando el día (la ficha no lo sustituye)');
      if (!(await p.evaluate(() => !!document.querySelector('.dia-lista')))) { await p.click(a); await p.waitForTimeout(400); }
    } else {
      await p.locator(a).tap();
      await p.waitForTimeout(900);
      cierto(!(await tip()), 'con el dedo la ficha no sale (el dedo tiene la lista del día)');
    }
    /* Teclado: al enfocar con el tabulador. */
    await teclado();
    await p.evaluate(s => document.querySelector(s).focus(), b);
    await hasta(p, () => !!document.querySelector('.nombre-tip.pz-abierto'), null, 3000);
    bien('con el teclado la ficha sale al enfocar la celda');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    cierto(!(await tip()), 'y Escape la quita');
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
  });

  /* ---------- F24 · probar el plazo ---------- */
  const esperadoPlazo = (inst, k) => 'Entra al taller el ' + dc(sumar(inst, -DIAS_PLAZO[k])) + ' · listo el ' + dc(sumar(inst, -sem.colchon));
  await seccion('F24 · probar el plazo antes de fijarlo', async () => {
    await cerrarCapas();
    await toca('[data-lente="taller"]');
    await p.waitForTimeout(500);
    await toca('[data-plazo="' + ids.p1 + '"]');
    await hasta(p, () => document.getElementById('pf-pide').classList.contains('show') && !!document.querySelector('#pf-pide .pf-peek'));
    await p.waitForTimeout(400);
    const chip = k => '#pf-pide .chips[aria-label="Plazo de taller"] [data-k="' + k + '"]';
    const peek = () => p.evaluate(() => { const e = document.querySelector('#pf-pide .pf-peek'); return e ? { ve: e.classList.contains('ve'), t: e.querySelector('.pf-peek-t').textContent, s: e.querySelector('.pf-peek-s').textContent, lado: e.dataset.lado } : null; });
    const plazoK = () => p.evaluate(async id => (await (await import('/js/datos/proyectos.js')).obtener(id)).plazo_k, ids.p1);
    cierto((await plazoK()) == null, 'el proyecto empieza sin plazo elegido a mano');
    cierto(await p.evaluate(() => [...document.querySelectorAll('#pf-pide .chips[aria-label="Plazo de taller"] [data-k]')].length) === 5, 'los cinco cubos');

    if (!cfg.tactil) {
      await p.locator(chip(1)).hover();
      await hasta(p, () => document.querySelector('#pf-pide .pf-peek').classList.contains('ve'));
      let v = await peek();
      cierto(v.t === esperadoPlazo(fechas.d1, 1), 'al pasar el cursor por «1 semana» dice cuándo entra y cuándo queda listo', { dijo: v.t, esperaba: esperadoPlazo(fechas.d1, 1) });
      cierto(/1 semana · 7 días de calendario/.test(v.s), 'y lo dice en días de CALENDARIO', v.s);
      cierto(await p.evaluate(s => document.querySelector(s).getAttribute('aria-describedby') === 'pf-peek', chip(1)), 'el chip apunta a la ficha con aria-describedby');
      await p.locator(chip(4)).hover();
      await hasta(p, t => document.querySelector('#pf-pide .pf-peek-t').textContent === t, esperadoPlazo(fechas.d1, 4));
      bien('al pasar al siguiente chip la ficha cambia: «2.5 semanas» → ' + esperadoPlazo(fechas.d1, 4));
      const c = await contraste(p, '#pf-pide .pf-peek');
      cierto(c >= 4.5, 'la ficha del plazo pasa 4.5:1', c);
      cierto((await plazoK()) == null && await p.evaluate(() => document.getElementById('pf-pide').classList.contains('show')), 'pasar por los chips NO guarda el plazo ni cierra el panel');
      await p.mouse.move(2, 2);
      await hasta(p, () => !document.querySelector('#pf-pide .pf-peek').classList.contains('ve'));
      bien('al salir de los chips la ficha se va');
    }
    /* Teclado. */
    await teclado();
    await p.evaluate(s => document.querySelector(s).focus(), chip(2));
    await hasta(p, () => document.querySelector('#pf-pide .pf-peek').classList.contains('ve'));
    cierto((await peek()).t === esperadoPlazo(fechas.d1, 2), 'con el teclado la ficha sale al enfocar el chip («1.5 semanas»)', await peek());
    cierto((await plazoK()) == null, 'enfocar no guarda');
    await p.evaluate(() => document.activeElement.blur());
    await p.waitForTimeout(250);

    if (cfg.tactil) {
      /* Apoyar el dedo en «1 semana», deslizar a «2 semanas» y SOLTAR FUERA: se probó, no se guardó. */
      await p.locator(chip(1)).evaluate(e => e.scrollIntoView({ block: 'center' }));
      const A = await centro(p, chip(1)), Bc = await centro(p, chip(3));
      const visto = await deslizarYMirar(p, A, Bc, peek, { x: Bc.x, y: Math.max(8, A.b.y - 140) });
      cierto(visto.ve && visto.t === esperadoPlazo(fechas.d1, 3), 'con el dedo apoyado y deslizado la ficha sigue al chip de abajo', visto);
      await p.waitForTimeout(400);
      cierto((await plazoK()) == null && await p.evaluate(() => document.getElementById('pf-pide').classList.contains('show')), 'soltar FUERA de los chips no guarda nada y el panel sigue abierto', await plazoK());
      cierto(!(await peek()).ve, 'y la ficha se va');
      /* Deslizar de uno a otro y soltar sobre «2 semanas»: se toca. */
      const A2 = await centro(p, chip(1)), B2 = await centro(p, chip(3));
      await deslizarYMirar(p, A2, B2, async () => 1);
      await hasta(p, () => !document.getElementById('pf-pide').classList.contains('show'), null, 5000);
      cierto((await plazoK()) === 3, 'soltar SOBRE «2 semanas» lo toca: el plazo quedó en 3', await plazoK());
    } else {
      await p.locator(chip(4)).click();
      await hasta(p, () => !document.getElementById('pf-pide').classList.contains('show'), null, 5000);
      cierto((await plazoK()) === 4, 'el clic confirma, como siempre: el plazo quedó en 4', await plazoK());
    }
    await p.waitForTimeout(400);
  });

  /* ---------- P14 · fechas rápidas, y F24 en «Se ganó» ---------- */
  await seccion('P14 · fechas rápidas al ganar (y F24 en el mismo panel)', async () => {
    await cerrarCapas();
    const mbarAntes = await texto(p, '#pf-mbar');
    await p.evaluate(() => { const b = document.querySelector('#pf-mbar button'); if (b) b.__marca = 1; window.__fab.rotuloSale = 0; });
    await toca('[data-decidir="ganar"]');
    await hasta(p, () => !!document.querySelector('#pf-pide #ag-ganar-rapidas'));
    await p.waitForTimeout(450);
    const radios = () => p.$$eval('#ag-ganar-rapidas [role="radio"]', rs => rs.map(r => ({ t: r.textContent, d: r.getAttribute('aria-label'), iso: r.dataset.fechaRapida, on: r.getAttribute('aria-checked'), ti: r.tabIndex, alto: Math.round(r.getBoundingClientRect().height) })));
    const campo = () => p.inputValue('#ag-ganar-fecha');
    let rs = await radios();
    cierto(rs.length === 5 && rs[0].t === 'Hoy' && rs[1].t === 'Mañana' && rs[4].t === 'Sin fecha', 'cinco fichas: Hoy, Mañana, dos días, Sin fecha', rs.map(r => r.t));
    cierto(rs[2].iso < rs[3].iso && /^(sáb|lun) \d+$/.test(rs[2].t) && /^(sáb|lun) \d+$/.test(rs[3].t) && rs[2].iso > sumar(fechas.hoy, 1), 'las dos del medio son el próximo sábado y lunes, en orden y después de mañana', rs.map(r => r.t));
    cierto(rs[0].iso === fechas.hoy && rs[1].iso === sumar(fechas.hoy, 1), 'Hoy y Mañana se calculan con el día de hoy (sin new Date(iso))');
    cierto(rs[0].on === 'true' && rs.slice(1).every(r => r.on === 'false') && (await campo()) === fechas.hoy, 'Hoy viene marcado y el campo dice lo mismo');
    cierto(rs[0].ti === 0 && rs.slice(1).every(r => r.ti === -1), 'solo la elegida está en el tabulador (roving)');
    if (cfg.tactil) cierto(rs.every(r => r.alto >= 44), 'cada ficha mide 44 px de alto o más con el dedo', rs.map(r => r.alto));
    cierto(await p.evaluate(() => document.getElementById('ag-ganar-rapidas').getAttribute('role') === 'radiogroup' && !!document.getElementById('ag-ganar-rapidas').getAttribute('aria-labelledby')), 'es un radiogroup con nombre');
    await tocaEnCapa('#ag-ganar-rapidas [data-fecha-rapida="' + sumar(fechas.hoy, 1) + '"]');
    await p.waitForTimeout(150);
    rs = await radios();
    cierto((await campo()) === sumar(fechas.hoy, 1) && rs[1].on === 'true' && rs[0].on === 'false', '«Mañana» escribe en el campo y se marca');
    await tocaEnCapa('#ag-ganar-rapidas [data-fecha-rapida=""]');
    rs = await radios();
    cierto((await campo()) === '' && rs[4].on === 'true', '«Sin fecha» vacía el campo (ya estaba permitido)');
    await teclado();
    await p.evaluate(() => document.querySelector('#ag-ganar-rapidas [role="radio"]').focus());
    await p.keyboard.press('ArrowRight');
    rs = await radios();
    cierto((await campo()) === sumar(fechas.hoy, 1) && rs[1].on === 'true' && (await p.evaluate(() => document.activeElement.textContent)) === 'Mañana', '→ mueve el foco Y elige, como un radio');
    await p.fill('#ag-ganar-fecha', sumar(fechas.hoy, 20));
    await p.waitForTimeout(150);
    rs = await radios();
    cierto(rs.every(r => r.on === 'false') && rs[0].ti === 0, 'escribir otro día a mano apaga las fichas y deja una en el tabulador');
    const cc = await contraste(p, '#ag-ganar-rapidas [role="radio"][aria-checked="true"], #ag-ganar-rapidas [role="radio"]');
    cierto(cc >= 4.5, 'el texto de las fichas pasa 4.5:1', cc);

    /* F24 aquí: la ficha toma el día que haya en el campo. */
    const chip = k => '#pf-pide .chips[aria-labelledby="ag-ganar-plazo-l"] [data-k="' + k + '"]';
    const peek = () => p.evaluate(() => { const e = document.querySelector('#pf-pide .pf-peek'); return e ? { ve: e.classList.contains('ve'), t: e.querySelector('.pf-peek-t').textContent, s: e.querySelector('.pf-peek-s').textContent } : null; });
    const d20 = sumar(fechas.hoy, 20);
    await teclado();
    await p.evaluate(s => document.querySelector(s).focus(), chip(3));
    await hasta(p, () => document.querySelector('#pf-pide .pf-peek').classList.contains('ve'));
    cierto((await peek()).t === esperadoPlazo(d20, 3), 'con el campo en ' + dc(d20) + ', «2 semanas» dice ' + esperadoPlazo(d20, 3), await peek());
    await p.evaluate(() => document.activeElement.blur());
    await tocaEnCapa('#ag-ganar-rapidas [data-fecha-rapida=""]');
    await teclado();
    await p.evaluate(s => document.querySelector(s).focus(), chip(3));
    await hasta(p, (t) => document.querySelector('#pf-pide .pf-peek-t').textContent === t, 'Entra al taller el ' + dc(fechas.hoy) + ' · listo el ' + dc(sumar(fechas.hoy, 14 - sem.colchon)));
    cierto(/cuenta desde que se ganó, sin fecha de instalación/.test((await peek()).s), 'sin fecha de instalación la ficha lo dice: cuenta desde que se ganó', await peek());
    await p.evaluate(() => document.activeElement.blur());
    /* Elegir un plazo rehace el panel: el foco vuelve al chip tocado y la fecha rápida se conserva. */
    await tocaEnCapa(chip(2));
    await p.waitForTimeout(450);
    const e = await p.evaluate(() => ({ foco: document.activeElement && document.activeElement.dataset && document.activeElement.dataset.k,
      sinFecha: document.querySelector('#ag-ganar-rapidas [data-fecha-rapida=""]').getAttribute('aria-checked'), campo: document.getElementById('ag-ganar-fecha').value,
      marcado: document.querySelector('#pf-pide .chips[aria-labelledby="ag-ganar-plazo-l"] .chip.on').dataset.k }));
    cierto(e.marcado === '2' && e.campo === '' && e.sinFecha === 'true', 'elegir el plazo no pierde la fecha rápida', e);
    cierto(!cfg.tactil ? e.foco === '2' : true, 'y el foco vuelve al chip del plazo (no al primer control)', e);
    /* Guardar sin fecha: el proyecto se guarda igual y queda entre los «sin fecha». */
    const antes = await p.evaluate(async () => (await (await import('/js/datos/proyectos.js')).listar({ sinFecha: true, vivos: true })).length);
    await tocaEnCapa('#pf-pide [data-pide="ganar"]');
    await hasta(p, () => !document.getElementById('pf-pide').classList.contains('show'), null, 6000);
    await p.waitForTimeout(500);
    const despues = await p.evaluate(async () => (await (await import('/js/datos/proyectos.js')).listar({ sinFecha: true, vivos: true })).length);
    cierto(despues === antes + 1, '«Guardar el proyecto» con «Sin fecha» crea el proyecto sin día', { antes, despues });

    /* F29 · la barra: es el mismo botón, el rótulo cambió. */
    const m = await p.evaluate(() => { const b = document.querySelector('#pf-mbar button'); return { mismo: !!(b && b.__marca), txt: b && b.textContent.replace(/\s+/g, ' ').trim(), cruce: window.__fab.rotuloSale }; });
    cierto(mbarAntes === 'Decidir 2 cotizaciones', 'la barra decía «Decidir 2 cotizaciones»', mbarAntes);
    await p.waitForTimeout(400);
    const m2 = await p.evaluate(() => { const b = document.querySelector('#pf-mbar button'); return { mismo: !!(b && b.__marca), txt: b && b.textContent.replace(/\s+/g, ' ').trim() }; });
    cierto(m2.mismo && m2.txt === 'Decidir la cotización pendiente', 'ahora dice «Decidir la cotización pendiente» y es el MISMO botón (no se reescribió)', { m, m2 });
    cierto(mov ? m.cruce > 0 : m.cruce === 0, mov ? 'el rótulo viejo se cruzó con el nuevo (.rotulo-sale)' : 'con menos movimiento el rótulo cambia directo, sin cruce', m);
  });

  /* ---------- F29 · la barra cambia de acción y se va con el módulo ---------- */
  await seccion('F29 · la barra de acción', async () => {
    await cerrarCapas();
    const barra = () => p.evaluate(() => { const b = document.getElementById('pf-mbar'), bt = b.querySelector('button'), cs = getComputedStyle(b);
      return { hidden: b.hidden, cal: b.classList.contains('cal-mbar'), cls: bt && bt.className, attr: bt && (bt.hasAttribute('data-abrir-agendar') ? 'agendar' : bt.hasAttribute('data-ir-decidir') ? 'decidir' : ''),
               txt: bt && bt.textContent.replace(/\s+/g, ' ').trim(), mismo: !!(bt && bt.__marca), dur: cs.transitionDuration, h: Math.round(b.getBoundingClientRect().height),
               mh: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h'), 10) }; });
    const b0 = await barra();
    cierto(!b0.hidden && b0.cal && b0.attr === 'decidir', 'la barra existe, lleva su clase y apunta a decidir', b0);
    cierto(b0.dur === (mov ? '0.18s' : '0.15s') || b0.dur.startsWith(mov ? '0.18' : '0.15'), 'sube con 180 ms (fundido de 150 con menos movimiento)', b0.dur);
    cierto(Math.abs(b0.h - b0.mh) <= 1, 'el alto publicado (--mbar-h) es el de la barra puesta, no el de media animación', { alto: b0.h, publicado: b0.mh });
    if (cfg.tactil) {
      const hb = await p.evaluate(() => Math.round(document.querySelector('#pf-mbar button').getBoundingClientRect().height));
      cierto(hb >= 44, 'el botón de la barra mide 44 px o más', hb);
    }
    await p.evaluate(() => { document.querySelector('#pf-mbar button').__marca = 1; window.__fab.rotuloSale = 0; });
    await toca('[data-decidir="descartar"]');
    await hasta(p, () => !!document.querySelector('#pf-pide [data-pide="descartar"]'));
    await p.waitForTimeout(400);
    await tocaEnCapa('#pf-pide [data-pide="descartar"]');
    await hasta(p, () => !document.getElementById('pf-pide').classList.contains('show'), null, 6000);
    await hasta(p, () => /^Agendar/.test(document.querySelector('#pf-mbar button').textContent.trim()) && !document.querySelector('#pf-mbar .rotulo-sale'), null, 4000);
    const b1 = await barra();
    cierto(b1.mismo && b1.attr === 'agendar' && /btn-pri/.test(b1.cls) && !/btn-ok/.test(b1.cls), 'de «Decidir» a «Agendar»: el mismo botón cambia de acción y de color', b1);
    cierto(/^Agendar \(11 sin fecha\)$/.test(b1.txt), 'dice «Agendar (11 sin fecha)»', b1.txt);
    cierto(Math.abs(b1.h - b1.mh) <= 1, 'y el alto publicado sigue siendo el de la barra', { alto: b1.h, publicado: b1.mh });
    cierto(cfg.reducido ? true : (await p.evaluate(() => window.__fab.rotuloSale)) > 0, 'el cambio de rótulo se cruzó');
    /* Se va con el módulo. */
    await p.evaluate(() => { location.hash = '#/proyectos'; });
    await hasta(p, () => !document.getElementById('mod-proyectos').hidden && !document.querySelector('.pf-esqueleto'), null, 10000);
    await p.waitForTimeout(400);
    const b2 = await barra();
    cierto(!b2.cal && (b2.hidden || !b2.attr), 'al salir del Calendario la barra ya no es suya: sin su clase y sin su botón', b2);
    await p.evaluate(() => { location.hash = '#/agenda'; });
    await cargado(p);
  });

  /* ---------- F19 · F17 · F23 · la hoja de agendar ---------- */
  await seccion('F19 · F17 · F23 · agendar en tres pasos', async () => {
    await cerrarCapas();
    const largo0 = await p.evaluate(() => history.length);
    const cifras = () => p.$$eval('#mod-fabricacion .pf-cuentas b[data-cuenta]', bs => Object.fromEntries(bs.map(b => [b.dataset.cuenta, b.textContent])));
    const cifras0 = await cifras();
    await p.evaluate(() => { window.__fab.rodo = []; document.querySelector('#pf-mbar button').__marca = 1; });
    if (cfg.ancho < 760) await toca('#pf-mbar [data-abrir-agendar]');
    else {
      /* En la computadora no hay barra: se toca un día libre del futuro, que abre «Agendar» con la
         fecha ya puesta (el toque y medio). */
      const libre = sumar(fechas.hoy, 5);
      await irAlMesDe(libre);
      await toca('.cal-dia[data-dia="' + libre + '"]');
    }
    await hasta(p, () => document.getElementById('pf-hoja').classList.contains('show') && !!document.querySelector('#pf-hoja .riel'));
    await p.waitForTimeout(500);
    const pasos = () => p.evaluate(() => { const r = document.querySelector('#pf-hoja .riel'); return r ? {
      textos: [...r.querySelectorAll('.riel-t')].map(x => x.textContent), estados: [...r.querySelectorAll('.riel-paso')].map(x => x.dataset.estado),
      actual: [...r.querySelectorAll('.riel-paso')].filter(x => x.getAttribute('aria-current') === 'step').length, nombre: r.getAttribute('aria-label') } : null; });
    let s = await pasos();
    cierto(JSON.stringify(s.textos) === '["Proyecto","Día","Al teléfono"]' && s.estados[0] === 'actual' && s.actual === 1, 'paso 1: el riel dice «Proyecto · Día · Al teléfono» y el primero es el actual', s);
    cierto(!!s.nombre, 'el riel tiene nombre para el lector de pantalla', s);
    const largo1 = await p.evaluate(() => history.length);
    cierto(largo1 === largo0 + 1, 'abrir la hoja agrega UNA entrada de historial', { largo0, largo1 });
    cierto(await p.evaluate(() => !!document.getElementById('pf-ag-q')), 'con más de 8 sin fecha aparece el buscador');
    await p.fill('#pf-ag-q', 'Sin fecha SA');
    await p.waitForTimeout(300);
    cierto(await p.evaluate(() => document.querySelectorAll('#pf-hoja [data-h="elige"]').length) === 1, 'el filtro deja un solo proyecto');
    await tocaEnCapa('#pf-hoja [data-h="elige"]');
    await hasta(p, () => !!document.querySelector('#pf-hoja #pf-ag-fecha'));
    await p.waitForTimeout(500);
    s = await pasos();
    cierto(s.estados[0] === 'hecho' && s.estados[1] === 'actual' && s.estados[2] === 'pendiente', 'paso 2: «Proyecto» con su palomita, «Día» es el actual', s);
    cierto(await p.evaluate(() => history.length) === largo1, 'avanzar al paso 2 NO empuja otra entrada de historial');
    if (cfg.tactil) cierto(await p.evaluate(() => Math.round(document.querySelector('#pf-hoja [data-h="otro"]').getBoundingClientRect().height)) >= 44, '«‹ Otro proyecto» mide 44 px o más');
    /* F17 */
    const desc = () => p.evaluate(() => { const e = document.getElementById('pf-ag-vent-desc'); return e && { t: e.textContent.replace(/\s+/g, ' ').trim(), live: e.getAttribute('aria-live'), vis: [...e.querySelectorAll('.rotulo-a')].map(x => x.textContent.replace(/\s+/g, ' ').trim()) }; });
    const VD = await p.evaluate(async () => (await import('/js/datos/agenda.js')).VENTANA_DESC);
    let d = await desc();
    cierto(d && d.t === VD.dia && d.live === 'polite', 'debajo de los chips dice lo de la ventana «De día» (el texto sale de Agenda.VENTANA_DESC)', d);
    /* La distancia entre la línea y el campo de abajo, y no su posición en la pantalla: tocar el chip
       puede desplazar el cuerpo de la hoja, y eso no es lo que se mide. */
    const hueco = () => p.evaluate(() => Math.round(document.getElementById('pf-ag-dur').getBoundingClientRect().top - document.getElementById('pf-ag-vent-desc').getBoundingClientRect().top));
    const hueco0 = await hueco();
    await tocaEnCapa('#pf-hoja [data-h="ventana"][data-v="noche"]');
    await p.waitForTimeout(600);
    d = await desc();
    cierto(d.vis.length === 1 && d.vis[0] === VD.noche, 'al elegir «De noche» el texto cambia a lo que implica (alarma 2 horas antes)', d);
    cierto(/2 horas antes/.test(d.t), 'y dice lo de las 2 horas', d.t);
    const c = await contraste(p, '#pf-ag-vent-desc .rotulo-a');
    cierto(c >= 4.5, 'el estado final queda a contraste completo (§4.3)', c);
    const hueco1 = await hueco();
    cierto(Math.abs(hueco1 - hueco0) <= 22, 'y lo de abajo apenas se mueve (la línea cambia en su sitio: a lo más un renglón más)', { hueco0, hueco1 });
    await tocaEnCapa('#pf-hoja [data-h="ventana"][data-v="dia"]');
    await p.waitForTimeout(500);
    /* F19 · volver sin perder el filtro */
    await tocaEnCapa('#pf-hoja [data-h="otro"]');
    await hasta(p, () => !!document.getElementById('pf-ag-q'));
    await p.waitForTimeout(450);
    s = await pasos();
    cierto(s.estados[0] === 'actual', '«‹ Otro proyecto» regresa al paso 1', s);
    cierto((await p.inputValue('#pf-ag-q')) === 'Sin fecha SA', 'y el buscador conserva lo que se había escrito');
    cierto(await p.evaluate(() => history.length) === largo1, 'volver tampoco agrega historial');
    await tocaEnCapa('#pf-hoja [data-h="elige"]');
    await hasta(p, () => !!document.querySelector('#pf-hoja #pf-ag-fecha'));
    await p.waitForTimeout(500);
    await tocaEnCapa('#pf-hoja [data-h="ventana"][data-v="noche"]');
    await p.waitForTimeout(300);
    await tocaEnCapa('#pf-hoja [data-h="guardar"]');
    await hasta(p, () => /Ya está agendada/.test(document.querySelector('#pf-hoja h2').textContent), null, 8000);
    await p.waitForTimeout(600);
    s = await pasos();
    cierto(s.estados[0] === 'hecho' && s.estados[1] === 'hecho' && s.estados[2] === 'actual', 'paso 3: «Ya está agendada» con el riel completo', s);
    cierto(await p.evaluate(() => history.length) === largo1, 'ni siquiera al llegar al paso 3 el historial crece');
    cierto(await p.evaluate(() => !!document.querySelector('#pf-hoja [data-h="ics"]') && document.getElementById('pf-hoja').classList.contains('show')), 'el tercer paso sigue abierto y ofrece el .ics (no se cierra solo)');
    await p.waitForTimeout(900);
    cierto(await p.evaluate(() => document.getElementById('pf-hoja').classList.contains('show')), 'y sigue abierto un momento después');
    const e = await p.evaluate(() => ({ lista: !!document.querySelector('.dia-lista'), recien: !!document.querySelector('.dia-lista[data-recien]'),
      focoEnHoja: document.getElementById('pf-hoja').contains(document.activeElement) }));
    cierto(e.lista && !e.recien && e.focoEnHoja, 'el día quedó abierto por debajo SIN animarse y SIN robarle el foco a la hoja', e);
    /* F23 */
    const rodo = await p.evaluate(() => window.__fab.rodo);
    const cifras1 = await cifras();
    const cambiaron = Object.keys(cifras1).filter(k => cifras0[k] !== cifras1[k]).sort();
    if (mov) {
      cierto(rodo.includes('sinfecha'), 'F23 · «Ganados sin fecha» rodó (11 → 10)', { rodo, cifras0, cifras1 });
      cierto(JSON.stringify([...rodo].sort()) === JSON.stringify(cambiaron), 'rodaron EXACTAMENTE las cifras que cambiaron, ninguna otra', { rodo, cambiaron });
    } else cierto(rodo.length === 0, 'F23 · con menos movimiento no rueda nada', rodo);
    cierto(cifras1.sinfecha === '10', 'y la cifra final es 10 desde el primer cuadro', cifras1);
    cierto(await sinDesborde(p), 'sin desborde de lado con la hoja abierta');
    await tocaEnCapa('#pf-hoja [data-h="cerrar"]');
    await hasta(p, () => !document.getElementById('pf-hoja').classList.contains('show'));
    await p.waitForTimeout(400);
  });

  /* ---------- F31 · copiar la orden ---------- */
  await seccion('F31 · copiar la orden confirma en el botón', async () => {
    await toca('.dia-lista [data-acc="orden"]');
    await hasta(p, () => !!document.querySelector('#pf-pide [data-pide="copiar"]'));
    await p.waitForTimeout(500);
    const btn = '#pf-pide [data-pide="copiar"]';
    const ancho0 = await p.evaluate(s => document.querySelector(s).offsetWidth, btn);
    await tocaEnCapa(btn);
    await hasta(p, s => /Copiada/.test(document.querySelector(s).textContent) && !!document.querySelector(s + ' .palomita'), btn, 4000);
    bien('el botón dice «Copiada» y lleva su palomita');
    const ancho1 = await p.evaluate(s => document.querySelector(s).offsetWidth, btn);
    cierto(Math.abs(ancho1 - ancho0) <= 1, 'sin cambiar de ancho', { ancho0, ancho1 });
    cierto(await p.evaluate(() => /Orden copiada/.test(document.getElementById('toast').textContent)), 'y el aviso de abajo se queda con su instrucción');
    await hasta(p, s => !/Copiada/.test(document.querySelector(s).textContent.replace(/\s+/g, ' ')) || document.querySelector(s + ' .rotulo.alt') === null, btn, 5000);
    bien('al rato el botón vuelve a decir «Copiar»');
    await tocaEnCapa('#pf-pide [data-pide="cerrar"]');
    await hasta(p, () => !document.getElementById('pf-pide').classList.contains('show'));
    await p.waitForTimeout(300);
  });

  /* ---------- F7 · las órdenes a Calendar ---------- */
  await seccion('F7 · el botón de Google Calendar dice qué hace', async () => {
    let peticiones = 0, modo = 'lento-ok';
    await ctx.route(/googleapis\.com\/calendar/, async r => {
      peticiones++;
      await dormir(modo === 'lento-ok' ? 1300 : 300);
      if (modo === 'falla') return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'abc', creator: { email: 'dir@prueba.mx' } }) });
    });
    await toca('.dia-lista [data-acc="ficha"]');
    await hasta(p, () => !!document.querySelector('#pf-pide [data-acc="gcal"]'));
    await p.waitForTimeout(500);
    const g = '#pf-pide [data-acc="gcal"]';
    const estado = () => p.evaluate(s => { const b = document.querySelector(s); return { est: b.dataset.estado || '', busy: b.getAttribute('aria-busy'), txt: b.textContent.replace(/\s+/g, ' ').trim(), ancho: b.offsetWidth,
      hermanos: [...document.querySelectorAll('#pf-pide [data-acc]')].filter(x => x !== b).map(x => x.getAttribute('aria-disabled')), disabled: b.disabled, foco: document.activeElement === b }; }, g);
    const ancho0 = (await estado()).ancho;
    cierto(/Crearla en Google Calendar/.test((await estado()).txt), 'antes de tocar dice «Crearla en Google Calendar»');
    /* Falla primero. */
    modo = 'falla';
    await tocaEnCapa(g);
    await hasta(p, s => document.querySelector(s).dataset.estado === 'trabajando' || document.querySelector(s).dataset.estado === 'mal', g, 3000);
    await hasta(p, s => document.querySelector(s).dataset.estado === 'mal', g, 6000);
    let e = await estado();
    cierto(/No se pudo|No contestó/.test(e.txt) && /Reintentar/.test(e.txt), 'si Google no acepta, el botón dice cómo terminó: «… · Reintentar»', e);
    cierto(e.hermanos.every(x => x === null), 'y sus hermanos vuelven a aceptar toques', e);
    /* Reintento, ahora bien y lento: mientras trabaja se ve el verbo y el reloj. */
    modo = 'lento-ok';
    peticiones = 0;
    await tocaEnCapa(g);
    await hasta(p, s => document.querySelector(s).dataset.estado === 'trabajando', g, 3000);
    await p.waitForTimeout(250);
    e = await estado();
    cierto(e.busy === 'true' && /Creándola en Calendar/.test(e.txt), 'mientras trabaja dice «Creándola en Calendar…»', e);
    cierto(!e.disabled && e.foco, 'sin `disabled`: el foco se queda en el botón', e);
    cierto(e.hermanos.length >= 1 && e.hermanos.every(x => x === 'true'), 'sus hermanos pasan a aria-disabled', e);
    cierto(Math.abs(e.ancho - ancho0) <= 1 || e.ancho >= ancho0 - 1, 'el ancho no brinca', { ancho0, ancho: e.ancho });
    await p.waitForTimeout(500);
    /* Un segundo toque mientras trabaja no manda otra petición. */
    await p.locator(g).dispatchEvent('click').catch(() => {});
    await p.waitForTimeout(150);
    await hasta(p, s => document.querySelector(s).dataset.estado === 'ok', g, 6000);
    e = await estado();
    cierto(/Creada|Ya estaba|Puesta al día/.test(e.txt), 'al terminar dice «Creada» (en verde un momento)', e);
    cierto(peticiones === 1, 'y se mandó UNA sola petición aunque se tocó dos veces', peticiones);
    cierto(await p.evaluate(() => /Evento creado|ya estaba/.test(document.getElementById('toast').textContent)), 'el aviso de siempre también lo dice');
    await hasta(p, s => !document.querySelector(s).dataset.estado, g, 7000);
    bien('y al rato el botón vuelve a su rótulo');
    await tocaEnCapa('#pf-pide [data-pide="cerrar"]');
    await hasta(p, () => !document.getElementById('pf-pide').classList.contains('show'));
  });

  /* ---------- lo de siempre ---------- */
  cierto(errores.length === 0, 'sin errores de página', errores);
  cierto(await sinDesborde(p), 'sin desborde horizontal');
  await cerrarCapas();
  await p.waitForTimeout(800);
  const inf = await infinitas(p);
  cierto(inf.length === 0, 'nada se mueve en reposo', inf);

  /* ---------- F5 en el Tablero ---------- */
  await seccion('F5 · el Tablero pinta el mismo riel', async () => {
    await p.evaluate(() => { location.hash = '#/hoy'; });
    await hasta(p, () => !!document.querySelector('#mod-tablero .tal-fila'), null, 15000);
    await p.waitForTimeout(500);
    const t = await p.$$eval('#mod-tablero .tal-fila', fs => fs.map(f => ({ marcas: f.querySelectorAll('.riel-marca').length, viejo: f.querySelectorAll('.tal-hoy').length })));
    cierto(t.length > 0 && t.every(x => x.marcas === 4 || x.marcas === 0) && t.some(x => x.marcas === 4) && t.every(x => x.viejo === 0), 'el Tablero usa el mismo renglón: cuatro marcas y sin el punto de antes', t);
    cierto(await sinDesborde(p), 'sin desborde en el Tablero');
  });

  await ctx.close();
}

/* ------------------------------------------------------------------------------------------
   Las rondas. Cuatro del teléfono (360 y 420 px, con y sin movimiento, claro y oscuro) y una de
   computadora con ratón y teclado.
   ------------------------------------------------------------------------------------------ */
const RONDAS = [
  { ancho: 360, tema: 'claro', reducido: false, tactil: true },
  { ancho: 420, tema: 'oscuro', reducido: true, tactil: true },
  { ancho: 360, tema: 'oscuro', reducido: false, tactil: true },
  { ancho: 420, tema: 'claro', reducido: true, tactil: true },
  { ancho: 1280, alto: 900, tema: 'claro', reducido: false, tactil: false },
];
const solo = process.env.SOLO === undefined ? null : process.env.SOLO.split(',');
for (let i = 0; i < RONDAS.length; i++) if (!solo || solo.includes(String(i))) await ronda(RONDAS[i]);

await nav.close();
console.log('\n' + (fallos ? fallos + ' fallo(s) en pf-fabricacion.' : 'Fabricación y calendario con las piezas: todo en verde.'));
process.exit(fallos ? 1 : 0);
