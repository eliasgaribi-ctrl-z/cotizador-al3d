/* ============================================================================
   SUPABASE: ENTRAR, QUIÉN ERES Y CUÁNDO SE TE RETIRÓ EL ACCESO — APAGADO.

   La pieza 3 de la migración (docs/PLAN-SUPABASE.md, docs/DECISIONES-SUPABASE.md Q-08 y Q-09).
   Mientras el interruptor de este aparato esté apagado —y lo está por omisión— este módulo no
   carga nada, no abre ninguna red y no cambia ni una pantalla: la puerta de siempre
   (js/nucleo/puerta.js, el puente y la hoja) sigue siendo la que decide. Encendido, en el
   aparato de quien lo encendió y nada más:

     · Entrar. Google da un TOKEN DE IDENTIDAD (`google.accounts.id`, el botón de Google) y
       Supabase lo cambia por su sesión (`signInWithIdToken`). Es otro token que el de la puerta
       de hoy: aquella pide a Google un token de ACCESO (`oauth2.initTokenClient`), que Supabase
       no acepta. El Client ID es el mismo (js/nucleo/ingreso.js). Va con NONCE: a Google se le
       da su huella SHA-256 y a Supabase el original, así un token robado de otra página no sirve.
     · Quién eres. `mi_acceso()` de la base dice el estado (activo, invitación pendiente, sin
       acceso, acceso retirado) y el área. Con una invitación pendiente se reclama sola
       (`reclamar_acceso`): así queda vinculada la cuenta de Google al correo invitado.
     · Altas y bajas. Dirección da de alta un correo con su área, le cambia el área o le da de
       baja (`miembro_alta`, `miembro_cambiar_area`, `miembro_baja`). La base no deja quedarse
       sin un Dirección activo.
     · El acceso retirado (DISENO.md §7.5) con sus TRES CANDADOS:
         1. solo cuenta la respuesta EXPLÍCITA de la base, y dos veces con 5 s o más de
            separación; un error de red, una sesión vencida o una lista vacía NO son «fuera»
            (un falso «fuera» ya le cerró la app a alguien de verdad, puerta.js);
         2. borrar lo de este aparato solo si la bandeja está vacía y todo lo local tiene acuse
            de la subida única. La subida única todavía NO existe, así que el borrado está
            DESHABILITADO (BORRADO_HABILITADO): se bloquea la pantalla y no se borra nada;
         3. aun borrando, se conservan el id del aparato y su contador de folios.

   Nada de aquí guarda la sesión en los respaldos: su clave no está en Prefs.CLAVES ni en
   RESPALDO_KEYS.
   ============================================================================ */

import { SUPABASE } from '../datos/supabase-config.js';
import { CLIENT_ID, cargarGis, correo as correoDeLaPuerta } from './ingreso.js';

/* El interruptor de ESTE aparato y la sesión de Supabase. Fuera de Prefs.CLAVES a propósito:
   esas viajan en el respaldo, y un respaldo restaurado en otro teléfono no debe encender nada
   ni llevarse una sesión. */
export const CLAVE_INTERRUPTOR = 'al3d_pf_supa';
export const CLAVE_SESION = 'al3d_pf_supa_sesion';
export const CONTRATO = '1';                        // cabecera x-al3d-contrato (DISENO.md §7.6)
export const MS_SEGUNDA_OPINION = 5000;             // candado 1
export const MS_VIGILAR = 10 * 60 * 1000;
/* Candado 2: hasta que exista la subida única con acuse, nunca se borra. Cambiarlo es una
   decisión de Elías y una pieza aparte. */
export const BORRADO_HABILITADO = false;

const ls = () => { try { return globalThis.localStorage || null; } catch (_) { return null; } };

/** ¿Está encendido en este aparato? */
export function encendido() {
  try { const v = JSON.parse(ls()?.getItem(CLAVE_INTERRUPTOR) || 'null'); return !!(v && v.encendido === true); }
  catch (_) { return false; }
}
export function encender(si) {
  const s = ls(); if (!s) return;
  if (si) s.setItem(CLAVE_INTERRUPTOR, JSON.stringify({ encendido: true, desde: Date.now() }));
  else s.removeItem(CLAVE_INTERRUPTOR);
}

/* ============================================================================
   Lo puro (lo prueba pruebas/supabase-entrada.mjs sin navegador)
   ============================================================================ */

