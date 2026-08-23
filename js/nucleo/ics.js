/* ============================================================================
   iCalendar (RFC 5545) escrito a mano, sin dependencias.

   Esto es el despertador de toda la plataforma. Una PWA estática no puede despertarse
   sola: no hay push sin servidor y el Periodic Background Sync es solo de Chrome y no
   promete nada. Así que el calendario del teléfono suena y la plataforma piensa. Un
   VALARM no sabe nada del almacén; lo que dice su DESCRIPTION no es la respuesta, es la
   orden de abrir la app, y al abrirla se recalcula la respuesta de verdad. Por eso cada
   alarma dice QUÉ HACER y no qué pasó.

   Cinco cosas que si se rompen el archivo deja de servir, cada una por su motivo:

   1. El UID es estable. Si cambia, el importador no actualiza: DUPLICA. Al reagendar se
      conserva el UID y se sube SEQUENCE (que es `instalaciones.movida`), y entonces el
      calendario mueve el evento que ya tenía en vez de dejar el viejo colgado.
   2. Variante UTC, SIN VTIMEZONE. Un TZID sin su bloque VTIMEZONE es la falla clásica, y
      el VTIMEZONE correcto de México dejó de ser el de los ejemplos de internet cuando se
      abolió el horario de verano el 30 de octubre de 2022. Jalisco está fijo en UTC−6, así
      que la conversión es una suma de seis horas sobre los CAMPOS. No pasa por Date a
      propósito: `new Date('2026-08-23')` se lee como UTC y en México devuelve el día
      anterior, y `getHours()` devolvería la hora del dispositivo, que en un viaje no es la
      de Guadalajara. Aquí 9:00 de Guadalajara es 20260823T150000Z siempre.
   3. Plegado a 75 OCTETOS, no a 75 caracteres, y sin partir un carácter a la mitad. Con
      «ó», «é» y «ñ» en cada descripción esto no es teórico: se mide con TextEncoder.
   4. Escapado en orden: primero la barra invertida, luego el punto y coma, luego la coma y
      al final el salto de línea. Si la barra no va primero, el escape se escapa a sí mismo.
      Los dos puntos NO se escapan: escaparlos rompe importadores estrictos.
   5. CRLF en todas las líneas, incluida la última. Hay parsers —Apple entre ellos— que
      rechazan un archivo con saltos de línea sueltos.
   ============================================================================ */

import { partesISO, descargarArchivo } from './ui.js';

const CRLF = '\r\n';

/* PRODID en formato FPI. Sirve para que un calendario con eventos de tres fuentes distintas
   se pueda depurar sabiendo quién escribió cada cosa. */
const PRODID = '-//THIQA//Plataforma AL3D 1.0//ES';

/* Fijo desde el 30/oct/2022. Si algún día Jalisco vuelve al horario de verano, esta
   constante deja de ser suficiente y hace falta VTIMEZONE: está aquí sola para que el
   cambio sea de una línea y no de una cacería. */
const OFFSET_MX = 6;

/* ----- Escapado de los campos de tipo TEXT ----- */
export const escapar = s => String(s == null ? '' : s)
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r\n|\r|\n/g, '\\n');

/* ----- Plegado por octetos -----
   La primera línea admite 75 octetos; las continuaciones 74, porque el espacio que las
   marca cuenta. El retroceso mientras el byte de corte sea de continuación (10xxxxxx) es
   lo que evita dejar media «ñ» en una línea y media en la siguiente: eso no se ve como un
   acento raro, se ve como un archivo corrupto y el importador tira el evento entero. */
export function plegar(linea) {
  const txt = String(linea == null ? '' : linea);
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b = enc.encode(txt);
  if (b.length <= 75) return txt;
  const partes = [];
  let i = 0, max = 75;
  while (i < b.length) {
    let fin = Math.min(i + max, b.length);
    while (fin > i + 1 && fin < b.length && (b[fin] & 0xC0) === 0x80) fin--;
    partes.push(dec.decode(b.slice(i, fin)));
    i = fin; max = 74;
  }
  return partes.join(CRLF + ' ');
}

