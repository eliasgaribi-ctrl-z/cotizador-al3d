/* LAS PIEZAS DE AVISOS Y BOTONES, TOCADAS COMO LAS TOCA LA GENTE.
 *
 * js/piezas.js, sección 1, la usan unas veinte pantallas: el aviso con mecha y pila (12), el
 * botón que dice que está trabajando (14), el «Deshacer» en el mismo botón (15), el rótulo que
 * cambia sin brincar (23), mantener presionado para confirmar (5), la palomita (6), el glifo de
 * estado y el sello (24) y copiar con confirmación en el botón. Una pieza frágil se multiplica
 * por veinte, y lo que se rompe en estas no da error: un aviso que tapa a otro, una mecha que
 * sigue corriendo con el dedo encima, un «Deshacer» que se queda sin reloj, un botón que se
 * deja tocar dos veces mientras sella. Así que aquí se tocan con ratón, con el dedo (toques
 * reales por el protocolo de Chrome) y con el teclado, a 360 y 420 px, con y sin menos
 * movimiento, en claro y en oscuro, sobre la vitrina (piezas-avisos.html) que carga las hojas y
 * el tema de verdad. En cada combinación: sin errores de página, sin desborde de lado y sin
 * animaciones infinitas en reposo.
 *
 * Y la falla 2 del brief, en las tres apps de verdad: en el cotizador, el error del notario
 * («el total no es el que selló la hoja») seguido del «✓ … autorizó», con el mismo toast() que
 * usa notario.js, tiene que dejar los DOS avisos a la vista; lo mismo con el toast() de la
 * plataforma, y el del anidador tiene que ser la misma pieza.
 *
 * Uso:  PUERTO=8814 node pruebas/navegador/piezas-avisos.mjs   (con un servidor en la raíz)
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const VITRINA = B + '/pruebas/navegador/piezas-avisos.html';
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const CAPTURAS = process.env.CAPTURAS || '';

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, m, detalle) => c ? bien(m) : mal(m + (detalle !== undefined ? ' — ' + (typeof detalle === 'string' ? detalle : JSON.stringify(detalle)) : ''));
const espera = ms => new Promise(r => setTimeout(r, ms));

/* ----- Contraste, calculado con los colores que la página de verdad resolvió ----- */
const rgba = s => { const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/.exec(s || ''); if (!m) return null; let a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]; return [+m[1], +m[2], +m[3], a]; };
const todos = s => [...String(s || '').matchAll(/rgba?\([^)]*\)/g)].map(x => rgba(x[0])).filter(Boolean);
const sobre = (c, f) => [0, 1, 2].map(i => c[i] * c[3] + f[i] * (1 - c[3])).concat(1);
const lum = c => { const l = c.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * l[0] + .7152 * l[1] + .0722 * l[2]; };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

async function abrir({ ancho, reducido, tema, tacto }) {
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: 780 }, locale: 'es-MX', timezoneId: 'America/Mexico_City',
    serviceWorkers: 'block', reducedMotion: reducido ? 'reduce' : 'no-preference',
    hasTouch: !!tacto, isMobile: !!tacto, permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  /* Lo que de verdad hay DEBAJO de un elemento: el primer ancestro con un fondo opaco. Un botón
     fantasma no tiene fondo propio —de noche es transparente— y medir su contraste contra
     `backgroundColor: rgba(0,0,0,0)` es medirlo contra negro, que no es lo que se ve. */
  await ctx.addInitScript(() => {
    window.fondoOpaco = el => {
      for (let x = el; x && x.nodeType === 1; x = x.parentElement) {
        const f = getComputedStyle(x).backgroundColor;
        const m = /rgba?\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+(?:\s*[,/]\s*([\d.]+))?/.exec(f);
        if (m && (m[1] == null || +m[1] > .95)) return f;
      }
      return 'rgb(255, 255, 255)';
    };
  });
  const p = await ctx.newPage();
  const errs = [], fallidas = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) fallidas.push(r.status() + ' ' + r.url()); });
  await p.goto(VITRINA, { waitUntil: 'load' });
  await p.waitForTimeout(250);
  return { ctx, p, errs, fallidas };
}
const alCentro = (p, sel) => p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
const centro = async (p, sel) => { await alCentro(p, sel); const r = await p.locator(sel).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r }; };
const limpiar = p => p.evaluate(() => Piezas.aviso.limpiar());
const vivos = p => p.evaluate(() => Piezas.aviso.vivos());

/* Toques reales: Input.dispatchTouchEvent es lo que manda un dedo en Chrome, con sus
   pointerdown/pointermove/pointerup de tipo touch. */
async function dedo(p) {
  const cdp = await p.context().newCDPSession(p);
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  return {
    async sostener(x, y, ms) { await t('touchStart', [{ x, y }]); await espera(ms); await t('touchEnd', []); },
    async bajar(x, y) { await t('touchStart', [{ x, y }]); },
    async soltar() { await t('touchEnd', []); },
    async deslizar(x, y, dy, pasos = 8) {
      await t('touchStart', [{ x, y }]);
      for (let i = 1; i <= pasos; i++) { await t('touchMove', [{ x, y: y + dy * i / pasos }]); await espera(16); }
      await t('touchEnd', []);
    },
  };
}

async function reposo(p, etiqueta, ancho) {
  await limpiar(p);
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => ({
    infinitas: document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations === Infinity)
      .map(a => (a.effect.target && (a.effect.target.className.baseVal ?? a.effect.target.className)) || '?'),
    ancho: document.scrollingElement.scrollWidth, vista: innerWidth,
  }));
  cierto(r.infinitas.length === 0, etiqueta + ': ninguna animación infinita en reposo', r.infinitas);
  cierto(r.ancho <= r.vista, etiqueta + ': nada se sale de lado a ' + ancho + ' px', r);
}

/* ======================================================================
   Ratón y teclado, en cada combinación
   ====================================================================== */
