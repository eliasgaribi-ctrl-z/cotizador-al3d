// Un folio solo lo aparta el teléfono de quien lo emite — 0013_folios_del_dueno.sql (revisión de seguridad del 2026-10-16), casos FD-01 a FD-06.
//
// El hueco que se cierra: `solicitar` y `subida_unica` creaban la cotización con CUALQUIER folio que nadie hubiera usado, así que un miembro podía apartar
// el folio que otro teléfono iba a emitir (`COT-0043-B@K7QM`) y el dueño recibía «Ese folio es de otra persona». Además la subida dejaba la fila `autorizada`
// sin sello firmado y dejaba subir el contador de folios de un teléfono ajeno. Reglas que se prueban:
//   · el primer miembro que usa un aparato lo registra a su nombre (por empresa); un folio NUEVO de ese aparato solo lo crea su dueño;
//   · el contador, la cola y la bitácora de un aparato solo los sube su dueño: el lote con el aparato de otro se rechaza ENTERO y no deja nada;
//   · Dirección no queda bloqueada, pero no le quita el aparato a nadie;
//   · una entrada del historial nace `autorizada` solo si hay un sello `vigente` (y queda ligada a él); si no, `retirada`;
//   · al aplicar la migración, los aparatos con cotizaciones de una sola persona quedan a su nombre.
import { readFile } from 'node:fs/promises';
import { describir, prueba, dato, igual, resumen } from '../arnes/marco.mjs';
import { sesionDe, llamar, una, sql, conCopia } from '../comun/semilla.js';
import { crearBaseNotario, sol, insertarAutorizacion } from '../comun/notario.js';
import { exigirAuditoriaLimpia } from '../arnes/arnes.mjs';

const plantilla = dato(crearBaseNotario, { limpiar: db => db.close() });
const C = (db, quien, o) => sesionDe(db, db.u[quien], { confirmar: true, ...o });
const pedir = (db, quien, fg, extra = {}) => llamar(C(db, quien), 'solicitar', { p_op: sol(fg), ...extra });
const subir = (db, quien, lote) => llamar(C(db, quien), 'subida_unica', { p_lote: lote });
const entrada = (n, extra = {}) => ({ folio: 'COT-' + String(n).padStart(4, '0') + '-B', disp: 'K7QM', proy: 'Tacos ' + n, cliente: 'Juan', items: [{ id: 1, tipo: 'Letras' }], ...extra });
const cuantas = async (db, fg) => (await una(db, `select count(*)::int as n from public.cotizaciones where folio_global = $1`, [fg])).n;
const duenoDe = async (db, disp, empresa = 'al3d') => (await sql(db, `select texto from public.contadores where empresa_id = $1 and clave = $2`, [empresa, 'aparato:' + disp]))[0]?.texto ?? null;

