/* ============================================================================
   Anidador de vectores — la interfaz.

   Aquí NO vive el algoritmo: el acomodo lo hace SVGnest (js/svgnest.js y js/lib/, vendorizado
   de https://github.com/Jack000/SVGnest, MIT). Este archivo conecta el DOM con su API pública
   —parsesvg, setbin, config, start, stop— y le pone alrededor lo que al motor le falta para
   usarse en el taller sin sorpresas:

     · Unidades. El motor acomoda números; el archivo dice mm, cm, px o nada. Todo se pasa
       a milímetros antes de que el motor lo vea, y si el archivo no dice cuánto mide se
       pide la medida real, como en el vectorizador (js/medidas.js, probado en node).
     · Aviso de lo que se va a quedar fuera: textos sin convertir, símbolos <use>, piezas
       más grandes que la lámina. El motor los descarta callado; aquí se dicen.
     · Se detiene solo. El algoritmo genético no termina nunca: sigue buscando mejores
       acomodos mientras nadie lo pare. Cuando lleva 25 intentos y 40 segundos sin mejorar,
       se detiene y lo dice; «Seguir buscando» continúa desde donde iba.
     · El trazo puede llegar del vectorizador del cotizador, por localStorage, sin pasar
       por el disco.
     · El SVG sale en milímetros —width="1220mm"— para que LightBurn, RDWorks o Illustrator
       lo abran a tamaño, con una capa por lámina.
   ============================================================================ */
