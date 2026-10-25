/* ============================================================================
   LOS GASTOS — lo que sale, al lado de lo que entra.

   Hasta octubre de 2026 Control contestaba «cuánto vendimos» y nadie contestaba «cuánto se
   fue»: el acrílico, la renta, la gasolina, la nómina del sábado vivían en tickets sueltos y en
   la memoria de quien pagó. El dueño decidió dónde viven: en la HOJA de finanzas, en una
   pestaña nueva «Gastos», junto a Ventas, porque la hoja es el libro mayor del dinero (§4.0) y
   un libro de lo que sale fuera del libro mayor es otra verdad que se separa en semanas. La
   plataforma los CAPTURA y los manda por el puente, igual que las ventas, y los vuelve a bajar
   enteros para sumarlos.

   ── Lo que hay aquí ─────────────────────────────────────────────────────────
   Dos mitades, como `ventas.js` y `proyectos.js` juntos en uno:
     · lo PURO —la forma de un gasto, la lectura de una fila de la hoja, las sumas del mes y por
       categoría, el periodo, el CSV, qué espera en la bandeja y qué se barre al bajar—, que no
       toca la base ni la red ni el reloj (`hoy`, `ahora` e `id` entran de fuera) y que
       pruebas/gastos.mjs corre entero en node;
     · y la captura —`registrar`, `anular`, `reencolarSueltos`— que escribe en la base y encola
       en `sync.js`, como cualquier otra mutación de la capa de datos.

   ── Un gasto no se corrige: se anula ───────────────────────────────────────
   Es dinero que ya salió y se escribe una vez. Si estuvo mal —el monto, la categoría, el día—
   se ANULA y se captura otra vez. No hay «editar» por la misma razón que el libro del almacén
   no se corrige: dos teléfonos editando el mismo renglón de dinero sin señal y una hoja que
   tiene que decidir quién gana es exactamente el problema que no hace falta tener. Anular no
   borra: el renglón se queda en la hoja con «Anulado: Sí», quién y cuándo, y deja de sumar.
   Borrar un gasto es borrarle a alguien la constancia de que lo pagó.

   ── Nunca se pierde uno capturado ───────────────────────────────────────────
   Se escribe primero en este teléfono (almacén `gastos`) y después se encola: sin señal se
   queda en la bandeja y sale solo cuando vuelva, como todo. Tres cuidados más, cada uno con su
   porqué en su función: lo que espera en la bandeja no se pisa con lo que baja (`idsEnLaBandeja`);
   lo que nunca subió no se barre aunque la hoja no lo traiga (`porBarrer`); y un gasto de aquí
   que se quedó sin operación en la bandeja —un respaldo restaurado, una bandeja borrada— se
   vuelve a encolar solo (`sueltos`). La hoja contesta «ya estaba» a un id repetido, así que
   mandarlo dos veces no lo duplica.

   ── Con la base mandando ────────────────────────────────────────────────────
   (Paso 3 de «la base manda», docs/BASE-MANDA.md.) La captura es la misma y la bandeja también; lo que
   cambia es a dónde va: el relevo de la base (js/datos/supa-relevo.js) los sube con `gasto_registrar` y
   `gasto_anular` (0025_gastos.sql), que siguen la regla de la hoja, y los baja de la tabla `gastos`
   (`gastoDeBase`). `en_hoja` sigue siendo la marca de «ya está en la fuente», sea la hoja o la base.

   ── Quién ───────────────────────────────────────────────────────────────────
   Los ven y los capturan los roles que ven el dinero —dirección y pagos—; fabricación no tiene
   Control y la hoja tampoco le baja los gastos ni le deja escribirlos (`GASTOS_ROLES` en el .gs).
   ============================================================================ */

import * as DB from './db.js';
import * as Prefs from './prefs.js';
import * as Sync from './sync.js';
import { esISO, partesISO, diasDelMes, hoyISO, masMeses } from '../nucleo/fechas.js';
/* Las cinco cuentas son las de `puente.js`, la única lista: el desplegable del formulario, la
   validación y el .gs dicen lo mismo (pruebas/replicas.mjs). El puente, a su vez, usa lo puro de
   este archivo, pero por import dinámico y dentro de funciones: así no hay un ciclo estático entre
   los dos. */
