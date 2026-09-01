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

/* ----- Clientes: los cuadernos del cotizador, no una lista propia -----
   El cotizador agrupa sus cotizaciones en «cuadernos de cliente» con una regla de dos
   pasadas: primero por teléfono normalizado a diez dígitos —que es el dato confiable,
   porque el nombre se escribe distinto cada vez— y después por nombre, uniéndose al
   cuaderno del teléfono cuando el nombre solo apunta a uno.

   Esta es una RÉPLICA de esa regla, no una versión propia. La primera versión de este
   módulo agrupaba por nombre en minúsculas, que es más simple y está mal: «Andrey» y
   «Andrey Healthylicious» quedaban como dos clientes en la plataforma y como uno en el
   cotizador, y a la primera pregunta de «¿cuánto le hemos vendido a este cliente?» habría
   dos respuestas distintas en la misma app. Si esta regla cambia allá, cambia aquí.

   La otra mitad de la regla, la que dice qué NO se une: el nombre nunca reclama un cuaderno
   que tiene teléfono cuando el teléfono de enfrente es otro. Dos clientes se llaman igual
   más seguido de lo que parece, y un cuaderno con los proyectos de dos personas distintas
   no se nota hasta que alguien le cobra a quien no era. */
const telClave = t => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
const normNom  = s2 => String(s2 || '').trim().toLowerCase().replace(/\s+/g, ' ');
/* Un teléfono a medias no forma cuaderno, pero sí puede DESMENTIR uno: «33 12» no es el
   cliente cuyo teléfono termina en 99 88, aunque se llamen igual. */
const telCompatible = (parcial, clave) => {
  const d = String(parcial || '').replace(/\D/g, '');
  return !d || String(clave || '').includes(d);
};

/** El total que de verdad se cobró en una cotización: el autorizado si difiere del calculado. */
const totalFinalHist = e => totalVendido(e);

export function cuadernos() {
  const hist = historial();
  const grupos = new Map();
  const nomTels = new Map();
  const dame = clave => {
    let g = grupos.get(clave);
    if (!g) { g = { clave, claves: [clave], cots: [] }; grupos.set(clave, g); }
    return g;
  };
  /* Pasada 1: las que traen teléfono. Van primero porque son las que forman los cuadernos
     a los que la pasada 2 puede unirse. */
  for (const e of hist) {
    const d = telClave(e.tel); if (!d) continue;
    dame('tel:' + d).cots.push(e);
    const n = normNom(e.cliente);
    if (n) { if (!nomTels.has(n)) nomTels.set(n, new Set()); nomTels.get(n).add('tel:' + d); }
  }
  /* Pasada 2: las que no lo traen. */
  for (const e of hist) {
    if (telClave(e.tel)) continue;
    const n = normNom(e.cliente);
    if (!n) { dame('?').cots.push(e); continue; }
    const cand = nomTels.get(n);
    if (cand && cand.size === 1 && telCompatible(e.tel, [...cand][0].slice(4))) {
      const g = grupos.get([...cand][0]);
      g.cots.push(e);
      if (g.claves.indexOf('nom:' + n) < 0) g.claves.push('nom:' + n);
      continue;
    }
    dame('nom:' + n).cots.push(e);
  }
  const prim = (g, campo) => {
    const e = g.cots.find(x => String(x[campo] || '').trim());
    return e ? String(e[campo]).trim() : '';
  };
  for (const g of grupos.values()) {
    /* Las dos pasadas rompen el orden del historial dentro del grupo: se rehace, porque de
       «la más reciente manda» dependen el nombre, el teléfono y la dirección. */
    g.cots.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    g.nombre = prim(g, 'cliente');
    const conTel = g.cots.find(x => telClave(x.tel));
    g.tel = conTel ? String(conTel.tel).trim() : prim(g, 'tel');
    g.dirRaw = prim(g, 'dirRaw');
    g.maps = prim(g, 'maps');
    const vistos = new Set([normNom(g.nombre)]);
    g.alias = [];
    for (const e of g.cots) {
      const n = normNom(e.cliente);
      if (n && !vistos.has(n)) { vistos.add(n); g.alias.push(String(e.cliente).trim()); }
    }
    g.vendido = g.cots.reduce((a, e) => a + totalFinalHist(e), 0);
    g.ultima = g.cots.reduce((a, e) => Math.max(a, e.ts || 0), 0);
    g.primera = g.cots.reduce((a, e) => Math.min(a, e.ts || Infinity), Infinity);
    if (!isFinite(g.primera)) g.primera = 0;
    /* El proyecto más reciente: cuando dos cuadernos se llaman igual, el nombre del cliente
       ya no distingue nada y este sí. */
    g.proy = prim(g, 'proy');
  }
  /* Los homónimos, marcados. No se juntan —son clientes distintos— pero tampoco se dejan
     iguales en pantalla: quien los vea tiene que poder decir cuál es cuál. */
  const porNombre = new Map();
  for (const g of grupos.values()) {
    if (g.clave === '?') continue;
    const n = normNom(g.nombre); if (!n) continue;
    porNombre.set(n, (porNombre.get(n) || 0) + 1);
  }
  for (const g of grupos.values()) {
    g.homonimo = g.clave !== '?' && (porNombre.get(normNom(g.nombre)) || 0) > 1;
  }
  /* El cliente con el que se habló hace menos, arriba: es el que se va a buscar. */
  return [...grupos.values()].sort((a, b) => b.ultima - a.ultima);
}

