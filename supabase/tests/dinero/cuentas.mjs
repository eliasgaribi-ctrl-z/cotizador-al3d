// LAS CUENTAS DE DINERO DISPONIBLE (0027, decidido por Elías el 2026-10-25; docs/DINERO-Y-FACTURAS.md): `ajustes_dinero` y
// `cuentas_disponibles_guardar`. Solo Elias BBVA es dinero de AL3D hasta que Dirección diga otra cosa; el teléfono resta de ahí los gastos que
// salieron de esas cuentas (js/datos/dinero-cuentas.js). Datos de mentiras: ni una cuenta real más allá de los cinco nombres de la hoja.
//
//   DC-01  la tabla: nace con ['Elias BBVA'] por empresa, RLS, sin_borrar, sin Realtime, service_role sin DELETE, nadie escribe directo
//   DC-02  quién la cambia: SOLO Dirección; Pagos y Fabricación ROL_SIN_PERMISO (definitivo); la ajena, la baja, la app vieja y anon, no
//   DC-03  qué acepta: una o más de las cinco, sin repetir, en el orden de siempre; lo demás es DATO_INVALIDO y no escribe nada
//   DC-04  idempotente: el mismo op_id contesta lo mismo; lo mismo con otra operación es «sin cambio»; una sola línea de bitácora (dinero)
//   DC-05  quién la lee: Dirección y Pagos de su empresa; Fabricación, la persona ajena y otra empresa, cero filas; anon, permission denied
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, sesionSinContrato, llamar, como, sql, una, conCopia } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  return db;
}, { limpiar: db => db.close() });

const S = (db, quien) => sesionDe(db, db.u[quien], { confirmar: true });
const guardar = (db, quien, cuentas, op = 'op-' + Math.random().toString(36).slice(2)) =>
  llamar(S(db, quien), 'cuentas_disponibles_guardar', { p_op: { op_id: op, cuentas } });
const ajuste = async (db, empresa = 'al3d') => (await una(db, `select cuentas_disponibles as c, actualizado_por as por from public.ajustes_dinero where empresa_id = $1`, [empresa])) || null;
const lineas = db => sql(db, `select nivel, accion, entidad, entidad_id, titulo, detalle, antes, despues, op_id, rol from public.bitacora
                              where entidad = 'plataforma' and entidad_id = 'cuentas_disponibles' order by id`);

describir('DC-01 la tabla ajustes_dinero', () => {
  prueba('cada empresa que existía al migrar nace con [Elias BBVA] (otra, creada después, no trae renglón y vale lo mismo)', async () => {
    const db = await plantilla();
    igual(await ajuste(db), { c: ['Elias BBVA'], por: '' });
    igual(await ajuste(db, 'otra'), null, 'otra se creó después de 0027: sin renglón (el teléfono y la RPC entienden [Elias BBVA])');
  });
  prueba('RLS, sin_borrar, fuera de Realtime; authenticated solo lee; service_role sin DELETE; ni el dueño la borra', () => conCopia(plantilla, async db => {
    igual((await una(db, `select relrowsecurity as rls from pg_class where oid = 'public.ajustes_dinero'::regclass`)).rls, true);
    igual((await una(db, `select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ajustes_dinero'`)).n, 0);
    await esperarError(sesionDe(db, db.u.dir).query(`update public.ajustes_dinero set cuentas_disponibles = array['Constru BNT']`), '42501', 'Dirección no escribe directo');
    await esperarError(sesionDe(db, db.u.dir).query(`insert into public.ajustes_dinero (empresa_id) values ('otra')`), '42501');
    await esperarError(como(db, { rol: 'service_role' }).query(`delete from public.ajustes_dinero`), '42501', 'service_role no tiene DELETE');
    await esperarError(sql(db, `delete from public.ajustes_dinero`), /no se borran/, 'sin_borrar');
    await esperarError(sql(db, `update public.ajustes_dinero set cuentas_disponibles = array['Efectivo']`), /check/, 'el CHECK: solo las cinco');
    await esperarError(sql(db, `update public.ajustes_dinero set cuentas_disponibles = '{}'`), /check/, 'el CHECK: al menos una');
  }));
});

