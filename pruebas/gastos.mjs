/* LOS GASTOS: lo que sale del negocio, de Control a la pestaña «Gastos» de la hoja (puente-sheets-15).

   Lo que no se ve mirando la pantalla y por eso se prueba aquí:
     · las CUENTAS —el mes por el día en que se pagó, el anterior, cada categoría, sin anulados—,
       porque «gastamos $38 000 este mes» con un anulado sumado dentro se cree y no se revisa;
     · la LECTURA de una fila de la hoja, que también puede venir tecleada a mano: una categoría
       que no está en la lista cae en «Otros» y no desaparece, un monto con «$» se lee, una fecha
       «23/10/2026» también;
     · la BANDEJA: lo que espera no se pisa al bajar, lo que nunca subió no se barre, lo que se
       quedó sin operación se vuelve a encolar;
     · el APPS SCRIPT DE VERDAD (puente/hoja-apps-script.gs) contra la hoja de mentiras: crea la
       pestaña con sus cabeceras, no duplica un reintento, anula sin borrar, no deja entrar
       basura ni fórmulas, y solo dirección y pagos escriben y leen;
     · y DE PUNTA A PUNTA: el teléfono captura sin señal, el gasto no se pierde, sale cuando hay,
       baja, se anula, y lo que se borró en la hoja se barre; contra una hoja en la 14, espera
       apartado y vuelve solo.

   Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { idbConIndices } from './comun/base-de-mentiras.mjs';
import { hojaDeMentiras } from './comun/hoja-de-mentiras.mjs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);

const aqui = dirname(fileURLToPath(import.meta.url));

/* El mundo del teléfono, antes de importar nada que lo lea: una IndexedDB en memoria y un
   localStorage de Dirección con el puente puesto. El bombeo diferido (1.5 s) no se programa: cada
   paso de la prueba manda y baja a mano. */
const TOKEN = { direccion: 'd'.repeat(40), fabricacion: 'f'.repeat(40), pagos: 'p'.repeat(40) };
const URL_PUENTE = 'https://puente.test/exec';
const LS = { al3d_pf_rol: 'direccion', al3d_pf_disp: 'GAST', al3d_pf_nombre: 'Elías',
             al3d_pf_puente: JSON.stringify({ url: URL_PUENTE, token: TOKEN.direccion }) };
globalThis.window = globalThis;
globalThis.indexedDB = idbConIndices();
globalThis.IDBKeyRange = { only: v => ({ only: v }) };
globalThis.localStorage = { getItem: k => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: k => { delete LS[k]; } };
const setTimeoutReal = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => (Number(ms) >= 1000 ? 0 : setTimeoutReal(fn, ms, ...a));

const G = await import('../js/datos/gastos.js');
const { CUENTAS } = await import('../js/datos/puente.js');

/* ============================================================================
   1 · LO PURO
   ============================================================================ */
const HOY = '2026-10-23';
const g = (o = {}) => ({ id: 'gas-' + Math.random().toString(36).slice(2, 8), fecha: '2026-10-05', concepto: 'Lámina',
  categoria: 'Material', monto: 1000, cuenta: 'Elias BBVA', folio: '', registro_por: 'Elías · Dirección (GAST)',
  registrado_en: 1, anulado: false, anulo: '', anulado_en: null, ...o });

console.log('\nLA CATEGORÍA, LA FECHA, EL MONTO — lo que se teclea a mano en la hoja');
eq('la categoría exacta', G.categoriaDe('Transporte y gasolina'), 'Transporte y gasolina');
eq('sin acentos ni mayúsculas también', G.categoriaDe('  comisiones Y NOMINA '), 'Comisiones y nómina');
eq('una que no está en la lista cae en «Otros» (no desaparece)', G.categoriaDe('Comida del equipo'), 'Otros');
eq('vacía, «Otros»', G.categoriaDe(''), 'Otros');
eq('la fecha ISO pasa', G.fechaDeCelda('2026-10-05'), '2026-10-05');
eq('«5/10/2026» es el 5 de octubre (día/mes, como en México)', G.fechaDeCelda('5/10/2026'), '2026-10-05');
eq('una fecha imposible no se inventa', [G.fechaDeCelda('31/02/2026'), G.fechaDeCelda('2026-02-30')], ['', '']);
eq('el 29 de febrero, solo en bisiesto', [G.fechaDeCelda('29/02/2028'), G.fechaDeCelda('29/02/2026')], ['2028-02-29', '']);
eq('basura, vacía', G.fechaDeCelda('ayer'), '');
eq('el monto número', G.montoDe(1234.567), 1234.57);
eq('el monto tecleado con signo y comas', G.montoDe('$12,500.50'), 12500.5);
eq('negativo: cero (un gasto negativo es un ingreso disfrazado)', G.montoDe('-300'), 0);
eq('basura: cero', G.montoDe('mucho'), 0);
eq('«Sí», «x», TRUE son anulado; vacío no', ['Sí', 'x', 'TRUE', true, '', 'No', null].map(G.siNo), [true, true, true, true, false, false, false]);

