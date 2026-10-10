// R1: Fabricación no lee NINGÚN dinero por ninguna vía — la parte que necesita el notario, la bitácora y las respuestas de las RPC.
// A.md §10.3 y §10.4, casos R1-03, R1-06, R1-09, R1-12, R1-13, R1-14, R1-15 (y RL-09, RL-10).
// (R1-01, R1-02, R1-04, R1-05, R1-08 y R1-18 están en dinero.mjs; R1-07 y R1-17 en almacen.mjs; R1-10, R1-11 y R1-16 en pagos/ y obra-y-etapas/.)
//
// Las vías que se cierran aquí: la tabla de cotizaciones/solicitudes/autorizaciones (sin política para Fabricación), la BITÁCORA (los eventos con importes son de
// nivel `dinero` y Fabricación solo ve `general`), la RESPUESTA de cada RPC (nunca una cifra de dinero) y la política que Realtime evalúa.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sembrarAlmacen, sesionDe, llamar, una, sql, conCopia, como, ORIGEN_COMPLETO } from '../comun/semilla.js';
import { sol, aut, sello } from '../comun/notario.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  await sembrarAlmacen(db);
  return db;
}, { limpiar: db => db.close() });
const AHORA = () => Date.now();
const C = (db, quien) => sesionDe(db, db.u[quien], { confirmar: true });
const SRC = db => como(db, { rol: 'service_role', confirmar: true });
const GANAR = { p_op: { id: 'g1', folio_global: 'COT-0100@K7QM', folio_local: 'COT-0100', dispositivo: 'K7QM', entrada: ORIGEN_COMPLETO, nombre: 'Rosa - Tienda (Letras)', contacto: 'Rosa', negocio: 'Tienda',
  tel: '33 1111 2222', tipo_trabajo: ['Letras 3D con iluminacion'], fecha_anticipo: '2026-10-05', dir_texto: 'Calle 5', entrega: 'instalacion', plazo_k: 3,
  venta: { sub: 10000, neto: 11600, anti: 5800, iva: true, cuenta: 'Constru BNT', estatus: 'COBRANDO', pct_comision: 10, precio_auth: 10000 }, sellos: { etapa: AHORA(), tel: AHORA() } } };
/** Las claves que son dinero: no deben aparecer como LLAVE en nada de lo que recibe Fabricación. */
const CLAVES_DINERO = ['subtotal', 'anticipo', 'liquidacion', 'cuenta', 'neto', 'saldo', 'precioAuth', 'precio_auth', 'subCalc', 'sub_calc', 'itemsAuth', 'renglones', 'pct_comision', 'importe', 'comision', 'costo', 'costo_total', 'costo_compra'];
const sinDinero = (que, valor) => {
  const texto = JSON.stringify(valor);
  for (const k of CLAVES_DINERO) igual([que, k, texto.includes('"' + k + '"')], [que, k, false]);
};
const IMPORTE = /\$|[0-9]+\.[0-9]{2}/;

describir('R1-03 y R1-15 las tablas de dinero y notario no se leen, ni se oyen por Realtime', () => {
  prueba('R1-03 Fabricación: abonos, almacen_costos y autorizaciones, 0 filas cada una (con datos existentes); Pagos lee abonos y almacen_costos pero NO las autorizaciones (solo Dirección)', () => conCopia(plantilla, async db => {
    await llamar(C(db, 'pag'), 'solicitar', { p_op: sol('COT-0042-B@K7QM') });
    await llamar(SRC(db), 'registrar_autorizacion', aut(db));
    const n = async (quien, t) => (await sesionDe(db, db.u[quien]).query(`select count(*)::int as n from public.${t}`))[0].n;
    for (const t of ['abonos', 'almacen_costos', 'autorizaciones']) {
      igual([t, await n('fab', t)], [t, 0]);
      cierto(await n('dir', t) > 0, `Dirección sí lee ${t}`);
    }
    igual([await n('pag', 'abonos') > 0, await n('pag', 'almacen_costos') > 0, await n('pag', 'autorizaciones')], [true, true, 0]);
  }));
  prueba('R1-15 las políticas de SELECT de ventas_dinero, abonos, almacen_costos, cotizaciones, solicitudes y autorizaciones no nombran a Fabricación, y por cada una Fabricación recibe 0 filas', () => conCopia(plantilla, async db => {
    await llamar(C(db, 'dir'), 'solicitar', { p_op: sol('COT-0042-B@K7QM') });
    await llamar(SRC(db), 'registrar_autorizacion', aut(db));
    const F = sesionDe(db, db.u.fab);
    for (const t of ['ventas_dinero', 'abonos', 'almacen_costos', 'cotizaciones', 'solicitudes', 'autorizaciones']) {
      const pol = await sql(db, `select polname, pg_get_expr(polqual, polrelid) as cond from pg_policy where polrelid = $1::regclass`, ['public.' + t]);
      cierto(pol.length > 0, `${t} tiene política (RLS encendida y no «abierta a todos»)`);
      for (const p of pol) cierto(!/fabricacion/.test(p.cond), `${t}.${p.polname}: ${p.cond}`);
      igual([t, (await F.query(`select count(*)::int as n from public.${t}`))[0].n], [t, 0]);
    }
    const publicadas = (await sql(db, `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`)).map(r => r.tablename);
    cierto(!publicadas.includes('autorizaciones') && !publicadas.includes('cuaderno_notas'), 'las autorizaciones y los cuadernos no se publican por Realtime');
    igual((await una(db, `select count(*)::int as n from pg_class c join pg_publication_rel r on r.prrelid = c.oid where c.relreplident = 'f'`)).n, 0, 'ninguna tabla publicada con identidad de réplica FULL');
  }));
  prueba('RL-09 cuaderno_notas: Dirección ve todas las notas; Pagos y Fabricación solo las suyas (la política «propia» sí incluye a Fabricación: son SUS notas)', () => conCopia(plantilla, async db => {
    for (const quien of ['dir', 'pag', 'fab']) await llamar(C(db, quien), 'cuaderno_guardar', { p_clave: 'tel:3312345678', p_nota: 'nota de ' + quien });
    const veo = async quien => (await sesionDe(db, db.u[quien]).query(`select nota from public.cuaderno_notas order by nota`)).map(r => r.nota);
    igual([await veo('dir'), await veo('pag'), await veo('fab')], [['nota de dir', 'nota de fab', 'nota de pag'], ['nota de pag'], ['nota de fab']]);
  }));
});

