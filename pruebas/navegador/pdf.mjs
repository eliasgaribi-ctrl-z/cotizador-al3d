/* LEER UN PDF DEL CLIENTE, CON LA POLÍTICA PUESTA.

   Los PDF de este flujo **los manda el cliente**. Llegan por WhatsApp o por correo, alguien
   los arrastra al escalador o al vectorizador, y el lector los rasteriza dentro del origen
   de la app — el mismo origen donde viven el historial, las API keys de IA y el token del
   puente. O sea que el lector de PDF es el trozo de código de terceros con más superficie de
   todo el proyecto, y el único que corre sobre archivos de fuera.

   Durante un tiempo se bajaba en caliente de `cdnjs.cloudflare.com`, y la versión que se
   bajaba era la **3.11.174**: anterior al parche de **CVE-2024-4367**, con el que un PDF
   preparado ejecuta JavaScript arbitrario a través del renderizador de tipografías. Ahora
   vive en `vendor/pdfjs/`, copiado a mano como Leaflet, y `cdnjs` salió de `script-src`.

   Esta prueba existe porque ese cambio tiene tres formas de romperse en silencio y ninguna
   da un error legible:

     · `pdfjs-dist` 4.x ya no publica UMD: es ESM y se carga con `import()`. Si la ruta está
       mal, el `catch` de la app pinta «no se pudo abrir el PDF» y parece culpa del archivo.
     · Su worker es un módulo aparte de 1.4 MB. Si `workerSrc` apunta mal, pdf.js **no falla**:
       cae al hilo principal y congela la pantalla, que es peor que fallar.
     · Y si a la CSP le faltara `worker-src`, el worker no arrancaría — y esa violación solo
       la ve quien tenga la consola abierta.

   Así que aquí se abre un PDF de verdad, con las cabeceras de verdad, y se comprueba que
   salió una imagen rasterizada del tamaño correcto. Levanta su propio servidor:

     node pruebas/navegador/pdf.mjs
*/
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname, extname, normalize } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

/* ── Las cabeceras reales, de `_headers`, igual que en csp.mjs ────────────────── */
function bloques() {
  const out = []; let actual = null;
  for (const cruda of readFileSync(join(RAIZ, '_headers'), 'utf8').split('\n')) {
    const l = cruda.replace(/\s+$/, '');
    if (!l.trim() || l.trim().startsWith('#')) continue;
    if (!/^\s/.test(l)) { actual = { patron: l.trim(), cabeceras: [] }; out.push(actual); }
    else if (actual) { const i = l.indexOf(':'); if (i > 0) actual.cabeceras.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]); }
  }
  return out;
}
const BLOQUES = bloques();
/* Igual que en csp.mjs y por el mismo motivo, que está explicado allá: sobre http esta
   directiva sola tumba la instalación del service worker, y este servidor habla http. */
for (const b of BLOQUES) for (const c of b.cabeceras)
  if (/^content-security-policy$/i.test(c[0]))
    c[1] = c[1].split(';').map(x => x.trim()).filter(x => x !== 'upgrade-insecure-requests').join('; ');

const casa = (patron, ruta) => patron === '/*' || patron === ruta
  || (patron.endsWith('/*') && ruta.startsWith(patron.slice(0, -1)))
  || (/^\/\*(\.[a-z0-9]+)$/i.test(patron) && ruta.endsWith(/^\/\*(\.[a-z0-9]+)$/i.exec(patron)[1]));

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };

/* Como Cloudflare Pages, y no como un servidor de archivos: `/` sirve index.html y `/x.html`
   se redirige a `/x`. Aquí eso no es cosmética. `import('./vendor/pdfjs/pdf.min.mjs')` vive en
   un <script> CLÁSICO, así que la ruta se resuelve contra la URL del DOCUMENTO — y en
   producción esa URL es `/`, no `/index.html`. Probarlo solo en `/index.html` dejaría sin
   cubrir exactamente el caso que se sirve. */
