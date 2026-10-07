/* ============================================================================
   Las carpetas de diseño: de la ficha del proyecto a su carpeta de Drive.

   Los diseños viven en Drive, bajo «AL3D» —«2026 › Trabajos Pendientes › Juan Carlos -
   Centro Dental»—, y Dirección los sube a mano cuando el cliente paga. La plataforma no crea
   ni mueve carpetas: la hoja le pasa el índice (/carpetas, puente-sheets-10) y aquí se decide
   cuál es la de cada proyecto, comparando el nombre «Contacto - Empresa» de la carpeta con el
   contacto y el negocio del proyecto.

   Tres respuestas posibles, y la pantalla dice cuál fue:
     · `fija`    Dirección eligió la carpeta (/carpeta_fijar). Manda sobre el nombre.
     · `una`     el nombre apunta a una sola carpeta.
     · `varias`  hay más de una que se parece —«Ale - Parentesis» y «Ale -Parentesis
                 Coffee»—: se enseñan todas y Dirección elige.
     · `ninguna` todavía no hay carpeta, que es lo normal antes de que el cliente pague.

   Adivinar entre dos sería abrirle al taller el diseño de otro trabajo con toda la seguridad
   del mundo; por eso con dos candidatas parejas se pregunta y no se elige.
   ============================================================================ */

import * as Puente from './puente.js';

/* Cuánto se le cree al índice guardado antes de volver a pedirlo. La hoja tiene su propia caché
   de media hora; esto solo evita una vuelta de red por cada ficha que se abre. */
const VIGENCIA_MS = 10 * 60 * 1000;
const CLAVE_LOCAL = 'al3d.carpetas.v1';

/** El texto como se compara: sin acentos, sin mayúsculas, sin signos, un espacio entre palabras. PURA. */
export function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();
}

/* Palabras que no distinguen a nadie: un «Ing.» o un «de» en común no hace que dos nombres sean
   el mismo cliente. */
const VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'ing', 'lic', 'arq', 'dr', 'dra',
  'sa', 'cv', 'sc', 'the', 'and', 'caja', 'luz', 'letras', 'letrero', 'anuncio']);
const palabras = s => normalizar(s).split(' ').filter(w => w.length > 1 && !VACIAS.has(w));

/* «Contacto - Empresa» partido en sus dos lados. Una carpeta sin guion es todo empresa. */
function lados(nombre) {
  const i = String(nombre || '').indexOf('-');
  if (i < 0) return { contacto: '', empresa: String(nombre || '') };
  return { contacto: nombre.slice(0, i), empresa: nombre.slice(i + 1) };
}

/* Qué parte de las palabras de `a` aparece en `b`. */
function cubre(a, b) {
  if (!a.length) return 0;
  const set = new Set(b);
  return a.filter(w => set.has(w)).length / a.length;
}

/**
 * Qué tanto se parece una carpeta a un proyecto, de 0 a 1. PURA.
 * El negocio pesa más que el contacto: hay tres Danieles y un solo «Tacos Juan».
 */
export function parecido(proyecto, carpeta) {
  const p = proyecto || {};
  const l = lados(carpeta && carpeta.nombre);
  const empC = palabras(l.empresa), conC = palabras(l.contacto);
  const neg = palabras(p.negocio), con = palabras(p.contacto);
  /* Un proyecto viejo puede traer todo en `nombre` («Juan Carlos - Centro Dental»). */
  const nom = palabras(p.nombre);
  if (!neg.length && !con.length && !nom.length) return 0;

  if (normalizar(carpeta && carpeta.nombre) === normalizar(p.nombre) && nom.length) return 1;

  let s = 0;
  if (neg.length && empC.length) {
    /* Las dos direcciones: «Parentesis» contra «Parentesis Coffee» cubre en una y no en la otra. */
    s = 0.7 * Math.min(cubre(neg, empC), 1) * (0.6 + 0.4 * cubre(empC, neg));
  } else if (nom.length) {
    s = 0.7 * cubre(empC.concat(conC), nom) * (0.6 + 0.4 * cubre(nom, empC.concat(conC)));
  }
  if (con.length && conC.length) {
    /* El primer nombre basta: «Juan Carlos» y «Juan Carlos Pérez» son el mismo. */
    const primero = con[0] === conC[0] ? 1 : 0;
    s += 0.3 * Math.max(primero, cubre(conC, con));
  } else if (!con.length && s > 0) {
    /* Sin contacto en el proyecto no se castiga: se escala lo del negocio. */
    s = s / 0.7;
  }
  return Math.min(1, s);
}

/* La llave con la que se fija una carpeta: el folio de la fila en la hoja, que es el mismo en
   todos los teléfonos (`notion_page_id` en los de aquí, `folio_hoja` en los importados; así lo
   lee también puente.js). El folio de cotización queda de reserva para un proyecto que todavía
   no ha subido. */
export function llavesDe(p) {
  return [p && p.notion_page_id, p && p.folio_hoja, p && p.folio_global]
    .map(x => String(x || '').trim()).filter(Boolean);
}

