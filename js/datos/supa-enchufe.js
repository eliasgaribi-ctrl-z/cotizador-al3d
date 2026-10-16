/* ============================================================================
   EL ENCHUFE DE SUPABASE — conecta la sombra (fase 3) y la lectura en vivo (fase 4). APAGADO.

   Este módulo no lo importa nadie de forma estática. `app.js` lo carga con import() SOLO si en
   este aparato están encendidos el interruptor general de Supabase y el de la sombra; Ajustes, solo
   para Dirección y con el general encendido. Apagado: ni se descarga, ni se ejecuta, ni pregunta
   nada a la red (pruebas/supabase-sombra.mjs lo comprueba).

   Lo que enchufa, y dónde:
     · la SOMBRA: el gancho `Sync.alSubir` (js/datos/sync.js) → la cola de js/datos/supa-sombra.js;
       se manda tras cada copia, cada minuto con la app a la vista y al volver la señal;
     · el CUADRE diario: una vez al día (día de México), con la sombra encendida y siendo Dirección,
       compara la hoja con la base (js/datos/supa-cuadre.js) y lo guarda; Ajustes enseña la racha;
     · la LECTURA EN VIVO: `Puente.fuenteDeLectura` (js/datos/puente.js) → js/datos/supa-vivo.js, y
       la suscripción de Realtime que avisa a la app que hay algo que bajar.
   `apagar()` lo desenchufa todo sin recargar: los ganchos vuelven a null y la app vuelve a ser la
   de siempre.
   ============================================================================ */

import * as Sync from './sync.js';
import * as Puente from './puente.js';
import * as Supa from '../nucleo/supa.js';
import { crearSombra, almacenIndexedDB, sombraEncendida, vivoEncendido } from './supa-sombra.js';
import { crearFuente, suscribir, todas } from './supa-vivo.js';
import { cuadrar, diaMx, racha } from './supa-cuadre.js';

const MS_BOMBEO = 60 * 1000;
const MS_TRAS_COPIA = 2000;
const MS_RESPALDO_VIVO = 5 * 60 * 1000;      // con Realtime vivo, la base se relee igual cada 5 min (respaldo)
const MS_ENTRE_INTENTOS_DE_CUADRE = 30 * 60 * 1000;
const CLAVE_MARCA_ALMACEN = 'al3d_pf_supa_vivo_alm';

let _almacen = null, _sombra = null, _canal = null, _fuente = null, _area = '', _empresa = 'al3d';
let _reloj = 0, _programado = 0, _sincronizar = null, _debeJalar = true, _ultimoJalar = 0, _estadoCanal = '';
let _avisarApp = null, _cuadreIntentadoEn = 0;

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

async function acceso() {
  try { const a = await Supa.acceso(); if (a && a.estado === 'activo') { _area = a.area; _empresa = a.empresa || 'al3d'; } return a; }
  catch (_) { return { estado: 'desconocido' }; }
}

function almacen() { return _almacen || (_almacen = almacenIndexedDB()); }

function sombra() {
  return _sombra || (_sombra = crearSombra({ cliente: Supa.cliente, almacen: almacen() }));
}

/** Manda la cola de la sombra si hay sesión. Nunca lanza. */
export async function bombearSombra() {
  if (!sombraEncendida()) return { motivo: 'apagada' };
  if (!await Supa.haySesion()) return { motivo: 'sin_sesion' };
  const r = await sombra().bombear();
  cuadreDelDia().catch(() => {});
  return r;
}

function programar(ms) {
  clearTimeout(_programado);
  _programado = setTimeout(() => { bombearSombra().catch(() => {}); }, ms);
}

/* ----- El cuadre ----- */

/** La hoja contra la base, ahora. Solo Dirección (la base y la hoja se lo niegan a los demás). */
export async function cuadrarAhora() {
  const a = await acceso();
  if (a.estado !== 'activo' || a.area !== 'direccion') {
    return { ok: false, mensaje: 'El cuadre lo hace una cuenta de Dirección con sesión en la base.' };
  }
  let hoja;
  try {
    const r = await Puente.hablar('jalar', {});
    if (!r || r.ok === false) return { ok: false, mensaje: (r && r.mensaje) || 'La hoja no contestó.' };
    hoja = (Array.isArray(r.registros) ? r.registros : []).map(f => Puente.ventaDeHoja((f && f.datos) || null)).filter(Boolean);
  } catch (e) { return { ok: false, mensaje: 'La hoja no contestó: ' + ((e && e.message) || e) }; }
  let base;
  try {
    const c = await Supa.cliente();
    base = await todas(() => c.from('ventas_calculadas')
      .select('a_folio, folio_global, g_subtotal, h_neto, i_anticipo, j_liquidacion, k_saldo, r_comision, s_abonado, t_restante')
      .eq('empresa_id', _empresa).order('a_folio'));
  } catch (e) { return { ok: false, mensaje: 'La base no contestó: ' + Supa.mensajeDe(e) }; }
  const res = cuadrar(hoja, base);
  const ts = Date.now();
  const guardado = { id: String(ts), ts, dia: diaMx(ts), cuadra: res.cuadra, resultado: res };
  try {
    await almacen().poner('cuadres', guardado);
    const lista = (await almacen().listar('cuadres')).sort((x, y) => x.ts - y.ts);
    for (const viejo of lista.slice(0, Math.max(0, lista.length - 60))) await almacen().borrar('cuadres', viejo.id);
  } catch (_) { /* el cuadre se enseña aunque no se guarde */ }
  try { await sombra().anotar({ tipo: 'cuadre', mensaje: res.cuadra ? 'cuadra' : 'NO cuadra' }); } catch (_) {}
  return { ok: true, ...guardado };
}

