// Fixture común de las pruebas de base de datos (A.md §10, «semilla de pruebas»).
//
// Es un módulo de AYUDA, no una prueba: por eso es `.js` y no `.mjs` (correr.sh solo lanza los `*.mjs`).
// Todo lo que hay aquí es FALSO y marcado como tal: correos en `@al3d.test` / `@otra.test` (dominios reservados,
// nunca un buzón de verdad), uuids de relleno y claves de sello inventadas. Ningún secreto real entra a una prueba.
//
//   import { crearBaseDePruebas, sembrarUsuarios, sesionDe, llamar, conCopia, ... } from '../comun/semilla.js';
//
// Los usuarios de las pruebas (los mismos nombres que usa A.md §10):
//   dir, dir2   Dirección activos en `al3d`           (dos, para probar «el último Dirección»)
//   fab, pag    Fabricación y Pagos activos en `al3d`
//   inv         invitación sin reclamar (fab2@al3d.test, fabricacion), con correo VERIFICADO
//   noverif     invitación vigente pero con `email_confirmed_at` nulo
//   ext         sin fila en `miembros`
//   baja        miembro en `baja`
//   otra        Dirección en la empresa `otra`
//   multi       Dirección en `al3d` y Fabricación en `otra`
import { crearBase, clonarBase, crearUsuarioAuth, como, sql } from '../arnes/arnes.mjs';

/** Dónde están las migraciones, contado desde supabase/tests/ (el arnés resuelve las rutas desde ahí). */
export const MIGRACIONES = '../migrations';

/** Cabecera de contrato que PostgREST le pasaría a las RPC de escritura (versión mínima vigente: 1). */
export const CAB = Object.freeze({ 'x-al3d-contrato': '1' });

/** Clave de sello FALSA (la de los vectores de prueba de M04 §1.8): jamás una clave real. */
export const CLAVE_SELLO_FALSA = 'CLAVE-FALSA-SOLO-PARA-PRUEBAS-0000';

const uid = n => '00000000-0000-4000-8000-0000000000' + n.toString(16).padStart(2, '0');

/** Definición de cada usuario: su uid, su correo y sus membresías (empresa, área, estado). */
export const DEFS = Object.freeze({
  dir:     { uid: uid(0xd1), correo: 'dir@al3d.test',  membresias: [['al3d', 'direccion', 'activo']] },
  dir2:    { uid: uid(0xd2), correo: 'dir2@al3d.test', membresias: [['al3d', 'direccion', 'activo']] },
  fab:     { uid: uid(0xf1), correo: 'fab@al3d.test',  membresias: [['al3d', 'fabricacion', 'activo']] },
  pag:     { uid: uid(0xa1), correo: 'pag@al3d.test',  membresias: [['al3d', 'pagos', 'activo']] },
  inv:     { uid: uid(0xe1), correo: 'fab2@al3d.test', membresias: [['al3d', 'fabricacion', 'invitado']] },
  noverif: { uid: uid(0xe2), correo: 'nv@al3d.test',   verificado: false, membresias: [['al3d', 'pagos', 'invitado']] },
  ext:     { uid: uid(0xe3), correo: 'ext@al3d.test',  membresias: [] },
  baja:    { uid: uid(0xe4), correo: 'baja@al3d.test', membresias: [['al3d', 'pagos', 'baja']] },
  otra:    { uid: uid(0xc1), correo: 'otra@otra.test', membresias: [['otra', 'direccion', 'activo']] },
  multi:   { uid: uid(0xc2), correo: 'multi@al3d.test', membresias: [['al3d', 'direccion', 'activo'], ['otra', 'fabricacion', 'activo']] },
});

/**
 * Crea la empresa `otra` y a todos los usuarios con sus membresías (como superusuario: no depende de ninguna RPC).
 * Devuelve `{dir, dir2, fab, pag, inv, noverif, ext, baja, otra, multi}`, cada uno `{uid, correo, verificado, clave}`.
 */
