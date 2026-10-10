// «Se ganó», «No se dio» y «Registrar nueva venta» — A.md §5.5 y casos PG-26, PG-27, PG-28, MT-01, MT-02, MT-06, MT-07, R1-11.
//
//   · `ganar_proyecto` y `descartar_cotizacion`: SOLO Dirección (los botones solo los pinta Dirección, pero el buzón los ejecuta en cualquier
//     teléfono: ahora decide la base); idempotentes por `id` y por `folio_global`; la entrada se PARTE (obra / dinero) en la base;
//   · `alta_venta`: Dirección y Pagos (el menú «Registrar nueva venta» de la hoja);
//   · el folio `V-###` sale de un contador que NUNCA reparte un número dos veces y que la lápida no consume.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, sembrarProyectos, sesionDe, rpcT, una, sql, conCopia, ORIGEN_COMPLETO } from '../comun/semilla.js';

const plantilla = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await sembrarProyectos(db);
  return db;
}, { limpiar: db => db.close() });

const AHORA = () => Date.now();
const GANAR = (extra = {}, venta = {}) => ({ p_op: {
  id: 'g1', folio_global: 'COT-0100@K7QM', folio_local: 'COT-0100', dispositivo: 'K7QM', entrada: ORIGEN_COMPLETO, nombre: 'Rosa - Tienda (Letras)', contacto: 'Rosa', negocio: 'Tienda',
  tel: '33 1111 2222', tipo_trabajo: ['Letras 3D con iluminacion'], fecha_anticipo: '2026-10-05', compromiso_texto: 'para fin de mes', dir_texto: 'Calle 5', entrecalles: 'A y B',
  maps_url: 'https://maps.app.goo.gl/x', lat: 20.6, lng: -103.3, geo_fuente: 'maps_pin', entrega: 'instalacion', plazo_k: 3, notas: 'una nota',
  venta: { sub: 10000, neto: 11600, anti: 5800, iva: true, cuenta: 'Constru BNT', estatus: 'COBRANDO', pct_comision: 10, precio_auth: 10000, ...venta },
  sellos: { etapa: AHORA(), tel: AHORA(), dir_texto: AHORA(), ubicacion: AHORA(), entrega: AHORA() }, ...extra } });
const ALTA = (extra = {}) => ({ p_op: { id: 'a1', nombre: 'Marta - Panadería', cuenta: 'Moni MPago', tipo_trabajo: ['Rotulacion de vinil'], subtotal: 4000, anticipo: 1000, tel: '33 2222 3333',
                                        entrega: 'paqueteria', sellos: { etapa: AHORA() }, ...extra } });
const dir = async fn => { const db = await plantilla(); return sesionDe(db, db.u.dir).transaccion(fn); };

