/* ============================================================================
   LAS IMÁGENES DE LAS COTIZACIONES EN LA NUBE (Supabase Storage). APAGADO.

   Lo decidió Elías el 2026-10-16: las imágenes de las cotizaciones (el plano de cada partida, los
   renders y la propuesta visual: `al3d_cot_imgs`, js/cotizador/imagenes.js) se suben a la nube. El
   aviso de privacidad ya lo dice («en el almacenamiento de archivos de Supabase»).

   Este módulo no lo importa nadie de forma estática: lo usa js/datos/supa-enchufe.js, que solo se
   carga con el interruptor general de Supabase Y el de la sombra encendidos en este aparato.
   Apagado, ni se descarga.

   SUBIR (con la sombra encendida o, desde el paso 4 de docs/BASE-MANDA.md, con la base mandando; y con
   sesión en la base). Del HISTORIAL del cotizador —las cotizaciones
   autorizadas—, cada imagen que esté en este teléfono va al bucket privado `cotizacion-imagenes`
   con la ruta del diseño (supabase/DISENO.md §3.5):
       <empresa>/<folio_global>/<id>.jpg              folio_global = folio + '@' + aparato
     · UNA vez por id. Una cotización duplicada comparte las imágenes de la original (las apunta por
       id, no las copia), así que cada imagen va en la carpeta de la cotización MÁS VIEJA que la usa;
       subirla en cada carpeta gastaría el doble del 1 GB del plan gratuito.
     · La excepción: si otra de las que la usan se GANÓ (la base tiene su obra con V-### y no
       cancelada), la imagen se COPIA también a la carpeta de la ganada, con una copia de Storage (no
       se vuelve a subir: no gasta datos del teléfono). Es ahí donde la busca Fabricación, que solo
       sabe el folio de la obra (Q-02 bis); sin la copia, la duplicada ganada se quedaba sin plano.
       Cada copia se anota como `copia:<ruta>`; un folio que no está ganado no se vuelve a preguntar
       en 10 minutos.
     · Idempotente: lo subido se anota en la base local de la sombra (`al3d_sombra`, almacén
       `imagenes`) y no se vuelve a mandar; si la nube ya la tiene («ya existe»), cuenta como subida.
       Nunca se sobrescribe (`upsert: false`): una imagen no cambia con el mismo id.
     · Sin bloquear nada, como la sombra: pocas por vuelta, y lo que falla por red o sesión se queda
       para la vuelta siguiente; lo que la nube rechaza para siempre (sin permiso, demasiado pesada,
       no es imagen) se APARTA con su motivo y se puede reintentar desde Ajustes.
     · Quién sube (supabase/opcional/storage.sql): Dirección, todo; Pagos, solo las de SUS
       cotizaciones que ya estén en la base (antes se pregunta cuáles: la base no le deja subir a
       las demás); Fabricación, NADA (Q-02; tampoco desde Q-02 bis, que solo le abre LEER).
     · Lo que no sale: los borradores (la cotización en pantalla, sin autorizar), las entradas del
       historial sin aparato (de antes de que se guardara `disp`; se cuentan en Ajustes) y la imagen
       de referencia con la que se cotizó con IA (`aiFile`: no tiene id y puede ser un PDF).

   BAJAR (con la lectura en vivo encendida). Si el cotizador abre una cotización cuya imagen no está
   en este teléfono (un respaldo no trae las imágenes, o es otro teléfono), la pide por la ventanilla
   `AL3D_NUBE` que pone el enchufe; aquí se busca en la nube con una URL FIRMADA de 60 segundos y se
   devuelve como data URL. El que la guarda en el teléfono es el propio cotizador. Fabricación no
   baja nada por aquí (no tiene cotizaciones, y la base no le dejaría ver las de una no ganada).

   LAS DE UNA OBRA GANADA (Q-02 bis, decidido por Elías el 2026-10-16; con la lectura en vivo). La
   ficha del proyecto le pide a la ventanilla (`AL3D_NUBE.obra(folio_global)`) las imágenes de la
   obra: se lee su fila de `proyectos` (los tres roles la leen; `origen_obra` trae los ids del plano,
   los renders y la propuesta, sin precios), se confirma que está GANADA con la misma regla de la
   política (V-###, no cancelada, no borrada) y se baja cada una de la carpeta de su folio con una
   URL firmada de 60 s. Solo Dirección y Fabricación: la base no le abre a Pagos las de una obra que
   no es su cotización. Nada se guarda en el teléfono: viven en memoria mientras la app está abierta.
   ============================================================================ */

