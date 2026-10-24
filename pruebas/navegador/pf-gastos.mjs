/* CONTROL → GASTOS: CAPTURAR, MANDAR A LA HOJA, ANULAR, Y UNA HOJA QUE TODAVÍA NO SABE.
 *
 * La aritmética de los gastos y el Apps Script de verdad los cubre pruebas/gastos.mjs, en node. Lo
 * que solo se ve con un navegador es esto:
 *   · la pestaña «Gastos» existe para dirección y pagos, con su total del mes, el del anterior y
 *     la utilidad aproximada; el Resumen dice «Gastado» y «Utilidad aproximada»;
 *   · «Registrar gasto» abre el formulario en la capa de siempre (#pf-pide), sin un solo guion en
 *     línea: un campo que falta se dice JUNTO a él y el foco va ahí; al guardar, la fila aparece,
 *     la categoría suma y el gasto llega al puente (/empujar_gastos) con sus datos;
 *   · sin señal se guarda igual, la fila dice «por mandar», y al volver la señal sale solo;
 *   · «Anular» pregunta con la capa de la app y manda la anulación; la fila se queda, tachada;
 *   · el CSV de gastos, solo para dirección (pagos ve la pestaña, no el botón);
 *   · contra una hoja en puente-sheets-14 la pestaña dice «Falta actualizar el puente» en vez de
 *     tronar, y lo capturado se queda guardado;
 *   · a 360 y 1200 px, claro y oscuro: sin desborde, botones de 44 px o más, contraste de 4.5:1 en
 *     lo nuevo y cero errores de página.
 *
 * El puente es de mentiras (`ctx.route`), como en pf-control.mjs.
 *
 * Uso:  PUERTO=8830 node pruebas/navegador/pf-gastos.mjs
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const TOKEN = 'tok-de-gastos';

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const que = (ok, msg, alReves) => (ok ? bien(msg) : mal(alReves || msg));
const esp = (p, ms) => p.waitForTimeout(ms);

const hoyMx = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
const filaHoja = (id, nombre, sub) => ({ id_notion: id, editado: null, 'Proyecto': nombre, 'Cuenta ': 'Elias BBVA',
  'Estatus': 'LIQUIDADO', 'Tipo de trabajo': ['Letras 3D con iluminacion'], 'IVA': true,
  'Precio Subtotal': sub, 'Precio Neto ': Math.round(sub * 1.16), 'Anticipo': Math.round(sub * 0.58), 'Liquidacion': Math.round(sub * 0.58),
  'Pago Pendiente': 0, 'Comisiones': sub / 10, 'Abono Comision': sub / 10, 'Comision Restante': 0, 'Porcentaje comision': null,
  'Fecha Anticipo e Instalacion': hoyMx().slice(0, 7) + '-01', 'Fecha instalacion': null, 'Fecha Liquidacion': null,
  'Folio cotizacion': '', 'Etapa de obra': null, 'Hora instalacion': '', 'Ubicacion': '', 'Direccion': '' });

/* El puente de mentiras: contesta como el Apps Script. Con `version` 15 guarda los gastos que le
   llegan y los devuelve en /jalar_gastos; con la 14 no conoce esos caminos. */
