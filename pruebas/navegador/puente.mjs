/* EL PUENTE COMPLETO, CON CLICS DE VERDAD: del cotizador a la hoja de finanzas.

   `pruebas/puente.mjs` prueba los mapeos y `pruebas/worker.mjs` prueba el Worker. Los dos
   pasan sin que el camino exista: entre ellos hay una plataforma, una bandeja en IndexedDB,
   un arranque y una pantalla de ajustes, y el hueco ENTRE los módulos es todo el producto.
   Esa es la lección que ya costó una pantalla en blanco y por la que existe
   camino-completo.mjs. Esto es lo mismo, para la fase 3.

   Levanta su propio servidor: sirve el repositorio Y un puente de mentiras en la misma
   dirección, así que no hace falta ni python ni tocar la hoja de verdad.

     node pruebas/navegador/puente.mjs          (o con PUERTO=8815)

   Recorre: cotizar → autorizar → «Registrar venta» → abrir la plataforma con el puente ya
   pegado → y comprueba que la venta SALIÓ SOLA hacia la hoja con su dirección, su ubicación
   y su tipo de trabajo, que el folio de la fila se guardó para no crear una segunda, y que
   el espejo del dinero bajó a la ficha del proyecto. */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUERTO = Number(process.env.PUERTO || 8815);
const TOKEN = 'tok-de-prueba-direccion';

let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

/* ---------------------------------------------------------------------------
   EL PUENTE DE MENTIRAS

   Contesta lo mismo que contestaría el Apps Script de la hoja, con la lista blanca de
   DIRECCIÓN tal como está allá: si se separaran, esta prueba pasaría con un relevo que en
   la vida real mandaría propiedades que el rol no puede escribir.
   --------------------------------------------------------------------------- */
const ESCRIBIBLES_DIRECCION = [
  'Proyecto', 'Precio Subtotal', 'IVA', 'Anticipo', 'Liquidacion', 'Abono Comision',
  'Estatus', 'Cuenta ', 'Fecha Anticipo e Instalacion', 'Fecha Liquidacion',
  'Folio cotizacion', 'Etapa de obra', 'Fecha instalacion', 'Hora instalacion',
  'Ubicacion', 'Direccion', 'Tipo de trabajo',
];

const RECIBIDO = { empujar: [], salud: 0, esquema: 0, jalar: 0 };
let FILA = null;            // la fila que esta venta va a crear en la hoja de mentiras

/* ── Lo que la hoja YA tiene antes de esta venta ─────────────────────────────────
   Dos filas que nunca pasaron por este teléfono: una de 2024, anterior a la plataforma, sin
   folio de cotización y sin etapa de obra; y una de ESTE mes capturada directo en la hoja
   (⚡ AL3D → Registrar nueva venta). Hasta septiembre de 2026 el relevo las miraba y las
   dejaba donde estaban, y el récord de vendidas de Control no las sumaba. Las fechas van con
   la zona de la hoja para que «este mes» sea el mismo mes que ve el navegador. */
const HOY_MX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });   // YYYY-MM-DD
const filaHoja = (id, nombre, o) => ({ id_notion: id, editado: null, 'Proyecto': nombre, 'Cuenta ': 'Elias BBVA',
  'Estatus': 'LIQUIDADO', 'Tipo de trabajo': ['Letras 3D con iluminacion'], 'IVA': true,
  'Precio Subtotal': 25000, 'Precio Neto ': 29000, 'Anticipo': 15000, 'Liquidacion': 14000, 'Pago Pendiente': 0,
  'Comisiones': 2500, 'Abono Comision': 2500, 'Comision Restante': 0, 'Porcentaje comision': null,
  'Fecha Anticipo e Instalacion': '2024-03-12', 'Fecha instalacion': '2024-03-28', 'Fecha Liquidacion': '2024-03-30',
  'Folio cotizacion': '', 'Etapa de obra': null, 'Hora instalacion': '', 'Ubicacion': '', 'Direccion': '', ...o });
