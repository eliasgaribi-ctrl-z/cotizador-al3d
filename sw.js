/* ============================================================================
   Service worker de AL3D. Dos apps, dos estrategias.

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ AL PUBLICAR UN CAMBIO DE LA PLATAFORMA: SUBE APP_VERSION UNA UNIDAD.    │
   │ Es la única línea que hay que tocar. Sin eso, los teléfonos que ya      │
   │ tienen la app siguen sirviendo la versión de la caché.                  │
   │ (El cotizador NO necesita esto: sigue siendo red-primero.)              │
   └─────────────────────────────────────────────────────────────────────────┘

   El cotizador existe por una sola razón, que sigue igual: la app se agrega a la pantalla
   de inicio y se usa en la calle, delante del cliente. Sin esto, abrirla sin señal daba la
   pantalla de error del navegador y el historial, los folios y la cotización en curso —que
   están en ESE teléfono— quedaban inalcanzables por no poder cargar el HTML que los lee.

   Su estrategia sigue siendo «red primero, caché de respaldo», y es a propósito: el sitio se
   publica subiendo index.html a la rama main, así que una caché que mande siempre serviría
   la versión vieja después de publicar y el problema sería peor que el que se quiso arreglar.

   Eso es correcto para UN archivo. Es fatal para veinte. La plataforma son 25 módulos ES que
   se importan entre sí: con mala señal, `app.js` llega de la red (versión nueva) y
   `material.js` de la caché (versión vieja), el import falla y queda una PANTALLA BLANCA —
   justo en el escenario para el que el service worker existe. Un módulo nuevo con un módulo
   viejo no es una app vieja: es una app rota.

   Así que la plataforma va al revés: caché primero, revalidación en segundo plano, y el
   conjunto entero se promociona de golpe o no se promociona. El nombre de la caché lleva la
   versión, así que la nueva solo empieza a servir cuando `activate` corre, y `activate` solo
   corre si `install` bajó TODOS los archivos. Si falta uno, la versión anterior sigue
   completa y sirviendo.
   ============================================================================ */

const APP_VERSION = 3;

const CACHE = 'al3d-v1';                       // el cotizador. Su comportamiento NO cambia.
const APP   = 'al3d-app-' + APP_VERSION;       // la plataforma, versionada.

/* Los del cotizador. Se guardan de uno en uno y con catch: el repo puede publicarse sin los
   logotipos, y con addAll un logo faltante tiraría la instalación entera. */
const BASICOS = ['./', './index.html', './manifest.webmanifest',
                 './logo-al3d.png', './logo-al3d-dark.png'];

/* Los de la plataforma. Estos SÍ van con addAll, que es todo-o-nada, porque eso es
   exactamente lo que se quiere: o está el conjunto completo o no se promociona nada. */
const APP_FILES = [
  './plataforma.html',
  './manifest-plataforma.webmanifest',
  './css/sistema.css',
  './css/plataforma.css',
  './js/app.js',
  './js/nucleo/ui.js',
  './js/nucleo/ics.js',
  './js/nucleo/gcal.js',
  './js/datos/db.js',
  './js/datos/prefs.js',
  './js/datos/cotizador.js',
  './js/datos/catalogo-precios.js',
  './js/datos/proyectos.js',
  './js/datos/material.js',
  './js/datos/stock.js',
  './js/datos/agenda.js',
  './js/datos/geo.js',
  './js/datos/reglas.js',
  './js/datos/sync.js',
  './js/datos/puente.js',
  './js/mod/inicio.js',
  './js/mod/proyectos.js',
  './js/mod/agenda.js',
  './js/mod/material.js',
  './js/mod/mapa.js',
  './js/mod/ajustes.js',
  './datos/semilla.json',
  './vendor/leaflet.css',
  './vendor/leaflet-src.esm.js',
  './vendor/images/marker-icon.png',
  './vendor/images/marker-icon-2x.png',
  './vendor/images/marker-shadow.png',
  './vendor/images/layers.png',
  './vendor/images/layers-2x.png',
];

/* ¿Esta petición es de la plataforma? Se decide por ruta y no por una lista, para que un
   archivo nuevo dentro de estas carpetas no se quede fuera por olvido. */
