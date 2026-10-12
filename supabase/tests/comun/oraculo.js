// El ORÁCULO de las fórmulas de «Ventas» (H, K, R, S, T, U, X) con aritmética decimal EXACTA: enteros BigInt con escala fija, nunca `Number`.
//
// No comparte código con la base: la regla «mitad lejos de cero» se escribe aquí con enteros. Lo usan la prueba diferencial de la vista
// (formulas/diferencial.mjs, FM-34) y las pruebas que necesitan la suma «directa» de las filas (formulas/historicas.mjs, HI-01).

/** Cociente entero con redondeo «mitad lejos de cero» (como ROUND de Sheets y de PostgreSQL sobre numeric). */
export function divRedondeo(num, den) {
  const neg = (num < 0n) !== (den < 0n);
  const a = num < 0n ? -num : num, b = den < 0n ? -den : den;
  let q = a / b; if ((a % b) * 2n >= b) q += 1n;
  return neg ? -q : q;
}
/** '−123.456' → 123456n con `dec` decimales (el texto trae a lo sumo `dec`). */
export function aEscala(texto, dec) {
  const neg = texto.startsWith('-'), t = neg ? texto.slice(1) : texto;
  const [e, d = ''] = t.split('.');
  const v = BigInt(e + d.padEnd(dec, '0'));
  return neg ? -v : v;
}
/** BigInt en centavos → 'x.xx' (igual que el texto de un numeric con escala 2). */
export function centavos(c) { const neg = c < 0n, a = neg ? -c : c; return (neg ? '-' : '') + (a / 100n) + '.' + String(a % 100n).padStart(2, '0'); }
/** El texto de un numeric de PostgreSQL (con la escala que traiga) → centavos BigInt, exacto; lanza si tuviera más de 2 decimales no nulos. */
export function aCentavos(texto) {
  const neg = texto.startsWith('-'), t = neg ? texto.slice(1) : texto;
  const [e, d = ''] = t.split('.');
  if (/[1-9]/.test(d.slice(2))) throw new Error('más de dos decimales: ' + texto);
  const v = BigInt(e + d.slice(0, 2).padEnd(2, '0'));
  return neg ? -v : v;
}

/** El oráculo: H, K, R, S, T, U, X de una fila, con BigInt. */
export function oraculo(f) {
  const g3 = aEscala(f.g, 3), i3 = aEscala(f.i_, 3), j3 = aEscala(f.j, 3);
  const h = divRedondeo(g3 * (f.iva ? 116n : 100n), 1000n);                // H = round(G × (1 + 16 % si IVA), 2) en centavos
  const r = divRedondeo(g3 * 10n, 1000n);                                  // R = round(G × 10 %, 2)
  const k = divRedondeo(h * 10n - i3 - j3, 10n);                           // K = round(H − I − J, 2)
  const s = f.abonos.reduce((a, x) => a + aEscala(x, 2), 0n);              // S = suma de los abonos (≤ 2 decimales: exacta)
  const t = r - s;                                                          // T = round(R − S, 2) (ambos de 2 decimales: no hay nada que redondear)
  let x = '';
  if (f.cuenta !== null && f.iva !== (f.cuenta !== 'Elias BBVA')) x = 'IVA no corresponde a la cuenta';
  else if (k < 0n) x = 'Cobrado de más';                                   // K < −0.004 ⇔ K ≤ −0.01 en centavos
  else if (t < 0n) x = 'Comisión pagada de más';
  else if (f.estatus === 'LIQUIDADO' && k > 0n) x = 'Liquidado con saldo';
  else if (f.estatus === 'LIQUIDADO' && !f.conFechaLiq) x = 'Falta fecha de liquidación';
  return { h, k, r, s, t, u: f.abonos.length, x };
}

