/* ============================================================================
   El sobrante: el rectángulo libre más grande que queda en una hoja acomodada.

   El aprovechamiento no dice lo que de verdad importa cuando un trabajo cabe en una hoja: si las
   piezas usan el 28 % de la hoja, el número es el mismo esté lo que sobra en un rectángulo de
   1.20 × 1.30 m que se guarda como retazo, o en tiras y esquinas que van a la basura. Lo que se
   guarda es un RECTÁNGULO (se corta derecho, con la sierra o con el router), así que eso es lo
   que se mide: el más grande que cabe en la hoja sin tocar ninguna pieza, dejando la separación
   entre su orilla y las piezas (por ahí pasa el corte).

   Cómo: la hoja se pinta en una rejilla (celdas de 2 a 8 mm según la hoja), se marca cada celda
   que toca una pieza engordada por la separación —por dentro, con un barrido por renglones; por la
   orilla, caminando cada lado—, y en lo que queda libre se busca el rectángulo más grande con el
   método del histograma (una pasada por renglón). Siempre se queda corto, nunca largo: una celda
   tocada aunque sea en una esquina cuenta como ocupada, así que el rectángulo que dice cabe de
   verdad.

   Puro y sin DOM: lo usa app.js en el navegador y pruebas/anidador-sobrante.mjs en node.
   ============================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnidadorSobrante = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* hoja: {w, h} en mm. poligonos: [[{x,y}…]…] en mm, en el marco de la hoja (cada contorno de
     cada pieza, ya colocado). opciones.margen: lo que se deja entre el sobrante y las piezas (la
     separación). opciones.celda: el tamaño de la celda; por omisión, la hoja entre 300.
     Devuelve {x, y, w, h} (mm) o null si no queda nada libre. */
  function mayorRectangulo(hoja, poligonos, opciones) {
    opciones = opciones || {};
    var W = +hoja.w, H = +hoja.h;
    if (!(W > 0) || !(H > 0)) return null;
    var c = opciones.celda > 0 ? opciones.celda : Math.max(2, Math.min(8, Math.min(W, H) / 300));
    var m = Math.max(0, +opciones.margen || 0);
    var nx = Math.max(1, Math.floor(W / c)), ny = Math.max(1, Math.floor(H / c));
    var lleno = new Uint8Array(nx * ny);

    function marcar(x0, y0, x1, y1) {
      var i0 = Math.max(0, Math.floor(x0 / c)), i1 = Math.min(nx - 1, Math.floor(x1 / c));
      var j0 = Math.max(0, Math.floor(y0 / c)), j1 = Math.min(ny - 1, Math.floor(y1 / c));
      for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) lleno[j * nx + i] = 1;
    }

    (poligonos || []).forEach(function (P) {
      if (!P || P.length < 2) return;
      var n = P.length, k;
      /* La orilla, engordada: se camina cada lado en pasos de media celda y se marca el cuadro de
         lado 2·margen alrededor de cada paso (más media celda, por lo que hay entre paso y paso). */
      var r = m + c / 2;
      for (k = 0; k < n; k++) {
        var a = P[k], b = P[(k + 1) % n];
        var L = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
        var pasos = Math.max(1, Math.ceil(L / (c / 2)));
        for (var s = 0; s <= pasos; s++) {
          var x = a.x + (b.x - a.x) * s / pasos, y = a.y + (b.y - a.y) * s / pasos;
          marcar(x - r, y - r, x + r, y + r);
        }
      }
      /* Por dentro: en el centro de cada renglón, los cruces con los lados, de dos en dos. */
      if (n < 3) return;
      var ymin = Infinity, ymax = -Infinity;
      for (k = 0; k < n; k++) { ymin = Math.min(ymin, P[k].y); ymax = Math.max(ymax, P[k].y); }
      var j0 = Math.max(0, Math.floor(ymin / c)), j1 = Math.min(ny - 1, Math.floor(ymax / c));
      for (var j = j0; j <= j1; j++) {
        var yc = (j + 0.5) * c, xs = [];
        for (k = 0; k < n; k++) {
          var p = P[k], q = P[(k + 1) % n];
          if ((p.y > yc) !== (q.y > yc)) xs.push(p.x + (yc - p.y) * (q.x - p.x) / (q.y - p.y));
        }
        xs.sort(function (u, v) { return u - v; });
        for (var t = 0; t + 1 < xs.length; t += 2) marcar(xs[t], yc, xs[t + 1], yc);
      }
    });

    /* El rectángulo más grande de celdas libres: por cada renglón, la altura libre de cada
       columna hacia arriba, y el rectángulo más grande bajo ese histograma con una pila. */
    var alto = new Int32Array(nx), mejor = { a: 0 };
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) alto[i] = lleno[j * nx + i] ? 0 : alto[i] + 1;
      var pila = [];
      for (var i2 = 0; i2 <= nx; i2++) {
        var h = i2 < nx ? alto[i2] : 0, ini = i2;
        while (pila.length && pila[pila.length - 1][1] >= h) {
          var tope = pila.pop(), area = tope[1] * (i2 - tope[0]);
          if (area > mejor.a) mejor = { a: area, i: tope[0], j: j - tope[1] + 1, w: i2 - tope[0], h: tope[1] };
          ini = tope[0];
        }
        pila.push([ini, h]);
      }
    }
    if (!mejor.a) return null;
    /* En mm. La última columna o renglón llega a la orilla de la hoja aunque la rejilla no
       alcance a cubrirla entera (la hoja no mide un número exacto de celdas). */
    var x0 = mejor.i * c, y0 = mejor.j * c;
    var x1 = (mejor.i + mejor.w === nx) ? W : (mejor.i + mejor.w) * c;
    var y1 = (mejor.j + mejor.h === ny) ? H : (mejor.j + mejor.h) * c;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* «1.20 × 1.55 m», o en cm si es chico: hacia abajo, que el retazo no se vuelva más grande al
     redondear. */
  function texto(r) {
    if (!r) return '';
    var m = function (v) { return (Math.floor(v / 10) / 100).toFixed(2); };
    if (r.w >= 1000 || r.h >= 1000) return m(r.w) + ' × ' + m(r.h) + ' m';
    return Math.floor(r.w / 10) + ' × ' + Math.floor(r.h / 10) + ' cm';
  }

  return { mayorRectangulo: mayorRectangulo, texto: texto };
});
