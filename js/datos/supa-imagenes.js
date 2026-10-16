/* ============================================================================
   LAS IMÁGENES DE LAS COTIZACIONES EN LA NUBE (Supabase Storage). APAGADO.

   Lo decidió Elías el 2026-10-16: las imágenes de las cotizaciones (el plano de cada partida, los
   renders y la propuesta visual: `al3d_cot_imgs`, js/cotizador/imagenes.js) se suben a la nube. El
   aviso de privacidad ya lo dice («en el almacenamiento de archivos de Supabase»).

   Este módulo no lo importa nadie de forma estática: lo usa js/datos/supa-enchufe.js, que solo se
   carga con el interruptor general de Supabase Y el de la sombra encendidos en este aparato.
   Apagado, ni se descarga.

   SUBIR (con la sombra encendida y sesión en la base). Del HISTORIAL del cotizador —las cotizaciones
   autorizadas—, cada imagen que esté en este teléfono va al bucket privado `cotizacion-imagenes`
   con la ruta del diseño (supabase/DISENO.md §3.5):
       <empresa>/<folio_global>/<id>.jpg              folio_global = folio + '@' + aparato
     · UNA vez por id. Una cotización duplicada comparte las imágenes de la original (las apunta por
       id, no las copia), así que cada imagen va en la carpeta de la cotización MÁS VIEJA que la usa;
       subirla en cada carpeta gastaría el doble del 1 GB del plan gratuito.
     · Idempotente: lo subido se anota en la base local de la sombra (`al3d_sombra`, almacén
       `imagenes`) y no se vuelve a mandar; si la nube ya la tiene («ya existe»), cuenta como subida.
       Nunca se sobrescribe (`upsert: false`): una imagen no cambia con el mismo id.
     · Sin bloquear nada, como la sombra: pocas por vuelta, y lo que falla por red o sesión se queda
       para la vuelta siguiente; lo que la nube rechaza para siempre (sin permiso, demasiado pesada,
       no es imagen) se APARTA con su motivo y se puede reintentar desde Ajustes.
     · Quién sube (supabase/opcional/storage.sql): Dirección, todo; Pagos, solo las de SUS
       cotizaciones que ya estén en la base (antes se pregunta cuáles: la base no le deja subir a
       las demás); Fabricación, NADA, porque las cotizaciones llevan precios (Q-02).
     · Lo que no sale: los borradores (la cotización en pantalla, sin autorizar), las entradas del
       historial sin aparato (de antes de que se guardara `disp`; se cuentan en Ajustes) y la imagen
       de referencia con la que se cotizó con IA (`aiFile`: no tiene id y puede ser un PDF).

   BAJAR (con la lectura en vivo encendida). Si el cotizador abre una cotización cuya imagen no está
   en este teléfono (un respaldo no trae las imágenes, o es otro teléfono), la pide por la ventanilla
   `AL3D_NUBE` que pone el enchufe; aquí se busca en la nube con una URL FIRMADA de 60 segundos y se
   devuelve como data URL. El que la guarda en el teléfono es el propio cotizador. Fabricación no
   baja nada (la base tampoco se lo dejaría).
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
export const CLAVE_HISTORIAL = 'al3d_historial';
export const BASE_LOCAL = 'al3d_cot_imgs';
export const ALMACEN_LOCAL = 'img';

const FOLIO_GLOBAL = /^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const EMPRESA = /^[a-z][a-z0-9_]{1,31}$/;

/** ¿Esta área sube y baja imágenes? Solo Dirección y Pagos. */
export const puedeImagenes = area => AREAS.includes(String(area || ''));

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

  async function registro() { return new Map((await almacen.listar('imagenes')).map(r => [r.id, r])); }

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
    const reg = await registro();
    let pend = [...planDeSubida(hist, { empresa: empresa() }).imagenes.values()].filter(p => !reg.has(p.id));
    if (!pend.length) return nada('nada');
    let c;
    try { c = await deps.cliente(); } catch (e) { _ultimoError = String((e && e.message) || 'Supabase no cargó.'); return nada('sin_cliente'); }
    if (a === 'pagos') {
      let propios;
      try { propios = await foliosPropios(c, [...new Set(pend.flatMap(p => p.candidatos.map(folioDeRuta)))]); }
      catch (e) { _ultimoError = String((e && e.message) || e); return nada('parada', { codigo: 'SIN_RED' }); }
      pend = [...planDeSubida(hist, { empresa: empresa(), permitidos: propios }).imagenes.values()].filter(p => !reg.has(p.id));
      if (!pend.length) return nada('esperan_cotizacion');
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
    if (subidas || yaEstaban) {
      await anotar({ tipo: 'imagenes', mensaje: subidas + ' subidas a la nube (' + mb(bytes) + ')' + (yaEstaban ? ', ' + yaEstaban + ' ya estaban' : '') });
    }
    if (parada) await anotar({ tipo: 'imagenes', mensaje: (parada === 'TOPE' ? 'se paró: ' : 'se reintenta: ') + _ultimoError });
    else if (subidas || yaEstaban) _ultimoError = '';
    return { motivo: parada ? 'parada' : 'ok', codigo: parada, subidas, ya_estaban: yaEstaban, apartadas, bytes,
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
          let s;
          try { s = await c.storage.from(BUCKET).createSignedUrl(ruta, SEGUNDOS_URL); } catch (e) { s = { error: e }; }
          if (!s || s.error || !s.data || !s.data.signedUrl) {
            if (leerError(s && s.error).caso === 'reintentar') { sinRed = true; break; }
            continue;                                          // no está ahí (o la base no deja verla): la siguiente carpeta
          }
          let resp;
          try { resp = await pedir(s.data.signedUrl); } catch (_) { sinRed = true; break; }
          if (!resp || !resp.ok) continue;
          const tipo = String((resp.headers && resp.headers.get && resp.headers.get('content-type')) || '').split(';')[0].trim().toLowerCase();
          if (!TIPOS.includes(tipo)) continue;
          const buf = new Uint8Array(await resp.arrayBuffer());
          if (!buf.length || buf.length > TOPE_OBJETO) continue;
          out[id] = dataUrlDeBytes(buf, tipo);
          break;
        }
        if (sinRed) break;
        if (!out[id]) noEncontradas.set(id, t);
      }
      const n = Object.keys(out).length;
      if (n) await anotar({ tipo: 'imagenes', mensaje: n + (n === 1 ? ' bajada' : ' bajadas') + ' de la nube' });
      return out;
    } catch (_) { return {}; }
  }

  /** Para Ajustes: lo subido, lo que falta (y cuánto pesa) y lo apartado. Lee el teléfono, no la red. */
  async function estado() {
    const reg = await registro().catch(() => new Map());
    const plan = planDeSubida(historial(), { empresa: empresa() });
    let subidas = 0, bytes = 0, apartadas = 0, porSubir = 0, bytesPorSubir = 0, noEstan = 0;
    for (const r of reg.values()) {
      if (r.estado === 'subida') { subidas++; bytes += Number(r.bytes) || 0; }
      else if (r.estado === 'ya_estaba') subidas++;
      else if (r.estado === 'apartada') apartadas++;
    }
    for (const p of plan.imagenes.values()) {
      if (reg.has(p.id)) continue;
      const l = await Promise.resolve().then(() => leerLocal(p.id)).catch(() => null);
      if (l && typeof l.url === 'string' && l.url) { porSubir++; bytesPorSubir += bytesAprox(l.url); } else noEstan++;
    }
    return { area: area(), subidas, bytes, apartadas, porSubir, bytesPorSubir, noEstan, sinAparato: plan.sinAparato,
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

  return { subir, bajar, estado, reintentarApartadas };
}
