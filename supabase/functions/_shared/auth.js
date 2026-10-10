/* ============================================================================
   AUTH — quién llama a una función que pide sesión (ia, maps), verificado EN CÓDIGO.

   Por qué en código y no en la plataforma. Las llaves nuevas de Supabase (sb_publishable_ y
   sb_secret_) no son JWT, y la comprobación automática de la plataforma (verify_jwt) trata de
   leer como JWT lo que llega en `Authorization`. Con las llaves nuevas la documentación manda
   poner `verify_jwt = false` y comprobar a quien llama en el código de la función: eso hace
   config.toml en las cuatro, y esto es esa comprobación.

   Qué se comprueba, y en este orden (cada paso es una vuelta a Supabase y ninguno se salta):
     1. `Authorization: Bearer <jwt>` con forma de JWT (tres tramos). Una llave nueva ahí NO es un
        JWT y no pasa. Sin eso: 401 SIN_SESION, sin tocar la red.
     2. `auth.getUser(jwt)` con el cliente de la llave PÚBLICA: lo contesta el servidor de Auth, no
        esta función. Vencido, firmado por otro, de una sesión cerrada: 401 SIN_SESION.
     3. `mi_acceso` con ESE JWT (la base lo evalúa como la persona, con auth.uid()): la membresía
        tiene que estar activa. `sin_acceso` → 403 SIN_ACCESO; `acceso_revocado` → 403
        ACCESO_REVOCADO. Ninguna de las dos es «definitiva» para el cliente (ver sobreDeError).

   LA REGLA QUE MÁS IMPORTA DE ESTE ARCHIVO: «acceso_revocado» es la señal con la que el teléfono
   borra sus datos locales (decisión Q-09). Solo sale cuando la BASE lo dice con todas sus
   letras (mi_acceso → estado 'acceso_revocado', que viene de una fila `baja`). Una base que no
   contesta, un error de PostgREST, un estado que esta versión no conoce, un id que no coincide,
   una red caída: todo eso es 503 (transitorio, o de configuración), JAMÁS 401/403 ni
   ACCESO_REVOCADO. Un falso «fuera» ya cerró una sesión de verdad una vez.

   `exigirAcceso` no escribe la respuesta: devuelve { ok:false, status, cuerpo, motivo, alerta }
   y quien llama la manda con sus cabeceras CORS. `alerta` es «que alguien lo mire» (lo que no es
   culpa de quien llamó). Es el mismo estilo de verificar.js.
   ============================================================================ */

import { sobreDeError, textoDeError } from './http.js';
import { esErrorDeEntorno } from './entorno.js';

/* Tres tramos de base64url, y un tope: los JWT de usuario miden de 1 a 3 KB. */
const MAX_JWT = 8192;
const RE_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/* El JWT de `Authorization: Bearer …`, o null si no hay o no tiene forma de JWT. */
export function jwtDe(peticion) {
  const h = peticion.headers.get('authorization');
  if (typeof h !== 'string') return null;
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(h);
  if (!m || m[1].length > MAX_JWT || !RE_JWT.test(m[1])) return null;
  return m[1];
}

const fallo = (status, codigo, mensaje, motivo, extra, alerta) =>
  ({ ok: false, status, cuerpo: sobreDeError(codigo, mensaje, extra), motivo, alerta: !!alerta });

const SIN_SESION = motivo => fallo(401, 'SIN_SESION', 'No hay sesión. Entra con tu cuenta de Google.', motivo);
const SIN_ACCESO = (motivo, extra) =>
  fallo(403, 'SIN_ACCESO', 'Esta cuenta no tiene acceso. Pídele a Dirección que te agregue.', motivo, extra);
const ACCESO_REVOCADO = () =>
  fallo(403, 'ACCESO_REVOCADO', 'Tu acceso a esta empresa ya no está activo.', 'acceso_revocado');
/* Lo transitorio: ni una cosa ni la otra. La app reintenta y no cierra la sesión ni borra nada. */
const TRANSITORIO = (motivo, alerta) =>
  fallo(503, 'SIN_RED', 'No se pudo confirmar tu sesión. Vuelve a intentarlo en un momento.', motivo, { transitorio: true }, alerta);
/* Lo que está mal puesto del lado de la función (variables que faltan, migraciones sin aplicar). Se
   contesta SIN nombrar variables: todavía no se sabe quién llama. Los nombres van al registro. */
const CONFIGURACION = (motivo, detalle) => ({
  ...fallo(503, 'CONFIGURACION', 'La función no está configurada por completo. Avisa a Dirección.', motivo, undefined, true), detalle });
const INESPERADO = (motivo, detalle) => ({
  ...fallo(503, 'DESCONOCIDO', 'No se pudo confirmar tu acceso. Vuelve a intentarlo en un momento.', motivo, { transitorio: true }, true), detalle });

/* Una excepción al hablar con Supabase: lo que falta de configuración se dice como tal, lo demás
   es red. */
function deExcepcion(e, motivo) {
  if (esErrorDeEntorno(e)) return CONFIGURACION('entorno', e.message);
  return { ...TRANSITORIO(motivo, true), detalle: textoDeError(e) };
}

/* Lo que contestó Auth cuando `getUser` falla. Un error de la RED o un 5xx/429 de Auth (el cliente
   los llama AuthRetryableFetchError, o no traen estado) no dicen nada de la persona: transitorio.
   Un 4xx sí: el JWT no sirve (mal firmado, vencido, de una sesión que ya se cerró). */
