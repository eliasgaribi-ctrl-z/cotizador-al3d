/* PAGOS EN SUPABASE — js/datos/pagos-supa.js y la pestaña «Registrar (Supabase)» de Control
 * (js/mod/pagos-supa.js). Segunda entrega de la pieza de Pagos, apagada.
 *
 * Lo que se vigila, con un DOBLE de supabase-js (no toca Supabase ni Google):
 *   · que cada formulario llame a SU función de la base con los argumentos exactos
 *     (registrar_cobro, corregir_venta, registrar_abono_comision, vista_previa_reparto,
 *     repartir_abono_fifo, corregir_abono);
 *   · los montos: pesos con dos decimales a lo más, los topes de la base (0007 y 0012), sin NaN,
 *     Infinity ni «1e9», y nada de redondear en silencio;
 *   · el op_id: nace una vez por formulario, se REUSA al reintentar tras un envío sin respuesta,
 *     cambia solo después de un asiento confirmado, y cambiar los datos de un envío incierto se
 *     detecta;
 *   · qué error es seguro («no se registró nada») y cuál incierto (puede que sí haya llegado);
 *   · que Fabricación no ve los formularios ni recibe una sola cifra (ni se le piden);
 *   · y que APAGADO no cambia nada: Control tiene sus cinco pestañas de siempre (Gastos, la quinta,
 *     desde octubre de 2026) y nadie carga
 *     estos módulos.
 *
 * Y el paso 5 de «la base manda» (docs/BASE-MANDA.md), con la base mandando:
 *   · la pestaña es «Cobros y abonos» para Dirección y Pagos (la decide el modo de la empresa), no dice
 *     «regístralo también en la hoja» ni ofrece apagar Supabase;
 *   · la VENTA SIN COTIZACIÓN: `alta_venta` con sus argumentos exactos, su id nacido del op_id (el reintento es
 *     la misma venta), sus validaciones (las de la base), sus listas iguales a las de la plataforma y a las de la
 *     base, y NUNCA con la hoja mandando (dos contadores de V-###);
 *   · lo raro se pregunta con el botón de peligro (un cobro de más, una venta ya liquidada, un reparto), y el
 *     reparto que se confirma es el que se vio (se recalcula justo antes de preguntar);
 *   · Realtime: un cambio en la base relee los saldos de la pestaña (con la hoja mandando, no).
 * El mismo dinero contra la base de verdad (PGlite): supabase/tests/pagos/pantalla.mjs.
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
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const espera = ms => new Promise(r => setTimeout(r, ms));

/* ----- El entorno: almacenamiento de mentiras y un doble de supabase-js ----- */
const mapa = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() };
};
globalThis.localStorage = mapa();
globalThis.sessionStorage = mapa();
globalThis.document = { activeElement: null };
/* La ventana como blanco de eventos: el aviso de Realtime (`al3d-base-cambio`) y el del modo (`al3d-modo`). */
{
  const et = new EventTarget();
  globalThis.addEventListener = et.addEventListener.bind(et);
  globalThis.removeEventListener = et.removeEventListener.bind(et);
  globalThis.dispatchEvent = et.dispatchEvent.bind(et);
}

const llamadas = [];
let ESC = {};                                 // el escenario de ahora: el doble le pregunta qué contestar
const doble = {
  auth: { getSession: async () => ({ data: { session: ESC.sesion ? { access_token: 'falso' } : null } }) },
  rpc: async (n, a) => { llamadas.push(['rpc', n, a]); return ESC.rpc ? ESC.rpc(n, a) : { data: { ok: true }, error: null }; },
  from: t => ({ select: async cols => { llamadas.push(['from', t, cols]); return ESC.from ? ESC.from(t, cols) : { data: [], error: null }; } }),
};
let opcionesDelCliente = null;
globalThis.supabase = { createClient: (url, llave, o) => { opcionesDelCliente = o; return doble; } };

const PS = await import('../js/datos/pagos-supa.js');
const Prefs = await import('../js/datos/prefs.js');
const Manda = await import('../js/datos/quien-manda.js');

/* ============================================================================ */
console.log('\nMONTOS: PESOS CON DOS DECIMALES Y LOS TOPES DE LA BASE');
{
  const v = (t, o) => { const r = PS.leerMonto(t, o); return r.ok ? r.valor : 'no'; };
  eq('«1500» son 1500', v('1500'), 1500);
  eq('«$1,234.5» son 1234.50', v('$1,234.5'), 1234.5);
  eq('«1 234.50» con espacio de miles', v('1 234.50'), 1234.5);
  eq('«0.10» son diez centavos', v('0.10'), 0.1);
  eq('«.5» no es un monto escrito (falta el entero)', v('.5'), 'no');
  eq('tres decimales se rechazan, no se redondean', v('12.345'), 'no');
  eq('comas mal puestas se rechazan («1,23»)', v('1,23'), 'no');
  eq('letras no', v('mil'), 'no');
  eq('NaN no', v('NaN'), 'no');
  eq('Infinity no', v('Infinity'), 'no');
  eq('notación científica no («1e9»)', v('1e9'), 'no');
  eq('vacío no', v(''), 'no');
  eq('cero no', v('0'), 'no');
  eq('cero sí cuando es un valor absoluto (liquidación corregida)', v('0', { cero: true }), 0);
  eq('negativo no en un cobro', v('-500'), 'no');
  eq('negativo sí en la corrección de un abono', v('-500.25', { negativo: true, tope: PS.TOPE_ABONO }), -500.25);
  eq('cobro: 999,999,999.99 entra', v('999999999.99'), 999999999.99);
  eq('cobro: mil millones ya no (0012: monto < 1e9)', v('1000000000'), 'no');
  eq('abono: 9,999,999.99 entra', v('9999999.99', { tope: PS.TOPE_ABONO }), 9999999.99);
  eq('abono: diez millones ya no (0007)', v('10000000', { tope: PS.TOPE_ABONO }), 'no');
  eq('corrección: -10,000,000 tampoco', v('-10000000', { negativo: true, tope: PS.TOPE_ABONO }), 'no');
  eq('el monto se cuenta en centavos enteros', PS.leerMonto('0.29').centavos, 29);
  eq('y viaja como el decimal exacto (0.1 + 0.2 no se cuela)', JSON.stringify(PS.leerMonto('0.3').valor), '0.3');
  eq('el mensaje de tres decimales lo dice', PS.leerMonto('1.234').mensaje, 'Los montos llevan a lo más dos decimales (los centavos).');
  eq('pesos con dos decimales siempre', [PS.pesosDe(1234.5), PS.pesosDe(0), PS.pesosDe(-500), PS.pesosDe('7')], ['$1,234.50', '$0.00', '-$500.00', '$7.00']);
  eq('fecha vacía es hoy (la pone la base)', PS.leerFecha('', '2026-10-16'), { ok: true, valor: null });
  eq('fecha futura no', PS.leerFecha('2026-10-17', '2026-10-16').ok, false);
  eq('fecha que no existe no', PS.leerFecha('2026-02-30', '2026-10-16').ok, false);
  eq('nota de más de 400 no (abonos.nota <= 500 con el sufijo del reparto)', PS.leerNota('x'.repeat(401)).ok, false);
  eq('la corrección pide su nota', PS.leerNota('  ', { obligatoria: true }).ok, false);
}

