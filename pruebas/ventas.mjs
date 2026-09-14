/* LA ARITMÉTICA DE CONTROL: ventas por mes, saldos, cartera, conversión y CSV.
 *
 * Son los números que la dirección lee para decidir, y un número plausible pero equivocado
 * es peor que ninguno: «vendimos $84 000 este mes» con un cancelado sumado dentro se cree y
 * no se revisa. Todo lo de js/datos/ventas.js es puro —listas entran, números salen— así que
 * se prueba aquí, en node, sin DOM ni IndexedDB.
 *
 * Uso:  node pruebas/ventas.mjs
 */
import { resumenMensual, indicadores, saldoDe, porCobrar, conversion, csvProyectos, csvCampo,
         mesDe, etiquetaMes, rangoMes, vendidoDe, COLUMNAS_CSV } from '../js/datos/ventas.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const ok = (que, cond) => { if (cond) { bien++; console.log('  ok   ' + que); } else { mal++; console.log('  FALLA ' + que); } };

const HOY = '2026-09-14';
const proy = (o = {}) => ({ id: 'p', folio_local: 'COT-0001', folio_global: 'COT-0001@AAAA', nombre: 'Uno',
  contacto: 'Cliente', negocio: 'Negocio', tel: '3312345678', tipo_trabajo: ['Letras 3D con iluminacion'],
  etapa: 'en_diseno', fecha_ganado: '2026-09-03', sub: 10000, neto: 11600, precio_auth: 11600,
  anti_pactado: 5800, cuenta: 'BBVA', estatus_notion: 'FABRICACION', pago_pendiente: null, dispositivo: 'AAAA', ...o });

console.log('\nEL MES Y SU ETIQUETA');
eq('mesDe', mesDe('2026-09-14'), '2026-09');
eq('mesDe de basura', mesDe('14/09/2026'), '');
eq('etiquetaMes', etiquetaMes('2026-01'), 'ene 2026');
eq('rangoMes de septiembre', rangoMes('2026-09'), { desde: '2026-09-01', hasta: '2026-09-30' });
eq('rangoMes de febrero bisiesto', rangoMes('2028-02'), { desde: '2028-02-01', hasta: '2028-02-29' });

console.log('\nLO VENDIDO: el autorizado manda, y si no hay, el neto');
eq('precio_auth manda', vendidoDe(proy({ precio_auth: 12000, neto: 11600 })), 12000);
eq('sin precio_auth cae al neto', vendidoDe(proy({ precio_auth: 0 })), 11600);

console.log('\nEL SALDO ESTIMADO');
eq('total menos anticipo', saldoDe(proy()), 5800);
eq('anticipo que cubre todo da 0', saldoDe(proy({ anti_pactado: 11600 })), 0);
eq('anticipo mayor que el total NO da negativo', saldoDe(proy({ anti_pactado: 20000 })), 0);
eq('LIQUIDADO en Notion da 0 aunque el anticipo sea chico', saldoDe(proy({ estatus_notion: 'LIQUIDADO' })), 0);
eq('cancelado da 0', saldoDe(proy({ etapa: 'cancelado' })), 0);
eq('si Notion bajó pago_pendiente, manda ese número', saldoDe(proy({ pago_pendiente: 1234.5 })), 1234.5);
eq('pago_pendiente en 0 desde Notion gana al cálculo local', saldoDe(proy({ pago_pendiente: 0 })), 0);

console.log('\nLOS DOCE MESES, sin huecos y con lo perdido aparte');
const P = [
  proy({ id: 'a', fecha_ganado: '2026-09-03' }),
  proy({ id: 'b', fecha_ganado: '2026-09-10', precio_auth: 20000 }),
  proy({ id: 'c', fecha_ganado: '2026-08-20', precio_auth: 5000 }),
  proy({ id: 'd', fecha_ganado: '2026-09-11', etapa: 'cancelado', precio_auth: 7000 }),
  proy({ id: 'e', fecha_ganado: '2025-01-01', precio_auth: 999999 }),   // fuera de la ventana
  proy({ id: 'f', fecha_ganado: '', precio_auth: 50 }),                  // sin fecha: no cae en ningún mes
];
const M = resumenMensual(P, { hoy: HOY, meses: 12 });
eq('doce renglones', M.length, 12);
eq('el primero es octubre de 2025', M[0].mes, '2025-10');
eq('el último es el mes de hoy', M[11].mes, '2026-09');
eq('septiembre suma solo lo ganado', [M[11].ganados, M[11].vendido], [2, 31600]);
eq('y lo cancelado va aparte, como perdido', [M[11].perdidos, M[11].perdido], [1, 7000]);
eq('agosto', [M[10].ganados, M[10].vendido], [1, 5000]);
eq('un mes sin nada existe y va en cero', [M[5].ganados, M[5].vendido, M[5].perdido], [0, 0, 0]);
eq('con meses:3 salen tres', resumenMensual(P, { hoy: HOY, meses: 3 }).map(m => m.mes), ['2026-07', '2026-08', '2026-09']);
eq('con basura no truena', resumenMensual(null, { hoy: HOY, meses: 2 }).length, 2);

