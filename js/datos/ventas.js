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

   Y desde septiembre de 2026 vienen también de la HOJA de finanzas: `unificar()` cruza los
   proyectos de este teléfono con el espejo `ventas_hoja` que baja el puente —todas las
   filas de la pestaña Ventas, tengan o no proyecto aquí— y devuelve una sola lista con la
   forma que todo lo de este archivo ya sabe sumar. Es lo que hace que «vendido en
   septiembre» sea lo del negocio y no lo de este aparato.

   Sobre el SALDO. `pago_pendiente` es una fórmula de la hoja y arranca en null. Lo que se
   puede saber sin ella es lo que se puede saber con lo que hay: total vendido menos el
   anticipo pactado, y cero si el estatus ya dice LIQUIDADO. Se llama «saldo estimado» en
   la pantalla y no «pago pendiente», porque no es la fórmula y no sabe de abonos
   intermedios. Cuando el puente baja la fórmula, manda la fórmula, y la pantalla lo dice.
   ============================================================================ */

import { partesISO, esISO, hoyISO, masMeses, MES_CORTO } from '../nucleo/fechas.js';
import { cobrado } from './cotizador.js';
import { ETAPA_NOMBRE } from './proyectos.js';

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const red2 = v => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const hayNum = v => v !== undefined && v !== null && v !== '' && isFinite(Number(v));

/* Los meses viven en nucleo/fechas.js; aquí se reexportan con el nombre que este archivo
   siempre tuvo para que quien lo importe no cambie una línea. */
export const MESES_CORTOS = MES_CORTO;

/** 'YYYY-MM' de una fecha ISO; '' si no es fecha. */
export const mesDe = iso => (esISO(iso) ? String(iso).slice(0, 7) : '');

/** «sep 2026» de un 'YYYY-MM'. */
export function etiquetaMes(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return String(ym || '');
  return (MESES_CORTOS[Number(m[2]) - 1] || m[2]) + ' ' + m[1];
}

/** El total que se cobra por un proyecto: el autorizado manda; si no hay, el neto. La regla
 *  es `Cot.cobrado`, la misma del cotizador y del historial: una sola, no una parecida. */
export const vendidoDe = p => cobrado(p && p.neto, p && p.precio_auth);

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

/** El saldo es de la fórmula de la hoja o estimado aquí. Para que la pantalla lo diga. */
export const saldoEsDeNotion = p =>
  !!p && p.pago_pendiente !== null && p.pago_pendiente !== undefined && isFinite(Number(p.pago_pendiente));
export const saldoEsDeHoja = saldoEsDeNotion;

/* ============================================================================
   EL RÉCORD DE LA HOJA, UNIDO AL DE ESTE TELÉFONO

   Dos fuentes y una lista. Los proyectos de aquí traen lo que solo aquí existe —partidas,
   material, etapa de obra—; el espejo `ventas_hoja` trae el libro mayor entero, incluidas
   las ventas que nunca pasaron por este aparato. Se cruzan por «Folio cotizacion», que es
   la llave que el cotizador escribe en la fila al registrar la venta.

   Cuando una venta está en los dos lados manda el dinero de la HOJA: el importe, el
   anticipo, el estatus, la cuenta, las fórmulas y la fecha del anticipo (§4.0: la hoja es
   la dueña del dinero, y PAGOS corrige allá). Lo demás —nombre, etapa, tipo, dirección—
   sigue siendo del proyecto. Nada de esto se guarda: es la lista que se pinta.
   ============================================================================ */

/**
 * Una fila del espejo `ventas_hoja`, con la forma de un proyecto: la que `indicadores`,
 * `resumenMensual` y `porCobrar` ya saben sumar. Sin partidas, sin origen y sin material:
 * no es un proyecto y no lo finge (`de_hoja: true`, `etapa` null si la hoja no la trae).
 */
