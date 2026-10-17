/* ============================================================================
   El motor sparrow, dirigido para la mesa de corte.

   js/motor-sparrow.js traduce; este archivo corre. Pone el motor en Web Workers (el cálculo no
   congela la mesa), elige la variante que el aparato soporta (SIMD, la rápida, o la de respaldo),
   va avisando cada acomodo mejor que el anterior para pintarlo en vivo, y reparte en varias hojas
   cuando las piezas no caben en una.

   Dos cosas lo hacen apretar más que una sola búsqueda (medido con los letreros de Elías):
     · VARIAS BÚSQUEDAS A LA VEZ. El motor es de un hilo; la computadora del taller tiene varios
       núcleos. Se corren varias búsquedas con distinta semilla y se queda la mejor.
     · VARIOS ANCHOS DE FRANJA en los trabajos chicos. El motor acomoda en una franja del ancho de
       la hoja y busca el menor largo; con pocas piezas eso las tiende a lo ancho (La Miga: 1.20 m ×
       18 cm, con 12 % ocupado) y lo que sobra queda en una tira. Probando franjas más angostas
       se elige la que gasta MENOS superficie, y las piezas quedan juntas en una esquina.

   Reparto en varias hojas (cuando ni a todo lo ancho caben en una):
     1. todas las piezas en una franja del ancho de la hoja;
     2. lo que cabe ENTERO en el primer largo de hoja es la hoja 1 —la parte más apretada—;
     3. lo demás vuelve al paso 1 para la hoja siguiente.

   Detener se queda con lo mejor que haya. Solo navegador; lo puro está probado en node
   (pruebas/anidador-sparrow.mjs).
   ============================================================================ */
