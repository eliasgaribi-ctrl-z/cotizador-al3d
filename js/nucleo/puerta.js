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

const MSG = {
  FUERA: correo => 'Entraste como <b>' + esc(correo) + '</b>, pero ese correo no tiene acceso a la plataforma. ' +
                   'Pídele a Dirección que te dé de alta.',
  SIN_RED_PRIMERA: 'Para entrar por primera vez en este aparato hace falta señal: hay que preguntarle a la hoja qué te toca hacer. ' +
                   'Conéctate y vuelve a intentar.',
  CADUCO: correo => 'Hace más de ' + DIAS_PASE + ' días que no se puede confirmar el acceso de <b>' + esc(correo) +
                    '</b>. Conéctate a internet y vuelve a entrar.',
};

/* El resultado de custodiar(), para que app.js no tenga que adivinar. */
const dentro = (via, correo, rol, nota) => ({ ok: true, via, correo, rol, nota: nota || '' });

/**
 * Deja entrar, o no deja. Devuelve una promesa que **solo se resuelve cuando hay derecho a
 * pasar**: mientras no lo haya, la pantalla de la puerta se queda puesta y la promesa
 * pendiente. app.js no monta un solo módulo hasta que esto conteste.
 *
 * @returns {Promise<{ok:true, via:string, correo:string, rol:string, nota:string}>}
 */
export async function custodiar() {
  const cfgPuente = Prefs.puente();
  const hayToken = !!(cfgPuente && cfgPuente.token);

  /* 1. EL PASE VIVO. Se confirma contra la hoja y se renueva, callado. Es el camino de todas
        las mañanas y no enseña nada: quien ya entró en este aparato y tiene su sesión de
        Google viva no tiene por qué ver una pantalla de entrada. */
  const p = Prefs.pase();
  if (p) {
    const r = await confirmar();
    if (r.estado === 'ok') return dentro('google', r.correo, r.rol);
    if (r.estado === 'fuera') {
      /* La hoja dijo que este correo ya no tiene acceso. Se cierra, y el token de
         dispositivo NO rescata: si rescatara, quitar a alguien de «Accesos» no serviría de
         nada en el teléfono donde hubiera un token pegado. El día que alguien se va del
         taller con un token en el bolsillo, lo que toca es rotarlo desde la hoja —menú
         ⚡ AL3D → Tokens del puente—, y eso ya estaba escrito en ingreso.js. */
      Prefs.borrarPase();
      return await pedirEntrada(MSG.FUERA(r.correo || p.correo));
    }
    /* 'sin_red' — se entra con lo que ya se sabía, y se dice cuánto le queda al pase. */
    return dentro('google', p.correo, p.rol, avisoDePase(p));
  }

  /* 2. YA ENTRÓ AQUÍ ALGUNA VEZ, pero el pase caducó o nunca llegó a guardarse. Se intenta la
        renovación callada antes de enseñar nada: si la sesión de Google de este navegador
        sigue viva, la persona no tiene por qué volver a apretar un botón. */
  const viejo = Prefs.get(Prefs.CLAVES.PASE, null);
  const correoPrevio = (viejo && viejo.correo) || (Prefs.ingreso() && Prefs.ingreso().correo) || '';
  if (correoPrevio) {
    const r = await confirmar();
    if (r.estado === 'ok') return dentro('google', r.correo, r.rol);
    if (r.estado === 'fuera') { Prefs.borrarPase(); return await pedirEntrada(MSG.FUERA(r.correo || correoPrevio)); }
    if (hayToken) return porToken();
    return await pedirEntrada(viejo ? MSG.CADUCO(correoPrevio) : '');
  }

  /* 3. LA SALIDA DE EMERGENCIA. Un aparato con token de dispositivo pegado a mano entra sin
        preguntarle a Google. Va la ÚLTIMA y no la primera: pegar un token es un acto
        deliberado de Dirección para un aparato concreto, no el camino normal, y ponerlo
        delante hacía que el teléfono de quien lo tuviera no viera nunca la puerta —ni
        siquiera el de Elías, que es justo donde hay que poder probarla—. */
  if (hayToken) return porToken();

  /* 4. Nadie ha entrado aquí y no hay token. La puerta, y a esperar. */
  return await pedirEntrada('');
}

const porToken = () => dentro('token', '', Prefs.rol(),
  'Entraste con el token de este aparato, no con una cuenta de Google: la plataforma no sabe quién eres y el rol lo decide este teléfono.');

