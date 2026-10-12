/* ============================================================================
   HTTP — lo que comparten las cuatro funciones al hablar con el navegador: CORS, el sobre JSON,
   leer el cuerpo con tope, la IP de quien llama y el registro. Código de pegamento, sin reglas de
   negocio, y sin nada de Node ni de Deno: solo Request, Response, Headers, URL y TextDecoder, que
   traen los dos. Nada lee el entorno ni el reloj: lo que necesite le llega por parámetro.

   CORS (DECISIÓN: lista cerrada, y se rechaza lo demás en el servidor)
   Las páginas que hablan con estas funciones viven en dos orígenes y solo en esos dos
   (ORIGENES_PERMITIDOS). Una petición de navegador de cualquier otro origen se contesta 403 sin
   cabeceras CORS: el navegador no deja leer la respuesta, y encima no se gasta nada de la base
   ni de un proveedor. Una petición sin `Origin` (curl, un servidor, el cron de GitHub) no es de
   un navegador y pasa como cualquiera; con eso no se «salta» nada, porque lo que protege cada
   función no es CORS sino la sesión (ia, maps) o el cupo y la firma (verificar).
   El origen permitido se devuelve TAL CUAL en Access-Control-Allow-Origin (nunca «*») y con
   `Vary: Origin`. Las cabeceras que pide un preflight se devuelven junto con las de siempre: el
   cliente de Supabase agrega alguna de vez en cuando (x-retry-count, traceparent…) y un
   preflight que no la trae rompe la llamada sin decir por qué. Es seguro porque el origen ya
   pasó la lista.
   Las cabeceras CORS van también en las respuestas de error: sin ellas el navegador dice «Sin
   respuesta» en vez de mostrar el mensaje.

   NINGÚN SECRETO SALE (red de seguridad)
   json() y registrar() reciben la lista de secretos del entorno (entorno.js → secretosDelEntorno)
   y cambian cada aparición, escrita tal cual o escapada para JSON, por «[oculto]». Las rutas ya
   están escritas para no dejarlas salir; esto es lo que impide que un descuido de mañana (un
   mensaje de error de una biblioteca que cite una dirección con la llave, un `detalle` de más)
   las deje ir.
   ============================================================================ */

/* Los dos orígenes desde los que se abre la plataforma: GitHub Pages y el espejo de Cloudflare
   Pages. Es el origen (esquema + host + puerto), no la ruta. Para agregar uno, aquí y en ningún
   otro lado. */
export const ORIGENES_PERMITIDOS = Object.freeze([
  'https://eliasgaribi-ctrl-z.github.io',
  'https://cotizador-al3d.pages.dev',
]);
const EN_LISTA = new Set(ORIGENES_PERMITIDOS);
export const origenPermitido = origen => typeof origen === 'string' && EN_LISTA.has(origen);

/* Lo que el cliente de Supabase manda (la lista de @supabase/supabase-js/cors) y la cabecera del
   contrato de la app (A.md §7.6). */
const CABECERAS_BASE = ['authorization', 'x-client-info', 'apikey', 'content-type', 'x-retry-count',
  'traceparent', 'tracestate', 'baggage', 'x-al3d-contrato'];
const MARCA_DE_SECRETO = '[oculto]';

/* El sobre de un error, el que el cliente ya sabe leer (`interno.err` en la base): { ok:false,
   codigo, mensaje, definitivo } y lo extra. `definitivo` es verdadero solo para lo que reintentar
   no arregla; sin sesión, sin acceso y acceso retirado NO lo son (detienen el bombeo sin descartar
   nada; la app decide qué hacer). */
const DEFINITIVOS = new Set(['ROL_SIN_PERMISO', 'NO_ENCONTRADO', 'DATO_INVALIDO', 'DUPLICADO']);
export function sobreDeError(codigo, mensaje, extra) {
  return { ok: false, codigo, mensaje, definitivo: DEFINITIVOS.has(codigo), ...(extra || {}) };
}

/* El error que no se esperaba, con el cuerpo EXACTO del .gs (su catch de doPost): sin detalles, y sin la llave
   `definitivo` que el .gs no traía. Lo que falló de verdad va al registro. */
export const errorInterno = () => ({ ok: false, codigo: 'DESCONOCIDO', mensaje: 'El puente falló procesando eso.' });

