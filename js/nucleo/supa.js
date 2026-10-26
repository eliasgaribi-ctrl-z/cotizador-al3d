/* ============================================================================
   SUPABASE: ENTRAR, QUIÉN ERES Y CUÁNDO SE TE RETIRÓ EL ACCESO — APAGADO.

   La pieza 3 de la migración (docs/PLAN-SUPABASE.md, docs/DECISIONES-SUPABASE.md Q-08 y Q-09).
   Mientras el interruptor de este aparato esté apagado —y lo está por omisión— este módulo no
   carga nada, no abre ninguna red y no cambia ni una pantalla: la puerta de siempre
   (js/nucleo/puerta.js, el puente y la hoja) sigue siendo la que decide. Encendido, en el
   aparato de quien lo encendió y nada más:

     · Entrar. Google da un TOKEN DE IDENTIDAD (`google.accounts.id`, el botón de Google) y
       Supabase lo cambia por su sesión (`signInWithIdToken`, en `cambiarPorSesion` y en ningún otro
       lado). Es otro token que el de la hoja: aquel es de ACCESO (`oauth2.initTokenClient`), que
       Supabase no acepta. El Client ID es el mismo (js/nucleo/ingreso.js). Va con NONCE: a Google se le
       da su huella SHA-256 y a Supabase el original, así un token robado de otra página no sirve.
       Desde el 2026-10-25 lo pide la PUERTA misma con el botón de Google (`entrarConCredencial`): con la
       empresa en 'base' ese toque basta para entrar, sin la hoja (js/nucleo/puerta.js).
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

   Y el MODO de la empresa (0024_modo.sql, paso 2 de docs/BASE-MANDA.md): `acceso()` guarda lo que la
   base dice de quién manda —la hoja o la base— y, si cambió, avisa a la app (`al3d-modo`) para que
   vuelva a enchufar la bandeja: con 'base', y el interruptor de este aparato encendido, la bandeja
   escribe y lee la base (js/datos/supa-relevo.js) y el rol sale de aquí y no de la hoja. Ver
   `laBaseManda`.
   ============================================================================ */

import { SUPABASE } from '../datos/supabase-config.js';
import { CLIENT_ID, cargarGis, correo as correoDeLaPuerta, huella, nonceNuevo, botonDeIdentidad } from './ingreso.js';
/* El nonce y su huella viven en ingreso.js desde que la puerta pinta el botón de Google sin cargar este
   módulo; se siguen ofreciendo desde aquí para quien ya los pedía a supa.js. */
export { huella, nonceNuevo };

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
/* Apagar deja dicho que fue a propósito (Ajustes, o el acceso retirado): la entrada única de abajo no
   vuelve a encender ese aparato sola. Encender a mano lo borra. */
export const CLAVE_NO_SOLO = 'al3d_pf_supa_no';
export function encender(si) {
  const s = ls(); if (!s) return;
  if (si) { s.setItem(CLAVE_INTERRUPTOR, JSON.stringify({ encendido: true, desde: Date.now() })); s.removeItem(CLAVE_NO_SOLO); }
  else { s.removeItem(CLAVE_INTERRUPTOR); s.setItem(CLAVE_NO_SOLO, '1'); }
}
/** ¿Alguien lo apagó a propósito en este aparato? */
export function apagadoAProposito() {
  try { return ls()?.getItem(CLAVE_NO_SOLO) === '1'; } catch (_) { return false; }
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
    /* Quién manda en la empresa (0024_modo.sql): 'hoja' o 'base'. '' si la base no lo dijo (una base sin
       0024, una cuenta sin acceso activo): eso es «no sé», y no cambia lo que este aparato ya sabía. */
    modo: MODOS.includes(r.modo) ? r.modo : '',
    /* Lo que el área puede escribir (`interno.matriz_permisos()` de 0002): el relevo de la base lo usa
       para no mandar lo que el área no escribe, como la hoja con sus `escribibles`. */
    permisos: (r.permisos && typeof r.permisos === 'object' && !Array.isArray(r.permisos)) ? r.permisos : null,
  };
}

