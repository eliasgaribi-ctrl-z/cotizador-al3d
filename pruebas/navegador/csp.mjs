/* LA CSP, EN UN NAVEGADOR DE VERDAD.

   `pruebas/cabeceras.mjs` compara dos listas de texto: los dominios que el código nombra y
   los que `_headers` permite. Eso encuentra el origen que se olvidó, y es barato, y corre
   sin navegador. Lo que NO puede encontrar es todo lo demás: un `blob:` que hacía falta y
   nadie nombró, una fuente que se pide desde dentro de una hoja de estilos de otro dominio,
   un worker que se arma solo. Esas no salen leyendo el código: salen cuando el navegador se
   niega.

   Así que esto levanta el sitio con las cabeceras REALES de `_headers` —parseadas de ese
   archivo, no copiadas aquí, para que no puedan divergir—, lo abre con Chromium y escucha
   el evento `securitypolicyviolation`, que es exactamente lo que el navegador dispara cada
   vez que la política le impide cargar algo.

   Y esa es la parte que importa: en producción ese evento no lo escucha nadie. Una CSP a la
   que le falta un origen no da error de red, no pinta un aviso y no aparece en ningún log.
   El mapa sale gris, o «Cotizar con IA» se queda pensando, y quien está enfrente supone que
   no hay señal. Aquí sí lo escucha alguien.

   Levanta su propio servidor, así que no recibe PUERTO de correr.sh:

     node pruebas/navegador/csp.mjs
*/
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, extname, normalize } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

/* ---------------------------------------------------------------------------
   Parsear _headers como lo hace Cloudflare Pages
   --------------------------------------------------------------------------- */
/* Un bloque es una línea que empieza con `/` y las cabeceras indentadas debajo. Se aplican
   TODOS los bloques cuyo patrón case, no solo el más específico: es como se comporta Pages
   y es de lo que depende que `/*` reparta la CSP a todo y `/sw.js` le sume su Cache-Control. */
function bloques() {
  const out = [];
  let actual = null;
  for (const cruda of readFileSync(join(RAIZ, '_headers'), 'utf8').split('\n')) {
    const l = cruda.replace(/\s+$/, '');
    if (!l.trim() || l.trim().startsWith('#')) continue;
    if (!/^\s/.test(l)) { actual = { patron: l.trim(), cabeceras: [] }; out.push(actual); }
    else if (actual) {
      const i = l.indexOf(':');
      if (i > 0) actual.cabeceras.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]);
    }
  }
  return out;
}
const BLOQUES = bloques();

function casa(patron, ruta) {
  if (patron === ruta) return true;
  if (patron.endsWith('/*')) return ruta.startsWith(patron.slice(0, -1));
  if (patron === '/*') return true;
  /* `/*.html` y `/*.webmanifest` */
  const m = /^\/\*(\.[a-z0-9]+)$/i.exec(patron);
  return !!m && ruta.endsWith(m[1]);
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
};

const servidor = createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  /* Sin esto, cualquiera de las pruebas podría pedir ../../etc/passwd. Es un servidor de
     pruebas y aun así se cierra: un servidor de pruebas es el que acaba corriendo en la
     máquina de alguien con el puerto abierto. */
  const abs = join(RAIZ, normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
  if (!abs.startsWith(RAIZ) || !existsSync(abs) || !statSync(abs).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return;
  }
  const cabeceras = { 'Content-Type': TIPOS[extname(abs)] || 'application/octet-stream' };
  for (const b of BLOQUES) if (casa(b.patron, ruta)) for (const [k, v] of b.cabeceras) cabeceras[k] = v;
  res.writeHead(200, cabeceras);
  res.end(readFileSync(abs));
});

const PUERTO = 8817;
await new Promise(r => servidor.listen(PUERTO, '127.0.0.1', r));
const B = 'http://127.0.0.1:' + PUERTO;

/* ---------------------------------------------------------------------------
   El navegador
   --------------------------------------------------------------------------- */
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX' });

/* Nada de esta prueba sale a internet. Las fuentes, las teselas y los proveedores de IA se
   contestan aquí: lo que se está probando es si la CSP DEJA salir la petición, y eso el
   navegador lo decide antes de que exista la red. Dejarla salir de verdad haría una prueba
   que falla los martes que Google Fonts va lento. */
const externos = [];
await ctx.route('**/*', async ruta => {
  const u = ruta.request().url();
  if (u.startsWith(B)) return ruta.continue();
  externos.push(u);
  const tipo = /\.(png|jpg|webp)$/i.test(u) ? 'image/png'
    : /fonts\.googleapis/.test(u) ? 'text/css'
    : /\.(woff2?|ttf)$/i.test(u) ? 'font/woff2'
    : /\.js$/i.test(u) ? 'text/javascript' : 'application/json';
  return ruta.fulfill({ status: 200, contentType: tipo, body: tipo === 'application/json' ? '{}' : '' });
});