import { CUENTAS } from './puente.js';
import { csvCampo, etiquetaMes, mesDe } from './ventas.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

/* ============================================================================
   EL VOCABULARIO. Las categorías, EN EL ORDEN DEL DESPLEGABLE de la columna «Categoría» de la
   pestaña Gastos. Son las de una fábrica de letreros: lo que se compra para fabricar (lámina,
   acrílico, LED, fuentes), quien lo hace cuando no es nómina fija, el local y sus servicios, la
   herramienta que se compra o se repara, la camioneta, los anuncios y lo que se le paga a la
   gente. «Otros» va al final y es donde cae lo que no se reconoce: una categoría tecleada a mano
   en la hoja que no está en la lista no se pierde, suma ahí y se ve.
   El .gs tiene la misma lista (`GASTO_CATEGORIAS`) —no se importa, se pega en un editor— y
   pruebas/gastos.mjs compara las dos letra por letra.
   ============================================================================ */
export const CATEGORIAS = ['Material', 'Mano de obra', 'Renta y servicios', 'Herramienta',
                           'Transporte y gasolina', 'Publicidad', 'Comisiones y nómina', 'Otros'];
export const OTROS = 'Otros';
/* Un ícono por categoría, del juego que ya trae index.html. Solo adorna: el nombre va siempre
   escrito al lado. */
export const ICONO_CATEGORIA = {
  'Material': 'i-material', 'Mano de obra': 'i-taller', 'Renta y servicios': 'i-rayo',
  'Herramienta': 'i-corte', 'Transporte y gasolina': 'i-camion', 'Publicidad': 'i-publicar',
  'Comisiones y nómina': 'i-venta', 'Otros': 'i-puntos',
};

/* Los topes, los mismos que pone la hoja (GASTO_* en el .gs). Un concepto de doscientos
   caracteres ya es una nota; un monto de diez millones en un taller de letreros es un dedo que
   se quedó pegado en el cero. */
export const CONCEPTO_MAX = 200;
export const FOLIO_MAX = 40;
export const MONTO_MAX = 10000000;

const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const red2 = v => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const texto = v => String(v == null ? '' : v);
const plano = s => texto(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** La categoría como se escribe en la lista: «material», «MATERIAL» o «Transporte y Gasolina»
 *  son la suya; lo que no es ninguna es «Otros». PURA. */
export function categoriaDe(v) {
  const p = plano(v);
  if (!p) return OTROS;
  return CATEGORIAS.find(c => plano(c) === p) || OTROS;
}

/** La fecha de una celda en 'YYYY-MM-DD', o '' si no se entiende. La hoja la manda en ISO; lo
 *  tecleado a mano puede llegar «23/10/2026». Nunca con `new Date(texto)`, que lee el ISO como
 *  UTC y en México da el día anterior. PURA. */
export function fechaDeCelda(v) {
  const s = texto(v).trim();
  let iso = '';
  if (s.length === 10 || /^\d{4}-\d{2}-\d{2}T/.test(s)) iso = s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) iso = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return diaDeVerdad(iso) ? iso : '';
}
/* `esISO` mira la forma; un 31 de febrero tiene la forma y no existe. Tecleado a mano en la hoja
   pasa, y un gasto en un día que no existe caería en un mes a medias. */
const diaDeVerdad = iso => {
  const p = partesISO(iso);
  return !!p && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= diasDelMes(p.a, p.m);
};

/** El monto: un número, o lo que se tecleó («$1,234.50», «1234.5»). Negativo, vacío o basura
 *  son 0 —un gasto negativo es un ingreso disfrazado y no se suma aquí—, redondeado a centavos.
 *  La coma es la de los miles, como en `ventas.montoDeTexto`. PURA. */
export function montoDe(v) {
  if (typeof v === 'number') return isFinite(v) && v > 0 ? red2(v) : 0;
  const s = texto(v);
  if (/^\s*[-−]/.test(s)) return 0;
  const limpio = s.replace(/[^\d.]/g, '');
  const i = limpio.indexOf('.');
  const t = i < 0 ? limpio : limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/\./g, '');
  const n = parseFloat(t);
  return isFinite(n) && n > 0 ? red2(n) : 0;
}

