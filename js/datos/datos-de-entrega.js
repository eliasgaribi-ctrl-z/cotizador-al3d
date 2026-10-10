/* ============================================================================
   Los datos para la entrega: teléfono del cliente, cómo se entrega y a dónde.

   En octubre de 2026 ningún proyecto de la plataforma tenía teléfono ni dirección. No es que
   se perdieran: nadie los pedía. «Se ganó» preguntaba la fecha y el plazo, y «Registrar nueva
   venta» de la hoja el dinero; el día de instalar había que ir a sacarlos de WhatsApp, de Canva
   y de los chats. Desde entonces se piden al ganar la venta (js/mod/datos-entrega.js, el bloque
   «Datos para la entrega»), y lo que quede sin capturar el Tablero lo enseña como «Faltan
   datos» hasta que alguien lo complete.

   Lo que a un proyecto le puede faltar, en este orden —el orden en que se dice—:
     · 'tel'      el teléfono del cliente, con diez dígitos o más (los que `telWa` acepta: con
                  menos no hay a quién llamar ni a qué chat escribir).
     · 'entrega'  cómo sale del taller. Un proyecto anterior a la entrega (#97) no trae el campo,
                  y eso no es «instalación»: es que nadie lo dijo. Uno que lo trae ya lo eligió
                  alguien —«Se ganó», la ficha, la columna AF de la hoja—.
     · 'dir'      la dirección, SOLO si se instala. Un envío pide destino pero no se cuenta como
                  falta (el destino a veces llega con la guía), y una recolección no pide nada:
                  se entrega en el taller.
     · 'pin'      el punto en el mapa, también solo si se instala: es lo que mete el trabajo a
                  la ruta de la camioneta.
   Sin forma de entrega elegida se pregunta como si se instalara —es lo que hace todo el resto
   de la plataforma con un proyecto sin el campo (entrega.js)—, así que a ese le pueden faltar
   las cuatro.

   «Todavía no la tengo» (la casilla de «Se ganó») deja guardar sin dirección ni link, pero NO
   quita la falta: queda anotado en el proyecto (`ubicacion_pendiente`) y el renglón del Tablero
   lo dice así, «ubicación pendiente», en lugar de «sin ubicación». Y un link corto que no se
   pudo leer por falta de señal tampoco: queda como «link de Maps por leer» hasta que la
   sincronización le saque el pin (proyectos.resolverLinksPendientes).

   PURO: sin base, sin red y sin DOM. Lo leen el Tablero y el bloque de captura, y
   pruebas/datos-de-entrega.mjs lo corre entero en node.
   ============================================================================ */

import { ENTREGAS, entregaLimpia } from './entrega.js';
import { parseGmaps, esAcortado } from './geo.js';
import { telefonoLimpio, telefonoDe, tienePin } from './proyectos.js';
import { enTaller as enTallerCarpetas } from './carpetas.js';
import { telWa } from '../nucleo/ui.js';
import { diasEntre } from '../nucleo/fechas.js';

/** Cuántos días antes de la entrega un proyecto sin datos se vuelve urgente en el Tablero. Una
 *  semana es lo que tarda en conseguirse una dirección por WhatsApp con un cliente que contesta
 *  tarde, y lo que el taller necesita para armar la ruta. */
export const DIAS_PRONTO = 7;

/** El orden en que se pregunta y en que se dice lo que falta. */
export const FALTAS = ['tel', 'entrega', 'dir', 'pin'];

/** Un teléfono que sirve: el que `telWa` sabe convertir en un chat. Diez dígitos de México, o
 *  con su lada de país. «33 1234» o un texto sin dígitos no son a quién llamar. PURA. */
export function telValido(v) {
  return !!telWa(telefonoLimpio(v));
}

/**
 * Lo que le falta a un proyecto para entregarse, en el orden de `FALTAS`. Vacío = completo. PURA.
 * @param {Object} p el proyecto
 * @returns {string[]}
 */
