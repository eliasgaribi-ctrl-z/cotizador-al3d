/* ============================================================================
   LA PUERTA — sin cuenta de Google, no se entra.

   Hasta hoy, entrar con Google era un botón escondido en Ajustes: servía para que el puente
   supiera qué rol tenías, pero la plataforma abría igual sin tocarlo. Cualquiera con el
   enlace veía el tablero, los proyectos, los importes y la cobranza. Esto lo cambia: la
   identidad deja de ser un extra y pasa a ser la condición para que la app pinte algo.

   ── Lo que esta puerta SÍ hace ─────────────────────────────────────────────────
     · Nadie usa la plataforma sin una cuenta de Google que esté en la pestaña «Accesos» de
       la hoja. Quitar a alguien de esa pestaña lo deja fuera la próxima vez que tenga señal.
     · El rol deja de elegirse solo. Antes era un interruptor de tres posiciones en Ajustes;
       ahora lo decide la hoja y llega en el pase. Fabricación ya no puede ponerse
       «dirección» para ver los importes que la pantalla le esconde.
     · Dar de alta a alguien vuelve a ser un renglón en la hoja y mandarle el enlace. Ni
       token que pegar, ni URL que teclear — ver `URL_PUENTE` en js/datos/prefs.js.

   ── Lo que NO hace, y hay que decirlo ──────────────────────────────────────────
   Esto es una app que corre en el navegador: TODO lo que la plataforma guardó en este
   aparato está en el IndexedDB de este aparato, y quien tenga el teléfono desbloqueado y
   sepa abrir las herramientas del navegador puede leerlo sin pasar por aquí. Esta puerta es
   la cerradura de la casa, no la caja fuerte. Lo que de verdad protege el dinero está del
   otro lado: el Apps Script verifica el token contra Google —audiencia incluida—, busca el
   correo en «Accesos» y decide qué columnas puede tocar cada rol. Esa frontera no se movió
   ni un milímetro y es la que importa. Confundir las dos cosas sería creer que la app es
   segura porque tiene una pantalla de entrada bonita.

   Para un teléfono que se pierde, lo que sirve es el bloqueo del propio teléfono y quitar el
   correo de «Accesos» — no esta pantalla.

   ── Por qué hay un PASE y no se pregunta siempre ───────────────────────────────
   Porque si no, la app se vuelve inservible justo cuando más se usa. El trabajo de este
   taller pasa en azoteas, en estacionamientos y en locales a medio construir, y ahí no hay
   señal. Una puerta que necesita que Google conteste para dejar mirar la orden de trabajo
   convierte el teléfono en un ladrillo en mitad de una instalación. Eso ya está escrito en
   la cabecera de ingreso.js —«una app que solo funciona cuando un tercero contesta bien no
   está terminada»— y aquí se cumple:

     · Con señal, se verifica de verdad contra la hoja y el pase se renueva.
     · Sin señal, vale el pase de la última vez durante DIAS_PASE días.
     · Pasados esos días sin poder verificar ni una vez, la puerta se cierra. No es un
       número mágico: es cuánto tiempo puede alguien seguir entrando DESPUÉS de que lo
       quitaron de la lista, si consigue no tener señal nunca. Un mes es lo que separa «se
       me fue el internet una semana» de «este ya no trabaja aquí».

   El pase se guarda en localStorage y se puede falsificar a mano. Ver arriba: no abre nada
   del otro lado. Lo peor que consigue quien lo falsifique es enseñarse a sí mismo la
   pantalla de un rol que la hoja va a rechazar en cuanto intente escribir.

   ── La salida de emergencia ────────────────────────────────────────────────────
   Un aparato que trabaja con token de dispositivo —la salida de emergencia que ingreso.js
   dejó a propósito— también entra, y lo hace ENSEÑÁNDOLO: la banda de arriba dice que se
   entró sin identificar a la persona. No se quita esa puerta porque el día que Google no
   conteste bien no puede ser el día en que el taller no pueda trabajar.
   ============================================================================ */

import * as Prefs from '../datos/prefs.js';
/* ── Estos DOS van estáticos, y no es una preferencia de estilo ────────────────────────
   Estaban como `await import(...)` dentro del manejador del clic, y eso costó que el
   navegador BLOQUEARA la ventana de Google en producción. La regla es que una ventana
   emergente solo se abre mientras el navegador siga considerando que la está pidiendo una
   persona, y ese permiso se gasta con la espera: entre el clic y `requestAccessToken` había
   dos importaciones que salen a buscar un archivo a la red. Para cuando volvían, el clic ya
   no valía y Chrome tapaba la ventana sin que la app se enterara.

   Cargarlos aquí arriba es lo que hace que del clic a la ventana no haya NADA en medio. Son
   dos módulos que la puerta necesita siempre, así que tampoco se está pagando de más. */
import * as Ingreso from './ingreso.js';
import * as Puente from '../datos/puente.js';
import { $, esc } from './ui.js';
import { hoyISO } from './fechas.js';

/* La G de Google, en línea y con sus cuatro colores. No va al sprite de iconos de index.html
   porque ése es monocromo —todo se pinta con `currentColor`— y la marca de Google no se
   puede recolorear: sus normas para el botón de «Entrar con Google» piden la G como es. Es
   la única imagen de la plataforma que no obedece al tema. */
const G_GOOGLE =
  '<svg class="puerta-g" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">' +
    '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/>' +
    '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18z"/>' +
    '<path fill="#FBBC05" d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33z"/>' +
    '<path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58z"/>' +
  '</svg>';

/* Los tres azules del logo, en el orden en que se juntan: el oscuro a la izquierda, el de en
   medio el más grande, el claro a la derecha. Son colores de la MARCA y no del tema —como la G
   de arriba—, así que no cambian de noche. */
const GOO_PUERTA =
  '<svg class="puerta-goo" viewBox="0 0 120 60" width="120" height="60" aria-hidden="true" focusable="false">' +
    '<defs><filter id="puerta-goo-f"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/>' +
    '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter></defs>' +
    '<g filter="url(#puerta-goo-f)">' +
      '<circle class="g1" cx="44" cy="30" r="11"/><circle class="g2" cx="60" cy="30" r="15"/><circle class="g3" cx="77" cy="30" r="9"/>' +
    '</g>' +
  '</svg>';

/* ── El fondo de la puerta ──────────────────────────────────────────────────────
   La ÚNICA excepción a «nada se mueve solo»: la aprobó Elías para esta pantalla y para ninguna
   otra. Corre en loop y sigue al dedo o al cursor; con movimiento reducido se queda fijo. Los
   nueve están en el paquete de animaciones («Fondos Puerta v2»), lado a lado y a tamaño de
   teléfono, tableta y escritorio.

   Cada vez que sale la puerta toca uno al azar, y nunca el mismo dos veces seguidas (Elías,
   2-oct-2026). Para ver uno en concreto: `?fondo=led` (o cualquiera de la lista) en la liga. */
const FONDOS_PUERTA = ['neon', 'plano', 'led', 'circulos', 'letras', 'cnc', 'particulas', 'ondas', 'acrilico'];

/* ── La sesión dura un día ────────────────────────────────────────────────────
   Decisión de Elías (2-oct-2026): cada día se vuelve a entrar con Google, para saber quién está
   usando cada aparato. La primera vez que la app se abre en un día nuevo —o a medianoche, si se
   quedó abierta— se suelta la sesión de Google de este aparato, se borra el pase y sale la
   puerta; no hay renovación callada que se la salte. Hace falta tocar «Entrar con Google».

   Lo que eso cuesta, dicho: entrar el primer rato del día pide SEÑAL. Ya adentro, el resto del
   día se trabaja sin red como siempre (el pase sigue valiendo). Un aparato que amanece en una
   azotea sin datos no abre hasta que tenga señal una vez. Con `false` se vuelve al pase de
   DIAS_PASE días sin cierre diario. */