/** La respuesta de `mi_acceso()` en lo que la app necesita. Cualquier otra forma es «no sé». */
export function leerAcceso(r) {
  if (!r || typeof r !== 'object') return { estado: 'desconocido' };
  if (r.ok === false) return { estado: r.codigo === 'SIN_SESION' ? 'sin_sesion' : 'desconocido', codigo: r.codigo || '', mensaje: r.mensaje || '' };
  const estados = ['activo', 'invitacion_pendiente', 'sin_acceso', 'acceso_revocado', 'correo_no_verificado'];
  if (!estados.includes(r.estado)) return { estado: 'desconocido' };
  const activa = Array.isArray(r.empresas) ? r.empresas.find(e => e && e.estado === 'activo') : null;
  return {
    estado: r.estado,
    correo: (r.usuario && typeof r.usuario.correo === 'string') ? r.usuario.correo : '',
    area: activa && ['direccion', 'fabricacion', 'pagos'].includes(activa.area) ? activa.area : '',
    empresa: activa ? activa.empresa_id : '',
    contratoViejo: !!(r.contrato && Number(r.contrato.minimo) > Number(CONTRATO)),
  };
}

/**
 * Candado 1: ¿las dos respuestas dicen, explícitamente, que el acceso se retiró? Solo cuenta
 * `acceso_revocado` en las DOS, con al menos MS_SEGUNDA_OPINION entre una y otra. Un error, una
 * sesión vencida (`sin_sesion`), `desconocido` o `sin_acceso` (nunca tuvo) no lo son.
 */
export function accesoRetirado(primera, segunda, msEntre) {
  return !!(primera && segunda && primera.estado === 'acceso_revocado' && segunda.estado === 'acceso_revocado' &&
            Number(msEntre) >= MS_SEGUNDA_OPINION);
}

/** Candado 2: ¿se puede borrar lo de este aparato? */
export function sePuedeBorrar({ habilitado = BORRADO_HABILITADO, bandejaVacia, todoConAcuse } = {}) {
  return habilitado === true && bandejaVacia === true && todoConAcuse === true;
}

/* Candado 3 y la lista de §3.6: lo que se borra y lo que NO. Las preferencias del aparato (tema,
   capa del mapa…) se quedan; el id del aparato y su contador de folios, también. */
export const SE_CONSERVAN = ['al3d_pf_disp', 'al3d_folio'];
export const SE_BORRAN = ['al3d_pf_rol', 'al3d_pf_nombre', 'al3d_pf_ganadas', 'al3d_pf_gcal', 'al3d_pf_puente', 'al3d_pf_ingreso',
  'al3d_pf_empresa', 'al3d_pf_restaurar', 'al3d_pf_pase', 'al3d_pf_entrada', 'al3d_pf_gtok', 'al3d_pf_carpetas', 'al3d_historial',
  'al3d_queue', 'al3d_q', 'al3d_aifile', 'al3d_hitos', 'al3d_canva', 'al3d_cuadernos', 'al3d_logo', 'al3d_autorizador', 'al3d_rv_pct',
  'al3d_rv_cuenta', 'al3d_anidador_retazos', 'al3d_anidador_material', CLAVE_SESION];
export const BASES_LOCALES = ['al3d_pf', 'al3d_cot_imgs'];

