// FM-34 — la PRUEBA DIFERENCIAL de la vista `ventas_calculadas` (A.md §6.4).
//
// Un oráculo escrito en JS con aritmética decimal EXACTA (enteros BigInt con escala fija, NUNCA `Number`) calcula H, K, R, S, T, U y X
// para 20 000 filas aleatorias y las compara con lo que dice la vista: CERO diferencias. Las filas mezclan subtotales de 0 a 3 decimales
// (~10 % terminados en 5 centavos, que son los empates de redondeo), negativos, anticipos y liquidaciones de 0 a 3 decimales, los cuatro
// estatus, las cinco cuentas (y sin cuenta), IVA que cuadra o no con la cuenta, y de 0 a 4 abonos por folio (con correcciones negativas).
//
// El oráculo NO comparte código con la base: la regla «mitad lejos de cero» se escribe aquí con enteros. Si la vista usara `double`, o
// redondeara H antes de restar, o leyera `pct_comision`, esta prueba lo encontraría. La semilla es fija: el resultado es reproducible.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, sql } from '../comun/semilla.js';
import { divRedondeo, aEscala, centavos, aCentavos, oraculo } from '../comun/oraculo.js';

const N = 20_000;
const base = dato(async () => { const db = await crearBaseDePruebas(); db.u = await sembrarUsuarios(db); return db; }, { limpiar: db => db.close() });

// --- generador pseudoaleatorio con semilla (mulberry32): el resultado no depende de la máquina ---------------------------
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const azar = mulberry32(20261010);
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const elige = xs => xs[Math.floor(azar() * xs.length)];

const CUENTAS = ['Elias BBVA', 'Constru BNT', 'Moni MPago', 'Rul HSBC', 'Tatis BNT', null];
const ESTATUS = ['FABRICACION', 'REPARANDO', 'COBRANDO', 'LIQUIDADO'];

/** Un decimal aleatorio como texto, de 0 a 3 decimales; a veces terminado en 5 centavos (empate al redondear al 10 % y al 16 %). */
function decimal(maxEntero, maxDec) {
  const dec = entre(0, maxDec);
  let ent = entre(0, maxEntero);
  let d = dec ? String(entre(0, 10 ** dec - 1)).padStart(dec, '0') : '';
  if (azar() < 0.10) { ent = entre(0, maxEntero); d = String(entre(0, 9)) + '5'; }          // x.y5: centavos en 5
  return d ? `${ent}.${d}` : String(ent);
}

function generar() {
  const filas = [];
  for (let i = 0; i < N; i++) {
    const cuenta = elige(CUENTAS);
    // el IVA coincide con la cuenta ~70 % de las veces; si no, es un error de captura que la columna X debe marcar
    const ivaDeCuenta = cuenta === null ? azar() < 0.5 : cuenta !== 'Elias BBVA';
    const iva = azar() < 0.7 ? ivaDeCuenta : !ivaDeCuenta;
    const estatus = elige(ESTATUS);
    const g = (azar() < 0.1 ? '-' : '') + decimal(50_000, 3);
    const abonos = [];
    for (let k = entre(0, 4); k > 0; k--) {
      let x = decimal(2_000, 2);
      while (!/[1-9]/.test(x)) x = decimal(2_000, 2);          // un abono de cero no existe (CHECK abonos_signo)
      abonos.push((azar() < 0.15 ? '-' : '') + x);
    }
    const fila = { i, folio: 'V-' + String(2_000_000 + i), g: g === '-0' ? '0' : g, i_: decimal(60_000, 3), j: decimal(60_000, 3), iva, cuenta, estatus,
                   conFechaLiq: estatus === 'LIQUIDADO' ? azar() < 0.7 : azar() < 0.2, abonos };
    // a algunas liquidadas se les deja el saldo EXACTAMENTE en cero (anticipo = H, liquidación = 0): es la única forma de llegar a «Falta fecha de liquidación»
    if (estatus === 'LIQUIDADO' && azar() < 0.2) {
      const h = divRedondeo(aEscala(fila.g, 3) * (iva ? 116n : 100n), 1000n);
      if (h > 0n) { fila.i_ = centavos(h); fila.j = '0'; }
    }
    filas.push(fila);
  }
  return filas;
}

