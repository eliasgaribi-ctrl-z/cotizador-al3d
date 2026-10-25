/* ============================================================================
   EL DINERO POR CUENTA Y EL DISPONIBLE — la aritmética de la pestaña «Cuentas» de Control.

   Lo pidió Elías el 2026-10-25, con la empresa ya en la base (docs/DINERO-Y-FACTURAS.md): «En el control
   se debe de ver cuál es el dinero que tengo disponible y que por ende se vaya restando de los gastos
   que hago. De la cuenta de ConstruImagen, cuando depositan, yo no tengo acceso a ese dinero». Y lo que
   decidió: solo «Elias BBVA» es dinero de AL3D (Dirección lo puede cambiar, `ajustes_dinero` de 0027), y
   solo resta un gasto que salió DE una de esas cuentas.

   Todo lo de aquí es PURO, como js/datos/ventas.js y js/datos/gastos.js: recibe las listas que Control ya
   tiene (las ventas unificadas y los gastos de este teléfono, que con la base mandando bajan de la base) y
   devuelve números. No lee la red, ni la base local, ni el almacenamiento (el que guarda la última lista de
   cuentas se recibe como argumento). Se prueba en node: pruebas/dinero-cuentas.mjs.

   CÓMO SE CUENTA, y por qué así:
     · Lo que ENTRÓ a una cuenta es lo que la base (antes la hoja) dice que se depositó: el ANTICIPO y la
       LIQUIDACIÓN de cada venta, en la cuenta de esa venta. Es lo mismo que Control llama «ya cobrado»
       (vendido menos saldo = anticipo + liquidación), pero contado depósito por depósito y no por venta:
       una venta LIQUIDADA con depósitos de menos cuenta lo que se depositó, no su total.
     · Cada depósito cae en el periodo de SU fecha: el anticipo en la del anticipo (la de la venta) y la
       liquidación en la de la liquidación. La liquidación es ACUMULATIVA en la base (un número y una fecha,
       la del último cobro): una liquidación en dos partes cae entera en el mes de la última. Una liquidación
       SIN fecha solo cuenta en «Todo», y la pantalla dice cuántas son.
     · Los periodos son los de siempre de Control (este mes, 3 meses, 12 meses, todo), con la misma regla que
       la lista de Ventas y la de Gastos: desde el día 1 del primer mes.
     · Una venta que todavía no llega a la base (la que solo está en este teléfono: no trae `deposito`) no
       cuenta: su anticipo es el PACTADO en la cotización, no uno que alguien registró. Una cancelada («No se
       dio») tampoco, como en todo Control.
     · Lo que SALIÓ de una cuenta son los gastos no anulados cuya cuenta es esa (la de «Cuenta de la que
       salió» del formulario). Un gasto en efectivo o sin cuenta no resta de ninguna: se dice aparte.
     · DISPONIBLE = lo que entró a las cuentas disponibles − lo que salió de ellas, en el periodo. No es el
       saldo del banco: los gastos de antes de que se empezaran a capturar no están, y por eso la pantalla
       arranca en «Este mes» y lo dice.
   ============================================================================ */

import { esISO, hoyISO, masMeses } from '../nucleo/fechas.js';

