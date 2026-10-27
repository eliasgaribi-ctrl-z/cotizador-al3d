/* ============================================================================
   LA LECTURA EN VIVO — las filas salen de Supabase y no de la hoja (fase 4). APAGADA.

   Solo con el segundo interruptor de Supabase encendido en este aparato (Ajustes, solo Dirección;
   pide también el general y la sombra: ver `vivoEncendido` en js/datos/supa-sombra.js). Volver
   atrás es apagarlo: la siguiente bajada vuelve a ser de la hoja, que sigue completa porque la
   escritura no cambió (va a la hoja y, por la sombra, también aquí).

   Con la empresa en modo 'base' («la base manda», docs/BASE-MANDA.md) esta fuente es LA bajada, para
   los tres roles y sin pedir la sombra —con la base como fuente la sombra no tiene nada que copiar—: la
   usa el relevo de la base (js/datos/supa-relevo.js), con sus propios candados (una cuenta activa, y una
   lectura vacía no tira un récord lleno), y el enchufe solo pone Realtime para saber cuándo bajar. Con la
   base mandando, además, los gastos (0025): `gastos()` en lugar de /jalar_gastos, y su tabla en Realtime.

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

import { P, ETAPA_A_NOTION, ENTREGA_A_HOJA, COLUMNA_DEL_SELLO, plazoAHoja, CITA_DE_LA_BASE, OCULTO_DE_LA_BASE } from './puente.js';

/** Las columnas de dinero de la fila, las mismas que la hoja le quita a Fabricación
 *  (`CAMPOS_DE_DINERO` de puente/hoja-apps-script.gs). */
export const COLUMNAS_DE_DINERO = Object.freeze([P.subtotal, P.neto, P.anticipo, P.liquidacion, P.pendiente,
  P.comisiones, P.abonoCom, P.comRestante, P.cuenta, P.fechaLiq, P.pctCom]);

/** Las áreas que ven dinero (las mismas que `VE_EL_DINERO` del Apps Script). */
export const VE_DINERO = Object.freeze(['direccion', 'pagos']);
export const veDinero = area => VE_DINERO.includes(String(area || ''));

/** Las tablas que se leen y a las que se suscribe cada área. Los `gastos` (0025) solo con la base mandando (`o.gastos`): con la hoja
 *  mandando no se leen de aquí (la bajada de la hoja promete no pedírselos a nadie), y antes de 0025 la tabla no está en Realtime. */
export function tablasDe(area, o = {}) {
  const obra = ['proyectos', 'instalaciones', 'materiales', 'requerimientos', 'almacen_movimientos'];
  if (!veDinero(area)) return obra;
  return obra.concat(['ventas_dinero', 'abonos', 'almacen_costos'], o && o.gastos ? ['gastos'] : []);
}

/** La instalación de la base en la forma que lee `citaDeLaBase`. PURA. */
export function citaDe(i) {
  if (!i || typeof i !== 'object' || !i.id) return null;
  return { id: String(i.id), fecha: fecha(i.fecha), hora: i.hora ? String(i.hora) : null, ventana: i.ventana || 'dia',
    duracion_min: num(i.duracion_min), estado: String(i.estado || ''), movida: num(i.movida) || 0,
    uid_ics: i.uid_ics ? String(i.uid_ics) : '', notas: String(i.notas || '') };
}

/** La cita viva de cada proyecto. La base deja UNA no cancelada por proyecto (`instalaciones_una_viva`, 0003); si
 *  llegaran dos (una lectura a la mitad de un cambio), gana la pendiente sobre la hecha y, entre iguales, la más
 *  reciente: nunca la más vieja, que dejaría fuera la visita nueva. PURA. */
export function citasVivas(insts) {
  const viva = new Map();
  const peso = i => (i.estado === 'hecha' ? 0 : 1);
  for (const i of Array.isArray(insts) ? insts : []) {
    if (!i || !i.proyecto_id || i.estado === 'cancelada') continue;
    const y = viva.get(i.proyecto_id);
    if (!y || peso(i) > peso(y) || (peso(i) === peso(y) && String(i.updated_at || i.fecha) > String(y.updated_at || y.fecha))) {
      viva.set(i.proyecto_id, i);
    }
  }
  return viva;
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
    /* La cita entera (ventana, duración, estado, notas): la bajada la pone tal cual, sin adivinar «De día» ni
       «confirmada» como con la fila de la hoja (`citaDeLaBase` en puente.js). `null`: la base no tiene una viva. */
    [CITA_DE_LA_BASE]: inst ? citaDe(inst) : null,
  };
  /* «Ocultar del taller» (auditoría 2026-10-26, T1-9; 0029_taller_hasta_liquidar.sql): solo la base lo guarda. Va en su llave
     (`OCULTO_DE_LA_BASE`) y con su sello en la columna de los sellos; la bajada lo aplica con la regla de siempre (`obraDeLaFila`).
     Sin la columna en la fila (una base sin 0029: ver `filas()`), sin la llave, y no se toca lo de este teléfono. */
  if (Object.prototype.hasOwnProperty.call(p, 'oculto_taller')) out[OCULTO_DE_LA_BASE] = p.oculto_taller === true;
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

