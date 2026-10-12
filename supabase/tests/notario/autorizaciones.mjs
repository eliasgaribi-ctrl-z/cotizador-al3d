// El notario: registrar el sello, su inmutabilidad y lo que /verificar lee — A.md §5.10-§5.11 y §10.11, casos NO-06 a NO-13, NO-15, NO-19 y NO-20.
//
//   · `registrar_autorizacion` la llama la Edge Function `autorizar` DESPUÉS de firmar (solo `service_role`): la base GUARDA los textos firmados y revalida
//     todo lo demás, pero NO tiene la clave y no puede recomputar el HMAC;
//   · la MISMA decisión no escribe nada (y resuelve la solicitud pendiente, Q-A06); otra decisión deja la vieja `superada` y una sola `vigente`;
//   · todo lo firmado es inmutable: solo cambia `estado` (y `nota` junto con él) y una `superada` o `revocada` es terminal;
//   · `autorizacion_para_verificar` (solo `service_role`) devuelve las filas con los nombres de columna que espera `sello.js`.
//
// `codificacion` por omisión es 'ascii-?' (lo que de verdad hace `Utilities.computeHmacSha256Signature` en Apps Script; comprobado el 2026-10-10).
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { sesionDe, llamar, una, sql, conCopia, como, rpcT } from '../comun/semilla.js';
import { crearBaseNotario, sol, sello, aut, insertarAutorizacion, cot } from '../comun/notario.js';

const FG = 'COT-0042-B@K7QM';
/** Base con una solicitud PENDIENTE de Pagos para FG (la de siempre antes de que Dirección autorice). */
const plantilla = dato(async () => {
  const db = await crearBaseNotario();
  const r = await llamar(sesionDe(db, db.u.pag, { confirmar: true }), 'solicitar', { p_op: sol(FG, { nota: 'por favor' }) });
  if (!r.ok) throw new Error('la semilla del notario no pudo solicitar: ' + JSON.stringify(r));
  return db;
}, { limpiar: db => db.close() });
const SR = db => como(db, { rol: 'service_role' });
/** Corre `fn(t)` como service_role en UNA petición (se deshace): `t.rpc`, `t.query`. */
const svc = async (fn) => { const db = await plantilla(); return SR(db).transaccion(t => fn(t, db)); };
const reg = (t, db, o) => rpcT(t, 'registrar_autorizacion', aut(db, o));

