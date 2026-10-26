/* ============================================================================
   LAS COTIZACIONES EN LA BASE, CON LA BASE MANDANDO (paso 4 de docs/BASE-MANDA.md).

   Elías lo pidió el 2026-10-25: «que todo se guarde en Supabase y se sincronice en todos los teléfonos y
   sesiones». El historial del cotizador (`al3d_historial`, con sus hitos en `al3d_hitos`) vivía en UN
   teléfono: el que cotizó. La tabla `cotizaciones` de la base existía desde 0008, pero solo la llenó una
   vez Elías a mano, desde la consola, con `subida_unica`. Este módulo es el que la mantiene al día, y solo
   corre con la base mandando (js/datos/supa-enchufe.js, `arrancarBase`): con la hoja, ni se carga.

   SUBIR. El cotizador guarda como siempre en SU almacenamiento; la plataforma lo lee (nunca lo escribe:
   las claves del cotizador son suyas) y manda a la base lo que cambió:
     · lo que la base no conoce, por `subida_unica` en lotes de 50 (el tope de la función). La primera vez
       que un aparato corre con la base mandando son TODAS: es la subida única automática, la que antes
       se hacía a mano. El acuse de cada una dice qué pasó: creada, ya estaba, conflicto, de otra persona;
     · lo que la base ya tiene y aquí cambió, por `cotizacion_guardar` (el autor o Dirección), PERO solo
       si lo de aquí es más nuevo que lo de la base (abajo, «quién gana»). Antes de pisar se lee la fila:
       otro teléfono pudo haberla cambiado desde la última vez que este la vio;
     · los hitos (PDF, WhatsApp, venta) van con la cotización y se suman (`hitos || nuevos` en la base);
     · lo que se borró del historial aquí (la lápida que deja el cotizador en `al3d_hist_borradas`, después
       de que se le pasó la ventana de «Deshacer») se borra en la base (`borrar: true`: `deleted_at`, la
       fila se queda y una autorización firmada no se toca).
   Idempotente: lo que la base ya tiene se anota en el registro de este aparato (la base local de la
   sombra, `al3d_sombra`, almacén `cotizaciones`), con la FIRMA de su contenido; no se vuelve a mandar
   mientras la firma no cambie. Y si se manda dos veces, la base contesta «ya estaba».

   BAJAR. La ventanilla `AL3D_NUBE.cotizaciones(desde)` (la pone el enchufe) le da al cotizador las filas
   que cambiaron en la base desde su última vez, y `AL3D_NUBE.mezclar` las junta con su historial: el
   cotizador las escribe en su propio almacenamiento, en un solo paso síncrono, para no perder lo que se
   guardó mientras la red contestaba. Lo que llega se anota también aquí, para no volver a subirlo.

   QUIÉN VE QUÉ (la RLS de `cotizaciones`, 0008): Dirección, todas las de la empresa; Pagos, solo las suyas
   (`creado_por`); Fabricación, NINGUNA —llevan precios—. Por eso la ventanilla de bajar solo existe para
   Dirección y Pagos, y Fabricación ni la pide: sube lo suyo (la base se lo deja) y nunca lo lee de vuelta.

   QUIÉN GANA cuando la misma cotización cambió en dos lados: la que se editó al último (`editado`, que el
   cotizador pone al guardar con la base mandando; las de antes no lo traen y cuentan desde `ts`). En un
   empate —dos copias sin `editado`, distintas— gana el teléfono que emitió el folio (el `@aparato` del folio
   global): así una copia vieja en otro teléfono no pisa lo que el autor corrigió, y los dos terminan
   diciendo lo mismo sin ir y venir.

   UN FOLIO, UNA ENTRADA. El cotizador busca sus cotizaciones por el folio corto (COT-0042-B): dos con el
   mismo folio de aparatos distintos no caben en un historial. La que llega de la nube con un folio que
   aquí ya es de otra cotización no se mete (se cuenta como «choque»); por eso cada teléfono lleva su letra.
   ============================================================================ */

import { todas } from './supa-vivo.js';

