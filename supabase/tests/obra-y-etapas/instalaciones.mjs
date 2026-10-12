// Instalaciones (las citas) — A.md §5.8 y §10.9, casos IN-01..IN-10 (la parte de RPC; la de CHECK, índice y trigger está en tablas.mjs) y SE-14.
//
//   · Dirección crea la cita `confirmada`; Fabricación la crea `propuesta`; Pagos no toca la agenda;
//   · agendar sobre un proyecto que ya tiene una cita viva REAGENDA la existente (y devuelve `id_canonico`): una viva por proyecto;
//   · `movida` sube al reagendar y al cancelar, y la base no la baja; el UID no cambia;
//   · el sello de la cita decide quién gana, el `anexo` (un renglón nuevo) no se pisa entre teléfonos.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, rpcT, sql } from '../comun/semilla.js';

const base = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  return db;
}, { limpiar: db => db.close() });

const AHORA = () => Date.now();
const cita = (extra = {}) => ({ p_op: { id: 'nueva', proyecto_id: 'p2', fecha: '2026-11-05', hora: '10:00', ventana: 'dia', duracion_min: 120, sello: AHORA(), ...extra } });
const como_ = async (quien, fn) => { const db = await base(); return sesionDe(db, db.u[quien]).transaccion(fn); };
const fila = (t, id) => t.query(`select id, proyecto_id, fecha::text as fecha, hora, ventana, duracion_min, estado, movida, uid_ics, notas from public.instalaciones where id = $1`, [id]).then(r => r[0]);

describir('IN-01 quién crea y en qué estado', () => {
  prueba('Dirección crea «confirmada»; Fabricación «propuesta»; Pagos: ROL_SIN_PERMISO (no toca la agenda)', async () => {
    for (const [quien, estado] of [['dir', 'confirmada'], ['fab', 'propuesta']]) {
      const x = await como_(quien, async t => ({ r: await rpcT(t, 'instalacion_guardar', cita()), e: await fila(t, 'nueva') }));
      igual([x.r.ok, x.e.estado, x.e.movida, x.e.uid_ics, x.r.id_canonico], [true, estado, 0, 'inst-nueva@al3d.mx', 'nueva'], quien);
      igual([x.e.fecha, x.e.hora, x.e.ventana, x.e.duracion_min, x.e.proyecto_id], ['2026-11-05', '10:00', 'dia', 120, 'p2']);
    }
    const p = await como_('pag', t => rpcT(t, 'instalacion_guardar', cita()));
    igual([p.ok, p.codigo, p.definitivo], [false, 'ROL_SIN_PERMISO', true]);
  });
  prueba('el cliente NO elige el estado inicial: una cita nueva con estado «hecha» o «cancelada» nace confirmada/propuesta', async () => {
    const x = await como_('dir', async t => { await rpcT(t, 'instalacion_guardar', cita({ estado: 'hecha' })); return fila(t, 'nueva'); });
    igual(x.estado, 'confirmada');
  });
  prueba('el proyecto no existe → NO_ENCONTRADO; una fila histórica no tiene instalaciones → DATO_INVALIDO', async () => {
    igual((await como_('dir', t => rpcT(t, 'instalacion_guardar', cita({ proyecto_id: 'no-existe' })))).codigo, 'NO_ENCONTRADO');
    igual((await como_('dir', t => rpcT(t, 'instalacion_guardar', cita({ proyecto_id: 'p6' })))).codigo, 'DATO_INVALIDO');
  });
});

describir('IN-02 una cita viva por proyecto: agendar sobre una viva REAGENDA la existente', () => {
  prueba('una segunda instalación con id nuevo sobre un proyecto con una viva reagenda la existente y devuelve id_canonico', async () => {
    const x = await como_('dir', async t => {
      const r = await rpcT(t, 'instalacion_guardar', cita({ id: 'otra-id', proyecto_id: 'p1', fecha: '2026-12-01', hora: '08:00' }));
      return { r, i1: await fila(t, 'i1'), otra: await fila(t, 'otra-id'), n: (await t.query(`select count(*)::int as n from public.instalaciones where proyecto_id = 'p1' and estado <> 'cancelada'`))[0].n };
    });
    igual([x.r.ok, x.r.id_canonico, x.i1.fecha, x.i1.hora, x.i1.estado, x.i1.movida, x.otra, x.n], [true, 'i1', '2026-12-01', '08:00', 'reagendada', 1, undefined, 1]);
  });
});

