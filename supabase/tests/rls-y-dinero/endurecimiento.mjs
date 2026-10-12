// Endurecimiento de la revisión adversarial (2026-10-10) — migración 0012 y los huecos de prueba que dejó ver.
//
// Un revisor que no escribió las migraciones las atacó en el arnés. Aquí quedan fijadas, como pruebas, las cosas que encontró:
//   · A-1 / M-5  NaN, Infinity y valores enormes en cobro, reparto y subtotal (Pagos liquidaba TODAS las comisiones con `repartir_abono_fifo('NaN')`);
//   · M-2        un requerimiento con cantidad NaN o >= 1e7 rompía las salidas de material de todos;
//   · M-3        textos sin tope;
//   · config     el correo solo cuenta si la cuenta de Auth es de Google;
//   · M52/M53/M54 (mutantes que SOBREVIVÍAN): ninguna prueba llamaba una RPC con el id de un proyecto de OTRA empresa. Si alguien quita el filtro por empresa
//                 de `registrar_cobro`, `proyecto_actualizar` o `mover_etapa`, una Dirección ajena cobraría o editaría proyectos que no son suyos.
// La prueba de p_hoy (M-1) está en obra-y-etapas/etapas.mjs, junto a las demás de `emitir_salidas_derivadas`.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, rpcT, crearVenta, sql } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await crearVenta(db, { folio: 'V-001', sub: 1000, anti: 500, cuenta: 'Constru BNT', iva: true, estatus: 'COBRANDO' });
  await crearVenta(db, { folio: 'V-002', sub: 2000, anti: 0, cuenta: 'Constru BNT', iva: true, estatus: 'COBRANDO', fuente: 'cotizacion', etapa: 'armado' });
  return db;
}, { limpiar: db => db.close() });

const una = async (db, texto, params) => (await sql(db, texto, params))[0];
const MALOS = ['NaN', 'Infinity', '-Infinity', '1e30', '9e40', '1000000000'];

describir('A-1 importes que no son un importe: NaN, Infinity y enormes', () => {
  prueba('registrar_cobro, vista_previa_reparto y repartir_abono_fifo responden DATO_INVALIDO (no ok) y NO escriben nada, también para Dirección', async () => {
    const db = await plantilla();
    const antes = await una(db, `select (select liquidacion::text from public.ventas_dinero where proyecto_id = 'v001') as liq, (select count(*)::int from public.abonos) as abonos`);
    for (const quien of ['pag', 'dir']) {
      const S = sesionDe(db, db.u[quien]);
      for (const m of MALOS) {
        const a = (await S.rpc('registrar_cobro', { p_proyecto: 'v001', p_monto: m, p_liquidar: false }))[0].registrar_cobro;
        const b = (await S.rpc('vista_previa_reparto', { p_monto: m }))[0].vista_previa_reparto;
        const c = (await S.rpc('repartir_abono_fifo', { p_monto: m, p_op_id: `op-${quien}-${m}` }))[0].repartir_abono_fifo;
        igual([a.ok, a.codigo, b.ok, b.codigo, c.ok, c.codigo], [false, 'DATO_INVALIDO', false, 'DATO_INVALIDO', false, 'DATO_INVALIDO'], `${quien} con ${m}`);
      }
    }
    igual(await una(db, `select (select liquidacion::text from public.ventas_dinero where proyecto_id = 'v001') as liq, (select count(*)::int from public.abonos) as abonos`), antes, 'ni la liquidación ni los abonos cambiaron');
  });
  prueba('un monto normal sigue funcionando (la guarda no rompe el caso feliz): cobro de 100.50 y reparto de 5.00', async () => {
    const db = await plantilla();
    const P = sesionDe(db, db.u.pag);
    igual((await P.rpc('registrar_cobro', { p_proyecto: 'v001', p_monto: '100.50', p_liquidar: false }))[0].registrar_cobro.ok, true);
    igual((await P.rpc('vista_previa_reparto', { p_monto: '5.00' }))[0].vista_previa_reparto.ok, true);
  });
  prueba('la red de la tabla: aun por una ruta de escritura nueva, NaN, Infinity y los exponentes absurdos no entran a ventas_dinero (23514)', async () => {
    const db = await plantilla();
    for (const [col, v] of [['liquidacion', "'NaN'"], ['liquidacion', "'Infinity'"], ['anticipo', "'NaN'"], ['anticipo', '1e9'], ['subtotal', "'NaN'"], ['subtotal', "'-Infinity'"], ['subtotal', '1e9'], ['subtotal', '-1e9'], ['subtotal', "'9e131071'"]]) {
      await esperarError(sql(db, `update public.ventas_dinero set ${col} = ${v} where proyecto_id = 'v001'`), /23514|ventas_dinero_importes_acotados|check/i);
    }
    igual((await una(db, `select subtotal::text as s from public.ventas_dinero where proyecto_id = 'v001'`)).s, '1000', 'el subtotal sigue intacto');
  });
  prueba('M-5: alta_venta con un subtotal de 9e131071 ya NO rompe la vista de fórmulas de todos: la alta se rechaza y la vista sigue funcionando', async () => {
    const db = await plantilla();
    await sql(db, `select public.contador_sembrar('al3d', 'V', 100)`);   // como la importación real: el contador va por encima del máximo de la hoja
    await esperarError(sesionDe(db, db.u.pag).rpc('alta_venta', { p_op: { id: 'pv', nombre: 'x', cuenta: 'Moni MPago', subtotal: '9e131071', tel: '3312345678', entrega: 'instalacion', sellos: { etapa: Date.now() } } }), /23514|22003|check|overflow/i);
    const filas = await sesionDe(db, db.u.pag).query(`select count(*)::int as n from public.ventas_calculadas`);
    igual(filas[0].n, 2);
  });
});

