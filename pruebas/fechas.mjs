/* La aritmética de fechas, que estaba escrita seis veces y probada una.
   
   Un error aquí no se ve. No tira la app, no pinta un mensaje, no sale en ninguna consola:
   devuelve una fecha perfectamente plausible, un día corrida, y se descubre cuando alguien
   llegó a instalar el día equivocado. Por eso este archivo mira sobre todo los sitios donde
   una implementación razonable da un número plausible y falso: el fin de mes, el 29 de
   febrero, el cruce de año, y el `new Date('2026-08-23')` que en México devuelve el 22.
   
   Se corre con pruebas/correr.sh, como todas.
*/
import * as F from '../js/nucleo/fechas.js';

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + nombre + (ok ? '' : '  → dio ' + JSON.stringify(real) + ', esperaba ' + JSON.stringify(esperado)));
  if (!ok) fallos++;
};

console.log('\npartesISO — lo que es una fecha y lo que no');
eq('2026-09-02 se parte', F.partesISO('2026-09-02'), { a: 2026, m: 9, d: 2 });
eq('sin ceros no pasa', F.partesISO('2026-9-2'), null);
eq('«22 ago 2026» no pasa', F.partesISO('22 ago 2026'), null);
eq('DD/MM/YYYY no pasa', F.partesISO('02/09/2026'), null);
eq('con hora pegada no pasa', F.partesISO('2026-09-02T10:00'), null);
eq('null no pasa y no truena', F.partesISO(null), null);

console.log('\nmasDias — el fin de mes');
eq('31 ene + 1 = 1 feb', F.masDias('2026-01-31', 1), '2026-02-01');
eq('28 feb + 1 = 1 mar (2026 no es bisiesto)', F.masDias('2026-02-28', 1), '2026-03-01');
eq('30 abr + 1 = 1 may', F.masDias('2026-04-30', 1), '2026-05-01');
eq('1 mar − 1 = 28 feb', F.masDias('2026-03-01', -1), '2026-02-28');
eq('1 ene − 1 = 31 dic del año anterior', F.masDias('2026-01-01', -1), '2025-12-31');
eq('31 dic + 1 = 1 ene del siguiente', F.masDias('2026-12-31', 1), '2027-01-01');

console.log('\nmasDias — el año bisiesto, con los dos casos en el mismo sitio');
/* Una implementación que dé 28 días de febrero a secas pasa el primero y falla el segundo.
   Por eso van juntos: por separado el primero es una prueba que aprueba un bug. */
eq('2026: 1 mar − 7 = 22 feb', F.masDias('2026-03-01', -7), '2026-02-22');
eq('2028: 1 mar − 7 = 23 feb (hay 29)', F.masDias('2028-03-01', -7), '2028-02-23');
eq('2028-02-28 + 1 = 29 feb', F.masDias('2028-02-28', 1), '2028-02-29');
eq('2028-02-29 + 1 = 1 mar', F.masDias('2028-02-29', 1), '2028-03-01');
eq('1900 NO fue bisiesto', F.masDias('1900-02-28', 1), '1900-03-01');
eq('2000 SÍ fue bisiesto', F.masDias('2000-02-28', 1), '2000-02-29');

console.log('\nmasDias — plazos de verdad, de una a tres semanas hacia atrás');
eq('30 sep − 14 = 16 sep', F.masDias('2026-09-30', -14), '2026-09-16');
eq('5 ene 2027 − 21 = 15 dic 2026', F.masDias('2027-01-05', -21), '2026-12-15');
eq('1 mar 2026 − 21 = 8 feb', F.masDias('2026-03-01', -21), '2026-02-08');
eq('1 mar 2028 − 21 = 9 feb (hay 29)', F.masDias('2028-03-01', -21), '2028-02-09');
eq('sumar 0 no mueve nada', F.masDias('2026-09-02', 0), '2026-09-02');
eq('un salto largo cruza tres años', F.masDias('2026-09-02', 1000), '2029-05-29');
eq('y vuelve', F.masDias('2029-05-29', -1000), '2026-09-02');

console.log('\nmasDias — el contrato del caso raro');
eq('una fecha inválida da null, no la de entrada', F.masDias('mañana', 3), null);
eq('null da null', F.masDias(null, 3), null);
eq('n indefinido se trata como 0', F.masDias('2026-09-02'), '2026-09-02');

console.log('\ndiasEntre');
eq('mismo día = 0', F.diasEntre('2026-09-02', '2026-09-02'), 0);
eq('hacia adelante es positivo', F.diasEntre('2026-09-02', '2026-09-05'), 3);
eq('hacia atrás es negativo', F.diasEntre('2026-09-05', '2026-09-02'), -3);
eq('cruzando febrero de un bisiesto', F.diasEntre('2028-02-01', '2028-03-01'), 29);
eq('cruzando febrero de uno normal', F.diasEntre('2026-02-01', '2026-03-01'), 28);
eq('un año normal son 365', F.diasEntre('2026-01-01', '2027-01-01'), 365);
eq('uno bisiesto son 366', F.diasEntre('2028-01-01', '2029-01-01'), 366);
eq('si falta una fecha, null', F.diasEntre('2026-09-02', 'el viernes'), null);

