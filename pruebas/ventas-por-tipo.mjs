/* LO VENDIDO POR TIPO DE TRABAJO: las tarjetas y las gráficas de arriba de Control.
 *
 * Lo que se cuida: que una venta con dos tipos cuente en los dos sin duplicar el total, que lo
 * que no trae tipo se vea como «Sin tipo», que lo cancelado y lo que no tiene fecha no se
 * cuenten (el mismo criterio que el resto de Control), que la serie no tenga huecos al cambiar
 * de año, y que el periodo anterior sea el que dice la pantalla.
 *
 * Uso:  node pruebas/ventas-por-tipo.mjs
 */
import { tiposDeVenta, resumenPorTipo, seriePorMes, seriePorAnio, rangoPeriodo, claseTipo, nombreTipo,
         tiposVisibles, SIN_TIPO } from '../js/datos/ventas-por-tipo.js';
import { TIPOS_TRABAJO } from '../js/datos/proyectos.js';
import { unificar } from '../js/datos/ventas.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const ok = (que, cond) => { if (cond) { bien++; console.log('  ok   ' + que); } else { mal++; console.log('  FALLA ' + que); } };

const LC = 'Letras 3D con iluminacion', CL = 'Caja de luz con iluminacion', ES = 'Custome / Proyecto Especial',
      VI = 'Rotulacion de vinil';
let n = 0;
const v = (fecha, tipos, neto, o = {}) => ({ id: 'v' + (++n), fecha_ganado: fecha, tipo_trabajo: tipos,
  neto, precio_auth: neto, etapa: 'en_diseno', ...o });

const HOY = '2026-10-09';

console.log('\nLOS TIPOS DE UNA VENTA');
eq('orden canónico y sin repetir', tiposDeVenta({ tipo_trabajo: [ES, LC, LC] }), [LC, ES]);
eq('vacío → Sin tipo', tiposDeVenta({ tipo_trabajo: [] }), [SIN_TIPO]);
eq('sin campo → Sin tipo', tiposDeVenta({}), [SIN_TIPO]);
eq('blancos → Sin tipo', tiposDeVenta({ tipo_trabajo: ['', '  '] }), [SIN_TIPO]);
eq('con acentos y mayúsculas de la hoja → el canónico',
  tiposDeVenta({ tipo_trabajo: ['letras 3d con iluminación', 'Rotulación de vinil'] }), [LC, VI]);
eq('texto con comas (hoja vieja)', tiposDeVenta({ tipo_trabajo: 'Recorte acrilico, Rotulacion de vinil' }),
  ['Rotulacion de vinil', 'Recorte acrilico']);
eq('un valor ajeno se cuenta con su nombre, al final', tiposDeVenta({ tipo_trabajo: ['Neón flex', LC] }), [LC, 'Neón flex']);
eq('clases de color', [claseTipo(TIPOS_TRABAJO[0]), claseTipo(ES), claseTipo(SIN_TIPO), claseTipo('Neón flex')],
  ['tt-1', 'tt-7', 'tt-x', 'tt-o']);
eq('nombre legible', [nombreTipo(LC), nombreTipo(ES), nombreTipo(SIN_TIPO)],
  ['Letras 3D con iluminación', 'Proyecto especial', 'Sin tipo']);

console.log('\nLOS PERIODOS');
eq('mes: del 1 a hoy, contra el mes anterior completo', rangoPeriodo('mes', HOY),
  { desde: '2026-10-01', hasta: HOY, etiqueta: 'oct 2026',
    anterior: { desde: '2026-09-01', hasta: '2026-09-30', etiqueta: 'sep 2026' } });
eq('mes de enero: el anterior es diciembre del año pasado', rangoPeriodo('mes', '2027-01-05').anterior,
  { desde: '2026-12-01', hasta: '2026-12-31', etiqueta: 'dic 2026' });
eq('año: contra el anterior al mismo día', rangoPeriodo('anio', HOY),
  { desde: '2026-01-01', hasta: HOY, etiqueta: '2026',
    anterior: { desde: '2025-01-01', hasta: '2025-10-09', etiqueta: '2025 al 9 oct' } });
eq('29 de febrero contra el 28', rangoPeriodo('anio', '2028-02-29').anterior.hasta, '2027-02-28');
eq('todo: desde la primera venta y sin anterior', rangoPeriodo('todo', HOY, '2023-04-11'),
  { desde: '2023-04-11', hasta: HOY, etiqueta: 'desde abr 2023', anterior: null });

console.log('\nLAS TARJETAS');
const V = [
  v('2026-10-02', [LC, ES], 40000),        // letras + bastidor: dos trabajos, una venta
  v('2026-10-05', [CL], 20000),
  v('2026-09-20', [LC], 10000),             // mes anterior
  v('2026-03-01', [], 5000),                // sin tipo, este año
  v('2025-06-01', [LC], 8000),              // año anterior, antes del 9 oct
  v('2025-11-01', [CL], 9000),              // año anterior, DESPUÉS del 9 oct: no entra en la comparación
  v('2026-10-03', [LC], 99999, { etapa: 'cancelado' }),  // cancelada: no cuenta
  v('', [VI], 7000),                        // sin fecha: no cae en ningún periodo
];
const mes = resumenPorTipo(V, { hoy: HOY, periodo: 'mes' });
const t = (r, tipo) => r.tipos.find(x => x.tipo === tipo);
eq('mes: total de ventas e importe sin duplicar', [mes.total.ventas, mes.total.trabajos, mes.total.importe], [2, 3, 60000]);
eq('mes: letras cuenta la venta doble', [t(mes, LC).n, t(mes, LC).importe], [1, 40000]);
eq('mes: proyecto especial también la cuenta, con el importe entero', [t(mes, ES).n, t(mes, ES).importe], [1, 40000]);
eq('mes: caja de luz', [t(mes, CL).n, t(mes, CL).importe], [1, 20000]);
eq('mes: contra septiembre', [t(mes, LC).nAnt, t(mes, LC).delta, t(mes, CL).delta], [1, 0, 1]);
eq('mes: total anterior', [mes.total.ventasAnt, mes.total.importeAnt], [1, 10000]);
eq('la cancelada no cuenta', t(mes, LC).importe < 99999, true);
eq('sin fecha se reporta aparte', mes.sinFecha, 1);
ok('los siete tipos siempre están, aunque en cero', TIPOS_TRABAJO.every(x => t(mes, x)));
eq('«Sin tipo» aparece (existe en el récord) y va al final', mes.tipos[mes.tipos.length - 1].tipo, SIN_TIPO);
eq('«Sin tipo» en el mes: cero', t(mes, SIN_TIPO).n, 0);

