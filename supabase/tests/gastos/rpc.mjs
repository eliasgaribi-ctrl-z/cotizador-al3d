// LOS GASTOS SE ESCRIBEN EN LA BASE (0025, paso 3 de «la base manda», docs/BASE-MANDA.md): `gasto_registrar` y `gasto_anular`, con la regla
// de /empujar_gastos (`gastoUnaOperacion_` de puente/hoja-apps-script.gs), y la tabla en Realtime. Datos de mentiras: ni un gasto real.
//
//   GA-06  quién: Dirección y Pagos registran y anulan; Fabricación, la persona ajena, la baja, la app vieja y anon, no; otra empresa no toca
//          los de al3d
//   GA-07  el alta valida como `gastoValidar_` del .gs (y lo malo es DATO_INVALIDO definitivo); lo bueno entra con quién lo subió (el correo
//          de Google, no lo que diga el teléfono), su op_id y el monto a centavos
//   GA-08  idempotente: el mismo op_id contesta lo mismo; el mismo gasto con otra operación es «ya estaba»; nunca dos renglones
//   GA-09  anular: no borra ni corrige; lo repetido es «ya estaba»; la anulación sin su alta da de alta el gasto ya anulado (la regla de la
//          hoja), el alta que trae la anulación anula al que ya estaba, y una lápida no se revive
//   GA-10  la bitácora: una línea de nivel dinero por lo que sí se escribió (entidad `gasto`); Pagos la ve, Fabricación no
//   GA-11  Realtime y RLS: `gastos` publicada con identidad DEFAULT, Fabricación sigue sin ver una fila, y la auditoría de 0025 la EXIGE
//          publicada (las de antes solo la admiten); la auditoría, limpia
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, sesionSinContrato, llamar, como, sql, una, conCopia } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  return db;
}, { limpiar: db => db.close() });

const S = (db, quien) => sesionDe(db, db.u[quien], { confirmar: true });
const MS = iso => Date.parse(iso);
/** Un gasto como lo manda el teléfono (js/datos/supa-traductor.js, `traducirGasto`). */
const gasto = (id, o = {}) => ({ op_id: 'op-' + id, id, fecha: '2026-10-24', concepto: 'Lámina de acrílico 3 mm', categoria: 'Material', monto: 1500,
  cuenta: 'Elias BBVA', folio: '', registro_por: 'Ana · Pagos (K7QM)', registrado_en: MS('2026-10-24T17:05:00Z'), anulado: false, anulo: '', anulado_en: null, ...o });
const registrar = (db, quien, p) => llamar(S(db, quien), 'gasto_registrar', { p_op: p });
const anular = (db, quien, p) => llamar(S(db, quien), 'gasto_anular', { p_op: p });
const fila = (db, id, empresa = 'al3d') => una(db, `select id, fecha::text, concepto, categoria, monto::text, cuenta, folio, registro_por, registrado_en, anulado, anulo, anulado_en,
                                                         subio, procedencia, (deleted_at is not null) as con_lapida from public.gastos where empresa_id = $1 and id = $2`, [empresa, id]);
const cuantos = (db, id) => una(db, `select count(*)::int as n from public.gastos where id = $1`, [id]).then(r => r.n);
const lineas = (db, id) => sql(db, `select nivel, accion, entidad, titulo, detalle, op_id, rol, usuario_texto from public.bitacora where entidad = 'gasto' and entidad_id = $1 order by id`, [id]);