export const CLAVE_HISTORIAL = 'al3d_historial';
export const CLAVE_HITOS = 'al3d_hitos';
export const CLAVE_BORRADAS = 'al3d_hist_borradas';   // las lápidas del cotizador (historial.js)
export const CLAVE_FOLIO = 'al3d_folio';
/* Cuándo terminó la subida única en ESTE aparato (para Ajustes). Fuera de Prefs.CLAVES: no viaja en los respaldos. */
export const CLAVE_SUBIDA = 'al3d_pf_supa_subida';
export const ALMACEN = 'cotizaciones';               // en la base local de la sombra (supa-sombra.js, versión 3)
export const POR_LOTE = 50;                          // el tope de `subida_unica` (0008/0021)
export const NUEVAS_POR_VUELTA = 200;                // cuatro lotes: la primera subida de un historial grande se reparte
export const CAMBIOS_POR_VUELTA = 20;                // `cotizacion_guardar` de uno en uno
export const MS_DESHACER = 15 * 1000;                // una lápida se manda pasada la ventana de «Deshacer» (el aviso dura 8 s)
export const TOPE_DATOS = 200000;                    // lo que la base acepta por cotización (sin imágenes)
export const AREAS_SUBEN = Object.freeze(['direccion', 'fabricacion', 'pagos']);
export const AREAS_LEEN = Object.freeze(['direccion', 'pagos']);     // Fabricación no ve cotizaciones (llevan precios)
export const COLUMNAS = 'folio_global, folio, disp, datos, hitos, updated_at, deleted_at';
const HITOS = ['pdf', 'wa', 'venta'];

const FOLIO = /^[A-Za-z0-9-]{1,24}$/;
const DISP = /^[A-Za-z0-9_-]{1,24}$/;
const FOLIO_GLOBAL = /^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/;
const EMPRESA = /^[a-z][a-z0-9_]{1,31}$/;

/** ¿Esta área lee cotizaciones de la base? Dirección y Pagos (la RLS de 0008). */
export const puedeLeer = area => AREAS_LEEN.includes(String(area || ''));
/** ¿Esta área sube su historial? Las tres (Fabricación escribe y nunca lee de vuelta). */
export const puedeSubir = area => AREAS_SUBEN.includes(String(area || ''));

const objeto = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;

/* ============================================================================
   Lo puro (lo prueba pruebas/supabase-cotizador.mjs sin navegador)
   ============================================================================ */

/** ¿Es una entrada del historial? Un folio y sus partidas. Los TALONES de la copia de la hoja (sin folio en `datos` ni
 *  partidas) y las pendientes de la cola de antes (sin folio) no lo son: el historial no sabría abrirlas. */
export function esEntrada(d) {
  return !!(objeto(d) && typeof d.folio === 'string' && FOLIO.test(d.folio) && Array.isArray(d.items));
}

/** Sin data URLs, en ningún nivel (las listas pierden el elemento): la misma regla que `interno.sin_dataurl` de 0008. */
export function sinDataUrl(v) {
  const dato = x => typeof x === 'string' && /^data:/i.test(x);
  if (Array.isArray(v)) return v.filter(x => !dato(x)).map(sinDataUrl);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (x === undefined || dato(x)) continue; o[k] = sinDataUrl(x); }
    return o;
  }
  return v;
}

/** Lo que la base guarda de una entrada: sin `aiFile.url` y sin data URLs (`interno.datos_cotizacion`, 0008). */
export function datosParaLaNube(e) {
  let c;
  try { c = JSON.parse(JSON.stringify(e)); } catch (_) { return null; }
  if (!objeto(c)) return null;
  if (objeto(c.aiFile)) delete c.aiFile.url;
  return sinDataUrl(c);
}

/** JSON con las llaves en orden: la base (jsonb) las reordena, y dos textos iguales tienen que decir «iguales». */
export function canonico(v) {
  if (v === undefined || typeof v === 'function') return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== 'function').sort()
    .map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
}

/** El aparato de una entrada, con la regla de `subida_unica`: el suyo, el de su sello, o el del lote (este teléfono). */
export function dispDe(e, dispLocal) {
  const d = objeto(e) && typeof e.disp === 'string' && e.disp ? e.disp : '';
  if (d) return d;
  const s = objeto(e) && objeto(e.sello) ? String(e.sello.folio || '').split('@')[1] || '' : '';
  return s || String(dispLocal || '');
}

/** El folio global (`COT-0042-B@K7QM`): la llave de la base y del registro. '' si no se puede armar. */
export function claveDe(e, dispLocal) {
  if (!esEntrada(e)) return '';
  const fg = e.folio + '@' + dispDe(e, dispLocal);
  return FOLIO_GLOBAL.test(fg) ? fg : '';
}

/** Lo que se manda y se compara: los datos para la nube, con el aparato puesto (las entradas de antes no lo traen). */
export function normal(e, dispLocal) {
  const d = datosParaLaNube(e);
  if (!d) return null;
  if (!d.disp) d.disp = dispDe(e, dispLocal);
  return d;
}

/** La firma del contenido: igual aquí que en la base, aunque la base reordene llaves o quite la imagen. */
export const firma = (e, dispLocal) => canonico(normal(e, dispLocal));

