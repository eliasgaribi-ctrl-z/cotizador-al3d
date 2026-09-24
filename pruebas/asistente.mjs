/* EL CONTEXTO DEL ASISTENTE: lo que viaja, lo que NO viaja, y cómo se pinta lo que vuelve.
 *
 * Tres cosas que no se pueden revisar mirando la pantalla:
 *   · que a fabricación no se le vaya un solo importe en el resumen (`veDinero:false`);
 *   · que el teléfono y la dirección del cliente nunca salgan del dispositivo;
 *   · que la respuesta del modelo —lo único que entra de fuera— no pueda meter marcado.
 * Y la aritmética de comisiones, que es la pregunta por la que nació el botón.
 *
 * Uso:  node pruebas/asistente.mjs
 */
import { readFileSync } from 'fs';
import { comisionDe, resumirProyecto, armarResumen, promptSistema, mdLite, llavesDe, cadenaIA,
         detectarIntencion, responderLocal, respuestaLocal, resumenDelDia, INTENCIONES, sugerirIntenciones }
  from '../js/datos/asistente-contexto.js';
import { unificar } from '../js/datos/ventas.js';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const ok = (que, cond) => { if (cond) { bien++; console.log('  ok   ' + que); } else { mal++; console.log('  FALLA ' + que); } };

const proy = (o = {}) => ({ id: 'p1', folio_local: 'COT-0031', folio_global: 'COT-0031@AAAA', nombre: 'Healthylicious - Letrero',
  contacto: 'Ana', negocio: 'Healthylicious', tel: '3312345678', dir_texto: 'Av. Patria 123, Zapopan', lat: 20.7, lng: -103.4,
  tipo_trabajo: ['Letras 3D con iluminacion'], etapa: 'instalado', fecha_ganado: '2026-09-03', sub: 10000, neto: 11600,
  precio_auth: 11600, anti_pactado: 5800, pct_comision: 10, cuenta: 'BBVA', estatus_notion: 'COBRANDO', iva: true,
  pago_pendiente: null, comision_restante: null, origen: { items: [{ id: 1 }] }, ...o });

console.log('\nLA COMISIÓN, con la aritmética de la hoja: 10 % fijo del subtotal');
eq('10 % de 10 000 de subtotal', comisionDe(proy()).comision, 1000);
eq('sin liquidar: nada abonable, todo restante', [comisionDe(proy()).abonable, comisionDe(proy()).restante], [0, 1000]);
eq('LIQUIDADO: todo abonable', [comisionDe(proy({ estatus_notion: 'LIQUIDADO' })).abonable, comisionDe(proy({ estatus_notion: 'LIQUIDADO' })).restante], [1000, 0]);
/* Hasta septiembre de 2026 la comisión era subtotal × el % capturado, redondeada a pesos. La
   hoja paga 10 % fijo —ROUND(G*10%,2) en la columna R— y la celda vacía del % es el caso de
   casi todas las filas: el asistente las daba por «sin comisión». */
eq('sin porcentaje capturado es el 10 % de siempre, no cero', comisionDe(proy({ pct_comision: 0 })).comision, 1000);
eq('un 15 % capturado no cambia lo que la hoja paga', comisionDe(proy({ pct_comision: 15 })).comision, 1000);
eq('con centavos, como la hoja, no redondeada a pesos', comisionDe(proy({ sub: 17587.6 })).comision, 1758.76);
eq('la «Comisiones» que bajó de la hoja manda', comisionDe(proy({ comisiones: 1234.5 })).comision, 1234.5);
eq('cancelado no comisiona', comisionDe(proy({ etapa: 'cancelado', estatus_notion: 'LIQUIDADO' })).abonable, 0);
eq('si Notion bajó comision_restante, manda', comisionDe(proy({ comision_restante: 350, estatus_notion: 'LIQUIDADO' })), { comision: 1000, abonable: 350, restante: 350, deNotion: true });
eq('sin subtotal se deduce del total con IVA', comisionDe(proy({ sub: 0, precio_auth: 11600 })).comision, 1000);

