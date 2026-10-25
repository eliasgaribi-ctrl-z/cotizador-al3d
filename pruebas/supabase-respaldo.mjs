/* LA FUNCIÓN `respaldo` DE SUPABASE, PROBADA CON DOBLES.

   El respaldo exporta las 21 tablas a un JSON y lo sube a Drive con una cuenta de servicio de Google. Nada de
   eso se puede tocar desde aquí (no hay proyecto, ni cuenta de servicio, ni carpeta): se prueba con un fetch de
   mentiras que se porta como PostgREST, como el servidor de tokens de Google y como la subida reanudable de
   Drive, y con una llave RSA FALSA generada en cada corrida. Se comprueba:
     1. que lo exportado son EXACTAMENTE las tablas de supabase/migrations, completas (también con más de una página);
     2. que el JWT de la cuenta de servicio va firmado (RS256) con su llave y dice lo que tiene que decir;
     3. que lo que llega a Drive es el archivo entero, en la carpeta, y que la respuesta trae su huella;
     4. que sin el secreto no pasa nada, que lo que falta se dice por su NOMBRE, que un fallo de la base no sube nada
        a medias, que Drive y Google fallando se dicen como tales, y que ningún secreto sale;
     5. el flujo semanal: apagado si falta su variable o su secreto, sin secretos en el archivo;
     7. la rotación (Elías, 2026-10-16): después de una subida buena se quedan los 8 más recientes (RESPALDO_CONSERVAR), lo demás
        va a la papelera, y solo lo que la función creó (nombre con su patrón Y su marca); si algo falla, el respaldo ya está arriba;
     6. Deno: `deno check` si hay deno (en esta máquina no hay: se dice).
   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import * as R from '../supabase/functions/_shared/respaldo.js';
import { manejar, VARIABLES, CABECERA_SECRETO } from '../supabase/functions/respaldo/handler.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
// En Windows los archivos pueden llegar con CRLF: se comparan como LF.
const leer = (...p) => readFileSync(join(RAIZ, ...p), 'utf8').replace(/\r\n/g, '\n');
let pasan = 0, fallos = 0;
const recortar = (s, n = 400) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
const bien = m => { pasan++; console.log('  ✓ ' + m); };
const mal = m => { fallos++; console.log('  ✗ ' + m); };
const eq = (que, dio, esp) => { const a = JSON.stringify(dio), b = JSON.stringify(esp); if (a === b) bien(que); else mal(que + '\n         dio: ' + recortar(a) + '\n         esp: ' + recortar(b)); };
const cierto = (que, x) => eq(que, !!x, true);
const seccion = t => console.log('\n' + t);

/* ---- Lo falso: una llave RSA de esta corrida, secretos marcados como tales ---- */
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', par.privateKey)).toString('base64');
const PEM = '-----BEGIN PRIVATE KEY-----\n' + pkcs8.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';
const CORREO_SA = 'respaldo-falso@proyecto-falso.iam.gserviceaccount.com';
const CREDENCIALES = JSON.stringify({ type: 'service_account', project_id: 'proyecto-falso', private_key_id: 'falsa', private_key: PEM, client_email: CORREO_SA, token_uri: 'https://malo.example/token' });
const SECRETO = 'SECRETO-FALSO-DEL-RESPALDO-0000-1111-2222';
const SECRETA = 'sb_secret_FALSA_solo_para_pruebas_0000000000';
const CARPETA = '1AbCdEfGhIjKlMnOpQrStUvWxYz_falsa';
const URL_BASE = 'https://falso.supabase.co';
const AHORA = Date.UTC(2026, 9, 18, 10, 23, 0, 0);
const TOKEN = 'ya29.TOKEN-FALSO-DE-GOOGLE-0000';

/* ---- Los datos de la base de mentiras: cada tabla con unas filas; bitácora con 2 500 (tres páginas) ---- */
function datosFalsos() {
  const d = {};
  for (const t of R.TABLAS) d[t.nombre] = Array.from({ length: 3 }, (_, i) => ({ id: t.nombre + '-' + i, empresa_id: 'al3d', texto: 'Güero «ñ» 🌮 ' + i }));
  d.bitacora = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, titulo: 'evento ' + (i + 1) }));
  d.contadores = [];
  return d;
}

