/* GARANTÍA Y LIQUIDACIÓN DE UN PROYECTO INSTALADO (función 53).
 *
 * Tres reglas del negocio que hasta hoy vivían en la cabeza de quien cobra: el otro 50 % se
 * liquida como máximo 2 días HÁBILES después de instalar, la garantía eléctrica dura 1 año y
 * la de colorimetría 2. Un error aquí no se ve —sale una fecha plausible— y se descubre
 * cuando alguien reclama una garantía que la ficha daba por viva, o cuando nadie cobró el
 * saldo porque la cuenta regresiva decía que faltaban días.
 *
 * Lo que este archivo defiende, y por qué cada caso está aquí:
 *   · los hábiles se cuentan saltando sábado y domingo, y el día de la instalación NO cuenta
 *     (instalar un jueves da el lunes, no el sábado);
 *   · la excepción de $60,000 apaga la cuenta regresiva en vez de mentir con «vence en 2 días»;
 *   · la garantía vence el MISMO día del mes, y el 31 en un mes de 30 baja al último día
 *     (`masMeses()` de fechas.js cae siempre en el día 1: usarla aquí adelantaba la garantía
 *     hasta 30 días);
 *   · sin fecha de instalación no se inventa nada: devuelve null;
 *   · una fecha corrupta no cuelga el bucle de hábiles.
 *
 * Se corre con pruebas/correr.sh, como todas.
 */
import * as Proy from '../js/datos/proyectos.js';

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + nombre + (ok ? '' : '  → dio ' + JSON.stringify(real) + ', esperaba ' + JSON.stringify(esperado)));
  if (!ok) fallos++;
};

/* 2026-09-28 es LUNES; 2026-10-02 es viernes; 2026-10-03 sábado. */
console.log('\nesHabil — de lunes a viernes, sin festivos (igual que taller.js)');
eq('lunes 28 sep 2026 es hábil', Proy.esHabil('2026-09-28'), true);
eq('viernes 2 oct 2026 es hábil', Proy.esHabil('2026-10-02'), true);
eq('sábado 3 oct 2026 no', Proy.esHabil('2026-10-03'), false);
eq('domingo 4 oct 2026 no', Proy.esHabil('2026-10-04'), false);
/* El 16 de septiembre es festivo en México y aquí cuenta como hábil: está decidido y dicho. */
eq('el 16 de septiembre cuenta como hábil (no conoce festivos)', Proy.esHabil('2026-09-16'), true);
eq('una fecha que no es fecha no es hábil', Proy.esHabil('mañana'), false);

console.log('\nmasHabiles — el día de la instalación no cuenta');
eq('lunes + 2 hábiles = miércoles', Proy.masHabiles('2026-09-28', 2), '2026-09-30');
/* El caso que una implementación ingenua falla: jueves + 2 días naturales sería sábado. */
eq('jueves + 2 hábiles = lunes (salta el fin de semana)', Proy.masHabiles('2026-10-01', 2), '2026-10-05');
eq('viernes + 2 hábiles = martes', Proy.masHabiles('2026-10-02', 2), '2026-10-06');
eq('sábado + 2 hábiles = martes', Proy.masHabiles('2026-10-03', 2), '2026-10-06');
eq('domingo + 2 hábiles = martes', Proy.masHabiles('2026-10-04', 2), '2026-10-06');
eq('+ 0 hábiles se queda donde está', Proy.masHabiles('2026-10-03', 0), '2026-10-03');
eq('cruza el fin de mes', Proy.masHabiles('2026-09-30', 2), '2026-10-02');
eq('cruza el fin de año', Proy.masHabiles('2026-12-31', 2), '2027-01-04');
eq('sin fecha no inventa', Proy.masHabiles('', 2), null);

console.log('\nhabilesEntre — los que hay que vivir para llegar');
eq('lunes → miércoles son 2', Proy.habilesEntre('2026-09-28', '2026-09-30'), 2);
eq('viernes → lunes es 1', Proy.habilesEntre('2026-10-02', '2026-10-05'), 1);
eq('el mismo día son 0', Proy.habilesEntre('2026-09-28', '2026-09-28'), 0);
eq('al revés son 0, no un negativo', Proy.habilesEntre('2026-09-30', '2026-09-28'), 0);
/* Un respaldo viejo con el año en 9999 colgaba el bucle: colgar la ficha es peor que dar una
   cuenta grande, así que hay tope de vuelta y la prueba lo cronometra. */
const t0 = Date.now();
const lejos = Proy.habilesEntre('2026-09-28', '9999-01-01');
eq('una fecha absurda devuelve el tope y no cuelga', lejos, 4000);
eq('y tarda menos de dos segundos', Date.now() - t0 < 2000, true);

