// La fecha del anticipo en «Datos de la venta» (0032_fecha_del_anticipo.sql; auditoría 2026-10-26, T1-6). Datos de mentiras.
//
//   FA-01  Dirección corrige la fecha del anticipo con `corregir_venta`: la venta cambia de mes en la vista de fórmulas (L y W), queda UNA línea
//          de nivel dinero con lo de antes y lo de después, la respuesta trae la fecha en `venta`, y mandarlo otra vez no escribe otra línea
//   FA-02  Pagos no (la matriz, `proyecto_actualizar`, se la deja solo a Dirección): va a `rechazadas` sin abortar lo demás; Fabricación ni entra
//   FA-03  una fecha que no existe, con otro formato o null: `rechazadas` («no es válido»), nada escrito; los demás campos de la misma corrección sí
//   FA-04  la pantalla, sobre la base de verdad: lee la fecha (`leerVentas`), arma la corrección (`plan('datos')`), la base queda como dijo la
//          pregunta y la revisión de antes de preguntar sabe que ya está; y el campo sale a quien `mi_acceso` deja (Dirección sí, Pagos no)
//   FA-05  lo demás de `corregir_venta` no cambió: el anticipo de «Corregir el anticipo» sigue siendo un valor ABSOLUTO (no suma), y la cuenta
//          sigue poniendo el IVA
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, llamar, sql, una, conCopia, crearVenta } from '../comun/semilla.js';
import * as PS from '../../../js/datos/pagos-supa.js';
import { leerAcceso } from '../../../js/nucleo/supa.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'modo_cambiar', { p_modo: 'base' });
  await crearVenta(db, { folio: 'V-210', sub: 10000, anti: 5000, cuenta: 'Constru BNT', iva: true, estatus: 'COBRANDO' });   // anticipo de hace 30 días
  return db;
}, { limpiar: db => db.close() });

/* Lo que supabase-js le daría a la pantalla sobre una sesión de PGlite (como en pantalla.mjs). */
function clienteDe(sesion) {
  return {
    async rpc(n, a) {
      try { return { data: await llamar(sesion, n, a), error: null }; }
      catch (e) { return { data: null, error: { code: String(e.codigo || e.code || 'XX000'), message: String(e.message || e) } }; }
    },
    from(tabla) {
      return { select: async cols => {
        try { return { data: (await sesion.query(`select ${cols} from public.${tabla}`)).map(r => ({ ...r })), error: null }; }
        catch (e) { return { data: null, error: { code: String(e.codigo || e.code || 'XX000'), message: String(e.message || e) } }; }
      } };
    },
  };
}
const corregir = (db, quien, cambios) => llamar(sesionDe(db, db.u[quien], { confirmar: true }), 'corregir_venta', { p_proyecto: 'v210', p_cambios: cambios });
const fila = db => una(db, `select p.fecha_anticipo::text as fant, v.l_fecha_anticipo::text as l, v.w_mes as w, p.nombre, d.anticipo::float8 as anti, d.cuenta
                              from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id join public.ventas_calculadas v on v.proyecto_id = p.id where p.id = 'v210'`);
const lineas = db => sql(db, "select nivel, titulo, detalle, antes, despues from public.bitacora where entidad = 'venta' and entidad_id = 'v210' and accion = 'cambio' order by id");
const HOY = db => una(db, 'select interno.hoy_mx()::text as h').then(r => r.h);
const MES_PASADO = db => una(db, `select (date_trunc('month', interno.hoy_mx()) - interval '10 days')::date::text as f`).then(r => r.f);

describir('FA-01 Dirección corrige la fecha del anticipo (0032)', () => {
  prueba('la venta cambia de mes, con UNA línea de dinero con lo de antes y lo de después; otra vez, lo mismo y ninguna línea más', async () => conCopia(plantilla, async db => {
    const antes = await fila(db);
    const nueva = await MES_PASADO(db);
    const r = await corregir(db, 'dir', { fecha_anticipo: nueva });
    igual([r.ok, r.escritos, r.rechazadas, r.venta.fecha_anticipo], [true, ['fecha_anticipo'], [], nueva], 'escrita, y la respuesta la trae');
    const x = await fila(db);
    igual([x.fant, x.l, x.w], [nueva, nueva, nueva.slice(0, 7)], 'la vista de fórmulas la cuenta en su mes (L y W)');
    const b = await lineas(db);
    igual([b.length, b[0].nivel, b[0].titulo, b[0].antes, b[0].despues], [1, 'dinero', 'Se corrigió V-210', { fecha_anticipo: antes.fant }, { fecha_anticipo: nueva }]);
    cierto(/fecha_anticipo/.test(b[0].detalle), b[0].detalle);
    const r2 = await corregir(db, 'dir', { fecha_anticipo: nueva });
    igual([r2.ok, (await lineas(db)).length, (await fila(db)).fant], [true, 1, nueva], 'valor absoluto: mandarlo otra vez no escribe otra línea');
  }));
});

