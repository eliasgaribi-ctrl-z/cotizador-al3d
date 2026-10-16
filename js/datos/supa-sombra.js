/* ============================================================================
   LA SOMBRA — cada operación que la hoja aceptó, escrita TAMBIÉN en Supabase (fase 3).

   Apagada por omisión. Solo corre en el aparato donde Dirección la encendió (Ajustes → «Supabase
   (pruebas)»), con el interruptor general de Supabase encendido y con sesión en la base. La HOJA
   SIGUE MANDANDO: esto es una copia, y la copia nunca detiene, cambia ni pierde nada de lo de
   siempre.

   Cómo entra una operación. `sync.bombear` sube la bandeja a la hoja como siempre; cuando la hoja
   contesta que sí, llama al gancho `alSubir(op, respuesta)` (js/datos/sync.js) y este módulo
   guarda una copia de la operación en SU PROPIA cola, en otra base local (`al3d_sombra`), con el
   mismo id que tenía en la bandeja. Lo que la hoja rechazó o apartó no se copia: la base nueva
   recibe exactamente lo que la hoja aceptó.

   Cómo sale. `bombear()` recorre la cola en orden y traduce cada operación a las funciones de la
   base (supabase/DISENO.md §7.4: `ganar_proyecto`, `descartar_cotizacion`, `mover_etapa`,
   `proyecto_actualizar`, `corregir_venta`, `instalacion_guardar`, `almacen_aplicar`). Todas son
   idempotentes: el id de la operación de la bandeja viaja como `op_id` donde la función lo pide,
   el alta de una venta es por id y folio de cotización, y lo demás converge (el mismo valor con el
   mismo sello no escribe nada). Por eso reintentar es seguro.

     · Sí → sale de la cola y se anota en el registro.
     · No para siempre (`definitivo`: el rol no puede, el dato no es válido, no existe) → se aparta
       como «rechazada», con su razón, y el bombeo sigue con la siguiente. No se tira: se puede
       reintentar desde Ajustes.
     · Red, sesión vencida, acceso, versión de la app o un error que no se entiende → se queda en
       la cola, suma un intento, y el bombeo se para ahí (lo de atrás fallaría igual y el orden
       importa). Se reintenta en la siguiente vuelta: tras encolar, cada minuto con la app a la
       vista, al volver la señal, o con el botón.

   Todo lo que pasa se anota en el REGISTRO (la misma base local, los últimos 200 eventos), que
   Ajustes enseña a Dirección. Nada de esto escribe en la copia local de la app ni en la hoja.

   Lo que NO hace (y está escrito en docs/supabase/NOTAS-SEGUNDA-ENTREGA-CLIENTE.md):
     · «Registrar venta» del cotizador va directo a la hoja, fuera de la bandeja: no pasa por aquí.
     · Las notas de una instalación ya creada no viajan (la base pide el renglón nuevo, `anexo`, y
       la bandeja guarda las notas completas).
     · El V-### que la base le da a una venta nueva lo saca de su propio contador y puede no ser el
       de la hoja: el cuadre empareja por folio de cotización y lo reporta aparte.
   ============================================================================ */

/* ----- Los interruptores (fuera de Prefs.CLAVES: no viajan en los respaldos) ----- */
export const CLAVE_SOMBRA = 'al3d_pf_supa_sombra';
export const CLAVE_VIVO = 'al3d_pf_supa_vivo';
export const CLAVE_GENERAL = 'al3d_pf_supa';          // el de js/nucleo/supa.js

const ls = () => { try { return globalThis.localStorage || null; } catch (_) { return null; } };
function leerInterruptor(clave) {
  try { const v = JSON.parse(ls()?.getItem(clave) || 'null'); return !!(v && v.encendido === true); }
  catch (_) { return false; }
}
function ponerInterruptor(clave, si) {
  const s = ls(); if (!s) return;
  if (si) s.setItem(clave, JSON.stringify({ encendido: true, desde: Date.now() }));
  else s.removeItem(clave);
}
/** La sombra corre solo con el interruptor general Y el suyo. */
export const sombraEncendida = () => leerInterruptor(CLAVE_GENERAL) && leerInterruptor(CLAVE_SOMBRA);
/** La lectura en vivo pide los tres: sin la sombra, lo que este aparato escribe no llegaría a la
 *  base de la que lee, y cada bajada le regresaría el dinero que acaba de corregir. */
