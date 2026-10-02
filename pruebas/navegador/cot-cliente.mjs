/* LA BARRA DE ARRIBA Y EL FORMULARIO DEL CLIENTE, CON EL DEDO, EL RATÓN Y EL TECLADO.

   Lo que se defiende, y por qué se mide en un navegador y no se lee en el código:

   · LA LISTA DE CLIENTES (C6). Sustituye al <datalist> nativo, así que hay que probar lo que el
     nativo daba gratis: que se abre al teclear, que el foco NUNCA sale del campo (con el dedo y con el
     ratón), que flechas/Enter/Escape funcionan, que tocar una fila la elige y que ninguna fila mide
     menos de 44 px. Y lo que la hace más que un datalist: dos «Farmacia Guadalupe» con distinto
     teléfono son dos filas y elegir la segunda CAMBIA lo que la app puso por la primera, pero nunca lo
     que tecleó una persona ni lo que borró a propósito (vaciadoAMano). Los campos que llenó la app se
     lavan en verde —con menos movimiento, el verde se queda quieto—, y en borrador el importe de la
     última cotización va difuminado como los demás.
   · EL TELÉFONO SE VE COMPLETO (C8). «+52 3328130092» y «33-2813-0092» quedan «33 2813 0092 ✓» y
     Q.tel ya lo recibe así; el campo sigue pidiendo 16 px (el zoom de iOS) y lo que escribe la app
     sin evento también se cuenta.
   · LA ISLA DE ESTADO (C21). Una sola pastilla role="status" junto al folio. En reposo no ocupa sitio ni
     se mueve nada; sin señal, sellando y esperando a Dirección la abren y la enrollan sola; en ≤560 px
     es solo el icono y NO crece; el arco de «Sellando» es el único giro y solo mientras sella; al
     terminar dice «Sellada» solo si de verdad quedó autorizada; la barra no se desborda.
   · EL FOLIO QUE CAMBIA SE NOTA (C24). Voltean SOLO los caracteres que cambiaron, y solo si había un
     folio; repintar el mismo número no mueve nada; la marca «sin guardar» no voltea; el folio mide lo
     mismo que cuando era un texto; si llega otro folio a media vuelta, gana el último.
   · LOS ICONOS DICEN SU NOMBRE (C25). Mantener presionado enseña el nombre y ese toque NO dispara la
     acción —en «Eliminar» es lo importante—; con ratón el primero espera y el vecino sale al instante;
     con Tab sale al momento y Escape lo quita.
   · MANTENER PARA CONFIRMAR LO DESTRUCTIVO (C23 #5). confirmar({peligro}) exige sostener el botón; un
     toque corto no confirma; sin peligro el botón vuelve a contestar a un toque.

   Cada ronda es un teléfono distinto (360 y 420 px) en claro u oscuro, con o sin menos movimiento;
   sin errores de página, sin desborde horizontal, sin nada que se mueva solo en reposo dentro de lo que
   esta zona pinta, y con el contraste medido sobre lo que se ve.

   Uso:  PUERTO=8903 node pruebas/navegador/cot-cliente.mjs
         RONDA=1,3       para correr solo esas rondas, numeradas desde 1
         CAPTURAS=/ruta  para guardar capturas a 360 px (por omisión /tmp/cot-cliente-capturas) */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const CAP = process.env.CAPTURAS || join(tmpdir(), 'cot-cliente-capturas');
mkdirSync(CAP, { recursive: true });
const HOJA = fileURLToPath(new URL('./hoja-de-mentiras.js', import.meta.url));
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

/* El cuaderno de mentiras: cuatro clientes, dos de ellos con el MISMO nombre y distinto teléfono. */
const HOY = Date.now();
const CUADERNO = [
  { folio: 'COT-0041', cliente: 'Panadería La Espiga', tel: '33 1234 5678', dirRaw: 'Av. Chapultepec 480, Guadalajara', maps: '', proy: 'Letrero de fachada', neto: 12528, ts: HOY - 5 * 864e5, fechaAuth: '22 sep 2026' },
  { folio: 'COT-0038', cliente: 'Farmacia Guadalupe', tel: '33 2813 0092', dirRaw: 'Av. Juárez 215, Centro', maps: 'https://maps.example/centro', proy: 'Caja de luz', neto: 4640, ts: HOY - 9 * 864e5, fechaAuth: '18 sep 2026' },
  { folio: 'COT-0036', cliente: 'Barbería El Toro', tel: '33 1987 2210', dirRaw: 'Rubén Darío 1120, Providencia', maps: '', proy: 'Letras 3D', neto: 13920, ts: HOY - 12 * 864e5, fechaAuth: '15 sep 2026' },
  { folio: 'COT-0031', cliente: 'Farmacia Guadalupe', tel: '33 3615 4471', dirRaw: 'Independencia 90, Tlaquepaque', maps: '', proy: 'Rótulo', neto: 9280, ts: HOY - 30 * 864e5, fechaAuth: '28 ago 2026' },
];

/* ---------- Las medidas que se repiten, hechas dentro de la página ---------- */
const enPagina = {
  /* Contraste real de un elemento con texto: color de la letra contra el fondo EFECTIVO. Solo sirve
     sobre fondos planos. */
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

/* Una sesión nueva por sección: cada una arranca de un cotizador limpio, para que lo que una deja a
   medias no contamine a la siguiente. `escritorio` es el ratón de verdad (puntero fino). */
async function sesion(R, { escritorio = false, historial = true } = {}) {
  const { W, tema, red } = R;
  const anchoEsc = typeof escritorio === 'number' ? escritorio : 1440;
  const ctx = await nav.newContext({ viewport: { width: escritorio ? anchoEsc : W, height: escritorio ? 820 : 740 }, deviceScaleFactor: 2, isMobile: !escritorio, hasTouch: !escritorio,
    locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block', reducedMotion: red ? 'reduce' : 'no-preference' });
  await ctx.addInitScript({ path: HOJA });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|Failed to load resource/.test(m.text())) errs.push('consola: ' + m.text()); });
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof Q !== 'undefined' && typeof Piezas !== 'undefined' && typeof confirmar === 'function');
  await p.waitForTimeout(700);
  if (historial) await p.evaluate(h => { saveHistorial(h); pintarClientes(); }, CUADERNO);
  const cdp = await ctx.newCDPSession(p);
  const s = { ctx, p, errs, cdp, R, ancho: escritorio ? anchoEsc : W, ev: (f, a) => p.evaluate(f, a) };
  /* El dedo de verdad: touchStart, touchMove, touchEnd por CDP (page.tap solo toca). */
  s.dedo = async (puntos, { mantener = 0 } = {}) => {
    const [a, ...resto] = puntos;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a[0], y: a[1] }] });
    for (const q of resto) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1] }] });
    if (mantener) await espera(mantener);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  s.centro = async sel => { await s.ev(x => document.querySelector(x).scrollIntoView({ block: 'center' }), sel); await p.waitForTimeout(250); return p.locator(sel).boundingBox(); };
  s.sinDesborde = async (donde) => {
    const r = await s.ev(({ W }) => {
      const de = document.documentElement;
      const fuera = [...document.body.querySelectorAll('*')].filter(e => {
        const b = e.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(e).position === 'fixed') return false;
        if (e.closest('.mira,.toast,.vistazo,.desenfoque-borde,[hidden],.solo-voz,.isla:not(.ver),.mantener-capa,.nombre-tip,.combo-menu,.arranque,svg')) return false;
        return b.right > W + 1 || b.left < -1;
      }).slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 30));
      return { pagina: de.scrollWidth - de.clientWidth, fuera };
    }, { W: s.ancho });
    cierto(r.pagina <= 1 && !r.fuera.length, `sin desborde horizontal ${donde}`, JSON.stringify(r));
  };
  /* Lo que se mueve solo en reposo, dentro de la zona: nada. `permitir` es el selector de lo que SÍ
     puede girar porque hay una espera de verdad detrás (el arco de «Sellando»). */
  s.sinBucles = async (donde, zona, permitir = '') => {
    const r = await s.ev(({ zona, permitir }) => document.getAnimations().filter(a => {
      const t = a.effect && a.effect.target;
      if (!(a.effect && a.effect.getComputedTiming().iterations === Infinity && t && t.closest && t.closest(zona))) return false;
      return !(permitir && t.closest(permitir));
    }).map(a => (a.effect.target.className && a.effect.target.className.baseVal !== undefined ? a.effect.target.className.baseVal : a.effect.target.className || a.effect.target.tagName) + ':' + (a.animationName || a.transitionProperty)), { zona, permitir });
    cierto(!r.length, `nada gira ni late solo en reposo ${donde}`, JSON.stringify(r));
  };
  s.captura = async nombre => { if (R.W === 360) await p.screenshot({ path: join(CAP, `${nombre}-${R.tema}${R.red ? '-rm' : ''}.png`) }); };
  s.cierra = async () => { await ctx.close(); };
  return s;
}
const sinErrores = (s, donde) => cierto(!s.errs.length, `sin errores de página ${donde}`, JSON.stringify(s.errs));

