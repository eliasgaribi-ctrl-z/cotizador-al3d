// R1 — Fabricación no lee NINGÚN dinero por ninguna vía — A.md §10.4 (parte de las tablas y las vistas; las vías por RPC
// están en obra-y-etapas/, pagos/, almacen/ y notario/, que son quienes tienen esas RPC).
//
// Vías que se cierran aquí (§4.6): la TABLA (sin política para Fabricación), la VISTA (JOIN interno + security_invoker), el
// EMBEDDING de PostgREST (la política se aplica a la tabla embebida), la COPIA CONGELADA de la cotización (`origen_obra` sin
// precios y con el doble candado del CHECK) y las políticas que Realtime evalúa (RL-15/R1-15).
// La contraprueba (R1-18) es que Pagos SÍ lee todo eso: la política no es «cerrar todo».
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, contar, como, sql, ORIGEN_COMPLETO } from '../comun/semilla.js';

const base = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  return db;
}, { limpiar: db => db.close() });

// las claves que son dinero (la denylist de interno.contiene_dinero): no deben aparecer en NINGÚN nivel de lo que ve Fabricación
const CLAVES_DE_DINERO = ['tarifa', 'pu', '_lt', 'precioauth', 'neto', 'sub', 'anti', 'antimanual', 'itemsauth', 'huellaauth', 'sello', 'autorizador',
                          'fechaauth', 'nota', 'total', 'importe', 'precio', 'costo', 'subtotal', 'anticipo', 'liquidacion', 'comision', 'saldo'];
const clavesDe = (v, acc = []) => {
  if (Array.isArray(v)) v.forEach(x => clavesDe(x, acc));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { acc.push(k); clavesDe(x, acc); }
  return acc;
};

describir('R1-01 a R1-03 las tablas de dinero no le llegan a Fabricación (y a Pagos y Dirección sí: R1-18)', () => {
  for (const tabla of ['ventas_dinero', 'abonos']) {
    prueba(`${tabla}: Fabricación 0 filas; Dirección y Pagos todas`, async () => {
      const db = await base();
      const n = { dir: await contar(sesionDe(db, db.u.dir), tabla), pag: await contar(sesionDe(db, db.u.pag), tabla), fab: await contar(sesionDe(db, db.u.fab), tabla) };
      cierto(n.dir > 0, tabla + ' debe tener filas');
      igual(n, { dir: n.dir, pag: n.dir, fab: 0 });
    });
  }
  prueba('R1-02: ventas_calculadas y comisiones_pendientes: 0 filas para Fabricación, aun con count(*) y agregados (nulos)', async () => {
    const db = await base(), F = sesionDe(db, db.u.fab);
    for (const v of ['ventas_calculadas', 'comisiones_pendientes']) {
      igual(await contar(F, v), 0, v);
    }
    const a = (await F.query(`select count(*)::int as n, sum(g_subtotal) as s, sum(h_neto) as h, sum(t_restante) as t from public.ventas_calculadas`))[0];
    igual(a, { n: 0, s: null, h: null, t: null });
    const p = (await F.query(`select count(*)::int as n, sum(pend) as s from public.comisiones_pendientes`))[0];
    igual(p, { n: 0, s: null });
  });
  prueba('R1-18: Pagos y Dirección leen ventas_calculadas y comisiones_pendientes completas (la política no es «cerrar todo»)', async () => {
    const db = await base();
    for (const k of ['dir', 'pag']) {
      igual(await contar(sesionDe(db, db.u[k]), 'ventas_calculadas'), 5, k);
      igual(await contar(sesionDe(db, db.u[k]), 'comisiones_pendientes'), 5, k);
    }
  });
  prueba('Fabricación tampoco ve el dinero por SELECT directo de columnas (no hay política: ni una fila) ni por una subconsulta', async () => {
    const db = await base(), F = sesionDe(db, db.u.fab);
    igual((await F.query(`select subtotal, anticipo, cuenta from public.ventas_dinero`)), []);
    igual((await F.query(`select p.id from public.proyectos p where exists (select 1 from public.ventas_dinero v where v.proyecto_id = p.id)`)), []);
    igual((await F.query(`select coalesce(sum(subtotal), 0)::int as s from public.ventas_dinero`))[0].s, 0);
  });
});

