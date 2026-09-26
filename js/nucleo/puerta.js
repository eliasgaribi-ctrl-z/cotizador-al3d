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
    if (r.estado === 'ok') return dentro('google', r.correo, r.rol);
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
function confirmarSuelto(conPantalla) {
  const real = confirmarDeVerdad(conPantalla);
  const conTope = Promise.race([
    real,
    new Promise(r => setTimeout(() => r({ estado: 'sin_red', tarde: true }),
                                conPantalla ? MS_CON_PANTALLA : MS_CALLADO)),
  ]);
  /* Si nadie más la espera y truena, que no salga por la consola como promesa sin atender. */
  real.catch(() => {});
  return { real, conTope };
}

async function confirmar(conPantalla) {
  return await confirmarSuelto(conPantalla).conTope;
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
 */
async function confirmarDeVerdad(conPantalla) {
  if (!Ingreso.configurado()) return { estado: 'sin_red' };

  const e = conPantalla ? await Ingreso.entrar(false) : await Ingreso.renovar();
  if (!e.ok) {
    /* Que la persona cierre la ventana de Google no es quedarse fuera para siempre: es no
       haber entrado todavía. Se trata como «no se pudo preguntar» y la puerta sigue puesta.
       El mensaje sí viaja tal cual: distinguir «cerraste la ventana» de «tu navegador la
       bloqueó» es la diferencia entre volver a intentar y saber qué hay que tocar. */
    return { estado: 'sin_red', mensaje: e.mensaje || '' };
  }

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

    pintar(caja, av, false);

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
      despertar();
      document.documentElement.classList.remove('con-puerta');
      caja.hidden = true;
      caja.innerHTML = '';
      /* Y se devuelve el esqueleto del arranque, que se escondió para que no se viera por
         debajo. Sin esto, entre entrar y ver el Tablero hay una pantalla EN BLANCO —abrir la
         base, sembrar el catálogo, montar— y en un teléfono viejo eso son segundos en los que
         parece que la app se murió justo al entrar. */
      if (arr) arr.hidden = false;
      resolve(dentro('google', r.correo, r.rol));
    };

    /* La comprobación que se pasó del tope pero seguía viva. Si contesta que sí, adentro. Si
       contesta «fuera», se cambia el cartel por el que de verdad explica lo que pasa. */
    if (pendiente) pendiente.then(r => {
      if (caja.hidden) return;                       // ya entró por el botón: llegó tarde
      if (r && r.estado === 'ok') return entrar(r);
      if (r && r.estado === 'fuera') { Prefs.borrarPase(); pintar(caja, MSG.FUERA(r.correo || ''), false); }
    }).catch(() => {});

    caja.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-puerta]');
      if (!b) return;
      if (b.dataset.puerta === 'otra') {
        /* «Entrar con otra cuenta»: se suelta la sesión de ESTE aparato para que Google
           vuelva a preguntar cuál, en vez de reintentar con la que acaba de ser rechazada.
           Sin `await`: lo que había aquí era un `await import(...)` y esperar dentro del
           manejador del clic es exactamente lo que hace que el navegador tape la ventana. */
        Ingreso.salir();
        Prefs.borrarPase();
      }
      pintar(caja, av, true);
      /* `true`: esto sale de un click, así que aquí SÍ se puede abrir la ventana de Google.
         Es la única parte del arranque donde eso es posible. */
      const r = await confirmar(true);
      if (r.estado === 'ok') return entrar(r);
      av = r.estado === 'fuera' ? MSG.FUERA(r.correo)
         : (r.mensaje ? aviso(r.mensaje) : MSG.SIN_RED_PRIMERA);
      pintar(caja, av, false);
    });
  });
}

function pintar(caja, av, esperando) {
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
  caja.innerHTML =
    '<div class="puerta-caja">' +
      '<img class="puerta-logo logoimg" src="' + logo + '" width="72" height="36" alt="AL3D">' +
      '<h1>La plataforma del taller</h1>' +
      '<p class="puerta-sub">Entra con la cuenta de Google que usas en AL3D. ' +
        'La app solo le pide a Google tu correo, y con eso sabe qué te toca hacer.</p>' +
      (cuerpo ? '<p class="puerta-aviso' + (fuera ? ' es-no' : '') + '" role="alert">' + cuerpo + '</p>' : '') +
      '<button type="button" class="puerta-btn" data-puerta="entrar"' + (esperando ? ' disabled' : '') + '>' +
        (esperando
          ? '<span class="esq-giro" aria-hidden="true"></span> Entrando…'
          : G_GOOGLE + ' Entrar con Google') +
      '</button>' +
      (fuera ? '<button type="button" class="puerta-otra" data-puerta="otra">Entrar con otra cuenta</button>' : '') +
      '<p class="puerta-pie">' +
        '<a href="acerca.html">Qué es esto</a> · ' +
        '<a href="privacidad.html">Privacidad</a> · ' +
        '<a href="condiciones.html">Condiciones</a>' +
      '</p>' +
    '</div>';
  if (!esperando) {
    const b = caja.querySelector('[data-puerta="entrar"]');
    if (b) b.focus();
  }
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