let HISTORICAS = [
  filaHoja('V-001', 'Farmacia Guadalajara - Letras', {}),
  filaHoja('V-150', 'Óptica Lux - Caja de luz', { 'Estatus': 'COBRANDO', 'Cuenta ': 'Rul HSBC',
    'Tipo de trabajo': ['Caja de luz con iluminacion'], 'Precio Subtotal': 10000, 'Precio Neto ': 11600,
    'Anticipo': 5000, 'Liquidacion': null, 'Pago Pendiente': 6600, 'Comisiones': 1000, 'Abono Comision': 0,
    'Comision Restante': 1000, 'Fecha Anticipo e Instalacion': HOY_MX.slice(0, 7) + '-01',
    'Fecha instalacion': null, 'Fecha Liquidacion': null }),
];

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (o, c = 200) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

  /* ── Todo el puente entra por POST a la MISMA dirección ──────────────────────
     No es un capricho de esta prueba: es lo que obliga Apps Script. Un Web App solo
     expone doGet y doPost, no hay dónde contestar un OPTIONS, así que la petición tiene
     que quedarse dentro de las «simples» de CORS: `Authorization` y `application/json`
     disparan preflight y quedan fuera. Por eso el token viaja en el cuerpo y el camino
     también, en vez de ir en la cabecera y en la ruta como iban con el Worker.

     Esta prueba tenía el servidor del Worker viejo —rutas por path y Bearer— y por eso
     fallaba entera contra un cliente que ya hablaba el otro idioma. */
  if (url.pathname === '/puente' || url.pathname.startsWith('/puente/')) {
    let crudo = '';
    for await (const t of req) crudo += t;
    let entrada = {};
    try { entrada = JSON.parse(crudo || '{}'); } catch (_) { entrada = {}; }

    /* El puente de verdad contesta 200 con ok:false; es el cliente quien lo traduce a 401.
       Contestar 401 aquí probaría una traducción que en producción no ocurre. */
    if (entrada.token !== TOKEN) {
      return json({ ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Token desconocido' });
    }
    const ruta = String(entrada.ruta || 'salud').replace(/^\/+|\/+$/g, '');

    if (ruta === 'salud') {
      RECIBIDO.salud++;
      return json({ ok: true, ts: Date.now(), version: 'falso-1', rol: 'direccion',
                    escribibles: ESCRIBIBLES_DIRECCION, destino: 'google-sheets' });
    }
    /* Sin la pestaña «Accesos», como una hoja que se preparó antes de puente-sheets-5: las
       ocho columnas están, pero nadie entraría con Google. «Revisar el esquema» lo tiene que
       decir; hasta septiembre de 2026 el relevo tiraba el dato y la pantalla decía que todo
       estaba bien. */
    if (ruta === 'esquema') { RECIBIDO.esquema++; return json({ ok: true, faltan: [], accesos: false, nota: 'falta «Accesos»' }); }
    if (ruta === 'jalar') {
      RECIBIDO.jalar++;
      /* Como el Apps Script: TODAS las filas de la pestaña, tengan o no proyecto en el
         teléfono, en una sola página. */
      const registros = HISTORICAS.map(d => ({ almacen: 'proyectos', datos: d }));
      if (FILA) {
        registros.push({ almacen: 'proyectos', datos: {
          ...FILA.datos, id_notion: FILA.id, editado: FILA.editado,
          /* Las dos fórmulas: es lo que el espejo del dinero viene a buscar. */
          'Pago Pendiente': 7920, 'Comision Restante': 1200,
          'Estatus': 'COBRANDO', 'Cuenta ': 'Rul HSBC',
        } });
      }
      return json({ ok: true, hay_mas: false, cursor: null, registros });
    }
    if (ruta === 'empujar') {
      const op = (entrada.ops || [])[0] || {};
      RECIBIDO.empujar.push(op);
      /* Las ventas de «la fila que ya no está» (sección 4c) llevan folios COT-94…: no tocan la
         fila V-201 de la venta de arriba. La V-404 se borró de la hoja; un alta sin fila entra
         como una fila nueva, la V-405. Las frases son las de `unaOperacion` en el .gs. */
      if (/^COT-94/.test(String(op.folio_cotizacion || ''))) {
        if (op.id_notion === 'V-404') {
          return json({ ok: true, resultados: [{ id: op.id, ok: false, codigo: 'NO_ENCONTRADO',
            mensaje: 'La venta V-404 ya no está en la hoja: alguien borró su fila. Este cambio no se escribió en ninguna otra. Si la venta sigue viva, vuelve a registrarla desde el cotizador.' }] });
        }
        return json({ ok: true, resultados: [{ id: op.id, ok: true,
          remoto: { id_notion: op.id_notion || 'V-405' }, rechazadas: [] }] });
      }
      FILA = { id: 'V-201', editado: new Date().toISOString(),
               datos: { ...(FILA ? FILA.datos : {}), ...op.datos } };
      return json({ ok: true, resultados: [{ id: op.id, ok: true,
        remoto: { id_notion: FILA.id, editado: FILA.editado, ...op.datos }, rechazadas: [] }] });
    }
    return json({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'ruta no simulada' });
  }

  /* Estático. Sin listados y sin salirse de la raíz. */
  let p = decodeURIComponent(url.pathname);
  if (p === '/' ) p = '/index.html';
  const abs = normalize(join(RAIZ, p));
  if (!abs.startsWith(RAIZ) || !existsSync(abs) || statSync(abs).isDirectory()) {
    res.writeHead(404); return res.end('no está');
  }
  const ext = abs.slice(abs.lastIndexOf('.'));
  res.writeHead(200, { 'Content-Type': TIPOS[ext] || 'application/octet-stream' });
  res.end(readFileSync(abs));
});

await new Promise(r => servidor.listen(PUERTO, '127.0.0.1', r));
const B = 'http://127.0.0.1:' + PUERTO;
console.log('\nservidor y puente de mentiras en ' + B);

/* ---------------------------------------------------------------------------
   El navegador, con el puente ya pegado en este teléfono
   --------------------------------------------------------------------------- */
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ viewport: { width: 430, height: 932 }, isMobile: true,
  hasTouch: true, locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'allow' });

/* Se siembra la configuración, no la venta. La venta se captura con clics: si se sembrara,
   la prueba diría que el puente funciona con un dato que nadie tecleó nunca. */
await ctx.addInitScript(([url, tok]) => {
  try {
    localStorage.setItem('al3d_pf_nombre', 'Elías');
    localStorage.setItem('al3d_pf_rol', 'direccion');
    localStorage.setItem('al3d_pf_puente', JSON.stringify({ url, token: tok }));
  } catch (_) {}
}, [B + '/puente', TOKEN]);

const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));

// ── 1. Cotizar y ganar ────────────────────────────────────────────────────────
await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
await p.waitForTimeout(1200);
await p.fill('#f-cli', 'Andrey');
await p.fill('#f-tel', '33 1234 5678');
await p.fill('#f-proy', 'Healthylicious La Perla');
await p.fill('#f-dir-raw', 'Av. Sta. Margarita 3740 L5, Valle Real');
await p.fill('#f-maps', 'https://www.google.com/maps/place/Plaza+Palma+Real/@20.7108,-103.4192,17z');
await p.waitForTimeout(400);
const cont = await p.$('.mbar .mbar-btn');
if (cont) await cont.click();
await p.waitForTimeout(800);

if (!(await p.$('#items .partida'))) { await p.click('#addbtn'); await p.waitForTimeout(500); }
for (const c of await p.$$('#items .partida button, #items .partida .chip')) {
  if (/Acero/i.test((await c.innerText()).trim())) { await c.click(); break; }
}
await p.waitForTimeout(300);
const campos = await p.$$('#items .partida input[type="number"], #items .partida input[inputmode="decimal"], #items .partida input[inputmode="numeric"]');
if (campos.length >= 2) { await campos[0].fill('40'); await campos[1].fill('8'); }
await p.waitForTimeout(500);

await p.evaluate(() => autorizarYoMismo());
await p.waitForTimeout(500);
await p.evaluate(() => { const i = document.getElementById('pa-autorizador'); if (i) i.value = 'Elías'; });
await p.evaluate(() => { if (typeof autorizar === 'function') autorizar(); });
await p.waitForTimeout(700);
(await p.evaluate(() => Q.estado)) === 'autorizada'
  ? bien('la cotización quedó autorizada') : mal('no se autorizó');

