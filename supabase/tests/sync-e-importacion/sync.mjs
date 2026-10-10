// Sincronización por cursor, reintentos y el espejo a la hoja — A.md §7 y §10.13, casos SY-01 a SY-14 (y RL-16, RL-18).
//
//   · el cursor es `(updated_at, id)`: la base pone `updated_at` al ESCRIBIR (trigger `tocar`) y cada tabla tiene su índice `(empresa_id, updated_at, llave)`;
//   · lo borrado no se borra (`deleted_at`): llega por la lectura incremental para que cada teléfono lo quite;
//   · cada RPC de escritura es IDEMPOTENTE (por id, por folio_global o por op_id): reenviar tras una «respuesta perdida» no duplica ni suma dos veces;
//   · el sobre de error dice si es DEFINITIVO (no se reintenta) o no; la versión de contrato se exige por cabecera;
//   · `espejo_ventas`, `espejo_abonos` y `cuadre_hoja` son SOLO de `service_role` (la Edge Function `espejo` escribe la hoja de solo lectura).
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sembrarAlmacen, sesionDe, sesionSinContrato, llamar, una, sql, conCopia, como, rpcT, ORIGEN_COMPLETO, CAB } from '../comun/semilla.js';
import { sol, aut, sello } from '../comun/notario.js';

const vacia = dato(async () => { const db = await crearBaseDePruebas(); db.u = await sembrarUsuarios(db); return db; }, { limpiar: db => db.close() });
const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  await sembrarAlmacen(db);
  const S = quien => sesionDe(db, db.u[quien], { confirmar: true });
  await llamar(S('dir'), 'solicitar', { p_op: sol('COT-0001-B@K7QM') });
  await llamar(S('fab'), 'solicitar', { p_op: sol('COT-0002-B@K7QM') });
  await llamar(S('pag'), 'solicitar', { p_op: sol('COT-0003-B@K7QM') });
  await llamar(como(db, { rol: 'service_role', confirmar: true }), 'registrar_autorizacion', aut(db, { p_folio_global: 'COT-0003-B@K7QM', ...sello(3) }));
  await llamar(S('dir'), 'cuaderno_guardar', { p_clave: 'tel:3312345678', p_nota: 'nota de Dirección' });
  await llamar(S('dir'), 'mover_etapa', { p_proyecto: 'p2', p_etapa: 'en_diseno', p_sello: AHORA() });          // un evento de nivel «general» en la bitácora
  return db;
}, { limpiar: db => db.close() });
const AHORA = () => Date.now();
const SR = db => como(db, { rol: 'service_role' });
const SRC = db => como(db, { rol: 'service_role', confirmar: true });

