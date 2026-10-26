// Lo que la auditoría del 2026-10-25 arregló en la base (0028_auditoria_base.sql, docs/AUDITORIA-SUPABASE-2026-10.md). Datos de mentiras.
//
//   A28-01  CZ-1 con la base mandando, Pagos da de alta la venta que viene de una cotización (`ganar_proyecto`): su V-### de la base, la cita
//           PROPUESTA (como en alta_venta) y la bitácora; la de Dirección sigue naciendo confirmada
//   A28-02  CZ-1 `mi_acceso` le dice al teléfono de Pagos que puede (`permisos.alta.ganar_proyecto`), que es lo que lee el relevo; a Fabricación, no
//   A28-03  CZ-1 con la hoja mandando, Pagos NO: DATO_INVALIDO definitivo y nada escrito, ni un V-### (aunque traiga el de la hoja); Dirección sí,
//           como siempre (la sombra la usa con el V-### de la hoja)
//   A28-04  CZ-1 el orden de 0026: el área (Fabricación, ROL_SIN_PERMISO), la validación, «ya existía» (el reintento de una que sí entró, aunque se
//           haya vuelto a la hoja) y entonces el modo
//   A28-05  CZ-5 el IVA lo pone la cuenta también cuando gana Pagos (ya era así desde 0006: `normalizar_iva`; esto lo deja escrito)
//   A28-06  DN-2 el reparto ya no le paga a una venta cancelada: ni la vista previa ni el reparto la tocan; una histórica (sin etapa) sigue entrando;
//           la T de la vista de fórmulas no cambia
//   A28-07  DN-3 `registrar_cobro`: la fecha de liquidación solo avanza (un cobro olvidado con fecha vieja no la regresa)
//   A28-08  el reintento de un «Se ganó» que entró CON su cita contesta «ya existía» (antes: «Ese id de instalación ya existe», definitivo, y la
//           bandeja lo apartaba sin que el teléfono recibiera su V-###); para Dirección y para Pagos. Una cita ajena con ese id se sigue negando
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, rpcT, llamar, crearVenta, sql, una, conCopia, conLaBaseMandando, ORIGEN_COMPLETO } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  return db;
}, { limpiar: db => db.close() });

const AHORA = () => Date.now();
const GANAR = (extra = {}, venta = {}) => ({ p_op: {
  id: 'g1', folio_global: 'COT-0100@K7QM', folio_local: 'COT-0100', dispositivo: 'K7QM', entrada: ORIGEN_COMPLETO, nombre: 'Rosa - Tienda (Letras)', contacto: 'Rosa', negocio: 'Tienda',
  tel: '33 1111 2222', tipo_trabajo: ['Letras 3D con iluminacion'], fecha_anticipo: '2026-10-05', entrega: 'instalacion', fecha_instalacion: '2027-01-20', hora: '10:00',
  venta: { sub: 10000, neto: 11600, anti: 5800, iva: true, cuenta: 'Constru BNT', estatus: 'COBRANDO', pct_comision: 10, precio_auth: 10000, ...venta },
  sellos: { etapa: AHORA(), tel: AHORA() }, ...extra } });
/** Una llamada que se CONFIRMA (como PostgREST): lo que escribe se queda para la siguiente. */
const ganar = (db, quien, args) => llamar(sesionDe(db, db.u[quien], { confirmar: true }), 'ganar_proyecto', args);
const modo = (db, m) => sql(db, `update public.empresas set modo = $1, modo_desde = now() where id = 'al3d'`, [m]);
/** Todo lo que un alta escribe, contado como dueño: si una negativa deja esto igual, no escribió nada. */
const huella = async db => (await sql(db, `select (select count(*)::int from public.proyectos) as proyectos, (select count(*)::int from public.ventas_dinero) as dinero,
  (select count(*)::int from public.instalaciones) as citas, (select count(*)::int from public.bitacora) as bitacora,
  (select coalesce(max(n), 0)::int from public.contadores where empresa_id = 'al3d' and clave = 'V') as contador_v`))[0];