describir('GA-06 quién registra y anula', () => {
  prueba('Dirección y Pagos sí; Fabricación, la ajena, la baja, la app vieja y anon no; otra empresa no toca los de al3d', async () => conCopia(plantilla, async db => {
    igual((await registrar(db, 'dir', gasto('gas-d1'))).creado, true, 'Dirección registra');
    igual((await registrar(db, 'pag', gasto('gas-p1'))).creado, true, 'Pagos registra');
    igual((await anular(db, 'pag', { op_id: 'op-a1', id: 'gas-d1' })).anulado, true, 'Pagos anula uno de Dirección (como en la hoja)');
    for (const [q, codigo] of [['fab', 'ROL_SIN_PERMISO'], ['ext', 'SIN_ACCESO'], ['baja', 'ACCESO_REVOCADO']]) {
      const r = await registrar(db, q, gasto('gas-' + q));
      const a = await anular(db, q, { op_id: 'op-x-' + q, id: 'gas-p1' });
      igual([q, r.ok, r.codigo, a.codigo], [q, false, codigo, codigo]);
    }
    igual((await registrar(db, 'fab', gasto('gas-fab'))).definitivo, true, 'Fabricación: definitivo (el teléfono lo aparta y no insiste)');
    igual((await llamar(sesionSinContrato(db, db.u.dir), 'gasto_registrar', { p_op: gasto('gas-viejo') })).codigo, 'CLIENTE_VIEJO', 'la app vieja');
    await esperarError(como(db, { rol: 'anon' }).rpc('gasto_registrar', { p_op: gasto('gas-anon') }), '42501', 'anon: ni la llama');
    await esperarError(como(db, { rol: 'anon' }).rpc('gasto_anular', { p_op: { id: 'gas-p1' } }), '42501', 'anon: ni la llama');
    igual((await anular(db, 'otra', { op_id: 'op-otra', id: 'gas-p1' })).codigo, 'NO_ENCONTRADO', 'Dirección de otra empresa no encuentra los de al3d');
    igual((await fila(db, 'gas-p1')).anulado, false, 'y no le pasó nada');
    igual(await una(db, `select count(*)::int as n from public.gastos where id in ('gas-fab', 'gas-ext', 'gas-baja', 'gas-viejo', 'gas-anon')`), { n: 0 }, 'nada de lo negado entró');
  }));
});

describir('GA-07 el alta valida como la hoja', () => {
  prueba('lo que la hoja no acepta tampoco entra aquí: DATO_INVALIDO, definitivo, con el porqué; y nada se escribe', async () => conCopia(plantilla, async db => {
    const casos = [
      [{ fecha: '' }, /qué día/], [{ fecha: '2026-02-31' }, /qué día/], [{ fecha: '1999-12-31' }, /qué día/], [{ fecha: 20261024 }, /qué día/],
      [{ concepto: '   ' }, /en qué se gastó/], [{ concepto: 'x'.repeat(201) }, /demasiado largo/],
      [{ categoria: 'Gasolina' }, /«Gasolina» no es una categoría/], [{ categoria: null }, /no es una categoría/],
      [{ monto: 0 }, /mayor que cero/], [{ monto: -5 }, /mayor que cero/], [{ monto: 'mucho' }, /mayor que cero/], [{ monto: 0.004 }, /mayor que cero/],
      [{ monto: 10000000.01 }, /diez millones/],
      [{ cuenta: 'Efectivo' }, /cuenta/], [{ folio: 'V-' + '1'.repeat(40) }, /folio/],
      [{ id: 'gasto con espacios' }, /id/], [{ id: '' }, /id/],
    ];
    let k = 0;
    for (const [cambio, motivo] of casos) {
      const r = await registrar(db, 'pag', gasto('gas-malo-' + (++k), cambio));
      igual([JSON.stringify(cambio), r.ok, r.codigo, r.definitivo, motivo.test(r.mensaje)], [JSON.stringify(cambio), false, 'DATO_INVALIDO', true, true], r.mensaje);
    }
    igual(await una(db, `select count(*)::int as n from public.gastos`), { n: 0 });
    igual(await una(db, `select count(*)::int as n from public.bitacora where entidad = 'gasto'`), { n: 0 }, 'ni una línea de bitácora');
  }));
  prueba('lo bueno entra: el monto a centavos, la cuenta vacía o una de las cinco, el sello del teléfono, la hora que dijo y quién lo subió de verdad', async () => conCopia(plantilla, async db => {
    const r = await registrar(db, 'pag', gasto('gas-b1', { monto: 1234.505, cuenta: '', folio: ' V-042 ', concepto: '  Fuente de 12 V  ' }));
    igual(r, { ok: true, id: 'gas-b1', creado: true, anulado: false });
    const g = await fila(db, 'gas-b1');
    igual([g.fecha, g.concepto, g.categoria, g.monto, g.cuenta, g.folio, g.registro_por, g.registrado_en.toISOString(), g.anulado, g.anulo, g.anulado_en],
      ['2026-10-24', 'Fuente de 12 V', 'Material', '1234.51', '', 'V-042', 'Ana · Pagos (K7QM)', '2026-10-24T17:05:00.000Z', false, '', null]);
    igual([g.subio, g.procedencia], ['pag@al3d.test', { via: 'plataforma', op_id: 'gasto:op-gas-b1' }], '«Subió» es el correo de Google, nunca lo que diga el teléfono');
    /* Un reloj mal puesto no escribe un gasto del año 2099: la hora es la del servidor. Y sin sello, el correo. */
    await registrar(db, 'dir', gasto('gas-b2', { registrado_en: MS('2099-01-01T00:00:00Z'), registro_por: '' }));
    const h = await una(db, `select (registrado_en > now() - interval '1 minute') as ahora, registro_por from public.gastos where id = 'gas-b2'`);
    igual([h.ahora, h.registro_por], [true, 'dir@al3d.test']);
    /* El monto como texto (lo tecleado) también se entiende; las ocho categorías entran. */
    igual((await registrar(db, 'dir', gasto('gas-b3', { monto: '850.5', categoria: 'Comisiones y nómina' }))).creado, true);
    igual((await fila(db, 'gas-b3')).monto, '850.50');
  }));
});

