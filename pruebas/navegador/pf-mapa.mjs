/* EL MAPA CON LAS PIEZAS COMPARTIDAS, EN UN NAVEGADOR DE VERDAD Y CON LEAFLET DE VERDAD.
 *
 * Lo que se defiende, y por qué (cada punto trae el ID de su ficha del paquete de UI):
 *
 *   · LA SILUETA (F16). Mientras el módulo llega, el router enseña la silueta del mapa con su
 *     `aria-busy` y su texto de estado, el módulo no pinta un segundo «cargando» encima, y la
 *     silueta mide lo mismo que el lienzo que la reemplaza (si no, lo de abajo salta).
 *   · LAS CUENTAS RUEDAN (F23). La cifra que cambia al filtrar rueda UNA vez; la que no cambió y
 *     el primer pintado no ruedan. El texto es el final desde el primer cuadro.
 *   · LOS PINES ENTRAN Y SALEN (F33). Apagar una etapa encoge los pines que se van y deja los que
 *     se quedan EXACTAMENTE como estaban (el mismo nodo: ya no se vacía la capa); encenderla los
 *     hace crecer. Sin movimiento, cambian en el acto.
 *   · LA RUTA SE DIBUJA Y SE NUMERA (F25). Al ordenarla, la línea se traza una sola vez en ~800 ms y
 *     cada pin cambia el dibujo de su estatus por su número cuando la línea llega a él; al terminar vuelve el
 *     punteado. Ni el zoom ni un filtro la repiten. Sin movimiento aparece entera.
 *   · LAS PARADAS, EN TARJETAS (F12). En el teléfono, la ruta ordenada trae una tira encima de la
 *     hoja: deslizar a la siguiente lleva el mapa a esa parada y marca su pin; tocar un pin lleva la
 *     tira a su tarjeta; tocar una tarjeta abre la ficha de esa obra; el tabulador recorre las
 *     tarjetas como el dedo, sin abrir fichas. No tapa el crédito de OpenStreetMap ni los botones
 *     redondos, sus botones miden 44 px, la nota de la salida supuesta sigue a la vista y la lista
 *     se queda para la computadora.
 *   · EL PIN A MANO CON RETÍCULA (F9). Una cruz fija al centro del lienzo, sin recibir toques y sin
 *     tapar los controles; el mapa se mueve debajo; «Guardar aquí» guarda EL CENTRO (se mide contra
 *     las posiciones en pantalla de pines de coordenada conocida); tocar salta cerca; nada se guarda
 *     sin ese botón; con teclado las flechas mueven el mapa.
 *   · LA ACCIÓN DE LA RUTA (F29). Desde el mapa tipo Google Maps (2026-10-09) ya no hay barra fija
 *     del teléfono: «Ordenar la ruta de hoy (n)» vive al principio de la hoja, a la vista con la
 *     hoja abajo y sin que el dock la tape, y su cuenta sube cuando una obra de hoy recibe pin.
 *   · «COPIAR DIRECCIÓN» (F31). El botón se vuelve palomita y dice «Copiada» y regresa; el aviso de
 *     abajo se queda.
 *
 * Cada ronda corre a 360 o 420 px (y una a 1280, con ratón y teclado), con y sin movimiento reducido,
 * en claro y en oscuro; siempre sin errores de página, sin desborde de lado y sin nada moviéndose en
 * reposo. Los mapas no bajan cuadros (las peticiones de fuera se cortan): lo que se mide es la
 * geometría, no el dibujo de las calles.
 *
 * Necesita navegador y servidor:  PUERTO=8814 node pruebas/navegador/pf-mapa.mjs
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

/* Las obras de la prueba. Cinco con pin (las cuatro etapas y dos días) y tres sin él. Los de «hoy» son
   los que entran en la ruta; el de dentro de cinco días solo se ve con el rango en «Todo». Las
   coordenadas son reales de Guadalajara y están separadas lo bastante para que la línea de la ruta
   mida cientos de píxeles a cualquier zoom. */
const OBRAS = [
  { clave: 'hea', cliente: 'Healthylicious', etapa: 'ganado',    lat: 20.6736, lng: -103.3440, dia: 0, hora: '09:00', estatus: 'FABRICACION' },
  { clave: 'per', cliente: 'La Perla',       etapa: 'en_diseno', lat: 20.6597, lng: -103.3496, dia: 0, hora: '10:30', estatus: 'FABRICACION' },
  { clave: 'gym', cliente: 'Gym Titanio',    etapa: 'listo',     lat: 20.6890, lng: -103.3300, dia: 0, hora: '12:00', estatus: 'COBRANDO' },
  { clave: 'den', cliente: 'Dental Sonrisa', etapa: 'instalado', lat: 20.6500, lng: -103.4000, dia: 0, hora: null, estatus: 'LIQUIDADO' },
  { clave: 'far', cliente: 'Farmacia Guadalupe', etapa: 'listo', lat: 20.7000, lng: -103.3800, dia: 5, hora: '11:00', estatus: 'COBRANDO' },
  { clave: 'sp1', cliente: 'Sin pin uno',    etapa: 'ganado',    lat: null, lng: null, dia: 0, hora: '16:00' },
  { clave: 'sp2', cliente: 'Sin pin dos',    etapa: 'ganado',    lat: null, lng: null, dia: null, hora: null },
  { clave: 'sp3', cliente: 'Sin pin tres',   etapa: 'ganado',    lat: null, lng: null, dia: null, hora: null },
];
const CON_PIN = OBRAS.filter(o => o.lat !== null);

/* ------------------------------------------------------------------------------------------
   Abrir la plataforma. Un contexto por ronda, con el tema, el rol y el movimiento pedidos. Un
   vigilante del DOM, puesto ANTES de que corra la página, anota lo que pasa mientras el mapa
   carga aunque dure un cuadro: la silueta del router y su alto, y cualquier «Leyendo…» o reloj
   que el módulo pusiera.
   ------------------------------------------------------------------------------------------ */
async function abrir({ ancho = 360, alto = 740, tema = 'claro', reducido = false, tactil = true, retraso = 0 } = {}) {
  const movil = ancho < 760;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, hasTouch: tactil, isMobile: movil && tactil, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block', reducedMotion: reducido ? 'reduce' : 'no-preference',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  await ctx.addInitScript(t => {
    try {
      localStorage.setItem('al3d_tema', t);
      localStorage.setItem('al3d_pf_rol', 'direccion');
      localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
    } catch (_) {}
    window.__mp = { esq: false, busy: false, esqTexto: '', esqAlto: 0, vacio: '' };
    const mirar = () => {
      const s = document.getElementById('mod-mapa');
      if (s) {
        const e = document.querySelector('.pf-esqueleto[data-mod="mapa"]');
        if (e) {
          __mp.esq = true; __mp.busy = e.getAttribute('aria-busy') === 'true'; __mp.esqTexto = e.textContent.replace(/\s+/g, ' ').trim();
          const m = e.querySelector('.esq-mapa'); if (m) __mp.esqAlto = Math.round(m.getBoundingClientRect().height);
        }
        const v = s.querySelector('.vacio');
        if (v && /Leyendo|Cargando/.test(v.textContent)) __mp.vacio = v.textContent.trim();
      }
    };
    const arrancar = () => new MutationObserver(mirar).observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) arrancar();
    else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); arrancar(); } }).observe(document, { childList: true });
  }, tema);
  if (retraso) await ctx.route(/\/js\/mod\/mapa\.js/, async r => { await dormir(retraso); await r.continue(); });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await p.goto(B + '/#/tablero', { waitUntil: 'load' });
  await p.waitForFunction(() => !document.getElementById('pf-arranque'), null, { timeout: 30000 });
  await p.waitForTimeout(400);
  return { ctx, p, errores };
}

