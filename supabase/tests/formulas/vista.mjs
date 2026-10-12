// La vista `ventas_calculadas` (H, K, O, P, Q, R, S, T, U, V, W, X) y `comisiones_pendientes` — A.md §6.4, casos FM-01..FM-33.
// (FM-34, la prueba diferencial de 20 000 filas, está en diferencial.mjs; FM-35, el cuadre contra la hoja VIVA, no se puede
// correr aquí: ver «no verificado» en supabase/migrations/README.md.)
//
// Cada caso construye su fila con SQL directo (como el importador: superusuario), consulta la vista como DIRECCIÓN y compara
// IGUALDAD EXACTA de texto (`numeric`, sin tolerancia) contra el valor calculado a mano. «D» = `interno.hoy_mx()` leído de la
// propia base: las fechas son relativas, así no hay reloj que simular.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, como, sql } from '../comun/semilla.js';

const base = dato(async () => { const db = await crearBaseDePruebas(); db.u = await sembrarUsuarios(db); return db; }, { limpiar: db => db.close() });

let contador = 0;
/**
 * Crea una venta del libro: proyecto + ventas_dinero (+ cita + abonos) y devuelve su folio.
 *   sub, iva, cuenta, estatus, anti, liq     el dinero y su etiqueta
 *   l, m, n                                  días respecto a D de fecha_anticipo (L), de la cita (M) y de la fecha de liquidación (N); null = vacío
 *   lFija                                    fecha_anticipo literal ('2026-10-08')
 *   abonos                                   importes de «Abonos comisión» (con tipo 'abono' o 'correccion' si son negativos)
 *   hist, histM                              fila histórica y su fecha de instalación heredada (días respecto a D)
 */
async function venta(db, o = {}) {
  const k = ++contador, folio = 'V-' + String(1000 + k), id = 'fm' + k;
  const c = { sub: 0, iva: true, cuenta: null, estatus: 'COBRANDO', anti: 0, liq: 0, l: null, m: null, n: null, abonos: [], ...o };
  const dias = d => (d === null || d === undefined ? 'null' : `(interno.hoy_mx() + ${Number(d)})`);
  await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, folio_local, dispositivo, fuente, historica, nombre, etapa, estatus, iva, fecha_anticipo, fecha_instalacion_hist)
                 values ($1, 'al3d', $2, $2, 'hoja', 'hoja', $3, $4, $5, $6, $7, ${c.lFija ? `'${c.lFija}'::date` : dias(c.l)}, ${c.hist ? dias(c.histM) : 'null'})`,
    [id, folio, !!c.hist, 'Proyecto ' + folio, c.hist ? null : 'ganado', c.estatus, c.iva]);
  await sql(db, `insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta, fecha_liquidacion)
                 values ($1, 'al3d', $2::numeric, $3::numeric, $4::numeric, $5, ${dias(c.n)})`, [id, c.sub, c.anti, c.liq, c.cuenta]);
  if (c.m !== null && c.m !== undefined && !c.hist) {
    await sql(db, `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics) values ($1, 'al3d', $2, ${dias(c.m)}, 'confirmada', $3)`,
      ['i' + id, id, `inst-i${id}@al3d.mx`]);
  }
  for (const imp of c.abonos) {
    await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe, fecha, tipo) values ('al3d', $1, $2::numeric, interno.hoy_mx(), $3)`,
      [folio, imp, Number(imp) < 0 ? 'correccion' : 'abono']);
  }
  return folio;
}

/** La fila de la vista como Dirección, con los números como TEXTO exacto. */
async function fila(db, folio, quien = 'dir') {
  const f = await sesionDe(db, db.u[quien]).query(
    `select a_folio, h_neto::text as h, k_saldo::text as k, r_comision::text as r, s_abonado::text as s, t_restante::text as t, u_pagos as u,
            o_dias_cobro as o, p_dias as p, q_antiguedad as q, v_anio as v, w_mes as w, x_revisar as x, f_iva, d_cuenta
       from public.ventas_calculadas where a_folio = $1`, [folio]);
  return f[0] ?? null;
}
const esperar = async (o, esperado, db) => {
  db ??= await base();
  const f = await fila(db, await venta(db, o));
  for (const [campo, valor] of Object.entries(esperado)) igual(f[campo], valor, `${JSON.stringify(o)} → ${campo}`);
  return f;
};