/** El cuadre del día, si todavía no hay uno de hoy. Solo con la sombra encendida. */
async function cuadreDelDia() {
  if (!sombraEncendida()) return;
  const hoy = diaMx(Date.now());
  const lista = await almacen().listar('cuadres').catch(() => []);
  if (lista.some(x => x.dia === hoy)) return;
  if (_area && _area !== 'direccion') return;
  /* Si la hoja o la base no contestan, se vuelve a intentar a la media hora, no cada minuto. */
  if (Date.now() - _cuadreIntentadoEn < MS_ENTRE_INTENTOS_DE_CUADRE) return;
  _cuadreIntentadoEn = Date.now();
  const r = await cuadrarAhora();
  if (!r.ok) { try { await sombra().anotar({ tipo: 'cuadre', mensaje: 'no se pudo: ' + r.mensaje }); } catch (_) {} }
}

/** Los cuadres guardados (los más nuevos primero) y la racha de días seguidos. */
export async function cuadres() {
  const lista = (await almacen().listar('cuadres').catch(() => [])).sort((a, b) => b.ts - a.ts);
  return { lista, racha: racha(lista), meta: 7 };
}

/* ----- La lectura en vivo ----- */

function encenderVivo() {
  if (_fuente) return;
  const marca = {
    leer: () => { try { return Number(localStorage.getItem(CLAVE_MARCA_ALMACEN)) || 0; } catch (_) { return 0; } },
    poner: v => { try { localStorage.setItem(CLAVE_MARCA_ALMACEN, String(v)); } catch (_) {} },
  };
  _fuente = crearFuente({ cliente: Supa.cliente, area: () => _area, empresa: _empresa, marca });
  Puente.fuenteDeLectura(_fuente);
  _debeJalar = true;
  Supa.cliente().then(c => {
    if (!_fuente) return;
    _canal = suscribir(c, _area, () => { _debeJalar = true; if (_sincronizar) _sincronizar(); },
      { empresa: _empresa, alEstado: e => { _estadoCanal = e; } });
  }).catch(() => {});
  if (_avisarApp) _avisarApp(lecturaEnVivo);
}

function apagarVivo() {
  Puente.fuenteDeLectura(null);
  _fuente = null;
  if (_canal) { _canal.cerrar(); _canal = null; }
  _estadoCanal = '';
  _debeJalar = true;
  if (_avisarApp) _avisarApp(null);
}

/** Lo que la app pregunta en cada vuelta de 30 s: ¿se salta la bajada? Solo con Realtime vivo, sin
 *  aviso pendiente y con una bajada hace menos de 5 minutos. */
export const lecturaEnVivo = {
  saltarJalar() {
    const ahora = Date.now();
    const salta = !!(_fuente && _canal && _canal.viva() && !_debeJalar && ahora - _ultimoJalar < MS_RESPALDO_VIVO);
    if (!salta) { _debeJalar = false; _ultimoJalar = ahora; }
    return salta;
  },
};

/* ----- Arrancar y apagar ----- */

/**
 * Lo llama app.js (solo con los interruptores encendidos) y Ajustes al encender algo.
 * @param {{sincronizar?:function(), avisarApp?:function(Object|null)}} [o]
 */
export async function arrancar(o = {}) {
  if (o.sincronizar) _sincronizar = o.sincronizar;
  if (o.avisarApp) _avisarApp = o.avisarApp;
  if (!sombraEncendida()) { apagar(); return { sombra: false, vivo: false }; }

  /* La copia se guarda aunque todavía no haya sesión: nada de lo que la hoja aceptó se pierde, y
     sale en cuanto se entre a la base. */
  Sync.alSubir(async (op, respuesta) => { await sombra().encolar(op, respuesta); programar(MS_TRAS_COPIA); });
  if (!_reloj) {
    _reloj = setInterval(() => { if (visible()) bombearSombra().catch(() => {}); }, MS_BOMBEO);
    try { globalThis.addEventListener('online', () => programar(MS_TRAS_COPIA)); } catch (_) {}
  }

  const haySesion = await Supa.haySesion();
  if (haySesion) await acceso();
  if (vivoEncendido() && haySesion && ['direccion', 'fabricacion', 'pagos'].includes(_area)) encenderVivo();
  else apagarVivo();
  programar(MS_TRAS_COPIA);
  return { sombra: true, vivo: !!_fuente };
}

/** Desenchufa todo. La cola de la sombra se queda guardada (sale si se vuelve a encender). */
export function apagar() {
  Sync.alSubir(null);
  apagarVivo();
  clearInterval(_reloj); _reloj = 0;
  clearTimeout(_programado);
}

/** Para la tarjeta de Ajustes. */
export async function estado() {
  const s = sombraEncendida() ? await sombra().estado() : { pendientes: 0, rechazadas: 0, ultimo_error: '' };
  return { sombra: sombraEncendida(), vivo: !!_fuente, vivoPedido: vivoEncendido(), area: _area,
           canal: _estadoCanal, leeDeLaBase: Puente.leeDeOtraFuente(), ...s };
}
export async function registro(n) { return sombraEncendida() ? sombra().registro(n) : []; }
export async function reintentarRechazadas() { const k = await sombra().reintentarRechazadas(); programar(100); return k; }