/** Las cinco cuentas de cobro, en el orden de siempre (`CUENTAS` de js/datos/puente.js, de pagos-supa.js y de la base). */
export const CUENTAS = Object.freeze(['Elias BBVA', 'Constru BNT', 'Moni MPago', 'Rul HSBC', 'Tatis BNT']);
/** Las que FACTURAN (`interno.cuentas_fiscales()` de 0027): ConstruImagen, Mónica y Tanit. Rul HSBC y Elias BBVA no. */
export const CUENTAS_FISCALES = Object.freeze(['Constru BNT', 'Moni MPago', 'Tatis BNT']);
/** Lo que decidió Elías el 2026-10-25, y lo que vale sin renglón en `ajustes_dinero` (una empresa nueva) o sin haberlo leído nunca. */
export const DISPONIBLES_POR_OMISION = Object.freeze(['Elias BBVA']);
/** De quién es cada cuenta fiscal, como la nombra Elías. Las demás se nombran por su cuenta. */
export const DE_QUIEN = Object.freeze({ 'Constru BNT': 'ConstruImagen', 'Moni MPago': 'Mónica', 'Tatis BNT': 'Tanit' });
/** Los periodos de Control, los mismos de la lista de Ventas y de la de Gastos. */
export const PERIODOS = Object.freeze(['mes', '3m', '12m', 'todo']);
/** Dónde recuerda este teléfono la última lista de cuentas disponibles que leyó de la base (para pintar sin señal). */
export const CLAVE_AJUSTE = 'al3d_pf_cuentas_disp';

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const red2 = v => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const plano = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * La cuenta como se escribe en la lista, o '' si no es ninguna de las cinco. Un gasto de la hoja tecleado a mano
 * («elias bbva», «Constru  BNT») es la suya; «Efectivo» o vacío, ninguna. PURA.
 */
export function cuentaCanonica(v) {
  const p = plano(v);
  if (!p) return '';
  return CUENTAS.find(c => plano(c) === p) || '';
}
export const esFiscal = c => CUENTAS_FISCALES.includes(cuentaCanonica(c));

/** Las cuentas disponibles, limpias: de las cinco, sin repetir, en el orden de siempre. Sin ninguna válida, las de por omisión. PURA. */
export function disponiblesDe(lista) {
  const l = Array.isArray(lista) ? lista.map(cuentaCanonica).filter(Boolean) : [];
  const r = CUENTAS.filter(c => l.includes(c));
  return r.length ? r : DISPONIBLES_POR_OMISION.slice();
}

/** El primer día del periodo ('YYYY-MM-DD'), o null para «Todo». La regla de `proyectosDelPeriodo` de Control y de `Gastos.delPeriodo`. PURA. */
export function desdeDelPeriodo(periodo, hoy) {
  const h = esISO(hoy) ? hoy : hoyISO();
  const ini = h.slice(0, 7) + '-01';
  if (periodo === 'mes') return ini;
  if (periodo === '3m') return masMeses(ini, -2);
  if (periodo === '12m') return masMeses(ini, -11);
  return null;
}
/* En el periodo: con «Todo», todo (también lo que no tiene fecha); con un periodo, solo una fecha desde su primer día. */
const enPeriodo = (fecha, desde) => (!desde ? true : esISO(fecha) && fecha >= desde);

/**
 * Los depósitos de una venta de la lista unificada (`Ventas.unificar`): el anticipo y la liquidación que la base (o la hoja)
 * registró, cada uno con su fecha, en la cuenta de la venta. Vacío si la venta se canceló o si no ha llegado a la base (no trae
 * `deposito`: su anticipo es el pactado). PURA.
 * @returns {{que:'anticipo'|'liquidacion', monto:number, fecha:string, cuenta:string}[]}
 */
export function depositosDe(p) {
  if (!p || p.etapa === 'cancelado' || !p.deposito || typeof p.deposito !== 'object') return [];
  const d = p.deposito;
  const cuenta = cuentaCanonica(d.cuenta || p.cuenta);
  const out = [];
  if (num(d.anticipo) > 0) out.push({ que: 'anticipo', monto: red2(d.anticipo), fecha: esISO(d.fecha_anticipo) ? d.fecha_anticipo : (esISO(p.fecha_ganado) ? p.fecha_ganado : ''), cuenta });
  if (num(d.liquidacion) > 0) out.push({ que: 'liquidacion', monto: red2(d.liquidacion), fecha: esISO(d.fecha_liquidacion) ? d.fecha_liquidacion : '', cuenta });
  return out;
}