/* ============================================================================ */
console.log('\nCADA FORMULARIO LLAMA A SU FUNCIÓN, CON SUS ARGUMENTOS');
const V = { id: 'proy-hoja-V-214', folio: 'V-214', nombre: 'Letras Farmacia', estatus: 'COBRANDO', neto: 11600, anticipo: 5800,
  liquidacion: 0, saldo: 5800, comision: 1000, abonado: 200, restante: 800 };
{
  const o = { opId: 'pf-op-1', hoy: '2026-10-16', venta: V, area: 'pagos' };
  let p = PS.plan('cobro', { proyecto: V.id, monto: '5,800', fecha: '2026-10-15', liquidar: true }, o);
  eq('cobro → registrar_cobro', [p.rpc, p.args], ['registrar_cobro',
    { p_proyecto: 'proy-hoja-V-214', p_monto: 5800, p_fecha: '2026-10-15', p_liquidar: true, p_op_id: 'pf-op-1' }]);
  cierto('y la confirmación dice el monto y que queda LIQUIDADA', /\$5,800\.00/.test(p.titulo) && /LIQUIDADA/.test(p.texto));
  p = PS.plan('cobro', { proyecto: V.id, monto: '1000', liquidar: false }, o);
  eq('un cobro parcial manda p_liquidar=false de forma explícita (la base por omisión liquida)', [p.args.p_liquidar, p.args.p_fecha], [false, null]);
  eq('LIQUIDADO se sugiere solo si el saldo queda en ceros', [PS.sugerirLiquidar(V, '1000'), PS.sugerirLiquidar(V, '5800'), PS.sugerirLiquidar(V, '6000')], [false, true, true]);
  p = PS.plan('cobro', { modo: 'anticipo', proyecto: V.id, monto: '6000' }, o);
  eq('anticipo → corregir_venta con el valor ABSOLUTO (idempotente)', [p.rpc, p.args], ['corregir_venta', { p_proyecto: V.id, p_cambios: { anticipo: 6000 } }]);
  cierto('y la confirmación dice de cuánto a cuánto', /\$5,800\.00 a \$6,000\.00/.test(p.texto));
  p = PS.plan('abono', { proyecto: V.id, monto: '300.50', nota: ' depósito BBVA ' }, o);
  eq('abono → registrar_abono_comision', [p.rpc, p.args], ['registrar_abono_comision',
    { p_proyecto: V.id, p_monto: 300.5, p_fecha: null, p_nota: 'depósito BBVA', p_op_id: 'pf-op-1' }]);
  const vp = { monto: 1500, filas: [{ folio: 'V-100', nombre: 'A', pend: 1000, abono: 1000, queda: 0 }, { folio: 'V-120', nombre: 'B', pend: 900, abono: 500, queda: 400 }], sobrante: 0 };
  p = PS.plan('reparto', { monto: '1500' }, { ...o, vistaPrevia: vp });
  eq('reparto → repartir_abono_fifo', [p.rpc, p.args], ['repartir_abono_fifo', { p_monto: 1500, p_fecha: null, p_nota: '', p_op_id: 'pf-op-1' }]);
  cierto('y la confirmación nombra la primera comisión (la más antigua)', /V-100 \$1,000\.00/.test(p.texto));
  eq('sin vista previa del MISMO monto no se reparte', PS.plan('reparto', { monto: '1600' }, { ...o, vistaPrevia: vp }).errores, { monto: 'Primero toca «Ver el reparto» con este monto.' });
  eq('ni sin vista previa', PS.plan('reparto', { monto: '1500' }, o).ok, false);
  p = PS.plan('correccion', { que: 'abono', proyecto: V.id, monto: '-200', nota: 'se capturó doble' }, { ...o, area: 'direccion' });
  eq('corrección de abono → corregir_abono (un renglón NUEVO)', [p.rpc, p.args], ['corregir_abono',
    { p_proyecto: V.id, p_monto: -200, p_nota: 'se capturó doble', p_fecha: null, p_op_id: 'pf-op-1' }]);
  eq('Pagos no corrige abonos (la base también lo niega)', PS.plan('correccion', { que: 'abono', proyecto: V.id, monto: '-200', nota: 'x' }, o).errores.que,
    'Corregir un abono de comisión solo lo puede hacer Dirección.');
  eq('la corrección sin nota no sale', Object.keys(PS.plan('correccion', { que: 'abono', proyecto: V.id, monto: '-200' }, { ...o, area: 'direccion' }).errores), ['nota']);
  p = PS.plan('correccion', { que: 'liquidacion', proyecto: V.id, monto: '0' }, o);
  eq('corrección de liquidación → corregir_venta con el total (cero se admite)', [p.rpc, p.args], ['corregir_venta', { p_proyecto: V.id, p_cambios: { liquidacion: 0 } }]);
  const e = PS.plan('cobro', { monto: 'abc', fecha: '2099-01-01' }, o);
  eq('sin venta, monto y fecha malos: los tres errores, el primero es la venta', [Object.keys(e.errores).sort(), e.primero], [['fecha', 'monto', 'proyecto'], 'proyecto']);
}

/* ============================================================================ */
console.log('\nLAS LLAMADAS AL DOBLE DE SUPABASE-JS');
{
  llamadas.length = 0;
  ESC = { rpc: (n, a) => ({ data: { ok: true, liquidacion: 5800, saldo: 0, estatus: 'LIQUIDADO', en_ceros: true }, error: null }) };
  const p = PS.plan('cobro', { proyecto: V.id, monto: '5800', liquidar: true }, { opId: 'pf-x', venta: V });
  const r = await PS.enviar(doble, p);
  eq('enviar() llama una vez a rpc con la función y los argumentos del plan', llamadas, [['rpc', 'registrar_cobro', p.args]]);
  eq('y lee la respuesta', [r.ok, r.data.saldo], [true, 0]);
  eq('el resumen lo dice en pesos', PS.resumen(p, r.data, V), 'Cobro registrado en V-214. Liquidación $5,800.00, saldo $0.00 (en ceros); estatus LIQUIDADO.');

  llamadas.length = 0;
  ESC = { rpc: (n, a) => ({ data: { ok: true, filas: [{ folio: 'V-100', pend: 50, abono: 50, queda: 0 }], sobrante: 10, total_pendiente: 50, cuantas: 1 }, error: null }) };
  const vp = await PS.vistaPrevia(doble, '60');
  eq('vista previa → vista_previa_reparto con el monto, sin op_id (no escribe)', llamadas, [['rpc', 'vista_previa_reparto', { p_monto: 60 }]]);
  eq('y recuerda con qué monto se calculó', vp.data.monto, 60);
  llamadas.length = 0;
  eq('una vista previa con monto malo no llama a nada', [(await PS.vistaPrevia(doble, '12.345')).ok, llamadas.length], [false, 0]);

  llamadas.length = 0;
  ESC = { from: (t, c) => ({ data: [
    { proyecto_id: 'p1', a_folio: 'V-9', b_proyecto: 'Nueve', k_saldo: '100.5', t_restante: 0, h_neto: 100.5, i_anticipo: 0, j_liquidacion: 0 },
    { proyecto_id: 'p2', a_folio: 'V-120', b_proyecto: 'Ciento veinte', k_saldo: 0, t_restante: 12 },
    { proyecto_id: null, a_folio: 'V-1' },
  ], error: null }) };
  const lv = await PS.leerVentas(doble);
  eq('las ventas salen de ventas_calculadas (la RLS no le da filas a Fabricación)', llamadas[0].slice(0, 2), ['from', 'ventas_calculadas']);
  eq('ordenadas por el NÚMERO del folio, la más nueva arriba, sin filas rotas', lv.ventas.map(v => v.folio), ['V-120', 'V-9']);
  eq('con importes como números', lv.ventas[1].saldo, 100.5);
}

