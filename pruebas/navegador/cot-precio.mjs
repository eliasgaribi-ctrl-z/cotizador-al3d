/* EL PRECIO, LA AUTORIZACIÓN, EL NOTARIO Y LOS HITOS, CON EL DEDO, EL RATÓN Y EL TECLADO.

   Lo que se defiende, y por qué se mide en un navegador y no se lee en el código:

   · EL RIEL DE CUATRO PASOS ENSEÑA CUÁNTO VA (C12, C23 #6). Un filete que se llena según los pasos
     hechos, el círculo de cada paso vuelto glifo (anillo punteado, número, palomita) y —lo que se
     rompe fácil— que la palomita se DIBUJE solo al nacer: la barra se repinta en cada tecla del paso 1.
   · EL ANTICIPO PARTIDO (C17) Y EL PRECIO CON IMANES (C18). Dos barras sobre campos que siguen siendo
     la fuente: arrastrarlas escribe el campo y deja correr el `input`/`change` de siempre; teclear en
     el campo mueve la barra; el imán fuerte cae EXACTO en el 50 %; el 60 000 se mide sobre el total
     que se cobra; y en los imanes del precio nada vibra (vibrar() es de autorizar, borrar y rechazar).
   · SELLAR LO DICE (C5, C23 #7). El botón se vuelve una ficha de estado con reloj, no acepta un segundo
     toque, sobrevive a un repintado del panel a media espera, tiembla y ofrece «Reintentar» si la hoja
     no contestó, y al salir bien se lava en verde con el código ANTES de que el panel cambie, con su
     neón. Lo mismo en la revisión de una solicitud de otro teléfono.
   · LA SOLICITUD A DIRECCIÓN CON SU RECORRIDO (C9). Tres tramos con su glifo, «revisado hace N s» que
     solo corre con la pantalla a la vista, el arco que gira solo mientras hay espera de verdad.
   · LA COLA, VIVA (C22). Lo que llega entra marcado «nueva» y repintar en cada tecla NO reinicia la
     marca; lo que se quita se despide. Y «Quitar» del aviso de partidas sin terminar.
   · EL DOCK (C10, C23 #1, #4). El rótulo cambia sin reescribir el DOM cuando no cambió; el propio botón
     dice qué falta; el total rueda solo si el importe cambió y se explica en un globo.
   · LOS PLIEGUES (C16), COPIAR (C11), MANTENER PARA CONFIRMAR (C23 #5), EL VUELO AL HISTORIAL (C20) Y EL
     PLAZO SUGERIDO CON SU «¿POR QUÉ?» (H19).

   Cada ronda es un teléfono distinto (360 y 420 px) en claro u oscuro, con o sin menos movimiento,
   con dedo (tap y CDP), ratón y teclado; sin errores de página, sin desborde horizontal, sin nada que
   se mueva solo en reposo dentro de lo que esta zona pinta, y con el contraste medido sobre lo que
   se ve.

   Uso:  PUERTO=8901 node pruebas/navegador/cot-precio.mjs
         RONDA=1,3       para correr solo esas rondas, numeradas desde 1
         CAPTURAS=/ruta  para guardar capturas a 360 px (por omisión /tmp/cot-precio-capturas) */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const CAP = process.env.CAPTURAS || join(tmpdir(), 'cot-precio-capturas');
mkdirSync(CAP, { recursive: true });
const HOJA = decodeURIComponent(new URL('./hoja-de-mentiras.js', import.meta.url).pathname);
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, m, extra = '') => (c ? bien(m) : mal(m + (extra ? ' — ' + extra : '')));
const espera = ms => new Promise(r => setTimeout(r, ms));

const RONDAS = [
  { W: 360, tema: 'claro', red: false }, { W: 360, tema: 'oscuro', red: true },
  { W: 420, tema: 'claro', red: true }, { W: 420, tema: 'oscuro', red: false },
  { W: 360, tema: 'oscuro', red: false }, { W: 360, tema: 'claro', red: true },
  { W: 420, tema: 'oscuro', red: true }, { W: 420, tema: 'claro', red: false },
];

/* ---------- Las medidas que se repiten, hechas dentro de la página ---------- */
const enPagina = {
  /* Contraste real de un elemento con texto: color de la letra contra el fondo EFECTIVO. Solo sirve
     sobre fondos planos; lo que va sobre un degradado lo mide contraste.mjs rasterizando. */
  contraste: sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const canales = c => (c.match(/[\d.]+/g) || [0, 0, 0, 1]).map(Number);
    const mezcla = (arriba, abajo) => { const a = arriba[3] == null ? 1 : arriba[3]; return [0, 1, 2].map(i => arriba[i] * a + abajo[i] * (1 - a)); };
    const capas = [];
    for (let e = el; e; e = e.parentElement) {
      const c = canales(getComputedStyle(e).backgroundColor);
      const a = c[3] == null ? 1 : c[3];
      if (a > 0) capas.push(c);
      if (a >= 1) break;
    }
    let fondo = [255, 255, 255];
    for (let i = capas.length - 1; i >= 0; i--) fondo = mezcla(capas[i], fondo);
    const letra = mezcla(canales(getComputedStyle(el).color), fondo);
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const a = L(letra), b = L(fondo);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  },
};

/* Una sesión nueva por sección: cada una arranca de un cotizador limpio y con su propia hoja de
   mentiras, para que lo que una deja a medias no contamine a la siguiente. `rol` 'ventas' es quien
   NO es dirección (solicita en vez de autorizar). */
async function sesion(R, { rol = 'direccion', escritorio = false } = {}) {
  const { W, tema, red } = R;
  const ctx = await nav.newContext({ viewport: { width: escritorio ? 1100 : W, height: escritorio ? 820 : 740 }, deviceScaleFactor: 2, isMobile: !escritorio, hasTouch: !escritorio,
    locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block', reducedMotion: red ? 'reduce' : 'no-preference' });
  await ctx.addInitScript({ path: HOJA });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  if (rol !== 'direccion') await ctx.addInitScript(r => { if (window.AL3D) window.AL3D.identidad = () => ({ correo: 'ventas@al3d.mx', rol: r }); }, rol);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B }).catch(() => {});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|Failed to load resource/.test(m.text())) errs.push('consola: ' + m.text()); });
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof Q !== 'undefined' && typeof Piezas !== 'undefined' && typeof autorizarRemota === 'function');
  await p.waitForTimeout(700);
  const cdp = await ctx.newCDPSession(p);
  const s = { ctx, p, errs, cdp, R, ancho: escritorio ? 1100 : W, ev: (f, a) => p.evaluate(f, a) };
  /* El dedo de verdad: touchStart, touchMove, touchEnd por CDP (page.tap solo toca). */
  s.dedo = async (puntos, { mantener = 0 } = {}) => {
    const [a, ...resto] = puntos;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1] }] });
    for (const q of resto) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1] }] });
    if (mantener) await espera(mantener);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  s.libre = () => s.ev(() => { try { Piezas.aviso.limpiar(); } catch (_) {} });
  s.centro = async sel => { await s.ev(x => document.querySelector(x).scrollIntoView({ block: 'center' }), sel); await p.waitForTimeout(250); return p.locator(sel).boundingBox(); };
  s.sinDesborde = async (donde, selector) => {
    const r = await s.ev(({ selector, W }) => {
      const de = document.documentElement;
      const raiz = selector ? document.querySelector(selector) : document.body;
      const fuera = [...(raiz ? raiz.querySelectorAll('*') : [])].filter(e => {
        const b = e.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(e).position === 'fixed') return false;
        if (e.closest('.mira,.toast,.vistazo,.desenfoque-borde,[hidden],.rueda-vista,.solo-voz,.vuelo-cot,.lista-se-va,.mantener-capa')) return false;
        return b.right > W + 1 || b.left < -1;
      }).slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 30));
      return { pagina: de.scrollWidth - de.clientWidth, fuera };
    }, { selector, W: s.ancho });
    cierto(r.pagina <= 1 && !r.fuera.length, `sin desborde horizontal ${donde}`, JSON.stringify(r));
  };
  /* Lo que se mueve solo en reposo, dentro de la zona: nada. `permitir` es el selector de lo que SÍ
     puede girar porque hay una espera de verdad detrás (el arco del recorrido de la solicitud). */
  s.sinBucles = async (donde, zona, permitir = '') => {
    const r = await s.ev(({ zona, permitir }) => document.getAnimations().filter(a => {
      const t = a.effect && a.effect.target;
      if (!(a.effect && a.effect.getComputedTiming().iterations === Infinity && t && t.closest && t.closest(zona))) return false;
      return !(permitir && t.closest(permitir));
    }).map(a => (a.effect.target.className && a.effect.target.className.baseVal !== undefined ? a.effect.target.className.baseVal : a.effect.target.className || a.effect.target.tagName) + ':' + (a.animationName || a.transitionProperty)), { zona, permitir });
    cierto(!r.length, `nada gira ni late solo en reposo ${donde}`, JSON.stringify(r));
  };
  s.captura = async nombre => { if (R.W === 360) await p.screenshot({ path: join(CAP, `${nombre}-${R.tema}${R.red ? '-rm' : ''}.png`) }); };
  s.datos = (items, extra2) => s.ev(({ items, extra2 }) => {
    Q.cliente = 'Farmacia San Juan'; Q.proy = 'Letrero fachada'; Q.tel = '33 2813 0092'; Q.dirRaw = 'Av. Vallarta 1234, Guadalajara';
    Q.items = items || [{ id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8, _lt: 0 }];
    Object.assign(Q, extra2 || {});
    pid = Math.max(pid, ...Q.items.map(i => i.id));
    saveState(); renderItems(); renderSummary(); updDirRaw(Q.dirRaw);
  }, { items, extra2 });
  s.cierra = async () => { await ctx.close(); };
  return s;
}
/* Los errores de página de una sesión, al cerrarla. */
const sinErrores = (s, donde) => cierto(!s.errs.length, `sin errores de página ${donde}`, JSON.stringify(s.errs));

/* La hoja de mentiras con demora o con fallo, a voluntad. */
const hojaLenta = (s, ms) => s.ev(ms => { if (window.__orig) return; window.__orig = window.AL3D.hablar; window.__n = { autorizar: 0 };
  window.AL3D.hablar = (r, c, e) => { if (r === 'autorizar') { window.__n.autorizar++; if (window.__falla) return new Promise((_, no) => setTimeout(() => no(new Error('La hoja no contestó a tiempo.')), ms)); return new Promise(res => setTimeout(() => res(window.__orig(r, c, e)), ms)); } return window.__orig(r, c, e); }; }, ms);

