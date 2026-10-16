/* ============================================================================
   RESPALDO — exporta todas las tablas de la base a un archivo JSON y lo sube a una carpeta de Drive.

   APAGADA: la dispara SOLO el flujo .github/workflows/respaldo-semanal.yml (una vez por semana), y ese
   flujo no hace nada mientras falten su variable RESPALDO_URL_FUNCION y su secreto RESPALDO_SECRETO_FUNCION.
   La hoja sigue siendo la fuente de verdad: hoy no hay datos reales que respaldar.

   ENTRADA   POST con el secreto en la cabecera  x-respaldo-secreto  (RESPALDO_SECRETO_FUNCION, 32+ caracteres)
             y, si se quiere, un cuerpo JSON de a lo más 1 KB: { "subir": false } exporta y cuenta SIN subir nada
             (prueba en seco: sirve para ver que la base contesta antes de dar acceso a Drive).
             Sin secreto, o con otro, o sin secreto configurado: 401, siempre igual, sin decir qué faltó.
   SALIDA    200 { ok:true, archivo:{ id, nombre }, filas:{tabla:n}, bytes, sha256, creado, rotacion }
             200 { ok:true, subido:false, nombre, filas, bytes, sha256, creado }      (prueba en seco)
             503 CONFIGURACION      falta o no sirve una variable (se dice su NOMBRE, nunca su valor)
             502 BASE_NO_CONTESTA   la base no contestó o contestó un error (no se sube nada a medias)
             502 GOOGLE_AUTENTICACION  Google no aceptó la cuenta de servicio
             502 DRIVE_NO_ACEPTO    Drive no aceptó el archivo (403 storageQuotaExceeded: la carpeta tiene que ser
                                    de una unidad compartida; ver _shared/respaldo.js)

   QUÉ SE GUARDA: las 18 tablas de `public`, con la llave secreta (service_role, que salta la RLS y tiene SELECT en
   todas), página por página en el orden de su llave primaria. Es una FOTO aproximada: si alguien escribe a media
   exportación, una tabla puede quedar un momento por delante de otra (no hay una transacción que abarque las 18
   lecturas de PostgREST). Para el propósito —no perderlo todo— basta; el importador de la fase 2 sabe cuadrar.
   ROTACIÓN (decidida por Elías el 2026-10-16): en la carpeta se quedan los 8 respaldos más recientes (RESPALDO_CONSERVAR, opcional,
   un entero de 1 a 520; sin ella, 8). Solo DESPUÉS de una subida que terminó bien —si la exportación, el token o la subida fallan, no
   se toca nada— se lista la carpeta y lo que sobra va a la PAPELERA de Drive (se recupera ahí; una unidad compartida la vacía sola a los
   30 días). Solo cuenta lo que esta función creó: el nombre con su patrón (al3d-respaldo-AAAA-MM-DDTHHMMSSZ.json) y la marca
   appProperties.al3d = 'respaldo' que les pone al subirlos. El recién subido siempre se queda. Si la rotación falla (Drive no lista, no
   deja mandar a la papelera, o RESPALDO_CONSERVAR no sirve), el respaldo YA está arriba: se contesta 200 igual y `rotacion` dice qué
   pasó ({ conservar, a_la_papelera:[nombres], error? }). Con { "subir": false } no hay rotación.

   deps: { fetch, ahora, entorno, registrar? }   `fetch` solo sale hacia SUPABASE_URL y hacia Google.
   ============================================================================ */

import { json, leerTexto, previa, registrar, sobreDeError, textoDeError } from '../_shared/http.js';
import { esErrorDeEntorno, leerSupabaseServicio, secretosDelEntorno } from '../_shared/entorno.js';
import {
  TABLAS, MAX_PAGINAS_POR_TABLA, PAGINA, URL_TOKEN, URL_SUBIDA, ErrorDeRespaldo, esErrorDeRespaldo, secretoValido, leerCredenciales, leerCarpeta,
  importarLlave, asercion, consultaDePagina, nombreDeArchivo, armarArchivo, sha256Hex, direccionDeSubida,
  MARCA, leerConservar, consultaDeLista, direccionDeArchivo, sobrantes,
} from '../_shared/respaldo.js';