async function conRaton(ancho, reducido, tema, completo) {
  const etiqueta = ancho + ' px · ' + (reducido ? 'menos movimiento' : 'con movimiento') + ' · ' + tema;
  console.log('\n── ' + etiqueta + ' · ratón y teclado ──');
  const { ctx, p, errs, fallidas } = await abrir({ ancho, reducido, tema });
  cierto(await p.evaluate(t => document.documentElement.dataset.tema === t, tema), 'el tema es ' + tema);
  const api = await p.evaluate(() => ['voz', 'reloj', 'mecha', 'aviso', 'cambiarRotulo', 'rotuloTemporal', 'rotuloHTML', 'sacudir', 'palomitaHTML',
    'palomita', 'dibujar', 'avance', 'curvaAvance', 'estadoBoton', 'trabajando', 'deshacerEnBoton', 'mantener', 'marcaEstadoHTML', 'marcaEstado',
    'circulo', 'letraCircular', 'selloHTML', 'sello', 'botonDelEvento', 'confirmarEnBoton', 'copiar'].filter(n => typeof Piezas[n] !== 'function'));
  cierto(api.length === 0, 'window.Piezas trae las piezas de la sección 1', api);

  /* ---------- 12 · el aviso ---------- */
  await p.click('#v-notario');
  await p.waitForTimeout(320);
  let v = await p.evaluate(() => [...document.querySelectorAll('#toast .toast-uno')].map(e => {
    const r = e.getBoundingClientRect(), m = e.querySelector('.mecha');
    return { txt: e.querySelector('.toast-msg').textContent, alto: r.height, op: +getComputedStyle(e).opacity, err: e.classList.contains('err'),
      mecha: m ? m.getBoundingClientRect().height : 0, anims: m ? m.getAnimations().map(a => [a.playState, a.effect.getTiming().duration]) : [] };
  }));
  cierto(v.length === 2 && /no es el que selló/.test(v[0].txt) && /^✓/.test(v[1].txt) && v.every(x => x.alto > 20 && x.op > .98),
    'la falla 2: el error del notario y el ✓ siguiente quedan LOS DOS a la vista', v.map(x => x.txt.slice(0, 30)));
  cierto(v.every(x => Math.abs(x.mecha - 2) < .6), 'cada aviso lleva su mecha de 2 px', v.map(x => x.mecha));
  if (reducido) cierto(v.every(x => x.anims.length === 0), 'con menos movimiento la mecha se queda quieta', v.map(x => x.anims));
  else cierto(v[0].anims[0] && v[0].anims[0][1] === 12000 && v[1].anims[0] && v[1].anims[0][1] === 6000,
    'la mecha dura exactamente lo que dura cada aviso (12 s y 6 s)', v.map(x => x.anims));
  /* El contraste del texto de cada aviso contra su fondo, en este tema. */
  const cs = await p.evaluate(() => {
    const out = [];
    for (const tipo of ['', 'ok', 'err']) {
      Piezas.aviso.limpiar();
      Piezas.aviso('Prueba de contraste ' + tipo, { tipo, voz: false });
      const e = document.querySelector('#toast .toast-uno'), s = getComputedStyle(e);
      out.push({ tipo, fondo: s.backgroundColor, letra: s.color });
    }
    return out;
  });
  const bajos = cs.map(c => ({ tipo: c.tipo || 'neutro', r: contraste(rgba(c.letra), rgba(c.fondo)) })).filter(c => !(c.r >= 4.5));
  cierto(bajos.length === 0, 'el texto de los avisos neutro, ok y err mide 4.5:1 o más', bajos);

  /* La pila: quién cede y quién espera. */
  const pila = await p.evaluate(async () => {
    const A = Piezas.aviso, out = {};
    const f1 = () => { window.__f1 = (window.__f1 || 0) + 1; };
    A.limpiar();
    A('Uno informativo', { voz: false });
    const nodo = document.querySelector('#toast .toast-uno');
    A('Dos informativo', { voz: false });
    out.infoReemplaza = A.vivos().map(x => x.msg);
    out.mismoNodo = document.querySelector('#toast .toast-uno') === nodo;
    A.limpiar();
    A('Partida 1 eliminada', { accion: { label: 'Deshacer', fn: f1 }, voz: false });
    A('Guardada', { tipo: 'ok', voz: false });
    out.infoNoPisaAccion = A.vivos().map(x => x.msg);
    A('Partida 2 eliminada', { accion: { label: 'Deshacer', fn: f1 }, voz: false });
    out.mismaFuncion = A.vivos().map(x => x.msg);
    A('No se pudo guardar', { tipo: 'err', voz: false });
    out.errTomaLugar = A.vivos().map(x => x.msg);
    const h = A('Otro error', { tipo: 'err', voz: false });
    out.esperaVivos = A.vivos().length;
    out.esperaVivo = h.vivo;
    document.querySelector('#toast .toast-uno .toast-act').click();
    out.fnCorrio = window.__f1 === 1;
    await new Promise(r => setTimeout(r, 380));
    out.entroElQueEsperaba = A.vivos().map(x => x.msg);
    A.limpiar();
    A('Se repite', { dur: 3000, voz: false });
    await new Promise(r => setTimeout(r, 900));
    A('Se repite', { dur: 3000, voz: false });
    out.repiteResta = A.vivos()[0].resta;
    A.limpiar();
    A('Con botón y 2 s', { dur: 2000, accion: { label: 'Ver', fn: () => {} }, voz: false });
    out.minimo8 = A.vivos()[0].resta;
    A.limpiar();
    /* El mango es del aviso: el de «Mandando…» muere cuando otro toma su lugar. */
    const mandando = A('Mandando la venta a la hoja…', { dur: 15000, voz: false });
    const registrada = A('Venta registrada en la hoja', { dur: 5600, accion: { label: 'Abrir plataforma', fn: () => {} }, voz: false });
    mandando.cerrar();
    out.mango = { viejo: mandando.vivo, nuevo: registrada.vivo, quedan: A.vivos().map(x => x.msg) };
    A.limpiar();
    return out;
  });
  cierto(pila.infoReemplaza.join() === 'Dos informativo' && pila.mismoNodo, 'un informativo reemplaza al informativo, en su lugar y sin volver a entrar', pila);
  cierto(pila.infoNoPisaAccion.join('|') === 'Partida 1 eliminada|Guardada', 'un informativo no pisa al que trae «Deshacer»: se apilan', pila.infoNoPisaAccion);
  cierto(pila.mismaFuncion.join('|') === 'Partida 2 eliminada|Guardada', 'dos «Deshacer» con la misma función no conviven: el nuevo toma el lugar del viejo', pila.mismaFuncion);
  cierto(pila.errTomaLugar.join('|') === 'Partida 2 eliminada|No se pudo guardar', 'un error toma el lugar del informativo y deja el «Deshacer»', pila.errTomaLugar);
  cierto(pila.esperaVivos === 2 && pila.esperaVivo, 'con dos que no se pisan, el tercero espera (nunca más de dos a la vista)');
  cierto(pila.fnCorrio && pila.entroElQueEsperaba.join('|') === 'No se pudo guardar|Otro error', 'al tocar «Deshacer» corre su función, se va, y entra el que esperaba', pila.entroElQueEsperaba);
  cierto(pila.repiteResta < 2300, 'un aviso INFORMATIVO que se repite tal cual no reinicia su tiempo', pila.repiteResta);
  /* La otra mitad de la regla: lo que se repite y ES un acto nuevo —el reintento que volvió a
     fallar, el borrado de ahora— sí rearma su reloj. Quitarlo con el reloj del primero era
     esconder el fallo justo cuando alguien lo estaba buscando, y dejar un «Deshacer» con dos
     segundos de ventana para algo que se acaba de hacer. */
  const rearma = await p.evaluate(async () => {
    const A = Piezas.aviso, out = {};
    for (const [k, o] of [['err', { tipo: 'err', dur: 4000, voz: false }], ['accion', { dur: 9000, accion: { label: 'Deshacer', fn: () => {} }, voz: false }]]) {
      A.limpiar();
      A('No contestó', o);
      await new Promise(r => setTimeout(r, 900));
      const antes = A.vivos()[0].resta;
      A('No contestó', o);
      out[k] = { antes: Math.round(antes), despues: Math.round(A.vivos()[0].resta), nodos: document.querySelectorAll('#toast .toast-uno').length };
    }
    A.limpiar();
    return out;
  });
  cierto(rearma.err.despues > rearma.err.antes + 500 && rearma.err.nodos === 1,
    'un ERROR repetido rearma su reloj sin volver a entrar: el reintento que falló otra vez no se va con el tiempo del primero', rearma.err);
  cierto(rearma.accion.despues > rearma.accion.antes + 500 && rearma.accion.nodos === 1,
    '  y uno con botón también: la ventana de «Deshacer» empieza ahora', rearma.accion);
  cierto(pila.minimo8 > 7000, 'con botón dura 8 s como mínimo', pila.minimo8);
  cierto(!pila.mango.viejo && pila.mango.nuevo && pila.mango.quedan.join() === 'Venta registrada en la hoja',
    'el mango de «Mandando…» muere al ceder su lugar: cerrarlo ya no se lleva «Abrir plataforma»', pila.mango);

  /* La región que habla. */
  const voz = await p.evaluate(async () => {
    Piezas.aviso('Hola desde la pila');
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
    const s = document.getElementById('vozStatus').textContent;
    Piezas.aviso('Un error que se oye', { tipo: 'err' });
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
    const a = document.getElementById('vozAlert').textContent;
    Piezas.aviso.limpiar();
    return { s, a };
  });
  cierto(voz.s === 'Hola desde la pila' && voz.a === 'Un error que se oye', 'cada aviso se dice en la región que habla (los errores, en la asertiva)', voz);

  /* Al ancho del dock y sin salirse. */
  const geo = await p.evaluate(() => {
    Piezas.aviso('Uno a lo ancho del dock para medir la pila completa en el teléfono', { voz: false });
    const t = document.getElementById('toast').getBoundingClientRect(), u = document.querySelector('#toast .toast-uno').getBoundingClientRect();
    Piezas.aviso.limpiar();
    /* Los márgenes como los resolvió la hoja, no restando del ancho de la ventana: la vitrina es
       más alta que la ventana y en Chromium de escritorio la barra de desplazamiento se come 6 px
       del bloque de los fijos que un teléfono no tiene. */
    const s = getComputedStyle(document.getElementById('toast'));
    return { izq: parseFloat(s.left), der: parseFloat(s.right), abajo: innerHeight - t.bottom, ancho: t.width, uno: u.width };
  });
  const margen = ancho <= 385 ? 6 : 10;
  cierto(Math.abs(geo.izq - margen) < 1 && Math.abs(geo.der - margen) < 1 && Math.abs(geo.uno - geo.ancho) < 1 && Math.abs(geo.abajo - 86) < 1.5,
    'en el teléfono la pila va al ancho del dock (' + margen + ' px de cada lado) y 86 px arriba del borde', geo);

  /* Pausas: cursor, foco y la app en segundo plano. */
  await p.click('#v-deshacer');
  await p.waitForTimeout(300);
  const uno = await centro(p, '#toast .toast-msg');
  await p.mouse.move(uno.x, uno.y);
  const r1 = (await vivos(p))[0].resta; await p.waitForTimeout(600); const r2 = (await vivos(p))[0].resta;
  const estadoMecha = await p.evaluate(() => { const a = document.querySelector('#toast .mecha').getAnimations()[0]; return a ? a.playState : 'sin animación'; });
  cierto(Math.abs(r1 - r2) < 40 && (reducido || estadoMecha === 'paused'), 'con el cursor encima la mecha se congela', { r1, r2, estadoMecha });
  await p.mouse.move(2, 2);
  await p.waitForTimeout(500);
  const r3 = (await vivos(p))[0].resta;
  cierto(r3 < r2 - 250, 'al quitar el cursor sigue corriendo', { r2, r3 });
  await p.focus('#toast .toast-act');
  const f1 = (await vivos(p))[0].resta; await p.waitForTimeout(500); const f2 = (await vivos(p))[0].resta;
  cierto(Math.abs(f1 - f2) < 40, 'con el foco en «Deshacer» se congela: quien llega con el tabulador ya no lo pierde', { f1, f2 });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(250);
  cierto((await vivos(p)).length === 0, 'Escape con el foco en el aviso lo quita');
  /* Y el foco vuelve a donde estaba. El aviso vive al final del documento: quien llegó a
     «Deshacer» con el tabulador y lo usó se quedaba en el <body>, o sea a toda la página de
     distancia de lo que estaba haciendo. Se prueba por las dos salidas: el botón y Escape. */
  for (const [salida, hacer] of [['tocando «Deshacer»', async () => p.keyboard.press('Enter')], ['con Escape', async () => p.keyboard.press('Escape')]]) {
    await limpiar(p);
    await p.click('#v-deshacer');          // el clic deja el foco en ese botón: de ahí se viene
    await p.waitForTimeout(250);
    await p.evaluate(() => document.querySelector('#toast .toast-act').focus());
    await hacer();
    await p.waitForTimeout(300);
    const vuelve = await p.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
    cierto(vuelve === 'v-deshacer', 'al irse el aviso ' + salida + ' el foco vuelve al botón de donde salió, no al <body>', vuelve);
    await limpiar(p);
  }
  await p.click('#v-deshacer');
  await p.waitForTimeout(200);
  await p.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const o1 = (await vivos(p))[0].resta; await p.waitForTimeout(500); const o2 = (await vivos(p))[0].resta;
  await p.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(400);
  const o3 = (await vivos(p))[0].resta;
  cierto(Math.abs(o1 - o2) < 40 && o3 < o2, 'con la app en segundo plano se congela, y al volver retoma lo que faltaba', { o1, o2, o3 });
  /* Deslizar hacia abajo lo quita. */
  const d0 = await centro(p, '#toast .toast-msg');
  await p.mouse.move(d0.x, d0.y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(d0.x, d0.y + i * 9);
  await p.mouse.up();
  await p.waitForTimeout(300);
  cierto((await vivos(p)).length === 0 && await p.locator('#toast .toast-uno').count() === 0, 'arrastrado 72 px hacia abajo con el ratón, se va');
  await p.click('#v-deshacer');
  await p.waitForTimeout(250);
  const s0 = await centro(p, '#toast .toast-msg');
  await p.mouse.move(s0.x, s0.y); await p.mouse.down();
  /* Despacio: 20 px en 400 ms es un arrastre, no un deslizón (el umbral es 0,11 px/ms). */
  for (let i = 1; i <= 5; i++) { await p.mouse.move(s0.x, s0.y + i * 4); await p.waitForTimeout(80); }
  await p.mouse.up();
  await p.waitForTimeout(300);
  cierto((await vivos(p)).length === 1 && await p.evaluate(() => document.querySelector('#toast .toast-uno').style.transform === ''), 'un arrastre corto regresa a su lugar');
  await p.click('#toast .toast-act');
  await p.waitForTimeout(300);
  cierto((await vivos(p)).map(x => x.msg).join() === 'Partida restaurada', '«Deshacer» con el ratón corre su función: «Partida restaurada»');
  await limpiar(p);
  /* El arrastre que se queda a medias. Una pantalla de antes vacía #toast con innerHTML: el
     aviso que el dedo llevaba no recibe nunca su pointerup, así que su razón de pausa se queda
     puesta y el aviso SIGUIENTE nace congelado y no se va nunca. */
  {
    const a0 = await p.evaluate(() => { Piezas.aviso('Se está arrastrando', { dur: 3000, voz: false });
      return document.querySelector('#toast .toast-uno').getBoundingClientRect(); });
    await p.mouse.move(a0.x + a0.width / 2, a0.y + a0.height / 2);
    await p.mouse.down();
    await p.mouse.move(a0.x + a0.width / 2, a0.y + a0.height / 2 + 20);
    await p.evaluate(() => { document.getElementById('toast').innerHTML = ''; });
    await p.mouse.up();
    await p.mouse.move(2, 2);          // el cursor fuera: lo que se prueba es el arrastre, no el hover
    await p.waitForTimeout(80);
    await p.evaluate(() => Piezas.aviso('El de después', { dur: 3000, voz: false }));
    const q1 = (await vivos(p))[0].resta;
    await p.waitForTimeout(700);
    const q2 = (await vivos(p))[0].resta;
    cierto(q2 < q1 - 350, 'si el aviso que se arrastraba desaparece del DOM, el siguiente NO nace congelado', { q1, q2 });
    await limpiar(p);
  }

  /* ---------- 14 · el botón que trabaja ---------- */
  await alCentro(p, '#b-sellar');
  const antes = await p.evaluate(() => document.getElementById('b-sellar').getBoundingClientRect().width);
  await p.evaluate(() => { window.__trabajo = { ms: 1500, ok: true }; });
  await p.click('#b-sellar');
  await p.waitForTimeout(150);
  const tr = await p.evaluate(() => {
    const b = document.getElementById('b-sellar'), rel = b.querySelector('.trabajo-relleno');
    const s = getComputedStyle(b);
    return { estado: b.dataset.estado, busy: b.getAttribute('aria-busy'), dis: b.getAttribute('aria-disabled'), txt: b.textContent.replace(/\s+/g, ' '), ancho: b.getBoundingClientRect().width,
      anims: rel ? rel.getAnimations().length : -1, letra: s.color, fondo: s.backgroundColor, grad: s.backgroundImage, detras: fondoOpaco(b.parentElement),
      relleno: rel ? getComputedStyle(rel).backgroundColor : '' };
  });
  cierto(tr.estado === 'trabajando' && tr.busy === 'true' && tr.dis === 'true' && /Sellando/.test(tr.txt) && /\d s/.test(tr.txt),
    'el botón dice lo que hace y cuánto lleva: «' + tr.txt.trim() + '»', tr);
  cierto(tr.ancho >= antes - .5, 'y no se encoge mientras trabaja', { antes, durante: tr.ancho });
  cierto(reducido ? tr.anims === 0 : tr.anims === 1, reducido ? 'con menos movimiento no hay relleno que avance: lo dice el reloj' : 'el relleno avanza con una animación de transform');
  {
    const letra = rgba(tr.letra), fondos = todos(tr.grad).concat(rgba(tr.fondo)).filter(c => c[3] > .5), rel = rgba(tr.relleno);
    if (!fondos.length) fondos.push(rgba(tr.detras));      // un botón sin fondo propio: manda la tarjeta
    const peor = Math.min(...fondos.map(f => Math.min(contraste(letra, f), contraste(letra, sobre(rel, f)))));
    cierto(fondos.length > 0 && isFinite(peor), 'hay un fondo de verdad contra el que medir el relleno que avanza', { fondos, detras: tr.detras });
    cierto(peor >= 4.5, 'la letra blanca mide 4.5:1 o más sobre el botón y sobre el relleno a medias (' + peor.toFixed(2) + ':1)');
  }
  /* force: Playwright da por deshabilitado lo que lleva aria-disabled y esperaría a que se
     soltara; aquí se quiere justo el toque de alguien que no esperó. */
  await p.click('#b-sellar', { force: true });
  await p.click('#b-hermano', { force: true });
  cierto(await p.evaluate(() => !(window.__cuentas.hermano > 0)), 'mientras trabaja, ni él ni su hermano aceptan otro toque');
  /* El hermano espera, y eso se dice apagando el control entero, que es donde el sistema permite
     la opacidad (§4.3). Pero su rótulo es justo lo que se lee para saber por qué no contesta: con
     el .55 de `:disabled` medía 3,81:1 de día sobre la tarjeta. Se mide aquí para que no vuelva. */
  {
    const he = await p.evaluate(() => {
      const b = document.getElementById('b-hermano'), s = getComputedStyle(b);
      const opaco = el => { for (let x = el; x; x = x.parentElement) { const f = getComputedStyle(x).backgroundColor;
        const m = /rgba?\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+(?:\s*[,/]\s*([\d.]+))?/.exec(f); if (m && (m[1] == null || +m[1] > .95)) return f; } return 'rgb(255,255,255)'; };
      return { letra: s.color, op: +s.opacity, fondo: opaco(b.parentElement), espera: b.hasAttribute('data-espera') };
    });
    const f = rgba(he.fondo), l = rgba(he.letra);
    const r = contraste(sobre([l[0], l[1], l[2], he.op], f), f);
    cierto(he.espera && he.op < 1 && r >= 4.5, 'el hermano que espera se ve apagado pero su rótulo se sigue leyendo (' + r.toFixed(2) + ':1)', he);
  }
  await p.waitForTimeout(1600);
  const ok = await p.evaluate(() => { const b = document.getElementById('b-sellar'), s = getComputedStyle(b); return { estado: b.dataset.estado, txt: b.textContent, pal: !!b.querySelector('.palomita'), letra: s.color, fondo: s.backgroundColor, hermano: document.getElementById('b-hermano').hasAttribute('data-espera') }; });
  cierto(ok.estado === 'ok' && ok.txt.includes('Sellada · A1B2-C3D4') && ok.pal && !ok.hermano, 'termina en verde con su palomita: «' + ok.txt + '», y el hermano se suelta', ok);
  cierto(contraste(rgba(ok.letra), rgba(ok.fondo)) >= 4.5, 'el éxito se lee: ' + contraste(rgba(ok.letra), rgba(ok.fondo)).toFixed(2) + ':1');
  /* El éxito tampoco acepta toques: lo que dice es «Sellada», no su acción, y ahí se registraba
     una segunda venta. Pero solo mientras es un momento que se apaga solo: con `volver:0` el
     rótulo se queda porque quien llama lo pidió, y entonces el botón vuelve a ser suyo —si no,
     sería un botón muerto que nadie puede desbloquear sin conocer reiniciar(). */
  {
    await p.evaluate(() => { window.__cuentas.hermano = 0; });
    await p.click('#b-sellar', { force: true });
    await p.waitForTimeout(120);
    const enOk = await p.evaluate(() => ({ estado: document.getElementById('b-sellar').dataset.estado, n: window.__cuentas.hermano }));
    cierto(enOk.estado === 'ok', 'mientras dice el éxito no acepta otro toque (no se registra una segunda venta)', enOk);
    const fijo = await p.evaluate(async () => {
      const b = document.getElementById('b-hermano');
      window.__cuentas.hermano = 0;
      Piezas.estadoBoton(b).ok('Ya se instaló', { volver: 0 });
      await new Promise(r => setTimeout(r, 60));
      b.click();
      const out = { estado: b.dataset.estado, aria: b.getAttribute('aria-disabled'), clics: window.__cuentas.hermano };
      Piezas.estadoBoton(b).reiniciar();
      return out;
    });
    cierto(fijo.estado === 'ok' && fijo.aria === null && fijo.clics === 1, 'un éxito que se queda (volver:0) sigue siendo del que llama: acepta toques', fijo);
  }
  if (completo) {
    await p.waitForTimeout(3700);
    const vuelta = await p.evaluate(() => { const b = document.getElementById('b-sellar'); return { txt: b.textContent, estado: b.dataset.estado || '', minW: b.style.minWidth, clase: b.classList.contains('con-estado') }; });
    cierto(vuelta.txt === 'Autorizar y sellar' && !vuelta.estado && !vuelta.minW && !vuelta.clase, 'a los 3.5 s regresa a su rótulo, sin rastro', vuelta);
  } else await p.evaluate(() => Piezas.estadoBoton('b-sellar').reiniciar());
  await p.click('#b-traer');
  await p.waitForTimeout(120);
  {
    const g = await p.evaluate(() => { const b = document.getElementById('b-traer'), s = getComputedStyle(b), r = b.querySelector('.trabajo-relleno');
      return { letra: s.color, fondo: s.backgroundColor, relleno: getComputedStyle(r).backgroundColor, tipo: b.dataset.relleno, detras: fondoOpaco(b.parentElement) }; });
    /* El fantasma no tiene fondo propio (de noche es transparente): lo que hay debajo es la
       tarjeta, y contra ella se mide, no contra el negro de un rgba(0,0,0,0). */
    const f = rgba(g.fondo)[3] > .5 ? sobre(rgba(g.fondo), rgba(g.detras)) : rgba(g.detras);
    const peor = Math.min(contraste(rgba(g.letra), f), contraste(rgba(g.letra), sobre(rgba(g.relleno), f)));
    cierto(peor >= 4.5 && g.tipo === (tema === 'oscuro' ? 'luz' : 'claro'), 'en un botón fantasma el relleno es un tinte (' + g.tipo + ') y la letra sigue en ' + peor.toFixed(2) + ':1', g);
  }
  await p.waitForTimeout(980);
  const falla = await p.evaluate(() => { const b = document.getElementById('b-traer'), s = getComputedStyle(b); return { estado: b.dataset.estado, txt: b.textContent, sacude: b.classList.contains('sacudida'), letra: s.color, fondo: s.backgroundColor }; });
  cierto(falla.estado === 'mal' && /No contestó · Reintentar/.test(falla.txt), 'el que falla dice «' + falla.txt + '» sin cerrar nada', falla);
  cierto(reducido ? !falla.sacude : true, reducido ? 'con menos movimiento no tiembla' : 'y tiembla (la sacudida es de 320 ms)');
  cierto(contraste(rgba(falla.letra), rgba(falla.fondo)) >= 4.5, 'el fallo se lee: ' + contraste(rgba(falla.letra), rgba(falla.fondo)).toFixed(2) + ':1');
  await p.evaluate(() => Piezas.estadoBoton('b-traer').reiniciar());
  await p.focus('#b-sellar');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(120);
  cierto(await p.evaluate(() => document.getElementById('b-sellar').dataset.estado === 'trabajando' && document.activeElement.id === 'b-sellar'),
    'con Enter también trabaja, y el foco se queda en el botón (aria-disabled, no disabled)');
  await p.waitForTimeout(1600);
  await p.evaluate(() => Piezas.estadoBoton('b-sellar').reiniciar());

  /* ---------- 15 · «Deshacer» en el mismo botón ---------- */
  await p.evaluate(() => { window.__armarMs = 1500; Object.assign(window.__cuentas, { delegado: 0, confirmado: 0, deshecho: 0 }); });
  const wArmar = await p.evaluate(() => document.getElementById('b-armar').getBoundingClientRect().width);
  await p.click('#b-armar');
  await p.waitForTimeout(250);
  const des = await p.evaluate(() => { const b = document.getElementById('b-armar'), vis = b.querySelector('.rotulo-b'); return { vis: vis && vis.textContent, alt: !!b.querySelector('.rotulo.alt'), mecha: !!b.querySelector('.mecha'), ancho: b.getBoundingClientRect().width, c: { ...window.__cuentas } }; });
  cierto(des.alt && des.vis === 'Deshacer' && des.mecha && des.c.delegado === 1, 'el botón que hizo la acción se vuelve «Deshacer» con su mecha', des);
  cierto(des.ancho >= wArmar - .5, 'y no brinca de ancho');
  await p.click('#b-armar');
  await p.waitForTimeout(200);
  let c = await p.evaluate(() => ({ ...window.__cuentas, alt: !!document.querySelector('#b-armar .rotulo.alt') }));
  cierto(c.deshecho === 1 && c.confirmado === 0 && c.delegado === 1 && !c.alt, 'tocarlo deshace, no escribe nada y no vuelve a hacer la acción', c);
  await p.click('#b-armar');
  await p.mouse.move(2, 2);
  await p.waitForTimeout(1800);
  c = await p.evaluate(() => ({ ...window.__cuentas, txt: document.getElementById('r-armar-est').textContent }));
  cierto(c.confirmado === 1 && c.deshecho === 1, 'dejar correr la mecha confirma: «' + c.txt + '»', c);
  await p.focus('#b-armar');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  c = await p.evaluate(() => ({ ...window.__cuentas }));
  cierto(c.delegado === 3 && c.deshecho === 2, 'con Enter: arma y deshace', c);
  await p.evaluate(() => { window.__armarMs = 3000; });
  await p.click('#b-armar');
  const a0 = await centro(p, '#b-armar');
  await p.mouse.move(2, 2); await p.waitForTimeout(100);
  await p.mouse.move(a0.x, a0.y);
  const m1 = await p.evaluate(() => Piezas.deshacerEnBoton && document.querySelector('#b-armar .mecha') ? 1 : 0);
  const rr = await p.evaluate(async () => {
    const leer = () => { const a = document.querySelector('#b-armar .mecha'); const an = a && a.getAnimations()[0]; return an ? an.playState : 'quieta'; };
    return leer();
  });
  cierto(m1 === 1 && (reducido || rr === 'paused'), 'al volver con el cursor la mecha se congela', rr);
  await p.mouse.move(2, 2);
  await p.click('#b-armar');
  await p.waitForTimeout(150);

  /* ---------- 23 · el rótulo ---------- */
  await alCentro(p, '#b-sigue');
  await p.click('#b-sigue');
  await p.waitForTimeout(280);
  const rot = await p.evaluate(() => { const el = document.getElementById('r-sigue'); return { txt: el.querySelector('.rotulo-a').textContent, salen: el.querySelectorAll('.rotulo-sale').length, tr: getComputedStyle(el.querySelector('.rotulo-a')).transitionDuration }; });
  cierto(rot.txt === 'Falta la dirección ›' && rot.salen === 0, 'el renglón «lo que sigue» cambia con un cruce y no deja restos', rot);
  cierto(reducido ? /^0s/.test(rot.tr) : !/^0s/.test(rot.tr), reducido ? 'con menos movimiento el cambio es inmediato' : 'el cruce dura ' + rot.tr);
  const igual = await p.evaluate(() => {
    const el = document.getElementById('r-sigue'); let n = 0;
    const mo = new MutationObserver(l => { n += l.length; }); mo.observe(el, { childList: true, subtree: true, characterData: true, attributes: true });
    const r = Piezas.cambiarRotulo(el, 'Falta la dirección ›');
    return new Promise(res => setTimeout(() => { mo.disconnect(); res({ r, n }); }, 50));
  });
  cierto(igual.r === false && igual.n === 0, 'con el mismo texto no toca el DOM (renderMobileBar corre en cada tecla)', igual);
  const w0 = await p.evaluate(() => document.getElementById('b-dock').getBoundingClientRect().width);
  await p.click('#b-dock');
  await p.waitForTimeout(60);
  const dk = await p.evaluate(() => { const b = document.getElementById('b-dock'); return { w: b.getBoundingClientRect().width, alt: !!b.querySelector('.rotulo.alt'), txt: b.querySelector('.rotulo-b').textContent, sac: b.classList.contains('sacudida'), aria: b.querySelector('.rotulo-a').getAttribute('aria-hidden') }; });
  cierto(dk.alt && dk.txt === 'Falta el teléfono' && dk.aria === 'true', 'el botón principal dice «Falta el teléfono» en su lugar', dk);
  cierto(reducido ? !dk.sac : dk.sac, reducido ? 'sin sacudida con menos movimiento' : 'con una sacudida corta');
  await p.waitForTimeout(1700);
  const w2 = await p.evaluate(() => ({ w: document.getElementById('b-dock').getBoundingClientRect().width, alt: !!document.querySelector('#b-dock .rotulo.alt') }));
  cierto(!w2.alt && dk.w >= w0 - .5 && Math.abs(w2.w - dk.w) < .5, 'y vuelve a «Autorizar» sin que el ancho brinque ni al ir ni al volver', { antes: w0, durante: dk.w, despues: w2.w });
  await p.click('#b-copiar');
  await p.waitForTimeout(300);
  const cp = await p.evaluate(async () => ({ copio: window.__copio, clip: await navigator.clipboard.readText().catch(e => 'error: ' + e.message), alt: document.querySelector('#b-copiar .rotulo-b').textContent, pal: !!document.querySelector('#b-copiar .rotulo-b .palomita') }));
  cierto(cp.copio === true && cp.clip === '$10,800.00' && cp.alt === 'Copiado' && cp.pal, 'copiar pone el texto en el portapapeles y lo dice el botón: palomita + «Copiado»', cp);
  const wi = await p.evaluate(() => document.getElementById('b-icono').getBoundingClientRect().width);
  await p.click('#b-icono');
  await p.waitForTimeout(250);
  const ic = await p.evaluate(() => { const b = document.getElementById('b-icono'); return { w: b.getBoundingClientRect().width, txt: b.querySelector('.rotulo-b').textContent, pal: !!b.querySelector('.rotulo-b .palomita') }; });
  cierto(ic.pal && ic.txt === '' && Math.abs(ic.w - wi) < .5, 'un botón de solo icono cambia el icono por la palomita, sin texto que lo ensanche', { antes: wi, ...ic });
  /* El respaldo sin API del portapapeles: copia y devuelve el foco. */
  await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => undefined }); window.__copio = null; });
  await p.click('#b-copiar');
  await p.waitForTimeout(200);
  const resp = await p.evaluate(() => ({ copio: window.__copio, foco: document.activeElement && document.activeElement.id, restos: document.querySelectorAll('body > textarea').length }));
  cierto(typeof resp.copio === 'boolean' && resp.foco === 'b-copiar' && resp.restos === 0, 'sin portapapeles, el respaldo copia, no deja el <textarea> y devuelve el foco al botón', resp);

  /* ---------- 5 · mantener presionado ---------- */
  await p.evaluate(() => { window.__cuentas.borrar = 0; window.__cuentas.autorizar = 0; window.__onclickDirecto = 0; });
  const hb = await centro(p, '#b-borrar');
  await p.mouse.move(hb.x, hb.y); await p.mouse.down(); await p.waitForTimeout(110); await p.mouse.up();
  await p.waitForTimeout(250);
  let mt = await p.evaluate(() => ({ b: window.__cuentas.borrar, aviso: document.getElementById('aviso-mantener').textContent, directo: window.__onclickDirecto }));
  cierto(mt.b === 0 && /Mantén presionado/.test(mt.aviso), 'un toque corto no borra: dice «' + mt.aviso + '»', mt);
  cierto(mt.directo === 0, 'y el onclick del marcado del botón no corre: la acción es alConfirmar');
  await p.mouse.move(hb.x, hb.y); await p.mouse.down();
  await p.waitForTimeout(450);
  const medio = await p.evaluate(() => {
    const b = document.getElementById('b-borrar'), t = b.querySelector('.mantener-capa-t'), s = getComputedStyle(t), bs = getComputedStyle(b);
    return { capa: b.querySelector('.mantener-capa').getAnimations().length, letra: s.color, fondo: s.backgroundColor, base: bs.color,
      fondoBase: bs.backgroundColor, grad: bs.backgroundImage, relleno: b.dataset.relleno, detras: fondoOpaco(b) };
  });
  cierto(medio.capa === 1, 'mientras se sostiene, el relleno avanza (también con menos movimiento: es información)');
  /* Contra lo que de verdad queda debajo: la capa compuesta sobre el fondo del botón. Si el
     botón no trae fondo propio —de noche los fantasmas son transparentes— lo que hay debajo es
     la tarjeta, y hay que medir contra ella: sin ese respaldo la lista salía vacía, Math.min()
     de nada es Infinity y la comprobación pasaba sin medir nada. */
  const bajo = todos(medio.grad).concat(rgba(medio.fondoBase)).filter(c => c[3] > .5);
  if (!bajo.length) bajo.push(rgba(medio.detras));
  cierto(bajo.length > 0 && bajo.every(Boolean), 'hay un fondo de verdad contra el que medir el relleno de mantener', { bajo, detras: medio.detras });
  const cM = Math.min(...bajo.map(f => contraste(rgba(medio.letra), sobre(rgba(medio.fondo), f))));
  cierto(medio.relleno !== 'oscuro' && rgba(medio.fondo)[3] === 1, 'el botón de borrar se llena de rojo sólido, que se ve también de noche', medio);
  cierto(isFinite(cM) && cM >= 4.5, 'la letra encima del relleno se lee: ' + cM.toFixed(2) + ':1');
  await p.waitForTimeout(700);
  await p.mouse.up();
  await p.waitForTimeout(150);
  mt = await p.evaluate(() => ({ b: window.__cuentas.borrar, hecho: document.getElementById('b-borrar').classList.contains('hecho'), aria: document.getElementById('b-borrar').getAttribute('aria-disabled'), directo: window.__onclickDirecto }));
  cierto(mt.b === 1 && mt.hecho && mt.aria === 'true' && mt.directo === 0, 'sostenido 1.15 s, confirma una sola vez', mt);
  await p.evaluate(() => Piezas.mantener('b-borrar', { ms: 900, aviso: 'aviso-mantener', alConfirmar: () => { window.__cuentas.borrar++; } }));
  await p.mouse.move(hb.x, hb.y); await p.mouse.down(); await p.waitForTimeout(1150); await p.mouse.up();
  await p.waitForTimeout(100);
  cierto(await p.evaluate(() => window.__cuentas.borrar) === 2, 'llamarla otra vez sobre el mismo botón reinicia sin duplicar oyentes (confirma uno, no dos)');
  /* Teclado. */
  await p.focus('#b-autorizar');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(250);
  cierto(await p.evaluate(() => window.__cuentas.autorizar) === 0, 'un Enter corto no autoriza');
  await p.keyboard.down('Enter'); await p.waitForTimeout(400); await p.keyboard.press('Escape'); await p.keyboard.up('Enter');
  await p.waitForTimeout(300);
  cierto(await p.evaluate(() => window.__cuentas.autorizar) === 0, 'Escape suelta a medias y no pasa nada');
  await p.keyboard.down('Enter'); await p.waitForTimeout(1150); await p.keyboard.up('Enter');
  await p.waitForTimeout(100);
  cierto(await p.evaluate(() => window.__cuentas.autorizar) === 1, 'Enter sostenido autoriza');
  const cOk = await p.evaluate(() => { const t = document.querySelector('#b-autorizar .mantener-capa-t'), b = document.getElementById('b-autorizar'); return { letra: getComputedStyle(t).color, capa: getComputedStyle(t).backgroundColor, fondo: getComputedStyle(b).backgroundColor, rel: b.dataset.relleno }; });
  const cO = contraste(rgba(cOk.letra), sobre(rgba(cOk.capa), rgba(cOk.fondo)));
  cierto(cOk.rel === 'oscuro' && cO >= 4.5, 'sobre un botón verde el relleno oscurece y la letra blanca queda en ' + cO.toFixed(2) + ':1', cOk);
  /* Un lector de pantalla no sostiene: dos activaciones. */
  const at = await p.evaluate(async () => {
    Piezas.mantener('b-autorizar', { ms: 900, tono: 'ok', alConfirmar: () => { window.__cuentas.autorizar++; } });
    const b = document.getElementById('b-autorizar');
    b.click();
    const armado = b.querySelector('.rotulo-b') && b.querySelector('.rotulo-b').textContent;
    const tras1 = window.__cuentas.autorizar;
    b.click();
    await new Promise(r => setTimeout(r, 350));
    return { armado, tras1, tras2: window.__cuentas.autorizar };
  });
  cierto(at.armado === 'Otra vez para confirmar' && at.tras1 === 1 && at.tras2 === 2, 'sin puntero (lector de pantalla): la primera activación pide otra, la segunda confirma', at);
  /* Una pantalla que le reescribe el rótulo (confirmar() hace `si.textContent = o.si`) y la vuelve
     a llamar: se arma de nuevo sobre el rótulo nuevo, sin oyentes de sobra. */
  await p.evaluate(() => {
    const b = document.getElementById('b-borrar');
    b.textContent = 'Sí, borrar todo';
    Piezas.mantener(b, { ms: 900, aviso: 'aviso-mantener', alConfirmar: () => { window.__cuentas.borrar++; } });
    window.__cuentas.borrar = 0;
  });
  const hb2 = await centro(p, '#b-borrar');
  await p.mouse.move(hb2.x, hb2.y); await p.mouse.down(); await p.waitForTimeout(1150); await p.mouse.up();
  await p.waitForTimeout(100);
  const rehecho = await p.evaluate(() => { const b = document.getElementById('b-borrar'); return { b: window.__cuentas.borrar, base: b.querySelector('.mantener-base').textContent, capa: b.querySelector('.mantener-capa-t').textContent, capas: b.querySelectorAll('.mantener-capa').length }; });
  cierto(rehecho.b === 1 && rehecho.base === 'Sí, borrar todo' && rehecho.capa === 'Sí, borrar todo' && rehecho.capas === 1,
    'con el rótulo reescrito por la pantalla, se vuelve a armar sobre el nuevo y confirma una vez', rehecho);
  /* `textoHecho` vive en la capa de color, que va aria-hidden porque es la copia del rótulo: sin
     esto, quien no ve el relleno llenarse no se enteraba de que había confirmado. */
  const dicho = await p.evaluate(async () => {
    const b = document.getElementById('b-borrar');
    Piezas.mantener(b, { ms: 60, textoHecho: 'Borrando…', alConfirmar: () => {} });
    document.getElementById('vozStatus').textContent = '';
    b.dispatchEvent(new PointerEvent('pointerdown', { isPrimary: true, button: 0, pointerId: 31, bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const out = { voz: document.getElementById('vozStatus').textContent, coletilla: b.querySelector('.solo-voz').textContent, hecho: b.classList.contains('hecho') };
    Piezas.mantener(b, { ms: 900, aviso: 'aviso-mantener', alConfirmar: () => { window.__cuentas.borrar++; } });
    return out;
  });
  cierto(dicho.hecho && dicho.voz === 'Borrando…' && /Borrando…/.test(dicho.coletilla),
    'al confirmar se DICE el textoHecho y deja de prometer «mantén presionado», que ya no es cierto', dicho);

  /* ---------- 6 · la palomita ---------- */
  const pal = await p.evaluate(async () => {
    const svg = Piezas.palomita(document.getElementById('pal-caja'), { circulo: true });
    const a = svg.querySelector('path').getAnimations().map(x => x.effect.getComputedTiming().iterations);
    await new Promise(r => setTimeout(r, 700));
    return { a, fin: getComputedStyle(svg.querySelector('path')).strokeDashoffset, html: Piezas.palomitaHTML({ dibujar: false }) };
  });
  cierto(reducido ? pal.a.length === 0 : pal.a.join() === '1', reducido ? 'con menos movimiento la palomita aparece ya dibujada' : 'la palomita se dibuja una sola vez', pal.a);
  cierto(parseFloat(pal.fin) === 0 && !/dibuja/.test(pal.html), 'y queda completa; la que ya estaba se pinta sin volver a dibujarse', pal);
  /* Idempotente en la caja: A14 marca «Coincide» renglón por renglón y F6 repinta el conteo del
     mes, y los dos vuelven a llamar sobre la misma caja. Apilar palomitas es una fila de ✓
     creciendo dentro de un botón de 44 px; lo mismo con dos sellos de 150 px, que además dirían
     dos cosas distintas a la vez. */
  const repetidas = await p.evaluate(() => {
    const c = document.getElementById('pal-caja');
    Piezas.palomita(c, { circulo: true }); Piezas.palomita(c, { circulo: true });
    const s = document.createElement('div'); document.body.appendChild(s);
    Piezas.sello(s, { texto: 'AL3D · AUTÉNTICA ·' });
    Piezas.sello(s, { texto: 'AL3D · YA NO VIGENTE ·', gris: true });
    const out = { palomitas: c.querySelectorAll('.palomita').length, sellos: s.querySelectorAll('.sello-circular').length,
      ultimo: s.querySelector('.sello-circular').classList.contains('gris') };
    s.remove();
    return out;
  });
  cierto(repetidas.palomitas === 1 && repetidas.sellos === 1 && repetidas.ultimo,
    'llamarlas otra vez sobre la misma caja SUSTITUYE: una palomita, un sello, y el que manda es el último', repetidas);

  /* ---------- 24 · el veredicto y el sello ---------- */
  await alCentro(p, '[data-me="trabaja"]');
  await p.click('[data-me="trabaja"]');
  const gira = await p.evaluate(() => document.querySelector('#me-44 .me-arco').getAnimations().map(a => a.effect.getComputedTiming().iterations));
  cierto(reducido ? gira.length === 0 : gira.join() === 'Infinity', reducido ? 'con menos movimiento el arco de espera se queda quieto' : 'el arco gira mientras hay una espera de verdad', gira);
  await p.click('[data-me="ok"]');
  await p.waitForTimeout(80);
  const ver = await p.evaluate(() => {
    const m = document.querySelector('#me-44 .marca-estado'), s = document.querySelector('#sello-caja svg');
    return { estado: m.dataset.estado, dibuja: m.classList.contains('dibuja'), arco: document.querySelector('#me-44 .me-arco').getAnimations().length,
      tam: m.getBoundingClientRect().width, t16: document.querySelector('#me-16 .marca-estado').getBoundingClientRect().width,
      rol: m.getAttribute('role'), nombre: m.getAttribute('aria-label'), sello: !!s, path: s && s.querySelector('textPath').getAttribute('href'),
      caida: s ? s.getAnimations().map(a => a.effect.getComputedTiming().iterations) : [], texto: s && s.querySelector('textPath').textContent };
  });
  cierto(ver.estado === 'ok' && ver.dibuja && ver.arco === 0, 'al llegar el veredicto el arco se va y la ✓ se dibuja', ver);
  cierto(Math.abs(ver.tam - 44) < .5 && Math.abs(ver.t16 - 16) < .5 && ver.rol === 'img' && ver.nombre === 'Consultando', 'el glifo mide lo que se le pide (44 y 16 px) y lleva nombre si se le da', ver);
  cierto(ver.sello && /AUTÉNTICA/.test(ver.texto) && (reducido || ver.caida.join() === '1'), 'el sello «Auténtica» lleva su texto alrededor y cae una sola vez', ver);
  const dos = await p.evaluate(() => { const a = Piezas.selloHTML({}), b = Piezas.selloHTML({}); return [/id="([^"]+)"/.exec(a)[1], /id="([^"]+)"/.exec(b)[1]]; });
  cierto(dos[0] !== dos[1], 'dos sellos en la misma página no comparten el id de su círculo', dos);
  await p.click('[data-me="av"]');
  cierto(await p.evaluate(() => document.querySelector('#sello-caja svg').classList.contains('gris') && document.querySelector('#me-16 .marca-estado').dataset.estado === 'av'), '«Ya no vigente»: la marca pasa a ! y el sello sale gris y cruzado');

  /* Girar el teléfono con un botón trabajando. El ancho se conserva con `min-width` para que el
     rótulo no encoja al cambiar de texto, y en píxeles pelados ese mínimo sobrevivía al giro:
     «Registrar venta» medido en horizontal dejaba 640 px de mínimo y al volver a vertical la
     página entera se iba de lado. Se prueba también con la mecha de «Deshacer», que hace lo mismo. */
  {
    await limpiar(p);
    await p.setViewportSize({ width: 800, height: 700 });
    await p.evaluate(() => {
      const caja = document.createElement('div');
      caja.id = 'caja-ancha'; caja.style.cssText = 'width:100%;display:flex';
      caja.innerHTML = '<button type="button" id="b-ancho" class="btn btn-pri" style="flex:1">Registrar venta</button>';
      document.querySelector('main').appendChild(caja);
      Piezas.estadoBoton('b-ancho').trabajando({ verbo: 'Registrando', tau: 600000 });
    });
    await p.waitForTimeout(150);
    await p.setViewportSize({ width: 360, height: 780 });
    await p.waitForTimeout(250);
    const giro = await p.evaluate(() => ({ doc: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      w: Math.round(document.getElementById('b-ancho').getBoundingClientRect().width) }));
    cierto(giro.scroll <= giro.doc + 1, 'girado a vertical con un botón trabajando, la página no se va de lado', giro);
    await p.evaluate(() => {
      Piezas.estadoBoton('b-ancho').reiniciar();
      Piezas.deshacerEnBoton('b-ancho', { ms: 600000, alConfirmar: () => {}, alDeshacer: () => {}, voz: false });
    });
    await p.setViewportSize({ width: 800, height: 700 });
    await p.waitForTimeout(80);
    await p.setViewportSize({ width: 360, height: 780 });
    await p.waitForTimeout(250);
    const giro2 = await p.evaluate(() => ({ doc: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    cierto(giro2.scroll <= giro2.doc + 1, '  y con la mecha de «Deshacer» viva, tampoco', giro2);
    await p.evaluate(() => { const c = document.getElementById('caja-ancha'); if (c) c.remove(); });
    await p.setViewportSize({ width: ancho, height: 780 });
    await p.waitForTimeout(200);
  }

  if (CAPTURAS) {
    await limpiar(p);
    await p.evaluate(() => document.querySelector('#b-sellar').scrollIntoView({ block: 'start' }));
    await p.evaluate(() => { window.__trabajo = { ms: 60000, ok: true }; });
    await p.click('#b-sellar');
    await p.click('#v-notario').catch(() => {});
    await p.evaluate(() => { const P = Piezas; P.aviso('El total de este teléfono ($12,528.00) no es el que selló la hoja ($12,580.00).', { tipo: 'err', dur: 60000, voz: false }); P.aviso('Partida 2 eliminada', { dur: 60000, accion: { label: 'Deshacer', fn() {} }, voz: false }); });
    await p.waitForTimeout(2200);
    await p.screenshot({ path: CAPTURAS + '/piezas-avisos-' + ancho + '-' + tema + (reducido ? '-rm' : '') + '.png' });
    await p.evaluate(() => Piezas.estadoBoton('b-sellar').reiniciar());
  }

  await reposo(p, etiqueta, ancho);
  cierto(errs.length === 0, etiqueta + ': cero errores de página', errs);
  cierto(fallidas.length === 0, etiqueta + ': ningún archivo falta', fallidas);
  await ctx.close();
}

/* ======================================================================
   El dedo
   ====================================================================== */
async function conDedo(ancho, reducido, tema) {
  const etiqueta = ancho + ' px · ' + (reducido ? 'menos movimiento' : 'con movimiento') + ' · ' + tema;
  console.log('\n── ' + etiqueta + ' · con el dedo ──');
  const { ctx, p, errs, fallidas } = await abrir({ ancho, reducido, tema, tacto: true });
  const d = await dedo(p);
  cierto(await p.evaluate(() => matchMedia('(pointer: coarse)').matches), 'el puntero es grueso (un teléfono)');
  await p.tap('#v-deshacer');
  await p.waitForTimeout(300);
  const alto = await p.evaluate(() => ({ act: document.querySelector('#toast .toast-act').getBoundingClientRect().height, uno: document.querySelector('#toast .toast-uno').getBoundingClientRect().height }));
  cierto(alto.act >= 44 && alto.uno >= 44, 'con el dedo, «Deshacer» y el aviso miden 44 px o más', alto);
  const u = await centro(p, '#toast .toast-msg');
  await d.bajar(u.x, u.y);
  const r1 = (await vivos(p))[0].resta; await p.waitForTimeout(500); const r2 = (await vivos(p))[0].resta;
  await d.soltar();
  cierto(Math.abs(r1 - r2) < 40, 'con el dedo encima la mecha se congela', { r1, r2 });
  await p.tap('#toast .toast-act');
  await p.waitForTimeout(300);
  cierto((await vivos(p)).map(x => x.msg).join() === 'Partida restaurada', 'tocar «Deshacer» con el dedo lo hace');
  const u2 = await centro(p, '#toast .toast-msg');
  await d.deslizar(u2.x, u2.y, 90);
  await p.waitForTimeout(300);
  cierto((await vivos(p)).length === 0, 'deslizado hacia abajo con el dedo, se va');
  await p.tap('#v-notario');
  await p.waitForTimeout(300);
  cierto((await vivos(p)).length === 2, 'con el dedo también: el error y el ✓ quedan los dos');
  await limpiar(p);
  /* 5 */
  await p.evaluate(() => { window.__cuentas.borrar = 0; });
  const hb = await centro(p, '#b-borrar');
  await d.sostener(hb.x, hb.y, 120);
  await p.waitForTimeout(200);
  cierto(await p.evaluate(() => window.__cuentas.borrar) === 0, 'un toque corto con el dedo no borra');
  await d.sostener(hb.x, hb.y, 1150);
  await p.waitForTimeout(100);
  cierto(await p.evaluate(() => window.__cuentas.borrar) === 1, 'sostenido con el dedo, borra');
  /* 15 */
  await p.evaluate(() => { window.__armarMs = 1500; Object.assign(window.__cuentas, { delegado: 0, deshecho: 0, confirmado: 0 }); });
  await alCentro(p, '#b-armar');
  await p.tap('#b-armar');
  await p.waitForTimeout(200);
  await p.tap('#b-armar');
  await p.waitForTimeout(200);
  const c = await p.evaluate(() => ({ ...window.__cuentas }));
  cierto(c.delegado === 1 && c.deshecho === 1 && c.confirmado === 0, 'con el dedo: «Ya se armó» y luego «Deshacer»', c);
  /* 14 */
  await p.evaluate(() => { window.__trabajo = { ms: 600, ok: true }; });
  await alCentro(p, '#b-sellar');
  await p.tap('#b-sellar');
  await p.waitForTimeout(100);
  cierto(await p.evaluate(() => document.getElementById('b-sellar').dataset.estado) === 'trabajando', 'tocado con el dedo, el botón trabaja');
  await p.waitForTimeout(800);
  cierto(await p.evaluate(() => document.getElementById('b-sellar').dataset.estado) === 'ok', 'y termina');
  await p.evaluate(() => Piezas.estadoBoton('b-sellar').reiniciar());
  /* 23 */
  await alCentro(p, '#b-dock');
  await p.tap('#b-dock');
  await p.waitForTimeout(60);
  cierto(await p.evaluate(() => !!document.querySelector('#b-dock .rotulo.alt')), 'el rótulo temporal también con el dedo');
  await p.waitForTimeout(1600);
  await reposo(p, etiqueta + ' · dedo', ancho);
  cierto(errs.length === 0, etiqueta + ' · dedo: cero errores de página', errs);
  cierto(fallidas.length === 0, etiqueta + ' · dedo: ningún archivo falta', fallidas);
  await ctx.close();
}

/* ======================================================================
   La falla 2, en las apps de verdad
   ====================================================================== */
async function enLasApps() {
  console.log('\n── La falla 2 en el cotizador, la plataforma y el anidador ──');
  for (const ancho of [360, 420]) {
    const ctx = await nav.newContext({ viewport: { width: ancho, height: 780 }, locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(async () => {
      /* Las dos líneas de notario.js, tal cual: aplicarSello() avisa el error y regresa, y la
         vuelta de consultarSolicitudes() dice el ✓ en el mismo tick. */
      toast('El total de este teléfono ($12,528.00) no es el que selló la hoja ($12,580.00). Actualiza la app antes de mandar el PDF.', 'err', 12000);
      toast('✓ direccion@al3d.mx autorizó COT-0042 · $12,580.00', 'ok', 6000);
      await new Promise(r => setTimeout(r, 400));
      const unos = [...document.querySelectorAll('#toast .toast-uno')];
      const t = document.getElementById('toast').getBoundingClientRect();
      const mb = document.getElementById('mbar'), mr = mb && mb.getBoundingClientRect();
      const conDock = !!(mb && mr.height > 0 && getComputedStyle(mb).display !== 'none');
      const hermano = document.getElementById('scalermodal').nextElementSibling.id;
      const b0 = getComputedStyle(document.getElementById('toast')).bottom;
      document.getElementById('scalermodal').classList.add('show');
      await new Promise(r => setTimeout(r, 60));
      const b1 = getComputedStyle(document.getElementById('toast')).bottom;
      document.getElementById('scalermodal').classList.remove('show');
      return { txt: unos.map(e => e.textContent), visibles: unos.filter(e => e.getBoundingClientRect().height > 20 && +getComputedStyle(e).opacity > .98).length,
        abajoPila: t.bottom, arribaDock: conDock ? mr.top : null, hermano, b0, b1, voz: document.getElementById('vozAlert').textContent };
    });
    cierto(r.visibles === 2 && /no es el que selló/.test(r.txt[0]) && /autorizó/.test(r.txt[1]), 'cotizador a ' + ancho + ' px: el error del notario y el ✓ quedan LOS DOS a la vista', r.txt);
    cierto(r.arribaDock === null || r.abajoPila <= r.arribaDock + .5, 'cotizador a ' + ancho + ' px: la pila se posa encima del dock y no tapa el botón principal', { pila: r.abajoPila, dock: r.arribaDock });
    cierto(r.hermano === 'toast' && r.b0 !== r.b1, 'la regla .scaler-modal-bg.show+.toast sigue subiendo la pila sobre el pie del escalador', { b0: r.b0, b1: r.b1 });
    cierto(/no es el que selló/.test(r.voz), 'y el error se dijo en la región asertiva');
    if (ancho === 360) {
      /* copiarTexto() de siempre, desde el onclick de un botón: confirma en el botón y avisa abajo. */
      const cp = await p.evaluate(async () => {
        const b = document.createElement('button'); b.className = 'btn btn-gho'; b.id = 'prueba-copiar'; b.textContent = 'Copiar link';
        b.setAttribute('onclick', "copiarTexto('https://maps.app.goo.gl/x','Link de Maps copiado · listo para compartir')");
        document.querySelector('.wrap').prepend(b);
        return true;
      });
      await p.click('#prueba-copiar');
      await p.waitForTimeout(400);
      const cq = await p.evaluate(async () => ({ pal: !!document.querySelector('#prueba-copiar .rotulo-b .palomita'), aviso: [...document.querySelectorAll('#toast .toast-msg')].map(x => x.textContent), clip: await navigator.clipboard.readText().catch(() => '') }));
      cierto(cp && cq.pal && cq.aviso.some(x => /Link de Maps copiado/.test(x)) && cq.clip === 'https://maps.app.goo.gl/x', 'copiarTexto() del cotizador confirma en el botón que se tocó y sigue avisando abajo', cq);
    }
    cierto(errs.length === 0, 'cotizador a ' + ancho + ' px: cero errores de página', errs);
    await ctx.close();
  }
  {
    const ctx = await nav.newContext({ viewport: { width: 360, height: 780 }, locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(B + '/#/hoy', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(async () => {
      const UI = await import('./js/nucleo/ui.js');
      UI.toast('No se pudo guardar el conteo', 'err', 8000);
      UI.toast('Conteo guardado', 'ok', 3000);
      UI.toast('Material recibido', '', 6000, { label: 'Deshacer', fn: () => {} });
      await new Promise(r => setTimeout(r, 400));
      return [...document.querySelectorAll('#toast .toast-uno')].map(e => e.querySelector('.toast-msg').textContent);
    });
    cierto(r.length === 2 && r[0] === 'No se pudo guardar el conteo' && r[1] === 'Material recibido', 'plataforma: el error se queda; el «Deshacer» toma el lugar del informativo', r);
    cierto(errs.length === 0, 'plataforma: cero errores de página', errs);
    await ctx.close();
  }
  {
    const ctx = await nav.newContext({ viewport: { width: 420, height: 780 }, locale: 'es-MX', serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(B + '/anidador-vectores/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(900);
    const r = await p.evaluate(async () => {
      const dt = new DataTransfer();
      dt.setData('text/plain', '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><rect x="5" y="5" width="40" height="20"/></svg>');
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 400));
      const u = document.querySelector('#toast .toast-uno');
      return { txt: u && u.textContent, mecha: !!(u && u.querySelector('.mecha')), voz: document.getElementById('vozStatus').textContent };
    });
    cierto(r.txt && /SVG pegado/.test(r.txt) && r.mecha, 'anidador: su aviso ya es la pieza compartida, con mecha', r);
    cierto(errs.length === 0, 'anidador: cero errores de página', errs);
    await ctx.close();
  }
}

let n = 0;
for (const ancho of [360, 420]) for (const reducido of [false, true]) for (const tema of ['claro', 'oscuro']) {
  await conRaton(ancho, reducido, tema, n++ === 0);
}
for (const ancho of [360, 420]) for (const reducido of [false, true]) {
  await conDedo(ancho, reducido, reducido ? 'oscuro' : 'claro');
}
await enLasApps();

await nav.close();
console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nLas piezas de avisos y botones se tocan con el dedo, el ratón y el teclado, y un aviso ya no borra al otro.');
process.exit(fallos ? 1 : 0);
