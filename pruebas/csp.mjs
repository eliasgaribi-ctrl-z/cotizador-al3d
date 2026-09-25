/* LA POLÍTICA DE CONTENIDO DE CADA PÁGINA, Y EL CÓDIGO QUE TIENE QUE CABER EN ELLA.

   Desde septiembre de 2026 cada página lleva un <meta http-equiv="Content-Security-Policy">
   —GitHub Pages no deja poner cabeceras— que dice a qué servidores puede hablar. Una política
   así se rompe de dos maneras, y las dos en silencio:

     · Alguien agrega un fetch a un dominio nuevo y la página deja de funcionar en producción,
       con un error que solo sale en la consola del teléfono de quien lo sufre.
     · Alguien «arregla» eso abriendo la política de más —un `*`, un 'unsafe-eval'— y la
       política deja de servir para lo que existe.

   Aquí se leen las ocho políticas y se comprueba lo que no puede faltar ni sobrar, y se
   buscan en el código todos los dominios a los que de verdad se sale —fetch, guiones,
   workers, mosaicos del mapa— para exigir que cada uno esté permitido donde se usa.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, v) => eq(que, !!v, true);

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8');
const PAGINAS = ['index.html', 'cotizador.html', 'verificar.html', 'acerca.html', 'privacidad.html',
                 'condiciones.html', 'plataforma.html', 'anidador-vectores/index.html'];

/* La política como {directiva: [fuentes]}. */
function politica(html) {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  if (!m) return null;
  const out = {};
  for (const parte of m[1].split(';')) {
    const [d, ...f] = parte.trim().split(/\s+/);
    if (d) out[d] = f;
  }
  return out;
}
/* ¿Esta política deja cargar `url` por `directiva`? Con la caída a default-src que manda la
   especificación y los comodines de subdominio (`https://*.x.com`). */