describir('NO-06 a NO-08 quién y qué', () => {
  prueba('NO-06 service_role registra la autorización de Dirección: vigente; la solicitud pasa a autorizada con su autorizacion_id; la cotización queda autorizada; devuelve el sello', async () => {
    const x = await svc(async (t, db) => {
      const r = await reg(t, db);
      const v = (await t.query(`select a.estado as ae, a.usuario_id::text as uid, a.origen, a.clave_id, a.codificacion, a.formato, a.solicito, a.cliente,
                                       s.estado as se, s.autorizacion_id = a.id as svin, s.resolvio_texto as srt, s.resolvio_id::text as sid, s.nota as snota,
                                       c.estado as ce, c.autorizacion_id = a.id as cvin, c.revocada_en as rev
                                  from public.autorizaciones a join public.solicitudes s using (empresa_id, folio_global) join public.cotizaciones c using (empresa_id, folio_global)
                                 where a.folio_global = $1`, [FG]))[0];
      const b = await t.query(`select nivel, accion, entidad, titulo, usuario_texto from public.bitacora where accion = 'autorizo'`);
      return { r, v, b };
    });
    const db = await plantilla();
    igual([x.r.ok, x.r.repetida], [true, false]);
    igual(x.r.sello.codigo, 'ABCD-EF01-2345');
    igual([x.v.ae, x.v.uid, x.v.origen, x.v.clave_id, x.v.codificacion, x.v.formato, x.v.solicito, x.v.cliente], ['vigente', db.u.dir.uid, 'plataforma', 'k1', 'ascii-?', 'v2', db.u.pag.correo, 'Juan']);
    igual([x.v.se, x.v.svin, x.v.srt, x.v.sid, x.v.snota, x.v.ce, x.v.cvin, x.v.rev], ['autorizada', true, db.u.dir.correo, db.u.dir.uid, 'por favor', 'autorizada', true, null]);
    igual(x.b.map(f => [f.nivel, f.accion, f.entidad, f.usuario_texto]), [['dinero', 'autorizo', 'autorizacion', db.u.dir.correo]]);
    cierto(!/\d+\.\d{2}/.test(x.b[0].titulo), 'el título de la bitácora no lleva importes');
  });
  prueba('NO-06 la codificación por omisión es «ascii-?»; con p_codificacion «utf-8» se guarda «utf-8»; p_clave_id vacío vale k1 y uno dado se guarda', async () => {
    const x = await svc(async (t, db) => {
      await reg(t, db);
      await reg(t, db, { p_folio_global: 'COT-0043-B@K7QM', p_codificacion: 'utf-8', p_clave_id: 'k2', ...sello(0x1111) });
      await reg(t, db, { p_folio_global: 'COT-0044-B@K7QM', p_clave_id: '', ...sello(0x2222) });
      return (await t.query(`select folio_global, codificacion, clave_id from public.autorizaciones order by folio_global`));
    });
    igual(x.map(f => [f.folio_global, f.codificacion, f.clave_id]), [[FG, 'ascii-?', 'k1'], ['COT-0043-B@K7QM', 'utf-8', 'k2'], ['COT-0044-B@K7QM', 'ascii-?', 'k1']]);
  });
  prueba('NO-06 la columna codificacion de la tabla vale «ascii-?» por omisión y solo admite «utf-8» o «ascii-?»', async () => {
    const db = await plantilla();
    igual((await una(db, `select column_default as d from information_schema.columns where table_schema = 'public' and table_name = 'autorizaciones' and column_name = 'codificacion'`)).d, `'ascii-?'::text`);
    await esperarError(sql(db, `insert into public.autorizaciones (empresa_id, folio_global, huella, sub_calc_txt, precio_auth_txt, total_txt, proyecto, autorizo, ts_iso, codigo, firma, estado, codificacion)
                                values ('al3d', 'COT-1-B@X', 'h', '1.00', '0.00', '1.00', 'p', 'a@b.test', '2026-10-01T04:30:15.123Z', $1, $2, 'vigente', 'latin1')`, [sello(5).p_codigo, sello(5).p_firma]), '23514');
  });
  prueba('NO-07 ni Dirección, Pagos, Fabricación ni anon pueden llamar a registrar_autorizacion ni a autorizacion_para_verificar: permission denied (solo service_role)', async () => {
    const db = await plantilla();
    for (const quien of ['dir', 'pag', 'fab']) {
      await esperarError(sesionDe(db, db.u[quien]).rpc('registrar_autorizacion', aut(db)), '42501', quien);
      await esperarError(sesionDe(db, db.u[quien]).rpc('autorizacion_para_verificar', { p_folio: FG, p_codigo: 'ABCD-EF01-2345' }), '42501', quien);
    }
    await esperarError(como(db, { rol: 'anon' }).rpc('registrar_autorizacion', aut(db)), '42501', 'anon');
    await esperarError(como(db, { rol: 'anon' }).rpc('autorizacion_para_verificar', { p_folio: FG, p_codigo: 'ABCD-EF01-2345' }), '42501', 'anon');
  });
  prueba('NO-08 p_usuario que NO es Dirección activa de esa empresa → ROL_SIN_PERMISO: Fabricación, Pagos, Dirección de OTRA empresa, de baja, invitado, uuid inexistente, nulo', async () => {
    const db = await plantilla();
    const x = await SR(db).transaccion(async t => {
      const r = {};
      for (const [que, u, e] of [['fab', db.u.fab.uid, 'al3d'], ['pag', db.u.pag.uid, 'al3d'], ['otra', db.u.otra.uid, 'al3d'], ['inv', db.u.inv.uid, 'al3d'], ['inexistente', '99999999-9999-4999-8999-999999999999', 'al3d'],
                                 ['nulo', null, 'al3d'], ['empresa nula', db.u.dir.uid, null], ['dir en otra empresa', db.u.dir.uid, 'otra']]) {
        r[que] = await reg(t, db, { p_usuario: u, p_empresa: e });
      }
      return r;
    });
    for (const [que, r] of Object.entries(x)) igual([que, r.ok, r.codigo, r.definitivo], [que, false, 'ROL_SIN_PERMISO', true]);
  });
  prueba('NO-08 una Dirección de baja ya no autoriza (aunque su cuenta exista)', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `update public.miembros set estado = 'baja', baja_en = now() where usuario_id = $1`, [db.u.dir2.uid]);
      const r = await llamar(SR(db), 'registrar_autorizacion', aut(db, { p_usuario: db.u.dir2.uid, p_autorizo: db.u.dir2.correo }));
      igual([r.ok, r.codigo], [false, 'ROL_SIN_PERMISO']);
      igual((await llamar(SR(db), 'registrar_autorizacion', aut(db, { p_usuario: db.u.dir.uid }))).ok, true, 'la otra Dirección sí');
    });
  });
});

