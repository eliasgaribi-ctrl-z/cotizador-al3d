/* LA TABLA DEL TALLER HASTA LIQUIDAR — auditoría 2026-10-26, T1-9, decidido por Elías.
 *
 * Lo que pidió, con sus palabras: «quiero que los proyectos que salen en fabricación se queden en la tabla hasta que pasen a
 * Liquidados; tengo proyectos que los instalo después de su fecha acordada y se quitan de la tabla». Eligió «Hasta liquidar, con
 * columna nueva». Y el mismo día: «Berna - Merlacsa (Rotulacion Vehicular), Omar - M3 Arquitectos y Proyectos, Gamaliel - Tacos
 * Taquería son proyectos con los que quedé mal con el cliente, entonces probablemente nunca me liquiden; por favor ponles un botón
 * para ocultar».
 *
 * La auditoría encontró que se escapaban fallas porque las pruebas usaban aparatos de mentiras con token. Ésta corre el APARATO DE
 * VERDAD de este caso: un teléfono con la base mandando (js/datos con su IndexedDB de mentiras, la bandeja de verdad —js/datos/sync.js—,
 * el relevo de la base de verdad —js/datos/supa-relevo.js con js/datos/supa-vivo.js y js/datos/supa-traductor.js— y las reglas de la
 * bajada de puente.js), contra un doble de supabase-js cuya base guarda filas en memoria. El doble contesta SOLO las columnas que se le
 * piden (como PostgREST): si la lectura de la base no pide `oculto_taller`, el teléfono no se entera. Lo que la base de verdad hace con
 * estas mismas llamadas lo prueba supabase/tests/obra-y-etapas/taller-hasta-liquidar.mjs (PGlite, 0029).
 *
 *   A · una venta del taller que pasa a COBRANDO sigue en su estación (antes, el teléfono la pasaba a «Instalado» y salía de la tabla)
 *   B · marcada instalada y en COBRANDO, sale en «Instalado, por cobrar»; con la cita marcada hecha, también
 *   C · al pasar a LIQUIDADO desaparece
 *   D · una instalación atrasada sin marcar sigue en «Lo que viene», arriba y marcada, hasta que se marca
 *   E · Dirección oculta; en otro teléfono que baja de la base, la obra ya no sale en el taller, ni en sus avisos, ni en el Calendario;
 *       Fabricación no ve el botón ni puede escribirlo; volver a mostrar la regresa; el saldo y el estatus no cambian
 *   F · una base que todavía no corre 0029 (sin la columna) no deja al teléfono sin bajar
 *   G · las pantallas usan lo que aquí se prueba (Tablero, Calendario, Proyectos, la hoja de estilos)
 *
 * Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── El teléfono ─────────────────────────────────────────────────────────────────────────── */
const URL_PUENTE = 'https://puente.test/exec';
const ls = { al3d_pf_rol: 'direccion', al3d_pf_disp: 'K7QM', al3d_pf_puente: JSON.stringify({ url: URL_PUENTE, token: 'd'.repeat(40) }) };
globalThis.window = globalThis;
globalThis.IDBKeyRange = { only: v => ({ only: v }) };
globalThis.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
/* Con la base mandando, nada va a la hoja: cualquier petición de red es una falla de esta prueba. */
const red = [];
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
const Vivo = await import('../js/datos/supa-vivo.js');
const Proy = await import('../js/datos/proyectos.js');
const Agenda = await import('../js/datos/agenda.js');
const Taller = await import('../js/datos/taller.js');
const Reglas = await import('../js/datos/reglas.js');
const { hoyISO, masDias } = await import('../js/nucleo/fechas.js');
await DB.abrir();

const HOY = hoyISO();
const AYER = masDias(HOY, -1);
/* Las mismas que «Ya pasó y nadie la marcó» del Calendario (js/mod/fabricacion.js). */
const VIVAS_SIN_MARCAR = ['propuesta', 'confirmada', 'reagendada'];

