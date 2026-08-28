/* ============================================================================
   GOOGLE CALENDAR — FASE 2.

   EL HALLAZGO QUE CAMBIÓ LA ARQUITECTURA, y va aquí porque es donde se va a leer:

     EN GOOGLE CALENDAR LOS RECORDATORIOS SON POR USUARIO, NO POR EVENTO.
     `reminders.overrides` aplica a la copia del evento del DUEÑO del calendario. Quien
     tiene acceso de lectura a un calendario compartido NO los hereda: ve el evento y no
     le suena nada. Un `attendee`, en cambio, tiene su propia copia en su propio
     calendario, y en su copia los overrides sí valen.

   Por eso los eventos NO viven en un calendario compartido: se crean desde el dispositivo
   de DIRECCIÓN, en el calendario de Dirección, con las tres personas como `attendees`.
   Es un solo consentimiento OAuth que sostener —el del director— en vez de tres, y es la
   única forma de que al instalador le suene el teléfono a las 7 de la mañana.

   La consecuencia operativa, dicha sin adornos: si el director no abre la plataforma, no
   se crea el evento. Es la razón de que el `.ics` de Fase 1 no se retire nunca: ese se
   genera en el dispositivo, sin cuenta y sin señal, y las alarmas las dispara el
   calendario del teléfono.

   CÓMO SE AUTENTICA, y por qué así:
   Google Identity Services, **token model** (no el code model). OAuth Client ID de tipo
   **Web**, con el origen de GitHub Pages en *Authorized JavaScript origins*. Scope
   `calendar.events` y ninguno más. Publishing status **Testing**: tope de 100 test users
   y aquí son tres, así que no hay verificación que pasar ni app que publicar. Sin secreto
   de cliente y **sin refresh token en el navegador**: el token vive ~1 h en memoria y se
   renueva con `prompt:''`, silencioso si hay sesión de Google viva.

   El token NO se guarda en localStorage. Un token de escritura sobre el calendario que
   sobrevive a la pestaña es un token que acaba en un respaldo mandado por WhatsApp, y ya
   hay un precedente exacto de eso en este proyecto con la API key de la IA.

   Y EL SCRIPT DE GIS NO SE CARGA EN EL ARRANQUE. Se carga la primera vez que alguien pide
   token, desde un click. Un `<script>` de otro origen al abrir es una petición de red en
   una app que tiene que abrir en la calle sin señal: sin GIS diferido, la plataforma
   tardaría en pintar por una cuenta que el 90 % de las aperturas no va a usar.
   ============================================================================ */

import * as Prefs from '../datos/prefs.js';

/** @typedef {{ok:true, valor:*}|{ok:false, codigo:string, mensaje:string}} Resultado */
const ok  = valor => ({ ok: true, valor });
const mal = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

const GIS = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3/calendars/';

const MSG = {
  SIN_CONFIG: 'Todavía no está conectado Google Calendar. Descarga el archivo .ics y ábrelo: eso ya funciona hoy.',
  SIN_RED: 'No hay señal. Descarga el .ics y mándalo por WhatsApp, o vuelve a intentar cuando tengas.',
  ROL: 'Los eventos del calendario los crea el dispositivo de Dirección. Desde aquí descarga el .ics.',
  SIN_TOKEN: 'Google no dio permiso. Vuelve a darle a Conectar y acepta la pantalla.',
  RECHAZADO: 'Google rechazó el evento. Revisa el Client ID en Ajustes.',
};

/* El token vive en memoria y nada más. `expira` con un minuto de colchón: un token que
   vence en el vuelo devuelve 401 y el usuario ve un error por 40 segundos de reloj. */
let _tok = null;         /* {token:string, expira:number} */
let _cliente = null;     /* el tokenClient de GIS, se crea una vez */
/* El sello de la petición en curso. `_cliente` es único para toda la pestaña y sus manejadores
   se sobrescriben en cada petición, así que sin esto un evento tardío de una petición ya
   muerta cae sobre la promesa nueva: la respuesta del intento que el usuario abandonó resuelve
   el que acaba de empezar. Pasa de verdad — `llamar()` pide token en CADA operación del
   calendario, y en un teléfono se toca dos veces lo que no responde a la primera. */