describir('FM-01..FM-07 ventas con y sin IVA, centavos en 5 y H ≠ total impreso', () => {
  prueba('FM-01 venta con IVA: G=10000, Constru BNT, COBRANDO, I=5800, L=D−40', () =>
    esperar({ sub: 10000, iva: true, cuenta: 'Constru BNT', estatus: 'COBRANDO', anti: 5800, l: -40 },
            { h: '11600.00', k: '5800.00', r: '1000.00', s: '0', t: '1000.00', u: 0, p: 40, q: '31-60 días', x: '' }));
  prueba('FM-02 venta sin IVA: G=10000, Elias BBVA', () =>
    esperar({ sub: 10000, iva: false, cuenta: 'Elias BBVA' }, { h: '10000.00', k: '10000.00', x: '' }));
  prueba('FM-03 centavos en 5 (empate de comisión): G=1.45 → R=0.15, H=1.68, K=1.68, T=0.15', () =>
    esperar({ sub: '1.45', iva: true }, { r: '0.15', h: '1.68', k: '1.68', t: '0.15' }));
  prueba('FM-04 G=2.35 → R=0.24, H=2.73', () => esperar({ sub: '2.35', iva: true }, { r: '0.24', h: '2.73' }));
  prueba('FM-05 G=0.05 → R=0.01, H=0.06', () => esperar({ sub: '0.05', iva: true }, { r: '0.01', h: '0.06' }));
  prueba('FM-06 subtotal negativo: G=−1.45 con IVA → R=−0.15, H=−1.68, K=−1.68, X «Cobrado de más»', () =>
    esperar({ sub: '-1.45', iva: true }, { r: '-0.15', h: '-1.68', k: '-1.68', x: 'Cobrado de más' }));
  prueba('FM-07 H no es el total impreso: G=4310.34, I=5000 → H=4999.99, K=−0.01, X «Cobrado de más»', () =>
    esperar({ sub: '4310.34', iva: true, anti: 5000 }, { h: '4999.99', k: '-0.01', x: 'Cobrado de más' }));
});

describir('FM-08..FM-14 las banderas de la columna X', () => {
  prueba('FM-08 LIQUIDADO con saldo: G=1000, I=500, J=100, N=D−1 → H=1160.00, K=560.00, X «Liquidado con saldo»', () =>
    esperar({ sub: 1000, iva: true, cuenta: 'Constru BNT', estatus: 'LIQUIDADO', anti: 500, liq: 100, n: -1 }, { h: '1160.00', k: '560.00', x: 'Liquidado con saldo' }));
  prueba('FM-09 LIQUIDADO sin fecha de liquidación: K=0.00, X «Falta fecha de liquidación»', () =>
    esperar({ sub: 1000, iva: true, cuenta: 'Constru BNT', estatus: 'LIQUIDADO', anti: 1160, n: null }, { k: '0.00', x: 'Falta fecha de liquidación' }));
  prueba('FM-10 cobrado de más: G=1000, I=1000, J=200 → K=−40.00, X «Cobrado de más»', () =>
    esperar({ sub: 1000, iva: true, cuenta: 'Constru BNT', anti: 1000, liq: 200 }, { k: '-40.00', x: 'Cobrado de más' }));
  prueba('FM-11 comisión pagada de más: G=1000, I=1160, abono 150 → S=150, T=−50.00, U=1, X «Comisión pagada de más»', () =>
    esperar({ sub: 1000, iva: true, cuenta: 'Constru BNT', anti: 1160, abonos: ['150'] }, { s: '150', t: '-50.00', u: 1, x: 'Comisión pagada de más' }));
  prueba('FM-12 IVA no corresponde (Elias BBVA no factura y la fila trae IVA): precede a las demás banderas aunque K<0', () =>
    esperar({ sub: 1000, iva: true, cuenta: 'Elias BBVA', anti: 5000 }, { k: '-3840.00', x: 'IVA no corresponde a la cuenta' }));
  prueba('FM-13 IVA no corresponde (inverso): Rul HSBC factura y la fila no trae IVA', () =>
    esperar({ sub: 1000, iva: false, cuenta: 'Rul HSBC' }, { x: 'IVA no corresponde a la cuenta' }));
  prueba('FM-14 sin cuenta no hay bandera de IVA (con IVA o sin él)', async () => {
    const db = await base();
    await esperar({ sub: 1000, iva: false, cuenta: null }, { x: '' }, db);
    await esperar({ sub: 1000, iva: true, cuenta: null }, { x: '' }, db);
  });
  prueba('FM-32 orden de X: gana la PRIMERA de la lista cuando la fila cumple varias', async () => {
    const db = await base();
    await esperar({ sub: 1000, iva: true, cuenta: 'Elias BBVA', estatus: 'LIQUIDADO', anti: 5000, abonos: ['500'] }, { x: 'IVA no corresponde a la cuenta' }, db);   // IVA + cobrado de más + comisión de más + liquidado
    await esperar({ sub: 1000, iva: true, cuenta: 'Constru BNT', anti: 5000, abonos: ['500'] }, { k: '-3840.00', t: '-400.00', x: 'Cobrado de más' }, db);          // cobrado de más antes que comisión de más
    await esperar({ sub: 1000, iva: true, cuenta: 'Constru BNT', estatus: 'LIQUIDADO', anti: 100, abonos: ['500'] }, { t: '-400.00', x: 'Comisión pagada de más' }, db); // comisión de más antes que liquidado con saldo
    await esperar({ sub: 1000, iva: true, cuenta: 'Constru BNT', estatus: 'LIQUIDADO', anti: 100 }, { x: 'Liquidado con saldo' }, db);                                 // liquidado con saldo (sin fecha) antes que falta fecha
  });
});

