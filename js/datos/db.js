/* ============================================================================
   IndexedDB: la capa física de la plataforma.

   Por qué IndexedDB y no localStorage: `saveHistorial()` del cotizador ya degrada cuando
   se llena la cuota, y lo hace soltando las imágenes de las cotizaciones viejas. Un libro
   de movimientos de almacén creciendo sin techo en localStorage acabaría destruyendo la
   referencia visual del historial —el único dato irrecuperable del sistema— para guardar
   una salida de acrílico. Verificado: el cotizador no usa IndexedDB en ninguna línea, así
   que este origen la tiene virgen y no hay nada con lo que chocar.

   Reglas de esta capa, sin excepción:
   - Las LECTURAS nunca lanzan y nunca devuelven undefined. Devuelven [], null o 0. Si la
     base no abrió, `estado()` lo dice y la interfaz pinta la banda de degradación.
   - Las MUTACIONES devuelven Promise<Resultado> y nunca lanzan. El mensaje viene ya
     escrito en español, listo para toast(r.mensaje,'err').

   Es a propósito: una pantalla que se cae con una excepción no le dice nada al usuario, y
   la mitad de los modos de falla de esto —cuota llena, Safari en privado, la base
   bloqueada por otra pestaña— son estados normales, no errores de programación.
   ============================================================================ */

export const NOMBRE = 'al3d_pf';
/* Versión 2 (septiembre de 2026): nace el almacén `bitacora`. Subir el número es lo que hace
   que `onupgradeneeded` corra en una base que ya existía y le cree el almacén que le falta;
   los demás no se tocan, porque el bucle de abajo solo crea lo que no está.
   Versión 3 (septiembre de 2026): nace `ventas_hoja`, el espejo del récord de ventas de la hoja
   de finanzas —TODAS sus filas, tengan o no proyecto en este teléfono—. Es lo que hace que
   Control sume lo que la hoja dice y no solo lo que se registró desde este aparato. */
export const VERSION = 3;

export const ALMACENES = ['proyectos', 'instalaciones', 'materiales', 'movimientos',
                          'requerimientos', 'avisos', 'constantes', 'pendientes', 'geo', 'blobs',
                          'bitacora', 'ventas_hoja'];

/* Lo que se vuelve a bajar solo y por eso no entra al respaldo ni se cuenta como dato del
   teléfono: la bandeja de salida (reenviarla duplicaría operaciones) y el espejo de la hoja
   (la hoja es la dueña; un respaldo viejo resucitaría filas que allá ya se borraron). */
export const NO_RESPALDA = ['pendientes', 'ventas_hoja'];

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok  = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

const MSG = {
  DB_NO_DISPONIBLE: 'No se pudo abrir la base de este dispositivo. Nada de lo que hagas se va a guardar.',
  SIN_ESPACIO: 'No hay espacio en este dispositivo. Respalda la plataforma y borra proyectos viejos.',
  NO_ENCONTRADO: 'Eso ya no existe.',
  DATO_INVALIDO: 'Ese dato no tiene la forma que se esperaba.',
  DESCONOCIDO: 'Algo falló al guardar y no se pudo saber qué.',
};

let _db = null;
let _estado = { ok: false, motivo: 'sin_abrir' };
let _abriendo = null;

/* El esquema en un solo lugar. Cada índice existe porque hay una consulta concreta que sin
   él tendría que recorrer todo: la agenda pide por fecha, el mapa por etapa, el stock pide
   los movimientos de UN material en orden de tiempo, y la bandeja de salida pide lo que
   todavía no se ha mandado. */