await p.evaluate(() => abrirRegistrarVenta());
await p.waitForTimeout(600);
/* La fecha de instalación es la única captura humana real del sistema, y es la que hace que
   la fila de Notion tenga por fin una fecha de verdad.

   Va en `rv-fecha-inst` y NO en `rv-fecha`. Eran el mismo campo, precargado con hoy, y por
   eso toda venta registrada sin tocarlo nacía agendada para instalar el mismo día. Ahora
   son dos: `rv-fecha` es el anticipo —sigue precargado con hoy, que es cuando se cobra— y
   `rv-fecha-inst` la instalación, que nace vacía porque casi nunca se sabe todavía. Esta
   prueba llena la segunda, que es la que la columna «Fecha instalación» de la hoja espera. */
await p.evaluate(() => { const f = document.getElementById('rv-fecha-inst'); if (f) f.value = '2026-09-01'; });
/* Por id y no por texto: «Registrar venta» es también el nombre del hito que ABRE el modal. */
const btn = await p.$('#rv-registrar');
if (!btn) mal('no está el botón de ganar'); else { await btn.click(); await p.waitForTimeout(800); }
const buzon = await p.evaluate(() => JSON.parse(localStorage.getItem('al3d_pf_ganadas') || '[]'));
buzon.length === 1 ? bien('quedó constancia en el buzón: ' + buzon[0].folio) : mal('el buzón tiene ' + buzon.length);

// ── 2. Abrir la plataforma. Aquí NADIE aprieta nada más ───────────────────────
await p.goto(B + '/#/proyectos', { waitUntil: 'load' });
await p.waitForTimeout(5000);

console.log('\nLA VENTA SALIÓ SOLA HACIA LA HOJA');
RECIBIDO.salud > 0 ? bien('el relevo preguntó qué puede escribir este token (/salud)')
                   : mal('nunca preguntó /salud: la lista blanca del rol no se consultó');
if (!RECIBIDO.empujar.length) {
  mal('NO se mandó nada a la hoja: el puente está enchufado y la bandeja no salió sola');
} else {
  bien('se mandó ' + RECIBIDO.empujar.length + ' operación sin que nadie apretara un botón');

  /* ── Quién manda qué, y por qué son dos ──────────────────────────────────────
     La PRIMERA operación no es de la plataforma: la manda el cotizador en el momento de
     apretar «Registrar venta», con lo que el modal tiene a la mano —el dinero, la cuenta,
     el estatus y las dos fechas—. Es lo que hace que la venta esté en la hoja aunque nadie
     abra la plataforma en tres días.

     La de la PLATAFORMA viene después y trae lo que solo ella sabe derivar: la ubicación
     resuelta del link de Maps y el tipo de trabajo sacado de las partidas. Las dos caen en
     la MISMA fila porque las dos van con el mismo `Folio cotizacion`, que es la llave con
     la que el puente busca antes de crear. */
  const dCot = RECIBIDO.empujar[0].datos || {};
  const opPlat = RECIBIDO.empujar.find(o => o && o.tipo === 'crear');
  const d = (opPlat && opPlat.datos) || {};

  console.log('\n  — lo que manda el cotizador al registrar la venta —');
  dCot['Proyecto'] ? bien('lleva el nombre: «' + dCot['Proyecto'] + '»') : mal('sin nombre: sería una fila en blanco en el libro del dinero');
  /^COT-\d+@/.test(dCot['Folio cotizacion'] || '') ? bien('lleva el folio con su dispositivo: ' + dCot['Folio cotizacion'])
    : mal('sin folio global: nada ataría la fila al cotizador, y la plataforma crearía una segunda');
  dCot['Precio Subtotal'] > 0 ? bien('lleva el subtotal, que es de lo que cuelgan el neto y la comisión')
    : mal('sin subtotal: la hoja no podría calcular nada');
  dCot['Estatus'] && dCot['Cuenta '] ? bien('y la cuenta de cobro con su estatus: ' + dCot['Cuenta '] + ' · ' + dCot['Estatus'])
    : mal('sin cuenta o sin estatus');
  dCot['Fecha instalacion'] === '2026-09-01' ? bien('la fecha de instalación va en SU columna')
    : mal('la fecha de instalación llegó como «' + dCot['Fecha instalacion'] + '»');
  /* La que se rompía: la columna del anticipo es «Fecha anticipo» y de ella cuelgan los
     días de cobro y la antigüedad de la cartera. Si le llega la instalación, toda la
     cobranza empieza a contar desde el día equivocado. */
  dCot['Fecha Anticipo e Instalacion'] !== '2026-09-01'
    ? bien('y la del anticipo NO se pisa con la instalación: ' + dCot['Fecha Anticipo e Instalacion'])
    : mal('la instalación se escribió encima de «Fecha anticipo»: eso le mueve la antigüedad a toda la cartera');

  console.log('\n  — y lo que agrega la plataforma, que es lo que solo ella deriva —');
  opPlat ? bien('la plataforma mandó su alta') : mal('la plataforma no mandó ningún alta');
  d['Proyecto'] ? bien('lleva el nombre derivado: «' + d['Proyecto'] + '»') : mal('sin nombre: sería una fila en blanco en la base del dinero');
  (dCot['Folio cotizacion'] && d['Folio cotizacion'] === dCot['Folio cotizacion'])
    ? bien('con el MISMO folio que mandó el cotizador  ← por eso caen en una sola fila y no en dos')
    : mal('el folio no coincide con el del cotizador: serían dos ventas');
  d['Direccion'] ? bien('LLEVA LA DIRECCIÓN: «' + d['Direccion'] + '»  ← el hueco de las 199 filas')
                 : mal('sin dirección, que es el defecto que todo esto vino a arreglar');
  /^20\.71/.test(d['Ubicacion'] || '') ? bien('lleva la ubicación sacada del link de Maps: ' + d['Ubicacion'])
                                       : mal('sin ubicación (dio «' + d['Ubicacion'] + '»)');
  (Array.isArray(d['Tipo de trabajo']) && d['Tipo de trabajo'].length)
    ? bien('lleva el tipo de trabajo DERIVADO: ' + JSON.stringify(d['Tipo de trabajo']) + '  ← el campo que nunca se llenaba')
    : mal('tipo de trabajo vacío: es el criterio de éxito nº1');
  d['Fecha instalacion'] === '2026-09-01' ? bien('lleva la fecha de instalación de verdad')
    : mal('la fecha de instalación llegó como «' + d['Fecha instalacion'] + '»');
  d['Fecha Anticipo e Instalacion'] !== '2026-09-01'
    ? bien('y tampoco pisa la del anticipo: ' + d['Fecha Anticipo e Instalacion'])
    : mal('la columna del anticipo llegó con la fecha de instalación');
  d['Etapa de obra'] === 'Ganado' ? bien('la etapa va con el nombre que se lee en el tablero')
    : mal('la etapa llegó como «' + d['Etapa de obra'] + '», que el puente rechazaría');

  const prohibidas = ['Precio Neto ', 'Pago Pendiente', 'Comisiones', 'Comision Restante', 'Fecha Comision']
    .filter(k => d[k] !== undefined);
  prohibidas.length ? mal('mandó fórmulas de la hoja: ' + prohibidas.join(', '))
                    : bien('no mandó ni una fórmula de la hoja');
  const fuera = Object.keys(d).filter(k => !ESCRIBIBLES_DIRECCION.includes(k));
  fuera.length ? mal('mandó propiedades fuera de la lista blanca del rol: ' + fuera.join(', '))
               : bien('todo lo que mandó está en la lista blanca de Dirección');
}