async function ponerPuente(ctx, { version = 'puente-sheets-15', rol = 'direccion' } = {}) {
  const mock = { gastos: new Map(), empujes: [], rutas: [] };
  const sabe = Number(version.split('-').pop()) >= 15;
  await ctx.route(B + '/puente', async route => {
    let e = {}; try { e = JSON.parse(route.request().postData() || '{}'); } catch (_) {}
    mock.rutas.push(e.ruta);
    const json = o => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (e.token !== TOKEN) return json({ ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Token desconocido' });
    if (e.ruta === 'salud') return json({ ok: true, ts: Date.now(), version, rol, escribibles: ['Proyecto', 'Estatus'], destino: 'google-sheets' });
    if (e.ruta === 'esquema') return json({ ok: true, faltan: [], accesos: true, nota: '' });
    if (e.ruta === 'jalar') return json({ ok: true, hay_mas: false, cursor: null,
      registros: [{ almacen: 'proyectos', datos: filaHoja('V-501', 'Gym Titanio', 20000) }] });
    if (e.ruta === 'jalar_almacen') return json({ ok: true, registros: [], hasta: 0, hay_mas: false });
    if (sabe && e.ruta === 'empujar_gastos') {
      const resultados = (e.ops || []).map(op => {
        mock.empujes.push(op);
        const d = op.datos || {};
        const previo = mock.gastos.get(d.id);
        if (previo && !(d.anulado && !previo.anulado)) return { id: op.id, ok: true, ya_estaba: true };
        mock.gastos.set(d.id, previo ? { ...previo, anulado: true, anulo: d.anulo, anulado_en: d.anulado_en } : { ...d });
        return { id: op.id, ok: true, creado: !previo };
      });
      return json({ ok: true, resultados });
    }
    if (sabe && e.ruta === 'jalar_gastos') return json({ ok: true, completa: true, gastos: [...mock.gastos.values()] });
    return json({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Camino desconocido.' });
  });
  return mock;
}

async function abrir({ ancho = 360, alto = 800, tema = 'claro', rol = 'direccion', version } = {}) {
  const touch = ancho < 760;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, locale: 'es-MX', timezoneId: 'America/Mexico_City',
    serviceWorkers: 'block', deviceScaleFactor: 2, ...(touch ? { hasTouch: true } : {}),
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(([r, t, tok, url]) => {
    try {
      localStorage.setItem('al3d_pf_rol', r);
      localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
      localStorage.setItem('al3d_tema', t);
      localStorage.setItem('al3d_pf_puente', JSON.stringify({ url, token: tok }));
    } catch (_) {}
  }, [rol, tema, TOKEN, B + '/puente']);
  const mock = await ponerPuente(ctx, { version, rol });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/#/hoy', { waitUntil: 'load' }); await esp(p, 900);
  await p.goto(B + '/#/control', { waitUntil: 'load' }); await esp(p, 1800);
  const toca = sel => (touch ? p.locator(sel).first().tap() : p.locator(sel).first().click());
  return { ctx, p, errs, mock, toca };
}

const desborde = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const alto = (p, sel) => p.$$eval(sel, l => l.map(e => Math.round(e.getBoundingClientRect().height)));
const texto = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
const cuenta = (p, clave) => p.$eval('#mod-control .pf-cuenta[data-cuenta="' + clave + '"] > b', e => e.textContent).catch(() => '');
const pesos = t => Number(String(t).replace(/[^\d.-]/g, ''));
/* Su color contra el fondo opaco de quien lo contiene, como en pf-control.mjs. */
const contraste = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s); if (!el) return null;
  const num = c => (c.match(/[\d.]+/g) || []).map(Number);
  const mezcla = (arriba, abajo) => { const a = arriba[3] == null ? 1 : arriba[3]; return [0, 1, 2].map(i => arriba[i] * a + abajo[i] * (1 - a)); };
  let fondo = [255, 255, 255];
  const cadena = []; for (let e = el; e; e = e.parentElement) cadena.push(e);
  for (const e of cadena.reverse()) { const b = num(getComputedStyle(e).backgroundColor); if (b.length && (b[3] == null || b[3] > 0)) fondo = mezcla(b, fondo); }
  const tinta = mezcla(num(getComputedStyle(el).color), fondo);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const a = L(tinta), b = L(fondo);
  return Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100;
}, sel);

async function capturar(c, d) {
  const { p, toca } = c;
  await toca('[data-act="gasto-nuevo"]'); await esp(p, 400);
  if (d.fecha) await p.fill('#ct-gas-fecha', d.fecha);
  await p.fill('#ct-gas-concepto', d.concepto);
  await p.selectOption('#ct-gas-cat', d.categoria);
  await p.fill('#ct-gas-monto', d.monto);
  if (d.cuenta) await p.selectOption('#ct-gas-cuenta', d.cuenta);
  if (d.folio) await p.fill('#ct-gas-folio', d.folio);
  await toca('[data-gs="guardar"]'); await esp(p, 600);
}

/* ══ 1 · Dirección, con la hoja al día ═══════════════════════════════════════ */
console.log('\nDIRECCIÓN CON LA HOJA EN LA 15 — capturar, mandar, anular');
{
  const c = await abrir();
  const { p, errs, mock, toca } = c;
  que(await p.locator('[data-tab="gastos"]').count() === 1, 'Control tiene la pestaña «Gastos»');
  /* Desde octubre de 2026 va en «Este mes», y el título de la sección ya dice qué mes es. */
  que(/Gastado/.test(await texto(p, '#mod-control .pf-cuenta[data-cuenta="gastado"]')), 'el Resumen dice lo gastado en el mes');
  que(await p.locator('#mod-control .pf-cuenta[data-cuenta="utilidad"]').count() === 1, '  y la utilidad aproximada');
  await toca('[data-tab="gastos"]'); await esp(p, 600);
  que(await p.locator('#ct-gastos-mes').count() === 1 && await p.locator('#ct-gastos').count() === 1, 'la pestaña abre con «Por categoría» y la lista');
  que(await p.locator('[data-gastos-sin-puente]').count() === 0, 'con la hoja en la 15 no dice «falta actualizar el puente»');
  que((await alto(p, '[data-act="gasto-nuevo"]'))[0] >= 44, '«Registrar gasto» mide 44 px o más');
  que(await p.locator('[data-csv-gastos]').count() === 1, 'dirección ve el CSV de gastos');

  /* El formulario, vacío: se dice junto al campo. */
  await toca('[data-act="gasto-nuevo"]'); await esp(p, 400);
  que(await p.locator('#pf-pide.show #ct-gas-concepto').count() === 1, 'el formulario abre en la capa de siempre (#pf-pide)');
  que(await p.$eval('#ct-gas-fecha', e => e.value) === hoyMx(), '  con la fecha de hoy puesta');
  que(await p.$eval('#ct-gas-cuenta', e => [...e.options].length) === 6, '  y las cinco cuentas de la hoja (más «efectivo u otra»)');
  await toca('[data-gs="guardar"]'); await esp(p, 300);
  que(!(await p.$eval('#ct-gas-error', e => e.hidden)) && /Escribe en qué se gastó/.test(await texto(p, '#ct-gas-error')),
    'sin concepto no guarda y lo dice junto al campo');
  que(await p.evaluate(() => document.activeElement && document.activeElement.id) === 'ct-gas-concepto', '  y el foco va al concepto');
  que(await p.$eval('#ct-gas-concepto', e => e.getAttribute('aria-invalid')) === 'true', '  marcado aria-invalid');
  que(Math.min(...await alto(p, '#pf-pide .pf-panel-f .btn')) >= 44, '  los botones del pie miden 44 px o más');
  await toca('[data-gs="cerrar"]'); await esp(p, 300);
  que(await p.locator('#pf-pide.show').count() === 0, '«Cancelar» cierra la capa');

  /* Guardar. */
  await capturar(c, { concepto: 'Lámina de acrílico 3 mm', categoria: 'Material', monto: '1,250.50', cuenta: 'Elias BBVA', folio: 'V-501' });
  que(await p.locator('#pf-pide.show').count() === 0, 'al guardar, la capa se cierra');
  await esp(p, 2600);   // el bombeo sale 1.5 s después y la pantalla se vuelve a leer
  que(mock.empujes.length === 1 && mock.empujes[0].datos.concepto === 'Lámina de acrílico 3 mm' && mock.empujes[0].datos.monto === 1250.5 &&
      mock.empujes[0].datos.cuenta === 'Elias BBVA' && mock.empujes[0].datos.folio === 'V-501',
    'el gasto llegó a /empujar_gastos con su monto, su cuenta y su folio', 'lo que llegó: ' + JSON.stringify(mock.empujes));
  que(mock.empujes.length === 1 && !('en_hoja' in mock.empujes[0].datos), '  sin las marcas de este teléfono');
  que(await p.locator('.ct-gas-fila').count() === 1 && /Lámina de acrílico/.test(await texto(p, '.ct-gas-fila')), 'la fila aparece en la lista');
  que(!/por mandar/.test(await texto(p, '.ct-gas-fila')), '  y ya no dice «por mandar»: está en la hoja');
  que(/Material/.test(await texto(p, '.ct-gas-cat')) && /1,250\.50/.test(await texto(p, '.ct-gas-cat')), '«Por categoría» suma Material $1,250.50');
  que(pesos(await cuenta(p, 'mes')) === 1250.5, 'el total del mes dice $1,250.50');
  const vendido = pesos(await texto(p, '#mod-control .pf-cuenta[data-cuenta="utilidad"] em'));
  que(pesos(await cuenta(p, 'utilidad')) === Math.round((vendido - 1250.5) * 100) / 100, 'la utilidad aproximada es lo vendido menos lo gastado');

  /* Sin señal: se guarda igual y dice «por mandar». */
  await c.ctx.setOffline(true);
  await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await capturar(c, { concepto: 'Gasolina de la camioneta', categoria: 'Transporte y gasolina', monto: '800' });
  await esp(p, 2000);
  que(mock.empujes.length === 1, 'sin señal no sale nada');
  que(await p.locator('.ct-gas-fila').count() === 2 && /por mandar/.test(await texto(p, '.ct-gas-fila')), 'la fila nueva está y dice «por mandar»');
  que(/esperan? para mandarse/.test(await texto(p, '.ct-gas-aviso')), '  y arriba se dice que espera señal, sin perderse');
  await c.ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await esp(p, 3500);
  que(mock.empujes.some(o => o.datos.concepto === 'Gasolina de la camioneta'), 'al volver la señal sale solo');

  /* Anular. */
  await toca('[data-gasto-anular]'); await esp(p, 400);
  que(await p.locator('#pf-confirma.show').count() === 1, '«Anular» pregunta con la capa de la app');
  await toca('#pf-confirma-si'); await esp(p, 2800);
  const anul = mock.empujes.find(o => o.datos.anulado === true);
  que(!!anul && Array.isArray(anul.campos) && anul.campos.includes('anulado'), 'la anulación llegó al puente');
  que(await p.locator('.ct-gas-fila.anulado').count() === 1 && /anulado/.test(await texto(p, '.ct-gas-fila.anulado')), 'la fila se queda, marcada «anulado»');
  que(await p.locator('.ct-gas-fila').count() === 2, '  y no se borró ninguna');

  que(await desborde(p) <= 0, 'sin desborde a 360 px');
  for (const [sel, nombre] of [['.ct-gas-cat-t small', 'el «antes» de la categoría'], ['.ct-gas-fila .pf-fila-d', 'el detalle de la fila'],
                               ['.ct-gas-fila .pf-sem', 'la etiqueta de la fila'], ['.ct-gas-cat-v', 'el importe de la categoría']]) {
    const k = await contraste(p, sel);
    que(k === null || k >= 4.5, nombre + ': contraste ' + k + ':1');
  }
  que(errs.length === 0, 'cero errores de página', 'errores: ' + [...new Set(errs)].slice(0, 3).join(' | '));
  await c.ctx.close();
}

/* ══ 2 · Pagos y la computadora oscura ═════════════════════════════════════ */
console.log('\nPAGOS, A 1200 PX Y EN OSCURO');
{
  const c = await abrir({ rol: 'pagos', ancho: 1200, tema: 'oscuro' });
  const { p, errs, toca } = c;
  await toca('[data-tab="gastos"]'); await esp(p, 600);
  que(await p.locator('[data-act="gasto-nuevo"]').count() === 1, 'pagos ve la pestaña y puede registrar');
  que(await p.locator('[data-csv-gastos]').count() === 0, 'pero no tiene el CSV de gastos (como el de ventas)');
  await capturar(c, { concepto: 'Renta del local', categoria: 'Renta y servicios', monto: '9500', cuenta: 'Rul HSBC' });
  await esp(p, 2400);
  que(await p.locator('.ct-gas-fila').count() === 1, 'el gasto de pagos queda en la lista');
  que(await desborde(p) <= 0, 'sin desborde a 1200 px');
  for (const sel of ['.ct-gas-cat-t', '.ct-gas-cat-t small', '.ct-gas-fila .pf-fila-t', '.ct-gas-fila .pf-fila-d']) {
    const k = await contraste(p, sel);
    que(k === null || k >= 4.5, 'oscuro · ' + sel + ': contraste ' + k + ':1');
  }
  que(errs.length === 0, 'cero errores de página', 'errores: ' + [...new Set(errs)].slice(0, 3).join(' | '));
  await c.ctx.close();
}

/* ══ 3 · Una hoja que todavía corre la 14 ═══════════════════════════════════ */
console.log('\nCONTRA UNA HOJA EN LA 14 — «falta actualizar el puente», y nada truena');
{
  const c = await abrir({ version: 'puente-sheets-14' });
  const { p, errs, mock, toca } = c;
  await toca('[data-tab="gastos"]'); await esp(p, 600);
  /* La bajada de la entrada ya preguntó /salud o /jalar_gastos; si no, «Traer la hoja». */
  if (!(await p.locator('[data-gastos-sin-puente]').count())) {
    const b = p.locator('[data-act="hoja-traer"]');
    if (await b.count()) { await b.first().click(); await esp(p, 2500); }
  }
  que(await p.locator('[data-gastos-sin-puente]').count() === 1 && /Falta actualizar el puente/.test(await texto(p, '[data-gastos-sin-puente]')),
    'la pestaña dice «Falta actualizar el puente»');
  que(await p.locator('.pf-cuenta[data-cuenta="mes"]').count() === 1, '  y sigue sumando: las cuentas están');
  await capturar(c, { concepto: 'Volantes', categoria: 'Publicidad', monto: '450' });
  await esp(p, 2600);
  que(await p.locator('.ct-gas-fila').count() === 1, 'el gasto se guarda en este teléfono');
  que(/espera la pestaña/.test(await texto(p, '.ct-gas-fila')), '  y la fila dice que espera la pestaña');
  que(!mock.rutas.includes('empujar_gastos'), 'no se le manda a una hoja que no lo sabe recibir');
  que(errs.length === 0, 'cero errores de página', 'errores: ' + [...new Set(errs)].slice(0, 3).join(' | '));
  await c.ctx.close();
}

await nav.close();
console.log(fallos ? '\n' + fallos + ' fallo(s) en Gastos.' : '\nGastos: se captura, viaja a la hoja, se anula sin borrarse y una hoja vieja lo dice sin tronar.');
process.exit(fallos ? 1 : 0);
