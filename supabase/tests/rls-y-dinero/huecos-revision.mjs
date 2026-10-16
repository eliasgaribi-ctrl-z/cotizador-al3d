// Los huecos «Abierto, a propósito» de la revisión adversarial (docs/ESTADO-SUPABASE.md) — migración 0013_huecos_revision.sql.
//
// Cada bloque FALLA sin 0013 y pasa con ella (se comprobó quitando el archivo de supabase/migrations y corriendo esta prueba):
//   H-1  subida_unica · bitácora: el servidor pone quién, su área y la hora; nadie ocupa el op_id de otro;
//   H-2  subida_unica · cotizaciones: nada nace «autorizada» sin la fila vigente del servidor con el mismo código;
//   H-3  sellos (Q-06, DECISIÓN PROVISIONAL): holgura de 60 s para los roles bajos (10 min Dirección) y Dirección gana ante Fabricación o Pagos;
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

describir('H-3 sellos (Q-06, provisional): holgura de 60 s para los roles bajos y Dirección gana ante ellos', () => {
  const editar = (db, quien, campos, sellos) => rpc(db, quien, 'proyecto_actualizar', { p_op: { id: 'p1', campos, sellos } });
  const fila = db => una(db, `select notas, etapa, sellos, sellos_area from public.proyectos where id = 'p1'`);
  prueba('Fabricación con el reloj una hora adelantado: su sello se guarda a lo más en ahora + 60 s (antes, 10 min)', () => conCopia(plantilla, async db => {
    const t = ahora();
    await editar(db, 'fab', { notas: 'del futuro' }, { notas: t + 3_600_000 });
    const g = Number((await fila(db)).sellos.notas);
    cierto(g - t <= 90_000 && g - t >= 30_000, 'se guardó ' + (g - t) + ' ms por delante');
  }));
  prueba('Dirección conserva su holgura de 10 min', () => conCopia(plantilla, async db => {
    const t = ahora();
    await editar(db, 'dir', { notas: 'futuro de Dirección' }, { notas: t + 3_600_000 });
    cierto(Math.abs(Number((await fila(db)).sellos.notas) - (t + 600_000)) < 30_000);
  }));
  prueba('conflicto: Fabricación escribe con un sello del futuro y Dirección, con uno anterior, GANA; el sello sube a guardado + 1 y el autor queda «direccion»', () => conCopia(plantilla, async db => {
    const t = ahora();
    await editar(db, 'fab', { notas: 'de Fabricación' }, { notas: t + 50_000 });
    const antes = await fila(db);
    igual(antes.sellos_area.notas, 'fabricacion');
    const r = await editar(db, 'dir', { notas: 'de Dirección' }, { notas: t - 300_000 });
    igual([r.ok, r.escritos, r.viejos], [true, ['notas'], []]);
    const despues = await fila(db);
    igual([despues.notas, Number(despues.sellos.notas), despues.sellos_area.notas], ['de Dirección', Number(antes.sellos.notas) + 1, 'direccion']);
    cierto(!('sellos_area' in r.remoto), 'el teléfono no recibe sellos_area en «remoto»');
    const otra = await editar(db, 'fab', { notas: 'reintento de Fabricación' }, { notas: Number(antes.sellos.notas) });
    igual(otra.viejos.map(v => v.nombre), ['notas'], 'el reintento de Fabricación con su mismo sello ya no empata: pierde');
  }));
  prueba('lo mismo ante Pagos (teléfono), en la etapa (mover_etapa) y en la cita (instalacion_guardar)', () => conCopia(plantilla, async db => {
    const t = ahora();
    await editar(db, 'pag', { tel: '33 1111 1111' }, { tel: t });
    igual((await editar(db, 'dir', { tel: '33 2222 2222' }, { tel: t - 60_000 })).escritos, ['tel']);
    await rpc(db, 'fab', 'mover_etapa', { p_proyecto: 'p1', p_etapa: 'armado', p_sello: t });
    const m = await rpc(db, 'dir', 'mover_etapa', { p_proyecto: 'p1', p_etapa: 'listo', p_sello: t - 60_000 });
    igual([m.ok, m.etapa], [true, 'listo']);
    await rpc(db, 'fab', 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-01', sello: t } });
    const i = await rpc(db, 'dir', 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-02', sello: t - 60_000 } });
    igual([i.ok, i.instalacion.fecha, i.viejos], [true, '2026-12-02', []]);
    const f = await una(db, `select tel, etapa, sellos_area from public.proyectos where id = 'p1'`);
    igual([f.tel, f.etapa, f.sellos_area.tel, f.sellos_area.etapa, f.sellos_area.instalacion], ['33 2222 2222', 'listo', 'direccion', 'direccion', 'direccion']);
  }));
  prueba('NO cambia: contra otro teléfono de Dirección, o contra un sello de origen desconocido (la importación), gana el más reciente', () => conCopia(plantilla, async db => {
    const t = ahora();
    await editar(db, 'dir2', { notas: 'de dir2' }, { notas: t });
    igual((await editar(db, 'dir', { notas: 'de dir, vieja' }, { notas: t - 60_000 })).viejos.map(v => v.nombre), ['notas']);
    igual((await fila(db)).notas, 'de dir2');
    // el sello de etapa de la semilla (100) lo puso el «importador»: sin autor
    igual((await fila(db)).sellos_area.etapa, undefined);
    const m = await rpc(db, 'dir', 'mover_etapa', { p_proyecto: 'p1', p_etapa: 'armado', p_sello: 50 });
    igual(m.viejos.map(v => v.nombre), ['etapa']);
    const vacia = await editar(db, 'dir', { notas: '' }, { notas: 0 });
    igual(vacia.escritos, [], 'un cambio SIN sello de Dirección no gana nada');
  }));
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
  prueba('interno.auditoria() = {} con todo lo de 0013 aplicado', async () => {
    igual((await una(await plantilla(), `select interno.auditoria() as p`)).p, []);
  });
});

await resumen();