const ESQUEMA = {
  proyectos:      { keyPath: 'id', indices: [
    ['porEtapa', 'etapa'], ['porFecha', 'fecha_ganado'], ['porFolio', 'folio_global']] },
  instalaciones:  { keyPath: 'id', indices: [
    ['porFecha', 'fecha'], ['porProyecto', 'proyecto_id']] },
  materiales:     { keyPath: 'id', indices: [['porFamilia', 'familia']] },
  movimientos:    { keyPath: 'id', indices: [
    ['porMaterial', ['material_id', 'ts']], ['porProyecto', 'proyecto_id'], ['porSync', 'sync']] },
  requerimientos: { keyPath: 'id', indices: [
    ['porProyecto', 'proyecto_id'], ['porMaterial', 'material_id']] },
  avisos:         { keyPath: 'rid', indices: [['porEstado', 'estado']] },
  constantes:     { keyPath: 'clave', indices: [] },
  pendientes:     { keyPath: 'id', indices: [['porTs', 'ts']] },
  geo:            { keyPath: 'q', indices: [] },
  blobs:          { keyPath: 'id', indices: [] },
  /* La bitácora: quién hizo qué y cuándo, en toda la plataforma. Append-only como el libro
     del almacén; se pide por tiempo (la pantalla de Control) y por lo que se tocó (la ficha
     de un proyecto). */
  bitacora:       { keyPath: 'id', indices: [['porTs', 'ts'], ['porEntidad', 'entidad_id']] },
  /* El espejo de la hoja de finanzas: una fila por venta, con el folio interno de la hoja
     (V-042) como id. Se pide por la fecha del anticipo (los meses de Control) y por el folio
     de cotización (para atar la fila al proyecto de este teléfono, cuando lo hay). */
  ventas_hoja:    { keyPath: 'id', indices: [
    ['porFecha', 'fecha_anticipo'], ['porFolio', 'folio_cotizacion']] },
};

/**
 * Abre (y migra) la base. Idempotente: llamadas simultáneas comparten la misma promesa.
 * Llamar UNA vez desde app.js antes de montar nada.
 * @returns {Promise<boolean>}
 */
export function abrir() {
  if (_db) return Promise.resolve(true);
  if (_abriendo) return _abriendo;
  _abriendo = new Promise(resolve => {
    if (!('indexedDB' in window) || !window.indexedDB) {
      _estado = { ok: false, motivo: 'sin_indexeddb' };
      return resolve(false);
    }
    let pet;
    /* En Safari en navegación privada el simple hecho de pedir la base lanza. No es un
       error de programación: es un modo de uso, y hay que sobrevivirlo diciéndolo. */
    try { pet = indexedDB.open(NOMBRE, VERSION); }
    catch (_) { _estado = { ok: false, motivo: 'bloqueada' }; return resolve(false); }

    pet.onupgradeneeded = ev => {
      const db = pet.result;
      for (const nombre of ALMACENES) {
        const def = ESQUEMA[nombre];
        let st;
        if (!db.objectStoreNames.contains(nombre)) st = db.createObjectStore(nombre, { keyPath: def.keyPath });
        else st = pet.transaction.objectStore(nombre);
        for (const [iNombre, iCampo] of def.indices) {
          if (!st.indexNames.contains(iNombre)) st.createIndex(iNombre, iCampo);
        }
      }
      /* Migraciones futuras van aquí, colgadas de ev.oldVersion. Se deja el hueco escrito
         para que la primera no tenga que inventar dónde va. */
      void ev;
    };
    pet.onsuccess = () => {
      _db = pet.result;
      _estado = { ok: true, motivo: 'ok' };
      /* Otra pestaña pidió una versión nueva: hay que soltar la conexión o su
         onupgradeneeded se queda colgado para siempre. */
      _db.onversionchange = () => { try { _db.close(); } catch (_) {} _db = null;
        _estado = { ok: false, motivo: 'bloqueada' }; };
      /* Una conexión cerrada por el navegador (desalojo, pestaña dormida en iOS) deja
         todo fallando en silencio. Marcarlo hace que la banda de degradación aparezca. */
      _db.onclose = () => { _db = null; _estado = { ok: false, motivo: 'bloqueada' }; };
      resolve(true);
    };
    pet.onerror = () => {
      _estado = { ok: false, motivo: pet.error && pet.error.name === 'QuotaExceededError'
        ? 'sin_espacio' : 'bloqueada' };
      resolve(false);
    };
    pet.onblocked = () => { _estado = { ok: false, motivo: 'bloqueada' }; resolve(false); };
  }).finally(() => { _abriendo = null; });
  return _abriendo;
}

/** @returns {{ok:boolean, motivo:'ok'|'sin_abrir'|'sin_indexeddb'|'bloqueada'|'sin_espacio'}} */
export function estado() { return { ..._estado }; }