export const BUCKET = 'cotizacion-imagenes';
export const TOPE_OBJETO = 2 * 1024 * 1024;                 // = file_size_limit del bucket (storage.sql)
export const TIPOS = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const SEGUNDOS_URL = 60;                             // vida de la URL firmada de una bajada
export const POR_VUELTA = 8;                                // subidas por vuelta: no se come los datos del teléfono
export const POR_BAJADA = 12;                               // imágenes por petición del cotizador
/* Lo más que sube UN aparato. El plan gratuito da 1 GB de archivos para todo el proyecto; es una
   perilla de seguridad, no una cuota: si se llega, se para y Ajustes lo dice. */
export const TOPE_APARATO = 750 * 1024 * 1024;
export const MS_NO_REPETIR = 10 * 60 * 1000;                // una imagen que no se encontró no se vuelve a pedir en 10 min
export const AREAS = Object.freeze(['direccion', 'pagos']);  // Fabricación nunca (Q-02)
/* Quién ve en la ficha las imágenes de una obra ganada (Q-02 bis): Fabricación, para quien se abrió,
   y Dirección, que ya lo ve todo. Pagos no: la base solo le enseña las de SUS cotizaciones. */
export const AREAS_OBRA = Object.freeze(['direccion', 'fabricacion']);
export const EN_MEMORIA = 16;                               // imágenes de obra que se quedan en memoria (las fichas que se reabren)
export const CLAVE_HISTORIAL = 'al3d_historial';
export const BASE_LOCAL = 'al3d_cot_imgs';
export const ALMACEN_LOCAL = 'img';

const FOLIO_GLOBAL = /^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const EMPRESA = /^[a-z][a-z0-9_]{1,31}$/;

/** ¿Esta área sube y baja imágenes? Solo Dirección y Pagos. */
export const puedeImagenes = area => AREAS.includes(String(area || ''));
/** ¿Esta área ve las imágenes de una obra ganada en la ficha? Dirección y Fabricación (Q-02 bis). */
export const puedeVerObra = area => AREAS_OBRA.includes(String(area || ''));

/* ============================================================================
   Lo puro
   ============================================================================ */

/** El folio global de una entrada del historial (`COT-0042-B@K7QM`), o '' si no tiene aparato. */
export function folioGlobalDe(e) {
  if (!e || typeof e !== 'object' || !e.folio || !e.disp) return '';
  const fg = String(e.folio) + '@' + String(e.disp);
  return FOLIO_GLOBAL.test(fg) ? fg : '';
}

/** Los ids de imagen de una entrada: el plano de cada partida, los renders y la propuesta (lo mismo que `imgIdsDeQ`). */
export function idsDe(e) {
  if (!e || typeof e !== 'object') return [];
  const lista = v => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string');
  const planos = (Array.isArray(e.items) ? e.items : []).map(it => (it && typeof it.plano === 'string') ? it.plano : '');
  return [...new Set([...planos, ...lista(e.renders), ...lista(e.propuesta)].filter(id => ID.test(id)))];
}

export const rutaDe = (empresa, folioGlobal, id) => empresa + '/' + folioGlobal + '/' + id + '.jpg';
const folioDeRuta = ruta => String(ruta).split('/')[1] || '';

/**
 * Qué se sube y dónde, desde el historial. PURA.
 * @param {Array<Object>} historial las entradas de `al3d_historial`
 * @param {{empresa?:string, permitidos?:Set<string>|null}} [o] `permitidos`: solo esas carpetas
 *   (para Pagos: sus cotizaciones que ya están en la base)
 * @returns {{imagenes:Map<string,{id:string, ruta:string, folio_global:string, candidatos:string[]}>, sinAparato:number}}
 *   `ruta` es la carpeta de la cotización más vieja que usa la imagen; `candidatos`, todas las que la
 *   usan (de la más vieja a la más nueva), que es donde se busca al bajarla.
 */
export function planDeSubida(historial, { empresa = 'al3d', permitidos = null } = {}) {
  const entradas = (Array.isArray(historial) ? historial : []).map((e, i) => ({ e, i, fg: folioGlobalDe(e), ts: Number(e && e.ts) || 0 }))
    .filter(x => x.e && typeof x.e === 'object');
  /* La más vieja primero. El historial guarda la más nueva arriba, así que en un empate de `ts` la
     de más abajo es la más vieja. */
  entradas.sort((a, b) => (a.ts - b.ts) || (b.i - a.i));
  const imagenes = new Map();
  let sinAparato = 0;
  for (const x of entradas) {
    const ids = idsDe(x.e);
    if (!ids.length) continue;
    if (!x.fg) { sinAparato++; continue; }
    if (permitidos && !permitidos.has(x.fg)) continue;
    for (const id of ids) {
      const ruta = rutaDe(empresa, x.fg, id);
      const ya = imagenes.get(id);
      if (!ya) imagenes.set(id, { id, ruta, folio_global: x.fg, candidatos: [ruta] });
      else if (!ya.candidatos.includes(ruta)) ya.candidatos.push(ruta);
    }
  }
  return { imagenes, sinAparato };
}