/* ============================================================================
   Esconder secretos
   ============================================================================ */

/* Cada secreto, escrito tal cual y escapado como lo escribiría JSON.stringify, cambiado por
   «[oculto]». Lo de menos de ocho caracteres no es una llave y no se toca. */
export function ocultarSecretos(texto, secretos) {
  let t = String(texto);
  for (const s of secretos || []) {
    if (typeof s !== 'string' || s.length < 8) continue;
    for (const forma of new Set([s, JSON.stringify(s).slice(1, -1)])) {
      if (forma && t.includes(forma)) t = t.split(forma).join(MARCA_DE_SECRETO);
    }
  }
  return t;
}

/* ============================================================================
   La respuesta
   ============================================================================ */

/* El Origin de la petición, o null. Nunca lanza: esto corre también al armar la respuesta de un error, y
   un error al armar el error dejaría a la función sin contestar. */
function origenDe(peticion) {
  try { return peticion.headers.get('origin'); } catch (_) { return null; }
}

function cabeceras(peticion, extra) {
  const h = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
    ...(extra || {}),
  });
  const origen = origenDe(peticion);
  if (origenPermitido(origen)) h.set('Access-Control-Allow-Origin', origen);
  return h;
}

/* La respuesta JSON de una función: `JSON.stringify(cuerpo)` y nada más (sin sangría ni salto de
   línea al final: /verificar contesta byte por byte lo mismo que el .gs). `opciones.secretos` es la
   red de seguridad de arriba; `opciones.cabeceras`, lo extra (Retry-After, Allow). */
export function json(peticion, status, cuerpo, opciones) {
  const o = opciones || {};
  let texto = JSON.stringify(cuerpo);
  if (o.secretos && o.secretos.length) texto = ocultarSecretos(texto, o.secretos);
  return new Response(texto, { status, headers: cabeceras(peticion, o.cabeceras) });
}

/* Lo que se resuelve ANTES de saber qué función es: el origen, el preflight y el método. Devuelve
   la respuesta si ya está resuelto, o null para seguir.
     · origen de navegador que no está en la lista → 403, sin CORS;
     · OPTIONS (el preflight) → 204 con lo permitido;
     · método que la función no atiende → 405 con `Allow`. */
export function previa(peticion, { metodos }) {
  const origen = peticion.headers.get('origin');
  if (origen !== null && !origenPermitido(origen)) {
    return json(peticion, 403, sobreDeError('ORIGEN_NO_PERMITIDO', 'Este origen no puede usar esta función.', { definitivo: true }));
  }
  const metodo = String(peticion.method || '').toUpperCase();
  if (metodo === 'OPTIONS') return preflight(peticion, metodos);
  if (!metodos.includes(metodo)) {
    return json(peticion, 405, sobreDeError('DATO_INVALIDO', 'Este camino no atiende ese método.'),
      { cabeceras: { Allow: metodos.concat('OPTIONS').join(', ') } });
  }
  return null;
}

function preflight(peticion, metodos) {
  const h = new Headers({ 'Vary': 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method' });
  const origen = peticion.headers.get('origin');
  if (origenPermitido(origen)) {
    const pedidas = String(peticion.headers.get('access-control-request-headers') || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(s => /^[a-z0-9-]{1,64}$/.test(s));
    h.set('Access-Control-Allow-Origin', origen);
    h.set('Access-Control-Allow-Methods', metodos.concat('OPTIONS').join(', '));
    h.set('Access-Control-Allow-Headers', [...new Set([...CABECERAS_BASE, ...pedidas])].slice(0, 40).join(', '));
    h.set('Access-Control-Max-Age', '600');
  }
  return new Response(null, { status: 204, headers: h });
}

/* ============================================================================
   El cuerpo
   ============================================================================ */

/* El cuerpo como texto, SIN pasarse de `tope` BYTES: se rechaza por la cabecera Content-Length si
   la trae y, aunque no la traiga o mienta, se deja de leer en cuanto se pasa (leer quince
   megas «a ver cuánto pesan» es lo que no se puede hacer con 256 MB de memoria). Devuelve
   { ok:true, texto } o { ok:false, motivo: 'demasiado_grande' | 'ilegible' }. Sin cuerpo, el
   texto es ''. El tipo de contenido no se mira: el cliente manda text/plain o application/json
   según de dónde salga. */
export async function leerTexto(peticion, tope) {
  const declarado = Number(peticion.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > tope) return { ok: false, motivo: 'demasiado_grande' };
  const cuerpo = peticion.body;
  if (cuerpo === null || cuerpo === undefined) return { ok: true, texto: '' };
  if (typeof cuerpo.getReader !== 'function') {
    const t = await peticion.text();
    return new TextEncoder().encode(t).byteLength > tope ? { ok: false, motivo: 'demasiado_grande' } : { ok: true, texto: t };
  }
  const lector = cuerpo.getReader();
  const partes = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > tope) {
        try { await lector.cancel(); } catch (_) { /* ya estaba cerrado */ }
        return { ok: false, motivo: 'demasiado_grande' };
      }
      partes.push(value);
    }
  } catch (_) { return { ok: false, motivo: 'ilegible' }; }    // la conexión se cortó a media lectura
  const todo = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { todo.set(p, o); o += p.byteLength; }
  return { ok: true, texto: new TextDecoder().decode(todo) };
}

