// El V-### de una venta nueva es el MISMO que le dio la hoja — migración 0015_folio_de_la_hoja.sql (Q-07, decidida por Elías el 2026-10-16).
//
//   · `ganar_proyecto` acepta `p_op.folio_hoja`: con el formato del libro (como lo escribe `interno.folio_texto`) y libre, la venta queda con
//     ESE folio y el contador no se gasta; mal escrito, DATO_INVALIDO; ocupado por otro proyecto, DATO_INVALIDO con causa «folio_ocupado»
//     (definitivo: la sombra lo aparta con su motivo). Sin `folio_hoja`, como siempre (ver ganar-y-alta.mjs).
//   · el contador V nunca queda por debajo del folio más alto: lo sube un trigger en `proyectos`, venga el folio de donde venga.
// La semilla deja V-001 … V-005 y el contador V en 5.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, llamar, una, sql, conCopia, como, conLaBaseMandando, ORIGEN_COMPLETO } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  return db;
}, { limpiar: db => db.close() });

const rpc = (db, quien, nombre, args) => llamar(sesionDe(db, db.u[quien], { confirmar: true }), nombre, args);
const GANAR = (n, extra = {}) => ({ p_op: {
  id: 'g' + n, folio_global: 'COT-0' + n + '@K7QM', folio_local: 'COT-0' + n, dispositivo: 'K7QM', entrada: ORIGEN_COMPLETO, nombre: 'Venta ' + n,
  venta: { sub: 1000, anti: 500, iva: true, cuenta: 'Constru BNT' }, sellos: { etapa: Date.now() }, ...extra } });
const contadorV = async db => Number((await una(db, `select n from public.contadores where empresa_id = 'al3d' and clave = 'V' and ventana = ''`)).n);
const folioDe = async (db, id) => (await una(db, `select folio_hoja from public.proyectos where id = $1`, [id]))?.folio_hoja;