describir('FD-01 y FD-02 nadie aparta el folio de otro teléfono', () => {
  prueba('FD-01 solicitar: Pagos registra K7QM con su primer folio; Fabricación ya no puede apartar COT-0043-B@K7QM (ROL_SIN_PERMISO, sin fila) y Pagos lo pide sin estorbo', () => conCopia(plantilla, async db => {
    igual((await pedir(db, 'pag', 'COT-0042-B@K7QM')).ok, true);
    igual(await duenoDe(db, 'K7QM'), db.u.pag.uid, 'el aparato quedó a nombre de Pagos');
    for (const quien of ['fab', 'pag2']) {
      const r = await pedir(db, quien, 'COT-0043-B@K7QM');
      igual([quien, r.ok, r.codigo, r.definitivo], [quien, false, 'ROL_SIN_PERMISO', true]);
    }
    igual(await cuantas(db, 'COT-0043-B@K7QM'), 0, 'el intento no deja fila');
    const r = await pedir(db, 'pag', 'COT-0043-B@K7QM');
    igual([r.ok, r.estado], [true, 'pendiente'], 'el dueño real emite su folio');
    igual((await una(db, `select creado_por::text as por from public.cotizaciones where folio_global = 'COT-0043-B@K7QM'`)).por, db.u.pag.uid);
  }));
  prueba('FD-01 Dirección no queda bloqueada en un aparato ajeno, pero no se lo quita a su dueño; Fabricación usa su propio aparato sin problema', () => conCopia(plantilla, async db => {
    await pedir(db, 'pag', 'COT-0042-B@K7QM');
    igual((await pedir(db, 'dir', 'COT-0044-B@K7QM')).ok, true);
    igual(await duenoDe(db, 'K7QM'), db.u.pag.uid, 'K7QM sigue siendo de Pagos');
    igual((await pedir(db, 'fab', 'COT-0001-B@FAB1')).ok, true);
    igual(await duenoDe(db, 'FAB1'), db.u.fab.uid);
  }));
  prueba('FD-01 el dueño es POR EMPRESA: el mismo aparato en otra empresa es de quien lo use allá', () => conCopia(plantilla, async db => {
    await pedir(db, 'pag', 'COT-0042-B@K7QM');
    igual((await pedir(db, 'multi', 'COT-0043-B@K7QM', { p_empresa: 'otra' })).ok, true);
    igual([await duenoDe(db, 'K7QM'), await duenoDe(db, 'K7QM', 'otra')], [db.u.pag.uid, db.u.multi.uid]);
  }));
  prueba('FD-02 subida_unica: una entrada con el aparato de otra persona se rechaza (ROL_SIN_PERMISO) sin crear la fila; el dueño la sube después', () => conCopia(plantilla, async db => {
    igual((await subir(db, 'pag', { disp: 'K7QM', folio_max: 42 })).ok, true);
    const f = await subir(db, 'fab', { disp: 'FAB1', cotizaciones: [entrada(43), entrada(1, { disp: 'FAB1' })] });
    igual([f.ok, f.acuse.map(x => [x.id, x.estado, x.motivo ?? null])], [true, [['COT-0043-B@K7QM', 'rechazada', 'ROL_SIN_PERMISO'], ['COT-0001-B@FAB1', 'creada', null]]]);
    igual(await cuantas(db, 'COT-0043-B@K7QM'), 0);
    const p = await subir(db, 'pag', { disp: 'K7QM', cotizaciones: [entrada(43)] });
    igual(p.acuse.map(x => x.estado), ['creada']);
  }));
  prueba('FD-02 las entradas viejas sin aparato (HIST + md5) no registran dueño ni se bloquean por él', () => conCopia(plantilla, async db => {
    const e = entrada(7, { fecha: '2026-01-01' }); delete e.disp;
    igual((await subir(db, 'fab', { cotizaciones: [e] })).acuse.map(x => x.estado), ['creada']);
    igual((await una(db, `select count(*)::int as n from public.contadores where clave like 'aparato:HIST%'`)).n, 0);
  }));
});

describir('FD-03 el contador y la bitácora de un teléfono solo los sube su dueño', () => {
  prueba('FD-03 Fabricación con el aparato de Pagos: el lote ENTERO se rechaza; el contador no sube, la cola no crea nada y los op_id de la bitácora quedan libres', () => conCopia(plantilla, async db => {
    await subir(db, 'pag', { disp: 'K7QM', folio_max: 42 });
    const r = await subir(db, 'fab', { disp: 'K7QM', folio_max: 999,
      cola: [{ folio: 'COT-0500-B', estado: 'pendiente', q: { proyecto: 'x', iva: true, subtotal: 5, items: [{ id: 1 }] } }],
      bitacora: [{ id: 'b1', accion: 'cobro', titulo: 'Cobro de $999,999' }], cuadernos: { 'tel:3312345678': 'x' } });
    igual([r.ok, r.codigo, r.definitivo], [false, 'ROL_SIN_PERMISO', true]);
    igual((await una(db, `select n::int as n from public.contadores where empresa_id = '*' and clave = 'folio_cot:K7QM'`)).n, 42, 'el contador no se movió');
    igual([await cuantas(db, 'COT-0500-B@K7QM'), (await una(db, `select count(*)::int as n from public.bitacora where op_id like 'tel:K7QM:%'`)).n,
           (await una(db, `select count(*)::int as n from public.cuaderno_notas`)).n], [0, 0, 0], 'nada del lote quedó escrito');
    const p = await subir(db, 'pag', { disp: 'K7QM', folio_max: 50, bitacora: [{ id: 'b1', accion: 'etapa', titulo: 'El evento real' }] });
    igual([p.ok, p.acuse.map(x => x.estado)], [true, ['creada']], 'el op_id tel:K7QM:b1 sigue libre para su dueño');
    igual((await una(db, `select n::int as n from public.contadores where empresa_id = '*' and clave = 'folio_cot:K7QM'`)).n, 50);
  }));
  prueba('FD-03 un aparato sin dueño lo registra el primero que sube; Dirección sube el contador de cualquiera sin quitarle el aparato', () => conCopia(plantilla, async db => {
    await subir(db, 'fab', { disp: 'FAB1', folio_max: 3 });
    igual(await duenoDe(db, 'FAB1'), db.u.fab.uid);
    igual((await subir(db, 'pag', { disp: 'FAB1', folio_max: 9 })).codigo, 'ROL_SIN_PERMISO');
    igual((await subir(db, 'dir', { disp: 'FAB1', folio_max: 9 })).ok, true);
    igual([(await una(db, `select n::int as n from public.contadores where empresa_id = '*' and clave = 'folio_cot:FAB1'`)).n, await duenoDe(db, 'FAB1')], [9, db.u.fab.uid]);
  }));
});

