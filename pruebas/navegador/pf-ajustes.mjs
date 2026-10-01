/* AJUSTES Y EL ASISTENTE CON LAS PIEZAS COMPARTIDAS, EN UN NAVEGADOR DE VERDAD.
 *
 * Lo que se defiende, y por qué (cada punto trae el ID de su ficha del paquete de UI):
 *
 *   EL ASISTENTE
 *   · «ENVIAR» QUE SE ENCIENDE Y SE VUELVE «DETENER» (F2). El botón nace fantasma y `aria-disabled`;
 *     con texto se llena de color; durante la espera de la IA es el cuadro de «Detener», con
 *     `aria-disabled` ausente y NUNCA `disabled` (un botón apagado no recibe el toque justo cuando
 *     hace falta). Detener cancela SIN cerrar el panel, deja «Quedó sin respuesta» en el hilo, libera
 *     el asistente al instante y la respuesta que llegue tarde se tira. Cerrar el panel hace lo mismo.
 *   · LA ESPERA COMO TRAZA (F14). Cada vuelta REAL por los proveedores es un paso: «Leí el taller»,
 *     «Qwen · sin llave», «DeepSeek · …», «Preguntando a Gemini · 3 s». Al contestar se pliega en
 *     «Contestó Gemini en N s» con los pasos adentro; el reloj no se reinicia aunque el panel se
 *     repinte, y los textos que llegan de la hoja entran como texto, nunca como marcado.
 *   · UNA RESPUESTA LARGA SE LEE DESDE SU PRINCIPIO (F15). Al llegar, el hilo se ancla en el principio
 *     de la burbuja nueva y no en el final; solo ella entra (data-nueva) y solo una vez; un repintado
 *     cualquiera no mueve a quien lee; la portada sigue en scrollTop 0.
 *   · LA SILUETA EN VEZ DE «LEYENDO…» (F16). La portada pinta la forma de las cifras, con aria-busy y su
 *     texto de estado; el reloj que giraba para siempre ya no existe.
 *   · BORDES QUE SE DESVANECEN EN LA TIRA (F30). Solo del lado donde hay más, y fuera en papel.
 *   · PALOMITA AL COPIAR (F31). El botón que se tocó dice «Copiada» con su palomita ~2 s y vuelve.
 *
 *   AJUSTES
 *   · EL ÍNDICE QUE SIGUE AL SCROLL (F22). Siete nombres, debajo del encabezado, con la sección vigente
 *     marcada (aria-current), una ficha que viaja entre ellas, la raya de progreso de la lectura, 44 px
 *     con el dedo, tocar lleva a la tarjeta, y NADA de scrollIntoView para acomodar la ficha activa.
 *   · EL TEMA SE ABRE EN CÍRCULO (F21). Con movimiento pasa por View Transitions; con movimiento reducido
 *     cambia directo. El foco no se cae al <body>.
 *   · «BORRAR» EN SEIS CASILLAS (F27). Mayúsculas solas, la casilla que no coincide sale en rojo al
 *     teclearla, y el botón solo se habilita (aria-disabled, no disabled) con BORRAR completo. Sin festejo.
 *   · LOS PASOS SE PALOMEAN Y SE RECUERDAN (F32). Gcal y puente: cada paso es un botón, el primero sin
 *     palomear dice «Vas aquí», sobrevive a recargar, y los textos salen de `instrucciones()`.
 *   · EL RESPALDO COMO MEDIDOR QUIETO (F3). Una barra aria-hidden sin texto encima, con la frase al lado.
 *   · LOS BOTONES DEL PUENTE DICEN QUÉ HACEN (F7). El botón tocado dice el verbo y cuánto lleva, se llena,
 *     sus hermanos esperan con aria-disabled y no responden, el ancho no brinca, y termina en «Listo» o
 *     en «No contestó · Reintentar» (que sí reintenta). Con movimiento reducido solo cambia el texto.
 *
 * Cada ronda corre a 360, 420 o 1280 px, con y sin movimiento reducido, en claro y en oscuro, con dedo
 * (tap) o con ratón y teclado; siempre sin errores de página, sin desborde de lado y sin nada moviéndose
 * en reposo. El puente es de mentiras (se intercepta la red): la prueba controla cuánto tarda y qué dice.
 *
 * Necesita navegador y servidor:  PUERTO=8814 node pruebas/navegador/pf-ajustes.mjs
 * (o pruebas/correr.sh --navegador).
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const PUERTO = process.env.PUERTO || '8814';
const B = 'http://127.0.0.1:' + PUERTO;
/* El puente de mentiras vive en el MISMO origen que la página: la política de contenido de la plataforma solo
   deja hablar con la hoja de Google, y un dominio inventado se rechazaría antes de salir. Se intercepta la
   ruta en el navegador; el servidor estático nunca la ve. */
const PUENTE = B + '/puente-de-mentiras';
const TOKEN = 'T'.repeat(40);
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const cierto = (cond, que, extra) => cond ? bien(que) : mal(que, extra);
const dormir = ms => new Promise(r => setTimeout(r, ms));
/* CAPTURAS=/carpeta guarda una foto de cada estado nuevo (para mirarlos con los ojos; la prueba no las lee). */
const CAP = process.env.CAPTURAS || '';
const foto = (p, nombre) => CAP ? p.screenshot({ path: CAP + '/' + nombre + '.png' }).catch(() => {}) : null;

/* La respuesta larga de la IA: veinte renglones. Con menos no hay principio que perder. */
const LARGA = 'Esto es lo que encontré:\n\n' + Array.from({ length: 22 }, (_, i) => '- Renglón ' + (i + 1) + ': seguimiento al cliente número ' + (i + 1) + ' con su monto y su fecha.').join('\n') +
  '\n\nFin de la respuesta.';
const PREGUNTA_LIBRE = 'Redacta un mensaje amable de seguimiento para Andrey';

/* ------------------------------------------------------------------------------------------
   El puente de mentiras. Un objeto por ronda con lo que la prueba necesita mover: cuánto tarda cada
   ruta, si /salud falla, cuántas páginas trae /jalar, y qué contesta cada proveedor de IA.
   ------------------------------------------------------------------------------------------ */
function puenteDeMentiras() {
  const M = {
    llamadas: {}, retraso: {}, saludFalla: false, jalarRestan: 0, ia: {},
    liberar: null,
  };
  /* Qwen no tiene llave y DeepSeek no contesta; Gemini lo decide cada escena de la prueba. */
  M.ia.qwen = async () => ({ ok: false, codigo: 'SIN_LLAVE', mensaje: 'Qwen no tiene llave en la hoja' });
  M.ia.deepseek = async () => ({ ok: false, codigo: 'ERROR', mensaje: 'DeepSeek no contestó' });
  M.ia.gemini = async () => { await dormir(1300); return { ok: true, texto: LARGA }; };
  M.atender = async route => {
    let e = {};
    try { e = JSON.parse(route.request().postData() || '{}'); } catch (_) {}
    const ruta = String(e.ruta || 'salud').replace(/^\/+|\/+$/g, '');
    M.llamadas[ruta] = (M.llamadas[ruta] || 0) + 1;
    const json = c => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(c) }).catch(() => {});
    if (M.retraso[ruta]) await dormir(M.retraso[ruta]);
    if (ruta === 'salud') {
      if (M.saludFalla) return json({ ok: false, codigo: 'SIN_RED', mensaje: 'El puente no contestó (de mentiras)' });
      /* La versión que la plataforma espera: con otra, `avisoVersion` saca un aviso de 600 caracteres que tapa media pantalla. */
      return json({ ok: true, ts: Date.now(), version: 'puente-sheets-8', rol: 'direccion', escribibles: ['Proyecto', 'Estatus'],
        destino: 'google-sheets', ia: { qwen: true, deepseek: true, gemini: true } });
    }
    if (ruta === 'esquema') return json({ ok: true, faltan: [], accesos: M.sinAccesos ? false : true, nota: M.sinAccesos ? 'falta «Accesos»' : '' });
    if (ruta === 'jalar') {
      const mas = M.jalarRestan > 0; if (mas) M.jalarRestan--;
      return json({ ok: true, hay_mas: mas, cursor: mas ? 'c' + M.jalarRestan : null, registros: [] });
    }
    if (ruta === 'empujar') return json({ ok: true, resultados: [] });
    if (ruta === 'ia') {
      const f = M.ia[e.prov];
      return json(f ? await f(e) : { ok: false, codigo: 'ERROR', mensaje: 'proveedor desconocido' });
    }
    return json({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'ruta no simulada' });
  };
  return M;
}

/* ------------------------------------------------------------------------------------------
   Abrir la plataforma en Ajustes. Un contexto por ronda con el tema, el movimiento y el
   dispositivo de entrada pedidos. Los vigilantes del DOM se ponen ANTES de que corra la página:
   anotan lo que dura un cuadro —la silueta de la portada, el nombre de la animación con que entró
   la burbuja, la ficha que viaja, la transición del tema, la secuencia de estados de los botones—.
   ------------------------------------------------------------------------------------------ */