/**
 * El dinero por cuenta en un periodo, y lo disponible. PURA.
 * @param {Object[]} ventas  la lista unificada de Control (`Ventas.unificar(...).ventas`)
 * @param {Object[]} gastos  los gastos de este teléfono (`Gastos.listar()`), con los anulados
 * @param {{periodo?:string, hoy?:string, disponibles?:string[]}} [o]
 * @returns {{
 *   periodo:string, desde:string|null,
 *   cuentas:{cuenta:string, disponible:boolean, fiscal:boolean, deQuien:string, anticipos:number, liquidaciones:number,
 *            ingresos:number, nVentas:number, gastos:number, nGastos:number, neto:number}[],
 *   disponible:{cuentas:string[], ingresos:number, gastos:number, saldo:number, nGastos:number},
 *   otras:{ingresos:number, nVentas:number}, sinCuenta:{ingresos:number, nVentas:number},
 *   efectivo:{gastos:number, nGastos:number}, liqSinFecha:{n:number, monto:number}, porLlegar:number
 * }}
 */
export function dineroPorCuenta(ventas, gastos, o = {}) {
  const periodo = PERIODOS.includes(o.periodo) ? o.periodo : 'mes';
  const desde = desdeDelPeriodo(periodo, o.hoy);
  const disponibles = disponiblesDe(o.disponibles);
  const fila = c => ({ cuenta: c, disponible: disponibles.includes(c), fiscal: CUENTAS_FISCALES.includes(c), deQuien: DE_QUIEN[c] || '',
    anticipos: 0, liquidaciones: 0, ingresos: 0, nVentas: 0, gastos: 0, nGastos: 0, neto: 0, _ventas: new Set() });
  const filas = new Map(CUENTAS.map(c => [c, fila(c)]));
  const sinCuenta = { ingresos: 0, nVentas: 0, _ventas: new Set() };
  const efectivo = { gastos: 0, nGastos: 0 };
  const liqSinFecha = { n: 0, monto: 0 };
  let porLlegar = 0;

  for (const p of (Array.isArray(ventas) ? ventas : [])) {
    if (!p || p.etapa === 'cancelado') continue;
    if (!p.deposito) { if (num(p.anti_pactado) > 0) porLlegar++; continue; }
    for (const d of depositosDe(p)) {
      if (d.que === 'liquidacion' && !d.fecha && desde) { liqSinFecha.n++; liqSinFecha.monto = red2(liqSinFecha.monto + d.monto); continue; }
      if (!enPeriodo(d.fecha, desde)) continue;
      const f = filas.get(d.cuenta) || sinCuenta;
      if (f === sinCuenta) sinCuenta.ingresos = red2(sinCuenta.ingresos + d.monto);
      else if (d.que === 'anticipo') f.anticipos = red2(f.anticipos + d.monto);
      else f.liquidaciones = red2(f.liquidaciones + d.monto);
      f._ventas.add(p.id);
    }
  }
  for (const g of (Array.isArray(gastos) ? gastos : [])) {
    if (!g || g.anulado || !(num(g.monto) > 0)) continue;
    if (!enPeriodo(g.fecha, desde)) continue;
    const f = filas.get(cuentaCanonica(g.cuenta));
    if (!f) { efectivo.gastos = red2(efectivo.gastos + num(g.monto)); efectivo.nGastos++; continue; }
    f.gastos = red2(f.gastos + num(g.monto)); f.nGastos++;
  }

  const cuentas = [...filas.values()].map(f => {
    const ingresos = red2(f.anticipos + f.liquidaciones);
    const { _ventas, ...resto } = f;
    return { ...resto, ingresos, nVentas: _ventas.size, neto: red2(ingresos - f.gastos) };
  });
  const de = c => cuentas.filter(x => x.disponible === c);
  const suma = (l, k) => red2(l.reduce((s, x) => s + x[k], 0));
  const disp = de(true), otras = de(false);
  return {
    periodo, desde,
    cuentas,
    disponible: { cuentas: disponibles, ingresos: suma(disp, 'ingresos'), gastos: suma(disp, 'gastos'), saldo: red2(suma(disp, 'ingresos') - suma(disp, 'gastos')),
                  nGastos: disp.reduce((s, x) => s + x.nGastos, 0) },
    otras: { ingresos: suma(otras, 'ingresos'), nVentas: otras.reduce((s, x) => s + x.nVentas, 0) },
    sinCuenta: { ingresos: sinCuenta.ingresos, nVentas: sinCuenta._ventas.size },
    efectivo, liqSinFecha, porLlegar,
  };
}