/* ----- UID -----
   La forma es inst-IDENTIFICADOR@al3d.mx. Si ya viene un UID completo —el `uid_ics` que la
   instalación tiene guardado— se devuelve tal cual: volver a envolverlo daría
   inst-inst-x@al3d.mx y el importador crearía un evento nuevo, que es exactamente el
   desastre que el UID estable existe para evitar. Se quitan espacios y saltos de línea
   porque un UID plegado o con un salto adentro deja de ser el mismo texto. */
export function uid(identificador) {
  const raw = String(identificador == null ? '' : identificador).trim()
    .replace(/[\s\r\n]+/g, '');
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  return 'inst-' + raw + '@al3d.mx';
}

/* ----- Aritmética de fechas sobre los campos, sin Date ----- */
const bisiesto = a => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const diasDelMes = (a, m) =>
  m === 2 ? (bisiesto(a) ? 29 : 28) : ([4, 6, 9, 11].includes(m) ? 30 : 31);
const p2 = n => String(n).padStart(2, '0');

/** Suma días a un 'YYYY-MM-DD' y devuelve 'YYYY-MM-DD'. Null si la fecha no es válida. */
function sumarDias(iso, n) {
  const p = partesISO(iso);
  if (!p) return null;
  let { a, m, d } = p;
  d += Math.trunc(n || 0);
  while (d > diasDelMes(a, m)) { d -= diasDelMes(a, m); if (++m > 12) { m = 1; a++; } }
  while (d < 1) { if (--m < 1) { m = 12; a--; } d += diasDelMes(a, m); }
  return a + '-' + p2(m) + '-' + p2(d);
}

const compacta = iso => { const p = partesISO(iso); return p ? p.a + p2(p.m) + p2(p.d) : ''; };

/** 'YYYY-MM-DD' + 'HH:MM' de Guadalajara + minutos de corrimiento → '20260823T150000Z'. */
function sello(fecha, hora, masMin) {
  const p = partesISO(fecha);
  const h = /^(\d{1,2}):(\d{2})$/.exec(String(hora || ''));
  if (!p || !h) return '';
  const total = (+h[1]) * 60 + (+h[2]) + OFFSET_MX * 60 + (masMin || 0);
  const dias = Math.floor(total / 1440);
  const resto = ((total % 1440) + 1440) % 1440;
  const f = compacta(sumarDias(fecha, dias));
  return f ? f + 'T' + p2(Math.floor(resto / 60)) + p2(resto % 60) + '00Z' : '';
}

/** DTSTAMP: el instante en que se generó el archivo. Aquí sí es un instante y no una fecha
    de calendario, así que los getters UTC de Date son exactamente lo correcto. */
function ahoraUTC(ms) {
  const d = new Date(typeof ms === 'number' ? ms : Date.now());
  return d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + 'T' +
         p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds()) + 'Z';
}

/* ----- Las alarmas -----
   Cada DESCRIPTION es una orden, no un parte de guerra. «Revisa el material» se puede
   obedecer a las 7 de la mañana leyendo la notificación de reojo; «Recordatorio: hay una
   instalación en 3 días» no se puede obedecer, y eso vuelve la alarma ruido en dos
   semanas. La de 30 minutos se estira a 120 cuando la ventana es de noche porque a esa
   hora el tráfico de Guadalajara decide si se llega o no. */
const TEXTO_ALARMA = {
  '-P3D': 'Revisa el material: abre la plataforma y ve la lista de compra de ',
  '-P1D': 'Confirma con el cliente por WhatsApp: ',
  '-PT120M': 'Sal ya y revisa que vaya cargado todo: ',
  '-PT30M': 'Carga la camioneta y revisa la lista: ',
};
const textoAlarma = (t, resumen) =>
  (TEXTO_ALARMA[t] || 'Abre la plataforma: ') + String(resumen || 'la instalación');