/** Cuándo se editó por última vez (`editado`, desde el paso 4) o, si no lo dice, cuándo se autorizó (`ts`). */
export const editadoDe = e => (objeto(e) && (Number(e.editado) || Number(e.ts))) || 0;

/** ¿Gana lo de aquí? Lo más nuevo; en un empate, el teléfono que emitió el folio. */
export function ganaLocal(local, nube, dispLocal) {
  const a = editadoDe(local), b = editadoDe(nube);
  if (a !== b) return a > b;
  return dispDe(local, dispLocal) === String(dispLocal || '');
}

/** Los tres hitos de una cotización, siempre con sus tres llaves (los que la base guarda además, como la propuesta, no). */
export function hitosDe(h) {
  const o = objeto(h) || {};
  return Object.fromEntries(HITOS.map(k => [k, Number(o[k]) > 0 ? Number(o[k]) : 0]));
}
export const firmaHitos = h => canonico(hitosDe(h));
const conHitos = h => HITOS.some(k => hitosDe(h)[k] > 0);

/**
 * Qué se manda en esta vuelta. PURA.
 * @param {{historial:Array, hitos:Object, borradas:Array}} fuente lo que el cotizador tiene en este aparato
 * @param {Map<string,Object>} reg el registro (folio global → {estado, en_nube, firma, hitos, editado})
 * @returns {{nuevas, cambiadas, soloHitos, borrar, esperan, apartadas, ajenas}} `nuevas` van por subida_unica; `cambiadas` (la
 *   base ya las tiene y aquí cambiaron, y lo de aquí parece más nuevo) se revisan contra la fila antes de pisar; `esperan`, las
 *   que la base tiene más nuevas: las trae la bajada.
 */
export function planDeSubida(fuente, reg, { disp = '', ahora = Date.now() } = {}) {
  const f0 = objeto(fuente) || {};
  const hist = Array.isArray(f0.historial) ? f0.historial : [];
  const hitos = objeto(f0.hitos) || {};
  /* `borrarEn`: en cuántos ms se le acaba la ventana de «Deshacer» a la lápida más próxima (0: ninguna espera). */
  const out = { nuevas: [], cambiadas: [], soloHitos: [], borrar: [], esperan: 0, apartadas: 0, ajenas: 0, borrarEn: 0 };
  const vistos = new Set();
  for (const e of hist) {
    const fg = claveDe(e, disp);
    if (!fg || vistos.has(fg)) continue;          // la primera manda: el historial guarda la más nueva arriba
    vistos.add(fg);
    const x = { e, fg, f: firma(e, disp), fh: firmaHitos(hitos[e.folio]), hitos: hitosDe(hitos[e.folio]) };
    const r = reg.get(fg);
    if (!r) { out.nuevas.push(x); continue; }
    if (r.estado === 'ajena') { out.ajenas++; continue; }
    if (r.estado === 'borrada') continue;         // la base la tiene borrada: la bajada la quita de aquí
    if (r.estado === 'apartada' && r.firma === x.f) { out.apartadas++; continue; }
    if (r.estado === 'apartada') { (r.en_nube ? out.cambiadas : out.nuevas).push(x); continue; }
    if (r.firma !== x.f) {
      if (ganaLocal(e, { editado: r.editado }, disp)) { out.cambiadas.push(x); continue; }
      out.esperan++;
      /* Los datos esperan a la bajada, pero los hitos no tienen por qué: se suman, no se pisan. */
      if (x.fh !== (r.hitos || firmaHitos(null)) && conHitos(x.hitos)) out.soloHitos.push(x);
      continue;
    }
    if (x.fh !== (r.hitos || firmaHitos(null)) && conHitos(x.hitos)) out.soloHitos.push(x);
  }
  for (const b of (Array.isArray(f0.borradas) ? f0.borradas : [])) {
    const fg = objeto(b) ? String(b.clave || '') : '';
    if (!FOLIO_GLOBAL.test(fg) || vistos.has(fg)) continue;              // volvió (Deshacer): no se borra
    const r = reg.get(fg);
    const falta = MS_DESHACER - (ahora - (Number(b.ts) || 0));
    if (falta > 0) {                                                       // todavía se puede deshacer
      if (!(r && (r.estado === 'borrada' || r.estado === 'ajena'))) out.borrarEn = out.borrarEn ? Math.min(out.borrarEn, falta) : falta;
      continue;
    }
    if (r && (r.estado === 'borrada' || r.estado === 'ajena')) continue;
    if (!out.borrar.includes(fg)) out.borrar.push(fg);
  }
  return out;
}

