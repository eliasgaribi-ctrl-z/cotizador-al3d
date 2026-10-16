/* LA FUNCIÓN `autorizar` DE SUPABASE CONTRA EL APPS SCRIPT REAL.

   Dirección autoriza un precio y sale un sello: un HMAC que va impreso en el PDF y que /verificar
   vuelve a calcular. Si la función firmara UN byte distinto de lo que firma hoy la hoja, un PDF
   sellado por ella y verificado por la otra diría «No auténtica». Por eso esta prueba no compara
   contra lo que «debería» salir: carga puente/hoja-apps-script.gs TAL CUAL en una vm, con una hoja de
   mentiras y un Utilities fiel al de Apps Script (ASCII con «?», comprobado en Apps Script real: ver
   pruebas/supabase-sello.mjs), y le exige a la reescritura LO MISMO que hace el .gs:

     1. función por función (catálogo, subtotal, huella, total, renglones, limpieza): miles al azar;
     2. la ruta entera: para miles de cuerpos al azar —válidos y rotos— la respuesta de rutaAutorizar_
        y la de la reescritura son el mismo JSON byte por byte, y el renglón que el .gs escribe en
        «Autorizaciones» es exactamente lo que la función manda a la base (texto firmado, firma, código);
     3. el manejador HTTP con dobles: sesión, Dirección, clave, la RPC, lo que pasa si algo falla, que
        ningún secreto salga;
     4. con la base de verdad (PGlite, si están las dependencias de supabase/tests): lo que la función
        firma y guarda por `registrar_autorizacion` lo verifica /verificar desde la fila guardada.
   Todas las claves son FALSAS. Se corre con pruebas/correr.sh, como todas. */

import { readFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import * as Sello from '../supabase/functions/_shared/sello.js';
import * as Precio from '../supabase/functions/_shared/precio.js';
import * as Aut from '../supabase/functions/_shared/autorizar.js';
import { manejar, empresaDeDireccion } from '../supabase/functions/autorizar/handler.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (...p) => readFileSync(join(RAIZ, ...p), 'utf8');
let pasan = 0, fallos = 0;
const recortar = (s, n = 400) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));
const bien = m => { pasan++; console.log('  ✓ ' + m); };
const mal = m => { fallos++; console.log('  ✗ ' + m); };
const eq = (que, dio, esp) => { const a = JSON.stringify(dio), b = JSON.stringify(esp); if (a === b) bien(que); else mal(que + '\n         dio: ' + recortar(a) + '\n         esp: ' + recortar(b)); };
const cierto = (que, x) => eq(que, !!x, true);
const seccion = t => console.log('\n' + t);

const CLAVE = 'CLAVE-FALSA-SOLO-PARA-PRUEBAS-ñandú-🔑-0000';      // con no ASCII a propósito: ascii-? y utf-8 la vuelven bytes distintos
const CORREO = 'dir@al3d.test';

/* ============================================================================
   El .gs en una vm, con una hoja de mentiras que SÍ escribe
   ============================================================================ */
const asciiInterr = s => Uint8Array.from([...String(s)].map(c => (c.codePointAt(0) < 128 ? c.codePointAt(0) : 63)));
const aSigno = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const noImplementado = new Proxy({}, { get: () => () => { throw new Error('servicio de Google no disponible en la prueba'); } });

function hojaFalsa() {
  const filas = [];      // filas[0] = cabecera
  const celda = v => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);      // el apóstrofo de txt() no se guarda: la hoja lo quita
  const h = {
    filas,
    getLastRow: () => filas.length,
    setFrozenRows() {}, hideSheet() {},
    getRange(f, c, nf = 1, nc = 1) {
      const r = {
        getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc }, (_, j) => { const x = (filas[f - 1 + i] || [])[c - 1 + j]; return x === undefined ? '' : x; })),
        setValues: v => { v.forEach((fila, i) => { const k = f - 1 + i; filas[k] = filas[k] || []; fila.forEach((x, j) => { filas[k][c - 1 + j] = celda(x); }); }); return r; },
        getValue: () => r.getValues()[0][0], setValue: x => r.setValues([[x]]),
        setFontWeight: () => r, setBackground: () => r, setFontColor: () => r,
      };
      return r;
    },
  };
  return h;
}