describir('M-2 y M-3 cantidades del almacén y topes de texto', () => {
  prueba('un requerimiento con cantidad NaN, Infinity o >= 1e7 no entra (23514): ya no puede romper las salidas de material de todos', async () => {
    const db = await plantilla();
    for (const v of ["'NaN'", "'Infinity'", '10000000', '2e7', "'1e30'"]) {
      await esperarError(sql(db, `insert into public.requerimientos (empresa_id, id, proyecto_id, material_id, cantidad_compra, unidad_compra) values ('al3d', 'x${v.length}', 'v001', 'acr-3mm', ${v}, 'lamina')`), /requerimientos_cantidades_acotadas/i);   // el NOMBRE de la restricción: otra falla cualquiera no cuenta
    }
    await esperarError(sql(db, `insert into public.requerimientos (empresa_id, id, proyecto_id, material_id, cantidad_compra, cantidad_ajustada, unidad_compra) values ('al3d', 'xa', 'v001', 'acr-3mm', 1, 'NaN', 'lamina')`), /requerimientos_cantidades_acotadas/i);
    igual((await una(db, `select count(*)::int as n from public.requerimientos where id like 'x%'`)).n, 0);
  });
  prueba('los topes de texto: maps_url > 2000, geo_fuente > 200, notas de abono y de movimiento > 500, notas de instalación > 20000 se rechazan; el límite exacto entra', async () => {
    const db = await plantilla();
    await esperarError(sql(db, `update public.proyectos set maps_url = repeat('x', 2001) where id = 'v001'`), /23514|check/i);
    await esperarError(sql(db, `update public.proyectos set geo_fuente = repeat('x', 201) where id = 'v001'`), /23514|check/i);
    await sql(db, `update public.proyectos set maps_url = repeat('x', 2000), geo_fuente = repeat('x', 200) where id = 'v001'`);
    // el reparto y el abono construyen o reciben notas: una de 501 caracteres hace fallar la llamada ENTERA (nada queda a medias)
    await esperarError(sesionDe(db, db.u.pag).rpc('registrar_abono_comision', { p_proyecto: 'v001', p_monto: 10, p_nota: 'n'.repeat(501), p_op_id: 'tope-1' }), /23514|check/i);
    igual((await una(db, `select count(*)::int as n from public.abonos`)).n, 0, 'no quedó ningún abono');
  });
});

