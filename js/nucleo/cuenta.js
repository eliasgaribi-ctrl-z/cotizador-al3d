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
import { $, esc } from './ui.js';

/** Pinta el botón y su menú. `quien` es lo que devolvió `Puerta.custodiar()`. */
export function montar(quien) {
  const btn = $('pf-cuenta');
  const menu = $('pf-cuenta-menu');
  if (!btn || !menu || !quien) return;

  const correo = quien.correo || '';
  const rol = Prefs.ROL_NOMBRE[quien.rol] || '';
  const inicial = (correo.trim()[0] || '?').toUpperCase();

  btn.textContent = inicial;
  btn.title = correo ? 'Tu cuenta: ' + correo : 'Tu cuenta';
  btn.setAttribute('aria-label', btn.title);
  btn.hidden = false;

  menu.innerHTML =
    '<div class="pf-cuenta-quien">' +
      '<span class="pf-cuenta-ava" aria-hidden="true">' + esc(inicial) + '</span>' +
      '<span class="pf-cuenta-dat">' +
        '<b>' + esc(correo || 'Sin cuenta') + '</b>' +
        (rol ? '<span>' + esc(rol) + '</span>' : '') +
      '</span>' +
    '</div>' +
    '<p class="pf-cuenta-nota">Tu sesión se queda guardada en este aparato. No tienes que volver a entrar hasta que cierres sesión.</p>' +
    '<button type="button" class="pf-cuenta-op" data-cuenta="ajustes">Ajustes</button>' +
    '<button type="button" class="pf-cuenta-op es-salir" data-cuenta="salir">Cerrar sesión</button>';

  const abrir = si => {
    menu.hidden = !si;
    btn.setAttribute('aria-expanded', String(si));
    if (si) { const b = menu.querySelector('button'); if (b) b.focus(); }
  };

  btn.onclick = ev => { ev.stopPropagation(); abrir(menu.hidden); };
  menu.onclick = async ev => {
    const b = ev.target.closest('[data-cuenta]');
    if (!b) return;
    abrir(false);
    if (b.dataset.cuenta === 'ajustes') { location.hash = '#/ajustes'; return; }
    if (b.dataset.cuenta === 'salir') {
      if (!confirm('¿Cerrar sesión en este aparato? Vas a tener que volver a entrar con Google.')) return;
      const Puerta = await import('./puerta.js');
      Puerta.salir();
    }
  };
  document.addEventListener('click', ev => {
    if (!menu.hidden && !menu.contains(ev.target) && ev.target !== btn) abrir(false);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !menu.hidden) { abrir(false); btn.focus(); }
  });
}
