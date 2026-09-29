/* ============================================================================
   Las piezas compartidas de la interfaz.

   Un solo archivo para las cuatro superficies —cotizador, plataforma, anidador y las páginas
   públicas—, y por eso es un guion CLÁSICO y no un módulo: el cotizador es un puñado de
   guiones clásicos que comparten el ámbito global y llama a toast() mientras carga, y un
   módulo llega diferido. Aquí se cuelga todo de `window.Piezas`; la plataforma, que sí es de
   módulos, lo pide por ese nombre, y js/nucleo/ui.js lo envuelve donde tiene que conservar su
   firma de siempre.

   Hasta aquí había dos toast(), dos copiarTexto() y dos hojas que se bajan con el dedo, una por
   app, y cada arreglo había que hacerlo dos veces: la segunda se olvidaba. La regla es una
   sola implementación por patrón, y esta es esa implementación. Lo que dependa de Q, de las
   partidas, de un proyecto o de la hoja NO vive aquí: esto solo sabe de pantalla.

   Tres reglas que valen para todo lo de abajo, y que no se negocian:
     · Nada se mueve solo. Se mueve porque alguien tocó algo, o es un momento breve que se
       apaga. La única pieza que se mueve sola es el botón de «Cotizar con IA», y no está aquí.
     · Menos movimiento apaga el adorno, no la información: una mecha o un relleno de avance
       se quedan, quietos o en un fundido.
     · Sin manejadores en línea. La plataforma no deja ejecutar guiones en línea (su política
       de contenido no trae 'unsafe-inline'), así que todo se cuelga con addEventListener.

   El estilo de cada pieza vive en css/sistema.css, capa 4, en el bloque «Piezas compartidas»,
   y su apagado en el bloque de movimiento reducido del cierre de la capa 8.
   ============================================================================ */
(function (g) {
  'use strict';
  if (!g || !g.document) return;          // node, en las pruebas que leen este archivo
  const P = g.Piezas || (g.Piezas = {});
  const d = g.document;

  /* ----- Lo que todas comparten ----- */

  /* Menos movimiento, preguntado en el momento: la preferencia se puede cambiar con la app
     abierta, y una respuesta guardada al cargar se queda vieja. */
  P.sinMovimiento = () => { try { return g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  /* Puntero fino: el hover, el «caliente» y lo que se levanta al pasar solo existen con ratón. */
  P.punteroFino = () => { try { return g.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (_) { return false; } };
  /* El mismo escapado que las dos apps, con el apóstrofo incluido. */
  P.esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  P.$ = x => (typeof x === 'string' ? d.getElementById(x) : x);

  /* ==========================================================================
     1 · AVISOS Y BOTONES QUE DICEN LO QUE PASA
     ========================================================================== */

  /* ── fin de 1 ── */

  /* ==========================================================================
     2 · HOJAS, LISTAS Y TRANSICIONES
     ========================================================================== */

  /* ── fin de 2 ── */

  /* ==========================================================================
     3 · NÚMEROS, MEDIDAS Y CAMPOS
     ========================================================================== */

  /* ── fin de 3 ── */

  /* ==========================================================================
     4 · SEÑALAR, EXPLICAR Y SELLAR
     ========================================================================== */

  /* ── fin de 4 ── */
})(typeof window !== 'undefined' ? window : undefined);