describir('NO-09 a NO-11 la misma decisión, otra decisión, sin solicitud', () => {
  prueba('NO-09 la MISMA decisión dos veces: repetida:true, CERO filas nuevas y resuelve la solicitud pendiente (Q-A06)', async () => {
    await conCopia(plantilla, async copia => {
      igual((await llamar(como(copia, { rol: 'service_role', confirmar: true }), 'registrar_autorizacion', aut(copia))).repetida, false);
      await llamar(sesionDe(copia, copia.u.pag, { confirmar: true }), 'solicitar', { p_op: sol(FG, { nota: 'reautorizar' }) });     // nueva pendiente sobre una autorizada
      const n0 = (await una(copia, `select count(*)::int as n from public.autorizaciones`)).n;
      const r = await llamar(como(copia, { rol: 'service_role', confirmar: true }), 'registrar_autorizacion', aut(copia, { p_nota: 'ok' }));
      igual([r.ok, r.repetida, r.sello.codigo], [true, true, 'ABCD-EF01-2345']);
      igual((await una(copia, `select count(*)::int as n from public.autorizaciones`)).n, n0, 'cero filas nuevas');
      igual(await sql(copia, `select estado, autorizacion_id is not null as v from public.solicitudes where folio_global = $1 order by id`, [FG]).then(f => f.map(x => [x.estado, x.v])), [['autorizada', true], ['autorizada', true]], 'la pendiente quedó resuelta');
      igual((await una(copia, `select nota from public.solicitudes where folio_global = $1 order by id desc limit 1`, [FG])).nota, 'ok');
    });
  });
  prueba('NO-10 otra decisión: la vieja queda superada, la nueva vigente (UNA sola vigente) y la cotización apunta a la nueva', async () => {
    const x = await svc(async (t, db) => {
      await reg(t, db);
      const r2 = await reg(t, db, { p_total_txt: '15000.00', p_sub_calc_txt: '13000.00', ...sello(0xaaaabbbbcccc) });
      const f = await t.query(`select estado, codigo, total::text as total from public.autorizaciones where folio_global = $1 order by id`, [FG]);
      const c = (await t.query(`select a.codigo from public.cotizaciones c join public.autorizaciones a on a.id = c.autorizacion_id where c.folio_global = $1`, [FG]))[0];
      const b = await t.query(`select antes, despues from public.bitacora where accion = 'autorizo' order by id desc limit 1`);
      return { r2, f, c, b };
    });
    igual(x.r2.repetida, false);
    igual(x.f.map(r => [r.estado, r.codigo, r.total]), [['superada', 'ABCD-EF01-2345', '14500.00'], ['vigente', 'AAAA-BBBB-CCCC', '15000.00']]);
    igual(x.c.codigo, 'AAAA-BBBB-CCCC');
    igual([x.b[0].antes.estado, x.b[0].antes.codigo, x.b[0].despues.codigo], ['vigente', 'ABCD-EF01-2345', 'AAAA-BBBB-CCCC'], 'la bitácora dice qué sello quedó superado');
  });
  prueba('NO-10 un cambio de CUALQUIER campo firmado es otra decisión: huella, subtotal, precio, ajustes, proyecto o renglones', async () => {
    const x = await svc(async (t, db) => {
      await reg(t, db);
      const r = [];
      let n = 1;
      for (const cambio of [{ p_huella: 'c|1:y' }, { p_sub_calc_txt: '1.00' }, { p_precio_auth_txt: '9.00' }, { p_items_auth: '1:5.00' }, { p_proyecto: 'Otro' }, { p_renglones: '[["x",1,1]]' }]) {
        r.push((await reg(t, db, { ...cambio, ...sello(0x500 + n++) })).repetida);
      }
      return { r, vigentes: (await t.query(`select count(*)::int as n from public.autorizaciones where estado = 'vigente'`))[0].n };
    });
    igual(x.r, [false, false, false, false, false, false]);
    igual(x.vigentes, 1);
  });
  prueba('NO-11 autorizar sin solicitud previa: ok; solicito = el correo del autorizador; la cotización se crea (stub) desde p_cotizacion y queda autorizada', async () => {
    const x = await svc(async (t, db) => {
      const r = await reg(t, db, { p_folio_global: 'COT-0500-B@K7QM', p_cotizacion: cot(5), ...sello(0x500) });
      const a = (await t.query(`select solicito, estado from public.autorizaciones where folio_global = 'COT-0500-B@K7QM'`))[0];
      const c = (await t.query(`select estado, creado_por::text as por, folio, disp, proy, datos from public.cotizaciones where folio_global = 'COT-0500-B@K7QM'`))[0];
      const s = (await t.query(`select count(*)::int as n from public.solicitudes where folio_global = 'COT-0500-B@K7QM'`))[0].n;
      const sinCot = await reg(t, db, { p_folio_global: 'COT-0501-B@K7QM', p_cotizacion: null, ...sello(0x501) });
      const c2 = (await t.query(`select proy, cliente from public.cotizaciones where folio_global = 'COT-0501-B@K7QM'`))[0];
      return { r, a, c, s, sinCot, c2 };
    });
    const db = await plantilla();
    igual(x.r.ok, true);
    igual([x.a.solicito, x.a.estado], [db.u.dir.correo, 'vigente']);
    igual([x.c.estado, x.c.por, x.c.folio, x.c.disp, x.c.proy, x.c.datos.items.length], ['autorizada', db.u.dir.uid, 'COT-0500-B', 'K7QM', 'Tacos 5', 1]);
    igual(x.s, 0, 'sin solicitud previa no se inventa una');
    igual([x.sinCot.ok, x.c2.proy, x.c2.cliente], [true, 'Tacos "El Güero"', 'Juan'], 'sin p_cotizacion el stub sale del proyecto y el cliente firmados');
  });
});