export const vivoEncendido = () => sombraEncendida() && leerInterruptor(CLAVE_VIVO);
export function encenderSombra(si) { ponerInterruptor(CLAVE_SOMBRA, si); if (!si) ponerInterruptor(CLAVE_VIVO, false); }
export function encenderVivo(si) { ponerInterruptor(CLAVE_VIVO, si); }

/* ============================================================================
   EL TRADUCTOR: una operación de la bandeja → las llamadas a la base. PURO.
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
const ALMACEN = ['movimientos', 'materiales', 'requerimientos'];
const FOLIO_GLOBAL = /^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const n = v => (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
const t = v => (v === null || v === undefined) ? '' : String(v);
const sinSync = d => { const o = { ...(d || {}) }; delete o.sync; return o; };

/** El sello de la cita: el de la instalación que la puso (igual que `selloDeInstalacion` del relevo). */
export function selloDeCita(i) {
  if (!i || typeof i !== 'object') return 0;
  const a = Number(i.actualizado_en) || 0;
  if (Number(i.sello_hoja) > 0 && Number(i.sello_hoja_en) === a) return Number(i.sello_hoja);
  return a;
}

/**
 * Qué llamar en la base por una operación de la bandeja.
 * @param {Object} op la operación tal como estaba en la bandeja
 * @returns {{llamadas:Array<{rpc:string, args:Object, proyecto?:string}>}|{omitir:string}}
 *   `proyecto` marca la llamada cuyo id de proyecto se puede resolver por folio si la base no lo
 *   conoce con el id de este teléfono.
 */
