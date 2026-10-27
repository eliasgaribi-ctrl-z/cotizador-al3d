// MATERIAL EN MANTENIMIENTO DE VERDAD, con la base mandando (auditoría 2026-10-26, T1-7; 0031_material_en_mantenimiento.sql).
//
// Material está en mantenimiento (`MATERIAL_EN_MANTENIMIENTO = true` en js/datos/agenda.js, el interruptor único). Escondía la pantalla y
// los avisos, y el almacén se seguía moviendo solo: abrir «Qué atender» descontaba material a un día de la instalación, marcar «Cortado»
// preguntaba y descontaba, y con la base mandando todo eso va al libro COMPARTIDO. Además la base sacaba lo suyo: `mover_etapa` e
// `instalacion_guardar` emiten la salida del corte al cruzarlo (0006). Aquí, con el interruptor como está HOY y el teléfono de VERDAD
// (supabase/tests/comun/telefono.js: js/datos con su bandeja y su relevo, contra esta base), nada sale del almacén:
//
//   MM-01  marcar «Cortado»: el teléfono no encola ninguna salida ni toca la lista de compra; la etapa llega a la base, que tampoco
//          descuenta (oye la cabecera `x-al3d-material` que manda el relevo), y la línea sigue «calculado»
//   MM-02  una instalación «hecha» de un proyecto en «Ganado» (la base lo pasa a «Instalado» cruzando el corte): tampoco
//   MM-03  abrir «Qué atender» con una instalación mañana y material faltante: no se encola ningún movimiento, no sale ningún aviso de
//          material (ni «falta material», ni «bajo mínimo»), y el libro de la base sigue vacío
//   MM-04  la contraprueba de la base: lo que llega SIN la cabecera (un teléfono que todavía no se actualiza, otro cliente) descuenta como
//          siempre, y la derivada de la base también oye la cabecera
//
// Lo que corre el día que se encienda Material (una sola salida por corte) está al lado, en una-salida-por-corte.mjs.
import { describir, prueba, dato, igual, cierto, resumen } from '../arnes/marco.mjs';
import { crearBaseDePruebas, sembrarUsuarios, llamar, sesionDe, CAB, sql, una } from '../comun/semilla.js';
import { montarTelefono, relevoDe, requerimiento, materialDelCatalogo, bandeja } from '../comun/telefono.js';

const base = dato(async () => {
  const db = await crearBaseDePruebas();
  db.u = await sembrarUsuarios(db);
  await llamar(sesionDe(db, db.u.dir, { confirmar: true }), 'modo_cambiar', { p_modo: 'base' });
  return db;
}, { limpiar: db => db.close() });
/* La base ANTES que el teléfono: PGlite mira si hay `window` al arrancar, y el teléfono lo pone. */
await base();
const T = await montarTelefono({ rol: 'fabricacion' });
await T.DB.poner('materiales', materialDelCatalogo());
/* Uno con mínimo y sin existencia: con Material encendido es el aviso «bajo mínimo» (A9). */
await T.DB.poner('materiales', materialDelCatalogo({ id: 'led-mod-6500', nombre: 'Módulo LED 6500K', familia: 'led', unidad_consumo: 'pieza',
  unidad_compra: 'bolsa', medida: 'bolsa de 100', factor: 100, fraccionable: false, min_stock: 2 }));

const salidas = db => sql(db, `select id, proyecto_id, origen from public.almacen_movimientos where tipo = 'salida' order by id`);
const hoyISO = () => { const d = new Date(), p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const masDias = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(a, m - 1, d + n), p = v => String(v).padStart(2, '0');
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()); };

/* Una venta ganada en este teléfono (Dirección la da de alta; entra a la base con el id del teléfono) con su lista de compra calculada,
   como la deja `Proyectos.ganar` → `Material.recalcular`. Con Material en mantenimiento el cálculo sigue corriendo: no saca nada. */