describir('GA-08 idempotente', () => {
  prueba('el mismo op_id contesta lo mismo y no escribe otra vez; el mismo gasto con otra operación es «ya estaba»; un solo renglón y una sola línea', async () => conCopia(plantilla, async db => {
    const p = gasto('gas-i1');
    const r1 = await registrar(db, 'pag', p);
    const r2 = await registrar(db, 'pag', p);
    igual(r2, r1, 'el reintento de una respuesta que se perdió: la misma respuesta');
    const r3 = await registrar(db, 'dir', { ...p, op_id: 'op-otra-vez', monto: 9 });
    igual(r3, { ok: true, id: 'gas-i1', ya_estaba: true }, 'otra operación del mismo gasto (un respaldo restaurado): ya estaba, y el monto NO cambia');
    igual([await cuantos(db, 'gas-i1'), (await fila(db, 'gas-i1')).monto, (await lineas(db, 'gas-i1')).length], [1, '1500.00', 1]);
    /* Sin op_id también: por el id del gasto. */
    const sin = gasto('gas-i2', { op_id: undefined });
    await registrar(db, 'pag', sin);
    igual((await registrar(db, 'pag', sin)).ya_estaba, true);
    igual([await cuantos(db, 'gas-i2'), (await lineas(db, 'gas-i2')).map(x => x.op_id)], [1, [null]]);
  }));
});

