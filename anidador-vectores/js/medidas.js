/* ============================================================================
   Medidas del anidador: de las unidades del archivo a milímetros, y de vuelta.

   El motor (SVGnest) no sabe de unidades: acomoda números. Si el archivo dice
   `width="300mm" viewBox="0 0 1200 400"`, para el motor la pieza mide 1200 de ancho, y
   contra una lámina de 1220 «cabe justo una», cuando en realidad mide 300 mm y caben
   cuatro. Ese era el aviso que traía la primera versión —«las medidas deben ir en las
   mismas unidades que tu archivo SVG»— y es la clase de aviso que se lee una vez y se
   olvida cincuenta: el resultado sale plausible y se descubre en la máquina.

   Aquí vive la aritmética, pura y sin DOM, para que se pueda probar en node
   (pruebas/anidador-medidas.mjs). app.js la usa en el navegador.

   Las tres situaciones:
     · el archivo declara una unidad física (mm, cm, in, pt, pc): se convierte solo;
     · declara px o nada: en SVG «px» no es una medida —Illustrator escribe px a 72 por
       pulgada, el estándar dice 96— así que NO se adivina. Se pide el ancho o el alto
       real del diseño, igual que hace el vectorizador del cotizador;
     · viene del vectorizador con medida real: trae `width="…cm"` y cae en la primera.
   ============================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnidadorMedidas = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MM_POR_UNIDAD = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 };
  /* Las que de verdad miden algo. «px» no está a propósito: ver la cabecera. */
  var UNIDADES_FISICAS = ['mm', 'cm', 'in', 'pt', 'pc'];

  /* "300mm" → {valor:300, unidad:'mm'} · "300" → {valor:300, unidad:''} · "100%" → null */
  function leerLongitud(texto) {
    if (texto === null || texto === undefined) return null;
    var m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(mm|cm|in|pt|pc|px|%)?\s*$/.exec(String(texto));
    if (!m) return null;
    var valor = parseFloat(m[1]);
    if (!isFinite(valor) || valor <= 0) return null;
    var unidad = (m[2] || '').toLowerCase();
    if (unidad === '%') return null;      // un porcentaje no dice cuánto mide nada
    return { valor: valor, unidad: unidad };
  }

  /* "0 0 1200 400" (o con comas) → {x,y,w,h}; cualquier cosa rara → null */
  function leerViewBox(texto) {
    if (!texto) return null;
    var partes = String(texto).trim().split(/[\s,]+/).map(parseFloat);
    if (partes.length !== 4 || partes.some(function (n) { return !isFinite(n); })) return null;
    if (partes[2] <= 0 || partes[3] <= 0) return null;
    return { x: partes[0], y: partes[1], w: partes[2], h: partes[3] };
  }

  /* Lo que el archivo dice de sí mismo. Recibe los tres atributos de la raíz como texto
     (o null) y devuelve:
       viewBox      el lienzo en unidades del archivo, deducido si hacía falta
       mmPorUnidad  cuántos mm es una unidad del viewBox; null si el archivo no lo dice
       origen       'archivo' si la escala salió de él, 'falta' si hay que pedirla
       unidad       la que declaró ('mm', 'px', '' …), para decírselo a quien mira
       anchoMm/altoMm   el lienzo entero en mm, cuando se sabe
       noUniforme   true si ancho y alto dan escalas distintas (se usa la del ancho) */
  function escalaDelArchivo(attrs) {
    attrs = attrs || {};
    var w = leerLongitud(attrs.width), h = leerLongitud(attrs.height);
    var vb = leerViewBox(attrs.viewBox);

    /* Sin viewBox, el lienzo son los números del width/height en su propia unidad. */
    if (!vb && w && h) vb = { x: 0, y: 0, w: w.valor, h: h.valor };

    var fis = null, porAncho = true;
    if (w && UNIDADES_FISICAS.indexOf(w.unidad) >= 0) fis = w;
    else if (h && UNIDADES_FISICAS.indexOf(h.unidad) >= 0) { fis = h; porAncho = false; }

    var k = null, noUniforme = false;
    if (fis && vb) {
      k = (fis.valor * MM_POR_UNIDAD[fis.unidad]) / (porAncho ? vb.w : vb.h);
      /* Si también viene el otro lado con unidad física, se comprueba que cuadre. */
      var otro = porAncho ? h : w;
      if (otro && UNIDADES_FISICAS.indexOf(otro.unidad) >= 0) {
        var k2 = (otro.valor * MM_POR_UNIDAD[otro.unidad]) / (porAncho ? vb.h : vb.w);
        if (Math.abs(k2 - k) / k > 0.005) noUniforme = true;
      }
    }

    return {
      viewBox: vb,
      mmPorUnidad: k,
      origen: k ? 'archivo' : 'falta',
      unidad: fis ? fis.unidad : (w ? w.unidad : (h ? h.unidad : '')),
      anchoMm: (k && vb) ? vb.w * k : null,
      altoMm: (k && vb) ? vb.h * k : null,
      noUniforme: noUniforme
    };
  }

  /* La escala a partir de lo que teclea la persona: «el diseño mide 400 mm de ancho».
     Se refiere a la TINTA —el recuadro de lo dibujado, `bbox`—, no al lienzo, porque eso es
     lo que alguien tiene a la mano: el letrero mide 40 cm, no el artboard. Con uno de los
     dos basta; si vienen los dos, manda el ancho. */
  function escalaPorDiseno(bbox, anchoMm, altoMm) {
    if (!bbox) return null;
    if (anchoMm > 0 && bbox.w > 0) return anchoMm / bbox.w;
    if (altoMm > 0 && bbox.h > 0) return altoMm / bbox.h;
    return null;
  }

  /* ¿Esta pieza cabe en la lámina, con las rotaciones permitidas? Con 1 o 2 rotaciones
     (0° / 180°) la pieza no cambia de ancho y alto; de 4 en adelante también vale girada.
     Es condición necesaria, no suficiente —una pieza puede caber y aun así no encontrar
     lugar entre las demás—, pero es la que detecta el error grueso: un contorno de 1 300 mm
     en una lámina de 1 220. */
  function cabe(pieza, material, rotaciones) {
    var eps = 1e-6;
    var derecha = pieza.w <= material.ancho + eps && pieza.h <= material.alto + eps;
    if (rotaciones >= 4) {
      return derecha || (pieza.h <= material.ancho + eps && pieza.w <= material.alto + eps);
    }
    return derecha;
  }

  /* «1 220 mm», «12.5 mm»: entero de 100 para arriba, un decimal debajo. El espacio de
     millar es el no separable, para que «1 220» no se parta a fin de renglón. */
  function formatoMm(v) {
    if (!(v >= 0) || !isFinite(v)) return '—';
    var txt = v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    var partes = txt.split('.');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    return partes.join('.') + '\u00A0mm';
  }

  function formatoPct(fraccion) {
    if (!(fraccion >= 0) || !isFinite(fraccion)) return '—';
    return Math.round(fraccion * 100) + '\u00A0%';
  }

  return {
    MM_POR_UNIDAD: MM_POR_UNIDAD,
    UNIDADES_FISICAS: UNIDADES_FISICAS,
    leerLongitud: leerLongitud,
    leerViewBox: leerViewBox,
    escalaDelArchivo: escalaDelArchivo,
    escalaPorDiseno: escalaPorDiseno,
    cabe: cabe,
    formatoMm: formatoMm,
    formatoPct: formatoPct
  };
});
