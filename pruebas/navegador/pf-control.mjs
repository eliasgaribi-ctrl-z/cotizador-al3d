/* CONTROL: LAS CUENTAS QUE LLEVAN A ALGO Y RUEDAN, «TRAER LA HOJA» CON SU AVANCE, LAS DOCE BARRAS
 * QUE CRECEN UNA VEZ, EL SALDO CON SU MEDIDOR Y LAS COMISIONES, PRIMERO LAS CHICAS.
 *
 * Control es la pantalla del dinero y se abre delante del cliente, en un teléfono de gama media.
 * Lo que defiende este archivo es que cada gesto nuevo tenga SU alternativa —el toque simple, el
 * teclado— y que NADA escriba dinero sin que alguien lo haya querido. Se prueba con las tres
 * manos que usan la app (ratón, dedo con eventos táctiles de verdad, y teclado):
 *
 *   · P3  · cada cuenta con algo que contar es un botón que baja a su tarjeta (y la enciende una
 *           vez con las esquinas de la pieza 17) o abre su pestaña; con 0 no lleva a ningún lado;
 *   · P18 · las cuentas ruedan cuando algo cambió frente a ti y NUNCA al entrar ni al cambiar de
 *           pestaña; el importe queda bien escrito desde el primer cuadro;
 *   · P16 · «Traer la hoja» se vuelve la ficha de lo que pasa: página, reloj, relleno que avanza,
 *           verde con «N cambios» o rojo con «Reintentar»; la pantalla NO se repinta mientras baja
 *           (solo el botón); la bajada silenciosa de la entrada no lo enciende, pero un toque la
 *           enciende; un repintado a media bajada le devuelve su estado al botón nuevo;
 *   · P27 · las doce barras nacen en cero y crecen UNA vez, al verse; el buscador que repinta no
 *           las vuelve a mover; cada mes con algo es un botón que abre un globo con sus ventas y su
 *           total, igual al de la barra; un mes en cero no es botón;
 *   · P30 · cada saldo por cobrar lleva su medidor quieto con el porcentaje escrito, y rayado y con
 *           la palabra «estimado» cuando el saldo no es el de la hoja;
 *   · F54 · comisiones, primero las chicas: con un monto, se marcan las que alcanzan completas
 *           empezando por las más chicas; «Pagar estas» ARMA LA LISTA (copiar / WhatsApp) y no
 *           escribe NADA: ni en la base ni en el puente; la lista se cae si cambia el monto;
 *   y en todas las medidas: 360 y 420 px, claro y oscuro, con y sin movimiento reducido, sin
 *   errores de página, sin desborde horizontal, con contraste de 4.5:1 en lo nuevo y sin nada
 *   animándose en bucle en reposo.
 *
 * El puente es de mentiras (`ctx.route`): contesta como el Apps Script de la hoja, con páginas de
 * una fila y una demora configurable, para ver el avance sin depender de la red.
 *
 * Uso:  PUERTO=8925 node pruebas/navegador/pf-control.mjs
 *       SOLO=p3,p16 PUERTO=8925 node pruebas/navegador/pf-control.mjs   (solo esas secciones)
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const TOKEN = 'tok-de-control';

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const que = (ok, msg, alRevés) => (ok ? bien(msg) : mal(alRevés || msg));
const esp = (p, ms) => p.waitForTimeout(ms);
const SOLO = (process.env.SOLO || '').split(',').map(x => x.trim()).filter(Boolean);
const activa = id => !SOLO.length || SOLO.includes(id);
const titulo = (id, t) => { if (activa(id)) console.log('\n' + t); };

/* ---------------------------------------------------------------------------
   El puente de mentiras. Contesta lo mismo que el Apps Script —todo entra por POST a la misma
   dirección, con la ruta en el cuerpo— y cada `jalar` es una página de UNA fila, con demora, para
   que el avance del botón se pueda ver y medir. `fallaEnPagina` hace que esa página conteste
   «La hoja no contestó» tantas veces como diga `vecesFalla`.
   --------------------------------------------------------------------------- */
const ESCRIBIBLES = ['Proyecto', 'Precio Subtotal', 'IVA', 'Anticipo', 'Liquidacion', 'Abono Comision', 'Estatus', 'Cuenta ',
  'Fecha Anticipo e Instalacion', 'Fecha Liquidacion', 'Folio cotizacion', 'Etapa de obra', 'Fecha instalacion', 'Hora instalacion',
  'Ubicacion', 'Direccion', 'Tipo de trabajo'];
const filaHoja = (id, nombre, o = {}) => ({ id_notion: id, editado: null, 'Proyecto': nombre, 'Cuenta ': 'Elias BBVA',
  'Estatus': 'LIQUIDADO', 'Tipo de trabajo': ['Letras 3D con iluminacion'], 'IVA': true,
  'Precio Subtotal': 25000, 'Precio Neto ': 29000, 'Anticipo': 15000, 'Liquidacion': 14000, 'Pago Pendiente': 0,
  'Comisiones': 2500, 'Abono Comision': 2500, 'Comision Restante': 0, 'Porcentaje comision': null,
  'Fecha Anticipo e Instalacion': new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }).slice(0, 7) + '-01',
  'Fecha instalacion': null, 'Fecha Liquidacion': null, 'Folio cotizacion': '', 'Etapa de obra': null,
  'Hora instalacion': '', 'Ubicacion': '', 'Direccion': '', ...o });

async function ponerPuente(ctx) {
  const mock = { jalar: 0, empujar: 0, paginas: 4, demora: 350, fallaEnPagina: 0, vecesFalla: 0 };
  await ctx.route(B + '/puente', async route => {
    let e = {}; try { e = JSON.parse(route.request().postData() || '{}'); } catch (_) {}
    const json = o => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (e.token !== TOKEN) return json({ ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Token desconocido' });
    if (e.ruta === 'salud') return json({ ok: true, ts: Date.now(), version: 'falso-1', rol: 'direccion', escribibles: ESCRIBIBLES, destino: 'google-sheets' });
    if (e.ruta === 'esquema') return json({ ok: true, faltan: [], accesos: false, nota: '' });
    if (e.ruta === 'empujar') { mock.empujar++; return json({ ok: true, resultados: [] }); }
    if (e.ruta === 'jalar') {
      mock.jalar++;
      const pag = e.cursor ? Number(String(e.cursor).slice(1)) : 1;
      await new Promise(r => setTimeout(r, mock.demora));
      if (mock.fallaEnPagina && pag === mock.fallaEnPagina && mock.vecesFalla > 0) {
        mock.vecesFalla--;
        return json({ ok: false, codigo: 'SIN_RED', mensaje: 'La hoja no contestó' });
      }
      return json({ ok: true, hay_mas: pag < mock.paginas, cursor: pag < mock.paginas ? 'p' + (pag + 1) : null,
        registros: [{ almacen: 'proyectos', datos: filaHoja('V-9' + pag + '0', 'Hoja página ' + pag) }] });
    }
    return json({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'ruta no simulada' });
  });
  return mock;
}

/* Dirección con nombre: es el rol que ve el dinero y puede decidir. */
async function abrir({ ancho = 360, alto = 780, tema = 'claro', rm = false, rol = 'direccion', touch = true, puente = false } = {}) {
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block',
    deviceScaleFactor: 2,
    permissions: ['clipboard-read', 'clipboard-write'],
    ...(touch ? { hasTouch: true } : {}),
    ...(rm ? { reducedMotion: 'reduce' } : {}),
  });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(([r, t, pu, tok, url]) => {
    try {
      localStorage.setItem('al3d_pf_rol', r);
      localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
      localStorage.setItem('al3d_tema', t);
      if (pu) localStorage.setItem('al3d_pf_puente', JSON.stringify({ url, token: tok }));
    } catch (_) {}
  }, [rol, tema, puente, TOKEN, B + '/puente']);
  const mock = puente ? await ponerPuente(ctx) : null;
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  return { ctx, p, errs, mock };
}

const irA = async (p, hash, espera = 1300) => {
  const destino = B + '/' + hash;
  if (p.url() === destino) await p.reload({ waitUntil: 'load' });
  else await p.goto(destino, { waitUntil: 'load' });
  await esp(p, espera);
};

/* El récord de la hoja de la prueba, sembrado directo en el espejo `ventas_hoja` (es lo que baja el
   puente) con fechas RELATIVAS a hoy, para que «este mes» sea este mes cuando se corra. Cada fila
   cuenta una cosa distinta:
     V-101 Gym Titanio       este mes, liquidada, comisión $6,940
     V-102 Café Barrio       este mes, liquidada, comisión $600 (la más chica con V-109)
     V-103 Dental Sonrisa    hace 1 mes, liquidada, comisión $1,700.40 (con centavos)
     V-104 Barbería El Toro  hace 1 mes, COBRANDO, saldo de la hoja $5,394 (50 % cobrado)
     V-105 Farmacia Guadal.  hace 2 meses, liquidada
     V-106 Óptica Visión     hace 3 meses, COBRANDO, ya instalada, SIN saldo de la hoja: estimado
     V-107 Panadería         hace 4 meses, liquidada, comisión $1,215
     V-108 Taquería El Güero hace 5 meses, liquidada
     V-109 Papelería Centro  hace 6 meses, liquidada, la hoja ya abonó $200: quedan $210 de $410
     V-110/V-111             dos que no se dieron (este mes y hace 2 meses)
     V-112 Boutique Aurora   hace 7 meses, liquidada, comisión $3,100
     V-113 Clínica Norte     hace 8 meses, COBRANDO, saldo de la hoja $9,000 (49 % cobrado)
     V-114 Ferretería Sur    hace 10 meses, liquidada, comisión $770
   Los meses hace 9 y hace 11 quedan en cero: no llevan barra ni botón. */
