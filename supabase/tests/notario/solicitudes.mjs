// Pedir, cancelar, rechazar y consultar autorizaciones — A.md §5.10-§5.11 y §10.11, casos NO-01 a NO-05, NO-16, NO-17, NO-18, NO-21 y NO-25.
//
//   · `solicitar`: cualquier miembro (también Fabricación) pide que Dirección autorice el precio; la cotización nace PRIMERO (FK) y re-pedir sobrescribe
//     la MISMA fila; las partidas se LIMPIAN (solo los 14 campos de precio y `desc`);
//   · `cancelar_solicitud` (el autor o Dirección), `rechazar_solicitud` y `revocar_autorizacion` (solo Dirección);
//   · `estado_solicitudes`: cada quien ve lo SUYO; Fabricación recibe el estado y el sello SIN importes;
//   · `cotizacion_guardar` y `cuaderno_guardar`: lo único que un teléfono escribe a mano sobre sus cotizaciones y sus notas.
//
// Las pruebas que hacen varias peticiones de distintas personas CONFIRMAN sobre una copia de la base (`conCopia`) y leen el resultado como superusuario.
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { sesionDe, llamar, una, sql, conCopia, como } from '../comun/semilla.js';
import { crearBaseNotario, cot, sol, sello, aut, insertarAutorizacion } from '../comun/notario.js';

const plantilla = dato(crearBaseNotario, { limpiar: db => db.close() });
const FG = 'COT-0100-B@K7QM';
const C = (db, quien) => sesionDe(db, db.u[quien], { confirmar: true });          // sesión que CONFIRMA (para armar estado sobre una copia)
const SVC = db => como(db, { rol: 'service_role', confirmar: true });
const sol_ = async (db, quien, fg, o) => llamar(C(db, quien), 'solicitar', { p_op: sol(fg, o) });
/** Dirección autoriza `fg` como lo hace la Edge Function: `registrar_autorizacion` como service_role. */
const autorizar = (db, fg, n = 1, o = {}) => llamar(SVC(db), 'registrar_autorizacion', aut(db, { p_folio_global: fg, ...sello(n), ...o }));

describir('NO-01 solicitar', () => {
  for (const quien of ['dir', 'fab', 'pag']) {
    prueba(`NO-01 (${quien}) pide autorización: pendiente; nace la cotización (con su autor) y la solicitud (con su correo); queda en la bitácora de dinero`, () => conCopia(plantilla, async db => {
      const r = await sol_(db, quien, FG, { nota: 'urgente' });
      igual([r.ok, r.estado], [true, 'pendiente']);
      const c = await una(db, `select estado, creado_por::text as por, folio, disp, datos, proy, cliente from public.cotizaciones where folio_global = $1`, [FG]);
      igual([c.estado, c.por, c.folio, c.disp, c.proy, c.cliente], ['pendiente', db.u[quien].uid, 'COT-0100-B', 'K7QM', 'Tacos 1', 'Juan']);
      igual([c.datos.proy, c.datos.items[0].pu, c.datos.subtotal, c.datos.iva], ['Tacos 1', 1500, 12500, true]);
      const s = await una(db, `select estado, solicito_id::text as por, solicito_texto, nota, subtotal::text as sub, iva, huella, proyecto from public.solicitudes where folio_global = $1`, [FG]);
      igual([s.estado, s.por, s.solicito_texto, s.nota, s.sub, s.iva, s.huella, s.proyecto], ['pendiente', db.u[quien].uid, db.u[quien].correo, 'urgente', '12500', true, 'c|1:x', 'Tacos 1']);
      const b = await sql(db, `select nivel, accion, entidad from public.bitacora where entidad_id = $1`, [FG]);
      igual(b.map(x => [x.nivel, x.accion, x.entidad]), [['dinero', 'solicito', 'cotizacion']], 'la bitácora de una solicitud es de dinero: Fabricación no la ve');
    }));
  }
  prueba('NO-01 folio sin @, 0 partidas, 81 partidas, sin items, partida sin id, id repetido, subtotal no numérico y op que no es objeto: DATO_INVALIDO (definitivo)', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    const casos = [
      ['folio sin @', sol('COT-0099')], ['folio con aparato vacío', sol('COT-0099@')], ['0 partidas', sol(FG, { cotizacion: cot(1, { items: [] }) })],
      ['sin items', sol(FG, { cotizacion: { proyecto: 'x', iva: true, subtotal: 1 } })],
      ['81 partidas', sol(FG, { cotizacion: cot(1, { items: Array.from({ length: 81 }, (_, i) => ({ id: i + 1 })) }) })],
      ['partida sin id', sol(FG, { cotizacion: cot(1, { items: [{ tipo: 'x' }] }) })], ['id repetido', sol(FG, { cotizacion: cot(1, { items: [{ id: 1 }, { id: '1' }] }) })],
      ['subtotal no numérico', sol(FG, { cotizacion: cot(1, { subtotal: 'x' }) })], ['sin cotización', { folio_global: FG }],
      ['op que no es objeto', JSON.stringify('texto')], ['op arreglo', '[]'],
    ];
    for (const [que, op] of casos) {
      const r = await llamar(D, 'solicitar', { p_op: op });
      igual([que, r.ok, r.codigo, r.definitivo], [que, false, 'DATO_INVALIDO', true]);
    }
    const lleno = await llamar(D, 'solicitar', { p_op: sol(FG, { cotizacion: cot(1, { items: Array.from({ length: 80 }, (_, i) => ({ id: i + 1 })) }) }) });
    igual(lleno.ok, true, 'con 80 partidas sí pasa');
  });
  prueba('NO-01 las partidas se LIMPIAN: de cada una solo quedan los 14 campos de precio y desc (≤ 300); los campos ajenos se eliminan; proyecto y cliente sin espacios a los lados', () => conCopia(plantilla, async db => {
    const larga = 'd'.repeat(400);
    await llamar(C(db, 'dir'), 'solicitar', { p_op: sol(FG, { cotizacion: { proyecto: '  Tacos ñ  ', cliente: ' Ana ', iva: 1, subtotal: '100.5',
      items: [{ id: 'a', tipo: 'caja', ajeno: 'x', precioSecreto: 9, desc: larga, pu: 10, comp: null, ok: true }] } }) });
    const s = await una(db, `select cotizacion, subtotal::text as sub from public.solicitudes where folio_global = $1`, [FG]);
    igual(Object.keys(s.cotizacion.items[0]).sort(), ['comp', 'desc', 'id', 'pu', 'tipo']);
    igual([s.cotizacion.items[0].desc.length, s.cotizacion.proyecto, s.cotizacion.cliente, s.cotizacion.iva, s.cotizacion.subtotal, s.sub], [300, 'Tacos ñ', 'Ana', true, 100.5, '100.5']);
  }));
  prueba('NO-01 sin sesión (anon) no puede solicitar: permission denied; sin cabecera de contrato: CLIENTE_VIEJO', async () => {
    const db = await plantilla();
    await esperarError(como(db, { rol: 'anon' }).rpc('solicitar', { p_op: sol(FG) }), '42501');
    const r = await llamar(como(db, { rol: 'authenticated', uid: db.u.dir.uid, correo: db.u.dir.correo }), 'solicitar', { p_op: sol(FG) });
    igual([r.ok, r.codigo, r.definitivo], [false, 'CLIENTE_VIEJO', false]);
  });
  prueba('NO-01 una persona sin acceso (ext), de baja o de otra empresa no solicita: SIN_ACCESO / ACCESO_REVOCADO; con p_empresa ajena, tampoco', async () => {
    const db = await plantilla();
    const r = async (quien, extra) => llamar(sesionDe(db, db.u[quien]), 'solicitar', { p_op: sol(FG), ...extra });
    igual((await r('ext')).codigo, 'SIN_ACCESO');
    igual((await r('baja')).codigo, 'ACCESO_REVOCADO');
    igual((await r('otra', { p_empresa: 'al3d' })).codigo, 'SIN_ACCESO');
    igual((await r('noverif')).codigo, 'SIN_ACCESO', 'una invitación sin reclamar no es acceso');
  });
});