/* Un interruptor para caer SOLO el lector, no la app: es el caso real —la app ya está en el
   teléfono, el lector son 1.8 MB que no van en la precarga y son justo lo que falta cuando
   falta la red—. Se hace así y no con `setOffline` del navegador porque el service worker se
   mete en medio y el resultado deja de ser determinista. */
let LECTOR_CAIDO = false;
const servidor = createServer((req, res) => {
  const pedida = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (LECTOR_CAIDO && pedida.startsWith('/vendor/pdfjs/')) { res.writeHead(503); res.end('sin señal'); return; }
  if (pedida === '/index.html') { res.writeHead(308, { Location: '/' }); res.end(); return; }
  if (pedida.endsWith('.html')) { res.writeHead(308, { Location: pedida.slice(0, -5) }); res.end(); return; }
  let ruta = pedida.endsWith('/') ? pedida + 'index.html' : pedida;
  if (!extname(ruta) && existsSync(join(RAIZ, ruta + '.html'))) ruta += '.html';
  const abs = join(RAIZ, normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
  if (!abs.startsWith(RAIZ) || !existsSync(abs) || !statSync(abs).isFile()) {
    res.writeHead(404); res.end('404'); return;
  }
  const h = { 'Content-Type': TIPOS[extname(abs)] || 'application/octet-stream' };
  for (const b of BLOQUES) if (casa(b.patron, pedida)) for (const [k, v] of b.cabeceras) h[k] = v;
  res.writeHead(200, h);
  res.end(readFileSync(abs));
});
const PUERTO = 8831;
await new Promise(r => servidor.listen(PUERTO, '127.0.0.1', r));
const B = 'http://127.0.0.1:' + PUERTO;

/* ── Un PDF de una página, escrito a mano ─────────────────────────────────────
   Sin dependencias y sin binario en el repositorio: son 600 bytes de estructura PDF. Mide
   300×200 puntos, que es lo que se comprueba abajo — si el rasterizado saliera de otro
   tamaño, es que pdf.js no leyó el MediaBox y algo cambió de verdad. */
function pdfDePrueba() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const flujo = 'BT /F1 24 Tf 30 100 Td (AL3D PRUEBA) Tj ET';
  objs[3] = '<< /Length ' + flujo.length + ' >>\nstream\n' + flujo + '\nendstream';
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  for (const o of offs) out += String(o).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return out;
}
const RUTA_PDF = join(tmpdir(), 'al3d-prueba.pdf');
writeFileSync(RUTA_PDF, pdfDePrueba(), 'latin1');

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX' });

/* Nada sale a internet. Si algo lo intenta, se anota: con pdf.js ya copiado a vendor/, que
   este recorrido pida algo de fuera sería justo la regresión que se quiere evitar. */
const externos = [];
await ctx.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith(B) || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
  externos.push(u);
  return r.fulfill({ status: 200, contentType: 'text/plain', body: '' });
});

const p = await ctx.newPage();
const violaciones = [];
await p.exposeFunction('__cspViolacion', v => violaciones.push(v));
await p.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', e => {
    try { window.__cspViolacion((e.effectiveDirective || e.violatedDirective) + ' → ' + String(e.blockedURI || '').slice(0, 120)); } catch (_) {}
  });
});
const errores = [];
p.on('pageerror', e => errores.push(String(e.message).slice(0, 200)));

await p.goto(B + '/', { waitUntil: 'load' });
await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
await p.goto(B + '/', { waitUntil: 'load' });
await p.waitForTimeout(1500);

