/* ============================================================================
   AL3D · El no-fit polygon exterior por convolución (suma de Minkowski), rápido.

   No es código de SVGnest: es nuestro, y lo cargan los Web Workers del motor junto con sus
   dependencias (ver «AL3D · NFP» en svgnest.js y el README del anidador).

   Por qué existe. El NFP de dos piezas A y B —dónde NO puede ir B para no tocar a A— es la
   suma de Minkowski A ⊕ (−B). SVGnest ya la sacaba con Clipper (`Clipper.MinkowskiSum`),
   pero esa función arma UN cuadrilátero por cada par de lados (n × m) y luego los une todos:
   una «S» de 128 vértices contra una «O» de 59 son 7 500 cuadriláteros y más de un segundo por
   par. El primer acomodo de 24 letras pide 300 pares: 18 s de cálculo con 14 núcleos.

   La convolución (Guibas, Ramshaw y Stolfi, 1983) llega a la misma figura con muchos menos
   tramos. Cada lado de A se suma solo con los vértices de B cuyo giro «barre» la dirección de
   ese lado, y al revés; en una curva cada vértice gira poco, así que cada lado se empareja con
   uno o dos vértices y no con todos. Los tramos forman uno o varios ciclos cerrados, y A ⊕ (−B)
   son exactamente los puntos con número de giro positivo respecto a ellos: eso lo calcula
   Clipper con una unión `pftPositive` sobre unos cientos de tramos en vez de miles de
   cuadriláteros.

   Detalles que importan para que sea EXACTO (lo prueba pruebas/anidador-minkowski.mjs contra la
   suma de Clipper, pieza por pieza y giro por giro):
     · Todo en enteros. Las piezas se trasladan a su primer vértice y se escalan de modo que las
       sumas quepan en el rango «bajo» de Clipper (|coordenada| < 4.7e7): ahí Clipper usa la
       aritmética normal de JavaScript, exacta, en vez de emular enteros de 128 bits —que era
       la otra mitad de la lentitud—. Los productos cruzados también son exactos (< 2^53).
     · Los extremos de los barridos son semiabiertos, y del lado contrario en A que en B y en
       un vértice convexo que en uno cóncavo: si un lado de A es paralelo a uno de B, uno se
       suma al final del otro y el ciclo cierra.
     · Un giro a la derecha (vértice cóncavo) barre hacia atrás: el tramo que produce se recorre
       al revés.
   Si algo no cuadra —un ciclo que no cierra, un resultado más chico que A—, devuelve null y el
   motor usa la suma de Clipper de siempre para ese par. Nunca un NFP dudoso.
   ============================================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MinkowskiAL3D = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var RANGO = 4.0e7;   // por debajo del loRange de Clipper (47 453 132)

  function clipper() {
    if (root && root.ClipperLib) return root.ClipperLib;
    if (typeof ClipperLib !== 'undefined') return ClipperLib;   // eslint-disable-line no-undef
    return null;
  }

  /* De {x,y} a enteros de Clipper, trasladados a `o` y por `s`; `signo` −1 refleja (−B). */
  function aEnteros(P, o, s, signo) {
    var r = [];
    for (var i = 0; i < P.length; i++) r.push({ X: Math.round(signo * (P[i].x - o.x) * s), Y: Math.round(signo * (P[i].y - o.y) * s) });
    return r;
  }

  /* Sin vértices repetidos ni alineados (un vértice sin giro no barre nada y rompería la cuenta
     de giros), y con orientación positiva. */
  function preparar(C, P) {
    var q = C.Clipper.CleanPolygon(P, 1.415);
    if (!q || q.length < 3) return null;
    if (!C.Clipper.Orientation(q)) q.reverse();
    var n = q.length, giro = [], din = [], dout = [];
    for (var i = 0; i < n; i++) {
      var a = q[(i + n - 1) % n], b = q[i], c = q[(i + 1) % n];
      var ix = b.X - a.X, iy = b.Y - a.Y, ox = c.X - b.X, oy = c.Y - b.Y;
      var cr = ix * oy - iy * ox;
      if (cr === 0) return null;   // alineado o espiga: CleanPolygon debió quitarlo
      giro.push(cr > 0 ? 1 : -1); din.push([ix, iy]); dout.push([ox, oy]);
    }
    return { p: q, n: n, giro: giro, din: din, dout: dout };
  }

  function cruz(u, v) { return u[0] * v[1] - u[1] * v[0]; }
  function mismo(u, v) { return cruz(u, v) === 0 && (u[0] * v[0] + u[1] * v[1]) > 0; }
  /* ¿La dirección d cae estrictamente dentro del barrido del vértice? */
  function dentro(din, dout, giro, d) {
    var a = cruz(din, d), b = cruz(d, dout);
    return giro > 0 ? (a > 0 && b > 0) : (a < 0 && b < 0);
  }

  /* Los tramos de la convolución de P y Q (los dos ya preparados), cada uno [x0,y0,x1,y1]. */
  function convolucion(P, Q) {
    var t = [], i, j, d, a, b;
    /* Lados de P con vértices de Q. El barrido de un vértice de Q incluye su final si es
       convexo y su principio si es cóncavo; el de P, al revés (ver la cabecera). */
    for (i = 0; i < P.n; i++) {
      a = P.p[i]; b = P.p[(i + 1) % P.n]; d = [b.X - a.X, b.Y - a.Y];
      for (j = 0; j < Q.n; j++) {
        if (dentro(Q.din[j], Q.dout[j], Q.giro[j], d) || mismo(d, Q.giro[j] > 0 ? Q.dout[j] : Q.din[j])) {
          var q = Q.p[j];
          if (Q.giro[j] > 0) t.push([a.X + q.X, a.Y + q.Y, b.X + q.X, b.Y + q.Y]);
          else t.push([b.X + q.X, b.Y + q.Y, a.X + q.X, a.Y + q.Y]);
        }
      }
    }
    /* Lados de Q con vértices de P: convexo, con su principio; cóncavo, con su final. */
    for (j = 0; j < Q.n; j++) {
      a = Q.p[j]; b = Q.p[(j + 1) % Q.n]; d = [b.X - a.X, b.Y - a.Y];
      for (i = 0; i < P.n; i++) {
        if (dentro(P.din[i], P.dout[i], P.giro[i], d) || mismo(d, P.giro[i] > 0 ? P.din[i] : P.dout[i])) {
          var p = P.p[i];
          if (P.giro[i] > 0) t.push([p.X + a.X, p.Y + a.Y, p.X + b.X, p.Y + b.Y]);
          else t.push([p.X + b.X, p.Y + b.Y, p.X + a.X, p.Y + a.Y]);
        }
      }
    }
    return t;
  }

  /* Los tramos encadenados en ciclos cerrados. En una convolución bien hecha a cada punto
     llegan tantos tramos como salen; si no, null. */
  function ciclos(tramos) {
    var salen = {}, balance = {}, k, i;
    for (i = 0; i < tramos.length; i++) {
      var s = tramos[i][0] + ',' + tramos[i][1], e = tramos[i][2] + ',' + tramos[i][3];
      (salen[s] || (salen[s] = [])).push(i);
      balance[s] = (balance[s] || 0) + 1;
      balance[e] = (balance[e] || 0) - 1;
    }
    for (k in balance) if (balance[k] !== 0) return null;
    var usado = new Uint8Array(tramos.length), out = [];
    for (i = 0; i < tramos.length; i++) {
      if (usado[i]) continue;
      var ciclo = [], actual = i, inicio = tramos[i][0] + ',' + tramos[i][1];
      while (actual >= 0) {
        usado[actual] = 1;
        var tr = tramos[actual];
        ciclo.push({ X: tr[0], Y: tr[1] });
        var fin = tr[2] + ',' + tr[3], lista = salen[fin], sig = -1;
        while (lista && lista.length) { var c = lista.pop(); if (!usado[c]) { sig = c; break; } }
        if (sig < 0 && fin !== inicio) return null;
        actual = sig;
      }
      if (ciclo.length >= 3) out.push(ciclo);
    }
    return out;
  }

  /* A ⊕ (−B), en el marco de SVGnest: la posición del primer vértice de B. Devuelve
     [exterior, huecos…] como polígonos {x,y}, o null para que el motor use otra cosa.
     `conHuecos`: los huecos del NFP son lugares DENTRO de una concavidad cerrada de A donde B
     cabe sin tocarla; solo se devuelven si se piden (el «Buscar también dentro de las
     concavidades» de la interfaz) y si no hay islas dentro de ellos. */
  function nfpExterior(A, B, conHuecos) {
    var C = clipper();
    if (!C || !A || !B || A.length < 3 || B.length < 3) return null;
    var a0 = A[0], b0 = B[0], max = 1, i;
    for (i = 0; i < A.length; i++) max = Math.max(max, Math.abs(A[i].x - a0.x), Math.abs(A[i].y - a0.y));
    for (i = 0; i < B.length; i++) max = Math.max(max, Math.abs(B[i].x - b0.x), Math.abs(B[i].y - b0.y));
    var s = Math.min(1e4, RANGO / (2 * max));
    var P = preparar(C, aEnteros(A, a0, s, 1)), Q = preparar(C, aEnteros(B, b0, s, -1));
    if (!P || !Q) return null;
    var cs = ciclos(convolucion(P, Q));
    if (!cs || !cs.length) return null;
    var cl = new C.Clipper(), sol = new C.Paths();
    cl.AddPaths(cs, C.PolyType.ptSubject, true);
    if (!cl.Execute(C.ClipType.ctUnion, sol, C.PolyFillType.pftPositive, C.PolyFillType.pftPositive)) return null;
    var exterior = null, aExt = 0, huecos = [], islas = 0;
    for (i = 0; i < sol.length; i++) {
      var ar = C.Clipper.Area(sol[i]);
      if (ar > 0) { if (ar > aExt) { if (exterior) islas++; exterior = sol[i]; aExt = ar; } else islas++; }
      else huecos.push(sol[i]);
    }
    if (!exterior) return null;
    /* La suma nunca es más chica que A más B: si lo es, la convolución salió mal. */
    var aA = Math.abs(C.Clipper.Area(P.p)), aB = Math.abs(C.Clipper.Area(Q.p));
    if (aExt < (aA + aB) * 0.999) return null;
    var aNido = function (q) {
      var r = [];
      for (var k = 0; k < q.length; k++) r.push({ x: q[k].X / s + a0.x, y: q[k].Y / s + a0.y });
      return r;
    };
    var out = [aNido(exterior)];
    if (conHuecos && !islas) for (i = 0; i < huecos.length; i++) if (Math.abs(C.Clipper.Area(huecos[i])) > s * s * 0.01) out.push(aNido(huecos[i]));
    return out;
  }

  /* El NFP de un hueco H de A: dónde puede ir el primer vértice de B para quedar TODO dentro de
     H. Es H menos la franja de posiciones en las que B toca la orilla de H (la orilla de H
     barrida con −B, que sí es la suma de Clipper: un borde contra otro). Solo se calcula para
     las piezas que caben en el hueco por su caja, que son pocas. Devuelve polígonos {x,y}
     (puede haber varios, o ninguno si B no cabe). */
  function nfpHueco(H, B) {
    var C = clipper();
    if (!C || !H || !B || H.length < 3 || B.length < 3) return null;
    var b0 = B[0], max = 1, i;
    var o = H[0];
    for (i = 0; i < H.length; i++) max = Math.max(max, Math.abs(H[i].x - o.x), Math.abs(H[i].y - o.y));
    for (i = 0; i < B.length; i++) max = Math.max(max, Math.abs(B[i].x - b0.x), Math.abs(B[i].y - b0.y));
    var s = Math.min(1e4, RANGO / (2 * max));
    var Hc = aEnteros(H, o, s, 1), Bc = aEnteros(B, b0, s, -1);
    var franja = C.Clipper.MinkowskiSum(Bc, Hc, true);
    var cl = new C.Clipper(), sol = new C.Paths();
    cl.AddPath(Hc, C.PolyType.ptSubject, true);
    cl.AddPaths(franja, C.PolyType.ptClip, true);
    if (!cl.Execute(C.ClipType.ctDifference, sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)) return null;
    var out = [];
    for (i = 0; i < sol.length; i++) {
      if (C.Clipper.Area(sol[i]) <= s * s * 0.01) continue;   // solo regiones, no huecos sueltos
      var r = [];
      for (var k = 0; k < sol[i].length; k++) r.push({ x: sol[i][k].X / s + o.x, y: sol[i][k].Y / s + o.y });
      out.push(r);
    }
    return out;
  }

  return { nfpExterior: nfpExterior, nfpHueco: nfpHueco, _convolucion: convolucion, _preparar: preparar, _ciclos: ciclos };
});
