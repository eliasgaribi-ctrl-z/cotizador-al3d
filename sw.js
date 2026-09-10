/* ============================================================================
   Service worker de AL3D. Una app, un conjunto versionado.

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ AL PUBLICAR CUALQUIER CAMBIO: SUBE APP_VERSION UNA UNIDAD.              │
   │ Es la única línea que hay que tocar. Sin eso, los teléfonos que ya      │
   │ tienen la app siguen sirviendo la versión de la caché.                  │
   │ Desde septiembre de 2026 esto incluye al cotizador: cotizador.html y    │
   │ js/cotizador/ van en el mismo conjunto que la plataforma.               │
   └─────────────────────────────────────────────────────────────────────────┘

   El cotizador existe por una sola razón, que sigue igual: la app se agrega a la pantalla
   de inicio y se usa en la calle, delante del cliente. Sin esto, abrirla sin señal daba la
   pantalla de error del navegador y el historial, los folios y la cotización en curso —que
   están en ESE teléfono— quedaban inalcanzables por no poder cargar el HTML que los lee.

   Durante un año su estrategia fue «red primero, caché de respaldo», porque era UN archivo
   que se publicaba subiéndolo a main. Ya no es un archivo: es cotizador.html más once guiones
   en js/cotizador/ y la hoja css/sistema.css que comparte con la plataforma. Un HTML nuevo con
   un guion viejo no es un cotizador viejo: es uno roto —exactamente el problema que se
   describe abajo para la plataforma—. Así que el cotizador entra al conjunto versionado y se
   promociona de golpe con todo lo demás. Lo que queda en la caché de siempre, red primero,
   son los archivos que no cambian con la versión: logotipos, iconos y manifiesto.

   QUIÉN ES QUIÉN, desde el cambio de puerta de entrada: la RAÍZ del sitio (`./`,
   `index.html`) es la plataforma —el calendario, la obra, el material— y `cotizador.html` es
   el cotizador. Antes era al revés. `plataforma.html` sigue existiendo como reenvío de diez
   líneas, porque hay marcadores e iconos instalados que apuntan ahí.

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

const APP_VERSION = 24;

const CACHE = 'al3d-v1';                       // el cotizador. Su comportamiento NO cambia.
const APP   = 'al3d-app-' + APP_VERSION;       // la plataforma, versionada.

/* La marca: lo que no lleva versión. Se guardan de uno en uno y con catch: el repo puede
   publicarse sin los logotipos, y con addAll un logo faltante tiraría la instalación entera. */
const BASICOS = ['./manifest.webmanifest',
                 './logo-al3d.svg', './logo-al3d-oscuro.svg',
                 './icono-192.png', './icono-512.png', './icono-maskable-512.png',
                 './apple-touch-icon.png'];

/* Los de la plataforma. Estos SÍ van con addAll, que es todo-o-nada, porque eso es
   exactamente lo que se quiere: o está el conjunto completo o no se promociona nada. */
const APP_FILES = [
  './',                 // la portada: AHORA es la app
  './index.html',       // y su nombre de archivo, por si alguien entra por ahí
  './plataforma.html',  // el reenvío de la dirección vieja
  './manifest-plataforma.webmanifest',
  './css/sistema.css',
  './css/plataforma.css',
  './js/tema.js',
  /* El cotizador: la página y sus once guiones. Van juntos porque se cargan en orden y se
     llaman entre sí; uno nuevo con uno viejo no arranca. */
  './cotizador.html',
  './js/cotizador/catalogo.js',
  './js/cotizador/nucleo.js',
  './js/cotizador/partidas.js',
  './js/cotizador/proceso.js',
  './js/cotizador/ia.js',
  './js/cotizador/entrega.js',
  './js/cotizador/historial.js',
  './js/cotizador/escalador.js',
  './js/cotizador/venta.js',
  './js/cotizador/vectorizador.js',
  './js/cotizador/arranque.js',
  './js/app.js',
  './js/nucleo/ui.js',
  './js/nucleo/fechas.js',
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
  './js/datos/taller.js',
  './js/datos/geo.js',
  './js/datos/reglas.js',
  './js/datos/sync.js',
  './js/datos/puente.js',
  './js/mod/tablero.js',
  './js/mod/cotizador.js',
  './js/mod/inicio.js',
  './js/mod/proyectos.js',
  './js/mod/fabricacion.js',
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
  /* El anidador de vectores. Va con la plataforma y no con el cotizador por la misma razón
     que los módulos: son diez guiones que se cargan en orden y se llaman entre sí, y la
     interfaz habla con el motor por una API concreta. Uno nuevo con uno viejo no es un
     anidador viejo: es uno que no arranca. Así que caché primero y el conjunto completo. */
  './anidador-vectores/',
  './anidador-vectores/index.html',
  './anidador-vectores/css/anidador.css',
  './anidador-vectores/js/app.js',
  './anidador-vectores/js/medidas.js',
  './anidador-vectores/js/svgnest.js',
  './anidador-vectores/js/svgparser.js',
  './anidador-vectores/js/lib/pathsegpolyfill.js',
  './anidador-vectores/js/lib/matrix.js',
  './anidador-vectores/js/lib/clipper.js',
  './anidador-vectores/js/lib/parallel.js',
  './anidador-vectores/js/lib/geometryutil.js',
  './anidador-vectores/js/lib/placementworker.js',
  './anidador-vectores/js/lib/eval.js',
  './anidador-vectores/js/lib/json.js',
];