/**
 * Junta lo que llegó de la base con el historial de este aparato. PURA: no escribe nada; el cotizador escribe lo que devuelve.
 * @param {{historial:Array, hitos:Object}} local lo de este aparato (las claves del cotizador)
 * @param {Array<{folio_global, disp, datos, hitos, deleted_at}>} filas lo que dio `cotizaciones(desde)`
 * @param {string} disp el aparato de este teléfono
 * @returns {{historial:Array, hitos:Object|null, cambios:number, nuevas:number, reemplazadas:number, quitadas:number, choques:number,
 *   choquesDe:Array<{folio_global:string, folio:string, disp:string}>}}
 *   `hitos` es null si no cambió. `choquesDe` dice cuáles no entraron por un folio corto que aquí ya es de otra (para avisar de
 *   cada una UNA vez, con su folio y su teléfono). Una entrada que se reemplaza conserva la imagen de referencia de aquí (la base no la guarda).
 */
export function mezclar(local, filas, disp) {
  const l0 = objeto(local) || {};
  const lista = (Array.isArray(l0.historial) ? l0.historial : []).filter(e => e && typeof e === 'object');
  const hitos = JSON.parse(JSON.stringify(objeto(l0.hitos) || {}));
  const porClave = new Map(), porFolio = new Map();
  for (const e of lista) {
    const k = claveDe(e, disp);
    if (!k) continue;
    if (!porClave.has(k)) porClave.set(k, e);
    if (!porFolio.has(e.folio)) porFolio.set(e.folio, k);
  }
  let nuevas = 0, reemplazadas = 0, quitadas = 0, choques = 0, hitosCambio = false;
  const choquesDe = [];
  for (const f of (Array.isArray(filas) ? filas : [])) {
    if (!objeto(f) || !FOLIO_GLOBAL.test(String(f.folio_global || '')) || !esEntrada(f.datos)) continue;
    const k = f.folio_global;
    /* Con su aparato puesto: en otro teléfono, una entrada de antes sin `disp` se leería como de ESE teléfono. */
    const datos = JSON.parse(JSON.stringify(f.datos));
    if (!datos.disp) datos.disp = dispDe(datos, f.disp);
    if (claveDe(datos, disp) !== k) continue;     // la fila no dice lo mismo que su folio: no se toca nada
    const actual = porClave.get(k);
    if (f.deleted_at) {
      const borrada = Date.parse(f.deleted_at) || 0;
      if (actual && !(editadoDe(actual) > borrada)) {
        lista.splice(lista.indexOf(actual), 1);
        porClave.delete(k);
        if (porFolio.get(actual.folio) === k) porFolio.delete(actual.folio);
        quitadas++;
      }
      continue;
    }
    if (!actual) {
      const otra = porFolio.get(datos.folio);
      if (otra && otra !== k) { choques++; choquesDe.push({ folio_global: k, folio: String(datos.folio || ''), disp: String(datos.disp || '') }); continue; }
      const ts = Number(datos.ts) || 0;
      let i = lista.findIndex(e => (Number(e.ts) || 0) < ts);
      if (i < 0) i = lista.length;
      lista.splice(i, 0, datos);
      porClave.set(k, datos); porFolio.set(datos.folio, k);
      nuevas++;
    } else if (firma(actual, disp) !== firma(datos, disp) && !ganaLocal(actual, datos, disp)) {
      const a = objeto(actual.aiFile);
      if (a && a.url && (!objeto(datos.aiFile) || !datos.aiFile.url) && (!objeto(datos.aiFile) || datos.aiFile.name === a.name)) datos.aiFile = a;
      lista[lista.indexOf(actual)] = datos;
      porClave.set(k, datos);
      reemplazadas++;
    }
    /* Los hitos de esa cotización: lo que falte aquí, y de lo que haya en los dos, el más viejo (la PRIMERA vez manda,
       como en marcarHito). Solo si el folio corto es de ESTA cotización: los hitos se guardan por folio corto. */
    if (porFolio.get(datos.folio) === k && objeto(f.hitos)) {
      const h = hitosDe(f.hitos), y = objeto(hitos[datos.folio]) ? { ...hitos[datos.folio] } : {};
      let movio = false;
      for (const c of HITOS) if (h[c] > 0 && !(Number(y[c]) > 0 && Number(y[c]) <= h[c])) { y[c] = h[c]; movio = true; }
      if (movio) { hitos[datos.folio] = y; hitosCambio = true; }
    }
  }
  return { historial: lista, hitos: hitosCambio ? hitos : null, cambios: nuevas + reemplazadas + quitadas, nuevas, reemplazadas, quitadas, choques, choquesDe };
}