async function ronda(R, indice) {
  const { W, tema, red } = R;
  console.log(`\n══ RONDA ${indice + 1} · ${W} px · ${tema} · ${red ? 'menos movimiento' : 'con movimiento'} ══`);

  /* ============================== 1 · EL RIEL DE LOS CUATRO PASOS (C12, C23 #6) ============================== */
  {
    console.log('\n  — el riel de cuatro pasos, con cuánto va —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos();
    await p.waitForTimeout(800);
    const r1 = await ev(() => ({
      avance: $('pasos').style.getPropertyValue('--avance'),
      escala: (/matrix\(([-\d.e]+)/.exec(getComputedStyle($('pasos'), '::after').transform) || [])[1],
      pal: [1, 2, 3, 4].map(i => !!$('tab-' + i + '-n').querySelector('.palomita')),
      numeros: [1, 2, 3, 4].map(i => $('tab-' + i + '-n').textContent.trim()),
      borde4: getComputedStyle($('tab-4-n')).borderStyle, borde2: getComputedStyle($('tab-2-n')).borderStyle,
      etiq: [1, 2, 3, 4].map(i => $('tab-' + i).getAttribute('aria-label')),
      alto: [1, 2, 3, 4].map(i => Math.round($('tab-' + i).getBoundingClientRect().height)),
      dibuja: !!$('tab-2-n').querySelector('.palomita.dibuja,.dibuja'),
    }));
    cierto(r1.avance === '0.50' && Math.abs(+r1.escala - 0.5) < 0.02, 'con el cliente y las partidas hechos el filete va en la mitad (--avance=' + r1.avance + ', escala ' + r1.escala + ')');
    cierto(r1.pal.join() === 'false,true,false,false' && r1.numeros[0] === '1', 'el paso hecho lleva su palomita DIBUJADA (svg) y el actual su número', JSON.stringify(r1.pal));
    cierto(r1.borde4 === 'dashed' && r1.borde2 !== 'dashed', 'el que todavía no toca lleva el anillo punteado ámbar', r1.borde4 + ' / ' + r1.borde2);
    cierto(/hecho/.test(r1.etiq[1]) && /todavía no/.test(r1.etiq[3]), 'y el estado también va con palabras en el nombre de la pestaña: «' + r1.etiq[1] + '»');
    cierto(r1.alto.every(h => h >= 43.5), 'las cuatro pestañas miden 44 px con el dedo', JSON.stringify(r1.alto));
    cierto(r1.dibuja, 'la palomita que NACE por un cambio (la partida ya tiene precio) se dibuja');
    /* Al abrir la app con la cotización ya hecha nada se dibuja: nació quieta. */
    await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => typeof Q !== 'undefined' && typeof pintarPasos === 'function'); await p.waitForTimeout(700);
    /* Recargada, la app abre en partidas (con los tres datos puestos): el paso hecho que se ve es el 1. */
    const rr = await ev(() => ({ pal: !!$('tab-1-n').querySelector('.palomita'), dibuja: !!$('tab-1-n').querySelector('.dibuja') }));
    cierto(rr.pal && !rr.dibuja, 'al abrir la app con la cotización ya hecha la palomita aparece quieta, sin dibujarse', JSON.stringify(rr));
    /* Se repinta en cada tecla del paso 1: la palomita es el mismo nodo, y el filete no se mueve. */
    await ev(() => irAPaso(1)); await p.waitForTimeout(500);
    await ev(() => { window.__pal = $('tab-2-n').querySelector('.palomita'); });
    await p.fill('#f-cli', 'Farmacia San Juan 2'); await p.fill('#f-proy', 'Letrero fachada 2'); await p.waitForTimeout(300);
    cierto(await ev(() => $('tab-2-n').querySelector('.palomita') === window.__pal), 'teclear repinta la barra y la palomita sigue siendo la misma, sin redibujarse');
    cierto(await ev(() => $('pasos').style.getPropertyValue('--avance')) === '0.50', 'y el filete no se mueve al teclear');
    await s.sinDesborde('en el riel de pasos', '#pasos');
    await s.captura('01-riel');
    /* Autorizar mueve el filete y dibuja la palomita del paso 3, una vez. */
    await ev(() => irAPaso(2)); await p.waitForTimeout(400);
    await ev(() => autorizarYoMismo()); await p.waitForTimeout(300);
    await ev(() => autorizar()); await p.waitForTimeout(1600);
    const r2 = await ev(() => ({ estado: Q.estado, avance: $('pasos').style.getPropertyValue('--avance'), pal3: !!$('tab-3-n').querySelector('.palomita'),
      dib3: !!$('tab-3-n').querySelector('.palomita.dibuja,.palomita .dibuja,svg.dibuja') }));
    cierto(r2.estado === 'autorizada' && r2.avance === '0.75' && r2.pal3, 'al autorizar el filete sube a tres cuartos y el paso 3 lleva su palomita', JSON.stringify(r2));
    await ev(() => { window.__pal3 = $('tab-3-n').querySelector('.palomita'); pintarPasos(); pintarPasos(); });
    cierto(await ev(() => $('tab-3-n').querySelector('.palomita') === window.__pal3), 'repintar de nuevo no la redibuja');
    /* Con menos movimiento el filete salta; con movimiento tiene transición. */
    const tr = await ev(() => getComputedStyle($('pasos'), '::after').transitionDuration);
    cierto(red ? parseFloat(tr) === 0 : parseFloat(tr) > 0, red ? 'con menos movimiento el filete salta de un valor al otro' : 'con movimiento el filete se desliza (' + tr + ')');
    await s.sinBucles('en el riel', '#pasos');
    sinErrores(s, 'en el riel'); await s.cierra();
  }

  /* ============================== 2 · EL ANTICIPO PARTIDO (C17) ============================== */
  {
    console.log('\n  — el anticipo, partido a la vista —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos();
    await ev(() => irAPaso(2)); await p.waitForTimeout(500);
    const a0 = await ev(() => ({ total: precioFinal(), campo: $('f-anti').value, r: $('f-anti-r').value, max: +$('f-anti-r').max, rest: $('s-anti-rest').textContent,
      visible: !$('s-anti-partido').hidden, h: Math.round($('f-anti-r').getBoundingClientRect().height), grueso: $('f-anti-r').classList.contains('grueso'),
      blur: getComputedStyle($('s-anti-rest')).filter, aria: $('f-anti-r').getAttribute('aria-valuetext') }));
    cierto(a0.visible && a0.grueso && Math.abs(a0.max - a0.total) < 0.01, 'la barra de dos tramos está y llega hasta el total que se cobra (' + a0.max + ')');
    cierto(+a0.r === +a0.campo && a0.h >= 43.5, 'nace en el anticipo sugerido (' + a0.campo + ') y mide 44 px', JSON.stringify(a0));
    cierto(/Hoy \$5,568\.00/.test(a0.rest) && /Al instalar \$5,568\.00/.test(a0.rest), 'dice «Hoy $5,568.00 · Al instalar $5,568.00»: ' + a0.rest);
    cierto(/blur/.test(a0.blur), 'en borrador las dos cifras van difuminadas, como todo importe');
    cierto(/Hoy .* al instalar/.test(a0.aria || ''), 'el lector de pantalla oye las dos mitades: «' + a0.aria + '»');
    cierto(a0.max > 0 && await ev(() => document.querySelector('#s-anti-partido .desl-marca.iman') !== null), 'lleva sus marcas: 50 % y Total');
    await s.sinDesborde('en la columna del dinero', '#sidebox');
    const caja = await s.centro('#f-anti-r');
    const xDe = f => caja.x + 22 + f * (caja.width - 44), yC = caja.y + caja.height / 2;
    /* El ratón: arrastrar a un punto cualquiera cae a cientos. */
    await p.mouse.move(xDe(0.5), yC); await p.mouse.down();
    await p.mouse.move(xDe(0.77), yC, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(250);
    const a1 = await ev(() => ({ campo: +$('f-anti').value, manual: Q.antiManual, anti: Q.anti, rest: $('s-anti-rest').textContent, lbl: $('f-anti-lbl').textContent }));
    cierto(a1.campo % 100 === 0 && a1.campo > 7000 && a1.manual && a1.anti === a1.campo, 'arrastrar con el ratón escribe el campo, a cientos (' + a1.campo + ') y deja `antiManual`', JSON.stringify(a1));
    cierto(/Anticipo \(\d+%\)/.test(a1.lbl), 'el rótulo dice el porcentaje pactado: «' + a1.lbl + '»');
    /* El imán fuerte del 50 % exacto: con IVA no es redondo (5,568 de 11,136 sí, pero se mide con un total quebrado). */
    await ev(() => { Q.items[0].n = 7; saveState(); renderItems(); renderSummary(); }); await p.waitForTimeout(300);
    const t2 = await ev(() => precioFinal());
    const caja2 = await s.centro('#f-anti-r');
    const x2 = f => caja2.x + 22 + f * (caja2.width - 44), y2 = caja2.y + caja2.height / 2;
    await p.mouse.move(x2(0.8), y2); await p.mouse.down(); await p.mouse.move(x2(0.505), y2, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(250);
    const a2 = await ev(() => +$('f-anti').value);
    cierto(Math.abs(a2 - t2 / 2) < 0.011, 'arrastrar cerca de la mitad cae EXACTO en el 50 % del total (' + a2 + ' de ' + t2 + ')');
    /* El tope: jalar más allá del final deja el anticipo igual al total. */
    await p.mouse.move(x2(0.5), y2); await p.mouse.down(); await p.mouse.move(caja2.x + caja2.width + 30, y2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(250);
    cierto(Math.abs(await ev(() => +$('f-anti').value) - t2) < 0.011, 'más allá del final el anticipo se queda en el total, no lo pasa');
    /* El dedo, por CDP. */
    await ev(() => { $('f-anti').value = ''; $('f-anti').dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(250);
    const caja3 = await s.centro('#f-anti-r');
    const x3 = f => caja3.x + 22 + f * (caja3.width - 44), y3 = caja3.y + caja3.height / 2;
    await s.dedo([[x3(0.5), y3], [x3(0.4), y3], [x3(0.3), y3], [x3(0.22), y3]]); await p.waitForTimeout(300);
    const a3 = await ev(() => +$('f-anti').value);
    cierto(a3 % 100 === 0 && a3 < t2 * 0.35 && a3 > 0, 'con el dedo también: arrastrar escribe el campo (' + a3 + ')');
    /* El teclado: las flechas avanzan de cien en cien. */
    await ev(() => $('f-anti-r').focus()); const antes = await ev(() => +$('f-anti-r').value);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
    const desp = await ev(() => +$('f-anti').value);
    cierto(desp % 100 === 0 && desp > antes && desp - antes <= 100, 'con el teclado, ArrowRight sube a cientos (' + antes + ' → ' + desp + ')');
    /* El campo manda: teclear mueve la barra y las dos cifras. */
    await p.fill('#f-anti', '3000'); await p.waitForTimeout(250);
    const a4 = await ev(() => ({ r: +$('f-anti-r').value, rest: $('s-anti-rest').textContent }));
    cierto(a4.r === 3000 && /Hoy \$3,000\.00/.test(a4.rest), 'teclear en el campo mueve la barra y el renglón: ' + a4.rest);
    await p.fill('#f-anti', '99999'); await p.waitForTimeout(250);
    cierto(await ev(() => document.querySelector('#s-anti-partido .desl-caja').classList.contains('fuera') || +$('f-anti-r').value >= +$('f-anti-r').max - 0.01), 'un anticipo que pasa del total deja la barra en su tope y lo dice (.fuera)');
    await ev(() => $('f-anti').dispatchEvent(new Event('change', { bubbles: true }))); await p.waitForTimeout(250);
    /* La excepción de $60,000, sobre el total que se cobra. */
    const ex0 = await ev(() => ({ oculta: $('s-anti-excep').hidden }));
    cierto(ex0.oculta, 'con un total de $' + Math.round(t2) + ' no hay excepción que avisar');
    await ev(() => { document.body.classList.add('precios-a-la-vista'); Q.items[0].altura = 80; Q.items[0].n = 30; saveState(); renderItems(); renderSummary(); }); await p.waitForTimeout(300);
    const ex1 = await ev(() => ({ oculta: $('s-anti-excep').hidden, texto: $('s-anti-excep').textContent, total: precioFinal(), disp: getComputedStyle($('s-anti-excep')).display }));
    cierto(!ex1.oculta && ex1.total > 60000 && /\$60,000/.test(ex1.texto) && ex1.disp !== 'none', 'arriba de $60,000 (total ' + Math.round(ex1.total) + ') avisa la excepción: «' + ex1.texto + '»');
    /* Sobre el total que se cobra: sin IVA, el mismo subtotal ya no pasa de 60 000 → sin aviso. */
    await ev(() => { Q.iva = false; renderItems(); renderSummary(); Q.items[0].n = 24; saveState(); renderItems(); renderSummary(); });
    await p.waitForTimeout(250);
    const ex2 = await ev(() => ({ oculta: $('s-anti-excep').hidden, total: precioFinal() }));
    cierto(ex2.total < 60000 ? ex2.oculta : !ex2.oculta, 'la excepción se mide sobre el total que se cobra, no sobre el subtotal (total ' + Math.round(ex2.total) + ')');
    cierto(await ev(() => { document.body.classList.remove('precios-a-la-vista'); return getComputedStyle($('s-anti-excep')).display === 'none'; }), 'y en borrador el aviso no sale: su sola presencia diría que el total pasa de $60,000');
    await s.sinBucles('en la columna del dinero', '#sidebox');
    await s.captura('02-anticipo');
    sinErrores(s, 'en el anticipo'); await s.cierra();
  }

  /* ============================== 3 · EL PRECIO CON IMANES (C18) ============================== */
  {
    console.log('\n  — el autorizador ajusta el precio arrastrando —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos();
    await ev(() => { irAPaso(2); autorizarYoMismo(); }); await p.waitForTimeout(600);
    await ev(() => { window.__vibra = 0; navigator.vibrate = () => { window.__vibra++; return true; }; });
    const c0 = await ev(() => ({ min: +$('a-precio-r').min, max: +$('a-precio-r').max, calc: totals().sub, campo: +$('a-precio').value,
      marcas: [...document.querySelectorAll('#authbox .desl-marca')].filter(m => !m.classList.contains('sin-texto')).map(m => m.textContent),
      imanes: [...document.querySelectorAll('#authbox .desl-marca.iman')].length, alto: Math.round($('a-precio-r').getBoundingClientRect().height) }));
    cierto(Math.abs(c0.min - c0.calc * 0.8) < 0.01 && Math.abs(c0.max - c0.calc * 1.1) < 0.01, 'va de −20 % a +10 % del subtotal calculado (' + c0.min + ' a ' + c0.max + ')');
    cierto(c0.campo === c0.calc && c0.alto >= 43.5, 'nace en el calculado, sin ajuste, y mide 44 px');
    cierto(['−20%', '0%', '+10%'].every(x => c0.marcas.includes(x)), 'enseña sus marcas: ' + c0.marcas.join(' '));
    const caja = await s.centro('#a-precio-r');
    const xDe = f => caja.x + 22 + f * (caja.width - 44), yC = caja.y + caja.height / 2;
    const f0 = (c0.calc - c0.min) / (c0.max - c0.min);
    /* Cerca de −5 %: el imán lo pega exacto. */
    const f5 = (c0.calc * 0.95 - c0.min) / (c0.max - c0.min);
    await p.mouse.move(xDe(f0), yC); await p.mouse.down(); await p.mouse.move(xDe(f5) + 4, yC, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(250);
    const c1 = await ev(() => ({ campo: +$('a-precio').value, info: $('descuento-info').textContent, neto: ($('a-precio-neto') || {}).textContent }));
    cierto(Math.abs(c1.campo - c0.calc * 0.95) < 0.011, 'cerca de −5 % el imán lo pega exacto (' + c1.campo + ')');
    cierto(/Descuento: .* \(5%\) sobre el subtotal/.test(c1.info), 'y la frase del ajuste se actualiza: «' + c1.info + '»');
    /* Lejos de los imanes cae a cientos. */
    await p.mouse.move(xDe(f5), yC); await p.mouse.down(); await p.mouse.move(xDe(f5 + 0.09), yC, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(250);
    const c2 = await ev(() => +$('a-precio').value);
    cierto(c2 % 100 === 0 || [0, 5, 10, 15].some(pp => Math.abs(c2 - c0.calc * (1 - pp / 100)) < 0.011), 'fuera de los imanes cae a cientos redondos (' + c2 + ')');
    /* El dedo. */
    await s.dedo([[xDe(0.5), yC], [xDe(0.4), yC], [xDe(0.3), yC]]); await p.waitForTimeout(300);
    const c3 = await ev(() => ({ campo: +$('a-precio').value, draft: paBorrador() }));
    cierto(c3.campo < c0.calc && c3.draft === c3.campo, 'con el dedo también, y el borrador del precio guarda lo arrastrado (' + c3.campo + ')');
    /* Teclear manda: −25 % deja la perilla en el tope y la frase dice la verdad del campo. */
    await p.fill('#a-precio', String(Math.round(c0.calc * 0.75))); await p.waitForTimeout(300);
    const c4 = await ev(() => ({ r: +$('a-precio-r').value, min: +$('a-precio-r').min, info: $('descuento-info').textContent, fuera: document.querySelector('#authbox .desl-caja').classList.contains('fuera') }));
    cierto(Math.abs(c4.r - c4.min) < 0.011 && c4.fuera && /\(25%\)/.test(c4.info), 'teclear −25 % deja la perilla en el tope, lo marca y la frase dice «' + c4.info + '»');
    /* El teclado, de cien en cien. */
    await ev(() => $('a-precio-r').focus()); const k0 = await ev(() => +$('a-precio').value);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
    const k1 = await ev(() => +$('a-precio').value);
    cierto(k1 > k0 && k1 % 100 === 0, 'con el teclado, ArrowRight avanza de cien en cien (' + k0 + ' → ' + k1 + ')');
    cierto(await ev(() => window.__vibra) === 0, 'y en ningún imán vibró nada: vibrar() es de autorizar, borrar y rechazar');
    /* Un repintado del panel (cada tecla del anticipo) no pierde lo arrastrado. */
    await ev(() => renderAuth()); await p.waitForTimeout(150);
    const c5 = await ev(() => ({ campo: +$('a-precio').value, r: +$('a-precio-r').value }));
    cierto(Math.abs(c5.campo - c5.r) < 0.011 && c5.campo === k1, 'repintar el panel conserva lo arrastrado y la perilla donde estaba');
    await s.sinDesborde('en el formulario de revisión', '#authbox');
    await s.captura('03-precio');
    sinErrores(s, 'en el precio'); await s.cierra();
  }

  /* ============================== 4 · SELLAR LO DICE (C5, C23 #7) ============================== */
  {
    console.log('\n  — el botón que sella lo dice, con reloj —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos();
    await ev(() => { irAPaso(2); autorizarYoMismo(); }); await p.waitForTimeout(500);
    await hojaLenta(s, 2400);
    await ev(() => { window.__falla = true; });
    await s.centro('#a-autorizar');
    await p.tap('#a-autorizar'); await p.waitForTimeout(1300);
    const t1 = await ev(() => { const b = $('a-autorizar'); return { estado: b.dataset.estado, texto: b.textContent, busy: b.getAttribute('aria-busy'), rel: b.dataset.relleno, dis: b.disabled, dock: $('mbar').querySelector('.mbar-btn').textContent.trim() }; });
    cierto(t1.estado === 'trabajando' && /^Sellando · \d+ s$/.test(t1.texto), 'mientras sella el botón lo dice con su reloj: «' + t1.texto + '»', JSON.stringify(t1));
    cierto(t1.busy === 'true' && !t1.dis, 'está ocupado pero NO `disabled`: el foco no se pierde a media espera');
    cierto(t1.dock === 'Sellando…', 'y el dock del teléfono dice «Sellando…»: «' + t1.dock + '»');
    /* Un segundo toque no manda otra petición, y un repintado del panel no se lleva el reloj. */
    /* `force`: Playwright no toca lo que está en aria-disabled, y justo eso es lo que se quiere probar. */
    await p.tap('#a-autorizar', { force: true }); await p.waitForTimeout(100);
    await ev(() => { renderAuth(); renderSummary(); });
    const t2 = await ev(() => ({ estado: $('a-autorizar').dataset.estado, n: window.__n.autorizar, texto: $('a-autorizar').textContent }));
    cierto(t2.n === 1, 'un segundo toque NO manda una segunda petición a la hoja (' + t2.n + ')');
    cierto(t2.estado === 'trabajando' && /Sellando/.test(t2.texto), 'y un repintado del panel a media espera conserva el botón que trabaja');
    await s.captura('04-sellando');
    cierto(await ev(() => !!document.querySelector('#authbox .trabajo-relleno')), 'tiene su relleno de avance' + (red ? ' (quieto con menos movimiento)' : ''));
    if (red) cierto(await ev(() => document.querySelector('#authbox .trabajo-relleno').getAnimations().length === 0), 'con menos movimiento el relleno no se anima solo; el reloj con letra dice lo mismo');
    await p.waitForTimeout(1400);
    /* La hoja no contestó: tiembla y ofrece Reintentar, y el motivo sale aparte. */
    const t3 = await ev(() => ({ estado: $('a-autorizar').dataset.estado, texto: $('a-autorizar').textContent, estadoQ: Q.estado, sellando: _sellando }));
    cierto(t3.estado === 'mal' && /No se selló · Reintentar/.test(t3.texto) && t3.estadoQ === 'pendiente' && !t3.sellando, 'si la hoja no contestó dice «' + t3.texto + '» y no cierra nada');
    cierto(await ev(() => /no contestó|hoja/i.test((Piezas.aviso.vivos()[0] || {}).msg || '')), 'y un aviso dice por qué');
    await ev(() => renderAuth());
    cierto(await ev(() => $('a-autorizar').dataset.estado) === 'mal', 'el «Reintentar» también sobrevive a un repintado');
    await s.captura('05-no-se-sello');
    /* Reintentar con otro precio suelta el «No se selló»; con el mismo, corre su manejador. */
    await ev(() => { window.__falla = false; });
    await p.tap('#a-autorizar'); await p.waitForTimeout(1200);
    cierto(await ev(() => $('a-autorizar').dataset.estado) === 'trabajando', 'tocar «Reintentar» vuelve a sellar sin repetir nada más');
    await p.waitForFunction(() => { const b = document.getElementById('a-autorizar'); return b && b.dataset.estado === 'ok'; }, null, { timeout: 5000 }).catch(() => {});
    const t4 = await ev(() => { const b = $('a-autorizar'); return b ? { estado: b.dataset.estado, texto: b.textContent, q: Q.estado } : null; });
    cierto(t4 && t4.estado === 'ok' && /^Sellada · PRUE-/.test(t4.texto) && t4.q === 'pendiente', 'al salir bien se lava en verde con el código ANTES de que el panel cambie: «' + (t4 && t4.texto) + '»', JSON.stringify(t4));
    await s.captura('06-sellada');
    await p.waitForFunction(() => Q.estado === 'autorizada', null, { timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(250);
    const t5 = await ev(() => ({ q: Q.estado, neon: !!document.querySelector('#authbox .neon-capa'), nota: ($('authbox').querySelector('.authnote') || {}).textContent, vib: Piezas.aviso.vivos().map(a => a.msg) }));
    cierto(t5.q === 'autorizada' && /Autorizada por/.test(t5.nota || ''), 'y después el panel pasa a «Autorizada por…»');
    cierto(t5.neon, 'con el neón sobre la tarjeta de autorización');
    cierto(t5.vib.some(m => /Autorizada y sellada/.test(m)), 'y el aviso confirma: «' + t5.vib[0] + '»');
    /* Un repintado a media animación no se lleva la capa del neón. */
    await ev(() => renderAuth());
    cierto(await ev(() => !!document.querySelector('#authbox .neon-capa')) || red, 'repintar el panel mientras dura el neón no lo corta' + (red ? ' (con menos movimiento dura solo un segundo)' : ''));
    await p.waitForTimeout(3100);
    cierto(await ev(() => !document.querySelector('#authbox .neon-capa,#authbox .neon-haz')), 'y en reposo no queda ninguna capa colgada');
    await s.sinBucles('después de autorizar', '#authbox,#sidebox,#mbar,#pasos');
    await s.sinDesborde('en el panel autorizado', '#authbox');
    sinErrores(s, 'al sellar'); await s.cierra();
  }

  /* ============================== 5 · LA COLA DE DIRECCIÓN Y LA REVISIÓN DE OTRO TELÉFONO (C22, C5, C18, C23 #7) ============================== */
  {
    console.log('\n  — la cola viva y la revisión de una solicitud de otro teléfono —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos();
    await ev(() => {
      window.__pend = [];
      const o = window.AL3D.hablar;
      window.AL3D.hablar = (r, c, e) => r === 'pendientes' ? Promise.resolve({ ok: true, solicitudes: window.__pend.slice() }) : o(r, c, e);
      window.__rem = (n, folio) => ({ folio, solicito: 'Ventas', nota: '', cotizacion: { proyecto: 'Letrero ' + n, cliente: 'Cliente ' + n, iva: true,
        items: [{ id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8, _lt: 0 }] } });
      cambiarRol('autorizador');
    });
    await p.waitForTimeout(500);
    cierto(await ev(() => !!document.querySelector('#auth-cola.queue-list .queue-empty')), 'la cola vacía dice «Sin cotizaciones pendientes» dentro de su contenedor');
    await ev(() => { window.__cola0 = $('auth-cola'); window.__pend = [window.__rem(1, 'COT-0091@XXXX')]; return cargarPendientesRemotas(); }); await p.waitForTimeout(250);
    const q1 = await ev(() => { const f = document.querySelector('#auth-cola .queue-item.remota'); window.__fila = f;
      return { n: document.querySelectorAll('#auth-cola .queue-item.remota').length, clave: f && f.dataset.clave, nueva: f && f.classList.contains('lista-nueva'),
        mismo: $('auth-cola') === window.__cola0, marca: f && getComputedStyle(f.querySelector('.qi-folio'), '::after').content, edad: f && f.style.getPropertyValue('--lista-edad') }; });
    cierto(q1.n === 1 && q1.clave === 'COT-0091@XXXX', 'la solicitud que llega entra a la lista, con su folio como identidad');
    cierto(q1.nueva && /nueva/.test(q1.marca), 'y queda marcada «nueva»: ' + q1.marca);
    cierto(q1.mismo, 'la lista es el MISMO contenedor de antes: sobrevive a los repintados del panel');
    /* renderAuth() corre en cada tecla del anticipo: la marca no se reinicia ni el renglón se rehace. */
    await p.waitForTimeout(600);
    const e0 = await ev(() => window.__fila.style.getPropertyValue('--lista-edad'));
    await ev(() => { for (let i = 0; i < 5; i++) renderAuth(); });
    const q2 = await ev(() => { const f = document.querySelector('#auth-cola .queue-item.remota'); return { mismo: f === window.__fila, nueva: f.classList.contains('lista-nueva'), edad: f.style.getPropertyValue('--lista-edad') }; });
    cierto(q2.mismo && q2.nueva && q2.edad === e0, 'repintar cinco veces el panel NO reinicia la marca: es el mismo renglón y conserva su edad (' + q2.edad + ')');
    await ev(() => { window.__pend = [window.__rem(1, 'COT-0091@XXXX'), window.__rem(2, 'COT-0092@XXXX')]; return cargarPendientesRemotas(); }); await p.waitForTimeout(300);
    const q3 = await ev(() => ({ filas: [...document.querySelectorAll('#auth-cola .queue-item.remota')].map(f => f.dataset.clave + (f.classList.contains('lista-nueva') ? '*' : '')),
      edades: [...document.querySelectorAll('#auth-cola .queue-item.remota')].map(f => parseFloat(f.style.getPropertyValue('--lista-edad'))),
      voz: (document.getElementById('vozStatus') || {}).textContent || '' }));
    /* La pieza rehace los renglones con innerHTML y le pasa al nuevo la EDAD del viejo (retardo negativo): la marca sigue donde iba. */
    cierto(q3.filas.join() === 'COT-0091@XXXX*,COT-0092@XXXX*' && q3.edades[0] < -400 && q3.edades[1] > -400, 'una segunda entra marcada y la primera conserva su marca CON su edad (' + q3.edades.join(' y ') + ' ms)', q3.filas.join());
    cierto(/Llegó una solicitud/.test(q3.voz), 'y se dice por la región viva: «' + q3.voz + '»');
    await s.captura('07-cola');
    await s.sinDesborde('en la cola de dirección', '#authbox');
    /* La que se va se despide en su sitio. */
    await ev(() => { window.__pend = [window.__rem(2, 'COT-0092@XXXX')]; return cargarPendientesRemotas(); }); await p.waitForTimeout(40);
    const q4 = await ev(() => ({ fantasma: !!document.querySelector('#auth-cola .lista-se-va'), filas: document.querySelectorAll('#auth-cola .queue-item.remota:not(.lista-se-va)').length }));
    cierto(q4.filas === 1 && (red ? !q4.fantasma : true), red ? 'con menos movimiento la que se quita desaparece sin fantasma' : 'la que se quita se despide en su sitio (fantasma inerte) y queda una', JSON.stringify(q4));
    await p.waitForTimeout(500);
    cierto(await ev(() => !document.querySelector('#auth-cola .lista-se-va')), 'y el fantasma se quita solo');
    /* La marca vence sola: es información («ya no es nueva»), no un adorno que se quede. */
    await p.waitForTimeout(3600);
    cierto(await ev(() => !document.querySelector('#auth-cola .lista-nueva')), 'a los cuatro segundos la marca «nueva» se va sola');

    /* ----- La revisión de la de otro teléfono ----- */
    await hojaLenta(s, 2200);
    /* Como en la hoja de verdad: una solicitud que se está decidiendo deja de salir en «pendientes» (el vigilante de 15 s la traería de vuelta). */
    await ev(() => { abrirRevisionRemota('COT-0092@XXXX'); window.__pend = []; }); await p.waitForTimeout(500);
    const m0 = await ev(() => ({ min: +$('rem-precio-r').min, max: +$('rem-precio-r').max, campo: +$('rem-precio').value, open: $('remotamodal').classList.contains('show'), alto: Math.round($('rem-precio-r').getBoundingClientRect().height) }));
    cierto(m0.open && Math.abs(m0.min - m0.campo * 0.8) < 0.01 && Math.abs(m0.max - m0.campo * 1.1) < 0.01 && m0.alto >= 43.5, 'la revisión remota trae el deslizador de −20 % a +10 %, de 44 px (' + m0.min + ' a ' + m0.max + ')');
    const cj = await s.centro('#rem-precio-r');
    const xr = f => cj.x + 22 + f * (cj.width - 44), yr = cj.y + cj.height / 2;
    await p.mouse.move(xr(0.667), yr); await p.mouse.down(); await p.mouse.move(xr(0.5) + 3, yr, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(250);
    const m1 = await ev(() => ({ campo: +$('rem-precio').value, frase: $('rem-ajuste').textContent, neto: $('rem-neto').textContent }));
    cierto(Math.abs(m1.campo - m0.campo * 0.95) < 0.011 && /Descuento: .* \(5%\)/.test(m1.frase), 'arrastrar cae en el imán de −5 % y la frase del ajuste sigue al campo: «' + m1.frase + '»');
    await s.sinDesborde('en la revisión remota', '#remotamodal');
    await s.captura('08-revision-remota');
    await ev(() => { window.__falla = true; });
    await p.tap('#rem-autorizar'); await p.waitForTimeout(1200);
    const m2 = await ev(() => ({ t: $('rem-autorizar').textContent, estado: $('rem-autorizar').dataset.estado, her: { aria: $('rem-rechazar').getAttribute('aria-disabled'), espera: $('rem-rechazar').hasAttribute('data-espera') } }));
    cierto(/^Sellando · \d+ s$/.test(m2.t) && m2.her.aria === 'true' && m2.her.espera, 'sellar la remota lo dice con reloj y aparta a «Rechazar»: «' + m2.t + '»');
    await p.tap('#rem-autorizar', { force: true }); await p.waitForTimeout(100);
    await p.waitForTimeout(1300);
    const m3 = await ev(() => ({ t: $('rem-autorizar').textContent, n: window.__n.autorizar, est: $('rem-estado').textContent, abierto: $('remotamodal').classList.contains('show'),
      her: $('rem-rechazar').hasAttribute('data-espera') }));
    cierto(/No se selló · Reintentar/.test(m3.t) && m3.n === 1 && m3.abierto && !m3.her, 'si la hoja no contestó dice «' + m3.t + '», no repitió la petición y libera a «Rechazar»', JSON.stringify(m3));
    cierto(/no contestó/i.test(m3.est), 'y la línea de abajo dice por qué: «' + m3.est + '»');
    await ev(() => { window.__falla = false; });
    await p.tap('#rem-autorizar'); await p.waitForFunction(() => /^Sellada/.test(document.getElementById('rem-autorizar').textContent), null, { timeout: 5000 }).catch(() => {});
    const m4 = await ev(() => ({ t: $('rem-autorizar').textContent, abierto: $('remotamodal').classList.contains('show'), neon: !!$('remotamodal').querySelector('.neon-capa') }));
    cierto(/^Sellada · PRUE-/.test(m4.t) && m4.abierto, 'al salir bien el botón se lava con el código y la revisión sigue abierta un momento: «' + m4.t + '»');
    cierto(m4.neon, 'con el neón sobre la tarjeta de la revisión');
    await s.captura('09-remota-sellada');
    await p.waitForFunction(() => !document.getElementById('remotamodal').classList.contains('show'), null, { timeout: 4000 }).catch(() => {});
    const m5 = await ev(() => ({ abierto: $('remotamodal').classList.contains('show'), cola: _remotas.length }));
    cierto(!m5.abierto && m5.cola === 0, 'después la revisión se cierra y la solicitud sale de la cola');
    await s.sinBucles('en la revisión remota', '#remotamodal,#authbox');
    /* «Rechazar» también dice que trabaja, y el botón de autorizar queda limpio al abrir otra. */
    await ev(() => { window.__hoja.solicitudes['COT-0093@XXXX'] = { estado: 'pendiente', nota: '', vez: 99 }; window.__pend = [window.__rem(3, 'COT-0093@XXXX')]; return cargarPendientesRemotas(); });
    await p.waitForTimeout(200);
    await ev(() => { const o = window.AL3D.hablar; window.AL3D.hablar = (r, c, e) => r === 'rechazar' ? new Promise(res => setTimeout(() => res(o(r, c, e)), 1100)) : o(r, c, e); });
    await ev(() => { abrirRevisionRemota('COT-0093@XXXX'); window.__pend = []; }); await p.waitForTimeout(400);
    cierto(await ev(() => /Autorizar precio/.test($('rem-autorizar').textContent) && !$('rem-autorizar').dataset.estado), 'al abrir otra solicitud el botón de autorizar vuelve a decir «Autorizar precio»');
    await p.tap('#rem-rechazar'); await p.waitForTimeout(500);
    cierto(await ev(() => /Avisando/.test($('rem-rechazar').textContent)), 'rechazar también dice que está avisando: «' + await ev(() => $('rem-rechazar').textContent) + '»');
    await p.waitForFunction(() => !document.getElementById('remotamodal').classList.contains('show'), null, { timeout: 5000 }).catch(() => {});
    cierto(await ev(() => !$('remotamodal').classList.contains('show') && _remotas.length === 0), 'y al contestar la hoja la revisión se cierra');
    sinErrores(s, 'en la cola y la revisión remota'); await s.cierra();
  }

  /* ============================== 6 · LA SOLICITUD A DIRECCIÓN CON SU RECORRIDO (C9) ============================== */
  {
    console.log('\n  — la solicitud a Dirección, con su recorrido —');
    const s = await sesion(R, { rol: 'ventas' }); const { p, ev } = s;
    await s.datos();
    await ev(() => { irAPaso(2); solicitar(); }); await p.waitForTimeout(900);
    const r0 = await ev(() => ({ estado: Q.estado, enviada: Q.solicitud && Q.solicitud.enviada, tramos: [...document.querySelectorAll('#authbox .recorrido .tramo')].map(t => t.dataset.e),
      glifos: document.querySelectorAll('#authbox .recorrido .marca-estado').length, voz: [...document.querySelectorAll('#authbox .recorrido .solo-voz')].map(x => x.textContent.trim()),
      badge: (document.querySelector('#authbox .badge .marca-estado') || { dataset: {} }).dataset.estado,
      hace: document.querySelector('#authbox .espera-hace').textContent }));
    cierto(r0.estado === 'pendiente' && r0.enviada, 'la solicitud quedó pendiente y llegó a la hoja');
    cierto(r0.tramos.join() === 'ok,ok,trabaja' && r0.glifos === 3, 'tres tramos con su glifo: este teléfono ✓, la hoja ✓, Dirección decide (arco)', r0.tramos.join());
    cierto(r0.voz.join() === '· listo,· listo,· en curso', 'y el estado de cada tramo también va con palabras para el lector de pantalla: ' + r0.voz.join(' '));
    cierto(r0.badge === 'trabaja', 'la insignia «Pendiente» usa el mismo glifo (el arco)');
    cierto(/preguntar sola cada 15 s/.test(r0.hace), 'antes de la primera respuesta dice qué hace la app: «' + r0.hace + '»');
    await s.centro('#authbox .recorrido');
    const arcos = await ev(() => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#authbox .me-arco') && a.effect.getComputedTiming().iterations === Infinity).length);
    cierto(red ? arcos === 0 : arcos >= 1, red ? 'con menos movimiento el arco queda quieto y solo hablan las palabras' : 'el arco gira mientras hay una espera de verdad (' + arcos + ')');
    await s.sinBucles('en la espera (solo el arco de la espera real puede girar)', '#sidebox,#authbox,#mbar,#pasos', '.me-arco');
    const c1 = await p.evaluate(enPagina.contraste, '#authbox .espera-hace');
    cierto(c1 >= 4.5, 'el «revisado hace» mide 4.5:1 o más: ' + c1.toFixed(2));
    const c2 = await p.evaluate(enPagina.contraste, '#authbox .tramo-t');
    cierto(c2 >= 4.5, 'los nombres de los tramos miden 4.5:1 o más: ' + c2.toFixed(2));
    await s.captura('10-solicitud');
    await s.sinDesborde('en la espera', '#authbox');
    /* El reloj: «revisado hace N s» corre con la pantalla a la vista. */
    await ev(() => consultarSolicitudes()); await p.waitForTimeout(300);
    const h0 = await ev(() => document.querySelector('#authbox .espera-hace').textContent);
    await p.waitForTimeout(2300);
    const h1 = await ev(() => document.querySelector('#authbox .espera-hace').textContent);
    cierto(/Revisado hace 0 s/.test(h0) && /Revisado hace [2-3] s/.test(h1), 'tras consultar dice «' + h0 + '» y cuenta: «' + h1 + '»');
    /* Con la pantalla oculta no corre. */
    await ev(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await p.waitForTimeout(2300);
    const h2 = await ev(() => document.querySelector('#authbox .espera-hace').textContent);
    cierto(h2 === h1, 'con la pantalla oculta el reloj se detiene («' + h2 + '»)');
    await ev(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await p.waitForTimeout(250);
    cierto(await ev(() => /Revisado hace \d s/.test(document.querySelector('#authbox .espera-hace').textContent)), 'y al volver se pinta de una vez');
    /* Repintar el panel no hace volver a empezar el giro. */
    const f1 = await ev(() => { const a = document.querySelector('#authbox .me-arco'); return a ? getComputedStyle(a).animationDelay : null; });
    cierto(red || /^-/.test(f1 || ''), 'el arco nace ya en fase al repintar, sin tirón (retardo ' + f1 + ')');
    /* Una solicitud que la hoja rechazó por el catálogo no espera nada: nada gira. */
    await ev(() => { Q.solicitud.enviada = false; Q.solicitud.definitivo = true; Q.solicitud.error = 'El catálogo de este teléfono no cuadra con la hoja.'; renderAuth(); });
    const d0 = await ev(() => ({ tramos: [...document.querySelectorAll('#authbox .recorrido .tramo')].map(t => t.dataset.e), hace: !!document.querySelector('#authbox .espera-hace'),
      giran: document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#authbox') && a.effect.getComputedTiming().iterations === Infinity).length }));
    cierto(d0.tramos.join() === 'ok,mal,espera' && !d0.hace && d0.giran === 0, 'si la hoja la rechazó por el catálogo: este ✓, la hoja ✕, y nada gira ni cuenta', JSON.stringify(d0));
    /* La respuesta de Dirección: rechazada. */
    await ev(() => { Q.solicitud.definitivo = false; Q.solicitud.enviada = true; Q.solicitud.error = ''; saveState(); __hoja.solicitudes[folioGlobal()].estado = 'rechazada'; __hoja.solicitudes[folioGlobal()].nota = 'muy caro'; });
    await ev(() => consultarSolicitudes()); await p.waitForTimeout(600);
    const d1 = await ev(() => ({ estado: Q.estado, badge: (document.querySelector('#authbox .badge .marca-estado') || { dataset: {} }).dataset.estado, recorrido: !!document.querySelector('#authbox .recorrido') }));
    cierto(d1.estado === 'rechazada' && d1.badge === 'mal' && !d1.recorrido, 'cuando Dirección rechaza la insignia lleva su cruz y el recorrido se va');
    sinErrores(s, 'en la solicitud'); await s.cierra();
  }

  /* ============================== 7 · EL DOCK (C10, C23 #1, #4) ============================== */
  {
    console.log('\n  — el botón principal del teléfono y su total —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos(null, { tel: '33 28' });
    await ev(() => irAPaso(1)); await p.waitForTimeout(500);
    const d0 = await ev(() => ({ btn: $('mbar').querySelector('.mbar-btn').textContent.trim().replace(/\s+/g, ' '),
      alto: Math.round($('mbar').querySelector('.mbar-btn').getBoundingClientRect().height) }));
    cierto(/Continuar a partidas/.test(d0.btn) && d0.alto >= 43.5, 'en la pantalla del cliente el dock es «Continuar a partidas →»: «' + d0.btn + '»');
    /* Sin datos completos, el propio botón dice qué falta. */
    await ev(() => { window.__btn = $('mbar').querySelector('.mbar-btn'); });
    await p.tap('#mbar .mbar-btn'); await p.waitForTimeout(220);
    const d1 = await ev(() => { const r = $('mbar').querySelector('.mbar-btn .rotulo'); return { alt: r && r.classList.contains('alt'), b: r && r.querySelector('.rotulo-b') && r.querySelector('.rotulo-b').textContent,
      sacude: $('mbar').querySelector('.mbar-btn').classList.contains('sacudida'), mismo: $('mbar').querySelector('.mbar-btn') === window.__btn }; });
    cierto(d1.alt && /^Falta el teléfono$/.test(d1.b), 'al tocarlo con el teléfono incompleto el propio botón dice «' + d1.b + '»');
    cierto(red ? !d1.sacude : true, red ? 'sin sacudida con menos movimiento' : 'y se sacude un momento');
    await s.captura('11-falta-en-el-boton');
    await p.waitForTimeout(1700);
    const d2 = await ev(() => { const r = $('mbar').querySelector('.mbar-btn .rotulo'); return { alt: r && r.classList.contains('alt'), txt: $('mbar').querySelector('.mbar-btn').textContent.trim() }; });
    cierto(!d2.alt && /Continuar/.test(d2.txt), 'a los 1.5 s vuelve a su rótulo: «' + d2.txt + '»');
    await p.fill('#f-tel', '33 2813 0092'); await p.waitForTimeout(300);
    /* Sin cambios, repintar el dock no toca el DOM: ni un nodo ni un atributo. */
    await ev(() => { window.__mut = 0; new MutationObserver(r => { window.__mut += r.length; }).observe($('mbar'), { subtree: true, childList: true, characterData: true, attributes: true }); for (let i = 0; i < 6; i++) renderMobileBar(); });
    await p.waitForTimeout(80);
    cierto(await ev(() => window.__mut) === 0, 'repintar el dock seis veces sin que cambie nada no toca el DOM (0 mutaciones)');
    await ev(() => irAPaso(2)); await p.waitForTimeout(600);
    /* El total rueda solo si el importe cambió. */
    await ev(() => { window.__am = $('mbar').querySelector('.mbar-amt'); });
    const t0 = await ev(() => $('mbar').querySelector('.mbar-amt').textContent);
    await ev(() => { Q.items[0].altura = 41; saveState(); renderItems(); renderSummary(); }); await p.waitForTimeout(90);
    const d3 = await ev(() => ({ rueda: !!$('mbar').querySelector('.mbar-amt.rueda-rodando,.mbar-amt .rueda-vista'), txt: $('mbar').querySelector('.mbar-amt').textContent, mismo: $('mbar').querySelector('.mbar-amt') === window.__am }));
    cierto(d3.txt !== t0 && d3.mismo, 'al cambiar el importe el total del dock cambia en su mismo nodo (' + t0 + ' → ' + d3.txt + ')');
    cierto(red ? !d3.rueda : d3.rueda, red ? 'con menos movimiento el total cambia sin rodar' : 'y rueda');
    await p.waitForTimeout(800);
    await ev(() => { renderSummary(); renderSummary(); });
    await p.waitForTimeout(80);
    cierto(await ev(() => !$('mbar').querySelector('.mbar-amt.rueda-rodando')), 'repintar con el mismo importe no lo hace rodar de nuevo');
    /* El mismo en la barra de pasos, en la pantalla del cliente. */
    await ev(() => irAPaso(1)); await p.waitForTimeout(700);
    await ev(() => { Q.items[0].altura = 42; saveState(); renderItems(); renderSummary(); }); await p.waitForTimeout(90);
    const d4 = await ev(() => ({ rueda: !!document.querySelector('#paso-total-v.rueda-rodando,#paso-total-v .rueda-vista'), txt: $('paso-total-v').textContent }));
    cierto(red ? !d4.rueda : d4.rueda, 'el total chiquito de la barra de pasos también rueda solo cuando cambia (' + d4.txt + ')');
    await p.waitForTimeout(800);
    /* Otra cotización no hace rodar hacia el cero. */
    await ev(() => irAPaso(2)); await p.waitForTimeout(500);
    await ev(() => nueva()); await p.waitForTimeout(60);
    cierto(await ev(() => !document.querySelector('#mbar .mbar-amt.rueda-rodando,#paso-total-v.rueda-rodando')), 'vaciar la cotización no hace rodar el total hacia el cero: cambia en seco');
    await ev(() => deshacerVaciado()); await p.waitForTimeout(500);
    await ev(() => irAPaso(2)); await p.waitForTimeout(400);
    /* El desglose del total. */
    cierto(await ev(() => document.querySelector('#mbar .mbar-tot').getBoundingClientRect().height >= 43.5), 'el total del dock mide 44 px con el dedo');
    await p.tap('#mbar .mbar-tot'); await p.waitForTimeout(450);
    const v0 = await ev(() => { const v = document.querySelector('.vistazo:popover-open'); return v && { filas: [...v.querySelectorAll('dt')].map(x => x.textContent), valores: [...v.querySelectorAll('dd')].map(x => x.textContent),
      exp: document.querySelector('#mbar .mbar-tot').getAttribute('aria-expanded'), neto: money(desgloseFinal().neto), blur: getComputedStyle(v.querySelector('dd')).filter }; });
    cierto(!!v0 && v0.filas.join() === 'Subtotal,IVA 16%,Total neto' && v0.exp === 'true', 'tocar el total abre el desglose: ' + (v0 && v0.filas.join(' · ')));
    cierto(!!v0 && v0.valores[2] === v0.neto, 'y el total del globo es el del dock: ' + (v0 && v0.valores.join(' · ')));
    cierto(!!v0 && /blur/.test(v0.blur), 'en borrador los importes del globo van difuminados, como los de la pantalla');
    await s.captura('12-desglose');
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);
    cierto(await ev(() => !document.querySelector('.vistazo:popover-open') && document.activeElement.classList.contains('mbar-tot')), 'Escape lo cierra y el foco vuelve al total');
    await p.focus('#mbar .mbar-tot'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    cierto(await ev(() => !!document.querySelector('.vistazo:popover-open')), 'con el teclado, Enter en el total lo abre');
    await p.tap('.vistazo:popover-open [data-ir-resumen]'); await p.waitForTimeout(500);
    cierto(await ev(() => !document.querySelector('.vistazo:popover-open')), '«Ver el resumen» cierra el globo y lleva a la columna del dinero');
    await s.sinDesborde('con el dock', null);
    await s.sinBucles('en el dock', '#mbar,#pasos');
    /* El siguiente paso cambia: el rótulo cruza en el mismo botón. */
    await ev(() => { window.__btn2 = $('mbar').querySelector('.mbar-btn'); window.__ob = $('mbar').querySelector('.mbar-btn').textContent.trim(); autorizarYoMismo(); });
    await p.waitForTimeout(150);
    const d5 = await ev(() => ({ mismo: $('mbar').querySelector('.mbar-btn') === window.__btn2, txt: $('mbar').querySelector('.mbar-btn').textContent.trim(),
      clase: $('mbar').querySelector('.mbar-btn').className, antes: window.__ob }));
    cierto(d5.mismo && /Autorizar/.test(d5.txt) && d5.clase.includes('ok'), 'cambiar de «' + d5.antes + '» a «' + d5.txt + '» deja el MISMO botón y le cambia el color', JSON.stringify(d5));
    sinErrores(s, 'en el dock'); await s.cierra();
  }

  /* ============================== 8 · COPIAR CONFIRMA EN SU BOTÓN (C11) ============================== */
  {
    console.log('\n  — copiar confirma en el mismo botón —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos();
    await ev(() => irAPaso(2)); await p.waitForTimeout(500);
    await s.centro('#s-sub-copiar');
    await p.tap('#s-sub-copiar'); await p.waitForTimeout(350);
    const c0 = await ev(async () => { const r = $('s-sub-copiar').querySelector('.rotulo'); const b = r && r.querySelector('.rotulo-b');
      return { alt: !!r && r.classList.contains('alt'), t: b ? b.textContent.trim() : '', pal: !!(b && b.querySelector('.palomita')), clip: await navigator.clipboard.readText().catch(() => null), esperado: money(subParaCanva().sub) }; });
    cierto(c0.alt && /Copiado/.test(c0.t) && c0.pal, '«Copiar» pasa a «✓ Copiado» en el mismo botón, con su palomita: «' + c0.t + '»');
    cierto(c0.clip === c0.esperado, 'y el portapapeles trae el subtotal exacto: ' + c0.clip);
    await s.captura('13-copiado');
    await s.sinDesborde('con el botón confirmado', '#s-sub-box');
    const av = await ev(() => (Piezas.aviso.vivos()[0] || {}).msg);
    cierto(/Subtotal copiado/.test(av || ''), 'el aviso de abajo se queda, para el lector de pantalla: «' + av + '»');
    await p.waitForTimeout(2200);
    cierto(await ev(() => { const r = $('s-sub-copiar').querySelector('.rotulo'); return !!r && !r.classList.contains('alt') && /^Copiar/.test(r.querySelector('.rotulo-a').textContent.trim()); }), 'y a los dos segundos vuelve a decir «Copiar»');
    await ev(() => irAPaso(1)); await p.waitForTimeout(500);
    const bl = await ev(() => { const b = document.querySelector('[onclick="copiarLinkDirRaw()"]'); return b ? { vis: b.getBoundingClientRect().width > 0 } : null; });
    if (bl && bl.vis) {
      await s.centro('[onclick="copiarLinkDirRaw()"]');
      await p.tap('[onclick="copiarLinkDirRaw()"]'); await p.waitForTimeout(350);
      cierto(await ev(() => { const r = document.querySelector('[onclick="copiarLinkDirRaw()"] .rotulo'); return !!r && r.classList.contains('alt') && /Copiado/.test(r.querySelector('.rotulo-b').textContent); }), '«Copiar link» del mapa confirma en su propio botón');
    } else cierto(false, 'no se encontró el botón «Copiar link» del mapa');
    sinErrores(s, 'al copiar'); await s.cierra();
  }

  /* ============================== 9 · LOS PLIEGUES ABREN CON SU ALTURA (C16) ============================== */
  {
    console.log('\n  — los pliegues abren con su altura —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos();
    await ev(() => irAPaso(1)); await p.waitForTimeout(500);
    await s.centro('#pdf-extra-box > summary');
    const soporta = await ev(() => CSS.supports('interpolate-size', 'allow-keywords'));
    const h0 = await ev(() => $('pdf-extra-box').getBoundingClientRect().height);
    await ev(() => { window.__hs = []; const t0 = performance.now(); const d = $('pdf-extra-box'); const f = () => { window.__hs.push([Math.round(performance.now() - t0), d.getBoundingClientRect().height]); if (performance.now() - t0 < 500) requestAnimationFrame(f); }; d.querySelector('summary').click(); requestAnimationFrame(f); });
    await p.waitForTimeout(700);
    const hs = await ev(() => window.__hs);
    const hFin = hs[hs.length - 1][1];
    const medio = hs.filter(([t, h]) => h > h0 + 4 && h < hFin - 4).length;
    if (soporta && !red) cierto(medio >= 2 && hFin > h0 + 40, 'el pliegue «Datos que salen en el PDF» crece con su altura (' + medio + ' cuadros intermedios, de ' + Math.round(h0) + ' a ' + Math.round(hFin) + ')');
    else cierto(medio === 0 && hFin > h0 + 40, soporta ? 'con menos movimiento abre en seco' : 'sin soporte del navegador abre en seco como siempre');
    cierto(await ev(() => $('pdf-extra-box').classList.contains('pliegue')), 'y es el pliegue de la pieza (.pliegue)');
    const dur = await ev(() => getComputedStyle($('pdf-extra-box'), '::details-content').transitionDuration);
    cierto(red ? parseFloat(dur) === 0 : (parseFloat(dur) > 0.15 && parseFloat(dur) <= 0.25), 'la transición dura ' + dur + (red ? ' (cero con menos movimiento)' : ' (200 ms)'));
    await s.captura('14-pliegue-abierto');
    /* «Otras salidas» reabre a mano al repintar: sin animar. */
    await ev(() => { irAPaso(2); autorizarYoMismo(); }); await p.waitForTimeout(300);
    await ev(() => autorizar()); await p.waitForFunction(() => Q.estado === 'autorizada', null, { timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(900);
    await s.centro('details.otras-salidas > summary');
    cierto(await ev(() => document.querySelector('details.otras-salidas').classList.contains('pliegue')), '«Otras salidas» es un pliegue de la pieza');
    await p.tap('details.otras-salidas > summary'); await p.waitForTimeout(500);
    const o0 = await ev(() => { const d = document.querySelector('details.otras-salidas'); return { open: d.open, h: d.getBoundingClientRect().height }; });
    const o1 = await ev(() => { renderAuth(); const d = document.querySelector('details.otras-salidas'); return { open: d.open, h: d.getBoundingClientRect().height }; });
    cierto(o0.open && o1.open && Math.abs(o0.h - o1.h) < 2, 'repintar el panel lo reabre YA abierto, sin recorrer su altura desde cero (' + Math.round(o0.h) + ' → ' + Math.round(o1.h) + ')');
    sinErrores(s, 'en los pliegues'); await s.cierra();
  }

  /* ============================== 10 · «QUITAR» EN LAS PARTIDAS SIN TERMINAR (C22) ============================== */
  {
    console.log('\n  — lo que se quita de las partidas sin terminar se despide —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos();
    await ev(() => { irAPaso(2); addItem({ enfocar: false }); addItem({ enfocar: false }); solicitar(); }); await p.waitForTimeout(600);
    const f0 = await ev(() => ({ show: $('faltmodal').classList.contains('show'), quitar: document.querySelectorAll('#falt-list .falt-quitar').length, n: Q.items.length }));
    cierto(f0.show && f0.quitar === 2 && f0.n === 3, 'el aviso lista las dos partidas vacías, cada una con su «Quitar»', JSON.stringify(f0));
    await s.captura('15-faltantes');
    await p.tap('#falt-list .falt-quitar'); await p.waitForTimeout(40);
    const f1 = await ev(() => { const r = document.querySelector('#falt-list .falt-row[aria-hidden="true"]'); return { inerte: !!r && r.inert, mudo: !!r && getComputedStyle(r).pointerEvents === 'none', n: Q.items.length }; });
    /* Con menos movimiento no hay salida que esperar: la partida se quita en el acto. */
    if (red) cierto(f1.n === 2, 'con menos movimiento no hay salida: la partida se quita en el acto', JSON.stringify(f1));
    else cierto(f1.inerte && f1.mudo && f1.n === 3, 'el renglón queda mudo e inerte desde el primer momento (un segundo toque no encuentra nada)', JSON.stringify(f1));
    await p.waitForTimeout(500);
    const f2 = await ev(() => ({ filas: document.querySelectorAll('#falt-list .falt-row:not(.lista-se-va)').length, n: Q.items.length, show: $('faltmodal').classList.contains('show') }));
    cierto(f2.n === 2 && f2.filas === 1 && f2.show, 'después se quita la partida y queda la otra en la lista (partidas: ' + f2.n + ')', JSON.stringify(f2));
    await p.tap('#falt-list .falt-quitar'); await p.waitForTimeout(700);
    const f3 = await ev(() => ({ show: $('faltmodal').classList.contains('show'), n: Q.items.length, estado: Q.estado }));
    cierto(!f3.show && f3.n === 1 && f3.estado === 'pendiente', 'al quitar la última, el aviso se cierra y la solicitud sigue su camino', JSON.stringify(f3));
    sinErrores(s, 'en las partidas sin terminar'); await s.cierra();
    /* Escape a media salida: la partida se quita, pero no se sigue con lo que el aviso iba a hacer. */
    const s2 = await sesion(R); await s2.datos();
    await s2.ev(() => { irAPaso(2); addItem({ enfocar: false }); solicitar(); }); await s2.p.waitForTimeout(500);
    await s2.p.tap('#falt-list .falt-quitar'); await s2.p.waitForTimeout(30); await s2.p.keyboard.press('Escape'); await s2.p.waitForTimeout(700);
    const g = await s2.ev(() => ({ n: Q.items.length, estado: Q.estado, show: $('faltmodal').classList.contains('show') }));
    if (red) cierto(g.n === 1 && !g.show, 'con menos movimiento la salida es instantánea y la solicitud sigue su camino', JSON.stringify(g));
    else cierto(g.estado === 'borrador' && !g.show && g.n === 1, 'si se cierra el aviso a media salida, la partida se quita pero NO se manda a autorizar', JSON.stringify(g));
    sinErrores(s2, 'en las partidas sin terminar (Escape)'); await s2.cierra();
  }

  /* ============================== 11 · MANTENER PARA CONFIRMAR Y EL VUELO AL HISTORIAL (C23 #5, C20) ============================== */
  {
    console.log('\n  — mantener para confirmar, y la cotización que vuela al Historial —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos();
    await ev(() => { irAPaso(2); autorizarYoMismo(); }); await p.waitForTimeout(400);
    await ev(() => autorizar()); await p.waitForFunction(() => Q.estado === 'autorizada', null, { timeout: 6000 }).catch(() => {});
    await p.waitForTimeout(900);
    await ev(() => { guardarAutorizadaYa(); window.__folio = Q.folio; });
    cierto(await ev(() => !!copiaGuardadaDeQ()), 'la cotización autorizada quedó guardada en el Historial');
    await ev(() => pedirConfNueva()); await p.waitForTimeout(300);
    cierto(await ev(() => $('conf-nueva-si').classList.contains('mantener')), '«Sí, borrar todo» es un botón de mantener presionado');
    await s.centro('#conf-nueva-si');
    /* Un toque suelto no borra nada y dice cómo. */
    await p.tap('#conf-nueva-si'); await p.waitForTimeout(500);
    const k0 = await ev(() => ({ items: Q.items.length, cliente: Q.cliente, txt: $('conf-nueva-si').textContent }));
    cierto(k0.items === 1 && k0.cliente === 'Farmacia San Juan' && /Mantén presionado/i.test(k0.txt), 'un toque suelto NO borra y dice cómo: «' + k0.txt.trim().replace(/\s+/g, ' ') + '»');
    /* Con el ratón: mantener hasta que se llene. */
    const bx = await p.locator('#conf-nueva-si').boundingBox();
    await p.waitForTimeout(1900);
    /* La tarjeta nace en el momento en que el botón se llena —con el dedo todavía abajo—, así que el observador va ANTES de apretar. */
    await ev(() => { window.__vuelo = 0; new MutationObserver(r => r.forEach(x => x.addedNodes.forEach(n => { if (n.classList && n.classList.contains('vuelo-cot')) { window.__vuelo++; window.__txt = n.textContent; } }))).observe(document.body, { childList: true }); });
    await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.mouse.down(); await p.waitForTimeout(500);
    cierto(await ev(() => Q.cliente === 'Farmacia San Juan'), 'a medio camino todavía no se borra');
    await p.waitForTimeout(1000);
    await p.mouse.up(); await p.waitForTimeout(80);
    const k1 = await ev(() => ({ cliente: Q.cliente, items: Q.items.length, aviso: (Piezas.aviso.vivos()[0] || {}).msg, folio: window.__folio }));
    cierto(k1.cliente === '' && /Cotización vaciada/.test(k1.aviso || ''), 'mantenerlo borra la cotización y el aviso lo dice');
    cierto(/quedó en el Historial/.test(k1.aviso || '') && (k1.aviso || '').includes(k1.folio), 'y dice dónde quedó: «' + k1.aviso + '»');
    await p.waitForTimeout(150);
    const v1 = await ev(() => ({ n: window.__vuelo, txt: window.__txt }));
    if (red) cierto(v1.n === 0, 'con menos movimiento no vuela nada (el aviso ya dice dónde quedó)');
    else {
      cierto(v1.n === 1 && /COT-\d{4}/.test(v1.txt || '') && /Farmacia San Juan/.test(v1.txt || ''), 'una tarjeta con el folio y el cliente vuela hacia el Historial: «' + v1.txt + '»');
      cierto(!/\$\d/.test(v1.txt || ''), 'sin el total: un importe no cruza la pantalla');
      await p.waitForTimeout(900);
      cierto(await ev(() => !document.querySelector('.vuelo-cot')), 'y al llegar la copia se quita sola');
    }
    /* «Deshacer» la trae de vuelta, y con el teclado también se mantiene. */
    await ev(() => deshacerVaciado()); await p.waitForTimeout(500);
    cierto(await ev(() => Q.cliente === 'Farmacia San Juan' && Q.estado === 'autorizada'), '«Deshacer» devuelve la cotización autorizada');
    await ev(() => pedirConfNueva()); await p.waitForTimeout(300);
    await p.focus('#conf-nueva-si'); await p.keyboard.down('Enter'); await p.waitForTimeout(700);
    cierto(await ev(() => Q.cliente === 'Farmacia San Juan'), 'con el teclado, Enter a medio sostener todavía no borra');
    await p.waitForTimeout(900); await p.keyboard.up('Enter'); await p.waitForTimeout(150);
    cierto(await ev(() => Q.cliente === ''), 'con el teclado, Enter sostenido hasta llenar sí borra');
    await p.waitForTimeout(900);
    /* Un borrador que se vacía NO vuela: su vuelta es «Deshacer». */
    await s.datos();
    await s.libre();
    await ev(() => { window.__vuelo = 0; irAPaso(2); pedirConfNueva(); }); await p.waitForTimeout(500);
    await s.centro('#conf-nueva-si');
    const bx2 = await p.locator('#conf-nueva-si').boundingBox();
    await s.dedo([[bx2.x + bx2.width / 2, bx2.y + bx2.height / 2]], { mantener: 1700 }); await p.waitForTimeout(120);
    const k2 = await ev(() => ({ cliente: Q.cliente, vuelo: window.__vuelo, hay: !!document.querySelector('.vuelo-cot'), aviso: (Piezas.aviso.vivos()[0] || {}).msg }));
    cierto(k2.cliente === '' && !k2.hay && !/Historial/.test(k2.aviso || ''), 'un borrador que se vacía con el dedo no vuela ni dice que quedó en el Historial: «' + k2.aviso + '»');
    await s.sinDesborde('después de vaciar', null);
    sinErrores(s, 'al vaciar'); await s.cierra();

    /* «Rechazar», del autorizador, también se mantiene presionado. */
    const s3 = await sesion(R); await s3.datos();
    await s3.ev(() => { irAPaso(2); solicitar(); }); await s3.p.waitForTimeout(700);
    await s3.ev(() => cambiarRol('autorizador')); await s3.p.waitForTimeout(500);
    cierto(await s3.ev(() => !!document.querySelector('#a-rechazar.mantener')), '«Rechazar» del autorizador es de mantener presionado');
    await s3.centro('#a-rechazar');
    await s3.p.tap('#a-rechazar'); await s3.p.waitForTimeout(400);
    cierto(await s3.ev(() => Q.estado === 'pendiente'), 'un toque suelto no rechaza');
    const rb = await s3.p.locator('#a-rechazar').boundingBox();
    await s3.p.waitForTimeout(1900);
    await s3.p.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await s3.p.mouse.down(); await s3.p.waitForTimeout(1500); await s3.p.mouse.up(); await s3.p.waitForTimeout(250);
    cierto(await s3.ev(() => Q.estado === 'rechazada'), 'mantenerlo rechaza la cotización');
    sinErrores(s3, 'al rechazar'); await s3.cierra();
  }

  /* ============================== 12 · EL PLAZO SUGERIDO DICE POR QUÉ (H19, C23 #2) ============================== */
  {
    console.log('\n  — el plazo sugerido lleva su etiqueta y su «¿por qué?» —');
    const s = await sesion(R); const { p, ev } = s;
    await s.datos([{ id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 300, n: 2, _lt: 0 }]);
    await ev(() => { $('pdf-extra-box').open = true; irAPaso(1); }); await p.waitForTimeout(600);
    await s.centro('#f-plazo');
    const z0 = await ev(() => ({ chips: [...document.querySelectorAll('#f-plazo .chip')].map(c => c.textContent.trim().replace(/\s+/g, ' ')), sug: [...document.querySelectorAll('#f-plazo .chip')].filter(c => /sugerido/i.test(c.textContent)).length,
      porque: (() => { const b = document.querySelector('#f-plazo-h .porque'); return b && { h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width), exp: b.getAttribute('aria-expanded') }; })() }));
    cierto(z0.sug === 1 && /sugerido/.test(z0.chips[3]), 'el chip que la app propone lleva «sugerido»: ' + z0.chips.join(' | '));
    cierto(!!z0.porque && z0.porque.h >= 43.5 && z0.porque.w >= 43.5, 'junto a la nota hay un «?» de 44 px');
    cierto(!(await ev(() => document.querySelector('#f-plazo-h .porque') && document.querySelector('#f-plazo-h .porque').closest('.chips'))), 'y el «?» no está dentro del grupo de chips (no cuenta como opción)');
    const cs = await p.evaluate(enPagina.contraste, '#f-plazo .chip:not(.on) small');
    cierto(cs == null || cs >= 4.5, 'la etiqueta chica del chip no elegido mide 4.5:1 o más' + (cs ? ': ' + cs.toFixed(2) : ' (la propuesta es el chip elegido)'));
    const cs2 = await p.evaluate(enPagina.contraste, '#f-plazo .chip.on small');
    cierto(cs2 == null || cs2 >= 4.5, 'y la del chip elegido también' + (cs2 ? ': ' + cs2.toFixed(2) : ''));
    await s.captura('16-plazo');
    await p.tap('#f-plazo-h .porque'); await p.waitForTimeout(450);
    const z1 = await ev(() => { const v = document.querySelector('.vistazo:popover-open'); return v && { items: [...v.querySelectorAll('li')].map(l => l.textContent), enPantalla: (() => { const r = v.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; })() }; });
    cierto(!!z1 && z1.items.length >= 3 && z1.items.some(x => /Letras 3D con iluminación/.test(x)) && z1.items.some(x => /3\.00 m no cabe en una lámina de 2\.44 m/.test(x)), 'el toque abre la razón con las cuentas: ' + (z1 && z1.items.join(' · ')));
    cierto(!!z1 && z1.enPantalla, 'y el globo cabe en la pantalla');
    await s.captura('17-plazo-porque');
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);
    cierto(await ev(() => !document.querySelector('.vistazo:popover-open') && document.activeElement.classList.contains('porque')), 'Escape lo cierra y el foco vuelve al «?»');
    /* Elegir otro: la ficha viaja, el «sugerido» se queda en la propuesta y la nota lo dice. */
    await p.tap('#f-plazo .chip:nth-child(1)'); await p.waitForTimeout(70);
    const z2 = await ev(() => ({ viaja: !!document.querySelector('#f-plazo .ficha-viaja'), nota: $('f-plazo-h').textContent, sug: [...document.querySelectorAll('#f-plazo .chip')].findIndex(c => /sugerido/i.test(c.textContent)), on: [...document.querySelectorAll('#f-plazo .chip')].findIndex(c => c.classList.contains('on')) }));
    cierto(red ? !z2.viaja : z2.viaja, red ? 'con menos movimiento la ficha no viaja: el elegido cambia como cambiaba' : 'la ficha viaja de un plazo al otro');
    cierto(z2.on === 0 && z2.sug === 3 && /Elegido a mano/.test(z2.nota), 'elegido a mano, el «sugerido» se queda en la propuesta (chip ' + (z2.sug + 1) + ') y la nota lo dice');
    await p.waitForTimeout(500);
    cierto(await ev(() => !document.querySelector('#f-plazo .ficha-viaja')), 'y la ficha solo existe durante el viaje');
    await s.sinDesborde('con el plazo', '#pdf-extra-box');
    await s.sinBucles('en el plazo', '#pdf-extra-box');
    sinErrores(s, 'en el plazo'); await s.cierra();
  }

  /* ============================== 13 · EN LA COMPUTADORA (una sola vez) ============================== */
  if (indice === 0) {
    console.log('\n  — en la computadora, con el ratón —');
    const s = await sesion(R, { escritorio: true }); const { p, ev } = s;
    await s.datos(null, { tel: '33 28' });
    await ev(() => irAPaso(1)); await p.waitForTimeout(500);
    /* El botón de «Continuar a partidas» de la pantalla del cliente dice qué falta. */
    await p.click('#p1-btn'); await p.waitForTimeout(250);
    const e0 = await ev(() => { const r = $('p1-btn').querySelector('.rotulo'); return { alt: r && r.classList.contains('alt'), b: r && r.querySelector('.rotulo-b') && r.querySelector('.rotulo-b').textContent, ancho: Math.round($('p1-btn').getBoundingClientRect().width) }; });
    cierto(e0.alt && e0.b === 'Falta el teléfono', 'con el ratón, «Continuar a partidas» dice «' + e0.b + '» durante un momento');
    await p.waitForTimeout(1700);
    const e1 = await ev(() => ({ ancho: Math.round($('p1-btn').getBoundingClientRect().width), alt: $('p1-btn').querySelector('.rotulo').classList.contains('alt') }));
    cierto(!e1.alt && e1.ancho === e0.ancho, 'y vuelve sin que el botón cambie de ancho (' + e0.ancho + ' px)');
    await ev(() => { document.querySelector('#f-tel').value = '33 2813 0092'; upd('tel', '33 2813 0092'); }); await p.waitForTimeout(300);
    const e2 = await ev(() => $('p1-btn').querySelector('.rotulo-a').textContent.trim().replace(/\s+/g, ' '));
    cierto(/Continuar a partidas/.test(e2) && !/Falta/.test(e2), 'el rótulo es el de siempre: «' + e2 + '»');
    const riel = await ev(() => ({ w: Math.round($('pasos').getBoundingClientRect().width), alto: [1, 2, 3, 4].map(i => Math.round($('tab-' + i).getBoundingClientRect().height)), avance: $('pasos').style.getPropertyValue('--avance') }));
    cierto(riel.avance === '0.50' && riel.alto.every(h => h >= 36), 'el riel de pasos va en ' + riel.avance + ' con las pestañas a su altura de escritorio (' + riel.alto.join('/') + ')');
    await p.screenshot({ path: join(CAP, '18-escritorio-cliente.png') });
    await ev(() => irAPaso(2)); await p.waitForTimeout(600);
    await p.screenshot({ path: join(CAP, '19-escritorio-partidas.png') });
    await s.sinDesborde('en la computadora', null);
    await s.sinBucles('en la computadora', '#pasos,#sidebox');
    sinErrores(s, 'en la computadora'); await s.cierra();
  }
}

for (const [i, R] of RONDAS.entries()) {
  const solo = (process.env.RONDA || '').split(',').filter(Boolean).map(Number);
  if (solo.length && !solo.includes(i + 1)) continue;
  await ronda(R, i);
}
await nav.close();
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