describir('A28-01 y A28-02 con la base mandando, Pagos da de alta la venta del Cotizador (CZ-1)', () => {
  prueba('A28-01 Pagos: ok con el V-### del contador de la base; la cita nace PROPUESTA y la bitácora tiene sus dos líneas; la de Dirección nace confirmada', async () => conCopia(plantilla, async db => {
    await conLaBaseMandando(db);
    const r = await ganar(db, 'pag', GANAR());
    igual([r.ok, r.proyecto_id, r.folio_hoja], [true, 'g1', 'V-001']);
    const x = await una(db, `select p.fuente, p.etapa, p.creado_por::text as por, d.cuenta, d.subtotal::float8 as sub, i.estado
                               from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id join public.instalaciones i on i.proyecto_id = p.id where p.id = 'g1'`);
    igual([x.fuente, x.etapa, x.por, x.cuenta, x.sub, x.estado], ['cotizacion', 'ganado', db.u.pag.uid, 'Constru BNT', 10000, 'propuesta']);
    igual((await sql(db, `select nivel, titulo from public.bitacora where accion = 'gano' and entidad_id = 'g1' order by nivel`)).map(b => [b.nivel, b.titulo]),
      [['dinero', 'Venta ganada V-001'], ['general', 'Se ganó Rosa - Tienda (Letras)']]);
    const d = await ganar(db, 'dir', GANAR({ id: 'g2', folio_global: 'COT-0101@K7QM', instalacion_id: 'inst-g2' }));
    igual([d.ok, d.folio_hoja, (await una(db, `select estado from public.instalaciones where proyecto_id = 'g2'`)).estado], [true, 'V-002', 'confirmada']);
  }));
  prueba('A28-02 mi_acceso: Pagos recibe permisos.alta.ganar_proyecto = true (el relevo ya no aparta su venta); Fabricación, false; Dirección, true', async () => {
    const db = await plantilla();
    for (const [q, puede] of [['pag', true], ['fab', false], ['dir', true]]) {
      const a = await llamar(sesionDe(db, db.u[q]), 'mi_acceso', {});
      igual([q, a.permisos.alta.ganar_proyecto], [q, puede]);
    }
  });
});

describir('A28-03 y A28-04 con la hoja mandando, Pagos no; y el orden de las negativas (CZ-1)', () => {
  prueba('A28-03 hoja: Pagos recibe DATO_INVALIDO definitivo con la frase de la hoja, aunque traiga el V-### de la hoja; nada escrito ni un número del contador; Dirección sí', async () => conCopia(plantilla, async db => {
    igual((await una(db, "select modo from public.empresas where id = 'al3d'")).modo, 'hoja', 'la semilla nace en hoja');
    const antes = await huella(db);
    for (const args of [GANAR(), GANAR({ folio_hoja: 'V-042' })]) {
      const r = await ganar(db, 'pag', args);
      igual([r.ok, r.codigo, r.definitivo], [false, 'DATO_INVALIDO', true]);
      cierto(/todavía trabaja con la hoja/.test(r.mensaje), r.mensaje);
    }
    igual(await huella(db), antes, 'ni proyecto, ni dinero, ni cita, ni bitácora, ni contador');
    const d = await ganar(db, 'dir', GANAR({ folio_hoja: 'V-042' }));
    igual([d.ok, d.folio_hoja], [true, 'V-042'], 'Dirección con la hoja mandando, como la sombra (0015)');
  }));
  prueba('A28-04 el área va antes (Fabricación: ROL_SIN_PERMISO en hoja y en base); la validación también; el reintento de una venta que sí entró dice «ya existía» aunque se haya vuelto a la hoja', async () => conCopia(plantilla, async db => {
    for (const m of ['hoja', 'base']) {
      await modo(db, m);
      const f = await ganar(db, 'fab', GANAR());
      igual([m, f.ok, f.codigo, f.definitivo], [m, false, 'ROL_SIN_PERMISO', true]);
    }
    await modo(db, 'hoja');
    igual((await ganar(db, 'pag', GANAR({ nombre: '   ' }))).mensaje, 'Falta el nombre del proyecto.', 'con la hoja, un dato malo sigue diciendo cuál');
    await modo(db, 'base');
    const r1 = await ganar(db, 'pag', GANAR());
    igual([r1.ok, r1.folio_hoja], [true, 'V-001']);
    await modo(db, 'hoja');
    const antes = await huella(db);
    const r2 = await ganar(db, 'pag', GANAR());
    igual([r2.ok, r2.ya_existia, r2.folio_hoja], [true, true, 'V-001'], 'la respuesta perdida de una venta que sí entró: no «no se registró»');
    igual((await ganar(db, 'pag', GANAR({ id: 'g9', folio_global: 'COT-0109@K7QM' }))).codigo, 'DATO_INVALIDO', 'una nueva, no');
    igual(await huella(db), antes);
  }));
});

