/* LA BASE MANDA, PASO 2 — el relevo de la base (js/datos/supa-relevo.js), el traductor compartido
 * (js/datos/supa-traductor.js), la elección del relevo por el modo de la empresa y la sombra quieta.
 *
 * Lo que se vigila:
 *   · CON LA HOJA MANDANDO, LO DE SIEMPRE: un teléfono de verdad (js/datos con su IndexedDB de mentiras)
 *     contra el Apps Script DE VERDAD (pruebas/comun/hoja-de-mentiras.mjs), con los interruptores
 *     apagados: toda la red es la URL del puente, ni un <script>, ni una base local nueva; y nadie carga
 *     los módulos nuevos de forma estática;
 *   · LA ELECCIÓN: la base manda en este aparato solo con el interruptor encendido Y el último modo que
 *     dijo la base en 'base'. Sin saberlo, la hoja. Sin señal, lo último que se oyó. Las cuatro copias de
 *     la regla (supa.js, app.js, puerta.js y venta.js) contestan lo mismo;
 *   · LA MISMA INTERFAZ que el relevo de la hoja, miembro por miembro;
 *   · CADA OPERACIÓN A SU FUNCIÓN de la base, con sus argumentos, por la bandeja de verdad (sync.js);
 *   · EL V-### de una venta nueva sale de la base y vuelve al teléfono como volvía el de la hoja;
 *   · REINTENTAR ES IDEMPOTENTE (el mismo op_id, el mismo folio) y lo definitivo se aparta sin trabar;
 *   · FABRICACIÓN SIN DINERO: ni lo escribe ni lo lee;
 *   · LA BAJADA sale de la base, nunca de /jalar, y no tira un récord lleno por una lectura vacía;
 *   · SIN DOBLE ENVÍO: con la base mandando, la sombra no copia ni bombea.
 *
 * No toca Supabase: el cliente es un doble con una base de mentiras en memoria. Lo que la base de verdad
 * contesta a estas mismas llamadas lo prueba supabase/tests/sync-e-importacion/relevo.mjs (PGlite).
 * Se corre con pruebas/correr.sh, como todas. */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { idbConIndices } from './comun/base-de-mentiras.mjs';
import { hojaDeMentiras } from './comun/hoja-de-mentiras.mjs';

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
const NUEVOS = ['supa-relevo', 'supa-traductor'];

/* ── El mundo: un teléfono y la hoja ──────────────────────────────────────────────────────── */
const URL_PUENTE = 'https://puente.test/exec';
const TOKEN = 'd'.repeat(40);
const ls = { al3d_pf_rol: 'direccion', al3d_pf_disp: 'K7QM', al3d_pf_puente: JSON.stringify({ url: URL_PUENTE, token: TOKEN }) };
globalThis.window = globalThis;
globalThis.IDBKeyRange = { only: v => ({ only: v }) };
globalThis.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
const red = [];
let H = null;
globalThis.fetch = async (url, init) => {
  red.push(String(url));
  if (String(url) !== URL_PUENTE) throw new TypeError('Failed to fetch');
  return { status: 200, json: async () => H.doPost(init.body) };
};
const scripts = [];
globalThis.document = { createElement: t => { scripts.push(t); return {}; }, head: { appendChild() {} }, visibilityState: 'visible',
  addEventListener() {} };
const idb = idbConIndices();
const abiertas = [];
globalThis.indexedDB = { open: (n, v) => { abiertas.push(n); return idb.open(n, v); }, deleteDatabase: n => idb.deleteDatabase && idb.deleteDatabase(n) };
const setTimeoutReal = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => (Number(ms) >= 1000 ? 0 : setTimeoutReal(fn, ms, ...a));
/* Los avisos que la app oye (`al3d-modo`). */
const avisos = [];
globalThis.dispatchEvent = ev => { avisos.push(ev.type + ':' + JSON.stringify(ev.detail || null)); return true; };

H = hojaDeMentiras({ tokens: { [TOKEN]: 'direccion' } });
H.run('prepararHojaParaElPuente()');

const DB = await import('../js/datos/db.js');
const S = await import('../js/datos/sync.js');
const Puente = await import('../js/datos/puente.js');
const Supa = await import('../js/nucleo/supa.js');
const R = await import('../js/datos/supa-relevo.js');
const T = await import('../js/datos/supa-traductor.js');
const Sb = await import('../js/datos/supa-sombra.js');
await DB.abrir();

/* ── La base de mentiras y su cliente (el doble de supabase-js) ─────────────────────────────────── */
/* La matriz de permisos de VERDAD, leída de la migración: si la base cambia lo que escribe cada área,
   esta prueba lo ve. */
const MATRIZ = JSON.parse(/interno\.matriz_permisos\(\)[\s\S]*?select '(\{[\s\S]*?\})'::jsonb/.exec(leer('supabase/migrations/0002_acceso.sql'))[1]);

const base = {
  cuenta: { sesion: true, estado: 'activo', area: 'direccion', modo: 'base', correo: 'ana@al3d.mx' },
  tablas: { proyectos: [], instalaciones: [], ventas_calculadas: [], ventas_dinero: [], materiales: [], requerimientos: [],
            almacen_movimientos: [], almacen_costos: [] },
  contador: 300,
  llamadas: [],
  pedidas: [],
  guion: null,           // (rpc, args) => {data|error} para forzar una respuesta
  vistosAlmacen: new Set(),
};
const filaProyecto = (o = {}) => ({ id: 'p', empresa_id: 'al3d', folio_hoja: null, folio_global: null, nombre: '', estatus: 'FABRICACION', iva: true,
  tipo_trabajo: [], etapa: 'ganado', fecha_anticipo: '2026-10-01', fecha_instalacion_hist: null, dir_texto: '', lat: null, lng: null, maps_url: '',
  tel: '', entrega: null, notas: '', plazo_k: null, sellos: {}, deleted_at: null, etapa_vacia: null, ...o });
const err = (codigo, mensaje, extra = {}) => ({ data: { ok: false, codigo, mensaje: mensaje || codigo, ...extra } });

