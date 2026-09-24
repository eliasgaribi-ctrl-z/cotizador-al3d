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
   ============================================================================ */

import * as Prefs from '../datos/prefs.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok  = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

const GIS = 'https://accounts.google.com/gsi/client';

/* Solo identidad. `openid email` son permisos NO SENSIBLES: Google no pide verificar la app
   para publicarlos, así que no sale la pantalla de «esta app no está verificada» ni hay tope
   de usuarios de prueba. El scope de Calendar sí es sensible, y por eso ése sigue pidiéndose
   aparte y solo en el aparato que crea los eventos. Pedir los dos juntos arrastraría a todo
   el equipo a una pantalla de consentimiento que no necesitan. */
const SCOPE = 'openid email';

/* El identificador de ESTA app ante Google —la web— creado el 20 de septiembre de 2026 en el
   proyecto «My First Project» de la cuenta de Elías, como cliente de tipo «Aplicación web»
   con origen autorizado `https://eliasgaribi-ctrl-z.github.io`.

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
  CERRADO: 'Se cerró la ventana de Google sin entrar.',
  /* El navegador tapó la ventana. Es el fallo que más se parece a «la app está rota» y el
     que menos lo es, así que dice dónde se arregla. Google avisa de esto por su
     `error_callback` y no por el callback normal: sin engancharlo, esto era una promesa que
     no resolvía nunca y una pantalla congelada en «Entrando…». */
  ORIGEN: origen => 'Google no deja entrar desde ' + (origen === 'null' ? 'un archivo abierto en el ordenador' : origen) +
    ': esa dirección no está autorizada para esta app. Abre la plataforma desde ' + URL_APP + ' y vuelve a intentar.',
  BLOQUEADA: 'Tu navegador bloqueó la ventana de Google. Busca el aviso de «ventana emergente bloqueada» —en Chrome sale a la derecha de la barra de direcciones—, permítelas para este sitio y vuelve a intentar.',
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

/**
 * Entra con Google. **Tiene que salir de un click**: Google abre una ventana y sin gesto de
 * la persona el navegador la bloquea como emergente.
 *
 * @param {boolean} [callado] true para renovar sin pantalla (`prompt:''`). Solo funciona si
 *        ya hubo un consentimiento antes y la sesión de Google de ese navegador sigue viva.
 * @returns {Promise<Resultado>} valor = {correo, expira}
 */
export async function entrar(callado) {
  const id = clienteId();
  if (!id) return mal('DATO_INVALIDO', MSG.SIN_CONFIG);
  if (dentro()) return ok({ correo: correo(), expira: _tok.expira });

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
    /* Un solo cliente para toda la vida de la pestaña, por lo mismo que en `gcal.js`: crear
       uno por petición deja retrollamadas viejas colgando y el token acaba llegando a la que
       ya nadie espera. */
    if (!_cliente) {
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
      } catch (_) {
        return resolve(mal('DATO_INVALIDO', MSG.RECHAZADO));
      }
    }
    /* El cliente es uno solo para toda la pestaña, así que su `error_callback` se creó una
       vez y no puede cerrar sobre el `resolve` de ESTA llamada. Se apunta a un hueco que
       cada llamada rellena con el suyo, igual que se hace con `callback` justo abajo. */
    _fallo = r => { _fallo = () => {}; resolve(r); };
    _cliente.callback = resp => {
      _fallo = () => {};          // contestó por aquí: el otro camino ya no tiene a quién
      if (!resp || !resp.access_token) {
        const cerrada = resp && (resp.error === 'access_denied' || resp.error === 'popup_closed');
        return resolve(mal(cerrada ? 'DATO_INVALIDO' : 'SIN_RED',
          cerrada ? MSG.CERRADO : MSG.SIN_RED));
      }
      const seg = Number(resp.expires_in) > 0 ? Number(resp.expires_in) : 3600;
      _tok = { token: resp.access_token, expira: Date.now() + (seg - 60) * 1000 };
      guardarTok(_tok);
      resolve(ok({ expira: _tok.expira }));
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
      resolve(mal('SIN_RED', MSG.SIN_RED));
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
 *  pueda renovar no es un error que mostrar, es el día en que se entra a mano. */
export async function renovar() {
  if (dentro()) return ok({ correo: correo(), expira: _tok.expira });
  if (!correo()) return mal('DATO_INVALIDO', MSG.SIN_CONFIG);   // nunca entró: no hay qué renovar
  return await entrar(true);
}

async function preguntarCorreo(tok) {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tok },
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