async function ventaConMaterial(id, folio, cantidad = 2) {
  const p = { id, folio_global: folio + '@K7QM', folio_local: folio, dispositivo: 'K7QM', nombre: 'Venta ' + folio, contacto: 'Ana',
              negocio: 'Tacos El Güero', etapa: 'ganado', fecha_ganado: '2026-10-24', sub: 10000, anti_pactado: 5800, iva: true,
              sellos: {}, sync: 0, notion_page_id: null };
  await T.DB.poner('proyectos', p);
  await relevoDe(await base(), 'dir', T);
  await T.S.encolar({ tipo: 'crear', almacen: 'proyectos', registro_id: id, datos: p, campos: null });
  const r = requerimiento({ id: id + ':acr-3mm', proyecto_id: id, cantidad_compra: cantidad });
  await T.DB.poner('requerimientos', r);
  await T.S.encolar({ tipo: 'crear', almacen: 'requerimientos', registro_id: r.id, datos: r, campos: null });
  await T.S.bombear();
  igual(await bandeja(T), [], 'la venta y su lista de compra subieron');
  return p;
}

describir('MM-01 marcar «Cortado»', () => {
  prueba('el teléfono no encola ninguna salida; la base mueve la etapa y tampoco descuenta; la línea sigue «calculado»', async () => {
    const db = await base();
    cierto(T.Agenda.MATERIAL_EN_MANTENIMIENTO === true, 'el interruptor está como hoy');
    await ventaConMaterial('proy-mm01', 'COT-0201');
    const { c } = await relevoDe(db, 'fab', T);
    const r = await T.Proy.avanzarEtapa('proy-mm01', 'cortado');
    igual([r.ok, r.valor.movimientos], [true, 0], 'no salió nada del almacén del teléfono');
    igual(await bandeja(T), ['proyectos:actualizar:proy-mm01'], 'solo la etapa: ni la salida ni la línea «consumida»');
    igual((await T.DB.listar('movimientos')).length, 0, 'el libro del teléfono, vacío');
    igual((await T.DB.obtener('requerimientos', 'proy-mm01:acr-3mm')).estado, 'calculado');
    await T.S.bombear();
    igual(await bandeja(T), []);
    igual(await una(db, "select p.etapa, q.estado from public.proyectos p join public.requerimientos q on q.proyecto_id = p.id where p.id = 'proy-mm01'"),
      { etapa: 'cortado', estado: 'calculado' }, 'la etapa sí llegó; la línea no se marcó consumida');
    igual(await salidas(db), [], 'y el libro de la base no tiene ninguna salida');
    const i = c.llamadas.indexOf('mover_etapa');
    igual([i >= 0, c.cabeceras[i]], [true, { 'x-al3d-material': 'mantenimiento' }], 'mover_etapa salió con la cabecera de Material');
  });
});

describir('MM-02 una instalación «hecha» de un proyecto en «Ganado»', () => {
  prueba('la base lo pasa a «Instalado» (cruza el corte) y no descuenta', async () => {
    const db = await base();
    await ventaConMaterial('proy-mm02', 'COT-0202');
    /* Dirección la agenda y la marca hecha desde su teléfono (Fabricación también podría marcarla: Q-05). */
    T.guardado.al3d_pf_rol = 'direccion';
    await relevoDe(db, 'dir', T);
    const ag = await T.Agenda.agendar('proy-mm02', { fecha: masDias(hoyISO(), -1), hora: '10:00' });
    cierto(ag.ok, JSON.stringify(ag));
    await T.S.bombear();
    const m = await T.Agenda.marcar(ag.valor.id, 'hecha');
    cierto(m.ok, JSON.stringify(m));
    igual((await T.DB.obtener('proyectos', 'proy-mm02')).etapa, 'instalado', 'en el teléfono pasó a «Instalado»');
    cierto(!(await bandeja(T)).some(x => x.startsWith('movimientos:')), 'sin salidas en la bandeja: ' + JSON.stringify(await bandeja(T)));
    await T.S.bombear();
    igual(await bandeja(T), []);
    igual(await una(db, "select p.etapa, q.estado from public.proyectos p join public.requerimientos q on q.proyecto_id = p.id where p.id = 'proy-mm02'"),
      { etapa: 'instalado', estado: 'calculado' });
    igual(await salidas(db), []);
    T.guardado.al3d_pf_rol = 'fabricacion';
  });
});