(function () {
  'use strict';

  var M = window.AnidadorMedidas;
  var $ = function (id) { return document.getElementById(id); };

  var LS_MATERIAL = 'al3d_anidador_material';   // la última lámina usada en este aparato
  var LS_ENTRADA  = 'al3d_anidar';              // lo que deja el vectorizador del cotizador
  var LIMITE_INTENTOS = 25;                     // intentos seguidos sin mejorar…
  var LIMITE_MS = 40000;                        // …y segundos sin mejorar: las dos, para parar
  var TOLERANCIA_MM = 0.3;                      // con qué fineza se convierten las curvas en rectas
  var HUECO_ENTRE_LAMINAS_MM = 25;              // en el SVG de salida, una lámina debajo de otra
  var PRESETS = { '1220x2440': [1220, 2440], '1250x2500': [1250, 2500], '1220x1220': [1220, 1220] };

  /* Lo que el motor deja fuera sin decirlo, y lo que aquí se le quita antes para que no
     confunda geometría de apoyo con piezas: un <clipPath> con un rectángulo dentro se
     volvería una pieza rectangular más. */
  var NO_SE_CORTAN = ['defs', 'clipPath', 'mask', 'marker', 'pattern', 'symbol', 'metadata',
                      'title', 'desc', 'text', 'image', 'use', 'foreignObject', 'script'];

  /* ---------- Estado ---------- */
  var A = null;   // el archivo: texto, nombre, raíz parseada, bbox, escala, piezas
  var T = { corriendo: false, intentos: 0, sinMejora: 0, ultimaMejora: 0, mejor: null, detenidoSolo: false };

  /* ---------- Utilidades de interfaz ---------- */
  var _toastT = null;
  function toast(msg, tipo, dur) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (tipo ? ' ' + tipo : '');
    var voz = $('vozStatus'); if (voz) voz.textContent = msg;
    clearTimeout(_toastT);
    _toastT = setTimeout(function () { t.className = 'toast'; }, dur || 3200);
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

  /* ---------- La lámina ---------- */
  function leerMaterial(avisar) {
    var ancho = parseFloat($('an-ancho').value), alto = parseFloat($('an-alto').value), sep = parseFloat($('an-sep').value);
    var ok = true;
    marcarFalta('fld-ancho', !(ancho > 0)); marcarFalta('fld-alto', !(alto > 0)); marcarFalta('fld-sep', !(sep >= 0));
    if (!(ancho > 0) || !(alto > 0)) ok = false;
    if (!(sep >= 0)) { sep = 0; $('an-sep').value = '0'; }
    if (!ok) { if (avisar) { mensaje('Falta el ancho o el alto de la lámina, en milímetros.', 'mal'); (ancho > 0 ? $('an-alto') : $('an-ancho')).focus(); } return null; }
    return { ancho: ancho, alto: alto, sep: sep, rot: parseInt($('an-rot').value, 10) || 4,
             huecos: interruptor('an-huecos'), contorno: interruptor('an-contorno') };
  }
  function guardarMaterial() {
    try { localStorage.setItem(LS_MATERIAL, JSON.stringify({
      ancho: $('an-ancho').value, alto: $('an-alto').value, sep: $('an-sep').value, rot: $('an-rot').value,
      huecos: interruptor('an-huecos'), contorno: interruptor('an-contorno') })); } catch (_) {}
  }
  function cargarMaterial() {
    var g = null;
    try { g = JSON.parse(localStorage.getItem(LS_MATERIAL) || 'null'); } catch (_) {}
    if (!g) return;
    if (g.ancho) $('an-ancho').value = g.ancho;
    if (g.alto) $('an-alto').value = g.alto;
    if (g.sep !== undefined && g.sep !== '') $('an-sep').value = g.sep;
    if (g.rot) $('an-rot').value = String(g.rot);
    if (typeof g.huecos === 'boolean' && g.huecos !== interruptor('an-huecos')) alternar('an-huecos');
    if (typeof g.contorno === 'boolean' && g.contorno !== interruptor('an-contorno')) alternar('an-contorno');
    sincronizarPreset();
  }
  /* El selector y los dos campos dicen lo mismo: elegir un material llena los campos, y
     teclear una medida que no es de ningún material pone el selector en «Otra medida». */
  function sincronizarPreset() {
    var a = parseFloat($('an-ancho').value), h = parseFloat($('an-alto').value), hallado = 'otra';
    Object.keys(PRESETS).forEach(function (k) {
      var p = PRESETS[k];
      if ((p[0] === a && p[1] === h) || (p[0] === h && p[1] === a)) hallado = k;
    });
    $('an-preset').value = hallado;
  }
  $('an-preset').addEventListener('change', function () {
    var p = PRESETS[this.value];
    if (p) {
      /* Se respeta la orientación que ya tenía la lámina: si estaba acostada, sigue acostada. */
      var acostada = parseFloat($('an-ancho').value) > parseFloat($('an-alto').value);
      $('an-ancho').value = acostada ? p[1] : p[0];
      $('an-alto').value = acostada ? p[0] : p[1];
    }
    leerMaterial(false); guardarMaterial(); habilitar();
  });
  ['an-ancho', 'an-alto', 'an-sep'].forEach(function (id) {
    $(id).addEventListener('input', function () { sincronizarPreset(); leerMaterial(false); guardarMaterial(); habilitar(); });
  });
  $('an-rot').addEventListener('change', guardarMaterial);
  $('an-huecos').addEventListener('click', function () { alternar('an-huecos'); guardarMaterial(); });
  $('an-contorno').addEventListener('click', function () { alternar('an-contorno'); guardarMaterial(); });
  $('an-girar').addEventListener('click', function () {
    var a = $('an-ancho').value; $('an-ancho').value = $('an-alto').value; $('an-alto').value = a;
    sincronizarPreset(); guardarMaterial(); habilitar();
    toast('Lámina girada: ' + $('an-ancho').value + ' × ' + $('an-alto').value + ' mm', 'ok', 2200);
  });

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

    A = { texto: texto, nombre: nombre || 'diseño.svg', peso: opts.peso || texto.length, raiz: raiz,
          bbox: null, escala: null, k: null, piezas: 0, avisos: [], origen: opts.origen || null };
    T = { corriendo: false, intentos: 0, sinMejora: 0, ultimaMejora: 0, mejor: null, detenidoSolo: false };
    /* La medida es de ESTE archivo: la del anterior no puede quedarse en los campos, porque
       un 280 heredado se leería como que este archivo mide 280. */
    $('an-ancho-d').value = ''; $('an-alto-d').value = '';

    /* Lo que el motor va a dejar fuera, dicho antes y con su número. */
    var n = function (sel) { return raiz.getElementsByTagName(sel).length; };
    var c;
    if ((c = n('text'))) A.avisos.push('Trae ' + c + (c === 1 ? ' texto' : ' textos') + ' sin convertir: el motor solo acomoda contornos. En Illustrator, Texto → Crear contornos, y vuelve a exportar.');
    if ((c = n('use'))) A.avisos.push('Trae ' + c + (c === 1 ? ' símbolo reutilizado' : ' símbolos reutilizados') + ' (<use>) que se van a quedar fuera. Expándelos antes de exportar (Objeto → Expandir).');
    if ((c = n('image'))) A.avisos.push('Trae ' + c + (c === 1 ? ' imagen incrustada' : ' imágenes incrustadas') + ', que no se cortan: se ignoran.');
    if (n('clipPath') || n('mask')) A.avisos.push('Trae máscaras de recorte. Se ignoran: la geometría que recortaban se acomoda entera.');

    pintarOriginal();
    A.escala = M.escalaDelArchivo({ width: raiz.getAttribute('width'), height: raiz.getAttribute('height'), viewBox: raiz.getAttribute('viewBox') });
    A.k = A.escala.mmPorUnidad;
    if (A.escala.noUniforme) A.avisos.push('El ancho y el alto del archivo no cuadran entre sí (escala distinta en cada eje). Se usó la del ancho; revisa la medida.');
    A.piezas = contarPiezas(A.k || 1);
    if (A.piezas === 0) A.avisos.push('No encontré contornos que acomodar. Revisa que el diseño sean trazos y no una imagen o texto.');

    pintarArchivo(); pintarMedida(); pintarEstadoTrabajo(); habilitar();
    $('an-dl').disabled = true; $('an-dl-hojas').hidden = true; $('an-prog').hidden = true;
    $('an-vista-tab').textContent = 'Las piezas, como vienen';

    if (A.piezas > 0 && A.k > 0) mensaje('Listo: ' + A.piezas + (A.piezas === 1 ? ' pieza' : ' piezas') + '. Revisa la lámina y toca «Acomodar las piezas».', 'ok');
    else if (A.piezas > 0) mensaje('Falta la medida real del diseño: escribe su ancho o su alto en milímetros.', 'av');
    else mensaje('');
    return true;
  }

  /* La vista previa de lo que llegó. Sin <style> ni <script>: un <style> dentro de un SVG en
     línea vale para TODA la página, y un `svg{display:none}` de Illustrator apagaría hasta
     los iconos de la barra. Se pinta como silueta, con la hoja de estilos de esta pantalla. */
  function pintarOriginal() {
    var cont = $('an-orig'); cont.innerHTML = '';
    var clon = document.importNode(A.raiz, true);
    ['style', 'script', 'foreignObject'].forEach(function (tag) {
      lista(clon.getElementsByTagName(tag)).forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
    });
    clon.removeAttribute('width'); clon.removeAttribute('height');
    clon.setAttribute('role', 'img'); clon.setAttribute('aria-label', 'Las piezas del archivo, sin acomodar');
    var vb = M.leerViewBox(A.raiz.getAttribute('viewBox'));
    if (!vb) {
      var e = M.escalaDelArchivo({ width: A.raiz.getAttribute('width'), height: A.raiz.getAttribute('height') });
      if (e.viewBox) clon.setAttribute('viewBox', [e.viewBox.x, e.viewBox.y, e.viewBox.w, e.viewBox.h].join(' '));
    }
    $('an-res').hidden = true; cont.hidden = false;
    cont.appendChild(clon);
    /* El recuadro de la tinta, en unidades del archivo. Hace falta que esté en pantalla. */
    var b = null;
    try { b = clon.getBBox(); } catch (_) {}
    A.bbox = (b && b.width > 0 && b.height > 0) ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    if (!clon.getAttribute('viewBox') && A.bbox) clon.setAttribute('viewBox', [A.bbox.x, A.bbox.y, A.bbox.w, A.bbox.h].join(' '));
  }

  /* El SVG que se le da al motor: sin lo que no se corta y ya en milímetros. La escala va
     como transform en la raíz; el parser del motor la aplica a cada elemento y la quita. */
  function svgParaMotor(k) {
    var clon = A.raiz.cloneNode(true);
    NO_SE_CORTAN.forEach(function (tag) {
      lista(clon.getElementsByTagName(tag)).forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
    });
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

  /* ---------- La medida real ---------- */
  function pintarMedida() {
    var sec = $('an-sec-medida'); sec.hidden = !A;
    if (!A) return;
    var txt = $('an-medida-txt'), ancho = $('an-ancho-d'), alto = $('an-alto-d');
    var falta = !(A.k > 0);
    txt.classList.toggle('falta', falta);
    marcarFalta('fld-ancho-d', falta); marcarFalta('fld-alto-d', falta);
    if (!A.bbox) {
      txt.textContent = 'No pude medir lo dibujado: revisa que el archivo tenga contornos.';
      ancho.value = ''; alto.value = ''; return;
    }
    if (A.k > 0 && A.escala.origen === 'archivo' && !ancho.value) {
      ancho.value = redondear(A.bbox.w * A.k); alto.value = redondear(A.bbox.h * A.k);
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
  function redondear(v) { return String(Math.round(v * 10) / 10); }
  function escalaDiseno(campo, val) {
    if (!A || !A.bbox) return;
    var v = parseFloat(val);
    if (!(v > 0)) {
      /* Se vació el campo. Si el archivo traía escala se vuelve a ella; si no, se queda sin. */
      A.k = A.escala.origen === 'archivo' ? A.escala.mmPorUnidad : null;
      if (A.k > 0) { $('an-ancho-d').value = redondear(A.bbox.w * A.k); $('an-alto-d').value = redondear(A.bbox.h * A.k); }
      else (campo === 'ancho' ? $('an-alto-d') : $('an-ancho-d')).value = '';
    } else {
      A.k = M.escalaPorDiseno(A.bbox, campo === 'ancho' ? v : null, campo === 'alto' ? v : null);
      A.escala.origen = 'mano';
      (campo === 'ancho' ? $('an-alto-d') : $('an-ancho-d')).value = redondear((campo === 'ancho' ? A.bbox.h : A.bbox.w) * A.k);
    }
    pintarMedida(); habilitar();
    if (A.k > 0 && A.piezas > 0) mensaje('Listo: ' + A.piezas + (A.piezas === 1 ? ' pieza' : ' piezas') + '. Revisa la lámina y toca «Acomodar las piezas».', 'ok');
  }
  $('an-ancho-d').addEventListener('input', function () { escalaDiseno('ancho', this.value); });
  $('an-alto-d').addEventListener('input', function () { escalaDiseno('alto', this.value); });

  function pintarArchivo() {
    $('an-archivo').hidden = !A;
    if (!A) return;
    $('an-nombre').textContent = A.nombre;
    $('an-peso').textContent = peso(A.peso);
    $('an-drop-t').textContent = 'Cambiar de archivo: arrastra otro SVG, pégalo o toca aquí';
    $('an-st-piezas').textContent = A.piezas;
    $('an-avisos').innerHTML = A.avisos.map(function (a) {
      return '<div class="hintnote nota-av"><svg class="svgi" aria-hidden="true"><use href="#i-aviso"/></svg><span>' + esc(a) + '</span></div>';
    }).join('');
  }

  function habilitar() {
    var puede = !!(A && A.k > 0 && A.piezas > 0 && leerMaterial(false));
    var ir = $('an-ir');
    ir.disabled = T.corriendo ? false : !puede;
    $('an-seguir').hidden = T.corriendo || !T.mejor || !puede;
  }

  /* ---------- Acomodar ---------- */
  function iniciar() {
    if (T.corriendo) { detener(false); return; }
    if (!A) { mensaje('Primero sube un SVG con las piezas.', 'mal'); return; }
    var mat = leerMaterial(true); if (!mat) return;
    if (!(A.k > 0)) { mensaje('Falta la medida real del diseño: escribe su ancho o su alto en milímetros.', 'mal'); $('an-ancho-d').focus(); return; }

    var SN = window.SvgNest;
    SN.config({ spacing: mat.sep, rotations: mat.rot, useHoles: mat.huecos, curveTolerance: TOLERANCIA_MM });
    var svg;
    try { svg = SN.parsesvg(svgParaMotor(A.k)); }
    catch (e) { mensaje('No se pudo procesar el SVG: ' + (e && e.message || e), 'mal'); return; }

    /* Lo que no cabe ni girado se dice antes de empezar, no después de diez minutos. */
    var partes = SN.getParts(hijos(svg));
    if (!partes.length) { mensaje('No encontré contornos que acomodar en este archivo.', 'mal'); return; }
    var fuera = partes.filter(function (p) {
      var b = window.GeometryUtil.getPolygonBounds(p);
      return !M.cabe({ w: b.width, h: b.height }, { ancho: mat.ancho - mat.sep, alto: mat.alto - mat.sep }, mat.rot);
    }).length;
    if (fuera === partes.length) {
      mensaje('Ninguna de las ' + partes.length + ' piezas cabe en una lámina de ' + mat.ancho + ' × ' + mat.alto + ' mm. Revisa la medida del diseño o la de la lámina.', 'mal');
      return;
    }

    var bin = svg.ownerDocument.createElementNS(svg.namespaceURI, 'rect');
    bin.setAttribute('x', '0'); bin.setAttribute('y', '0');
    bin.setAttribute('width', String(mat.ancho)); bin.setAttribute('height', String(mat.alto));
    svg.appendChild(bin);
    SN.setbin(bin);

    T = { corriendo: true, intentos: 0, sinMejora: 0, ultimaMejora: Date.now(), mejor: null, detenidoSolo: false, material: mat, fuera: fuera, total: partes.length };
    if (SN.start(alAvanzar, alMostrar) === false) {
      T.corriendo = false;
      mensaje('El motor no pudo arrancar con esa lámina. Revisa que el ancho y el alto sean mayores que la separación.', 'mal');
      return;
    }
    $('an-prog').hidden = false; $('an-prog-bar').style.width = '0%';
    $('an-st-uso').textContent = '—'; $('an-st-col').textContent = '0/' + partes.length; $('an-st-hojas').textContent = '—'; $('an-st-int').textContent = '0';
    $('an-res').innerHTML = '<p class="an-vacio">Calculando el primer acomodo…</p>';
    $('an-orig').hidden = true; $('an-res').hidden = false;
    $('an-vista-tab').textContent = 'Acomodando…';
    $('an-dl').disabled = true; $('an-dl-hojas').hidden = true;
    pintarEstadoTrabajo();
    mensaje((fuera ? fuera + (fuera === 1 ? ' pieza no cabe' : ' piezas no caben') + ' en la lámina ni girada' + (fuera === 1 ? '' : 's') + ' y se va' + (fuera === 1 ? '' : 'n') + ' a quedar fuera. ' : '') +
      'El motor sigue buscando acomodos mejores mientras corre: detenlo cuando el resultado te convenza, o se detiene solo cuando deja de mejorar.', fuera ? 'av' : '');
    /* En pantalla angosta el lienzo queda debajo de los controles: se baja a verlo. */
    if (window.matchMedia('(max-width:900px)').matches) $('an-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function detener(solo) {
    window.SvgNest.stop();
    T.corriendo = false; T.detenidoSolo = !!solo;
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
    T.corriendo = true; T.sinMejora = 0; T.ultimaMejora = Date.now(); T.detenidoSolo = false;
    window.SvgNest.start(alAvanzar, alMostrar);
    pintarEstadoTrabajo();
    $('an-vista-tab').textContent = 'Acomodando…';
    mensaje('Sigue buscando desde el mejor acomodo que llevaba.', '');
  }

  function alAvanzar(p) { $('an-prog-bar').style.width = Math.round((p || 0) * 100) + '%'; }

  /* El motor llama esto por cada intento evaluado: con resultado cuando mejoró, sin nada
     cuando no. Ahí se cuenta cuánto lleva sin mejorar, que es lo que decide el paro solo. */
  function alMostrar(svglist, eficiencia, colocadas, total) {
    T.intentos++;
    if (svglist && svglist.length) {
      T.mejor = { svglist: svglist, eficiencia: eficiencia, colocadas: colocadas, total: total };
      T.sinMejora = 0; T.ultimaMejora = Date.now();
      pintarResultado();
    } else if (T.corriendo && T.mejor) {
      T.sinMejora++;
      if (T.sinMejora >= LIMITE_INTENTOS && Date.now() - T.ultimaMejora >= LIMITE_MS) detener(true);
    }
    pintarStats();
  }

  function pintarStats() {
    $('an-st-int').textContent = T.intentos;
    if (!T.mejor) return;
    $('an-st-uso').textContent = M.formatoPct(T.mejor.eficiencia);
    $('an-st-col').textContent = T.mejor.colocadas + '/' + T.mejor.total;
    $('an-st-hojas').textContent = T.mejor.svglist.length;
  }

  function pintarResultado() {
    var cont = $('an-res'); cont.innerHTML = '';
    T.mejor.svglist.forEach(function (s, i) {
      var vb = s.viewBox && s.viewBox.baseVal;
      var alta = vb ? vb.height > vb.width : false;
      var fig = document.createElement('figure'); fig.className = 'an-hoja' + (alta ? ' alta' : '');
      s.removeAttribute('width'); s.removeAttribute('height');
      s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Lámina ' + (i + 1) + ' con las piezas acomodadas');
      var piezas = 0;
      hijos(s).forEach(function (n) { if (n.tagName === 'g') piezas++; });
      fig.appendChild(s);
      var cap = document.createElement('figcaption');
      cap.textContent = 'Lámina ' + (i + 1) + ' · ' + piezas + (piezas === 1 ? ' pieza' : ' piezas');
      fig.appendChild(cap);
      cont.appendChild(fig);
    });
    $('an-orig').hidden = true; cont.hidden = false;
    $('an-dl').disabled = false;
    var hojas = $('an-dl-hojas'); hojas.innerHTML = '';
    if (T.mejor.svglist.length > 1) {
      T.mejor.svglist.forEach(function (_, i) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-gho';
        b.textContent = 'Solo la lámina ' + (i + 1);
        b.addEventListener('click', function () { descargar(i); });
        hojas.appendChild(b);
      });
      hojas.hidden = false;
    } else hojas.hidden = true;
  }

  function pintarEstadoTrabajo() {
    var ir = $('an-ir');
    ir.textContent = T.corriendo ? 'Detener' : (T.mejor ? 'Volver a acomodar desde cero' : 'Acomodar las piezas');
    ir.classList.toggle('btn-pri', !T.corriendo);
    ir.classList.toggle('btn-gho', T.corriendo);
    ir.setAttribute('aria-pressed', T.corriendo ? 'true' : 'false');
    habilitar();
  }

  /* ---------- Salida ---------- */
  /* Un solo SVG en milímetros, una <g> por lámina, una debajo de otra. `indice` pide una
     lámina sola. El contorno de la lámina va con sus atributos puestos —no con una clase—
     porque RDWorks y compañía no leen CSS; los huecos van en blanco para que al abrirlo se
     vea lo que es. */
  function armarSalida(indice) {
    if (!T.mejor) return null;
    var ns = 'http://www.w3.org/2000/svg';
    var laminas = (indice === null || indice === undefined) ? T.mejor.svglist : [T.mejor.svglist[indice]];
    var vb0 = laminas[0].viewBox.baseVal;
    var W = vb0.width, H = vb0.height, gap = HUECO_ENTRE_LAMINAS_MM;
    var totalH = H * laminas.length + gap * (laminas.length - 1);

    var out = document.createElementNS(ns, 'svg');
    out.setAttribute('xmlns', ns);
    out.setAttribute('viewBox', '0 0 ' + fmt(W) + ' ' + fmt(totalH));
    out.setAttribute('width', fmt(W) + 'mm'); out.setAttribute('height', fmt(totalH) + 'mm');
    var titulo = document.createElementNS(ns, 'title');
    titulo.textContent = (A ? A.nombre.replace(/\.svg$/i, '') : 'diseño') + ' · acomodado en ' + laminas.length + (laminas.length === 1 ? ' lámina' : ' láminas') + ' de ' + fmt(W) + ' × ' + fmt(H) + ' mm · AL3D';
    out.appendChild(titulo);
    if (window.SvgNest.style) out.appendChild(window.SvgNest.style.cloneNode(true));

    /* Se lee el interruptor AL DESCARGAR y no al arrancar: quien ve el resultado y decide que
       el contorno no lo quiere no tiene por qué volver a acomodar para quitarlo. */
    var contorno = interruptor('an-contorno');
    laminas.forEach(function (hoja, i) {
      var g = document.createElementNS(ns, 'g');
      g.setAttribute('id', 'lamina-' + (i + 1));
      g.setAttribute('transform', 'translate(0 ' + fmt(i * (H + gap)) + ')');
      hijos(hoja).forEach(function (n) {
        if (!n.tagName) return;
        var c = n.cloneNode(true);
        if ((c.getAttribute('class') || '').indexOf('bin') >= 0) {
          if (!contorno) return;
          c.setAttribute('id', 'contorno-lamina-' + (i + 1));
          c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#4060f8'); c.setAttribute('stroke-width', '0.5');
        }
        lista(c.getElementsByTagName('*')).forEach(function (e) {
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
  function fmt(n) { return String(Math.round(n * 1000) / 1000); }

  function descargar(indice) {
    var txt = armarSalida(indice);
    if (!txt) { mensaje('Todavía no hay un acomodo que descargar.', 'mal'); return; }
    var base = (A ? A.nombre : 'diseño').replace(/\.svg$/i, '').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').replace(/\s+/g, '-').slice(0, 40) || 'diseño';
    var nombre = base + '-acomodado' + (indice === null || indice === undefined ? '' : '-lamina-' + (indice + 1)) + '.svg';
    var blob = new Blob([txt], { type: 'image/svg+xml;charset=utf-8' });
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    var W = T.mejor.svglist[0].viewBox.baseVal.width, H = T.mejor.svglist[0].viewBox.baseVal.height;
    toast('SVG descargado a escala real: ' + fmt(W) + ' × ' + fmt(H) + ' mm por lámina', 'ok', 3600);
  }

  $('an-ir').addEventListener('click', iniciar);
  $('an-seguir').addEventListener('click', seguir);
  $('an-dl').addEventListener('click', function () { descargar(null); });

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

  /* ---------- Soporte del navegador ---------- */
  if (!window.Worker) {
    mensaje('Este navegador no tiene Web Workers y el motor no puede correr. Usa Chrome, Edge o Firefox al día.', 'mal');
  } else if (location.protocol === 'file:') {
    mensaje('Abierta como archivo (file://) el navegador no deja crear los Web Workers del motor. Ábrela desde el sitio publicado o desde un servidor local.', 'mal');
  }

  /* ---------- Arranque ---------- */
  cargarMaterial();
  recibirDelCotizador();
  habilitar();

  /* Para las pruebas de navegador y para quien quiera automatizar: la misma API que usa
     esta interfaz, sin pasar por el ratón. */
  window.Anidador = {
    cargarTexto: cargarTexto, iniciar: iniciar, detener: function () { detener(false); }, seguir: seguir,
    armarSalida: armarSalida,
    estado: function () {
      return { archivo: A ? { nombre: A.nombre, piezas: A.piezas, k: A.k, origen: A.escala && A.escala.origen, bbox: A.bbox, avisos: A.avisos.slice() } : null,
               corriendo: T.corriendo, intentos: T.intentos, sinMejora: T.sinMejora, detenidoSolo: T.detenidoSolo,
               mejor: T.mejor ? { laminas: T.mejor.svglist.length, eficiencia: T.mejor.eficiencia, colocadas: T.mejor.colocadas, total: T.mejor.total } : null };
    }
  };
})();
