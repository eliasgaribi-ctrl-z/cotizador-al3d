/* ============================================================================
   Las nueve claves de localStorage de la plataforma, envueltas.

   Prefijo `al3d_pf_` (pf = plataforma). Todas son cortas y de tamaño acotado: nada que
   crezca vive aquí. El libro de movimientos, los proyectos y las fotos van a IndexedDB,
   y la razón no es purismo.

   `saveHistorial()` del cotizador ya degrada por falta de cuota: cuando no cabe una
   cotización nueva, suelta la imagen de las cotizaciones viejas, de la más antigua a la
   más reciente, hasta que quepa. Un libro de movimientos creciendo en localStorage
   destruiría imágenes del historial del cotizador —el único dato irrecuperable de todo
   el sistema— para guardar una salida de acrílico. Por eso lo que crece no vive aquí.

   Y NINGUNA de estas claves se agrega a RESPALDO_KEYS del cotizador. Tres razones, en
   §4.2 del documento de arquitectura: restaurar un respaldo viejo borraría el estado de
   la plataforma en silencio; reinstalaría una bandeja de sync vieja que reenviaría
   operaciones ya aplicadas; y `restaurarDesde` es todo-o-nada, así que meter un espejo de
   tamaño arbitrario podría volver imposible restaurar tres años de cotizaciones.
   La plataforma tiene su propio archivo de respaldo.
   ============================================================================ */

export const CLAVES = {
  DISP:       'al3d_pf_disp',
  ROL:        'al3d_pf_rol',
  NOMBRE:     'al3d_pf_nombre',
  GANADAS:    'al3d_pf_ganadas',
  TILES:      'al3d_pf_tiles',
  GCAL:       'al3d_pf_gcal',
  PUENTE:     'al3d_pf_puente',
  ULT_EXPORT: 'al3d_pf_ult_export',
  EMPRESA:    'al3d_pf_empresa',
  /* La mitad del cotizador de un respaldo completo, esperando a que el cotizador la tome. La
     plataforma tiene prohibido escribir las claves del cotizador (§4.1); esto es una clave
     SUYA que el cotizador lee, ofrece con un botón y borra al restaurar. */
  RESTAURAR:  'al3d_pf_restaurar',
};

export const ROLES = ['direccion', 'fabricacion', 'pagos'];
export const ROL_NOMBRE = {
  direccion:   'Dirección',
  fabricacion: 'Fabricación',
  pagos:       'Pagos',
};

/* Qué es cada rol, en las palabras con las que el director los describió. Va en la
   pantalla de ajustes: elegir un rol sin saber qué te va a esconder es elegir a ciegas. */
export const ROL_DESC = {
  direccion:   'Ves todo: importes, cobranza, el mapa completo y quién decide qué se gana.',
  fabricacion: 'Cortes, materiales y logotipos. Ves el almacén y la orden de trabajo; los importes no se pintan.',
  pagos:       'Cobranza y comisiones. No mueves el almacén ni la agenda.',
};

const CRUDAS = new Set([CLAVES.DISP, CLAVES.ROL, CLAVES.NOMBRE, CLAVES.TILES,
                        CLAVES.ULT_EXPORT, CLAVES.EMPRESA, CLAVES.RESTAURAR]);

/** Lee. Nunca lanza. Devuelve `def` si no está, si no se pudo leer o si el JSON está roto. */
export function get(clave, def = null) {
  try {
    const v = localStorage.getItem(clave);
    if (v === null) return def;
    if (CRUDAS.has(clave)) return v;
    try { return JSON.parse(v); } catch (_) { return def; }
  } catch (_) { return def; }
}

/** Escribe. `false` si no cupo o si el almacenamiento está bloqueado (Safari privado). */
export function set(clave, valor) {
  try {
    if (valor === null || valor === undefined) { localStorage.removeItem(clave); return true; }
    localStorage.setItem(clave, CRUDAS.has(clave) ? String(valor) : JSON.stringify(valor));
    return true;
  } catch (_) { return false; }
}

/* ----- Identidad del dispositivo -----
   Cuatro caracteres, una vez en la vida del teléfono. Sirve para dos cosas: sellar quién
   hizo cada movimiento del almacén —«Fabricación contó 3 láminas el martes» necesita un
   quién— y desambiguar folios, porque el contador `al3d_folio` es local y monótono en cada
   dispositivo: dos teléfonos pueden emitir COT-0042 el mismo día y sin esto serían el
   mismo proyecto.

   crypto.getRandomValues y no Math.random: en un Safari con la pestaña recién abierta,
   Math.random arrancaba sembrado igual y dos dispositivos salían con el mismo id. */
export function dispositivo() {
  let d = get(CLAVES.DISP, '');
  if (d) return d;
  const AB = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';  // sin 0/O ni 1/I: esto se dicta por teléfono
  try {
    const b = new Uint8Array(4);
    crypto.getRandomValues(b);
    d = Array.from(b, x => AB[x % AB.length]).join('');
  } catch (_) {
    d = 'D' + String(Date.now() % 10000).padStart(4, '0');
  }
  set(CLAVES.DISP, d);
  return d;
}