const CIERRE_DIARIO = true;

/* Cuánto vale el pase sin poder confirmarlo. Ver la cabecera. */
const DIAS_PASE = 30;
const MS_PASE = DIAS_PASE * 24 * 60 * 60 * 1000;

/* Cuándo se avisa de que el pase se está acabando: a falta de una semana, en la banda de
   arriba. Antes de eso no se dice nada —un aviso que sale 30 días seguidos no es un aviso—
   y después, cuando quedan menos de dos días, se dice fuerte. */
const MS_AVISO = 7 * 24 * 60 * 60 * 1000;

/* Los avisos son OBJETOS, no cadenas, y son dos cosas distintas a propósito:
     · `fuera: true` significa «la hoja dijo que no», y es lo que pinta el cartel en rojo y
       saca el botón de «Entrar con otra cuenta». Antes eso se adivinaba husmeando una frase
       dentro del mensaje: cambiar una palabra del cartel habría apagado las dos cosas en
       silencio.
     · `texto` se ESCAPA y `html` no. Hace falta separarlos porque algunos de estos mensajes
       vienen del otro lado —de lo que conteste el Apps Script— y eso no se mete crudo en un
       innerHTML aunque el Apps Script sea nuestro. Es la misma regla que ya sigue
       `pintarBanda` en app.js. */
const aviso  = texto => ({ texto: String(texto || '') });
const avisoH = html  => ({ html: String(html || '') });

const MSG = {
  FUERA: correo => ({ fuera: true,
    html: 'Entraste como <b>' + esc(correo) + '</b>, pero ese correo no tiene acceso a la ' +
          'plataforma. Pídele a Dirección que te dé de alta.' }),
  SIN_RED_PRIMERA: aviso('Para entrar por primera vez en este aparato hace falta señal: hay que ' +
                         'preguntarle a la hoja qué te toca hacer. Conéctate y vuelve a intentar.'),
  NUEVO_DIA: correo => avisoH('La sesión de <b>' + esc(correo) + '</b> se cerró al terminar el día. ' +
                              'Cada día se vuelve a entrar con Google: así se sabe quién usa este aparato.'),
  SIN_RED_HOY: aviso('Para entrar hoy hace falta señal: cada día se confirma con Google quién usa este ' +
                     'aparato. Conéctate y vuelve a intentar; ya adentro, el resto del día funciona sin red.'),
  CADUCO: correo => avisoH('Hace más de ' + DIAS_PASE + ' días que no se puede confirmar el acceso de <b>' +
                           esc(correo) + '</b>. Conéctate a internet y vuelve a entrar.'),
};

/* El resultado de custodiar(), para que app.js no tenga que adivinar. */
const dentro = (via, correo, rol, nota) => ({ ok: true, via, correo, rol, nota: nota || '' });

/* La retrollamada que app.js le dio a `custodiar()` para borrar la nota de la banda. Se guarda
   porque `reconfirmar()` la necesita horas después, cuando la comprobación sí sale. */
let _avisar = null;

/**
 * Deja entrar, o no deja. Devuelve una promesa que **solo se resuelve cuando hay derecho a
 * pasar**: mientras no lo haya, la pantalla de la puerta se queda puesta y la promesa
 * pendiente. app.js no monta un solo módulo hasta que esto conteste.
 *
 * @returns {Promise<{ok:true, via:string, correo:string, rol:string, nota:string}>}
 */
export async function custodiar(avisar) {
  _avisar = typeof avisar === 'function' ? avisar : null;
  /* 0. LA COPIA LOCAL — las mismas exenciones que cotizador.html y la mesa de corte.
        Faltaban aquí, y el síntoma no se parecía a la causa: las diecisiete pruebas de
        navegador corren contra 127.0.0.1, la puerta las paraba en «Entrar con Google» y las
        que miran la plataforma se caían por tiempo o contaban «0 proyectos» sin un solo error
        de página. Y no había forma de pasar: Google solo acepta el origen publicado, y el
        token de dispositivo se pega en Ajustes, que está DETRÁS de esta pantalla. En local la
        puerta no protegía nada —los datos son del propio navegador de quien la corre— y
        dejaba la plataforma sin poder abrirse ni probarse. Nadie llega a estas direcciones
        con la liga pública, que es de quien protege esto. */
  if (esCopiaLocal()) return dentro('local', '', Prefs.rol());

  /* 0b. UN DÍA NUEVO — la sesión de ayer ya no vale (CIERRE_DIARIO). Va ANTES del pase vivo y
        de la renovación callada: las dos dejarían pasar sin que nadie tocara nada, que es justo
        lo que este cierre quiere evitar. */
  if (CIERRE_DIARIO && Prefs.get(Prefs.CLAVES.ENTRADA, '') !== hoyISO()) {
    const p0 = Prefs.get(Prefs.CLAVES.PASE, null);
    const quien = (p0 && p0.correo) || Ingreso.correo() || '';
    _delDia = true;
    Ingreso.salir();
    Prefs.borrarPase();
    return await pedirEntrada(quien ? MSG.NUEVO_DIA(quien) : null);
  }

  /* 1. EL PASE VIVO — se entra YA, y se confirma por detrás.
        Es el camino de todas las mañanas, y la primera versión lo hizo mal: esperaba a que
        la hoja contestara antes de pintar nada. Con un Apps Script frío o una red de
        teléfono en la calle, eso son hasta treinta segundos mirando «Comprobando quién
        entra…» a alguien que YA tiene un pase válido en la mano. El pase existe justamente
        para no depender de la red; hacerle esperar a la red lo dejaba sin sentido.

        Así que se entra con el pase y la comprobación sigue por detrás:
          · si la hoja dice que ese correo ya no tiene acceso, se echa en el acto —cuestión
            de segundos, no de la próxima apertura—;
          · si la hoja cambió el rol, se recarga, porque la pantalla ya se pintó con el
            viejo y media app decide qué enseña a partir de él;
          · y si confirma sin novedad, se borra el aviso de «te quedan N días», que se puso
            antes de saber que iba a poder confirmarse. */
  const p = Prefs.pase();
  if (p) {
    confirmarSuelto(false).real.then(r => {
      if (!r) return;
      if (r.estado === 'fuera') {
        /* El token de dispositivo NO rescata aquí: si rescatara, quitar a alguien de
           «Accesos» no serviría de nada en el teléfono donde hubiera un token pegado. El día
           que alguien se va del taller con un token en el bolsillo, lo que toca es rotarlo
           desde la hoja —menú ⚡ AL3D → Tokens del puente—, y eso ya estaba escrito en
           ingreso.js. */
        Prefs.borrarPase();
        pedirEntrada(MSG.FUERA(r.correo || p.correo), null, true);
        return;
      }
      if (r.estado !== 'ok') return;
      if (r.rol !== p.rol) { location.reload(); return; }
      if (avisar) avisar('');
    }).catch(() => {});
    vigilarElDia();
    return dentro('google', p.correo, p.rol, avisoDePase(p));
  }

  /* 2. YA ENTRÓ AQUÍ ALGUNA VEZ, pero el pase caducó o nunca llegó a guardarse. Se intenta la
        renovación callada antes de enseñar nada: si la sesión de Google de este navegador
        sigue viva, la persona no tiene por qué volver a apretar un botón. */
  const viejo = Prefs.get(Prefs.CLAVES.PASE, null);
  const correoPrevio = (viejo && viejo.correo) || (Prefs.ingreso() && Prefs.ingreso().correo) || '';
  if (correoPrevio) {
    const { real, conTope } = confirmarSuelto(false);
    const r = await conTope;
    if (r.estado === 'ok') { vigilarElDia(); return dentro('google', r.correo, r.rol); }
    if (r.estado === 'fuera') { Prefs.borrarPase(); return await pedirEntrada(MSG.FUERA(r.correo || correoPrevio)); }
    /* `r.tarde` es el caso en que se acabó el tope pero la comprobación SIGUE viva. Se pinta
       la puerta para no dejar a nadie mirando un esqueleto, y se le pasa la promesa: si la
       hoja acaba contestando que sí, la puerta se cierra sola. Sin esto, la respuesta buena
       llegaba dos segundos tarde a una pantalla que ya había decidido que no había nadie, y
       la persona apretaba un botón que no hacía ninguna falta. */
    return await pedirEntrada(viejo ? MSG.CADUCO(correoPrevio) : null, r.tarde ? real : null);
  }

  /* 3. Nadie ha entrado aquí con Google. La puerta, y a esperar.

     ── El token de dispositivo YA NO abre la puerta ───────────────────────────────
     Lo hizo durante un tiempo, como salida de emergencia: un aparato con token pegado en
     Ajustes entraba sin preguntarle a Google. En la práctica eso significó que el aparato de
     Dirección —que es justo el que tiene token— abría la plataforma completa sin cuenta de
     Google, con la ventana de Google encima pidiendo una cuenta que ya no hacía falta. Por
     decisión de Dirección (septiembre de 2026), la puerta solo la abre una cuenta de Google.
     El token sigue sirviendo para lo que servía antes de la puerta: hablar con la hoja.
     El día que Google no conteste, lo que cubre es el pase de DIAS_PASE días, no el token. */
  return await pedirEntrada(null);
}