/** Lo que contestó una función de la base, en tres casos: bien, definitivo (no se reintenta) o parar la vuelta. */
export function leerRespuesta(r) {
  if (!r || r.error) {
    const m = String((r && r.error && (r.error.message || r.error.code)) || 'La base no contestó.');
    return { ok: false, parar: true, codigo: /jwt|token/i.test(m) ? 'SIN_SESION' : 'SIN_RED', mensaje: m };
  }
  const d = r.data;
  if (d && d.ok === false) {
    const codigo = String(d.codigo || 'DESCONOCIDO');
    const definitivo = ['ROL_SIN_PERMISO', 'NO_ENCONTRADO', 'DATO_INVALIDO'].includes(codigo);
    return { ok: false, parar: !definitivo, codigo, mensaje: String(d.mensaje || codigo) };
  }
  return { ok: true, data: d || {} };
}

/* ============================================================================
   Subir y bajar
   ============================================================================ */

const leerLS = (clave, vacio) => {
  try { const v = JSON.parse(globalThis.localStorage.getItem(clave) || 'null'); return v == null ? vacio : v; }
  catch (_) { return vacio; }
};

/**
 * @param {{cliente:function():Promise<Object>, almacen:Object, area:string|function():string, empresa?:string|function():string,
 *          disp:string|function():string, historial?:function():Array, hitos?:function():Object, borradas?:function():Array,
 *          folioMax?:function():number, ahora?:function():number, enLinea?:function():boolean, anotar?:function(Object):Promise,
 *          subidaHecha?:{leer:function():Object|null, poner:function(Object)}}} deps
 *   `almacen` es el de la sombra (`almacenIndexedDB()` o `almacenEnMemoria()` de supa-sombra.js), con su almacén `cotizaciones`.
 *   Lo demás lee, por omisión, las claves del cotizador en este mismo origen.
 */
