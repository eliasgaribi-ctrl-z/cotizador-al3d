// Plazos de conservación — migración 0016_plazos.sql (decididos por Elías el 2026-10-16, docs/DECISIONES-SUPABASE.md).
//
//   · PZ-01…PZ-07  cotizaciones NO ganadas: se borran a los 8 meses de su última actividad (con sus solicitudes y su lápida); lo
//                  ganado o con sello NO se toca nunca;
//   · PZ-10…PZ-12  bitácora: 1 año; el borde exacto; sigue sin poder editarse;
//   · PZ-20…PZ-24  lo borrado en la app (deleted_at): 30 días; lo protegido y el libro de ventas se quedan;
//   · PZ-30…PZ-36  libros intactos, el camino acotado de `sin_borrar`, quién ejecuta las purgas, pg_cron en PGlite, la bitácora de la
//                  corrida y la auditoría de 0011.
// Las fechas de las filas se fijan a mano (sembrando con `session_replication_role = replica`, sin disparadores) y las purgas se corren
// con un `p_ahora` explícito: así se prueba el borde exacto sin esperar ocho meses. Sin 0016 las funciones no existen y todo esto falla.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, una, sql, conCopia, como } from '../comun/semilla.js';
import { insertarAutorizacion, sello } from '../comun/notario.js';

const firma = n => { const s = sello(n); return { codigo: s.p_codigo, firma: s.p_firma }; };
const T0 = '2025-01-01T00:00:00Z';                         // la «última actividad» de casi todo lo sembrado

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);                              // p1…p3 ventas con COT-0001…0003@K7QM; p5 lápida de COT-0005@K7QM
  const dir = db.u.dir.uid;
  const cot = async (fg, estado, o = {}) => {
    const [folio, disp] = fg.split('@');
    await sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos, hitos)
                   values ('al3d', $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [fg, folio, disp, dir, estado, JSON.stringify({ proy: 'Negocio ' + folio, cliente: 'Cliente ' + folio, tel: '33 0000 0000' }), JSON.stringify(o.hitos || {})]);
  };
  const solic = (fg, estado, o = {}) => sql(db, `insert into public.solicitudes (empresa_id, folio_global, cotizacion, estado, solicito_id, autorizacion_id)
                                                  values ('al3d', $1, '{}'::jsonb, $2, $3, $4)`, [fg, estado, dir, o.autorizacion_id ?? null]);
  // no ganadas
  await cot('COT-0100@K7QM', 'retirada');
  await cot('COT-0101@K7QM', 'rechazada'); await solic('COT-0101@K7QM', 'rechazada');
  await cot('COT-0102@K7QM', 'pendiente'); await solic('COT-0102@K7QM', 'pendiente');
  await cot('COT-0005@K7QM', 'retirada');                  // la de la lápida p5 («No se dio»)
  // protegidas
  const a1 = await insertarAutorizacion(db, { folio_global: 'COT-0200@K7QM' });
  await cot('COT-0200@K7QM', 'autorizada');
  await sql(db, `update public.cotizaciones set autorizacion_id = $1 where folio_global = 'COT-0200@K7QM'`, [a1]);
  await insertarAutorizacion(db, { folio_global: 'COT-0201@K7QM', estado: 'revocada', ...firma(0x201) });   // sello revocado, la cotización ya no lo dice
  await cot('COT-0201@K7QM', 'retirada');
  await cot('COT-0001@K7QM', 'retirada');                  // su folio es la venta p1 (V-001)
  await cot('COT-0202@K7QM', 'retirada', { hitos: { venta: 1735689600000 } });
  await cot('COT-0203@K7QM', 'rechazada'); await solic('COT-0203@K7QM', 'autorizada');
  // borradas en la app
  await cot('COT-0300@K7QM', 'retirada');
  const a2 = await insertarAutorizacion(db, { folio_global: 'COT-0301@K7QM', ...firma(0x301) });
  await cot('COT-0301@K7QM', 'autorizada');
  await sql(db, `update public.cotizaciones set autorizacion_id = $1 where folio_global = 'COT-0301@K7QM'`, [a2]);
  await sql(db, `insert into public.cuaderno_notas (empresa_id, clave, autor_id, nota) values ('al3d', 'tel:3300000001', $1, 'borrada'), ('al3d', 'tel:3300000002', $1, 'viva')`, [dir]);
  await sql(db, `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics) values ('i9', 'al3d', 'p2', '2025-02-01', 'cancelada', 'inst-i9@al3d.mx')`);
  await sql(db, `insert into public.bitacora (empresa_id, ts, nivel, accion, entidad, titulo) values
                   ('al3d', '2024-03-01T00:00:00Z', 'general', 'prueba', 'sistema', 'justo en el año'),
                   ('al3d', '2024-03-01T00:00:01Z', 'general', 'prueba', 'sistema', 'un segundo más joven'),
                   ('al3d', '2023-01-01T00:00:00Z', 'dinero',  'prueba', 'venta',   'muy vieja, de dinero')`);
  // las fechas, sin disparadores (tocar movería updated_at a hoy)
  await sql(db, `set session_replication_role = replica`);
  await sql(db, `update public.cotizaciones set created_at = '${T0}', updated_at = '${T0}'`);
  await sql(db, `update public.solicitudes set created_at = '${T0}', updated_at = '${T0}', ts = '${T0}'`);
  await sql(db, `update public.solicitudes set updated_at = '2025-03-01T00:00:00Z' where folio_global = 'COT-0101@K7QM'`);
  await sql(db, `update public.proyectos set updated_at = '${T0}' where id = 'p5'`);
  await sql(db, `update public.cotizaciones set deleted_at = '2025-06-01T00:00:00Z', updated_at = '2025-06-01T00:00:00Z' where folio_global in ('COT-0300@K7QM', 'COT-0301@K7QM')`);
  await sql(db, `update public.cuaderno_notas set deleted_at = '2025-06-01T00:00:00Z' where clave = 'tel:3300000001'`);
  await sql(db, `update public.instalaciones set deleted_at = '2025-06-01T00:00:00Z' where id = 'i9'`);
  await sql(db, `update public.proyectos set deleted_at = '2024-01-01T00:00:00Z' where id = 'p4'`);    // una VENTA con lápida: es libro, no se purga
  await sql(db, `set session_replication_role = origin`);
  return db;
}, { limpiar: db => db.close() });

