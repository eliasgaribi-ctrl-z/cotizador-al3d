// Los huecos «Abierto, a propósito» de la revisión adversarial (docs/ESTADO-SUPABASE.md) — migración 0013_huecos_revision.sql.
//
// Cada bloque FALLA sin 0013 y pasa con ella (se comprobó quitando el archivo de supabase/migrations y corriendo esta prueba):
//   H-1  subida_unica · bitácora: el servidor pone quién, su área y la hora; nadie ocupa el op_id de otro;
//   H-2  subida_unica · cotizaciones: nada nace «autorizada» sin la fila vigente del servidor con el mismo código;
//   H-3  sellos (Q-06): 0013 puso una decisión provisional (60 s para los roles bajos y Dirección gana ante ellos); Elías la cambió el 2026-10-16 y
//        0014_sellos_mas_reciente.sql la deshace: gana el más reciente, con 10 min de holgura para todas las áreas. El bloque H-3 prueba ESO;
//   H-4  almacen_movimientos.ts: no más de un día en el futuro;
//   H-5  Pagos no crea requerimientos;
//   H-6  authenticated (y anon) no crean tablas temporales.
// Y la auditoría de 0011 sigue limpia con todo lo nuevo.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sembrarAlmacen, sesionDe, llamar, una, sql, conCopia, como } from '../comun/semilla.js';
import { insertarAutorizacion } from '../comun/notario.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  await sembrarAlmacen(db);
  return db;
}, { limpiar: db => db.close() });

/** Una llamada como `quien`, CONFIRMADA (las pruebas trabajan sobre una copia). */
const rpc = (db, quien, nombre, args) => llamar(sesionDe(db, db.u[quien], { confirmar: true }), nombre, args);
const ahora = () => Date.now();

describir('H-1 subida_unica: la bitácora la firma el servidor', () => {
  prueba('Fabricación sube un «Cobro de $999,999» que dice venir de Pagos: queda a nombre de Fabricación, con su rol y la hora del servidor', () => conCopia(plantilla, async db => {
    const r = await rpc(db, 'fab', 'subida_unica', { p_lote: { disp: 'FAB1', bitacora: [{ id: 'x1', accion: 'cobro', titulo: 'Cobro de $999,999', usuario: 'pag@al3d.test', rol: 'pagos', ts: 1_500_000_000_000 }] } });
    igual(r.acuse.map(x => x.estado), ['creada']);
    const b = await una(db, `select usuario_texto, rol, usuario_id::text as u, extract(epoch from ts) * 1000 as ts, procedencia -> 'ts_cliente' as tc from public.bitacora where titulo = 'Cobro de $999,999'`);
    igual([b.usuario_texto, b.rol, b.u], [db.u.fab.correo, 'fabricacion', db.u.fab.uid]);
    cierto(Math.abs(Number(b.ts) - ahora()) < 120_000, 'la hora es la del servidor, no la de 2017 que mandó el teléfono');
    igual(b.tc, null, 'una hora absurda (antes de 2020) ni siquiera queda como dato declarado');
  }));
  prueba('nadie ocupa el op_id de otro: Fabricación sube primero «PAG1/b1» y el evento real de Pagos con el mismo aparato e id SÍ entra', () => conCopia(plantilla, async db => {
    const falso = await rpc(db, 'fab', 'subida_unica', { p_lote: { disp: 'PAG1', bitacora: [{ id: 'b1', accion: 'etapa', titulo: 'falso' }] } });
    const real = await rpc(db, 'pag', 'subida_unica', { p_lote: { disp: 'PAG1', bitacora: [{ id: 'b1', accion: 'etapa', titulo: 'real' }] } });
    igual([falso.acuse[0].estado, real.acuse[0].estado], ['creada', 'creada']);
    const f = await sql(db, `select titulo, usuario_id::text as u, op_id from public.bitacora where dispositivo = 'PAG1' order by titulo`);
    igual(f.map(x => [x.titulo, x.u, x.op_id]), [['falso', db.u.fab.uid, 'tel:' + db.u.fab.uid + ':PAG1:b1'], ['real', db.u.pag.uid, 'tel:' + db.u.pag.uid + ':PAG1:b1']]);
    igual((await rpc(db, 'pag', 'subida_unica', { p_lote: { disp: 'PAG1', bitacora: [{ id: 'b1', accion: 'etapa', titulo: 'real' }] } })).acuse[0].estado, 'ya_estaba', 'y el reintento del dueño sigue siendo idempotente');
  }));
});