describir('FM-15..FM-17 subtotal cero, negativo con IVA e importes sin escala', () => {
  prueba('FM-15 subtotal 0 → H=0.00, R=0.00', () => esperar({ sub: 0 }, { h: '0.00', r: '0.00' }));
  prueba('FM-16 G=−500 con IVA → H=−580.00, R=−50.00', () => esperar({ sub: -500, iva: true }, { h: '-580.00', r: '-50.00' }));
  prueba('FM-17 importes SIN escala: G=100.005, I=0.001, J=0.002 → H=116.01, R=10.00, K=116.01', () =>
    esperar({ sub: '100.005', iva: true, anti: '0.001', liq: '0.002' }, { h: '116.01', r: '10.00', k: '116.01' }));
});

describir('FM-18..FM-23 la antigüedad del saldo (P y Q)', () => {
  prueba('FM-18 los seis cubos: M=D−30/−31/−60/−61/−90/−91 con K>0, COBRANDO, L=D−100', async () => {
    const db = await base();
    const casos = [[-30, 30, '0-30 días'], [-31, 31, '31-60 días'], [-60, 60, '31-60 días'], [-61, 61, '61-90 días'], [-90, 90, '61-90 días'], [-91, 91, 'Más de 90 días']];
    for (const [m, p, q] of casos) await esperar({ sub: 1000, iva: false, cuenta: 'Elias BBVA', estatus: 'COBRANDO', l: -100, m }, { p, q }, db);
  });
  prueba('FM-19 instalación futura: M=D+5 → P=−5, Q=«0-30 días»', () =>
    esperar({ sub: 1000, iva: false, cuenta: 'Elias BBVA', l: -100, m: 5 }, { p: -5, q: '0-30 días' }));
  prueba('FM-20 sin instalación: la antigüedad cuenta desde el anticipo (L=D−45 → P=45)', () =>
    esperar({ sub: 1000, iva: false, cuenta: 'Elias BBVA', l: -45, m: null }, { p: 45, q: '31-60 días' }));
  prueba('FM-21 sin fecha de anticipo y con saldo: P y Q nulos (no entra a ningún cubo aunque deba)', () =>
    esperar({ sub: 1000, iva: false, cuenta: 'Elias BBVA', l: null }, { p: null, q: null }));
  prueba('FM-22 estatus FABRICACION no vence aunque haya saldo', () =>
    esperar({ sub: 1000, iva: false, cuenta: 'Elias BBVA', estatus: 'FABRICACION', l: -50 }, { p: null, q: null }));
  prueba('FM-23 saldo mínimo: G=0.01 sin IVA → K=0.01 (> 0.004) y P definido; saldo 0.00 → P nulo', async () => {
    const db = await base();
    await esperar({ sub: '0.01', iva: false, cuenta: 'Elias BBVA', l: -10 }, { k: '0.01', p: 10 }, db);
    await esperar({ sub: '0.01', iva: false, cuenta: 'Elias BBVA', l: -10, anti: '0.01' }, { k: '0.00', p: null }, db);
  });
});

describir('FM-24 y FM-25 días de cobro, año y mes', () => {
  prueba('FM-24 O = N − L (12 días) y nulo si falta N', async () => {
    const db = await base();
    await esperar({ sub: 1000, iva: false, cuenta: 'Elias BBVA', l: -20, n: -8 }, { o: 12 }, db);
    await esperar({ sub: 1000, iva: false, cuenta: 'Elias BBVA', l: -20, n: null }, { o: null }, db);
  });
  prueba('FM-25 V y W salen de L (2026-10-08 → 2026 y «2026-10»); sin L, nulos', async () => {
    const db = await base();
    await esperar({ sub: 1, lFija: '2026-10-08' }, { v: 2026, w: '2026-10' }, db);
    await esperar({ sub: 1, l: null }, { v: null, w: null }, db);
  });
});