function esDeLaPlataforma(url) {
  const p = url.pathname;
  return p.endsWith('/plataforma.html') ||
         p.endsWith('/manifest-plataforma.webmanifest') ||
         /\/(css|js|vendor|datos)\//.test(p);
}

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    /* El cotizador: de uno en uno, tolerante a que falte alguno. */
    try {
      const c = await caches.open(CACHE);
      await Promise.all(BASICOS.map(u => c.add(u).catch(() => null)));
    } catch (_) { /* si ni la caché del cotizador abre, la app sigue funcionando con red */ }

    /* La plataforma: todo o nada, y con {cache:'reload'} para no bajar de la caché HTTP del
       navegador lo mismo que se está intentando actualizar.

       addAll rechaza si CUALQUIERA falla, y eso es lo que se quiere: el conjunto de módulos
       se promociona completo o no se promociona, porque un módulo nuevo con uno viejo no es
       una app vieja, es una app rota.

       PERO ese fallo NO puede tumbar la instalación entera, y esto se aprendió publicando:
       si `install` falla, este service worker no activa, y para quien instala la app POR
       PRIMERA VEZ eso significa quedarse SIN service worker — o sea sin el cotizador sin
       señal, que es la única razón por la que este archivo existe. El cotizador se usa en la
       calle, delante del cliente, y su garantía de abrir sin red no puede depender de que la
       plataforma esté completa.

       Así que el conjunto de la plataforma se intenta y, si no llega entero, se borra lo que
       alcanzó a bajar —para no dejar una mezcla a medias— y la instalación sigue adelante
       con el cotizador a salvo. La plataforma se servirá de la red mientras haya, y volverá
       a intentar cachearse en la siguiente instalación. */
    let appCompleta = false;
    try {
      const c = await caches.open(APP);
      await c.addAll(APP_FILES.map(u => new Request(u, { cache: 'reload' })));
      appCompleta = true;
    } catch (e) {
      try { await caches.delete(APP); } catch (_) {}
      /* Queda en la consola del navegador, que es donde alguien lo va a buscar el día que
         el mapa no abra sin señal. */
      console.warn('[al3d] la plataforma no se pudo guardar completa; el cotizador sí. ' +
                   'Falta algún archivo de APP_FILES:', e && e.message);
    }
    /* Aquí estaba `void appCompleta;`: la bandera se calculaba y se tiraba. Con ella tirada,
       la promesa de la cabecera —«Si falta uno, la versión anterior sigue completa y
       sirviendo»— era FALSA por todos los caminos, y por uno que nadie miraba:

         1. addAll falla por un archivo · el catch borra al3d-app-3 (la que se bajaba)
         2. el catch se traga el fallo · install resuelve · corre skipWaiting()
         3. activate borra toda caché que no sea CACHE ni APP · borra al3d-app-2
         4. al3d-app-2 era la copia COMPLETA que estaba sirviendo. Ya no hay ninguna.

       O sea que un archivo que falte al publicar no degrada la plataforma: la apaga entera
       en los teléfonos que la tenían funcionando. El cotizador sí sobrevive —activate
       conserva `al3d-v1` explícitamente— pero la plataforma se queda con el 503 de texto
       plano de más abajo, sin señal y delante del cliente.

       El arreglo es dejar que la instalación FALLE, que es el contrato normal de un service
       worker: un install que falla no activa, el worker viejo sigue en su sitio y sigue
       sirviendo su caché completa. Nada se borra y en la siguiente visita se reintenta.

       Con una excepción, y es la que explica por qué esto se escribió al revés: en la
       PRIMERA instalación no hay worker viejo que siga sirviendo, así que un fallo aquí
       deja el teléfono sin service worker —o sea sin el cotizador sin señal, que es la
       única razón por la que este archivo existe—. Ese es el incidente que documenta
       pruebas/navegador/service-worker.mjs. Así que ahí sí se sigue adelante.

       La diferencia entre los dos casos se pregunta a las cachés y no a una variable: el
       worker puede reiniciarse entre install y activate y una bandera en memoria se pierde. */
    if (!appCompleta) {
      const nombres = await caches.keys();
      const hayAnterior = nombres.some(k => k !== APP && k.indexOf('al3d-app-') === 0);
      if (hayAnterior) {
        throw new Error('la plataforma no bajó completa; se deja servir a la versión anterior');
      }
      /* Primera instalación: el cotizador vale más que la plataforma. Se sigue. */
    }

    /* skipWaiting va al final, dentro del waitUntil: si se pusiera antes, un conjunto a
       medio bajar podría empezar a servir. */
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.map(k => {
      /* Se conserva la del cotizador y la versión vigente de la plataforma. Todo lo demás
         —versiones anteriores de la app— se va. */
      if (k === CACHE || k === APP) return null;
      return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Solo lo del propio origen. Esta línea hace tres cosas y ninguna es accidental:
       1) las llamadas a las APIs de IA no se tocan ni se guardan (la razón original);
       2) el puente de fase 3 tampoco, así que el estado nunca se sirve viejo;
       3) los tiles de OpenStreetMap NO se cachean — y eso es lo que exige su política, que
          prohíbe archivar tiles y precargar más de 250 en zoom 13 o mayor.
     QUE NADIE "MEJORE" ESTO cacheando los tiles del mapa: es una violación de la política de
     la OSMF y la forma más rápida de que nos corten el servicio. La consecuencia se dice con
     palabras en la pantalla del mapa: el mapa necesita señal; los datos no. */
  if (url.origin !== self.location.origin) return;

  if (esDeLaPlataforma(url)) { ev.respondWith(plataforma(req)); return; }
  ev.respondWith(cotizador(req));
});