/* ============================================================================
   QUIÉN MANDA: la hoja o la base (paso 2 de docs/BASE-MANDA.md)

   El modo es UNO para toda la empresa y lo dice la base (`mi_acceso().modo`). Este aparato guarda el
   último que oyó, para saber a dónde mandar la bandeja al abrir, sin señal, antes de preguntar nada.
   Fuera de Prefs.CLAVES, como el interruptor: un respaldo restaurado en otro teléfono no debe decidirle
   a dónde escribe.

   La regla, y su porqué: la base manda en ESTE aparato solo con el interruptor encendido Y el último
   modo oído 'base'. Sin interruptor, o sin haberlo oído nunca, la hoja: lo de siempre, que es lo seguro
   (pruebas/supabase-relevo.mjs). El arranque (js/app.js), la puerta (js/nucleo/puerta.js) y el
   cotizador (js/cotizador/venta.js) leen la misma clave con una expresión regular, sin cargar este
   módulo: con la hoja mandando no se descarga nada nuevo.
   ============================================================================ */
export const CLAVE_MODO = 'al3d_pf_supa_modo';
export const MODOS = Object.freeze(['hoja', 'base']);

/** Lo último que la base le dijo a este aparato: {modo, area, permisos, correo, empresa, visto}, o null. */
export function modoGuardado() {
  try {
    const v = JSON.parse(ls()?.getItem(CLAVE_MODO) || 'null');
    return (v && typeof v === 'object' && MODOS.includes(v.modo)) ? v : null;
  } catch (_) { return null; }
}

/** ¿La bandeja de ESTE aparato va a la base? */
export function laBaseManda() {
  const g = modoGuardado();
  return encendido() && !!g && g.modo === 'base';
}

/**
 * Guarda lo que dijo `mi_acceso` si lo dijo de verdad (una cuenta activa con su modo). Devuelve true si
 * el modo CAMBIÓ: entonces la app vuelve a enchufar la bandeja (el evento `al3d-modo`, ver app.js).
 * @param {{estado:string, modo:string, area:string, permisos:Object, correo:string, empresa:string}} a
 */
