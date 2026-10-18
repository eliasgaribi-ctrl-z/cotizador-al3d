/* EL TABLERO DESPEJADO, «QUÉ ATENDER» Y LAS FECHAS RÁPIDAS.
 *
 * El Tablero es lo primero que se abre en la mañana, con el teléfono en una mano. En octubre de
 * 2026 el taller pidió despejarlo («que no dé más información de la que se necesita»): con nueve
 * proyectos medía 8.2 pantallas, con 83 botones. Quedaron cuatro bloques —el resumen, «Necesita tu
 * decisión», el taller por estación y la próxima instalación— y lo demás se fue a la ficha de cada
 * proyecto o a «Más». Lo que defiende este archivo:
 *
 *   · DECIDIR · un renglón por asunto y solo si lo hay; cada uno lleva a donde se atiende —con un
 *           solo trabajo, a ESE trabajo—, dice a dónde para quien no lo ve y mide 44 px. Para los
 *           otros roles se llama «Pendientes», sin cotizaciones y sin dinero. Vacío: «Nada urgente».
 *   · TALLER · las cinco estaciones siempre, en el orden del proceso, una ficha por trabajo; el
 *           color de estado lleva su palabra y la leyenda lo dice; la ficha abre el proyecto.
 *   · PROX  · la próxima instalación, la puerta al Calendario y la ÚNICA puerta a «Qué atender»; y
 *           que lo que salió (cuentas, tubería, segmento, renglones deslizables, barra) no vuelva.
 *   · MESA  · «Acomodar en la lámina» desde la ficha abre la mesa en el Tablero, con la salida de
 *           vuelta a ese proyecto; y al volver al Tablero se ve el Tablero.
 *   · P13   · en «Qué atender» lo atendido se palomea, se tacha y se pliega en su sitio ANTES de
 *           repintar; si la acción falla no se tacha; con menos movimiento no hay pliegue;
 *   · P14   · fechas rápidas al ganar y al agendar: radios nativos que escriben en el campo, con
 *           teclado y 44 px; «Sin fecha» solo donde la fecha es opcional;
 *   y en todas las medidas: 360 y 420 px, claro y oscuro, con y sin movimiento reducido, sin
 *   errores de página, sin desborde horizontal, con contraste de 4.5:1 en lo nuevo —el Tablero y la
 *   ficha para el taller— y sin nada animándose en bucle en reposo.
 *
 * Uso:  PUERTO=8935 node pruebas/navegador/pf-tablero.mjs
 *       SOLO=decidir,taller PUERTO=8935 node pruebas/navegador/pf-tablero.mjs   (solo esas secciones)
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const que = (ok, msg, alRevés) => (ok ? bien(msg) : mal(alRevés || msg));
const esp = (p, ms) => p.waitForTimeout(ms);
const SOLO = (process.env.SOLO || '').split(',').map(x => x.trim()).filter(Boolean);
const activa = id => !SOLO.length || SOLO.includes(id);
const titulo = (id, t) => { if (activa(id)) console.log('\n' + t); };

/* Dirección con nombre: es el rol que ve el dinero y puede ganar, agendar e instalar. */
async function abrir({ ancho = 360, alto = 780, tema = 'claro', rm = false, rol = 'direccion', touch = false } = {}) {
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block',
    deviceScaleFactor: 2,
    ...(touch ? { hasTouch: true } : {}),
    ...(rm ? { reducedMotion: 'reduce' } : {}),
  });
  await ctx.addInitScript(([r, t]) => {
    try {
      localStorage.setItem('al3d_pf_rol', sessionStorage.getItem('__pf_rol') || r);
      localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
      localStorage.setItem('al3d_tema', t);
    } catch (_) {}
  }, [rol, tema]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  return { ctx, p, errs };
}

const irA = async (p, hash, espera = 1300) => {
  const destino = B + '/' + hash;
  if (p.url() === destino) await p.reload({ waitUntil: 'load' });
  else await p.goto(destino, { waitUntil: 'load' });
  await esp(p, espera);
};

/* El taller de la prueba, sembrado por la CAPA DE DATOS (`ganar()` es lo que de verdad crea un
   proyecto, con su material derivado). Cada uno cuenta una cosa distinta:
     tarde    en diseño con la instalación a 4 días: «Va tarde»
     vencido  ganado con la instalación hace 3 días: «No llega» (y A10: «sigue sin marcarse»)
     armar    cortado, a tiempo: su botón es «Ya se armar», con mecha
     armar2   cortado, a tiempo: para dos mechas a la vez
     listo    armado, a tiempo: «Ya está listo», con mecha
     instalar listo, a tiempo: «Ya se instaló», que NO se ofrece a deshacer
     sinfecha ganado sin fecha: «Ganado sin fecha», y la cuenta que abre el Calendario */
