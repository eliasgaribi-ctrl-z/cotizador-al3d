/* ============================================================================
   El tema: claro, oscuro o el del sistema.

   Es un script CLÁSICO y va en el <head> de las tres páginas —index.html, cotizador.html y
   el anidador— ANTES de las hojas de estilo, a propósito: decide el tema leyendo una clave
   de localStorage y pone `data-tema` en <html> antes del primer pintado. Si corriera
   después, cada apertura en oscuro parpadearía en claro un cuadro.

   Una sola clave, `al3d_tema`, con tres valores: 'claro', 'oscuro' o 'auto' (el del
   sistema). Las hojas solo conocen DOS estados —`html[data-tema="oscuro"]` y el resto—, así
   que 'auto' se resuelve aquí con matchMedia y se vuelve a resolver si el sistema cambia a
   media tarde.

   El cotizador vive empotrado en un <iframe> de la plataforma. Los dos documentos leen la
   misma clave, y cuando uno la cambia el otro recibe el evento 'storage' —que solo llega a
   los documentos que NO escribieron— y se pone al día. Sin protocolo nuevo: es el mismo
   idioma que ya usan al3d_historial y al3d_anidar.

   Sin localStorage —Safari privado— funciona igual, sin recordar. */
(function () {
  var CLAVE = 'al3d_tema';
  var COLOR = { claro: '#4060f8', oscuro: '#12142a' };
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function guardado() {
    try { var v = localStorage.getItem(CLAVE); return v === 'oscuro' || v === 'claro' ? v : 'auto'; }
    catch (_) { return 'auto'; }
  }
  function efectivo(pref) {
    if (pref === 'oscuro' || pref === 'claro') return pref;
    return (mq && mq.matches) ? 'oscuro' : 'claro';
  }
  function aplicar() {
    var pref = guardado(), t = efectivo(pref);
    var h = document.documentElement;
    h.setAttribute('data-tema', t);
    h.setAttribute('data-tema-pref', pref);
    /* El color de la barra del navegador y del marco de la PWA. Un <meta> no entiende
       var(), así que el número se repite aquí; pruebas/hojas-de-estilo.mjs lo amarra. */
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', COLOR[t]);
    /* El logotipo de la casa tiene dos archivos: el «AL3D» en tinta para fondo claro y en
       claro para fondo oscuro. Se cambia el src y no solo `content:url()` en la hoja, porque
       Safari —o sea el iPhone— no aplica `content` a un <img>. Solo se toca el de la casa: el
       que alguien subió en el cotizador tiene otro nombre y se respeta. */
    document.querySelectorAll('img.logoimg').forEach(function (img) {
      var src = img.getAttribute('src') || '';
      var mm = /^(.*\/)?logo-al3d(-oscuro)?\.svg$/.exec(src);
      if (!mm) return;
      var quiere = (mm[1] || '') + (t === 'oscuro' ? 'logo-al3d-oscuro.svg' : 'logo-al3d.svg');
      if (src !== quiere) img.setAttribute('src', quiere);
    });
    document.querySelectorAll('[data-tema-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', t === 'oscuro' ? 'true' : 'false');
      b.setAttribute('title', t === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
      b.setAttribute('aria-label', b.getAttribute('title'));
    });
    return t;
  }
  /* El botón alterna entre los dos temas EFECTIVOS: quien está viendo oscuro por el sistema y
     toca el sol, quiere claro, aunque su preferencia guardada fuera «auto». */
  function alternar() {
    var t = efectivo(guardado()) === 'oscuro' ? 'claro' : 'oscuro';
    try { localStorage.setItem(CLAVE, t); } catch (_) {}
    aplicar();
    return t;
  }
  function poner(pref) {
    try { if (pref === 'auto') localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, pref); } catch (_) {}
    return aplicar();
  }

  aplicar();
  if (mq) { var oye = function () { if (guardado() === 'auto') aplicar(); }; mq.addEventListener ? mq.addEventListener('change', oye) : mq.addListener(oye); }
  window.addEventListener('storage', function (ev) { if (!ev.key || ev.key === CLAVE) aplicar(); });
  /* Los botones se pintan cuando el documento existe; el atributo ya está puesto desde antes. */
  document.addEventListener('DOMContentLoaded', function () {
    aplicar();
    document.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-tema-btn]') : null;
      if (b) { ev.preventDefault(); alternar(); }
    });
  });

  window.AL3D_TEMA = { actual: function () { return efectivo(guardado()); }, preferencia: guardado, poner: poner, alternar: alternar, CLAVE: CLAVE };
})();