function alarmasDe(ev) {
  if (Array.isArray(ev.alarmas)) return ev.alarmas.filter(Boolean);
  const cerca = ev.ventana === 'noche' ? '-PT120M' : '-PT30M';
  /* Un evento de todo el día empieza a las 00:00, así que -PT30M sonaría a las 11:30 de la
     noche anterior. A esa hora nadie carga una camioneta: en un evento sin hora las dos
     alarmas que quedan son las que sí se pueden atender. */
  return ev.hora ? ['-P3D', '-P1D', cerca] : ['-P3D', '-P1D'];
}

/* ----- STATUS -----
   Una instalación cancelada se manda con STATUS:CANCELLED y el MISMO UID: así el
   calendario tacha la que ya tenía. Si se mandara con UID nuevo quedarían las dos y el
   instalador saldría a una cita que no existe. */
const ESTADO_ICS = {
  propuesta: 'TENTATIVE', confirmada: 'CONFIRMED', reagendada: 'CONFIRMED',
  hecha: 'CONFIRMED', cancelada: 'CANCELLED',
};

/** Las líneas de un VEVENT. Devuelve [] si no hay UID o la fecha no sirve: una lectura no
    lanza, y un VEVENT sin DTSTART lo rechaza cualquier importador. */
function vevento(ev) {
  const e = ev || {};
  const id = uid(e.uid);
  const p = partesISO(e.fecha);
  if (!id || !p) return [];

  const conHora = /^(\d{1,2}):(\d{2})$/.test(String(e.hora || ''));
  const dur = Number(e.duracion_min) > 0 ? Number(e.duracion_min) : 180;
  const resumen = String(e.summary || 'Instalación');

  const fechas = conHora
    ? ['DTSTART:' + sello(e.fecha, e.hora, 0), 'DTEND:' + sello(e.fecha, e.hora, dur)]
    /* DTEND es EXCLUSIVO. Con DTEND igual a DTSTART hay clientes que pintan un evento de
       cero días, o sea invisible, así que el de un solo día termina el día siguiente. */
    : ['DTSTART;VALUE=DATE:' + compacta(e.fecha),
       'DTEND;VALUE=DATE:' + compacta(sumarDias(e.fecha, 1))];

  const L = [
    'BEGIN:VEVENT',
    'UID:' + id,
    'DTSTAMP:' + ahoraUTC(e.sello),
    ...fechas,
    'SUMMARY:' + escapar(resumen),
  ];
  if (e.description) L.push('DESCRIPTION:' + escapar(e.description));
  if (e.location) L.push('LOCATION:' + escapar(e.location));
  L.push('STATUS:' + (ESTADO_ICS[e.estado] || 'CONFIRMED'));
  /* SEQUENCE es la cuenta de reagendas. Un calendario que ya tiene el evento solo acepta
     el cambio si el número subió; con SEQUENCE:0 en cada exportación, mover una
     instalación no movería nada en el teléfono. */
  L.push('SEQUENCE:' + (Number(e.secuencia) > 0 ? Math.trunc(Number(e.secuencia)) : 0));
  L.push('TRANSP:OPAQUE');
  for (const t of alarmasDe(e)) {
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY',
           'DESCRIPTION:' + escapar(textoAlarma(t, resumen)),
           'TRIGGER:' + t, 'END:VALARM');
  }
  L.push('END:VEVENT');
  return L;
}

/** Envuelve VEVENTs en un VCALENDAR y pliega. El CRLF final va incluido. */
function envolver(lineas) {
  const L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:' + PRODID,
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...lineas,
    'END:VCALENDAR',
  ];
  return L.map(plegar).join(CRLF) + CRLF;
}

/** Un .ics de un solo evento. Es el que se comparte al agendar: la suscripción por URL
 *  refresca cada 12–24 h y no hay forma de forzarla, así que para «acabo de agendar y lo
 *  quiero ver» el único camino es el archivo en la mano. */