describir('NO-02 y NO-03 re-pedir y una sola pendiente', () => {
  prueba('NO-02 Pagos re-pide el mismo folio: la MISMA fila (mismo id) con ts nuevo y la nota nueva; otro Pagos → ROL_SIN_PERMISO; Dirección sí', () => conCopia(plantilla, async db => {
    await sol_(db, 'pag', FG);
    const antes = await una(db, `select id, ts from public.solicitudes where folio_global = $1`, [FG]);
    await sol_(db, 'pag', FG, { nota: 'otra vez' });
    const filas = await sql(db, `select id, ts, nota from public.solicitudes where folio_global = $1`, [FG]);
    igual([filas.length, filas[0].id === antes.id, filas[0].ts > antes.ts, filas[0].nota], [1, true, true, 'otra vez']);
    const otro = await llamar(sesionDe(db, db.u.pag2), 'solicitar', { p_op: sol(FG) });
    igual([otro.ok, otro.codigo, otro.definitivo], [false, 'ROL_SIN_PERMISO', true]);
    igual((await sol_(db, 'dir', FG, { nota: 'la de Dirección' })).ok, true);
    igual((await una(db, `select count(*)::int as n from public.solicitudes where folio_global = $1`, [FG])).n, 1, 'sigue siendo una sola fila pendiente');
    igual((await una(db, `select solicito_id::text as por from public.solicitudes where folio_global = $1`, [FG])).por, db.u.pag.uid, 'quien la pidió primero sigue siendo el autor');
  }));
  prueba('NO-02 Fabricación no puede pedir sobre el folio de otra persona; el mismo folio de otra empresa no choca', () => conCopia(plantilla, async db => {
    await sol_(db, 'pag', FG);
    const r = await llamar(sesionDe(db, db.u.fab), 'solicitar', { p_op: sol(FG) });
    igual([r.ok, r.codigo], [false, 'ROL_SIN_PERMISO']);
    const multi = await llamar(sesionDe(db, db.u.multi, { confirmar: true }), 'solicitar', { p_empresa: 'otra', p_op: sol(FG) });
    igual(multi.ok, true, 'multi es Fabricación en «otra»: ahí el folio es nuevo');
  }));
  prueba('NO-02 el folio es de QUIEN lo creó aunque ya no tenga solicitud pendiente: otro Pagos y Fabricación reciben ROL_SIN_PERMISO; el autor y Dirección sí pueden pedir de nuevo', () => conCopia(plantilla, async db => {
    await sol_(db, 'pag', FG);
    await autorizar(db, FG);                                         // la solicitud quedó resuelta: ya no hay pendiente que proteja el folio
    igual((await una(db, `select count(*)::int as n from public.solicitudes where folio_global = $1 and estado = 'pendiente'`, [FG])).n, 0);
    for (const quien of ['pag2', 'fab']) {
      const r = await llamar(sesionDe(db, db.u[quien]), 'solicitar', { p_op: sol(FG) });
      igual([quien, r.ok, r.codigo, r.definitivo], [quien, false, 'ROL_SIN_PERMISO', true]);
    }
    igual((await llamar(sesionDe(db, db.u.pag), 'solicitar', { p_op: sol(FG) })).ok, true, 'el autor');
    igual((await llamar(sesionDe(db, db.u.dir), 'solicitar', { p_op: sol(FG) })).ok, true, 'Dirección');
  }));
  prueba('NO-02 re-pedir una cotización ya AUTORIZADA no cambia su estado: el sello vigente sigue valiendo hasta que se reautorice', () => conCopia(plantilla, async db => {
    await sol_(db, 'pag', FG);
    igual((await autorizar(db, FG)).ok, true);
    await sol_(db, 'pag', FG, { nota: 'reautorizar' });
    const c = await una(db, `select estado, autorizacion_id is not null as con from public.cotizaciones where folio_global = $1`, [FG]);
    igual([c.estado, c.con], ['autorizada', true]);
    igual(await sql(db, `select estado from public.solicitudes where folio_global = $1 order by id`, [FG]).then(r => r.map(x => x.estado)), ['autorizada', 'pendiente']);
  }));
  prueba('NO-03 dos pendientes del mismo folio (insert directo): unique_violation; una solicitud sin su cotización viola la FK', () => conCopia(plantilla, async db => {
    await sol_(db, 'pag', FG);
    await esperarError(sql(db, `insert into public.solicitudes (empresa_id, folio_global, cotizacion, estado) values ('al3d', $1, '{}'::jsonb, 'pendiente')`, [FG]), '23505');
    await esperarError(sql(db, `insert into public.solicitudes (empresa_id, folio_global, cotizacion, estado) values ('al3d', 'COT-7777-B@X', '{}'::jsonb, 'pendiente')`), '23503');
    await sql(db, `insert into public.solicitudes (empresa_id, folio_global, cotizacion, estado) values ('al3d', $1, '{}'::jsonb, 'cancelada')`, [FG]);      // no pendientes: las que sean
  }));
});