/* ============================================================================ */
console.log('\nEL OP_ID: UNO POR FORMULARIO, EL MISMO AL REINTENTAR');
{
  let b = PS.borradorNuevo('abono');
  const op1 = b.opId;
  cierto('nace con op_id', /^pf-[0-9a-f-]{20,}$/.test(op1));
  cierto('cada formulario nuevo trae otro', PS.borradorNuevo('abono').opId !== op1);
  const plan = () => PS.plan('abono', b.campos, { opId: b.opId, venta: V });
  b.campos = { proyecto: V.id, monto: '300' };

  llamadas.length = 0;
  let n = 0;
  ESC = { rpc: () => (++n === 1 ? { data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 } : { data: { ok: true, importe: 300, abonado: 500, restante: 500 }, error: null }) };
  let p = plan();
  let r = await PS.enviar(doble, p);
  eq('sin señal es INCIERTO (puede que sí haya llegado)', [r.ok, r.incierto], [false, true]);
  cierto('y el mensaje no dice «no se registró»', !/No se registró/.test(r.mensaje) && /Reintentar/.test(r.mensaje));
  b = PS.despuesDeEnviar(b, p, r);
  eq('el op_id se conserva', b.opId, op1);
  eq('con los mismos datos se reintenta sin preguntar', PS.opIdPara(b, plan()).cambio, false);
  p = plan();
  r = await PS.enviar(doble, p);
  eq('el reintento lleva el MISMO op_id que el primer envío', [llamadas[0][2].p_op_id, llamadas[1][2].p_op_id], [op1, op1]);
  b = PS.despuesDeEnviar(b, p, r);
  cierto('confirmado: el formulario siguiente trae op_id nuevo y campos vacíos', b.opId !== op1 && !Object.keys(b.campos).length);

  b = PS.borradorNuevo('abono'); b.campos = { proyecto: V.id, monto: '300' };
  ESC = { rpc: () => ({ data: null, error: { message: 'Gateway Timeout', code: '' }, status: 504 }) };
  p = plan(); r = await PS.enviar(doble, p); b = PS.despuesDeEnviar(b, p, r);
  const op2 = b.opId;
  b.campos.monto = '350';
  eq('cambiar el monto de un envío incierto se detecta (hay que preguntar)', PS.opIdPara(b, plan()).cambio, true);
  PS.renovar(b);
  cierto('y si se confirma, nace otro op_id', b.opId !== op2 && b.incierto === null);

  b = PS.borradorNuevo('cobro'); b.campos = { proyecto: V.id, monto: '-5' };
  const op3 = b.opId;
  ESC = { rpc: () => ({ data: { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Un cobro es un importe mayor a cero; para corregir usa la corrección de la venta.', definitivo: true }, error: null }) };
  p = { rpc: 'registrar_cobro', args: { p_proyecto: V.id, p_monto: -5, p_op_id: op3 } };
  r = await PS.enviar(doble, p); b = PS.despuesDeEnviar(b, p, r);
  eq('un error SEGURO de la base no deja nada incierto ni cambia el op_id', [r.incierto, b.incierto, b.opId], [false, null, op3]);
  cierto('y dice que no se registró nada', /No se registró nada\.$/.test(r.mensaje));
  cierto('el formulario guarda op_id y campos en un borrador de la pestaña (sessionStorage)', PS.CLAVE_BORRADOR === 'al3d_pf_pagos_borrador' &&
    /sessionStorage/.test(leer('js/mod/pagos-supa.js')) && !/localStorage/.test(sinComentarios(leer('js/mod/pagos-supa.js'))));
}

/* ============================================================================ */
console.log('\nERRORES DE LA BASE EN PALABRAS');
{
  const c = (res, rpc = 'registrar_cobro') => PS.clasificar(rpc, res, null);
  const r1 = c({ data: { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'No tienes permiso para esto.' } });
  eq('ROL_SIN_PERMISO: seguro y dice de quién es', [r1.incierto, r1.mensaje], [false, 'Tu área no puede registrar esto: es de Pagos y Dirección. No se registró nada.']);
  eq('en corregir_abono dice que es de Dirección', c({ data: { ok: false, codigo: 'ROL_SIN_PERMISO' } }, 'corregir_abono').mensaje,
    'Corregir un abono de comisión solo lo puede hacer Dirección. No se registró nada.');
  eq('NO_ENCONTRADO', c({ data: { ok: false, codigo: 'NO_ENCONTRADO' } }).mensaje.startsWith('Esa venta no está en la base'), true);
  eq('DATO_INVALIDO trae la frase de la base', c({ data: { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Escribe un importe mayor a cero.' } }).mensaje,
    'Escribe un importe mayor a cero. No se registró nada.');
  eq('CLIENTE_VIEJO pide actualizar', /actualízala/.test(c({ data: { ok: false, codigo: 'CLIENTE_VIEJO' } }).mensaje), true);
  eq('sesión vencida (PGRST301 / JWT): seguro', [c({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } }).codigo, c({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } }).incierto], ['SIN_SESION', false]);
  eq('función que no existe (PGRST202): seguro, falta la migración', c({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }).codigo, 'SIN_FUNCION');
  eq('una restricción de la tabla (23514): seguro', c({ data: null, error: { code: '23514', message: 'violates check constraint' } }).codigo, 'FUERA_DE_LIMITE');
  eq('un 500 sin código: incierto', c({ data: null, error: { message: 'Internal' }, status: 500 }).incierto, true);
  eq('una excepción del fetch: incierto', PS.clasificar('registrar_cobro', null, new TypeError('Failed to fetch')).incierto, true);
  eq('corregir_venta que no escribió nada es un error', c({ data: { ok: true, escritos: [], rechazadas: [{ nombre: 'anticipo', por: 'el valor de anticipo no es válido' }] } }, 'corregir_venta').mensaje,
    'La base no aceptó el cambio: el valor de anticipo no es válido. No se registró nada.');
  eq('y la que sí escribió es un éxito', c({ data: { ok: true, escritos: ['anticipo'], rechazadas: [], venta: { anticipo: 6000 } } }, 'corregir_venta').ok, true);
  eq('un reparto repetido dice que no se sumó otra vez', /no se sumó otra vez/.test(PS.resumen({ rpc: 'repartir_abono_fifo', args: {} },
    { ok: true, repetida: true, pago_id: 'P-012', repartido: [{}], repartido_total: 60 })), true);
}

/* ============================================================================ */
console.log('\nLO RARO SE PREGUNTA CON EL BOTÓN DE PELIGRO (paso 5)');
{
  const o = { opId: 'pf-op-9', hoy: '2026-10-25', venta: V, area: 'pagos' };
  let p = PS.plan('cobro', { proyecto: V.id, monto: '5800' }, o);
  eq('un cobro que deja el saldo en ceros: botón normal y sin «OJO»', [!!p.peligro, /OJO/.test(p.texto)], [false, false]);
  p = PS.plan('cobro', { proyecto: V.id, monto: '6000' }, o);
  eq('un cobro de más (la liquidación es ACUMULATIVA): peligro, y dice por cuánto', [p.peligro, /más que el saldo \(\$5,800\.00\): quedaría cobrada de más por \$200\.00/.test(p.texto)], [true, true]);
  eq('pero se manda igual (la base lo acepta: «Cobrado de más»)', [p.rpc, p.args.p_monto], ['registrar_cobro', 6000]);
  p = PS.plan('cobro', { proyecto: V.id, monto: '10' }, { ...o, venta: { ...V, saldo: -50, estatus: 'LIQUIDADO' } });
  eq('sobre una venta ya cobrada de más: todo el cobro es de más, y dice que ya está LIQUIDADA', [p.peligro, /de más por \$10\.00/.test(p.texto), /ya está LIQUIDADA/.test(p.texto)], [true, true, true]);
  const vp = { monto: 100, filas: [{ folio: 'V-1', abono: 100 }], sobrante: 0 };
  p = PS.plan('reparto', { monto: '100' }, { ...o, vistaPrevia: vp });
  eq('un reparto siempre: peligro, y dice que no se deshace', [p.peligro, /NO se pueden deshacer/.test(p.texto)], [true, true]);
}

console.log('\nEL REPARTO QUE SE CONFIRMA ES EL QUE SE VIO');
{
  const a = { monto: 1500, filas: [{ folio: 'V-100', abono: 1000 }, { folio: 'V-120', abono: 500 }], sobrante: 0 };
  cierto('la misma vista previa es el mismo reparto', PS.mismoReparto(a, JSON.parse(JSON.stringify(a))));
  cierto('importes como texto o número dan igual', PS.mismoReparto(a, { monto: '1500.00', filas: [{ folio: 'V-100', abono: '1000' }, { folio: 'V-120', abono: 500.0 }], sobrante: '0' }));
  cierto('otro teléfono abonó a V-100: ya no es el mismo', !PS.mismoReparto(a, { monto: 1500, filas: [{ folio: 'V-120', abono: 900 }], sobrante: 600 }));
  cierto('el mismo abono a otras ventas tampoco', !PS.mismoReparto(a, { monto: 1500, filas: [{ folio: 'V-100', abono: 500 }, { folio: 'V-120', abono: 1000 }], sobrante: 0 }));
  cierto('otro sobrante tampoco', !PS.mismoReparto(a, { ...a, sobrante: 1 }));
  cierto('sin una de las dos, no', !PS.mismoReparto(null, a) && !PS.mismoReparto(a, null));
}

/* ============================================================================ */
console.log('\nLA VENTA SIN COTIZACIÓN (alta_venta, paso 5)');
const ALTA = { nombre: ' Ana - Tacos El Güero ', cuenta: 'Moni MPago', estatus: 'FABRICACION', tipos: ['Rotulacion de vinil', 'Letras 3D con iluminacion'],
  subtotal: '4,000', anticipo: '1000.50', fecha: '2026-10-24', cita: '2026-11-03', tel: ' 33 1234-5678 ', entrega: 'instalacion',
  dir: ' Av. Vallarta 100, Guadalajara ', maps: 'https://maps.app.goo.gl/abc' };
const oAlta = (x = {}) => ({ opId: 'pf-0f1e2d3c-aaaa-bbbb-cccc-123456789abc', hoy: '2026-10-25', area: 'pagos', baseManda: true, ahora: 1792900000000, ...x });
{
  let p = PS.plan('venta', ALTA, oAlta());
  eq('va a alta_venta con la operación exacta', [p.rpc, p.args], ['alta_venta', { p_op: {
    id: 'alta-0f1e2d3c-aaaa-bbbb-cccc-123456789abc', nombre: 'Ana - Tacos El Güero', cuenta: 'Moni MPago', estatus: 'FABRICACION',
    tipo_trabajo: ['Letras 3D con iluminacion', 'Rotulacion de vinil'], subtotal: 4000, anticipo: 1000.5, tel: '33 1234-5678', entrega: 'instalacion',
    dir_texto: 'Av. Vallarta 100, Guadalajara', maps_url: 'https://maps.app.goo.gl/abc', fecha_anticipo: '2026-10-24', fecha_instalacion: '2026-11-03',
    sellos: { tel: 1792900000000, entrega: 1792900000000, dir_texto: 1792900000000, ubicacion: 1792900000000 } } }]);
  cierto('el id cabe en la regla de la base (^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$)', /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$/.test(p.args.p_op.id));
  cierto('y el de un op_id sin randomUUID (hexadecimal) también', /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$/.test(PS.idDeAlta('pf-' + 'ab'.repeat(16))));
  cierto('el id es del FORMULARIO: el reintento (mismo op_id) es la MISMA venta', PS.plan('venta', ALTA, oAlta({ ahora: 1792900099999 })).args.p_op.id === p.args.p_op.id);
  eq('los sellos (la hora de la captura) no cuentan como «cambiaste los datos»', PS.huella(PS.plan('venta', ALTA, oAlta({ ahora: 1 }))), PS.huella(p));
  cierto('pero cambiar el subtotal sí', PS.huella(PS.plan('venta', { ...ALTA, subtotal: '4001' }, oAlta())) !== PS.huella(p));
  cierto('la pregunta dice cuenta, IVA, neto (subtotal × 1.16), anticipo y que la base da el V-###',
    /Moni MPago \(con IVA\) · subtotal \$4,000\.00 → neto \$4,640\.00 · anticipo \$1,000\.50 del 2026-10-24/.test(p.texto) && /siguiente V-###/.test(p.texto));
  eq('con Elias BBVA, sin IVA y sin neto aparte', /Elias BBVA \(sin IVA\) · subtotal \$4,000\.00 · anticipo/.test(PS.plan('venta', { ...ALTA, cuenta: 'Elias BBVA' }, oAlta()).texto), true);
  eq('el neto se redondea como la base (round(x × 1.16, 2)): 0.03 → 0.03, 1234.56 → 1432.09',
    [/neto \$0\.03 /.test(PS.plan('venta', { ...ALTA, subtotal: '0.03', anticipo: '' }, oAlta()).texto), /neto \$1,432\.09 /.test(PS.plan('venta', { ...ALTA, subtotal: '1234.56' }, oAlta()).texto)], [true, true]);
  p = PS.plan('venta', { ...ALTA, anticipo: '9000' }, oAlta());
  eq('un anticipo mayor que el neto: se pregunta con peligro', [p.peligro, /el anticipo es más que el neto/.test(p.texto)], [true, true]);
  p = PS.plan('venta', { ...ALTA, anticipo: '', fecha: '', cita: '', tipos: [], estatus: '' }, oAlta());
  eq('lo opcional vacío: anticipo 0, sin fecha (la pone la base: hoy), sin cita, sin tipos, estatus FABRICACION',
    [p.args.p_op.anticipo, 'fecha_anticipo' in p.args.p_op, 'fecha_instalacion' in p.args.p_op, p.args.p_op.tipo_trabajo, p.args.p_op.estatus], [0, false, false, [], 'FABRICACION']);
  p = PS.plan('venta', { ...ALTA, entrega: 'recoleccion' }, oAlta());
  eq('recolección: sin dirección ni liga (lo recoge en el taller)', [p.args.p_op.dir_texto, p.args.p_op.maps_url, p.args.p_op.sellos.dir_texto, p.args.p_op.sellos.ubicacion], ['', '', undefined, undefined]);
  p = PS.plan('venta', { ...ALTA, entrega: 'paqueteria' }, oAlta());
  eq('paquetería: el destino sí, la liga no', [p.args.p_op.dir_texto, p.args.p_op.maps_url], ['Av. Vallarta 100, Guadalajara', '']);
  eq('sin `ahora`, sin sellos (la base no inventa uno)', 'sellos' in PS.plan('venta', ALTA, oAlta({ ahora: 0 })).args.p_op, false);

  const errs = c => { const r = PS.plan('venta', { ...ALTA, ...c }, oAlta()); return r.ok ? 'ok' : r.errores; };
  eq('sin nombre', errs({ nombre: '  ' }), { nombre: 'Falta el nombre del proyecto.' });
  eq('sin cuenta, u otra cuenta', [errs({ cuenta: '' }), errs({ cuenta: 'BBVA' })], [{ cuenta: 'Elige la cuenta de cobro.' }, { cuenta: 'Elige la cuenta de cobro.' }]);
  eq('un estatus que no existe', errs({ estatus: 'PAGADO' }), { estatus: 'Ese estatus no existe.' });
  eq('un tipo de trabajo que no existe', errs({ tipos: ['Rotulación de vinil'] }), { tipos: 'Uno de los tipos de trabajo no existe.' });
  eq('subtotal vacío', errs({ subtotal: '' }), { subtotal: 'Falta el subtotal.' });
  eq('subtotal NaN, Infinity, 1e9, cero, negativo o con tres decimales: no', ['NaN', 'Infinity', '1e9', '0', '-5', '12.345', '1000000000'].map(s => errs({ subtotal: s }) === 'ok'), [false, false, false, false, false, false, false]);
  eq('anticipo negativo o NaN: no; cero sí', [errs({ anticipo: '-1' }) === 'ok', errs({ anticipo: 'NaN' }) === 'ok', errs({ anticipo: '0' }) === 'ok'], [false, false, true]);
  eq('fecha del anticipo futura: no', Object.keys(errs({ fecha: '2026-10-26' })), ['fecha']);
  eq('fecha de instalación que no existe: no; futura sí', [Object.keys(errs({ cita: '2026-02-30' })), errs({ cita: '2027-01-15' })], [['cita'], 'ok']);
  eq('teléfono vacío o de menos de 10 dígitos', [errs({ tel: '' }), errs({ tel: '33 1234' })], [{ tel: 'Falta el teléfono del cliente.' }, { tel: 'Ese teléfono no tiene los 10 dígitos.' }]);
  eq('sin forma de entrega, u otra', [errs({ entrega: '' }), errs({ entrega: 'dron' })], [{ entrega: 'Falta decir cómo se entrega.' }, { entrega: 'Falta decir cómo se entrega.' }]);
  eq('una liga que no es liga', errs({ maps: 'calle 5' }), { maps: 'Pega la liga completa de Maps (empieza con https://).' });
  eq('una dirección de más de 400', Object.keys(errs({ dir: 'x'.repeat(401) })), ['dir']);
  const vacio = PS.plan('venta', {}, oAlta());
  eq('todo vacío: los cinco obligatorios, y el primero es el nombre', [Object.keys(vacio.errores).sort(), vacio.primero], [['cuenta', 'entrega', 'nombre', 'subtotal', 'tel'], 'nombre']);

  eq('con la HOJA mandando, NO (habría dos contadores de V-###)', PS.plan('venta', ALTA, oAlta({ baseManda: false })).errores.tipo,
    'Con la hoja mandando, una venta sin cotización se registra en la hoja («Registrar nueva venta»): aquí saldría con otro V-###.');
  eq('sin decir quién manda, tampoco', PS.plan('venta', ALTA, { opId: 'pf-x', hoy: '2026-10-25', area: 'pagos' }).ok, false);
  eq('Fabricación: no', PS.plan('venta', ALTA, oAlta({ area: 'fabricacion' })).errores.tipo, 'Dar de alta una venta es de Dirección y Pagos.');
  eq('Dirección: sí', PS.plan('venta', ALTA, oAlta({ area: 'direccion' })).ok, true);

  const act = (area, alta) => ({ estado: 'activo', area, permisos: alta === undefined ? null : { alta: { alta_venta: alta } } });
  eq('los formularios con la hoja mandando: los cuatro de siempre', PS.formulariosDe({ baseManda: false, acceso: act('pagos', true) }), ['cobro', 'abono', 'reparto', 'correccion']);
  eq('con la base mandando: más la venta, si la base la deja (Pagos y Dirección en la matriz de 0017)',
    [PS.formulariosDe({ baseManda: true, acceso: act('pagos', true) }), PS.formulariosDe({ baseManda: true, acceso: act('direccion', true) }).length],
    [['cobro', 'abono', 'reparto', 'correccion', 'venta'], 5]);
  eq('si la base dice que no (alta_venta: false), no', PS.formulariosDe({ baseManda: true, acceso: act('pagos', false) }).includes('venta'), false);
  eq('sin permisos en la respuesta, la regla de la matriz', [PS.puedeDarDeAlta(act('pagos')), PS.puedeDarDeAlta(act('fabricacion')), PS.puedeDarDeAlta({ estado: 'acceso_revocado', area: 'pagos' })], [true, false, false]);

  const pv = PS.plan('venta', ALTA, oAlta());
  eq('el resumen dice el V-### de la base', PS.resumen(pv, { ok: true, proyecto_id: pv.args.p_op.id, folio_hoja: 'V-231' }), 'Venta registrada en la base — V-231: Ana - Tacos El Güero.');
  eq('y el reintento que ya había llegado lo dice', PS.resumen(pv, { ok: true, ya_existia: true, folio_hoja: 'V-231' }), 'Venta registrada en la base — V-231: Ana - Tacos El Güero. Ya estaba registrada: no se creó otra.');
  eq('ROL_SIN_PERMISO de alta_venta dice de quién es', PS.clasificar('alta_venta', { data: { ok: false, codigo: 'ROL_SIN_PERMISO' } }).mensaje, 'Dar de alta una venta es de Dirección y Pagos. No se registró nada.');
  eq('DATO_INVALIDO trae la frase de la base', PS.clasificar('alta_venta', { data: { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'La forma de entrega no existe.' } }).mensaje, 'La forma de entrega no existe. No se registró nada.');

  /* Las listas: las de esta capa (pura) contra las de la plataforma y las de la función de la base. */
  const lista = (archivo, re) => { const m = re.exec(leer(archivo)); return m ? JSON.parse(m[1].replace(/'/g, '"').replace(/,\s*\]/, ']')) : null; };
  const sql = leer('supabase/migrations/0006_rpc_obra.sql');
  const alta = sql.slice(sql.indexOf('create or replace function public.alta_venta'), sql.indexOf('revoke all on function public.alta_venta'));
  const arr = re => { const m = re.exec(alta); return m ? m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')) : null; };
  eq('las cuentas: las de puente.js y las de alta_venta', [PS.CUENTAS, PS.CUENTAS], [lista('js/datos/puente.js', /export const CUENTAS = (\[[^\]]*\]);/), arr(/v_cuenta <> all \(array\[([^\]]*)\]\)/)]);
  eq('los estatus: los de puente.js y los de alta_venta', [PS.ESTATUS, PS.ESTATUS], [lista('js/datos/puente.js', /export const ESTATUS = (\[[^\]]*\]);/), arr(/v_estatus <> all \(array\[([^\]]*)\]\)/)]);
  eq('los tipos de trabajo: los de proyectos.js y los de alta_venta', [PS.TIPOS, PS.TIPOS], [lista('js/datos/proyectos.js', /export const TIPOS_TRABAJO = (\[[\s\S]*?\]);/), arr(/v_tipo <@ array\[([^\]]*)\]/)]);
  eq('las entregas: las de entrega.js y las de alta_venta', [PS.ENTREGAS, PS.ENTREGAS], [lista('js/datos/entrega.js', /export const ENTREGAS = (\[[^\]]*\]);/), arr(/v_entrega <> all \(array\[([^\]]*)\]\)/)]);
  cierto('y la cuenta sin IVA es la de interno.normalizar_iva (cuenta <> \'Elias BBVA\')', PS.CUENTA_SIN_IVA === 'Elias BBVA' && /\(v_cuenta <> 'Elias BBVA'\)/.test(alta));
}

/* ============================================================================ */
console.log('\nQUIÉN VE LOS FORMULARIOS');
{
  const q = PS.queMostrar;
  const act = area => ({ estado: 'activo', area });
  eq('apagado: nada', q({ encendido: false, rolLocal: 'direccion', sesion: true, acceso: act('direccion') }), 'nada');
  eq('Fabricación en este aparato: nada, aunque la base dijera otra cosa', q({ encendido: true, rolLocal: 'fabricacion', sesion: true, acceso: act('pagos') }), 'nada');
  eq('sin sesión: el botón para entrar', q({ encendido: true, rolLocal: 'pagos', sesion: false }), 'entrar');
  eq('Pagos en la base: formularios', q({ encendido: true, rolLocal: 'pagos', sesion: true, acceso: act('pagos') }), 'formularios');
  eq('Dirección en la base: formularios', q({ encendido: true, rolLocal: 'direccion', sesion: true, acceso: act('direccion') }), 'formularios');
  eq('Fabricación EN LA BASE (aunque el aparato diga pagos): no', q({ encendido: true, rolLocal: 'pagos', sesion: true, acceso: act('fabricacion') }), 'sin_permiso');
  eq('acceso retirado: no', q({ encendido: true, rolLocal: 'pagos', sesion: true, acceso: { estado: 'acceso_revocado', area: 'pagos' } }), 'sin_permiso');
}

/* La pestaña, corriendo, con el doble: lo que pide y lo que pinta. Cada escenario carga su propia
   copia del módulo (el «?» de la dirección), como abrir la app de nuevo. */
const _abiertas = [];
/* `modo`: lo que dice la base de quién manda ('hoja' o 'base'; sin decirlo, como antes de 0024). `alta`: lo que dice la
   matriz de `alta_venta` para esa área (sin decirlo, sin permisos en la respuesta). */
async function pestana(nombre, { rolLocal, sesion, area, modo, alta }) {
  for (const x of _abiertas.splice(0)) x.soltar();                 // la pestaña de antes se fue (ya no oye a la base)
  globalThis.localStorage.setItem('al3d_pf_supa', JSON.stringify({ encendido: true, desde: 1 }));
  if (modo) globalThis.localStorage.setItem('al3d_pf_supa_modo', JSON.stringify({ modo, area }));
  else globalThis.localStorage.removeItem('al3d_pf_supa_modo');
  const permisos = alta === undefined ? undefined : { alta: { alta_venta: alta } };
  Prefs.setRol(rolLocal);
  globalThis.sessionStorage.clear();
  llamadas.length = 0;
  ESC = {
    sesion,
    rpc: n => (n === 'mi_acceso' ? { data: { ok: true, estado: 'activo', usuario: { correo: 'quien@al3d.mx' }, empresas: [{ empresa_id: 'al3d', area, estado: 'activo' }],
      ...(modo ? { modo } : {}), ...(permisos ? { permisos } : {}) }, error: null }
      : { data: { ok: true }, error: null }),
    from: () => ({ data: [{ proyecto_id: 'p1', a_folio: 'V-214', b_proyecto: 'Letras Farmacia', k_saldo: 5800, t_restante: 800, h_neto: 11600 }], error: null }),
  };
  const M = await import('../js/mod/pagos-supa.js?' + nombre);
  _abiertas.push(M);
  const el = { _h: '', isConnected: true, set innerHTML(h) { this._h = h; }, get innerHTML() { return this._h; },
    addEventListener() {}, querySelector() { return null; } };
  el.innerHTML = M.html();
  M.cablear(el);
  for (let i = 0; i < 40 && /Preguntando|Leyendo/.test(el.innerHTML); i++) await espera(5);
  return { html: el.innerHTML, llamadas: llamadas.slice(), M, el };
}
const contenedor = () => ({ _h: '', isConnected: true, set innerHTML(h) { this._h = h; }, get innerHTML() { return this._h; },
  addEventListener() {}, querySelector() { return null; } });
{
  let r = await pestana('pagos', { rolLocal: 'pagos', sesion: true, area: 'pagos' });
  cierto('Pagos con sesión ve los cuatro formularios', ['Cobro o anticipo', 'Abono de comisión', 'Repartir un depósito', 'Corregir'].every(t => r.html.includes(t)));
  cierto('con la venta de la base y su saldo en pesos', r.html.includes('V-214 · Letras Farmacia — saldo $5,800.00'));
  cierto('y avisa que escribe en Supabase, no en la hoja', /en <b>Supabase<\/b>, la base nueva, no en la hoja/.test(r.html));
  eq('pidió quién es y las ventas, y NO escribió nada al abrir', r.llamadas.map(x => x[0] + ':' + x[1]), ['rpc:mi_acceso', 'from:ventas_calculadas']);
  eq('el cliente manda la cabecera del contrato', opcionesDelCliente && opcionesDelCliente.global.headers['x-al3d-contrato'], '1');

  r = await pestana('fabbase', { rolLocal: 'pagos', sesion: true, area: 'fabricacion' });
  cierto('Fabricación según la base: no ve formularios', !/pg-form/.test(r.html) && /Registrar cobros y abonos es de Pagos y Dirección/.test(r.html));
  eq('y no se le pide una sola cifra (solo mi_acceso)', r.llamadas.map(x => x[0] + ':' + x[1]), ['rpc:mi_acceso']);
  cierto('ni se le pinta un importe', !/\$\d/.test(r.html));

  r = await pestana('fablocal', { rolLocal: 'fabricacion', sesion: true, area: 'pagos' });
  eq('Fabricación en este aparato: la pestaña no pinta nada', r.html, '');
  cierto('y no pide ventas ni escribe', !r.llamadas.some(x => x[0] === 'from' || (x[1] !== 'mi_acceso')));

  r = await pestana('sinsesion', { rolLocal: 'pagos', sesion: false, area: 'pagos' });
  cierto('sin sesión: el botón de Google y apagar, sin formularios', /pg-google/.test(r.html) && /Apagar Supabase/.test(r.html) && !/pg-form/.test(r.html));
  eq('sin sesión no pregunta nada a la base', r.llamadas, []);

  r = await pestana('hojapagos', { rolLocal: 'pagos', sesion: true, area: 'pagos', modo: 'hoja', alta: true });
  cierto('con la HOJA mandando: la prueba de siempre, «Registrar en Supabase», y avisa que se registre también en la hoja',
    /Registrar en Supabase/.test(r.html) && /regístralo también allá/.test(r.html) && !/Cobros y abonos/.test(r.html));
  cierto('y la venta sin cotización NO se ofrece (la da de alta la hoja)', !/Venta sin cotización/.test(r.html) && !/data-pg-form="venta"/.test(r.html));
  llamadas.length = 0;
  globalThis.dispatchEvent(new CustomEvent('al3d-base-cambio'));
  await espera(20);
  eq('y un aviso de Realtime no relee nada (con la hoja mandando no llega, y si llegara no se le hace caso)', llamadas, []);
  globalThis.localStorage.removeItem('al3d_pf_supa');
  globalThis.localStorage.removeItem('al3d_pf_supa_modo');
}

/* ============================================================================ */
console.log('\nCON LA BASE MANDANDO: «COBROS Y ABONOS» (paso 5)');
{
  let r = await pestana('basepagos', { rolLocal: 'pagos', sesion: true, area: 'pagos', modo: 'base', alta: true });
  cierto('se llama «Cobros y abonos» y ya no manda a registrar en la hoja', /Cobros y abonos/.test(r.html) && !/regístralo también allá/.test(r.html) &&
    /lo ven al momento los teléfonos de Dirección y Pagos/.test(r.html));
  cierto('Pagos ve los cinco: los cuatro de siempre y la venta sin cotización',
    ['Cobro o anticipo', 'Abono de comisión', 'Repartir un depósito', 'Corregir', 'Venta sin cotización'].every(x => r.html.includes(x)));
  eq('al abrir pidió lo mismo que antes: quién es y las ventas; nada se escribe', r.llamadas.map(x => x[0] + ':' + x[1]), ['rpc:mi_acceso', 'from:ventas_calculadas']);

  llamadas.length = 0;
  globalThis.dispatchEvent(new CustomEvent('al3d-base-cambio'));
  for (let i = 0; i < 40 && !llamadas.length; i++) await espera(5);
  await espera(10);
  eq('otro teléfono cobró (Realtime): se releen los saldos, una vez, sin volver a preguntar quién es', llamadas.map(x => x[0] + ':' + x[1]), ['from:ventas_calculadas']);
  llamadas.length = 0;
  r.M.cablear(r.el);
  await espera(10);
  eq('repintar el mismo contenedor no relee', llamadas, []);
  const otro = contenedor();
  otro.innerHTML = r.M.html();
  r.M.cablear(otro);
  await espera(10);
  eq('volver a la pestaña en seguida (menos de 3 s) tampoco: lo de hace un momento sigue al día', llamadas, []);
  r.M.soltar();
  llamadas.length = 0;
  globalThis.dispatchEvent(new CustomEvent('al3d-base-cambio'));
  await espera(20);
  eq('con Control desmontado (la pestaña se fue), un aviso no relee nada', llamadas, []);

  r = await pestana('basenoalta', { rolLocal: 'pagos', sesion: true, area: 'pagos', modo: 'base', alta: false });
  cierto('si la base dice que el área no da de alta ventas, la venta no se ofrece', !/Venta sin cotización/.test(r.html) && /Abono de comisión/.test(r.html));

  r = await pestana('basedir', { rolLocal: 'direccion', sesion: true, area: 'direccion', modo: 'base', alta: true });
  cierto('Dirección también ve la venta sin cotización', /Venta sin cotización/.test(r.html));

  r = await pestana('basefab', { rolLocal: 'pagos', sesion: true, area: 'fabricacion', modo: 'base', alta: false });
  cierto('Fabricación según la base, con la base mandando: ni formularios ni importes', !/pg-form/.test(r.html) && !/\$\d/.test(r.html));
  eq('y solo se le preguntó quién es', r.llamadas.map(x => x[0] + ':' + x[1]), ['rpc:mi_acceso']);
  llamadas.length = 0;
  globalThis.dispatchEvent(new CustomEvent('al3d-base-cambio'));
  await espera(20);
  eq('ni un aviso de Realtime le pide cifras', llamadas, []);

  r = await pestana('basesinsesion', { rolLocal: 'pagos', sesion: false, area: 'pagos', modo: 'base' });
  cierto('sin sesión, con la base mandando: el botón de Google, y NO «Apagar Supabase» (volvería a escribir en la hoja)',
    /pg-google/.test(r.html) && !/Apagar Supabase/.test(r.html));
  for (const x of _abiertas.splice(0)) x.soltar();
  globalThis.localStorage.removeItem('al3d_pf_supa');
  globalThis.localStorage.removeItem('al3d_pf_supa_modo');
}

/* ============================================================================ */
console.log('\nAPAGADO NO CAMBIA NADA');
{
  const ctl = leer('js/mod/control.js');
  const sinC = sinComentarios(ctl);
  cierto('Control no importa de forma estática ni supa.js ni pagos-supa.js',
    !/^import[^;]*(supa|pagos-supa)\.js/m.test(ctl) && /import\('\.\/pagos-supa\.js'\)/.test(sinC) && !/nucleo\/supa\.js/.test(sinC));
  cierto('la pestaña nueva se carga solo dentro de cablearAsientos, y esa solo con TAB === \'asientos\'',
    (sinC.match(/import\('\.\/pagos-supa\.js'\)/g) || []).length === 1 && /if \(TAB === 'asientos'\) cablearAsientos\(\);/.test(sinC));
  /* Las funciones de verdad de control.js, corridas aquí con el interruptor apagado y encendido. */
  const cuerpo = n => { const m = new RegExp('function ' + n + '\\(\\) \\{[\\s\\S]*?\\n\\}').exec(sinC); return m ? m[0] : ''; };
  const TABS = /const TABS = (\[[^\]]*\]);/.exec(sinC);
  const AREAS = /const AREAS_DE_COBRO = (\[[^\]]*\]);/.exec(sinC);
  const correr = new Function('localStorage', 'Prefs', 'const TABS = ' + (TABS ? TABS[1] : '[]') + '; const AREAS_DE_COBRO = ' + (AREAS ? AREAS[1] : '[]') + ';' +
    cuerpo('supaEncendido') + cuerpo('laBaseManda') + cuerpo('tabs') + ' return tabs();');
  const ls = mapa();
  const pagos = { rol: () => 'pagos' }, fab = { rol: () => 'fabricacion' }, dir = { rol: () => 'direccion' };
  /* Seis desde octubre de 2026: «Ventas» (`lista`), el detalle que salió del Resumen. */
  const SEIS = ['ventas', 'lista', 'cobrar', 'comisiones', 'gastos', 'bitacora'];
  eq('apagado: las seis pestañas de siempre, en su orden', correr(ls, pagos), SEIS);
  ls.setItem('al3d_pf_supa', 'basura{');
  eq('una clave dañada es apagado', correr(ls, pagos), SEIS);
  ls.setItem('al3d_pf_supa_modo', JSON.stringify({ modo: 'base' }));
  eq('apagado con el modo «base» oído antes: las seis (sin interruptor, la base no manda aquí)', correr(ls, pagos), SEIS);
  ls.removeItem('al3d_pf_supa_modo');
  ls.setItem('al3d_pf_supa', JSON.stringify({ encendido: true, desde: 1 }));
  eq('encendido: una séptima, al final', correr(ls, pagos), SEIS.concat('asientos'));
  eq('encendido pero Fabricación: las seis', correr(ls, fab), SEIS);
  ls.setItem('al3d_pf_supa_modo', JSON.stringify({ modo: 'hoja' }));
  eq('encendido con la HOJA mandando: lo de siempre', [correr(ls, pagos), correr(ls, fab)], [SEIS.concat('asientos'), SEIS]);
  ls.setItem('al3d_pf_supa_modo', JSON.stringify({ modo: 'base', area: 'pagos' }));
  eq('con la BASE mandando la decide el modo: Pagos y Dirección la tienen, Fabricación no',
    [correr(ls, pagos), correr(ls, dir), correr(ls, fab)], [SEIS.concat('asientos'), SEIS.concat('asientos'), SEIS]);
  ls.removeItem('al3d_pf_supa_modo');
  cierto('la pestaña se llama «Cobros y abonos» con la base mandando y «Registrar (Supabase)» con la hoja',
    /t: laBaseManda\(\) \? 'Cobros y abonos' : 'Registrar \(Supabase\)'/.test(sinC) && PS.nombreDeLaPestana(true) === 'Cobros y abonos' && PS.nombreDeLaPestana(false) === 'Registrar (Supabase)');
  cierto('y le pasa a la pestaña la sincronización de la app (una venta nueva baja en el acto)', /_PS\.cablear\(el, o\)/.test(sinC) && /m\.cablear\(ahora, o\)/.test(sinC) &&
    /sincronizar: CTX && typeof CTX\.sincronizar === 'function' \? CTX\.sincronizar : null/.test(sinC));
  cierto('la clave que mira Control es la del interruptor de supa.js', /'al3d_pf_supa'/.test(cuerpo('supaEncendido')) &&
    /CLAVE_INTERRUPTOR = 'al3d_pf_supa'/.test(leer('js/nucleo/supa.js')));
  cierto('una dirección vieja «?tab=asientos» con Supabase apagado cae en Resumen', /return tabs\(\)\.includes\(t\) \? t : null;/.test(sinC) &&
    /if \(!tabs\(\)\.includes\(TAB\)\) TAB = 'ventas';/.test(sinC));
  const app = leer('js/app.js'), idx = leer('index.html');
  cierto('ni app.js ni index.html conocen estos módulos', !/pagos-supa/.test(app) && !/pagos-supa/.test(idx));
  cierto('Ajustes no se tocó para esto (su tarjeta de Supabase es la de entrar, para los tres roles desde «la base manda»)',
    !/pagos-supa/.test(leer('js/mod/ajustes.js')) &&
    /function cardSupabase\(\) \{\n  if \(!Prefs\.ROLES\.includes\(Prefs\.rol\(\)\)\) return '';/.test(leer('js/mod/ajustes.js')));
  cierto('la capa pura no toca el DOM ni el almacenamiento', !/document|localStorage|sessionStorage|window\./.test(sinComentarios(leer('js/datos/pagos-supa.js'))));
  const sw = leer('sw.js');
  cierto('los dos módulos van en la caché del service worker', sw.includes("'./js/datos/pagos-supa.js'") && sw.includes("'./js/mod/pagos-supa.js'"));
}

/* ============================================================================ */
console.log('\nDOBLE ENVÍO Y CONFIRMACIÓN (la pantalla)');
{
  const m = sinComentarios(leer('js/mod/pagos-supa.js'));
  const f = /async function enviarForm[\s\S]*?\n\}/.exec(m);
  const t = f ? f[0] : '';
  cierto('un envío a la vez: sale si ya hay uno en curso, antes y después de preguntar', (t.match(/if \(_enviando\) return;/g) || []).length === 2);
  const i = (s) => t.indexOf(s);
  cierto('pregunta (confirmarPf con el título del plan) ANTES de llamar a la base', i('confirmarPf({ titulo: p.titulo') > 0 && i('confirmarPf({ titulo: p.titulo') < i('PS.enviar('));
  cierto('el op_id es el del borrador, y uno nuevo solo tras confirmar el cambio de un envío incierto', /opId: b\.opId/.test(t) && i('PS.opIdPara(b, p).cambio') < i('PS.renovar(b)'));
  cierto('el botón se apaga mientras va', /btn\.disabled = true/.test(t));
  cierto('tras la respuesta el borrador decide: nuevo si se confirmó, el mismo op_id si no', /PS\.despuesDeEnviar\(b, p, r\)/.test(t));
  cierto('los errores van junto a su campo con aria-invalid y role="alert"', /setAttribute\('aria-invalid', 'true'\)/.test(m) && /role="alert"/.test(m));
  cierto('el formulario es un <form>: Enter envía', /<form class="pg-form"/.test(m) && /addEventListener\('submit', alEnviar\)/.test(m));
  /* Paso 5. */
  cierto('tampoco mientras se recalcula el reparto (un segundo toque no pide otra vista previa)', /if \(_preparando\) return;/.test(t));
  cierto('lo raro se pregunta con el botón de peligro del plan', /peligro: !!p\.peligro/.test(t));
  cierto('el reparto se recalcula ANTES de preguntar, y solo en un envío nuevo (el reintento va con el mismo op_id)',
    i("if (tipo === 'reparto' && !reintento)") > 0 && i('repartoAlDia(form, c.monto)') < i('confirmarPf({ titulo: p.titulo') && /const reintento = !!b\.incierto;/.test(t));
  const ra = /async function repartoAlDia[\s\S]*?\n\}/.exec(m);
  cierto('si el reparto cambió, se enseña el nuevo y NO se manda', !!ra && /if \(PS\.mismoReparto\(_vp, r\.data\)\) return true;/.test(ra[0]) &&
    /_vp = r\.data;/.test(ra[0]) && /return false;\n\}$/.test(ra[0]) && !/PS\.enviar/.test(ra[0]));
  cierto('el plan sabe quién manda (la venta sin cotización solo con la base) y sella con la hora de ahora', /baseManda: enBase\(\), ahora: Date\.now\(\)/.test(t));
  cierto('una venta nueva pide la sincronización de la app al confirmarse', /if \(tipo === 'venta' && _sincronizar\)/.test(t));
  cierto('«Apagar Supabase» no se ofrece ni se obedece con la base mandando', /\(base \? '' : '<div class="pf-acciones"><button type="button" class="btn btn-gho" data-pg-act="apagar">/.test(m) &&
    /else if \(act === 'apagar' && !enBase\(\)\)/.test(m));
  cierto('la regla de quién manda es la de supa.js', /import \{ laBaseManda \} from '\.\.\/nucleo\/supa\.js';/.test(m) && /const enBase = \(\) => laBaseManda\(\);/.test(m));
  cierto('Realtime: la pestaña escucha `al3d-base-cambio`, el mismo que avisa el enchufe solo con la base mandando',
    /addEventListener\('al3d-base-cambio', alCambiarLaBase\)/.test(m) && /export const EVENTO_CAMBIO = 'al3d-base-cambio';/.test(leer('js/datos/supa-enchufe.js')) &&
    /if \(_enBase\) avisarPantallas\(\);/.test(sinComentarios(leer('js/datos/supa-enchufe.js'))));
  cierto('y no relee mientras alguien escribe o se manda algo: espera a que suelte el campo', /if \(_enviando \|\| _preparando \|\| _cargando \|\| escribiendo\) \{ _releer = true; return; \}/.test(m) &&
    /addEventListener\('focusout', \(\) => \{ if \(_releer\) setTimeout\(alCambiarLaBase, 0\); \}\)/.test(m));
}

