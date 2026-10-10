// Las filas HISTÓRICAS (R2) — A.md §6.6 y §10.8, casos HI-01..HI-07.
//
// Las ≥199 filas de la hoja «Ventas» que no tienen cotización ni obra NO SE PIERDEN: son `proyectos` con `historica = true` y su
// fila de dinero. «Control» (el tablero) las suma con las demás. Aquí se comprueba que ninguna agregación las pierde, que los CHECK
// de la tabla impiden mentir sobre qué es una histórica, y que lo que la hoja marca como «viva» y como «lápida» tampoco se confunde.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, como, sql, rpcT } from '../comun/semilla.js';
import { oraculo, aCentavos } from '../comun/oraculo.js';

const base = dato(async () => { const db = await crearBaseDePruebas(); db.u = await sembrarUsuarios(db); return db; }, { limpiar: db => db.close() });

// 199 históricas + 3 vivas de la hoja + 2 con cotización, con importes de dos decimales para que la suma «directa» sea exacta
const filas = [];
for (let i = 0; i < 199 + 3 + 2; i++) {
  const hist = i < 199, cot = i >= 202;
  const g = `${1000 + (i * 37) % 4000}.${String((i * 13) % 100).padStart(2, '0')}`;
  filas.push({ i, hist, cot, folio: 'V-' + String(1 + i).padStart(3, '0'), g, i_: i % 3 === 0 ? '0' : `${(i * 11) % 900}.50`, j: i % 5 === 0 ? `${(i * 7) % 300}.25` : '0',
               iva: i % 2 === 0, cuenta: i % 2 === 0 ? 'Constru BNT' : 'Elias BBVA', estatus: i % 4 === 0 ? 'LIQUIDADO' : 'COBRANDO',
               abonos: i % 6 === 0 ? [`${(i % 50) + 1}.10`] : [] });
}

describir('HI-01 Control suma TODO, también las 199 históricas', () => {
  prueba('199 históricas + 3 vivas + 2 con cotización: la vista trae 204 filas y cada suma de §6.6 es la suma directa de las filas', async () => {
    const db = await base();
    for (const f of filas) {
      await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, folio_local, dispositivo, fuente, historica, nombre, etapa, estatus, iva, folio_global)
                     values ($1, 'al3d', $2, $2, 'hoja', $3, $4, $5, $6, $7, $8, $9)`,
        ['h' + f.i, f.folio, f.cot ? 'cotizacion' : 'hoja', f.hist, 'Fila ' + f.i, f.hist ? null : 'ganado', f.estatus, f.iva, f.cot ? `COT-${f.i}@K7QM` : null]);
      await sql(db, `insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta, fecha_liquidacion)
                     values ($1, 'al3d', $2::numeric, $3::numeric, $4::numeric, $5, interno.hoy_mx())`, ['h' + f.i, f.g, f.i_, f.j, f.cuenta]);
      for (const a of f.abonos) await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe, fecha) values ('al3d', $1, $2::numeric, interno.hoy_mx())`, [f.folio, a]);
    }
    // §6.6, sobre TODAS las filas del libro
    const c = (await sesionDe(db, db.u.dir).query(`
      select count(*)::int as proyectos_registrados, (count(*) filter (where historica))::int as historicas,
             sum(g_subtotal)::text as venta_subtotal, sum(h_neto)::text as venta_neta, sum(i_anticipo + j_liquidacion)::text as cobrado,
             coalesce(sum(k_saldo) filter (where k_saldo > 0), 0)::text as saldo_por_cobrar, coalesce(-sum(k_saldo) filter (where k_saldo < 0), 0)::text as cobrado_de_mas,
             sum(r_comision)::text as comisiones_generadas, sum(s_abonado)::text as comisiones_pagadas,
             coalesce(sum(t_restante) filter (where t_restante > 0), 0)::text as comisiones_pendientes
        from public.ventas_calculadas where empresa_id = 'al3d'`))[0];
    // la suma «directa»: el oráculo de BigInt sobre las mismas filas
    const o = filas.map(f => ({ f, o: oraculo({ i: f.i, folio: f.folio, g: f.g, i_: f.i_, j: f.j, iva: f.iva, cuenta: f.cuenta, estatus: f.estatus, conFechaLiq: true, abonos: f.abonos }) }));
    const suma = fn => o.reduce((a, x) => a + fn(x), 0n);
    const aC = t => aCentavos(t);
    igual(c.proyectos_registrados, 204);
    igual(c.historicas, 199);
    igual(aC(c.venta_subtotal), suma(x => aC(x.f.g)), 'SUM(G)');
    igual(aC(c.venta_neta), suma(x => x.o.h), 'SUM(H)');
    igual(aC(c.cobrado), suma(x => aC(x.f.i_) + aC(x.f.j)), 'SUM(I)+SUM(J)');
    igual(aC(c.saldo_por_cobrar), suma(x => (x.o.k > 0n ? x.o.k : 0n)), 'SUMIF(K>0)');
    igual(aC(c.cobrado_de_mas), suma(x => (x.o.k < 0n ? -x.o.k : 0n)), 'cobrado de más');
    igual(aC(c.comisiones_generadas), suma(x => x.o.r), 'SUM(R)');
    igual(aC(c.comisiones_pagadas), suma(x => x.o.s), 'SUM(S)');
    igual(aC(c.comisiones_pendientes), suma(x => (x.o.t > 0n ? x.o.t : 0n)), 'SUMIF(T>0)');
    cierto(aC(c.saldo_por_cobrar) > 0n && aC(c.comisiones_pendientes) > 0n, 'la muestra no es trivial');
    // ninguna agregación las pierde: sin las históricas el total sería otro
    const sinHist = (await sesionDe(db, db.u.dir).query(`select count(*)::int as n from public.ventas_calculadas where not historica`))[0].n;
    igual(sinHist, 5);
    // y el cuadre que la fase 2 compara con la hoja trae las MISMAS cuentas (cuadre_hoja, solo service_role)
    const q = (await como(db, { rol: 'service_role' }).rpc('cuadre_hoja', { p_empresa: 'al3d' }))[0].cuadre_hoja;
    const cent = n => BigInt(Math.round(Number(n) * 100));
    igual([q.proyectos.total, q.proyectos.historicas, q.proyectos.vivas, q.proyectos.lapidas, q.proyectos.por_fuente], [204, 199, 5, 0, { hoja: 202, cotizacion: 2 }], 'cuadre_hoja.proyectos.historicas = 199');
    igual([q.ventas.filas, q.invariantes.proyectos_sin_dinero, q.abonos.huerfanos], [204, 0, 0]);
    igual([cent(q.ventas.suma_subtotal), cent(q.ventas.suma_neto), cent(q.ventas.suma_cobrado), cent(q.ventas.suma_saldo_positivo), cent(q.ventas.comisiones_generadas), cent(q.ventas.abonado), cent(q.ventas.comisiones_pendientes)],
          [aC(c.venta_subtotal), aC(c.venta_neta), aC(c.cobrado), aC(c.saldo_por_cobrar), aC(c.comisiones_generadas), aC(c.comisiones_pagadas), aC(c.comisiones_pendientes)], 'cada suma del cuadre es la de la vista');
    igual(q.ventas.n_saldo, o.filter(x => x.o.k > 0n).length, 'n_saldo: las filas con saldo mayor a 0.004');
  }, { tiempo: 180_000 });
});

