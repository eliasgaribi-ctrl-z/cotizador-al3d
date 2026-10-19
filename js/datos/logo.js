/* ============================================================================
   EL LOGOTIPO DEL PROYECTO — una miniatura para saber de qué trabajo se habla.

   La pidió Elías en octubre de 2026: que el jefe, viendo el tablero, tenga una referencia visual
   del logotipo que se está trabajando, sin abrir Drive ni preguntar. No se sube nada nuevo: la
   imagen ya existe y se reutiliza, en este orden.

   1. La carpeta de Drive del proyecto («Trabajos Pendientes», la que ya lee /carpetas). Es la
      misma en todos los teléfonos y está abierta a cualquiera con el enlace, así que Drive da su
      miniatura sin iniciar sesión (`drive.google.com/thumbnail`, que redirige a
      lh3.googleusercontent.com: los dos están en img-src de index.html). Gana, de la carpeta:
        · un archivo con «logo» en el nombre que Drive sepa dibujar (imagen o PDF) — pero no el
          .cdr «Escalas y Logotipo de…», que Drive no dibuja;
        · si no, cualquier imagen;
        · si no, el PDF de órdenes de fabricación: su primera hoja trae el diseño y el render.
      Para poner o cambiar el logo, se sube a esa carpeta una imagen con «logo» en el nombre.
   2. La imagen de referencia de la cotización (`aiFile`), si este teléfono la tiene en su
      historial: solo vive en el aparato que cotizó, por eso va después de Drive —que lo ve todo
      el equipo— y la ficha dice de dónde salió.

   Lo PURO va aquí y lo prueba pruebas/logo.mjs; lo que pinta está en js/mod/proyectos.js.
   ============================================================================ */

/* El id de un archivo de Drive, de su liga («/file/d/<id>/view» o «?id=<id>»). Solo letras,
   números, guion y guion bajo: es lo que va dentro de una URL de imagen. PURA. */
export function idDeDrive(url) {
  const s = String(url || '');
  if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(s)) return '';
  const m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
  return m ? m[1] : '';
}

/** La miniatura de un archivo de Drive, de `ancho` px. PURA. */
export const miniaturaDrive = (id, ancho = 320) =>
  'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + Math.round(Number(ancho) || 320);

const COPIA = /^(backup_of_|copia_de_seguridad_de_)/i;
const esImagen = a => /^image\/(png|jpe?g|webp|gif)$/i.test(String(a.tipo || '')) || /\.(png|jpe?g|webp|gif)$/i.test(String(a.nombre || ''));
const esPdf = a => String(a.tipo || '') === 'application/pdf' || /\.pdf$/i.test(String(a.nombre || ''));

/** El archivo de la carpeta que hace de logo, o null. Ver la cabecera para el orden. PURA. */
export function archivoDelLogo(archivos) {
  const lista = (Array.isArray(archivos) ? archivos : [])
    .filter(a => a && a.nombre && !COPIA.test(a.nombre) && idDeDrive(a.url) && (esImagen(a) || esPdf(a)));
  const peso = a => {
    const logo = /logo/i.test(a.nombre);
    if (logo && esImagen(a)) return 0;
    if (logo) return 1;
    if (esImagen(a)) return 2;
    if (/orden/i.test(a.nombre)) return 3;
    return 4;
  };
  /* Con el mismo peso, el más reciente: el logo que se subió ayer gana al de la primera versión. */
  lista.sort((a, b) => peso(a) - peso(b) || (Number(b.modificado) || 0) - (Number(a.modificado) || 0));
  return lista[0] || null;
}

/* Lo único que se deja pasar como imagen de la cotización: un data URL de imagen, entero. */
const URL_IMAGEN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/** La imagen de referencia de una entrada del historial del cotizador, o ''. PURA. */
export function imagenDeCotizacion(entrada) {
  const f = entrada && entrada.aiFile;
  const u = f && String(f.url || '');
  return u && URL_IMAGEN.test(u) ? u : '';
}

/**
 * El logo de un proyecto.
 * @param {Object} p
 * @param {{carpeta?:Object|null, cotizacion?:string, ancho?:number}} x  la carpeta de Drive del
 *        proyecto (`Carpetas.carpetaDe`) y la imagen de su cotización en este aparato
 * @returns {null|{src:string, fuente:'drive'|'cotizacion', nombre:string, abrir:string}}
 */
export function logoDe(p, x = {}) {
  const a = x.carpeta ? archivoDelLogo(x.carpeta.archivos) : null;
  if (a) {
    return { src: miniaturaDrive(idDeDrive(a.url), x.ancho), fuente: 'drive', nombre: String(a.nombre), abrir: String(a.url) };
  }
  const img = imagenDeCotizacion({ aiFile: { url: x.cotizacion } });
  if (img) return { src: img, fuente: 'cotizacion', nombre: 'Imagen de la cotización', abrir: '' };
  return null;
}