/* Exactamente las cuatro de las otras dos puertas, ni una más: el día que alguien añada aquí
   un dominio «de pruebas», la puerta queda abierta de par en par sin que nada falle.
   pruebas/puerta.mjs lo vigila. */
function esCopiaLocal() {
  try {
    const h = location.hostname;
    return location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '';
  } catch (_) { return false; }
}

/* ----------------------------------------------------------------------------
   Confirmar contra la hoja
   ---------------------------------------------------------------------------- */

/* ----- El tope de espera -----
   El arranque entero cuelga de `confirmar()`, así que una promesa que no resuelve aquí no
   es un retraso: es la app muerta en una pantalla que dice «Comprobando quién entra…» para
   siempre. Y `requestAccessToken` de Google puede no llamar de vuelta NUNCA —una ventana
   que el navegador bloqueó sin decirlo, las cookies de terceros apagadas, la sesión de
   Google en un estado raro—. Antes eso no importaba porque el ingreso corría al final del
   arranque y con la app ya pintada; ahora corre antes que todo.

   Dos topes distintos, y la diferencia importa: el de pantalla está esperando a una persona
   que tiene que elegir cuenta y a lo mejor teclear una contraseña, y cortarle a los pocos
   segundos sería peor que no poner tope.

   ── El callado NO puede bajar de treinta segundos ──────────────────────────────
   Estuvo en diez y salió mal el primer día. Dentro de `confirmar()` hay dos esperas en
   serie: la renovación del token con Google y la pregunta a la hoja, que tiene su PROPIO
   tope de quince segundos (`MS_ESPERA` en puente.js). Un Apps Script frío tarda de sobra
   cinco o diez segundos en despertar. Con diez arriba y quince abajo, el de arriba cortaba
   antes de que el de abajo llegara siquiera a rendirse: la puerta se pintaba, y un segundo
   después la respuesta buena llegaba a una pantalla que ya había decidido que no había
   nadie. Un tope exterior TIENE que ser más largo que el interior o no es un tope, es una
   carrera. Estar offline no llega aquí: ahí las dos fallan en el acto.

   Y aun así el que llega tarde no se tira: ver `pedirEntrada`, que se cierra sola si la
   respuesta buena aparece con la puerta ya puesta. */
const MS_CALLADO = 30000;
const MS_CON_PANTALLA = 180000;
/* Lo que se espera antes de volver a preguntar cuando la hoja dice que alguien no tiene
   acceso. Cuatro segundos: lo bastante para que un tropiezo de red se haya ido, y lo bastante
   poco para que una baja de verdad surta efecto en el acto. Ver `confirmarDeVerdad`. */
const MS_SEGUNDA_OPINION = 4000;

/** Lanza la comprobación y devuelve las DOS cosas: la que tiene tope, para no colgar el
 *  arranque, y la de verdad, que sigue viva por si contesta tarde y todavía sirve. */
function confirmarSuelto(conPantalla, alPaso) {
  const real = confirmarDeVerdad(conPantalla, alPaso);
  const conTope = Promise.race([
    real,
    new Promise(r => setTimeout(() => r({ estado: 'sin_red', tarde: true }),
                                conPantalla ? MS_CON_PANTALLA : MS_CALLADO)),
  ]);
  /* Si nadie más la espera y truena, que no salga por la consola como promesa sin atender. */
  real.catch(() => {});
  return { real, conTope };
}

async function confirmar(conPantalla, alPaso) {
  return await confirmarSuelto(conPantalla, alPaso).conTope;
}

/**
 * Pregunta quién soy: renueva el token de Google si hace falta y le pide `/salud` al puente.
 *
 * Tres desenlaces, y los tres importan por separado:
 *   · `ok`      — la hoja contestó con un correo y un rol. Se renueva el pase.
 *   · `fuera`   — la hoja contestó que ese correo no tiene acceso. Es definitivo.
 *   · `sin_red` — no se pudo preguntar. NO es lo mismo y no cierra nada.
 *
 * @param {boolean} [conPantalla] true para abrir la ventana de Google; por omisión renueva
 *        callado, que es lo que se puede hacer sin un click de la persona.
 * @param {Function} [alPaso] `(clave, estado, detalle)` — quién está esperando a quién, para que
 *        la pantalla lo pueda enseñar (F10). Los dos pasos son `google` y `hoja`, en ese orden,
 *        que es el orden real: primero Google dice quién eres, después la hoja dice qué te toca.
 *        Solo lo pasa el camino con pantalla; el callado corre por detrás y no tiene a quién
 *        contarle nada. Es opcional a propósito: esta función tiene que poder correr sin nadie
 *        mirando.
 */
