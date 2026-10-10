/* ============================================================================
   Cómo sale un trabajo del taller: instalación, paquetería o recolección en taller.

   Hasta octubre de 2026 la plataforma daba por hecho que todo se instalaba. AVIDA Market se
   manda por paquetería a Puerto Vallarta, y salía en el Mapa como «sin ubicar» pidiendo un pin
   que no va a tener nunca, y en el Calendario como «instalación del jueves 16». Lo mismo el
   cliente que no quiere instalación y pasa a recoger su letrero al taller.

   El campo es `entrega` en el proyecto, con tres valores. Ausente es 'instalacion': es lo que
   eran todos los proyectos antes de que existiera, y lo que sigue siendo casi todo. Viaja a la
   hoja en la columna AF «Entrega» desde puente-sheets-12 (ver js/datos/puente.js y
   puente/README.md).

   La fecha de la agenda NO cambia de significado: sigue siendo el día en que el trabajo sale
   del taller, y es la que cuenta para la carga del taller y el semáforo. Lo que cambia es cómo
   se le dice —«Envío», «Recolección»— y lo que se le pide: un envío o una recolección no
   necesitan pin, ni ruta, ni la calle del cliente.

   PURO: sin base, sin red y sin DOM. Lo importan la agenda, el .ics, el mapa y las pantallas,
   y la prueba de node lo corre entero.
   ============================================================================ */

/** Los tres valores, en el orden en que se enseñan (y en el del desplegable de la hoja). */
export const ENTREGAS = ['instalacion', 'paqueteria', 'recoleccion'];

/** Cómo se llama cada una en la ficha. Es también el texto EXACTO de la lista de la columna AF:
 *  pruebas/puente.mjs lo compara con `ENTREGAS` del Apps Script. */
export const ENTREGA_NOMBRE = {
  instalacion: 'Instalación',
  paqueteria:  'Paquetería',
  recoleccion: 'Recolección en taller',
};

/** El rótulo corto de la fecha, el que va en el chip del Calendario y en el título del .ics. */
export const ENTREGA_ROTULO = {
  instalacion: 'Instalación',
  paqueteria:  'Envío',
  recoleccion: 'Recolección',
};

/** Cómo se rotula la fecha en la ficha y en la hoja de agendar. */
export const ENTREGA_FECHA = {
  instalacion: 'Fecha de instalación',
  paqueteria:  'Fecha de envío',
  recoleccion: 'Fecha de recolección',
};

/** El verbo, para las frases del panel del día y de agendar: «qué día se va a ___». */
export const ENTREGA_VERBO = {
  instalacion: 'instalar',
  paqueteria:  'enviar',
  recoleccion: 'entregar en el taller',
};

/* El taller. Es el domicilio que el cotizador ya imprime como «Dirección Taller»
   (js/cotizador/entrega.js) con la ciudad completa, porque aquí lo lee un cliente que va a
   llegar en coche y un calendario que lo va a buscar en Maps. */
export const TALLER_NOMBRE = 'Anuncios Luminosos 3D';
export const DIRECCION_TALLER = 'Naranjos #648, Col. Lindavista, 45169 Zapopan, Jal.';

/** El valor bueno: uno de los tres, o 'instalacion' si no es ninguno. PURA. */
export function entregaLimpia(v) {
  const s = String(v == null ? '' : v).trim();
  return ENTREGAS.includes(s) ? s : 'instalacion';
}

/** La entrega de un proyecto. Sin el campo es instalación. PURA. */
export function entregaDe(p) {
  return entregaLimpia(p && typeof p === 'object' ? p.entrega : null);
}

/** Si el trabajo se instala en el domicilio del cliente: lo único que pide pin, ruta y calle. */
export function seInstala(p) { return entregaDe(p) === 'instalacion'; }

/**
 * Lo que dice una celda de la columna AF, en el valor de este lado: 'instalacion',
 * 'paqueteria', 'recoleccion', o '' si está vacía o dice otra cosa. '' NO es 'instalacion':
 * es «la hoja no dice», y lo que la hoja no dice no pisa lo que este lado sí sabe.
 * Sin acentos ni mayúsculas, como `entregaDeCelda` del Apps Script: «paqueteria» tecleado a
 * mano es Paquetería. PURA.
 */
export function entregaDesdeHoja(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s) return '';
  if (/^paquet/.test(s)) return 'paqueteria';
  if (/^recole/.test(s)) return 'recoleccion';
  if (/^instala/.test(s)) return 'instalacion';
  return '';
}

/**
 * Cómo reparte el Mapa los proyectos (js/mod/mapa.js). PURA, para que la prueba de node la corra
 * sin Leaflet:
 *  - `sinUbicar`: lo que se INSTALA y no tiene pin. Es lo único que hay que ir a arreglar.
 *  - `sinInstalacion`: paquetería y recolección, con pin o sin él. Van aparte, sin pedir pin.
 *  - `enRuta`: lo que puede entrar a la ruta de la camioneta —se instala y tiene pin—. Un envío
 *    con pin (el destino en Vallarta) se pinta, pero la camioneta no va.
 * @param {Object[]} proys
 * @param {function(Object):boolean} tienePin la prueba de `proyectos.tienePin`
 */
export function repartirParaElMapa(proys, tienePin) {
  const sinUbicar = [], sinInstalacion = [], enRuta = [];
  for (const p of Array.isArray(proys) ? proys : []) {
    if (!p) continue;
    if (!seInstala(p)) { sinInstalacion.push(p); continue; }
    if (tienePin(p)) enRuta.push(p); else sinUbicar.push(p);
  }
  return { sinUbicar, sinInstalacion, enRuta };
}