/* Lo que el mapa necesita para tener algo que mostrar, por la capa de datos (lo que usa la
   pantalla). Devuelve el id de cada obra por su clave. */
const sembrar = p => p.evaluate(async obras => {
  const Proy = await import('/js/datos/proyectos.js');
  const Agenda = await import('/js/datos/agenda.js');
  const letras = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, altura: 40, n: 8 };
  const dia = n => { const d = new Date(Date.now() + n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const ids = {}, fallas = [];
  let k = 9100;
  for (const o of obras) {
    const r = await Proy.ganar({ folio: 'COT-' + (++k), cliente: o.cliente, proy: o.cliente + ' — anuncio', ts: Date.now(),
      estado: 'autorizada', items: [letras], neto: 15000, itemsAuth: { 1: 15000 } }, {});
    if (!r.ok) { fallas.push(o.clave + ': ' + r.mensaje); continue; }
    const id = r.valor.id;
    ids[o.clave] = id;
    if (o.etapa !== 'ganado') await Proy.avanzarEtapa(id, o.etapa);
    const par = { dir_texto: 'Av. Prueba 123\ncolonia Centro' };
    if (o.lat !== null) { par.lat = o.lat; par.lng = o.lng; par.geo_fuente = 'manual'; }
    /* Los pines se pintan por el estatus de cobro de la hoja: «cobrando» son los dos que antes
       eran «listo», así que los filtros de abajo quitan y ponen los mismos dos pines. */
    if (o.estatus) par.estatus_notion = o.estatus;
    const a = await Proy.actualizar(id, par);
    if (!a.ok) fallas.push(o.clave + ' actualizar: ' + a.mensaje);
    if (o.dia !== null) {
      const g = await Agenda.agendar(id, { fecha: dia(o.dia), hora: o.hora });
      if (!g.ok) fallas.push(o.clave + ' agendar: ' + g.mensaje);
    }
  }
  return { ids, fallas };
}, OBRAS);

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

const mapaListo = p => p.waitForFunction(() => {
  const s = document.getElementById('mod-mapa');
  const barra = document.getElementById('pf-progreso');
  /* La barrita de tres píxeles de arriba (el progreso de la navegación) termina su salida un instante
     después de que el mapa se pinta, y mientras tanto asoma 2 px por la derecha: no es del mapa. */
  return s && !s.hidden && s.querySelector('#mapa-lienzo .leaflet-marker-icon') && !s.querySelector('.pf-esqueleto') &&
    !document.getElementById('pf-arranque') && !(barra && (barra.classList.contains('on') || barra.classList.contains('fin')));
}, null, { timeout: 30000 }).then(() => p.waitForTimeout(600));

const sinDesborde = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/* El desborde se mide EN REPOSO. Los primeros 350 ms tras entrar a una pantalla la sección se está
   deslizando 24 px (el movimiento de entrada del router, que no es de esta pantalla) y el documento
   mide 2 px de más; si el equipo anda lento esa entrada tarda más. Se espera a que asiente y se
   mide lo que queda. */
const sinDesbordeEnReposo = async (p, ms = 3500) => {
  const t0 = Date.now();
  for (;;) {
    if (await sinDesborde(p)) return true;
    if (Date.now() - t0 > ms) return false;
    await dormir(100);
  }
};
/* Quién se sale por la derecha, para que el fallo diga dónde mirar. */
const quienDesborda = p => p.evaluate(() => {
  const w = document.documentElement.clientWidth, fuera = [];
  document.querySelectorAll('body *').forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.right > w + 1) fuera.push(e.tagName.toLowerCase() + '.' + (typeof e.className === 'string' ? e.className : '') + ' → ' + Math.round(r.right));
  });
  return { scrollWidth: document.documentElement.scrollWidth, clientWidth: w, fuera: fuera.slice(0, 8) };
});
/* Animaciones que no acaban, EN REPOSO. El botón de la IA es la única pieza que se mueve sola. */
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity)
  .filter(a => { const t = a.effect.target; return !(t && t.closest && t.closest('.pf-ia-btn')); })
  .map(a => (a.animationName || a.transitionProperty || '?') + ' en ' + ((a.effect.target && (a.effect.target.className && a.effect.target.className.baseVal === undefined ? a.effect.target.className : '')) || '?')));
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

/* Las cajas en pantalla de lo que se compara en varias secciones. */
const caja = (p, sel) => p.evaluate(s => {
  const e = document.querySelector(s);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}, sel);
const seCruzan = (a, b) => !!a && !!b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

/* El punto de pantalla que ES la coordenada de un pin: su ancla, no el centro de su caja. La gota
   tiene el ancla en la punta (32 px de 34; 40 de 43 el elegido), y Leaflet la pone con un margen
   negativo igual al ancla, así que la punta está en la esquina de la caja menos ese margen. Con el
   centro de la caja el ajuste quedaba 15 px corrido hacia arriba —0.005° de latitud a zoom 12—, y
   «lo que se guardó» parecía otro lugar que «lo que está bajo la cruz» aunque fueran el mismo. */
const puntaDe = (p, cliente) => p.evaluate(s => {
  const e = document.querySelector(s);
  if (!e) return null;
  const r = e.getBoundingClientRect(), st = getComputedStyle(e);
  return { cx: r.left - (parseFloat(st.marginLeft) || 0), cy: r.top - (parseFloat(st.marginTop) || 0) };
}, '.leaflet-marker-icon.mapa-pin[title*="' + cliente + '"]');

/* Del par (longitud, latitud) a píxeles de pantalla, y de vuelta, ajustado con los pines de
   coordenada conocida. Dentro de una ciudad la proyección es una escala y un corrimiento por eje
   (la latitud en Mercator), y se resuelve por mínimos cuadrados con TODOS los pines con pin: es la
   forma de saber, sin tocar el interior de Leaflet, qué coordenada hay bajo un píxel. */
async function ajusteDePantalla(p) {
  const pts = [];
  for (const o of CON_PIN) {
    const c = await puntaDe(p, o.cliente);
    if (c) pts.push({ lat: o.lat, lng: o.lng, x: c.cx, y: c.cy });
  }
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const reg = (xs, ys) => {
    const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const b = sxy / sxx; return { a: my - b * mx, b };
  };
  const ex = reg(pts.map(q => q.lng), pts.map(q => q.x));
  const ey = reg(pts.map(q => merc(q.lat)), pts.map(q => q.y));
  const imerc = m => (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180 / Math.PI;
  return {
    n: pts.length,
    coordDe: (x, y) => ({ lng: (x - ex.a) / ex.b, lat: imerc((y - ey.a) / ey.b) }),
    pxPorGrado: Math.abs(ex.b),
  };
}

/* Un deslizamiento de verdad con el dedo, por el protocolo del navegador: eventos táctiles
   crudos, que el navegador convierte en un gesto (y el scroll-snap hace su trabajo). */
async function deslizar(cdp, de, a, pasos = 10, ms = 220) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de.x, y: de.y }] });
  for (let i = 1; i <= pasos; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de.x + (a.x - de.x) * i / pasos, y: de.y + (a.y - de.y) * i / pasos }] });
    await dormir(ms / pasos);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/* ------------------------------------------------------------------------------------------
   Una ronda: toda la pantalla, con el tema, el ancho, el movimiento y el dispositivo de entrada
   que se pidan.
   ------------------------------------------------------------------------------------------ */
