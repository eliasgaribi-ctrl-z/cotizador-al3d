// La aritmética que la vista de fórmulas y las RPC de pagos comparten (R4) — A.md §6.1, §5.7 y casos FM-03..FM-07, FM-15..FM-17.
//
// Lo que se fija aquí es que la base redondea IGUAL que la hoja: decimal exacto (`numeric`), mitad lejos de cero, al centavo.
//   H «Precio Neto»  = round(subtotal × (1 + 16 % si lleva IVA), 2)
//   R «Comisiones»   = round(subtotal × 10 %, 2)        (10 % FIJO del SUBTOTAL: el IVA no entra y `pct_comision` no se lee)
// Todo en `numeric`; nunca `double precision` (con doble, 1.45 × 0.10 caería a 0.14).
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, como } from '../comun/semilla.js';
import { sql } from '../arnes/arnes.mjs';

const base = dato(async () => { const db = await crearBaseDePruebas(); db.u = await sembrarUsuarios(db); return db; }, { limpiar: db => db.close() });
const v = async (expresion, params) => (await sql(await base(), `select ${expresion} as v`, params))[0].v;
const neto = (sub, iva) => v(`interno.neto($1::numeric, $2::boolean)`, [sub, iva]);
const comision = sub => v(`interno.comision($1::numeric)`, [sub]);

describir('interno.neto (H) y interno.comision (R)', () => {
  prueba('FM-03 centavos en 5: G=1.45 → R=0.15 (0.145 redondea lejos de cero), H=1.68', async () => {
    igual(await comision('1.45'), '0.15');
    igual(await neto('1.45', true), '1.68');
  });
  prueba('FM-04 G=2.35 → R=0.24, H=2.73', async () => {
    igual(await comision('2.35'), '0.24');
    igual(await neto('2.35', true), '2.73');
  });
  prueba('FM-05 G=0.05 → R=0.01, H=0.06', async () => {
    igual(await comision('0.05'), '0.01');
    igual(await neto('0.05', true), '0.06');
  });
  prueba('FM-06 subtotal negativo: G=-1.45 con IVA → R=-0.15, H=-1.68 (mitad lejos de cero también hacia abajo)', async () => {
    igual(await comision('-1.45'), '-0.15');
    igual(await neto('-1.45', true), '-1.68');
  });
  prueba('FM-07 H no es el total impreso: G=4310.34 con IVA → H=4999.99 (no 5000.00)', async () => {
    igual(await neto('4310.34', true), '4999.99');
  });
  prueba('FM-15 subtotal 0 → H=0.00 y R=0.00', async () => {
    igual(await neto('0', true), '0.00');
    igual(await comision('0'), '0.00');
  });
  prueba('FM-16 G=-500 con IVA → H=-580.00, R=-50.00', async () => {
    igual(await neto('-500', true), '-580.00');
    igual(await comision('-500'), '-50.00');
  });
  prueba('FM-17 importes sin escala: G=100.005 con IVA → H=116.01 (116.0058), R=10.00 (10.0005)', async () => {
    igual(await neto('100.005', true), '116.01');
    igual(await comision('100.005'), '10.00');
  });
  prueba('sin IVA, H = G redondeado; un subtotal nulo cuenta como 0; un IVA nulo cuenta como «sin IVA»', async () => {
    igual(await neto('10000', false), '10000.00');
    igual(await neto(null, true), '0.00');
    igual(await neto('100', null), '100.00');
    igual(await comision(null), '0.00');
  });
  prueba('la comisión NO depende del IVA ni de pct_comision: es el 10 % del SUBTOTAL', async () => {
    igual(await comision('10000'), '1000.00');
    igual(await neto('10000', true), '11600.00');
  });
  prueba('NO hay deriva de punto flotante: 100 000 sumas de 0.01 dan exactamente 1000.00 en numeric', async () => {
    igual(await v(`(select sum(0.01::numeric) from generate_series(1, 100000))`), '1000.00');
  });
});

describir('interno.pesos (el pesos() del .gs) ', () => {
  const p = n => v(`interno.pesos($1::numeric)`, [n]);
  prueba('miles con coma y dos decimales: $1,234.50, $0.00, $10,000,000.00', async () => {
    igual(await p('1234.5'), '$1,234.50');
    igual(await p('0'), '$0.00');
    igual(await p('10000000'), '$10,000,000.00');
    igual(await p('999.999'), '$1,000.00');
  });
});

describir('hoy_mx y dia_mx: el día de México, no el de GMT', () => {
  const dia = t => v(`interno.dia_mx($1::timestamptz)`, [t]);
  prueba('a las 05:59:59Z todavía es el día anterior en México; a las 06:00:00Z ya es el siguiente (UTC-6 todo el año)', async () => {
    igual(await dia('2026-10-10T05:59:59Z'), '20261009');
    igual(await dia('2026-10-10T06:00:00Z'), '20261010');
    igual(await dia('2026-07-01T05:59:59Z'), '20260630', 'verano: México ya no usa horario de verano');
    igual(await dia('2026-01-01T06:00:00Z'), '20260101');
  });
  prueba('la cuota de IA ya no cambia a las 18:00 hora local (como GMT en el Apps Script): a las 23:59 de México sigue el mismo día', async () => {
    igual(await dia('2026-10-10T17:59:59-06:00'), '20261010');
    igual(await dia('2026-10-10T23:59:59-06:00'), '20261010');
    igual(await dia('2026-10-11T00:00:00-06:00'), '20261011');
  });
  prueba('hoy_mx es una fecha (date) y coincide con el día de México de ahora', async () => {
    const f = (await sql(await base(), `select interno.hoy_mx()::text as h, (select substr(interno.dia_mx(), 1, 4) || '-' || substr(interno.dia_mx(), 5, 2) || '-' || substr(interno.dia_mx(), 7, 2)) as d`))[0];
    igual(f.h, f.d);
  });
});

describir('quién puede ejecutarlas: authenticated y service_role las de la vista; anon, ninguna (R1: la vista las evalúa con los privilegios de quien consulta)', () => {
  prueba('neto, comision y hoy_mx: EXECUTE para authenticated y service_role; pesos y dia_mx: solo el dueño', async () => {
    const db = await base();
    const puede = async (rol, f) => (await sql(db, `select has_function_privilege('${rol}', '${f}', 'EXECUTE') as p`))[0].p;
    for (const f of ['interno.neto(numeric, boolean)', 'interno.comision(numeric)', 'interno.hoy_mx()']) {
      igual([await puede('authenticated', f), await puede('service_role', f), await puede('anon', f)], [true, true, false], f);
    }
    for (const f of ['interno.pesos(numeric)', 'interno.dia_mx(timestamptz)']) {
      igual([await puede('authenticated', f), await puede('service_role', f), await puede('anon', f)], [false, false, false], f);
    }
  });
  prueba('un usuario autenticado sí puede llamar interno.neto (como lo hace la vista) y no interno.pesos', async () => {
    const db = await base(), D = sesionDe(db, db.u.dir);
    igual((await D.query(`select interno.neto(100, true)::text as v`))[0].v, '116.00');
    await esperarError(D.query(`select interno.pesos(1)`), '42501');
    await esperarError(como(db, { rol: 'anon' }).query(`select interno.neto(100, true)`), '42501');
  });
});

await resumen();