/** «Sí», true, «TRUE», «x» o «anulado» son sí; lo demás, no. Es lo que alguien teclea en la
 *  columna «Anulado» de la hoja. PURA. */
export function siNo(v) {
  if (v === true) return true;
  const p = plano(v);
  return p === 'si' || p === 'true' || p === 'x' || p === 'anulado' || p === '1';
}

const ms = v => { const n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : null; };

/**
 * Una fila de la pestaña Gastos (lo que contesta /jalar_gastos) en la forma de este teléfono,
 * o null si no es un gasto (sin id: un renglón vacío o una nota).
 *
 * La hoja ya normaliza lo que escribe el puente; esto es para lo que se teclea a mano allá: la
 * categoría que no está en la lista cae en «Otros» —y no desaparece—, un monto escrito como
 * texto se lee, una fecha «23/10/2026» también. La cuenta se queda como venga, aunque no sea una
 * de las cinco: es información de quien la escribió, y tirarla sería peor que enseñarla. PURA.
 */
export function gastoDeHoja(fila) {
  if (!fila || typeof fila !== 'object') return null;
  const id = texto(fila.id).trim();
  if (!id) return null;
  const anulado = siNo(fila.anulado);
  return {
    id,
    fecha: fechaDeCelda(fila.fecha),
    concepto: texto(fila.concepto).trim().slice(0, CONCEPTO_MAX),
    categoria: categoriaDe(fila.categoria),
    monto: montoDe(fila.monto),
    cuenta: texto(fila.cuenta).trim(),
    folio: texto(fila.folio).trim().slice(0, FOLIO_MAX),
    registro_por: texto(fila.registro_por).trim(),
    registrado_en: ms(fila.registrado_en),
    anulado,
    anulo: anulado ? texto(fila.anulo).trim() : '',
    anulado_en: anulado ? ms(fila.anulado_en) : null,
  };
}

/**
 * Un renglón de la tabla `gastos` de la base (0020) en la forma de este teléfono, o null. Es lo que baja en lugar de la pestaña con la
 * base mandando (paso 3 de «la base manda», js/datos/supa-relevo.js). La base guarda lo mismo que la hoja —la copia la llenó con estas
 * mismas reglas, y `gasto_registrar` (0025) valida como `gastoValidar_`—, así que pasa por `gastoDeHoja`; lo único distinto es que los
 * instantes llegan como texto ISO (timestamptz) y no en milisegundos. PURA.
 */
export function gastoDeBase(fila) {
  if (!fila || typeof fila !== 'object') return null;
  const ms = v => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Date.parse(String(v));
    return isFinite(n) && n > 0 ? n : null;
  };
  return gastoDeHoja({ ...fila, registrado_en: ms(fila.registrado_en), anulado_en: ms(fila.anulado_en) });
}

/**
 * Lo que no puede entrar, dicho para quien lo tecleó: '' si se puede guardar, o la frase. Las
 * mismas reglas que la hoja vuelve a aplicar (`gastoValidar_` en el .gs): la de aquí es para
 * decirlo junto al campo antes de guardar; la de allá, para que un teléfono viejo o tramposo no
 * meta basura en el libro. PURA.
 * @param {{fecha?:string, concepto?:string, categoria?:string, monto?:*, cuenta?:string, folio?:string}} d
 * @returns {{campo:string, mensaje:string}|null}
 */
export function validar(d) {
  const x = d || {};
  if (!diaDeVerdad(texto(x.fecha))) return { campo: 'fecha', mensaje: 'Falta el día en que se pagó.' };
  const c = texto(x.concepto).trim();
  if (!c) return { campo: 'concepto', mensaje: 'Escribe en qué se gastó: «Lámina de acrílico 3 mm», «Gasolina de la camioneta»…' };
  if (c.length > CONCEPTO_MAX) return { campo: 'concepto', mensaje: 'El concepto es muy largo: hasta ' + CONCEPTO_MAX + ' letras.' };
  if (!CATEGORIAS.includes(x.categoria)) return { campo: 'categoria', mensaje: 'Elige una categoría de la lista.' };
  const m = typeof x.monto === 'number' ? x.monto : montoDe(x.monto);
  if (!(m > 0)) return { campo: 'monto', mensaje: 'Escribe cuánto se pagó, en pesos.' };
  if (m > MONTO_MAX) return { campo: 'monto', mensaje: 'Ese monto es de más de diez millones: revisa los ceros.' };
  if (x.cuenta && !CUENTAS.includes(x.cuenta)) return { campo: 'cuenta', mensaje: 'Esa cuenta no es una de las de la hoja.' };
  if (texto(x.folio).trim().length > FOLIO_MAX) return { campo: 'folio', mensaje: 'El folio es muy largo.' };
  return null;
}