describir('NO-04 y NO-05 cancelar y rechazar', () => {
  prueba('NO-04 cancelar: la propia → cancelada (y la cotización «retirada»); la ajena → ROL_SIN_PERMISO; sin pendiente → ok con estado null; Dirección cancela la de cualquiera', () => conCopia(plantilla, async db => {
    await sol_(db, 'pag', FG);
    const ajena = await llamar(sesionDe(db, db.u.pag2), 'cancelar_solicitud', { p_folio_global: FG });
    igual([ajena.ok, ajena.codigo], [false, 'ROL_SIN_PERMISO']);
    const nada = await llamar(sesionDe(db, db.u.pag), 'cancelar_solicitud', { p_folio_global: 'COT-NADA-B@K7QM' });
    igual([nada.ok, nada.estado], [true, null]);
    const r = await llamar(C(db, 'pag'), 'cancelar_solicitud', { p_folio_global: FG });
    igual([r.ok, r.estado], [true, 'cancelada']);
    const v = await una(db, `select s.estado as se, c.estado as ce, s.resolvio_texto as quien, s.resolvio_id::text as qid from public.solicitudes s join public.cotizaciones c using (empresa_id, folio_global) where folio_global = $1`, [FG]);
    igual([v.se, v.ce, v.quien, v.qid], ['cancelada', 'retirada', db.u.pag.correo, db.u.pag.uid]);
    await sol_(db, 'fab', 'COT-0101-B@K7QM');
    const dir = await llamar(C(db, 'dir'), 'cancelar_solicitud', { p_folio_global: 'COT-0101-B@K7QM' });
    igual([dir.ok, dir.estado], [true, 'cancelada']);
    for (const malo of ['sin arroba', null, '']) igual((await llamar(sesionDe(db, db.u.dir), 'cancelar_solicitud', { p_folio_global: malo })).codigo, 'DATO_INVALIDO', String(malo));
  }));
  prueba('NO-04 Fabricación cancela la suya; tras cancelar se puede pedir de nuevo (una pendiente nueva)', () => conCopia(plantilla, async db => {
    await sol_(db, 'fab', FG);
    igual((await llamar(C(db, 'fab'), 'cancelar_solicitud', { p_folio_global: FG })).estado, 'cancelada');
    igual((await sol_(db, 'fab', FG)).estado, 'pendiente');
    igual(await sql(db, `select estado from public.solicitudes where folio_global = $1 order by id`, [FG]).then(r => r.map(x => x.estado)), ['cancelada', 'pendiente']);
    igual((await una(db, `select estado from public.cotizaciones where folio_global = $1`, [FG])).estado, 'pendiente', 'la cotización vuelve a pendiente al re-pedir');
  }));
  prueba('NO-05 rechazar: solo Dirección (Fabricación y Pagos → ROL_SIN_PERMISO); queda la nota; sin pendiente → NO_ENCONTRADO', () => conCopia(plantilla, async db => {
    await sol_(db, 'pag', FG);
    for (const quien of ['fab', 'pag']) {
      const r = await llamar(sesionDe(db, db.u[quien]), 'rechazar_solicitud', { p_folio_global: FG });
      igual([quien, r.ok, r.codigo, r.definitivo], [quien, false, 'ROL_SIN_PERMISO', true]);
    }
    igual((await llamar(sesionDe(db, db.u.dir), 'rechazar_solicitud', { p_folio_global: 'COT-NADA-B@K7QM' })).codigo, 'NO_ENCONTRADO');
    const r = await llamar(C(db, 'dir'), 'rechazar_solicitud', { p_folio_global: FG, p_nota: 'caro' });
    igual([r.ok, r.estado], [true, 'rechazada']);
    const v = await una(db, `select s.estado as se, s.nota, s.resolvio_texto as quien, c.estado as ce from public.solicitudes s join public.cotizaciones c using (empresa_id, folio_global) where folio_global = $1`, [FG]);
    igual([v.se, v.nota, v.quien, v.ce], ['rechazada', 'caro', db.u.dir.correo, 'rechazada']);
    igual((await llamar(sesionDe(db, db.u.dir), 'rechazar_solicitud', { p_folio_global: FG })).codigo, 'NO_ENCONTRADO', 'ya no está pendiente');
  }));
  prueba('NO-05 rechazar NO toca una autorización vigente del mismo folio (ni el estado «autorizada» de la cotización)', () => conCopia(plantilla, async db => {
    await sol_(db, 'pag', FG);
    igual((await autorizar(db, FG)).ok, true);
    await sol_(db, 'pag', FG, { nota: 'otra vez' });                                  // nueva solicitud pendiente sobre una autorizada
    igual((await llamar(C(db, 'dir'), 'rechazar_solicitud', { p_folio_global: FG, p_nota: 'no' })).ok, true);
    igual(await sql(db, `select estado from public.autorizaciones where folio_global = $1`, [FG]).then(r => r.map(x => x.estado)), ['vigente']);
    igual((await una(db, `select estado from public.cotizaciones where folio_global = $1`, [FG])).estado, 'autorizada');
    igual(await sql(db, `select estado from public.solicitudes where folio_global = $1 order by id`, [FG]).then(r => r.map(x => x.estado)), ['autorizada', 'rechazada']);
  }));
});