console.log('\nEL PROYECTO RESUMIDO: sin teléfono ni dirección');
const r = resumirProyecto(proy(), { veDinero: true, instalacion: { fecha: '2026-09-20', hora: '10:00', estado: 'confirmada' } });
ok('no lleva teléfono', !JSON.stringify(r).includes('3312345678'));
ok('no lleva dirección', !JSON.stringify(r).includes('Patria'));
ok('no lleva coordenadas', !('lat' in r) && !JSON.stringify(r).includes('20.7'));
eq('sí lleva folio, etapa y la instalación', [r.folio, r.etapa, r.instalacion], ['COT-0031', 'instalado', '2026-09-20 10:00 (confirmada)']);
eq('y el dinero, cuando el rol lo ve', [r.vendido, r.anticipo, r.saldo_estimado, r.comision, r.comision_abonable_ya, r.comision_restante], [11600, 5800, 5800, 1000, 0, 1000]);
ok('el % capturado ya no viaja: la regla es una sola', !('pct_comision' in resumirProyecto(proy({ pct_comision: 15 }), { veDinero: true })));
eq('y sin % capturado el proyecto sigue llevando su comisión', resumirProyecto(proy({ pct_comision: 0 }), { veDinero: true }).comision, 1000);
const rf = resumirProyecto(proy(), { veDinero: false });
ok('para fabricación no hay ningún importe', ['vendido', 'anticipo', 'saldo_estimado', 'comision', 'comision_abonable_ya', 'cuenta', 'estatus_notion', 'pct_comision'].every(k => !(k in rf)));
ok('ni el número aparece por otro lado', !JSON.stringify(rf).includes('11600') && !JSON.stringify(rf).includes('5800'));

console.log('\nEL RESUMEN COMPLETO');
const P = [
  proy(),
  proy({ id: 'p2', folio_local: 'COT-0030', folio_global: 'COT-0030@AAAA', nombre: 'Café - Caja', etapa: 'en_diseno', estatus_notion: 'LIQUIDADO', pct_comision: 10, sub: 5000, precio_auth: 5800, anti_pactado: 5800 }),
  proy({ id: 'p3', folio_local: 'COT-0029', folio_global: 'COT-0029@AAAA', nombre: 'Gym - Letras', etapa: 'cancelado', notas: 'Se fue con otro', precio_auth: 9000 }),
];
const R = armarResumen({ hoy: '2026-09-14', rol: 'Dirección', nombre: 'Elías', veDinero: true, proyectos: P,
  instalaciones: [{ proyecto_id: 'p2', fecha: '2026-09-18', hora: '11:00', estado: 'confirmada' }],
  ventanas: new Map([['p2', { estado: 'tarde', texto: 'Va 6 días tarde: debía estar cortado', atraso_dias: 6 }]]),
  kpi: { mes: { n: 1, total: 11600, etiqueta: 'sep 2026' }, mesAnterior: { n: 0, total: 0, etiqueta: 'ago 2026' }, variacion: null,
         ultimos12: { n: 2, total: 17400 }, ticket: 8700, pipeline: { n: 1, total: 3000 }, perdidoMes: { n: 1, total: 9000 },
         porCobrar: { n: 1, total: 5800, anticipos: 11600 } },
  conversion: { autorizadas: 3, ganadas: 2, perdidas: 1, sinDecidir: 0, tasa: 67 },
  faltantes: [{ nombre: 'Acrílico 6 mm', comprar: 1.5, unidad_compra: 'lamina', proyectos: [{ id: 'p2', nombre: 'Café - Caja' }], fecha: '2026-09-18', confianza: 'estimada' }, { nombre: 'Silicón', comprar: 0 }],
  bajoMinimo: [{ nombre: 'Silicón', cantidad: 0, unidad_compra: 'unidad', min_stock: 1 }],
  avisos: [{ titulo: 'Falta material y Café se instala en 4 días', detalle: 'Compra $1,200 de acrílico', cuando: 'en 4 días' }],
  sinDecidir: [{ folio: 'COT-0032', cliente: 'Vet', proy: 'Letrero', neto: 3000, ts: Date.parse('2026-09-10T12:00:00') }],
  cola: [{ id: 'q1' }],
  bitacora: [{ ts: Date.parse('2026-09-14T13:05:00'), sello: 'Beto · Fabricación (K7QM)', titulo: 'Café - Caja pasó a En diseño' }],
});
eq('proyectos vivos en la lista (el cancelado va aparte)', R.proyectos.map(p => p.folio), ['COT-0030', 'COT-0031']);
eq('el abierto lleva su ventana de taller', [R.proyectos[0].taller, R.proyectos[0].atraso_dias], ['Va 6 días tarde: debía estar cortado', 6]);
eq('los que no se dieron, con motivo e importe', R.no_se_dieron, { total: 1, ultimos: [{ folio: 'COT-0029', nombre: 'Gym - Letras', fecha: '2026-09-03', motivo: 'Se fue con otro', importe: 9000 }] });
eq('comisiones: la liquidada es abonable y la otra espera', [R.comisiones.total_abonable_ya, R.comisiones.total_pendiente, R.comisiones.abonables_ya[0].folio, R.comisiones.pendientes_de_liquidar[0].folio], [500, 1000, 'COT-0030', 'COT-0031']);
eq('material por comprar solo lo que pide compra, con su proyecto', R.material_por_comprar, [{ material: 'Acrílico 6 mm', comprar: 1.5, unidad: 'lamina', para: 'Café - Caja', fecha: '2026-09-18', confianza: 'estimada' }]);
eq('bajo mínimo', R.bajo_minimo, [{ material: 'Silicón', hay: 0, unidad: 'unidad', minimo: 1, proveedor: '' }]);
eq('las autorizadas sin decidir traen los días que llevan', R.cotizaciones_autorizadas_sin_decidir[0].dias, 4);
eq('la bitácora, con quién y cuándo', R.ultimos_movimientos[0], { cuando: '2026-09-14 13:05', quien: 'Beto · Fabricación (K7QM)', que: 'Café - Caja pasó a En diseño' });
ok('el resumen entero no lleva teléfonos ni direcciones', !JSON.stringify(R).includes('3312345678') && !JSON.stringify(R).includes('Patria'));

