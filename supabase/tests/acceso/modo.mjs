// QUIÉN MANDA, la hoja o la base (0024, pedido por Elías el 2026-10-25). Datos de mentiras.
//
//   MO-01  la empresa nace en 'hoja'; mi_acceso dice el modo (de cada empresa y el de la elegida) a cualquier miembro
//   MO-02  modo_cambiar: solo Dirección; un modo que no existe no entra; lo repetido no cambia nada; queda en la bitácora
//   MO-03  nadie lo cambia directo en la tabla (ni la app ni anon)
//   MO-04  en modo 'base' la copia de la hoja (importar-diario) ya no aplica nada: solo cuadra; de vuelta en 'hoja', aplica
// Y lo de 0026 (decidido por Elías el 2026-10-25): la venta sin cotización (`alta_venta`) solo con la base mandando.
//   MO-05  con la hoja mandando, la base se niega: DATO_INVALIDO definitivo para Dirección y Pagos, sin escribir nada ni gastar un V-###;
//          el área va antes (Fabricación: ROL_SIN_PERMISO) y la validación también (un dato malo dice cuál)
//   MO-06  con la base mandando entra con el V-### de la base; de vuelta en la hoja, el reintento de esa misma alta dice «ya existía» (la
//          verdad) y una nueva se niega
//   MO-07  la copia de cada 3 horas sigue dando de alta las ventas de la hoja con la hoja mandando: no usa alta_venta (escribe directo)
// Y lo de 0030 (auditoría 2026-10-26, T1-5, decidido por Elías): volver a la hoja, con candado.
//   MO-08  con algo hecho en la base mientras manda (un cobro, una venta nueva, una etapa, una cita, un abono, un gasto), `modo_cambiar('hoja')`
//          se niega y dice cuántos, de qué tipo y sus folios, sin cambiar nada; sin nada pendiente (o con cambios de ANTES del paso a la base),
//          cambia como siempre; si la base no sabe desde cuándo manda, se niega con esa razón; el regreso del dueño (Editor SQL) sigue abierto
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, como, sql, una, llamar, conCopia } from '../comun/semilla.js';
import { volcado, dia } from '../comun/hoja-de-mentiras.js';
import { cincuentaFilas } from '../comun/escenarios-importador.js';
import { planear } from '../../../scripts/importador/plan.mjs';
import { copiar } from '../../functions/importar-diario/copia.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  return db;
}, { limpiar: db => db.close() });

const cambiar = (db, quien, modo) => llamar(sesionDe(db, db.u[quien], { confirmar: true }), 'modo_cambiar', { p_modo: modo });
const acceso = (db, quien) => llamar(sesionDe(db, db.u[quien]), 'mi_acceso', {});

describir('MO-01 la empresa nace en hoja y mi_acceso lo dice', () => {
  prueba('los tres roles ven el modo', async () => conCopia(plantilla, async db => {
    igual((await una(db, "select modo from public.empresas where id = 'al3d'")).modo, 'hoja', 'nace en hoja');
    for (const q of ['dir', 'fab', 'pag']) {
      const a = await acceso(db, q);
      igual([a.ok, a.modo, a.empresas.find(e => e.empresa_id === 'al3d').modo], [true, 'hoja', 'hoja'], q);
    }
  }));
});

describir('MO-02 modo_cambiar: solo Dirección, con bitácora', () => {
  prueba('Pagos y Fabricación no; un modo inventado no; Dirección sí y queda anotado', async () => conCopia(plantilla, async db => {
    igual((await cambiar(db, 'pag', 'base')).codigo, 'ROL_SIN_PERMISO', 'Pagos');
    igual((await cambiar(db, 'fab', 'base')).codigo, 'ROL_SIN_PERMISO', 'Fabricación');
    igual((await cambiar(db, 'dir', 'nube')).codigo, 'DATO_INVALIDO', 'un modo que no existe');
    igual(await cambiar(db, 'dir', 'base'), { ok: true, modo: 'base' });
    igual((await cambiar(db, 'dir', 'base')).sin_cambio, true, 'lo repetido no cambia nada');
    igual((await acceso(db, 'fab')).modo, 'base', 'los demás teléfonos lo leen de mi_acceso');
    const b = await sql(db, "select nivel, accion, entidad, entidad_id from public.bitacora where accion = 'modo' order by id");
    igual(b, [{ nivel: 'direccion', accion: 'modo', entidad: 'plataforma', entidad_id: 'base' }], 'una línea en la bitácora, nivel dirección');
    cierto((await una(db, "select modo_desde from public.empresas where id = 'al3d'")).modo_desde, 'con la hora del cambio');
    igual((await cambiar(db, 'dir', 'hoja')).modo, 'hoja', 'y se puede regresar');
  }));
});

