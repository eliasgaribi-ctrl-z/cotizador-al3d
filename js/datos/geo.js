/* ============================================================================
   Geografía: coordenadas, tiles y ruta. Fase 1 completa sin una sola petición.

   Lo que de verdad usa este negocio hoy es `parseGmaps`: el instalador manda un link
   de Google Maps por WhatsApp y de ahí sale el pin. Eso es puro regex local, cero red,
   cero llaves, cero cuentas. Todo lo demás de este archivo es apoyo.

   NO SE CACHEAN LOS TILES EN EL SERVICE WORKER. La política de OSM prohíbe archivar
   tiles y prohíbe precargar lo que el usuario no está viendo —más de 250 tiles en zoom
   13 o mayor es explícitamente inaceptable—. La regla `url.origin !== self.location.origin`
   de sw.js ya lo garantiza por construcción y no se toca. La consecuencia se dice con
   palabras en la pantalla del mapa: el mapa necesita señal, los datos no.

   La atribución de OSM no es adorno: es requisito de licencia y se queda visible.

   Y el formato del parámetro `data=` de Google Maps no está documentado por Google:
   todo lo de `parseGmaps` es ingeniería inversa que puede romperse sin aviso. Por eso
   aquí se valida el rango de cada par en vez de confiar en el índice del `!Nd`.
   ============================================================================ */

import * as DB from './db.js';

/** Guadalajara. El centro del mapa cuando todavía no hay ni un proyecto ubicado. */
export const centroGDL = { lat: 20.6736, lng: -103.344 };

/* Caja aproximada de México continental + península. No es la frontera: es un detector
   de disparates. Un pin en el Atlántico o en Kansas casi siempre es un lat/lng volteado
   que sí pasó la validación de rango, y un pin en el océano es peor que ningún pin,
   porque parece un dato. */
const MX = { latMin: 14, latMax: 33, lngMin: -118, lngMax: -86 };

const enMexico = (la, ln) =>
  la >= MX.latMin && la <= MX.latMax && ln >= MX.lngMin && ln <= MX.lngMax;

/* Rango físico. El (0,0) se rechaza aparte: es la Isla Nula, el resultado típico de
   parsear dos ceros de relleno de un `data=` que no traía coordenada. */
const enRango = (la, ln) =>
  Number.isFinite(la) && Number.isFinite(ln) &&
  Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);

/** El texto exacto que la pantalla dice cuando llega un link corto. Vive aquí y no en la
 *  interfaz porque tres pantallas distintas van a decir lo mismo y tienen que decirlo igual. */
export const AVISO_CORTO =
  'Ese es un link corto y el navegador no puede abrirlo. Ábrelo, espera el mapa y ' +
  'copia el link de la barra de direcciones.';

/** true para maps.app.goo.gl y goo.gl/maps.
 *  Desde el navegador es IMPOSIBLE expandirlos y no hay truco que lo cambie: la 30x no
 *  manda Access-Control-Allow-Origin, en `no-cors` la respuesta es opaca y por
 *  especificación su lista de headers está vacía (no hay `Location` que leer, y
 *  `response.url` viene en blanco), y `redirect:'manual'` da una opaque-redirect igual
 *  de ilegible. El puente tuvo un endpoint /expandir que lo hacía del lado servidor; se
 *  borró porque no lo llamaba nadie y su `redirect:'follow'` dejaba que un tercero eligiera
 *  los saltos. Se resuelve como siempre: se le pide a la persona que abra el link y copie
 *  la dirección de la barra (js/mod/mapa.js). */