describir('NO-14 revocar', () => {
  prueba('NO-14 revocar_autorizacion: solo Dirección; la vigente pasa a «revocada» con su nota y la cotización queda con revocada_en (sin cambiar su estado); sin vigente → NO_ENCONTRADO', () => conCopia(plantilla, async db => {
    await sol_(db, 'pag', FG);
    await autorizar(db, FG);
    for (const quien of ['fab', 'pag']) igual((await llamar(sesionDe(db, db.u[quien]), 'revocar_autorizacion', { p_folio_global: FG })).codigo, 'ROL_SIN_PERMISO', quien);
    igual((await llamar(sesionDe(db, db.u.dir), 'revocar_autorizacion', { p_folio_global: 'COT-NADA-B@K7QM' })).codigo, 'NO_ENCONTRADO');
    igual((await llamar(C(db, 'dir'), 'revocar_autorizacion', { p_folio_global: FG, p_nota: 'error de precio' })).ok, true);
    igual(await una(db, `select estado, nota from public.autorizaciones where folio_global = $1`, [FG]), { estado: 'revocada', nota: 'error de precio' });
    igual(await una(db, `select revocada_en is not null as r, estado from public.cotizaciones where folio_global = $1`, [FG]), { r: true, estado: 'autorizada' });
    igual((await llamar(sesionDe(db, db.u.dir), 'revocar_autorizacion', { p_folio_global: FG })).codigo, 'NO_ENCONTRADO', 'ya no hay vigente');
    const b = await sql(db, `select nivel, accion, antes, despues from public.bitacora where accion = 'revoco'`);
    igual(b.map(x => [x.nivel, x.accion, x.antes, x.despues]), [['dinero', 'revoco', { estado: 'vigente' }, { estado: 'revocada' }]]);
  }));
  prueba('NO-14 reautorizar tras revocar crea una vigente NUEVA y limpia revocada_en; la revocada es terminal (no se resucita con un update)', () => conCopia(plantilla, async db => {
    await sol_(db, 'pag', FG);
    await autorizar(db, FG, 1);
    await llamar(C(db, 'dir'), 'revocar_autorizacion', { p_folio_global: FG });
    const r = await autorizar(db, FG, 2);
    igual([r.ok, r.repetida], [true, false]);
    igual(await sql(db, `select estado from public.autorizaciones where folio_global = $1 order by id`, [FG]).then(x => x.map(y => y.estado)), ['revocada', 'vigente']);
    igual((await una(db, `select revocada_en is null as r from public.cotizaciones where folio_global = $1`, [FG])).r, true);
    await esperarError(sql(db, `update public.autorizaciones set estado = 'vigente' where estado = 'revocada'`), 'P0001');
  }));
});