function gsDe() {
  const e = { hojas: {}, ahora: Date.UTC(2026, 9, 16, 18, 4, 11, 123) };
  const ss = {
    getSheetByName: n => e.hojas[n] || null,
    insertSheet: n => (e.hojas[n] = hojaFalsa()),
  };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActive: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'SELLO_AUTORIZACION' ? CLAVE : null), setProperty() { throw new Error('la prueba no inventa claves'); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      computeHmacSha256Signature: (valor, clave) => aSigno(createHmac('sha256', asciiInterr(clave)).update(asciiInterr(valor)).digest()),
      getUuid: () => { throw new Error('no se inventan claves'); },
    },
    CacheService: noImplementado, ContentService: noImplementado, HtmlService: noImplementado, UrlFetchApp: noImplementado,
    ScriptApp: noImplementado, MailApp: noImplementado, Session: noImplementado, Logger: noImplementado, console, __reloj: () => e.ahora,
  });
  /* new Date() sin argumentos y Date.now() leen el reloj de la prueba (rutaAutorizar_ usa new Date().toISOString()). */
  vm.runInContext('(function () { var D = Date; Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(__reloj()); } static now() { return __reloj(); } }; })();', ctx);
  vm.runInContext(leer('puente', 'hoja-apps-script.gs'), ctx);
  const api = vm.runInContext('({ rutaAutorizar_, limpiarCotizacion, cotSubtotal, cotLineTotal, cotHuella, cotTotalFinal, cotPrecioFinal, cotPreciosCliente, renglonesDe, renglonesDeTexto,' +
    ' limpiarItemsAuth, itemsAuthCanon, folioValido, cotPiezas, COT_MATERIALES, COT_COMPLEJIDAD, COT_RECORTES, COT_RECORTE_COMP_EXTRA, COT_BASTIDORES, COT_M2_MINIMO, MAX_PARTIDAS, CELDA_MAX, RENGLON_DESC_MAX })', ctx);
  return { e, api };
}
const GS = gsDe();
const plano = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/* Autorizar en el .gs desde cero (hojas vacías) y devolver la respuesta y la fila escrita en «Autorizaciones». */
function autorizarEnGs(cuerpo, ahora) {
  GS.e.hojas = {};
  GS.e.ahora = ahora;
  const resp = plano(GS.api.rutaAutorizar_(plano(cuerpo), 'direccion', { rol: 'direccion', correo: CORREO }));
  const h = GS.e.hojas['Autorizaciones'];
  return { resp, fila: h && h.filas.length > 1 ? h.filas[h.filas.length - 1] : null };
}

/* La reescritura, sin HTTP: la decisión pura, la hora y la firma. Devuelve la respuesta del .gs y los argumentos de la RPC. */
async function autorizarAqui(cuerpo, ahora) {
  const prep = Aut.prepararAutorizacion(plano(cuerpo), CORREO);
  if (!prep.ok) return { resp: prep };
  prep.r.ts = Sello.tsIso(ahora);
  let sello;
  try { sello = await Sello.sellar(prep.r, CLAVE); }
  catch (e) { if (e.codigo === 'REGISTRO_INVALIDO') return { resp: null, invalido: true, prep }; throw e; }
  return { resp: { ok: true, sello: Aut.selloDeRespuesta(prep.r, sello.codigo, prep.nota) }, args: Aut.argumentosDeRegistro({ empresa: 'al3d', usuarioId: 'u', prep, sello }), sello };
}

/* ============================================================================
   El generador de cotizaciones al azar (con lo feo a propósito)
   ============================================================================ */
let semilla = 20261016;
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const uno = a => a[Math.floor(azar() * a.length)];
const dec = max => Math.round(azar() * max * 100) / 100;
const TEXTOS = ['Letras 3D', 'Caja de luz · frontal', 'Recorte «vinil» × 2', 'Güero "El Bueno"', 'Ñandú|Tacos', 'emoji 🌮 al final', 'línea\nnueva', 'coma, y; punto', '',
  'muy ' + 'larga '.repeat(40), '\\barra', 'Ünïcödé ẞ', 'x'.repeat(139) + '🌮', 'tab\tcon separador'];