// ── 3. El id de la página, para que un reintento no cree una segunda venta ────
const est = await p.evaluate(async () => {
  const DB = await import('./js/datos/db.js');
  const S = await import('./js/datos/sync.js');
  const proys = await DB.listar('proyectos');
  return { n: proys.length, pageId: proys[0] && proys[0].notion_page_id,
           estadoNotion: proys[0] && proys[0].notion_estado,
           pendientes: (await S.pendientes()).length,
           apartadas: (await S.sinDestino()).length,
           pagoPendiente: proys[0] && proys[0].pago_pendiente,
           estatus: proys[0] && proys[0].estatus_notion,
           cuenta: proys[0] && proys[0].cuenta,
           nombre: proys[0] && proys[0].nombre };
});
console.log('\nLO QUE QUEDÓ GUARDADO DE ESTE LADO');
est.pageId ? bien('se guardó el folio de la fila: ' + est.pageId + '  ← sin esto, el próximo cambio crearía otra fila')
           : mal('NO se guardó el id de la fila remota');
est.estadoNotion === 'enviado' ? bien('el proyecto quedó marcado como enviado') : mal('notion_estado quedó en «' + est.estadoNotion + '»');
est.pendientes === 0 ? bien('la bandeja de salida quedó vacía') : mal('quedaron ' + est.pendientes + ' pendientes');

console.log('\nEL ESPEJO DEL DINERO BAJÓ');
est.pagoPendiente === 7920 ? bien('el pago pendiente llegó de la fórmula de la hoja: ' + est.pagoPendiente)
  : mal('pago_pendiente quedó en ' + JSON.stringify(est.pagoPendiente) + ', esperaba 7920');
est.estatus === 'COBRANDO' ? bien('el estatus de dinero bajó: COBRANDO') : mal('estatus_notion: ' + est.estatus);
est.cuenta === 'Rul HSBC' ? bien('la cuenta bajó: Rul HSBC') : mal('cuenta: ' + est.cuenta);
/* Y lo que NO tiene que bajar: el nombre lo manda la plataforma, no la hoja. */
est.nombre && !/OTRO/.test(est.nombre) ? bien('el nombre del proyecto sigue siendo el de la plataforma: «' + est.nombre + '»')
  : mal('el nombre se lo comió el espejo');

// ── 3a. El récord de ventas de la hoja, entero ───────────────────────────────
console.log('\nEL RÉCORD DE VENTAS DE LA HOJA BAJÓ ENTERO');
const rec = await p.evaluate(async () => {
  const DB = await import('./js/datos/db.js');
  const filas = await DB.listar('ventas_hoja');
  const optica = filas.find(f => f.id === 'hoja:V-150') || null;
  return { n: filas.length, ids: filas.map(f => f.id).sort(), optica };
});
rec.n === 3 ? bien('las tres filas de la hoja están en ventas_hoja: las dos que nunca pasaron por este teléfono y la de esta venta')
            : mal('ventas_hoja tiene ' + rec.n + ' filas: ' + rec.ids.join(', '));
rec.optica && rec.optica.neto === 11600 && rec.optica.pago_pendiente === 6600
  ? bien('con el neto y el saldo tal como los calcula la hoja') : mal('la fila de la hoja bajó mal: ' + JSON.stringify(rec.optica));
rec.optica && rec.optica.etapa === null ? bien('y sin inventarle una etapa de obra a una fila que no la trae') : mal('etapa: ' + JSON.stringify(rec.optica && rec.optica.etapa));

console.log('\nY CONTROL LO SUMA');
await p.evaluate(() => { location.hash = '#/control'; });
await p.waitForTimeout(2500);
const per = await p.$('[data-periodo="todo"]');
if (per) { await per.click(); await p.waitForTimeout(500); }
const ctl = await p.evaluate(() => {
  const lim = s => String(s || '').replace(/\s+/g, ' ').trim();
  const linea = document.querySelector('.ct-hoja');
  return {
    linea: lim(linea && linea.innerText),
    cuentas: [...document.querySelectorAll('.pf-cuenta')].map(c => lim(c.innerText)),
    filas: [...document.querySelectorAll('.ct-fila')].map(f => ({
      titulo: lim((f.querySelector('.pf-fila-t') || {}).innerText),
      abrir: !!f.querySelector('[data-abrir]'),
    })),
  };
});
if (process.env.CAPTURA) { try { await p.screenshot({ path: process.env.CAPTURA, fullPage: true }); } catch (_) {} }
/con la hoja de finanzas/i.test(ctl.linea) ? bien('arriba del récord dice que los números son con la hoja: «' + ctl.linea + '»')
  : mal('la línea de la hoja dice «' + ctl.linea + '»');
