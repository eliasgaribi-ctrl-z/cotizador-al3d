// La PANTALLA DEL TALLER (0022, pedida por Elías el 2026-10-24): una TV que enseña las obras por etapa, sin dinero. Datos de mentiras.
//
//   PA-01  quién llama qué: anon nada; la app solo aprobar y revocar; la función (service_role) solo pedir y leer el tablero
//   PA-02  pedir un código: la forma, lo repetido, el tope de pantallas esperando y la limpieza de lo vencido hace más de un día
//   PA-03  aprobar: solo Dirección, con el código vigente (escrito como venga), queda en SU empresa, borra el código y lo anota
//   PA-04  el tablero de una pantalla activa: las cinco estaciones de SU empresa y nada más, sin un solo dato de dinero
//   PA-05  desconectar, quién ve la lista (y qué columnas), y la auditoría limpia
import { describir, prueba, dato, igual, cierto, esperarError, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sesionDe, como, sql, una, llamar, conCopia, crearVenta, ORIGEN_COMPLETO } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  return db;
}, { limpiar: db => db.close() });

const HUELLA = c => c.repeat(64);                       // una huella sha256 de mentiras ('a' × 64…)
const servicio = db => como(db, { rol: 'service_role', confirmar: true });
const pedir = (db, h, codigo) => llamar(servicio(db), 'pantalla_solicitar', { p_secreto_hash: h, p_codigo: codigo });
const tablero = (db, h) => llamar(servicio(db), 'pantalla_tablero', { p_secreto_hash: h });
const aprobar = (db, quien, codigo, nombre = 'TV del taller') =>
  llamar(sesionDe(db, db.u[quien], { confirmar: true }), 'pantalla_aprobar', { p_codigo: codigo, p_nombre: nombre });
const revocar = (db, quien, id) => llamar(sesionDe(db, db.u[quien], { confirmar: true }), 'pantalla_revocar', { p_id: id });

/** Una pantalla ya activa en al3d: devuelve su id. */
async function activa(db, h = HUELLA('a'), codigo = 'ABC234') {
  igual((await pedir(db, h, codigo)).ok, true, 'pedir');
  const r = await aprobar(db, 'dir', codigo);
  igual(r.ok, true, 'aprobar');
  return r.id;
}

describir('PA-01 quién llama qué', () => {
  prueba('anon no llama ninguna; la app no pide ni lee el tablero; la función no aprueba ni revoca', async () => conCopia(plantilla, async db => {
    const anon = como(db, { rol: 'anon' });
    for (const [f, a] of [['pantalla_solicitar', { p_secreto_hash: HUELLA('a'), p_codigo: 'ABC234' }], ['pantalla_tablero', { p_secreto_hash: HUELLA('a') }],
                          ['pantalla_aprobar', { p_codigo: 'ABC234' }], ['pantalla_revocar', { p_id: '00000000-0000-4000-8000-000000000000' }]]) {
      await esperarError(anon.rpc(f, a), '42501', 'anon: ' + f);
    }
    const dir = sesionDe(db, db.u.dir);
    await esperarError(dir.rpc('pantalla_solicitar', { p_secreto_hash: HUELLA('a'), p_codigo: 'ABC234' }), '42501', 'la app no pide códigos');
    await esperarError(dir.rpc('pantalla_tablero', { p_secreto_hash: HUELLA('a') }), '42501', 'la app no lee el tablero de una pantalla');
    const srv = como(db, { rol: 'service_role' });
    await esperarError(srv.rpc('pantalla_aprobar', { p_codigo: 'ABC234' }), '42501', 'la función no aprueba');
    await esperarError(srv.rpc('pantalla_revocar', { p_id: '00000000-0000-4000-8000-000000000000' }), '42501', 'la función no revoca');
  }));
});

