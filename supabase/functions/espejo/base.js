/* ============================================================================
   BASE DE LA FUNCIÓN `espejo` — lo que se le pide a la base de datos, con la llave de SERVICIO.

   Es el «puerto» de la base para esta función (como `crearClienteBase` de _shared/cliente.js lo es
   para las demás): el manejador no sabe cómo se habla con la base, recibe `deps.base` con cuatro
   operaciones, y aquí está cómo se arman sobre PostgREST. Las pruebas le ponen un puerto de
   mentiras al manejador, y a ESTE archivo le ponen un `fetch` de mentiras que se porta como
   PostgREST (pruebas/supabase-espejo.mjs).

   Habla PostgREST con `fetch` y no con supabase-js a propósito: son cuatro consultas, las direcciones
   quedan a la vista (y se prueban), y el cursor depende de detalles que un envoltorio escondería
   (el orden `updated_at, id`, el `or=(…)` y que el texto de la hora NO pase por un Date).

   LAS CUATRO OPERACIONES
     leerCursores()                    → { [clave]: { texto, updated_at } } de las filas de `contadores` del
                                         espejo (`empresa_id = '*'`, `ventana = ''`).
     guardarCursor(clave, texto)       → upsert de esa fila. `updated_at` lo pone la base (trigger).
     leerPagina(flujo, pos, limite)    → hasta `limite` filas de la vista del flujo, ordenadas por `(ts, id)`.
     leerAbonosDeFolios(folios)        → TODOS los abonos de esos folios, por `id`, de 500 en 500 (PostgREST corta
                                         en silencio en `max_rows`, 1000 de fábrica: la paginación lo evita).

   Cada llamada de red tiene tope de tiempo: sin él, una base que no contesta deja la función colgada hasta que
   la plataforma la corta. Un error de la base LANZA `ErrorDeBase` —con el estado y el código de PostgREST, sin el
   cuerpo entero— y el manejador lo cuenta como «la base no contestó».

   LA LLAVE. Se lee del entorno (entorno.js) la primera vez que hace falta. Con las llaves nuevas
   (`sb_secret_…`, que no son JWT) va solo en `apikey`; con la antigua (un JWT) va también en `Authorization`.
   NO CONFIRMADO contra el servicio real (no hay proyecto de producción): es lo que dice la documentación de
   llaves de Supabase, y es lo primero que hay que mirar si la función contesta 401.
   ============================================================================ */

import { leerSupabaseServicio } from '../_shared/entorno.js';
import {
  FLUJOS, CLAVE_COMPLETO, CLAVE_RECHAZADAS, CLAVE_CORRIDA, consultaDePagina, consultaDeAbonosDeFolios,
} from '../_shared/espejo.js';

export const ESPERA_BASE_MS = 15_000;
const PAGINA_ABONOS = 500;

/** Un error de la base: estado HTTP y código de PostgREST; nunca el cuerpo completo ni la llave. */
export class ErrorDeBase extends Error {
  constructor(mensaje, { status = 0, codigo = '' } = {}) {
    super(mensaje);
    this.name = 'ErrorDeBase';
    this.status = status;
    this.codigo = codigo;
  }
}
export const esErrorDeBase = e => !!e && e.name === 'ErrorDeBase';

/** Las claves de `contadores` que son de esta función. */
export const CLAVES_DEL_ESPEJO = Object.freeze([
  ...Object.values(FLUJOS).map(f => f.clave), CLAVE_COMPLETO, CLAVE_RECHAZADAS, CLAVE_CORRIDA,
]);

/**
 * @param {{ entorno: function(string):(string|undefined), fetch: function, empresa?: string, esperaMs?: number }} o
 */
