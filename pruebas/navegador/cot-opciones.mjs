/* LA PROPUESTA CON OPCIONES (pieza 76), CON EL DEDO, EL RATÓN Y EL TECLADO.

   Función nueva: el vendedor propone el mismo trabajo en dos o tres materiales o tipos (aluminio,
   acrílico y caja de luz), los enseña lado a lado con su cuenta delante del cliente, y la que el
   cliente elige pasa a ser la partida. Lo que se defiende, y por qué se mide en un navegador:

   · PROPONER Y EDITAR. «Proponer otra opción» convierte la partida en una propuesta de dos; cada
     tarjeta trae su cuenta con las tarifas del catálogo (la misma lineTotal() del resto: no hay una
     aritmética paralela); «+ Otra opción» llega a tres y ya no ofrece más; «Editar» abre una opción
     en el editor de siempre. Nunca cuenta más de UNA opción en el total: la abierta.
   · FALTA ELEGIR. Mientras el cliente no elige, la partida lo dice —la fórmula sigue siendo la cuenta,
     la cara plegada tiene su ficha, el «qué sigue» lo nombra— y el aviso de partidas sin terminar
     frena el mandar a autorizar (con su «de todos modos»).
   · ELEGIR ES EL MOMENTO. La elegida pasa a ser la partida y las otras se descartan, sin rastro en Q.
     Con movimiento el importe viaja de la tarjeta al total (UNA transición de vista, la pieza 22);
     con menos movimiento solo se repinta. Con «Deshacer» en el aviso y con el deshacer de siempre.
     Una opción a medias no se elige: se dice qué falta.
   · DELANTE DEL CLIENTE. En borrador el importe y la cuenta de cada tarjeta se difuminan como todos
     los importes, y se espían manteniendo el dedo.
   · CON EL CANDADO PUESTO se leen las tarjetas y no hay con qué cambiarlas.
   · EL PDF. Una hoja de opciones (carta, sin movimiento) con las tarjetas lado a lado y la marca de la
     que cuenta en el total; se parte sola de dos en dos partidas; el pie dice «Hoja X de Y» bien; el
     papel sigue sumando; la orden de trabajo avisa que falta elegir; y al elegir la hoja desaparece.

   Cada ronda es un teléfono distinto (360 y 420 px) en claro u oscuro, con o sin menos movimiento, con
   dedo (CDP: touchStart/touchMove/touchEnd), ratón y teclado; sin errores de página, sin desborde
   horizontal, sin nada que se mueva solo en reposo y con el contraste medido sobre lo que se ve.

   Uso:  PUERTO=8814 node pruebas/navegador/cot-opciones.mjs
         RONDA=1,3       para correr solo esas rondas, numeradas desde 1
         CAPTURAS=/ruta  para guardar capturas a 360 px (por omisión /tmp/cot-opciones-capturas) */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const CAP = process.env.CAPTURAS || join(tmpdir(), 'cot-opciones-capturas');
mkdirSync(CAP, { recursive: true });
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, m, extra = '') => (c ? bien(m) : mal(m + (extra ? ' — ' + extra : '')));

const RONDAS = [
  { W: 360, tema: 'claro', red: false }, { W: 360, tema: 'oscuro', red: true },
  { W: 420, tema: 'claro', red: true }, { W: 420, tema: 'oscuro', red: false },
];
const SOLO = (process.env.RONDA || '').split(',').filter(Boolean).map(Number);
const ALTO_CARTA = 1056, ANCHO_CARTA = 816;

/* Una partida de letras como la guarda addItem(), con el material ya elegido a mano. */
const L = (id, extra = {}) => ({ id, tipo: 'letras', material: 'al-paint', matAuto: false, comp: 'recta', luz: true,
  ilumTipo: 'fria', altura: 40, n: 9, tarifa: 0, ancho: 0, alto: 0, acab: '', recComp: false, bas: '', desc: 'Letrero FARMACIA',
  descAi: false, pz: 1, pu: 0, textoAuto: '', showInPdf: true, ...extra });