/** Los nombres de las variables de esta función (los valores NUNCA salen). */
export const VARIABLES = Object.freeze({
  secretoFuncion: 'RESPALDO_SECRETO_FUNCION',
  credenciales: 'RESPALDO_GOOGLE_CREDENCIALES',
  carpeta: 'RESPALDO_CARPETA_DRIVE',
  conservar: 'RESPALDO_CONSERVAR',          // opcional: cuántos respaldos se quedan en la carpeta (8 si no está)
});
export const MAX_PAGINAS_DE_LISTA = 10;
export const CABECERA_SECRETO = 'x-respaldo-secreto';
export const ESPERA_MS = 30_000;
const MAX_CUERPO = 1024;

const leerVar = (entorno, n) => { try { const x = entorno(n); return typeof x === 'string' ? x : ''; } catch (_) { return ''; } };

/* Todo lo que no puede salir: lo de entorno.js más el secreto de esta función, la llave privada y el JSON entero de las credenciales. */
function secretosDeEsta(entorno) {
  const s = secretosDelEntorno(entorno);
  const cred = leerVar(entorno, VARIABLES.credenciales);
  for (const x of [leerVar(entorno, VARIABLES.secretoFuncion), cred]) if (x.length >= 8) s.push(x);
  try { const c = JSON.parse(cred); if (c && typeof c.private_key === 'string') { s.push(c.private_key, JSON.stringify(c.private_key).slice(1, -1)); } } catch (_) { /* sin JSON, nada más que esconder */ }
  return s;
}

/* fetch con plazo. */
async function pedir(deps, url, init) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), ESPERA_MS);
  try { return await deps.fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(reloj); }
}

/* Las 18 tablas, completas. Con la llave nueva (sb_secret_…) va solo en `apikey`; con la antigua (un JWT), también en Authorization. */
async function exportar(deps, base) {
  const cabeceras = { apikey: base.llave, Accept: 'application/json', ...(base.llave.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + base.llave }) };
  const tablas = {};
  for (const t of TABLAS) {
    const filas = [];
    for (let p = 0; ; p++) {
      if (p >= MAX_PAGINAS_POR_TABLA) throw new ErrorDeRespaldo('base', 'La tabla ' + t.nombre + ' pasa del tope de páginas del respaldo.');
      let res;
      try { res = await pedir(deps, base.url + consultaDePagina(t, p), { method: 'GET', headers: cabeceras }); }
      catch (e) { throw new ErrorDeRespaldo('base', 'La base no contestó al leer ' + t.nombre + '.', { detalle: textoDeError(e) }); }
      if (!res.ok) throw new ErrorDeRespaldo('base', 'La base contestó ' + res.status + ' al leer ' + t.nombre + '.', { status: res.status });
      let pagina;
      try { pagina = JSON.parse(await res.text()); } catch (_) { pagina = null; }
      if (!Array.isArray(pagina)) throw new ErrorDeRespaldo('base', 'La base contestó algo que no es una lista al leer ' + t.nombre + '.');
      filas.push(...pagina);
      if (pagina.length < PAGINA) break;
    }
    tablas[t.nombre] = filas;
  }
  return tablas;
}

async function tokenDeGoogle(deps, cred) {
  const llave = await importarLlave(cred.llavePem);
  const jwt = await asercion({ correo: cred.correo, llave, ahoraMs: deps.ahora() });
  let res;
  try {
    res = await pedir(deps, URL_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(jwt) });
  } catch (e) { throw new ErrorDeRespaldo('google', 'Google no contestó al pedir el token.', { detalle: textoDeError(e) }); }
  let d = null;
  try { d = JSON.parse(await res.text()); } catch (_) { /* queda null */ }
  if (!res.ok || !d || typeof d.access_token !== 'string' || !d.access_token) {
    throw new ErrorDeRespaldo('google', 'Google no aceptó la cuenta de servicio (' + res.status + (d && d.error ? ' ' + String(d.error).slice(0, 60) : '') + ').');
  }
  return d.access_token;
}

async function subirADrive(deps, { token, carpeta, nombre, contenido }) {
  let ini;
  try {
    ini = await pedir(deps, URL_SUBIDA, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/json' },
      body: JSON.stringify({ name: nombre, parents: [carpeta], mimeType: 'application/json', appProperties: MARCA, description: 'Respaldo semanal de la base de AL3D (función respaldo de Supabase).' }) });
  } catch (e) { throw new ErrorDeRespaldo('drive', 'Drive no contestó al empezar la subida.', { detalle: textoDeError(e) }); }
  if (!ini.ok) throw await errorDeDrive(ini);
  const destino = direccionDeSubida(ini.headers.get('location'));
  if (!destino) throw new ErrorDeRespaldo('drive', 'Drive no devolvió una dirección de subida de www.googleapis.com.');
  let fin;
  try { fin = await pedir(deps, destino, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: contenido }); }
  catch (e) { throw new ErrorDeRespaldo('drive', 'Drive no contestó al subir el archivo.', { detalle: textoDeError(e) }); }
  if (!fin.ok) throw await errorDeDrive(fin);
  let d = null;
  try { d = JSON.parse(await fin.text()); } catch (_) { /* queda null */ }
  if (!d || typeof d.id !== 'string') throw new ErrorDeRespaldo('drive', 'Drive no devolvió el id del archivo.');
  return { id: d.id, nombre: typeof d.name === 'string' ? d.name : nombre };
}