function partida(id) {
  const tipo = uno(['letras', 'recorte', 'bastidor', 'caja', 'manual', 'otro']);
  const it = { id, tipo, desc: uno(TEXTOS) };
  const num = (max, conTexto) => { const v = dec(max); return conTexto && azar() < 0.15 ? String(v) : v; };
  if (tipo === 'letras') Object.assign(it, { material: uno(['al-paint', 'al-brush', 'acr-vol', 'acr-vinil', 'acero', 'inventado']), comp: uno(['recta', 'cursiva', 'compleja']), luz: azar() < 0.6, altura: num(80, true), n: Math.floor(azar() * 30) });
  if (tipo === 'recorte') Object.assign(it, { acab: uno(['sencillo', 'vinil', 'sandwich']), recComp: azar() < 0.5, altura: num(40), n: Math.floor(azar() * 20) });
  if (tipo === 'bastidor') Object.assign(it, { bas: uno(['lamina', 'alucobond']), ancho: num(400, true), alto: num(300) });
  if (tipo === 'caja') Object.assign(it, { tarifa: uno([3900, 4600, 5123.37, dec(9000)]), ancho: num(300), alto: num(200) });
  if (tipo === 'manual' || tipo === 'otro') Object.assign(it, { pz: Math.floor(azar() * 9), pu: num(5000, true) });
  if (azar() < 0.1) it.ajeno = { no: 'se guarda' };
  if (azar() < 0.05) it._lt = 123;
  return it;
}
function cuerpoAlAzar(i) {
  const n = 1 + Math.floor(azar() * (azar() < 0.05 ? 85 : 8));
  const items = Array.from({ length: n }, (_, k) => partida(azar() < 0.3 ? String(k + 1) : k + 1));
  const iva = azar() < 0.6;
  const limpia = GS.api.limpiarCotizacion(plano({ items }));
  const sub = limpia.error ? 0 : GS.api.cotSubtotal(limpia.items);
  const cot = { proyecto: uno(TEXTOS) + (azar() < 0.3 ? ' ' + i : ''), cliente: uno(TEXTOS), iva, subtotal: azar() < 0.07 ? sub + 5 : (azar() < 0.1 ? String(sub) : sub), items };
  const netoCalc = iva ? sub * 1.16 : sub;
  const cuerpo = { folio: azar() < 0.04 ? 'COT-' + i : 'COT-' + String(i).padStart(4, '0') + '@K7QM', cotizacion: cot, nota: azar() < 0.3 ? uno(TEXTOS) : undefined };
  const p = azar();
  if (p < 0.4) cuerpo.precioAuth = 0;
  else if (p < 0.7) cuerpo.precioAuth = Math.round(netoCalc * (0.8 + azar() * 0.5) * 100) / 100;
  else if (p < 0.75) cuerpo.precioAuth = netoCalc + 0.005;
  else if (p < 0.78) cuerpo.precioAuth = -1;
  else if (p < 0.8) cuerpo.precioAuth = 2e9;
  else if (p < 0.82) cuerpo.precioAuth = 'abc';
  if (azar() < 0.35 && items.length) {
    cuerpo.itemsAuth = {};
    for (const it of items) if (azar() < 0.5) cuerpo.itemsAuth[String(it.id)] = azar() < 0.05 ? -3 : dec(5000);
    if (azar() < 0.05) cuerpo.itemsAuth['999'] = 10;
  }
  if (azar() < 0.02) cuerpo.cotizacion = null;
  if (azar() < 0.02) cuerpo.cotizacion.items = [];
  return cuerpo;
}

/* ============================================================================
   1. Función por función
   ============================================================================ */
seccion('1. EL CATÁLOGO Y LAS FUNCIONES DEL PRECIO — lo mismo que el .gs');
eq('materiales, complejidad, recortes, extra del sándwich, bastidores y el mínimo de 1 m²',
  [Precio.MATERIALES, Precio.COMPLEJIDAD, Precio.RECORTES, Precio.RECORTE_COMP_EXTRA, Precio.BASTIDORES, Precio.M2_MINIMO],
  plano([GS.api.COT_MATERIALES, GS.api.COT_COMPLEJIDAD, GS.api.COT_RECORTES, GS.api.COT_RECORTE_COMP_EXTRA, GS.api.COT_BASTIDORES, GS.api.COT_M2_MINIMO]));
eq('los topes: 80 partidas, 45 000 caracteres por celda, 120 por renglón', [Precio.MAX_PARTIDAS, Precio.CELDA_MAX, Precio.RENGLON_DESC_MAX], [GS.api.MAX_PARTIDAS, GS.api.CELDA_MAX, GS.api.RENGLON_DESC_MAX]);
{
  const malos = [];
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    const c = cuerpoAlAzar(i);
    const a = Precio.limpiarCotizacion(plano(c.cotizacion)), b = plano(GS.api.limpiarCotizacion(plano(c.cotizacion)));
    if (JSON.stringify(a) !== JSON.stringify(b)) { malos.push(['limpiar', i]); continue; }
    if (a.error) continue;
    n++;
    const ia = Precio.limpiarItemsAuth(plano(c.itemsAuth), a.items);
    if (JSON.stringify(ia) !== JSON.stringify(plano(GS.api.limpiarItemsAuth(plano(c.itemsAuth), plano(a.items))))) malos.push(['itemsAuth', i]);
    const items = plano(a.items);
    for (const it of items) if (Precio.linea(it) !== GS.api.cotLineTotal(it) || Precio.piezas(it) !== GS.api.cotPiezas(it)) malos.push(['partida', i, it.id]);
    const sub = Precio.subtotal(items);
    if (sub !== GS.api.cotSubtotal(items)) malos.push(['subtotal', i]);
    if (Sello.huellaDe(a.iva, items) !== GS.api.cotHuella(a.iva, items)) malos.push(['huella', i]);
    const pa = Number(c.precioAuth || 0);
    if (Number.isFinite(pa)) {
      if (Precio.totalFinal(sub, a.iva, pa) !== GS.api.cotTotalFinal(sub, a.iva, pa)) malos.push(['total', i]);
      const iaV = ia.error ? {} : ia.valor;
      const fin = Precio.precioFinal(sub, a.iva, pa);
      if (fin !== GS.api.cotPrecioFinal(sub, a.iva, pa)) malos.push(['precioFinal', i]);
      if (Precio.renglonesDe(items, a.iva, iaV, fin) !== GS.api.renglonesDe(items, a.iva, plano(iaV), fin)) malos.push(['renglones', i]);
      const r = Precio.renglonesDe(items, a.iva, iaV, fin);
      if (JSON.stringify(Precio.renglonesDeTexto(r)) !== JSON.stringify(plano(GS.api.renglonesDeTexto(r)))) malos.push(['renglonesDeTexto', i]);
    }
  }
  eq('4000 cotizaciones al azar (' + n + ' válidas): limpieza, ajustes por partida, cada partida y sus piezas, subtotal, huella, total final, precio final, renglones del papel', malos.slice(0, 10), []);
}