describir('FD-04 «autorizada» solo con sello firmado', () => {
  prueba('FD-04 sin sello: «retirada» y sin autorizacion_id; con sello vigente: «autorizada» y ligada a él; con uno solo revocado: «retirada»', () => conCopia(plantilla, async db => {
    const vig = await insertarAutorizacion(db, { folio_global: 'COT-0002-B@K7QM' });
    await insertarAutorizacion(db, { folio_global: 'COT-0003-B@K7QM', estado: 'revocada' });
    const r = await subir(db, 'pag', { disp: 'K7QM', cotizaciones: [entrada(1, { sello: { folio: 'COT-0001-B@K7QM', codigo: 'FALS-OFAL-SO00' } }), entrada(2), entrada(3)] });
    igual(r.acuse.map(x => x.estado), ['creada', 'creada', 'creada']);
    const f = await sql(db, `select folio, estado, autorizacion_id from public.cotizaciones where disp = 'K7QM' order by folio`);
    igual(f.map(x => [x.folio, x.estado, x.autorizacion_id]), [['COT-0001-B', 'retirada', null], ['COT-0002-B', 'autorizada', vig], ['COT-0003-B', 'retirada', null]],
          'el sello local del teléfono no basta: hace falta el firmado');
    igual((await una(db, `select procedencia -> 'sello_local' ->> 'codigo' as c from public.cotizaciones where folio = 'COT-0001-B'`)).c, 'FALS-OFAL-SO00', 'el sello local se guarda como procedencia');
  }));
});

describir('FD-05 y FD-06 lo que ya había y la aduana', () => {
  prueba('FD-05 al aplicar 0013, el aparato con cotizaciones de UNA persona queda a su nombre; el de varias queda sin dueño; uno ya registrado no se pisa', () => conCopia(plantilla, async db => {
    await sql(db, `insert into public.cotizaciones (empresa_id, folio_global, folio, disp, creado_por, estado, datos) values
                     ('al3d', 'COT-0001-B@OLD1', 'COT-0001-B', 'OLD1', $1, 'pendiente', '{}'), ('al3d', 'COT-0002-B@OLD1', 'COT-0002-B', 'OLD1', $1, 'pendiente', '{}'),
                     ('al3d', 'COT-0001-B@MIX1', 'COT-0001-B', 'MIX1', $1, 'pendiente', '{}'), ('al3d', 'COT-0002-B@MIX1', 'COT-0002-B', 'MIX1', $2, 'pendiente', '{}'),
                     ('al3d', 'COT-0001-B@REG1', 'COT-0001-B', 'REG1', $1, 'pendiente', '{}')`, [db.u.pag.uid, db.u.fab.uid]);
    await sql(db, `insert into public.contadores (empresa_id, clave, ventana, n, texto) values ('al3d', 'aparato:REG1', '', 0, $1)`, [db.u.fab.uid]);
    await sql(db, await readFile(new URL('../../migrations/0013_folios_del_dueno.sql', import.meta.url), 'utf8'));
    igual([await duenoDe(db, 'OLD1'), await duenoDe(db, 'MIX1'), await duenoDe(db, 'REG1')], [db.u.pag.uid, null, db.u.fab.uid]);
    igual((await pedir(db, 'fab', 'COT-0003-B@OLD1')).codigo, 'ROL_SIN_PERMISO', 'el folio siguiente de OLD1 ya no se puede apartar');
  }));
  prueba('FD-06 la auditoría de seguridad sigue limpia (la función nueva no la ejecuta ningún rol)', async () => {
    await exigirAuditoriaLimpia(await plantilla());
  });
});

await resumen();