export function queLeFalta(p) {
  if (!p || typeof p !== 'object') return [];
  const f = [];
  if (!telValido(telefonoDe(p))) f.push('tel');
  if (!ENTREGAS.includes(p.entrega)) f.push('entrega');
  if (entregaLimpia(p.entrega) === 'instalacion') {
    if (!String(p.dir_texto || '').trim()) f.push('dir');
    if (!tienePin(p)) f.push('pin');
  }
  return f;
}

/**
 * Cómo se dice cada falta en el renglón del Tablero, en palabras y no en claves. PURA.
 * El teléfono que existe pero no alcanza dice «teléfono incompleto»; el pin cuyo link corto está
 * guardado esperando señal dice «link de Maps por leer»; la ubicación que alguien dejó para
 * después con «Todavía no la tengo» dice «ubicación pendiente».
 */
export function textoDeFalta(p, clave) {
  const x = p && typeof p === 'object' ? p : {};
  if (clave === 'tel') return telefonoDe(x) ? 'teléfono incompleto' : 'sin teléfono';
  if (clave === 'entrega') return 'sin forma de entrega';
  if (clave === 'dir') return x.ubicacion_pendiente ? 'dirección pendiente' : 'sin dirección';
  if (clave === 'pin') {
    if (linkPorLeer(x)) return 'link de Maps por leer';
    return x.ubicacion_pendiente ? 'ubicación pendiente' : 'sin ubicación';
  }
  return String(clave || '');
}

/** El proyecto tiene guardado un link corto de Maps y todavía no tiene pin: lo que la
 *  sincronización tiene que leer. PURA. */
export function linkPorLeer(p) {
  return !!p && !tienePin(p) && esAcortado(String(p.maps_url || '').trim());
}

/**
 * La lista de «Faltan datos» del Tablero. PURA.
 *
 * Solo los proyectos del taller (`Carpetas.enTaller`: de «Ganado» a «Listo», sin los que la hoja
 * ya cobra ni los que dejó de traer). Lo instalado ya se entregó: pedirle el teléfono ahora es
 * ruido. Ordenados por la fecha de entrega más cercana —la que ya pasó primero, porque ésa es
 * una instalación que se fue sin datos—; los que no tienen fecha van al final, por nombre.
 *
 * @param {Object[]} proys
 * @param {{hoy:string, fechaDe?:function(Object):(string|null), enTaller?:function(Object):boolean}} o
 *   `fechaDe` da la fecha de entrega (la de su instalación viva); sin ella, ninguno tiene fecha.
 * @returns {{p:Object, falta:string[], fecha:string|null, dias:number|null, pronto:boolean}[]}
 */
export function faltanDatos(proys, o = {}) {
  const hoy = String(o.hoy || '');
  const fechaDe = typeof o.fechaDe === 'function' ? o.fechaDe : () => null;
  const enTaller = typeof o.enTaller === 'function' ? o.enTaller : enTallerCarpetas;
  const out = [];
  for (const p of Array.isArray(proys) ? proys : []) {
    if (!p || !enTaller(p)) continue;
    const falta = queLeFalta(p);
    if (!falta.length) continue;
    const f = fechaDe(p);
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(f || '')) ? String(f) : null;
    const dias = fecha && hoy ? diasEntre(hoy, fecha) : null;
    out.push({ p, falta, fecha, dias, pronto: dias !== null && dias <= DIAS_PRONTO });
  }
  return out.sort((a, b) => {
    if (a.fecha && b.fecha && a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    if (!!a.fecha !== !!b.fecha) return a.fecha ? -1 : 1;
    return String(a.p.nombre || '').localeCompare(String(b.p.nombre || ''), 'es');
  });
}