/** Abre una página y devuelve las violaciones de CSP que el navegador reportó.
 *  El listener se instala con `addInitScript` para que exista ANTES de que la página
 *  empiece a cargar: instalarlo después perdería justo las violaciones del arranque, que
 *  son las que rompen la app. */
async function violaciones(url, hacer) {
  const p = await ctx.newPage();
  const vistas = [];
  await p.exposeFunction('__cspViolacion', v => vistas.push(v));
  await p.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => {
      try {
        window.__cspViolacion({
          directiva: e.effectiveDirective || e.violatedDirective,
          bloqueado: String(e.blockedURI || '').slice(0, 200),
          linea: e.lineNumber || 0,
        });
      } catch (_) {}
    });
  });
  const errores = [];
  p.on('pageerror', e => errores.push(String(e.message).slice(0, 160)));
  await p.goto(url, { waitUntil: 'load' });
  /* Cada bloque arranca de cero, por lo mismo que lo hace `cotizador-flujo.mjs`: la app
     guarda la cotización en curso y la pantalla en la que quedó, así que un bloque anterior
     deja el siguiente en la pantalla de partidas y los campos del cliente invisibles. */
  await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  if (hacer) { try { await hacer(p); } catch (e) { errores.push('la interacción falló: ' + e.message); } }
  await p.waitForTimeout(600);
  await p.close();
  return { vistas, errores };
}

/** Junta las violaciones por directiva para no imprimir cuarenta líneas iguales. */
function resumir(vs) {
  const m = new Map();
  for (const v of vs) {
    const k = v.directiva + ' → ' + v.bloqueado;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([k, n]) => k + (n > 1 ? ` (×${n})` : ''));
}

/* ---------------------------------------------------------------------------
   1. El cotizador
   --------------------------------------------------------------------------- */
console.log('\nEL COTIZADOR con la CSP puesta');
{
  const { vistas, errores } = await violaciones(B + '/index.html', async p => {
    /* El camino que de verdad se usa: los tres datos del cliente, saltar a partidas y
       capturar una. Si la CSP hubiera matado el JavaScript inline, nada de esto pasaría. */
    await p.fill('#f-cli', 'Farmacia San Juan');
    await p.fill('#f-tel', '33 1234 5678');
    await p.fill('#f-proy', 'Letrero de fachada');
    await p.evaluate(() => irAPantalla('partidas'));
    await p.waitForTimeout(400);
    await p.click('.chip:has-text("Acero Inoxidable")').catch(() => {});
    await p.fill('#h-1', '40').catch(() => {});
    await p.fill('#n-1', '8').catch(() => {});
    await p.waitForTimeout(400);
  });
  if (!vistas.length) bien('cero violaciones de CSP al abrir y usar el cotizador');
  else for (const v of resumir(vistas)) mal('violación de CSP: ' + v);
  if (errores.length) for (const e of errores.slice(0, 4)) mal('error de JavaScript en la página: ' + e);
  else bien('ningún error de JavaScript');
}