describir('MO-03 nadie lo cambia directo en la tabla', () => {
  prueba('ni la app ni anon escriben en empresas', async () => conCopia(plantilla, async db => {
    await esperarError(sesionDe(db, db.u.dir).query(`update public.empresas set modo = 'base' where id = 'al3d'`), '42501', 'Dirección por la tabla');
    await esperarError(como(db, { rol: 'anon' }).rpc('modo_cambiar', { p_modo: 'base' }), '42501', 'anon');
    igual((await una(db, "select modo from public.empresas where id = 'al3d'")).modo, 'hoja');
  }));
});

/* La copia de verdad (copia.js) contra PGlite, con una transacción como la de basePostgres. */
const baseDe = db => ({
  transaccion: fn => db.transaction(tx => fn({
    ejecutar: async t => { await tx.exec(t); },
    consultar: async (t, p) => (await tx.query(t, p)).rows,
  })),
});
async function corre(db, v) {
  const plan = await planear({ volcado: v });
  return copiar({ base: baseDe(db), plan, volcado: v, ahora: () => 1000, inicio: 0 });
}
const hoja = () => {
  const filas = cincuentaFilas();
  return volcado({ ventas: filas.map(f => f.fila), abonos: filas.flatMap(f => f.abonos.map(a => [f.folio, '', Number(a), dia('2026-09-15'), 'abono', ''])) });
};

describir('MO-04 en modo base la copia de la hoja ya no aplica nada', () => {
  prueba('base: no aplica y lo dice; hoja: aplica', async () => conCopia(plantilla, async db => {
    const v = hoja();
    await cambiar(db, 'dir', 'base');
    const r1 = await corre(db, v);
    igual([r1.aplicado, /la base manda/.test(r1.resumen.motivo)], [false, true], 'no aplica y dice por qué');
    igual(Number((await una(db, 'select count(*)::int as n from public.proyectos')).n), 0, 'no entró nada');
    cierto(r1.diferencias > 0, 'el cuadre corrió igual: la hoja tiene una venta que la base no');
    await cambiar(db, 'dir', 'hoja');
    const r2 = await corre(db, v);
    igual([r2.aplicado, r2.cuadra], [true, true], 'en hoja, aplica y cuadra');
  }));
});

/* ============================================================================
   0026: la venta sin cotización, solo con la base mandando
   ============================================================================ */
const ALTA = (id = 'alta-1', extra = {}) => ({ p_op: { id, nombre: 'Marta - Panadería', cuenta: 'Moni MPago', tipo_trabajo: ['Rotulacion de vinil'], subtotal: 4000, anticipo: 1000,
  tel: '33 2222 3333', entrega: 'instalacion', fecha_instalacion: '2027-01-15', sellos: { tel: Date.now() }, ...extra } });
const alta = (db, quien, args) => llamar(sesionDe(db, db.u[quien], { confirmar: true }), 'alta_venta', args);
/** Todo lo que un alta escribe, contado como dueño: si una negativa deja esto igual, no escribió nada. */
const huella = async db => (await sql(db, `select (select count(*)::int from public.proyectos) as proyectos, (select count(*)::int from public.ventas_dinero) as dinero,
  (select count(*)::int from public.instalaciones) as citas, (select count(*)::int from public.bitacora) as bitacora,
  (select coalesce(max(n), 0)::int from public.contadores where empresa_id = 'al3d' and clave = 'V') as contador_v`))[0];