console.log('\nEL ESCALADOR ABRE UN PDF');
{
  /* El input está oculto y lo dispara un botón; se le pasan los archivos directo, que es lo
     que hace el navegador al soltar uno. `cargarImagenScaler` detecta el tipo y llama a
     `scLoadPDF`, que es el camino que importa. */
  await p.setInputFiles('#scaler-img-input', RUTA_PDF).catch(e => mal('no se pudo entregar el PDF al escalador: ' + e.message));
  /* pdf.js baja 1.8 MB de vendor/ y arranca su worker: se le da tiempo de verdad. */
  let img = null;
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(500);
    img = await p.evaluate(() => (typeof SC !== 'undefined' && SC.img)
      ? { w: SC.imgW, h: SC.imgH } : null).catch(() => null);
    if (img) break;
  }
  if (!img) {
    mal('el PDF no se rasterizó: `SC.img` sigue vacío después de 20 s.\n' +
        '      Con pdf.js en vendor/ eso significa que `import()` falló o que el worker no\n' +
        '      arrancó. Mira las violaciones de CSP y los errores de abajo.');
  } else {
    bien(`el PDF se rasterizó: ${img.w}×${img.h} px`);
    /* La página mide 300×200 puntos y el escalador la rasteriza a una escala >= 2, así que
       la proporción tiene que conservarse. Comprobarla es lo que distingue «salió una
       imagen» de «salió LA imagen». */
    const prop = img.w / img.h;
    if (Math.abs(prop - 1.5) < 0.05) bien('y con la proporción de la página (300×200 → 3:2)');
    else mal(`la proporción salió ${prop.toFixed(3)} y la página es 3:2. pdf.js no leyó el MediaBox`);
    if (img.w >= 600) bien('a resolución de trabajo, no a escala 1');
    else mal('la imagen salió a escala 1 (' + img.w + ' px): el escalador pide al menos 2');
  }
}

console.log('\nLO QUE PASÓ POR DEBAJO');
{
  if (!violaciones.length) bien('cero violaciones de CSP leyendo el PDF');
  else for (const v of [...new Set(violaciones)]) mal('violación de CSP: ' + v);

  /* La tipografía Inter sí sale a Google en cualquier apertura de la app, y no es de este
     flujo: se excluye por nombre en vez de bajar el listón, para que un dominio nuevo —el que
     de verdad importaría aquí— siga saltando. */
  const APP = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
  const deFuera = [...new Set(externos.map(u => { try { return new URL(u).host; } catch (_) { return u; } }))]
    .filter(h => !APP.has(h));
  if (!deFuera.length) bien('leer el PDF no pidió nada a ningún dominio de fuera: el lector es del sitio');
  else mal('se pidió algo de fuera al leer un PDF: ' + deFuera.join(', ') + '\n' +
           '      pdf.js tiene que salir de vendor/pdfjs/. Si volvió a la CDN, dilo en\n' +
           '      vendor/pdfjs/PROCEDENCIA.md y vuelve a meterlo en script-src.');
  /* Y el dominio concreto del que venía, nombrado, porque es el que alguien podría reponer
     «temporalmente» sin acordarse de la CSP ni del CVE. */
  if (externos.some(u => /cdnjs\.cloudflare\.com/.test(u)))
    mal('se volvió a pedir pdf.js a cdnjs.cloudflare.com');

  /* El worker es lo que separa «lee un PDF» de «congela la pantalla»: si no arranca, pdf.js
     no falla, cae al hilo principal. Con un PDF de 600 bytes no se nota; con el plano de un
     cliente, sí. */
  const conWorker = await p.evaluate(() => performance.getEntriesByType('resource')
    .some(r => /pdf\.worker\.min\.mjs/.test(r.name))).catch(() => false);
  if (conWorker) bien('el worker de pdf.js se cargó: el rasterizado no bloquea la pantalla');
  else mal('no se pidió `pdf.worker.min.mjs`. pdf.js cayó a su modo sin worker, que NO falla\n' +
           '      y congela la pantalla con un plano de verdad. Revisa `GlobalWorkerOptions.workerSrc`.');

  if (errores.length) for (const e of errores.slice(0, 3)) mal('error de JavaScript: ' + e);
  else bien('ningún error de JavaScript en la página');
}

/* ---------------------------------------------------------------------------
   3. Falla sin señal, vuelve la señal, y tiene que funcionar SIN cerrar la app
   --------------------------------------------------------------------------- */