async function sembrar(p) {
  return p.evaluate(async () => {
    const DB = await import('./js/datos/db.js');
    const F = await import('./js/nucleo/fechas.js');
    const hoy = F.hoyISO();
    const dia = (n, d) => F.masMeses(hoy.slice(0, 7) + '-01', -n).slice(0, 7) + '-' + String(d).padStart(2, '0');
    const fila = (id, nombre, n, d, sub, o = {}) => ({ id: 'hoja:' + id, folio_hoja: id, folio_cotizacion: '', nombre,
      fecha_anticipo: dia(n, d), sub, neto: Math.round(sub * 1.16), anticipo: Math.round(sub * 1.16 * .5), estatus: 'LIQUIDADO',
      pago_pendiente: 0, comisiones: sub / 10, comision_restante: sub / 10, cuenta: 'BBVA', tipo_trabajo: [], etapa: null, ...o });
    const filas = [
      fila('V-101', 'Gym Titanio', 0, 1, 69400),
      fila('V-102', 'Café Barrio', 0, 1, 6000),
      fila('V-103', 'Dental Sonrisa', 1, 8, 17004),
      fila('V-104', 'Barbería El Toro', 1, 12, 9300, { estatus: 'COBRANDO', pago_pendiente: 5394, comision_restante: 930 }),
      fila('V-105', 'Farmacia Guadalupe', 2, 4, 13800),
      fila('V-106', 'Óptica Visión', 3, 9, 12000, { estatus: 'COBRANDO', pago_pendiente: null, comision_restante: 1200, etapa: 'instalado' }),
      fila('V-107', 'Panadería La Espiga', 4, 2, 12150),
      fila('V-108', 'Taquería El Güero', 5, 14, 22000),
      fila('V-109', 'Papelería Centro', 6, 20, 4100, { comisiones: 410, comision_restante: 210 }),
      fila('V-110', 'Cancelada Uno', 0, 1, 8000, { etapa: 'cancelado' }),
      fila('V-111', 'Cancelada Dos', 2, 9, 5000, { etapa: 'cancelado' }),
      fila('V-112', 'Boutique Aurora', 7, 3, 31000),
      fila('V-113', 'Clínica Norte', 8, 3, 15500, { estatus: 'COBRANDO', pago_pendiente: 9000, comision_restante: 1550 }),
      fila('V-114', 'Ferretería Sur', 10, 17, 7700),
    ];
    for (const f of filas) await DB.poner('ventas_hoja', f);
    return filas.length;
  });
}

/* Cotizaciones autorizadas sin decidir: es lo que cuenta «Autorizado sin decidir». */
const sinDecidir = (p, n) => p.evaluate(k => {
  const fila = i => ({ folio: 'COT-71' + String(i).padStart(2, '0'), cliente: 'Cliente pendiente ' + i, proy: 'Letrero',
    ts: Date.now() - 9 * 86400000, estado: 'autorizada', neto: 5000 + i, itemsAuth: { 1: 5000 + i },
    items: [{ id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8 }] });
  localStorage.setItem('al3d_historial', JSON.stringify(Array.from({ length: k }, (_, i) => fila(i + 1))));
}, n);

/* Lo que llega «de otro teléfono»: una fila más en el espejo, y el router remonta la pantalla en
   silencio con la misma señal que usan el historial y la cola. */
const llegaOtra = (p, id, nombre, sub, o = {}) => p.evaluate(async ([i, n, s, extra]) => {
  const DB = await import('./js/datos/db.js');
  const F = await import('./js/nucleo/fechas.js');
  const hoy = F.hoyISO();
  await DB.poner('ventas_hoja', { id: 'hoja:' + i, folio_hoja: i, folio_cotizacion: '', nombre: n, fecha_anticipo: hoy.slice(0, 7) + '-01',
    sub: s, neto: Math.round(s * 1.16), anticipo: Math.round(s * 1.16 * .5), estatus: 'LIQUIDADO', pago_pendiente: 0,
    comisiones: s / 10, comision_restante: s / 10, cuenta: 'BBVA', tipo_trabajo: [], etapa: null, ...extra });
}, [id, nombre, sub, o]);
const remontar = async p => {
  await p.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'al3d_historial' })));
  await esp(p, 1500);
};

/* Entrar a Control con datos. */
async function entrar(o = {}) {
  const c = await abrir(o);
  await irA(c.p, '#/hoy', 900);
  if (o.sembrar !== false) await sembrar(c.p);
  if (o.decidir) await sinDecidir(c.p, o.decidir);
  await irA(c.p, '#/control', o.espera || 1500);
  return c;
}

const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => { try { return a.effect.getComputedTiming().iterations === Infinity; } catch (_) { return false; } })
  .map(a => { const t = a.effect && a.effect.target; return (t && (t.id || t.className)) || a.animationName || '?'; }));
const desborde = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const caja = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; });
const tab = async (p, t) => { await p.locator('[data-tab="' + t + '"]').tap(); await esp(p, 500); };
const cuentas = p => p.evaluate(() => [...document.querySelectorAll('#mod-control .pf-cuenta[data-cuenta]')].map(e => ({
  clave: e.dataset.cuenta, tag: e.tagName, va: e.dataset.va || '', n: e.querySelector(':scope > b').textContent,
  flecha: getComputedStyle(e.querySelector('.pf-cuenta-t'), '::after').content,
  nombre: e.textContent.replace(/\s+/g, ' ').trim() })));
const money = n => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pesos = t => Number(String(t).replace(/[^\d.]/g, ''));
const lim = t => String(t || '').replace(/\s+/g, ' ').trim();

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

/* Las esquinas de la pieza 17 esperan a que el scroll termine antes de volar, y se van solas ~1 s
   después. Los nodos de la pieza se REUSAN (quedan en el documento, escondidos): lo que dice que
   se ven es su clase `.ve`. */
const aparece = p => p.waitForSelector('.mira.ve', { state: 'attached', timeout: 3500 }).then(() => true, () => false);
const seApaga = p => p.waitForFunction(() => !document.querySelector('.mira.ve'), null, { timeout: 4500 }).then(() => true, () => false);

/* Las animaciones de una barra de la gráfica (lo único que debe moverse al verse). */
const animsDeBarras = p => p.evaluate(() => document.getAnimations()
  .filter(a => { const t = a.effect && a.effect.target; return t && t.classList && t.classList.contains('ct-b'); }).length);