/* La rotación, DESPUÉS de una subida que terminó bien. Nunca lanza: lo que falle se dice en la respuesta y el respaldo ya está arriba. */
async function rotar(deps, { token, carpeta, nuevo, conservar }) {
  const cab = { Authorization: 'Bearer ' + token };
  const archivos = [];
  let pagina = null;
  for (let i = 0; ; i++) {
    if (i >= MAX_PAGINAS_DE_LISTA) return { conservar, a_la_papelera: [], error: 'La carpeta tiene demasiados archivos para listarla: no se mandó nada a la papelera.' };
    let res, d = null;
    try { res = await pedir(deps, consultaDeLista(carpeta, pagina), { method: 'GET', headers: cab }); }
    catch (e) { return { conservar, a_la_papelera: [], error: 'Drive no contestó al listar la carpeta: no se mandó nada a la papelera.' }; }
    try { d = JSON.parse(await res.text()); } catch (_) { /* queda null */ }
    if (!res.ok || !d || !Array.isArray(d.files)) return { conservar, a_la_papelera: [], error: 'Drive no dejó listar la carpeta (' + res.status + '): no se mandó nada a la papelera.' };
    archivos.push(...d.files);
    if (!d.nextPageToken) break;
    pagina = String(d.nextPageToken);
  }
  const fuera = sobrantes(archivos, conservar, nuevo);
  const hechos = [], fallos = [];
  for (const a of fuera) {
    const url = direccionDeArchivo(a.id);
    if (!url) { fallos.push(a.name); continue; }
    try {
      const res = await pedir(deps, url, { method: 'PATCH', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      if (res.ok) hechos.push(a.name); else fallos.push(a.name);
    } catch (_) { fallos.push(a.name); }
  }
  return { conservar, a_la_papelera: hechos, ...(fallos.length ? { error: 'Drive no dejó mandar a la papelera: ' + fallos.join(', ') + '.' } : {}) };
}

async function errorDeDrive(res) {
  let razon = '';
  try { const d = JSON.parse(await res.text()); razon = String((d && d.error && (d.error.errors && d.error.errors[0] && d.error.errors[0].reason || d.error.status)) || ''); } catch (_) { /* sin razón */ }
  const pista = /storageQuota/i.test(razon) ? ' La cuenta de servicio no tiene cuota propia: la carpeta tiene que estar en una unidad compartida donde la cuenta sea «Administrador de contenido».'
    : res.status === 404 ? ' ¿Se compartió la carpeta con la cuenta de servicio?' : '';
  return new ErrorDeRespaldo('drive', 'Drive no aceptó el archivo (' + res.status + (razon ? ' ' + razon.slice(0, 60) : '') + ').' + pista);
}

const STATUS_DE = { credenciales: 503, carpeta: 503, base: 502, google: 502, drive: 502 };
const CODIGO_DE = { credenciales: 'CONFIGURACION', carpeta: 'CONFIGURACION', base: 'BASE_NO_CONTESTA', google: 'GOOGLE_AUTENTICACION', drive: 'DRIVE_NO_ACEPTO' };

export async function manejar(peticion, deps) {
  const secretos = secretosDeEsta(deps && deps.entorno);
  const responder = (status, cuerpo) => json(peticion, status, cuerpo, { secretos });
  try {
    const previo = previa(peticion, { metodos: ['POST'] });
    if (previo) return previo;

    /* 1. El secreto, antes de leer nada más. */
    if (!secretoValido(peticion.headers.get(CABECERA_SECRETO), leerVar(deps.entorno, VARIABLES.secretoFuncion))) {
      if (leerVar(deps.entorno, VARIABLES.secretoFuncion).length < 32) registrar(deps, 'respaldo', 'error', 'sin_secreto_configurado', { variable: VARIABLES.secretoFuncion }, secretos);
      return responder(401, sobreDeError('SIN_SESION', 'No autorizado.'));
    }

    /* 2. El cuerpo (opcional). */
    const t = await leerTexto(peticion, MAX_CUERPO);
    let opciones = {};
    if (t.ok && t.texto.trim() !== '') { try { opciones = JSON.parse(t.texto) || {}; } catch (_) { return responder(200, sobreDeError('DATO_INVALIDO', 'El cuerpo no es JSON.')); } }
    if (!t.ok) return responder(200, sobreDeError('DATO_INVALIDO', 'El cuerpo es demasiado grande.'));
    const subir = opciones.subir !== false;

    /* 3. La configuración: todo lo que falte se dice junto, por su nombre. */
    const faltan = [];
    let base = null, cred = null, carpeta = null;
    try { base = leerSupabaseServicio(deps.entorno); } catch (e) { if (!esErrorDeEntorno(e)) throw e; faltan.push(...e.variables); }
    if (subir) {
      try { cred = leerCredenciales(leerVar(deps.entorno, VARIABLES.credenciales)); } catch (e) { if (!esErrorDeRespaldo(e)) throw e; faltan.push(VARIABLES.credenciales); }
      try { carpeta = leerCarpeta(leerVar(deps.entorno, VARIABLES.carpeta)); } catch (e) { if (!esErrorDeRespaldo(e)) throw e; faltan.push(VARIABLES.carpeta); }
    }
    /* La rotación no detiene el respaldo: un RESPALDO_CONSERVAR que no sirve solo apaga la rotación (y se dice). */
    let conservar = null, errorConservar = null;
    try { conservar = leerConservar(leerVar(deps.entorno, VARIABLES.conservar)); } catch (e) { if (!esErrorDeRespaldo(e)) throw e; errorConservar = e.message; }
    if (faltan.length) {
      registrar(deps, 'respaldo', 'error', 'configuracion', { variables: faltan }, secretos);
      return responder(503, sobreDeError('CONFIGURACION', 'Falta configurar o no sirve: ' + faltan.join(', ') + '.', { variables: faltan }));
    }

    /* 4. Exportar, armar y medir. Nada se sube si la exportación no terminó entera. */
    const ahoraMs = deps.ahora();
    const tablas = await exportar(deps, base);
    const contenido = armarArchivo({ tablas, ahoraMs, origen: new URL(base.url).host });
    const resumen = { filas: Object.fromEntries(Object.entries(tablas).map(([k, v]) => [k, v.length])), bytes: new TextEncoder().encode(contenido).byteLength,
                      sha256: await sha256Hex(contenido), creado: new Date(ahoraMs).toISOString() };
    const nombre = nombreDeArchivo(ahoraMs);
    if (!subir) return responder(200, { ok: true, subido: false, nombre, ...resumen });

    /* 5. Google: el token de la cuenta de servicio y la subida. */
    const token = await tokenDeGoogle(deps, cred);
    const archivo = await subirADrive(deps, { token, carpeta, nombre, contenido });
    registrar(deps, 'respaldo', 'info', 'subido', { archivo: archivo.id, bytes: resumen.bytes }, secretos);

    /* 6. La rotación: solo ahora, con el archivo nuevo ya en Drive. */
    const rotacion = errorConservar ? { conservar: null, a_la_papelera: [], error: errorConservar + ' No se mandó nada a la papelera.' }
      : await rotar(deps, { token, carpeta, nuevo: archivo, conservar });
    registrar(deps, 'respaldo', rotacion.error ? 'error' : 'info', 'rotacion', { a_la_papelera: rotacion.a_la_papelera.length, error: rotacion.error || '' }, secretos);
    return responder(200, { ok: true, archivo, ...resumen, rotacion });
  } catch (e) {
    if (esErrorDeRespaldo(e)) {
      registrar(deps, 'respaldo', 'error', e.clase, { detalle: e.detalle || e.message }, secretos);
      return responder(STATUS_DE[e.clase] || 502, sobreDeError(CODIGO_DE[e.clase] || 'SIN_RED', e.message, e.clase === 'base' || e.clase === 'drive' || e.clase === 'google' ? { transitorio: true } : undefined));
    }
    registrar(deps, 'respaldo', 'error', 'inesperado', { detalle: textoDeError(e) }, secretos);
    return responder(500, sobreDeError('DESCONOCIDO', 'El respaldo falló por algo que no se esperaba.'));
  }
}
