/* LA PÁGINA DE «SIN SEÑAL Y SIN COPIA» DEL SERVICE WORKER (ficha A17).
 *
 * Qué defiende: la primera pantalla que ve alguien que abre la app en la calle antes de
 * haberla abierto nunca con señal. Era una línea de texto plano —`new Response('Sin conexión
 * y sin copia guardada de la plataforma.')`— y en el cotizador ni eso: la página de error del
 * navegador. Delante de un cliente, eso no dice «falta señal», dice «esta app no existe».
 *
 * Lo que aquí se sostiene es el CONTRATO de esa respuesta, que es lo que se rompe sin que
 * nadie lo note:
 *
 *   · No pide NADA de fuera. Ni una fuente de Google, ni un guion, ni una hoja de estilo. Es
 *     el único momento del repo en que se puede dar por hecho que no hay red: una página sin
 *     señal que enlaza algo de internet se ve peor que la que vino a reemplazar.
 *   · El logo se pide por su dirección absoluta, calculada desde la del propio service
 *     worker. Con una relativa, `logo-al3d.svg` al lado de una navegación a /taller/algo se
 *     pediría a /taller/logo-al3d.svg, que no existe en ninguna caché.
 *   · Sigue siendo un 503 y lleva `no-store`. Guardarla sería enseñar «sin señal» a quien ya
 *     tiene señal, y un 200 la dejaría en el historial como si fuera la app.
 *   · La recarga va SOLO con el evento `online`. Con `navigator.onLine` al cargar, un portal
 *     cautivo o el sitio caído dejan la página recargándose sola para siempre.
 *
 * sw.js no es un módulo y registra oyentes en el nivel de arriba, así que se evalúa en un
 * contexto aparte con un `self` de mentiras que solo apunta lo que le registran.
 *
 * Se corre con pruebas/correr.sh, como todas.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const falso = (que, x) => eq(que, !!x, false);

const aqui = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(aqui, '..', 'sw.js'), 'utf8');

/* El `self` mínimo: una dirección de service worker y un registro de oyentes que no hace
   nada. El worker vive en la raíz del sitio, que es donde está de verdad. */
const oyentes = {};
const self_ = {
  location: { href: 'https://taller.al3d.mx/sw.js', origin: 'https://taller.al3d.mx' },
  addEventListener: (k, f) => { (oyentes[k] = oyentes[k] || []).push(f); },
  skipWaiting: () => Promise.resolve(),
  clients: { claim: () => Promise.resolve() },
  registration: { scope: 'https://taller.al3d.mx/' },
};
class RespuestaFalsa {
  constructor(cuerpo, init) {
    this.body = cuerpo;
    this.status = (init && init.status) || 200;
    this.headers = new Map(Object.entries((init && init.headers) || {}));
  }
}
const ctx = vm.createContext({
  /* Cachés VACÍAS, no rotas: el caso que se prueba es justo «sin señal y sin copia», y una caché
     que lanza error probaría otro camino (el del catch de más adentro). */
  self: self_, caches: { open: () => Promise.resolve({ match: () => Promise.resolve(undefined), put: () => Promise.resolve() }),
                         keys: () => Promise.resolve([]), match: () => Promise.resolve(undefined) },
  fetch: () => Promise.reject(new Error('sin red en la prueba')),
  Response: RespuestaFalsa, Request: class {}, URL, console,
  setTimeout, clearTimeout, Promise,
});
vm.runInContext(src, ctx);
const api = vm.runInContext('({ paginaSinSenal, sinSenal, plataforma, cotizador, BASICOS })', ctx);
const html = api.paginaSinSenal();

console.log('\nLA RESPUESTA — 503, HTML y sin guardar');
{
  const r = api.sinSenal();
  eq('sigue siendo un 503: para el navegador esto es un fallo de red', r.status, 503);
  eq('y ahora es HTML, no texto plano', r.headers.get('Content-Type'), 'text/html; charset=utf-8');
  cierto('con no-store: no se guarda en ninguna caché', /no-store/.test(r.headers.get('Cache-Control') || ''));
  cierto('el cuerpo es la página', /Sin señal/.test(String(r.body)));
  eq('se arma en cada petición (dos llamadas, dos cuerpos equivalentes)', api.paginaSinSenal(), html);
}

