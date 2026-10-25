/* ============================================================================
   EL TRADUCTOR — una operación de la bandeja → las funciones de Supabase. Lo comparten la SOMBRA y
   el RELEVO.

   Vivía dentro de js/datos/supa-sombra.js, que era la única que escribía en la base: copiaba ahí lo
   que la hoja ya había aceptado. Con «la base manda» (paso 2 de docs/BASE-MANDA.md) hay un segundo
   escritor, el relevo (js/datos/supa-relevo.js), que manda la bandeja DIRECTO a la base cuando la
   empresa está en modo 'base'. Los dos tienen que hablarle a la base exactamente igual —los mismos
   nombres, los mismos sellos, el mismo `op_id`, la misma forma de leer un «no»—, y dos copias del
   traductor divergen en semanas. Por eso está aquí, una sola vez, y la sombra lo vuelve a exportar
   tal cual (sus pruebas y supabase/tests lo siguen importando de allá).

   Tres piezas (y una cuarta solo del relevo):
     · `traducir(op)`: qué funciones de la base llamar por una operación, con qué argumentos. PURA.
       Los gastos van aparte, en `traducirGasto(op)` (paso 3, 0025_gastos.sql): los manda el relevo y no la sombra.
     · `leerRespuesta(rpc, r)`: lo que contestó la base, en tres casos (ok, rechazada para siempre,
       reintentar). PURA.
     · `crearEscritor()`: manda UNA operación —sus llamadas en orden— y, si la base no conoce el
       proyecto con el id de este teléfono (la copia de la hoja le dio otro: `proy-hoja-V-###`), lo
       busca por su folio y reintenta. Recuerda lo resuelto mientras vive.

   Todas las funciones de la base son idempotentes (supabase/DISENO.md §7.4): el id de la operación
   viaja como `op_id` donde la función lo pide, el alta de una venta es por id y folio de cotización,
   y lo demás converge (el mismo valor con el mismo sello no escribe nada). Por eso reintentar es
   seguro, venga de la sombra o del relevo.
   ============================================================================ */

/** Los campos de dinero de un proyecto (los corrige `corregir_venta`), con su nombre en la base. */
export const DINERO = Object.freeze({ anti_pactado: 'anticipo', sub: 'subtotal', cuenta: 'cuenta',
  estatus_notion: 'estatus', pct_comision: 'pct_comision', nombre: 'nombre' });
/** Los de la obra que escribe `proyecto_actualizar`, con su nombre en la base. */
export const OBRA = Object.freeze({ notas: 'notas', tel: 'tel', dir_texto: 'dir_texto', entrega: 'entrega',
  plazo_k: 'plazo_k', entrecalles: 'entrecalles', ubicacion_pendiente: 'ubicacion_pendiente', contacto: 'contacto',
  negocio: 'negocio', tipo_trabajo: 'tipo_trabajo', compromiso_texto: 'compromiso_texto', fecha_ganado: 'fecha_anticipo' });