describir('MM-03 abrir «Qué atender»', () => {
  prueba('con una instalación mañana y material faltante: ningún movimiento encolado, ningún aviso de material, la base sin salidas', async () => {
    const db = await base();
    const hoy = hoyISO();
    await ventaConMaterial('proy-mm03', 'COT-0203', 3);
    T.guardado.al3d_pf_rol = 'direccion';
    await relevoDe(db, 'dir', T);
    const ag = await T.Agenda.agendar('proy-mm03', { fecha: masDias(hoy, 1), hora: '09:00' });
    cierto(ag.ok, JSON.stringify(ag));
    await T.S.bombear();
    T.guardado.al3d_pf_rol = 'fabricacion';
    await relevoDe(db, 'fab', T);
    const avisos = await T.Reglas.refrescar({ hoy });
    igual(avisos.filter(a => /^A(8|9|13)_/.test(a.regla)).map(a => a.titulo), [], 'ni «falta material», ni «bajo mínimo», ni «constante desviada»');
    igual(await bandeja(T), [], 'abrir «Qué atender» no encoló nada');
    igual((await T.DB.listar('movimientos')).length, 0);
    igual((await T.Proy.emitirSalidasDerivadas(hoy)).valor, { proyectos: 0, movimientos: 0, sin_stock: 0, mantenimiento: true },
      'la degradación tampoco corre si alguien la llama directo');
    await T.S.bombear();
    igual(await salidas(db), []);
    igual((await una(db, "select estado from public.requerimientos where id = 'proy-mm03:acr-3mm'")).estado, 'calculado');
  });
});

describir('MM-04 la contraprueba de la base', () => {
  prueba('sin la cabecera (un teléfono que todavía no se actualiza) descuenta como siempre; la derivada de la base también la oye', async () => {
    const db = await base();
    await ventaConMaterial('proy-mm04', 'COT-0204');
    await ventaConMaterial('proy-mm05', 'COT-0205');
    const fab = sesionDe(db, db.u.fab, { confirmar: true });
    const conCab = fab.con({ cabeceras: { ...CAB, 'x-al3d-material': 'mantenimiento' } });
    const a = await llamar(conCab, 'mover_etapa', { p_proyecto: 'proy-mm04', p_etapa: 'cortado', p_sello: Date.now() });
    igual([a.ok, a.salidas], [true, 0], 'con la cabecera: la etapa sí, la salida no');
    const b = await llamar(fab, 'mover_etapa', { p_proyecto: 'proy-mm05', p_etapa: 'cortado', p_sello: Date.now() });
    igual([b.ok, b.salidas], [true, 1], 'sin la cabecera: la de siempre');
    igual((await salidas(db)).map(x => x.id), ['mov-salida:proy-mm05:acr-3mm']);
    /* La derivada de la base (`emitir_salidas_derivadas`, 0012): proy-mm04 se instala ayer y su línea sigue «calculado». */
    await sql(db, `insert into public.instalaciones (id, empresa_id, proyecto_id, fecha, ventana, duracion_min, estado, movida, uid_ics)
                   values ('inst-mm04', 'al3d', 'proy-mm04', interno.hoy_mx() - 1, 'dia', 180, 'confirmada', 0, 'inst-inst-mm04@al3d.mx')`);
    const d1 = await llamar(conCab, 'emitir_salidas_derivadas', {});
    igual([d1.ok, d1.movimientos, (await salidas(db)).length], [true, 0, 1], 'con la cabecera, la derivada no saca nada');
    /* Sin ella sale la de siempre, también para lo que las pruebas de arriba dejaron con instalación (por eso se mira solo proy-mm04). */
    const d2 = await llamar(fab, 'emitir_salidas_derivadas', {});
    igual([d2.ok, (await salidas(db)).filter(x => x.proyecto_id === 'proy-mm04').map(x => x.id + ' ' + x.origen)],
      [true, ['mov-salida:proy-mm04:acr-3mm derivado']], 'sin ella, la de siempre: ' + JSON.stringify(d2));
  });
});

await resumen();