describir('NO-12 y NO-13 lo firmado se revalida', () => {
  const MALOS = [
    ['código sin forma', { p_codigo: 'ABC' }], ['código en minúsculas', { p_codigo: 'abcd-ef01-2345' }], ['firma no hex', { p_firma: 'x'.repeat(64) }], ['firma en mayúsculas', { p_firma: 'ABCDEF012345' + '0'.repeat(52) }],
    ['firma de 63', { p_firma: 'abcdef012345' + '0'.repeat(51) }], ['código distinto del prefijo de la firma', { p_codigo: 'FFFF-FFFF-FFFF' }], ['ts_iso sin milisegundos ni Z', { p_ts_iso: '2026-10-01 04:30:15' }],
    ['ts_iso sin Z', { p_ts_iso: '2026-10-01T04:30:15.123' }], ['importe 12.5', { p_sub_calc_txt: '12.5' }], ['importe 1e5', { p_total_txt: '1e5' }], ['importe vacío', { p_precio_auth_txt: '' }],
    ['codificación latin1', { p_codificacion: 'latin1' }], ['codificación nula', { p_codificacion: null }], ['folio sin aparato', { p_folio_global: 'COT-0042-B' }], ['folio con espacios', { p_folio_global: 'COT 42@K7QM' }],
    ['folio nulo', { p_folio_global: null }], ['proyecto nulo', { p_proyecto: null }], ['huella nula', { p_huella: null }], ['items_auth nulo', { p_items_auth: null }], ['renglones nulos', { p_renglones: null }],
    ['ts nulo', { p_ts_iso: null }], ['código nulo', { p_codigo: null }], ['firma nula', { p_firma: null }], ['nota de 501', { p_nota: 'n'.repeat(501) }], ['ajuste fuera de rango', { p_ajuste_pct: 1000000 }],
  ];
  prueba(`NO-12 ${MALOS.length} textos mal formados → DATO_INVALIDO (definitivo) y NO se escribe nada`, async () => {
    const x = await svc(async (t, db) => {
      const r = [];
      for (const [que, malo] of MALOS) { const v = await reg(t, db, { p_folio_global: 'COT-0501-B@K7QM', ...malo }); r.push([que, v.ok, v.codigo, v.definitivo]); }
      return { r, n: (await t.query(`select count(*)::int as n from public.autorizaciones`))[0].n };
    });
    for (const [que, ok, codigo, def] of x.r) igual([que, ok, codigo, def], [que, false, 'DATO_INVALIDO', true]);
    igual(x.n, 0);
  });
  prueba('NO-12 lo que SÍ pasa: codificación utf-8, ajuste_pct con decimales, importes negativos y cero, nota de 500, items_auth y renglones vacíos (sello v1)', async () => {
    const x = await svc(async (t, db) => {
      const r = [];
      let n = 1;
      for (const ok of [{ p_codificacion: 'utf-8' }, { p_ajuste_pct: -12.5 }, { p_total_txt: '-5.00' }, { p_precio_auth_txt: '0.00' }, { p_nota: 'n'.repeat(500) }, { p_renglones: '' }, { p_items_auth: '1:1500.00,2:300.00' }]) {
        r.push((await reg(t, db, { p_folio_global: 'COT-0' + (600 + n) + '-B@K7QM', ...sello(0x600 + n++), ...ok })).ok);
      }
      return { r, v1: (await t.query(`select formato from public.autorizaciones where renglones = ''`)).map(f => f.formato) };
    });
    igual(x.r, [true, true, true, true, true, true, true]);
    igual(x.v1, ['v1'], 'sin renglones el sello es v1');
  });
  prueba('NO-13 p_autorizo distinto del correo del autorizador → DATO_INVALIDO (el correo firmado ES el del autorizador): otro correo, en mayúsculas, con espacios, vacío', async () => {
    const x = await svc(async (t, db) => {
      const r = [];
      for (const malo of ['otro@x.test', db.u.dir.correo.toUpperCase(), ' ' + db.u.dir.correo, db.u.dir2.correo, '']) r.push((await reg(t, db, { p_autorizo: malo })).codigo);
      return r;
    });
    igual(x, ['DATO_INVALIDO', 'DATO_INVALIDO', 'DATO_INVALIDO', 'DATO_INVALIDO', 'DATO_INVALIDO']);
  });
  prueba('NO-13 la otra Dirección autoriza con SU correo: ok, y queda su usuario_id', async () => {
    const x = await svc(async (t, db) => {
      const r = await reg(t, db, { p_usuario: db.u.dir2.uid, p_autorizo: db.u.dir2.correo });
      return { r, u: (await t.query(`select usuario_id::text as u, autorizo from public.autorizaciones`))[0] };
    });
    const db = await plantilla();
    igual([x.r.ok, x.u.u, x.u.autorizo], [true, db.u.dir2.uid, db.u.dir2.correo]);
  });
});