describir('ganar_proyecto: crea el proyecto, la venta y el folio', () => {
  prueba('crea el proyecto en «ganado» con todo lo que trae, y la fila de dinero; devuelve proyecto_id y el siguiente V-###', async () => {
    const x = await dir(async t => {
      const r = await rpcT(t, 'ganar_proyecto', GANAR());
      return { r, p: (await t.query(`select * from public.proyectos where id = 'g1'`))[0], d: (await t.query(`select * from public.ventas_dinero where proyecto_id = 'g1'`))[0] };
    });
    igual([x.r.ok, x.r.proyecto_id, x.r.folio_hoja], [true, 'g1', 'V-006']);
    const p = x.p;
    igual([p.fuente, p.historica, p.etapa, p.folio_hoja, p.folio_global, p.folio_local, p.dispositivo, p.estatus, p.iva], ['cotizacion', false, 'ganado', 'V-006', 'COT-0100@K7QM', 'COT-0100', 'K7QM', 'COBRANDO', true]);
    igual([p.nombre, p.contacto, p.negocio, p.tel, p.tipo_trabajo, p.dir_texto, p.entrecalles, p.entrega, p.plazo_k, p.notas, p.lat, p.lng], ['Rosa - Tienda (Letras)', 'Rosa', 'Tienda', '33 1111 2222', ['Letras 3D con iluminacion'], 'Calle 5', 'A y B', 'instalacion', 3, 'una nota', 20.6, -103.3]);
    igual(p.creado_por, '00000000-0000-4000-8000-0000000000d1');
    igual(Object.keys(p.sellos).sort(), ['dir_texto', 'entrega', 'etapa', 'tel', 'ubicacion']);
    igual([String(x.d.subtotal), String(x.d.anticipo), String(x.d.liquidacion), x.d.cuenta, String(x.d.pct_comision), String(x.d.precio_auth)], ['10000', '5800', '0', 'Constru BNT', '10', '10000']);
  });
  prueba('la entrada se PARTE en la base: origen_obra sin precios, origen_dinero con ellos (y lo que mandó el modal en `venta`)', async () => {
    const x = await dir(async t => {
      await rpcT(t, 'ganar_proyecto', GANAR());
      return { p: (await t.query(`select origen_obra from public.proyectos where id = 'g1'`))[0], d: (await t.query(`select origen_dinero from public.ventas_dinero where proyecto_id = 'g1'`))[0] };
    });
    const claves = (v, acc = []) => { if (Array.isArray(v)) v.forEach(i => claves(i, acc)); else if (v && typeof v === 'object') for (const [k, i] of Object.entries(v)) { acc.push(k.toLowerCase()); claves(i, acc); } return acc; };
    for (const k of ['precioauth', 'tarifa', 'pu', '_lt', 'itemsauth', 'sello', 'neto']) cierto(!claves(x.p.origen_obra).includes(k), k + ' en la obra');
    igual([x.d.origen_dinero.precioAuth, x.d.origen_dinero.items['1'].tarifa, x.d.origen_dinero.venta], [6000, 3900, { sub: 10000, neto: 11600, anti: 5800, iva: true, precio_auth: 10000 }]);
  });
  prueba('un cliente que mande `entrada` SIN partir no puede filtrar precios a la obra (la base la parte siempre); sin entrada, la obra queda con items vacíos', async () => {
    const x = await dir(async t => {
      await rpcT(t, 'ganar_proyecto', GANAR({ id: 'g2', folio_global: 'COT-0101@K7QM', entrada: undefined }));
      return (await t.query(`select origen_obra from public.proyectos where id = 'g2'`))[0].origen_obra;
    });
    igual(x, { items: [] });
  });
  prueba('el folio sale del contador V y se reparte UNA vez: V-006 y V-007; reintentar el mismo «Se ganó» devuelve lo mismo y NO gasta folio (ya_existia)', async () => {
    const x = await dir(async t => {
      const a = await rpcT(t, 'ganar_proyecto', GANAR());
      const b = await rpcT(t, 'ganar_proyecto', GANAR({ id: 'g2', folio_global: 'COT-0101@K7QM' }));
      const a2 = await rpcT(t, 'ganar_proyecto', GANAR());
      const c = await rpcT(t, 'ganar_proyecto', GANAR({ id: 'g8', folio_global: 'COT-0108@K7QM' }));      // el siguiente folio NO se saltó ninguno
      return { a, b, a2, c };
    });
    igual([x.a.folio_hoja, x.b.folio_hoja, x.a2.ya_existia, x.a2.folio_hoja, x.c.folio_hoja], ['V-006', 'V-007', true, 'V-006', 'V-008']);
  });
  prueba('DUPLICADO: la misma cotización (folio_global) con OTRO id → DUPLICADO con el proyecto que ya existe; el mismo id con otra cotización → DATO_INVALIDO', async () => {
    const x = await dir(async t => {
      await rpcT(t, 'ganar_proyecto', GANAR());
      const dup = await rpcT(t, 'ganar_proyecto', GANAR({ id: 'g9' }));
      const idUsado = await rpcT(t, 'ganar_proyecto', GANAR({ folio_global: 'COT-0777@K7QM' }));
      return { dup, idUsado };
    });
    igual([x.dup.ok, x.dup.codigo, x.dup.definitivo, x.dup.proyecto_id], [false, 'DUPLICADO', true, 'g1']);
    igual([x.idUsado.codigo], ['DATO_INVALIDO']);
  });
  prueba('el IVA lo manda la cuenta: con Elias BBVA (no factura) el IVA queda en no aunque el modal lo mande en sí; con otra cuenta, en sí', async () => {
    const x = await dir(async t => {
      await rpcT(t, 'ganar_proyecto', GANAR({ id: 'g3', folio_global: 'COT-0103@K7QM' }, { cuenta: 'Elias BBVA', iva: true }));
      await rpcT(t, 'ganar_proyecto', GANAR({ id: 'g4', folio_global: 'COT-0104@K7QM' }, { cuenta: 'Rul HSBC', iva: false }));
      return (await t.query(`select id, iva from public.proyectos where id in ('g3', 'g4') order by id`));
    });
    igual(x.map(r => [r.id, r.iva]), [['g3', false], ['g4', true]]);
  });
  prueba('la venta ya LIQUIDADA desde el modal: liquidación = max(0, neto − anticipo); su IVA no se normaliza; con liquidación explícita manda esa', async () => {
    const x = await dir(async t => {
      await rpcT(t, 'ganar_proyecto', GANAR({ id: 'g5', folio_global: 'COT-0105@K7QM' }, { estatus: 'LIQUIDADO', cuenta: 'Elias BBVA', iva: true, anti: 5800, sub: 10000 }));
      await rpcT(t, 'ganar_proyecto', GANAR({ id: 'g6', folio_global: 'COT-0106@K7QM' }, { estatus: 'LIQUIDADO', anti: 20000, sub: 10000 }));
      await rpcT(t, 'ganar_proyecto', GANAR({ id: 'g7', folio_global: 'COT-0107@K7QM' }, { estatus: 'COBRANDO', liquidacion: 300, fecha_liquidacion: '2026-10-08' }));
      return (await t.query(`select p.id, p.iva, d.liquidacion::text as liq, d.fecha_liquidacion::text as fliq from public.proyectos p join public.ventas_dinero d on d.proyecto_id = p.id where p.id in ('g5','g6','g7') order by p.id`));
    });
    igual(x.map(r => [r.id, r.iva, r.liq, r.fliq]), [['g5', true, '5800.00', null], ['g6', true, '0', null], ['g7', true, '300', '2026-10-08']]);
  });
  prueba('con fecha_instalacion crea la cita «confirmada» con su UID, y sembra el sello de la cita si el cliente lo manda', async () => {
    const x = await dir(async t => {
      await rpcT(t, 'ganar_proyecto', GANAR({ fecha_instalacion: '2026-11-15', hora: '9:30', instalacion_id: 'inst-g1', sellos: { etapa: 100, instalacion: 120 } }));
      return { i: (await t.query(`select id, fecha::text as fecha, hora, estado, ventana, duracion_min, movida, uid_ics from public.instalaciones where proyecto_id = 'g1'`))[0],
               s: (await t.query(`select sellos from public.proyectos where id = 'g1'`))[0].sellos };
    });
    igual(x.i, { id: 'inst-g1', fecha: '2026-11-15', hora: '09:30', estado: 'confirmada', ventana: 'dia', duracion_min: 180, movida: 0, uid_ics: 'inst-inst-g1@al3d.mx' });
    igual(x.s, { etapa: 100, instalacion: 120 });
  });
  prueba('la bitácora: un hecho general SIN importes («Se ganó …») y uno de nivel dinero con el subtotal, el anticipo, la cuenta y el estatus', async () => {
    const x = await dir(async t => { await rpcT(t, 'ganar_proyecto', GANAR()); return t.query(`select nivel, titulo, despues from public.bitacora where accion = 'gano' order by nivel`); });
    igual(x.map(b => [b.nivel, b.titulo]), [['dinero', 'Venta ganada V-006'], ['general', 'Se ganó Rosa - Tienda (Letras)']]);
    igual([String(x[0].despues.subtotal), x[0].despues.cuenta, x[0].despues.estatus], ['10000', 'Constru BNT', 'COBRANDO']);
    cierto(!/\$|[0-9]+\.[0-9]{2}/.test(x[1].titulo + (x[1].detalle ?? '')), 'el hecho general no lleva importes');
  });
  prueba('valida TODO antes de escribir: id, folio sin aparato, nombre vacío, subtotal no numérico, cuenta desconocida, estatus desconocido, anticipo negativo, plazo 9, pin (0,0), tipo de trabajo ajeno', async () => {
    const x = await dir(async t => {
      const r = {};
      for (const [nombre, op] of [['id', GANAR({ id: 'con espacio' })], ['folio', GANAR({ folio_global: 'COT-1' })], ['nombre', GANAR({ nombre: '  ' })], ['sub', GANAR({}, { sub: 'mucho' })],
                                  ['cuenta', GANAR({}, { cuenta: 'Efectivo' })], ['estatus', GANAR({}, { estatus: 'PAGADO' })], ['anti', GANAR({}, { anti: -1 })], ['plazo', GANAR({ plazo_k: 9 })],
                                  ['pin', GANAR({ lat: 0, lng: 0 })], ['tipo', GANAR({ tipo_trabajo: ['Algo raro'] })], ['entrega', GANAR({ entrega: 'dron' })], ['pct', GANAR({}, { pct_comision: 101 })]]) {
        r[nombre] = await rpcT(t, 'ganar_proyecto', op);
      }
      return { r, n: (await t.query(`select count(*)::int as n from public.proyectos where id like 'g%' or id like 'con%'`))[0].n };
    });
    for (const [k, v] of Object.entries(x.r)) igual([k, v.ok, v.codigo, v.definitivo], [k, false, 'DATO_INVALIDO', true]);
    igual(x.n, 0, 'nada se escribió');
  });
  prueba('un teléfono que no es teléfono se descarta (queda vacío) en vez de tumbar el «Se ganó»', async () => {
    const x = await dir(async t => { await rpcT(t, 'ganar_proyecto', GANAR({ tel: 'sin teléfono' })); return (await t.query(`select tel from public.proyectos where id = 'g1'`))[0].tel; });
    igual(x, '');
  });
});