/* ============================================================================
   2. La ruta entera
   ============================================================================ */
seccion('2. LA RUTA ENTERA — la respuesta de /autorizar y el renglón firmado, byte por byte contra rutaAutorizar_ del .gs');
const COLS = ['ts', 'folio', 'proyecto', 'cliente', 'subCalc', 'precioAuth', 'total', 'pct', 'itemsAuth', 'huella', 'autorizo', 'solicito', 'codigo', 'firma', 'estado', 'nota', 'renglones'];
const filaDeArgs = (a, prep) => ({ ts: a.p_ts_iso, folio: a.p_folio_global, proyecto: a.p_proyecto, cliente: a.p_cliente, subCalc: Number(a.p_sub_calc_txt), precioAuth: Number(a.p_precio_auth_txt),
  total: Number(a.p_total_txt), pct: prep.pct, itemsAuth: a.p_items_auth, huella: a.p_huella, autorizo: a.p_autorizo, solicito: a.p_autorizo, codigo: a.p_codigo, firma: a.p_firma,
  estado: 'vigente', nota: a.p_nota, renglones: a.p_renglones });
{
  const N = 3000;
  const distintas = [], cuenta = { ok: 0, error: 0, invalidos: 0 }, codigos = new Set();
  for (let i = 0; i < N; i++) {
    const cuerpo = cuerpoAlAzar(1000 + i);
    const ahora = Date.UTC(2026, 9, 16, 18, 0, 0, 0) + i * 7919;
    const g = autorizarEnGs(cuerpo, ahora);
    const m = await autorizarAqui(cuerpo, ahora);
    if (m.invalido) {
      /* La única diferencia a propósito: un texto con medio emoji (el slice cayó en medio) se firma en el .gs y aquí se rechaza. */
      cuenta.invalidos++;
      if (!(g.resp.ok && /[\ud800-\udfff]/.test(m.prep.r.proyecto + m.prep.cliente))) distintas.push({ i, por: 'rechazada sin medio emoji' });
      continue;
    }
    if (JSON.stringify(m.resp) !== JSON.stringify(g.resp)) { distintas.push({ i, aqui: m.resp, gs: g.resp }); continue; }
    if (!g.resp.ok) { cuenta.error++; continue; }
    cuenta.ok++;
    codigos.add(g.resp.sello.codigo);
    const esperada = Object.fromEntries(COLS.map((k, j) => [k, g.fila[j]]));
    esperada.cliente = Aut.sinSustitutosSueltos(esperada.cliente);      // el cliente NO se firma: medio emoji se guarda como U+FFFD (Postgres no lo guarda)
    const prep = Aut.prepararAutorizacion(plano(cuerpo), CORREO);
    if (JSON.stringify(filaDeArgs(m.args, prep)) !== JSON.stringify(esperada)) distintas.push({ i, fila: filaDeArgs(m.args, prep), gs: esperada });
    if (m.args.p_codificacion !== 'ascii-?' || m.args.p_clave_id !== 'k1') distintas.push({ i, por: 'codificación' });
  }
  eq(N + ' cuerpos al azar: misma respuesta y mismo renglón (texto firmado, firma, código, ajuste %) que el .gs', distintas.slice(0, 3), []);
  cierto('  …de los cuales ' + cuenta.ok + ' se autorizaron y ' + cuenta.error + ' se rechazaron con el mismo error (los dos caminos se ejercitaron)', cuenta.ok > 1000 && cuenta.error > 200);
  cierto('  …y los ' + cuenta.ok + ' códigos son distintos entre sí (nada se firma dos veces igual por accidente)', codigos.size === cuenta.ok);
  console.log('  · ' + cuenta.invalidos + ' con medio emoji cortado: el .gs los firma, aquí se contestan DATO_INVALIDO (diferencia a propósito, ver _shared/autorizar.js)');
}
{
  /* Casos fijos que el azar puede no tocar. */
  const base = { folio: 'COT-0042-B@K7QM', cotizacion: { proyecto: '  Tacos "El Güero"  ', cliente: 'Juan', iva: true, subtotal: 13664, items: [
    { id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, altura: 40, n: 8, desc: 'Letras «AL3D»' },
    { id: 2, tipo: 'caja', tarifa: 3900, ancho: 30, alto: 30, desc: 'Caja · 30×30' },
    { id: 3, tipo: 'manual', pz: 2, pu: 82, desc: 'Instalación 🌮' }] } };
  const variantes = {
    'el caso feliz con IVA': {},
    'precio autorizado MAYOR (el aumento se reparte en los renglones)': { precioAuth: 17000.5 },
    'precio autorizado menor, con ajuste por partida': { precioAuth: 14000, itemsAuth: { 1: 9000, 3: 100 } },
    'el mismo precio que el calculado (no es ajuste)': { precioAuth: 15850.24 },
    'folio sin aparato': { folio: 'COT-0042' },
    'subtotal del teléfono que no cuadra': { cotizacion: { ...base.cotizacion, subtotal: 13000 } },
    'en $0': { cotizacion: { ...base.cotizacion, subtotal: 0, items: [{ id: 1, tipo: 'manual', pz: 0, pu: 5 }] } },
    'ajuste a una partida que no existe': { itemsAuth: { 9: 1 } },
    'precio autorizado negativo': { precioAuth: -5 },
    '81 partidas': { cotizacion: { ...base.cotizacion, items: Array.from({ length: 81 }, (_, i) => ({ id: i, tipo: 'manual', pz: 1, pu: 1 })) } },
    'una partida con un objeto en «pu»': { cotizacion: { ...base.cotizacion, items: [{ id: 1, tipo: 'manual', pz: 1, pu: { x: 1 } }] } },
    'sin cotización': { cotizacion: undefined },
  };
  const t0 = Date.UTC(2026, 9, 16, 19, 0, 0, 5);
  for (const [que, cambio] of Object.entries(variantes)) {
    const cuerpo = { ...base, ...cambio };
    eq(que, (await autorizarAqui(cuerpo, t0)).resp, autorizarEnGs(cuerpo, t0).resp);
  }
  /* La firma no cambia de codificación: firmado con ascii-? y una clave con «ñ» y un emoji, utf-8 daría otra. */
  const m = await autorizarAqui(base, t0);
  const f8 = await Sello.firmar({ ...Aut.prepararAutorizacion(base, CORREO).r, ts: Sello.tsIso(t0) }, CLAVE, { codificacion: 'utf-8' });
  cierto('la firma es la de Apps Script (ascii-?): con UTF-8 saldría otra, y la función no la usa', m.args.p_firma !== f8 && m.args.p_codificacion === 'ascii-?');
  const v = await Sello.verificar({ folio_global: m.args.p_folio_global, ts_iso: m.args.p_ts_iso, proyecto: m.args.p_proyecto, sub_calc: m.args.p_sub_calc_txt, precio_auth: m.args.p_precio_auth_txt,
    total: m.args.p_total_txt, items_auth: m.args.p_items_auth, huella: m.args.p_huella, autorizo: m.args.p_autorizo, renglones: m.args.p_renglones, codigo: m.args.p_codigo, firma: m.args.p_firma,
    estado: 'vigente', codificacion: 'ascii-?' }, CLAVE);
  eq('lo que la función manda a la base lo verifica sello.verificar() (el mismo que usa /verificar)', [v.valida, v.formato], [true, 'AL3D-AUTH-v2']);
}

