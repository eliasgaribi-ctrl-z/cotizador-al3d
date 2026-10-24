/* ============================================================================
   LA COPIA DIARIA — de la hoja a la base, con el importador de la fase 2, y su cuadre.

   Decidido por Elías el 2026-10-16: el equipo sigue capturando en la hoja, así que cada madrugada el
   Apps Script (puente/copia-diaria.gs) manda el volcado a la función `importar-diario` y esta lo pasa
   a la base. Las REGLAS no viven aquí: el plan lo hace `planear` (scripts/importador/plan.mjs) y el SQL
   lo escribe `sqlDeImportacion` (scripts/importador/sql.mjs), los mismos que usó la importación del
   2026-10-16. Lo que vive aquí es cómo se aplica y qué se anota:

     1. Si el PLAN trae conflictos o filas que no entran, NO se aplica nada: eso lo decide una persona
        (Q-14). Se anota igual, con el cuadre de cómo está la base.
     2. Si no, todo el SQL del importador corre en UNA transacción (sin los begin/commit por lote del
        archivo importar.sql). Lo que la BASE no deja cambiar (una venta que pasó de viva a histórica, un
        abono que ya no está en la hoja) el propio SQL lo deja sin tocar y lo anota como «conflicto»: se
        cuenta, el día no cuadra, y lo demás sí queda escrito, igual que con importar.sql.
     3. Después, en la misma transacción, el cuadre por folio de cuadre.sql (`sqlDeDiferencias`).
     4. Un renglón en `public.cuadre_diario` (0018). Si algo truena, la transacción se deshace entera
        —no queda NADA de la copia— y el fallo se anota en otra, con su código y nunca con su mensaje
        (el de Postgres puede citar la fila: nombres e importes).

   Lo que se guarda en `resumen` son cuentas, pestañas, números de fila, folios V-### y columnas: ni un
   nombre, un teléfono ni un importe. Se arma con listas cerradas (lo que no se reconoce sale «otro»).

   `base` es { transaccion(fn) }, y fn recibe { ejecutar(texto), consultar(texto, params?) → filas }.
   En Supabase es postgres.js sobre SUPABASE_DB_URL (base.js); en las pruebas, PGlite o un doble.
   ============================================================================ */

import { sqlDeImportacion, sqlDeDiferencias } from '../../../scripts/importador/sql.mjs';
import { MOTIVOS_AUTORIZACION, MOTIVOS_GASTO } from '../../../scripts/importador/plan.mjs';

/** El candado de la copia (pg_try_advisory_xact_lock): dos corridas a la vez no se pisan; la segunda se va. */
export const LLAVE_CANDADO = 7316250418;
/** Cada sentencia tiene hasta esto (la función entera tiene 150 s de reloj). */
export const TIEMPO_SENTENCIA = '110s';
/** Cuántos folios o filas se anotan por cada cosa (el resto solo se cuenta). */
export const TOPE_LISTA = 50;

export class CopiaOcupada extends Error {
  constructor() { super('Ya hay una copia en curso.'); this.name = 'CopiaOcupada'; }
}
export class ErrorDeCopia extends Error {
  constructor(mensaje, error) { super(mensaje); this.name = 'ErrorDeCopia'; this.error = error || null; }
}

const RE_FOLIO = /^V-\d{3,7}$/;
const RE_TEMA = /^[a-záéíóúñü ]{1,80}$/i;                    // los temas de plan.mjs: solo palabras
const COLUMNAS_CUADRE = ['fila', 'H', 'K', 'R', 'S', 'T', 'X', 'O', 'V', 'W'];
const TABLAS_PLAN = ['proyectos', 'ventas_dinero', 'abonos', 'miembros', 'instalaciones', 'materiales', 'almacen_costos', 'requerimientos',
  'almacen_movimientos', 'constantes', 'cotizaciones', 'autorizaciones', 'tarifas', 'gastos'];
const PESTANAS = ['Ventas', 'Abonos comisión', 'Accesos', 'Autorizaciones', 'Solicitudes de autorización', 'Almacén', 'Catálogo de material',
  'Listas de compra', 'Bitácora del puente', 'Ventas (respaldo)', 'Ventas (antes de realinear)', 'Tarifas', 'Gastos'];

