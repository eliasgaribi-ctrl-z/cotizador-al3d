import * as ICS from '../js/nucleo/ics.js';
const enc = new TextEncoder();
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);

// Firma real del contrato: un solo objeto.
const ev = {
  uid: 'i7', fecha: '2026-08-25', hora: '09:00', duracion_min: 180, secuencia: 0,
  summary: 'Andrey - Healthylicious (Panel Alucobond)',
  description: 'Instalación nocturna, previamente armado en el taller; ojo con el acceso de servicio. Letras 3D de acero inoxidable, 8 piezas de 40 cm, luz fría. Buscar a Andrey en recepción. Panel Alucobond de 1 m × 2.95 m, se sube por la escalera lateral porque el elevador no alcanza.',
  location: 'Plaza Palma Real, Av. Sta. Margarita 3740 L5, Valle Real, Zapopan',
  ventana: 'dia',
};
const txt = ICS.evento(ev);
if (!txt) { console.log('evento() devolvió vacío'); process.exit(1); }

if (!txt.endsWith('\r\n')) mal('no termina en CRLF'); else bien('termina en CRLF');
if (/[^\r]\n/.test(txt)) mal('hay \\n suelto'); else bien('no hay saltos de línea sueltos');

const lineas = txt.split('\r\n').filter(l => l.length);
const largas = lineas.filter(l => enc.encode(l).length > 75);
if (largas.length) mal(largas.length + ' línea(s) pasan de 75 octetos (' + enc.encode(largas[0]).length + ')');
else bien('las ' + lineas.length + ' líneas caben en 75 octetos');

if (txt.includes('�')) mal('hay U+FFFD: se partió un multibyte'); else bien('ningún multibyte partido');

const d = txt.replace(/\r\n[ \t]/g, '');   // desplegado
if (!d.includes('Instalación nocturna')) mal('al desplegar no se recupera el acento'); else bien('desplegado recupera «Instalación» íntegro');
if (!d.includes('escalera lateral porque el elevador no alcanza')) mal('la descripción larga se truncó'); else bien('descripción de 300+ caracteres íntegra tras desplegar');

if (!d.includes('\;')) mal('punto y coma sin escapar'); else bien('punto y coma escapado');
if (!d.includes('\\,')) mal('coma sin escapar'); else bien('coma escapada');
if (/[^\\]:.*\\:/.test(d)) mal('escapó los dos puntos'); else bien('los dos puntos NO se escapan');

if (ICS.uid('i7') !== ICS.uid('i7')) mal('UID no estable'); else bien('UID estable: ' + ICS.uid('i7'));
if (!d.includes('T150000Z')) mal('09:00 GDL no salió 15:00Z. DTSTART: ' + lineas.filter(l=>l.startsWith('DTSTART')));
else bien('09:00 de Guadalajara = 15:00Z (UTC−6 fijo)');
if (!d.includes('DTEND:20260825T180000Z')) mal('DTEND de 180 min mal: ' + (/DTEND:[^\r\n]*/.exec(d)||[''])[0]);
else bien('DTEND = +180 min → 18:00Z');

const td = ICS.evento({ ...ev, hora: null }).replace(/\r\n[ \t]/g, '');
if (!/DTSTART;VALUE=DATE:20260825/.test(td)) mal('sin hora no es de todo el día'); else bien('sin hora = evento de todo el día');
const me = /DTEND;VALUE=DATE:(\d{8})/.exec(td);
if (!me || me[1] !== '20260826') mal('DTEND de todo el día debe ser el siguiente, salió ' + (me?me[1]:'nada'));
else bien('DTEND del día siguiente: exclusivo, como manda la especificación');
if (td.includes('TRIGGER:-PT30M')) mal('un evento sin hora no debe llevar alarma de 30 min (sonaría 23:30 del día anterior)');
else bien('sin hora no lleva la alarma de 30 min');

for (const t of ['-P3D', '-P1D', '-PT30M']) {
  if (!d.includes('TRIGGER:' + t)) mal('falta alarma ' + t); else bien('alarma ' + t);
}
const n = ICS.evento({ ...ev, ventana: 'noche' }).replace(/\r\n[ \t]/g, '');
if (!n.includes('TRIGGER:-PT120M')) mal('ventana noche no avisa 2 h antes'); else bien('ventana de noche avisa 2 h antes');

const mv = ICS.evento({ ...ev, secuencia: 3 }).replace(/\r\n[ \t]/g, '');
if (!/SEQUENCE:3/.test(mv)) mal('SEQUENCE no refleja las reagendas'); else bien('SEQUENCE:3 tras 3 reagendas');
if (!/UID:inst-i7@al3d\.mx/.test(mv)) mal('el UID cambió al mover'); else bien('el UID no cambia al mover');

const can = ICS.evento({ ...ev, estado: 'cancelada' }).replace(/\r\n[ \t]/g, '');
if (!can.includes('STATUS:CANCELLED')) mal('cancelada no manda STATUS:CANCELLED'); else bien('cancelada = STATUS:CANCELLED con el mismo UID');

for (const k of ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:','BEGIN:VEVENT','DTSTAMP:','END:VEVENT','END:VCALENDAR']) {
  if (!d.includes(k)) mal('falta ' + k); else bien('trae ' + k);
}

// Varios eventos, y uno malo no debe costar el archivo
const varios = ICS.calendario([ev, { uid:'', fecha:'nada' }, { ...ev, uid:'i8' }]);
const cuantos = (varios.match(/BEGIN:VEVENT/g) || []).length;
if (cuantos !== 2) mal('calendario() con un evento malo dio ' + cuantos + ' eventos, esperaba 2');
else bien('un evento inválido se cae solo y los otros 2 salen igual');

// El ritmo
const r = ICS.ritmo().replace(/\r\n[ \t]/g, '');
if (!/RRULE:FREQ=WEEKLY/.test(r)) mal('el ritmo no trae RRULE semanal'); else bien('ritmo semanal con RRULE');
if (!/RRULE:FREQ=MONTHLY/.test(r)) mal('el ritmo no trae RRULE mensual'); else bien('ritmo mensual con RRULE');
if (/BYDAY=MO,TU,WE,TH,FR/.test(r)) mal('BYDAY=MO..FR en UTC suena martes a sábado en México');
else bien('BYDAY corrido para que en México caiga lunes a viernes');

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTodo pasa. ' + lineas.length + ' líneas.');
process.exit(fallos ? 1 : 0);
