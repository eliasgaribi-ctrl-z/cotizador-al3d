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

/* ----- La antepuerta: sin pase, no se pinta ni el cascarón -----
   La puerta de verdad (js/nucleo/puerta.js) sale hasta que baja todo el árbol de módulos de
   app.js, y en un teléfono con la red mal eso son segundos. Mientras, el HTML fijo —la barra
   lateral, el encabezado, el esqueleto del Tablero— ya estaba pintado: alguien sin cuenta veía
   la plataforma unos segundos antes de que se le pidiera entrar. Aquí, antes del primer
   pintado, si la página lo pide (`data-puerta` en <html>, solo index.html) y no hay un pase
   vivo, se pone `antepuerta` y css/sistema.css tapa todo con el logotipo. La quita app.js
   cuando custodiar() deja pasar. Las mismas exenciones que la puerta: la copia local. */
(function () {
  var h = document.documentElement;
  if (!h.hasAttribute('data-puerta')) return;
  try {
    var n = location.hostname;
    if (location.protocol === 'file:' || n === 'localhost' || n === '127.0.0.1' || n === '') return;
    var p = JSON.parse(localStorage.getItem('al3d_pf_pase') || 'null');
    if (p && typeof p.correo === 'string' && Number(p.hasta) > Date.now()) return;
  } catch (_) {}
  h.classList.add('antepuerta');
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
    /* Durante dos cuadros no corre ninguna transición: si no, al cambiar de tema los botones y
       chips cruzaban de color en 160 ms y el resto de la pantalla cambiaba de golpe. */
    h.classList.add('sin-transicion');
    try { requestAnimationFrame(function () { requestAnimationFrame(function () { h.classList.remove('sin-transicion'); }); }); }
    catch (_) { h.classList.remove('sin-transicion'); }
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

  /* ----- El tema nuevo se abre en círculo desde el toque -----
     Sale de Skiper UI · skiper26 (Theme toggle, con atribución) y de View Transitions. El
     navegador fotografía la pantalla en el tema de antes, se cambia el tema debajo, y la foto
     del tema nuevo se descubre con un círculo que crece desde donde cayó el dedo hasta la
     esquina más lejana, en 380 ms. Vive aquí y no en js/piezas.js porque este botón está en
     TODAS las páginas y las tres de texto no cargan las piezas; Ajustes lo pide por
     `AL3D_TEMA.revelar(evento, cambiar)`.

     Se cambia de golpe, como siempre, cuando: no hay View Transitions (Firefox viejo, Safari <
     18), se pidió menos movimiento, la pestaña está oculta, ya hay un revelado en curso (dos
     toques seguidos: el segundo no espera al primero), o la página se lo prohíbe con
     `html.sin-revelado` —el anidador con el motor corriendo: fotografiar una mesa llena
     cuesta justo cuando el teléfono no tiene de dónde—. El estilo de las dos fotos está en
     css/sistema.css («El tema se abre en círculo»). Con el teclado, el círculo sale del centro
     del botón: un Enter no trae coordenadas. */
  function punto(desde) {
    var w = window.innerWidth, h = window.innerHeight;
    if (desde && typeof desde.clientX === 'number' && (desde.clientX || desde.clientY) && desde.detail !== 0)
      return [desde.clientX, desde.clientY];
    var el = desde && desde.getBoundingClientRect ? desde : (desde && desde.currentTarget && desde.currentTarget.getBoundingClientRect ? desde.currentTarget : null);
    if (!el && desde && desde.target && desde.target.closest) el = desde.target.closest('[data-tema-btn],button') || null;
    if (el) { var r = el.getBoundingClientRect(); if (r.width || r.height) return [r.left + r.width / 2, r.top + r.height / 2]; }
    if (desde && typeof desde.x === 'number' && typeof desde.y === 'number') return [desde.x, desde.y];
    return [w / 2, h / 2];
  }
  /* El segundo toque con un revelado a medias —de vuelta al tema de antes— no espera a que el
     primero termine, pero tampoco cambia el tema POR DEBAJO del círculo que sigue creciendo:
     eso descubría, dentro del círculo, el mismo tema que había fuera. Se salta el primero y el
     segundo cambia de golpe; y si el primero ni siquiera había cambiado todavía (su foto se toma
     un cuadro después del toque), el segundo espera a que lo haga, para que los dos cambios
     queden en el orden en que se pidieron: Ajustes pide temas concretos, no «el otro». */
  var enCurso = null;
  function revelar(desde, cambiar) {
    var h = document.documentElement, quieto = false;
    try { quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
    if (enCurso) {
      var previo = enCurso; enCurso = null;
      try { previo.vt.skipTransition(); } catch (_) {}
      if (!previo.corrio) { previo.vt.updateCallbackDone.then(cambiar, cambiar); return; }
      return cambiar();
    }
    if (typeof document.startViewTransition !== 'function' || quieto || document.hidden ||
        h.classList.contains('sin-revelado')) return cambiar();
    var p = punto(desde), x = Math.round(p[0]), y = Math.round(p[1]);
    var radio = Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)));
    var vt, este = { vt: null, corrio: false };
    h.classList.add('tema-revela');
    try { vt = document.startViewTransition(function () { este.corrio = true; cambiar(); }); }
    catch (_) { h.classList.remove('tema-revela'); return cambiar(); }
    este.vt = vt; enCurso = este;
    vt.ready.then(function () {
      h.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radio + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(function () {});
    vt.finished.catch(function () {}).then(function () {
      if (enCurso === este) enCurso = null;
      if (!enCurso) h.classList.remove('tema-revela');
    });
  }

  /* Los botones se pintan cuando el documento existe; el atributo ya está puesto desde antes. */
  document.addEventListener('DOMContentLoaded', function () {
    aplicar();
    document.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-tema-btn]') : null;
      if (b) { ev.preventDefault(); revelar(ev.detail === 0 ? b : ev, alternar); }
    });
  });

  window.AL3D_TEMA = { actual: function () { return efectivo(guardado()); }, preferencia: guardado, poner: poner, alternar: alternar, revelar: revelar, CLAVE: CLAVE };
})();