export function guardarModo(a, ahora = Date.now()) {
  if (!a || a.estado !== 'activo' || !MODOS.includes(a.modo)) return false;
  const antes = modoGuardado();
  try {
    ls()?.setItem(CLAVE_MODO, JSON.stringify({ modo: a.modo, area: a.area || '', permisos: a.permisos || null,
      correo: a.correo || '', empresa: a.empresa || '', visto: ahora }));
  } catch (_) { return false; }
  return !antes || antes.modo !== a.modo;
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

/* La cuenta a la que la base le retiró el acceso en este aparato (con la base mandando). La lee la puerta
   con una expresión regular, sin cargar este módulo. Fuera de Prefs.CLAVES: no viaja en el respaldo. */
export const CLAVE_FUERA = 'al3d_pf_supa_fuera';

/* Candado 3 y la lista de §3.6: lo que se borra y lo que NO. Las preferencias del aparato (tema,
   capa del mapa…) se quedan; el id del aparato y su contador de folios, también. */
export const SE_CONSERVAN = ['al3d_pf_disp', 'al3d_folio'];
export const SE_BORRAN = ['al3d_pf_rol', 'al3d_pf_nombre', 'al3d_pf_ganadas', 'al3d_pf_gcal', 'al3d_pf_puente', 'al3d_pf_ingreso',
  'al3d_pf_empresa', 'al3d_pf_restaurar', 'al3d_pf_pase', 'al3d_pf_entrada', 'al3d_pf_gtok', 'al3d_pf_carpetas', 'al3d_historial',
  'al3d_queue', 'al3d_q', 'al3d_aifile', 'al3d_hitos', 'al3d_canva', 'al3d_cuadernos', 'al3d_logo', 'al3d_autorizador', 'al3d_rv_pct',
  'al3d_rv_cuenta', 'al3d_anidador_retazos', 'al3d_anidador_material', CLAVE_SESION, 'al3d_pf_supa_modo',
  /* Las del paso 4 de «la base manda»: la marca de la bajada del historial, sus lápidas, la de la subida única y el espejo pendiente
     de los precios en la hoja. */
  'al3d_hist_nube', 'al3d_hist_borradas', 'al3d_pf_supa_subida', 'al3d_tarifas_espejo'];
/* `al3d_sombra` es la cola de la sombra de Supabase (js/datos/supa-sombra.js): solo existe en un aparato
   que la encendió, y lleva copias de operaciones de la bandeja. */
export const BASES_LOCALES = ['al3d_pf', 'al3d_cot_imgs', 'al3d_sombra'];

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

/* Se guarda la PROMESA del cliente, no el cliente: las llamadas que llegaban juntas mientras cargaba la
   librería creaban cada una el suyo —de 2 a 4 por carga (auditoría 2026-10-25, H-1)—, varias sesiones
   iguales renovando la llave cada una por su cuenta. Si la librería no carga, se olvida y se reintenta. */
export function cliente() {
  if (_cliente) return _cliente;
  if (!SUPABASE.url || !SUPABASE.llave) return Promise.reject(new Error('Falta la dirección o la llave pública de Supabase (js/datos/supabase-config.js).'));
  const p = cargarLibreria().then(lib => {
    const c = lib.createClient(SUPABASE.url, SUPABASE.llave, {
      auth: { persistSession: true, storageKey: CLAVE_SESION, autoRefreshToken: true, detectSessionInUrl: false },
      global: { headers: { 'x-al3d-contrato': CONTRATO } },
    });
    escucharSalida(c);
    return c;
  });
  _cliente = p;
  p.catch(() => { if (_cliente === p) _cliente = null; });
  return p;
}

/* La sesión se fue —«Salir de Supabase», o un refresco que falló solo—: la app se entera (`al3d-supa-salio`,
   lo oye js/app.js) para olvidar la cuenta del relevo, poner la cruz en el glifo y volver a ofrecer la
   entrada. Sin esto el glifo seguía diciendo «al día» con el teléfono fuera de la base (auditoría
   2026-10-25, ES-5). */
function escucharSalida(c) {
  try {
    if (!c || !c.auth || typeof c.auth.onAuthStateChange !== 'function') return;
    c.auth.onAuthStateChange(ev => {
      if (ev !== 'SIGNED_OUT') return;
      _accesoEnVuelo = null;
      try { globalThis.dispatchEvent(new CustomEvent('al3d-supa-salio')); } catch (_) { /* sin ventana: las pruebas */ }
    });
  } catch (_) { /* una librería sin el oyente: la app se entera en su siguiente vuelta */ }
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
  /* El botón y su nonce los arma ingreso.js (`botonDeIdentidad`), el mismo que usa la puerta. */
  const pintado = await botonDeIdentidad(caja, async ({ credencial, crudo }) => alEntrar(await cambiarPorSesion(credencial, crudo)));
  if (!pintado && caja.isConnected) alEntrar({ ok: false, mensaje: 'No cargó el botón de Google. Revisa la señal.' });
}

/**
 * Cambia el token de identidad de Google por la sesión de Supabase y dice quién eres según la base. Es la
 * única llamada a `signInWithIdToken` de la app: la usan el botón de la puerta (`entrarConCredencial`), el
 * de la banda y Ajustes (`botonDeGoogle`) y el de sin botón (`entrarSinBoton`). A Supabase va el nonce
 * ORIGINAL; a Google se le dio su huella.
 *
 * Con `correoPuerta`, una cuenta que no es la de la puerta no se queda dentro: se sale y se dice. La cuenta
 * es la que dice la SESIÓN (la de Google, recién verificada por Supabase) y, si la sesión no la trae, la
 * que dice `mi_acceso`. Si ninguna de las dos lo dice —la base no contestó— no se sale: una respuesta
 * que falta no es otra persona.
 * @returns {Promise<{ok:true, acceso:Object}|{ok:false, codigo:string, mensaje:string}>}
 */
async function cambiarPorSesion(credencial, crudo, correoPuerta) {
  try {
    if (!credencial || !crudo) throw new Error('Google no dio el token de identidad. Vuelve a tocar el botón.');
    const c = await cliente();
    const { data, error } = await c.auth.signInWithIdToken({ provider: 'google', token: credencial, nonce: crudo });
    if (error) throw error;
    const otra = async () => {
      await salir();
      return { ok: false, codigo: 'OTRA_CUENTA', mensaje: 'Esa cuenta de Google no es con la que entraste a la app (' + correoPuerta + ').' };
    };
    /* Antes de `acceso()` cuando se puede: `acceso()` guarda lo que la base dice de esa cuenta (el modo, el
       área) en este aparato, y lo de una cuenta ajena no tiene por qué quedarse. */
    const deLaSesion = (data && data.user && typeof data.user.email === 'string') ? data.user.email : '';
    if (correoPuerta && deLaSesion && !esLaMismaPersona(deLaSesion, correoPuerta)) return await otra();
    _accesoEnVuelo = null;                         // una pregunta de antes de entrar contestaría «sin sesión»
    const a = await acceso();
    if (correoPuerta && !deLaSesion && a.correo && !esLaMismaPersona(a.correo, correoPuerta)) return await otra();
    vigilar();                                    // desde ya, no hasta la siguiente vez que se abra la app
    return { ok: true, acceso: a };
  } catch (e) { return { ok: false, codigo: 'RECHAZO', mensaje: mensajeDe(e) }; }
}

/* ----- La puerta (2026-10-25: «no tener que ingresar nuevamente con Google») -----
   El botón de Google de la puerta (js/nucleo/puerta.js) da el token de identidad, y aquí se cambia por la
   sesión de Supabase en ese mismo momento: sin otra ventana, sin la banda de arriba después. Lo que se
   haga con el acceso —entrar con el área de la base si la empresa ya está en 'base', o seguir con la hoja—
   lo decide la puerta. Igual que la entrada única de abajo: enciende el interruptor de este aparato, salvo
   que alguien lo haya apagado aquí a propósito (entonces no hace nada, y la puerta ni siquiera enseña el
   botón de Google). */
export async function entrarConCredencial(credencial, crudo, correoPuerta) {
  if (!encendido()) {
    if (apagadoAProposito()) return { ok: false, codigo: 'APAGADO' };
    encender(true);
  }
  return await cambiarPorSesion(credencial, crudo, correoPuerta);
}

/* ----- Una sola entrada (Elías, 2026-10-25: «¿por qué un segundo acceso a Google?») -----
   La puerta entra con un token de ACCESO de Google (el que verifica la hoja); Supabase pide un token
   de IDENTIDAD (`signInWithIdToken`). Son dos fichas distintas que da el mismo Google con el mismo
   Client ID, y hasta hoy la segunda solo salía del botón de Ajustes. Aquí se pide sin botón: el
   `prompt()` de google.accounts.id con `auto_select` y la cuenta de la puerta (`login_hint`). Si esa
   cuenta ya aceptó una vez, Google la da sin enseñar nada (FedCM); si no, enseña su tarjeta
   «Continuar como …», de un toque. Si no la enseña (Safari, la persona la cerró, Google tardó), se
   contesta NECESITA_TOQUE y la app pone el botón a la vista, sin mandar a nadie a Ajustes.
   Una cuenta de Google distinta de la de la puerta no se queda dentro: se sale y se dice. */
export const MS_ESPERA_SIN_BOTON = 20000;
export async function entrarSinBoton(correoPuerta, opc = {}) {
  if (!encendido()) return { ok: false, codigo: 'APAGADO' };
  /* La sesión que ya hay es casi siempre la que dejó la puerta hace un momento (`entrarConCredencial`):
     entonces no se le vuelve a preguntar nada a Google. Pero si es de OTRA cuenta que la de la puerta
     —alguien entró a la nube con una y a la puerta con otra, «Entrar con otra cuenta»—, no sirve: se
     suelta y se pide la buena. Sin correo en la sesión o sin correo de la puerta, se queda como está. */
  const s = await sesion();
  if (s) {
    const deLaSesion = (s.user && typeof s.user.email === 'string') ? s.user.email : '';
    if (!correoPuerta || !deLaSesion || esLaMismaPersona(deLaSesion, correoPuerta)) return { ok: true, ya: true };
    await salir();
  }
  if (!await cargarGis()) return { ok: false, codigo: 'SIN_RED' };
  const g = globalThis.google && globalThis.google.accounts && globalThis.google.accounts.id;
  if (!g || typeof g.prompt !== 'function') return { ok: false, codigo: 'NECESITA_TOQUE' };
  const crudo = nonceNuevo();
  const nonce = await huella(crudo);
  return await new Promise(resolve => {
    let listo = false;
    const fin = r => { if (!listo) { listo = true; resolve(r); } };
    g.initialize({
      client_id: CLIENT_ID, nonce, auto_select: true, login_hint: correoPuerta || undefined,
      cancel_on_tap_outside: false, itp_support: true, use_fedcm_for_prompt: true,
      callback: async resp => fin(await cambiarPorSesion(resp && resp.credential, crudo, correoPuerta)),
    });
    /* Con FedCM Google ya no avisa de todos los momentos; los que sí avisa —no se enseñó, se saltó,
       se cerró— significan lo mismo aquí: hace falta el toque. Y si no avisa nada, el reloj. */
    try {
      g.prompt(n => {
        const no = f => !!(n && typeof n[f] === 'function' && n[f]());
        if (no('isNotDisplayed') || no('isSkippedMoment') || (no('isDismissedMoment') && n.getDismissedReason && n.getDismissedReason() !== 'credential_returned')) {
          fin({ ok: false, codigo: 'NECESITA_TOQUE' });
        }
      });
    } catch (_) { fin({ ok: false, codigo: 'NECESITA_TOQUE' }); }
    setTimeout(() => fin({ ok: false, codigo: 'NECESITA_TOQUE' }), opc.esperaMs || MS_ESPERA_SIN_BOTON);
  });
}

/** Quién eres según la base. Una invitación pendiente se reclama aquí mismo. Las preguntas que llegan
 *  juntas —la puerta, el relevo, Ajustes y la entrada única, al abrir— comparten la que va en vuelo: eran
 *  de 4 a 6 `mi_acceso` por carga (auditoría 2026-10-25, ES-11). Una que llega después pregunta de nuevo. */
let _accesoEnVuelo = null;
export function acceso() {
  if (_accesoEnVuelo) return _accesoEnVuelo;
  const p = accesoDeVerdad();
  _accesoEnVuelo = p;
  const fin = () => { if (_accesoEnVuelo === p) _accesoEnVuelo = null; };
  p.then(fin, fin);
  return p;
}
async function accesoDeVerdad() {
  let a = leerAcceso(await rpc('mi_acceso').catch(e => ({ ok: false, codigo: e.codigo || '', mensaje: mensajeDe(e) })));
  if (a.estado === 'invitacion_pendiente') {
    a = leerAcceso(await rpc('reclamar_acceso').catch(e => ({ ok: false, codigo: e.codigo || '', mensaje: mensajeDe(e) })));
  }
  /* Lo que la base dijo de quién manda se guarda (`reclamar_acceso` contesta con `mi_acceso`, modo
     incluido); si cambió, la app vuelve a enchufar la bandeja. */
  if (guardarModo(a)) {
    try { globalThis.dispatchEvent(new CustomEvent('al3d-modo', { detail: { modo: a.modo } })); } catch (_) { /* sin ventana: las pruebas */ }
  }
  /* Reactivada en la base: lo que este aparato recordaba de su baja ya no vale. */
  if (a.estado === 'activo') {
    try {
      const f = JSON.parse(ls()?.getItem(CLAVE_FUERA) || 'null');
      if (f && esLaMismaPersona(f.correo, a.correo)) ls()?.removeItem(CLAVE_FUERA);
    } catch (_) { /* dañado o sin almacenamiento: nada que levantar */ }
  }
  return a;
}

/** La sesión de Supabase de este aparato, o null (apagado, sin sesión, la librería que no cargó). */
async function sesion() {
  if (!encendido()) return null;
  try { const c = await cliente(); const { data } = await c.auth.getSession(); return (data && data.session) || null; }
  catch (_) { return null; }
}
export async function haySesion() { return !!(await sesion()); }

export async function salir() {
  _accesoEnVuelo = null;
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
/* ============================================================================
   Los precios del cotizador con la base mandando (paso 4 de docs/BASE-MANDA.md, 0019_tarifas.sql)
   Leerlos, cualquier área (quien cotiza los necesita); guardarlos, solo Dirección (la base lo vuelve a comprobar). Contestan la
   misma forma que `/tarifas` y `/guardar_tarifas` de la hoja ({tabla:{filas, actualizado, por}}), así que el cotizador las
   aplica igual. Las pide el cotizador por la ventanilla del enchufe (js/datos/supa-enchufe.js).
   ============================================================================ */

export const tarifasLeer = () => rpc('tarifas_leer', {});
export const tarifasGuardar = filas => rpc('tarifas_guardar', { p_filas: filas });

export const darDeAlta = (correo, area, nota = '') => rpc('miembro_alta', { p_correo: correo, p_area: area, p_nota: nota });
export const cambiarArea = (correo, area) => rpc('miembro_cambiar_area', { p_correo: correo, p_area: area });
export const darDeBaja = correo => rpc('miembro_baja', { p_correo: correo });

/* ============================================================================
   Pantallas del taller (solo Dirección; la base lo vuelve a comprobar)
   Las TV que enseñan taller.html. Se vinculan con el código de 6 letras que sale en la TV y se
   desconectan desde aquí. Ver supabase/migrations/0022_pantallas.sql.
   ============================================================================ */

export async function pantallas() {
  const c = await cliente();
  const { data, error } = await c.from('pantallas').select('id, nombre, aprobada_en, ultima_vez').eq('estado', 'activa').order('aprobada_en');
  if (error) throw error;
  return data || [];
}
export const vincularPantalla = (codigo, nombre = '') => rpc('pantalla_aprobar', { p_codigo: codigo, p_nombre: nombre });
export const desconectarPantalla = id => rpc('pantalla_revocar', { p_id: id });

/* ============================================================================
   El agente de ventas (solo Dirección; la base lo vuelve a comprobar)
   Lo que el agente no pudo cotizar solo y espera a Dirección, la plática de esa conversación, y
   la decisión. Ver supabase/migrations/0023_agente.sql y docs/AGENTE-VENTAS.md.
   ============================================================================ */

export async function decisionesDelAgente() {
  const c = await cliente();
  const { data, error } = await c.from('agente_decisiones').select('id, conversacion_id, razones, resumen, created_at')
    .eq('estado', 'pendiente').order('created_at');
  if (error) throw error;
  return data || [];
}
/* Los últimos mensajes, del más viejo al más nuevo. */
export async function platicaDelAgente(conversacionId) {
  const c = await cliente();
  const { data, error } = await c.from('agente_mensajes').select('de, texto, created_at')
    .eq('conversacion_id', conversacionId).order('id', { ascending: false }).limit(12);
  if (error) throw error;
  return (data || []).reverse();
}
export const decidirAgente = (id, accion, precio = null, nota = '') =>
  rpc('agente_decidir', { p_id: id, p_accion: accion, p_precio: precio, p_nota: nota });

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
      bloquear(puede, b.correo || a.correo);
    } finally { _enCurso = false; }
  };
  setInterval(() => { revisar().catch(() => {}); }, MS_VIGILAR);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar().catch(() => {}); });
  revisar().catch(() => {});
}

