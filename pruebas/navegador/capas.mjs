/* LAS CAPAS DE LA PLATAFORMA Y EL BOTÓN DE ATRÁS.
 *
 * `cerrarCapa()` consume su entrada de historial con un `history.back()` propio, y el oyente de
 * popstate no sabía distinguir ese back del atrás del teléfono: los trataba igual y cerraba la
 * SIGUIENTE capa con entrada. Nada de eso da error ni pinta nada raro; la app solo deja de
 * hacer lo que el dedo pidió, y cada síntoma parece un defecto distinto:
 *
 *   · cerrar con su X la orden de trabajo cerraba también la ficha de abajo;
 *   · «No se dio» desde la ficha no se podía contestar: la ficha se cerraba, se abría la
 *     pregunta y el popstate de la ficha la cerraba al milisegundo — Dirección no podía
 *     descartar un proyecto;
 *   · un Escape sobre «Editar material» cerraba también el catálogo, y la entrada que sobraba
 *     hacía que el atrás siguiente no hiciera nada.
 *
 * Y lo que tiene que seguir igual: el atrás de verdad cierra UNA capa por toque, y no se sale
 * de la pantalla mientras quede una abierta.
 *
 * Uso:  PUERTO=8814 node pruebas/navegador/capas.mjs
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX',
  timezoneId: 'America/Mexico_City', serviceWorkers: 'block' });
/* Dirección, con nombre: es el rol que tiene «No se dio» en la ficha, y sin nombre Ajustes
   pondría la presentación delante. */
await ctx.addInitScript(() => {
  try {
    if (!sessionStorage.getItem('__capas')) {
      localStorage.setItem('al3d_pf_rol', 'direccion');
      localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
      sessionStorage.setItem('__capas', '1');
    }
  } catch (_) {}
});
const p = await ctx.newPage();
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const errs = []; p.on('pageerror', e => errs.push(e.message));

/* Mismo cuidado que pruebas/navegador/tablero.mjs: `goto` a la misma URL con hash no recarga. */
const irA = async (hash, espera = 1300) => {
  const destino = B + '/' + hash;
  if (p.url() === destino) await p.reload({ waitUntil: 'load' });
  else await p.goto(destino, { waitUntil: 'load' });
  await p.waitForTimeout(espera);
};
const abiertas = () => p.evaluate(() => ['pf-ficha', 'pf-hoja', 'pf-pide', 'pf-ia']
  .filter(id => document.getElementById(id).classList.contains('show')));
const estado = () => p.evaluate(() => JSON.stringify(history.state));
const montada = () => p.evaluate(() => {
  const s = [...document.querySelectorAll('.pf-mod')].find(x => !x.hidden);
  return s ? s.id : null;
});
const tocar = sel => p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel);
const atras = async () => { await p.goBack(); await p.waitForTimeout(700); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

await irA('#/hoy');
/* Por la capa de datos, como las demás pruebas: `ganar()` es lo que de verdad crea un proyecto. */
const creados = await p.evaluate(async () => {
  const Proy = await import('./js/datos/proyectos.js');
  const letras = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, altura: 40, n: 8 };
  const ids = [];
  for (const [folio, cliente] of [['COT-9101', 'Healthylicious'], ['COT-9102', 'La Perla']]) {
    const r = await Proy.ganar({ folio, cliente, proy: cliente + ' — anuncio', ts: Date.now(),
      estado: 'autorizada', items: [letras], neto: 40000, itemsAuth: { 1: 40000 } }, {});
    if (r.ok) ids.push(r.valor.id);
  }
  return ids;
});
creados.length === 2 ? bien('dos proyectos ganados por la capa de datos') : mal('se crearon ' + creados.length + ' de 2');

// ── 1. Dos capas apiladas: la X cierra la de arriba y nada más ─────────────
console.log('\nLA X CIERRA SOLO LA SUYA');
await irA('#/proyectos', 1500);
await tocar('[data-abrir]');
await p.waitForTimeout(700);
await tocar('#pf-ficha [data-hoja]');
await p.waitForTimeout(700);
igual(await abiertas(), ['pf-ficha', 'pf-hoja'])
  ? bien('ficha y, encima, la orden de trabajo')
  : mal('al abrir la orden quedaron ' + JSON.stringify(await abiertas()));
await tocar('#pf-hoja .pf-cerrar');
await p.waitForTimeout(800);
igual(await abiertas(), ['pf-ficha'])
  ? bien('cerrar la orden con su X deja la ficha abierta — antes se cerraban las dos')
  : mal('tras la X de la orden quedaron ' + JSON.stringify(await abiertas()));
(await estado()) === '{"capa":"pf-ficha"}'
  ? bien('y el historial quedó en la entrada de la ficha')
  : mal('el historial quedó en ' + await estado());

// ── 2. El atrás de verdad: una capa por toque, sin salir de la pantalla ────
console.log('\nEL ATRÁS CIERRA UNA POR TOQUE');
await tocar('#pf-ficha [data-hoja]');
await p.waitForTimeout(700);
await atras();
igual(await abiertas(), ['pf-ficha'])
  ? bien('un atrás con dos capas cierra la de arriba')
  : mal('un atrás dejó ' + JSON.stringify(await abiertas()));