const entero = v => (Number.isInteger(v) && v >= 0 ? v : 0);
const folioDe = s => { const m = /V-\d{3,7}/.exec(String(s || '')); return m ? m[0] : null; };

/** Agrupa y cuenta: [{...llave, n, [lista]: [...]}], en orden de llave. `extra` da el valor que va a la lista (o null). */
function contar(items, llave, campoLista, extra) {
  const m = new Map();
  for (const it of items) {
    const k = llave(it);
    const id = JSON.stringify(k);
    if (!m.has(id)) m.set(id, { ...k, n: 0, ...(campoLista ? { [campoLista]: [] } : {}) });
    const g = m.get(id);
    g.n++;
    if (campoLista) {
      const x = extra(it);
      if (x !== null && x !== undefined && !g[campoLista].includes(x) && g[campoLista].length < TOPE_LISTA) g[campoLista].push(x);
    }
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(e => e[1]);
}

/* ============================================================================
   Lo que se puede anotar, sin datos de clientes
   ============================================================================ */

/** El plan en cuentas: cuántas filas a cada tabla, de qué pestañas, qué conflictos y qué filas no entran (dónde, no qué dicen). */
export function resumenDelPlan(plan, volcado) {
  const rep = plan.reporte || {};
  const res = rep.resumen || {};
  const v = volcado && typeof volcado === 'object' ? volcado : {};
  const p = v.pestanas && typeof v.pestanas === 'object' ? v.pestanas : {};
  const pestanas = {};
  for (const nombre of PESTANAS) if (Array.isArray(p[nombre])) pestanas[nombre] = Math.max(0, p[nombre].length - 1);
  return {
    v: 1,
    volcado: {
      hecho: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(String(v.hecho || '')) ? v.hecho : null,
      puente_version: /^[a-z0-9-]{1,40}$/i.test(String(v.puente_version || '')) ? v.puente_version : null,
      pestanas,
    },
    plan: Object.fromEntries([...TABLAS_PLAN, 'filas_de_ventas_leidas', 'historicas', 'con_cotizacion'].map(k => [k, entero(res[k])])),
    avisos: Array.isArray(rep.avisos) ? rep.avisos.length : 0,
    no_importado: (rep.no_importado || []).map(noImportado),
    conflictos_plan: contar(rep.conflictos || [], c => ({ tema: RE_TEMA.test(String(c.tema)) ? c.tema : 'otro' }), 'folios', c => (RE_FOLIO.test(String(c.que)) ? c.que : null)),
    rechazos: contar(rep.rechazos || [], r => ({ donde: RE_TEMA.test(String(r.donde)) || r.donde === 'almacen_movimientos' ? r.donde : 'otro' }), 'filas', filaDeRechazo),
  };
}

/* Lo que no se importó: qué y cuántas; y, cuando el plan lo dice (las autorizaciones y los gastos de la copia diaria), los números de
   fila y cuántas por cada motivo de su lista cerrada (MOTIVOS_AUTORIZACION, MOTIVOS_GASTO). Nunca el folio ni lo que decía la fila. */
function noImportado(x) {
  const o = { que: RE_TEMA.test(String(x.que)) ? x.que : 'otro', n: entero(x.n) };
  if (Array.isArray(x.filas)) o.filas = x.filas.filter(f => Number.isInteger(f) && f > 0).slice(0, TOPE_LISTA);
  if (x.motivos && typeof x.motivos === 'object') {
    const validos = o.que === 'Gastos' ? MOTIVOS_GASTO : MOTIVOS_AUTORIZACION;
    o.motivos = {};
    for (const [k, n] of Object.entries(x.motivos)) { const m = validos.includes(k) ? k : 'otro'; o.motivos[m] = (o.motivos[m] || 0) + entero(n); }
  }
  return o;
}

/* El número de fila de un rechazo, si lo hay: `fila` cuando es número (las pestañas), o el «!12» de `que` (el catálogo). Nada más. */
function filaDeRechazo(r) {
  if (Number.isInteger(r.fila) && r.fila > 0) return r.fila;
  const m = /!(\d{1,6})$/.exec(String(r.que || ''));
  return m ? Number(m[1]) : null;
}

/** Lo que el SQL anotó en _imp_cambios, en cuentas. Los conflictos, por tipo y con su folio; nunca la llave entera (la de un abono lleva el importe). */
export function resumenDeCambios(filas) {
  const lista = Array.isArray(filas) ? filas : [];
  const tablaOk = t => (TABLAS_PLAN.includes(t) ? t : 'otra');
  const tipoConflicto = a => {
    if (/^conflicto: su folio ya es de /.test(a)) return 'su folio ya es de otro proyecto';
    const m = /^conflicto: en la base es (viva|histórica) de ([a-z]+) y ahora sería (viva|histórica) de ([a-z]+)$/.exec(a);
    if (m) return `en la base es ${m[1]} de ${m[2]} y ahora sería ${m[3]} de ${m[4]}`;
    if (/^conflicto: ya no está en la hoja/.test(a)) return 'ya no está en la hoja';
    return 'otro';
  };
  const conflictos = lista.filter(f => /^conflicto/.test(String(f.accion)));
  const cambios = lista.filter(f => !/^conflicto/.test(String(f.accion)));
  return {
    cambios: contar(cambios, f => ({ tabla: tablaOk(f.tabla), accion: /^(alta|cambio)(: [a-záéíóúñ ()]{1,60})?$/i.test(String(f.accion)) ? String(f.accion) : 'otro' })),
    conflictos_base: contar(conflictos, f => ({ tabla: tablaOk(f.tabla), tipo: tipoConflicto(String(f.accion)) }), 'folios', f => folioDe(f.llave)),
    n_conflictos: conflictos.length,
  };
}

/** Los renglones del cuadre (folio, col, en_hoja, en_base) en cuentas: cuántos por columna y qué folios. Los importes no salen. */
export function resumenDeDiferencias(filas) {
  const lista = Array.isArray(filas) ? filas : [];
  const columnas = {};
  const folios = [];
  for (const f of lista) {
    const c = COLUMNAS_CUADRE.includes(f.col) ? f.col : 'otra';
    columnas[c] = (columnas[c] || 0) + 1;
    const folio = RE_FOLIO.test(String(f.folio)) ? f.folio : null;
    if (folio && !folios.includes(folio) && folios.length < TOPE_LISTA) folios.push(folio);
  }
  return { n: lista.length, columnas, folios };
}

/** Lo que se puede decir de un error de la base: el código, la tabla y la restricción. NUNCA el mensaje ni el detalle. */
export function errorSinDatos(e) {
  const o = { codigo: 'DESCONOCIDO' };
  if (e && /^[0-9A-Z]{5}$/.test(String(e.code || ''))) o.codigo = e.code;
  else if (e && e.codigo && /^[A-Z_]{3,40}$/.test(e.codigo)) o.codigo = e.codigo;
  const tabla = e && (e.table_name || e.table);
  const restriccion = e && (e.constraint_name || e.constraint);
  if (/^[a-z_][a-z0-9_]{0,62}$/.test(String(tabla || ''))) o.tabla = tabla;
  if (/^[a-z_][a-z0-9_]{0,62}$/.test(String(restriccion || ''))) o.restriccion = restriccion;
  return o;
}

/* ============================================================================
   La corrida
   ============================================================================ */

const INSERTAR = `insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, rechazos, resumen, duracion_ms)
values ($1, $2, $3, $4, $5, $6, $7::text::jsonb, $8)
returning id::text as id, fecha::text as fecha, cuadra`;

async function anotar(tx, d) {
  const cuadra = d.aplicado && !d.error && d.diferencias === 0 && d.conflictos === 0 && d.rechazos === 0;
  const filas = await tx.consultar(INSERTAR, [d.empresa, d.aplicado, cuadra, d.diferencias, d.conflictos, d.rechazos, JSON.stringify(d.resumen), d.duracion_ms]);
  const f = (filas && filas[0]) || {};
  return { id: f.id || null, fecha: f.fecha || null, cuadra };
}

/**
 * Aplica la copia y anota el cuadre.
 * @param {{base:object, plan:object, volcado?:object, ahora:function():number, inicio:number}} o
 * @returns {Promise<{id, fecha, aplicado, cuadra, diferencias, conflictos, rechazos, duracion_ms, resumen}>}
 * @throws CopiaOcupada si otra corrida tiene el candado; ErrorDeCopia si ni siquiera se pudo anotar.
 */
export async function copiar({ base, plan, volcado, ahora, inicio }) {
  const empresa = plan.empresa;
  const rep = plan.reporte || {};
  const conflictosPlan = (rep.conflictos || []).length, rechazos = (rep.rechazos || []).length;
  const bloqueada = conflictosPlan > 0 || rechazos > 0;
  const resumen = resumenDelPlan(plan, volcado);
  const duracion = () => Math.max(0, Math.min(3_600_000, Math.round(Number(ahora()) - Number(inicio))));

  /* El SQL se arma ANTES de abrir la transacción: si no se puede armar, es un problema del plan y no se abre nada. */
  let sqlCopia = null, sqlDif = null, errorAlArmar = null;
  try {
    sqlDif = sqlDeDiferencias(plan);
    if (!bloqueada) sqlCopia = sqlDeImportacion(plan, { externa: true });
  } catch (_) { errorAlArmar = { codigo: 'SQL_NO_SE_ARMO' }; }     // el mensaje de lit() cita el valor: no sale

  if (!errorAlArmar) {
    try {
      return await base.transaccion(async tx => {
        const c = await tx.consultar('select pg_try_advisory_xact_lock($1::bigint) as ok', [LLAVE_CANDADO]);
        if (!c || !c[0] || c[0].ok !== true) throw new CopiaOcupada();
        await tx.ejecutar(`set local statement_timeout = '${TIEMPO_SENTENCIA}'`);
        let cambios = { cambios: [], conflictos_base: [], n_conflictos: 0 };
        if (sqlCopia) {
          await tx.ejecutar(sqlCopia);
          cambios = resumenDeCambios(await tx.consultar('select tabla, llave, accion from _imp_cambios'));
          await tx.ejecutar('drop table if exists _lote; drop table if exists _imp_cambios;');   // la conexión puede volver a un pool: no se queda nada
        }
        const dif = resumenDeDiferencias(await tx.consultar(sqlDif));
        const r = { ...resumen, motivo: bloqueada ? 'el plan trae conflictos o filas que no entran: no se aplicó nada' : null,
          cambios: cambios.cambios, conflictos_base: cambios.conflictos_base, diferencias: { columnas: dif.columnas, folios: dif.folios } };
        const d = { empresa, aplicado: !!sqlCopia, diferencias: dif.n, conflictos: conflictosPlan + cambios.n_conflictos, rechazos,
          resumen: r, duracion_ms: duracion() };
        const g = await anotar(tx, d);
        return { ...d, ...g };
      });
    } catch (e) {
      if (e instanceof CopiaOcupada) throw e;
      errorAlArmar = errorSinDatos(e);
    }
  }

  /* Algo tronó: la transacción de la copia se deshizo ENTERA. Se anota el fallo en otra, con el cuadre de cómo quedó la base. */
  const error = errorAlArmar;
  try {
    return await base.transaccion(async tx => {
      /* El cuadre va en su punto de guardado: si también truena (la base caída a medias, el tiempo), el fallo se anota igual. */
      let dif = null;
      if (sqlDif) {
        await tx.ejecutar('savepoint cuadre');
        try { dif = resumenDeDiferencias(await tx.consultar(sqlDif)); await tx.ejecutar('release savepoint cuadre'); }
        catch (_) { await tx.ejecutar('rollback to savepoint cuadre'); dif = null; }
      }
      const r = { ...resumen, motivo: 'la copia falló y se deshizo entera: no se escribió nada', error,
        diferencias: dif ? { columnas: dif.columnas, folios: dif.folios } : null };
      const d = { empresa, aplicado: false, error, diferencias: dif ? dif.n : 0, conflictos: conflictosPlan, rechazos, resumen: r, duracion_ms: duracion() };
      const g = await anotar(tx, d);
      return { ...d, ...g };
    });
  } catch (e) {
    throw new ErrorDeCopia('No se pudo ni anotar el fallo en cuadre_diario.', { ...error, al_anotar: errorSinDatos(e) });
  }
}
