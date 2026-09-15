/* ============================================================================
   VENTAS Y COBRANZA — la aritmética del módulo de Control.

   Todo lo que hay aquí es PURO: recibe listas y devuelve números. No lee IndexedDB, no toca
   el DOM, no sabe qué rol tiene el teléfono. Es a propósito y por la misma razón que
   `taller.js` y `stock.js`: estos números son los que la dirección va a leer para decidir
   —cuánto se vendió este mes, cuánto hay en la calle sin cobrar, cuánto se dejó de vender—
   y un número plausible pero equivocado es peor que ninguno. Lo que es puro se prueba en
   node (pruebas/ventas.mjs), y lo que se prueba no se descubre mal tres meses después.

   Los datos vienen tal como los guarda `proyectos.js`: `fecha_ganado` en YYYY-MM-DD,
   `precio_auth` como total vendido (con IVA si lo lleva), `anti_pactado`, `etapa`,
   `estatus_notion`. Nada se recalcula del origen: se suma lo que ya está congelado.

   Sobre el SALDO. `pago_pendiente` es una fórmula de Notion y en fase 1 baja como null. Lo
   que se puede saber aquí es lo que se puede saber con lo que hay: total vendido menos el
   anticipo pactado, y cero si el estatus de Notion ya dice LIQUIDADO. Se llama «saldo
   estimado» en la pantalla y no «pago pendiente», porque no es la fórmula de Notion y no
   sabe de abonos intermedios. Cuando el puente baje la fórmula, manda la fórmula.
   ============================================================================ */

import { partesISO, esISO, hoyISO, masMeses } from '../nucleo/fechas.js';

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const red2 = v => Math.round((num(v) + Number.EPSILON) * 100) / 100;

export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM' de una fecha ISO; '' si no es fecha. */
export const mesDe = iso => (esISO(iso) ? String(iso).slice(0, 7) : '');

/** «sep 2026» de un 'YYYY-MM'. */
export function etiquetaMes(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return String(ym || '');
  return (MESES_CORTOS[Number(m[2]) - 1] || m[2]) + ' ' + m[1];
}

/** El total que se cobra por un proyecto: el autorizado manda; si no hay, el neto. */
export const vendidoDe = p => {
  const pa = num(p && p.precio_auth), neto = num(p && p.neto);
  return pa > 0 ? pa : neto;
};

/**
 * El saldo estimado de un proyecto. Cero si está liquidado según Notion, si se canceló, o si
 * el anticipo ya cubre el total. Si el puente bajó `pago_pendiente`, manda ese número.
 */
export function saldoDe(p) {
  if (!p || p.etapa === 'cancelado') return 0;
  if (String(p.estatus_notion || '').toUpperCase() === 'LIQUIDADO') return 0;
  const pp = p.pago_pendiente;
  if (pp !== null && pp !== undefined && isFinite(Number(pp))) return Math.max(0, red2(pp));
  return Math.max(0, red2(vendidoDe(p) - num(p.anti_pactado)));
}

/** El saldo es de la fórmula de Notion o estimado aquí. Para que la pantalla lo diga. */
export const saldoEsDeNotion = p =>
  !!p && p.pago_pendiente !== null && p.pago_pendiente !== undefined && isFinite(Number(p.pago_pendiente));

/**
 * Un renglón por mes, del más viejo al más nuevo, siempre `meses` renglones aunque estén en
 * cero: una gráfica con huecos en los meses sin venta se lee como un error de datos.
 * Los cancelados cuentan como PERDIDO en su mes: `descartar()` deja la lápida con su importe
 * justo para poder contestar «cuánto dejamos de vender».
 *
 * @param {Object[]} proyectos
 * @param {{meses?:number, hoy?:string}} [opts]
 * @returns {{mes:string, etiqueta:string, ganados:number, vendido:number, perdidos:number, perdido:number}[]}
 */
export function resumenMensual(proyectos, opts = {}) {
  const hoy = esISO(opts.hoy) ? opts.hoy : hoyISO();
  const n = Number(opts.meses) > 0 ? Math.floor(Number(opts.meses)) : 12;
  const filas = new Map();
  for (let i = n - 1; i >= 0; i--) {
    const ym = mesDe(masMeses(hoy.slice(0, 7) + '-01', -i));
    filas.set(ym, { mes: ym, etiqueta: etiquetaMes(ym), ganados: 0, vendido: 0, perdidos: 0, perdido: 0 });
  }
  for (const p of (Array.isArray(proyectos) ? proyectos : [])) {
    if (!p) continue;
    const f = filas.get(mesDe(p.fecha_ganado));
    if (!f) continue;
    if (p.etapa === 'cancelado') { f.perdidos++; f.perdido = red2(f.perdido + vendidoDe(p)); }
    else { f.ganados++; f.vendido = red2(f.vendido + vendidoDe(p)); }
  }
  return [...filas.values()];
}