async function confirmarDeVerdad(conPantalla, alPaso) {
  const paso = (c, e, d) => { if (alPaso) { try { alPaso(c, e, d); } catch (_) {} } };
  if (!Ingreso.configurado()) return { estado: 'sin_red' };

  /* Esto corre DENTRO del clic y antes de `requestAccessToken`: es lo único que puede haber ahí,
     porque es una clase y un atributo, sin esperas. Cualquier `await` de más aquí y el navegador
     tapa la ventana de Google (ver la cabecera de este archivo). */
  paso('google', 'trabaja');
  const e = conPantalla ? await Ingreso.entrar(false) : await Ingreso.renovar();
  if (!e.ok) {
    /* El detalle del renglón es corto a propósito: la frase entera de por qué no se pudo —la
       ventana que se cerró, la que el navegador bloqueó— sale en el aviso de la puerta, y
       repetirla aquí la cortaría a media palabra en un teléfono de 360 px. */
    paso('google', 'mal', 'no se completó');
    /* Sin cuenta no hay a quién preguntarle a la hoja: el segundo renglón lo dice, en vez de
       quedarse «en espera» como si todavía fuera a pasar algo. */
    paso('hoja', 'salta', 'no se preguntó');
    /* Que la persona cierre la ventana de Google no es quedarse fuera para siempre: es no
       haber entrado todavía. Se trata como «no se pudo preguntar» y la puerta sigue puesta.
       El mensaje sí viaja tal cual: distinguir «cerraste la ventana» de «tu navegador la
       bloqueó» es la diferencia entre volver a intentar y saber qué hay que tocar. */
    return { estado: 'sin_red', mensaje: e.mensaje || '' };
  }
  paso('google', 'ok', Ingreso.correo() || '');

  paso('hoja', 'trabaja');
  let v = await preguntarALaHoja();

  /* ── Echar a alguien se comprueba DOS veces ────────────────────────────────────
     Esto costó una sesión cerrada de verdad el primer día, y la causa está del otro lado:
     el Apps Script verifica el token contra Google y FALLA CERRADO —si Google no le contesta,
     no deja pasar—. Eso está bien ahí. El problema es que, al fallar cerrado, contesta
     `ROL_SIN_PERMISO`: exactamente el mismo código que cuando el correo de verdad no está en
     «Accesos». O sea que un tropiezo de red entre el Apps Script y Google se leía aquí como
     «a éste lo dieron de baja», se le borraba el pase y se le echaba de la sesión.

     Una baja es determinista y se repite siempre; un tropiezo, no. Así que en el camino
     callado —el que corre solo, por detrás, sin que nadie haya pedido nada— se pregunta una
     segunda vez antes de tirar de la manta. En el camino con pantalla no hace falta esperar:
     la persona ya está delante de la puerta y lo peor que le pasa es volver a apretar. */
  if (v.estado === 'fuera' && !conPantalla) {
    await new Promise(r => setTimeout(r, MS_SEGUNDA_OPINION));
    const v2 = await preguntarALaHoja();
    if (v2.estado !== 'fuera') v = v2;   // era un tropiezo, no una baja
  }
  /* El paso de la hoja termina como terminó de verdad: `ok` solo cuando contestó con un correo y
     un rol. «Fuera» y «sin red» son dos fallos distintos y el detalle lo dice, porque lo que se
     hace después no es lo mismo: uno se arregla entrando con otra cuenta y el otro esperando. */
  paso('hoja', v.estado === 'ok' ? 'ok' : 'mal',
    v.estado === 'fuera' ? 'tu cuenta no está dada de alta' : (v.estado === 'ok' ? '' : 'no contestó'));
  return v;
}

/**
 * La vuelta a la hoja que el arranque no pudo dar. La llama app.js cuando un clic acaba de
 * renovar el token de Google, y no bloquea nada: va por detrás, como la del pase vivo.
 *
 * ── Por qué hace falta ──────────────────────────────────────────────────────
 * La comprobación de fondo de `custodiar()` renueva CALLADO, sin gesto de la persona, y con
 * el token ya vencido —la app se abre una vez al día; el token dura una hora— la ventana de
 * Google se bloquea y aquello termina en `sin_red`: ni se pregunta a la hoja ni se renueva el
 * pase. El clic siguiente sí renovaba el token (app.js), pero solo para sincronizar. Así que
 * el pase caducaba contando desde la ÚLTIMA vez que la app se abrió con el token vivo: a los
 * 23 días la banda decía «Llevas días sin señal…» a alguien con señal todo el mes, a los 30
 * la puerta se cerraba, y a quien quitaban de «Accesos» no se le echaba nunca.
 *
 * Con el token recién renovado `confirmarDeVerdad(false)` ya no abre ventana —`renovar()`
 * contesta en el acto con el token vivo— y es exactamente la comprobación de siempre, con su
 * segunda opinión antes de echar a nadie. Los desenlaces son los del pase vivo.
 */
let _reconfirmando = false;
export async function reconfirmar() {
  if (esCopiaLocal() || _reconfirmando) return;
  if (!Ingreso.dentro()) return;          // sin token vivo, la hoja no sabría quién pregunta
  _reconfirmando = true;
  try {
    const rolAntes = Prefs.rol();
    const r = await confirmarDeVerdad(false);
    if (!r) return;
    if (r.estado === 'fuera') {
      Prefs.borrarPase();
      pedirEntrada(MSG.FUERA(r.correo || Ingreso.correo()), null, true);
      return;
    }
    if (r.estado !== 'ok') return;
    /* La pantalla se pintó con el rol de antes y media app decide qué enseña a partir de él. */
    if (r.rol !== rolAntes) { location.reload(); return; }
    if (_avisar) _avisar('');
  } catch (_) {
    /* Una vuelta que no salió es la de mañana: el pase sigue como estaba. */
  } finally {
    _reconfirmando = false;
  }
}

/** Una vuelta a la hoja: quién dice que soy. Separada para poder repetirla. */
async function preguntarALaHoja() {
  const relevo = Puente.desdePrefs();
  if (!relevo) return { estado: 'sin_red' };
  let s;
  try { s = await relevo.salud(); } catch (_) { return { estado: 'sin_red' }; }

  if (s.ok && s.via === 'google' && s.correo && Prefs.ROLES.includes(s.rol)) {
    Prefs.setPase({ correo: s.correo, rol: s.rol, hasta: Date.now() + MS_PASE, visto: Date.now() });
    return { estado: 'ok', correo: s.correo, rol: s.rol };
  }
  if (s.codigo === 'ROL_SIN_PERMISO') {
    /* Si en este momento NO hay token de Google vivo, la petición salió sin identidad y la
       hoja contestó lo único que podía contestar. Eso no es una baja: es no haber preguntado.
       Sin esta línea, un token que caduca justo en el vuelo echaba a su dueño. */
    if (!Ingreso.dentro()) return { estado: 'sin_red' };
    return { estado: 'fuera', correo: Ingreso.correo() };
  }
  /* Contestó ok pero por la puerta del token: la hoja reconoció al APARATO, no a la persona.
     Eso no da pase — el rol saldría de una cadena pegada a mano y no de quién entró. */
  if (s.ok && s.via !== 'google') return { estado: 'sin_red' };
  return { estado: 'sin_red', mensaje: s.mensaje || '' };
}

/* true cuando la puerta se puso porque empezó un día nuevo: cambia lo que se dice si no hay señal. */
let _delDia = false;

/* Si la app se queda abierta y cambia el día, la sesión se cierra igual: a medianoche (más un
   segundo), o al volver a la pestaña si el teléfono durmió y el temporizador se atrasó. Se
   cierra con `salir()`, que recarga: lo que se estaba capturando ya se guardó en cada tecla. */