/* ---- El fetch de mentiras: PostgREST, el token de Google y Drive ---- */
function mundo(o = {}) {
  const datos = o.datos || datosFalsos();
  const m = { llamadas: [], subido: null, jwt: null, metadatos: null };
  m.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const h = new Headers(init.headers || {});
    m.llamadas.push({ url: u.href, metodo: init.method || 'GET' });
    const respuesta = (status, cuerpo, cab) => new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status, headers: cab });
    if (u.origin === URL_BASE && u.pathname.startsWith('/rest/v1/')) {
      if (o.baseFalla) return respuesta(500, { code: 'XX000', message: 'falla ' + SECRETA });
      if (h.get('apikey') !== SECRETA || h.get('authorization')) return respuesta(401, { message: 'llave' });
      const tabla = u.pathname.slice('/rest/v1/'.length);
      if (!(tabla in datos)) return respuesta(404, { code: 'PGRST205' });
      const desde = Number(u.searchParams.get('offset')), cuantas = Number(u.searchParams.get('limit'));
      m.ordenes = { ...(m.ordenes || {}), [tabla]: u.searchParams.get('order') };
      return respuesta(200, datos[tabla].slice(desde, desde + cuantas));
    }
    if (u.href === R.URL_TOKEN) {
      if (o.tokenFalla) return respuesta(400, { error: 'invalid_grant', error_description: 'firma' });
      const p = new URLSearchParams(String(init.body));
      m.grant = p.get('grant_type');
      m.jwt = p.get('assertion');
      return respuesta(200, { access_token: TOKEN, expires_in: 3599, token_type: 'Bearer' });
    }
    if (u.origin === 'https://www.googleapis.com' && u.pathname === '/upload/drive/v3/files' && init.method === 'POST') {
      if (h.get('authorization') !== 'Bearer ' + TOKEN) return respuesta(401, {});
      m.paramsSubida = Object.fromEntries(u.searchParams);
      m.metadatos = JSON.parse(String(init.body));
      if (o.cuota) return respuesta(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }], status: 'PERMISSION_DENIED' } });
      return respuesta(200, '', { Location: o.otroDestino || 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=FALSO123' });
    }
    if (u.origin === 'https://www.googleapis.com' && init.method === 'PUT') {
      m.subido = String(init.body);
      m.tipoSubido = h.get('content-type');
      return respuesta(200, { id: 'archivo-falso-1', name: m.metadatos.name, size: String(m.subido.length) });
    }
    if (u.origin === 'https://www.googleapis.com' && u.pathname === '/drive/v3/files' && (init.method || 'GET') === 'GET') {
      if (h.get('authorization') !== 'Bearer ' + TOKEN) return respuesta(401, {});
      m.listas = [...(m.listas || []), Object.fromEntries(u.searchParams)];
      if (o.listaFalla) return respuesta(500, { error: { status: 'INTERNAL' } });
      const todos = [...(o.carpeta || [])];
      if (m.subido !== null && !o.nuevoInvisible) todos.push({ id: 'archivo-falso-1', name: m.metadatos.name, appProperties: m.metadatos.appProperties });
      todos.sort((a, b) => b.name.localeCompare(a.name));
      const tam = o.tamPagina || 1000, desde = Number(u.searchParams.get('pageToken') || 0);
      return respuesta(200, { files: todos.slice(desde, desde + tam), ...(desde + tam < todos.length ? { nextPageToken: String(desde + tam) } : {}) });
    }
    if (u.origin === 'https://www.googleapis.com' && u.pathname.startsWith('/drive/v3/files/') && init.method === 'PATCH') {
      if (h.get('authorization') !== 'Bearer ' + TOKEN) return respuesta(401, {});
      const id = decodeURIComponent(u.pathname.slice('/drive/v3/files/'.length));
      m.papelera = [...(m.papelera || []), { id, cuerpo: JSON.parse(String(init.body)), params: Object.fromEntries(u.searchParams) }];
      if ((o.papeleraFalla || []).includes(id)) return respuesta(403, { error: { status: 'PERMISSION_DENIED' } });
      return respuesta(200, { id, trashed: true });
    }
    return respuesta(599, 'fetch de mentiras: no conozco ' + u.href);
  };
  return m;
}