describir('MO-05 con la hoja mandando, alta_venta se niega (0026)', () => {
  prueba('Dirección y Pagos: DATO_INVALIDO definitivo, con la frase que dice que se registra en la hoja; nada escrito, ni un V-### gastado', async () => conCopia(plantilla, async db => {
    igual((await una(db, "select modo from public.empresas where id = 'al3d'")).modo, 'hoja', 'la semilla nace en hoja, como la empresa');
    const antes = await huella(db);
    for (const q of ['dir', 'pag']) {
      const r = await alta(db, q, ALTA());
      igual([q, r.ok, r.codigo, r.definitivo], [q, false, 'DATO_INVALIDO', true]);
      cierto(/todavía trabaja con la hoja/.test(r.mensaje) && /«Registrar nueva venta»/.test(r.mensaje), q + ': ' + r.mensaje);
      cierto(!/\$|\d{3}/.test(r.mensaje), 'sin importes ni números en el mensaje');
    }
    igual(await huella(db), antes, 'ni proyecto, ni dinero, ni cita, ni bitácora, ni contador');
  }));
  prueba('el área va antes que el modo: Fabricación sigue recibiendo ROL_SIN_PERMISO; quien no es de la empresa, SIN_ACCESO', async () => conCopia(plantilla, async db => {
    const f = await alta(db, 'fab', ALTA());
    igual([f.ok, f.codigo, f.definitivo], [false, 'ROL_SIN_PERMISO', true]);
    igual((await alta(db, 'ext', ALTA())).codigo, 'SIN_ACCESO');
  }));
  prueba('la validación de siempre va antes: con la hoja mandando, un dato malo sigue diciendo cuál', async () => conCopia(plantilla, async db => {
    igual((await alta(db, 'pag', ALTA('alta-2', { tel: '33 12' }))).mensaje, 'El teléfono (de 10 dígitos o más) y la forma de entrega son obligatorios.');
    igual((await alta(db, 'pag', ALTA('alta-3', { cuenta: 'Efectivo' }))).mensaje, 'La cuenta es obligatoria y debe ser una de las cuentas de AL3D.');
  }));
});

describir('MO-06 con la base mandando entra; de vuelta en la hoja, el reintento dice la verdad', () => {
  prueba('base: el V-### del contador de la base; hoja: el reintento de esa alta es «ya existía» con el mismo folio, una nueva se niega y el contador no se mueve', async () => conCopia(plantilla, async db => {
    await cambiar(db, 'dir', 'base');
    const r1 = await alta(db, 'pag', ALTA());
    igual([r1.ok, r1.proyecto_id, r1.folio_hoja], [true, 'alta-1', 'V-001']);
    const x = await una(db, `select p.fuente, p.etapa, d.subtotal::float8 as sub, i.estado from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id
                             join public.instalaciones i on i.proyecto_id = p.id where p.id = 'alta-1'`);
    igual([x.fuente, x.etapa, x.sub, x.estado], ['manual', 'ganado', 4000, 'propuesta'], 'lo de siempre (0006): la cita propuesta, porque la dio Pagos');
    /* 0030: esa venta la hoja no la tiene, así que `modo_cambiar('hoja')` ya no deja regresar (MO-08). El regreso de esta prueba es el del
       dueño en el Editor SQL, el que dice docs/BASE-MANDA.md («Cómo se regresa») para cuando ya se pasó a la hoja a mano. */
    const candado = await cambiar(db, 'dir', 'hoja');
    igual([candado.ok, candado.codigo, candado.pendientes.total, candado.pendientes.tipos[0].folios], [false, 'DATO_INVALIDO', 1, ['V-001']], 'el candado nombra la venta nueva');
    await sql(db, "update public.empresas set modo = 'hoja', modo_desde = now() where id = 'al3d'");
    const antes = await huella(db);
    const r2 = await alta(db, 'pag', ALTA());
    igual([r2.ok, r2.ya_existia, r2.folio_hoja], [true, true, 'V-001'], 'la respuesta perdida de un alta que sí entró: no «no se registró»');
    igual((await alta(db, 'pag', ALTA('alta-9'))).codigo, 'DATO_INVALIDO', 'una nueva, no');
    igual(await huella(db), antes);
  }));
});

/* Lo que la copia escribe: la vía de 0018 (importar-diario → copia.js → el SQL de scripts/importador). */
const RAIZ = new URL('../../../', import.meta.url);
const textoDe = carpeta => readdirSync(fileURLToPath(new URL(carpeta, RAIZ))).filter(n => /\.(m?js|ts)$/.test(n))
  .map(n => readFileSync(fileURLToPath(new URL(carpeta + n, RAIZ)), 'utf8')).join('\n');

