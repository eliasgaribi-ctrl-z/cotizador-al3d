/* ============================================================================
   LO VENDIDO POR TIPO DE TRABAJO — la aritmética de las tarjetas y las gráficas de arriba
   de Control.

   La pregunta es la del dueño, en sus palabras: «cuántas letras individuales hemos vendido,
   cuántas cajas de luz, etcétera», este mes, este año y desde que se trabaja. Las ventas son
   las MISMAS que suma el resto de Control: la lista de `Ventas.unificar` (la hoja y este
   teléfono, cruzados por folio), con el mismo criterio de qué cuenta —no cancelada, con
   fecha de anticipo— y el mismo importe (`Ventas.vendidoDe`). Aquí no se inventa otro
   récord: se reparte el de siempre por tipo.

   PURO, igual que ventas.js: listas entran, números salen. Se prueba en
   pruebas/ventas-por-tipo.mjs.

   CÓMO SE CUENTA UNA VENTA CON VARIOS TIPOS. `tipo_trabajo` es una lista a propósito
   (letras Y bastidor), así que hay dos unidades y no se mezclan:
     · VENTA   — una fila del récord. El total general cuenta ventas y suma su importe UNA vez.
     · TRABAJO — un tipo dentro de una venta. Letras + bastidor son dos trabajos: uno en
                 «Letras 3D…» y otro en «Proyecto especial». Las tarjetas y las barras cuentan
                 trabajos, porque eso es lo que se pregunta: cuántas letras, cuántas cajas.
   El IMPORTE de una tarjeta es el de las ventas que llevan ese tipo, entero: el récord no dice
   cuánto de los $40,000 fue de las letras y cuánto del bastidor, y repartirlo parejo sería
   inventar una cifra. Por eso la suma de las tarjetas puede pasar del total general, y la
   pantalla lo dice; el total general nunca duplica una venta.

   Lo que no trae tipo capturado va a «Sin tipo», a la vista: es la lista de lo que hay que
   corregir en la hoja, no algo que esconder. Un valor que no es ninguno de los siete (la hoja
   es texto libre separado por comas) se cuenta con su propio nombre, también a la vista.
   ============================================================================ */

import { esISO, hoyISO, masMeses, partesISO } from '../nucleo/fechas.js';
import { vendidoDe, mesDe, etiquetaMes } from './ventas.js';
import { TIPOS_TRABAJO } from './proyectos.js';

export const SIN_TIPO = 'Sin tipo';