/** Lo que la banda de degradación dice, según el motivo. Una sola redacción para toda la app. */
export function motivoTexto() {
  switch (_estado.motivo) {
    case 'ok': return '';
    case 'sin_indexeddb': return 'Este navegador no guarda datos de la plataforma. Ábrela en Chrome o en Safari normal.';
    case 'sin_espacio': return 'Este dispositivo se quedó sin espacio. Respalda y borra proyectos viejos.';
    case 'bloqueada': return 'La plataforma está abierta en otra ventana, o el navegador cerró su base. Recarga y usa una sola.';
    default: return 'La base todavía no abrió.';
  }
}

function tx(almacenes, modo) {
  if (!_db) return null;
  try { return _db.transaction(almacenes, modo); } catch (_) { return null; }
}

/* Toda petición se envuelve igual. `onerror` NO basta: hay fallas que solo llegan por
   `transaction.onabort` —la cuota es la principal—, así que se escuchan las dos. Pero el
   `onabort` de aquí solo cuenta mientras la petición no haya contestado; para una escritura
   eso no alcanza, y por eso existe `confirmada`, justo abajo. */
function pedir(peticion, transaccion) {
  return new Promise(resolve => {
    let listo = false;
    const cerrar = v => { if (!listo) { listo = true; resolve(v); } };
    peticion.onsuccess = () => cerrar({ ok: true, valor: peticion.result });
    peticion.onerror = ev => { ev.preventDefault(); cerrar({ ok: false, err: peticion.error }); };
    if (transaccion) transaccion.onabort = () => cerrar({ ok: false, err: transaccion.error });
  });
}

/* Y la petición que sale bien TODAVÍA NO ES UN DATO GUARDADO. Chrome avisa la cuota llena
   como un `abort` de la transacción que llega DESPUÉS de que el `put` ya disparó su
   `onsuccess`: resolver ahí, como hacía `poner` hasta septiembre de 2026, contestaba «ok» a
   cuatro fotos de 900 KB cuando solo la primera había quedado escrita, y el SIN_ESPACIO que
   la cabecera promete no salía nunca. Lo que vale es el `complete` de la transacción, igual
   que en `ponerVarios`. Se escucha con addEventListener para no pisar el `onabort` que pone
   `pedir`, y se engancha ANTES de la última petición para no llegar tarde al evento. */
function confirmada(transaccion) {
  return new Promise(resolve => {
    transaccion.addEventListener('complete', () => resolve({ ok: true }));
    transaccion.addEventListener('abort', () => resolve({ ok: false, err: transaccion.error }));
  });
}

/* Y hay una tercera manera de fallar, que no pasa por ningún evento: la petición LANZA en el
   acto, al pedirla. Una clave que no es clave —null, un objeto, NaN, un booleano— hace lanzar
   DataError al `get`, al `put` o al `delete` mismos, y lo que no se puede clonar, DataCloneError
   al `put`. Dentro de una función async eso rechaza la promesa, y las dos reglas de la cabecera
   se caen juntas: la mutación lanza, y la transacción sigue viva con lo que ya se había pedido,
   que se confirma sola. Pasó restaurando: un respaldo con `"id": null` detrás de un proyecto
   bueno dejaba el bueno escrito, la pantalla sin aviso y el campo de archivo sin vaciar. Por eso
   toda petición que lleva un dato de fuera se pide dentro de un try, y si lanza se aborta a mano:
   es lo único que deshace lo que la misma transacción ya llevaba. */
const abortar = t => { try { t.abort(); } catch (_) { /* ya había terminado: nada que deshacer */ } };

const esCuota = err => !!err && (err.name === 'QuotaExceededError' || err.code === 22);
/* Lo que la base rechaza por su FORMA no es una falla del aparato: el mensaje en inglés del
   navegador («…is not a valid key») no le dice nada a nadie en el taller. */
const esForma = err => !!err && (err.name === 'DataError' || err.name === 'DataCloneError');
const traducir = err => esCuota(err)
  ? mal('SIN_ESPACIO', MSG.SIN_ESPACIO)
  : esForma(err) ? mal('DATO_INVALIDO', MSG.DATO_INVALIDO)
  : mal('DESCONOCIDO', (err && err.message) ? 'No se pudo guardar: ' + err.message : MSG.DESCONOCIDO);