/* Los 267 manejadores inline son la razón de que `script-src` lleve 'unsafe-inline'. Esto
   comprueba que de verdad responden: es la forma de que, el día que alguien intente apretar
   la política, la prueba diga que rompió el cotizador entero y no solo que «hubo una
   violación». */
{
  const p = await ctx.newPage();
  /* Todo en un try: cuando la CSP SÍ rompe el JavaScript inline, `irAPantalla` deja de
     existir y esto revienta. Reventar es un final peor que fallar — no dice qué pasó y se
     lleva por delante los bloques que faltan— y este es justo el archivo que va a correr
     alguien que acaba de tocar la política. */
  try {
    await p.goto(B + '/index.html', { waitUntil: 'load' });
    await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
    await p.goto(B + '/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.fill('#f-cli', 'Farmacia San Juan');
    await p.fill('#f-tel', '33 1234 5678');
    await p.fill('#f-proy', 'Letrero de fachada');
    await p.evaluate(() => irAPantalla('partidas'));
    await p.waitForTimeout(400);
    const antes = await p.locator('.partida').count();
    /* `#addbtn` es literalmente `onclick="agregarPartida()"`, o sea uno de los 267. Que este
       clic agregue una partida es la comprobación de que 'unsafe-inline' sigue haciendo lo
       que tiene que hacer, y el día que alguien lo quite esta línea lo dice con esas palabras
       en vez de dejar que se descubra en producción. */
    await p.click('#addbtn', { timeout: 5000 });
    await p.waitForTimeout(500);
    const despues = await p.locator('.partida').count();
    if (despues > antes) bien(`un onclick inline respondió: ${antes} → ${despues} partidas, la CSP no mató el JavaScript del cotizador`);
    else throw new Error('el clic no agregó ninguna partida');
  } catch (e) {
    mal('el `onclick="agregarPartida()"` de #addbtn no agregó una partida. Con la CSP puesta,\n' +
        "      eso significa que `script-src` ya no permite el JavaScript inline, y el cotizador\n" +
        "      queda sin un solo botón que responda. Revisa que la directiva lleve 'unsafe-inline'.\n" +
        '      El navegador dijo: ' + String(e.message).split('\n')[0]);
  }
  await p.close();
}

/* ---------------------------------------------------------------------------
   2. La plataforma
   --------------------------------------------------------------------------- */
console.log('\nLA PLATAFORMA con la CSP puesta');
{
  const { vistas, errores } = await violaciones(B + '/plataforma.html', async p => {
    /* El mapa es el que más orígenes toca: Leaflet desde vendor/, las teselas de OSM y,
       si alguien cambió el proveedor, las de CARTO. */
    for (const t of ['Mapa', 'Agenda', 'Material', 'Ajustes']) {
      await p.click(`text=${t}`, { timeout: 1500 }).catch(() => {});
      await p.waitForTimeout(500);
    }
  });
  if (!vistas.length) bien('cero violaciones de CSP recorriendo mapa, agenda, material y ajustes');
  else for (const v of resumir(vistas)) mal('violación de CSP: ' + v);
  /* Los módulos ES son la diferencia con el cotizador: si `script-src 'self'` se rompiera,
     el primer `import` fallaría y la plataforma quedaría en blanco. Un error aquí es eso. */
  if (errores.length) for (const e of errores.slice(0, 4)) mal('error de JavaScript en la página: ' + e);
  else bien('los módulos ES cargaron: ningún import bloqueado');
}

/* ---------------------------------------------------------------------------
   3. El service worker
   --------------------------------------------------------------------------- */
console.log('\nEL SERVICE WORKER');
{
  const p = await ctx.newPage();
  await p.goto(B + '/plataforma.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const reg = await p.evaluate(async () => {
    try {
      const r = await navigator.serviceWorker.getRegistration();
      return r ? { ok: true, scope: r.scope } : { ok: false };
    } catch (e) { return { ok: false, error: String(e.message) }; }
  });
  if (reg.ok) bien('el service worker se registró con la CSP puesta (alcance ' + reg.scope + ')');
  else mal('el service worker NO se registró con estas cabeceras. Sin él la app no abre sin señal,\n' +
           '      que es la mitad de la razón de que exista. ' + (reg.error || ''));
  await p.close();
}

/* ---------------------------------------------------------------------------
   4. Las cabeceras que de verdad salieron
   --------------------------------------------------------------------------- */
console.log('\nLAS CABECERAS QUE SALIERON POR EL CABLE');
{
  const p = await ctx.newPage();
  const r = await p.goto(B + '/index.html', { waitUntil: 'load' });
  const h = r.headers();
  for (const c of ['content-security-policy', 'strict-transport-security', 'x-content-type-options',
                   'x-frame-options', 'referrer-policy', 'permissions-policy']) {
    if (h[c]) bien(c + ' llegó');
    else mal(c + ' NO llegó al navegador: revisa que el bloque `/*` de _headers la traiga');
  }
  const sw = await p.goto(B + '/sw.js');
  if (/no-cache|max-age=0/i.test(sw.headers()['cache-control'] || ''))
    bien('sw.js llegó con Cache-Control que obliga a revalidar');
  else mal('sw.js llegó SIN Cache-Control de revalidación: un teléfono se puede quedar con una\n' +
           '      versión vieja del service worker y no hay forma de alcanzarlo después');
  await p.close();
}

/* Lo que sí salió a la red, para que quede a la vista: si aparece un dominio que nadie
   esperaba, es un origen que hay que clasificar en _headers antes de publicar. */
console.log('\nA DÓNDE INTENTÓ SALIR (interceptado, sin red de verdad)');
const dominios = [...new Set(externos.map(u => { try { return new URL(u).host; } catch (_) { return u; } }))];
if (!dominios.length) console.log('  · a ningún lado en este recorrido');
else for (const d of dominios.sort()) console.log('  · ' + d);

await nav.close();
servidor.close();
console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nLa CSP no rompe nada.');
process.exit(fallos ? 1 : 0);
