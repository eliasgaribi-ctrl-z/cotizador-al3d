/* LA SOMBRA DE SUPABASE (fase 3, APAGADA) — js/datos/supa-sombra.js, supa-enchufe.js y el gancho de sync.js.
 *
 * Lo que se vigila:
 *   · APAGADO NO CARGA NI LLAMA NADA NUEVO. Un teléfono de Dirección de verdad (js/datos con su
 *     IndexedDB de mentiras) contra el Apps Script DE VERDAD (pruebas/comun/hoja-de-mentiras.mjs):
 *     gana una venta, la manda, la baja, le mueve la etapa. Con los interruptores apagados, toda la red
 *     es la URL del puente, no se crea ningún <script>, no se abre ninguna base local nueva y los
 *     ganchos valen null. Y lo mismo leyendo el código: nadie importa los módulos nuevos de forma
 *     estática, y app.js solo los carga con los dos interruptores;
 *   · que la sombra, encendida, no cambia el bombeo: mismas respuestas, y si truena, la hoja ni se entera;
 *   · el traductor bandeja → funciones de la base (supabase/DISENO.md §7.4), con el `op_id`;
 *   · la cola: idempotente por id, en orden, se para con la red y sigue con lo definitivo, resuelve
 *     el id del proyecto por folio, reintenta lo rechazado y anota todo en el registro.
 *
 * No toca Supabase: el cliente es un doble. Se corre con pruebas/correr.sh, como todas. */

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
const NUEVOS = ['supa-sombra', 'supa-vivo', 'supa-cuadre', 'supa-enchufe', 'supa-imagenes'];

/* ── El mundo: un teléfono de Dirección y la hoja ─────────────────────────────────────────── */
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

H = hojaDeMentiras({ tokens: { [TOKEN]: 'direccion' } });
H.run('prepararHojaParaElPuente()');

const DB = await import('../js/datos/db.js');
const S = await import('../js/datos/sync.js');
const Puente = await import('../js/datos/puente.js');
const Sb = await import('../js/datos/supa-sombra.js');
await DB.abrir();
S.registrar(Puente.crear({ url: URL_PUENTE, token: TOKEN }));

const VENTA = (o = {}) => ({ id: 'proy-1', folio_local: 'COT-0042', dispositivo: 'K7QM', folio_global: 'COT-0042@K7QM',
  nombre: 'Ana - Café', contacto: 'Ana', negocio: 'Café', etapa: 'ganado', tipo_trabajo: ['Letras 3D con iluminacion'],
  fecha_ganado: '2026-10-01', dir_texto: 'Av. Vallarta 1', lat: 20.6736, lng: -103.344, geo_fuente: 'maps_pin',
  sub: 10000, neto: 11600, precio_auth: 11600, anti_pactado: 5000, iva: true, notion_page_id: null, notion_estado: 'pendiente',
  estatus_notion: 'FABRICACION', cuenta: 'Constru BNT', pct_comision: 10, plazo_k: null, notas: '', tel: '33 1000 0000',
  entrega: 'instalacion', origen: { folio: 'COT-0042', items: [] },
  sellos: { etapa: 1000, tel: 1000, dir_texto: 1000, ubicacion: 1000 }, creado_en: 1000, actualizado_en: 1000, sync: 0, ...o });