describir('R1-06 y R1-14 pedir una autorización no abre la puerta a los precios', () => {
  prueba('R1-06 Fabricación pide autorización (ok) y luego lee cotizaciones y solicitudes: 0 filas, incluida la suya', () => conCopia(plantilla, async db => {
    const r = await llamar(C(db, 'fab'), 'solicitar', { p_op: sol('COT-0500-B@K7QM') });
    igual([r.ok, r.estado], [true, 'pendiente']);
    const F = sesionDe(db, db.u.fab);
    igual([(await F.query(`select count(*)::int as n from public.cotizaciones`))[0].n, (await F.query(`select count(*)::int as n from public.solicitudes`))[0].n], [0, 0]);
    igual((await una(db, `select count(*)::int as n from public.solicitudes where folio_global = 'COT-0500-B@K7QM'`)).n, 1, 'la solicitud sí existe: Fabricación solo no la lee');
    sinDinero('respuesta de solicitar', r);
  }));
  prueba('R1-14 estado_solicitudes: un folio ajeno → {estado:null}; uno propio autorizado → sello {codigo, correo, ts} SIN total, subCalc, precioAuth, itemsAuth ni renglones', () => conCopia(plantilla, async db => {
    await llamar(C(db, 'fab'), 'solicitar', { p_op: sol('COT-0501-B@K7QM') });
    await llamar(C(db, 'pag'), 'solicitar', { p_op: sol('COT-0502-B@K7QM') });
    await llamar(SRC(db), 'registrar_autorizacion', aut(db, { p_folio_global: 'COT-0501-B@K7QM', ...sello(1), p_total_txt: '77777.77', p_renglones: '[["Secreto",1,77777.77]]', p_items_auth: '1:77777.77' }));
    await llamar(SRC(db), 'registrar_autorizacion', aut(db, { p_folio_global: 'COT-0502-B@K7QM', ...sello(2) }));
    const r = await llamar(sesionDe(db, db.u.fab), 'estado_solicitudes', { p_folios: ['COT-0501-B@K7QM', 'COT-0502-B@K7QM'] });
    igual(r.folios['COT-0502-B@K7QM'], { estado: null, sello: null, resolvio: '', nota: '' }, 'lo ajeno no existe para Fabricación');
    igual(Object.keys(r.folios['COT-0501-B@K7QM'].sello).sort(), ['codigo', 'correo', 'ts']);
    sinDinero('estado_solicitudes de Fabricación', r);
    igual(JSON.stringify(r).includes('77777'), false);
  }));
});

