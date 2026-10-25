/* ============================================================================
   CUENTAS — lo que la pestaña «Cuentas» de Control le pide a la base (0027, 2026-10-25).

   La pestaña la pinta js/mod/control.js con lo que ya tiene (las ventas y los gastos que bajaron de la base)
   y la aritmética pura de js/datos/dinero-cuentas.js. Lo único que necesita de la red es la lista de CUENTAS
   DISPONIBLES de la empresa (`ajustes_dinero`), para leerla y, Dirección, para cambiarla. Vive aquí, aparte,
   por la misma regla que «Cobros y abonos»: Control no nombra supa.js (pruebas/pagos-supa.mjs lo vigila), y
   con la hoja mandando este archivo ni se descarga.

   La lista que se leyó se recuerda en el teléfono (`CLAVE_AJUSTE`: solo los nombres de las cuentas, que no son
   un dato de nadie) para pintar el disponible sin señal y sin esperar a la red; la base manda en cuanto contesta.
   ============================================================================ */

import * as DC from '../datos/dinero-cuentas.js';
import { clasificar, nuevoOpId } from '../datos/pagos-supa.js';
import { confirmarPf } from '../nucleo/ui.js';

const almacen = () => { try { return globalThis.localStorage || null; } catch (_) { return null; } };
let _incierto = null;             // { opId, huella } de un cambio que no contestó: reintentar LO MISMO va con el mismo op_id

/**
 * La lista de la base (o la que este teléfono recordaba, si la base no contesta). Nunca lanza.
 * @returns {Promise<{cuentas:string[], por:string, en:string, leida:boolean, deLaBase:boolean, mensaje?:string}>}
 */
export async function leerAjuste() {
  const guardado = DC.ajusteGuardado(almacen());
  try {
    const Supa = await import('../nucleo/supa.js');
    if (!Supa.encendido() || !(await Supa.haySesion())) return { ...guardado, deLaBase: false };
    const c = await Supa.cliente();
    const { data, error } = await c.from('ajustes_dinero').select('empresa_id, cuentas_disponibles, actualizado_por, updated_at').order('empresa_id');
    if (error) return { ...guardado, deLaBase: false, mensaje: 'No se pudo leer de la base qué cuentas son disponibles: se usa lo último que se leyó.' };
    /* Sin renglón (una empresa nueva) vale lo de por omisión, como en la base. La RLS solo da las de la empresa de quien lee. */
    const f = Array.isArray(data) && data.length ? data[0] : null;
    const a = { cuentas: DC.disponiblesDe(f ? f.cuentas_disponibles : null), por: (f && f.actualizado_por) || '', en: (f && String(f.updated_at || '')) || '', leida: true };
    DC.guardarAjuste(almacen(), a);
    return { ...a, deLaBase: true };
  } catch (_) {
    return { ...guardado, deLaBase: false };
  }
}

/**
 * Dirección cambia la lista: pregunta antes (con el botón de peligro si Elias BBVA deja de contar) y la manda. Nunca lanza.
 * @returns {Promise<{ok:true, cuentas:string[]} | {ok:false, mensaje:string, cancelado?:boolean, sinCambio?:boolean}>}
 */
export async function guardarAjuste(marcadas, actuales) {
  const huella = DC.CUENTAS.filter(c => Array.isArray(marcadas) && marcadas.includes(c)).join('|');
  const opId = _incierto && _incierto.huella === huella ? _incierto.opId : nuevoOpId();
  const p = DC.planAjuste(marcadas, actuales, opId);
  if (!p.ok) return { ok: false, mensaje: p.mensaje, sinCambio: !!p.sinCambio };
  if (!await confirmarPf({ titulo: p.titulo, texto: p.texto, si: p.si, no: 'Cancelar', peligro: p.peligro })) return { ok: false, cancelado: true, mensaje: '' };
  let res, lanzado = null;
  try {
    const Supa = await import('../nucleo/supa.js');
    res = await (await Supa.cliente()).rpc(p.rpc, p.args);
  } catch (e) { lanzado = e || { message: 'error' }; }
  const r = clasificar(p.rpc, res, lanzado);
  if (r.ok) {
    _incierto = null;
    const a = { cuentas: DC.disponiblesDe(r.data && r.data.cuentas), por: '', en: new Date().toISOString(), leida: true };
    DC.guardarAjuste(almacen(), a);
    return { ok: true, cuentas: a.cuentas, sinCambio: !!(r.data && r.data.sin_cambio) };
  }
  /* Incierto: el siguiente intento con LO MISMO va con el mismo op_id (si la base ya lo tenía, contesta lo de la primera vez); con otra lista,
     uno nuevo (la lista es absoluta: mandar la nueva no suma nada a la vieja). Seguro: uno nuevo. */
  _incierto = r.incierto ? { opId, huella } : null;
  return { ok: false, mensaje: r.codigo === 'ROL_SIN_PERMISO' ? 'Cambiar las cuentas disponibles es de Dirección. No se guardó nada.' : r.mensaje };
}