/**
 * Inserta o reemplaza. Sella `actualizado_en`; si es nuevo, sella `creado_en`.
 * @returns {Promise<Resultado>} valor = el registro sellado
 */
export async function poner(almacen, registro) {
  if (!_db) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  if (!registro || typeof registro !== 'object') return mal('DATO_INVALIDO', MSG.DATO_INVALIDO);
  const clave = ESQUEMA[almacen] ? ESQUEMA[almacen].keyPath : 'id';
  if (registro[clave] === undefined || registro[clave] === null || registro[clave] === '') {
    return mal('DATO_INVALIDO', 'Falta el identificador del registro.');
  }
  const t = tx([almacen], 'readwrite');
  if (!t) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const fin = confirmada(t);   // ver `confirmada`: el ok es el de la transacción, no el del put
  const st = t.objectStore(almacen);
  /* Un id que llega pero no es clave (un objeto, NaN) lanza aquí, en el `get`; y lo que no se
     clona, en el `put`. Ver `abortar`. */
  let pet;
  try { pet = st.get(registro[clave]); } catch (e) { abortar(t); return traducir(e); }
  const previo = await pedir(pet, t);
  const ahora = Date.now();
  const sellado = { ...registro, actualizado_en: ahora };
  if (!(previo.ok && previo.valor)) sellado.creado_en = registro.creado_en || ahora;
  else sellado.creado_en = previo.valor.creado_en || registro.creado_en || ahora;
  try { pet = st.put(sellado); } catch (e) { abortar(t); return traducir(e); }
  const r = await pedir(pet, t);
  if (!r.ok) return traducir(r.err);
  const f = await fin;
  return f.ok ? ok(sellado) : traducir(f.err);
}

/**
 * Una sola transacción. Todo o nada: si uno falla, ninguno queda escrito.
 *
 * `conservarSello` es para la restauración y para nada más. Un registro que sale de un
 * respaldo trae la fecha en que de verdad se editó; sellarlo con «ahora» lo hacía pasar por
 * más nuevo que cualquier otro respaldo, y restaurar primero el archivo equivocado hacía que
 * el bueno —el más reciente— se rechazara entero con «aquí eran más nuevos».
 * @param {{conservarSello?:boolean}} [opts]
 * @returns {Promise<Resultado>} valor = cuántos escribió
 */
export async function ponerVarios(almacen, registros, opts = {}) {
  if (!_db) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  if (!Array.isArray(registros)) return mal('DATO_INVALIDO', MSG.DATO_INVALIDO);
  if (!registros.length) return ok(0);
  if (registros.some(r => !r || typeof r !== 'object')) return mal('DATO_INVALIDO', MSG.DATO_INVALIDO);
  const t = tx([almacen], 'readwrite');
  if (!t) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const st = t.objectStore(almacen);
  const ahora = Date.now();
  const conservar = !!(opts && opts.conservarSello);
  return new Promise(resolve => {
    let err = null;
    /* El «todo o nada» lo cumple el ABORTO, y hay que pedirlo. El `preventDefault` del onerror
       le quita a la base su aborto automático: sin el `abort()` de aquí, un put que contestaba
       error dejaba confirmar a los demás. Y un put que LANZA (ver `abortar`) no llega a ningún
       onerror. Los oyentes van ANTES del bucle porque el bucle se puede cortar a la mitad. */
    const tirar = e => { if (!err) err = e; abortar(t); };
    t.oncomplete = () => resolve(err ? traducir(err) : ok(registros.length));
    t.onabort = () => resolve(traducir(err || t.error));
    t.onerror = ev => { ev.preventDefault(); };
    for (const reg of registros) {
      /* Sin sello en el archivo —un respaldo de antes de que existiera— se sella hoy, como
         siempre: no hay otra fecha que poner. */
      const sello = conservar && Number(reg.actualizado_en) > 0 ? Number(reg.actualizado_en) : ahora;
      const sellado = { ...reg, actualizado_en: sello, creado_en: reg.creado_en || ahora };
      let p;
      try { p = st.put(sellado); } catch (e) { tirar(e); return; }
      p.onerror = ev => { ev.preventDefault(); tirar(p.error); };
    }
  });
}