/3 ventas/.test(ctl.linea) ? bien('y cuenta las tres ventas de la hoja, la de este teléfono enlazada entre ellas') : mal('no cuenta 3 ventas de la hoja');
const vendido = ctl.cuentas.find(c => /^\$[\d,.]+ Vendido en/i.test(c)) || '';
/2 ventas/.test(vendido) ? bien('«Vendido este mes» suma la venta capturada en la hoja con la de este teléfono: «' + vendido + '»')
  : mal('«Vendido este mes» no suma las dos: «' + vendido + '»');
const cobrar = ctl.cuentas.find(c => /por cobrar/i.test(c)) || '';
/según la hoja/i.test(cobrar) && !/estimado/i.test(cobrar)
  ? bien('y «Por cobrar» ya no dice «estimado» cuando todos los saldos son de la hoja: «' + cobrar + '»')
  : mal('«Por cobrar» dice: «' + cobrar + '»');
const optica = ctl.filas.find(f => /Óptica Lux/.test(f.titulo));
optica && /hoja/.test(optica.titulo) ? bien('la venta capturada en la hoja está en la lista, marcada «hoja»') : mal('no está Óptica Lux marcada como de la hoja: ' + JSON.stringify(ctl.filas));
optica && !optica.abrir ? bien('y no tiene «Abrir»: no hay proyecto que abrir') : mal('una fila de la hoja ofrece «Abrir»');
ctl.filas.some(f => /Farmacia Guadalajara/.test(f.titulo)) ? bien('la de 2024 también está, sin folio de cotización y sin etapa') : mal('no está Farmacia Guadalajara');
const propia = ctl.filas.find(f => /Healthylicious/.test(f.titulo));
propia && !/hoja|solo aquí/.test(propia.titulo) && propia.abrir ? bien('la de este teléfono, que ya está en la hoja, no lleva etiqueta y sí se abre')
  : mal('la venta propia quedó así: ' + JSON.stringify(propia));

console.log('\nLO QUE LA HOJA BORRA, SE VA DEL RÉCORD');
HISTORICAS = HISTORICAS.filter(h => h.id_notion !== 'V-001');
const purga = await p.evaluate(async () => {
  const DB = await import('./js/datos/db.js');
  const S = await import('./js/datos/sync.js');
  let r, vueltas = 0;
  do { r = await S.jalar(); vueltas++; } while (r.ok && r.valor.hay_mas && vueltas < 5);
  const filas = await DB.listar('ventas_hoja');
  return { ok: r.ok, borrados: r.valor && r.valor.borrados, n: filas.length, ids: filas.map(f => f.id).sort(),
           sinCambio: r.valor && r.valor.sin_cambio };
});
purga.ok && purga.borrados === 1 ? bien('al cerrar el barrido se quitó la fila que la hoja ya no trajo') : mal('borrados: ' + JSON.stringify(purga));
purga.n === 2 && !purga.ids.includes('hoja:V-001') ? bien('quedan las dos que sí están en la hoja') : mal('quedan: ' + purga.ids.join(', '));
purga.sinCambio >= 2 ? bien('y las que no cambiaron no se reescribieron (' + purga.sinCambio + ' sin cambio)') : mal('sin_cambio: ' + purga.sinCambio);

// ── 3b. El segundo cambio va como cambio, no como alta ───────────────────────
console.log('\nEL SEGUNDO CAMBIO DEL MISMO PROYECTO');
const antesDelSegundo = RECIBIDO.empujar.length;
await p.evaluate(async () => {
  const DB = await import('./js/datos/db.js');
  const P = await import('./js/datos/proyectos.js');
  const S = await import('./js/datos/sync.js');
  const proy = (await DB.listar('proyectos'))[0];
  await P.actualizar(proy.id, { notas: 'llamó el cliente' });
  await S.bombear();
});
await p.waitForTimeout(1500);
const seg = RECIBIDO.empujar[RECIBIDO.empujar.length - 1];
RECIBIDO.empujar.length > antesDelSegundo ? bien('se mandó') : mal('no se mandó el segundo cambio');
seg && seg.id_notion === 'V-201'
  ? bien('con el folio de la fila que ya existía  ← la foto de la bandeja lo trae en null para siempre')
  : mal('fue SIN id_notion (' + JSON.stringify(seg && seg.id_notion) + '): pediría un alta y serían dos ventas');
seg && seg.tipo === 'actualizar' ? bien('y como cambio, no como alta') : mal('fue «' + (seg && seg.tipo) + '»');

// ── 4. Lo que este puente no lleva: apartado, no perdido ─────────────────────
console.log('\nLO QUE ESTE PUENTE NO LLEVA');
const apart = await p.evaluate(async () => {
  const DB = await import('./js/datos/db.js');
  const S = await import('./js/datos/sync.js');
  await S.encolar({ id: 'op-mov-1', tipo: 'apendice', almacen: 'movimientos',
                    registro_id: 'mov-1', datos: { id: 'mov-1', cantidad: 5 }, ts: Date.now() });
  const antes = (await S.pendientes()).length;
  const r = await S.bombear();
  const apartadas = await S.sinDestino();
  const mio = apartadas.find(o => o.id === 'op-mov-1');
  return { antes, apartadas: apartadas.length, mio: !!mio, motivo: mio && mio.ultimo_error,
           frases: apartadas.map(o => o.ultimo_error),
           pendientes: (await S.pendientes()).length, sinDestinoDelBombeo: r.valor && r.valor.sin_destino,
           sigueEnLaBase: !!(await DB.obtener('pendientes', 'op-mov-1')) };
});
apart.mio ? bien('un movimiento de almacén se aparta en vez de intentarse contra un puente que no sabe qué hacer con él')
          : mal('el movimiento no se apartó');
