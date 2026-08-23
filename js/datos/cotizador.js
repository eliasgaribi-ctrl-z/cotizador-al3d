/* ============================================================================
   El puente al cotizador. SOLO LECTURA. CERO ESCRITURAS.

   Este módulo NUNCA escribe `al3d_historial`, `al3d_q`, `al3d_queue`, `al3d_folio`,
   `al3d_logo`, `al3d_aifile` ni ninguna clave de IA. Cero excepciones, y no es una
   precaución de estilo: el cotizador está en producción, se usa en la calle delante del
   cliente, y su historial es el único dato irrecuperable del sistema. La plataforma se
   cuelga de él para leer; si la plataforma se equivoca, se pierde la plataforma.

   La única clave que la plataforma escribe del lado del cotizador es `al3d_pf_ganadas`,
   que es SUYA (prefijo al3d_pf_) y que el cotizador solo alimenta.

   Y la decisión que ordena todo lo demás: al ganar una cotización, la plataforma NO guarda
   una referencia a ella. Guarda una COPIA CONGELADA. Verificado: `guardarEnHistorial()`
   hace `arr[idx] = entry` —reemplaza la entrada completa— al reautorizar, al editar y al
   ocultar una partida del PDF, y `ts` se sobrescribe. Una referencia se convertiría en un
   proyecto cuyo material cambia solo. Es el mismo razonamiento por el que el propio
   cotizador congela `_lt` en cada partida del historial.
   ============================================================================ */

import * as Prefs from './prefs.js';
import { TIPO_NOMBRE, TIPO_CORTO, catalogos as catPrecios } from './catalogo-precios.js';

const K_HISTORIAL = 'al3d_historial';
const K_QUEUE     = 'al3d_queue';
const K_FOLIO     = 'al3d_folio';