describir('R1-11, MT-01, MT-02, MT-06, MT-07 quién puede ganar y de qué empresa', () => {
  prueba('R1-11 Fabricación y Pagos: ganar_proyecto y descartar_cotizacion → ROL_SIN_PERMISO', async () => {
    const db = await plantilla();
    for (const quien of ['fab', 'pag']) {
      const S = sesionDe(db, db.u[quien]);
      igual((await S.rpc('ganar_proyecto', GANAR()))[0].ganar_proyecto.codigo, 'ROL_SIN_PERMISO', quien);
      igual((await S.rpc('descartar_cotizacion', { p_op: { id: 'l1', folio_global: 'COT-0300@K7QM' } }))[0].descartar_cotizacion.codigo, 'ROL_SIN_PERMISO', quien);
    }
  });
  prueba('MT-01 u_otra (Dirección en otra) con p_empresa = al3d: SIN_ACCESO; y sin p_empresa sus proyectos son de SU empresa', async () => {
    const db = await plantilla(), O = sesionDe(db, db.u.otra);
    const r = (await O.rpc('ganar_proyecto', { ...GANAR(), p_empresa: 'al3d' }))[0].ganar_proyecto;
    igual([r.ok, r.codigo, r.definitivo], [false, 'SIN_ACCESO', false]);
  });
  prueba('MT-02 u_multi: sin p_empresa → EMPRESA_REQUERIDA; con p_empresa = al3d funciona; con p_empresa = otra (es Fabricación ahí) → ROL_SIN_PERMISO', async () => {
    const db = await plantilla(), M = sesionDe(db, db.u.multi);
    const sin = (await M.rpc('ganar_proyecto', GANAR()))[0].ganar_proyecto;
    igual([sin.ok, sin.codigo, sin.definitivo], [false, 'EMPRESA_REQUERIDA', false]);
    const con = await M.transaccion(t => rpcT(t, 'ganar_proyecto', { ...GANAR(), p_empresa: 'al3d' }));
    igual(con.ok, true);
    igual((await M.rpc('ganar_proyecto', { ...GANAR(), p_empresa: 'otra' }))[0].ganar_proyecto.codigo, 'ROL_SIN_PERMISO');
  });
  prueba('MT-06 un empresa_id en la carga se IGNORA: la fila queda en la empresa del contexto', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.dir).transaccion(async t => {
      await rpcT(t, 'ganar_proyecto', GANAR({ empresa_id: 'otra' }));
      return (await t.query(`select empresa_id from public.proyectos where id = 'g1'`))[0].empresa_id;
    });
    igual(x, 'al3d');
  });
  prueba('MT-07 los contadores V de cada empresa son independientes: al3d da V-006 y otra da V-001', async () => {
    await conCopia(plantilla, async db => {
      const a = await sesionDe(db, db.u.dir).transaccion(t => rpcT(t, 'ganar_proyecto', GANAR()), { confirmar: true });
      const o = await sesionDe(db, db.u.otra).transaccion(t => rpcT(t, 'ganar_proyecto', GANAR({ id: 'go', folio_global: 'COT-0100@K7QM' })), { confirmar: true });
      igual([a.folio_hoja, o.folio_hoja], ['V-006', 'V-001']);
      igual((await sql(db, `select empresa_id, clave, n::int as n from public.contadores where clave = 'V' order by empresa_id`)), [{ empresa_id: 'al3d', clave: 'V', n: 6 }, { empresa_id: 'otra', clave: 'V', n: 1 }]);
    });
  });
  prueba('el mismo folio_global puede existir en DOS empresas (la llave es por empresa)', async () => {
    await conCopia(plantilla, async db => {
      await sesionDe(db, db.u.dir).transaccion(t => rpcT(t, 'ganar_proyecto', GANAR()), { confirmar: true });
      const o = await sesionDe(db, db.u.otra).transaccion(t => rpcT(t, 'ganar_proyecto', GANAR({ id: 'go' })), { confirmar: true });
      igual(o.ok, true);
    });
  });
});