describir('NO-16 y NO-17 estado_solicitudes', () => {
  const armar = async db => {
    await sol_(db, 'dir', 'COT-0010-B@K7QM');
    await sol_(db, 'pag', 'COT-0012-B@K7QM');
    await sol_(db, 'fab', 'COT-0013-B@K7QM');
    await autorizar(db, 'COT-0012-B@K7QM', 12, { p_items_auth: '1:1500.00', p_total_txt: '15000.00', p_sub_calc_txt: '13000.00' });
  };
  prueba('NO-16 Dirección ve todo (estado y sello completo con huella, importes y renglones como JSON); un folio inválido se OMITE del mapa', () => conCopia(plantilla, async db => {
    await armar(db);
    const r = await llamar(sesionDe(db, db.u.dir), 'estado_solicitudes', { p_folios: ['COT-0010-B@K7QM', 'COT-0012-B@K7QM', 'COT-0013-B@K7QM', 'COT-malo', 'sin arroba'] });
    igual(r.ok, true);
    igual(Object.keys(r.folios).sort(), ['COT-0010-B@K7QM', 'COT-0012-B@K7QM', 'COT-0013-B@K7QM']);
    igual(['COT-0010-B@K7QM', 'COT-0012-B@K7QM', 'COT-0013-B@K7QM'].map(f => r.folios[f].estado), ['pendiente', 'autorizada', 'pendiente']);
    const s = r.folios['COT-0012-B@K7QM'].sello;
    igual(Object.keys(s).sort(), ['codigo', 'correo', 'huella', 'itemsAuth', 'nota', 'precioAuth', 'renglones', 'subCalc', 'total', 'ts']);
    igual([s.codigo, s.correo, s.ts, s.huella, s.subCalc, s.precioAuth, s.total, s.itemsAuth, s.renglones, s.nota],
          [sello(12).p_codigo, db.u.dir.correo, '2026-10-01T04:30:15.123Z', 'c|1:x', 13000, 0, 15000, { 1: 1500 }, [{ descripcion: 'Letras', cantidad: 8, importe: 12500 }], '']);
    igual(r.folios['COT-0010-B@K7QM'].sello, null, 'una solicitud sin resolver no trae sello');
  }));
  prueba('NO-16 Pagos solo ve lo SUYO (de lo ajeno: estado null y sin sello) y su sello llega COMPLETO', () => conCopia(plantilla, async db => {
    await armar(db);
    const r = await llamar(sesionDe(db, db.u.pag), 'estado_solicitudes', { p_folios: ['COT-0012-B@K7QM', 'COT-0010-B@K7QM', 'COT-0013-B@K7QM', 'COT-malo'] });
    igual(Object.keys(r.folios).sort(), ['COT-0010-B@K7QM', 'COT-0012-B@K7QM', 'COT-0013-B@K7QM']);
    igual([r.folios['COT-0010-B@K7QM'].estado, r.folios['COT-0010-B@K7QM'].sello, r.folios['COT-0013-B@K7QM'].estado], [null, null, null]);
    igual(r.folios['COT-0012-B@K7QM'].estado, 'autorizada');
    cierto('total' in r.folios['COT-0012-B@K7QM'].sello && 'renglones' in r.folios['COT-0012-B@K7QM'].sello, 'Pagos ve el sello completo de lo suyo');
    const otro = await llamar(sesionDe(db, db.u.pag2), 'estado_solicitudes', { p_folios: ['COT-0012-B@K7QM'] });
    igual([otro.folios['COT-0012-B@K7QM'].estado, otro.folios['COT-0012-B@K7QM'].sello], [null, null], 'otro Pagos no ve la de su compañero');
  }));
  prueba('NO-16 / R1-14 Fabricación: lo ajeno → null; lo propio pendiente → «pendiente» sin sello; lo propio autorizado → sello {codigo, correo, ts} SIN importes ni renglones', () => conCopia(plantilla, async db => {
    await armar(db);
    const F = sesionDe(db, db.u.fab);
    const a = await llamar(F, 'estado_solicitudes', { p_folios: ['COT-0012-B@K7QM', 'COT-0013-B@K7QM'] });
    igual([a.folios['COT-0012-B@K7QM'].estado, a.folios['COT-0012-B@K7QM'].sello, a.folios['COT-0013-B@K7QM'].estado, a.folios['COT-0013-B@K7QM'].sello], [null, null, 'pendiente', null]);
    await autorizar(db, 'COT-0013-B@K7QM', 13, { p_total_txt: '98765.43', p_sub_calc_txt: '88888.00', p_renglones: '[["Secreto",1,98765.43]]' });
    const b = await llamar(F, 'estado_solicitudes', { p_folios: ['COT-0013-B@K7QM'] });
    igual(b.folios['COT-0013-B@K7QM'].estado, 'autorizada');
    igual(Object.keys(b.folios['COT-0013-B@K7QM'].sello).sort(), ['codigo', 'correo', 'ts']);
    const texto = JSON.stringify(b);
    for (const prohibido of ['98765', '88888', 'Secreto', 'subCalc', 'precioAuth', 'itemsAuth', 'renglones', 'huella', 'total']) igual([prohibido, texto.includes(prohibido)], [prohibido, false]);
  }));
  prueba('NO-16 recorta a 20 folios (los primeros) y omite los inválidos; sin lista o con una lista vacía: mapa vacío', () => conCopia(plantilla, async db => {
    const D = sesionDe(db, db.u.dir);
    const folios = Array.from({ length: 25 }, (_, i) => `COT-${String(i).padStart(4, '0')}-B@K7QM`);
    const r = await llamar(D, 'estado_solicitudes', { p_folios: folios });
    igual(Object.keys(r.folios).length, 20);
    igual(Object.keys(r.folios).sort(), folios.slice(0, 20).sort());
    igual(Object.keys((await llamar(D, 'estado_solicitudes', { p_folios: [] })).folios), []);
    igual((await llamar(D, 'estado_solicitudes', { p_folios: null })).ok, true);
  }));
  prueba('NO-17 Pagos pide reautorizar una ya AUTORIZADA: estado «pendiente» y SIN sello hasta que se resuelva (no devuelve el viejo); al autorizar con otra decisión, el nuevo', () => conCopia(plantilla, async db => {
    await armar(db);
    await sol_(db, 'pag', 'COT-0012-B@K7QM', { nota: 'otra vez' });
    const r = await llamar(sesionDe(db, db.u.pag), 'estado_solicitudes', { p_folios: ['COT-0012-B@K7QM'] });
    igual([r.folios['COT-0012-B@K7QM'].estado, r.folios['COT-0012-B@K7QM'].sello], ['pendiente', null]);
    await autorizar(db, 'COT-0012-B@K7QM', 14, { p_total_txt: '17000.00' });
    const s = await llamar(sesionDe(db, db.u.pag), 'estado_solicitudes', { p_folios: ['COT-0012-B@K7QM'] });
    igual([s.folios['COT-0012-B@K7QM'].estado, s.folios['COT-0012-B@K7QM'].sello.total, s.folios['COT-0012-B@K7QM'].sello.codigo], ['autorizada', 17000, sello(14).p_codigo]);
  }));
});