const RF = armarResumen({ hoy: '2026-09-14', rol: 'Fabricación', veDinero: false, proyectos: P, sinDecidir: [{ folio: 'x' }],
  avisos: [{ titulo: 'Cobro', detalle: 'Quedan $5,800.00 por cobrar', cuando: 'hoy' }] });
ok('para fabricación no viajan ventas, comisiones ni conversión', !('ventas' in RF) && !('comisiones' in RF) && !('conversion' in RF));
eq('las autorizadas sin decidir son solo una cuenta', RF.cotizaciones_autorizadas_sin_decidir, 1);
ok('y un aviso con importe pierde su detalle', !('detalle' in RF.avisos[0]));
ok('ningún importe en todo el resumen de fabricación', !/11600|5800|9000|\$/.test(JSON.stringify(RF)));

/* Las filas de la hoja casi nunca traen el % (vacío es «el de siempre»), y con la regla vieja
   se caían de la lista aunque la hoja dijera que se deben 2,000. */
const RHoja = armarResumen({ hoy: '2026-09-23', rol: 'Dirección', veDinero: true, proyectos: [
  proy({ id: 'h1', folio_local: 'V-042', pct_comision: 0, estatus_notion: 'LIQUIDADO', sub: 20000, comision_restante: 2000 }),
  proy({ id: 'h2', folio_local: 'V-043', pct_comision: 0, estatus_notion: 'COBRANDO', sub: 20000, comision_restante: 2000, pago_pendiente: 5000 }),
] });
eq('con el % vacío, la liquidada de la hoja es abonable y la otra espera, al 10 %',
   [RHoja.comisiones.abonables_ya.map(x => [x.folio, x.comision, x.pct]), RHoja.comisiones.pendientes_de_liquidar.map(x => [x.folio, x.comision])],
   [[['V-042', 2000, 10]], [['V-043', 2000]]]);

console.log('\nLAS COMISIONES, del récord unificado: como las arma leerTaller');
/* El proyecto como lo deja el puente: `deNotion` le espeja la restante (T) pero NO la
   «Comisiones» (R) ni el subtotal que PAGOS corrigió en la hoja. Con él crudo, la comisión
   salía del subtotal viejo (1 000) y la restante de la hoja (1 400): la restante mayor que la
   comisión. Y la V-150, liquidada y solo en la hoja, no entraba: «ninguna comisión abonable»
   con la hoja debiendo 800. */