describir('FM-26 y FM-27 abonos de comisión', () => {
  prueba('FM-26 G=10000 (R=1000.00), abonos 100.00, 200.00, 50.55 → S=350.55, U=3, T=649.45; con una corrección de −50 → S=300.55, U=4, T=699.45', async () => {
    const db = await base();
    await esperar({ sub: 10000, iva: false, cuenta: 'Elias BBVA', abonos: ['100.00', '200.00', '50.55'] }, { r: '1000.00', s: '350.55', u: 3, t: '649.45' }, db);
    await esperar({ sub: 10000, iva: false, cuenta: 'Elias BBVA', abonos: ['100.00', '200.00', '50.55', '-50'] }, { s: '300.55', u: 4, t: '699.45' }, db);
  });
  prueba('FM-27 un abono de un folio inexistente no suma en ningún S, pero sí en comisiones_cobradas (suma SIN filtro de folio)', async () => {
    const db = await base();
    await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe, fecha, tipo) values ('al3d', 'V-9999', 77.70, interno.hoy_mx(), 'abono')`);
    const sumaEnVista = (await sql(db, `select coalesce(sum(s_abonado), 0)::text as s from public.ventas_calculadas where a_folio = 'V-9999'`))[0].s;
    igual(sumaEnVista, '0');
    const r = (await sesionDe(db, db.u.dir).rpc('comisiones_cobradas', { p_desde: '2000-01-01', p_hasta: '2999-12-31' }))[0].comisiones_cobradas;
    cierto(Number(r.cobrado) >= 77.7, 'el cobrado incluye el abono huérfano: ' + r.cobrado);
  });
});

describir('FM-28 y FM-29 folio repetido, lápida y borrado lógico', () => {
  prueba('FM-28 un segundo proyecto con el mismo folio_hoja viola el UNIQUE (la bandera «Folio repetido» queda inalcanzable)', async () => {
    const db = await base();
    const folio = await venta(db, { sub: 1 });
    await esperarError(sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa) values ('dup', 'al3d', $1, 'hoja', 'Repetido', 'ganado')`, [folio]), '23505');
  });
  prueba('FM-29 una lápida (sin folio) y un proyecto con deleted_at no aparecen en la vista', async () => {
    const db = await base();
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_global, fuente, nombre, etapa) values ('lap', 'al3d', 'COT-0900@K7QM', 'cotizacion', 'Lápida', 'cancelado')`);
    const folio = await venta(db, { sub: 5 });
    igual((await fila(db, folio)).a_folio, folio, 'antes de borrarlo, aparece');
    await sql(db, `update public.proyectos set deleted_at = now() where folio_hoja = $1`, [folio]);
    igual(await fila(db, folio), null, 'con deleted_at ya no');
    igual((await sesionDe(db, db.u.dir).query(`select count(*)::int as n from public.ventas_calculadas where b_proyecto = 'Lápida' or proyecto_id = 'lap'`))[0].n, 0);
  });
});

describir('FM-30 y FM-31 históricas y comisiones pendientes', () => {
  prueba('FM-30 una histórica: aparece; la antigüedad sale de la fecha heredada (D−70 → P=70, Q=«61-90 días»)', () =>
    esperar({ sub: 1000, iva: false, cuenta: 'Elias BBVA', hist: true, histM: -70, l: -200 }, { p: 70, q: '61-90 días' }));
  prueba('FM-31 comisiones_pendientes: T=0.00 no entra; T=0.01 sí (T > 0.004); T=0.004 se redondea a 0.00 y tampoco entra', async () => {
    const db = await base();
    const f0 = await venta(db, { sub: 1000, abonos: ['100'] }), f1 = await venta(db, { sub: 1000, abonos: ['99.99'] }), f4 = await venta(db, { sub: 1000, abonos: ['99.996'] });
    const D = sesionDe(db, db.u.dir);
    const pend = async f => (await D.query(`select pend::text as p from public.comisiones_pendientes where folio = $1`, [f]))[0]?.p ?? null;
    igual([await pend(f0), await pend(f1), await pend(f4)], [null, '0.01', null]);
  });
});

describir('FM-33 Fabricación no ve ni una fila', () => {
  prueba('la misma consulta como Fabricación: 0 filas; como Pagos, la misma fila que Dirección', async () => {
    const db = await base();
    const folio = await venta(db, { sub: 1000, iva: true, cuenta: 'Constru BNT', anti: 100 });
    igual(await fila(db, folio, 'fab'), null);
    igual(await fila(db, folio, 'pag'), await fila(db, folio, 'dir'));
    cierto((await fila(db, folio, 'pag')) !== null);
  });
  prueba('la vista no se salta la RLS: security_invoker = true', async () => {
    const db = await base();
    const o = await sql(db, `select c.relname, coalesce(c.reloptions::text, '') as o from pg_class c where c.relname in ('ventas_calculadas', 'comisiones_pendientes') order by 1`);
    for (const v of o) cierto(/security_invoker=true/.test(v.o), v.relname + ': ' + v.o);
  });
});

await resumen();