export function crearCotizaciones(deps) {
  const almacen = deps.almacen;
  const ahora = deps.ahora || (() => Date.now());
  const enLinea = deps.enLinea || (() => !(typeof navigator !== 'undefined' && navigator.onLine === false));
  const valor = v => String((typeof v === 'function' ? v() : v) || '');
  const area = () => valor(deps.area);
  const disp = () => valor(deps.disp);
  const empresa = () => { const e = valor(deps.empresa); return EMPRESA.test(e) ? e : 'al3d'; };
  const historial = deps.historial || (() => { const a = leerLS(CLAVE_HISTORIAL, []); return Array.isArray(a) ? a : []; });
  const hitosLocales = deps.hitos || (() => objeto(leerLS(CLAVE_HITOS, {})) || {});
  const borradas = deps.borradas || (() => { const a = leerLS(CLAVE_BORRADAS, []); return Array.isArray(a) ? a : []; });
  const folioMax = deps.folioMax || (() => { try { return parseInt(globalThis.localStorage.getItem(CLAVE_FOLIO) || '0', 10) || 0; } catch (_) { return 0; } });
  const subidaHecha = deps.subidaHecha || {
    leer: () => objeto(leerLS(CLAVE_SUBIDA, null)),
    poner: v => { try { globalThis.localStorage.setItem(CLAVE_SUBIDA, JSON.stringify(v)); } catch (_) { /* es aviso */ } },
  };
  const anotar = async ev => { try { if (deps.anotar) await deps.anotar(ev); } catch (_) { /* el registro es aviso */ } };
  let _subiendo = null, _ultimoError = '', _ultima = null;

  async function registro() { return new Map((await almacen.listar(ALMACEN)).map(r => [r.id, r])); }
  const poner = (fg, o) => almacen.poner(ALMACEN, { id: fg, ts: ahora(), ...o });
  const enNube = x => ({ estado: 'nube', en_nube: true, firma: x.f, hitos: x.fh, editado: editadoDe(x.e) });

  async function llamar(c, nombre, args) {
    let r;
    try { r = await c.rpc(nombre, args); } catch (e) { r = { error: e }; }
    return leerRespuesta(r);
  }

  /* Las filas de la base de esos folios, con la RLS de la cuenta. Fabricación no pregunta: no ve ninguna. */
  async function filasDe(c, fgs) {
    const out = new Map();
    if (!puedeLeer(area())) return out;
    for (let i = 0; i < fgs.length; i += 50) {
      const { data, error } = await c.from('cotizaciones').select(COLUMNAS).eq('empresa_id', empresa()).in('folio_global', fgs.slice(i, i + 50));
      if (error) throw Object.assign(new Error(error.message || 'La base no contestó.'), { codigo: 'SIN_RED' });
      for (const f of (Array.isArray(data) ? data : [])) if (f && f.folio_global) out.set(f.folio_global, f);
    }
    return out;
  }

  async function marcarSubida(plan, reg) {
    if (subidaHecha.leer()) return;
    if (plan.nuevas.length || plan.cambiadas.length) return;
    let n = 0;
    for (const r of reg.values()) if (r.en_nube) n++;
    subidaHecha.poner({ ts: ahora(), disp: disp(), en_la_base: n });
    await anotar({ tipo: 'cotizaciones', mensaje: 'la subida única de este aparato terminó: ' + n + ' en la base' });
  }

  async function subirDeVerdad() {
    const a = area(), d = disp();
    const nada = (motivo, extra = {}) => ({ motivo, subidas: 0, ya_estaban: 0, actualizadas: 0, borradas: 0, ajenas: 0, apartadas: 0,
      esperan: 0, hay_mas: false, codigo: '', ...extra });
    if (!puedeSubir(a)) return nada(a ? 'sin_permiso' : 'sin_area');
    if (!DISP.test(d)) return nada('sin_aparato');
    if (!enLinea()) return nada('sin_red');
    let reg = await registro();
    const fuente = { historial: historial(), hitos: hitosLocales(), borradas: borradas() };
    const plan = planDeSubida(fuente, reg, { disp: d, ahora: ahora() });
    if (!plan.nuevas.length && !plan.cambiadas.length && !plan.soloHitos.length && !plan.borrar.length) {
      await marcarSubida(plan, reg);
      return nada('nada', { esperan: plan.esperan, ajenas: plan.ajenas, apartadas: plan.apartadas, borrar_en: plan.borrarEn });
    }
    let c;
    try { c = await deps.cliente(); } catch (e) { _ultimoError = String((e && e.message) || 'Supabase no cargó.'); return nada('sin_cliente'); }
    const res = nada('ok', { esperan: plan.esperan, borrar_en: plan.borrarEn });
    let parada = '';
    const parar = r => { parada = r.codigo || 'SIN_RED'; _ultimoError = r.mensaje || ''; };
    const apartar = async (x, r, en_nube) => {
      await poner(x.fg, { estado: 'apartada', en_nube: !!en_nube, firma: x.f, hitos: x.fh, editado: editadoDe(x.e), codigo: r.codigo, motivo: r.mensaje });
      res.apartadas++;
      await anotar({ tipo: 'cotizacion_apartada', registro: x.fg, mensaje: r.mensaje });
    };

    /* 1 · Lo que la base no conoce: subida_unica, en lotes. Un acuse por cotización, en el orden del lote. */
    const revisar = [];
    const nuevas = plan.nuevas.slice(0, NUEVAS_POR_VUELTA);
    for (let i = 0; i < nuevas.length && !parada; i += POR_LOTE) {
      const lote = [], grandes = [];
      for (const x of nuevas.slice(i, i + POR_LOTE)) (canonico(normal(x.e, d)).length > TOPE_DATOS ? grandes : lote).push(x);
      for (const x of grandes) await apartar(x, { codigo: 'DATO_INVALIDO', mensaje: 'La cotización pasa del tope de la base (200 000 caracteres sin imágenes).' }, false);
      if (!lote.length) continue;
      const hitosLote = {};
      for (const x of lote) if (conHitos(x.hitos)) hitosLote[x.e.folio] = x.hitos;
      const r = await llamar(c, 'subida_unica', { p_lote: { disp: d, folio_max: folioMax(), cotizaciones: lote.map(x => normal(x.e, d)), hitos: hitosLote } });
      if (!r.ok) {
        if (r.parar) { parar(r); break; }
        for (const x of lote) await apartar(x, r, false);
        continue;
      }
      const acuses = (Array.isArray(r.data.acuse) ? r.data.acuse : []).filter(z => z && z.tipo === 'cotizacion');
      for (let k = 0; k < lote.length; k++) {
        const x = lote[k], z = acuses[k] || {};
        if (z.estado === 'creada') { await poner(x.fg, enNube(x)); res.subidas++; }
        /* «Ya estaba»: los datos sí, pero subida_unica solo pone los hitos al crear; si aquí hay, van en la vuelta siguiente. */
        else if (z.estado === 'ya_estaba') { await poner(x.fg, { ...enNube(x), hitos: firmaHitos(null) }); res.ya_estaban++; }
        else if (z.estado === 'conflicto') revisar.push(x);
        else if (z.estado === 'rechazada' && z.motivo === 'ROL_SIN_PERMISO') { await poner(x.fg, { estado: 'ajena', firma: x.f }); res.ajenas++; }
        else await apartar(x, { codigo: z.motivo || 'DESCONOCIDO', mensaje: 'La base no la aceptó (' + (z.motivo || 'sin acuse') + ').' }, false);
      }
    }

    /* 2 · Lo que la base ya tiene y aquí es distinto: se lee la fila y se decide quién gana antes de pisar. */
    if (!parada) {
      revisar.push(...plan.cambiadas.slice(0, CAMBIOS_POR_VUELTA));
      let filas = new Map();
      try { filas = await filasDe(c, [...new Set(revisar.map(x => x.fg))]); }
      catch (e) { parar({ codigo: 'SIN_RED', mensaje: String((e && e.message) || e) }); }
      for (const x of (parada ? [] : revisar)) {
        const f = filas.get(x.fg);
        let soloHitos = false;
        if (f) {
          const nube = { estado: 'nube', en_nube: true, firma: firma(f.datos, f.disp), hitos: firmaHitos(f.hitos), editado: editadoDe(f.datos) };
          if (f.deleted_at) { await poner(x.fg, nube); continue; }                       // borrada allá: la bajada la quita de aquí
          if (nube.firma === x.f) {
            if (x.fh === nube.hitos || !conHitos(x.hitos)) { await poner(x.fg, { ...nube, hitos: x.fh }); res.ya_estaban++; continue; }
            soloHitos = true;
          } else if (!ganaLocal(x.e, f.datos, d)) { await poner(x.fg, nube); res.esperan++; continue; }
        } else if (puedeLeer(a)) {
          /* La base dijo «conflicto» (o la tenía) y ahora no la enseña: no es de esta cuenta. */
          await poner(x.fg, { estado: 'ajena', firma: x.f }); res.ajenas++; continue;
        } else if (dispDe(x.e, d) !== d) {
          /* Fabricación no la puede leer para comparar: solo pisa las que emitió este aparato. */
          await poner(x.fg, { estado: 'ajena', firma: x.f }); res.ajenas++; continue;
        }
        const op = { folio_global: x.fg };
        if (!soloHitos) op.datos = normal(x.e, d);
        if (conHitos(x.hitos)) op.hitos = x.hitos;
        const r = await llamar(c, 'cotizacion_guardar', { p_op: op });
        if (r.ok) { await poner(x.fg, enNube(x)); res.actualizadas++; continue; }
        if (r.parar) { parar(r); break; }
        if (r.codigo === 'ROL_SIN_PERMISO') { await poner(x.fg, { estado: 'ajena', firma: x.f }); res.ajenas++; }
        else if (r.codigo === 'NO_ENCONTRADO') await almacen.borrar(ALMACEN, x.fg);      // la siguiente vuelta la crea
        else await apartar(x, r, true);
      }
    }

    /* 3 · Solo los hitos (la cotización ya está igual en la base). */
    for (const x of (parada ? [] : plan.soloHitos.slice(0, CAMBIOS_POR_VUELTA))) {
      const r = await llamar(c, 'cotizacion_guardar', { p_op: { folio_global: x.fg, hitos: x.hitos } });
      if (r.ok) { const ya = reg.get(x.fg) || {}; await poner(x.fg, { ...ya, hitos: x.fh }); res.actualizadas++; continue; }
      if (r.parar) { parar(r); break; }
      if (r.codigo === 'ROL_SIN_PERMISO') { await poner(x.fg, { estado: 'ajena', firma: x.f }); res.ajenas++; }
      else if (r.codigo === 'NO_ENCONTRADO') await almacen.borrar(ALMACEN, x.fg);
      else await apartar(x, r, true);
    }

    /* 4 · Lo que se borró del historial aquí. */
    for (const fg of (parada ? [] : plan.borrar.slice(0, CAMBIOS_POR_VUELTA))) {
      const r = await llamar(c, 'cotizacion_guardar', { p_op: { folio_global: fg, borrar: true } });
      if (r.ok || r.codigo === 'NO_ENCONTRADO') { await poner(fg, { estado: 'borrada', en_nube: r.ok }); res.borradas++; continue; }
      if (r.parar) { parar(r); break; }
      await poner(fg, { estado: 'ajena' }); res.ajenas++;
    }

    res.hay_mas = !parada && (plan.nuevas.length > NUEVAS_POR_VUELTA || plan.cambiadas.length > CAMBIOS_POR_VUELTA
      || plan.soloHitos.length > CAMBIOS_POR_VUELTA || plan.borrar.length > CAMBIOS_POR_VUELTA);
    if (parada) { res.motivo = 'parada'; res.codigo = parada; await anotar({ tipo: 'cotizaciones', mensaje: 'se reintenta: ' + _ultimoError }); }
    else {
      _ultimoError = '';
      const n = res.subidas + res.actualizadas + res.borradas;
      if (n || res.ya_estaban) await anotar({ tipo: 'cotizaciones', mensaje: res.subidas + ' nuevas en la base, ' + res.actualizadas + ' actualizadas' +
        (res.ya_estaban ? ', ' + res.ya_estaban + ' ya estaban' : '') + (res.borradas ? ', ' + res.borradas + ' borradas' : '') });
      reg = await registro();
      await marcarSubida(planDeSubida({ historial: historial(), hitos: hitosLocales(), borradas: borradas() }, reg, { disp: d, ahora: ahora() }), reg);
    }
    return res;
  }

  /** Manda lo que falte. Una vuelta a la vez: quien llega segundo espera la misma. Nunca lanza. */
  function subir() {
    if (_subiendo) return _subiendo;
    _subiendo = subirDeVerdad()
      .catch(e => { _ultimoError = String((e && e.message) || e); return { motivo: 'error', subidas: 0, mensaje: _ultimoError, hay_mas: false }; })
      .then(r => { _ultima = { ts: ahora(), ...r }; return r; })
      .finally(() => { _subiendo = null; });
    return _subiendo;
  }

  /**
   * Las filas de la base que cambiaron después de `desde` (texto ISO; vacío: todas), para el cotizador. Con la RLS de la cuenta:
   * Dirección todas, Pagos las suyas; a Fabricación ni se le pregunta. Lo que llega se anota en el registro (así no se vuelve a
   * subir). Nunca lanza: {ok:true, filas, hasta} o {ok:false, codigo, mensaje}.
   */
  async function bajar(desde) {
    try {
      const a = area();
      if (!puedeLeer(a)) return { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Las cotizaciones de la base solo las ven Dirección y Pagos.' };
      if (!enLinea()) return { ok: false, codigo: 'SIN_RED', mensaje: 'Sin señal.' };
      const c = await deps.cliente();
      const d0 = /^\d{4}-\d{2}-\d{2}T/.test(String(desde || '')) ? String(desde) : '';
      const crudas = await todas(() => {
        let q = c.from('cotizaciones').select(COLUMNAS).eq('empresa_id', empresa());
        if (d0) q = q.gt('updated_at', d0);
        return q.order('updated_at');
      });
      const filas = [];
      let hasta = d0;
      for (const f of crudas) {
        if (!objeto(f) || !FOLIO_GLOBAL.test(String(f.folio_global || ''))) continue;
        const u = String(f.updated_at || '');
        if (u && (!hasta || Date.parse(u) > Date.parse(hasta))) hasta = u;
        filas.push({ folio_global: f.folio_global, folio: f.folio, disp: f.disp, datos: f.datos, hitos: objeto(f.hitos) || {},
          updated_at: u, deleted_at: f.deleted_at || null });
      }
      const reg = await registro().catch(() => new Map());
      for (const f of filas) {
        if (!esEntrada(f.datos)) continue;
        const ya = reg.get(f.folio_global);
        if (ya && ya.estado === 'ajena') continue;
        await poner(f.folio_global, { estado: f.deleted_at ? 'borrada' : 'nube', en_nube: true, firma: firma(f.datos, f.disp),
          hitos: firmaHitos(f.hitos), editado: editadoDe(f.datos) }).catch(() => {});
      }
      return { ok: true, filas, hasta, area: a };
    } catch (e) {
      return { ok: false, codigo: 'SIN_RED', mensaje: String((e && e.message) || e) };
    }
  }

  /** Para Ajustes: lo de la base, lo que espera y lo apartado. Lee el teléfono, no la red. */
  async function estado() {
    const reg = await registro().catch(() => new Map());
    const plan = planDeSubida({ historial: historial(), hitos: hitosLocales(), borradas: borradas() }, reg, { disp: disp(), ahora: ahora() });
    let enLaBase = 0, ajenas = 0, apartadas = 0;
    for (const r of reg.values()) {
      if (r.estado === 'nube' && r.en_nube) enLaBase++;
      else if (r.estado === 'ajena') ajenas++;
      else if (r.estado === 'apartada') apartadas++;
    }
    return { area: area(), en_la_base: enLaBase, por_subir: plan.nuevas.length + plan.cambiadas.length + plan.soloHitos.length + plan.borrar.length,
             esperan: plan.esperan, ajenas, apartadas, subida_unica: subidaHecha.leer(), ultima: _ultima, ultimo_error: _ultimoError, subiendo: !!_subiendo };
  }

  /** Lo apartado vuelve a la fila (después de arreglar la causa). */
  async function reintentarApartadas() {
    let k = 0;
    for (const r of (await almacen.listar(ALMACEN))) if (r.estado === 'apartada') { await almacen.borrar(ALMACEN, r.id); k++; }
    if (k) await anotar({ tipo: 'cotizaciones', mensaje: k + ' cotizaciones apartadas de vuelta a la fila' });
    return k;
  }

  return { subir, bajar, estado, reintentarApartadas };
}