try {
  console.log('\nAPAGADO NO CARGA NI LLAMA NADA NUEVO (un teléfono de verdad contra la hoja de verdad)');
  {
    eq('los interruptores nacen apagados', [Sb.sombraEncendida(), Sb.vivoEncendido()], [false, false]);
    await DB.poner('proyectos', VENTA());
    await S.encolar({ tipo: 'crear', almacen: 'proyectos', registro_id: 'proy-1', datos: await DB.obtener('proyectos', 'proy-1'), campos: null, ts: 1000 });
    const b1 = await S.bombear();
    eq('la venta sube a la hoja como siempre', [b1.ok, b1.valor.subidas, b1.valor.fallidas], [true, 1, 0]);
    const j = await S.jalar();
    cierto('y baja', j.ok);
    const p = await DB.obtener('proyectos', 'proy-1');
    await DB.poner('proyectos', { ...p, etapa: 'en_diseno', sellos: { ...p.sellos, etapa: 2000 } });
    await S.encolar({ tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-1', datos: await DB.obtener('proyectos', 'proy-1'), campos: ['etapa'], ts: 2000 });
    const b2 = await S.bombear();
    eq('mover la etapa también', [b2.valor.subidas, b2.valor.fallidas], [1, 0]);
    eq('TODA la red fue la URL del puente: ni una petición a Supabase', [...new Set(red)], [URL_PUENTE]);
    eq('no se creó ningún <script> (la librería de Supabase no se cargó)', scripts, []);
    eq('la única base local que se abrió es la de siempre (no la de la sombra)', [...new Set(abiertas)], ['al3d_pf']);
    cierto('la fuente de las filas sigue siendo la hoja', !Puente.leeDeOtraFuente());

    const todos = [];
    const recorrer = d => { for (const f of readdirSync(join(RAIZ, d), { withFileTypes: true })) {
      if (f.isDirectory()) recorrer(d + '/' + f.name); else if (f.name.endsWith('.js')) todos.push(d + '/' + f.name); } };
    recorrer('js');
    const estaticos = todos.filter(f => NUEVOS.some(m => new RegExp('^\\s*import[^;(]*' + m + '\\.js', 'm').test(leer(f))) &&
      !NUEVOS.some(m => f.endsWith('/' + m + '.js')));
    eq('ningún módulo de la app los importa de forma estática (solo se importan entre ellos)', estaticos, []);
    const app = sinComentarios(leer('js/app.js'));
    cierto('app.js solo carga el enchufe con el interruptor general Y el de la sombra, con import()',
      /if \(\/"encendido":true\/\.test\(localStorage\.getItem\('al3d_pf_supa'\) \|\| ''\) &&\s*\/"encendido":true\/\.test\(localStorage\.getItem\('al3d_pf_supa_sombra'\) \|\| ''\)\) \{\s*import\('\.\/datos\/supa-enchufe\.js'\)/.test(app));
    eq('y las claves que mira son las del módulo', [Sb.CLAVE_GENERAL, Sb.CLAVE_SOMBRA], ['al3d_pf_supa', 'al3d_pf_supa_sombra']);
    cierto('la vuelta de 30 s solo se salta la bajada si la lectura en vivo lo dice (y vale null por omisión)',
      /let _lecturaEnVivo = null;/.test(app) && /if \(!\(_lecturaEnVivo && _lecturaEnVivo\.saltarJalar\(\)\)\) try \{/.test(app));
    const aj = sinComentarios(leer('js/mod/ajustes.js'));
    cierto('Ajustes solo pinta el bloque a Dirección activa con sesión, dentro de la tarjeta de Supabase',
      /if \(a\.estado === 'activo' && a\.area === 'direccion'\) html \+= await bloquePersonas\(Supa\) \+ await bloqueSombra\(\);/.test(aj));
    cierto('y lo carga con import()', /await import\('\.\.\/datos\/supa-sombra\.js'\)/.test(aj) && /await import\('\.\.\/datos\/supa-enchufe\.js'\)/.test(aj));
    const sy = sinComentarios(leer('js/datos/sync.js'));
    cierto('el gancho de sync nace en null y solo se llama si existe', /let _alSubir = null;/.test(sy) && /if \(_alSubir\) \{ try \{ await _alSubir\(op, respuesta\); \} catch \(_\) \{/.test(sy));
    const pu = sinComentarios(leer('js/datos/puente.js'));
    cierto('la fuente del relevo nace en null y sin ella se pide /jalar como siempre',
      /let _fuente = null;/.test(pu) && /const r = fuente \? \{ cuerpo: await fuente\.filas\(cursor\) \}\s*: await pedir\(cfg, '\/jalar'/.test(pu));
    cierto('los interruptores no viajan en los respaldos (no están en Prefs)', !/al3d_pf_supa/.test(leer('js/datos/prefs.js')));
    const sw = leer('sw.js');
    cierto('el service worker los lleva en el conjunto versionado', NUEVOS.every(m => sw.includes("'./js/datos/" + m + ".js'")));
  }

  console.log('\nENCENDIDA, LA SOMBRA NO CAMBIA EL BOMBEO');
  {
    const vistos = [];
    S.alSubir(async (op, r) => { vistos.push([op.id, op.almacen, op.tipo, !!(r && r.ok)]); });
    const p = await DB.obtener('proyectos', 'proy-1');
    await DB.poner('proyectos', { ...p, notas: 'llamar antes', sellos: { ...p.sellos, notas: 3000 } });
    await S.encolar({ id: 'op-notas', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-1', datos: await DB.obtener('proyectos', 'proy-1'), campos: ['notas'], ts: 3000 });
    const b = await S.bombear();
    eq('sube igual', [b.valor.subidas, b.valor.fallidas], [1, 0]);
    eq('y la sombra recibe lo que la hoja aceptó', vistos, [['op-notas', 'proyectos', 'actualizar', true]]);
    S.alSubir(async () => { throw new Error('la base está caída'); });
    const p2 = await DB.obtener('proyectos', 'proy-1');
    await DB.poner('proyectos', { ...p2, notas: 'otra', sellos: { ...p2.sellos, notas: 4000 } });
    await S.encolar({ id: 'op-notas-2', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-1', datos: await DB.obtener('proyectos', 'proy-1'), campos: ['notas'], ts: 4000 });
    const b2 = await S.bombear();
    eq('si la sombra truena, la hoja ni se entera y la bandeja queda vacía', [b2.valor.subidas, b2.valor.fallidas, (await S.pendientes()).length], [1, 0, 0]);
    S.alSubir(null);
    eq('y se desenchufa con null', vistos.length, 1);
  }

  console.log('\nLOS INTERRUPTORES');
  {
    Sb.encenderSombra(true);
    eq('la sombra sola no basta: hace falta el general', Sb.sombraEncendida(), false);
    ls.al3d_pf_supa = JSON.stringify({ encendido: true });
    eq('con el general, sí', Sb.sombraEncendida(), true);
    Sb.encenderVivo(true);
    eq('la lectura en vivo pide la sombra encendida', Sb.vivoEncendido(), true);
    Sb.encenderSombra(false);
    eq('apagar la sombra apaga también la lectura en vivo', [Sb.sombraEncendida(), Sb.vivoEncendido(), ls.al3d_pf_supa_vivo], [false, false, undefined]);
    ls.al3d_pf_supa_sombra = 'basura{';
    eq('una clave dañada es «apagado»', Sb.sombraEncendida(), false);
    delete ls.al3d_pf_supa; delete ls.al3d_pf_supa_sombra;
  }

  console.log('\nEL TRADUCTOR: BANDEJA → FUNCIONES DE LA BASE (DISENO.md §7.4)');
  {
    const v = VENTA();
    const alta = Sb.traducir({ id: 'op-1', tipo: 'crear', almacen: 'proyectos', datos: v, ts: 1000 });
    eq('un alta de una venta del cotizador es ganar_proyecto', alta.llamadas.map(x => x.rpc), ['ganar_proyecto']);
    const a = alta.llamadas[0].args.p_op;
    eq('con los nombres de la base (fecha_ganado→fecha_anticipo, anti_pactado→venta.anti, estatus_notion→venta.estatus)',
      [a.id, a.folio_global, a.fecha_anticipo, a.venta.sub, a.venta.anti, a.venta.estatus, a.venta.cuenta, a.venta.iva, a.venta.pct_comision],
      ['proy-1', 'COT-0042@K7QM', '2026-10-01', 10000, 5000, 'FABRICACION', 'Constru BNT', true, 10]);
    eq('con sus sellos por grupo, su pin y su cotización como entrada', [a.sellos.etapa, a.lat, a.lng, !!a.entrada], [1000, 20.6736, -103.344, true]);
    cierto('sin las marcas de este teléfono (notion_*, sync)', !('notion_page_id' in a) && !('sync' in a) && !('notion_estado' in a));
    eq('una lápida es descartar_cotizacion', Sb.traducir({ id: 'op', tipo: 'crear', almacen: 'proyectos', datos: VENTA({ etapa: 'cancelado', notas: 'caro' }) }).llamadas
      .map(x => [x.rpc, x.args.p_op.motivo]), [['descartar_cotizacion', 'caro']]);
    cierto('un alta sin folio de cotización (importada) no la da de alta la sombra',
      Sb.traducir({ id: 'op', tipo: 'crear', almacen: 'proyectos', datos: VENTA({ folio_global: '' }) }).omitir);

    const et = Sb.traducir({ id: 'op-2', tipo: 'actualizar', almacen: 'proyectos', campos: ['etapa'], datos: VENTA({ etapa: 'cortado', sellos: { etapa: 5000 } }), ts: 5100 });
    eq('mover la etapa es mover_etapa con el sello de la etapa', et.llamadas.map(x => [x.rpc, x.args.p_etapa, x.args.p_sello]), [['mover_etapa', 'cortado', 5000]]);
    const din = Sb.traducir({ id: 'op-3', tipo: 'actualizar', almacen: 'proyectos', campos: ['anti_pactado', 'estatus_notion', 'cuenta'], datos: VENTA({ anti_pactado: 7000, estatus_notion: 'COBRANDO' }) });
    eq('el dinero va por corregir_venta con los nombres de la base', din.llamadas.map(x => [x.rpc, x.args.p_cambios]),
      [['corregir_venta', { anticipo: 7000, cuenta: 'Constru BNT', estatus: 'COBRANDO' }]]);
    const ob = Sb.traducir({ id: 'op-4', tipo: 'actualizar', almacen: 'proyectos', campos: ['notas', 'lat', 'lng'], datos: VENTA({ notas: 'x', sellos: { notas: 6000, ubicacion: 6000 } }) });
    eq('la obra va por proyecto_actualizar con el id de la operación como op_id', ob.llamadas.map(x => [x.rpc, x.args.p_op.op_id]), [['proyecto_actualizar', 'op-4']]);
    eq('y la ubicación viaja entera (lat, lng, link y fuente)', Object.keys(ob.llamadas[0].args.p_op.campos).sort(), ['geo_fuente', 'lat', 'lng', 'maps_url', 'notas']);
    const mix = Sb.traducir({ id: 'op-5', tipo: 'actualizar', almacen: 'proyectos', campos: ['notas', 'etapa', 'sub'], datos: VENTA({ etapa: 'armado' }) });
    eq('un cambio de varias cosas: primero la obra, luego el dinero, al final la etapa', mix.llamadas.map(x => x.rpc), ['proyecto_actualizar', 'corregir_venta', 'mover_etapa']);
    const viejo = Sb.traducir({ id: 'op-6', tipo: 'actualizar', almacen: 'proyectos', campos: null, datos: VENTA() });
    eq('una operación vieja sin «campos» manda solo la obra (ni dinero ni etapa)', viejo.llamadas.map(x => x.rpc), ['proyecto_actualizar']);
    cierto('un cambio de puras marcas de este teléfono no llama a nada', Sb.traducir({ id: 'o', tipo: 'actualizar', almacen: 'proyectos', campos: ['notion_estado'], datos: VENTA() }).omitir);

    const inst = { id: 'inst-1', proyecto_id: 'proy-1', fecha: '2026-11-02', hora: '10:00', ventana: 'dia', duracion_min: 180, estado: 'confirmada', notas: 'n', actualizado_en: 7000 };
    const ti = Sb.traducir({ id: 'op-7', tipo: 'crear', almacen: 'instalaciones', datos: inst, ts: 7001 });
    eq('una cita es instalacion_guardar con su sello y sus notas al crearla', ti.llamadas.map(x => [x.rpc, x.args.p_op.sello, x.args.p_op.notas]), [['instalacion_guardar', 7000, 'n']]);
    eq('al cambiarla no manda las notas completas (la base pide el renglón nuevo)', 'notas' in Sb.traducir({ id: 'op-8', tipo: 'actualizar', almacen: 'instalaciones', datos: inst }).llamadas[0].args.p_op, false);
    const ta = Sb.traducir({ id: 'op-9', tipo: 'apendice', almacen: 'movimientos', registro_id: 'mov-1', datos: { id: 'mov-1', tipo: 'entrada', cantidad: 5, sync: 0 } });
    eq('el almacén va por almacen_aplicar, con el id de la operación y sin la marca sync',
      ta.llamadas.map(x => [x.rpc, x.args.p_ops[0].id, x.args.p_ops[0].almacen, 'sync' in x.args.p_ops[0].datos]), [['almacen_aplicar', 'op-9', 'movimientos', false]]);
    cierto('los avisos no van a la base', Sb.traducir({ id: 'o', tipo: 'actualizar', almacen: 'avisos', datos: {} }).omitir);
  }

  console.log('\nLO QUE CONTESTA LA BASE');
  {
    const L = Sb.leerRespuesta;
    eq('ok', L('mover_etapa', { data: { ok: true, etapa: 'cortado' } }).caso, 'ok');
    eq('el reintento de un alta que ya llegó: ok (ya_existia)', L('ganar_proyecto', { data: { ok: true, ya_existia: true } }), { caso: 'ok', detalle: 'ya_existia' });
    eq('la venta que la base ya tiene con otro id (la importación): ok', L('ganar_proyecto', { data: { ok: false, codigo: 'DUPLICADO' } }).caso, 'ok');
    eq('un cambio que otro teléfono ganó después: ok (gana el otro)', L('proyecto_actualizar', { data: { ok: true, viejos: [{ nombre: 'notas' }] } }).detalle, 'gana_otro');
    eq('rol sin permiso: rechazada', L('corregir_venta', { data: { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'no' } }).caso, 'rechazada');
    eq('dato inválido: rechazada', L('mover_etapa', { data: { ok: false, codigo: 'DATO_INVALIDO' } }).caso, 'rechazada');
    eq('sin sesión: se reintenta', L('mover_etapa', { data: { ok: false, codigo: 'SIN_SESION' } }).caso, 'reintentar');
    eq('acceso retirado: se reintenta (no se descarta nada)', L('mover_etapa', { data: { ok: false, codigo: 'ACCESO_REVOCADO' } }).caso, 'reintentar');
    eq('app vieja: se reintenta', L('mover_etapa', { data: { ok: false, codigo: 'CLIENTE_VIEJO' } }).caso, 'reintentar');
    eq('un error de red o de PostgREST: se reintenta', L('mover_etapa', { error: { code: 'PGRST301', message: 'JWT expired' } }).caso, 'reintentar');
    eq('una respuesta vacía: se reintenta', L('mover_etapa', { data: null }).caso, 'reintentar');
    eq('el almacén mira el resultado de la operación', L('almacen_aplicar', { data: { ok: true, resultados: [{ ok: false, codigo: 'DATO_INVALIDO', mensaje: 'x' }] } }).caso, 'rechazada');
    eq('y un «ya estaba» es ok', L('almacen_aplicar', { data: { ok: true, resultados: [{ ok: true, creada: false }] } }).caso, 'ok');
  }

  console.log('\nLA COLA: IDEMPOTENTE, EN ORDEN, Y LA HOJA SIGUE MANDANDO');
  {
    /* El doble de supabase-js: cada RPC contesta lo que diga `guion`, y anota lo que se le pidió. */
    const llamadas = [];
    let guion = () => ({ data: { ok: true } });
    const proyectosBase = [{ id: 'proy-canonico', folio_global: 'COT-0042@K7QM', folio_hoja: 'V-001' }];
    const cliente = {
      rpc: async (n, a) => { llamadas.push([n, JSON.parse(JSON.stringify(a))]); return guion(n, a); },
      from: t => {
        const q = { _f: '', select() { return q; }, or(f) { q._f = f; return q; },
          limit() { return Promise.resolve({ data: proyectosBase.filter(p => q._f.split(',').some(c => { const k = c.split('.')[0]; return p[k] === c.slice(k.length + 4); })), error: null }); } };
        return t === 'proyectos' ? q : null;
      },
    };
    let reloj = 100;
    const almacen = Sb.almacenEnMemoria();
    const sombra = Sb.crearSombra({ cliente: async () => cliente, almacen, ahora: () => ++reloj, enLinea: () => true });
    const op = (id, o = {}) => ({ id, tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-1', campos: ['notas'], datos: VENTA({ notas: id, sellos: { notas: 9 } }), ts: 9, ...o });

    await sombra.encolar(op('op-a'), { ok: true });
    await sombra.encolar(op('op-a'), { ok: true });
    eq('la misma operación dos veces (la app se cerró a medio bombeo) es UNA en la cola', (await sombra.pendientes()).length, 1);
    await sombra.encolar(op('op-b'), { ok: true });
    await sombra.encolar(op('op-c'), { ok: true });

    guion = () => ({ error: { code: '', message: 'TypeError: Failed to fetch' } });
    const r1 = await sombra.bombear();
    eq('sin red se para en la primera y no toca las demás', [r1.mandadas, r1.pendientes, r1.motivo, llamadas.length], [0, 3, 'parada', 1]);
    eq('la primera suma un intento y guarda el error', (await sombra.pendientes()).map(x => x.intentos), [1, 0, 0]);

    guion = (n, a) => (a.p_op && a.p_op.op_id === 'op-b') ? { data: { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'no' } } : { data: { ok: true } };
    llamadas.length = 0;
    const r2 = await sombra.bombear();
    eq('con red: manda en orden, aparta la definitiva y sigue', [r2.mandadas, r2.rechazadas, r2.pendientes], [2, 1, 0]);
    eq('en el orden en que la hoja las aceptó', llamadas.map(x => x[1].p_op.op_id), ['op-a', 'op-b', 'op-c']);
    eq('la rechazada se queda guardada con su razón', (await sombra.rechazadas()).map(x => [x.id, x.codigo]), [['op-b', 'DATO_INVALIDO']]);

    guion = () => ({ data: { ok: true } });
    eq('se puede volver a la cola', await sombra.reintentarRechazadas(), 1);
    const r3 = await sombra.bombear();
    eq('y sale', [r3.mandadas, (await sombra.rechazadas()).length], [1, 0]);

    /* El proyecto que la base conoce con OTRO id (la importación le dio el canónico). */
    llamadas.length = 0;
    guion = (n, a) => (a.p_op && a.p_op.id === 'proy-1') ? { data: { ok: false, codigo: 'NO_ENCONTRADO' } } : { data: { ok: true } };
    await sombra.encolar(op('op-d'), { ok: true, remoto: { id_notion: 'V-001' } });
    const r4 = await sombra.bombear();
    eq('si la base no conoce el id de este teléfono, lo busca por folio y reintenta', [r4.mandadas, llamadas.map(x => x[1].p_op.id)], [1, ['proy-1', 'proy-canonico']]);
    await sombra.encolar(op('op-e'), { ok: true });
    llamadas.length = 0;
    await sombra.bombear();
    eq('y lo recuerda', llamadas.map(x => x[1].p_op.id), ['proy-canonico']);

    const reg = await sombra.registro(50);
    cierto('todo quedó en el registro (escritas, rechazada, reintentos)', ['escrita', 'rechazada', 'reintentar', 'reintento'].every(t => reg.some(x => x.tipo === t)));
    cierto('el registro no guarda la operación ni importes: solo el qué y el porqué', reg.every(x => !('op' in x) && !('datos' in x)));
    for (let i = 0; i < 230; i++) await sombra.anotar({ tipo: 'escrita' });
    eq('y tiene tope de 200', (await almacen.listar('registro')).length, 200);
    eq('nada de esto escribe en la copia local de la app', (await DB.obtener('proyectos', 'proy-1')).notas, 'otra');

    const sinCliente = Sb.crearSombra({ cliente: async () => { throw new Error('Failed to fetch vendor/supabase.js'); }, almacen: Sb.almacenEnMemoria(), enLinea: () => true });
    await sinCliente.encolar(op('op-z'), { ok: true });
    const r5 = await sinCliente.bombear();
    eq('si la librería no carga, nada se pierde: se queda en la cola', [r5.motivo, r5.pendientes], ['sin_cliente', 1]);
    const sinRed = Sb.crearSombra({ cliente: async () => cliente, almacen: Sb.almacenEnMemoria(), enLinea: () => false });
    await sinRed.encolar(op('op-y'), { ok: true });
    eq('sin señal ni lo intenta', (await sinRed.bombear()).motivo, 'sin_red');
  }

  console.log('\nEL V-### DE LA HOJA VIAJA A LA BASE (Q-07, decidida por Elías el 2026-10-16; 0015_folio_de_la_hoja.sql)');
  {
    /* Con la hoja de verdad: un alta sube, la hoja le da su V-###, la sombra lo guarda y se lo manda a ganar_proyecto. */
    const llamadas = [];
    let guion = () => ({ data: { ok: true } });
    const cliente = { rpc: async (n, a) => { llamadas.push([n, JSON.parse(JSON.stringify(a))]); return guion(n, a); }, from: () => null };
    let reloj = 5000;
    const almacen = Sb.almacenEnMemoria();
    const sombra = Sb.crearSombra({ cliente: async () => cliente, almacen, ahora: () => ++reloj, enLinea: () => true });
    S.alSubir(sombra.encolar);
    await DB.poner('proyectos', VENTA({ id: 'proy-2', folio_local: 'COT-0043', folio_global: 'COT-0043@K7QM', nombre: 'Beto - Tienda' }));
    await S.encolar({ id: 'op-alta-2', tipo: 'crear', almacen: 'proyectos', registro_id: 'proy-2', datos: await DB.obtener('proyectos', 'proy-2'), campos: null, ts: 5000 });
    const b = await S.bombear();
    S.alSubir(null);
    const enCola = await sombra.pendientes();
    eq('la hoja da de alta la venta y la sombra guarda la copia con el V-### que contestó la hoja',
      [b.valor.subidas, enCola.length, /^V-\d{3,7}$/.test(String(enCola[0] && enCola[0].folio_hoja))], [1, 1, true]);
    const folio = enCola[0].folio_hoja;
    eq('es el mismo folio que quedó en la fila de la hoja (y en este teléfono)', (await DB.obtener('proyectos', 'proy-2')).notion_page_id, folio);
    const r1 = await sombra.bombear();
    eq('ganar_proyecto recibe ESE folio', [r1.mandadas, llamadas.map(x => [x[0], x[1].p_op.folio_hoja])], [1, [['ganar_proyecto', folio]]]);

    /* El traductor, puro. */
    const alta = op => Sb.traducir({ id: 'op', tipo: 'crear', almacen: 'proyectos', datos: VENTA(), ts: 1 }, op).llamadas[0].args.p_op;
    eq('sin folio de la hoja (una respuesta vieja) no manda la llave: la base pone el suyo, como antes', ['folio_hoja' in alta(), 'folio_hoja' in alta({ folio_hoja: '' })], [false, false]);
    eq('con él, va tal cual (la base valida el formato)', [alta({ folio_hoja: 'V-310' }).folio_hoja, alta({ folio_hoja: ' V-1000 ' }).folio_hoja], ['V-310', 'V-1000']);
    eq('solo el alta lo lleva: un cambio no', 'folio_hoja' in Sb.traducir({ id: 'o', tipo: 'actualizar', almacen: 'proyectos', campos: ['notas'], datos: VENTA({ notas: 'x' }) }, { folio_hoja: 'V-310' }).llamadas[0].args.p_op, false);

    /* Si choca: se aparta con su motivo y las demás siguen. */
    llamadas.length = 0;
    guion = n => n === 'ganar_proyecto'
      ? { data: { ok: false, codigo: 'DATO_INVALIDO', definitivo: true, causa: 'folio_ocupado', folio_hoja: 'V-310', proyecto_id: 'otro',
                  mensaje: 'El folio V-310 de la hoja ya es de otro proyecto en la base: la venta no se da de alta con un folio repetido.' } }
      : { data: { ok: true } };
    await sombra.encolar({ id: 'op-alta-3', tipo: 'crear', almacen: 'proyectos', registro_id: 'proy-3', datos: VENTA({ id: 'proy-3', folio_global: 'COT-0044@K7QM' }), ts: 6000 },
      { ok: true, remoto: { id_notion: 'V-310' } });
    await sombra.encolar({ id: 'op-notas-9', tipo: 'actualizar', almacen: 'proyectos', registro_id: 'proy-9', campos: ['notas'], datos: VENTA({ id: 'proy-9', notas: 'sigue', sellos: { notas: 7 } }), ts: 7 },
      { ok: true });
    const r2 = await sombra.bombear();
    eq('un folio ocupado: la copia se aparta como rechazada y la siguiente sale (no bloquea)', [r2.mandadas, r2.rechazadas, r2.pendientes, llamadas.map(x => x[0])],
      [1, 1, 0, ['ganar_proyecto', 'proyecto_actualizar']]);
    const ap = (await sombra.rechazadas())[0];
    eq('con su motivo, que nombra el folio', [ap.id, ap.codigo, ap.rpc, /V-310/.test(ap.ultimo_error) && /otro proyecto/.test(ap.ultimo_error)], ['op-alta-3', 'DATO_INVALIDO', 'ganar_proyecto', true]);
    cierto('y queda en el registro', (await sombra.registro(10)).some(x => x.tipo === 'rechazada' && x.op_id === 'op-alta-3' && /V-310/.test(x.mensaje)));
    eq('el reintento de un alta que la base ya tenía con OTRO V-### se dice en el registro',
      Sb.leerRespuesta('ganar_proyecto', { data: { ok: true, ya_existia: true, folio_hoja: 'V-007', folio_hoja_pedido: 'V-310' } }),
      { caso: 'ok', detalle: 'ya_existia como V-007, la hoja dice V-310' });
  }
} catch (e) {
  mal++;
  console.log('  FALLA la prueba tronó: ' + (e && e.stack || e));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
