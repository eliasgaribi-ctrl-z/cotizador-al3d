/* ============================================================================
   Contornos: juntar líneas sueltas, quitar lo que no se corta y armar las piezas.

   Lo que el equipo hacía a mano con «Reparar problema» antes de acomodar, y lo que se
   descubría en la máquina cuando nadie lo hacía:

     · unir()   Un DXF de CAD trae cada letra en tramos —LINE, ARC, splines— que se tocan
                por sus extremos pero no forman una figura. Se juntan por los extremos en
                pasadas de tolerancia creciente (de 1 micra a medio milímetro): primero lo que
                casi coincide, al final lo que tiene un huequito de dibujo. Antes se quitan los
                tramos repetidos y los rectos encimados (dos LINE una sobre otra), que si no
                se juntarían entre sí y no con su vecino. Lo que no cierra se devuelve aparte
                para avisarlo: no se pierde callado.
     · limpiar() Sobre las figuras ya cerradas, en mm:
                - las que no tienen área (una línea que se juntó consigo misma) se quitan;
                - las REPETIDAS (el mismo contorno dos veces, encimado) se quitan: se cortarían
                  dos veces;
                - el CONTORNO COMPLETO DE GUÍA: una letra dibujada entera y además partida en
                  sus piezas, encimadas —el contorno cubre a dos o más que comparten su orilla
                  (o se salen poco) y que juntas suman al menos el 60 % de su área—. Lo que se
                  corta son las piezas; el contorno, con sus huecos propios, se quita (archivo
                  de AVIDA, 17/10/2026: las letras grandes traían contorno y mitades);
                - la LÍNEA DOBLE: un contorno alrededor de otro casi igual (el de dentro con el 85 %
                  del área o más, y a 3 mm o menos de él en toda su orilla). Se cortaría una tira de ese ancho; se
                  quita el de fuera.
                Lo de guía y la línea doble se devuelven aparte, para que la interfaz los quite
                por omisión, lo diga y deje conservarlos.
     · piezas() Las figuras que quedan, agrupadas: cada pieza es un contorno de fuera con sus
                huecos. Hueco es lo que queda ESTRICTAMENTE dentro (a más de medio milímetro de
                la orilla); una figura que toca la orilla de otra o se sale es otra pieza
                encimada, no un hueco.

   Puro, sin DOM: lo usan js/dxf-entrada.js y app.js en el navegador, y pruebas/anidador-contornos.mjs
   en node. Todos los puntos son {x, y} en milímetros.
   ============================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnidadorContornos = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TOLERANCIAS_UNIR = [0.001, 0.01, 0.05, 0.1, 0.25, 0.5];   // mm, de menos a más
  var HUECO_MM = 0.5;            // un hueco queda a más de esto de la orilla de fuera
  var GUIA_MM = 2.5;             // lo que una parte puede salirse o separarse del contorno de guía
  var GUIA_TOCA_MM = 1;          // una parte «comparte la orilla» si llega a esto de ella
  var GUIA_AREA = 0.6;           // las partes suman al menos esto del área del contorno
  var DOBLE_MM = 3;              // línea doble: a esto o menos en toda la orilla…
  var DOBLE_AREA = 0.85;         // …y la de dentro con al menos esto del área de la de fuera
  var REPETIDO_MM = 0.05;        // dos contornos a esto o menos uno del otro son el mismo
  var AREA_MINIMA_MM2 = 0.01;    // menos que esto no es una figura

  /* ---------- Geometría básica ---------- */
  function area(P) {
    var s = 0;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j].x + P[i].x) * (P[j].y - P[i].y);
    return s / 2;
  }
  function caja(P) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (var i = 0; i < P.length; i++) {
      if (P[i].x < b.x0) b.x0 = P[i].x; if (P[i].x > b.x1) b.x1 = P[i].x;
      if (P[i].y < b.y0) b.y0 = P[i].y; if (P[i].y > b.y1) b.y1 = P[i].y;
    }
    return b;
  }
  function cajasCerca(a, b, d) { return !(a.x1 + d < b.x0 || b.x1 + d < a.x0 || a.y1 + d < b.y0 || b.y1 + d < a.y0); }
  function dentroDe(q, P) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      if ((P[i].y > q.y) !== (P[j].y > q.y) && q.x < (P[j].x - P[i].x) * (q.y - P[i].y) / (P[j].y - P[i].y) + P[i].x) c = !c;
    }
    return c;
  }
  function distSeg(q, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = 0;
    if (l > 0) t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l));
    var ex = a.x + t * dx - q.x, ey = a.y + t * dy - q.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  function distBorde(q, P) {
    var m = Infinity;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var d = distSeg(q, P[j], P[i]); if (d < m) m = d; }
    return m;
  }
  /* Lo más lejos que queda un vértice de A de la orilla de B (cortado en `tope`: más allá no
     interesa cuánto). */
  function lejania(A, B, tope) {
    var m = 0;
    for (var i = 0; i < A.length; i++) { var d = distBorde(A[i], B); if (d > m) { m = d; if (m > tope) return m; } }
    return m;
  }
  function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  /* ---------- unir ---------- */
  /* trazos: [{puntos:[{x,y}], cerrado, capa?}]. Devuelve {cerrados:[{puntos, trazos}],
     abiertos:[{puntos, trazos}], repetidos, encimados} — `trazos` es cuántos tramos del archivo
     forman cada figura. */
  function unir(trazos, opciones) {
    opciones = opciones || {};
    var tols = opciones.tolerancias || TOLERANCIAS_UNIR;
    var tolMin = tols[0];
    var cerrados = [], abiertos = [], repetidos = 0, encimados = 0;

    function limpios(pts) {
      var out = [];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (!(isFinite(p.x) && isFinite(p.y))) continue;
        if (out.length && d2(out[out.length - 1], p) <= tolMin * tolMin * 1e-6) continue;
        out.push({ x: p.x, y: p.y });
      }
      return out;
    }

    var sueltos = [];
    (trazos || []).forEach(function (t) {
      var p = limpios(t.puntos || []);
      if (p.length < 2) return;
      if (t.cerrado || (p.length > 2 && d2(p[0], p[p.length - 1]) <= tolMin * tolMin)) {
        if (p.length > 2 && d2(p[0], p[p.length - 1]) <= tolMin * tolMin) p.pop();
        if (p.length >= 3) cerrados.push({ puntos: p, trazos: 1 }); else sueltos.push({ puntos: p, trazos: 1 });
        return;
      }
      sueltos.push({ puntos: p, trazos: 1 });
    });

    /* Los tramos repetidos (el mismo, de ida o de vuelta) y los rectos encimados. */
    var rectos = [], otros = [];
    sueltos.forEach(function (s) { (s.puntos.length === 2 ? rectos : otros).push(s); });
    var vistos = {};
    otros = otros.filter(function (s) {
      var f = s.puntos.map(function (p) { return Math.round(p.x / tolMin) + ',' + Math.round(p.y / tolMin); });
      var k1 = f.join(';'), k2 = f.slice().reverse().join(';');
      if (vistos[k1] || vistos[k2]) { repetidos++; return false; }
      vistos[k1] = true; return true;
    });
    /* Rectos: por recta (ángulo y distancia al origen redondeados), los intervalos que se
       traslapan se funden en uno. */
    var porRecta = {};
    rectos.forEach(function (s) {
      var a = s.puntos[0], b = s.puntos[1];
      var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy);
      if (L <= tolMin) return;
      var ux = dx / L, uy = dy / L;
      if (ux < -1e-12 || (Math.abs(ux) <= 1e-12 && uy < 0)) { ux = -ux; uy = -uy; }
      var off = a.x * uy - a.y * ux;
      var k = Math.round(Math.atan2(uy, ux) * 1e5) + '|' + Math.round(off / (tolMin * 10));
      var t0 = a.x * ux + a.y * uy, t1 = b.x * ux + b.y * uy;
      (porRecta[k] || (porRecta[k] = { ux: ux, uy: uy, off: off, iv: [] })).iv.push([Math.min(t0, t1), Math.max(t0, t1)]);
    });
    Object.keys(porRecta).forEach(function (k) {
      var r = porRecta[k];
      r.iv.sort(function (a, b) { return a[0] - b[0]; });
      var juntos = [];
      r.iv.forEach(function (iv) {
        var u = juntos[juntos.length - 1];
        /* Se traslapan de verdad (no solo se tocan en la punta): se funden. */
        if (u && iv[0] < u[1] - tolMin) { encimados++; u[1] = Math.max(u[1], iv[1]); }
        else juntos.push([iv[0], iv[1]]);
      });
      juntos.forEach(function (iv) {
        /* De vuelta a puntos: t·u + off·(perpendicular). */
        var px = function (t) { return { x: t * r.ux + r.off * r.uy, y: t * r.uy - r.off * r.ux }; };
        otros.push({ puntos: [px(iv[0]), px(iv[1])], trazos: 1 });
      });
    });

    /* Juntar por los extremos. Cada extremo se casa a lo más con otro (el más cercano primero, en
       pasadas de tolerancia creciente); al final cada figura es un camino o un ciclo en el grafo
       «tramo + casamientos», y se recorre. */
    var n = otros.length, pareja = new Int32Array(2 * n).fill(-1);
    function punto(e) { var s = otros[e >> 1]; return (e & 1) ? s.puntos[s.puntos.length - 1] : s.puntos[0]; }
    tols.forEach(function (tol) {
      var celdas = {}, cand = [], e;
      var llave = function (p) { return Math.floor(p.x / tol) + ',' + Math.floor(p.y / tol); };
      for (e = 0; e < 2 * n; e++) if (pareja[e] < 0) { var k = llave(punto(e)); (celdas[k] || (celdas[k] = [])).push(e); }
      for (e = 0; e < 2 * n; e++) {
        if (pareja[e] >= 0) continue;
        var p = punto(e), cx = Math.floor(p.x / tol), cy = Math.floor(p.y / tol);
        for (var ix = -1; ix <= 1; ix++) for (var iy = -1; iy <= 1; iy++) {
          var l = celdas[(cx + ix) + ',' + (cy + iy)]; if (!l) continue;
          for (var t = 0; t < l.length; t++) {
            var f = l[t]; if (f <= e) continue;
            /* Un tramo no se cierra consigo mismo si es una sola recta. */
            if ((f >> 1) === (e >> 1) && otros[e >> 1].puntos.length < 3) continue;
            var dd = d2(p, punto(f));
            if (dd <= tol * tol) cand.push([dd, e, f]);
          }
        }
      }
      cand.sort(function (a, b) { return a[0] - b[0]; });
      cand.forEach(function (c) { if (pareja[c[1]] < 0 && pareja[c[2]] < 0) { pareja[c[1]] = c[2]; pareja[c[2]] = c[1]; } });
    });
    var usado = new Uint8Array(n);
    function recorrer(e0) {
      /* Desde el extremo e0 de su tramo: se recorre el tramo hasta su otro extremo y se salta a
         la pareja de ése, hasta que no haya pareja o se vuelva al principio. */
      var pts = [], e = e0, cuantos = 0, cerrado = false;
      while (true) {
        var s = e >> 1; if (usado[s]) { cerrado = true; break; }
        usado[s] = 1; cuantos++;
        var ps = (e & 1) ? otros[s].puntos.slice().reverse() : otros[s].puntos;
        for (var i = 0; i < ps.length; i++) if (!pts.length || d2(pts[pts.length - 1], ps[i]) > 1e-18) pts.push(ps[i]);
        var otro = e ^ 1, sig = pareja[otro];
        if (sig < 0) break;
        e = sig;
      }
      if (cerrado && pts.length > 2 && d2(pts[0], pts[pts.length - 1]) <= 1e-18) pts.pop();
      return { puntos: pts, trazos: cuantos, cerrado: cerrado };
    }
    var s;
    /* Primero los caminos (empiezan en un extremo sin pareja); lo que quede son ciclos. */
    for (s = 0; s < n; s++) {
      if (usado[s]) continue;
      if (pareja[2 * s] < 0) { var r = recorrer(2 * s); abiertos.push({ puntos: r.puntos, trazos: r.trazos }); }
      else if (pareja[2 * s + 1] < 0) { var r2 = recorrer(2 * s + 1); abiertos.push({ puntos: r2.puntos, trazos: r2.trazos }); }
    }
    for (s = 0; s < n; s++) {
      if (usado[s]) continue;
      var c = recorrer(2 * s);
      if (c.puntos.length >= 3) cerrados.push({ puntos: c.puntos, trazos: c.trazos }); else abiertos.push({ puntos: c.puntos, trazos: c.trazos });
    }
    return { cerrados: cerrados, abiertos: abiertos, repetidos: repetidos, encimados: encimados };
  }

  /* ---------- limpiar ---------- */
  /* contornos: [{id, puntos}] cerrados, en mm. Devuelve qué ids se quitan y por qué:
     {sinArea:[id], repetidos:[id], guias:[{id, partes:[id], huecos:[id]}], dobles:[{id, dentro, mm}]}.
     No toca la lista. */
  function limpiar(contornos, opciones) {
    opciones = opciones || {};
    var C = (contornos || []).map(function (c, i) {
      var a = area(c.puntos);
      return { id: c.id != null ? c.id : i, P: c.puntos, a: Math.abs(a), b: caja(c.puntos), fuera: false };
    });
    var r = { sinArea: [], repetidos: [], guias: [], dobles: [] };
    C.forEach(function (c) {
      if (c.P.length < 3 || c.a < AREA_MINIMA_MM2 || c.b.x1 - c.b.x0 < 0.01 || c.b.y1 - c.b.y0 < 0.01) { c.fuera = true; r.sinArea.push(c.id); }
    });
    var vivos = function () { return C.filter(function (c) { return !c.fuera; }); };

    /* Repetidos: misma área (1 %), misma caja (REPETIDO_MM) y cada vértice de uno sobre la orilla
       del otro, en los dos sentidos. Se queda el primero. */
    var V = vivos();
    for (var i = 0; i < V.length; i++) {
      if (V[i].fuera) continue;
      for (var j = i + 1; j < V.length; j++) {
        var a = V[i], b = V[j];
        if (b.fuera || Math.abs(a.a - b.a) > 0.01 * Math.max(a.a, b.a)) continue;
        if (Math.abs(a.b.x0 - b.b.x0) > REPETIDO_MM || Math.abs(a.b.y0 - b.b.y0) > REPETIDO_MM || Math.abs(a.b.x1 - b.b.x1) > REPETIDO_MM || Math.abs(a.b.y1 - b.b.y1) > REPETIDO_MM) continue;
        if (lejania(b.P, a.P, REPETIDO_MM) <= REPETIDO_MM && lejania(a.P, b.P, REPETIDO_MM) <= REPETIDO_MM) { b.fuera = true; r.repetidos.push(b.id); }
      }
    }

    /* Para cada par (g contiene a p): ¿p está «dentro» con holgura de guía, la toca o se sale, y
       está estrictamente dentro (hueco)? */
    V = vivos();
    function relacion(g, p) {
      if (p.a >= g.a || !cajasCerca(g.b, p.b, GUIA_MM)) return null;
      var dentro = true, toca = false, estricto = true;
      for (var k = 0; k < p.P.length; k++) {
        var q = p.P[k], adentro = dentroDe(q, g.P);
        var d = distBorde(q, g.P);
        if (!adentro && d > GUIA_MM) { dentro = false; break; }
        if (!adentro || d <= GUIA_TOCA_MM) toca = true;
        if (!adentro || d <= HUECO_MM) estricto = false;
      }
      return dentro ? { toca: toca, estricto: estricto } : null;
    }

    /* Contornos de guía. */
    V.forEach(function (g) {
      if (g.fuera) return;
      var partes = [], suma = 0, huecos = [];
      V.forEach(function (p) {
        if (p === g || p.fuera) return;
        var rel = relacion(g, p); if (!rel) return;
        if (rel.toca) { partes.push(p); suma += p.a; }
        else if (rel.estricto) huecos.push(p);
      });
      if (partes.length < 2 || suma < GUIA_AREA * g.a) return;
      /* Sus huecos propios: los que no quedan dentro de ninguna de sus partes. */
      var propios = huecos.filter(function (h) {
        return !partes.some(function (p) { return h.a < p.a && h.P.every(function (q) { return dentroDe(q, p.P); }); });
      });
      g.fuera = true; propios.forEach(function (h) { h.fuera = true; });
      r.guias.push({ id: g.id, partes: partes.map(function (p) { return p.id; }), huecos: propios.map(function (h) { return h.id; }) });
    });

    /* Líneas dobles. */
    V = vivos();
    V.forEach(function (o) {
      if (o.fuera) return;
      for (var k = 0; k < V.length; k++) {
        var d = V[k];
        if (d === o || d.fuera || d.a < DOBLE_AREA * o.a || d.a >= o.a) continue;
        if (!cajasCerca(o.b, d.b, 0) || d.b.x0 < o.b.x0 - 0.01 || d.b.y0 < o.b.y0 - 0.01 || d.b.x1 > o.b.x1 + 0.01 || d.b.y1 > o.b.y1 + 0.01) continue;
        if (!d.P.every(function (q) { return dentroDe(q, o.P) || distBorde(q, o.P) <= 0.01; })) continue;
        /* Cada vértice de la de dentro a DOBLE_MM o menos de la de fuera (el área ya dice que la de
           fuera no tiene nada de más; sus esquinas pueden quedar un poco más lejos). */
        var l2 = lejania(d.P, o.P, DOBLE_MM);
        if (l2 <= DOBLE_MM) {
          o.fuera = true;
          r.dobles.push({ id: o.id, dentro: d.id, mm: Math.round(l2 * 10) / 10 });
          break;
        }
      }
    });
    return r;
  }

  /* ---------- piezas ---------- */
  /* contornos: [{id, puntos}] cerrados. Cada uno que no queda estrictamente dentro de otro es
     una pieza; los que sí, son sus huecos (y lo que queda dentro de un hueco, otra pieza).
     Devuelve [{id, contorno, huecos:[{id, puntos}]}]. */
  function piezas(contornos) {
    var C = (contornos || []).map(function (c, i) {
      return { id: c.id != null ? c.id : i, P: c.puntos, a: Math.abs(area(c.puntos)), b: caja(c.puntos), padre: null };
    }).filter(function (c) { return c.P.length >= 3 && c.a > 0; });
    /* El padre de cada uno: el contorno más chico que lo contiene estrictamente. */
    C.forEach(function (c) {
      C.forEach(function (g) {
        if (g === c || g.a <= c.a || !cajasCerca(g.b, c.b, 0)) return;
        if (c.b.x0 < g.b.x0 || c.b.y0 < g.b.y0 || c.b.x1 > g.b.x1 || c.b.y1 > g.b.y1) return;
        for (var k = 0; k < c.P.length; k++) if (!dentroDe(c.P[k], g.P) || distBorde(c.P[k], g.P) <= HUECO_MM) return;
        if (!c.padre || g.a < c.padre.a) c.padre = g;
      });
    });
    var nivel = function (c) { var n = 0; while (c.padre) { n++; c = c.padre; } return n; };
    var out = [];
    C.forEach(function (c) {
      if (nivel(c) % 2) return;   // es hueco de alguien
      out.push({ id: c.id, contorno: c.P, huecos: C.filter(function (h) { return h.padre === c; }).map(function (h) { return { id: h.id, puntos: h.P }; }) });
    });
    return out;
  }

  return {
    unir: unir, limpiar: limpiar, piezas: piezas,
    area: area, caja: caja, dentroDe: dentroDe, distBorde: distBorde,
    TOLERANCIAS_UNIR: TOLERANCIAS_UNIR
  };
});
