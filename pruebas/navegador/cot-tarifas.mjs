/* PRECIOS Y MATERIALES (23-oct-2026), CON EL DEDO Y EL TECLADO.

   Dirección cambia los precios desde el cotizador (js/cotizador/tarifas.js) y la hoja los guarda
   en su pestaña «Tarifas». Lo que se defiende aquí, en un navegador:

   · EL ENGRANE solo lo ve Dirección: quien no lo es no tiene ni el botón.
   · LA VENTANA trae un renglón por precio, agrupados, con lo de fábrica si la hoja no tiene tabla,
     y dice que la hoja vieja todavía no sabe guardar.
   · CAMBIAR Y GUARDAR: subir el aluminio, agregar un material «como» uno de fábrica y ocultar otro.
     Al guardar, la partida en pantalla cobra el precio nuevo, el material nuevo se ofrece en los
     chips, el oculto ya no —salvo en la partida que ya lo tiene— y lo guardado sobrevive a recargar.
   · LO QUE NO SIRVE NO SE MANDA: un precio vacío se dice y se queda en la ventana.

   Uso:  PUERTO=8814 node pruebas/navegador/cot-tarifas.mjs */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, m, extra = '') => (c ? bien(m) : mal(m + (extra ? ' — ' + extra : '')));
const HOJA = fileURLToPath(new URL('./hoja-de-mentiras.js', import.meta.url));

async function sesion({ W = 390, rol = 'direccion', tema = 'claro' } = {}) {
  const ctx = await nav.newContext({ viewport: { width: W, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block' });
  await ctx.addInitScript({ path: HOJA });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  if (rol !== 'direccion') await ctx.addInitScript(r => { if (window.AL3D) window.AL3D.identidad = () => ({ correo: 'ventas@al3d.mx', rol: r }); }, rol);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|Failed to load resource/.test(m.text())) errs.push('consola: ' + m.text()); });
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof Q !== 'undefined' && typeof abrirTarifas === 'function');
  await p.waitForTimeout(1600);
  return { ctx, p, errs, ev: (f, a) => p.evaluate(f, a) };
}
const armar = ev => ev(() => {
  Q.cliente = 'Farmacia San Juan'; Q.proy = 'Letrero'; Q.tel = '33 2813 0092'; Q.dirRaw = 'Av. Vallarta 1234, Guadalajara';
  Q.estado = 'borrador'; Q.items = [
    { id: 1, tipo: 'letras', material: 'al-paint', matAuto: false, comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 9, desc: 'FARMACIA', showInPdf: true },
    { id: 2, tipo: 'letras', material: 'acero', matAuto: false, comp: 'recta', luz: true, ilumTipo: 'fria', altura: 30, n: 3, desc: 'GDL', showInPdf: true }];
  pid = 2; saveState(); renderItems(); renderSummary(); irAPantalla('partidas', { forzar: true });
});

/* ============================== 1 · QUIÉN VE EL ENGRANE ============================== */
console.log('\n  — el engrane —');
{
  const s = await sesion({ rol: 'pagos' });
  cierto(await s.ev(() => document.getElementById('tarbtn').hidden && getComputedStyle(document.getElementById('tarbtn')).display === 'none'), 'quien no es Dirección no ve el engrane');
  await s.ev(() => abrirTarifas());
  cierto(await s.ev(() => !document.getElementById('tarmodal').classList.contains('show')), 'y llamar a la función a mano tampoco abre la ventana');
  cierto(!s.errs.length, 'sin errores de página', s.errs.join(' | '));
  await s.ctx.close();
}