describir('NO-18 cotizacion_guardar', () => {
  const FGF = 'COT-0600-B@K7QM';
  prueba('NO-18 el autor guarda datos y hitos SIN cambiar estado, autorizacion_id ni revocada_en; el datos guardado no trae dataURL ni aiFile.url', () => conCopia(plantilla, async db => {
    await sol_(db, 'fab', FGF);
    await autorizar(db, FGF, 6);
    const antes = await una(db, `select estado, autorizacion_id, revocada_en from public.cotizaciones where folio_global = $1`, [FGF]);
    const r = await llamar(C(db, 'fab'), 'cotizacion_guardar', { p_op: { folio_global: FGF, datos: { proy: 'Nuevo', cliente: 'Cli', tel: '33 1', huellaAuth: 'h1', aiFile: { name: 'a', url: 'data:x' }, imgs: ['data:image/png;base64,AAAA', 'https://ejemplo.invalid/a.png'], folio: 'COT-0600-B', disp: 'K7QM' }, hitos: { pdf: 123 } } });
    igual(r.ok, true);
    const d = await una(db, `select estado, autorizacion_id, revocada_en, datos, hitos, proy, cliente, tel, huella_auth from public.cotizaciones where folio_global = $1`, [FGF]);
    igual([d.estado, d.autorizacion_id, d.revocada_en], [antes.estado, antes.autorizacion_id, antes.revocada_en]);
    igual([d.proy, d.cliente, d.tel, d.huella_auth, d.hitos.pdf, 'url' in d.datos.aiFile, d.datos.aiFile.name], ['Nuevo', 'Cli', '33 1', 'h1', 123, false, 'a']);
    igual(d.datos.imgs, ['https://ejemplo.invalid/a.png'], 'la data URL no entra a la base (las imágenes van a Storage)');
    igual(JSON.stringify(d.datos).includes('data:'), false);
  }));
  prueba('NO-18 otra persona (Pagos ajena) → ROL_SIN_PERMISO; Dirección sí (y los hitos se fusionan); folio inexistente → NO_ENCONTRADO', () => conCopia(plantilla, async db => {
    await sol_(db, 'fab', FGF);
    await llamar(C(db, 'fab'), 'cotizacion_guardar', { p_op: { folio_global: FGF, hitos: { pdf: 123 } } });
    const p = await llamar(sesionDe(db, db.u.pag), 'cotizacion_guardar', { p_op: { folio_global: FGF, datos: {} } });
    igual([p.ok, p.codigo, p.definitivo], [false, 'ROL_SIN_PERMISO', true]);
    igual((await llamar(C(db, 'dir'), 'cotizacion_guardar', { p_op: { folio_global: FGF, hitos: { wa: 1 } } })).ok, true);
    igual((await una(db, `select hitos from public.cotizaciones where folio_global = $1`, [FGF])).hitos, { pdf: 123, wa: 1 });
    igual((await llamar(sesionDe(db, db.u.dir), 'cotizacion_guardar', { p_op: { folio_global: 'COT-NADA-B@K7QM' } })).codigo, 'NO_ENCONTRADO');
  }));
  prueba('NO-18 datos con otro folio o aparato, que no es objeto o hitos que no son objeto → DATO_INVALIDO; folio sin @ → DATO_INVALIDO; op que no es objeto', () => conCopia(plantilla, async db => {
    await sol_(db, 'fab', FGF);
    const F = sesionDe(db, db.u.fab);
    for (const [que, op] of [['otro folio', { folio_global: FGF, datos: { folio: 'COT-9999-B' } }], ['otro aparato', { folio_global: FGF, datos: { disp: 'ZZZZ' } }],
                              ['datos arreglo', { folio_global: FGF, datos: [1] }], ['hitos texto', { folio_global: FGF, hitos: 'x' }], ['folio sin @', { folio_global: 'COT-0600-B' }]]) {
      const r = await llamar(F, 'cotizacion_guardar', { p_op: op });
      igual([que, r.codigo], [que, 'DATO_INVALIDO']);
    }
    igual((await llamar(F, 'cotizacion_guardar', { p_op: JSON.stringify('x') })).codigo, 'DATO_INVALIDO');
  }));
  prueba('NO-18 borrar:true pone deleted_at (la fila se queda) y la autorización firmada queda INTACTA; Fabricación escribe y no lee de vuelta', () => conCopia(plantilla, async db => {
    await sol_(db, 'fab', FGF);
    await autorizar(db, FGF, 6);
    igual((await llamar(C(db, 'fab'), 'cotizacion_guardar', { p_op: { folio_global: FGF, borrar: true } })).ok, true);
    igual((await una(db, `select deleted_at is not null as d from public.cotizaciones where folio_global = $1`, [FGF])).d, true);
    igual((await una(db, `select count(*)::int as n from public.autorizaciones where folio_global = $1 and estado = 'vigente'`, [FGF])).n, 1);
    igual((await sesionDe(db, db.u.fab).query(`select count(*)::int as n from public.cotizaciones`))[0].n, 0, 'Fabricación no lee ni la suya');
  }));
});

