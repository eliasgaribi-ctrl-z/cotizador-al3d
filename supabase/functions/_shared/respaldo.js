/* ============================================================================
   RESPALDO — lo puro del respaldo semanal: qué tablas, cómo se arma el archivo y cómo se habla con
   Google (la firma de la cuenta de servicio, el token y la subida a Drive).

   Por qué existe. El plan Free de Supabase no trae respaldos (verificado 2026-10-10, C-36): si el
   proyecto se pierde, se pierde todo lo que ya no esté en la hoja. La función `respaldo` exporta TODAS
   las tablas de `public` a UN archivo JSON y lo sube a una carpeta de Drive con una CUENTA DE SERVICIO
   de Google. Lo dispara una vez por semana el flujo .github/workflows/respaldo-semanal.yml, apagado
   mientras no existan su variable y su secreto.

   Sin Deno ni Node: WebCrypto (RSASSA-PKCS1-v1_5 con SHA-256, SHA-256), TextEncoder, atob/btoa y URL,
   que traen los dos. Nada lee el entorno ni la red por su cuenta: todo llega por parámetro.

   LO QUE NO SE CONFIRMÓ (no hay cuenta de servicio ni carpeta reales en esta rama; se probó con dobles):
     · que una cuenta de servicio pueda CREAR archivos en una carpeta de «Mi unidad» de una persona. Según
       la documentación de Google, las cuentas de servicio no tienen cuota propia de almacenamiento: lo
       seguro es una carpeta dentro de una UNIDAD COMPARTIDA (Google Workspace) donde la cuenta sea
       «Administrador de contenido». Por eso las peticiones llevan `supportsAllDrives=true`, y un 403
       `storageQuotaExceeded` se contesta con esa pista;
     · el alcance: se pide `https://www.googleapis.com/auth/drive` y no `drive.file`, porque `drive.file`
       solo deja escribir en lo que la propia aplicación creó y la carpeta la crea Elías. La cuenta de
       servicio solo ve lo que se comparta con ella: en la práctica, esa carpeta.
   ============================================================================ */

/* Las 17 tablas de `public` (supabase/migrations), cada una con el orden estable de su llave primaria: la
   paginación por `offset` necesita un orden total. pruebas/supabase-respaldo.mjs exige que esta lista sea
   EXACTAMENTE la de las migraciones: una tabla nueva sin respaldo es un hallazgo. */
export const TABLAS = Object.freeze([
  ['empresas', 'id'], ['miembros', 'empresa_id,correo'], ['contadores', 'empresa_id,clave,ventana'], ['bitacora', 'id'],
  ['proyectos', 'id'], ['ventas_dinero', 'proyecto_id'], ['abonos', 'id'], ['instalaciones', 'id'],
  ['materiales', 'empresa_id,id'], ['requerimientos', 'empresa_id,id'], ['almacen_movimientos', 'empresa_id,id'], ['almacen_costos', 'id'], ['constantes', 'empresa_id,clave'],
  ['autorizaciones', 'id'], ['cotizaciones', 'empresa_id,folio_global'], ['solicitudes', 'id'], ['cuaderno_notas', 'empresa_id,clave,autor_id'],
].map(([nombre, orden]) => Object.freeze({ nombre, orden })));

export const FORMATO = 'al3d-respaldo-1';
export const PAGINA = 1000;                 // = max_rows de config.toml: PostgREST no corta en silencio una página de este tamaño
export const MAX_PAGINAS_POR_TABLA = 500;   // 500 000 filas: un tope para no quedarse en un bucle si algo contesta raro
export const ALCANCE = 'https://www.googleapis.com/auth/drive';
export const URL_TOKEN = 'https://oauth2.googleapis.com/token';
export const URL_SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size';
export const SECRETO_MINIMO = 32;

export class ErrorDeRespaldo extends Error {
  constructor(clase, mensaje, extra) {
    super(mensaje);
    this.name = 'ErrorDeRespaldo';
    this.clase = clase;            // 'credenciales' | 'carpeta' | 'base' | 'google' | 'drive'
    Object.assign(this, extra || {});
  }
}
export const esErrorDeRespaldo = e => !!e && e.name === 'ErrorDeRespaldo';

/* ---------------------------------------------------------------------------
   El secreto compartido de quien dispara la función
   --------------------------------------------------------------------------- */
/** Igualdad sin salirse en la primera diferencia, y exige un secreto configurado de al menos 32 caracteres. */
export function secretoValido(dado, esperado) {
  const a = String(esperado ?? ''), b = String(dado ?? '');
  let d = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0 && a.length >= SECRETO_MINIMO;
}

/* ---------------------------------------------------------------------------
   La configuración: credenciales y carpeta (sus valores NUNCA salen en un mensaje)
   --------------------------------------------------------------------------- */
