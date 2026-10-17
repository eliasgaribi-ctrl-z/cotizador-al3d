/* ============================================================================
   EL RESPALDO SEMANAL, POR `importar-diario` — la base entera, en un JSON, para quien tiene IMPORTAR_SECRETO.

   Decidido el 2026-10-17 para que Elías no tenga que mover secretos (DECISIONES-SUPABASE.md, Q-20): el respaldo
   ya no lo sube la función `respaldo` con una cuenta de servicio de Google (credenciales que Elías tendría que
   crear y cargar). Lo PIDE el Apps Script de la hoja (puente/copia-diaria.gs, `respaldarSemanal`, los domingos de
   madrugada) a esta función, con el MISMO secreto de la copia diaria, y lo guarda él en Drive con el permiso que
   la hoja ya tiene. La función `respaldo` se queda como alternativa, apagada.

   Por qué aquí y no en la función `respaldo`: es la que ya está desplegada, ya tiene la base (SUPABASE_DB_URL) y ya
   confía en IMPORTAR_SECRETO para ESCRIBIR toda la base; leerla con el mismo secreto no agranda a quién se le cree.
   Y es un solo archivo que pegar en el panel, en vez de dos.

   QUÉ SE GUARDA: el mismo archivo que arma la función `respaldo` (formato «al3d-respaldo-1»: formato, creado,
   origen, filas, tablas; las 18 tablas de TABLAS, cada una en el orden de su llave primaria), pero leído en UNA
   transacción de solo lectura con REPEATABLE READ: es una FOTO exacta de un instante (la de PostgREST no lo era).
   Cada tabla la escribe Postgres como texto JSON (json_agg), y aquí solo se pega: la función no vuelve a parsear
   ni a escribir las filas (lo que más CPU costaría).

   EL TAMAÑO: UrlFetchApp no recibe respuestas de más de 50 MB y un Blob de Apps Script tampoco pasa de 50 MB.
   Arriba de TOPE_RESPALDO (45 MB) se contesta 413 RESPALDO_GRANDE y no se manda nada: ese día toca la alternativa
   de la cuenta de servicio. Hoy la base anda en cientos de KB.

   El respaldo lleva datos de clientes: no va al registro de la función (solo bytes y cuentas).
   ============================================================================ */

import { TABLAS, FORMATO, nombreDeArchivo } from '../_shared/respaldo.js';

export const PEDIDO = 'al3d-pedir-respaldo';
export const TOPE_RESPALDO = 45 * 1024 * 1024;
export const TIEMPO_RESPALDO = '60s';
export const MODO_LECTURA = 'set transaction isolation level repeatable read, read only';

export class RespaldoGrande extends Error {
  constructor() { super('El respaldo pasa del tope.'); this.name = 'RespaldoGrande'; }
}

/** ¿El cuerpo es un pedido de respaldo (y no un volcado)? */
export const esPedidoDeRespaldo = v => !!v && typeof v === 'object' && !Array.isArray(v) && v.formato === PEDIDO && v.version === 1;

/* Los nombres de tabla y de columna salen de TABLAS (constantes del repositorio), nunca de quien llama. */
const RE_IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
export function consultaDeTabla(t) {
  const cols = t.orden.split(',');
  if (!RE_IDENT.test(t.nombre) || !cols.every(c => RE_IDENT.test(c))) throw new Error('nombre de tabla o columna no válido');
  return `select coalesce(json_agg(x order by ${cols.map(c => 'x.' + c).join(', ')}), '[]'::json)::text as filas, count(*)::int as n from public.${t.nombre} x`;
}

/**
 * Lee las 18 tablas en una transacción de solo lectura (repeatable read). Devuelve { partes, filas } donde cada parte es
 * '"tabla":[…]' tal como la escribió Postgres. Lanza RespaldoGrande si se pasa de `tope` (antes de juntar más).
 * @param {{transaccion: function}} base   la misma de la copia (base.js o PGlite)
 */
export async function exportar(base, { tope = TOPE_RESPALDO } = {}) {
  return base.transaccion(async tx => {
    await tx.ejecutar(MODO_LECTURA);
    await tx.ejecutar(`set local statement_timeout = '${TIEMPO_RESPALDO}'`);
    const partes = [], filas = {};
    let largo = 0;
    for (const t of TABLAS) {
      const r = await tx.consultar(consultaDeTabla(t));
      const texto = String((r && r[0] && r[0].filas) || '[]');
      filas[t.nombre] = Number(r && r[0] && r[0].n) || 0;
      largo += texto.length;                      // en unidades de texto: los bytes son eso o más, así que corta a tiempo
      if (largo > tope) throw new RespaldoGrande();
      partes.push(JSON.stringify(t.nombre) + ':' + texto);
    }
    return { partes, filas };
  });
}

/** El archivo, con las llaves en el orden de armarArchivo de _shared/respaldo.js. `origen`: solo el host del proyecto. */
export function armarContenido({ partes, filas, ahoraMs, origen }) {
  return '{"formato":' + JSON.stringify(FORMATO) + ',"creado":' + JSON.stringify(new Date(ahoraMs).toISOString()) +
    ',"origen":' + JSON.stringify(origen ?? null) + ',"filas":' + JSON.stringify(filas) + ',"tablas":{' + partes.join(',') + '}}';
}

/** El host de SUPABASE_URL (ej. gwzfdprdrdudfakjsdxf.supabase.co), o null. Nunca la dirección de la base (lleva la contraseña). */
export function origenDe(urlProyecto) {
  try { const h = new URL(String(urlProyecto || '')).hostname; return /^[a-z0-9-]{1,63}\.supabase\.co$/.test(h) ? h : null; } catch (_) { return null; }
}

/** Todo lo que la respuesta necesita: los bytes, su huella, el nombre y las cuentas. Lanza RespaldoGrande si los bytes pasan del tope. */
export async function paquete({ partes, filas, ahoraMs, origen, tope = TOPE_RESPALDO }) {
  const bytes = new TextEncoder().encode(armarContenido({ partes, filas, ahoraMs, origen }));
  if (bytes.byteLength > tope) throw new RespaldoGrande();
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return { bytes, sha256: Array.from(h, b => b.toString(16).padStart(2, '0')).join(''), nombre: nombreDeArchivo(ahoraMs),
    filas: Object.values(filas).reduce((a, n) => a + n, 0) };
}
