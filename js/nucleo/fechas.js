/* ============================================================================
   Fechas de calendario — sobre los campos, nunca con `new Date(iso)`.

   Esta es la regla del proyecto y está escrita en seis archivos con las mismas palabras:
   `new Date('2026-08-23')` se lee como UTC y en México devuelve el día anterior. Ese error
   no se ve —sale una fecha perfectamente plausible, un día corrida— y se descubre cuando
   alguien llega a instalar el día equivocado.

   La regla estaba bien. Lo que estaba mal es que la aritmética que la cumple se había
   escrito SEIS veces:

     sumar días    · js/mod/agenda.js · js/mod/inicio.js · js/mod/mapa.js
                   · js/nucleo/ics.js (como `sumarDias`)
     días entre    · js/datos/agenda.js · js/datos/reglas.js
     sumar meses   · js/mod/agenda.js
     último día    · js/mod/agenda.js · js/datos/agenda.js
     inicio de semana · js/mod/agenda.js

   Y no eran copias iguales. Las tres de los módulos devuelven la fecha de ENTRADA cuando no
   es una fecha; la de `ics.js` devuelve `null`. Mismo nombre, mismo trabajo, contrato
   opuesto en el caso raro — que es justo donde uno va a mirar el día que algo salga
   corrido. De las seis, solo la de `ics.js` estaba probada, y de rebote.

   Aquí hay una sola de cada una, y **devuelven `null`** cuando no reciben una fecha. Es la
   respuesta honesta y es la que ya daba `partesISO`. Se revisaron los ocho sitios de llamada
   antes de unificar: todos entran con una fecha de verdad —`hoyISO()`, el ancla del
   calendario, `instalacion.fecha`, `proyecto.fecha_ganado`—, así que el cambio de contrato
   no mueve una sola respuesta hoy; lo que hace es que el día que alguien meta basura, se
   vea, en vez de que la fecha se quede quieta y parezca que la resta no hizo nada.

   `masDias` va con el mismo bucle sobre los campos que tenía `ics.js` —el único de los seis
   con pruebas— y no con una versión nueva más corta: el objetivo de este archivo es que
   nada cambie de comportamiento, y la única forma de garantizarlo es que la implementación
   que se queda sea la que ya estaba probada.

   Dep: ninguna. Es la capa de abajo: `ui.js` la importa y reexporta lo que ya exportaba,
   para que ninguno de los seis módulos que hoy piden `partesISO` a `ui.js` tenga que
   cambiar una línea.
   ============================================================================ */

const p2 = n => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → `{a, m, d}`, o `null` si no es eso exactamente. */
export const partesISO = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? { a: +m[1], m: +m[2], d: +m[3] } : null;
};

/** ¿Es una fecha de calendario? Se pregunta mucho y leerlo así se lee mejor. */
export const esISO = iso => !!partesISO(iso);

/** Hoy, en el día del dispositivo. Se parte la cadena a mano: `toISOString()` da UTC, y a
 *  las siete de la noche en México eso ya es mañana. */
export const hoyISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
};

export const bisiesto = a => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** Cuántos días tiene ese mes. `m` va de 1 a 12. */
export const diasDelMes = (a, m) =>
  m === 2 ? (bisiesto(a) ? 29 : 28) : ([4, 6, 9, 11].includes(m) ? 30 : 31);

/** El último día del mes, con la firma que ya usaban los dos que lo tenían: `m` de 1 a 12. */
export const ultimoDia = (a, m) => diasDelMes(a, m);

/** Suma (o resta) días. `null` si no entra una fecha. */
export function masDias(iso, n) {
  const p = partesISO(iso);
  if (!p) return null;
  let { a, m, d } = p;
  d += Math.trunc(n || 0);
  while (d > diasDelMes(a, m)) { d -= diasDelMes(a, m); if (++m > 12) { m = 1; a++; } }
  while (d < 1) { if (--m < 1) { m = 12; a--; } d += diasDelMes(a, m); }
  return a + '-' + p2(m) + '-' + p2(d);
}

/** Suma meses cayendo siempre en el día 1. Sin eso, del 31 de enero un mes es el 3 de
 *  marzo, y avanzar mes por mes desde una fecha alta se salta febrero entero. */
export function masMeses(iso, n) {
  const p = partesISO(iso);
  if (!p) return null;
  let m = p.m - 1 + Math.trunc(n || 0);
  const a = p.a + Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return a + '-' + p2(m + 1) + '-01';
}

/** Días de `desde` a `hasta`. Negativo = `hasta` ya pasó. `null` si falta una fecha.
 *  Va con `Date.UTC`, que no parsea nada y no tiene horario de verano: todos sus días miden
 *  86 400 000 ms exactos. No es `new Date(iso)`, que es lo prohibido. */
export function diasEntre(desde, hasta) {
  const a = partesISO(desde), b = partesISO(hasta);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.a, b.m - 1, b.d) - Date.UTC(a.a, a.m - 1, a.d)) / 86400000);
}

/** Día de la semana, 0 = domingo. Por `Date.UTC`, por lo mismo de arriba. */
export function diaSemana(iso) {
  const p = partesISO(iso);
  if (!p) return null;
  return new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay();
}

/** El lunes de la semana que contiene `iso`. La semana empieza en LUNES: un sábado y un
 *  domingo son el mismo fin de semana, y con la semana empezando en domingo quedan en los
 *  dos extremos opuestos de la rejilla — la del domingo es la que nadie ve. */
export function iniSemana(iso) {
  const dw = diaSemana(iso);
  return dw === null ? null : masDias(iso, -((dw + 6) % 7));
}

/** Date local anclada a MEDIODÍA. Se usa para formatear —el nombre del día, el mes— y no
 *  para sumar: a mediodía ningún corrimiento de zona ni de horario de verano cruza a otro
 *  día. Sumar se hace arriba, sobre los campos. */
export const fechaLocal = iso => {
  const p = partesISO(iso);
  return p ? new Date(p.a, p.m - 1, p.d, 12, 0, 0, 0) : null;
};