describir('descartar_cotizacion: la lápida', () => {
  const LAPIDA = (extra = {}) => ({ p_op: { id: 'l1', folio_global: 'COT-0300@K7QM', folio_local: 'COT-0300', dispositivo: 'K7QM', entrada: ORIGEN_COMPLETO, nombre: 'Pedro - No compró', motivo: 'Lo pensó y se echó para atrás', sellos: { etapa: AHORA() }, ...extra } });
  prueba('crea la lápida: cotización cancelada SIN folio de hoja, SIN fila de dinero, con el motivo en notas y la obra sin precios', async () => {
    const x = await dir(async t => {
      const r = await rpcT(t, 'descartar_cotizacion', LAPIDA());
      return { r, p: (await t.query(`select fuente, etapa, folio_hoja, folio_global, notas, origen_obra, sellos, historica from public.proyectos where id = 'l1'`))[0],
               d: (await t.query(`select count(*)::int as n from public.ventas_dinero where proyecto_id = 'l1'`))[0].n, v: (await t.query(`select count(*)::int as n from public.ventas_calculadas where proyecto_id = 'l1'`))[0].n };
    });
    igual([x.r.ok, x.r.proyecto_id], [true, 'l1']);
    igual([x.p.fuente, x.p.etapa, x.p.folio_hoja, x.p.folio_global, x.p.notas, x.p.historica], ['cotizacion', 'cancelado', null, 'COT-0300@K7QM', 'Lo pensó y se echó para atrás', false]);
    igual([x.d, x.v], [0, 0]);
    cierto(!JSON.stringify(x.p.origen_obra).includes('precioAuth'), 'sin precios');
    igual(Object.keys(x.p.sellos), ['etapa']);
  });
  prueba('PG-28 crear, crear una lápida, crear otra: V-n, (la lápida NO consume folio), V-n+1', async () => {
    const x = await dir(async t => {
      const a = await rpcT(t, 'ganar_proyecto', GANAR());
      await rpcT(t, 'descartar_cotizacion', LAPIDA());
      const b = await rpcT(t, 'ganar_proyecto', GANAR({ id: 'g2', folio_global: 'COT-0101@K7QM' }));
      return [a.folio_hoja, b.folio_hoja];
    });
    igual(x, ['V-006', 'V-007']);
  });
  prueba('idempotente: la misma lápida otra vez es ok (ya_existia); si esa cotización ya es un proyecto, DUPLICADO; un id ya usado, DATO_INVALIDO', async () => {
    const x = await dir(async t => {
      await rpcT(t, 'descartar_cotizacion', LAPIDA());
      const otra = await rpcT(t, 'descartar_cotizacion', LAPIDA());
      const porProyecto = await rpcT(t, 'descartar_cotizacion', LAPIDA({ id: 'l2', folio_global: 'COT-0001@K7QM' }));
      const idUsado = await rpcT(t, 'descartar_cotizacion', LAPIDA({ id: 'p1', folio_global: 'COT-0999@K7QM' }));
      const otroId = await rpcT(t, 'descartar_cotizacion', LAPIDA({ id: 'l3' }));
      return { otra, porProyecto, idUsado, otroId };
    });
    igual([x.otra.ok, x.otra.ya_existia], [true, true]);
    igual([x.porProyecto.codigo, x.porProyecto.proyecto_id], ['DUPLICADO', 'p1']);
    igual(x.idUsado.codigo, 'DATO_INVALIDO');
    igual(x.otroId.codigo, 'DUPLICADO', 'la misma cotización con otro id de lápida');
  });
  prueba('sin nombre queda «Sin nombre»; valida el id y el folio', async () => {
    const x = await dir(async t => {
      await rpcT(t, 'descartar_cotizacion', LAPIDA({ nombre: '' }));
      const mal = await rpcT(t, 'descartar_cotizacion', LAPIDA({ id: 'con espacio' }));
      const malFolio = await rpcT(t, 'descartar_cotizacion', LAPIDA({ folio_global: 'COT-1' }));
      return { n: (await t.query(`select nombre from public.proyectos where id = 'l1'`))[0].nombre, mal, malFolio };
    });
    igual([x.n, x.mal.codigo, x.malFolio.codigo], ['Sin nombre', 'DATO_INVALIDO', 'DATO_INVALIDO']);
  });
});