describir('SY-01 a SY-03 el cursor (updated_at, id)', () => {
  prueba('SY-01 1200 proyectos paginados de 500 con (updated_at, id) desde cero: exactamente 1200 filas, sin repetir ni saltar, en 3 páginas (500, 500, 200); con empates de updated_at que cortan una página a la mitad', () => conCopia(vacia, async db => {
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa, estatus)
                   select 'sy' || lpad(g::text, 4, '0'), 'al3d', 'V-' || lpad(g::text, 4, '0'), 'hoja', 'Proyecto ' || g, 'ganado', 'FABRICACION' from generate_series(1, 1200) g`);
    // grupos de 70 filas con el MISMO updated_at (500 no es múltiplo de 70: el corte de página cae dentro de un empate)
    await sql(db, `set session_replication_role = replica;
                   update public.proyectos set updated_at = timestamptz '2026-10-01 00:00:00+00' + ((substr(id, 3)::int / 70) * interval '1 second');
                   reset session_replication_role`);
    const D = sesionDe(db, db.u.dir);
    const leer = async (consulta) => {
      let ts = '-infinity', id = '';
      const paginas = [], vistos = [];
      for (;;) {
        const f = await D.query(consulta, [ts, id]);
        if (!f.length) break;
        paginas.push(f.length); vistos.push(...f.map(r => r.id));
        ts = f.at(-1).ts; id = f.at(-1).id;                       // el cursor viaja como TEXTO (con sus microsegundos): por un Date se perderían
        if (f.length < 500) break;
      }
      return { paginas, vistos };
    };
    const a = await leer(`select id, updated_at::text as ts from public.proyectos where (updated_at, id) > ($1::timestamptz, $2::text) order by updated_at, id limit 500`);
    igual(a.paginas, [500, 500, 200]);
    igual(a.vistos.length, 1200);
    igual(new Set(a.vistos).size, 1200, 'sin repetir');
    igual(a.vistos, [...a.vistos].sort(), 'y en orden');
    // la forma que PostgREST sabe escribir: or=(updated_at.gt.X,and(updated_at.eq.X,id.gt.Y))
    const b = await leer(`select id, updated_at::text as ts from public.proyectos where updated_at > $1::timestamptz or (updated_at = $1::timestamptz and id > $2::text) order by updated_at, id limit 500`);
    igual(b.vistos, a.vistos, 'la forma or=(…) da las mismas páginas que la comparación de filas');
  }), { tiempo: 120_000 });
  prueba('SY-01 el cursor tiene su índice en cada tabla sincronizable: (empresa_id, updated_at, <llave>) en las 14', async () => {
    const db = await plantilla();
    const tablas = ['proyectos', 'ventas_dinero', 'abonos', 'instalaciones', 'cotizaciones', 'solicitudes', 'cuaderno_notas', 'materiales', 'requerimientos', 'almacen_movimientos', 'almacen_costos', 'constantes', 'bitacora', 'miembros'];
    const f = await sql(db, `select c.relname as t, array(select a.attname::text from unnest(i.indkey::int2[]) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.oid and a.attnum = k.n order by k.o) as cols
                               from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = any($1::text[]) and i.indpred is null`, [tablas]);
    for (const t of tablas) {
      const buena = f.filter(x => x.t === t).some(x => x.cols[0] === 'empresa_id' && x.cols[1] === 'updated_at' && x.cols.length === 3);
      igual([t, buena], [t, true]);
    }
  });
  prueba('SY-02 solape de 30 s: una fila confirmada tarde (updated_at 10 s ANTES del cursor guardado) se recupera con el solape; la de 40 s no (límite documentado)', () => conCopia(vacia, async db => {
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa, estatus) values ('a10', 'al3d', 'V-0010', 'hoja', 'a 10 s', 'ganado', 'FABRICACION'), ('b40', 'al3d', 'V-0040', 'hoja', 'a 40 s', 'ganado', 'FABRICACION')`);
    await sql(db, `set session_replication_role = replica;
                   update public.proyectos set updated_at = timestamptz '2026-10-01 12:00:00+00' - interval '10 seconds' where id = 'a10';
                   update public.proyectos set updated_at = timestamptz '2026-10-01 12:00:00+00' - interval '40 seconds' where id = 'b40';
                   reset session_replication_role`);
    const D = sesionDe(db, db.u.dir), cursor = '2026-10-01 12:00:00+00';
    const ids = async desde => (await D.query(`select id from public.proyectos where updated_at > $1::timestamptz order by id`, [desde])).map(r => r.id);
    igual(await ids(cursor), [], 'sin solape no se ven');
    igual(await ids(`${cursor}`.replace('12:00:00', '11:59:30')), ['a10'], 'con el solape de 30 s se recupera la de 10 s y no la de 40 s');
  }));
  prueba('SY-03 / RL-18 el borrado lógico llega por la lectura incremental con deleted_at (proyecto, instalación y cotización), a Dirección y a Fabricación (cotización: a su autor y a Dirección)', () => conCopia(plantilla, async db => {
    const marca = (await una(db, `select clock_timestamp()::text as t`)).t;
    await sql(db, `update public.proyectos set deleted_at = now() where id = 'p4'`);
    await sql(db, `update public.instalaciones set deleted_at = now() where id = 'i2'`);
    igual((await llamar(sesionDe(db, db.u.pag, { confirmar: true }), 'cotizacion_guardar', { p_op: { folio_global: 'COT-0003-B@K7QM', borrar: true } })).ok, true);
    for (const quien of ['dir', 'fab']) {
      const S = sesionDe(db, db.u[quien]);
      const p = await S.query(`select id, deleted_at is not null as borrada from public.proyectos where updated_at > $1::timestamptz order by id`, [marca]);
      const i = await S.query(`select id, deleted_at is not null as borrada from public.instalaciones where updated_at > $1::timestamptz order by id`, [marca]);
      igual([quien, p.map(r => [r.id, r.borrada])], [quien, [['p4', true]]]);
      igual([quien, i.map(r => [r.id, r.borrada])], [quien, [['i2', true]]]);
    }
    for (const quien of ['dir', 'pag']) {
      const c = await sesionDe(db, db.u[quien]).query(`select folio_global, deleted_at is not null as borrada from public.cotizaciones where updated_at > $1::timestamptz`, [marca]);
      igual([quien, c.map(r => [r.folio_global, r.borrada])], [quien, [['COT-0003-B@K7QM', true]]]);
    }
    igual((await sesionDe(db, db.u.fab).query(`select count(*)::int as n from public.cotizaciones`))[0].n, 0, 'Fabricación nunca ve cotizaciones, ni borradas');
    igual((await sesionDe(db, db.u.dir).query(`select count(*)::int as n from public.proyectos where deleted_at is not null`))[0].n, 1, 'RL-18: los tombstones SÍ aparecen en la lectura');
  }));
});