describir('A28-05 el IVA lo pone la cuenta también cuando gana Pagos (CZ-5: ya era así desde 0006)', () => {
  prueba('A28-05 Elias BBVA (no factura) con IVA en la cotización → sin IVA y el neto es el subtotal; Rul HSBC sin IVA → con IVA', async () => conCopia(plantilla, async db => {
    await conLaBaseMandando(db);
    await ganar(db, 'pag', GANAR({ id: 'g3', folio_global: 'COT-0103@K7QM', fecha_instalacion: null }, { cuenta: 'Elias BBVA', iva: true, sub: 1000 }));
    await ganar(db, 'pag', GANAR({ id: 'g4', folio_global: 'COT-0104@K7QM', fecha_instalacion: null }, { cuenta: 'Rul HSBC', iva: false, sub: 1000 }));
    const x = await sql(db, `select p.id, p.iva, v.h_neto::text as neto from public.proyectos p join public.ventas_calculadas v on v.proyecto_id = p.id where p.id in ('g3', 'g4') order by p.id`);
    igual(x.map(r => [r.id, r.iva, r.neto]), [['g3', false, '1000.00'], ['g4', true, '1160.00']]);
  }));
});

describir('A28-06 el reparto ya no le paga a una venta cancelada (DN-2)', () => {
  const conVentas = async db => {
    await crearVenta(db, { folio: 'V-001', sub: 1000 });                              // comisión 100.00
    await crearVenta(db, { folio: 'V-002', sub: 500, etapa: 'cancelado' });           // comisión  50.00, «No se dio»
    await crearVenta(db, { folio: 'V-003', sub: 2000, etapa: 'instalado' });          // comisión 200.00
    await crearVenta(db, { folio: 'V-004', sub: 300, historica: true });              // comisión  30.00, histórica: sin etapa
  };
  prueba('A28-06 la vista previa recorre V-001, V-003 y V-004 (no V-002); el reparto abona solo a esas; la vista de fórmulas sigue diciendo que a V-002 le restan 50', async () => conCopia(plantilla, async db => {
    await conVentas(db);
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const p = await rpcT(t, 'vista_previa_reparto', { p_monto: 10000 });
      const pend = await t.query(`select folio from public.comisiones_pendientes order by numero_folio`);
      const r = await rpcT(t, 'repartir_abono_fifo', { p_monto: 150, p_op_id: 'rep-28' });
      const ab = await t.query(`select folio_hoja, importe::text as importe from public.abonos order by id`);
      const t2 = (await t.query(`select t_restante::text as t from public.ventas_calculadas where a_folio = 'V-002'`))[0].t;
      return { p, pend, r, ab, t2 };
    });
    igual(x.p.filas.map(f => f.folio), ['V-001', 'V-003', 'V-004']);
    igual([String(x.p.total_pendiente), x.p.cuantas], ['330', 3]);
    igual(x.pend.map(f => f.folio), ['V-001', 'V-003', 'V-004'], 'la vista misma');
    igual(x.r.repartido.map(f => [f.folio, String(f.abono)]), [['V-001', '100'], ['V-003', '50']]);
    igual(x.ab.map(a => [a.folio_hoja, a.importe]), [['V-001', '100.00'], ['V-003', '50.00']]);
    igual(x.t2, '50.00', 'la T de la hoja no cambia: lo que cambia es a quién le paga el reparto');
  }));
  prueba('A28-06 una venta cancelada que vuelve a una etapa viva vuelve a entrar al reparto (la vista lee la etapa de ahora)', async () => conCopia(plantilla, async db => {
    await conVentas(db);
    await sql(db, `update public.proyectos set etapa = 'ganado' where id = 'v002'`);
    const p = await sesionDe(db, db.u.dir).transaccion(t => rpcT(t, 'vista_previa_reparto', { p_monto: 10000 }));
    igual(p.filas.map(f => f.folio), ['V-001', 'V-002', 'V-003', 'V-004']);
  }));
});

