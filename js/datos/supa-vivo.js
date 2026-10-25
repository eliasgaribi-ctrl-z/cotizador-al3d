/* ============================================================================
   LA LECTURA EN VIVO — las filas salen de Supabase y no de la hoja (fase 4). APAGADA.

   Solo con el segundo interruptor de Supabase encendido en este aparato (Ajustes, solo Dirección;
   pide también el general y la sombra: ver `vivoEncendido` en js/datos/supa-sombra.js). Volver
   atrás es apagarlo: la siguiente bajada vuelve a ser de la hoja, que sigue completa porque la
   escritura no cambió (va a la hoja y, por la sombra, también aquí).

   Con la empresa en modo 'base' («la base manda», docs/BASE-MANDA.md) esta fuente es LA bajada, para
   los tres roles y sin pedir la sombra —con la base como fuente la sombra no tiene nada que copiar—: la
   usa el relevo de la base (js/datos/supa-relevo.js), con sus propios candados (una cuenta activa, y una
   lectura vacía no tira un récord lleno), y el enchufe solo pone Realtime para saber cuándo bajar.

   Qué hace. El relevo de la hoja (js/datos/puente.js) ya sabe todo lo que se hace con una fila: el
   récord de ventas de Control, el dinero sobre el proyecto, la regla de los sellos dato por dato,
   la cita, la revisión de copias. En vez de copiar esas reglas, esto ARMA LA MISMA FILA que manda
   la hoja (`aplanarFila` del Apps Script), con los mismos nombres de columna, desde las tablas de
   la base, y se la da al relevo por `Puente.fuenteDeLectura`. Igual con el almacén.

   El dinero, con dos candados (R1: Fabricación jamás recibe una cifra):
     1. este archivo NO PIDE `ventas_calculadas` ni `almacen_costos` ni se suscribe a
        `ventas_dinero`/`abonos`/`almacen_costos` si el área de la base no es Dirección o Pagos;
     2. aunque los pidiera, la RLS de la base le devolvería cero filas (supabase/DISENO.md §4.6), y
        la fila que se arma para Fabricación no lleva ni la llave de una columna de dinero (como la
        hoja: `sinLoQueNoLeToca`).

   Realtime. Una suscripción a los cambios de las tablas (la publicación ya existe:
   0010_sync_espejo.sql). Un evento NO trae el dato a la pantalla: solo avisa, y la app baja como
   siempre (DISENO.md §7.2: el aviso dispara la lectura). Con la suscripción viva, el sondeo de 30 s
   deja de bajar de la hoja y queda de respaldo cada 5 minutos (js/datos/supa-enchufe.js).
   ============================================================================ */

import { P, ETAPA_A_NOTION, ENTREGA_A_HOJA, COLUMNA_DEL_SELLO, plazoAHoja } from './puente.js';

/** Las columnas de dinero de la fila, las mismas que la hoja le quita a Fabricación
 *  (`CAMPOS_DE_DINERO` de puente/hoja-apps-script.gs). */
export const COLUMNAS_DE_DINERO = Object.freeze([P.subtotal, P.neto, P.anticipo, P.liquidacion, P.pendiente,
  P.comisiones, P.abonoCom, P.comRestante, P.cuenta, P.fechaLiq, P.pctCom]);

/** Las áreas que ven dinero (las mismas que `VE_EL_DINERO` del Apps Script). */
export const VE_DINERO = Object.freeze(['direccion', 'pagos']);
export const veDinero = area => VE_DINERO.includes(String(area || ''));

/** Las tablas que se leen y a las que se suscribe cada área. */
export function tablasDe(area) {
  const obra = ['proyectos', 'instalaciones', 'materiales', 'requerimientos', 'almacen_movimientos'];
  return veDinero(area) ? obra.concat(['ventas_dinero', 'abonos', 'almacen_costos']) : obra;
}

const num = v => (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
const fecha = v => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v))) ? String(v).slice(0, 10) : null;

/**
 * Una fila de «Ventas» como la manda la hoja, armada con lo de la base. PURA.
 * @param {Object} p la fila de `proyectos`
 * @param {Object|null} inst la instalación viva de ese proyecto (no cancelada), si hay
 * @param {Object|null} din su fila de `ventas_calculadas` (null para quien no ve dinero)
 */