const entornoDe = (cambios = {}) => {
  const v = { SUPABASE_URL: URL_BASE, SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRETA }), [VARIABLES.secretoFuncion]: SECRETO,
              [VARIABLES.credenciales]: CREDENCIALES, [VARIABLES.carpeta]: CARPETA, ...cambios };
  return n => v[n];
};
const registro = [];
async function llamar(o = {}) {
  const m = o.mundo || mundo(o);
  const headers = { ...(o.sinSecreto ? {} : { [CABECERA_SECRETO]: o.secreto || SECRETO }), 'content-type': 'application/json' };
  const res = await manejar(new Request(URL_BASE + '/functions/v1/respaldo', { method: 'POST', headers, body: o.cuerpo === undefined ? '' : o.cuerpo }),
    { fetch: m.fetch, ahora: () => AHORA, entorno: entornoDe(o.entorno), registrar: (n, l) => registro.push(l) });
  const texto = await res.text();
  return { status: res.status, texto, cuerpo: JSON.parse(texto), m };
}

/* ============================================================================ */
seccion('1. QUÉ SE RESPALDA — las tablas de las migraciones, todas y completas');
{
  const sql = readdirSync(join(RAIZ, 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).map(f => leer('supabase', 'migrations', f)).join('\n');
  const enMigraciones = [...new Set([...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-z_]+)/gi)].map(x => x[1]))].sort();
  eq('la lista de la función es EXACTAMENTE la de supabase/migrations (' + enMigraciones.length + ' tablas): una tabla nueva sin respaldo sale aquí', R.TABLAS.map(t => t.nombre).sort(), enMigraciones);
  const r = await llamar();
  eq('una corrida completa: 200, el archivo en Drive con su id y su nombre con la fecha', [r.status, r.cuerpo.ok, r.cuerpo.archivo], [200, true, { id: 'archivo-falso-1', nombre: 'al3d-respaldo-2026-10-18T102300Z.json' }]);
  const archivo = JSON.parse(r.m.subido);
  eq('lo que llegó a Drive es el formato al3d-respaldo-1, con la hora, el proyecto (solo el host) y las 24 tablas (0022 sumó pantallas; 0023, las tres del agente)', [archivo.formato, archivo.creado, archivo.origen, Object.keys(archivo.tablas).length], ['al3d-respaldo-1', '2026-10-18T10:23:00.000Z', 'falso.supabase.co', 24]);
  const datos = datosFalsos();
  eq('cada tabla COMPLETA y tal cual (la bitácora, 2 500 filas en tres páginas de 1 000; acentos y emoji intactos)', archivo.tablas, datos);
  eq('las filas que dice la respuesta y las que dice el archivo', [r.cuerpo.filas.bitacora, r.cuerpo.filas.contadores, archivo.filas.bitacora], [2500, 0, 2500]);
  eq('la huella (sha256) y los bytes de la respuesta son los del archivo subido', [r.cuerpo.sha256, r.cuerpo.bytes], [await R.sha256Hex(r.m.subido), Buffer.byteLength(r.m.subido)]);
  eq('cada tabla se lee en el orden de su llave primaria (la paginación por offset lo necesita)', [r.m.ordenes.miembros, r.m.ordenes.cuaderno_notas, r.m.ordenes.bitacora], ['empresa_id.asc,correo.asc', 'empresa_id.asc,clave.asc,autor_id.asc', 'id.asc']);
  eq('la llave secreta nueva (sb_secret_) va solo en apikey, sin Authorization (el doble contesta 401 si no)', r.status, 200);

  seccion('2. LA CUENTA DE SERVICIO — el JWT firmado y el token');
  const [c, p, f] = r.m.jwt.split('.');
  const dec = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
  eq('el grant es jwt-bearer y la cabecera RS256', [r.m.grant, dec(c)], ['urn:ietf:params:oauth:grant-type:jwt-bearer', { alg: 'RS256', typ: 'JWT' }]);
  eq('los reclamos: la cuenta, el alcance de Drive, el destino del token (el de Google aunque el archivo diga otro) y una hora de vida', dec(p),
    { iss: CORREO_SA, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: AHORA / 1000, exp: AHORA / 1000 + 3600 });
  cierto('la firma la verifica la llave PÚBLICA de la cuenta (RSASSA-PKCS1-v1_5, SHA-256)',
    await crypto.subtle.verify('RSASSA-PKCS1-v1_5', par.publicKey, Buffer.from(f, 'base64url'), new TextEncoder().encode(c + '.' + p)));
  cierto('nada fue a la token_uri que traía el archivo de credenciales (malo.example)', !r.m.llamadas.some(x => x.url.includes('malo.example')));

  seccion('3. DRIVE — la subida reanudable, en la carpeta, en una unidad compartida');
  eq('los metadatos: el nombre, la carpeta como padre y JSON', [r.m.metadatos.name, r.m.metadatos.parents, r.m.metadatos.mimeType], ['al3d-respaldo-2026-10-18T102300Z.json', [CARPETA], 'application/json']);
  eq('con supportsAllDrives (unidades compartidas) y subida reanudable', [r.m.paramsSubida.uploadType, r.m.paramsSubida.supportsAllDrives], ['resumable', 'true']);
  eq('el contenido va como application/json', r.m.tipoSubido, 'application/json');
  eq('las llamadas, en orden: 24 tablas (bitácora en 3 páginas), el token, iniciar, subir y listar la carpeta (vacía: nada a la papelera)', r.m.llamadas.map(x => new URL(x.url).host + ' ' + x.metodo).reduce((a, x) => ((a[x] = (a[x] || 0) + 1), a), {}),
    { 'falso.supabase.co GET': 26, 'oauth2.googleapis.com POST': 1, 'www.googleapis.com POST': 1, 'www.googleapis.com PUT': 1, 'www.googleapis.com GET': 1 });
  eq('el archivo sube con la marca appProperties.al3d = respaldo (la rotación solo toca lo que la lleva)', r.m.metadatos.appProperties, { al3d: 'respaldo' });
  const seco = await llamar({ cuerpo: '{"subir":false}', entorno: { [VARIABLES.credenciales]: undefined, [VARIABLES.carpeta]: undefined } });
  eq('prueba en seco ({subir:false}): exporta y cuenta, no pide credenciales ni toca Google', [seco.status, seco.cuerpo.subido, seco.cuerpo.filas.bitacora, seco.m.llamadas.some(x => !x.url.startsWith(URL_BASE))], [200, false, 2500, false]);
}

