/* ============================================================================
   PRECIO — el cálculo de precio que el servidor repite antes de sellar, portado del Apps Script.

   Qué es. Antes de firmar un sello, el notario de puente/hoja-apps-script.gs NO confía en los
   importes del teléfono: limpia la cotización (limpiarCotizacion), recalcula el subtotal con SU
   copia del catálogo (cotSubtotal), se niega si no cuadra con el del teléfono (descuadre), arma la
   huella del trabajo, el total final y los renglones que imprime el PDF (renglonesDe). Este archivo
   es ESE código, línea por línea, para que la función `autorizar` firme exactamente lo mismo que la
   hoja. pruebas/supabase-autorizar.mjs carga el .gs real en una vm y exige que, para miles de
   cotizaciones al azar, cada función de aquí dé lo mismo que la suya, y que la respuesta entera de
   /autorizar sea la misma byte por byte. pruebas/precio-servidor.mjs ya exige que el .gs dé lo mismo
   que el cotizador (js/cotizador/nucleo.js): con las dos, los tres lados cobran igual.

   EL CATÁLOGO DE ABAJO ES EL DE FÁBRICA. Desde el 23-oct-2026 los precios los cambia Dirección
   desde el cotizador: en la hoja viven en la pestaña «Tarifas» y en la nube en la tabla `tarifas`
   (0019), y la función `autorizar` cobra con la de su empresa (`tarifas_de` → mapasDeTarifas). Cada
   función de precio recibe esos mapas como último argumento; sin ellos cobra con el de fábrica, que
   es lo que hacía antes. La prueba de paridad con el .gs lo exige también con una tabla cambiada
   (pruebas/supabase-autorizar.mjs).

   La aritmética es la de JavaScript a propósito (flotante, Math.round mitad hacia +∞, toFixed,
   sort por unidades UTF-16): ver el encabezado de sello.js. No se «mejora» nada aquí: un centavo
   distinto es un PDF que dice «alterado».

   Sin Deno ni Node: funciones puras, se prueban en node y corren en Deno igual.
   ============================================================================ */

import { CAMPOS_PRECIO, dinero2, huellaDe } from './sello.js';

export const MAX_PARTIDAS = 80;
export const CELDA_MAX = 45000;
export const RENGLON_DESC_MAX = 120;

/* ----- El catálogo, copiado del .gs (COT_*) ----- */
export const MATERIALES = Object.freeze({ 'al-paint': 30, 'al-brush': 35, 'acr-vol': 40, 'acr-vinil': 45, 'acero': 55 });
export const COMPLEJIDAD = Object.freeze({ 'recta': 0, 'cursiva': 5, 'compleja': 10 });
export const RECORTES = Object.freeze({ 'sencillo': 20, 'vinil': 25, 'sandwich': 55 });
export const RECORTE_COMP_EXTRA = 5;
export const BASTIDORES = Object.freeze({ 'lamina': 950, 'alucobond': 1500 });
export const M2_MINIMO = 1;
export const IVA = 0.16;
/* Los mapas con los que se cobra: los de fábrica, o los de la tabla de la empresa (mapasDeTarifas). */
export const FABRICA = Object.freeze({ material: MATERIALES, complejidad: COMPLEJIDAD, recorte: RECORTES, bastidor: BASTIDORES, extra: RECORTE_COMP_EXTRA });

const tiene = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const precioDe = (mapa, k) => (tiene(mapa, k) ? mapa[k] : 0);
const factorDe = (it, M) => precioDe(M.material, it.material) + precioDe(M.complejidad, it.comp);

/* cotMapas_() del .gs: la tabla de `tarifas_de` ({filas:[{grupo, clave, precio}]}) sobre el catálogo de fábrica. Un renglón
   que no se entiende se ignora y deja el de fábrica; la caja no se cobra con la tabla (la partida trae su tarifa). Sin tabla,
   el de fábrica: un precio editado que aquí no se conoce da «no cuadra», nunca un sello con otro importe. */
export function mapasDeTarifas(tabla) {
  const m = { material: { ...MATERIALES }, complejidad: { ...COMPLEJIDAD }, recorte: { ...RECORTES }, bastidor: { ...BASTIDORES }, extra: RECORTE_COMP_EXTRA };
  const filas = tabla && Array.isArray(tabla.filas) ? tabla.filas : [];
  for (const f of filas) {
    if (!f || typeof f !== 'object' || typeof f.clave !== 'string') continue;
    const p = Number(f.precio);
    if (f.precio === null || f.precio === '' || typeof f.precio === 'boolean' || !isFinite(p) || p < 0) continue;
    if (f.grupo === 'recorte-extra') { if (f.clave === 'sandwich') m.extra = p; continue; }
    if (f.grupo === 'material' || f.grupo === 'complejidad' || f.grupo === 'recorte' || f.grupo === 'bastidor') m[f.grupo][f.clave] = p;
  }
  return m;
}
const m2Total = (tarifa, m2) => (tarifa || 0) * Math.max(m2 || 0, M2_MINIMO);