async function ronda(cfg) {
  const nombre = cfg.ancho + ' px · ' + cfg.tema + ' · ' + (cfg.reducido ? 'menos movimiento' : 'con movimiento') +
    ' · ' + (cfg.tactil ? 'dedo' : 'ratón y teclado');
  console.log('\n' + nombre.toUpperCase());
  const movil = cfg.ancho < 760;
  const { ctx, p, errores } = await abrir(cfg);
  const cdp = await ctx.newCDPSession(p);
  const toca = async sel => {
    if (cfg.tactil) await p.tap(sel, { timeout: 5000 }); else await p.click(sel, { timeout: 5000 });
  };
  /* Para lo que se mide en el MISMO cuadro del toque: el clic sale de la página, no de la mano. */
  const clic = sel => p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel);
  const seccion = async (titulo, fn) => {
    console.log(' · ' + titulo);
    try { await fn(); } catch (e) {
      mal(titulo + ': la sección se rompió', String(e && e.message || e).split('\n')[0]);
      for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(200); }
    }
  };
  const pinesVisibles = () => p.evaluate(() => [...document.querySelectorAll('#mapa-lienzo .leaflet-marker-icon.mapa-pin:not(.mano)')].length);
  const cuenta = clave => p.evaluate(c => { const b = document.querySelector('#mapa-cuentas b[data-cuenta="' + c + '"]'); return b ? b.textContent.trim() : null; }, clave);

  const sem = await sembrar(p);
  cierto(!sem.fallas.length && Object.keys(sem.ids).length === OBRAS.length, 'datos de prueba sembrados', sem);
  const ids = sem.ids;

  /* Con el módulo retrasado, para ver la silueta del router (F16). */
  await seccion('F16 · la silueta del router, sin segundo «cargando»', async () => {
    /* Otro contexto, con el archivo del módulo retrasado: así el router tiene tiempo de enseñar su
       silueta. Cada contexto tiene su propia base, así que se siembra en él. */
    const r2 = await abrir({ ...cfg, retraso: 900 });
    await sembrar(r2.p);
    await r2.p.evaluate(() => { location.hash = '#/mapa'; });
    await mapaListo(r2.p);
    const v = await r2.p.evaluate(() => ({ ...window.__mp }));
    cierto(v.esq && v.busy, 'el router enseñó la silueta del mapa con aria-busy', v);
    cierto(/Cargando Mapa/.test(v.esqTexto), 'con su texto de estado', v.esqTexto);
    cierto(!v.vacio, 'el módulo no puso un segundo «cargando» encima', v.vacio);
    /* Contra la caja del mapa y no contra el lienzo: en la computadora la caja lleva un borde de
       1 px y el lienzo va por dentro, así que el lienzo mide 2 px menos que lo que ocupa la
       pantalla. Lo que no debe saltar es lo de abajo, y eso lo decide la caja. */
    const alto = await r2.p.evaluate(() => Math.round(document.getElementById('mapa-app').getBoundingClientRect().height));
    cierto(Math.abs(alto - v.esqAlto) <= 1, 'la silueta mide lo mismo que la caja del mapa (' + v.esqAlto + ' = ' + alto + ')', { alto, esq: v.esqAlto });
    cierto(r2.errores.length === 0, 'sin errores de página', r2.errores);
    await r2.ctx.close();
  });

  await p.goto(B + '/#/mapa', { waitUntil: 'load' });
  await mapaListo(p);

  await seccion('el mapa monta', async () => {
    cierto((await pinesVisibles()) === CON_PIN.length, 'cada obra con pin tiene su pin (' + CON_PIN.length + ')', await pinesVisibles());
    cierto(await sinDesbordeEnReposo(p), 'sin desborde de lado', await quienDesborda(p));
    cierto(!(await p.evaluate(() => document.querySelector('.mapa-reticula'))), 'sin retícula mientras no se pone ningún pin');
    cierto((await p.evaluate(() => document.getElementById('mapa-tira').hidden)), 'sin tira mientras la ruta no está ordenada');
  });

  /* ---------- F29 · la acción de la ruta, en la hoja ---------- */
  /* Antes era una barra fija del teléfono (#pf-mbar) con su animación de entrada. Desde el mapa a
     pantalla completa la acción es UNA, al principio de la hoja, que es donde el pulgar ya está:
     lo que se defiende ahora es que esté, que diga cuántas paradas son y que se pueda tocar con la
     hoja abajo (el dock de módulos flota encima y no debe taparla). */
  const accionRuta = () => p.evaluate(() => {
    const b = document.querySelector('#mapa-acc [data-ruta]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const bajo = y < innerHeight && x < innerWidth ? document.elementFromPoint(x, y) : null;
    return { texto: b.textContent.replace(/\s+/g, ' ').trim(), cual: b.dataset.ruta, alto: Math.round(r.height),
      aLaVista: r.top >= 0 && r.bottom <= innerHeight + 0.5, libre: !!bajo && !!bajo.closest('[data-ruta]') };
  });
  await seccion('F29 · «Ordenar la ruta de hoy» vive en la hoja, a la vista', async () => {
    const b = await accionRuta();
    cierto(b && b.cual === 'calcular' && /Ordenar la ruta de hoy \(4\)/.test(b.texto), 'la hoja dice «Ordenar la ruta de hoy (4)»', b);
    cierto(b && b.aLaVista && b.libre, 'con la hoja abajo se ve entero y nada lo tapa', b);
    cierto(b && b.alto >= 44, 'mide 44 px o más de alto', b);
    cierto(await p.evaluate(() => !document.querySelector('#pf-mbar [data-ruta]')), 'ya no hay una segunda copia en una barra fija');
  });

  /* ---------- F23 · las cuentas ruedan ---------- */
  await seccion('F23 · las cuentas ruedan cuando cambian', async () => {
    const antes = { pines: await cuenta('pines'), hoy: await cuenta('hoy'), sin: await cuenta('sinubicar') };
    cierto(antes.pines === '5' && antes.hoy === '4' && antes.sin === '3', 'las tres cuentas dicen lo que son', antes);
    cierto(await p.evaluate(() => !document.querySelector('#mapa-cuentas .rueda-rodando')), 'el primer pintado no rueda');
    /* Un filtro que quita dos pines: «en el mapa» pasa de 5 a 3; las otras dos no cambian. */
    const r = await p.evaluate(() => {
      document.querySelector('#mapa-etapas [data-g="cobrando"]').click();
      const rueda = c => !!document.querySelector('#mapa-cuentas b[data-cuenta="' + c + '"].rueda-rodando');
      return { texto: document.querySelector('#mapa-cuentas b[data-cuenta="pines"]').textContent.trim(),
        pines: rueda('pines'), hoy: rueda('hoy'), sin: rueda('sinubicar') };
    });
    cierto(r.texto === '3', 'el texto es el final desde el primer cuadro', r);
    if (cfg.reducido) cierto(!r.pines, 'con menos movimiento no rueda', r);
    else cierto(r.pines, 'la cifra que cambió rueda', r);
    cierto(!r.hoy && !r.sin, 'las que no cambiaron no se tocan', r);
    await dormir(900);
    cierto(await p.evaluate(() => !document.querySelector('#mapa-cuentas .rueda-rodando')), 'y deja de rodar al terminar');
    await clic('#mapa-etapas [data-g="cobrando"]');   // se devuelve
    await dormir(700);
  });

  /* ---------- F33 · los pines entran y salen al filtrar ---------- */
  await seccion('F33 · los pines entran y salen al filtrar', async () => {
    /* Se marca el nodo de un pin que se queda: si el filtro vaciara la capa, la marca se perdería. */
    await p.evaluate(() => { for (const e of document.querySelectorAll('#mapa-lienzo .leaflet-marker-icon.mapa-pin')) e.__estaba = true; });
    const r = await p.evaluate(() => {
      const chip = document.querySelector('#mapa-etapas [data-g="cobrando"]');
      chip.click();
      const pinAnims = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('mapa-pin'));
      return { anims: pinAnims.length, duracion: pinAnims[0] ? pinAnims[0].effect.getComputedTiming().duration : 0,
        aun: document.querySelectorAll('#mapa-lienzo .leaflet-marker-icon.mapa-pin').length };
    });
    if (cfg.reducido) {
      cierto(r.anims === 0 && r.aun === 3, 'con menos movimiento los pines se quitan en el acto, sin animación', r);
    } else {
      cierto(r.anims === 2 && r.duracion === 160, 'los dos pines que se van se encogen en 160 ms', r);
      cierto(r.aun === 5, 'y siguen en el mapa mientras se encogen', r);
      await dormir(450);
    }
    const tras = await p.evaluate(() => ({
      n: document.querySelectorAll('#mapa-lienzo .leaflet-marker-icon.mapa-pin').length,
      iguales: [...document.querySelectorAll('#mapa-lienzo .leaflet-marker-icon.mapa-pin')].every(e => e.__estaba === true),
    }));
    cierto(tras.n === 3, 'al terminar quedan los tres que pasan el filtro', tras);
    cierto(tras.iguales, 'los que se quedan son los MISMOS nodos (la capa no se vació)', tras);
    /* Vuelven. */
    const v = await p.evaluate(() => {
      document.querySelector('#mapa-etapas [data-g="cobrando"]').click();
      const a = document.getAnimations().filter(x => x.effect && x.effect.target && x.effect.target.classList && x.effect.target.classList.contains('mapa-pin'));
      return { anims: a.length, n: document.querySelectorAll('#mapa-lienzo .leaflet-marker-icon.mapa-pin').length,
        cuales: a.map(x => (x.transitionProperty || x.animationName || x.constructor.name) + ' ' + x.effect.getComputedTiming().duration) };
    });
    if (cfg.reducido) cierto(v.anims === 0 && v.n === 5, 'con menos movimiento llegan en el acto', v);
    else cierto(v.anims === 2 && v.n === 5, 'los dos que llegan crecen', v);
    await dormir(450);
    cierto((await pinesVisibles()) === 5, 'y todo vuelve a su sitio');
    /* MARCAS al día: «Ver en el mapa» (volarA) sigue encontrando un pin recién vuelto. Se prueba más abajo. */
  });

  /* ---------- F9 · el pin a mano con retícula fija ---------- */
  const dbObra = id => p.evaluate(async i => { const o = await (await import('/js/datos/db.js')).obtener('proyectos', i); return o ? { lat: o.lat, lng: o.lng, fuente: o.geo_fuente } : null; }, id);
  /* Leaflet ignora el dedo mientras acerca (250 ms de animación): se espera a que termine, o el arrastre
     que sigue no mueve nada y la prueba parece fallar por un motivo que no es del mapa. Desde que el
     mapa va a pantalla completa no lleva botones +/−: se acerca con la tecla, con el lienzo enfocado,
     que es lo mismo que hace quien no puede pellizcar. */
  const acercar = async n => {
    for (let i = 0; i < n; i++) {
      await p.focus('#mapa-lienzo');
      await p.keyboard.press('NumpadAdd');
      await dormir(150);
      await hasta(p, () => !document.querySelector('#mapa-lienzo.leaflet-zoom-anim'), null, 3000);
      await dormir(250);
    }
  };
  const arrastrarMapa = async (dx, dy) => {
    const lz = await caja(p, '#mapa-lienzo');
    const de = { x: lz.cx + 20, y: lz.cy - 30 }, a = { x: de.x + dx, y: de.y + dy };
    if (cfg.tactil) await deslizar(cdp, de, a, 8, 200);
    else { await p.mouse.move(de.x, de.y); await p.mouse.down(); await p.mouse.move(a.x, a.y, { steps: 8 }); await p.mouse.up(); }
    await dormir(cfg.reducido ? 600 : 1000);
  };
  const guardaHabilitado = () => p.evaluate(() => { const b = document.querySelector('[data-mano-ok]'); return !!b && !b.disabled; });
  const hastaGuardado = async id => { for (let i = 0; i < 40; i++) { const o = await dbObra(id); if (o && o.lat != null) return o; await dormir(100); } return dbObra(id); };

  /* Para llegar a «Pin a mano» o «Pegar link» de una obra sin pin se hace lo que haría la mano:
     cerrar la ficha que haya quedado abierta (guardar un pin abre la de esa obra, y la ficha
     esconde la lista) y tocar «n sin ubicar», que sube la hoja y la lleva a esa lista. */
  const cerrarFichaSiHay = async () => {
    if (await p.evaluate(() => !!document.querySelector('#mapa-ficha:not([hidden]) [data-cerrar-ficha]'))) {
      await toca('#mapa-ficha [data-cerrar-ficha]');
      await dormir(cfg.reducido ? 300 : 600);
    }
  };
  const aLosSinUbicar = async () => {
    await cerrarFichaSiHay();
    await toca('[data-ver-faltan]');
    await dormir(cfg.reducido ? 400 : 900);
  };

  await seccion('F9 · el pin a mano: la cruz queda fija y se mueve el mapa', async () => {
    await aLosSinUbicar();
    await toca('[data-mano="' + ids.sp1 + '"]');
    await dormir(800);
    const ret = await caja(p, '#mapa-lienzo .mapa-reticula'), lz = await caja(p, '#mapa-lienzo');
    cierto(!!ret, 'aparece la retícula dentro del lienzo');
    cierto(ret && Math.abs(ret.cx - lz.cx) <= 1.5 && Math.abs(ret.cy - lz.cy) <= 1.5, 'queda en el centro del lienzo', { ret, lz });
    const prop = await p.evaluate(() => {
      const r = document.querySelector('.mapa-reticula'), s = getComputedStyle(r), b = r.getBoundingClientRect();
      const bajo = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const rgb = c => c.match(/[\d.]+/g).map(Number);
      const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      const lum = c => .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]);
      const t = document.createElement('i'); t.style.cssText = 'position:absolute;visibility:hidden;color:var(--sup)'; document.body.appendChild(t);
      const sup = rgb(getComputedStyle(t).color); t.remove();
      const a = lum(rgb(s.color)), c = lum(sup);
      return { pe: s.pointerEvents, z: s.zIndex, bajoLibre: !!bajo && !bajo.closest('.mapa-reticula'), esquinas: r.querySelectorAll('i').length,
        aria: r.getAttribute('aria-hidden'), contorno: /drop-shadow/.test(s.filter),
        razon: Math.round((Math.max(a, c) + .05) / (Math.min(a, c) + .05) * 100) / 100 };
    });
    cierto(prop.pe === 'none', 'no recibe toques: el mapa de abajo sigue siendo el que se arrastra', prop);
    cierto(prop.bajoLibre, 'el punto bajo la cruz es del mapa, no de la cruz', prop);
    cierto(prop.esquinas === 4 && prop.aria === 'true', 'son cuatro esquinas, calladas para el lector de pantalla', prop);
    cierto(prop.contorno && prop.razon >= 4.5, 'lleva contorno de la superficie del tema y contraste suficiente (' + prop.razon + ':1)', prop);
    cierto(Number(prop.z) > 400 && Number(prop.z) < 800, 'por encima de los paneles del mapa (400) y por debajo de sus controles (800)', prop);
    /* Los controles del mapa ya no son los de Leaflet: son los botones redondos de la derecha. */
    const fabs = await caja(p, '#mapa-fabs'), cred = await caja(p, '.leaflet-control-attribution');
    cierto(!!fabs && !seCruzan(ret, fabs) && !seCruzan(ret, cred), 'no tapa los botones redondos del mapa ni el crédito', { ret, fabs, cred });
    const modo = await p.evaluate(() => document.getElementById('mapa-modo').textContent.replace(/\s+/g, ' ').trim());
    cierto(/Mueve el mapa hasta que la cruz quede en la entrada de/.test(modo), 'la barra dice qué hacer (' + modo.slice(0, 70) + '…)', modo);
    cierto(!(await guardaHabilitado()), '«Guardar aquí» empieza apagado: el centro de un mapa recién abierto no es un dato');
    cierto(!(await p.evaluate(() => document.querySelector('#mapa-lienzo .leaflet-marker-icon.mano'))), 'ya no hay un pin de 26 px que arrastrar');
    cierto(await sinDesbordeEnReposo(p), 'sin desborde de lado con el modo puesto', await quienDesborda(p));

    await acercar(3);
    await arrastrarMapa(-70, 55);
    cierto(await guardaHabilitado(), 'al mover el mapa se enciende «Guardar aquí»');
    cierto((await dbObra(ids.sp1)).lat == null, 'y mientras no se toque, NADA se guardó');
    const aj = await ajusteDePantalla(p);
    const r2 = await caja(p, '#mapa-lienzo .mapa-reticula'), lz2 = await caja(p, '#mapa-lienzo');
    cierto(aj.n >= 4 && Math.abs(r2.cx - lz2.cx) <= 1.5 && Math.abs(r2.cy - lz2.cy) <= 1.5, 'la cruz no se movió: se movió el mapa', { n: aj.n, r2, lz2 });
    const esperado = aj.coordDe(r2.cx, r2.cy);
    await toca('[data-mano-ok]');
    const g = await hastaGuardado(ids.sp1);
    cierto(g.lat != null && Math.abs(g.lat - esperado.lat) < 1e-4 && Math.abs(g.lng - esperado.lng) < 1e-4 && g.fuente === 'manual',
      '«Guardar aquí» guardó el CENTRO del mapa (a menos de 10 m de donde estaba la cruz)', { g, esperado });
    await dormir(cfg.reducido ? 700 : 1500);
    cierto(!(await p.evaluate(() => document.querySelector('.mapa-reticula'))), 'al guardar la retícula se va');
    cierto(await p.evaluate(() => !!document.querySelector('.leaflet-marker-icon.mapa-pin[title*="Sin pin uno"]')), 'y la obra ya tiene su pin');
    /* Desde que el mapa es tipo Google Maps, llegar a una obra abre su ficha en la hoja, no un globo. */
    const ficha = await p.evaluate(() => (document.querySelector('.mapa-ficha-t') || {}).textContent || '');
    cierto(/Sin pin uno/.test(ficha), 'el mapa llegó a él y abrió su ficha', ficha.slice(0, 40));
    cierto((await cuenta('sinubicar')) === '2', 'y «sin ubicar» baja a 2', await cuenta('sinubicar'));
  });

  await seccion('F29 · al ponerle pin a una obra de hoy la cuenta de la ruta sube', async () => {
    const b = await accionRuta();
    cierto(b && /Ordenar la ruta de hoy \(5\)/.test(b.texto), 'la acción pasó de (4) a (5)', b);
  });

  await seccion('F9 · tocar el mapa salta cerca: ese punto queda bajo la cruz', async () => {
    await aLosSinUbicar();
    await toca('[data-mano="' + ids.sp2 + '"]');
    await dormir(800);
    const aj = await ajusteDePantalla(p);
    const lz = await caja(p, '#mapa-lienzo');
    const objetivo = { x: lz.cx + 70, y: lz.cy + 70 };
    const esperado = aj.coordDe(objetivo.x, objetivo.y);
    if (cfg.tactil) await p.touchscreen.tap(objetivo.x, objetivo.y); else await p.mouse.click(objetivo.x, objetivo.y);
    await dormir(cfg.reducido ? 600 : 1100);
    const aj2 = await ajusteDePantalla(p);
    const ret = await caja(p, '#mapa-lienzo .mapa-reticula');
    const bajoLaCruz = aj2.coordDe(ret.cx, ret.cy);
    const tolT = Math.max(1e-4, 2 / aj2.pxPorGrado);
    cierto(Math.abs(bajoLaCruz.lat - esperado.lat) < tolT && Math.abs(bajoLaCruz.lng - esperado.lng) < tolT, 'el punto tocado quedó bajo la cruz', { bajoLaCruz, esperado });
    cierto(await guardaHabilitado(), 'y «Guardar aquí» se encendió');
    await toca('[data-mano-ok]');
    const g = await hastaGuardado(ids.sp2);
    /* Dos píxeles de holgura y no una cifra fija de grados: Leaflet redondea a píxel entero, y a
       zoom 12 un píxel ya es 0.0003°. */
    const tol = Math.max(1e-4, 2 / aj2.pxPorGrado);
    cierto(g.lat != null && Math.abs(g.lat - bajoLaCruz.lat) < tol && Math.abs(g.lng - bajoLaCruz.lng) < tol && g.fuente === 'manual',
      'guardó el punto que se veía bajo la cruz (a menos de 2 px)', { g, bajoLaCruz, tol });
    await dormir(cfg.reducido ? 600 : 1300);
  });

  await seccion('F9 · con teclado las flechas mueven el mapa y cancelar no guarda nada', async () => {
    await aLosSinUbicar();
    await p.focus('[data-mano="' + ids.sp3 + '"]');
    await p.keyboard.press('Enter');
    await dormir(800);
    const foco = await p.evaluate(() => document.activeElement && document.activeElement.id);
    cierto(foco === 'mapa-lienzo', 'el foco pasa al mapa para que las flechas lo muevan', foco);
    cierto(!(await guardaHabilitado()), '«Guardar aquí» sigue apagado hasta que el mapa se mueva');
    await p.keyboard.press('ArrowRight');
    await dormir(cfg.reducido ? 500 : 800);
    cierto(await guardaHabilitado(), 'una flecha mueve el mapa debajo de la cruz y enciende «Guardar aquí»');
    await toca('[data-mano-no]');
    await dormir(400);
    cierto(!(await p.evaluate(() => document.querySelector('.mapa-reticula'))), 'cancelar quita la retícula');
    cierto(!(await p.evaluate(() => document.querySelector('[data-mano-ok]'))), 'y la barra del modo');
    cierto((await dbObra(ids.sp3)).lat == null, 'y no guardó nada');
    const vuelve = await p.evaluate(() => document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.mano : null);
    cierto(vuelve === ids.sp3, 'el foco vuelve al «Pin a mano» de esa obra', vuelve);
  });

  /* ---------- F31 · copiar la dirección ---------- */
  await seccion('F31 · «Copiar dirección» confirma en el botón', async () => {
    await aLosSinUbicar();
    await toca('[data-link="' + ids.sp3 + '"]');
    await p.waitForSelector('#pf-pide.show [data-pide="copiardir"]', { timeout: 5000 });
    await dormir(600);
    const btn = '#pf-pide [data-pide="copiardir"]';
    const antes = await p.evaluate(s => document.querySelector(s).textContent.replace(/\s+/g, ' ').trim(), btn);
    cierto(/Copiar dirección/.test(antes), 'el botón dice «Copiar dirección»', antes);
    await toca(btn);
    await dormir(250);
    const d = await p.evaluate(s => {
      const b = document.querySelector(s), r = b.querySelector('.rotulo'), alt = b.querySelector('.rotulo-b');
      return { alt: !!(r && r.classList.contains('alt')), palomita: !!(alt && alt.querySelector('.palomita')), texto: alt ? alt.textContent.trim() : '',
        aviso: (document.getElementById('toast') || {}).textContent || '', ancho: Math.round(b.getBoundingClientRect().width) };
    }, btn);
    cierto(d.alt && d.palomita && d.texto === 'Copiada', 'el botón se vuelve palomita y dice «Copiada»', d);
    cierto(/Dirección copiada/.test(d.aviso), 'el aviso de abajo se queda', d.aviso.slice(0, 60));
    const copiado = await p.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch (_) { return null; } });
    if (copiado !== null) cierto(/Av\. Prueba 123/.test(copiado), 'y la dirección está en el portapapeles', copiado);
    else bien('(este navegador no deja leer el portapapeles: se confía en el aviso)');
    await hasta(p, s => !document.querySelector(s + ' .rotulo.alt'), btn, 4000);
    const despues = await p.evaluate(s => ({ texto: document.querySelector(s).textContent.replace(/\s+/g, ' ').trim(), ancho: Math.round(document.querySelector(s).getBoundingClientRect().width) }), btn);
    cierto(despues.texto.includes('Copiar dirección') && Math.abs(despues.ancho - d.ancho) <= 1, 'a 1.5 s vuelve a «Copiar dirección» sin que el botón cambie de ancho', { despues, antes: d.ancho });
    await toca('#pf-pide [data-pide="cerrar"]');
    await dormir(500);
  });

  /* ---------- F25 · la ruta se dibuja y se numera ---------- */
  await seccion('F25 · la ruta se dibuja y se numera al ordenarla, una vez', async () => {
    /* Un muestreo por cuadro, puesto ANTES del toque: cuántos pines llevan número, si la línea
       existe y tiene animación, y cuánto tarda cada cosa desde el toque. */
    await p.evaluate(() => {
      window.__ruta = { t0: 0, cuadros: [], vivo: true };
      const R = window.__ruta;
      const paso = () => {
        if (!R.vivo) return;
        const t = performance.now();
        const camino = document.querySelector('#mapa-lienzo path.mapa-ruta-linea');
        const anim = camino ? camino.getAnimations() : [];
        R.cuadros.push({ t: R.t0 ? Math.round(t - R.t0) : -1,
          numerados: [...document.querySelectorAll('#mapa-lienzo .mapa-pin.ruta')].filter(e => /^\d+$/.test(e.textContent.trim())).length,
          sinNumero: [...document.querySelectorAll('#mapa-lienzo .mapa-pin')].filter(e => !/^\d+$/.test(e.textContent.trim())).length,
          linea: !!camino, anim: anim.length, offset: camino ? getComputedStyle(camino).strokeDashoffset : null });
        requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });
    await p.evaluate(() => { window.__ruta.t0 = performance.now(); });
    await cerrarFichaSiHay();
    await toca('#mapa-acc [data-ruta="calcular"]');
    await dormir(2200);
    const R = await p.evaluate(() => { window.__ruta.vivo = false; return window.__ruta.cuadros.filter(c => c.t >= 0); });
    const final = R[R.length - 1];
    cierto(final.numerados === 5 && final.sinNumero === 0, 'al final los cinco pines de la ruta llevan su número', final);
    const conAnim = R.filter(c => c.anim > 0);
    if (cfg.reducido) {
      cierto(conAnim.length === 0, 'con menos movimiento la línea aparece entera, sin trazo', conAnim.length);
      cierto(R.find(c => c.linea) && R.find(c => c.linea).numerados === 5, 'y los números aparecen enteros desde el primer cuadro', R.find(c => c.linea));
    } else {
      cierto(conAnim.length > 20, 'la línea se traza con una animación (' + conAnim.length + ' cuadros)', conAnim.length);
      const dur = conAnim.length ? conAnim[conAnim.length - 1].t - conAnim[0].t : 0;
      cierto(dur > 600 && dur < 1100, 'el trazo dura unos 800 ms (' + dur + ' ms)', dur);
      const n0 = conAnim[0].numerados, nF = conAnim[conAnim.length - 1].numerados;
      cierto(n0 <= 1, 'al empezar el trazo casi ningún pin tiene número todavía (' + n0 + ')', n0);
      let sube = true; for (let i = 1; i < R.length; i++) if (R[i].numerados < R[i - 1].numerados) sube = false;
      cierto(sube, 'los números solo van apareciendo, nunca se quitan');
      const pasos = new Set(R.map(c => c.numerados));
      cierto(pasos.size >= 3, 'aparecen de a poco, cuando la línea llega (' + [...pasos].join(',') + ')', [...pasos]);
      cierto(nF >= 4, 'cuando la línea acaba ya casi todos lo tienen (' + nF + ')', nF);
    }
    const punteado = await p.evaluate(() => { const c = document.querySelector('#mapa-lienzo path.mapa-ruta-linea'); const s = getComputedStyle(c); return { d: s.strokeDasharray, anim: c.getAnimations().length }; });
    cierto(/^7px,? 7px$/.test(punteado.d.replace(/\s+/g, ' ')) && punteado.anim === 0, 'al terminar vuelve el punteado de 7 y 7, sin animación', punteado);
    /* Ni el zoom ni un filtro la repiten. */
    await acercar(1);
    await dormir(500);
    cierto(await p.evaluate(() => document.querySelector('#mapa-lienzo path.mapa-ruta-linea').getAnimations().length === 0), 'acercar el mapa no vuelve a trazar la línea');
    const f = await p.evaluate(() => { document.querySelector('#mapa-etapas [data-g="fabricacion"]').click(); return document.querySelector('#mapa-lienzo path.mapa-ruta-linea').getAnimations().length; });
    cierto(f === 0, 'un filtro tampoco');
    await dormir(500);
    await clic('#mapa-etapas [data-g="fabricacion"]');
    await dormir(500);

    /* Quitar el orden a media línea: el trazo se cancela entero, sin línea, sin números y sin errores. */
    const estado = () => p.evaluate(() => ({
      linea: !!document.querySelector('#mapa-lienzo path.mapa-ruta-linea'),
      numerados: [...document.querySelectorAll('#mapa-lienzo .mapa-pin')].filter(e => /^\d+$/.test(e.textContent.trim())).length,
      sinNumero: [...document.querySelectorAll('#mapa-lienzo .mapa-pin')].filter(e => !/^\d+$/.test(e.textContent.trim())).length,
      tira: !document.getElementById('mapa-tira').hidden,
    }));
    await clic('#mapa-acc [data-ruta="quitar"]');
    await dormir(500);
    const sinRuta = await estado();
    cierto(!sinRuta.linea && sinRuta.numerados === 0 && sinRuta.sinNumero >= 5 && !sinRuta.tira, 'quitar el orden quita la línea, los números (vuelve el dibujo de su estatus) y la tira', sinRuta);
    await clic('#mapa-acc [data-ruta="calcular"]');
    await dormir(cfg.reducido ? 100 : 300);
    await clic('#mapa-acc [data-ruta="quitar"]');
    await dormir(1500);
    const cortada = await estado();
    cierto(!cortada.linea && cortada.numerados === 0 && !cortada.tira, 'y si se quita con el trazo a medias, también: nada queda colgado', cortada);
    cierto(await p.evaluate(() => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#mapa-lienzo') && a.playState === 'running').length === 0), 'ninguna animación del mapa sigue corriendo');
    /* Pedirla otra vez la traza otra vez: una vez POR PEDIDO. */
    await p.evaluate(() => { window.__otra = false; const t = setInterval(() => { const c = document.querySelector('#mapa-lienzo path.mapa-ruta-linea'); if (c && c.getAnimations().length) window.__otra = true; }, 30); setTimeout(() => clearInterval(t), 2500); });
    await clic('#mapa-acc [data-ruta="calcular"]');
    await dormir(2600);
    const otra = await p.evaluate(() => window.__otra);
    if (cfg.reducido) cierto(!otra, 'con menos movimiento pedirla otra vez tampoco anima nada');
    else cierto(otra, 'pedir la ruta otra vez la traza otra vez');
    const fin2 = await estado();
    cierto(fin2.numerados === 5 && fin2.tira, 'y queda ordenada, con su tira', fin2);
  });

  /* ---------- F12 · las paradas del día como tarjetas ---------- */
  /* Desde el mapa tipo Google Maps ya no hay globos: «llevar el mapa a una parada» es moverlo hasta
     que su pin quede en lo que se ve y marcarlo (el pin crece, clase `sel`), y tocar una tarjeta o
     «Ver en el mapa» abre la ficha de la obra en la hoja. */
  const pinMarcado = () => p.evaluate(() => [...document.querySelectorAll('#mapa-lienzo .leaflet-marker-icon.mapa-pin.sel')].map(e => e.getAttribute('title') || ''));
  const fichaDe = () => p.evaluate(() => { const f = document.getElementById('mapa-ficha'); return f && !f.hidden ? ((f.querySelector('.mapa-ficha-t') || {}).textContent || '') : ''; });
  const actual = () => p.evaluate(() => { const a = document.querySelector('#mapa-tira .pagina-actual'); return a ? a.dataset.parada : null; });
  const clienteDe = id => (OBRAS.find(o => ids[o.clave] === id) || {}).cliente;

  await seccion('F12 · las paradas del día como tarjetas sobre el mapa', async () => {
    const info = await p.evaluate(() => {
      const t = document.getElementById('mapa-tira');
      return { visible: !!t.offsetParent, tarjetas: t.querySelectorAll('.mapa-parada').length,
        filasVisibles: [...document.querySelectorAll('#mapa-ruta .pf-fila')].filter(f => f.offsetParent).length,
        nota: !!document.querySelector('#mapa-ruta .nota-av') && !!document.querySelector('#mapa-ruta .nota-av').offsetParent,
        notaTexto: (document.querySelector('#mapa-ruta .nota-av') || {}).textContent || '' };
    });
    cierto(info.tarjetas === 5, 'la tira trae una tarjeta por parada (5)', info);
    cierto(/empezando desde el centro de Guadalajara/.test(info.notaTexto) && info.nota, 'la nota del punto de salida supuesto sigue visible', info);
    if (!movil) {
      cierto(!info.visible, 'en la computadora la tira no se ve', info);
      cierto(info.filasVisibles === 5, 'y la lista de la ruta se queda (5 renglones)', info);
      /* «Ver en el mapa» lleva al pin y abre la ficha de esa parada. */
      await toca('#mapa-ruta [data-ver="' + ids.gym + '"]');
      await dormir(1400);
      const f = await fichaDe();
      cierto(/Gym Titanio/.test(f), '«Ver en el mapa» abre la ficha de esa parada', f.slice(0, 60));
      cierto((await pinMarcado()).some(t => /Gym Titanio/.test(t)), 'y marca su pin', await pinMarcado());
      return;
    }
    cierto(info.visible, 'en el teléfono la tira se ve', info);
    cierto(info.filasVisibles === 0, 'y la lista de abajo se esconde (las paradas ya están en la tira)', info);

    const lienzo = await caja(p, '#mapa-lienzo'), tira = await caja(p, '#mapa-tira'), cred = await caja(p, '.leaflet-control-attribution');
    const hoja = await p.evaluate(() => Math.round(document.getElementById('mapa-hoja').getBoundingClientRect().top));
    cierto(tira.y >= lienzo.y && tira.b <= hoja + 1 && tira.x >= lienzo.x - 1 && tira.r <= lienzo.r + 1, 'la tira está dentro del mapa, encima de la hoja', { tira, hoja, lienzo });
    cierto(!seCruzan(tira, cred), 'la tira NO tapa el crédito de OpenStreetMap', { tira, cred });
    const fabs = await caja(p, '#mapa-fabs');
    cierto(!seCruzan(tira, fabs), 'ni los botones redondos del mapa', { tira, fabs });
    const botones = await p.evaluate(() => [...document.querySelectorAll('#mapa-tira .mapa-parada-ir')].map(a => Math.round(a.getBoundingClientRect().height)));
    cierto(botones.length === 5 && botones.every(h => h >= 44), 'los botones «Cómo llegar» miden 44 px o más', botones);
    const hrefs = await p.evaluate(() => [...document.querySelectorAll('#mapa-tira .mapa-parada-ir')].map(a => a.getAttribute('href')));
    cierto(hrefs.every(h => /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=20\.\d+%2C-103\.\d+$/.test(h)), 'cada uno lleva a las coordenadas de su obra', hrefs);
    for (const [sel, minimo] of [['.mapa-parada-t', 4.5], ['.mapa-parada-d', 4.5], ['.mapa-parada-n', 4.5]]) {
      const c = await contraste(p, '#mapa-tira ' + sel);
      cierto(c !== null && c >= minimo, 'contraste de ' + sel + ' en la tarjeta: ' + c + ':1', c);
    }
    const orden = await p.evaluate(() => [...document.querySelectorAll('#mapa-tira .mapa-parada')].map(c => c.querySelector('.mapa-parada-n').textContent + ' ' + c.querySelector('.mapa-parada-t').textContent.slice(0, 14) + ' · ' + c.querySelector('.mapa-parada-d').textContent));
    cierto(orden.length === 5 && orden.every((t, i) => t.startsWith(String(i + 1) + ' ')) && /A las \d+:\d\d/.test(orden[0]), 'cada tarjeta trae número, nombre y hora', orden);
    const roles = await p.evaluate(() => { const t = document.getElementById('mapa-tira'); return { rol: t.getAttribute('role'), desc: t.getAttribute('aria-roledescription'), etiqueta: t.getAttribute('aria-label'),
      grupos: [...t.children].map(c => c.getAttribute('aria-label')) }; });
    cierto(roles.rol === 'region' && /Paradas de hoy/.test(roles.etiqueta || '') && roles.grupos[1] === 'Parada 2 de 5', 'la tira es una región con un grupo por parada («Parada 2 de 5»)', roles);

    /* Sin movimiento sobre el mapa de entrada: la primera tarjeta está activa pero el mapa sigue encuadrando la ruta entera. */
    const act0 = await actual();
    cierto(act0 === (await p.evaluate(() => document.querySelector('#mapa-tira .mapa-parada').dataset.parada)), 'la primera tarjeta es la de ahora', act0);
    cierto(!(await fichaDe()), 'y no se abrió ninguna ficha sola: encuadrar la ruta no es pedir una parada');

    /* Deslizar de verdad a la segunda tarjeta. */
    const t1 = await caja(p, '#mapa-tira .mapa-parada:nth-child(1)');
    const ancho = t1.w + 10;
    await deslizar(cdp, { x: t1.cx + 60, y: t1.y + 30 }, { x: t1.cx + 60 - ancho, y: t1.y + 30 });
    await dormir(cfg.reducido ? 900 : 1700);
    const cual = await actual();
    cierto(cual && cual !== act0, 'el dedo pasó a otra tarjeta (' + clienteDe(cual) + ')', cual);
    const cliente = clienteDe(cual);
    const pin = await puntaDe(p, cliente);
    const lienzo2 = await caja(p, '#mapa-lienzo'), tira2 = await caja(p, '#mapa-tira'), arriba = await caja(p, '#mapa-arriba');
    cierto(pin && pin.cy < tira2.y - 4 && pin.cy > arriba.b && pin.cx > lienzo2.x && pin.cx < lienzo2.r, 'el mapa llevó la parada a la vista, entre la búsqueda y la tira', { pin, arriba: arriba.b, tira: tira2.y });
    const libre = { y: arriba.b, b: tira2.y };
    cierto(pin && Math.abs(pin.cy - (libre.y + libre.b) / 2) < (libre.b - libre.y) * .35 && Math.abs(pin.cx - lienzo2.cx) < 50, 'y la dejó hacia el centro de lo que se ve', { pin, centro: [lienzo2.cx, (libre.y + libre.b) / 2] });
    const marc = await pinMarcado();
    cierto(marc.length === 1 && marc[0].includes(cliente), 'y marcó su pin (solo el suyo)', marc);
    cierto(!(await fichaDe()), 'sin abrir la ficha: deslizar es recorrer, no elegir');

    /* Tocar un pin lleva la tira a su tarjeta. Se encuadra primero para tener todos los pines a la vista. */
    await toca('#mapa-fabs [data-encuadrar]');
    await dormir(cfg.reducido ? 500 : 1100);
    const pin4 = await puntaDe(p, 'Dental Sonrisa');
    /* Se toca el cuerpo de la gota, unos píxeles arriba de la punta. */
    await p.touchscreen.tap(pin4.cx, pin4.cy - 12);
    await dormir(cfg.reducido ? 600 : 1300);
    const cardAct = await p.evaluate(() => { const a = document.querySelector('#mapa-tira .pagina-actual'); const t = document.getElementById('mapa-tira').getBoundingClientRect(); const c = a.getBoundingClientRect(); return { id: a.dataset.parada, dx: Math.abs((c.left + c.width / 2) - (t.left + t.width / 2)) }; });
    cierto(cardAct.id === ids.den && cardAct.dx < 24, 'tocar un pin lleva la tira a su tarjeta, centrada', cardAct);
    await dormir(400);
    const marc2 = await pinMarcado();
    cierto(marc2.length === 1 && /Dental Sonrisa/.test(marc2[0]), 'y el pin marcado es ese (la tira no se lo lleva a otro de camino)', marc2);

    /* Tocar la tarjeta que asoma por un lado: la vecina de la de ahora. Tocar una tarjeta abre su ficha. */
    const vecina = await p.evaluate(() => {
      const a = document.querySelector('#mapa-tira .pagina-actual');
      const v = a.nextElementSibling || a.previousElementSibling;
      return v ? v.dataset.parada : null;
    });
    const tv = await caja(p, '#mapa-tira [data-parada="' + vecina + '"]');
    const lz = await caja(p, '#mapa-lienzo');
    /* De la tarjeta solo asoma un pedazo: se toca la mitad de lo que se ve. */
    const visX = (Math.max(tv.x, lz.x) + Math.min(tv.r, lz.r)) / 2;
    await p.touchscreen.tap(visX, tv.y + 22);
    await dormir(cfg.reducido ? 700 : 1500);
    const fv = await fichaDe();
    cierto(clienteDe(vecina) && fv.includes(clienteDe(vecina)), 'tocar la tarjeta que asoma abre la ficha de esa obra', { cliente: clienteDe(vecina), ficha: fv.slice(0, 40) });
    cierto((await pinMarcado()).some(t => t.includes(clienteDe(vecina))), 'con su pin marcado', await pinMarcado());
    /* Con la ficha abierta la tira se esconde; al cerrarla tiene que volver en ESA parada, no en
       la de antes. */
    await cerrarFichaSiHay();
    await dormir(cfg.reducido ? 300 : 700);
    cierto((await actual()) === vecina, 'al cerrar la ficha la tira vuelve en esa parada', { tras: await actual(), vecina });

    /* Teclado: el tabulador pasa de tarjeta en tarjeta y el mapa las sigue, como el dedo: sin abrir
       fichas, que esconderían la tira con el foco adentro. */
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    const primera = await p.evaluate(() => document.querySelector('#mapa-tira .mapa-parada').dataset.parada);
    await p.focus('#mapa-tira .mapa-parada:nth-child(1) a');
    for (let i = 0; i < 4; i++) {
      await p.keyboard.press('Tab');
      const enTarjeta = await p.evaluate(() => { const c = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-parada]'); return c ? c.dataset.parada : null; });
      if (enTarjeta && enTarjeta !== primera) break;
    }
    await dormir(cfg.reducido ? 700 : 1500);
    const porTab = await p.evaluate(() => { const c = document.activeElement.closest('[data-parada]'); const a = document.querySelector('#mapa-tira .pagina-actual'); return { enfocada: c && c.dataset.parada, actual: a && a.dataset.parada, tiraVisible: !!document.getElementById('mapa-tira').offsetParent }; });
    cierto(porTab.enfocada && porTab.enfocada !== primera && porTab.enfocada === porTab.actual, 'con el tabulador la tarjeta enfocada pasa a ser la de ahora', porTab);
    cierto(porTab.tiraVisible && !(await fichaDe()), 'y la tira sigue a la vista con el foco adentro (no se abrió una ficha encima)', { porTab, ficha: await fichaDe() });
    const clienteTab = clienteDe(porTab.actual);
    cierto(clienteTab && (await pinMarcado()).some(t => t.includes(clienteTab)), 'y el mapa va a esa parada y marca su pin', { clienteTab, marcado: await pinMarcado() });

    cierto(await p.evaluate(() => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#mapa-tira') && a.effect.getComputedTiming().iterations === Infinity).length === 0), 'la tira no se mueve sola en reposo');
  });

  await p.screenshot({ path: process.env.CAPTURAS ? process.env.CAPTURAS + '/mapa-' + cfg.ancho + '-' + cfg.tema + (cfg.reducido ? '-rm' : '') + '.png' : undefined }).catch(() => {});

  await seccion('invariantes de la ronda', async () => {
    cierto(await sinDesbordeEnReposo(p), 'sin desborde de lado', await quienDesborda(p));
    const inf = await infinitas(p);
    cierto(inf.length === 0, 'nada con animación infinita en reposo', inf);
    cierto(errores.length === 0, 'sin errores de página', errores);
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
  { ancho: 1280, alto: 860, tema: 'claro', reducido: false, tactil: false },
];
/* Para depurar: SOLO=2 corre únicamente la tercera ronda, SOLO=0,4 la primera y la última. */
const solo = process.env.SOLO === undefined ? null : process.env.SOLO.split(',');
for (let i = 0; i < RONDAS.length; i++) if (!solo || solo.includes(String(i))) await ronda(RONDAS[i]);

await nav.close();
console.log('\n' + (fallos ? fallos + ' fallo(s) en pf-mapa.' : 'El mapa con las piezas: todo en verde.'));
process.exit(fallos ? 1 : 0);