let _vigilando = false;
function vigilarElDia() {
  if (!CIERRE_DIARIO || _vigilando || typeof document === 'undefined') return;
  _vigilando = true;
  const dia = hoyISO();
  const revisar = () => { if (hoyISO() !== dia) salir(); };
  const ahora = new Date();
  const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  setTimeout(revisar, manana - ahora + 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
}

/** Cuánto le queda al pase, dicho solo cuando ya conviene decirlo. */
function avisoDePase(p) {
  const queda = Number(p.hasta) - Date.now();
  if (queda > MS_AVISO) return '';
  const dias = Math.max(0, Math.ceil(queda / (24 * 60 * 60 * 1000)));
  return 'Llevas días sin señal para confirmar tu acceso. ' +
         (dias <= 1 ? 'La plataforma se cierra hoy si no te conectas.'
                    : 'Te quedan ' + dias + ' días para conectarte a internet.');
}

/* ----------------------------------------------------------------------------
   La pantalla
   ---------------------------------------------------------------------------- */

/**
 * Enseña la puerta y NO resuelve hasta que alguien pase. Es deliberado: quien llama espera,
 * y mientras espera no hay un solo módulo montado ni un solo dato en pantalla.
 *
 * @param {{texto?:string, html?:string, fuera?:boolean}|null} av qué decir, o null la primera vez.
 * @param {Promise|null} pendiente una comprobación que se pasó del tope pero sigue viva.
 * @param {boolean} [echando] true cuando la puerta se pone ENCIMA de la app ya montada,
 *        porque a alguien lo acaban de quitar de la lista a mitad de sesión. Entonces volver
 *        a entrar recarga: detrás quedó pintada media pantalla con los datos y el rol del
 *        que se acaba de ir, y cerrar la puerta sobre eso sería enseñárselos al siguiente.
 */
function pedirEntrada(av, pendiente, echando) {
  return new Promise(resolve => {
    const caja = $('pf-puerta');
    if (!caja) {
      /* Sin el marcado no hay puerta que enseñar. Antes que dejar la app colgada para
         siempre en una pantalla que no existe, se entra y se dice por qué: un index.html a
         medias es un error de despliegue, no un intento de colarse. */
      /* Sin el marcado no hay puerta que enseñar, y tampoco se entra: una copia a medias no
         es motivo para dejar ver el taller. Se dice qué pasa y la promesa no resuelve. */
      console.error('falta #pf-puerta en el documento: no se entra');
      sinPuerta();
      return;
    }
    /* Todo lo demás del documento queda INERTE mientras la puerta esté puesta. `aria-modal`
       por sí solo no lo consigue: sin esto, el tabulador se pasea por la barra lateral, el
       botón de Ajustes y el del asistente, que están en el HTML fijo y siguen ahí debajo.
       Se apunta qué se tocó para devolverlo exactamente como estaba: `inert` no se soporta
       en todos lados, y donde no, esto no hace nada y tampoco estorba. */
    const dormidos = [];
    for (const hijo of Array.from(document.body.children)) {
      if (hijo === caja || hijo.hasAttribute('inert')) continue;
      hijo.setAttribute('inert', '');
      dormidos.push(hijo);
    }
    const despertar = () => dormidos.forEach(h => h.removeAttribute('inert'));
    /* El esqueleto del arranque estorba debajo: la puerta tapa la pantalla entera y detrás
       no debe quedar la silueta del tablero de alguien. */
    const arr = $('pf-arranque');
    if (arr) arr.hidden = true;
    document.documentElement.classList.add('con-puerta');
    caja.hidden = false;
    /* La antepuerta (js/tema.js) ya cumplió: la puerta tapa todo, y su latido no debe seguir
       corriendo debajo de ella. */
    document.documentElement.classList.remove('antepuerta');

    const pararFondo = montarFondo(caja);
    pintar(caja, av);

    /* El guion de Google se pide AHORA, mientras la persona lee la pantalla, y no cuando
       aprieta. Es la otra mitad de por qué la ventana se bloqueaba: `entrar()` espera a que
       este guion esté antes de pedir la ventana, y si esa espera cae dentro del clic, el
       permiso para abrirla se gasta esperando. Pedirlo aquí hace que para cuando alguien
       apriete ya esté. Si no baja, no se dice nada todavía: el botón lo intentará igual y
       ahí sí habrá un mensaje que ponerle. */
    Ingreso.cargarGis().catch(() => {});

    /* Se cierra la puerta y se sigue, sin que nadie toque nada. Ver arriba. */
    const entrar = r => {
      if (echando) { location.reload(); return; }
      pararFondo();
      despertar();
      document.documentElement.classList.remove('con-puerta');
      caja.hidden = true;
      caja.innerHTML = '';
      /* Y se devuelve el esqueleto del arranque, que se escondió para que no se viera por
         debajo. Sin esto, entre entrar y ver el Tablero hay una pantalla EN BLANCO —abrir la
         base, sembrar el catálogo, montar— y en un teléfono viejo eso son segundos en los que
         parece que la app se murió justo al entrar. */
      if (arr) arr.hidden = false;
      /* Hoy ya se entró: hasta medianoche no se vuelve a pedir. */
      Prefs.set(Prefs.CLAVES.ENTRADA, hoyISO());
      vigilarElDia();
      resolve(dentro('google', r.correo, r.rol));
    };
    /* El éxito se deja ver un momento antes de irse: los dos renglones con palomita y el botón
       con «Adentro» durante 900 ms, y luego la caja sube 8 px y se desvanece (240 ms). Sin esa
       pausa, la palomita de la hoja se pintaba y se borraba en el mismo cuadro. Con movimiento
       reducido la pausa se queda —es información— y la caja se va sin subir. */
    let saliendo = false;
    const entrarConPausa = r => {
      if (saliendo) return;
      saliendo = true;
      const c = caja.querySelector('.puerta-caja');
      setTimeout(() => {
        if (c) c.classList.add('sale');
        setTimeout(() => entrar(r), sinMovimiento() ? 0 : 240);
      }, 900);
    };

    /* La comprobación que se pasó del tope pero seguía viva. Si contesta que sí, adentro. Si
       contesta «fuera», se cambia el cartel por el que de verdad explica lo que pasa. */
    if (pendiente) pendiente.then(r => {
      if (caja.hidden || saliendo) return;           // ya entró por el botón: llegó tarde
      if (r && r.estado === 'ok') return entrar(r);
      if (r && r.estado === 'fuera') { Prefs.borrarPase(); pintar(caja, MSG.FUERA(r.correo || '')); }
    }).catch(() => {});

    caja.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-puerta]');
      if (!b) return;
      /* El botón que cuenta lo que pasa es SIEMPRE el principal, se toque el que se toque: «Entrar
         con otra cuenta» arranca la misma entrada, y que el progreso saliera en un botón chico
         de texto subrayado no lo habría visto nadie. */
      const btn = caja.querySelector('[data-puerta="entrar"]');
      if (!btn || saliendo || btn.dataset.estado === 'trabajando') return;
      const otra = caja.querySelector('[data-puerta="otra"]');
      if (b.dataset.puerta === 'otra') {
        /* «Entrar con otra cuenta»: se suelta la sesión de ESTE aparato para que Google
           vuelva a preguntar cuál, en vez de reintentar con la que acaba de ser rechazada.
           Sin `await`: lo que había aquí era un `await import(...)` y esperar dentro del
           manejador del clic es exactamente lo que hace que el navegador tape la ventana. */
        Ingreso.salir();
        Prefs.borrarPase();
      }
      /* ----- F10 · LA PUERTA DICE EN QUÉ PASO VA -----
         Hasta 180 segundos con «Entrando…» y un anillo gris. Un Apps Script en frío tarda de 5
         a 10 s y la pantalla parecía congelada; y si el reintento fallaba con el mismo aviso, el
         HTML quedaba IDÉNTICO y parecía que el toque no había hecho nada.

         Ya no se repinta la caja al tocar, ni al fallar. En su lugar:
           · el botón se encarga de sí mismo (pieza 14): «Entrando · 6 s», su relleno, y si
             falla vuelve a aceptar toques con «Volver a intentar» — sin `disabled`, así que el
             foco se queda donde estaba;
           · debajo salen los dos pasos de verdad (pieza 8) con su reloj, y cada uno termina en
             palomita o en cruz: «Google · tu cuenta» y «La hoja · qué te toca». Cuál de los dos
             se quedó colgado ES la respuesta a «¿por qué no entro?», y por eso se quedan a la
             vista cuando falla: repintar la caja entera con el aviso —lo que se hacía— los
             habría borrado justo cuando alguien los busca;
           · y las manchas del logo (pieza 25) sustituyen al anillo gris mientras tanto.

         Nada de esto pasa antes de `requestAccessToken`: lo único que corre dentro del clic es
         preparar la traza y encender el botón, que no esperan a nada. */
      /* Si tocan antes de que termine la entrada, la entrada se acaba aquí: lo que importa ya
         es la espera. Es una clase, sin esperar a nada. */
      const cj = caja.querySelector('.puerta-caja');
      if (cj) cj.classList.remove('entra');
      const t = arrancarPasos(caja);
      const res = await pedirConGoogle(btn, t, otra);
      if (res.ocupado) return;
      if (res.ok && res.valor && res.valor.estado === 'ok') return entrarConPausa(res.valor);
      const r = res.valor || { estado: 'sin_red' };
      av = r.estado === 'fuera' ? MSG.FUERA(r.correo)
         : (r.mensaje ? aviso(r.mensaje) : (_delDia ? MSG.SIN_RED_HOY : MSG.SIN_RED_PRIMERA));
      ponerAviso(caja, av);
    });
  });
}

