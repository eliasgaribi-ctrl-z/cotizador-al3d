/* ============================================================================
   Cortes rectos muy juntos: donde el router vibra.

   Lo explicó el taller (audio del 16/10/2026): entre dos cortes tiene que quedar material
   que no se corte, porque esa tira es la que le da rigidez a la lámina. Si dos orillas
   rectas de piezas distintas quedan paralelas y muy juntas —dos «L» a la par—, al cortar la
   segunda la tira que queda entre las dos es tan delgada que vibra, y la pieza sale volando
   o se daña la broca. El anidador acomoda las piezas a la separación justa, así que eso
   pasa seguido; el taller lo arregla girando o moviendo unas cuantas letras («en vez de
   mover las 25, solo muevo cuatro»). Aquí se encuentran esas cuatro.

   Qué cuenta como riesgo: un tramo recto de una pieza y otro de OTRA pieza, casi paralelos
   (hasta `anguloMax` grados), que corren uno frente al otro al menos `traslapeMin` mm y
   entre los que queda menos de `minimo` mm de material. El material es la distancia entre
   las dos orillas menos lo que se come la broca: con la broca sobre la línea, cada corte
   se come media broca del lado de la tira, así que entre los dos se va una broca entera.
   Dentro de una misma pieza no se busca: la tira entre el hueco de una «O» y su orilla es
   la letra, no un desperdicio que se pueda acomodar distinto.

   Pura y sin DOM, para probarla en node (pruebas/anidador-vibracion.mjs). app.js le da los
   contornos de cada pieza ya en milímetros y en su lugar dentro de la hoja.
   ============================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnidadorVibracion = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GRADO = Math.PI / 180;
  var QUIEBRE = 2 * GRADO;   // dos segmentos seguidos que giran menos que esto son la misma recta
  var RECTITUD = 0.998;      // y el tramo entero tiene que ser recto: cuerda / largo recorrido

  /* La diferencia entre dos ángulos, en (−π, π]. */
  function difAng(a, b) {
    var d = (b - a) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  }

  /* Los tramos rectos de un contorno cerrado que miden al menos `largoMin`. Una recta que el
     archivo partió en varios nodos se junta en un solo tramo; una curva no, aunque sus segmentos
     giren poco cada uno: se compara contra la dirección con la que EMPEZÓ el tramo, no contra el
     segmento anterior, y además el tramo entero tiene que ser recto. */
  function tramosRectos(poli, largoMin) {
    var n = (poli || []).length, segs = [];
    for (var i = 0; i < n; i++) {
      var a = poli[i], b = poli[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L > 1e-9) segs.push({ a: a, b: b, L: L, ang: Math.atan2(b.y - a.y, b.x - a.x) });
    }
    if (segs.length < 2) return [];
    /* Se empieza justo después de un quiebre: si se empezara a media recta, la recta que cruza el
       punto 0 del contorno saldría partida en dos. */
    var inicio = 0;
    for (var k = 0; k < segs.length; k++) {
      if (Math.abs(difAng(segs[(k - 1 + segs.length) % segs.length].ang, segs[k].ang)) > QUIEBRE) { inicio = k; break; }
    }
    var tramos = [], cur = null;
    for (var j = 0; j < segs.length; j++) {
      var s = segs[(inicio + j) % segs.length];
      if (cur && Math.abs(difAng(cur.ang, s.ang)) <= QUIEBRE) { cur.b = s.b; cur.recorrido += s.L; }
      else { if (cur) tramos.push(cur); cur = { a: s.a, b: s.b, recorrido: s.L, ang: s.ang }; }
    }
    if (cur) tramos.push(cur);
    return tramos.map(function (t) {
      var L = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y);
      return { a: { x: t.a.x, y: t.a.y }, b: { x: t.b.x, y: t.b.y }, largo: L, recto: L / t.recorrido };
    }).filter(function (t) { return t.largo >= largoMin && t.recto >= RECTITUD; });
  }

  /* Dos tramos frente a frente: cuánto corren juntos y a qué distancia. null si no son casi
     paralelos o no se traslapan. `marca` es el cuadrilátero de la tira de material entre los dos. */
  function frente(t1, t2, anguloMax) {
    var ux = (t1.b.x - t1.a.x) / t1.largo, uy = (t1.b.y - t1.a.y) / t1.largo;
    var vx = (t2.b.x - t2.a.x) / t2.largo, vy = (t2.b.y - t2.a.y) / t2.largo;
    /* Paralelos sin importar el sentido: el seno del ángulo entre los dos. */
    if (Math.abs(ux * vy - uy * vx) > Math.sin(anguloMax * GRADO)) return null;
    var nx = -uy, ny = ux;
    var proy = function (p) { return (p.x - t1.a.x) * ux + (p.y - t1.a.y) * uy; };
    var alto = function (p) { return (p.x - t1.a.x) * nx + (p.y - t1.a.y) * ny; };
    var sa = proy(t2.a), sb = proy(t2.b);
    if (Math.abs(sb - sa) < 1e-9) return null;
    var lo = Math.max(0, Math.min(sa, sb)), hi = Math.min(t1.largo, Math.max(sa, sb));
    if (hi - lo <= 0) return null;
    /* El punto de t2 que cae frente a la posición s de t1. */
    var sobreT2 = function (s) { var k = (s - sa) / (sb - sa); return { x: t2.a.x + k * (t2.b.x - t2.a.x), y: t2.a.y + k * (t2.b.y - t2.a.y) }; };
    var sobreT1 = function (s) { return { x: t1.a.x + s * ux, y: t1.a.y + s * uy }; };
    var p2lo = sobreT2(lo), p2hi = sobreT2(hi);
    var d = Math.min(Math.abs(alto(p2lo)), Math.abs(alto(p2hi)));
    return { traslape: hi - lo, distancia: d, marca: [sobreT1(lo), sobreT1(hi), p2hi, p2lo] };
  }

  function cajaDe(t, m) {
    return { x0: Math.min(t.a.x, t.b.x) - m, y0: Math.min(t.a.y, t.b.y) - m, x1: Math.max(t.a.x, t.b.x) + m, y1: Math.max(t.a.y, t.b.y) + m };
  }
  function seTocan(c, d) { return !(c.x1 < d.x0 || d.x1 < c.x0 || c.y1 < d.y0 || d.y1 < c.y0); }

  /* piezas: [{ id, contornos: [[{x,y}, …], …] }] en mm, en su lugar en la hoja.
     opc: { broca, minimo, largoMin, traslapeMin, anguloMax } (mm, mm, mm, mm, grados).
     Devuelve un renglón por PAR de piezas en riesgo, el peor primero:
     { a, b, material, distancia, traslape, marcas: [[4 puntos], …] }. */
  function buscar(piezas, opc) {
    opc = opc || {};
    var broca = opc.broca > 0 ? opc.broca : 0, minimo = opc.minimo >= 0 ? opc.minimo : 0;
    var largoMin = opc.largoMin > 0 ? opc.largoMin : 15, traslapeMin = opc.traslapeMin > 0 ? opc.traslapeMin : 15;
    var anguloMax = opc.anguloMax > 0 ? opc.anguloMax : 5;
    var alcance = broca + minimo;   // más lejos que esto ya queda material de sobra
    var todos = [];
    (piezas || []).forEach(function (p) {
      (p.contornos || []).forEach(function (c) {
        tramosRectos(c, largoMin).forEach(function (t) { todos.push({ pieza: p.id, t: t, caja: cajaDe(t, alcance) }); });
      });
    });
    var pares = {};
    for (var i = 0; i < todos.length; i++) {
      for (var j = i + 1; j < todos.length; j++) {
        var A = todos[i], B = todos[j];
        if (A.pieza === B.pieza || !seTocan(A.caja, B.caja)) continue;
        var f = frente(A.t, B.t, anguloMax);
        if (!f || f.traslape < traslapeMin) continue;
        var material = f.distancia - broca;
        if (material >= minimo) continue;
        var llave = A.pieza < B.pieza ? A.pieza + '|' + B.pieza : B.pieza + '|' + A.pieza;
        var r = pares[llave];
        if (!r) r = pares[llave] = { a: A.pieza < B.pieza ? A.pieza : B.pieza, b: A.pieza < B.pieza ? B.pieza : A.pieza, material: Infinity, distancia: Infinity, traslape: 0, marcas: [] };
        r.material = Math.min(r.material, material);
        r.distancia = Math.min(r.distancia, f.distancia);
        r.traslape = Math.max(r.traslape, f.traslape);
        r.marcas.push(f.marca);
      }
    }
    return Object.keys(pares).map(function (k) { return pares[k]; }).sort(function (x, y) { return x.material - y.material; });
  }

  return { buscar: buscar, tramosRectos: tramosRectos, frente: frente };
});
