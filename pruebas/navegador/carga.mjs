/* LO QUE SE VE MIENTRAS CARGA: NADA CUANDO ES RÁPIDO, LA SILUETA CUANDO NO, Y UNA SALIDA SI SE ATORA.
 *
 * Las pantallas de carga nacieron de una medición —entre pedir una pestaña y verla pintada
 * pasan 56-87 ms en una computadora; el marco del cotizador se quedaba en blanco 240-500 ms y
 * el del anidador 700-950— y esta prueba vigila las tres promesas que salieron de ahí:
 *
 *   1. Una transición rápida NO enseña nada: el esqueleto entra al árbol al instante pero el
 *      CSS lo tiene en opacidad 0 los primeros 180 ms, y la barra de progreso 150. Un esqueleto
 *      que parpadea 60 ms se ve peor que la espera.
 *   2. Una lenta enseña la silueta de lo que viene, con su texto, y la barra corriendo; y en
 *      cuanto el módulo pinta, se van. Lo mismo el marco del cotizador y el de la mesa de
 *      corte, que tapan el <iframe> hasta que el documento de dentro terminó de arrancar: la
 *      persona ve UNA pantalla de carga, no la de afuera y luego la de adentro.
 *   3. Si a los seis segundos sigue el esqueleto, el pie dice que tarda más de lo normal y
 *      ofrece recargar. Es el caso de una app actualizada a medias cuando el import no falla
 *      ni llega, que es peor que cuando falla porque no hay error que enseñar.
 *
 * Y las dos páginas sueltas: mientras bajan sus guiones llevan `html.arrancando`, que enseña
 * su esqueleto y esconde el marcado sin datos; la clase se quita al final del arranque, al
 * primer error de script o a los ocho segundos, lo que llegue primero. La salida de
 * emergencia se prueba bloqueando un guion.
 *
 * Las esperas se fabrican retrasando la petición del módulo con `page.route`. El service
 * worker va BLOQUEADO en estos contextos, y no es un descuido: con él puesto, la segunda
 * visita sirve los módulos desde su caché sin pasar por la red, la ruta interceptada nunca se
 * dispara y la prueba mide otra cosa. El worker tiene sus propias pruebas al lado.
 *
 * Necesita navegador y servidor:  pruebas/correr.sh --navegador
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const CAPTURAS = process.env.CAPTURAS || '';   // carpeta donde dejar capturas, si se quiere verlas
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const cierto = (cond, que) => cond ? bien(que) : mal(que);
const captura = (p, nombre) => CAPTURAS ? p.screenshot({ path: CAPTURAS + '/' + nombre + '.png' }) : Promise.resolve();

/* Un contexto limpio, sin service worker y con los errores de página recogidos. */
async function nuevo(opts = {}) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX', serviceWorkers: 'block', ...opts });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(String(e).slice(0, 120)));
  /* Las fuentes de Google no llegan en el sandbox de pruebas y eso no es un error de la app. */
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|net::ERR|fonts\./.test(m.text())) errores.push('console: ' + m.text().slice(0, 120)); });
  return { ctx, p, errores };
}
const retrasa = (p, patron, ms) => p.route(patron, async route => { await new Promise(r => setTimeout(r, ms)); await route.continue(); });
const tableroPintado = p => p.waitForFunction(() => document.querySelector('#mod-tablero .pf-cuentas:not([aria-hidden])'), null, { timeout: 30000 });
async function plataformaLimpia() {
  const c = await nuevo();
  await c.p.goto(B + '/#/hoy', { waitUntil: 'load' });
  await c.p.evaluate(() => { try { localStorage.clear(); localStorage.setItem('al3d_tema', 'claro'); localStorage.setItem('al3d_pf_rol', 'direccion'); } catch (_) {} });
  await c.p.reload({ waitUntil: 'load' });
  await tableroPintado(c.p);
  return c;
}
/* El módulo ya pintó: la sección tiene algo y el esqueleto que iba delante se fue. */
const seccionPintada = (p, id) => p.waitForFunction(id => { const s = document.getElementById(id); return s && s.childNodes.length > 0 && !document.querySelector('.pf-esqueleto'); }, id, { timeout: 30000 });