const pLocal = proy({ estatus_notion: 'COBRANDO', pago_pendiente: 10440, comision_restante: 1400, pct_comision: 0 });
const filasHoja = [
  { id: 'hoja:V-201', folio_hoja: 'V-201', folio_cotizacion: 'COT-0031@AAAA', nombre: 'Healthylicious - Letrero', estatus: 'COBRANDO',
    fecha_anticipo: '2026-09-03', sub: 14000, neto: 16240, anticipo: 5800, pago_pendiente: 10440, comisiones: 1400, comision_restante: 1400, iva: true },
  { id: 'hoja:V-150', folio_hoja: 'V-150', folio_cotizacion: '', nombre: 'Óptica Juárez - Caja de luz', estatus: 'LIQUIDADO',
    fecha_anticipo: '2026-08-10', sub: 8000, neto: 9280, anticipo: 9280, pago_pendiente: 0, comisiones: 800, comision_restante: 800, iva: true },
];
const RU = armarResumen({ hoy: '2026-09-24', rol: 'Dirección', veDinero: true, proyectos: [pLocal],
  ventas: unificar([pLocal], filasHoja).ventas });
const pu = RU.proyectos[0];
eq('la comisión del proyecto es la R de la hoja y cuadra con su restante', [pu.comision, pu.comision_restante], [1400, 1400]);
eq('y su importe es el de la hoja, como en Control', [pu.vendido, pu.saldo_estimado], [16240, 10440]);
eq('la venta que solo está en la hoja entra a las abonables', [RU.comisiones.total_abonable_ya, RU.comisiones.abonables_ya.map(x => [x.folio, x.comision])], [800, [['V-150', 800]]]);
eq('y la del proyecto espera, con la restante de la hoja', RU.comisiones.pendientes_de_liquidar.map(x => [x.folio, x.comision, x.saldo_del_cliente]), [['COT-0031', 1400, 10440]]);
ok('la de la hoja no trae id —no tiene ficha que abrir— y la del proyecto sí',
   (RU.comisiones.abonables_ya[0] || {}).id === '' && (RU.comisiones.pendientes_de_liquidar[0] || {}).id === 'p1');
eq('los botones abren solo proyectos de este teléfono', respuestaLocal('comisiones', RU).acciones.filter(a => a.tipo === 'proyecto').map(a => a.id), ['p1']);
ok('la respuesta local dice lo que dice la hoja', responderLocal('comisiones', RU).includes('Se pueden abonar ya: $800.00') && responderLocal('comisiones', RU).includes('V-150'));
eq('y la portada también', resumenDelDia(RU).comisionAbonable, 800);
eq('la venta de la hoja no se cuela a la lista del taller', RU.proyectos.map(p => p.folio), ['COT-0031']);
const RUF = armarResumen({ hoy: '2026-09-24', rol: 'Fabricación', veDinero: false, proyectos: [pLocal],
  ventas: unificar([pLocal], filasHoja).ventas });
ok('a fabricación el récord de la hoja no le llega aunque se lo pasen', !('comisiones' in RUF) && !/Óptica|V-150|1400|16240|800/.test(JSON.stringify(RUF)));
/* Lo de arriba solo sirve si el asistente de verdad le pasa el récord: leerTaller importa la
   base y no corre en node, así que aquí se lee su código. */
const fuenteAsis = readFileSync(new URL('../js/nucleo/asistente.js', import.meta.url), 'utf8');
const llamada = (/return armarResumen\(\{([\s\S]*?)\}\);/.exec(fuenteAsis) || [, ''])[1];
ok('leerTaller le pasa a armarResumen la lista unificada, solo si el rol ve dinero',
   /const ventas = veDinero \? Ventas\.unificar\(proyectos, hoja\)\.ventas/.test(fuenteAsis) && /\bventas: veDinero \? ventas : null\b/.test(llamada));
ok('y el mensaje de sistema avisa que la lista de comisiones es la de la hoja entera', promptSistema(RU).includes('puede traer ventas que no están en `proyectos`'));

