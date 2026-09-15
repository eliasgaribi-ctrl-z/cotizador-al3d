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
let FILA = null;            // la única fila de la hoja de mentiras

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
    if (ruta === 'esquema') { RECIBIDO.esquema++; return json({ ok: true, faltan: [], nota: 'ya está todo' }); }
    if (ruta === 'jalar') {
      RECIBIDO.jalar++;
      if (!FILA) return json({ ok: true, registros: [], cursor: null, hay_mas: false });
      return json({ ok: true, hay_mas: false, cursor: null, registros: [{ almacen: 'proyectos', datos: {
        ...FILA.datos, id_notion: FILA.id, editado: FILA.editado,
        /* Las dos fórmulas: es lo que el espejo del dinero viene a buscar. */
        'Pago Pendiente': 7920, 'Comision Restante': 1200,
        'Estatus': 'COBRANDO', 'Cuenta ': 'Rul HSBC',
      } }] });
    }
    if (ruta === 'empujar') {
      const op = (entrada.ops || [])[0] || {};
      RECIBIDO.empujar.push(op);
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
}

if (errs.length) mal('errores de página: ' + [...new Set(errs)].slice(0, 3).join(' | '));
else bien('cero errores de página en todo el camino');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl puente funciona de punta a punta.');
await nav.close();
servidor.close();
process.exit(fallos ? 1 : 0);