/* ============================================================================ */
seccion('4. CUANDO ALGO FALTA O FALLA');
{
  for (const [que, o] of [['sin secreto', { sinSecreto: true }], ['con otro secreto', { secreto: SECRETO + 'x' }], ['sin secreto configurado en la función (aunque mande uno vacío)', { secreto: '', entorno: { [VARIABLES.secretoFuncion]: '' } }],
                          ['con un secreto configurado demasiado corto', { secreto: 'corto', entorno: { [VARIABLES.secretoFuncion]: 'corto' } }]]) {
    const r = await llamar(o);
    eq(que + ': 401 siempre igual y NI UNA llamada a la base ni a Google', [r.status, r.cuerpo.mensaje, r.m.llamadas.length], [401, 'No autorizado.', 0]);
  }
  const falta = await llamar({ entorno: { [VARIABLES.credenciales]: undefined, [VARIABLES.carpeta]: 'no/es una carpeta', SUPABASE_SECRET_KEYS: undefined } });
  eq('lo que falta se dice junto y por su NOMBRE (503 CONFIGURACION), antes de leer nada', [falta.status, falta.cuerpo.codigo, falta.cuerpo.variables, falta.m.llamadas.length],
    [503, 'CONFIGURACION', ['SUPABASE_SECRET_KEYS', VARIABLES.credenciales, VARIABLES.carpeta], 0]);
  const rota = await llamar({ entorno: { [VARIABLES.credenciales]: '{"private_key": "' + PEM.slice(0, 80) } });
  eq('credenciales que no son JSON: 503 con el nombre, sin citar el texto', [rota.status, rota.cuerpo.variables, rota.texto.includes('BEGIN')], [503, [VARIABLES.credenciales], false]);
  eq('leerCredenciales: no es de una cuenta de servicio, sin client_email o sin private_key → error de credenciales sin citar valores',
    ['{"type":"authorized_user"}', '{"private_key":"x"}', JSON.stringify({ client_email: CORREO_SA })].map(t => { try { R.leerCredenciales(t); return 'pasó'; } catch (e) { return e.clase + (e.message.includes(CORREO_SA) ? ' CITA' : ''); } }),
    ['credenciales', 'credenciales', 'credenciales']);
  const llaveMala = await llamar({ entorno: { [VARIABLES.credenciales]: JSON.stringify({ client_email: CORREO_SA, private_key: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----' }) } });
  eq('una private_key que no es una llave RSA: 503 CONFIGURACION (y la exportación no se sube)', [llaveMala.status, llaveMala.cuerpo.codigo, llaveMala.m.subido], [503, 'CONFIGURACION', null]);
  const base = await llamar({ baseFalla: true });
  eq('la base contesta un error: 502 BASE_NO_CONTESTA y NADA va a Google (nada a medias)', [base.status, base.cuerpo.codigo, base.m.llamadas.filter(x => !x.url.startsWith(URL_BASE)).length], [502, 'BASE_NO_CONTESTA', 0]);
  const tok = await llamar({ tokenFalla: true });
  eq('Google no acepta la cuenta: 502 GOOGLE_AUTENTICACION y no se sube', [tok.status, tok.cuerpo.codigo, tok.m.subido], [502, 'GOOGLE_AUTENTICACION', null]);
  const cuota = await llamar({ cuota: true });
  eq('Drive dice storageQuotaExceeded: 502 DRIVE_NO_ACEPTO con la pista de la unidad compartida', [cuota.status, cuota.cuerpo.codigo, /unidad compartida/.test(cuota.cuerpo.mensaje)], [502, 'DRIVE_NO_ACEPTO', true]);
  const otro = await llamar({ otroDestino: 'https://evil.example/upload/drive/v3/files?upload_id=x' });
  eq('Drive devuelve una dirección de subida que no es de www.googleapis.com: no se le manda el archivo', [otro.status, otro.cuerpo.codigo, otro.m.subido, otro.m.llamadas.some(x => x.url.includes('evil'))], [502, 'DRIVE_NO_ACEPTO', null, false]);
  eq('direccionDeSubida: solo https://www.googleapis.com/upload/drive/v3/files…', ['https://www.googleapis.com/upload/drive/v3/files?x=1', 'http://www.googleapis.com/upload/drive/v3/files', 'https://www.googleapis.com.evil.example/upload/drive/v3/files', 'https://u:p@www.googleapis.com/upload/drive/v3/files', 'https://www.googleapis.com/otra'].map(R.direccionDeSubida).map(Boolean), [true, false, false, false, false]);
  eq('un cuerpo que no es JSON: DATO_INVALIDO; GET: 405; un origen de navegador ajeno: 403', [(await llamar({ cuerpo: '{no' })).cuerpo.codigo, (await manejar(new Request(URL_BASE + '/functions/v1/respaldo', { method: 'GET' }), { fetch: mundo().fetch, ahora: () => AHORA, entorno: entornoDe() })).status,
    (await manejar(new Request(URL_BASE + '/functions/v1/respaldo', { method: 'POST', headers: { origin: 'https://malo.example', [CABECERA_SECRETO]: SECRETO } }), { fetch: mundo().fetch, ahora: () => AHORA, entorno: entornoDe() })).status], ['DATO_INVALIDO', 405, 403]);
  const todo = registro.join('\n') + base.texto + tok.texto + cuota.texto;
  cierto('ningún secreto sale en una respuesta ni en el registro: ni el del respaldo, ni la llave privada, ni la llave secreta de Supabase (aunque la base la cite en un error)',
    !todo.includes(SECRETO) && !todo.includes(pkcs8.slice(0, 40)) && !todo.includes(SECRETA) && !todo.includes(TOKEN));
}

/* ============================================================================ */
seccion('4b. LA ROTACIÓN — se quedan los 8 más recientes, solo lo nuestro, solo después de subir bien');
{
  const MARCA = { al3d: 'respaldo' };
  const semana = k => R.nombreDeArchivo(AHORA - k * 7 * 86_400_000);
  const nuestros = n => Array.from({ length: n }, (_, i) => ({ id: 'viejo-' + String(i + 1).padStart(6, '0'), name: semana(i + 1), appProperties: MARCA }));
  const papelera = r => (r.m.papelera || []).map(x => x.id);

  const diez = await llamar({ carpeta: nuestros(10) });
  eq('10 viejos + el nuevo, conservar 8 (por omisión): los 3 más viejos van a la papelera, el nuevo y los 7 siguientes se quedan',
    [diez.status, diez.cuerpo.ok, diez.cuerpo.rotacion.conservar, papelera(diez)], [200, true, 8, ['viejo-000008', 'viejo-000009', 'viejo-000010']]);
  eq('…y la respuesta nombra lo que mandó a la papelera, sin error', [diez.cuerpo.rotacion.a_la_papelera, 'error' in diez.cuerpo.rotacion], [[semana(8), semana(9), semana(10)], false]);
  eq('a la papelera es un PATCH {trashed:true} con supportsAllDrives; ningún DELETE (se puede recuperar)',
    [diez.m.papelera[0].cuerpo, diez.m.papelera[0].params.supportsAllDrives, diez.m.llamadas.some(x => x.metodo === 'DELETE')], [{ trashed: true }, 'true', false]);
  eq('la lista pide solo lo de la carpeta, fuera de la papelera, con nombre de respaldo, en unidades compartidas',
    [diez.m.listas[0].q, diez.m.listas[0].supportsAllDrives, diez.m.listas[0].includeItemsFromAllDrives],
    ["'" + CARPETA + "' in parents and trashed = false and name contains 'al3d-respaldo-'", 'true', 'true']);

  const pocos = await llamar({ carpeta: nuestros(7) });
  eq('con 7 viejos + el nuevo (8 justos): nada a la papelera', [pocos.status, papelera(pocos), pocos.cuerpo.rotacion.a_la_papelera], [200, [], []]);

  const ajenos = [{ id: 'ajeno-000001', name: semana(30), appProperties: {} }, { id: 'ajeno-000002', name: semana(31) },
                  { id: 'ajeno-000003', name: 'al3d-respaldo-viejo-a-mano.json', appProperties: MARCA }, { id: 'ajeno-000004', name: 'notas.txt', appProperties: MARCA },
                  { id: 'ajeno-000005', name: semana(32), appProperties: { al3d: 'otra-cosa' } }];
  const mezcla = await llamar({ carpeta: [...nuestros(12), ...ajenos] });
  eq('lo que no creó la función NO se toca aunque sea viejo: sin marca, con otra marca, o con la marca pero otro nombre', papelera(mezcla).filter(id => id.startsWith('ajeno')), []);
  eq('…y de lo suyo, con 12 viejos, van los 5 más viejos', papelera(mezcla), ['viejo-000008', 'viejo-000009', 'viejo-000010', 'viejo-000011', 'viejo-000012']);

  const invisible = await llamar({ carpeta: nuestros(10), nuevoInvisible: true });
  eq('si Drive todavía no lista el archivo recién subido, cuenta igual como uno de los 8: quedan 7 viejos', papelera(invisible), ['viejo-000008', 'viejo-000009', 'viejo-000010']);

  const paginas = await llamar({ carpeta: nuestros(10), tamPagina: 4 });
  eq('la lista en varias páginas (nextPageToken) se lee entera', [paginas.m.listas.length, papelera(paginas)], [3, ['viejo-000008', 'viejo-000009', 'viejo-000010']]);

  const tres = await llamar({ carpeta: nuestros(10), entorno: { [VARIABLES.conservar]: '3' } });
  eq('RESPALDO_CONSERVAR=3: se queda el nuevo y los 2 más recientes', [tres.cuerpo.rotacion.conservar, papelera(tres).length, papelera(tres)[0]], [3, 8, 'viejo-000003']);
  const valores = ['', ' ', '1', '520', '0', '521', '-1', '2.5', 'ocho'];
  eq('leerConservar: vacío = 8; 1 y 520 valen; 0, 521, -1, 2.5 y «ocho» no', valores.map(t => { try { return R.leerConservar(t); } catch (e) { return e.clase; } }),
    [8, 8, 1, 520, 'conservar', 'conservar', 'conservar', 'conservar', 'conservar']);
  const malo = await llamar({ carpeta: nuestros(10), entorno: { [VARIABLES.conservar]: '0' } });
  eq('RESPALDO_CONSERVAR que no sirve: el respaldo SE SUBE igual (200) y la rotación no toca nada y lo dice',
    [malo.status, malo.cuerpo.archivo.id, papelera(malo), /RESPALDO_CONSERVAR/.test(malo.cuerpo.rotacion.error)], [200, 'archivo-falso-1', [], true]);

  const cuota = await llamar({ carpeta: nuestros(10), cuota: true });
  eq('si la subida falla, NI se lista NI se manda nada a la papelera', [cuota.status, cuota.m.listas, cuota.m.papelera], [502, undefined, undefined]);
  const base = await llamar({ carpeta: nuestros(10), baseFalla: true });
  eq('si la base falla, tampoco', [base.status, base.m.listas, base.m.papelera], [502, undefined, undefined]);
  const tok = await llamar({ carpeta: nuestros(10), tokenFalla: true });
  eq('si Google no da el token, tampoco', [tok.status, tok.m.listas, tok.m.papelera], [502, undefined, undefined]);
  const seco = await llamar({ carpeta: nuestros(10), cuerpo: '{"subir":false}' });
  eq('en seco ({subir:false}) no hay rotación', [seco.status, seco.m.listas, seco.m.papelera, 'rotacion' in seco.cuerpo], [200, undefined, undefined, false]);

  const lista = await llamar({ carpeta: nuestros(10), listaFalla: true });
  eq('si Drive no deja listar: 200 (el respaldo ya está arriba), nada a la papelera y el error dicho',
    [lista.status, lista.cuerpo.ok, papelera(lista), /listar/.test(lista.cuerpo.rotacion.error)], [200, true, [], true]);
  const unaFalla = await llamar({ carpeta: nuestros(10), papeleraFalla: ['viejo-000009'] });
  eq('si UNA no se deja mandar a la papelera, las demás sí, y el error la nombra', [unaFalla.status, unaFalla.cuerpo.rotacion.a_la_papelera, unaFalla.cuerpo.rotacion.error],
    [200, [semana(8), semana(10)], 'Drive no dejó mandar a la papelera: ' + semana(9) + '.']);
  eq('sobrantes(): el nuevo jamás sale, aunque su nombre fuera el más viejo; un id raro no se usa',
    [R.sobrantes(nuestros(3), 1, { id: 'viejo-000003', nombre: semana(3) }).map(a => a.id), R.direccionDeArchivo('../x'), R.direccionDeArchivo('viejo-000001')],
    [['viejo-000001', 'viejo-000002'], null, 'https://www.googleapis.com/drive/v3/files/viejo-000001?supportsAllDrives=true&fields=id,trashed']);
}

/* ============================================================================ */
seccion('5. EL FLUJO SEMANAL, LA CONFIGURACIÓN Y LOS ARCHIVOS');
{
  const y = leer('.github', 'workflows', 'respaldo-semanal.yml');
  cierto('una vez por semana (cron con día de la semana) y a mano (workflow_dispatch)', /cron:\s*'\d+ \d+ \* \* [0-6]'/.test(y) && /workflow_dispatch:/.test(y));
  cierto('apagado por defecto: sin RESPALDO_URL_FUNCION o sin el secreto, avisa y termina con 0 ANTES de llamar a nada', /if \[ -z "\$URL_FUNCION" \] \|\| \[ -z "\$SECRETO" \]; then[\s\S]*?exit 0[\s\S]*?fi[\s\S]*curl/.test(y));
  cierto('la dirección solo puede ser una función respaldo de supabase.co', /https:\/\/\*\.supabase\.co\/functions\/v1\/respaldo\)/.test(y));
  cierto('el secreto llega de secrets y la URL de vars; las credenciales de Google y la llave secreta NO entran al flujo', y.includes('${{ secrets.RESPALDO_SECRETO_FUNCION }}') && y.includes('${{ vars.RESPALDO_URL_FUNCION }}') &&
    !/RESPALDO_GOOGLE_CREDENCIALES\s*:|SERVICE_ROLE|sb_secret_/.test(y.replace(/^#.*$/gm, '')));
  cierto('sin permisos del repositorio (permissions: {}) y sin imprimir la respuesta entera', /^permissions: \{\}$/m.test(y) && /jq -c/.test(y) && !/cat respuesta\.json/.test(y));
  /* El guion del flujo, corrido de verdad con sh sin la variable: no llama a nada. */
  const paso = /run: \|\n([\s\S]*)$/.exec(y)[1].split('\n').map(l => l.replace(/^ {10}/, '')).join('\n');
  const sh = spawnSync('sh', ['-c', paso], { encoding: 'utf8', env: { PATH: process.env.PATH, URL_FUNCION: '', SECRETO: '' } });
  if (sh.error) console.log('  · no hay `sh` para correr el guion del flujo: se queda en la comprobación de texto');
  else eq('el guion del flujo, corrido con sh y sin variables: sale con 0 y dice que está apagado', [sh.status, /apagado/.test(sh.stdout)], [0, true]);
  const conMala = spawnSync('sh', ['-c', paso], { encoding: 'utf8', env: { PATH: process.env.PATH, URL_FUNCION: 'https://evil.example/x', SECRETO: 'x'.repeat(40) } });
  if (!conMala.error) eq('  …y con una dirección que no es de supabase.co, no llama y falla', [conMala.status, /no se llama/.test(conMala.stdout)], [1, true]);

  cierto('config.toml: [functions.respaldo] con verify_jwt = false (la protege su secreto, como a espejo)', /\[functions\.respaldo\]\s*\r?\n\s*verify_jwt\s*=\s*false/.test(leer('supabase', 'config.toml')));
  const readme = leer('supabase', 'README.md');
  cierto('supabase/README.md nombra los tres secretos nuevos y la variable de la rotación', ['RESPALDO_GOOGLE_CREDENCIALES', 'RESPALDO_CARPETA_DRIVE', 'RESPALDO_SECRETO_FUNCION', 'RESPALDO_CONSERVAR'].every(n => readme.includes(n)));
  for (const f of ['supabase/functions/respaldo/handler.js', 'supabase/functions/_shared/respaldo.js']) {
    const t = leer(...f.split('/')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    cierto(f + ': sin Deno, process, Buffer, require ni node:', !/\bDeno\b|\bprocess\.|\bBuffer\b|\brequire\(|from 'node:/.test(t));
  }
  const idx = leer('supabase', 'functions', 'respaldo', 'index.ts');
  cierto('index.ts: solo Deno.serve, Deno.env, el fetch y el reloj; ninguna regla ni nombre de variable', /Deno\.serve/.test(idx) && idx.split('\n').length < 20 && !/RESPALDO_|drive/i.test(idx.replace(/^\/\/.*$/gm, '')));
}

/* ============================================================================ */
seccion('6. DENO');
{
  let deno = null;
  for (const c of [process.env.AL3D_DENO, 'deno'].filter(Boolean)) { const r = spawnSync(c, ['--version'], { encoding: 'utf8' }); if (!r.error && r.status === 0) { deno = c; break; } }
  if (!deno) console.log('  · NO VERIFICADO: no hay `deno` en el PATH (ni AL3D_DENO): no se corrió «deno check» de respaldo/index.ts ni de autorizar/index.ts');
  else {
    const archivos = ['supabase/functions/respaldo/index.ts', 'supabase/functions/autorizar/index.ts'].map(f => pathToFileURL(join(RAIZ, f)).href);
    const r = spawnSync(deno, ['check', ...archivos], { encoding: 'utf8', timeout: 240000 });
    if (r.status === 0) bien('deno check de respaldo/index.ts y autorizar/index.ts');
    else if (/error sending request|dns error|ENOTFOUND|failed to lookup/i.test((r.stdout || '') + (r.stderr || ''))) console.log('  · deno check SALTADO: sin red para bajar npm:@supabase/supabase-js');
    else mal('deno check falló:\n' + recortar((r.stdout || '') + (r.stderr || ''), 1500));
  }
}

console.log('\n' + (fallos ? fallos + ' FALLO(S) de ' + (pasan + fallos) + ' comprobaciones' : 'Todo pasa. ' + pasan + ' comprobaciones.'));
process.exit(fallos ? 1 : 0);