/** La pantalla que tapa todo cuando el acceso se retiró. No tiene botón de cerrar.
 *
 *  Los colores son los de la app (`--sup` y `--tinta` de css/sistema.css, que cambian con el tema): pedía
 *  `--tx`, que no existe, y en tema claro quedaba texto blanco sobre gris claro (auditoría 2026-10-25, ES-2).
 *
 *  Con la base mandando la base ES la que dice quién entra: el pase que ella dio se va en el acto, y la
 *  salida ya no es «Apagar Supabase» —apagado, el teléfono volvía a abrir Control con lo guardado y a
 *  escribir en la hoja (ES-1)— sino entrar con otra cuenta: la puerta vuelve a preguntar y a esta cuenta
 *  la base le dice que no. Con la hoja mandando, la salida de siempre. */
export function bloquear(borrado, correo) {
  if (document.getElementById('pf-sin-acceso')) return;
  const manda = laBaseManda();
  if (manda) {
    try {
      ls()?.removeItem('al3d_pf_pase');
      /* Y se recuerda en ESTE aparato a quién se le retiró: si mañana entra sin sesión en la base, la puerta
         no le pregunta a la hoja (js/nucleo/puerta.js, `cuentaRetiradaAqui`). Lo levanta la base al decir «activo». */
      if (correo) ls()?.setItem(CLAVE_FUERA, JSON.stringify({ correo: String(correo).trim().toLowerCase(), ts: Date.now() }));
    } catch (_) { /* sin almacenamiento */ }
  }
  const d = document.createElement('div');
  d.id = 'pf-sin-acceso';
  d.setAttribute('role', 'alertdialog');
  d.setAttribute('aria-modal', 'true');
  d.setAttribute('aria-labelledby', 'pf-sin-acceso-t');
  d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;' +
    'background:var(--sup,#ffffff);color:var(--tinta,#1a1d33);text-align:center;font:16px/1.5 system-ui,sans-serif';
  const salida = manda
    ? 'Entrar con otra cuenta'
    /* La salida: mientras la empresa siga con la hoja, apagar en este aparato quita la pantalla (y la
       puerta de siempre vuelve a decidir). Sin esto, un error de prueba dejaba el teléfono tapado. */
    : 'Apagar Supabase en este aparato';
  d.innerHTML = '<div style="max-width:28rem"><h2 id="pf-sin-acceso-t" style="margin:0 0 .5rem">Tu acceso a AL3D se retiró</h2>' +
    '<p style="margin:0">Dirección dio de baja esta cuenta. ' +
    (borrado ? 'Los datos de AL3D de este aparato se borraron.' : 'Los datos de este aparato no se borraron: siguen aquí, pero ya no se pueden abrir.') +
    ' Si es un error, habla con Dirección.</p>' +
    '<p style="margin:1.25rem 0 0"><button type="button" id="pf-sin-acceso-apagar" style="font:inherit;min-height:44px;padding:.6rem 1rem;' +
    'border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit">' + salida + '</button></p></div>';
  for (const el of document.body.children) if (el !== d) el.setAttribute('inert', '');
  document.body.appendChild(d);
  d.querySelector('#pf-sin-acceso-apagar').addEventListener('click', async () => {
    await salir();
    if (!manda) encender(false);
    location.reload();
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