describir('NO-21 cuaderno_guardar', () => {
  const K = 'tel:3312345678';
  prueba('NO-21 cada persona guarda SU nota del mismo cliente (una fila por autor); reescribir actualiza la suya; Dirección lee todas y los demás solo las suyas', () => conCopia(plantilla, async db => {
    for (const quien of ['dir', 'pag', 'fab']) igual((await llamar(C(db, quien), 'cuaderno_guardar', { p_clave: K, p_nota: 'nota de ' + quien })).ok, true, quien);
    igual((await llamar(C(db, 'pag'), 'cuaderno_guardar', { p_clave: K, p_nota: 'nota nueva de pag' })).ok, true);
    igual((await sql(db, `select count(*)::int as n from public.cuaderno_notas`))[0].n, 3);
    const veo = async quien => (await sesionDe(db, db.u[quien]).query(`select nota from public.cuaderno_notas order by nota`)).map(r => r.nota);
    igual(await veo('dir'), ['nota de dir', 'nota de fab', 'nota nueva de pag']);
    igual(await veo('pag'), ['nota nueva de pag']);
    igual(await veo('fab'), ['nota de fab']);
    igual(await veo('pag2'), []);
    igual(await veo('otra'), []);
  }));
  prueba('NO-21 clave inválida (tel de 3 dígitos, sin prefijo, vacía, null) o nota de 1201 caracteres → DATO_INVALIDO; 1200 pasa; nom:<nombre> pasa', async () => {
    const db = await plantilla(), D = sesionDe(db, db.u.dir);
    for (const [clave, nota] of [['tel:123', 'x'], ['xx', 'x'], ['', 'x'], [null, 'x'], [K, 'x'.repeat(1201)], [K, null], ['nom:' + 'n'.repeat(201), 'x']]) {
      const r = await llamar(D, 'cuaderno_guardar', { p_clave: clave, p_nota: nota });
      igual([clave === null ? 'null' : clave.slice(0, 12), nota === null ? 'null' : nota.length, r.ok, r.codigo], [clave === null ? 'null' : clave.slice(0, 12), nota === null ? 'null' : nota.length, false, 'DATO_INVALIDO']);
    }
    igual((await llamar(D, 'cuaderno_guardar', { p_clave: K, p_nota: 'x'.repeat(1200) })).ok, true);
    igual((await llamar(D, 'cuaderno_guardar', { p_clave: 'nom:ana lópez', p_nota: '' })).ok, true);
  });
  prueba('NO-21 solo miembros activos: sin acceso (ext) / de baja / otra empresa no guardan; anon: permission denied', async () => {
    const db = await plantilla();
    igual((await llamar(sesionDe(db, db.u.ext), 'cuaderno_guardar', { p_clave: K, p_nota: 'x' })).codigo, 'SIN_ACCESO');
    igual((await llamar(sesionDe(db, db.u.baja), 'cuaderno_guardar', { p_clave: K, p_nota: 'x' })).codigo, 'ACCESO_REVOCADO');
    await esperarError(como(db, { rol: 'anon' }).rpc('cuaderno_guardar', { p_clave: K, p_nota: 'x' }), '42501');
  });
});