function rpcDeLaBase(n, a) {
  const c = base.cuenta;
  if (n === 'mi_acceso') {
    if (!c.sesion) return err('SIN_SESION', 'No hay sesión.');
    const activo = c.estado === 'activo';
    return { data: { ok: true, estado: c.estado, usuario: { correo: c.correo },
      empresas: [{ empresa_id: 'al3d', area: c.area, estado: activo ? 'activo' : 'baja', modo: c.modo }],
      contrato: { actual: 1, minimo: 1 }, permisos: activo ? MATRIZ[c.area] : null, modo: activo ? c.modo : null } };
  }
  if (!c.sesion) return err('SIN_SESION', 'No hay sesión.');
  if (c.estado !== 'activo') return err('ACCESO_REVOCADO', 'Tu acceso a esta empresa ya no está activo.');
  const P = base.tablas.proyectos;
  const proy = id => P.find(p => p.id === id) || null;
  if (n === 'ganar_proyecto') {
    if (c.area !== 'direccion') return err('ROL_SIN_PERMISO', 'No tienes permiso para esto.');
    const o = a.p_op;
    const ya = P.find(p => p.folio_global === o.folio_global);
    if (ya) return ya.id === o.id ? { data: { ok: true, ya_existia: true, proyecto_id: ya.id, folio_hoja: ya.folio_hoja } }
                                   : err('DUPLICADO', 'Esa cotización ya es otro proyecto.', { proyecto_id: ya.id });
    const folio = o.folio_hoja || 'V-' + String(++base.contador).padStart(3, '0');
    P.push(filaProyecto({ id: o.id, folio_hoja: folio, folio_global: o.folio_global, nombre: o.nombre, tel: o.tel }));
    base.tablas.ventas_calculadas.push({ proyecto_id: o.id, empresa_id: 'al3d', d_cuenta: o.venta.cuenta || null, g_subtotal: o.venta.sub,
      h_neto: o.venta.sub * 1.16, i_anticipo: o.venta.anti, j_liquidacion: 0, k_saldo: o.venta.sub * 1.16 - o.venta.anti, r_comision: o.venta.sub / 10,
      s_abonado: 0, t_restante: o.venta.sub / 10, pct_comision: 10, n_fecha_liquidacion: null });
    return { data: { ok: true, proyecto_id: o.id, folio_hoja: folio } };
  }
  if (n === 'descartar_cotizacion') return { data: { ok: true } };
  if (n === 'proyecto_actualizar') {
    const p = proy(a.p_op.id); if (!p) return err('NO_ENCONTRADO', 'Ese proyecto no existe.');
    const deja = MATRIZ[c.area].proyecto_actualizar;
    const rech = Object.keys(a.p_op.campos).filter(k => !deja.includes(k)).map(k => ({ nombre: k, por: 'el rol ' + c.area + ' no puede escribir esta propiedad' }));
    for (const [k, v] of Object.entries(a.p_op.campos)) if (deja.includes(k)) p[k] = v;
    return { data: { ok: true, escritos: Object.keys(a.p_op.campos).filter(k => deja.includes(k)), viejos: [], rechazadas: rech } };
  }
  if (n === 'corregir_venta') {
    if (!['direccion', 'pagos'].includes(c.area)) return err('ROL_SIN_PERMISO', 'No tienes permiso para esto.');
    const p = proy(a.p_proyecto); if (!p || !p.folio_hoja) return err('NO_ENCONTRADO', 'Esa venta no existe en el libro.');
    return { data: { ok: true, rechazadas: [] } };
  }
  if (n === 'mover_etapa') {
    const p = proy(a.p_proyecto); if (!p) return err('NO_ENCONTRADO', 'Ese proyecto no existe.');
    p.etapa = a.p_etapa;
    return { data: { ok: true, etapa: a.p_etapa } };
  }
  if (n === 'instalacion_guardar') {
    const p = proy(a.p_op.proyecto_id); if (!p) return err('NO_ENCONTRADO', 'Ese proyecto no existe.');
    return { data: { ok: true } };
  }
  if (n === 'almacen_aplicar') {
    return { data: { ok: true, resultados: a.p_ops.map(o => {
      if (o.almacen === 'requerimientos' && !proy(o.datos.proyecto_id)) return { id: o.id, ok: false, codigo: 'DATO_INVALIDO', mensaje: 'La base no aceptó ese cambio: ese proyecto no existe.' };
      const llave = o.almacen + '|' + o.registro_id;
      const ya = o.almacen === 'movimientos' && base.vistosAlmacen.has(llave);
      base.vistosAlmacen.add(llave);
      return ya ? { id: o.id, ok: true, ya_estaba: true } : { id: o.id, ok: true, creada: true };
    }) } };
  }
  return err('DESCONOCIDO', 'Función desconocida: ' + n);
}

function consulta(tabla) {
  base.pedidas.push(tabla);
  const filtros = [];
  let tope = Infinity;
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
    limit(nn) { tope = nn; return Promise.resolve({ data: filas().slice(0, tope).map(r => ({ ...r })), error: null }); },
    range(a, b) { return Promise.resolve({ data: filas().slice(a, b + 1).map(r => ({ ...r })), error: null }); },
  };
  return q;
}

const canales = [];
const clienteFalso = {
  rpc: async (n, a) => {
    base.llamadas.push([n, JSON.parse(JSON.stringify(a || {}))]);
    if (base.guion) { const g = base.guion(n, a); if (g) return g; }
    return rpcDeLaBase(n, a || {});
  },
  from: t => consulta(t),
  auth: { getSession: async () => ({ data: { session: base.cuenta.sesion ? { user: {} } : null } }) },
  channel() { const ch = { tablas: [], on(_t, f) { ch.tablas.push(f.table); return ch; }, subscribe(cb) { cb('SUBSCRIBED'); return ch; } }; canales.push(ch); return ch; },
  removeChannel() {},
};
/* supa.js carga supabase-js de vendor/ con un <script>; si ya está en la ventana, lo usa. */
const crearClienteFalso = () => { globalThis.supabase = { createClient: () => clienteFalso }; };

const llamadasDe = () => base.llamadas.filter(([n]) => n !== 'mi_acceso');

const VENTA = (o = {}) => ({ id: 'proy-1', folio_local: 'COT-0042', dispositivo: 'K7QM', folio_global: 'COT-0042@K7QM',
  nombre: 'Ana - Café', contacto: 'Ana', negocio: 'Café', etapa: 'ganado', tipo_trabajo: ['Letras 3D con iluminacion'],
  fecha_ganado: '2026-10-01', dir_texto: 'Av. Vallarta 1', lat: 20.6736, lng: -103.344, geo_fuente: 'maps_pin',
  sub: 10000, neto: 11600, precio_auth: 11600, anti_pactado: 5000, iva: true, notion_page_id: null, notion_estado: 'pendiente',
  estatus_notion: 'FABRICACION', cuenta: 'Constru BNT', pct_comision: 10, plazo_k: null, notas: '', tel: '33 1000 0000',
  entrega: 'instalacion', origen: { folio: 'COT-0042', items: [] },
  sellos: { etapa: 1000, tel: 1000, dir_texto: 1000, ubicacion: 1000 }, creado_en: 1000, actualizado_en: 1000, sync: 0, ...o });