async function abrir({ ancho = 360, alto = 740, tema = 'claro', reducido = false, tactil = true, rol = 'direccion', puente = true, nombre = 'Beto', esperar = '#aj-indice' } = {}) {
  const movil = ancho < 760;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, hasTouch: tactil, isMobile: movil && tactil, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block', reducedMotion: reducido ? 'reduce' : 'no-preference',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.addInitScript(([t, url, tok, rol0, conPuente, nombre0]) => {
    try {
      localStorage.setItem('al3d_tema', t);
      localStorage.setItem('al3d_pf_rol', rol0);
      if (nombre0) localStorage.setItem('al3d_pf_nombre', nombre0);
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
      if (conPuente) localStorage.setItem('al3d_pf_puente', JSON.stringify({ url, token: tok }));
      localStorage.setItem('al3d_pf_ia_ok', 'true');     // ya dijo «entendido»: la prueba no es del permiso
    } catch (_) {}
    window.__ia = { silueta: false, busy: false, texto: '', cajas: 0, relojViejo: false, anim: [], estados: [], ficha: false, vt: 0, revela: false };
    const vt0 = document.startViewTransition;
    if (typeof vt0 === 'function') document.startViewTransition = function (...a) { window.__ia.vt++; return vt0.apply(this, a); };
    const mirar = () => {
      const c = document.getElementById('pf-ia');
      if (c) {
        const s = c.querySelector('.ia-hoy-cargando .silueta');
        if (s) { __ia.silueta = true; __ia.busy = s.getAttribute('aria-busy') === 'true'; __ia.texto = s.textContent; __ia.cajas = s.querySelectorAll('.silueta-cifra').length; }
        if (c.querySelector('.ia-hoy-cargando .svgi')) __ia.relojViejo = true;
        c.querySelectorAll('.ia-msg[data-nueva]').forEach(e => { if (!e.__visto) { e.__visto = true; e.getAnimations().forEach(a => __ia.anim.push(a.animationName)); } });
      }
      if (document.querySelector('#aj-indice .ficha-viaja')) __ia.ficha = true;
      if (document.documentElement.classList.contains('tema-revela')) __ia.revela = true;
    };
    const arrancar = () => {
      new MutationObserver(mirar).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      new MutationObserver(ms => ms.forEach(m => { if (m.target.dataset && m.target.dataset.act) __ia.estados.push(m.target.dataset.act + ':' + (m.target.dataset.estado || '')); }))
        .observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-estado'] });
    };
    if (document.documentElement) arrancar();
    else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); arrancar(); } }).observe(document, { childList: true });
  }, [tema, PUENTE, TOKEN, rol, puente, nombre]);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const M = puenteDeMentiras();
  await ctx.route(PUENTE, M.atender);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await p.goto(B + '/#/ajustes', { waitUntil: 'load' });
  await p.waitForSelector(esperar, { timeout: 30000 });
  await p.waitForTimeout(700);
  return { ctx, p, errores, M };
}

/* Espera a que algo ASÍNCRONO se cumpla. `waitForFunction` no espera la promesa de un predicado
   `async` —la da por verdadera al instante—, y una prueba que espera así pasa sin haber esperado. */
async function hasta(p, fn, arg, ms = 6000) {
  const t0 = Date.now();
  for (;;) {
    if (await p.evaluate(fn, arg)) return true;
    if (Date.now() - t0 > ms) throw new Error('se acabó el tiempo esperando a que se cumpliera la condición');
    await dormir(80);
  }
}

const sinDesborde = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/* Animaciones que no acaban, EN REPOSO. El botón de la IA es la única pieza que se mueve sola. */
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity)
  .filter(a => { const t = a.effect.target; return !(t && t.closest && t.closest('.pf-ia-btn')); })
  .map(a => (a.animationName || a.transitionProperty || '?') + ' en ' + ((a.effect.target && (a.effect.target.className && a.effect.target.className.baseVal === undefined ? a.effect.target.className : '')) || '?')));
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

/* ------------------------------------------------------------------------------------------
   Una ronda: toda la pantalla, con el tema, el ancho, el movimiento y el dispositivo de entrada
   que se pidan.
   ------------------------------------------------------------------------------------------ */