describir('PG-26 y PG-27 alta_venta: el menú «Registrar nueva venta»', () => {
  prueba('PG-26 el IVA de la alta sale de la cuenta TAMBIÉN en una venta ya LIQUIDADA (a la que la normalización posterior no toca): Elias BBVA → sin IVA; las demás cuentas → con IVA', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const r = {};
      for (const [id, cuenta] of [['l1', 'Elias BBVA'], ['l2', 'Moni MPago'], ['l3', 'Constru BNT'], ['l4', 'Rul HSBC'], ['l5', 'Tatis BNT']]) {
        await rpcT(t, 'alta_venta', ALTA({ id, cuenta, estatus: 'LIQUIDADO' }));
        r[cuenta] = (await t.query(`select iva, estatus from public.proyectos where id = $1`, [id]))[0];
      }
      return r;
    });
    igual(Object.entries(x).map(([c, f]) => [c, f.iva, f.estatus]), [['Elias BBVA', false, 'LIQUIDADO'], ['Moni MPago', true, 'LIQUIDADO'], ['Constru BNT', true, 'LIQUIDADO'], ['Rul HSBC', true, 'LIQUIDADO'], ['Tatis BNT', true, 'LIQUIDADO']]);
  });
  prueba('PG-26 Pagos crea fuente «manual» + ventas_dinero + V-###; el IVA sale de la cuenta; la etapa nace «ganado»', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const a = await rpcT(t, 'alta_venta', ALTA());
      const b = await rpcT(t, 'alta_venta', ALTA({ id: 'a2', cuenta: 'Elias BBVA' }));
      return { a, b, p: (await t.query(`select id, fuente, historica, etapa, folio_hoja, folio_local, dispositivo, iva, estatus, tel, entrega, tipo_trabajo, creado_por from public.proyectos where id in ('a1', 'a2') order by id`)),
               d: (await t.query(`select proyecto_id, subtotal::text as s, anticipo::text as a, cuenta, pct_comision::text as pct from public.ventas_dinero where proyecto_id in ('a1', 'a2') order by proyecto_id`)) };
    });
    igual([x.a.ok, x.a.proyecto_id, x.a.folio_hoja, x.b.folio_hoja], [true, 'a1', 'V-006', 'V-007']);
    igual(x.p.map(r => [r.id, r.fuente, r.historica, r.etapa, r.folio_hoja, r.folio_local, r.dispositivo, r.iva, r.estatus]),
          [['a1', 'manual', false, 'ganado', 'V-006', 'V-006', '', true, 'FABRICACION'], ['a2', 'manual', false, 'ganado', 'V-007', 'V-007', '', false, 'FABRICACION']]);
    igual(x.d.map(r => [r.proyecto_id, r.s, r.a, r.cuenta, r.pct]), [['a1', '4000', '1000', 'Moni MPago', '10'], ['a2', '4000', '1000', 'Elias BBVA', '10']]);
    igual([x.p[0].tel, x.p[0].entrega, x.p[0].tipo_trabajo, x.p[0].creado_por], ['33 2222 3333', 'paqueteria', ['Rotulacion de vinil'], '00000000-0000-4000-8000-0000000000a1']);
  });
  prueba('PG-26 Dirección también puede; Fabricación → ROL_SIN_PERMISO', async () => {
    const db = await plantilla();
    igual((await sesionDe(db, db.u.dir).rpc('alta_venta', ALTA()))[0].alta_venta.ok, true);
    const f = (await sesionDe(db, db.u.fab).rpc('alta_venta', ALTA()))[0].alta_venta;
    igual([f.ok, f.codigo, f.definitivo], [false, 'ROL_SIN_PERMISO', true]);
  });
  prueba('PG-26 sin entrega, con teléfono de menos de 10 dígitos, sin cuenta, con cuenta ajena, subtotal no numérico, anticipo negativo o estatus raro → DATO_INVALIDO', async () => {
    const db = await plantilla(), P = sesionDe(db, db.u.pag);
    for (const [nombre, extra] of [['entrega', { entrega: '' }], ['entrega ajena', { entrega: 'dron' }], ['tel corto', { tel: '33 1234' }], ['sin tel', { tel: '' }], ['sin cuenta', { cuenta: null }], ['cuenta ajena', { cuenta: 'Efectivo' }],
                                  ['subtotal', { subtotal: 'x' }], ['anticipo', { anticipo: -5 }], ['estatus', { estatus: 'PAGADO' }], ['nombre', { nombre: '' }], ['tipo', { tipo_trabajo: ['Raro'] }], ['id', { id: 'con espacio' }]]) {
      const r = (await P.rpc('alta_venta', ALTA(extra)))[0].alta_venta;
      igual([nombre, r.ok, r.codigo], [nombre, false, 'DATO_INVALIDO']);
    }
  });
  prueba('alta_venta es idempotente por id: reintentarla devuelve el mismo proyecto y folio y NO gasta otro V-###', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      const a = await rpcT(t, 'alta_venta', ALTA());
      const b = await rpcT(t, 'alta_venta', ALTA());
      const c = await rpcT(t, 'alta_venta', ALTA({ id: 'a9' }));      // el siguiente folio no se saltó ninguno
      return { a, b, c };
    });
    igual([x.b.ya_existia, x.b.folio_hoja, x.b.proyecto_id, x.c.folio_hoja], [true, x.a.folio_hoja, 'a1', 'V-007']);
  });
  prueba('PG-27 alta_venta con fecha_instalacion: la cita nace «confirmada» si la da Dirección y «propuesta» si la da Pagos', async () => {
    const db = await plantilla();
    for (const [quien, estado] of [['dir', 'confirmada'], ['pag', 'propuesta']]) {
      const x = await sesionDe(db, db.u[quien]).transaccion(async t => {
        const r = await rpcT(t, 'alta_venta', ALTA({ fecha_instalacion: '2026-11-20', hora: '8:15' }));
        return { r, i: (await t.query(`select estado, fecha::text as fecha, hora, uid_ics, id from public.instalaciones where proyecto_id = 'a1'`))[0] };
      });
      igual([x.r.ok, x.i.estado, x.i.fecha, x.i.hora, x.i.uid_ics, x.i.id], [true, estado, '2026-11-20', '08:15', 'inst-inst-a1@al3d.mx', 'inst-a1'], quien);
    }
  });
  prueba('alta_venta no es una cotización: sin folio_global ni origen; el dinero y la cuenta quedan en ventas_dinero; la bitácora lleva la parte de dinero aparte', async () => {
    const db = await plantilla();
    const x = await sesionDe(db, db.u.pag).transaccion(async t => {
      await rpcT(t, 'alta_venta', ALTA());
      return { p: (await t.query(`select folio_global, origen_obra from public.proyectos where id = 'a1'`))[0], b: await t.query(`select nivel from public.bitacora where entidad_id = 'a1' order by nivel`) };
    });
    igual([x.p.folio_global, x.p.origen_obra, x.b.map(b => b.nivel)], [null, null, ['dinero', 'general']]);
  });
});

await resumen();
