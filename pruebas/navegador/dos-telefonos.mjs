/* DOS TELÉFONOS DE VERDAD, UNA HOJA (puente-sheets-14).

   pruebas/sincronizacion.mjs prueba la regla con dos copias de js/ en node. Esto es lo mismo con
   la plataforma entera abierta en Chromium: dos perfiles (dos contextos del navegador, cada uno
   con su IndexedDB y su localStorage) en DOS ORÍGENES distintos —dos puertos—, como dos
   teléfonos. Del otro lado está el Apps Script DE VERDAD (puente/hoja-apps-script.gs) corriendo
   en node sobre una hoja de mentiras; nunca se toca la hoja real ni el sitio publicado: toda
   petición que no sea a estos dos servidores se corta.

     A = Dirección (http://127.0.0.1:P)      B = Fabricación (http://127.0.0.1:P+1)

   Recorre: la hoja trae una venta en fabricación → los dos la ven → A la pasa a «Armado», le
   escribe una nota y la agenda → B, al abrir, ve «Armado», la nota y la cita → B corrige el
   teléfono y mueve la cita → A lo ve → A cancela la cita → en B queda cancelada.

     node pruebas/navegador/dos-telefonos.mjs        (o con PUERTO=8830) */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { hojaDeMentiras } from '../comun/hoja-de-mentiras.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUERTO = Number(process.env.PUERTO || 8830);
const TOKEN = { direccion: 'd'.repeat(40), fabricacion: 'f'.repeat(40) };

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const ver = (que, dio, esp) => (JSON.stringify(dio) === JSON.stringify(esp) ? bien(que)
  : mal(que + '\n      dio: ' + JSON.stringify(dio) + '\n      esp: ' + JSON.stringify(esp)));

/* La hoja: preparada para la 14, con una venta que se registró en la propia hoja. */
const H = hojaDeMentiras({ tokens: { [TOKEN.direccion]: 'direccion', [TOKEN.fabricacion]: 'fabricacion' } });
H.run('prepararHojaParaElPuente()');
const alta = H.doPost(JSON.stringify({ ruta: 'empujar', token: TOKEN.direccion, ops: [{ id: 'semilla', id_notion: null,
  datos: { 'Proyecto': 'Ana - Café Luna (Letras)', 'Estatus': 'FABRICACION', 'Cuenta ': 'Elias BBVA', 'Precio Subtotal': 12000,
           'Anticipo': 6000, 'Etapa de obra': 'Ganado', 'Telefono': '33 1000 0000', 'Direccion': 'Av. Vallarta 1',
           'Tipo de trabajo': ['Letras 3D con iluminacion'] }, sellos: {} }] }));