const COLS_PROYECTO_SIN_OCULTO = 'id, folio_hoja, folio_global, nombre, estatus, iva, tipo_trabajo, etapa, fecha_anticipo, ' +
  'fecha_instalacion_hist, dir_texto, lat, lng, maps_url, tel, entrega, notas, plazo_k, sellos, etapa_vacia:procedencia->etapa_vacia';
/* Con «Ocultar del taller» (auditoría 2026-10-26, T1-9), que llega con 0029. */
export const COLS_PROYECTO = COLS_PROYECTO_SIN_OCULTO + ', oculto_taller';
/* Una base que todavía no corre 0029 no tiene la columna, y PostgREST contesta con un error a la consulta ENTERA: sin esto, publicar la
   app antes de aplicar la migración dejaría a todos los teléfonos sin bajar nada. Se reconoce por el nombre de la columna en el mensaje
   (o el 42703 de Postgres, «la columna no existe») y se vuelve a pedir sin ella: nada se oculta hasta que la base la tenga. */
const sinLaColumna = e => /oculto_taller/.test(String((e && e.message) || '')) || String((e && e.codigo_base) || '') === '42703';
const COLS_CITA = 'id, proyecto_id, fecha, hora, ventana, duracion_min, estado, movida, uid_ics, notas, updated_at';
const COLS_DINERO = 'proyecto_id, d_cuenta, g_subtotal, h_neto, i_anticipo, j_liquidacion, k_saldo, r_comision, ' +
  's_abonado, t_restante, pct_comision, n_fecha_liquidacion';
const COLS_GASTO = 'id, fecha, concepto, categoria, monto, cuenta, folio, registro_por, registrado_en, anulado, anulo, anulado_en';

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
    const deProyectos = cols => todas(() => c.from('proyectos').select(cols).eq('empresa_id', empresa)
      .not('folio_hoja', 'is', null).is('deleted_at', null).order('id'));
    let proyectos;
    try { proyectos = await deProyectos(COLS_PROYECTO); }
    catch (e) { if (!sinLaColumna(e)) throw e; proyectos = await deProyectos(COLS_PROYECTO_SIN_OCULTO); }
    const insts = await todas(() => c.from('instalaciones').select(COLS_CITA)
      .eq('empresa_id', empresa).neq('estado', 'cancelada').is('deleted_at', null).order('id'));
    const viva = citasVivas(insts);
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

  /* Los gastos (0025), en lugar de /jalar_gastos: la tabla entera, sin los que tienen lápida (alguien los quitó de la pestaña mientras la
     hoja mandaba: para el teléfono ya no están, como no estaban en la pestaña). Las filas van tal cual; las lee `gastos.gastoDeBase`. Solo
     la pide el relevo de la base, y solo para quien ve el dinero: a Fabricación ni se le pregunta (y la RLS de 0020 le daría cero filas). */
  async function gastos() {
    const c = await deps.cliente();
    const a = await area();
    if (!veDinero(a)) return { ok: true, gastos: [], completa: false };
    const filas = await todas(() => c.from('gastos').select(COLS_GASTO).eq('empresa_id', empresa).is('deleted_at', null).order('id'));
    return { ok: true, gastos: filas, completa: true };
  }

  return { filas, almacen, gastos };
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
  for (const tabla of tablasDe(area, { gastos: !!o.gastos })) {
    canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla, filter: 'empresa_id=eq.' + (o.empresa || 'al3d') }, avisar);
  }
  canal.subscribe(estado => { viva = estado === 'SUBSCRIBED'; if (o.alEstado) o.alEstado(estado); });
  return {
    viva: () => viva,
    cerrar: () => { clearTimeout(reloj); viva = false; try { cliente.removeChannel(canal); } catch (_) {} },
  };
}