console.log('\nmismoDiaMesesDespues — la garantía vence el mismo día');
eq('14 mar + 12 meses = 14 mar del año siguiente', Proy.mismoDiaMesesDespues('2026-03-14', 12), '2027-03-14');
eq('14 mar + 24 meses = 14 mar dos años después', Proy.mismoDiaMesesDespues('2026-03-14', 24), '2028-03-14');
/* Lo que `masMeses()` de fechas.js NO hace, y por eso esta función existe. */
eq('31 ene + 1 mes = 28 feb (baja al último día, no salta a marzo)', Proy.mismoDiaMesesDespues('2026-01-31', 1), '2026-02-28');
eq('29 feb bisiesto + 12 meses = 28 feb', Proy.mismoDiaMesesDespues('2028-02-29', 12), '2029-02-28');
eq('31 may + 1 mes = 30 jun', Proy.mismoDiaMesesDespues('2026-05-31', 1), '2026-06-30');
eq('sin fecha no inventa', Proy.mismoDiaMesesDespues(null, 12), null);

console.log('\ngarantiaYLiquidacion — la ficha completa');
const chico = { instalado: '2026-09-28', total: 17004, saldo: 8502 };
const dia = h => Proy.garantiaYLiquidacion({ ...chico, hoy: h });

eq('sin fecha de instalación no hay ficha', Proy.garantiaYLiquidacion({ instalado: '', total: 1, hoy: '2026-09-28' }), null);

const elDia = dia('2026-09-28');
eq('el día de instalar: a tiempo, faltan 2 hábiles', [elDia.liquidacion.estado, elDia.liquidacion.dias], ['aTiempo', 2]);
eq('y vence el miércoles', elDia.liquidacion.vence, '2026-09-30');
eq('el saldo es el que dice la hoja', elDia.liquidacion.saldo, 8502);
eq('al día siguiente falta 1', [dia('2026-09-29').liquidacion.estado, dia('2026-09-29').liquidacion.dias], ['aTiempo', 1]);
eq('el día del vencimiento: vence hoy', dia('2026-09-30').liquidacion.estado, 'venceHoy');
eq('y ese día no sobra ni falta ningún día', dia('2026-09-30').liquidacion.dias, 0);
eq('un día después: vencida hace 1 hábil', [dia('2026-10-01').liquidacion.estado, dia('2026-10-01').liquidacion.dias], ['vencida', 1]);
/* Del miércoles al lunes hay 3 hábiles: jue, vie, lun. El fin de semana no se cobra. */
eq('el lunes siguiente: vencida hace 3 hábiles, no 5 naturales', dia('2026-10-05').liquidacion.dias, 3);

console.log('\nla excepción de los $60,000 calla la cuenta regresiva');
const grande = Proy.garantiaYLiquidacion({ instalado: '2026-09-28', total: 69400, saldo: 34700, hoy: '2026-10-20' });
eq('un proyecto de $69,400 nunca sale «vencida»', grande.liquidacion.estado, 'excepcion');
eq('lo dice con su bandera', grande.liquidacion.excepcion, true);
eq('y no cuenta días', grande.liquidacion.dias, 0);
/* Se mide sobre el total que se cobra, con IVA si lo lleva: $60,000 clavados NO es excepción. */
eq('$60,000 clavados todavía no es excepción', Proy.garantiaYLiquidacion({ instalado: '2026-09-28', total: 60000, saldo: 30000, hoy: '2026-10-20' }).liquidacion.estado, 'vencida');

console.log('\nel saldo: la fórmula de la hoja manda, y si no la hay se pacta la mitad');
eq('sin dato de la hoja, la mitad del total', Proy.garantiaYLiquidacion({ instalado: '2026-09-28', total: 17004, saldo: null, hoy: '2026-09-28' }).saldo, 8502);
eq('saldo 0 es «pagada», aunque el día haya pasado', Proy.garantiaYLiquidacion({ instalado: '2026-09-28', total: 17004, saldo: 0, hoy: '2026-10-20' }).liquidacion.estado, 'pagada');
/* Un saldo negativo de la hoja (un abono de más) no es una deuda al revés: es que ya se pagó. */
eq('un saldo negativo también es «pagada»', Proy.garantiaYLiquidacion({ instalado: '2026-09-28', total: 17004, saldo: -5, hoy: '2026-10-20' }).liquidacion.estado, 'pagada');

console.log('\nlas dos garantías, contadas desde la instalación y nunca desde hoy');
const g = dia('2026-09-28').garantias;
eq('son dos', g.length, 2);
eq('la eléctrica es de 1 año', [g[0].clave, g[0].meses, g[0].hasta], ['electrico', 12, '2027-09-28']);
eq('la de colorimetría, de 2', [g[1].clave, g[1].meses, g[1].hasta], ['colorimetria', 24, '2028-09-28']);
eq('el día de instalar no va nada consumido', [g[0].consumido, g[1].consumido], [0, 0]);
const medio = dia('2027-03-28').garantias;
eq('a los 6 meses la eléctrica va por la mitad', Math.round(medio[0].consumido * 100), 50);
eq('y la de colorimetría por la cuarta parte', Math.round(medio[1].consumido * 100), 25);
const tarde = dia('2027-10-28').garantias;
eq('pasado el año, la eléctrica está vencida', [tarde[0].vencida, tarde[1].vencida], [true, false]);
eq('y su consumo se queda en 1, no se pasa', tarde[0].consumido, 1);
eq('los días que quedan van en negativo cuando ya venció', tarde[0].quedan < 0, true);

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nLa cuenta regresiva del cobro y las dos garantías dicen lo mismo que la regla.');
process.exit(fallos ? 1 : 0);