/* ── La base de mentiras y su cliente ────────────────────────────────────────────────────── */
/* La matriz de permisos de VERDAD, la vigente: la de 0029 (con «oculto_taller» en Dirección). */
const MATRIZ = JSON.parse(/interno\.matriz_permisos\(\)[\s\S]*?select '(\{[\s\S]*?\})'::jsonb/.exec(leer('supabase/migrations/0029_taller_hasta_liquidar.sql'))[1]);
const LINEA = ['ganado', 'en_diseno', 'cortado', 'armado', 'listo'];

const base = {
  cuenta: { sesion: true, estado: 'activo', area: 'direccion', modo: 'base', correo: 'elias@al3d.mx' },
  tablas: { proyectos: [], instalaciones: [], ventas_calculadas: [], ventas_dinero: [], materiales: [], requerimientos: [],
            almacen_movimientos: [], almacen_costos: [], gastos: [] },
  sinColumnaOculto: false,     // F: una base sin 0029
  llamadas: [], pedidas: [],
};
const err = (codigo, mensaje, extra = {}) => ({ data: { ok: false, codigo, mensaje: mensaje || codigo, ...extra } });
const proyecto = id => base.tablas.proyectos.find(p => p.id === id) || null;
const remoto = p => { const o = { ...p }; delete o.procedencia; return o; };

/** Una venta del taller como la tiene la base: la fila de `proyectos` y su renglón de `ventas_calculadas`. */
function venta(folio, nombre, etapa, o = {}) {
  const id = 'proy-hoja-' + folio;
  base.tablas.proyectos.push({ id, empresa_id: 'al3d', folio_hoja: folio, folio_global: null, fuente: 'hoja', historica: false, nombre,
    estatus: 'FABRICACION', iva: true, tipo_trabajo: ['Rotulacion de vinil'], etapa, fecha_anticipo: masDias(HOY, -20), fecha_instalacion_hist: null,
    dir_texto: 'Av. Vallarta 1', lat: 20.6736, lng: -103.344, maps_url: '', tel: '33 1000 0000', entrega: 'instalacion', notas: '', plazo_k: 3,
    sellos: {}, oculto_taller: false, deleted_at: null, procedencia: {}, ...o });
  base.tablas.ventas_calculadas.push({ proyecto_id: id, empresa_id: 'al3d', d_cuenta: 'Constru BNT', g_subtotal: 10000, h_neto: 11600, i_anticipo: 5000,
    j_liquidacion: 0, k_saldo: 6600, r_comision: 1000, s_abonado: 0, t_restante: 1000, pct_comision: 10, n_fecha_liquidacion: null });
  return id;
}
function cita(id, proyectoId, fecha, estado = 'confirmada') {
  base.tablas.instalaciones.push({ id, empresa_id: 'al3d', proyecto_id: proyectoId, fecha, hora: '10:00', ventana: 'dia', duracion_min: 180,
    estado, movida: 0, uid_ics: 'inst-' + id + '@al3d.mx', notas: '', updated_at: '2026-10-01T10:00:00Z', deleted_at: null });
}