describir('DC-02 quién cambia las cuentas disponibles', () => {
  prueba('Dirección sí; Pagos y Fabricación ROL_SIN_PERMISO definitivo; la ajena, la baja, la app vieja y anon no; nada cambió', () => conCopia(plantilla, async db => {
    const r = await guardar(db, 'dir', ['Elias BBVA', 'Rul HSBC']);
    igual(r, { ok: true, cuentas: ['Elias BBVA', 'Rul HSBC'] });
    igual((await ajuste(db)).c, ['Elias BBVA', 'Rul HSBC']);
    igual((await ajuste(db)).por, 'dir@al3d.test', 'quién: el correo que Google confirmó');
    for (const [q, codigo] of [['pag', 'ROL_SIN_PERMISO'], ['fab', 'ROL_SIN_PERMISO'], ['ext', 'SIN_ACCESO'], ['baja', 'ACCESO_REVOCADO']]) {
      const x = await guardar(db, q, ['Constru BNT']);
      igual([q, x.ok, x.codigo], [q, false, codigo]);
    }
    igual((await guardar(db, 'pag', ['Constru BNT'])).definitivo, true, 'Pagos: definitivo (la pantalla no insiste)');
    igual((await llamar(sesionSinContrato(db, db.u.dir), 'cuentas_disponibles_guardar', { p_op: { op_id: 'v', cuentas: ['Constru BNT'] } })).codigo, 'CLIENTE_VIEJO');
    await esperarError(como(db, { rol: 'anon' }).rpc('cuentas_disponibles_guardar', { p_op: { cuentas: ['Constru BNT'] } }), '42501', 'anon: ni la llama');
    igual((await ajuste(db)).c, ['Elias BBVA', 'Rul HSBC'], 'ninguna de las negadas cambió nada');
    igual((await guardar(db, 'otra', ['Constru BNT'])).ok, true, 'Dirección de otra empresa cambia la SUYA');
    igual([(await ajuste(db)).c, (await ajuste(db, 'otra')).c], [['Elias BBVA', 'Rul HSBC'], ['Constru BNT']], 'y no la de al3d');
  }));
});

describir('DC-03 qué acepta', () => {
  prueba('lo malo es DATO_INVALIDO definitivo y no escribe nada', () => conCopia(plantilla, async db => {
    for (const [cuentas, motivo] of [[[], /al menos una/], [['Efectivo'], /no es de la empresa/], [['Elias BBVA', 3], /no es de la empresa/],
                                     ['Elias BBVA', /mal formada/], [null, /mal formada/], [[' Elias BBVA'], /no es de la empresa/]]) {
      const r = await guardar(db, 'dir', cuentas);
      igual([JSON.stringify(cuentas), r.ok, r.codigo, r.definitivo, motivo.test(r.mensaje)], [JSON.stringify(cuentas), false, 'DATO_INVALIDO', true, true], r.mensaje);
    }
    igual((await llamar(S(db, 'dir'), 'cuentas_disponibles_guardar', { p_op: null })).codigo, 'DATO_INVALIDO', 'sin operación');
    igual((await guardar(db, 'dir', ['Elias BBVA'], 'x'.repeat(101))).codigo, 'DATO_INVALIDO', 'un op_id de más de 100');
    igual((await ajuste(db)).c, ['Elias BBVA']);
    igual((await lineas(db)).length, 0, 'ni una línea');
  }));
  prueba('sin repetir y en el orden de siempre (Elias BBVA, Constru BNT, Moni MPago, Rul HSBC, Tatis BNT), la mande como la mande', () => conCopia(plantilla, async db => {
    igual((await guardar(db, 'dir', ['Tatis BNT', 'Elias BBVA', 'Tatis BNT', 'Moni MPago'])).cuentas, ['Elias BBVA', 'Moni MPago', 'Tatis BNT']);
    igual((await ajuste(db)).c, ['Elias BBVA', 'Moni MPago', 'Tatis BNT']);
  }));
});