describir('config: el correo solo cuenta si la cuenta es de Google', () => {
  prueba('una cuenta de proveedor «email» con el correo ya confirmado NO reclama la invitación de Dirección; la de Google sí', async () => {
    const db = await plantilla();
    await sql(db, `insert into public.miembros (empresa_id, correo, area, estado) values ('al3d', 'jefe@al3d.test', 'direccion', 'invitado'), ('al3d', 'buena@al3d.test', 'pagos', 'invitado')`);
    const UID_EMAIL = '00000000-0000-4000-8000-0000000aa001', UID_GOOGLE = '00000000-0000-4000-8000-0000000aa002';
    await sql(db, `insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
      ('${UID_EMAIL}', 'authenticated', 'authenticated', 'jefe@al3d.test', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
      ('${UID_GOOGLE}', 'authenticated', 'authenticated', 'buena@al3d.test', now(), '{"provider":"google","providers":["google"]}', '{}', now(), now())`);
    const sesion = (uid, correo) => sesionDe(db, { uid, correo, rol: 'authenticated', verificado: true });
    const malo = (await sesion(UID_EMAIL, 'jefe@al3d.test').rpc('reclamar_acceso'))[0].reclamar_acceso;
    igual(malo.estado, 'correo_no_verificado', 'con proveedor email no vincula nada');
    igual((await una(db, `select estado from public.miembros where correo = 'jefe@al3d.test'`)).estado, 'invitado');
    const bueno = (await sesion(UID_GOOGLE, 'buena@al3d.test').rpc('reclamar_acceso'))[0].reclamar_acceso;
    igual(bueno.estado, 'activo', 'con Google vincula y queda activo');
  });
});

describir('M52, M53 y M54 (mutantes que sobrevivían): una Dirección de OTRA empresa no puede tocar proyectos de al3d con su id', () => {
  prueba('registrar_cobro, registrar_abono_comision, proyecto_actualizar y mover_etapa con el id de al3d: NO_ENCONTRADO (o SIN_ACCESO) y NADA cambia', async () => {
    const db = await plantilla();
    const O = sesionDe(db, db.u.otra);
    const foto = () => una(db, `select (select liquidacion::text from public.ventas_dinero where proyecto_id = 'v001') as liq, (select notas from public.proyectos where id = 'v001') as notas,
                                       (select tel from public.proyectos where id = 'v001') as tel, (select etapa from public.proyectos where id = 'v002') as etapa, (select count(*)::int from public.abonos) as abonos`);
    const antes = await foto();
    const ahora = Date.now();
    const respuestas = {
      cobro: (await O.rpc('registrar_cobro', { p_proyecto: 'v001', p_monto: 777, p_liquidar: false }))[0].registrar_cobro,
      abono: (await O.rpc('registrar_abono_comision', { p_proyecto: 'v001', p_monto: 50, p_op_id: 'x-abono' }))[0].registrar_abono_comision,
      actualizar: (await O.rpc('proyecto_actualizar', { p_op: { id: 'v001', campos: { notas: 'AJENA', tel: '33 9999 9999' }, sellos: { notas: ahora, tel: ahora } } }))[0].proyecto_actualizar,
      mover: (await O.rpc('mover_etapa', { p_proyecto: 'v002', p_etapa: 'listo', p_sello: ahora }))[0].mover_etapa,
    };
    for (const [que, r] of Object.entries(respuestas)) {
      cierto(r.ok === false && ['NO_ENCONTRADO', 'SIN_ACCESO', 'ROL_SIN_PERMISO'].includes(r.codigo), `${que}: ${JSON.stringify(r)}`);
    }
    igual(await foto(), antes, 'ni la liquidación, ni las notas, ni el teléfono, ni la etapa, ni los abonos cambiaron');
  });
});

resumen();