/* ============================== 2 · CAMBIAR Y GUARDAR ============================== */
console.log('\n  — cambiar y guardar —');
{
  const s = await sesion();
  const { p, ev } = s;
  await armar(ev);
  cierto(await ev(() => !document.getElementById('tarbtn').hidden), 'Dirección sí ve el engrane');
  const b = await ev(() => { const r = document.getElementById('tarbtn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; });
  cierto(b.h >= 43.5, 'el engrane mide 44 px con el dedo', String(b.h));
  await p.touchscreen.tap(b.x, b.y);
  await p.waitForTimeout(500);
  const v = await ev(() => ({ abierta: document.getElementById('tarmodal').classList.contains('show'),
    grupos: [...document.querySelectorAll('.tar-gt')].map(h => h.firstChild.textContent.trim()),
    filas: document.querySelectorAll('.tar-fila').length, ayuda: document.getElementById('tar-ayuda').textContent }));
  cierto(v.abierta, 'tocarlo abre «Precios y materiales»');
  cierto(v.grupos.length === 6 && v.grupos[0] === 'Materiales de letras 3D', 'seis grupos, con los materiales primero: ' + v.grupos.join(' | '));
  cierto(v.filas === 16, 'dieciséis renglones: el catálogo de fábrica', String(v.filas));
  cierto(/hoja todavía no tiene esta función/.test(v.ayuda), 'con una hoja que no conoce la ruta, la ventana lo dice', v.ayuda);
  /* La hoja ya tiene la ruta: se abre de nuevo y ya no lo dice. */
  await ev(() => { window.__hoja.tarifas = null; TARIFAS_INFO.sinRuta = false; cerrarTarifas(); abrirTarifas(); });
  await p.waitForTimeout(300);
  /* Sube el aluminio pintado de 30 a 34. */
  await p.fill('#tar-p-0', '34');
  /* Oculta el acero (el quinto renglón). */
  const vis = await ev(() => { const el = document.querySelector('[data-foco="tar-v-4"]'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.touchscreen.tap(vis.x, vis.y);
  await p.waitForTimeout(200);
  cierto(await ev(() => document.querySelector('[data-foco="tar-v-4"]').getAttribute('aria-checked') === 'false'), 'el acero queda sin ofrecerse');
  /* Agrega un material. */
  await p.click('[data-foco="tar-mas-material"]');
  await p.waitForTimeout(200);
  const i = await ev(() => _tarEdit.length - 1);
  cierto(await ev(i => document.activeElement && document.activeElement.id === 'tar-n-' + i, i), 'agregar deja el cursor en el nombre del nuevo');
  await p.keyboard.type('Aluminio anodizado');
  /* Un precio vacío no se manda. */
  await p.click('#tar-guardar');
  await p.waitForTimeout(400);
  cierto(await ev(() => document.getElementById('tarmodal').classList.contains('show') && !window.__hoja.llamadas.some(l => l.ruta === 'guardar_tarifas')),
    'sin precio no se manda nada y la ventana sigue abierta');
  await p.fill('#tar-p-' + i, '38');
  await p.selectOption('#tar-c-' + i, 'al-paint');
  await p.click('#tar-guardar');
  await p.waitForTimeout(900);
  const g = await ev(() => ({ cerrada: !document.getElementById('tarmodal').classList.contains('show'),
    mandado: (window.__hoja.llamadas.filter(l => l.ruta === 'guardar_tarifas').pop() || {}).cuerpo,
    pintado: matOf('al-paint').precio, nuevo: MATERIALES.find(m => m.label === 'Aluminio anodizado'),
    total1: lineTotal(Q.items[0]), total2: lineTotal(Q.items[1]),
    chips1: [...document.querySelectorAll('#pbody-1 .chip')].map(c => c.textContent), chips2: [...document.querySelectorAll('#pbody-2 .chip')].map(c => c.textContent),
    guardado: !!localStorage.getItem('al3d_tarifas') }));
  cierto(g.cerrada && g.mandado && g.mandado.filas.length === 17, 'guardar manda los diecisiete renglones y cierra', JSON.stringify(g.mandado && g.mandado.filas.length));
  cierto(g.pintado === 34 && g.total1 === 34 * 40 * 9, 'la partida en pantalla ya cobra el aluminio a $34: ' + g.total1);
  cierto(g.nuevo && g.nuevo.como === 'al-paint' && g.nuevo.precio === 38, 'el anodizado entra al catálogo, como el pintado', JSON.stringify(g.nuevo));
  cierto(g.chips1.some(t => /Aluminio anodizado/.test(t)) && !g.chips1.some(t => /Acero/.test(t)), 'en una partida de pintado se ofrece el anodizado y ya no el acero');
  cierto(g.chips2.some(t => /Acero/.test(t)) && g.total2 === 55 * 30 * 3, 'la partida que ya era de acero lo conserva y lo cobra');
  cierto(g.guardado, 'la tabla queda guardada en el aparato');
  /* Recargar: el primer pintado ya trae los precios guardados, sin esperar a la hoja. */
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof Q !== 'undefined' && typeof abrirTarifas === 'function');
  cierto(await ev(() => matOf('al-paint').precio === 34 && !!MATERIALES.find(m => m.label === 'Aluminio anodizado')), 'al recargar, los precios guardados ya están desde el primer pintado');
  cierto(!s.errs.length, 'sin errores de página', s.errs.join(' | '));
  await s.ctx.close();
}

/* ============================== 3 · UNA HOJA VIEJA NO GUARDA ============================== */
console.log('\n  — una hoja vieja —');
{
  const s = await sesion();
  const { p, ev } = s;
  await ev(() => { window.__hoja.sinTarifas = true; abrirTarifas(); });
  await p.waitForTimeout(300);
  await p.fill('#tar-p-0', '31');
  await p.click('#tar-guardar');
  await p.waitForTimeout(800);
  const r = await ev(() => ({ abierta: document.getElementById('tarmodal').classList.contains('show'), precio: matOf('al-paint').precio,
    ayuda: document.getElementById('tar-ayuda').textContent }));
  cierto(r.abierta && r.precio === 30, 'si la hoja no sabe guardar, no cambia nada y la ventana sigue abierta', JSON.stringify(r));
  cierto(/publicar la versión nueva/.test(r.ayuda), 'y dice qué falta: publicar el Apps Script nuevo');
  cierto(!s.errs.length, 'sin errores de página', s.errs.join(' | '));
  await s.ctx.close();
}

await nav.close();
if (fallos) { console.log(`\n${fallos} comprobaciones fallaron.`); process.exit(1); }
console.log('\nPrecios y materiales se abren, se cambian, se guardan y se usan, solo para Dirección.');