console.log('\nLAS RESPUESTAS LOCALES: las siete de siempre, sin IA');
const RC = responderLocal('comisiones', R);
ok('comisiones: la liquidada sale como abonable con su importe', RC.includes('COT-0030') && RC.includes('$500.00') && RC.includes('Se pueden abonar ya'));
ok('y la otra espera liquidación con lo que debe el cliente', RC.includes('COT-0031') && RC.includes('$1,000.00') && RC.includes('el cliente debe $5,800.00'));
ok('y dice dónde se registra el abono', RC.includes('Registrar abono de comisión'));
const RD = responderLocal('cobranza', R);
ok('cobranza: total y renglones, el instalado marcado', RD.includes('Por cobrar: $5,800.00') && RD.includes('COT-0031') && RD.includes('ya instalado'));
const RT = responderLocal('tarde', R);
ok('tarde: el atrasado con sus días', RT.includes('1 trabajo va') && RT.includes('6 días') && RT.includes('COT-0030'));
const RS = responderLocal('semana', R);
ok('semana: la instalación de la semana con su día', RS.includes('18 sep') && RS.includes('Café - Caja') && RS.includes('confirmada'));
const RV = responderLocal('ventas', R);
ok('ventas: el mes, el anterior y la conversión', RV.includes('sep 2026: $11,600.00') && RV.includes('ago 2026: $0.00') && RV.includes('Conversión: 67 %'));
const RM = responderLocal('material', R);
ok('material: cantidad, unidad, proyecto y fecha', RM.includes('1.5 lamina') && RM.includes('Acrílico 6 mm') && RM.includes('Café - Caja') && RM.includes('18 sep'));
ok('y lo bajo mínimo', RM.includes('Silicón') && RM.includes('mínimo 1'));
const RX = responderLocal('sin_decidir', R);
ok('sin decidir: folio, cliente, importe y días', RX.includes('COT-0032') && RX.includes('Vet') && RX.includes('$3,000.00') && RX.includes('4 días'));
const RH = responderLocal('hoy', R);
ok('hoy: taller, agenda, cobranza y comisiones en un resumen', RH.includes('En el taller: 1 trabajo') && RH.includes('1 va tarde') && RH.includes('Por cobrar: **$5,800.00**') && RH.includes('$500.00'));
ok('para fabricación las de dinero dicen que no ven importes', responderLocal('comisiones', RF).includes('no se ven importes') && responderLocal('cobranza', RF).includes('no se ven importes'));
ok('y el resumen de fabricación no trae dinero', !/\$/.test(responderLocal('hoy', RF)));
eq('una intención que no existe da null', responderLocal('clima', R), null);
const vacio = armarResumen({ hoy: '2026-09-14', rol: 'Dirección', veDinero: true, proyectos: [] });
ok('sin proyectos, cada respuesta sigue teniendo sentido', responderLocal('cobranza', vacio).includes('Nadie debe') && responderLocal('tarde', vacio).includes('Nada va tarde') && responderLocal('comisiones', vacio).includes('ninguna comisión abonable'));
ok('todas las intenciones declaradas contestan algo', Object.keys(INTENCIONES).every(k => typeof responderLocal(k, R) === 'string' && responderLocal(k, R).length > 20));

console.log('\nLAS ACCIONES DE UNA RESPUESTA LOCAL: abrir el proyecto, ir a la pantalla');
const AC = respuestaLocal('cobranza', R).acciones;
eq('cobranza: primero la cartera, luego el proyecto con saldo', AC.map(a => a.tipo + ':' + (a.ruta || a.id)), ['pasar:control', 'proyecto:p1']);
eq('y la cartera abre en Por cobrar', AC[0].dato, { tab: 'cobrar' });
eq('el botón del proyecto lleva folio y nombre corto', AC[1].label, 'COT-0031 · Healthylicious');
const ACc = respuestaLocal('comisiones', R).acciones;
ok('comisiones: el enlace a la hoja y los dos proyectos con comisión', ACc[0].tipo === 'link' && ACc[0].href.startsWith('https://docs.google.com/spreadsheets/') && ACc.filter(a => a.tipo === 'proyecto').map(a => a.id).sort().join() === 'p1,p2');
eq('tarde: el Tablero y el atrasado', respuestaLocal('tarde', R).acciones.map(a => a.tipo + ':' + (a.ruta || a.id)), ['ir:hoy', 'proyecto:p2']);
eq('semana: el calendario en vista semana con el día de hoy', respuestaLocal('semana', R).acciones[0], { tipo: 'pasar', ruta: 'agenda', dato: { dia: '2026-09-14', vista: 'semana' }, label: 'Ver la semana' });
eq('material: la lista de compra', respuestaLocal('material', R).acciones.map(a => a.ruta), ['material']);
eq('sin decidir: Proyectos', respuestaLocal('sin_decidir', R).acciones.map(a => a.ruta), ['proyectos']);
eq('fabricación no recibe acciones de dinero', respuestaLocal('cobranza', RF).acciones, []);
ok('el id del proyecto está en el resumen local pero NO viaja en el prompt', R.proyectos[0].id === 'p2' && !promptSistema(R).includes('"id"'));
ok('el texto sigue siendo el mismo que responderLocal', respuestaLocal('tarde', R).texto === responderLocal('tarde', R));