const hay = async (db, tabla, donde, params) => Number((await una(db, `select count(*)::int as n from public.${tabla} where ${donde}`, params)).n);
const cotizacion = (db, fg) => hay(db, 'cotizaciones', 'folio_global = $1', [fg]);
const purgar = async (db, fn, ahora) => (await una(db, `select interno.${fn}($1::timestamptz) as r`, [ahora])).r;
const PROTEGIDAS = ['COT-0200@K7QM', 'COT-0201@K7QM', 'COT-0001@K7QM', 'COT-0202@K7QM', 'COT-0203@K7QM'];

describir('plazo 1: cotizaciones no ganadas, 8 meses', () => {
  prueba('PZ-01 el borde exacto: a 8 meses menos un segundo de su última actividad se queda; a los 8 meses justos se borra', () => conCopia(plantilla, async db => {
    igual((await purgar(db, 'purgar_cotizaciones_no_ganadas', '2025-08-31T23:59:59Z')).borradas, 0);
    igual(await cotizacion(db, 'COT-0100@K7QM'), 1);
    const r = await purgar(db, 'purgar_cotizaciones_no_ganadas', '2025-09-01T00:00:00Z');
    igual([r.borradas, r.errores], [3, []], 'retirada, pendiente y la de la lápida (la rechazada tuvo actividad después)');
    igual(await Promise.all(['COT-0100@K7QM', 'COT-0102@K7QM', 'COT-0005@K7QM'].map(f => cotizacion(db, f))), [0, 0, 0]);
  }));
  prueba('PZ-02 la última actividad incluye sus solicitudes: la rechazada cuya solicitud se movió el 1 de marzo se queda hasta noviembre, y se va CON su solicitud', () => conCopia(plantilla, async db => {
    await purgar(db, 'purgar_cotizaciones_no_ganadas', '2025-10-31T23:59:59Z');
    igual([await cotizacion(db, 'COT-0101@K7QM'), await hay(db, 'solicitudes', `folio_global = 'COT-0101@K7QM'`)], [1, 1]);
    await purgar(db, 'purgar_cotizaciones_no_ganadas', '2025-11-01T00:00:00Z');
    igual([await cotizacion(db, 'COT-0101@K7QM'), await hay(db, 'solicitudes', `folio_global = 'COT-0101@K7QM'`)], [0, 0]);
  }));
  prueba('PZ-03 la pendiente se va con su solicitud pendiente; la lápida «No se dio» (p5) se va con su cotización', () => conCopia(plantilla, async db => {
    await purgar(db, 'purgar_cotizaciones_no_ganadas', '2026-01-01T00:00:00Z');
    igual(await hay(db, 'solicitudes', `folio_global = 'COT-0102@K7QM'`), 0);
    igual(await hay(db, 'proyectos', `id = 'p5'`), 0);
  }));
  prueba('PZ-04 NUNCA se borran: autorizada con sello, con un sello revocado, ligada a la venta V-001, marcada «venta» en hitos, con una solicitud autorizada', () => conCopia(plantilla, async db => {
    await purgar(db, 'purgar_cotizaciones_no_ganadas', '2035-01-01T00:00:00Z');
    igual(await Promise.all(PROTEGIDAS.map(f => cotizacion(db, f))), [1, 1, 1, 1, 1]);
    igual(await hay(db, 'solicitudes', `folio_global = 'COT-0203@K7QM'`), 1);
    igual(await hay(db, 'autorizaciones', 'true'), 3, 'los tres sellos siguen');
  }));
  prueba('PZ-05 una lápida con una cita colgando protege su cotización: ni la lápida ni la cotización se van', () => conCopia(plantilla, async db => {
    await sql(db, `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics) values ('i5', 'al3d', 'p5', '2025-01-10', 'cancelada', 'inst-i5@al3d.mx')`);
    await purgar(db, 'purgar_cotizaciones_no_ganadas', '2035-01-01T00:00:00Z');
    igual([await hay(db, 'proyectos', `id = 'p5'`), await cotizacion(db, 'COT-0005@K7QM')], [1, 1]);
  }));
  prueba('PZ-06 una cotización que vuelve a moverse (updated_at de hoy) se queda aunque antes fuera vieja', () => conCopia(plantilla, async db => {
    await sql(db, `update public.cotizaciones set hitos = '{"pdf": 1}' where folio_global = 'COT-0100@K7QM'`);
    await purgar(db, 'purgar_cotizaciones_no_ganadas', new Date(Date.now() + 86_400_000).toISOString());
    igual(await cotizacion(db, 'COT-0100@K7QM'), 1);
  }));
  prueba('PZ-07 la regla vive también en el trigger: aunque alguien marque la tabla como en purga, una cotización protegida no se deja borrar', () => conCopia(plantilla, async db => {
    await esperarError(sql(db, `begin; select set_config('al3d.purga', 'cotizaciones', true); delete from public.cotizaciones where folio_global = 'COT-0001@K7QM'; commit;`), 'no se borran');
    await sql(db, 'rollback').catch(() => {});
    igual(await cotizacion(db, 'COT-0001@K7QM'), 1);
  }));
});

