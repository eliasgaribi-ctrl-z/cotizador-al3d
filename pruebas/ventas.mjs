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
         mesDe, etiquetaMes, rangoMes, vendidoDe, COLUMNAS_CSV, ventaDesdeHoja, unificar } from '../js/datos/ventas.js';
import { desdeVentaDeHoja } from '../js/datos/proyectos.js';
import { VIVAS_EN_TALLER } from '../js/datos/puente.js';

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
eq('la fila lleva folio, fecha, etapa y saldo', [campos[0], campos[2], campos[7], campos[11]], ['COT-0001', '2026-09-03', 'En diseño', '5800.00']);
eq('la instalación entra por el mapa de fechas', campos[15], '2026-09-20');
eq('la dirección con coma va entre comillas', campos[16], '"Calle 1, Col. X"');
ok('las notas de dos renglones quedan en uno', !campos[18].includes('\n'));
eq('el origen de un proyecto que solo está aquí es su aparato', campos[17], 'AAAA');

console.log('\nEL RÉCORD DE LA HOJA, UNIDO AL DE ESTE TELÉFONO');
{
  /* Una fila del espejo `ventas_hoja`, como la deja `puente.ventaDeHoja`: una venta anterior a
     la plataforma, sin folio de cotización y sin etapa de obra. */
  const fila = (o = {}) => ({ id: 'hoja:V-001', folio_hoja: 'V-001', folio_cotizacion: '', nombre: 'Farmacia - Letras',
    cuenta: 'Elias BBVA', estatus: 'LIQUIDADO', tipo_trabajo: ['Letras 3D con iluminacion'], iva: true,
    fecha_anticipo: '2026-08-12', fecha_instalacion: '2026-08-28', fecha_liquidacion: '2026-08-30', etapa: null, direccion: '',
    sub: 25000, neto: 29000, anticipo: 15000, liquidacion: 14000, pago_pendiente: 0, comision_restante: 0, ...o });

  const v = ventaDesdeHoja(fila());
  eq('una fila de la hoja se lee como venta, y se marca', v.de_hoja, true);
  eq('lo vendido es el neto de la hoja, sin recalcular nada', vendidoDe(v), 29000);
  eq('la fecha es la del anticipo', v.fecha_ganado, '2026-08-12');
  eq('sin etapa de obra no se le inventa una', v.etapa, null);
  eq('el folio que se enseña es el de la hoja cuando no hay cotización', v.folio_local, 'V-001');
  eq('LIQUIDADO en la hoja: saldo cero', saldoDe(v), 0);
  eq('sin fecha de anticipo cae a la de instalación, y luego a la de liquidación',
     ventaDesdeHoja(fila({ fecha_anticipo: '', fecha_instalacion: '', fecha_liquidacion: '2026-07-01' })).fecha_ganado, '2026-07-01');
  eq('basura → null', ventaDesdeHoja(null), null);

  /* Los tres casos que conviven: una venta en los dos lados, una que solo está aquí y una
     que solo está en la hoja. */
  const local = proy({ id: 'p1', folio_global: 'COT-0001@AAAA', fecha_ganado: '2026-09-03', neto: 11600, precio_auth: 11600,
    anti_pactado: 5800, pago_pendiente: null, creado_en: 10 });
  const enHoja = fila({ id: 'hoja:V-200', folio_hoja: 'V-200', folio_cotizacion: 'COT-0001@AAAA', nombre: 'Uno', estatus: 'COBRANDO',
    fecha_anticipo: '2026-08-31', sub: 10500, neto: 12180, anticipo: 6000, pago_pendiente: 6180, comision_restante: 1050 });
  const soloAqui = proy({ id: 'p2', folio_global: 'COT-0002@AAAA', folio_local: 'COT-0002', nombre: 'Dos', fecha_ganado: '2026-09-10', creado_en: 20 });
  const u = unificar([local, soloAqui], [fila(), enHoja]);
  eq('tres ventas: la enlazada, la que solo está aquí y la histórica', u.ventas.length, 3);
  eq('cuántas de cada', [u.enlazados, u.de_hoja, u.solo_aqui, u.hay_hoja], [1, 1, 1, true]);
  const e = u.ventas.find(x => x.id === 'p1');
  eq('la enlazada sigue siendo el proyecto: su id, su nombre, su folio de la hoja', [e.id, e.nombre, e.en_hoja, e.folio_hoja], ['p1', 'Uno', true, 'V-200']);
  eq('pero el importe es el de la hoja, no el que se firmó aquí', vendidoDe(e), 12180);
  eq('y el mes también: la fecha del anticipo de la hoja', e.fecha_ganado, '2026-08-31');
  eq('y el anticipo, el estatus y las fórmulas', [e.anti_pactado, e.estatus_notion, e.pago_pendiente, e.comision_restante], [6000, 'COBRANDO', 6180, 1050]);
  eq('el saldo es el de la hoja', saldoDe(e), 6180);
  eq('la que solo está aquí va tal cual, sin marca de hoja', u.ventas.find(x => x.id === 'p2').en_hoja, undefined);
  eq('lo más reciente primero', u.ventas.map(x => x.id), ['p2', 'p1', 'hoja:V-001']);

  const m = resumenMensual(u.ventas, { hoy: HOY, meses: 2 });
  eq('agosto suma la histórica y la enlazada, que la hoja movió de mes', m[0].vendido, 41180);
  eq('septiembre, la que solo está aquí', m[1].vendido, 11600);
  const k = indicadores(u.ventas, [], { hoy: HOY });
  eq('por cobrar: el saldo de la hoja de una y el estimado de la otra', k.porCobrar.total, 6180 + 5800);
  const c = porCobrar(u.ventas);
  eq('y la cartera dice cuál es cuál', c.map(x => [x.proyecto.id, x.deNotion]), [['p1', true], ['p2', false]]);

  /* La fila que a fabricación le llega sin dinero no se vuelve una venta de cero pesos que
     sí se sume: suma cero, y no truena. */
  const sinDinero = unificar([], [{ id: 'hoja:V-9', folio_hoja: 'V-9', nombre: 'X', fecha_anticipo: '2026-09-01' }]);
  eq('una fila sin dinero no truena', vendidoDe(sinDinero.ventas[0]), 0);
  eq('sin hoja: los proyectos tal cual', unificar([local], []).ventas.length, 1);
  eq('sin nada: vacío', unificar(null, null), { ventas: [], enlazados: 0, de_hoja: 0, solo_aqui: 0, hay_hoja: false });

  /* Y al CSV, con su origen: es lo que deja cuadrarlo contra la hoja. */
  const l = csvProyectos(u.ventas, new Map()).split('\r\n');
  eq('tres renglones de CSV', l.length, 4);
  const campo = (linea, i) => linea.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)[i];
  eq('la que solo está aquí: su aparato', campo(l[1], 17), 'AAAA');
  eq('la enlazada: hoja y aparato, con el folio de la hoja', [campo(l[2], 17), campo(l[2], 1)], ['hoja + AAAA', 'V-200']);
  eq('la histórica: hoja, y su folio', [campo(l[3], 17), campo(l[3], 1), campo(l[3], 0)], ['hoja', 'V-001', 'V-001']);
}