apart.sigueEnLaBase ? bien('y NO se perdió: sigue en la bandeja para el día que exista su base') : mal('SE PERDIÓ');
apart.pendientes === 0 ? bien('y deja de contarse como «pendiente de mandar», que nunca bajaría') : mal('sigue contándose: ' + apart.pendientes);
/* La derivación de material ya había encolado lo suyo: son varios y todos se apartan. */
apart.apartadas >= 1 ? bien('se apartaron ' + apart.apartadas + ' en total (el almacén y las listas de compra que derivó la venta)')
                     : mal('no se apartó nada');
apart.motivo && /libro del almacén se queda/.test(apart.motivo)
  ? bien('con la razón escrita, y en su idioma: «' + apart.motivo + '»')
  : mal('sin razón, o mal escrita: «' + apart.motivo + '»');
apart.frases.every(t => !/(compra|listas) se queda /.test(t))
  ? bien('y ninguna razón concuerda mal en plural')
  : mal('una razón dice «las listas de compra se queda»: ' + JSON.stringify(apart.frases));

// ── 4b. Un rechazo de UNA operación no traba la bandeja ──────────────────────
/* Un alta desde un teléfono cuyo rol no escribe el nombre del proyecto vuelve rechazada, y
   reintentar no la arregla. Hasta septiembre de 2026 volvía como un ROL_SIN_PERMISO pelón
   —el mismo código que una llave que la hoja no reconoce— y `bombear` se paraba en ella:
   lo que estaba detrás no salía nunca. Ahora el relevo la marca `definitivo` y el bombeo
   la aparta con su razón y sigue. */
console.log('\nUN RECHAZO DE UNA SOLA OPERACIÓN NO TRABA LA BANDEJA');
const traba = await p.evaluate(async () => {
  const DB = await import('./js/datos/db.js');
  const S = await import('./js/datos/sync.js');
  const P = await import('./js/datos/puente.js');
  const mandadas = [];
  S.registrar({
    nombre: 'falso', lleva: a => a === 'proyectos', motivo: () => 'no lo lleva',
    async subir(ops) {
      return ops.map(op => {
        mandadas.push(op.registro_id);
        return op.registro_id === 'alta-sin-permiso'
          ? { id: op.id, ok: false, codigo: 'ROL_SIN_PERMISO', definitivo: true,
              mensaje: 'Este teléfono no puede dar de alta la venta en la hoja: su rol no escribe el nombre del proyecto.' }
          : { id: op.id, ok: true, remoto: null, rechazadas: [] };
      });
    },
    async bajar() { return { registros: [], cursor: null, hay_mas: false }; },
  });
  try {
    await S.encolar({ id: 'op-traba-a', tipo: 'crear', almacen: 'proyectos', registro_id: 'alta-sin-permiso', datos: { id: 'alta-sin-permiso' }, ts: 1 });
    await S.encolar({ id: 'op-traba-b', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'etapa-de-otro', datos: { id: 'etapa-de-otro' }, ts: 2 });
    const b1 = await S.bombear();
    const b2 = await S.bombear();
    const rech = await S.rechazadas();
    const banda = (await S.frescura()).texto;
    const pendientes = (await S.pendientes()).length;
    const sigueGuardada = !!(await DB.obtener('pendientes', 'op-traba-a'));
    const errorVivo = S.estado().ultimo_error || '';
    const mandadasAntes = mandadas.slice();   // lo de abajo la vuelve a mandar a propósito
    /* «Volver a intentarlos» (Ajustes): regresa a la cola y, si rebota otra vez, se vuelve a apartar. */
    const re = await S.reintentarRechazadas();
    const enCola = (await S.pendientes()).length;
    await S.bombear();
    const otraVezApartada = (await S.rechazadas()).length;
    const tirada = await S.resolver('op-traba-a', 'suyo');
    return { mandadas: mandadasAntes, b1: b1.valor, b2: b2.valor, pendientes, rech: rech.map(o => [o.id, o.ultimo_error]), banda,
             sigueGuardada, tirada: tirada.ok, quedan: (await S.rechazadas()).length,
             errorVivo, reencoladas: re.valor && re.valor.reencoladas, enCola, otraVezApartada };
  } finally {
    S.registrar(P.desdePrefs());   // el relevo de verdad, para lo que sigue
  }
});
traba.mandadas.includes('etapa-de-otro') ? bien('la operación de detrás de la rechazada SÍ salió')
  : mal('la bandeja se trabó en la rechazada: ' + JSON.stringify(traba.mandadas));
traba.mandadas.filter(x => x === 'alta-sin-permiso').length === 1 ? bien('y la rechazada no se reintenta en cada bombeo')
  : mal('la rechazada se mandó ' + traba.mandadas.filter(x => x === 'alta-sin-permiso').length + ' veces');
traba.b1 && traba.b1.rechazadas === 1 && traba.b1.fallidas === 1 && traba.b1.subidas === 1
  ? bien('el bombeo lo cuenta: 1 subida, 1 rechazada (y fallida, para que Ajustes no diga «nada que mandar» en verde)')
  : mal('conteo del bombeo: ' + JSON.stringify(traba.b1));
traba.pendientes === 0 ? bien('la rechazada ya no se cuenta como pendiente') : mal('pendientes: ' + traba.pendientes);
traba.rech.length === 1 && /no puede dar de alta/.test(traba.rech[0][1]) && traba.sigueGuardada
  ? bien('se apartó con su razón, sin perderse: «' + traba.rech[0][1] + '»') : mal('apartadas: ' + JSON.stringify(traba.rech));
/No se pudo mandar 1 cambio/.test(traba.banda || '') && /Ajustes/.test(traba.banda || '') ? bien('y la banda de frescura lo dice, y dónde se reintenta: «' + traba.banda + '»')
  : mal('la banda no dice nada del rechazo: «' + traba.banda + '»');
traba.errorVivo === '' ? bien('lo apartado no queda como «último error»: la banda de «no ha podido mandar» no se enciende por él')
  : mal('el rechazo quedó como último error: «' + traba.errorVivo + '»');
