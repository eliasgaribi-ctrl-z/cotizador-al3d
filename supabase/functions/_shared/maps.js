/* ============================================================================
   MAPS — seguir un enlace corto de Google Maps hasta el largo, sin que el servidor
   pueda usarse de trampolín hacia otro lado.

   Es el módulo puro de la Edge Function `maps`. Hace lo que hoy hace `/expandir` del Apps
   Script (`rutaExpandir_` y `expandirLiga_` en puente/hoja-apps-script.gs) y conserva su
   contrato tal cual, para que el cliente (`Sync.expandir` → `Geo.resolverLink`, en
   js/datos/geo.js) no se entere del cambio:

       salió bien → { ok: true,  url }
       no es Maps → { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Solo se siguen ligas de Google Maps.' }
       no se pudo → { ok: false, codigo: 'SIN_RED',       mensaje: 'No se pudo seguir la liga.' }

   Las coordenadas NO se sacan aquí: igual que hoy, el cliente lee la URL con `parseGmaps`
   (una sola copia de esas reglas en el navegador y otra en el .gs, y pruebas/puente-hoja.mjs
   las compara; una tercera copia aquí sería otra que se descompone sola). `DATO_INVALIDO` es
   definitivo para el cliente («eso no es un mapa»); `SIN_RED` se reintenta.

   POR QUÉ EXISTE. Desde el navegador es imposible seguir la liga corta: la 30x de
   maps.app.goo.gl no manda CORS. Lo hace un servidor, y un servidor que sale a internet con
   una dirección que le mandó quien llama es un trampolín: sin lista blanca, cualquiera con
   acceso le pediría tocar direcciones que él no alcanza (el servicio de metadatos de la
   nube, una red interna). Todo lo de abajo es para que eso no pase.

   EL HUECO DEL .gs, Y LA REGLA QUE LO CIERRA. `expandirLiga_` saca el host con
   /^https?:\/\/([^\/:?#]+)/ y compara contra la lista. La clase excluye «:», así que el host
   se corta en el primer dos puntos. Pero antes de un «@» lo que hay es información de
   usuario, y el host de verdad viene después:

       https://maps.google.com:x@evil.example/
              └── el regex ve «maps.google.com» (está en la lista)
                  el analizador estándar (WHATWG, el de fetch) ve el host «evil.example»

   Pasa la lista blanca y `UrlFetchApp.fetch` recibe esa misma cadena. La regla de este módulo
   es distinta en la raíz: se VALIDA LO QUE SE VA A PEDIR. El texto se analiza con `new URL()`,
   se revisan los campos que el analizador entregó (esquema, usuario, contraseña, puerto,
   host) y lo que se le pasa a `fetch` es el `href` canónico que salió de ese mismo
   analizador, nunca el texto original. Quien valida y quien pide ven la misma dirección,
   así que no hay diferencia de interpretación que explotar. Encima se exige que la
   autoridad (lo que va entre «//» y la primera «/», «?» o «#») esté ESCRITA tal cual, sin
   que el analizador la tenga que «arreglar»: un tabulador en el host, un «%2E», una
   diagonal invertida, un carácter de ancho completo o un guion blando le dan al analizador
   el mismo host permitido, pero son una señal de que alguien está probando. Esa segunda
   revisión solo puede rechazar de más, nunca aceptar de más.

   DIFERENCIAS DELIBERADAS CON EL .gs (cada una, con su razón):
     · Solo https. El .gs aceptaba también http://, y `esAcortado` del cliente (js/datos/geo.js)
       también reconoce «http://goo.gl/maps/…», así que una liga vieja guardada con http:// ahora
       contesta `DATO_INVALIDO`. No se acepta a propósito: bajar a texto claro no se gana nada.
       Si hiciera falta, lo correcto es que el cliente la suba a https antes de preguntar.
     · Sin usuario, contraseña ni puerto (el 443 de siempre sí). El .gs aceptaba cualquier
       puerto; no hay razón para que un enlace de Maps lo lleve.
     · El punto final de un nombre de dominio absoluto («maps.google.com.») se quita antes de
       comparar: es el mismo host. El .gs lo rechazaba. Lo que se pide ya va sin él.
     · El .gs daba UN salto y devolvía la `Location` sin pedirla; el cliente encadenaba hasta
       tres llamadas. Aquí se siguen los saltos del lado servidor, a mano, y cada uno se
       resuelve contra la URL actual (la `Location` puede ser relativa: «/\evil.example»
       resuelve a https://evil.example/) y se vuelve a validar completo antes de pedirla.
       Sigue siendo compatible con el cliente: si queda algo por seguir, el cliente vuelve a
       preguntar con lo que recibió.
     · Solo se le hace GET a un ACORTADOR (maps.app.goo.gl, goo.gl, g.co). Si la `Location`
       lleva a una página de Google (www.google.com, maps.google.com, google.com) se devuelve
       sin pedirla, que es lo que hacía el .gs: esa URL ya es el destino, su respuesta es una
       página pesada que aquí no sirve de nada, y cada petición de más a www.google.com es
       una ocasión para que conteste con una página de consentimiento o de verificación en
       vez de la redirección. La liga de la persona sí se pide siempre, sea del dominio que
       sea de la lista, como en el .gs.
     · Una respuesta 429 o 5xx es `SIN_RED` (se reintenta). El .gs la contestaba como éxito
       con la misma liga, y el cliente la daba por definitiva.
     · Solo se acepta texto (`typeof 'string'`). El .gs convertía lo que fuera con String().

   LÍMITES (los tres con tope duro, para que una configuración descuidada no los quite):
     · saltos   — cuántas redirecciones de acortador se siguen. Tres, como el cliente.
     · tiempo   — UN reloj para toda la cadena, no uno por salto, y se cancela la petición en
                  vuelo. Ocho segundos: el cliente se rinde a los quince.
     · bytes    — de una redirección solo importa la cabecera. Su cuerpo se lee como mucho
                  hasta este tope, para soltar la conexión, y si lo pasa no era una
                  redirección de verdad: `SIN_RED`. El cuerpo de una respuesta que no es
                  redirección no se lee nunca.

   NO TIENE NADA DE NODE. Solo `URL`, `AbortController`, `setTimeout` y el `fetch` que le
   pasen: corre igual en Deno (Supabase Edge Functions) y en node. No lee entorno, no abre
   red por su cuenta y no guarda estado entre llamadas; sin `fetch` inyectado lanza, a
   propósito, para que un olvido se vea al cablear y no en producción. Y si el `fetch` que le
   pasan sigue redirecciones por su cuenta (`res.redirected`), no se fía de lo que trae.

   CÓMO SE USA, Y LO QUE NO HACE. En la Edge Function, con la persona ya autenticada:

       import { expandir } from '../_shared/maps.js';
       const r = await expandir(cuerpo.u, { fetch });     // el `fetch` de Deno, inyectado
       return json(r);                                    // la misma forma que daba el .gs

   Aquí no hay autenticación, ni cupo por persona, ni CORS: eso es del manejador. El .gs
   contaba 60 peticiones por minuto por persona antes de llegar a `/expandir`
   (`dentroDelLimite`); esa parte hay que reponerla donde se cablee, porque este módulo solo
   cuida ADÓNDE se sale, no cuántas veces ni quién.
   ============================================================================ */