export function ventaDesdeHoja(v) {
  if (!v || typeof v !== 'object') return null;
  const fg = String(v.folio_cotizacion || '').trim();
  const nombre = String(v.nombre || '').trim();
  const fecha = [v.fecha_anticipo, v.fecha_instalacion, v.fecha_liquidacion].find(esISO) || '';
  return {
    id: String(v.id || ('hoja:' + (v.folio_hoja || fg || nombre))),
    de_hoja: true,
    folio_hoja: String(v.folio_hoja || ''),
    folio_local: fg ? fg.split('@')[0] : String(v.folio_hoja || ''),
    folio_global: fg,
    nombre,
    contacto: '', negocio: nombre, tel: '',
    tipo_trabajo: Array.isArray(v.tipo_trabajo) ? v.tipo_trabajo.slice() : [],
    etapa: v.etapa || null,
    fecha_ganado: fecha,
    /* `precio_auth` en cero para que `vendidoDe` caiga al neto, que es la fórmula de la
       hoja: subtotal más IVA. Aquí no se multiplica nada. */
    sub: num(v.sub), neto: num(v.neto), precio_auth: 0, iva: v.iva !== false,
    anti_pactado: num(v.anticipo),
    liquidacion: num(v.liquidacion),
    cuenta: v.cuenta || null,
    estatus_notion: v.estatus || null,
    pago_pendiente: hayNum(v.pago_pendiente) ? num(v.pago_pendiente) : null,
    /* «Comisiones» (R) es la fórmula de la comisión: 10 % fijo del subtotal. Se trae para que
       quien la necesite —el asistente— lea la cifra de la hoja y no la vuelva a calcular. */
    comisiones: hayNum(v.comisiones) ? num(v.comisiones) : null,
    comision_restante: hayNum(v.comision_restante) ? num(v.comision_restante) : null,
    pct_comision: num(v.pct_comision),
    dir_texto: String(v.direccion || ''),
    dispositivo: 'hoja',
    notas: '',
  };
}

/**
 * Los proyectos de este teléfono y el espejo de la hoja, en UNA lista. Ver la cabecera.
 *
 * @param {Object[]} proyectos   los de `Proy.listar({})`, con cancelados
 * @param {Object[]} ventasHoja  los de `DB.listar('ventas_hoja')`
 * @returns {{ventas:Object[], enlazados:number, de_hoja:number, solo_aqui:number, hay_hoja:boolean}}
 */
export function unificar(proyectos, ventasHoja) {
  const P = (Array.isArray(proyectos) ? proyectos : []).filter(Boolean);
  const H = (Array.isArray(ventasHoja) ? ventasHoja : []).filter(Boolean);

  const porFolio = new Map();
  /* Y el segundo índice, por el folio interno de la hoja (V-214). Lo necesitan los proyectos
     que el puente IMPORTÓ de la hoja porque estaban en fabricación y no habían nacido en el
     cotizador (ver `proyectos.desdeVentaDeHoja`): no tienen folio de cotización, así que por
     el índice de arriba no se atarían a su renglón.

     Y no atarlos no sería un detalle cosmético: la misma venta se contaría DOS VECES —una
     como proyecto del tablero y otra como fila del récord— y el vendido del mes saldría al
     doble. Con dieciséis proyectos importados, eso son dieciséis ventas fantasma. */
  const porHoja = new Map();
  for (const v of H) {
    const fg = String(v.folio_cotizacion || '').trim();
    if (fg && !porFolio.has(fg)) porFolio.set(fg, v);
    const fh = String(v.folio_hoja || '').trim();
    if (fh && !porHoja.has(fh)) porHoja.set(fh, v);
  }

  const usadas = new Set();
  const ventas = [];
  let enlazados = 0, huerfanos = 0;
  const ids = new Set(P.map(p => p.id));
  for (const p of P) {
    /* La copia importada que repite una venta de este teléfono (`duplicado_de`, ver
       proyectos.revisarContraLaHoja) espera a que Dirección decida en su ficha; mientras tanto
       no se cuenta, o el vendido sale con esa venta dos veces: la de aquí ya está atada a esa
       misma fila. Y si resulta que no era la misma, su fila no se pierde: sin nadie que la use,
       se cuenta sola abajo, como renglón de la hoja. Solo mientras la de aquí siga en el
       teléfono: sin ella, la copia es la única tarjeta de esa venta. */
    if (p.duplicado_de && typeof p.duplicado_de === 'object' && p.duplicado_de.id && ids.has(p.duplicado_de.id)) {
      huerfanos++; continue;
    }
    const v = (p.folio_global ? porFolio.get(String(p.folio_global)) : null)
      || (p.folio_hoja ? porHoja.get(String(p.folio_hoja)) : null);
    if (!v) {
      /* Un proyecto IMPORTADO de la hoja (`de_hoja`) sin su renglón es una fila que se borró
         allá: el barrido ya la quitó de `ventas_hoja`, y el proyecto se quedaba contado como
         venta «solo de este dispositivo», con su importe y su saldo, cuando el README promete
         que lo borrado en la hoja desaparece de aquí. Solo con espejo: sin una sola fila bajada
         —puente apagado, teléfono recién restaurado— no hay con qué saber que se borró, y se
         cuenta como siempre. */
      if (p.de_hoja && H.length) { huerfanos++; continue; }
      ventas.push(p); continue;
    }
    usadas.add(v.id);
    enlazados++;
    const u = { ...p, en_hoja: true, folio_hoja: String(v.folio_hoja || '') };
    if (esISO(v.fecha_anticipo)) u.fecha_ganado = v.fecha_anticipo;
    /* El importe de la hoja manda cuando lo trae: `precio_auth` se iguala al neto para que
       `vendidoDe` devuelva esa cifra y no la que se firmó, si PAGOS la corrigió allá. */
    if (num(v.neto) > 0) { u.neto = num(v.neto); u.precio_auth = num(v.neto); if (num(v.sub) > 0) u.sub = num(v.sub); }
    if (hayNum(v.anticipo))          u.anti_pactado = num(v.anticipo);
    if (v.estatus)                   u.estatus_notion = v.estatus;
    if (v.cuenta)                    u.cuenta = v.cuenta;
    if (hayNum(v.pago_pendiente))    u.pago_pendiente = num(v.pago_pendiente);
    if (hayNum(v.comisiones))        u.comisiones = num(v.comisiones);
    if (hayNum(v.comision_restante)) u.comision_restante = num(v.comision_restante);
    if (hayNum(v.pct_comision))      u.pct_comision = num(v.pct_comision);
    ventas.push(u);
  }

  let deHoja = 0;
  for (const v of H) {
    if (usadas.has(v.id)) continue;
    const x = ventaDesdeHoja(v);
    if (!x) continue;
    ventas.push(x);
    deHoja++;
  }

  /* Lo último que se vendió, primero; con la misma fecha, el nombre, que es lo que se lee. */
  ventas.sort((a, b) =>
    String(b.fecha_ganado || '').localeCompare(String(a.fecha_ganado || '')) ||
    (Number(b.creado_en) || 0) - (Number(a.creado_en) || 0) ||
    String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));

  return { ventas, enlazados, de_hoja: deHoja, solo_aqui: P.length - enlazados - huerfanos, hay_hoja: H.length > 0 };
}

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
  /* Doce meses de calendario, el actual incluido: los mismos doce que pinta la gráfica de
     Control. masMeses(hoy, -12) daba el día 1 de hace doce meses, y eso son TRECE. */
  const hace12 = masMeses(mesActual + '-01', -11);

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