/**
 * Un gasto nuevo, listo para guardar. `o` trae lo que no es puro: el id, el instante y el sello
 * de quien lo captura. Supone `validar(datos) === null`. PURA.
 * @param {Object} datos lo del formulario
 * @param {{id:string, ahora:number, sello:string}} o
 */
export function armar(datos, o) {
  const d = datos || {};
  return {
    id: String(o.id),
    fecha: texto(d.fecha),
    concepto: texto(d.concepto).trim().slice(0, CONCEPTO_MAX),
    categoria: categoriaDe(d.categoria),
    monto: typeof d.monto === 'number' ? red2(d.monto) : montoDe(d.monto),
    cuenta: CUENTAS.includes(d.cuenta) ? d.cuenta : '',
    folio: texto(d.folio).trim().slice(0, FOLIO_MAX),
    registro_por: texto(o.sello),
    registrado_en: Number(o.ahora) || 0,
    anulado: false, anulo: '', anulado_en: null,
    /* Las dos marcas de ESTE teléfono, que no viajan: si la hoja ya lo tiene (`en_hoja`) y desde
       cuándo (`subido_en`). Ver `porBarrer` y `sueltos`. */
    en_hoja: false, subido_en: 0,
  };
}

/* ============================================================================
   LAS CUENTAS
   ============================================================================ */

const vivo = g => !!g && !g.anulado;

/**
 * Lo gastado este mes y el anterior, en total y por categoría, con lo anulado aparte. Un gasto
 * cuenta en el mes de su FECHA —el día en que se pagó—, no en el de su captura: la gasolina del
 * 31 que se apuntó el 2 es de ese mes. Lo anulado no suma; se cuenta para poder decir que existe.
 * PURA.
 * @param {Object[]} gastos
 * @param {{hoy?:string}} [o]
 */
export function resumen(gastos, o = {}) {
  const hoy = esISO(o.hoy) ? o.hoy : hoyISO();
  const ym = hoy.slice(0, 7);
  const ymAnt = mesDe(masMeses(ym + '-01', -1));
  const G = (Array.isArray(gastos) ? gastos : []).filter(Boolean);
  const delMes = k => G.filter(g => vivo(g) && mesDe(g.fecha) === k);
  const suma = l => red2(l.reduce((s, g) => s + num(g.monto), 0));
  const mes = delMes(ym), ant = delMes(ymAnt);
  const porCat = CATEGORIAS.map(categoria => {
    const a = mes.filter(g => categoriaDe(g.categoria) === categoria);
    const b = ant.filter(g => categoriaDe(g.categoria) === categoria);
    return { categoria, total: suma(a), n: a.length, totalAnt: suma(b), nAnt: b.length };
  });
  const tMes = suma(mes), tAnt = suma(ant);
  return {
    mes: { ym, etiqueta: etiquetaMes(ym), total: tMes, n: mes.length },
    anterior: { ym: ymAnt, etiqueta: etiquetaMes(ymAnt), total: tAnt, n: ant.length },
    /* null cuando el mes anterior fue cero, como la variación de ventas: «+∞ %» no dice nada. */
    variacion: tAnt > 0 ? Math.round((tMes - tAnt) / tAnt * 100) : null,
    porCategoria: porCat,
    anulados: G.filter(g => g.anulado && mesDe(g.fecha) === ym).length,
    sinFecha: G.filter(g => vivo(g) && !esISO(g.fecha)).length,
  };
}

/** Lo vendido menos lo gastado, a centavos. Es la utilidad APROXIMADA: lo vendido es lo firmado
 *  por la fecha de su anticipo (no lo cobrado) y los gastos son los que alguien capturó. Por eso
 *  la pantalla la llama «aproximada» y dice de dónde sale. PURA. */