export function evento(ev) {
  const v = vevento(ev);
  return v.length ? envolver(v) : '';
}

/** Varios eventos en un archivo. Los que no traen UID o fecha se caen solos, y el resto
 *  sale igual: un dato malo no debe costar el calendario completo. */
export function calendario(evs) {
  const lineas = (Array.isArray(evs) ? evs : []).flatMap(vevento);
  return lineas.length ? envolver(lineas) : '';
}

/* ----- El ritmo -----
   Un .ics con RRULE es el cron del teléfono, y es la única automatización de verdad que
   existe sin servidor: se importa una vez y sigue sonando en 2029 aunque nadie abra la
   app, aunque no haya red y aunque no exista ninguna cuenta.

   La trampa del RRULE en UTC: 18:00 de Guadalajara es 00:00Z del día SIGUIENTE, así que un
   BYDAY=MO..FR en UTC sonaría de martes a sábado en México. Por eso el BYDAY va corrido a
   TU..SA: en UTC son esos días y en la pantalla del teléfono son lunes a viernes. El
   DTSTART tiene que ser una ocurrencia real de la regla, y 20260901T000000Z es martes en
   UTC (lunes 31 de agosto, 18:00, en Guadalajara).
   El conteo mensual es a las 9:00 y no cruza medianoche, así que ahí BYMONTHDAY=1 se queda
   como 1 y no hay nada que corregir. */
export function ritmo() {
  const stamp = ahoraUTC();
  const L = [
    'BEGIN:VEVENT',
    'UID:' + uid('ritmo-comparte-el-dia@al3d.mx'),
    'DTSTAMP:' + stamp,
    'DTSTART:20260901T000000Z',
    'DTEND:20260901T001000Z',
    'RRULE:FREQ=WEEKLY;BYDAY=TU,WE,TH,FR,SA',
    'SUMMARY:' + escapar('Comparte el día'),
    'DESCRIPTION:' + escapar(
      'Abre la plataforma y manda el avance del día por WhatsApp: qué quedó listo y qué falta.'),
    'STATUS:CONFIRMED', 'SEQUENCE:0', 'TRANSP:TRANSPARENT',
    'BEGIN:VALARM', 'ACTION:DISPLAY',
    'DESCRIPTION:' + escapar('Manda el avance del día antes de irte.'),
    'TRIGGER:PT0S', 'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:' + uid('ritmo-conteo-fisico@al3d.mx'),
    'DTSTAMP:' + stamp,
    'DTSTART:20260901T150000Z',
    'DTEND:20260901T153000Z',
    'RRULE:FREQ=MONTHLY;BYMONTHDAY=1',
    'SUMMARY:' + escapar('Conteo físico del almacén'),
    'DESCRIPTION:' + escapar(
      'Abre Material y cuenta solo los que la plataforma te pida: los demás quedan como están.'),
    'STATUS:CONFIRMED', 'SEQUENCE:0', 'TRANSP:TRANSPARENT',
    'BEGIN:VALARM', 'ACTION:DISPLAY',
    'DESCRIPTION:' + escapar('Cuenta el material que la plataforma te marque.'),
    'TRIGGER:PT0S', 'END:VALARM',
    'END:VEVENT',
  ];
  return envolver(L);
}

/** Descarga el .ics. Mismo camino que el respaldo: `<a download>` es lo único que se
 *  comporta igual en Android y en iOS. Devuelve false cuando el navegador no dejó, porque
 *  quien llama promete «ya está en tu calendario» y no puede prometerlo a ciegas. */
export function descargar(texto, nombre) {
  const t = String(texto || '');
  if (!t) return false;
  let n = String(nombre || 'agenda.ics').trim() || 'agenda.ics';
  if (!/\.ics$/i.test(n)) n += '.ics';
  return descargarArchivo(t, n, 'text/calendar;charset=utf-8');
}