describir('NO-15 lo firmado es inmutable', () => {
  const COLUMNAS_FIRMADAS = [['folio_global', `'COT-9-B@K7QM'`], ['huella', `'otra'`], ['sub_calc_txt', `'1.00'`], ['precio_auth_txt', `'1.00'`], ['items_auth', `'1:1.00'`], ['total_txt', `'1.00'`],
    ['proyecto', `'otro'`], ['autorizo', `'otro@al3d.test'`], ['ts_iso', `'2026-10-02T04:30:15.123Z'`], ['renglones', `'[]'`], ['cliente', `'otro'`], ['ajuste_pct', '5'], ['solicito', `'otro'`],
    ['codigo', `'1111-2222-3333'`], ['firma', `'${'1'.repeat(64)}'`], ['clave_id', `'k9'`], ['codificacion', `'utf-8'`], ['origen', `'importada_hoja'`], ['fila_hoja', '7'], ['empresa_id', `'otra'`]];
  prueba(`NO-15 un UPDATE de cualquier columna firmada o informativa (${COLUMNAS_FIRMADAS.length}) lo detiene el trigger (P0001), también para service_role y para el dueño`, () => conCopia(plantilla, async db => {
    await llamar(como(db, { rol: 'service_role', confirmar: true }), 'registrar_autorizacion', aut(db));
    for (const [col, val] of COLUMNAS_FIRMADAS) {
      await esperarError(SR(db).query(`update public.autorizaciones set ${col} = ${val}`), 'P0001', `service_role ${col}`);
    }
    await esperarError(sql(db, `update public.autorizaciones set huella = 'otra'`), 'P0001', 'dueño');
    await esperarError(sql(db, `update public.autorizaciones set id = id + 100`), '428C9', 'id (identidad: solo DEFAULT)');
    await esperarError(sql(db, `update public.autorizaciones set usuario_id = null`), 'P0001', 'usuario_id');
  }));
  prueba('NO-15 solo cambia `estado` (y `nota` junto con él); vigente → superada/revocada sí; superada o revocada son TERMINALES; una nota sola no cambia', () => conCopia(plantilla, async db => {
    await llamar(como(db, { rol: 'service_role', confirmar: true }), 'registrar_autorizacion', aut(db));
    const S = SR(db);
    await esperarError(S.query(`update public.autorizaciones set nota = 'sin cambio de estado'`), 'P0001', 'nota sola');
    igual((await S.query(`update public.autorizaciones set estado = 'revocada', nota = 'error' returning estado, nota`))[0], { estado: 'revocada', nota: 'error' });
    await sql(db, `update public.autorizaciones set estado = 'revocada', nota = 'error'`);
    await esperarError(sql(db, `update public.autorizaciones set estado = 'vigente'`), 'P0001', 'revocada -> vigente');
    await esperarError(sql(db, `update public.autorizaciones set estado = 'superada'`), 'P0001', 'revocada -> superada');
    await insertarAutorizacion(db, { folio_global: 'COT-8-B@K7QM', ...(() => { const s = sello(8); return { codigo: s.p_codigo, firma: s.p_firma }; })() });
    await sql(db, `update public.autorizaciones set estado = 'superada' where folio_global = 'COT-8-B@K7QM'`);
    await esperarError(sql(db, `update public.autorizaciones set estado = 'vigente' where folio_global = 'COT-8-B@K7QM'`), 'P0001', 'superada -> vigente');
    await esperarError(sql(db, `update public.autorizaciones set estado = 'revocada' where folio_global = 'COT-8-B@K7QM'`), 'P0001', 'superada -> revocada');
  }));
  prueba('NO-15 las restricciones de la tabla: una sola vigente por folio, código = prefijo de la firma, correo en minúsculas, importes NNNN.NN, estado conocido', () => conCopia(plantilla, async db => {
    await insertarAutorizacion(db, { folio_global: 'COT-8-B@K7QM', ...(() => { const s = sello(8); return { codigo: s.p_codigo, firma: s.p_firma }; })() });
    const s9 = sello(9), mal = o => insertarAutorizacion(db, { folio_global: 'COT-9-B@K7QM', codigo: s9.p_codigo, firma: s9.p_firma, ...o });
    await esperarError(insertarAutorizacion(db, { folio_global: 'COT-8-B@K7QM', ...(() => { const s = sello(10); return { codigo: s.p_codigo, firma: s.p_firma }; })() }), '23505', 'dos vigentes');
    await esperarError(mal({ codigo: 'FFFF-FFFF-FFFF' }), '23514', 'código ≠ prefijo');
    await esperarError(mal({ autorizo: 'Dir@al3d.test' }), '23514', 'correo en mayúsculas');
    await esperarError(mal({ autorizo: '' }), '23514', 'correo vacío');
    await esperarError(mal({ sub_calc_txt: '12.5' }), '23514', 'importe sin dos decimales');
    await esperarError(mal({ total_txt: 'abc' }), /22P02|23514/, 'importe no numérico (la columna generada lo rechaza antes que el CHECK)');
    await esperarError(mal({ estado: 'rara' }), '23514', 'estado');
    await esperarError(mal({ ts_iso: '2026-10-01T04:30:15Z' }), '23514', 'ts sin milisegundos');
    await esperarError(mal({ folio_global: 'sin arroba' }), '23514', 'folio');
    await esperarError(mal({ nota: 'n'.repeat(501) }), '23514', 'nota larga');
    await esperarError(mal({ empresa_id: 'noexiste' }), '23503', 'empresa');
    const ok = await mal({ estado: 'superada' });
    cierto(ok > 0, 'una superada del mismo folio no choca con la vigente');
  }));
});

