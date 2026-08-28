/* ¿La política de contenido va a romper la app?

   Esta prueba existe por el mismo motivo que `publicacion.mjs`, que se escribió después de
   dos días y cinco despliegues en los que GitHub Pages no publicó nada y nadie se enteró.
   Aquí el modo de fallo es peor, porque es más silencioso todavía.

   Una Content-Security-Policy a la que le falta un origen NO da un error de red, no pinta un
   aviso y no aparece en ningún log del servidor. El navegador simplemente no hace la
   petición. Lo que se ve es: la tipografía sale con la de reserva, o el mapa sale gris, o
   «Cotizar con IA» se queda pensando para siempre, o —el caro— leer un PDF deja de funcionar
   delante de un cliente. Y solo se entera quien tenga la consola del navegador abierta, que
   en un celular en la calle no es nadie.

   Así que las dos listas —lo que el código pide y lo que `_headers` permite— tienen que
   decir lo mismo, y eso es lo único que revisa este archivo. Va en los dos sentidos a
   propósito:

     1. TODO ORIGEN QUE EL CÓDIGO CARGA tiene que estar permitido en su directiva. Si alguien
        agrega un proveedor de IA y no toca `_headers`, esto falla aquí y no en producción.
     2. TODO ORIGEN QUE `_headers` PERMITE tiene que seguir apareciendo en el código. Una CSP
        que acumula permisos de cosas que ya se quitaron es una CSP que protege menos cada
        año, y nadie borra una línea que no sabe si todavía hace falta.

   Y hay un tercer control, el sabueso: si aparece un `https://…` en un lugar donde se CARGA
   algo —un `<script src>`, un `<link>`, un `fetch()`— y ese dominio no está en ninguna de
   las dos listas, la prueba falla pidiendo que alguien decida en qué directiva va. Un enlace
   que solo se abre con un clic no cuenta: navegar a otra página no lo restringe la CSP.

   Se corre con pruebas/correr.sh, como todas.
*/
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
let fallos = 0;
const mal  = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const leer = p => (existsSync(join(RAIZ, p)) ? readFileSync(join(RAIZ, p), 'utf8') : '');

/* ---------------------------------------------------------------------------
   Leer _headers
   --------------------------------------------------------------------------- */
if (!existsSync(join(RAIZ, '_headers'))) {
  console.log('  ✗ no existe `_headers`: en Cloudflare Pages el sitio se serviría sin ninguna\n' +
              '      cabecera de seguridad, igual que en GitHub Pages. Es el archivo que trae la CSP.');
  console.log('\n1 FALLO(S)');
  process.exit(1);
}
const HEADERS = leer('_headers');

/* Las líneas de comentario no cuentan: la CSP de verdad es la única línea que empieza con
   `Content-Security-Policy:` sin `#` delante. */
const lineas = HEADERS.split('\n').filter(l => !l.trim().startsWith('#'));
const lineaCsp = lineas.find(l => /^\s*Content-Security-Policy:/i.test(l));

if (!lineaCsp) { mal('`_headers` no trae ninguna línea `Content-Security-Policy:` activa'); }
const CSP = lineaCsp ? lineaCsp.replace(/^\s*Content-Security-Policy:\s*/i, '').trim() : '';

/** Las fuentes de una directiva, ya separadas. Si la directiva no está, cae a `default-src`,
 *  que es exactamente lo que hace el navegador. Devolver la lista equivocada aquí daría una
 *  prueba que pasa y una app rota, que es el peor resultado posible de un archivo así. */
const RESPALDO = {
  'script-src': 'default-src', 'style-src': 'default-src', 'img-src': 'default-src',
  'font-src': 'default-src', 'connect-src': 'default-src', 'manifest-src': 'default-src',
  'media-src': 'default-src', 'frame-src': 'child-src', 'child-src': 'default-src',
  'worker-src': 'child-src',
};
function fuentes(directiva, vistas = new Set()) {
  if (vistas.has(directiva)) return [];
  vistas.add(directiva);
  const trozo = CSP.split(';').map(s => s.trim())
    .find(s => s.toLowerCase().startsWith(directiva.toLowerCase() + ' ') || s.toLowerCase() === directiva.toLowerCase());
  if (trozo) return trozo.split(/\s+/).slice(1);
  const resp = RESPALDO[directiva];
  return resp ? fuentes(resp, vistas) : [];
}

/** ¿La directiva permite este origen? Entiende el comodín de subdominio (`https://*.x.com`),
 *  que es como está escrito el del puente y el de CARTO. */