const escalaBarra = (p, sel) => p.evaluate(s => {
  const e = document.querySelector(s); if (!e) return null;
  const m = /matrix\(([-\d.e]+)/.exec(getComputedStyle(e).transform);
  return m ? +m[1] : 1;      // `none` es escala 1
}, sel);

/* ══ 1 · P3 · LAS CUENTAS QUE LLEVAN A LO QUE CUENTAN ═══════════════════════ */
titulo('p3', 'P3 · CADA CUENTA CON ALGO QUE CONTAR ES UNA PUERTA');
if (activa('p3')) {
  const c = await entrar({ touch: true, decidir: 1 });
  const { p, errs } = c;
  const hoyYm = await p.evaluate(async () => (await import('./js/nucleo/fechas.js')).hoyISO().slice(0, 7));
  const ym1 = await p.evaluate(async () => { const F = await import('./js/nucleo/fechas.js'); return F.masMeses(F.hoyISO().slice(0, 7) + '-01', -1).slice(0, 7); });
  let d = await cuentas(p);
  const de = k => d.find(x => x.clave === k) || {};
  que(['mes', 'ant', 'pipe', 'cobrar', 'conv', 'perdido'].every(k => de(k).clave), 'las seis cuentas de Ventas llevan su clave (' + d.map(x => x.clave).join(', ') + ')');
  que(de('mes').tag === 'BUTTON' && de('mes').va === 'lista:mes', '«Vendido en este mes» es un botón que lleva a la lista del mes');
  que(de('ant').tag === 'BUTTON' && de('ant').va === 'mes:' + ym1, '«Vendido el mes pasado» lleva a su renglón en las doce barras');
  que(de('pipe').tag === 'BUTTON' && de('pipe').va === 'ir:proyectos', '«Autorizado sin decidir» (con una sin decidir) lleva a Proyectos, donde se decide');
  que(de('cobrar').tag === 'BUTTON' && de('cobrar').va === 'tab:cobrar', '«Por cobrar» abre la pestaña de Por cobrar');
  que(de('perdido').tag === 'BUTTON' && de('perdido').va === 'mes:' + hoyYm, '«No se dio» lleva al renglón del mes en las barras');
  que(de('conv').tag === 'P', 'la conversión es un porcentaje y no una lista: sigue siendo un párrafo');
  que(['mes', 'ant', 'pipe', 'cobrar', 'perdido'].every(k => /›/.test(de(k).flecha)), 'cada botón lleva la flecha de «ir» tras su etiqueta');
  que(/ver las ventas de/.test(de('mes').nombre) && /abrir Por cobrar/.test(de('cobrar').nombre),
    'el nombre que oye el lector dice A DÓNDE lleva («' + de('cobrar').nombre.slice(-40) + '»)');
  que(de('conv').flecha === 'none' || !/›/.test(de('conv').flecha), 'y la que no lleva a ningún lado no lleva flecha');

  /* «Por cobrar»: abre su pestaña, baja a la cartera, la enciende UNA vez y deja el foco ahí. */
  await p.locator('#mod-control [data-va="tab:cobrar"]').tap();
  que(await aparece(p), '«Por cobrar» enciende la cartera con las esquinas de la pieza 17');
  que(await seApaga(p), 'las esquinas se van solas: se enciende UNA vez');
  const t1 = await p.evaluate(() => ({ on: document.querySelector('[data-tab="cobrar"]').getAttribute('aria-pressed'),
    foco: !!(document.activeElement && document.activeElement.closest('#ct-cartera > .card-h')),
    arriba: document.querySelector('#ct-cartera').getBoundingClientRect().top, alto: innerHeight }));
  que(t1.on === 'true', 'la pestaña de Por cobrar quedó elegida');
  que(t1.foco, 'con el foco puesto en el título de la cartera, para quien navega con teclado o lector');
  que(t1.arriba < t1.alto, 'y la cartera a la vista (a ' + Math.round(t1.arriba) + ' de ' + t1.alto + ')');
  que((await infinitas(p)).length === 0, 'nada gira ni late en bucle después');

  /* Dentro de Por cobrar: el total y los instalados llevan, los anticipos no. */
  d = await cuentas(p);
  que(de('total').tag === 'BUTTON' && de('total').va === 'cartera', 'en Por cobrar, el total lleva a la cartera');
  que(de('instalado').tag === 'BUTTON' && de('instalado').va === 'instalado', 'y «Ya instalado y sin liquidar» al primer instalado');
  que(de('anticipos').tag === 'P', 'los anticipos pactados son una suma: párrafo, sin flecha');
  await p.locator('#mod-control [data-va="instalado"]').tap();
  que(await aparece(p), '«Ya instalado» enciende su renglón');
  await seApaga(p);
  const t2 = await p.evaluate(() => ({ foco: document.activeElement && document.activeElement.hasAttribute('data-instalado') }));
  que(t2.foco, 'y el foco cae en el renglón del proyecto instalado');
  await tab(p, 'ventas');

  /* «Vendido en este mes»: la lista cambia a «Este mes» para que cuadre con la cifra. */
  await p.locator('#mod-control [data-va="lista:mes"]').tap();
  que(await aparece(p), '«Vendido en este mes» enciende la lista de ventas');
  await seApaga(p);
  que((await p.locator('[data-periodo="mes"][aria-pressed="true"]').count()) === 1,
    'y pone el periodo en «Este mes»: la lista a la que llega es la que cuenta la cifra');
  const nFilas = await p.locator('#ct-lista .ct-fila').count();
  que(nFilas === 3, 'con las 3 filas del mes (2 vendidas y 1 que no se dio): ' + nFilas);

  /* «Vendido el mes pasado»: su renglón en las doce barras, con el foco en su botón. */
  await p.evaluate(() => window.scrollTo(0, 0)); await esp(p, 300);
  await p.locator('#mod-control [data-va="mes:' + ym1 + '"]').tap();
  que(await aparece(p), '«Vendido el mes pasado» enciende su renglón en las barras');
  await seApaga(p);
  const t3 = await p.evaluate(() => document.activeElement && document.activeElement.id);
  que(t3 === 'ct-mes-' + ym1, 'con el foco en el botón de ese mes (' + t3 + ')');

  /* Con teclado: Enter en una cuenta hace lo mismo que el dedo. */
  await p.evaluate(() => window.scrollTo(0, 0)); await esp(p, 300);
  await p.locator('#mod-control [data-va="mes:' + hoyYm + '"]').focus();
  await p.keyboard.press('Enter');
  que(await aparece(p), 'con teclado, Enter en «No se dio» también lo lleva a su mes');
  await seApaga(p);
  que((await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'ct-mes-' + hoyYm, 'y el foco llega a su botón');

  /* «Sin decidir» abre Proyectos. */
  await p.evaluate(() => window.scrollTo(0, 0)); await esp(p, 300);
  await p.locator('#mod-control [data-va="ir:proyectos"]').tap();
  await esp(p, 900);
  que(/#\/proyectos/.test(p.url()), '«Autorizado sin decidir» navega a Proyectos (' + p.url().split('#')[1] + ')');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Con ratón: un clic hace lo mismo que el toque. */
  const m = await entrar({ touch: false });
  await m.p.locator('#mod-control [data-va="tab:cobrar"]').click();
  que(await aparece(m.p), 'con el ratón, un clic también enciende su destino');
  await m.ctx.close();

  /* Con 0 no lleva a ningún lado: ni botón ni flecha. */
  const v = await entrar({ touch: true, sembrar: false });
  d = await cuentas(v.p);
  que(d.length >= 6 && d.every(x => x.tag === 'P' && !/›/.test(x.flecha)),
    'sin una sola venta, las ' + d.length + ' cuentas de Ventas son párrafos sin flecha: no llevan a ningún lado');
  await tab(v.p, 'cobrar');
  d = await cuentas(v.p);
  que(d.length === 3 && d.every(x => x.tag === 'P'), 'y las tres de Por cobrar también');
  que(v.errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(v.errs)].slice(0, 2).join(' | '));
  await v.ctx.close();

  /* Con menos movimiento: un aro fijo, sin vuelo, y llega igual. */
  const r = await entrar({ touch: true, rm: true });
  await r.p.locator('#mod-control [data-va="tab:cobrar"]').tap();
  que(await aparece(r.p), 'con menos movimiento las esquinas también aparecen (como aro fijo)');
  que((await r.p.evaluate(() => document.querySelector('[data-tab="cobrar"]').getAttribute('aria-pressed'))) === 'true', 'y la pestaña se abre');
  await r.ctx.close();
}

/* ══ 2 · P18 · LAS CUENTAS RUEDAN CUANDO ALGO CAMBIÓ, NUNCA AL ENTRAR ══════ */
titulo('p18', 'P18 · LAS CUENTAS RUEDAN CUANDO LA SINCRONIZACIÓN CAMBIA ALGO');
if (activa('p18')) {
  const c = await entrar({ touch: true });
  const { p, errs } = c;
  const observar = () => p.evaluate(() => {
    window.__giro = { cifra: false, claves: [] };
    new MutationObserver(ms => {
      for (const m of ms) {
        const t = m.target;
        if (t.classList && t.classList.contains('rueda-rodando')) {
          const cu = t.closest('.pf-cuenta[data-cuenta]');
          if (cu) { window.__giro.cifra = true; window.__giro.claves.push(cu.dataset.cuenta); }
        }
      }
    }).observe(document.getElementById('mod-control'), { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  const rueda = () => p.evaluate(() => !!document.querySelector('#mod-control .pf-cuenta .rueda-rodando, #mod-control .pf-cuenta .rueda-vista'));
  que(!(await rueda()), 'al entrar a la pantalla ninguna cuenta rueda');
  const antes = (await cuentas(p)).find(x => x.clave === 'mes').n;
  que((await p.$$eval('#mod-control .pf-cuenta[data-cuenta] > b', e => e.length)) >= 6, 'las cuentas llevan su clave: un cambio SÍ rueda');
  await observar();
  /* Llega «algo de otro teléfono»: una venta más este mes. */
  await llegaOtra(p, 'V-199', 'Llegó de otro teléfono', 10000);
  await remontar(p);
  const g = await p.evaluate(() => window.__giro);
  que(g.cifra && g.claves.includes('mes'), 'si la sincronización remonta la pantalla y «Vendido en este mes» cambió delante de ti, rueda (' + g.claves.join(', ') + ')');
  const despues = (await cuentas(p)).find(x => x.clave === 'mes').n;
  que(pesos(despues) === pesos(antes) + 11600 && /\.\d\d$/.test(despues),
    'con el importe bien escrito, con sus dos decimales: ' + antes + ' → ' + despues);
  que(!g.claves.includes('conv') && !g.claves.includes('anticipos'), 'y solo ruedan las que cambiaron (no la conversión)');
  /* El importe no pierde su tamaño ajustado: la rueda no cambia la caja. */
  const ajusta = await p.evaluate(() => { const b = document.querySelector('#mod-control .pf-cuenta[data-cuenta="mes"] > b'); return { clase: b.className, c: b.style.getPropertyValue('--c') }; });
  que(/ajusta/.test(ajusta.clase) && Number(ajusta.c) >= 9, 'el importe conserva su ancho ajustado `--c` (' + ajusta.clase + ' · ' + ajusta.c + ')');

  /* Cambiar de pestaña es entrar a ella: lo que cambió mientras estaba en otra no rueda. */
  await tab(p, 'cobrar');
  await llegaOtra(p, 'V-198', 'Otra más', 20000);
  await remontar(p);
  await observar();
  await tab(p, 'ventas');
  await esp(p, 400);
  const g2 = await p.evaluate(() => window.__giro);
  que(!g2.cifra, 'al volver a «Ventas» después de un cambio que pasó en otra pestaña, sus cuentas NO ruedan');
  /* Y un cambio que sí pasa frente a ella, rueda otra vez. */
  await observar();
  await llegaOtra(p, 'V-197', 'Y otra', 5000);
  await remontar(p);
  que((await p.evaluate(() => window.__giro.cifra)), 'pero un cambio que pasa frente a quien mira, rueda');

  /* Entrar de verdad NO rueda: se sale, algo cambia por otro lado y se vuelve. */
  await irA(c.p, '#/proyectos', 1200);
  await llegaOtra(p, 'V-196', 'Cambió mientras no mirabas', 8000);
  await irA(c.p, '#/control', 300);
  await esp(p, 900);
  que(!(await rueda()), 'al volver a entrar después de un cambio, el primer pintado NO rueda');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Con menos movimiento la cifra no rueda y el número queda bien escrito. */
  const r = await entrar({ touch: true, rm: true });
  await r.p.evaluate(() => {
    window.__giro = { cifra: false };
    new MutationObserver(ms => { for (const m of ms) if (m.target.classList && m.target.classList.contains('rueda-rodando')) window.__giro.cifra = true; })
      .observe(document.getElementById('mod-control'), { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  await llegaOtra(r.p, 'V-195', 'Otro más', 10000);
  await remontar(r.p);
  que(!(await r.p.evaluate(() => window.__giro.cifra)), 'con menos movimiento la cifra NO rueda');
  que(/\$99,064\.00|\$\d/.test((await cuentas(r.p)).find(x => x.clave === 'mes').n), 'y el importe queda escrito');
  await r.ctx.close();
}

/* ══ 3 · P16 · «TRAER LA HOJA» QUE ENSEÑA SU AVANCE ═════════════════════════ */
titulo('p16', 'P16 · «TRAER LA HOJA» ENSEÑA SU AVANCE');
if (activa('p16')) {
  const estadoBoton = p => p.evaluate(() => {
    const b = document.querySelector('[data-act="hoja-traer"]'); if (!b) return null;
    const lim = t => String(t || '').replace(/\s+/g, ' ').trim();
    const rel = b.querySelector('.trabajo-relleno'); let sx = null;
    if (rel) { const m = /matrix\(([-\d.e]+)/.exec(getComputedStyle(rel).transform); sx = m ? +m[1] : 0; }
    return { estado: b.dataset.estado || '', texto: lim((b.querySelector('.estado-t') || b).textContent), reloj: lim((b.querySelector('.trabajo-reloj') || {}).textContent),
      sx, dis: b.disabled, ariaDis: b.getAttribute('aria-disabled'), palomita: !!b.querySelector('.palomita'), todo: lim(b.textContent) };
  });
  const hasta = async (p, f, ms = 9000) => {
    const t0 = Date.now(), traza = [];
    while (Date.now() - t0 < ms) {
      const s = await estadoBoton(p);
      if (s) traza.push(s);
      if (s && f(s)) return { ok: true, s, traza };
      await esp(p, 80);
    }
    return { ok: false, s: traza[traza.length - 1], traza };
  };

  /* El app baja la hoja por su cuenta al arrancar y cada 30 s (`sincronizarCallado`), con las mismas
     páginas del mismo puente de mentiras: antes de medir lo que hace el botón se espera a que esa
     bajada se calle, y se ponen los contadores en cero. */
  const asentar = async c => {
    let ult = -1, quieto = 0;
    for (let i = 0; i < 60 && quieto < 12; i++) {
      await esp(c.p, 150);
      if (c.mock.jalar === ult) quieto++; else { quieto = 0; ult = c.mock.jalar; }
    }
    c.mock.jalar = 0; c.mock.empujar = 0;
    await esp(c.p, 300);
  };

  /* A · La bajada que arranca sola no enciende el botón; un toque la enciende donde ya iba. */
  const c = await abrir({ touch: true, puente: true });
  c.mock.demora = 500;
  const { p, errs, mock } = c;
  await irA(p, '#/hoy', 900);
  await sembrar(p);
  await irA(p, '#/control', 600);
  const e0 = await estadoBoton(p);
  que(e0 && !e0.estado && !e0.dis && !e0.ariaDis, 'la bajada que arranca sola al entrar NO enciende el botón: sigue tocable y sin estado (' + (e0 && e0.todo) + ')');
  await esp(p, 500);
  que(mock.jalar >= 1, 'pero sí está bajando: el puente ya recibió ' + mock.jalar + ' petición(es) de página');
  await p.evaluate(() => {
    window.__marca = document.querySelector('#mod-control .pf-cuenta[data-cuenta="mes"]');
    /* Un muestreador DENTRO de la página: desde fuera, cada lectura tarda lo que tarda el protocolo
       y se pierde el avance entre páginas. Anota la escala del relleno mientras el botón trabaja. */
    window.__sx = [];
    setInterval(() => {
      const b = document.querySelector('[data-act="hoja-traer"][data-estado="trabajando"]');
      const rel = b && b.querySelector('.trabajo-relleno'); if (!rel) return;
      const m = /matrix\(([-\d.e]+)/.exec(getComputedStyle(rel).transform);
      window.__sx.push(m ? +m[1] : 0);
    }, 40);
  });
  await p.locator('[data-act="hoja-traer"]').tap();
  const e1 = await hasta(p, s => s.estado === 'trabajando', 1500);
  que(e1.ok, 'un toque durante la bajada silenciosa la enciende: el botón pasa a «trabajando»');
  const e2 = await hasta(p, s => /Página [2-4]/.test(s.texto), 4000);
  que(e2.ok, 'dice la página en la que va («' + (e2.s && e2.s.texto) + '» · ' + (e2.s && e2.s.reloj) + ')');
  que(e2.ok && /\d+ s/.test(e2.s.reloj), 'y el reloj corre al lado («' + (e2.s && e2.s.reloj) + '»)');
  que(await p.evaluate(() => window.__marca && window.__marca.isConnected),
    'durante la bajada la pantalla NO se repinta: la cifra que se estaba leyendo sigue siendo el mismo nodo');
  const e3 = await hasta(p, s => s.estado === 'ok' || s.estado === 'mal', 9000);
  que(e3.ok && e3.s.estado === 'ok', 'termina en verde (estado ok)');
  que(/^\d+ cambios?|^Al día/.test(e3.s.texto), 'con lo que trajo, dicho en el propio botón («' + e3.s.texto + '»)');
  que(e3.s.palomita, 'y con su palomita');
  const rellenos = await p.evaluate(() => window.__sx);
  que(rellenos.length >= 3 && Math.max(...rellenos) > 0.2, 'el relleno ya llevaba avance cuando se encendió (' + rellenos.length + ' muestras, máximo ' + Math.max(...rellenos).toFixed(2) + ')');
  que(mock.jalar === 4, 'se pidieron las 4 páginas, ni una más (' + mock.jalar + ')');
  const antesJ = mock.jalar;
  await p.locator('[data-act="hoja-traer"]').tap({ force: true }).catch(() => {});
  await esp(p, 700);
  que(mock.jalar === antesJ, 'mientras dice «' + e3.s.texto + '» el botón no acepta otro toque (no baja dos veces)');
  que(!(await p.evaluate(() => !!document.querySelector('#toast .toast.show, #toast [role]') && /trajo/.test(document.getElementById('toast').textContent))),
    'el resultado ya no sale en un aviso aparte');
  await esp(p, 900);
  const v0 = await p.evaluate(() => document.getElementById('vozStatus') && document.getElementById('vozStatus').textContent);
  que(/La hoja trajo|ya estaba al día/.test(v0 || ''), 'pero sí se dice por voz, también si un remonte del router dijo «Control» encima («' + lim(v0) + '»)');
  const e4 = await hasta(p, s => !s.estado, 6000);
  que(e4.ok && /Actualizar/.test(e4.s.texto + e4.s.todo), 'a los segundos vuelve a su rótulo («' + (e4.s && e4.s.todo) + '»)');

  /* A2 · Una bajada pedida con el dedo desde el principio: el relleno avanza por página, sin llegar al
     final antes de tiempo (con 4 páginas, la curva de la pieza va en ~0,5) y sin retroceder. */
  await asentar(c);
  c.mock.demora = 450;
  await p.evaluate(() => { window.__sx = []; });
  await p.locator('[data-act="hoja-traer"]').tap();
  const a2 = await hasta(p, s => s.estado === 'ok' || s.estado === 'mal', 9000);
  const sx = await p.evaluate(() => window.__sx);
  que(a2.ok && a2.s.estado === 'ok', 'una bajada pedida con el dedo termina en verde («' + (a2.s && a2.s.texto) + '»)');
  que(sx.length > 20 && Math.max(...sx) > 0.4 && Math.max(...sx) < 0.95,
    'el relleno avanza por página sin llegar al final antes de tiempo (' + sx.length + ' muestras, máximo ' + Math.max(...sx).toFixed(2) + ')');
  que(sx.every((x, i) => i === 0 || x >= sx[i - 1] - 0.02), 'y nunca retrocede');
  que(c.mock.jalar === 4, 'pidiendo las 4 páginas (' + c.mock.jalar + ')');
  que((await infinitas(p)).length === 0, 'nada gira en bucle en reposo');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* B · Un fallo se detiene en rojo con «Reintentar», dice por qué, y reintentar sigue donde iba. */
  const f = await abrir({ touch: true, puente: true });
  f.mock.demora = 250;
  await irA(f.p, '#/hoy', 900);
  await sembrar(f.p);
  await irA(f.p, '#/control', 600);
  await asentar(f);
  f.mock.fallaEnPagina = 2; f.mock.vecesFalla = 1;
  await f.p.locator('[data-act="hoja-traer"]').tap();
  const m1 = await hasta(f.p, s => s.estado === 'mal', 6000);
  if (process.env.DEPURA) console.log('    B:', m1.traza.map(s => (s.estado || '-')[0] + ':' + s.texto.slice(0, 22)).join(' | '), '· jalar', f.mock.jalar);
  que(m1.ok, 'si la página 2 no contesta, el botón se detiene en rojo');
  que(m1.ok && /No contestó · Reintentar/.test(m1.s.texto), 'y dice «' + (m1.s && m1.s.texto) + '»');
  const aviso = await f.p.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
  que(/La hoja no contestó/.test(aviso), 'el motivo sí va en un aviso: «' + lim(aviso).slice(0, 60) + '»');
  que(!m1.s.dis && m1.s.ariaDis !== 'true', 'y el botón vuelve a aceptar toques (reintentar es tocarlo otra vez)');
  const antesF = f.mock.jalar;
  await f.p.locator('[data-act="hoja-traer"]').tap();
  const m2 = await hasta(f.p, s => s.estado === 'ok', 8000);
  que(m2.ok, 'al reintentar termina en verde («' + (m2.s && m2.s.texto) + '»)');
  que(f.mock.jalar - antesF === 3, 'y sigue por donde se quedó: pidió solo las páginas 2 a 4 (' + (f.mock.jalar - antesF) + ' peticiones)');
  que(f.errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(f.errs)].slice(0, 2).join(' | '));
  await f.ctx.close();

  /* C · Un repintado a media bajada (cambiar de pestaña) le devuelve su estado al botón nuevo. */
  const g = await abrir({ touch: true, puente: true });
  g.mock.demora = 600;
  await irA(g.p, '#/hoy', 900);
  await sembrar(g.p);
  await irA(g.p, '#/control', 600);
  await asentar(g);
  await g.p.locator('[data-act="hoja-traer"]').tap();
  await hasta(g.p, s => /Página 1/.test(s.texto), 4000);
  await g.p.locator('[data-tab="cobrar"]').tap();
  const r1 = await hasta(g.p, s => s.estado === 'trabajando', 1200);
  que(r1.ok, 'si a media bajada se cambia de pestaña, el botón NUEVO nace ya trabajando (la pantalla se repintó)');
  que(r1.ok && /Página \d/.test(r1.s.texto), 'y sigue diciendo la página en la que va («' + (r1.s && r1.s.texto) + '»)');
  const r2 = await hasta(g.p, s => s.estado === 'ok', 8000);
  que(r2.ok, 'y termina en verde en la pestaña en la que quedó');
  que(g.errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(g.errs)].slice(0, 2).join(' | '));
  await g.ctx.close();

  /* D · Con menos movimiento: el relleno no corre solo, pero el reloj y el resultado dicen lo mismo. */
  const h = await abrir({ touch: true, puente: true, rm: true });
  h.mock.demora = 300;
  await irA(h.p, '#/hoy', 900);
  await sembrar(h.p);
  await irA(h.p, '#/control', 600);
  await asentar(h);
  await h.p.locator('[data-act="hoja-traer"]').tap();
  const k1 = await hasta(h.p, s => /Página [1-4]/.test(s.texto), 4000);
  que(k1.ok, 'con menos movimiento el botón también dice la página («' + (k1.s && k1.s.texto) + '»)');
  const anim = await h.p.evaluate(() => document.getAnimations().filter(a => { const t = a.effect && a.effect.target; return t && t.classList && t.classList.contains('trabajo-relleno'); }).length);
  que(anim === 0, 'y el relleno no corre solo (sin animación; solo lo que avanza una página)');
  const k2 = await hasta(h.p, s => s.estado === 'ok', 8000);
  que(k2.ok && /^\d+ cambios?|^Al día/.test(k2.s.texto), 'y termina diciendo «' + (k2.s && k2.s.texto) + '»');
  await h.ctx.close();
}

/* ══ 4 · P27 · LAS DOCE BARRAS CRECEN UNA VEZ Y CADA MES SE ABRE ════════════ */
titulo('p27', 'P27 · LAS DOCE BARRAS CRECEN UNA VEZ, AL VERSE, Y CADA MES SE ABRE');
if (activa('p27')) {
  const c = await entrar({ touch: true });
  const { p, errs } = c;
  const hoyYm = await p.evaluate(async () => (await import('./js/nucleo/fechas.js')).hoyISO().slice(0, 7));
  que((await p.locator('.ct-grafica.espera').count()) === 1, 'al entrar, la gráfica espera: todavía no se ve y no ha crecido');
  const e0 = await escalaBarra(p, '.ct-grafica .ct-b.vendido');
  que(e0 === 0, 'sus barras nacen en cero (escala ' + e0 + ')');
  que((await animsDeBarras(p)) === 0, 'y no se anima nada mientras nadie la ve');
  /* Mientras no se ve, un repintado (el buscador) las deja igual de esperando. Se teclea SIN mover la
     pantalla: `fill` traería el campo a la vista y, al pasar, la gráfica se vería. */
  const teclear = txt => p.evaluate(t => { const i = document.querySelector('[data-busca]'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); }, txt);
  await teclear('a'); await esp(p, 500);
  que((await p.locator('.ct-grafica.espera').count()) === 1 && (await escalaBarra(p, '.ct-grafica .ct-b.vendido')) === 0,
    'si se repinta antes de verlas, siguen esperando (no se pierde el crecimiento)');
  await teclear(''); await esp(p, 500);

  await p.evaluate(() => document.querySelector('#ct-meses').scrollIntoView({ block: 'start' }));
  let visto = 0, enCurso = 0;
  for (let i = 0; i < 20; i++) {
    const n = await animsDeBarras(p); if (n > enCurso) enCurso = n;
    if (!(await p.locator('.ct-grafica.espera').count())) visto = 1;
    await esp(p, 60);
  }
  que(visto === 1, 'al verse, la gráfica deja de esperar');
  que(enCurso >= 8, 'y las barras crecen con transform (animaciones vivas: ' + enCurso + ')');
  await esp(p, 1800);
  que((await animsDeBarras(p)) === 0, 'a los dos segundos ya no se mueve nada');
  const e1 = await escalaBarra(p, '.ct-grafica .ct-b.vendido');
  que(e1 === 1, 'y las barras quedaron con su ancho completo (escala ' + e1 + ')');
  que((await infinitas(p)).length === 0, 'nada gira en bucle');
  const w = await p.evaluate(() => [...document.querySelectorAll('.ct-grafica .ct-b.vendido')].map(b => Math.round(b.getBoundingClientRect().width)));
  que(w.length === 10 && Math.max(...w) > 60 && w.every(x => x >= 2), 'cada mes con venta tiene su barra con su ancho (' + w.length + ' barras, la mayor de ' + Math.max(...w) + ' px)');

  /* UNA vez: el buscador que repinta no las vuelve a mover, ni cambiar de pestaña y volver. */
  await teclear('Gym'); await esp(p, 600);
  que((await animsDeBarras(p)) === 0 && (await p.locator('.ct-grafica.espera').count()) === 0,
    'el buscador, que repinta la pantalla, NO las vuelve a animar');
  await teclear(''); await esp(p, 500);
  await tab(p, 'bitacora'); await tab(p, 'ventas'); await esp(p, 300);
  que((await animsDeBarras(p)) === 0 && (await escalaBarra(p, '.ct-grafica .ct-b.vendido')) === 1,
    'ni cambiar de pestaña y volver: crecen UNA vez por visita');
  await llegaOtra(p, 'V-299', 'Llegó otra', 3000);
  await remontar(p);
  que((await animsDeBarras(p)) === 0 && (await p.locator('.ct-grafica.espera').count()) === 0,
    'ni un remonte en silencio de la sincronización');

  /* Los meses: botones donde hay algo, filas sin botón donde no. */
  const filas = await p.evaluate(() => [...document.querySelectorAll('.ct-grafica .ct-mes')].map(e => ({ tag: e.tagName, mes: e.dataset.mes || '', t: e.textContent.replace(/\s+/g, ' ').trim() })));
  que(filas.length === 12, 'son doce renglones (' + filas.length + ')');
  que(filas.filter(x => x.tag === 'BUTTON').length === 10, 'diez meses con algo son botones');
  que(filas.filter(x => x.tag === 'DIV').length === 2 && filas.filter(x => x.tag === 'DIV').every(x => /\$0\.00/.test(x.t)),
    'los dos en cero NO son botón (no hay nada que abrir): «' + filas.filter(x => x.tag === 'DIV').map(x => x.t.slice(0, 18)).join(' | ') + '»');
  que((await p.locator('.ct-mes-ver[aria-haspopup="dialog"]').count()) === 10, 'cada botón avisa que abre un diálogo');
  const alto = await p.evaluate(() => Math.min(...[...document.querySelectorAll('.ct-mes-ver')].map(b => b.getBoundingClientRect().height)));
  que(alto >= 44, 'con el dedo, cada mes mide al menos 44 px de alto (' + Math.round(alto) + ')');
  que((await p.locator('.ct-grafica .ct-b').evaluateAll(es => es.every(e => getComputedStyle(e).transitionDuration === '0s'))),
    'las barras no tienen transición (la de ancho que había nunca corría)');

  /* El globo de un mes: el del mes actual. */
  const filaHoy = '#ct-mes-' + hoyYm;
  await p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), filaHoy); await esp(p, 300);
  await p.locator(filaHoy).tap(); await esp(p, 400);
  const vz = p.locator('.vistazo:popover-open');
  que((await vz.count()) === 1, 'tocar un mes abre su globo');
  const tx = lim(await vz.innerText());
  que(/Vendido · 3 ventas/.test(tx) && /Gym Titanio/.test(tx) && /Café Barrio/.test(tx) && /Llegó otra/.test(tx),
    'con sus ventas por nombre, también la que llegó por la sincronización («' + tx.slice(0, 80) + '…»)');
  que(tx.indexOf('Gym Titanio') < tx.indexOf('Café Barrio') && tx.indexOf('Café Barrio') < tx.indexOf('Llegó otra'), 'de la más grande a la más chica');
  que(/No se dio · 1 cotización/.test(tx), 'y lo que no se dio');
  que(/Ticket promedio/.test(tx), 'y el ticket promedio');
  que((await p.locator(filaHoy).getAttribute('aria-expanded')) === 'true', 'el mes que se abrió lo dice (aria-expanded)');
  const totalFila = lim(await p.locator(filaHoy + ' .ct-mes-v').innerText()).split(' ')[0];
  que(tx.includes(totalFila), 'el total del globo es el de la barra (' + totalFila + ')');
  const cj = await caja(p, '.vistazo:popover-open');
  que(cj.x >= 0 && cj.r <= 360 && cj.y >= 0 && cj.b <= 780, 'el globo cabe en la pantalla (' + Math.round(cj.x) + '–' + Math.round(cj.r) + ' × ' + Math.round(cj.y) + '–' + Math.round(cj.b) + ')');
  await p.keyboard.press('Escape'); await esp(p, 300);
  que((await vz.count()) === 0, 'Escape lo cierra');
  que((await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'ct-mes-' + hoyYm, 'y el foco vuelve a su mes');
  /* Teclado: Enter y Espacio abren. */
  await p.keyboard.press('Enter'); await esp(p, 300);
  que((await vz.count()) === 1, 'con teclado, Enter abre el globo');
  await p.keyboard.press('Escape'); await esp(p, 250);
  await p.keyboard.press('Space'); await esp(p, 300);
  que((await vz.count()) === 1, 'y Espacio también');
  /* Tocar fuera cierra. */
  await p.touchscreen.tap(10, 400); await esp(p, 300);
  que((await vz.count()) === 0, 'tocar fuera lo cierra');

  /* El globo de CADA mes dice lo mismo que su barra. */
  const todos = await p.evaluate(() => [...document.querySelectorAll('.ct-mes-ver')].map(b => b.id));
  let cuadran = 0;
  for (const id of todos) {
    await p.evaluate(i => document.getElementById(i).scrollIntoView({ block: 'center' }), id); await esp(p, 150);
    await p.locator('#' + id).tap(); await esp(p, 250);
    const g = lim(await vz.innerText().catch(() => ''));
    const tot = lim(await p.locator('#' + id + ' .ct-mes-v').innerText()).split(' ')[0];
    const nv = Number((lim(await p.locator('#' + id + ' .ct-mes-v small').innerText()).match(/^(\d+) venta/) || [])[1] || 0);
    if (nv === 0 ? /Sin ventas este mes/.test(g) : (g.includes(tot) && g.includes('Vendido · ' + nv))) cuadran++;
    await p.keyboard.press('Escape'); await esp(p, 150);
  }
  que(cuadran === todos.length, 'el globo de los ' + todos.length + ' meses con algo coincide con su barra (' + cuadran + ')');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Con ratón. */
  const m = await entrar({ touch: false, ancho: 1100, alto: 900 });
  await m.p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), filaHoy); await esp(m.p, 300);
  await m.p.locator(filaHoy).click(); await esp(m.p, 400);
  que((await m.p.locator('.vistazo:popover-open').count()) === 1, 'con el ratón, un clic en un mes abre el globo');
  await m.ctx.close();

  /* Con menos movimiento: nada crece, nada se esconde y los meses se abren igual. */
  const r = await entrar({ touch: true, rm: true });
  que((await r.p.locator('.ct-grafica.espera').count()) === 0, 'con menos movimiento la gráfica nace terminada: no espera para crecer');
  que((await escalaBarra(r.p, '.ct-grafica .ct-b.vendido')) === 1, 'sus barras están con su ancho completo desde el primer cuadro');
  await r.p.evaluate(() => document.querySelector('#ct-meses').scrollIntoView({ block: 'start' })); await esp(r.p, 400);
  que((await animsDeBarras(r.p)) === 0, 'y no se anima nada al verlas');
  await r.p.locator(filaHoy).tap(); await esp(r.p, 400);
  que((await r.p.locator('.vistazo:popover-open').count()) === 1, 'y el mes se abre igual');
  await r.ctx.close();
}

/* ══ 5 · P30 · EL SALDO CON SU MEDIDOR ══════════════════════════════════════ */
titulo('p30', 'P30 · CADA SALDO POR COBRAR LLEVA SU MEDIDOR');
if (activa('p30')) {
  const c = await entrar({ touch: true });
  const { p, errs } = c;
  await tab(p, 'cobrar');
  const filas = await p.evaluate(() => [...document.querySelectorAll('#ct-cartera .ct-fila')].map(f => ({
    nombre: f.querySelector('.pf-fila-t').textContent.replace(/\s+/g, ' ').trim(),
    medidor: !!f.querySelector('.ct-cobro .medidor'), estimado: !!f.querySelector('.ct-cobro .medidor.estimado'),
    falta: !!f.querySelector('.ct-cobro .medidor-falta'), lleno: !!f.querySelector('.ct-cobro .medidor-lleno'),
    texto: f.querySelector('.ct-cobro-t').textContent.replace(/\s+/g, ' ').trim(),
    desc: f.querySelector('.pf-fila-d').textContent.replace(/\s+/g, ' ').trim(),
    oculto: f.querySelector('.ct-cobro .medidor').getAttribute('aria-hidden'),
    transicion: getComputedStyle(f.querySelector('.ct-cobro .medidor-lleno')).transitionDuration,
    dentro: (() => { const m = f.querySelector('.ct-cobro .medidor').getBoundingClientRect(), t = f.querySelector('.pf-fila-tx').getBoundingClientRect(); return m.right <= t.right + 0.5 && m.left >= t.left - 0.5; })() })));
  const de = n => filas.find(f => f.nombre.includes(n)) || {};
  que(filas.length === 3 && filas.every(f => f.medidor && f.lleno && f.falta), 'cada una de las 3 ventas con saldo lleva su medidor con lo cobrado y lo que falta');
  que(de('Barbería').texto === '50 % cobrado', 'Barbería El Toro: «' + de('Barbería').texto + '» (saldo de la hoja)');
  que(de('Clínica').texto === '49 % cobrado', 'Clínica Norte: «' + de('Clínica').texto + '» (redondea hacia abajo: no es 50)');
  que(!de('Barbería').estimado && !/estimado/.test(de('Barbería').texto), 'con el saldo de la hoja la barra NO va rayada ni dice «estimado»');
  que(de('Óptica').estimado && /estimado/.test(de('Óptica').texto), 'con el saldo estimado la barra va RAYADA y lo dice con palabras: «' + de('Óptica').texto + '»');
  que(/saldo estimado/.test(de('Óptica').desc), 'y la línea de arriba también lo dice');
  que(filas.every(f => f.oculto === 'true'), 'la barra es decoración para el lector: el porcentaje va escrito al lado');
  que(filas.every(f => f.transicion === '0s'), 'sin transición ni animación: el medidor es quieto');
  que(filas.every(f => f.dentro), 'y cada barra cabe en su columna (360 px)');
  que((await infinitas(p)).length === 0, 'nada gira en bucle');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

/* ══ 6 · F54 · COMISIONES, PRIMERO LAS CHICAS ═══════════════════════════════ */
titulo('f54', 'F54 · COMISIONES: PAGAR PRIMERO LAS CHICAS');
if (activa('f54')) {
  const c = await entrar({ touch: true });
  const { p, errs } = c;
  const lee = () => p.evaluate(() => ({
    res: (document.querySelector('.ct-com-res') || {}).textContent || '',
    boton: (() => { const b = document.querySelector('[data-com-pagar]'); return b ? { t: b.textContent.replace(/\s+/g, ' ').trim(), dis: b.disabled } : null; })(),
    filas: [...document.querySelectorAll('.ct-com-fila')].map(f => ({ clase: f.className.replace('ct-com-fila', '').trim(), nombre: f.querySelector('.ct-com-nom').childNodes[0].textContent,
      estado: f.querySelector('.ct-com-nom small').textContent.split('·')[0].trim(), monto: f.querySelector('.ct-com-monto').childNodes[0].textContent,
      sub: f.querySelector('.ct-com-monto small').textContent })),
    armada: !!document.getElementById('ct-com-armada'),
    texto: (document.querySelector('.ct-com-texto') || {}).textContent || '',
    foco: document.activeElement && (document.activeElement.id || document.activeElement.getAttribute('data-com-copiar') !== null && 'copiar' || document.activeElement.tagName),
    med: (() => { const m = document.querySelector('.ct-com-med .medidor'); return m ? { v: m.style.getPropertyValue('--v'), muesca: m.style.getPropertyValue('--muesca') } : null; })(),
  }));
  await tab(p, 'comisiones');
  const tabTxt = await p.locator('[data-tab="comisiones"]').textContent();
  que(/Comisiones · 9/.test(tabTxt), 'la pestaña dice cuántas comisiones se pueden pagar ya («' + lim(tabTxt) + '»)');
  const cu = await cuentas(p);
  que(cu.length === 2 && cu.every(x => x.tag === 'P'), 'las dos cuentas (por pagar ya, falta liquidar) son sumas: párrafos');
  que(pesos(cu.find(x => x.clave === 'ya').n) === 18115.4, '«Por pagar ya» suma las 9 comisiones de ventas liquidadas: ' + cu.find(x => x.clave === 'ya').n);
  que(pesos(cu.find(x => x.clave === 'falta').n) === 3680, '«Falta liquidar la venta» suma las 3 que aún no se pueden pagar: ' + cu.find(x => x.clave === 'falta').n);
  let s = await lee();
  que(/Escribe cuánto hay para pagar/.test(s.res) && s.boton.dis, 'sin monto, pide el monto y el botón no se puede tocar');
  const montos = s.filas.map(f => pesos(f.monto));
  que(s.filas.length === 9 && montos.every((x, i) => i === 0 || x >= montos[i - 1]), 'la lista va de la más chica a la más grande (' + montos.map(x => x.toLocaleString('es-MX')).join(' · ') + ')');
  que(s.filas.every(f => f.estado === 'Pendiente'), 'todas «Pendiente» mientras no hay monto');
  que(s.filas[0].nombre === 'Papelería Centro' && /faltan \$210\.00 de \$410\.00/.test(s.filas[0].sub),
    'la que la hoja ya abonó en parte pesa lo que le FALTA: «' + s.filas[0].nombre + ' · ' + s.filas[0].sub + '»');
  que(!s.filas.some(f => /Barbería|Óptica|Clínica/.test(f.nombre)), 'las comisiones de ventas sin liquidar no entran a la lista');

  /* Teclear el monto: se repinta sin quitarle el foco al campo. */
  const campo = p.locator('#ct-com-disp');
  await campo.tap();
  await p.keyboard.type('2500', { delay: 40 });
  await esp(p, 300);
  s = await lee();
  que((await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'ct-com-disp', 'al teclear, el campo conserva el foco (no se repinta la pantalla entera)');
  que(/Alcanzan 3 de 9 · quedan 6 pendientes/.test(s.res), 'con $2,500 alcanzan 3 de 9: «' + lim(s.res).slice(0, 60) + '»');
  que(/\$1,580\.00 de \$2,500\.00/.test(s.res) && /faltan \$295\.00/.test(s.res) && /Panadería La Espiga/.test(s.res),
    'dice cuánto suman y cuánto le falta a la siguiente («…' + lim(s.res).slice(-95) + '»)');
  que(s.boton.t === 'Pagar estas 3 · $1,580.00' && !s.boton.dis, 'el botón dice cuántas y cuánto: «' + s.boton.t + '»');
  que(s.filas.slice(0, 3).every(f => f.clase === 'alcanza' && f.estado === 'Alcanza') && s.filas.slice(3).every(f => f.clase === 'pend' && f.estado === 'Pendiente'),
    'las tres primeras «Alcanza» (dicho con palabra, no solo con color) y las demás «Pendiente»');
  que(s.med && Math.abs(Number(s.med.v) - 1580 / 18115.4) < 0.001 && Math.abs(Number(s.med.muesca) - 2500 / 18115.4) < 0.001,
    'el medidor quieto: lleno = lo que se liquida y la muesca = el dinero que hay (' + (s.med && Number(s.med.v).toFixed(3)) + ' · ' + (s.med && Number(s.med.muesca).toFixed(3)) + ')');
  await esp(p, 900);
  const vozTxt = await p.evaluate(() => document.getElementById('vozStatus').textContent);
  que(/Alcanzan 3 de 9/.test(vozTxt), 'y se dice por voz cuando se deja de teclear («' + lim(vozTxt).slice(0, 40) + '»)');

  /* Bordes: no alcanza para ninguna, y alcanzan todas. */
  await campo.fill('100'); await esp(p, 250);
  s = await lee();
  que(s.boton.dis && /No alcanza para ninguna/.test(s.boton.t), 'con $100 no alcanza para ninguna y el botón no se puede tocar («' + s.boton.t + '»)');
  que(/faltan \$110\.00/.test(s.res), 'y dice cuánto falta para la primera (' + lim(s.res).slice(-60) + ')');
  await campo.fill('99999'); await esp(p, 250);
  s = await lee();
  que(/Alcanzan 9 de 9 · no queda ninguna pendiente/.test(s.res) && /sobran \$81,883\.60/.test(s.res), 'con $99,999 alcanzan las 9 y sobran $81,883.60');
  await campo.fill('1580'); await esp(p, 250);
  s = await lee();
  que(/Alcanzan 3 de 9/.test(s.res), 'con $1,580 exactos alcanzan 3: la frontera alcanza justo');
  await campo.fill('1579.99'); await esp(p, 250);
  s = await lee();
  que(/Alcanzan 2 de 9/.test(s.res), 'y con un centavo menos, solo 2');

  /* Al salir del campo se escribe como dinero, y al volver se selecciona entero. */
  await campo.fill('2500'); await esp(p, 200);
  await p.locator('.ct-com-nota').tap(); await esp(p, 300);
  que((await campo.inputValue()) === '$2,500.00', 'al salir del campo el monto queda escrito como dinero: «' + (await campo.inputValue()) + '»');
  await campo.tap(); await esp(p, 200);
  que(await p.evaluate(() => { const i = document.getElementById('ct-com-disp'); return i.selectionStart === 0 && i.selectionEnd === i.value.length; }),
    'y al volver a tocarlo se selecciona entero, para teclear encima sin borrar');
  await p.keyboard.type('2500'); await esp(p, 300);

  /* «Pagar estas» ARMA LA LISTA y no escribe nada. */
  const antesBase = await p.evaluate(async () => {
    const DB = await import('./js/datos/db.js');
    return JSON.stringify({ v: (await DB.listar('ventas_hoja')).map(x => x.id + x.estatus + x.comision_restante).sort(),
      p: (await DB.listar('pendientes')).length, pr: (await DB.listar('proyectos')).length, b: (await DB.listar('bitacora')).length });
  });
  await p.locator('[data-com-pagar]').tap(); await esp(p, 700);
  s = await lee();
  que(s.armada, '«Pagar estas» arma la lista y la deja a la vista');
  que(/V-109 · Papelería Centro — \$210\.00/.test(s.texto) && /V-102 · Café Barrio — \$600\.00/.test(s.texto) && /V-114 · Ferretería Sur — \$770\.00/.test(s.texto),
    'con folio, nombre y monto de cada una');
  que(/Total: \$1,580\.00/.test(s.texto) && !/V-107/.test(s.texto), 'con el total, y sin las que no alcanzan');
  que(/Finanzas AL3D/.test(s.texto), 'y diciendo dónde se registran («Finanzas AL3D»)');
  que(s.filas.slice(0, 3).every(f => f.clase === 'lista' && f.estado === 'En la lista'), 'los tres renglones dicen «En la lista» (no «Pagada»: aquí no se marca nada)');
  que(s.foco === 'copiar', 'el foco llega a «Copiar la lista»');
  que(!s.filas.some(f => /Pagada/.test(f.estado)), 'ningún renglón dice «Pagada»');
  que((await p.locator('.ct-com-fila.lista .palomita').count()) === 3, 'cada renglón que entró a la lista lleva su palomita (3)');
  const despuesBase = await p.evaluate(async () => {
    const DB = await import('./js/datos/db.js');
    return JSON.stringify({ v: (await DB.listar('ventas_hoja')).map(x => x.id + x.estatus + x.comision_restante).sort(),
      p: (await DB.listar('pendientes')).length, pr: (await DB.listar('proyectos')).length, b: (await DB.listar('bitacora')).length });
  });
  que(antesBase === despuesBase, 'NO escribió nada: ni ventas, ni proyectos, ni bandeja de salida, ni bitácora');
  /* Copiar y mandar. */
  await p.locator('[data-com-copiar]').tap(); await esp(p, 500);
  const portap = await p.evaluate(() => navigator.clipboard.readText());
  que(portap === s.texto, 'copiar deja en el portapapeles exactamente la lista');
  const wa = await p.locator('#ct-com-armada .btn-wa').getAttribute('href');
  que(wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa.split('?text=')[1]) === s.texto, 'y «Mandarla por WhatsApp» abre el chat sin número con la misma lista');
  /* Si cambia el monto, la lista se cae. */
  await campo.tap(); await p.keyboard.type('1'); await esp(p, 300);
  s = await lee();
  que(!s.armada && !s.filas.some(f => f.clase === 'lista'), 'si cambia el monto, la lista armada se cae: una lista vieja pegada en la hoja es un abono equivocado');

  /* Con teclado: Tab hasta el botón y Enter arman la lista. */
  await campo.fill('2500'); await esp(p, 250);
  await campo.focus();
  await p.keyboard.press('Tab');
  que(await p.evaluate(() => document.activeElement.hasAttribute('data-com-pagar')), 'Tab lleva del campo al botón «Pagar estas»');
  await p.keyboard.press('Enter'); await esp(p, 500);
  que((await lee()).armada, 'y Enter arma la lista');
  /* Si llega algo que cambia cuáles alcanzan, la lista se cae sola. */
  await llegaOtra(p, 'V-299', 'Llegó otra', 1000);
  await remontar(p);
  s = await lee();
  que(!s.armada && /Alcanzan 4 de 10/.test(s.res), 'si la sincronización trae una comisión más chica, la lista armada se cae y la cuenta se rehace («' + lim(s.res).slice(0, 36) + '»)');
  que((await campo.inputValue()) === '$2,500.00', 'y el monto tecleado sigue ahí (un remonte en silencio no lo borra)');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Sin comisiones por pagar: se dice por qué y no hay campo que no hace nada. */
  const v = await entrar({ touch: true, sembrar: false });
  await tab(v.p, 'comisiones');
  que((await v.p.locator('#ct-com-disp').count()) === 0 && /No hay comisiones por pagar/.test(await v.p.locator('#mod-control .vacio').textContent()),
    'sin ventas liquidadas dice «No hay comisiones por pagar» y no pinta un campo inútil');
  await v.ctx.close();

  /* Con menos movimiento: la palomita aparece ya dibujada. */
  const r = await entrar({ touch: true, rm: true });
  await tab(r.p, 'comisiones');
  await r.p.locator('#ct-com-disp').tap(); await r.p.keyboard.type('2500'); await esp(r.p, 300);
  await r.p.locator('[data-com-pagar]').tap(); await esp(r.p, 500);
  que(await r.p.locator('#ct-com-armada').count() === 1, 'con menos movimiento la lista se arma igual');
  que((await infinitas(r.p)).length === 0, 'y no se mueve nada en bucle');
  await r.ctx.close();
}

/* ══ 7 · LAS MEDIDAS: 360 y 420 px × claro y oscuro × con y sin movimiento ═ */
titulo('medidas', 'EN TODAS LAS MEDIDAS · sin desborde, sin bucles, con contraste');
if (activa('medidas')) {
  for (const ancho of [360, 420]) for (const tema of ['claro', 'oscuro']) for (const rm of [false, true]) {
    const donde = ancho + ' px · ' + tema + ' · ' + (rm ? 'menos movimiento' : 'con movimiento');
    const c = await entrar({ ancho, tema, rm, touch: true, decidir: 1 });
    const { p, errs } = c;
    await esp(p, 600);
    que((await desborde(p)) <= 0, donde + ': Ventas sin desborde horizontal');
    que((await infinitas(p)).length === 0, donde + ': Ventas sin animaciones en bucle en reposo');
    const cs = await p.evaluate(() => [...document.querySelectorAll('#mod-control .pf-cuenta.va .pf-cuenta-t')].map(e => e.getBoundingClientRect().width));
    que(cs.length >= 4 && cs.every(w => w > 20), donde + ': las cuentas tocables caben y se leen (' + cs.length + ')');
    const k1 = await contraste(p, '#mod-control .pf-cuenta.va .pf-cuenta-t');
    que(k1 >= 4.5, donde + ': la etiqueta de una cuenta tocable pasa de 4,5:1 (' + (k1 && k1.toFixed(2)) + ')');
    /* Las barras ya vistas, con su globo abierto. */
    await p.evaluate(() => document.querySelector('#ct-meses').scrollIntoView({ block: 'start' })); await esp(p, 1700);
    que((await desborde(p)) <= 0, donde + ': con las barras a la vista, sin desborde');
    const k2 = await contraste(p, '#ct-meses .ct-mes-t');
    que(k2 >= 4.5, donde + ': el nombre del mes pasa de 4,5:1 (' + (k2 && k2.toFixed(2)) + ')');
    await p.locator('.ct-mes-ver').last().tap(); await esp(p, 400);
    que((await desborde(p)) <= 0, donde + ': con el globo de un mes abierto, sin desborde');
    const k3 = await contraste(p, '.vistazo:popover-open .ct-vz-nota');
    que(k3 == null || k3 >= 4.5, donde + ': la nota del globo pasa de 4,5:1 (' + (k3 && k3.toFixed(2)) + ')');
    await p.keyboard.press('Escape'); await esp(p, 250);

    await tab(p, 'cobrar');
    que((await desborde(p)) <= 0, donde + ': Por cobrar sin desborde');
    que((await infinitas(p)).length === 0, donde + ': Por cobrar sin bucles en reposo');
    const k4 = await contraste(p, '#ct-cartera .ct-cobro-t');
    que(k4 >= 4.5, donde + ': el porcentaje cobrado pasa de 4,5:1 (' + (k4 && k4.toFixed(2)) + ')');

    await tab(p, 'comisiones');
    await p.locator('#ct-com-disp').tap(); await p.keyboard.type('2500'); await esp(p, 350);
    que((await desborde(p)) <= 0, donde + ': Comisiones sin desborde');
    que((await infinitas(p)).length === 0, donde + ': Comisiones sin bucles en reposo');
    const k5 = await contraste(p, '.ct-com-res');
    const k6 = await contraste(p, '.ct-com-fila.pend .ct-com-nom small');
    const k7 = await contraste(p, '.ct-com-fila.alcanza .ct-com-nom small');
    const k8 = await contraste(p, '.ct-com-fila.alcanza .ct-com-monto small');
    que(k5 >= 4.5 && k6 >= 4.5 && k7 >= 4.5 && k8 >= 4.5, donde + ': la frase y los renglones (pendiente y alcanza) pasan de 4,5:1 (' +
      [k5, k6, k7, k8].map(x => x && x.toFixed(2)).join(' · ') + ')');
    const bt = await caja(p, '[data-com-pagar]');
    que(bt.h >= 44, donde + ': «Pagar estas» mide al menos 44 px de alto (' + Math.round(bt.h) + ')');
    await p.locator('[data-com-pagar]').tap(); await esp(p, 600);
    que((await desborde(p)) <= 0, donde + ': con la lista armada, sin desborde');
    const k9 = await contraste(p, '.ct-com-texto');
    que(k9 >= 4.5, donde + ': el texto de la lista pasa de 4,5:1 (' + (k9 && k9.toFixed(2)) + ')');
    que((await infinitas(p)).length === 0, donde + ': y la lista armada no se mueve sola');

    await tab(p, 'bitacora');
    que((await desborde(p)) <= 0, donde + ': Bitácora sin desborde');
    que(errs.length === 0, donde + ': cero errores de página', donde + ': errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
    await c.ctx.close();
  }
}

await nav.close();
console.log(fallos ? '\n' + fallos + ' fallo(s) en Control.' : '\nControl: las cuentas llevan a algo y ruedan, la hoja enseña su avance, las barras crecen una vez, cada saldo tiene su medidor y las comisiones arman su lista sin escribir nada.');
process.exit(fallos ? 1 : 0);
