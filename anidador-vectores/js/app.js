/* ============================================================================
   Anidador de vectores — la interfaz.

   Aquí NO vive el algoritmo: el acomodo lo hace SVGnest (js/svgnest.js y js/lib/, vendorizado
   de https://github.com/Jack000/SVGnest, MIT). Este archivo conecta el DOM con su API pública
   —parsesvg, setbin, config, start, stop— y le pone alrededor lo que al motor le falta para
   usarse en el taller sin sorpresas:

     · Unidades. El motor acomoda números; el archivo dice mm, cm, px o nada. Todo se pasa
       a milímetros antes de que el motor lo vea, y si el archivo no dice cuánto mide se
       pide la medida real, como en el vectorizador (js/medidas.js, probado en node).
     · La hoja. En este taller todas las hojas son de 1.20 × 2.40 m: se elige la completa,
       la media o el cuarto mirando su tarjeta, o un retazo medido a mano. Los retazos se
       guardan con su nombre para no medirlos dos veces. El material cambia el acabado con
       el que se pinta la hoja en la mesa.
     · Aviso de lo que se va a quedar fuera: textos sin convertir, símbolos <use>, piezas
       más grandes que la hoja. El motor los descarta callado; aquí se dicen.
     · Lo que no es dibujo no entra. El SVG llega de fuera y esta página comparte origen con
       el cotizador: antes de pintarlo se le quita todo lo que ejecuta código (sanear).
     · Se detiene solo. El algoritmo genético no termina nunca: sigue buscando mejores
       acomodos mientras nadie lo pare. Cuando lleva 25 intentos y 40 segundos sin mejorar,
       se detiene y lo dice; «Seguir buscando» continúa desde donde iba. Bajo «Detener», una
       mecha y una frase dicen cuánto falta para ese paro (A4); y «Volver a acomodar desde cero»
       guarda el acomodo anterior y ofrece «Recuperar» durante 8 s (A9).
     · El marcador: el aprovechamiento en una aguja con su calificación, y las piezas caen
       en su lugar cada vez que el motor encuentra algo mejor. Es lo que hace que un cálculo
       de dos minutos se pueda mirar.
     · El trazo puede llegar del vectorizador del cotizador, por localStorage, sin pasar
       por el disco.
     · El SVG sale en milímetros —width="1200mm"— para que LightBurn, RDWorks o Illustrator
       lo abran a tamaño, con una capa por hoja. «Descargar SVG» es un menú: todas, una hoja o
       compartir el archivo (A16).
     · El aluminio y el MDF tienen veta: al elegirlos se quitan los giros de 90° y se pregunta
       (A5). Sobre el dibujo, dos cotas dicen qué caja se está midiendo (A6). Sin archivo a la
       mano, «Probar con un ejemplo» carga las letras del logotipo (A31).
   ============================================================================ */