export function filaDeSupabase(p, inst, din) {
  if (!p || typeof p !== 'object' || !p.folio_hoja) return null;
  const sellos = {};
  for (const [g, ms] of Object.entries(p.sellos && typeof p.sellos === 'object' ? p.sellos : {})) {
    if (COLUMNA_DEL_SELLO[g] && Number(ms) > 0) sellos[COLUMNA_DEL_SELLO[g]] = Math.floor(Number(ms));
  }
  const pin = num(p.lat) !== null && num(p.lng) !== null;
  const out = {
    id_notion: String(p.folio_hoja),
    editado: null,
    [P.proyecto]: String(p.nombre || ''),
    [P.estatus]: p.estatus || null,
    [P.tipo]: Array.isArray(p.tipo_trabajo) ? p.tipo_trabajo.slice() : [],
    [P.iva]: p.iva !== false,
    [P.fecha]: fecha(p.fecha_anticipo),
    [P.fechaInst]: inst ? fecha(inst.fecha) : fecha(p.fecha_instalacion_hist),
    [P.horaInst]: inst && inst.hora ? String(inst.hora) : '',
    [P.folio]: String(p.folio_global || ''),
    /* La copia de la hoja le pone «ganado» a una venta viva sin etapa (la base no deja una viva sin
       ella) y lo dice en `procedencia.etapa_vacia`: mientras siga en «ganado», sale sin etapa, como en la hoja. */
    [P.etapa]: (p.etapa_vacia === true && p.etapa === 'ganado') ? null : (ETAPA_A_NOTION[p.etapa] || null),
    [P.ubicacion]: pin ? Number(p.lat) + ',' + Number(p.lng) : String(p.maps_url || ''),
    [P.direccion]: String(p.dir_texto || ''),
    [P.tel]: String(p.tel || ''),
    [P.entrega]: p.entrega ? (ENTREGA_A_HOJA[p.entrega] || '') : '',
    [P.notas]: String(p.notas || ''),
    [P.plazo]: plazoAHoja(p.plazo_k),
    [P.sellos]: sellos,
  };
  if (din && typeof din === 'object') {
    /* Un importe que la hoja tenía VACÍO entra a la base como 0 y la copia dice cuál (`vacias` de
       `ventas_dinero.procedencia`): mientras siga en 0, sale vacío, como lo manda la hoja. Para el
       teléfono no es lo mismo: un 0 pisaría el anticipo pactado de su proyecto. */
    const vacias = Array.isArray(din.vacias) ? din.vacias : [];
    const importe = (v, letra) => { const x = num(v); return x === 0 && vacias.includes(letra) ? null : x; };
    out[P.cuenta] = din.d_cuenta || null;
    out[P.subtotal] = importe(din.g_subtotal, 'G');
    out[P.neto] = num(din.h_neto);
    out[P.anticipo] = importe(din.i_anticipo, 'I');
    out[P.liquidacion] = importe(din.j_liquidacion, 'J');
    out[P.pendiente] = num(din.k_saldo);
    out[P.comisiones] = num(din.r_comision);
    out[P.abonoCom] = num(din.s_abonado);
    out[P.comRestante] = num(din.t_restante);
    out[P.pctCom] = num(din.pct_comision);
    out[P.fechaLiq] = fecha(din.n_fecha_liquidacion);
  }
  return out;
}