const red2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const plano = s => String(s == null ? '' : s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const CANON = new Map(TIPOS_TRABAJO.map(t => [plano(t), t]));

/* El nombre que se LEE. Los siete se guardan sin acentos porque así nacieron en Notion y así
   los filtra la hoja (ver proyectos.js); en la pantalla se escriben bien. El dato no cambia. */
const NOMBRE = {
  'Caja de luz con iluminacion': 'Caja de luz con iluminación',
  'Caja de luz sin iluminacion': 'Caja de luz sin iluminación',
  'Letras 3D con iluminacion': 'Letras 3D con iluminación',
  'Letras 3D sin iluminacion': 'Letras 3D sin iluminación',
  'Rotulacion de vinil': 'Rotulación de vinil',
  'Recorte acrilico': 'Recorte acrílico',
  'Custome / Proyecto Especial': 'Proyecto especial',
};
export const nombreTipo = t => NOMBRE[t] || String(t || '');

/* El color de cada tipo, como una clase (`tt-1`…`tt-7`, `tt-x` para «Sin tipo», `tt-o` para
   un valor que no es de los siete). El color en sí vive en css/plataforma.css, en claro y en
   oscuro; aquí solo se decide QUIÉN es quién, para que la tarjeta y su barra digan lo mismo. */
export function claseTipo(t) {
  if (t === SIN_TIPO) return 'tt-x';
  const i = TIPOS_TRABAJO.indexOf(t);
  return i >= 0 ? 'tt-' + (i + 1) : 'tt-o';
}

/** Los tipos de una venta: los siete en su orden canónico, sin repetir; los valores ajenos al
 *  final, como vinieron; y `[SIN_TIPO]` si no trae ninguno. */
export function tiposDeVenta(p) {
  const crudo = p && Array.isArray(p.tipo_trabajo) ? p.tipo_trabajo
    : (p && typeof p.tipo_trabajo === 'string' ? p.tipo_trabajo.split(/\s*[,|]\s*/) : []);
  const hay = new Set(), otros = [];
  for (const x of crudo) {
    const k = plano(x);
    if (!k) continue;
    const c = CANON.get(k);
    if (c) hay.add(c);
    else if (!otros.some(o => plano(o) === k)) otros.push(String(x).trim());
  }
  const r = TIPOS_TRABAJO.filter(t => hay.has(t)).concat(otros);
  return r.length ? r : [SIN_TIPO];
}

/** El mismo criterio que `Ventas.indicadores` y `resumenMensual`: lo cancelado no es venta, y
 *  sin fecha de anticipo no cae en ningún mes. */
export const cuentaComoVenta = p => !!p && p.etapa !== 'cancelado' && esISO(p.fecha_ganado);

/* ----- Los periodos -----
   «Este mes» se compara con el mes anterior completo, como la cuenta «Vendido en…» de abajo.
   «Este año» se compara con el año anterior HASTA EL MISMO DÍA: nueve meses contra doce
   siempre saldría a la baja y no diría nada. «Todo» no tiene contra qué compararse. */
const p2 = n => String(n).padStart(2, '0');
function ultimoDia(a, m) { return new Date(a, m, 0).getDate(); }

/**
 * El rango de un periodo y el de su anterior.
 * @param {'mes'|'anio'|'todo'} periodo
 * @param {string} hoy  YYYY-MM-DD
 * @param {string} [primera]  la fecha de la primera venta, para «todo»
 */
export function rangoPeriodo(periodo, hoy, primera) {
  const h = partesISO(hoy);
  if (periodo === 'mes') {
    const desde = hoy.slice(0, 7) + '-01';
    const ant = masMeses(desde, -1);
    const pa = partesISO(ant);
    return { desde, hasta: hoy, etiqueta: etiquetaMes(hoy.slice(0, 7)),
      anterior: { desde: ant, hasta: ant.slice(0, 8) + p2(ultimoDia(pa.a, pa.m)), etiqueta: etiquetaMes(ant.slice(0, 7)) } };
  }
  if (periodo === 'anio') {
    const a0 = h.a - 1;
    /* El 29 de febrero de un bisiesto se compara con el 28 del año anterior. */
    const d0 = Math.min(h.d, ultimoDia(a0, h.m));
    return { desde: h.a + '-01-01', hasta: hoy, etiqueta: String(h.a),
      anterior: { desde: a0 + '-01-01', hasta: a0 + '-' + p2(h.m) + '-' + p2(d0),
        etiqueta: a0 + ' al ' + d0 + ' ' + etiquetaMes(a0 + '-' + p2(h.m)).split(' ')[0] } };
  }
  return { desde: esISO(primera) ? primera : '0000-01-01', hasta: hoy,
    etiqueta: esISO(primera) ? 'desde ' + etiquetaMes(primera.slice(0, 7)) : 'todo', anterior: null };
}

/* Cuenta y suma las ventas de un rango, por tipo y en total. */
function sumar(ventas, desde, hasta) {
  const porTipo = new Map();
  let n = 0, importe = 0, trabajos = 0;
  for (const p of ventas) {
    if (p.fecha_ganado < desde || p.fecha_ganado > hasta) continue;
    const v = vendidoDe(p);
    n++; importe = red2(importe + v);
    for (const t of tiposDeVenta(p)) {
      const x = porTipo.get(t) || { n: 0, importe: 0 };
      x.n++; x.importe = red2(x.importe + v); trabajos++;
      porTipo.set(t, x);
    }
  }
  return { n, importe, trabajos, porTipo };
}

/** Los tipos que se enseñan: los siete siempre (un cero también es un dato: «no hemos vendido
 *  cajas sin luz este año»), luego los valores ajenos y al final «Sin tipo», solo si existen en
 *  el récord. */
export function tiposVisibles(ventas) {
  const extra = new Set();
  let sin = false;
  for (const p of (Array.isArray(ventas) ? ventas : [])) {
    if (!cuentaComoVenta(p)) continue;
    for (const t of tiposDeVenta(p)) {
      if (t === SIN_TIPO) sin = true;
      else if (!TIPOS_TRABAJO.includes(t)) extra.add(t);
    }
  }
  return TIPOS_TRABAJO.concat([...extra].sort((a, b) => a.localeCompare(b, 'es')), sin ? [SIN_TIPO] : []);
}

/**
 * Las tarjetas: por tipo, cuántos trabajos y de cuánto, en el periodo y en el anterior.
 *
 * @param {Object[]} ventas  la lista de `Ventas.unificar(...).ventas`
 * @param {{periodo?:'mes'|'anio'|'todo', hoy?:string}} [opts]
 * @returns {{periodo:string, rango:Object, primera:string, sinFecha:number,
 *   total:{ventas:number, trabajos:number, importe:number, ventasAnt:number|null, importeAnt:number|null},
 *   tipos:{tipo:string, nombre:string, clase:string, n:number, importe:number, nAnt:number|null,
 *          importeAnt:number|null, delta:number|null}[]}}
 */
export function resumenPorTipo(ventas, opts = {}) {
  const hoy = esISO(opts.hoy) ? opts.hoy : hoyISO();
  const periodo = ['mes', 'anio', 'todo'].includes(opts.periodo) ? opts.periodo : 'anio';
  const L = (Array.isArray(ventas) ? ventas : []);
  const V = L.filter(cuentaComoVenta);
  const sinFecha = L.filter(p => p && p.etapa !== 'cancelado' && !esISO(p.fecha_ganado)).length;
  const primera = V.reduce((m, p) => (!m || p.fecha_ganado < m ? p.fecha_ganado : m), '');
  const rango = rangoPeriodo(periodo, hoy, primera);
  const ahora = sumar(V, rango.desde, rango.hasta);
  const antes = rango.anterior ? sumar(V, rango.anterior.desde, rango.anterior.hasta) : null;
  const tipos = tiposVisibles(L).map(t => {
    const a = ahora.porTipo.get(t) || { n: 0, importe: 0 };
    const b = antes ? (antes.porTipo.get(t) || { n: 0, importe: 0 }) : null;
    return { tipo: t, nombre: nombreTipo(t), clase: claseTipo(t), n: a.n, importe: a.importe,
      nAnt: b ? b.n : null, importeAnt: b ? b.importe : null, delta: b ? a.n - b.n : null };
  });
  return {
    periodo, rango, primera, sinFecha,
    total: { ventas: ahora.n, trabajos: ahora.trabajos, importe: ahora.importe,
             ventasAnt: antes ? antes.n : null, importeAnt: antes ? antes.importe : null },
    tipos,
  };
}

/* Un renglón vacío de la serie: un mes o un año sin ventas también se pinta (en cero), porque
   una gráfica con huecos se lee como un error de datos. */
const vacioSerie = (clave, etiqueta) => ({ clave, etiqueta, ventas: 0, trabajos: 0, importe: 0, porTipo: {}, importeTipo: {} });
function meter(fila, p) {
  const v = vendidoDe(p);
  fila.ventas++; fila.importe = red2(fila.importe + v);
  for (const t of tiposDeVenta(p)) {
    fila.porTipo[t] = (fila.porTipo[t] || 0) + 1;
    fila.importeTipo[t] = red2((fila.importeTipo[t] || 0) + v);
    fila.trabajos++;
  }
}

/**
 * Mes a mes, desde el mes de la primera venta hasta el de hoy, sin huecos.
 * @returns {{clave:string, etiqueta:string, ventas:number, trabajos:number, importe:number,
 *            porTipo:Object<string,number>, importeTipo:Object<string,number>}[]}
 */
export function seriePorMes(ventas, opts = {}) {
  const hoy = esISO(opts.hoy) ? opts.hoy : hoyISO();
  const V = (Array.isArray(ventas) ? ventas : []).filter(p => cuentaComoVenta(p) && p.fecha_ganado <= hoy);
  if (!V.length) return [];
  const primera = V.reduce((m, p) => (p.fecha_ganado < m ? p.fecha_ganado : m), V[0].fecha_ganado);
  const filas = new Map();
  for (let ym = primera.slice(0, 7); ym <= hoy.slice(0, 7); ym = mesDe(masMeses(ym + '-01', 1))) {
    filas.set(ym, vacioSerie(ym, etiquetaMes(ym)));
  }
  for (const p of V) meter(filas.get(mesDe(p.fecha_ganado)), p);
  return [...filas.values()];
}

/** Año por año, desde el de la primera venta hasta el de hoy. Misma forma que `seriePorMes`. */
export function seriePorAnio(ventas, opts = {}) {
  const hoy = esISO(opts.hoy) ? opts.hoy : hoyISO();
  const V = (Array.isArray(ventas) ? ventas : []).filter(p => cuentaComoVenta(p) && p.fecha_ganado <= hoy);
  if (!V.length) return [];
  const a0 = Math.min(...V.map(p => Number(p.fecha_ganado.slice(0, 4))));
  const a1 = Number(hoy.slice(0, 4));
  const filas = new Map();
  for (let a = a0; a <= a1; a++) filas.set(String(a), vacioSerie(String(a), String(a)));
  for (const p of V) meter(filas.get(p.fecha_ganado.slice(0, 4)), p);
  return [...filas.values()];
}