describir('plazo 2: bitácora, 1 año', () => {
  prueba('PZ-10 el borde exacto: con ts justo un año antes se borra; un segundo más joven se queda; lo de hoy se queda', () => conCopia(plantilla, async db => {
    const antes = await hay(db, 'bitacora', 'true');
    igual(await purgar(db, 'purgar_bitacora', '2025-03-01T00:00:00Z'), 2, 'la de exactamente un año y la de 2023');
    igual((await sql(db, `select titulo from public.bitacora where accion = 'prueba' order by id`)).map(f => f.titulo), ['un segundo más joven']);
    igual(await hay(db, 'bitacora', 'true'), antes - 2);
  }));
  prueba('PZ-11 la bitácora de dinero también se va al año (la bitácora es historia, no el libro)', () => conCopia(plantilla, async db => {
    await purgar(db, 'purgar_bitacora', '2024-06-01T00:00:00Z');
    igual(await hay(db, 'bitacora', `titulo = 'muy vieja, de dinero'`), 0);
  }));
  prueba('PZ-12 sigue sin editarse ni borrarse fuera de la purga: UPDATE frenado; DELETE frenado; con la marca puesta, una fila MÁS NUEVA que el corte tampoco', () => conCopia(plantilla, async db => {
    await esperarError(sql(db, `update public.bitacora set titulo = 'x' where accion = 'prueba'`), 'es un libro');
    await esperarError(sql(db, `delete from public.bitacora where accion = 'prueba'`), 'no se borran');
    await esperarError(sql(db, `begin; select set_config('al3d.purga', 'bitacora', true), set_config('al3d.purga_corte', '2020-01-01T00:00:00Z', true);
                                delete from public.bitacora where titulo = 'muy vieja, de dinero'; commit;`), 'no se borran');
    await sql(db, 'rollback').catch(() => {});
    igual(await hay(db, 'bitacora', `accion = 'prueba'`), 3);
  }));
});