/**
 * Los indicadores de la cabecera de Control.
 *
 * @param {Object[]} proyectos   todos, con cancelados
 * @param {Object[]} sinDecidir  entradas del historial autorizadas y sin proyecto (Cot.sinDecidir)
 * @param {{hoy?:string, valorDe?:Function}} [opts]  `valorDe(entrada)` = total de una cotización
 */
export function indicadores(proyectos, sinDecidir, opts = {}) {
  const hoy = esISO(opts.hoy) ? opts.hoy : hoyISO();
  const valorDe = typeof opts.valorDe === 'function' ? opts.valorDe : e => {
    const pa = num(e && e.precioAuth), neto = num(e && e.neto);
    return (pa > 0 && Math.abs(pa - neto) > 0.01) ? pa : neto;
  };
  const P = Array.isArray(proyectos) ? proyectos.filter(Boolean) : [];
  const mesActual = hoy.slice(0, 7);
  const mesAnterior = mesDe(masMeses(mesActual + '-01', -1));
  const hace12 = masMeses(hoy, -12);

  const suma = (lista, f) => lista.reduce((s, p) => red2(s + f(p)), 0);
  const vivos = P.filter(p => p.etapa !== 'cancelado');
  const delMes = vivos.filter(p => mesDe(p.fecha_ganado) === mesActual);
  const delAnterior = vivos.filter(p => mesDe(p.fecha_ganado) === mesAnterior);
  const perdidosMes = P.filter(p => p.etapa === 'cancelado' && mesDe(p.fecha_ganado) === mesActual);
  const ult12 = vivos.filter(p => esISO(p.fecha_ganado) && p.fecha_ganado >= hace12);
  const conSaldo = vivos.filter(p => saldoDe(p) > 0);
  const pend = Array.isArray(sinDecidir) ? sinDecidir.filter(Boolean) : [];

  const vMes = suma(delMes, vendidoDe), vAnt = suma(delAnterior, vendidoDe);
  return {
    mes: { n: delMes.length, total: vMes, etiqueta: etiquetaMes(mesActual) },
    mesAnterior: { n: delAnterior.length, total: vAnt, etiqueta: etiquetaMes(mesAnterior) },
    /* null cuando el mes anterior fue cero: «+∞ %» no le dice nada a nadie. */
    variacion: vAnt > 0 ? Math.round((vMes - vAnt) / vAnt * 100) : null,
    pipeline: { n: pend.length, total: suma(pend, valorDe) },
    perdidoMes: { n: perdidosMes.length, total: suma(perdidosMes, vendidoDe) },
    ticket: ult12.length ? red2(suma(ult12, vendidoDe) / ult12.length) : 0,
    ultimos12: { n: ult12.length, total: suma(ult12, vendidoDe) },
    porCobrar: { n: conSaldo.length, total: suma(conSaldo, saldoDe),
                 anticipos: suma(vivos, p => num(p.anti_pactado)) },
    instalados: vivos.filter(p => p.etapa === 'instalado').length,
  };
}

/**
 * La cartera: lo que está en la calle sin cobrar, de mayor a menor saldo. Un proyecto
 * instalado con saldo va primero que uno en diseño con el mismo saldo: el instalado ya se
 * entregó y ese dinero ya se debía haber cobrado.
 */
export function porCobrar(proyectos) {
  const P = Array.isArray(proyectos) ? proyectos.filter(Boolean) : [];
  return P.filter(p => saldoDe(p) > 0).map(p => ({
    proyecto: p, saldo: saldoDe(p), deNotion: saldoEsDeNotion(p),
    entregado: p.etapa === 'instalado',
  })).sort((a, b) => (Number(b.entregado) - Number(a.entregado)) || (b.saldo - a.saldo));
}