export function esAcortado(u) {
  return /^(?:https?:\/\/)?(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i.test(String(u || '').trim());
}

const N = String.raw`-?\d{1,3}(?:\.\d+)?`;

/* EL ORDEN ES LA PRIORIDAD, y la razón de cada renglón:
   - !3d!4d es la coordenada del LUGAR. Es la única exacta de verdad, va primero.
   - los parámetros explícitos (q, ll, destination…) los escribió alguien a propósito.
   - /maps/search/ y /maps/place/ con la coordenada en la ruta, igual de explícitos.
   - la arroba es el CENTRO DE LA CÁMARA, no el pin: sirve, pero no es exacta.
   - !1d!2d y !2d!3d aparecen en dir/ y embed, y ahí el orden se VOLTEA: el primer
     número es longitud. Van al final porque son los más frágiles de los seis. */
const REGLAS = [
  { re: new RegExp(`!3d(${N})!4d(${N})`),                                   orden: 'latlng', fuente: 'maps_pin',    exacta: true  },
  { re: new RegExp(`[?&](?:q|query|center|ll|destination|origin|daddr|saddr)=(${N})\\s*,\\s*\\+?(${N})`, 'i'), orden: 'latlng', fuente: 'maps_query',  exacta: true  },
  { re: new RegExp(`/maps/search/(${N})\\s*,\\s*\\+?(${N})`),               orden: 'latlng', fuente: 'maps_search', exacta: true  },
  { re: new RegExp(`/maps/place/(${N})\\s*,\\s*\\+?(${N})`),                orden: 'latlng', fuente: 'maps_place',  exacta: true  },
  { re: new RegExp(`@(${N}),(${N})(?:,(?:\\d+(?:\\.\\d+)?)[zmayht])?`),     orden: 'latlng', fuente: 'maps_camara', exacta: false },
  { re: new RegExp(`!2d(${N})!3d(${N})`),                                   orden: 'lnglat', fuente: 'maps_dir',    exacta: false },
  { re: new RegExp(`!1d(${N})!2d(${N})`),                                   orden: 'lnglat', fuente: 'maps_dir',    exacta: false },
];

/**
 * Saca la coordenada de un link de Google Maps. Local, sin red, sin llave.
 * @returns {{lat:number,lng:number,fuente:string,exacta:boolean,sospechoso?:boolean,
 *            invertida?:boolean}|{corto:true,mensaje:string}|null}
 */
export function parseGmaps(url) {
  const crudo = String(url == null ? '' : url).trim();
  if (!crudo) return null;

  if (esAcortado(crudo)) return { corto: true, mensaje: AVISO_CORTO };

  /* Se prueba decodificado y crudo, en ese orden. Decodificado porque el link que llega
     por WhatsApp trae la coma como %2C y la regla de `q=` no la vería; crudo porque un
     decode puede lanzar con un `%` suelto —los nombres de lugar con acentos mal pegados
     lo producen— y en ese caso el link todavía sirve tal cual. */
  const textos = [];
  try { textos.push(decodeURIComponent(crudo)); } catch (_) {}
  textos.push(crudo);

  for (const { re, orden, fuente, exacta } of REGLAS) {
    for (const texto of textos) {
      const m = texto.match(re);
      if (!m) continue;

      let la = parseFloat(m[1]), ln = parseFloat(m[2]);
      if (orden === 'lnglat') { const t = la; la = ln; ln = t; }

      /* Red de seguridad: si el par no valida, se prueba volteado antes de descartarlo.
         Un `!2d!3d` con los roles al revés de lo esperado se salva aquí. */
      let invertida = false;
      if (!enRango(la, ln)) {
        if (!enRango(ln, la)) continue;
        const t = la; la = ln; ln = t;
        invertida = true;
      }

      const r = { lat: la, lng: ln, fuente, exacta };
      if (invertida) r.invertida = true;
      /* No se corrige solo. Un pin movido a la fuerza al otro lado del mundo se ve igual
         de convincente que uno bueno; el que sabe si la casa está en Zapopan es quien
         pegó el link, así que se le dice y él decide. */
      if (!enMexico(la, ln)) r.sospechoso = true;
      return r;
    }
  }
  return null;
}

/* ---------------------------------------------------------------------------
   TILES — tres proveedores, la misma interfaz. Cambiar de proveedor es cambiar
   `al3d_pf_tiles`, no reescribir este módulo.
   --------------------------------------------------------------------------- */
export const TILES = {
  osm: {
    nombre: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    sub: 'abc',
    /* Requisito de licencia. Se pinta y no se esconde: sin esto el uso es indebido. */
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    nota: 'Gratis y sin llave. Sin SLA: pueden cortar el acceso sin aviso.',
  },
  carto: {
    nombre: 'CARTO Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    maxZoom: 20,
    sub: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    nota: 'Más cupo (fair use de 5M de tiles al mes). Uso comercial serio: licencia Enterprise.',
  },
  /* STUB. Preparado, no implementado: el usuario pidió OSM como borrador y Google Maps
     listo en la estructura para después. Para prenderlo hacen falta dos cosas y nada más:
     1) Una llave de Google Maps Platform con la Map Tiles API habilitada y facturación
        activa, restringida por referer al dominio de GitHub Pages, guardada en
        `al3d_pf_gcal`/ajustes (nunca escrita a mano en este archivo, que va publicado).
     2) Cambiar `url` por el template de sesión de Map Tiles API y poner `maxZoom:22`;
        capaBase() no cambia porque la interfaz es la misma para los tres. */
  google: {
    nombre: 'Google Maps',
    url: null,               // ← aquí va el template de la Map Tiles API cuando haya llave
    maxZoom: 22,
    sub: '',
    attribution: '&copy; Google',
    nota: 'Necesita llave de Google Maps Platform con facturación. Todavía no está prendido.',
    llave: null,
  },
};

/**
 * La capa de fondo del mapa, lista para `.addTo(mapa)`.
 * Misma interfaz para los tres proveedores: eso es lo que hace que cambiar de proveedor
 * sea cambiar una preferencia. Si el proveedor no está prendido —google sin llave— cae a
 * OSM en silencio, porque un mapa gris no le dice nada a nadie.
 * @returns {Object|null} la capa de Leaflet, o null si Leaflet no cargó (sin señal la
 *          primera vez, o el vendor no se copió). La pantalla pinta el aviso, no revienta.
 */
export function capaBase(prov) {
  const t = TILES[prov] && TILES[prov].url ? TILES[prov] : TILES.osm;
  const L = typeof globalThis !== 'undefined' ? globalThis.L : null;
  if (!L || typeof L.tileLayer !== 'function') return null;
  return L.tileLayer(t.url, {
    maxZoom: t.maxZoom,
    attribution: t.attribution,
    subdomains: t.sub || 'abc',
    /* Sin crossOrigin ni cabeceras raras: el navegador manda el `Referer` solo y eso es
       justo lo que la política de OSM exige de una página web. Por lo mismo, index.html
       no lleva un Referrer-Policy restrictivo. */
  });
}

/** Qué proveedor está en uso, con su nota, para la pantalla de ajustes. */
export function proveedorActivo(prov) {
  return TILES[prov] && TILES[prov].url ? TILES[prov] : TILES.osm;
}

/* ---------------------------------------------------------------------------
   GEOCODIFICAR — FASE 2. No se llama en Fase 1 y la pantalla lo dice.
   --------------------------------------------------------------------------- */

/** Esto es FASE 2. En Fase 1 el pin entra por link de Google Maps o arrastrado a mano. */
export const FASE = 2;

const TTL_GEO = 90 * 24 * 3600 * 1000;   // 90 días. Una dirección no se mueve.

/* Cola de verdad, no un debounce con esperanza: una sola cadena de promesas donde cada
   eslabón espera 1.1 s antes de pedir. La política de Nominatim dice «an absolute maximum
   of 1 request per second» y ese número es duro. Dos botonazos seguidos se serializan
   aquí; sin la cadena salían las dos peticiones en el mismo tick y eso es motivo de bloqueo. */
let cadena = Promise.resolve();
function enCola(fn) {
  const turno = cadena.then(() => new Promise(r => setTimeout(r, 1100))).then(fn);
  /* La cadena avanza aunque este turno falle: si un 429 rompiera la cadena, el siguiente
     botón no encolaría nunca más y el usuario vería un botón muerto sin explicación. */
  cadena = turno.then(() => {}, () => {});
  return turno;
}

const normaliza = q => String(q || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Dirección de texto → coordenada. SOLO DESDE UN BOTÓN.
 * La política de Nominatim prohíbe explícitamente autocompletar mientras se teclea
 * («you must not implement such a service on the client side»), así que el campo de
 * ubicación lleva botón y no búsqueda al teclear. Y cachear no es optimización: es
 * obligación de la política, y repetir la misma consulta es causa documentada de bloqueo.
 *
 * Devuelve Resultado y no la coordenada pelona: esta función toca la red y escribe caché,
 * así que la pantalla necesita distinguir «no hay señal» de «no encontré esa calle», y un
 * `null` solo no lo distingue. `valor` es la coordenada, o null si no encontró nada.
 * @returns {Promise<{ok:true,valor:Object|null}|{ok:false,codigo:string,mensaje:string}>}
 */
export async function geocodificar(texto) {
  const q = normaliza(texto);
  if (!q) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Escribe la calle, el número y la colonia.' };

  const guardado = await DB.obtener('geo', q);
  if (guardado && Date.now() - (guardado.ts || 0) < TTL_GEO) {
    return { ok: true, valor: guardado.hallado ? { lat: guardado.lat, lng: guardado.lng, nombre: guardado.nombre, fuente: 'cache', exacta: false } : null };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, codigo: 'SIN_RED', mensaje: 'No hay señal. Conéctate y vuelve a darle a Buscar.' };
  }

  /* [NO VERIFICADO EN ESTA SESIÓN] que nominatim.openstreetmap.org responda con
     Access-Control-Allow-Origin: *. Es su comportamiento conocido y existe una librería
     que lo usa desde el navegador, pero no se pudo hacer la petición desde aquí. Antes de
     prometerle esta pantalla al usuario hay que abrirla con la consola de red abierta: si
     no manda ACAO, esto muere en el fetch y cae al catch de abajo como SIN_RED, que sería
     un mensaje engañoso. LocationIQ free es el reemplazo de una línea (mismo formato). */
  try {
    const j = await enCola(async () => {
      const u = new URL('https://nominatim.openstreetmap.org/search');
      u.search = new URLSearchParams({
        q, format: 'jsonv2', limit: '1', countrycodes: 'mx', email: 'remates@thiqa.mx',
      }).toString();
      const r = await fetch(u.toString(), { headers: { Accept: 'application/json' } });
      if (r.status === 429 || r.status === 403) throw new Error('cupo');
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });

    const h = Array.isArray(j) && j[0] ? j[0] : null;
    const la = h ? parseFloat(h.lat) : NaN, ln = h ? parseFloat(h.lon) : NaN;
    const bueno = h && enRango(la, ln);

    /* Se guarda también el «no encontré». Volver a preguntar lo mismo cada vez que alguien
       le pica al botón es exactamente lo que la política llama cliente defectuoso. */
    await DB.poner('geo', {
      q, ts: Date.now(), hallado: !!bueno,
      lat: bueno ? la : null, lng: bueno ? ln : null,
      nombre: bueno ? String(h.display_name || '') : '',
    });

    if (!bueno) return { ok: true, valor: null };
    const val = { lat: la, lng: ln, nombre: String(h.display_name || ''), fuente: 'nominatim', exacta: false };
    if (!enMexico(la, ln)) val.sospechoso = true;
    return { ok: true, valor: val };
  } catch (e) {
    const cupo = String(e && e.message) === 'cupo';
    return cupo
      ? { ok: false, codigo: 'SIN_RED', mensaje: 'El buscador de direcciones está saturado. Espera un minuto y vuelve a intentar.' }
      : { ok: false, codigo: 'SIN_RED', mensaje: 'No se pudo buscar la dirección. Revisa la señal y vuelve a intentar.' };
  }
}

/* ---------------------------------------------------------------------------
   DISTANCIA Y RUTA
   --------------------------------------------------------------------------- */

/** Distancia en línea recta, en kilómetros. Haversine. No es la distancia por calle:
 *  en Guadalajara la de calle sale entre 20 % y 40 % más larga, y para ordenar visitas
 *  eso da igual porque el orden casi nunca cambia. Devuelve 0 si falta un punto. */
export function distanciaKm(a, b) {
  if (!a || !b || !Number.isFinite(+a.lat) || !Number.isFinite(+a.lng) ||
      !Number.isFinite(+b.lat) || !Number.isFinite(+b.lng)) return 0;
  const R = 6371, rad = Math.PI / 180;
  const dLa = (+b.lat - +a.lat) * rad, dLn = (+b.lng - +a.lng) * rad;
  const s = Math.sin(dLa / 2) ** 2 +
            Math.cos(+a.lat * rad) * Math.cos(+b.lat * rad) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Ordena las visitas del día por vecino más cercano, empezando en `origen`.
 *
 * Es un HEURÍSTICO y hay que decirlo en voz alta: no es la ruta óptima, y en el caso malo
 * deja el último punto lejísimos porque se lo fue saltando. Lo que resuelve es lo que
 * duele de verdad, que es «no cruces la ciudad tres veces»: cinco instalaciones en el
 * orden en que se agendaron son cinco travesías de Periférico; en este orden son una.
 * Para cinco o seis puntos al día la diferencia con el óptimo es minutos, no vueltas.
 *
 * Los puntos sin coordenada NO se pierden: se van al final, en su orden original, porque
 * un proyecto sin ubicar sigue siendo un proyecto que hay que visitar.
 * @param {Array<{lat:number,lng:number}>} puntos
 * @returns {Array<Object>} los mismos objetos, reordenados. Nunca lanza.
 */
export function rutaVecinoMasCercano(puntos, origen) {
  const lista = Array.isArray(puntos) ? puntos.filter(p => p && typeof p === 'object') : [];
  if (!lista.length) return [];

  const tiene = p => Number.isFinite(+p.lat) && Number.isFinite(+p.lng) &&
                     !(+p.lat === 0 && +p.lng === 0);
  const conPin = lista.filter(tiene);
  const sinPin = lista.filter(p => !tiene(p));

  const orden = [];
  const faltan = conPin.slice();
  let aqui = origen && tiene(origen) ? origen : centroGDL;

  while (faltan.length) {
    let iMejor = 0, dMejor = Infinity;
    for (let i = 0; i < faltan.length; i++) {
      const d = distanciaKm(aqui, faltan[i]);
      if (d < dMejor) { dMejor = d; iMejor = i; }
    }
    aqui = faltan[iMejor];
    orden.push(faltan.splice(iMejor, 1)[0]);
  }
  return orden.concat(sinPin);
}

/** Cuántos kilómetros de recorrido son, para que el aviso del día diga un número.
 *  Mismo aire recto que distanciaKm: sirve para comparar dos órdenes, no para el odómetro. */
export function largoRutaKm(orden, origen) {
  let total = 0;
  let aqui = origen && Number.isFinite(+origen.lat) ? origen : centroGDL;
  for (const p of (orden || [])) {
    if (!p || !Number.isFinite(+p.lat)) continue;
    total += distanciaKm(aqui, p);
    aqui = p;
  }
  return Math.round(total * 10) / 10;
}