export function traducir(op) {
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
      return { omitir: 'Una venta sin folio de cotización (importada de la hoja) la da de alta la importación, no la sombra.' };
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
    return { llamadas: [{ rpc: 'ganar_proyecto', args: { p_op: p } }] };
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
    return { caso: 'ok', detalle: data.ya_existia ? 'ya_existia' : data.sin_cambio ? 'sin_cambio'
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
   EL ALMACÉN LOCAL DE LA SOMBRA: su propia base, `al3d_sombra`. Solo se abre encendida.
   ============================================================================ */

export const BASE = 'al3d_sombra';
const TOPE_REGISTRO = 200;

/** El almacén en IndexedDB (navegador). Tres almacenes: la cola, el registro y los cuadres. */
export function almacenIndexedDB() {
  let _db = null;
  const abrir = () => _db || (_db = new Promise((res, rej) => {
    const r = globalThis.indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('cola')) db.createObjectStore('cola', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('registro')) db.createObjectStore('registro', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cuadres')) db.createObjectStore('cuadres', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { _db = null; rej(r.error); };
  }));
  const tx = async (almacen, modo, fn) => {
    const db = await abrir();
    return new Promise((res, rej) => {
      const x = db.transaction(almacen, modo);
      const pet = fn(x.objectStore(almacen));
      x.oncomplete = () => res(pet ? pet.result : undefined);
      x.onerror = () => rej(x.error);
    });
  };
  return {
    listar: almacen => tx(almacen, 'readonly', s => s.getAll()).then(l => l || []),
    poner: (almacen, reg) => tx(almacen, 'readwrite', s => s.put(reg)),
    borrar: (almacen, id) => tx(almacen, 'readwrite', s => s.delete(id)),
  };
}

/** El mismo almacén, en memoria (las pruebas de node). */
export function almacenEnMemoria() {
  const m = { cola: new Map(), registro: new Map(), cuadres: new Map() };
  return {
    listar: async a => [...m[a].values()].map(x => JSON.parse(JSON.stringify(x))),
    poner: async (a, r) => { m[a].set(r.id, JSON.parse(JSON.stringify(r))); },
    borrar: async (a, id) => { m[a].delete(id); },
    _m: m,
  };
}

/* ============================================================================
   LA SOMBRA
   ============================================================================ */

/**
 * @param {{cliente:function():Promise<Object>, almacen:Object, ahora?:function():number,
 *          enLinea?:function():boolean}} deps
 *   `cliente` da el cliente de supabase-js (con sesión); `almacen` es `almacenIndexedDB()` o
 *   `almacenEnMemoria()`.
 */
export function crearSombra(deps) {
  const almacen = deps.almacen;
  const ahora = deps.ahora || (() => Date.now());
  const enLinea = deps.enLinea || (() => !(typeof navigator !== 'undefined' && navigator.onLine === false));
  let _bombeando = null;
  let _ultimoError = '';
  let _seq = 0;
  const resueltos = new Map();          // id de este teléfono → id en la base (por folio)

  async function anotar(evento) {
    const ts = ahora();
    const id = String(ts).padStart(15, '0') + '-' + String(++_seq).padStart(4, '0');
    try {
      await almacen.poner('registro', { id, ts, ...evento });
      const todos = (await almacen.listar('registro')).sort((a, b) => (a.id < b.id ? -1 : 1));
      for (const viejo of todos.slice(0, Math.max(0, todos.length - TOPE_REGISTRO))) await almacen.borrar('registro', viejo.id);
    } catch (_) { /* el registro es aviso: no detiene nada */ }
  }

  /** Lo que llama `sync` (el gancho `alSubir`): guarda la copia. Nunca lanza. */
  async function encolar(op, respuesta) {
    if (!op || !op.id) return;
    try {
      const remoto = respuesta && respuesta.remoto;
      await almacen.poner('cola', { id: String(op.id), op: JSON.parse(JSON.stringify(op)),
        folio_hoja: (remoto && remoto.id_notion) ? String(remoto.id_notion) : '',
        estado: 'pendiente', intentos: 0, ultimo_error: '', creado: ahora() });
    } catch (e) {
      await anotar({ tipo: 'no_se_guardo', op_id: String(op.id), mensaje: String((e && e.message) || e) });
    }
  }

  /** La cola en orden de llegada. */
  async function cola() {
    return (await almacen.listar('cola')).sort((a, b) => (a.creado - b.creado) || (a.id < b.id ? -1 : 1));
  }

  /* El id que la base conoce para un proyecto de este teléfono: el mismo, o el que tenga su folio
     de cotización o su folio de la hoja (la importación pudo darle otro). */
  async function resolver(c, idLocal, op, item) {
    if (resueltos.has(idLocal)) return resueltos.get(idLocal);
    const d = (op && op.datos) || {};
    const fg = op.almacen === 'proyectos' ? t(d.folio_global) : '';
    const fh = t(item.folio_hoja || (op.almacen === 'proyectos' ? (d.notion_page_id || d.folio_hoja) : ''));
    const filtros = [];
    if (FOLIO_GLOBAL.test(fg)) filtros.push('folio_global.eq.' + fg);
    if (/^V-\d{3,7}$/.test(fh)) filtros.push('folio_hoja.eq.' + fh);
    if (!filtros.length) return null;
    const { data, error } = await c.from('proyectos').select('id').or(filtros.join(',')).limit(2);
    if (error || !Array.isArray(data) || data.length !== 1) return null;
    resueltos.set(idLocal, data[0].id);
    return data[0].id;
  }

  /* Cambia el id del proyecto en los argumentos de una llamada. */
  function conId(llamada, id) {
    const a = JSON.parse(JSON.stringify(llamada.args));
    if ('p_proyecto' in a) a.p_proyecto = id;
    else if (a.p_op && llamada.rpc === 'instalacion_guardar') a.p_op.proyecto_id = id;
    else if (a.p_op) a.p_op.id = id;
    return a;
  }

  /** Una operación de la cola contra la base. */
  async function mandarUna(c, item) {
    const tr = traducir(item.op);
    if (tr.omitir) return { caso: 'omitida', mensaje: tr.omitir };
    const detalles = [];
    for (const ll of tr.llamadas) {
      let args = ll.args;
      if (ll.proyecto && resueltos.has(ll.proyecto)) args = conId(ll, resueltos.get(ll.proyecto));
      let r = leerRespuesta(ll.rpc, await c.rpc(ll.rpc, args));
      if (r.caso === 'rechazada' && r.codigo === 'NO_ENCONTRADO' && ll.proyecto) {
        const otro = await resolver(c, ll.proyecto, item.op, item).catch(() => null);
        if (otro && otro !== ll.proyecto) r = leerRespuesta(ll.rpc, await c.rpc(ll.rpc, conId(ll, otro)));
      }
      if (r.caso !== 'ok') return { ...r, rpc: ll.rpc };
      detalles.push(ll.rpc + (r.detalle && r.detalle !== 'ok' ? ' (' + r.detalle + ')' : ''));
    }
    return { caso: 'ok', detalle: detalles.join(', ') };
  }

  async function bombearDeVerdad() {
    if (!enLinea()) return { mandadas: 0, rechazadas: 0, omitidas: 0, pendientes: (await pendientes()).length, motivo: 'sin_red' };
    const lista = (await cola()).filter(x => x.estado === 'pendiente');
    if (!lista.length) return { mandadas: 0, rechazadas: 0, omitidas: 0, pendientes: 0, motivo: 'nada' };
    let c;
    try { c = await deps.cliente(); } catch (e) {
      _ultimoError = String((e && e.message) || 'Supabase no cargó.');
      return { mandadas: 0, rechazadas: 0, omitidas: 0, pendientes: lista.length, motivo: 'sin_cliente', mensaje: _ultimoError };
    }
    let mandadas = 0, rechazadas = 0, omitidas = 0, parada = '';
    for (const item of lista) {
      let r;
      try { r = await mandarUna(c, item); }
      catch (e) { r = { caso: 'reintentar', codigo: 'SIN_RED', mensaje: String((e && e.message) || e) }; }
      const quien = { op_id: item.id, almacen: item.op.almacen, tipo: item.op.tipo, registro: t(item.op.registro_id) };
      if (r.caso === 'ok' || r.caso === 'omitida') {
        await almacen.borrar('cola', item.id);
        if (r.caso === 'ok') mandadas++; else omitidas++;
        await anotar({ ...quien, tipo: r.caso === 'ok' ? 'escrita' : 'omitida', mensaje: r.detalle || r.mensaje || '' });
        continue;
      }
      if (r.caso === 'rechazada') {
        await almacen.poner('cola', { ...item, estado: 'rechazada', intentos: item.intentos + 1,
          ultimo_error: r.mensaje, codigo: r.codigo, rpc: r.rpc || '' });
        rechazadas++;
        await anotar({ ...quien, tipo: 'rechazada', codigo: r.codigo, rpc: r.rpc || '', mensaje: r.mensaje });
        continue;
      }
      await almacen.poner('cola', { ...item, intentos: item.intentos + 1, ultimo_error: r.mensaje, codigo: r.codigo, rpc: r.rpc || '' });
      _ultimoError = r.mensaje;
      parada = r.codigo;
      await anotar({ ...quien, tipo: 'reintentar', codigo: r.codigo, rpc: r.rpc || '', mensaje: r.mensaje });
      break;
    }
    if (mandadas && !parada) _ultimoError = '';
    return { mandadas, rechazadas, omitidas, pendientes: (await pendientes()).length, motivo: parada ? 'parada' : 'ok', codigo: parada };
  }

  /** Manda la cola. Uno a la vez: quien llega segundo espera el mismo. Nunca lanza. */
  function bombear() {
    if (_bombeando) return _bombeando;
    _bombeando = bombearDeVerdad().catch(e => ({ mandadas: 0, motivo: 'error', mensaje: String((e && e.message) || e) }))
      .finally(() => { _bombeando = null; });
    return _bombeando;
  }

  async function pendientes() { return (await cola()).filter(x => x.estado === 'pendiente'); }
  async function rechazadas() { return (await cola()).filter(x => x.estado === 'rechazada'); }

  /** Vuelve a la cola lo rechazado (después de arreglar la causa en la base). */
  async function reintentarRechazadas() {
    let k = 0;
    for (const x of await rechazadas()) { await almacen.poner('cola', { ...x, estado: 'pendiente', ultimo_error: '' }); k++; }
    if (k) await anotar({ tipo: 'reintento', mensaje: k + ' devueltas a la cola' });
    return k;
  }

  async function registro(n = 20) {
    return (await almacen.listar('registro')).sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, n);
  }

  async function estado() {
    const todo = await cola();
    return { pendientes: todo.filter(x => x.estado === 'pendiente').length,
             rechazadas: todo.filter(x => x.estado === 'rechazada').length, ultimo_error: _ultimoError,
             bombeando: !!_bombeando };
  }

  return { encolar, bombear, pendientes, rechazadas, reintentarRechazadas, registro, estado, anotar };
}
