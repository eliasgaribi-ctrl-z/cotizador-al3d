/* ============================================================================
   QUÉ SE TIRA Y QUÉ SE GUARDA AL CAMBIAR DE PANTALLA.

   Esto es el router pensando, sin tocar el DOM. Está aparte de js/app.js por una razón
   práctica y no por gusto de arquitectura: app.js se arranca solo en su última línea
   —`arrancarUnaVez()`— así que importarlo desde una prueba de node levanta la plataforma
   entera. Aquí no hay nada que levantar: entran nombres de ruta y sale una lista de nombres
   de ruta, y por eso pruebas/conservar.mjs puede fijar en node, sin navegador y sin Chromium,
   el comportamiento de la parte más sensible de la app. Es el mismo criterio con el que ya
   viven las funciones puras de js/datos/proyectos.js.

   ----- EL PROBLEMA QUE RESUELVE -----

   `montarDeVerdad` hacía `cont.innerHTML = ''` en CADA montaje, y js/mod/cotizador.js volvía
   a escribir su `<iframe src="cotizador.html">` desde cero. Salir del Cotizador y volver
   reinterpretaba los doce guiones del cotizador: 795 KB medidos con
   `performance.getEntriesByType('resource')` dentro del marco, 329 ms en localhost. El
   comentario de ese módulo ya lo tenía escrito para su propia pantalla de carga: «entre 240 y
   500 ms… en un teléfono con señal mala son segundos».

   Y el módulo YA reconocía media verdad: `ctx.sinRemonte(true)` existe justo para que el
   oyente de 'storage' no le mate el marco. Lo que faltaba es que la navegación normal entre
   pantallas tampoco se lo matara.

   ----- LA MEMORIA, QUE ES LA OBJECIÓN DE VERDAD -----

   «Dejar vivo un documento de 795 KB de JS en un iPhone viejo cuesta», y es cierto. Lo que
   hay que medir es contra QUÉ cuesta, y la respuesta sorprende: esa memoria YA SE ESTABA
   PAGANDO.

   El router nunca vació la sección que se abandona; solo vacía la que va a montar. Así que
   hoy, al salir del Cotizador, `#mod-cotizador` se queda con el `<iframe>` dentro —oculto,
   con su documento vivo— hasta que alguien VUELVE al Cotizador, que es cuando se destruye
   para construir otro. Lo peor de las dos opciones: se paga la memoria Y se paga la recarga.
   Y como son tres las pantallas de marco —Cotizador, Mesa de corte y Vectorizador, y este
   último es OTRA copia entera de cotizador.html—, visitar las tres deja tres documentos
   residentes hasta que se recargue la app.

   Con lo de aquí, el balance cambia en los dos ejes a la vez:

     · `TOPE_CONSERVADAS` pone un techo que antes no existía. Al pasarse, la conservada más
       vieja se desmonta Y SE LE VACÍA LA SECCIÓN, cosa que hoy no ocurre nunca.
     · Y la que sobrevive no se vuelve a interpretar al volver.

   O sea: como máximo UN documento de marco residente, contra los hasta tres de ahora, y sin
   los 795 KB de análisis en cada visita. No es un intercambio de memoria por velocidad; es
   menos de las dos cosas.

   ----- POR QUÉ EL TOPE ES UNO -----

   Con TOPE_CONSERVADAS = 1 el caso que duele queda arreglado entero: Cotizador → Proyectos
   → Cotizador es instantáneo, y lo mismo Mesa de corte → Tablero → Mesa de corte. Lo que
   sigue costando es saltar de una pantalla de marco a OTRA pantalla de marco, que es el
   movimiento raro —y el único que duplicaría documentos en el teléfono del taller—.

   Además el tope sostiene un invariante que js/mod/herramientas.js necesita y no puede
   defender solo: ese módulo tiene UN juego de estado de módulo (`_cont`, `_marcoId`,
   `_reloj`) para DOS rutas, así que dos instancias vivas a la vez se pisarían. Subir esta
   constante sin arreglar aquello deja dos marcos peleándose por las mismas variables;
   herramientas.js lo dice por consola si llega a pasar, pero el sitio donde hay que leerlo
   es éste.

   Subirlo es cambiar un número, y la prueba ya cubre el caso de tope 2.
   ============================================================================ */

/** Cuántas pantallas conservadas pueden estar vivas a la vez. Ver arriba. */
export const TOPE_CONSERVADAS = 1;