const UMBRAL = 0.55;      // menos que esto no es esa carpeta
const EMPATE = 0.12;      // dos dentro de esta distancia de la mejor son «varias»

/**
 * La carpeta de un proyecto dentro del índice. PURA.
 * @returns {{estado:'fija'|'una'|'varias'|'ninguna', carpeta?:Object, opciones?:Object[]}}
 */
export function buscar(p, indice) {
  const idx = indice || {};
  const fijas = idx.fijas || {};
  for (const k of llavesDe(p)) {
    const f = fijas[k];
    if (f && f.id) {
      const enIndice = (idx.carpetas || []).find(c => c.id === f.id);
      return { estado: 'fija', carpeta: { ...f, ruta: enIndice ? enIndice.ruta : (f.ruta || '') } };
    }
  }
  const puntos = (idx.carpetas || [])
    .map(c => ({ c, s: parecido(p, c) }))
    .filter(x => x.s >= UMBRAL)
    .sort((a, b) => b.s - a.s || (b.c.mod || 0) - (a.c.mod || 0));
  if (!puntos.length) return { estado: 'ninguna' };
  const cerca = puntos.filter(x => puntos[0].s - x.s <= EMPATE);
  if (cerca.length === 1) return { estado: 'una', carpeta: cerca[0].c };
  return { estado: 'varias', opciones: cerca.slice(0, 5).map(x => x.c) };
}

/** El enlace de una carpeta de Drive. PURA. */
export function enlace(carpeta) {
  const id = String((carpeta && carpeta.id) || '');
  return /^[A-Za-z0-9_-]{10,}$/.test(id) ? 'https://drive.google.com/drive/folders/' + id : '';
}

/* ---------------------------------------------------------------- el índice */

let memoria = null;   // { ts, datos }
let enCurso = null;

function leerLocal() {
  try { const t = localStorage.getItem(CLAVE_LOCAL); return t ? JSON.parse(t) : null; } catch (_) { return null; }
}
function guardarLocal(x) {
  try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(x)); } catch (_) {}
}

/**
 * El índice de carpetas: el de memoria si está fresco, si no se pide a la hoja. Sin señal se
 * usa el último guardado en este aparato y se dice que es viejo.
 * @returns {Promise<{ok:boolean, datos?:Object, viejo?:boolean, codigo?:string, mensaje?:string}>}
 */
export async function indice({ forzar = false } = {}) {
  if (!forzar && memoria && Date.now() - memoria.ts < VIGENCIA_MS) return { ok: true, datos: memoria.datos };
  if (enCurso && !forzar) return enCurso;
  enCurso = (async () => {
    try {
      /* 35 s: recorrer Drive la primera vez, sin caché en la hoja, tarda. */
      const r = await Puente.hablar('carpetas', forzar ? { forzar: true } : {}, 35000);
      if (r && r.ok) {
        const datos = { carpetas: r.carpetas || [], fijas: r.fijas || {}, completo: r.completo !== false, ts: r.ts || Date.now() };
        memoria = { ts: Date.now(), datos };
        guardarLocal(datos);
        return { ok: true, datos };
      }
      const viejo = leerLocal();
      if (viejo && r && r.codigo !== 'NO_ENCONTRADO') return { ok: true, datos: viejo, viejo: true };
      return { ok: false, codigo: (r && r.codigo) || 'DESCONOCIDO',
        mensaje: (r && r.mensaje) || 'La hoja no contestó la lista de carpetas.' };
    } catch (e) {
      const viejo = leerLocal();
      if (viejo) return { ok: true, datos: viejo, viejo: true };
      return { ok: false, codigo: (e && e.codigo) || 'SIN_RED', mensaje: (e && e.message) || 'Sin señal para preguntarle a la hoja.' };
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

/**
 * Dirección dice cuál es la carpeta de un proyecto (o, con `null`, que se vuelva a buscar por
 * nombre). Se anota en la hoja, para todo el equipo.
 */
export async function fijar(p, carpeta) {
  const folio = llavesDe(p)[0];
  if (!folio) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: 'Este proyecto todavía no tiene folio con el cual anotar su carpeta.' };
  let r;
  try { r = await Puente.hablar('carpeta_fijar', { folio, carpeta: carpeta == null ? null : String(carpeta) }); }
  catch (e) { return { ok: false, codigo: (e && e.codigo) || 'SIN_RED', mensaje: (e && e.message) || 'Sin señal: no se pudo anotar en la hoja.' }; }
  if (r && r.ok && memoria) {
    /* Se refleja aquí sin esperar a la próxima vuelta: quien la eligió la quiere ver ya. Las
       demás llaves del proyecto se limpian para que no gane una elección vieja. */
    for (const k of llavesDe(p)) delete memoria.datos.fijas[k];
    if (r.carpeta) memoria.datos.fijas[folio] = r.carpeta;
    guardarLocal(memoria.datos);
  }
  return r || { ok: false, codigo: 'DESCONOCIDO', mensaje: 'La hoja no contestó.' };
}