console.log('\nLA INTENCIÓN DE UNA PREGUNTA ESCRITA');
eq('«¿qué debe la óptica?» es cobranza aunque nombre un cliente', detectarIntencion('¿qué debe la óptica?'), 'cobranza');
eq('«cuánto hay por cobrar»', detectarIntencion('cuánto hay por cobrar'), 'cobranza');
eq('«qué comisiones puedo pagar ya»', detectarIntencion('qué comisiones puedo pagar ya'), 'comisiones');
eq('«hay algo atrasado?»', detectarIntencion('hay algo atrasado?'), 'tarde');
eq('«qué se instala mañana»', detectarIntencion('qué se instala mañana'), 'semana');
eq('«cuánto vendimos en agosto»', detectarIntencion('cuánto vendimos en agosto'), 'ventas');
eq('«cómo vamos este mes de ventas» es ventas, no el resumen', detectarIntencion('cómo vamos este mes de ventas'), 'ventas');
eq('«hay que comprar acrílico?»', detectarIntencion('hay que comprar acrílico?'), 'material');
eq('«qué cotizaciones autorizadas no han contestado»', detectarIntencion('qué cotizaciones autorizadas no han contestado'), 'sin_decidir');
eq('sin acentos y en mayúsculas da lo mismo', detectarIntencion('QUIEN NOS DEBE'), 'cobranza');
eq('una sola palabra débil no alcanza («pendiente»)', detectarIntencion('pendiente'), null);
eq('un saludo va a la IA', detectarIntencion('hola'), null);
eq('«redacta un mensaje» va a la IA', detectarIntencion('redacta un mensaje para el cliente'), null);
eq('sugerencias para lo que no casa', sugerirIntenciones('pendiente'), ['sin_decidir']);
ok('siempre hay al menos una sugerencia', sugerirIntenciones('hola').length >= 1);

eq('comisiones', detectarIntencion('¿qué comisiones se pueden abonar?'), 'comisiones');
eq('cobranza', detectarIntencion('quién nos debe'), 'cobranza');
eq('cobranza por saldo', detectarIntencion('saldos pendientes'), 'cobranza');
eq('tarde', detectarIntencion('qué va tarde?'), 'tarde');
eq('semana', detectarIntencion('qué se instala esta semana'), 'semana');
eq('ventas', detectarIntencion('cuánto vendimos este mes'), 'ventas');
eq('material', detectarIntencion('qué material hay que comprar'), 'material');
eq('sin decidir', detectarIntencion('cotizaciones autorizadas sin decidir'), 'sin_decidir');
eq('hoy', detectarIntencion('cómo va el taller'), 'hoy');
eq('una pregunta con condicional va a la IA aunque nombre comisiones', detectarIntencion('si La Perla liquida mañana, ¿cuánto de comisión tocaría?'), null);
eq('una pregunta de consejo va a la IA', detectarIntencion('¿conviene comprar el acrílico ahora o esperar?'), null);
eq('una pregunta larga va a la IA', detectarIntencion('x'.repeat(141)), null);
eq('algo que no casa va a la IA', detectarIntencion('redacta un mensaje para el cliente de la óptica'), null);

console.log('\nEL RESUMEN DEL DÍA, en cifras');
eq('las cifras de la portada', (({ enTaller, tarde, semana, vencidas, porCobrar, conSaldo, comisionAbonable, sinDecidir, comprar, bajoMinimo }) =>
  ({ enTaller, tarde, semana, vencidas, porCobrar, conSaldo, comisionAbonable, sinDecidir, comprar, bajoMinimo }))(resumenDelDia(R)),
  { enTaller: 1, tarde: 1, semana: 1, vencidas: 0, porCobrar: 5800, conSaldo: 1, comisionAbonable: 500, sinDecidir: 1, comprar: 1, bajoMinimo: 1 });