/* Lo que hace la base con cada función, en lo que toca a este frente (lo demás, con su prueba en supabase/tests). */
function rpcDeLaBase(n, a) {
  const c = base.cuenta;
  if (n === 'mi_acceso') {
    return { data: { ok: true, estado: c.estado, usuario: { correo: c.correo },
      empresas: [{ empresa_id: 'al3d', area: c.area, estado: 'activo', modo: c.modo }],
      contrato: { actual: 1, minimo: 1 }, permisos: MATRIZ[c.area], modo: c.modo } };
  }
  if (n === 'proyecto_actualizar') {
    const p = proyecto(a.p_op.id); if (!p) return err('NO_ENCONTRADO', 'Ese proyecto no existe.');
    const deja = MATRIZ[c.area].proyecto_actualizar;
    const escritos = [], viejos = [], rechazadas = [];
    for (const [k, v] of Object.entries(a.p_op.campos)) {
      if (!deja.includes(k)) { rechazadas.push({ nombre: k, por: 'el rol ' + c.area + ' no puede escribir esta propiedad' }); continue; }
      if (k === 'oculto_taller') {
        /* 0029: sí o no, con su sello; gana el más reciente. */
        if (typeof v !== 'boolean') { rechazadas.push({ nombre: k, por: 'ocultar del taller es sí o no' }); continue; }
        const llega = Number(a.p_op.sellos && a.p_op.sellos.oculto_taller) || 0;
        const tiene = Number(p.sellos.oculto_taller) || 0;
        if (tiene > 0 && llega < tiene) { viejos.push({ nombre: k, por: 'ya tenía un cambio más reciente' }); continue; }
        p.oculto_taller = v;
        if (llega > 0) p.sellos = { ...p.sellos, oculto_taller: Math.max(tiene, llega) };
        escritos.push(k);
        continue;
      }
      p[k] = v; escritos.push(k);
    }
    return { data: { ok: true, escritos, viejos, rechazadas, remoto: remoto(p) } };
  }
  if (n === 'corregir_venta') {
    if (!['direccion', 'pagos'].includes(c.area)) return err('ROL_SIN_PERMISO', 'No tienes permiso para esto.');
    const p = proyecto(a.p_proyecto); if (!p) return err('NO_ENCONTRADO', 'Esa venta no existe en el libro.');
    if (a.p_cambios.estatus) {
      p.estatus = a.p_cambios.estatus;
      /* 0029 (`interno.etapa_por_cobro`): solo LIQUIDADO da por instalada una fila importada de la línea. */
      if (p.estatus === 'LIQUIDADO' && ['hoja', 'manual'].includes(p.fuente) && !p.historica && LINEA.includes(p.etapa)) {
        p.etapa = 'instalado'; p.sellos = { ...p.sellos, etapa: Date.now() };
      }
    }
    return { data: { ok: true, escritos: Object.keys(a.p_cambios), rechazadas: [] } };
  }
  if (n === 'mover_etapa') {
    const p = proyecto(a.p_proyecto); if (!p) return err('NO_ENCONTRADO', 'Ese proyecto no existe.');
    p.etapa = a.p_etapa; p.sellos = { ...p.sellos, etapa: Number(a.p_sello) || Date.now() };
    return { data: { ok: true, etapa: a.p_etapa, remoto: remoto(p) } };
  }
  if (n === 'instalacion_guardar') {
    const o = a.p_op;
    const p = proyecto(o.proyecto_id); if (!p) return err('NO_ENCONTRADO', 'Ese proyecto no existe.');
    let i = base.tablas.instalaciones.find(x => x.id === o.id);
    if (!i) { i = { id: o.id, empresa_id: 'al3d', proyecto_id: o.proyecto_id, movida: 0, uid_ics: 'inst-' + o.id + '@al3d.mx', notas: '', deleted_at: null }; base.tablas.instalaciones.push(i); }
    Object.assign(i, { fecha: o.fecha, hora: o.hora || null, ventana: o.ventana || 'dia', estado: o.estado || i.estado || 'propuesta',
      duracion_min: o.duracion_min || i.duracion_min || 180, updated_at: new Date().toISOString() });
    /* 0017: hecha ⇒ instalado. */
    if (i.estado === 'hecha' && LINEA.includes(p.etapa)) { p.etapa = 'instalado'; p.sellos = { ...p.sellos, etapa: Date.now() }; }
    return { data: { ok: true } };
  }
  return err('DESCONOCIDO', 'Función desconocida: ' + n);
}