/* ============================================================================
   3. El manejador HTTP con dobles
   ============================================================================ */
seccion('3. EL MANEJADOR — sesión de Dirección, clave, la RPC, y lo que pasa cuando algo falla');
const ORIGEN = 'https://eliasgaribi-ctrl-z.github.io';
const JWT = 'aaa.bbb.ccc';
const SECRETA = 'sb_secret_FALSA_solo_para_pruebas_0000000000';
function entornoDe(extra = {}) {
  const v = { SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_FALSA_0000"}', SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRETA }), SELLO_AUTORIZACION: CLAVE, ...extra };
  return n => v[n];
}
function baseFalsa({ area = 'direccion', empresas, rpc } = {}) {
  const llamadas = [];
  return {
    llamadas,
    async usuarioDe(jwt) { return jwt === JWT ? { data: { user: { id: 'uid-dir', email: CORREO } }, error: null } : { data: { user: null }, error: { status: 401, name: 'AuthApiError', message: 'jwt' } }; },
    async rpcUsuario(_jwt, nombre) {
      if (nombre !== 'mi_acceso') throw new Error('otra rpc de usuario: ' + nombre);
      return { data: { ok: true, estado: 'activo', usuario: { id: 'uid-dir', correo: CORREO }, empresas: empresas || [{ empresa_id: 'al3d', area, estado: 'activo' }] }, error: null, status: 200 };
    },
    async rpcServicio(nombre, args) {
      llamadas.push({ nombre, args });
      if (rpc) return rpc(nombre, args);
      return { data: { ok: true, repetida: false, sello: {} }, error: null, status: 200 };
    },
  };
}
const peticion = (cuerpo, o = {}) => new Request('https://falso.supabase.co/functions/v1/autorizar', {
  method: o.metodo || 'POST', headers: { ...(o.sinSesion ? {} : { authorization: 'Bearer ' + JWT }), origin: o.origen || ORIGEN, 'content-type': 'text/plain' },
  body: o.metodo === 'GET' ? undefined : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) });