describir('FA-02 y FA-03 quién y qué', () => {
  prueba('FA-02 Pagos: «no puede escribir esta propiedad» (la lista de proyecto_actualizar es solo de Dirección), sin abortar lo demás; Fabricación ni entra', async () => conCopia(plantilla, async db => {
    const antes = await fila(db);
    const r = await corregir(db, 'pag', { fecha_anticipo: await MES_PASADO(db), nombre: 'Letras Centro' });
    igual([r.ok, r.escritos, r.rechazadas.map(x => [x.nombre, /no puede escribir/.test(x.por)])], [true, ['nombre'], [['fecha_anticipo', true]]]);
    igual([(await fila(db)).fant, (await fila(db)).nombre], [antes.fant, 'Letras Centro'], 'la fecha no se movió; el nombre sí');
    const f = await corregir(db, 'fab', { fecha_anticipo: await MES_PASADO(db) });
    igual([f.ok, f.codigo], [false, 'ROL_SIN_PERMISO']);
  }));
  prueba('FA-03 una fecha que no existe, otro formato o null: «no es válido» y nada escrito; lo demás de la corrección sí', async () => conCopia(plantilla, async db => {
    const antes = await fila(db);
    for (const malo of ['2026-02-30', '30/09/2026', null, 20261001, '']) {
      const r = await corregir(db, 'dir', { fecha_anticipo: malo });
      igual([String(malo), r.ok, r.escritos, r.rechazadas.map(x => [x.nombre, /no es válido/.test(x.por)])], [String(malo), true, [], [['fecha_anticipo', true]]]);
    }
    igual([(await fila(db)).fant, (await lineas(db)).length], [antes.fant, 0], 'nada escrito, ni una línea');
    const r = await corregir(db, 'dir', { fecha_anticipo: 'ayer', cuenta: 'Rul HSBC' });
    igual([r.escritos, (await fila(db)).cuenta, (await fila(db)).fant], [['cuenta'], 'Rul HSBC', antes.fant]);
  }));
});

describir('FA-04 la pantalla sobre la base de verdad', () => {
  prueba('lee la fecha, la corrige como dijo la pregunta, y el campo sale a Dirección y no a Pagos', async () => conCopia(plantilla, async db => {
    const c = clienteDe(sesionDe(db, db.u.dir, { confirmar: true }));
    const r0 = await PS.leerVentas(c);
    const v = r0.ventas.find(x => x.folio === 'V-210');
    igual(v.fechaAnticipo, (await fila(db)).fant, 'la pantalla lee la fecha del anticipo (L de la vista)');
    const nueva = await MES_PASADO(db);
    const campos = { proyecto: 'v210', fant: nueva };
    const o = { opId: PS.nuevoOpId(), hoy: await HOY(db), venta: v, area: 'direccion', baseManda: true };
    const p = PS.plan('datos', campos, o);
    igual(p.args.p_cambios, { fecha_anticipo: nueva });
    const r = await PS.enviar(c, p);
    igual([r.ok, r.data.escritos], [true, ['fecha_anticipo']]);
    igual(PS.resumen(p, r.data, v), 'Venta V-210 corregida: fecha del anticipo ' + nueva + '. Queda en la bitácora de la base con lo de antes.');
    const w = (await PS.leerVentas(c)).ventas.find(x => x.folio === 'V-210');
    igual([w.fechaAnticipo, PS.correccionAlDia(p, PS.plan('datos', campos, { ...o, venta: w }))], [nueva, 'ya_estaba'], 'y la revisión de antes de preguntar sabe que ya está');
    /* Como lo lee el teléfono: `mi_acceso` por `leerAcceso` de js/nucleo/supa.js (el área, el estado y los permisos de la matriz). */
    const accDir = leerAcceso(await llamar(sesionDe(db, db.u.dir), 'mi_acceso', {}));
    const accPag = leerAcceso(await llamar(sesionDe(db, db.u.pag), 'mi_acceso', {}));
    igual([PS.puedeCorregirLaFechaDelAnticipo(accDir), PS.puedeCorregirLaFechaDelAnticipo(accPag)], [true, false], 'lo que dice mi_acceso: Dirección sí, Pagos no');
  }));
});

describir('FA-05 lo demás de corregir_venta no cambió', () => {
  prueba('«Corregir el anticipo» sigue siendo un valor absoluto (no se suma), y la cuenta sigue poniendo el IVA', async () => conCopia(plantilla, async db => {
    const c = clienteDe(sesionDe(db, db.u.pag, { confirmar: true }));
    const v = (await PS.leerVentas(c)).ventas.find(x => x.folio === 'V-210');
    const p = PS.plan('cobro', { modo: 'anticipo', proyecto: 'v210', monto: '6000' }, { opId: PS.nuevoOpId(), venta: v, area: 'pagos', baseManda: true });
    igual(p.rpc, 'corregir_venta');
    for (let i = 0; i < 2; i++) igual((await PS.enviar(c, p)).ok, true);
    igual((await fila(db)).anti, 6000, 'dos veces el mismo anticipo total: 6000, no 12000 ni 11000');
    const r = await corregir(db, 'dir', { cuenta: 'Elias BBVA' });
    igual([r.escritos, r.venta.iva], [['cuenta'], false], 'la cuenta que no factura deja la venta sin IVA, como antes');
  }));
});

await resumen();