describir('IN-04 y IN-05 reagendar, cancelar, marcar hecha: movida sube y no baja', () => {
  prueba('reagendar +1; marcar hecha (sin mover la cita) +0; cancelar +1; el estado de una confirmada que se mueve es «reagendada» y el de una «hecha» se queda «hecha»', async () => {
    const x = await como_('dir', async t => {
      const mueve = await rpcT(t, 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-02', hora: '09:30', sello: AHORA() } });
      const e1 = await fila(t, 'i1');
      const hecha = await rpcT(t, 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-02', hora: '09:30', estado: 'hecha', sello: AHORA() } });
      const e2 = await fila(t, 'i1');
      const muevehecha = await rpcT(t, 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-03', hora: '09:30', sello: AHORA() + 1 } });
      const e3 = await fila(t, 'i1');
      const cancela = await rpcT(t, 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-03', hora: '09:30', estado: 'cancelada', sello: AHORA() + 2 } });
      return { mueve, e1, hecha, e2, muevehecha, e3, cancela, e4: await fila(t, 'i1') };
    });
    igual([x.e1.estado, x.e1.movida], ['reagendada', 1], 'confirmada que se mueve');
    igual([x.e2.estado, x.e2.movida], ['hecha', 1], 'marcar hecha no sube movida');
    igual([x.e3.estado, x.e3.movida, x.e3.fecha], ['hecha', 2, '2026-12-03'], 'una hecha que se mueve se queda hecha');
    igual([x.e4.estado, x.e4.movida], ['cancelada', 3], 'cancelar SUBE movida');
    igual([x.cancela.ok, x.cancela.instalacion.movida], [true, 3]);
  });
  prueba('la base no baja movida aunque se intente (trigger) y el uid_ics no cambia nunca', async () => {
    const x = await como_('dir', async t => {
      await rpcT(t, 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-02', hora: '09:30', sello: AHORA() } });
      return fila(t, 'i1');
    });
    igual([x.uid_ics, x.movida], ['inst-i1@al3d.mx', 1]);
  });
  prueba('cambiar solo la duración o la ventana (sin mover la cita) sube movida pero no pasa por la compuerta ni cambia el estado', async () => {
    const x = await como_('dir', async t => {
      const f = (await fila(t, 'i1')).fecha;
      const r = await rpcT(t, 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: f, hora: '09:30', ventana: 'noche', duracion_min: 240, sello: 1 } });
      return { r, e: await fila(t, 'i1') };
    });
    igual([x.r.ok, x.e.ventana, x.e.duracion_min, x.e.movida, x.e.estado], [true, 'noche', 240, 1, 'confirmada']);
  });
});

describir('IN-06 y SE-14 el sello de la cita (grupo «instalacion», vive en proyectos.sellos)', () => {
  prueba('Fabricación mueve la cita con un sello MENOR al guardado → «viejos»; IGUAL → escribe; MAYOR → escribe; sin sello → DATO_INVALIDO', async () => {
    const db = await base();
    await sql(db, `update public.proyectos set sellos = sellos || '{"instalacion": 500}' where id = 'p1'`);
    const F = sesionDe(db, db.u.fab);
    const mover = async sello => (await F.rpc('instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-09', hora: '09:30', ...(sello === undefined ? {} : { sello }) } }))[0].instalacion_guardar;
    const menor = await mover(100);
    igual([menor.ok, menor.viejos.map(v => v.nombre), menor.instalacion.fecha], [true, ['instalacion'], menor.instalacion.fecha]);
    cierto(menor.instalacion.fecha !== '2026-12-09', 'la cita NO se movió');
    igual((await mover(500)).ok, true, 'igual al guardado: escribe');
    const mayor = await F.transaccion(async t => {
      const r = await rpcT(t, 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-09', hora: '09:30', sello: 900 } });
      return { r, s: (await t.query(`select sellos->>'instalacion' as s from public.proyectos where id = 'p1'`))[0].s };
    });
    igual([mayor.r.ok, mayor.s], [true, '900']);
    const sin = await mover(undefined);
    igual([sin.ok, sin.codigo, sin.definitivo], [false, 'DATO_INVALIDO', true]);
    igual((await mover(null)).codigo, 'DATO_INVALIDO');
  });
  prueba('el sello también es obligatorio AL CREAR la cita (Q-A05) y sembra proyectos.sellos.instalacion (acotado a ahora + 10 min)', async () => {
    const sin = await como_('dir', t => rpcT(t, 'instalacion_guardar', { p_op: { id: 'nueva', proyecto_id: 'p2', fecha: '2026-11-05' } }));
    igual(sin.codigo, 'DATO_INVALIDO');
    const ahora = AHORA();
    const x = await como_('dir', async t => {
      await rpcT(t, 'instalacion_guardar', cita({ sello: ahora + 7_200_000 }));
      return Number((await t.query(`select sellos->>'instalacion' as s from public.proyectos where id = 'p2'`))[0].s);
    });
    cierto(Math.abs(x - (ahora + 600_000)) < 30_000, 'se acotó a ahora + 10 min: ' + (x - ahora));
  });
  prueba('solo cambiar el estado (confirmar, marcar) no pasa por la compuerta: un sello viejo no lo frena, pero cambiar la cita sí', async () => {
    const db = await base();
    await sql(db, `update public.proyectos set sellos = sellos || '{"instalacion": 500}' where id = 'p1'`);
    const D = sesionDe(db, db.u.dir);
    const solo = (await D.rpc('instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: (await sql(db, `select fecha::text f from public.instalaciones where id = 'i1'`))[0].f, hora: '09:30', estado: 'confirmada', sello: 1 } }))[0].instalacion_guardar;
    igual(solo.ok, true);
    igual(solo.viejos, []);
  });
});

describir('IN-07 los anexos de dos teléfonos no se pisan', () => {
  prueba('dos «anexo» (renglones nuevos) de dos teléfonos quedan AMBOS en notas, en orden de llegada', async () => {
    const x = await como_('dir', async t => {
      await rpcT(t, 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-02', hora: '09:30', sello: AHORA(), anexo: 'Movida del 15 al 2: el cliente no estaba' } });
      await rpcT(t, 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p1', fecha: '2026-12-03', hora: '09:30', sello: AHORA() + 5, anexo: 'Movida del 2 al 3: lluvia' } });
      return fila(t, 'i1');
    });
    igual(x.notas, 'Movida del 15 al 2: el cliente no estaba\nMovida del 2 al 3: lluvia');
  });
  prueba('las notas del alta solo se escriben al CREAR; después solo se agregan anexos', async () => {
    const x = await como_('dir', async t => {
      await rpcT(t, 'instalacion_guardar', cita({ notas: 'nota inicial' }));
      await rpcT(t, 'instalacion_guardar', cita({ notas: 'esto se ignora', fecha: '2026-11-06', sello: AHORA() + 1, anexo: 'se movió' }));
      return fila(t, 'nueva');
    });
    igual(x.notas, 'nota inicial\nse movió');
  });
});

describir('IN-08, IN-09 e IN-10 lo que la base no admite', () => {
  prueba('IN-08 agendar un proyecto CANCELADO → DATO_INVALIDO; cancelar la cita de un proyecto cancelado → ok', async () => {
    const db = await base();
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, fuente, nombre, etapa) values ('canc', 'al3d', 'V-777', 'hoja', 'Cancelado', 'cancelado');
                   insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, estado, uid_ics) values ('ic', 'al3d', 'canc', '2026-11-20', 'confirmada', 'inst-ic@al3d.mx')`);
    const D = sesionDe(db, db.u.dir);
    const nuevo = (await D.rpc('instalacion_guardar', { p_op: { id: 'x', proyecto_id: 'canc', fecha: '2026-11-21', sello: AHORA() } }))[0].instalacion_guardar;
    igual([nuevo.ok, nuevo.codigo], [false, 'DATO_INVALIDO']);
    const mueve = (await D.rpc('instalacion_guardar', { p_op: { id: 'ic', proyecto_id: 'canc', fecha: '2026-11-22', sello: AHORA() } }))[0].instalacion_guardar;
    igual(mueve.codigo, 'DATO_INVALIDO', 'tampoco se mueve');
    const cancela = (await D.rpc('instalacion_guardar', { p_op: { id: 'ic', proyecto_id: 'canc', fecha: '2026-11-20', estado: 'cancelada', sello: AHORA() } }))[0].instalacion_guardar;
    igual([cancela.ok, cancela.instalacion.estado], [true, 'cancelada']);
  });
  prueba('IN-09 la hora «25:00» o mal formada → DATO_INVALIDO; sin hora (todo el día) → ok; «9:30» se normaliza a «09:30»', async () => {
    for (const mala of ['25:00', 'abc', '09:60', '930']) igual((await como_('dir', t => rpcT(t, 'instalacion_guardar', cita({ hora: mala })))).codigo, 'DATO_INVALIDO', mala);
    const sin = await como_('dir', async t => { const r = await rpcT(t, 'instalacion_guardar', cita({ hora: null })); return { r, e: await fila(t, 'nueva') }; });
    igual([sin.r.ok, sin.e.hora], [true, null]);
    const corta = await como_('dir', async t => { await rpcT(t, 'instalacion_guardar', cita({ hora: '9:30' })); return fila(t, 'nueva'); });
    igual(corta.hora, '09:30');
  });
  prueba('IN-10 duración 0 o 601 → DATO_INVALIDO; ventana «manana» o «tarde» → «dia»; una ventana inventada → DATO_INVALIDO', async () => {
    for (const d of [0, 601, -5, 'abc', 1.5]) igual((await como_('dir', t => rpcT(t, 'instalacion_guardar', cita({ duracion_min: d })))).codigo, 'DATO_INVALIDO', String(d));
    for (const v of ['manana', 'tarde']) igual((await como_('dir', async t => { await rpcT(t, 'instalacion_guardar', cita({ ventana: v })); return fila(t, 'nueva'); })).ventana, 'dia', v);
    igual((await como_('dir', t => rpcT(t, 'instalacion_guardar', cita({ ventana: 'siesta' })))).codigo, 'DATO_INVALIDO');
    igual((await como_('dir', async t => { await rpcT(t, 'instalacion_guardar', cita({ duracion_min: undefined })); return fila(t, 'nueva'); })).duracion_min, 180, 'sin duración: 180');
  });
  prueba('fecha inválida («2026-02-31», «10/10/26») o un estado inventado → DATO_INVALIDO; un id con caracteres raros → DATO_INVALIDO', async () => {
    for (const fecha of ['2026-02-31', '10/10/26', null, 20261010]) igual((await como_('dir', t => rpcT(t, 'instalacion_guardar', cita({ fecha })))).codigo, 'DATO_INVALIDO', String(fecha));
    igual((await como_('dir', t => rpcT(t, 'instalacion_guardar', cita({ estado: 'agendada' })))).codigo, 'DATO_INVALIDO');
    igual((await como_('dir', t => rpcT(t, 'instalacion_guardar', cita({ id: 'con espacio' })))).codigo, 'DATO_INVALIDO');
  });
  prueba('una cita con el id de OTRO proyecto → DATO_INVALIDO (el id es global)', async () => {
    igual((await como_('dir', t => rpcT(t, 'instalacion_guardar', { p_op: { id: 'i1', proyecto_id: 'p2', fecha: '2026-12-01', sello: AHORA() } }))).codigo, 'DATO_INVALIDO');
  });
});

describir('lo que lee cada rol y lo que devuelve la RPC', () => {
  prueba('la respuesta es solo de instalaciones: ninguna clave de dinero; el estado de la cita llega en la fila', async () => {
    const r = await como_('fab', t => rpcT(t, 'instalacion_guardar', cita()));
    for (const k of ['subtotal', 'anticipo', 'liquidacion', 'cuenta', 'neto', 'saldo']) cierto(!(k in r.instalacion), k);
    igual(r.instalacion.estado, 'propuesta');
  });
});

await resumen();