describir('DC-04 idempotente y su bitácora', () => {
  prueba('el mismo op_id contesta lo mismo y no escribe otra línea; lo mismo con otro op_id es «sin cambio»; volver a [Elias BBVA] sí anota', () => conCopia(plantilla, async db => {
    const a = await guardar(db, 'dir', ['Elias BBVA', 'Constru BNT'], 'op-1');
    const b = await guardar(db, 'dir', ['Elias BBVA', 'Constru BNT'], 'op-1');
    igual(b, a, 'el reintento: lo mismo');
    igual(await guardar(db, 'dir', ['Constru BNT', 'Elias BBVA'], 'op-2'), { ok: true, sin_cambio: true, cuentas: ['Elias BBVA', 'Constru BNT'] });
    igual((await guardar(db, 'dir', ['Elias BBVA'], 'op-3')).cuentas, ['Elias BBVA']);
    const l = await lineas(db);
    igual(l.map(x => [x.nivel, x.accion, x.titulo, x.detalle, x.op_id, x.rol]), [
      ['dinero', 'cambio', 'Dinero disponible: Elias BBVA, Constru BNT', 'Antes: Elias BBVA', 'cuentas:op-1', 'direccion'],
      ['dinero', 'cambio', 'Dinero disponible: Elias BBVA', 'Antes: Elias BBVA, Constru BNT', 'cuentas:op-3', 'direccion'],
    ]);
    igual([l[0].antes, l[0].despues], [{ cuentas: ['Elias BBVA'] }, { cuentas: ['Elias BBVA', 'Constru BNT'] }]);
    igual(await guardar(db, 'dir', ['Elias BBVA'], 'op-1'), a, 'un op_id ya usado contesta lo de su primera vez, aunque después haya cambiado (la regla de la bitácora)');
  }));
  prueba('sin renglón (una empresa nueva): guardar [Elias BBVA] es «sin cambio»; otra lista crea el renglón', () => conCopia(plantilla, async db => {
    igual((await guardar(db, 'otra', ['Elias BBVA'])).sin_cambio, true);
    igual(await ajuste(db, 'otra'), null);
    igual((await guardar(db, 'otra', ['Rul HSBC'])).cuentas, ['Rul HSBC']);
    igual((await ajuste(db, 'otra')).c, ['Rul HSBC']);
  }));
  prueba('la línea es de nivel DINERO: Dirección y Pagos la ven, Fabricación no', () => conCopia(plantilla, async db => {
    await guardar(db, 'dir', ['Elias BBVA', 'Rul HSBC']);
    const ve = async q => (await sesionDe(db, db.u[q]).query(`select count(*)::int as n from public.bitacora where entidad_id = 'cuentas_disponibles'`))[0].n;
    igual([await ve('dir'), await ve('pag'), await ve('fab'), await ve('ext')], [1, 1, 0, 0]);
  }));
});

describir('DC-05 quién lee las cuentas disponibles', () => {
  prueba('Dirección y Pagos de al3d ven su renglón; Fabricación, la ajena, la baja y la invitación sin reclamar, cero; otra empresa no ve el de al3d; anon, permission denied', async () => {
    const db = await plantilla();
    const ve = async q => (await sesionDe(db, db.u[q]).query(`select empresa_id from public.ajustes_dinero order by 1`)).map(r => r.empresa_id);
    igual([await ve('dir'), await ve('pag')], [['al3d'], ['al3d']]);
    for (const q of ['fab', 'ext', 'baja', 'inv']) igual([q, await ve(q)], [q, []]);
    igual(await ve('otra'), [], 'otra no tiene renglón y no ve el de al3d');
    igual(await ve('multi'), ['al3d'], 'multi: Dirección en al3d (ve) y Fabricación en otra (no vería el de otra)');
    await esperarError(como(db, { rol: 'anon' }).query(`select * from public.ajustes_dinero`), '42501');
  });
});

await resumen();
