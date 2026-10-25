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

   El V-### de una venta nueva (Q-07, decidida por Elías el 2026-10-16): es el MISMO que le dio la
   hoja. La hoja contesta el alta con su folio (`remoto.id_notion`), la cola lo guarda con la copia
   (`folio_hoja`) y `ganar_proyecto` lo recibe (0015_folio_de_la_hoja.sql): la base lo valida (formato
   del libro, que nadie más lo tenga) y lo usa en vez de sacar uno de su contador. Si choca, la base
   contesta DATO_INVALIDO con `causa: 'folio_ocupado'` y la copia se APARTA como rechazada con ese
   motivo, sin detener las demás. Sin folio de la hoja (una respuesta vieja) se manda como antes y la
   base pone el suyo; el cuadre empareja esas por folio de cotización.
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
   EL TRADUCTOR y LO QUE CONTESTA LA BASE: en js/datos/supa-traductor.js, que comparten la sombra y
   el relevo de «la base manda» (js/datos/supa-relevo.js). Se vuelven a exportar aquí tal cual: las
   pruebas y supabase/tests los importan de este archivo desde que existen.
   ============================================================================ */

import { traducir, leerRespuesta, DINERO, OBRA, DEFINITIVOS, selloDeCita, crearEscritor } from './supa-traductor.js';
export { traducir, leerRespuesta, DINERO, OBRA, DEFINITIVOS, selloDeCita };

const t = v => (v === null || v === undefined) ? '' : String(v);

/* ============================================================================
   EL ALMACÉN LOCAL DE LA SOMBRA: su propia base, `al3d_sombra`. Solo se abre encendida.
   ============================================================================ */

export const BASE = 'al3d_sombra';
const TOPE_REGISTRO = 200;

/** El almacén en IndexedDB (navegador). Cuatro almacenes: la cola, el registro, los cuadres y las imágenes ya subidas a la nube
 *  (js/datos/supa-imagenes.js; llegó en la versión 2: abrir la 1 de antes solo agrega ese almacén, no toca los otros). */
export const VERSION_BASE = 2;
export const ALMACENES_SOMBRA = Object.freeze(['cola', 'registro', 'cuadres', 'imagenes']);
export function almacenIndexedDB() {
  let _db = null;
  const abrir = () => _db || (_db = new Promise((res, rej) => {
    const r = globalThis.indexedDB.open(BASE, VERSION_BASE);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const a of ALMACENES_SOMBRA) if (!db.objectStoreNames.contains(a)) db.createObjectStore(a, { keyPath: 'id' });
    };
    /* Otra pestaña con una versión más nueva quiere subir la base: se cierra esta conexión para no
       detenerla, y la siguiente operación abre otra. */
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); _db = null; }; res(db); };
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
  const m = Object.fromEntries(ALMACENES_SOMBRA.map(a => [a, new Map()]));
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
  /* El que escribe (js/datos/supa-traductor.js): traduce, llama en orden y busca por folio el proyecto que la
     base conoce con otro id. El mismo que usa el relevo de «la base manda». */
  const escritor = crearEscritor();

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

  /** Una operación de la cola contra la base, con el V-### que la hoja le dio al aceptarla. */
  function mandarUna(c, item) {
    return escritor.mandar(c, item.op, { folio_hoja: item.folio_hoja });
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
