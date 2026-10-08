/* ============================================================================
   Un .zip sin comprimir, para bajar un carrusel entero en un solo archivo.

   Sin librería: la política de esta página solo deja correr guiones propios (pruebas/csp.mjs),
   y para guardar PNG —que ya vienen comprimidos— basta el método «almacenado» (0): encabezado
   local, los bytes tal cual y el directorio central. Comprimir otra vez un PNG gana casi nada y
   cuesta segundos en un teléfono.

   Puro y síncrono sobre Uint8Array: lo prueba pruebas/publicaciones.mjs en node.
   ============================================================================ */

let _tabla = null;
function crc32(bytes) {
  if (!_tabla) {
    _tabla = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      _tabla[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = _tabla[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* La fecha y hora en el formato de MS-DOS, que es el que lleva el zip. */
function fechaDos(d) {
  const t = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const f = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { t, f };
}

/**
 * @param {{nombre:string, bytes:Uint8Array}[]} archivos  en el orden en que van
 * @param {Date} [cuando]
 * @returns {Uint8Array} el .zip entero
 */
export function zip(archivos, cuando = new Date()) {
  const enc = new TextEncoder();
  const { t, f } = fechaDos(cuando);
  const locales = [], centrales = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const datos = a.bytes;
    const crc = crc32(datos);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true);
    loc.setUint16(4, 20, true);
    loc.setUint16(6, 0x0800, true);          // los nombres van en UTF-8 (acentos)
    loc.setUint16(8, 0, true);               // almacenado, sin comprimir
    loc.setUint16(10, t, true); loc.setUint16(12, f, true);
    loc.setUint32(14, crc, true);
    loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true);
    loc.setUint16(26, nombre.length, true);
    locales.push(new Uint8Array(loc.buffer), nombre, datos);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, t, true); cen.setUint16(14, f, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
    cen.setUint16(28, nombre.length, true);
    cen.setUint32(42, desplazamiento, true);
    centrales.push(new Uint8Array(cen.buffer), nombre);

    desplazamiento += 30 + nombre.length + datos.length;
  }
  const tamCentral = centrales.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, desplazamiento, true);
  const partes = [...locales, ...centrales, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(partes.reduce((s, x) => s + x.length, 0));
  let i = 0;
  for (const p of partes) { salida.set(p, i); i += p.length; }
  return salida;
}