console.log('\nUNA FILA DE LA HOJA, EN LA FORMA DE ESTE TELÉFONO');
eq('sin id no es un gasto', G.gastoDeHoja({ concepto: 'algo', monto: 3 }), null);
const fh = G.gastoDeHoja({ id: ' hoja-abc ', fecha: '23/10/2026', concepto: '  Gasolina  ', categoria: 'gasolina', monto: '$850',
  cuenta: 'Caja chica', folio: 'V-042', registro_por: '', registrado_en: null, anulado: '', anulo: 'nadie', anulado_en: 5 });
eq('se limpia: id, fecha, concepto, monto', [fh.id, fh.fecha, fh.concepto, fh.monto], ['hoja-abc', '2026-10-23', 'Gasolina', 850]);
eq('una categoría tecleada que no es de la lista suma en «Otros»', fh.categoria, 'Otros');
eq('la cuenta que no es de las cinco se queda como la escribieron', fh.cuenta, 'Caja chica');
eq('sin anular, «Anuló» y «Anulado el» no cuentan', [fh.anulado, fh.anulo, fh.anulado_en], [false, '', null]);
const fa = G.gastoDeHoja({ id: 'x', fecha: '2026-10-01', concepto: 'c', categoria: 'Otros', monto: 1, anulado: 'Sí', anulo: 'Pagos', anulado_en: 1790000000000 });
eq('anulado en la hoja, anulado aquí, con quién y cuándo', [fa.anulado, fa.anulo, fa.anulado_en], [true, 'Pagos', 1790000000000]);

console.log('\nVALIDAR — lo que no puede entrar, dicho junto al campo');
const bueno = { fecha: HOY, concepto: 'Lámina de acrílico', categoria: 'Material', monto: 1850, cuenta: '', folio: '' };
eq('lo bueno pasa', G.validar(bueno), null);
eq('sin fecha', G.validar({ ...bueno, fecha: '' }).campo, 'fecha');
eq('sin concepto', G.validar({ ...bueno, concepto: '   ' }).campo, 'concepto');
eq('una categoría que no es de la lista', G.validar({ ...bueno, categoria: 'Comida' }).campo, 'categoria');
eq('monto cero', G.validar({ ...bueno, monto: 0 }).campo, 'monto');
eq('monto de más de diez millones', G.validar({ ...bueno, monto: 10000001 }).campo, 'monto');
eq('una cuenta inventada', G.validar({ ...bueno, cuenta: 'Bitcoin' }).campo, 'cuenta');
eq('una de las cinco cuentas pasa', G.validar({ ...bueno, cuenta: CUENTAS[1] }), null);
eq('el monto tecleado como texto se lee', G.validar({ ...bueno, monto: '$1,850.00' }), null);

console.log('\nARMAR — el gasto nuevo, con lo que no es puro dado de fuera');
const ar = G.armar({ ...bueno, monto: '1,850.456', cuenta: 'Rul HSBC', folio: ' V-042 ' }, { id: 'gas-1', ahora: 1790000000000, sello: 'Elías · Dirección (GAST)' });
eq('id, sello y momento son los que se dieron', [ar.id, ar.registro_por, ar.registrado_en], ['gas-1', 'Elías · Dirección (GAST)', 1790000000000]);
eq('el monto a centavos y el folio limpio', [ar.monto, ar.folio], [1850.46, 'V-042']);
eq('nace sin anular y sin estar en la hoja', [ar.anulado, ar.en_hoja, ar.subido_en], [false, false, 0]);