async function sembrar(p) {
  return p.evaluate(async () => {
    const Proy = await import('./js/datos/proyectos.js');
    const Agenda = await import('./js/datos/agenda.js');
    const { masDias, hoyISO } = await import('./js/nucleo/fechas.js');
    const hoy = hoyISO();
    const letras = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8 };
    const filas = [
      ['tarde', 'COT-9101', 'Healthylicious', 'en_diseno', 4],
      ['vencido', 'COT-9102', 'Parentesis', 'ganado', -3],
      ['armar', 'COT-9103', 'La Perla', 'cortado', 25],
      ['armar2', 'COT-9104', 'Gym Titanio', 'cortado', 27],
      ['listo', 'COT-9105', 'Farmacia Guadalupe', 'armado', 22],
      ['instalar', 'COT-9106', 'Dental Sonrisa', 'listo', 20],
      ['sinfecha', 'COT-9107', 'Café Barrio', 'ganado', null],
    ];
    const out = {};
    for (const [clave, folio, cliente, etapa, dias] of filas) {
      const r = await Proy.ganar({ folio, cliente, proy: cliente + ' — anuncio', ts: Date.now(), estado: 'autorizada',
        items: [letras], neto: 40000, itemsAuth: { 1: 40000 } }, {});
      if (!r.ok) continue;
      const id = r.valor.id;
      if (etapa !== 'ganado') await Proy.avanzarEtapa(id, etapa);
      if (dias !== null) await Agenda.agendar(id, { fecha: masDias(hoy, dias) });
      out[clave] = { id, cliente, folio };
    }
    return out;
  });
}

/* Cotizaciones autorizadas que llevan días sin decidir: las que pinta la tarjeta que late. */
const sinDecidir = (p, n) => p.evaluate(k => {
  const fila = i => ({ folio: 'COT-71' + String(i).padStart(2, '0'), cliente: 'Cliente pendiente ' + i, proy: 'Letrero',
    ts: Date.now() - 9 * 86400000, estado: 'autorizada', neto: 5000 + i, itemsAuth: { 1: 5000 + i },
    items: [{ id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8 }] });
  localStorage.setItem('al3d_historial', JSON.stringify(Array.from({ length: k }, (_, i) => fila(i + 1))));
}, n);

const remontar = async p => {
  await p.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'al3d_historial' })));
  await esp(p, 1500);
};

/* Entrar al Tablero con datos. */
async function entrar(o = {}) {
  const c = await abrir(o);
  await irA(c.p, '#/hoy', 900);
  c.h = await sembrar(c.p);
  if (o.decidir) await sinDecidir(c.p, o.decidir);
  await irA(c.p, '#/hoy', 1500);
  return c;
}

const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => { try { return a.effect.getComputedTiming().iterations === Infinity; } catch (_) { return false; } })
  .map(a => { const t = a.effect && a.effect.target; return (t && (t.id || t.className)) || a.animationName || '?'; }));
const desborde = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const etapaDe = (p, id) => p.evaluate(async i => (await (await import('./js/datos/db.js')).obtener('proyectos', i) || {}).etapa, id);
const esperarEtapa = async (p, id, etapa, ms = 9000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await etapaDe(p, id)) === etapa) return true; await esp(p, 150); }
  return false;
};
const caja = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; });

/* Contraste de un elemento de texto: su color contra el fondo opaco de quien lo contiene (se
   compone hacia arriba cualquier fondo con transparencia). Solo vale para fondos lisos, que es lo
   que lleva todo lo nuevo; los degradados los mide pruebas/navegador/contraste.mjs sobre el render. */
const contraste = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s); if (!el) return null;
  const num = c => (c.match(/[\d.]+/g) || []).map(Number);
  const mezcla = (arriba, abajo) => { const a = arriba[3] == null ? 1 : arriba[3]; return [0, 1, 2].map(i => arriba[i] * a + abajo[i] * (1 - a)); };
  let fondo = [255, 255, 255];
  const cadena = []; for (let e = el; e; e = e.parentElement) cadena.push(e);
  for (const e of cadena.reverse()) { const b = num(getComputedStyle(e).backgroundColor); if (b.length && (b[3] == null || b[3] > 0)) fondo = mezcla(b, fondo); }
  const t = num(getComputedStyle(el).color), tinta = mezcla(t, fondo);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const a = L(tinta), b = L(fondo);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}, sel);

/* Las esquinas de la pieza 17 esperan a que el scroll termine antes de volar: «aparecen» puede
   tardar casi un segundo con un destino lejano, y se van solas ~1 s después. Se espera con tope. */
/* Los nodos de la pieza se REUSAN (quedan en el documento, escondidos): lo que dice que las esquinas
   se ven es su clase `.ve`, no que el nodo exista. */
const aparece = p => p.waitForSelector('.mira.ve', { state: 'attached', timeout: 3500 }).then(() => true, () => false);
const seApaga = p => p.waitForFunction(() => !document.querySelector('.mira.ve'), null, { timeout: 4500 }).then(() => true, () => false);

/* Traer un elemento al centro de la pantalla, aguantando que la pantalla se repinte mientras tanto
   (una escritura que acaba de terminar rehace el DOM): el localizador se vuelve a resolver. */
const traer = async loc => {
  for (let i = 0; i < 5; i++) {
    try { await loc.evaluate(e => e.scrollIntoView({ block: 'center' }), null, { timeout: 2500 }); return; }
    catch (_) { await esp(loc.page(), 300); }
  }
};