await atras();
const trasDos = { capas: await abiertas(), montada: await montada(), hash: await p.evaluate(() => location.hash) };
trasDos.capas.length === 0 && trasDos.montada === 'mod-proyectos' && trasDos.hash === '#/proyectos'
  ? bien('el segundo cierra la ficha y se queda en Proyectos')
  : mal('el segundo atrás dejó ' + JSON.stringify(trasDos));

// ── 3. «No se dio» desde la ficha: cerrar una capa y abrir otra en el mismo toque ──
console.log('\n«NO SE DIO» DESDE LA FICHA');
await tocar('[data-abrir]');
await p.waitForTimeout(700);
await tocar('#pf-ficha [data-cancelar]');
await p.waitForTimeout(1000);
igual(await abiertas(), ['pf-pide'])
  ? bien('la pregunta se abre y SE QUEDA abierta — antes el back de la ficha la cerraba al milisegundo')
  : mal('un segundo después de «No se dio» quedaron ' + JSON.stringify(await abiertas()));
(await estado()) === '{"capa":"pf-pide"}'
  ? bien('con su propia entrada de historial, aunque se abrió con el back de la ficha en vuelo')
  : mal('la pregunta quedó sin entrada: el historial dice ' + await estado());
await atras();
const trasPide = { capas: await abiertas(), montada: await montada(), hash: await p.evaluate(() => location.hash) };
trasPide.capas.length === 0 && trasPide.montada === 'mod-proyectos' && trasPide.hash === '#/proyectos'
  ? bien('y el atrás la cierra sin sacarte de Proyectos')
  : mal('el atrás sobre la pregunta dejó ' + JSON.stringify(trasPide));

/* Y se puede contestar: es lo que Dirección no podía hacer. */
await tocar('[data-abrir]');
await p.waitForTimeout(700);
await tocar('#pf-ficha [data-cancelar]');
await p.waitForTimeout(900);
await tocar('#pf-pide [data-confirma-nodio]');
await p.waitForTimeout(1200);
const descartado = await p.evaluate(async ids => {
  const Proy = await import('./js/datos/proyectos.js');
  const l = await Promise.all(ids.map(id => Proy.obtener(id)));
  return l.filter(x => x && x.etapa === 'cancelado').length;
}, creados);
descartado === 1 ? bien('«No se dio» se puede contestar: el proyecto quedó descartado')
                 : mal('«No se dio» no descartó nada (' + descartado + ' cancelados)');

// ── 4. Escape sobre dos capas cierra una, y no deja entradas de sobra ──────
console.log('\nESCAPE Y LA ENTRADA QUE SOBRABA');
await irA('#/material', 1600);
await tocar('[data-hoja="catalogo"]');
await p.waitForTimeout(600);
await tocar('#pf-hoja [data-editmat]');
await p.waitForTimeout(600);
igual(await abiertas(), ['pf-hoja', 'pf-pide'])
  ? bien('catálogo y, encima, «Editar material»')
  : mal('al editar quedaron ' + JSON.stringify(await abiertas()));
await p.keyboard.press('Escape');
await p.waitForTimeout(800);
igual(await abiertas(), ['pf-hoja'])
  ? bien('un Escape cierra la edición y deja el catálogo')
  : mal('un Escape dejó ' + JSON.stringify(await abiertas()));
await atras();
const trasCat = { capas: await abiertas(), hash: await p.evaluate(() => location.hash) };
trasCat.capas.length === 0 && trasCat.hash === '#/material'
  ? bien('y el atrás siguiente cierra el catálogo: no hay una entrada muerta en medio')
  : mal('el atrás tras el Escape dejó ' + JSON.stringify(trasCat));

// ── 5. El asistente encima de una ficha ────────────────────────────────────
console.log('\nEL ASISTENTE ENCIMA DE UNA FICHA');
await irA('#/proyectos', 1500);
await tocar('[data-abrir]');
await p.waitForTimeout(700);
await tocar('#pf-ia-btn');
await p.waitForTimeout(900);
igual(await abiertas(), ['pf-ficha', 'pf-ia'])
  ? bien('ficha y asistente')
  : mal('al abrir el asistente quedaron ' + JSON.stringify(await abiertas()));
await tocar('#pf-ia [data-ia-cerrar]');
await p.waitForTimeout(800);
igual(await abiertas(), ['pf-ficha'])
  ? bien('cerrar el asistente deja la ficha donde estaba')
  : mal('cerrar el asistente dejó ' + JSON.stringify(await abiertas()));

// ── 6. Sin errores ─────────────────────────────────────────────────────────
console.log('');
errs.length ? mal('errores de página: ' + [...new Set(errs)].slice(0, 3).join(' | '))
            : bien('cero errores de página');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nCada capa se cierra sola, y el atrás cierra una por toque.');
await nav.close();
process.exit(fallos ? 1 : 0);