/* Los dos pasos de la entrada, en el orden en que ocurren de verdad. Las claves son las que
   usa `confirmarDeVerdad()` al avisar, y los rótulos dicen quién contesta qué: a Google se le
   pregunta QUIÉN eres, a la hoja QUÉ te toca. Con esos dos renglones delante, «no entro» deja de
   ser una sola cosa. */
const PASOS_PUERTA = [
  { clave: 'google', texto: 'Google · tu cuenta' },
  { clave: 'hoja', texto: 'La hoja · qué te toca' },
];

/** Enseña los dos pasos en espera y devuelve la traza, o null si las piezas no cargaron (la
 *  puerta tiene que seguir abriéndose sin ellas). Se puede llamar en cada intento: los pasos del
 *  anterior se borran y los relojes empiezan de cero, que es lo que dice «lo volví a intentar». */
function arrancarPasos(caja) {
  const P = typeof window !== 'undefined' ? window.Piezas : null;
  const el = caja.querySelector('.puerta-pasos');
  if (!P || !P.traza || !el) return null;
  el.hidden = false;
  const t = P.traza(el.querySelector('.puerta-traza'), { reloj: 's', plegar: false });
  if (t) { t.limpiar(); for (const x of PASOS_PUERTA) t.paso(x.clave, x.texto, 'espera'); }
  return t;
}

/** Pide la entrada con el botón puesto a trabajar (pieza 14) y los pasos avanzando (pieza 8).
 *  Nunca se rechaza: devuelve lo mismo que `Piezas.trabajando`, con el veredicto de la hoja en
 *  `valor` —sea bueno o no— y `ocupado` si el botón ya estaba trabajando. */
function pedirConGoogle(btn, t, otra) {
  const P = typeof window !== 'undefined' ? window.Piezas : null;
  /* Las manchas del logo (pieza 25) van EN el lugar del logo: el logo se separa en sus tres
     azules mientras se espera y se vuelve a juntar al terminar. Solo mientras dura la espera, y
     nunca con movimiento reducido: ahí el logo se queda puesto y hablan los relojes. */
  const marca = btn.closest('.puerta-caja') && btn.closest('.puerta-caja').querySelector('.puerta-marca');
  if (marca && !sinMovimiento()) marca.dataset.goo = 'espera';
  /* Lo que llegue DESPUÉS de que el intento se dio por terminado no pinta: con el tope de 180 s
     de `confirmar()` la petición de fondo sigue viva, y si contestara tarde volvería a poner
     palomita en un renglón que ya se marcó con cruz. */
  let cerrado = false;
  const alPaso = (clave, estado, detalle) => { if (t && !cerrado) t.paso(clave, null, estado, detalle); };
  /* `true`: esto sale de un click, así que aquí SÍ se puede abrir la ventana de Google. Es la
     única parte del arranque donde eso es posible, y por eso `confirmar()` se llama sin esperar
     a nada antes. */
  const trabajo = () => confirmar(true, alPaso).then(v => {
    if (v.estado === 'ok') return v;
    /* Un veredicto que no es «ok» es un fallo PARA EL BOTÓN, pero no es una excepción: el
       veredicto viaja colgado del error para que quien llama pinte el aviso de siempre. */
    const e = new Error(v.estado === 'fuera' ? 'Sin acceso' : 'No se pudo entrar');
    e.puerta = v;
    throw e;
  });
  const cierra = r => {
    cerrado = true;
    if (t) t.terminar({ ok: r.ok });
    if (marca) marca.dataset.goo = 'nada';
    return Object.assign({}, r, { valor: r.ok ? r.valor : (r.error && r.error.puerta) });
  };
  if (!P || !P.trabajando) {
    /* Sin las piezas, el camino de siempre: se pide y se pinta el resultado. */
    return trabajo().then(v => ({ ok: true, valor: v }), e => ({ ok: false, error: e })).then(cierra);
  }
  return P.trabajando(btn, trabajo, {
    verbo: 'Entrando', tau: 8000,
    /* «✓ Adentro» y se queda (`volver:0`): la caja se va 900 ms después, y un botón que volviera
       a decir «Entrar con Google» en ese rato invitaría a apretarlo otra vez. */
    ok: 'Adentro', volver: 0,
    /* La frase corta del botón; la explicación entera va en el aviso de arriba y no se repite
       aquí, donde se cortaría con puntos suspensivos. */
    mal: e => (e && e.message) || 'No se pudo entrar',
    reintentar: 'Volver a intentar',
    /* El aviso de arriba ya lo dice y es `role="alert"`; que el botón también lo gritara por la
       región asertiva era decir dos veces lo mismo, una tras otra. */
    voz: false,
    hermanos: otra ? [otra] : [],
  }).then(r => r.ocupado ? r : cierra(r));
}

/* Lo último que dijo la puerta. Si el reintento falla con exactamente el mismo aviso, el HTML
   queda idéntico y parece que el toque no hizo nada: una sacudida corta de 250 ms lo dice sin
   escribir una palabra más. Con movimiento reducido no sacude —la regla del sistema— y ahí lo
   que dice que se intentó otra vez son los relojes de los dos pasos, que empezaron de cero. */
let _ultimoAviso = null;

/** Cambia el aviso EN SU SITIO, sin repintar la caja: los dos pasos de abajo y el botón siguen
 *  donde estaban. El aviso es siempre un nodo nuevo, y no un `innerHTML` sobre el de antes: un
 *  `role="alert"` cuyo texto no cambió no se vuelve a anunciar, y un reintento que falla igual es
 *  justo el caso en que hay que decirlo otra vez. */
function ponerAviso(caja, av) {
  const fuera = !!(av && av.fuera);
  const cuerpo = av ? (av.html != null ? av.html : esc(av.texto || '')) : '';
  const repetido = !!cuerpo && cuerpo === _ultimoAviso;
  _ultimoAviso = cuerpo || null;
  const viejo = caja.querySelector('.puerta-aviso');
  if (viejo) viejo.remove();
  const btn = caja.querySelector('[data-puerta="entrar"]');
  if (cuerpo && btn) {
    const p = document.createElement('p');
    p.className = 'puerta-aviso' + (fuera ? ' es-no' : '') + (repetido ? ' otra-vez' : '');
    p.setAttribute('role', 'alert');
    p.innerHTML = cuerpo;
    btn.before(p);
    if (repetido) p.addEventListener('animationend', () => p.classList.remove('otra-vez'), { once: true });
  }
  /* «Entrar con otra cuenta» solo existe cuando la hoja dijo que no: es lo que se puede hacer. */
  const otra = caja.querySelector('[data-puerta="otra"]');
  if (fuera && !otra && btn) {
    const o = document.createElement('button');
    o.type = 'button'; o.className = 'puerta-otra'; o.dataset.puerta = 'otra';
    o.textContent = 'Entrar con otra cuenta';
    btn.after(o);
  } else if (!fuera && otra) otra.remove();
}

/* Esta es la caja ENTERA, y se escribe una vez: al poner la puerta y cuando una comprobación
   tardía dice que la cuenta no entra. Lo que pasa DESPUÉS de tocar el botón no repinta nada:
   quien dice que está trabajando es el propio botón (pieza 14) y los dos pasos de abajo (pieza
   8), y volver a escribir la caja encima era justo lo que borraba los relojes que la persona
   estaba mirando. */