const hoyDe = p => p.evaluate(async () => (await import('./js/nucleo/fechas.js')).hoyISO());
const masDiasDe = (p, iso, n) => p.evaluate(async ([i, k]) => (await import('./js/nucleo/fechas.js')).masDias(i, k), [iso, n]);

const tituloFicha = p => p.evaluate(() => (document.querySelector('#pf-ficha .pf-panel-h h2') || {}).textContent || '');

/* ══ 1 · EL RESUMEN Y «NECESITA TU DECISIÓN» ════════════════════════════════ */
titulo('decidir', 'EL RESUMEN Y «NECESITA TU DECISIÓN»: UN RENGLÓN POR ASUNTO, Y CADA UNO LLEVA A DONDE SE ATIENDE');
if (activa('decidir')) {
  const c = await entrar({ touch: true, decidir: 3 });
  const { p, errs } = c;
  const res = await p.evaluate(() => ({
    fecha: document.querySelector('#mod-tablero .tb-res-fecha').textContent,
    total: document.querySelector('#mod-tablero .tb-res-total').textContent.replace(/\s+/g, ' ').trim() }));
  que(/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo) \d{1,2} de [a-z]+$/.test(res.fecha), 'arriba, la fecha con todas sus letras: «' + res.fecha + '»');
  que(/^7 trabajos en el taller · \$[\d,]+\.\d\d$/.test(res.total), 'y cuántos trabajos hay en el taller y cuánto valen: «' + res.total + '»');
  const f = await p.$$eval('#mod-tablero .tb-nec', es => es.map(e => ({
    t: e.querySelector('.tb-nec-t').textContent, n: e.querySelector('.tb-nec-n').textContent,
    d: (e.querySelector('.tb-nec-d') || {}).textContent || '', boton: e.tagName === 'BUTTON',
    voz: e.textContent.replace(/\s+/g, ' '), alto: e.getBoundingClientRect().height })));
  que((await p.$eval('#tb-nec-t', e => e.textContent)) === 'Necesita tu decisión', 'Dirección lee «Necesita tu decisión»');
  que(f[0] && f[0].t === 'Cotizaciones por decidir' && f[0].n === '3', 'la primera: las 3 cotizaciones por decidir (' + JSON.stringify(f[0] && { t: f[0].t, n: f[0].n }) + ')');
  const nl = f.find(x => /^No llega/.test(x.t));
  que(nl && nl.n === '1' && /Parentesis/.test(nl.d), 'la que no llega a su fecha, con su nombre: «' + (nl && nl.d) + '»');
  que(!f.some(x => /pasada sin marcar/.test(x.t)), 'la instalación vencida de Parentesis no se dice dos veces: ya va en «No llega a su fecha»');
  const sf = f.find(x => /sin fecha/.test(x.t));
  que(sf && sf.n === '1' && /Café Barrio/.test(sf.d), 'el ganado sin fecha de instalación: «' + (sf && sf.d) + '»');
  const fd = f.find(x => /Faltan datos/.test(x.t));
  que(fd && Number(fd.n) >= 1, 'los que se entregan pronto sin teléfono ni dirección (' + (fd && fd.n + ' · ' + fd.d) + ')');
  que(f.every(x => x.boton), 'cada renglón es un botón');
  que(f.every(x => /, \S/.test(x.voz)), 'y dice a dónde lleva para quien no lo ve (' + (f[0] && f[0].voz.split(', ').pop()) + ')');
  que(f.every(x => x.alto >= 44), 'todos miden 44 px o más (' + Math.min(...f.map(x => x.alto)).toFixed(0) + ')');

  await p.locator('#mod-tablero .tb-nec', { hasText: 'Cotizaciones por decidir' }).tap(); await esp(p, 1300);
  que(p.url().endsWith('#/proyectos'), '«Cotizaciones por decidir» abre Proyectos, donde se deciden');
  await irA(p, '#/hoy', 1500);
  await p.locator('#mod-tablero .tb-nec', { hasText: 'No llega a su fecha' }).tap(); await esp(p, 1500);
  que(/Parentesis/.test(await tituloFicha(p)), 'con un solo trabajo, «No llega a su fecha» abre SU ficha');
  await irA(p, '#/hoy', 1500);
  await p.locator('#mod-tablero .tb-nec', { hasText: 'sin fecha' }).tap(); await esp(p, 1500);
  que(p.url().endsWith('#/agenda'), '«Ganado sin fecha» lleva al Calendario a ponerle día');
  await irA(p, '#/hoy', 1500);
  await p.locator('#mod-tablero .tb-nec', { hasText: 'Faltan datos' }).tap(); await esp(p, 900);
  que(await p.evaluate(() => { const c = document.getElementById('pf-pide'); return !!c && /Completar los datos/.test(c.textContent); }),
    '«Faltan datos para entregar» abre ahí mismo el panel de completar');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Fabricación: «Pendientes», sin las cotizaciones (no las decide) y sin un peso. */
  const fab = await entrar({ touch: true, decidir: 3, rol: 'fabricacion' });
  que((await fab.p.$eval('#tb-nec-t', e => e.textContent)) === 'Pendientes', 'Fabricación lee «Pendientes»');
  que(!(await fab.p.$$eval('#mod-tablero .tb-nec-t', es => es.map(e => e.textContent))).some(t => /Cotizaci/.test(t)), 'sin las cotizaciones por decidir: no son suyas');
  que(!(await fab.p.$('#mod-tablero .tb-res-dinero')) && !/\$/.test(await fab.p.$eval('#mod-tablero .tb-res-total', e => e.textContent)), 'y sin dinero en el resumen');
  await fab.ctx.close();

  /* Sin nada pendiente lo dice, en una línea. */
  const vac = await abrir({ touch: true });
  await irA(vac.p, '#/hoy', 1500);
  que(/Nada urgente hoy/.test(await vac.p.$eval('#mod-tablero .tb-nada', e => e.textContent).catch(() => '')), 'sin pendientes: «Nada urgente hoy»');
  que(/Todavía no hay nada en el taller/.test(await vac.p.$eval('#mod-tablero .tb-taller', e => e.textContent).catch(() => '')), 'y el taller vacío lo dice, con su puerta al Cotizador');
  await vac.ctx.close();
}