/* ----------------------------------------------------------------------------
   Confirmar contra la hoja
   ---------------------------------------------------------------------------- */

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
async function confirmar(conPantalla) {
  let Ingreso, Puente;
  try {
    Ingreso = await import('./ingreso.js');
    Puente  = await import('../datos/puente.js');
  } catch (_) {
    return { estado: 'sin_red' };   // el service worker no tenía el módulo: no es culpa de nadie
  }
  if (!Ingreso.configurado()) return { estado: 'sin_red' };

  const e = conPantalla ? await Ingreso.entrar(false) : await Ingreso.renovar();
  if (!e.ok) {
    /* Que la persona cierre la ventana de Google no es quedarse fuera para siempre: es no
       haber entrado todavía. Se trata como «no se pudo preguntar» y la puerta sigue puesta. */
    return { estado: 'sin_red', mensaje: e.mensaje || '' };
  }

  const relevo = Puente.desdePrefs();
  if (!relevo) return { estado: 'sin_red' };
  let s;
  try { s = await relevo.salud(); } catch (_) { return { estado: 'sin_red' }; }

  if (s.ok && s.via === 'google' && s.correo && Prefs.ROLES.includes(s.rol)) {
    Prefs.setPase({ correo: s.correo, rol: s.rol, hasta: Date.now() + MS_PASE, visto: Date.now() });
    return { estado: 'ok', correo: s.correo, rol: s.rol };
  }
  /* La hoja contestó, y contestó que no. `ROL_SIN_PERMISO` con un token de Google por
     delante solo puede significar una cosa: ese correo no está en «Accesos». */
  if (s.codigo === 'ROL_SIN_PERMISO') {
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
 * @param {string} aviso marcado ya escapado, o '' la primera vez.
 */
function pedirEntrada(aviso) {
  return new Promise(resolve => {
    const caja = $('pf-puerta');
    if (!caja) {
      /* Sin el marcado no hay puerta que enseñar. Antes que dejar la app colgada para
         siempre en una pantalla que no existe, se entra y se dice por qué: un index.html a
         medias es un error de despliegue, no un intento de colarse. */
      console.error('falta #pf-puerta en el documento: se entra sin puerta');
      return resolve(dentro('token', '', Prefs.rol(),
        'Esta copia de la plataforma está incompleta y no pudo pedir tu cuenta de Google. Recárgala.'));
    }
    /* El esqueleto del arranque estorba debajo: la puerta tapa la pantalla entera y detrás
       no debe quedar la silueta del tablero de alguien. */
    const arr = $('pf-arranque');
    if (arr) arr.hidden = true;
    document.documentElement.classList.add('con-puerta');
    caja.hidden = false;

    pintar(caja, aviso, false);

    caja.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-puerta]');
      if (!b) return;
      if (b.dataset.puerta === 'otra') {
        /* «Entrar con otra cuenta»: se suelta la sesión de ESTE aparato para que Google
           vuelva a preguntar cuál, en vez de reintentar con la que acaba de ser rechazada. */
        try { (await import('./ingreso.js')).salir(); } catch (_) {}
        Prefs.borrarPase();
      }
      pintar(caja, aviso, true);
      /* `true`: esto sale de un click, así que aquí SÍ se puede abrir la ventana de Google.
         Es la única parte del arranque donde eso es posible. */
      const r = await confirmar(true);
      if (r.estado === 'ok') {
        document.documentElement.classList.remove('con-puerta');
        caja.hidden = true;
        caja.innerHTML = '';
        /* Y se devuelve el esqueleto del arranque, que se escondió para que no se viera por
           debajo. Sin esto, entre apretar «Entrar» y ver el Tablero hay una pantalla EN
           BLANCO —abrir la base, sembrar el catálogo, montar— y en un teléfono viejo eso son
           segundos en los que parece que la app se murió justo al entrar. */
        if (arr) arr.hidden = false;
        return resolve(dentro('google', r.correo, r.rol));
      }
      aviso = r.estado === 'fuera' ? MSG.FUERA(r.correo) : (r.mensaje || MSG.SIN_RED_PRIMERA);
      pintar(caja, aviso, false);
    });
  });
}

function pintar(caja, aviso, esperando) {
  const fuera = /no tiene acceso/.test(aviso || '');
  caja.innerHTML =
    '<div class="puerta-caja">' +
      '<img class="puerta-logo" src="logo-al3d.svg" width="72" height="36" alt="AL3D">' +
      '<h1>La plataforma del taller</h1>' +
      '<p class="puerta-sub">Entra con la cuenta de Google que usas en AL3D. ' +
        'La app solo le pide a Google tu correo, y con eso sabe qué te toca hacer.</p>' +
      (aviso ? '<p class="puerta-aviso' + (fuera ? ' es-no' : '') + '" role="alert">' + aviso + '</p>' : '') +
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

/** Cierra la sesión y vuelve a poner la puerta. Lo llama Ajustes: «Salir» dejaba la app
 *  abierta con los datos de quien salió en pantalla, que es lo contrario de salir. */
export async function salir() {
  try { (await import('./ingreso.js')).salir(); } catch (_) {}
  Prefs.borrarPase();
  location.reload();
}
