/* ============================================================================
   AUTORIZAR — lo que decide /autorizar, portado de rutaAutorizar_ del Apps Script.

   Dirección autoriza el precio de una cotización y sale un SELLO: el registro firmado que va impreso
   en el PDF (código XXXX-XXXX-XXXX y QR) y que /verificar vuelve a calcular. Aquí está la parte PURA
   de la ruta del .gs (puente/hoja-apps-script.gs, rutaAutorizar_), en el mismo orden y con los mismos
   mensajes:
     1. el folio con su aparato (folioValido);
     2. la cotización limpia (limpiarCotizacion) y el subtotal RECALCULADO con el catálogo del servidor;
        si no cuadra con el del teléfono por más de un centavo, CATALOGO_DESINCRONIZADO;
     3. nada en $0; el precio autorizado entre 0 y 1e9; los ajustes por partida válidos y de partidas
        que existen;
     4. el registro que se firma: huella, subCalc, precioAuth, itemsAuth (canon), total final,
        proyecto, correo de quien autoriza, y los renglones del papel; y el «Ajuste %» informativo.
   La hora (`ts`), la firma y el candado del notario los pone quien llama (supabase/functions/autorizar):
   la firma con _shared/sello.js en la codificación REAL de Apps Script (ascii-?), y el candado y la
   escritura, la RPC `registrar_autorizacion` (0008), que es la única que escribe.

   Las respuestas de error son los MISMOS objetos que contestaba el .gs ({ ok:false, codigo, mensaje },
   sin `definitivo`): la app ya los sabe pintar. pruebas/supabase-autorizar.mjs lo exige byte por byte
   contra el .gs real cargado en una vm.

   Lo que NO es igual al .gs, a propósito:
     · quién autoriza lo decide la sesión (auth.js + mi_acceso: Dirección activa), no el token del
       teléfono; el mensaje de «solo Dirección» es el de auth.js;
     · sin la clave (SELLO_AUTORIZACION) NO se firma: el .gs inventaba una nueva y firmaba todo lo que
       seguía con ella (secretoDelSello_(true)); aquí es un 503 de configuración;
     · un texto que una columna `text` no guarda tal cual (la mitad de un emoji que dejó un slice) no se
       firma: se contesta DATO_INVALIDO (el .gs lo firmaba con un «?», y el PDF ya no verificaría desde
       la base). Es un caso que la prueba documenta.
   ============================================================================ */

import { dinero2, huellaDe, itemsAuthCanon, itemsAuthDeCanon } from './sello.js';
import { FABRICA, descuadre, folioValido, limpiarCotizacion, limpiarItemsAuth, neto, precioFinal, renglonesDe, renglonesDeTexto, subtotal, totalFinal } from './precio.js';

const invalido = mensaje => ({ ok: false, codigo: 'DATO_INVALIDO', mensaje });

/**
 * La decisión de /autorizar antes de firmar. `correo` es el de quien autoriza (ya verificado como Dirección).
 * Devuelve { ok:false, … } (la respuesta del .gs, tal cual) o
 *   { ok:true, r, cotizacion, cliente, pct, nota } con `r` = el registro que se firma, SIN `ts` (lo pone quien firma).
 */
export function prepararAutorizacion(cuerpo, correo, mapas = FABRICA) {
  const folio = String((cuerpo && cuerpo.folio) || '');
  if (!folioValido(folio)) return invalido('El folio no se entiende.');
  const c = limpiarCotizacion(cuerpo.cotizacion);
  if (c.error) return invalido(c.error);
  const subCalc = subtotal(c.items, mapas);
  if (!isFinite(subCalc) || !isFinite(c.subtotal) || Math.abs(subCalc - c.subtotal) > 0.01) return descuadre(subCalc, c.subtotal);
  if (!(subCalc > 0)) return invalido('Una cotización en $0 no se autoriza.');
  const precioAuth = Number(cuerpo.precioAuth || 0);
  if (!isFinite(precioAuth) || precioAuth < 0 || precioAuth > 1e9) return invalido('El precio autorizado no es un importe válido.');
  const ia = limpiarItemsAuth(cuerpo.itemsAuth, c.items);
  if (ia.error) return invalido(ia.error);
  const nota = String(cuerpo.nota || '').slice(0, 500);

  const r = { folio, huella: huellaDe(c.iva, c.items), subCalc: +dinero2(subCalc), precioAuth: +dinero2(precioAuth),
              itemsAuth: itemsAuthCanon(ia.valor), total: totalFinal(subCalc, c.iva, precioAuth), proyecto: c.proyecto,
              correo, ts: '' };
  r.renglones = renglonesDe(c.items, c.iva, itemsAuthDeCanon(r.itemsAuth), precioFinal(subCalc, c.iva, r.precioAuth), mapas);
  const netoCalc = neto(subCalc, c.iva);
  const pct = netoCalc > 0 ? Math.round((netoCalc - r.total) / netoCalc * 1000) / 10 : 0;
  return { ok: true, r, cotizacion: c, cliente: c.cliente, pct, nota };
}

/** El sello que se le contesta al teléfono, como el .gs (los ajustes, como quedaron firmados: a centavo). */
export function selloDeRespuesta(r, codigo, nota) {
  return { codigo, correo: r.correo, ts: r.ts, huella: r.huella, subCalc: r.subCalc, precioAuth: r.precioAuth,
           itemsAuth: itemsAuthDeCanon(r.itemsAuth), total: r.total, nota, renglones: renglonesDeTexto(r.renglones) };
}

/**
 * Los argumentos de la RPC `registrar_autorizacion` (0008, solo service_role). Los importes van como el TEXTO que se
 * firmó (dinero2), para que lo guardado sea exactamente lo firmado. El «Ajuste %» es informativo (no se firma): uno
 * absurdo (|pct| ≥ 1e6, un precio autorizado de mil millones sobre un trabajo de cien pesos) se guarda vacío en vez de
 * hacer que la base rechace el sello.
 */
export function argumentosDeRegistro({ empresa, usuarioId, prep, sello }) {
  const { r } = prep;
  return {
    p_empresa: empresa, p_usuario: usuarioId, p_folio_global: r.folio, p_ts_iso: r.ts, p_proyecto: r.proyecto, p_cliente: sinSustitutosSueltos(prep.cliente),
    p_sub_calc_txt: dinero2(r.subCalc), p_precio_auth_txt: dinero2(r.precioAuth), p_total_txt: dinero2(r.total),
    p_ajuste_pct: Number.isFinite(prep.pct) && Math.abs(prep.pct) < 1e6 ? prep.pct : null,
    p_items_auth: r.itemsAuth, p_huella: r.huella, p_autorizo: r.correo, p_codigo: sello.codigo, p_firma: sello.firma, p_nota: prep.nota,
    p_renglones: r.renglones, p_cotizacion: sinSustitutosSueltos(prep.cotizacion), p_clave_id: 'k1', p_codificacion: sello.codificacion,
  };
}

/* Lo que NO se firma (el cliente y la copia de la cotización) puede traer la mitad de un emoji que dejó un slice: Postgres no la guarda
   (ni en text ni en jsonb) y la RPC fallaría entera. Se cambia por U+FFFD. Lo firmado no pasa por aquí: sellar() ya lo exigió limpio. */
const RE_SUELTO = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
export function sinSustitutosSueltos(x) {
  if (typeof x === 'string') return x.replace(RE_SUELTO, '\ufffd');
  if (Array.isArray(x)) return x.map(sinSustitutosSueltos);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [sinSustitutosSueltos(k), sinSustitutosSueltos(v)]));
  return x;
}
