# Decisiones técnicas — PWA estática (GitHub Pages, sin build, ES modules nativos)

> **Advertencia de método, léela primero.** En esta sesión el proxy de egress bloqueó **WebFetch para todos los hosts** que intenté (`operations.osmfoundation.org`, `wiki.openstreetmap.org`, `community.openstreetmap.org`, `leafletjs.com`, `unpkg.com`, `developers.notion.com`, `developers.google.com`, `supabase.com`, `datatracker.ietf.org`, `icalendar.org`, `web.archive.org`, `openstreetmap.github.io`). Error literal: `EGRESS_BLOCKED ... blocked by the network egress proxy`. **No pude leer con mis ojos ninguna página primaria.** Todo lo que sigue viene de extractos que WebSearch citó *de* esas páginas. Marco con **[NO VERIFICADO]** todo lo que no tengo respaldado por una cita textual de la fuente. No inventé ningún número.

---

## 1. MAPA sin llave — Leaflet 1.9.x + tiles de OSM

### 1.1 Carga en módulo ES nativo

Leaflet 1.9.4 **quitó el entrypoint ESM del `package.json`** por incompatibilidad con plugins; hay que apuntar al archivo explícito ([CHANGELOG de Leaflet](https://github.com/Leaflet/Leaflet/blob/main/CHANGELOG.md)): *"the ESM entrypoint was dropped from the package due to numerous compatibility issues with plugins, and users should import `leaflet/dist/leaflet-src.esm.js` explicitly instead... ESM by default will come in v2"*.

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<div id="map" style="height:60vh"></div>

<script type="module">
// OJO: leaflet-src.esm.js exporta SOLO nombres, NO tiene default export.
// `import L from ...` te da undefined. Usa namespace import:
import * as L from 'https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js';

// Los plugins 1.x son UMD y esperan el global. Si vas a usar plugins:
window.L = L;

const map = L.map('map').setView([20.5230, -103.4470], 14); // Tlajomulco

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,                       // techo real del layer estándar de OSM
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

L.marker([20.5230, -103.4470]).addTo(map).bindPopup('Casa');
</script>
```

Notas:
- El CSS **no** se puede importar desde un módulo ES sin bundler (no hay CSS modules en navegadores hoy con esa sintaxis). Va con `<link>`, sí o sí.
- `maxZoom: 19` — **[NO VERIFICADO]** el número exacto contra la página de política; es el valor de facto del layer estándar.
- El SRI hash de arriba es el que circula para 1.9.4 — **[NO VERIFICADO]**, no pude abrir `leafletjs.com/download.html`. Si no lo confirmas, quita el `integrity` antes que dejarlo mal.
- Para sin-CDN: baja los 3 archivos (`leaflet.css`, `leaflet-src.esm.js`, `images/`) al repo. GitHub Pages los sirve bien y eliminas dependencia de unpkg.

### 1.2 Política REAL de `tile.openstreetmap.org`

Fuente: [Tile Usage Policy, OSMF OWG](https://operations.osmfoundation.org/policies/tiles/) (leída vía extractos de búsqueda).

**Qué está permitido / cuál es "el límite":** aquí está el punto importante y contraintuitivo — **no existe un límite numérico publicado de peticiones por segundo ni por día para tiles.** El texto es cualitativo:

- *"OpenStreetMap data is free for everyone to use, but the tile servers are not: they are funded by donations and sponsorship, and capacity is limited."*
- *"their availability to others is on a best effort basis and no SLA or guarantees are offered"*
- *"Access may be blocked, without notice, if your usage degrades the service"*, y *"Users who make large demands on the tile server will be slowed down by a throttling mechanism"* ([resumen de la política](https://operations.osmfoundation.org/policies/tiles/)).

**Requisitos técnicos obligatorios** (los cumple un navegador moderno por default, y eso es la buena noticia para tu caso):
1. **User-Agent válido** que identifique tu aplicación (o `X-Requested-With` con app ID en plataformas que lo pongan solo). *"Incorrect, spoofed or non-existent identification may result in rejected requests."* En navegador **no puedes** poner UA — por eso la política dice explícitamente: *"From web pages, ensure a valid HTTP `Referer` header is sent."*
2. **Referer válido** desde páginas web → **no pongas un `Referrer-Policy` restrictivo**; hacerlo es violación explícita de la política.
3. **Cachear según los headers HTTP** (`Cache-Control`, `Expires`, `Etag`); si tu caché no los sabe leer, **mínimo 7 días** por tile.
4. **Nunca** mandar `Cache-Control: no-cache` / `Pragma: no-cache` por default.
5. **Atribución** de la licencia OSM visible en el mapa (típicamente abajo-derecha).

**Qué NO está permitido:**
- **Bulk downloading / scraping**: *"any pre-emptive fetching of tiles other than those a user is actively viewing"*. Regla concreta citada: **bajar un área de más de 250 tiles en zoom 13 o superior** para uso offline o posterior está **prohibido**. Precargar pueblos/regiones o stacks de zoom "por si acaso" es inaceptable.
- Crear un archivo de tiles / uso offline.

**Uso comercial de un negocio pequeño — la respuesta honesta:** no está *prohibido*, pero tampoco hay excepción para bajo volumen. La política advierte específicamente: *"Commercial services, or those that seek donations, should be especially aware that access may be withdrawn at any point: you may no longer be able to serve your paying customers if access is withdrawn"*, y remite a *"companies who specialize in commercial services built upon OpenStreetMap data"* o a montar tu propio tile server. Hilo del foro sobre exactamente este caso: [Usage policy for tiles in "small" commercial context?](https://community.openstreetmap.org/t/usage-policy-for-tiles-in-small-commercial-context/1137).

**Veredicto práctico:** una PWA de negocio con pocos usuarios y uso interactivo normal (usuario pan/zoom) cumple sin problema los requisitos técnicos y no cae en bulk download. El riesgo real no es "te pasas del límite", es **"te pueden cortar sin aviso y sin SLA"**. Si el mapa es parte del producto que cobras, ten el plan B listo (abajo) y la migración a un tile URL configurable desde el día 1.

### 1.3 Alternativas gratuitas de tiles

| Proveedor | Límite gratis verificado | Restricción clave |
|---|---|---|
| **CARTO Basemaps** | **5 millones de tile requests/mes** como *fair use*; solo requiere una API key (sin cuenta CARTO, según el extracto). Arriba de eso te contactan: proyectos no comerciales suelen recibir límite mayor; **comercial → licencia Enterprise**. [carto.com/basemaps](https://carto.com/basemaps/) | Comercial = negociar Enterprise |
| **MapTiler Cloud** | **100,000 API requests/mes** + **5,000 API sessions/mes**. Al pegar cualquiera de los dos, en plan free **los mapas se suspenden el resto del mes**. [maptiler.com/cloud/pricing](https://www.maptiler.com/cloud/pricing/) | Free limitado a *"non-commercial use and research & development for commercial products"* ([términos](https://www.maptiler.com/terms/cloud/)) |
| **Stadia Maps** | Free tier *"available for development, evaluation, and non-commercial use (including academic use)"*, con límite mensual de **créditos** (1 crédito = 1 raster tile; 10 = static map; 10 = ruta). Al agotar: **HTTP 429** hasta el siguiente ciclo. [docs.stadiamaps.com/limits](https://docs.stadiamaps.com/limits/) | El número exacto de créditos/mes **[NO VERIFICADO]** — un extracto secundario menciona ~5,000 req/día (~150k/mes), no lo confirmé en la doc oficial. **No comercial.** |

**Conclusión de arquitectura:** de los tres, **CARTO es el único cuyo free tier de basemaps no está restringido de entrada a "no comercial"** en el material que pude verificar, y tiene el techo más alto (5M/mes). MapTiler y Stadia free son explícitamente no-comerciales. Para un negocio pequeño de verdad: **CARTO como primaria, OSM como fallback**, con el URL template en config.

```js
const TILES = {
  osm:   {url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max:19,
          attr:'&copy; OpenStreetMap contributors'},
  carto: {url:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', max:20,
          attr:'&copy; OpenStreetMap contributors &copy; CARTO', sub:'abcd'}
};
const t = TILES[localStorage.tileProvider || 'carto'];
L.tileLayer(t.url, {maxZoom:t.max, attribution:t.attr, subdomains:t.sub || 'abc'}).addTo(map);
```

---

## 2. GEOCODIFICACIÓN sin llave — Nominatim

Fuente: [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) (vía extractos).

**Límite exacto:** *"No heavy uses (an absolute maximum of 1 request per second)"*. Ese es el número, y es duro.

**Headers:** *"Provide a valid HTTP `Referer` **or** `User-Agent` identifying the application (stock User-Agents as set by http libraries will not do)"*. Es **O**, no **Y** — y por eso **el uso desde navegador es viable**: el navegador manda `Referer` automáticamente y `Referer` cumple el requisito. No puedes setear `User-Agent` desde `fetch()` (es un header prohibido), así que dependes del `Referer` → **no pongas `Referrer-Policy: no-referrer`**.

**¿Permite uso desde el navegador?** Sí, condicionado: *"Use that is directly triggered by the end-user (for example, user searches for something) is ok, provided that your number of users is moderate."*

**Prohibido explícitamente:**
- **Autocomplete / search-as-you-type**: *"auto-complete search is not yet supported and you must not implement such a service on the client side using the API"*. Esto es lo que más rompe diseños de PWA — no puedes poner un input que geocodifique al teclear. Debe ser un botón / submit explícito, con debounce agresivo si insistes.
- **Consultas sistemáticas**: reverse en grilla, listas completas de códigos postales o poblaciones.
- Cláusula nueva y muy relevante para tu contexto: *"the public Nominatim API must not be built into, offered through, suggested by, or automatically generated by no-code, low-code, or vibe-coding platforms as a generic geocoding service"*.

**¿Se puede cachear?** No solo se puede — **es obligatorio**: *"Results must be cached on your side"*, y *"clients sending repeatedly the same query may be classified as faulty and blocked"*. Repetir la misma query es causa de bloqueo.

Para tareas bulk chicas de una sola vez: *"limited to 1 machine only, no distributed scripts"*, y scripts que corran más de un día o en intervalos regulares están limitados a **4 peticiones por minuto**.

### Código mínimo: cola de 1 req/s + caché persistente

```js
// geocode.js — cumple 1 req/s, cachea en localStorage, sin autocomplete
const CACHE_KEY = 'nominatim_v1';
const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
const TTL = 90 * 24 * 3600 * 1000;               // 90 días
let cadena = Promise.resolve();                   // serializa TODO

function throttle(fn) {                           // 1 req/s estricto
  cadena = cadena.then(() => new Promise(r => setTimeout(r, 1100))).then(fn);
  return cadena;
}

export async function geocode(q) {
  const k = q.trim().toLowerCase();
  const hit = cache[k];
  if (hit && Date.now() - hit.t < TTL) return hit.v;          // 0 peticiones

  const v = await throttle(async () => {
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.search = new URLSearchParams({
      q, format: 'jsonv2', limit: 1,
      countrycodes: 'mx',
      email: 'remates@thiqa.mx'        // identifica la app; recomendado por la policy
    });
    const r = await fetch(u);          // Nominatim responde con Access-Control-Allow-Origin: *
    if (r.status === 429 || r.status === 403) throw new Error('nominatim throttled: ' + r.status);
    const j = await r.json();
    return j[0] ? {lat: +j[0].lat, lon: +j[0].lon, display: j[0].display_name} : null;
  });

  cache[k] = {v, t: Date.now()};
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  return v;
}
```
> **[NO VERIFICADO]** que `nominatim.openstreetmap.org` mande `Access-Control-Allow-Origin: *` — no pude hacer la petición desde aquí. Es el comportamiento conocido (existe [nominatim-browser](https://github.com/nozzlegear/nominatim-browser) precisamente para navegador), pero pruébalo con la consola de red antes de comprometerte.

### Alternativas con más cupo

| Servicio | Cupo gratis | CORS desde navegador |
|---|---|---|
| **LocationIQ** free | **5,000 req/día y 2 req/s** ([pricing](https://locationiq.com/pricing)) | Sí, con API key en el query string → la key queda pública en tu HTML. Restríngela por dominio referer en su panel. |
| **Photon (komoot)** `photon.komoot.io` | **Sin límite numérico publicado.** *"The API can be used for your project, but users should be fair — extensive usage will be throttled"*; disponibilidad no garantizada ([docs/usage.md](https://github.com/komoot/photon/blob/master/docs/usage.md)) | El servidor demo: **[NO VERIFICADO]**. Photon **por default trae CORS desactivado**; se habilita con `-cors-any` / `-cors-origin` al levantarlo. Si el demo público no lo trae puesto, no sirve desde navegador. Hay un [issue de Drupal por ausencia de `Access-Control-Allow-Origin` en Photon](https://www.drupal.org/project/geocoder/issues/3205868), lo que sugiere que ha estado desactivado. Verifícalo. |

**Recomendación:** Nominatim con la cola de arriba para volumen bajo; **LocationIQ free como upgrade natural** (mismo formato de respuesta que Nominatim, cambio de una línea, 5,000/día y límite explícito en vez de "fair use" difuso).

---

## 3. PARSEAR COORDENADAS de un link de Google Maps

Google **no documenta** el formato del parámetro `data=` — *"Developers and enthusiasts have reverse-engineered many common data segment codes, though Google does not officially document them"* ([codestudy.net](https://www.codestudy.net/blog/what-is-the-encoding-of-the-data-attribute-in-the-new-google-maps/)). Todo lo de esta sección es ingeniería inversa que puede romperse sin aviso; valida siempre rangos.

### Inventario de formatos

| # | Forma real | ¿Regex sin red? | Qué contiene |
|---|---|---|---|
| 1 | `google.com/maps/place/Nombre/@20.5230,-103.4470,17z/...` | **SÍ** | `@` = **centro del viewport**, no necesariamente el pin |
| 2 | `google.com/maps/@20.5230,-103.4470,15z` | **SÍ** | solo cámara |
| 3 | `google.com/maps?q=20.5230,-103.4470` (y `query=`, `center=`, `ll=`, `destination=`, `origin=`) | **SÍ** | coordenada explícita, la más limpia |
| 4 | `google.com/maps/search/20.5230,+-103.4470` | **SÍ** | coordenada explícita |
| 5 | `.../data=!3m1!4b1!4m6!3m5!1s0x...!8m2!3d20.5230!4d-103.4470` | **SÍ** | **`!3d`=lat, `!4d`=lng → la coordenada REAL del lugar.** La más precisa de todas |
| 6 | `google.com/maps/dir/Origen/Destino/@lat,lng,z/data=...!1m5!1m1!1s0x..!2m2!1d-103.4470!2d20.5230...` | **SÍ, pero cuidado** | En contexto `dir`/`embed` el orden se **invierte**: `!1d`/`!2d` = **lng**, `!2d`/`!3d` = **lat**. El extracto de búsqueda lo confirma para ese patrón: *"!2d represents longitude and !3d represents latitude"* ([codestudy.net](https://www.codestudy.net/blog/decoding-the-google-maps-embedded-parameters/)). Es decir: **`!3d` significa lat en un `place` y lat en un `!2d!3d`, pero el número que lo acompaña cambia de rol según el par.** Por eso hay que validar rangos, no confiar en el índice |
| 6b | `google.com/maps/dir/?api=1&destination=20.52,-103.44` | **SÍ** | cae en la regla #3 |
| 7 | `maps.app.goo.gl/AbC123xyz` (y `goo.gl/maps/...`) | **NO. Imposible.** | El hash no codifica nada extraíble |
| 8 | `.../maps/place/?q=place_id:ChIJ...`, `?cid=123...`, `!1sftid` | **NO** | Solo identificadores opacos; requeriría Places API (con llave) |

### Regex concreta y funcional

```js
// parse-gmaps.js — cero red. Devuelve {lat,lng,fuente} o null.
export function parseGmaps(raw) {
  let url = String(raw).trim();
  try { url = decodeURIComponent(url); } catch {}          // por si viene percent-encoded

  const VALIDO = (la, ln) =>
    Number.isFinite(la) && Number.isFinite(ln) &&
    Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);

  const N = String.raw`-?\d{1,3}(?:\.\d+)?`;

  // ORDEN = PRIORIDAD. !3d!4d primero: es la coord del lugar, no de la cámara.
  const reglas = [
    // 5) data=...!3d<lat>!4d<lng>   -> el pin real
    {re: new RegExp(`!3d(${N})!4d(${N})`),              orden: 'latlng', fuente: 'data!3d!4d'},
    // 3) ?q= / query= / center= / ll= / destination= / origin= = lat,lng
    {re: new RegExp(`[?&](?:q|query|center|ll|destination|origin|daddr|saddr)=(${N})%2C\\s*(${N})`, 'i'), orden: 'latlng', fuente: 'query'},
    {re: new RegExp(`[?&](?:q|query|center|ll|destination|origin|daddr|saddr)=(${N})\\s*,\\s*(${N})`, 'i'), orden: 'latlng', fuente: 'query'},
    // 4) /maps/search/<lat>,+<lng>
    {re: new RegExp(`/maps/search/(${N})\\s*,\\s*\\+?(${N})`),  orden: 'latlng', fuente: 'search'},
    // 1,2) @lat,lng,zoom  -> centro de cámara (aceptable si no hubo mejor)
    {re: new RegExp(`@(${N}),(${N})(?:,(\\d+(?:\\.\\d+)?)[zmayht])?`), orden: 'latlng', fuente: '@camara'},
    // 6) dir/embed: !1d<lng>!2d<lat>  o  !2d<lng>!3d<lat>  -> INVERTIDO
    {re: new RegExp(`!2d(${N})!3d(${N})`),              orden: 'lnglat', fuente: 'dir!2d!3d'},
    {re: new RegExp(`!1d(${N})!2d(${N})`),              orden: 'lnglat', fuente: 'dir!1d!2d'}
  ];

  for (const {re, orden, fuente} of reglas) {
    const m = url.match(re);
    if (!m) continue;
    let la = parseFloat(m[1]), ln = parseFloat(m[2]);
    if (orden === 'lnglat') [la, ln] = [ln, la];
    // red de seguridad: si el par no valida, prueba invertido antes de descartar
    if (VALIDO(la, ln)) return {lat: la, lng: ln, fuente};
    if (VALIDO(ln, la)) return {lat: ln, lng: la, fuente: fuente + '(invertido)'};
  }
  return null;
}

export const esAcortado = u => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(String(u).trim());
```

### Los acortados: por qué NO y qué hacer

`fetch('https://maps.app.goo.gl/xxx')` desde el navegador **no funciona, de ninguna forma**:

- Con `mode:'cors'` (default): la respuesta 30x de `maps.app.goo.gl` no lleva `Access-Control-Allow-Origin`, así que **la petición falla antes de que exista una respuesta legible** ([MDN: CORSMissingAllowOrigin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSMissingAllowOrigin)). El destino final (`google.com/maps/...`) tampoco manda ACAO, así que `redirect:'follow'` tampoco te salva.
- Con `mode:'no-cors'`: obtienes una **respuesta opaca**. Por spec, *"an opaque filtered response has an empty header list"* y *"its headers and body are not available to JavaScript"* ([Fetch Standard](https://fetch.spec.whatwg.org/), [MDN Request.mode](https://developer.mozilla.org/en-US/docs/Web/API/Request/mode)). No puedes leer `Location`, y `response.url` viene vacío.
- `redirect:'manual'` te da una respuesta opaque-redirect igualmente ilegible.

**No hay truco de navegador. Punto.** Tres salidas reales, en orden de costo:

**A) Cero infraestructura — que el usuario pegue el link expandido.** Detecta el acortado y pide el paso extra. Es lo más honesto para una app estática y funciona el 100% de las veces.

```js
if (esAcortado(input)) {
  mostrarAviso(`Ese es un link corto y el navegador no puede expandirlo.
    Ábrelo, espera a que cargue el mapa, y copia el link de la barra de direcciones.`);
  // Ayuda: ábrelo tú en una pestaña nueva
  window.open(input, '_blank', 'noopener');
}
```

**B) Proxy mínimo de 1 endpoint** (Apps Script, gratis — ver §7):

```js
// Code.gs — expande acortados. Deploy: Ejecutar como "yo", Acceso "Cualquiera".
function doGet(e) {
  const u = e.parameter.u || '';
  if (!/^https:\/\/(maps\.app\.goo\.gl|goo\.gl)\//.test(u)) {
    return json({error: 'dominio no permitido'});          // ¡no seas open proxy!
  }
  const r = UrlFetchApp.fetch(u, {followRedirects: false, muteHttpExceptions: true});
  const h = r.getHeaders();
  // el casing del header varía: búscalo case-insensitive
  const loc = Object.keys(h).find(k => k.toLowerCase() === 'location');
  return json({url: loc ? h[loc] : null, code: r.getResponseCode()});
}
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
```
```js
// cliente: GET simple, sin headers custom => sin preflight
const {url} = await (await fetch(`${GAS_URL}?u=${encodeURIComponent(corto)}`)).json();
const coords = url ? parseGmaps(url) : null;
```

**C)** Pedir al usuario que use "Compartir → Copiar vínculo" desde el **navegador de escritorio** en vez de la app móvil; el desktop suele dar el URL largo directamente. **[NO VERIFICADO]** como comportamiento garantizado.

---

## 4. ICS a mano

### 4.1 Reglas que tienes que cumplir

Fuente normativa: RFC 5545 (no pude abrir ni `datatracker.ietf.org` ni `icalendar.org`; lo siguiente es RFC 5545 según mi conocimiento del estándar, con los puntos que sí obtuve por búsqueda marcados).

**Campos obligatorios:**
- `VCALENDAR`: **`VERSION:2.0`** y **`PRODID`** (identificador del producto, formato FPI: `-//Organización//Producto Versión//Idioma`). `CALSCALE:GREGORIAN` y `METHOD:PUBLISH` son opcionales pero mejoran la aceptación.
- `VEVENT`: **`UID`** (único global y **estable**: si cambia, el importador crea un evento duplicado en vez de actualizar) y **`DTSTAMP`** (siempre en UTC con `Z`). `DTSTART` es obligatorio en la práctica — formalmente es opcional solo si el `VCALENDAR` lleva `METHOD`, pero **ningún importador real lo agradece: ponlo siempre**.

**Formato de fechas — tres formas, y solo tres:**

| Forma | Sintaxis | Cuándo |
|---|---|---|
| UTC | `DTSTART:20260901T160000Z` | **Recomendada.** Sin ambigüedad, sin `VTIMEZONE`. La sufijo `Z` es obligatoria |
| Con zona | `DTSTART;TZID=America/Mexico_City:20260901T100000` | Requiere `VTIMEZONE` en el mismo archivo. **Sin `Z`** — poner `Z` con `TZID` es inválido |
| Flotante (local) | `DTSTART:20260901T100000` | "10:00 donde estés". Casi nunca lo que quieres |
| Todo el día | `DTSTART;VALUE=DATE:20260901` | `DTEND` es **exclusivo**: para un solo día, `DTEND;VALUE=DATE:20260902` |

Cuando usas `TZID` **debes** incluir el `VTIMEZONE` correspondiente: *"you must either use UTC with a trailing Z or include a matching VTIMEZONE block for any TZID you reference. A common issue occurs when DTSTART was written with a TZID whose matching VTIMEZONE block is missing"* ([text-2-ics.com/blog/ics-file-format-structure-guide](https://www.text-2-ics.com/blog/ics-file-format-structure-guide)).

**`America/Mexico_City` — el detalle que casi todos se comen:** México **abolió el horario de verano el 30 de octubre de 2022** ([Wikipedia](https://en.wikipedia.org/wiki/Daylight_saving_time_in_Mexico), [timeanddate](https://timeanddate.com/news/time/mexico-abolishes-dst-2022.html)). Desde entonces la CDMX y Jalisco están **fijos en UTC−6 todo el año** (excepto Baja California y municipios frontera de Chihuahua/Coahuila/NL/Tamaulipas, que siguen a EE. UU.). Por lo tanto el `VTIMEZONE` correcto para eventos futuros lleva **un solo componente `STANDARD`, sin `DAYLIGHT` y sin `RRULE`**, con la última transición real como `DTSTART`.

**Plegado de líneas (folding):** ninguna línea puede pasar de **75 octetos** (no caracteres — **octetos**, y esto importa en español: `ó`, `é`, `ñ` son 2 bytes en UTF-8). Se parte insertando `CRLF` + **un** espacio o tab; el desplegado quita `CRLF` + ese carácter. **Nunca partas en medio de un carácter multibyte.**

**Escapado en `SUMMARY` / `DESCRIPTION` / `LOCATION` (tipo TEXT):** en este orden exacto — `\` → `\\`, luego `;` → `\;`, `,` → `\,`, y salto de línea → `\n`. Los dos puntos `:` **NO** se escapan. Si escapas la barra al final, te comes tus propios escapes.

**CRLF:** **todas** las líneas terminan en `\r\n`, incluida la última. Un archivo con `\n` solo es inválido y hay parsers estrictos (Apple entre ellos) que lo rechazan o lo interpretan mal.

**`VALARM`:** `ACTION` + `TRIGGER` obligatorios; con `ACTION:DISPLAY` además `DESCRIPTION`. `TRIGGER:-PT30M` = 30 min antes; `TRIGGER:-P1D` = 1 día antes; negativo = antes del `DTSTART`.

### 4.2 Plantilla verbatim

Guárdala **con CRLF**. Sustituye los valores; el resto déjalo tal cual.

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//THIQA//Cotizador AL3D 1.0//ES
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:America/Mexico_City
X-LIC-LOCATION:America/Mexico_City
BEGIN:STANDARD
DTSTART:20221030T020000
TZOFFSETFROM:-0500
TZOFFSETTO:-0600
TZNAME:CST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:cot-000123@cotizador.thiqa.mx
DTSTAMP:20260822T170000Z
DTSTART;TZID=America/Mexico_City:20260901T100000
DTEND;TZID=America/Mexico_City:20260901T113000
SUMMARY:Visita de medición - Casa Tlajomulco
DESCRIPTION:Cotización #123\nCliente: Juan Pérez\nTeléfono: 33-1234-5678\nLl
 evar: flexómetro\, cámara
LOCATION:Av. Vallarta 1234\, Zapopan\, Jalisco
STATUS:CONFIRMED
SEQUENCE:0
TRANSP:OPAQUE
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Recordatorio: Visita de medición en 1 día
TRIGGER:-P1D
END:VALARM
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Recordatorio: Visita de medición en 30 minutos
TRIGGER:-PT30M
END:VALARM
END:VEVENT
END:VCALENDAR
```

Observa la línea `DESCRIPTION`: está **plegada** (corta en `Ll` y sigue con un espacio + `evar:`) para no pasar de 75 octetos, y usa `\n` y `\,` escapados. Eso es exactamente lo que debe verse en el archivo.

> **[NO VERIFICADO]** que Google Calendar y Apple Calendar acepten esto "sin quejarse" — no pude probarlo en esta sesión, y no encontré una fuente primaria de Google que enumere sus requisitos de validación. Lo que sí está respaldado: la exigencia de VTIMEZONE-cuando-hay-TZID, la estructura, y el rol de VALARM/TRIGGER ([iCalendar.org RFC 5545 §4 ejemplos](https://icalendar.org/iCalendar-RFC-5545/4-icalendar-object-examples.html), [sintaxis básica ics](https://gist.github.com/superjojo140/20b1b5362ef5700de82a1a3f6ee299ff)). **Si quieres máxima compatibilidad, usa la variante UTC** (`DTSTART:20260901T160000Z`, sin `VTIMEZONE`): elimina de un golpe la clase entera de bugs de zona horaria.

### 4.3 Generador en JS (plegado por octetos, correcto)

```js
// ics.js
const CRLF = '\r\n';

const esc = s => String(s)
  .replace(/\\/g, '\\\\')          // 1º la barra, si no te comes los escapes siguientes
  .replace(/;/g,  '\\;')
  .replace(/,/g,  '\\,')
  .replace(/\r\n|\r|\n/g, '\\n');  // ':' NO se escapa

// Plegado a 75 OCTETOS sin partir caracteres UTF-8 multibyte
function fold(line) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b = enc.encode(line);
  if (b.length <= 75) return line;
  const partes = [];
  let i = 0, max = 75;                       // 1ª línea: 75; continuaciones: 74 (+1 del espacio)
  while (i < b.length) {
    let fin = Math.min(i + max, b.length);
    while (fin > i + 1 && fin < b.length && (b[fin] & 0xC0) === 0x80) fin--;  // no partas un char
    partes.push(dec.decode(b.slice(i, fin)));
    i = fin; max = 74;
  }
  return partes.join(CRLF + ' ');
}

const utc = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');  // 20260822T170000Z
const local = d => {                                                           // en zona fija -06:00
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
};

const VTZ_MX = [
  'BEGIN:VTIMEZONE','TZID:America/Mexico_City','X-LIC-LOCATION:America/Mexico_City',
  'BEGIN:STANDARD','DTSTART:20221030T020000','TZOFFSETFROM:-0500','TZOFFSETTO:-0600',
  'TZNAME:CST','END:STANDARD','END:VTIMEZONE'
];

export function buildICS({uid, inicio, fin, summary, description = '', location = '',
                          alarmas = ['-P1D','-PT30M'], tz = true}) {
  const L = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//THIQA//Cotizador AL3D 1.0//ES',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH',
    ...(tz ? VTZ_MX : []),
    'BEGIN:VEVENT',
    `UID:${uid}`,                                   // ESTABLE: mismo evento => mismo UID
    `DTSTAMP:${utc(new Date())}`,
    tz ? `DTSTART;TZID=America/Mexico_City:${local(inicio)}` : `DTSTART:${utc(inicio)}`,
    tz ? `DTEND;TZID=America/Mexico_City:${local(fin)}`       : `DTEND:${utc(fin)}`,
    `SUMMARY:${esc(summary)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    ...(location    ? [`LOCATION:${esc(location)}`]       : []),
    'STATUS:CONFIRMED','SEQUENCE:0','TRANSP:OPAQUE',
    ...alarmas.flatMap(t => [
      'BEGIN:VALARM','ACTION:DISPLAY',
      `DESCRIPTION:${esc('Recordatorio: ' + summary)}`,
      `TRIGGER:${t}`,'END:VALARM'
    ]),
    'END:VEVENT','END:VCALENDAR'
  ];
  return L.map(fold).join(CRLF) + CRLF;             // CRLF también al final
}

export function descargarICS(texto, nombre = 'evento.ics') {
  const blob = new Blob([texto], {type: 'text/calendar;charset=utf-8'});
  const a = Object.assign(document.createElement('a'),
    {href: URL.createObjectURL(blob), download: nombre});
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
```
Nota: `local()` usa la hora local del dispositivo. Correcto **solo si el dispositivo está en UTC−6**. Si un usuario abre la app desde otra zona, el evento sale desfasado. Para robustez real: construye el string `YYYYMMDDTHHMMSS` desde los campos del formulario (los que el usuario tecleó como hora de México) **sin pasar por `Date`**.

### 4.4 ¿Se puede *suscribir* un .ics estático servido por HTTP?

**Sí.** En Google Calendar: `+` junto a "Otros calendarios" → **"Desde URL"** → pegar `https://usuario.github.io/app/agenda.ics` → "Añadir calendario" ([guía](https://www.onecal.io/blog/how-to-subscribe-to-a-web-ics-calendar-in-google-calendar)). GitHub Pages sirve HTTPS público, así que califica. Un espacio en blanco al final del URL hace fallar la suscripción — error clásico.

**Con qué frecuencia refresca Google, de verdad:** **12–24 horas, a veces más**, y **no hay forma de forzar un refresh**. Las fuentes coinciden y son tajantes:
- *"Google Calendar refreshes subscribed ICS calendars approximately every 12 to 24 hours"* ([usemooncal](https://usemooncal.com/en/guides/google-calendar-ics-refresh)); otras reportan 8–24 h ([usecarly](https://www.usecarly.com/blog/google-calendar-ics-refresh-rate/)).
- *"There is absolutely no way to manually force a refresh"* y *"the sync frequency for a subscribed calendar URL is completely up to Google, and it's anything but consistent"* ([ryadel](https://www.ryadel.com/en/google-calendar-force-update-refresh-subscribed-calendar-ics/), [gist de gene1wood](https://gist.github.com/gene1wood/02ed0d36f62d791518e452f55344240d)).
- Razón: Google hace el fetch en nombre de todos sus usuarios; el throttling a 12–24 h es necesidad operativa a esa escala ([twocal](https://twocal.app/p/google-calendar-ics-refresh-delay/)).

**Implicación de diseño, importante:** la suscripción ICS **no sirve** para "acabo de agendar una visita y quiero verla en mi calendario". Para eso necesitas **descarga directa del .ics** (importación inmediata, un evento) o la **Calendar API** (§5). La suscripción sirve solo para una agenda de consulta que tolere un día de atraso.

---

## 5. GOOGLE CALENDAR API desde el navegador (sitio estático)

### Lo que hace falta

1. **Proyecto en Google Cloud** + **habilitar Google Calendar API**.
2. **OAuth Client ID de tipo "Web application"**. En **Authorized JavaScript origins** pon `https://<usuario>.github.io` (**el origin, sin path** — GitHub Pages de proyecto vive en `/repo/`, pero el origin sigue siendo la raíz). Para el modelo de token **no se usan** redirect URIs.
3. **¿Secreto de cliente?** **No.** El *token model* de Google Identity Services no lo usa: *"In the token-based authorization model, there is no need to store per-user refresh tokens on your backend server"* ([Use the token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)). Google te genera un client secret al crear un client de tipo Web, pero **no lo pongas en el HTML y no lo necesitas** — es para el flujo de servidor.
4. **Scope mínimo:** `https://www.googleapis.com/auth/calendar.events` (crear/editar eventos). Si solo insertas y nunca lees, **no** pidas `calendar` completo. Catálogo: [OAuth 2.0 Scopes for Google APIs](https://developers.google.com/identity/protocols/oauth2/scopes).
5. **CORS:** las APIs REST de Google lo soportan. *"Google APIs support requests and responses using Cross-origin Resource Sharing (CORS)... the URL follows a pattern of `https://www.googleapis.com` + REST path + URL Params"* ([google-api-javascript-client #530](https://github.com/google/google-api-javascript-client/issues/530)). Puedes usar `fetch()` puro; **no necesitas `gapi`**.

### Pantalla de consentimiento y verificación — respuesta concreta para 3 usuarios

`calendar.events` es **scope sensible** — *"Examples of sensitive scopes include reading events stored in Google Calendar"* ([Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)). Eso normalmente dispara verificación... **pero hay excepción, y con 3 usuarios caes en ella.**

- **Publishing status = "Testing"**: hasta **100 test users** listados en la pantalla de consentimiento ([Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en), [In-app Testing](https://support.google.com/cloud/answer/13807382?hl=en)). Con 3 usuarios te sobra muchísimo margen y **puedes quedarte en Testing indefinidamente**.
- **No necesitas publicar ni verificar.** Google documenta cuándo la verificación no aplica ([When is verification not needed](https://support.google.com/cloud/answer/13464323?hl=en)), y: *"You should only submit 'production' tier projects for verification."*
- **Qué van a ver tus 3 usuarios:** la pantalla **"Google hasn't verified this app"** antes del consentimiento. *"Test users will see the 'unverified app' warning screen but can proceed"* ([Unverified apps](https://support.google.com/cloud/answer/7454865?hl=en)). Tienen que hacer clic en **Advanced → Go to (unsafe)**. Feo, pero funciona y es permanente.
- **Si publicas sin verificar:** *"the unverified app screen will be displayed before the consent screen, and your app will be limited to 100 new users until it is verified"*. O sea: publicar **no te quita el warning**, solo cambia el mecanismo del límite. Con 3 usuarios, **quédate en Testing**.
- **Atajo si tienes Google Workspace:** con la cuenta del dominio, configura la pantalla de consentimiento como **"Internal"** → sin verificación y **sin pantalla de app no verificada**. Con `@gmail.com` solo existe "External". Esto es la diferencia práctica más grande. **[NO VERIFICADO]** en fuente primaria en esta sesión, pero es el comportamiento documentado del tipo Internal.

### ¿Se puede refrescar el token en el navegador?

**No hay refresh token en el navegador, y eso es intencional.** El token de acceso vive ~1 hora. Lo que haces en su lugar: volver a pedirlo con `prompt: ''`, que es **silencioso** si el usuario ya concedió el scope y tiene sesión Google activa.

Ojo con un dato que sale mucho y **no aplica** aquí: *"In testing mode, refresh tokens expire after 7 days"* ([WorkOS](https://workos.com/blog/google-sso-token-api-access)) — eso muerde a los flujos de servidor. En el token model no hay refresh token, así que el problema no existe; el costo es que el usuario debe tener sesión Google viva.

```html
<script src="https://accounts.google.com/gsi/client" async></script>
<script type="module">
const CLIENT_ID = 'XXXX.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

let token = null, expira = 0, tc = null;

function initTokenClient() {
  tc = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID, scope: SCOPE, callback: () => {}   // se reemplaza por llamada
  });
}

function pedirToken({silencioso}) {
  return new Promise((ok, err) => {
    tc.callback = r => r.error ? err(new Error(r.error)) : ok(r);
    tc.requestAccessToken({prompt: silencioso ? '' : 'consent'});
  });
}

async function getToken() {
  if (token && Date.now() < expira - 60_000) return token;
  let r;
  try { r = await pedirToken({silencioso: true}); }          // renovación silenciosa
  catch { r = await pedirToken({silencioso: false}); }       // 1ª vez o consentimiento revocado
  token = r.access_token;
  expira = Date.now() + (r.expires_in ?? 3600) * 1000;       // ~1 h, no hay refresh token
  return token;
}

export async function crearEvento({summary, description, location, inicioISO, finISO}) {
  const t = await getToken();
  const r = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {Authorization: `Bearer ${t}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      summary, description, location,
      start: {dateTime: inicioISO, timeZone: 'America/Mexico_City'},
      end:   {dateTime: finISO,    timeZone: 'America/Mexico_City'},
      reminders: {useDefault: false, overrides: [
        {method: 'popup', minutes: 30}, {method: 'popup', minutes: 1440}
      ]}
    })
  });
  if (!r.ok) throw new Error(`Calendar API ${r.status}: ${await r.text()}`);
  return r.json();
}

// Revocar acceso (buena práctica, y necesario para reprobar el flujo):
// google.accounts.oauth2.revoke(token, () => {});
window.addEventListener('load', initTokenClient);
</script>
```
`initTokenClient` requiere **gesto del usuario** para abrir el popup — llámalo desde un `click`, no en `load`, o el navegador lo bloquea.

---

## 6. NOTION API desde el navegador

**No se puede. Obliga a proxy de servidor.** La API de Notion **no** manda `Access-Control-Allow-Origin`, así que el navegador bloquea toda petición cross-origin.

Evidencia — issues en el SDK oficial de Notion:
- [makenotion/notion-sdk-js #96 "blocked by CORS policy"](https://github.com/makenotion/notion-sdk-js/issues/96)
- [makenotion/notion-sdk-js #408 "has been blocked by CORS"](https://github.com/makenotion/notion-sdk-js/issues/408)
- *"Client-side libraries cannot send data to the Notion API due to CORS restrictions"* / *"Due to CORS restrictions, it's not possible to call the Notion API directly from a client-side PWA application"* ([codex-team/codex-surveys #18](https://github.com/codex-team/codex-surveys/issues/18), [Latenode community](https://community.latenode.com/t/fixing-cors-issues-when-accessing-notion-api-from-client-side-react-application/23699)).

> **[NO VERIFICADO]** en la doc oficial de Notion: no pude abrir `developers.notion.com`. Pero que el propio SDK de Notion tenga dos issues de CORS abiertos por este motivo es evidencia bastante fuerte.

Segundo problema, aparte de CORS: la API exige los headers `Authorization: Bearer secret_...` y `Notion-Version: 2022-06-28`. Aun con CORS abierto, **`Notion-Version` es un header no-simple → dispararía preflight OPTIONS**, y `Authorization` significa **poner tu integration token en el HTML**, que es un token de escritura completa sobre tu workspace. Es decir: **incluso si Notion arreglara CORS, no querrías llamarla desde el navegador.** El proxy no es solo un workaround de CORS, es donde vive el secreto.

### Opciones de proxy mínimo

| Opción | Límites gratis verificados | Notas |
|---|---|---|
| **Cloudflare Workers** | **100,000 requests/día**, **10 ms de CPU por invocación**. El tiempo esperando `fetch()`/red **no cuenta** como CPU ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [limits](https://developers.cloudflare.com/workers/platform/limits)). Worker promedio ≈ 2.2 ms | **La mejor opción.** Un proxy es puro I/O, así que los 10 ms de CPU no te tocan. Sin restricción de uso comercial en el plan free. Secreto en `wrangler secret` |
| **Vercel Hobby** | 1M invocaciones de función/mes, 1M edge requests, **4 CPU-hours/mes**, 100 GB de ancho de banda ([resumen 2026](https://www.fencode.dev/en/blog/vercel-free-vs-pro-2026-official-limits-pricing)) | 🚩 **Hobby es no-comercial.** *"The critical restriction everyone misses: the Hobby plan is non-commercial only. Any project that generates revenue... requires upgrading to Pro"* ([zplatform.ai](https://zplatform.ai/guides/is-vercel-free/)). Para una app de negocio, **descalifica el free tier**. **[NO VERIFICADO]** contra el ToS de Vercel — confírmalo si te importa |
| **Google Apps Script** | **20,000 UrlFetch/día** (cuenta consumidor), 100,000 con Workspace; 6 min por ejecución | Gratis, cero infra, y si ya usas Sheets es el mismo entorno. Pero: latencia peor y el lío de CORS de §7 |

**Recomendación:** Cloudflare Workers. 20 líneas, gratis de verdad, sin cláusula no-comercial.

```js
// worker.js — proxy Notion con allowlist de origen y de path
const ORIGEN = 'https://usuario.github.io';
export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': ORIGEN,
      'Access-Control-Allow-Methods': 'POST, GET, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (req.headers.get('Origin') !== ORIGEN) return new Response('forbidden', {status: 403});

    const path = new URL(req.url).pathname.replace(/^\/notion/, '');
    if (!/^\/v1\/(pages|databases|blocks)\b/.test(path))            // no seas open proxy
      return new Response('path no permitido', {status: 403, headers: cors});

    const r = await fetch('https://api.notion.com' + path, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,              // wrangler secret put NOTION_TOKEN
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: ['GET','HEAD'].includes(req.method) ? undefined : await req.text()
    });
    return new Response(r.body, {status: r.status, headers: {...cors, 'Content-Type': 'application/json'}});
  }
};
```

---

## 7. GOOGLE APPS SCRIPT como backend

### Despliegue

Editor → **Deploy → New deployment → Web app**:
- **Execute as: Me** (corre con *tus* permisos → puede escribir en *tu* Sheet sin que el usuario tenga acceso).
- **Who has access: Anyone** (sin "Anyone with Google account", o cada petición pide login).

Te da `https://script.google.com/macros/s/AKfy.../exec`. **Cada "New deployment" cambia el ID** — para conservar el URL usa **Manage deployments → editar (lápiz) → Version: New version**. Es el error #1 de operación.

### CORS: el detalle que decide tu diseño

Apps Script **no te deja poner headers de respuesta**. `ContentService.createTextOutput()` no expone ningún método para setear headers ([Class ContentService / TextOutput](https://developers.google.com/apps-script/reference/content)), y por eso no puedes añadir `Access-Control-Allow-Origin` tú mismo. Encima, hay un problema estructural: *"For security, content returned by the Content service is redirected to a one-time URL at `script.googleusercontent.com`, and if you use the Content service to return data to another application, ensure the HTTP client is configured to follow redirects"* ([Content Service, docs oficiales](https://developers.google.com/apps-script/guides/content)).

Ese redirect es lo que mata el preflight: **un preflight OPTIONS no sigue redirects**, por spec. Así que:

- **Petición simple (sin preflight) → funciona.** `GET` sin headers custom, o `POST` con `Content-Type` en `text/plain`, `application/x-www-form-urlencoded` o `multipart/form-data`.
- **Petición con preflight → falla.** `POST` con `Content-Type: application/json`, o cualquier header custom (`Authorization`, `X-Algo`), dispara OPTIONS → el redirect + la ausencia de ACAO en la respuesta OPTIONS lo tumban.

**El truco de `text/plain` es la solución correcta, y es la única que recomiendo:** *"Using text/plain makes it a simple request, which skips preflight"* — porque *"POST requests with a Content-Type other than text/plain, application/x-www-form-urlencoded, or multipart/form-data are preflighted"* ([iith.dev/blog/app-script-cors](https://iith.dev/blog/app-script-cors/), [Medium](https://diyavijay.medium.com/struggling-with-cors-in-google-apps-script-heres-the-fix-e3eec09f07dd)). Mandas JSON **en el body** pero declaras `text/plain`, y en el servidor haces `JSON.parse(e.postData.contents)`. Funciona porque el JSON es solo texto.

**Sobre `doOptions()`:** varios blogs lo recomiendan como alternativa. **Sé escéptico.** La doc oficial de Web Apps documenta **solo `doGet(e)` y `doPost(e)`**; `doOptions` no aparece en la referencia, y aun implementándolo sigues sin poder añadir headers a la respuesta. Y las propias fuentes se contradicen: una dice que se usa `setHeaders()` en el TextOutput, y otra dice que *"ContentService.createTextOutput() does not have a method called addCORSHeaders"*. **[NO VERIFICADO / probablemente falso]** que `TextOutput` tenga `setHeaders()` — no existe en la referencia que pude consultar. **No construyas sobre `doOptions`. Usa `text/plain`.**

**[NO VERIFICADO]** el detalle de que el despliegue "Anyone" devuelva `Access-Control-Allow-Origin: *` en la respuesta final de `googleusercontent.com`; es lo que se observa en la práctica y lo que hace que el patrón `text/plain` funcione, pero no encontré una fuente de Google que lo afirme.

```js
// Code.gs
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);                                   // 30 s, lanza excepción si no
    const d = JSON.parse(e.postData.contents);              // llegó como text/plain
    const sh = SpreadsheetApp.openById('SHEET_ID').getSheetByName('cotizaciones');
    sh.appendRow([new Date(), d.folio, d.cliente, d.total]);
    SpreadsheetApp.flush();                                 // fuerza el write ANTES de soltar
    return out({ok: true, fila: sh.getLastRow()});
  } catch (err) {
    return out({ok: false, error: String(err)});
  } finally {
    lock.releaseLock();                                     // SIEMPRE, en finally
  }
}
function doGet(e) { /* lecturas */ return out({ok: true, data: []}); }
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);             // no puedes setear headers, solo mime
}
```
```js
// cliente — la clave: text/plain, NO application/json
const r = await fetch(GAS_URL, {
  method: 'POST',
  headers: {'Content-Type': 'text/plain;charset=utf-8'},   // => petición simple => sin preflight
  body: JSON.stringify({folio: 'RMV-123', cliente: 'Juan', total: 45000}),
  redirect: 'follow'                                        // default; necesario por googleusercontent
});
const j = await r.json();
```

### LockService para escrituras concurrentes

[Class LockService](https://developers.google.com/apps-script/reference/lock/lock-service): *"prevents concurrent access to sections of code... useful when you have multiple users or processes modifying a shared resource and want to prevent collisions"*.

- `getScriptLock()` — *"gets a lock that prevents **any user** from concurrently running a section of code"*. **Este es el que quieres** para un Sheet compartido.
- `getUserLock()` — solo bloquea al mismo usuario. No te protege de dos vendedores escribiendo a la vez.
- `getDocumentLock()` — por documento contenedor.
- **Ojo:** *"The lock is not actually acquired until `Lock.tryLock(timeoutInMillis)` or `Lock.waitLock(timeoutInMillis)` is called."* Obtener el objeto no bloquea nada.
- `waitLock(ms)` lanza excepción al expirar; `tryLock(ms)` devuelve `false`. Usa `try/finally` para garantizar `releaseLock()`.
- Llama `SpreadsheetApp.flush()` **dentro** del lock: si no, el write puede quedar en buffer y ejecutarse después de soltarlo, y pierdes toda la protección.

### Cuotas: cuenta personal vs Workspace

| Cuota | Consumidor (`@gmail.com`) | Workspace |
|---|---|---|
| Tiempo por ejecución | **6 minutos** | **6 minutos** (no sube) |
| Runtime de triggers/día | **90 minutos** | **6 horas** |
| Llamadas UrlFetch/día | **20,000** | **100,000** |
| Destinatarios de email/día | 100 | 1,500 |

Fuente: resúmenes de la página oficial de cuotas ([ModelMonkey](https://modelmonkey.io/blog/apps-script-quotas-official), [AppScriptExpert](https://appscriptexpert.com/blog/google-apps-script-quotas-and-limits), [Medium](https://medium.com/@stackarchitect123/google-apps-script-quotas-2026-official-limits-6-minute-rule-consumer-vs-workspace-d18245035715)). **[NO VERIFICADO]** contra `developers.google.com/apps-script/guides/services/quotas` — bloqueado. Los tres coinciden entre sí, que es lo mejor que pude conseguir. El dato clave y confirmado por todos: **Workspace NO sube el techo de 6 minutos por ejecución.**

Nota importante para el diseño: **las peticiones del navegador a tu web app NO gastan cuota de UrlFetch.** UrlFetch cuenta las salidas *desde* Apps Script *hacia* internet. Un endpoint que solo escribe en Sheets gasta 0 UrlFetch. Si tu Apps Script es proxy de Notion (§6), ahí sí cada petición cuesta 1 UrlFetch → 20,000/día es tu techo.

### Latencia

**[NO VERIFICADO — no encontré fuente publicada.]** Empíricamente, un web app de Apps Script suele responder en **~0.5–3 s**, con cold starts peores, más el salto extra del redirect a `googleusercontent.com`. Trátalo como **cientos de milisegundos a segundos**, nunca como un API de baja latencia. Si tu UI necesita respuesta bajo 200 ms, Apps Script no es tu backend: escribe optimista en la UI y sincroniza en background.

---

## 8. SUPABASE como backend

### ¿La anon key se puede publicar en el HTML?

**Sí, y está diseñada para eso — pero la seguridad no viene de la key, viene de RLS.**

- *"the Supabase anon key is meant to be public and is safe to ship in your frontend, but only because Row Level Security is supposed to gate it. Safety comes from RLS, not from hiding the key"* ([GuardLayer](https://www.guardlayer.io/blog/is-supabase-anon-key-safe)).
- *"the publishable key, and the legacy anon key it replaces, is safe to expose with RLS enabled, because row access permission is checked against your access policies and the user's JSON Web Token"* ([safeforprod](https://safeforprod.com/guides/supabase-anon-key-vs-service-role-key)).
- **El mecanismo:** la anon key identifica tu proyecto y **porta el rol `anon`** (o `authenticated` si hay sesión). Postgres evalúa ese rol contra tus policies. **No concede acceso por sí misma.**
- 🚩 **El riesgo real:** *"The moment one table has RLS off, the anon key reads that whole table."* Y: *"83% of Supabase database exposures involve RLS misconfiguration"* ([Escape.tech vía vibeappscanner](https://vibeappscanner.com/is-supabase-safe)). **Una sola tabla sin RLS = fuga total.**
- **`service_role` NUNCA en el navegador**: *"bypasses ALL RLS and should ONLY be used in server-side code"* ([launchreadycode](https://launchreadycode.com/blog/supabase-anon-key-vs-service-role-key)). Si la publicas, regeneras claves y auditas — no hay mitigación parcial.

### RLS con 3 roles

Fuente del mecanismo: [Row Level Security, Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security).

```sql
-- 1) Tabla de perfiles con el rol de negocio
create table public.perfiles (
  id  uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('admin','vendedor','instalador'))
);
alter table public.perfiles enable row level security;

-- Cada quien ve SOLO su perfil. Política simple, sin llamar a mi_rol() -> sin recursión.
create policy perfil_propio on public.perfiles
  for select to authenticated using (id = auth.uid());

-- 2) Helper: SECURITY DEFINER para que la lectura de perfiles NO reevalúe RLS
--    (si no, cualquier policy que consulte perfiles entra en recursión infinita)
create or replace function public.mi_rol() returns text
  language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid()
$$;

-- 3) Tabla de negocio
alter table public.cotizaciones enable row level security;

create policy admin_todo on public.cotizaciones
  for all to authenticated
  using       (public.mi_rol() = 'admin')
  with check  (public.mi_rol() = 'admin');           -- USING filtra lectura, WITH CHECK valida escritura

create policy vendedor_lee_las_suyas on public.cotizaciones
  for select to authenticated
  using (public.mi_rol() = 'vendedor' and vendedor_id = auth.uid());

create policy vendedor_inserta_a_su_nombre on public.cotizaciones
  for insert to authenticated
  with check (public.mi_rol() = 'vendedor' and vendedor_id = auth.uid());

create policy instalador_lee_asignadas on public.cotizaciones
  for select to authenticated
  using (public.mi_rol() = 'instalador' and instalador_id = auth.uid());
-- instalador NO tiene policy de insert/update/delete => no puede escribir. RLS es deny-by-default.

-- anon (sin login) no tiene NINGUNA policy aquí => cero acceso. Correcto.
```

Puntos que muerden:
- **Múltiples policies del mismo comando se combinan con OR** (son permisivas). Para restringir, se quitan policies, no se añaden.
- `USING` gobierna qué filas ves (SELECT/UPDATE/DELETE); `WITH CHECK` gobierna qué filas puedes escribir (INSERT/UPDATE). Un INSERT sin `WITH CHECK` correcto deja meter datos ajenos.
- Cada evaluación de `mi_rol()` es un query. Para tablas grandes, mejor meter el rol en el JWT con un **custom access token hook** y leerlo con `auth.jwt()->>'rol'` — cero I/O por fila. **[NO VERIFICADO]** la sintaxis exacta del hook en la versión actual.
- **Indexa las columnas que usan las policies** (`vendedor_id`, `instalador_id`) o los seq-scans te matan el rendimiento.

### Límites reales del plan free — y la pausa

| Límite | Valor |
|---|---|
| Base de datos | **500 MB** |
| Storage de archivos | **1 GB** |
| MAU (usuarios activos/mes) | **50,000** |
| Peticiones API | ilimitadas |
| Proyectos activos | **2** |
| **Pausa por inactividad** | **1 semana** |
| Retención de backups | **cero días** |

Fuentes: [Supabase Pricing](https://supabase.com/pricing), [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

🚩 **La pausa es el problema, y sí importa:**
- *"Free projects are paused after 1 week of inactivity, with a limit of 2 active projects."* Un proyecto free se considera inactivo *"if it does not receive sufficient user database activity over the past week"*.
- Una vez pausado: **hay 1 año** para restaurarlo desde Supabase Studio.
- **Peor todavía:** *"the free tier has zero days of backup retention. The backup system that Pro and Team plans use doesn't run on Free"* ([SimpleBackups](https://simplebackups.com/blog/supabase-free-tier-paused)). Es decir, **en free no tienes backups.** El respaldo de tu negocio es tu problema.

**Mitigación estándar** (existe una comunidad entera alrededor de esto: [supabase-pause-prevention](https://github.com/travisvn/supabase-pause-prevention)): un cron externo que haga un query trivial. Con GitHub Actions, gratis, en el mismo repo de tu Pages:

```yaml
# .github/workflows/keep-alive.yml
name: keep-supabase-awake
on:
  schedule: [{cron: '0 9 * * 1,4'}]   # lunes y jueves 09:00 UTC
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sSf -X GET \
            "${{ secrets.SUPABASE_URL }}/rest/v1/keepalive?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}"
```
Y **además** un `pg_dump` semanal a un artifact/bucket. Sin backups en free, esto no es opcional.

> **[NO VERIFICADO]:** el límite de egress (los ~5 GB/mes que se citan comúnmente) — no lo encontré en los extractos. Confírmalo en [supabase.com/pricing](https://supabase.com/pricing).

### Auth sin backend propio

Supabase Auth soporta *"password, magic link, one-time password (OTP), social login, and single sign-on (SSO)"* ([Auth docs](https://supabase.com/docs/guides/auth)). Todo desde el navegador: el servidor de auth es de Supabase, tú no montas nada.

```html
<script type="module">
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const sb = createClient(
  'https://xxxx.supabase.co',
  'eyJhbGciOi...ANON_KEY',            // pública a propósito. La seguridad la da RLS.
  {auth: {
    persistSession: true,             // sesión en localStorage
    autoRefreshToken: true,           // renueva el JWT solo, con el refresh token
    detectSessionInUrl: true,         // captura el código al volver del redirect
    flowType: 'pkce'                  // PKCE: obligatorio para clientes públicos, sin secreto
  }}
);

// A) Magic link / OTP por correo — cero contraseñas, cero backend
await sb.auth.signInWithOtp({
  email: 'vendedor@thiqa.mx',
  options: {emailRedirectTo: 'https://usuario.github.io/cotizador-al3d/'}
});
// ^ ese URL DEBE estar en Authentication > URL Configuration > Redirect URLs, o falla.
// Si la plantilla de correo usa {{ .ConfirmationURL }} => magic link;
// si usa {{ .Token }} => OTP de 6 dígitos.  (docs de signInWithOtp)

// B) OAuth social (PKCE)
await sb.auth.signInWithOAuth({
  provider: 'google',
  options: {redirectTo: 'https://usuario.github.io/cotizador-al3d/'}   // SIEMPRE explícito
});
// callback del provider apunta a https://<ref>.supabase.co/auth/v1/callback

// C) Estado de sesión
sb.auth.onAuthStateChange((evento, sesion) => render(sesion?.user ?? null));
</script>
```
Advertencia repetida por la doc y los tutoriales: *"Always set `redirectTo` explicitly in OAuth configuration — don't rely on defaults, or you'll spend hours debugging redirect mismatches"* ([signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth), [signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [eastondev](https://eastondev.com/blog/en/posts/dev/20260408-supabase-auth-guide/)). Con GitHub Pages de proyecto (path `/repo/`) esto falla si pones la raíz del dominio.

**Detalle de GitHub Pages:** no controlas headers de respuesta, así que no hay COOP/COEP ni CSP por header (solo `<meta>`), y el ruteo SPA necesita un `404.html` que replique el `index.html`.

---

## Resumen ejecutivo de decisiones

| Necesidad | Elección | Por qué |
|---|---|---|
| Tiles | **CARTO (5M/mes) primaria, OSM fallback**, URL configurable | Único free tier verificado sin cláusula "no comercial"; OSM no tiene SLA y avisa que puede cortar a servicios comerciales |
| Geocoding | **Nominatim** con cola 1 req/s + caché obligatoria; **LocationIQ (5k/día)** como upgrade | Autocomplete client-side está **prohibido** en Nominatim — el diseño del input debe ser submit explícito |
| Link de Google Maps | Regex local con `!3d!4d` prioritario; **acortados: pedir URL expandido al usuario** | CORS hace imposible seguir el redirect desde el navegador. Sin excepciones |
| Calendario, camino corto | **Descarga de `.ics`** (UTC, sin VTIMEZONE) | Cero auth, cero cuota, funciona en Google/Apple/Outlook. La *suscripción* refresca cada 12–24 h → inútil para tiempo real |
| Calendario, camino bueno | **GIS token model + Calendar API**, publishing status **Testing**, scope `calendar.events` | Con 3 usuarios: sin verificación, sin publicar, sin secreto. Costo: pantalla "app no verificada" (evitable solo con Workspace + consent Internal) |
| Notion | **Imposible sin proxy** → Cloudflare Workers | El token de escritura no puede vivir en el HTML, aparte de CORS |
| Backend de datos | **Supabase** (anon key pública + RLS deny-by-default) o **Apps Script** si ya vives en Sheets | Supabase: vigila la **pausa a la semana** y que **no hay backups en free** → keep-alive + dump propio, no opcional |

---

### Fuentes

**Mapas y tiles**
- [Tile Usage Policy — OSMF OWG](https://operations.osmfoundation.org/policies/tiles/)
- [Vector Tile Usage Policy — OSMF](https://operations.osmfoundation.org/policies/vector/)
- [Usage policy for tiles in "small" commercial context? — OSM Forum](https://community.openstreetmap.org/t/usage-policy-for-tiles-in-small-commercial-context/1137)
- [Technical updates to tile.openstreetmap.org — OSM Community](https://community.openstreetmap.org/t/technical-updates-to-the-tile-openstreetmap-org-service-openstreetmap-org-standard-layer/133421)
- [Blocked tiles — OSM Wiki](https://wiki.openstreetmap.org/wiki/Blocked_tiles)
- [CARTO Basemaps](https://carto.com/basemaps/) · [CARTO Basemaps FAQ](https://docs.carto.com/faqs/carto-basemaps)
- [MapTiler Cloud pricing](https://www.maptiler.com/cloud/pricing/) · [MapTiler Cloud terms](https://www.maptiler.com/terms/cloud/) · [Sessions vs requests](https://docs.maptiler.com/guides/maps-apis/maps-platform/tile-requests-and-map-sessions-compared/)
- [Stadia Maps Service Limits](https://docs.stadiamaps.com/limits/) · [Stadia Maps pricing](https://stadiamaps.com/pricing/) · [Stadia FAQs](https://stadiamaps.com/faqs/)

**Leaflet**
- [Leaflet Download](https://leafletjs.com/download.html) · [Leaflet CHANGELOG](https://github.com/Leaflet/Leaflet/blob/main/CHANGELOG.md) · [Leaflet Releases](https://github.com/leaflet/leaflet/releases)

**Geocoding**
- [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Clarification on Nominatim Usage Policy — OSM Forum](https://community.openstreetmap.org/t/clarification-on-nominatim-usage-policy/102661) · [Understanding and complying](https://community.openstreetmap.org/t/understanding-and-complying-with-nominatim-usage-policy/129212)
- [Nominatim 403 for default User-Agent — geopy #262](https://github.com/geopy/geopy/issues/262) · [nominatim-browser](https://github.com/nozzlegear/nominatim-browser)
- [Photon usage docs](https://github.com/komoot/photon/blob/master/docs/usage.md) · [Photon límite diario — discussion #607](https://github.com/komoot/photon/discussions/607) · [Photon CORS ausente — Drupal](https://www.drupal.org/project/geocoder/issues/3205868)
- [LocationIQ pricing](https://locationiq.com/pricing) · [LocationIQ planes](https://help.locationiq.com/support/solutions/articles/36000061110-what-s-pricing-like-) · [Geocoding APIs comparados](https://www.bitoff.org/geocoding-apis-comparison/)

**URLs de Google Maps y CORS**
- [Decoding Google Maps embedded parameters](https://www.codestudy.net/blog/decoding-the-google-maps-embedded-parameters/) · [Encoding del atributo data](https://www.codestudy.net/blog/what-is-the-encoding-of-the-data-attribute-in-the-new-google-maps/)
- [Snippet: Grab lat/lon from Google Maps URL](https://dev.to/mattkenefick/snippet-grab-lat-lon-from-google-maps-url-55eg) · [Google Maps URL formats](https://gotoapplemaps.com/guides/google-maps-url-formats-explained/)
- [Fetch Standard (opaque responses)](https://fetch.spec.whatwg.org/) · [MDN Request.mode](https://developer.mozilla.org/en-US/docs/Web/API/Request/mode) · [MDN CORS errors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors) · [MDN CORSMissingAllowOrigin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSMissingAllowOrigin)

**ICS / iCalendar**
- [iCalendar.org RFC 5545 §4 ejemplos](https://icalendar.org/iCalendar-RFC-5545/4-icalendar-object-examples.html) · [RFC 5545 §3.1 content lines](https://icalendar.org/iCalendar-RFC-5545/3-1-content-lines.html)
- [ICS file format: structure, syntax & examples](https://www.text-2-ics.com/blog/ics-file-format-structure-guide) · [Sintaxis básica ics](https://gist.github.com/superjojo140/20b1b5362ef5700de82a1a3f6ee299ff)
- [ICS to Google Calendar guide](https://add-to-calendar-pro.com/articles/ics-to-google-calendar) · [Subscribe to a web ICS calendar](https://www.onecal.io/blog/how-to-subscribe-to-a-web-ics-calendar-in-google-calendar)
- [Frecuencia de refresh — MoonCal](https://usemooncal.com/en/guides/google-calendar-ics-refresh) · [usecarly](https://www.usecarly.com/blog/google-calendar-ics-refresh-rate/) · [twocal](https://twocal.app/p/google-calendar-ics-refresh-delay/) · [Forzar refresh (no se puede) — Ryadel](https://www.ryadel.com/en/google-calendar-force-update-refresh-subscribed-calendar-ics/) · [gist gene1wood](https://gist.github.com/gene1wood/02ed0d36f62d791518e452f55344240d)
- [DST en México — Wikipedia](https://en.wikipedia.org/wiki/Daylight_saving_time_in_Mexico) · [México abolió DST — timeanddate](https://timeanddate.com/news/time/mexico-abolishes-dst-2022.html)

**Google OAuth / Calendar API**
- [Use the token model — GIS](https://developers.google.com/identity/oauth2/web/guides/use-token-model) · [Migrate to GIS](https://developers.google.com/identity/oauth2/web/guides/migration-to-gis) · [Calendar API quickstart JS](https://developers.google.com/workspace/calendar/api/quickstart/js)
- [OAuth 2.0 Scopes for Google APIs](https://developers.google.com/identity/protocols/oauth2/scopes) · [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) · [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Manage App Audience (100 test users)](https://support.google.com/cloud/answer/15549945?hl=en) · [In-app Testing](https://support.google.com/cloud/answer/13807382?hl=en) · [Unverified apps](https://support.google.com/cloud/answer/7454865?hl=en) · [When is verification not needed](https://support.google.com/cloud/answer/13464323?hl=en) · [Google OAuth 100 user limit](https://www.unipile.com/google-oauth-100-user-limit/)
- [CORS en Google APIs — google-api-javascript-client #530](https://github.com/google/google-api-javascript-client/issues/530) · [Refresh tokens en Testing — WorkOS](https://workos.com/blog/google-sso-token-api-access)

**Notion**
- [notion-sdk-js #96 — blocked by CORS](https://github.com/makenotion/notion-sdk-js/issues/96) · [notion-sdk-js #408](https://github.com/makenotion/notion-sdk-js/issues/408) · [Proxy para Notion API — codex-surveys #18](https://github.com/codex-team/codex-surveys/issues/18) · [Fixing CORS con Notion API](https://community.latenode.com/t/fixing-cors-issues-when-accessing-notion-api-from-client-side-react-application/23699)

**Apps Script**
- [Content Service (redirect a googleusercontent)](https://developers.google.com/apps-script/guides/content) · [Class LockService](https://developers.google.com/apps-script/reference/lock/lock-service) · [Lock Service](https://developers.google.com/apps-script/reference/lock)
- [Fixing CORS Errors in Google Apps Script](https://iith.dev/blog/app-script-cors/) · [Struggling with CORS in GAS](https://diyavijay.medium.com/struggling-with-cors-in-google-apps-script-heres-the-fix-e3eec09f07dd) · [Taking advantage of Web Apps with GAS](https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script/blob/master/README.md) · [curl y GAS Web Apps](https://dev.to/googleworkspace/youre-probably-using-curl-wrong-with-your-google-apps-script-web-app-1ed8)
- [Cuotas GAS — ModelMonkey](https://modelmonkey.io/blog/apps-script-quotas-official) · [AppScriptExpert](https://appscriptexpert.com/blog/google-apps-script-quotas-and-limits) · [Consumer vs Workspace](https://medium.com/@stackarchitect123/google-apps-script-quotas-2026-official-limits-6-minute-rule-consumer-vs-workspace-d18245035715)

**Proxies**
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits)
- [Vercel free vs pro 2026](https://www.fencode.dev/en/blog/vercel-free-vs-pro-2026-official-limits-pricing) · [Is Vercel free? (Hobby no comercial)](https://zplatform.ai/guides/is-vercel-free/)

**Supabase**
- [Supabase Pricing](https://supabase.com/pricing) · [Free Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing) · [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Auth](https://supabase.com/docs/guides/auth) · [signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp) · [signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth)
- [Is the anon key safe? — GuardLayer](https://www.guardlayer.io/blog/is-supabase-anon-key-safe) · [anon vs service_role — safeforprod](https://safeforprod.com/guides/supabase-anon-key-vs-service-role-key) · [launchreadycode](https://launchreadycode.com/blog/supabase-anon-key-vs-service-role-key) · [Is Supabase safe? (RLS misconfig 83%)](https://vibeappscanner.com/is-supabase-safe)
- [Free tier paused & lost data — SimpleBackups](https://simplebackups.com/blog/supabase-free-tier-paused) · [supabase-pause-prevention](https://github.com/travisvn/supabase-pause-prevention) · [Free tier limits 2026](https://www.itpathsolutions.com/supabase-free-tier-limits)