console.log('\nLAS CUENTAS DEL MES — por el día en que se pagó, sin anulados');
const lista = [
  g({ fecha: '2026-10-01', monto: 1000, categoria: 'Material' }),
  g({ fecha: '2026-10-22', monto: 2500.25, categoria: 'Material' }),
  g({ fecha: '2026-10-10', monto: 800, categoria: 'Transporte y gasolina' }),
  g({ fecha: '2026-10-11', monto: 9999, categoria: 'Material', anulado: true }),          // anulado: no suma
  g({ fecha: '2026-09-30', monto: 4000, categoria: 'Renta y servicios' }),                 // el anterior
  g({ fecha: '2026-09-15', monto: 600, categoria: 'Transporte y gasolina' }),
  g({ fecha: '2026-08-31', monto: 7000, categoria: 'Material' }),                          // hace dos meses: no
  g({ fecha: '', monto: 300, categoria: 'Otros' }),                                        // sin fecha: en ningún mes
  g({ fecha: '2026-10-12', monto: 0.1, categoria: 'Publicidad' }),
  g({ fecha: '2026-10-12', monto: 0.2, categoria: 'Publicidad' }),
];
const r = G.resumen(lista, { hoy: HOY });
eq('lo gastado este mes, sin el anulado', [r.mes.total, r.mes.n, r.mes.etiqueta], [4300.55, 5, 'oct 2026']);
eq('el mes anterior', [r.anterior.total, r.anterior.n, r.anterior.etiqueta], [4600, 2, 'sep 2026']);
eq('la variación, redondeada', r.variacion, -7);
const cat = Object.fromEntries(r.porCategoria.map(x => [x.categoria, [x.total, x.n, x.totalAnt]]));
eq('Material: dos este mes (el anulado no), nada el anterior', cat['Material'], [3500.25, 2, 0]);
eq('Transporte: este y el anterior', cat['Transporte y gasolina'], [800, 1, 600]);
eq('Renta: solo el anterior', cat['Renta y servicios'], [0, 0, 4000]);
eq('0.1 + 0.2 son 0.30 justos, no 0.30000000000000004', cat['Publicidad'][0], 0.3);
eq('las ocho categorías, en el orden de la lista', r.porCategoria.map(x => x.categoria), G.CATEGORIAS);
eq('se cuenta el anulado de este mes y el que no tiene fecha', [r.anulados, r.sinFecha], [1, 1]);
eq('sin mes anterior, la variación no se inventa', G.resumen([g({ fecha: '2026-10-01' })], { hoy: HOY }).variacion, null);
eq('la utilidad aproximada: vendido menos gastado, a centavos', G.utilidad(10000.1, 4300.55), 5699.55);
eq('y puede ser negativa', G.utilidad(1000, 4300.55), -3300.55);
eq('enero mira a diciembre del año anterior', G.resumen([g({ fecha: '2025-12-31', monto: 50 })], { hoy: '2026-01-02' }).anterior.total, 50);

console.log('\nEL PERIODO — los mismos cuatro de la lista de ventas');
eq('este mes: los de octubre, del más reciente al más viejo (anulados incluidos, marcados)',
   G.delPeriodo(lista, 'mes', HOY, '').map(x => x.fecha), ['2026-10-22', '2026-10-12', '2026-10-12', '2026-10-11', '2026-10-10', '2026-10-01']);
eq('3 meses: desde agosto', G.delPeriodo(lista, '3m', HOY, '').length, 9);
eq('todo: también el que no tiene fecha', G.delPeriodo(lista, 'todo', HOY, '').length, 10);
eq('el buscador, sin acentos', G.delPeriodo([g({ concepto: 'Gasolina camión' }), g({ concepto: 'Acrílico' })], 'todo', HOY, 'camion').length, 1);

console.log('\nEL CSV — la regla de ventas: BOM, comillas y nada de fórmulas');
const c = G.csv([g({ id: 'gas-z', concepto: '=HYPERLINK("x")', monto: 12.5, anulado: true, anulo: 'Pagos' })]);
cierto('empieza con el BOM, para que Excel lo abra en UTF-8', c.charCodeAt(0) === 0xFEFF);
eq('las columnas', c.slice(1).split('\r\n')[0], G.COLUMNAS_CSV.join(','));
cierto('un concepto con «=» va con su apóstrofo', c.includes('"\'=HYPERLINK(""x"")"'));
cierto('el monto con dos decimales y el anulado marcado', /,12\.50,/.test(c) && /,Sí,Pagos,/.test(c));

console.log('\nLA BANDEJA — qué espera, qué se barre, qué se vuelve a encolar');
const ops = [
  { id: 'op-1', almacen: 'gastos', registro_id: 'gas-a', estado: 'pendiente' },
  { id: 'op-2', almacen: 'gastos', registro_id: 'gas-b', estado: 'rechazada', ultimo_error: 'La hoja no aceptó ese gasto: el monto…' },
  { id: 'op-3', almacen: 'gastos', registro_id: 'gas-b', estado: 'pendiente' },
  { id: 'op-4', almacen: 'proyectos', registro_id: 'gas-c', estado: 'pendiente' },
  { id: '_marcas', almacen: 'gastos', registro_id: 'gas-d' },
];
const b = G.idsEnLaBandeja(ops);
eq('solo los gastos, sin la marca de sync', [...b.keys()].sort(), ['gas-a', 'gas-b']);
eq('con dos operaciones, manda la peor: un rechazo se tiene que ver', [b.get('gas-b').estado, /monto/.test(b.get('gas-b').error)], ['rechazada', true]);
const locales = [
  { id: 'gas-a', en_hoja: true },                        // en la bandeja: no se barre
  { id: 'gas-e', en_hoja: true, subido_en: 100 },        // la hoja ya no lo trae: SE BARRE
  { id: 'gas-f' },                                       // nunca llegó: no se barre
  { id: 'gas-g', en_hoja: true, subido_en: 600 },        // subió después de la lectura: no se barre
  { id: 'gas-h', en_hoja: true },                        // sí vino
];
eq('se barre solo lo que ya estuvo en la hoja, ya no está y nadie espera mandar',
   G.porBarrer(locales, { ids: ['gas-h'], leidoEn: 500 }, b), ['gas-e']);