/**
 * El cuaderno al que pertenece una cotización, con la misma regla: manda el teléfono.
 *
 * Con teléfono completo la respuesta es ese cuaderno o ninguno: buscar entonces por nombre
 * —como se hacía— le colgaba a una cotización el cuaderno del cliente homónimo, con su
 * historial y su nota. Sin teléfono decide el nombre, y solo cuando señala a uno: con dos
 * candidatos la respuesta honesta es null, no una de las dos al azar.
 */
export function cuadernoDeEntrada(entrada) {
  if (!entrada) return null;
  const todos = cuadernos();
  const d = telClave(entrada.tel);
  if (d) return todos.find(x => x.clave === 'tel:' + d) || null;
  const n = normNom(entrada.cliente);
  if (!n) return null;
  const cand = todos.filter(g => g.clave !== '?' &&
    (g.clave === 'nom:' + n || normNom(g.nombre) === n || g.alias.some(a => normNom(a) === n)));
  return cand.length === 1 ? cand[0] : null;
}

/* ----- La nota del cuaderno -----
   Lo único del cliente que no sale de ninguna cotización: cómo paga, con quién se habla,
   qué quedó pendiente. La escribe el cotizador y la plataforma solo la lee, como todo lo
   demás de ese lado. Se lee por CUALQUIERA de las claves del grupo, porque la nota pudo
   escribirse cuando el cliente todavía no tenía teléfono y vivía bajo «nom:». */
const CUA_NOTAS = 'al3d_cuadernos';
export function notaDeCuaderno(g) {
  if (!g) return '';
  try {
    const o = JSON.parse(localStorage.getItem(CUA_NOTAS) || '{}');
    if (!o || typeof o !== 'object') return '';
    for (const k of (g.claves || [g.clave])) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v;
      if (v && typeof v === 'object' && typeof v.texto === 'string' && v.texto.trim()) return v.texto;
    }
  } catch (_) {}
  return '';
}

/** Lista plana de clientes, la forma que las pantallas piden. Sale de los cuadernos. */
export function clientes() {
  return cuadernos().filter(g => g.clave !== '?').map(g => ({
    clave: g.clave, nombre: g.nombre, tel: g.tel, dirRaw: g.dirRaw, maps: g.maps,
    alias: g.alias, trabajos: g.cots.length, vendido: g.vendido,
    ultimo: g.ultima, primera: g.primera,
    /* `homonimo` y `proy` viajan porque sin ellos una pantalla que liste clientes enseña
       dos renglones idénticos y no hay manera de decir cuál es cuál. */
    proy: g.proy, homonimo: g.homonimo,
  }));
}

/* ----- ¿Ya se le hizo propuesta? -----
   El cotizador registra cuándo se apretó «Copiar datos para Canva», que es el momento en
   que alguien va a armar el documento que ve el cliente. Ese hecho no estaba escrito en
   ningún lado.

   Con esto se contesta la pregunta que hoy no tiene respuesta: de las que presentamos,
   ¿cuántas se ganaron? Y se contesta sin cruzar nombres contra Canva —los diseños se llaman
   como los nombró quien los hizo, y ese cruce falla seguido— y sin pedirle a nadie que
   capture nada. Es el mismo truco que «se ganó»: sacar el dato del botón que ya se aprieta. */
const CANVA_KEY = 'al3d_canva';

export function propuestas() {
  try {
    const o = JSON.parse(localStorage.getItem(CANVA_KEY) || '{}');
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (_) { return {}; }
}

/** @returns {{primera:number, ultima:number, veces:number}|null} */
export function propuestaDe(folio) {
  const p = propuestas()[folio];
  return (p && p.primera) ? p : null;
}

/**
 * La conversión de verdad. `ganados` es el Set de folios que ya son proyecto.
 * Solo cuenta cotizaciones AUTORIZADAS: un borrador no se presentó ni se perdió.
 * `tasa` es null cuando no hay presentadas todavía — cero de cero no es 0%, es «no se sabe».
 */
export function conversion(ganados) {
  const pres = propuestas();
  let autorizadas = 0, presentadas = 0, ganadas = 0;
  for (const e of historial()) {
    const f = String(e.folio || '').trim();
    if (!f) continue;
    if (e.estado && e.estado !== 'autorizada') continue;
    autorizadas++;
    const conProp = !!(pres[f] && pres[f].primera);
    if (conProp) presentadas++;
    if (ganados && ganados.has(f)) { if (conProp) ganadas++; }
  }
  return { autorizadas, presentadas, ganadas,
           tasa: presentadas > 0 ? ganadas / presentadas : null };
}

/** ¿Hay cotizador en este dispositivo? Si el historial está vacío y el folio en 0, no. */
export function hayCotizador() {
  return historial().length > 0 || cola().length > 0 || folioConfirmados() > 0;
}
