/* ============================================================================
   ENTRAR CON GOOGLE — quién eres, no qué token te tocó.

   Hasta septiembre de 2026 la puerta del puente era un token de dispositivo: tres cadenas
   que salían de la hoja y que alguien pegaba a mano en cada teléfono. Funcionaba, y tenía
   tres costos que se pagaban seguido:

     · Darle la app a alguien era una sesión de configuración, no un enlace.
     · Pegar el token equivocado daba el rol equivocado, y el síntoma —«la hoja me rechaza
       lo que escribo»— no se parece a la causa.
     · Perder un teléfono obligaba a rotar los TRES tokens y a repegarlos en los tres
       aparatos, porque se guardan juntos.

   Esto lo cambia por la identidad de Google. La persona entra con su cuenta, el puente
   recibe su token, lo verifica CONTRA GOOGLE y busca su correo en una lista que vive en la
   hoja. El rol sale de quién es, no de qué cadena le tocó.

   ── Lo que NO cambia, y es lo importante ───────────────────────────────────────
   La frontera de permisos sigue estando EN EL SERVIDOR. El Apps Script sigue decidiendo qué
   puede escribir cada rol y sigue rechazando con su razón. Lo único que cambia es cómo se
   averigua el rol. Si esto se hubiera hecho dándole a cada persona acceso directo a la hoja
   con su cuenta, la frontera habría desaparecido: quien puede escribir la hoja escribe
   CUALQUIER celda, y el teléfono de fabricación podría mover un anticipo.

   ── Por qué el token de dispositivo no se borra ────────────────────────────────
   Se queda como salida de emergencia, escondido en Ajustes. Entrar con Google necesita que
   Google conteste: si ese día hay un problema de consentimiento, la sesión caducó y no hay
   señal para renovarla, o el navegador de alguien bloquea la ventana, el teléfono se
   quedaría sin puente en mitad de una instalación. Una app que solo funciona cuando un
   tercero contesta bien no está terminada.

   ── Qué se guarda y qué no ─────────────────────────────────────────────────────
   El token de acceso se guarda en este aparato (`al3d_pf_gtok`) SOLO mientras vale —Google
   lo da por una hora— y se borra al salir. Antes vivía solo en memoria, y eso significaba
   que cada recarga volvía a abrir la ventana de Google: una app que te pide la cuenta cada
   vez que la abres no se siente como una app. Lo que sí sigue sin pasar es que viaje en un
   respaldo: esa clave no está en la lista de `RESPALDO_KEYS`. También se guarda el CORREO,
   que sirve para que la pantalla diga con quién estás dentro sin esperar a la red, y para
   decirle a Google qué cuenta renovar sin enseñar el selector de cuentas.

   ── La ventana de Google solo se abre si la persona acaba de tocar algo ────────
   Renovar el token con Google es abrir una ventana —se cierra sola si la cuenta ya está
   escogida, pero se ve—. Se renovaba también SIN que nadie tocara nada: al arrancar la
   comprobación del pase (js/nucleo/puerta.js) y en cada petición al puente
   (js/datos/puente.js). Con las ventanas emergentes permitidas para el sitio —cosa normal, es
   lo que Chrome ofrece la primera vez que se entra— eso significaba que al cerrar y abrir
   Chrome, con la plataforma restaurada en una pestaña de fondo, saltaba la ventana de cuentas
   de Google y se quitaba sola. Una pestaña que nadie está mirando no tiene por qué abrirle una
   ventana a nadie.

   Ahora `entrar(true)` —y con él `renovar()`— no abre nada si no hay un gesto reciente de la
   persona (`navigator.userActivation`, o `{gesto:true}` cuando quien llama sabe que viene de un
   clic). Sin gesto contesta `SIN_GESTO` en el acto y NO toca la red ni el guion de Google. Lo que
   no se renovó solo lo renueva el siguiente toque (app.js), que además da la vuelta a la hoja
   (`reconfirmar`).

   ── Dos fichas de Google, y cuál sirve para qué (2026-10-25) ───────────────────
   Lo de arriba es el token de ACCESO (`oauth2.initTokenClient`): es lo que la hoja verifica, y
   la hoja no se toca más (Elías, 2026-10-25: la empresa se va a Supabase). El botón de Google de
   la puerta da otra ficha, el token de IDENTIDAD (`google.accounts.id`, `botonDeIdentidad`), que
   es la que acepta Supabase. De ese token aquí solo se toma el CORREO (`anotarCredencial`): el
   token no se guarda como el del puente —la hoja lo rechazaría— ni en ningún almacenamiento;
   vive lo que dura la llamada y se va a Supabase (js/nucleo/supa.js, `entrarConCredencial`).
   ============================================================================ */