eq('lo que se queda sin operación ni hoja se vuelve a encolar', G.sueltos(locales, b).map(x => x.id), ['gas-f']);
eq('el estado de cada uno, para la pantalla', ['gas-a', 'gas-b', 'gas-h', 'gas-f'].map(id => G.estadoDeEnvio(locales.find(x => x.id === id) || { id }, b).estado),
   ['pendiente', 'rechazada', 'hoja', 'local']);

/* ============================================================================
   2 · EL VOCABULARIO DUPLICADO — el .gs no importa nada; se compara con la plataforma.
   ============================================================================ */
console.log('\nLAS DOS COPIAS DEL VOCABULARIO DICEN LO MISMO');
{
  const H = hojaDeMentiras();
  eq('las categorías, letra por letra y en orden', H.run('GASTO_CATEGORIAS').slice(), G.CATEGORIAS);
  eq('los topes', [H.run('GASTO_CONCEPTO_MAX'), H.run('GASTO_FOLIO_MAX'), H.run('GASTO_MONTO_MAX')], [G.CONCEPTO_MAX, G.FOLIO_MAX, G.MONTO_MAX]);
  eq('el lote de la bandeja cabe en lo que la hoja acepta', H.run('GASTO_OPS_MAX'),
     Number(/const MAX_LOTE = (\d+);/.exec(readFileSync(join(aqui, '..', 'js', 'datos', 'sync.js'), 'utf8'))[1]));
  const { VERSION_ESPERADA, VERSION_DE_LOS_GASTOS, numeroDeVersion } = await import('../js/datos/puente.js');
  eq('la hoja dice la versión que la plataforma espera', H.run('PUENTE_VERSION'), VERSION_ESPERADA);
  cierto('y esa versión ya trae los gastos', numeroDeVersion(VERSION_ESPERADA) >= VERSION_DE_LOS_GASTOS);
  cierto('cada categoría tiene su ícono', G.CATEGORIAS.every(k => /^i-/.test(G.ICONO_CATEGORIA[k] || '')));
}

/* ============================================================================
   3 · EL APPS SCRIPT DE VERDAD, contra la hoja de mentiras, por la puerta de siempre
   ============================================================================ */
const T0 = 1790000000000;
const gas = (id, o = {}) => ({ id, fecha: '2026-10-05', concepto: 'Lámina de acrílico 3 mm', categoria: 'Material', monto: 1850,
  cuenta: 'Elias BBVA', folio: 'V-042', registro_por: 'Elías · Dirección (GAST)', registrado_en: T0, anulado: false,
  anulo: '', anulado_en: null, ...o });
const op = (id, o = {}, extra = {}) => ({ id: 'op-' + id + (extra.sufijo || ''), tipo: extra.tipo || 'crear', almacen: 'gastos', registro_id: id,
  datos: gas(id, o), campos: extra.campos || null });
/* Las filas de la pestaña como objetos {cabecera: valor}, para leerlas como una persona. */
const filas = H => {
  const h = H.ss.getSheetByName('Gastos'); if (!h) return [];
  const cab = h._g[1];
  return h._g.slice(2).filter(rr => rr.some((v, i) => i > 0 && v !== ''))
    .map(rr => Object.fromEntries(cab.map((k, i) => [k, rr[i]]).filter(([k]) => k)));
};
const post = (H, rol, cuerpo) => H.doPost(JSON.stringify({ ...cuerpo, token: TOKEN[rol] }));