/** @returns {Promise<Object|null>} el registro o null. NUNCA lanza. */
export async function obtener(almacen, id) {
  if (!_db || id === undefined || id === null) return null;
  const t = tx([almacen], 'readonly'); if (!t) return null;
  /* Un id que no es clave —un objeto, NaN— lanza en el `get` mismo (ver `abortar`). Con esa
     clave no puede haber nada guardado, así que null es la verdad, no un disimulo. */
  let pet;
  try { pet = t.objectStore(almacen).get(id); } catch (_) { return null; }
  const r = await pedir(pet, t);
  return r.ok && r.valor ? r.valor : null;
}

/**
 * @param {{indice?:string, rango?:IDBKeyRange, limite?:number, desc?:boolean, filtro?:Function}} opts
 * @returns {Promise<Object[]>} array; vacío si algo falló. NUNCA lanza.
 */
export async function listar(almacen, opts = {}) {
  if (!_db) return [];
  const t = tx([almacen], 'readonly'); if (!t) return [];
  let fuente;
  try {
    const st = t.objectStore(almacen);
    fuente = opts.indice ? st.index(opts.indice) : st;
  } catch (_) { return []; }
  const limite = opts.limite > 0 ? opts.limite : Infinity;
  const filtro = typeof opts.filtro === 'function' ? opts.filtro : null;
  return new Promise(resolve => {
    const out = [];
    let pet;
    try { pet = fuente.openCursor(opts.rango || null, opts.desc ? 'prev' : 'next'); }
    catch (_) { return resolve([]); }
    pet.onsuccess = () => {
      const c = pet.result;
      if (!c || out.length >= limite) return resolve(out);
      if (!filtro || filtro(c.value)) out.push(c.value);
      c.continue();
    };
    pet.onerror = ev => { ev.preventDefault(); resolve(out); };
    t.onabort = () => resolve(out);
  });
}

export async function contar(almacen, opts = {}) {
  if (!_db) return 0;
  /* Con filtro no hay atajo: `count()` no sabe de predicados y contar a mano es lo
     honesto. Sin filtro sí lo hay, y es mucho más rápido. */
  if (opts.filtro) return (await listar(almacen, opts)).length;
  const t = tx([almacen], 'readonly'); if (!t) return 0;
  try {
    const st = t.objectStore(almacen);
    const f = opts.indice ? st.index(opts.indice) : st;
    const r = await pedir(f.count(opts.rango || null), t);
    return r.ok ? (r.valor || 0) : 0;
  } catch (_) { return 0; }
}

/* Borrar y vaciar también esperan a la transacción (ver `confirmada`): un borrado que la
   base deshizo al abortar no es un borrado, y decir «listo» ahí deja el registro vivo. */
export async function borrar(almacen, id) {
  if (!_db) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const t = tx([almacen], 'readwrite'); if (!t) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const fin = confirmada(t);
  /* Un id null o de objeto lanza en el `delete` mismo (ver `abortar`). */
  let pet;
  try { pet = t.objectStore(almacen).delete(id); } catch (e) { abortar(t); return traducir(e); }
  const r = await pedir(pet, t);
  if (!r.ok) return traducir(r.err);
  const f = await fin;
  return f.ok ? ok(true) : traducir(f.err);
}

/** Vacía un almacén. Solo lo usa la restauración y el borrado explícito de ajustes. */
export async function vaciar(almacen) {
  if (!_db) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const t = tx([almacen], 'readwrite'); if (!t) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const fin = confirmada(t);
  const r = await pedir(t.objectStore(almacen).clear(), t);
  if (!r.ok) return traducir(r.err);
  const f = await fin;
  return f.ok ? ok(true) : traducir(f.err);
}

/* ----- Identificadores -----
   Prefijo legible + tiempo + azar. El tiempo va delante para que ordenen solos y para que
   un id sirva de pista al depurar; el azar es lo que evita el choque cuando dos
   dispositivos crean algo el mismo milisegundo, que con un libro compartido pasa. */
