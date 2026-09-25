/* CLOUDFLARE PAGES REDIRIGE `x.html` A `/x`, Y LA COPIA GUARDADA TIENE QUE SEGUIR ABRIENDO.
 *
 * El sitio también se publica en Cloudflare Pages, que contesta `cotizador.html` con un 308
 * hacia `/cotizador` (y `dir/index.html` hacia `dir/`). `addAll` sigue esa redirección y guarda
 * una respuesta marcada `redirected`; el estándar dice que una respuesta así, entregada a una
 * NAVEGACIÓN, es un error de red. Como la plataforma se sirve caché primero, en un teléfono con
 * la app instalada el marco del cotizador y cualquier página abierta por su `.html` fallaban
 * AUNQUE hubiera señal — y en GitHub Pages, donde no hay redirección, nunca se veía.
 *
 * Esta prueba levanta un servidor que se porta como Cloudflare, instala el service worker y
 * navega:
 *   1. a `/cotizador.html`, que en la caché quedó guardada como redirección;
 *   2. a `/cotizador`, que no está en la lista con ese nombre;
 *   3. y a las dos SIN RED, que es cuando de verdad se sirve la copia.
 *
 * Levanta su propio servidor:  node pruebas/navegador/service-worker-redireccion.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUERTO = Number(process.env.PUERTO || 8817);

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };

/* Como Cloudflare Pages: `x.html` → 308 a `/x`, `dir/index.html` → 308 a `dir/`; `/x` sirve
   el contenido de `x.html` y `dir/` el de `dir/index.html`. */
const servidor = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const ruta = decodeURIComponent(u.pathname);
  if (/\.html$/.test(ruta)) {
    const destino = ruta.endsWith('/index.html') ? ruta.slice(0, -'index.html'.length) : ruta.slice(0, -'.html'.length);
    res.writeHead(308, { Location: destino + u.search }).end();
    return;
  }
  let rel = normalize(ruta).replace(/^(\.\.[/\\])+/, '').replace(/^\//, '');
  let abs = join(RAIZ, rel);
  if (!rel || (existsSync(abs) && statSync(abs).isDirectory())) { rel = join(rel, 'index.html'); abs = join(RAIZ, rel); }
  else if (!existsSync(abs) && existsSync(abs + '.html')) { rel += '.html'; abs += '.html'; }
  if (!existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404).end('no está'); return; }
  const ext = rel.slice(rel.lastIndexOf('.'));
  res.writeHead(200, { 'Content-Type': TIPOS[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(abs));
});
await new Promise(r => servidor.listen(PUERTO, '127.0.0.1', r));
const B = 'http://127.0.0.1:' + PUERTO;

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ serviceWorkers: 'allow', locale: 'es-MX' });
const p = await ctx.newPage();

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

/* ¿Abrió el cotizador de verdad? Su marcado trae #f-cli; un error de red no trae nada. */
const abre = async (ruta) => {
  try {
    const r = await p.goto(B + ruta, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const hay = await p.$('#f-cli');
    return { ok: !!hay, estado: r ? r.status() : null };
  } catch (e) { return { ok: false, error: String(e.message || e).split('\n')[0] }; }
};

console.log('\nSe instala el service worker contra un servidor que redirige como Cloudflare:\n');
await p.goto(B + '/cotizador?solo=1', { waitUntil: 'load' });
const reg = await p.evaluate(async () => {
  try {
    await navigator.serviceWorker.register('sw.js');
    await Promise.race([navigator.serviceWorker.ready,
      new Promise((_, rej) => setTimeout(() => rej(new Error('no activó en 20 s')), 20000))]);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
reg.ok ? bien('el service worker instaló y activó') : mal('el service worker no activó: ' + reg.error);
await p.waitForTimeout(1500);

const guardada = await p.evaluate(async () => {
  const k = (await caches.keys()).find(n => n.indexOf('al3d-app-') === 0);
  if (!k) return null;
  const r = await (await caches.open(k)).match('./cotizador.html');
  return r ? { redirected: r.redirected } : { falta: true };
});
if (!guardada) mal('no se guardó la caché de la plataforma: la prueba no puede medir nada');
else if (guardada.falta) mal('cotizador.html no quedó en la caché de la plataforma');
else guardada.redirected
  ? bien('la copia de cotizador.html quedó guardada COMO REDIRECCIÓN: es el caso que se prueba')
  : mal('la copia no quedó como redirección: el servidor de la prueba no se está portando como Cloudflare');

console.log('\nCon red:\n');
let r = await abre('/cotizador.html?solo=1');
r.ok ? bien('/cotizador.html abre desde la copia guardada') : mal('/cotizador.html NO abre (' + (r.error || r.estado) + ')');
r = await abre('/cotizador?solo=1');
r.ok ? bien('/cotizador abre') : mal('/cotizador NO abre (' + (r.error || r.estado) + ')');

console.log('\nSin red, que es cuando se sirve la copia de verdad:\n');
await ctx.setOffline(true);
r = await abre('/cotizador.html?solo=1');
r.ok ? bien('/cotizador.html abre sin señal') : mal('/cotizador.html NO abre sin señal (' + (r.error || r.estado) + ')');
r = await abre('/cotizador?solo=1');
r.ok ? bien('/cotizador abre sin señal: se busca como cotizador.html') : mal('/cotizador NO abre sin señal (' + (r.error || r.estado) + ')');
await ctx.setOffline(false);

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nPasa: en Cloudflare Pages la copia guardada abre, con red y sin ella.');
await nav.close();
servidor.close();
process.exit(fallos ? 1 : 0);