function pintar(caja, av) {
  /* `fuera` sale de un campo del aviso, no de buscarle palabras al texto. Lo que había aquí
     era una expresión regular probando el mensaje contra la frase del cartel, y con eso
     reescribir el cartel —cambiar esa frase por «no estás dado de alta», por ejemplo— habría
     apagado a la vez el color rojo y el botón de «Entrar con otra cuenta», sin que nada
     fallara ni lo dijera. Hay una prueba que lo vigila, así que si vuelve a aparecer una
     expresión regular husmeando el texto, falla. */
  const fuera = !!(av && av.fuera);
  /* `html` va crudo porque lo escribimos aquí con su `esc()` puesto; `texto` se escapa
     porque puede venir de lo que conteste el Apps Script. */
  const cuerpo = av ? (av.html != null ? av.html : esc(av.texto || '')) : '';
  /* El logotipo del TEMA, y con `.logoimg` para que js/tema.js lo cambie si el sistema cambia
     de tema con la puerta puesta. Iba fijo el de tinta, y de noche el «AL» se perdía sobre el
     marino justo en la primera pantalla que ve cualquiera: tema.js solo cambia los que ya
     existían al cargar la página, y éste se escribe después. */
  const logo = document.documentElement.getAttribute('data-tema') === 'oscuro'
    ? 'logo-al3d-oscuro.svg' : 'logo-al3d.svg';
  _ultimoAviso = cuerpo || null;
  /* La entrada (F10 · 1) pasa UNA vez: la primera vez que se pinta la puerta en esta carga.
     Los tres azules del logo llegan de los lados y se juntan, el logo aparece encima y lo demás
     sube en cascada; después la caja se queda quieta. Si la puerta se repinta —una comprobación
     tardía que dice «fuera»— ya no vuelve a entrar: sería moverse sin que nadie tocara nada. */
  const entra = !_yaEntro && !sinMovimiento();
  _yaEntro = true;
  /* El fondo vive fuera de la caja y sobrevive al repintado: es el mismo nodo, con su lienzo y
     sus ondas, y no vuelve a arrancar de cero. */
  const fondo = caja.querySelector('.puerta-fondo');

  caja.innerHTML =
    '<div class="puerta-caja' + (entra ? ' entra' : '') + '">' +
      /* Las manchas del logo (pieza 25) viven en el lugar del logo, encima de él. Es la misma
         carga que verificar.html —la única página que ve un tercero— y ésta es la otra: las dos
         pantallas que alguien mira sin haber entrado todavía se ven de la casa. */
      '<div class="puerta-marca" data-goo="nada">' +
        '<img class="puerta-logo logoimg" src="' + logo + '" width="72" height="36" alt="AL3D">' +
        GOO_PUERTA +
      '</div>' +
      '<h1>La plataforma del taller</h1>' +
      '<p class="puerta-sub">Entra con la cuenta de Google que usas en AL3D. ' +
        'La app solo le pide a Google tu correo, y con eso sabe qué te toca hacer.</p>' +
      (cuerpo ? '<p class="puerta-aviso' + (fuera ? ' es-no' : '') + '" role="alert">' + cuerpo + '</p>' : '') +
      '<button type="button" class="puerta-btn" data-puerta="entrar">' + G_GOOGLE + ' Entrar con Google</button>' +
      (fuera ? '<button type="button" class="puerta-otra" data-puerta="otra">Entrar con otra cuenta</button>' : '') +
      /* Los dos pasos nacen escondidos: antes de tocar no hay nada que esperar, y enseñar una
         lista de pendientes a quien todavía no ha apretado sería pintarle trabajo que no pidió. */
      '<div class="puerta-pasos" hidden>' +
        '<div class="puerta-traza"></div>' +
      '</div>' +
      '<p class="puerta-pie">' +
        '<a href="acerca.html">Qué es esto</a> · ' +
        '<a href="privacidad.html">Privacidad</a> · ' +
        '<a href="condiciones.html">Condiciones</a>' +
      '</p>' +
    '</div>';
  if (fondo) caja.prepend(fondo);
  const cj = caja.querySelector('.puerta-caja');
  /* La clase se quita cuando la cascada termina, para que el `:active` del botón vuelva a
     poder encogerlo: una animación con `both` puesta le gana a cualquier transform. */
  if (entra && cj) setTimeout(() => cj.classList.remove('entra'), 1200);
  const b = caja.querySelector('[data-puerta="entrar"]');
  if (b) b.focus();
}

let _yaEntro = false;
const sinMovimiento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
};

/* ----------------------------------------------------------------------------
   El fondo
   ---------------------------------------------------------------------------- */

/* Cuál de los nueve: el de la liga (`?fondo=`) si es uno de ellos; si no, uno al azar que no
   sea el de la vez pasada. */
function fondoElegido() {
  let q = '';
  try { q = new URLSearchParams(location.search).get('fondo') || ''; } catch (_) {}
  if (FONDOS_PUERTA.includes(q)) return q;
  const antes = Prefs.get(Prefs.CLAVES.FONDO, '');
  const otros = FONDOS_PUERTA.filter(f => f !== antes);
  const f = otros[Math.floor(Math.random() * otros.length)];
  Prefs.set(Prefs.CLAVES.FONDO, f);
  return f;
}

/* El marcado de cada fondo. Todo es decoración —`aria-hidden`, sin texto que leer— y los
   estilos y los `@keyframes pf-*` viven en css/plataforma.css (bloque F10). Lo que sigue al
   cursor lee `--px` y `--py`, que escribe `montarFondo()`. */
const VINETA = '<i class="pf-vineta"></i>';
const GRANO = '<i class="pf-grano"></i>';
const AL3D_FILA = '<span>AL3D</span>'.repeat(8);
const CABEZAL = '<i class="pf-cabeza"><b></b><s class="s1"></s><s class="s2"></s><s class="s3"></s></i>';
const CORTE = '<i class="pf-guia"></i><i class="pf-bar t"></i><i class="pf-bar r"></i><i class="pf-bar b"></i><i class="pf-bar l"></i>' + CABEZAL;
function fondoHTML(clave) {
  switch (clave) {
    case 'neon': return '<i class="pf-cielo"></i><i class="pf-neon-a"></i><i class="pf-neon-b"></i>' +
      '<i class="pf-sigue"><b class="pf-neon-foco"></b></i><i class="pf-neon-tubo"></i>' + VINETA + GRANO;
    case 'plano': return '<i class="pf-rejilla"></i><i class="pf-aro1"></i><i class="pf-aro2"><b></b></i>' +
      '<i class="pf-cota-x"><s></s><em></em><span>1 200 mm</span><em></em><s></s></i>' +
      '<i class="pf-cota-y"><s></s><em></em><span>800 mm</span><em></em><s></s></i>' +
      '<i class="pf-mira-x"></i><i class="pf-mira-y"></i><i class="pf-sigue"><b class="pf-rombo"></b></i>';
    case 'led': return '<i class="pf-cielo"></i><i class="pf-led-base"></i><i class="pf-led-barre"></i><i class="pf-led-dedo"></i>' + VINETA;
    case 'circulos': return '<i class="pf-capa c1"><b></b></i><i class="pf-capa c2"><b></b></i>' +
      '<i class="pf-capa c3"><b></b></i><i class="pf-capa c4"><b></b><b></b></i>';
    case 'letras': return '<i class="pf-cielo"></i>' +
      '<i class="pf-fila f1"><i>' + AL3D_FILA + '</i></i><i class="pf-fila f2"><i>' + AL3D_FILA + '</i></i>' +
      '<i class="pf-fila f3"><i>' + AL3D_FILA + '</i></i><i class="pf-sigue"><b class="pf-letras-luz"></b></i>' +
      '<i class="pf-letras-borde"></i>' + VINETA + GRANO;
    case 'cnc': return '<i class="pf-mesa"></i><i class="pf-corte k1">' + CORTE + '</i><i class="pf-corte k2">' + CORTE + '</i>' +
      '<i class="pf-aro1"></i><i class="pf-sigue"><b class="pf-mira"></b></i>';
    case 'particulas': return '<i class="pf-cielo"></i><canvas class="pf-lienzo"></canvas>' + VINETA;
    case 'ondas': return '<i class="pf-cielo"></i><i class="pf-sigue">' +
      '<b class="pf-onda o1"></b><b class="pf-onda o2"></b><b class="pf-onda o3"></b><b class="pf-onda o4"></b>' +
      '<b class="pf-punto"></b><b class="pf-late"></b></i><i class="pf-bruma"></i>';
    case 'acrilico': return '<i class="pf-cielo"></i><i class="pf-laminas">' +
      '<i class="l1"><b></b></i><i class="l2"><b></b></i><i class="l3"><b></b></i><i class="l4"><b></b></i></i>' +
      '<i class="pf-brillo"></i><i class="pf-bruma"></i>';
  }
  return '';
}