/* La frase que dice la isla, y si está a la vista. */
const verIsla = s => s.ev(() => {
  const e = document.getElementById('isla'), r = e.getBoundingClientRect();
  return { ver: e.classList.contains('ver'), abierta: e.classList.contains('abierta'), estado: e.dataset.estado || '', tono: e.dataset.tono || '',
    texto: e.querySelector('.isla-t').textContent, w: Math.round(r.width), h: Math.round(r.height), pos: getComputedStyle(e).position,
    op: +getComputedStyle(e).opacity, marca: (e.querySelector('.marca-estado') || {}).dataset ? e.querySelector('.marca-estado').dataset.estado : '' };
});

async function ronda(R, indice) {
  const { W, tema, red } = R;
  console.log(`\n══ RONDA ${indice + 1} · ${W} px · ${tema} · ${red ? 'menos movimiento' : 'con movimiento'} ══`);

  /* ============================== 1 · LA LISTA DE CLIENTES (C6) ============================== */
  {
    console.log('\n  — la lista de clientes —');
    const s = await sesion(R); const { p, ev } = s;
    cierto(await ev(() => !document.getElementById('clientes-conocidos') && !document.getElementById('f-cli').hasAttribute('list')),
      'ya no hay <datalist>: la lista nativa de Android se fue');
    const inicial = await ev(() => { const i = document.getElementById('f-cli'); return { rol: i.getAttribute('role'), exp: i.getAttribute('aria-expanded'), ctl: i.getAttribute('aria-controls'), aut: i.getAttribute('aria-autocomplete'), abierta: document.getElementById('cli-menu').matches(':popover-open') }; });
    cierto(inicial.rol === 'combobox' && inicial.exp === 'false' && inicial.ctl === 'cli-lista' && inicial.aut === 'list' && !inicial.abierta,
      'el campo es un combobox cerrado de entrada', JSON.stringify(inicial));
    /* Con el dedo: tocar el campo la abre con todos, del más reciente al más viejo. */
    await p.tap('#f-cli'); await p.waitForTimeout(300);
    const a1 = await ev(() => {
      const m = document.getElementById('cli-menu'), i = document.getElementById('f-cli'), ib = i.getBoundingClientRect(), mb = m.getBoundingClientRect();
      const filas = [...document.querySelectorAll('#cli-lista [role="option"]')];
      return { abierta: m.matches(':popover-open'), exp: i.getAttribute('aria-expanded'), n: filas.length, minAlto: Math.min(...filas.map(f => f.getBoundingClientRect().height)),
        nombres: filas.map(f => f.querySelector('b').textContent), debajo: mb.top >= ib.bottom, dentro: mb.left >= 0 && mb.right <= innerWidth + 1, ancho: Math.round(mb.width), campo: Math.round(ib.width), foco: document.activeElement.id };
    });
    cierto(a1.abierta && a1.exp === 'true' && a1.n === 4, 'tocar el campo abre la lista con los cuatro cuadernos', JSON.stringify(a1));
    cierto(a1.minAlto >= 44, 'cada fila mide al menos 44 px (' + Math.round(a1.minAlto) + ')');
    cierto(a1.nombres[0] === 'Panadería La Espiga' && a1.nombres[3] === 'Farmacia Guadalupe', 'del más reciente al más viejo', a1.nombres.join(' | '));
    cierto(a1.debajo && a1.dentro && a1.ancho >= a1.campo - 1, 'cuelga debajo del campo, dentro de la pantalla y tan ancha como él', JSON.stringify(a1));
    cierto(a1.foco === 'f-cli', 'el foco se queda en el campo');
    const filaTxt = await ev(() => document.querySelector('#cli-lista [role="option"]').innerText.replace(/\s+/g, ' '));
    cierto(/33 1234 5678/.test(filaTxt) && /COT-0041/.test(filaTxt) && /22 sep 2026/.test(filaTxt) && /12,528/.test(filaTxt), 'la fila trae nombre, teléfono y la última cotización: «' + filaTxt + '»');
    await s.captura('01-lista');
    /* En borrador el importe va difuminado como los demás; «Ver precios» lo destapa. */
    const bl = await ev(() => { const f = getComputedStyle(document.querySelector('.combo-importe')).filter; document.body.classList.add('precios-a-la-vista'); const f2 = getComputedStyle(document.querySelector('.combo-importe')).filter; document.body.classList.remove('precios-a-la-vista'); return { f, f2, ocultos: document.body.classList.contains('precios-ocultos') }; });
    cierto(bl.ocultos && /blur/.test(bl.f) && bl.f2 === 'none', 'en borrador el importe de la última cotización va difuminado, y con los precios a la vista no', JSON.stringify(bl));
    /* Contraste de lo que dice cada fila. */
    for (const [sel, nombre] of [['#cli-lista .combo-op b', 'el nombre'], ['#cli-lista .combo-op span', 'el teléfono'], ['#cli-lista .combo-op small', 'la última cotización']]) {
      const c = await ev(enPagina.contraste, sel);
      cierto(c >= 4.5, `contraste de ${nombre} en la fila: ${c && c.toFixed(2)}:1`);
    }
    const otroTema = R.tema === 'oscuro' ? 'claro' : 'oscuro';
    await ev(t => document.documentElement.setAttribute('data-tema', t), otroTema); await p.waitForTimeout(400);
    for (const [sel, nombre] of [['#cli-lista .combo-op b', 'el nombre'], ['#cli-lista .combo-op small', 'la última cotización']]) {
      const c = await ev(enPagina.contraste, sel);
      cierto(c >= 4.5, `contraste de ${nombre} en la fila, tema ${otroTema}: ${c && c.toFixed(2)}:1`);
    }
    await ev(t => document.documentElement.setAttribute('data-tema', t), R.tema); await p.waitForTimeout(300);
    /* Teclear filtra: sin acentos, por teléfono, y dos «Farmacia Guadalupe» son dos filas. */
    await p.fill('#f-cli', ''); await p.keyboard.type('farmacia');
    await p.waitForTimeout(250);
    const f2 = await ev(() => [...document.querySelectorAll('#cli-lista [role="option"]')].map(f => f.innerText.replace(/\s+/g, ' ')));
    cierto(f2.length === 2 && f2.every(t => /Farmacia Guadalupe/.test(t)) && /2813 0092/.test(f2[0]) && /3615 4471/.test(f2[1]), 'teclear «farmacia» deja las dos Farmacia Guadalupe, distinguibles por su teléfono', JSON.stringify(f2));
    await p.fill('#f-cli', ''); await p.keyboard.type('barberia');
    await p.waitForTimeout(200);
    cierto(await ev(() => document.querySelectorAll('#cli-lista [role="option"]').length === 1), 'sin acentos: «barberia» encuentra «Barbería El Toro»');
    await p.fill('#f-cli', ''); await p.keyboard.type('198 7');
    await p.waitForTimeout(200);
    cierto(await ev(() => { const o = document.querySelectorAll('#cli-lista [role="option"]'); return o.length === 1 && /Toro/.test(o[0].innerText); }), 'por teléfono: «198 7» encuentra a quien lo tiene');
    await p.fill('#f-cli', ''); await p.keyboard.type('zzzz');
    await p.waitForTimeout(200);
    cierto(await ev(() => !document.getElementById('cli-menu').matches(':popover-open') && document.getElementById('f-cli').getAttribute('aria-expanded') === 'false'),
      'sin coincidencias no se abre nada: un cliente nuevo no tiene por qué ver una lista vacía encima del teléfono');
    /* Teclado: flechas, Enter, Escape. */
    await p.fill('#f-cli', ''); await p.keyboard.type('farm'); await p.waitForTimeout(250);
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(120);
    const k1 = await ev(() => { const i = document.getElementById('f-cli'); const act = document.getElementById(i.getAttribute('aria-activedescendant')); const pil = document.querySelector('.combo-pil'); return { id: act && act.id, sel: act && act.getAttribute('aria-selected'), pilOp: pil.style.opacity, tr: pil.style.transform, foco: document.activeElement.id }; });
    cierto(k1.id === 'cli-op-0' && k1.sel === 'true' && k1.pilOp === '1' && /translateY/.test(k1.tr) && k1.foco === 'f-cli', 'ArrowDown activa la primera fila y el resalte se coloca sin que el foco salga del campo', JSON.stringify(k1));
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(350);
    const k2 = await ev(() => { const pil = document.querySelector('.combo-pil'); const o = document.getElementById('cli-op-1'); return { id: document.getElementById('f-cli').getAttribute('aria-activedescendant'), y: pil.style.transform, arriba: o.offsetTop }; });
    cierto(k2.id === 'cli-op-1' && k2.y === `translateY(${k2.arriba}px)`, 'ArrowDown otra vez: el MISMO resalte baja un renglón (translateY ' + k2.arriba + ' px)', JSON.stringify(k2));
    await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(120);
    cierto(await ev(() => document.getElementById('f-cli').getAttribute('aria-activedescendant') === 'cli-op-1'), 'ArrowUp desde la primera da la vuelta a la última (' + 'cli-op-1' + ' de 2)');
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const k3 = await ev(() => ({ abierta: document.getElementById('cli-menu').matches(':popover-open'), v: document.getElementById('f-cli').value, cli: Q.cliente }));
    cierto(!k3.abierta && k3.v === 'farm' && k3.cli === 'farm', 'Escape cierra sin elegir nada', JSON.stringify(k3));
    /* Elegir con Enter la segunda Farmacia Guadalupe (la de Tlaquepaque). */
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(200);   // vuelve a abrirla y deja activa la primera
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(120);
    await p.keyboard.press('Enter'); await p.waitForTimeout(250);
    const e1 = await ev(() => ({ cli: Q.cliente, vcli: document.getElementById('f-cli').value, tel: Q.tel, vtel: document.getElementById('f-tel').value, dir: Q.dirRaw, abierta: document.getElementById('cli-menu').matches(':popover-open'),
      lav: ['f-tel', 'f-dir-raw'].map(i => document.getElementById(i).className.match(/lavado\S*/) ? document.getElementById(i).className.match(/lavado\S*/)[0] : ''), foco: document.activeElement.id,
      cont: document.querySelector('#fld-tel .tel-cuenta').textContent }));
    cierto(e1.cli === 'Farmacia Guadalupe' && /3615 4471/.test(e1.tel) && /Independencia 90/.test(e1.dir) && !e1.abierta, 'Enter elige la fila: nombre, teléfono y dirección del cuaderno de Tlaquepaque', JSON.stringify(e1));
    cierto(e1.vtel === '33 3615 4471' && e1.tel === '33 3615 4471' && e1.cont === '✓', 'el teléfono que puso la app se ve con formato y completo (✓), y Q.tel dice lo mismo', JSON.stringify(e1));
    cierto(red ? e1.lav.every(c => c === 'lavado-quieto') : e1.lav.every(c => c === 'lavado'), 'los campos que llenó la app se lavan' + (red ? ' con el verde quieto (menos movimiento)' : ' en verde'), JSON.stringify(e1.lav));
    await s.captura('02-elegida');
    if (!red) {
      const an = await ev(() => getComputedStyle(document.getElementById('f-dir-raw')).animationName);
      cierto(an === 'lavado-campo', 'y es una animación de 600 ms sobre el color de fondo del campo', an);
      await p.waitForTimeout(900);
      cierto(await ev(() => !document.getElementById('f-tel').classList.contains('lavado') && !document.getElementById('f-dir-raw').classList.contains('lavado')), 'el lavado se va solo');
    } else {
      await p.waitForTimeout(1400);
      cierto(await ev(() => !document.getElementById('f-tel').classList.contains('lavado-quieto')), 'el verde quieto se va a los 1.2 s');
    }
    /* Elegir la OTRA con el dedo: lo que puso la app se cambia (nadie lo tocó). */
    await p.fill('#f-cli', ''); await p.tap('#f-cli'); await p.keyboard.type('farmacia'); await p.waitForTimeout(300);
    const fila = await p.locator('#cli-lista [role="option"]').first().boundingBox();
    await p.touchscreen.tap(fila.x + fila.width / 2, fila.y + fila.height / 2); await p.waitForTimeout(300);
    const e2 = await ev(() => ({ cli: Q.cliente, tel: Q.tel, dir: Q.dirRaw, maps: Q.maps, foco: document.activeElement.id, abierta: document.getElementById('cli-menu').matches(':popover-open') }));
    cierto(e2.tel === '33 2813 0092' && /Juárez/.test(e2.dir) && /centro/.test(e2.maps) && !e2.abierta, 'tocar la primera Farmacia cambia lo que la app había puesto de la otra (nadie lo había tocado)', JSON.stringify(e2));
    cierto(e2.foco === 'f-cli', 'y el foco sigue en el campo después de tocar una fila');
    /* Lo que tecleó una persona no se pisa. */
    await p.fill('#f-tel', ''); await p.focus('#f-tel'); await p.keyboard.type('3399887766'); await p.waitForTimeout(100);
    await p.fill('#f-cli', ''); await p.tap('#f-cli'); await p.keyboard.type('toro'); await p.waitForTimeout(250);
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
    const e3 = await ev(() => ({ cli: Q.cliente, tel: Q.tel, dir: Q.dirRaw }));
    cierto(e3.cli === 'Barbería El Toro' && e3.tel === '33 9988 7766' && /Rubén Darío/.test(e3.dir), 'lo que se tecleó (el teléfono) no se pisa; lo vacío sí se llena (la dirección)', JSON.stringify(e3));
    /* Lo que se borró a propósito no vuelve (vaciadoAMano). */
    await p.focus('#f-tel'); await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace'); await p.waitForTimeout(100);
    await p.fill('#f-cli', ''); await p.tap('#f-cli'); await p.keyboard.type('panader'); await p.waitForTimeout(250);
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
    const e4 = await ev(() => ({ cli: Q.cliente, tel: Q.tel, vtel: document.getElementById('f-tel').value }));
    cierto(e4.cli === 'Panadería La Espiga' && e4.tel === '' && e4.vtel === '', 'lo que se vació a mano no vuelve, aunque se elija otro cliente (vaciadoAMano)', JSON.stringify(e4));
    /* Reconocer el nombre completo tecleado sigue llenando, cierra la lista y lava. */
    await ev(() => { nueva(); }); await p.waitForTimeout(300);
    await p.tap('#f-cli'); await p.keyboard.type('Dental'); await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace');
    await p.keyboard.type('Barbería El Toro'); await p.waitForTimeout(300);
    const e5 = await ev(() => ({ tel: Q.tel, abierta: document.getElementById('cli-menu').matches(':popover-open'), lav: document.getElementById('f-tel').className.includes('lavado') }));
    cierto(e5.tel === '33 1987 2210' && !e5.abierta && e5.lav, 'teclear el nombre completo llena el teléfono, cierra la lista (el lavado se vería debajo) y lava', JSON.stringify(e5));
    /* Si la pantalla cambia con la lista abierta, no se queda flotando. */
    await ev(() => { document.getElementById('f-cli').value = ''; }); await p.tap('#f-cli'); await p.waitForTimeout(250);
    cierto(await ev(() => document.getElementById('cli-menu').matches(':popover-open')), 'la lista está abierta');
    await ev(() => irAPaso(2)); await p.waitForTimeout(500);
    cierto(await ev(() => !document.getElementById('cli-menu').matches(':popover-open')), 'si la pantalla cambia con la lista abierta, se cierra: no queda flotando sobre otra pantalla');
    await ev(() => irAPaso(1)); await p.waitForTimeout(400);
    sinErrores(s, 'con la lista'); await s.sinDesborde('con la lista abierta');
    await s.cierra();
  }

  /* ============================== 2 · EL TELÉFONO SE VE COMPLETO (C8) ============================== */
  {
    console.log('\n  — el teléfono se ve completo —');
    const s = await sesion(R, { historial: false }); const { p, ev } = s;
    const base = await ev(() => { const i = document.getElementById('f-tel'); return { fs: parseFloat(getComputedStyle(i).fontSize), caja: !!i.closest('.tel-vivo'), ph: i.placeholder, cont: document.querySelector('#fld-tel .tel-cuenta').textContent,
      desc: i.getAttribute('aria-describedby') }; });
    cierto(base.fs >= 16, 'el campo sigue pidiendo 16 px, contra el zoom de iOS (' + base.fs + ')');
    cierto(base.caja && base.cont === '0/10' && /hint-oblig/.test(base.desc) && /\s/.test(base.desc), 'la pieza lo envuelve, cuenta «0/10» y suma su estado al aria-describedby de siempre', JSON.stringify(base));
    cierto(base.ph === '10 dígitos', 'el ejemplo dice lo que se pide y no se corta contra el contador');
    await p.tap('#f-tel'); await p.keyboard.type('+52 3328130092'); await p.waitForTimeout(150);
    const t1 = await ev(() => ({ v: document.getElementById('f-tel').value, q: Q.tel, c: document.querySelector('#fld-tel .tel-cuenta').textContent, falta: telIncompleto(Q.tel), completo: document.querySelector('#fld-tel .tel-vivo').classList.contains('completo') }));
    cierto(t1.v === '33 2813 0092' && t1.q === '33 2813 0092' && t1.c === '✓' && !t1.falta && t1.completo, 'pegar «+52 3328130092» deja «33 2813 0092 ✓» y upd() ya lo recibe así', JSON.stringify(t1));
    await s.captura('03-telefono-completo');
    await p.fill('#f-tel', '33-2813-0092'); await p.waitForTimeout(100);
    cierto(await ev(() => document.getElementById('f-tel').value === '33 2813 0092' && !telIncompleto(Q.tel)), 'con guiones también: se cuentan los dígitos, como siempre');
    await p.fill('#f-tel', ''); await p.focus('#f-tel'); await p.keyboard.type('3312345'); await p.waitForTimeout(100);
    const t2 = await ev(() => ({ v: document.getElementById('f-tel').value, c: document.querySelector('#fld-tel .tel-cuenta').textContent, falta: telIncompleto(Q.tel) }));
    cierto(t2.v === '33 1234 5' && t2.c === '7/10' && t2.falta, 'a medias dice «7/10» y el paso 1 sigue frenándolo', JSON.stringify(t2));
    /* El ámbar de lo que falta, y que se apaga al completarlo. */
    await ev(() => { _marcarOblig = true; pintarObligatorios(); });
    const t3 = await ev(() => ({ falta: document.getElementById('fld-tel').classList.contains('falta'), inv: document.getElementById('f-tel').getAttribute('aria-invalid'), frase: faltaTexto(OBLIGATORIOS[1]) }));
    cierto(t3.falta && t3.inv === 'true' && /10 dígitos/.test(t3.frase), 'el ámbar y aria-invalid siguen funcionando, con su frase', JSON.stringify(t3));
    await p.keyboard.type('678'); await p.waitForTimeout(150);
    const t4 = await ev(() => ({ falta: document.getElementById('fld-tel').classList.contains('falta'), c: document.querySelector('#fld-tel .tel-cuenta').textContent }));
    cierto(!t4.falta && t4.c === '✓', 'al completar el número el ámbar se apaga solo y el contador pasa a ✓', JSON.stringify(t4));
    await ev(() => { document.getElementById('f-tel').value = '33 12'; });
    cierto(await ev(() => document.querySelector('#fld-tel .tel-cuenta').textContent === '4/10'), 'lo que la app escribe sin evento (historial, autocompletar) también se cuenta');
    const cc = await ev(enPagina.contraste, '#fld-tel .tel-cuenta');
    cierto(cc >= 4.5, 'contraste del contador: ' + (cc && cc.toFixed(2)) + ':1');
    sinErrores(s, 'con el teléfono'); await s.sinDesborde('con el teléfono'); await s.cierra();
  }

  /* ============================== 3 · LA ISLA DE ESTADO (C21) ============================== */
  {
    console.log('\n  — la isla de estado —');
    const s = await sesion(R, { historial: false }); const { p, ev } = s;
    const angosto = W <= 560;
    const r0 = await verIsla(s);
    cierto(!r0.ver && r0.pos === 'absolute' && r0.w <= 1 && r0.op === 0, 'en reposo no ocupa sitio ni se ve (1 px recortado, fuera del reparto)', JSON.stringify(r0));
    cierto(await ev(() => document.querySelectorAll('.topbar [role="status"]').length === 1 && document.getElementById('isla').getAttribute('role') === 'status' && !document.getElementById('isla').hidden),
      'es el único role="status" de la barra y no lleva hidden (el lector la oye al cambiar)');
    await s.sinBucles('con la barra en reposo', '.topbar');
    const fila0 = await ev(() => { const f = document.getElementById('folio').getBoundingClientRect(); return { top: Math.round(f.top), w: Math.round(f.width), h: Math.round(f.height) }; });
    /* Sin señal. */
    await s.ctx.setOffline(true); await p.waitForTimeout(600);
    const r1 = await verIsla(s);
    cierto(r1.ver && r1.estado === 'sin-senal' && /Sin señal · se guarda aquí/.test(r1.texto), 'sin señal: la pastilla aparece y lo dice («' + r1.texto + '»)', JSON.stringify(r1));
    if (angosto) cierto(r1.w === 32 && r1.h === 32 && !r1.abierta || r1.w === 32, 'en ≤560 px es solo el icono: 32 px y no crece (' + r1.w + '×' + r1.h + ')', JSON.stringify(r1));
    const pos = await ev(() => { const i = document.getElementById('isla').getBoundingClientRect(), f = document.getElementById('folio').getBoundingClientRect(); return { dy: Math.round(Math.abs(i.top + i.height / 2 - (f.top + f.height / 2))), dentro: i.right <= innerWidth && i.left >= 0, izq: i.left >= f.right - 1 }; });
    cierto(pos.dy <= 8 && pos.dentro && pos.izq, 'queda junto al folio, en su mismo renglón y dentro de la pantalla', JSON.stringify(pos));
    const fila1 = await ev(() => { const f = document.getElementById('folio').getBoundingClientRect(); return { top: Math.round(f.top), w: Math.round(f.width) }; });
    cierto(fila1.top === fila0.top, 'y el folio no cambió de renglón (' + fila0.top + ' → ' + fila1.top + '): la barra no se rompió');
    await s.sinDesborde('con «sin señal»');
    await s.captura('04-isla-sin-senal');
    cierto(await ev(() => /Sin señal/.test(document.getElementById('isla').title)), 'y su title explica que lo tecleado se guarda en el teléfono');
    /* Vuelve. */
    await s.ctx.setOffline(false); await p.waitForTimeout(500);
    const r2 = await verIsla(s);
    cierto(r2.ver && r2.tono === 'ok' && r2.texto === 'Volvió la señal' && r2.marca === 'ok', 'al volver la señal dice «Volvió la señal» con la palomita, en verde', JSON.stringify(r2));
    if (angosto) cierto(await ev(() => /Volvió la señal/.test((document.getElementById('toast') || {}).textContent || '')), 'y en el teléfono, donde la pastilla es solo un icono, el aviso con palabras sí sale');
    else cierto(await ev(() => !/Volvió la señal/.test((document.getElementById('toast') || {}).textContent || '')), 'con la palabra a la vista no se repite en un aviso');
    await p.waitForTimeout(2700);
    const r3 = await verIsla(s);
    cierto(!r3.ver && r3.texto === '', 'y se va sola, sin dejar texto ni sitio', JSON.stringify(r3));
    /* Sellando: el único giro, y solo mientras sella. */
    await ev(() => { _sellando = true; renderAuth(); }); await p.waitForTimeout(600);
    const r4 = await verIsla(s);
    cierto(r4.ver && r4.estado === 'sellando' && r4.marca === 'trabaja' && /Sellando/.test(r4.texto), 'sellando: la pastilla lo dice con el arco que gira', JSON.stringify(r4));
    if (!angosto) cierto(r4.abierta && r4.w > 100, 'y se queda abierta mientras dure (' + r4.w + ' px)', JSON.stringify(r4));
    await s.sinBucles('mientras sella, salvo el arco de la isla', '.topbar', '#isla');
    if (!red) {
      const gira = await ev(() => document.getAnimations().some(a => a.effect && a.effect.getComputedTiming().iterations === Infinity && a.effect.target.closest && a.effect.target.closest('#isla')));
      cierto(gira, 'mientras sella el arco gira (es una espera de verdad)');
    }
    await s.captura('05-isla-sellando');
    await p.waitForTimeout(3800);
    cierto((await verIsla(s)).ver, 'sellando no se enrolla ni se va mientras sella');
    await ev(() => { _sellando = false; Q.estado = 'autorizada'; renderAuth(); }); await p.waitForTimeout(600);
    const r5 = await verIsla(s);
    cierto(r5.ver && r5.texto === 'Sellada' && r5.tono === 'ok', 'al terminar bien y estar autorizada dice «Sellada»', JSON.stringify(r5));
    await ev(() => { Q.estado = 'borrador'; saveState(); });
    await p.waitForTimeout(2800);
    cierto(!(await verIsla(s)).ver, 'y se va');
    await s.sinBucles('con la isla ya apagada', '.topbar');
    /* Sellar falló: se va sin afirmar nada. */
    await ev(() => { _sellando = true; renderAuth(); }); await p.waitForTimeout(500);
    await ev(() => { _sellando = false; renderAuth(); }); await p.waitForTimeout(500);
    const r6 = await verIsla(s);
    cierto(!r6.texto || r6.texto === '' || !/Sellada/.test(r6.texto), 'si sellar falla NO dice «Sellada»: se va callada (el error ya salió en su aviso)', JSON.stringify(r6));
    await p.waitForTimeout(700);
    cierto(!(await verIsla(s)).ver, 'y no deja la pastilla puesta');
    await s.sinBucles('con la isla apagada tras un sellado que falló (el arco no gira a escondidas)', '.topbar');
    cierto(await ev(() => document.querySelector('#isla .isla-ic').children.length === 0), 'y sin glifo escondido adentro');
    /* Esperando a Dirección, y que cambia al contestar. */
    await ev(() => { Q.estado = 'pendiente'; Q.solicitud = { enviada: true, ts: Date.now() }; saveState(); }); await p.waitForTimeout(600);
    const r7 = await verIsla(s);
    cierto(r7.ver && r7.estado === 'esperando' && r7.texto === 'Esperando a Dirección' && r7.marca === 'espera', 'esperando: «Esperando a Dirección» con el anillo punteado', JSON.stringify(r7));
    await s.sinBucles('esperando (el anillo es quieto)', '.topbar');
    await s.sinDesborde('con «esperando»');
    await ev(() => { Q.estado = 'autorizada'; Q.solicitud = null; saveState(); }); await p.waitForTimeout(600);
    const r8 = await verIsla(s);
    cierto(r8.ver && r8.texto === 'Dirección autorizó' && r8.tono === 'ok', 'cuando Dirección autoriza lo dice', JSON.stringify(r8));
    await ev(() => { Q.estado = 'pendiente'; Q.solicitud = { enviada: true }; saveState(); }); await p.waitForTimeout(500);
    await ev(() => { Q.estado = 'borrador'; Q.solicitud = null; saveState(); }); await p.waitForTimeout(700);
    const r9 = await verIsla(s);
    cierto(!r9.ver || !/autoriz/.test(r9.texto), 'si la solicitud se cancela no afirma que Dirección autorizó', JSON.stringify(r9));
    /* Repintar no la mueve: guardar en cada tecla con el mismo estado no cambia nada. */
    await ev(() => { Q.estado = 'pendiente'; Q.solicitud = { enviada: true }; saveState(); }); await p.waitForTimeout(600);
    await ev(() => { window.__marca = document.getElementById('isla').querySelector('.marca-estado'); for (let i = 0; i < 5; i++) saveState(); }); await p.waitForTimeout(700);
    cierto(await ev(() => document.getElementById('isla').querySelector('.marca-estado') === window.__marca), 'guardar en cada tecla con el mismo estado no repinta la pastilla');
    await ev(() => { Q.estado = 'borrador'; Q.solicitud = null; saveState(); });
    sinErrores(s, 'con la isla'); await s.cierra();
  }

  /* ============================== 4 · EL FOLIO QUE CAMBIA SE NOTA (C24) ============================== */
  {
    console.log('\n  — el folio que voltea —');
    const s = await sesion(R); const { p, ev } = s;
    const voltean = () => ev(() => new Set(document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('fc')).map(a => a.effect.target)).size);
    const folio = () => ev(() => ({ sr: document.querySelector('#folio .folio-sr').textContent, cel: document.querySelector('#folio .fcs').textContent, dato: document.getElementById('folio').dataset.folio,
      oculto: document.querySelector('#folio .fcs').getAttribute('aria-hidden') }));
    const f0 = await folio();
    cierto(f0.sr === f0.cel && f0.oculto === 'true' && /^COT-\d{4}$/.test(f0.sr), 'las casillas van aria-hidden y el folio entero va en su texto para el lector: «' + f0.sr + '»', JSON.stringify(f0));
    cierto((await voltean()) === 0, 'al arrancar no voltea nada: no había folio antes');
    await ev(() => pintarFolio()); await ev(() => pintarFolio());
    cierto((await voltean()) === 0, 'repintar el mismo folio no mueve nada (pintarFolio corre en cada guardado fallido)');
    /* Medidas: el folio mide lo mismo que cuando era un solo texto. */
    const w = await ev(() => { const f = document.querySelector('#folio .fcs'), t = document.createElement('span'); t.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'; const cs = getComputedStyle(f); t.style.fontFamily = cs.fontFamily; t.style.fontSize = cs.fontSize; t.style.fontWeight = cs.fontWeight; t.style.fontVariantNumeric = 'tabular-nums'; t.textContent = document.getElementById('folio').dataset.folio; document.body.append(t); const r = { a: f.getBoundingClientRect().width, b: t.getBoundingClientRect().width }; t.remove(); return r; });
    cierto(Math.abs(w.a - w.b) <= 3, 'las casillas no ensanchan la píldora: ' + w.a.toFixed(1) + ' px contra ' + w.b.toFixed(1) + ' px del texto corrido', JSON.stringify(w));
    /* Dos caracteres cambian. */
    await ev(() => { Q.folio = 'COT-0042'; pintarFolio(); });
    await p.waitForTimeout(40);
    const n1 = await voltean();
    if (red) cierto(n1 === 0 && (await folio()).cel === 'COT-0042', 'con menos movimiento el número cambia en seco', JSON.stringify(await folio()));
    else {
      cierto(n1 === 2, 'de 0001 a 0042 voltean EXACTAMENTE los dos que cambiaron (' + n1 + ')');
      const ya = await ev(() => [...document.querySelectorAll('#folio .fc')].map(c => c.textContent).join(''));
      cierto(/^COT-00/.test(ya), 'los que no cambiaron no se tocan (siguen diciendo «' + ya.slice(0, 6) + '»)');
      await s.captura('06-folio-volteando');
      await p.waitForTimeout(900);
      const f1 = await folio();
      cierto(f1.cel === 'COT-0042' && f1.sr === 'COT-0042' && (await voltean()) === 0, 'al terminar dice COT-0042 y no queda nada animándose', JSON.stringify(f1));
      await ev(() => { Q.folio = 'COT-0043'; pintarFolio(); }); await p.waitForTimeout(30);
      cierto((await voltean()) === 1, 'de 0042 a 0043 voltea UNO solo');
      await p.waitForTimeout(800);
      await ev(() => { Q.folio = 'COT-0039'; pintarFolio(); }); await p.waitForTimeout(30);
      cierto((await voltean()) === 2, 'de 0043 a 0039 voltean dos');
      await p.waitForTimeout(800);
      /* A media vuelta llega otro folio: gana el último. */
      await ev(() => { Q.folio = 'COT-0050'; pintarFolio(); }); await p.waitForTimeout(60);
      await ev(() => { Q.folio = 'COT-0051'; pintarFolio(); }); await p.waitForTimeout(1100);
      const f2 = await folio();
      cierto(f2.cel === 'COT-0051' && f2.sr === 'COT-0051' && (await voltean()) === 0, 'si llega otro folio a media vuelta gana el último, sin dejar uno viejo escrito', JSON.stringify(f2));
    }
    /* El camino de verdad: empezar otra cotización con el cuaderno ya lleno. */
    await ev(() => { nueva(); }); await p.waitForTimeout(40);
    const nv = await ev(() => ({ dato: document.getElementById('folio').dataset.folio, q: Q.folio }));
    cierto(nv.dato === nv.q, 'nueva() cambia el folio de la píldora al de Q (' + nv.q + ')', JSON.stringify(nv));
    await p.waitForTimeout(900);
    /* «Sin guardar» no voltea. */
    await ev(() => { _saveOk = false; pintarFolio(); }); await p.waitForTimeout(40);
    const sg = await ev(() => { const m = document.querySelector('#folio > .folio-mal'); return { hay: !!m, fuera: m && !m.closest('.fcs'), texto: document.getElementById('folio').textContent, cls: document.getElementById('folio').className, n: document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.folio-mal')).length }; });
    cierto(sg.hay && sg.fuera && /sin guardar/.test(sg.texto) && /nosave/.test(sg.cls) && sg.n === 0, 'la marca «sin guardar» es hermana de las casillas y no voltea', JSON.stringify(sg));
    cierto((await voltean()) === 0, 'y ponerla no hace voltear el folio');
    const cg = await ev(enPagina.contraste, '#folio .folio-mal');
    cierto(cg >= 4.5, '«sin guardar» se lee: ' + (cg && cg.toFixed(2)) + ':1');
    await ev(() => { _saveOk = true; pintarFolio(); }); await p.waitForTimeout(40);
    cierto(await ev(() => !document.querySelector('#folio > .folio-mal') && !/sin guardar/.test(document.getElementById('folio').textContent)), 'y se quita en cuanto vuelve a guardar');
    await s.sinBucles('con el folio', '#folio');
    sinErrores(s, 'con el folio'); await s.sinDesborde('con el folio'); await s.cierra();
  }

  /* ============================== 5 · LOS ICONOS DICEN SU NOMBRE (C25) ============================== */
  {
    console.log('\n  — los iconos dicen su nombre —');
    const s = await sesion(R); const { p, ev } = s;
    await ev(() => {
      Q.cliente = 'Farmacia San Juan'; Q.proy = 'Letrero fachada'; Q.tel = '33 2813 0092';
      Q.items = [{ id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8, _lt: 0 },
        { id: 2, tipo: 'letras', material: '', altura: 0, n: 0 }];
      pid = Math.max(pid, 2); saveState(); renderItems(); renderSummary();
    });
    await ev(() => irAPaso(2)); await p.waitForTimeout(700);
    const tip = () => ev(() => { const t = document.querySelector('.nombre-tip'); return t ? { abierto: t.classList.contains('pz-abierto') || t.matches(':popover-open'), texto: t.textContent, aria: t.getAttribute('aria-hidden') } : null; });
    /* Con el dedo: mantener 450 ms enseña el nombre y NO dispara el botón. */
    const bC = await p.locator('.btn-hist[aria-label="Cuadernos de cliente"]').boundingBox();
    cierto(!!bC && bC.width >= 44 && bC.height >= 44, 'el botón de Clientes (solo icono) mide al menos 44 px: ' + (bC && Math.round(bC.width) + '×' + Math.round(bC.height)));
    await s.dedo([[bC.x + bC.width / 2, bC.y + bC.height / 2]], { mantener: 700 });
    await p.waitForTimeout(100);
    const t1 = await tip();
    cierto(t1 && t1.abierto && /Cuadernos de cliente/.test(t1.texto) && t1.aria === 'true', 'mantener presionado «Clientes» enseña su nombre (una sola etiqueta, aria-hidden)', JSON.stringify(t1));
    await s.captura('07-nombre-con-el-dedo');
    cierto(await ev(() => !document.getElementById('climodal').classList.contains('show')), 'y ese toque NO abrió los cuadernos');
    await p.waitForTimeout(1300);
    cierto(!(await tip() || {}).abierto, 'la etiqueta se va sola después de soltar');
    await p.tap('.btn-hist[aria-label="Cuadernos de cliente"]'); await p.waitForTimeout(500);
    cierto(await ev(() => document.getElementById('climodal').classList.contains('show')), 'un toque normal sí lo abre');
    await ev(() => cerrarCuadernos()); await p.waitForTimeout(300);
    /* «Eliminar»: la de una partida vacía se borra con un toque, y el toque largo dice su nombre y NO borra. */
    await s.centro('#p-2 .del');
    const bD = await p.locator('#p-2 .del').boundingBox();
    cierto(!(await ev(() => document.querySelector('#p-2 .del').hasAttribute('data-mantener'))), 'la × de la partida vacía es un botón de toque');
    await s.dedo([[bD.x + bD.width / 2, bD.y + bD.height / 2]], { mantener: 700 });
    await p.waitForTimeout(150);
    const d1 = await ev(() => ({ n: Q.items.length, conf: document.getElementById('confmodal').classList.contains('show'), tip: (document.querySelector('.nombre-tip') || {}).textContent }));
    cierto(d1.n === 2 && !d1.conf && /Eliminar/.test(d1.tip || ''), 'mantener presionado «Eliminar» dice su nombre y NO borra la partida', JSON.stringify(d1));
    await p.waitForTimeout(1300);
    /* La × de una partida CON datos ya es «mantener para borrar»: el dedo no le enseña nombre. */
    const bD1 = await p.locator('#p-1 .del').boundingBox();
    cierto(await ev(() => document.querySelector('#p-1 .del').hasAttribute('data-mantener')), 'la × de la partida con datos es «mantener para borrar» (900 ms)');
    await s.dedo([[bD1.x + bD1.width / 2, bD1.y + bD1.height / 2]], { mantener: 600 });
    await p.waitForTimeout(150);
    const d2 = await ev(() => ({ n: Q.items.length, tip: !!(document.querySelector('.nombre-tip') && document.querySelector('.nombre-tip').matches('.pz-abierto,:popover-open')) }));
    cierto(d2.n === 2 && !d2.tip, 'sostenerla a medias ni borra ni enseña un nombre encima de su propio relleno rojo', JSON.stringify(d2));
    await p.waitForTimeout(500);
    /* El ojo del PDF tampoco cambia. */
    await s.centro('#p-1 .pdf-vis');
    const bO = await p.locator('#p-1 .pdf-vis').boundingBox();
    const antes = await ev(() => document.querySelector('#p-1 .pdf-vis').getAttribute('aria-pressed'));
    await s.dedo([[bO.x + bO.width / 2, bO.y + bO.height / 2]], { mantener: 700 }); await p.waitForTimeout(150);
    const ojo = await ev(() => ({ ahora: document.querySelector('#p-1 .pdf-vis').getAttribute('aria-pressed'), tip: (document.querySelector('.nombre-tip') || {}).textContent, abierto: !!document.querySelector('.nombre-tip.pz-abierto') }));
    cierto(ojo.ahora === antes && /PDF/.test(ojo.tip || '') && ojo.abierto, 'mantener el ojo dice su nombre y no lo prende ni lo apaga', JSON.stringify({ antes, ...ojo }));
    await p.waitForTimeout(1300);
    /* Deslizar no es mantener. */
    await s.dedo([[bC.x + bC.width / 2, bC.y + bC.height / 2], [bC.x + bC.width / 2, bC.y + bC.height / 2 + 40]], { mantener: 700 });
    await p.waitForTimeout(100);
    cierto(!(await tip() || {}).abierto, 'si el dedo se desliza más de 10 px es desplazar, no mantener: no sale nada');
    const cn = await ev(enPagina.contraste, '.nombre-tip');
    sinErrores(s, 'con los nombres'); await s.sinDesborde('con los nombres'); await s.cierra();
  }

  /* ============================== 6 · SOSTENER PARA CONFIRMAR, SOLO DONDE SE BORRA (C23 #5) ==============================
     Lo que se defiende aquí, y que costó una vuelta: `peligro` pinta el botón de rojo y nada más;
     el sostener se pide aparte con `sostener:true`, y hoy solo lo usa cargar otra imagen en el
     escalador, que sí borra las medidas. Las cuatro preguntas de «se pierde lo que tienes en
     pantalla» se contestan con un toque, porque abrir otra cotización del historial se hace muchas
     veces al día y un peaje de un segundo se aprende a pagar sin leer. */
  {
    console.log('\n  — sostener para confirmar, solo donde se borra —');
    const s = await sesion(R); const { p, ev } = s;
    const abre = (peligro, sostener) => ev(([pe, so]) => { window.__r = undefined; confirmar({ titulo: 'Tienes una cotización sin autorizar', texto: 'Si abres COT-0038, la que está en pantalla se pierde.', si: 'Abrir COT-0038', no: 'Seguir con la mía', peligro: pe, sostener: so }).then(v => { window.__r = v; }); }, [peligro, sostener]);
    const estado = () => ev(() => { const b = document.getElementById('conf-si'), pi = document.getElementById('conf-pista'); return { r: window.__r, abierto: document.getElementById('confmodal').classList.contains('show'),
      mant: b.classList.contains('mantener'), hecho: b.classList.contains('hecho'), pista: !pi.hidden, nombre: b.textContent.replace(/\s+/g, ' ').trim(), clase: b.className }; });
    await abre(true, true); await p.waitForTimeout(250);
    const c0 = await estado();
    cierto(c0.abierto && c0.mant && c0.pista && /mantén presionado/i.test(c0.nombre), 'con sostener el botón se vuelve «mantener presionado» y el diálogo lo dice', JSON.stringify(c0));
    const cp = await ev(enPagina.contraste, '#conf-pista');
    cierto(cp >= 4.5, 'la pista se lee: ' + (cp && cp.toFixed(2)) + ':1');
    await s.captura('08-confirmar-peligro');
    const bs = await p.locator('#conf-si').boundingBox();
    cierto(bs.height >= 43.5, 'el botón mide al menos 44 px de alto (' + bs.height.toFixed(1) + ')');
    /* Un toque corto no confirma, y lo dice. */
    await p.tap('#conf-si'); await p.waitForTimeout(350);
    const c1 = await estado();
    cierto(c1.r === undefined && c1.abierto && !c1.hecho, 'un toque corto NO confirma', JSON.stringify(c1));
    await p.waitForTimeout(2000);
    /* A medias y soltar: nada. */
    await s.dedo([[bs.x + bs.width / 2, bs.y + bs.height / 2]], { mantener: 450 }); await p.waitForTimeout(350);
    const c2 = await estado();
    cierto(c2.r === undefined && c2.abierto && !c2.hecho, 'sostener a medias y soltar no confirma', JSON.stringify(c2));
    /* Sostener de verdad. */
    await s.dedo([[bs.x + bs.width / 2, bs.y + bs.height / 2]], { mantener: 1250 }); await p.waitForTimeout(250);
    const c3 = await estado();
    cierto(c3.r === true && !c3.abierto, 'sostenerlo un segundo confirma y cierra el diálogo', JSON.stringify(c3));
    /* Con el teclado: Enter sostenido. */
    await abre(true, true); await p.waitForTimeout(250);
    await p.focus('#conf-si'); await p.keyboard.down('Enter'); await p.waitForTimeout(450); await p.keyboard.up('Enter'); await p.waitForTimeout(250);
    cierto((await estado()).r === undefined, 'Enter suelto a la mitad no confirma');
    await p.keyboard.down('Enter'); await p.waitForTimeout(1250); await p.keyboard.up('Enter'); await p.waitForTimeout(250);
    cierto((await estado()).r === true, 'Enter sostenido sí: es la alternativa del teclado');
    /* Escape sigue siendo «no», y la siguiente pregunta vuelve a armarse limpia. */
    await abre(true, true); await p.waitForTimeout(250);
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    const c4 = await estado();
    cierto(c4.r === false && !c4.abierto, 'Escape contesta «no»', JSON.stringify(c4));
    await abre(true, true); await p.waitForTimeout(250);
    const c5 = await estado();
    cierto(c5.mant && !c5.hecho && c5.abierto, 'la pregunta siguiente se arma limpia (no queda «hecho» de la anterior)', JSON.stringify(c5));
    await ev(() => confirmarNo()); await p.waitForTimeout(200);
    /* Sin peligro: un toque basta, y no queda nada de la pieza. */
    await abre(true, false); await p.waitForTimeout(250);
    const c6 = await estado();
    cierto(c6.abierto && !c6.mant && !c6.pista && c6.nombre === 'Abrir COT-0038' && /btn-dgr/.test(c6.clase), 'rojo pero sin sostener —el caso de las cuatro preguntas— el botón es el de siempre, sin pieza ni pista', JSON.stringify(c6));
    await p.tap('#conf-si'); await p.waitForTimeout(250);
    const c7 = await estado();
    cierto(c7.r === true && !c7.abierto, 'y un toque contesta que sí', JSON.stringify(c7));
    /* Y el «no» siempre es un toque. */
    await abre(true, true); await p.waitForTimeout(250);
    await p.tap('#conf-no'); await p.waitForTimeout(250);
    cierto((await estado()).r === false, '«Seguir con la mía» contesta con un toque, aun con peligro');
    await s.sinBucles('con el diálogo', '#confmodal');
    sinErrores(s, 'con el diálogo'); await s.cierra();
  }

  /* ============================== 7 · EN LA COMPUTADORA (una sola vez) ============================== */
  if (indice === 0) {
    console.log('\n  — en la computadora, con el ratón —');
    const s = await sesion(R, { escritorio: true }); const { p, ev } = s;
    /* La isla abierta, con su frase legible y que se enrolla sola. */
    await s.ctx.setOffline(true); await p.waitForTimeout(700);
    const i1 = await verIsla(s);
    cierto(i1.ver && i1.abierta && i1.w > 120 && /Sin señal/.test(i1.texto), 'en la computadora la isla se desenrolla y dice su frase (' + i1.w + ' px)', JSON.stringify(i1));
    const ci = await ev(enPagina.contraste, '#isla .isla-t');
    cierto(ci >= 4.5, 'la frase de «sin señal» se lee: ' + (ci && ci.toFixed(2)) + ':1');
    await s.sinDesborde('con la isla abierta');
    await p.screenshot({ path: join(CAP, '10-escritorio-isla.png') });
    /* Y de noche: la misma frase en el tema oscuro (los tokens cambian, el 4.5:1 no). */
    const otro = R.tema === 'oscuro' ? 'claro' : 'oscuro';
    await ev(t => document.documentElement.setAttribute('data-tema', t), otro); await p.waitForTimeout(450);
    const cn = await ev(enPagina.contraste, '#isla .isla-t');
    cierto(cn >= 4.5, 'la frase de «sin señal» en el tema ' + otro + ': ' + (cn && cn.toFixed(2)) + ':1');
    await ev(t => document.documentElement.setAttribute('data-tema', t), R.tema); await p.waitForTimeout(300);
    await p.waitForTimeout(3800);
    const i2 = await verIsla(s);
    cierto(i2.ver && !i2.abierta && i2.w === 32, 'y a los 3.5 s se enrolla sola al icono (' + i2.w + ' px), mientras no haya señal', JSON.stringify(i2));
    await s.ctx.setOffline(false); await p.waitForTimeout(600);
    const ci2 = await ev(enPagina.contraste, '#isla .isla-t');
    cierto(ci2 >= 4.5 && (await verIsla(s)).abierta, 'al volver la señal se desenrolla con el resultado en verde (' + (ci2 && ci2.toFixed(2)) + ':1)');
    await p.waitForTimeout(2700);

    /* Con «Deshacer» a la vista la barra va más llena y la frase ya no cabe: se queda el icono, sin romper la barra. */
    await p.fill('#f-proy', 'Letrero'); await p.waitForTimeout(300);
    cierto(await ev(() => !document.getElementById('undobtn').classList.contains('oculto')), 'tras teclear, «Deshacer» aparece en la barra');
    const aB0 = await ev(() => Math.round(document.querySelector('.topbar').getBoundingClientRect().height));
    await s.ctx.setOffline(true); await p.waitForTimeout(700);
    const iB = await verIsla(s), aB1 = await ev(() => Math.round(document.querySelector('.topbar').getBoundingClientRect().height));
    cierto(iB.ver && iB.estado === 'sin-senal' && aB1 === aB0, 'con la barra llena la isla no la rompe (' + aB0 + ' → ' + aB1 + ' px) y sigue diciéndolo con su icono', JSON.stringify(iB));
    await s.ctx.setOffline(false); await p.waitForTimeout(600);
    const vv = await ev(() => ({ abierta: document.getElementById('isla').classList.contains('abierta') && /Volvió la señal/.test(document.querySelector('#isla .isla-t').textContent), aviso: /Volvió la señal/.test((document.getElementById('toast') || {}).textContent || '') }));
    cierto(vv.abierta !== vv.aviso, '«Volvió la señal» se lee en un solo sitio: la isla (la frase corta sí cabe) o, si no cupo, un aviso; nunca en los dos ni en ninguno', JSON.stringify(vv));
    await p.waitForTimeout(2800);

    /* La lista: el ratón resalta lo que pisa y un clic elige. */
    await p.click('#f-cli'); await p.waitForTimeout(300);
    const fila2 = await p.locator('#cli-lista [role="option"]').nth(1).boundingBox();
    await p.mouse.move(fila2.x + 20, fila2.y + fila2.height / 2); await p.waitForTimeout(350);
    const h1 = await ev(() => document.getElementById('f-cli').getAttribute('aria-activedescendant'));
    cierto(h1 === 'cli-op-1', 'con el ratón la fila que se pisa es la activa (aria-activedescendant)', h1);
    await p.screenshot({ path: join(CAP, '09-escritorio-lista.png') });
    await p.mouse.click(fila2.x + 20, fila2.y + fila2.height / 2); await p.waitForTimeout(300);
    const h2 = await ev(() => ({ cli: Q.cliente, foco: document.activeElement.id, abierta: document.getElementById('cli-menu').matches(':popover-open') }));
    cierto(h2.cli === 'Farmacia Guadalupe' && h2.foco === 'f-cli' && !h2.abierta, 'un clic elige y el foco no sale del campo', JSON.stringify(h2));
    /* Clic fuera cierra sin elegir. */
    await p.fill('#f-cli', ''); await p.click('#f-cli'); await p.waitForTimeout(250);
    cierto(await ev(() => document.getElementById('cli-menu').matches(':popover-open')), 'se abre otra vez');
    await p.mouse.click(600, 700); await p.waitForTimeout(250);
    cierto(await ev(() => !document.getElementById('cli-menu').matches(':popover-open')), 'un clic fuera la cierra');
    /* Tab sale del campo y la cierra. */
    await p.click('#f-cli'); await p.waitForTimeout(200); await p.keyboard.press('Tab'); await p.waitForTimeout(200);
    cierto(await ev(() => !document.getElementById('cli-menu').matches(':popover-open')), 'Tab la cierra');

    /* En una laptop chica la frase no cabe sin romper la barra: se queda el icono y la pantalla no baja. */
    {
      const e2 = await sesion(R, { escritorio: 1100 }); const alto = () => e2.ev(() => Math.round(document.querySelector('.topbar').getBoundingClientRect().height));
      const a0 = await alto(), y0 = await e2.ev(() => Math.round(document.getElementById('pasos').getBoundingClientRect().top));
      await e2.ctx.setOffline(true); await e2.p.waitForTimeout(700);
      const ri = await verIsla(e2), a1 = await alto(), y1 = await e2.ev(() => Math.round(document.getElementById('pasos').getBoundingClientRect().top));
      cierto(ri.ver && ri.estado === 'sin-senal' && ri.w === 32 && a1 === a0 && y1 === y0, 'a 1100 px, donde la frase no cabe, la isla se queda en el icono y la pantalla NO baja (' + a0 + ' → ' + a1 + ' px de barra)', JSON.stringify({ ri, a0, a1, y0, y1 }));
      await e2.ctx.setOffline(false); sinErrores(e2, 'a 1100 px'); await e2.cierra();
    }

    /* Los nombres con el ratón: el primero espera, el vecino sale al instante. */
    await ev(() => {
      Q.cliente = 'Farmacia San Juan'; Q.proy = 'Letrero fachada'; Q.tel = '33 2813 0092';
      Q.items = [{ id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8, _lt: 0 },
        { id: 2, tipo: 'letras', material: '', altura: 0, n: 0 }];
      pid = Math.max(pid, 2); saveState(); renderItems(); renderSummary();
    });
    await ev(() => irAPaso(2)); await p.waitForTimeout(700);
    await ev(() => irAPaso(2)); await p.waitForTimeout(600);
    const tip = () => ev(() => { const t = document.querySelector('.nombre-tip'); return t && (t.classList.contains('pz-abierto') || t.matches(':popover-open')) ? t.textContent : null; });
    const bT = await p.locator('.btn-tema').boundingBox();
    await p.mouse.move(bT.x + bT.width / 2, bT.y + bT.height / 2);
    await p.waitForTimeout(150);
    cierto(!(await tip()), 'con el ratón la primera etiqueta espera (400 ms): a los 150 ms no hay nada');
    await p.waitForTimeout(450);
    const n1 = await tip();
    cierto(/tema/i.test(n1 || ''), 'y sale: «' + n1 + '»');
    cierto(await ev(() => !document.querySelector('.btn-tema').hasAttribute('title') && document.querySelector('.btn-tema').hasAttribute('data-pz-titulo')), 'el title nativo se aparta mientras se apunta, para que no se encimen');
    await p.screenshot({ path: join(CAP, '11-escritorio-nombre.png') });
    await p.mouse.move(10, 400); await p.waitForTimeout(150);
    cierto(await ev(() => document.querySelector('.btn-tema').hasAttribute('title')), 'y se devuelve al salir');
    await s.centro('#p-1 .dup');
    const bDup = await p.locator('#p-1 .dup').boundingBox();
    const bOjo = await p.locator('#p-1 .pdf-vis').boundingBox();
    await p.mouse.move(bDup.x + bDup.width / 2, bDup.y + bDup.height / 2); await p.waitForTimeout(700);
    const nd = await tip();
    await p.mouse.move(bOjo.x + bOjo.width / 2, bOjo.y + bOjo.height / 2); await p.waitForTimeout(120);
    const no = await tip();
    cierto(/Duplicar/i.test(nd || '') && /PDF/.test(no || ''), 'pasar al botón vecino cambia la etiqueta al instante (caliente): «' + nd + '» → «' + no + '»');
    /* Con el teclado. */
    await p.mouse.move(10, 400); await p.waitForTimeout(900);
    await p.focus('.btn-hist[aria-label="Historial de cotizaciones"]'); await p.keyboard.press('Tab'); await p.waitForTimeout(150);
    const nk = await tip();
    cierto(/tema/i.test(nk || '') && (await ev(() => document.activeElement.classList.contains('btn-tema'))), 'con Tab sale al momento: «' + nk + '»');
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    cierto(!(await tip()), 'Escape la quita');
    await s.sinBucles('en la computadora', '.topbar,#fld-cli,#folio');
    await s.sinDesborde('en la computadora');
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