console.log('\nLA HOJA — la pestaña nace con su primer gasto, con sus cabeceras');
{
  const H = hojaDeMentiras({ tokens: { [TOKEN.direccion]: 'direccion', [TOKEN.pagos]: 'pagos', [TOKEN.fabricacion]: 'fabricacion' } });
  eq('antes del primer gasto la pestaña no existe', H.ss.getSheetByName('Gastos'), null);
  eq('y pedirlos no la crea: contesta la lista vacía', [post(H, 'direccion', { ruta: 'jalar_gastos' }).gastos, H.ss.getSheetByName('Gastos')], [[], null]);
  const r1 = post(H, 'direccion', { ruta: 'empujar_gastos', ops: [op('gas-1')] });
  eq('el primero la crea y lo escribe', [r1.ok, r1.resultados[0].ok, r1.resultados[0].creado], [true, true, true]);
  eq('con las columnas de la pestaña, en su orden', H.ss.getSheetByName('Gastos')._g[1].filter(Boolean),
     ['ID', 'Fecha', 'Concepto', 'Categoría', 'Monto', 'Cuenta', 'Folio del proyecto', 'Registró', 'Registrado el', 'Anulado', 'Anuló', 'Anulado el', 'Subió']);
  const f = filas(H)[0];
  eq('un renglón que se lee', [f['ID'], f['Concepto'], f['Categoría'], f['Monto'], f['Cuenta'], f['Folio del proyecto'], f['Anulado']],
     ['gas-1', 'Lámina de acrílico 3 mm', 'Material', 1850, 'Elias BBVA', 'V-042', '']);
  cierto('la fecha es una fecha de verdad (para las fórmulas de la hoja), y la captura también',
    Object.prototype.toString.call(f['Fecha']) === '[object Date]' && Object.prototype.toString.call(f['Registrado el']) === '[object Date]');
  eq('quién lo subió lo pone la hoja', f['Subió'], 'token de direccion');

  const r2 = post(H, 'direccion', { ruta: 'empujar_gastos', ops: [op('gas-1', {}, { sufijo: '-reintento' })] });
  eq('el reintento contesta «ya estaba» y no lo duplica', [r2.resultados[0].ya_estaba, filas(H).length], [true, 1]);

  const r3 = post(H, 'pagos', { ruta: 'empujar_gastos', ops: [op('gas-2', { concepto: 'Gasolina', categoria: 'Transporte y gasolina', monto: 600, cuenta: '' })] });
  eq('pagos también registra gastos (ve el dinero)', [r3.resultados[0].ok, filas(H).length], [true, 2]);

  const bajado = post(H, 'pagos', { ruta: 'jalar_gastos' });
  eq('y los baja, enteros y en la forma de la plataforma', [bajado.ok, bajado.completa, bajado.gastos.map(x => [x.id, x.fecha, x.monto, x.anulado])],
     [true, true, [['gas-1', '2026-10-05', 1850, false], ['gas-2', '2026-10-05', 600, false]]]);
  eq('con el sello de la captura en milisegundos, el mismo que mandó el teléfono', bajado.gastos[0].registrado_en, T0);

  /* Anular: el renglón se queda. */
  const r4 = post(H, 'direccion', { ruta: 'empujar_gastos', ops: [op('gas-1', { anulado: true, anulo: 'Elías · Dirección (GAST)', anulado_en: T0 + 5000 },
    { tipo: 'actualizar', campos: ['anulado', 'anulo', 'anulado_en'], sufijo: '-anula' })] });
  const fa1 = filas(H).find(x => x['ID'] === 'gas-1');
  eq('anular no borra: el renglón sigue, con «Anulado: Sí», quién y cuándo', [r4.resultados[0].anulado, filas(H).length, fa1['Anulado'], fa1['Anuló']],
     [true, 2, 'Sí', 'Elías · Dirección (GAST)']);
  eq('y el monto y el concepto no se tocan', [fa1['Monto'], fa1['Concepto']], [1850, 'Lámina de acrílico 3 mm']);
  const r5 = post(H, 'direccion', { ruta: 'empujar_gastos', ops: [op('gas-1', { monto: 1, anulado: false }, { tipo: 'actualizar', sufijo: '-otro' })] });
  eq('un gasto no se corrige por el puente: un cambio de monto o «des-anular» es «ya estaba» y no toca nada',
     [r5.resultados[0].ya_estaba, filas(H).find(x => x['ID'] === 'gas-1')['Monto'], filas(H).find(x => x['ID'] === 'gas-1')['Anulado']], [true, 1850, 'Sí']);
  const r6 = post(H, 'direccion', { ruta: 'empujar_gastos', ops: [op('gas-3', { anulado: true, anulo: 'Pagos', anulado_en: T0 + 1 }, { tipo: 'actualizar', sufijo: '-sin-alta' })] });
  eq('la anulación que llega antes que su alta (el alta se perdió) lo da de alta ya anulado', [r6.resultados[0].creado, filas(H).find(x => x['ID'] === 'gas-3')['Anulado']], [true, 'Sí']);
  eq('lo anulado baja anulado', post(H, 'direccion', { ruta: 'jalar_gastos' }).gastos.filter(x => x.anulado).map(x => x.id), ['gas-1', 'gas-3']);
}

