/* ============================================================================
   LA CUENTA — quién está dentro, siempre a la vista, y cómo salir.

   Hasta aquí, saber con qué cuenta estabas dentro y cerrar la sesión eran dos renglones
   perdidos en Ajustes. Una app en la que no ves quién eres ni encuentras dónde salir no se
   siente como una app. Esto pone un botón redondo con tu inicial en el encabezado —en el
   teléfono y en la computadora— y al tocarlo dice tu correo, tu rol y deja cerrar sesión.

   Cerrar sesión es lo mismo que ya hacía Ajustes (`Puerta.salir()`): borra el pase, suelta
   el token de Google de este aparato y vuelve a la pantalla de entrar.
   ============================================================================ */

import * as Prefs from '../datos/prefs.js';
import { $, esc, confirmarPf } from './ui.js';

/** Pinta el botón y su menú. `quien` es lo que devolvió `Puerta.custodiar()`. */
export function montar(quien) {
  const btn = $('pf-sesion');
  if (!btn || !quien) return;

  const correo = quien.correo || '';
  const rol = Prefs.ROL_NOMBRE[quien.rol] || '';
  const inicial = (correo.trim()[0] || '?').toUpperCase();

  btn.textContent = inicial;
  btn.title = correo ? 'Tu cuenta: ' + correo : 'Tu cuenta';
  btn.setAttribute('aria-label', btn.title);
  btn.hidden = false;

  const cuerpo =
    '<div class="pf-sesion-quien">' +
      '<span class="pf-sesion-ava" aria-hidden="true">' + esc(inicial) + '</span>' +
      '<span class="pf-sesion-dat">' +
        '<b>' + esc(correo || 'Sin cuenta') + '</b>' +
        (rol ? '<span>' + esc(rol) + '</span>' : '') +
      '</span>' +
    '</div>' +
    '<p class="pf-sesion-nota">Tu sesión se queda guardada en este aparato. No tienes que volver a entrar hasta que cierres sesión.</p>' +
    '<button type="button" class="pf-sesion-op" data-cuenta="ajustes">Ajustes</button>' +
    '<button type="button" class="pf-sesion-op es-salir" data-cuenta="salir">Cerrar sesión</button>';

  /* ----- F28 · EL MENÚ SALE DE SU BOTÓN -----
     Aparecía de golpe, con `role="menu"` y sin navegación con flechas: decir que es un menú sin
     serlo. Ahora lo abre la pieza 4 (el globo): crece desde la esquina del disco de la cuenta,
     se cierra tocando fuera, con Escape y al tabular pasado el último botón, y el foco vuelve
     al disco.

     Lo que se va con esto son los DOS oyentes de `document` que había aquí —un clic global y un
     keydown global, vivos toda la sesión para algo que se abre tres veces al día— y el
     `#pf-sesion-menu` del HTML: el globo se pinta solo en la capa superior, así que no necesita
     z-index ni vivir dentro del encabezado.

     El rol es de DIÁLOGO y no de menú. La ficha dejaba elegir —«el rol debe ser de diálogo, o
     el menú necesita flechas»— y lo que hay dentro no son solo opciones: el renglón de quién
     eres y una nota van antes de «Ajustes» y «Cerrar sesión». Un `role="menu"` con párrafos
     dentro no cumple lo que promete (sus hijos tienen que ser elementos de menú), y la pieza le
     pondría `menuitem` a los botones y flechas a un panel de dos renglones. Como diálogo, el
     lector dice «Tu cuenta», lee el correo y encuentra dos botones; el tabulador los recorre.

     `alinear:'fin'` porque el botón está pegado al filo derecho del encabezado: alineado al
     principio, el globo se salía de la pantalla en el teléfono. */
  const P = typeof window !== 'undefined' ? window.Piezas : null;
  if (!P || !P.vistazo) {
    /* Sin las piezas no hay globo, pero un botón que no hace nada es peor que uno que lleva a
       donde vive «Salir». */
    btn.onclick = () => { location.hash = '#/ajustes'; };
    return;
  }
  const menu = P.vistazo(btn, {
    rol: 'dialog', alinear: 'fin', lado: 'abajo', titulo: 'Tu cuenta',
    clase: 'pf-sesion-vz', contenido: cuerpo,
  });
  if (!menu) return;

  menu.pop.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-cuenta]');
    if (!b) return;
    /* El globo vive en la capa superior del navegador, por encima de cualquier modal: si se
       quedara abierto, flotaría encima de la pregunta de «¿Cerrar sesión?» que viene enseguida.
       Se cierra ANTES de preguntar, y el foco vuelve al disco de la cuenta. */
    menu.cerrar('codigo');
    if (b.dataset.cuenta === 'ajustes') { location.hash = '#/ajustes'; return; }
    if (b.dataset.cuenta === 'salir') {
      if (!await confirmarPf({ titulo: '¿Cerrar sesión en este aparato?', texto: 'Vas a tener que volver a entrar con Google.',
        si: 'Cerrar sesión', no: 'Seguir dentro', peligro: true })) return;
      const Puerta = await import('./puerta.js');
      Puerta.salir();
    }
  });
}
