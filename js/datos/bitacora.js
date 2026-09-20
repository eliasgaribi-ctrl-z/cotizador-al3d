/* ============================================================================
   LA BITÁCORA — quién hizo qué, y cuándo.

   Hasta septiembre de 2026 el único rastro de autor de la plataforma vivía en el libro del
   almacén: cada movimiento lleva `usuario`, `rol`, `dispositivo` y `sello`. Todo lo demás
   —quién marcó «instalado», quién cambió la cuenta de cobro, quién movió una instalación de
   fecha, quién tocó el factor de una lámina— se guardaba como ESTADO y no como HECHO: el
   proyecto dice en qué etapa está y no quién lo puso ahí. Cuando algo no cuadraba, la
   pregunta «¿quién movió esto?» no tenía dónde leerse.

   Este almacén es la respuesta. Es append-only como el libro: un renglón por hecho, con el
   sello de quien lo hizo, y nunca se edita ni se borra desde la interfaz. No es seguridad
   —en fase 1 cualquiera cambia su rol y su nombre— es MEMORIA: que dentro de tres semanas
   se pueda leer que el martes a las 5 «Beto · Fabricación» marcó cortado el letrero de la
   taquería, y que eso fue lo que descontó la lámina.

   Quien anota es la CAPA DE DATOS, no la pantalla: `proyectos.js`, `agenda.js`,
   `material.js` y `stock.js` llaman a `anotar()` después de escribir, por import dinámico y
   dentro de un try. Si esto falla, la escritura de verdad ya pasó y la bitácora se queda
   corta, que es el modo de falla correcto: una bitácora nunca puede impedir el trabajo que
   registra.

   Entra al respaldo con los demás almacenes y, al restaurar, un renglón que ya está no se
   vuelve a escribir (ver db.importar).
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */

/* Las entidades que se anotan. Sirven para filtrar en la pantalla de Control y para que el
   nombre que se pinta sea uno solo. */
export const ENTIDADES = ['proyecto', 'instalacion', 'material', 'constante', 'almacen', 'plataforma'];
export const ENTIDAD_NOMBRE = {
  proyecto: 'Proyectos', instalacion: 'Agenda', material: 'Catálogo', constante: 'Constantes',
  almacen: 'Almacén', plataforma: 'Plataforma',
};

/**
 * Anota un hecho. Nunca lanza y nunca devuelve error hacia arriba: devuelve el renglón o
 * null. La plataforma sigue igual si la bitácora no pudo escribirse.
 *
 * @param {{accion:string, entidad:string, entidad_id?:string, titulo:string, detalle?:string,
 *          antes?:*, despues?:*}} hecho
 *   accion  — verbo corto en clave: 'gano', 'descarto', 'etapa', 'cambio', 'agendo',
 *             'reagendo', 'marco', 'cancelo', 'guardo', 'conteo', 'compra', 'restauro'…
 *   entidad — una de ENTIDADES
 *   titulo  — lo que se lee en un renglón: «Taquería El Güero pasó a Cortado»
 *   detalle — la segunda línea, opcional
 *   antes/despues — el valor que cambió, si aplica; se guarda para poder comparar
 */
export async function anotar(hecho) {
  try {
    if (!hecho || typeof hecho !== 'object' || !hecho.titulo) return null;
    if (!DB.estado().ok) return null;
    const fila = {
      id: DB.nuevoId('bit'),
      ts: Date.now(),
      accion: String(hecho.accion || 'cambio'),
      entidad: ENTIDADES.includes(hecho.entidad) ? hecho.entidad : 'plataforma',
      entidad_id: hecho.entidad_id ? String(hecho.entidad_id) : '',
      titulo: String(hecho.titulo).slice(0, 200),
      detalle: String(hecho.detalle || '').slice(0, 600),
      antes: hecho.antes === undefined ? null : hecho.antes,
      despues: hecho.despues === undefined ? null : hecho.despues,
      /* El sello congelado, igual que en el libro: si mañana cambian el nombre del
         dispositivo, lo que se lee aquí sigue siendo quién era ese día. */
      usuario: Prefs.nombre(),
      rol: Prefs.rol(),
      dispositivo: Prefs.dispositivo(),
      sello: Prefs.sello(),
    };
    const r = await DB.poner('bitacora', fila);
    return r.ok ? r.valor : null;
  } catch (_) { return null; }
}

/**
 * Los hechos, del más reciente al más viejo.
 * @param {{limite?:number, entidad?:string, entidad_id?:string, desde?:number, texto?:string}} [filtro]
 */
export async function listar(filtro = {}) {
  const f = filtro && typeof filtro === 'object' ? filtro : {};
  let filas;
  try {
    filas = f.entidad_id
      ? await DB.listar('bitacora', { indice: 'porEntidad', rango: rango(String(f.entidad_id)) })
      : await DB.listar('bitacora', { indice: 'porTs' });
  } catch (_) { filas = []; }
  if (!Array.isArray(filas)) filas = [];
  if (f.entidad) filas = filas.filter(b => b && b.entidad === f.entidad);
  if (Number(f.desde) > 0) filas = filas.filter(b => Number(b.ts) >= Number(f.desde));
  const q = plano(f.texto).trim();
  if (q) filas = filas.filter(b => plano([b.titulo, b.detalle, b.sello, b.usuario].join(' ')).includes(q));
  filas.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
  const lim = Number(f.limite) > 0 ? Number(f.limite) : 0;
  return lim ? filas.slice(0, lim) : filas;
}

/** Cuántos hechos hay. Para la cuenta de la pestaña. */
export async function contar() {
  try { return await DB.contar('bitacora'); } catch (_) { return 0; }
}

function rango(valor) {
  try { return IDBKeyRange.only(valor); } catch (_) { return null; }
}

const plano = s => String(s == null ? '' : s).toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
