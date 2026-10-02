/* ============================================================================
   Lo que tiene que pasar antes del primer pintado del editor de publicaciones.

   Es un guion clásico en el <head> y no parte de editor.js por tiempo: un módulo corre
   después de leer el documento entero, y para entonces la barra de arriba ya se vio.

   Tres cosas, las mismas que el anidador hace en línea (allá la política deja guiones en
   línea; aquí no, y así se queda):

   1. LA PUERTA. Abierto suelto, el editor se saltaba la pantalla de entrar de la plataforma.
      Empotrado —que es como se usa, desde ./#/publicaciones— no hace nada: si hay marco, la
      puerta ya se pasó del otro lado. Mismas exenciones que en cotizador.html.
   2. EMPOTRADO. Dentro de la plataforma el encabezado de allá ya dice «Publicaciones»; la
      barra propia se esconde antes de pintarse, no un instante después.
   3. ARRANCANDO. js/mod/herramientas.js espera a que esta clase se vaya para quitar su
      silueta de carga. Tope de ocho segundos y el primer error la quitan también, para que
      nunca tape una página que sí funciona.
   ============================================================================ */
(function () {
  var html = document.documentElement;
  var empotrado = false;
  try { empotrado = parent !== window; } catch (_) { empotrado = true; }

  if (!empotrado && !/motor\.html$/.test(location.pathname)) {
    try {
      var h = location.hostname;
      var local = location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '';
      var p = null;
      try { p = JSON.parse(localStorage.getItem('al3d_pf_pase') || 'null'); } catch (_) {}
      if (!local && !(p && p.correo && Number(p.hasta) > Date.now())) {
        location.replace('../#/publicaciones');
        return;
      }
    } catch (_) {}
  }

  if (empotrado) html.classList.add('empotrado');
  html.classList.add('arrancando');
  var quitar = function () { html.classList.remove('arrancando'); };
  setTimeout(quitar, 8000);
  window.addEventListener('error', quitar, { once: true });
})();
