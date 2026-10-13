/* ============================================================================
   LAS CELDAS DEL VOLCADO — cómo se lee lo que `getValues()` sacó de la hoja.

   El volcado (puente/volcado-para-importar.gs) guarda cada pestaña como la matriz que devuelve
   `getRange(...).getValues()`: números como números, texto como texto, casillas como booleanos y
   la celda vacía como ''. Las fechas no sobreviven a JSON, así que el volcado las escribe como
   { $fecha: 'aaaa-mm-dd', $hora: 'HH:MM', $ms } en la zona de la hoja. Aquí se leen por LETRA de
   columna, nunca por encabezado (DISENO.md §3): los encabezados de «Ventas» no son los nombres
   del puente y una columna renombrada a mano no debe cambiar qué se importa.
   PURO: sin red, sin disco y sin reloj.
   ============================================================================ */

/** 'A' → 0, 'Z' → 25, 'AA' → 26, 'AI' → 34. */
export function col(letra) {
  let n = 0;
  for (const c of String(letra).toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

export const esFecha = v => !!v && typeof v === 'object' && typeof v.$fecha === 'string';
export const vacia = v => v === '' || v === null || v === undefined;

/** El texto de una celda: '' si está vacía; una fecha, como su 'aaaa-mm-dd'. */
export function texto(v) {
  if (vacia(v)) return '';
  if (esFecha(v)) return v.$fecha;
  return String(v);
}

/**
 * Un número de la hoja. { ok, n } con n = 0 si la celda está vacía; ok = false si trae texto que
 * no es número (la fórmula de la hoja daría error y la fila tiene que esperar a que se arregle).
 * Un número tecleado como texto («1500») SÍ es número: la hoja lo trata igual en sus fórmulas
 * solo cuando no lleva nada más, y aquí se acepta solo si es un número limpio.
 */
export function numero(v) {
  if (vacia(v)) return { ok: true, n: 0, vacia: true };
  if (typeof v === 'number') return Number.isFinite(v) ? { ok: true, n: v } : { ok: false };
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return { ok: true, n: Number(v), deTexto: true };
  return { ok: false };
}

/** Una fecha de la hoja: 'aaaa-mm-dd' si la celda es una fecha de verdad; null si está vacía;
 *  { texto } si alguien la tecleó como texto (no baja: así se comporta hoy `/jalar`). */
export function fecha(v) {
  if (vacia(v)) return null;
  if (esFecha(v) && /^\d{4}-\d{2}-\d{2}$/.test(v.$fecha)) return v.$fecha;
  return { texto: texto(v) };
}

/** La hora de AA «Hora instalacion»: la columna es de texto (`@`), pero una celda que alguien
 *  formateó como hora llega como fecha con $hora. 'HH:MM' o null. */
export function hora(v) {
  if (vacia(v)) return null;
  const s = esFecha(v) ? String(v.$hora || '') : String(v).trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return String(h).padStart(2, '0') + ':' + m[2];
}

/** Lo que una columna `text` de Postgres no guarda (el NUL) se quita, y se dice. */
export function limpioParaTexto(s) {
  const t = String(s);
  return t.includes('\u0000') ? { s: t.replace(/\u0000/g, ''), tenia: true } : { s: t, tenia: false };
}

/** Las filas de datos de una pestaña (sin el encabezado), con su número de fila de la hoja (1 = encabezado). */
export function filas(pestana) {
  if (!Array.isArray(pestana)) return [];
  return pestana.slice(1).map((celdas, i) => ({ fila: i + 2, celdas: Array.isArray(celdas) ? celdas : [] }));
}

/** El encabezado de una pestaña, recortado, para leer por nombre las del almacén (DISENO.md §3.3). */
export function encabezados(pestana) {
  return Array.isArray(pestana) && Array.isArray(pestana[0]) ? pestana[0].map(h => String(h ?? '').trim()) : [];
}
