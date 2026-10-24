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
async function pestana(nombre, { rolLocal, sesion, area }) {
  globalThis.localStorage.setItem('al3d_pf_supa', JSON.stringify({ encendido: true, desde: 1 }));
  Prefs.setRol(rolLocal);
  globalThis.sessionStorage.clear();
  llamadas.length = 0;
  ESC = {
    sesion,
    rpc: n => (n === 'mi_acceso' ? { data: { ok: true, estado: 'activo', usuario: { correo: 'quien@al3d.mx' }, empresas: [{ empresa_id: 'al3d', area, estado: 'activo' }] }, error: null }
      : { data: { ok: true }, error: null }),
    from: () => ({ data: [{ proyecto_id: 'p1', a_folio: 'V-214', b_proyecto: 'Letras Farmacia', k_saldo: 5800, t_restante: 800, h_neto: 11600 }], error: null }),
  };
  const M = await import('../js/mod/pagos-supa.js?' + nombre);
  const el = { _h: '', isConnected: true, set innerHTML(h) { this._h = h; }, get innerHTML() { return this._h; },
    addEventListener() {}, querySelector() { return null; } };
  el.innerHTML = M.html();
  M.cablear(el);
  for (let i = 0; i < 40 && /Preguntando|Leyendo/.test(el.innerHTML); i++) await espera(5);
  return { html: el.innerHTML, llamadas: llamadas.slice() };
}
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
  globalThis.localStorage.removeItem('al3d_pf_supa');
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
  const correr = new Function('localStorage', 'Prefs', 'const TABS = ' + (TABS ? TABS[1] : '[]') + ';' + cuerpo('supaEncendido') + cuerpo('tabs') + ' return tabs();');
  const ls = mapa();
  const pagos = { rol: () => 'pagos' }, fab = { rol: () => 'fabricacion' };
  /* Seis desde octubre de 2026: «Ventas» (`lista`), el detalle que salió del Resumen. */
  const SEIS = ['ventas', 'lista', 'cobrar', 'comisiones', 'gastos', 'bitacora'];
  eq('apagado: las seis pestañas de siempre, en su orden', correr(ls, pagos), SEIS);
  ls.setItem('al3d_pf_supa', 'basura{');
  eq('una clave dañada es apagado', correr(ls, pagos), SEIS);
  ls.setItem('al3d_pf_supa', JSON.stringify({ encendido: true, desde: 1 }));
  eq('encendido: una séptima, al final', correr(ls, pagos), SEIS.concat('asientos'));
  eq('encendido pero Fabricación: las seis', correr(ls, fab), SEIS);
  cierto('la clave que mira Control es la del interruptor de supa.js', /'al3d_pf_supa'/.test(cuerpo('supaEncendido')) &&
    /CLAVE_INTERRUPTOR = 'al3d_pf_supa'/.test(leer('js/nucleo/supa.js')));
  cierto('una dirección vieja «?tab=asientos» con Supabase apagado cae en Resumen', /return tabs\(\)\.includes\(t\) \? t : null;/.test(sinC) &&
    /if \(!tabs\(\)\.includes\(TAB\)\) TAB = 'ventas';/.test(sinC));
  const app = leer('js/app.js'), idx = leer('index.html');
  cierto('ni app.js ni index.html conocen estos módulos', !/pagos-supa/.test(app) && !/pagos-supa/.test(idx));
  cierto('Ajustes no se tocó para esto (sigue solo para Dirección)', !/pagos-supa/.test(leer('js/mod/ajustes.js')) &&
    /function cardSupabase\(\) \{\n  if \(Prefs\.rol\(\) !== 'direccion'\) return '';/.test(leer('js/mod/ajustes.js')));
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
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