export function utilidad(vendido, gastado) { return red2(num(vendido) - num(gastado)); }

/**
 * Los gastos de un periodo —'mes', '3m', '12m' o 'todo', los mismos de la lista de ventas— que
 * coinciden con lo buscado, del más reciente al más viejo (por fecha y, el mismo día, por
 * captura). Los anulados se quedan en la lista, marcados: desaparecerlos haría creer que nunca
 * se capturaron. PURA.
 */
export function delPeriodo(gastos, periodo, hoy, busca) {
  const h = esISO(hoy) ? hoy : hoyISO();
  let desde = null;
  if (periodo === 'mes') desde = h.slice(0, 7) + '-01';
  else if (periodo === '3m') desde = masMeses(h.slice(0, 7) + '-01', -2);
  else if (periodo === '12m') desde = masMeses(h.slice(0, 7) + '-01', -11);
  const q = plano(busca);
  return (Array.isArray(gastos) ? gastos : []).filter(g => {
    if (!g) return false;
    /* Uno sin fecha (tecleado así en la hoja) solo sale en «Todo»: no cae en ningún mes. */
    if (desde && !(esISO(g.fecha) && g.fecha >= desde)) return false;
    if (!q) return true;
    return plano([g.concepto, g.categoria, g.cuenta, g.folio, g.registro_por].join(' ')).includes(q);
  }).sort((a, b) => (texto(b.fecha) > texto(a.fecha) ? 1 : texto(b.fecha) < texto(a.fecha) ? -1 : 0) ||
                    (num(b.registrado_en) - num(a.registrado_en)) || texto(a.id).localeCompare(texto(b.id)));
}

/* ============================================================================
   LA BANDEJA — qué espera, qué se barre, qué se vuelve a encolar
   ============================================================================ */

/**
 * De la bandeja de `sync` (el almacén 'pendientes' tal cual), los gastos que tienen una operación
 * esperando, con su estado: 'pendiente' (sale en el siguiente bombeo), 'sin_destino' (la hoja
 * todavía no tiene la pestaña; vuelve sola) o 'rechazada' (la hoja dijo que no, con su razón).
 * Si un gasto tiene varias —el alta y su anulación—, manda la peor: un rechazo se tiene que ver.
 * PURA.
 * @returns {Map<string,{estado:string, error:string}>}
 */
export function idsEnLaBandeja(ops) {
  const PESO = { pendiente: 1, sin_destino: 2, rechazada: 3, conflicto: 3 };
  const m = new Map();
  for (const o of (Array.isArray(ops) ? ops : [])) {
    if (!o || o.almacen !== 'gastos' || String(o.id || '').charAt(0) === '_') continue;
    const id = String(o.registro_id || (o.datos && o.datos.id) || '');
    if (!id) continue;
    const estado = o.estado || 'pendiente';
    const antes = m.get(id);
    if (!antes || (PESO[estado] || 1) > (PESO[antes.estado] || 1)) m.set(id, { estado, error: String(o.ultimo_error || '') });
  }
  return m;
}

/**
 * Qué gastos de este teléfono hay que borrar después de una bajada completa: los que la hoja
 * YA tenía (`en_hoja`) y ya no trae —alguien borró la fila allá; la hoja es la dueña—. Nunca:
 *   · uno que nunca llegó a la hoja (sin `en_hoja`): es lo único que hay de él;
 *   · uno con una operación en la bandeja: todavía no termina de llegar;
 *   · uno que subió DESPUÉS de que se leyó la pestaña (`subido_en >= leidoEn`): la lectura no lo
 *     podía traer. Sin esto, un gasto que subía mientras bajaba la hoja desaparecía de la pantalla
 *     hasta la siguiente bajada.
 * PURA.
 * @param {Object[]} locales los gastos de este teléfono
 * @param {{ids:Set<string>|string[], leidoEn:number}} vistos lo que trajo la hoja y cuándo se le pidió
 * @param {Map<string,*>} bandeja `idsEnLaBandeja(...)`
 * @returns {string[]}
 */
