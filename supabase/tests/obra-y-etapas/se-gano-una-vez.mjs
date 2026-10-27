// «Se ganó» una sola vez (auditoría 2026-10-26, T1-1, crítico). Datos de mentiras.
//
// En el teléfono de Dirección, «Se ganó» sobre una cotización que Pagos ya había vendido desde SU cotizador creaba otra venta con otro V-###:
// el teléfono mandaba el folio global con SU aparato (`COT-P0042@D1R3`) y la base, que busca por folio global (`ganar_proyecto`, 0028),
// no la reconocía. La app ya manda el aparato de la cotización (`Proyectos.ganar`) y no llama a la base si el libro ya tiene esa venta
// (pruebas/se-gano-una-vez.mjs, el teléfono entero). Aquí, lo que la base de verdad contesta en cada caso:
//
//   SG-01  con el folio global CORRECTO (el de la cotización), el «Se ganó» de Dirección sobre la venta de Pagos es DUPLICADO: ni proyecto, ni
//          dinero, ni cita, ni bitácora, ni un número del contador; y dice cuál es (`proyecto_id`)
//   SG-02  el reintento de Pagos (el mismo id) es «ya existía» con el MISMO V-###
//   SG-03  con el folio de ESTE teléfono (el error de antes) la base no la reconoce y da otra venta: por eso el teléfono no puede mandar ese
//   SG-04  lo que baja al teléfono de Dirección trae el folio global de la cotización de Pagos (`proyectos.folio_global`, que la RLS le deja leer
//          a los tres roles): es con lo que la tarjeta y la red de seguridad la reconocen
import { describir, prueba, dato, igual, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, llamar, sql, una, conCopia, conLaBaseMandando, ORIGEN_COMPLETO } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await conLaBaseMandando(db);
  return db;
}, { limpiar: db => db.close() });

const AHORA = () => Date.now();
const GANAR = (extra = {}) => ({ p_op: {
  id: 'proy-pag-1', folio_global: 'COT-P0042@P4G0', folio_local: 'COT-P0042', dispositivo: 'P4G0', entrada: { ...ORIGEN_COMPLETO, folio: 'COT-P0042', disp: 'P4G0' },
  nombre: 'Rosa - Café (Letras)', contacto: 'Rosa', negocio: 'Café', tel: '33 1111 2222', tipo_trabajo: ['Letras 3D con iluminacion'], fecha_anticipo: '2026-10-05',
  entrega: 'instalacion', venta: { sub: 10000, neto: 11600, anti: 5800, iva: true, cuenta: 'Constru BNT', estatus: 'FABRICACION', pct_comision: 10, precio_auth: 10000 },
  sellos: { etapa: AHORA(), tel: AHORA() }, ...extra } });
const ganar = (db, quien, args) => llamar(sesionDe(db, db.u[quien], { confirmar: true }), 'ganar_proyecto', args);
const huella = async db => (await sql(db, `select (select count(*)::int from public.proyectos) as proyectos, (select count(*)::int from public.ventas_dinero) as dinero,
  (select count(*)::int from public.instalaciones) as citas, (select count(*)::int from public.bitacora) as bitacora,
  (select coalesce(max(n), 0)::int from public.contadores where empresa_id = 'al3d' and clave = 'V') as contador_v`))[0];

describir('SG «Se ganó» de una cotización que ya es venta, con la base mandando', () => {
  prueba('SG-01 y SG-02 con el folio de la cotización: Dirección recibe DUPLICADO (nada escrito, ni un V-###); el reintento de Pagos, «ya existía» con su V-###', async () => conCopia(plantilla, async db => {
    const p = await ganar(db, 'pag', GANAR());
    igual([p.ok, p.folio_hoja], [true, 'V-001'], 'Pagos la vendió desde su cotizador');
    const antes = await huella(db);
    /* Lo que manda el teléfono de Dirección desde el arreglo: SU id, pero el folio global de la cotización (el aparato de Pagos). */
    const d = await ganar(db, 'dir', GANAR({ id: 'proy-dir-1', instalacion_id: 'inst-dir-1', fecha_instalacion: '2027-01-20' }));
    igual([d.ok, d.codigo, d.proyecto_id], [false, 'DUPLICADO', 'proy-pag-1'], 'la base la reconoce y dice cuál es');
    igual(await huella(db), antes, 'ni proyecto, ni dinero, ni cita, ni bitácora, ni contador');
    const r = await ganar(db, 'pag', GANAR());
    igual([r.ok, r.ya_existia, r.folio_hoja], [true, true, 'V-001'], 'el reintento del mismo «Se ganó»: el mismo folio');
    igual(await huella(db), antes);
  }));
  prueba('SG-03 con el folio de ESTE teléfono (el error de antes) la base no la reconoce y da otra venta: por eso el teléfono manda el de la cotización', async () => conCopia(plantilla, async db => {
    await ganar(db, 'pag', GANAR());
    const d = await ganar(db, 'dir', GANAR({ id: 'proy-dir-1', folio_global: 'COT-P0042@D1R3', dispositivo: 'D1R3' }));
    igual([d.ok, d.folio_hoja], [true, 'V-002'], 'la misma cotización, dos ventas: lo que la auditoría vio en Control');
    igual((await una(db, `select count(*)::int as n from public.proyectos where folio_local = 'COT-P0042'`)).n, 2);
  }));
  prueba('SG-04 lo que baja a Dirección trae el folio global de la cotización de Pagos (los tres roles lo leen)', async () => conCopia(plantilla, async db => {
    await ganar(db, 'pag', GANAR());
    for (const q of ['dir', 'fab', 'pag']) {
      const filas = await sesionDe(db, db.u[q]).query(`select folio_hoja, folio_global from public.proyectos where id = 'proy-pag-1'`);
      igual([q, filas.map(f => [f.folio_hoja, f.folio_global])], [q, [['V-001', 'COT-P0042@P4G0']]]);
    }
  }));
});

await resumen();