describir('NO-19 y NO-20 autorizacion_para_verificar', () => {
  const COLUMNAS = ['autorizo', 'codificacion', 'codigo', 'estado', 'firma', 'folio_global', 'huella', 'items_auth', 'precio_auth', 'proyecto', 'renglones', 'sub_calc', 'total', 'ts_iso'];
  const para = (t, folio, codigo) => rpcT(t, 'autorizacion_para_verificar', { p_folio: folio, p_codigo: codigo });
  prueba('NO-19 devuelve las filas con los nombres de columna de sello.js (+ codificacion) y los importes como texto NNNN.NN; acepta folio corto, con @aparato y en minúsculas; el código con o sin guiones y minúsculas', async () => {
    const x = await svc(async (t, db) => {
      await reg(t, db, { p_sub_calc_txt: '12500.00', p_precio_auth_txt: '0.00', p_total_txt: '14500.00' });
      return { a: await para(t, FG, 'ABCD-EF01-2345'), b: await para(t, 'COT-0042-B', 'abcdef012345'), c: await para(t, 'cot-0042-b', 'abcd ef01-2345'), d: await para(t, 'COT-0042', 'ABCD-EF01-2345') };
    });
    igual(x.a.ok, true);
    igual(x.a.filas.length, 1);
    igual(Object.keys(x.a.filas[0]).sort(), COLUMNAS);
    const f = x.a.filas[0];
    igual([f.folio_global, f.sub_calc, f.precio_auth, f.total, f.estado, f.codificacion, f.autorizo, f.codigo, f.firma.length, f.ts_iso, f.huella, f.items_auth, f.renglones],
          [FG, '12500.00', '0.00', '14500.00', 'vigente', 'ascii-?', 'dir@al3d.test', 'ABCD-EF01-2345', 64, '2026-10-01T04:30:15.123Z', 'c|1:x', '', '[["Letras",8,12500]]']);
    igual([x.b.filas.length, x.c.filas.length], [1, 1], 'sin aparato y en minúsculas también');
    igual(x.d.filas, [], 'COT-0042 NO es COT-0042-B: el folio corto debe ser el impreso completo');
  });
  prueba('NO-19 formas inválidas o folios que no existen → filas: [] (ok:true); un código que no es de ese folio tampoco devuelve nada', async () => {
    const x = await svc(async (t, db) => {
      await reg(t, db);
      const r = {};
      for (const [que, f, c] of [['folio con espacios', 'x y', 'ABCDEF012345'], ['código corto', FG, '123'], ['código nulo', FG, null], ['folio nulo', null, 'ABCDEF012345'], ['folio inexistente', 'COT-9@K7QM', 'ABCDEF012345'],
                                 ['otro código', FG, '000000000000'], ['otro aparato', 'COT-0042-B@ZZZZ', 'ABCDEF012345'], ['vacío', '', '']]) r[que] = await para(t, f, c);
      return r;
    });
    for (const [que, v] of Object.entries(x)) igual([que, v.ok, v.filas], [que, true, []]);
  });
  prueba('NO-19 dos COT-0042 de aparatos distintos: el CÓDIGO los separa; con el mismo código, la más antigua primero; la misma firma superada y vigente salen las dos (la más antigua primero)', () => conCopia(plantilla, async db => {
    const a = sello(0xaaaa00000001), b = sello(0xbbbb00000002);
    await insertarAutorizacion(db, { folio_global: 'COT-0042-B@K7QM', codigo: a.p_codigo, firma: a.p_firma, estado: 'superada', total_txt: '100.00' });
    await insertarAutorizacion(db, { folio_global: 'COT-0042-B@K7QM', codigo: a.p_codigo, firma: a.p_firma, estado: 'vigente', total_txt: '100.00' });
    await insertarAutorizacion(db, { folio_global: 'COT-0042-B@ZZZZ', codigo: b.p_codigo, firma: b.p_firma, total_txt: '200.00' });
    const x = await SR(db).transaccion(async t => ({ k7: await para(t, 'COT-0042-B', a.p_codigo), zz: await para(t, 'COT-0042-B', b.p_codigo), exacto: await para(t, 'COT-0042-B@ZZZZ', b.p_codigo), cruzado: await para(t, 'COT-0042-B@ZZZZ', a.p_codigo) }));
    igual(x.k7.filas.map(f => [f.folio_global, f.estado, f.total]), [['COT-0042-B@K7QM', 'superada', '100.00'], ['COT-0042-B@K7QM', 'vigente', '100.00']]);
    igual(x.zz.filas.map(f => [f.folio_global, f.total]), [['COT-0042-B@ZZZZ', '200.00']], 'el código separa a los dos aparatos');
    igual(x.exacto.filas.length, 1);
    igual(x.cruzado.filas, [], 'el folio con aparato exige el aparato correcto');
  }));
  prueba('NO-19 devuelve hasta 50 filas', () => conCopia(plantilla, async db => {
    const a = sello(0xcccc00000003);
    for (let i = 1; i <= 52; i++) await insertarAutorizacion(db, { folio_global: 'COT-0042-B@K7QM', codigo: a.p_codigo, firma: a.p_firma, estado: 'superada', total_txt: i + '.00' });
    const x = await SR(db).transaccion(t => para(t, 'COT-0042-B', a.p_codigo));
    igual(x.filas.length, 50);
    igual(x.filas.map(f => f.total), Array.from({ length: 50 }, (_, i) => (i + 1) + '.00'), 'las 50 más ANTIGUAS, de la más antigua a la más nueva');
  }));
  prueba('NO-20 una revocada y una superada se devuelven con SU total y su estado (/verificar dice «Revocada» o «Sustituida» con el total impreso)', () => conCopia(plantilla, async db => {
    const c1 = await llamar(como(db, { rol: 'service_role', confirmar: true }), 'registrar_autorizacion', aut(db, { p_total_txt: '14500.00' }));
    igual(c1.ok, true);
    await llamar(como(db, { rol: 'service_role', confirmar: true }), 'registrar_autorizacion', aut(db, { p_total_txt: '15000.00', p_sub_calc_txt: '13000.00', ...sello(0x1234abcd5678) }));
    await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'revocar_autorizacion', { p_folio_global: FG, p_nota: 'precio mal' });
    const x = await SR(db).transaccion(async t => ({ vieja: await para(t, FG, 'ABCD-EF01-2345'), nueva: await para(t, FG, '1234-ABCD-5678') }));
    igual(x.vieja.filas.map(f => [f.estado, f.total]), [['superada', '14500.00']]);
    igual(x.nueva.filas.map(f => [f.estado, f.total]), [['revocada', '15000.00']]);
  }));
});

await resumen();