console.log('\nmasDias y diasEntre son la misma operación al derecho y al revés');
{
  /* El barrido que atrapa lo que un puñado de casos escogidos a mano deja pasar: los 366
     días de un año bisiesto por cinco plazos, ida y vuelta. 1 830 comprobaciones. */
  let mal = 0, n = 0;
  for (const dias of [7, 11, 14, 18, 21]) {
    let f = '2028-01-01';
    for (let i = 0; i < 366; i++) {
      const atras = F.masDias(f, -dias);
      if (!F.partesISO(atras) || F.diasEntre(atras, f) !== dias || F.masDias(atras, dias) !== f) mal++;
      n++;
      f = F.masDias(f, 1);
    }
  }
  eq('1 830 idas y vueltas por el 2028 completo, sin una sola descuadrada', mal, 0);
  eq('y se corrieron las 1 830', n, 1830);
}

console.log('\nmasMeses — siempre al día 1, que es lo que evita saltarse febrero');
eq('31 ene + 1 mes = 1 feb, no 3 mar', F.masMeses('2026-01-31', 1), '2026-02-01');
eq('dic + 1 = ene del siguiente', F.masMeses('2026-12-15', 1), '2027-01-01');
eq('ene − 1 = dic del anterior', F.masMeses('2026-01-15', -1), '2025-12-01');
eq('− 13 cruza el año largo', F.masMeses('2026-09-02', -13), '2025-08-01');
eq('+ 24 son dos años exactos', F.masMeses('2026-09-02', 24), '2028-09-01');
eq('inválida da null', F.masMeses('nunca', 1), null);

console.log('\ndiaSemana e iniSemana — la semana empieza en lunes');
eq('2026-09-02 es miércoles (3)', F.diaSemana('2026-09-02'), 3);
eq('2026-09-06 es domingo (0)', F.diaSemana('2026-09-06'), 0);
eq('2026-09-07 es lunes (1)', F.diaSemana('2026-09-07'), 1);
eq('el lunes de la semana del miércoles 2', F.iniSemana('2026-09-02'), '2026-08-31');
eq('el DOMINGO 6 pertenece a la semana que empezó el 31', F.iniSemana('2026-09-06'), '2026-08-31');
eq('el lunes 7 es su propio inicio', F.iniSemana('2026-09-07'), '2026-09-07');
eq('inválida da null', F.iniSemana(''), null);
{
  /* La propiedad, no el ejemplo: el inicio de semana siempre es lunes, y nunca está a más
     de seis días de distancia. Un año entero. */
  let mal = 0, f = '2026-01-01';
  for (let i = 0; i < 365; i++) {
    const l = F.iniSemana(f);
    const d = F.diasEntre(l, f);
    if (F.diaSemana(l) !== 1 || d < 0 || d > 6) mal++;
    f = F.masDias(f, 1);
  }
  eq('365 días: el inicio siempre es lunes y siempre está entre 0 y 6 días atrás', mal, 0);
}

console.log('\nultimoDia y diasDelMes');
eq('septiembre tiene 30', F.ultimoDia(2026, 9), 30);
eq('enero tiene 31', F.ultimoDia(2026, 1), 31);
eq('febrero de 2026 tiene 28', F.ultimoDia(2026, 2), 28);
eq('febrero de 2028 tiene 29', F.ultimoDia(2028, 2), 29);
eq('febrero de 1900 tuvo 28', F.ultimoDia(1900, 2), 28);
eq('febrero de 2000 tuvo 29', F.ultimoDia(2000, 2), 29);
eq('los doce meses suman 365 en 2026', [...Array(12)].reduce((s, _, i) => s + F.ultimoDia(2026, i + 1), 0), 365);
eq('y 366 en 2028', [...Array(12)].reduce((s, _, i) => s + F.ultimoDia(2028, i + 1), 0), 366);

console.log('\nfechaLocal — anclada a mediodía, que es lo que la vuelve inmune a la zona');
eq('conserva el día que se le dio', (() => { const f = F.fechaLocal('2026-09-02'); return f.getFullYear() + '-' + (f.getMonth() + 1) + '-' + f.getDate(); })(), '2026-9-2');
eq('a las 12 en punto', F.fechaLocal('2026-09-02').getHours(), 12);
eq('inválida da null', F.fechaLocal('x'), null);

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nLa aritmética de fechas cuadra.');
process.exit(fallos ? 1 : 0);