describir('SY-04 y SY-05 reenviar la misma operación', () => {
  prueba('SY-04 mover_etapa dos veces: mismo resultado y sin duplicados (una sola entrada de bitácora; el segundo es «sin_cambio»)', () => conCopia(plantilla, async db => {
    const D = sesionDe(db, db.u.dir, { confirmar: true });
    const op = { p_proyecto: 'p4', p_etapa: 'cortado', p_sello: AHORA() };
    const a = await llamar(D, 'mover_etapa', op), b = await llamar(D, 'mover_etapa', op);
    igual([a.ok, b.ok, b.sin_cambio], [true, true, true]);
    igual((await una(db, `select count(*)::int as n from public.bitacora where entidad_id = 'p4' and accion = 'etapa'`)).n, 1);
    igual((await una(db, `select count(*)::int as n from public.almacen_movimientos where id like 'mov-salida:p4:%'`)).n, 0);
  }));
  prueba('SY-04 ganar_proyecto dos veces con el mismo id: «ya_existia» y UN solo V-###; almacen_aplicar con el mismo id de movimiento: «ya_estaba» y seq no avanza', () => conCopia(plantilla, async db => {
    const D = sesionDe(db, db.u.dir, { confirmar: true });
    const GANAR = { p_op: { id: 'g1', folio_global: 'COT-0100@K7QM', folio_local: 'COT-0100', dispositivo: 'K7QM', entrada: ORIGEN_COMPLETO, nombre: 'Rosa - Tienda', tel: '33 1111 2222', tipo_trabajo: ['Letras 3D con iluminacion'],
      fecha_anticipo: '2026-10-05', dir_texto: 'Calle 5', entrega: 'instalacion', plazo_k: 3, venta: { sub: 10000, neto: 11600, anti: 5800, iva: true, cuenta: 'Constru BNT', estatus: 'COBRANDO', pct_comision: 10 },
      sellos: { etapa: AHORA(), tel: AHORA() } } };
    const a = await llamar(D, 'ganar_proyecto', GANAR), b = await llamar(D, 'ganar_proyecto', GANAR);
    igual([a.ok, !!a.ya_existia, b.ok, b.ya_existia, b.folio_hoja, a.folio_hoja], [true, false, true, true, a.folio_hoja, a.folio_hoja]);
    igual([(await una(db, `select count(*)::int as n from public.proyectos where folio_global = 'COT-0100@K7QM'`)).n, (await una(db, `select n::int as n from public.contadores where empresa_id = 'al3d' and clave = 'V'`)).n], [1, 6]);
    const mov = { id: 'op-sy4', almacen: 'movimientos', tipo: 'apendice', registro_id: 'sy4', datos: { id: 'sy4', material_id: 'acr-3mm', tipo: 'entrada', cantidad: 5, unidad_compra: 'lamina', origen: 'manual', nota: '', usuario: 'Fab', rol: 'fabricacion', dispositivo: 'D1', firma: 'Fab', ts: AHORA() } };
    const F = sesionDe(db, db.u.fab, { confirmar: true });
    const m1 = await llamar(F, 'almacen_aplicar', { p_ops: [mov] }), seq1 = (await una(db, `select max(seq)::int as s from public.almacen_movimientos`)).s;
    const m2 = await llamar(F, 'almacen_aplicar', { p_ops: [mov] }), seq2 = (await una(db, `select max(seq)::int as s from public.almacen_movimientos`)).s;
    igual([m1.resultados[0].creada, m2.resultados[0].ya_estaba, seq2, (await una(db, `select count(*)::int as n from public.almacen_movimientos where id = 'sy4'`)).n], [true, true, seq1, 1]);
  }));
  prueba('SY-04 solicitar e instalacion_guardar dos veces: una sola fila (misma solicitud, misma cita) y `movida` no sube', () => conCopia(plantilla, async db => {
    const P = sesionDe(db, db.u.pag, { confirmar: true });
    await llamar(P, 'solicitar', { p_op: sol('COT-0200-B@K7QM') }); await llamar(P, 'solicitar', { p_op: sol('COT-0200-B@K7QM') });
    igual([(await una(db, `select count(*)::int as n from public.solicitudes where folio_global = 'COT-0200-B@K7QM'`)).n, (await una(db, `select count(*)::int as n from public.cotizaciones where folio_global = 'COT-0200-B@K7QM'`)).n], [1, 1]);
    const D = sesionDe(db, db.u.dir, { confirmar: true });
    const cita = { p_op: { id: 'nueva', proyecto_id: 'p2', fecha: '2026-11-05', hora: '10:00', ventana: 'dia', duracion_min: 120, sello: AHORA() } };
    const a = await llamar(D, 'instalacion_guardar', cita), b = await llamar(D, 'instalacion_guardar', cita);
    igual([a.ok, b.ok], [true, true]);
    igual(await una(db, `select count(*)::int as n, max(movida)::int as m from public.instalaciones where proyecto_id = 'p2'`), { n: 1, m: 0 });
  }));
  prueba('SY-05 cobro, abono y reparto con op_id tras una «respuesta perdida»: devuelven lo mismo y NO suman dos veces', () => conCopia(plantilla, async db => {
    const P = sesionDe(db, db.u.pag, { confirmar: true });
    const c1 = await llamar(P, 'registrar_cobro', { p_proyecto: 'p4', p_monto: 100, p_liquidar: false, p_op_id: 'c-1' }), c2 = await llamar(P, 'registrar_cobro', { p_proyecto: 'p4', p_monto: 100, p_liquidar: false, p_op_id: 'c-1' });
    igual(c2, c1);
    const a1 = await llamar(P, 'registrar_abono_comision', { p_proyecto: 'p4', p_monto: 10, p_op_id: 'a-1' }), a2 = await llamar(P, 'registrar_abono_comision', { p_proyecto: 'p4', p_monto: 10, p_op_id: 'a-1' });
    igual([a2.repetida, { ...a2, repetida: undefined }], [true, { ...a1, repetida: undefined }], 'devuelve lo mismo y avisa que fue una repetición');
    const r1 = await llamar(P, 'repartir_abono_fifo', { p_monto: 50, p_op_id: 'r-1' }), r2 = await llamar(P, 'repartir_abono_fifo', { p_monto: 50, p_op_id: 'r-1' });
    igual([r2.repetida, { ...r2, repetida: undefined }], [true, { ...r1, repetida: undefined }], 'el reparto repetido devuelve LO MISMO (con sus nombres, pendientes y sobrante)');
    igual((await una(db, `select liquidacion::text as l from public.ventas_dinero where proyecto_id = 'p4'`)).l, '100', 'el cobro se sumó UNA vez');
    igual((await una(db, `select count(*)::int as n from public.abonos where op_id = 'a-1'`)).n, 1);
    const rep = await una(db, `select count(*)::int as n, coalesce(sum(importe), 0)::text as s from public.abonos where op_id = 'r-1'`);
    igual(Number(rep.s), 50, 'el reparto suma 50 UNA vez');
    cierto(rep.n >= 1, 'y dejó sus renglones');
    igual((await una(db, `select count(*)::int as n from public.abonos where op_id = 'r-1' and pago_id is not null`)).n, rep.n);
  }));
});