/* ============================================================================ */
console.log('\nLOS TEXTOS QUE DECÍAN «LA HOJA» CON LA BASE MANDANDO (paso 5)');
{
  const ctl = leer('js/mod/control.js');
  /* Con la hoja mandando, cada frase de siempre sigue ahí, letra por letra (las pruebas de navegador las buscan). */
  for (const f of ['Sin señal: se enseña lo último que bajó de la hoja.', "'Trayendo la hoja…'", "'Traer la hoja'", 'de la hoja de finanzas',
    'el abono de cada comisión se registra en la hoja «Finanzas AL3D — Ventas y Comisiones»', 'Lista para registrar en la hoja',
    ' para mandarse', 'la hoja no lo aceptó', 'Se guarda en este teléfono y se manda a la pestaña «Gastos» de la hoja de finanzas.',
    'en la hoja queda con «Anulado: Sí», quién y cuándo', 'Los gastos viven en la pestaña «Gastos» de la hoja ']) {
    cierto('con la hoja: «' + f.replace(/'/g, '') + '»', ctl.includes(f));
  }
  /* Con la base mandando, su versión. */
  for (const f of ['Sin señal: se enseña lo último que bajó de la base.', "'Trayendo de la base…'", "'Traer de la base'", "'de la base'",
    'el abono de cada comisión se registra en «Cobros y abonos»', "'Lista para registrar'", "' a la base'", 'la base no lo aceptó',
    'Se guarda en este teléfono y se manda a la base', 'en la base queda anulado, con quién y cuándo', 'Los gastos viven en la base']) {
    cierto('con la base: «' + f.replace(/'/g, '') + '»', ctl.includes(f));
  }
  cierto('con la base, «Falta actualizar el puente» no sale (lo apartado sale solo en el siguiente bombeo)', /if \(base\) \{ pend \+= apart; apart = 0; \}/.test(ctl) &&
    /if \(!base && \(D\.hojaGastos === false \|\| apart\)\)/.test(ctl));
  cierto('y la lista de comisiones lleva a «Cobros y abonos»', /data-tab="asientos">Ir a Cobros y abonos</.test(ctl));
  const aj = leer('js/mod/ajustes.js'), app = leer('js/app.js');
  cierto('el candado del rol dice quién lo manda (js/datos/quien-manda.js), en Ajustes las dos veces',
    (aj.match(/' lo manda ' \+ Manda\.rolLoManda\(\) \+ '<\/span>'/g) || []).length === 2 && !/lo manda la hoja<\/span>/.test(aj));
  cierto('y su nota también (Ajustes y la barra de arriba)', !/Prefs\.ROL_LO_MANDA_LA_HOJA/.test(aj + app) &&
    (aj.match(/Manda\.notaDelRol\(\)/g) || []).length >= 4 && (app.match(/Manda\.notaDelRol\(\)/g) || []).length === 2);
  cierto('y el párrafo de «Entrar con Google» dice de dónde sale el rol', /\(Manda\.rolDeLaBase\(\)\n?\s*\? '<p class="pf-nota">El rol no sale de este aparato: sale de tu área en la <b>base<\/b>/.test(aj));
  cierto('quien-manda.js no toca prefs.js (que va en los paquetes de dos funciones de Supabase)', !/rolDeLaBase|ROL_LO_MANDA_LA_BASE/.test(leer('js/datos/prefs.js')) &&
    /'\.\/js\/datos\/quien-manda\.js'/.test(leer('sw.js')));
  cierto('el pase que da la base lleva `de: \'base\'`', /Prefs\.setPase\(\{ correo, rol: a\.area, hasta: Date\.now\(\) \+ MS_PASE, visto: Date\.now\(\), de: 'base' \}\)/.test(leer('js/nucleo/puerta.js')));
  /* Y corridas: el pase de la hoja y el de la base. */
  const pase = (de) => { const p = { correo: 'a@al3d.mx', rol: 'pagos', hasta: Date.now() + 60000 }; if (de) p.de = de; globalThis.localStorage.setItem(Prefs.CLAVES.PASE, JSON.stringify(p)); };
  pase();
  eq('pase de la hoja: «lo manda la hoja» y la nota de «Accesos»', [Manda.rolDeLaBase(), Manda.rolLoManda(), Manda.notaDelRol() === Prefs.ROL_LO_MANDA_LA_HOJA], [false, 'la hoja', true]);
  pase('base');
  eq('pase de la base: «lo manda la base» y la nota de Personas', [Manda.rolDeLaBase(), Manda.rolLoManda(), /Ajustes → Supabase → Personas/.test(Manda.notaDelRol())], [true, 'la base', true]);
  globalThis.localStorage.removeItem(Prefs.CLAVES.PASE);
  eq('sin pase: nada que decir (el interruptor del rol es de este aparato)', [Manda.rolDeLaBase(), Manda.rolLoManda()], [false, 'la hoja']);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