const registro = [];
async function llamar(cuerpo, o = {}) {
  const clienteBase = o.base || baseFalsa();
  const res = await manejar(peticion(cuerpo, o), { ahora: () => o.ahora || Date.UTC(2026, 9, 16, 20, 0, 0, 0), entorno: entornoDe(o.entorno), clienteBase, registrar: (n, l) => registro.push(l) });
  const texto = await res.text();
  return { status: res.status, texto, cuerpo: JSON.parse(texto), base: clienteBase, cors: res.headers.get('access-control-allow-origin') };
}
{
  const BUENO = { folio: 'COT-0042-B@K7QM', cotizacion: { proyecto: 'Tacos', cliente: 'Juan', iva: true, subtotal: 2400, items: [{ id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, altura: 10, n: 8, desc: 'Letras' }] }, nota: 'ok' };
  const r = await llamar(BUENO);
  const esp = autorizarEnGs(BUENO, Date.UTC(2026, 9, 16, 20, 0, 0, 0)).resp;
  eq('Dirección autoriza: 200 y EL MISMO TEXTO que contestaría el .gs; con CORS de su origen', [r.status, r.texto, r.cors], [200, JSON.stringify(esp), ORIGEN]);
  const a = r.base.llamadas.find(x => x.nombre === 'registrar_autorizacion');
  eq('escribe SOLO por registrar_autorizacion, con la empresa, el uid y los textos firmados', [r.base.llamadas.length, a.args.p_empresa, a.args.p_usuario, a.args.p_autorizo, a.args.p_codigo, a.args.p_sub_calc_txt, a.args.p_codificacion],
    [1, 'al3d', 'uid-dir', CORREO, esp.sello.codigo, '2400.00', 'ascii-?']);
  eq('los argumentos son exactamente los de la firma de 0008 (ni uno más)', Object.keys(a.args), ['p_empresa', 'p_usuario', 'p_folio_global', 'p_ts_iso', 'p_proyecto', 'p_cliente', 'p_sub_calc_txt', 'p_precio_auth_txt',
    'p_total_txt', 'p_ajuste_pct', 'p_items_auth', 'p_huella', 'p_autorizo', 'p_codigo', 'p_firma', 'p_nota', 'p_renglones', 'p_cotizacion', 'p_clave_id', 'p_codificacion']);
  const sql = ['0008_notario.sql'].map(f => leer('supabase', 'migrations', f)).join('\n');
  const firma = /create\s+or\s+replace\s+function\s+public\.registrar_autorizacion\s*\(([\s\S]*?)\)\s*returns/i.exec(sql);
  eq('  …y coinciden, en orden, con lo que declara la migración', [...firma[1].matchAll(/\b(p_[a-z_]+)\b/g)].map(x => x[1]), Object.keys(a.args));

  const rep = await llamar(BUENO, { base: baseFalsa({ rpc: () => ({ data: { ok: true, repetida: true, sello: { codigo: 'AAAA-BBBB-CCCC', correo: CORREO } }, error: null }) }) });
  eq('la MISMA decisión otra vez: la base dice «repetida» y se devuelve SU sello (el vigente), como el .gs', rep.cuerpo, { ok: true, sello: { codigo: 'AAAA-BBBB-CCCC', correo: CORREO }, repetida: true });
  const gsDos = (() => { GS.e.hojas = {}; GS.e.ahora = 1; GS.api.rutaAutorizar_(plano(BUENO), 'direccion', { rol: 'direccion', correo: CORREO }); GS.e.ahora = 2; return plano(GS.api.rutaAutorizar_(plano(BUENO), 'direccion', { rol: 'direccion', correo: CORREO })); })();
  eq('  (el .gs, con la misma decisión dos veces, también contesta repetida: true)', gsDos.repetida, true);

  eq('sin sesión: 401 SIN_SESION y la base ni se toca', await (async () => { const x = await llamar(BUENO, { sinSesion: true }); return [x.status, x.cuerpo.codigo, x.base.llamadas.length]; })(), [401, 'SIN_SESION', 0]);
  for (const area of ['fabricacion', 'pagos']) {
    const x = await llamar(BUENO, { base: baseFalsa({ area }) });
    eq(area + ': 403 ROL_SIN_PERMISO y no se firma nada', [x.status, x.cuerpo.codigo, x.base.llamadas.length], [403, 'ROL_SIN_PERMISO', 0]);
  }
  const dos = [{ empresa_id: 'al3d', area: 'direccion', estado: 'activo' }, { empresa_id: 'otra', area: 'direccion', estado: 'activo' }];
  eq('Dirección en dos empresas sin decir cuál: 400 EMPRESA_REQUERIDA; diciendo «otra», se autoriza en «otra»',
    [(await llamar(BUENO, { base: baseFalsa({ empresas: dos }) })).cuerpo.codigo, (await llamar({ ...BUENO, empresa: 'otra' }, { base: baseFalsa({ empresas: dos }) })).base.llamadas[0].args.p_empresa],
    ['EMPRESA_REQUERIDA', 'otra']);
  eq('pedir una empresa donde no es Dirección: 403', (await llamar({ ...BUENO, empresa: 'ajena' })).status, 403);
  eq('empresaDeDireccion: ignora las membresías en baja y las de otra área', empresaDeDireccion({ empresas: [{ empresa_id: 'a', area: 'direccion', estado: 'baja' }, { empresa_id: 'b', area: 'pagos', estado: 'activo' }, { empresa_id: 'c', area: 'direccion', estado: 'activo' }] }), { ok: true, empresa: 'c' });

  const sinClave = await llamar(BUENO, { entorno: { SELLO_AUTORIZACION: undefined } });
  eq('sin SELLO_AUTORIZACION: 503 CONFIGURACION que nombra la variable, y NO se inventa una clave ni se firma', [sinClave.status, sinClave.cuerpo.codigo, /SELLO_AUTORIZACION/.test(sinClave.cuerpo.mensaje), sinClave.base.llamadas.length], [503, 'CONFIGURACION', true, 0]);
  eq('un cuerpo que no es JSON y uno de más de 512 KB: 200 DATO_INVALIDO, como el .gs', [(await llamar('{no')).cuerpo.mensaje, (await llamar('x'.repeat(600 * 1024))).cuerpo.mensaje], ['El cuerpo no es JSON.', 'El cuerpo es demasiado grande.']);
  eq('un error del .gs (subtotal que no cuadra) llega tal cual, sin escribir', await (async () => { const x = await llamar({ ...BUENO, cotizacion: { ...BUENO.cotizacion, subtotal: 1 } }); return [x.status, x.cuerpo.codigo, x.base.llamadas.length]; })(), [200, 'CATALOGO_DESINCRONIZADO', 0]);
  const caida = await llamar(BUENO, { base: baseFalsa({ rpc: () => { throw new Error('fetch failed ' + SECRETA); } }) });
  eq('la base no contesta: 503 SIN_RED transitorio (no «no autorizada»)', [caida.status, caida.cuerpo.codigo, caida.cuerpo.transitorio], [503, 'SIN_RED', true]);
  const sinRpc = await llamar(BUENO, { base: baseFalsa({ rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'no existe' } }) }) });
  eq('la RPC no existe (falta la migración): 503 CONFIGURACION', [sinRpc.status, sinRpc.cuerpo.codigo], [503, 'CONFIGURACION']);
  const niega = await llamar(BUENO, { base: baseFalsa({ rpc: () => ({ data: { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Solo una cuenta de Dirección activa de esa empresa autoriza.', definitivo: true }, error: null }) }) });
  eq('la base revalida y dice que no (p. ej. la baja llegó entre medias): 403 con SU mensaje', [niega.status, niega.cuerpo.codigo], [403, 'ROL_SIN_PERMISO']);
  eq('origen ajeno: 403 sin tocar nada; GET: 405', [(await llamar(BUENO, { origen: 'https://malo.example' })).status, (await llamar(null, { metodo: 'GET' })).status], [403, 405]);
  const todo = registro.join('\n') + caida.texto;
  cierto('ningún secreto sale en una respuesta ni en el registro (ni la clave del sello ni la llave secreta, aunque un error la cite)', !todo.includes(CLAVE) && !todo.includes(SECRETA) && todo.includes('[oculto]'));
}

/* ============================================================================
   4. Los archivos
   ============================================================================ */
seccion('4. LOS ARCHIVOS — pegamento sin Node ni Deno, index.ts delgado, config.toml');
for (const f of ['supabase/functions/autorizar/handler.js', 'supabase/functions/_shared/autorizar.js', 'supabase/functions/_shared/precio.js']) {
  const t = leer(...f.split('/'));
  cierto(f + ': sin Deno, process, Buffer, require ni node:', !/\bDeno\b|\bprocess\.|\bBuffer\b|\brequire\(|from 'node:/.test(t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
}
const idx = leer('supabase', 'functions', 'autorizar', 'index.ts');
cierto('index.ts: solo Deno.serve, Deno.env, el fetch y el reloj; ninguna regla', /Deno\.serve/.test(idx) && idx.split('\n').length < 25 && !/registrar_autorizacion|SELLO_AUTORIZACION/.test(idx));
cierto('config.toml: [functions.autorizar] con verify_jwt = false (la sesión se comprueba en código)', /\[functions\.autorizar\]\s*\r?\n\s*verify_jwt\s*=\s*false/.test(leer('supabase', 'config.toml')));
cierto('supabase/README.md nombra la función en su lista', /autorizar/.test(leer('supabase', 'README.md')));

/* ============================================================================
   5. Con la base de verdad (PGlite)
   ============================================================================ */
seccion('5. CON LA BASE DE VERDAD (PGlite) — lo firmado y guardado lo verifica /verificar');
const ARNES = join(RAIZ, 'supabase', 'tests', 'arnes', 'arnes.mjs');
if (!existsSync(join(RAIZ, 'supabase', 'tests', 'node_modules'))) {
  console.log('  · SALTADA: faltan las dependencias de supabase/tests (corre «sh supabase/tests/correr.sh» una vez)');
} else {
  const arnes = await import(pathToFileURL(ARNES).href);
  const db = await arnes.crearBase({ migraciones: '../migrations' });
  try {
    const DIR = '00000000-0000-4000-8000-0000000000d1';
    await arnes.crearUsuarioAuth(db, { uid: DIR, correo: CORREO });
    await arnes.sql(db, `insert into public.miembros (empresa_id, correo, area, estado, usuario_id, reclamado_en) values ('al3d', $1, 'direccion', 'activo', $2, now())`, [CORREO, DIR]);
    const real = {
      async usuarioDe() { return { data: { user: { id: DIR, email: CORREO } }, error: null }; },
      async rpcUsuario(_j, nombre, args) { const f = await arnes.como(db, { rol: 'authenticated', uid: DIR, correo: CORREO }).rpc(nombre, args || {}); return { data: f[0][nombre], error: null }; },
      async rpcServicio(nombre, args) {
        try { const f = await arnes.como(db, { rol: 'service_role' }).rpc(nombre, args, { confirmar: true }); return { data: f[0][nombre], error: null }; }
        catch (e) { return { data: null, error: { code: e.codigo, message: e.message } }; }
      },
    };
    const casos = [];
    for (let i = 0; casos.length < 12 && i < 500; i++) {
      const c = cuerpoAlAzar(5000 + i);
      const g = autorizarEnGs(c, Date.UTC(2026, 9, 16, 21, 0, 0, i));
      if (g.resp.ok && !/[\ud800-\udfff]/.test(JSON.stringify(c))) casos.push({ c, gs: g.resp });
    }
    let verificadas = 0;
    const malos = [];
    for (const [k, { c, gs }] of casos.entries()) {
      const ahora = Date.UTC(2026, 9, 16, 21, 0, 0, casos.indexOf(casos[k]));
      const res = await manejar(peticion(c), { ahora: () => Date.UTC(2026, 9, 16, 21, 0, 0, 0) + 0 * ahora + k, entorno: entornoDe(), clienteBase: real, registrar: () => {} });
      const cuerpo = JSON.parse(await res.text());
      if (!cuerpo.ok) { malos.push({ k, cuerpo }); continue; }
      const filas = (await arnes.como(db, { rol: 'service_role' }).rpc('autorizacion_para_verificar', { p_folio: c.folio, p_codigo: cuerpo.sello.codigo }))[0].autorizacion_para_verificar.filas;
      const v = await Sello.verificar(filas[filas.length - 1], CLAVE);
      if (v.valida && v.codificacion !== 'utf-8') verificadas++; else malos.push({ k, v });
      if (cuerpo.sello.huella !== gs.sello.huella || cuerpo.sello.total !== gs.sello.total || JSON.stringify(cuerpo.sello.renglones) !== JSON.stringify(gs.sello.renglones)) malos.push({ k, por: 'distinto del .gs' });
    }
    eq(casos.length + ' autorizaciones al azar por la función, guardadas por registrar_autorizacion y verificadas desde la fila guardada (con su codificación ascii-?)', [verificadas, malos.slice(0, 2)], [casos.length, []]);
    const otra = JSON.parse(await (await manejar(peticion(casos[0].c), { ahora: () => Date.UTC(2026, 9, 17), entorno: entornoDe(), clienteBase: real, registrar: () => {} })).text());
    eq('la misma decisión otra vez contra la base: repetida, con el sello que ya estaba (no escribe otro)', [otra.ok, otra.repetida, (await arnes.sql(db, `select count(*)::int as n from public.autorizaciones where folio_global = $1`, [casos[0].c.folio]))[0].n], [true, true, 1]);
  } finally { await db.close(); }
}

console.log('\n' + (fallos ? fallos + ' FALLO(S) de ' + (pasan + fallos) + ' comprobaciones' : 'Todo pasa. ' + pasan + ' comprobaciones.'));
process.exit(fallos ? 1 : 0);
