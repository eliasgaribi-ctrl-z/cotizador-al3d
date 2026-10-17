/* ============================================================================
   EL CUADRE — ¿dice la base lo mismo que la hoja? (fase 3 de la migración a Supabase)

   La puerta de salida de la fase 3 es «siete días seguidos de cuadre» (docs/PLAN-SUPABASE.md §5).
   Esto es la cuenta, y nada más: PURO, sin red, sin base y sin reloj, para que lo use igual la
   tarjeta de Ajustes (js/datos/supa-enchufe.js), el script del cuadre diario
   (scripts/cuadre-diario.mjs) y la prueba de node (pruebas/supabase-cuadre.mjs).

   Qué compara. De un lado, las filas de la hoja tal como las baja el puente (`ventaDeHoja` de
   js/datos/puente.js: `sub`, `neto`, `anticipo`, `liquidacion`, `pago_pendiente`, `comisiones`,
   `abono_comision`, `comision_restante`). Del otro, la vista de fórmulas de la base
   (`ventas_calculadas`, supabase/migrations/0004_formulas.sql: G, H, I, J, K, R, S, T). Cuenta las
   filas con folio de la hoja (V-###) y suma cada columna EN CENTAVOS ENTEROS —sin coma flotante
   acumulada—, y además compara folio por folio. Un centavo de diferencia es una diferencia: es
   justo lo que el cuadre tiene que encontrar (el redondeo de Sheets en los empates, R-01 de
   supabase/DISENO.md).

   Cómo se emparejan las filas. Por el folio de la hoja (V-###): desde 0015 (Q-07, decidida por
   Elías el 2026-10-16) la sombra le manda a la base el V-### que ya le dio la hoja y la base usa ESE,
   así que en lo nuevo el folio es el mismo de los dos lados. El folio de cotización queda de
   RESPALDO para lo viejo: las ventas que la sombra dio de alta antes de 0015 recibieron de la base su
   propio número; esas se emparejan por cotización y se reportan como «folio distinto», no como venta
   que falta. Si el mismo V-### está en los dos lados pero cada uno con OTRA cotización, no son la
   misma venta: no se emparejan por folio (se intenta por cotización y, si no, cuentan como faltantes).

   Desde el 2026-10-16 la racha que cuenta es la de la COPIA DIARIA (la función `importar-diario` deja
   cada madrugada un renglón en `cuadre_diario`): `resumenCopiaDiaria` la cuenta para Ajustes.

   Lo que NO hace: no decide nada ni corrige nada. Dice si cuadra y dónde no.
   ============================================================================ */

/** Las columnas que se comparan: nombre del cuadre → [campo de la hoja, columna de la base]. */
export const COLUMNAS = Object.freeze({
  subtotal:    ['sub', 'g_subtotal'],
  neto:        ['neto', 'h_neto'],
  anticipo:    ['anticipo', 'i_anticipo'],
  liquidacion: ['liquidacion', 'j_liquidacion'],
  saldo:       ['pago_pendiente', 'k_saldo'],
  comisiones:  ['comisiones', 'r_comision'],
  abonado:     ['abono_comision', 's_abonado'],
  restante:    ['comision_restante', 't_restante'],
});

/** Cuántas diferencias por folio se guardan (el resto solo se cuenta). */
export const TOPE_DETALLE = 20;

/** Un importe en centavos enteros; lo que no es número cuenta como 0 (una celda vacía). */
export function centavos(v) {
  const n = Number(v);
  return (v === null || v === undefined || v === '' || !isFinite(n)) ? 0 : Math.round(n * 100);
}

const folioValido = f => /^V-\d{3,7}$/.test(String(f || '').trim());

/* ¿Dos folios de cotización son la misma? Sin distinguir mayúsculas, y si a uno le falta el aparato
   («@K7QM») se compara sin él. Si falta alguno de los dos, no se puede saber: cuenta como la misma.
   Solo sirve para NO emparejar por V-### dos ventas que claramente son distintas. */