function permite(directiva, origen) {
  const host = origen.replace(/^https:\/\//, '');
  return fuentes(directiva).some(f => {
    if (f === origen || f === 'https://' + host) return true;
    const m = /^https:\/\/\*\.(.+)$/.exec(f);
    return !!m && (host === m[1] || host.endsWith('.' + m[1]));
  });
}

/* ---------------------------------------------------------------------------
   Las dos listas
   --------------------------------------------------------------------------- */

/* Cada origen que la app CARGA, con la directiva que le toca y el archivo donde vive la
   línea que lo pide. El archivo no es documentación: se lee y se comprueba que el dominio
   siga ahí. Así, quitar un proveedor del código hace fallar esta prueba y recuerda podar
   la CSP, que es el sentido que casi nunca se cubre. */
const CARGAS = [
  ['https://accounts.google.com',               'script-src',  'js/nucleo/gcal.js', 'Google Identity, para el calendario'],
  ['https://fonts.googleapis.com',              'style-src',   'index.html',        'la hoja de la tipografía Inter'],
  ['https://fonts.gstatic.com',                 'font-src',    'index.html',        'los archivos .woff2 que pide esa hoja'],
  ['https://tile.openstreetmap.org',            'img-src',     'js/datos/geo.js',   'las teselas del mapa'],
  ['https://basemaps.cartocdn.com',             'img-src',     'js/datos/geo.js',   'el proveedor alterno de teselas, elegible en Ajustes'],
  ['https://openrouter.ai',                     'connect-src', 'index.html',        'proveedor de IA'],
  ['https://api.groq.com',                      'connect-src', 'index.html',        'proveedor de IA'],
  ['https://generativelanguage.googleapis.com', 'connect-src', 'index.html',        'proveedor de IA (Gemini)'],
  ['https://www.googleapis.com',                'connect-src', 'js/nucleo/gcal.js', 'la API de Google Calendar'],
  ['https://nominatim.openstreetmap.org',       'connect-src', 'js/datos/geo.js',   'geocodificar una dirección'],
];

/* Dominios que aparecen en el código pero que la CSP no tiene por qué permitir, porque son
   ENLACES: el usuario los abre con un clic y navegar a otra página no lo restringe ninguna
   directiva. Están enumerados para que el sabueso de abajo no los confunda con una carga. */
const SOLO_ENLACES = new Set([
  'wa.me', 'github.com', 'www.openstreetmap.org', 'carto.com', 'www.google.com',
  'aistudio.google.com', 'console.groq.com', 'openrouter.ai', 'maps.app.goo.gl',
  'goo.gl', 'www.w3.org', 'api.notion.com', 'notion.so',
]);

/* ---------------------------------------------------------------------------
   1. Lo que el código carga, ¿está permitido?
   --------------------------------------------------------------------------- */
console.log('\nLo que el código carga tiene que estar en la CSP');
for (const [origen, directiva, archivo, porque] of CARGAS) {
  const host = origen.replace('https://', '');
  const fuente = leer(archivo);
  if (!fuente.includes(host)) {
    mal(`${origen} ya no aparece en ${archivo}. Si se quitó del código, quítalo también de\n` +
        `      \`${directiva}\` en _headers: una CSP con permisos de más protege menos cada año.`);
    continue;
  }
  if (permite(directiva, origen)) bien(`${directiva} permite ${origen} (${porque})`);
  else mal(`${archivo} carga ${origen} y \`${directiva}\` NO lo permite.\n` +
           `      Es ${porque}. Sin él la app no falla: deja de funcionar en silencio.`);
}

/* El puente es el caso raro y por eso va aparte: su URL la pega el usuario en Ajustes, así
   que no hay un dominio que buscar en el código. Lo que sí se puede exigir es que la CSP
   deje pasar el dominio por omisión de Cloudflare Workers; sin eso, sincronizar con Notion
   muere en el primer intento y la pantalla del puente diría «sin red» sin que falte red. */
/* Y el que ya no está, que es la mejora: pdf.js se copió a vendor/ y cdnjs salió de la
   política. Esto falla si alguien lo vuelve a meter sin pensarlo — era el único origen con
   permiso de EJECUTAR CÓDIGO en esta app que no controlábamos, y corría sobre archivos que
   manda el cliente. */
if (permite('script-src', 'https://cdnjs.cloudflare.com'))
  mal("`script-src` volvió a permitir cdnjs.cloudflare.com. pdf.js vive en `vendor/pdfjs/`\n" +
      '      desde que se copió a mano; si hizo falta volver a la CDN, dilo aquí y en\n' +
      '      vendor/pdfjs/PROCEDENCIA.md, porque es un origen que puede ejecutar código sobre\n' +
      '      los PDF que manda el cliente.');
else bien('cdnjs YA NO está en script-src: pdf.js se sirve desde vendor/pdfjs/');

console.log('\nEl puente a Notion');
if (permite('connect-src', 'https://puente-al3d.ejemplo.workers.dev'))
  bien('connect-src deja salir al Worker en *.workers.dev');
else
  mal('`connect-src` no permite *.workers.dev: el puente a Notion no va a poder conectarse.\n' +
      '      Si el Worker se mudó a un dominio propio, agrégalo a esa directiva.');

/* ---------------------------------------------------------------------------
   2. Las directivas que protegen aunque haya 'unsafe-inline'
   --------------------------------------------------------------------------- */
console.log('\nLas directivas que sí protegen aunque script-src lleve unsafe-inline');
const EXIGIDAS = [
  ['frame-ancestors', "'none'",  'para que nadie enmarque el cotizador y robe clics encima'],
  ['object-src',      "'none'",  'para cerrar los plugins viejos, que son un XSS con patas'],
  ['base-uri',        "'self'",  'para que una inyección no pueda mover la base de las rutas relativas'],
  ['form-action',     "'self'",  'para que un formulario no pueda mandar los datos a otro servidor'],
];
for (const [directiva, valor, porque] of EXIGIDAS) {
  if (fuentes(directiva).includes(valor)) bien(`${directiva} ${valor} — ${porque}`);
  else mal(`falta \`${directiva} ${valor}\` en la CSP: ${porque}`);
}
if (fuentes('default-src').includes("'self'")) bien("default-src 'self' — lo que no se nombra, no se carga");
else mal("falta `default-src 'self'`: lo que ninguna directiva nombre quedaría permitido");

/* Esta se comprueba AQUÍ y no en la prueba de navegador, y la razón está escrita en
   pruebas/navegador/csp.mjs: aquella sirve por http para no depender de un certificado, y
   sobre http esta directiva sola tumba la instalación del service worker. Se le quita allá
   y se exige aquí, que es donde de verdad cuenta. Sobre https no asciende nada y no cuesta
   nada; lo que tapa es el día que alguien enlace el sitio con http:// desde un WhatsApp. */
if (/(^|;)\s*upgrade-insecure-requests\s*(;|$)/.test(CSP)) bien('upgrade-insecure-requests — nada del sitio se pide por http');
else mal('falta `upgrade-insecure-requests`: una liga http:// mandada por WhatsApp pediría\n' +
         '      subrecursos en claro en vez de ascenderlos.');

/* ---------------------------------------------------------------------------
   3. Los esquemas que la app necesita de verdad
   --------------------------------------------------------------------------- */
console.log('\nLos esquemas que el PDF, el mapa y el lector necesitan');
const ESQUEMAS = [
  ['worker-src', "'self'", 'pdf.js arranca su worker desde vendor/pdfjs/, que es del mismo origen.\n      ESTA es la que sostiene el lector: si se cae, pdf.js NO falla, rasteriza en el hilo\n      principal y congela la pantalla con el plano de un cliente'],
  ['script-src', "'self'", 'el import() de pdf.js y los ~30 módulos ES de la plataforma'],
  ['worker-src', 'blob:', 'cinturón: pdf.js usa blob: en algunos caminos internos. Ya NO es por el\n      envoltorio de CDN —ese solo se armaba con el worker en otro dominio— pero quitarlo no\n      compra nada medible'],
  ['frame-src',  'blob:', 'el visor de PDF de index.html:5426 enseña el archivo en un <iframe> con una URL blob:'],
  ['frame-src',  'data:', 'ese mismo visor acepta `data:application/pdf;` (urlPdfSegura, index.html:3825)'],
  ['img-src',    'blob:', 'las fotos y planos que se cargan para analizar con IA'],
  ['img-src',    'data:', 'el logotipo que sube el usuario y los iconos incrustados'],
  ['connect-src','data:', 'aiTraerDeUrl (index.html:7223) le hace fetch a una imagen arrastrada como data: URI'],
];
/* Y la que se cierra del todo, que también es una decisión que alguien puede deshacer sin
   querer: no hay un solo <video>, <audio> ni `new Audio` en el repositorio. */
if (fuentes('media-src').includes("'none'")) bien("media-src 'none' — la app no reproduce nada, así que no se hereda de default-src");
else mal("`media-src` debería ser 'none': no hay <video>, <audio> ni `new Audio` en el repo.\n" +
         '      Si se agregó alguno, di cuál aquí y ajústala.');
for (const [directiva, esquema, porque] of ESQUEMAS) {
  if (fuentes(directiva).includes(esquema)) bien(`${directiva} permite ${esquema}`);
  else mal(`\`${directiva}\` no permite \`${esquema}\`: ${porque}`);
}

/* El PDF se arma como una página HTML con un <script> adentro, se mete en un Blob y se abre
   en otra pestaña. Un documento blob: HEREDA la política de quien lo creó, así que ese
   <script> lo gobierna la misma `script-src` de aquí. Es la razón menos obvia de las tres
   por las que 'unsafe-inline' no se puede quitar, y la que alguien va a intentar quitar. */
console.log("\nPor qué script-src no puede soltar 'unsafe-inline' todavía");
const html = leer('index.html');
const manejadores = (html.match(/ on[a-z]+="/g) || []).length;
const pdfSeAutoImprime = html.includes("'<scr'+'ipt>");
if (manejadores > 0 || pdfSeAutoImprime) {
  if (fuentes('script-src').includes("'unsafe-inline'"))
    bien(`script-src lleva 'unsafe-inline', y hace falta: ${manejadores} manejadores inline en index.html` +
         (pdfSeAutoImprime ? ' y el <script> que auto-imprime el PDF' : ''));
  else
    mal(`script-src NO lleva 'unsafe-inline' y todavía hay ${manejadores} manejadores \`on…=\` en\n` +
        '      index.html' + (pdfSeAutoImprime ? ' más el <script> que auto-imprime el PDF' : '') + '.\n' +
        '      Publicar así deja el cotizador sin un solo botón que responda.');
} else {
  bien('ya no hay JavaScript inline: se puede apretar script-src, que es la mejora grande pendiente');
}

/* ---------------------------------------------------------------------------
   4. El sabueso: orígenes nuevos que nadie clasificó
   --------------------------------------------------------------------------- */
console.log('\nOrígenes que aparecen en el código y nadie clasificó');
const ARCHIVOS = ['index.html', 'plataforma.html', 'sw.js', 'js/nucleo/gcal.js',
                  'js/datos/geo.js', 'js/datos/puente.js', 'js/nucleo/ui.js',
                  'js/mod/mapa.js', 'js/datos/material.js', 'css/sistema.css', 'css/plataforma.css'];
const conocidos = new Set([
  ...CARGAS.map(c => c[0].replace('https://', '')),
  ...SOLO_ENLACES,
  'puente-al3d.tu-cuenta.workers.dev', 'TU-USUARIO.github.io', 'eliasgaribi-ctrl-z.github.io',
]);
const nuevos = new Map();
for (const a of ARCHIVOS) {
  const t = leer(a);
  /* Solo los sitios donde algo se CARGA: `fetch(`, `.src =`, `<script src`, `<link href`,
     `url:` de una capa de teselas y `new URL(`. Un `href` de un <a> no entra, y por eso
     esta lista de patrones es específica en vez de buscar `https://` a secas. */
  const patrones = [
    /fetch\(\s*[`'"]?(https:\/\/[a-z0-9.*{}-]+)/gi,
    /\.src\s*=\s*[`'"](https:\/\/[a-z0-9.*{}-]+)/gi,
    /<script[^>]+src="(https:\/\/[a-z0-9.*{}-]+)/gi,
    /<link[^>]+href="(https:\/\/[a-z0-9.*{}-]+)/gi,
    /\burl:\s*[`'"](https:\/\/[a-z0-9.*{}-]+)/gi,
    /new URL\(\s*[`'"](https:\/\/[a-z0-9.*{}-]+)/gi,
    /@import\s+url\(\s*['"]?(https:\/\/[a-z0-9.*{}-]+)/gi,
  ];
  for (const re of patrones) {
    for (const m of t.matchAll(re)) {
      /* `{s}.basemaps.cartocdn.com` trae el comodín de Leaflet: se normaliza al dominio. */
      const host = m[1].replace('https://', '').replace(/^\{s\}\./, '').replace(/^\*\./, '');
      if (!host || conocidos.has(host)) continue;
      if (!nuevos.has(host)) nuevos.set(host, a);
    }
  }
}
if (!nuevos.size) bien('ningún dominio nuevo: el código y la CSP siguen diciendo lo mismo');
else for (const [host, donde] of nuevos)
  mal(`${donde} carga algo de \`${host}\` y no está clasificado.\n` +
      '      Decide en qué directiva va, agrégalo a _headers y a la lista CARGAS de este archivo.\n' +
      '      Si es un enlace que se abre con un clic y no una carga, va en SOLO_ENLACES.');

/* ---------------------------------------------------------------------------
   5. La caché de sw.js
   --------------------------------------------------------------------------- */
console.log('\nLa caché del service worker');
const bloqueSw = /^\/sw\.js\s*$/m.test(HEADERS)
  ? HEADERS.split(/^\/sw\.js\s*$/m)[1].split(/\n(?=\/|#\s*─)/)[0] : '';
if (/Cache-Control:.*(no-cache|max-age=0)/i.test(bloqueSw))
  bien('sw.js se revalida siempre: una versión vieja de sw.js es un teléfono congelado para siempre');
else
  mal('`_headers` no le pone `Cache-Control: no-cache` (o `max-age=0`) a `/sw.js`.\n' +
      '      Es el peor archivo que se puede cachear: decide qué versión ve cada teléfono, y si el\n' +
      '      navegador se queda con uno viejo no hay forma de alcanzar ese teléfono nunca más.');

/* ---------------------------------------------------------------------------
   6. Las otras cabeceras
   --------------------------------------------------------------------------- */
console.log('\nLas otras cabeceras');
const OTRAS = [
  [/Strict-Transport-Security:\s*max-age=(\d+)/i, 'HSTS', v => Number(v) >= 15768000,
   'HSTS con menos de seis meses no sirve de mucho: es el tiempo que el navegador recuerda que\n      este sitio solo se abre por https'],
  [/X-Content-Type-Options:\s*nosniff/i, 'X-Content-Type-Options: nosniff', () => true, ''],
  [/X-Frame-Options:\s*(DENY|SAMEORIGIN)/i, 'X-Frame-Options', () => true, ''],
  [/Referrer-Policy:\s*\S+/i, 'Referrer-Policy', () => true, ''],
  [/Cross-Origin-Opener-Policy:\s*\S+/i, 'Cross-Origin-Opener-Policy', () => true, ''],
  [/Permissions-Policy:\s*\S+/i, 'Permissions-Policy', () => true, ''],
];
for (const [re, nombre, ok, nota] of OTRAS) {
  const m = re.exec(HEADERS);
  if (!m) mal(`falta la cabecera ${nombre} en _headers`);
  else if (!ok(m[1])) mal(`${nombre} está puesta pero corta: ${nota}`);
  else bien(`${nombre} puesta`);
}

/* Y las dos que NO deben estar, porque romperían la app. Esto no es paranoia: son
   exactamente las dos que un endurecedor bienintencionado agrega de una lista genérica. */
console.log('\nLas dos cabeceras que NO deben estar');
if (/^\s*Cross-Origin-Embedder-Policy:\s*require-corp/im.test(HEADERS))
  mal('`Cross-Origin-Embedder-Policy: require-corp` está puesta y rompe todo lo de otro dominio\n' +
      '      que no mande CORP: la tipografía, las teselas del mapa y pdf.js. Quítala.');
else bien('no está COEP: require-corp, que rompería fuentes, mapa y lector de PDF');

const coop = /Cross-Origin-Opener-Policy:\s*(\S+)/i.exec(HEADERS);
if (coop && coop[1].toLowerCase() === 'same-origin')
  mal('`Cross-Origin-Opener-Policy: same-origin` corta el lazo con las ventanas que abre la app.\n' +
      '      Rompe dos: el popup de Google que devuelve el token del calendario, y la pestaña del PDF.\n' +
      '      Lo que se quiere aquí es `same-origin-allow-popups`.');
else bien('COOP deja vivir los popups: el de Google Identity y el del PDF');

/* ---------------------------------------------------------------------------
   7. robots.txt y la cabecera tienen que apuntar al mismo lado
   --------------------------------------------------------------------------- */
console.log('\nrobots.txt y X-Robots-Tag');
const robots = leer('robots.txt');
const pideNoindex = /X-Robots-Tag:.*noindex/i.test(HEADERS);
const prohibeRastreo = /^\s*Disallow:\s*\/\s*$/mi.test(robots);
if (pideNoindex && prohibeRastreo)
  mal('`robots.txt` dice `Disallow: /` y `_headers` dice `noindex`, y se anulan: el buscador que\n' +
      '      obedece el Disallow nunca pide la página, así que nunca ve el noindex — y la URL puede\n' +
      '      acabar en los resultados como liga pelada si alguien la enlaza. Deja rastrear y que el\n' +
      '      noindex haga el trabajo, o quita el noindex; las dos juntas dan lo contrario de lo que\n' +
      '      se quería.');
else if (pideNoindex && robots) bien('robots.txt deja rastrear para que el `noindex` de la cabecera se llegue a leer');
else if (!robots) mal('no existe robots.txt');
else bien('robots.txt y las cabeceras no se contradicen');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nLa CSP y el código dicen lo mismo.');
process.exit(fallos ? 1 : 0);
