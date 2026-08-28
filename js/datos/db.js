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
export const VERSION = 1;

export const ALMACENES = ['proyectos', 'instalaciones', 'materiales', 'movimientos',
                          'requerimientos', 'avisos', 'constantes', 'pendientes', 'geo', 'blobs'];

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
   `transaction.onabort` —la cuota es la principal—, así que se escuchan las dos. */
function pedir(peticion, transaccion) {
  return new Promise(resolve => {
    let listo = false;
    const cerrar = v => { if (!listo) { listo = true; resolve(v); } };
    peticion.onsuccess = () => cerrar({ ok: true, valor: peticion.result });
    peticion.onerror = ev => { ev.preventDefault(); cerrar({ ok: false, err: peticion.error }); };
    if (transaccion) transaccion.onabort = () => cerrar({ ok: false, err: transaccion.error });
  });
}

const esCuota = err => !!err && (err.name === 'QuotaExceededError' || err.code === 22);
const traducir = err => esCuota(err)
  ? mal('SIN_ESPACIO', MSG.SIN_ESPACIO)
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
  const st = t.objectStore(almacen);
  const previo = await pedir(st.get(registro[clave]), t);
  const ahora = Date.now();
  const sellado = { ...registro, actualizado_en: ahora };
  if (!(previo.ok && previo.valor)) sellado.creado_en = registro.creado_en || ahora;
  else sellado.creado_en = previo.valor.creado_en || registro.creado_en || ahora;
  const r = await pedir(st.put(sellado), t);
  return r.ok ? ok(sellado) : traducir(r.err);
}

/**
 * Una sola transacción. Todo o nada: si uno falla, ninguno queda escrito.
 * @returns {Promise<Resultado>} valor = cuántos escribió
 */
export async function ponerVarios(almacen, registros) {
  if (!_db) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  if (!Array.isArray(registros)) return mal('DATO_INVALIDO', MSG.DATO_INVALIDO);
  if (!registros.length) return ok(0);
  const t = tx([almacen], 'readwrite');
  if (!t) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const st = t.objectStore(almacen);
  const ahora = Date.now();
  return new Promise(resolve => {
    let err = null;
    for (const reg of registros) {
      const sellado = { ...reg, actualizado_en: ahora, creado_en: reg.creado_en || ahora };
      const p = st.put(sellado);
      p.onerror = ev => { ev.preventDefault(); if (!err) err = p.error; };
    }
    t.oncomplete = () => resolve(err ? traducir(err) : ok(registros.length));
    t.onabort = () => resolve(traducir(err || t.error));
    t.onerror = ev => { ev.preventDefault(); };
  });
}

/** @returns {Promise<Object|null>} el registro o null. NUNCA lanza. */
export async function obtener(almacen, id) {
  if (!_db || id === undefined || id === null) return null;
  const t = tx([almacen], 'readonly'); if (!t) return null;
  const r = await pedir(t.objectStore(almacen).get(id), t);
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

export async function borrar(almacen, id) {
  if (!_db) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const t = tx([almacen], 'readwrite'); if (!t) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const r = await pedir(t.objectStore(almacen).delete(id), t);
  return r.ok ? ok(true) : traducir(r.err);
}

/** Vacía un almacén. Solo lo usa la restauración y el borrado explícito de ajustes. */
export async function vaciar(almacen) {
  if (!_db) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const t = tx([almacen], 'readwrite'); if (!t) return mal('DB_NO_DISPONIBLE', MSG.DB_NO_DISPONIBLE);
  const r = await pedir(t.objectStore(almacen).clear(), t);
  return r.ok ? ok(true) : traducir(r.err);
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
    if (a === 'pendientes') continue;   // bandeja de salida: reenviarla duplicaría operaciones
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
 * @returns {Promise<Resultado>} valor = {almacenes, registros, descartados}
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
    /* `pendientes` se salta AQUÍ TAMBIÉN, no solo abajo. Si no, el archivo se rechaza entero
       —ni proyectos, ni movimientos, ni las fotos— por la forma de un dato que tres líneas más
       abajo se ignora sin leer. Y la persona vería «El respaldo está dañado» de un respaldo que
       está perfectamente bien salvo por una clave que a nadie le importa. */
    if (a === 'pendientes') continue;
    if (!Array.isArray(filas)) return mal('DATO_INVALIDO', 'El respaldo está dañado: «' + a + '» no es una lista.');
  }
  let almacenes = 0, registros = 0, descartados = 0;
  for (const a of ALMACENES) {
    /* La bandeja de salida no entra, igual que no sale (ver `exportar` arriba), y aquí la
       razón es más fuerte que allá. Un respaldo es un `.json` que se manda por WhatsApp y
       vuelve: si `pendientes` se escribiera desde el archivo, cualquier operación metida ahí
       a mano se bombearía sola a Notion en el siguiente arranque —el relevo sube la bandeja
       sin que nadie apriete nada— firmada con el token de ESTE teléfono y con su rol. Un
       archivo pasaría a ser un canal de escritura contra la base del dinero.
       No se pierde nada por saltarlo: `exportar()` nunca lo incluye, así que un respaldo
       legítimo no trae esta clave. */
    if (a === 'pendientes') continue;
    const filas = paquete.datos[a];
    if (!Array.isArray(filas) || !filas.length) continue;
    const clave = ESQUEMA[a].keyPath;
    const nuevas = [];
    for (let fila of filas) {
      if (!fila || typeof fila !== 'object' || fila[clave] === undefined) { descartados++; continue; }
      if (a === 'blobs') fila = dataUrlABlob(fila);
      if (a === 'movimientos' && await obtener('movimientos', fila.id)) { descartados++; continue; }
      nuevas.push(fila);
    }
    if (!nuevas.length) continue;
    const r = await ponerVarios(a, nuevas);
    if (!r.ok) return r;
    almacenes++; registros += nuevas.length;
  }
  return ok({ almacenes, registros, descartados });
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