/* Este bloque existe por un fallo que ninguna prueba veía y que el navegador provoca solo: el
   mapa de módulos GUARDA los módulos que fallaron, así que un `import()` del mismo
   especificador que ya falló se rechaza al instante, sin volver a salir a la red, durante toda
   la vida del documento. El camino es el de todos los días en este taller: alguien en la calle
   sin señal arrastra el PDF del cliente, falla, vuelve la señal, lo intenta otra vez — y
   seguía fallando, ahora sin motivo visible, hasta cerrar y volver a abrir la app. */
console.log('\nSIN SEÑAL PRIMERO, CON SEÑAL DESPUÉS, SIN CERRAR LA APP');
{
  /* Contexto NUEVO, no una pestaña más: el bloque de arriba ya cargó pdf.min.mjs con un 200 y
     la caché HTTP del navegador es del contexto, así que una pestaña nueva lo serviría de ahí
     sin tocar el servidor y este bloque no probaría nada. */
  const ctx2 = await nav.newContext({ viewport: { width: 1024, height: 800 }, locale: 'es-MX' });
  const q = await ctx2.newPage();
  const avisos = [];
  q.on('console', m => { if (/al3d/i.test(m.text())) avisos.push(m.text()); });
  /* `navigator.onLine` se fuerza a false porque es la señal por la que el código decide QUÉ
     mensaje dar, y el servidor que devuelve 503 no la cambia. Aquí no se está fingiendo el
     fallo —ese es de verdad, el lector no baja— sino poniendo al navegador en el estado en el
     que de verdad estaría el teléfono. */
  await q.addInitScript(() => {
    try { Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }); } catch (_) {}
  });
  LECTOR_CAIDO = true;
  await q.goto(B + '/', { waitUntil: 'load' });
  await q.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await q.goto(B + '/', { waitUntil: 'load' });
  await q.waitForTimeout(1400);

  const falla = await q.evaluate(() => cargarPdfJs().then(() => 'CARGÓ').catch(e => 'ERR: ' + e.message));
  if (/^ERR/.test(falla)) bien('sin señal falla, como debe');
  else mal('sin señal NO falló, así que este bloque no está probando nada: ' + falla);

  LECTOR_CAIDO = false;
  const segunda = await q.evaluate(() => cargarPdfJs().then(() => 'CARGÓ').catch(e => 'ERR: ' + e.message));
  if (segunda === 'CARGÓ')
    bien('y al volver la señal carga al segundo intento, sin recargar la app');
  else
    mal('al volver la señal SIGUE fallando sin recargar la app: ' + segunda + '\n' +
        '      Es el mapa de módulos del navegador: guarda los módulos que fallaron y un\n' +
        '      `import()` del mismo especificador ya no sale a la red. El reintento tiene que\n' +
        '      usar una URL distinta (`?reintento=N`), no basta con limpiar la variable.');

  /* Y que el mensaje de la primera vez no invite a reintentar sin decir que hace falta señal:
     el lector son 1.8 MB que no van en la precarga, así que sin conexión no hay reintento. */
  if (/^ERR/.test(falla) && !/conexi[oó]n/i.test(falla))
    mal('el mensaje de sin señal no nombra la conexión: «' + falla.slice(0, 90) + '»\n' +
        '      Sin ella no hay reintento que valga, y el mensaje tiene que decirlo.');
  else if (/^ERR/.test(falla)) bien('y el mensaje de la primera vez nombra la conexión');

  if (avisos.some(a => /pdf\.js/.test(a))) bien('el detalle quedó en la consola para quien lo busque');
  else mal('el fallo no dejó rastro en la consola: es lo único que va a quedar el día que\n' +
           '      esto pase en un teléfono de verdad');
  await q.close();
  await ctx2.close();
}

await nav.close();
servidor.close();
try { unlinkSync(RUTA_PDF); } catch (_) {}
console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl lector de PDF es del sitio y funciona.');
process.exit(fallos ? 1 : 0);