let _gen = 0;
let _alError = null;     /* el error_callback de la petición en curso, despachado desde el config */
let _cargando = null;    /* la promesa de carga del script, para no meter dos <script> */
let _correo = '';

/* ---------------------------------------------------------------------------
   CONFIGURACIÓN
   --------------------------------------------------------------------------- */

/** La configuración pegada en Ajustes: {clientId, calendarioId, invitados?}.
 *  `invitados` va dentro de la misma clave `al3d_pf_gcal` y no en una décima clave de
 *  localStorage: §4.2 congeló nueve y agregar una a espaldas del documento es cómo se
 *  pierde un contrato. Son los correos de las tres personas, y sin ellos el evento se
 *  crea pero no le suena a nadie más que al director, que es justo lo que no queremos. */
function cfg() {
  const g = Prefs.gcal() || {};
  return {
    clientId: String(g.clientId || '').trim(),
    calendarioId: String(g.calendarioId || 'primary').trim() || 'primary',
    invitados: Array.isArray(g.invitados) ? g.invitados.filter(Boolean) : [],
  };
}

/** false en Fase 1 y en cualquier dispositivo sin Client ID pegado. Cuando es false la
 *  interfaz ofrece el .ics, que sí funciona hoy, y no un botón muerto. */
export function disponible() {
  return !!cfg().clientId;
}

/** true cuando además hay token vivo en esta pestaña. Es lo que decide si Ajustes pinta
 *  «Conectado como …» o el botón de conectar. */
export function conectado() {
  return !!(_tok && _tok.token && _tok.expira > Date.now());
}

/** El correo con el que se consintió, si se alcanzó a saber. Vacío no es error: el token
 *  model no devuelve identidad, así que esto solo se llena si un evento ya contestó con
 *  su `creator.email`. Pedir `openid email` solo para pintar un correo sería pedir un
 *  scope más en una pantalla de consentimiento que ya asusta. */
export function correo() { return _correo; }

/* ---------------------------------------------------------------------------
   EL TOKEN
   --------------------------------------------------------------------------- */

function cargarGis() {
  if (typeof window !== 'undefined' && window.google && window.google.accounts) {
    return Promise.resolve(true);
  }
  if (_cargando) return _cargando;
  _cargando = new Promise(resolve => {
    if (typeof document === 'undefined') return resolve(false);
    const s = document.createElement('script');
    s.src = GIS; s.async = true; s.defer = true;
    s.onload = () => resolve(!!(window.google && window.google.accounts));
    /* onerror es el caso normal, no el raro: sin señal el script no baja. Se resuelve
       false en vez de rechazar para que el llamador conteste SIN_RED con su mensaje y no
       tenga que envolver esto en un try. */
    s.onerror = () => { _cargando = null; resolve(false); };
    document.head.appendChild(s);
  });
  return _cargando;
}

/**
 * Pide (o renueva) el token de acceso. **Tiene que salir de un click**: `requestAccessToken`
 * abre una ventana, y sin gesto del usuario el navegador la bloquea como popup.
 *
 * @param {boolean} [silencioso] true para renovar sin pantalla (`prompt:''`). Solo
 *        funciona si ya hubo un consentimiento antes y la sesión de Google está viva.
 * @returns {Promise<Resultado>} valor = {expira}. **El token no sale de aquí**, y es a
 *          propósito: esta función está exportada, así que cualquier módulo del origen
 *          podía pedirle un Bearer con alcance sobre TODOS los calendarios del director
 *          con una línea. Nadie lo necesitaba —`llamar()` usa `_tok.token` del ámbito de
 *          este módulo, no lo que la promesa devuelve, y `conectar()` solo mira `ok`—, así
 *          que devolverlo era regalar la credencial sin que nada a cambio la pidiera.
 */