describir('R1-09, R1-12 y R1-13 la bitácora y las respuestas', () => {
  prueba('R1-09 tras ganar_proyecto, corregir_venta, registrar_cobro y mover_etapa, Fabricación ve solo la bitácora `general` y ningún título, detalle, antes ni después trae un importe; Dirección ve además la de dinero', () => conCopia(plantilla, async db => {
    igual((await llamar(C(db, 'dir'), 'ganar_proyecto', GANAR)).ok, true);
    igual((await llamar(C(db, 'dir'), 'corregir_venta', { p_proyecto: 'p1', p_cambios: { subtotal: 12345.67, cuenta: 'Elias BBVA' } })).ok, true);
    igual((await llamar(C(db, 'pag'), 'registrar_cobro', { p_proyecto: 'p4', p_monto: 321.45, p_liquidar: false, p_op_id: 'r109' })).ok, true);
    igual((await llamar(C(db, 'dir'), 'mover_etapa', { p_proyecto: 'p2', p_etapa: 'cortado', p_sello: AHORA() })).ok, true);
    igual((await llamar(C(db, 'pag'), 'registrar_abono_comision', { p_proyecto: 'p1', p_monto: 77.77, p_op_id: 'a109' })).ok, true);
    const filas = async quien => sesionDe(db, db.u[quien]).query(`select nivel, accion, titulo, detalle, antes, despues, resultado from public.bitacora`);
    const f = await filas('fab'), d = await filas('dir'), p = await filas('pag');
    cierto(f.length > 0 && f.every(x => x.nivel === 'general'), 'Fabricación solo ve el nivel general');
    cierto(d.some(x => x.nivel === 'dinero') && d.some(x => x.nivel === 'general'), 'Dirección ve dinero y general');
    cierto(p.every(x => x.nivel !== 'direccion') && p.some(x => x.nivel === 'dinero'), 'Pagos ve general y dinero, no dirección');
    for (const x of f) {
      for (const campo of ['titulo', 'detalle']) cierto(!IMPORTE.test(x[campo] ?? ''), `${x.accion}.${campo}: ${x[campo]}`);
      cierto(!IMPORTE.test(JSON.stringify(x.antes ?? '') + JSON.stringify(x.despues ?? '')), `${x.accion}: antes/después sin importes`);
      igual([x.accion, x.resultado ?? null], [x.accion, null], 'el resultado guardado de una operación (que puede traer importes) no es de nivel general');
    }
    cierto(d.filter(x => x.nivel === 'dinero').every(x => x.accion !== 'etapa'), 'la etapa es general');
    igual(f.length, d.filter(x => x.nivel === 'general').length, 'Fabricación recibe exactamente las filas generales: ni una de dinero ni de dirección');
    cierto(f.some(x => x.accion === 'etapa'), 'y lo de obra (la etapa) sí');
  }));
  prueba('R1-12 / R1-13 Fabricación: mover_etapa dentro de su rango, proyecto_actualizar, instalacion_guardar, almacen_aplicar con costos, cotizacion_guardar, cuaderno, subida_unica, mi_acceso: ok y NINGUNA respuesta trae una clave de dinero', () => conCopia(plantilla, async db => {
    const F = C(db, 'fab');
    const respuestas = {};
    await llamar(F, 'solicitar', { p_op: sol('COT-0600-B@K7QM') });
    respuestas.mover_etapa = await llamar(F, 'mover_etapa', { p_proyecto: 'p4', p_etapa: 'en_diseno', p_sello: AHORA() });
    respuestas.proyecto_actualizar = await llamar(F, 'proyecto_actualizar', { p_op: { id: 'p4', campos: { notas: 'una nota' }, sellos: { notas: AHORA() } } });
    respuestas.instalacion_guardar = await llamar(F, 'instalacion_guardar', { p_op: { id: 'nueva', proyecto_id: 'p2', fecha: '2026-11-05', hora: '10:00', ventana: 'dia', duracion_min: 120, sello: AHORA() } });
    respuestas.almacen_aplicar = await llamar(F, 'almacen_aplicar', { p_ops: [{ id: 'op-r1', almacen: 'movimientos', tipo: 'apendice', registro_id: 'r1', datos: { id: 'r1', material_id: 'acr-3mm', tipo: 'entrada', cantidad: 5, unidad_compra: 'lamina', origen: 'manual', nota: '',
                                                                                    usuario: 'Fab', rol: 'fabricacion', dispositivo: 'D1', firma: 'Fab', ts: AHORA(), costo_total: 999.99 } }] });
    respuestas.cotizacion_guardar = await llamar(F, 'cotizacion_guardar', { p_op: { folio_global: 'COT-0600-B@K7QM', hitos: { pdf: 1 } } });
    respuestas.cuaderno_guardar = await llamar(F, 'cuaderno_guardar', { p_clave: 'tel:3312345678', p_nota: 'x' });
    respuestas.subida_unica = await llamar(F, 'subida_unica', { p_lote: { disp: 'FAB1', cotizaciones: [{ folio: 'COT-0007-B', disp: 'FAB1', proy: 'x', neto: 5000, items: [] }] } });
    respuestas.emitir_salidas_derivadas = await llamar(F, 'emitir_salidas_derivadas', {});
    respuestas.mi_acceso = await llamar(F, 'mi_acceso', {});
    respuestas.estado_solicitudes = await llamar(F, 'estado_solicitudes', { p_folios: ['COT-0600-B@K7QM'] });
    for (const [rpc, r] of Object.entries(respuestas)) {
      cierto(r.ok === true, `${rpc} debe pasar: ${JSON.stringify(r).slice(0, 160)}`);
      sinDinero(rpc, r);
    }
    // `remoto` sale solo de `proyectos`/`instalaciones` (R1-12)
    const cols = (await sql(db, `select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'proyectos'`)).map(r => r.c);
    for (const llave of Object.keys(respuestas.mover_etapa.remoto)) cierto(cols.includes(llave), `remoto.${llave} no es una columna de proyectos`);
    igual((await una(db, `select count(*)::int as n from public.almacen_costos where movimiento_id = 'r1'`)).n, 0, 'el costo que mandó Fabricación se ignoró en silencio');
  }));
});

await resumen();