/* ¿Esta petición es de la plataforma? Se decide por ruta y no por una lista, para que un
   archivo nuevo dentro de estas carpetas no se quede fuera por olvido.

   Se AMPLÍA a la raíz, no se invierte a «todo lo que no sea el cotizador»: los logotipos y
   los iconos viven en BASICOS y no en APP_FILES, y si cayeran aquí, sin señal devolverían el
   503 de más abajo — o sea la barra de la app con la imagen rota. Lo que no está en esta
   lista sigue por la ruta del cotizador, byte por byte como antes. */
function esDeLaPlataforma(url) {
  const p = url.pathname;
  return p.endsWith('/') ||                    // la portada del sitio
         p.endsWith('/index.html') ||
         p.endsWith('/cotizador.html') ||      // el cotizador, desde que va con el conjunto
         p.endsWith('/plataforma.html') ||     // el reenvío
         p.endsWith('/manifest-plataforma.webmanifest') ||
         p.indexOf('/anidador-vectores/') >= 0 ||   // el anidador entero, con sus workers
         /\/(css|js|vendor|datos)\//.test(p);
}

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    /* El cotizador: de uno en uno, tolerante a que falte alguno.
       Con {cache:'reload'}, igual que la plataforma. Sin eso, `c.add(u)` se sirve de la caché
       HTTP del navegador, así que un teléfono que ya tenía instalada la app se quedaba con el
       logotipo y los iconos VIEJOS aunque hubiera un sw.js nuevo: el install decía que había
       bajado todo y había bajado su propia copia rancia. Se notó justo al cambiar la marca,
       que es cuando por fin uno de estos archivos cambió de contenido. */
    try {
      const c = await caches.open(CACHE);
      await Promise.all(BASICOS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)));
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
    /* Las dos entradas rancias del cambio de puerta de entrada. En un teléfono que ya tenía
       la app, `al3d-v1` guarda `./` y `./index.html` con el COTIZADOR VIEJO dentro, que es
       justo la dirección donde ahora vive la plataforma. Hoy no se sirven —esas dos rutas las
       atiende la caché de la app—, pero dejarlas es dejar armada la trampa para el día que
       alguien vuelva a tocar el respaldo de navegación de abajo con un `caches.match` sin
       caché nombrada. Se borran una vez y no se pierde nada: el cotizador ahora se guarda como
       `./cotizador.html`. */
    try {
      const c = await caches.open(CACHE);
      await c.delete('./');
      await c.delete('./index.html');
    } catch (_) {}
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
    /* Navegación sin señal y sin copia: se devuelve la portada DE LA PLATAFORMA, que ahora
       es index.html. Antes cualquier navegación sin copia devolvía el cotizador, así que
       abrir la plataforma sin señal parecía que la app se había roto. */
    if (req.mode === 'navigate') {
      const portada = await c.match('./index.html') || await c.match('./');
      if (portada) return portada;
    }
    /* Un teléfono que tenía la app de antes de que el cotizador entrara al conjunto guarda
       cotizador.html y sus guiones en la caché vieja. Se mira ahí antes de rendirse. */
    try {
      const vieja = await (await caches.open(CACHE)).match(req, { ignoreSearch: true });
      if (vieja) return vieja;
    } catch (_) {}
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
   Sigue siendo lo correcto para un archivo que se publica subiéndolo a main: quien tiene
   señal ve siempre lo último; quien no la tiene, ve lo último que alcanzó a guardar. */
async function cotizador(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
    }
    return res;
  } catch (_) {
    /* Se busca en LA caché del cotizador, nombrada, y no con `caches.match(req)` a secas.
       Sin nombre, `caches.match` busca en TODAS, y desde el cambio de puerta `./index.html`
       existe en la caché de la app con la plataforma dentro: alguien sin señal tocaría
       «Cotizador», la copia de cotizador.html no estaría, y el respaldo le devolvería LA
       PLATAFORMA con la URL del cotizador. La app se vería rota y no habría un solo error en
       ninguna consola. */
    const c = await caches.open(CACHE);
    const guardada = await c.match(req);
    if (guardada) return guardada;
    if (req.mode === 'navigate') {
      const portada = await c.match('./cotizador.html');
      if (portada) return portada;
    }
    throw new Error('sin conexión y sin copia guardada');
  }
}