(function () {
  'use strict';

  var M = window.AnidadorMedidas;
  var $ = function (id) { return document.getElementById(id); };

  var LS_MATERIAL = 'al3d_anidador_material';   // la última hoja usada en este aparato
  var LS_RETAZOS  = 'al3d_anidador_retazos';    // los sobrantes medidos, con su nombre
  var LS_ENTRADA  = 'al3d_anidar';              // lo que deja el vectorizador del cotizador
  var LIMITE_INTENTOS = 25;                     // intentos seguidos sin mejorar…
  var LIMITE_MS = 40000;                        // …y segundos sin mejorar: las dos, para parar
  var TOLERANCIA_MM = 0.3;                      // con qué fineza se convierten las curvas en rectas
  var HUECO_ENTRE_HOJAS_MM = 25;                // en el SVG de salida, una hoja debajo de otra
  var COLORES_PIEZA = 6;                        // cuántos tonos se turnan en la mesa
  var CON_VETA = ['aluminio', 'mdf'];           // los que preguntan por la veta: el cepillado y la madera
  var ALTO_EJEMPLO_MM = 400;                    // «Probar con un ejemplo»: las letras AL3D, a esta altura
  var MS_RECUPERAR = 8000;                      // cuánto vive el «Recuperar» del acomodo anterior (§6.2)

  /* Las hojas del taller. Todas salen de la de 1.20 × 2.40 m: la completa, la media y el
     cuarto. Lo demás es un retazo, que se mide a mano. */
  var HOJAS = { '1200x2400': [1200, 2400], '1200x1200': [1200, 1200], '600x1200': [600, 1200] };
  var MATERIALES = ['acrilico', 'aluminio', 'galvanizada', 'alucobond', 'mdf'];
  var MAT_TXT = { acrilico: 'acrílico', aluminio: 'aluminio', galvanizada: 'galvanizada', alucobond: 'alucobond', mdf: 'MDF' };

  /* Lo que el motor deja fuera sin decirlo, y lo que aquí se le quita antes para que no
     confunda geometría de apoyo con piezas: un <clipPath> con un rectángulo dentro se
     volvería una pieza rectangular más. */
  var NO_SE_CORTAN = ['defs', 'clipPath', 'mask', 'marker', 'pattern', 'symbol', 'metadata',
                      'title', 'desc', 'text', 'image', 'use', 'foreignObject', 'script'];

  /* Lo que un SVG trae y NO es dibujo: código. Un SVG es un documento activo, y esta página
     comparte el origen —y con él el localStorage— con el cotizador, donde viven las API keys
     de la IA (al3d_kxs_*). Quitar solo <script> no alcanzaba: un <set onbegin=…> corría al
     cargar, un <image href="data:x" onerror=…> también, y un <rect onmouseover=…> pasaba
     intacto al resultado acomodado. El archivo llega de un cliente, por WhatsApp o por
     correo: se trata como lo que es, y se limpia UNA vez, en cargarTexto, antes de que la
     vista previa, el motor o la salida lo copien. Se compara el nombre local en minúsculas
     porque un «html:script» o un «animateTransform» con otro prefijo también cuentan. */
  var ACTIVOS = ['script', 'foreignobject', 'set', 'animate', 'animatemotion', 'animatetransform',
                 'animatecolor', 'discard', 'handler', 'listener', 'iframe', 'embed', 'object',
                 'audio', 'video'];
  var NS_XHTML = 'http://www.w3.org/1999/xhtml';
  /* ¿Pide algo de fuera? url(…), image-set(…) o @import que no apunte a #algo. La barra
     invertida también cuenta: en CSS «\75 rl(» se lee url(. */
  function pideDeFuera(v) {
    v = String(v || '');
    if (v.indexOf('\\') >= 0 || /@import/i.test(v)) return true;
    var re = /(url|image-set)\s*\(\s*(['"]?)\s*([^'")\s]*)/gi, m;
    while ((m = re.exec(v))) if (m[3].charAt(0) !== '#') return true;
    return false;
  }
  function sanear(raiz) {
    lista(raiz.getElementsByTagName('*')).concat([raiz]).forEach(function (e) {
      var nombre = String(e.localName || e.nodeName).toLowerCase();
      /* Un elemento de HTML metido en el SVG (un <html:iframe>, un <html:img onerror>) es HTML
         de verdad al pintarse, esté donde esté: fuera, como el <foreignObject> que lo traería. */
      if (e !== raiz && (ACTIVOS.indexOf(nombre) >= 0 || e.namespaceURI === NS_XHTML)) {
        if (e.parentNode) e.parentNode.removeChild(e);
        return;
      }
      lista(e.attributes).forEach(function (at) {
        var n = String(at.localName || at.name).toLowerCase();
        if (n.indexOf('on') === 0) { e.removeAttributeNode(at); return; }   // onload, onbegin, onerror…
        /* href y xlink:href: dentro del archivo (#algo) sí, que es como apuntan <use>, los
           degradados y los recortes. Una imagen incrustada (data:image/…) también, en
           <image>. Lo demás —javascript:, una dirección de fuera que avisaría a quien la
           sirve que el archivo se abrió— se quita. */
        if (n === 'href') {
          var v = String(at.value || '').trim();
          var ok = v.charAt(0) === '#' || ((nombre === 'image' || nombre === 'feimage') && /^data:image\//i.test(v));
          if (!ok) e.removeAttributeNode(at);
          return;
        }
        /* Lo mismo en el CSS: un style="fill:url(https://…)" o un clip-path="url(https://…)"
           pide la dirección al pintarse, igual que un href. Solo url(#algo) se queda. Del
           style se quita la declaración y no el atributo entero: los colores y trazos se
           conservan (LightBurn arma sus capas con ellos). */
        if (n === 'style' && e.style) {
          for (var i = e.style.length - 1; i >= 0; i--) {
            if (pideDeFuera(e.style.getPropertyValue(e.style[i]))) e.style.removeProperty(e.style[i]);
          }
          if (!e.style.length) e.removeAttribute('style');
        } else if (pideDeFuera(at.value)) e.removeAttributeNode(at);
      });
      /* Un <style> que pide algo de fuera (@import, url(https://…)) se va entero: el <style>
         viaja en el SVG de corte. Uno sin nada de fuera se queda, porque lleva las clases. */
      if (nombre === 'style' && e !== raiz && pideDeFuera(e.textContent) && e.parentNode) e.parentNode.removeChild(e);
    });
  }

  /* ---------- Estado ---------- */
  var A = null;   // el archivo: texto, nombre, raíz parseada, bbox, escala, piezas
  var T = { corriendo: false, intentos: 0, sinMejora: 0, ultimaMejora: 0, mejor: null, detenidoSolo: false };
  /* Qué corrida del motor es la vigente. SvgNest.stop() solo apaga el reloj que lanza
     intentos: el que ya iba en los workers termina y llama igual. Sin este número, un
     intento de la corrida de 3 mm llegaba DESPUÉS de «Volver a acomodar» con 30 mm y se
     enseñaba —y se descargaba— como resultado de la nueva, y detenido el cálculo el
     contador de intentos seguía subiendo. Sube al arrancar, al seguir, al detener y al
     cargar otro archivo; cada arranque le da al motor una llamada que sabe de qué corrida es.
     El motor lleva su propio número (la «corrida» de svgnest.js, un cambio local): aquel
     impide que el intento viejo se meta en su caché y en su «mejor»; éste, que se enseñe. */
  var corrida = 0;
  /* La veta (A5): `lleva` es lo que se supone del material elegido —el aluminio y el MDF, que sí la
     tienen, hasta que se conteste otra cosa—; `rotPrevia`, los giros que había antes de que la
     veta los quitara, para devolverlos si el material cambia a uno sin veta y nadie los tocó;
     `globo`, la pregunta (P.vistazo), que se crea la primera vez que hace falta. */
  var _veta = { lleva: true, rotPrevia: null, globo: null };
  var R = [];     // los retazos guardados
  var QUIETO = false;
  try { QUIETO = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}

  /* ---------- Utilidades de interfaz ---------- */
  /* El aviso es la misma pieza del cotizador y la plataforma (js/piezas.js, P.aviso): la pila de
     dos con su mecha, que se pausa con el dedo, el cursor o el foco encima y se quita
     deslizándola. Aquí era una copia sin pausa, sin mecha y con un solo nodo: «Retazo quitado ·
     Deshacer» lo borraba el aviso siguiente. Con `accion` ({label, fn}) lleva botón y dura 8 s
     como mínimo; sin `dur`, 3.2 s, que era lo de esta página. Se dice en #vozStatus, la única
     región que habla aquí (P.voz manda ahí también lo urgente). */
  function toast(msg, tipo, dur, accion) {
    var P = window.Piezas;
    if (!P || !P.aviso) {
      var voz = $('vozStatus'); if (voz) voz.textContent = msg + (accion && accion.label ? ' — ' + accion.label + ' disponible' : '');
      return null;
    }
    return P.aviso(msg, { tipo: tipo || '', dur: dur || 3200, accion: accion || null, pila: 'toast' });
  }
  function mensaje(txt, tipo) {
    var m = $('an-msg'); m.textContent = txt || '';
    m.className = 'an-msg' + (tipo ? ' ' + tipo : '');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function peso(bytes) {
    if (!(bytes > 0)) return '';
    return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';
  }
  function marcarFalta(fld, falta) { var e = $(fld); if (e) e.classList.toggle('falta', !!falta); }
  function interruptor(id) { return $(id).getAttribute('aria-checked') === 'true'; }
  function alternar(id) {
    var b = $(id), on = !interruptor(id);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.querySelector('.tg').classList.toggle('on', on);
  }
  /* Una colección viva (childNodes, getElementsByTagName) copiada a un arreglo, para poder
     quitar nodos mientras se recorre sin que la colección se mueva debajo del índice. */
  function lista(coleccion) { return Array.prototype.slice.call(coleccion); }
  function hijos(nodo) { return lista(nodo.childNodes); }
  function fmt(n) { return String(Math.round(n * 1000) / 1000); }
  function fmtMm(n) { return String(Math.round(n * 10) / 10); }

  /* Un número que sube hasta su valor en vez de cambiar de golpe. Es lo que hace que «73 %»
     se lea como una mejora y no como otro número. Con «reducir movimiento», va directo. */
  var _tweens = {};
  function contar(el, hasta, formato) {
    var id = el.id || Math.random();
    if (_tweens[id]) cancelAnimationFrame(_tweens[id]);
    var desde = parseFloat(el.getAttribute('data-v')) || 0;
    el.setAttribute('data-v', hasta);
    if (QUIETO || !isFinite(desde)) { el.textContent = formato(hasta); return; }
    var t0 = performance.now(), dur = 550;
    (function paso(t) {
      var k = Math.min(1, (t - t0) / dur); k = 1 - Math.pow(1 - k, 3);
      el.textContent = formato(desde + (hasta - desde) * k);
      if (k < 1) _tweens[id] = requestAnimationFrame(paso);
    })(t0);
  }

  /* ---------- La hoja: material, tarjetas, medidas ---------- */
  function materialElegido() {
    var on = document.querySelector('#an-mats .chip.on');
    return on ? on.getAttribute('data-mat') : 'acrilico';
  }
  function elegirMaterial(mat) {
    if (MATERIALES.indexOf(mat) < 0) mat = 'acrilico';
    lista(document.querySelectorAll('#an-mats .chip')).forEach(function (c) {
      var on = c.getAttribute('data-mat') === mat;
      c.classList.toggle('on', on); c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('an-mesa').setAttribute('data-mat', mat);
    pintarVeta();
  }
  function hojaElegida() {
    var on = document.querySelector('.an-tile.on');
    return on ? on.getAttribute('data-hoja') : 'retazo';
  }
  function marcarHoja(clave) {
    lista(document.querySelectorAll('.an-tile')).forEach(function (t) {
      var on = t.getAttribute('data-hoja') === clave;
      t.classList.toggle('on', on); t.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    pintarRetazos();
  }
  /* Las tarjetas y los dos campos dicen lo mismo: elegir una hoja llena los campos, y
     teclear una medida que no es de ninguna hoja marca «Retazo». */
  function sincronizarHoja(sinAnimar) {
    var a = parseFloat($('an-ancho').value), h = parseFloat($('an-alto').value), hallada = 'retazo';
    Object.keys(HOJAS).forEach(function (k) {
      var p = HOJAS[k];
      if ((p[0] === a && p[1] === h) || (p[0] === h && p[1] === a)) hallada = k;
    });
    marcarHoja(hallada);
    orientarTarjetas(sinAnimar);
  }
  /* La orientación (A21): las tarjetas dibujaban siempre la hoja parada, así que «Girar la
     hoja» cambiaba los números y la figura se quedaba igual. Con la hoja acostada —más ancha
     que alta— se pone `.acostada` en las tarjetas y el CSS gira la hojita 90° con su
     asentado. Elegir una tarjeta también la llama: la media hoja, cuadrada, la deja parada
     aunque venga de una acostada. Al abrir la página con la última hoja ya acostada, la figura
     nace girada: se apaga la transición un instante (sin-giro) para que no se vea girar sola. */
  function orientarTarjetas(sinAnimar) {
    var a = parseFloat($('an-ancho').value), h = parseFloat($('an-alto').value);
    var tarjetas = $('an-tiles'), acostada = a > h;
    if (!tarjetas || tarjetas.classList.contains('acostada') === acostada) return;
    if (sinAnimar) {
      tarjetas.classList.add('sin-giro');
      tarjetas.classList.toggle('acostada', acostada);
      void tarjetas.offsetWidth;
      tarjetas.classList.remove('sin-giro');
    } else tarjetas.classList.toggle('acostada', acostada);
  }
  function leerMaterial(avisar) {
    var ancho = parseFloat($('an-ancho').value), alto = parseFloat($('an-alto').value), sep = parseFloat($('an-sep').value);
    var ok = true;
    marcarFalta('fld-ancho', !(ancho > 0)); marcarFalta('fld-alto', !(alto > 0)); marcarFalta('fld-sep', !(sep >= 0));
    if (!(ancho > 0) || !(alto > 0)) ok = false;
    if (!(sep >= 0)) { sep = 0; $('an-sep').value = '0'; }
    if (!ok) { if (avisar) { mensaje('Falta el ancho o el alto de la hoja, en milímetros.', 'mal'); (ancho > 0 ? $('an-alto') : $('an-ancho')).focus(); } return null; }
    return { ancho: ancho, alto: alto, sep: sep, rot: parseInt($('an-rot').value, 10) || 4,
             huecos: interruptor('an-huecos'), concavas: interruptor('an-concavas'), contorno: interruptor('an-contorno'),
             mat: materialElegido(), hoja: hojaElegida() };
  }
  function guardarMaterial() {
    try { localStorage.setItem(LS_MATERIAL, JSON.stringify({
      ancho: $('an-ancho').value, alto: $('an-alto').value, sep: $('an-sep').value, rot: $('an-rot').value,
      huecos: interruptor('an-huecos'), concavas: interruptor('an-concavas'), contorno: interruptor('an-contorno'),
      mat: materialElegido(), sinVeta: !_veta.lleva })); } catch (_) {}
  }
  function cargarMaterial() {
    var g = null;
    try { g = JSON.parse(localStorage.getItem(LS_MATERIAL) || 'null'); } catch (_) {}
    if (!g) { sincronizarHoja(true); return; }
    if (g.ancho) $('an-ancho').value = g.ancho;
    if (g.alto) $('an-alto').value = g.alto;
    if (g.sep !== undefined && g.sep !== '') $('an-sep').value = g.sep;
    if (g.rot) $('an-rot').value = String(g.rot);
    if (typeof g.huecos === 'boolean' && g.huecos !== interruptor('an-huecos')) alternar('an-huecos');
    if (typeof g.concavas === 'boolean' && g.concavas !== interruptor('an-concavas')) alternar('an-concavas');
    if (typeof g.contorno === 'boolean' && g.contorno !== interruptor('an-contorno')) alternar('an-contorno');
    if (g.sinVeta === true) _veta.lleva = false;   // ya contestó que su material no tiene veta
    if (g.mat) elegirMaterial(g.mat);
    pintarVeta();
    sincronizarHoja(true);
  }
  lista(document.querySelectorAll('#an-mats .chip')).forEach(function (c) {
    c.addEventListener('click', function () {
      var mat = c.getAttribute('data-mat'), antes = materialElegido();
      elegirMaterial(mat);
      /* Volver a tocar el que ya estaba elegido no es elegir otro material: no repite la pregunta. */
      if (mat !== antes) alCambiarMaterial(c, mat);
      guardarMaterial();
    });
  });
  lista(document.querySelectorAll('.an-tile')).forEach(function (t) {
    t.addEventListener('click', function () {
      var clave = t.getAttribute('data-hoja'), p = HOJAS[clave];
      if (p) {
        /* Se respeta la orientación que ya tenía la hoja: si estaba acostada, sigue acostada. */
        var acostada = parseFloat($('an-ancho').value) > parseFloat($('an-alto').value);
        $('an-ancho').value = acostada ? p[1] : p[0];
        $('an-alto').value = acostada ? p[0] : p[1];
        marcarHoja(clave);
        orientarTarjetas();
      } else {
        marcarHoja('retazo');
        $('an-ancho').focus(); $('an-ancho').select();
      }
      leerMaterial(false); guardarMaterial(); habilitar();
    });
  });
  ['an-ancho', 'an-alto', 'an-sep'].forEach(function (id) {
    $(id).addEventListener('input', function () { sincronizarHoja(); leerMaterial(false); guardarMaterial(); habilitar(); });
  });
  /* Los tres cambian lo que el motor calcula: habilitar() decide si «Seguir buscando» vale. */
  $('an-rot').addEventListener('change', function () { _veta.rotPrevia = null; guardarMaterial(); habilitar(); });
  $('an-huecos').addEventListener('click', function () { alternar('an-huecos'); guardarMaterial(); habilitar(); });
  $('an-concavas').addEventListener('click', function () { alternar('an-concavas'); guardarMaterial(); habilitar(); });
  $('an-contorno').addEventListener('click', function () { alternar('an-contorno'); guardarMaterial(); });
  $('an-girar').addEventListener('click', function () {
    var a = $('an-ancho').value; $('an-ancho').value = $('an-alto').value; $('an-alto').value = a;
    sincronizarHoja(); guardarMaterial(); habilitar();
    toast('Hoja girada: ' + $('an-ancho').value + ' × ' + $('an-alto').value + ' mm', 'ok', 2200);
  });

  /* ---------- La veta: no girar 90° el aluminio cepillado ni el MDF (A5, falla 6) ----------
     Las piezas se giraban cada 90° con cualquier material. La mesa ya pinta la veta del
     cepillado y de la madera, pero nada decía que una letra girada 90° la deja atravesada, y en
     un anuncio terminado eso se ve. El motor aplica los giros a TODO el trabajo
     (config({rotations})), no pieza por pieza, así que lo único que se puede hacer es elegir
     bien los giros de todo el trabajo.

     La decisión del taller (CONVENCIONES, nº 6) es que, al elegir aluminio o MDF, el anidador
     pregunte y que por omisión quite los giros de 90°: quedan 0° y 180°, que respetan la veta
     (una pieza vuelta de cabeza sigue con la veta paralela). Es una PREGUNTA y no una regla: el
     aluminio blanco, negro o pintado no tiene veta, y quien lo sabe contesta «sin veta» y
     recupera los 4 giros con un toque. Por eso la respuesta se guarda con el material y la
     pregunta no vuelve a salir al abrir la página; sale cada vez que se ELIGE un material con
     veta, no al volver a tocar el que ya estaba.

     Solo se tocan los giros cuando eran los de 90° (4 o 8): si alguien dejó «Ninguno» o «0° y
     180°», ya respeta la veta y no hay nada que preguntar. Y el cambio no es permanente: si los
     quitó la veta y nadie los tocó a mano, al pasar a acrílico, galvanizada o alucobond vuelven. */
  function conVeta() { return CON_VETA.indexOf(materialElegido()) >= 0 && _veta.lleva; }
  /* `.con-veta` en la mesa enciende el rayado de las piezas giradas (css/anidador.css). */
  function pintarVeta() { var m = $('an-mesa'); if (m) m.classList.toggle('con-veta', conVeta()); }
  function alCambiarMaterial(chip, mat) {
    var rot = $('an-rot');
    if (CON_VETA.indexOf(mat) < 0) {
      if (_veta.globo) _veta.globo.cerrar('codigo');
      if (_veta.rotPrevia && rot.value === '2') { rot.value = String(_veta.rotPrevia); habilitar(); }
      _veta.rotPrevia = null; _veta.lleva = true;
      pintarVeta();
      return;
    }
    _veta.lleva = true;
    var giros = parseInt(rot.value, 10);
    if (giros === 4 || giros === 8) {
      _veta.rotPrevia = giros; rot.value = '2';
      habilitar();
      preguntarVeta(chip);
    }
    pintarVeta();
  }
  /* La pregunta es el globo de la pieza 4 (P.vistazo), anclado a la ficha del material que se
     acaba de elegir y no a #an-rot: ese campo vive dentro de «Giros, huecos y contorno», que
     nace cerrado, y un globo anclado a algo escondido no se ve. Tocar fuera la cierra: con la
     omisión ya aplicada, no contestar es una respuesta («dejar así»), así que no hace falta que
     bloquee. */
  function preguntarVeta(ancla) {
    var P = window.Piezas;
    if (!P || !P.vistazo) { toast('Quedaron solo los giros de 0° y 180°, para no atravesar la veta.', '', 5000); return; }
    if (!_veta.globo) {
      _veta.globo = P.vistazo(null, {
        titulo: '¿Lleva veta?', clase: 'an-pregunta-veta', lado: 'abajo', alinear: 'inicio',
        contenido: '<span class="vistazo-t">¿Lleva veta?</span>' +
          '<p>El aluminio cepillado y el MDF la tienen. Con 0° y 180° queda igual; girada 90°, queda atravesada. Quedaron solo esos dos giros.</p>' +
          '<p class="an-veta-nota">El aluminio blanco, negro o pintado no tiene veta.</p>' +
          '<div class="vistazo-acciones"><button type="button" class="btn btn-gho" data-veta="no">Sin veta: cada 90°</button>' +
          '<button type="button" class="btn btn-gho" data-veta="si">Dejar así</button></div>',
        alAbrir: function (pop) {
          lista(pop.querySelectorAll('[data-veta]')).forEach(function (b) {
            b.addEventListener('click', function () { responderVeta(b.getAttribute('data-veta') === 'si'); });
          });
        }
      });
    }
    _veta.globo.abrir(ancla);
  }
  function responderVeta(lleva) {
    _veta.lleva = lleva;
    if (!lleva) {
      $('an-rot').value = String(_veta.rotPrevia || 4); _veta.rotPrevia = null;
      habilitar();
      toast('Giros cada 90°: ese material no tiene veta', '', 2600);
    }
    pintarVeta(); guardarMaterial();
    if (_veta.globo) _veta.globo.cerrar('codigo');
  }
  /* El rayado de las piezas giradas. Se pone sobre las <g> de primer nivel de cada hoja cuyo
     rotate() no sea múltiplo de 180°: 90° y 270° con los giros de siempre, y también los 45° de
     «cada 45°», que cruzan la veta igual. Lo hace un observador de #an-res y no pintarResultado()
     porque ese pintado es de la mesa y se repite con cada mejora del motor: el observador
     corre una vez por repintado, cuando las hojas ya están puestas. */
  function marcarGiradas() {
    lista(document.querySelectorAll('#an-res .an-hoja>svg>g')).forEach(function (g) {
      var m = /rotate\(\s*(-?[\d.]+)/.exec(g.getAttribute('transform') || ''), r = 0;
      if (m) r = ((parseFloat(m[1]) % 180) + 180) % 180;
      g.classList.toggle('girada', r > 0.5 && r < 179.5);
    });
  }
  if (window.MutationObserver) new MutationObserver(marcarGiradas).observe($('an-res'), { childList: true });

  /* ---------- Los retazos ----------
     Un sobrante se mide una vez y se guarda con su nombre; la próxima vez se elige de aquí.
     Viven en este aparato, como la hoja. El bloque se enseña cuando la hoja es un retazo o
     cuando ya hay alguno guardado: quien nunca ha guardado uno no tiene por qué verlo. */
  function cargarRetazos() {
    try { R = JSON.parse(localStorage.getItem(LS_RETAZOS) || '[]'); } catch (_) { R = []; }
    if (!Array.isArray(R)) R = [];
    R = R.filter(function (r) { return r && r.ancho > 0 && r.alto > 0; });
  }
  function guardarRetazos() { try { localStorage.setItem(LS_RETAZOS, JSON.stringify(R)); } catch (_) {} }
  function pintarRetazos() {
    var bloque = $('an-retazos'); if (!bloque) return;
    bloque.hidden = !(hojaElegida() === 'retazo' || R.length > 0);
    var cont = $('an-retazo-lista'); cont.innerHTML = '';
    var a = parseFloat($('an-ancho').value), h = parseFloat($('an-alto').value);
    R.forEach(function (r) {
      var w = document.createElement('span'); w.className = 'an-retazo';
      var b = document.createElement('button'); b.type = 'button';
      var en = (r.ancho === a && r.alto === h) || (r.ancho === h && r.alto === a);
      b.className = 'chip' + (en ? ' on' : ''); b.setAttribute('aria-pressed', en ? 'true' : 'false');
      b.innerHTML = esc(r.nombre) + ' <small>' + fmtMm(r.ancho) + ' × ' + fmtMm(r.alto) + '</small>';
      b.title = 'Usar este retazo como hoja';
      b.addEventListener('click', function () { usarRetazo(r); });
      var x = document.createElement('button'); x.type = 'button'; x.className = 'an-retazo-x';
      x.setAttribute('aria-label', 'Quitar el retazo «' + r.nombre + '»'); x.title = 'Quitar de la lista';
      x.innerHTML = '<svg class="svgi" aria-hidden="true"><use href="#i-cerrar"/></svg>';
      x.addEventListener('click', function () { quitarRetazo(r); });
      w.appendChild(b); w.appendChild(x); cont.appendChild(w);
    });
  }
  function usarRetazo(r) {
    $('an-ancho').value = r.ancho; $('an-alto').value = r.alto;
    sincronizarHoja(); leerMaterial(false); guardarMaterial(); habilitar();
    toast('Hoja: ' + r.nombre + ' · ' + fmtMm(r.ancho) + ' × ' + fmtMm(r.alto) + ' mm', 'ok', 2400);
  }
  /* Quitar se deshace desde el aviso, como borrar una partida en el cotizador: la × es chica y
     está junto a «Usar», y un retazo guardado son medidas que alguien tomó con el flexómetro. */
  function quitarRetazo(r) {
    var i = R.indexOf(r);
    R = R.filter(function (x) { return x !== r; });
    guardarRetazos(); pintarRetazos();
    toast('Retazo «' + r.nombre + '» quitado', '', 8000, { label: 'Deshacer', fn: function () {
      R.splice(Math.max(0, Math.min(i, R.length)), 0, r); guardarRetazos(); pintarRetazos();
      toast('Retazo «' + r.nombre + '» de vuelta', 'ok', 2200);
    } });
  }
  $('an-retazo-guardar').addEventListener('click', function () {
    var mat = leerMaterial(true); if (!mat) return;
    var nombre = ($('an-retazo-nombre').value || '').trim() || ('Retazo de ' + MAT_TXT[mat.mat]);
    var repetido = R.some(function (r) { return r.ancho === mat.ancho && r.alto === mat.alto; });
    if (repetido) { mensaje('Ese retazo ya está guardado con esas medidas.', 'av'); return; }
    R.push({ id: Date.now(), nombre: nombre.slice(0, 40), ancho: mat.ancho, alto: mat.alto, mat: mat.mat });
    guardarRetazos(); $('an-retazo-nombre').value = '';
    marcarHoja('retazo'); pintarRetazos();
    toast('Retazo guardado: ' + nombre + ' · ' + fmtMm(mat.ancho) + ' × ' + fmtMm(mat.alto) + ' mm', 'ok', 2800);
  });
  $('an-retazo-nombre').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('an-retazo-guardar').click(); } });

  /* ---------- Cargar el archivo ---------- */
  function leerArchivo(file) {
    var esSvg = /\.svg$/i.test(file.name) || (file.type && file.type.indexOf('svg') >= 0);
    if (!esSvg) { toast('«' + file.name + '» no es un SVG. Exporta el diseño como SVG y vuelve a intentar.', 'err', 4200); return; }
    var lector = new FileReader();
    lector.onload = function (e) { cargarTexto(e.target.result, file.name, { peso: file.size }); };
    lector.onerror = function () { toast('No se pudo leer «' + file.name + '».', 'err'); };
    lector.readAsText(file);
  }

  /* El corazón de la carga. Recibe el SVG como texto —del disco, del portapapeles o del
     cotizador— y deja todo listo para acomodar: vista previa, medida y cuenta de piezas. */
  function cargarTexto(texto, nombre, opts) {
    opts = opts || {};
    var doc = null;
    try { doc = new DOMParser().parseFromString(texto, 'image/svg+xml'); } catch (_) {}
    var raiz = doc && doc.documentElement;
    if (!raiz || raiz.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
      toast('No se pudo leer «' + (nombre || 'el archivo') + '»: no es un SVG válido.', 'err', 4200);
      return false;
    }
    if (T.corriendo) detener(false);
    corrida++;   // lo que el motor todavía tuviera en vuelo era del archivo anterior
    /* La banda de «Trazo recibido del vectorizador… Viene con su medida real» es de ESE
       archivo. Se quedaba puesta al arrastrar o pegar otro SVG encima, y con el nuevo a otra
       escala esa frase era justo la que no había que creerse. `recibirDelCotizador` la vuelve
       a escribir después de esta función cuando el archivo sí viene de allá. */
    if (opts.origen !== 'cotizador') {
      var banda = $('an-origen');
      if (banda) { banda.hidden = true; banda.innerHTML = ''; banda.className = 'an-banda'; }
    }

    A = { texto: texto, nombre: nombre || 'diseño.svg', peso: opts.peso || texto.length, raiz: raiz,
          bbox: null, escala: null, k: null, piezas: 0, avisos: [], avisoSel: {}, numeros: {}, origen: opts.origen || null };
    T = { corriendo: false, intentos: 0, sinMejora: 0, ultimaMejora: 0, mejor: null, detenidoSolo: false };
    /* La medida es de ESTE archivo: la del anterior no puede quedarse en los campos, porque
       un 280 heredado se leería como que este archivo mide 280. */
    $('an-ancho-d').value = ''; $('an-alto-d').value = '';

    /* Lo que el motor va a dejar fuera, dicho antes y con su número. */
    var n = function (sel) { return raiz.getElementsByTagName(sel).length; };
    var c;
    /* Cada aviso apunta a lo que habla (A15): `avisoSel` guarda el selector de lo que hay que
       señalar en la vista previa, por número de aviso. */
    var avisar = function (txt, sel) { A.avisos.push(txt); A.avisoSel[A.avisos.length - 1] = sel; };
    if ((c = n('text'))) avisar('Trae ' + c + (c === 1 ? ' texto' : ' textos') + ' sin convertir: el motor solo acomoda contornos. En Illustrator, Texto → Crear contornos, y vuelve a exportar.', 'text');
    if ((c = n('use'))) avisar('Trae ' + c + (c === 1 ? ' símbolo reutilizado' : ' símbolos reutilizados') + ' (<use>) que se van a quedar fuera. Expándelos antes de exportar (Objeto → Expandir).', 'use');
    if ((c = n('image'))) avisar('Trae ' + c + (c === 1 ? ' imagen incrustada' : ' imágenes incrustadas') + ', que no se cortan: se ignoran.', 'image');
    if (n('clipPath') || n('mask')) avisar('Trae máscaras de recorte. Se ignoran: la geometría que recortaban se acomoda entera.', '[clip-path],[mask]');
    /* Después de contar y antes de pintar: los avisos hablan del archivo como llegó, y todo
       lo que viene abajo —la vista previa, el motor, la salida— copia la raíz ya limpia. */
    sanear(raiz);

    pintarOriginal();
    A.escala = M.escalaDelArchivo({ width: raiz.getAttribute('width'), height: raiz.getAttribute('height'), viewBox: raiz.getAttribute('viewBox') });
    A.k = A.escala.mmPorUnidad;
    if (A.escala.noUniforme) A.avisos.push('El ancho y el alto del archivo no cuadran entre sí (escala distinta en cada eje). Se usó la del ancho; revisa la medida.');
    A.piezas = contarPiezas(A.k || 1);
    if (A.piezas === 0) A.avisos.push('No encontré contornos que acomodar. Revisa que el diseño sean trazos y no una imagen o texto.');

    pintarArchivo(); pintarMedida(); pintarEstadoTrabajo(); habilitar();
    actualizarDescarga(); $('an-prog').hidden = true;
    $('an-mesa').classList.remove('corriendo');
    $('an-vista-tab').textContent = 'Las piezas, como vienen';

    if (A.piezas > 0 && A.k > 0) mensaje('Listo: ' + A.piezas + (A.piezas === 1 ? ' pieza' : ' piezas') + '. Revisa la hoja y toca «Acomodar las piezas».', 'ok');
    else if (A.piezas > 0) mensaje('Falta la medida real del diseño: escribe su ancho o su alto en milímetros.', 'av');
    else mensaje('');
    return true;
  }

  /* Por nombre local y en minúsculas, como sanear(): getElementsByTagName compara el nombre
     calificado, y un <s:style> (que sigue siendo un <style> de SVG) se le escapaba y
     reestilizaba la página entera. */
  function quitarEtiquetas(nodo, tags) {
    var quitar = tags.map(function (t) { return String(t).toLowerCase(); });
    lista(nodo.getElementsByTagName('*')).forEach(function (e) {
      if (quitar.indexOf(String(e.localName || e.nodeName).toLowerCase()) >= 0 && e.parentNode) e.parentNode.removeChild(e);
    });
  }

  /* La vista previa de lo que llegó. Sin <style>: un <style> dentro de un SVG en línea vale
     para TODA la página, y un `svg{display:none}` de Illustrator apagaría hasta los iconos de
     la barra. Se pinta como silueta, con la hoja de estilos de esta pantalla. El <script> y
     el resto de lo activo ya no llegan hasta aquí: los quitó sanear() al cargar. */
  function pintarOriginal() {
    var cont = $('an-orig'); cont.innerHTML = '';
    var clon = document.importNode(A.raiz, true);
    rotular(clon, 'data-e');   // el mismo número que el id que verá el motor (svgParaMotor)
    quitarEtiquetas(clon, ['style']);
    clon.removeAttribute('width'); clon.removeAttribute('height');
    clon.setAttribute('role', 'img'); clon.setAttribute('aria-label', 'Las piezas del archivo, sin acomodar');
    /* Sin viewBox, el lienzo es el width/height pasado a px —las unidades del dibujo, según
       el estándar—; medidas.js lo arma así. Con el lienzo en mm la vista enseñaba un recorte
       3.78 veces más chico que el dibujo. */
    var vb = M.leerViewBox(A.raiz.getAttribute('viewBox'));
    if (!vb) {
      var e = M.escalaDelArchivo({ width: A.raiz.getAttribute('width'), height: A.raiz.getAttribute('height') });
      if (e.viewBox) clon.setAttribute('viewBox', [e.viewBox.x, e.viewBox.y, e.viewBox.w, e.viewBox.h].join(' '));
    }
    reiniciarMesa();
    cont.appendChild(clon);
    /* El recuadro de la tinta, en unidades del archivo. Hace falta que esté en pantalla, y se
       mide sobre una copia SIN lo que no se corta —el mismo filtro de svgParaMotor—: medido
       sobre la vista, una imagen de referencia de 1000 unidades junto a una letra de 100 hacía
       que «el diseño mide 400 mm» diera una letra de 40, y la ficha «Diseño» mentía igual. */
    var b = null, todo = null;
    try { todo = clon.getBBox(); } catch (_) {}
    var medir = clon.cloneNode(true);
    quitarEtiquetas(medir, NO_SE_CORTAN);
    medir.setAttribute('aria-hidden', 'true');
    medir.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
    cont.appendChild(medir);
    try { b = medir.getBBox(); } catch (_) {}
    cont.removeChild(medir);
    A.bbox = (b && b.width > 0 && b.height > 0) ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    /* Para encuadrar la vista sí cuenta todo lo que se ve, imágenes y textos incluidos. */
    if (!clon.getAttribute('viewBox') && todo && todo.width > 0 && todo.height > 0) clon.setAttribute('viewBox', [todo.x, todo.y, todo.width, todo.height].join(' '));
  }

  /* El SVG que se le da al motor: sin lo que no se corta y ya en milímetros. La escala va
     como transform en la raíz; el parser del motor la aplica a cada elemento y la quita. */
  function svgParaMotor(k) {
    var clon = A.raiz.cloneNode(true);
    rotular(clon, 'id');   // la mesa necesita saber qué pieza es cuál: ver «La mesa de corte»
    quitarEtiquetas(clon, NO_SE_CORTAN);
    clon.removeAttribute('width'); clon.removeAttribute('height');
    if (k && Math.abs(k - 1) > 1e-12) clon.setAttribute('transform', 'scale(' + k + ')');
    else clon.removeAttribute('transform');
    return new XMLSerializer().serializeToString(clon);
  }

  function contarPiezas(k) {
    try {
      var svg = window.SvgNest.parsesvg(svgParaMotor(k));
      return window.SvgNest.getParts(hijos(svg)).length;
    } catch (_) { return 0; }
  }

  /* ---------- Las cotas sobre el dibujo (A6) ----------
     La nota de «La medida real» explica que es la medida de lo dibujado y no la del lienzo,
     pero la vista no enseñaba QUÉ caja se está midiendo: una escala mal puesta sale plausible y
     se descubre en la máquina. Aquí se dibujan dos cotas —ancho arriba, alto a la derecha— sobre
     la silueta, alrededor de A.bbox, con el número en mm que cambia al teclear; la del campo que
     tiene el foco se engruesa, y sin escala dicen «¿? mm» en ámbar.

     Van en una <g> del CLON de la vista (#an-orig), nunca en svgParaMotor(), que clona A.raiz
     limpia: unas cotas en el archivo de corte se cortarían. Y el lienzo se agranda para que
     quepan: el diseño suele llegar al borde del lienzo del archivo, y las cotas, fuera del
     recuadro de la tinta, se recortarían. El lienzo original se guarda en data-lienzo para
     recalcular siempre desde él: si se leyera el ya agrandado, cada tecla lo agrandaría más.

     Las flechas son triángulos dibujados con su <path>, no <marker>: con
     vector-effect:non-scaling-stroke —que es lo que mantiene el filete en px a cualquier escala—
     el tamaño de un marker en unidades de trazo se movía con el grosor de la cota enfocada. */
  var _focoCota = '';   // qué campo de la medida tiene el foco: 'ancho', 'alto' o ''
  function svgEl(nombre, atributos, texto) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', nombre);
    Object.keys(atributos || {}).forEach(function (k) { e.setAttribute(k, String(atributos[k])); });
    if (texto != null) e.textContent = texto;
    return e;
  }
  function pintarCotas() {
    var cont = $('an-orig'), svg = cont ? cont.querySelector('svg') : null;
    if (!svg) return;
    var viejo = svg.querySelector('.an-cotas'); if (viejo) viejo.parentNode.removeChild(viejo);
    var v = M.leerViewBox(svg.getAttribute('data-lienzo') || svg.getAttribute('viewBox'));
    if (!A || !A.bbox || !v) return;
    if (!svg.getAttribute('data-lienzo')) svg.setAttribute('data-lienzo', svg.getAttribute('viewBox'));
    var b = A.bbox, ref = Math.max(v.w, v.h);
    var fs = ref * 0.034, sal = ref * 0.035, pie = fs * 0.45, flecha = fs * 0.5;
    var x0 = Math.min(v.x, b.x), y0 = Math.min(v.y, b.y - sal - fs * 1.7);
    var x1 = Math.max(v.x + v.w, b.x + b.w + sal + fs * 1.7), y1 = Math.max(v.y + v.h, b.y + b.h);
    svg.setAttribute('viewBox', [x0, y0, x1 - x0, y1 - y0].map(fmt).join(' '));

    var falta = !(A.k > 0);
    var g = svgEl('g', { 'class': 'an-cotas', 'aria-hidden': 'true' });
    var num = function (mm) { return falta ? '¿? mm' : M.formatoMm(mm); };
    /* Ancho: la línea encima del recuadro, con dos patitas que bajan hasta la tinta. */
    var yl = b.y - sal, ca = svgEl('g', { 'class': 'an-cota an-cota-ancho' + (_focoCota === 'ancho' ? ' foco' : '') });
    ca.appendChild(svgEl('path', { 'class': 'linea', d: 'M' + fmt(b.x) + ' ' + fmt(b.y - pie) + 'V' + fmt(yl - pie) + 'M' + fmt(b.x + b.w) + ' ' + fmt(b.y - pie) + 'V' + fmt(yl - pie) + 'M' + fmt(b.x) + ' ' + fmt(yl) + 'H' + fmt(b.x + b.w) }));
    ca.appendChild(svgEl('path', { 'class': 'punta', d: 'M' + fmt(b.x) + ' ' + fmt(yl) + 'l' + fmt(flecha) + ' ' + fmt(-flecha * .38) + 'v' + fmt(flecha * .76) + 'zM' + fmt(b.x + b.w) + ' ' + fmt(yl) + 'l' + fmt(-flecha) + ' ' + fmt(-flecha * .38) + 'v' + fmt(flecha * .76) + 'z' }));
    ca.appendChild(svgEl('text', { 'class': 'num' + (falta ? ' falta' : ''), x: fmt(b.x + b.w / 2), y: fmt(yl - fs * .32), 'text-anchor': 'middle', 'font-size': fmt(fs) }, num(b.w * (A.k || 0))));
    /* Alto: la línea a la derecha, con el número girado para leerse de abajo hacia arriba. */
    var xl = b.x + b.w + sal, cb = svgEl('g', { 'class': 'an-cota an-cota-alto' + (_focoCota === 'alto' ? ' foco' : '') });
    cb.appendChild(svgEl('path', { 'class': 'linea', d: 'M' + fmt(b.x + b.w + pie) + ' ' + fmt(b.y) + 'H' + fmt(xl + pie) + 'M' + fmt(b.x + b.w + pie) + ' ' + fmt(b.y + b.h) + 'H' + fmt(xl + pie) + 'M' + fmt(xl) + ' ' + fmt(b.y) + 'V' + fmt(b.y + b.h) }));
    cb.appendChild(svgEl('path', { 'class': 'punta', d: 'M' + fmt(xl) + ' ' + fmt(b.y) + 'l' + fmt(-flecha * .38) + ' ' + fmt(flecha) + 'h' + fmt(flecha * .76) + 'zM' + fmt(xl) + ' ' + fmt(b.y + b.h) + 'l' + fmt(-flecha * .38) + ' ' + fmt(-flecha) + 'h' + fmt(flecha * .76) + 'z' }));
    var cx = xl + fs * .98, cy = b.y + b.h / 2;
    cb.appendChild(svgEl('text', { 'class': 'num' + (falta ? ' falta' : ''), x: fmt(cx), y: fmt(cy), 'text-anchor': 'middle', 'font-size': fmt(fs), transform: 'rotate(-90 ' + fmt(cx) + ' ' + fmt(cy) + ')' }, num(b.h * (A.k || 0))));
    g.appendChild(ca); g.appendChild(cb);
    svg.appendChild(g);
  }
  function marcarCotaEnfocada() {
    lista(document.querySelectorAll('#an-orig .an-cota')).forEach(function (c) {
      c.classList.toggle('foco', !!_focoCota && c.classList.contains('an-cota-' + _focoCota));
    });
  }
  [['an-ancho-d', 'ancho'], ['an-alto-d', 'alto']].forEach(function (par) {
    var campo = $(par[0]);
    campo.addEventListener('focus', function () { _focoCota = par[1]; marcarCotaEnfocada(); });
    campo.addEventListener('blur', function () { if (_focoCota === par[1]) _focoCota = ''; marcarCotaEnfocada(); });
  });

  /* ---------- La medida real ---------- */
  function pintarMedida() {
    var sec = $('an-sec-medida'); sec.hidden = !A;
    if (!A) return;
    pintarCotas();
    var txt = $('an-medida-txt'), ancho = $('an-ancho-d'), alto = $('an-alto-d');
    var falta = !(A.k > 0);
    txt.classList.toggle('falta', falta);
    marcarFalta('fld-ancho-d', falta); marcarFalta('fld-alto-d', falta);
    if (!A.bbox) {
      txt.textContent = 'No pude medir lo dibujado: revisa que el archivo tenga contornos.';
      ancho.value = ''; alto.value = ''; return;
    }
    if (A.k > 0 && A.escala.origen === 'archivo' && !ancho.value) {
      ancho.value = fmtMm(A.bbox.w * A.k); alto.value = fmtMm(A.bbox.h * A.k);
    }
    if (falta) {
      var u = A.escala.unidad ? 'viene en «' + A.escala.unidad + '»' : 'no declara unidades';
      txt.textContent = 'El archivo no dice cuánto mide de verdad (' + u + '). Escribe el ancho o el alto real del diseño y todo lo demás se calcula.';
    } else if (A.escala.origen === 'archivo') {
      txt.textContent = 'El archivo dice sus medidas en ' + A.escala.unidad + ': el diseño mide ' +
        M.formatoMm(A.bbox.w * A.k) + ' × ' + M.formatoMm(A.bbox.h * A.k) + '. Si no cuadra con lo real, corrígelo aquí.';
    } else {
      txt.textContent = 'Medida puesta a mano: el diseño mide ' + M.formatoMm(A.bbox.w * A.k) + ' × ' + M.formatoMm(A.bbox.h * A.k) + '.';
    }
    $('an-st-diseno').textContent = A.k > 0 ? Math.round(A.bbox.w * A.k) + ' × ' + Math.round(A.bbox.h * A.k) + ' mm' : 'sin medida';
  }
  function escalaDiseno(campo, val) {
    if (!A || !A.bbox) return;
    var v = parseFloat(val);
    if (!(v > 0)) {
      /* Se vació el campo. Si el archivo traía escala se vuelve a ella; si no, se queda sin.
         Se pregunta a la escala del archivo y no a `origen`: para vaciar el campo hay que
         borrarlo, y la primera tecla ya lo había dejado en 'mano', así que la vuelta a la
         medida del archivo no ocurría nunca y el botón se apagaba con la escala a la vista. */
      A.k = A.escala.mmPorUnidad > 0 ? A.escala.mmPorUnidad : null;
      A.escala.origen = A.k ? 'archivo' : 'falta';
      if (A.k > 0) { $('an-ancho-d').value = fmtMm(A.bbox.w * A.k); $('an-alto-d').value = fmtMm(A.bbox.h * A.k); }
      else (campo === 'ancho' ? $('an-alto-d') : $('an-ancho-d')).value = '';
    } else {
      A.k = M.escalaPorDiseno(A.bbox, campo === 'ancho' ? v : null, campo === 'alto' ? v : null);
      A.escala.origen = 'mano';
      (campo === 'ancho' ? $('an-alto-d') : $('an-ancho-d')).value = fmtMm((campo === 'ancho' ? A.bbox.h : A.bbox.w) * A.k);
    }
    pintarMedida(); habilitar();
    if (A.k > 0 && A.piezas > 0) mensaje('Listo: ' + A.piezas + (A.piezas === 1 ? ' pieza' : ' piezas') + '. Revisa la hoja y toca «Acomodar las piezas».', 'ok');
  }
  $('an-ancho-d').addEventListener('input', function () { escalaDiseno('ancho', this.value); });
  $('an-alto-d').addEventListener('input', function () { escalaDiseno('alto', this.value); });

  function pintarArchivo() {
    $('an-archivo').hidden = !A;
    var ejemplo = $('an-ejemplo-drop'); if (ejemplo) ejemplo.hidden = !!A;
    if (!A) return;
    $('an-nombre').textContent = A.nombre;
    $('an-peso').textContent = peso(A.peso);
    $('an-drop-t').textContent = 'Cambiar de archivo: arrastra otro SVG, pégalo o toca aquí';
    $('an-st-piezas').textContent = A.piezas;
    $('an-avisos').innerHTML = A.avisos.map(function (a, i) {
      /* «Ver cuáles» solo sale si en la vista previa queda algo que señalar (A15). */
      var ver = elementosDeAviso(i).length
        ? '<button type="button" class="btn btn-gho an-aviso-ver" data-aviso="' + i + '" aria-pressed="false">Ver cuáles</button>' : '';
      return '<div class="hintnote nota-av"><svg class="svgi" aria-hidden="true"><use href="#i-aviso"/></svg><span>' + esc(a) + '</span>' + ver + '</div>';
    }).join('');
  }

  function habilitar() {
    var mat = leerMaterial(false);
    var puede = !!(A && A.k > 0 && A.piezas > 0 && mat);
    var ir = $('an-ir');
    ir.disabled = T.corriendo ? false : !puede;
    /* «Seguir buscando» continúa el MISMO cálculo: el motor no vuelve a leer la hoja ni la
       separación. Con otra hoja, otra separación o otra medida del diseño ya no hay nada que
       seguir, y ofrecerlo entregaba piezas a 3 mm cuando el campo decía 20. Queda «Volver a
       acomodar desde cero», que sí las lee. */
    $('an-seguir').hidden = T.corriendo || !T.mejor || !puede || huellaMotor(mat) !== T.huella;
  }
  /* Lo que el motor usó para acomodar: si algo de esto cambia, el acomodo ya es de otra hoja. */
  function huellaMotor(mat) {
    return mat ? [mat.ancho, mat.alto, mat.sep, mat.rot, mat.huecos, mat.concavas, A && A.k].join('|') : '';
  }
  /* La llamada que recibe el motor en cada arranque: lleva su número de corrida, y lo que
     llegue de una corrida que ya no es la vigente —o con el cálculo detenido— se tira. */
  function mostrarDe(mia) {
    return function (svglist, eficiencia, colocadas, total) {
      if (mia !== corrida || !T.corriendo) return;
      alMostrar(svglist, eficiencia, colocadas, total);
    };
  }

  /* ---------- Acomodar ---------- */
  function iniciar() {
    if (T.corriendo) { detener(false); return; }
    if (!A) { mensaje('Primero sube un SVG con las piezas.', 'mal'); return; }
    var mat = leerMaterial(true); if (!mat) return;
    if (!(A.k > 0)) { mensaje('Falta la medida real del diseño: escribe su ancho o su alto en milímetros.', 'mal'); $('an-ancho-d').focus(); return; }

    var SN = window.SvgNest;
    /* exploreConcave es «Explore concave areas» del demo original: sin él, el hueco abierto
       de una «C» cuenta como lleno y nada se acomoda dentro. Tarda bastante más, por eso
       nace apagado, igual que allá. */
    SN.config({ spacing: mat.sep, rotations: mat.rot, useHoles: mat.huecos, exploreConcave: mat.concavas, curveTolerance: TOLERANCIA_MM });
    /* config() y parsesvg() ya borraron del motor el cálculo anterior (su GA, su mejor y la
       hoja): si de aquí en adelante algo frena el arranque —no cabe ninguna pieza, el SVG no
       se lee—, ya no hay qué «seguir». El acomodo en pantalla se queda para descargarlo. */
    T.huella = null;
    var svg;
    try { svg = SN.parsesvg(svgParaMotor(A.k)); }
    catch (e) { mensaje('No se pudo procesar el SVG: ' + (e && e.message || e), 'mal'); return; }

    /* Lo que no cabe ni girado se dice antes de empezar, no después de diez minutos.
       La hoja se descuenta DOS veces la separación, que es lo que hace el motor: engorda cada
       pieza media separación por lado y adelgaza la hoja otro tanto por lado. Con una sola,
       una pieza de 395 en una hoja de 400 con 3 mm pasaba este filtro, el motor la dejaba
       fuera callado y el marcador se quedaba en «1/2» sin decir por qué. */
    var hs = hijos(svg), partes = SN.getParts(hs);
    if (!partes.length) { mensaje('No encontré contornos que acomodar en este archivo.', 'mal'); return; }
    var sinCabida = partes.filter(function (p) {
      var b = window.GeometryUtil.getPolygonBounds(p);
      return !M.cabe({ w: b.width, h: b.height }, { ancho: mat.ancho - 2 * mat.sep, alto: mat.alto - 2 * mat.sep }, mat.rot);
    });
    var fuera = sinCabida.length;
    if (fuera === partes.length) {
      mensaje('Ninguna de las ' + partes.length + ' piezas cabe en una hoja de ' + mat.ancho + ' × ' + mat.alto + ' mm. Revisa la medida del diseño o la de la hoja.', 'mal');
      return;
    }

    var bin = svg.ownerDocument.createElementNS(svg.namespaceURI, 'rect');
    bin.setAttribute('x', '0'); bin.setAttribute('y', '0');
    bin.setAttribute('width', String(mat.ancho)); bin.setAttribute('height', String(mat.alto));
    svg.appendChild(bin);
    SN.setbin(bin);

    /* Lo que se tira al volver a acomodar desde cero (A9): el mejor acomodo, que puede llevar
       minutos de cálculo. Se guarda aparte con la hoja y la escala con las que se calculó, para
       poder devolverlo (ver recuperarAnterior) y que la pantalla no quede diciendo otra cosa. */
    var previo = T.mejor ? { mejor: T.mejor, material: T.material, k: T.k, intentos: T.intentos, archivo: A } : null;
    T = { corriendo: true, intentos: 0, sinMejora: 0, ultimaMejora: Date.now(), mejor: null, detenidoSolo: false, material: mat, k: A.k, huella: huellaMotor(mat), fuera: fuera, fueraIds: idsDe(hs, sinCabida), total: partes.length, anterior: previo };
    A.numeros = numerarPartes(hs, partes);   // «Pieza 7» es el lugar de la pieza en el archivo
    /* El avance de cada intento interno ya no se pinta —lo sustituyó la mecha del paro, A4—;
       el motor pide una función, no necesita que haga nada. */
    if (SN.start(function () {}, mostrarDe(++corrida)) === false) {
      T.corriendo = false;
      /* Sin arrancar, el acomodo de antes sigue en pantalla y no se tiró nada: se le devuelve a T
         para que «Descargar» siga sirviendo. Seguir buscando no: el motor ya no lo tiene. */
      if (previo) { T.mejor = previo.mejor; T.huella = null; T.anterior = null; pintarEstadoTrabajo(); actualizarDescarga(); }
      mensaje('El motor no pudo arrancar con esa hoja. Revisa que el ancho y el alto sean mayores que la separación.', 'mal');
      return;
    }
    $('an-prog').hidden = false;
    apagarParo();
    ['an-st-uso', 'an-st-col', 'an-st-hojas', 'an-st-merma', 'an-st-int'].forEach(function (id) { $(id).textContent = '—'; $(id).removeAttribute('data-v'); });
    $('an-st-col').textContent = '0/' + partes.length; $('an-st-int').textContent = '0';
    $('an-st-uso-lbl').textContent = 'buscando…';
    $('an-gauge-fg').style.strokeDashoffset = '326.73'; $('an-gauge-fg').className.baseVal = 'an-gauge-fg';
    empezarCalculo();   // la silueta se queda en la mesa, atenuada, con su ficha (A13)
    $('an-mesa').classList.add('corriendo');
    $('an-mesa').style.setProperty('--an-mesa-h', $('an-mesa').offsetHeight + 'px');
    $('an-vista-tab').textContent = 'Acomodando…';
    actualizarDescarga();
    pintarEstadoTrabajo();
    if (previo) ofrecerRecuperar(previo);
    mensaje((fuera ? fuera + (fuera === 1 ? ' pieza no cabe' : ' piezas no caben') + ' en la hoja ni girada' + (fuera === 1 ? '' : 's') + ' y se va' + (fuera === 1 ? '' : 'n') + ' a quedar fuera. ' : '') +
      'El motor sigue buscando acomodos mejores mientras corre: detenlo cuando el resultado te convenza, o se detiene solo cuando deja de mejorar.', fuera ? 'av' : '');
    /* En pantalla angosta la mesa queda debajo de los controles: se baja a verla. */
    if (window.matchMedia('(max-width:900px)').matches) $('an-mesa').scrollIntoView({ behavior: QUIETO ? 'auto' : 'smooth', block: 'start' });
  }

  function detener(solo) {
    corrida++;   // el intento que siga en los workers ya no se enseña
    window.SvgNest.stop();
    T.corriendo = false; T.detenidoSolo = !!solo;
    terminarCalculo();
    apagarParo();
    $('an-mesa').classList.remove('corriendo');
    pintarEstadoTrabajo(); habilitar();
    $('an-vista-tab').textContent = T.mejor ? 'El mejor acomodo encontrado' : 'Las piezas, como vienen';
    if (!T.mejor) { mensaje('Detenido antes del primer acomodo.', ''); return; }
    var s = 'Descarga el resultado o sigue buscando.';
    mensaje(solo
      ? 'Se detuvo solo: ' + LIMITE_INTENTOS + ' intentos y ' + Math.round(LIMITE_MS / 1000) + ' s seguidos sin mejorar. ' + s
      : 'Detenido. ' + s, 'ok');
  }

  function seguir() {
    if (!A || T.corriendo || !T.mejor) return;
    /* El botón se esconde cuando la hoja cambió (ver habilitar), pero seguir() también se
       llama desde window.Anidador: con otros ajustes no se sigue, se acomoda desde cero. */
    var mat = leerMaterial(false);
    if (!mat || huellaMotor(mat) !== T.huella) { iniciar(); return; }
    /* start() contesta false cuando el motor ya no tiene la hoja o las piezas: sin mirarlo, la
       mesa se quedaba en «Acomodando…» para siempre, sin un solo intento. */
    if (window.SvgNest.start(function () {}, mostrarDe(++corrida)) === false) { T.huella = null; iniciar(); return; }
    T.corriendo = true; T.sinMejora = 0; T.ultimaMejora = Date.now(); T.detenidoSolo = false;
    $('an-mesa').classList.add('corriendo');
    pintarEstadoTrabajo();
    encenderParo();
    $('an-vista-tab').textContent = 'Acomodando…';
    mensaje('Sigue buscando desde el mejor acomodo que llevaba.', '');
  }

  /* ---------- Deshacer con mecha: volver a acomodar desde cero (A9) ----------
     Un toque en «Volver a acomodar desde cero» tira el mejor acomodo encontrado, que puede llevar
     minutos de cálculo, y no había vuelta. iniciar() lo guarda en T.anterior —junto con la hoja y
     la escala con las que se calculó— y el aviso «Se guardó el acomodo anterior (78 %, 2 hojas)»
     trae «Recuperar» con la mecha de 8 s del contrato de §6.2 (lo pone P.aviso: con botón, el
     aviso dura 8 s como mínimo). Quitar un retazo ya se deshacía igual, ver quitarRetazo().

     Lo recuperado NO se puede seguir buscando: el motor ya borró su cálculo (config() y parsesvg()
     empiezan de cero), así que «Seguir buscando» sigue escondido —T.huella en null— y lo único
     que ofrece es descargarlo o volver a acomodar. Y «Recuperar» devuelve también la hoja, la
     separación, los giros y la escala con los que se calculó: dejar el acomodo de una hoja de 1.20
     × 2.40 m con los campos diciendo otra cosa sería descargar un archivo que la pantalla
     desmiente. El aviso solo vale mientras el archivo y el acomodo guardado sean los mismos: si
     se cargó otro SVG, o se volvió a acomodar y hay otro «anterior», ya no hay a qué volver. */
  function ofrecerRecuperar(previo) {
    var n = previo.mejor.svglist.length, ef = Math.round((previo.mejor.eficiencia || 0) * 100);
    toast('Se guardó el acomodo anterior (' + ef + ' %, ' + n + (n === 1 ? ' hoja' : ' hojas') + ')', '', MS_RECUPERAR,
      { label: 'Recuperar', fn: function () { recuperarAnterior(previo); } });
  }
  function restaurarHoja(c, k) {
    $('an-ancho').value = c.ancho; $('an-alto').value = c.alto; $('an-sep').value = c.sep; $('an-rot').value = String(c.rot);
    if (c.huecos !== interruptor('an-huecos')) alternar('an-huecos');
    if (c.concavas !== interruptor('an-concavas')) alternar('an-concavas');
    _veta.rotPrevia = null;
    elegirMaterial(c.mat);   // sin preguntar por la veta: es la hoja de antes, no una elección nueva
    sincronizarHoja();
    if (k > 0 && A && A.bbox && Math.abs((A.k || 0) - k) > 1e-9) escalaDiseno('ancho', A.bbox.w * k);
    guardarMaterial();
  }
  function recuperarAnterior(previo) {
    if (A !== previo.archivo || T.anterior !== previo) { toast('Ese acomodo ya no se puede recuperar.', '', 3000); return; }
    if (T.corriendo) detener(false);
    if (previo.material) restaurarHoja(previo.material, previo.k);
    T.mejor = previo.mejor; T.material = previo.material; T.k = previo.k; T.intentos = previo.intentos || 0;
    T.huella = null; T.anterior = null; T.detenidoSolo = false;
    $('an-prog').hidden = false;
    pintarResultado(false); pintarStats();
    $('an-vista-tab').textContent = 'El mejor acomodo encontrado';
    pintarEstadoTrabajo();
    var n = T.mejor.svglist.length, ef = Math.round((T.mejor.eficiencia || 0) * 100);
    mensaje('Recuperado el acomodo anterior (' + ef + ' %, ' + n + (n === 1 ? ' hoja' : ' hojas') + '). Descárgalo, o vuelve a acomodar desde cero.', 'ok');
    toast('Acomodo anterior recuperado', 'ok', 2400);
  }

  /* ---------- El paro automático, a la vista (A4) ----------
     El motor se detiene solo cuando se juntan DOS cosas: 25 intentos seguidos sin mejorar Y 40 s
     desde la última mejora. Hasta aquí nada decía cuánto faltaba, y la única barra de la mesa
     —la del avance de cada intento interno— llegaba a 100 y volvía a 0 sin que eso significara
     nada para quien miraba. Ahora, bajo «Detener», una mecha (P.mecha) se consume durante los 40 s
     y se rellena de golpe cuando el acomodo mejora, y una frase dice lo que falta con palabras.

     La mecha es solo el reloj de los 40 s; las dos condiciones las dice la frase, porque una
     mecha que se acaba con menos de 25 intentos —la mecha vacía y el motor todavía buscando—
     mentiría si el texto no lo explicara. Por eso el texto sale de Date.now() y de T.sinMejora, que
     es lo que de verdad decide el paro (alMostrar), y no de la cuenta de la mecha: los dos relojes
     pueden desfasarse unos milisegundos y la frase no puede contradecir al paro.

     Con menos movimiento la mecha ni se ve (css/anidador.css, «rm · an-controles»): queda la frase. */
  var _paro = null, _paroReloj = 0;
  /* Pura: la frase del paro. `sinMejoraMs` es lo que lleva sin mejorar; `intentos`, los intentos
     seguidos sin mejorar. Dice «hace 18 s», lo que falta de cada condición y nada más. */
  function textoParo(sinMejoraMs, intentos) {
    var P = window.Piezas;
    var reloj = function (ms, falta) { return P && P.reloj ? P.reloj(ms, { falta: !!falta }) : Math.floor(ms / 1000) + ' s'; };
    var faltanIntentos = Math.max(0, LIMITE_INTENTOS - (intentos || 0));
    var faltaMs = Math.max(0, LIMITE_MS - sinMejoraMs);
    var hace = 'Sin mejora hace ' + reloj(sinMejoraMs);
    var n = faltanIntentos + (faltanIntentos === 1 ? ' intento' : ' intentos');
    if (faltanIntentos > 0 && faltaMs > 0) return hace + ' · faltan ' + n + ' y ' + reloj(faltaMs, true);
    if (faltanIntentos > 0) return hace + ' · ya pasó el tiempo, faltan ' + n;
    if (faltaMs > 0) return hace + ' · ya van ' + LIMITE_INTENTOS + ' intentos, faltan ' + reloj(faltaMs, true);
    return hace + ' · se detiene ya';
  }
  function pintarParo() {
    var t = $('an-paro-t');
    if (!t || !T.corriendo || !T.mejor) return;
    var frase = textoParo(Date.now() - T.ultimaMejora, T.sinMejora);
    if (t.textContent !== frase) t.textContent = frase;
  }
  /* Hay un acomodo del que contar: se enseña el bloque y arranca (o vuelve a empezar) la mecha. */
  function encenderParo() {
    var P = window.Piezas, bloque = $('an-paro');
    if (!bloque || !T.mejor) return;
    bloque.hidden = false;
    if (P && P.mecha) {
      if (_paro && _paro.el && _paro.el.isConnected) _paro.reiniciar(LIMITE_MS);
      else _paro = P.mecha('an-mecha-paro', { ms: LIMITE_MS });
    }
    clearInterval(_paroReloj); _paroReloj = setInterval(pintarParo, 1000);
    pintarParo();
  }
  function apagarParo() {
    clearInterval(_paroReloj); _paroReloj = 0;
    if (_paro) { _paro.cancelar(true); _paro = null; }
    var bloque = $('an-paro'); if (bloque) bloque.hidden = true;
    var t = $('an-paro-t'); if (t) t.textContent = '';
  }

  /* El motor llama esto por cada intento evaluado: con resultado cuando mejoró, sin nada
     cuando no. Ahí se cuenta cuánto lleva sin mejorar, que es lo que decide el paro solo. */
  function alMostrar(svglist, eficiencia, colocadas, total) {
    T.intentos++;
    if (svglist && svglist.length) {
      var habia = !!T.mejor;
      T.mejor = { svglist: svglist, eficiencia: eficiencia, colocadas: colocadas, total: total };
      T.sinMejora = 0; T.ultimaMejora = Date.now();
      pintarResultado(habia);
      encenderParo();   // la primera mejora la arranca; las demás la rellenan de golpe
    } else if (T.corriendo && T.mejor) {
      T.sinMejora++;
      if (T.sinMejora >= LIMITE_INTENTOS && Date.now() - T.ultimaMejora >= LIMITE_MS) detener(true);
      else pintarParo();
    }
    pintarStats();
  }

  /* La calificación del aprovechamiento. Umbrales de taller, no de laboratorio: en corte de
     letras, arriba de 65 ya es un acomodo que a mano no se logra. */
  function calificar(ef) {
    if (!(ef >= 0)) return { txt: '', cls: '' };
    if (ef < 0.5) return { txt: 'se puede mejorar', cls: 'mejorable' };
    if (ef < 0.65) return { txt: 'bien', cls: 'bien' };
    if (ef < 0.8) return { txt: 'muy bien', cls: 'muybien' };
    return { txt: 'excelente', cls: 'excelente' };
  }
  /* ======================================================================
     LA MESA DE CORTE
     Nueve fichas viven aquí y se tocan entre sí, así que se cuentan juntas:

     · Las piezas llevan nombre (A8, A10, A15). Cada elemento del archivo recibe un `id` propio
       antes de que nada se quite o se mueva —`an-e12` es «el elemento 12 del archivo»—, en el clon
       que va al motor (svgParaMotor) y, como `data-e`, en el de la vista previa (pintarOriginal).
       Tiene que ser `id` y no `data-*` en el del motor porque svgparser.js, al reemplazar un rect o
       una elipse, solo conserva `id` y `class`. En la vista previa se usa `data-e` para no pisar los
       ids del archivo, de los que dependen un <use> o un clip-path que ahí sí se pintan. De
       ahí cada <g> de la hoja se llama `pz-an-e12`, y con ese nombre se sabe qué pieza es la misma
       de una mejora a la siguiente. Los ids se quitan en armarSalida(): son de la mesa, no del
       archivo de corte.
     · Cada mejora del motor repinta la hoja (A8) y las piezas VIAJAN de donde estaban a donde
       quedaron en vez de volver a caer (P.flip); las que no se movieron no se mueven. La primera
       vez, y «desde cero», sí caen. Cuando el acomodo baja de hoja (A11) el orden es: primero las
       piezas, después se pliega la hoja que quedó vacía, al final la ficha «Una hoja menos · 2.88 m²»;
       una cosa después de la otra, para que no compitan.
     · Las dos vistas (A25) —«Como vienen» y «Acomodadas»— comparten la celda de la mesa y un haz
       cruza al cambiar. Mientras no hay primer acomodo (A13) se queda la silueta, atenuada, con una
       ficha que dice cuánto lleva calculando.
     · Con más de una hoja, en pantalla angosta o táctil, las hojas son un carrusel (A12) y cada una
       dice su aprovechamiento; con la hoja ya en pantalla se acerca con pellizco, rueda o botones y se
       arrastra (A7).
     · Tocar una pieza dice su medida y si va girada (A10); con el cálculo detenido, mantenerla
       presionada la levanta, se arrastra y al soltarla se queda o regresa sola (A24).
     · Los avisos y las piezas que no caben señalan en la vista lo que se va a quedar fuera (A15).

     De dónde sale cada idea: React Bits (CardSwap y Masonry, para que las piezas viajen; Stack, para
     la hoja que sale del montón; Carousel, para las hojas; RefineFrame, para la silueta del primer
     acomodo; TargetCursor, para las esquinas; TechText, para la pieza que se levanta y regresa),
     Vengeance · Model Viewer (solo su manejo de arrastre, zoom y teclado) y Skiper · skiper101 (la
     ficha de la pieza) y skiper66 (el barrido con clip-path). Los dos de Skiper son gratuitos con
     atribución: queda dicha aquí y en css/anidador.css.
     ====================================================================== */
  var MS_VIAJE = 460;          // lo que tardan las piezas en llegar a su nuevo lugar (A8)
  var MAX_VIAJE = 150;         // con más piezas que estas, cambio directo (A8, y P.flip lo respeta)
  var MS_BARRIDO = 620;        // lo que tarda el haz en cruzar la mesa (A25)
  var MS_PLIEGUE = 320;        // la hoja que sobra se pliega en esto (A11)
  var MS_NOTICIA = 6000;       // y la ficha «Una hoja menos» se queda esto
  var PX_MM_MAX = 4;           // el zoom no pasa de aquí: 1 mm son 4 px (casi tamaño real)
  var PX_MM_REAL = 96 / 25.4;  // píxeles CSS por milímetro a tamaño real: a donde llega el doble toque (A7)
  var MS_LARGO = 350;          // mantener presionada una pieza la levanta (A24)
  var HOLGURA_MM = 0.3;        // lo que se perdona al medir un choque: la fineza con que se enderezan las curvas
  var CHOQUE_MM2 = 1;          // un traslape menor que esto es redondeo de la curva, no encimarse
  var PASO_TECLA_MM = 5;       // cuánto mueve Mayús + flecha a la pieza que tiene el foco
  var MAX_SENALADAS = 40;      // cuántas esquinas se ponen a la vez (cada una es un nodo flotante)
  var RETAZO_BAJO = 0.25;      // la última hoja con menos de esto sugiere un retazo (A12)
  var MQ_CARRUSEL = '(max-width:900px), (pointer:coarse)';

  var _vista = 'vienen';       // lo que se ve: 'vienen' (el archivo) o 'acomodadas' (el resultado)
  var _ctlVer = null;          // el radiogroup de arriba de la mesa
  var _tokBarrido = 0, _barrido = null;
  var _calc = { reloj: 0, t0: 0 };
  var _zoom = [];              // el encuadre de cada hoja: { z, cx, cy } o nada (hoja entera)
  var _activa = 0;             // la hoja que atienden los botones del zoom cuando no hay carrusel
  var _pags = null;            // el carrusel (P.paginas)
  var _tokPliegue = 0, _tNoticia = 0;
  var _vz = null, _sel = '';   // la ficha de la pieza (P.vistazo) y el id de la elegida
  var _senal = null;           // las esquinas que están puestas: { quien, boton, ctl }
  var _origen = (typeof WeakMap === 'function') ? new WeakMap() : null;  // el transform que le dio el motor a una pieza movida a mano
  var _gesto = null;           // el dedo (o los dos) que están sobre una hoja
  var _ultimoToque = null;
  var _cacheLocal = {}, _cacheArea = {};

  function PZ() { return window.Piezas || null; }
  /* Se pregunta en el momento y no una vez al cargar: quien activa «reducir movimiento» con la
     página abierta lo espera ya. */
  function sinMov() { var P = PZ(); return P && P.sinMovimiento ? P.sinMovimiento() : QUIETO; }
  function hojas() { return lista(document.querySelectorAll('#an-res > .an-hoja:not(.saliendo)')); }
  function hayResultado() { return !!(T.mejor && $('an-res').firstElementChild); }
  function editable() { return !!(T.mejor && !T.corriendo && A && hayResultado()); }
  function sobreMesa(e, sel) { var t = e.target; return t && t.closest ? t.closest(sel) : null; }

  /* Un nombre para cada elemento del archivo, en el orden en que aparecen. Se llama antes de
     quitar nada, y sobre clones de A.raiz que son iguales, para que el 12 de la vista previa sea
     el 12 del que ve el motor. */
  function rotular(raiz, atributo) {
    lista(raiz.getElementsByTagName('*')).forEach(function (e, i) {
      e.setAttribute(atributo, atributo === 'id' ? 'an-e' + i : String(i));
    });
  }
  /* «Pieza 7»: el lugar de la pieza en el archivo, no en la hoja (que cambia con cada mejora).
     Sale de la tabla que arma iniciar() con las piezas que el motor ve. */
  function numeroDe(g) {
    var c = g.firstElementChild;
    return (A && A.numeros && c && A.numeros[c.id]) || 0;
  }
  function nombreDe(g) { var n = numeroDe(g); return n ? 'Pieza ' + n : 'Pieza'; }
  /* iniciar() sabe qué piezas ve el motor (`partes`, con su `source`, el lugar del elemento entre
     los hijos del SVG) y cuáles no caben ni giradas. Aquí se traducen a ids de elemento. */
  function numerarPartes(hs, partes) {
    var t = {};
    partes.forEach(function (p, k) { var e = hs[p.source]; if (e && e.getAttribute) t[e.getAttribute('id')] = k + 1; });
    return t;
  }
  function idsDe(hs, partes) {
    return partes.map(function (p) { var e = hs[p.source]; return e && e.getAttribute ? e.getAttribute('id') : ''; }).filter(Boolean);
  }

  /* ---------- Las dos vistas (A25) y el primer acomodo (A13) ----------
     «Como vienen» (#an-orig) y «Acomodadas» (#an-res) son dos capas de la misma celda. Para
     cambiar de una a otra se destapan las dos a la vez, se recorta la de arriba (la de resultados)
     con clip-path y un haz de luz va justo en el borde del recorte —los dos con la misma curva y el
     mismo tiempo, así que no se separan—. Al terminar, la que quedó tapada vuelve a `hidden`: ya no
     se lee, no se enfoca y no ocupa lugar. El recorte no es de las cosas baratas (no corre en la
     tarjeta gráfica) y por eso es un momento de 0.6 s que pidió el dedo, no algo que se repita
     solo. Con menos movimiento, cambio directo. */
  function aplicarVista() {
    var orig = $('an-orig'), res = $('an-res');
    orig.hidden = _vista !== 'vienen';
    res.hidden = _vista !== 'acomodadas';
    var mesa = $('an-mesa');
    mesa.classList.toggle('ve-acomodadas', _vista === 'acomodadas');
    if (_pags && _vista === 'acomodadas') _pags.medir();   // escondida no se podía medir: los puntos se vuelven a decidir
    actualizarPie();
    medirMesa();
  }
  /* El haz láser que recorre la mesa mientras el motor corre se mide con la altura de la mesa
     (--an-mesa-h): la mesa cambia de alto al pintar las hojas, al cambiar de vista y al aparecer o
     irse el pie, y un haz medido una sola vez, al arrancar, no la recorría entera. */
  function medirMesa() {
    var mesa = $('an-mesa');
    if (mesa.classList.contains('corriendo')) mesa.style.setProperty('--an-mesa-h', mesa.offsetHeight + 'px');
  }
  function habilitarAcomodadas(si) {
    var b = $('an-vista-ver').querySelector('[data-v="acomodadas"]');
    if (!b) return;
    if (si) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
  }
  function cancelarBarrido() {
    _tokBarrido++;
    if (_barrido) { _barrido.forEach(function (a) { try { a.cancel(); } catch (_) {} }); _barrido = null; }
    $('an-mesa').classList.remove('barriendo');
  }
  /* Devuelve una promesa que se cumple cuando la vista nueva ya está puesta. */
  function cambiarVista(v, opc) {
    opc = opc || {};
    if (v === 'acomodadas' && !hayResultado()) v = 'vienen';
    var desde = _vista;
    if (v === desde && !opc.forzar) { cancelarBarrido(); aplicarVista(); return Promise.resolve(); }
    cancelarBarrido();
    _vista = v;
    soltarSenales(); cerrarFicha();
    if (_ctlVer) _ctlVer.fijar(v, false);
    var orig = $('an-orig'), res = $('an-res'), haz = $('an-haz'), mesa = $('an-mesa');
    /* Con muchas piezas (el mismo tope del viaje de A8) el recorte repintaría cien SVG por cuadro en
       un teléfono de gama media: ahí el cambio es directo. */
    var muchas = res.querySelectorAll('svg>g').length > MAX_VIAJE;
    if (opc.sinBarrido || muchas || sinMov() || !res.animate || !haz.animate || !res.firstElementChild || !orig.firstElementChild) {
      aplicarVista(); return Promise.resolve();
    }
    var tok = ++_tokBarrido, ida = v === 'acomodadas';
    orig.hidden = false; res.hidden = false;
    var ancho = Math.max(0, mesa.clientWidth);   // medido con las dos a la vista: una escondida mide 0
    mesa.classList.add('barriendo');
    var tapado = 'inset(0px 100% 0px 0px)', abierto = 'inset(0px 0px 0px 0px)', curva = 'cubic-bezier(.4,0,.2,1)';
    var a1 = res.animate([{ clipPath: ida ? tapado : abierto }, { clipPath: ida ? abierto : tapado }], { duration: MS_BARRIDO, easing: curva, fill: 'both' });
    var x0 = ida ? 0 : Math.max(0, ancho - 3), x1 = ida ? Math.max(0, ancho - 3) : 0;
    var a2 = haz.animate([{ transform: 'translateX(' + x0 + 'px)', opacity: 1 }, { transform: 'translateX(' + x1 + 'px)', opacity: 1 }], { duration: MS_BARRIDO, easing: curva, fill: 'both' });
    _barrido = [a1, a2];
    return Promise.all([a1.finished, a2.finished]).then(function () {
      if (tok !== _tokBarrido) return;
      cancelarBarrido(); aplicarVista();
    }, function () { /* cancelado por otro cambio: ese ya dejó la vista puesta */ });
  }
  if (PZ() && PZ().opcionesDeslizantes && $('an-vista-ver')) {
    _ctlVer = PZ().opcionesDeslizantes($('an-vista-ver'), { alCambiar: function (v) { cambiarVista(v); } });
  }

  /* La silueta del primer acomodo (A13). El motor tarda en calcular las formas de ajuste antes de
     dar nada, y la mesa se quedaba en negro con una frase. Ahora se queda lo que ya se veía,
     atenuado (css/anidador.css: .calculando), y una ficha dice qué se hace y cuánto lleva. */
  function empezarCalculo() {
    cancelarBarrido(); finalizarPliegue(); soltarSenales(); cerrarFicha();
    liberarCarrusel();
    _zoom = []; _activa = 0;
    var res = $('an-res'); res.textContent = '';
    _vista = 'vienen'; habilitarAcomodadas(false);
    if (_ctlVer) _ctlVer.fijar('vienen', false);
    $('an-st-merma-m2').textContent = ''; $('an-st-merma-m2').removeAttribute('data-v');
    aplicarVista();
    var P = PZ(), ficha = $('an-calculando'), seg = $('an-calculando-s');
    $('an-mesa').classList.add('calculando');
    ficha.hidden = false; seg.textContent = '';
    _calc.t0 = Date.now();
    clearInterval(_calc.reloj);
    _calc.reloj = setInterval(function () {
      var ms = Date.now() - _calc.t0;
      seg.textContent = ms >= 1000 ? (P && P.reloj ? P.reloj(ms) : Math.floor(ms / 1000) + ' s') : '';
    }, 1000);
  }
  function terminarCalculo() {
    clearInterval(_calc.reloj); _calc.reloj = 0;
    var ficha = $('an-calculando'); if (ficha) ficha.hidden = true;
    $('an-mesa').classList.remove('calculando');
  }
  /* Un archivo nuevo: la mesa vuelve a lo que era antes de cualquier acomodo. */
  function reiniciarMesa() {
    cancelarBarrido(); finalizarPliegue(); soltarSenales(); cerrarFicha(); terminarCalculo();
    liberarCarrusel();
    _zoom = []; _activa = 0; _cacheLocal = {}; _cacheArea = {};
    var res = $('an-res'); res.textContent = '';
    _vista = 'vienen'; habilitarAcomodadas(false);
    if (_ctlVer) _ctlVer.fijar('vienen', false);
    var n = $('an-noticia'); if (n) n.hidden = true;
    aplicarVista();
  }

  /* ---------- El pie de la mesa ----------
     Zoom, puntos del carrusel, la pieza elegida y las que no caben: cada fila aparece cuando hay a
     qué aplicarla, y el pie entero se esconde si ninguna aparece. */
  function actualizarPie() {
    var pie = $('an-mesa-pie'); if (!pie) return;
    var enHojas = _vista === 'acomodadas' && hayResultado();
    var tieneZoom = enHojas;
    var tienePags = !!(enHojas && _pags);
    var fuera = (T.fueraIds || []).length;
    var tienePieza = !!(enHojas && _sel && editable());
    $('an-zoom').hidden = !tieneZoom;
    $('an-pags').classList.toggle('oculta', !tienePags);
    $('an-pieza').hidden = !tienePieza;
    $('an-fuera').hidden = !fuera;
    if (fuera) {
      var b = $('an-fuera-ver'), n = (T.fueraIds || []).length;
      b.textContent = (n === 1 ? '1 pieza no cabe' : n + ' piezas no caben') + ' · ' + (_senal && _senal.quien === 'fuera' ? 'Soltar' : 'Ver cuáles');
      b.setAttribute('aria-pressed', _senal && _senal.quien === 'fuera' ? 'true' : 'false');
    }
    if (tienePieza) {
      var g = document.getElementById(_sel);
      $('an-pieza-t').textContent = g ? nombreDe(g) : '';
      $('an-pieza-devolver').hidden = !(g && fueMovida(g));
    }
    pie.hidden = $('an-zoom').hidden && $('an-pieza').hidden && $('an-fuera').hidden && !(tienePags && !$('an-pags').hidden);
    if (tieneZoom) actualizarZoomUI();
  }

  /* ---------- Varias hojas en carrusel (A12) ----------
     En computadora las hojas se quedan una debajo de otra, que sí cabe. En pantalla angosta o
     táctil, con más de una, son páginas de P.paginas: scroll-snap, puntos de 44 px que se pintan en
     el pie, y las flechas del teclado con la tira enfocada. Repintar la mesa no es cambiar de hoja:
     pintarResultado() guarda y repone el scroll de lado. */
  function liberarCarrusel() {
    if (!_pags) return;
    try { _pags.destruir(); } catch (_) {}
    _pags = null;
    var cont = $('an-res');
    ['tabindex', 'role', 'aria-roledescription', 'aria-label'].forEach(function (a) { cont.removeAttribute(a); });
    lista(cont.children).forEach(function (f) {
      ['role', 'aria-roledescription', 'data-pag-rotulo'].forEach(function (a) { f.removeAttribute(a); });
      if (f.hasAttribute('aria-label') && f.getAttribute('aria-label').indexOf('Hoja ') === 0) f.removeAttribute('aria-label');
      f.classList.remove('pagina-actual');
    });
    var barra = $('an-pags'); barra.textContent = ''; barra.classList.remove('paginas-barra'); barra.removeAttribute('role'); barra.removeAttribute('aria-label');
  }
  function ajustarCarrusel() {
    var P = PZ(), cont = $('an-res'), figs = hojas();
    var quiere = !!(P && P.paginas && figs.length >= 2 && window.matchMedia && window.matchMedia(MQ_CARRUSEL).matches);
    if (!quiere) { liberarCarrusel(); actualizarPie(); return; }
    if (!_pags) {
      _pags = P.paginas(cont, { nombre: 'hoja', etiqueta: 'Hojas del acomodo', puntos: $('an-pags'),
        alCambiar: function (i) { _activa = i; cerrarFicha(); actualizarZoomUI(); } });
    } else _pags.medir();
    actualizarPie();
  }
  if (window.matchMedia) {
    var _mqC = window.matchMedia(MQ_CARRUSEL);
    if (_mqC.addEventListener) _mqC.addEventListener('change', ajustarCarrusel);
  }

  /* ---------- El aprovechamiento de cada hoja (A12) ----------
     La misma cuenta que hace el motor para el número grande, hoja por hoja: el área de cada
     pieza ya engordada media separación (lo que el motor llama `tree[id]`) entre el área de la hoja
     ya adelgazada otro tanto. Con las hojas iguales, el promedio de estas cifras ES el
     aprovechamiento del marcador; con el área de la pieza a secas saldría unos puntos más baja y
     las dos no cuadrarían. Una pieza se mide una vez (la cuenta cuesta un recorte de Clipper). */
  function areaDelMotor(g, sep) {
    var c = g.firstElementChild; if (!c || !c.id) return NaN;
    var llave = c.id + '|' + sep + '|' + (T.k || (A && A.k) || 1);
    if (llave in _cacheArea) return _cacheArea[llave];
    var area = NaN;
    try {
      var SN = window.SvgNest, GU = window.GeometryUtil, SP = window.SvgParser;
      SP.config({ tolerance: TOLERANCIA_MM });
      var poli = SP.polygonify(c);
      poli = SN.cleanPolygon(poli) || poli;
      if (sep > 0) { var o = SN.polygonOffset(poli, 0.5 * sep); if (o && o.length === 1) poli = o[0]; }
      area = Math.abs(GU.polygonArea(poli));
    } catch (_) { area = NaN; }
    _cacheArea[llave] = area;
    return area;
  }
  function usoDeHoja(svg, d) {
    var sep = (T.material && T.material.sep > 0) ? T.material.sep : 0, suma = 0, hay = false;
    hijos(svg).forEach(function (g) {
      if (!g.tagName || g.tagName !== 'g') return;
      var a = areaDelMotor(g, sep);
      if (a === a) { suma += a; hay = true; }
    });
    var bin = (d.w - sep) * (d.h - sep);
    return hay && bin > 0 ? Math.min(1, suma / bin) : NaN;
  }

  /* ---------- Pintar el resultado ---------- */
  function dimsDeHoja(s) {
    var w = parseFloat(s.getAttribute('data-w')), h = parseFloat(s.getAttribute('data-h'));
    if (w > 0 && h > 0) return { w: w, h: h };
    var vb = s.viewBox && s.viewBox.baseVal;
    return vb ? { w: vb.width, h: vb.height } : { w: 0, h: 0 };
  }
  /* Los números de la merma (A11): lo que se tira, en metros cuadrados. Es el porcentaje que ya
     estaba por lo que mide el material que se compra: ancho × alto × hojas × merma. */
  function pintarStats() {
    $('an-st-int').textContent = T.intentos;
    if (!T.mejor) return;
    var ef = T.mejor.eficiencia || 0;
    contar($('an-st-uso'), ef * 100, function (v) { return Math.round(v) + ' %'; });
    contar($('an-st-merma'), (1 - ef) * 100, function (v) { return Math.round(v) + ' %'; });
    var n = T.mejor.svglist.length, d = dimsDeHoja(T.mejor.svglist[0]);
    contar($('an-st-merma-m2'), (1 - ef) * n * d.w * d.h / 1e6, function (v) { return v.toFixed(2) + ' m²'; });
    $('an-st-col').textContent = T.mejor.colocadas + '/' + T.mejor.total;
    $('an-st-hojas').textContent = n;
    var cal = calificar(ef);
    $('an-st-uso-lbl').textContent = cal.txt;
    var fg = $('an-gauge-fg');
    fg.style.strokeDashoffset = String(326.73 * (1 - Math.max(0, Math.min(1, ef))));
    fg.setAttribute('class', 'an-gauge-fg ' + cal.cls);
  }

  /* Las hojas, como nodos sueltos todavía. Cada <g> de pieza recibe su turno de color y de caída,
     y ahora también su nombre (`pz-` + el id de su elemento), su número y lo que hace falta para
     llegar a ella con el teclado. */
  function construirHojas(mejora) {
    var salida = [], idx = 0, n = T.mejor.svglist.length;
    T.mejor.svglist.forEach(function (s, i) {
      var d = dimsDeHoja(s), alta = d.h > d.w;
      var fig = document.createElement('figure'); fig.className = 'an-hoja' + (alta ? ' alta' : '') + (mejora ? ' mejora' : '');
      s.removeAttribute('width'); s.removeAttribute('height');
      s.setAttribute('data-w', fmt(d.w)); s.setAttribute('data-h', fmt(d.h)); s.setAttribute('data-i', String(i));
      /* Un grupo y no una imagen: role="img" vuelve decorativo todo lo de dentro, y las piezas
         se pueden elegir con el teclado. */
      s.setAttribute('role', 'group'); s.setAttribute('aria-label', 'Hoja ' + (i + 1) + ' con las piezas acomodadas');
      s.setAttribute('tabindex', '0'); s.setAttribute('aria-describedby', 'an-mesa-ayuda');
      var piezas = 0;
      hijos(s).forEach(function (g) {
        if (g.tagName !== 'g') return;
        /* Cada pieza con su turno de color y su turno de caída. */
        g.setAttribute('class', 'an-p' + (idx % COLORES_PIEZA));
        g.style.setProperty('--i', String(piezas));
        var c = g.firstElementChild;
        if (c && c.id) {
          /* El hueco de una pieza hereda el id de su contorno (el motor parte un trazo compuesto en
             dos elementos): se le quita para que no haya dos iguales en la página. */
          hijos(g).slice(1).forEach(function (h) { if (h.getAttribute && /^an-e\d+$/.test(h.getAttribute('id') || '')) h.removeAttribute('id'); });
          g.setAttribute('id', 'pz-' + c.id);
          g.setAttribute('tabindex', '-1'); g.setAttribute('role', 'button');
          g.setAttribute('aria-label', nombreDe(g));
        }
        piezas++; idx++;
      });
      fig.appendChild(s);
      var cap = document.createElement('figcaption');
      var t = document.createElement('span'); t.className = 'an-cap-t';
      t.innerHTML = '<b>Hoja ' + (i + 1) + '</b>' + (n > 1 ? ' de ' + n : '') + ' · ' + piezas + (piezas === 1 ? ' pieza' : ' piezas') +
        (d.w > 0 ? ' · ' + esc(M.formatoMm(d.w)) + ' × ' + esc(M.formatoMm(d.h)) : '');
      cap.appendChild(t);
      if (n > 1) {
        var uso = usoDeHoja(s, d);
        if (uso === uso) {
          var fila = document.createElement('span'); fila.className = 'an-cap-uso';
          var barra = document.createElement('span'); barra.className = 'an-cap-barra'; barra.setAttribute('aria-hidden', 'true');
          var relleno = document.createElement('i'); relleno.style.setProperty('--uso', String(Math.max(0, Math.min(1, uso)))); barra.appendChild(relleno);
          var pct = document.createElement('span'); pct.className = 'an-cap-pct'; pct.textContent = Math.round(uso * 100) + ' %';
          fila.appendChild(barra); fila.appendChild(pct); cap.appendChild(fila);
          if (i === n - 1 && uso < RETAZO_BAJO) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'an-cap-retazo'; b.setAttribute('data-an-retazo', '');
            b.textContent = '¿Cabe en un retazo?'; cap.appendChild(b);
          }
        }
      }
      fig.appendChild(cap);
      salida.push(fig);
    });
    return salida;
  }
  /* La hoja que ya no hace falta, vacía: sus piezas pasaron a las demás. */
  function vaciarHoja(fig) {
    lista(fig.querySelectorAll('svg>g')).forEach(function (g) { g.parentNode.removeChild(g); });
    fig.classList.remove('mejora'); fig.classList.add('saliendo');
    fig.setAttribute('aria-hidden', 'true');
    try { fig.inert = true; } catch (_) {}
    var cap = fig.querySelector('figcaption'); if (cap) cap.textContent = '';
  }
  function guardarFoco(cont) {
    var a = document.activeElement;
    if (!a || a === document.body || !cont.contains(a)) return null;
    var svg = a.closest ? a.closest('.an-hoja>svg') : null;
    return svg ? { hoja: +svg.getAttribute('data-i'), pieza: a.tagName === 'g' ? a.id : '' } : null;
  }
  function reponerFoco(cont, f) {
    if (!f) return;
    var figs = hojas(), fig = figs[f.hoja], svg = fig ? fig.querySelector(':scope>svg') : null;
    var el = (f.pieza && document.getElementById(f.pieza)) || svg;
    if (el && el.focus) { try { el.focus({ preventScroll: true }); } catch (_) {} }
  }

  function pintarResultado(mejora) {
    var cont = $('an-res'), P = PZ();
    if (!T.mejor) return;
    terminarCalculo();
    finalizarPliegue();
    cerrarFicha();
    var tok = ++_tokPliegue;
    var viejas = lista(cont.querySelectorAll(':scope > .an-hoja'));
    var scrollX = cont.scrollLeft, foco = guardarFoco(cont);
    var nuevas = construirHojas(mejora);
    var sobran = (mejora && viejas.length > nuevas.length) ? viejas.slice(nuevas.length) : [];
    var d = dimsDeHoja(T.mejor.svglist[0]);
    var poner = function () {
      cont.textContent = '';
      nuevas.forEach(function (f) { cont.appendChild(f); });
      sobran.forEach(function (v) { vaciarHoja(v); cont.appendChild(v); });
      reponerEncuadres();
      cont.scrollLeft = scrollX;
      marcarGiradas();
      ajustarCarrusel();
      reponerFoco(cont, foco);
    };
    /* Las piezas viajan. P.flip lee dónde estaba cada <g> por su id, repinta (`poner`, que corre
       en el acto) y mueve de la posición vieja a la nueva solo las que cambiaron. */
    var viaje = (mejora && P && P.flip)
      ? P.flip(function () { return lista(cont.querySelectorAll('.an-hoja>svg>g[id]')); }, poner,
          { clase: 'se-movio', duracion: MS_VIAJE, maximo: MAX_VIAJE })
      : (poner(), Promise.resolve([]));
    habilitarAcomodadas(true);
    if (!mejora) cambiarVista('acomodadas'); else { aplicarVista(); }
    /* Una hoja menos (A11): primero viajaron las piezas, ahora se pliega la que quedó vacía y al
       final sale la ficha. */
    if (sobran.length) {
      viaje.then(function () {
        if (tok !== _tokPliegue) return;
        return plegarHojas(sobran);
      }).then(function () {
        if (tok !== _tokPliegue) return;
        noticiaHojaMenos(sobran.length, d);
      });
    }
    actualizarEditable();
    medirMesa();
    /* Cuando MEJORA —no la primera vez— el marcador late una vez. */
    if (mejora && !QUIETO) {
      var m = $('an-prog'); m.classList.remove('mejora');
      void m.offsetWidth; m.classList.add('mejora');
    }
    actualizarDescarga();
  }

  /* ---------- Una hoja menos (A11) ---------- */
  function plegarHojas(figs) {
    var cont = $('an-res');
    if (sinMov()) { figs.forEach(function (f) { if (f.parentNode) f.parentNode.removeChild(f); }); ajustarCarrusel(); return Promise.resolve(); }
    var enCarrusel = cont.classList.contains('paginas');
    var hueco = parseFloat(window.getComputedStyle(cont).rowGap) || 0;
    var anims = figs.map(function (f) {
      var alto = f.offsetHeight;
      f.style.overflow = 'hidden';
      var kf = enCarrusel
        ? [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.92)' }]
        : [{ height: alto + 'px', opacity: 1, marginTop: '0px' }, { height: '0px', opacity: 0, marginTop: (-hueco) + 'px' }];
      return f.animate(kf, { duration: MS_PLIEGUE, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
    });
    return Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); })).then(function () {
      figs.forEach(function (f) { if (f.parentNode) f.parentNode.removeChild(f); });
      ajustarCarrusel();
    });
  }
  /* Si otra mejora llega a media secuencia, lo que quedaba pendiente se termina de golpe. */
  function finalizarPliegue() {
    _tokPliegue++;
    lista(document.querySelectorAll('#an-res > .an-hoja.saliendo')).forEach(function (f) {
      try { f.getAnimations().forEach(function (a) { a.cancel(); }); } catch (_) {}
      if (f.parentNode) f.parentNode.removeChild(f);
    });
  }
  function noticiaHojaMenos(n, d) {
    var el = $('an-noticia'), P = PZ();
    var txt = (n === 1 ? 'Una hoja menos' : n + ' hojas menos') + ' · ' + (n * d.w * d.h / 1e6).toFixed(2) + ' m² de ' + MAT_TXT[materialElegido()];
    el.textContent = txt; el.hidden = false;
    el.classList.remove('sale');
    if (!sinMov()) { void el.offsetWidth; el.classList.add('sale'); }
    if (P && P.voz) P.voz(txt);
    clearTimeout(_tNoticia);
    _tNoticia = setTimeout(function () { el.hidden = true; el.classList.remove('sale'); }, MS_NOTICIA);
    var f = $('an-ficha-hojas');
    if (f && !sinMov()) {
      f.classList.remove('baja'); void f.offsetWidth; f.classList.add('baja');
      setTimeout(function () { f.classList.remove('baja'); }, 700);
    }
  }

  /* ---------- El zoom y el paneo (A7) ----------
     El encuadre de cada hoja es { z, cx, cy }: cuántas veces más cerca que la hoja entera y qué
     punto de la hoja (en mm) queda al centro. El viewBox sale de ahí, así que sigue siendo vector.
     Vive en esta variable y no en el SVG, porque cada mejora repinta la hoja con un SVG nuevo:
     pintarResultado() lo repone en el nuevo.

     Cuentas de pantalla: el SVG se pinta «meet» dentro de su caja, con la hoja entera a
     a0 = min(ancho/W, alto/H) píxeles por mm y centrada si sobra lado. Con zoom z la escala es
     a0·z y el desplazamiento del centrado no cambia, de modo que el punto de la hoja bajo un punto
     de pantalla se calcula sin leer ninguna matriz (leerla en pleno gesto devolvía la del cuadro
     anterior). */
  function geo(svg) {
    var r = svg.getBoundingClientRect(), W = parseFloat(svg.getAttribute('data-w')), H = parseFloat(svg.getAttribute('data-h'));
    var a0 = (W > 0 && H > 0 && r.width > 0 && r.height > 0) ? Math.min(r.width / W, r.height / H) : 0;
    return { r: r, W: W, H: H, a0: a0, ox: (r.width - W * a0) / 2, oy: (r.height - H * a0) / 2 };
  }
  function zMaxDe(g) { return g.a0 > 0 ? Math.max(4, Math.min(80, PX_MM_MAX / g.a0)) : 8; }
  function zUnoDe(g) { return g.a0 > 0 ? Math.min(zMaxDe(g), Math.max(2, PX_MM_REAL / g.a0)) : 4; }
  function centroLimitado(W, H, z, cx, cy) {
    var mx = W / (2 * z), my = H / (2 * z);
    return { cx: Math.min(W - mx, Math.max(mx, cx)), cy: Math.min(H - my, Math.max(my, cy)) };
  }
  function hojaEn(g, v, px, py) {
    var sc = g.a0 * v.z;
    return { x: v.cx - g.W / (2 * v.z) + (px - g.r.left - g.ox) / sc, y: v.cy - g.H / (2 * v.z) + (py - g.r.top - g.oy) / sc };
  }
  function centroPara(g, z, u, px, py) {
    var sc = g.a0 * z;
    return { cx: u.x + g.W / (2 * z) - (px - g.r.left - g.ox) / sc, cy: u.y + g.H / (2 * z) - (py - g.r.top - g.oy) / sc };
  }
  function indiceDe(svg) { return parseInt(svg.getAttribute('data-i'), 10) || 0; }
  function vistaDe(svg) {
    var i = indiceDe(svg), W = parseFloat(svg.getAttribute('data-w')) || 0, H = parseFloat(svg.getAttribute('data-h')) || 0;
    return _zoom[i] || { z: 1, cx: W / 2, cy: H / 2 };
  }
  function pintarEncuadre(svg, v) {
    var W = parseFloat(svg.getAttribute('data-w')), H = parseFloat(svg.getAttribute('data-h'));
    if (!(W > 0 && H > 0)) return;
    var w = W / v.z, h = H / v.z;
    svg.setAttribute('viewBox', [v.cx - w / 2, v.cy - h / 2, w, h].map(fmt).join(' '));
    svg.classList.toggle('con-zoom', v.z > 1.0001);
  }
  function reponerEncuadres() {
    hojas().forEach(function (f) {
      var svg = f.querySelector(':scope>svg'); if (svg) pintarEncuadre(svg, vistaDe(svg));
    });
  }
  /* Pone el encuadre pedido, ya acotado: z entre 1 y el máximo, y la ventana dentro de la hoja. */
  function fijarVista(svg, v) {
    var g = geo(svg);
    if (!(g.W > 0 && g.H > 0)) return vistaDe(svg);
    var z = Math.max(1, Math.min(v.z, zMaxDe(g)));
    var c = centroLimitado(g.W, g.H, z, v.cx, v.cy);
    var nv = { z: z, cx: c.cx, cy: c.cy };
    _zoom[indiceDe(svg)] = z <= 1.0001 ? null : nv;
    pintarEncuadre(svg, nv);
    cerrarFicha();
    actualizarZoomUI();
    return nv;
  }
  var _animVista = 0;
  function animarVista(svg, destino) {
    cancelAnimationFrame(_animVista);
    if (sinMov()) { fijarVista(svg, destino); return; }
    var ini = vistaDe(svg), t0 = performance.now(), ms = 300;
    (function paso(t) {
      var k = Math.min(1, (t - t0) / ms); k = 1 - Math.pow(1 - k, 3);
      fijarVista(svg, { z: ini.z + (destino.z - ini.z) * k, cx: ini.cx + (destino.cx - ini.cx) * k, cy: ini.cy + (destino.cy - ini.cy) * k });
      if (k < 1) _animVista = requestAnimationFrame(paso);
    })(t0);
  }
  /* El punto de la hoja que está bajo (px, py) se queda bajo (px, py). */
  function zoomEn(svg, px, py, factor) {
    var g = geo(svg), v = vistaDe(svg); if (!(g.a0 > 0)) return false;
    var z = Math.max(1, Math.min(v.z * factor, zMaxDe(g)));
    if (Math.abs(z - v.z) < 1e-6) return false;
    var u = hojaEn(g, v, px, py), c = centroPara(g, z, u, px, py);
    fijarVista(svg, { z: z, cx: c.cx, cy: c.cy });
    return true;
  }
  function hojaActiva() {
    var figs = hojas(); if (!figs.length) return null;
    var i = _pags ? _pags.actual() : _activa;
    i = Math.max(0, Math.min(figs.length - 1, i || 0));
    return figs[i].querySelector(':scope>svg');
  }
  /* Los botones del pie y la barra de 100 mm: dicen lo que pasa con la hoja que atienden. */
  function actualizarZoomUI() {
    var svg = hojaActiva(); if (!svg || $('an-zoom').hidden) return;
    var g = geo(svg), v = vistaDe(svg), max = zMaxDe(g);
    $('an-zoom-menos').setAttribute('aria-disabled', v.z <= 1.0001 ? 'true' : 'false');
    $('an-zoom-mas').setAttribute('aria-disabled', v.z >= max - 1e-6 ? 'true' : 'false');
    $('an-zoom-todo').setAttribute('aria-disabled', v.z <= 1.0001 ? 'true' : 'false');
    var esc_ = $('an-escala'), sc = g.a0 * v.z;
    if (!(sc > 0)) return;
    /* La barra mide lo más cerca de 100 mm que quepa en 64 px: a la hoja entera de un teléfono son
       200 mm (47 px); con zoom, 50, 20 o 10 mm. */
    var opciones = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000], largo = opciones[opciones.length - 1];
    for (var k = opciones.length - 1; k >= 0; k--) { if (opciones[k] * sc <= 64) { largo = opciones[k]; break; } }
    esc_.style.setProperty('--w', Math.round(largo * sc) + 'px');
    esc_.querySelector('b').textContent = (largo >= 1000 ? (largo / 1000) + ' m' : largo + ' mm');
  }
  $('an-zoom-mas').addEventListener('click', function () { zoomBoton(1.5); });
  $('an-zoom-menos').addEventListener('click', function () { zoomBoton(1 / 1.5); });
  $('an-zoom-todo').addEventListener('click', function () {
    var svg = hojaActiva(); if (!svg || this.getAttribute('aria-disabled') === 'true') return;
    var g = geo(svg); animarVista(svg, { z: 1, cx: g.W / 2, cy: g.H / 2 });
  });
  function zoomBoton(f) {
    var svg = hojaActiva(); if (!svg) return;
    var btn = f > 1 ? $('an-zoom-mas') : $('an-zoom-menos');
    if (btn.getAttribute('aria-disabled') === 'true') return;
    var v = vistaDe(svg);
    animarVista(svg, { z: v.z * f, cx: v.cx, cy: v.cy });
  }

  /* La rueda acerca con Ctrl (o ⌘, o el pellizco del panel táctil, que el navegador manda como
     Ctrl + rueda), y sin Ctrl solo si ya hay zoom: con la hoja entera, la rueda sigue siendo de la
     página, y secuestrarla en una pantalla que se recorre con la rueda sería peor que no tener zoom. */
  $('an-res').addEventListener('wheel', function (e) {
    var svg = sobreMesa(e, '.an-hoja>svg'); if (!svg) return;
    var v = vistaDe(svg), pidio = e.ctrlKey || e.metaKey;
    if (!pidio && v.z <= 1.0001) return;
    var dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    var cambio = zoomEn(svg, e.clientX, e.clientY, Math.exp(-Math.max(-100, Math.min(100, dy)) * 0.002));
    if (cambio || pidio) e.preventDefault();
  }, { passive: false });

  /* ---------- Los dedos sobre una hoja (A7, A10, A24) ----------
     Un solo oyente de pointerdown en la mesa, que reparte según lo que haya: dos dedos son un
     pellizco; un dedo con zoom, un arrastre del dibujo; un dedo que se queda 350 ms sobre una pieza
     con el cálculo detenido la levanta; y un toque corto (el dedo no pasó de 8 px) elige la pieza
     que está debajo, o suelta la elegida si no hay ninguna. Dos toques seguidos van a tamaño real
     en ese punto, o de regreso a la hoja entera. Sin zoom y sin pieza levantada el dedo no se toca:
     el scroll de la página y el del carrusel son del navegador.

     Con el dedo, lo que arranca como scroll del navegador se cancela solo (pointercancel) y aquí
     simplemente se suelta todo. */
  function distancia(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function puntos(m) { var l = []; m.ids.forEach(function (p) { l.push(p); }); return l; }
  function soltarGesto(devolverPieza) {
    var m = _gesto; if (!m) return;
    clearTimeout(m.timer);
    if (m.pieza && m.modo === 'pieza') terminarLevantada(m, devolverPieza);
    m.svg.classList.remove('arrastrando');
    _gesto = null;
  }
  function iniciarPinza(m) {
    var p = puntos(m), g = geo(m.svg), v = vistaDe(m.svg);
    var mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    m.modo = 'pinza';
    m.base = { d: distancia(p[0], p[1]) || 1, v: v, u: hojaEn(g, v, mid.x, mid.y) };
    m.svg.classList.add('arrastrando'); cerrarFicha();
  }
  $('an-res').addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var svg = sobreMesa(e, '.an-hoja>svg'); if (!svg) return;
    cancelAnimationFrame(_animVista);
    _activa = indiceDe(svg);
    if (_gesto && _gesto.svg !== svg) soltarGesto(true);
    var p = { x: e.clientX, y: e.clientY };
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    if (!_gesto) {
      var pieza = sobreMesa(e, '.an-hoja>svg>g[id]');
      _gesto = { svg: svg, ids: new Map(), modo: 'espera', x0: p.x, y0: p.y, t0: Date.now(), pieza: pieza, tipo: e.pointerType, timer: 0, base: null };
      _gesto.ids.set(e.pointerId, p);
      if (pieza && e.pointerType !== 'mouse' && editable()) _gesto.timer = setTimeout(levantarPieza, MS_LARGO);
      return;
    }
    /* El segundo dedo: pellizco. Lo que se hubiera levantado regresa. */
    clearTimeout(_gesto.timer);
    if (_gesto.modo === 'pieza') terminarLevantada(_gesto, true);
    _gesto.ids.set(e.pointerId, p);
    if (_gesto.ids.size >= 2) iniciarPinza(_gesto);
  });
  $('an-res').addEventListener('pointermove', function (e) {
    var m = _gesto; if (!m || !m.ids.has(e.pointerId)) return;
    var p = m.ids.get(e.pointerId); p.x = e.clientX; p.y = e.clientY;
    if (m.modo === 'espera') {
      var umbral = m.tipo === 'mouse' ? 4 : 8;
      if (distancia(p, { x: m.x0, y: m.y0 }) <= umbral) return;
      clearTimeout(m.timer); m.timer = 0;
      if (m.pieza && m.tipo === 'mouse' && editable()) { levantarPieza(); }
      else if (vistaDe(m.svg).z > 1.0001) {
        m.modo = 'arrastre'; m.base = { x: p.x, y: p.y, v: vistaDe(m.svg), g: geo(m.svg) }; m.svg.classList.add('arrastrando'); cerrarFicha();
      } else m.modo = 'libre';
      if (m.modo === 'espera') return;
    }
    if (m.modo === 'arrastre') {
      var b = m.base, sc = b.g.a0 * b.v.z; if (!(sc > 0)) return;
      fijarVista(m.svg, { z: b.v.z, cx: b.v.cx - (p.x - b.x) / sc, cy: b.v.cy - (p.y - b.y) / sc });
    } else if (m.modo === 'pinza' && m.ids.size >= 2) {
      var l = puntos(m), d = distancia(l[0], l[1]), mid = { x: (l[0].x + l[1].x) / 2, y: (l[0].y + l[1].y) / 2 };
      var g = geo(m.svg), z = Math.max(1, Math.min(m.base.v.z * d / m.base.d, zMaxDe(g)));
      var c = centroPara(g, z, m.base.u, mid.x, mid.y);
      fijarVista(m.svg, { z: z, cx: c.cx, cy: c.cy });
    } else if (m.modo === 'pieza') {
      var q = m.lev; if (!q) return;
      escribirTransform(m.pieza, { x: q.t.x + (p.x - q.x) / q.sc, y: q.t.y + (p.y - q.y) / q.sc, r: q.t.r });
    }
  });
  function alSoltar(e) {
    var m = _gesto; if (!m || !m.ids.has(e.pointerId)) return;
    var cancelado = e.type === 'pointercancel', p = m.ids.get(e.pointerId);
    m.ids.delete(e.pointerId);
    try { m.svg.releasePointerCapture(e.pointerId); } catch (_) {}
    if (cancelado) { if (!m.ids.size) soltarGesto(true); return; }
    if (m.modo === 'espera' && !m.ids.size) {
      clearTimeout(m.timer);
      var ahora = Date.now();
      /* Un toque. Dos seguidos, cerca uno del otro, son el doble toque del zoom. */
      if (_ultimoToque && _ultimoToque.svg === m.svg && ahora - _ultimoToque.t < 320 && distancia(_ultimoToque, p) < 30) {
        _ultimoToque = null; _gesto = null;
        dobleToque(m.svg, p.x, p.y);
        return;
      }
      _ultimoToque = { t: ahora, x: p.x, y: p.y, svg: m.svg };
      _gesto = null;
      if (m.pieza) alternarFicha(m.pieza); else cerrarFicha();
      return;
    }
    if (m.modo === 'pieza' && !m.ids.size) {
      var g = m.pieza;
      m.svg.classList.remove('arrastrando');
      _gesto = null; clearTimeout(m.timer);
      terminarLevantada(m, false);
      if (g.isConnected && fichaPieza()) fichaPieza().abrir(g);
      return;
    }
    if (m.modo === 'pinza' && m.ids.size === 1) {
      /* Quedó un dedo: si hay zoom sigue arrastrando desde donde está, sin saltos. */
      var resto = puntos(m)[0];
      m.modo = 'arrastre'; m.base = { x: resto.x, y: resto.y, v: vistaDe(m.svg), g: geo(m.svg) };
      return;
    }
    if (!m.ids.size) { m.svg.classList.remove('arrastrando'); _gesto = null; clearTimeout(m.timer); }
  }
  $('an-res').addEventListener('pointerup', alSoltar);
  $('an-res').addEventListener('pointercancel', alSoltar);
  /* Con una pieza levantada o el dibujo en la mano, el dedo no puede además desplazar la página.
     touch-action se decide al empezar el toque; esto lo reafirma para lo que arranca después de
     mantener presionado. */
  $('an-res').addEventListener('touchmove', function (e) {
    if (_gesto && _gesto.modo !== 'espera' && _gesto.modo !== 'libre' && e.cancelable) e.preventDefault();
  }, { passive: false });
  /* El toque largo abre el menú del sistema en algunos teléfonos (copiar, compartir imagen). */
  $('an-res').addEventListener('contextmenu', function (e) { if (_gesto && sobreMesa(e, '.an-hoja>svg')) e.preventDefault(); });
  /* A tamaño real en ese punto, o de regreso a la hoja entera. */
  function dobleToque(svg, px, py) {
    var g = geo(svg), v = vistaDe(svg); if (!(g.a0 > 0)) return;
    if (v.z > 1.05) { animarVista(svg, { z: 1, cx: g.W / 2, cy: g.H / 2 }); return; }
    var z = zUnoDe(g), u = hojaEn(g, v, px, py), c = centroPara(g, z, u, px, py);
    animarVista(svg, { z: z, cx: c.cx, cy: c.cy });
  }

  /* ---------- La ficha de la pieza (A10) ---------- */
  function centroLocal(g) {
    var c = cajaLocal(g); return c ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : { x: 0, y: 0 };
  }
  /* Los contornos de una pieza (el de fuera y sus huecos) en las unidades de la pieza, ANTES de su
     transform. Se miden con el mismo polygonify que usa el motor, a la misma fineza de curvas. */
  function poligonosLocales(g) {
    var c0 = g.firstElementChild; if (!c0) return [];
    var llave = c0.id + '|' + (T.k || (A && A.k) || 1);
    if (llave in _cacheLocal) return _cacheLocal[llave];
    var SP = window.SvgParser, salida = [];
    if (SP) {
      try { SP.config({ tolerance: TOLERANCIA_MM }); } catch (_) {}
      hijos(g).forEach(function (e) {
        if (!e.tagName) return;
        var p = null;
        try { p = SP.polygonify(e); } catch (_) {}
        if (p && p.length > 2) salida.push(p);
      });
    }
    if (c0.id) _cacheLocal[llave] = salida;
    return salida;
  }
  function cajaLocal(g) {
    var polis = poligonosLocales(g); if (!polis.length) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    polis[0].forEach(function (p) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function giroDe(g) { var r = leerTransform(g).r; return ((Math.round(r * 10) / 10 % 360) + 360) % 360; }
  function textoFicha(g) {
    var c = cajaLocal(g), r = giroDe(g), sinMm = function (v) { return M.formatoMm(v).replace(/ mm$/, ''); };
    var t = nombreDe(g);
    if (c) t += ' · ' + sinMm(c.w) + ' × ' + sinMm(c.h) + ' mm';
    if (r) t += ' · girada ' + r + '°';
    return t;
  }
  function fichaPieza() {
    var P = PZ();
    if (_vz || !P || !P.vistazo) return _vz;
    /* No cierra solo al tocar fuera: los botones de «Girar» y «Devolver» están fuera de la ficha y
       un toque en ellos la cerraba, y con ella la pieza elegida, antes de que llegara el clic. Cierra
       quien toca el fondo de la mesa (pointerup de abajo) o la página (el oyente de abajo). */
    _vz = P.vistazo(null, { rol: 'nota', titulo: 'Pieza', lado: 'arriba', alinear: 'centro', tocarFueraCierra: false,
      contenido: function (g) {
        var pista = editable() ? 'Mantén presionada para moverla' : (T.corriendo ? 'Detén el cálculo para moverla a mano' : '');
        return esc(textoFicha(g)) + (pista ? '<br><small>' + esc(pista) + '</small>' : '');
      },
      alAbrir: function (pop, g) { _sel = g.id; actualizarPie(); },
      alCerrar: function () { _sel = ''; actualizarPie(); } });
    return _vz;
  }
  function cerrarFicha() { if (_vz && _vz.abierto()) _vz.cerrar('codigo'); }
  document.addEventListener('pointerdown', function (e) {
    if (!_vz || !_vz.abierto()) return;
    var t = e.target;
    if (t && t.closest && (t.closest('#an-mesa') || t.closest('.vistazo'))) return;
    cerrarFicha();
  }, true);
  function alternarFicha(g) {
    var v = fichaPieza(); if (!v) return;
    if (v.abierto() && _sel === g.id) v.cerrar('alternar'); else v.abrir(g);
  }

  /* ---------- Mover y girar una pieza a mano (A24) ----------
     Solo con el cálculo detenido: mientras corre, el motor repinta la mesa cada pocos segundos y
     taparía lo que se hizo. Una pieza es un <g transform="translate(x y) rotate(r)">; moverla es
     cambiar ese atributo, y armarSalida() copia los <g> tal cual, así que la descarga lleva la
     posición nueva sin más.

     «Cabe» es lo que hace el motor: cada pieza engordada media separación no toca a otra engordada
     igual (a una separación entera una de otra), y de la orilla de la hoja queda a media. No a una
     entera, como parecería: el motor adelgaza la hoja media separación pero reporta las posiciones
     desde la hoja adelgazada, así que sus propias piezas quedan a media separación de la orilla de
     arriba y de la izquierda (1.5 mm con la separación de 3). Exigir una entera hacía imposible
     mover siquiera una pieza que el motor dejó junto a la orilla. Se mide con Clipper:
     desfase de media separación (menos la holgura de las curvas) e intersección de las dos
     regiones —con sus huecos, así que una pieza chica sí cabe dentro del hueco de una «O»—. Un
     traslape de menos de 1 mm² es el redondeo de las curvas y se perdona; si no, las piezas que el
     propio motor dejó tocándose por la separación saldrían como choque. */
  var RE_TRANSFORM = /translate\(\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*\)\s*rotate\(\s*([-\d.eE+]+)/;
  function leerTransform(g) {
    var m = RE_TRANSFORM.exec(g.getAttribute('transform') || '');
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]), r: parseFloat(m[3]) } : { x: 0, y: 0, r: 0 };
  }
  function escribirTransform(g, t) { g.setAttribute('transform', 'translate(' + fmt(t.x) + ' ' + fmt(t.y) + ') rotate(' + fmt(t.r) + ')'); }
  function aHoja(poli, t) {
    var a = t.r * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return poli.map(function (p) { return { x: t.x + p.x * c - p.y * s, y: t.y + p.x * s + p.y * c }; });
  }
  function cajaDe(polis) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    polis.forEach(function (pl) { pl.forEach(function (p) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }); });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  var ESC_CLIP = 1000;   // micras: Clipper trabaja en enteros
  function regionDe(polis, mitad) {
    var C = window.ClipperLib; if (!C) return null;
    var rutas = polis.map(function (pl) { return pl.map(function (p) { return { X: Math.round(p.x * ESC_CLIP), Y: Math.round(p.y * ESC_CLIP) }; }); });
    rutas = C.Clipper.SimplifyPolygons(rutas, C.PolyFillType.pftEvenOdd);
    if (mitad > 0) {
      var co = new C.ClipperOffset(2, 0.1 * ESC_CLIP), fuera = new C.Paths();
      co.AddPaths(rutas, C.JoinType.jtRound, C.EndType.etClosedPolygon);
      co.Execute(fuera, mitad * ESC_CLIP);
      rutas = fuera;
    }
    return rutas;
  }
  function areaDeChoque(a, b) {
    var C = window.ClipperLib, c = new C.Clipper(), sol = new C.Paths(), suma = 0;
    c.AddPaths(a, C.PolyType.ptSubject, true); c.AddPaths(b, C.PolyType.ptClip, true);
    c.Execute(C.ClipType.ctIntersection, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
    for (var i = 0; i < sol.length; i++) suma += C.Clipper.Area(sol[i]);
    return Math.abs(suma) / (ESC_CLIP * ESC_CLIP);
  }
  /* '' si la pieza `g`, puesta en `t`, cabe; 'orilla' u 'otra' si no. */
  function porQueNoCabe(g, t) {
    var svg = g.ownerSVGElement, d = dimsDeHoja(svg), sep = (T.material && T.material.sep > 0) ? T.material.sep : 0;
    var propia = poligonosLocales(g).map(function (p) { return aHoja(p, t); });
    if (!propia.length || !window.ClipperLib) return '';
    var caja = cajaDe(propia), margen = Math.max(0, sep / 2 - HOLGURA_MM), eps = 0.02;
    if (caja.x0 < margen - eps || caja.y0 < margen - eps || caja.x1 > d.w - margen + eps || caja.y1 > d.h - margen + eps) return 'orilla';
    var mitad = Math.max(0, sep / 2 - HOLGURA_MM / 2), mia = null;
    var otras = lista(svg.querySelectorAll(':scope>g[id]'));
    for (var i = 0; i < otras.length; i++) {
      var o = otras[i]; if (o === g) continue;
      var suyas = poligonosLocales(o).map(function (p) { return aHoja(p, leerTransform(o)); });
      if (!suyas.length) continue;
      var cb = cajaDe(suyas);
      if (cb.x1 + sep < caja.x0 || cb.x0 - sep > caja.x1 || cb.y1 + sep < caja.y0 || cb.y0 - sep > caja.y1) continue;
      if (!mia) mia = regionDe(propia, mitad);
      if (areaDeChoque(mia, regionDe(suyas, mitad)) > CHOQUE_MM2) return 'otra';
    }
    return '';
  }
  function fueMovida(g) {
    var o = _origen && _origen.get(g); if (!o) return false;
    var t = leerTransform(g);
    return Math.abs(t.x - o.x) > 0.0005 || Math.abs(t.y - o.y) > 0.0005 || Math.abs(t.r - o.r) > 0.0005;
  }
  function textoRechazo(razon) {
    var sep = (T.material && T.material.sep > 0) ? T.material.sep : 0, mm = fmtMm(sep) + ' mm';
    if (razon === 'orilla') return sep > 0 ? 'No cabe ahí: queda a menos de ' + fmtMm(sep / 2) + ' mm de la orilla de la hoja.' : 'No cabe ahí: se sale de la hoja.';
    return sep > 0 ? 'No cabe ahí: queda a menos de ' + mm + ' de otra pieza.' : 'No cabe ahí: se encima con otra pieza.';
  }
  function rechazar(g, razon) {
    g.classList.add('rechazada');
    setTimeout(function () { g.classList.remove('rechazada'); }, 900);
    mensaje(textoRechazo(razon), 'av');
  }
  /* Algo cambió a mano: ese acomodo ya no es el que encontró el motor. */
  function marcarEditado(g) {
    T.mejor.editado = true;
    T.huella = null;                  // no hay nada que «seguir buscando»: el motor no sabe de esto
    habilitar();
    $('an-vista-tab').textContent = 'Acomodo editado a mano';
    mensaje(nombreDe(g) + ' movida a mano. Descarga el SVG con la posición nueva, o vuelve a acomodar desde cero.', 'ok');
    actualizarPie();
  }
  function llevarA(g, nuevo, alTerminar) {
    var P = PZ();
    if (P && P.flip) P.flip([g], function () { escribirTransform(g, nuevo); }, { clave: function () { return 'x'; }, duracion: 260 }).then(function () { if (alTerminar) alTerminar(); });
    else { escribirTransform(g, nuevo); if (alTerminar) alTerminar(); }
  }
  function levantarPieza() {
    var m = _gesto; if (!m || !m.pieza || !editable() || m.modo === 'pieza') return;
    clearTimeout(m.timer); m.timer = 0;
    var g = m.pieza, svg = m.svg, geoms = geo(svg), v = vistaDe(svg);
    m.modo = 'pieza';
    /* El origen del arrastre es donde bajó el dedo, no donde estaba al levantarse: con el ratón la
       pieza se levanta a los 4 px de camino, y partir de ahí se comía ese tramo. */
    m.lev = { t: leerTransform(g), x: m.x0, y: m.y0, sc: geoms.a0 * v.z, siguiente: g.nextSibling };
    /* Arrastrando, otras piezas no la tapan: va al final del dibujo y regresa a su lugar. */
    svg.appendChild(g);
    g.classList.add('levantada'); svg.classList.add('arrastrando');
    cerrarFicha();
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) {}
  }
  /* Soltar (o abandonar) una pieza levantada: queda donde está si cabe y regresa sola si no. */
  function terminarLevantada(m, abandonar) {
    var g = m.pieza, q = m.lev; m.modo = 'quieta';
    if (!g || !q) return;
    g.classList.remove('levantada');
    if (g.parentNode && q.siguiente !== undefined) g.parentNode.insertBefore(g, q.siguiente && q.siguiente.parentNode === g.parentNode ? q.siguiente : null);
    var ahora = leerTransform(g);
    if (abandonar) { escribirTransform(g, q.t); return; }
    var sinMover = Math.abs(ahora.x - q.t.x) < 0.01 && Math.abs(ahora.y - q.t.y) < 0.01;
    if (sinMover) return;
    var razon = porQueNoCabe(g, ahora);
    if (razon) { llevarA(g, q.t); rechazar(g, razon); return; }
    recordarOrigenAntes(g, q.t);
    marcarEditado(g);
  }
  /* El primer movimiento de una pieza guarda dónde la puso el motor. */
  function recordarOrigenAntes(g, t) { if (_origen && !_origen.has(g)) _origen.set(g, t); }
  /* Lo que se intenta con el teclado y no se puede, se dice: sin esto, Mayús + flecha sobre una pieza
     con el motor corriendo no hacía nada y no había por qué. */
  function puedeEditar() {
    if (editable()) return true;
    if (T.corriendo) mensaje('Detén el cálculo para mover piezas a mano.', 'av');
    return false;
  }
  function rotarPieza(g, grados) {
    if (!g || !puedeEditar()) return;
    var t = leerTransform(g), c = centroLocal(g), r1 = t.r + grados;
    var a0 = t.r * Math.PI / 180, a1 = r1 * Math.PI / 180;
    var cx = t.x + c.x * Math.cos(a0) - c.y * Math.sin(a0), cy = t.y + c.x * Math.sin(a0) + c.y * Math.cos(a0);
    var nuevo = { r: ((r1 % 360) + 360) % 360, x: cx - (c.x * Math.cos(a1) - c.y * Math.sin(a1)), y: cy - (c.x * Math.sin(a1) + c.y * Math.cos(a1)) };
    var razon = porQueNoCabe(g, nuevo);
    if (razon) { rechazar(g, razon); return; }
    recordarOrigenAntes(g, t);
    llevarA(g, nuevo, marcarGiradas);
    marcarEditado(g);
    mensaje(nombreDe(g) + ' girada a ' + giroTexto(nuevo.r) + '. Acomodo editado a mano.', 'ok');
  }
  function giroTexto(r) { return (Math.round(r * 10) / 10) + '°'; }
  function empujarPieza(g, dx, dy) {
    if (!g || !puedeEditar()) return;
    var t = leerTransform(g), nuevo = { x: t.x + dx, y: t.y + dy, r: t.r };
    var razon = porQueNoCabe(g, nuevo);
    if (razon) { rechazar(g, razon); return; }
    recordarOrigenAntes(g, t);
    escribirTransform(g, nuevo);
    marcarEditado(g);
  }
  $('an-pieza-girar').addEventListener('click', function () { var g = _sel && document.getElementById(_sel); if (g) rotarPieza(g, 90); });
  $('an-pieza-devolver').addEventListener('click', function () {
    var g = _sel && document.getElementById(_sel), o = g && _origen && _origen.get(g);
    if (!g || !o) return;
    llevarA(g, o, function () { marcarGiradas(); actualizarPie(); });
    mensaje(nombreDe(g) + ' devuelta a su lugar.', 'ok');
  });

  /* El teclado (A7, A10, A24): la hoja es un solo tope de tabulador; las piezas se recorren con
     las flechas (tabindex -1, foco con código). + − 0 acercan, alejan y regresan; con zoom las
     flechas sobre la hoja la desplazan. Sobre una pieza: Enter o Espacio abren su ficha, Mayús +
     flecha la mueve 5 mm, R la gira 90°. */
  $('an-res').addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var svg = sobreMesa(e, '.an-hoja>svg'); if (!svg) return;
    var g = sobreMesa(e, '.an-hoja>svg>g[id]'), k = e.key, flecha = /^Arrow(Left|Right|Up|Down)$/.test(k);
    if (k === '+' || k === '=') { zoomBoton(1.5); e.preventDefault(); return; }
    if (k === '-' || k === '_') { zoomBoton(1 / 1.5); e.preventDefault(); return; }
    if (k === '0') { var g0 = geo(svg); animarVista(svg, { z: 1, cx: g0.W / 2, cy: g0.H / 2 }); e.preventDefault(); return; }
    var piezas = lista(svg.querySelectorAll(':scope>g[id]'));
    if (g) {
      if (k === 'Enter' || k === ' ') { alternarFicha(g); e.preventDefault(); return; }
      if (k === 'r' || k === 'R') { rotarPieza(g, 90); e.preventDefault(); return; }
      if (k === 'Escape') { if (_gesto) { soltarGesto(true); } else svg.focus({ preventScroll: true }); return; }
      if (flecha && e.shiftKey) {
        var dx = k === 'ArrowLeft' ? -PASO_TECLA_MM : k === 'ArrowRight' ? PASO_TECLA_MM : 0, dy = k === 'ArrowUp' ? -PASO_TECLA_MM : k === 'ArrowDown' ? PASO_TECLA_MM : 0;
        empujarPieza(g, dx, dy); e.preventDefault(); return;
      }
      var i = piezas.indexOf(g), j = -1;
      if (k === 'ArrowRight' || k === 'ArrowDown') j = Math.min(piezas.length - 1, i + 1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp') j = Math.max(0, i - 1);
      else if (k === 'Home') j = 0; else if (k === 'End') j = piezas.length - 1;
      if (j >= 0) { irAPieza(svg, piezas[j]); e.preventDefault(); }
      return;
    }
    if (e.target !== svg) return;
    if ((k === 'Enter' || k === ' ') && piezas.length) { irAPieza(svg, piezas[0]); e.preventDefault(); return; }
    var v = vistaDe(svg);
    if (flecha && v.z > 1.0001) {
      var paso = 40 / (geo(svg).a0 * v.z || 1);
      fijarVista(svg, { z: v.z, cx: v.cx + (k === 'ArrowRight' ? paso : k === 'ArrowLeft' ? -paso : 0), cy: v.cy + (k === 'ArrowDown' ? paso : k === 'ArrowUp' ? -paso : 0) });
      e.preventDefault();
    }
  });
  /* El foco a una pieza; si queda fuera de la ventana del zoom, la ventana la sigue. */
  function irAPieza(svg, g) {
    var v = vistaDe(svg);
    if (v.z > 1.0001) {
      var c = centroLocal(g), t = leerTransform(g), a = t.r * Math.PI / 180;
      var x = t.x + c.x * Math.cos(a) - c.y * Math.sin(a), y = t.y + c.x * Math.sin(a) + c.y * Math.cos(a);
      var gs = geo(svg), mx = gs.W / (2 * v.z), my = gs.H / (2 * v.z);
      if (Math.abs(x - v.cx) > mx * 0.85 || Math.abs(y - v.cy) > my * 0.85) fijarVista(svg, { z: v.z, cx: x, cy: y });
    }
    try { g.focus({ preventScroll: true }); } catch (_) { g.focus(); }
  }

  /* ---------- Esquinas sobre lo que se va a quedar fuera (A15) ----------
     Tocar «Ver cuáles» en un aviso, o en «N piezas no caben», cierra cuatro esquinas (P.senalar)
     sobre esos elementos EN LA VISTA PREVIA y las deja puestas; el mismo botón las suelta, y
     Escape también. Los avisos se cuentan sobre el archivo como llegó, antes de sanear(): solo se
     señala lo que sigue en la vista, y si no queda nada el botón ni sale. Las de las piezas que no
     caben van en rojo, y el rojo siempre trae su palabra («no caben»). */
  function elementosDeAviso(i) {
    var sel = A && A.avisoSel && A.avisoSel[i], svg = $('an-orig').querySelector('svg');
    if (!sel || !svg) return [];
    /* Solo lo que se dibuja: un texto con display:none cuenta en el aviso (se cuenta antes de
       sanear) pero no hay dónde cerrar las esquinas. Las cotas de la vista son nuestras. */
    return lista(svg.querySelectorAll(sel)).filter(function (e) {
      if (e.closest('.an-cotas')) return false;
      var r = e.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    });
  }
  function elementosFuera() {
    var svg = $('an-orig').querySelector('svg'); if (!svg) return [];
    return (T.fueraIds || []).map(function (id) { return svg.querySelector('[data-e="' + String(id).replace(/^an-e/, '') + '"]'); }).filter(Boolean);
  }
  function soltarSenales() {
    if (!_senal) return;
    var s = _senal; _senal = null;
    try { s.ctl.soltar(); } catch (_) {}
    if (s.boton && s.boton.isConnected) s.boton.setAttribute('aria-pressed', 'false');
    actualizarPie();
  }
  function senalarElementos(quien, boton, buscar, tono) {
    var P = PZ(); if (!P || !P.senalar) return;
    if (_senal && _senal.quien === quien) { soltarSenales(); return; }
    soltarSenales();
    var poner = function () {
      var vivos = buscar().filter(function (e) { var r = e.getBoundingClientRect(); return r.width > 0 || r.height > 0; }).slice(0, MAX_SENALADAS);
      if (!vivos.length) { mensaje('Eso ya no se ve en la vista previa.', 'av'); return; }
      _senal = { quien: quien, boton: boton, ctl: P.senalar(vivos, { tono: tono, quedar: true, desplazar: true }) };
      boton.setAttribute('aria-pressed', 'true');
      actualizarPie();
    };
    if (_vista !== 'vienen') cambiarVista('vienen').then(poner); else poner();
  }
  $('an-avisos').addEventListener('click', function (e) {
    var b = sobreMesa(e, '[data-aviso]'); if (!b) return;
    var i = parseInt(b.getAttribute('data-aviso'), 10);
    senalarElementos('aviso:' + i, b, function () { return elementosDeAviso(i); }, 'av');
  });
  $('an-fuera-ver').addEventListener('click', function () {
    senalarElementos('fuera', this, elementosFuera, 'mal');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && _senal) soltarSenales(); });

  /* «¿Cabe en un retazo?» (A12): lleva a la hoja «Retazo» y a sus medidas, que es donde se
     prueba con el sobrante. */
  $('an-res').addEventListener('click', function (e) {
    if (!sobreMesa(e, '[data-an-retazo]')) return;
    var P = PZ(), tile = document.querySelector('.an-tile-retazo');
    if (tile) tile.click();
    var destino = $('an-retazos') && !$('an-retazos').hidden ? $('an-retazos') : tile;
    if (P && P.senalar && destino) P.senalar(destino, { desplazar: true });
  });

  /* Lo que cambia con el cálculo: mientras corre no se mueven piezas a mano. */
  function actualizarEditable() {
    $('an-mesa').classList.toggle('editable', editable());
    if (T.mejor && T.mejor.editado && !T.corriendo) $('an-vista-tab').textContent = 'Acomodo editado a mano';
    if (T.corriendo && _gesto && _gesto.modo === 'pieza') soltarGesto(true);
    actualizarPie();
  }
  if (window.ResizeObserver) {
    try { new ResizeObserver(function () { if (!$('an-zoom').hidden) actualizarZoomUI(); }).observe($('an-mesa')); } catch (_) {}
  }

  function pintarEstadoTrabajo() {
    var ir = $('an-ir');
    ir.textContent = T.corriendo ? 'Detener' : (T.mejor ? 'Volver a acomodar desde cero' : 'Acomodar las piezas');
    ir.classList.toggle('btn-pri', !T.corriendo);
    ir.classList.toggle('btn-gho', T.corriendo);
    ir.setAttribute('aria-pressed', T.corriendo ? 'true' : 'false');
    /* Con el motor corriendo, el tema cambia de golpe (A32): para abrirlo en círculo el navegador
       fotografía la pantalla, y con una mesa llena de piezas eso cuesta justo cuando el teléfono
       no tiene de dónde. js/tema.js lee esta clase; ver P.temaEnCirculo. */
    document.documentElement.classList.toggle('sin-revelado', !!T.corriendo);
    habilitar();
    actualizarEditable();   // con el cálculo detenido se pueden mover piezas a mano (A24)
  }

  /* ---------- Salida ---------- */
  /* Un solo SVG en milímetros, una <g> por hoja, una debajo de otra. `indice` pide una hoja
     sola. El contorno de la hoja va con sus atributos puestos —no con una clase— porque
     RDWorks y compañía no leen CSS; los huecos van en blanco para que al abrirlo se vea lo
     que es. */
  function armarSalida(indice) {
    if (!T.mejor) return null;
    var ns = 'http://www.w3.org/2000/svg';
    var hojas = (indice === null || indice === undefined) ? T.mejor.svglist : [T.mejor.svglist[indice]];
    /* La medida sale de data-w/data-h y no del viewBox: con zoom, el viewBox de la hoja en pantalla
       es solo la ventana que se está mirando (A7), y descargar «lo que se ve» daría un archivo del
       tamaño del recuadro. */
    var dims0 = dimsDeHoja(hojas[0]);
    var W = dims0.w, H = dims0.h, gap = HUECO_ENTRE_HOJAS_MM;
    var totalH = H * hojas.length + gap * (hojas.length - 1);

    var out = document.createElementNS(ns, 'svg');
    out.setAttribute('xmlns', ns);
    out.setAttribute('viewBox', '0 0 ' + fmt(W) + ' ' + fmt(totalH));
    out.setAttribute('width', fmt(W) + 'mm'); out.setAttribute('height', fmt(totalH) + 'mm');
    var titulo = document.createElementNS(ns, 'title');
    titulo.textContent = (A ? A.nombre.replace(/\.svg$/i, '') : 'diseño') + ' · acomodado en ' + hojas.length + (hojas.length === 1 ? ' hoja' : ' hojas') +
      ' de ' + MAT_TXT[materialElegido()] + ' de ' + fmt(W) + ' × ' + fmt(H) + ' mm · AL3D';
    out.appendChild(titulo);
    if (window.SvgNest.style) out.appendChild(window.SvgNest.style.cloneNode(true));

    /* Se lee el interruptor AL DESCARGAR y no al arrancar: quien ve el resultado y decide que
       el contorno no lo quiere no tiene por qué volver a acomodar para quitarlo. */
    var contorno = interruptor('an-contorno');
    hojas.forEach(function (hoja, i) {
      var g = document.createElementNS(ns, 'g');
      g.setAttribute('id', 'hoja-' + (i + 1));
      g.setAttribute('transform', 'translate(0 ' + fmt(i * (H + gap)) + ')');
      hijos(hoja).forEach(function (n) {
        if (!n.tagName) return;
        var c = n.cloneNode(true);
        if ((c.getAttribute('class') || '').indexOf('bin') >= 0) {
          if (!contorno) return;
          c.setAttribute('id', 'contorno-hoja-' + (i + 1));
          c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#4060f8'); c.setAttribute('stroke-width', '0.5');
        } else {
          /* Las clases de color y el turno de caída son de la mesa, no del archivo de corte; los
             ids, el foco y el nombre de la pieza, también. Su transform sí se queda: es donde está
             la pieza, y si se movió a mano (A24) es donde se movió. */
          ['class', 'style', 'id', 'tabindex', 'role', 'aria-label', 'aria-describedby'].forEach(function (a) { c.removeAttribute(a); });
        }
        lista(c.getElementsByTagName('*')).forEach(function (e) {
          if (/^an-e\d+$/.test(e.getAttribute('id') || '')) e.removeAttribute('id');
          var cls = e.getAttribute('class');
          if (cls === null) return;
          /* El motor marca los huecos concatenando ' hole' a la clase que hubiera, y cuando no
             había ninguna deja escrito «null hole». Se limpia: es nuestro archivo de salida. */
          cls = cls.replace(/\bnull\b/g, '').replace(/\s+/g, ' ').trim();
          if (cls) e.setAttribute('class', cls); else e.removeAttribute('class');
          if (/\bhole\b/.test(cls) && e.getAttribute('fill') !== 'none') e.setAttribute('fill', '#ffffff');
        });
        g.appendChild(c);
      });
      out.appendChild(g);
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(out);
  }

  /* El nombre del archivo, el mismo para bajarlo y para compartirlo. */
  function nombreDeArchivo(indice) {
    var base = (A ? A.nombre : 'diseño').replace(/\.svg$/i, '').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').replace(/\s+/g, '-').slice(0, 40) || 'diseño';
    return base + '-' + materialElegido() + '-acomodado' + (indice === null || indice === undefined ? '' : '-hoja-' + (indice + 1)) + '.svg';
  }
  function descargar(indice) {
    var txt = armarSalida(indice);
    if (!txt) { mensaje('Todavía no hay un acomodo que descargar.', 'mal'); return; }
    var nombre = nombreDeArchivo(indice);
    var blob = new Blob([txt], { type: 'image/svg+xml;charset=utf-8' });
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    var W = T.mejor.svglist[0].viewBox.baseVal.width, H = T.mejor.svglist[0].viewBox.baseVal.height;
    toast('SVG descargado a escala real: ' + fmt(W) + ' × ' + fmt(H) + ' mm por hoja', 'ok', 3600);
  }

  /* ---------- Descargar por hoja desde un menú, y mandar el archivo (A16) ----------
     Antes había un botón para todas y, debajo, uno fantasma por hoja: con cinco hojas eran seis
     botones, y ninguno servía para lo que de verdad se hace con el archivo, que es mandarlo a la
     computadora del láser desde el teléfono. Ahora «Descargar SVG» abre un menú (el globo de la
     pieza 4, en rol de menú) con Todas las hojas —una capa por hoja—, Hoja 1, Hoja 2… y Compartir.

     Compartir usa la hoja de compartir del sistema (navigator.share con archivos): WhatsApp o el
     correo, sin pasar por la carpeta de descargas. Se esconde donde no hay soporte, y no se finge:
     un botón que no hace nada es peor que ninguno. Ojo: Chrome de Android solo deja compartir
     ciertos tipos de archivo y el SVG no está entre ellos, así que si el aparato rechaza
     image/svg+xml se prueba como texto plano con el mismo nombre .svg —el que lo recibe ve un
     archivo «…-acomodado.svg»—. Sin menú cuando no hay nada que elegir: una sola hoja y sin
     dónde compartir descarga directo, como siempre, y el botón no lleva flecha. */
  var _menuDl = null;
  function archivoParaCompartir(txt, nombre) {
    if (!(navigator.share && navigator.canShare) || typeof File !== 'function') return null;
    var tipos = ['image/svg+xml', 'text/plain'];
    for (var i = 0; i < tipos.length; i++) {
      try { var f = new File([txt], nombre, { type: tipos[i] }); if (navigator.canShare({ files: [f] })) return f; } catch (_) {}
    }
    return null;
  }
  function puedeCompartir() {
    if (!T.mejor) return false;
    return !!archivoParaCompartir('<svg xmlns="http://www.w3.org/2000/svg"/>', 'prueba.svg');
  }
  function opcionesDeDescarga() {
    var n = T.mejor ? T.mejor.svglist.length : 0, o = [];
    if (n > 1) {
      o.push({ v: 'todas', t: 'Todas las hojas', s: 'una capa por hoja' });
      for (var i = 0; i < n; i++) o.push({ v: String(i), t: 'Hoja ' + (i + 1) });
    } else o.push({ v: 'todas', t: 'Descargar SVG' });
    if (puedeCompartir()) o.push({ v: 'compartir', t: 'Compartir', s: 'WhatsApp, correo…' });
    return o;
  }
  /* El botón sigue al resultado: apagado sin acomodo, con flecha y menú solo si hay opciones. */
  function actualizarDescarga() {
    var b = $('an-dl'); if (!b) return;
    var hay = !!(T.mejor && T.mejor.svglist && T.mejor.svglist.length);
    var menu = hay && opcionesDeDescarga().length > 1;
    b.disabled = !hay;
    $('an-dl-flecha').hidden = !menu;
    if (menu) b.setAttribute('aria-haspopup', 'menu');
    else { b.removeAttribute('aria-haspopup'); b.removeAttribute('aria-expanded'); if (_menuDl) _menuDl.cerrar('codigo'); }
  }
  function compartir(indice) {
    var txt = armarSalida(indice); if (!txt) return;
    var nombre = nombreDeArchivo(indice), archivo = archivoParaCompartir(txt, nombre);
    if (!archivo) { toast('Este aparato no puede compartir archivos. Descárgalo.', 'err', 4000); return; }
    navigator.share({ files: [archivo], title: nombre }).catch(function (e) {
      if (e && e.name === 'AbortError') return;   // cerró la hoja de compartir: no es un fallo
      toast('No se pudo compartir. Descárgalo y mándalo desde ahí.', 'err', 4000);
    });
  }
  function menuDescarga() {
    var P = window.Piezas;
    if (_menuDl || !P || !P.vistazo) return _menuDl;
    _menuDl = P.vistazo('an-dl', {
      sinClic: true, rol: 'menu', titulo: 'Descargar o compartir', clase: 'an-menu-dl', alinear: 'inicio',
      contenido: function (ancla, pop) {
        /* Al menos tan ancho como el botón: el menú sale de su esquina, no de un punto. */
        pop.style.minWidth = ancla.offsetWidth + 'px';
        return opcionesDeDescarga().map(function (o) {
          return '<button type="button" data-descarga="' + o.v + '"><span class="an-menu-t">' + esc(o.t) + '</span>' +
            (o.s ? '<small>' + esc(o.s) + '</small>' : '') + '</button>';
        }).join('');
      },
      alAbrir: function (pop) {
        /* UN solo resaltado que viaja con transform, no uno por renglón: sigue al puntero y al foco.
           Nace escondido y solo se enseña con el puntero encima o con el foco del teclado —un
           resaltado sobre el primer renglón al abrir con el ratón se leería como «ya elegido»—. */
        var res = document.createElement('div'); res.className = 'an-menu-resalte'; res.setAttribute('aria-hidden', 'true');
        pop.insertBefore(res, pop.firstChild);
        var mover = function (b) {
          if (!b) return;
          var visible = res.classList.contains('on');
          if (!visible) res.style.transition = 'none';
          res.style.height = b.offsetHeight + 'px'; res.style.width = b.offsetWidth + 'px';
          res.style.transform = 'translate(' + b.offsetLeft + 'px,' + b.offsetTop + 'px)';
          if (!visible) { void res.offsetWidth; res.style.transition = ''; res.classList.add('on'); }
        };
        pop.addEventListener('pointerover', function (e) { mover(e.target.closest && e.target.closest('[role="menuitem"]')); });
        pop.addEventListener('focusin', function (e) {
          var b = e.target.closest && e.target.closest('[role="menuitem"]');
          if (b && (!b.matches || b.matches(':focus-visible'))) mover(b);
        });
        pop.addEventListener('pointerleave', function () { res.classList.remove('on'); });
        lista(pop.querySelectorAll('[data-descarga]')).forEach(function (b) {
          b.addEventListener('click', function () {
            var v = b.getAttribute('data-descarga');
            /* Se cierra ANTES de actuar: el foco vuelve al botón y lo que sigue —un archivo que
               baja, la hoja de compartir— ya no pelea con el menú por él. */
            _menuDl.cerrar('codigo');
            if (v === 'compartir') compartir(null);
            else descargar(v === 'todas' ? null : parseInt(v, 10));
          });
        });
      }
    });
    return _menuDl;
  }

  $('an-ir').addEventListener('click', iniciar);
  $('an-seguir').addEventListener('click', seguir);
  $('an-dl').addEventListener('click', function () {
    if (!T.mejor) return;
    var menu = opcionesDeDescarga().length > 1 ? menuDescarga() : null;
    if (menu) menu.alternar(); else descargar(null);
  });

  /* ---------- Tres maneras de darle el archivo ---------- */
  $('an-file').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) leerArchivo(e.target.files[0]);
    e.target.value = '';
  });
  /* El arrastre vale en toda la página, y lo que se enciende es el recuadro. Sin el
     preventDefault del drop, el navegador abre el SVG en la pestaña y se lleva la app. */
  var _arrastres = 0;
  document.addEventListener('dragenter', function (e) { e.preventDefault(); _arrastres++; document.body.classList.add('arrastrando'); });
  document.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
  document.addEventListener('dragleave', function () { if (--_arrastres <= 0) { _arrastres = 0; document.body.classList.remove('arrastrando'); } });
  document.addEventListener('drop', function (e) {
    e.preventDefault(); _arrastres = 0; document.body.classList.remove('arrastrando');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) { leerArchivo(f); return; }
    var txt = e.dataTransfer && e.dataTransfer.getData('text/plain');
    if (txt && /<svg[\s>]/i.test(txt)) cargarTexto(txt, 'arrastrado.svg');
    else toast('Arrastra un archivo .svg, no una carpeta ni una imagen de otra página.', 'err', 3600);
  });
  document.addEventListener('paste', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;   // pegar en un campo es pegar en el campo
    var cd = e.clipboardData; if (!cd) return;
    for (var i = 0; i < cd.files.length; i++) {
      if (/svg/i.test(cd.files[i].type) || /\.svg$/i.test(cd.files[i].name)) { e.preventDefault(); leerArchivo(cd.files[i]); return; }
    }
    var txt = cd.getData('text/plain');
    if (txt && /<svg[\s>]/i.test(txt)) { e.preventDefault(); cargarTexto(txt, 'pegado.svg'); toast('SVG pegado del portapapeles', 'ok', 2200); }
  });

  /* ---------- Lo que deja el vectorizador del cotizador ----------
     Se lee una vez y se borra: es una entrega, no un guardado. Si la pestaña se recarga, lo
     que hay en pantalla es lo que el usuario cargó, no lo de la última vez. */
  function recibirDelCotizador() {
    var raw = null;
    try { raw = localStorage.getItem(LS_ENTRADA); if (raw) localStorage.removeItem(LS_ENTRADA); } catch (_) {}
    if (!raw) return false;
    var d = null;
    try { d = JSON.parse(raw); } catch (_) { return false; }
    if (!d || !d.svg) return false;
    if (!cargarTexto(d.svg, d.nombre || 'vector-al3d.svg', { origen: 'cotizador' })) return false;
    var quien = [d.folio, d.cliente, d.proyecto].filter(Boolean).map(esc).join(' · ');
    var b = $('an-origen');
    b.innerHTML = '<svg class="svgi" aria-hidden="true"><use href="#i-check"/></svg><span><b>Trazo recibido del vectorizador del cotizador</b>' +
      (quien ? ' · ' + quien : '') + '. ' + (A.k > 0 ? 'Viene con su medida real.' : 'Vino sin medida real: escríbela en el paso 2.') + '</span>';
    b.hidden = false;
    return true;
  }

  /* ---------- Probar con un ejemplo (A31) ----------
     La mesa vacía era una cuadrícula y una frase: alguien nuevo en el taller no tenía con qué
     probar. «Probar con un ejemplo» carga las letras «AL3D» del logotipo a una medida conocida
     (ALTO_EJEMPLO_MM), y sus contornos se trazan sobre la hoja y se rellenan al llegar
     (stroke-dashoffset, ver «dibuja-ejemplo» en css/anidador.css).

     Salen de ../logo-al3d.svg, que ya está en la caché del aparato porque es el logotipo de la
     barra; es un archivo generado («No editar a mano», herramientas/trazar-logo.py) y aquí solo se
     LEE: del dibujo se quedan los trazos de las letras —los que quedan a la derecha de la barra
     vertical, pasado el 75 % del ancho del lienzo— y se descartan la mancha azul y la barra. Sin
     colores: el archivo de corte los usaría como capas. Se arma un SVG nuevo con su ancho y su
     alto en mm y se entrega a cargarTexto() como cualquier archivo, para que el ejemplo pase por
     el mismo camino que uno de verdad: sanear(), medir, contar.

     Lo único distinto es la banda de arriba, que dice «Ejemplo» en ámbar: este archivo no es un
     trabajo y que nadie lo mande a cortar por confusión. */
  function svgDeEjemplo(texto) {
    var doc = null;
    try { doc = new DOMParser().parseFromString(texto, 'image/svg+xml'); } catch (_) {}
    var raiz = doc && doc.documentElement, vb = raiz && M.leerViewBox(raiz.getAttribute('viewBox'));
    if (!vb || raiz.tagName.toLowerCase() !== 'svg') return null;
    var ns = 'http://www.w3.org/2000/svg';
    var letras = lista(raiz.getElementsByTagName('path')).filter(function (e) {
      var t = /translate\(\s*(-?[\d.]+)/.exec(e.getAttribute('transform') || '');
      return t && parseFloat(t[1]) > vb.x + vb.w * 0.75;
    });
    if (letras.length < 3) return null;
    var nuevo = new DOMParser().parseFromString('<svg xmlns="' + ns + '" viewBox="' + [vb.x, vb.y, vb.w, vb.h].join(' ') + '"/>', 'image/svg+xml');
    letras.forEach(function (e) {
      var c = nuevo.importNode(e, true); c.removeAttribute('fill');
      nuevo.documentElement.appendChild(c);
    });
    /* Su caja, medida con el navegador: el lienzo del logotipo trae la mancha y la barra. */
    var medir = document.importNode(nuevo.documentElement, true);
    medir.setAttribute('width', '1000'); medir.setAttribute('height', '500'); medir.setAttribute('aria-hidden', 'true');
    medir.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(medir);
    var bb = null;
    try { bb = medir.getBBox(); } catch (_) {}
    document.body.removeChild(medir);
    if (!bb || !(bb.width > 0) || !(bb.height > 0)) return null;
    var raizNueva = nuevo.documentElement;
    raizNueva.setAttribute('viewBox', [bb.x, bb.y, bb.width, bb.height].map(fmt).join(' '));
    raizNueva.setAttribute('width', fmt(bb.width / bb.height * ALTO_EJEMPLO_MM) + 'mm');
    raizNueva.setAttribute('height', ALTO_EJEMPLO_MM + 'mm');
    return new XMLSerializer().serializeToString(raizNueva);
  }
  function probarEjemplo() {
    if (!window.fetch) { toast('Este navegador no puede abrir el ejemplo. Sube un SVG.', 'err', 4000); return; }
    fetch('../logo-al3d.svg').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (texto) {
        var svg = svgDeEjemplo(texto);
        if (!svg) throw new Error('sin letras');
        if (!cargarTexto(svg, 'ejemplo-al3d.svg', { origen: 'ejemplo' })) return;
        var b = $('an-origen');
        b.className = 'an-banda ejemplo';
        b.innerHTML = '<svg class="svgi" aria-hidden="true"><use href="#i-aviso"/></svg><span><b>Ejemplo</b> · las letras AL3D del logotipo, a ' +
          ALTO_EJEMPLO_MM + ' mm de alto. Sirve para probar el anidador: no es un trabajo para mandar a cortar.</span>';
        b.hidden = false;
        dibujarEjemplo();
      })
      .catch(function () { toast('No se pudo abrir el ejemplo. Revisa tu conexión y vuelve a intentar.', 'err', 4000); });
  }
  /* El trazo que se dibuja y se rellena. pathLength=1 hace que el dash mida «1» sin importar cuánto
     mida el contorno, y --i escalona las letras. Con menos movimiento no se anima: el ejemplo
     aparece ya relleno. La clase se quita al terminar para no dejar animaciones puestas. */
  function dibujarEjemplo() {
    var svg = $('an-orig').querySelector('svg');
    if (!svg || QUIETO || (window.Piezas && window.Piezas.sinMovimiento && window.Piezas.sinMovimiento())) return;
    lista(svg.querySelectorAll(':scope > path')).forEach(function (t, i) {
      t.setAttribute('pathLength', '1'); t.style.setProperty('--i', String(i));
    });
    if (A && A.bbox) svg.style.setProperty('--traza-ancho', fmt(Math.max(A.bbox.w, A.bbox.h) * 0.012));
    svg.classList.add('dibuja-ejemplo');
    setTimeout(function () { svg.classList.remove('dibuja-ejemplo'); }, 2600);
  }
  lista(document.querySelectorAll('[data-an-ejemplo]')).forEach(function (b) { b.addEventListener('click', probarEjemplo); });

  /* ---------- Soporte del navegador ---------- */
  if (!window.Worker) {
    mensaje('Este navegador no tiene Web Workers y el motor no puede correr. Usa Chrome, Edge o Firefox al día.', 'mal');
  } else if (location.protocol === 'file:') {
    mensaje('Abierta como archivo (file://) el navegador no deja crear los Web Workers del motor. Ábrela desde el sitio publicado o desde un servidor local.', 'mal');
  }

  /* ---------- Arranque ---------- */
  cargarRetazos();
  cargarMaterial();
  pintarRetazos();
  recibirDelCotizador();
  habilitar();
  /* Ya está todo pintado y el motor cargado: se quita el esqueleto del arranque (la clase la
     pone el primer <script> del body; ver ahí las dos salidas de emergencia). */
  document.documentElement.classList.remove('arrancando');
  var _arr = document.getElementById('an-arranque');
  if (_arr && _arr.parentNode) _arr.parentNode.removeChild(_arr);

  /* Un reflejo de aluminio cepillado cruza el logo UNA vez al terminar la carga (A29): es la señal
     de que la app ya cargó, y la única cosa que se mueve sola en esta pantalla, un momento. No
     se repite al cambiar de pantalla ni al repintar; con la página empotrada en el Taller no hay
     barra que enseñar, y con menos movimiento no hay brillo. La máscara del reflejo es el propio
     logotipo —un <img> no admite pseudoelementos, así que el brillo vive en #brandLogo—; se
     precarga para que el reflejo no corra antes que su máscara y se vea un rectángulo de luz. */
  (function () {
    var marca = $('brandLogo');
    if (!marca || document.documentElement.classList.contains('empotrado')) return;
    if (QUIETO || (window.Piezas && window.Piezas.sinMovimiento && window.Piezas.sinMovimiento())) return;
    var mascara = new Image();
    mascara.onload = function () {
      marca.classList.add('brilla');
      var quitar = function () { marca.classList.remove('brilla'); };
      marca.addEventListener('animationend', function (e) { if (e.animationName === 'an-brillo') quitar(); });
      setTimeout(quitar, 2000);
    };
    mascara.src = '../logo-al3d.svg';
  })();

  /* Para las pruebas de navegador y para quien quiera automatizar: la misma API que usa
     esta interfaz, sin pasar por el ratón. */
  window.Anidador = {
    cargarTexto: cargarTexto, iniciar: iniciar, detener: function () { detener(false); }, seguir: seguir,
    armarSalida: armarSalida, probarEjemplo: probarEjemplo, textoParo: textoParo,
    estado: function () {
      return { archivo: A ? { nombre: A.nombre, piezas: A.piezas, k: A.k, origen: A.escala && A.escala.origen, bbox: A.bbox, avisos: A.avisos.slice() } : null,
               corriendo: T.corriendo, intentos: T.intentos, sinMejora: T.sinMejora, detenidoSolo: T.detenidoSolo,
               anterior: !!T.anterior, paro: !!_paro, veta: conVeta(),
               hoja: hojaElegida(), material: materialElegido(), retazos: R.slice(),
               mejor: T.mejor ? { hojas: T.mejor.svglist.length, laminas: T.mejor.svglist.length, eficiencia: T.mejor.eficiencia, colocadas: T.mejor.colocadas, total: T.mejor.total } : null };
    }
  };
  /* Lo que las pruebas necesitan saber de la mesa y no está en el DOM: qué vista es, el encuadre de
     cada hoja, qué pieza está elegida, si hay esquinas puestas y si el acomodo se tocó a mano. */
  window.Anidador.mesa = function () {
    return { vista: _vista, zoom: _zoom.map(function (v) { return v ? { z: v.z, cx: v.cx, cy: v.cy } : null; }),
             eleccion: _sel, senal: _senal ? _senal.quien : '', carrusel: !!_pags, editable: editable(),
             editado: !!(T.mejor && T.mejor.editado), numeros: A ? Object.assign({}, A.numeros) : {}, fuera: (T.fueraIds || []).slice() };
  };
  /* ¿Cabe la pieza `id` donde está? '' si sí. Las posiciones que da el motor tienen que caber siempre:
     si no, la cuenta del choque no es la del motor y mover una pieza sería imposible. */
  window.Anidador.mesa.cabe = function (id) { var g = document.getElementById(id); return g ? porQueNoCabe(g, leerTransform(g)) : null; };
})();