describir('GA-09 anular', () => {
  prueba('anula sin borrar ni corregir; lo repetido es «ya estaba»; el reintento contesta lo mismo; uno que no existe es NO_ENCONTRADO', async () => conCopia(plantilla, async db => {
    await registrar(db, 'dir', gasto('gas-n1'));
    const a = { op_id: 'op-anulo-1', id: 'gas-n1', anulo: 'Caro · Pagos (B2)', anulado_en: MS('2026-10-25T15:00:00Z') };
    const r1 = await anular(db, 'pag', a);
    igual(r1, { ok: true, id: 'gas-n1', anulado: true });
    const g = await fila(db, 'gas-n1');
    igual([g.anulado, g.anulo, g.anulado_en.toISOString(), g.monto, g.concepto, g.con_lapida], [true, 'Caro · Pagos (B2)', '2026-10-25T15:00:00.000Z', '1500.00', 'Lámina de acrílico 3 mm', false]);
    igual(await anular(db, 'pag', a), r1, 'el reintento: lo mismo');
    igual(await anular(db, 'dir', { op_id: 'op-anulo-2', id: 'gas-n1', anulo: 'Otro' }), { ok: true, id: 'gas-n1', ya_estaba: true }, 'otra anulación: ya estaba, y no cambia quién');
    igual((await fila(db, 'gas-n1')).anulo, 'Caro · Pagos (B2)');
    const no = await anular(db, 'dir', { op_id: 'op-anulo-3', id: 'gas-no-existe' });
    igual([no.codigo, no.definitivo], ['NO_ENCONTRADO', true]);
    igual((await anular(db, 'dir', { op_id: 'op-anulo-4' })).codigo, 'DATO_INVALIDO', 'sin id');
    igual((await anular(db, 'dir', { op_id: 'op-anulo-5', id: 'gas-n9' })).codigo, 'NO_ENCONTRADO');
  }));
  prueba('la regla de la hoja: la anulación sin su alta lo da de alta ya anulado; el alta que trae la anulación anula al que estaba', async () => conCopia(plantilla, async db => {
    const huerfana = await anular(db, 'pag', { op_id: 'op-h1', id: 'gas-h1', anulo: 'Caro', anulado_en: MS('2026-10-25T16:00:00Z'), gasto: gasto('gas-h1', { op_id: undefined, monto: 210 }) });
    igual(huerfana, { ok: true, id: 'gas-h1', creado: true, anulado: true });
    const h = await fila(db, 'gas-h1');
    igual([h.anulado, h.anulo, h.anulado_en.toISOString(), h.monto, h.procedencia.op_id], [true, 'Caro', '2026-10-25T16:00:00.000Z', '210.00', 'anulo:op-h1']);
    igual((await anular(db, 'pag', { op_id: 'op-h2', id: 'gas-h1', gasto: gasto('gas-h1') })).ya_estaba, true, 'después ya estaba');
    /* Un gasto que se vuelve a encolar ya anulado (`reencolarSueltos`) contra el de la base, que no lo estaba. */
    await registrar(db, 'dir', gasto('gas-h2'));
    const r = await registrar(db, 'dir', gasto('gas-h2', { op_id: 'op-h2-otra', anulado: true, anulo: 'Ana', anulado_en: MS('2026-10-25T17:00:00Z'), monto: 1 }));
    igual(r, { ok: true, id: 'gas-h2', anulado: true });
    const g2 = await fila(db, 'gas-h2');
    igual([g2.anulado, g2.anulo, g2.monto], [true, 'Ana', '1500.00'], 'se anula, y nada más: el monto no se toca');
    igual((await lineas(db, 'gas-h2')).map(x => x.accion), ['registro', 'anulo']);
  }));
  prueba('una lápida (alguien lo quitó de la pestaña mientras la hoja mandaba) no se revive ni se anula', async () => conCopia(plantilla, async db => {
    await registrar(db, 'dir', gasto('gas-l1'));
    await sql(db, `update public.gastos set deleted_at = now() where id = 'gas-l1'`);
    igual((await registrar(db, 'dir', gasto('gas-l1', { op_id: 'op-l1-b', anulado: true }))).ya_estaba, true);
    igual((await anular(db, 'dir', { op_id: 'op-l1-c', id: 'gas-l1' })).ya_estaba, true);
    const g = await fila(db, 'gas-l1');
    igual([g.con_lapida, g.anulado], [true, false]);
  }));
});