/**
 * Revisa lo que se capturó en el bloque «Datos para la entrega» antes de guardar. PURA.
 *
 * Dos modos, porque son dos momentos distintos:
 *  · 'ganar' (por omisión): la venta se está registrando. Teléfono y forma de entrega son
 *    obligatorios. Si se instala, hacen falta la dirección y el link de Maps, o la casilla
 *    «Todavía no la tengo» marcada (`pendiente`): dejarlo para después es válido, pero se dice.
 *  · 'completar': el panel corto del Tablero. Solo se pide lo que falta y se guarda lo que se
 *    llenó: quien ya tiene el teléfono pero no la dirección no tiene que esperar a tener las dos.
 *    Lo que se escribe tiene que servir, y algo hay que escribir.
 *
 * `pide` dice qué campos tiene el bloque (los cuatro de `FALTAS`); lo que no se pide no se revisa.
 *
 * @param {{tel?:string, entrega?:string, dir?:string, maps?:string, pendiente?:boolean}} d
 * @param {{modo?:'ganar'|'completar', pide?:string[]}} [o]
 * @returns {{ok:boolean, errores:Object<string,string>, primero:string|null, mensaje:string}}
 *   `errores` por campo ('tel', 'entrega', 'dir', 'maps'); `primero` es al que se lleva el foco.
 */
export function validarDatos(d, o = {}) {
  const x = d && typeof d === 'object' ? d : {};
  const modo = o.modo === 'completar' ? 'completar' : 'ganar';
  const pide = new Set(Array.isArray(o.pide) ? o.pide : FALTAS);
  const errores = {};
  const tel = String(x.tel || '').trim();
  const dir = String(x.dir || '').trim();
  const maps = String(x.maps || '').trim();
  const ent = ENTREGAS.includes(x.entrega) ? x.entrega : '';

  if (pide.has('tel')) {
    if (!tel) { if (modo === 'ganar') errores.tel = 'Falta el teléfono del cliente.'; }
    else if (!telValido(tel)) errores.tel = 'Ese teléfono no tiene los 10 dígitos.';
  }
  if (pide.has('entrega') && !ent && modo === 'ganar') errores.entrega = 'Falta decir cómo se entrega.';

  /* La ubicación solo cuando se instala: con paquetería el destino es opcional y con
     recolección no hay nada que pedir. Sin forma de entrega elegida en «completar», la que el
     proyecto ya tenía decide (`o.entregaActual`). */
  const seInstala = (ent || entregaLimpia(o.entregaActual)) === 'instalacion';
  if (maps && (pide.has('pin') || pide.has('dir')) && seInstala) {
    const r = parseGmaps(maps);
    if (!r) errores.maps = 'Ese texto no trae coordenadas: pega el link que sale de «Compartir» en Google Maps (el de WhatsApp sirve).';
  }
  if (modo === 'ganar' && seInstala && !x.pendiente && (pide.has('dir') || pide.has('pin'))) {
    const faltaDir = pide.has('dir') && !dir, faltaLink = pide.has('pin') && !maps;
    if (faltaDir || faltaLink) {
      const que = faltaDir && faltaLink ? 'la dirección y el link de Maps' : faltaDir ? 'la dirección' : 'el link de Maps';
      errores[faltaDir ? 'dir' : 'maps'] = 'Falta ' + que + '. Si todavía no la tienes, marca «Todavía no la tengo».';
    }
  }

  const orden = ['tel', 'entrega', 'dir', 'maps'];
  const primero = orden.find(k => errores[k]) || null;
  if (primero) return { ok: false, errores, primero, mensaje: errores[primero] };

  if (modo === 'completar') {
    const algo = (pide.has('tel') && tel) || (pide.has('entrega') && ent) ||
                 ((pide.has('dir') || ent === 'paqueteria') && dir) || (pide.has('pin') && maps);
    if (!algo) return { ok: false, errores: {}, primero: null, mensaje: 'No escribiste nada. Llena lo que ya tengas y guarda.' };
  }
  return { ok: true, errores: {}, primero: null, mensaje: '' };
}