describir('plazo 3: lo borrado en la app, 30 días', () => {
  prueba('PZ-20 el borde exacto: cotización borrada el 1 de junio se queda el 30 de junio a las 23:59:59 y se va el 1 de julio', () => conCopia(plantilla, async db => {
    igual((await purgar(db, 'purgar_borrados', '2025-06-30T23:59:59Z')).cotizaciones, 0);
    igual(await cotizacion(db, 'COT-0300@K7QM'), 1);
    const r = await purgar(db, 'purgar_borrados', '2025-07-01T00:00:00Z');
    igual([r.cotizaciones, r.cuaderno_notas, r.instalaciones, r.errores], [1, 1, 1, []]);
    igual(await cotizacion(db, 'COT-0300@K7QM'), 0);
  }));
  prueba('PZ-21 una cotización borrada en la app pero CON SELLO se queda (su lápida también)', () => conCopia(plantilla, async db => {
    await purgar(db, 'purgar_borrados', '2035-01-01T00:00:00Z');
    igual((await una(db, `select count(*)::int as n, bool_and(deleted_at is not null) as b from public.cotizaciones where folio_global = 'COT-0301@K7QM'`)), { n: 1, b: true });
  }));
  prueba('PZ-22 cuaderno: la nota borrada se va, la viva se queda', () => conCopia(plantilla, async db => {
    await purgar(db, 'purgar_borrados', '2025-07-01T00:00:00Z');
    igual((await sql(db, `select clave from public.cuaderno_notas order by clave`)).map(f => f.clave), ['tel:3300000002']);
  }));
  prueba('PZ-23 citas: la borrada (i9) se va; las vivas (i1, i2) se quedan', () => conCopia(plantilla, async db => {
    await purgar(db, 'purgar_borrados', '2025-07-01T00:00:00Z');
    igual((await sql(db, `select id from public.instalaciones order by id`)).map(f => f.id), ['i1', 'i2']);
  }));
  prueba('PZ-24 una VENTA con deleted_at (p4) no se purga nunca: proyectos y ventas_dinero son el libro', () => conCopia(plantilla, async db => {
    await purgar(db, 'purgar_plazos', '2035-01-01T00:00:00Z');
    igual([await hay(db, 'proyectos', `id = 'p4'`), await hay(db, 'ventas_dinero', `proyecto_id = 'p4'`)], [1, 1]);
  }));
});