/* ============================================================================
   LO QUE ESTABA EN LA HOJA Y NO EN EL TABLERO

   El caso real, de septiembre de 2026: dieciséis filas con estatus FABRICACION —trabajo en
   el taller, cobrado a medias— y el tablero diciendo «0 en el taller hoy». El puente no
   convertía filas en proyectos, así que lo que no había nacido en el cotizador no existía
   para la obra.

   De todo lo que se prueba aquí, hay dos que si se rompen cuestan dinero:
     · que el id sea DETERMINISTA, porque con uno aleatorio cada barrido duplicaría los
       dieciséis y el tablero contaría cuarenta y ocho trabajos donde hay dieciséis;
     · y que `unificar` NO cuente dos veces la misma venta —una como proyecto y otra como
       fila— porque eso sale directo en «vendido este mes», al doble.
   ============================================================================ */
console.log('\nDE LA FILA EN FABRICACIÓN AL TABLERO');
{
  const fila = (o = {}) => ({ id: 'hoja:V-214', folio_hoja: 'V-214', folio_cotizacion: '',
    nombre: 'Joaquín - Placita La Perla', estatus: 'FABRICACION', cuenta: 'Elias BBVA',
    tipo_trabajo: ['Letras 3D con iluminacion'], iva: false, fecha_anticipo: '2026-09-18',
    fecha_instalacion: '', fecha_liquidacion: '', etapa: null, direccion: '',
    sub: 43500, neto: 43500, anticipo: 21750, pago_pendiente: 21750, ...o });

  const p = desdeVentaDeHoja(fila());
  eq('el id sale del folio de la hoja, no del azar', p.id, 'proy-hoja-V-214');
  eq('y dos barridos dan el MISMO id: no se duplica en cada bajada',
     desdeVentaDeHoja(fila()).id, p.id);
  eq('la etapa es «ganado»: es lo que se sabe, no un relleno', p.etapa, 'ganado');
  eq('la fecha del trabajo es la del anticipo', p.fecha_ganado, '2026-09-18');
  eq('el nombre se parte en contacto y negocio', [p.contacto, p.negocio],
     ['Joaquín', 'Placita La Perla']);
  eq('el «(Tipo)» del final no se queda pegado al negocio',
     desdeVentaDeHoja(fila({ nombre: 'Ale - Parentesis (Caja Luz Mostrador)' })).negocio, 'Parentesis');
  eq('un nombre sin separador se queda entero como negocio, y el contacto vacío',
     [desdeVentaDeHoja(fila({ nombre: 'Kelvarion' })).contacto,
      desdeVentaDeHoja(fila({ nombre: 'Kelvarion' })).negocio], ['', 'Kelvarion']);
  ok('queda marcado como venido de la hoja', p.de_hoja === true);
  eq('y sin origen: null y no un objeto vacío, que se leería como «hay cotización»', p.origen, null);
  eq('el dinero es el de la hoja', [p.sub, p.neto, p.precio_auth, p.anti_pactado],
     [43500, 43500, 43500, 21750]);
  eq('y el saldo también', p.pago_pendiente, 21750);
  eq('el folio interno es el id del renglón para el puente, así una subida no crea otra fila',
     p.notion_page_id, 'V-214');
  eq('sin folio de hoja no hay id estable, así que no entra', desdeVentaDeHoja(fila({ folio_hoja: '' })), null);
  eq('sin nombre no hay nada que enseñar, así que tampoco', desdeVentaDeHoja(fila({ nombre: '' })), null);
  eq('basura tampoco', desdeVentaDeHoja(null), null);

  /* Qué se importa y qué no. Las 199 históricas son casi todas liquidadas: de eso depende
     que importar «lo vivo» no llene el tablero de trabajo terminado. */
  eq('fabricación y reparando son trabajo del taller', VIVAS_EN_TALLER, ['FABRICACION', 'REPARANDO']);
  ok('cobrando NO se importa: ya se hizo y solo falta cobrarlo', !VIVAS_EN_TALLER.includes('COBRANDO'));
  ok('liquidado tampoco: está cerrado', !VIVAS_EN_TALLER.includes('LIQUIDADO'));

  /* Y la que de verdad cuesta dinero: la misma venta contada dos veces. */
  const u = unificar([p], [fila()]);
  eq('el proyecto importado y su fila son UNA venta, no dos', u.ventas.length, 1);
  eq('y se cuenta como enlazada', [u.enlazados, u.de_hoja, u.solo_aqui], [1, 0, 0]);
  eq('lo vendido es el neto de la hoja, una vez', vendidoDe(u.ventas[0]), 43500);
  const m = resumenMensual(u.ventas, { hoy: '2026-09-20', meses: 2 });
  eq('septiembre suma 43,500 y no 87,000', m[1].vendido, 43500);
  eq('y una venta, no dos', m[1].ganados, 1);

  /* La fila se borra en la hoja. El barrido la quita de `ventas_hoja`, pero el proyecto que se
     importó de ella se queda en este teléfono: se contaba como venta «solo de aquí», con su
     importe y su saldo, cuando el README dice que lo borrado allá desaparece de aquí. */
  const otra = fila({ id: 'hoja:V-215', folio_hoja: 'V-215', nombre: 'Otra - Venta' });
  const b = unificar([p], [otra]);
  eq('borrada en la hoja: el importado ya no es una venta', b.ventas.map(x => x.id), ['hoja:V-215']);
  eq('ni se cuenta como «solo en este dispositivo»', [b.enlazados, b.de_hoja, b.solo_aqui], [0, 1, 0]);
  eq('sin espejo bajado todavía no hay con qué saberlo, y se cuenta como siempre',
     unificar([p], []).ventas.map(x => x.id), ['proy-hoja-V-214']);
  eq('un proyecto nacido aquí sin fila sigue siendo «solo de aquí»',
     unificar([proy({ id: 'p7', folio_global: 'COT-0007@AAAA' })], [otra]).solo_aqui, 1);
}

console.log('\nLA COMISIÓN DE LA HOJA VIAJA CON LA VENTA');
{
  /* «Comisiones» (R) es la fórmula de la hoja: 10 % del subtotal. Baja con la fila y la unión
     la lleva, para que el asistente lea la de allá en vez de volver a calcularla. */
  const f = { id: 'hoja:V-300', folio_hoja: 'V-300', folio_cotizacion: 'COT-0300@AAAA', nombre: 'Tres', estatus: 'COBRANDO',
    fecha_anticipo: '2026-09-02', sub: 20000, neto: 23200, anticipo: 10000, comisiones: 2000, comision_restante: 2000 };
  eq('la fila suelta la trae', ventaDesdeHoja(f).comisiones, 2000);
  eq('y la enlazada también', unificar([proy({ id: 'p30', folio_global: 'COT-0300@AAAA' })], [f]).ventas[0].comisiones, 2000);
  eq('sin la columna (fabricación) queda en null, no en cero', ventaDesdeHoja({ ...f, comisiones: undefined }).comisiones, null);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