describir('PA-02 pedir un código', () => {
  prueba('la forma, lo repetido y la espera', async () => conCopia(plantilla, async db => {
    igual((await pedir(db, 'corta', 'ABC234')).codigo, 'DATO_INVALIDO', 'una huella que no es sha256');
    igual((await pedir(db, HUELLA('a'), 'abc234')).codigo, 'DATO_INVALIDO', 'minúsculas: el código lo arma la función, ya en mayúsculas');
    igual((await pedir(db, HUELLA('a'), 'ABC10O')).codigo, 'DATO_INVALIDO', 'con 1, 0 u O, que se confunden en la TV');
    const r = await pedir(db, HUELLA('a'), 'ABC234');
    igual([r.ok, r.codigo], [true, 'ABC234']);
    igual((await pedir(db, HUELLA('a'), 'XYZ234')).codigo, 'DUPLICADO', 'la misma pantalla otra vez');
    igual((await pedir(db, HUELLA('b'), 'ABC234')).codigo, 'DUPLICADO', 'otra pantalla con un código que ya espera');
    const t = await tablero(db, HUELLA('a'));
    igual([t.ok, t.estado, t.codigo], [true, 'pendiente', 'ABC234'], 'esperando, enseña su código');
    cierto(!('obras' in t), 'sin aprobar no hay obras');
    await sql(db, `update public.pantallas set codigo_vence = now() - interval '1 minute' where secreto_hash = $1`, [HUELLA('a')]);
    igual((await tablero(db, HUELLA('a'))).estado, 'vencida', 'el código venció: la TV pide otro');
    igual((await tablero(db, HUELLA('9'))).codigo, 'NO_ENCONTRADO', 'una huella que nadie pidió');
  }));

  prueba('el tope de pantallas esperando y la limpieza de lo vencido hace más de un día', async () => conCopia(plantilla, async db => {
    const letras = 'ABCDEFGHJKMNPQRSTUVW';
    for (let i = 0; i < 20; i++) igual((await pedir(db, (i.toString(16) + 'f').padEnd(64, '0'), 'AAA' + letras[i] + '22')).ok, true, 'pantalla ' + i);
    igual((await pedir(db, HUELLA('e'), 'ZZZ234')).codigo, 'CUPO_AGOTADO', 'la 21 esperando no entra');
    await sql(db, `update public.pantallas set codigo_vence = now() - interval '2 days'`);
    igual((await pedir(db, HUELLA('e'), 'ZZZ234')).ok, true, 'vencidas no cuentan');
    igual((await una(db, `select count(*)::int as n from public.pantallas`)).n, 1, 'y las de hace más de un día se borraron');
  }));
});

describir('PA-03 aprobar', () => {
  prueba('solo Dirección, con el código vigente; queda en su empresa, sin código, y en la bitácora', async () => conCopia(plantilla, async db => {
    await pedir(db, HUELLA('a'), 'ABC234');
    for (const q of ['fab', 'pag']) igual((await aprobar(db, q, 'ABC234')).codigo, 'ROL_SIN_PERMISO', q);
    igual((await aprobar(db, 'ext', 'ABC234')).codigo, 'SIN_ACCESO', 'sin fila en miembros');
    igual((await aprobar(db, 'dir', 'ABC-23')).codigo, 'DATO_INVALIDO', 'cinco letras');
    igual((await aprobar(db, 'dir', 'XYZ234')).codigo, 'NO_ENCONTRADO', 'un código que nadie pidió');
    const r = await aprobar(db, 'dir', ' abc-234 ', '  Taller  ');
    igual([r.ok, r.nombre], [true, 'Taller'], 'como lo escriba la persona: minúsculas, guion, espacios');
    const f = await una(db, `select empresa_id, estado, codigo, codigo_vence, aprobada_por::text, nombre from public.pantallas where id = $1`, [r.id]);
    igual(f, { empresa_id: 'al3d', estado: 'activa', codigo: null, codigo_vence: null, aprobada_por: db.u.dir.uid, nombre: 'Taller' });
    igual((await aprobar(db, 'dir', 'ABC234')).codigo, 'NO_ENCONTRADO', 'el código ya no sirve una segunda vez');
    const b = await una(db, `select entidad, entidad_id, accion, nivel from public.bitacora where entidad_id = $1`, ['pantalla:' + r.id]);
    igual(b, { entidad: 'plataforma', entidad_id: 'pantalla:' + r.id, accion: 'alta', nivel: 'direccion' });
    await pedir(db, HUELLA('b'), 'DEF234');
    await sql(db, `update public.pantallas set codigo_vence = now() - interval '1 second' where secreto_hash = $1`, [HUELLA('b')]);
    igual((await aprobar(db, 'dir', 'DEF234')).codigo, 'NO_ENCONTRADO', 'vencido no se aprueba');
    igual((await aprobar(db, 'dir', 'DEF234', '')).codigo, 'NO_ENCONTRADO');
    await pedir(db, HUELLA('c'), 'GHJ234');
    igual((await aprobar(db, 'otra', 'GHJ234', '')).ok, true, 'Dirección de otra empresa aprueba la suya');
    igual((await una(db, `select empresa_id, nombre from public.pantallas where secreto_hash = $1`, [HUELLA('c')])), { empresa_id: 'otra', nombre: 'Pantalla del taller' }, 'sin nombre, el de siempre');
  }));
});