console.log('\nLO QUE NO PUEDE ENTRAR, venga de quien venga');
{
  const H = hojaDeMentiras({ tokens: { [TOKEN.direccion]: 'direccion', [TOKEN.fabricacion]: 'fabricacion' } });
  const casos = [
    ['sin fecha', { fecha: '' }], ['una fecha que no es ISO', { fecha: '05/10/2026' }], ['sin concepto', { concepto: '  ' }],
    ['una categoría inventada', { categoria: 'Antojos' }], ['monto cero', { monto: 0 }], ['monto negativo', { monto: -50 }],
    ['monto de texto', { monto: 'mucho' }], ['de más de diez millones', { monto: 10000001 }], ['una cuenta inventada', { cuenta: 'Bitcoin' }],
    ['un concepto de 201 letras', { concepto: 'x'.repeat(201) }],
  ];
  for (const [que, o] of casos) {
    const x = post(H, 'direccion', { ruta: 'empujar_gastos', ops: [op('m-' + que.length, o)] }).resultados[0];
    eq(que + ': DATO_INVALIDO', x.codigo, 'DATO_INVALIDO');
  }
  eq('y nada de eso quedó escrito', filas(H).length, 0);
  post(H, 'direccion', { ruta: 'empujar_gastos', ops: [op('gas-f', { concepto: '=IMPORTXML("http://malo/","//a")', folio: '+52' })] });
  const f = filas(H)[0];
  eq('un concepto con «=» se guarda como texto, con su apóstrofo (no sale a internet)', [f['Concepto'].charAt(0), f['Folio del proyecto'].charAt(0)], ["'", "'"]);
  eq('y al teléfono le llega como lo escribió', post(H, 'direccion', { ruta: 'jalar_gastos' }).gastos[0].concepto, '=IMPORTXML("http://malo/","//a")');
  const fab = post(H, 'fabricacion', { ruta: 'empujar_gastos', ops: [op('gas-x')] });
  eq('fabricación no registra gastos: cada uno se rechaza con su razón (definitivo en el teléfono)', [fab.resultados[0].codigo, /dirección y pagos/.test(fab.resultados[0].mensaje)], ['ROL_SIN_PERMISO', true]);
  eq('ni los recibe', post(H, 'fabricacion', { ruta: 'jalar_gastos' }).codigo, 'ROL_SIN_PERMISO');
  eq('sin token, nada', H.doPost(JSON.stringify({ ruta: 'jalar_gastos' })).codigo, 'ROL_SIN_PERMISO');
  eq('las rutas son privadas (guion bajo): google.script.run no las alcanza', ['rutaEmpujarGastos', 'rutaJalarGastos'].map(n => H.run('typeof ' + n)), ['undefined', 'undefined']);
}

console.log('\nLO TECLEADO A MANO EN LA PESTAÑA — también cuenta');
{
  const H = hojaDeMentiras({ tokens: { [TOKEN.direccion]: 'direccion' } });
  H.run('gastosPestana_(true)');
  const h = H.ss.getSheetByName('Gastos');
  const col = n => h._g[1].indexOf(n);
  /* Alguien escribe un gasto en el renglón 2, sin ID, con la categoría a su manera. */
  h._g[2][col('Fecha')] = new (H.run('Date'))(2026, 9, 20);
  h._g[2][col('Concepto')] = 'Renta de octubre';
  h._g[2][col('Categoría')] = 'renta y servicios';
  h._g[2][col('Monto')] = 9500;
  /* Y un renglón con solo una nota, que no es un gasto. */
  h._g[3][col('Cuenta')] = 'Elias BBVA';
  const r1 = post(H, 'direccion', { ruta: 'jalar_gastos' });
  eq('el renglón tecleado baja, con un ID que le pone la hoja', [r1.gastos.length, /^hoja-[0-9a-z]+$/.test(r1.gastos[0].id), r1.gastos[0].fecha, r1.gastos[0].monto],
     [1, true, '2026-10-20', 9500]);
  eq('el ID se queda escrito en la hoja: la siguiente bajada trae el mismo', post(H, 'direccion', { ruta: 'jalar_gastos' }).gastos[0].id, r1.gastos[0].id);
  eq('y el teléfono lee la categoría a su manera como la de la lista', G.gastoDeHoja(r1.gastos[0]).categoria, 'Renta y servicios');
  const r2 = post(H, 'direccion', { ruta: 'empujar_gastos', ops: [{ id: 'op-anula', tipo: 'actualizar', almacen: 'gastos', registro_id: r1.gastos[0].id,
    datos: { ...G.gastoDeHoja(r1.gastos[0]), anulado: true, anulo: 'Elías', anulado_en: T0 }, campos: ['anulado', 'anulo', 'anulado_en'] }] });
  eq('y se puede anular desde la plataforma', [r2.resultados[0].anulado, filas(H)[0]['Anulado']], [true, 'Sí']);
  H.run('prepararHojaParaElPuente()');
  eq('«Preparar la hoja» no duplica la pestaña ni sus cabeceras', h._g[1].filter(x => x === 'ID').length, 1);
}

/* ============================================================================
   4 · DE PUNTA A PUNTA — el teléfono, la bandeja y el relevo contra ESE MISMO Apps Script
   ============================================================================ */
