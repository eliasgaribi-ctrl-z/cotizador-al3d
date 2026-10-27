/* «SE GANÓ» UNA SOLA VEZ — auditoría 2026-10-26, T1-1 (crítico).
 *
 * Lo que pasaba: en un teléfono de Dirección que NO hizo la venta, con la base mandando, las cotizaciones que Pagos ya había
 * vendido desde SU cotizador salían como «autorizadas sin decidir» (Proyectos, Tablero, Calendario, «Qué atender», Control), y
 * «Se ganó» daba de alta otra venta con otro V-###. Dos huecos: la tarjeta que baja de la base nacía sin el folio de su
 * cotización (`desdeVentaDeHoja` lo dejaba vacío y la bajada lo borraba), y `ganar` buscaba con el aparato de ESTE teléfono.
 *
 * La prueba simula el aparato REAL de ese caso, no uno de mentiras con token:
 *   · un teléfono de Dirección (aparato D1R3) con el interruptor de Supabase encendido, la sesión de Google en la base y el modo
 *     'base' oído de `mi_acceso` (el de supa.js, no uno puesto a mano);
 *   · SIN historial local de esas ventas: ni proyectos, ni buzón; lo único que tiene es el historial de cotizaciones de la
 *     EMPRESA (lo que baja el cotizador con la base mandando), con cotizaciones hechas en el aparato de Pagos (P4G0);
 *   · la bajada de verdad (la bandeja de sync.js con el relevo de la base, `supa-relevo.desdeSupa`), contra una base de mentiras
 *     que contesta como 0028 (`ganar_proyecto`: el mismo folio global con otro id es DUPLICADO);
 *   · y cada pantalla con su propia lectura: Proyectos y el Calendario (`foliosDecididos`), el Tablero, Control (`unificar`) y
 *     «Qué atender» (`Reglas.evaluar`, la regla A6).
 * Y con la hoja mandando, lo de siempre: la carrera del buzón contra la bajada sigue dando la tarjeta de verdad y se junta.
 * Lo que la base de verdad contesta (PGlite): supabase/tests/obra-y-etapas/se-gano-una-vez.mjs. */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { idbConIndices } from './comun/base-de-mentiras.mjs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');

/* ── El teléfono de Dirección ─────────────────────────────────────────────────────────────── */
const DIR = 'D1R3', PAG = 'P4G0';
const ls = { al3d_pf_rol: 'direccion', al3d_pf_disp: DIR, al3d_pf_puente: JSON.stringify({ url: 'https://puente.test/exec', token: 'd'.repeat(40) }) };
globalThis.window = globalThis;
globalThis.IDBKeyRange = { only: v => ({ only: v }) };
globalThis.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
const red = [];
/* La hoja no se toca: con la base mandando, nada de lo que se prueba aquí le habla. */
globalThis.fetch = async url => { red.push(String(url)); throw new TypeError('Failed to fetch'); };
globalThis.document = { createElement: () => ({}), head: { appendChild() {} }, visibilityState: 'visible', addEventListener() {} };
const idb = idbConIndices();
globalThis.indexedDB = { open: (n, v) => idb.open(n, v), deleteDatabase: n => idb.deleteDatabase && idb.deleteDatabase(n) };
const setTimeoutReal = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => (Number(ms) >= 1000 ? 0 : setTimeoutReal(fn, ms, ...a));
globalThis.dispatchEvent = () => true;

const DB = await import('../js/datos/db.js');
const S = await import('../js/datos/sync.js');
const Supa = await import('../js/nucleo/supa.js');
const R = await import('../js/datos/supa-relevo.js');
const Proy = await import('../js/datos/proyectos.js');
const Cot = await import('../js/datos/cotizador.js');
const Ventas = await import('../js/datos/ventas.js');
const Reglas = await import('../js/datos/reglas.js');
const Puente = await import('../js/datos/puente.js');
await DB.abrir();

