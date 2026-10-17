/* ============================================================================
   El motor sparrow en la mesa de corte: la traducción de ida y vuelta.

   Elías (17/10/2026): «hay muchos elementos que se pudieran acomodar de mejor manera que yo
   manualmente así lo hago». Lo era: el motor de SVGnest (2015) no mejora con más giros, más
   tiempo ni huecos, medido con su letrero de AVIDA. sparrow (KU Leuven, 2025, MIT) es lo mejor
   que hay hoy en código abierto para acomodar piezas irregulares, y con el mismo letrero gastó
   2.09 m de hoja donde SVGnest gastaba 2.37 (y a 1 cm de separación cupo en una hoja donde
   SVGnest necesitaba dos). Corre aquí mismo, en el navegador: el paquete compilado vive en
   anidador-vectores/motor/ y sale de .github/workflows/motor-sparrow.yml, desde el código
   fuente de sparrow-studio (MIT) en una versión fija, con sus licencias al lado.

   Cómo piensa sparrow: una TIRA de ancho fijo y largo libre; acomoda las piezas buscando el
   menor largo. Para la mesa la tira es la hoja: su ancho es el lado corto de la hoja y el largo
   corre por el lado largo, así que lo que sobra queda junto, en un retazo rectangular de lado a
   lado. Si las piezas no caben en una hoja, la tira se parte (ver `partir`).

   Este archivo es PURO —sin DOM ni Worker— para probarlo en node (pruebas/anidador-sparrow.mjs).
   Quien corre el motor es js/motor-sparrow-trabajador.js, y quien lo llama es js/app.js.
   ============================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnidadorSparrow = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* El puente de sparrow-studio solo acepta estas duraciones (en segundos). */
  var SEGUNDOS = [10, 30, 60, 120, 300, 600];
  function segundosPara(pedido) {
    for (var i = 0; i < SEGUNDOS.length; i++) if (SEGUNDOS[i] >= pedido) return SEGUNDOS[i];
    return SEGUNDOS[SEGUNDOS.length - 1];
  }

  /* Los giros de la mesa, en el idioma del motor: una lista de grados, o `undefined` = libre
     (cualquier ángulo). Decisión de Elías (17/10/2026): sin veta, giro libre de omisión; con veta
     (aluminio cepillado, MDF), solo 0° y 180°, que dejan la veta paralela. */
  function girosDe(valor) {
    if (valor === 'libre' || valor === undefined || valor === null) return undefined;
    var n = parseInt(valor, 10);
    if (!(n >= 1)) return undefined;
    var out = [];
    for (var i = 0; i < n; i++) out.push(Math.round(i * 360 / n * 1000) / 1000);
    return out;
  }

  function cajaDe(puntos) {
    var c = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (var i = 0; i < puntos.length; i++) {
      var p = puntos[i];
      if (p.x < c.x0) c.x0 = p.x; if (p.y < c.y0) c.y0 = p.y;
      if (p.x > c.x1) c.x1 = p.x; if (p.y > c.y1) c.y1 = p.y;
    }
    return c;
  }

  /* Cada pieza, llevada a su esquina: el motor recibe el contorno de fuera con su mínimo en
     (0, 0), y aquí se recuerda cuánto se movió (`o`) para devolverla a sus coordenadas. Los
     huecos no viajan: sparrow reserva la huella de fuera entera (no mete piezas en huecos). */
  function preparar(piezas) {
    return piezas.map(function (p, i) {
      var c = cajaDe(p.contorno);
      return { id: p.id, indice: i, o: { x: c.x0, y: c.y0 },
               local: p.contorno.map(function (q) { return [q.x - c.x0, q.y - c.y0]; }) };
    });
  }

  /* La entrada del motor (ExtSPInstance de jagua-rs): la tira de `ancho` y una pieza por
     contorno, cada una con su lista de giros. */
  function entrada(preparadas, opc) {
    var giros = girosDe(opc.giros);
    return JSON.stringify({
      name: 'mesa-de-corte',
      strip_height: opc.ancho,
      items: preparadas.map(function (p) {
        return { id: p.indice, demand: 1, allowed_orientations: giros, shape: { type: 'simple_polygon', data: p.local } };
      })
    });
  }

  /* La hoja y la tira: la tira corre por el lado LARGO de la hoja. Con la hoja parada (ancho <
     alto) hay que girar la tira 90° para ponerla a lo largo; con la hoja acostada ya va así. */
  function geometriaDeHoja(ancho, alto) {
    var parada = alto > ancho;
    return { parada: parada, anchoTira: parada ? ancho : alto, largoTira: parada ? alto : ancho, ancho: ancho, alto: alto };
  }

  function rot(grados, p) {
    var a = grados * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  }

  /* Del motor a la mesa. sparrow coloca cada pieza girando su contorno local `θ` grados y
     moviéndolo `t`: S = R(θ)(P − o) + t, con P en las coordenadas originales de la pieza. En la
     hoja parada además se gira la tira 90° (sin espejo: es un giro, no un volteo) y se recorre al
     ancho: Q = R(90)·S + (ancho, 0). La mesa guarda cada pieza como `translate(x y) rotate(r)`
     aplicado a P, así que r = θ (+90) y (x, y) = lo que queda. Devuelve [{id, x, y, r}]. */
  function colocaciones(solucion, preparadas, hoja, desplazamiento) {
    var porIndice = {};
    preparadas.forEach(function (p) { porIndice[p.indice] = p; });
    var dx = desplazamiento || 0;   // para partir: lo que se recorre la tira hacia atrás
    return solucion.layout.placed_items.map(function (it) {
      var p = porIndice[it.item_id];
      var th = Number(it.transformation.rotation) || 0;
      var t = { x: Number(it.transformation.translation[0]) - dx, y: Number(it.transformation.translation[1]) };
      var r = hoja.parada ? th + 90 : th;
      var base = hoja.parada ? (function () { var q = rot(90, t); return { x: q.x + hoja.ancho, y: q.y }; })() : t;
      var ro = rot(r, p.o);
      return { id: p.id, x: base.x - ro.x, y: base.y - ro.y, r: ((r % 360) + 360) % 360 };
    });
  }

  /* Dónde queda una pieza en la TIRA (para partirla en hojas): su caja tras el giro del motor. */
  function cajaEnTira(it, p) {
    var th = Number(it.transformation.rotation) || 0, tx = Number(it.transformation.translation[0]), ty = Number(it.transformation.translation[1]);
    return cajaDe(p.local.map(function (q) { var s = rot(th, { x: q[0], y: q[1] }); return { x: s.x + tx, y: s.y + ty }; }));
  }

  /* Una tira más larga que la hoja se parte: lo que cabe ENTERO en el primer largo de hoja es la
     primera hoja —ya es un acomodo válido, y es la parte más apretada—, y lo que cruza el corte o
     queda después vuelve al motor para la hoja siguiente. Devuelve los índices de cada lado. */
  function partir(solucion, preparadas, largoTira, margen) {
    var porIndice = {};
    preparadas.forEach(function (p) { porIndice[p.indice] = p; });
    var dentro = [], fuera = [];
    solucion.layout.placed_items.forEach(function (it) {
      var c = cajaEnTira(it, porIndice[it.item_id]);
      (c.x1 <= largoTira - (margen || 0) ? dentro : fuera).push(it.item_id);
    });
    return { dentro: dentro, fuera: fuera };
  }

  /* El retazo que queda: lo que la tira no usó del largo de la hoja, de lado a lado. */
  function retazo(largoUsado, hoja, margen) {
    var libre = hoja.largoTira - largoUsado - (margen || 0);
    if (!(libre > 0)) return null;
    return hoja.parada ? { ancho: hoja.ancho, alto: libre } : { ancho: libre, alto: hoja.alto };
  }

  return { SEGUNDOS: SEGUNDOS, segundosPara: segundosPara, girosDe: girosDe, preparar: preparar, entrada: entrada,
           geometriaDeHoja: geometriaDeHoja, colocaciones: colocaciones, partir: partir, retazo: retazo, cajaEnTira: cajaEnTira };
});