export function porBarrer(locales, vistos, bandeja) {
  const ids = vistos && vistos.ids instanceof Set ? vistos.ids : new Set((vistos && vistos.ids) || []);
  const leido = Number(vistos && vistos.leidoEn) || 0;
  const b = bandeja instanceof Map ? bandeja : new Map();
  return (Array.isArray(locales) ? locales : [])
    .filter(g => g && g.id && g.en_hoja === true && !ids.has(String(g.id)) && !b.has(String(g.id)) &&
                 !(Number(g.subido_en) >= leido && leido > 0))
    .map(g => String(g.id));
}

/**
 * Los gastos de este teléfono que no están en la hoja y tampoco tienen una operación en la
 * bandeja, en ningún estado. No debería haber ninguno; los hay si se restauró un respaldo (la
 * bandeja no entra al respaldo, a propósito) o si alguien vació la bandeja. Sin esto se quedaban
 * «por mandar» para siempre. PURA.
 */
export function sueltos(gastos, bandeja) {
  const b = bandeja instanceof Map ? bandeja : new Map();
  return (Array.isArray(gastos) ? gastos : []).filter(g => g && g.id && g.en_hoja !== true && !b.has(String(g.id)));
}

/** Lo que la pantalla dice de cada gasto: 'hoja' (ya está allá), 'pendiente' (esperando señal o
 *  turno), 'sin_destino' (la hoja todavía no tiene la pestaña), 'rechazada' (la hoja dijo que no:
 *  `error` dice por qué) o 'local' (no está allá ni en la bandeja: lo arregla `reencolarSueltos`).
 *  PURA. */
export function estadoDeEnvio(g, bandeja) {
  const x = bandeja instanceof Map ? bandeja.get(String(g && g.id)) : null;
  if (x) return { estado: x.estado === 'conflicto' ? 'rechazada' : x.estado, error: x.error || '' };
  return { estado: g && g.en_hoja ? 'hoja' : 'local', error: '' };
}

/* ============================================================================
   EL CSV — el de ventas tiene el suyo; éste, el de lo que salió. Solo lo baja la dirección.
   ============================================================================ */
export const COLUMNAS_CSV = ['Fecha', 'Concepto', 'Categoría', 'Monto', 'Cuenta', 'Folio del proyecto',
  'Registró', 'Registrado el', 'Anulado', 'Anuló', 'Anulado el', 'Id'];

const cuandoTexto = v => {
  const n = Number(v);
  if (!(n > 0)) return '';
  const d = new Date(n), p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};

/** Los gastos, una fila cada uno, con la regla de CSV de ventas (`csvCampo`: BOM, comillas y el
 *  apóstrofo contra fórmulas). Los anulados van también, marcados, para que el archivo cuadre
 *  renglón por renglón con la pestaña. PURA (salvo la hora local de los sellos). */
export function csv(gastos) {
  const filas = (Array.isArray(gastos) ? gastos : []).filter(Boolean).map(g => [
    g.fecha || '', String(g.concepto || '').replace(/\s*\n\s*/g, ' '), categoriaDe(g.categoria),
    num(g.monto).toFixed(2), g.cuenta || '', g.folio || '', g.registro_por || '', cuandoTexto(g.registrado_en),
    g.anulado ? 'Sí' : '', g.anulado ? (g.anulo || '') : '', g.anulado ? cuandoTexto(g.anulado_en) : '', g.id,
  ].map(csvCampo).join(','));
  return '﻿' + [COLUMNAS_CSV.map(csvCampo).join(',')].concat(filas).join('\r\n');
}

/* ============================================================================
   LA CAPTURA — base y bandeja. Lo único de este archivo que no es puro.
   ============================================================================ */

/* La bitácora anota después de escribir, por import dinámico y dentro de un try, como en
   proyectos, agenda y material: si falla, el gasto ya está guardado. */
async function anotarEnBitacora(hecho) {
  try { const B = await import('./bitacora.js'); await B.anotar(hecho); } catch (_) { /* la bitácora nunca frena */ }
}

/** Los gastos de este teléfono —los capturados aquí y los que bajaron de la hoja—. Lectura:
 *  nunca lanza. Fabricación no los lee: no ve dinero. */
export async function listar() {
  if (!Prefs.veDinero()) return [];
  return DB.listar('gastos');
}