describir('HI-02 y HI-06 los CHECK de proyectos impiden mentir sobre qué es una histórica y una lápida', () => {
  const S = db => como(db, { rol: 'service_role' });
  const intento = async (consulta, params = []) => (await S(await base()).intentar(consulta, params)).error?.codigo ?? 'ok';
  prueba('HI-02 histórica con folio_global, con origen_obra, con fuente distinta de «hoja» o sin folio_hoja → check_violation (23514)', async () => {
    const ins = (cols, vals) => `insert into public.proyectos (id, empresa_id, nombre, historica, ${cols}) values ('hx', 'al3d', 'Histórica mala', true, ${vals})`;
    igual(await intento(ins(`folio_hoja, fuente, folio_global`, `'V-900', 'hoja', 'COT-1@K7QM'`)), '23514');
    igual(await intento(ins(`folio_hoja, fuente, origen_obra`, `'V-901', 'hoja', '{"proy": "x", "items": []}'::jsonb`)), '23514');
    igual(await intento(ins(`folio_hoja, fuente`, `'V-902', 'manual'`)), '23514');
    igual(await intento(ins(`folio_hoja, fuente`, `'V-903', 'cotizacion'`)), '23514');
    igual(await intento(ins(`fuente`, `'hoja'`)), '23514');
    igual(await intento(`insert into public.proyectos (id, empresa_id, nombre, historica, folio_hoja, fuente) values ('hy', 'al3d', 'Histórica buena', true, 'V-904', 'hoja')`), 'ok');
  });
  prueba('HI-02 una fecha de instalación heredada solo cabe en una histórica', async () => {
    igual(await intento(`insert into public.proyectos (id, empresa_id, nombre, etapa, folio_hoja, fuente, fecha_instalacion_hist) values ('hz', 'al3d', 'Viva', 'ganado', 'V-905', 'hoja', '2024-01-01')`), '23514');
  });
  prueba('HI-06 una fila sin folio_hoja que no sea lápida → check_violation; la lápida (cotización cancelada) sí entra y no sale en la vista', async () => {
    igual(await intento(`insert into public.proyectos (id, empresa_id, nombre, etapa, fuente) values ('hw', 'al3d', 'Sin folio', 'ganado', 'hoja')`), '23514');
    igual(await intento(`insert into public.proyectos (id, empresa_id, nombre, etapa, fuente, folio_global) values ('hv', 'al3d', 'Sin folio', 'ganado', 'cotizacion', 'COT-9@K7QM')`), '23514', 'una cotización sin folio de hoja SOLO puede ser lápida (cancelado)');
    const db = await base();
    await sql(db, `insert into public.proyectos (id, empresa_id, nombre, etapa, fuente, folio_global) values ('lap1', 'al3d', 'Lápida', 'cancelado', 'cotizacion', 'COT-10@K7QM')`);
    igual((await sesionDe(db, db.u.dir).query(`select count(*)::int as n from public.ventas_calculadas where proyecto_id = 'lap1'`))[0].n, 0);
    igual((await sesionDe(db, db.u.fab).query(`select count(*)::int as n from public.proyectos where id = 'lap1'`))[0].n, 1, 'pero Fabricación sí la lee de proyectos');
  });
  prueba('HI-06 una lápida no puede tener fila de dinero (trigger ventas_dinero_libro) ni ser una venta', async () => {
    const db = await base();
    await esperarError(S(db).query(`insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal) values ('lap1', 'al3d', 100)`), '23514');
  });
  prueba('un proyecto de cotización exige su folio_global; una cotización con etapa distinta de cancelado exige folio_hoja', async () => {
    igual(await intento(`insert into public.proyectos (id, empresa_id, nombre, etapa, fuente, folio_hoja) values ('ha', 'al3d', 'Sin folio global', 'ganado', 'cotizacion', 'V-906')`), '23514');
  });
});