/** Huella SHA-256 en hexadecimal (lo que se le da a Google como nonce). */
export async function huella(texto) {
  const b = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function nonceNuevo() {
  const a = new Uint8Array(32); globalThis.crypto.getRandomValues(a);
  return [...a].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Un error de la base o de la red, en palabras para la pantalla. */
export function mensajeDe(e) {
  const c = e && (e.codigo || e.code || '');
  const m = String((e && (e.mensaje || e.message)) || '');
  if (c === 'ROL_SIN_PERMISO') return 'Eso solo lo puede hacer Dirección.';
  if (c === 'CLIENTE_VIEJO') return 'Esta versión de la app ya no es la que espera la base: actualízala.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión con Supabase. Revisa la señal.';
  if (/nonce/i.test(m)) return 'Google y Supabase no se pusieron de acuerdo (nonce). Vuelve a tocar el botón.';
  if (/audience|client.?id/i.test(m)) return 'Supabase no reconoce el Client ID de la app. Hay que darlo de alta en el proyecto.';
  return m || 'Algo falló con Supabase.';
}

/* ============================================================================
   La librería y el cliente (solo con el interruptor encendido)
   ============================================================================ */

let _lib = null, _cliente = null;

/** vendor/supabase.js (supabase-js, sin red de terceros) se carga AQUÍ y solo aquí. */
export function cargarLibreria() {
  if (_lib) return _lib;
  _lib = new Promise((resolve, reject) => {
    if (globalThis.supabase && globalThis.supabase.createClient) return resolve(globalThis.supabase);
    const s = document.createElement('script');
    s.src = new URL('../../vendor/supabase.js', import.meta.url).href;
    s.async = true;
    s.onload = () => (globalThis.supabase && globalThis.supabase.createClient ? resolve(globalThis.supabase) : reject(new Error('supabase-js no cargó')));
    s.onerror = () => { _lib = null; reject(new Error('Failed to fetch vendor/supabase.js')); };
    document.head.appendChild(s);
  });
  return _lib;
}

export async function cliente() {
  if (_cliente) return _cliente;
  if (!SUPABASE.url || !SUPABASE.llave) throw new Error('Falta la dirección o la llave pública de Supabase (js/datos/supabase-config.js).');
  const lib = await cargarLibreria();
  _cliente = lib.createClient(SUPABASE.url, SUPABASE.llave, {
    auth: { persistSession: true, storageKey: CLAVE_SESION, autoRefreshToken: true, detectSessionInUrl: false },
    global: { headers: { 'x-al3d-contrato': CONTRATO } },
  });
  return _cliente;
}

/** Una función de la base; devuelve su jsonb o lanza con {codigo, mensaje}. */
async function rpc(nombre, args) {
  const c = await cliente();
  const { data, error } = await c.rpc(nombre, args || {});
  if (error) throw error;
  if (data && data.ok === false) { const e = new Error(data.mensaje || data.codigo); e.codigo = data.codigo; e.mensaje = data.mensaje; throw e; }
  return data;
}

/* ============================================================================
   Entrar
   ============================================================================ */

/**
 * Pinta el botón de Google en `caja` y resuelve cuando la persona entró a Supabase. El botón lo
 * dibuja Google (un iframe suyo): en el iPhone con la app instalada es lo que más se parece a lo
 * que ya funciona con la puerta de hoy. Devuelve {ok:true, acceso} o {ok:false, mensaje}.
 */
export async function botonDeGoogle(caja, alEntrar) {
  if (!await cargarGis()) { alEntrar({ ok: false, mensaje: 'No cargó el botón de Google. Revisa la señal.' }); return; }
  const crudo = nonceNuevo();
  const g = globalThis.google && globalThis.google.accounts && globalThis.google.accounts.id;
  if (!g) { alEntrar({ ok: false, mensaje: 'Google no contestó.' }); return; }
  const nonce = await huella(crudo);
  if (!caja.isConnected) return;                    // Ajustes se repintó mientras tanto: el botón nuevo es de otro turno
  g.initialize({
    client_id: CLIENT_ID, nonce, auto_select: false, cancel_on_tap_outside: true, itp_support: true,
    use_fedcm_for_button: true,
    callback: async resp => {
      try {
        const c = await cliente();
        const { error } = await c.auth.signInWithIdToken({ provider: 'google', token: resp && resp.credential, nonce: crudo });
        if (error) throw error;
        vigilar();                                    // desde ya, no hasta la siguiente vez que se abra la app
        alEntrar({ ok: true, acceso: await acceso() });
      } catch (e) { alEntrar({ ok: false, mensaje: mensajeDe(e) }); }
    },
  });
  caja.innerHTML = '';
  g.renderButton(caja, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es' });
}

/** Quién eres según la base. Una invitación pendiente se reclama aquí mismo. */
export async function acceso() {
  let a = leerAcceso(await rpc('mi_acceso').catch(e => ({ ok: false, codigo: e.codigo || '', mensaje: mensajeDe(e) })));
  if (a.estado === 'invitacion_pendiente') {
    a = leerAcceso(await rpc('reclamar_acceso').catch(e => ({ ok: false, codigo: e.codigo || '', mensaje: mensajeDe(e) })));
  }
  return a;
}

export async function haySesion() {
  if (!encendido()) return false;
  try { const c = await cliente(); const { data } = await c.auth.getSession(); return !!(data && data.session); }
  catch (_) { return false; }
}

export async function salir() {
  try { const c = await cliente(); await c.auth.signOut(); } catch (_) { /* sin red: la sesión local se va igual abajo */ }
  try { ls()?.removeItem(CLAVE_SESION); } catch (_) { /* nada */ }
}

/* ============================================================================
   Personas (solo Dirección; la base lo vuelve a comprobar)
   ============================================================================ */

export async function personas() {
  const c = await cliente();
  const { data, error } = await c.from('miembros').select('correo, area, estado, nota, reclamado_en, baja_en').order('correo');
  if (error) throw error;
  return data || [];
}
export const darDeAlta = (correo, area, nota = '') => rpc('miembro_alta', { p_correo: correo, p_area: area, p_nota: nota });
export const cambiarArea = (correo, area) => rpc('miembro_cambiar_area', { p_correo: correo, p_area: area });
export const darDeBaja = correo => rpc('miembro_baja', { p_correo: correo });

/* ============================================================================
   Vigilar el acceso (candados 1 a 3)
   ============================================================================ */

const espera = ms => new Promise(r => setTimeout(r, ms));
let _vigilando = false, _enCurso = false;

/**
 * ¿Es la MISMA persona? Solo se tapa la app si la cuenta a la que se le retiró el acceso en la base
 * es la misma con la que se entró por la puerta de hoy. Así Dirección puede probar con otra cuenta
 * (una dada de baja a propósito) sin quedarse fuera de su propio teléfono. Sin correo de la puerta
 * (copia local, aparato sin puente) no se tapa nada.
 */
export function esLaMismaPersona(correoBase, correoPuerta) {
  const a = String(correoBase || '').trim().toLowerCase(), b = String(correoPuerta || '').trim().toLowerCase();
  return !!a && a === b;
}

/**
 * Pregunta a la base cada MS_VIGILAR y al volver a la app. Si DOS respuestas explícitas,
 * separadas, dicen «acceso retirado», bloquea la pantalla. El borrado de lo local solo corre
 * con los tres candados abiertos (hoy, nunca: BORRADO_HABILITADO = false).
 * @param {{bandejaVacia?: () => Promise<boolean>, todoConAcuse?: () => Promise<boolean>}} [deps]
 */
export function vigilar(deps = {}) {
  if (_vigilando || !encendido()) return;
  _vigilando = true;
  const revisar = async () => {
    if (_enCurso) return;
    _enCurso = true;
    try {
      if (!encendido() || !await haySesion()) return;
      const t0 = Date.now();
      const a = await acceso();
      if (a.estado !== 'acceso_revocado') return;
      await espera(MS_SEGUNDA_OPINION);
      const b = await acceso();
      if (!accesoRetirado(a, b, Date.now() - t0)) return;
      if (!encendido() || !esLaMismaPersona(b.correo || a.correo, correoDeLaPuerta())) return;   // se apagó en la espera, u otra cuenta
      const puede = sePuedeBorrar({
        bandejaVacia: deps.bandejaVacia ? await deps.bandejaVacia().catch(() => false) : false,
        todoConAcuse: deps.todoConAcuse ? await deps.todoConAcuse().catch(() => false) : false,
      });
      if (puede) await borrarLocal();
      bloquear(puede);
    } finally { _enCurso = false; }
  };
  setInterval(() => { revisar().catch(() => {}); }, MS_VIGILAR);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar().catch(() => {}); });
  revisar().catch(() => {});
}

/** La pantalla que tapa todo cuando el acceso se retiró. No tiene botón de cerrar. */
export function bloquear(borrado) {
  if (document.getElementById('pf-sin-acceso')) return;
  const d = document.createElement('div');
  d.id = 'pf-sin-acceso';
  d.setAttribute('role', 'alertdialog');
  d.setAttribute('aria-modal', 'true');
  d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;' +
    'background:var(--bg,#0b0d12);color:var(--tx,#f2f4f8);text-align:center;font:16px/1.5 system-ui,sans-serif';
  d.innerHTML = '<div style="max-width:28rem"><h2 style="margin:0 0 .5rem">Tu acceso a AL3D se retiró</h2>' +
    '<p style="margin:0">Dirección dio de baja esta cuenta. ' +
    (borrado ? 'Los datos de AL3D de este aparato se borraron.' : 'Los datos de este aparato no se borraron: siguen aquí, pero ya no se pueden abrir.') +
    ' Si es un error, habla con Dirección.</p>' +
    /* La salida: mientras esto sea una prueba con interruptor, apagarlo en este aparato quita la pantalla
       (y la puerta de siempre vuelve a decidir). Sin esto, un error de prueba dejaba el teléfono tapado. */
    '<p style="margin:1.25rem 0 0"><button type="button" id="pf-sin-acceso-apagar" style="font:inherit;padding:.6rem 1rem;' +
    'border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit">Apagar Supabase en este aparato</button></p></div>';
  for (const el of document.body.children) if (el !== d) el.setAttribute('inert', '');
  document.body.appendChild(d);
  d.querySelector('#pf-sin-acceso-apagar').addEventListener('click', async () => {
    await salir(); encender(false); location.reload();
  });
}

/** El borrado de §3.6. Solo lo llama vigilar() con los tres candados abiertos. */
export async function borrarLocal() {
  if (!BORRADO_HABILITADO) return false;
  const s = ls();
  for (const k of SE_BORRAN) { try { s?.removeItem(k); } catch (_) { /* sigue */ } }
  for (const b of BASES_LOCALES) { try { globalThis.indexedDB?.deleteDatabase(b); } catch (_) { /* sigue */ } }
  try { for (const k of await caches.keys()) await caches.delete(k); } catch (_) { /* sin caché */ }
  return true;
}
