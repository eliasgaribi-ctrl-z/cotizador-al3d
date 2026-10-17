/* ============================================================================
   Abrir un DXF en la mesa de corte.

   El taller recibe el diseño en DXF tanto como en SVG —lo exporta AutoCAD, Corel o el cliente—,
   y para acomodarlo había que pasarlo antes por otro programa. Aquí se lee el DXF tal cual, en
   el navegador, sin mandarlo a ningún lado (Deepnest lo manda a un servidor; nosotros no):

     · Entidades: LINE, LWPOLYLINE y POLYLINE/VERTEX (con «bulge»: los tramos curvos de una
       polilínea), ARC, CIRCLE, ELLIPSE (entera o en arco), SPLINE (NURBS, con pesos; las curvas
       se aproximan a 0.05 mm) e INSERT de bloques (con su escala, giro y anidados). Lo demás
       —textos, cotas, sombreados, imágenes— no se corta: se cuenta y se avisa.
     · Las capas no se separan (todo se acomoda junto) y ninguna capa rara rompe la lectura; lo
       que está en el espacio papel se ignora.
     · Unidades: las de $INSUNITS (el AVIDA real venía en centímetros). Si el archivo no lo dice
       se lee en milímetros y se avisa, para que se revise la medida en el paso 2.
     · Los arcos y polilíneas con la extrusión al revés (0,0,−1, lo que deja un «espejo» en CAD)
       se voltean como los dibuja el CAD.
   Lo que sale son trazos en mm; contornos.js los junta por los extremos (las letras hechas de
   LINE y ARC sueltos), quita lo repetido y lo que no tiene área, y aSvg() arma un SVG en mm que
   entra a la mesa por el mismo camino que cualquier SVG.

   Puro y sin DOM: lo usa app.js y lo prueba pruebas/anidador-dxf-entrada.mjs en node.
   ============================================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnidadorDxfEntrada = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var TOL_MM = 0.05;   // fineza de las curvas, ya en mm
  /* $INSUNITS → mm. 0 es «sin unidades». */
  var UNIDADES = {
    1: ['pulgadas', 25.4], 2: ['pies', 304.8], 4: ['milímetros', 1], 5: ['centímetros', 10], 6: ['metros', 1000],
    8: ['micropulgadas', 2.54e-5], 9: ['milésimas de pulgada', 0.0254], 10: ['yardas', 914.4], 13: ['micras', 0.001], 14: ['decímetros', 100]
  };
  var QUE_ES = { TEXT: 'textos', MTEXT: 'textos', ATTRIB: 'textos', ATTDEF: 'textos', DIMENSION: 'cotas', LEADER: 'cotas',
    MLEADER: 'cotas', HATCH: 'sombreados', SOLID: 'rellenos', IMAGE: 'imágenes', POINT: 'puntos', '3DFACE': 'caras 3D',
    MESH: 'mallas', REGION: 'regiones', '3DSOLID': 'sólidos', BODY: 'sólidos', XLINE: 'líneas infinitas', RAY: 'líneas infinitas', WIPEOUT: 'máscaras' };

  /* ---------- Pares (código, valor) ---------- */
  function pares(texto) {
    var L = String(texto || '').replace(/^﻿/, '').split(/\r\n|\r|\n/), out = [];
    for (var i = 0; i + 1 < L.length; i += 2) {
      var c = parseInt(L[i].trim(), 10);
      if (isNaN(c)) { i--; continue; }   // una línea en blanco de más: se resincroniza
      out.push([c, L[i + 1]]);
    }
    return out;
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  /* Las entidades de una sección como [{tipo, g:[[código, valor]…]}], con los VERTEX de cada
     POLYLINE metidos en ella. */
  function entidades(P, i0, fin) {
    var out = [], actual = null, poli = null;
    for (var i = i0; i < fin; i++) {
      var c = P[i][0], v = P[i][1].trim();
      if (c === 0) {
        if (v === 'VERTEX' && poli) { actual = { tipo: 'VERTEX', g: [] }; poli.vertices.push(actual); continue; }
        if (v === 'SEQEND') { poli = null; actual = { tipo: 'SEQEND', g: [] }; continue; }
        actual = { tipo: v, g: [] };
        if (v === 'POLYLINE') { actual.vertices = []; poli = actual; } else poli = null;
        out.push(actual);
        continue;
      }
      if (actual) actual.g.push([c, P[i][1]]);
    }
    return out;
  }
  function uno(e, c, omision) { for (var i = 0; i < e.g.length; i++) if (e.g[i][0] === c) return e.g[i][1]; return omision; }
  function todos(e, c) { var o = []; for (var i = 0; i < e.g.length; i++) if (e.g[i][0] === c) o.push(num(e.g[i][1])); return o; }

  /* ---------- Curvas ---------- */
  function pasosArco(r, barrido, tol) {
    if (!(r > tol)) return Math.max(2, Math.ceil(Math.abs(barrido) / (Math.PI / 4)));
    var paso = 2 * Math.acos(Math.max(-1, 1 - tol / r));
    return Math.max(2, Math.ceil(Math.abs(barrido) / paso));
  }
  function arco(cx, cy, r, a0, a1, tol) {
    /* a0 → a1 en sentido contrario a las manecillas (radianes). */
    while (a1 <= a0) a1 += 2 * Math.PI;
    var n = pasosArco(r, a1 - a0, tol), p = [];
    for (var k = 0; k <= n; k++) { var a = a0 + (a1 - a0) * k / n; p.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    return p;
  }
  /* El tramo de polilínea de a a b con su bulge (tan(ángulo/4); positivo = contra las manecillas). */
  function tramoBulge(a, b, bulge, tol) {
    if (!bulge || Math.abs(bulge) < 1e-12) return [a, b];
    var dx = b.x - a.x, dy = b.y - a.y, c = Math.sqrt(dx * dx + dy * dy);
    if (c < 1e-12) return [a];
    /* El barrido con signo y el radio; el centro, sobre la perpendicular izquierda de la cuerda
       (a la derecha si el bulge es negativo), a r·cos(θ/2) —negativo pasada media vuelta—. */
    var th = 4 * Math.atan(bulge), r = c / (2 * Math.sin(Math.abs(th) / 2)), d = r * Math.cos(th / 2) * (bulge > 0 ? 1 : -1);
    var cx = (a.x + b.x) / 2 - dy / c * d, cy = (a.y + b.y) / 2 + dx / c * d;
    var a0 = Math.atan2(a.y - cy, a.x - cx), n = pasosArco(r, Math.abs(th), tol), p = [];
    for (var k = 0; k <= n; k++) { var t = a0 + th * k / n; p.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }); }
    p[0] = { x: a.x, y: a.y }; p[p.length - 1] = { x: b.x, y: b.y };
    return p;
  }
  /* NURBS por de Boor. */
  function nurbs(grado, nudos, ctrl, pesos) {
    var n = ctrl.length;
    return function (t) {
      var k = grado;
      for (var i = grado; i < n; i++) if (t >= nudos[i] && t < nudos[i + 1]) { k = i; break; }
      if (t >= nudos[n]) k = n - 1;
      var d = [];
      for (var j = 0; j <= grado; j++) {
        var c = ctrl[k - grado + j], w = pesos ? (pesos[k - grado + j] || 1) : 1;
        d.push({ x: c.x * w, y: c.y * w, w: w });
      }
      for (var r = 1; r <= grado; r++) {
        for (j = grado; j >= r; j--) {
          var i2 = k - grado + j, den = nudos[i2 + grado - r + 1] - nudos[i2], a = den ? (t - nudos[i2]) / den : 0;
          d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y, w: (1 - a) * d[j - 1].w + a * d[j].w };
        }
      }
      var q = d[grado];
      return { x: q.x / q.w, y: q.y / q.w };
    };
  }
  function spline(e, tol) {
    var grado = parseInt(uno(e, 71, '3'), 10) || 3, flags = parseInt(uno(e, 70, '0'), 10) || 0;
    var nudos = todos(e, 40), pesos = todos(e, 41), xs = todos(e, 10), ys = todos(e, 20), fx = todos(e, 11), fy = todos(e, 21);
    var ctrl = xs.map(function (x, i) { return { x: x, y: ys[i] || 0 }; });
    var cerrado = !!(flags & 1);
    if (ctrl.length < 2 || nudos.length !== ctrl.length + grado + 1) {
      /* Sin puntos de control usables: la curva por sus puntos de ajuste, como polilínea. */
      var fit = fx.map(function (x, i) { return { x: x, y: fy[i] || 0 }; });
      return fit.length >= 2 ? { puntos: fit, cerrado: cerrado } : null;
    }
    if (!(flags & 4) || pesos.length !== ctrl.length) pesos = null;
    var f = nurbs(grado, nudos, ctrl, pesos), t0 = nudos[grado], t1 = nudos[ctrl.length], p = [f(t0)];
    /* Tramo por tramo de nudos, partiendo a la mitad mientras la curva se aleje de la cuerda. */
    function partir(a, b, pa, pb, prof) {
      var m = (a + b) / 2, pm = f(m);
      var dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.sqrt(dx * dx + dy * dy);
      var dist = L > 1e-12 ? Math.abs((pm.x - pa.x) * dy - (pm.y - pa.y) * dx) / L : Math.sqrt((pm.x - pa.x) * (pm.x - pa.x) + (pm.y - pa.y) * (pm.y - pa.y));
      if (prof < 14 && (dist > tol || prof < 2)) { partir(a, m, pa, pm, prof + 1); partir(m, b, pm, pb, prof + 1); }
      else p.push(pb);
    }
    for (var i = grado; i < ctrl.length; i++) {
      var a = Math.max(t0, nudos[i]), b = Math.min(t1, nudos[i + 1]);
      if (b - a <= 1e-12) continue;
      partir(a, b, f(a), f(b - 1e-12 * (b - a)), 0);
    }
    p[p.length - 1] = f(t1 - 1e-12 * (t1 - t0));
    return { puntos: p, cerrado: cerrado };
  }

  /* ---------- Transformaciones (bloques y OCS) ---------- */
  function mat(a, b, c, d, e, f) { return [a, b, c, d, e, f]; }   // x' = a x + c y + e; y' = b x + d y + f
  var ID = mat(1, 0, 0, 1, 0, 0);
  function por(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function aplicar(m, p) { return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }; }
  /* Extrusión (0,0,−1): el eje X del OCS es el −X del dibujo. Es lo único que se ve en 2D. */
  function ocs(e) { return num(uno(e, 230, '1')) < 0 ? mat(-1, 0, 0, 1, 0, 0) : ID; }

  /* ---------- Lectura ---------- */
  function leer(texto, opciones) {
    opciones = opciones || {};
    var P = pares(texto);
    if (!P.length) return { error: 'vacío' };
    var secciones = {}, i, nombre = null, ini = 0;
    for (i = 0; i < P.length; i++) {
      if (P[i][0] === 0 && P[i][1].trim() === 'SECTION' && P[i + 1] && P[i + 1][0] === 2) { nombre = P[i + 1][1].trim(); ini = i + 2; }
      else if (P[i][0] === 0 && P[i][1].trim() === 'ENDSEC' && nombre) { secciones[nombre] = [ini, i]; nombre = null; }
    }
    if (!secciones.ENTITIES) return { error: 'sin ENTITIES' };

    /* Unidades. */
    var insunits = null;
    if (secciones.HEADER) {
      for (i = secciones.HEADER[0]; i < secciones.HEADER[1]; i++) {
        if (P[i][0] === 9 && P[i][1].trim() === '$INSUNITS') { var j = i + 1; while (j < secciones.HEADER[1] && P[j][0] !== 70 && P[j][0] !== 9) j++; if (P[j] && P[j][0] === 70) insunits = parseInt(P[j][1], 10); }
      }
    }
    var u = UNIDADES[insunits];
    var unidad = u ? u[0] : null, k = u ? u[1] : 1;
    var avisos = [];
    if (!u) avisos.push(insunits && insunits !== 0
      ? 'El DXF viene en unas unidades que no se usan en el taller (código ' + insunits + '): se leyó como milímetros. Revisa la medida en el paso 2.'
      : 'El DXF no dice en qué unidades está: se leyó en milímetros. Revisa la medida en el paso 2.');

    /* Bloques. */
    var bloques = {};
    if (secciones.BLOCKS) {
      var es = entidades(P, secciones.BLOCKS[0], secciones.BLOCKS[1]), actual = null;
      es.forEach(function (e) {
        if (e.tipo === 'BLOCK') { actual = { nombre: String(uno(e, 2, '')).trim(), base: { x: num(uno(e, 10, 0)), y: num(uno(e, 20, 0)) }, es: [] }; bloques[actual.nombre] = actual; }
        else if (e.tipo === 'ENDBLK') actual = null;
        else if (actual) actual.es.push(e);
      });
    }

    var tol = TOL_MM / k, trazos = [], ignoradas = {}, insertos = 0;
    function agregar(pts, cerrado, m, capa) {
      if (!pts || pts.length < 2) return;
      trazos.push({ puntos: pts.map(function (p) { var q = aplicar(m, p); return { x: q.x * k, y: q.y * k }; }), cerrado: !!cerrado, capa: capa });
    }
    function procesar(lista, m, prof) {
      lista.forEach(function (e) {
        if (uno(e, 67, '0').trim() === '1') return;   // espacio papel
        var capa = String(uno(e, 8, '0')).trim(), o, pts, n2;
        switch (e.tipo) {
          case 'LINE':
            agregar([{ x: num(uno(e, 10, 0)), y: num(uno(e, 20, 0)) }, { x: num(uno(e, 11, 0)), y: num(uno(e, 21, 0)) }], false, m, capa);
            break;
          case 'ARC':
            o = por(m, ocs(e));
            agregar(arco(num(uno(e, 10, 0)), num(uno(e, 20, 0)), num(uno(e, 40, 0)), num(uno(e, 50, 0)) * Math.PI / 180, num(uno(e, 51, 0)) * Math.PI / 180, tol), false, o, capa);
            break;
          case 'CIRCLE':
            o = por(m, ocs(e));
            pts = arco(num(uno(e, 10, 0)), num(uno(e, 20, 0)), num(uno(e, 40, 0)), 0, 2 * Math.PI, tol); pts.pop();
            agregar(pts, true, o, capa);
            break;
          case 'ELLIPSE': {
            var cx = num(uno(e, 10, 0)), cy = num(uno(e, 20, 0)), mx = num(uno(e, 11, 0)), my = num(uno(e, 21, 0)), rz = num(uno(e, 40, 1));
            var t0 = num(uno(e, 41, 0)), t1 = num(uno(e, 42, 2 * Math.PI)), R = Math.sqrt(mx * mx + my * my);
            if (num(uno(e, 230, '1')) < 0) { t0 = -t0; t1 = -t1; var tt = t0; t0 = t1; t1 = tt; }   // extrusión al revés: recorre al revés
            while (t1 <= t0) t1 += 2 * Math.PI;
            var entera = Math.abs(t1 - t0 - 2 * Math.PI) < 1e-9;
            n2 = pasosArco(R * Math.max(rz, 1e-6), t1 - t0, tol) * 2;
            pts = [];
            for (var s = 0; s <= n2; s++) { var t = t0 + (t1 - t0) * s / n2; pts.push({ x: cx + mx * Math.cos(t) - my * rz * Math.sin(t), y: cy + my * Math.cos(t) + mx * rz * Math.sin(t) }); }
            if (entera) pts.pop();
            agregar(pts, entera, m, capa);
            break;
          }
          case 'LWPOLYLINE': {
            o = por(m, ocs(e));
            var vs = [], cerradoL = (parseInt(uno(e, 70, '0'), 10) || 0) & 1;
            e.g.forEach(function (g) {
              if (g[0] === 10) vs.push({ x: num(g[1]), y: 0, b: 0 });
              else if (g[0] === 20 && vs.length) vs[vs.length - 1].y = num(g[1]);
              else if (g[0] === 42 && vs.length) vs[vs.length - 1].b = num(g[1]);
            });
            agregar(polilinea(vs, cerradoL, tol), cerradoL, o, capa);
            break;
          }
          case 'POLYLINE': {
            var fl = parseInt(uno(e, 70, '0'), 10) || 0;
            if (fl & (16 | 64)) { ignoradas['mallas'] = (ignoradas['mallas'] || 0) + 1; break; }
            o = (fl & 8) ? m : por(m, ocs(e));   // 3D: en coordenadas del dibujo
            var vv = (e.vertices || []).filter(function (v) { return !((parseInt(uno(v, 70, '0'), 10) || 0) & 16); })
              .map(function (v) { return { x: num(uno(v, 10, 0)), y: num(uno(v, 20, 0)), b: num(uno(v, 42, 0)) }; });
            agregar(polilinea(vv, fl & 1, tol), fl & 1, o, capa);
            break;
          }
          case 'SPLINE': {
            var sp = spline(e, tol);
            if (sp) agregar(sp.puntos, sp.cerrado, m, capa);
            break;
          }
          case 'INSERT': {
            var b = bloques[String(uno(e, 2, '')).trim()];
            if (!b || prof > 8) break;
            insertos++;
            var ix = num(uno(e, 10, 0)), iy = num(uno(e, 20, 0)), sx = num(uno(e, 41, '1')) || 1, sy = num(uno(e, 42, '1')) || 1, rot = num(uno(e, 50, 0)) * Math.PI / 180;
            var c = Math.cos(rot), si = Math.sin(rot);
            /* p' = ins + R·S·(p − base), y la extrusión del INSERT encima. */
            var t = por(mat(c, si, -si, c, ix, iy), por(mat(sx, 0, 0, sy, 0, 0), mat(1, 0, 0, 1, -b.base.x, -b.base.y)));
            procesar(b.es, por(m, por(ocs(e), t)), prof + 1);
            break;
          }
          default: {
            var q = QUE_ES[e.tipo];
            if (q) ignoradas[q] = (ignoradas[q] || 0) + 1;
            else if (e.tipo && e.tipo !== 'SEQEND' && e.tipo !== 'VERTEX' && e.tipo !== 'VIEWPORT') ignoradas['otras cosas (' + e.tipo + ')'] = (ignoradas['otras cosas (' + e.tipo + ')'] || 0) + 1;
          }
        }
      });
    }
    function polilinea(vs, cerrada, tol) {
      if (vs.length < 2) return vs.length ? [{ x: vs[0].x, y: vs[0].y }] : [];
      var out = [{ x: vs[0].x, y: vs[0].y }], n = vs.length, hasta = cerrada ? n : n - 1;
      for (var a = 0; a < hasta; a++) {
        var b = (a + 1) % n, t = tramoBulge(vs[a], vs[b], vs[a].b, tol);
        for (var q = 1; q < t.length; q++) out.push({ x: t[q].x, y: t[q].y });
      }
      if (cerrada) out.pop();   // el último es el primero
      return out;
    }

    procesar(entidades(P, secciones.ENTITIES[0], secciones.ENTITIES[1]), ID, 0);
    var Q = Object.keys(ignoradas);
    if (Q.length) avisos.push('Trae ' + Q.map(function (q) { return ignoradas[q] + ' ' + q; }).join(', ') + ', que no se cortan: se ignoraron.');
    return { trazos: trazos, unidad: unidad, mmPorUnidad: k, insunits: insunits, avisos: avisos, ignoradas: ignoradas, bloques: insertos };
  }

  /* ---------- A SVG ---------- */
  /* En mm, con la Y hacia abajo como en SVG. `grupos` (opcional) dice qué figuras van juntas en un
     mismo trazo compuesto: [[exterior, hueco, hueco…], …] por índice de `cerrados`; así la vista
     previa enseña los huecos (fill-rule evenodd) y la limpieza de la mesa puede quitar un contorno
     con sus huecos de un solo golpe. Sin grupos, cada figura va sola. Lo que no cerró va como
     trazo abierto con class="an-suelta": se ve en la vista previa y no va al motor. */
  function aSvg(cerrados, abiertos, grupos) {
    cerrados = cerrados || []; abiertos = abiertos || [];
    var todos = cerrados.concat(abiertos);
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    todos.forEach(function (t) { t.puntos.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }); });
    if (!isFinite(x0)) return null;
    var w = Math.max(x1 - x0, 0.001), h = Math.max(y1 - y0, 0.001);
    var f = function (v) { return String(Math.round(v * 1000) / 1000); };
    var d = function (t, z) { return 'M' + t.puntos.map(function (p) { return f(p.x - x0) + ' ' + f(y1 - p.y); }).join('L') + (z ? 'Z' : ''); };
    if (!grupos) grupos = cerrados.map(function (c, i) { return [i]; });
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + f(w) + 'mm" height="' + f(h) + 'mm" viewBox="0 0 ' + f(w) + ' ' + f(h) + '">'];
    grupos.forEach(function (g) {
      out.push('<path' + (g.length > 1 ? ' fill-rule="evenodd"' : '') + ' d="' + g.map(function (i) { return d(cerrados[i], true); }).join('') + '"/>');
    });
    abiertos.forEach(function (t) { out.push('<path class="an-suelta" fill="none" d="' + d(t, false) + '"/>'); });
    out.push('</svg>');
    return out.join('\n');
  }

  /* ¿Este texto es un DXF? Empieza con «0 / SECTION». */
  function esDxf(texto) { return /^\s*0\s*\r?\n\s*SECTION\s*\r?\n/.test(String(texto || '').replace(/^﻿/, '').slice(0, 200)); }

  return { leer: leer, aSvg: aSvg, esDxf: esDxf, UNIDADES: UNIDADES, TOL_MM: TOL_MM, _tramoBulge: tramoBulge };
});