/** Un material de la base en la forma del teléfono. PURA. */
export function materialDeSupabase(m, costo) {
  if (!m || !m.id) return null;
  const o = { ...m, empresa_id: m.empresa_id };
  delete o.sellos; delete o.procedencia; delete o.created_at; delete o.updated_at;
  if (costo !== undefined) o.costo_compra = costo;
  return o;
}
/** Una línea de requerimiento en la forma del teléfono, con el folio de su venta. PURA. */
export function requerimientoDeSupabase(q, folioHoja) {
  if (!q || !q.id) return null;
  const o = { ...q, ajustado_en: Number(q.ajustado_ms) || null };
  delete o.ajustado_ms; delete o.sellos; delete o.procedencia; delete o.created_at; delete o.updated_at;
  if (folioHoja) o.folio_hoja = folioHoja;
  return o;
}
/** Un renglón del libro del almacén en la forma del teléfono. PURA. */
export function movimientoDeSupabase(x, costo) {
  if (!x || !x.id) return null;
  const o = { id: x.id, empresa_id: x.empresa_id, material_id: x.material_id, tipo: x.tipo, cantidad: Number(x.cantidad),
    unidad_compra: x.unidad_compra, origen: x.origen, nota: x.nota || '', usuario: x.usuario || '', rol: x.rol || '',
    dispositivo: x.dispositivo || '', proyecto_id: x.proyecto_id || null, requerimiento_id: x.requerimiento_id || null,
    sello: x.firma || '', ts: Number(x.ts) || 0 };
  if (costo !== undefined) o.costo_total = costo;
  return o;
}

/* ============================================================================
   La fuente: lo que el relevo le pide en vez de /jalar y /jalar_almacen
   ============================================================================ */

const PAGINA = 500;          // < max_rows 1000 de PostgREST, que trunca SIN avisar

/** Todas las filas de una consulta, de PAGINA en PAGINA. `armar(c)` devuelve la consulta nueva. */
export async function todas(armar) {
  const out = [];
  for (let desde = 0; desde < 200000; desde += PAGINA) {
    const { data, error } = await armar().range(desde, desde + PAGINA - 1);
    if (error) { const e = new Error(error.message || 'Supabase no contestó.'); e.codigo = 'SIN_RED'; throw e; }
    const l = Array.isArray(data) ? data : [];
    out.push(...l);
    if (l.length < PAGINA) break;
  }
  return out;
}

const COLS_PROYECTO = 'id, folio_hoja, folio_global, nombre, estatus, iva, tipo_trabajo, etapa, fecha_anticipo, ' +
  'fecha_instalacion_hist, dir_texto, lat, lng, maps_url, tel, entrega, notas, plazo_k, sellos, etapa_vacia:procedencia->etapa_vacia';
const COLS_DINERO = 'proyecto_id, d_cuenta, g_subtotal, h_neto, i_anticipo, j_liquidacion, k_saldo, r_comision, ' +
  's_abonado, t_restante, pct_comision, n_fecha_liquidacion';

/**
 * @param {{cliente:function():Promise<Object>, area:function():Promise<string>|string, empresa?:string,
 *          marca?:{leer:function():number, poner:function(number):void}}} deps
 */
