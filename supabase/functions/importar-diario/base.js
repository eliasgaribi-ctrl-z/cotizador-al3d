/* ============================================================================
   LA BASE DE `importar-diario` — postgres.js sobre la conexión que Supabase inyecta (SUPABASE_DB_URL).

   Es lo único de la función que habla con Postgres de verdad, y es delgado a propósito: abre UNA
   conexión por petición, corre todo dentro de `sql.begin` (una transacción) y la cierra al terminar.
   Las reglas viven en copia.js, que solo ve { transaccion(fn) } y se prueba con PGlite y con dobles.

   Por qué así:
     · `prepare: false`. SUPABASE_DB_URL puede apuntar al «pooler» en modo transacción, que no admite
       sentencias preparadas con nombre. Dentro de una transacción el pooler deja la MISMA conexión de
       principio a fin, así que las tablas temporales del importador (_lote, _imp_cambios) y el candado
       (pg_try_advisory_xact_lock) funcionan; copia.js las borra antes de confirmar.
     · `ejecutar(texto)` sin parámetros va por el protocolo simple de Postgres: acepta las muchas
       sentencias seguidas que escribe sqlDeImportacion. `consultar(texto, params)` con parámetros va
       por el extendido, una sola sentencia.
     · `onnotice` mudo: el importador hace `drop table if exists`, y Postgres avisa «no existe» cada vez.
   ============================================================================ */

/**
 * @param {function} postgres  el `postgres` de npm:postgres (se pasa desde index.ts; aquí no se importa nada de Deno ni de npm)
 * @param {string} url         SUPABASE_DB_URL
 */
export function basePostgres(postgres, url) {
  const sql = postgres(url, {
    prepare: false, max: 1, idle_timeout: 5, connect_timeout: 15, onnotice: () => {},
    connection: { application_name: 'importar-diario' },
  });
  return {
    transaccion: fn => sql.begin(tx => fn({
      ejecutar: async texto => { await tx.unsafe(texto); },
      consultar: async (texto, params) => Array.from(await (params && params.length ? tx.unsafe(texto, params) : tx.unsafe(texto))),
    })),
    cerrar: () => sql.end({ timeout: 5 }),
  };
}