/** El JSON de la llave de la cuenta de servicio, validado. Lanza ErrorDeRespaldo('credenciales') sin citar el texto. */
export function leerCredenciales(texto) {
  let c;
  try { c = JSON.parse(String(texto || '')); }
  catch (_) { throw new ErrorDeRespaldo('credenciales', 'RESPALDO_GOOGLE_CREDENCIALES no es un JSON válido (se espera el archivo de llave de una cuenta de servicio).'); }
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new ErrorDeRespaldo('credenciales', 'RESPALDO_GOOGLE_CREDENCIALES tiene que ser un objeto JSON.');
  if (c.type !== undefined && c.type !== 'service_account') throw new ErrorDeRespaldo('credenciales', 'RESPALDO_GOOGLE_CREDENCIALES no es de una cuenta de servicio (type).');
  if (typeof c.client_email !== 'string' || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(c.client_email)) {
    throw new ErrorDeRespaldo('credenciales', 'A RESPALDO_GOOGLE_CREDENCIALES le falta client_email de una cuenta de servicio (…@….iam.gserviceaccount.com).');
  }
  if (typeof c.private_key !== 'string' || !/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(c.private_key)) {
    throw new ErrorDeRespaldo('credenciales', 'A RESPALDO_GOOGLE_CREDENCIALES le falta private_key (PEM «BEGIN PRIVATE KEY»).');
  }
  /* El token se pide SIEMPRE a Google: un token_uri distinto en el archivo no lo cambia (no se manda una firma a otro lado). */
  return { correo: c.client_email, llavePem: c.private_key };
}

/** El id de una carpeta de Drive (lo que va después de /folders/ en su dirección). */
export function leerCarpeta(texto) {
  const t = String(texto || '').trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(t)) throw new ErrorDeRespaldo('carpeta', 'RESPALDO_CARPETA_DRIVE tiene que ser el id de una carpeta de Drive (letras, números, - y _).');
  return t;
}

/* ---------------------------------------------------------------------------
   El JWT de la cuenta de servicio (RS256) y el token
   --------------------------------------------------------------------------- */
const b64url = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlTexto = t => b64url(new TextEncoder().encode(t));

/** PEM PKCS#8 → CryptoKey para firmar. Una llave que no se deja importar es un error de credenciales. */
export async function importarLlave(pem) {
  const cuerpo = String(pem).replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  let der;
  try { der = Uint8Array.from(atob(cuerpo), c => c.charCodeAt(0)); }
  catch (_) { throw new ErrorDeRespaldo('credenciales', 'La private_key de RESPALDO_GOOGLE_CREDENCIALES no es base64 válido.'); }
  try { return await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']); }
  catch (_) { throw new ErrorDeRespaldo('credenciales', 'La private_key de RESPALDO_GOOGLE_CREDENCIALES no es una llave RSA que se pueda usar.'); }
}

/** La aserción firmada que se cambia por un token (RFC 7523): una hora de vida. `ahoraMs` lo pone quien llama. */
export async function asercion({ correo, llave, ahoraMs }) {
  const iat = Math.floor(ahoraMs / 1000);
  const cabecera = b64urlTexto(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const reclamos = b64urlTexto(JSON.stringify({ iss: correo, scope: ALCANCE, aud: URL_TOKEN, iat, exp: iat + 3600 }));
  const firma = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', llave, new TextEncoder().encode(cabecera + '.' + reclamos)));
  return cabecera + '.' + reclamos + '.' + b64url(firma);
}

/* ---------------------------------------------------------------------------
   El archivo
   --------------------------------------------------------------------------- */
/** La consulta de una página de una tabla (PostgREST). */
export function consultaDePagina(tabla, pagina) {
  const orden = tabla.orden.split(',').map(c => c + '.asc').join(',');
  return '/rest/v1/' + tabla.nombre + '?select=*&order=' + orden + '&limit=' + PAGINA + '&offset=' + (pagina * PAGINA);
}

/** El nombre del archivo: al3d-respaldo-2026-10-18T092300Z.json (ordena por fecha). */
export function nombreDeArchivo(ahoraMs) {
  return 'al3d-respaldo-' + new Date(ahoraMs).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '') + '.json';
}

/** El contenido: formato, cuándo, de qué proyecto (solo el host) y las filas de cada tabla tal como las dio la base. */
export function armarArchivo({ tablas, ahoraMs, origen }) {
  const filas = Object.fromEntries(Object.entries(tablas).map(([k, v]) => [k, v.length]));
  return JSON.stringify({ formato: FORMATO, creado: new Date(ahoraMs).toISOString(), origen, filas, tablas });
}

export async function sha256Hex(texto) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
}

/** La dirección a la que Drive dice que se suba el contenido: solo se acepta si es de www.googleapis.com por https. */
export function direccionDeSubida(location) {
  let u;
  try { u = new URL(String(location || '')); } catch (_) { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'www.googleapis.com' || u.username || u.password || u.port) return null;
  if (!u.pathname.startsWith('/upload/drive/v3/files')) return null;
  return u.href;
}