describir('PA-04 el tablero de una pantalla activa', () => {
  prueba('las cinco estaciones de su empresa, sus instalaciones vivas, las constantes y la última copia; ni un dato de dinero', async () => conCopia(plantilla, async db => {
    const h = HUELLA('a');
    await activa(db, h);
    // obras en las cinco estaciones, con dinero en su libro y con un origen COMPLETO (con precios) que la base parte
    const ids = {};
    for (const [i, etapa] of ['ganado', 'en_diseno', 'cortado', 'armado', 'listo', 'instalado', 'garantia', 'cancelado'].entries()) {
      ids[etapa] = await crearVenta(db, { folio: 'V-90' + i, etapa, sub: 25000, anti: 12500 });
    }
    await sql(db, `update public.proyectos set origen_obra = (select o.obra from interno.partir_origen($1::jsonb) o), negocio = 'Tacos El Güero',
                                               tipo_trabajo = array['Caja de luz con iluminacion'], plazo_k = 2
                    where id = $2`, [JSON.stringify(ORIGEN_COMPLETO), ids.armado]);
    const otra = await crearVenta(db, { folio: 'V-990', empresa: 'otra', etapa: 'armado' });
    const hist = await crearVenta(db, { folio: 'V-991', historica: true });
    const borrada = await crearVenta(db, { folio: 'V-992', etapa: 'cortado' });
    await sql(db, `update public.proyectos set deleted_at = now() where id = $1`, [borrada]);
    const inst = (id, proy, fecha, estado) => sql(db, `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, hora, estado, uid_ics)
                                                        values ($1, 'al3d', $2, interno.hoy_mx() + $3::int, '10:00', $4, 'inst-' || $1 || '@al3d.mx')`, [id, proy, fecha, estado]);
    await inst('i1', ids.listo, 3, 'confirmada');
    await inst('i2', ids.armado, 9, 'propuesta');
    await inst('i3', ids.armado, 5, 'cancelada');
    await sql(db, `insert into public.constantes (empresa_id, clave, valor) values ('al3d', 'PLAZO_COLCHON_DIAS', 1), ('al3d', 'PLAZO_PROVEEDOR_DIAS', 2), ('al3d', 'OTRA_COSA', 9)
                     on conflict (empresa_id, clave) do update set valor = excluded.valor`);
    await sql(db, `insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, rechazos, hecho_en, duracion_ms)
                   values ('al3d', true, true, 0, 0, 0, '2026-10-24T18:00:00Z', 2400), ('al3d', false, false, 3, 0, 0, '2026-10-24T21:00:00Z', 2100)`);

    const t = await tablero(db, h);
    igual([t.ok, t.estado, t.nombre], [true, 'activa', 'TV del taller']);
    igual(t.obras.map(o => o.etapa), ['ganado', 'en_diseno', 'cortado', 'armado', 'listo'], 'las cinco estaciones, ni instalado, ni garantía, ni cancelado');
    cierto(!t.obras.some(o => [otra, hist, borrada].includes(o.id)), 'ni otra empresa, ni históricas, ni borradas');
    const arm = t.obras.find(o => o.id === ids.armado);
    igual([arm.negocio, arm.tipo_trabajo, arm.plazo_k], ['Tacos El Güero', ['Caja de luz con iluminacion'], 2]);
    cierto(arm.origen && typeof arm.origen === 'object', 'el origen sin precios, para el plazo sugerido');
    igual(Object.keys(arm.origen).sort(), ['entrega', 'items', 'notaCliente', 'renders'], 'en producción: piezas, límite, nota y renders para su orden de trabajo, y nada del cliente');
    cierto(/^COT-/.test(arm.folio_global) || arm.folio_global === null, 'y su folio global (la carpeta de sus imágenes)');
    igual(Object.keys(t.obras.find(o => o.id === ids.listo).origen), ['items'], 'lista para instalar: solo las piezas, para el plazo');
    igual(t.instalaciones.map(i => [i.proyecto_id, i.estado]), [[ids.listo, 'confirmada'], [ids.armado, 'propuesta']], 'vivas y en orden de fecha; la cancelada no');
    igual(t.constantes, { PLAZO_COLCHON_DIAS: 1, PLAZO_PROVEEDOR_DIAS: 2 }, 'solo las dos del plazo');
    cierto(String(t.actualizado).startsWith('2026-10-24T18:00:00'), 'la última copia APLICADA, no la que falló después');
    // el punto de todo: nada de dinero
    igual((await una(db, `select interno.contiene_dinero($1::jsonb) as d`, [JSON.stringify(t)])).d, false, 'contiene_dinero no encuentra nada');
    const texto = JSON.stringify(t);
    for (const prohibido of ['25000', '12500', 'subtotal', 'anticipo', 'precio', 'estatus', 'COBRANDO', 'tel', 'dir_texto']) {
      cierto(!texto.includes(prohibido), 'no sale «' + prohibido + '»');
    }
  }));

  prueba('la última vez se escribe como mucho cada cinco minutos', async () => conCopia(plantilla, async db => {
    const id = await activa(db);
    await tablero(db, HUELLA('a'));
    const a = (await una(db, `select ultima_vez from public.pantallas where id = $1`, [id])).ultima_vez;
    cierto(a, 'se anotó');
    await tablero(db, HUELLA('a'));
    igual((await una(db, `select ultima_vez from public.pantallas where id = $1`, [id])).ultima_vez, a, 'un minuto después no se vuelve a escribir');
    await sql(db, `update public.pantallas set ultima_vez = now() - interval '6 minutes' where id = $1`, [id]);
    await tablero(db, HUELLA('a'));
    cierto((await una(db, `select ultima_vez > now() - interval '1 minute' as fresca from public.pantallas where id = $1`, [id])).fresca, 'pasados cinco, sí');
  }));
});