export async function sembrarUsuarios(db) {
  await sql(db, `insert into public.empresas (id, nombre) values ('otra', 'Otra empresa (solo pruebas)') on conflict (id) do nothing`);
  const u = {};
  for (const [clave, d] of Object.entries(DEFS)) {
    const cuenta = await crearUsuarioAuth(db, { uid: d.uid, correo: d.correo, verificado: d.verificado ?? true });
    u[clave] = { ...cuenta, clave };
    for (const [empresa, area, estado] of d.membresias) {
      // `invitado` no lleva usuario_id (el CHECK lo exige); `activo` y `baja` sí, y la baja con su fecha
      await sql(db,
        `insert into public.miembros (empresa_id, correo, area, estado, usuario_id, reclamado_en, baja_en)
         values ($1, $2, $3, $4, $5, case when $4 = 'invitado' then null else now() end, case when $4 = 'baja' then now() end)`,
        [empresa, d.correo, area, estado, estado === 'invitado' ? null : d.uid]);
    }
  }
  return u;
}

/**
 * Una entrada de cotizador COMPLETA, con todos los precios (lo que `proyectos.origen` guardaba entero y la base ahora PARTE).
 * Valores inventados. Sirve para probar que Fabricación no recibe ni una clave de dinero (R1-04, PX-01).
 */
export const ORIGEN_COMPLETO = Object.freeze({
  folio: 'COT-0001', proy: 'Tacos Don Juan', cliente: 'Juan Pérez', tel: '33 1234 5678', dirRaw: 'Av. Siempre Viva 123', direccion: 'Av. Siempre Viva 123, Guadalajara',
  maps: 'https://maps.app.goo.gl/abc', entrecalles: 'Entre A y B', entrega: 'instalacion', notaCliente: 'Lo quiere para el viernes', fecha: '2026-10-01',
  plazoK: 3, disp: 'K7QM', fuente: 'cotizador', iva: true,
  items: [
    { id: 1, tipo: 'caja', material: 'acr-vol', matAuto: true, comp: 'recta', luz: 'led', ilumTipo: 'frontal', altura: 30, n: 4, acab: 'brillante', recComp: 0, bas: 'lamina',
      ancho: 120, alto: 40, pz: 1, desc: 'Caja de luz frontal', descAi: '', textoAuto: '', showInPdf: true, plano: null, nManual: false, descAuto: '', medidaTipo: 'caja', anchoMedido: 120,
      tarifa: 3900, pu: 1500, _lt: 4200,
      opciones: { activa: 'a', lista: [{ k: 'a', d: { id: 1, tipo: 'caja', altura: 30, pu: 1500, tarifa: 3900 }, precioOpcion: 1500 }, { k: 'b', d: { id: 1, tipo: 'caja', altura: 40, pu: 2100 } }] } },
    { id: 2, tipo: 'letras', material: 'acero', comp: 'cursiva', altura: 25, n: 6, desc: 'Letras sueltas', pu: 300, tarifa: 55, _lt: 1800, caja_forma: 'std' },
  ],
  renders: [{ name: 'r1.png', type: 'image/png' }], propuesta: { primera: 1, ultima: 2, veces: 2 }, aiFile: { name: 'a.png', type: 'image/png', url: 'https://ejemplo.invalid/a.png' },
  precioAuth: 6000, neto: 6960, sub: 6000, anti: 3000, antiManual: false, itemsAuth: { 1: 1500 }, huellaAuth: 'h1', sello: { codigo: 'AAAA-BBBB-CCCC' },
  autorizador: 'dir@al3d.test', fechaAuth: '2026-10-02', nota: 'nota interna con importes', ts: 1760000000000, reenviada: false,
});

/**
 * Los datos de proyectos de la semilla (A.md §10), sembrados como SUPERUSUARIO (no dependen de ninguna RPC):
 *   p1  cotización, V-001, `cortado`, COBRANDO, Constru BNT, con IVA; trae `origen` completo (obra + dinero) y la cita i1
 *   p2  cotización, V-002, `ganado`, FABRICACION, Elias BBVA (sin IVA)
 *   p3  cotización, V-003, `armado`, REPARANDO, Moni MPago, con la cita i2 (propuesta)
 *   p4  manual,     V-004, `ganado`, FABRICACION
 *   p6  histórica,  V-005, sin etapa, LIQUIDADO, con fecha de instalación heredada
 *   p5  LÁPIDA (cotización que no se dio): sin folio_hoja, `cancelado`, sin dinero
 *   abonos: 4 (V-001 ×2, V-002, V-003); contadores V = 5 y P = 1
 * Devuelve los ids para que las pruebas no los repitan.
 */
