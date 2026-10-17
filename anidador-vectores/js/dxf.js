/* ============================================================================
   El DXF del anidador: el acomodo, en el formato que abre el programa del router.

   Lo pidió el taller (audio del 16/10/2026): el SVG llega al programa de corte con cada curva
   partida en tramitos sueltos y encimados —una «A» no es un contorno de fuera y uno de
   dentro, son decenas de líneas— y hay que juntarlas una por una o pasarle «Reparar
   problema». Aquí cada contorno sale como UNA polilínea cerrada: el de fuera de cada pieza y
   cada uno de sus huecos, cada uno la suya, sin tramos repetidos.

   Se escribe en DXF R12 (AC1009) con POLYLINE + VERTEX + SEQEND, y no con el LWPOLYLINE de
   R2000: R12 lo abre cualquier programa de corte, del más viejo al más nuevo, y no pide
   handles ni la sección OBJECTS. En milímetros ($INSUNITS = 4) y con la Y hacia arriba, que
   es como la lee el DXF (en SVG va hacia abajo): sin voltearla, el letrero saldría de espejo.

   Capas: una por hoja (HOJA-1, HOJA-2…), una hoja debajo de otra igual que en el SVG, y el
   contorno de la hoja en CONTORNO-HOJA, en azul, para ponerla en «no cortar» o apagarla.

   Pura y sin DOM, para probarla en node (pruebas/anidador-dxf.mjs). app.js le da los
   contornos ya en milímetros y en su lugar dentro de la hoja (y hacia abajo, como en SVG).
   ============================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnidadorDxf = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CAPA_CONTORNO = 'CONTORNO-HOJA';
  var COLOR_PIEZAS = 7;     // blanco/negro según el fondo del programa
  var COLOR_CONTORNO = 5;   // azul, como el contorno del SVG
  var CASI = 1e-4;          // una diezmilésima de mm: dos puntos más juntos que esto son el mismo

  function capaDeHoja(i) { return 'HOJA-' + (i + 1); }

  /* Cuatro decimales —una diezmilésima de milímetro— y nunca «-0» ni notación científica. */
  function num(n) {
    var v = Math.round(n * 10000) / 10000;
    if (v === 0 || Math.abs(v) < CASI) return '0';
    return String(v);
  }

  /* Un contorno limpio: sin puntos repetidos seguidos ni el último igual al primero (la
     polilínea ya va cerrada: repetirlo dejaría un tramo de largo cero, y hay programas que lo
     marcan como error). Con menos de tres puntos no encierra nada y no se escribe. */
  function limpiar(puntos) {
    var out = [];
    (puntos || []).forEach(function (p) {
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
      var q = out[out.length - 1];
      if (q && Math.abs(q.x - p.x) < CASI && Math.abs(q.y - p.y) < CASI) return;
      out.push({ x: +p.x, y: +p.y });
    });
    while (out.length > 1 && Math.abs(out[0].x - out[out.length - 1].x) < CASI && Math.abs(out[0].y - out[out.length - 1].y) < CASI) out.pop();
    return out.length >= 3 ? out : null;
  }

  /* hojas: [{ ancho, alto, contornos: [[{x,y}, …], …] }] en mm, Y hacia abajo.
     opc.hueco: lo que queda entre una hoja y la siguiente (mm). opc.contorno: si va el de la hoja.
     Devuelve { texto, contornos } —el archivo y cuántas polilíneas de pieza lleva—. */
  function armar(hojas, opc) {
    opc = opc || {};
    var hueco = opc.hueco > 0 ? opc.hueco : 0, conContorno = opc.contorno !== false;
    var ancho = 0, totalH = 0;
    hojas.forEach(function (h, i) { ancho = Math.max(ancho, h.ancho); totalH += h.alto + (i ? hueco : 0); });

    var L = [];
    var par = function (codigo, valor) { L.push(String(codigo), String(valor)); };

    par(0, 'SECTION'); par(2, 'HEADER');
    par(9, '$ACADVER'); par(1, 'AC1009');
    par(9, '$INSBASE'); par(10, 0); par(20, 0); par(30, 0);
    par(9, '$EXTMIN'); par(10, 0); par(20, 0); par(30, 0);
    par(9, '$EXTMAX'); par(10, num(ancho)); par(20, num(totalH)); par(30, 0);
    par(9, '$LIMMIN'); par(10, 0); par(20, 0);
    par(9, '$LIMMAX'); par(10, num(ancho)); par(20, num(totalH));
    par(9, '$INSUNITS'); par(70, 4);        // 4 = milímetros
    par(9, '$MEASUREMENT'); par(70, 1);     // 1 = métrico
    par(0, 'ENDSEC');

    var capas = hojas.map(function (_, i) { return { nombre: capaDeHoja(i), color: COLOR_PIEZAS }; });
    if (conContorno) capas.push({ nombre: CAPA_CONTORNO, color: COLOR_CONTORNO });
    par(0, 'SECTION'); par(2, 'TABLES');
    par(0, 'TABLE'); par(2, 'LTYPE'); par(70, 1);
    par(0, 'LTYPE'); par(2, 'CONTINUOUS'); par(70, 0); par(3, 'Solid line'); par(72, 65); par(73, 0); par(40, '0.0');
    par(0, 'ENDTAB');
    par(0, 'TABLE'); par(2, 'LAYER'); par(70, capas.length);
    capas.forEach(function (c) { par(0, 'LAYER'); par(2, c.nombre); par(70, 0); par(62, c.color); par(6, 'CONTINUOUS'); });
    par(0, 'ENDTAB');
    par(0, 'ENDSEC');

    var piezas = 0;
    function polilinea(capa, puntos) {
      par(0, 'POLYLINE'); par(8, capa); par(66, 1); par(10, 0); par(20, 0); par(30, 0); par(70, 1);   // 70 = 1: cerrada
      puntos.forEach(function (p) { par(0, 'VERTEX'); par(8, capa); par(10, num(p.x)); par(20, num(p.y)); par(30, 0); });
      par(0, 'SEQEND'); par(8, capa);
    }
    par(0, 'SECTION'); par(2, 'ENTITIES');
    var y0 = 0;   // dónde empieza la hoja, de arriba hacia abajo, como en el SVG
    hojas.forEach(function (h, i) {
      var capa = capaDeHoja(i);
      var voltear = function (p) { return { x: p.x, y: totalH - (y0 + p.y) }; };
      if (conContorno) polilinea(CAPA_CONTORNO, [{ x: 0, y: 0 }, { x: h.ancho, y: 0 }, { x: h.ancho, y: h.alto }, { x: 0, y: h.alto }].map(voltear));
      (h.contornos || []).forEach(function (c) {
        var limpio = limpiar(c);
        if (!limpio) return;
        polilinea(capa, limpio.map(voltear));
        piezas++;
      });
      y0 += h.alto + hueco;
    });
    par(0, 'ENDSEC');
    par(0, 'EOF');
    return { texto: L.join('\r\n') + '\r\n', contornos: piezas };
  }

  return { armar: armar, limpiar: limpiar, capaDeHoja: capaDeHoja, CAPA_CONTORNO: CAPA_CONTORNO };
});