/**
 * ¿La base dice que esta obra está GANADA? La misma regla que la política de Storage (Q-02 bis):
 * una venta (V-###), que no está cancelada ni borrada. PURA.
 * @param {Object} p una fila de `proyectos` ({folio_global, folio_hoja, etapa, deleted_at})
 */
export function esGanada(p) {
  return !!(p && typeof p === 'object' && p.folio_hoja && p.folio_global && FOLIO_GLOBAL.test(String(p.folio_global)) &&
            p.etapa && p.etapa !== 'cancelado' && !p.deleted_at);
}

/**
 * Las imágenes de una obra, desde su `origen_obra` (la copia SIN precios de la cotización): el plano
 * de cada partida, los renders y la propuesta, en ese orden, sin repetir, con su rótulo. PURA.
 * @returns {Array<{id:string, que:string}>}
 */
export function imagenesDeObra(o) {
  if (!o || typeof o !== 'object') return [];
  const out = [], vistos = new Set();
  const poner = (id, que) => { if (typeof id === 'string' && ID.test(id) && !vistos.has(id)) { vistos.add(id); out.push({ id, que }); } };
  (Array.isArray(o.items) ? o.items : []).forEach((it, i) => { if (it && typeof it === 'object') poner(it.plano, 'Plano · partida ' + (i + 1)); });
  (Array.isArray(o.renders) ? o.renders : []).forEach((id, i) => poner(id, 'Render ' + (i + 1)));
  (Array.isArray(o.propuesta) ? o.propuesta : []).forEach((id, i) => poner(id, 'Propuesta ' + (i + 1)));
  return out;
}

/** La llave en el registro de la sombra de la COPIA de una imagen en otra carpeta (no choca con un id: lleva «:» y «/»). */
export const claveCopia = ruta => 'copia:' + ruta;

/**
 * Las copias que podrían hacer falta: por cada imagen que comparten varias cotizaciones y que YA
 * está en la nube (según el registro), las demás carpetas que la usan y donde todavía no se copió.
 * Si alguna de esas cotizaciones se ganó, ahí se copia (eso lo decide la base, no esta función). PURA.
 * @param {Map} imagenes las de `planDeSubida`
 * @param {Map<string,Object>} reg el registro de la sombra (id → {ruta, estado})
 * @returns {Array<{id:string, de:string, ruta:string, folio_global:string}>}
 */
export function copiasPosibles(imagenes, reg) {
  const out = [];
  for (const p of imagenes.values()) {
    if (p.candidatos.length < 2) continue;
    const r = reg.get(p.id);
    if (!r || (r.estado !== 'subida' && r.estado !== 'ya_estaba') || !r.ruta) continue;
    for (const ruta of p.candidatos) {
      if (ruta === r.ruta || reg.has(claveCopia(ruta))) continue;
      out.push({ id: p.id, de: r.ruta, ruta, folio_global: folioDeRuta(ruta) });
    }
  }
  return out;
}

/** Una data URL en base64 → {tipo, bytes}; null si no es una. Sin fetch: la CSP de la app no deja pedir `data:`. */
export function bytesDeDataUrl(url) {
  const s = String(url || '');
  const coma = s.indexOf(',');
  if (coma < 0) return null;
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64$/i.exec(s.slice(0, coma));
  if (!m) return null;
  let bin;
  try { bin = atob(s.slice(coma + 1).replace(/\s+/g, '')); } catch (_) { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { tipo: m[1].toLowerCase(), bytes };
}

/** Bytes → data URL en base64 (por pedazos: `String.fromCharCode` con un millón de argumentos revienta la pila). */
export function dataUrlDeBytes(bytes, tipo) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return 'data:' + tipo + ';base64,' + btoa(bin);
}

/** Lo que pesa una data URL sin decodificarla. */
export function bytesAprox(url) {
  const s = String(url || ''), coma = s.indexOf(',');
  if (coma < 0) return 0;
  const b64 = s.length - coma - 1;
  return Math.max(0, Math.floor(b64 * 3 / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0));
}