describir('R1-08 el embedding de PostgREST (proyectos + ventas_dinero) aplica la RLS a la tabla embebida', () => {
  // PostgREST arma `select p.*, (select json_agg(v) from ventas_dinero v where v.proyecto_id = p.id) …` con los privilegios del que consulta
  const embebido = `select p.id, (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.ventas_dinero v where v.proyecto_id = p.id) as ventas_dinero,
                           (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.abonos a where a.folio_hoja = p.folio_hoja) as abonos
                      from public.proyectos p order by p.id`;
  prueba('Fabricación recibe los proyectos con la parte de dinero y de abonos VACÍAS', async () => {
    const db = await base();
    const filas = await sesionDe(db, db.u.fab).query(embebido);
    igual(filas.length, 6);
    for (const f of filas) igual([f.ventas_dinero, f.abonos], [[], []], f.id);
  });
  prueba('R1-18: Pagos y Dirección reciben la parte de dinero de cada venta (p1 trae su fila y sus 2 abonos)', async () => {
    const db = await base();
    for (const k of ['dir', 'pag']) {
      const p1 = (await sesionDe(db, db.u[k]).query(embebido)).find(f => f.id === 'p1');
      igual([p1.ventas_dinero.length, p1.abonos.length], [1, 2], k);
      igual(p1.ventas_dinero[0].cuenta, 'Constru BNT');
    }
  });
});

describir('R1-04 y R1-05 origen_obra: la copia congelada de la cotización, SIN precios', () => {
  prueba('R1-04: lo que lee Fabricación de origen_obra no trae NINGUNA clave de dinero en ningún nivel; sí items sin importes, caja_forma y aiFile {name,type}', async () => {
    const db = await base();
    const o = (await sesionDe(db, db.u.fab).query(`select origen_obra from public.proyectos where id = 'p1'`))[0].origen_obra;
    const prohibidas = clavesDe(o).filter(k => CLAVES_DE_DINERO.includes(k.toLowerCase()));
    igual(prohibidas, [], 'claves de dinero que se colaron');
    igual(o.items.length, 2);
    igual(o.items.map(i => i.id), [1, 2]);
    igual(o.items[1].caja_forma, 'std', 'caja_forma la calcula el cliente y se conserva');
    igual(o.aiFile, { name: 'a.png', type: 'image/png' }, 'aiFile sin url');
    igual(o.proy, 'Tacos Don Juan');
    cierto(o.items[0].opciones.lista.every(x => !('precioOpcion' in x)), 'ni el precio de la opción');
    cierto(!clavesDe(o.items[0].opciones).some(k => ['pu', 'tarifa'].includes(k)), 'las opciones llegan filtradas');
  });
  prueba('R1-04: el dinero que se quitó SÍ se conserva, en la parte restringida (ventas_dinero.origen_dinero) que solo ven Dirección y Pagos', async () => {
    const db = await base();
    const d = (await sesionDe(db, db.u.pag).query(`select origen_dinero from public.ventas_dinero where proyecto_id = 'p1'`))[0].origen_dinero;
    igual([d.precioAuth, d.neto, d.sub, d.anti, d.huellaAuth], [6000, 6960, 6000, 3000, 'h1']);
    igual(d.items['1'].tarifa, 3900);
    igual(d.items['1'].pu, 1500);
    igual(d.items['2']._lt, 1800);
    igual(await contar(sesionDe(db, db.u.fab), 'ventas_dinero'), 0);
  });
  prueba('R1-05: el CHECK rechaza un precio en origen_obra, también para service_role (el camino del importador): en la raíz, en una partida y anidado en opciones', async () => {
    const db = await base(), S = como(db, { rol: 'service_role' });
    for (const malo of [{ items: [{ id: 1, pu: 100 }] }, { precioAuth: 1 }, { items: [{ id: 1, opciones: { lista: [{ k: 'a', d: { tarifa: 3900 } }] } }] },
                        { x: [{ y: { Neto: 5 } }] }, { SUBTOTAL: 1 }]) {
      await esperarError(S.query(`update public.proyectos set origen_obra = $1::jsonb where id = 'p1'`, [JSON.stringify(malo)]), '23514');
    }
    // contraprueba: una obra limpia sí entra
    const r = await S.transaccion(async t => {
      await t.query(`update public.proyectos set origen_obra = '{"proy": "X", "items": [{"id": 1, "altura": 30}]}'::jsonb where id = 'p1'`);
      return (await t.query(`select origen_obra->>'proy' as p from public.proyectos where id = 'p1'`))[0].p;
    });
    igual(r, 'X');
  });
  prueba('el origen completo de la semilla viaja con todas sus claves de dinero a ventas_dinero.origen_dinero y NO queda ninguna en origen_obra', async () => {
    const db = await base();
    const fila = (await sql(db, `select p.origen_obra, d.origen_dinero from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id where p.id = 'p1'`))[0];
    const enObra = clavesDe(fila.origen_obra).map(k => k.toLowerCase());
    for (const k of ['precioauth', 'itemsauth', 'huellaauth', 'sello', 'autorizador', 'tarifa', 'pu', '_lt']) cierto(!enObra.includes(k), k + ' no debe estar en la obra');
    for (const k of Object.keys(ORIGEN_COMPLETO).filter(k => ['precioAuth', 'neto', 'sub', 'anti', 'itemsAuth', 'huellaAuth', 'sello', 'autorizador', 'fechaAuth', 'nota'].includes(k))) {
      cierto(k in fila.origen_dinero, k + ' debe conservarse en el dinero');
    }
  });
});

