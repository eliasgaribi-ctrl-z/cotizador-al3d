/* ============================================================================
   LA CARPETA DE LOS DISEÑOS — «Trabajos Pendientes» en Drive.

   Elías sube los diseños de cada trabajo a una carpeta compartida de Drive, con una subcarpeta
   por venta: «Diego - Herrajes Innova 2», «José - Kelvarion»… Ahí están el .cdr con las escalas,
   sus copias de seguridad y el PDF de órdenes de fabricación. La hoja la lee (/carpetas,
   puente-sheets-10) y este archivo decide qué carpeta es de qué proyecto.

   ── Por qué se empareja por el nombre, y con tolerancia ────────────────────────
   No hay folio en el nombre de la carpeta: se escribe a mano, como se le dice al cliente. En
   octubre de 2026, contra la hoja, ninguna coincidía letra por letra —«Smufit» por «Smurfit»,
   «Madre Maria» por «Hrm. Maria», «Herrajes Innova 2» por «Herrajes Innova»— y dos ventas
   (Colegio Madre Velarde e Hijas de Santa María) comparten carpeta. Así que se compara por
   PALABRAS del negocio, con una letra de error en las largas, y también contra los nombres de
   los archivos de dentro: «Escalas y Logotipo de Hijas de Santa Maria…» es lo que ata la
   segunda venta a la carpeta de la primera.

   Lo que no alcanza el umbral no se adivina: la ficha dice que no encontró carpeta y enseña la
   liga a «Trabajos Pendientes». Una carpeta equivocada en la ficha manda a cortar el diseño de
   otro cliente.

   Lo PURO va arriba (`carpetaDe`, `ordenarArchivos`) y lo prueba pruebas/carpetas.mjs.
   ============================================================================ */

import * as Sync from './sync.js';

/* Palabras que no dicen de quién es el trabajo: artículos, tratamientos y lo que Elías pone en
   el nombre de TODOS los archivos («Escalas y Logotipo de…», «Ordenes de Fabricacion»). */
const VACIAS = new Set(('de del la las los el y e con para por en al sa cv sra sr srta lic ing arq dr dra hrm hna ' +
  'madre padre escalas logotipo logo ordenes orden fabricacion copia seguridad backup of corte ' +
  'cdr pdf eps jpg png ai svg preview vector artwork').split(' '));

/** «Héctor - Smurfit (S2D)» → ['hector', 'smurfit', 's2d']. PURA. */
export function palabras(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(w => w.length >= 3 && !VACIAS.has(w) && !/^\d+$/.test(w));
}

/* Una letra de diferencia (cambiada, de más o de menos), solo en palabras de cinco o más: en
   las cortas una letra ya es otra palabra. */
function casiIgual(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}
const esta = (w, bolsa) => bolsa.some(x => casiIgual(w, x));

/* El negocio y el contacto de un proyecto. Los importados de la hoja ya los traen partidos; los
   del cotizador también. Si falta el negocio, sale del nombre («Contacto - Negocio»). */
function partes(p) {
  const nombre = String((p && p.nombre) || '');
  const i = nombre.indexOf(' - ');
  const negocio = String((p && p.negocio) || (i >= 0 ? nombre.slice(i + 3) : nombre));
  const contacto = String((p && p.contacto) || (i >= 0 ? nombre.slice(0, i) : ''));
  return { negocio: palabras(negocio), contacto: palabras(contacto) };
}

/** Qué tanto es de `p` la carpeta `c`, de 0 a ~1.2. PURA. */
export function puntaje(p, c) {
  const { negocio, contacto } = partes(p);
  if (!negocio.length || !c) return 0;
  const enNombre = palabras(c.nombre);
  const enArchivos = (Array.isArray(c.archivos) ? c.archivos : []).flatMap(a => palabras(a && a.nombre));
  const todas = enNombre.concat(enArchivos);
  const dan = negocio.filter(w => esta(w, todas)).length;
  /* Al menos una palabra del negocio tiene que estar en el NOMBRE de la carpeta: los archivos
     solo desempatan o completan, no bastan solos. */
  if (!negocio.some(w => esta(w, enNombre))) return 0;
  const extra = contacto.some(w => esta(w, enNombre)) ? 0.2 : 0;
  return dan / negocio.length + extra;
}

/** Desde cuánto se da por suya. Con menos, la ficha no enseña ninguna. */
export const UMBRAL = 0.6;

