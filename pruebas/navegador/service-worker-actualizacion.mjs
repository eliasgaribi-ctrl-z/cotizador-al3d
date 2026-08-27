/* ¿La versión anterior de la plataforma sobrevive a una actualización que no baja entera?
 *
 * La cabecera de sw.js promete: «Si falta uno, la versión anterior sigue completa y
 * sirviendo». No era verdad, y el camino no lo cubría ninguna prueba:
 *
 *   1. addAll falla por un archivo · el catch borra la caché que se estaba bajando
 *   2. el catch se traga el fallo · install resuelve · corre skipWaiting()
 *   3. activate borra toda caché que no sea CACHE ni APP · borra la ANTERIOR
 *   4. la anterior era la copia completa que estaba sirviendo. Ya no hay ninguna.
 *
 * La prueba de al lado —service-worker.mjs— solo mide la PRIMERA instalación, donde no hay
 * nada anterior que perder, así que no podía ver esto. Esta mide la actualización.
 *
 * Levanta su propio servidor porque necesita decidir qué archivo devuelve 404 y con qué
 * APP_VERSION se sirve sw.js. Se corre así, desde la raíz del repo:
 *
 *   node pruebas/navegador/service-worker-actualizacion.mjs      (o con PUERTO=8816)
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUERTO = Number(process.env.PUERTO || 8816);

/* Lo que el servidor va cambiando entre las dos mitades de la prueba. */
const estado = { version: 1, romper: null };

const TIPOS = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json',
  '.png':'image/png', '.txt':'text/plain; charset=utf-8' };

const servidor = createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = normalize(ruta).replace(/^(\.\.[/\\])+/, '').replace(/^\//, '') || 'index.html';

  /* El archivo que esta vuelta tiene que faltar. Es lo que provoca que addAll reviente. */
  if (estado.romper && rel === estado.romper) { res.writeHead(404).end('no está'); return; }

  const abs = join(RAIZ, rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404).end('no está'); return; }

  let cuerpo = readFileSync(abs);
  /* sw.js se sirve con la versión que toque, para simular la publicación de una nueva. */
  if (rel === 'sw.js') {
    cuerpo = Buffer.from(String(cuerpo).replace(/const APP_VERSION = \d+;/,
      'const APP_VERSION = ' + estado.version + ';'));
  }
  const ext = rel.slice(rel.lastIndexOf('.'));
  res.writeHead(200, { 'Content-Type': TIPOS[ext] || 'application/octet-stream',
                       'Cache-Control': 'no-store' });
  res.end(cuerpo);
});
await new Promise(r => servidor.listen(PUERTO, '127.0.0.1', r));
const B = 'http://127.0.0.1:' + PUERTO;

const nav = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ serviceWorkers:'allow', locale:'es-MX' });
const p = await ctx.newPage();

const cachés = () => p.evaluate(async () => {
  const ks = await caches.keys(); const out = {};
  for (const k of ks) { const c = await caches.open(k); out[k] = (await c.keys()).length; }
  return out;
});
const registrar = () => p.evaluate(async () => {
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    await reg.update().catch(() => {});
    await Promise.race([ navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error('no activó en 15 s')), 15000)) ]);
    return { ok:true };
  } catch (e) { return { ok:false, error:String(e.message || e) }; }
});

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

/* ---- Mitad 1: se instala la versión 1 ENTERA ---- */
console.log('\nPrimero se instala la versión 1 completa:\n');
await p.goto(B + '/index.html', { waitUntil:'load' });
await registrar();
await p.waitForTimeout(2000);
let c = await cachés();
const v1 = c['al3d-app-1'] || 0;
if (v1 < 30) mal('la versión 1 no quedó completa (' + v1 + ' archivos): la prueba no puede medir nada');
else bien('al3d-app-1 tiene ' + v1 + ' archivos y está sirviendo');

/* ---- Mitad 2: se publica la versión 2 con un archivo roto ---- */
console.log('\nAhora se publica la versión 2 con js/mod/mapa.js devolviendo 404:\n');
estado.version = 2;
estado.romper = 'js/mod/mapa.js';
await p.goto(B + '/index.html', { waitUntil:'load' });
await registrar();
await p.waitForTimeout(3000);
c = await cachés();

const cot = c['al3d-v1'] || 0;
if (cot < 3) mal('la caché del cotizador quedó con ' + cot + ' archivos: se pierde abrir sin señal');
else bien('el cotizador sigue entero (' + cot + ' archivos)');

if (c['al3d-app-2'] !== undefined)
  mal('quedó una al3d-app-2 a medias (' + c['al3d-app-2'] + '): es la mezcla de versiones que la cabecera prohíbe');
else bien('no quedó ninguna al3d-app-2 a medias');

/* LA GARANTÍA QUE SE ROMPÍA */
if ((c['al3d-app-1'] || 0) < 30)
  mal('LA VERSIÓN ANTERIOR SE PERDIÓ: al3d-app-1 quedó en ' + (c['al3d-app-1'] || 0) +
      '. La plataforma se apagó en un teléfono que la tenía funcionando.');
else bien('al3d-app-1 sigue completa (' + c['al3d-app-1'] + '): la plataforma sigue abriendo sin señal');

/* Y que de verdad se pueda servir desde ahí, no solo que exista. */
const sirve = await p.evaluate(async () => {
  const c = await caches.open('al3d-app-1');
  const r = await c.match('./js/mod/mapa.js', { ignoreSearch:true });
  return !!r;
});
if (!sirve) mal('al3d-app-1 existe pero no tiene el módulo del mapa: no serviría');
else bien('y el módulo que falló en la red sigue disponible desde ella');

console.log('\ncachés:', JSON.stringify(c));
console.log(fallos ? '\n' + fallos + ' FALLO(S)'
                   : '\nPasa: una actualización que no baja entera no apaga la plataforma.');
await nav.close(); servidor.close(); process.exit(fallos ? 1 : 0);