traba.reencoladas === 1 && traba.enCola === 1 && traba.otraVezApartada === 1
  ? bien('«Volver a intentarlos» lo regresa a la cola, y si rebota otra vez se vuelve a apartar')
  : mal('reintentar: ' + JSON.stringify({ r: traba.reencoladas, c: traba.enCola, a: traba.otraVezApartada }));
traba.tirada && traba.quedan === 0 ? bien('y se puede descartar con resolver(…, "suyo")') : mal('no se pudo descartar');

// ── 4c. La venta que la hoja ya no tiene: el aviso, el botón y «Qué atender» ──
/* pruebas/puente.mjs recorre el camino de datos; esto es lo que ve la persona. Nada se borra
   solo: la ficha lo dice, Dirección aprieta, y la otra pantalla —«Qué atender»— lleva a la
   ficha de la tarjeta importada cuya fila ya no vino. */
console.log('\nLA VENTA QUE LA HOJA YA NO TIENE');
const sembrar = async (proys, rol) => p.evaluate(async ([lista, rol]) => {
  const DB = await import('./js/datos/db.js');
  for (const x of lista) await DB.poner('proyectos', x);
  localStorage.setItem('al3d_pf_rol', rol);
}, [proys, rol]);
const proyPrueba = (id, fg, np, o) => ({ id, folio_local: fg.split('@')[0], dispositivo: 'PRUEBA', folio_global: fg,
  nombre: 'Lavandería Azul - Letras', contacto: 'Rosa', negocio: 'Lavandería Azul', etapa: 'ganado',
  tipo_trabajo: ['Letras 3D con iluminacion'], fecha_ganado: HOY_MX, dir_texto: 'Calle 5 #10', lat: null, lng: null,
  sub: 8000, neto: 9280, precio_auth: 9280, anti_pactado: 4000, iva: true, notion_page_id: np, notion_estado: 'enviado',
  estatus_notion: 'FABRICACION', cuenta: 'Elias BBVA', pago_pendiente: null, comision_restante: null, pct_comision: 0,
  plazo_k: null, notas: '', origen: { folio: fg.split('@')[0], items: [] }, ...o });
await sembrar([proyPrueba('proy-pr-404', 'COT-9404@PRUEBA', 'V-404'),
               proyPrueba('proy-pr-com', 'COT-9415@PRUEBA', 'V-201x', { nombre: 'Tintorería Vieja - Caja', pct_comision: 15 })], 'direccion');
const marca404 = await p.evaluate(async () => {
  const DB = await import('./js/datos/db.js');
  const P = await import('./js/datos/proyectos.js');
  const S = await import('./js/datos/sync.js');
  await P.actualizar('proy-pr-404', { notas: 'el cliente cambió de local' });
  await S.bombear();
  const x = await DB.obtener('proyectos', 'proy-pr-404');
  return { marca: x.hoja_perdida, fila: x.notion_page_id,
           apartadas: (await S.rechazadas()).filter(o => o.registro_id === 'proy-pr-404').length };
});
marca404.marca && marca404.marca.motivo === 'borrada' && marca404.fila === 'V-404' && marca404.apartadas === 1
  ? bien('el cambio contra la fila borrada se aparta y el proyecto queda marcado, con su fila intacta')
  : mal('la marca quedó así: ' + JSON.stringify(marca404));

const abrirLaFicha = async id => {
  await p.evaluate(() => { location.hash = '#/tablero'; });
  await p.waitForTimeout(600);
  await p.evaluate(() => { location.hash = '#/proyectos'; });
  await p.waitForTimeout(1500);
  await p.click('[data-abrir="' + id + '"]');
  await p.waitForTimeout(700);
  return p.evaluate(() => {
    const f = document.getElementById('pf-ficha');
    return { txt: (f && f.innerText) || '', alta: !!(f && f.querySelector('[data-hoja-alta]')),
             fuera: !!(f && f.querySelector('[data-hoja-fuera]')), quitar: !!(f && f.querySelector('[data-hoja-quitar]')) };
  });
};

await sembrar([], 'fabricacion');
const fab404 = await abrirLaFicha('proy-pr-404');
/ya no está en la hoja/.test(fab404.txt) && !fab404.alta && !fab404.fuera
  ? bien('fabricación ve el aviso, sin los botones: lo decide Dirección') : mal('fabricación ve: ' + JSON.stringify({ ...fab404, txt: fab404.txt.slice(0, 200) }));
const fabCom = await abrirLaFicha('proy-pr-com');
!/Comisi/.test(fabCom.txt) ? bien('y en la ficha con % de comisión, fabricación no ve ni una línea de dinero') : mal('fabricación ve la comisión');

await sembrar([], 'direccion');
const dirCom = await abrirLaFicha('proy-pr-com');
/Comisión pactada \(antes de fijarla en 10 %\)\s*15 %/.test(dirCom.txt)
  ? bien('un 15 % viejo se rotula como lo que es: lo pactado antes de fijarla en 10 %, no lo que se cobra')
  : mal('la comisión dice: ' + ((/Comisi[^\n]*\n?[^\n]*/.exec(dirCom.txt) || [''])[0]));
const dir404 = await abrirLaFicha('proy-pr-404');
/Alguien borró su fila \(V-404\)/.test(dir404.txt) && dir404.alta && dir404.fuera
  ? bien('Dirección ve qué pasó y las dos salidas: volver a darla de alta, o dejarla fuera')
  : mal('la ficha de Dirección dice: ' + dir404.txt.slice(0, 300));
const antesRealta = RECIBIDO.empujar.length;
await p.click('#pf-ficha [data-hoja-alta]');
await p.waitForTimeout(2500);
const realta = await p.evaluate(async () => {
  const DB = await import('./js/datos/db.js');
  const S = await import('./js/datos/sync.js');
  const x = await DB.obtener('proyectos', 'proy-pr-404');
  const f = document.getElementById('pf-ficha');
  return { fila: x.notion_page_id, marca: x.hoja_perdida, apartadas: (await S.rechazadas()).filter(o => o.registro_id === 'proy-pr-404').length,
           aviso: /ya no está en la hoja/.test((f && f.innerText) || ''), toast: (document.getElementById('toast') || {}).innerText || '' };
});
const altaNueva = RECIBIDO.empujar.slice(antesRealta).find(o => o.folio_cotizacion === 'COT-9404@PRUEBA') || null;
altaNueva && altaNueva.tipo === 'crear' && !altaNueva.id_notion && altaNueva.datos['Proyecto'] && altaNueva.datos['Precio Subtotal'] === 8000
  ? bien('«Volver a darla de alta» manda UN alta completa, sin la fila muerta: nombre, subtotal y lo demás')
  : mal('lo que salió: ' + JSON.stringify(altaNueva));