export function nuevoId(prefijo) {
  let r = '';
  try {
    const b = new Uint8Array(4); crypto.getRandomValues(b);
    r = Array.from(b, x => x.toString(36)).join('').slice(0, 6);
  } catch (_) { r = Math.random().toString(36).slice(2, 8); }
  return prefijo + '-' + Date.now().toString(36) + '-' + r;
}

/* ============================================================================
   Respaldo propio de la plataforma.

   Separado del respaldo del cotizador a propósito. El del cotizador es todo-o-nada con
   rollback y aborta completo si una clave no cabe: meterle un espejo de tamaño arbitrario
   podría volver imposible restaurar tres años de cotizaciones, que es el dato que de
   verdad no se puede perder.

   `al3d_pf_puente` NO entra. Su ofuscación es reversible en dos líneas, y el propio
   cotizador ya lo dice de su API key: un respaldo se manda por WhatsApp o por correo, y
   una llave que viaja así deja de ser secreta.
   ============================================================================ */

export const FORMATO_RESPALDO = 1;
const APP_RESPALDO = 'plataforma-al3d';

export async function exportar() {
  const datos = {};
  for (const a of ALMACENES) {
    if (NO_RESPALDA.includes(a)) continue;   // ver NO_RESPALDA
    const filas = await listar(a);
    datos[a] = a === 'blobs' ? await Promise.all(filas.map(blobADataUrl)) : filas;
  }
  return JSON.stringify({
    app: APP_RESPALDO, formato: FORMATO_RESPALDO,
    fecha: new Date().toISOString(),
    datos,
  });
}

async function blobADataUrl(fila) {
  if (!fila || !(fila.blob instanceof Blob)) return fila;
  const url = await new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res('');
    try { fr.readAsDataURL(fila.blob); } catch (_) { res(''); }
  });
  const { blob, ...resto } = fila;
  return { ...resto, dataUrl: url };
}

function dataUrlABlob(fila) {
  if (!fila || !fila.dataUrl) return fila;
  try {
    const [cab, b64] = String(fila.dataUrl).split(',');
    const tipo = (/data:([^;]+)/.exec(cab) || [, 'application/octet-stream'])[1];
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const { dataUrl, ...resto } = fila;
    return { ...resto, blob: new Blob([u8], { type: tipo }) };
  } catch (_) { return fila; }
}

/**
 * Fusiona por id. IDEMPOTENTE: reimportar el mismo archivo no cambia nada.
 * `movimientos` es la excepción que importa: un id repetido se DESCARTA, nunca se suma dos
 * veces. Un libro que suma dos veces la misma entrada de material deja de ser un libro.
 *
 * Y LO NUEVO NO SE PISA CON LO VIEJO. Hasta septiembre de 2026 esto hacía `put` a ciegas:
 * restaurar un respaldo de hace dos semanas devolvía a «en diseño» un proyecto que ya
 * estaba instalado, y el aviso de la pantalla decía que se habían descartado registros
 * «por estar ya en la base», que era justo lo contrario de lo que pasaba. Ahora, si el
 * registro que ya está aquí se editó DESPUÉS que el del archivo, se queda el de aquí y se
 * cuenta en `conservados`. Un registro sin sello de edición —un respaldo antiguo— entra
 * como antes.
 *
 * Y lo que entra CONSERVA su sello. Sellarlo con la hora de la restauración rompía la regla
 * de arriba justo en el caso para el que existe: quien se equivoca de archivo y restaura
 * uno viejo, y luego el bueno, veía el bueno rechazado —«aquí eran más nuevos»— porque lo
 * viejo había quedado fechado hoy.
 * @returns {Promise<Resultado>} valor = {almacenes, registros, descartados, conservados}
 */