/**
 * Lo que dijo Storage de una subida o de una URL firmada, en cuatro casos:
 *   'ya_estaba'  la nube ya la tiene con ese nombre (se cuenta como subida);
 *   'no_esta'    no existe, o la base no deja verla (Storage dice lo mismo en los dos casos);
 *   'rechazada'  reintentar no lo arregla (sin permiso, demasiado pesada, no es imagen);
 *   'reintentar' red, sesión vencida, el bucket no existe todavía, o algo que no se entiende.
 * @param {*} error el `error` de supabase-js (StorageApiError: message, status, statusCode)
 */
export function leerError(error) {
  const e = error || {};
  const m = String(e.message || e.error || e || '');
  const sc = String(e.statusCode || ''), st = Number(e.status) || 0;
  const es = n => sc === String(n) || st === n;
  if (/bucket not found/i.test(m)) return { caso: 'reintentar', codigo: 'SIN_BUCKET', mensaje: 'La nube todavía no tiene el bucket de imágenes (falta aplicar supabase/opcional/storage.sql).' };
  if (/row-level security|violates/i.test(m)) return { caso: 'rechazada', codigo: 'SIN_PERMISO', mensaje: 'La base no deja subir esta imagen desde esta cuenta.' };
  if (/jwt|jws|token/i.test(m)) return { caso: 'reintentar', codigo: 'SIN_SESION', mensaje: 'La sesión de la base venció: se reintenta al renovarse.' };
  if (es(409) || /already exists|duplicate/i.test(m)) return { caso: 'ya_estaba', codigo: 'YA_EXISTE', mensaje: m };
  if (es(404) || /not found/i.test(m)) return { caso: 'no_esta', codigo: 'NO_ENCONTRADO', mensaje: m };
  if (es(413) || /too large|maximum allowed size|exceeded/i.test(m)) return { caso: 'rechazada', codigo: 'DEMASIADO_GRANDE', mensaje: 'La imagen pasa del tope de 2 MB.' };
  if (es(415) || /mime/i.test(m)) return { caso: 'rechazada', codigo: 'TIPO_NO_PERMITIDO', mensaje: 'La nube solo acepta JPEG, PNG y WebP.' };
  if (es(403)) return { caso: 'rechazada', codigo: 'SIN_PERMISO', mensaje: 'La base no deja subir esta imagen desde esta cuenta.' };
  return { caso: 'reintentar', codigo: st ? 'HTTP_' + st : 'SIN_RED', mensaje: m || 'La nube no contestó.' };
}

const mb = n => (Number(n) / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';

/* ============================================================================
   Lo del navegador (solo lectura de lo del cotizador)
   ============================================================================ */

/** El historial del cotizador, como lo guarda él. Solo se LEE (js/datos/cotizador.js: la plataforma nunca escribe sus claves). */
export function historialLocal() {
  try { const a = JSON.parse(globalThis.localStorage.getItem(CLAVE_HISTORIAL) || '[]'); return Array.isArray(a) ? a : []; }
  catch (_) { return []; }
}

let _dbLocal = null;
/** Una imagen de `al3d_cot_imgs` ({id, url, w, h, ts}) o null. Solo lectura. Si la base no existe la crea IGUAL que el
 *  cotizador (mismo almacén, misma llave): abrirla sin versión toma la que tenga, sin pelear con él. */
export function leerImagenLocal(id) {
  if (!_dbLocal) {
    _dbLocal = new Promise((res, rej) => {
      const r = globalThis.indexedDB.open(BASE_LOCAL);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ALMACEN_LOCAL)) r.result.createObjectStore(ALMACEN_LOCAL, { keyPath: 'id' }); };
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); _dbLocal = null; }; res(db); };
      r.onerror = () => rej(r.error);
    });
    _dbLocal.catch(() => { _dbLocal = null; });
  }
  return _dbLocal.then(db => new Promise((res, rej) => {
    if (!db.objectStoreNames.contains(ALMACEN_LOCAL)) { res(null); return; }
    const g = db.transaction(ALMACEN_LOCAL, 'readonly').objectStore(ALMACEN_LOCAL).get(String(id));
    g.onsuccess = () => res(g.result || null);
    g.onerror = () => rej(g.error);
  }));
}

/* ============================================================================
   Subir y bajar
   ============================================================================ */

/**
 * @param {{cliente:function():Promise<Object>, almacen:Object, area:string|function():string,
 *          empresa?:string|function():string, historial?:function():Array, leerLocal?:function(string):Promise<Object|null>,
 *          fetch?:function, anotar?:function(Object):Promise, ahora?:function():number, enLinea?:function():boolean}} deps
 *   `almacen` es el de la sombra (`almacenIndexedDB()` o `almacenEnMemoria()` de supa-sombra.js), con su almacén `imagenes`.
 */