describir('ganar_proyecto con el folio de la hoja', () => {
  prueba('con folio_hoja libre: la venta queda con ESE V-###, el contador sube hasta él y la siguiente venta sin folio sigue después', () => conCopia(plantilla, async db => {
    const r = await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-042' }));
    igual([r.ok, r.proyecto_id, r.folio_hoja], [true, 'g100', 'V-042']);
    igual(await folioDe(db, 'g100'), 'V-042');
    igual(await contadorV(db), 42, 'el contador no quedó por debajo del folio que trajo la hoja');
    igual((await rpc(db, 'dir', 'ganar_proyecto', GANAR(101))).folio_hoja, 'V-043');
  }));
  prueba('un folio de la hoja MÁS BAJO que el contador entra tal cual y el contador no baja', () => conCopia(plantilla, async db => {
    await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-042' }));
    igual((await rpc(db, 'dir', 'ganar_proyecto', GANAR(101, { folio_hoja: 'V-010' }))).folio_hoja, 'V-010');
    igual(await contadorV(db), 42);
  }));
  prueba('V-1000 y V-1234567 (más de tres dígitos, hasta siete) se aceptan', () => conCopia(plantilla, async db => {
    igual((await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-1000' }))).folio_hoja, 'V-1000');
    igual((await rpc(db, 'dir', 'ganar_proyecto', GANAR(101, { folio_hoja: 'V-1234567' }))).folio_hoja, 'V-1234567');
    igual(await contadorV(db), 1234567);
  }));
  prueba('folio_hoja null o ausente: el del contador, como siempre (V-006)', () => conCopia(plantilla, async db => {
    igual((await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: null }))).folio_hoja, 'V-006');
  }));
  prueba('mal escrito (V-42, V-0042, v-042, V-12345678, «042», un número, vacío): DATO_INVALIDO definitivo; no se crea nada ni se gasta el contador', () => conCopia(plantilla, async db => {
    for (const malo of ['V-42', 'V-0042', 'v-042', 'V-12345678', '042', 42, '', ' V-042']) {
      const r = await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: malo }));
      igual([JSON.stringify(malo), r.ok, r.codigo, r.definitivo], [JSON.stringify(malo), false, 'DATO_INVALIDO', true]);
    }
    igual(await folioDe(db, 'g100'), undefined);
    igual(await contadorV(db), 5);
  }));
  prueba('ocupado (V-003 ya es de p3): DATO_INVALIDO definitivo con causa folio_ocupado, el folio y quién lo tiene; nada se crea y el contador no se gasta', () => conCopia(plantilla, async db => {
    const r = await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-003' }));
    igual([r.ok, r.codigo, r.definitivo, r.causa, r.folio_hoja, r.proyecto_id], [false, 'DATO_INVALIDO', true, 'folio_ocupado', 'V-003', 'p3']);
    cierto(/V-003/.test(r.mensaje) && /otro proyecto/.test(r.mensaje), r.mensaje);
    igual(await folioDe(db, 'g100'), undefined);
    igual((await una(db, `select count(*)::int as n from public.ventas_dinero where proyecto_id = 'g100'`)).n, 0);
    igual(await contadorV(db), 5);
  }));
  prueba('dos altas con el mismo folio de la hoja: la primera entra, la segunda choca (folio_ocupado)', () => conCopia(plantilla, async db => {
    igual((await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-050' }))).ok, true);
    igual((await rpc(db, 'dir', 'ganar_proyecto', GANAR(101, { folio_hoja: 'V-050' }))).causa, 'folio_ocupado');
  }));
  prueba('el reintento del mismo «Se ganó» sigue siendo ya_existia; si pide OTRO folio, lo dice (folio_hoja_pedido) sin cambiar nada', () => conCopia(plantilla, async db => {
    await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-042' }));
    const igualito = await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-042' }));
    igual([igualito.ya_existia, igualito.folio_hoja, 'folio_hoja_pedido' in igualito], [true, 'V-042', false]);
    const otro = await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-077' }));
    igual([otro.ok, otro.ya_existia, otro.folio_hoja, otro.folio_hoja_pedido], [true, true, 'V-042', 'V-077']);
    igual([await folioDe(db, 'g100'), await contadorV(db)], ['V-042', 42]);
  }));
  prueba('Fabricación con folio_hoja → ROL_SIN_PERMISO; Pagos (0028, CZ-1): con la hoja mandando DATO_INVALIDO definitivo, con la base mandando entra con ESE folio', () => conCopia(plantilla, async db => {
    igual((await rpc(db, 'fab', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-042' }))).codigo, 'ROL_SIN_PERMISO');
    const hoja = await rpc(db, 'pag', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-042' }));
    igual([hoja.codigo, hoja.definitivo], ['DATO_INVALIDO', true]);
    await conLaBaseMandando(db);
    igual((await rpc(db, 'pag', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-042' }))).folio_hoja, 'V-042');
  }));
});

describir('el contador V nunca por debajo del folio más alto', () => {
  prueba('una fila que el importador (service_role) mete directo con V-500 sube el contador; alta_venta reparte después V-501', () => conCopia(plantilla, async db => {
    await como(db, { rol: 'service_role', confirmar: true }).query(`insert into public.proyectos (id, empresa_id, folio_hoja, folio_local, dispositivo, fuente, historica, nombre, etapa, estatus)
                                                                    values ('imp500', 'al3d', 'V-500', 'V-500', 'hoja', 'hoja', false, 'Importada', 'ganado', 'COBRANDO')`);
    igual(await contadorV(db), 500);
    await conLaBaseMandando(db);                                       // 0026: alta_venta, solo con la base mandando
    const r = await rpc(db, 'dir', 'alta_venta', { p_op: { id: 'a1', nombre: 'Marta - Panadería', cuenta: 'Moni MPago', tipo_trabajo: ['Rotulacion de vinil'], subtotal: 4000, anticipo: 1000,
                                                          tel: '33 2222 3333', entrega: 'paqueteria', sellos: { etapa: Date.now() } } });
    igual([r.ok, r.folio_hoja], [true, 'V-501']);
  }));
  prueba('una lápida que se vuelve venta (folio_hoja de NULL a V-700, la fusión del importador) también lo sube; un folio menor no lo baja', () => conCopia(plantilla, async db => {
    await sql(db, `update public.proyectos set folio_hoja = 'V-700', etapa = 'ganado' where id = 'p5'`);
    igual(await contadorV(db), 700);
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, folio_local, dispositivo, fuente, historica, nombre, etapa, estatus)
                   values ('imp9', 'al3d', 'V-009', 'V-009', 'hoja', 'hoja', false, 'Baja', 'ganado', 'COBRANDO')`);
    igual(await contadorV(db), 700);
  }));
  prueba('subir al mismo número no toca la fila del contador (updated_at no se mueve: volver a aplicar no cambia datos)', () => conCopia(plantilla, async db => {
    await rpc(db, 'dir', 'ganar_proyecto', GANAR(100, { folio_hoja: 'V-042' }));
    const antes = (await una(db, `select updated_at::text as u from public.contadores where empresa_id = 'al3d' and clave = 'V'`)).u;
    await sql(db, `insert into public.proyectos (id, empresa_id, folio_hoja, folio_local, dispositivo, fuente, historica, nombre, etapa, estatus)
                   values ('imp42', 'al3d', 'V-041', 'V-041', 'hoja', 'hoja', false, 'Igual', 'ganado', 'COBRANDO')`);
    igual((await una(db, `select updated_at::text as u from public.contadores where empresa_id = 'al3d' and clave = 'V'`)).u, antes);
  }));
  prueba('la auditoría de 0011 sigue limpia con 0015 aplicada', async () => {
    igual((await una(await plantilla(), `select interno.auditoria() as p`)).p, []);
  });
});

await resumen();
