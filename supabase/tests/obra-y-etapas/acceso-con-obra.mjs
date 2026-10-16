// Los casos de acceso (A.md §10.1) tal como los escribe el diseño, con `proyectos` y `mover_etapa`: AC-01, AC-08, AC-09, AC-10 y AC-15.
// (El resto de AC-01..AC-18 está en acceso/acceso.mjs; allí se prueban con las tablas de la fundación y las RPC `miembro_*`, que tienen
// el mismo preámbulo. Aquí se cierra el círculo con la RPC de obra y con la tabla de obra de verdad.)
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, llamar, contar, conCopia, sql } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  return db;
}, { limpiar: db => db.close() });

const mover = (s, extra = {}) => llamar(s, 'mover_etapa', { p_proyecto: 'p4', p_etapa: 'armado', p_sello: Date.now(), ...extra });
/* Desde 0017 (Q-05) Fabricación y Pagos mueven la etapa las dos: lo que las distingue en la obra es la agenda (Pagos no la toca). */
const agendar = s => llamar(s, 'instalacion_guardar', { p_op: { id: 'ac10', proyecto_id: 'p4', fecha: '2026-12-01', hora: '09:30', sello: Date.now() } });

describir('AC-01 sin fila en miembros (u_ext)', () => {
  prueba('mi_acceso y reclamar_acceso dicen sin_acceso; leer proyectos da 0 filas; mover_etapa da SIN_ACCESO (no definitivo); nunca acceso_revocado', async () => {
    const db = await plantilla(), X = sesionDe(db, db.u.ext);
    igual((await llamar(X, 'mi_acceso')).estado, 'sin_acceso');
    igual((await llamar(X, 'reclamar_acceso')).estado, 'sin_acceso');
    igual(await contar(X, 'proyectos'), 0);
    const m = await mover(X);
    igual([m.ok, m.codigo, m.definitivo], [false, 'SIN_ACCESO', false]);
  });
});

describir('AC-08 y AC-09 la baja de Fabricación: efecto inmediato con el mismo JWT', () => {
  prueba('antes de la baja Fabricación lee 6 proyectos y puede mover; Dirección la da de baja; con la MISMA sesión lee 0 filas y mover_etapa da ACCESO_REVOCADO (no definitivo); sí ve su fila baja', async () => {
    await conCopia(plantilla, async db => {
      const F = sesionDe(db, db.u.fab);
      igual(await contar(F, 'proyectos'), 6, 'antes');
      igual((await mover(F)).ok, true, 'antes puede mover');
      await llamar(sesionDe(db, db.u.dir), 'miembro_baja', { p_correo: 'fab@al3d.test' }, { confirmar: true });
      igual(await contar(F, 'proyectos'), 0, 'después, sin reautenticar');
      const m = await mover(F);
      igual([m.ok, m.codigo, m.definitivo], [false, 'ACCESO_REVOCADO', false]);
      igual((await llamar(F, 'mi_acceso')).estado, 'acceso_revocado');
      igual((await F.query(`select estado from public.miembros`)).map(r => r.estado), ['baja']);
      const bit = await sql(db, `select nivel, usuario_id from public.bitacora where accion = 'baja'`);
      igual(bit.map(b => [b.nivel, b.usuario_id]), [['direccion', db.u.dir.uid]]);
    });
  });
});

describir('AC-10 cambiar el área surte efecto en la SIGUIENTE petición', () => {
  prueba('Fabricación → Pagos: antes ventas_dinero 0 filas y agenda; después lee ventas_dinero, ya no agenda (ROL_SIN_PERMISO) y sigue moviendo la etapa (0017)', async () => {
    await conCopia(plantilla, async db => {
      const F = sesionDe(db, db.u.fab);
      igual(await contar(F, 'ventas_dinero'), 0);
      igual((await agendar(F)).ok, true);
      igual((await llamar(sesionDe(db, db.u.dir), 'miembro_cambiar_area', { p_correo: 'fab@al3d.test', p_area: 'pagos' }, { confirmar: true })).ok, true);
      cierto(await contar(F, 'ventas_dinero') > 0, 'ahora lee dinero');
      igual((await agendar(F)).codigo, 'ROL_SIN_PERMISO');
      igual((await mover(F)).ok, true, 'Pagos también mueve la etapa');
      const b = (await sql(db, `select antes, despues from public.bitacora where accion = 'cambio_area' and entidad_id = 'fab@al3d.test'`))[0];
      igual([b.antes.area, b.despues.area], ['fabricacion', 'pagos']);
    });
  });
  prueba('lo contrario: Pagos → Fabricación pierde el dinero y gana la agenda', async () => {
    await conCopia(plantilla, async db => {
      const P = sesionDe(db, db.u.pag);
      cierto(await contar(P, 'ventas_dinero') > 0);
      igual((await agendar(P)).codigo, 'ROL_SIN_PERMISO');
      await llamar(sesionDe(db, db.u.dir), 'miembro_cambiar_area', { p_correo: 'pag@al3d.test', p_area: 'fabricacion' }, { confirmar: true });
      igual(await contar(P, 'ventas_dinero'), 0);
      igual((await agendar(P)).ok, true);
    });
  });
});

describir('AC-15 varias empresas: la baja cuenta solo en la empresa pedida', () => {
  prueba('u_multi con baja en «otra» y activo en al3d: mover_etapa con p_empresa = otra → ACCESO_REVOCADO; con una empresa que nunca tuvo (jamas) → SIN_ACCESO; con al3d funciona', async () => {
    await conCopia(plantilla, async db => {
      await sql(db, `update public.miembros set estado = 'baja', baja_en = now() where correo = 'multi@al3d.test' and empresa_id = 'otra'`);
      const M = sesionDe(db, db.u.multi);
      igual((await llamar(M, 'mi_acceso')).estado, 'activo');
      const revocado = await mover(M, { p_empresa: 'otra' });
      igual([revocado.codigo, revocado.definitivo], ['ACCESO_REVOCADO', false]);
      igual((await mover(M, { p_empresa: 'jamas' })).codigo, 'SIN_ACCESO');
      igual((await mover(M, { p_empresa: 'al3d' })).ok, true);
      igual((await mover(M)).ok, true, 'sin p_empresa y con UNA sola activa, la resuelve sola');
    });
  });
});

await resumen();