describir('H-2 subida_unica: una cotización no nace autorizada sin sello del servidor', () => {
  const entrada = (n, sello) => ({ folio: 'COT-' + String(n).padStart(4, '0') + '-B', disp: 'K7QM', proy: 'Tacos ' + n, cliente: 'Juan', items: [{ id: 1 }], ...(sello ? { sello } : {}) });
  prueba('sin sello, con un sello inventado o con el código de OTRA autorización: «retirada» y procedencia.sin_sello_valido; con la vigente y su código: «autorizada» y enlazada', () => conCopia(plantilla, async db => {
    const id = await insertarAutorizacion(db, { folio_global: 'COT-0042-B@K7QM' });
    const { codigo } = await una(db, `select codigo from public.autorizaciones where id = $1`, [id]);
    await insertarAutorizacion(db, { folio_global: 'COT-0043-B@K7QM', estado: 'revocada' });
    const r = await rpc(db, 'pag', 'subida_unica', { p_lote: { disp: 'K7QM', cotizaciones: [
      entrada(41), entrada(44, { codigo: 'AAAA-BBBB-CCCC', folio: 'COT-0044-B@K7QM' }), entrada(43, { codigo }), entrada(42, { codigo: codigo.toLowerCase().replace(/-/g, ' ') })] } });
    igual(r.acuse.map(x => x.estado), ['creada', 'creada', 'creada', 'creada']);
    const f = await sql(db, `select folio, estado, autorizacion_id, procedencia ? 'sin_sello_valido' as sin from public.cotizaciones order by folio`);
    igual(f.map(x => [x.folio, x.estado, x.autorizacion_id, x.sin]), [
      ['COT-0041-B', 'retirada', null, true], ['COT-0042-B', 'autorizada', id, false], ['COT-0043-B', 'retirada', null, true], ['COT-0044-B', 'retirada', null, true]]);
    igual((await una(db, `select procedencia -> 'sello_local' ->> 'codigo' as c from public.cotizaciones where folio = 'COT-0044-B'`)).c, 'AAAA-BBBB-CCCC', 'el sello local no se pierde');
  }));
});