function leerArray(clave) {
  try {
    const a = JSON.parse(localStorage.getItem(clave) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (_) { return []; }
}

/** Cotizaciones autorizadas, en el orden en que las guarda el cotizador (más reciente primero). */
export function historial() { return leerArray(K_HISTORIAL); }

/** La cola de pendientes de autorizar. Para la tarjeta «esperando precio» de Inicio. */
export function cola() { return leerArray(K_QUEUE).filter(e => e && e.estado === 'pendiente'); }

/** El contador local de folios confirmados. Solo informativo. */
export function folioConfirmados() {
  try { return parseInt(localStorage.getItem(K_FOLIO) || '0', 10) || 0; } catch (_) { return 0; }
}

export function porFolio(folio) {
  if (!folio) return null;
  return historial().find(e => e && e.folio === folio) || null;
}

export const catalogos = catPrecios;

/* ----- La descripción de una partida -----
   Réplica de histDsc() del cotizador, con las mismas tres tablas. Se replica y no se
   importa porque el cotizador no exporta nada: es un archivo con scripts en línea.
   Si divergieran, el mismo trabajo se leería distinto en el historial y en la orden de
   trabajo de fabricación, y el de fabricación llamaría por teléfono a preguntar cuál de
   las dos es. */
const HIST_MAT  = { 'al-paint': 'Aluminio Pintado', 'al-brush': 'Aluminio Brush',
                    'acr-vol': 'Acrílico + Aluminio', 'acr-vinil': 'Acrílico + Vinil',
                    'acero': 'Acero Inoxidable' };
const HIST_ACAB = { sencillo: 'Sencillo', vinil: 'Rotulación Vinil', sandwich: 'Sándwich c/luz' };
const HIST_BAS  = { lamina: 'Lámina', alucobond: 'Alucobond' };

export function descPartida(it) {
  if (!it) return '';
  if (it.desc) return it.desc;
  if (it.tipo === 'letras')   return (HIST_MAT[it.material] || 'Letras 3D') + ' · ' + (it.n || 0) + ' letras, ' + (it.altura || 0) + 'cm';
  if (it.tipo === 'recorte')  return 'Recorte ' + (HIST_ACAB[it.acab] || '') + ' · ' + (it.n || 0) + ' pzas';
  if (it.tipo === 'bastidor') return 'Bastidor ' + (HIST_BAS[it.bas] || '') + ' ' + (it.ancho || 0) + '×' + (it.alto || 0) + 'cm';
  if (it.tipo === 'caja')     return 'Caja de luz ' + (it.ancho || 0) + '×' + (it.alto || 0) + 'cm';
  return 'Partida manual';
}

export const nombreMaterial = k => HIST_MAT[k] || k || '';
export const nombreTipo     = t => TIPO_NOMBRE[t] || t || '';
export const nombreTipoCorto = t => TIPO_CORTO[t] || t || '';

/** El importe congelado de una partida vendida. NUNCA se recalcula: se lee lo que se firmó. */
export function importeCongelado(entrada, it) {
  if (!entrada || !it) return 0;
  const ia = entrada.itemsAuth && entrada.itemsAuth[it.id];
  if (ia !== undefined && ia !== null) return Number(ia) || 0;
  if (it._lt !== undefined && it._lt !== null) return Number(it._lt) || 0;
  /* Sin `_lt` la entrada es de una versión anterior a que el cotizador congelara importes.
     No se inventa el número: se dice que no está, y quien pinte decide si pone un guion. */
  return null;
}

/** El total que se le cobró. `precioAuth` manda cuando difiere del neto: es el ajustado a mano. */
export function totalVendido(entrada) {
  if (!entrada) return 0;
  const neto = Number(entrada.neto) || 0;
  const pa = Number(entrada.precioAuth) || 0;
  return (pa > 0 && Math.abs(pa - neto) > 0.01) ? pa : neto;
}

/* ----- La huella -----
   Réplica exacta de huellaTrabajo(). Los campos son los mismos y en el mismo orden: si
   cambiara uno, TODA cotización parecería editada y el aviso R6 se dispararía en todos los
   proyectos a la vez, que es la forma más rápida de que alguien aprenda a ignorarlo.

   NO incluye cliente, teléfono ni proyecto, y es a propósito: son datos de a quién se le
   cotiza, no del trabajo cotizado. De eso depende que escribir un teléfono que faltaba no
   parezca un cambio de trabajo. */
const CAMPOS_PRECIO = ['tipo', 'material', 'comp', 'luz', 'altura', 'n', 'acab', 'recComp',
                       'bas', 'ancho', 'alto', 'tarifa', 'pz', 'pu'];

export function huellaDe(entrada) {
  if (!entrada || !Array.isArray(entrada.items)) return '';
  return (entrada.iva !== false ? 'c' : 's') + '|' + entrada.items.map(it =>
    it.id + ':' + CAMPOS_PRECIO.map(k => it[k] === undefined ? '' : String(it[k])).join('~')
  ).join(',');
}

/**
 * ¿La cotización de la que salió este proyecto sigue siendo la misma?
 * @returns {'igual'|'cambio'|'desaparecio'|'sin_huella'}
 */
export function estadoOrigen(proyecto) {
  if (!proyecto || !proyecto.origen) return 'sin_huella';
  const hoy = porFolio(proyecto.origen.folio);
  if (!hoy) return 'desaparecio';
  const antes = proyecto.origen.huellaAuth || huellaDe(proyecto.origen);
  if (!antes) return 'sin_huella';
  return antes === huellaDe(hoy) ? 'igual' : 'cambio';
}

/* ----- Cotizaciones autorizadas que nadie ha decidido -----
   El eslabón perdido, hecho visible. Una cotización autorizada es una que ya tiene precio
   bueno; que se haya vendido o no NO está escrito en ningún sistema, y por eso los datos
   del cotizador nunca llegaban a Notion.
   @param foliosGanados Set de folio_global ya convertidos en proyecto */
export function sinDecidir(foliosGanados, diasMin = 0) {
  const ahora = Date.now();
  const disp = Prefs.dispositivo();
  return historial().filter(e => {
    if (!e || !e.folio) return false;
    if (foliosGanados.has(folioGlobal(e.folio, disp))) return false;
    const dias = (ahora - (Number(e.ts) || ahora)) / 86400000;
    return dias >= diasMin;
  });
}

/* ----- El folio, desambiguado por dispositivo -----
   `al3d_folio` es un contador local y monótono en CADA dispositivo. Dos teléfonos pueden
   emitir COT-0042 el mismo día y no son el mismo proyecto. El folio que se enseña sigue
   siendo COT-0042 —es lo que el cliente tiene en la mano—; el que identifica lleva el
   dispositivo pegado. */
export const folioGlobal = (folio, disp) => String(folio || '') + '@' + (disp || Prefs.dispositivo());
export const folioVisible = fg => String(fg || '').split('@')[0];

/**
 * Drena `al3d_pf_ganadas`: convierte el buzón que escribe index.html en proyectos y
 * lo vacía. Idempotente por folio_global. Llamar en cada arranque y en cada evento
 * 'storage'.
 *
 * El import de proyectos.js es dinámico a propósito: proyectos.js importa este módulo
 * —necesita leer el historial y congelar el origen— y un import estático de vuelta sería
 * un ciclo. Aquí el ciclo no existe porque la carga pasa cuando la función corre, no
 * cuando el módulo se evalúa.
 *
 * @returns {Promise<{creados:number, repetidos:number, fallidos:number}>}
 */
export async function drenarBuzon() {
  const buzon = Prefs.leerBuzon();
  if (!buzon.length) return { creados: 0, repetidos: 0, fallidos: 0 };
  const { ganar } = await import('./proyectos.js');
  let creados = 0, repetidos = 0, fallidos = 0;
  const procesadas = [];
  for (const g of buzon) {
    const entrada = porFolio(g.folio);
    if (!entrada) {
      /* El renglón nombra una cotización que ya no está en el historial de ESTE
         dispositivo: se registró en otro teléfono, o se borró del historial. No se
         descarta —el aviso lo va a nombrar— pero tampoco se reintenta en cada arranque. */
      fallidos++;
      procesadas.push(g);
      continue;
    }
    const r = await ganar(entrada, {
      fecha_instalacion: g.fecha_instalacion || '',
      cuenta: g.cuenta || '', estatus_notion: g.estatus || '',
      pct_comision: Number(g.pct_comision) || 0,
      sub: Number(g.sub) || 0, neto: Number(g.neto) || 0,
      anti_pactado: Number(g.anti) || 0,
      disp: g.disp || '',
    });
    if (r.ok) { creados++; procesadas.push(g); }
    else if (r.codigo === 'DUPLICADO') { repetidos++; procesadas.push(g); }
    else fallidos++;   // sin espacio o base cerrada: se queda en el buzón y se reintenta
  }
  if (procesadas.length) Prefs.quitarDelBuzon(procesadas);
  return { creados, repetidos, fallidos };
}

/* ----- Clientes ya conocidos -----
   Misma idea que `clientesConocidos()` del cotizador: el historial ES la lista de
   clientes. La plataforma no pide una entidad cliente y no la va a pedir: la base
   «Registro de clientes» de Notion tiene UNA fila después de tres años. */
export function clientes() {
  const m = new Map();
  for (const e of historial()) {
    const n = String(e.cliente || '').trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (!m.has(k)) m.set(k, { nombre: n, tel: e.tel || '', trabajos: 0, ultimo: 0 });
    const c = m.get(k);
    c.trabajos++;
    if (!c.tel && e.tel) c.tel = e.tel;
    if ((Number(e.ts) || 0) > c.ultimo) c.ultimo = Number(e.ts) || 0;
  }
  return Array.from(m.values()).sort((a, b) => b.ultimo - a.ultimo);
}

/** ¿Hay cotizador en este dispositivo? Si el historial está vacío y el folio en 0, no. */
export function hayCotizador() {
  return historial().length > 0 || cola().length > 0 || folioConfirmados() > 0;
}