/* cotLineTotalCrudo: mismas multiplicaciones, en el mismo orden, con los mismos `|| 0`. */
export function lineaCruda(it, M = FABRICA) {
  if (it.tipo === 'letras') {
    let p = factorDe(it, M) * (it.altura || 0) * (it.n || 0);
    if (!it.luz) p *= 0.8;
    return p;
  }
  if (it.tipo === 'recorte') {
    let rate = precioDe(M.recorte, it.acab);
    if (it.acab === 'sandwich' && it.recComp) rate += M.extra;
    return rate * (it.altura || 0) * (it.n || 0);
  }
  if (it.tipo === 'bastidor') {
    const m2b = (it.ancho || 0) * (it.alto || 0) / 10000;
    if (m2b <= 0) return 0;
    return m2Total(precioDe(M.bastidor, it.bas), m2b);
  }
  if (it.tipo === 'caja') {
    const m2c = (it.ancho || 0) * (it.alto || 0) / 10000;
    if (m2c <= 0) return 0;
    return m2Total(it.tarifa || 0, m2c);
  }
  return (it.pz || 0) * (it.pu || 0);
}
export const linea = (it, M = FABRICA) => Math.round(lineaCruda(it, M) * 100) / 100;
export function subtotal(items, M = FABRICA) {
  let s = 0;
  for (let i = 0; i < items.length; i++) s += linea(items[i], M);
  return s;
}
/* totals(): el IVA es sub*0.16 y el neto su suma, sin redondear. */
export const neto = (sub, iva) => (iva ? sub + sub * IVA : sub);
/* precioFinal() + desgloseFinal(): manda el autorizado cuando lo hay y es distinto del calculado. */
export function totalFinal(subCalc, iva, precioAuth) {
  const n = neto(subCalc, iva);
  const fin = (precioAuth > 0 && Math.abs(precioAuth - n) > 0.01) ? precioAuth : n;
  return +fin.toFixed(2);
}

/* ----- Los renglones del papel (cotPiezas, cotItemPrecio, cotPrecioFinal, cotPreciosCliente, renglonesDe) ----- */
export function piezas(it) {
  if (it.tipo === 'letras' || it.tipo === 'recorte') return it.n || 0;
  if (it.tipo === 'bastidor' || it.tipo === 'caja') return 1;
  return it.pz || 1;
}
export function precioDePartida(it, ia, M = FABRICA) {
  const k = String(it.id);
  return tiene(ia || {}, k) ? ia[k] : linea(it, M);
}
export function precioFinal(subCalc, iva, precioAuth) {
  const n = neto(subCalc, iva);
  return (precioAuth > 0 && Math.abs(precioAuth - n) > 0.01) ? precioAuth : n;
}
export function preciosCliente(items, iva, ia, final, M = FABRICA) {
  const out = {};
  items.forEach(it => { out[it.id] = precioDePartida(it, ia, M); });
  const subBase = items.reduce((s, it) => s + precioDePartida(it, ia, M), 0);
  const netoAj = +((iva ? subBase * 1.16 : subBase)).toFixed(2);
  const n = +Number(final).toFixed(2);
  const subFinal = +(iva ? n / 1.16 : n).toFixed(2);
  const ajuste = +(netoAj - final).toFixed(2);
  if (!(ajuste < -0.01 && subBase > 0.005)) return out;      // hayAumentoAuth()
  const factor = subFinal / subBase;
  const objetivo = Math.round(subFinal * 100);
  const rep = [];
  let suma = 0;
  items.forEach(it => {
    const base = precioDePartida(it, ia, M);
    if (base <= 0.005) return;
    const pz = Math.max(1, piezas(it));
    const exacto = base * factor * 100 / pz;
    const u = Math.floor(exacto);
    rep.push({ it, pz, u, frac: exacto - u, base });
    suma += u * pz;
  });
  let resto = objetivo - suma;
  rep.sort((a, b) => b.frac - a.frac || b.base - a.base);
  let cupo = true;
  while (resto > 0 && cupo) {
    cupo = false;
    for (let i = 0; i < rep.length; i++) {
      const r = rep[i];
      if (r.pz > resto) continue;
      r.u++; resto -= r.pz; cupo = true;
      if (!resto) break;
    }
  }
  if (resto > 0 && rep.length > 1) {
    const porPrecio = rep.slice().sort((a, b) => b.base - a.base);
    buscar:
    for (let q = 0; q < porPrecio.length; q++) {
      const quita = porPrecio[q];
      if (quita.u < 1) continue;
      for (let p = 0; p < porPrecio.length; p++) {
        const pone = porPrecio[p];
        if (pone === quita) continue;
        const falta = resto + quita.pz;
        if (falta % pone.pz) continue;
        quita.u--; pone.u += falta / pone.pz; resto = 0;
        break buscar;
      }
    }
  }
  rep.forEach(r => { out[r.it.id] = +(r.u * r.pz / 100).toFixed(2); });
  if (resto !== 0 && rep.length) {
    const dest = rep.reduce((a, b) => (b.base > a.base ? b : a));
    out[dest.it.id] = +(out[dest.it.id] + resto / 100).toFixed(2);
  }
  return out;
}
export function renglonesDe(items, iva, ia, final, M = FABRICA) {
  const pc = preciosCliente(items, iva, ia, final, M);
  return JSON.stringify(items.map(it => {
    const c = Number(piezas(it));
    return [String(it.desc == null ? '' : it.desc).slice(0, RENGLON_DESC_MAX), isFinite(c) ? c : 0, +Number(pc[it.id]).toFixed(2)];
  }));
}
/* renglonesDeTexto(): de la celda a lo que se enseña (lo que viaja en el sello de la respuesta). */
export function renglonesDeTexto(s) {
  if (!s) return null;
  let a;
  try { a = JSON.parse(String(s)); } catch (_) { return null; }
  if (Object.prototype.toString.call(a) !== '[object Array]') return null;
  return a.map(r => ({ descripcion: String(r && r[0] != null ? r[0] : ''), cantidad: Number(r && r[1]) || 0, importe: Number(r && r[2]) || 0 }));
}