/** La lista blanca. COPIA EXACTA de `DOMINIOS_MAPS` de puente/hoja-apps-script.gs: sin
 *  comodines, sin subdominios (foo.google.com no entra) y sin ampliarla. Coincidencia por
 *  igualdad, contra el host que entregó el analizador, en minúsculas y sin punto final.
 *  pruebas/supabase-maps.mjs la compara con la del .gs para que no se separen. */
export const DOMINIOS_MAPS = Object.freeze([
  'maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'www.google.com', 'google.com', 'g.co',
]);

/** Los de la lista que sirven para redirigir a otra parte: los únicos a los que se les hace
 *  GET después de la primera liga. Son un subconjunto de `DOMINIOS_MAPS`, no una ampliación. */
export const ACORTADORES = Object.freeze(['maps.app.goo.gl', 'goo.gl', 'g.co']);

/** Valores por omisión. `maxUrl` son caracteres, de lo que llega y de lo que se pide: es un tope
 *  de cordura y no una medida de Maps (las ligas de las pruebas del repositorio miden menos de
 *  150). Si alguna liga real lo pasara, se sube aquí y en ningún otro lado. */
export const LIMITES = Object.freeze({ maxUrl: 4096, maxSaltos: 3, tiempoMs: 8000, maxBytes: 65536 });

/* Lo máximo que se deja pedir aunque la llamada diga más. */
const TECHOS = Object.freeze({ maxSaltos: 10, tiempoMs: 30000, maxBytes: 4 * 1024 * 1024 });

const EN_LISTA = new Set(DOMINIOS_MAPS);
const ES_ACORTADOR = new Set(ACORTADORES);

