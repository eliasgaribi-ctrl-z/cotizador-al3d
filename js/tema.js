/* ============================================================================
   El tema: claro, oscuro o el del sistema.

   Es un script CLÁSICO y va en el <head> de todas las páginas —index.html, cotizador.html,
   el anidador y las públicas— ANTES de las hojas de estilo, a propósito: decide el tema leyendo una clave
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

/* ----- Nadie de afuera nos empotra -----
   Va aquí porque éste es el guion que TODAS las páginas cargan primero. Una página de otro
   sitio podría meter la app en un <iframe> transparente y poner sus propios botones encima
   —«toca aquí para ganar»— para que el toque caiga en «Autorizar» o en «Registrar venta».
   La cabecera que lo impide (frame-ancestors) no funciona en <meta>, y GitHub Pages no deja
   poner cabeceras; así que se comprueba a mano.

   El único que empotra legítimamente es la plataforma, que es de este mismo origen
   (js/mod/cotizador.js y js/mod/herramientas.js). Leer `top.location.href` desde un marco de
   otro origen LANZA: esa excepción es la señal. Se pregunta también al de arriba inmediato,
   por si el ajeno está en medio y no hasta arriba.

   Si pasa, la página se ESCONDE primero y después intenta salirse del marco. Antes era al
   revés y con un respaldo que no respaldaba nada: si salirse fallaba —un `sandbox` sin
   `allow-top-navigation` lo impide— se hacía `documentElement.innerHTML = ''`, y eso corre
   AQUÍ, en el <head>, con el documento a medio leer: el <body> se crea después, entero, y la
   página se pintaba completa dentro del marco ajeno. Lo que sí aguanta es un estilo en <html>
   con `!important`, que ninguna hoja de la página le gana y que vale para todo lo que el
   analizador vaya creando debajo. Va por el CSSOM (`style.setProperty`) y no como atributo:
   así no depende de que la política de la página permita estilos en línea.

   En Cloudflare esto lo cubre además la cabecera `frame-ancestors` de `_headers`; en GitHub
   Pages no hay cabeceras y esto es lo único. Un marco ajeno con `sandbox` sin `allow-scripts`
   no corre ni esto ni la app: ve botones que no hacen nada. */
(function () {
  try {
    if (window.top === window.self) return;
    void window.top.location.href;
    void window.parent.location.href;
    return;                                   // empotrada por la propia plataforma
  } catch (_) {}
  try { document.documentElement.style.setProperty('display', 'none', 'important'); } catch (_) {}
  try { window.top.location = window.self.location.href; } catch (_) {}
})();

/* ----- Las tipografías, sin un guion en línea -----
   Las páginas piden sus dos familias a fonts.googleapis.com con `media="print"`, para que una
   petición colgada no bloquee los guiones (el porqué está en index.html), y al terminar se
   pasan a `media="all"`. Eso lo hacía un `onload="this.media='all'"` escrito en el <link>, y un
   manejador en un atributo es un guion en línea: era lo único que obligaba a index.html y a las
   tres páginas de texto a llevar 'unsafe-inline' en su política. Ahora esas páginas marcan el
   <link> con `data-fuentes` y el cambio se hace aquí. Si la hoja ya llegó —de la caché, antes de
   que este guion corriera— `sheet` ya existe y se enciende en el acto; si no, al cargar. Las
   páginas que conservan su `onload` (el cotizador, el anidador, verificar) no llevan la marca y
   no se tocan. */
(function () {
  function encender(l) {
    if (l.sheet) { l.media = 'all'; return; }
    l.addEventListener('load', function () { l.media = 'all'; });
  }
  function todas() {
    var ls = document.querySelectorAll('link[data-fuentes][media="print"]');
    for (var i = 0; i < ls.length; i++) encender(ls[i]);
  }
  todas();
  document.addEventListener('DOMContentLoaded', todas);
})();

(function () {
  var CLAVE = 'al3d_tema';
  var COLOR = { claro: '#4060f8', oscuro: '#0f1124' };
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