export async function pedirToken(silencioso) {
  const c = cfg();
  if (!c.clientId) return mal('DATO_INVALIDO', MSG.SIN_CONFIG);
  if (conectado()) return ok({ expira: _tok.expira });

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return mal('SIN_RED', MSG.SIN_RED);
  }
  if (!await cargarGis()) return mal('SIN_RED', MSG.SIN_RED);

  return new Promise(resolve => {
    /* Esta promesa tenía DOS caminos de salida y hacían falta cuatro. Los que faltaban no
       daban un error: dejaban la promesa colgada para siempre, y una promesa colgada aquí
       es un botón que no hace absolutamente nada al tocarlo —ni error, ni aviso, ni el
       `.ics` de respaldo, que es el camino que sí funciona sin cuenta—. La persona lo toca
       otra vez, y otra, y concluye que el botón no sirve.
       `resuelto` está porque ahora hay cuatro caminos y el primero que llegue manda: GIS
       puede llamar al callback justo cuando el reloj ya venció. */
    const mio = ++_gen;
    let resuelto = false;
    const salir = r => { if (resuelto) return; resuelto = true; clearTimeout(reloj); resolve(r); };
    /* El tope duro, y son DOS topes porque son dos situaciones que no se parecen en nada.
       Uno solo de treinta segundos cortaba el consentimiento de verdad: la primera vez que
       alguien conecta Google hay que elegir cuenta, escribir contraseña, quizá pasar el
       segundo factor, y encima la pantalla de «Google no ha verificado esta app» con su
       *Configuración avanzada → Ir a (no seguro)*, que en este proyecto sale SIEMPRE porque el
       proyecto se queda en «Testing» a propósito. En un teléfono viejo con 3G eso son minutos.
       A los treinta segundos la pantalla decía «no hay señal» y descartaba el permiso que la
       persona estaba dando en ese momento.

       Silencioso: treinta segundos. Ahí no hay ventana ni nadie tecleando, así que un cuelgue
       es literalmente un botón muerto y cuanto antes se diga, mejor.
       Interactivo: cinco minutos. No es para que alguien espere cinco minutos —para eso está
       `error_callback`, que es quien avisa de lo que de verdad falla— sino para que una
       promesa colgada no se quede colgada para siempre en la pestaña. */
    const TOPE = silencioso ? 30000 : 300000;
    const reloj = setTimeout(() => salir(mal('SIN_RED', silencioso ? MSG.SIN_RED : MSG.SIN_TOKEN)), TOPE);

    /* Un solo tokenClient para toda la vida de la pestaña. Crear uno por petición deja
       callbacks viejos colgando y el token acaba llegando al callback de la petición
       anterior, que ya nadie está esperando. */
    if (!_cliente) {
      try {
        _cliente = window.google.accounts.oauth2.initTokenClient({
          client_id: c.clientId, scope: SCOPE, callback: () => {},
          /* `error_callback` va AQUÍ, en el config, y no colgado del cliente después. GIS lo
             documenta como miembro de TokenClientConfig —o sea del objeto que recibe
             `initTokenClient`— y solo `callback` está documentado como reasignable sobre el
             cliente devuelto. Colgarlo como propiedad dependía de que GIS lo releyera, que no
             está escrito en ninguna parte; el despachador de módulo hace lo mismo por el
             camino documentado. */
          error_callback: e => { if (_alError) _alError(e); },
        });
      } catch (_) {
        return salir(mal('DATO_INVALIDO', MSG.RECHAZADO));
      }
    }
    /* El callback se reasigna en cada petición porque es el único punto donde GIS
       entrega el token: no hay promesa que await-ear en su API. */
    _cliente.callback = resp => {
      if (!resp || !resp.access_token) {
        /* De una petición vieja: no resuelve nada, y no hay token que guardar. */
        if (mio !== _gen) return;
        return salir(mal('SIN_RED', resp && resp.error === 'access_denied'
          ? MSG.SIN_TOKEN : MSG.SIN_RED));
      }
      const seg = Number(resp.expires_in) > 0 ? Number(resp.expires_in) : 3600;
      /* El token SÍ se guarda aunque llegue tarde: es válido una hora y `conectado()` lo va a
         encontrar en la siguiente llamada. Lo que no puede hacer un evento tardío es resolver
         una promesa que no es suya. */
      _tok = { token: resp.access_token, expira: Date.now() + (seg - 60) * 1000 };
      if (mio !== _gen) return;
      salir(ok({ expira: _tok.expira }));
    };
    /* `error_callback` es por donde GIS reporta lo que NO es un rechazo de OAuth, y el caso
       que se ve en la calle es `popup_failed_to_open`: bajar el script de GIS con mala señal
       puede tardar más que los segundos que el navegador conserva la activación del clic, y
       entonces el emergente se bloquea. Sin esta línea eso no llamaba a nada. Se reasigna en
       cada petición por el mismo motivo que el callback. */
    _alError = () => { if (mio === _gen) salir(mal('SIN_RED', MSG.SIN_TOKEN)); };
    try {
      _cliente.requestAccessToken(silencioso ? { prompt: '' } : {});
    } catch (_) {
      salir(mal('SIN_RED', MSG.SIN_RED));
    }
  });
}