/* Las copias de la regla «¿manda la base?» que viven en guiones sin módulos o en el arranque: se sacan del
   fuente y se corren contra el mismo almacenamiento. */
const reglaDe = archivo => {
  const t = sinComentarios(leer(archivo));
  const m = /function laBaseManda\(\)\s*\{[\s\S]*?\n\}/.exec(t);
  return m ? new Function('localStorage', m[0] + '; return laBaseManda();') : null;
};

try {
  console.log('\nCON LA HOJA MANDANDO, LO DE SIEMPRE (un teléfono de verdad contra la hoja de verdad, interruptores apagados)');
  {
    eq('sin interruptor y sin modo oído, la base no manda', [Supa.laBaseManda(), Supa.modoGuardado()], [false, null]);
    S.registrar(Puente.crear({ url: URL_PUENTE, token: TOKEN }));
    await DB.poner('proyectos', VENTA());
    await S.encolar({ tipo: 'crear', almacen: 'proyectos', registro_id: 'proy-1', datos: await DB.obtener('proyectos', 'proy-1'), campos: null, ts: 1000 });
    const b1 = await S.bombear();
    eq('la venta sube a la hoja como siempre', [b1.valor.subidas, b1.valor.fallidas, S.estado().adaptador], [1, 0, 'hoja']);
    cierto('y la hoja le da su V-###', /^V-\d{3,7}$/.test(String((await DB.obtener('proyectos', 'proy-1')).notion_page_id)));
    const j = await S.jalar();
    cierto('y baja', j.ok);
    const p = await DB.obtener('proyectos', 'proy-1');
    await DB.poner('proyectos', { ...p, etapa: 'en_diseno', sellos: { ...p.sellos, etapa: 2000 } });
    await S.encolar({ tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-1', datos: await DB.obtener('proyectos', 'proy-1'), campos: ['etapa'], ts: 2000 });
    eq('mover la etapa también', (await S.bombear()).valor.subidas, 1);
    eq('TODA la red fue la URL del puente: ni una petición a Supabase', [...new Set(red)], [URL_PUENTE]);
    eq('no se creó ningún <script> (la librería de Supabase no se cargó)', scripts, []);
    eq('la única base local que se abrió es la de siempre', [...new Set(abiertas)], ['al3d_pf']);
    eq('ni se guardó un modo ni hubo aviso de cambio', [ls.al3d_pf_supa_modo, avisos], [undefined, []]);

    const todos = [];
    const recorrer = d => { for (const f of readdirSync(join(RAIZ, d), { withFileTypes: true })) {
      if (f.isDirectory()) recorrer(d + '/' + f.name); else if (f.name.endsWith('.js')) todos.push(d + '/' + f.name); } };
    recorrer('js');
    const SUPA = ['supa-sombra', 'supa-vivo', 'supa-cuadre', 'supa-enchufe', 'supa-imagenes', ...NUEVOS];
    const estaticos = todos.filter(f => NUEVOS.some(m => new RegExp('^\\s*import[^;(]*' + m + '\\.js', 'm').test(leer(f))) &&
      !SUPA.some(m => f.endsWith('/' + m + '.js')));
    eq('nadie importa el relevo ni el traductor de forma estática (solo los módulos de Supabase entre ellos)', estaticos, []);
    const app = sinComentarios(leer('js/app.js'));
    cierto('app.js carga el relevo con import() y SOLO dentro de `if (laBaseManda())`',
      /if \(laBaseManda\(\)\) \{[\s\S]{0,400}import\('\.\/datos\/supa-relevo\.js'\)/.test(app) && (app.match(/supa-relevo\.js/g) || []).length === 1);
    cierto('y fuera de ese caso enchufa el relevo de la hoja, como siempre', /Sync\.registrar\(Puente\.desdePrefs\(\)\);/.test(app));
    cierto('el enchufe de la sombra sigue pidiendo sus dos interruptores en el arranque',
      /if \(\/"encendido":true\/\.test\(localStorage\.getItem\('al3d_pf_supa'\) \|\| ''\) &&\s*\/"encendido":true\/\.test\(localStorage\.getItem\('al3d_pf_supa_sombra'\) \|\| ''\)\) \{\s*import\('\.\/datos\/supa-enchufe\.js'\)/.test(app));
    cierto('«Registrar venta» del cotizador solo deja de ir a la hoja con la base mandando',
      /if\(puenteCfg\(\)&&!laBaseManda\(\)\)\{/.test(sinComentarios(leer('js/cotizador/venta.js'))) &&
      /if\(laBaseManda\(\)\)\{\s*toast\(/.test(sinComentarios(leer('js/cotizador/venta.js'))));
    cierto('el modo no viaja en los respaldos (no está en Prefs)', !/al3d_pf_supa_modo/.test(leer('js/datos/prefs.js')));
    const sw = leer('sw.js');
    cierto('el service worker lleva los dos en el conjunto versionado', NUEVOS.every(m => sw.includes("'./js/datos/" + m + ".js'")));
  }

  console.log('\nLA ELECCIÓN: LA BASE MANDA SOLO CON EL INTERRUPTOR Y EL ÚLTIMO MODO OÍDO EN «base»');
  {
    const copias = { 'js/app.js': reglaDe('js/app.js'), 'js/nucleo/puerta.js': reglaDe('js/nucleo/puerta.js'), 'js/cotizador/venta.js': reglaDe('js/cotizador/venta.js') };
    eq('las tres copias existen', Object.values(copias).map(f => typeof f), ['function', 'function', 'function']);
    const ON = JSON.stringify({ encendido: true, desde: 1 });
    const casos = [
      ['apagado, sin modo', {}, false],
      ['apagado, modo base', { al3d_pf_supa_modo: JSON.stringify({ modo: 'base' }) }, false],
      ['encendido, sin modo oído (no se sabe → la hoja)', { al3d_pf_supa: ON }, false],
      ['encendido, modo hoja', { al3d_pf_supa: ON, al3d_pf_supa_modo: JSON.stringify({ modo: 'hoja' }) }, false],
      ['encendido, modo base', { al3d_pf_supa: ON, al3d_pf_supa_modo: JSON.stringify({ modo: 'base', area: 'pagos' }) }, true],
      ['encendido, modo dañado', { al3d_pf_supa: ON, al3d_pf_supa_modo: 'basura{' }, false],
      ['interruptor dañado, modo base', { al3d_pf_supa: 'basura{', al3d_pf_supa_modo: JSON.stringify({ modo: 'base' }) }, false],
    ];
    for (const [que, claves, esperado] of casos) {
      const m = { getItem: k => (k in claves ? claves[k] : null) };
      const guardado = { ...ls };
      for (const k of ['al3d_pf_supa', 'al3d_pf_supa_modo']) delete ls[k];
      Object.assign(ls, claves);
      const dice = [Supa.laBaseManda(), ...Object.values(copias).map(f => f(m))];
      for (const k of Object.keys(ls)) delete ls[k];
      Object.assign(ls, guardado);
      eq(que + ': ' + (esperado ? 'la base' : 'la hoja') + ' (supa.js, app.js, puerta.js y venta.js)', dice, [esperado, esperado, esperado, esperado]);
    }
    const sinAlmacen = { getItem: () => { throw new Error('bloqueado'); } };
    eq('sin almacenamiento (bloqueado): la hoja', Object.values(copias).map(f => f(sinAlmacen)), [false, false, false]);

    /* Lo que dice la base se guarda, y solo si lo dice de verdad. */
    crearClienteFalso();
    Supa.encender(true);
    base.cuenta = { sesion: true, estado: 'activo', area: 'direccion', modo: 'hoja', correo: 'ana@al3d.mx' };
    const a1 = await Supa.acceso();
    eq('mi_acceso dice el modo y los permisos del área', [a1.modo, Array.isArray(a1.permisos && a1.permisos.corregir_venta)], ['hoja', true]);
    eq('la primera vez se guarda y se avisa (la app vuelve a enchufar)', [Supa.modoGuardado().modo, avisos], ['hoja', ['al3d-modo:{"modo":"hoja"}']]);
    await Supa.acceso();
    eq('el mismo modo otra vez: no se avisa de nuevo', avisos.length, 1);
    eq('encendido pero la empresa en la hoja: la hoja', Supa.laBaseManda(), false);
    base.cuenta.modo = 'base';
    await Supa.acceso();
    eq('Dirección cambió a la base: se guarda, se avisa, y ahora manda la base', [Supa.modoGuardado().modo, avisos.length, Supa.laBaseManda()], ['base', 2, true]);
    eq('con el área y el correo que dijo la base (no la hoja)', [Supa.modoGuardado().area, Supa.modoGuardado().correo], ['direccion', 'ana@al3d.mx']);
    base.cuenta.sesion = false;
    await Supa.acceso();
    eq('una respuesta que no es explícita (sin sesión) no borra lo que se sabía', [Supa.modoGuardado().modo, Supa.laBaseManda(), avisos.length], ['base', true, 2]);
    base.cuenta.sesion = true; base.cuenta.estado = 'baja';
    await Supa.acceso();
    eq('ni un acceso retirado (sin modo)', Supa.modoGuardado().modo, 'base');
    base.cuenta.estado = 'activo';
    const redAntes = red.length;
    eq('sin señal: lo último que se oyó, sin preguntar nada', [Supa.laBaseManda(), red.length - redAntes], [true, 0]);
    eq('guardarModo no guarda un modo que no existe', Supa.guardarModo({ estado: 'activo', modo: 'nube' }), false);
    Supa.encender(false);
    eq('apagar el interruptor: la hoja otra vez, aunque se sepa que la empresa está en la base', Supa.laBaseManda(), false);
    Supa.encender(true);
  }

  console.log('\nLA MISMA INTERFAZ QUE EL RELEVO DE LA HOJA');
  {
    const hoja = Puente.crear({ url: URL_PUENTE, token: TOKEN });
    const relevo = R.desdeSupa(Supa);
    const de = o => Object.keys(o).filter(k => k !== 'revive').sort().map(k => k + ':' + (Array.isArray(o[k]) ? 'array' : typeof o[k]));
    eq('cada miembro del de la hoja está en el de la base, con su tipo (menos `revive`, que es de las versiones de la hoja)',
      de(hoja).filter(x => !de(relevo).includes(x)), []);
    eq('se llama «base» (Ajustes y el arranque lo distinguen por el nombre)', relevo.nombre, 'base');
    eq('lleva la venta, la cita y el almacén', R.LLEVA, ['proyectos', 'instalaciones', 'movimientos', 'materiales', 'requerimientos']);
    eq('y agrupa el almacén como la hoja', ['movimientos', 'materiales', 'requerimientos', 'proyectos', 'gastos'].map(a => relevo.agrupa(a)), [true, true, true, false, false]);
    eq('los gastos todavía no (paso 3): «no se sabe», para que Control no diga «falta actualizar el puente»', [relevo.lleva('gastos'), relevo.sabe('gastos')], [false, null]);
    cierto('y el porqué se dice entero', /paso 3/.test(relevo.motivo('gastos')) && /no se pierde nada/.test(relevo.motivo('gastos')));
    eq('el récord de ventas se baja entero, como el de la hoja', relevo.espejos, ['ventas_hoja']);
  }

  console.log('\nCADA OPERACIÓN A SU FUNCIÓN DE LA BASE (por la bandeja de verdad, Dirección)');
  const relevo = R.desdeSupa(Supa);
  S.registrar(relevo);
  base.cuenta = { sesion: true, estado: 'activo', area: 'direccion', modo: 'base', correo: 'ana@al3d.mx' };
  /* Lo que la bandeja le pasa a quien se cuelgue de `alSubir` es la respuesta del relevo: así se ve qué contesta. */
  const respuestas = [];
  S.alSubir(async (op, r) => { respuestas.push([op.id, JSON.parse(JSON.stringify(r))]); });
  {
    red.length = 0; base.llamadas.length = 0;
    await DB.poner('proyectos', VENTA({ id: 'proy-7', folio_local: 'COT-0050', folio_global: 'COT-0050@K7QM', nombre: 'Beto - Tienda' }));
    await S.encolar({ id: 'op-alta-7', tipo: 'crear', almacen: 'proyectos', registro_id: 'proy-7', datos: await DB.obtener('proyectos', 'proy-7'), campos: null, ts: 3000 });
    const b = await S.bombear();
    eq('un alta sube a la base y sale de la bandeja', [b.valor.subidas, b.valor.fallidas, (await S.pendientes()).length], [1, 0, 0]);
    const g = llamadasDe().find(x => x[0] === 'ganar_proyecto');
    eq('es ganar_proyecto, con el id de ESTE teléfono y SIN folio de la hoja (no hay hoja que lo dé)',
      [g && g[1].p_op.id, g && g[1].p_op.folio_global, g && 'folio_hoja' in g[1].p_op], ['proy-7', 'COT-0050@K7QM', false]);
    eq('con el dinero en los nombres de la base', [g[1].p_op.venta.sub, g[1].p_op.venta.anti, g[1].p_op.venta.cuenta, g[1].p_op.fecha_anticipo],
      [10000, 5000, 'Constru BNT', '2026-10-01']);
    eq('ni una petición a la hoja', red.length, 0);
    const local = await DB.obtener('proyectos', 'proy-7');
    eq('EL V-### SALE DE LA BASE y vuelve al teléfono como el de la hoja: en el proyecto…', [local.notion_page_id, local.notion_estado], ['V-301', 'enviado']);
    eq('…y en `remoto.id_notion` de la respuesta', respuestas.find(x => x[0] === 'op-alta-7')[1].remoto, { id_notion: 'V-301' });

    base.llamadas.length = 0;
    const p = await DB.obtener('proyectos', 'proy-7');
    await DB.poner('proyectos', { ...p, notas: 'llamar antes', anti_pactado: 6000, etapa: 'en_diseno', sellos: { ...p.sellos, notas: 4000, etapa: 4100 } });
    await S.encolar({ id: 'op-mix-7', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-7', datos: await DB.obtener('proyectos', 'proy-7'),
      campos: ['notas', 'anti_pactado', 'etapa'], ts: 4100 });
    await S.bombear();
    eq('un cambio de varias cosas: la obra, el dinero y la etapa, en ese orden', llamadasDe().map(x => x[0]), ['proyecto_actualizar', 'corregir_venta', 'mover_etapa']);
    eq('la obra con el id de la operación como op_id', llamadasDe()[0][1].p_op.op_id, 'op-mix-7');
    eq('el dinero con los nombres de la base', llamadasDe()[1][1].p_cambios, { anticipo: 6000 });
    eq('la etapa con su sello', [llamadasDe()[2][1].p_etapa, llamadasDe()[2][1].p_sello], ['en_diseno', 4100]);

    base.llamadas.length = 0;
    const inst = { id: 'inst-7', proyecto_id: 'proy-7', fecha: '2026-11-02', hora: '10:00', ventana: 'dia', duracion_min: 180, estado: 'confirmada', notas: 'n', actualizado_en: 7000 };
    await DB.poner('instalaciones', inst);
    await S.encolar({ id: 'op-inst-7', tipo: 'crear', almacen: 'instalaciones', registro_id: 'inst-7', datos: inst, ts: 7001 });
    await S.bombear();
    eq('una cita es instalacion_guardar con su sello y sus notas', llamadasDe().map(x => [x[0], x[1].p_op.sello, x[1].p_op.notas]), [['instalacion_guardar', 7000, 'n']]);

    base.llamadas.length = 0;
    await DB.poner('proyectos', VENTA({ id: 'proy-8', folio_global: 'COT-0051@K7QM', etapa: 'cancelado', notas: 'muy caro' }));
    await S.encolar({ id: 'op-lapida', tipo: 'crear', almacen: 'proyectos', registro_id: 'proy-8', datos: await DB.obtener('proyectos', 'proy-8'), ts: 7100 });
    await S.bombear();
    eq('una cotización que «no se dio» es descartar_cotizacion', llamadasDe().map(x => [x[0], x[1].p_op.motivo]), [['descartar_cotizacion', 'muy caro']]);

    base.llamadas.length = 0;
    await S.encolar({ id: 'op-mov-1', tipo: 'apendice', almacen: 'movimientos', registro_id: 'mov-1', datos: { id: 'mov-1', material_id: 'acr-3mm', tipo: 'entrada', cantidad: 5, sync: 0 }, ts: 8000 });
    await S.encolar({ id: 'op-mat-1', tipo: 'actualizar', almacen: 'materiales', registro_id: 'acr-3mm', datos: { id: 'acr-3mm', nombre: 'Acrílico 3 mm' }, campos: ['nombre'], ts: 8001 });
    await S.encolar({ id: 'op-req-1', tipo: 'crear', almacen: 'requerimientos', registro_id: 'proy-7:acr-3mm',
      datos: { id: 'proy-7:acr-3mm', proyecto_id: 'proy-7', material_id: 'acr-3mm', cantidad: 2, unidad_compra: 'lamina', estado: 'calculado' }, ts: 8002 });
    const ba = await S.bombear();
    eq('el almacén va JUNTO, en un solo viaje a almacen_aplicar, en su orden', [ba.valor.subidas, llamadasDe().map(x => [x[0], x[1].p_ops.map(o => o.id)])],
      [3, [['almacen_aplicar', ['op-mov-1', 'op-mat-1', 'op-req-1']]]]);
    cierto('sin la marca `sync` de este teléfono', llamadasDe()[0][1].p_ops.every(o => !('sync' in o.datos)));

    await S.encolar({ id: 'op-gasto-1', tipo: 'crear', almacen: 'gastos', registro_id: 'gas-1', datos: { id: 'gas-1', concepto: 'Gasolina', monto: 500 }, ts: 9000 });
    await S.encolar({ id: 'op-aviso-1', tipo: 'actualizar', almacen: 'avisos', registro_id: 'r1', datos: { rid: 'r1' }, ts: 9001 });
    base.llamadas.length = 0;
    const bg = await S.bombear();
    const apartadas = await S.sinDestino();
    eq('un gasto y un aviso no van a la base: se apartan aquí con su razón, sin gastar red', [bg.valor.sin_destino, apartadas.map(x => x.id), llamadasDe().length],
      [2, ['op-gasto-1', 'op-aviso-1'], 0]);
    cierto('el gasto dice que espera al paso 3', /paso 3/.test(apartadas[0].ultimo_error));
  }

  console.log('\nREINTENTAR ES IDEMPOTENTE; LO DEFINITIVO SE APARTA SIN TRABAR');
  {
    await DB.poner('proyectos', VENTA({ id: 'proy-9', folio_local: 'COT-0052', folio_global: 'COT-0052@K7QM', nombre: 'Caro - Taller' }));
    await S.encolar({ id: 'op-alta-9', tipo: 'crear', almacen: 'proyectos', registro_id: 'proy-9', datos: await DB.obtener('proyectos', 'proy-9'), ts: 10000 });
    const p9 = await DB.obtener('proyectos', 'proy-9');
    await S.encolar({ id: 'op-notas-9', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-9', datos: { ...p9, notas: 'x', sellos: { notas: 10001 } }, campos: ['notas'], ts: 10001 });
    base.llamadas.length = 0;
    base.guion = () => ({ data: null, error: { code: '', message: 'TypeError: Failed to fetch' } });
    const r1 = await S.bombear();
    eq('sin red: se para en la primera y no toca la de atrás', [r1.valor.subidas, r1.valor.fallidas, llamadasDe().length], [0, 1, 1]);
    eq('la primera suma un intento; las dos siguen en la bandeja, en su orden', (await S.pendientes()).map(x => [x.id, x.intentos]), [['op-alta-9', 1], ['op-notas-9', 0]]);
    /* La base SÍ la escribió, pero la respuesta se perdió en el camino: el reintento no la duplica. */
    base.guion = null;
    rpcDeLaBase('ganar_proyecto', llamadasDe()[0][1]);
    const folioDeLaBase = base.tablas.proyectos.find(x => x.id === 'proy-9').folio_hoja;
    base.llamadas.length = 0;
    const r2 = await S.bombear();
    eq('con red: el reintento sale con el MISMO id y la base contesta «ya existía» con el MISMO V-###',
      [r2.valor.subidas, (await DB.obtener('proyectos', 'proy-9')).notion_page_id, base.tablas.proyectos.filter(x => x.folio_global === 'COT-0052@K7QM').length],
      [2, folioDeLaBase, 1]);
    eq('y lo de atrás, con el mismo op_id de la bandeja', llamadasDe().filter(x => x[0] === 'proyecto_actualizar').map(x => x[1].p_op.op_id), ['op-notas-9']);

    /* Lo definitivo: un dato que la base no acepta se aparta, y la siguiente sale. */
    base.llamadas.length = 0;
    base.guion = (n, a) => (n === 'proyecto_actualizar' && a.p_op.op_id === 'op-malo') ? err('DATO_INVALIDO', 'Un texto del proyecto es demasiado largo.') : null;
    await S.encolar({ id: 'op-malo', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-9', datos: { ...p9, notas: 'x'.repeat(5), sellos: { notas: 11000 } }, campos: ['notas'], ts: 11000 });
    await S.bombear();
    eq('lo rechazado deja el proyecto marcado como que no llegó (como con la hoja)', (await DB.obtener('proyectos', 'proy-9')).notion_estado, 'fallido');
    await S.reintentarRechazadas();
    await S.encolar({ id: 'op-bueno', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-9', datos: { ...p9, notas: 'bien', sellos: { notas: 11001 } }, campos: ['notas'], ts: 11001 });
    const r3 = await S.bombear();
    eq('DATO_INVALIDO: se aparta con su razón y la siguiente sale', [r3.valor.subidas, r3.valor.rechazadas, (await S.rechazadas()).map(x => [x.id, x.codigo_rechazo])],
      [1, 1, [['op-malo', 'DATO_INVALIDO']]]);
    cierto('la razón es la de la base, y dice qué función', /demasiado largo/.test((await S.rechazadas())[0].ultimo_error) && /proyecto_actualizar/.test((await S.rechazadas())[0].ultimo_error));
    eq('y la que sí llegó lo deja como enviado', (await DB.obtener('proyectos', 'proy-9')).notion_estado, 'enviado');
    await S.descartarDelProyecto('proy-9');

    /* Lo que es de la puerta (la sesión, el acceso) NO se aparta: para el bombeo, se queda. */
    for (const [que, guion, codigo] of [
      ['sin sesión en la base', () => err('SIN_SESION', 'No hay sesión.'), 'ROL_SIN_PERMISO'],
      ['acceso retirado', () => err('ACCESO_REVOCADO', 'Tu acceso a esta empresa ya no está activo.'), 'ROL_SIN_PERMISO'],
      ['la app vieja', () => err('CLIENTE_VIEJO', 'Actualiza.'), 'ROL_SIN_PERMISO'],
      ['un error que no se entiende', () => ({ data: null, error: { code: 'XX000', message: 'algo' } }), 'DESCONOCIDO'],
    ]) {
      base.guion = guion;
      await S.encolar({ id: 'op-p1', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-7', datos: { ...(await DB.obtener('proyectos', 'proy-7')), notas: 'a', sellos: { notas: 12000 } }, campos: ['notas'], ts: 12000 });
      await S.encolar({ id: 'op-p2', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-7', datos: { ...(await DB.obtener('proyectos', 'proy-7')), notas: 'b', sellos: { notas: 12001 } }, campos: ['notas'], ts: 12001 });
      base.llamadas.length = 0;
      const r = await S.bombear();
      eq(que + ': se para (' + codigo + ', no definitivo), nada se aparta y las dos se quedan',
        [r.valor.subidas, r.valor.rechazadas, llamadasDe().length, (await S.pendientes()).map(x => x.id)], [0, 0, 1, ['op-p1', 'op-p2']]);
      eq(que + ': el código para la bandeja', R.codigoDeLaBandeja(T.leerRespuesta('proyecto_actualizar', guion()).codigo, T.leerRespuesta('proyecto_actualizar', guion()).mensaje), codigo);
      base.guion = null;
      await S.bombear();
    }
    eq('la red es SIN_RED', R.codigoDeLaBandeja('', 'TypeError: Failed to fetch'), 'SIN_RED');

    /* Sin sesión en este teléfono: ni se intenta. */
    base.cuenta.sesion = false;
    relevo.salud && await relevo.salud();      // olvida lo que sabía de la cuenta
    await S.encolar({ id: 'op-sin-sesion', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-7', datos: { ...(await DB.obtener('proyectos', 'proy-7')), notas: 'c', sellos: { notas: 13000 } }, campos: ['notas'], ts: 13000 });
    base.llamadas.length = 0;
    const rs = await S.bombear();
    eq('sin sesión: no se llama a NINGUNA función, y la operación espera', [llamadasDe().length, rs.valor.subidas, (await S.pendientes()).length, (await S.rechazadas()).length], [0, 0, 1, 0]);
    cierto('y la razón dice qué hacer', /Ajustes → Supabase/.test(S.estado().ultimo_error));
    base.cuenta.sesion = true;
    await relevo.salud();
    eq('al entrar, sale sola', (await S.bombear()).valor.subidas, 1);

    /* Una venta de ANTES del cambio: la base la conoce con el id de la copia (`proy-hoja-V-###`). */
    base.tablas.proyectos.push(filaProyecto({ id: 'proy-hoja-V-120', folio_hoja: 'V-120', folio_global: 'COT-0020@K7QM', nombre: 'Dani - Vieja' }));
    await DB.poner('proyectos', VENTA({ id: 'proy-viejo', folio_global: 'COT-0020@K7QM', notion_page_id: 'V-120', nombre: 'Dani - Vieja' }));
    base.llamadas.length = 0;
    await S.encolar({ id: 'op-vieja', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-viejo', datos: { ...(await DB.obtener('proyectos', 'proy-viejo')), etapa: 'cortado', sellos: { etapa: 14000 } }, campos: ['etapa'], ts: 14000 });
    const rv = await S.bombear();
    eq('la base no conoce el id de este teléfono: la busca por folio y reintenta', [rv.valor.subidas, llamadasDe().map(x => x[1].p_proyecto)], [1, ['proy-viejo', 'proy-hoja-V-120']]);
    base.llamadas.length = 0;
    await S.encolar({ id: 'op-req-viejo', tipo: 'crear', almacen: 'requerimientos', registro_id: 'proy-viejo:acr-3mm',
      datos: { id: 'proy-viejo:acr-3mm', proyecto_id: 'proy-viejo', material_id: 'acr-3mm', cantidad: 1, unidad_compra: 'lamina', estado: 'calculado' }, ts: 14001 });
    const rq = await S.bombear();
    eq('y su lista de compra va con el id de la base (la base exige que el proyecto exista)',
      [rq.valor.subidas, llamadasDe().map(x => x[1].p_ops && x[1].p_ops.map(o => [o.registro_id, o.datos.id, o.datos.proyecto_id]))],
      [1, [[['proy-hoja-V-120:acr-3mm', 'proy-hoja-V-120:acr-3mm', 'proy-hoja-V-120']]]]);
    eq('sin tocar la de este teléfono', (await S.pendientes()).length, 0);
  }

  console.log('\nFABRICACIÓN SIN DINERO');
  {
    const P = R.porArea(T.traducir({ id: 'o', tipo: 'actualizar', almacen: 'proyectos', campos: ['notas', 'anti_pactado', 'cuenta', 'etapa'],
      datos: VENTA({ notas: 'x', etapa: 'cortado', sellos: { notas: 1, etapa: 1 } }) }).llamadas, MATRIZ.fabricacion);
    eq('lo que Fabricación no escribe no se manda: ni corregir_venta', P.llamadas.map(x => x.rpc), ['proyecto_actualizar', 'mover_etapa']);
    eq('y se nombra (como los `escribibles` de la hoja)', P.fuera.map(x => x.nombre), ['anticipo', 'cuenta']);
    eq('Pagos no mueve la etapa', R.porArea(T.traducir({ id: 'o', tipo: 'actualizar', almacen: 'proyectos', campos: ['etapa'], datos: VENTA({ etapa: 'cortado' }) }).llamadas,
      MATRIZ.pagos).llamadas.length, 0);
    eq('sin permisos (una base que no los dijo) no se quita nada: decide la base',
      R.porArea([{ rpc: 'corregir_venta', args: { p_proyecto: 'x', p_cambios: { anticipo: 1 } } }], null).llamadas.length, 1);

    base.cuenta = { sesion: true, estado: 'activo', area: 'fabricacion', modo: 'base', correo: 'beto@al3d.mx' };
    await relevo.salud();
    base.llamadas.length = 0; respuestas.length = 0;
    const p = await DB.obtener('proyectos', 'proy-7');
    await S.encolar({ id: 'op-fab', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-7', datos: { ...p, notas: 'pintado', anti_pactado: 1, etapa: 'armado', sellos: { ...p.sellos, notas: 15000, etapa: 15000 } },
      campos: ['notas', 'anti_pactado', 'etapa'], ts: 15000 });
    const b = await S.bombear();
    eq('un cambio de Fabricación sube con lo suyo: la obra y la etapa, y el dinero NO viaja', [b.valor.subidas, llamadasDe().map(x => x[0])], [1, ['proyecto_actualizar', 'mover_etapa']]);
    eq('lo que no viajó se dice (la bandeja lo cuenta como incompleto)', [b.valor.motivo, respuestas[0][1].rechazadas.map(x => x.nombre)], ['ok_incompleto', ['anticipo']]);
    base.llamadas.length = 0;
    await DB.poner('proyectos', VENTA({ id: 'proy-10', folio_global: 'COT-0060@K7QM' }));
    await S.encolar({ id: 'op-alta-fab', tipo: 'crear', almacen: 'proyectos', registro_id: 'proy-10', datos: await DB.obtener('proyectos', 'proy-10'), ts: 15100 });
    const b2 = await S.bombear();
    eq('un alta desde Fabricación no se intenta: se aparta, con de dónde tiene que salir', [b2.valor.rechazadas, llamadasDe().length], [1, 0]);
    cierto('«dala de alta desde el de Dirección»', /Dirección/.test((await S.rechazadas()).find(x => x.id === 'op-alta-fab').ultimo_error));
    await S.descartarDelProyecto('proy-10');

    base.pedidas.length = 0;
    const j = await S.jalar();
    eq('Fabricación baja de la base sin pedir dinero', [j.ok, base.pedidas.includes('ventas_calculadas'), base.pedidas.includes('almacen_costos'), base.pedidas.includes('ventas_dinero')],
      [true, false, false, false]);
    const v = await DB.obtener('ventas_hoja', 'hoja:V-301');
    eq('y su récord no trae importes', ['sub', 'neto', 'anticipo', 'pago_pendiente', 'comisiones', 'cuenta'].map(k => v && v[k] !== undefined && v[k] !== null), [false, false, false, false, false, false]);
    base.cuenta = { sesion: true, estado: 'activo', area: 'direccion', modo: 'base', correo: 'ana@al3d.mx' };
    await relevo.salud();
  }

  console.log('\nLA BAJADA SALE DE LA BASE, NUNCA DE /jalar');
  {
    red.length = 0; base.pedidas.length = 0;
    const j = await S.jalar();
    eq('sale bien y no le pide NADA a la hoja', [j.ok, red.length], [true, 0]);
    const v = await DB.obtener('ventas_hoja', 'hoja:V-301');
    eq('el récord de Control se llena desde la base, con el dinero para Dirección', [v && v.folio_hoja, v && v.sub], ['V-301', 10000]);
    cierto('la fuente de las filas es la del relevo', Puente.leeDeOtraFuente());
    const antes = await DB.contar('ventas_hoja');
    const guardadas = base.tablas.proyectos;
    base.tablas.proyectos = [];
    const j2 = await S.jalar();
    eq('una lectura VACÍA no tira un récord lleno (no se toca nada de este teléfono)', [j2.ok, j2.codigo, await DB.contar('ventas_hoja')], [false, 'DESCONOCIDO', antes]);
    base.tablas.proyectos = guardadas;
    base.cuenta.sesion = false;
    await relevo.salud();
    base.pedidas.length = 0;
    const j3 = await S.jalar();
    eq('sin sesión no se lee nada (la RLS contestaría vacío) y no se toca nada', [j3.ok, j3.codigo, base.pedidas.length, await DB.contar('ventas_hoja')], [false, 'ROL_SIN_PERMISO', 0, antes]);
    base.cuenta.sesion = true;
    await relevo.salud();
  }

  console.log('\nSIN DOBLE ENVÍO: CON LA BASE MANDANDO, LA SOMBRA NO COPIA NI BOMBEA');
  {
    const E = await import('../js/datos/supa-enchufe.js');
    /* La sombra de pruebas encendida en el aparato de Dirección, con la empresa todavía en la hoja. */
    ls.al3d_pf_supa_sombra = JSON.stringify({ encendido: true });
    /* (El enchufe le pregunta a la base quién es esta cuenta, y con eso se guarda también el modo de la empresa.) */
    base.cuenta.modo = 'hoja';
    Supa.guardarModo({ estado: 'activo', modo: 'hoja', area: 'direccion' });
    const r0 = await E.arrancar({});
    eq('con la hoja mandando, la sombra se engancha como siempre', [r0.sombra, Supa.laBaseManda()], [true, false]);
    /* Dirección pasa la empresa a la base. El gancho que quedó puesto ya no copia nada… */
    base.cuenta.modo = 'base';
    Supa.guardarModo({ estado: 'activo', modo: 'base', area: 'direccion' });
    S.registrar(relevo);
    base.llamadas.length = 0;
    await DB.poner('proyectos', VENTA({ id: 'proy-11', folio_global: 'COT-0061@K7QM' }));
    await S.encolar({ id: 'op-alta-11', tipo: 'crear', almacen: 'proyectos', registro_id: 'proy-11', datos: await DB.obtener('proyectos', 'proy-11'), ts: 16000 });
    await S.bombear();
    const cola = await Sb.almacenIndexedDB().listar('cola');
    eq('…la operación llega a la base UNA vez y la cola de la sombra no la copia', [llamadasDe().filter(x => x[0] === 'ganar_proyecto').length, cola.map(x => x.id)], [1, []]);
    eq('su bombeo no manda nada', (await E.bombearSombra()).motivo, 'modo_base');
    /* …y al volver a arrancar (el aviso `al3d-modo`), ni se engancha. */
    const r1 = await E.arrancar({});
    eq('al arrancar con la base mandando: sin sombra, con Realtime para saber cuándo bajar', [r1.sombra, r1.base, r1.vivo], [false, true, true]);
    const st = await E.estado();
    eq('Ajustes lo ve así', [st.base, st.vivo, st.leeDeLaBase], [true, true, true]);
    cierto('Realtime se suscribe a las tablas del área', canales.length > 0 && canales[canales.length - 1].tablas.includes('proyectos'));
    base.llamadas.length = 0;
    await S.encolar({ id: 'op-notas-11', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-11', datos: { ...(await DB.obtener('proyectos', 'proy-11')), notas: 'x', sellos: { notas: 16100 } }, campos: ['notas'], ts: 16100 });
    await S.bombear();
    await E.bombearSombra();
    eq('una operación más: una llamada, y la cola de la sombra sigue vacía', [llamadasDe().length, (await Sb.almacenIndexedDB().listar('cola')).length], [1, 0]);
    /* De vuelta a la hoja: el enchufe quita lo de la base y la sombra vuelve. */
    base.cuenta.modo = 'hoja';
    Supa.guardarModo({ estado: 'activo', modo: 'hoja', area: 'direccion' });
    const r2 = await E.arrancar({});
    eq('de vuelta en la hoja: la sombra se vuelve a enganchar y Realtime de la base se quita', [r2.sombra, (await E.estado()).base], [true, false]);
    E.apagar();
    delete ls.al3d_pf_supa_sombra;
  }

  console.log('\nLO PURO');
  {
    eq('noSalio: lo definitivo lleva `definitivo` y la función', R.noSalio('o', { caso: 'rechazada', codigo: 'DATO_INVALIDO', mensaje: 'no', rpc: 'mover_etapa' }),
      { id: 'o', ok: false, codigo: 'DATO_INVALIDO', definitivo: true, mensaje: 'no (mover_etapa)' });
    eq('noSalio: lo demás para el bombeo, con el código de la base aparte', R.noSalio('o', { caso: 'reintentar', codigo: 'SIN_SESION', mensaje: 'x' }),
      { id: 'o', ok: false, codigo: 'ROL_SIN_PERMISO', codigo_base: 'SIN_SESION', mensaje: 'x' });
    eq('porQueNo: sin red es SIN_RED', R.porQueNo({ estado: 'desconocido', mensaje: 'Sin conexión' }).codigo, 'SIN_RED');
    eq('porQueNo: lo demás es de la puerta', ['sin_sesion', 'acceso_revocado', 'sin_acceso'].map(e => R.porQueNo({ estado: e }).codigo), ['ROL_SIN_PERMISO', 'ROL_SIN_PERMISO', 'ROL_SIN_PERMISO']);
    eq('la sombra exporta el MISMO traductor (supabase/tests lo importa de ahí)', [Sb.traducir === T.traducir, Sb.leerRespuesta === T.leerRespuesta], [true, true]);
  }
} catch (e) {
  mal++;
  console.log('  FALLA la prueba tronó: ' + (e && e.stack || e));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