import * as Prefs from '../datos/prefs.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok  = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });
/* Una señal que corta la petición a los ms dados. AbortSignal.timeout no existe antes de Safari 16:
   ahí se pide sin tope, como siempre. */
export const conTope = ms => (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? AbortSignal.timeout(ms) : undefined;

const GIS = 'https://accounts.google.com/gsi/client';
/* Cuánto se espera a la ventana de Google antes de darse por vencido (ver el tope en `entrar`). Detrás
   puede haber una persona leyendo la pantalla de consentimiento por primera vez, con su contraseña y su
   segundo paso: dos minutos (auditoría 2026-10-26, T1-8). */
const MS_VENTANA = 120000;

/* Solo identidad. `openid email` son permisos NO SENSIBLES: Google no pide verificar la app
   para publicarlos, así que no sale la pantalla de «esta app no está verificada» ni hay tope
   de usuarios de prueba. El scope de Calendar sí es sensible, y por eso ése sigue pidiéndose
   aparte y solo en el aparato que crea los eventos. Pedir los dos juntos arrastraría a todo
   el equipo a una pantalla de consentimiento que no necesitan. */
const SCOPE = 'openid email';

/* El identificador de ESTA app ante Google —la web— creado el 20 de septiembre de 2026 en el
   proyecto «My First Project» de la cuenta de Elías, como cliente de tipo «Aplicación web»
   con orígenes autorizados `https://eliasgaribi-ctrl-z.github.io` y `https://cotizador-al3d.pages.dev`.

   NO es un secreto: viaja en cada petición y Google lo diseñó para ser público —por eso
   puede vivir en un repositorio público sin que eso sea una fuga—. Vive aquí, en el código,
   que es justo lo que quita la configuración por dispositivo: darle la app a alguien vuelve
   a ser mandarle el enlace.

   Google también emite un «secreto del cliente» al crearlo. NO se usa aquí y no debe usarse:
   una app que corre en el navegador no puede guardar un secreto, y el flujo que usa este
   archivo está diseñado sin él.

   ── Si cambia el dominio ───────────────────────────────────────────────────────
   El identificador NO cambia. Lo que hay que actualizar es el ORIGEN autorizado, del lado de
   Google (Clientes → este cliente → Orígenes autorizados de JavaScript), y se pueden tener
   varios a la vez: eso permite mudarse de dominio sin que deje de funcionar el viejo.

   ── Si algún día hay app de Android ────────────────────────────────────────────
   Va a necesitar su PROPIO identificador, de tipo Android, y este archivo se queda como
   está: la app web usa el suyo. Lo que hay que ampliar es la lista del lado de la hoja
   (`PUENTE_CLIENT_IDS` en puente/hoja-apps-script.gs), que es quien decide de qué apps
   acepta un token. Está escrito como lista justo por eso.

   Lo que NO vive aquí es la lista de quién es quién: los correos del equipo están en la
   hoja, no en un repositorio público, y así agregar a alguien es un renglón allá en vez de
   un despliegue. */
export const CLIENT_ID =
  '1057893837924-3np1vkcbpqmkh6sio0ktse00kd9b5ulr.apps.googleusercontent.com';

/* Los orígenes que están dados de alta en Google para CLIENT_ID. Es una copia de lo que dice
   la consola de Google (Clientes → este cliente → Orígenes autorizados de JavaScript), y
   existe por un solo motivo: desde cualquier otro origen, Google abre la ventana y la llena
   con «Acceso bloqueado: Error 400: origin_mismatch», que suena a que la app está rota o a
   que la cuenta no tiene permiso, y no es ninguna de las dos. Es que la app se abrió desde
   una dirección que no es la suya. Aquí se detecta ANTES de abrir la ventana y se dice cuál
   es la buena.

   Si se autoriza un origen nuevo en la consola —un dominio propio, por ejemplo— se agrega
   aquí también, o la app lo seguirá rechazando por su cuenta. Solo aplica al identificador
   del código: uno pegado en Ajustes trae sus propios orígenes, que esta lista no conoce. */
export const ORIGENES = ['https://eliasgaribi-ctrl-z.github.io',
                         'https://cotizador-al3d.pages.dev'];   // Cloudflare Pages
export const URL_APP = 'https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/';

/** true si desde `origen` Google va a aceptar CLIENT_ID. Sin origen (node, pruebas) no se
 *  juzga: no hay ventana que abrir. */
export function origenAutorizado(origen) {
  if (!origen) return true;
  return ORIGENES.includes(String(origen).replace(/\/+$/, '').toLowerCase());
}

const origenActual = () =>
  (typeof location !== 'undefined' && location && location.origin) || '';

const MSG = {
  SIN_CONFIG: 'Todavía no está puesto el identificador de Google de la app. Mientras tanto, el puente funciona con el token de este dispositivo.',
  SIN_RED: 'No hay señal para entrar con Google. Lo que hagas se guarda aquí y se manda solo cuando vuelva.',
  RECHAZADO: 'Google no dio permiso. Vuelve a darle a «Entrar con Google» y acepta la pantalla.',
  CERRADO: 'Cerraste la ventana de Google antes de elegir una cuenta. Vuelve a intentar cuando quieras.',
  /* El navegador tapó la ventana. Es el fallo que más se parece a «la app está rota» y el
     que menos lo es, así que dice dónde se arregla. Google avisa de esto por su
     `error_callback` y no por el callback normal: sin engancharlo, esto era una promesa que
     no resolvía nunca y una pantalla congelada en «Entrando…». */
  ORIGEN: origen => 'Google no deja entrar desde ' + (origen === 'null' ? 'un archivo abierto en el ordenador' : origen) +
    ': esa dirección no está autorizada para esta app. Abre la plataforma desde ' + URL_APP + ' y vuelve a intentar.',
  BLOQUEADA: 'Tu navegador bloqueó la ventana de Google. Busca el aviso de «ventana emergente bloqueada» —en Chrome sale a la derecha de la barra de direcciones—, permítelas para este sitio y vuelve a intentar.',
  SIN_GESTO: 'El permiso de Google se renueva con tu siguiente toque: sin él, la ventana de Google se abriría sola con la app en segundo plano.',
  /* La ventana que no regresó en MS_VENTANA (ver `entrar`). Dice qué hacer con ella y la salida que sí
     funciona en el iPhone con la app instalada, donde pasa (auditoría 2026-10-26, T1-8). */
  SIN_REGRESO: 'La ventana de Google no regresó a la app en dos minutos. Si sigue abierta, termina ahí o ciérrala, y vuelve a tocar el botón. En un iPhone con la app instalada en la pantalla de inicio esa ventana a veces no regresa: ábrela en Safari para esto.',
  /* El token de identidad del botón de Google no pasó la revisión de `leerCredencial`. Casi siempre es un
     reloj del teléfono muy desfasado o una pestaña que se quedó abierta con un botón viejo: volver a tocar
     lo arregla, y si no, el botón de la app (el de siempre) sigue ahí. */
  CREDENCIAL: 'Google contestó algo que la app no pudo leer. Vuelve a intentar.',
  CREDENCIAL_OTRA_APP: 'Google dio un permiso para otra app, no para ésta. Vuelve a intentar.',
  CREDENCIAL_SIN_VERIFICAR: 'Google dice que el correo de esa cuenta no está verificado. Verifícalo en tu cuenta de Google o entra con otra.',
  CREDENCIAL_VENCIDA: 'El permiso de Google ya venció (¿la hora del teléfono está bien?). Vuelve a intentar.',
};

/* El token de acceso, en memoria y nada más. Ver la cabecera. */
const K_TOK = 'al3d_pf_gtok';
let _tok = leerTok();     /* {token:string, expira:number} */

function leerTok() {
  try {
    const t = JSON.parse(localStorage.getItem(K_TOK) || 'null');
    return (t && typeof t.token === 'string' && Number(t.expira) > Date.now()) ? t : null;
  } catch (_) { return null; }
}
function guardarTok(t) {
  try { t ? localStorage.setItem(K_TOK, JSON.stringify(t)) : localStorage.removeItem(K_TOK); } catch (_) {}
}
let _correo = '';
let _cliente = null;
let _clienteDe = '';     /* el identificador con el que se creó `_cliente`. Ver `entrar()`. */
let _cargando = null;
/* El hueco donde cada llamada a `entrar()` deja su forma de rendirse, para que el
   `error_callback` del cliente —que se creó una sola vez— sepa a quién contestarle. */
let _fallo = () => {};

/** El identificador puesto: el del código, o el que alguien pegó en Ajustes para probar uno
 *  distinto antes de escribirlo aquí. El del aparato gana para poder migrar sin desplegar. */
export function clienteId() {
  const p = Prefs.ingreso();
  const propio = p && typeof p.clientId === 'string' ? p.clientId.trim() : '';
  return propio || CLIENT_ID;
}

/** true cuando hay con qué intentar entrar. Sin esto, Ajustes no pinta el botón. */
export const configurado = () => !!clienteId();

/** El correo con el que se entró, aunque el token ya haya caducado. '' si nunca se entró. */
export function correo() {
  if (_correo) return _correo;
  const p = Prefs.ingreso();
  return (p && typeof p.correo === 'string') ? p.correo : '';
}

/** true si hay un token vivo AHORA. Un token a punto de vencer se trata como vencido: uno
 *  que caduca en el vuelo vuelve como 401 y la persona ve un error de 40 segundos de reloj. */
export const dentro = () => !!(_tok && _tok.token && _tok.expira > Date.now());

/** true si la persona tocó algo hace un momento (la «activación transitoria» del navegador, unos
 *  cinco segundos). Es lo que deja abrir una ventana, y es lo que NO hay en una pestaña
 *  restaurada al abrir Chrome ni en un temporizador. Si el navegador no sabe decirlo, false: más
 *  vale no abrir una ventana que abrirla donde nadie mira. */
export function hayGesto() {
  try {
    return !!(typeof navigator !== 'undefined' && navigator.userActivation && navigator.userActivation.isActive);
  } catch (_) { return false; }
}

/** El token para mandarle al puente, o '' si no hay. Nunca lanza: quien llama decide qué
 *  hacer sin token, y lo que hace es caer al token de dispositivo. */
export const token = () => (dentro() ? _tok.token : '');

/* ----- Cargar el guion de Google -----
   `gcal.js` lo importa de aquí en vez de traer su propia copia: dos cargadores del mismo
   guion compiten por la misma etiqueta y, llamados a la vez, la añaden dos veces. */
export function cargarGis() {
  if (typeof window !== 'undefined' && window.google && window.google.accounts) {
    return Promise.resolve(true);
  }
  if (_cargando) return _cargando;
  _cargando = new Promise(resolve => {
    if (typeof document === 'undefined') return resolve(false);
    /* Si otra parte ya lo pidió, no se añade una segunda etiqueta: se espera a la que hay. */
    const ya = document.querySelector('script[data-gis]');
    if (ya) {
      ya.addEventListener('load', () => resolve(!!(window.google && window.google.accounts)));
      ya.addEventListener('error', () => { _cargando = null; resolve(false); });
      return;
    }
    const s = document.createElement('script');
    s.src = GIS; s.async = true; s.defer = true; s.dataset.gis = '1';
    s.onload = () => resolve(!!(window.google && window.google.accounts));
    /* `onerror` es el caso normal, no el raro: sin señal el guion no baja. Se resuelve
       false para que quien llama conteste SIN_RED con su mensaje. */
    s.onerror = () => { _cargando = null; resolve(false); };
    document.head.appendChild(s);
  });
  return _cargando;
}

/* ============================================================================
   EL TOKEN DE IDENTIDAD — el botón de Google (la puerta, la banda de arriba y Ajustes)
   ============================================================================ */

/** Huella SHA-256 en hexadecimal (lo que se le da a Google como nonce). Vive aquí y no en supa.js para
 *  que la puerta pinte el botón de Google sin cargar nada de Supabase antes del toque. */
export async function huella(texto) {
  const b = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function nonceNuevo() {
  const a = new Uint8Array(32); globalThis.crypto.getRandomValues(a);
  return [...a].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Pinta el botón de Google (`google.accounts.id`, un iframe suyo) en `caja`. Al tocarlo, Google da un
 * token de IDENTIDAD y `alCredencial` lo recibe con su nonce: `{credencial, crudo, nonce}` —a Google se le
 * dio `nonce`, la huella SHA-256 de `crudo`; a Supabase se le da `crudo`, así un token robado de otra
 * página no sirve—. Resuelve true si el botón se mandó pintar, false si no hay con qué (sin guion de
 * Google, sin señal, un navegador viejo) o si `caja` ya no está en la página.
 *
 * Es UNO para los tres botones de Google de la app (la puerta, la banda de arriba y Ajustes): antes cada
 * uno armaba su `initialize` y su nonce, y un arreglo en uno no llegaba a los otros.
 * @param {{clienteId?:string, aspecto?:Object}} [opc] `aspecto` se mezcla con lo de `renderButton`.
 */
export async function botonDeIdentidad(caja, alCredencial, opc = {}) {
  if (!await cargarGis()) return false;
  const g = globalThis.google && globalThis.google.accounts && globalThis.google.accounts.id;
  if (!g || typeof g.initialize !== 'function' || typeof g.renderButton !== 'function') return false;
  const crudo = nonceNuevo();
  const nonce = await huella(crudo);
  if (!caja || !caja.isConnected) return false;     // se repintó mientras tanto: el botón nuevo es de otro turno
  g.initialize({
    client_id: opc.clienteId || CLIENT_ID, nonce, auto_select: false, cancel_on_tap_outside: true, itp_support: true,
    use_fedcm_for_button: true,
    callback: resp => alCredencial({ credencial: (resp && resp.credential) || '', crudo, nonce }),
  });
  caja.innerHTML = '';
  g.renderButton(caja, Object.assign({ type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es' }, opc.aspecto || {}));
  return true;
}

/* El JWT de Google son tres trozos en base64url; el de en medio es lo que dice. atob() no entiende el
   alfabeto de URL ni la falta de relleno, y su resultado son bytes, no texto: un nombre con acento
   llegaría roto sin el TextDecoder. */
function cuerpoDelJwt(jwt) {
  const partes = String(jwt || '').split('.');
  if (partes.length !== 3 || !partes[1]) return null;
  let b = partes[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bytes = Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const j = JSON.parse(new TextDecoder().decode(bytes));
  return (j && typeof j === 'object' && !Array.isArray(j)) ? j : null;
}

/**
 * Lee el token de identidad que dio el botón de Google y dice si es para ESTA app, de un correo verificado
 * y todavía vivo. Devuelve `ok({correo, expira})` —la misma forma que `entrar()`— o `mal(...)`.
 *
 * Esto NO es la verificación de seguridad: la firma, el emisor y el nonce los comprueba Supabase al
 * cambiarlo por su sesión (`signInWithIdToken`), que es quien abre algo. Lo de aquí es para no anotar el
 * correo de un token que Supabase va a rechazar de todas formas, y para decirlo con palabras en vez de
 * con el error de la base: un token de otra app, un correo sin verificar, uno vencido (el reloj del
 * teléfono, casi siempre), o uno con otro nonce que el que se le dio a Google.
 * @param {{clienteId?:string, nonce?:string, ahora?:number}} [opc] `nonce`: la huella que se le dio a Google.
 */
export function leerCredencial(credencial, opc = {}) {
  let p = null;
  try { p = cuerpoDelJwt(credencial); } catch (_) { p = null; }
  if (!p) return mal('DATO_INVALIDO', MSG.CREDENCIAL);
  const id = opc.clienteId || clienteId();
  const aud = Array.isArray(p.aud) ? p.aud.map(String) : [String(p.aud || '')];
  if (!id || !aud.includes(id)) return mal('DATO_INVALIDO', MSG.CREDENCIAL_OTRA_APP);
  if (p.iss !== 'accounts.google.com' && p.iss !== 'https://accounts.google.com') return mal('DATO_INVALIDO', MSG.CREDENCIAL);
  if (p.email_verified !== true && p.email_verified !== 'true') return mal('DATO_INVALIDO', MSG.CREDENCIAL_SIN_VERIFICAR);
  const c = typeof p.email === 'string' ? p.email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+$/.test(c)) return mal('DATO_INVALIDO', MSG.CREDENCIAL);
  const expira = Number(p.exp) * 1000;
  if (!(expira > (opc.ahora || Date.now()))) return mal('DATO_INVALIDO', MSG.CREDENCIAL_VENCIDA);
  if (opc.nonce && p.nonce !== opc.nonce) return mal('DATO_INVALIDO', MSG.CREDENCIAL);
  return ok({ correo: c, expira });
}

/**
 * La puerta entró con el botón de Google: el correo de ese token queda como el de la puerta, igual que lo
 * deja `entrar()` —para la banda de la cuenta, para saber a quién renovarle el permiso de la hoja y para
 * que la vigilancia de Supabase sepa quién es la persona de este aparato—.
 *
 * El token NO se guarda como el del puente (`_tok`): es de identidad, no de acceso, y la hoja lo
 * rechazaría con «ese correo no está en Accesos». Tampoco va a ningún almacenamiento (ni localStorage ni
 * sessionStorage) ni a un respaldo. Si había un permiso de la hoja vivo de OTRA cuenta, se suelta: no es
 * de quien acaba de entrar.
 * @returns {Resultado} valor = {correo, expira}
 */
export function anotarCredencial(credencial, opc) {
  const r = leerCredencial(credencial, opc);
  if (!r.ok) return r;
  const c = r.valor.correo;
  const antes = correo();
  if (antes && antes.toLowerCase() !== c.toLowerCase()) { _tok = null; guardarTok(null); }
  _correo = c;
  try { Prefs.setIngreso({ ...(Prefs.ingreso() || {}), correo: c }); } catch (_) {}
  return ok({ correo: c, expira: r.valor.expira });
}

/**
 * Entra con Google. **Tiene que salir de un click**: Google abre una ventana y sin gesto de
 * la persona el navegador la bloquea como emergente.
 *
 * @param {boolean} [callado] true para renovar sin pantalla (`prompt:''`). Solo funciona si
 *        ya hubo un consentimiento antes y la sesión de Google de ese navegador sigue viva. Y
 *        solo se intenta con un gesto reciente de la persona: ver la cabecera.
 * @param {{gesto?:boolean}} [opc] `gesto:true` cuando quien llama sabe que viene de un toque y
 *        el navegador no expone `userActivation`.
 * @returns {Promise<Resultado>} valor = {correo, expira}
 */
export async function entrar(callado, opc) {
  const id = clienteId();
  if (!id) return mal('DATO_INVALIDO', MSG.SIN_CONFIG);
  if (dentro()) return ok({ correo: correo(), expira: _tok.expira });
  /* Antes de la red, del guion y de la ventana: sin un toque de la persona, renovar es abrir una
     ventana de Google en una pestaña que nadie mira. */
  if (callado && !(opc && opc.gesto) && !hayGesto()) return mal('SIN_GESTO', MSG.SIN_GESTO);

  /* Antes de la red y antes de la ventana: desde un origen que Google no conoce, lo único
     que la ventana puede enseñar es el error 400. Ver ORIGENES. */
  if (id === CLIENT_ID && !origenAutorizado(origenActual())) {
    return mal('DATO_INVALIDO', MSG.ORIGEN(origenActual()));
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return mal('SIN_RED', MSG.SIN_RED);
  }
  if (!await cargarGis()) return mal('SIN_RED', MSG.SIN_RED);

  const r = await new Promise(resolve => {
    /* Una sola salida, se llegue por donde se llegue: el token, el `error_callback` o el tope. El hueco
       `_fallo` solo se vacía si sigue siendo de ESTA llamada: el tope de una vieja no le quita el suyo a
       la que vino después. */
    let tope = 0;
    const fin = x => { clearTimeout(tope); if (_fallo === fin) _fallo = () => {}; resolve(x); };
    /* Un solo cliente mientras no cambie el identificador, por lo mismo que en `gcal.js`:
       crear uno por petición deja retrollamadas viejas colgando y el token acaba llegando a la
       que ya nadie espera. Se creaba UNA vez con el identificador de ese momento, así que
       pegar otro en Ajustes —que es para lo que existe ese campo: probar uno antes de
       escribirlo aquí— no surtía efecto hasta recargar, y la ventana seguía saliendo con el
       de antes. */
    if (!_cliente || _clienteDe !== id) {
      try {
        _cliente = window.google.accounts.oauth2.initTokenClient({
          client_id: id, scope: SCOPE, callback: () => {},
          /* `error_callback` es un camino APARTE del callback normal, y hay que engancharlo:
             la ventana que el navegador bloquea y la que la persona cierra no llegan por el
             callback de arriba. Sin esto, las dos eran una promesa que no resolvía nunca — y
             lo que se ve desde fuera es un botón que se queda en «Entrando…» para siempre. */
          error_callback: err => {
            const t = (err && err.type) || '';
            if (t === 'popup_failed_to_open') return _fallo(mal('SIN_RED', MSG.BLOQUEADA));
            if (t === 'popup_closed') return _fallo(mal('DATO_INVALIDO', MSG.CERRADO));
            return _fallo(mal('SIN_RED', MSG.SIN_RED));
          },
        });
        _clienteDe = id;
      } catch (_) {
        _cliente = null; _clienteDe = '';
        return fin(mal('DATO_INVALIDO', MSG.RECHAZADO));
      }
    }
    /* El cliente es uno solo para toda la pestaña, así que su `error_callback` se creó una
       vez y no puede cerrar sobre el `resolve` de ESTA llamada. Se apunta a un hueco que
       cada llamada rellena con el suyo, igual que se hace con `callback` justo abajo. */
    _fallo = fin;
    /* ── El tope (auditoría 2026-10-26, T1-8) ──────────────────────────────────────────────
       Hay un cuarto camino que no avisa por ninguno de los otros: la ventana que no regresa. En un iPhone
       con la app instalada en la pantalla de inicio, la ventana de Google se abre aparte y a veces nunca
       le contesta a la app; la promesa no resolvía y el botón que la esperaba —«Sellando…» del notario,
       «Entrando…» de Ajustes, cualquier botón que pide el permiso de la hoja (js/datos/puente.js,
       `permisoDelToque`)— giraba para siempre. Es el mismo arreglo que ya tenía gcal.js. Más corto que el
       de la puerta (MS_CON_PANTALLA, tres minutos, en puerta.js), que espera esto y algo más: un tope de
       afuera tiene que ser más largo que el de adentro. Cuenta como un «no» (DATO_INVALIDO): lo de fondo
       no vuelve a abrir una ventana que no regresó. Y un token que llega DESPUÉS del tope se guarda igual
       (el callback de abajo lo escribe aunque la promesa ya haya contestado): el siguiente toque lo
       encuentra vivo. */
    tope = setTimeout(() => fin(mal('DATO_INVALIDO', MSG.SIN_REGRESO)), MS_VENTANA);
    _cliente.callback = resp => {
      if (!resp || !resp.access_token) {
        const cerrada = resp && (resp.error === 'access_denied' || resp.error === 'popup_closed');
        return fin(mal(cerrada ? 'DATO_INVALIDO' : 'SIN_RED',
          cerrada ? MSG.CERRADO : MSG.SIN_RED));
      }
      const seg = Number(resp.expires_in) > 0 ? Number(resp.expires_in) : 3600;
      _tok = { token: resp.access_token, expira: Date.now() + (seg - 60) * 1000 };
      guardarTok(_tok);
      fin(ok({ expira: _tok.expira }));
    };
    try {
      /* `login_hint` con el correo de la vez pasada: Google escoge esa cuenta sola y no
         enseña el selector —en un navegador con tres cuentas, el selector era lo que hacía
         sentir que había que entrar cada vez—. */
      const pista = correo();
      const op = callado ? { prompt: '' } : {};
      if (pista) op.login_hint = pista;
      _cliente.requestAccessToken(op);
    } catch (_) {
      fin(mal('SIN_RED', MSG.SIN_RED));
    }
  });
  if (!r.ok) return r;

  /* El correo se pregunta UNA vez por token y se guarda. Se pregunta aquí y no del lado de
     la hoja para que la pantalla pueda decir con quién estás dentro sin depender del puente:
     el ingreso y el puente son dos cosas y una puede estar bien con la otra caída. */
  const c = await preguntarCorreo(_tok.token);
  if (c) {
    _correo = c;
    try { Prefs.setIngreso({ ...(Prefs.ingreso() || {}), correo: c }); } catch (_) {}
  }
  return ok({ correo: _correo, expira: _tok.expira });
}

/** Renueva sin pantalla. Se llama al arrancar, y falla en silencio a propósito: que no se
 *  pueda renovar no es un error que mostrar, es el día en que se entra a mano. Sin un gesto
 *  reciente de la persona no abre nada y contesta `SIN_GESTO` (ver la cabecera).
 *  @param {{gesto?:boolean}} [opc] ver `entrar()`. */
export async function renovar(opc) {
  if (dentro()) return ok({ correo: correo(), expira: _tok.expira });
  if (!correo()) return mal('DATO_INVALIDO', MSG.SIN_CONFIG);   // nunca entró: no hay qué renovar
  return await entrar(true, opc);
}

async function preguntarCorreo(tok) {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tok },
      signal: conTope(10000),   // la puerta espera esta respuesta: colgada, nadie entra
    });
    if (!r.ok) return '';
    const j = await r.json();
    return (j && typeof j.email === 'string' && j.email_verified !== false) ? j.email : '';
  } catch (_) { return ''; }
}

/** Suelta la sesión de ESTE aparato. No revoca el consentimiento —eso se hace en la cuenta
 *  de Google— y la pantalla lo dice con esas palabras. */
export function salir() {
  _tok = null;
  guardarTok(null);
  _correo = '';
  try { Prefs.setIngreso({ ...(Prefs.ingreso() || {}), correo: '' }); } catch (_) {}
}