/**
 * Pone el fondo detrás de la caja y conecta el dedo. Devuelve con qué pararlo: la puerta lo
 * llama al entrar, y entonces se van el lienzo, sus cuadros y los oyentes.
 *
 * El dedo no repinta nada: `pointermove` escribe `--px` y `--py` (0–1) en la puerta y el CSS
 * los lee. `pointerleave` los regresa al centro.
 */
function montarFondo(caja) {
  const clave = fondoElegido();
  const viejo = caja.querySelector('.puerta-fondo');
  if (viejo) viejo.remove();
  const f = document.createElement('div');
  f.className = 'puerta-fondo';
  f.dataset.fondo = clave;
  f.setAttribute('aria-hidden', 'true');
  f.innerHTML = fondoHTML(clave);
  caja.prepend(f);

  let pt = null;
  const mover = ev => {
    const x = Math.min(1, Math.max(0, ev.clientX / (window.innerWidth || 1)));
    const y = Math.min(1, Math.max(0, ev.clientY / (window.innerHeight || 1)));
    caja.style.setProperty('--px', x.toFixed(3));
    caja.style.setProperty('--py', y.toFixed(3));
    pt = { x, y };
  };
  const salir = () => { caja.style.setProperty('--px', '.5'); caja.style.setProperty('--py', '.5'); pt = null; };
  /* Ondas: cada toque suelta su anillo, y el anillo se borra solo al terminar. Seis a la vez
     como mucho: un dedo nervioso no llena la pantalla de nodos. */
  const tocar = ev => {
    if (clave !== 'ondas' || sinMovimiento()) return;
    const o = document.createElement('b');
    o.className = 'pf-onda-clic';
    o.style.left = (ev.clientX / (window.innerWidth || 1) * 100).toFixed(2) + '%';
    o.style.top = (ev.clientY / (window.innerHeight || 1) * 100).toFixed(2) + '%';
    o.addEventListener('animationend', () => o.remove(), { once: true });
    f.appendChild(o);
    const todas = f.querySelectorAll('.pf-onda-clic');
    for (let i = 0; i < todas.length - 6; i++) todas[i].remove();
  };
  caja.addEventListener('pointermove', mover, { passive: true });
  caja.addEventListener('pointerleave', salir);
  caja.addEventListener('pointerdown', tocar, { passive: true });

  const lienzo = f.querySelector('.pf-lienzo');
  const pararLienzo = lienzo ? constelacion(lienzo, () => pt) : () => {};
  return () => {
    pararLienzo();
    caja.removeEventListener('pointermove', mover);
    caja.removeEventListener('pointerleave', salir);
    caja.removeEventListener('pointerdown', tocar);
    caja.style.removeProperty('--px');
    caja.style.removeProperty('--py');
  };
}

/* La constelación: puntos que se unen con líneas a menos de 120 px; el cursor los aparta en
   110 px y se conecta con los que tiene cerca. De 30 a 120 puntos según el área, para que un
   teléfono no cargue con los mismos que una pantalla de escritorio, y `devicePixelRatio` con
   tope de 2. Con movimiento reducido se pinta un cuadro y ya; con la pestaña escondida no se
   pinta ninguno y vuelve cuando la pestaña regresa. */
function constelacion(c, cursor) {
  const ctx = c.getContext && c.getContext('2d');
  if (!ctx) return () => {};
  let w = 0, h = 0, raf = 0, vivo = true;
  const pts = [];
  const ajusta = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = c.clientWidth; h = c.clientHeight;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.max(30, Math.min(120, w * h / 8000)));
    while (pts.length < n) pts.push({ x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .5, vy: (Math.random() - .5) * .5, r: Math.random() * 1.4 + .9 });
    pts.length = n;
  };
  const COL = ['#6290ff', '#9db4ff', '#7b6bff'];
  const cuadro = mueve => {
    ctx.clearRect(0, 0, w, h);
    const p = cursor(), mx = p ? p.x * w : null, my = p ? p.y * h : null;
    if (mueve) for (const a of pts) {
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0 || a.x > w) a.vx *= -1;
      if (a.y < 0 || a.y > h) a.vy *= -1;
      if (mx != null) {
        const dx = a.x - mx, dy = a.y - my, d = Math.hypot(dx, dy);
        if (d < 110 && d > 0) { a.x += dx / d * 1.4; a.y += dy / d * 1.4; }
      }
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 120) {
        ctx.strokeStyle = 'rgba(98,144,255,' + ((1 - d / 120) * .5).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    if (mx != null) {
      for (const a of pts) {
        const d = Math.hypot(a.x - mx, a.y - my);
        if (d < 190) {
          ctx.strokeStyle = 'rgba(190,205,255,' + ((1 - d / 190) * .8).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mx, my); ctx.stroke();
        }
      }
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, 160);
      g.addColorStop(0, 'rgba(98,144,255,.35)'); g.addColorStop(1, 'rgba(98,144,255,0)');
      ctx.fillStyle = g; ctx.fillRect(mx - 160, my - 160, 320, 320);
    }
    ctx.shadowBlur = 8;
    pts.forEach((a, i) => { ctx.fillStyle = ctx.shadowColor = COL[i % 3]; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.283); ctx.fill(); });
    ctx.shadowBlur = 0;
  };
  const vuelta = () => {
    raf = 0;
    if (!vivo || document.hidden) return;
    cuadro(true);
    raf = requestAnimationFrame(vuelta);
  };
  const arrancar = () => {
    if (!vivo || raf) return;
    if (sinMovimiento()) { cuadro(false); return; }
    raf = requestAnimationFrame(vuelta);
  };
  const alVolver = () => { if (!document.hidden) arrancar(); };
  ajusta();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { ajusta(); if (sinMovimiento()) cuadro(false); }) : null;
  if (ro) ro.observe(c);
  document.addEventListener('visibilitychange', alVolver);
  arrancar();
  return () => {
    vivo = false;
    if (raf) cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    document.removeEventListener('visibilitychange', alVolver);
  };
}

/** Lo que se ve cuando la puerta no se puede poner: un aviso y nada más. Lo usa también
 *  app.js cuando este módulo no carga. Tapa el documento entero y no deja nada tocable. */
export function sinPuerta() {
  const arr = $('pf-arranque'); if (arr) arr.hidden = true;
  for (const hijo of Array.from(document.body.children)) hijo.setAttribute('inert', '');
  const d = document.createElement('div');
  d.className = 'puerta-rota';
  d.setAttribute('role', 'alert');
  d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;' +
    'justify-content:center;padding:24px;text-align:center;background:#0b1020;color:#fff;font:16px/1.5 system-ui,sans-serif';
  d.innerHTML = '<div><p>No se pudo cargar la pantalla para entrar con Google, así que la plataforma no se abre.</p>' +
    '<p><button type="button" style="font:inherit;padding:10px 18px;border-radius:8px;border:0;cursor:pointer">Recargar</button></p></div>';
  d.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(d);
}

/** Cierra la sesión y vuelve a poner la puerta. Lo llama Ajustes: «Salir» dejaba la app
 *  abierta con los datos de quien salió en pantalla, que es lo contrario de salir. */
export function salir() {
  Ingreso.salir();
  Prefs.borrarPase();
  location.reload();
}