/**
 * Qué hacer con lo que hay montado al ir de `actual` a `destino`.
 *
 * Nada de esto toca el DOM ni importa módulos: son nombres de ruta entrando y saliendo. El
 * router traduce el plan a efectos, en este orden: soltar → ocultar → (reutilizar | montar).
 *
 * @param {object} e
 * @param {?string} e.actual     la ruta que está en pantalla, o null al arrancar.
 * @param {string}  e.destino    a dónde se va.
 * @param {string[]} e.vivas     rutas con módulo montado, DE LA MÁS VIEJA A LA MÁS RECIENTE.
 *                               El orden es el que decide a quién se poda, así que el router
 *                               tiene que reinsertar una ruta al final cada vez que la monta
 *                               o la vuelve a enseñar.
 * @param {boolean} [e.forzar]   un refresco explícito: lo que hay en la sección no sirve.
 * @param {number}  [e.tope]     cuántas conservadas caben vivas. Por defecto, el TOPE de arriba.
 * @param {(r:string)=>boolean} e.conservar   ¿esta ruta lleva la marca `conservar`?
 * @param {(r:string)=>boolean} [e.permitida] ¿el rol de AHORA tiene esta ruta? Lo que ya no
 *                               se puede abrir no merece un documento vivo en el teléfono.
 * @returns {{ocultar:?string, soltar:string[], vaciar:string[], reutilizar:boolean}}
 *   · `soltar`: desmontar y olvidar, antes que nada.
 *   · `vaciar`: de las soltadas, a cuáles hay que vaciarles la sección porque nadie va a
 *     montar encima. Es lo que de verdad libera el documento del `<iframe>`.
 *   · `ocultar`: la que se abandona y sobrevive. Se le avisa; no se desmonta.
 *   · `reutilizar`: lo que hay en la sección del destino sirve tal cual. Ni se vacía, ni se
 *     vuelve a llamar a `mod.montar`, ni hay esqueleto ni barra de progreso que enseñar.
 */
export function planDeMontaje(e) {
  const destino = e.destino;
  const actual = e.actual || null;
  const vivas = Array.isArray(e.vivas) ? e.vivas.slice() : [];
  const forzar = !!e.forzar;
  const tope = Number.isFinite(e.tope) ? Math.max(0, e.tope) : TOPE_CONSERVADAS;
  const conservar = typeof e.conservar === 'function' ? e.conservar : () => false;
  const permitida = typeof e.permitida === 'function' ? e.permitida : () => true;

  const viva = r => !!r && vivas.indexOf(r) >= 0;
  const soltar = [];
  const vaciar = [];

  /* ¿Sirve lo que ya está en la sección del destino? Tres condiciones, y las tres hacen
     falta: que esa ruta se conserve, que su módulo siga vivo, y que nadie haya pedido
     rehacerla. */
  const reutilizar = !forzar && conservar(destino) && viva(destino);

  /* Si en el destino quedó algo vivo y NO se va a reutilizar, se desmonta ANTES de montar
     encima. Sin esta línea, un refresco forzado sobre una pantalla conservada —lo que hacen
     `ctx.refrescar()`, el cambio de rol y la sincronización callada— montaría un módulo
     nuevo sobre uno que nadie va a desmontar nunca: sus oyentes de `resize` y su oyente de
     `message` se quedarían encima de todas las demás pantallas. Es exactamente el modo de
     falla que la cola de montajes de app.js ya documenta con `_vivo`. */
  if (viva(destino) && !reutilizar) soltar.push(destino);

  /* La que se abandona y no se conserva: se desmonta, como siempre. Su sección NO se vacía,
     porque nunca se vació: la vacía su próximo montaje. Aquí no se cambia nada. */
  if (actual && actual !== destino && viva(actual) && !conservar(actual)) soltar.push(actual);

  /* Las conservadas que se quedarían vivas sin estar en pantalla. `vivas` viene de la más
     vieja a la más reciente, y la que se acaba de abandonar es la última: es justo la que
     más vale la pena guardar, y la primera en podarse es la más vieja. */
  const dormidas = vivas.filter(r => r !== destino && conservar(r) && soltar.indexOf(r) < 0);
  const fueraDeRol = dormidas.filter(r => !permitida(r));
  const enRol = dormidas.filter(r => permitida(r));
  /* El cupo: si el destino se conserva, ocupa una plaza —va a estar vivo igual—, así que se
     descuenta. Descontarla ANTES de montar es lo que hace que el pico nunca llegue a dos
     documentos de marco a la vez, que es de lo que se trataba. */
  const cupo = Math.max(0, tope - (conservar(destino) ? 1 : 0));
  const podadas = enRol.slice(0, Math.max(0, enRol.length - cupo));
  for (const r of fueraDeRol.concat(podadas)) { soltar.push(r); vaciar.push(r); }

  /* Y la que se va, si sobrevivió a todo lo anterior. Se pregunta por `soltar` y no por las
     condiciones otra vez: una ruta podada no puede además «ocultarse», o se le llamaría a
     `ocultar()` y a `desmontar()` en la misma navegación. */
  const ocultar = (actual && actual !== destino && viva(actual) &&
                   conservar(actual) && soltar.indexOf(actual) < 0) ? actual : null;

  return { ocultar, soltar, vaciar, reutilizar };
}