/**
 * La conversión cotización → venta, hecha bien.
 *
 * `Cot.conversion()` comparaba el folio VISIBLE de cada entrada con un Set de folios
 * GLOBALES (`COT-0001@DISP`), así que con la lista real de proyectos siempre daba cero
 * ganadas. Aquí se compara global con global: el folio de la entrada se pega con su
 * dispositivo (o con el de este aparato si la entrada no lo trae, que es lo que hace
 * `folioGlobal`). Y no filtra por `estado`, porque el historial no escribe ese campo.
 *
 * @param {Object[]} historial   entradas del historial del cotizador
 * @param {Object[]} proyectos   proyectos de la plataforma (con cancelados)
 * @param {string} dispositivo   el de este aparato, para las entradas sin `disp`
 * @returns {{autorizadas:number, ganadas:number, perdidas:number, sinDecidir:number, tasa:number|null}}
 */
export function conversion(historial, proyectos, dispositivo) {
  const H = Array.isArray(historial) ? historial.filter(e => e && String(e.folio || '').trim()) : [];
  const porFolio = new Map();
  for (const p of (Array.isArray(proyectos) ? proyectos : [])) {
    if (p && p.folio_global) porFolio.set(String(p.folio_global), p);
  }
  let ganadas = 0, perdidas = 0;
  for (const e of H) {
    const fg = String(e.folio).trim() + '@' + String(e.disp || dispositivo || '');
    const p = porFolio.get(fg);
    if (!p) continue;
    if (p.etapa === 'cancelado') perdidas++; else ganadas++;
  }
  const decididas = ganadas + perdidas;
  return {
    autorizadas: H.length, ganadas, perdidas, sinDecidir: H.length - decididas,
    /* Sobre las DECIDIDAS, no sobre las autorizadas: una cotización que nadie ha contestado
       no es una venta perdida todavía. Cero de cero es «no se sabe», no 0 %. */
    tasa: decididas > 0 ? Math.round(ganadas / decididas * 100) : null,
  };
}

/* ----- CSV -----
   La misma regla que el CSV del historial del cotizador: coma, comillas dobladas, BOM para que
   Excel lo abra en UTF-8, y el apóstrofo delante de lo que empiece con =, +, - o @ para que
   una hoja de cálculo no lo ejecute como fórmula. Los números puros se dejan intactos. */
export function csvCampo(v) {
  const s = v === null || v === undefined ? '' : String(v);
  const esNumero = /^-?\d+(\.\d+)?$/.test(s);
  if (!esNumero && /^[=+\-@\t\r]/.test(s)) return '"\'' + s.replace(/"/g, '""') + '"';
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const COLUMNAS_CSV = ['Folio', 'Fecha ganado', 'Cliente', 'Negocio', 'Teléfono', 'Tipo de trabajo',
  'Etapa', 'Subtotal', 'Total vendido', 'Anticipo', 'Saldo estimado', 'Cuenta', 'Estatus en la hoja',
  '% comisión', 'Instalación', 'Dirección', 'Dispositivo', 'Notas'];

/**
 * Los proyectos, una fila cada uno, para pegar en una hoja de cálculo.
 * @param {Object[]} proyectos
 * @param {Map<string,string>} [fechaInst]  proyecto_id -> fecha de la instalación viva
 */
export function csvProyectos(proyectos, fechaInst) {
  const etapa = { ganado: 'Ganado', en_diseno: 'En diseño', cortado: 'Cortado', armado: 'Armado',
    listo: 'Listo para instalar', instalado: 'Instalado', garantia: 'Garantía', cancelado: 'No se dio' };
  const filas = (Array.isArray(proyectos) ? proyectos : []).filter(Boolean).map(p => [
    p.folio_local || '', p.fecha_ganado || '', p.contacto || '', p.negocio || p.nombre || '', p.tel || '',
    (p.tipo_trabajo || []).join(' + '), etapa[p.etapa] || p.etapa || '',
    num(p.sub).toFixed(2), vendidoDe(p).toFixed(2), num(p.anti_pactado).toFixed(2), saldoDe(p).toFixed(2),
    p.cuenta || '', p.estatus_notion || '', p.pct_comision ? String(p.pct_comision) : '',
    (fechaInst && fechaInst.get(p.id)) || '', String(p.dir_texto || '').replace(/\s*\n\s*/g, ' '),
    p.dispositivo || '', String(p.notas || '').replace(/\s*\n\s*/g, ' '),
  ].map(csvCampo).join(','));
  return '﻿' + [COLUMNAS_CSV.map(csvCampo).join(',')].concat(filas).join('\r\n');
}

/** «2026-09» → primer y último día del mes, para filtrar `listar({desde, hasta})`. */
export function rangoMes(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return null;
  const a = Number(m[1]), mm = Number(m[2]);
  const ult = new Date(a, mm, 0).getDate();
  return { desde: ym + '-01', hasta: ym + '-' + String(ult).padStart(2, '0') };
}

void partesISO;
