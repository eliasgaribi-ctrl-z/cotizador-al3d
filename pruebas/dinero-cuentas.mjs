/* EL DINERO POR CUENTA Y EL DISPONIBLE — js/datos/dinero-cuentas.js y la pestaña «Cuentas» de Control (0027, decidido por Elías el
 * 2026-10-25; docs/DINERO-Y-FACTURAS.md).
 *
 * Lo que no se ve mirando la pantalla y por eso se prueba aquí:
 *   · la ARITMÉTICA: lo que entró a cada cuenta (el anticipo y la liquidación que la base registró, cada uno en el periodo de SU fecha),
 *     lo que salió (los gastos no anulados de esa cuenta) y lo DISPONIBLE (lo de las cuentas de AL3D menos sus gastos); con la lista
 *     por omisión (Elias BBVA) y con la que Dirección elija; los gastos de otras cuentas o en efectivo no restan;
 *   · que es lo MISMO que Control llama «ya cobrado» (vendido menos saldo), contado depósito por depósito;
 *   · los periodos, los mismos de la lista de Ventas y de la de Gastos;
 *   · lo que NO cuenta: una venta cancelada, una que solo está en este teléfono (su anticipo es el pactado), una liquidación sin fecha
 *     fuera de «Todo»; y que la pantalla lo pueda decir;
 *   · la lista de cuentas disponibles: la que se recuerda en el teléfono, la de por omisión, y el plan para cambiarla (Dirección);
 *   · que las listas son las mismas que las de la plataforma y las de la base (0027);
 *   · y que con la HOJA mandando, Control es el de siempre: ni pestañas nuevas, ni el disponible en el Resumen, ni un módulo nuevo.
 *
 * Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');
const mapa = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

const DC = await import('../js/datos/dinero-cuentas.js');
const V = await import('../js/datos/ventas.js');
const G = await import('../js/datos/gastos.js');
const { CUENTAS: CUENTAS_PUENTE } = await import('../js/datos/puente.js');
const PS = await import('../js/datos/pagos-supa.js');

const HOY = '2026-10-25';

/* ============================================================================ */
console.log('\nLAS LISTAS: las mismas en todos lados');
{
  eq('las cinco cuentas son las de puente.js y las de pagos-supa.js', [DC.CUENTAS, DC.CUENTAS], [CUENTAS_PUENTE, PS.CUENTAS]);
  const sql = sinComentarios(leer('supabase/migrations/0027_dinero_y_facturas.sql'));
  const fiscales = /function interno\.cuentas_fiscales\(\)[\s\S]*?select array\[([^\]]*)\]/.exec(sql);
  eq('las fiscales son las de interno.cuentas_fiscales() (0027)', fiscales ? fiscales[1].split(',').map(x => x.trim().replace(/'/g, '')) : null, DC.CUENTAS_FISCALES);
  const check = /cuentas_disponibles <@ array\[([^\]]*)\]/.exec(sql);
  eq('las cinco del CHECK de ajustes_dinero', check ? check[1].split(',').map(x => x.trim().replace(/'/g, '')) : null, DC.CUENTAS);
  eq('la de por omisión es la de la tabla (Elias BBVA)', /cuentas_disponibles text\[\] not null default array\['Elias BBVA'\]/.test(sql) && DC.DISPONIBLES_POR_OMISION, ['Elias BBVA']);
  eq('de quién es cada cuenta fiscal (como las nombra Elías)', DC.DE_QUIEN, { 'Constru BNT': 'ConstruImagen', 'Moni MPago': 'Mónica', 'Tatis BNT': 'Tanit' });
}

/* ============================================================================ */
console.log('\nLA CUENTA COMO SE ESCRIBE');
{
  eq('la de la lista, tal cual', DC.cuentaCanonica('Elias BBVA'), 'Elias BBVA');
  eq('tecleada a mano en la hoja: minúsculas, espacios de más', [DC.cuentaCanonica('elias bbva'), DC.cuentaCanonica('  Constru   BNT '), DC.cuentaCanonica('TATIS BNT')],
    ['Elias BBVA', 'Constru BNT', 'Tatis BNT']);
  eq('lo que no es ninguna: vacío', [DC.cuentaCanonica(''), DC.cuentaCanonica(null), DC.cuentaCanonica('Efectivo'), DC.cuentaCanonica('BBVA')], ['', '', '', '']);
  eq('fiscales: Constru, Moni y Tatis; no Elias ni Rul', DC.CUENTAS.map(DC.esFiscal), [false, true, true, false, true]);
  eq('las disponibles, limpias y en su orden', DC.disponiblesDe(['Rul HSBC', 'elias bbva', 'Rul HSBC', 'Efectivo']), ['Elias BBVA', 'Rul HSBC']);
  eq('sin ninguna válida: la de por omisión', [DC.disponiblesDe([]), DC.disponiblesDe(null), DC.disponiblesDe(['x'])], [['Elias BBVA'], ['Elias BBVA'], ['Elias BBVA']]);
}

/* ============================================================================ */
console.log('\nLOS PERIODOS: los de la lista de Ventas y la de Gastos');
{
  eq('este mes, 3 meses, 12 meses, todo', ['mes', '3m', '12m', 'todo'].map(p => DC.desdeDelPeriodo(p, HOY)), ['2026-10-01', '2026-08-01', '2025-11-01', null]);
  /* La misma frontera que Gastos.delPeriodo: un gasto del primer día del periodo entra, el del día anterior no. */
  const gs = [{ id: 'a', fecha: '2026-08-01', monto: 1 }, { id: 'b', fecha: '2026-07-31', monto: 1 }];
  eq('la misma frontera que Gastos.delPeriodo (3 meses)', G.delPeriodo(gs, '3m', HOY, '').map(g => g.id), ['a']);
  const M = DC.dineroPorCuenta([], gs.map(g => ({ ...g, cuenta: 'Elias BBVA' })), { periodo: '3m', hoy: HOY });
  eq('y aquí, igual', M.disponible.gastos, 1);
}

/* ============================================================================ */
console.log('\nLOS DEPÓSITOS DE UNA VENTA');
{
  const v = (o = {}) => ({ id: 'v1', etapa: 'en_diseno', fecha_ganado: '2026-10-03', cuenta: 'Elias BBVA', anti_pactado: 1000,
    deposito: { anticipo: 1000, liquidacion: 500, cuenta: 'Elias BBVA', fecha_anticipo: '2026-10-03', fecha_liquidacion: '2026-10-20' }, ...o });
  eq('el anticipo y la liquidación, cada uno con su fecha', DC.depositosDe(v()),
    [{ que: 'anticipo', monto: 1000, fecha: '2026-10-03', cuenta: 'Elias BBVA' }, { que: 'liquidacion', monto: 500, fecha: '2026-10-20', cuenta: 'Elias BBVA' }]);
  eq('un anticipo sin fecha cae en la de la venta; una liquidación sin fecha se queda sin fecha',
    DC.depositosDe(v({ deposito: { anticipo: 1000, liquidacion: 500, cuenta: 'Elias BBVA', fecha_anticipo: '', fecha_liquidacion: '' } })).map(d => d.fecha), ['2026-10-03', '']);
  eq('en cero no es depósito', DC.depositosDe(v({ deposito: { anticipo: 0, liquidacion: 0, cuenta: 'Elias BBVA' } })), []);
  eq('cancelada («No se dio»): nada', DC.depositosDe(v({ etapa: 'cancelado' })), []);
  eq('solo en este teléfono (sin depósito de la base): nada, su anticipo es el pactado', DC.depositosDe(v({ deposito: undefined })), []);
  eq('la cuenta del depósito manda; sin ella, la de la venta', DC.depositosDe(v({ deposito: { anticipo: 1, liquidacion: 0, cuenta: null } }))[0].cuenta, 'Elias BBVA');
}

/* ============================================================================ */
console.log('\nEL DINERO POR CUENTA Y LO DISPONIBLE');
/* Ventas como las deja Ventas.unificar con la base mandando: filas del libro (ventas_hoja) armadas como lo hace el relevo. */
const fila = o => ({ id: 'hoja:' + o.folio, folio_hoja: o.folio, folio_cotizacion: '', nombre: 'Cliente ' + o.folio, estatus: o.estatus || 'COBRANDO',
  cuenta: o.cuenta === undefined ? 'Elias BBVA' : o.cuenta, iva: o.cuenta !== 'Elias BBVA', fecha_anticipo: o.fa || '', fecha_liquidacion: o.fl || '',
  sub: o.sub || 1000, neto: o.neto || 1000, anticipo: o.anticipo || 0, liquidacion: o.liq || 0,
  pago_pendiente: (o.neto || 1000) - (o.anticipo || 0) - (o.liq || 0), etapa: o.etapa || null });
const libro = [
  fila({ folio: 'V-201', cuenta: 'Elias BBVA', fa: '2026-10-02', anticipo: 3000, fl: '2026-10-20', liq: 2000, neto: 5000 }),        // todo en octubre
  fila({ folio: 'V-202', cuenta: 'Elias BBVA', fa: '2026-09-10', anticipo: 1000, fl: '2026-10-05', liq: 1500, neto: 4000 }),        // anticipo en sep, liq en oct
  fila({ folio: 'V-203', cuenta: 'Constru BNT', fa: '2026-10-07', anticipo: 8000, neto: 11600 }),                                   // ConstruImagen: no es de AL3D
  fila({ folio: 'V-204', cuenta: 'Rul HSBC', fa: '2026-10-08', anticipo: 700, neto: 700 }),
  fila({ folio: 'V-205', cuenta: 'Elias BBVA', fa: '2026-10-09', anticipo: 999, neto: 999, etapa: 'cancelado' }),                   // cancelada: no cuenta
  fila({ folio: 'V-206', cuenta: 'Elias BBVA', fa: '2026-06-01', anticipo: 400, liq: 600, neto: 1000 }),                            // liquidación SIN fecha
  fila({ folio: 'V-207', cuenta: null, fa: '2026-10-11', anticipo: 250, neto: 1000 }),                                              // sin cuenta
  fila({ folio: 'V-208', cuenta: 'Tatis BNT', fa: '2025-01-15', anticipo: 5000, fl: '2025-02-01', liq: 5000, neto: 11600 }),        // de hace mucho
];
const local = { id: 'proy-solo-aqui', dispositivo: 'K7QM', folio_global: 'COT-0009@K7QM', folio_local: 'COT-0009', nombre: 'Solo aquí', etapa: 'ganado',
  fecha_ganado: '2026-10-12', precio_auth: 2000, neto: 2000, anti_pactado: 1000, cuenta: 'Elias BBVA' };
const ventas = V.unificar([local], libro).ventas;
const gasto = (id, fecha, monto, cuenta, o = {}) => ({ id, fecha, concepto: 'g', categoria: 'Material', monto, cuenta, anulado: false, ...o });
const gastos = [
  gasto('g1', '2026-10-03', 1200, 'Elias BBVA'),
  gasto('g2', '2026-10-04', 300, 'elias bbva'),                      // tecleado a mano en la hoja: es la suya
  gasto('g3', '2026-10-05', 5000, 'Constru BNT'),                    // salió de ConstruImagen: no resta del disponible
  gasto('g4', '2026-10-06', 80, ''),                                 // efectivo
  gasto('g5', '2026-10-07', 999, 'Elias BBVA', { anulado: true }),   // anulado: no suma
  gasto('g6', '2026-09-30', 100, 'Elias BBVA'),                      // septiembre
  gasto('g7', '2026-10-08', 50, 'Rul HSBC'),
];
{
  const M = DC.dineroPorCuenta(ventas, gastos, { periodo: 'mes', hoy: HOY });
  const c = k => M.cuentas.find(x => x.cuenta === k);
  eq('Elias BBVA en octubre: anticipos 3000, liquidaciones 2000 + 1500, de 2 ventas; salieron 1200 + 300; quedan 5000',
    [c('Elias BBVA').anticipos, c('Elias BBVA').liquidaciones, c('Elias BBVA').ingresos, c('Elias BBVA').nVentas, c('Elias BBVA').gastos, c('Elias BBVA').nGastos, c('Elias BBVA').neto],
    [3000, 3500, 6500, 2, 1500, 2, 5000]);
  eq('Constru BNT: entró 8000 y salieron 5000, pero NO es dinero disponible (fiscal, de ConstruImagen)',
    [c('Constru BNT').ingresos, c('Constru BNT').gastos, c('Constru BNT').disponible, c('Constru BNT').fiscal, c('Constru BNT').deQuien], [8000, 5000, false, true, 'ConstruImagen']);
  eq('DISPONIBLE (solo Elias BBVA): entró 6500, salió 1500 → 5000', [M.disponible.cuentas, M.disponible.ingresos, M.disponible.gastos, M.disponible.saldo, M.disponible.nGastos],
    [['Elias BBVA'], 6500, 1500, 5000, 2]);
  eq('las otras cuentas: 8000 + 700 de 2 ventas', [M.otras.ingresos, M.otras.nVentas], [8700, 2]);
  eq('sin cuenta: 250 de 1 venta (no suma a ninguna)', M.sinCuenta, { ingresos: 250, nVentas: 1 });
  eq('en efectivo: 80 de 1 gasto (no resta)', M.efectivo, { gastos: 80, nGastos: 1 });
  eq('la liquidación sin fecha (V-206): fuera del mes, contada aparte', M.liqSinFecha, { n: 1, monto: 600 });
  eq('la venta que solo está en este teléfono (anticipo pactado) no cuenta: se dice', M.porLlegar, 1);
  eq('la cancelada no suma en ninguna cuenta (V-205: 999)', M.cuentas.reduce((s, x) => s + x.ingresos, 0) + M.sinCuenta.ingresos, 6500 + 8700 + 250);
}
{
  const M = DC.dineroPorCuenta(ventas, gastos, { periodo: 'mes', hoy: HOY, disponibles: ['Elias BBVA', 'Rul HSBC'] });
  eq('con Rul HSBC también disponible (lo decide Dirección): 6500 + 700 − (1500 + 50) = 5650', [M.disponible.ingresos, M.disponible.gastos, M.disponible.saldo], [7200, 1550, 5650]);
  eq('y Rul deja de estar en las otras', M.otras.ingresos, 8000);
}
{
  const T = DC.dineroPorCuenta(ventas, gastos, { periodo: 'todo', hoy: HOY });
  const c = k => T.cuentas.find(x => x.cuenta === k);
  eq('TODO: Elias BBVA suma todo lo depositado (3000+2000, 1000+1500, 400+600) y sus gastos de siempre (1200+300+100)',
    [c('Elias BBVA').ingresos, c('Elias BBVA').gastos, T.disponible.saldo, T.liqSinFecha.n], [8500, 1600, 6900, 0]);
  eq('TODO: Tatis BNT, de hace mucho, aparece', c('Tatis BNT').ingresos, 10000);
  const tres = DC.dineroPorCuenta(ventas, gastos, { periodo: '3m', hoy: HOY });
  eq('3 MESES: el anticipo de septiembre de V-202 (1000) y el gasto de septiembre (100) ya entran', [tres.disponible.ingresos, tres.disponible.gastos], [7500, 1600]);
}
{
  /* Lo MISMO que Control llama «ya cobrado» (vendido menos saldo) de las ventas vivas, cuando el saldo es la fórmula de la base. */
  const vivas = ventas.filter(p => p.etapa !== 'cancelado' && p.deposito);
  const cobradoControl = vivas.reduce((s, p) => s + Math.max(0, V.vendidoDe(p) - V.saldoDe(p)), 0);
  const T = DC.dineroPorCuenta(ventas, [], { periodo: 'todo', hoy: HOY });
  const entro = T.cuentas.reduce((s, x) => s + x.ingresos, 0) + T.sinCuenta.ingresos;
  eq('lo que entró en «Todo» = lo que Control llama ya cobrado (vendido − saldo), venta por venta sumado', entro, cobradoControl);
}
{
  /* Una venta del libro atada a un proyecto de este teléfono: el depósito es el de la fila, no el anticipo pactado del proyecto. */
  const p = { id: 'proy-1', dispositivo: 'K7QM', folio_global: 'COT-0001@K7QM', folio_local: 'COT-0001', nombre: 'Atada', etapa: 'armado',
    fecha_ganado: '2026-10-01', precio_auth: 5000, neto: 5000, anti_pactado: 4000, cuenta: 'Elias BBVA' };
  const f = { ...fila({ folio: 'V-300', cuenta: 'Elias BBVA', fa: '2026-10-02', anticipo: 2500, neto: 5000 }), folio_cotizacion: 'COT-0001@K7QM' };
  const u = V.unificar([p], [f]).ventas;
  eq('atada: un solo renglón, con el depósito de la FILA', [u.length, u[0].deposito.anticipo, u[0].deposito.fecha_anticipo], [1, 2500, '2026-10-02']);
  eq('y el disponible cuenta 2500, no los 4000 pactados', DC.dineroPorCuenta(u, [], { periodo: 'mes', hoy: HOY }).disponible.ingresos, 2500);
  const vacia = V.unificar([p], [{ ...f, anticipo: null }]).ventas;
  eq('si la fila tiene el anticipo VACÍO, no se cuela el pactado del proyecto', [vacia[0].anti_pactado, DC.dineroPorCuenta(vacia, [], { periodo: 'mes', hoy: HOY }).disponible.ingresos], [4000, 0]);
}
{
  eq('sin nada: todo en cero, y no truena', DC.dineroPorCuenta(null, null, {}).disponible, { cuentas: ['Elias BBVA'], ingresos: 0, gastos: 0, saldo: 0, nGastos: 0 });
  eq('un periodo que no existe es «Este mes»', DC.dineroPorCuenta([], [], { periodo: 'semana', hoy: HOY }).periodo, 'mes');
  const neg = DC.dineroPorCuenta([], [gasto('x', '2026-10-01', 900, 'Elias BBVA')], { periodo: 'mes', hoy: HOY });
  eq('más gastos que ingresos: el disponible queda en negativo (y la pantalla lo pinta en rojo)', neg.disponible.saldo, -900);
  eq('centavos sin basura de flotantes', DC.dineroPorCuenta([], [gasto('a', '2026-10-01', 0.1, 'Elias BBVA'), gasto('b', '2026-10-01', 0.2, 'Elias BBVA')], { hoy: HOY }).disponible.gastos, 0.3);
}

/* ============================================================================ */
console.log('\nLA LISTA DE CUENTAS DISPONIBLES: la recordada y el cambio de Dirección');
{
  const ls = mapa();
  eq('sin nada guardado: la de por omisión, y lo dice', DC.ajusteGuardado(ls), { cuentas: ['Elias BBVA'], por: '', en: '', leida: false });
  DC.guardarAjuste(ls, { cuentas: ['Rul HSBC', 'Elias BBVA'], por: 'dir@al3d.test', en: '2026-10-25T18:00:00Z' });
  eq('lo que se guardó vuelve limpio', DC.ajusteGuardado(ls), { cuentas: ['Elias BBVA', 'Rul HSBC'], por: 'dir@al3d.test', en: '2026-10-25T18:00:00Z', leida: true });
  ls.setItem(DC.CLAVE_AJUSTE, 'basura{');
  eq('basura: la de por omisión', DC.ajusteGuardado(ls).cuentas, ['Elias BBVA']);
  eq('sin almacenamiento: la de por omisión, y guardar no truena', [DC.ajusteGuardado(null).cuentas, DC.guardarAjuste(null, { cuentas: ['Rul HSBC'] })], [['Elias BBVA'], undefined]);
  const p = DC.planAjuste(['Elias BBVA', 'Constru BNT'], ['Elias BBVA'], 'op-1');
  eq('el plan: la función, sus argumentos (en el orden de siempre) y el texto', [p.ok, p.rpc, p.args, p.peligro, /Se suma Constru BNT \(ConstruImagen\)/.test(p.texto)],
    [true, 'cuentas_disponibles_guardar', { p_op: { op_id: 'op-1', cuentas: ['Elias BBVA', 'Constru BNT'] } }, false, true]);
  eq('ninguna marcada: no sale', DC.planAjuste([], ['Elias BBVA'], 'x').ok, false);
  eq('lo mismo que hay: no sale (sin cambio)', DC.planAjuste(['Elias BBVA'], ['Elias BBVA'], 'x').sinCambio, true);
  eq('quitar Elias BBVA se pregunta con el botón de peligro', DC.planAjuste(['Rul HSBC'], ['Elias BBVA'], 'x').peligro, true);
}

/* ============================================================================ */
console.log('\nCONTROL: con la base mandando, «Cuentas» y «Facturas»; con la hoja, lo de siempre');
{
  const ctl = leer('js/mod/control.js'), sinC = sinComentarios(ctl);
  cierto('Control no importa de forma estática nada nuevo (ni supa.js, ni cuentas.js, ni facturas.js, ni dinero-cuentas.js)',
    !/^import[^;]*(supa|cuentas|facturas|dinero-cuentas)\.js/m.test(ctl) && !/nucleo\/supa\.js/.test(sinC));
  cierto('la aritmética se carga SOLO con la base mandando y a quien ve el dinero',
    /if \(enBase\(\) && Prefs\.veDinero\(\)\) \{\n    try \{\n      _DC = _DC \|\| await import\('\.\.\/datos\/dinero-cuentas\.js'\);/.test(sinC) &&
    (sinC.match(/import\('\.\.\/datos\/dinero-cuentas\.js'\)/g) || []).length === 1);
  cierto('la pestaña de facturas se carga solo dentro de cablearFacturas, y esa solo con TAB === \'facturas\'',
    (sinC.match(/import\('\.\/facturas\.js'\)/g) || []).length === 1 && /if \(TAB === 'facturas'\) cablearFacturas\(\);/.test(sinC));
  cierto('lo de las cuentas que va a la base se pide a cuentas.js solo con la base mandando y a quien ve el dinero',
    /if \(_ajusteLeido \|\| !enBase\(\) \|\| !Prefs\.veDinero\(\) \|\| !D \|\| !D\.ajuste\) return;/.test(sinC));
  cierto('el disponible del Resumen solo existe si existe la pestaña Cuentas (base mandando, Dirección o Pagos)',
    /function htmlDisponibleDelMes\(\) \{\n  if \(!D\.ajuste \|\| !_DC \|\| !tabs\(\)\.includes\('cuentas'\)\) return '';/.test(sinC));
  cierto('el formulario del gasto, con la hoja mandando, es el desplegable de siempre (ni «disponible» ni la nota)',
    /if \(!disp\) return CUENTAS\.map\(c => '<option>' \+ esc\(c\) \+ '<\/option>'\)\.join\(''\);/.test(sinC) && /return disp \? '<p class="pf-nota ct-gas-nota">/.test(sinC));
  cierto('y con la base mandando cada cuenta lleva su NOMBRE como valor (lo que se guarda en el gasto y lo que resta)',
    /'<option value="' \+ esc\(c\) \+ '">' \+ esc\(c\) \+ \(disp\.includes\(c\) \? ' · disponible' : ''\)/.test(sinC));
  cierto('la capa pura no toca el DOM ni el almacenamiento por su cuenta', !/document|window\.|localStorage|sessionStorage|fetch\(/.test(sinComentarios(leer('js/datos/dinero-cuentas.js'))));
  const sw = leer('sw.js');
  cierto('los cuatro módulos nuevos van en la caché del service worker', ['js/datos/dinero-cuentas.js', 'js/datos/facturas.js', 'js/mod/cuentas.js', 'js/mod/facturas.js']
    .every(f => sw.includes("'./" + f + "'")));
  cierto('cuentas.js pide la lista con la sesión de la base y la recuerda (solo nombres de cuentas)', /from\('ajustes_dinero'\)/.test(leer('js/mod/cuentas.js')) &&
    /DC\.guardarAjuste\(almacen\(\), a\)/.test(leer('js/mod/cuentas.js')));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