/* ============================================================================
   LA LISTA DE CUENTAS DISPONIBLES: la última que se leyó de la base, y el cambio de Dirección
   ============================================================================ */

/**
 * La última lista que este teléfono leyó de la base, o la de por omisión. `almacen` es un `localStorage` (o lo que se le parezca);
 * sin él, o con basura, la de por omisión. PURA (no toca nada que no reciba).
 * @returns {{cuentas:string[], por:string, en:string, leida:boolean}}
 */
export function ajusteGuardado(almacen) {
  let x = null;
  try { x = JSON.parse((almacen && almacen.getItem(CLAVE_AJUSTE)) || 'null'); } catch (_) { x = null; }
  if (!x || !Array.isArray(x.cuentas)) return { cuentas: DISPONIBLES_POR_OMISION.slice(), por: '', en: '', leida: false };
  return { cuentas: disponiblesDe(x.cuentas), por: String(x.por || ''), en: String(x.en || ''), leida: true };
}
export function guardarAjuste(almacen, a) {
  try { if (almacen) almacen.setItem(CLAVE_AJUSTE, JSON.stringify({ cuentas: disponiblesDe(a && a.cuentas), por: (a && a.por) || '', en: (a && a.en) || '' })); }
  catch (_) { /* sin almacenamiento: se queda la de por omisión */ }
}

/**
 * Lo que Dirección marcó en las casillas, contra lo que hay. Arma la llamada a `cuentas_disponibles_guardar` (0027) o dice por qué
 * no hay nada que mandar. No llama a nada. PURA.
 * @returns {{ok:true, rpc:string, args:Object, titulo:string, texto:string, si:string, peligro:boolean} | {ok:false, mensaje:string, sinCambio?:boolean}}
 */
export function planAjuste(marcadas, actuales, opId) {
  const nuevas = CUENTAS.filter(c => Array.isArray(marcadas) && marcadas.includes(c));
  if (!nuevas.length) return { ok: false, mensaje: 'Marca al menos una cuenta: sin ninguna no habría dinero disponible que enseñar.' };
  const antes = disponiblesDe(actuales);
  if (nuevas.join('|') === antes.join('|')) return { ok: false, sinCambio: true, mensaje: 'Esas ya son las cuentas disponibles.' };
  const entran = nuevas.filter(c => !antes.includes(c)), salen = antes.filter(c => !nuevas.includes(c));
  const nombre = c => c + (DE_QUIEN[c] ? ' (' + DE_QUIEN[c] + ')' : '');
  return {
    ok: true, rpc: 'cuentas_disponibles_guardar', args: { p_op: { op_id: opId, cuentas: nuevas } },
    titulo: '¿Cambiar las cuentas del dinero disponible?',
    texto: 'Quedan: ' + nuevas.map(nombre).join(', ') + '.' + (entran.length ? ' Se suma ' + entran.map(nombre).join(', ') + '.' : '') +
      (salen.length ? ' Deja de contar ' + salen.map(nombre).join(', ') + '.' : '') +
      ' El disponible pasa a ser lo que entró a esas cuentas menos los gastos que salieron de ellas. Lo ven igual todos los teléfonos de Dirección y Pagos, ' +
      'y queda en la bitácora de la base.',
    si: 'Cambiar', peligro: !nuevas.includes('Elias BBVA'),
  };
}