/* ══ 2 · EL TALLER ═══════════════════════════════════════════════════════════ */
titulo('taller', 'EL TALLER: LAS CINCO ESTACIONES, UNA FICHA POR TRABAJO, Y LA FICHA ABRE EL PROYECTO');
if (activa('taller')) {
  const c = await entrar({ touch: true });
  const { p, errs } = c;
  const est = await p.$$eval('#mod-tablero .tb-est', es => es.map(e => ({
    etapa: e.dataset.etapa, n: e.querySelector('.tb-est-h b').textContent,
    fichas: [...e.querySelectorAll('.tb-ficha')].map(f => ({ t: f.textContent, mal: f.classList.contains('mal'), av: f.classList.contains('av'), alto: f.getBoundingClientRect().height })) })));
  que(est.map(e => e.etapa).join() === 'ganado,en_diseno,cortado,armado,listo', 'las cinco estaciones, en el orden del proceso (' + est.map(e => e.etapa).join(' → ') + ')');
  const de = k => est.find(e => e.etapa === k) || { n: '?', fichas: [] };
  que([de('ganado').n, de('en_diseno').n, de('cortado').n, de('armado').n, de('listo').n].join(' · ') === '2 · 1 · 2 · 1 · 1', 'cada una con su cuenta: 2 · 1 · 2 · 1 · 1');
  que(est.every(e => Number(e.n) === e.fichas.length), 'y una ficha por trabajo');
  const todas = est.flatMap(e => e.fichas);
  const ficha = nombre => todas.find(x => x.t.includes(nombre));
  const pa = ficha('Parentesis'), he = ficha('Healthylicious'), lp = ficha('La Perla');
  que(pa && pa.mal && /no llega a su fecha/.test(pa.t), 'Parentesis, en rojo, y lo dice con palabras: «' + (pa && pa.t) + '»');
  que(he && he.mal && /va tarde/.test(he.t), 'Healthylicious, en rojo: «va tarde»');
  que(lp && !lp.mal && !lp.av, 'La Perla va a tiempo: sin color');
  que(!/Parentesis -|\(Letras/.test(todas.map(x => x.t).join(' ')), 'el nombre es el del negocio, sin el contacto ni el paréntesis del tipo');
  const ley = await p.$eval('#mod-tablero .tb-leyenda', e => e.textContent);
  que(/va tarde/.test(ley) && /toca hoy/.test(ley), 'la leyenda dice con palabras qué es cada color');
  que(todas.every(x => x.alto >= 43.5), 'cada ficha mide 44 px o más con el dedo (' + Math.min(...todas.map(x => x.alto)).toFixed(1) + ')');
  await p.locator('#mod-tablero .tb-ficha', { hasText: 'La Perla' }).tap(); await esp(p, 1500);
  que(/La Perla/.test(await tituloFicha(p)), 'tocar la ficha abre el proyecto: ahí se avanza la etapa');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

/* ══ 3 · LA PRÓXIMA INSTALACIÓN, LOS AVISOS Y LO QUE YA NO ESTÁ ═══════════════ */
titulo('prox', 'LA PRÓXIMA INSTALACIÓN, LA PUERTA A LOS AVISOS Y LO QUE YA NO ESTÁ');
if (activa('prox')) {
  const c = await entrar({ touch: true, decidir: 1 });
  const { p, errs } = c;
  const prox = await p.$eval('#mod-tablero .tb-prox-d', e => e.textContent);
  que(/^(lun|mar|mié|jue|vie|sáb|dom) \d+/.test(prox) && /Healthylicious/.test(prox), 'la próxima instalación, con su día y su nombre: «' + prox + '»');
  await p.locator('#mod-tablero .tb-prox .tb-enlace').tap(); await esp(p, 1300);
  que(p.url().endsWith('#/agenda'), '«Calendario ›» abre el Calendario');
  await irA(p, '#/hoy', 1500);
  await p.locator('#mod-tablero .tb-pie .tb-enlace').tap(); await esp(p, 1300);
  que(p.url().endsWith('#/atender'), '«Todos los avisos ›» abre «Qué atender», que no tiene otra puerta');
  await irA(p, '#/hoy', 1500);
  const ya = await p.evaluate(() => ({
    cuentas: !!document.querySelector('#mod-tablero .pf-cuentas'), linea: !!document.querySelector('#mod-tablero .tb-linea'),
    lente: !!document.querySelector('#mod-tablero [data-vista]'), desliza: !!document.querySelector('#mod-tablero .desliza'),
    barra: !document.getElementById('pf-mbar') || document.getElementById('pf-mbar').hidden,
    botones: document.querySelectorAll('#mod-tablero button').length,
    alto: document.documentElement.scrollHeight, vista: innerHeight }));
  que(!ya.cuentas && !ya.linea && !ya.lente && !ya.desliza, 'ya no están la cinta de cuentas, la tubería, el segmento de la mesa ni los renglones deslizables');
  que(ya.barra, 'ni la barra fija de abajo: «Decidir» es el primer renglón, a la vista');
  que(ya.botones <= 25, 'con 7 trabajos, ' + ya.botones + ' botones (eran más de 80 con 9)');
  que(ya.alto <= ya.vista * 3, 'y la pantalla mide ' + (ya.alto / ya.vista).toFixed(1) + ' pantallas de teléfono (eran 8.2)');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

/* ══ 4 · LA MESA DE CORTE DESDE UN PROYECTO ══════════════════════════════════ */
titulo('mesa', 'LA MESA DE CORTE DESDE UN PROYECTO, Y DE VUELTA');
if (activa('mesa')) {
  /* Con ratón: con el dedo la ficha no ofrece la mesa (es una herramienta de computadora). */
  const c = await entrar({ ancho: 1100, alto: 900 });
  const { p, errs } = c;
  await p.locator('#mod-tablero .tb-ficha', { hasText: 'Healthylicious' }).click(); await esp(p, 1500);
  const acom = p.locator('#pf-ficha [data-anidar]');
  que((await acom.count()) === 1, 'la ficha de un trabajo en diseño ofrece «Acomodar en la lámina», junto al paso que sigue');
  await acom.click(); await esp(p, 2500);
  const v = await p.evaluate(() => ({ marco: !!document.getElementById('pf-anid-marco'),
    volver: ((document.querySelector('#mod-tablero .tb-volver .btn') || {}).textContent || '').trim(), hash: location.hash }));
  que(v.marco && v.hash === '#/hoy', 'abre la mesa de corte dentro del Tablero');
  que(/^‹ Volver a .*Healthylicious/.test(v.volver), 'con la salida de vuelta al proyecto: «' + v.volver + '»');
  await p.locator('#mod-tablero .tb-volver .btn').click(); await esp(p, 1500);
  que(/Healthylicious/.test(await tituloFicha(p)), 'y «Volver» regresa a la ficha del proyecto');
  await irA(p, '#/hoy', 1500);
  que(await p.evaluate(() => !!document.querySelector('#mod-tablero .tb-limpio') && !document.getElementById('pf-anid-marco')), 'al volver al Tablero se ve el Tablero, no la mesa');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}
/* ══ 6 · P13 · LO ATENDIDO SE PALOMEA, SE TACHA Y SE PLIEGA ═════════════════ */
titulo('p13', 'P13 · «QUÉ ATENDER»: EL AVISO ATENDIDO SE RESUELVE EN SU SITIO');
for (const rm of [false, true]) {
  if (!activa('p13')) break;
  console.log(rm ? '  — con menos movimiento —' : '  — con movimiento —');
  const c = await entrar({ touch: true, rm });
  const { p, errs } = c;
  await irA(p, '#/atender', 1600);
  const avisos = () => p.evaluate(() => [...document.querySelectorAll('#mod-atender .av-fila')].map(e => e.dataset.titulo));
  const antes = await avisos();
  que(antes.some(t => /Parentesis/.test(t)), 'hay un aviso de «sigue sin marcarse» para la instalación vencida (' + antes.length + ' avisos)');
  const fila = p.locator('#mod-atender .av-fila', { hasText: 'Parentesis' }).first();
  const ya = fila.locator('[data-acc]', { hasText: 'Ya se instaló' });
  que((await ya.count()) === 1, 'y ofrece «Ya se instaló»');
  await ya.tap();
  await esp(p, 250);
  const e1 = await fila.evaluate(e => ({
    hecho: e.classList.contains('hecho'), pliega: e.classList.contains('pliega'),
    tachado: getComputedStyle(e.querySelector('.pf-fila-t')).textDecorationLine,
    palomita: !!e.querySelector('.pf-fila-ico .palomita'), opaco: getComputedStyle(e.querySelector('.pf-fila-t')).opacity,
    inerte: e.querySelector('.pf-fila').hasAttribute('inert'),
  }));
  que(e1.hecho && /line-through/.test(e1.tachado), 'a los 250 ms el renglón ya está «hecho» y su título tachado');
  que(e1.palomita, 'la palomita ocupa el lugar de su icono');
  que(e1.opaco === '1', 'el estado no se dice con opacity: lo dicen el tachado y la tinta segunda (opacity ' + e1.opaco + ')');
  que(e1.inerte, 'y el renglón deja de recibir toques mientras se despide');
  que(!e1.pliega && (await fila.count()) === 1, 'todavía no se ha plegado ni repintado: sigue ahí a la vista, para que se vea CUÁL fue');
  if (rm) {
    await esp(p, 300);
    que(!(await fila.evaluate(e => e.classList.contains('pliega')).catch(() => false)), 'con menos movimiento NO hay pliegue');
  } else {
    await esp(p, 650);
    que(await fila.evaluate(e => e.classList.contains('pliega')).catch(() => false), 'se pliega (grid-template-rows de 1fr a 0fr) antes de repintar');
  }
  await esp(p, 900);
  const despues = await avisos();
  que(despues.length === antes.length - 1 && !despues.some(t => /Parentesis/.test(t)),
    'tras el pliegue se repinta: el renglón ya no está y los demás siguen (' + antes.length + ' → ' + despues.length + ')');
  que((await etapaDe(p, c.h.vencido.id)) === 'instalado', 'y la acción SÍ se hizo: el proyecto quedó «Instalado»');
  que((await infinitas(p)).length === 0, 'nada gira en bucle');
  que((await desborde(p)) <= 0, 'sin desborde horizontal');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}
if (activa('p13')) {
  /* Si la acción FALLA no se tacha nada: la instalación desaparece de la base entre que se pintó el
     aviso y se tocó el botón, y `Agenda.marcar` contesta que no existe. Un renglón tachado que
     sigue pendiente es peor que ninguna señal. */
  const f = await entrar({ touch: true });
  await irA(f.p, '#/atender', 1600);
  await f.p.evaluate(async id => {
    const Agenda = await import('./js/datos/agenda.js'); const DB = await import('./js/datos/db.js');
    const [i] = await Agenda.listar({ proyecto_id: id }); await DB.borrar('instalaciones', i.id);
  }, f.h.vencido.id);
  const fila = f.p.locator('#mod-atender .av-fila', { hasText: 'Parentesis' }).first();
  await fila.locator('[data-acc]', { hasText: 'Ya se instaló' }).tap();
  await esp(f.p, 1800);
  const sigue = await fila.evaluate(e => ({ hecho: e.classList.contains('hecho'), pliega: e.classList.contains('pliega'), inerte: e.querySelector('.pf-fila').hasAttribute('inert') })).catch(() => null);
  que(sigue && !sigue.hecho && !sigue.pliega && !sigue.inerte, 'si la acción falla el renglón NO se tacha, no se pliega y sigue tocable');
  que((await f.p.locator('#toast').textContent()).length > 3, 'y el aviso de error lo dice');
  await f.ctx.close();

  /* Con teclado: el foco no se cae al <body> cuando el renglón se va. */
  const k = await entrar({});
  await irA(k.p, '#/atender', 1600);
  const bk = k.p.locator('#mod-atender .av-fila', { hasText: 'Parentesis' }).first().locator('[data-acc]', { hasText: 'Ya se instaló' });
  await bk.focus();
  await k.p.keyboard.press('Enter');
  await esp(k.p, 2600);
  const foco = await k.p.evaluate(() => { const a = document.activeElement; return { cuerpo: a === document.body, dentro: !!a.closest && !!a.closest('#mod-atender') }; });
  que(!foco.cuerpo && foco.dentro, 'con teclado: al irse el renglón el foco pasa a otro control de la lista y no se cae al <body>');
  await k.ctx.close();
}

/* ══ 7 · P14 · FECHAS RÁPIDAS ═══════════════════════════════════════════════ */
titulo('p14', 'P14 · FECHAS RÁPIDAS AL GANAR Y AL AGENDAR');
if (activa('p14')) {
  const c = await entrar({ touch: true, decidir: 1 });
  const { p, errs } = c;
  await irA(p, '#/atender', 1600);
  const hoy = await hoyDe(p), man = await masDiasDe(p, hoy, 1);
  await p.locator('#mod-atender [data-acc]', { hasText: 'Se ganó' }).tap();
  await esp(p, 700);
  const fichas = () => p.$$eval('#pf-pide .pf-rapida', es => es.map(e => ({
    t: e.querySelector('.pf-rapida-t').textContent, v: e.querySelector('input').value, on: e.querySelector('input').checked,
    alto: e.getBoundingClientRect().height, clase: e.classList.contains('on') })));
  let fs = await fichas();
  que(fs.length === 5 && fs[0].t === 'Hoy' && fs[1].t === 'Mañana' && fs[4].t === 'Sin fecha',
    'al ganar hay cinco fichas: ' + fs.map(f => f.t).join(' · '));
  que(/^(lun|mar|mié|jue|vie|sáb|dom) \d+$/.test(fs[2].t) && /^(lun|mar|mié|jue|vie|sáb|dom) \d+$/.test(fs[3].t), 'los dos días de en medio son «día número» (' + fs[2].t + ', ' + fs[3].t + ')');
  que(fs[0].on && fs[0].clase && (await p.inputValue('#pf-ganar-fecha')) === hoy, '«Hoy» sale elegida porque el campo trae hoy: se VE lo que se está eligiendo');
  que(fs.every(f => f.alto >= 43.5), 'cada ficha mide al menos 44 px de alto con el dedo (' + Math.min(...fs.map(f => f.alto)).toFixed(1) + ')');
  que(fs[2].v > man && fs[3].v > fs[2].v, 'y los dos días salen DESPUÉS de mañana y en orden (' + fs[2].v + ', ' + fs[3].v + ')');
  const dsem = await p.evaluate(async iso => (await import('./js/nucleo/fechas.js')).diaSemana(iso), fs[2].v);
  const dsem2 = await p.evaluate(async iso => (await import('./js/nucleo/fechas.js')).diaSemana(iso), fs[3].v);
  que([dsem, dsem2].sort().join() === [1, 6].sort().join(), 'son el próximo sábado y el próximo lunes (' + dsem + ', ' + dsem2 + ')');

  await p.locator('#pf-pide .pf-rapida', { hasText: 'Mañana' }).tap();
  await esp(p, 200);
  que((await p.inputValue('#pf-ganar-fecha')) === man, 'tocar «Mañana» escribe en el campo de fecha (' + man + ')');
  fs = await fichas();
  que(fs[1].on && !fs[0].on, 'y solo ella queda elegida');
  await p.locator('#pf-pide .pf-rapida', { hasText: 'Sin fecha' }).tap();
  await esp(p, 200);
  que((await p.inputValue('#pf-ganar-fecha')) === '', '«Sin fecha» vacía el campo (ya está permitido)');
  await p.fill('#pf-ganar-fecha', '2031-02-03');
  await esp(p, 200);
  que(!(await fichas()).some(f => f.on), 'una fecha tecleada en el campo apaga las fichas: no coincide con ninguna');

  /* Teclado: las flechas mueven la elección dentro del grupo y escriben en el campo. */
  await p.fill('#pf-ganar-fecha', hoy);
  await esp(p, 200);
  await p.locator('#pf-pide .pf-rapida-in').first().focus();
  await p.keyboard.press('ArrowRight');
  await esp(p, 200);
  que((await p.inputValue('#pf-ganar-fecha')) === man, 'con teclado: la flecha derecha pasa de «Hoy» a «Mañana» y escribe el campo');
  que(await p.evaluate(() => { const r = document.querySelector('#pf-pide .pf-rapida:has(input:focus-visible)'); return !!r; }), 'y la ficha enfocada se ve (aro de foco)');
  /* Desde 3569dda ganar pide «Datos para la entrega»: el teléfono, y con instalación la
     dirección o «Todavía no la tengo». Sin ellos no se guarda nada. */
  await p.fill('#pf-de-tel', '3312345678');
  await p.locator('#pf-pide [data-de-pendiente]').tap();
  await esp(p, 200);
  await p.locator('#pf-pide [data-pide="ganar"]').tap();
  await esp(p, 1200);
  const inst = await p.evaluate(async () => {
    const Proy = await import('./js/datos/proyectos.js'); const Agenda = await import('./js/datos/agenda.js');
    const ps = await Proy.listar({}); const p = ps.find(x => x.folio_local === 'COT-7101' || (x.nombre || '').includes('Cliente pendiente'));
    if (!p) return null; const [i] = await Agenda.listar({ proyecto_id: p.id });
    return i ? i.fecha : 'sin instalación';
  });
  que(inst === man, 'guardar con «Mañana» crea el proyecto con su instalación ese día (' + inst + ')');

  /* «Mover fecha»: día y hora. Aquí NO hay «Sin fecha» (la pantalla existe para ponerla). */
  await irA(p, '#/atender', 1500);
  const mover = p.locator('#mod-atender [data-acc]', { hasText: 'Mover fecha' }).first();
  que((await mover.count()) === 1, 'hay un aviso con «Mover fecha»');
  await mover.tap();
  await esp(p, 700);
  const dias = await p.$$eval('#pf-pide input[name="pf-rapida-dia"]', es => es.map(e => e.closest('.pf-rapida').textContent.replace(/\s+/g, ' ').trim()));
  const horas = await p.$$eval('#pf-pide input[name="pf-rapida-hora"]', es => es.map(e => e.closest('.pf-rapida').textContent.replace(/\s+/g, ' ').trim()));
  que(dias.length === 4 && !dias.some(t => /Sin fecha/.test(t)), 'el día lleva cuatro fichas y ninguna es «Sin fecha» (' + dias.join(' · ') + ')');
  que(horas.length === 5 && /Sin hora/.test(horas[0]) && /9 a\.m\./.test(horas[1]) && /Noche/.test(horas[4]), 'la hora lleva «Sin hora · 9 a.m. · 12 p.m. · 4 p.m. · Noche» (' + horas.join(' · ') + ')');
  await p.locator('#pf-pide .pf-rapida', { hasText: '4 p.m.' }).tap();
  await p.locator('#pf-pide .pf-rapida', { hasText: 'Mañana' }).tap();
  await esp(p, 200);
  que((await p.inputValue('#pf-fecha-hora')) === '16:00' && (await p.inputValue('#pf-fecha-dia')) === man, 'las fichas escriben el día (' + man + ') y la hora (16:00)');
  await p.locator('#pf-pide .pf-rapida', { hasText: 'Sin hora' }).tap();
  await esp(p, 200);
  que((await p.inputValue('#pf-fecha-hora')) === '', '«Sin hora» vacía la hora');
  await p.locator('#pf-pide .pf-rapida', { hasText: '4 p.m.' }).tap();
  const fila = await p.evaluate(() => (document.querySelector('#pf-pide .pf-panel-b .pf-fila-d') || {}).textContent);
  await p.locator('#pf-pide [data-pide="fecha"]').tap();
  await esp(p, 1300);
  const hora = await p.evaluate(async fecha => {
    const Agenda = await import('./js/datos/agenda.js'); const todas = await Agenda.listar({ vivas: true });
    return todas.filter(i => i.fecha === fecha).map(i => i.hora);
  }, man);
  que(hora.includes('16:00'), 'guardar mueve la instalación a mañana a las 16:00 (' + hora.join(',') + ' · ' + (fila || '').slice(0, 40) + ')');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

/* ══ 8 · LAS MEDIDAS: 360 y 420 px × claro y oscuro × con y sin movimiento ═ */
titulo('medidas', 'EN TODAS LAS MEDIDAS · sin desborde, sin bucles, con contraste');
if (activa('medidas')) {
  for (const ancho of [360, 420]) for (const tema of ['claro', 'oscuro']) for (const rm of [false, true]) {
    const donde = ancho + ' px · ' + tema + ' · ' + (rm ? 'menos movimiento' : 'con movimiento');
    const c = await entrar({ ancho, tema, rm, touch: true, decidir: 1 });
    const { p, errs } = c;
    que((await desborde(p)) <= 0, donde + ': Tablero sin desborde horizontal');
    const inf = await infinitas(p);
    que(inf.length === 0, donde + ': Tablero sin animaciones en bucle en reposo' + (inf.length ? ' (' + inf.join(', ') + ')' : ''));
    for (const [sel, que_es] of [['#mod-tablero .tb-res-fecha', 'la fecha'], ['#mod-tablero .tb-sec-t', 'el título de sección'],
      ['#mod-tablero .tb-nec-t', 'el título de un pendiente'], ['#mod-tablero .tb-nec-d', 'su detalle'],
      ['#mod-tablero .tb-nec-n.mal', 'la cifra en rojo'], ['#mod-tablero .tb-ficha.mal', 'una ficha en rojo'],
      ['#mod-tablero .tb-ficha:not(.mal):not(.av)', 'una ficha a tiempo'], ['#mod-tablero .tb-leyenda', 'la leyenda'],
      ['#mod-tablero .tb-enlace', 'un enlace']]) {
      const k = await contraste(p, sel);
      que(k >= 4.5, donde + ': ' + que_es + ' pasa de 4,5:1 (' + (k && k.toFixed(2)) + ')');
    }

    /* La ficha del proyecto, con lo de arriba para el taller. */
    await p.locator('#mod-tablero .tb-ficha', { hasText: 'Healthylicious' }).tap(); await esp(p, 1500);
    que((await desborde(p)) <= 0, donde + ': la ficha para el taller sin desborde');
    const k1 = await contraste(p, '#pf-ficha .pj-t-bloque .fld-lab');
    const k2 = await contraste(p, '#pf-ficha .pj-t-det');
    que(k1 >= 4.5 && k2 >= 4.5, donde + ': sus títulos y su detalle pasan de 4,5:1 (' + (k1 && k1.toFixed(2)) + ' y ' + (k2 && k2.toFixed(2)) + ')');
    await p.evaluate(() => document.querySelector('[data-cerrar-ficha]').click()); await esp(p, 600);

    /* Qué atender con su modal de fechas. */
    await irA(p, '#/atender', 1500);
    que((await desborde(p)) <= 0, donde + ': «Qué atender» sin desborde');
    que((await infinitas(p)).length === 0, donde + ': «Qué atender» sin bucles en reposo');
    await p.locator('#mod-atender [data-acc]', { hasText: 'Se ganó' }).tap(); await esp(p, 800);
    que((await desborde(p)) <= 0, donde + ': con las fechas rápidas de «Se ganó», sin desborde');
    const k5 = await contraste(p, '#pf-pide .pf-rapida.on .pf-rapida-t');
    const k6 = await contraste(p, '#pf-pide .pf-rapida:not(.on) .pf-rapida-t');
    que(k5 >= 4.5 && k6 >= 4.5, donde + ': las fichas de fecha, la elegida y las demás, pasan de 4,5:1 (' + (k5 && k5.toFixed(2)) + ' y ' + (k6 && k6.toFixed(2)) + ')');
    que(errs.length === 0, donde + ': cero errores de página', donde + ': errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
    await c.ctx.close();
  }
}

await nav.close();
console.log(fallos ? '\n' + fallos + ' fallo(s) en el Tablero.' : '\nEl Tablero despejado: cada pendiente lleva a donde se atiende, el taller se lee de un vistazo y nada se mueve solo.');
process.exit(fallos ? 1 : 0);