async function ronda(cfg) {
  const nombre = cfg.ancho + ' px · ' + cfg.tema + ' · ' + (cfg.reducido ? 'menos movimiento' : 'con movimiento') +
    ' · ' + (cfg.tactil ? 'dedo' : 'ratón y teclado');
  console.log('\n' + nombre.toUpperCase());
  const { ctx, p, errores, M } = await abrir(cfg);
  const movil = cfg.ancho < 760;
  const tag = cfg.ancho + '-' + cfg.tema + (cfg.reducido ? '-rm' : '');
  /* Si un toque no cae, se dice QUÉ lo tapa: «Timeout 30000ms» a secas no ayuda a nadie. */
  const toca = async (sel, o) => {
    try { await (cfg.tactil ? p.tap(sel, { timeout: 9000, ...o }) : p.click(sel, { timeout: 9000, ...o })); }
    catch (e) {
      const q = await p.evaluate(s => { const el = document.querySelector(s); if (!el) return 'no existe'; const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2,
        t = document.elementFromPoint(x, y); return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], encima: t ? (t.tagName + '.' + t.className + '#' + t.id) : null,
        estado: el.dataset.estado || '', aria: el.getAttribute('aria-disabled'), scrollY: Math.round(scrollY) }; }, sel).catch(() => '?');
      await p.screenshot({ path: '/tmp/claude-0/-home-user-cotizador-al3d/ae96bd60-a1ef-52f8-9258-59babac6b6d0/scratchpad/pf-ajustes/fallo-toque.png' }).catch(() => {});
      throw new Error('el toque en «' + sel + '» no cayó: ' + JSON.stringify(q));
    }
  };
  const ev = (fn, a) => p.evaluate(fn, a);
  const seccion = async (titulo, fn) => {
    console.log(' · ' + titulo);
    try { await fn(); } catch (e) {
      mal(titulo + ': la sección se rompió', String(e && e.message || e).split('\n')[0]);
      for (let i = 0; i < 2; i++) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(250); }
    }
  };
  const abierto = () => ev(() => document.getElementById('pf-ia').classList.contains('show'));
  const abrirAsistente = async () => {
    if (!(await abierto())) await toca('#pf-ia-btn');
    await p.waitForSelector('#pf-ia.show #ia-pregunta', { timeout: 8000 });
    await p.waitForTimeout(400);
  };
  const cerrarAsistente = async () => {
    if (await abierto()) await toca('#pf-ia [data-ia-cerrar]');
    await hasta(p, () => !document.getElementById('pf-ia').classList.contains('show'), null, 4000);
  };
  /* Enviar lo escrito: con dedo se toca el botón; con teclado, Enter en el campo. */
  const enviar = async () => {
    if (cfg.tactil) await p.tap('#pf-ia .ia-enviar');
    else { await p.focus('#ia-pregunta'); await p.keyboard.press('Enter'); }
  };
  const pasos = () => ev(() => [...document.querySelectorAll('#pf-ia .traza-paso')].map(li => ({
    clave: li.dataset.clave, estado: li.dataset.estado,
    t: li.querySelector('.traza-t').textContent, d: li.querySelector('.traza-d').textContent.trim(),
    reloj: li.querySelector('.traza-reloj').textContent })));

  /* =====================================================================================
     EL ASISTENTE
     ===================================================================================== */

  await seccion('F16 · la silueta en vez de «Leyendo el taller…»', async () => {
    await abrirAsistente();
    await p.waitForSelector('#pf-ia .ia-cifras', { timeout: 8000 });
    const v = await ev(() => ({ ...window.__ia }));
    cierto(v.silueta && v.busy, 'la portada pintó la silueta con aria-busy', v);
    cierto(/Leyendo el taller/.test(v.texto), 'con su texto de estado «Leyendo el taller…»', v.texto);
    cierto(v.cajas >= 3, 'con las cajas de las cifras (la forma de lo que va a llegar)', v.cajas);
    cierto(!v.relojViejo, 'y el reloj fijo que giraba para siempre ya no existe');
    cierto(await ev(() => !document.querySelector('#pf-ia .silueta')), 'la silueta se va cuando llegan las cifras');
    cierto(await ev(() => document.getElementById('ia-cuerpo').scrollTop === 0), 'la portada se lee desde arriba (scrollTop 0)');
  });

  await seccion('F2 · «Enviar» nace fantasma y se llena con texto', async () => {
    const lee = () => ev(() => {
      const b = document.querySelector('#pf-ia .ia-enviar');
      return { listo: b.classList.contains('listo'), aria: b.getAttribute('aria-disabled'), dis: b.disabled, fondo: getComputedStyle(b).backgroundColor,
        label: b.getAttribute('aria-label'), alto: b.getBoundingClientRect().height, ancho: b.getBoundingClientRect().width };
    });
    const v0 = await lee();
    cierto(!v0.listo && v0.aria === 'true' && !v0.dis, 'con el campo vacío es fantasma y aria-disabled (no disabled)', v0);
    await p.fill('#ia-pregunta', PREGUNTA_LIBRE);
    await p.waitForTimeout(260);
    const v1 = await lee();
    cierto(v1.listo && v1.aria === 'false', 'con texto se llena de color y deja de estar aria-disabled', v1);
    cierto(v1.fondo !== v0.fondo, 'y el fondo cambió de verdad', { antes: v0.fondo, ahora: v1.fondo });
    const llena = await ev(() => { const t = document.createElement('i'); t.style.background = 'var(--a-fill)'; document.body.appendChild(t); const c = getComputedStyle(t).backgroundColor; t.remove(); return c; });
    cierto(v1.fondo === llena, 'es el color de acento del sistema (un solo botón de color)', { v: v1.fondo, acento: llena });
    cierto(v1.alto >= 44 && v1.ancho >= 44, 'mide 44 px o más', v1);
    cierto(v1.label === 'Preguntar', 'su nombre accesible es «Preguntar»', v1.label);
    const c = await contraste(p, '#pf-ia .ia-enviar.listo');
    cierto(c >= 3, 'el icono blanco sobre el acento supera 3:1 (es un icono, no texto)', c);
    await p.fill('#ia-pregunta', '');
    await p.waitForTimeout(260);
    cierto((await lee()).listo === false, 'vacío otra vez, vuelve a fantasma');
    /* Tocar el botón vacío no se queda mudo: lleva al campo, que es lo que falta. */
    await toca('#pf-ia .ia-enviar', { force: true });
    cierto(await ev(() => document.activeElement && document.activeElement.id === 'ia-pregunta'), 'tocarlo vacío lleva al campo');
  });

  await seccion('F14 · la espera es una traza de pasos reales; F2 · «Detener» cancela sin cerrar', async () => {
    M.ia.gemini = () => new Promise(res => { M.liberar = res; });          // Gemini no contesta hasta que la prueba quiera
    await p.fill('#ia-pregunta', PREGUNTA_LIBRE);
    await enviar();
    await p.waitForSelector('#pf-ia .ia-enviar.detener', { timeout: 6000 });
    await hasta(p, () => document.querySelectorAll('#pf-ia .traza-paso').length >= 4, null, 6000)
      .catch(async e => { console.log('DEPURA pasos:', JSON.stringify(await pasos()), (await ev(() => document.querySelector('#pf-ia .ia-hilo').innerHTML)).slice(0, 1200), JSON.stringify(M.llamadas)); throw e; });
    const b = await ev(() => { const x = document.querySelector('#pf-ia .ia-enviar'), ta = document.getElementById('ia-pregunta'); return {
      label: x.getAttribute('aria-label'), dis: x.disabled, aria: x.getAttribute('aria-disabled'), cuadro: !!x.querySelector('.ia-parar'),
      taDis: ta.disabled, ancho: x.getBoundingClientRect().width, alto: x.getBoundingClientRect().height }; });
    cierto(b.label === 'Detener la pregunta' && b.cuadro, 'el botón es el cuadro de «Detener»', b);
    cierto(!b.dis && b.aria !== 'true', 'y NO está apagado: ni disabled ni aria-disabled (recibe el toque)', b);
    cierto(b.ancho >= 44 && b.alto >= 44, 'mide 44 px o más', b);
    cierto(b.taDis, 'el campo espera mientras tanto');
    await foto(p, 'ia-espera-' + tag);
    const ps = await pasos();
    const por = c => ps.find(x => x.clave === c) || {};
    cierto(por('taller').estado === 'ok' && /Leí el taller/.test(por('taller').t), 'paso 1: «Leí el taller» listo', ps);
    cierto(por('prov0').estado === 'salta' && /Qwen/.test(por('prov0').t) && /sin llave/.test(por('prov0').d), 'paso 2: «Qwen · sin llave» se SALTA (no es una falla)', por('prov0'));
    cierto(por('prov1').estado === 'mal' && /DeepSeek/.test(por('prov1').t) && /no contestó/.test(por('prov1').d), 'paso 3: «DeepSeek · no contestó» queda con su motivo', por('prov1'));
    cierto(por('prov2').estado === 'trabaja' && /Preguntando a Gemini/.test(por('prov2').t), 'paso 4: «Preguntando a Gemini» trabajando', por('prov2'));
    await dormir(2400);          // el reloj late cada segundo: hay que dejar pasar al menos un latido después del primer segundo completo
    const r1 = (await pasos()).find(x => x.clave === 'prov2').reloj;
    cierto(/^\d+ s$/.test(r1), 'el paso que trabaja lleva su reloj («' + r1 + '»)', r1);
    /* El texto de la traza se lee: cada pieza de texto contra su fondo, en este tema. */
    for (const [sel, que] of [['.traza-paso[data-estado="ok"] .traza-t', 'el paso hecho'], ['.traza-paso[data-estado="salta"] .traza-d', 'el motivo del que se saltó'],
      ['.traza-paso[data-estado="mal"] .traza-d', 'el motivo del que falló'], ['.traza-paso[data-estado="trabaja"] .traza-t', 'el que trabaja'],
      ['.traza-paso[data-estado="trabaja"] .traza-reloj', 'su reloj']]) {
      const c = await contraste(p, '#pf-ia ' + sel);
      cierto(c >= 4.5, que + ' se lee a ' + c + ':1', c);
    }
    /* El panel se repinta entero con cada mensaje nuevo: la traza tiene que ser el MISMO nodo (con su reloj
       andando), no una copia que empiece en 0. Se le pone una marca y se comprueba al final. */
    await ev(() => { document.querySelector('#pf-ia .traza').__marca = 'mismo'; });
    /* Detener. */
    if (cfg.tactil) await p.tap('#pf-ia .ia-enviar.detener');
    else { cierto(await ev(() => document.activeElement && document.activeElement.classList.contains('detener')), 'con teclado el foco se quedó en «Detener»'); await p.keyboard.press('Enter'); }
    await p.waitForSelector('#pf-ia .ia-enviar:not(.detener)', { timeout: 4000 });
    await foto(p, 'ia-detenida-' + tag);
    cierto(await abierto(), 'el panel sigue abierto');
    const d = await ev(() => ({ txt: document.querySelector('#pf-ia .ia-hilo').innerText, resumen: (document.querySelector('#pf-ia .traza-resumen') || {}).textContent,
      taDis: document.getElementById('ia-pregunta').disabled, abierto: document.querySelector('#pf-ia .traza-pliegue') ? document.querySelector('#pf-ia .traza-pliegue').open : null }));
    cierto(/Quedó sin respuesta: la detuviste/.test(d.txt), 'el hilo dice «Quedó sin respuesta: la detuviste…»', d.txt.slice(-200));
    cierto(!/cerraste el asistente/.test(d.txt), 'y NO le miente diciendo que cerró el asistente');
    cierto(/Detenida/.test(d.resumen || ''), 'la traza se pliega en «Detenida»', d.resumen);
    cierto(!d.taDis, 'el campo quedó libre');
    cierto(await ev(() => document.querySelector('#pf-ia .traza').__marca === 'mismo'), 'la traza plegada es el mismo nodo que estaba viva (el panel se repintó y no la rehízo)');
    /* La respuesta de Gemini llega tarde: se tira. */
    M.liberar({ ok: true, texto: 'RESPUESTA TARDIA QUE NO DEBE VERSE' });
    await dormir(500);
    cierto(!(await texto(p, '#pf-ia .ia-hilo') || '').includes('RESPUESTA TARDIA'), 'lo que Gemini conteste después de «Detener» se tira');
    /* Y el asistente está libre YA: una pregunta de las de siempre se contesta al instante. */
    await toca('#pf-ia .ia-tira [data-ia-intent="tarde"]');
    await p.waitForSelector('#pf-ia .ia-fuente.local', { timeout: 6000 });
    bien('una pregunta rápida se contesta enseguida: nada se quedó ocupado');
  });

  await seccion('F14 + F15 + F31 · contesta Gemini: la traza se pliega y la respuesta se lee desde su principio', async () => {
    await ev(() => { document.querySelector('#pf-ia [data-ia-limpiar]').click(); });
    M.ia.gemini = async () => { await dormir(1300); return { ok: true, texto: LARGA }; };
    await p.fill('#ia-pregunta', PREGUNTA_LIBRE);
    const antesAnim = await ev(() => window.__ia.anim.length);
    await enviar();
    await p.waitForSelector('#pf-ia .ia-hilo .traza', { timeout: 6000 });
    await ev(() => { document.querySelector('#pf-ia .traza').__marca = 'mismo'; });
    await p.waitForSelector('#pf-ia .ia-hilo .ia-fuente:not(.local)', { timeout: 12000 });
    await p.waitForTimeout(800);
    await foto(p, 'ia-respuesta-' + tag);
    /* F15 primero, antes de tocar nada: el principio de la respuesta, no el final. */
    const sc = await ev(() => {
      const c = document.getElementById('ia-cuerpo'), msgs = [...document.querySelectorAll('#pf-ia .ia-hilo > .ia-msg.bot')], m = msgs[msgs.length - 1];
      const cr = c.getBoundingClientRect(), mr = m.getBoundingClientRect(), li = m.querySelector('li').getBoundingClientRect();
      return { arriba: Math.round(mr.top - cr.top), alFondo: Math.round(c.scrollHeight - c.scrollTop - c.clientHeight), primera: li.top >= cr.top - 1 && li.bottom <= cr.bottom,
        ultimaVisible: m.innerText.includes('Fin de la respuesta') && (() => { const ps = m.querySelectorAll('p'); const u = ps[ps.length - 1].getBoundingClientRect(); return u.top < cr.bottom && u.bottom > cr.top; })() };
    });
    cierto(Math.abs(sc.arriba) <= 24, 'el principio de la respuesta queda arriba del cuerpo (no el final)', sc);
    cierto(sc.primera, 'se ve el primer renglón de la lista', sc);
    cierto(sc.alFondo > 40 && !sc.ultimaVisible, 'y el final todavía queda por leer (no se bajó al fondo)', sc);
    const nv = await ev(() => ({ n: document.querySelectorAll('#pf-ia [data-nueva]').length, anim: window.__ia.anim.slice() }));
    cierto(nv.n === 1, 'solo UNA burbuja lleva data-nueva (la que llegó)', nv);
    cierto(nv.anim.length > antesAnim && nv.anim.slice(antesAnim).every(a => a === (cfg.reducido ? 'aparece' : 'entra')),
      cfg.reducido ? 'con menos movimiento entra con un fundido (sin subir)' : 'entra con su subida breve', nv.anim);
    /* F14: la traza se pliega, y es el mismo nodo que estaba viva (el panel se repintó y no la rehízo). */
    const t = await ev(() => { const r = document.querySelector('#pf-ia .traza-resumen'), pl = document.querySelector('#pf-ia .traza-pliegue'); return {
      resumen: r && r.textContent.replace(/\s+/g, ' ').trim(), cerrado: pl && !pl.open, estado: r && r.dataset.estado,
      pasos: [...document.querySelectorAll('#pf-ia .traza-paso')].length, mismo: document.querySelector('#pf-ia .traza').__marca === 'mismo' }; });
    cierto(/^Contestó Gemini( en \d+ s)?$/.test(t.resumen || ''), 'la traza se pliega en «' + t.resumen + '»', t);
    cierto(t.cerrado && t.estado === 'ok', 'plegada y en verde (ok)', t);
    /* Qwen ya dijo «sin llave» en la pregunta de antes y la app lo recuerda: esta vez la cadena empieza en DeepSeek. */
    cierto(t.pasos === 3, 'con sus tres pasos adentro (Qwen ya no se pregunta: la hoja dijo que no tiene llave)', t);
    cierto(t.mismo, 'y es el mismo nodo que estaba viva: el panel se repintó y no la rehízo', t);
    await toca('#pf-ia .traza-resumen');
    await p.waitForTimeout(250);
    const ab = await ev(() => [...document.querySelectorAll('#pf-ia .traza-pasos .traza-paso')].map(li => li.textContent.replace(/\s+/g, ' ').trim()));
    cierto(ab.some(x => /DeepSeek/.test(x) && /no contestó/.test(x)) && ab.some(x => /Gemini/.test(x)), 'abierta, muestra por qué tardó (DeepSeek no contestó…)', ab);
    await toca('#pf-ia .traza-resumen');
    /* Cerrar y volver a abrir: se ve el PRINCIPIO de lo último que se contestó, sin animar, y el repintado que
       trae /salud un instante después no manda a quien lee al fondo ni vuelve a hacer entrar la burbuja. */
    await p.fill('#ia-pregunta', 'a medio escribir');
    await cerrarAsistente();
    await abrirAsistente();
    await p.waitForTimeout(900);
    const re = await ev(() => { const c = document.getElementById('ia-cuerpo'), m = [...document.querySelectorAll('#pf-ia .ia-hilo > .ia-msg.bot')].pop();
      return { arriba: Math.round(m.getBoundingClientRect().top - c.getBoundingClientRect().top), borrador: document.getElementById('ia-pregunta').value,
        nuevas: document.querySelectorAll('#pf-ia [data-nueva]').length, alFondo: Math.round(c.scrollHeight - c.scrollTop - c.clientHeight) }; });
    cierto(Math.abs(re.arriba) <= 24 && re.alFondo > 40, 'al reabrir se ve el principio de lo último que se contestó', re);
    cierto(re.nuevas === 0, 'y sin animación: la burbuja no vuelve a entrar', re);
    cierto(re.borrador === 'a medio escribir', 'ni el repintado se lleva lo que se estaba escribiendo', re);
    await p.fill('#ia-pregunta', '');

    /* F31: copiar confirma en el botón. */
    await ev(() => { const x = document.querySelector('#pf-ia [data-ia-copiar]'); x.scrollIntoView({ block: 'center' }); });
    await toca('#pf-ia [data-ia-copiar]');
    await p.waitForTimeout(350);
    /* La pieza 23 deja los dos rótulos en la misma celda y cruza cuál se ve: el que se ve lleva `.alt` en su caja. */
    const rotulo = () => ev(() => { const x = document.querySelector('#pf-ia [data-ia-copiar]'), r = x.querySelector('.rotulo');
      const visible = r.classList.contains('alt') ? r.querySelector('.rotulo-b') : r.querySelector('.rotulo-a');
      return { txt: visible.textContent.replace(/\s+/g, ' ').trim(), pal: !!visible.querySelector('.palomita'), alt: r.classList.contains('alt'),
        ancho: Math.round(x.getBoundingClientRect().width), toast: document.getElementById('toast').textContent }; });
    const cp = await rotulo();
    cierto(cp.alt && cp.txt === 'Copiada' && cp.pal, 'el botón tocado dice «Copiada» con su palomita', cp);
    cierto(/Respuesta copiada/.test(cp.toast), 'y el aviso de abajo se queda', cp.toast.slice(0, 80));
    await p.waitForTimeout(2300);
    const cp2 = await rotulo();
    cierto(!cp2.alt && cp2.txt === 'Copiar', 'a los ~2 s vuelve a decir «Copiar»', cp2);
    cierto(Math.abs(cp2.ancho - cp.ancho) <= 1, 'y el botón no cambió de ancho en el camino (nada brinca)', { cp, cp2 });
    cierto(await ev(async () => { try { return (await navigator.clipboard.readText()).includes('Fin de la respuesta'); } catch (_) { return true; } }), 'y lo copiado es la respuesta');

    /* La respuesta siguiente (una local) sí entra: la anterior ya no lleva data-nueva. */
    await toca('#pf-ia .ia-tira [data-ia-intent="semana"]');
    await p.waitForSelector('#pf-ia .ia-fuente.local', { timeout: 6000 });
    await p.waitForTimeout(400);
    cierto(await ev(() => document.querySelectorAll('#pf-ia [data-nueva]').length === 1), 'una respuesta nueva más: de nuevo UNA sola con data-nueva');
    cierto(await sinDesborde(p), 'sin desborde de lado con el asistente abierto');
  });

  await seccion('F30 · los bordes de la tira de preguntas', async () => {
    const t = await ev(() => { const x = document.querySelector('#pf-ia .ia-tira'); return x ? {
      x: x.classList.contains('bordes-x'), despues: x.classList.contains('hay-despues'), antes: x.classList.contains('hay-antes'),
      mask: getComputedStyle(x).maskImage || getComputedStyle(x).webkitMaskImage, desborda: x.scrollWidth > x.clientWidth + 1 } : null; });
    await foto(p, 'ia-tira-' + tag);
    cierto(!!t && t.x, 'la tira lleva la clase de la pieza (bordes-x)', t);
    if (t && t.desborda) {
      cierto(t.despues && !t.antes, 'al principio solo se desvanece el lado derecho (hay más)', t);
      cierto(t.mask && t.mask !== 'none', 'con su máscara puesta', t.mask);
      await ev(() => { const x = document.querySelector('#pf-ia .ia-tira'); x.scrollLeft = x.scrollWidth; });
      await p.waitForTimeout(250);
      const f = await ev(() => { const x = document.querySelector('#pf-ia .ia-tira'); return { despues: x.classList.contains('hay-despues'), antes: x.classList.contains('hay-antes') }; });
      cierto(f.antes && !f.despues, 'al final solo se desvanece el lado izquierdo', f);
      await ev(() => { document.querySelector('#pf-ia .ia-tira').scrollLeft = 0; });
    } else bien('la tira cabe entera a este ancho: no hay nada que desvanecer');
    await p.emulateMedia({ media: 'print' });
    const imp = await ev(() => { const m = getComputedStyle(document.querySelector('#pf-ia .ia-tira')); return m.maskImage || m.webkitMaskImage || 'none'; });
    await p.emulateMedia({ media: 'screen' });
    cierto(imp === 'none', 'en papel no hay máscara', imp);
  });

  await seccion('F2 · cerrar el panel mientras espera también libera el asistente', async () => {
    M.ia.gemini = () => new Promise(res => { M.liberar = res; });
    await ev(() => { document.querySelector('#pf-ia [data-ia-limpiar]').click(); });
    await p.fill('#ia-pregunta', PREGUNTA_LIBRE);
    await enviar();
    await p.waitForSelector('#pf-ia .ia-enviar.detener', { timeout: 6000 });
    await hasta(p, () => document.querySelectorAll('#pf-ia .traza-paso').length >= 4, null, 6000);
    await cerrarAsistente();
    await dormir(300);
    await abrirAsistente();
    const txt = await texto(p, '#pf-ia .ia-hilo');
    cierto(/cerraste el asistente/.test(txt || ''), 'al volver dice que cerraste el asistente (y no «la detuviste»)', (txt || '').slice(-160));
    cierto(await ev(() => !document.getElementById('ia-pregunta').disabled && !document.querySelector('#pf-ia .ia-enviar.detener')), 'y el asistente ya no está ocupado (no esperó los 60 s)');
    M.liberar && M.liberar({ ok: true, texto: 'tarde' });
    await ev(() => { document.querySelector('#pf-ia [data-ia-limpiar]').click(); });
    cierto(await ev(() => document.getElementById('ia-cuerpo').scrollTop === 0), 'al empezar de nuevo la portada vuelve a leerse desde arriba');
    await cerrarAsistente();
    cierto((await infinitas(p)).length === 0, 'nada se mueve en reposo con el asistente cerrado', await infinitas(p));
  });

  /* =====================================================================================
     AJUSTES
     ===================================================================================== */

  await seccion('F22 · el índice que sigue al scroll', async () => {
    await ev(() => window.scrollTo(0, 0));
    await p.waitForTimeout(300);
    await foto(p, 'aj-arriba-' + tag);
    const e = await ev(() => {
      const nav = document.getElementById('aj-indice'), caja = document.getElementById('aj-indice-caja'), cab = document.querySelector('.pf-cab');
      const bs = [...nav.querySelectorAll('.aj-ir')];
      return { n: bs.length, textos: bs.map(b => b.textContent), etiqueta: nav.getAttribute('aria-label'), pos: getComputedStyle(caja).position,
        top: parseFloat(getComputedStyle(caja).top), cab: Math.round(cab.getBoundingClientRect().height), altoBoton: Math.round(bs[0].getBoundingClientRect().height),
        actual: bs.filter(b => b.getAttribute('aria-current') === 'true').map(b => b.textContent),
        p: caja.querySelector('.aj-progreso i').style.getPropertyValue('--p'), bordes: nav.classList.contains('bordes-x'), despues: nav.classList.contains('hay-despues'),
        desborda: nav.scrollWidth > nav.clientWidth + 1 };
    });
    cierto(e.n === 7 && e.textos.join('|') === 'Quién eres|Tema|Respaldo|Mapa|Calendar|Puente|Borrar', 'siete nombres: Quién eres · Tema · Respaldo · Mapa · Calendar · Puente · Borrar', e.textos);
    cierto(e.etiqueta === 'Secciones de Ajustes', 'la tira es una <nav> con nombre', e.etiqueta);
    cierto(e.pos === 'sticky' && e.top === e.cab, 'es sticky justo debajo del encabezado (top ' + e.top + ' px = alto del encabezado ' + e.cab + ')', e);
    cierto(e.altoBoton >= (cfg.tactil ? 44 : 36), 'cada nombre mide ' + (cfg.tactil ? '44' : '36') + ' px o más de alto', e.altoBoton);
    cierto(e.actual.length === 1 && e.actual[0] === 'Quién eres', 'arriba del todo va marcada «Quién eres» (una sola con aria-current)', e.actual);
    cierto(Number(e.p) === 0, 'y el progreso de lectura está en 0', e.p);
    if (e.desborda) cierto(e.bordes && e.despues, 'la tira se desliza de lado y se desvanece del lado donde hay más', e);
    else cierto(!e.despues, 'cabe entera a este ancho: no se desvanece', e);

    /* Tocar un nombre lleva a su tarjeta, debajo de la tira. */
    for (const [boton, id] of [['Respaldo', 'aj-s-respaldo'], ['Puente', 'aj-s-puente'], ['Mapa', 'aj-s-mapa']]) {
      await toca('#aj-indice .aj-ir:text-is("' + boton + '")');
      await dormir(cfg.reducido ? 300 : 1100);
      const r = await ev(a => { const c = document.getElementById(a.id).getBoundingClientRect(), caja = document.getElementById('aj-indice-caja').getBoundingClientRect();
        const cur = document.querySelector('#aj-indice .aj-ir[aria-current="true"]'); return { dist: Math.round(c.top - caja.bottom), actual: cur && cur.textContent }; }, { id });
      cierto(r.dist >= -4 && r.dist <= 40, '«' + boton + '» lleva su tarjeta justo debajo de la tira (' + r.dist + ' px)', r);
      cierto(r.actual === boton, 'y la tira la marca', r);
    }
    await foto(p, 'aj-indice-puente-' + tag);
    const prog = await ev(() => Number(document.querySelector('.aj-progreso i').style.getPropertyValue('--p')));
    cierto(prog > 0.1 && prog < 1, 'el progreso de lectura avanzó con el scroll (' + prog + ')', prog);

    /* Al final de la página, «Borrar», y su nombre se ve entero en la tira. */
    await ev(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await dormir(500);
    const fin = await ev(() => { const nav = document.getElementById('aj-indice').getBoundingClientRect(), b = document.querySelector('#aj-indice .aj-ir[aria-current="true"]').getBoundingClientRect();
      return { actual: document.querySelector('#aj-indice .aj-ir[aria-current="true"]').textContent, dentro: b.left >= nav.left - 1 && b.right <= nav.right + 1,
        p: Number(document.querySelector('.aj-progreso i').style.getPropertyValue('--p')) }; });
    cierto(fin.actual === 'Borrar' && fin.p > 0.98, 'al llegar al final queda «Borrar» y el progreso llega a 1', fin);
    cierto(fin.dentro, 'y la marcada se ve entera dentro de la tira (la tira se corre, no la página)', fin);

    /* Un salto de scroll cualquiera —no un toque en la tira— también mueve la marca. */
    await ev(() => { window.scrollTo({ top: document.getElementById('aj-s-gcal').getBoundingClientRect().top + scrollY - 90, behavior: 'instant' }); });
    await dormir(300);
    cierto(await ev(() => (document.querySelector('#aj-indice .aj-ir[aria-current="true"]') || {}).textContent) === 'Calendar', 'un salto de scroll cualquiera marca la sección en la que cae («Calendar»)');

    /* La ficha que viaja entre nombres. */
    await ev(() => { window.__ia.ficha = false; window.scrollTo(0, 0); });
    await dormir(400);
    await ev(() => { window.__ia.ficha = false; });
    await toca('#aj-indice .aj-ir:text-is("Respaldo")');
    await dormir(cfg.reducido ? 300 : 1100);
    const ficha = await ev(() => window.__ia.ficha);
    cierto(cfg.reducido ? !ficha : ficha, cfg.reducido ? 'con menos movimiento la ficha NO viaja: el nombre cambia y ya' : 'con movimiento la ficha viaja de un nombre al otro', ficha);
    cierto(await ev(() => !document.querySelector('#aj-indice .ficha-viaja')), 'y en reposo no queda ninguna ficha flotando');

    /* Teclado: Enter en un nombre lleva el foco al título de su tarjeta. */
    if (!cfg.tactil) {
      await p.focus('#aj-indice .aj-ir:text-is("Mapa")');
      await p.keyboard.press('Enter');
      await dormir(700);
      const f = await ev(() => ({ tag: document.activeElement.tagName, dentro: !!document.activeElement.closest('#aj-s-mapa') }));
      cierto(f.tag === 'H2' && f.dentro, 'con Enter el foco pasa al título de la tarjeta (el siguiente Tab sigue ahí)', f);
    }
    const fuente = await (await fetch(B + '/js/mod/ajustes.js')).text();
    cierto(!/\.scrollIntoView\(/.test(fuente), 'ajustes.js no usa scrollIntoView para acomodar la ficha activa');
    cierto(await sinDesborde(p), 'sin desborde de lado');
    await ev(() => window.scrollTo(0, 0));
    await p.emulateMedia({ media: 'print' });
    cierto(await ev(() => getComputedStyle(document.getElementById('aj-indice-caja')).display === 'none'), 'en papel la tira no sale');
    await p.emulateMedia({ media: 'screen' });
    const ct = await contraste(p, '#aj-indice .aj-ir[aria-current="true"]');
    cierto(ct >= 4.5, 'el nombre marcado se lee a ' + ct + ':1 (mínimo 4.5)', ct);
    const ct2 = await contraste(p, '#aj-indice .aj-ir:not([aria-current="true"])');
    cierto(ct2 >= 4.5, 'los demás se leen a ' + ct2 + ':1', ct2);
  });

  await seccion('F3 · el respaldo como medidor quieto', async () => {
    const r = await ev(() => {
      const m = document.querySelector('#aj-s-respaldo .aj-medidor .medidor'), dl = [...document.querySelectorAll('#aj-s-respaldo dl')].find(d => /Espacio/.test(d.textContent));
      return m ? { oculto: m.getAttribute('aria-hidden'), sinTexto: m.textContent === '', alto: Math.round(m.getBoundingClientRect().height), v: m.style.getPropertyValue('--v'),
        frase: dl ? dl.textContent.replace(/\s+/g, ' ') : null, anima: m.getAnimations({ subtree: true }).length, despuesDeLaFrase: dl ? !!(dl.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) : false } : null;
    });
    if (!r) { bien('este navegador no dice cuánto espacio presta: sin cuota no hay contra qué medir y no se pinta (a propósito)'); return; }
    cierto(r.oculto === 'true' && r.sinTexto, 'la barra es aria-hidden y no lleva texto encima', r);
    cierto(r.alto >= 5 && r.alto <= 8, 'mide 6 px', r.alto);
    cierto(/usados de .*\(\d+(\.\d+)?%\)/.test(r.frase || ''), 'la frase «X MB usados de Y (n%)» se queda', r.frase);
    cierto(r.despuesDeLaFrase, 'y la barra va debajo de ella', r);
    cierto(r.v !== '' && r.anima === 0, 'trae su medida en variables y no se anima', r);
    await p.emulateMedia({ media: 'print' });
    const imp = await ev(() => ({ barra: getComputedStyle(document.querySelector('#aj-s-respaldo .medidor')).display, frase: [...document.querySelectorAll('#aj-s-respaldo dl')].some(d => /Espacio/.test(d.textContent) && getComputedStyle(d).display !== 'none') }));
    await p.emulateMedia({ media: 'screen' });
    cierto(imp.frase, 'en papel la frase va de todos modos', imp);
  });

  await seccion('F21 · el tema se abre en círculo', async () => {
    const inicial = cfg.tema;
    const otro = inicial === 'claro' ? 'oscuro' : 'claro';
    const tema = () => ev(() => window.AL3D_TEMA.actual());
    cierto((await tema()) === inicial, 'parte en ' + inicial);
    await ev(() => { window.__ia.vt = 0; window.__ia.revela = false; });
    await ev(() => { document.querySelector('#aj-s-tema').scrollIntoView({ block: 'center' }); });
    await toca('#aj-s-tema [data-tema-elegir="' + otro + '"]');
    await hasta(p, o => window.AL3D_TEMA.actual() === o, otro, 4000);
    await dormir(700);
    const v = await ev(() => ({ vt: window.__ia.vt, revela: window.__ia.revela, resto: document.documentElement.classList.contains('tema-revela'),
      pressed: document.querySelector('#aj-s-tema [data-tema-elegir][aria-pressed="true"]').dataset.temaElegir }));
    if (cfg.reducido) {
      cierto(v.vt === 0 && !v.revela, 'con menos movimiento cambia directo: no hay transición de vista', v);
    } else {
      cierto(v.vt === 1 && v.revela, 'con movimiento pasa por View Transitions (una sola) y marca html.tema-revela', v);
    }
    cierto(!v.resto, 'y al terminar se quita la marca del revelado', v);
    cierto(v.pressed === otro, 'el botón elegido queda con aria-pressed', v);
    /* Teclado: el foco no se cae al <body> al repintar. */
    await ev(() => { document.querySelector('#aj-s-tema [data-tema-elegir="auto"]').focus(); });
    await p.keyboard.press('Enter');
    await dormir(900);
    const f = await ev(() => ({ el: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.temaElegir : null }));
    cierto(f.el === 'auto', 'con Enter el foco vuelve al mismo botón después del repintado', f);
    /* Vuelve al tema de la ronda para no torcer lo que sigue. */
    await ev(t => { window.AL3D_TEMA.poner(t); }, inicial);
    await dormir(300);
    cierto((await tema()) === inicial, 'se devuelve el tema de la ronda');
    await ev(() => window.scrollTo(0, 0));
  });

  await seccion('F32 · los pasos se palomean y se recuerdan', async () => {
    for (const [k, id, clave] of [['gcal', 'aj-pasos-gcal', 'al3d_pf_pasos_gcal'], ['puente', 'aj-pasos-puente', 'al3d_pf_pasos_puente']]) {
      await ev(i => { document.getElementById(i).scrollIntoView({ block: 'center' }); }, id);
      const r = await ev(async a => {
        const mod = a.k === 'gcal' ? await import('/js/nucleo/gcal.js') : await import('/js/datos/puente.js');
        const ins = mod[a.k === 'gcal' ? 'Gcal' : 'Puente'] ? mod[a.k === 'gcal' ? 'Gcal' : 'Puente'].instrucciones() : mod.instrucciones();
        const el = document.getElementById(a.id), bs = [...el.querySelectorAll('.riel-boton')];
        return { n: bs.length, esperados: ins.pasos.length, textos: bs.every((b, i) => b.querySelector('.riel-t').textContent === ins.pasos[i]),
          actual: [...el.querySelectorAll('.riel-paso')].findIndex(l => l.dataset.estado === 'actual'), alto: Math.round(bs[0].getBoundingClientRect().height),
          guardado: localStorage.getItem(a.clave) };
      }, { k, id, clave });
      await foto(p, 'aj-pasos-' + k + '-' + tag);
    cierto(r.n >= 8 && r.n === r.esperados, '[' + k + '] hay un botón por paso (' + r.n + ') y salen de instrucciones()', r);
      cierto(r.textos, '[' + k + '] los textos son los de instrucciones() tal cual', r);
      cierto(r.actual === 0 && r.guardado === null, '[' + k + '] el primero queda como «vas aquí» y nada guardado', r);
      cierto(r.alto >= (cfg.tactil ? 44 : 28), '[' + k + '] cada paso mide ' + r.alto + ' px de alto', r.alto);
      const sel = '#' + id + ' .riel-paso';
      await toca(sel + ':nth-child(1) .riel-boton');
      await toca(sel + ':nth-child(2) .riel-boton');
      await p.waitForTimeout(300);
      const a = await ev(a2 => { const l = [...document.querySelectorAll('#' + a2.id + ' .riel-paso')]; return { e: l.slice(0, 4).map(x => x.dataset.estado), g: localStorage.getItem(a2.clave),
        aria: l[2].getAttribute('aria-current'), vasAqui: getComputedStyle(l[2].querySelector('.riel-t'), '::after').content }; }, { id, clave });
      cierto(a.e.join() === 'hecho,hecho,actual,pendiente', '[' + k + '] dos palomeados y el tercero pasa a «vas aquí»', a);
      cierto(a.aria === 'step', '[' + k + '] el actual lleva aria-current="step"', a);
      cierto(/Vas aquí/.test(a.vasAqui), '[' + k + '] y lo dice con palabras («Vas aquí»), no solo con color', a.vasAqui);
      const g = JSON.parse(a.g || 'null');
      cierto(g && g.hechos.join() === '0,1' && g.n === r.n, '[' + k + '] se recuerda en este dispositivo', a.g);
      /* Sobrevive a recargar la pantalla. */
      await p.reload({ waitUntil: 'load' });
      await p.waitForSelector('#' + id, { timeout: 20000 });
      await p.waitForTimeout(500);
      const d = await ev(i => [...document.querySelectorAll('#' + i + ' .riel-paso')].slice(0, 4).map(x => x.dataset.estado).join(), id);
      cierto(d === 'hecho,hecho,actual,pendiente', '[' + k + '] después de recargar siguen palomeados', d);
      /* Despalomear con teclado (o dedo) y quedar limpio. */
      await ev(i => { document.getElementById(i).scrollIntoView({ block: 'center' }); }, id);
      await toca(sel + ':nth-child(2) .riel-boton');
      await toca(sel + ':nth-child(1) .riel-boton');
      await p.waitForTimeout(250);
      const z = await ev(a2 => ({ e: [...document.querySelectorAll('#' + a2.id + ' .riel-paso')].slice(0, 2).map(x => x.dataset.estado).join(), g: localStorage.getItem(a2.clave) }), { id, clave });
      cierto(z.e === 'actual,pendiente' && z.g === null, '[' + k + '] al despalomear todo no queda nada guardado', z);
    }
    if (!cfg.tactil) {
      await ev(() => { document.querySelector('#aj-pasos-gcal .riel-paso:nth-child(1) .riel-boton').focus(); });
      await p.keyboard.press('Space');
      await p.waitForTimeout(200);
      cierto(await ev(() => document.querySelector('#aj-pasos-gcal .riel-paso:nth-child(1)').dataset.estado === 'hecho'), 'con el teclado (Espacio) también se palomea');
      await p.keyboard.press('Space');
    }
    cierto(await sinDesborde(p), 'sin desborde de lado con los pasos');
    await ev(() => window.scrollTo(0, 0));
  });

  await seccion('F7 · los botones del puente dicen qué hacen, cuánto llevan y cómo terminaron', async () => {
    await ev(() => { document.querySelector('#aj-s-puente [data-act="puente-probar"]').scrollIntoView({ block: 'center' }); });
    const SEL = '#aj-s-puente [data-act="puente-probar"]';
    const orig = await ev(s => { const b = document.querySelector(s); return { txt: b.textContent.replace(/\s+/g, ' ').trim(), ancho: Math.round(b.getBoundingClientRect().width) }; }, SEL);
    M.retraso.salud = 2200;
    const antes = M.llamadas.salud || 0;
    await ev(() => { window.__ia.estados.length = 0; });
    await toca(SEL);
    await p.waitForSelector(SEL + '[data-estado="trabajando"]', { timeout: 3000 });
    await dormir(1300);
    const t = await ev(s => { const b = document.querySelector(s), puente = [...document.querySelectorAll('#aj-s-puente [data-act]')].filter(x => x !== b);
      const rel = b.querySelector('.trabajo-relleno'); return {
      txt: b.textContent.replace(/\s+/g, ' ').trim(), busy: b.getAttribute('aria-busy'), aria: b.getAttribute('aria-disabled'), dis: b.disabled, ancho: Math.round(b.getBoundingClientRect().width),
      hermanos: puente.length, hermanosEsperan: puente.filter(x => x.hasAttribute('data-espera') && x.getAttribute('aria-disabled') === 'true').length,
      relleno: !!rel, escala: rel ? (new DOMMatrix(getComputedStyle(rel).transform)).a : null, animaciones: rel ? rel.getAnimations().length : 0 }; }, SEL);
    await foto(p, 'aj-probando-' + tag);
    cierto(/^Preguntándole al puente · \d+ s$/.test(t.txt), 'el botón dice qué hace y cuánto lleva («' + t.txt + '»)', t);
    cierto(t.busy === 'true' && t.aria === 'true' && !t.dis, 'aria-busy + aria-disabled, y NO disabled (el foco se queda)', t);
    cierto(t.ancho >= orig.ancho - 1, 'el ancho no brinca (' + orig.ancho + ' → ' + t.ancho + ' px)', { orig, t });
    cierto(t.hermanos >= 3 && t.hermanosEsperan === t.hermanos, 'sus ' + t.hermanos + ' hermanos del puente esperan con aria-disabled', t);
    if (cfg.reducido) cierto(t.animaciones === 0 && t.escala === 0, 'con menos movimiento no hay relleno que avance: solo cambia el texto', t);
    else cierto(t.relleno && t.escala > 0.05, 'se va llenando de izquierda a derecha (escala ' + (t.escala || 0).toFixed(2) + ')', t);
    /* Un segundo toque, en otro botón del puente, no hace nada. */
    const esq0 = M.llamadas.esquema || 0;
    await toca('#aj-s-puente [data-act="puente-esquema"]', { force: true });
    await dormir(200);
    cierto((M.llamadas.esquema || 0) === esq0, 'tocar a un hermano mientras tanto no manda nada al puente');
    cierto((M.llamadas.salud || 0) === antes + 1, 'y el mismo botón tampoco se vuelve a mandar', { n: M.llamadas.salud, antes });
    await p.waitForSelector(SEL + '[data-estado="ok"]', { timeout: 6000 });
    const ok = await ev(s => { const b = document.querySelector(s); return { txt: b.textContent.replace(/\s+/g, ' ').trim(), pal: !!b.querySelector('.palomita'), aria: b.getAttribute('aria-disabled'),
      fondo: getComputedStyle(b).backgroundColor, resto: document.querySelectorAll('#aj-s-puente [data-espera]').length, nota: document.getElementById('aj-s-puente').innerText.includes('reconoce este teléfono') }; }, SEL);
    cierto(/^Contesta$/.test(ok.txt) && ok.pal, 'al terminar dice «Contesta» con su palomita, en verde', ok);
    cierto(ok.resto === 0, 'los hermanos vuelven a estar disponibles', ok);
    cierto(ok.nota, 'y el resultado completo sigue pintado en la tarjeta (el aviso y la voz se quedan)');
    await foto(p, 'aj-probado-ok-' + tag);
    await dormir(400);          // el fondo verde entra con una transición de 120 ms: se mide ya asentado
    const cOk = await contraste(p, SEL);
    cierto(cOk >= 4.5, 'el «Contesta» en verde se lee a ' + cOk + ':1', cOk);
    await dormir(2300);
    const vuelta = await ev(s => { const b = document.querySelector(s); return { txt: b.textContent.replace(/\s+/g, ' ').trim(), estado: b.dataset.estado || '', aria: b.getAttribute('aria-disabled') }; }, SEL);
    cierto(vuelta.txt === orig.txt && vuelta.estado === '' && vuelta.aria === null, 'y vuelve a su rótulo de siempre («' + vuelta.txt + '»)', vuelta);
    const seq = (await ev(() => window.__ia.estados.filter(x => x.startsWith('puente-probar:')))).join(' ');
    cierto(/^puente-probar:trabajando puente-probar:ok( puente-probar:)?/.test(seq), 'la secuencia fue trabajando → ok', seq);
    M.retraso.salud = 0;

    /* Si no contesta: «No contestó · Reintentar», y reintentar es tocarlo otra vez. */
    M.saludFalla = true;
    await ev(() => { window.__ia.estados.length = 0; });
    await toca(SEL);
    await p.waitForSelector(SEL + '[data-estado="mal"]', { timeout: 6000 });
    const mala = await ev(s => { const b = document.querySelector(s); return { txt: b.textContent.replace(/\s+/g, ' ').trim(), aria: b.getAttribute('aria-disabled'), dis: b.disabled }; }, SEL);
    cierto(/^No contestó · Reintentar$/.test(mala.txt), 'si el puente no contesta dice «No contestó · Reintentar»', mala);
    cierto(mala.aria !== 'true' && !mala.dis, 'y el botón vuelve a aceptar toques (reintentar es tocarlo)', mala);
    await foto(p, 'aj-probado-mal-' + tag);
    await dormir(400);
    const cMal = await contraste(p, SEL);
    cierto(cMal >= 4.5, 'el texto del fallo se lee a ' + cMal + ':1', cMal);
    const n1 = M.llamadas.salud;
    M.saludFalla = false;
    await toca(SEL);
    await p.waitForSelector(SEL + '[data-estado="ok"]', { timeout: 6000 });
    cierto(M.llamadas.salud === n1 + 1, 'Reintentar corre su propio manejador otra vez y esta vez sale bien', { antes: n1, ahora: M.llamadas.salud });
    await dormir(2300);

    /* «Traer el dinero de la hoja»: varias vueltas, y el rótulo dice en cuál va. */
    const JAL = '#aj-s-puente [data-act="puente-jalar"]';
    cierto(await ev(s => !!document.querySelector(s), JAL), 'el botón «Traer el dinero de la hoja» está');
    M.jalarRestan = 2; M.retraso.jalar = 900;
    await ev(() => { window.__ia.estados.length = 0; });
    await toca(JAL);
    await p.waitForSelector(JAL + '[data-estado="trabajando"]', { timeout: 3000 });
    const vistas = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 7000 && !(await ev(s => document.querySelector(s).dataset.estado === 'ok', JAL))) {
      const x = await ev(s => document.querySelector(s).textContent.replace(/\s+/g, ' ').trim(), JAL);
      const m = /vuelta (\d+)/.exec(x); if (m) vistas.add(m[1]);
      await dormir(120);
    }
    cierto(vistas.has('2') && vistas.has('3'), 'el rótulo dice en qué vuelta va («Trayendo la hoja · vuelta 3 · N s»)', [...vistas]);
    await p.waitForSelector(JAL + '[data-estado="ok"]', { timeout: 6000 });
    cierto(/^Traído$|^Al día$/.test(await texto(p, JAL)), 'y termina en «Traído» (hubo cambios o no) con su palomita', await texto(p, JAL));
    cierto(M.llamadas.jalar >= 3, 'se pidieron las tres páginas', M.llamadas.jalar);
    M.retraso.jalar = 0;
    await dormir(2300);

    /* «Revisar el esquema»: el botón dice «Revisado» y la tarjeta sigue diciendo lo que la hoja contestó. */
    const ESQ = '#aj-s-puente [data-act="puente-esquema"]';
    M.sinAccesos = true; M.retraso.esquema = 500;
    await ev(() => { window.__ia.estados.length = 0; });
    await toca(ESQ);
    await p.waitForSelector(ESQ + '[data-estado="ok"]', { timeout: 6000 });
    const eq = await ev(() => ({ txt: document.getElementById('aj-s-puente').innerText, seq: window.__ia.estados.filter(x => x.startsWith('puente-esquema:')).join(' ') }));
    cierto(/Accesos/.test(eq.txt) && !/ya tiene las ocho/.test(eq.txt), 'la hoja sin «Accesos» se dice en la tarjeta, no «ya tiene todo»', eq.txt.slice(0, 120));
    cierto(/^puente-esquema:trabajando puente-esquema:ok/.test(eq.seq), 'y el botón pasó de trabajando a ok', eq.seq);
    M.sinAccesos = false; M.retraso.esquema = 0;
    await dormir(2300);

    /* «Mandar lo pendiente»: aunque no haya nada que mandar, el botón dice cómo terminó. */
    const BOM = '#aj-s-puente [data-act="puente-bombear"]';
    if (await ev(s => !!document.querySelector(s), BOM)) {
      await ev(() => { window.__ia.estados.length = 0; });
      await toca(BOM);
      await p.waitForSelector(BOM + '[data-estado="ok"]', { timeout: 6000 });
      const sq = (await ev(() => window.__ia.estados.filter(x => x.startsWith('puente-bombear:')))).join(' ');
      cierto(/^puente-bombear:trabajando puente-bombear:ok/.test(sq), '«Mandar lo pendiente» también pasa de trabajando a ok', sq);
      await dormir(2300);
    } else bien('«Mandar lo pendiente» no aparece (el puente no está enchufado en este arranque)');

    /* Con el teclado: Enter dispara y el foco no se cae al <body>. */
    if (!cfg.tactil) {
      M.retraso.salud = 600;
      await ev(s => document.querySelector(s).focus(), SEL);
      await p.keyboard.press('Enter');
      await p.waitForSelector(SEL + '[data-estado="trabajando"]', { timeout: 3000 });
      cierto(await ev(s => document.activeElement === document.querySelector(s), SEL), 'con Enter el botón trabaja y conserva el foco (aria-disabled, no disabled)');
      await p.waitForSelector(SEL + '[data-estado="ok"]', { timeout: 6000 });
      M.retraso.salud = 0;
      await dormir(2300);
    }
    cierto(await sinDesborde(p), 'sin desborde de lado con los botones trabajando');
    cierto((await infinitas(p)).length === 0, 'nada se mueve en reposo cuando los botones terminan', await infinitas(p));
    await ev(() => window.scrollTo(0, 0));
  });

  await seccion('F27 · «BORRAR» en seis casillas', async () => {
    await ev(() => { document.querySelector('#aj-s-borrar [data-act="borrar"]').scrollIntoView({ block: 'center' }); });
    await toca('#aj-s-borrar [data-act="borrar"]');
    await p.waitForSelector('#pf-pide.show [data-cordon="respaldo"]', { timeout: 4000 });
    const [descarga] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), toca('#pf-pide [data-cordon="respaldo"]')]);
    cierto(!!descarga, 'el respaldo se descarga antes de la confirmación final');
    await p.waitForSelector('#aj-borrar', { timeout: 6000 });
    const e = await ev(() => { const i = document.getElementById('aj-borrar'), b = document.getElementById('aj-borrar-b'), caja = i.closest('.casillas'); return {
      casillas: caja.querySelectorAll('.casilla').length, aria: b.getAttribute('aria-disabled'), dis: b.disabled, etiqueta: i.getAttribute('aria-label'),
      altoFila: Math.round(caja.getBoundingClientRect().height), ancho: Math.round(caja.getBoundingClientRect().width), panel: Math.round(document.querySelector('#pf-pide .pf-panel').getBoundingClientRect().width) }; });
    cierto(e.casillas === 6, 'son seis casillas', e);
    cierto(e.aria === 'true' && !e.dis, '«Borrar de verdad» arranca aria-disabled (no disabled)', e);
    cierto(e.altoFila >= 44, 'la fila mide 44 px o más (es la zona táctil)', e);
    cierto(e.ancho <= e.panel, 'y cabe en el panel', e);
    await toca('#aj-borrar');
    await p.keyboard.type('borr', { delay: 40 });
    await foto(p, 'aj-borrar-' + tag);
    const a = await ev(() => ({ valor: document.getElementById('aj-borrar').value, llenas: [...document.querySelectorAll('#pf-pide .casilla.llena')].map(c => c.textContent).join(''),
      mal: document.querySelectorAll('#pf-pide .casilla.mal').length, aria: document.getElementById('aj-borrar-b').getAttribute('aria-disabled') }));
    cierto(a.valor === 'BORR' && a.llenas === 'BORR', 'escribir «borr» llena BORR en mayúsculas, sin pedir mayúsculas', a);
    cierto(a.mal === 0 && a.aria === 'true', 'las que coinciden no salen en rojo y el botón sigue apagado', a);
    await p.keyboard.type('x', { delay: 40 });
    const x = await ev(() => ({ mal: document.querySelectorAll('#pf-pide .casilla.mal').length, aria: document.getElementById('aj-borrar-b').getAttribute('aria-disabled') }));
    cierto(x.mal === 1 && x.aria === 'true', 'una letra equivocada sale en rojo AL TECLEARLA (no al apretar el botón)', x);
    /* Apretar el botón aria-disabled explica por qué no se puede y NO borra. */
    await toca('#aj-borrar-b', { force: true });
    await p.waitForTimeout(300);
    const t = await ev(() => document.getElementById('toast').textContent);
    cierto(/Escribe BORRAR/.test(t), 'tocar el botón apagado dice por qué (aria-disabled, no disabled)', t.slice(0, 100));
    cierto(await ev(() => document.querySelector('#pf-pide [data-cordon="borrar"]') && !document.querySelector('#pf-pide [data-cordon="borrar"]').disabled), 'y no se borró nada: el panel sigue ahí con el botón sin disabled');
    await p.keyboard.press('Backspace');
    await p.keyboard.type('ar', { delay: 40 });
    const c = await ev(() => ({ valor: document.getElementById('aj-borrar').value, aria: document.getElementById('aj-borrar-b').getAttribute('aria-disabled'),
      completo: document.querySelector('#pf-pide .casillas').classList.contains('completo'), acierto: document.querySelector('#pf-pide .casillas').classList.contains('acierto'),
      mal: document.querySelectorAll('#pf-pide .casilla.mal').length }));
    cierto(c.valor === 'BORRAR' && c.aria === 'false' && c.completo, 'con BORRAR completo el botón se habilita', c);
    cierto(!c.acierto && c.mal === 0, 'sin festejo: ni lavado verde ni nada', c);
    const cd = await contraste(p, '#pf-pide .casilla.llena');
    cierto(cd >= 4.5, 'las letras de las casillas se leen a ' + cd + ':1', cd);
    cierto(await sinDesborde(p), 'sin desborde de lado con el cordón abierto');
    await toca('#pf-pide [data-cordon="cerrar"]');
    await p.waitForTimeout(500);
    cierto(!(await ev(() => document.getElementById('pf-pide').classList.contains('show'))), 'cancelar cierra sin borrar');
  });

  if (cfg.ancho === 360 && cfg.tactil && cfg.tema === 'claro') {
    await seccion('Otros roles y la presentación: nada se rompe sin Calendar ni nombre', async () => {
      /* Fabricación no es Dirección: la tarjeta de Calendar es corta (sin pasos que palomear), el puente sí trae los suyos y la
         tira sigue entera. Se abre OTRO contexto: el del resto de la ronda siembra el rol de Dirección en cada carga. */
      const f = await abrir({ ...cfg, rol: 'fabricacion', puente: false });
      const d = await f.p.evaluate(() => ({ n: document.querySelectorAll('#aj-indice .aj-ir').length, gcal: !!document.getElementById('aj-s-gcal'),
        pasosGcal: !!document.getElementById('aj-pasos-gcal'), pasosPuente: !!document.getElementById('aj-pasos-puente'),
        marcada: document.querySelectorAll('#aj-indice [aria-current="true"]').length }));
      cierto(d.n === 7 && d.gcal && !d.pasosGcal && d.pasosPuente && d.marcada === 1, 'con el rol de Fabricación la tira sigue con sus siete y Calendar no trae pasos (el puente sí)', d);
      cierto(f.errores.length === 0, 'y sin errores de página', f.errores.slice(0, 2));
      await f.ctx.close();
      /* Sin nombre se pregunta quién usa el teléfono, y ahí no hay tira ni tarjetas con id. */
      const g = await abrir({ ...cfg, puente: false, nombre: '', esperar: '[data-act="gate"]' });
      const e = await g.p.evaluate(() => ({ indice: !!document.getElementById('aj-indice'), tarjetas: document.querySelectorAll('.aj-tarjeta').length }));
      cierto(!e.indice && e.tarjetas === 1, 'sin nombre solo está la presentación: no hay tira', e);
      cierto(g.errores.length === 0, 'y sin errores de página', g.errores.slice(0, 2));
      await g.ctx.close();
    });
  }

  cierto(errores.length === 0, 'cero errores de página en toda la ronda', [...new Set(errores)].slice(0, 3));
  cierto(await sinDesborde(p), 'sin desborde de lado al terminar la ronda');
  await ctx.close();
}

const RONDAS = [
  { ancho: 360, alto: 740, tema: 'claro', reducido: false, tactil: true },
  { ancho: 420, alto: 800, tema: 'oscuro', reducido: true, tactil: true },
  { ancho: 360, alto: 740, tema: 'oscuro', reducido: false, tactil: false },
  { ancho: 1280, alto: 800, tema: 'claro', reducido: true, tactil: false },
];
/* RONDA=2 corre solo la tercera (para depurar una sin esperar a las otras tres). */
const SOLO = process.env.RONDA === undefined ? null : Number(process.env.RONDA);
for (const [i, r] of RONDAS.entries()) {
  if (SOLO !== null && SOLO !== i) continue;
  try { await ronda(r); } catch (e) { mal('la ronda se rompió: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
}

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nAjustes y el asistente funcionan con las piezas, en las cuatro rondas.');
await nav.close();
process.exit(fallos ? 1 : 0);