/* Una consulta como PostgREST: los filtros, y SOLO las columnas que se piden (con su alias y la ruta de un json). */
function consulta(tabla) {
  base.pedidas.push(tabla);
  const filtros = [];
  let cols = null;
  const valor = (r, ruta) => ruta.split('->').reduce((x, k, i) => (i === 0 ? x[k] : (x && typeof x === 'object' ? x[k] : undefined)), r);
  const proyectar = r => {
    if (!cols || cols === '*') return { ...r };
    const o = {};
    for (const c of cols.split(',').map(x => x.trim()).filter(Boolean)) {
      const [alias, ruta] = c.includes(':') ? c.split(':') : [c, c];
      const v = valor(r, ruta);
      o[alias] = v === undefined ? null : v;
    }
    return o;
  };
  const filas = () => (base.tablas[tabla] || []).filter(r => filtros.every(f => f(r)));
  const responder = (a, b) => {
    if (tabla === 'proyectos' && base.sinColumnaOculto && /oculto_taller/.test(cols || '')) {
      return Promise.resolve({ data: null, error: { message: 'column proyectos.oculto_taller does not exist', code: '42703' } });
    }
    return Promise.resolve({ data: filas().slice(a, b + 1).map(proyectar), error: null });
  };
  const q = {
    select(c) { cols = c; return q; }, order() { return q; },
    eq(col, v) { filtros.push(r => r[col] === v); return q; },
    neq(col, v) { filtros.push(r => r[col] !== v); return q; },
    is(col, v) { filtros.push(r => (valor(r, col) ?? null) === v); return q; },
    not(col, _op, v) { filtros.push(r => (valor(r, col) ?? null) !== v); return q; },
    gt(col, v) { filtros.push(r => Number(r[col]) > Number(v)); return q; },
    range(a, b) { return responder(a, b); },
    limit(nn) { return responder(0, nn - 1); },
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
const llamadasDe = () => base.llamadas.filter(([n]) => n !== 'mi_acceso');

/* ── Lo que enseñan las pantallas, con las MISMAS lecturas que hacen ─────────────────────── */
/** «El taller» del Tablero (js/mod/tablero.js, `leer`). */
async function elTaller() {
  const [todos, insts] = await Promise.all([Proy.listar({}), Agenda.listar({ vivas: true })]);
  const vivos = (todos || []).filter(p => p && p.etapa !== 'cancelado');
  const instDe = new Map();
  for (const i of insts || []) if (i && i.proyecto_id && !instDe.has(i.proyecto_id)) instDe.set(i.proyecto_id, i);
  const t = Taller.tablaDelTaller(vivos, instDe, { hoy: HOY });
  const nombre = id => (vivos.find(p => p.id === id) || {}).nombre;
  const est = {};
  for (const e of Proy.ETAPAS) for (const v of t.estaciones) if (v.etapa_real === e) (est[e] = est[e] || []).push(nombre(v.proyecto_id));
  return { estaciones: est, porCobrar: t.porCobrar.map(x => x.titulo), ocultos: t.ocultos, cuenta: t.estaciones.length };
}
/** «Lo que viene» del Calendario (js/mod/fabricacion.js, `leer`, vista lista sin «Incluir lo que ya pasó»). */
async function loQueViene() {
  const vencidas = await Agenda.listar({ hasta: AYER, estados: VIVAS_SIN_MARCAR, conProyecto: true, sinObraInstalada: true, sinOcultos: true });
  const filas = Agenda.loQueViene(await Agenda.listar({ desde: HOY, conProyecto: true, sinOcultos: true }), vencidas);
  return filas.map(i => [i.titulo, i.fecha, !!i.atrasada]);
}
const local = id => DB.obtener('proyectos', id);

const B601 = venta('V-601', 'Berna - Merlacsa (Rotulacion Vehicular)', 'armado');
const O602 = venta('V-602', 'Omar - M3 Arquitectos y Proyectos', 'listo');
const G603 = venta('V-603', 'Gamaliel - Tacos Taquería', 'en_diseno');
const A604 = venta('V-604', 'Ana - Café Luna', 'listo');
const D605 = venta('V-605', 'Dental Mar - Letras', 'cortado');
cita('i601', B601, masDias(HOY, 3));
cita('i602', O602, masDias(HOY, -4));                 // la instalación acordada ya pasó y nadie la marcó
cita('i604', A604, masDias(HOY, -2), 'hecha');        // la cita está hecha y la obra se quedó en «Listo» (una fila de antes)
cita('i605', D605, masDias(HOY, 5));

try {
  console.log('\nEL TELÉFONO DE DIRECCIÓN, CON LA BASE MANDANDO');
  Supa.encender(true);
  await Supa.acceso();
  eq('la base manda en este aparato', Supa.laBaseManda(), true);
  const relevo = R.desdeSupa(Supa);
  S.registrar(relevo);
  const j0 = await S.jalar();
  eq('baja de la base (y no le pide nada a la hoja)', [j0.ok, red.length], [true, 0]);
  eq('las cinco ventas del taller entran como tarjetas', (await Proy.listar({ vivos: true })).map(p => p.id).sort(), [B601, O602, G603, A604, D605]);
  eq('«El taller»: cada obra en su estación; la de la cita hecha, en «Instalado, por cobrar»', await elTaller(), {
    estaciones: { en_diseno: ['Gamaliel - Tacos Taquería'], cortado: ['Dental Mar - Letras'], armado: ['Berna - Merlacsa (Rotulacion Vehicular)'], listo: ['Omar - M3 Arquitectos y Proyectos'] },
    porCobrar: ['Ana - Café Luna'], ocultos: 0, cuenta: 4 });

  console.log('\nA · COBRANDO YA NO SACA LA OBRA DE SU ESTACIÓN');
  {
    /* Pagos la pasa a cobrar desde su teléfono: la base la deja en «Armado» (0029) y este teléfono la baja. */
    proyecto(B601).estatus = 'COBRANDO';
    const j = await S.jalar();
    const p = await local(B601);
    eq('baja con su estatus nuevo y SIGUE en «Armado» (hasta el 2026-10-26 el teléfono la pasaba a «Instalado»)', [j.ok, p.estatus_notion, p.etapa], [true, 'COBRANDO', 'armado']);
    eq('y en «El taller» sigue en su estación, no en la columna nueva', (await elTaller()).estaciones.armado, ['Berna - Merlacsa (Rotulacion Vehicular)']);
    eq('la cuenta del encabezado la sigue contando', (await elTaller()).cuenta, 4);
  }

  console.log('\nB · INSTALADA Y EN COBRANDO: «INSTALADO, POR COBRAR»');
  {
    base.llamadas.length = 0;
    const m = await Agenda.marcar('i601', 'hecha');
    eq('Dirección marca «Ya se instaló» en su teléfono', [m.ok, (await local(B601)).etapa], [true, 'instalado']);
    const b = await S.bombear();
    eq('sube a la base: la cita y la etapa', [b.valor.fallidas, llamadasDe().map(x => x[0]).sort()], [0, ['instalacion_guardar', 'mover_etapa']]);
    await S.jalar();
    const t = await elTaller();
    eq('sale de las estaciones y entra a «Instalado, por cobrar» (con la de la cita hecha)', [t.estaciones.armado || [], t.porCobrar],
      [[], ['Ana - Café Luna', 'Berna - Merlacsa (Rotulacion Vehicular)']]);
    eq('la cuenta del encabezado es la de las estaciones (lo instalado por cobrar tiene su número en su columna)', t.cuenta, 3);
    const fila = Taller.tablaDelTaller([await local(B601)], new Map([[B601, (await Agenda.listar({ proyecto_id: B601 }))[0]]]), { hoy: HOY }).porCobrar[0];
    eq('cada ficha sabe cuándo se instaló y su estatus', [fila.instalado_el, fila.estatus], [masDias(HOY, 3), 'COBRANDO']);
  }

  console.log('\nC · AL PASAR A LIQUIDADO, DESAPARECE');
  {
    proyecto(B601).estatus = 'LIQUIDADO';
    await S.jalar();
    eq('Berna liquidada: fuera de la columna nueva y de las estaciones', await elTaller(), {
      estaciones: { en_diseno: ['Gamaliel - Tacos Taquería'], cortado: ['Dental Mar - Letras'], listo: ['Omar - M3 Arquitectos y Proyectos'] },
      porCobrar: ['Ana - Café Luna'], ocultos: 0, cuenta: 3 });
    /* La regla del teléfono para la tarjeta importada que se liquida estando en la línea (`liquidadaEnLaLinea`): se da por instalada. */
    proyecto(G603).estatus = 'LIQUIDADO';
    await S.jalar();
    eq('una tarjeta importada que se LIQUIDA en «En diseño» se da por instalada aquí y sale de la tabla', [(await local(G603)).etapa, (await elTaller()).estaciones.en_diseno],
      ['instalado', undefined]);
    proyecto(G603).estatus = 'COBRANDO';
    await S.jalar();
    eq('(sin bajarla de «Instalado» si después se corrige a COBRANDO: entonces vuelve a pedir su cobro)', (await elTaller()).porCobrar,
      ['Ana - Café Luna', 'Gamaliel - Tacos Taquería']);
  }

  console.log('\nD · LA INSTALACIÓN ATRASADA SIN MARCAR SIGUE EN «LO QUE VIENE»');
  {
    const l = await loQueViene();
    eq('arriba, marcada atrasada, la de Omar (hace 4 días, sin marcar); la de Ana, que ya pasó pero está hecha, no', l.filter(x => x[2]),
      [['Omar - M3 Arquitectos y Proyectos', masDias(HOY, -4), true]]);
    eq('y va primero, antes de las de hoy en adelante', [l[0][0], l.slice(1).every(x => !x[2] && x[1] >= HOY), l.some(x => x[0] === 'Dental Mar - Letras')], ['Omar - M3 Arquitectos y Proyectos', true, true]);
    eq('lo mismo que cuenta «Ya pasó y nadie la marcó»',
      (await Agenda.listar({ hasta: AYER, estados: VIVAS_SIN_MARCAR, conProyecto: true, sinObraInstalada: true })).map(i => i.id), ['i602']);
    eq('ninguna cita sale dos veces aunque llegue por las dos listas',
      Agenda.loQueViene([{ id: 'a', fecha: HOY }], [{ id: 'a', fecha: HOY }, { id: 'b', fecha: AYER }]).map(i => [i.id, !!i.atrasada]), [['b', true], ['a', true]]);
  }

  console.log('\nE · «OCULTAR DEL TALLER»: DIRECCIÓN OCULTA, OTRO TELÉFONO BAJA');
  {
    const antes = await local(O602);
    const avisosDe = async id => Reglas.evaluar({ proyectos: await DB.listar('proyectos'), instalaciones: await DB.listar('instalaciones'),
      hoy: HOY, rol: 'direccion', veDinero: true, base: true }).filter(a => a.entidad_id === id || a.entidad_id === 'i602').map(a => a.regla);
    cierto('(antes de ocultarla, «Qué atender» sí pide algo de Omar: su cita pasó y nadie la marcó)', (await avisosDe(O602)).length > 0);
    eq('solo Dirección escribe «oculto_taller» (la misma regla que la base)', ['direccion', 'fabricacion', 'pagos'].map(r => Proy.puedeEscribir(r, 'oculto_taller')), [true, false, false]);
    base.llamadas.length = 0;
    const r = await Proy.actualizar(O602, { oculto_taller: true });
    eq('Dirección la oculta: queda marcada aquí con su sello', [r.ok, (await local(O602)).oculto_taller, Number((await local(O602)).sellos.oculto_taller) > 0], [true, true, true]);
    const b = await S.bombear();
    const ll = llamadasDe();
    eq('sube a la base por proyecto_actualizar, sola (ni corregir_venta: el dinero no se toca)', [b.valor.subidas, b.valor.fallidas, ll.map(x => x[0])], [1, 0, ['proyecto_actualizar']]);
    eq('con el dato y su sello', [ll[0][1].p_op.campos, ll[0][1].p_op.sellos.oculto_taller === (await local(O602)).sellos.oculto_taller], [{ oculto_taller: true }, true]);
    eq('la base la guarda', proyecto(O602).oculto_taller, true);
    eq('y el estatus y el saldo de la base siguen igual', [proyecto(O602).estatus, base.tablas.ventas_calculadas.find(v => v.proyecto_id === O602).k_saldo], ['FABRICACION', 6600]);

    /* OTRO TELÉFONO: el de Fabricación, que tenía la obra sin ocultar y baja de la base. */
    ls.al3d_pf_rol = 'fabricacion';
    base.cuenta = { ...base.cuenta, area: 'fabricacion', correo: 'taller@al3d.mx' };
    await relevo.salud();
    const p = await local(O602);
    const sellos = { ...p.sellos }; delete sellos.oculto_taller;
    await DB.poner('proyectos', { ...p, oculto_taller: false, sellos });
    eq('(así lo tenía el otro teléfono: visible en su taller y en su Calendario)', [(await elTaller()).estaciones.listo, (await loQueViene()).some(x => x[0] === 'Omar - M3 Arquitectos y Proyectos')],
      [['Omar - M3 Arquitectos y Proyectos'], true]);
    const j = await S.jalar();
    eq('baja de la base y la obra le llega oculta', [j.ok, (await local(O602)).oculto_taller], [true, true]);
    const t = await elTaller();
    eq('ya no sale en «El taller» (ni en su estación ni en la cuenta) y se cuenta aparte', [t.estaciones.listo, t.cuenta, t.ocultos], [undefined, 1, 1]);
    eq('ni en «Lo que viene» del Calendario (su cita atrasada tampoco)', (await loQueViene()).some(x => x[0] === 'Omar - M3 Arquitectos y Proyectos'), false);
    eq('ni en «Qué atender»', await avisosDe(O602), []);
    eq('y su estatus de cobro no cambió', (await local(O602)).estatus_notion, antes.estatus_notion);
    eq('Fabricación no la puede ocultar ni mostrar: ROL_SIN_PERMISO, sin escribir nada', [(await Proy.actualizar(O602, { oculto_taller: false })).codigo, (await local(O602)).oculto_taller],
      ['ROL_SIN_PERMISO', true]);
    eq('un «sí» que no es sí o no tampoco entra (ni para Dirección)', (ls.al3d_pf_rol = 'direccion', (await Proy.actualizar(O602, { oculto_taller: 'si' })).codigo), 'DATO_INVALIDO');

    /* VOLVER A MOSTRAR: Dirección, en su teléfono. */
    base.cuenta = { ...base.cuenta, area: 'direccion', correo: 'elias@al3d.mx' };
    await relevo.salud();
    const vuelta = await Proy.actualizar(O602, { oculto_taller: false });
    await S.bombear();
    eq('Dirección la vuelve a mostrar y la base la guarda', [vuelta.ok, proyecto(O602).oculto_taller], [true, false]);
    /* El otro teléfono todavía la tiene oculta, con el sello viejo. */
    ls.al3d_pf_rol = 'fabricacion';
    base.cuenta = { ...base.cuenta, area: 'fabricacion', correo: 'taller@al3d.mx' };
    await relevo.salud();
    const p2 = await local(O602);
    await DB.poner('proyectos', { ...p2, oculto_taller: true, sellos: { ...p2.sellos, oculto_taller: Number(proyecto(O602).sellos.oculto_taller) - 1000 } });
    await S.jalar();
    eq('y en el otro teléfono regresa: a su estación y a «Lo que viene»', [(await local(O602)).oculto_taller, (await elTaller()).estaciones.listo,
      (await loQueViene()).some(x => x[0] === 'Omar - M3 Arquitectos y Proyectos')], [false, ['Omar - M3 Arquitectos y Proyectos'], true]);
    /* Un «false» de la base SIN sello (todas las obras que nadie ocultó) no deshace un «ocultar» de este teléfono que todavía no sube. */
    ls.al3d_pf_rol = 'direccion';
    base.cuenta = { ...base.cuenta, area: 'direccion', correo: 'elias@al3d.mx' };
    await relevo.salud();
    const g = await local(A604);
    eq('(una obra que nadie ocultó llega con «false» y sin sello)', [proyecto(A604).oculto_taller, 'oculto_taller' in proyecto(A604).sellos], [false, false]);
    await DB.poner('proyectos', { ...g, oculto_taller: true, sellos: { ...g.sellos, oculto_taller: Date.now() } });
    await S.jalar();
    eq('ese «false» sin sello no le quita la marca a la de aquí', (await local(A604)).oculto_taller, true);
    eq('y de vuelta en el de Dirección, la obra que se ocultó y se volvió a mostrar tiene el MISMO estatus y saldo de antes',
      [(await local(O602)).estatus_notion, (await local(O602)).pago_pendiente], [antes.estatus_notion, antes.pago_pendiente]);
    eq('(el saldo de antes era el de la base)', antes.pago_pendiente, 6600);
    await DB.poner('proyectos', { ...(await local(A604)), oculto_taller: false });
  }

  console.log('\nF · UNA BASE SIN 0029 NO DEJA AL TELÉFONO SIN BAJAR');
  {
    base.sinColumnaOculto = true;
    proyecto(A604).notas = 'llamar antes';
    proyecto(A604).sellos = { ...proyecto(A604).sellos, notas: Date.now() };
    const j = await S.jalar();
    eq('sin la columna, la lectura se repite sin ella y baja lo demás', [j.ok, (await local(A604)).notas], [true, 'llamar antes']);
    base.sinColumnaOculto = false;
    cierto('la lectura de la base pide la columna', /(^|, )oculto_taller($|,)/.test(Vivo.COLS_PROYECTO));
  }

  console.log('\nG · LAS PANTALLAS USAN ESTO');
  {
    const tab = sinComentarios(leer('js/mod/tablero.js'));
    cierto('el Tablero arma «El taller» con `tablaDelTaller` y pinta la sexta columna después de las cinco estaciones',
      /Taller\.tablaDelTaller\(vivos, instDe, \{ hoy, cts \}\)/.test(tab) && /ESTACIONES\.map\(e => estacion\(d, e\)\)\.join\(''\) \+ columnaPorCobrar\(d\)/.test(tab));
    cierto('la columna se llama «Instalado, por cobrar» y su ficha abre el proyecto como las demás',
      /'Instalado, por cobrar'/.test(tab) && /fichaPorCobrar[\s\S]{0,200}tipo: 'abrir', id: x\.proyecto_id/.test(tab));
    cierto('«Nada en la mesa» solo cuando tampoco hay nada por cobrar', /!d\.V\.length && !porCobrar\.length/.test(tab));
    cierto('los avisos del Tablero salen sin lo oculto', /faltan: DD\.faltanDatos\(enTabla,/.test(tab) && /!Taller\.ocultoDelTaller\(p\)/.test(tab));
    const cal = sinComentarios(leer('js/mod/fabricacion.js'));
    cierto('el Calendario arma «Lo que viene» con las atrasadas sin marcar (sin encender «Incluir lo que ya pasó»)',
      /Agenda\.loQueViene\(await Agenda\.listar\(\{ desde: hoy, conProyecto: true, sinOcultos: true \}\), d\.vencidas\)/.test(cal));
    cierto('y pinta la atrasada en rojo con su palabra', /' atrasada'/.test(cal) && /Ya pasó y nadie la marcó<\/span>/.test(cal));
    const pj = sinComentarios(leer('js/mod/proyectos.js'));
    cierto('Proyectos: el botón sale solo para Dirección con la base mandando, y su reverso en la misma ficha',
      /rol === 'direccion' && base && p\.etapa !== 'cancelado' && Proy\.puedeEscribir\(rol, 'oculto_taller'\)/.test(pj) &&
      /data-mostrar-taller=/.test(pj) && /data-ocultar-taller=/.test(pj));
    cierto('con su pregunta de un paso que dice que el dinero no cambia', /confirmarPf\(ocultar[\s\S]{0,900}El dinero no cambia/.test(pj));
    cierto('y la marca «Oculto del taller» en la lista y en el tablero de Proyectos', (pj.match(/Oculto del taller<\/span>/g) || []).length >= 2);
    const css = leer('css/plataforma.css');
    const t19 = css.slice(css.lastIndexOf('/* T1-9'));
    cierto('el CSS nuevo va en su bloque «T1-9», al final de css/plataforma.css', css.lastIndexOf('/* T1-9') > css.length - 3000 &&
      /\.tb-est-cobrar/.test(t19) && /\.cal-fila\.atrasada/.test(t19) && /\.pj-oculto-aviso/.test(t19));
  }
} catch (e) {
  mal++;
  console.log('  FALLA la prueba tronó: ' + (e && e.stack || e));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
