/* EL HISTORIAL, LOS CUADERNOS Y LOS RESPALDOS, CON EL DEDO, EL RATÓN Y EL TECLADO.

   Lo que se defiende, y por qué se mide en un navegador y no se lee en el código:

   · LAS FICHAS DE «LO QUE FALTA» (H8). Todas · Sin PDF · Sin enviar · Sin venta · Este mes, cada
     una con su conteo, con aria-pressed, de 44 px con el dedo, que se combinan con la búsqueda
     («3 de 41») y que, tocadas otra vez, regresan a «Todas». Los conteos salen de los hitos de
     verdad y del mes del reloj de aquí.
   · LO QUE COINCIDE, MARCADO (H15). Sin acentos («optica» marca «Óptica»), por dígitos para el
     teléfono, escapando ANTES de marcar —«Tom & Jerry <i>x</i>» no inyecta un <i>— y sin marcar lo
     que no coincide. En el historial y en los cuadernos.
   · ENTRADAS COMPACTAS (H16). La tabla de partidas, la dirección y la nota viven en un pliegue
     cerrado; «Abrir y editar» y «Duplicar» siguen a la vista; el resumen mide 44 px con el dedo; las
     imágenes cargan perezosas; con una búsqueda que cayó adentro, el pliegue se abre solo; con
     menos movimiento abre sin transición.
   · ESTADOS VACÍOS CON SALIDA (H17). La carpeta es quieta, hay UN botón con relleno, y las salidas
     funcionan: «Restaurar un respaldo» solo si el aparato nunca se respaldó, «Borrar búsqueda»,
     «Buscar en clientes».
   · LA VIGENCIA DE 10 DÍAS (33). Cada entrada dice cuántos días le quedan con palabra y con color
     (Vigente / Por vencer / Vencida); «Reenviar con fecha nueva» renueva sin tocar `ts` y, si el
     precio se movió, pregunta y manda a volver a autorizar SIN cambiar la fecha. La cuenta pura se
     prueba en pruebas/cot-historial.mjs.
   · MANTENER PRESIONADO PARA ELIMINAR (H26 #5) con su «Deshacer» de mecha (H6): un toque corto no
     borra y dice cómo; sostener 0,9 s con el dedo, con el ratón o con Enter borra, y el aviso deja
     devolverla en su mismo lugar.
   · EL PLANO A PANTALLA COMPLETA (H14). Crece desde la miniatura, se acerca con doble toque,
     pellizco, rueda y teclado, se arrastra SIN cerrarse, se cierra con el velo, con Escape, con la
     × de 44 px y con el «atrás» del teléfono, y la miniatura regresa visible. Con menos movimiento no
     vuela. El PDF sigue siendo un iframe.
   · CUADERNOS: DESLIZAR (H27), CIFRAS QUE RUEDAN (H26 #1), VISTAZO (H21) Y GLIFO DE LA NOTA (H29).
     El detalle viaja con View Transitions al tocar y NUNCA al teclear, y regresa a donde estaba la
     lista; las iniciales llevan el mismo nombre de transición en las dos vistas; las cifras ruedan
     solo si cambiaron; el vistazo se abre con el toque, trae tres cotizaciones y dos acciones, y
     Escape devuelve el foco; el glifo de la nota pasa de anillo a palomita, o a ✕ si no cupo.
   · RESTAURAR CON LOS PASOS A LA VISTA (H25). Tres renglones que se marcan, la confirmación se
     sostiene, un toque corto no restaura, una descarga que falla o una escritura que no cabe dejan
     TODO como estaba y lo dicen, y el que sí cabe recarga la app con lo del respaldo.
   · BORDES QUE SE DESVANECEN (H26 #10) en las dos listas, quietos.

   Cada ronda es un teléfono distinto (360 y 420 px) en claro u oscuro, con o sin menos movimiento,
   con dedo (CDP: touchStart/touchMove/touchEnd), ratón y teclado; sin errores de página, sin
   desborde horizontal, sin nada que se mueva solo en reposo dentro de lo que esta zona pinta y con
   el contraste medido sobre lo que se ve.

   Uso:  PUERTO=8814 node pruebas/navegador/cot-historial.mjs
         RONDA=1,3       para correr solo esas rondas, numeradas desde 1
         CAPTURAS=/ruta  para guardar capturas a 360 px (por omisión /tmp/cot-historial-capturas) */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const CAP = process.env.CAPTURAS || join(tmpdir(), 'cot-historial-capturas');
mkdirSync(CAP, { recursive: true });
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, m, extra = '') => (c ? bien(m) : mal(m + (extra ? ' — ' + extra : '')));
const espera = ms => new Promise(r => setTimeout(r, ms));

const RONDAS = [
  { W: 360, tema: 'claro', red: false }, { W: 360, tema: 'oscuro', red: true },
  { W: 420, tema: 'claro', red: true }, { W: 420, tema: 'oscuro', red: false },
];
const SOLO = (process.env.RONDA || '').split(',').filter(Boolean).map(Number);

/* Un plano de mentiras con cotas, como el que guarda la IA: un SVG con tamaño propio. */
const PLANO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240"><rect width="400" height="240" fill="#e8ecff"/><rect x="20" y="20" width="360" height="200" fill="none" stroke="#3018f8" stroke-width="4"/><text x="200" y="130" font-size="40" text-anchor="middle" fill="#1a1d33">120 cm</text></svg>');

/* ---------- Las medidas que se repiten, hechas dentro de la página ---------- */
const enPagina = {
  /* Contraste real de un elemento con texto: color de la letra contra el fondo EFECTIVO —los
     fondos translúcidos de los ancestros se componen de abajo hacia arriba—. */
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
    const Lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const a = Lum(letra), b = Lum(fondo);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  },
};

/* El historial de mentiras. Todo relativo a «ahora» y con la hora del día puesta a propósito, para
   que lo que se cuenta sean días y no horas. Los hitos viven en su propia clave. */
function sembrar(PLANO) {
  const ahora = Date.now(), DIA = 864e5;
  const it = (id, desc, lt) => ({ id, tipo: 'manual', desc, pz: 1, pu: lt, _lt: lt, showInPdf: true });
  const E = (n, cliente, tel, dias, extra = {}) => ({
    folio: 'COT-' + String(n).padStart(4, '0'), proy: 'Letrero ' + cliente, cliente, tel,
    dirRaw: '', fechaAuth: '27 sep 2026', autorizador: 'Elías', neto: 11600, sub: 10000, iva: true, precioAuth: 0,
    fecha: '20 sep 2026', items: [it(1, 'Letras 3D aluminio negro · 10 letras, 40cm', 7000), it(2, 'Caja de luz 1.20×0.80', 3000)],
    itemsAuth: {}, ts: ahora - dias * DIA, ...extra });
  const e49 = E(49, 'Panadería La Espiga', '33 1111 2222', 12);
  e49.items[0]._lt = 6500;   // el material subió: el precio de hoy ya no es el que se cotizó
  const e43 = E(43, 'Cliente Viejo', '', 0); delete e43.ts;   // de antes de que existiera `ts`
  const hist = [
    E(50, 'Panadería La Espiga', '33 1111 2222', 1, { aiFile: { name: 'plano.svg', type: 'image/svg+xml', url: PLANO }, nota: 'Pagan con transferencia', dirRaw: 'Av. Vallarta 1234, Guadalajara' }),
    e49,
    E(48, 'Dental Sonrisa', '33 3333 4444', 5),
    E(47, 'Barbería El Toro', '33 5555 6666', 8),
    E(46, 'Taquería Los Primos', '33 7777 8888', 10),
    E(45, 'Óptica Visión', '33 9999 0000', 0),
    E(44, 'Tom & Jerry <i>x</i>', '33 4444 0000', 3),
    e43,
  ];
  localStorage.setItem('al3d_historial', JSON.stringify(hist));
  localStorage.setItem('al3d_hitos', JSON.stringify({
    'COT-0050': { pdf: ahora - DIA, wa: ahora - DIA }, 'COT-0049': { pdf: ahora - 12 * DIA, wa: ahora - 12 * DIA, venta: ahora - 11 * DIA },
    'COT-0048': { pdf: ahora - 4 * DIA } }));
  localStorage.removeItem('al3d_respaldo_ts'); localStorage.removeItem('al3d_respaldo_n');
}

