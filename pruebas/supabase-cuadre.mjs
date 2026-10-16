/* EL CUADRE (fase 3) — js/datos/supa-cuadre.js y scripts/cuadre-diario.mjs.
 *
 * Lo que se vigila:
 *   · que cuadra cuando la hoja y la base dicen lo mismo, y que un CENTAVO de diferencia ya no cuadra
 *     (es lo que tiene que encontrar: el redondeo de Sheets en los empates, R-01);
 *   · que suma en centavos enteros, sin el error de la coma flotante (0.1 + 0.2);
 *   · que dice dónde: solo en la hoja, solo en la base, columna por folio, y el V-### distinto que la
 *     sombra pudo recibir de la base (emparejado por folio de cotización, no contado como faltante);
 *   · la racha de días seguidos (la meta de la fase 3 es 7), con días de México;
 *   · el script del cuadre diario: apagado sin sus variables, sale con 1 si no cuadra, NO imprime
 *     nombres, folios ni importes (su bitácora es pública), y no escribe el detalle dentro del repo;
 *   · y el flujo de GitHub, apagado por omisión.
 *
 * Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');

const C = await import('../js/datos/supa-cuadre.js');
const { correr } = await import('../scripts/cuadre-diario.mjs');

const HOJA = (folio, o = {}) => ({ id: 'hoja:' + folio, folio_hoja: folio, folio_cotizacion: '', nombre: 'Cliente ' + folio,
  sub: 1000, neto: 1160, anticipo: 500, liquidacion: 0, pago_pendiente: 660, comisiones: 100, abono_comision: 0, comision_restante: 100, ...o });
const BASE = (folio, o = {}) => ({ a_folio: folio, folio_global: null, g_subtotal: 1000, h_neto: 1160, i_anticipo: 500, j_liquidacion: 0,
  k_saldo: 660, r_comision: 100, s_abonado: 0, t_restante: 100, ...o });

console.log('\nCUADRA Y NO CUADRA');
{
  const r = C.cuadrar([HOJA('V-001'), HOJA('V-002')], [BASE('V-002'), BASE('V-001')]);
  eq('lo mismo en los dos lados, en otro orden: cuadra', [r.cuadra, r.hoja.filas, r.base.filas, r.hoja.neto], [true, 2, 2, 232000]);
  const r2 = C.cuadrar([HOJA('V-001', { comisiones: 100.01 })], [BASE('V-001')]);
  eq('un centavo de diferencia ya no cuadra', [r2.cuadra, r2.totales.map(x => x.campo), r2.distintos.lista], [false, ['comisiones'],
    [{ folio: 'V-001', campo: 'comisiones', hoja: 10001, base: 10000 }]]);
  const r3 = C.cuadrar([HOJA('V-001', { sub: 0.1 }), HOJA('V-002', { sub: 0.2 })], [BASE('V-001', { g_subtotal: 0.3 }), BASE('V-002', { g_subtotal: 0 })]);
  eq('suma en centavos enteros: 0.1 + 0.2 es 0.3 (y luego compara por folio)', [r3.hoja.subtotal, r3.base.subtotal, r3.totales.length], [30, 30, 0]);
  eq('una celda vacía cuenta como cero, igual que en la hoja', C.centavos(null) + C.centavos('') + C.centavos(undefined) + C.centavos('x'), 0);
  const r4 = C.cuadrar([HOJA('V-001'), HOJA('V-003')], [BASE('V-001'), BASE('V-004')]);
  eq('dice qué falta de cada lado', [r4.cuadra, r4.solo_hoja.lista, r4.solo_base.lista], [false, [{ folio: 'V-003' }], [{ folio: 'V-004' }]]);
  const r5 = C.cuadrar([HOJA('V-310', { folio_cotizacion: 'COT-0042@K7QM' })], [BASE('V-311', { folio_global: 'COT-0042@K7QM' })]);
  eq('la venta que la base numeró distinto se empareja por su cotización y se reporta aparte (no falta)',
    [r5.cuadra, r5.solo_hoja.n, r5.solo_base.n, r5.folio_distinto.lista], [true, 0, 0, [{ hoja: 'V-310', base: 'V-311' }]]);
  const r6 = C.cuadrar([HOJA(''), HOJA('V-001')], [BASE('V-001')]);
  eq('un renglón de la hoja sin folio no entra a la cuenta, pero se cuenta aparte', [r6.cuadra, r6.sin_folio_hoja], [true, 1]);
  const muchas = Array.from({ length: 50 }, (_, i) => HOJA('V-' + String(100 + i)));
  eq('el detalle tiene tope; el número no', [C.cuadrar(muchas, []).solo_hoja.n, C.cuadrar(muchas, []).solo_hoja.lista.length], [50, C.TOPE_DETALLE]);
  eq('vacío contra vacío: cuadra (no hay nada que comparar)', C.cuadrar([], []).cuadra, true);
}

console.log('\nLA RACHA');
{
  eq('el día es el de México (las 23:30 del 15 en Guadalajara siguen siendo el 15)', C.diaMx(Date.parse('2026-10-16T05:30:00Z')), '2026-10-15');
  const d = (dia, cuadra, ts = 1) => ({ dia, cuadra, ts });
  eq('siete días seguidos cuadrando', C.racha(['10', '11', '12', '13', '14', '15', '16'].map(x => d('2026-10-' + x, true))), 7);
  eq('un día que no cuadró corta la racha', C.racha([d('2026-10-14', true), d('2026-10-15', false), d('2026-10-16', true)]), 1);
  eq('un día sin cuadre también', C.racha([d('2026-10-13', true), d('2026-10-14', true), d('2026-10-16', true)]), 1);
  eq('dos cuadres el mismo día: manda el último', C.racha([d('2026-10-15', true, 1), d('2026-10-16', false, 1), d('2026-10-16', true, 2)]), 2);
  eq('cruza el fin de mes', C.racha([d('2026-09-30', true), d('2026-10-01', true)]), 2);
  eq('sin historial, cero', C.racha([]), 0);
}

console.log('\nEL SCRIPT DEL CUADRE DIARIO');
{
  const salida = [];
  eq('sin sus variables está apagado y termina bien, sin tocar la red',
    [await correr({ env: {}, log: x => salida.push(x), fetch: () => { throw new Error('no debía llamar'); } }), /apagado/.test(salida[0])], [0, true]);

  const env = { PUENTE_URL: 'https://script.google.com/macros/s/x/exec', PUENTE_TOKEN: 't'.repeat(40),
    SUPABASE_URL: 'https://hhwjlxukuzxearrjurtc.supabase.co', SUPABASE_SECRETA: 'sb_secret_DE_MENTIRAS' };
  const { P } = await import('../js/datos/puente.js');
  const fila = (folio, neto) => ({ almacen: 'proyectos', datos: { id_notion: folio, [P.proyecto]: 'Cliente Secreto ' + folio,
    [P.subtotal]: 1000, [P.neto]: neto, [P.anticipo]: 500, [P.liquidacion]: 0, [P.pendiente]: neto - 500, [P.comisiones]: 100,
    [P.abonoCom]: 0, [P.comRestante]: 100 } });
  const pedidos = [];
  const doble = baseFilas => async (url, init) => {
    pedidos.push([url, init.headers || {}]);
    if (String(url).includes('script.google.com')) return { status: 200, json: async () => ({ ok: true, registros: [fila('V-001', 1160), fila('V-002', 2320)] }) };
    return { status: 200, json: async () => baseFilas };
  };
  const log1 = [];
  const c1 = await correr({ env, log: x => log1.push(x), fetch: doble([BASE('V-001'), BASE('V-002', { g_subtotal: 1000, h_neto: 2320, k_saldo: 1820 })]) });
  eq('cuadra: sale con 0', [c1, /^CUADRA/.test(log1[0])], [0, true]);
  cierto('a la hoja le pide /jalar con el token en el CUERPO (no en la URL)', !pedidos[0][0].includes('t'.repeat(40)));
  cierto('a la base, con la llave en la cabecera y de 500 en 500', pedidos[1][1].apikey === env.SUPABASE_SECRETA && pedidos[1][1].Range === '0-499');
  const log2 = [];
  const c2 = await correr({ env, log: x => log2.push(x), fetch: doble([BASE('V-001', { h_neto: 1160.01 })]) });
  eq('no cuadra: sale con 1 (GitHub avisa)', [c2, /^NO CUADRA/.test(log2[0])], [1, true]);
  cierto('y lo que imprime NO lleva nombres, folios ni importes (la bitácora del flujo es pública)',
    !/Cliente|Secreto|V-0\d\d|1160|2320|\$/.test(log1.concat(log2).join('\n')));
  const log3 = [];
  eq('no escribe el detalle dentro del repositorio', [await correr({ env, log: x => log3.push(x), fetch: doble([]), detalle: join(RAIZ, 'cuadre.json') }), /FUERA/.test(log3.join(' '))], [1, true]);
  const fuera = join(tmpdir(), 'al3d-cuadre-prueba.json');
  await correr({ env, log: () => {}, fetch: doble([]), detalle: fuera });
  cierto('fuera sí', JSON.parse(readFileSync(fuera, 'utf8')).solo_hoja.n === 2);
  const log4 = [];
  eq('una dirección que no es de Supabase se rechaza', await correr({ env: { ...env, SUPABASE_URL: 'https://evil.example' }, log: x => log4.push(x), fetch: doble([]) }), 1);
  const s = leer('scripts/cuadre-diario.mjs');
  cierto('y el script no trae ninguna llave escrita', !/sb_secret_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{10,}/.test(s));
}

console.log('\nEL FLUJO DE GITHUB, APAGADO');
{
  const f = leer('.github/workflows/cuadre-diario.yml');
  cierto('solo corre con la variable CUADRE_DIARIO=encendido', /if: vars\.CUADRE_DIARIO == 'encendido'/.test(f));
  cierto('las llaves van como secretos, no como variables', /secrets\.SUPABASE_SECRETA/.test(f) && /secrets\.PUENTE_TOKEN/.test(f) && !/vars\.SUPABASE_SECRETA|vars\.PUENTE_TOKEN/.test(f));
  cierto('con permisos de solo lectura y el script de aquí', /permissions:\n\s+contents: read/.test(f) && /node scripts\/cuadre-diario\.mjs/.test(f));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