export function crearBaseEspejo({ entorno, fetch: fetchBase, empresa = 'al3d', esperaMs = ESPERA_BASE_MS } = {}) {
  if (typeof entorno !== 'function') throw new TypeError('crearBaseEspejo: falta el lector del entorno.');
  if (typeof fetchBase !== 'function') throw new TypeError('crearBaseEspejo: falta el fetch de la plataforma.');
  let credencial = null;

  const cabeceras = (extra = {}) => {
    if (!credencial) credencial = leerSupabaseServicio(entorno);          // lanza ErrorDeEntorno si falta algo
    const h = { apikey: credencial.llave, Accept: 'application/json', ...extra };
    if (!/^sb_/i.test(credencial.llave)) h.Authorization = 'Bearer ' + credencial.llave;
    return h;
  };

  async function pedir(ruta, { metodo = 'GET', cuerpo, extra } = {}) {
    const cab = cabeceras(extra);                                          // también lee la dirección
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), esperaMs);
    let res;
    try {
      res = await fetchBase(credencial.url + '/rest/v1/' + ruta, {
        method: metodo, headers: cab, signal: ctrl.signal, ...(cuerpo !== undefined ? { body: cuerpo } : {}),
      });
    } catch (e) {
      throw new ErrorDeBase('La base no contestó: ' + String((e && e.message) || e).slice(0, 120));
    } finally { clearTimeout(reloj); }
    const texto = await res.text();
    if (!res.ok) {
      let codigo = '';
      try { codigo = String(JSON.parse(texto).code || ''); } catch (_) { /* un error que no es JSON */ }
      throw new ErrorDeBase('La base contestó ' + res.status + (codigo ? ' (' + codigo + ')' : ''), { status: res.status, codigo });
    }
    if (!texto) return null;
    try { return JSON.parse(texto); }
    catch (_) { throw new ErrorDeBase('La base contestó algo que no es JSON.', { status: res.status }); }
  }

  const codificar = encodeURIComponent;

  return {
    empresa,

    async leerCursores() {
      const filas = await pedir('contadores?select=empresa_id,clave,ventana,texto,updated_at&clave=in.(' + CLAVES_DEL_ESPEJO.map(codificar).join(',') + ')');
      const out = {};
      for (const f of filas || []) {
        if (f.empresa_id === '*' && f.ventana === '') out[f.clave] = { texto: f.texto ?? '', updated_at: f.updated_at ?? null };
      }
      return out;
    },

    async guardarCursor(clave, texto) {
      await pedir('contadores?on_conflict=empresa_id,clave,ventana', {
        metodo: 'POST',
        cuerpo: JSON.stringify([{ empresa_id: '*', clave, ventana: '', texto: String(texto ?? '') }]),
        extra: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
    },

    async leerPagina(flujo, pos, limite) {
      const f = typeof flujo === 'string' ? FLUJOS[flujo] : flujo;
      const filas = await pedir(f.vista + '?' + consultaDePagina(f, pos, { empresa, limite }));
      return Array.isArray(filas) ? filas : [];
    },

    async leerAbonosDeFolios(folios) {
      if (!folios.length) return [];
      const todas = [];
      let despuesDe = null;
      /* Se pide hasta que llega una página VACÍA, no hasta que llega una más corta que el límite: si el servidor
         tiene un `max_rows` menor que la página (se cambia en el panel de la API), una página «corta» no es la
         última, y tomarla por la última dejaría al folio con menos abonos de los que tiene. Esta lista se manda a
         la hoja como «los abonos COMPLETOS del folio» y lo que no venga en ella se deja en blanco allá. */
      for (;;) {
        const filas = await pedir('espejo_abonos?' + consultaDeAbonosDeFolios(folios, { empresa, limite: PAGINA_ABONOS, despuesDe }));
        if (!Array.isArray(filas) || !filas.length) break;
        const ultimo = Number(filas[filas.length - 1].id);
        if (!Number.isFinite(ultimo) || (despuesDe !== null && ultimo <= despuesDe)) {
          throw new ErrorDeBase('La base no devolvió los abonos en orden de id: se corta en vez de repetir páginas.');
        }
        todas.push(...filas);
        despuesDe = ultimo;
      }
      return todas;
    },
  };
}
