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
const servidor = createServer((req, res) => {
  const pedida = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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

await nav.close();
servidor.close();
try { unlinkSync(RUTA_PDF); } catch (_) {}
console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nEl lector de PDF es del sitio y funciona.');
process.exit(fallos ? 1 : 0);