/* Las redirecciones que se siguen. 300, 304, 305 y 306 no son «ve a esta otra dirección». */
const REDIRECCIONES = new Set([301, 302, 303, 307, 308]);

/* Los dos mensajes son LOS DEL .gs, letra por letra: el cliente reenvía `mensaje` tal cual. */
const noEsMaps = () => ({ ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Solo se siguen ligas de Google Maps.' });
const sinRed   = () => ({ ok: false, codigo: 'SIN_RED',       mensaje: 'No se pudo seguir la liga.' });

/* ---------------------------------------------------------------------------
   VALIDAR
   --------------------------------------------------------------------------- */

/* Espacios, saltos de línea y caracteres de control DENTRO del texto (los de los extremos ya
   se recortaron, como hace el .gs). El analizador estándar quita solo los tabuladores y los
   saltos —uno en mitad del host se desvanece y queda el host permitido—, y lo que se valida
   tiene que ser lo que se lee. Un NUL o un salto de línea del NEL (U+0085) tampoco entran. */
const CON_CONTROL = /[\s\u0000-\u001f\u007f-\u009f]/;

/* Cómo está ESCRITA la autoridad: «https://», un host de letras, números, puntos y guiones, a
   lo más el «:443» de siempre, y enseguida «/», «?», «#» o el final. Nada de «@», «\», «%»,
   corchetes, otros puertos ni letras fuera de ASCII. El lazy (+?) deja el «:443» fuera de la
   captura. Es lineal: no hay cuantificadores anidados que se puedan atorar. */
const AUTORIDAD = /^https:\/\/([a-z0-9.-]+?)(?::443)?(?=[\/?#]|$)/i;

const sinPuntoFinal = h => (h.endsWith('.') ? h.slice(0, -1) : h);
const sinFragmento = u => u.split('#')[0];

/* El analizador estándar ya pasa los números sueltos a su forma de cuatro partes
   (2130706433, 0x7f000001, 0177.0.0.1 y 127.1 salen como 127.0.0.1) y a los de IPv6 los deja
   entre corchetes; por eso basta mirar esas dos formas. */
const esIp = h => h.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h);
const esIdn = h => /(?:^|\.)xn--/.test(h);

/**
 * Revisa un texto contra la lista blanca y dice por qué sí o por qué no.
 *
 * `ok:true` trae `url` (la forma canónica: es LO ÚNICO que se debe pedir) y `host`.
 * `ok:false` trae `motivo`, para el registro y las pruebas; NO se le manda a quien llama
 * (decirle cuál de las reglas lo paró le ayudaría a probar la siguiente). Los motivos, en el
 * orden en que se revisan: `no_es_texto`, `vacio`, `muy_larga`, `espacios_o_control`,
 * `no_es_url`, `esquema`, `credenciales`, `puerto`, `host_ip`, `host_idn`,
 * `host_no_permitido`, `autoridad_rara`.
 * @param {*} texto
 * @returns {{ok:true,url:string,host:string}|{ok:false,motivo:string}}
 */
export function validarEnlace(texto) {
  const no = motivo => ({ ok: false, motivo });
  if (typeof texto !== 'string') return no('no_es_texto');
  const t = texto.trim();
  if (!t) return no('vacio');
  if (t.length > LIMITES.maxUrl) return no('muy_larga');
  if (CON_CONTROL.test(t)) return no('espacios_o_control');

  let u;
  try { u = new URL(t); } catch (_) { return no('no_es_url'); }

  if (u.protocol !== 'https:') return no('esquema');
  /* Esto es lo que el regex del .gs no veía: «https://maps.google.com:x@evil.example/» llega
     aquí con usuario «maps.google.com», contraseña «x» y host «evil.example». */
  if (u.username !== '' || u.password !== '') return no('credenciales');
  /* El analizador deja `port` vacío para el 443 de https, escrito o no. */
  if (u.port !== '') return no('puerto');

  const host = sinPuntoFinal(u.hostname.toLowerCase());
  if (!EN_LISTA.has(host)) return no(esIp(host) ? 'host_ip' : esIdn(host) ? 'host_idn' : 'host_no_permitido');

  /* La segunda revisión: que lo escrito sea el host, sin que el analizador lo haya tenido que
     arreglar (userinfo vacío, «\», tabuladores, «%2E», ancho completo, guion blando, «:» sin
     número, «https:/host», «https:host», «:0443»…). */
  const escrita = AUTORIDAD.exec(t);
  if (!escrita || sinPuntoFinal(escrita[1].toLowerCase()) !== host) return no('autoridad_rara');

  if (u.hostname !== host) u.hostname = host;
  /* La forma canónica puede ser más larga que el texto (cada letra fuera de ASCII del camino
     se vuelve «%XX%XX…»): el tope vale para lo que se va a pedir, no solo para lo que llegó. */
  if (u.href.length > LIMITES.maxUrl) return no('muy_larga');
  return { ok: true, url: u.href, host };
}

/** ¿Es una liga que se puede seguir? Es `validarEnlace(texto).ok`. */
export function esEnlaceDeMapas(texto) {
  return validarEnlace(texto).ok;
}

/* ---------------------------------------------------------------------------
   EXPANDIR
   --------------------------------------------------------------------------- */

/* Un tope que viene de afuera: si no es un número usable (falta, NaN, negativo, un texto que no
   es número), el de siempre; si es enorme o infinito, el techo. Pedir «sin límite» no lo quita. */
function tope(valor, porOmision, techo) {
  if (valor === undefined || valor === null || valor === '') return porOmision;
  const n = Number(valor);
  if (Number.isNaN(n) || n < 0) return porOmision;
  return Math.min(Math.floor(n), techo);
}

function cabecera(res, nombre) {
  const h = res && res.headers;
  if (!h || typeof h.get !== 'function') return '';
  const v = h.get(nombre);
  return v == null ? '' : String(v).trim();
}

/* Suelta el cuerpo sin leerlo. Una respuesta que no se consume deja la conexión colgada. */
async function soltar(res) {
  try {
    if (res && res.body && typeof res.body.cancel === 'function') await res.body.cancel();
  } catch (_) { /* un cuerpo que no se deja cancelar no cambia lo que dijo la cabecera */ }
}

/* Lee el cuerpo de una redirección hasta `tope` bytes y lo suelta. Devuelve false si traía
   más: una redirección es una cabecera, y una que arrastra más que eso es otra cosa. */
async function drenar(res, tope) {
  const cuerpo = res && res.body;
  if (!cuerpo || typeof cuerpo.getReader !== 'function') { await soltar(res); return true; }
  const lector = cuerpo.getReader();
  let leidos = 0;
  let cabe = true;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      leidos += (value && (value.byteLength != null ? value.byteLength : value.length)) || 0;
      if (leidos > tope) { cabe = false; break; }
    }
  } catch (_) { /* si el cuerpo se corta, ya se tiene la cabecera, que es lo que sirve */ }
  try { await lector.cancel(); } catch (_) { /* ya estaba cerrado */ }
  return cabe;
}

/* Una petición, a mano: GET con `redirect:'manual'` (si el fetch siguiera solo, el salto a
   evil.example pasaría sin que nadie lo mirara) y su resultado ya sin la respuesta: el estado
   y, si es redirección, a dónde manda y si su cuerpo cabía. */
async function unSalto(pedir, url, senal, maxBytes) {
  const res = await pedir(url, { method: 'GET', redirect: 'manual', signal: senal });
  const estado = res && res.status;
  if (typeof estado !== 'number') throw new Error('la respuesta no trae estado');
  /* Si el fetch que nos inyectaron siguió redirecciones por su cuenta (`redirected`), los saltos
     intermedios no los revisó nadie: no se confía en lo que trajo, ni en su `Location`. */
  if (res.redirected === true) { await soltar(res); throw new Error('el fetch siguió redirecciones por su cuenta'); }
  /* En un navegador `redirect:'manual'` da una respuesta opaca sin cabeceras; en Deno y en
     node da la 30x de verdad. Si llegara la opaca no hay `Location` que leer: no se sigue. */
  if (estado === 0 || res.type === 'opaqueredirect') { await soltar(res); return { opaca: true }; }

  const ubicacion = REDIRECCIONES.has(estado) ? cabecera(res, 'location') : '';
  if (ubicacion) return { estado, ubicacion, excedido: !(await drenar(res, maxBytes)) };
  await soltar(res);
  return { estado, ubicacion: '', excedido: false };
}

/**
 * Sigue una liga corta de Google Maps y dice a dónde lleva.
 *
 * Primero se valida la liga (si no pasa: `DATO_INVALIDO`, y `fetch` ni se toca). Después, por
 * cada salto: GET a mano, y si la respuesta es una redirección, su `Location` se resuelve
 * contra la URL actual y se vuelve a validar completa. Una dirección fuera de la lista, en el
 * salto que sea, corta todo con `DATO_INVALIDO` y NUNCA se pide. Si el destino es otro
 * acortador se sigue (hasta `maxSaltos`; un bucle o una cadena más larga es `DATO_INVALIDO`:
 * no es un enlace de Maps normal y reintentar no lo arregla); si es una página de Google se
 * devuelve sin pedirla. Una respuesta que no es redirección devuelve la URL a la que se le
 * hizo la petición, que es lo que hacía el .gs (`Location || u`) y lo que el cliente entiende
 * como «de aquí no sale nada nuevo». Todo lo demás —red caída, tiempo agotado, 429, 5xx, una
 * redirección con un cuerpo de más— es `SIN_RED`.
 *
 * @param {string} texto lo que mandó quien llama (el `u` del cuerpo de /expandir)
 * @param {{ fetch: function(string, Object):Promise<Object>,
 *           maxSaltos?: number, tiempoMs?: number, maxBytes?: number }} opciones
 *   `fetch` es obligatorio y se le pasa `{ method, redirect:'manual', signal }`; basta con que
 *   la respuesta traiga `status`, `headers.get()` y, si la tiene, `body` (un ReadableStream).
 * @returns {Promise<{ok:true,url:string}|{ok:false,codigo:'DATO_INVALIDO'|'SIN_RED',mensaje:string}>}
 */
export async function expandir(texto, opciones) {
  const o = opciones || {};
  if (typeof o.fetch !== 'function') {
    throw new TypeError('expandir necesita el fetch inyectado: expandir(texto, { fetch })');
  }
  const v = validarEnlace(texto);
  if (!v.ok) return noEsMaps();

  const maxSaltos = tope(o.maxSaltos, LIMITES.maxSaltos, TECHOS.maxSaltos);
  const tiempoMs = tope(o.tiempoMs, LIMITES.tiempoMs, TECHOS.tiempoMs);
  const maxBytes = tope(o.maxBytes, LIMITES.maxBytes, TECHOS.maxBytes);

  /* Lo que se devuelve si la liga misma no redirige: lo que mandó la persona, recortado. */
  const entrada = texto.trim();

  /* Un solo reloj para toda la cadena. Al vencer cancela la petición en vuelo; y además cada
     salto compite contra él, porque un `fetch` que no atienda la señal no debe poder
     colgarnos. El `.catch` vacío es para que, si vence entre dos esperas, nadie lo cuente
     como un rechazo sin atender: quien compite después lo sigue viendo rechazado. */
  const ctrl = new AbortController();
  let reloj;
  const vencido = new Promise((_, rechazar) => {
    reloj = setTimeout(() => { ctrl.abort(); rechazar(new Error('tiempo agotado')); }, tiempoMs);
  });
  vencido.catch(() => {});

  try {
    let actual = v.url;
    const vistos = new Set([sinFragmento(actual)]);

    for (let saltos = 0; ; saltos++) {
      const r = await Promise.race([unSalto(o.fetch, actual, ctrl.signal, maxBytes), vencido]);
      if (r.opaca || r.excedido || r.estado === 429 || r.estado >= 500) return sinRed();

      if (!r.ubicacion) return { ok: true, url: saltos === 0 ? entrada : actual };

      /* A partir de aquí manda quien contestó, y lo que dijo se trata como lo que mandó la
         persona: sin confiar en nada. Una `Location` enorme, o con espacios o caracteres de
         control, no es de un Google bien portado (y si traía dos cabeceras, `fetch` las junta
         con «, »). Resolver contra la URL actual es lo que atrapa a «/\evil.example» y a
         «//evil.example», que son relativas para el ojo y absolutas para el analizador. */
      if (r.ubicacion.length > LIMITES.maxUrl || CON_CONTROL.test(r.ubicacion)) return noEsMaps();
      let destino;
      try { destino = new URL(r.ubicacion, actual).href; } catch (_) { return noEsMaps(); }
      const vd = validarEnlace(destino);
      if (!vd.ok) return noEsMaps();

      /* Una página de Google es el destino: se devuelve, no se pide. */
      if (!ES_ACORTADOR.has(vd.host)) return { ok: true, url: vd.url };

      if (saltos >= maxSaltos) return noEsMaps();
      const clave = sinFragmento(vd.url);
      if (vistos.has(clave)) return noEsMaps();
      vistos.add(clave);
      actual = vd.url;
    }
  } catch (_) {
    return sinRed();
  } finally {
    clearTimeout(reloj);
  }
}