console.log('\nEL TELÉFONO — sin señal no se pierde, con señal sale, baja, se anula y se barre');
{
  const H = hojaDeMentiras({ tokens: { [TOKEN.direccion]: 'direccion' } });
  let sinSenal = false, vieja = false;
  const pedidas = [];
  globalThis.fetch = async (_url, init) => {
    if (sinSenal) throw new TypeError('Failed to fetch');
    const cuerpo = JSON.parse(init.body);
    pedidas.push(cuerpo.ruta);
    let res;
    if (vieja && cuerpo.ruta === 'salud') res = { ...H.doPost(init.body), version: 'puente-sheets-14' };
    else if (vieja && /_gastos$/.test(cuerpo.ruta)) res = { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Camino desconocido.' };
    else res = H.doPost(init.body);
    return { status: 200, json: async () => res };
  };
  const DB = await import('../js/datos/db.js');
  const S = await import('../js/datos/sync.js');
  const { crear } = await import('../js/datos/puente.js');
  eq('la base de mentira abre, con el almacén de gastos', [await DB.abrir(), DB.ALMACENES.includes('gastos'), DB.VERSION], [true, true, 4]);
  S.registrar(crear({ url: URL_PUENTE, token: TOKEN.direccion }));

  /* 1 · Sin señal. */
  sinSenal = true;
  const r1 = await G.registrar({ fecha: '2026-10-05', concepto: 'Lámina de acrílico', categoria: 'Material', monto: '1,850', cuenta: 'Elias BBVA', folio: 'V-042' });
  eq('sin señal el gasto se guarda en este teléfono', [r1.ok, !!(await DB.obtener('gastos', r1.valor.id))], [true, true]);
  const ba = await S.bombear();
  eq('el bombeo sin señal no lo manda, y lo deja en la bandeja', [ba.valor.subidas, (await G.bandeja()).get(r1.valor.id).estado], [0, 'pendiente']);
  eq('la pantalla lo dice: por mandar', G.estadoDeEnvio(await DB.obtener('gastos', r1.valor.id), await G.bandeja()).estado, 'pendiente');
  const bit = await DB.listar('bitacora');
  cierto('y queda en la bitácora, con quién', bit.some(x => x.entidad === 'gasto' && x.accion === 'registro' && /1,850/.test(x.titulo)));

  /* 2 · Vuelve la señal. */
  sinSenal = false;
  const bb = await S.bombear();
  eq('con señal sale en un viaje y sale de la bandeja', [bb.valor.subidas, (await S.pendientes()).length, pedidas.filter(x => x === 'empujar_gastos').length], [1, 0, 1]);
  eq('y está en la hoja', filas(H).map(x => [x['ID'], x['Monto'], x['Cuenta']]), [[r1.valor.id, 1850, 'Elias BBVA']]);
  const marcado = await DB.obtener('gastos', r1.valor.id);
  cierto('y aquí queda marcado como en la hoja, con cuándo subió', marcado.en_hoja === true && marcado.subido_en > 0);

  /* 3 · Otro teléfono (pagos) captura uno; éste lo baja con la hoja. */
  post(H, 'direccion', { ruta: 'empujar_gastos', ops: [op('gas-otro', { concepto: 'Gasolina', categoria: 'Transporte y gasolina', monto: 700, fecha: '2026-10-06' })] });
  const j1 = await S.jalar();
  eq('la bajada trae el gasto del otro teléfono', [j1.ok, !!(await DB.obtener('gastos', 'gas-otro'))], [true, true]);
  eq('sin duplicar el propio', (await DB.listar('gastos')).length, 2);
  eq('el del otro, marcado como de la hoja', (await DB.obtener('gastos', 'gas-otro')).en_hoja, true);

  /* 4 · Anular, sin señal: no lo pisa la bajada mientras espera. */
  sinSenal = true;
  const ra = await G.anular('gas-otro');
  eq('anular sin señal lo anula aquí', [ra.ok, (await DB.obtener('gastos', 'gas-otro')).anulado], [true, true]);
  sinSenal = false;
  /* Una bajada que llega ANTES de mandar la anulación (la del arranque, la de cada 30 s). */
  await S.jalar();
  eq('una bajada antes de mandarla no le deshace la anulación a quien la acaba de hacer', (await DB.obtener('gastos', 'gas-otro')).anulado, true);
  await S.bombear();
  eq('al mandarla, la hoja lo tiene anulado', filas(H).find(x => x['ID'] === 'gas-otro')['Anulado'], 'Sí');
  await S.jalar();
  eq('y al bajar, sigue anulado y no suma', [(await DB.obtener('gastos', 'gas-otro')).anulado,
     G.resumen(await DB.listar('gastos'), { hoy: '2026-10-23' }).mes.total], [true, 1850]);

  /* 5 · Alguien borra a mano en la hoja el renglón del otro: se barre aquí. Lo que no ha subido, no. */
  const h = H.ss.getSheetByName('Gastos');
  const fila = h._g.findIndex(rr => rr.includes('gas-otro'));
  h._g.splice(fila, 1); h._g.push(new Array(h._g[1].length).fill(''));
  sinSenal = true;
  const rLocal = await G.registrar({ fecha: '2026-10-07', concepto: 'Brocas', categoria: 'Herramienta', monto: 320 });
  sinSenal = false;
  /* Se baja ANTES de mandar el nuevo: la hoja no lo trae, pero no se barre (está en la bandeja). */
  globalThis.fetch = (f => async (url, init) => {
    const c = JSON.parse(init.body);
    if (c.ruta === 'empujar_gastos') throw new TypeError('Failed to fetch');   // que no salga todavía
    return f(url, init);
  })(globalThis.fetch);
  await S.jalar();
  eq('lo borrado en la hoja se barre de aquí', await DB.obtener('gastos', 'gas-otro'), null);
  eq('lo capturado aquí que todavía no sube NO se barre', !!(await DB.obtener('gastos', rLocal.valor.id)), true);
  eq('y lo que sigue en la hoja se queda', !!(await DB.obtener('gastos', r1.valor.id)), true);

  /* 6 · Una bandeja que se perdió (un respaldo restaurado): el gasto suelto se vuelve a encolar. */
  for (const o of await DB.listar('pendientes')) if (o.almacen === 'gastos') await DB.borrar('pendientes', o.id);
  eq('sin operación, el gasto de aquí estaría «por mandar» para siempre', G.estadoDeEnvio(await DB.obtener('gastos', rLocal.valor.id), await G.bandeja()).estado, 'local');
  eq('reencolarSueltos lo devuelve a la bandeja (uno, el que no está en la hoja)', await G.reencolarSueltos(), 1);
  eq('y nada más', await G.reencolarSueltos(), 0);
}

console.log('\nCONTRA UNA HOJA EN LA 14 — espera apartado, sin perderse, y vuelve solo');
{
  /* Un mundo nuevo: la base vacía y otra hoja, que todavía corre la 14. Los módulos son los mismos
     (un import con otra dirección crearía otra copia de `gastos.js`, pero con la misma `db.js`). */
  const DB = await import('../js/datos/db.js');
  const S = await import('../js/datos/sync.js');
  const P = await import('../js/datos/puente.js');
  const G2 = G;
  for (const a of DB.ALMACENES) await DB.vaciar(a);
  const H = hojaDeMentiras({ tokens: { [TOKEN.direccion]: 'direccion' } });
  let vieja = true;
  const pedidas = [];
  globalThis.fetch = async (_url, init) => {
    const c = JSON.parse(init.body);
    pedidas.push(c.ruta);
    let res;
    if (vieja && c.ruta === 'salud') res = { ...H.doPost(init.body), version: 'puente-sheets-14' };
    else if (vieja && /_gastos$/.test(c.ruta)) res = { ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'Camino desconocido.' };
    else res = H.doPost(init.body);
    return { status: 200, json: async () => res };
  };
  S.registrar(P.crear({ url: URL_PUENTE, token: TOKEN.direccion }));
  eq('recién enchufado, todavía no se sabe si la hoja tiene «Gastos» (Control no avisa nada)', S.sabeLlevar('gastos'), null);
  /* Lo demás funciona igual con la 14: la bajada de ventas no truena por los gastos. */
  const j0 = await S.jalar();
  eq('contra la 14, la bajada sale bien y no trae gastos', [j0.ok, (await DB.listar('gastos')).length], [true, 0]);
  eq('y ya se sabe: falta actualizar el puente (lo que Control dice en Gastos)', S.sabeLlevar('gastos'), false);
  eq('  el almacén, en cambio, sí tiene a dónde', S.sabeLlevar('movimientos'), true);
  const r = await G2.registrar({ fecha: '2026-10-05', concepto: 'Volantes', categoria: 'Publicidad', monto: 450 });
  const b1 = await S.bombear();
  const apartadas = await S.sinDestino();
  eq('contra la 14, el gasto se aparta (no se rechaza, no se pierde)', [b1.valor.sin_destino, apartadas.length, b1.valor.rechazadas], [1, 1, 0]);
  cierto('con la razón: la hoja todavía no tiene la pestaña «Gastos»', /«Gastos»/.test(apartadas[0].ultimo_error) && /puente-sheets-15/.test(apartadas[0].ultimo_error));
  eq('y la pantalla dice «espera la pestaña»', G2.estadoDeEnvio(await DB.obtener('gastos', r.valor.id), await G2.bandeja()).estado, 'sin_destino');
  eq('no se pidió /empujar_gastos: la versión ya lo decía', pedidas.filter(x => x === 'empujar_gastos').length, 0);
  eq('y reencolarSueltos no lo duplica: ya tiene su operación, apartada', await G2.reencolarSueltos(), 0);
  /* Se actualiza la hoja; la app se vuelve a abrir (relevo nuevo). */
  vieja = false;
  S.registrar(P.crear({ url: URL_PUENTE, token: TOKEN.direccion }));
  const b2 = await S.bombear();
  eq('con la hoja en la 15, lo apartado vuelve solo y sube', [b2.valor.subidas, (await S.sinDestino()).length, filas(H).length], [1, 0, 1]);
  eq('y la pestaña deja de avisar', S.sabeLlevar('gastos'), true);
  S.registrar(null);
  eq('sin puente, no se sabe nada', S.sabeLlevar('gastos'), null);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