realta.fila === 'V-405' && !realta.marca && realta.apartadas === 0 && !realta.aviso
  ? bien('y la venta queda en su fila nueva, sin marca, sin lo apartado y sin aviso: «' + realta.toast + '»')
  : mal('después del alta: ' + JSON.stringify(realta));

/* La tarjeta importada cuya fila se borró, desde «Qué atender». */
HISTORICAS.push(filaHoja('V-300', 'Taller Sur - Vinil', { 'Estatus': 'FABRICACION', 'Fecha Anticipo e Instalacion': HOY_MX }));
await p.evaluate(async () => { const S = await import('./js/datos/sync.js'); await S.jalar(); });
HISTORICAS = HISTORICAS.filter(h => h.id_notion !== 'V-300');
const huer = await p.evaluate(async () => {
  const DB = await import('./js/datos/db.js');
  const S = await import('./js/datos/sync.js');
  const antes = !!(await DB.obtener('proyectos', 'proy-hoja-V-300'));
  const r = await S.jalar();
  const x = await DB.obtener('proyectos', 'proy-hoja-V-300');
  return { antes, completa: r.ok && r.valor.completa, sigue: !!x, marca: x && x.hoja_perdida };
});
huer.antes && huer.completa && huer.sigue && huer.marca && huer.marca.motivo === 'no_bajo'
  ? bien('la tarjeta importada cuya fila ya no vino se MARCA en la bajada completa; no se borra')
  : mal('la tarjeta importada quedó así: ' + JSON.stringify(huer));
await p.evaluate(() => { location.hash = '#/atender'; });
await p.waitForTimeout(2500);
const regla = await p.evaluate(() => {
  const f = [...document.querySelectorAll('.pf-fila')].find(x => /Taller Sur - Vinil ya no está en la hoja/.test(x.innerText));
  const b = f && [...f.querySelectorAll('[data-acc]')].find(x => /Abrir la ficha/.test(x.innerText));
  if (b) b.click();
  return { hay: !!f, boton: !!b };
});
regla.hay && regla.boton ? bien('«Qué atender» la nombra para Dirección, con «Abrir la ficha»') : mal('«Qué atender»: ' + JSON.stringify(regla));
await p.waitForTimeout(2000);
const fichaHuer = await p.evaluate(() => {
  const f = document.getElementById('pf-ficha');
  return { abierta: !!(f && f.classList.contains('show')), txt: (f && f.innerText) || '',
           quitar: !!(f && f.querySelector('[data-hoja-quitar]')), dejar: !!(f && f.querySelector('[data-hoja-dejar]')) };
});
fichaHuer.abierta && /Taller Sur/.test(fichaHuer.txt) && fichaHuer.quitar && fichaHuer.dejar
  ? bien('el botón abre SU ficha, con «Quitar del tablero» y «Dejarla»') : mal('la ficha: ' + JSON.stringify({ ...fichaHuer, txt: fichaHuer.txt.slice(0, 200) }));
let pregunta = '';
p.once('dialog', d => { pregunta = d.message(); d.accept(); });
await p.click('#pf-ficha [data-hoja-quitar]');
await p.waitForTimeout(1500);
const quitada = await p.evaluate(async () => {
  const DB = await import('./js/datos/db.js');
  return !(await DB.obtener('proyectos', 'proy-hoja-V-300'));
});
/Quitar «Taller Sur - Vinil» del tablero/.test(pregunta) && quitada
  ? bien('«Quitar del tablero» pregunta antes y, con el sí, la quita') : mal('quitar: ' + JSON.stringify({ pregunta, quitada }));

// ── 5. La pantalla de Ajustes ────────────────────────────────────────────────
console.log('\nLA PANTALLA DE AJUSTES');
await p.evaluate(() => { location.hash = '#/ajustes'; });
await p.waitForTimeout(2500);
const antesProbar = RECIBIDO.salud;
const btnProbar = await p.$('[data-act="puente-probar"]');
if (!btnProbar) mal('no está el botón «Probar» que el README promete');
else {
  bien('el botón «Probar» está');
  await btnProbar.click();
  await p.waitForTimeout(1500);
  RECIBIDO.salud > antesProbar ? bien('y de verdad le pregunta al puente') : mal('el botón no llamó a /salud');
  const txt = await p.evaluate(() => document.querySelector('.pf-mod:not([hidden])').innerText);
  /reconoce este teléfono/i.test(txt) ? bien('pinta en verde que el puente contesta') : mal('no pintó el resultado');
  /Dirección/.test(txt) ? bien('y dice qué rol reconoció el token') : mal('no dice el rol');
}
const btnEsq = await p.$('[data-act="puente-esquema"]');
if (!btnEsq) mal('no está el botón «Revisar el esquema» que el README promete');
else {
  bien('el botón «Revisar el esquema» está');
  await btnEsq.click();
  await p.waitForTimeout(1500);
  RECIBIDO.esquema > 0 ? bien('y de verdad lee el esquema de la hoja') : mal('no llamó a /esquema');
  const txtEsq = await p.evaluate(() => document.querySelector('.pf-mod:not([hidden])').innerText);
  /Accesos/.test(txtEsq) && !/ya tiene las ocho/.test(txtEsq)
    ? bien('y dice que falta la pestaña «Accesos», en vez de «ya tiene todo»')
    : mal('una hoja sin «Accesos» pasó por completa');
}

if (errs.length) mal('errores de página: ' + [...new Set(errs)].slice(0, 3).join(' | '));
else bien('cero errores de página en todo el camino');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl puente funciona de punta a punta.');
await nav.close();
servidor.close();
process.exit(fallos ? 1 : 0);