function mismaCotizacion(a, b) {
  const x = String(a || '').trim().toUpperCase(), y = String(b || '').trim().toUpperCase();
  if (!x || !y || x === y) return true;
  if (x.includes('@') && y.includes('@')) return false;
  return x.split('@')[0] === y.split('@')[0];
}

/** Una fila de la hoja (de `ventaDeHoja`) en la forma común del cuadre, o null. */
export function deLaHoja(v) {
  if (!v || typeof v !== 'object') return null;
  const folio = String(v.folio_hoja || '').trim();
  const out = { folio, cotizacion: String(v.folio_cotizacion || '').trim() };
  for (const [k, [h]] of Object.entries(COLUMNAS)) out[k] = centavos(v[h]);
  return out;
}

/** Una fila de `ventas_calculadas` en la forma común del cuadre, o null. */
export function deLaBase(r) {
  if (!r || typeof r !== 'object') return null;
  const folio = String(r.a_folio || '').trim();
  const out = { folio, cotizacion: String(r.folio_global || '').trim() };
  for (const [k, [, b]] of Object.entries(COLUMNAS)) out[k] = centavos(r[b]);
  return out;
}

/** Totales en centavos de una lista ya en la forma común. */
export function totales(filas) {
  const t = { filas: 0 };
  for (const k of Object.keys(COLUMNAS)) t[k] = 0;
  for (const f of filas) {
    t.filas++;
    for (const k of Object.keys(COLUMNAS)) t[k] += f[k];
  }
  return t;
}

/**
 * El cuadre.
 * @param {Object[]} ventasHoja filas de la hoja (`ventaDeHoja`)
 * @param {Object[]} filasBase filas de `ventas_calculadas`
 * @returns {{cuadra:boolean, hoja:Object, base:Object, totales:Object[], solo_hoja:Object,
 *            solo_base:Object, distintos:Object, folio_distinto:Object, sin_folio_hoja:number}}
 *   Los importes van en centavos enteros. `solo_hoja`, `solo_base`, `distintos` y `folio_distinto`
 *   son `{n, lista}` con a lo más TOPE_DETALLE renglones en `lista`.
 */
export function cuadrar(ventasHoja, filasBase) {
  const hojaTodas = (Array.isArray(ventasHoja) ? ventasHoja : []).map(deLaHoja).filter(Boolean);
  const hoja = hojaTodas.filter(f => folioValido(f.folio));
  const base = (Array.isArray(filasBase) ? filasBase : []).map(deLaBase).filter(f => f && folioValido(f.folio));

  const th = totales(hoja), tb = totales(base);
  const diferenciasTotales = [];
  for (const k of ['filas', ...Object.keys(COLUMNAS)]) {
    if (th[k] !== tb[k]) diferenciasTotales.push({ campo: k, hoja: th[k], base: tb[k] });
  }

  const lista = () => ({ n: 0, lista: [] });
  const anotar = (l, x) => { l.n++; if (l.lista.length < TOPE_DETALLE) l.lista.push(x); };
  const soloHoja = lista(), soloBase = lista(), distintos = lista(), folioDistinto = lista();

  const porFolio = new Map(), porCot = new Map();
  for (const b of base) {
    porFolio.set(b.folio, b);
    if (b.cotizacion) porCot.set(b.cotizacion, b);
  }
  const usados = new Set();
  for (const h of hoja) {
    let b = porFolio.get(h.folio);
    if (b && (usados.has(b) || !mismaCotizacion(h.cotizacion, b.cotizacion))) b = null;
    if (!b && h.cotizacion) {
      const c = porCot.get(h.cotizacion);
      if (c && !usados.has(c)) { b = c; anotar(folioDistinto, { hoja: h.folio, base: c.folio }); }
    }
    if (!b) { anotar(soloHoja, { folio: h.folio }); continue; }
    usados.add(b);
    for (const k of Object.keys(COLUMNAS)) {
      if (h[k] !== b[k]) anotar(distintos, { folio: h.folio, campo: k, hoja: h[k], base: b[k] });
    }
  }
  for (const b of base) if (!usados.has(b)) anotar(soloBase, { folio: b.folio });

  return {
    cuadra: !diferenciasTotales.length && !soloHoja.n && !soloBase.n && !distintos.n,
    hoja: th, base: tb, totales: diferenciasTotales,
    solo_hoja: soloHoja, solo_base: soloBase, distintos, folio_distinto: folioDistinto,
    sin_folio_hoja: hojaTodas.length - hoja.length,
  };
}