describir('todo junto, lo intocable y quién puede', () => {
  prueba('PZ-30 purgar_plazos en 2035: los libros (ventas, dinero, abonos, autorizaciones, almacén) quedan EXACTOS', () => conCopia(plantilla, async db => {
    const libros = `select (select count(*) from public.proyectos where folio_hoja is not null)::int as ventas, (select count(*) from public.ventas_dinero)::int as dinero,
                           (select count(*) from public.abonos)::int as abonos, (select count(*) from public.autorizaciones)::int as sellos,
                           (select count(*) from public.almacen_movimientos)::int as almacen, (select sum(importe) from public.abonos)::text as suma`;
    const antes = await una(db, libros);
    const r = await purgar(db, 'purgar_plazos', '2035-01-01T00:00:00Z');
    igual(await una(db, libros), antes);
    igual([r.cotizaciones_no_ganadas, r.borrados, r.errores], [4, { cotizaciones: 1, cuaderno_notas: 1, instalaciones: 1 }, []]);
    igual(await Promise.all(PROTEGIDAS.map(f => cotizacion(db, f))), [1, 1, 1, 1, 1]);
  }));
  prueba('PZ-31 deja UNA línea en la bitácora de al3d (nivel direccion, entidad sistema) con SUS conteos y ninguna en la empresa «otra», donde no se borró nada; Fabricación no la ve; correr otra vez no borra ni anota nada', () => conCopia(plantilla, async db => {
    const r = await purgar(db, 'purgar_plazos', '2035-01-01T00:00:00Z');
    const l = await una(db, `select nivel, entidad, accion, despues from public.bitacora where accion = 'purgo'`);
    igual([l.nivel, l.entidad, l.despues.borradas.cotizaciones, l.despues.borradas.lapidas, l.despues.borradas.bitacora], ['direccion', 'sistema', 5, 1, r.bitacora]);
    igual(await hay(db, 'bitacora', `accion = 'purgo'`), 1);
    igual((await como(db, { rol: 'authenticated', uid: db.u.fab.uid, correo: db.u.fab.correo }).query(`select count(*)::int as n from public.bitacora where accion = 'purgo'`))[0].n, 0);
    const otra = await purgar(db, 'purgar_plazos', new Date(Date.now() + 86_400_000).toISOString());      // mañana: ya no queda nada vencido
    igual([otra.cotizaciones_no_ganadas, otra.bitacora, await hay(db, 'bitacora', `accion = 'purgo'`)], [0, 0, 1]);
  }));
  prueba('PZ-32 ningún otro libro se deja borrar ni con la marca puesta: ventas_dinero, abonos y autorizaciones siguen con sin_borrar', () => conCopia(plantilla, async db => {
    for (const [t, donde] of [['ventas_dinero', `proyecto_id = 'p4'`], ['abonos', 'true'], ['autorizaciones', 'true'], ['proyectos', `id = 'p1'`]]) {
      await esperarError(sql(db, `begin; select set_config('al3d.purga', '${t}', true); delete from public.${t} where ${donde}; commit;`), 'no se borran', t);
      await sql(db, 'rollback').catch(() => {});
    }
  }));
  prueba('PZ-33 las purgas no las ejecuta service_role, authenticated ni anon (permission denied); service_role sigue sin DELETE', () => conCopia(plantilla, async db => {
    for (const fn of ['purgar_plazos(now())', 'purgar_bitacora(now())', 'purgar_borrados(now())', 'purgar_cotizaciones_no_ganadas(now())', `purgar_cotizacion('al3d', 'COT-0100@K7QM')`]) {
      for (const rol of ['service_role', 'anon']) await esperarError(como(db, { rol }).query(`select interno.${fn}`), '42501', rol + ' ' + fn);
      await esperarError(como(db, { rol: 'authenticated', uid: db.u.dir.uid, correo: db.u.dir.correo }).query(`select interno.${fn}`), '42501', 'Dirección ' + fn);
    }
    await esperarError(como(db, { rol: 'service_role' }).query(`delete from public.cotizaciones where folio_global = 'COT-0100@K7QM'`), '42501');
  }));
  prueba('PZ-34 en PGlite no hay pg_cron: la migración avisó y siguió (sin extensión, sin esquema cron) y las purgas existen', async () => {
    const db = await plantilla();
    igual(await una(db, `select (select count(*) from pg_extension where extname = 'pg_cron')::int as ext, (select count(*) from pg_namespace where nspname = 'cron')::int as esq,
                                (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'interno' and p.proname like 'purgar%')::int as purgas`),
          { ext: 0, esq: 0, purgas: 5 });
  });
  prueba('PZ-35 la migración programa al3d-plazos con cron.schedule cuando pg_cron existe (texto de 0016)', async () => {
    const { readFileSync } = await import('node:fs');
    const t = readFileSync(new URL('../../migrations/0016_plazos.sql', import.meta.url), 'utf8');
    cierto(/create extension if not exists pg_cron/.test(t) && /cron\.schedule\('al3d-plazos', '15 9 \* \* \*', 'select interno\.purgar_plazos\(\)'\)/.test(t) && /raise notice 'PLAZOS: pg_cron no está disponible/.test(t));
  });
  prueba('PZ-36 la auditoría de 0011 sigue limpia con 0016 aplicada', async () => {
    igual((await una(await plantilla(), `select interno.auditoria() as p`)).p, []);
  });
});

await resumen();