const anio = resumenPorTipo(V, { hoy: HOY, periodo: 'anio' });
eq('año: ventas, trabajos e importe', [anio.total.ventas, anio.total.trabajos, anio.total.importe], [4, 5, 75000]);
eq('año: sin tipo cuenta', [t(anio, SIN_TIPO).n, t(anio, SIN_TIPO).importe], [1, 5000]);
eq('año: letras contra 2025 al mismo día', [t(anio, LC).n, t(anio, LC).nAnt, t(anio, LC).delta], [2, 1, 1]);
eq('año: caja de luz de nov 2025 no entra en la comparación', t(anio, CL).nAnt, 0);

const todo = resumenPorTipo(V, { hoy: HOY, periodo: 'todo' });
eq('todo: desde la primera venta', [todo.primera, todo.rango.etiqueta], ['2025-06-01', 'desde jun 2025']);
eq('todo: totales', [todo.total.ventas, todo.total.importe, todo.total.ventasAnt], [6, 92000, null]);
eq('todo: sin comparación', t(todo, LC).delta, null);
eq('periodo por defecto: año', resumenPorTipo(V, { hoy: HOY }).periodo, 'anio');
eq('sin ventas: todo en cero, sin «Sin tipo»', (() => { const r = resumenPorTipo([], { hoy: HOY, periodo: 'anio' });
  return [r.total.ventas, r.tipos.length, r.primera]; })(), [0, 7, '']);
eq('tipos visibles con un valor ajeno', tiposVisibles([v('2026-01-01', ['Neón flex'], 1)]).slice(7), ['Neón flex']);

console.log('\nLA SERIE POR MES');
const sm = seriePorMes(V, { hoy: HOY });
eq('del mes de la primera venta al de hoy, sin huecos', [sm.length, sm[0].clave, sm[sm.length - 1].clave], [17, '2025-06', '2026-10']);
ok('cruza el cambio de año en orden', sm.findIndex(x => x.clave === '2025-12') + 1 === sm.findIndex(x => x.clave === '2026-01'));
const oct = sm.find(x => x.clave === '2026-10');
eq('octubre por tipo', oct.porTipo, { [LC]: 1, [ES]: 1, [CL]: 1 });
eq('octubre: ventas, trabajos, importe', [oct.ventas, oct.trabajos, oct.importe], [2, 3, 60000]);
eq('importe por tipo (entero en cada tipo)', oct.importeTipo[ES], 40000);
eq('un mes sin ventas sale en cero', sm.find(x => x.clave === '2025-07').ventas, 0);
eq('marzo: sin tipo', sm.find(x => x.clave === '2026-03').porTipo, { [SIN_TIPO]: 1 });
eq('ventas en el futuro no estiran la serie', seriePorMes([v('2027-02-01', [LC], 1), v('2026-10-01', [LC], 1)], { hoy: HOY }).length, 1);
eq('sin ventas, serie vacía', seriePorMes([], { hoy: HOY }), []);

console.log('\nLA SERIE POR AÑO');
const sa = seriePorAnio(V, { hoy: HOY });
eq('años', sa.map(x => x.clave), ['2025', '2026']);
eq('2025: dos ventas, letras y caja', [sa[0].ventas, sa[0].porTipo], [2, { [LC]: 1, [CL]: 1 }]);
eq('2026: ventas e importe sin duplicar', [sa[1].ventas, sa[1].trabajos, sa[1].importe], [4, 5, 75000]);
eq('un año sin ventas en medio sale en cero', seriePorAnio([v('2023-05-01', [LC], 1)], { hoy: HOY }).map(x => x.ventas), [1, 0, 0, 0]);
ok('la suma de los años es el total de «todo»', sa.reduce((s, x) => s + x.importe, 0) === todo.total.importe);

console.log('\nCON EL RÉCORD UNIFICADO (la hoja)');
/* Una fila de la hoja trae el tipo como lista de textos y el importe en `neto`: tiene que
   llegar a las tarjetas igual que una venta de este teléfono. */
const hoja = [{ id: 'hoja:V-1', folio_hoja: 'V-1', nombre: 'Tacos', tipo_trabajo: ['Caja de luz con iluminacion'],
  fecha_anticipo: '2026-10-01', neto: 11600, sub: 10000 },
  { id: 'hoja:V-2', folio_hoja: 'V-2', nombre: 'Viejo', tipo_trabajo: [], fecha_anticipo: '2024-02-10', neto: 3000 }];
const u = unificar([], hoja).ventas;
const ru = resumenPorTipo(u, { hoy: HOY, periodo: 'todo' });
eq('la fila de la hoja cuenta en su tipo', [t(ru, CL).n, t(ru, CL).importe], [1, 11600]);
eq('la fila vieja sin tipo va a «Sin tipo»', t(ru, SIN_TIPO).n, 1);

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