/** La carpeta de `p` entre `lista`, o null. PURA. */
export function carpetaDe(p, lista) {
  let mejor = null, max = 0;
  for (const c of (Array.isArray(lista) ? lista : [])) {
    const s = puntaje(p, c);
    if (s > max || (s === max && mejor && (Number(c.modificado) || 0) > (Number(mejor.modificado) || 0))) {
      if (s > 0) { mejor = c; max = s; }
    }
  }
  return max >= UMBRAL ? mejor : null;
}

const COPIA = /^(backup_of_|copia_de_seguridad_de_)/i;
const esOrden = a => /orden/i.test(String(a && a.nombre || '')) &&
  (/\.pdf$/i.test(String(a.nombre)) || (a && a.tipo) === 'application/pdf');
const peso = a => {
  const n = String(a.nombre || '').toLowerCase();
  if (/orden/.test(n) && /\.pdf$/.test(n)) return 0;
  if (/\.cdr$/.test(n)) return 1;
  if (/\.pdf$/.test(n)) return 2;
  return 3;
};

/** Los archivos en el orden en que se buscan: órdenes de fabricación, diseños, lo demás. Las
 *  copias de seguridad de Corel se cuentan aparte —nadie abre una desde el teléfono—. PURA. */
export function ordenarArchivos(archivos) {
  const lista = (Array.isArray(archivos) ? archivos : [])
    .filter(a => a && a.nombre && !/^desktop\.ini$/i.test(a.nombre));
  const copias = lista.filter(a => COPIA.test(a.nombre)).length;
  const vistos = lista.filter(a => !COPIA.test(a.nombre))
    .sort((a, b) => peso(a) - peso(b) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
  return { vistos, copias };
}

/* Las etapas de la línea del taller: lo que todavía se fabrica. Instalado, garantía y cancelado
   ya no piden carpeta ni enseñan marca en el tablero. */
export const EN_TALLER = ['ganado', 'en_diseno', 'cortado', 'armado', 'listo'];

/** ¿Este proyecto está en el taller? Fuera los cancelados, los que la hoja ya cobra y los que
 *  la hoja dejó de traer. PURA. */
export function enTaller(p) {
  if (!p || !EN_TALLER.includes(p.etapa) || p.hoja_perdida) return false;
  return !['COBRANDO', 'LIQUIDADO'].includes(String(p.estatus_notion || ''));
}

/** El nombre con el que se le abre carpeta: «Contacto - Negocio», como Elías ya las llama. PURA. */
export function nombreParaCarpeta(p) {
  const c = String((p && p.contacto) || '').trim(), n = String((p && p.negocio) || '').trim();
  return (c && n ? c + ' - ' + n : String((p && p.nombre) || n || '')).replace(/\s+/g, ' ').trim();
}

/** Cómo va la carpeta de un proyecto, para la marca del tablero: 'ordenes' (ya tiene su PDF de
 *  órdenes de fabricación), 'sin_ordenes', 'sin_carpeta', o null si no está en el taller o
 *  todavía no se sabe nada de Drive. PURA. */
export function estadoDe(p, lista) {
  if (!enTaller(p) || !Array.isArray(lista)) return null;
  const c = carpetaDe(p, lista);
  if (!c) return 'sin_carpeta';
  return (c.archivos || []).some(esOrden) ? 'ordenes' : 'sin_ordenes';
}

/** Cómo se dice cada estado en una marca: [clase de `.pf-sem`, texto]. Lo usan el Tablero y
 *  Proyectos, para que digan lo mismo. */
export const MARCA = {
  ordenes:     ['ok', 'Órdenes listas'],
  sin_ordenes: ['falta', 'Sin órdenes'],
  sin_carpeta: ['falta', 'Sin carpeta'],
};

/** Los proyectos del taller sin carpeta, a los que se les puede abrir una: con un negocio que
 *  diga de quién es —sin palabras que cuenten, la carpeta nueva tampoco la encontraría y se
 *  pediría otra vez en cada vuelta—. PURA. */
export function sinCarpeta(proyectos, lista) {
  return (Array.isArray(proyectos) ? proyectos : [])
    .filter(p => enTaller(p) && palabras(partesNegocio(p)).length && !carpetaDe(p, lista));
}
const partesNegocio = p => {
  const nombre = String((p && p.nombre) || '');
  const i = nombre.indexOf(' - ');
  return String((p && p.negocio) || (i >= 0 ? nombre.slice(i + 3) : nombre));
};

/* ----------------------------------------------------------------------------
   Lo que habla con la hoja. Una vez cada cinco minutos (la hoja guarda lo mismo de su lado), y
   la última respuesta se queda en este aparato para que la ficha y el tablero la enseñen sin
   señal. Si la hoja no contesta, tampoco se le vuelve a preguntar antes de cinco minutos: con
   el reloj de 30 s de la sincronización, una hoja vieja recibiría dos preguntas por minuto
   para contestar siempre lo mismo.
   ---------------------------------------------------------------------------- */
const K_CACHE = 'al3d_pf_carpetas';
const MS_FRESCA = 5 * 60 * 1000;
let _mem = null;          /* {ts, raiz, carpetas} */
let _vuelo = null;
let _fallo = null;        /* {ts, codigo, mensaje} */
const _pedidas = new Set();   /* nombres que este aparato ya pidió abrir en esta sesión */

function leerGuardada() {
  try { const x = JSON.parse(localStorage.getItem(K_CACHE) || 'null'); return x && Array.isArray(x.carpetas) ? x : null; }
  catch (_) { return null; }
}
function guardar() { try { localStorage.setItem(K_CACHE, JSON.stringify(_mem)); } catch (_) {} }

/** Lo último que se sabe de Drive, sin red y sin esperar: para pintar el tablero. */
export function ultima() {
  if (!_mem) _mem = leerGuardada();
  return _mem ? _mem.carpetas : null;
}

/**
 * Las carpetas, frescas si se puede.
 * @returns {Promise<{ok:true, raiz:string, carpetas:Array, vieja:boolean, nueva?:boolean}|{ok:false, codigo:string, mensaje:string}>}
 */
export function listar() {
  if (!_mem) _mem = leerGuardada();
  const ya = (vieja) => ({ ok: true, raiz: _mem.raiz, carpetas: _mem.carpetas, vieja });
  if (_mem && Date.now() - _mem.ts < MS_FRESCA) return Promise.resolve(ya(false));
  if (_fallo && Date.now() - _fallo.ts < MS_FRESCA) {
    return Promise.resolve(_mem ? ya(true) : { ok: false, codigo: _fallo.codigo, mensaje: _fallo.mensaje });
  }
  if (_vuelo) return _vuelo;
  _vuelo = (async () => {
    const r = await Sync.carpetas();
    if (r && r.ok) {
      const antes = _mem ? JSON.stringify(_mem.carpetas) : '';
      _mem = { ts: Date.now(), raiz: String(r.raiz || ''), carpetas: r.carpetas };
      _fallo = null;
      guardar();
      return { ...ya(false), nueva: JSON.stringify(r.carpetas) !== antes };
    }
    _fallo = { ts: Date.now(), codigo: (r && r.codigo) || 'SIN_RED', mensaje: (r && r.mensaje) || 'No se pudo leer la carpeta.' };
    /* Sin señal o con la hoja vieja: lo último que se vio, dicho como tal. */
    if (_mem) return ya(true);
    return { ok: false, codigo: _fallo.codigo, mensaje: _fallo.mensaje };
  })().finally(() => { _vuelo = null; });
  return _vuelo;
}

/**
 * Pone al día Drive con el taller. Lo llama la sincronización en cada vuelta (js/app.js): casi
 * siempre contesta de la caché sin tocar la red. En el teléfono de DIRECCIÓN, además, le abre su
 * carpeta al proyecto del taller que no tiene una —«Contacto - Negocio», vacía, dentro de
 * «Trabajos Pendientes»—, hasta cinco por vuelta y una sola vez por nombre en cada sesión.
 * Solo crea: nunca mueve, renombra ni borra nada de Drive.
 *
 * @returns {Promise<{ok:boolean, cambio:boolean, creadas:string[], mensaje?:string}>}
 */
export async function alDia(proyectos, rol) {
  const r = await listar();
  if (!r.ok) return { ok: false, cambio: false, creadas: [], mensaje: r.mensaje };
  const creadas = [];
  if (rol === 'direccion' && !r.vieja) {
    const faltan = sinCarpeta(proyectos, r.carpetas)
      .filter(p => !_pedidas.has(nombreParaCarpeta(p).toLowerCase())).slice(0, 5);
    for (const p of faltan) {
      const nombre = nombreParaCarpeta(p);
      _pedidas.add(nombre.toLowerCase());
      const c = await Sync.crearCarpeta(nombre);
      if (!c.ok) {
        if (c.codigo === 'HOJA_VIEJA' || c.codigo === 'ROL_SIN_PERMISO' || c.codigo === 'SIN_RED') break;
        continue;
      }
      if (!_mem.carpetas.some(x => x && x.id === c.carpeta.id)) _mem.carpetas.push(c.carpeta);
      if (c.creada) creadas.push(c.carpeta.nombre);
    }
    if (faltan.length) guardar();
  }
  return { ok: true, cambio: !!r.nueva || creadas.length > 0, creadas };
}