describir('MO-07 la copia de cada 3 horas no usa alta_venta', () => {
  prueba('con la hoja mandando la copia sigue dando de alta las ventas de la hoja (directo en las tablas), aunque la base acabe de negar un alta', async () => conCopia(plantilla, async db => {
    igual((await alta(db, 'dir', ALTA())).codigo, 'DATO_INVALIDO');
    const r = await corre(db, hoja());
    igual([r.aplicado, r.cuadra], [true, true], 'aplica y cuadra');
    cierto(Number((await una(db, "select count(*)::int as n from public.proyectos where fuente = 'hoja'")).n) >= 50, 'entraron las ventas de la hoja');
    igual(Number((await una(db, "select count(*)::int as n from public.proyectos where fuente = 'manual'")).n), 0, 'y ninguna como «alta» de la base');
  }));
  prueba('ni el importador ni la función la nombran, y service_role (con la que entra la función) ni siquiera puede ejecutarla', async () => conCopia(plantilla, async db => {
    for (const c of ['scripts/importador/', 'supabase/functions/importar-diario/', 'supabase/functions/_shared/']) cierto(!/alta_venta/.test(textoDe(c)), c);
    await esperarError(como(db, { rol: 'service_role' }).rpc('alta_venta', ALTA()), '42501');
  }));
});

/* ============================================================================
   0030: volver a la hoja, con candado (auditoría 2026-10-26, T1-5)
   La semilla con ventas: V-001 (p1, cortado, con cita i1), V-002 (p2, ganado, sin cita), V-003 (p3), V-004 (p4), V-005 (p6, histórica).
   ============================================================================ */
const conVentas = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  return db;
}, { limpiar: db => db.close() });
const S = (db, quien) => sesionDe(db, db.u[quien], { confirmar: true });
const lineasDeModo = async db => Number((await una(db, "select count(*)::int as n from public.bitacora where accion = 'modo'")).n);
const modoDe = async db => (await una(db, "select modo from public.empresas where id = 'al3d'")).modo;
const tiposDe = r => r.pendientes.tipos.map(t => [t.tipo, t.n, t.folios]);