/* ── La base de mentiras: lo que la de verdad tiene después de que Pagos vendió desde su cotizador ─────────────── */
const MATRIZ = JSON.parse(/interno\.matriz_permisos\(\)[\s\S]*?select '(\{[\s\S]*?\})'::jsonb/.exec(leer('supabase/migrations/0028_auditoria_base.sql'))[1]);
const proyectoDeLaBase = o => ({ empresa_id: 'al3d', folio_global: null, estatus: 'FABRICACION', iva: true, tipo_trabajo: ['Letras 3D con iluminacion'],
  etapa: 'ganado', fecha_anticipo: '2026-09-01', fecha_instalacion_hist: null, dir_texto: '', lat: null, lng: null, maps_url: '', tel: '33 1000 0000',
  entrega: 'instalacion', notas: '', plazo_k: null, sellos: {}, deleted_at: null, etapa_vacia: null, ...o });
const dineroDe = (id, sub, anti) => ({ proyecto_id: id, empresa_id: 'al3d', d_cuenta: 'Constru BNT', g_subtotal: sub, h_neto: sub * 1.16, i_anticipo: anti,
  j_liquidacion: 0, k_saldo: sub * 1.16 - anti, r_comision: sub / 10, s_abonado: 0, t_restante: sub / 10, pct_comision: 10, n_fecha_liquidacion: null });
const base = {
  cuenta: { sesion: true, estado: 'activo', area: 'direccion', modo: 'base', correo: 'elias@al3d.mx' },
  tablas: {
    proyectos: [
      /* Pagos las vendió desde SU cotizador: la base las guardó con el aparato de Pagos. */
      proyectoDeLaBase({ id: 'proy-pag-1', folio_hoja: 'V-301', folio_global: 'COT-P0042@' + PAG, nombre: 'Rosa - Café (Letras)' }),                 // en el taller
      proyectoDeLaBase({ id: 'proy-pag-2', folio_hoja: 'V-302', folio_global: 'COT-P0043@' + PAG, nombre: 'Luis - Taller (Caja)', estatus: 'LIQUIDADO',
        etapa: 'instalado' }),                                                                                                             // ya cobrada
      /* Una venta sin cotización (alta_venta): sin folio de cotización, como siempre. */
      proyectoDeLaBase({ id: 'alta-1', folio_hoja: 'V-303', nombre: 'Mari - Estética' }),
    ],
    instalaciones: [], ventas_dinero: [], materiales: [], requerimientos: [], almacen_movimientos: [], almacen_costos: [], gastos: [],
    ventas_calculadas: [],
  },
  contador: 303,
  llamadas: [],
};
base.tablas.ventas_calculadas.push(dineroDe('proy-pag-1', 10000, 5800), dineroDe('proy-pag-2', 3000, 3480), dineroDe('alta-1', 2000, 1000));
const err = (codigo, mensaje, extra = {}) => ({ data: { ok: false, codigo, mensaje, ...extra } });
function rpcDeLaBase(n, a) {
  const c = base.cuenta;
  if (n === 'mi_acceso') {
    return { data: { ok: true, estado: c.estado, usuario: { correo: c.correo }, empresas: [{ empresa_id: 'al3d', area: c.area, estado: 'activo', modo: c.modo }],
      contrato: { actual: 1, minimo: 1 }, permisos: MATRIZ[c.area], modo: c.modo } };
  }
  const P = base.tablas.proyectos;
  if (n === 'ganar_proyecto') {
    /* La regla de 0028: el mismo folio global con OTRO id es DUPLICADO (no se da de alta otra); el reintento del mismo id, «ya existía». */
    const o = a.p_op;
    const ya = P.find(p => p.folio_global === o.folio_global);
    if (ya) return ya.id === o.id ? { data: { ok: true, ya_existia: true, proyecto_id: ya.id, folio_hoja: ya.folio_hoja } }
      : err('DUPLICADO', 'Esa cotización ya es otro proyecto.', { proyecto_id: ya.id });
    const folio = 'V-' + String(++base.contador).padStart(3, '0');
    P.push(proyectoDeLaBase({ id: o.id, folio_hoja: folio, folio_global: o.folio_global, nombre: o.nombre }));
    base.tablas.ventas_calculadas.push(dineroDe(o.id, o.venta.sub, o.venta.anti));
    return { data: { ok: true, proyecto_id: o.id, folio_hoja: folio } };
  }
  if (n === 'mover_etapa' || n === 'proyecto_actualizar' || n === 'corregir_venta' || n === 'instalacion_guardar') return { data: { ok: true, escritos: [], rechazadas: [] } };
  if (n === 'almacen_aplicar') return { data: { ok: true, resultados: (a.p_ops || []).map(o => ({ id: o.id, ok: true, creada: true })) } };
  return err('DESCONOCIDO', 'Función desconocida: ' + n);
}
function consulta(tabla) {
  const filtros = [];
  const filas = () => (base.tablas[tabla] || []).filter(r => filtros.every(f => f(r)));
  const q = {
    select() { return q; }, order() { return q; },
    eq(col, v) { filtros.push(r => r[col] === v); return q; },
    neq(col, v) { filtros.push(r => r[col] !== v); return q; },
    is(col, v) { filtros.push(r => (r[col] ?? null) === v); return q; },
    not(col, _op, v) { filtros.push(r => (col.includes('->') ? null : (r[col] ?? null)) !== v); return q; },
    gt(col, v) { filtros.push(r => Number(r[col]) > Number(v)); return q; },
    or(f) { const cs = f.split(',').map(x => { const [k] = x.split('.'); return [k, x.slice(k.length + 4)]; });
      filtros.push(r => cs.some(([k, v]) => String(r[k] ?? '') === v)); return q; },
    limit(nn) { return Promise.resolve({ data: filas().slice(0, nn).map(r => ({ ...r })), error: null }); },
    range(a, b) { return Promise.resolve({ data: filas().slice(a, b + 1).map(r => ({ ...r })), error: null }); },
  };
  return q;
}
const clienteFalso = {
  rpc: async (n, a) => { base.llamadas.push([n, JSON.parse(JSON.stringify(a || {}))]); return rpcDeLaBase(n, a || {}); },
  from: t => consulta(t),
  auth: { getSession: async () => ({ data: { session: base.cuenta.sesion ? { user: {} } : null } }) },
  channel() { const ch = { on() { return ch; }, subscribe(cb) { cb('SUBSCRIBED'); return ch; } }; return ch; },
  removeChannel() {},
};
globalThis.supabase = { createClient: () => clienteFalso };
const altas = () => base.llamadas.filter(([n]) => n === 'ganar_proyecto');