/** Alias de `pedirToken()` sin argumentos. §5.12 la nombró `conectar` y devuelve el
 *  correo cuando se sabe; las dos existen porque renombrar una firma a mitad de una
 *  construcción en paralelo rompe al que ya la importó. */
export async function conectar() {
  const r = await pedirToken(false);
  return r.ok ? ok({ email: _correo }) : r;
}

/** Suelta el token de esta pestaña. No revoca el consentimiento —eso se hace en la cuenta
 *  de Google— y la pantalla lo dice así: «desconectado de este teléfono». */
export function desconectar() { _tok = null; }

/* ---------------------------------------------------------------------------
   EL ID DETERMINISTA
   --------------------------------------------------------------------------- */

/* Google exige que el `id` de un evento sea base32hex: solo `0-9a-v`, y entre 5 y 1024
   caracteres. Un uuid con guiones lo rechaza con 400, y un id de la plataforma como
   'inst-l3k9x2-a7f' trae guiones y letras arriba de la 'v'.

   El id tiene que ser DETERMINISTA y derivado del id de la instalación, no aleatorio:
   es lo único que hace que reinsertar sea idempotente. Sin eso, un reintento tras un
   timeout crea un segundo evento, el instalador ve la instalación dos veces en su
   teléfono y no hay forma de saber cuál cancelar. */
const B32 = '0123456789abcdefghijklmnopqrstuv';

/** Cualquier identificador de la plataforma -> un id de evento que Google acepta.
 *  Mismo texto, mismo id, siempre. */
export function idDeterminista(identificador) {
  const raw = String(identificador == null ? '' : identificador).trim().toLowerCase();
  if (!raw) return '';
  /* Idempotente. Sin esto, el 409 que reintenta con `moverEvento(body.id, …)` volvería a
     transformar un id ya transformado y saldría 'al3dal3d…': otro id, otro evento, y la
     instalación duplicada en el teléfono del instalador, que es justo lo que el id
     determinista existe para evitar. Un id que ya salió de aquí se devuelve tal cual. */
  if (raw.startsWith('al3d') && raw.length >= 5 && !/[^0-9a-v]/.test(raw)) return raw;
  /* Se transforma carácter por carácter y no se recorta a lo que ya era válido: dos ids
     que solo difieren en un guion tienen que dar ids distintos, y filtrar los caracteres
     inválidos los volvería iguales. */
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (B32.includes(ch)) { out += ch; continue; }
    const n = raw.charCodeAt(i);
    out += B32[(n >> 5) & 31] + B32[n & 31];
  }
  out = 'al3d' + out;
  /* El tope de 1024 no se alcanza con nada que salga de la plataforma, pero un id que se
     pase se rechaza con 400 y el evento no se crea nunca, en silencio. */
  return out.slice(0, 1024);
}

/* ---------------------------------------------------------------------------
   LOS EVENTOS
   --------------------------------------------------------------------------- */

/* Zona horaria explícita en cada fecha. Sin `timeZone`, Google interpreta el texto en la
   zona del CALENDARIO, y si el director viaja o el calendario quedó en otra zona, la
   instalación de las 10:00 aparece a otra hora en el teléfono del instalador. */
const TZ = 'America/Mexico_City';

/* Las mismas tres alarmas del .ics, y el mismo razonamiento: -3d para revisar material,
   -1d para confirmar con el cliente, -30min para salir. Google acepta como máximo 5
   overrides por evento y el mínimo es 0 minutos, así que las tres caben de sobra.
   `useDefault:false` es obligatorio: con true, Google ignora los overrides y pone los
   del calendario de cada quien, que en un teléfono nuevo es «10 minutos antes». */
const ALARMAS = [
  { method: 'popup', minutes: 3 * 24 * 60 },
  { method: 'popup', minutes: 24 * 60 },
  { method: 'popup', minutes: 30 },
];