/** El día de México («2026-10-16») de un instante en ms. */
export function diaMx(ms) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(Number(ms)));
  } catch (_) {
    return new Date(Number(ms) - 6 * 3600 * 1000).toISOString().slice(0, 10);
  }
}

/** El día anterior a «AAAA-MM-DD». */
function ayer(dia) {
  const d = new Date(dia + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Cuántos días SEGUIDOS lleva cuadrando, contando hacia atrás desde el último día con cuadre.
 * Un día sin cuadre o con un cuadre que no cuadró corta la racha. Si hubo varios cuadres en un día,
 * manda el último de ese día. La meta de la fase 3 es 7.
 * @param {{dia:string, cuadra:boolean, ts?:number}[]} historial
 */
export function racha(historial) {
  const porDia = new Map();
  for (const h of (Array.isArray(historial) ? historial : [])) {
    if (!h || !/^\d{4}-\d{2}-\d{2}$/.test(String(h.dia || ''))) continue;
    const prev = porDia.get(h.dia);
    if (!prev || (Number(h.ts) || 0) >= (Number(prev.ts) || 0)) porDia.set(h.dia, h);
  }
  const dias = [...porDia.keys()].sort();
  if (!dias.length) return 0;
  let d = dias[dias.length - 1], n = 0;
  while (porDia.has(d) && porDia.get(d).cuadra === true) { n++; d = ayer(d); }
  return n;
}

/**
 * La COPIA DIARIA hoja → nube (función `importar-diario`, tabla `cuadre_diario` de 0018), en lo que enseña Ajustes:
 * cuántos de los últimos 7 días de México cuadraron, la racha de días seguidos (la de `racha`) y el último resultado.
 * Desde el 2026-10-16 (decisión de Elías) ESTA es la cuenta de la fase 3: el equipo captura en la hoja y la nube se pone al
 * día cada madrugada. Si en un día hubo varias corridas, manda la última de ese día. null si no hay ninguna.
 * @param {{fecha:string, hecho_en:string, aplicado:boolean, cuadra:boolean, diferencias:number, conflictos:number, rechazos:number}[]} filas
 * @param {string} hoy  el día de México, «AAAA-MM-DD»
 */
export function resumenCopiaDiaria(filas, hoy) {
  const hist = (Array.isArray(filas) ? filas : [])
    .filter(f => f && /^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha || '')))
    .map(f => ({ dia: f.fecha, cuadra: f.cuadra === true, ts: Date.parse(f.hecho_en) || 0, f }));
  if (!hist.length) return null;
  const porDia = new Map();
  for (const h of hist) { const p = porDia.get(h.dia); if (!p || h.ts >= p.ts) porDia.set(h.dia, h); }
  let deSiete = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(hoy || ''))) {
    for (let i = 0, d = hoy; i < 7; i++, d = ayer(d)) if (porDia.has(d) && porDia.get(d).cuadra) deSiete++;
  }
  const u = hist.reduce((a, b) => (b.ts > a.ts || (b.ts === a.ts && b.dia > a.dia) ? b : a)).f;
  const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    deSiete, racha: racha(hist), meta: 7,
    ultimo: { fecha: u.fecha, hecho_en: u.hecho_en || '', aplicado: u.aplicado === true, cuadra: u.cuadra === true,
              diferencias: n(u.diferencias), conflictos: n(u.conflictos), rechazos: n(u.rechazos) },
  };
}

/** Pesos con centavos, para la pantalla («$1,234.50»). */
export function pesos(cent) {
  const n = Number(cent) / 100;
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
