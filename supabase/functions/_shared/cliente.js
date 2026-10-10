/* ============================================================================
   CLIENTE — el único lugar donde las funciones tocan @supabase/supabase-js.

   Los manejadores (handler.js) no importan supabase-js ni conocen su forma: reciben un «puerto»
   (`deps.clienteBase`) con cuatro operaciones, y este archivo lo arma sobre el cliente de verdad.
   Así los manejadores se prueban en node con un puerto de mentiras, y lo único que corre contra
   la forma de supabase-js —sus resultados { data, error, status }, sus errores— está aquí, en
   treinta líneas que las pruebas de Deno recorren con el cliente real contra un Supabase de
   mentiras (pruebas/supabase-funciones.mjs).

   EL PUERTO (todo devuelve { data, error, status }; `error` es null o { message, code, status,
   name }, y nunca lanza por un error de la base: lanza la red, y quien llama lo trata como red):
     usuarioDe(jwt)               auth.getUser(jwt), con la llave PÚBLICA. { data: { user }, error }.
                                  Lo contesta el servidor de Auth.
     rpcUsuario(jwt, nombre, args)  una RPC con la llave pública y el JWT de la persona en
                                  `Authorization`: la base la evalúa COMO LA PERSONA (auth.uid()).
                                  Es como se llama mi_acceso.
     rpcServicio(nombre, args)    una RPC con la llave SECRETA (rol service_role). Es como se llaman
                                  las RPC que solo son de las funciones: verificar_cupo,
                                  autorizacion_para_verificar, ia_cuota, ia_turno.
     leerMinimo()                 la lectura mínima de /salud?db=1: un `select id … limit 1` de
                                  `empresas` con la llave secreta. NO devuelve ni una fila: solo si
                                  la base contestó. (Que no vuelva dato de negocio es el punto.)

   Las llaves se leen del entorno (entorno.js) la PRIMERA vez que hace falta cada una, no al
   arrancar: una función a la que le falta una variable tiene que poder contestar un error con sus
   cabeceras CORS, no caerse al cargar. Los clientes de la función (el de la llave pública, para
   Auth, y el de la secreta) se arman una vez por instancia, sin sesión: nada que guardar, nada que
   renovar y ninguna sesión que buscar en una URL (no hay página). El de una persona se arma por
   petición, porque lleva SU JWT.

   Cada llamada de red tiene un tope de tiempo (ESPERA_BASE_MS): sin él, una base que no contesta
   deja la función colgada hasta que la plataforma la corte, a los 150 s.

   NO usa `@supabase/server` ni `withSupabase`: el diseño pide supabase-js 2 con la verificación
   escrita a mano (auth.js), que es lo que se puede probar y lo que no cambia con un SDK nuevo.
   Alternativa si la latencia pesara: verificar el JWT en local con SUPABASE_JWKS en vez de
   preguntarle a Auth en cada petición.
   ============================================================================ */

import { leerSupabasePublico, leerSupabaseServicio } from './entorno.js';

export const ESPERA_BASE_MS = 15000;

/* Sin sesión: estas funciones atienden una petición y se acaban, no hay dónde guardar nada ni a
   quién renovarle un token. */
const SIN_SESION = Object.freeze({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });

/* El fetch con un tope de tiempo. Si quien llama ya trae su señal (supabase-js la usa para cancelar),
   se respeta: cualquiera de las dos corta. */
function conTope(fetchBase, esperaMs) {
  return async (entrada, init) => {
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), esperaMs);
    const suya = init && init.signal;
    if (suya) {
      if (suya.aborted) ctrl.abort();
      else suya.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
    try { return await fetchBase(entrada, { ...(init || {}), signal: ctrl.signal }); }
    finally { clearTimeout(reloj); }
  };
}

/* El error de supabase-js (PostgrestError, AuthError…) sin lo que no hace falta: mensaje, código,
   estado y nombre de la clase. Es lo único que viaja de aquí a los manejadores. */
function simple(e) {
  if (!e) return null;
  return { message: String(e.message || ''), code: e.code === undefined ? undefined : String(e.code),
           status: e.status === undefined ? undefined : Number(e.status), name: String(e.name || '') };
}
const resultado = r => ({ data: r.data === undefined ? null : r.data, error: simple(r.error), status: r.status });

/**
 * @param {{createClient:Function, entorno:Function, fetch:Function, esperaMs?:number}} o
 *   `createClient` es el de `npm:@supabase/supabase-js@2`, `entorno` el lector de variables y
 *   `fetch` el de la plataforma: los tres los pasa cada index.ts, porque este archivo no toca
 *   nada del mundo por su cuenta.
 */
export function crearClienteBase({ createClient, entorno, fetch: fetchBase, esperaMs } = {}) {
  if (typeof createClient !== 'function') throw new TypeError('crearClienteBase: falta createClient (el de npm:@supabase/supabase-js@2).');
  if (typeof entorno !== 'function') throw new TypeError('crearClienteBase: falta el lector del entorno.');
  if (typeof fetchBase !== 'function') throw new TypeError('crearClienteBase: falta el fetch de la plataforma.');
  const salida = conTope(fetchBase, esperaMs || ESPERA_BASE_MS);
  const opciones = cabeceras => ({ auth: SIN_SESION, global: { fetch: salida, ...(cabeceras ? { headers: cabeceras } : {}) } });

  let publico = null, servicio = null;
  const clientePublico = () => {
    if (!publico) { const c = leerSupabasePublico(entorno); publico = createClient(c.url, c.llave, opciones()); }
    return publico;
  };
  const clienteServicio = () => {
    if (!servicio) { const c = leerSupabaseServicio(entorno); servicio = createClient(c.url, c.llave, opciones()); }
    return servicio;
  };
  const comoUsuario = jwt => {
    const c = leerSupabasePublico(entorno);
    return createClient(c.url, c.llave, opciones({ Authorization: 'Bearer ' + jwt }));
  };

  return {
    async usuarioDe(jwt) {
      const r = await clientePublico().auth.getUser(jwt);
      return { data: r.data || { user: null }, error: simple(r.error) };
    },
    async rpcUsuario(jwt, nombre, args) {
      return resultado(await comoUsuario(jwt).rpc(nombre, args || {}));
    },
    async rpcServicio(nombre, args) {
      return resultado(await clienteServicio().rpc(nombre, args || {}));
    },
    async leerMinimo() {
      const r = await clienteServicio().from('empresas').select('id').limit(1);
      return { data: null, error: simple(r.error), status: r.status };
    },
  };
}