const tanda = (a, filas) => { const r = []; for (let i = 0; i < filas.length; i += a) r.push(filas.slice(i, i + a)); return r; };
const lit = s => (s === null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

describir('FM-34 diferencial: 20 000 filas aleatorias, vista contra oráculo BigInt', () => {
  prueba('el oráculo coincide con los casos a mano de §6.4 (no hay deriva entre el oráculo y la especificación)', () => {
    const o = f => oraculo({ i: 0, folio: 'V-1', g: '0', i_: '0', j: '0', iva: true, cuenta: null, estatus: 'COBRANDO', conFechaLiq: false, abonos: [], ...f });
    igual([o({ g: '1.45' }).r, o({ g: '1.45' }).h], [15n, 168n]);                                // FM-03
    igual([o({ g: '2.35' }).r, o({ g: '2.35' }).h], [24n, 273n]);                                // FM-04
    igual([o({ g: '0.05' }).r, o({ g: '0.05' }).h], [1n, 6n]);                                   // FM-05
    igual([o({ g: '-1.45' }).r, o({ g: '-1.45' }).h], [-15n, -168n]);                            // FM-06
    igual(o({ g: '4310.34', i_: '5000' }).h, 499999n);                                           // FM-07: 4999.99
    igual(o({ g: '100.005', i_: '0.001', j: '0.002' }).k, 11601n);                               // FM-17: 116.01
  });

  prueba('siembra 20 000 ventas y compara H, K, R, S, T, U y X de CADA una: cero diferencias', async () => {
    const db = await base();
    const filas = generar();
    for (const t of tanda(1000, filas)) {
      await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, folio_local, dispositivo, fuente, nombre, etapa, estatus, iva)
                     values ${t.map(f => `('d${f.i}', 'al3d', '${f.folio}', '${f.folio}', 'hoja', 'hoja', 'Diferencial ${f.i}', 'ganado', '${f.estatus}', ${f.iva})`).join(',')}`);
      await sql(db, `insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta, fecha_liquidacion)
                     values ${t.map(f => `('d${f.i}', 'al3d', ${f.g}, ${f.i_}, ${f.j}, ${lit(f.cuenta)}, ${f.conFechaLiq ? 'interno.hoy_mx()' : 'null'})`).join(',')}`);
      const ab = t.flatMap(f => f.abonos.map(x => `('al3d', '${f.folio}', ${x}, interno.hoy_mx(), '${x.startsWith('-') ? 'correccion' : 'abono'}')`));
      if (ab.length) await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe, fecha, tipo) values ${ab.join(',')}`);
    }
    const D = sesionDe(db, db.u.dir);
    const filasVista = await D.query(`select a_folio, h_neto::text as h, k_saldo::text as k, r_comision::text as r, s_abonado::text as s, t_restante::text as t, u_pagos as u, x_revisar as x
                                        from public.ventas_calculadas where a_folio >= 'V-2000000' and a_folio < 'V-2020000'`);
    igual(filasVista.length, N, 'la vista devuelve las 20 000 filas');
    const porFolio = new Map(filasVista.map(v => [v.a_folio, v]));
    const diferencias = [];
    for (const f of filas) {
      const o = oraculo(f), v = porFolio.get(f.folio);
      const dif = [];
      if (aCentavos(v.h) !== o.h) dif.push(`H vista=${v.h} oráculo=${centavos(o.h)}`);
      if (aCentavos(v.k) !== o.k) dif.push(`K vista=${v.k} oráculo=${centavos(o.k)}`);
      if (aCentavos(v.r) !== o.r) dif.push(`R vista=${v.r} oráculo=${centavos(o.r)}`);
      if (aCentavos(v.s) !== o.s) dif.push(`S vista=${v.s} oráculo=${centavos(o.s)}`);
      if (aCentavos(v.t) !== o.t) dif.push(`T vista=${v.t} oráculo=${centavos(o.t)}`);
      if (v.u !== o.u) dif.push(`U vista=${v.u} oráculo=${o.u}`);
      if (v.x !== o.x) dif.push(`X vista=«${v.x}» oráculo=«${o.x}»`);
      if (dif.length) diferencias.push(`${f.folio} G=${f.g} I=${f.i_} J=${f.j} iva=${f.iva} cuenta=${f.cuenta} ${f.estatus} abonos=[${f.abonos}]: ${dif.join('; ')}`);
    }
    igual(diferencias.slice(0, 8), [], `${diferencias.length} diferencias`);
    // para que la prueba tenga dientes, la muestra debe contener de todo: empates de redondeo, negativos y cada bandera de X
    const banderas = new Set(filas.map(f => oraculo(f).x));
    for (const x of ['', 'IVA no corresponde a la cuenta', 'Cobrado de más', 'Comisión pagada de más', 'Liquidado con saldo', 'Falta fecha de liquidación']) cierto(banderas.has(x), 'la muestra no contiene la bandera «' + x + '»');
    cierto(filas.filter(f => /\.\d5$/.test(f.g)).length > 500, 'hay centavos en 5');
    cierto(filas.filter(f => f.g.startsWith('-')).length > 1000, 'hay subtotales negativos');
  }, { tiempo: 300_000 });
});

await resumen();