export async function sembrarProyectos(db) {
  const prj = `insert into public.proyectos (id, empresa_id, folio_hoja, folio_global, folio_local, dispositivo, fuente, historica, nombre, contacto, negocio, tel, etapa,
                  tipo_trabajo, fecha_anticipo, dir_texto, lat, lng, entrega, plazo_k, notas, estatus, iva, fecha_instalacion_hist, sellos, origen_obra)
               values ($1, 'al3d', $2, $3, $4, $5, $6, $7, $8, 'Juan', 'Tacos', $9, $10, $11::text[], $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb,
                       (select obra from interno.partir_origen($23::jsonb)))`;
  const sinOrigen = `insert into public.proyectos (id, empresa_id, folio_hoja, folio_global, folio_local, dispositivo, fuente, historica, nombre, tel, etapa, tipo_trabajo,
                        fecha_anticipo, dir_texto, entrega, plazo_k, notas, estatus, iva, fecha_instalacion_hist, sellos)
                     values ($1, 'al3d', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb)`;
  const dinero = `insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta, fecha_liquidacion, pct_comision, precio_auth, origen_dinero)
                  values ($1, 'al3d', $2, $3, $4, $5, $6, 10, $7, $8::jsonb)`;
  const T = ['Letras 3D con iluminacion', 'Rotulacion de vinil'];
  await sql(db, prj, ['p1', 'V-001', 'COT-0001@K7QM', 'COT-0001', 'K7QM', 'cotizacion', false, 'Juan - Tacos (Caja de luz)', '33 1234 5678', 'cortado', T, '2026-10-01', 'Calle 1',
                      20.1, -103.1, 'instalacion', 2, 'mía', 'COBRANDO', true, null, JSON.stringify({ etapa: 100, notas: 100, tel: 100 }), JSON.stringify(ORIGEN_COMPLETO)]);
  await sql(db, sinOrigen, ['p2', 'V-002', 'COT-0002@K7QM', 'COT-0002', 'K7QM', 'cotizacion', false, 'Ana - Floreria', '', 'ganado', ['Rotulacion de vinil'], '2026-10-02', '', null, null, '', 'FABRICACION', false, null, '{}']);
  await sql(db, sinOrigen, ['p3', 'V-003', 'COT-0003@K7QM', 'COT-0003', 'K7QM', 'cotizacion', false, 'Luis - Taller', '33 9999 0000', 'armado', ['Recorte acrilico'], '2026-09-20', 'Calle 3', 'paqueteria', 4, '', 'REPARANDO', true, null, '{}']);
  await sql(db, sinOrigen, ['p4', 'V-004', null, 'V-004', '', 'manual', false, 'Mario - Cafe', '33 5555 1111', 'ganado', ['Letras 3D sin iluminacion'], '2026-10-05', '', 'recoleccion', null, '', 'FABRICACION', false, null, '{}']);
  await sql(db, sinOrigen, ['p6', 'V-005', null, 'V-005', 'hoja', 'hoja', true, 'Historica - Antigua', '', null, [], '2024-03-01', '', null, null, '', 'LIQUIDADO', false, '2024-03-20', '{}']);
  await sql(db, `insert into public.proyectos (id, empresa_id, folio_global, folio_local, dispositivo, fuente, nombre, etapa, tipo_trabajo, notas, sellos)
                 values ('p5', 'al3d', 'COT-0005@K7QM', 'COT-0005', 'K7QM', 'cotizacion', 'Pedro - No se dio', 'cancelado', '{}', 'No lo compró', '{"etapa": 50}')`);
  const din = (await sql(db, `select (interno.partir_origen($1::jsonb)).dinero as d`, [JSON.stringify(ORIGEN_COMPLETO)]))[0].d;
  await sql(db, dinero, ['p1', 10000, 5800, 0, 'Constru BNT', null, 6000, JSON.stringify(din)]);
  await sql(db, dinero, ['p2', 5000, 2000, 0, 'Elias BBVA', null, null, null]);
  await sql(db, dinero, ['p3', 8000, 3000, 0, 'Moni MPago', null, null, null]);
  await sql(db, dinero, ['p4', 1200, 600, 0, 'Elias BBVA', null, null, null]);
  await sql(db, dinero, ['p6', 3000, 1000, 2000, 'Constru BNT', '2024-03-20', null, null]);
  await sql(db, `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, hora, estado, uid_ics, ventana) values
                   ('i1', 'al3d', 'p1', interno.hoy_mx() + 5,  '09:30', 'confirmada', 'inst-i1@al3d.mx', 'dia'),
                   ('i2', 'al3d', 'p3', interno.hoy_mx() + 10, null,    'propuesta',  'inst-i2@al3d.mx', 'dia')`);
  await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe, fecha, nota, pago_id, tipo) values
                   ('al3d', 'V-001', 100, '2026-10-01', 'Reparto P-001', 'P-001', 'reparto'),
                   ('al3d', 'V-001',  50, '2026-10-03', 'a mano', null, 'abono'),
                   ('al3d', 'V-002', 200, '2026-10-04', 'a mano', null, 'abono'),
                   ('al3d', 'V-003',  20, null, 'sin fecha', null, 'abono')`);
  await sql(db, `insert into public.contadores (empresa_id, clave, n) values ('al3d', 'V', 5), ('al3d', 'P', 1)`);
  return { p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4', p5: 'p5', p6: 'p6', i1: 'i1', i2: 'i2' };
}

/**
 * El almacén de la semilla (A.md §10), sembrado como SUPERUSUARIO sobre los proyectos de `sembrarProyectos`:
 *   materiales:      acr-3mm (lámina → m²), led-12v (metro), pegamento (unidad); los tres con sello 100 en cada campo
 *   requerimientos:  de p1 → acr-3mm 2.5 láminas (calculado), led-12v 10 metros (apartado), pegamento 0 unidades (calculado: «una línea en cero»);
 *                    de p3 → acr-3mm 1 lámina (calculado)
 *   movimientos:     6 (entradas, un conteo y una salida) con su costo en `almacen_costos` para el material acr-3mm y el movimiento m1
 */
export async function sembrarAlmacen(db) {
  const mat = `insert into public.materiales (empresa_id, id, nombre, unidad_compra, unidad_consumo, factor, sellos)
               values ('al3d', $1, $2, $3, $4, $5, '{"nombre":100,"unidad_compra":100,"unidad_consumo":100,"factor":100}')`;
  await sql(db, mat, ['acr-3mm', 'Acrílico 3 mm', 'lamina', 'm2', 2.9768]);
  await sql(db, mat, ['led-12v', 'Tira LED 12 V', 'metro', 'm', 1]);
  await sql(db, mat, ['pegamento', 'Pegamento', 'unidad', 'pieza', 1]);
  const req = `insert into public.requerimientos (empresa_id, id, proyecto_id, material_id, cantidad_compra, unidad_compra, estado, sellos)
               values ('al3d', $1, $2, $3, $4, $5, $6, '{"estado":100,"cantidad_compra":100}')`;
  await sql(db, req, ['p1:acr-3mm', 'p1', 'acr-3mm', 2.5, 'lamina', 'calculado']);
  await sql(db, req, ['p1:led-12v', 'p1', 'led-12v', 10, 'metro', 'apartado']);
  await sql(db, req, ['p1:pegamento', 'p1', 'pegamento', 0, 'unidad', 'calculado']);
  await sql(db, req, ['p3:acr-3mm', 'p3', 'acr-3mm', 1, 'lamina', 'calculado']);
  const mov = `insert into public.almacen_movimientos (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, ts, usuario, rol) values ('al3d', $1, $2, $3, $4, $5, $6, $7, 'fab@al3d.test', 'fabricacion')`;
  await sql(db, mov, ['m1', 'acr-3mm', 'entrada', 10, 'lamina', 'compra', 1000]);
  await sql(db, mov, ['m2', 'led-12v', 'entrada', 50, 'metro', 'compra', 1001]);
  await sql(db, mov, ['m3', 'pegamento', 'entrada', 5, 'unidad', 'manual', 1002]);
  await sql(db, mov, ['m4', 'acr-3mm', 'salida', -1, 'lamina', 'manual', 2000]);
  await sql(db, mov, ['m5', 'led-12v', 'conteo', 45, 'metro', 'conteo', 2001]);
  await sql(db, mov, ['m6', 'pegamento', 'merma', -1, 'unidad', 'manual', 2002]);
  await sql(db, `insert into public.almacen_costos (empresa_id, material_id, importe, sello) values ('al3d', 'acr-3mm', 850.5, 100)`);
  await sql(db, `insert into public.almacen_costos (empresa_id, movimiento_id, importe, sello) values ('al3d', 'm1', 8505, 1000)`);
}

/** Base nueva con shim + TODAS las migraciones. Cada archivo de prueba la arma una vez (o la clona por prueba). */
export function crearBaseDePruebas(opciones = {}) {
  return crearBase({ migraciones: MIGRACIONES, ...opciones });
}

/** Una sesión como PostgREST para el usuario `u` (de `sembrarUsuarios`), con la cabecera de contrato puesta. */
export function sesionDe(db, u, extra = {}) {
  return como(db, { rol: 'authenticated', uid: u.uid, correo: u.correo, cabeceras: CAB, ...extra });
}

/** La misma sesión pero SIN cabecera de contrato (para probar CLIENTE_VIEJO). */
export function sesionSinContrato(db, u, extra = {}) {
  return como(db, { rol: 'authenticated', uid: u.uid, correo: u.correo, ...extra });
}

/** Llama a una RPC y devuelve directamente su valor jsonb (PostgREST lo entrega así). */
export async function llamar(sesion, funcion, args = {}, opciones) {
  const filas = await sesion.rpc(funcion, args, opciones);
  return filas[0][funcion];
}

/**
 * Una venta del libro, como SUPERUSUARIO: proyecto con folio + su fila de dinero (+ abonos). No pasa por ninguna RPC, así que no aplica el IVA
 * por cuenta ni gasta folios: lo que se escribe es lo que se pide.
 *   id, folio                    ids (por omisión 'v' + folio sin guion y el folio)
 *   sub, anti, liq, cuenta, iva, estatus   el dinero y su etiqueta (por omisión: 1000, 0, 0, sin cuenta, con IVA, COBRANDO)
 *   fuente, etapa, historica     de dónde viene y en qué etapa (por omisión 'hoja' y 'ganado')
 *   abonos                       importes de «Abonos comisión» (los negativos se guardan como corrección)
 * Devuelve el id.
 */
export async function crearVenta(db, o) {
  const folio = o.folio, id = o.id ?? 'v' + folio.slice(2);
  const c = { sub: 1000, iva: true, cuenta: null, estatus: 'COBRANDO', anti: 0, liq: 0, fuente: 'hoja', etapa: 'ganado', historica: false, abonos: [], ...o };
  await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, folio_local, dispositivo, fuente, historica, nombre, etapa, estatus, iva, folio_global, fecha_anticipo)
                 values ($1, $2, $3, $3, 'hoja', $4, $5, $6, $7, $8, $9, $10, interno.hoy_mx() - 30)`,
    [id, c.empresa ?? 'al3d', folio, c.fuente, c.historica, c.nombre ?? 'Proyecto ' + folio, c.historica ? null : c.etapa, c.estatus, c.iva, c.fuente === 'cotizacion' ? `COT-${folio}@K7QM` : null]);
  await sql(db, `insert into public.ventas_dinero (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta) values ($1, $2, $3::numeric, $4::numeric, $5::numeric, $6)`,
    [id, c.empresa ?? 'al3d', c.sub, c.anti, c.liq, c.cuenta]);
  for (const imp of c.abonos) {
    await sql(db, `insert into public.abonos (empresa_id, folio_hoja, importe, fecha, tipo) values ($1, $2, $3::numeric, interno.hoy_mx(), $4)`,
      [c.empresa ?? 'al3d', folio, imp, Number(imp) < 0 ? 'correccion' : 'abono']);
  }
  return id;
}