console.log('\nLOS INDICADORES DE LA CABECERA');
const pend = [{ folio: 'COT-0009', neto: 3000, precioAuth: 0 }, { folio: 'COT-0010', neto: 4000, precioAuth: 4500 }];
const K = indicadores(P, pend, { hoy: HOY });
eq('vendido este mes', [K.mes.n, K.mes.total, K.mes.etiqueta], [2, 31600, 'sep 2026']);
eq('mes anterior', [K.mesAnterior.n, K.mesAnterior.total], [1, 5000]);
eq('variación en %', K.variacion, 532);
eq('variación es null si el mes anterior fue cero', indicadores([P[0]], [], { hoy: HOY }).variacion, null);
eq('pipeline: cuenta y suma con el precio autorizado si difiere', [K.pipeline.n, K.pipeline.total], [2, 7500]);
eq('perdido este mes', [K.perdidoMes.n, K.perdidoMes.total], [1, 7000]);
/* Últimos 12 meses desde el 14 de septiembre: a, b, c (e es de 2025-01, f sin fecha). */
eq('últimos doce meses', [K.ultimos12.n, K.ultimos12.total], [3, 36600]);
eq('ticket promedio', K.ticket, 12200);
/* Por cobrar: a 5800, b 20000-5800=14200, c 0 (5000-5800<0), e 999999-5800, f 0 (50-5800<0). d cancelado. */
eq('por cobrar: cuántos y cuánto', [K.porCobrar.n, K.porCobrar.total], [3, 5800 + 14200 + 994199]);
eq('anticipos pactados de los vivos', K.porCobrar.anticipos, 5800 * 5);

console.log('\nLA CARTERA: lo instalado primero, luego por saldo');
const C = porCobrar([
  proy({ id: 'x', etapa: 'en_diseno', precio_auth: 30000 }),
  proy({ id: 'y', etapa: 'instalado', precio_auth: 8000 }),
  proy({ id: 'z', etapa: 'listo', precio_auth: 9000 }),
  proy({ id: 'w', etapa: 'instalado', estatus_notion: 'LIQUIDADO' }),
]);
eq('orden', C.map(c => c.proyecto.id), ['y', 'x', 'z']);
eq('saldos', C.map(c => c.saldo), [2200, 24200, 3200]);
eq('el liquidado no está', C.some(c => c.proyecto.id === 'w'), false);

console.log('\nLA CONVERSIÓN, global contra global');
const H = [
  { folio: 'COT-0001', disp: 'AAAA', neto: 1 },   // ganada (P[0])
  { folio: 'COT-0002', disp: 'AAAA', neto: 1 },   // cancelada
  { folio: 'COT-0003', neto: 1 },                 // sin disp: se usa el de este aparato → ganada
  { folio: 'COT-0004', disp: 'AAAA', neto: 1 },   // sin decidir
  { folio: 'COT-0001', disp: 'BBBB', neto: 1 },   // mismo folio visible, OTRO aparato: no es el proyecto de AAAA
  { neto: 1 },                                    // sin folio: no cuenta
];
const PR = [
  proy({ folio_global: 'COT-0001@AAAA' }),
  proy({ folio_global: 'COT-0002@AAAA', etapa: 'cancelado' }),
  proy({ folio_global: 'COT-0003@AAAA' }),
];
const V = conversion(H, PR, 'AAAA');
eq('autorizadas con folio', V.autorizadas, 5);
eq('ganadas', V.ganadas, 2);
eq('perdidas', V.perdidas, 1);
eq('sin decidir (incluye la del otro aparato)', V.sinDecidir, 2);
eq('tasa sobre las decididas', V.tasa, 67);
eq('cero de cero es null, no 0 %', conversion([{ folio: 'COT-0001' }], [], 'AAAA').tasa, null);

console.log('\nEL CSV');
eq('un campo con coma va entre comillas', csvCampo('a, b'), '"a, b"');
eq('una fórmula se desactiva con apóstrofo', csvCampo('=SUM(A1)'), '"\'=SUM(A1)"');
eq('un negativo numérico se deja', csvCampo('-12.5'), '-12.5');
const csv = csvProyectos([proy({ notas: 'línea 1\nlínea 2', dir_texto: 'Calle 1, Col. X' })], new Map([['p', '2026-09-20']]));
const lineas = csv.split('\r\n');
ok('empieza con BOM', csv.charCodeAt(0) === 0xFEFF);
eq('encabezado con las columnas', lineas[0].replace('﻿', ''), COLUMNAS_CSV.map(csvCampo).join(','));
eq('dos líneas: encabezado y una fila', lineas.length, 2);
const campos = lineas[1].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
eq('mismo número de campos que columnas', campos.length, COLUMNAS_CSV.length);
eq('la fila lleva folio, fecha, etapa y saldo', [campos[0], campos[1], campos[6], campos[10]], ['COT-0001', '2026-09-03', 'En diseño', '5800.00']);
eq('la instalación entra por el mapa de fechas', campos[14], '2026-09-20');
eq('la dirección con coma va entre comillas', campos[15], '"Calle 1, Col. X"');
ok('las notas de dos renglones quedan en uno', !campos[17].includes('\n'));

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