export function crearFuente(deps) {
  const empresa = deps.empresa || 'al3d';
  const area = async () => (typeof deps.area === 'function' ? await deps.area() : deps.area) || '';
  const marca = deps.marca || (() => { let m = 0; return { leer: () => m, poner: v => { m = v; } }; })();

  async function filas() {
    const c = await deps.cliente();
    const a = await area();
    if (!['direccion', 'fabricacion', 'pagos'].includes(a)) {
      return { ok: false, codigo: 'SIN_ACCESO', mensaje: 'La base no reconoce el área de esta cuenta: no se lee nada.' };
    }
    const proyectos = await todas(() => c.from('proyectos').select(COLS_PROYECTO).eq('empresa_id', empresa)
      .not('folio_hoja', 'is', null).is('deleted_at', null).order('id'));
    const insts = await todas(() => c.from('instalaciones').select('id, proyecto_id, fecha, hora, estado')
      .eq('empresa_id', empresa).neq('estado', 'cancelada').is('deleted_at', null).order('id'));
    const viva = new Map();
    for (const i of insts) if (!viva.has(i.proyecto_id) || String(i.fecha) < String(viva.get(i.proyecto_id).fecha)) viva.set(i.proyecto_id, i);
    let dinero = null;
    if (veDinero(a)) {
      dinero = new Map();
      for (const d of await todas(() => c.from('ventas_calculadas').select(COLS_DINERO).eq('empresa_id', empresa).order('proyecto_id'))) {
        dinero.set(d.proyecto_id, d);
      }
      /* Qué importes tenía vacíos la hoja (solo esa llave de `procedencia`: nada más de la fila). */
      for (const v of await todas(() => c.from('ventas_dinero').select('proyecto_id, vacias:procedencia->vacias').eq('empresa_id', empresa)
        .not('procedencia->vacias', 'is', null).order('proyecto_id'))) {
        const d = dinero.get(v.proyecto_id);
        if (d && Array.isArray(v.vacias)) d.vacias = v.vacias;
      }
    }
    const registros = [];
    for (const p of proyectos) {
      const f = filaDeSupabase(p, viva.get(p.id) || null, dinero ? (dinero.get(p.id) || null) : null);
      if (f) registros.push({ almacen: 'proyectos', datos: f });
    }
    return { ok: true, registros, cursor: null, hay_mas: false };
  }

  async function almacen() {
    const c = await deps.cliente();
    const a = await area();
    if (!['direccion', 'fabricacion', 'pagos'].includes(a)) return { ok: false, codigo: 'SIN_ACCESO' };
    const ve = veDinero(a);
    const costoMat = new Map(), costoMov = new Map();
    if (ve) {
      for (const k of await todas(() => c.from('almacen_costos').select('id, material_id, movimiento_id, importe').eq('empresa_id', empresa).order('id'))) {
        if (k.material_id) costoMat.set(k.material_id, num(k.importe));
        if (k.movimiento_id) costoMov.set(k.movimiento_id, num(k.importe));
      }
    }
    const folioDe = new Map();
    for (const p of await todas(() => c.from('proyectos').select('id, folio_hoja').eq('empresa_id', empresa).not('folio_hoja', 'is', null).order('id'))) {
      folioDe.set(p.id, p.folio_hoja);
    }
    const registros = [];
    for (const m of await todas(() => c.from('materiales').select('*').eq('empresa_id', empresa).order('id'))) {
      const x = materialDeSupabase(m, ve ? (costoMat.has(m.id) ? costoMat.get(m.id) : null) : undefined);
      if (x) registros.push({ almacen: 'materiales', datos: x });
    }
    for (const q of await todas(() => c.from('requerimientos').select('*').eq('empresa_id', empresa).order('id'))) {
      const x = requerimientoDeSupabase(q, folioDe.get(q.proyecto_id) || '');
      if (x) registros.push({ almacen: 'requerimientos', datos: x });
    }
    /* El libro, solo lo nuevo: su secuencia (`seq`) es de la base y se guarda aparte de la marca de
       la hoja. Con la hoja otra vez, su propia marca sigue donde se quedó. */
    const desde = Number(marca.leer()) || 0;
    let hasta = desde;
    for (const x of await todas(() => c.from('almacen_movimientos').select('*').eq('empresa_id', empresa).gt('seq', desde).order('seq'))) {
      const m = movimientoDeSupabase(x, ve ? (costoMov.has(x.id) ? costoMov.get(x.id) : null) : undefined);
      if (m) registros.push({ almacen: 'movimientos', datos: m });
      if (Number(x.seq) > hasta) hasta = Number(x.seq);
    }
    if (hasta > desde) marca.poner(hasta);
    return { ok: true, registros, hay_mas: false };
  }

  return { filas, almacen };
}

/**
 * La suscripción de Realtime. `alCambio()` se llama (con espera de 1.5 s para juntar ráfagas) cada
 * vez que algo cambia en una tabla que esta área lee. Devuelve {cerrar(), viva()}.
 */
export function suscribir(cliente, area, alCambio, o = {}) {
  const espera = o.espera === undefined ? 1500 : o.espera;
  let reloj = 0, viva = false;
  const avisar = () => { clearTimeout(reloj); reloj = setTimeout(() => { try { alCambio(); } catch (_) {} }, espera); };
  let canal = cliente.channel('al3d-vivo');
  for (const tabla of tablasDe(area)) {
    canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla, filter: 'empresa_id=eq.' + (o.empresa || 'al3d') }, avisar);
  }
  canal.subscribe(estado => { viva = estado === 'SUBSCRIBED'; if (o.alEstado) o.alEstado(estado); });
  return {
    viva: () => viva,
    cerrar: () => { clearTimeout(reloj); viva = false; try { cliente.removeChannel(canal); } catch (_) {} },
  };
}