describir('PA-05 desconectar, la lista y la auditoría', () => {
  prueba('solo Dirección de SU empresa desconecta; la TV lo ve; la lista la ve Dirección y sin la huella; la auditoría sigue limpia', async () => conCopia(plantilla, async db => {
    const id = await activa(db);
    igual((await revocar(db, 'fab', id)).codigo, 'ROL_SIN_PERMISO');
    igual((await revocar(db, 'otra', id)).codigo, 'NO_ENCONTRADO', 'la de otra empresa no existe para ella');
    const dir = sesionDe(db, db.u.dir);
    igual((await dir.query(`select nombre, estado from public.pantallas`)), [{ nombre: 'TV del taller', estado: 'activa' }], 'Dirección ve la suya');
    await esperarError(dir.query(`select secreto_hash from public.pantallas`), '42501', 'la huella no se lee desde la app');
    await esperarError(dir.query(`select codigo from public.pantallas`), '42501', 'el código tampoco');
    await esperarError(dir.query(`update public.pantallas set nombre = 'x'`), '42501', 'nadie escribe directo');
    for (const q of ['fab', 'pag', 'otra']) igual((await sesionDe(db, db.u[q]).query(`select count(*)::int as n from public.pantallas`))[0].n, 0, q + ' no la ve');
    igual((await revocar(db, 'dir', id)).ok, true);
    igual((await revocar(db, 'dir', id)).sin_cambio, true, 'dos veces no pasa nada');
    igual((await tablero(db, HUELLA('a'))).estado, 'revocada', 'la TV lo ve en su siguiente vuelta');
    igual((await una(db, `select count(*)::int as n from public.bitacora where entidad_id = $1`, ['pantalla:' + id])).n, 2, 'alta y baja anotadas');
    igual((await una(db, `select interno.auditoria() as p`)).p, [], 'la auditoría de 0011 sigue limpia con 0022');
  }));
});

await resumen();