describir('HI-03 y HI-05 la fecha heredada alimenta la antigüedad; la tarjeta viva de la hoja', () => {
  prueba('HI-03 una histórica con fecha_instalacion_hist = D−70 y saldo: la antigüedad (P) cuenta desde esa fecha', async () => {
    const db = await base();
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, historica, nombre, estatus, iva, fecha_anticipo, fecha_instalacion_hist)
                   values ('hh3', 'al3d', 'V-950', 'hoja', true, 'Histórica con cita', 'COBRANDO', false, interno.hoy_mx() - 200, interno.hoy_mx() - 70)`);
    await sql(db, `insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, cuenta) values ('hh3', 'al3d', 1000, 'Elias BBVA')`);
    const f = (await sesionDe(db, db.u.pag).query(`select p_dias as p, q_antiguedad as q, m_fecha_instalacion::text = (interno.hoy_mx() - 70)::text as m from public.ventas_calculadas where proyecto_id = 'hh3'`))[0];
    igual([f.p, f.q, f.m], [70, '61-90 días', true]);
  });
  prueba('HI-05 una tarjeta viva de la hoja (FABRICACION, sin cotización): fuente «hoja», historica = false, y necesita etapa (el importador la deja en «ganado»)', async () => {
    const db = await base();
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa, estatus) values ('hv5', 'al3d', 'V-951', 'hoja', 'Tarjeta viva', 'ganado', 'FABRICACION')`);
    igual((await sql(db, `select fuente, historica, etapa from public.proyectos where id = 'hv5'`))[0], { fuente: 'hoja', historica: false, etapa: 'ganado' });
    await esperarError(sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, estatus) values ('hv6', 'al3d', 'V-952', 'hoja', 'Sin etapa', 'FABRICACION')`), '23514');
  });
});

describir('HI-07 la transición automática 2 (cobro ⇒ instalado) no toca a una histórica', () => {
  prueba('HI-07 un cobro sobre una histórica deja su estatus LIQUIDADO y NO le inventa etapa (ni evento de etapa); sobre una tarjeta viva importada sí la pasa a «instalado» (contraprueba)', async () => {
    const db = await base();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const h = await rpcT(t, 'registrar_cobro', { p_proyecto: 'h1', p_monto: 10 });
      const v = await rpcT(t, 'registrar_cobro', { p_proyecto: 'h201', p_monto: 10 });
      return { h, v, hist: (await t.query(`select etapa, estatus, historica from public.proyectos where id = 'h1'`))[0], viva: (await t.query(`select etapa, estatus, historica from public.proyectos where id = 'h201'`))[0],
               eventos: (await t.query(`select entidad_id, accion from public.bitacora where accion = 'etapa' order by entidad_id`)) };
    });
    igual([x.h.ok, x.hist.historica, x.hist.etapa, x.hist.estatus], [true, true, null, 'LIQUIDADO']);
    igual([x.v.ok, x.viva.historica, x.viva.etapa, x.viva.estatus], [true, false, 'instalado', 'LIQUIDADO']);
    igual(x.eventos.map(e => e.entidad_id), ['h201'], 'solo la viva generó un evento de etapa');
  });
});

await resumen();