export function rol() {
  const r = get(CLAVES.ROL, 'direccion');
  return ROLES.includes(r) ? r : 'direccion';
}
export function setRol(r) { return ROLES.includes(r) ? set(CLAVES.ROL, r) : false; }
export const esDireccion   = () => rol() === 'direccion';
export const esFabricacion = () => rol() === 'fabricacion';
export const esPagos       = () => rol() === 'pagos';

/* Quién ve dinero. Para FABRICACIÓN el importe NO SE PINTA, no se difumina.
   El difuminado del cotizador (`body.precios-ocultos`) es una mampara contra el cliente
   sentado enfrente: se levanta con un pointerdown y solo actúa cuando la cotización está
   en borrador, así que para un proyecto ya ganado es inerte. Confundir una mampara con un
   permiso es cómo se filtra un margen. */
export const veDinero = () => rol() !== 'fabricacion';

/* Y esto hay que decirlo en la pantalla de ajustes, no esconderlo en un comentario:
   en fase 1 no hay servidor y cualquiera puede cambiar su rol. Lo que se defiende no es
   el secreto, es el ruido. */
export const ROL_NO_ES_SEGURIDAD =
  'El rol decide qué pantallas ves, no a qué tienes derecho. Mientras la plataforma viva ' +
  'solo en este dispositivo, cualquiera que lo tenga en la mano puede cambiarlo.';

export function nombre() { return get(CLAVES.NOMBRE, ''); }
export function setNombre(n) { return set(CLAVES.NOMBRE, String(n || '').trim().slice(0, 40)); }

/** Nombre y rol juntos, para sellar un movimiento: «Beto · Fabricación (K7QM)». */
export function sello() {
  const n = nombre(), r = ROL_NOMBRE[rol()];
  return (n ? n + ' · ' : '') + r + ' (' + dispositivo() + ')';
}

/** ¿Ya se presentó quien usa este dispositivo? Si no, la plataforma lo pregunta una vez. */
export const sinPresentar = () => !nombre();

export function tiles() {
  const t = get(CLAVES.TILES, 'osm');
  return ['osm', 'carto', 'google'].includes(t) ? t : 'osm';
}
export function setTiles(t) { return set(CLAVES.TILES, t); }

/** Sello del último respaldo de la plataforma. Alimenta el aviso de desalojo. */
export function ultExport() { return get(CLAVES.ULT_EXPORT, ''); }
/** Deja la mitad del cotizador de un respaldo completo (el JSON como texto) para que el
 *  cotizador la ofrezca al abrir. `false` si no cupo: un historial de tres años con imágenes
 *  puede no caber junto a lo que ya hay, y eso se dice en vez de perderse en silencio. */
export function dejarRestauracion(texto) { return set(CLAVES.RESTAURAR, String(texto || '')); }
export function restauracionPendiente() { return get(CLAVES.RESTAURAR, '') || ''; }
export function marcarExport() { return set(CLAVES.ULT_EXPORT, new Date().toISOString()); }
export function diasSinRespaldo() {
  const s = ultExport(); if (!s) return null;
  const t = Date.parse(s); if (!t) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/* ----- El buzón de «esta cotización se ganó» -----
   index.html escribe aquí y la plataforma lo drena. Es una clave de localStorage y no
   IndexedDB por una razón concreta: el cotizador es un archivo sin módulos y sin
   dependencias, y meterle una transacción de IndexedDB para dejar un renglón de constancia
   sería la inserción más grande y más frágil de las cinco que se le hacen. Un array de
   objetos pequeños en una clave propia es lo que un archivo así puede escribir sin
   arriesgar nada.

   Se lee tolerante a basura: lo escribe otro archivo que no importa este módulo, así que
   aquí no hay garantía de tipo, solo de intención. */
export function leerBuzon() {
  const a = get(CLAVES.GANADAS, []);
  return Array.isArray(a) ? a.filter(x => x && typeof x === 'object' && x.folio) : [];
}
export function vaciarBuzon() { return set(CLAVES.GANADAS, []); }
/** Quita del buzón solo lo ya procesado: si entró algo nuevo mientras se drenaba, se queda. */
export function quitarDelBuzon(procesadas) {
  const claves = new Set(procesadas.map(g => g.folio + '|' + (g.disp || '')));
  const quedan = leerBuzon().filter(g => !claves.has(g.folio + '|' + (g.disp || '')));
  return set(CLAVES.GANADAS, quedan);
}

/* Fase 2 y 3. Se leen aquí para que ningún módulo toque localStorage directo. */
export function gcal() { return get(CLAVES.GCAL, null); }
export function setGcal(cfg) { return set(CLAVES.GCAL, cfg); }
export const hayGcal = () => { const g = gcal(); return !!(g && g.clientId); };

export function puente() { return get(CLAVES.PUENTE, null); }
export function setPuente(cfg) { return set(CLAVES.PUENTE, cfg); }
export const hayPuente = () => { const p = puente(); return !!(p && p.url && p.token); };

export function empresa() { return get(CLAVES.EMPRESA, 'al3d'); }