function fechas(ev) {
  const conHora = /^(\d{1,2}):(\d{2})$/.test(String(ev.hora || ''));
  if (!conHora) {
    /* Evento de día completo. `end.date` es EXCLUSIVO en la API igual que el DTEND del
       .ics: con la misma fecha en los dos, Google devuelve 400. */
    return { start: { date: ev.fecha }, end: { date: masUnDia(ev.fecha) } };
  }
  const dur = Number(ev.duracion_min) > 0 ? Number(ev.duracion_min) : 180;
  const [h, mi] = String(ev.hora).split(':').map(Number);
  const fin = h * 60 + mi + dur;
  return {
    start: { dateTime: `${ev.fecha}T${p2(h)}:${p2(mi)}:00`, timeZone: TZ },
    end: fin < 1440
      ? { dateTime: `${ev.fecha}T${p2(Math.floor(fin / 60))}:${p2(fin % 60)}:00`, timeZone: TZ }
      /* Una instalación de noche que se pasa de medianoche se corta a las 23:59 del mismo
         día. Nunca ha pasado, y si pasa es mejor un evento que termina raro que un 400 que
         deja al instalador sin evento. */
      : { dateTime: `${ev.fecha}T23:59:00`, timeZone: TZ },
  };
}

const p2 = n => String(n).padStart(2, '0');

/* Suma un día sobre los campos, sin Date. `new Date('2026-08-23')` se interpreta como
   UTC y en México devuelve el 22: es el error que más veces se ha metido en este
   proyecto y por eso no hay un solo `new Date(iso)` en todo el archivo. */
function masUnDia(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return iso;
  let a = +m[1], me = +m[2], d = +m[3] + 1;
  const bis = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const largo = me === 2 ? (bis ? 29 : 28) : ([4, 6, 9, 11].includes(me) ? 30 : 31);
  if (d > largo) { d = 1; if (++me > 12) { me = 1; a++; } }
  return `${a}-${p2(me)}-${p2(d)}`;
}

function cuerpo(ev) {
  const c = cfg();
  return {
    id: idDeterminista(ev.uid || ev.id),
    summary: String(ev.summary || 'Instalación'),
    description: String(ev.description || ''),
    location: String(ev.location || ''),
    ...fechas(ev),
    /* Las tres personas. Es la razón entera de que el creador sea uno solo: cada attendee
       tiene su propia copia del evento, y en su copia estas alarmas sí valen. */
    attendees: (Array.isArray(ev.attendees) && ev.attendees.length
      ? ev.attendees
      : c.invitados).map(e => (typeof e === 'string' ? { email: e } : e)),
    reminders: { useDefault: false, overrides: ALARMAS },
    /* Sin esto, mover un evento le manda un correo a los tres cada vez. Con esto, les
       llega la actualización al calendario y nada más. */
    guestsCanModify: false,
    status: ev.estado === 'cancelada' ? 'cancelled' : 'confirmed',
  };
}

/* Solo DIRECCIÓN crea eventos, y no es una restricción de seguridad: el rol se cambia en
   Ajustes con dos toques. Es que el token es el del director y el evento tiene que salir
   de su calendario para que los attendees hereden alarmas. Desde otro rol el botón que
   sirve es el del .ics, y decirlo es más útil que esconder el botón. */
function puedeEscribir() {
  return Prefs.rol() === 'direccion';
}

async function llamar(ruta, opciones) {
  const t = await pedirToken(true);
  if (!t.ok) return t;
  const c = cfg();
  try {
    const r = await fetch(API + encodeURIComponent(c.calendarioId) + '/events' + ruta, {
      ...opciones,
      headers: {
        Authorization: 'Bearer ' + _tok.token,
        'Content-Type': 'application/json',
        ...(opciones && opciones.headers),
      },
    });
    const texto = await r.text();
    let j = null;
    try { j = texto ? JSON.parse(texto) : null; } catch (_) { j = null; }
    return { ok: true, valor: { http: r.status, cuerpo: j } };
  } catch (_) {
    /* Un fetch que lanza aquí es señal, CORS o el token vencido en el vuelo. Los tres se
       ven igual desde el navegador y los tres se arreglan reintentando, así que se dice
       lo único cierto y accionable: no hay señal, usa el .ics. */
    return mal('SIN_RED', MSG.SIN_RED);
  }
}