describir('RL-15 / R1-15 la política de SELECT que evalúa Realtime no deja pasar a Fabricación', () => {
  prueba('para ventas_dinero y abonos la política de SELECT no incluye a Fabricación: simulada como esa persona, 0 filas', async () => {
    const db = await base(), F = sesionDe(db, db.u.fab);
    for (const t of ['ventas_dinero', 'abonos']) igual(await contar(F, t), 0, t);
    const pol = await sql(db, `select polname, pg_get_expr(polqual, polrelid) as cond from pg_policy where polrelid = 'public.ventas_dinero'::regclass`);
    igual(pol.map(p => p.polname), ['ventas_dinero_sel_dir_pag']);
    cierto(/direccion/.test(pol[0].cond) && /pagos/.test(pol[0].cond) && !/fabricacion/.test(pol[0].cond), 'la condición es solo {direccion, pagos}: ' + pol[0].cond);
  });
});

describir('HI-04 Fabricación lee los proyectos históricos (sin dinero) y 0 de la vista', () => {
  prueba('lee la histórica y la lápida de proyectos; ni un renglón de ventas_calculadas', async () => {
    const db = await base(), F = sesionDe(db, db.u.fab);
    igual((await F.query(`select id from public.proyectos where historica or folio_hoja is null order by id`)).map(r => r.id), ['p5', 'p6']);
    igual(await contar(F, 'ventas_calculadas'), 0);
  });
});

describir('MT-04 y MT-05 multiempresa a nivel de datos (service_role)', () => {
  prueba('MT-04: una instalación de la empresa «otra» que apunta a un proyecto de al3d viola la FK compuesta', async () => {
    const db = await base(), S = como(db, { rol: 'service_role' });
    await esperarError(S.query(`insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics) values ('x1', 'otra', 'p2', '2026-11-01', 'propuesta', 'inst-x1@al3d.mx')`), '23503');   // p2 no tiene cita viva: solo la FK puede cortarlo
  });
  prueba('MT-04: lo mismo con ventas_dinero (otra empresa sobre un proyecto de al3d): lo corta el trigger del libro antes que la FK', async () => {
    const db = await base(), S = como(db, { rol: 'service_role' });
    await esperarError(S.query(`insert into public.ventas_dinero (proyecto_id, empresa_id) values ('p1', 'otra')`), '23514');
  });
  prueba('MT-05: el mismo folio_hoja en DOS empresas se permite; dos veces en la misma, unique_violation', async () => {
    const db = await base(), S = como(db, { rol: 'service_role' });
    const r = await S.transaccion(async t => {
      await t.query(`insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa) values ('o1', 'otra', 'V-001', 'hoja', 'En otra', 'ganado')`);
      const dup = await t.intentar(`insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa) values ('o2', 'otra', 'V-001', 'hoja', 'Repetido', 'ganado')`);
      return dup.error.codigo;
    });
    igual(r, '23505');
  });
});

await resumen();