describir('SY-06 y SY-07 el sobre de error y el contrato', () => {
  prueba('SY-06 DATO_INVALIDO, ROL_SIN_PERMISO, NO_ENCONTRADO y DUPLICADO son «definitivo»; ACCESO_REVOCADO, SIN_ACCESO, EMPRESA_REQUERIDA y CLIENTE_VIEJO NO', async () => {
    const db = await plantilla();
    const D = sesionDe(db, db.u.dir);
    const GANAR = { p_op: { id: 'zz', folio_global: 'COT-0002@K7QM', folio_local: 'COT-0002', dispositivo: 'K7QM', entrada: ORIGEN_COMPLETO, nombre: 'x', tel: '33 1111 2222', entrega: 'instalacion',
                            venta: { sub: 1, neto: 1, anti: 0, iva: false, cuenta: 'Constru BNT', estatus: 'COBRANDO', pct_comision: 10 }, sellos: { etapa: AHORA() } } };
    const x = {
      DATO_INVALIDO: await llamar(D, 'solicitar', { p_op: sol('COT-1') }),
      ROL_SIN_PERMISO: await llamar(sesionDe(db, db.u.fab), 'registrar_cobro', { p_proyecto: 'p1', p_monto: 1 }),
      NO_ENCONTRADO: await llamar(D, 'registrar_cobro', { p_proyecto: 'no-existe', p_monto: 1 }),
      DUPLICADO: await llamar(D, 'ganar_proyecto', GANAR),
      ACCESO_REVOCADO: await llamar(sesionDe(db, db.u.baja), 'solicitar', { p_op: sol('COT-1-B@K7QM') }),
      SIN_ACCESO: await llamar(sesionDe(db, db.u.ext), 'solicitar', { p_op: sol('COT-1-B@K7QM') }),
      EMPRESA_REQUERIDA: await llamar(sesionDe(db, db.u.multi), 'solicitar', { p_op: sol('COT-1-B@K7QM') }),
      CLIENTE_VIEJO: await llamar(sesionSinContrato(db, db.u.dir), 'solicitar', { p_op: sol('COT-1-B@K7QM') }),
    };
    const DEFINITIVOS = ['DATO_INVALIDO', 'ROL_SIN_PERMISO', 'NO_ENCONTRADO', 'DUPLICADO'];
    for (const [codigo, r] of Object.entries(x)) igual([codigo, r.ok, r.codigo, r.definitivo], [codigo, false, codigo, DEFINITIVOS.includes(codigo)]);
    igual(typeof x.ROL_SIN_PERMISO.mensaje, 'string');
    cierto(!/\d/.test(x.ROL_SIN_PERMISO.mensaje + x.NO_ENCONTRADO.mensaje), 'los mensajes de error no llevan cifras');
  });
  prueba('SY-07 versión de contrato: cabecera ausente, 0, vacía o no numérica ⇒ CLIENTE_VIEJO (no definitivo, trae el mínimo); 1 y mayores ⇒ pasa; mi_acceso().contrato = {actual:1, minimo:1}', async () => {
    const db = await plantilla();
    const con = cab => como(db, { rol: 'authenticated', uid: db.u.dir.uid, correo: db.u.dir.correo, cabeceras: cab });
    for (const [que, cab] of [['ausente', undefined], ['0', { 'x-al3d-contrato': '0' }], ['vacía', { 'x-al3d-contrato': '' }], ['texto', { 'x-al3d-contrato': 'uno' }], ['negativa', { 'x-al3d-contrato': '-1' }], ['con espacios', { 'x-al3d-contrato': '1 ' }]]) {
      const r = await llamar(con(cab), 'cuaderno_guardar', { p_clave: 'tel:3312345678', p_nota: 'x' });
      igual([que, r.ok, r.codigo, r.definitivo, r.minimo], [que, false, 'CLIENTE_VIEJO', false, 1]);
    }
    for (const v of ['1', '2', '99']) igual([v, (await llamar(con({ 'x-al3d-contrato': v }), 'cuaderno_guardar', { p_clave: 'tel:3312345678', p_nota: 'x' })).ok], [v, true]);
    const a = await llamar(sesionDe(db, db.u.dir), 'mi_acceso', {});
    igual([a.contrato.actual, a.contrato.minimo], [1, 1]);
    igual((await llamar(sesionDe(db, db.u.dir), 'version_contrato', {})), { actual: 1, minimo: 1, esquema: 'al3d-1' });
  });
});