eq('las instalaciones vencidas sin marcar entran al resumen', armarResumen({ hoy: '2026-09-14', veDinero: true, proyectos: P,
  instalaciones: [{ proyecto_id: 'p2', fecha: '2026-09-10', estado: 'confirmada' }, { proyecto_id: 'p1', fecha: '2026-09-01', estado: 'hecha' }] }).instalaciones_vencidas_sin_marcar.map(i => i.fecha), ['2026-09-10']);

console.log('\nEL MENSAJE DE SISTEMA');
const S = promptSistema(R);
ok('dice la fecha de hoy y el rol', S.includes('Hoy es 2026-09-14') && S.includes('rol de Dirección'));
ok('trae la regla de comisiones: 10 % fijo del subtotal', S.includes('10 % del subtotal') && S.includes('LIQUIDADO'));
ok('y ya no la del porcentaje pactado ni la de redondear a pesos', !S.includes('subtotal × porcentaje') && !S.includes('redondeada a pesos'));
ok('dice que es de solo lectura y dónde se cambia cada cosa', S.includes('solo lectura') && S.includes('Finanzas AL3D') && !S.includes('Notion'));
ok('y lleva los datos pegados como JSON', S.includes('"comisiones"') && S.endsWith('}'));
const SF = promptSistema(RF);
ok('para fabricación le prohíbe hablar de dinero', SF.includes('no ve importes') && !SF.includes('10 % del subtotal'));

console.log('\nLO QUE VUELVE SE PINTA COMO TEXTO');
eq('negritas y viñetas', mdLite('**Hola**\n- uno\n- dos'), '<p><b>Hola</b></p><ul><li>uno</li><li>dos</li></ul>');
eq('un <script> queda escapado', mdLite('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
eq('un enlace HTML no se vuelve enlace', mdLite('<a href="x">hola</a>'), '<p>&lt;a href=&quot;x&quot;&gt;hola&lt;/a&gt;</p>');
eq('lista numerada', mdLite('1. a\n2) b'), '<ul><li>a</li><li>b</li></ul>');
eq('un encabezado se vuelve negrita', mdLite('## Saldos'), '<p><b>Saldos</b></p>');
eq('un asterisco de multiplicar no abre cursiva', mdLite('10 * 3 = 30'), '<p>10 * 3 = 30</p>');
eq('cursiva con guion bajo', mdLite('_nota:_ ok'), '<p><i>nota:</i> ok</p>');
eq('un guion bajo a media palabra se queda', mdLite('el campo folio_global manda'), '<p>el campo folio_global manda</p>');
eq('vacío da vacío', mdLite(''), '');

console.log('\nLAS LLAVES DEL COTIZADOR, leídas con su misma receta');
const SALT = 'al3d·key·v1';
const kxor = s => { let o = ''; for (let i = 0; i < s.length; i++) o += String.fromCharCode(s.charCodeAt(i) ^ SALT.charCodeAt(i % SALT.length)); return o; };
const pack = k => Buffer.from(kxor(k), 'latin1').toString('base64');
globalThis.atob = globalThis.atob || (s => Buffer.from(s, 'base64').toString('latin1'));
const mem = new Map([
  ['al3d_kxs_gemini', pack(JSON.stringify(['AIza-uno', 'AIza-dos']))],
  ['ai_key_groq', 'gsk-plano'],
  ['ai_provider', 'groq'],
  ['ai_model_groq', 'llama-x'],
]);
const almacen = { getItem: k => (mem.has(k) ? mem.get(k) : null) };
eq('dos llaves de Gemini, ofuscadas', llavesDe('gemini', almacen), ['AIza-uno', 'AIza-dos']);
eq('la de Groq en texto plano (versión vieja)', llavesDe('groq', almacen), ['gsk-plano']);
eq('OpenRouter sin llave', llavesDe('openrouter', almacen), []);
const C = cadenaIA(almacen);
eq('la cadena empieza por el proveedor elegido, con su modelo, y sigue con los demás',
   C.map(c => c.prov + ':' + c.model + ':' + c.key), ['groq:llama-x:gsk-plano', 'gemini:gemini-2.5-flash:AIza-uno', 'gemini:gemini-2.5-flash:AIza-dos']);
eq('sin nada guardado la cadena está vacía', cadenaIA({ getItem: () => null }), []);

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