/** Lo mismo, dentro de una `transaccion()` (`t.rpc`): devuelve el valor jsonb de la RPC. */
export async function rpcT(t, funcion, args = {}) {
  const filas = await t.rpc(funcion, args);
  return filas[0][funcion];
}

/** La primera fila de una consulta como superusuario (para leer el estado de la base sin pasar por RLS). */
export async function una(db, consulta, params) {
  return (await sql(db, consulta, params))[0];
}

/** Cuántas filas ve la sesión en una tabla o vista de `public`. */
export async function contar(sesion, relacion, donde = 'true') {
  return (await sesion.query(`select count(*)::int as n from public.${relacion} where ${donde}`))[0].n;
}

/**
 * Corre `fn(db)` sobre una COPIA independiente de la base (0,4 s) y la cierra al terminar. Las pruebas que
 * confirman cambios (`confirmar: true`) usan esto para no contaminarse entre sí.
 */
export async function conCopia(plantilla, fn) {
  const base = await plantilla();
  const copia = await clonarBase(base);
  copia.u = base.u;           // los usuarios sembrados (y, si los hay, los datos `d`) viajan con la copia
  copia.d = base.d;
  try { return await fn(copia); } finally { await copia.close(); }
}

/** Texto de un error de Postgres sin importar de dónde venga (para comparar mensajes). */
export const mensajeDe = e => String(e?.message ?? e);

export { como, sql, crearUsuarioAuth, clonarBase };