export async function importar(texto) {
  let paquete;
  try { paquete = JSON.parse(texto); }
  catch (_) { return mal('DATO_INVALIDO', 'Ese archivo no se pudo leer. ¿Es el respaldo de la plataforma?'); }
  if (!paquete || paquete.app !== APP_RESPALDO || !paquete.datos || typeof paquete.datos !== 'object') {
    return mal('DATO_INVALIDO', 'Ese archivo no es un respaldo de la plataforma. El del cotizador se restaura desde el cotizador.');
  }
  if (Number(paquete.formato) > FORMATO_RESPALDO) {
    return mal('DATO_INVALIDO', 'Ese respaldo lo hizo una versión más nueva de la plataforma. Actualiza antes de restaurarlo.');
  }
  /* Se revisa la FORMA antes de tocar nada. El cotizador aprendió esto a golpes: un
     respaldo truncado pasaba el filtro de la etiqueta, borraba lo que había y anunciaba
     éxito, dejando la app sin arrancar. */
  for (const [a, filas] of Object.entries(paquete.datos)) {
    if (!ALMACENES.includes(a)) continue;
    if (!Array.isArray(filas)) return mal('DATO_INVALIDO', 'El respaldo está dañado: «' + a + '» no es una lista.');
    /* Y las claves, aquí y no al escribir. Cada almacén entra en su propia transacción, así
       que el «todo o nada» de `ponerVarios` solo cubre el suyo: un id que no sirve en
       «materiales» se descubría con «proyectos» ya escrito, y el respaldo quedaba entrado a
       medias. Un registro SIN id sigue como siempre (se descarta y se cuenta); uno con un id
       que la base no acepta es un archivo dañado, y adivinar cuál era su id no nos toca. */
    const clave = ESQUEMA[a].keyPath;
    const mala = filas.findIndex(f => f && typeof f === 'object' && f[clave] !== undefined && !esClave(f[clave]));
    if (mala >= 0) {
      return mal('DATO_INVALIDO', 'El respaldo está dañado: el registro ' + (mala + 1) + ' de «' + a +
        '» trae un identificador que no sirve. No se restauró nada.');
    }
  }
  let almacenes = 0, registros = 0, descartados = 0, conservados = 0;
  for (const a of ALMACENES) {
    const filas = paquete.datos[a];
    if (!Array.isArray(filas) || !filas.length) continue;
    const clave = ESQUEMA[a].keyPath;
    const nuevas = [];
    for (let fila of filas) {
      if (!fila || typeof fila !== 'object' || fila[clave] === undefined) { descartados++; continue; }
      if (a === 'blobs') fila = dataUrlABlob(fila);
      const previo = await obtener(a, fila[clave]);
      /* Un renglón del libro o de la bitácora que ya está no se vuelve a escribir: son
         hechos, y un hecho repetido suma dos veces. */
      if ((a === 'movimientos' || a === 'bitacora') && previo) { descartados++; continue; }
      if (previo && esMasNuevo(previo, fila)) { conservados++; continue; }
      nuevas.push(fila);
    }
    if (!nuevas.length) continue;
    const r = await ponerVarios(a, nuevas, { conservarSello: true });
    if (!r.ok) return r;
    almacenes++; registros += nuevas.length;
  }
  return ok({ almacenes, registros, descartados, conservados });
}

/* Si la base aceptaría eso como clave. Se le pregunta a ella misma: `cmp` lanza DataError con
   lo mismo que haría lanzar al `put`, y una lista propia de lo que vale acabaría distinta de la
   del navegador. Sin IndexedDB no hay a quién preguntar y se deja pasar: sin base, lo de
   después ya contesta que no. */
function esClave(k) {
  try { indexedDB.cmp(k, k); return true; }
  catch (e) { return !(e && e.name === 'DataError'); }
}

/* El de la base es más nuevo que el del archivo solo si LOS DOS traen sello de edición y el de
   aquí es posterior. Sin sello no hay con qué comparar y manda el archivo, que es lo que la
   persona pidió al restaurar. */
function esMasNuevo(previo, fila) {
  const a = Number(previo && previo.actualizado_en) || 0;
  const b = Number(fila && fila.actualizado_en) || 0;
  return a > 0 && b > 0 && a > b;
}

/** Cuánto espacio queda, si el navegador lo dice. Para el aviso preventivo, no para decidir. */
export async function espacio() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const e = await navigator.storage.estimate();
    if (!e || !e.quota) return null;
    return { usado: e.usage || 0, cuota: e.quota, pct: Math.round((e.usage || 0) / e.quota * 100) };
  } catch (_) { return null; }
}