describir('NO-25 columnas generadas de cotizaciones', () => {
  prueba('NO-25 proy, cliente, tel y huella_auth reflejan `datos` (huella_auth NULL si el dato no existe; vacía si es autorización suelta) y no se pueden escribir', () => conCopia(plantilla, async db => {
    await sol_(db, 'dir', FG);
    igual(await una(db, `select proy, cliente, tel, huella_auth from public.cotizaciones where folio_global = $1`, [FG]), { proy: 'Tacos 1', cliente: 'Juan', tel: '', huella_auth: null });
    await llamar(C(db, 'dir'), 'cotizacion_guardar', { p_op: { folio_global: FG, datos: { proy: 'Otro negocio', cliente: 'Persona', tel: '33 5555', huellaAuth: '' } } });
    igual(await una(db, `select proy, cliente, tel, huella_auth from public.cotizaciones where folio_global = $1`, [FG]), { proy: 'Otro negocio', cliente: 'Persona', tel: '33 5555', huella_auth: '' });
    for (const col of ['proy', 'cliente', 'tel', 'huella_auth']) {
      await esperarError(sql(db, `update public.cotizaciones set ${col} = 'x' where folio_global = $1`, [FG]), '428C9', col);
    }
    await esperarError(sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, estado, datos, proy) values ('al3d', 'COT-1-B@X', 'COT-1-B', 'X', 'pendiente', '{}'::jsonb, 'x')`), '428C9');
  }));
  prueba('NO-25 el folio global debe ser folio@disp (check); el estado, uno de los cuatro', () => conCopia(plantilla, async db => {
    await esperarError(sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, estado, datos) values ('al3d', 'COT-1-B@X', 'COT-2-B', 'X', 'pendiente', '{}'::jsonb)`), '23514');
    await esperarError(sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, estado, datos) values ('al3d', 'COT-1-B@X', 'COT-1-B', 'X', 'rara', '{}'::jsonb)`), '23514');
    await esperarError(sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, estado, datos) values ('al3d', 'COT 1@X', 'COT 1', 'X', 'pendiente', '{}'::jsonb)`), '23514');
    await esperarError(sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, estado, datos) values ('al3d', 'COT-1-B@X', 'COT-1-B', 'X', 'pendiente', '[]'::jsonb)`), '23514');
  }));
});

describir('Visibilidad de cotizaciones, solicitudes, autorizaciones y cuadernos (R1 > Q-02)', () => {
  prueba('RL-06 / RL-07 / RL-08 Dirección ve todas; Pagos solo las suyas (cotizaciones y solicitudes) y NINGUNA autorización; Fabricación, ninguna ni la suya; otra empresa, ninguna', () => conCopia(plantilla, async db => {
    await sol_(db, 'dir', 'COT-0001-B@K7QM'); await sol_(db, 'pag', 'COT-0002-B@K7QM'); await sol_(db, 'fab', 'COT-0003-B@K7QM');
    await autorizar(db, 'COT-0002-B@K7QM', 2);
    const n = async (quien, t) => (await sesionDe(db, db.u[quien]).query(`select count(*)::int as n from public.${t}`))[0].n;
    for (const t of ['cotizaciones', 'solicitudes']) {
      igual([t, await n('dir', t), await n('pag', t), await n('pag2', t), await n('fab', t), await n('otra', t), await n('ext', t), await n('baja', t)], [t, 3, 1, 0, 0, 0, 0, 0]);
    }
    igual([await n('dir', 'autorizaciones'), await n('pag', 'autorizaciones'), await n('fab', 'autorizaciones'), await n('otra', 'autorizaciones'), await n('multi', 'autorizaciones')], [1, 0, 0, 0, 1], 'multi es Dirección en al3d');
    igual((await sesionDe(db, db.u.pag).query(`select folio_global from public.solicitudes`)).map(r => r.folio_global), ['COT-0002-B@K7QM'], 'Pagos ve su propia fila');
    igual([await n('multi', 'cotizaciones'), await n('multi', 'solicitudes')], [3, 3]);
  }));
  prueba('RL-12 / RL-13 ningún cliente escribe directo en cotizaciones, solicitudes, autorizaciones ni cuaderno_notas (insert, update, delete): permission denied; anon ni lee', () => conCopia(plantilla, async db => {
    await sol_(db, 'dir', FG);
    const D = sesionDe(db, db.u.dir), A = como(db, { rol: 'anon' });
    for (const t of ['cotizaciones', 'solicitudes', 'autorizaciones', 'cuaderno_notas']) {
      await esperarError(D.query(`insert into public.${t} default values`), '42501', `insert ${t}`);
      await esperarError(D.query(`update public.${t} set updated_at = now()`), '42501', `update ${t}`);
      await esperarError(D.query(`delete from public.${t}`), '42501', `delete ${t}`);
      await esperarError(A.query(`select * from public.${t}`), '42501', `anon ${t}`);
    }
  }));
  prueba('RL-14 service_role: select/insert/update sí; delete → permission denied (no tiene el privilegio); el dueño que borra → error del trigger sin_borrar', () => conCopia(plantilla, async db => {
    await sol_(db, 'dir', FG);
    await autorizar(db, FG, 3);
    await llamar(C(db, 'dir'), 'cuaderno_guardar', { p_clave: 'tel:3312345678', p_nota: 'x' });      // para que cuaderno_notas tenga una fila que el trigger pueda detener
    const S = como(db, { rol: 'service_role' });
    for (const t of ['cotizaciones', 'solicitudes', 'autorizaciones', 'cuaderno_notas']) {
      await S.query(`select count(*) from public.${t}`);
      await esperarError(S.query(`delete from public.${t}`), '42501', `service_role delete ${t}`);
      await esperarError(sql(db, `delete from public.${t}`), 'P0001', `dueño delete ${t}`);
    }
  }));
});

await resumen();