describir('GA-10 la bitácora', () => {
  prueba('una línea de nivel DINERO por lo que se escribió, con la entidad `gasto`; Pagos la ve, Fabricación no; «ya estaba» no anota', async () => conCopia(plantilla, async db => {
    await registrar(db, 'pag', gasto('gas-t1', { folio: 'V-042' }));
    await registrar(db, 'pag', gasto('gas-t1', { op_id: 'op-t1-otra' }));
    await anular(db, 'dir', { op_id: 'op-t1-anulo', id: 'gas-t1' });
    const l = await lineas(db, 'gas-t1');
    igual(l.map(x => [x.nivel, x.accion, x.entidad, x.op_id, x.rol, x.usuario_texto]),
      [['dinero', 'registro', 'gasto', 'gasto:op-gas-t1', 'pagos', 'pag@al3d.test'], ['dinero', 'anulo', 'gasto', 'anulo:op-t1-anulo', 'direccion', 'dir@al3d.test']]);
    igual([l[0].titulo, l[0].detalle], ['Gasto de $1,500.00: Lámina de acrílico 3 mm', 'Material · Elias BBVA · V-042 · 2026-10-24']);
    igual(l[1].titulo, 'Se anuló el gasto de $1,500.00: Lámina de acrílico 3 mm');
    const ve = async q => (await sesionDe(db, db.u[q]).query(`select count(*)::int as n from public.bitacora where entidad = 'gasto'`))[0].n;
    igual([await ve('dir'), await ve('pag'), await ve('fab')], [2, 2, 0]);
    /* La entidad nueva no estorba a lo de antes: una línea con una entidad que no existe sigue sin entrar. */
    await esperarError(sql(db, `insert into public.bitacora (empresa_id, accion, entidad, titulo) values ('al3d', 'x', 'otra_cosa', 'x')`), /bitacora_entidad_check/);
  }));
});

describir('GA-11 Realtime, RLS y la auditoría', () => {
  prueba('publicada con identidad DEFAULT; lo escrito por las RPC lo ven Dirección y Pagos, Fabricación ni una fila; nadie escribe directo', async () => conCopia(plantilla, async db => {
    igual(await una(db, `select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gastos'`), { n: 1 });
    igual((await una(db, `select relreplident as r from pg_class where oid = 'public.gastos'::regclass`)).r, 'd');
    await registrar(db, 'pag', gasto('gas-r1'));
    await registrar(db, 'dir', gasto('gas-r2', { monto: 300 }));
    const ve = async q => (await sesionDe(db, db.u[q]).query(`select count(*)::int as n, coalesce(sum(monto), 0)::text as s from public.gastos`))[0];
    igual([await ve('dir'), await ve('pag'), await ve('fab'), await ve('otra')], [{ n: 2, s: '1800.00' }, { n: 2, s: '1800.00' }, { n: 0, s: '0' }, { n: 0, s: '0' }]);
    await esperarError(S(db, 'dir').query(`update public.gastos set anulado = true`), '42501', 'solo por la RPC');
  }));
  prueba('la auditoría de 0025 EXIGE gastos publicada; la de 0011 la admite (volver a correr 0011 sobre 0025 no aborta); limpia', async () => conCopia(plantilla, async db => {
    igual((await una(db, `select interno.auditoria() as p`)).p, []);
    await sql(db, `alter publication supabase_realtime drop table public.gastos`);
    const p = (await una(db, `select interno.auditoria() as p`)).p;
    cierto(p.some(x => x.startsWith('GR-05') && x.includes('gastos') && x.includes('debe estar publicada')), JSON.stringify(p));
    await sql(db, `alter publication supabase_realtime add table public.gastos`);
    igual((await una(db, `select interno.auditoria() as p`)).p, []);
    const funciones = await sql(db, `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon,
                                            has_function_privilege('service_role', p.oid, 'execute') as svc
                                       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'gasto%' order by 1`);
    igual(funciones, [{ proname: 'gasto_anular', auth: true, anon: false, svc: false }, { proname: 'gasto_registrar', auth: true, anon: false, svc: false }]);
    const internas = await sql(db, `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                     where n.nspname = 'interno' and p.proname like 'gasto%' order by 1`);
    igual(internas, [{ proname: 'gasto_alta', auth: false }, { proname: 'gasto_anulacion', auth: false }, { proname: 'gasto_instante', auth: false }]);
  }));
});

await resumen();