function deAuth(error) {
  const estado = Number(error.status);
  const sinEstado = !Number.isFinite(estado) || estado === 0;
  if (error.name === 'AuthRetryableFetchError' || sinEstado || estado >= 500 || estado === 429 || estado === 408) {
    return { ...TRANSITORIO('auth_no_contesta', true), detalle: textoDeError(error) };
  }
  return SIN_SESION('jwt_rechazado');
}

/* Lo que contestó PostgREST cuando `mi_acceso` falla. 401 y los PGRST301-303 son «ese JWT no me
   sirve»; PGRST300 (sin secreto de JWT en el servidor), 42501 (sin permiso para ejecutarla) y
   PGRST202 (la función no existe: falta la migración) son de configuración; lo demás, red. */
function deRpc(r) {
  const e = r.error, estado = Number(r.status), codigo = String(e.code || '');
  if (estado === 401 || /^PGRST30[123]$/.test(codigo)) return SIN_SESION('jwt_rechazado_por_la_base');
  if (codigo === 'PGRST300' || codigo === '42501' || codigo === 'PGRST202' || estado === 404) {
    return CONFIGURACION('mi_acceso_no_disponible', 'mi_acceso: ' + codigo + ' ' + textoDeError(e));
  }
  return { ...TRANSITORIO('mi_acceso_error', true), detalle: codigo + ' ' + textoDeError(e) };
}

/**
 * Quién llama, con acceso activo, o por qué no.
 *
 * @param {Request} peticion
 * @param {{clienteBase:{usuarioDe:Function, rpcUsuario:Function}}} deps  `clienteBase` es el de cliente.js
 * @param {{areas?:string[]}} [opciones]  `areas`: si se da, además se exige una membresía ACTIVA en
 *   alguna de esas áreas (403 ROL_SIN_PERMISO si no). Las funciones de ia y maps no la usan: les
 *   basta con que sea de la casa.
 * @returns {Promise<{ok:true, usuario:{id:string, correo:string|null}, acceso:object, jwt:string}
 *   | {ok:false, status:number, cuerpo:object, motivo:string, alerta:boolean, detalle?:string}>}
 */
export async function exigirAcceso(peticion, deps, opciones) {
  const jwt = jwtDe(peticion);
  if (!jwt) return SIN_SESION('sin_bearer');
  const base = deps && deps.clienteBase;
  if (!base || typeof base.usuarioDe !== 'function' || typeof base.rpcUsuario !== 'function') {
    return INESPERADO('sin_clienteBase', 'deps.clienteBase no trae usuarioDe y rpcUsuario.');
  }

  /* 1. ¿Es un JWT vivo? Lo contesta Auth. */
  let u;
  try { u = await base.usuarioDe(jwt); } catch (e) { return deExcepcion(e, 'auth_excepcion'); }
  if (!u || typeof u !== 'object') return INESPERADO('auth_vacio', 'getUser no devolvió nada.');
  if (u.error) return deAuth(u.error);
  const user = u && u.data && u.data.user;
  if (!user || typeof user.id !== 'string' || user.id === '') return SIN_SESION('sin_usuario');

  /* 2. ¿Tiene acceso activo? Lo contesta la base, con el JWT de la persona. */
  let r;
  try { r = await base.rpcUsuario(jwt, 'mi_acceso', {}); } catch (e) { return deExcepcion(e, 'mi_acceso_excepcion'); }
  if (!r) return INESPERADO('mi_acceso_vacio', 'mi_acceso no devolvió nada.');
  if (r.error) return deRpc(r);
  const d = r.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return INESPERADO('mi_acceso_forma', 'mi_acceso devolvió algo que no es un objeto.');
  if (d.ok === false && d.codigo === 'SIN_SESION') return SIN_SESION('mi_acceso_sin_sesion');
  if (d.ok !== true) return INESPERADO('mi_acceso_no_ok', 'mi_acceso contestó ok:false con el código «' + String(d.codigo) + '».');
  /* El JWT que validó Auth y el que evaluó la base tienen que ser de la misma persona. Si no
     coinciden, algo está mal armado, y no se concede ni se niega: se dice. */
  if (d.usuario && d.usuario.id && d.usuario.id !== user.id) return INESPERADO('usuario_distinto', 'mi_acceso habla de otra persona que getUser.');

  switch (d.estado) {
    case 'activo': break;
    case 'acceso_revocado': return ACCESO_REVOCADO();
    case 'invitacion_pendiente': return SIN_ACCESO('invitacion_pendiente', { estado: 'invitacion_pendiente' });
    case 'sin_acceso': return SIN_ACCESO('sin_acceso');
    /* Un estado que esta versión no conoce no se adivina: ni da acceso ni lo quita. */
    default: return INESPERADO('estado_desconocido', 'mi_acceso devolvió un estado que no conozco.');
  }

  const areas = opciones && opciones.areas;
  if (Array.isArray(areas)) {
    const empresas = Array.isArray(d.empresas) ? d.empresas : [];
    if (!empresas.some(e => e && e.estado === 'activo' && areas.includes(e.area))) {
      return fallo(403, 'ROL_SIN_PERMISO', 'Tu área no puede hacer esto.', 'area_sin_permiso');
    }
  }
  const correo = (d.usuario && d.usuario.correo) || user.email || null;
  return { ok: true, usuario: { id: user.id, correo: typeof correo === 'string' ? correo : null }, acceso: d, jwt };
}