/* ── El historial de cotizaciones de la EMPRESA (lo que baja el cotizador con la base mandando) ─────────────── */
const HACE_30 = Date.now() - 30 * 86400000;
const partida = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8 };
const cotizacion = (folio, disp, o = {}) => ({ folio, disp, estado: 'autorizada', ts: HACE_30, cliente: 'Cliente ' + folio, proy: 'Negocio',
  tel: '33 2000 0000', iva: true, sub: 10000, neto: 11600, anti: 5800, items: [{ ...partida }], ...o });
ls.al3d_historial = JSON.stringify([
  cotizacion('COT-P0042', PAG),          // vendida por Pagos: V-301, en el taller
  cotizacion('COT-P0043', PAG),          // vendida por Pagos: V-302, ya LIQUIDADA (no es tarjeta aquí)
  cotizacion('COT-P0044', PAG),          // de Pagos, sin vender
  cotizacion('COT-D0010', DIR),          // de este teléfono, sin vender
]);
const e = folio => Cot.porFolio(folio);
const pendientes = async () => Cot.sinDecidir(await Proy.foliosDecididos(await DB.listar('proyectos')), 0).map(x => x.folio);

try {
  console.log('\nEL TELÉFONO: DIRECCIÓN CON LA BASE MANDANDO, SIN HISTORIAL LOCAL DE ESAS VENTAS');
  Supa.encender(true);
  await Supa.acceso();
  const relevo = R.desdeSupa(Supa);
  S.registrar(relevo);
  await relevo.salud();
  eq('la base manda en este aparato (lo dijo mi_acceso, como en producción)', [Supa.laBaseManda(), Reglas.laBaseManda(), S.estado().adaptador], [true, true, 'base']);
  eq('y no tiene ni proyectos ni buzón', [(await DB.listar('proyectos')).length, Cot.historial().length], [0, 4]);

  console.log('\nLA BAJADA DE LA BASE: LA TARJETA NACE CON EL FOLIO DE SU COTIZACIÓN');
  const j = await S.jalar();
  eq('baja de la base, sin hablarle a la hoja', [j.ok, red.length], [true, 0]);
  const t301 = await DB.obtener('proyectos', 'proy-hoja-V-301');
  eq('la venta de Pagos en el taller es tarjeta aquí, con el folio de la cotización de Pagos', [t301 && t301.de_hoja, t301 && t301.folio_global], [true, 'COT-P0042@' + PAG]);
  eq('la ya cobrada no es tarjeta (no está en la línea del taller): vive en el récord, con su folio', [await DB.obtener('proyectos', 'proy-hoja-V-302'),
    (await DB.obtener('ventas_hoja', 'hoja:V-302') || {}).folio_cotizacion], [null, 'COT-P0043@' + PAG]);
  eq('la venta sin cotización nace sin folio, como antes', (await DB.obtener('proyectos', 'proy-hoja-V-303') || {}).folio_global, '');

  console.log('\nNINGUNA PANTALLA LAS PIDE DECIDIR');
  const decididos = await Proy.foliosDecididos();
  cierto('lo decidido trae las dos de Pagos (la tarjeta y el récord)', decididos.has('COT-P0042@' + PAG) && decididos.has('COT-P0043@' + PAG));
  eq('Proyectos y el Calendario: solo las que nadie ha vendido', await pendientes(), ['COT-P0044', 'COT-D0010']);
  const proys = await DB.listar('proyectos');
  /* Control (y el asistente): el récord unido a los proyectos de aquí. */
  const union = Ventas.unificar(proys, await DB.listar('ventas_hoja'));
  eq('Control «Cotizaciones por cerrar»: las mismas', Cot.sinDecidir(new Set(union.ventas.map(p => p.folio_global).filter(Boolean))).map(x => x.folio),
    ['COT-P0044', 'COT-D0010']);
  eq('y cuenta cada venta UNA vez (V-301 atada a su tarjeta, V-302 y V-303 del récord)',
    union.ventas.map(v => v.folio_hoja).sort(), ['V-301', 'V-302', 'V-303']);
  const a6 = Reglas.evaluar({ proyectos: proys, historial: Cot.historial(), foliosDelLibro: [...decididos], hoy: new Date().toISOString().slice(0, 10),
    rol: 'direccion', veDinero: true, base: true }).filter(a => a.regla === Reglas.REGLAS.A6.id).map(a => a.entidad_id).sort();
  eq('«Qué atender» (A6): las mismas', a6, ['COT-D0010', 'COT-P0044']);
  const a6Refrescar = (await Reglas.refrescar()).filter(a => a.regla === Reglas.REGLAS.A6.id).map(a => a.entidad_id).sort();
  eq('y con su lectura de siempre (`refrescar`, la que corre al abrir)', a6Refrescar, ['COT-D0010', 'COT-P0044']);
  eq('el Tablero lee lo mismo (el mismo `foliosDecididos`)', /Cot\.sinDecidir\(await Proy\.foliosDecididos\(/.test(leer('js/mod/tablero.js')) &&
    /Cot\.sinDecidir\(await Proyectos\.foliosDecididos\(/.test(leer('js/mod/fabricacion.js')) &&
    /Cot\.sinDecidir\(await Proy\.foliosDecididos\(TODOS\), 0\)/.test(leer('js/mod/proyectos.js')), true);

  console.log('\n«SE GANÓ» SOBRE UNA YA VENDIDA NO DA DE ALTA OTRA');
  base.llamadas.length = 0;
  const antes = (await DB.listar('proyectos')).length;
  const g1 = await Proy.ganar(e('COT-P0042'), { tel: '33 2000 0000', entrega: 'instalacion' });
  eq('la del taller: DUPLICADO, «ya es la venta V-301»', [g1.ok, g1.codigo, g1.mensaje], [false, 'DUPLICADO', 'COT-P0042 ya es la venta V-301 («Rosa - Café (Letras)»). No se creó otra.']);
  const g2 = await Proy.ganar(e('COT-P0043'), { tel: '33 2000 0000', entrega: 'instalacion' });
  eq('la ya cobrada (solo está en el récord): DUPLICADO, «ya es la venta V-302»', [g2.ok, g2.codigo, /ya es la venta V-302/.test(g2.mensaje)], [false, 'DUPLICADO', true]);
  eq('ni una tarjeta nueva, ni una operación en la bandeja, ni una llamada a la base', [(await DB.listar('proyectos')).length - antes, (await S.pendientes()).length,
    (await S.bombear()).valor.subidas, altas().length], [0, 0, 0, 0]);
  const d1 = await Proy.descartar(e('COT-P0042'), 'no contestó');
  eq('«No se dio» tampoco la cancela (es una venta: se cancela desde su ficha)', [d1.ok, d1.codigo, /ya es la venta V-301.*desde su ficha/.test(d1.mensaje),
    (await DB.obtener('proyectos', 'proy-hoja-V-301')).etapa], [false, 'DUPLICADO', true, 'ganado']);
  const d2 = await Proy.descartar('COT-P0043');
  eq('ni deja una lápida encima de la cobrada', [d2.ok, /V-302/.test(d2.mensaje), (await DB.listar('proyectos')).length - antes], [false, true, 0]);
  /* El recibo de «Registrar venta» del cotizador de este teléfono pregunta lo mismo (`estadoDeVenta` en js/mod/cotizador.js): la venta
     de una cotización de Pagos que aquí no es tarjeta la encuentra en el libro, y no deja otra constancia. */
  eq('el libro contesta por el folio global de la cotización (lo que pregunta el recibo del cotizador)',
    [((await Proy.ventaDelLibro(['COT-P0043@' + PAG])) || {}).folio_hoja, await Proy.ventaDelLibro(['COT-P0043@' + DIR])], ['V-302', null]);
  cierto('y el recibo lo usa cuando la venta no es tarjeta aquí',
    /if \(vivos\.length\) return \{ datos: datosDe\(vivos\[0\]\) \};[\s\S]*?v = await ventaDelLibro\(\[f\]\);[\s\S]*?return \{ folio: String\(v\.folio_hoja\)/.test(leer('js/mod/cotizador.js')));

  console.log('\n«SE GANÓ» DE UNA QUE NADIE HA VENDIDO: CON EL APARATO DE LA COTIZACIÓN');
  const g3 = await Proy.ganar(e('COT-P0044'), { tel: '33 2000 0000', entrega: 'instalacion' });
  eq('se da de alta con el folio global de la cotización de Pagos, no con el de este teléfono', [g3.ok, g3.valor && g3.valor.folio_global, g3.valor && g3.valor.dispositivo],
    [true, 'COT-P0044@' + PAG, PAG]);
  const b = await S.bombear();
  const alta = altas()[0];
  /* Sube el alta y, detrás, lo que `ganar` le calculó (la lista de material): lo que importa es que el alta es UNA y con qué folio. */
  eq('y la base la recibe UNA vez, con ESE folio (así la encuentra si ya existiera)', [b.valor.subidas > 0, altas().length, alta && alta[1].p_op.folio_global],
    [true, 1, 'COT-P0044@' + PAG]);
  cierto('con su V-### de la base de vuelta', /^V-\d+$/.test(String((await DB.obtener('proyectos', g3.valor.id)).notion_page_id)));
  eq('y deja de estar sin decidir', await pendientes(), ['COT-D0010']);
  const g4 = await Proy.ganar(e('COT-P0044'), { tel: '33 2000 0000', entrega: 'instalacion' });
  eq('un segundo «Se ganó»: DUPLICADO con su V-###', [g4.codigo, /ya está en la plataforma como «.*» \(V-\d+\)\./.test(g4.mensaje)], ['DUPLICADO', true]);

  console.log('\nLA RED DE SEGURIDAD MIRA TAMBIÉN LA LLAVE DE ANTES (la de este teléfono)');
  /* Una venta que este teléfono ganó ANTES del arreglo, con su propio aparato, sobre una cotización de Pagos. */
  ls.al3d_historial = JSON.stringify([...JSON.parse(ls.al3d_historial), cotizacion('COT-P0050', PAG)]);
  await DB.poner('proyectos', { ...(await DB.obtener('proyectos', g3.valor.id)), id: 'proy-viejo', folio_global: 'COT-P0050@' + DIR, folio_local: 'COT-P0050',
    notion_page_id: 'V-399', nombre: 'Vieja' });
  eq('no sale como sin decidir', (await pendientes()).includes('COT-P0050'), false);
  eq('y «Se ganó» no la vuelve a dar de alta con la llave buena', (await Proy.ganar(e('COT-P0050'), { tel: '33 2000 0000', entrega: 'instalacion' })).codigo, 'DUPLICADO');

  console.log('\nLA SIGUIENTE BAJADA: EL FOLIO SE COMPLETA, NUNCA SE PISA');
  /* Una tarjeta que bajó vacía con la versión de antes. */
  await DB.poner('proyectos', { ...(await DB.obtener('proyectos', 'proy-hoja-V-301')), folio_global: '' });
  /* Una importada con OTRO folio (una celda corregida a mano en la hoja, mientras la hoja mandaba). */
  base.tablas.proyectos.push(proyectoDeLaBase({ id: 'proy-pag-3', folio_hoja: 'V-304', folio_global: 'COT-P0045@' + PAG, nombre: 'Toño - Bar' }));
  base.tablas.ventas_calculadas.push(dineroDe('proy-pag-3', 5000, 2500));
  await S.jalar();
  const t304 = await DB.obtener('proyectos', 'proy-hoja-V-304');
  await DB.poner('proyectos', { ...t304, folio_global: 'COT-Z0001@ZZZZ' });
  const j2 = await S.jalar();
  eq('la que bajó vacía lo recibe', [j2.ok, (await DB.obtener('proyectos', 'proy-hoja-V-301')).folio_global], [true, 'COT-P0042@' + PAG]);
  eq('la que tiene otro, se queda con el suyo', (await DB.obtener('proyectos', 'proy-hoja-V-304')).folio_global, 'COT-Z0001@ZZZZ');
  eq('y la de este teléfono no cambia', (await DB.obtener('proyectos', g3.valor.id)).folio_global, 'COT-P0044@' + PAG);
  cierto('las dos cotizaciones de la que difiere quedan decididas (ninguna se puede volver a ganar)',
    (await Proy.foliosDecididos()).has('COT-P0045@' + PAG) && (await Proy.foliosDecididos()).has('COT-Z0001@ZZZZ'));

  console.log('\nEL BUZÓN CON LA BASE MANDANDO: SI EL LIBRO YA LA TIENE, NO HAY OTRA');
  /* El cotizador de Dirección registró una cotización de Pagos que Pagos ya había vendido. */
  ls.al3d_pf_ganadas = JSON.stringify([{ folio: 'COT-P0043', disp: PAG, cuenta: 'Constru BNT', estatus: 'FABRICACION', sub: 10000, neto: 11600, anti: 5800, ts: Date.now() }]);
  const antesB = (await DB.listar('proyectos')).length;
  eq('se cuenta como repetida y sale del buzón; ni tarjeta ni alta', [await Cot.drenarBuzon(), (await DB.listar('proyectos')).length - antesB,
    JSON.parse(ls.al3d_pf_ganadas || '[]').length], [{ creados: 0, repetidos: 1, fallidos: 0 }, 0, 0]);

  console.log('\nCON LA HOJA MANDANDO, LO DE SIEMPRE');
  Supa.guardarModo({ estado: 'activo', modo: 'hoja', area: 'direccion' });
  eq('la hoja manda', [Supa.laBaseManda(), Reglas.laBaseManda()], [false, false]);
  const { ventaDeHoja } = Puente;
  const fila = (fh, fc, o = {}) => ({ id_notion: fh, [Puente.P.proyecto]: 'Pepe - Tienda', [Puente.P.folio]: fc, [Puente.P.estatus]: 'FABRICACION', ...o });
  eq('la tarjeta importada de una fila con «Folio cotizacion» trae ese folio', Proy.desdeVentaDeHoja(ventaDeHoja(fila('V-400', 'COT-D0011@' + DIR))).folio_global, 'COT-D0011@' + DIR);
  eq('la huella del defecto (la fila con su propio V-###) y un V-### suelto no son folio de cotización',
    [Proy.desdeVentaDeHoja(ventaDeHoja(fila('V-401', 'V-401'))).folio_global, Proy.desdeVentaDeHoja(ventaDeHoja(fila('V-402', 'V-100'))).folio_global], ['', '']);
  /* La carrera: el cotizador de ESTE teléfono escribió la fila en la hoja y dejó la constancia; la bajada la importó antes de que el
     buzón la convirtiera. La tarjeta de verdad (con sus partidas) nace igual y la revisión junta las dos. */
  ls.al3d_historial = JSON.stringify([...JSON.parse(ls.al3d_historial), cotizacion('COT-D0011', DIR)]);
  const vh = ventaDeHoja(fila('V-400', 'COT-D0011@' + DIR, { [Puente.P.tel]: '33 2000 0000' }));
  await DB.poner('ventas_hoja', { ...vh, actualizado_en: Date.now() });
  await DB.poner('proyectos', Proy.desdeVentaDeHoja(vh));
  ls.al3d_pf_ganadas = JSON.stringify([{ folio: 'COT-D0011', disp: DIR, cuenta: 'Constru BNT', estatus: 'FABRICACION', sub: 10000, neto: 11600, anti: 5800, ts: Date.now() }]);
  eq('el buzón SÍ convierte la venta aunque la copia importada ya traiga su folio', await Cot.drenarBuzon(), { creados: 1, repetidos: 0, fallidos: 0 });
  const reales = (await DB.listar('proyectos')).filter(p => p.folio_global === 'COT-D0011@' + DIR);
  eq('un momento hay dos (la de verdad y la copia)', reales.map(p => !!p.de_hoja).sort(), [false, true]);
  const rv = await Proy.revisarContraLaHoja({ folios: new Set(['V-400']), completa: true });
  eq('y la revisión de la bajada las junta: queda la de verdad', [rv.ok, (await DB.listar('proyectos')).filter(p => p.folio_global === 'COT-D0011@' + DIR).map(p => !!p.de_hoja)],
    [true, [false]]);
  /* Un «Se ganó» A MANO de una cotización que el libro ya tiene, con la hoja mandando: tampoco (el alta caería sobre la fila de la hoja
     con los importes de la cotización y pisaría lo que Pagos corrigió allá). */
  ls.al3d_historial = JSON.stringify([...JSON.parse(ls.al3d_historial), cotizacion('COT-D0012', DIR)]);
  await DB.poner('ventas_hoja', { ...ventaDeHoja(fila('V-405', 'COT-D0012@' + DIR, { [Puente.P.estatus]: 'LIQUIDADO' })), actualizado_en: Date.now() });
  const g5 = await Proy.ganar(e('COT-D0012'), { tel: '33 2000 0000', entrega: 'instalacion' });
  eq('«Se ganó» a mano de una que ya está en la hoja: «ya es la venta V-405»', [g5.codigo, /ya es la venta V-405/.test(g5.mensaje)], ['DUPLICADO', true]);
} catch (x) {
  mal++;
  console.log('  FALLA la prueba tronó: ' + (x && x.stack || x));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