/* ============================================================================
   La IP de quien llama
   ============================================================================ */

const RE_IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const RE_IPV6 = /^[0-9a-f:.]{2,45}$/i;
function esIp(t) {
  if (RE_IPV4.test(t)) return t.split('.').every(n => Number(n) <= 255);
  return RE_IPV6.test(t) && (t.match(/:/g) || []).length >= 2;
}

/* La IP del cliente para el tope por IP de /verificar, o null si no hay una que parezca IP. Lee
   `cf-connecting-ip` y, si no, el PRIMER valor de `x-forwarded-for` (el ejemplo de Supabase).
   NO CONFIRMADO: qué cabecera pone de verdad la plataforma de Supabase y si la puede falsificar
   quien llama; la documentación oficial no lo dice. Por eso el tope por IP solo ENDURECE (es la
   tercera cuenta, después del tope por folio y del total, que no dependen de ella), y por eso aquí
   se valida que parezca una IP antes de mandarla a la base, que solo guarda su hash. */
export function ipDeLaPeticion(peticion) {
  const candidatas = [peticion.headers.get('cf-connecting-ip'), String(peticion.headers.get('x-forwarded-for') || '').split(',')[0]];
  for (const c of candidatas) {
    const t = String(c || '').trim();
    if (esIp(t)) return t.toLowerCase();
  }
  return null;
}

/* ============================================================================
   El registro y el tope por persona
   ============================================================================ */

/* Un renglón al registro de la función (en Supabase, la pestaña Logs de la función). Lo que se
   escribe ya va sin secretos, y NUNCA lleva filas, importes ni nombres: motivos y nombres de
   variables. `deps.registrar(nivel, linea)` lo sustituye en las pruebas. */
export function registrar(deps, funcion, nivel, evento, datos, secretos) {
  try {
    let linea = JSON.stringify({ funcion, evento, ...(datos || {}) });
    if (secretos && secretos.length) linea = ocultarSecretos(linea, secretos);
    if (deps && typeof deps.registrar === 'function') deps.registrar(nivel, linea);
    else (nivel === 'error' ? console.error : console.log)(linea);
  } catch (_) { /* el registro nunca rompe la respuesta */ }
}

/* Lo que se puede decir de una excepción hacia el registro: su mensaje, acotado. */
export const textoDeError = e => String((e && e.message) || e).slice(0, 300);

/* El tope por persona de /maps (el .gs contaba 60 por minuto por quien llamaba, antes de llegar a
   /expandir): `maximo` por ventana FIJA de `ventanaMs`, contado en la memoria de esta instancia de
   la función. Las funciones de Supabase no guardan estado entre instancias, así que esto es un
   TOPE DE MEJOR ESFUERZO (varias instancias suman varios topes), no un cupo exacto como los de la
   base. Devuelve async (clave) → true si pasa. */
export function crearLimitador({ ahora, maximo, ventanaMs }) {
  const cuentas = new Map();
  let ventanaActual = null;
  return async clave => {
    const v = Math.floor(Number(ahora()) / ventanaMs);
    if (v !== ventanaActual) { cuentas.clear(); ventanaActual = v; }
    const n = (cuentas.get(clave) || 0) + 1;
    cuentas.set(clave, n);
    return n <= maximo;
  };
}