/* ----- La plataforma: caché primero -----
   Respuesta instantánea y sin red, que es lo que hace que abrir la app en la calle no
   dependa de la señal. La revalidación va en segundo plano y no bloquea nada: si tarda o
   falla, ya se sirvió la copia. Y no se escribe archivo por archivo en la caché vigente
   —eso es justo lo que produciría la mezcla de versiones—: lo único que hace la
   revalidación es enterarse de que hay algo nuevo, y de la actualización se encarga el
   ciclo de install/activate con APP_VERSION. */
async function plataforma(req) {
  const c = await caches.open(APP);
  const guardada = await c.match(req, { ignoreSearch: true });
  if (guardada) {
    /* Un toque a la red para que el navegador note un sw.js nuevo, con techo de 5 s. No se
       espera: el timeout no cuesta nada porque la respuesta ya salió. */
    revalidar(req);
    return guardada;
  }
  /* No estaba en la caché. Puede ser un archivo nuevo de una versión que todavía no se
     instaló, o la primera visita. Se va a la red. */
  try {
    const res = await fetch(req);
    if (res && res.ok) { try { await c.put(req, res.clone()); } catch (_) {} }
    return res;
  } catch (_) {
    /* Navegación sin señal y sin copia: se devuelve la portada DE LA PLATAFORMA. Antes
       cualquier navegación sin copia devolvía index.html, así que abrir la plataforma sin
       señal mandaba al cotizador y parecía que la app se había roto. */
    if (req.mode === 'navigate') {
      const portada = await c.match('./plataforma.html');
      if (portada) return portada;
    }
    return new Response('Sin conexión y sin copia guardada de la plataforma.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

let _revalidando = false;
function revalidar(req) {
  /* Una sola revalidación por vuelta: la plataforma pide 25 módulos al arrancar y no tiene
     sentido mandar 25 peticiones a la red para enterarse de lo mismo. */
  if (_revalidando) return;
  _revalidando = true;
  const corte = new Promise(r => setTimeout(r, 5000));
  Promise.race([fetch(req, { cache: 'no-cache' }).catch(() => null), corte])
    .finally(() => { _revalidando = false; });
}

/* ----- El cotizador: red primero, caché de respaldo -----
   Idéntico a como estaba, sin tocar una coma. Sigue siendo lo correcto para un archivo que
   se publica subiéndolo a main: quien tiene señal ve siempre lo último; quien no la tiene,
   ve lo último que alcanzó a guardar. */
async function cotizador(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
    }
    return res;
  } catch (_) {
    const guardada = await caches.match(req);
    if (guardada) return guardada;
    if (req.mode === 'navigate') {
      const portada = await caches.match('./index.html') || await caches.match('./');
      if (portada) return portada;
    }
    throw new Error('sin conexión y sin copia guardada');
  }
}