/** `idsEnLaBandeja` sobre la bandeja de verdad. */
export async function bandeja() {
  return idsEnLaBandeja(await DB.listar('pendientes'));
}

/**
 * Captura un gasto: lo guarda aquí y lo encola para la hoja. Con o sin señal: lo que contesta
 * es si quedó guardado en ESTE teléfono, que es lo que no se puede perder. El envío lo dice la
 * pantalla con el estado de la bandeja.
 * @returns {Promise<Resultado>} valor = el gasto guardado
 */
export async function registrar(datos) {
  if (!Prefs.veDinero()) return mal('ROL_SIN_PERMISO', 'Los gastos son dinero: los capturan dirección y pagos.');
  const malo = validar(datos);
  if (malo) return { ok: false, codigo: 'DATO_INVALIDO', mensaje: malo.mensaje, campo: malo.campo };
  const g = armar(datos, { id: DB.nuevoId('gas'), ahora: Date.now(), sello: Prefs.sello() });
  const r = await DB.poner('gastos', g);
  if (!r.ok) return r;
  /* Lo que viaja es el gasto sin las dos marcas de este teléfono. */
  const { en_hoja, subido_en, ...paraLaHoja } = r.valor;
  void en_hoja; void subido_en;
  await Sync.encolar({ tipo: 'crear', almacen: 'gastos', registro_id: g.id, datos: paraLaHoja });
  await anotarEnBitacora({ accion: 'registro', entidad: 'gasto', entidad_id: g.id,
    titulo: 'Gasto de ' + dinero(g.monto) + ': ' + g.concepto,
    detalle: g.categoria + (g.cuenta ? ' · ' + g.cuenta : '') + (g.folio ? ' · ' + g.folio : '') + ' · ' + g.fecha });
  return ok(r.valor);
}

/**
 * Anula un gasto (no lo borra): deja de sumar, y en la hoja queda con «Anulado: Sí», quién y
 * cuándo. Uno ya anulado contesta ok sin volver a encolar nada.
 * @returns {Promise<Resultado>} valor = el gasto como quedó
 */
export async function anular(id) {
  if (!Prefs.veDinero()) return mal('ROL_SIN_PERMISO', 'Los gastos son dinero: los anulan dirección y pagos.');
  const g = await DB.obtener('gastos', String(id || ''));
  if (!g) return mal('NO_ENCONTRADO', 'Ese gasto ya no está en este dispositivo.');
  if (g.anulado) return ok(g);
  const nuevo = { ...g, anulado: true, anulo: Prefs.sello(), anulado_en: Date.now() };
  const r = await DB.poner('gastos', nuevo);
  if (!r.ok) return r;
  const { en_hoja, subido_en, ...paraLaHoja } = r.valor;
  void en_hoja; void subido_en;
  await Sync.encolar({ tipo: 'actualizar', almacen: 'gastos', registro_id: g.id, datos: paraLaHoja,
                       campos: ['anulado', 'anulo', 'anulado_en'] });
  await anotarEnBitacora({ accion: 'anulo', entidad: 'gasto', entidad_id: g.id,
    titulo: 'Se anuló el gasto de ' + dinero(g.monto) + ': ' + g.concepto, detalle: g.categoria + ' · ' + g.fecha,
    antes: { anulado: false }, despues: { anulado: true } });
  return ok(r.valor);
}

/**
 * Vuelve a encolar los gastos que se quedaron sin operación (`sueltos`). Lo llama Control al
 * leer. Cada uno sale como lo que es hoy —con su anulación, si la tiene—; la hoja contesta «ya
 * estaba» si en realidad sí había llegado.
 * @returns {Promise<number>} cuántos
 */
export async function reencolarSueltos() {
  try {
    if (!Prefs.veDinero()) return 0;
    const lista = sueltos(await DB.listar('gastos'), await bandeja());
    for (const g of lista) {
      const { en_hoja, subido_en, ...paraLaHoja } = g;
      void en_hoja; void subido_en;
      await Sync.encolar({ tipo: 'crear', almacen: 'gastos', registro_id: g.id, datos: paraLaHoja });
    }
    return lista.length;
  } catch (_) { return 0; }
}

const dinero = n => '$' + num(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