(function () {
  'use strict';
  var S = window.AnidadorSparrow;
  if (!S) return;

  /* ¿WebAssembly SIMD? El módulo mínimo de wasm-feature-detect. Los navegadores de hoy, sí; un
     iPhone viejo (iOS < 16.4), no. */
  var SIMD = (function () {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch (_) { return false; }
  })();
  var URL_TRABAJADOR = new URL('js/motor-sparrow-trabajador.js', document.baseURI).href;
  /* Cuántas búsquedas a la vez: un núcleo se deja libre para la pantalla; tope de 12. */
  var NUCLEOS = Math.max(1, Math.min(12, ((navigator.hardwareConcurrency || 2) - 1)));
  function disponible() { return typeof Worker === 'function' && typeof WebAssembly === 'object'; }

  /* Una búsqueda del motor. { promesa, detener }; la promesa entrega { solucion } o { error }. */
  function correrUna(preparadas, opc) {
    var w = null, mejor = null, listo = false, resolver;
    var promesa = new Promise(function (r) { resolver = r; });
    function fin(x) { if (listo) return; listo = true; try { if (w) w.terminate(); } catch (_) {} resolver(x); }
    try { w = new Worker(URL_TRABAJADOR, { type: 'module' }); }
    catch (e) { fin({ error: 'Este navegador no puede correr el motor de acomodo: ' + ((e && e.message) || e) }); return { promesa: promesa, detener: function () {} }; }
    w.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.type === 'candidate' && m.solution && (!mejor || m.solution.strip_width < mejor.strip_width)) {
        mejor = m.solution;
        if (opc.alMejorar) { try { opc.alMejorar(mejor); } catch (_) {} }
      } else if (m.type === 'finished') fin({ solucion: mejor });
      else if (m.type === 'error') fin(mejor ? { solucion: mejor } : { error: m.message || 'El motor no pudo acomodar.' });
    };
    w.onerror = function (e) { fin(mejor ? { solucion: mejor } : { error: 'El motor se detuvo: ' + ((e && e.message) || 'error del Worker') }); };
    w.postMessage({ variante: SIMD ? 'simd' : 'nosimd', input: S.entrada(preparadas, { ancho: opc.anchoTira, giros: opc.giros, parada: opc.parada }),
                    seconds: S.segundosPara(opc.segundos || 120), seed: String(opc.semilla || 42), clearance: opc.sep || 0, preset: 'standard' });
    return { promesa: promesa, detener: function () { fin({ solucion: mejor }); } };
  }

  /* Varias búsquedas a la vez sobre las mismas piezas (cada `config` es { anchoTira, semilla }), y
     gana la que gasta menos superficie (anchoTira × largo). `alMejorar(sol, config)` recibe la
     mejor de todas en cuanto alguna mejora. */
  function correrVarias(preparadas, configs, opc) {
    var corridas = [], mejor = null, mejorCfg = null;
    function sup(sol, cfg) { return cfg.anchoTira * sol.strip_width; }
    configs.forEach(function (cfg) {
      corridas.push(correrUna(preparadas, { anchoTira: cfg.anchoTira, semilla: cfg.semilla, giros: opc.giros, parada: opc.parada, sep: opc.sep, segundos: opc.segundos,
        alMejorar: function (sol) {
          if (sol.strip_width > opc.largoMax + 1e-6 && mejor && mejor.strip_width <= opc.largoMax + 1e-6) return;   // lo que no cabe no le gana a lo que sí
          var cabeEste = sol.strip_width <= opc.largoMax + 1e-6, cabeMejor = mejor && mejor.strip_width <= opc.largoMax + 1e-6;
          if (!mejor || (cabeEste && !cabeMejor) || sup(sol, cfg) < sup(mejor, mejorCfg)) {
            mejor = sol; mejorCfg = cfg;
            if (opc.alMejorar) opc.alMejorar(mejor, mejorCfg);
          }
        } }));
    });
    var promesa = Promise.all(corridas.map(function (c) { return c.promesa; })).then(function (rs) {
      if (mejor) return { solucion: mejor, config: mejorCfg };
      var e = rs.filter(function (r) { return r.error; })[0];
      return { error: e ? e.error : 'El motor no entregó ningún acomodo.' };
    });
    return { promesa: promesa, detener: function () { corridas.forEach(function (c) { c.detener(); }); } };
  }

  function areaDe(contorno) {
    var s = 0; for (var i = 0; i < contorno.length; i++) { var a = contorno[i], b = contorno[(i + 1) % contorno.length]; s += a.x * b.y - b.x * a.y; }
    return Math.abs(s) / 2;
  }

  /* Los anchos de franja que se prueban. Con un trabajo que llena la hoja, solo el ancho completo
     (hace falta todo). Con uno chico, también ¾, ½, ⅓ y ¼ del ancho, mientras quepa la pieza más
     ancha (girada a su lado más angosto si hay giros de 90°; sin ellos, el lado que le toca a lo
     ancho de la franja: con la hoja parada la franja va a lo ancho de la hoja, o sea su ancho). */
  function anchosDeFranja(preparadas, hoja, sep, giros) {
    var A = hoja.anchoTira, area = 0, minimo = 0;
    preparadas.forEach(function (p) {
      var xs = p.local.map(function (q) { return q[0]; }), ys = p.local.map(function (q) { return q[1]; });
      var w = Math.max.apply(null, xs), h = Math.max.apply(null, ys);
      area += areaDe(p.local.map(function (q) { return { x: q[0], y: q[1] }; }));
      var fija = String(giros) === '1' || String(giros) === '2';
      var lado = fija ? (hoja.parada ? w : h) : Math.min(w, h);
      if (lado > minimo) minimo = lado;
    });
    var lleno = area / (hoja.anchoTira * hoja.largoTira);
    if (lleno > 0.45) return [A];
    return [1, 0.75, 0.5, 1 / 3, 0.25].map(function (f) { return Math.round(A * f); })
      .filter(function (w, i, arr) { return w >= minimo + 2 * sep + 1 && arr.indexOf(w) === i; });
  }

  /* El acomodo completo. piezas: [{ id, contorno: [{x,y}] }] en mm (el de fuera; los huecos no
     cuentan para acomodar). opc: { ancho, alto, sep, giros, segundos, alMejorar(estado) }.
     Devuelve { promesa, detener }; la promesa entrega
       { hojas: [{ colocaciones: [{ id, x, y, r }], largoUsado, anchoUsado }], retazo, error? }. */
  function acomodar(piezas, opc) {
    var hoja = S.geometriaDeHoja(opc.ancho, opc.alto);
    var actual = null, detenido = false, hechas = [];
    function hojaPara(anchoTira) { var h = {}; for (var k in hoja) h[k] = hoja[k]; h.ancho = hoja.parada ? anchoTira : hoja.ancho; return h; }
    async function bucle() {
      var restantes = S.preparar(piezas);
      for (var vuelta = 0; restantes.length && vuelta < 50; vuelta++) {
        if (detenido) break;
        var esta = restantes;
        var anchos = vuelta === 0 ? anchosDeFranja(esta, hoja, opc.sep || 0, opc.giros) : [hoja.anchoTira];
        if (!anchos.length) anchos = [hoja.anchoTira];
        var porAncho = Math.max(1, Math.floor(NUCLEOS / anchos.length));
        var configs = [];
        anchos.forEach(function (w, i) { for (var s = 0; s < porAncho; s++) configs.push({ anchoTira: w, semilla: 42 + vuelta * 97 + i * 13 + s }); });
        actual = correrVarias(esta, configs, { giros: opc.giros, parada: hoja.parada, sep: opc.sep, segundos: opc.segundos, largoMax: hoja.largoTira,
          alMejorar: function (sol, cfg) {
            if (!opc.alMejorar) return;
            var vista = hechas.concat([{ colocaciones: S.colocaciones(sol, esta, hojaPara(cfg.anchoTira)), largoUsado: sol.strip_width, anchoUsado: cfg.anchoTira, enCurso: true }]);
            opc.alMejorar({ hojas: vista, busquedas: configs.length });
          } });
        var r = await actual.promesa;
        if (r.error || !r.solucion) return { hojas: hechas, error: r.error || 'El motor no entregó ningún acomodo.' };
        if (r.solucion.strip_width <= hoja.largoTira) {
          hechas.push({ colocaciones: S.colocaciones(r.solucion, esta, hojaPara(r.config.anchoTira)), largoUsado: r.solucion.strip_width, anchoUsado: r.config.anchoTira });
          break;
        }
        /* No cupo: lo que cabe entero en el primer largo de hoja se queda; lo demás, otra vuelta. */
        var p = S.partir(r.solucion, esta, hoja.largoTira, 0);
        if (!p.dentro.length) return { hojas: hechas, error: 'Una pieza no cabe en la hoja ni girada.' };
        var dentro = {}; p.dentro.forEach(function (i) { dentro[i] = true; });
        var sol1 = { layout: { placed_items: r.solucion.layout.placed_items.filter(function (it) { return dentro[it.item_id]; }) } };
        hechas.push({ colocaciones: S.colocaciones(sol1, esta, hojaPara(r.config.anchoTira)), largoUsado: hoja.largoTira, anchoUsado: r.config.anchoTira });
        var fuera = {}; p.fuera.forEach(function (i) { fuera[i] = true; });
        var porId = {}; piezas.forEach(function (q) { porId[q.id] = q; });
        restantes = S.preparar(esta.filter(function (q) { return fuera[q.indice]; }).map(function (q) { return porId[q.id]; }));
      }
      var ultima = hechas[hechas.length - 1];
      return { hojas: hechas, retazo: ultima ? retazoDe(ultima) : null };
    }
    /* Lo que sobra en la última hoja, como el rectángulo libre más grande: a lo largo (lo que la
       franja no usó, de lado a lado) o a lo ancho (lo que quedó junto a una franja angosta). */
    function retazoDe(u) {
      var largoLibre = hoja.largoTira - u.largoUsado, anchoLibre = hoja.anchoTira - u.anchoUsado;
      var aLoLargo = { ancho: hoja.anchoTira, largo: largoLibre }, aLoAncho = { ancho: anchoLibre, largo: hoja.largoTira };
      var g = (aLoLargo.ancho * aLoLargo.largo >= aLoAncho.ancho * aLoAncho.largo) ? aLoLargo : aLoAncho;
      if (!(g.ancho > 0 && g.largo > 0)) return null;
      return hoja.parada ? { ancho: g.ancho, alto: g.largo } : { ancho: g.largo, alto: g.ancho };
    }
    var promesa = bucle();
    return { promesa: promesa, detener: function () { detenido = true; if (actual) actual.detener(); } };
  }

  window.AnidadorSparrowMesa = { disponible: disponible, simd: SIMD, nucleos: NUCLEOS, acomodar: acomodar };
})();