console.log('\nEL ARRANQUE DE LA PLATAFORMA');
{
  const { ctx, p, errores } = await nuevo();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await p.goto(B + '/#/hoy', { waitUntil: 'commit' });
  const t = Date.now();
  let visto = null;
  for (let i = 0; i < 60 && !visto; i++) {
    await p.waitForTimeout(25);
    visto = await p.evaluate(() => {
      const a = document.getElementById('pf-arranque'); if (!a) return null;
      const tx = document.getElementById('pf-arranque-tx');
      return a.getBoundingClientRect().height > 50 ? (tx ? tx.textContent : '(sin texto)') : null;
    }).catch(() => null);
  }
  cierto(!!visto, 'el esqueleto del arranque está en pantalla desde el primer pintado: «' + visto + '» (' + (Date.now() - t) + ' ms tras el commit)');
  await captura(p, '01-arranque');
  await tableroPintado(p);
  const luego = await p.evaluate(() => ({ arranque: !!document.getElementById('pf-arranque'), esq: !!document.querySelector('.pf-esqueleto') }));
  cierto(!luego.arranque, 'y se quita cuando el Tablero pintó');
  cierto(!luego.esq, 'sin dejar ningún esqueleto de módulo suelto');
  await p.waitForTimeout(800);
  cierto(!/\bon\b/.test(await p.evaluate(() => document.getElementById('pf-progreso').className)), 'la barra de progreso quedó apagada');
  cierto(errores.length === 0, 'cero errores de página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

console.log('\nUNA TRANSICIÓN RÁPIDA NO ENSEÑA NADA');
{
  const { ctx, p, errores } = await plataformaLimpia();
  const r = await p.evaluate(async () => {
    location.hash = '#/agenda';
    await new Promise(r => setTimeout(r, 20));
    const e = document.querySelector('.pf-esqueleto');
    return { existe: !!e, opacidad: e ? getComputedStyle(e).opacity : null,
             prog: getComputedStyle(document.getElementById('pf-progreso')).opacity,
             pintado: document.getElementById('mod-fabricacion').childNodes.length > 0 };
  });
  /* A los 20 ms, o el esqueleto está y no se ve, o el módulo ya pintó y el esqueleto ya se
     fue: las dos son «nadie lo vio». Lo que no puede pasar es verlo. */
  cierto(r.existe ? r.opacidad === '0' : r.pintado,
    r.existe ? 'a los 20 ms el esqueleto está en el árbol pero en opacidad 0: el retardo de 180 ms funciona'
             : 'a los 20 ms el Calendario ya pintó y el esqueleto ya se había quitado');
  cierto(r.prog === '0', 'y la barra de progreso tampoco se ve todavía');
  await seccionPintada(p, 'mod-fabricacion');
  cierto(true, 'y al pintar el Calendario el esqueleto ya no está');
  cierto(errores.length === 0, 'cero errores de página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

console.log('\nUNA TRANSICIÓN LENTA ENSEÑA EL ESQUELETO Y LA BARRA');
{
  const { ctx, p, errores } = await plataformaLimpia();
  await retrasa(p, '**/js/mod/control.js', 1500);
  await p.evaluate(() => { location.hash = '#/control'; });
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const e = document.querySelector('.pf-esqueleto');
    return { op: e ? getComputedStyle(e).opacity : null, txt: e ? e.querySelector('.pf-esqueleto-t').textContent.trim() : '',
             prog: getComputedStyle(document.getElementById('pf-progreso')).opacity, on: document.getElementById('pf-progreso').classList.contains('on'),
             cab: document.getElementById('pf-sub').textContent };
  });
  cierto(r.op === '1', 'a los 700 ms el esqueleto se ve entero (opacidad 1) y dice «' + r.txt + '»');
  cierto(r.on && r.prog === '1', 'y la barra de progreso corre');
  cierto(r.cab === 'Control', 'y el encabezado ya dice «Control», no la pantalla de la que vienes (' + r.cab + ')');
  await captura(p, '02-transicion-lenta');
  await seccionPintada(p, 'mod-control');
  cierto(true, 'al llegar Control, el esqueleto se fue');
  cierto(errores.length === 0, 'cero errores de página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

console.log('\nSI SE ATORA, LO DICE Y OFRECE RECARGAR');
{
  const { ctx, p, errores } = await plataformaLimpia();
  /* Con Control y no con el Mapa: el arranque importa el Mapa (y el Tablero, Fabricación,
     Proyectos y Material) para contar sus pendientes en la barra (`contarTodo` en app.js), así
     que para cuando esta prueba lo retrasaba ya estaba cargado y nunca se atoraba. Si pasaba o
     no dependía del reloj. Control no cuenta nada y solo se importa al abrirlo. */
  await retrasa(p, '**/js/mod/control.js', 7500);
  await p.evaluate(() => { location.hash = '#/control'; });
  await p.waitForTimeout(6600);
  const r = await p.evaluate(() => { const t = document.querySelector('.pf-esqueleto-t'); return t ? { txt: t.textContent.trim(), rol: t.getAttribute('role'), boton: !!t.querySelector('[data-recargar]') } : null; });
  cierto(r && /tarda más de lo normal/.test(r.txt) && r.boton && r.rol === 'alert',
    'a los 6,6 s el pie dice «' + ((r && r.txt) || '').slice(0, 58) + '…», con botón Recargar y role=alert');
  await captura(p, '03-atorado');
  await seccionPintada(p, 'mod-control');
  cierto(true, 'y cuando por fin llega Control, el aviso se va solo');
  cierto(errores.length === 0, 'cero errores de página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

console.log('\nEL MARCO DEL COTIZADOR');
{
  const { ctx, p, errores } = await plataformaLimpia();
  await retrasa(p, '**/js/cotizador/arranque.js', 1500);
  await p.evaluate(() => { location.hash = '#/cotizador'; });
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const c = document.querySelector('.pf-marco-caja'), m = document.getElementById('pf-cot-marco');
    let dentro = null; try { dentro = m.contentDocument.documentElement.className; } catch (_) {}
    return { cargando: !!(c && c.classList.contains('pf-marco-cargando')), esq: !!(c && c.querySelector('.pf-marco-esq')),
             opMarco: m ? getComputedStyle(m).opacity : null, txt: ((c && c.querySelector('.pf-marco-esq-t')) || {}).textContent, dentro };
  });
  cierto(r.cargando && r.esq && r.opMarco === '0', 'a los 700 ms la caja sigue cargando: silueta visible, iframe en opacidad 0, «' + (r.txt || '').trim() + '»');
  cierto(/arrancando/.test(r.dentro || ''), 'y el documento de dentro todavía lleva html.arrancando: una sola pantalla de carga, la de afuera');
  await captura(p, '04-marco-cotizador');
  await p.waitForFunction(() => { const c = document.querySelector('.pf-marco-caja'); return c && c.classList.contains('pf-marco-listo'); }, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  const fin = await p.evaluate(() => {
    const c = document.querySelector('.pf-marco-caja'), m = document.getElementById('pf-cot-marco');
    let dentro = null; try { const d = m.contentDocument; dentro = { cls: d.documentElement.className, arr: !!d.getElementById('arranque'), folio: (d.getElementById('folio') || {}).textContent }; } catch (_) {}
    return { esq: !!c.querySelector('.pf-marco-esq'), op: getComputedStyle(m).opacity, dentro };
  });
  cierto(!fin.esq && fin.op === '1', 'cuando init() terminó: silueta fuera del árbol, iframe en opacidad 1');
  cierto(fin.dentro && !/arrancando/.test(fin.dentro.cls) && !fin.dentro.arr && /COT-/.test(fin.dentro.folio || ''),
    'y dentro: sin arrancando, sin #arranque, folio «' + (fin.dentro && fin.dentro.folio) + '»');
  cierto(errores.length === 0, 'cero errores de página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

console.log('\nEL MARCO DEL ANIDADOR (MESA DE CORTE)');
{
  const { ctx, p, errores } = await plataformaLimpia();
  await retrasa(p, '**/anidador-vectores/js/app.js', 1500);
  await p.click('#mod-tablero button:has-text("Mesa de corte")');
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => { const c = document.querySelector('.pf-marco-caja'); return { cargando: !!(c && c.classList.contains('pf-marco-cargando')), txt: ((c && c.querySelector('.pf-marco-esq-t')) || {}).textContent }; });
  cierto(r.cargando, 'a los 700 ms la mesa de corte enseña su silueta: «' + (r.txt || '').trim() + '»');
  await captura(p, '05-marco-anidador');
  await p.waitForFunction(() => { const c = document.querySelector('.pf-marco-caja'); return c && c.classList.contains('pf-marco-listo'); }, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  cierto(await p.evaluate(() => { const c = document.querySelector('.pf-marco-caja'); return !c.querySelector('.pf-marco-esq') && getComputedStyle(document.getElementById('pf-anid-marco')).opacity === '1'; }),
    'y al cargar el motor, el marco se ve y la silueta se fue');
  cierto(errores.length === 0, 'cero errores de página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

console.log('\nLAS DOS PÁGINAS SUELTAS');
/* La señal de «ya arrancó» tiene que ser AJENA al esqueleto —si no, la prueba esperaría a que
   la clase se fuera para comprobar que la clase se fue—. En el cotizador es que exista init(),
   que declara el guion retrasado y corre al final de ese mismo archivo; en el anidador, el
   objeto Anidador que publica la última línea de su arranque. El folio NO sirve: «COT-0001»
   está en el marcado fijo desde antes de que corra nada. */
for (const [nombre, url, guion, listo] of [
  ['cotizador.html', '/cotizador.html?solo=1', '**/js/cotizador/arranque.js', () => typeof window.init === 'function'],
  ['el anidador', '/anidador-vectores/', '**/anidador-vectores/js/app.js', () => !!window.Anidador],
]) {
  const { ctx, p, errores } = await nuevo();
  await retrasa(p, guion, 1500);
  /* `commit` y no `domcontentloaded`: son guiones clásicos al final del body, así que el
     analizador se detiene en el retrasado y DOMContentLoaded no llega hasta que corre. Lo que
     se quiere ver es justo ESE rato —el marcado ya está, los datos no— y hay que asomarse
     antes. */
  await p.goto(B + url, { waitUntil: 'commit' });
  let r = null;
  for (let i = 0; i < 30 && !(r && r.h && r.arranque && r.oculto); i++) {
    await p.waitForTimeout(50);
    r = await p.evaluate(() => {
      const a = document.querySelector('.arranque'), w = document.querySelector('.wrap,.an-wrap');
      return { h: document.documentElement.classList.contains('arrancando'),
               arranque: a ? getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().height > 100 : false,
               oculto: w ? getComputedStyle(w).visibility === 'hidden' : null };
    }).catch(() => null);
  }
  cierto(r && r.h && r.arranque && r.oculto, nombre + ': mientras baja el arranque se ve el esqueleto y el marcado sin datos está oculto' + (r && !(r.h && r.arranque && r.oculto) ? ' — ' + JSON.stringify(r) : ''));
  await captura(p, '06-' + nombre.replace(/[^a-z]/g, '') + '-arrancando');
  await p.waitForFunction(listo, null, { timeout: 30000 });
  await p.waitForTimeout(100);
  const fin = await p.evaluate(() => ({ h: document.documentElement.classList.contains('arrancando'), a: !!document.querySelector('.arranque'),
                                        wrap: getComputedStyle(document.querySelector('.wrap,.an-wrap')).visibility }));
  cierto(!fin.h && !fin.a && fin.wrap === 'visible', nombre + ': al terminar el arranque, todo a la vista y el esqueleto fuera del árbol');
  cierto(errores.length === 0, nombre + ': cero errores de página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

console.log('\nLA SALIDA DE EMERGENCIA: UN GUION QUE NO LLEGA');
{
  const { ctx, p } = await nuevo();
  await p.route('**/js/cotizador/nucleo.js', r => r.abort());
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => ({ h: document.documentElement.classList.contains('arrancando'), wrap: getComputedStyle(document.querySelector('.wrap')).visibility }));
  cierto(!r.h && r.wrap === 'visible', 'con nucleo.js bloqueado, init() revienta y el primer error quita el esqueleto: la página se enseña igual, sin esperar los 8 s');
  await ctx.close();
}

console.log(fallos ? '\n' + fallos + ' fallo(s) en las pantallas de carga.'
                   : '\nNada cuando es rápido, la silueta cuando no, y una salida si se atora.');
await nav.close();
process.exit(fallos ? 1 : 0);