export function crearImagenes(deps) {
  const almacen = deps.almacen;
  const ahora = deps.ahora || (() => Date.now());
  const enLinea = deps.enLinea || (() => !(typeof navigator !== 'undefined' && navigator.onLine === false));
  const valor = v => String((typeof v === 'function' ? v() : v) || '');
  const area = () => valor(deps.area);
  const empresa = () => { const e = valor(deps.empresa); return EMPRESA.test(e) ? e : 'al3d'; };
  const historial = deps.historial || historialLocal;
  const leerLocal = deps.leerLocal || leerImagenLocal;
  const pedir = deps.fetch || ((...a) => globalThis.fetch(...a));
  const anotar = async ev => { try { if (deps.anotar) await deps.anotar(ev); } catch (_) { /* el registro es aviso */ } };
  let _subiendo = null, _ultimoError = '', _tope = false;
  const noEncontradas = new Map();          // id → cuándo se buscó sin encontrarla
  const ganadas = new Set();                // folios que la base ya dijo que son obras ganadas (para las copias)
  const revisadas = new Map();              // folio → cuándo se preguntó y NO estaba ganado
  const enMemoria = new Map();              // ruta → data URL de una imagen de obra ya bajada (las más recientes al final)
  const noEstaEnObra = new Map();           // ruta → cuándo se buscó sin encontrarla

  async function registro() { return new Map((await almacen.listar('imagenes')).map(r => [r.id, r])); }

  /* Cuáles de esos folios son obras GANADAS (Q-02 bis): los tres roles leen `proyectos`. Lo ganado se
     recuerda; lo que no, no se vuelve a preguntar en 10 minutos. */
  async function foliosGanados(c, folios) {
    for (let i = 0; i < folios.length; i += 50) {
      const { data, error } = await c.from('proyectos').select('folio_global, folio_hoja, etapa, deleted_at').eq('empresa_id', empresa()).in('folio_global', folios.slice(i, i + 50));
      if (error) throw Object.assign(new Error(error.message || 'La base no contestó.'), { codigo: 'SIN_RED' });
      for (const r of (Array.isArray(data) ? data : [])) if (esGanada(r)) ganadas.add(r.folio_global);
    }
    const t = ahora();
    for (const f of folios) if (!ganadas.has(f)) revisadas.set(f, t);
  }
  /** Las copias que tocan en esta vuelta: las de un folio ya ganado y las de uno que no se preguntó hace poco. */
  const copiasPorRevisar = (imagenes, reg) => copiasPosibles(imagenes, reg).filter(x =>
    ganadas.has(x.folio_global) || !(revisadas.has(x.folio_global) && ahora() - revisadas.get(x.folio_global) < MS_NO_REPETIR));

  /* Pagos: cuáles de esas carpetas son cotizaciones SUYAS que ya están en la base (la RLS solo le
     enseña las suyas). La política de Storage no le deja subir a ninguna otra. */
  async function foliosPropios(c, folios) {
    const out = new Set();
    for (let i = 0; i < folios.length; i += 50) {
      const { data, error } = await c.from('cotizaciones').select('folio_global').eq('empresa_id', empresa()).in('folio_global', folios.slice(i, i + 50));
      if (error) throw Object.assign(new Error(error.message || 'La base no contestó.'), { codigo: 'SIN_RED' });
      for (const r of (Array.isArray(data) ? data : [])) out.add(r.folio_global);
    }
    return out;
  }

  async function subirDeVerdad() {
    const a = area();
    const nada = (motivo, extra = {}) => ({ motivo, subidas: 0, ya_estaban: 0, apartadas: 0, bytes: 0, hay_mas: false, ...extra });
    if (!puedeImagenes(a)) return nada(a ? 'sin_permiso' : 'sin_area');
    if (!enLinea()) return nada('sin_red');
    const hist = historial();
    let reg = await registro();
    let plan = planDeSubida(hist, { empresa: empresa() }).imagenes;
    let pend = [...plan.values()].filter(p => !reg.has(p.id));
    if (!pend.length && !copiasPorRevisar(plan, reg).length) return nada('nada');
    let c;
    try { c = await deps.cliente(); } catch (e) { _ultimoError = String((e && e.message) || 'Supabase no cargó.'); return nada('sin_cliente'); }
    if (a === 'pagos') {
      let propios;
      const carpetas = [...pend, ...copiasPosibles(plan, reg).map(x => plan.get(x.id))].flatMap(p => p.candidatos.map(folioDeRuta));
      try { propios = await foliosPropios(c, [...new Set(carpetas)]); }
      catch (e) { _ultimoError = String((e && e.message) || e); return nada('parada', { codigo: 'SIN_RED' }); }
      plan = planDeSubida(hist, { empresa: empresa(), permitidos: propios }).imagenes;
      pend = [...plan.values()].filter(p => !reg.has(p.id));
      if (!pend.length && !copiasPorRevisar(plan, reg).length) return nada('esperan_cotizacion');
    }
    let usados = 0;
    for (const r of reg.values()) if (r.estado === 'subida') usados += Number(r.bytes) || 0;
    let subidas = 0, yaEstaban = 0, apartadas = 0, bytes = 0, vistas = 0, parada = '';
    const apartar = async (p, codigo, mensaje) => {
      await almacen.poner('imagenes', { id: p.id, ruta: p.ruta, estado: 'apartada', codigo, mensaje, ts: ahora() });
      apartadas++;
      await anotar({ tipo: 'imagen_apartada', registro: p.id, mensaje });
    };
    for (const p of pend) {
      if (vistas >= POR_VUELTA) break;
      const local = await Promise.resolve().then(() => leerLocal(p.id)).catch(() => null);
      if (!local || typeof local.url !== 'string' || !local.url) continue;     // no está en ESTE teléfono: la sube el que la tenga
      vistas++;
      const b = bytesDeDataUrl(local.url);
      if (!b || !TIPOS.includes(b.tipo)) { await apartar(p, 'TIPO_NO_PERMITIDO', 'No es una imagen JPEG, PNG o WebP.'); continue; }
      if (!b.bytes.length || b.bytes.length > TOPE_OBJETO) { await apartar(p, 'DEMASIADO_GRANDE', 'Pesa ' + mb(b.bytes.length) + '; el tope es 2 MB.'); continue; }
      if (usados + b.bytes.length > TOPE_APARATO) {
        _tope = true; parada = 'TOPE';
        _ultimoError = 'Este aparato ya subió ' + mb(usados) + ': llegó a su tope de ' + mb(TOPE_APARATO) + ' (el plan gratuito da 1 GB para todo).';
        break;
      }
      let r;
      try {
        r = await c.storage.from(BUCKET).upload(p.ruta, new Blob([b.bytes], { type: b.tipo }), {
          upsert: false, contentType: b.tipo, cacheControl: '31536000',
          metadata: { w: Number(local.w) || 0, h: Number(local.h) || 0, ts: Number(local.ts) || 0 } });
      } catch (e) { r = { error: e }; }
      if (r && !r.error) {
        await almacen.poner('imagenes', { id: p.id, ruta: p.ruta, estado: 'subida', bytes: b.bytes.length, ts: ahora() });
        subidas++; bytes += b.bytes.length; usados += b.bytes.length;
        continue;
      }
      const L = leerError(r && r.error);
      if (L.caso === 'ya_estaba') { await almacen.poner('imagenes', { id: p.id, ruta: p.ruta, estado: 'ya_estaba', ts: ahora() }); yaEstaban++; continue; }
      if (L.caso === 'rechazada') { await apartar(p, L.codigo, L.mensaje); continue; }
      parada = L.codigo; _ultimoError = L.mensaje;
      break;
    }
    /* Las copias a la carpeta de una obra GANADA (ver la cabecera). Solo de lo que ya está en la nube,
       y preguntando a la base, una vez, cuáles de esas carpetas son obras ganadas. */
    let copiadas = 0;
    if (!parada && vistas < POR_VUELTA) {
      reg = await registro();
      let lista = copiasPorRevisar(plan, reg);
      const preguntar = [...new Set(lista.map(x => x.folio_global).filter(f => !ganadas.has(f)))];
      if (preguntar.length) {
        try { await foliosGanados(c, preguntar); }
        catch (e) { parada = 'SIN_RED'; _ultimoError = String((e && e.message) || e); lista = []; }
      }
      for (const x of lista) {
        if (vistas >= POR_VUELTA) break;
        if (!ganadas.has(x.folio_global)) continue;
        vistas++;
        const copia = { id: claveCopia(x.ruta), ruta: x.ruta };
        let r;
        try { r = await c.storage.from(BUCKET).copy(x.de, x.ruta); } catch (e) { r = { error: e }; }
        const L = r && !r.error ? null : leerError(r && r.error);
        if (!L || L.caso === 'ya_estaba') {
          await almacen.poner('imagenes', { ...copia, de: x.de, estado: 'copiada', ts: ahora() });
          copiadas++;
          continue;
        }
        if (L.caso === 'rechazada') { await apartar(copia, L.codigo, L.mensaje); continue; }
        if (L.caso === 'no_esta') { await apartar(copia, L.codigo, 'El original ya no está en la nube: no hay qué copiar.'); continue; }
        parada = L.codigo; _ultimoError = L.mensaje;
        break;
      }
    }
    if (subidas || yaEstaban) {
      await anotar({ tipo: 'imagenes', mensaje: subidas + ' subidas a la nube (' + mb(bytes) + ')' + (yaEstaban ? ', ' + yaEstaban + ' ya estaban' : '') });
    }
    if (copiadas) await anotar({ tipo: 'imagenes', mensaje: copiadas + (copiadas === 1 ? ' copiada' : ' copiadas') + ' a la carpeta de su obra ganada' });
    if (parada) await anotar({ tipo: 'imagenes', mensaje: (parada === 'TOPE' ? 'se paró: ' : 'se reintenta: ') + _ultimoError });
    else if (subidas || yaEstaban || copiadas) _ultimoError = '';
    return { motivo: parada ? 'parada' : 'ok', codigo: parada, subidas, ya_estaban: yaEstaban, copiadas, apartadas, bytes,
             hay_mas: !parada && vistas >= POR_VUELTA };
  }

  /** Sube lo que falte. Una vuelta a la vez: quien llega segundo espera la misma. Nunca lanza. */
  function subir() {
    if (_subiendo) return _subiendo;
    _subiendo = subirDeVerdad()
      .catch(e => { _ultimoError = String((e && e.message) || e); return { motivo: 'error', subidas: 0, mensaje: _ultimoError, hay_mas: false }; })
      .finally(() => { _subiendo = null; });
    return _subiendo;
  }

  /**
   * Una imagen de la nube por su ruta, con una URL firmada de 60 s: su data URL; null si no está ahí
   * (o la base no deja verla, que Storage dice igual) o no es una imagen; 'sin_red' si no hubo con quién
   * hablar. Nunca lanza.
   */
  async function traer(c, ruta) {
    let s;
    try { s = await c.storage.from(BUCKET).createSignedUrl(ruta, SEGUNDOS_URL); } catch (e) { s = { error: e }; }
    if (!s || s.error || !s.data || !s.data.signedUrl) return leerError(s && s.error).caso === 'reintentar' ? 'sin_red' : null;
    let resp;
    try { resp = await pedir(s.data.signedUrl); } catch (_) { return 'sin_red'; }
    if (!resp || !resp.ok) return null;
    const tipo = String((resp.headers && resp.headers.get && resp.headers.get('content-type')) || '').split(';')[0].trim().toLowerCase();
    if (!TIPOS.includes(tipo)) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (!buf.length || buf.length > TOPE_OBJETO) return null;
    return dataUrlDeBytes(buf, tipo);
  }

  /**
   * Busca en la nube las imágenes que el cotizador no tiene. Devuelve {id: dataURL} con las que
   * encontró (las demás no vienen). Nunca lanza.
   */
  async function bajar(ids) {
    try {
      const a = area();
      if (!puedeImagenes(a) || !enLinea()) return {};
      const t = ahora();
      const pedidos = [...new Set((Array.isArray(ids) ? ids : []).map(String))]
        .filter(id => ID.test(id) && !(noEncontradas.has(id) && t - noEncontradas.get(id) < MS_NO_REPETIR)).slice(0, POR_BAJADA);
      if (!pedidos.length) return {};
      const plan = planDeSubida(historial(), { empresa: empresa() }).imagenes;
      const reg = await registro().catch(() => new Map());
      const c = await deps.cliente();
      const out = {};
      let sinRed = false;
      for (const id of pedidos) {
        const candidatos = [...new Set([reg.get(id) && reg.get(id).ruta, ...((plan.get(id) || {}).candidatos || [])].filter(Boolean))].slice(0, 3);
        for (const ruta of candidatos) {
          const r = await traer(c, ruta);
          if (r === 'sin_red') { sinRed = true; break; }
          if (r) { out[id] = r; break; }                       // si no, no está ahí (o la base no deja verla): la siguiente carpeta
        }
        if (sinRed) break;
        if (!out[id]) noEncontradas.set(id, t);
      }
      const n = Object.keys(out).length;
      if (n) await anotar({ tipo: 'imagenes', mensaje: n + (n === 1 ? ' bajada' : ' bajadas') + ' de la nube' });
      return out;
    } catch (_) { return {}; }
  }

  /**
   * Las imágenes de una obra GANADA, para la ficha del proyecto (Q-02 bis): el plano de cada partida,
   * los renders y la propuesta, de la carpeta de su folio. Lee la fila de `proyectos` (los ids vienen
   * en `origen_obra`, sin precios) y confirma que está ganada antes de pedir nada a Storage. Nunca lanza.
   * @returns {Promise<{estado:'ok'|'no_ganada'|'sin_obra'|'sin_red'|'sin_permiso', imagenes:Array<{id,que,url}>, faltan:number, total:number}>}
   *   `faltan`: las que la obra dice que tiene y la nube todavía no (las sube el teléfono que la cotizó).
   */
  async function deObra(folioGlobal) {
    const vacio = (estado, extra = {}) => ({ estado, imagenes: [], faltan: 0, total: 0, ...extra });
    try {
      if (!puedeVerObra(area())) return vacio('sin_permiso');
      const fg = String(folioGlobal || '');
      if (!FOLIO_GLOBAL.test(fg)) return vacio('sin_obra');
      if (!enLinea()) return vacio('sin_red');
      const c = await deps.cliente();
      const { data, error } = await c.from('proyectos').select('folio_global, folio_hoja, etapa, deleted_at, origen_obra')
        .eq('empresa_id', empresa()).in('folio_global', [fg]);
      if (error) return vacio('sin_red');
      const p = (Array.isArray(data) ? data : []).find(x => x && x.folio_global === fg);
      if (!p) return vacio('sin_obra');
      if (!esGanada(p)) return vacio('no_ganada');
      const lista = imagenesDeObra(p.origen_obra).slice(0, POR_BAJADA);
      const t = ahora();
      const out = [];
      let sinRed = false, nuevas = 0;
      for (const x of lista) {
        const ruta = rutaDe(empresa(), fg, x.id);
        let url = enMemoria.get(ruta) || '';
        if (!url && !sinRed && !(noEstaEnObra.has(ruta) && t - noEstaEnObra.get(ruta) < MS_NO_REPETIR)) {
          const r = await traer(c, ruta);
          if (r === 'sin_red') sinRed = true;
          else if (r) { url = r; nuevas++; }
          else noEstaEnObra.set(ruta, t);
        }
        if (!url) continue;
        enMemoria.delete(ruta); enMemoria.set(ruta, url);                 // la más reciente al final
        while (enMemoria.size > EN_MEMORIA) enMemoria.delete(enMemoria.keys().next().value);
        out.push({ ...x, url });
      }
      if (nuevas) await anotar({ tipo: 'imagenes', mensaje: nuevas + (nuevas === 1 ? ' bajada' : ' bajadas') + ' de la nube para la obra ' + fg });
      return { estado: sinRed && !out.length ? 'sin_red' : 'ok', imagenes: out, faltan: lista.length - out.length, total: lista.length, sin_red: sinRed };
    } catch (_) { return vacio('sin_red'); }
  }

  /** Para Ajustes: lo subido, lo que falta (y cuánto pesa) y lo apartado. Lee el teléfono, no la red. */
  async function estado() {
    const reg = await registro().catch(() => new Map());
    const plan = planDeSubida(historial(), { empresa: empresa() });
    let subidas = 0, bytes = 0, apartadas = 0, copias = 0, porSubir = 0, bytesPorSubir = 0, noEstan = 0;
    for (const r of reg.values()) {
      if (r.estado === 'subida') { subidas++; bytes += Number(r.bytes) || 0; }
      else if (r.estado === 'ya_estaba') subidas++;
      else if (r.estado === 'copiada') copias++;
      else if (r.estado === 'apartada') apartadas++;
    }
    for (const p of plan.imagenes.values()) {
      if (reg.has(p.id)) continue;
      const l = await Promise.resolve().then(() => leerLocal(p.id)).catch(() => null);
      if (l && typeof l.url === 'string' && l.url) { porSubir++; bytesPorSubir += bytesAprox(l.url); } else noEstan++;
    }
    return { area: area(), subidas, bytes, copias, apartadas, porSubir, bytesPorSubir, noEstan, sinAparato: plan.sinAparato,
             tope: _tope, ultimo_error: _ultimoError, subiendo: !!_subiendo };
  }

  /** Lo apartado vuelve a la fila (después de arreglar la causa). */
  async function reintentarApartadas() {
    let k = 0;
    for (const r of (await almacen.listar('imagenes'))) if (r.estado === 'apartada') { await almacen.borrar('imagenes', r.id); k++; }
    if (k) await anotar({ tipo: 'imagenes', mensaje: k + ' imágenes apartadas de vuelta a la fila' });
    _tope = false;
    return k;
  }

  return { subir, bajar, deObra, estado, reintentarApartadas };
}