describir('SY-08 y SY-09 la hidratación completa y lo que vuelve a Fabricación', () => {
  prueba('SY-08 hidratación desde cero por rol: Fabricación NO recibe dinero ni cotizaciones (0 filas, sin error); Dirección recibe todo; Pagos todo menos lo de otros y lo de Dirección', async () => {
    const db = await plantilla();
    const n = async (quien, t) => (await sesionDe(db, db.u[quien]).query(`select count(*)::int as n from public.${t}`))[0].n;
    const directo = async t => (await una(db, `select count(*)::int as n from public.${t}`)).n;
    const TODOS = ['proyectos', 'instalaciones', 'materiales', 'requerimientos', 'almacen_movimientos', 'constantes'];
    const DINERO = ['ventas_dinero', 'abonos', 'almacen_costos', 'ventas_calculadas', 'comisiones_pendientes'];
    for (const t of TODOS) igual([t, await n('dir', t), await n('pag', t), await n('fab', t)], [t, await directo(t), await directo(t), await directo(t)]);
    for (const t of DINERO) igual([t, await n('dir', t) > 0, await n('dir', t) === await n('pag', t), await n('fab', t)], [t, true, true, 0]);
    igual([await n('dir', 'cotizaciones'), await n('pag', 'cotizaciones'), await n('fab', 'cotizaciones')], [3, 1, 0]);
    igual([await n('dir', 'solicitudes'), await n('pag', 'solicitudes'), await n('fab', 'solicitudes')], [3, 1, 0]);
    igual([await n('dir', 'autorizaciones'), await n('pag', 'autorizaciones'), await n('fab', 'autorizaciones')], [1, 0, 0]);
    igual([await n('dir', 'cuaderno_notas'), await n('pag', 'cuaderno_notas'), await n('fab', 'cuaderno_notas')], [1, 0, 0]);
    igual([await n('dir', 'miembros') > 1, await n('pag', 'miembros'), await n('fab', 'miembros')], [true, 1, 1]);
    igual([await n('dir', 'empresas'), await n('pag', 'empresas'), await n('fab', 'empresas'), await n('ext', 'empresas')], [1, 1, 1, 0]);
    const niveles = async quien => (await sesionDe(db, db.u[quien]).query(`select distinct nivel from public.bitacora order by 1`)).map(r => r.nivel);
    igual([await niveles('dir'), await niveles('pag'), await niveles('fab')], [['dinero', 'general'], ['dinero', 'general'], ['general']]);
  });
  prueba('SY-09 / R1-12 la respuesta (`remoto`) de toda escritura de Fabricación trae SOLO columnas de proyectos/instalaciones: ninguna cifra de dinero; sin origen_obra ni procedencia', () => conCopia(plantilla, async db => {
    const F = sesionDe(db, db.u.fab, { confirmar: true });
    const cols = (await sql(db, `select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'proyectos'`)).map(r => r.c);
    const respuestas = [
      await llamar(F, 'mover_etapa', { p_proyecto: 'p4', p_etapa: 'en_diseno', p_sello: AHORA() }),
      await llamar(F, 'proyecto_actualizar', { p_op: { id: 'p4', campos: { notas: 'nota nueva' }, sellos: { notas: AHORA() } } }),
      await llamar(F, 'instalacion_guardar', { p_op: { id: 'nueva', proyecto_id: 'p2', fecha: '2026-11-05', hora: '10:00', ventana: 'dia', duracion_min: 120, sello: AHORA() } }),
    ];
    for (const r of respuestas) {
      igual(r.ok, true);
      const claves = JSON.stringify(r);
      for (const prohibido of ['subtotal', 'anticipo', 'liquidacion', 'cuenta', 'neto', 'saldo', 'costo', 'precioAuth', 'pct_comision', 'origen_dinero']) igual([prohibido, claves.includes('"' + prohibido)], [prohibido, false]);
    }
    for (const llave of Object.keys(respuestas[0].remoto)) cierto(cols.includes(llave), `«${llave}» no es una columna de proyectos`);
    igual(['origen_obra' in respuestas[0].remoto, 'procedencia' in respuestas[0].remoto], [false, false]);
  }));
});