console.log('\nNADA DE FUERA — es la única pantalla que se pinta sin red');
{
  const fuera = (html.match(/https?:\/\/[^"' )]+/g) || []).filter(u => !u.startsWith('https://taller.al3d.mx/'));
  eq('ninguna dirección que no sea la del propio sitio', fuera, []);
  falso('sin fuentes de Google', /fonts\.(googleapis|gstatic)/.test(html));
  falso('sin hojas de estilo enlazadas: el CSS va en línea', /<link[^>]+stylesheet/i.test(html));
  falso('sin guiones externos', /<script[^>]+src=/i.test(html));
  cierto('el CSS va dentro, en un <style>', /<style>/.test(html));
  cierto('y declara su propia CSP, que solo deja imágenes del sitio', /Content-Security-Policy/.test(html) && /img-src 'self'/.test(html));
}

console.log('\nEL LOGO — el de la caché, por su dirección absoluta');
{
  cierto('el logo claro, en la raíz del worker', html.includes('https://taller.al3d.mx/logo-al3d.svg'));
  cierto('y el oscuro para el tema de noche', html.includes('https://taller.al3d.mx/logo-al3d-oscuro.svg'));
  falso('nunca relativo: una navegación a /loquesea/ lo pediría al lado y no existiría',
        /src="logo-al3d\.svg"/.test(html));
  /* Los dos están en BASICOS, que es lo que hace que la caché los tenga desde la primera
     instalación. Si alguien los saca de esa lista, esta página se queda sin logo. */
  cierto('logo-al3d.svg está en BASICOS', api.BASICOS.includes('./logo-al3d.svg'));
  cierto('logo-al3d-oscuro.svg también', api.BASICOS.includes('./logo-al3d-oscuro.svg'));
}

console.log('\nLO QUE DICE Y LO QUE OFRECE');
{
  cierto('dice qué pasó, con las dos condiciones: sin señal Y sin copia', /Sin señal y sin copia guardada/.test(html));
  cierto('y qué hacer para que no vuelva a pasar', /ábrela una vez con señal/.test(html));
  cierto('trae un botón de reintentar', /Reintentar/.test(html));
  cierto('con 48 px de alto: se toca con el dedo', /min-height:48px/.test(html));
  falso('sin emojis', /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html));
  cierto('el aviso de que volvió la señal es una región viva', /role="status"/.test(html));
  cierto('el logo lleva texto alternativo', /alt="AL3D"/.test(html));
}

console.log('\nEL ENCENDIDO AL VOLVER LA SEÑAL');
{
  cierto('escucha el evento online', /addEventListener\("online"/.test(html));
  falso('y NO recarga por navigator.onLine al cargar: eso da vueltas solo con un portal cautivo',
        /navigator\.onLine/.test(html));
  cierto('el logo empieza apagado, en gris', /filter:grayscale\(1\)/.test(html));
  cierto('y se enciende a color, con un halo que se apaga solo', /\.logo\.viva\{filter:grayscale\(0\)/.test(html) && /drop-shadow\(0 0 14px/.test(html));
  cierto('después recarga sola', /location\.reload\(\)/.test(html));
  cierto('con menos movimiento no hay parpadeo ni espera', /prefers-reduced-motion: reduce/.test(html));
}

console.log('\nEL TEMA DE NOCHE');
{
  cierto('la página tiene su propio juego de colores para el tema oscuro', /prefers-color-scheme:dark/.test(html));
  cierto('y lo declara con color-scheme, para que el navegador pinte igual', /color-scheme:light dark/.test(html));
  /* Son copia literal de los tokens de css/sistema.css, que aquí no se puede enlazar. Si los
     tokens cambian y esto no, la página sin señal se ve de otra empresa. */
  cierto('el fondo claro es --fondo', html.includes('--fondo:#f3f4fb'));
  cierto('el fondo oscuro también', html.includes('--fondo:#0f1124'));
  cierto('el acento claro es --a', html.includes('--a:#4060f8'));
  cierto('y el de noche', html.includes('--a:#6d86ff'));
  /* El botón lleva letra blanca y el aviso letra de color: con `--a` a secas, de noche el blanco
     sobre #6d86ff medía 3,3:1. Botón y texto usan los tokens de relleno y de texto del sistema
     —los mismos de css/sistema.css— y no el acento. */
  cierto('el botón se rellena con --a-fill, en los dos temas', /button\{[^}]*background:var\(--a-fill\)/.test(html)
    && html.includes('--a-fill:#4060f8') && html.includes('--a-fill:#3b57e6'));
  cierto('el aviso usa --a-tx, en los dos temas', /\.aviso\{color:var\(--a-tx\)/.test(html)
    && html.includes('--a-tx:#3018f8') && html.includes('--a-tx:#a9b8ff'));
}

console.log('\nQUIÉN RECIBE LA PÁGINA — solo quien abre la app');
{
  const nav = { url: 'https://taller.al3d.mx/', mode: 'navigate' };
  const guion = { url: 'https://taller.al3d.mx/js/app.js', mode: 'no-cors' };
  const cot = { url: 'https://taller.al3d.mx/cotizador.html', mode: 'navigate' };
  const cotGuion = { url: 'https://taller.al3d.mx/js/cotizador/nucleo.js', mode: 'no-cors' };
  let r = await api.plataforma(nav);
  eq('la plataforma, navegando sin señal y sin copia: la página', [r.status, r.headers.get('Content-Type')], [503, 'text/html; charset=utf-8']);
  r = await api.plataforma(guion);
  eq('pero un guion que no llegó sigue siendo un 503 de texto, no un HTML disfrazado de JavaScript',
     [r.status, r.headers.get('Content-Type')], [503, 'text/plain; charset=utf-8']);
  r = await api.cotizador(cot);
  eq('el cotizador, navegando sin copia: la misma página, y no el dinosaurio del navegador',
     [r.status, r.headers.get('Content-Type')], [503, 'text/html; charset=utf-8']);
  let cayo = false;
  try { await api.cotizador(cotGuion); } catch (_) { cayo = true; }
  cierto('y un archivo suelto del cotizador sigue fallando como fallaba', cayo);
}

/* APP_VERSION y las listas las mueve el integrador al publicar, y esta prueba no las compara:
   compararlas era romperse sola el día que se sube la versión. */

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