async function ronda(R, indice) {
  const { W, tema, red } = R;
  console.log(`\n══ RONDA ${indice + 1} · ${W} px · ${tema} · ${red ? 'menos movimiento' : 'con movimiento'} ══`);
  const H = 740;
  const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block', acceptDownloads: true,
    reducedMotion: red ? 'reduce' : 'no-preference' });
  await ctx.addInitScript({ path: fileURLToPath(new URL('./hoja-de-mentiras.js', import.meta.url)) });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|Failed to load resource/.test(m.text())) errs.push('consola: ' + m.text()); });
  const bajadas = [];
  p.on('download', d => bajadas.push(d.suggestedFilename()));
  const ev = (f, a) => p.evaluate(f, a);
  const captura = async nombre => {
    if (W !== 360) return;
    await p.waitForTimeout(150);
    await p.screenshot({ path: join(CAP, `${nombre}-${tema}${red ? '-rm' : ''}.png`) });
  };

  /* El dedo de verdad: eventos táctiles por el protocolo, que llegan como Pointer Events con
     pointerType «touch» (un `tap` de Playwright no deja mantener ni arrastrar ni pellizcar). */
  const dedo = {
    abajo: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }),
    mueve: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }),
    arriba: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    toca: async (x, y) => { await dedo.abajo(x, y); await espera(40); await dedo.arriba(); },
    pellizca: async (cx, cy, d0, d1, pasos = 8) => {
      const pts = d => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) });
      for (let i = 1; i <= pasos; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + (d1 - d0) * i / pasos) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
  };
  /* Trae el elemento a la vista, a media pantalla, y devuelve su centro. */
  const centro = sel => ev(sel => {
    const el = document.querySelector(sel); if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }, sel);
  const sostener = async (sel, ms) => {
    const c = await centro(sel); await p.waitForTimeout(120);
    const c2 = await centro(sel);
    await dedo.abajo(c2.x, c2.y); await espera(ms); await dedo.arriba();
    return c2;
  };
  const sinDesborde = async (donde, sel) => {
    const r = await ev(({ sel, W }) => {
      const de = document.documentElement;
      const raiz = sel ? document.querySelector(sel) : document.body;
      const fuera = [...(raiz ? raiz.querySelectorAll('*') : [])].filter(e => {
        const b = e.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(e).position === 'fixed') return false;
        /* Lo que vive en una fila que se desplaza de lado, en un globo que flota o en la capa de
           relleno del botón sostenido no es desborde de la página. */
        if (e.closest('.fichas,.toast,.vistazo,[hidden],.solo-voz,.mantener-capa,.hentry-pista')) return false;
        return b.right > W + 1 || b.left < -1;
      }).slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 30));
      return { pagina: de.scrollWidth - de.clientWidth, fuera };
    }, { sel, W });
    cierto(r.pagina <= 1 && !r.fuera.length, `sin desborde horizontal ${donde}`, JSON.stringify(r));
  };
  /* Lo que se mueve solo en reposo, dentro de la zona: nada. */
  const sinBucles = async donde => {
    const r = await ev(() => document.getAnimations().filter(a => {
      const t = a.effect && a.effect.target;
      return a.effect && a.effect.getComputedTiming().iterations === Infinity && t && t.closest
        && t.closest('#histmodal,#climodal,#lightbox,#cua-aviso,.vistazo');
    }).map(a => (a.effect.target.className || a.effect.target.tagName) + ':' + (a.animationName || a.transitionProperty)));
    cierto(!r.length, `nada gira ni late solo en reposo ${donde}`, JSON.stringify(r));
  };
  const contraste = async (sel, donde, min = 4.5) => {
    const c = await ev(enPagina.contraste, sel);
    cierto(c !== null && c >= min, `contraste de ${donde} ≥ ${min}:1`, c === null ? 'no existe' : c.toFixed(2));
  };
  /* Cuántas veces corrió `document.startViewTransition` desde que se instaló el espía. */
  const espiarVT = () => ev(() => {
    window.__vt = 0;
    if (!window.__vtOrig) {
      window.__vtOrig = document.startViewTransition ? document.startViewTransition.bind(document) : null;
      if (window.__vtOrig) document.startViewTransition = fn => { window.__vt++; return window.__vtOrig(fn); };
    }
  });
  const vts = () => ev(() => window.__vt || 0);
  /* Arranca la app con el historial de mentiras (o con el que se pida). */
  const arrancar = async (sembrador = sembrar) => {
    await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof Q !== 'undefined' && typeof Piezas !== 'undefined' && typeof abrirHistorial === 'function');
    await ev(sembrador, PLANO);
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof Q !== 'undefined' && typeof Piezas !== 'undefined' && typeof abrirHistorial === 'function');
    await p.waitForTimeout(500);
    await espiarVT();
  };
  const abrirHist = async () => { await ev(() => abrirHistorial()); await p.waitForTimeout(450); };
  const cerrarTodo = async () => {
    await ev(() => { try { cerrarHistorial(); } catch (_) {} try { cerrarCuadernos(); } catch (_) {} try { closeLightbox(); } catch (_) {} });
    await p.waitForTimeout(450);
  };
  const entradas = () => ev(() => [...document.querySelectorAll('#hist-body .hentry')].map(e => e.dataset.folio));

  /* ============================== 1 · LAS FICHAS (H8) ============================== */
  console.log('\n  — las fichas de «lo que falta» —');
  await arrancar();
  await abrirHist();
  const esperado = await ev(() => {
    const h = JSON.parse(localStorage.getItem('al3d_historial')), hi = JSON.parse(localStorage.getItem('al3d_hitos')), ahora = new Date();
    const mes = h.filter(e => e.ts && new Date(e.ts).getMonth() === ahora.getMonth() && new Date(e.ts).getFullYear() === ahora.getFullYear()).length;
    const falta = k => h.filter(e => !(hi[e.folio] && hi[e.folio][k])).length;
    return { todas: h.length, sinpdf: falta('pdf'), sinenv: falta('wa'), sinventa: falta('venta'), mes };
  });
  const fichas = await ev(() => [...document.querySelectorAll('#hist-fichas [data-ficha]')].map(b => ({
    id: b.dataset.ficha, n: +b.querySelector('.ficha-n').textContent, on: b.getAttribute('aria-pressed'), alto: b.getBoundingClientRect().height,
    tipo: b.tagName, t: b.firstChild.textContent.trim() })));
  cierto(fichas.map(f => f.id).join() === 'todas,sinpdf,sinenv,sinventa,mes', 'cinco fichas, en el orden en que se leen', JSON.stringify(fichas.map(f => f.id)));
  cierto(fichas.every(f => f.n === esperado[f.id]), 'cada una con su conteo, sacado de los hitos y del mes de aquí', JSON.stringify({ fichas: fichas.map(f => f.n), esperado }));
  cierto(fichas[0].on === 'true' && fichas.slice(1).every(f => f.on === 'false'), '«Todas» arranca activa y las demás no (aria-pressed)');
  cierto(fichas.every(f => f.tipo === 'BUTTON'), 'son botones');
  cierto((await entradas()).length === esperado.todas, 'la lista trae todas las entradas');
  const cont = await ev(() => document.getElementById('hist-count').textContent);
  cierto(/8 cotizaciones/.test(cont), 'el contador dice cuántas hay', cont);
  cierto(fichas.every(f => f.alto >= 36), 'cada ficha mide al menos 36 px (44 con el dedo)', JSON.stringify(fichas.map(f => f.alto)));
  const f44 = await ev(() => Math.min(...[...document.querySelectorAll('#hist-fichas .ficha')].map(b => b.getBoundingClientRect().height)));
  cierto(f44 >= 44, 'con el dedo, 44 px por ficha', String(f44));
  await captura('hist-lista');
  /* Sin PDF */
  await p.tap('#hist-fichas [data-ficha="sinpdf"]');
  await p.waitForTimeout(250);
  let lista = await entradas();
  cierto(lista.length === esperado.sinpdf && !lista.includes('COT-0050') && !lista.includes('COT-0049') && !lista.includes('COT-0048'),
    '«Sin PDF» deja solo las que no tienen PDF', lista.join());
  cierto((await ev(() => document.getElementById('hist-count').textContent)) === `${esperado.sinpdf} de 8`, 'y el contador dice «5 de 8»',
    await ev(() => document.getElementById('hist-count').textContent));
  cierto((await ev(() => document.querySelector('#hist-fichas [data-ficha="sinpdf"]').getAttribute('aria-pressed'))) === 'true'
    && (await ev(() => document.querySelector('#hist-fichas [data-ficha="todas"]').getAttribute('aria-pressed'))) === 'false', 'la ficha activa se hunde y «Todas» se suelta');
  await contraste('#hist-fichas .ficha[aria-pressed="true"]', 'la ficha activa');
  /* Se combina con la búsqueda */
  await p.fill('#hist-search', 'dental');
  await p.waitForTimeout(400);
  lista = await entradas();
  /* Dental tiene su PDF: dentro de «Sin PDF» no hay nada, y el vacío lo dice con las dos cosas. */
  cierto(lista.length === 0 && /«dental» en «Sin PDF»/.test(await ev(() => document.querySelector('#hist-body .hvacio-t')?.textContent || '')),
    'ficha + búsqueda se combinan: «dental» con «Sin PDF» no deja nada y el vacío dice por qué', lista.join());
  await p.fill('#hist-search', 'barber');
  await p.waitForTimeout(400);
  lista = await entradas();
  cierto(lista.join() === 'COT-0047', '«Sin PDF» + «barber» deja la Barbería', lista.join());
  cierto((await ev(() => document.getElementById('hist-count').textContent)) === '1 de 8', 'el contador dice «1 de 8»');
  /* Tocar la activa la suelta y regresa a «Todas». */
  await p.tap('#hist-fichas [data-ficha="sinpdf"]');
  await p.waitForTimeout(250);
  cierto((await ev(() => document.querySelector('#hist-fichas [data-ficha="todas"]').getAttribute('aria-pressed'))) === 'true', 'tocar otra vez la activa regresa a «Todas»');
  await p.fill('#hist-search', '');
  await p.waitForTimeout(400);
  /* Los conteos no dependen de la búsqueda: dicen cuántas HAY, no cuántas quedan */
  const nTrasBuscar = await ev(() => +document.querySelector('#hist-fichas [data-ficha="sinpdf"] .ficha-n').textContent);
  cierto(nTrasBuscar === esperado.sinpdf, 'el conteo de una ficha no cambia al buscar');
  /* Teclado: Tab llega a las fichas y Enter las prende */
  await ev(() => document.querySelector('#hist-fichas [data-ficha="sinventa"]').focus());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(250);
  cierto((await entradas()).length === esperado.sinventa, 'con el teclado también: Enter prende «Sin venta»');
  await ev(() => document.querySelector('#hist-fichas [data-ficha="sinenv"]').click());
  await p.waitForTimeout(250);
  cierto((await entradas()).length === esperado.sinenv, 'y «Sin enviar» cuenta los que no abrieron el chat');
  await ev(() => document.querySelector('#hist-fichas [data-ficha="mes"]').click());
  await p.waitForTimeout(250);
  cierto((await entradas()).length === esperado.mes, '«Este mes» cuenta las autorizadas en este mes', `${(await entradas()).length} contra ${esperado.mes}`);
  await ev(() => document.querySelector('#hist-fichas [data-ficha="todas"]').click());
  await p.waitForTimeout(250);
  /* La fila de fichas se desplaza de lado y no ensancha la página */
  const fila = await ev(() => { const f = document.querySelector('#hist-fichas .fichas'); return { sc: f.scrollWidth, cl: f.clientWidth, ov: getComputedStyle(f).overflowX }; });
  cierto(fila.ov === 'auto', 'la fila de fichas se desplaza de lado (overflow-x auto)', JSON.stringify(fila));
  cierto(await ev(() => { const f = document.querySelector('#hist-fichas .fichas'); return f.classList.contains('bordes') && f.classList.contains('bordes-x'); }), 'y lleva el borde que se desvanece (pieza 10), también después de repintar las fichas');
  await sinDesborde('con las fichas', '#histmodal');

  /* ============================== 2 · LO QUE COINCIDE, MARCADO (H15) ============================== */
  console.log('\n  — lo que coincide, marcado —');
  await p.fill('#hist-search', 'optica');
  await p.waitForTimeout(400);
  let marcas = await ev(() => [...document.querySelectorAll('#hist-body mark.coincide')].map(m => m.textContent));
  cierto(marcas.length >= 1 && marcas.every(m => m.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === 'optica'),
    'sin acentos: «optica» marca «Óptica» con su acento original', JSON.stringify(marcas));
  cierto((await entradas()).join() === 'COT-0045', 'y deja solo esa entrada');
  await contraste('#hist-body mark.coincide', 'la marca');
  await captura('hist-marca');
  /* El teléfono se busca por dígitos de corrido y se marca donde está */
  await p.fill('#hist-search', '99990000');
  await p.waitForTimeout(400);
  marcas = await ev(() => [...document.querySelectorAll('#hist-body .hentry-sub mark.coincide')].map(m => m.textContent));
  cierto(marcas.join() === '9999 0000', 'el teléfono tecleado de corrido marca «9999 0000» en el renglón del cliente', JSON.stringify(marcas));
  /* El folio */
  await p.fill('#hist-search', '0047');
  await p.waitForTimeout(400);
  marcas = await ev(() => [...document.querySelectorAll('#hist-body .hentry-folio mark.coincide')].map(m => m.textContent));
  cierto(marcas.join() === '0047', 'el folio también se marca', JSON.stringify(marcas));
  /* Escapar ANTES de marcar */
  await p.fill('#hist-search', 'jerry');
  await p.waitForTimeout(400);
  const esc = await ev(() => { const s = document.querySelector('#hist-body .hentry-sub'), n = document.querySelector('#hist-body .hentry-name');
    return { sub: s.innerHTML, texto: s.textContent, nombre: n.innerHTML, is: document.querySelectorAll('#hist-body i').length }; });
  cierto(esc.is === 0, 'un nombre con <i> no inyecta ningún elemento', JSON.stringify(esc));
  cierto(/Tom &amp; <mark class="coincide">Jerry<\/mark> &lt;i&gt;x&lt;\/i&gt;/.test(esc.sub), 'se escapa primero y se marca después: «&» y «<i>» quedan como texto', esc.sub);
  cierto(esc.texto.includes('<i>x</i>'), 'el texto que se lee es el que se tecleó, con sus símbolos');
  await p.fill('#hist-search', 'amp');
  await p.waitForTimeout(400);
  const amp = await ev(() => [...document.querySelectorAll('#hist-body mark.coincide')].map(m => m.textContent));
  cierto(amp.every(m => /amp/i.test(m)), 'buscar «amp» no rompe un «&amp;» (las marcas son solo de lo que se tecleó)', JSON.stringify(amp));
  /* Lo que no coincide en ninguna parte no se marca */
  await p.fill('#hist-search', '');
  await p.waitForTimeout(400);
  cierto((await ev(() => document.querySelectorAll('#hist-body mark').length)) === 0, 'sin búsqueda no hay ninguna marca');
  /* Una partida coincide y la entrada se abre sola */
  await p.fill('#hist-search', 'caja de luz');
  await p.waitForTimeout(400);
  const abiertas = await ev(() => [...document.querySelectorAll('#hist-body .hentry-det')].map(d => d.open));
  cierto(abiertas.length === 8 && abiertas.every(Boolean), 'si lo que coincidió está en una partida, el pliegue se abre solo', JSON.stringify(abiertas));
  cierto((await ev(() => document.querySelector('#hist-body .htable mark.coincide')?.textContent || '')).toLowerCase() === 'caja de luz', 'y la partida trae su marca');
  await p.fill('#hist-search', '');
  await p.waitForTimeout(400);

  /* ============================== 3 · ENTRADAS COMPACTAS (H16) ============================== */
  console.log('\n  — entradas compactas —');
  const comp = await ev(() => {
    const e = document.querySelector('#hist-body .hentry[data-folio="COT-0050"]');
    const d = e.querySelector('details.hentry-det');
    const vis = el => !!el && el.checkVisibility && el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
    const im = e.querySelector('img.hentry-img');
    return { hay: !!d, abierto: d.open, tabla: vis(e.querySelector('.htable')), dir: vis(e.querySelector('.hentry-dir')),
      resumen: d.querySelector('summary').textContent.trim(), alto: d.querySelector('summary').getBoundingClientRect().height,
      abrir: vis(e.querySelector('.hentry-open')), dup: [...e.querySelectorAll('.hentry-open')].every(vis),
      lazy: im && im.getAttribute('loading'), dec: im && im.getAttribute('decoding'),
      altoEntrada: e.getBoundingClientRect().height, imgW: im && im.getBoundingClientRect().width };
  });
  cierto(comp.hay && !comp.abierto, 'cada entrada trae un pliegue y arranca cerrado');
  cierto(comp.tabla === false && comp.dir === false, 'la tabla de partidas y la dirección no se ven hasta abrirlo', JSON.stringify(comp));
  cierto(/^2 partidas/.test(comp.resumen), 'el resumen dice «2 partidas»', comp.resumen);
  cierto(comp.abrir && comp.dup, '«Abrir y editar» y «Duplicar» siguen a la vista');
  cierto(comp.alto >= 36, 'el resumen mide al menos 36 px (44 con el dedo)', String(comp.alto));
  cierto(comp.alto >= 44, 'con el dedo, el resumen mide 44 px', String(comp.alto));
  cierto(comp.lazy === 'lazy' && comp.dec === 'async', 'las imágenes cargan perezosas y se decodifican aparte');
  cierto(comp.imgW <= 64.5, 'la miniatura baja a 64 px (56 en el teléfono)', String(comp.imgW));
  await p.tap('#hist-body .hentry[data-folio="COT-0050"] .hentry-resumen');
  await p.waitForTimeout(450);
  const abierto = await ev(() => { const e = document.querySelector('#hist-body .hentry[data-folio="COT-0050"]');
    const vis = el => !!el && el.checkVisibility && el.checkVisibility({ visibilityProperty: true });
    return { abierto: e.querySelector('details').open, tabla: vis(e.querySelector('.htable')), dir: vis(e.querySelector('.hentry-dir')), nota: vis(e.querySelector('.hentry-nota')),
      filas: e.querySelectorAll('.htable tr').length, flecha: getComputedStyle(e.querySelector('.pliegue-flecha')).transform }; });
  cierto(abierto.abierto && abierto.tabla && abierto.dir && abierto.nota && abierto.filas === 2, 'un toque abre la tabla, la dirección y la nota', JSON.stringify(abierto));
  cierto(abierto.flecha !== 'none' && abierto.flecha !== 'matrix(1, 0, 0, 1, 0, 0)', 'y la flecha gira', abierto.flecha);
  await contraste('#hist-body .hentry[data-folio="COT-0050"] .hentry-resumen', 'el resumen del pliegue');
  await captura('hist-abierta');
  const trans = await ev(() => { const d = document.querySelector('#hist-body details.hentry-det'); return getComputedStyle(d, '::details-content').transitionDuration; });
  if (red) cierto(/^0s(, 0s)*$/.test(trans), 'con menos movimiento abre sin transición', trans);
  else if (await ev(() => CSS.supports('interpolate-size', 'allow-keywords'))) cierto(!/^0s(, 0s)*$/.test(trans), 'con movimiento abre con su altura (::details-content)', trans);
  else bien('este navegador no sabe animar la altura del pliegue: abre en seco, como se dijo');
  await p.tap('#hist-body .hentry[data-folio="COT-0050"] .hentry-resumen');
  await p.waitForTimeout(450);
  cierto(!(await ev(() => document.querySelector('#hist-body .hentry[data-folio="COT-0050"] details').open)), 'otro toque lo cierra');
  /* Con teclado: Enter sobre el resumen */
  await ev(() => document.querySelector('#hist-body .hentry[data-folio="COT-0048"] summary').focus());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  cierto(await ev(() => document.querySelector('#hist-body .hentry[data-folio="COT-0048"] details').open), 'con el teclado, Enter abre el pliegue');
  await sinDesborde('con las entradas abiertas', '#histmodal');
  await sinBucles('en el historial');

  /* ============================== 4 · LA VIGENCIA (33) ============================== */
  console.log('\n  — la vigencia de 10 días —');
  const vig = await ev(() => Object.fromEntries([...document.querySelectorAll('#hist-body .hentry')].map(e => {
    const v = e.querySelector('.hvig');
    return [e.dataset.folio, v ? { estado: v.dataset.estado, quedan: +v.dataset.quedan, texto: v.querySelector('.hvig-t').textContent,
      detalle: v.querySelector('small').textContent, anillo: v.querySelector('.hvig-anillo b').textContent,
      fuera: !!v.querySelector('.hentry-reenviar'), dentro: !!e.querySelector('.hentry-det-c .hentry-reenviar') } : null];
  })));
  const quedan = (f, q, estado, texto) => cierto(vig[f] && vig[f].quedan === q && vig[f].estado === estado && vig[f].texto === texto,
    `${f}: quedan ${q}, ${estado}, «${texto}»`, JSON.stringify(vig[f]));
  quedan('COT-0045', 10, 'ok', 'Vigente');
  quedan('COT-0050', 9, 'ok', 'Vigente');
  quedan('COT-0044', 7, 'ok', 'Vigente');
  quedan('COT-0048', 5, 'ok', 'Vigente');
  quedan('COT-0047', 2, 'av', 'Por vencer');
  quedan('COT-0046', 0, 'av', 'Por vencer');
  quedan('COT-0049', -2, 'mal', 'Vencida');
  cierto(vig['COT-0043'] === null, 'una entrada sin fecha (de las de antes) no inventa una vigencia');
  cierto(/Vence hoy/.test(vig['COT-0046'].detalle) && /Vence en 2 días/.test(vig['COT-0047'].detalle) && /Hace 2 días/.test(vig['COT-0049'].detalle),
    'las palabras dicen lo mismo que el color: «Vence hoy», «Vence en 2 días», «Hace 2 días»', JSON.stringify([vig['COT-0046'].detalle, vig['COT-0047'].detalle, vig['COT-0049'].detalle]));
  cierto(vig['COT-0047'].anillo === '2' && vig['COT-0049'].anillo === '0', 'el anillo lleva la cifra de días (y 0 si ya venció)');
  cierto(vig['COT-0047'].fuera && vig['COT-0046'].fuera && vig['COT-0049'].fuera && !vig['COT-0045'].fuera && !vig['COT-0050'].fuera,
    'por vencer y vencida traen «Reenviar» a la vista; vigente, no');
  cierto(vig['COT-0045'].dentro && vig['COT-0050'].dentro, 'y las vigentes lo traen dentro del pliegue');
  /* El anillo se pinta con el arco que queda */
  const arcos = await ev(() => ['COT-0045', 'COT-0047', 'COT-0049'].map(f => { const r = document.querySelector(`#hist-body .hentry[data-folio="${f}"] .hvig-anillo .resto`);
    const cs = getComputedStyle(r); return { dash: cs.strokeDashoffset, stroke: cs.stroke, op: cs.stroke }; }));
  cierto(parseFloat(arcos[0].dash) < 0.01 && Math.abs(parseFloat(arcos[1].dash) - 0.8) < 0.01, 'el arco se consume: 10 días lo llena y 2 días deja una quinta parte', JSON.stringify(arcos));
  cierto(arcos[0].stroke !== arcos[1].stroke, 'y el arco cambia de color de verde a ámbar');
  for (const [f, est] of [['COT-0045', 'ok'], ['COT-0047', 'av'], ['COT-0049', 'mal']]) await contraste(`#hist-body .hentry[data-folio="${f}"] .hvig-t`, `la palabra «${est}»`);
  await contraste('#hist-body .hentry[data-folio="COT-0047"] .hvig small', 'la fecha de vencimiento');
  await contraste('#hist-body .hentry[data-folio="COT-0047"] .hentry-reenviar', 'el botón de reenviar');
  await ev(() => document.querySelector('#hist-body .hentry[data-folio="COT-0047"]').scrollIntoView({ block: 'center' }));
  await captura('hist-vigencia');
  /* Reenviar con fecha nueva: el precio no se movió */
  const antes47 = await ev(() => getHistorial().find(e => e.folio === 'COT-0047').ts);
  await p.tap('#hist-body .hentry[data-folio="COT-0047"] .hentry-reenviar');
  await p.waitForTimeout(1100);
  const rv = await ev(() => { const e = getHistorial().find(x => x.folio === 'COT-0047');
    return { folio: Q.folio, estado: Q.estado, fecha: Q.fecha, hoy: hoy(), reenviada: e.reenviada, ts: e.ts, fechaE: e.fecha, modal: document.getElementById('histmodal').classList.contains('show'),
      conf: document.getElementById('confmodal').classList.contains('show'), toast: Piezas.aviso.vivos().map(a => a.msg).join(' | ') }; });
  cierto(rv.folio === 'COT-0047' && rv.estado === 'autorizada' && !rv.modal, 'abre la cotización, sigue autorizada y cierra el historial', JSON.stringify(rv));
  cierto(rv.fecha === rv.hoy && rv.fechaE === rv.hoy, 'el PDF sale con la fecha de hoy (en pantalla y en el historial)', JSON.stringify([rv.fecha, rv.fechaE, rv.hoy]));
  cierto(rv.reenviada > Date.now() - 20000 && rv.ts === antes47, 'anota `reenviada` y NO toca `ts` (la autorización que lee la plataforma)', JSON.stringify([rv.reenviada, rv.ts, antes47]));
  cierto(!rv.conf, 'con el precio igual no pregunta nada');
  cierto(/sale con la fecha de hoy y vence el/.test(rv.toast) && /genera su PDF nuevo/.test(rv.toast), 'avisa que falta generar el PDF nuevo', rv.toast);
  await abrirHist();
  const vig47 = await ev(() => { const v = document.querySelector('#hist-body .hentry[data-folio="COT-0047"] .hvig'); return { q: +v.dataset.quedan, e: v.dataset.estado, fuera: !!v.querySelector('.hentry-reenviar') }; });
  cierto(vig47.q === 10 && vig47.e === 'ok' && !vig47.fuera, 'en el historial vuelve a decir «Vigente · 10 días» y su botón se va adentro', JSON.stringify(vig47));
  /* Reenviar desde el pliegue de una vigente */
  await ev(() => { Piezas.aviso.limpiar(); });
  await ev(() => { document.querySelector('#hist-body .hentry[data-folio="COT-0045"] details').open = true; });
  await p.waitForTimeout(350);
  await p.tap('#hist-body .hentry[data-folio="COT-0045"] .hentry-det-c .hentry-reenviar');
  await p.waitForTimeout(1000);
  cierto((await ev(() => Q.folio)) === 'COT-0045', 'el botón de adentro del pliegue hace lo mismo');
  /* El precio se movió */
  await abrirHist();
  await ev(() => { document.querySelector('#hist-body .hentry[data-folio="COT-0049"]').scrollIntoView({ block: 'center' }); });
  await p.tap('#hist-body .hentry[data-folio="COT-0049"] .hentry-reenviar');
  await p.waitForTimeout(600);
  const pr = await ev(() => ({ conf: document.getElementById('confmodal').classList.contains('show'), t: document.getElementById('conf-titulo').textContent,
    texto: document.getElementById('conf-texto').textContent, si: document.getElementById('conf-si').textContent }));
  cierto(pr.conf && /precio de hoy no es el que se cotizó/.test(pr.t), 'si el precio se movió, pregunta antes de abrir nada', JSON.stringify(pr));
  cierto(/Dirección/.test(pr.texto) && /otra vez/.test(pr.texto), 'y explica que pasa por Dirección y que hay que volver a tocar el botón');
  await captura('hist-pregunta-precio');
  await p.tap('#conf-no');
  await p.waitForTimeout(450);
  const no49 = await ev(() => ({ folio: Q.folio, modal: document.getElementById('histmodal').classList.contains('show'), e: getHistorial().find(x => x.folio === 'COT-0049') }));
  cierto(no49.folio !== 'COT-0049' && no49.modal && !no49.e.reenviada, '«Dejarla como está» no abre nada y no toca la entrada', JSON.stringify([no49.folio, no49.modal, no49.e.reenviada]));
  await p.tap('#hist-body .hentry[data-folio="COT-0049"] .hentry-reenviar');
  await p.waitForTimeout(500);
  await p.tap('#conf-si');
  await p.waitForTimeout(1100);
  const si49 = await ev(() => ({ folio: Q.folio, estado: Q.estado, fecha: Q.fecha, hoy: hoy(), reauth: !!Q.reauth, e: getHistorial().find(x => x.folio === 'COT-0049') }));
  cierto(si49.folio === 'COT-0049' && si49.estado !== 'autorizada' && si49.reauth, 'aceptar abre «Volver a autorizar el precio»: la cotización queda pendiente de Dirección', JSON.stringify(si49));
  cierto(si49.fecha !== si49.hoy && !si49.e.reenviada, 'y NO cambia la fecha ni renueva el reloj hasta que Dirección autorice', JSON.stringify([si49.fecha, si49.hoy, si49.e.reenviada]));

  /* ============================== 5 · MANTENER PARA ELIMINAR (H26 #5) Y EL AVISO (H6) ============================== */
  console.log('\n  — mantener presionado para eliminar —');
  await arrancar();
  await abrirHist();
  let antes = await entradas();
  const botonBorrar = '#hist-body .hentry[data-folio="COT-0048"] .hentry-del';
  const dim = await ev(sel => { const b = document.querySelector(sel); const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, mant: b.hasAttribute('data-mantener'), onclick: b.hasAttribute('onclick') }; }, botonBorrar);
  cierto(!dim.mant && !dim.onclick, 'el bote de basura ya no lleva onclick, y la pieza de mantener se arma al tocarlo, no en los de toda la lista');
  cierto(dim.w >= 44 && dim.h >= 44, 'mide 44 × 44 con el dedo', JSON.stringify(dim));
  /* Un toque corto no borra, y dice cómo */
  await sostener(botonBorrar, 90);
  await p.waitForTimeout(250);
  cierto(await ev(() => document.querySelectorAll('#hist-body .hentry-del[data-mantener]').length === 1), 'el primer toque arma ESE bote (uno de los ocho) y ya cuenta como intento');
  cierto((await entradas()).length === antes.length, 'un toque corto no borra nada');
  const pista = await ev(() => document.querySelector('#hist-body .hentry[data-folio="COT-0048"] .hentry-pista').textContent);
  cierto(/Mantén presionado para eliminar/.test(pista), 'dice «Mantén presionado para eliminar…» en su globo', pista);
  const anchoBoton = await ev(sel => document.querySelector(sel).getBoundingClientRect().width, botonBorrar);
  cierto(anchoBoton <= 45, 'y el botón NO se ensancha con la pista (el globo es aparte)', String(anchoBoton));
  await captura('hist-pista-borrar');
  /* Soltar antes de tiempo tampoco */
  await sostener(botonBorrar, 450);
  await p.waitForTimeout(250);
  cierto((await entradas()).length === antes.length, 'soltar a media espera tampoco borra');
  /* Sostener 0.9 s con el dedo */
  await sostener(botonBorrar, 1150);
  await p.waitForTimeout(500);
  let despues = await entradas();
  cierto(despues.length === antes.length - 1 && !despues.includes('COT-0048'), 'sostenerlo con el dedo la elimina', despues.join());
  const av = await ev(() => ({ vivos: Piezas.aviso.vivos(), mecha: !!document.querySelector('#toast .toast-uno .mecha'), act: document.querySelector('#toast .toast-act')?.textContent,
    actAlto: document.querySelector('#toast .toast-act')?.getBoundingClientRect().height }));
  cierto(av.vivos.length >= 1 && av.vivos[0].label === 'Deshacer' && /COT-0048 eliminada del historial/.test(av.vivos[0].msg), 'sale el aviso con «Deshacer»', JSON.stringify(av.vivos));
  cierto(av.vivos[0].resta > 6000 && av.vivos[0].resta <= 8000, 'la mecha dura lo que dura el aviso: 8 s', String(av.vivos[0].resta));
  cierto(av.mecha, 'el aviso lleva su mecha (la pieza 12 ya viene en toast())');
  cierto(av.actAlto >= 44, '«Deshacer» mide 44 px con el dedo', String(av.actAlto));
  cierto((await ev(() => document.getElementById('hist-count').textContent)) === '7 cotizaciones' && (await ev(() => +document.querySelector('#hist-fichas [data-ficha="todas"] .ficha-n').textContent)) === 7,
    'el contador y el conteo de las fichas se ponen al día');
  await captura('hist-borrada');
  await p.tap('#toast .toast-act');
  await p.waitForTimeout(500);
  despues = await entradas();
  cierto(despues.join() === antes.join(), 'Deshacer la devuelve en su mismo lugar', despues.join());
  cierto((await ev(() => +document.querySelector('#hist-fichas [data-ficha="todas"] .ficha-n').textContent)) === 8, 'y las fichas vuelven a contar 8');
  /* Con el ratón */
  await ev(() => Piezas.aviso.limpiar());
  const c = await centro('#hist-body .hentry[data-folio="COT-0047"] .hentry-del');
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await espera(1150); await p.mouse.up();
  await p.waitForTimeout(450);
  cierto(!(await entradas()).includes('COT-0047'), 'con el ratón sostenido también');
  await ev(() => { Piezas.aviso.vivos(); document.querySelector('#toast .toast-act')?.click(); });
  await p.waitForTimeout(400);
  /* Con el teclado: Enter sostenido */
  await ev(() => Piezas.aviso.limpiar());
  await ev(sel => document.querySelector(sel).focus(), '#hist-body .hentry[data-folio="COT-0046"] .hentry-del');
  await p.keyboard.down('Enter'); await espera(1150); await p.keyboard.up('Enter');
  await p.waitForTimeout(450);
  cierto(!(await entradas()).includes('COT-0046'), 'con el teclado, Enter sostenido también');
  /* Sin poder sostener (lector de pantalla): «otra vez» dentro de 5 s */
  await ev(() => Piezas.aviso.limpiar());
  await ev(sel => document.querySelector(sel).focus(), '#hist-body .hentry[data-folio="COT-0045"] .hentry-del');
  await ev(() => document.querySelector('#hist-body .hentry[data-folio="COT-0045"] .hentry-del').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })));
  await p.waitForTimeout(250);
  cierto((await entradas()).includes('COT-0045'), 'un «activar» sin puntero solo arma la confirmación');
  await ev(() => document.querySelector('#hist-body .hentry[data-folio="COT-0045"] .hentry-del').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })));
  await p.waitForTimeout(700);
  cierto(!(await entradas()).includes('COT-0045'), 'y el segundo dentro de 5 s la elimina');
  await sinDesborde('tras borrar', '#histmodal');

  /* ============================== 6 · ESTADOS VACÍOS (H17) ============================== */
  console.log('\n  — estados vacíos con salida —');
  await arrancar();
  await abrirHist();
  await p.fill('#hist-search', 'zzzz');
  await p.waitForTimeout(400);
  const sc = await ev(() => ({ ilu: !!document.querySelector('#hist-body .hvacio-ilu'), t: document.querySelector('#hist-body .hvacio-t').textContent,
    botones: [...document.querySelectorAll('#hist-body .hvacio-acts .btn')].map(b => ({ t: b.textContent.trim(), cls: b.className, h: b.getBoundingClientRect().height })),
    anim: document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.hvacio')).length }));
  cierto(sc.ilu && /Ninguna cotización coincide con «zzzz»/.test(sc.t), 'sin coincidencias: carpeta y «Ninguna cotización coincide con «zzzz»»', JSON.stringify(sc));
  cierto(sc.botones.map(b => b.t).join() === 'Borrar búsqueda,Buscar en clientes', 'con sus dos salidas: «Borrar búsqueda» y «Buscar en clientes»');
  cierto(sc.botones.filter(b => /btn-pri/.test(b.cls)).length === 1, 'UN solo botón con relleno');
  cierto(sc.anim === 0, 'la ilustración no se mueve');
  cierto(sc.botones.every(b => b.h >= 40), 'los botones miden lo que un botón (44 con el dedo)', JSON.stringify(sc.botones.map(b => b.h)));
  await contraste('#hist-body .hvacio-t', 'el título del vacío');
  await contraste('#hist-body .hvacio-acts .btn-gho', 'el botón sin relleno');
  await captura('hist-sin-coincidencias');
  await sinDesborde('en el vacío', '#histmodal');
  await p.tap('#hist-body [data-vacio="clientes"]');
  await p.waitForTimeout(900);
  const cl = await ev(() => ({ cua: document.getElementById('climodal').classList.contains('show'), his: document.getElementById('histmodal').classList.contains('show'),
    q: document.getElementById('cua-search').value, n: document.querySelectorAll('#cua-body .cua-card').length }));
  cierto(cl.cua && !cl.his && cl.q === 'zzzz' && cl.n === 0, '«Buscar en clientes» pasa a Cuadernos con la misma búsqueda', JSON.stringify(cl));
  const vc = await ev(() => ({ t: document.querySelector('#cua-body .hvacio-t').textContent, b: [...document.querySelectorAll('#cua-body .hvacio-acts .btn')].map(x => x.textContent.trim()) }));
  cierto(/Ningún cliente coincide con «zzzz»/.test(vc.t) && vc.b.join() === 'Borrar búsqueda,Buscar en el historial', 'y allá también hay salida: «Borrar búsqueda» y «Buscar en el historial»', JSON.stringify(vc));
  await p.tap('#cua-body [data-vacio="cua-historial"]');
  await p.waitForTimeout(900);
  const hh = await ev(() => ({ his: document.getElementById('histmodal').classList.contains('show'), q: document.getElementById('hist-search').value }));
  cierto(hh.his && hh.q === 'zzzz', '«Buscar en el historial» regresa con la búsqueda');
  await p.tap('#hist-body [data-vacio="borrar"]');
  await p.waitForTimeout(450);
  cierto((await ev(() => document.getElementById('hist-search').value)) === '' && (await entradas()).length === 8, '«Borrar búsqueda» limpia el buscador y vuelve la lista');
  cierto(await ev(() => document.activeElement && document.activeElement.id === 'hist-search'), 'y deja el foco en el buscador');
  /* Una ficha sin resultados: «Ver todas» */
  await ev(() => { const h = getHistorial().map(e => (e.folio = e.folio, e)); localStorage.setItem('al3d_hitos', JSON.stringify(Object.fromEntries(h.map(e => [e.folio, { pdf: 1, wa: 1, venta: 1 }])))); abrirHistorial(); });
  await p.waitForTimeout(450);
  await p.tap('#hist-fichas [data-ficha="sinpdf"]');
  await p.waitForTimeout(300);
  const vf = await ev(() => ({ t: document.querySelector('#hist-body .hvacio-t').textContent, b: document.querySelector('#hist-body .hvacio-acts .btn').textContent }));
  cierto(/Ninguna cotización en «Sin PDF»/.test(vf.t) && vf.b === 'Ver todas', 'si lo que no encuentra es una ficha, la salida es «Ver todas»', JSON.stringify(vf));
  await p.tap('#hist-body [data-vacio="borrar"]');
  await p.waitForTimeout(300);
  cierto((await entradas()).length === 8 && (await ev(() => document.querySelector('#hist-fichas [data-ficha="todas"]').getAttribute('aria-pressed'))) === 'true', 'y vuelven todas, con «Todas» activa');
  /* Vacío de verdad */
  await ev(() => { localStorage.setItem('al3d_historial', '[]'); invalidarCuadernos(); abrirHistorial(); });
  await p.waitForTimeout(450);
  const vv = await ev(() => ({ t: document.querySelector('#hist-body .hvacio-t').textContent, b: [...document.querySelectorAll('#hist-body .hvacio-acts .btn')].map(x => ({ t: x.textContent.trim(), pri: /btn-pri/.test(x.className) })),
    fichas: !document.getElementById('hist-fichas').hidden, cnt: document.getElementById('hist-count').textContent }));
  cierto(/Aún no hay cotizaciones autorizadas/.test(vv.t), 'vacío de verdad: «Aún no hay cotizaciones autorizadas»');
  cierto(vv.b.length === 1 && vv.b[0].t === 'Restaurar un respaldo' && vv.b[0].pri, 'y, en un aparato nunca respaldado, un solo botón con relleno: «Restaurar un respaldo»', JSON.stringify(vv.b));
  cierto(!vv.fichas && vv.cnt === '', 'sin nada que filtrar no hay fichas ni contador');
  await captura('hist-vacio');
  await ev(() => { localStorage.setItem('al3d_respaldo_ts', String(Date.now())); abrirHistorial(); });
  await p.waitForTimeout(450);
  cierto((await ev(() => document.querySelectorAll('#hist-body .hvacio-acts .btn').length)) === 0, 'si el aparato ya se respaldó, no se ofrece restaurar');
  /* Cuadernos vacíos */
  await ev(() => { localStorage.removeItem('al3d_respaldo_ts'); cerrarHistorial(); abrirCuadernos(); });
  await p.waitForTimeout(450);
  const cv = await ev(() => ({ t: document.querySelector('#cua-body .hvacio-t').textContent, b: [...document.querySelectorAll('#cua-body .hvacio-acts .btn')].map(x => x.textContent.trim()) }));
  cierto(/Todavía no hay clientes/.test(cv.t) && cv.b.join() === 'Restaurar un respaldo', 'los cuadernos vacíos también ofrecen restaurar', JSON.stringify(cv));
  await cerrarTodo();
  /* El selector de archivo: «Restaurar un respaldo» lo abre */
  await ev(() => abrirHistorial()); await p.waitForTimeout(400);
  const elegir = p.waitForEvent('filechooser', { timeout: 3000 }).then(() => true, () => false);
  await p.tap('#hist-body [data-vacio="restaurar"]');
  cierto(await elegir, '«Restaurar un respaldo» abre el selector de archivos');
  await cerrarTodo();

  /* ============================== 7 · EL PLANO A PANTALLA COMPLETA (H14) ============================== */
  console.log('\n  — el plano a pantalla completa —');
  await arrancar();
  await abrirHist();
  const mini = '#hist-body .hentry[data-folio="COT-0050"] img.hentry-img';
  await centro(mini);
  await p.waitForTimeout(150);
  await p.tap(mini);
  await p.waitForFunction(() => !!document.querySelector('.visor-lienzo'), null, { timeout: 3000 });
  await p.waitForTimeout(80);
  if (!red) cierto((await ev(() => document.querySelector('.visor-img').getAnimations().length)) >= 1, 'con movimiento, el plano crece desde la miniatura (animación de vuelo)');
  else cierto((await ev(() => document.querySelector('.visor-img').getAnimations().length)) === 0, 'con menos movimiento no hay vuelo');
  await p.waitForTimeout(450);
  let vz = await ev(() => { const lb = document.getElementById('lightbox'), l = document.querySelector('.visor-lienzo'), i = document.querySelector('.visor-img'), x = document.querySelector('.lightbox-close');
    const r = i.getBoundingClientRect(), xr = x.getBoundingClientRect();
    return { show: lb.classList.contains('show'), esc: lb.dataset.escala, ta: getComputedStyle(l).touchAction, taBody: getComputedStyle(document.body).touchAction,
      miniVis: getComputedStyle(document.querySelector('#hist-body img.hentry-img')).visibility, w: r.width, vw: innerWidth, xw: xr.width, xh: xr.height,
      rol: l.getAttribute('role'), label: l.getAttribute('aria-label'), tab: l.tabIndex, pie: document.querySelector('.visor-pie').textContent, velo: getComputedStyle(lb).backgroundColor,
      foco: document.activeElement && (document.activeElement.className || document.activeElement.tagName) }; });
  cierto(vz.show && vz.esc === '1.00', 'toca la miniatura y el plano se abre a su ajuste (100 %)', JSON.stringify(vz));
  cierto(vz.ta === 'none' && vz.taBody !== 'none', '`touch-action:none` solo sobre el lienzo; la página sigue haciendo scroll', JSON.stringify([vz.ta, vz.taBody]));
  cierto(vz.w <= vz.vw - 30 && vz.w >= vz.vw - 40, 'el plano se ajusta al ancho dejando aire', JSON.stringify([vz.w, vz.vw]));
  cierto(vz.miniVis === 'hidden', 'la miniatura se esconde mientras «es» la que vuela');
  cierto(vz.xw >= 44 && vz.xh >= 44, 'el botón de cerrar mide 44 px', JSON.stringify([vz.xw, vz.xh]));
  cierto(vz.rol === 'img' && /Plano a pantalla completa/.test(vz.label) && vz.tab === 0, 'el lienzo se anuncia y se alcanza con el teclado', vz.label);
  cierto(/^100 %/.test(vz.pie), 'la lectura dice 100 %', vz.pie);
  cierto(/rgba\(12, 14, 30, 0\.9/.test(vz.velo), 'el velo se oscurece para leer el plano', vz.velo);
  cierto(/lightbox-close/.test(String(vz.foco)), 'el foco entra por el botón de cerrar', String(vz.foco));
  await captura('visor');
  await contraste('.visor-pie', 'la lectura del zoom');
  await sinDesborde('con el visor abierto', null);
  /* Doble toque: 2× */
  const cx = W / 2, cy = H / 2;
  await dedo.toca(cx, cy); await espera(70); await dedo.toca(cx, cy);
  await p.waitForTimeout(450);
  cierto((await ev(() => document.getElementById('lightbox').dataset.escala)) === '2.00', 'doble toque: 2×');
  await captura('visor-zoom');
  /* Arrastrar con el plano acercado: se mueve y NO se cierra */
  const t0 = await ev(() => document.querySelector('.visor-img').style.transform);
  await dedo.abajo(cx, cy); await dedo.mueve(cx - 40, cy - 30); await dedo.mueve(cx - 90, cy - 60); await dedo.arriba();
  await p.waitForTimeout(250);
  const t1 = await ev(() => ({ t: document.querySelector('.visor-img').style.transform, show: document.getElementById('lightbox').classList.contains('show') }));
  cierto(t1.t !== t0 && t1.show, 'arrastrar mueve el plano y NO lo cierra (el clic que sigue al arrastre no llega al velo)', JSON.stringify([t0, t1]));
  /* Doble toque otra vez: vuelve al ajuste */
  await dedo.toca(cx, cy); await espera(70); await dedo.toca(cx, cy);
  await p.waitForTimeout(450);
  cierto((await ev(() => document.getElementById('lightbox').dataset.escala)) === '1.00', 'otro doble toque regresa al ajuste');
  /* Pellizco */
  await dedo.pellizca(cx, cy, 60, 220);
  await p.waitForTimeout(250);
  const ep = +(await ev(() => document.getElementById('lightbox').dataset.escala));
  cierto(ep > 2.5 && ep <= 5, 'el pellizco acerca (y no pasa de 5×)', String(ep));
  await dedo.pellizca(cx, cy, 300, 40, 12);
  await p.waitForTimeout(250);
  cierto(+(await ev(() => document.getElementById('lightbox').dataset.escala)) < ep, 'y al cerrarse los dedos aleja', await ev(() => document.getElementById('lightbox').dataset.escala));
  await p.keyboard.press('0');
  await p.waitForTimeout(350);
  cierto((await ev(() => document.getElementById('lightbox').dataset.escala)) === '1.00', '«0» regresa al ajuste');
  /* Teclado: + y − */
  await p.keyboard.press('+'); await p.waitForTimeout(300);
  const e1 = +(await ev(() => document.getElementById('lightbox').dataset.escala));
  await p.keyboard.press('+'); await p.waitForTimeout(300);
  const e2 = +(await ev(() => document.getElementById('lightbox').dataset.escala));
  await p.keyboard.press('-'); await p.waitForTimeout(300);
  const e3 = +(await ev(() => document.getElementById('lightbox').dataset.escala));
  cierto(e1 > 1 && e2 > e1 && e3 < e2, '«+» acerca, otro «+» acerca más y «−» aleja', JSON.stringify([e1, e2, e3]));
  /* Flechas con el lienzo enfocado */
  await ev(() => document.querySelector('.visor-lienzo').focus());
  const tA = await ev(() => document.querySelector('.visor-img').style.transform);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(100);
  cierto((await ev(() => document.querySelector('.visor-img').style.transform)) !== tA, 'con el lienzo enfocado, las flechas mueven el plano');
  /* Rueda */
  await p.keyboard.press('0'); await p.waitForTimeout(300);
  await p.mouse.move(cx, cy); await p.mouse.wheel(0, -400);
  await p.waitForTimeout(250);
  cierto(+(await ev(() => document.getElementById('lightbox').dataset.escala)) > 1.2, 'la rueda del ratón acerca');
  /* Tab no se sale del visor: cae entre el botón de cerrar y el lienzo */
  await p.keyboard.press('0'); await p.waitForTimeout(250);
  await ev(() => document.querySelector('.lightbox-close').focus());
  await p.keyboard.press('Tab');
  cierto(await ev(() => document.activeElement && document.activeElement.classList.contains('visor-lienzo')), 'Tab pasa del botón de cerrar al lienzo');
  await p.keyboard.press('Tab');
  cierto(await ev(() => document.activeElement && document.activeElement.classList.contains('lightbox-close')), 'y de ahí vuelve al botón: el foco no sale del visor');
  /* Escape cierra y la miniatura regresa */
  await p.keyboard.press('Escape');
  if (!red) {
    await p.waitForTimeout(90);
    cierto(await ev(() => document.getElementById('lightbox').classList.contains('show')), 'con movimiento, la capa sigue puesta mientras el plano regresa volando');
  }
  await p.waitForTimeout(500);
  const fin = await ev(() => ({ show: document.getElementById('lightbox').classList.contains('show'), mini: getComputedStyle(document.querySelector('#hist-body img.hentry-img')).visibility,
    cuerpo: document.getElementById('lightboxBody').children.length, foco: document.activeElement && document.activeElement.className, con: document.getElementById('lightbox').classList.contains('con-visor') }));
  cierto(!fin.show && fin.mini === 'visible' && fin.cuerpo === 0 && !fin.con, 'Escape lo cierra, la miniatura regresa visible y no queda nada colgado', JSON.stringify(fin));
  cierto(/hentry-img/.test(String(fin.foco)), 'y el foco regresa a la miniatura', String(fin.foco));
  if (red) {
    await p.tap(mini); await p.waitForFunction(() => !!document.querySelector('.visor-lienzo')); await p.waitForTimeout(100);
    await p.keyboard.press('Escape'); await p.waitForTimeout(80);
    cierto(!(await ev(() => document.getElementById('lightbox').classList.contains('show'))), 'con menos movimiento se cierra en el acto, sin vuelo');
  }
  /* Tocar el velo (fuera del plano) cierra */
  await p.tap(mini); await p.waitForFunction(() => !!document.querySelector('.visor-lienzo')); await p.waitForTimeout(500);
  await dedo.toca(W / 2, 30);
  await p.waitForTimeout(600);
  cierto(!(await ev(() => document.getElementById('lightbox').classList.contains('show'))), 'tocar el velo, fuera del plano, lo cierra');
  cierto(await ev(() => document.getElementById('histmodal').classList.contains('show')), 'y el toque no se cuela al historial de abajo (que también se cierra con su velo)');
  /* La × */
  await p.tap(mini); await p.waitForFunction(() => !!document.querySelector('.visor-lienzo')); await p.waitForTimeout(500);
  await p.tap('.lightbox-close');
  await p.waitForTimeout(600);
  cierto(!(await ev(() => document.getElementById('lightbox').classList.contains('show'))), 'la × lo cierra');
  /* El «atrás» del teléfono */
  await p.tap(mini); await p.waitForFunction(() => !!document.querySelector('.visor-lienzo')); await p.waitForTimeout(500);
  await p.goBack();
  await p.waitForTimeout(700);
  const atras = await ev(() => ({ lb: document.getElementById('lightbox').classList.contains('show'), his: document.getElementById('histmodal').classList.contains('show') }));
  cierto(!atras.lb && atras.his, 'el «atrás» cierra el plano y deja el historial abierto', JSON.stringify(atras));
  /* Dos toques seguidos a la miniatura no abren dos */
  await p.tap(mini); await p.tap(mini).catch(() => {});
  await p.waitForTimeout(600);
  cierto((await ev(() => document.querySelectorAll('.visor-lienzo').length)) === 1, 'dos toques a la miniatura abren un solo visor');
  await ev(() => closeLightbox()); await p.waitForTimeout(500);
  /* El mismo visor desde la imagen que analizó la IA */
  await cerrarTodo();
  await ev(png => { Q.aiFile = { name: 'plano.svg', type: 'image/svg+xml', url: png }; openAiFile(); }, PLANO);
  await p.waitForFunction(() => !!document.querySelector('.visor-lienzo'), null, { timeout: 3000 });
  await p.waitForTimeout(400);
  cierto(await ev(() => document.getElementById('lightbox').classList.contains('show')), 'openAiFile() abre el mismo visor (una sola implementación)');
  await dedo.toca(cx, cy); await espera(70); await dedo.toca(cx, cy);
  await p.waitForTimeout(400);
  cierto((await ev(() => document.getElementById('lightbox').dataset.escala)) === '2.00', 'y también se acerca con doble toque');
  await ev(() => closeLightbox());
  await p.waitForTimeout(500);
  cierto(!(await ev(() => document.getElementById('lightbox').classList.contains('show'))), 'closeLightbox() lo cierra');
  /* Un PDF sigue siendo un iframe */
  await ev(() => { Q.aiFile = { name: 'plano.pdf', type: 'application/pdf', url: 'data:application/pdf;base64,JVBERi0xLjQK' }; openAiFile(); });
  await p.waitForTimeout(300);
  cierto(await ev(() => !!document.querySelector('#lightboxBody iframe.lightbox-iframe') && !document.querySelector('.visor-lienzo')), 'un PDF sigue siendo un iframe, sin lienzo de zoom');
  await ev(() => closeLightbox());
  await p.waitForTimeout(300);
  cierto(await ev(() => !document.getElementById('lightbox').classList.contains('show') && document.getElementById('lightboxBody').children.length === 0), 'y se cierra limpio');
  await ev(() => { Q.aiFile = null; });
  await sinBucles('tras el visor');

  /* ============================== 8 · CUADERNOS ============================== */
  console.log('\n  — cuadernos: deslizar, cifras, vistazo y nota —');
  await arrancar();
  await ev(() => abrirCuadernos());
  await p.waitForTimeout(500);
  const cards = await ev(() => [...document.querySelectorAll('#cua-body .cua-card')].map(c => ({ n: c.querySelector('.cua-nombre').textContent, clave: c.querySelector('.cua-ini').dataset.clave, h: c.getBoundingClientRect().height })));
  cierto(cards.length === 7, 'siete clientes: la Panadería junta sus dos cotizaciones', String(cards.length));
  cierto(cards.every(c => c.clave), 'cada tarjeta lleva la clave del cliente en sus iniciales (para viajar)');
  await captura('cua-lista');
  await sinDesborde('en los cuadernos', '#climodal');
  /* Resaltar */
  await p.fill('#cua-search', 'optica');
  await p.waitForTimeout(300);
  const cm = await ev(() => ({ n: document.querySelectorAll('#cua-body .cua-card').length, m: [...document.querySelectorAll('#cua-body mark.coincide')].map(x => x.textContent) }));
  cierto(cm.n === 1 && cm.m.join() === 'Óptica', 'en cuadernos: «optica» marca «Óptica» sin acentos', JSON.stringify(cm));
  await p.fill('#cua-search', '3311112');
  await p.waitForTimeout(300);
  const cm2 = await ev(() => ({ n: document.querySelectorAll('#cua-body .cua-card').length, m: [...document.querySelectorAll('#cua-body .cua-sub mark.coincide')].map(x => x.textContent) }));
  cierto(cm2.n === 1 && cm2.m.join() === '33 1111 2', 'y el teléfono se marca por dígitos', JSON.stringify(cm2));
  cierto((await vts()) === 0, 'teclear en el buscador NUNCA fotografía la pantalla (cero transiciones de vista)');
  await p.fill('#cua-search', '');
  await p.waitForTimeout(300);
  /* Deslizar al detalle */
  await ev(() => { document.getElementById('cua-body').scrollTop = 80; });
  const scAntes = await ev(() => document.getElementById('cua-body').scrollTop);
  await ev(() => { window.__vt = 0; });
  await p.tap('#cua-body .cua-card:nth-child(4)');
  await p.waitForTimeout(80);
  if (!red) cierto((await vts()) === 1, 'abrir el cuaderno viaja con una transición de vista');
  else cierto((await vts()) === 0, 'con menos movimiento no viaja nada');
  await p.waitForTimeout(700);
  const det = await ev(() => ({ cab: !!document.querySelector('#cua-body .cua-det-head'), lista: getComputedStyle(document.getElementById('cua-lista-vista')).display,
    titulo: document.getElementById('cua-titulo').textContent, ini: document.querySelectorAll('#cua-body .cua-det-head .cua-ini[data-clave]').length,
    nombres: [...document.querySelectorAll('#cua-body *')].filter(e => e.style.viewTransitionName).length, st: document.getElementById('cua-body').scrollTop }));
  cierto(det.cab && det.lista === 'none' && det.ini === 1, 'el detalle ocupa el lugar de la lista y trae las iniciales del cliente', JSON.stringify(det));
  cierto(det.titulo.length > 0 && det.titulo !== 'Cuadernos de cliente', 'el título dice el cliente', det.titulo);
  cierto(det.nombres === 0, 'terminado el viaje no queda ningún view-transition-name puesto', String(det.nombres));
  cierto(det.st === 0, 'y el detalle empieza arriba');
  await captura('cua-detalle');
  const clave = await ev(() => document.querySelector('#cua-body .cua-det-head .cua-ini').dataset.clave);
  await ev(() => { window.__vt = 0; });
  await p.tap('#cua-body .cua-volver');
  await p.waitForTimeout(80);
  if (!red) cierto((await vts()) === 1, 'volver a «Todos los clientes» también viaja');
  await p.waitForTimeout(700);
  const lis = await ev(() => ({ n: document.querySelectorAll('#cua-body .cua-card').length, lista: getComputedStyle(document.getElementById('cua-lista-vista')).display,
    titulo: document.getElementById('cua-titulo').textContent, sc: document.getElementById('cua-body').scrollTop }));
  cierto(lis.n === 7 && lis.lista !== 'none' && lis.titulo === 'Cuadernos de cliente', 'regresa la lista y su título', JSON.stringify(lis));
  cierto(Math.abs(lis.sc - scAntes) <= 2, 'y la lista queda donde estaba (no vuelve arriba)', JSON.stringify([lis.sc, scAntes]));
  cierto((await ev(c => !!document.querySelector('#cua-body .cua-card .cua-ini[data-clave="' + c + '"]'), clave)), 'las iniciales del cliente vuelven a su tarjeta con la misma clave');
  /* Desde el pie también */
  await p.tap('#cua-body .cua-card:nth-child(2)');
  await p.waitForTimeout(800);
  await p.tap('#cua-foot button:first-of-type');
  await p.waitForTimeout(800);
  cierto((await ev(() => document.querySelectorAll('#cua-body .cua-card').length)) === 7, 'el botón del pie también regresa a la lista');
  /* Sin View Transitions (un navegador que no las tiene): la pieza cae al FLIP de Web Animations y
     el resultado es el mismo pantalla. */
  await ev(() => { window.__svt = document.startViewTransition; document.startViewTransition = undefined; });
  await ev(() => abrirCuaderno('tel:3311112222'));
  await p.waitForTimeout(700);
  const sinVT = await ev(() => ({ cab: !!document.querySelector('#cua-body .cua-det-head'), lista: getComputedStyle(document.getElementById('cua-lista-vista')).display }));
  cierto(sinVT.cab && sinVT.lista === 'none', 'sin View Transitions el detalle también abre (FLIP de respaldo)', JSON.stringify(sinVT));
  await ev(() => volverALosClientes());
  await p.waitForTimeout(700);
  cierto((await ev(() => document.querySelectorAll('#cua-body .cua-card').length)) === 7, 'y también regresa a la lista');
  await ev(() => { document.startViewTransition = window.__svt; });
  /* Las cifras ruedan solo si cambiaron */
  const lae = '#cua-body .cua-card .cua-ini[data-clave="tel:3311112222"]';
  await ev(() => abrirCuaderno('tel:3311112222'));
  await p.waitForTimeout(900);
  const cif1 = await ev(() => [...document.querySelectorAll('#cua-body .cua-cifra b')].map(b => ({ t: b.textContent, r: b.classList.contains('rueda-rodando'), cl: b.classList.contains('rueda-cifra') })));
  cierto(cif1.map(c => c.t).join('|') === '2|$23,200.00|$11,600.00', 'las tres cifras: cotizaciones, autorizado y promedio', JSON.stringify(cif1));
  cierto(cif1.every(c => c.cl && !c.r), 'la primera vez que se ven no ruedan');
  await ev(() => { volverALosClientes(); }); await p.waitForTimeout(800);
  await ev(() => { cerrarCuadernos(); });
  await p.waitForTimeout(300);
  await ev(() => { const a = getHistorial(); const nuevo = JSON.parse(JSON.stringify(a[0])); nuevo.folio = 'COT-0060'; nuevo.ts = Date.now(); a.unshift(nuevo); saveHistorial(a); abrirCuadernos(); });
  await p.waitForTimeout(500);
  await ev(() => abrirCuaderno('tel:3311112222'));
  /* Se mira PRONTO a propósito: la clase `rueda-rodando` solo está mientras rueda, y con 900 ms
     ya se perdió. Pero un `waitForTimeout(120)` fijo se cae cuando la máquina va cargada —la tanda
     completa corre cuatro navegadores a la vez— y entonces no hay ni cifras que leer: la prueba
     fallaba con [] y reventaba dos líneas más abajo. Se espera a que las tres existan, que es la
     condición de verdad, y se leen en ese momento: el texto ya es el final (la pieza lo escribe de
     una vez y anima la tira de dígitos), así que la marca de rodando sigue puesta. */
  await p.waitForFunction(() => document.querySelectorAll('#cua-body .cua-cifra b').length === 3,
    { timeout: 6000 }).catch(() => {});
  const cif2 = await ev(() => [...document.querySelectorAll('#cua-body .cua-cifra b')].map(b => ({ t: b.textContent, r: b.classList.contains('rueda-rodando') })));
  cierto(cif2.map(c => c.t).join('|') === '3|$34,800.00|$11,600.00', 'con una cotización más: 3 y $34,800.00', JSON.stringify(cif2));
  if (!red) cierto(cif2[0].r && cif2[1].r && !cif2[2].r, 'las que cambiaron ruedan y el promedio, que no cambió, no', JSON.stringify(cif2));
  else cierto(cif2.every(c => !c.r), 'con menos movimiento no rueda ninguna, solo cambia el número');
  await p.waitForTimeout(900);
  /* La nota y su glifo (H29) */
  await p.tap('#cua-nota');
  await p.keyboard.type('Paga a 15 días');
  await p.waitForTimeout(120);
  const n1 = await ev(() => ({ e: document.querySelector('#cua-nota-estado .marca-estado')?.dataset.estado, t: document.querySelector('#cua-nota-estado .cua-nota-txt').textContent,
    tam: document.querySelector('#cua-nota-estado .marca-estado')?.getBoundingClientRect().width, delante: document.getElementById('cua-nota-estado').firstElementChild?.classList.contains('marca-estado') }));
  cierto(n1.e === 'espera' && n1.t === 'Escribiendo…', 'mientras se escribe: anillo punteado y «Escribiendo…»', JSON.stringify(n1));
  cierto(Math.abs(n1.tam - 14) < 0.6 && n1.delante, 'el glifo mide 14 px y va delante de la frase', JSON.stringify(n1));
  await captura('cua-nota-escribe');
  await p.waitForTimeout(950);
  const n2 = await ev(() => ({ e: document.querySelector('#cua-nota-estado .marca-estado').dataset.estado, t: document.querySelector('#cua-nota-estado .cua-nota-txt').textContent,
    guardada: JSON.parse(localStorage.getItem('al3d_cuadernos') || '{}')['tel:3311112222'] }));
  cierto(n2.e === 'ok' && n2.t === 'Guardada en este dispositivo.', 'al guardar: palomita y «Guardada en este dispositivo.»', JSON.stringify(n2));
  cierto(n2.guardada === 'Paga a 15 días', 'y la nota quedó en el almacenamiento');
  await contraste('#cua-nota-estado .cua-nota-txt', 'la frase de estado de la nota');
  await sinBucles('con la nota guardada');
  /* Sin espacio: ✕ con texto */
  await ev(() => { window.__setItem = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'al3d_cuadernos') throw new Error('cuota'); return window.__setItem.call(this, k, v); }; });
  await p.keyboard.type('!');
  await p.waitForTimeout(950);
  const n3 = await ev(() => ({ e: document.querySelector('#cua-nota-estado .marca-estado').dataset.estado, t: document.querySelector('#cua-nota-estado .cua-nota-txt').textContent,
    toast: Piezas.aviso.vivos().map(a => a.msg + '|' + a.label).join(',') }));
  cierto(n3.e === 'mal' && /No hubo espacio para guardar la nota/.test(n3.t), 'si no hay espacio: ✕ y la frase lo dice (no solo el color)', JSON.stringify(n3));
  cierto(/Respaldar/.test(n3.toast), 'y el aviso ofrece «Respaldar»');
  await captura('cua-nota-error');
  await ev(() => { Storage.prototype.setItem = window.__setItem; Piezas.aviso.limpiar(); });
  await ev(() => { cuaNotaEscrita(); }); await p.waitForTimeout(900);
  cierto((await ev(() => document.querySelector('#cua-nota-estado .marca-estado').dataset.estado)) === 'ok', 'y al volver el espacio, vuelve la palomita');
  /* Las dos listas se desvanecen en sus bordes */
  await ev(() => { volverALosClientes(); }); await p.waitForTimeout(800);
  await ev(() => { document.getElementById('cua-body').scrollTop = 0; }); await p.waitForTimeout(250);
  const bor = await ev(() => { const b = document.getElementById('cua-body'); return { sc: b.scrollHeight > b.clientHeight, cl: b.className }; });
  cierto(/\bbordes\b/.test(bor.cl) && /bordes-y/.test(bor.cl), 'la lista de clientes lleva los bordes que se desvanecen', bor.cl);
  if (bor.sc) cierto(/hay-despues/.test(bor.cl), 'y se desvanece abajo, donde hay más');
  await ev(() => { document.getElementById('cua-body').scrollTop = 9999; }); await p.waitForTimeout(250);
  const bor2 = await ev(() => document.getElementById('cua-body').className);
  if (bor.sc) cierto(/hay-antes/.test(bor2) && !/hay-despues/.test(bor2), 'al llegar al fondo se desvanece arriba y ya no abajo', bor2);
  const mask = await ev(() => getComputedStyle(document.getElementById('cua-body')).maskImage);
  cierto(!bor.sc || mask !== 'none', 'la máscara es una imagen quieta', mask);
  await sinDesborde('en el detalle del cuaderno', '#climodal');
  await cerrarTodo();
  await abrirHist();
  const bh = await ev(() => document.getElementById('hist-body').className);
  cierto(/bordes-y/.test(bh), 'el historial también trae sus bordes', bh);
  await ev(() => { document.getElementById('hist-body').scrollTop = 9999; }); await p.waitForTimeout(250);
  cierto(/hay-antes/.test(await ev(() => document.getElementById('hist-body').className)), 'y se desvanece arriba al bajar');
  await cerrarTodo();

  /* ============================== 9 · EL VISTAZO AL CUADERNO (H21) ============================== */
  console.log('\n  — un vistazo al cuaderno sin salir del formulario —');
  await arrancar();
  await ev(() => { Q.cliente = 'Panadería La Espiga'; Q.tel = '33 1111 2222'; Q.proy = 'Otro letrero'; document.getElementById('f-cli').value = Q.cliente; document.getElementById('f-tel').value = Q.tel;
    document.getElementById('f-proy').value = Q.proy; actualizarAvisoCuaderno(); irAPantalla('cliente', { forzar: true }); window.scrollTo(0, 0); });
  await p.waitForTimeout(500);
  const av1 = await ev(() => { const a = document.getElementById('cua-aviso'), b = a.querySelector('.cua-aviso-ver'); return { vis: getComputedStyle(a).display, txt: a.textContent.replace(/\s+/g, ' ').trim(), hay: !!b,
    popup: b && b.getAttribute('aria-haspopup'), exp: b && b.getAttribute('aria-expanded') }; });
  cierto(av1.hay && /Ya tiene cuaderno · 2 cotizaciones · \$23,200\.00/.test(av1.txt), 'el aviso sigue diciendo «Ya tiene cuaderno · 2 cotizaciones · $23,200.00»', av1.txt);
  cierto(av1.popup === 'dialog' && av1.exp === 'false', '«Ver cuaderno» anuncia que abre una tarjeta');
  await centro('#cua-aviso .cua-aviso-ver');
  await p.tap('#cua-aviso .cua-aviso-ver');
  await p.waitForTimeout(500);
  const vz2 = await ev(() => { const g = document.querySelector('.vistazo:popover-open'); if (!g) return null;
    return { filas: [...g.querySelectorAll('.hvz-cots li')].map(l => l.textContent.replace(/\s+/g, ' ').trim()), ini: g.querySelector('.cua-ini').textContent, nom: g.querySelector('.hvz-nom').textContent,
      resumen: g.querySelector('.hvz-cab small').textContent, botones: [...g.querySelectorAll('.vistazo-acciones .btn')].map(b => ({ t: b.textContent, h: b.getBoundingClientRect().height })),
      modal: document.getElementById('climodal').classList.contains('show'), exp: document.querySelector('.cua-aviso-ver').getAttribute('aria-expanded'),
      cli: Q.cliente, enHoja: g.classList.contains('en-hoja'), foco: g.contains(document.activeElement) }; });
  cierto(vz2 && vz2.filas.length === 2, 'tocar el aviso abre una tarjeta con las cotizaciones del cliente', JSON.stringify(vz2));
  cierto(vz2 && /COT-0050/.test(vz2.filas[0]) && /\$11,600\.00/.test(vz2.filas[0]) && /27 sep 2026/.test(vz2.filas[0]) && /Letrero Panadería La Espiga/.test(vz2.filas[0]), 'cada renglón dice folio, proyecto, total y fecha', vz2 && vz2.filas[0]);
  cierto(vz2 && vz2.ini === 'PL' && vz2.nom === 'Panadería La Espiga' && /2 cotizaciones/.test(vz2.resumen), 'con las iniciales y el nombre del cliente', JSON.stringify([vz2 && vz2.ini, vz2 && vz2.nom]));
  cierto(vz2 && vz2.botones.map(b => b.t).join() === 'Duplicar la última,Abrir cuaderno', 'y dos acciones: «Duplicar la última» y «Abrir cuaderno»');
  cierto(vz2 && vz2.botones.every(b => b.h >= 40), 'de 40 px o más (44 con el dedo)', JSON.stringify(vz2 && vz2.botones.map(b => b.h)));
  cierto(vz2 && !vz2.modal && vz2.exp === 'true' && vz2.cli === 'Panadería La Espiga', 'el modal de cuadernos NO se abre y lo capturado sigue ahí');
  cierto(vz2 && vz2.enHoja === (W <= 560), 'en el teléfono sale como hoja de abajo', String(vz2 && vz2.enHoja));
  cierto(vz2 && vz2.foco, 'el foco entra a la tarjeta');
  await captura('cua-vistazo');
  await contraste('.vistazo:popover-open .hvz-folio', 'el folio del vistazo');
  await contraste('.vistazo:popover-open .hvz-proy', 'el proyecto del vistazo');
  await sinBucles('con el vistazo abierto');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(350);
  const cerrado = await ev(() => ({ abierto: !!document.querySelector('.vistazo:popover-open'), foco: document.activeElement && document.activeElement.className, exp: document.querySelector('.cua-aviso-ver').getAttribute('aria-expanded') }));
  cierto(!cerrado.abierto && /cua-aviso-ver/.test(cerrado.foco) && cerrado.exp === 'false', 'Escape cierra la tarjeta y devuelve el foco al aviso', JSON.stringify(cerrado));
  /* Abrir cuaderno */
  await p.tap('#cua-aviso .cua-aviso-ver'); await p.waitForTimeout(400);
  await p.tap('.vistazo:popover-open [data-cua="abrir"]');
  await p.waitForTimeout(700);
  const ab = await ev(() => ({ cua: document.getElementById('climodal').classList.contains('show'), cab: document.getElementById('cua-titulo').textContent, vz: !!document.querySelector('.vistazo:popover-open'), cli: Q.cliente, proy: Q.proy }));
  cierto(ab.cua && ab.cab === 'Panadería La Espiga' && !ab.vz, '«Abrir cuaderno» abre el modal en el cuaderno de ese cliente y cierra la tarjeta', JSON.stringify(ab));
  cierto(ab.cli === 'Panadería La Espiga' && ab.proy === 'Otro letrero', 'sin perder lo que había en el formulario');
  await ev(() => cerrarCuadernos()); await p.waitForTimeout(400);
  /* Duplicar la última: pregunta antes de dejar atrás lo que se está capturando */
  await p.tap('#cua-aviso .cua-aviso-ver'); await p.waitForTimeout(400);
  await p.tap('.vistazo:popover-open [data-cua="duplicar"]');
  await p.waitForTimeout(600);
  const dp = await ev(() => ({ conf: document.getElementById('confmodal').classList.contains('show'), t: document.getElementById('conf-titulo').textContent, vz: !!document.querySelector('.vistazo:popover-open'), folio: Q.folio }));
  cierto(dp.conf && /sin autorizar/.test(dp.t) && !dp.vz, '«Duplicar la última» pregunta antes de dejar atrás la cotización a medias', JSON.stringify(dp));
  await p.tap('#conf-no'); await p.waitForTimeout(450);
  cierto((await ev(() => Q.proy)) === 'Otro letrero', 'y «Seguir con la mía» no pierde nada');
  await p.tap('#cua-aviso .cua-aviso-ver'); await p.waitForTimeout(400);
  await p.tap('.vistazo:popover-open [data-cua="duplicar"]'); await p.waitForTimeout(500);
  /* Es una pregunta roja —la cotización de la pantalla se pierde— pero NO borra nada, así que se
     contesta con un toque: el sostener se reservó para lo que de verdad borra (ver confirmar() en
     nucleo.js). Esto se probó primero al revés y se corrigió cuando Dirección lo decidió. */
  await p.tap('#conf-si');
  await p.waitForTimeout(900);
  const dd = await ev(() => ({ estado: Q.estado, n: Q.items.length, cli: Q.cliente, folio: Q.folio, proy: Q.proy }));
  cierto(dd.estado === 'borrador' && dd.n === 2 && dd.cli === 'Panadería La Espiga' && dd.folio !== 'COT-0050', 'confirmar duplica la última en un borrador nuevo, con sus partidas', JSON.stringify(dd));
  await sinBucles('al terminar');

  /* ============================== 10 · RESTAURAR CON LOS PASOS A LA VISTA (H25) ============================== */
  console.log('\n  — restaurar con los pasos a la vista —');
  await arrancar();
  const respaldo = await ev(() => {
    const it = (id, desc, lt) => ({ id, tipo: 'manual', desc, pz: 1, pu: lt, _lt: lt, showInPdf: true });
    const E = n => ({ folio: 'COT-' + String(n).padStart(4, '0'), proy: 'Restaurada MARCA_RESTAURADA ' + n, cliente: 'Cliente ' + n, tel: '33 1111 22' + n, fechaAuth: '1 sep 2026', autorizador: 'Elías',
      neto: 1160, sub: 1000, iva: true, precioAuth: 0, items: [it(1, 'Algo', 1000)], itemsAuth: {}, ts: Date.now() - 864e5 });
    return JSON.stringify({ app: 'cotizador-al3d', formato: 1, fecha: new Date().toISOString(), datos: { al3d_historial: JSON.stringify([E(71), E(72)]), al3d_folio: '72' } });
  });
  const historialAntes = await ev(() => localStorage.getItem('al3d_historial'));
  /* Un archivo que no es un respaldo ni abre la vista */
  await ev(() => restaurarDesde('esto no es json'));
  await p.waitForTimeout(300);
  cierto(!(await ev(() => !document.getElementById('hist-restaurar').hidden)), 'un archivo que no es un respaldo avisa con un aviso y NO abre la vista de restaurar');
  await ev(() => Piezas.aviso.limpiar());
  await ev(t => restaurarDesde(t), respaldo);
  await p.waitForTimeout(600);
  const rs = await ev(() => ({ vista: !document.getElementById('hist-restaurar').hidden, modal: document.getElementById('histmodal').classList.contains('show'), txt: document.getElementById('hist-rest-txt').textContent,
    pasos: [...document.querySelectorAll('#hist-rest-pasos .traza-paso')].map(l => ({ c: l.dataset.clave, e: l.dataset.estado, t: l.querySelector('.traza-t').textContent })),
    lista: getComputedStyle(document.getElementById('hist-body')).display, buscar: getComputedStyle(document.querySelector('#histmodal .hist-search-bar')).display,
    foot: getComputedStyle(document.querySelector('#histmodal .hist-foot')).display, foco: document.activeElement && document.activeElement.id,
    si: document.getElementById('hist-rest-si').className, mant: document.getElementById('hist-rest-si').hasAttribute('data-mantener') }));
  cierto(rs.vista && rs.modal, 'restaurarDesde() abre la vista dentro del historial', JSON.stringify(rs));
  cierto(/2 cotizaciones/.test(rs.txt) && /Antes se descarga una copia/.test(rs.txt), 'y dice qué va a pasar: cuántas cotizaciones y la copia previa', rs.txt);
  cierto(rs.pasos.map(x => x.c).join() === 'copia,escribir,recarga' && rs.pasos.every(x => x.e === 'espera'), 'tres renglones, todos en espera', JSON.stringify(rs.pasos));
  cierto(rs.lista === 'none' && rs.buscar === 'none' && rs.foot === 'none', 'la vista sustituye a la lista, al buscador y al pie');
  cierto(rs.foco === 'hist-rest-t', 'el foco va al título de la vista', String(rs.foco));
  cierto(rs.mant, '«Restaurar» está bajo la pieza de mantener presionado');
  await captura('restaurar-vista');
  await contraste('#hist-rest-txt', 'el texto de la vista');
  await contraste('#hist-rest-pasos .traza-t', 'los renglones de los pasos');
  await sinDesborde('en la vista de restaurar', '#histmodal');
  await sinBucles('en la vista de restaurar (antes de confirmar)');
  /* Un toque no restaura */
  await sostener('#hist-rest-si', 90);
  await p.waitForTimeout(300);
  cierto((await ev(() => document.getElementById('hist-rest-fin').textContent)) === 'Mantén presionado para restaurar' && !bajadas.length, 'un toque corto dice «Mantén presionado para restaurar» y no hace nada');
  cierto((await ev(() => localStorage.getItem('al3d_historial'))) === historialAntes, 'y no tocó el historial');
  /* Soltar a media espera tampoco */
  await sostener('#hist-rest-si', 500);
  await p.waitForTimeout(300);
  cierto(!bajadas.length && (await ev(() => localStorage.getItem('al3d_historial'))) === historialAntes, 'soltar a media espera tampoco');
  /* Cancelar */
  await p.tap('#hist-rest-no');
  await p.waitForTimeout(350);
  cierto(await ev(() => document.getElementById('hist-restaurar').hidden && getComputedStyle(document.getElementById('hist-body')).display !== 'none'), '«Cancelar» regresa a la lista');
  /* Escape y volver a abrir: empieza por la lista */
  await ev(t => restaurarDesde(t), respaldo); await p.waitForTimeout(400);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await abrirHist();
  cierto(await ev(() => document.getElementById('hist-restaurar').hidden), 'Escape cierra todo y al abrir el historial otra vez se empieza por la lista');
  /* Una descarga que falla: no se cambia nada */
  await ev(t => { window.__desc = descargarArchivo; descargarArchivo = () => false; restaurarDesde(t); }, respaldo);
  await p.waitForTimeout(500);
  await sostener('#hist-rest-si', 1500);
  await p.waitForTimeout(900);
  const f1 = await ev(() => ({ pasos: [...document.querySelectorAll('#hist-rest-pasos .traza-paso')].map(l => l.dataset.estado), fin: document.getElementById('hist-rest-fin').textContent,
    no: document.getElementById('hist-rest-no').textContent, si: document.getElementById('hist-rest-si').disabled, vista: !document.getElementById('hist-restaurar').hidden, h: localStorage.getItem('al3d_historial'), toast: Piezas.aviso.vivos().map(a => a.msg).join('|'),
    marca: window.__marca }));
  cierto(f1.pasos.join() === 'mal,espera,espera', 'si la copia no se pudo descargar, ese renglón queda en ✕ y los demás siguen esperando', JSON.stringify(f1.pasos));
  cierto(/no se descargó/.test(await ev(() => document.querySelector('#hist-rest-pasos .traza-paso .traza-t').textContent)), 'y se lee en pasado («no se descargó»), no como si siguiera en curso');
  cierto(f1.fin === 'No se cambió nada.' && f1.no === 'Volver' && f1.si === true && f1.vista, 'dice «No se cambió nada.», deja «Restaurar» apagado y «Volver»; y la vista SE QUEDA para poder leerlo', JSON.stringify([f1.fin, f1.no, f1.si, f1.vista]));
  cierto(f1.h === historialAntes, 'y el historial es EXACTAMENTE el de antes');
  cierto(/No se pudo descargar el respaldo previo — no se cambió nada/.test(f1.toast), 'con su aviso de siempre', f1.toast);
  await captura('restaurar-falla-copia');
  await ev(() => { descargarArchivo = window.__desc; Piezas.aviso.limpiar(); });
  await p.tap('#hist-rest-no'); await p.waitForTimeout(300);
  /* Una escritura que no cabe: se devuelve lo anterior */
  await ev(t => { window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'al3d_historial' && String(v).includes('MARCA_RESTAURADA')) throw new Error('cuota'); return window.__setItem.call(this, k, v); };
    restaurarDesde(t); }, respaldo);
  await p.waitForTimeout(500);
  await sostener('#hist-rest-si', 1500);
  await p.waitForTimeout(1500);
  const f2 = await ev(() => ({ pasos: [...document.querySelectorAll('#hist-rest-pasos .traza-paso')].map(l => ({ e: l.dataset.estado, d: l.querySelector('.traza-t').textContent })), fin: document.getElementById('hist-rest-fin').textContent,
    h: localStorage.getItem('al3d_historial'), toast: Piezas.aviso.vivos().map(a => a.msg).join('|') }));
  cierto(f2.pasos.map(x => x.e).join() === 'ok,mal,espera', 'si no cupo, la copia sí se descargó (✓) y la escritura queda en ✕', JSON.stringify(f2.pasos));
  cierto(/No cupo el respaldo/.test(f2.pasos[1].d) && f2.fin === 'No se cambió nada.', 'el renglón dice qué pasó, en pasado, y debajo «No se cambió nada.»', JSON.stringify([f2.pasos[1].d, f2.fin]));
  cierto(f2.h === historialAntes, 'y se devolvió lo anterior clave por clave');
  cierto(bajadas.some(n => /antes-de-restaurar/.test(n)), 'la copia de lo que había sí se bajó', JSON.stringify(bajadas));
  cierto(/No cupo el respaldo en este dispositivo/.test(f2.toast), 'y avisa que no cupo', f2.toast);
  await ev(() => { Storage.prototype.setItem = window.__setItem; Piezas.aviso.limpiar(); });
  await p.tap('#hist-rest-no'); await p.waitForTimeout(300);
  /* El camino bueno, con Enter sostenido (teclado): marca los tres pasos y recarga. Los estados se
     anotan DENTRO de la página, en sessionStorage, que sobrevive a la recarga: con menos movimiento
     cada paso dura una fracción de segundo y mirar desde fuera se los pierde. */
  bajadas.length = 0;
  await ev(t => restaurarDesde(t), respaldo);
  await p.waitForTimeout(500);
  await ev(() => {
    sessionStorage.setItem('__pasos', '[]'); window.__antesDeRecargar = 1;
    const caja = document.getElementById('hist-rest-pasos');
    const reg = () => {
      const e = [...caja.querySelectorAll('.traza-paso')].map(l => l.dataset.estado).join();
      const a = JSON.parse(sessionStorage.getItem('__pasos'));
      if (a[a.length - 1] !== e) { a.push(e); sessionStorage.setItem('__pasos', JSON.stringify(a)); }
    };
    reg();
    new MutationObserver(reg).observe(caja, { subtree: true, attributes: true, attributeFilter: ['data-estado'] });
    document.getElementById('hist-rest-si').focus();
  });
  await p.keyboard.down('Enter');
  await espera(1450);
  await p.keyboard.up('Enter');
  /* La marca de la página vieja desaparece con la recarga: así se sabe que ya es la nueva. */
  await p.waitForFunction(() => !window.__antesDeRecargar && typeof Q !== 'undefined' && typeof abrirHistorial === 'function', null, { timeout: 9000 });
  await p.waitForTimeout(600);
  const vistos = JSON.parse(await ev(() => sessionStorage.getItem('__pasos') || '[]'));
  const orden = ['espera,espera,espera', 'trabaja,espera,espera', 'ok,espera,espera', 'ok,trabaja,espera', 'ok,ok,espera', 'ok,ok,trabaja'];
  let k = 0; for (const v of vistos) if (v === orden[k]) k++;
  cierto(k === orden.length, 'los tres renglones se marcan en orden: copia, escritura y «Recargando…»', JSON.stringify(vistos));
  const fin2 = await ev(() => ({ folios: getHistorial().map(e => e.folio), folio: localStorage.getItem('al3d_folio') }));
  cierto(fin2.folios.join() === 'COT-0071,COT-0072' && fin2.folio === '72', 'la app se recarga con lo del respaldo', JSON.stringify(fin2));
  cierto(bajadas.some(n => /antes-de-restaurar/.test(n)), 'y la copia de lo anterior se descargó antes', JSON.stringify(bajadas));
  await abrirHist();
  cierto((await entradas()).join() === 'COT-0072,COT-0071' || (await entradas()).join() === 'COT-0071,COT-0072', 'el historial muestra lo restaurado');

  /* ============================== FINAL ============================== */
  cierto(!errs.length, 'sin errores de página en toda la ronda', errs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (let i = 0; i < RONDAS.length; i++) {
  if (SOLO.length && !SOLO.includes(i + 1)) continue;
  try { await ronda(RONDAS[i], i); }
  catch (e) { mal('la ronda ' + (i + 1) + ' se cayó: ' + (e && e.stack || e)); }
}
await nav.close();
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo pasa.');
process.exit(fallos ? 1 : 0);