export const COLUMNAS_CSV = ['Folio', 'Folio en la hoja', 'Fecha ganado', 'Cliente', 'Negocio', 'Teléfono',
  'Tipo de trabajo', 'Etapa', 'Subtotal', 'Total vendido', 'Anticipo', 'Saldo', 'Cuenta', 'Estatus en la hoja',
  '% comisión', 'Instalación', 'Dirección', 'Origen', 'Notas'];

/**
 * Los proyectos, una fila cada uno, para pegar en una hoja de cálculo.
 * @param {Object[]} proyectos
 * @param {Map<string,string>} [fechaInst]  proyecto_id -> fecha de la instalación viva
 */
export function csvProyectos(proyectos, fechaInst) {
  /* El nombre de cada etapa es el de datos/proyectos.js, el mismo del tablero, de la ficha y
     de la hoja. Aquí había una copia propia que decía «Garantía» donde todo lo demás dice
     «En garantía»: dos etiquetas para un mismo estado, en la misma app. */
  const etapa = ETAPA_NOMBRE;
  const filas = (Array.isArray(proyectos) ? proyectos : []).filter(Boolean).map(p => [
    p.folio_local || '', p.folio_hoja || '', p.fecha_ganado || '', p.contacto || '', p.negocio || p.nombre || '', p.tel || '',
    (p.tipo_trabajo || []).join(' + '), etapa[p.etapa] || p.etapa || '',
    num(p.sub).toFixed(2), vendidoDe(p).toFixed(2), num(p.anti_pactado).toFixed(2), saldoDe(p).toFixed(2),
    p.cuenta || '', p.estatus_notion || '', p.pct_comision ? String(p.pct_comision) : '',
    (fechaInst && fechaInst.get(p.id)) || '', String(p.dir_texto || '').replace(/\s*\n\s*/g, ' '),
    /* De dónde salió el renglón: «hoja» si solo está allá, el aparato si solo está aquí, y
       los dos si la fila está enlazada. Es lo que deja cuadrar el CSV contra la hoja. */
    p.de_hoja ? 'hoja' : (p.en_hoja ? 'hoja + ' + (p.dispositivo || '') : (p.dispositivo || '')),
    String(p.notas || '').replace(/\s*\n\s*/g, ' '),
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