describir('MO-08 volver a la hoja, con candado (0030)', () => {
  prueba('un cobro en la base después del cambio: volver a la hoja se niega, dice cuántos, de qué tipo y el folio, y no cambia nada', async () => conCopia(conVentas, async db => {
    igual((await cambiar(db, 'dir', 'base')).ok, true);
    const c = await llamar(S(db, 'pag'), 'registrar_cobro', { p_proyecto: 'p2', p_monto: 500, p_op_id: 'cobro-mo08' });
    igual(c.ok, true, 'el cobro entró en la base');
    const modos = await lineasDeModo(db);
    const r = await cambiar(db, 'dir', 'hoja');
    igual([r.ok, r.codigo, r.definitivo], [false, 'DATO_INVALIDO', true], 'se niega, definitivo (reintentar no lo arregla)');
    igual(tiposDe(r), [['cobro', 1, ['V-002']]], 'un cobro, de V-002, y nada más');
    igual(r.pendientes.total, 1);
    cierto(/^No se puede volver a la hoja: la base tiene 1 cambio hecho con la base mandando que la hoja no tiene/.test(r.mensaje) &&
           /1 venta con cobro o cambio de dinero \(V-002\)/.test(r.mensaje) && /lo pisaría/.test(r.mensaje), r.mensaje);
    cierto(!/\$|500/.test(r.mensaje), 'sin importes en el mensaje');
    igual([await modoDe(db), await lineasDeModo(db)], ['base', modos], 'la empresa sigue en la base y no hay línea nueva en la bitácora');
    igual((await cambiar(db, 'dir', 'base')).sin_cambio, true, 'pedir «base» sigue siendo «sin cambio»');
  }));

  prueba('sin cambios con la base mandando se permite, como siempre; lo hecho ANTES del paso a la base no cuenta', async () => conCopia(conVentas, async db => {
    /* Con la hoja mandando: una etapa y un cobro (los manda la sombra, o Dirección por el Editor). La hoja ya los tiene por su lado. */
    igual((await llamar(S(db, 'dir'), 'mover_etapa', { p_proyecto: 'p1', p_etapa: 'armado', p_sello: Date.now() })).ok, true);
    igual((await llamar(S(db, 'pag'), 'registrar_cobro', { p_proyecto: 'p2', p_monto: 100, p_op_id: 'cobro-antes' })).ok, true);
    igual((await cambiar(db, 'dir', 'base')).ok, true);
    igual(await cambiar(db, 'dir', 'hoja'), { ok: true, modo: 'hoja' }, 'nada pendiente: regresa');
    igual([await modoDe(db), await lineasDeModo(db)], ['hoja', 2], 'con sus dos líneas en la bitácora');
  }));

  prueba('varios tipos a la vez: cada uno con su cuenta y sus folios, en orden (venta nueva, cobro, abono, etapa, cita, gasto)', async () => conCopia(conVentas, async db => {
    igual((await cambiar(db, 'dir', 'base')).ok, true);
    igual((await llamar(S(db, 'pag'), 'alta_venta', ALTA('alta-mo08'))).folio_hoja, 'V-006', 'una venta nueva con el V-### de la base');
    igual((await llamar(S(db, 'dir'), 'registrar_cobro', { p_proyecto: 'p3', p_monto: 300, p_op_id: 'cobro-p3' })).ok, true);
    igual((await llamar(S(db, 'dir'), 'registrar_abono_comision', { p_proyecto: 'p1', p_monto: 10, p_op_id: 'ab-p1' })).ok, true);
    igual((await llamar(S(db, 'dir'), 'mover_etapa', { p_proyecto: 'p4', p_etapa: 'en_diseno', p_sello: Date.now() })).ok, true);
    igual((await llamar(S(db, 'dir'), 'instalacion_guardar', { p_op: { id: 'cita-p2', proyecto_id: 'p2', fecha: '2026-11-05', hora: '10:00',
      ventana: 'dia', duracion_min: 120, sello: Date.now() } })).ok, true);
    igual((await llamar(S(db, 'pag'), 'gasto_registrar', { p_op: { op_id: 'op-g1', id: 'gas-mo08', fecha: '2026-10-26', concepto: 'Vinil de corte', categoria: 'Material',
      monto: 850, cuenta: 'Elias BBVA', folio: '', registro_por: 'Ana · Pagos (K7QM)', registrado_en: Date.now(), anulado: false, anulo: '', anulado_en: null } })).creado, true);
    const r = await cambiar(db, 'dir', 'hoja');
    igual(tiposDe(r), [['venta_nueva', 1, ['V-006']], ['cobro', 1, ['V-003']], ['abono', 1, ['V-001']], ['etapa', 1, ['V-004']],
                       ['cita', 1, ['V-002']], ['gasto', 1, ['2026-10-26 Vinil de corte']]]);
    igual(r.pendientes.total, 6);
    cierto(/la base tiene 6 cambios hechos con la base mandando/.test(r.mensaje) && /los pisaría/.test(r.mensaje) &&
           /1 venta nueva \(V-006\); 1 venta con cobro o cambio de dinero \(V-003\); 1 abono de comisión \(V-001\); 1 cambio de etapa \(V-004\); 1 cita de instalación \(V-002\); 1 gasto \(2026-10-26 Vinil de corte\)/.test(r.mensaje), r.mensaje);
    igual(await modoDe(db), 'base', 'sigue en la base');
    /* El regreso del dueño, ya con todo pasado a la hoja a mano (docs/BASE-MANDA.md, «Cómo se regresa»): el candado es de la RPC de Dirección. */
    await sql(db, "update public.empresas set modo = 'hoja', modo_desde = now() where id = 'al3d'");
    igual(await modoDe(db), 'hoja');
  }));

  prueba('la base que no sabe desde cuándo manda se niega con esa razón; sin la hora, toma la de la línea «modo» de la bitácora', async () => conCopia(conVentas, async db => {
    /* Puesta en 'base' por SQL sin la hora (y sin línea en la bitácora): no hay con qué medir qué no tiene la hoja. */
    await sql(db, "update public.empresas set modo = 'base', modo_desde = null where id = 'al3d'");
    const r = await cambiar(db, 'dir', 'hoja');
    igual([r.ok, r.codigo, r.pendientes], [false, 'DATO_INVALIDO', null]);
    cierto(/no sabe desde cuándo manda/.test(r.mensaje), r.mensaje);
    /* Con la línea de la bitácora de un paso a la base de verdad, esa es la hora. */
    await sql(db, "update public.empresas set modo = 'hoja' where id = 'al3d'");
    igual((await cambiar(db, 'dir', 'base')).ok, true);
    await sql(db, "update public.empresas set modo_desde = null where id = 'al3d'");
    igual((await cambiar(db, 'dir', 'hoja')).ok, true, 'nada pendiente desde esa línea: regresa');
  }));

  prueba('Pagos y Fabricación siguen sin poder cambiar el modo (el candado va después del área)', async () => conCopia(conVentas, async db => {
    igual((await cambiar(db, 'dir', 'base')).ok, true);
    for (const q of ['pag', 'fab']) igual([q, (await cambiar(db, q, 'hoja')).codigo], [q, 'ROL_SIN_PERMISO']);
  }));
});

await resumen();