describir('H-3 sellos (Q-06, decidida por Elías el 2026-10-16; 0014): gana el más reciente, con 10 min de holgura para TODAS las áreas', () => {
  const editar = (db, quien, campos, sellos) => rpc(db, quien, 'proyecto_actualizar', { p_op: { id: 'p1', campos, sellos } });
  const fila = db => una(db, `select notas, tel, dir_texto, etapa, sellos from public.proyectos where id = 'p1'`);
  prueba('Fabricación, Pagos y Dirección con el reloj una hora adelantado: el sello de los tres se acota a ahora + 10 min (ni 60 s ni distinto por área)', () => conCopia(plantilla, async db => {
    const t = ahora();
    await editar(db, 'fab', { notas: 'del futuro' }, { notas: t + 3_600_000 });
    await editar(db, 'pag', { tel: '33 1111 1111' }, { tel: t + 3_600_000 });
    await editar(db, 'dir', { dir_texto: 'futuro de Dirección' }, { dir_texto: t + 3_600_000 });
    const s = (await fila(db)).sellos;
    for (const g of ['notas', 'tel', 'dir_texto']) cierto(Math.abs(Number(s[g]) - (t + 600_000)) < 30_000, g + ': ' + (Number(s[g]) - t) + ' ms por delante');
  }));
  prueba('conflicto: Fabricación escribe con un sello más NUEVO y Dirección, con uno más viejo, PIERDE («viejos»); con uno más nuevo, gana', () => conCopia(plantilla, async db => {
    const t = ahora();
    await editar(db, 'fab', { notas: 'de Fabricación' }, { notas: t });
    const vieja = await editar(db, 'dir', { notas: 'de Dirección, vieja' }, { notas: t - 300_000 });
    igual([vieja.ok, vieja.escritos, vieja.viejos.map(v => v.nombre)], [true, [], ['notas']]);
    igual([(await fila(db)).notas, Number((await fila(db)).sellos.notas)], ['de Fabricación', t], 'ni el valor ni el sello cambian');
    cierto(!('sellos_area' in vieja.remoto), 'el teléfono recibe la fila sin sellos_area (la columna ya no existe)');
    const nueva = await editar(db, 'dir', { notas: 'de Dirección, nueva' }, { notas: t + 1 });
    igual([nueva.escritos, (await fila(db)).notas, Number((await fila(db)).sellos.notas)], [['notas'], 'de Dirección, nueva', t + 1]);
  }));
  prueba('al revés, igual: Dirección escribe primero y Fabricación, con un sello más nuevo, gana; el empate escribe', () => conCopia(plantilla, async db => {
    const t = ahora();
    await editar(db, 'dir', { notas: 'de Dirección' }, { notas: t });
    igual((await editar(db, 'fab', { notas: 'de Fabricación' }, { notas: t + 5 })).escritos, ['notas']);
    igual((await editar(db, 'dir', { notas: 'empate' }, { notas: t + 5 })).escritos, ['notas'], 'el empate escribe (como en el .gs)');
    igual((await fila(db)).notas, 'empate');
  }));
  prueba('lo mismo ante Pagos (teléfono), en la etapa (mover_etapa) y en la cita (instalacion_guardar): el más viejo pierde, el más nuevo gana', () => conCopia(plantilla, async db => {
    const t = ahora();
    await editar(db, 'pag', { tel: '33 1111 1111' }, { tel: t });
    igual((await editar(db, 'dir', { tel: '33 2222 2222' }, { tel: t - 60_000 })).viejos.map(v => v.nombre), ['tel']);
    igual((await editar(db, 'dir', { tel: '33 3333 3333' }, { tel: t + 1_000 })).escritos, ['tel']);
    await rpc(db, 'fab', 'mover_etapa', { p_proyecto: 'p1', p_etapa: 'armado', p_sello: t });
    const m = await rpc(db, 'dir', 'mover_etapa', { p_proyecto: 'p1', p_etapa: 'listo', p_sello: t - 60_000 });
    igual([m.ok, m.viejos.map(v => v.nombre), m.remoto.etapa], [true, ['etapa'], 'armado']);
    igual((await rpc(db, 'dir', 'mover_etapa', { p_proyecto: 'p1', p_etapa: 'listo', p_sello: t + 1_000 })).etapa, 'listo');
    await rpc(db, 'fab', 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-01', sello: t } });
    const i = await rpc(db, 'dir', 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-02', sello: t - 60_000 } });
    igual([i.ok, i.viejos.map(v => v.nombre), i.instalacion.fecha], [true, ['instalacion'], '2026-12-01']);
    igual((await rpc(db, 'dir', 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-02', sello: t + 1_000 } })).instalacion.fecha, '2026-12-02');
    const f = await fila(db);
    igual([f.tel, f.etapa], ['33 3333 3333', 'listo']);
  }));
  prueba('lo de la decisión provisional ya no existe: ni la columna sellos_area, ni su trigger, ni compuerta_con_autor, holgura_sello_ms o area_actual', async () => {
    const db = await plantilla();
    igual((await una(db, `select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'proyectos' and column_name = 'sellos_area'`)).n, 0);
    igual((await una(db, `select count(*)::int as n from pg_trigger where tgname = 'proyectos_sellos_autor'`)).n, 0);
    igual((await sql(db, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'interno' and p.proname in ('compuerta_con_autor', 'holgura_sello_ms', 'area_actual', 'proyectos_sellos_autor')`)).map(x => x.proname), []);
    igual((await una(db, `select provolatile as v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'interno' and p.proname = 'sello_valido'`)).v, 'i', 'sello_valido vuelve a ser immutable');
  });
});

describir('H-4 almacen_movimientos.ts con tope', () => {
  const mov = (id, ts) => ({ id, almacen: 'movimientos', datos: { id, material_id: 'acr-3mm', tipo: 'conteo', cantidad: 3, unidad_compra: 'lamina', origen: 'conteo', ts } });
  prueba('un conteo con sello de dentro de dos días (o de 2099) es DATO_INVALIDO definitivo y no entra; dentro de 12 h sí', () => conCopia(plantilla, async db => {
    const r = await rpc(db, 'fab', 'almacen_aplicar', { p_ops: [mov('futuro', ahora() + 2 * 86_400_000), mov('2099', 4_102_444_800_000), mov('pronto', ahora() + 12 * 3_600_000)] });
    igual(r.resultados.map(x => (x.ok ? 'ok' : x.codigo)), ['DATO_INVALIDO', 'DATO_INVALIDO', 'ok']);
    igual(r.resultados[0].definitivo, true);
    igual((await sql(db, `select id from public.almacen_movimientos where id in ('futuro', '2099', 'pronto') order by id`)).map(x => x.id), ['pronto']);
  }));
  prueba('el tope vale también para quien escribe directo (service_role, el importador): 22023', () => conCopia(plantilla, async db => {
    await esperarError(como(db, { rol: 'service_role' }).query(`insert into public.almacen_movimientos (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, ts)
                                                               values ('al3d', 'imp', 'acr-3mm', 'conteo', 1, 'lamina', 'conteo', 4102444800000)`), '22023');
  }));
});

describir('H-5 Pagos no crea requerimientos', () => {
  const req = (id, datos, campos) => ({ id: 'op-' + id, almacen: 'requerimientos', registro_id: id, datos: { id, ...datos }, ...(campos ? { campos } : {}) });
  prueba('Pagos con un requerimiento NUEVO completo (aunque diga solo «estado: consumido»): ROL_SIN_PERMISO definitivo y no se crea; sobre uno que existe, marcar consumido sigue pasando', () => conCopia(plantilla, async db => {
    const nuevo = req('p3:led-12v', { proyecto_id: 'p3', material_id: 'led-12v', unidad_compra: 'metro', cantidad_compra: 999, estado: 'consumido' }, ['estado']);
    const existe = req('p1:acr-3mm', { estado: 'consumido' }, ['estado']);
    const r = await rpc(db, 'pag', 'almacen_aplicar', { p_ops: [nuevo, existe] });
    igual(r.resultados.map(x => (x.ok ? 'ok' : x.codigo)), ['ROL_SIN_PERMISO', 'ok']);
    igual(r.resultados[0].definitivo, true);
    igual((await una(db, `select count(*)::int as n from public.requerimientos where id = 'p3:led-12v'`)).n, 0);
    igual((await una(db, `select estado from public.requerimientos where id = 'p1:acr-3mm'`)).estado, 'consumido');
  }));
  prueba('Fabricación y Dirección sí crean (contraprueba)', () => conCopia(plantilla, async db => {
    for (const [quien, mat] of [['fab', 'led-12v'], ['dir', 'pegamento']]) {
      const r = await rpc(db, quien, 'almacen_aplicar', { p_ops: [req('p3:' + mat, { proyecto_id: 'p3', material_id: mat, unidad_compra: 'unidad', cantidad_compra: 1 })] });
      igual([quien, r.resultados[0].ok, r.resultados[0].creada], [quien, true, true]);
    }
  }));
});

describir('H-6 tablas temporales', () => {
  prueba('authenticated (los tres roles) y anon NO pueden crear tablas temporales: 42501', async () => {
    const db = await plantilla();
    for (const quien of ['dir', 'fab', 'pag']) await esperarError(sesionDe(db, db.u[quien]).query('create temp table t_fuga (i int)'), '42501');
    await esperarError(como(db, { rol: 'anon' }).query('create temp table t_fuga (i int)'), '42501');
    igual((await una(db, `select has_database_privilege('authenticated', current_database(), 'TEMPORARY') as a, has_database_privilege('anon', current_database(), 'TEMPORARY') as b`)), { a: false, b: false });
  });
  prueba('los demás roles lo conservan: service_role y postgres (la prueba de humo crea una función temporal como postgres)', async () => {
    const db = await plantilla();
    igual(await una(db, `select has_database_privilege('service_role', current_database(), 'TEMPORARY') as s, has_database_privilege('postgres', current_database(), 'TEMPORARY') as p,
                                has_database_privilege('authenticator', current_database(), 'TEMPORARY') as a`), { s: true, p: true, a: true });
  });
});

describir('la auditoría de 0011 sigue limpia', () => {
  prueba('interno.auditoria() = {} con todo lo de 0013 y 0014 aplicado', async () => {
    igual((await una(await plantilla(), `select interno.auditoria() as p`)).p, []);
  });
});

await resumen();