/* ----- Lo que llega del teléfono, limpio (limpiarCotizacion, folioValido, limpiarItemsAuth) ----- */
const CAMPOS_NUM = { altura: 1, n: 1, ancho: 1, alto: 1, tarifa: 1, pz: 1, pu: 1 };
export function limpiarCotizacion(c) {
  if (!c || typeof c !== 'object') return { error: 'Falta la cotización.' };
  const items = Object.prototype.toString.call(c.items) === '[object Array]' ? c.items : null;
  if (!items || !items.length) return { error: 'La cotización no trae partidas.' };
  if (items.length > MAX_PARTIDAS) return { error: 'Son demasiadas partidas para una cotización.' };
  const limpias = [], ids = {};
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== 'object') return { error: 'Una partida no se entiende.' };
    const id = it.id;
    if ((typeof id !== 'number' && typeof id !== 'string') || String(id).length > 40) return { error: 'Una partida no trae identificador.' };
    if (ids[String(id)]) return { error: 'Dos partidas con el mismo identificador.' };
    ids[String(id)] = true;
    const o = { id };
    for (let j = 0; j < CAMPOS_PRECIO.length; j++) {
      const k = CAMPOS_PRECIO[j];
      if (!tiene(it, k)) continue;
      const v = it[k];
      if (v !== null && typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') return { error: 'La partida ' + id + ' trae un dato raro en «' + k + '».' };
      if (typeof v === 'number' && !isFinite(v)) return { error: 'La partida ' + id + ' trae un número inválido en «' + k + '».' };
      if (typeof v === 'string' && v.length > 60) return { error: 'La partida ' + id + ' trae un texto demasiado largo en «' + k + '».' };
      // Medidas y precios: números ≥ 0 o vacíos, igual que la hoja (COT_CAMPOS_NUM). Un «abc» volvía NaN el subtotal y pasaba el cuadre.
      if (CAMPOS_NUM[k] && v !== null && v !== '' && typeof v !== 'boolean') {
        const x = Number(v);
        if (!isFinite(x) || x < 0) return { error: 'La partida ' + id + ' trae un número inválido en «' + k + '».' };
      }
      o[k] = v;
    }
    o.desc = String(it.desc == null ? '' : it.desc).slice(0, 300);
    limpias.push(o);
  }
  const out = {
    proyecto: String(c.proyecto == null ? '' : c.proyecto).trim().slice(0, 140),
    cliente: String(c.cliente == null ? '' : c.cliente).trim().slice(0, 140),
    iva: !!c.iva,
    subtotal: Number(c.subtotal),
    items: limpias,
  };
  if (huellaDe(out.iva, out.items).length > CELDA_MAX || JSON.stringify(out).length > CELDA_MAX) {
    return { error: 'La cotización es demasiado grande para guardarla en la hoja. Divídela en dos cotizaciones.' };
  }
  return out;
}
export const folioValido = f => typeof f === 'string' && /^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/.test(f);
export function limpiarItemsAuth(ia, items) {
  const ids = {};
  items.forEach(it => { ids[String(it.id)] = true; });
  const out = {};
  for (const k in (ia || {})) {
    if (!tiene(ia, k)) continue;
    if (!ids[k]) return { error: 'Un ajuste por partida apunta a una partida que no existe.' };
    const v = Number(ia[k]);
    if (!isFinite(v) || v < 0 || v > 1e8) return { error: 'Un ajuste por partida no es un importe válido.' };
    out[k] = v;
  }
  return { valor: out };
}
/* descuadre(): el teléfono y la hoja no cobran lo mismo. */
export function descuadre(sub, delTelefono) {
  return { ok: false, codigo: 'CATALOGO_DESINCRONIZADO',
    mensaje: 'El precio de este teléfono (' + dinero2(delTelefono) + ') no coincide con el catálogo de la hoja (' +
             dinero2(sub) + '). Los precios de la hoja cambiaron o la app está vieja: el cotizador ya trajo los de la hoja, revisa la cotización y vuelve a mandarla.',
    subtotal_hoja: +dinero2(sub) };
}
