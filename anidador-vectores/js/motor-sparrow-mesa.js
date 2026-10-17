/* ============================================================================
   El motor sparrow, dirigido para la mesa de corte.

   js/motor-sparrow.js traduce; este archivo corre. Pone el motor en un Web Worker (el cálculo no
   congela la mesa), elige la variante que el aparato soporta (SIMD, la rápida, o la de respaldo),
   va avisando cada acomodo mejor que el anterior para pintarlo en vivo, y reparte en varias
   hojas cuando las piezas no caben en una:

     1. corre todas las piezas en una tira del ancho de la hoja;
     2. si la tira cabe en el largo de la hoja, esa es la única hoja;
     3. si no, lo que cabe ENTERO en el primer largo de hoja es la hoja 1 —la parte más apretada
        del acomodo— y lo demás vuelve al paso 1 para la hoja siguiente.

   Detener se queda con lo mejor que haya: termina el Worker y entrega el último acomodo válido.
   Solo navegador; lo puro está probado en node (pruebas/anidador-sparrow.mjs).
   ============================================================================ */
(function () {
  'use strict';
  var S = window.AnidadorSparrow;
  if (!S) return;

  /* ¿Este navegador tiene WebAssembly SIMD? Un módulo mínimo con una instrucción v128 (el mismo
     que usa wasm-feature-detect). Los de hoy sí; un iPhone viejo (iOS < 16.4), no. */
  var SIMD = (function () {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch (_) { return false; }
  })();
  var URL_TRABAJADOR = new URL('js/motor-sparrow-trabajador.js', document.baseURI).href;
  function disponible() { return typeof Worker === 'function' && typeof WebAssembly === 'object'; }

  /* Una corrida del motor sobre `preparadas`. Devuelve { promesa, detener }; la promesa se
     resuelve con el mejor acomodo ({ solucion }) o con { error }. */
  function correrUna(preparadas, opc) {
    var w = null, mejor = null, listo = false, resolver;
    var promesa = new Promise(function (r) { resolver = r; });
    function fin(x) { if (listo) return; listo = true; try { if (w) w.terminate(); } catch (_) {} resolver(x); }
    try { w = new Worker(URL_TRABAJADOR, { type: 'module' }); }
    catch (e) { fin({ error: 'Este navegador no puede correr el motor nuevo: ' + ((e && e.message) || e) }); return { promesa: promesa, detener: function () {} }; }
    w.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.type === 'candidate' && m.solution && (!mejor || m.solution.strip_width < mejor.strip_width)) {
        mejor = m.solution;
        if (opc.alMejorar) { try { opc.alMejorar(mejor); } catch (_) {} }
      } else if (m.type === 'finished') fin({ solucion: mejor });
      else if (m.type === 'error') fin(mejor ? { solucion: mejor } : { error: m.message || 'El motor no pudo acomodar.' });
    };
    w.onerror = function (e) { fin(mejor ? { solucion: mejor } : { error: 'El motor se detuvo: ' + ((e && e.message) || 'error del Worker') }); };
    w.postMessage({ variante: SIMD ? 'simd' : 'nosimd', input: S.entrada(preparadas, { ancho: opc.anchoTira, giros: opc.giros }),
                    seconds: S.segundosPara(opc.segundos || 30), seed: String(opc.semilla || 42), clearance: opc.sep || 0, preset: 'standard' });
    return { promesa: promesa, detener: function () { fin({ solucion: mejor }); } };
  }

  /* El acomodo completo. piezas: [{ id, contorno: [{x,y}] }] en mm (el contorno de fuera; los
     huecos no cuentan para acomodar). opc: { ancho, alto, sep, giros, segundos, alMejorar(estado) }.
     Devuelve { promesa, detener }; la promesa entrega
       { hojas: [{ colocaciones: [{ id, x, y, r }], largoUsado }], retazo, error? }. */
  function acomodar(piezas, opc) {
    var hoja = S.geometriaDeHoja(opc.ancho, opc.alto);
    var actual = null, detenido = false;
    var hechas = [];
    async function bucle() {
      var restantes = S.preparar(piezas);
      for (var vuelta = 0; restantes.length && vuelta < 50; vuelta++) {
        if (detenido) break;
        var esta = restantes;
        actual = correrUna(esta, { anchoTira: hoja.anchoTira, giros: opc.giros, sep: opc.sep, segundos: opc.segundos, semilla: 42 + vuelta,
          alMejorar: function (sol) {
            if (!opc.alMejorar) return;
            /* En vivo se enseña la hoja que se está calculando, con las ya cerradas antes. */
            var vista = hechas.concat([{ colocaciones: S.colocaciones(sol, esta, hoja), largoUsado: sol.strip_width, enCurso: true }]);
            opc.alMejorar({ hojas: vista });
          } });
        var r = await actual.promesa;
        if (r.error || !r.solucion) return { hojas: hechas, error: r.error || 'El motor no entregó ningún acomodo.' };
        if (r.solucion.strip_width <= hoja.largoTira) {
          hechas.push({ colocaciones: S.colocaciones(r.solucion, esta, hoja), largoUsado: r.solucion.strip_width });
          break;
        }
        /* No cupo: lo que cabe entero en el primer largo de hoja se queda; lo demás, otra vuelta. */
        var p = S.partir(r.solucion, esta, hoja.largoTira, 0);
        if (!p.dentro.length) return { hojas: hechas, error: 'Una pieza no cabe en la hoja ni girada.' };
        var dentro = {}; p.dentro.forEach(function (i) { dentro[i] = true; });
        var sol1 = { layout: { placed_items: r.solucion.layout.placed_items.filter(function (it) { return dentro[it.item_id]; }) } };
        hechas.push({ colocaciones: S.colocaciones(sol1, esta, hoja), largoUsado: hoja.largoTira });
        /* Las que siguen vuelven con sus coordenadas originales: se preparan otra vez desde cero. */
        var fueraIds = {}; p.fuera.forEach(function (i) { fueraIds[i] = true; });
        restantes = S.preparar(esta.filter(function (q) { return fueraIds[q.indice]; }).map(function (q) {
          var pieza = null; for (var k = 0; k < piezas.length; k++) if (piezas[k].id === q.id) { pieza = piezas[k]; break; }
          return pieza;
        }));
      }
      var ultima = hechas[hechas.length - 1];
      return { hojas: hechas, retazo: ultima ? S.retazo(ultima.largoUsado, hoja, 0) : null };
    }
    var promesa = bucle();
    return { promesa: promesa, detener: function () { detenido = true; if (actual) actual.detener(); } };
  }

  window.AnidadorSparrowMesa = { disponible: disponible, simd: SIMD, acomodar: acomodar };
})();