/**
 * Crea el evento. Idempotente por el `id` determinista.
 *
 * Un 409 se trata como «ya estaba» SOLO si un GET confirma que existe y no está
 * cancelado. Sin esa confirmación, el 409 tapa el caso real que muerde: Google conserva
 * los ids de los eventos borrados y devuelve 409 para un id que ya se usó y se canceló.
 * Tratar ese 409 como éxito dejaría la instalación reagendada sin evento, con la
 * plataforma diciendo que sí lo hay.
 *
 * @returns {Promise<Resultado>} valor = {eventId, yaEstaba?:true}
 */
export async function crearEvento(ev) {
  if (!disponible()) return mal('DATO_INVALIDO', MSG.SIN_CONFIG);
  if (!puedeEscribir()) return mal('ROL_SIN_PERMISO', MSG.ROL);
  if (!ev || !/^\d{4}-\d{2}-\d{2}$/.test(String(ev.fecha || ''))) {
    return mal('DATO_INVALIDO', 'Falta la fecha de la instalación.');
  }

  const body = cuerpo(ev);
  if (!body.id) return mal('DATO_INVALIDO', 'Falta el identificador de la instalación.');

  /* sendUpdates=all: si los tres no reciben la invitación, el evento no está en su
     calendario y las alarmas no existen para ellos. Es el punto entero del diseño. */
  const r = await llamar('?sendUpdates=all', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) return r;

  const { http, cuerpo: resp } = r.valor;
  if (http >= 200 && http < 300) {
    if (resp && resp.creator && resp.creator.email) _correo = resp.creator.email;
    return ok({ eventId: (resp && resp.id) || body.id });
  }

  if (http === 409) {
    const g = await llamar('/' + encodeURIComponent(body.id), { method: 'GET' });
    if (!g.ok) return g;
    const ya = g.valor.cuerpo;
    if (g.valor.http >= 200 && g.valor.http < 300 && ya && ya.status !== 'cancelled') {
      return ok({ eventId: ya.id, yaEstaba: true });
    }
    /* Existe cancelado: se revive con un PUT en vez de inventar otro id, porque el id
       determinista es lo que hace que la próxima vez tampoco se duplique. */
    return moverEvento(body.id, ev);
  }

  if (http === 401 || http === 403) {
    _tok = null;
    return mal('ROL_SIN_PERMISO',
      'Google no dejó escribir en el calendario. Vuelve a darle a Conectar y acepta el permiso de calendario.');
  }
  return mal('SIN_RED', MSG.RECHAZADO);
}

/**
 * Mueve o reescribe el evento completo. PUT y no PATCH a propósito: una instalación
 * reagendada cambia fecha, hora, duración y a veces dirección, y un PATCH parcial dejaría
 * viva la hora vieja si el objeto nuevo la trae vacía.
 * §5.12 la nombró `actualizarEvento`; las dos existen.
 * @returns {Promise<Resultado>} valor = {eventId}
 */
export async function moverEvento(eventId, ev) {
  if (!disponible()) return mal('DATO_INVALIDO', MSG.SIN_CONFIG);
  if (!puedeEscribir()) return mal('ROL_SIN_PERMISO', MSG.ROL);
  const id = idDeterminista(eventId || (ev && (ev.uid || ev.id)));
  if (!id) return mal('DATO_INVALIDO', 'No se sabe cuál evento mover.');

  const r = await llamar('/' + encodeURIComponent(id) + '?sendUpdates=all',
    { method: 'PUT', body: JSON.stringify({ ...cuerpo(ev || {}), id, status: 'confirmed' }) });
  if (!r.ok) return r;
  const { http, cuerpo: resp } = r.valor;
  if (http >= 200 && http < 300) return ok({ eventId: (resp && resp.id) || id });
  if (http === 404) return mal('NO_ENCONTRADO', 'Ese evento ya no está en el calendario. Créalo otra vez.');
  if (http === 401 || http === 403) { _tok = null; return mal('ROL_SIN_PERMISO', MSG.ROL); }
  return mal('SIN_RED', MSG.RECHAZADO);
}

export const actualizarEvento = moverEvento;

/**
 * Cancela el evento. DELETE y no `status:'cancelled'`: el DELETE de la API sí manda la
 * cancelación a los attendees con sendUpdates=all, y es lo que tacha la cita en el
 * teléfono del instalador. Un 404 y un 410 se cuentan como éxito: el objetivo era que no
 * hubiera evento, y no lo hay.
 * §5.12 la nombró `cancelarEvento`; las dos existen.
 */