describir('A28-07 registrar_cobro: la fecha de liquidación solo avanza (DN-3)', () => {
  prueba('A28-07 cobros del 20-oct, del 1-sep (capturado después) y del 25-oct: la fecha queda en 20-oct y luego en 25-oct; la liquidación suma los tres', async () => conCopia(plantilla, async db => {
    await crearVenta(db, { folio: 'V-001', sub: 10000, anti: 1000, cuenta: 'Constru BNT' });
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const a = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 100, p_fecha: '2026-10-20', p_liquidar: false, p_op_id: 'c1' });
      const b = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 50, p_fecha: '2026-09-01', p_liquidar: false, p_op_id: 'c2' });
      const c = await rpcT(t, 'registrar_cobro', { p_proyecto: 'v001', p_monto: 25, p_fecha: '2026-10-25', p_liquidar: false, p_op_id: 'c3' });
      const bit = await t.query(`select op_id, despues ->> 'fecha_liquidacion' as f from public.bitacora where accion = 'cobro' order by op_id`);
      const d = (await t.query(`select liquidacion::text as liq, fecha_liquidacion::text as f from public.ventas_dinero where proyecto_id = 'v001'`))[0];
      return { a, b, c, bit, d };
    });
    igual([x.a.fecha_liquidacion, x.b.fecha_liquidacion, x.c.fecha_liquidacion], ['2026-10-20', '2026-10-20', '2026-10-25']);
    igual([x.d.liq, x.d.f], ['175', '2026-10-25']);
    igual(x.bit.map(b => [b.op_id, b.f]), [['cobro:c1', '2026-10-20'], ['cobro:c2', '2026-10-20'], ['cobro:c3', '2026-10-25']], 'la bitácora dice lo que quedó');
  }));
});

describir('A28-08 el reintento de un «Se ganó» con su cita es «ya existía»', () => {
  for (const quien of ['dir', 'pag']) {
    prueba(`A28-08 (${quien}) la respuesta se perdió y la bandeja lo vuelve a mandar con la misma cita: ya_existia, el mismo V-###, una sola cita y nada más escrito`, async () => conCopia(plantilla, async db => {
      await conLaBaseMandando(db);
      const r1 = await ganar(db, quien, GANAR());
      igual([r1.ok, r1.folio_hoja], [true, 'V-001']);
      const antes = await huella(db);
      const r2 = await ganar(db, quien, GANAR());
      igual([r2.ok, r2.ya_existia, r2.folio_hoja, r2.codigo], [true, true, 'V-001', undefined]);
      igual(await huella(db), antes);
    }));
  }
  prueba('A28-08 una venta NUEVA con el id de una cita que ya es de otra sigue negándose (DATO_INVALIDO) y no escribe nada', async () => conCopia(plantilla, async db => {
    await conLaBaseMandando(db);
    await ganar(db, 'dir', GANAR());
    const antes = await huella(db);
    const r = await ganar(db, 'dir', GANAR({ id: 'g2', folio_global: 'COT-0102@K7QM', instalacion_id: 'inst-g1' }));
    igual([r.ok, r.codigo, r.mensaje], [false, 'DATO_INVALIDO', 'Ese id de instalación ya existe.']);
    igual(await huella(db), antes);
  }));
});

await resumen();