describir('SY-10 a SY-14 updated_at, espejo, cuadre y bitácora', () => {
  prueba('SY-10 100 inserciones en una transacción: updated_at no decrece y (updated_at, id) es único', () => conCopia(vacia, async db => {
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa, estatus)
                   select 'sy10-' || lpad(g::text, 3, '0'), 'al3d', 'V-' || lpad((g + 500)::text, 4, '0'), 'hoja', 'p ' || g, 'ganado', 'FABRICACION' from generate_series(1, 100) g`);
    const r = await una(db, `select count(*)::int as n, count(distinct (updated_at, id))::int as unicos,
                                    (select bool_and(updated_at >= prev) from (select updated_at, lag(updated_at) over (order by id) as prev from public.proyectos) x where prev is not null) as no_decrece
                               from public.proyectos`);
    igual([r.n, r.unicos, r.no_decrece], [100, 100, true]);
  }));
  prueba('SY-11 / RL-16 espejo_ventas: SOLO las columnas capturadas (A:G, I:J, L:N, Y:AI) y ninguna de fórmula; etiquetas de etapa, entrega y plazo; ai_sellos con NOMBRES de columna; la lápida no sale', async () => {
    const db = await plantilla();
    const filas = await SR(db).query(`select * from public.espejo_ventas order by a_folio`);
    igual(filas.length, 5, 'una por venta con folio de la hoja: la lápida no está');
    igual(Object.keys(filas[0]).sort(), ['a_folio', 'aa_hora', 'ab_ubicacion', 'ac_direccion', 'ad_pct', 'ae_telefono', 'af_entrega', 'ag_notas', 'ah_plazo', 'ai_sellos', 'b_proyecto', 'c_estatus', 'd_cuenta', 'dinero_updated_at', 'e_tipo', 'empresa_id',
                                       'f_iva', 'g_subtotal', 'i_anticipo', 'j_liquidacion', 'l_fecha_anticipo', 'm_fecha_instalacion', 'n_fecha_liquidacion', 'updated_at', 'y_folio_cotizacion', 'z_etapa'].sort());
    for (const llave of Object.keys(filas[0])) cierto(!/^(h|k|o|p|q|r|s|t|u|v|w|x)_/.test(llave), `«${llave}» es de una columna de fórmula`);
    const p1 = filas.find(f => f.a_folio === 'V-001');
    igual([p1.b_proyecto, p1.c_estatus, p1.d_cuenta, p1.e_tipo, p1.f_iva, String(p1.g_subtotal), String(p1.i_anticipo), String(p1.j_liquidacion)],
          ['Juan - Tacos (Caja de luz)', 'COBRANDO', 'Constru BNT', 'Letras 3D con iluminacion, Rotulacion de vinil', 'Sí', '10000', '5800', '0']);
    igual([p1.y_folio_cotizacion, p1.z_etapa, p1.aa_hora, p1.ab_ubicacion, p1.ac_direccion, String(p1.ad_pct), p1.ae_telefono, p1.af_entrega, p1.ag_notas, p1.ah_plazo],
          ['COT-0001@K7QM', 'Cortado', '09:30', '20.1,-103.1', 'Calle 1', '10', '33 1234 5678', 'Instalación', 'mía', '1.5 semanas']);
    igual(JSON.parse(p1.ai_sellos), { 'Etapa de obra': 100, Notas: 100, Telefono: 100 }, 'los sellos con el nombre de la columna de la hoja');
    const p2 = filas.find(f => f.a_folio === 'V-002');
    igual([p2.f_iva, p2.z_etapa, p2.af_entrega, p2.ah_plazo, Object.keys(JSON.parse(p2.ai_sellos)), p2.ab_ubicacion], ['No', 'En diseño', '', '', ['Etapa de obra'], '']);
    igual(filas.find(f => f.a_folio === 'V-004').af_entrega, 'Recolección en taller');
    igual(filas.find(f => f.a_folio === 'V-003').af_entrega, 'Paquetería');
    igual(filas.find(f => f.a_folio === 'V-005').z_etapa, null, 'una histórica no tiene etapa');
  });
  prueba('SY-11 espejo_abonos: id, updated_at, a_folio, c_importe, d_fecha, e_nota y f_pago; y NINGÚN rol de cliente tiene SELECT en las dos vistas (Dirección, Pagos, Fabricación, anon: permission denied); service_role sí', async () => {
    const db = await plantilla();
    const a = await SR(db).query(`select * from public.espejo_abonos order by id`);
    igual(a.length, 4);
    igual(Object.keys(a[0]).sort(), ['a_folio', 'c_importe', 'd_fecha', 'e_nota', 'empresa_id', 'f_pago', 'id', 'updated_at']);
    igual([a[0].a_folio, String(a[0].c_importe), a[0].e_nota, a[0].f_pago], ['V-001', '100', 'Reparto P-001', 'P-001']);
    for (const v of ['espejo_ventas', 'espejo_abonos']) {
      for (const quien of ['dir', 'pag', 'fab']) await esperarError(sesionDe(db, db.u[quien]).query(`select * from public.${v}`), '42501', `${quien} ${v}`);
      await esperarError(como(db, { rol: 'anon' }).query(`select * from public.${v}`), '42501', `anon ${v}`);
      igual((await una(db, `select reloptions::text as r from pg_class where oid = 'public.${v}'::regclass`)).r, '{security_invoker=true}');
    }
  });
  prueba('SY-12 cuadre_hoja (solo service_role): conteos y sumas iguales a consultas directas sobre las tablas (y a lo calculado a mano de la semilla)', () => conCopia(plantilla, async db => {
    await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe, fecha, nota, tipo) values ('al3d', 'V-999', 7, interno.hoy_mx(), 'sin venta', 'abono')`);      // un abono huérfano
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa, estatus) values ('sin-dinero', 'al3d', 'V-950', 'hoja', 'Sin dinero', 'ganado', 'FABRICACION')`);
    const r = await llamar(SR(db), 'cuadre_hoja', { p_empresa: 'al3d' });
    const d = async consulta => Number(Object.values(await una(db, consulta))[0]);
    igual(r.invariantes.proyectos_sin_dinero, 1);
    igual(r.proyectos, { total: 7, historicas: 1, vivas: 5, lapidas: 1, por_fuente: { cotizacion: 4, manual: 1, hoja: 2 } });
    igual([r.proyectos.total, r.proyectos.historicas, r.proyectos.lapidas], [await d(`select count(*) from public.proyectos where deleted_at is null`), await d(`select count(*) from public.proyectos where historica`), await d(`select count(*) from public.proyectos where folio_hoja is null`)]);
    igual([r.ventas.filas, Number(r.ventas.suma_subtotal), Number(r.ventas.suma_cobrado), r.ventas.n_saldo], [5, 27200, 14400, 4]);
    igual([Number(r.ventas.suma_neto), Number(r.ventas.suma_saldo_positivo), Number(r.ventas.comisiones_generadas), Number(r.ventas.abonado), Number(r.ventas.comisiones_pendientes)], [30080, 15680, 2720, 370, 2350]);
    igual(Number(r.ventas.suma_subtotal), await d(`select sum(subtotal) from public.ventas_dinero`));
    igual(Number(r.ventas.suma_cobrado), await d(`select sum(anticipo + liquidacion) from public.ventas_dinero`));
    igual(Number(r.ventas.suma_neto), await d(`select sum(round(d.subtotal * case when p.iva then 1.16 else 1 end, 2)) from public.ventas_dinero d join public.proyectos p on p.id = d.proyecto_id`));
    igual(r.abonos, { n: 5, suma: 377, huerfanos: 1 });
    igual(Number(r.abonos.suma), await d(`select sum(importe) from public.abonos`));
    igual(r.cotizaciones, { pendiente: 2, autorizada: 1 });
    igual(r.autorizaciones, { total: 1, vigentes: 1, superadas: 0, revocadas: 0, v1: 0, v2: 1 });
    igual(r.solicitudes, { pendiente: 2, autorizada: 1 });
    igual(r.miembros, { activo: 5, invitado: 2, baja: 1 });
    igual(r.almacen, { movimientos: 6, materiales: 3, requerimientos: 4, costos: 2 });
    igual([r.contadores.V, r.contadores.P, r.contadores.alm], [5, 1, await d(`select coalesce(max(n), 0) from public.contadores where empresa_id = 'al3d' and clave = 'alm'`)]);
    igual(typeof r.x_revisar, 'object');
    const otra = await llamar(SR(db), 'cuadre_hoja', { p_empresa: 'otra' });
    igual([otra.proyectos.total, otra.ventas.filas, otra.abonos.n, otra.contadores.V], [0, 0, 0, 0], 'otra empresa: todo en cero');
    for (const quien of ['dir', 'pag', 'fab']) await esperarError(sesionDe(db, db.u[quien]).rpc('cuadre_hoja', { p_empresa: 'al3d' }), '42501', quien);
    await esperarError(como(db, { rol: 'anon' }).rpc('cuadre_hoja', { p_empresa: 'al3d' }), '42501', 'anon');
  }));
  prueba('SY-13 el cursor del espejo vive en contadores (`espejo:ventas`, con su texto): lo escribe service_role y ningún cliente lo ve ni lo toca', () => conCopia(plantilla, async db => {
    const S = SRC(db);
    await S.query(`insert into public.contadores (empresa_id, clave, ventana, n, texto) values ('*', 'espejo:ventas', '', 0, '2026-10-01T00:00:00.000000Z|V-001') on conflict (empresa_id, clave, ventana) do update set texto = excluded.texto`);
    await S.query(`insert into public.contadores (empresa_id, clave, ventana, n, texto) values ('*', 'espejo:ventas', '', 0, '2026-10-02T00:00:00.000000Z|V-002') on conflict (empresa_id, clave, ventana) do update set texto = excluded.texto`);
    const f = await SR(db).query(`select clave, texto, updated_at is not null as con_hora from public.contadores where clave = 'espejo:ventas'`);
    igual(f.map(x => [x.clave, x.texto, x.con_hora]), [['espejo:ventas', '2026-10-02T00:00:00.000000Z|V-002', true]]);
    for (const quien of ['dir', 'pag', 'fab']) {
      await esperarError(sesionDe(db, db.u[quien]).query(`select * from public.contadores where clave = 'espejo:ventas'`), '42501', quien);
      await esperarError(sesionDe(db, db.u[quien]).query(`update public.contadores set texto = 'x' where clave = 'espejo:ventas'`), '42501', quien);
    }
    await esperarError(como(db, { rol: 'anon' }).query(`select * from public.contadores`), '42501', 'anon');
  }));
  prueba('SY-14 la bitácora entre rondas: los eventos nuevos llegan por cursor y los op_id repetidos no se duplican', () => conCopia(plantilla, async db => {
    const D = sesionDe(db, db.u.dir), P = sesionDe(db, db.u.pag, { confirmar: true });
    const cursor = async () => (await D.query(`select updated_at::text as ts, id from public.bitacora order by updated_at desc, id desc limit 1`))[0];
    const nuevos = async c => (await D.query(`select id, accion, op_id from public.bitacora where (updated_at, id) > ($1::timestamptz, $2::bigint) order by updated_at, id`, [c.ts, c.id]));
    const c0 = await cursor();
    igual(await nuevos(c0), [], 'sin novedades, nada llega');
    await llamar(P, 'registrar_cobro', { p_proyecto: 'p4', p_monto: 100, p_liquidar: false, p_op_id: 'sy14' });
    const r1 = await nuevos(c0);
    igual(r1.map(x => [x.accion, x.op_id]), [['cobro', 'cobro:sy14']]);
    const c1 = await cursor();
    await llamar(P, 'registrar_cobro', { p_proyecto: 'p4', p_monto: 100, p_liquidar: false, p_op_id: 'sy14' });
    igual(await nuevos(c1), [], 'el mismo op_id no deja eventos nuevos');
    await llamar(P, 'registrar_cobro', { p_proyecto: 'p4', p_monto: 5, p_liquidar: false, p_op_id: 'sy14b' });
    igual((await nuevos(c1)).map(x => x.op_id), ['cobro:sy14b']);
    igual((await una(db, `select count(*)::int as n from public.bitacora where op_id = 'cobro:sy14'`)).n, 1);
  }));
});

await resumen();