export async function borrarEvento(eventId) {
  if (!disponible()) return mal('DATO_INVALIDO', MSG.SIN_CONFIG);
  if (!puedeEscribir()) return mal('ROL_SIN_PERMISO', MSG.ROL);
  const id = idDeterminista(eventId);
  if (!id) return mal('DATO_INVALIDO', 'No se sabe cuál evento cancelar.');

  const r = await llamar('/' + encodeURIComponent(id) + '?sendUpdates=all', { method: 'DELETE' });
  if (!r.ok) return r;
  const http = r.valor.http;
  if ((http >= 200 && http < 300) || http === 404 || http === 410) return ok({ borrado: true });
  if (http === 401 || http === 403) { _tok = null; return mal('ROL_SIN_PERMISO', MSG.ROL); }
  return mal('SIN_RED', MSG.RECHAZADO);
}

export const cancelarEvento = borrarEvento;

/* ---------------------------------------------------------------------------
   LAS INSTRUCCIONES
   --------------------------------------------------------------------------- */

/**
 * El texto exacto de los pasos, para pintarlo en Ajustes. Vive aquí y no en la pantalla
 * porque los pasos y el código tienen que decir lo mismo: el día que cambie el scope,
 * cambian los dos en el mismo archivo. Y va completo, con los nombres literales de los
 * campos de Google Cloud, para que nadie tenga que buscar un tutorial: los tutoriales de
 * OAuth de Google envejecen en meses y mandan a pantallas que ya no existen.
 * @returns {{titulo:string, minutos:number, pasos:string[], notas:string[]}}
 */
export function instrucciones() {
  const origen = (typeof location !== 'undefined' && location.origin) || 'https://TU-USUARIO.github.io';
  return {
    titulo: 'Conectar Google Calendar',
    minutos: 15,
    pasos: [
      'Entra a console.cloud.google.com con la cuenta de Google de Dirección. Es la única cuenta que hace falta.',
      'Arriba a la izquierda, en el selector de proyecto, dale a "Nuevo proyecto". Nómbralo AL3D y créalo.',
      'En el buscador de arriba escribe "Google Calendar API", ábrela y dale a "Habilitar".',
      'Menú de la izquierda: "APIs y servicios" → "Pantalla de consentimiento de OAuth". Tipo de usuario: Externo. Créala.',
      'Llena solo lo obligatorio: nombre de la app (AL3D), tu correo de soporte y tu correo de contacto. Guarda.',
      'Deja el estado de publicación en "Testing". No le des a "Publicar app": en Testing caben 100 usuarios de prueba y aquí son 3.',
      'En "Usuarios de prueba" agrega los tres correos: Dirección, Fabricación y Pagos. Sin esto, a ellos les rebota el permiso.',
      'Menú: "Credenciales" → "Crear credenciales" → "ID de cliente de OAuth". Tipo de aplicación: Aplicación web.',
      'En "Orígenes autorizados de JavaScript" agrega exactamente esto, sin barra al final y sin la ruta: ' + origen,
      'Deja vacío "URIs de redireccionamiento autorizados". Este flujo no usa redirección.',
      'Copia el "ID de cliente" (termina en .apps.googleusercontent.com) y pégalo aquí abajo. El "Secreto de cliente" NO se usa: no lo copies y no lo pegues en ningún lado.',
      'Escribe los tres correos en la lista de invitados de aquí abajo. Sin ellos el evento se crea, pero solo te suena a ti.',
      'Dale a Conectar. La primera vez Google va a decir "Google hasn\'t verified this app": abre "Avanzado" y luego "Ir a AL3D (no seguro)". Es porque la app está en Testing, y desaparece solo con Google Workspace.',
    ],
    notas: [
      'Esto se pega SOLO en el teléfono de Dirección. Es el único que crea eventos, y no por permisos: los recordatorios de Google son por usuario, así que las tres personas tienen que entrar como invitados de un evento creado por una sola cuenta.',
      'Cada persona ve la pantalla de "no verificada" una vez, la primera vez que acepta la invitación de su lado. Después ya no.',
      'Si algo de esto falla, el archivo .ics sigue funcionando igual que hoy y sin ninguna cuenta. No se retira nunca.',
    ],
  };
}
