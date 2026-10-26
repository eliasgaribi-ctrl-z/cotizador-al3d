/* ============================================================================
   TALLER (la TV) — el guion de taller.html. Ver la cabecera de esa página.

   JAVASCRIPT VIEJO A PROPÓSITO: var, function, XMLHttpRequest, nada de módulos, flechas, let,
   plantillas ni padStart. El navegador de una TV de 2017 (Tizen 3, Chromium 47) no entiende
   otra cosa, y esta página tiene que abrir en la TV que el taller ya tenga.

   Lo que hace, en orden:
     1. Sin secreto guardado: pide un código a la función `pantalla` y lo enseña en grande hasta que
        Dirección lo escribe en la app. El secreto que devuelve se guarda en localStorage y viaja
        SIEMPRE en el cuerpo de la petición, nunca en la dirección.
     2. Vinculada: pide el tablero cada minuto y lo pinta. Si la red se cae, se queda lo último
        que pintó, con el aviso de desde cuándo no se pudo preguntar.
     3. Si Dirección la desconecta (o la base ya no la conoce), olvida el secreto y vuelve al 1.

   NO CALCULA NADA DEL TALLER: los estados, los días de atraso y los textos llegan hechos de la
   función (con la regla del Tablero, js/datos/taller.js). Aquí solo se acomodan en pantalla.

   LA HORA: México dejó el horario de verano en 2022 y muchas TV todavía lo aplican (lo vimos en
   una Samsung 2017: adelantaba una hora). El reloj se calcula con la hora universal menos 6, que
   es la del centro de México todo el año, y no con la zona que diga la TV.
   ============================================================================ */