/** La ubicación es UN dato con cuatro campos: si cambia uno, viajan los cuatro. */
const UBICACION = ['lat', 'lng', 'maps_url', 'geo_fuente'];
/** Lo que va por `almacen_aplicar`: el libro, el catálogo y las listas de compra. */
export const ALMACEN = Object.freeze(['movimientos', 'materiales', 'requerimientos']);
const FOLIO_GLOBAL = /^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/;
const FOLIO_HOJA = /^V-\d{3,7}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const n = v => (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
const t = v => (v === null || v === undefined) ? '' : String(v);
const sinSync = d => { const o = { ...(d || {}) }; delete o.sync; return o; };

/** El sello de la cita: el de la instalación que la puso (igual que `selloDeInstalacion` del relevo de la hoja). */
export function selloDeCita(i) {
  if (!i || typeof i !== 'object') return 0;
  const a = Number(i.actualizado_en) || 0;
  if (Number(i.sello_hoja) > 0 && Number(i.sello_hoja_en) === a) return Number(i.sello_hoja);
  return a;
}

/**
 * Qué llamar en la base por una operación de la bandeja.
 * @param {Object} op la operación tal como estaba en la bandeja
 * @param {{folio_hoja?:string}} [extra] lo que la hoja contestó al aceptarla: `folio_hoja` es el
 *   V-### que la hoja le dio a una venta nueva, y viaja a `ganar_proyecto` para que la base use ese.
 *   Con la base mandando no hay hoja que lo dé: va vacío y la base saca el suyo de su contador.
 * @returns {{llamadas:Array<{rpc:string, args:Object, proyecto?:string}>}|{omitir:string}}
 *   `proyecto` marca la llamada cuyo id de proyecto se puede resolver por folio si la base no lo
 *   conoce con el id de este teléfono.
 */
export function traducir(op, extra = {}) {
  if (!op || typeof op !== 'object') return { omitir: 'La operación está vacía.' };
  const d = op.datos && typeof op.datos === 'object' ? op.datos : {};
  const sellos = d.sellos && typeof d.sellos === 'object' ? d.sellos : {};

  if (ALMACEN.includes(op.almacen)) {
    return { llamadas: [{ rpc: 'almacen_aplicar', args: { p_ops: [{ id: op.id, almacen: op.almacen, tipo: op.tipo,
      registro_id: op.registro_id || d.id, datos: sinSync(d), campos: Array.isArray(op.campos) ? op.campos : null }] } }] };
  }

  if (op.almacen === 'instalaciones') {
    const args = { id: d.id, proyecto_id: d.proyecto_id, fecha: d.fecha, hora: d.hora || null,
      ventana: d.ventana || 'dia', estado: d.estado || null, sello: selloDeCita(d) || Number(op.ts) || 0 };
    if (Number(d.duracion_min) > 0) args.duracion_min = Number(d.duracion_min);
    if (op.tipo === 'crear' && d.notas) args.notas = t(d.notas);
    return { llamadas: [{ rpc: 'instalacion_guardar', args: { p_op: args }, proyecto: t(d.proyecto_id) }] };
  }

  if (op.almacen !== 'proyectos') return { omitir: 'La base no guarda «' + t(op.almacen) + '» desde la bandeja.' };

  if (op.tipo === 'crear') {
    if (d.etapa === 'cancelado') {
      return { llamadas: [{ rpc: 'descartar_cotizacion', args: { p_op: {
        id: d.id, folio_global: d.folio_global, folio_local: t(d.folio_local), dispositivo: t(d.dispositivo),
        nombre: t(d.nombre), motivo: t(d.notas), sellos: { etapa: Number(sellos.etapa) || Number(op.ts) || 0 },
        ...(d.origen && typeof d.origen === 'object' ? { entrada: d.origen } : {}) } } }] };
    }
    if (!FOLIO_GLOBAL.test(t(d.folio_global))) {
      return { omitir: 'Una venta sin folio de cotización (importada de la hoja) la da de alta la importación, no este teléfono.' };
    }
    const venta = { sub: n(d.sub) ?? 0, anti: n(d.anti_pactado) ?? 0, iva: d.iva !== false };
    if (d.cuenta) venta.cuenta = d.cuenta;
    if (d.estatus_notion) venta.estatus = d.estatus_notion;
    if (n(d.pct_comision) !== null) venta.pct_comision = n(d.pct_comision);
    if (n(d.precio_auth) !== null) venta.precio_auth = n(d.precio_auth);
    const p = { id: d.id, folio_global: d.folio_global, folio_local: t(d.folio_local), dispositivo: t(d.dispositivo),
      nombre: t(d.nombre), contacto: t(d.contacto), negocio: t(d.negocio), tel: t(d.tel),
      tipo_trabajo: Array.isArray(d.tipo_trabajo) ? d.tipo_trabajo : [], entrega: d.entrega || null,
      plazo_k: n(d.plazo_k), notas: t(d.notas), dir_texto: t(d.dir_texto), entrecalles: t(d.entrecalles),
      maps_url: t(d.maps_url), geo_fuente: t(d.geo_fuente), ubicacion_pendiente: !!d.ubicacion_pendiente,
      compromiso_texto: t(d.compromiso_texto), sellos, venta };
    if (n(d.lat) !== null && n(d.lng) !== null) { p.lat = n(d.lat); p.lng = n(d.lng); }
    if (ISO.test(t(d.fecha_ganado))) p.fecha_anticipo = d.fecha_ganado;
    if (d.origen && typeof d.origen === 'object') p.entrada = d.origen;
    /* El V-### que ya le dio la hoja (Q-07): la base usa ESE. Va tal cual lo escribió la hoja; si
       no tiene el formato del libro o ya es de otro proyecto, la base lo rechaza con su motivo. */
    const folioHoja = t(extra && extra.folio_hoja).trim();
    if (folioHoja) p.folio_hoja = folioHoja;
    /* Mientras la hoja manda, la venta entra con el id que le pone la copia de cada madrugada
       (`proy-hoja-V-###`, scripts/importador/plan.mjs). Con el de este teléfono, la copia la armaba
       otra vez con el suyo, lo anotaba como conflicto y el día no cuadraba (hallazgo del
       2026-10-24). Lo que siga de este teléfono para esa venta la encuentra por folio (`resolver`),
       y `idLocal` lo deja resuelto desde ya. Con la base mandando no hay folio de la hoja ni copia
       que choque: la venta entra con el id de este teléfono, que es el que seguirán usando. */
    if (FOLIO_HOJA.test(folioHoja)) p.id = 'proy-hoja-' + folioHoja;
    return { llamadas: [{ rpc: 'ganar_proyecto', args: { p_op: p }, idLocal: t(d.id) }] };
  }

  /* Un cambio. Sin `campos` (una operación de una versión anterior) no se sabe qué cambió: se
     manda la obra completa con sus sellos —la base decide por sello y no pisa lo más nuevo— y ni
     el dinero ni la etapa, que solo viajan cuando se sabe que fueron lo que cambió. */
  const sabe = Array.isArray(op.campos);
  const campos = new Set(sabe ? op.campos : [...Object.keys(OBRA), ...UBICACION]);
  const llamadas = [];

  const obra = {};
  for (const [local, base] of Object.entries(OBRA)) {
    if (!campos.has(local) || !(local in d)) continue;
    if (local === 'fecha_ganado' && !ISO.test(t(d.fecha_ganado))) continue;
    obra[base] = d[local];
  }
  if (UBICACION.some(c => campos.has(c))) {
    obra.lat = n(d.lat); obra.lng = n(d.lng); obra.maps_url = t(d.maps_url); obra.geo_fuente = t(d.geo_fuente);
  }
  if (Object.keys(obra).length) {
    llamadas.push({ rpc: 'proyecto_actualizar', args: { p_op: { id: d.id, op_id: op.id, campos: obra, sellos } }, proyecto: t(d.id) });
  }

  const dinero = {};
  if (sabe) {
    for (const [local, base] of Object.entries(DINERO)) {
      if (!campos.has(local) || !(local in d)) continue;
      if (local === 'nombre' && !t(d.nombre).trim()) continue;
      dinero[base] = (local === 'sub' || local === 'anti_pactado' || local === 'pct_comision') ? n(d[local]) : d[local];
    }
  }
  if (Object.keys(dinero).length) {
    llamadas.push({ rpc: 'corregir_venta', args: { p_proyecto: d.id, p_cambios: dinero }, proyecto: t(d.id) });
  }

  if (sabe && campos.has('etapa') && d.etapa) {
    llamadas.push({ rpc: 'mover_etapa', args: { p_proyecto: d.id, p_etapa: d.etapa,
      p_sello: Number(sellos.etapa) || Number(op.ts) || null, p_motivo: '' }, proyecto: t(d.id) });
  }

  return llamadas.length ? { llamadas } : { omitir: 'De ese cambio no hay nada que la base guarde (marcas de este teléfono).' };
}

/* ============================================================================
   LOS GASTOS (paso 3 de «la base manda»: 0025_gastos.sql)
   ============================================================================ */

/* Lo que viaja de un gasto: los campos de la pestaña «Gastos» y nada de este teléfono (`en_hoja`, `subido_en`, `sync`, el sello de la
   bajada). Los mismos que mandaba /empujar_gastos. */
const CAMPOS_GASTO = ['id', 'fecha', 'concepto', 'categoria', 'monto', 'cuenta', 'folio', 'registro_por', 'registrado_en', 'anulado', 'anulo', 'anulado_en'];
function gastoQueViaja(d, idOp) {
  const g = {};
  for (const k of CAMPOS_GASTO) if (k in d) g[k] = d[k];
  g.id = t(d.id || idOp);
  g.anulado = d.anulado === true;
  if (!g.anulado) { g.anulo = ''; g.anulado_en = null; }
  return g;
}

/**
 * Qué llamar en la base por una operación de gastos (js/datos/gastos.js). PURA.
 *   · el alta ('crear'): `gasto_registrar` con el gasto como quedó en la bandeja. Si trae la anulación (un gasto que se volvió a encolar
 *     ya anulado), la base sigue la regla de la hoja: lo da de alta anulado, o anula el que ya tenía;
 *   · la anulación ('actualizar' con `anulado`): `gasto_anular`, con el gasto ENTERO en `gasto`, por si la base no lo tiene —el alta se
 *     perdió o nunca salió de otro teléfono—: entonces lo da de alta ya anulado, como la hoja;
 *   · cualquier otro cambio a un gasto es un alta otra vez: la base contesta «ya estaba». Un gasto no se corrige.
 * Va APARTE de `traducir` a propósito: la sombra (que copia lo que la hoja ya aceptó) no copia gastos —la copia de cada 3 horas ya los
 * trae de la hoja—, así que con la hoja mandando nada de esto sale. Solo el relevo de la base (js/datos/supa-relevo.js) lo usa.
 * @returns {{llamadas:Array<{rpc:string, args:Object}>}|{omitir:string}}
 */
export function traducirGasto(op) {
  if (!op || typeof op !== 'object' || op.almacen !== 'gastos') return { omitir: 'Esa operación no es de un gasto.' };
  const d = op.datos && typeof op.datos === 'object' ? op.datos : {};
  const g = gastoQueViaja(d, op.registro_id);
  if (!g.id) return { omitir: 'La operación no dice de qué gasto es.' };
  if (op.tipo !== 'crear' && g.anulado) {
    return { llamadas: [{ rpc: 'gasto_anular', args: { p_op: { op_id: t(op.id), id: g.id, anulo: t(g.anulo), anulado_en: n(g.anulado_en), gasto: g } } }] };
  }
  return { llamadas: [{ rpc: 'gasto_registrar', args: { p_op: { op_id: t(op.id), ...g } } }] };
}

/* ============================================================================
   LO QUE CONTESTA LA BASE
   ============================================================================ */

/** Los «no» que reintentar no arregla. */
export const DEFINITIVOS = Object.freeze(['ROL_SIN_PERMISO', 'NO_ENCONTRADO', 'DATO_INVALIDO', 'DUPLICADO', 'LOTE_RECHAZADO']);

/**
 * Lo que dijo la base de UNA llamada, en tres casos: 'ok', 'rechazada' (definitivo) o 'reintentar'.
 * @param {string} rpc
 * @param {{data:*, error:*}} r lo que devuelve `cliente.rpc()` de supabase-js
 */
export function leerRespuesta(rpc, r) {
  const error = r && r.error;
  if (error) {
    return { caso: 'reintentar', codigo: String(error.code || 'SIN_RED'), mensaje: String(error.message || 'La base no contestó.') };
  }
  const data = r ? r.data : null;
  if (!data || typeof data !== 'object') return { caso: 'reintentar', codigo: 'DESCONOCIDO', mensaje: 'La base contestó sin decir qué pasó.' };
  if (rpc === 'almacen_aplicar' && data.ok === true) {
    const x = Array.isArray(data.resultados) ? data.resultados[0] : null;
    if (!x) return { caso: 'reintentar', codigo: 'DESCONOCIDO', mensaje: 'La base contestó sin el resultado del almacén.' };
    if (x.ok === true) return { caso: 'ok', detalle: x.ya_estaba ? 'ya_estaba' : (x.creada ? 'creada' : 'ok') };
    data.ok = false; data.codigo = x.codigo; data.mensaje = x.mensaje;
  }
  if (data.ok === true) {
    /* `folio_hoja_pedido`: la base ya tenía esa venta con OTRO V-### (la dio de alta antes de 0015);
       no se cambia nada, pero queda en el registro. */
    if (data.ya_existia && data.folio_hoja_pedido) {
      return { caso: 'ok', detalle: 'ya_existia como ' + String(data.folio_hoja || '') + ', la hoja dice ' + String(data.folio_hoja_pedido) };
    }
    /* `ya_estaba`: un gasto que la base ya tenía (0025), el reintento de uno que sí llegó. */
    return { caso: 'ok', detalle: data.ya_existia ? 'ya_existia' : data.ya_estaba ? 'ya_estaba' : data.sin_cambio ? 'sin_cambio'
      : (Array.isArray(data.viejos) && data.viejos.length) ? 'gana_otro' : 'ok' };
  }
  const codigo = String(data.codigo || 'DESCONOCIDO');
  /* El alta de una venta que la base ya tiene con OTRO id (la trajo la importación): para la
     sombra es «ya estaba». Las operaciones siguientes la encuentran por su folio. */
  if (codigo === 'DUPLICADO' && (rpc === 'ganar_proyecto' || rpc === 'descartar_cotizacion')) return { caso: 'ok', detalle: 'ya_estaba' };
  const definitivo = DEFINITIVOS.includes(codigo) && (codigo !== 'LOTE_RECHAZADO' || data.definitivo === true);
  return { caso: definitivo ? 'rechazada' : 'reintentar', codigo, mensaje: String(data.mensaje || codigo) };
}

/* ============================================================================
   EL ESCRITOR: una operación contra la base, con sus llamadas en orden
   ============================================================================ */

/* Con qué buscar en la base un proyecto de este teléfono: su folio de cotización (solo una operación de
   proyecto lo trae) y el V-### que le dio la hoja o la base (el de la respuesta, o el que ya tiene). */
function foliosDe(op, folioHoja) {
  const d = (op && op.datos) || {};
  const esProyecto = !!op && op.almacen === 'proyectos';
  return { folio_global: esProyecto ? t(d.folio_global) : '',
           folio_hoja: t(folioHoja || (esProyecto ? (d.notion_page_id || d.folio_hoja) : '')) };
}

/* Cambia el id del proyecto en los argumentos de una llamada. */
function conId(llamada, id) {
  const a = JSON.parse(JSON.stringify(llamada.args));
  if ('p_proyecto' in a) a.p_proyecto = id;
  else if (a.p_op && llamada.rpc === 'instalacion_guardar') a.p_op.proyecto_id = id;
  else if (a.p_op) a.p_op.id = id;
  return a;
}

/**
 * El que escribe: manda una operación —sus llamadas, en orden— y lee lo que contestó la base. Lo usan
 * la sombra (cada copia de su cola) y el relevo (cada operación de la bandeja). Vive lo que vive quien
 * lo creó, y recuerda los proyectos que tuvo que buscar por folio para no volver a preguntar.
 */
export function crearEscritor() {
  const resueltos = new Map();          // id de este teléfono → {id, folio_hoja} en la base (por folio)

  /**
   * El id que la base conoce para un proyecto de este teléfono: el mismo, o el que tenga su folio de
   * cotización o su folio de la hoja (la importación pudo darle otro). null si no se sabe.
   * @param {Object} c el cliente de supabase-js
   * @param {string} idLocal
   * @param {{folio_global?:string, folio_hoja?:string}} folios
   */
  async function resolver(c, idLocal, folios = {}) {
    if (resueltos.has(idLocal)) return resueltos.get(idLocal).id;
    const fg = t(folios.folio_global), fh = t(folios.folio_hoja);
    const filtros = [];
    if (FOLIO_GLOBAL.test(fg)) filtros.push('folio_global.eq.' + fg);
    if (FOLIO_HOJA.test(fh)) filtros.push('folio_hoja.eq.' + fh);
    if (!filtros.length) return null;
    const { data, error } = await c.from('proyectos').select('id, folio_hoja').or(filtros.join(',')).limit(2);
    if (error || !Array.isArray(data) || data.length !== 1) return null;
    resueltos.set(idLocal, { id: data[0].id, folio_hoja: t(data[0].folio_hoja) });
    return data[0].id;
  }

  /**
   * Una operación contra la base.
   * @param {Object} c el cliente de supabase-js (con sesión)
   * @param {Object} op la operación de la bandeja
   * @param {{folio_hoja?:string, folios?:Object, llamadas?:Array}} [o]
   *   `folio_hoja`: el V-### que la hoja le dio al aceptarla (la sombra); `folios`: con qué buscar el
   *   proyecto si la base no conoce este id (el relevo los saca del proyecto vivo); `llamadas`: ya
   *   traducidas (el relevo quita antes lo que el área de esta cuenta no escribe).
   * @returns {Promise<{caso:'ok'|'omitida'|'rechazada'|'reintentar', codigo?:string, mensaje?:string,
   *   rpc?:string, detalle?:string, datos:Array<{rpc:string, data:Object}>}>} `datos`: lo que contestó
   *   cada llamada que salió bien, en orden (el V-### de un alta, lo que una no escribió y por qué).
   */
  async function mandar(c, op, o = {}) {
    let llamadas = o.llamadas;
    if (!llamadas) {
      const tr = traducir(op, { folio_hoja: o.folio_hoja });
      if (tr.omitir) return { caso: 'omitida', mensaje: tr.omitir, datos: [] };
      llamadas = tr.llamadas;
    }
    const folios = o.folios || foliosDe(op, o.folio_hoja);
    const detalles = [], datos = [];
    for (const ll of llamadas) {
      let args = ll.args;
      if (ll.proyecto && resueltos.has(ll.proyecto)) args = conId(ll, resueltos.get(ll.proyecto).id);
      let crudo = await c.rpc(ll.rpc, args);
      let r = leerRespuesta(ll.rpc, crudo);
      if (r.caso === 'rechazada' && r.codigo === 'NO_ENCONTRADO' && ll.proyecto) {
        const otro = await resolver(c, ll.proyecto, folios).catch(() => null);
        if (otro && otro !== ll.proyecto) {
          args = conId(ll, otro);
          crudo = await c.rpc(ll.rpc, args);
          r = leerRespuesta(ll.rpc, crudo);
        }
      }
      if (r.caso !== 'ok') return { ...r, rpc: ll.rpc, datos };
      if (ll.idLocal && args.p_op && args.p_op.id && args.p_op.id !== ll.idLocal) {
        resueltos.set(ll.idLocal, { id: args.p_op.id, folio_hoja: t(crudo && crudo.data && crudo.data.folio_hoja) });
      }
      datos.push({ rpc: ll.rpc, data: (crudo && crudo.data) || null });
      detalles.push(ll.rpc + (r.detalle && r.detalle !== 'ok' ? ' (' + r.detalle + ')' : ''));
    }
    return { caso: 'ok', detalle: detalles.join(', '), datos };
  }

  /** Lo que se sabe de un proyecto ya resuelto: {id, folio_hoja} en la base, o null. */
  const resuelto = idLocal => (resueltos.has(idLocal) ? { ...resueltos.get(idLocal) } : null);

  return { mandar, resolver, resuelto };
}