const enPagina = {
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

async function ronda(R, indice) {
  const { W, tema, red } = R;
  console.log(`\n══ RONDA ${indice + 1} · ${W} px · ${tema} · ${red ? 'menos movimiento' : 'con movimiento'} ══`);
  const H = 740;
  const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block', reducedMotion: red ? 'reduce' : 'no-preference' });
  await ctx.addInitScript({ path: fileURLToPath(new URL('./hoja-de-mentiras.js', import.meta.url)) });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|Failed to load resource/.test(m.text())) errs.push('consola: ' + m.text()); });
  const ev = (f, a) => p.evaluate(f, a);
  const captura = async (nombre, sel) => {
    if (W !== 360) return;
    await ev(sel => { try { Piezas.aviso.limpiar(); } catch (_) {} const el = sel && document.querySelector(sel); if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy(0, -140); }, sel || null);
    await p.waitForTimeout(150);
    await p.screenshot({ path: join(CAP, `${nombre}-${tema}${red ? '-rm' : ''}.png`) });
  };
  const dedo = {
    abajo: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }),
    arriba: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  };
  const centro = async sel => ev(sel => {
    const el = document.querySelector(sel); if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }, sel);
  const tocar = async sel => { const c = await centro(sel); if (!c) return null; await p.touchscreen.tap(c.x, c.y); return c; };
  const sinDesborde = async (donde, sel) => {
    const r = await ev(({ sel, W }) => {
      const de = document.documentElement;
      const raiz = sel ? document.querySelector(sel) : document.body;
      const fuera = [...(raiz ? raiz.querySelectorAll('*') : [])].filter(e => {
        const b = e.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(e).position === 'fixed') return false;
        if (e.closest('.mira,.toast,.vistazo,.desenfoque-borde,[hidden],.rueda-vista,.solo-voz,.desliza-acciones,.desliza-principal,.del-pista')) return false;
        return b.right > W + 1 || b.left < -1;
      }).slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 30));
      return { pagina: de.scrollWidth - de.clientWidth, fuera };
    }, { sel, W });
    cierto(r.pagina <= 1 && !r.fuera.length, `sin desborde horizontal ${donde}`, JSON.stringify(r));
  };
  const sinBucles = async donde => {
    const r = await ev(() => document.getAnimations().filter(a => {
      const t = a.effect && a.effect.target;
      return a.effect && a.effect.getComputedTiming().iterations === Infinity && t && t.closest
        && t.closest('#card-partidas,#sidebox,#items,.sum') && !t.closest('.ai-btn');
    }).map(a => (a.effect.target.className || a.effect.target.tagName) + ':' + (a.animationName || a.transitionProperty)));
    cierto(!r.length, `nada gira ni late solo en reposo ${donde}`, JSON.stringify(r));
  };
  const contraste = async (sel, donde, min = 4.5) => {
    const c = await ev(enPagina.contraste, sel);
    cierto(c !== null && c >= min, `contraste de ${donde} ≥ ${min}:1`, c === null ? 'no existe' : c.toFixed(2));
  };
  const armar = async (items, extra = {}) => {
    await ev(({ items, extra }) => {
      Q.cliente = 'Farmacia San Juan'; Q.proy = 'Letrero fachada'; Q.tel = '33 2813 0092'; Q.dirRaw = 'Av. Vallarta 1234, Guadalajara';
      Q.estado = 'borrador'; Q.rol = 'vendedor'; Q.editMode = false; Q.precioAuth = 0; Q.itemsAuth = {}; Q.huellaAuth = ''; Q.entrega = '';
      Object.assign(Q, extra);
      Q.items = items; pid = Math.max(0, ...items.map(i => i.id));
      _plegadas.clear(); _idsPintados = null; _opAntes = null;
      saveState(); renderItems(); renderSummary(); irAPantalla('partidas', { forzar: true });
      window.scrollTo(0, 0);
    }, { items, extra });
    await p.waitForTimeout(450);
  };
  const espiarVT = () => ev(() => {
    window.__vt = 0;
    if (!window.__vtOrig) {
      window.__vtOrig = document.startViewTransition ? document.startViewTransition.bind(document) : null;
      if (window.__vtOrig) document.startViewTransition = fn => { window.__vt++; return window.__vtOrig(fn); };
    }
  });
  const vts = () => ev(() => window.__vt || 0);
  const estado = () => ev(() => {
    const it = Q.items[0] || {}, o = it.opciones;
    return { n: Q.items.length, tipo: it.tipo, mat: it.material, sub: totals().sub, ops: o ? o.lista.length : 0, activa: o ? o.activa : null,
      tarjetas: document.querySelectorAll('.op-card').length, foco: document.activeElement && (document.activeElement.id || document.activeElement.className) };
  });
  const numero = s => Number(String(s).replace(/[$,\s]/g, ''));

  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof Q !== 'undefined' && typeof Piezas !== 'undefined' && typeof renderItems === 'function' && typeof opcionesDe === 'function');
  await p.waitForTimeout(900);
  await espiarVT();
  const TAR = await ev(() => ({ pintado: MATERIALES.find(m => m.key === 'al-paint').precio, acr: MATERIALES.find(m => m.key === 'acr-vol').precio,
    caja: CAJAS.find(c => c.key === 'std').tarifa }));

  /* ============================== 1 · PROPONER, CON EL DEDO ============================== */
  console.log('\n  — proponer —');
  await armar([L(1)]);
  cierto(await ev(() => !document.querySelector('.op-card') && !!document.querySelector('#p-1 .op-proponer')),
    'una partida normal no enseña tarjetas y sí ofrece «Proponer otra opción»');
  await captura('1-antes', '#p-1');
  const prop = await centro('#p-1 .op-proponer');
  cierto(prop && prop.h >= 43.5, 'el botón mide 44 px de alto con el dedo', prop && String(prop.h));
  await p.touchscreen.tap(prop.x, prop.y);
  await p.waitForTimeout(600);
  let e = await estado();
  cierto(e.n === 1 && e.ops === 2 && e.tarjetas === 2, 'tocar «Proponer» deja UNA partida con dos opciones y dos tarjetas', JSON.stringify(e));
  cierto(e.activa === 2 && e.foco === 'opced-1', 'la segunda queda abierta y el foco va a «Estás editando la opción B»', JSON.stringify(e));
  cierto(e.sub === TAR.pintado * 40 * 9, 'el total sigue siendo el de UNA opción', String(e.sub));
  cierto(await ev(() => document.getElementById('opced-1').textContent.includes('opción B')), 'el encabezado dice qué opción se edita');
  cierto(await ev(() => !!document.querySelector('#opc-1-1 .op-igual') === false && !!document.querySelector('#opc-1-2 .op-igual')),
    'la B, igual que la A, lo dice: «cámbiale el material o el tipo»');
  cierto(await ev(() => document.querySelector('#p-1 .psum').textContent.includes('Opción B de 2')), 'la cara plegada dice cuál está abierta');

  /* ============================== 2 · CADA OPCIÓN, SU CUENTA ============================== */
  console.log('\n  — cada opción, su cuenta —');
  await p.click('#p-1 .chip[data-peek-v="acr-vol"]');
  await p.waitForTimeout(400);
  let precios = await ev(() => [1, 2].map(k => document.getElementById('opp-1-' + k).textContent));
  cierto(numero(precios[0]) === TAR.pintado * 40 * 9, `A: aluminio pintado $${TAR.pintado} × 40 cm × 9 (${precios[0]})`);
  cierto(numero(precios[1]) === TAR.acr * 40 * 9, `B: acrílico + aluminio $${TAR.acr} × 40 cm × 9 (${precios[1]})`);
  cierto(await ev(() => document.getElementById('opt-1-2').textContent === 'Acrílico + Aluminio (Volumen)'), 'el título de la B sale del catálogo');
  cierto(await ev(() => document.querySelector('#opc-1-2 .op-sub').textContent.includes('LED fría frontal')), 'y la iluminación se lee del catálogo (acrílico: frontal)');
  cierto((await estado()).sub === TAR.acr * 40 * 9, 'el total es el de la abierta (B), no la suma');
  cierto(await ev(() => !document.querySelector('#opc-1-2 .op-igual')), 'ya no son iguales: se quita el aviso');

  /* la tercera, de otro tipo */
  await p.focus('#p-1 .op-mas');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  e = await estado();
  cierto(e.ops === 3 && e.tarjetas === 3 && e.activa === 3, 'con el teclado, «+ Otra opción» agrega la C y la abre', JSON.stringify(e));
  cierto(await ev(() => !document.querySelector('#p-1 .op-mas')), 'con tres ya no se ofrece otra');
  await tocar('#p-1 .tipo-seg button:nth-child(4)');
  await p.waitForTimeout(500);
  await p.click('#p-1 .chip[data-peek-v="' + TAR.caja + '"]');
  await p.fill('#an-1', '240');
  await p.fill('#al-1', '60');
  await p.dispatchEvent('#al-1', 'blur');
  await p.waitForTimeout(400);
  const caja = Math.round(2.4 * 0.6 * TAR.caja * 100) / 100;
  const txt3 = await ev(() => document.getElementById('opp-1-3').textContent);
  cierto(numero(txt3) === caja, `C: caja de 2.4 × 0.6 m × $${TAR.caja}/m² = ${caja} (${txt3})`);
  cierto(await ev(() => document.getElementById('opt-1-3').textContent.startsWith('Caja de luz')), 'el título de la C es una caja de luz');
  cierto((await estado()).sub === caja, 'el total sigue siendo UNA opción: la abierta (C)');
  await captura('2-tres', '#opciones-1');

  /* ============================== 3 · FALTA ELEGIR ============================== */
  console.log('\n  — falta elegir —');
  const falta = await ev(() => ({ f: faltantesDe(Q.items[0]), s: siguientePendiente(), pend: partidasSinTerminar().length,
    formula: document.getElementById('formula-1').textContent }));
  cierto(falta.f.includes('elegir la opción'), 'faltantesDe() lo dice', JSON.stringify(falta.f));
  cierto(/elegir la opción/.test(falta.s && falta.s.txt), 'el «qué sigue» lo nombra: ' + (falta.s && falta.s.txt));
  cierto(falta.pend === 1, 'cuenta como partida sin terminar');
  cierto(!/Falta/.test(falta.formula), 'la fórmula sigue siendo la cuenta de la abierta', falta.formula);
  await ev(() => { window.__go = 0; revisarAntesDe(() => { window.__go++; }, 'Seguir'); });
  await p.waitForTimeout(300);
  const aviso = await ev(() => ({ visible: document.getElementById('faltmodal').classList.contains('show'), go: window.__go,
    txt: document.getElementById('falt-list').textContent }));
  cierto(aviso.visible && aviso.go === 0 && /elegir la opción/.test(aviso.txt), 'mandar a autorizar se frena con el aviso de partidas sin terminar', JSON.stringify(aviso));
  await ev(() => cerrarFaltantes());
  await p.waitForTimeout(200);

  /* ============================== 4 · EL RESALTADO, EL RATÓN ============================== */
  console.log('\n  — el resaltado que sigue al cursor —');
  const c1 = await centro('#opc-1-1');
  await p.mouse.move(c1.x, c1.y);
  await p.waitForTimeout(350);
  const sobre1 = await ev(() => { const r = document.querySelector('#opciones-1 .resalte-mos'), c = document.getElementById('opc-1-1');
    return { ve: r.classList.contains('ve'), t: r.style.transform, esperado: `translate(${c.offsetLeft}px, ${c.offsetTop}px)`, w: r.style.width === c.offsetWidth + 'px' }; });
  cierto(sobre1.ve && sobre1.w && sobre1.t.replace(/\s/g, '') === sobre1.esperado.replace(/\s/g, ''), 'el cursor sobre la A pone el resaltado debajo de la A', JSON.stringify(sobre1));
  const c2 = await centro('#opc-1-2');
  await p.mouse.move(c2.x, c2.y);
  await p.waitForTimeout(350);
  cierto(await ev(() => { const r = document.querySelector('#opciones-1 .resalte-mos'), c = document.getElementById('opc-1-2');
    return r.style.transform.replace(/\s/g, '') === `translate(${c.offsetLeft}px,${c.offsetTop}px)`; }), 'y al pasar a la B se mueve a la B (un solo resaltado)');
  await p.mouse.move(2, 2);
  await p.waitForTimeout(300);
  cierto(await ev(() => !document.querySelector('#opciones-1 .resalte-mos').classList.contains('ve')), 'al salir de la rejilla se apaga');
  cierto(await ev(() => document.querySelectorAll('.resalte-mos').length === 1), 'hay un solo resaltado en la partida (el mismo de los mosaicos)');

  /* ============================== 5 · DELANTE DEL CLIENTE: DIFUMINADO ============================== */
  console.log('\n  — delante del cliente —');
  cierto(await ev(() => document.body.classList.contains('precios-ocultos')), 'en borrador los precios están ocultos');
  const filtro = await ev(() => [getComputedStyle(document.getElementById('opp-1-1')).filter, getComputedStyle(document.querySelector('#opc-1-1 .op-cuenta .dinero')).filter]);
  cierto(filtro.every(f => /blur/.test(f)), 'el importe y la cuenta de cada tarjeta se difuminan', filtro.join(' | '));
  const pp = await centro('#opp-1-1');
  await dedo.abajo(pp.x, pp.y);
  await p.waitForTimeout(250);
  cierto(await ev(() => document.body.classList.contains('precios-a-la-vista')), 'mantener el dedo sobre un importe lo destapa (el espiar de todos)');
  const filtro2 = await ev(() => getComputedStyle(document.getElementById('opp-1-1')).filter);
  cierto(filtro2 === 'none', 'y se ve nítido', filtro2);
  await dedo.arriba();
  await p.waitForTimeout(250);
  cierto(await ev(() => !document.body.classList.contains('precios-a-la-vista')), 'al soltar vuelve a taparse');

  /* ============================== 6 · EDITAR UNA OPCIÓN, CON EL TECLADO ============================== */
  console.log('\n  — abrir una opción —');
  await p.focus('#opc-1-1 .op-ed');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  e = await estado();
  cierto(e.activa === 1 && e.mat === 'al-paint' && e.sub === TAR.pintado * 40 * 9, 'Enter en «Editar» de la A la abre, y el total pasa a ser el de la A', JSON.stringify(e));
  cierto(e.foco === 'opced-1', 'el foco va a «Estás editando la opción A»', JSON.stringify(e));
  cierto(await ev(() => { const y = document.getElementById('opced-1').getBoundingClientRect().top; return y >= altoTopbarFija() - 2 && y < window.innerHeight * 0.6; }),
    'y el editor queda a la vista: no hay que buscarlo tres pantallas más abajo');
  cierto(await ev(() => !document.querySelector('#opc-1-1 .op-ed') && !!document.querySelector('#opc-1-1 .op-tag')), 'la abierta lleva su etiqueta y ya no ofrece «Editar»');
  cierto(await ev(() => Q.items[0].opciones.lista.find(x => x.k === 3).d.tipo === 'caja'), 'la C se guardó entera mientras estaba cerrada');
  await tocar('#opc-1-2 .op-ed');
  await p.waitForTimeout(500);
  cierto((await estado()).sub === TAR.acr * 40 * 9, 'con el dedo, «Editar» de la B abre la B');

  /* ============================== 7 · ELEGIR, CON EL TECLADO ============================== */
  console.log('\n  — elegir —');
  await captura('3-antes-de-elegir', '#opciones-1');
  await ev(() => { window.__vt = 0; });
  const huellaAntes = await ev(() => huellaTrabajo());
  await p.focus('#opc-1-3 .op-elegir');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(800);
  e = await estado();
  cierto(e.ops === 0 && e.tarjetas === 0 && e.n === 1, 'Enter en «Elegir esta» de la C: la propuesta desaparece y queda UNA partida', JSON.stringify(e));
  cierto(e.tipo === 'caja' && e.sub === caja, 'la partida es la caja de luz elegida y el total, el de la caja', JSON.stringify(e));
  cierto(await ev(() => { const i = Q.items[0]; return i.ancho === 240 && i.alto === 60 && i.tarifa === 3900; }), 'con sus medidas y su tarifa');
  cierto(await ev(() => !JSON.stringify(Q).includes('opciones') && !localStorage.getItem('al3d_q').includes('"opciones"')), 'ni en Q ni en lo guardado queda rastro de las otras');
  cierto(await ev(() => !huellaTrabajo().includes('opciones')) && (await ev(() => huellaTrabajo())) !== huellaAntes, 'la huella del trabajo es la de la caja');
  cierto(await ev(() => !faltantesDe(Q.items[0]).length), 'ya no falta nada');
  cierto(await ev(() => !document.querySelector('.opciones, .op-card')), 'las tarjetas se fueron');
  const nVT = await vts();
  cierto(red ? nVT === 0 : nVT === 1, red ? 'con menos movimiento no hay transición de vista' : 'con movimiento hay UNA transición de vista (la tarjeta viaja al total)', String(nVT));
  cierto(await ev(() => document.activeElement && document.activeElement.classList.contains('pfold')), 'el foco queda en la partida');
  cierto(await ev(() => document.getElementById('p-1').getBoundingClientRect().top >= altoTopbarFija() - 12), 'y el encabezado de la partida, con su total, queda a la vista');
  const deshacer = await ev(() => [...document.querySelectorAll('button')].some(b => /^Deshacer/.test(b.textContent.trim()) && b.offsetParent !== null));
  cierto(deshacer, 'el aviso trae «Deshacer»');
  await sinBucles('tras elegir');

  console.log('\n  — deshacer lo elegido —');
  const bd = await centro('.toast button, [data-pila="toast"] button, .aviso button');
  if (bd) await p.touchscreen.tap(bd.x, bd.y);
  else await ev(() => deshacerOpciones());
  await p.waitForTimeout(700);
  e = await estado();
  cierto(e.ops === 3 && e.tarjetas === 3 && e.activa === 2, '«Deshacer» devuelve las tres opciones y la que estaba abierta', JSON.stringify(e));
  cierto(e.sub === TAR.acr * 40 * 9, 'y el total de la B', String(e.sub));

  console.log('\n  — elegir con el dedo —');
  await ev(() => { window.__vt = 0; });
  const el = await centro('#opc-1-1 .op-elegir');
  cierto(el && el.h >= 43.5, '«Elegir esta» mide 44 px de alto con el dedo', el && String(el.h));
  await p.touchscreen.tap(el.x, el.y);
  await p.waitForTimeout(800);
  e = await estado();
  cierto(e.ops === 0 && e.tipo === 'letras' && e.mat === 'al-paint' && e.sub === TAR.pintado * 40 * 9, 'tocar «Elegir esta» de la A deja la A como la partida', JSON.stringify(e));
  console.log('\n  — el deshacer de siempre —');
  await ev(() => deshacer());
  await p.waitForTimeout(600);
  e = await estado();
  cierto(e.ops === 3, 'el deshacer general (Ctrl+Z) también devuelve la propuesta', JSON.stringify(e));

  /* ============================== 8 · UNA OPCIÓN A MEDIAS NO SE ELIGE ============================== */
  console.log('\n  — una opción a medias —');
  await armar([L(1)]);
  await tocar('#p-1 .op-proponer');
  await p.waitForTimeout(500);
  await ev(() => setItem(1, 'material', ''));
  await p.waitForTimeout(400);
  cierto(await ev(() => document.querySelector('#opc-1-2 .op-elegir').getAttribute('aria-disabled') === 'true'), 'la B sin material trae «Elegir esta» deshabilitado (aria-disabled)');
  cierto(await ev(() => document.getElementById('opp-1-2').textContent.trim() === '—'), 'y su importe es «—», no un $0.00 que parezca un precio');
  await p.focus('#opc-1-2 .op-elegir');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  e = await estado();
  cierto(e.ops === 2 && e.tarjetas === 2, 'tocarlo no elige nada: la propuesta sigue', JSON.stringify(e));
  cierto(await ev(() => /no está completa/.test(document.body.textContent)), 'y el aviso dice que la opción no está completa');
  await p.click('#p-1 .chip[data-peek-v="acr-vol"]');
  await p.waitForTimeout(400);
  cierto(await ev(() => document.querySelector('#opc-1-2 .op-elegir').getAttribute('aria-disabled') === null), 'al completarla, la tarjeta lo sigue sin repintar todo y «Elegir» se habilita');

  /* ============================== 9 · QUITAR ============================== */
  console.log('\n  — quitar —');
  await armar([L(1)]);
  await tocar('#p-1 .op-proponer'); await p.waitForTimeout(400);
  await ev(() => setItem(1, 'material', 'acr-vol')); await p.waitForTimeout(300);
  await tocar('#p-1 .op-mas'); await p.waitForTimeout(400);
  await ev(() => setItem(1, 'material', 'acero')); await p.waitForTimeout(300);
  e = await estado();
  cierto(e.ops === 3, 'tres opciones para quitar', JSON.stringify(e));
  const x3 = await centro('#opc-1-3 .op-quita');
  cierto(x3 && x3.w >= 43.5 && x3.h >= 43.5, '«×» de la tarjeta mide 44 × 44 con el dedo', x3 && `${x3.w}×${x3.h}`);
  await p.touchscreen.tap(x3.x, x3.y);
  await p.waitForTimeout(600);
  e = await estado();
  cierto(e.ops === 2 && e.activa === 2, 'quitar la C (abierta) deja dos y abre la B', JSON.stringify(e));
  cierto(await ev(() => [...document.querySelectorAll('.op-etq')].map(x => x.textContent).join() === 'Opción A,Opción B'), 'las letras siguen la posición');
  await ev(() => deshacerOpciones());
  await p.waitForTimeout(500);
  e = await estado();
  cierto(e.ops === 3, '«Deshacer» devuelve la que se quitó', JSON.stringify(e));
  await p.click('#opc-1-3 .op-quita'); await p.waitForTimeout(500);
  await p.click('#opc-1-2 .op-quita'); await p.waitForTimeout(600);
  e = await estado();
  cierto(e.ops === 0 && e.tarjetas === 0 && e.n === 1, 'con una sola opción ya no hay propuesta: vuelve a ser una partida', JSON.stringify(e));
  cierto(await ev(() => !!document.querySelector('#p-1 .op-proponer')), 'y vuelve a ofrecer «Proponer otra opción»');

  console.log('\n  — un aviso viejo no toca otra cotización —');
  await armar([L(1)]);
  await tocar('#p-1 .op-proponer'); await p.waitForTimeout(400);
  await ev(() => setItem(1, 'material', 'acr-vol')); await p.waitForTimeout(300);
  await p.focus('#opc-1-2 .op-elegir');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  await ev(() => { const f = Q.folio; Q.folio = 'COT-OTRA'; deshacerOpciones(); Q.folio = f; });
  await p.waitForTimeout(300);
  e = await estado();
  cierto(e.ops === 0 && e.mat === 'acr-vol', 'si la cotización ya es otra, «Deshacer» no le pone la partida de la anterior', JSON.stringify(e));

  /* ============================== 10 · CON EL CANDADO PUESTO ============================== */
  console.log('\n  — con el candado puesto —');
  await armar([L(1), L(2, { desc: 'Otra' })]);
  await tocar('#p-1 .op-proponer'); await p.waitForTimeout(400);
  await ev(() => setItem(1, 'material', 'acr-vol')); await p.waitForTimeout(300);
  await ev(() => { Q.estado = 'pendiente'; renderItems(); });
  await p.waitForTimeout(400);
  e = await estado();
  const cand = await ev(() => ({ acc: document.querySelectorAll('.op-acc').length, mas: document.querySelectorAll('.op-mas').length,
    prop: document.querySelectorAll('.op-proponer').length, tarjetas: document.querySelectorAll('.op-card').length }));
  cierto(cand.tarjetas === 2 && cand.acc === 0 && cand.mas === 0 && cand.prop === 0, 'las tarjetas se leen y no hay botones para cambiarlas', JSON.stringify(cand));
  await ev(() => { proponerOpciones(2); elegirOpcion(1, 1); abrirOpcion(1, 1); quitarOpcion(1, 1); agregarOpcion(1); });
  e = await estado();
  cierto(e.ops === 2 && e.activa === 2 && !(await ev(() => Q.items[1].opciones)), 'y las funciones se niegan solas', JSON.stringify(e));
  await ev(() => { Q.estado = 'borrador'; renderItems(); });
  await p.waitForTimeout(300);

  /* ============================== 11 · LA CARA PLEGADA ============================== */
  console.log('\n  — plegada —');
  await ev(() => { _plegadas.add(1); renderItems(); });
  await p.waitForTimeout(400);
  const plegada = await ev(() => document.querySelector('#p-1 .psum').textContent);
  cierto(/Opción B de 2/.test(plegada) && /por elegir/.test(plegada), 'plegada, la partida dice «Opción B de 2 · por elegir»', plegada);
  cierto(!/Falta 1 dato/.test(plegada), 'sin contarlo como un dato que falte capturar', plegada);
  await ev(() => { _plegadas.clear(); renderItems(); });

  /* ============================== 12 · EL PDF ============================== */
  console.log('\n  — el PDF —');
  const hoja = await ctx.newPage();
  const generar = async (casoFn, extra) => {
    const doc = await ev(async ({ extra }) => {
      let blob = null;
      const crear = URL.createObjectURL;
      URL.createObjectURL = b => { blob = b; return 'blob:medido'; };
      window.open = () => null; window.mostrarEnlacePDF = () => {};
      Q.cliente = 'Juan Carlos Ramírez'; Q.proy = 'Centro Dental'; Q.dirRaw = 'Av. Vallarta 1234, Col. Americana, Guadalajara, Jal.';
      Q.fecha = '21 ago 2026'; Q.folio = 'COT-0042'; Q.iva = true; Q.tel = ''; Q.entrecalles = ''; Q.anti = 0; Q.aiFile = null;
      Q.notaCliente = 'El cliente debe dejar salidas eléctricas.';
      Q.estado = 'borrador'; Q.itemsAuth = {}; Q.precioAuth = 0; Q.huellaAuth = ''; Q.entrega = extra.entrega || '';
      const letras = (id, desc, mat) => ({ id, tipo: 'letras', material: mat, comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 9, desc, showInPdf: true });
      const conOps = (id, desc) => { const it = letras(id, desc, 'al-paint'); _opProponer(it); it.material = 'acr-vol'; _opAgregar(it); Object.assign(it, { tipo: 'caja', tarifa: 3900, ancho: 240, alto: 60 }); return it; };
      Q.items = [letras(1, 'Letrero normal', 'acero')];
      for (let i = 0; i < extra.partidasConOpciones; i++) Q.items.push(conOps(i + 2, 'Anuncio ' + (i + 1) + ' con opciones'));
      if (extra.larga) { Q.items[1].desc = 'Letrero de fachada con la razón social completa de la farmacia y su leyenda de servicio veinticuatro horas'; }
      /* El peor caso de la tarjeta: cada opción con su propia descripción larga, así que ninguna se
         esconde por repetida y las tres la imprimen entera. */
      if (extra.peor) Q.items.slice(1).forEach(it => it.opciones.lista.forEach((o, i) => {
        o.d.desc = 'Opción ' + (i + 1) + ': letrero de fachada con la razón social completa de la farmacia, su leyenda de servicio veinticuatro horas y el logotipo de la cadena a la derecha del texto principal';
      }));
      generarPDF();
      URL.createObjectURL = crear;
      return { doc: blob ? await blob.text() : null, sub: totals().sub, n: Q.items.length, wa: mensajeWhatsApp() };
    }, { extra });
    return doc;
  };
  const medir = async (res, esperadas, nombre) => {
    cierto(!!res.doc, `${nombre}: se generó el documento`);
    await hoja.setViewportSize({ width: ANCHO_CARTA, height: ALTO_CARTA });
    await hoja.setContent(res.doc.replace(/<scr'\+'ipt>[\s\S]*?<\/scr'\+'ipt>/g, ''));
    await hoja.emulateMedia({ media: 'print' });
    await hoja.waitForTimeout(350);
    const m = await hoja.evaluate(() => ({
      hojas: [...document.querySelectorAll('.pg')].map(h => Math.round(h.getBoundingClientRect().height)),
      titulos: [...document.querySelectorAll('.pg .mh-t')].map(t => t.textContent.trim()),
      cortadas: [...document.querySelectorAll('.opc-c')].filter(c => c.scrollHeight > c.clientHeight + 1).length,
      tarjetas: document.querySelectorAll('.opc-c').length,
      enTotal: document.querySelectorAll('.opc-en').length,
      bloques: document.querySelectorAll('.opc-b').length,
      pies: [...document.querySelectorAll('.pie-h')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
      desborde: [...document.querySelectorAll('.pg')].some(h => h.scrollWidth > h.clientWidth + 1),
    }));
    cierto(m.hojas.every(h => h <= ALTO_CARTA + 1), `${nombre}: ninguna hoja pasa de una carta`, m.hojas.join(','));
    const declaradas = (res.doc.match(/Hoja \d+ de (\d+)/) || [])[1];
    cierto(String(m.hojas.length) === declaradas, `${nombre}: el pie dice «de ${declaradas}» y salieron ${m.hojas.length}`);
    const pdf = await hoja.pdf({ preferCSSPageSize: true, printBackground: true });
    const fisicas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    cierto(fisicas === m.hojas.length, `${nombre}: la impresora saca ${fisicas} hojas físicas y el documento tiene ${m.hojas.length}`);
    cierto(m.titulos.filter(t => /Opciones propuestas/i.test(t)).length === esperadas.hojas, `${nombre}: ${esperadas.hojas} hoja(s) de opciones`, m.titulos.join(' | '));
    cierto(m.bloques === esperadas.bloques && m.tarjetas === esperadas.tarjetas, `${nombre}: ${esperadas.bloques} partida(s) con ${esperadas.tarjetas} tarjetas`, JSON.stringify(m));
    cierto(m.enTotal === esperadas.bloques, `${nombre}: una sola tarjeta por partida va marcada «Incluida en el total»`, String(m.enTotal));
    cierto(m.cortadas === 0, `${nombre}: ninguna tarjeta corta su texto`, String(m.cortadas));
    cierto(!m.desborde, `${nombre}: nada se sale de la hoja`);
    const filas = [...res.doc.matchAll(/class="r num tot">([^<]+)</g)].map(x => numero(x[1]));
    const suma = Math.round(filas.reduce((s, v) => s + v, 0) * 100) / 100;
    cierto(Math.abs(suma - res.sub) < 0.005, `${nombre}: la tabla suma el subtotal (${suma}) y no cuenta las demás opciones`, `${suma} vs ${res.sub}`);
    cierto(filas.length === res.n, `${nombre}: un renglón por partida (${filas.length})`);
    return m;
  };
  let r = await generar(null, { partidasConOpciones: 2 });
  let m = await medir(r, { hojas: 1, bloques: 2, tarjetas: 6 }, 'dos partidas con opciones');
  cierto(r.doc.includes('Opción C de 3: ver la hoja de opciones.') && !r.doc.includes('Ojo: el cliente aún no elige'), 'la fila de la cotización remite a la hoja, y no al taller');
  cierto(/Incluida en el total/.test(r.doc), 'la tarjeta que cuenta lleva su marca');
  cierto(r.wa.includes('Opciones propuestas'), 'el mensaje de WhatsApp avisa de la hoja');
  r = await generar(null, { partidasConOpciones: 3, larga: true });
  m = await medir(r, { hojas: 2, bloques: 3, tarjetas: 9 }, 'tres partidas con opciones (se parte en dos hojas)');
  r = await generar(null, { partidasConOpciones: 5 });
  m = await medir(r, { hojas: 3, bloques: 5, tarjetas: 15 }, 'cinco partidas con opciones');
  r = await generar(null, { partidasConOpciones: 2, peor: true });
  m = await medir(r, { hojas: 1, bloques: 2, tarjetas: 6 }, 'peor caso (cada opción con su descripción larga)');
  r = await generar(null, { partidasConOpciones: 1, entrega: 'JUEVES 27 DE AGOSTO' });
  m = await medir(r, { hojas: 1, bloques: 1, tarjetas: 3 }, 'con orden de trabajo');
  cierto(r.doc.includes('Ojo: el cliente aún no elige entre 3 opciones.'), 'la orden de trabajo avisa que falta elegir: no se fabrica a ciegas');
  /* ya elegida: la hoja desaparece y el documento es el de siempre */
  r = await ev(async () => {
    Q.items.forEach(it => { if (opcionesDe(it)) _opElegir(it, it.opciones.lista[0].k); });
    let blob = null; const crear = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return 'blob:medido'; };
    generarPDF(); URL.createObjectURL = crear;
    return { doc: await blob.text(), sub: totals().sub, n: Q.items.length, wa: mensajeWhatsApp() };
  });
  cierto(!/mh-t">Opciones propuestas|class="opc-c|Ojo: el cliente aún no elige/.test(r.doc), 'ya elegidas, el PDF no lleva hoja de opciones ni avisos');
  cierto(!r.wa.includes('Opciones propuestas'), 'ni el mensaje de WhatsApp');
  await hoja.close();

  /* ============================== 13 · LO DE SIEMPRE ============================== */
  console.log('\n  — la ronda entera —');
  await armar([L(1), L(2, { desc: 'Otra' })]);
  await tocar('#p-1 .op-proponer'); await p.waitForTimeout(500);
  await ev(() => setItem(1, 'material', 'acr-vol')); await p.waitForTimeout(300);
  await tocar('#p-1 .op-mas'); await p.waitForTimeout(500);
  await ev(() => { Object.assign(Q.items[0], { tipo: 'caja', tarifa: 3900, ancho: 240, alto: 60 }); renderItems(); });
  await p.waitForTimeout(500);
  await ev(() => { Piezas.aviso.limpiar(); });
  await captura('4-tres-opciones', '#opciones-1');
  await contraste('#opciones-1 .op-t', 'el título de la opción');
  await contraste('#opciones-1 .op-sub', 'su subtítulo');
  await contraste('#opciones-1 .op-etq', 'la etiqueta «Opción A»');
  await contraste('#opciones-1 .op-tag', 'la etiqueta «Abierta»');
  await contraste('#opciones-1 .op-nota', 'la nota de la rejilla');
  await contraste('#opciones-1 .op-edita', 'el encabezado «Estás editando»');
  await contraste('#opc-1-1 .op-ed', 'el botón «Editar»');
  await contraste('#opc-1-1 .op-quita', 'el «×» de quitar');
  await ev(() => { document.querySelector('#opc-1-1 .op-cuerpo').insertAdjacentHTML('beforeend', '<p class="op-igual" id="x-igual">Igual que la opción B: cámbiale el material o el tipo.</p>'); });
  await contraste('#x-igual', 'el aviso de «igual que»');
  await ev(() => document.getElementById('x-igual').remove());
  await sinBucles('en la pantalla de opciones');
  await sinDesborde('en toda la pantalla de partidas');
  await sinDesborde('dentro de la propuesta', '#opciones-1');
  await ctx.close();
  return errs;
}

for (const [i, R] of RONDAS.entries()) {
  if (SOLO.length && !SOLO.includes(i + 1)) continue;
  const errs = await ronda(R, i);
  cierto(!errs.length, 'cero errores de página en la ronda', errs.slice(0, 3).join(' | '));
}
await nav.close();
if (fallos) { console.log(`\n${fallos} comprobaciones fallaron.`); process.exit(1); }
console.log('\nLa propuesta con opciones se arma, se compara, se elige y se imprime, con dedo, ratón y teclado.');
