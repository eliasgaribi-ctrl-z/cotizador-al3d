/* Service worker del Cotizador AL3D.
   Existe por una sola razón: la app se agrega a la pantalla de inicio y se usa en la calle,
   delante del cliente. Sin esto, abrirla sin señal daba la pantalla de error del navegador
   y el historial, los folios y la cotización en curso —que están en ESE teléfono— quedaban
   inalcanzables por no poder cargar el HTML que los lee.

   La estrategia es «red primero, caché de respaldo», no al revés. Es a propósito: el sitio
   se publica subiendo index.html a la rama main, así que una caché que mande siempre
   serviría la versión vieja después de publicar y el problema sería peor que el que se
   quiso arreglar. Con red primero, quien tiene señal ve siempre lo último; quien no la
   tiene, ve lo último que alcanzó a guardar. */
const CACHE = 'al3d-v1';
const BASICOS = ['./', './index.html', './manifest.webmanifest', './logo-al3d.png', './logo-al3d-dark.png'];

self.addEventListener('install', ev => {
  /* Los archivos se guardan de uno en uno: si alguno falta —el repo puede publicarse sin
     los logotipos— addAll fallaría entero y la instalación se quedaría sin nada. */
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(BASICOS.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Solo lo del propio origen: las llamadas a las APIs de IA no se tocan ni se guardan.
  if (url.origin !== self.location.origin) return;

  ev.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const guardada = await caches.match(req);
        if (guardada) return guardada;
        // Una navegación sin señal y sin copia exacta: se devuelve la portada guardada.
        if (req.mode === 'navigate') {
          const portada = await caches.match('./index.html') || await caches.match('./');
          if (portada) return portada;
        }
        throw new Error('sin conexión y sin copia guardada');
      })
  );
});
