/* El motor sparrow corriendo en un Web Worker de módulo, para que la mesa no se congele mientras
   busca. Recibe {variante, input, seconds, seed, clearance, preset} y devuelve, tal cual, los
   mensajes del puente de sparrow-studio: «candidate» con cada acomodo válido mejor que el
   anterior, «finished» al terminar, y «error». `variante` es «simd» (los navegadores de hoy) o
   «nosimd» (el respaldo); el paquete de cada una está en ../motor/. Detenerlo es terminar el
   Worker: la mesa se queda con el último «candidate». */
self.onmessage = async function (ev) {
  var d = ev.data || {};
  try {
    var motor = await import('../motor/' + (d.variante === 'nosimd' ? 'nosimd' : 'simd') + '/sparrow_web.js');
    await motor.default();
    /* Ojo: el registro interno del motor («solver-log») NO pasa por aquí; su snippet lo manda
       directo con postMessage. Quien escucha este Worker lo ignora. */
    motor.run(d.input, d.seconds, d.seed || '42', d.clearance || 0, d.preset || 'standard', function (json) {
      self.postMessage(JSON.parse(json));
    }, undefined);
  } catch (e) {
    self.postMessage({ type: 'error', message: String((e && e.message) || e) });
  }
};
