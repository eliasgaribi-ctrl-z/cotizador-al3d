// QUIÉN MANDA, la hoja o la base (0024, pedido por Elías el 2026-10-25). Datos de mentiras.
//
//   MO-01  la empresa nace en 'hoja'; mi_acceso dice el modo (de cada empresa y el de la elegida) a cualquier miembro
//   MO-02  modo_cambiar: solo Dirección; un modo que no existe no entra; lo repetido no cambia nada; queda en la bitácora
//   MO-03  nadie lo cambia directo en la tabla (ni la app ni anon)
//   MO-04  en modo 'base' la copia de la hoja (importar-diario) ya no aplica nada: solo cuadra; de vuelta en 'hoja', aplica
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, como, sql, una, llamar, conCopia } from '../comun/semilla.js';
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

await resumen();