(function () {
  'use strict';

  /* La función del proyecto de producción. Es la dirección de js/datos/supabase-config.js; pruebas/taller-tv.mjs lo vigila. */
  var FUNCION = 'https://gwzfdprdrdudfakjsdxf.supabase.co/functions/v1/pantalla';
  var CLAVE = 'al3d_taller_tv';
  var CADA_MIN = 60 * 1000, ESPERANDO = 5 * 1000, SIN_RED = 30 * 1000, PEDIR_OTRA_VEZ = 60 * 1000;
  var MX_MS = -6 * 3600 * 1000;           // el centro de México, todo el año
  var VIEJA_MS = 4 * 3600 * 1000;          // la copia de la hoja corre cada 3 horas: más de 4 es que algo se atoró
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /* La rotación (Elías, 2026-10-24): el tablero 40 s y luego la orden de trabajo de cada obra en producción, 15 s cada una. */
  var TABLERO_MS = 40 * 1000, ORDEN_MS = 15 * 1000;

  var estado = leer();            // { secreto, vista, revisado }
  var temporizador = null;
  var ultimoFallo = 0;
  var paso = -1, giro = null;      // -1 = el tablero; 0…n-1 = la orden de trabajo n

  function $(id) { return document.getElementById(id); }
  function esc(t) {
    return String(t === null || t === undefined ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function leer() {
    try { return JSON.parse(window.localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; }
  }
  function guardar() {
    try { window.localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento: se vuelve a vincular al reiniciar */ }
  }
  function programar(fn, ms) {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(fn, ms);
  }

  /* ----- La hora de México ----- */
  function mx(ms) { return new Date(ms + MX_MS); }          // se lee con getUTC*
  function dosDig(n) { return n < 10 ? '0' + n : String(n); }
  function hora12(d, conMinutos) {
    var h = d.getUTCHours(), m = d.getUTCMinutes();
    return { h: String(h % 12 || 12) + (conMinutos === false ? '' : ':' + dosDig(m)), ap: h < 12 ? 'a. m.' : 'p. m.' };
  }
  function horaTexto(hhmm) {                               // '15:30' → '3:30 p. m.'
    var p = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    if (!p) return '';
    var h = +p[1];
    return (h % 12 || 12) + ':' + p[2] + ' ' + (h < 12 ? 'a. m.' : 'p. m.');
  }
  function fechaCorta(iso) {                               // '2026-10-27' → 'lun 27 oct'
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!p) return '';
    var d = new Date(Date.UTC(+p[1], +p[2] - 1, +p[3]));
    return DIAS_C[d.getUTCDay()] + ' ' + (+p[3]) + ' ' + MESES_C[+p[2] - 1];
  }

  function tic() {
    var d = mx(Date.now()), h = hora12(d);
    $('reloj').innerHTML = esc(h.h) + '<small>' + esc(h.ap) + '</small>';
    $('fecha').textContent = DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()];
    if (estado.vista) pintarFrescura();
  }

  /* ----- El escenario de 1920 × 1080, a la medida de la ventana ----- */
  function ajustar() {
    var e = $('escena'), w = window.innerWidth || 1920, h = window.innerHeight || 1080;
    var s = Math.min(w / 1920, h / 1080);
    var t = 'scale(' + s + ')';
    e.style.webkitTransform = t;
    e.style.transform = t;
    e.style.left = Math.max(0, (w - 1920 * s) / 2) + 'px';
    e.style.top = Math.max(0, (h - 1080 * s) / 2) + 'px';
  }

  /* ----- La red ----- */
  function llamar(cuerpo, listo) {
    var x = new XMLHttpRequest(), terminado = false;
    function fin(err, r) { if (!terminado) { terminado = true; listo(err, r); } }
    x.open('POST', FUNCION, true);
    x.setRequestHeader('Content-Type', 'text/plain');      // sin preflight: un navegador de TV no siempre lo hace bien
    x.timeout = 20000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var r = null;
      try { r = JSON.parse(x.responseText); } catch (e) { r = null; }
      if (!r) { fin(new Error('sin respuesta (' + x.status + ')')); return; }
      fin(null, r);
    };
    x.ontimeout = function () { fin(new Error('tardó demasiado')); };
    x.onerror = function () { fin(new Error('sin red')); };
    x.send(JSON.stringify(cuerpo));
  }

  /* ----- La rotación ----- */
  function ordenes() { return (estado.vista && estado.vista.ordenes) || []; }

  /* Pinta lo que toca ahora: el tablero, o la orden del paso (si ya no existe, el tablero). */
  function pintarPaso() {
    var v = estado.vista, os = ordenes();
    if (!v) return;
    if (paso >= os.length) paso = -1;
    if (paso < 0) pintarTablero(v); else pintarOrden(os[paso], paso, os.length);
  }

  /* Un paso adelante: la orden siguiente o, tras la última, el tablero. */
  function girar() {
    paso = paso + 1 < ordenes().length ? paso + 1 : -1;
    if (estado.secreto && estado.vista) pintarPaso();
    programarGiro();
  }

  function programarGiro() {
    if (giro) clearTimeout(giro);
    giro = setTimeout(girar, paso < 0 ? TABLERO_MS : ORDEN_MS);
  }

  function pedirCodigo() {
    if (giro) { clearTimeout(giro); giro = null; }
    paso = -1;
    estado.secreto = null;
    guardar();
    llamar({ accion: 'pedir' }, function (err, r) {
      if (err || !r.ok || !r.secreto) {
        pintarAviso('No se pudo pedir el código de esta pantalla' + (r && r.mensaje ? ': ' + r.mensaje : '.') + ' Vuelvo a intentar en un minuto.');
        programar(pedirCodigo, PEDIR_OTRA_VEZ);
        return;
      }
      estado.secreto = r.secreto;
      estado.vista = null;
      guardar();
      pintarVincular(r.codigo);
      programar(preguntar, ESPERANDO);
    });
  }

  function preguntar() {
    if (!estado.secreto) { pedirCodigo(); return; }
    llamar({ accion: 'tablero', secreto: estado.secreto }, function (err, r) {
      if (err || (!r.ok && r.codigo !== 'NO_ENCONTRADO')) {
        ultimoFallo = ultimoFallo || Date.now();
        if (estado.vista) pintarFrescura(); else pintarAviso('Sin conexión con la base. Vuelvo a intentar en unos segundos.');
        programar(preguntar, SIN_RED);
        return;
      }
      if (!r.ok || r.estado === 'revocada' || r.estado === 'vencida') { pedirCodigo(); return; }
      if (r.estado === 'pendiente') { pintarVincular(r.codigo); programar(preguntar, ESPERANDO); return; }
      ultimoFallo = 0;
      estado.vista = r;
      estado.revisado = Date.now();
      guardar();
      pintarPaso();
      if (!giro) programarGiro();
      programar(preguntar, CADA_MIN);
    });
  }

  /* ----- Pintar ----- */
  function pintarAviso(texto) {
    $('contenido').innerHTML = '<p class="tv-aviso">' + esc(texto) + '</p>';
    $('resumen').innerHTML = '';
    $('proximas').innerHTML = '';
    $('frescura').innerHTML = '';
  }

  function pintarVincular(codigo) {
    var c = String(codigo || '');
    $('contenido').innerHTML = '<div class="tv-vincular"><h1>Vincula esta pantalla</h1>' +
      '<div class="tv-codigo">' + esc(c.slice(0, 3)) + ' ' + esc(c.slice(3)) + '</div>' +
      '<p>En la app de AL3D entra a <b>Ajustes → La base de datos → Pantallas del taller</b> y escribe este código.</p>' +
      '<p class="chico">Solo Dirección puede vincularla. Si el código vence, aquí sale otro solo.</p></div>';
    $('resumen').innerHTML = '';
    $('proximas').innerHTML = '';
    $('frescura').innerHTML = '';
  }

  /* La orden de trabajo de una obra en producción: las piezas y el plano (sin precios: la función no los manda). */
  function pintarOrden(o, i, n) {
    var filas = '', k;
    for (k = 0; k < o.piezas.length; k++) {
      var p = o.piezas[k];
      filas += '<tr><td><b>' + esc(p.titulo) + '</b>' + (p.detalle ? '<span>' + esc(p.detalle) + '</span>' : '') + '</td>' +
        '<td class="c">' + esc(p.medidas) + '</td><td class="c">' + esc(p.piezas) + '</td></tr>';
    }
    $('contenido').innerHTML = '<div class="tv-orden">' +
      '<div class="tv-orden-izq">' +
        '<div class="tv-orden-etapa">' + esc(o.etapa_nombre) + '</div>' +
        '<h1>' + esc(o.titulo) + '</h1>' +
        '<div class="tv-orden-estado ' + esc(o.estado) + '">' + esc(linea(o)) + '</div>' +
        (o.limite ? '<div class="tv-orden-limite"><span>Límite de fabricación</span>' + esc(o.limite) + '</div>' : '') +
        '<table class="tv-piezas"><thead><tr><th>Descripción</th><th class="c">Medidas</th><th class="c">Pzas.</th></tr></thead><tbody>' + filas + '</tbody></table>' +
        (o.mas_piezas ? '<div class="tv-mas">+ ' + o.mas_piezas + ' pieza' + (o.mas_piezas === 1 ? '' : 's') + ' más: ver la orden impresa</div>' : '') +
        (o.nota ? '<div class="tv-orden-nota"><span>Nota</span>' + esc(o.nota) + '</div>' : '') +
      '</div>' +
      '<div class="tv-orden-der">' + (o.imagen ? '<img src="' + esc(o.imagen) + '" alt="Plano de ' + esc(o.titulo) + '">'
        : '<div class="tv-sin-plano">Esta obra todavía no tiene su plano en la nube.</div>') + '</div>' +
      '</div>';
    $('resumen').innerHTML = '<b>Orden de trabajo</b><span class="sep">·</span>' + (i + 1) + ' de ' + n +
      '<span class="sep">·</span><span class="gris">luego el tablero</span>';
    pintarFrescura();
  }

  /* Lo que dice cada ficha bajo su nombre. Los textos de atraso son los de la función (los del Tablero). */
  function linea(f) {
    var inst = f.instalacion ?'Instala ' + fechaCorta(f.instalacion.fecha) + (f.instalacion.hora ? ' · ' + horaTexto(f.instalacion.hora) : '') : '';
    if (f.estado === 'tarde' || f.estado === 'no_llega') return f.texto || ('Va ' + f.atraso_dias + ' días tarde');
    if (f.estado === 'justo') return 'Toca hoy' + (inst ? ' · ' + inst : '');
    if (f.estado === 'sin_fecha') return 'Sin fecha';
    return inst || 'A tiempo';
  }

  function pintarTablero(v) {
    var cont = $('contenido'), html = '', i;
    for (i = 0; i < v.estaciones.length; i++) {
      var e = v.estaciones[i];
      html += '<section class="tv-col c' + i + '"><h2>' + esc(e.nombre) + '<span class="n">' + e.fichas.length + '</span></h2><div class="fs">';
      for (var j = 0; j < e.fichas.length; j++) {
        var f = e.fichas[j];
        html += '<div class="tv-ficha ' + esc(f.estado) + '"><div class="t">' + esc(f.titulo) + '</div><div class="e">' + esc(linea(f)) + '</div></div>';
      }
      if (!e.fichas.length) html += '<div class="tv-vacia">Nada aquí</div>';
      html += '</div></section>';
    }
    cont.innerHTML = html;
    recortarColumnas();

    var r = v.resumen || {};
    $('resumen').innerHTML = '<b>' + (r.obras || 0) + '</b> obra' + (r.obras === 1 ? '' : 's') + ' en el taller' +
      (r.tarde ? '<span class="sep">·</span><span class="rojo"><b>' + r.tarde + '</b> va' + (r.tarde === 1 ? '' : 'n') + ' tarde</span>' : '') +
      (r.justo ? '<span class="sep">·</span><span class="ambar"><b>' + r.justo + '</b> toca' + (r.justo === 1 ? '' : 'n') + ' hoy</span>' : '');

    var p = v.proximas || [], ph = '<h3>Próximas instalaciones</h3>';
    if (!p.length) ph += '<div class="tv-inst"><div class="o">Ninguna en las próximas dos semanas.</div></div>';
    for (i = 0; i < p.length && i < 4; i++) {
      ph += '<div class="tv-inst"><div class="d">' + esc(fechaCorta(p[i].fecha)) + (p[i].hora ? ' · ' + esc(horaTexto(p[i].hora)) : '') +
        (p[i].confirmada ? '<span class="ok">✓</span>' : '') + '</div><div class="o">' + esc(p[i].titulo) + '</div></div>';
    }
    $('proximas').innerHTML = ph;
    pintarFrescura();
  }

  /* Una columna con más fichas de las que caben: se quitan las de abajo y se dice cuántas faltan. */
  function recortarColumnas() {
    var cols = $('contenido').getElementsByTagName('section');
    for (var i = 0; i < cols.length; i++) {
      var col = cols[i], fs = col.getElementsByTagName('div')[0], quitadas = 0, mas = null;
      var sobra = function () { return col.scrollHeight > col.clientHeight + 2; };
      while (sobra() && fs.children.length > 1) { fs.removeChild(fs.lastChild); quitadas++; }
      if (!quitadas) continue;
      mas = document.createElement('div');
      mas.className = 'tv-mas';
      fs.appendChild(mas);
      do {                                                   // el aviso también ocupa: si no cabe, una ficha menos
        mas.textContent = '+ ' + quitadas + ' más';
        if (!sobra() || fs.children.length <= 2) break;
        fs.removeChild(mas.previousSibling);
        quitadas++;
      } while (true);
    }
  }

  function pintarFrescura() {
    var v = estado.vista, el = $('frescura'), partes = [], mal = false;
    if (!v) { el.innerHTML = ''; return; }
    var act = v.actualizado ? Date.parse(v.actualizado) : NaN;
    if (!isNaN(act)) {
      var h = hora12(mx(act));
      partes.push('Datos de la hoja de las ' + h.h + ' ' + h.ap);
      if (Date.now() - act > VIEJA_MS) { partes.push('La copia de la hoja no ha corrido desde entonces'); mal = true; }
    } else {
      partes.push('Todavía no hay copia de la hoja');
      mal = true;
    }
    if (ultimoFallo) {
      var f = hora12(mx(ultimoFallo));
      partes.push('Sin conexión desde las ' + f.h + ' ' + f.ap);
      mal = true;
    }
    el.className = 'tv-frescura' + (mal ? ' mal' : '');
    el.innerHTML = esc(partes.join('. ')) + '.';
  }

  /* ----- Arranque ----- */
  ajustar();
  window.onresize = ajustar;
  tic();
  setInterval(tic, 10 * 1000);
  if (estado.secreto && estado.vista) { pintarPaso(); programarGiro(); }   // lo último (el tablero), mientras contesta la red
  if (estado.secreto) preguntar(); else pedirCodigo();
})();