const FOLIO = alta.resultados[0].remoto.id_notion;
const ID = 'proy-hoja-' + FOLIO;

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const servir = () => createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/puente') {
    let crudo = '';
    for await (const t of req) crudo += t;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(H.doPost(crudo)));
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const f = normalize(join(RAIZ, p));
  if (!f.startsWith(RAIZ) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[(/\.[^.]+$/.exec(f) || [''])[0]] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
const s1 = servir(), s2 = servir();
await new Promise(r => s1.listen(PUERTO, '127.0.0.1', r));
await new Promise(r => s2.listen(PUERTO + 1, '127.0.0.1', r));
const ORIGEN = { A: 'http://127.0.0.1:' + PUERTO, B: 'http://127.0.0.1:' + (PUERTO + 1) };

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const salidas = [];
async function telefono(nombre, rol) {
  const base = ORIGEN[nombre];
  const ctx = await nav.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true,
    locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block' });
  /* Nada sale a internet: ni la hoja real, ni Google. */
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    salidas.push(u);
    return r.abort();
  });
  await ctx.addInitScript(([url, tok, rol, disp]) => {
    try {
      if (localStorage.getItem('al3d_pf_puente')) return;
      localStorage.setItem('al3d_pf_nombre', 'Prueba');
      localStorage.setItem('al3d_pf_rol', rol);
      localStorage.setItem('al3d_pf_disp', disp);
      localStorage.setItem('al3d_pf_puente', JSON.stringify({ url, token: tok }));
    } catch (_) {}
  }, [base + '/puente', TOKEN[rol], rol, nombre + 'XYZ'.slice(0, 3)]);
  const p = await ctx.newPage();
  p.errores = [];
  p.on('pageerror', e => p.errores.push(e.message));
  p.base = base;
  return p;
}
/* Abrir la app: arranca, manda y baja sola. Se espera a que la bajada haya escrito. */
async function abrir(p, ruta = '#/proyectos') {
  /* Una recarga de verdad: `goto` a la misma dirección con otro `#` no recarga la app. */
  if (p.url().startsWith(p.base)) await p.reload({ waitUntil: 'load' });
  else await p.goto(p.base + '/' + ruta, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  /* La bajada del arranque puede no haber terminado: se pide una más, como la de cada 30 s. */
  p.ultimaBajada = await p.evaluate(async () => { const S = await import('/js/datos/sync.js'); await S.bombear(); return S.jalar(); });
  await p.waitForTimeout(500);
}
/* Lo que la plataforma hace con un toque, por el mismo módulo que usa la pantalla, y luego manda
   (sin esperar el bombeo diferido). Cada acción es una función propia: la app no deja evaluar
   texto como código (su CSP no lleva 'unsafe-eval'), y está bien que no lo deje. */
const ACCION = {
  etapa: async ([id, e]) => (await import('/js/datos/proyectos.js')).avanzarEtapa(id, e),
  cambiar: async ([id, parche]) => (await import('/js/datos/proyectos.js')).actualizar(id, parche),
  agendar: async ([id, d]) => (await import('/js/datos/agenda.js')).agendar(id, d),
  mover: async ([id, d]) => {
    const DB = await import('/js/datos/db.js');
    const i = (await DB.listar('instalaciones')).find(x => x.proyecto_id === id && x.estado !== 'cancelada');
    return (await import('/js/datos/agenda.js')).reagendar(i.id, d);
  },
  cancelar: async ([id]) => {
    const DB = await import('/js/datos/db.js');
    const i = (await DB.listar('instalaciones')).find(x => x.proyecto_id === id && x.estado !== 'cancelada');
    return (await import('/js/datos/agenda.js')).cancelar(i.id, 'El cliente pospuso');
  },
};
const hacer = async (p, que, ...args) => {
  const r = await p.evaluate(ACCION[que], args);
  await p.evaluate(async () => (await import('/js/datos/sync.js')).bombear());
  return !!(r && r.ok);
};
const leer = (p, id) => p.evaluate(async id => {
  const DB = await import('/js/datos/db.js');
  const pr = await DB.obtener('proyectos', id);
  const ins = (await DB.listar('instalaciones')).filter(i => i.proyecto_id === id);
  const viva = ins.filter(i => i.estado !== 'cancelada').sort((a, b) => b.actualizado_en - a.actualizado_en)[0] || null;
  return pr && { etapa: pr.etapa, notas: pr.notas, tel: pr.tel, plazo_k: pr.plazo_k,
                 cita: viva && [viva.fecha, viva.hora], canceladas: ins.filter(i => i.estado === 'cancelada').length };
}, id);

const A = await telefono('A', 'direccion');
const B = await telefono('B', 'fabricacion');

console.log('\nDOS TELÉFONOS, DOS ORÍGENES: ' + ORIGEN.A + ' y ' + ORIGEN.B);
await abrir(A); await abrir(B);
const a0 = await leer(A, ID), b0 = await leer(B, ID);
ver('los dos ven la venta de la hoja como tarjeta del taller', [a0 && a0.etapa, b0 && b0.etapa], ['ganado', 'ganado']);

console.log('\nA (Dirección) mueve la obra, escribe una nota y agenda');
ver('A la pasa a Armado', await hacer(A, 'etapa', ID, 'armado'), true);
ver('A escribe la nota', await hacer(A, 'cambiar', ID, { notas: 'Llevar escalera de 6 m' }), true);
ver('A agenda el 14 a las 10:00', await hacer(A, 'agendar', ID, { fecha: '2099-01-14', hora: '10:00' }), true);
await abrir(B);
ver('B (Fabricación) al abrir: Armado, la nota y la cita', (({ etapa, notas, cita }) => [etapa, notas, cita])(await leer(B, ID)),
    ['armado', 'Llevar escalera de 6 m', ['2099-01-14', '10:00']]);
/* Y en la pantalla: se vuelve a abrir Proyectos, que pinta lo que hay en la base. */
await B.reload({ waitUntil: 'load' });
await B.waitForTimeout(2500);
const tarjeta = await B.evaluate(() => document.body.innerText || '');
if (process.env.VER) await B.screenshot({ path: process.env.VER });
/Armado/.test(tarjeta) && /14 ene/i.test(tarjeta) ? bien('y la pantalla de Proyectos de B dice «Armado» y la fecha')
  : mal('la pantalla de B no enseña «Armado» y la fecha:\n' + tarjeta.slice(0, 600));

console.log('\nB (Fabricación) corrige el teléfono, pone plazo y mueve la cita');
ver('B corrige el teléfono', await hacer(B, 'cambiar', ID, { tel: '33 2222 3333' }), true);
ver('B pone 2 semanas de taller', await hacer(B, 'cambiar', ID, { plazo_k: 3 }), true);
ver('B mueve la cita al 16 a las 11:30', await hacer(B, 'mover', ID, { fecha: '2099-01-16', hora: '11:30' }), true);
await abrir(A);
ver('A al abrir: el teléfono corregido, el plazo y la cita movida', (({ tel, plazo_k, cita }) => [tel, plazo_k, cita])(await leer(A, ID)),
    ['33 2222 3333', 3, ['2099-01-16', '11:30']]);

console.log('\nA cancela la cita');
ver('A la cancela', await hacer(A, 'cancelar', ID), true);
await abrir(B);
const bf = await leer(B, ID);
ver('en B ya no hay cita viva y la suya quedó cancelada', [bf.cita, bf.canceladas >= 1], [null, true]);

console.log('\nLA HOJA');
ver('dice lo mismo que los dos teléfonos', [H.celda(FOLIO, 'Etapa de obra'), H.celda(FOLIO, 'Notas'), H.celda(FOLIO, 'Telefono'),
    H.celda(FOLIO, 'Plazo taller'), H.celda(FOLIO, 'Fecha instalacion')], ['Armado', 'Llevar escalera de 6 m', '33 2222 3333', '2 semanas', '']);
ver('sin errores en las páginas', [A.errores, B.errores], [[], []]);
ver('y ninguna petición salió a internet (ni a la hoja real)', salidas.filter(u => /script\.google|googleusercontent|sheets/.test(u)), []);

await nav.close();
s1.close(); s2.close();
console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