function permite(pol, directiva, url) {
  const fuentes = pol[directiva] || pol['default-src'] || [];
  const u = new URL(url);
  return fuentes.some(f => {
    if (f === '*') return true;
    if (f === u.protocol) return true;
    if (!/^https?:\/\//.test(f)) return false;
    const [prot, host] = f.split('://');
    if (prot + ':' !== u.protocol) return false;
    return host.startsWith('*.') ? u.hostname.endsWith(host.slice(1)) : u.hostname === host;
  });
}

const POL = {};
console.log('\nCADA PÁGINA TRAE SU POLÍTICA, Y VA ANTES QUE CUALQUIER GUION');
for (const p of PAGINAS) {
  const html = leer(p);
  POL[p] = politica(html);
  cierto(p + ': tiene política', POL[p]);
  if (!POL[p]) continue;
  /* Un <meta> de política solo rige lo que viene DESPUÉS de él: un guion que corre antes queda
     fuera. */
  const sinComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
  const iMeta = sinComentarios.indexOf('http-equiv="Content-Security-Policy"'), iScript = sinComentarios.indexOf('<script');
  cierto(p + ':   antes del primer <script>', iScript < 0 || iMeta < iScript);
}

console.log('\nLO QUE NINGUNA PÁGINA PUEDE ABRIR');
for (const p of PAGINAS) {
  const pol = POL[p]; if (!pol) continue;
  const todo = Object.values(pol).flat();
  eq(p + ': ni un comodín suelto', todo.filter(f => f === '*' || f === 'https:' || f === 'http:'), []);
  eq(p + ': ni eval', todo.includes("'unsafe-eval'"), false);
  eq(p + ': ni <object> ni <embed>', pol['object-src'], ["'none'"]);
  eq(p + ': ni un <base> que mueva las rutas', pol['base-uri'], ["'none'"]);
  cierto(p + ': los formularios no salen a otro sitio', (pol['form-action'] || []).join(' ') === "'self'");
  /* Las llaves de IA se mudaron a la hoja: ninguna página vuelve a hablar con un proveedor. */
  const ia = ['dashscope-intl.aliyuncs.com', 'api.deepseek.com', 'generativelanguage.googleapis.com'];
  eq(p + ': y con ningún proveedor de IA', ia.filter(h => (pol['connect-src'] || []).some(f => f.includes(h))), []);
}

console.log('\nLO QUE CADA PÁGINA NECESITA');
const HOJA = 'https://script.google.com/macros/s/x/exec', REDIRECCION = 'https://script.googleusercontent.com/macros/echo';
cierto('la plataforma habla con la hoja', permite(POL['index.html'], 'connect-src', HOJA) && permite(POL['index.html'], 'connect-src', REDIRECCION));
cierto('  y con Google para entrar', permite(POL['index.html'], 'script-src', 'https://accounts.google.com/gsi/client') && permite(POL['index.html'], 'connect-src', 'https://www.googleapis.com/oauth2/v3/userinfo'));
cierto('  y deja abrir la ventanilla de Google', permite(POL['index.html'], 'frame-src', 'https://accounts.google.com/gsi/iframe'));
cierto('  y empotra el cotizador y el anidador, que son de aquí', (POL['index.html']['frame-src'] || []).includes("'self'"));
cierto('  y pinta los dos mapas', permite(POL['index.html'], 'img-src', 'https://tile.openstreetmap.org/1/1/1.png') && permite(POL['index.html'], 'img-src', 'https://a.basemaps.cartocdn.com/rastertiles/voyager/1/1/1.png'));
cierto('el cotizador habla con la hoja, y la redirección de Apps Script', permite(POL['cotizador.html'], 'connect-src', HOJA) && permite(POL['cotizador.html'], 'connect-src', REDIRECCION));
cierto('  y carga pdf.js con su worker', permite(POL['cotizador.html'], 'script-src', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js') && permite(POL['cotizador.html'], 'worker-src', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'));
cierto('  y enseña el PDF de referencia, que va en data:', (POL['cotizador.html']['frame-src'] || []).includes('data:'));
eq('  y no le habla a Google para entrar: eso es de la plataforma', permite(POL['cotizador.html'], 'script-src', 'https://accounts.google.com/gsi/client'), false);
cierto('verificar.html le pregunta a la hoja', permite(POL['verificar.html'], 'connect-src', HOJA) && permite(POL['verificar.html'], 'connect-src', REDIRECCION));
eq('  y a nadie más, ni a este mismo sitio', POL['verificar.html']['connect-src'].includes("'self'"), false);
eq('las tres páginas de texto no hablan con nadie de afuera', ['acerca.html', 'privacidad.html', 'condiciones.html'].map(p => POL[p]['connect-src']), [["'self'"], ["'self'"], ["'self'"]]);

console.log('\nEL CÓDIGO CABE EN SU POLÍTICA — cada salida a internet, donde se usa');
/* Las páginas que cargan cada archivo: el cotizador sus guiones, el anidador los suyos, y la
   plataforma todos sus módulos. */
function archivos(dir) {
  return readdirSync(join(RAIZ, dir)).flatMap(n => {
    const r = dir + '/' + n;
    return statSync(join(RAIZ, r)).isDirectory() ? archivos(r) : (n.endsWith('.js') ? [r] : []);
  });
}
const donde = r => r.startsWith('js/cotizador/') ? ['cotizador.html']
  : r.startsWith('anidador-vectores/') ? ['anidador-vectores/index.html']
  : ['index.html'];
/* Las formas en que el código sale de verdad: fetch, un guion, un worker, un mosaico. Lo que
   solo se ENLAZA —wa.me, Google Maps, la hoja de finanzas— es navegación y no pasa por aquí. */
const SALIDAS = [
  { re: /fetch\(\s*'(https:\/\/[^'?]+)/g, dir: 'connect-src' },
  { re: /\.src\s*=\s*'(https:\/\/[^']+\.js)'/g, dir: 'script-src' },
  { re: /workerSrc\s*=\s*'(https:\/\/[^']+)'/g, dir: 'worker-src' },
  { re: /const GIS = '(https:\/\/[^']+)'/g, dir: 'script-src' },
  { re: /url:\s*'(https:\/\/[^']+\{z\}[^']*)'/g, dir: 'img-src' },
  { re: /const API = '(https:\/\/[^']+)'/g, dir: 'connect-src' },
];
const vistos = [];
for (const r of archivos('js').concat(archivos('anidador-vectores/js'))) {
  /* Sin comentarios: los de este repo traen ejemplos de ataques con su fetch() y todo. */
  const t = readFileSync(join(RAIZ, r), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const { re, dir } of SALIDAS) {
    for (const m of t.matchAll(re)) {
      const url = m[1].replace('{s}', 'a').replace(/\{[a-z]+\}/g, '1');
      for (const p of donde(r)) {
        vistos.push(r);
        cierto(r + ' → ' + new URL(url).host + ' por ' + dir + ' en ' + p, permite(POL[p], dir, url));
      }
    }
  }
}
cierto('y la búsqueda encontró las salidas que tiene que encontrar', vistos.length >= 6);
/* El geocodificador arma su dirección con URL(), no con un literal en el fetch. */
cierto('js/datos/geo.js → nominatim por connect-src en index.html',
  /nominatim\.openstreetmap\.org/.test(leer('js/datos/geo.js')) && permite(POL['index.html'], 'connect-src', 'https://nominatim.openstreetmap.org/search'));

console.log('\nNADIE DE AFUERA NOS EMPOTRA');
{
  const tema = leer('js/tema.js');
  cierto('js/tema.js se sale de un marco de otro origen', /window\.top\.location\.href/.test(tema) && /window\.top\.location = window\.self\.location/.test(tema));
  const sinTema = PAGINAS.filter(p => p !== 'plataforma.html' && !/<script src="(\.\.\/)?js\/tema\.js"><\/script>/.test(leer(p)));
  eq('y todas las páginas lo cargan (menos el reenvío, que no pinta nada)', sinTema, []);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
