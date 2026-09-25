/* UNA HOJA DE MENTIRAS PARA LAS PRUEBAS DE NAVEGADOR.

   Desde septiembre de 2026 el cotizador no autoriza un precio sin que la hoja lo selle, y la
   identidad de quien autoriza la pone la plataforma a través de `window.AL3D`
   (js/cotizador/notario.js). Las pruebas abren cotizador.html?solo=1, sin plataforma y sin
   Google, así que sin esto ninguna podría llegar a «Autorizada».

   Se inyecta ANTES de que cargue la página —`ctx.addInitScript({path})`— y solo en el
   cotizador: la plataforma pone su propio `AL3D` al montar el marco, y en las pruebas que la
   recorren tiene que ser el suyo. Quien autoriza se llama «Elías», que es el nombre que las
   pruebas de antes tecleaban en el campo que ya no existe.

   Sella en el momento y con lo que le llega, con el mismo cálculo del total que la hoja de
   verdad (cotTotalFinal en puente/hoja-apps-script.gs). No comprueba el catálogo: eso lo
   prueba pruebas/notario.mjs contra el .gs de verdad. */
(function () {
  if (!/cotizador\.html$/.test(location.pathname)) return;
  var n = 0;
  var sellos = {};
  window.__hoja = { llamadas: [], sellos: sellos };
  window.AL3D = {
    identidad: function () { return { correo: 'Elías', rol: 'direccion' }; },
    sesion: function () { return Promise.resolve({ ok: true, correo: 'Elías' }); },
    hablar: function (ruta, cuerpo) {
      window.__hoja.llamadas.push({ ruta: ruta, cuerpo: cuerpo });
      if (ruta === 'autorizar') {
        var c = cuerpo.cotizacion, sub = c.subtotal;
        var neto = c.iva ? sub + sub * 0.16 : sub;
        var p = cuerpo.precioAuth || 0;
        var total = +((p > 0 && Math.abs(p - neto) > 0.01) ? p : neto).toFixed(2);
        n++;
        var codigo = 'PRUE-BA00-' + String(n).padStart(4, '0');
        var sello = { codigo: codigo, correo: 'Elías', ts: new Date().toISOString(),
          /* La huella es la del trabajo en pantalla: es lo que la hoja de verdad calcula con
             las mismas partidas (pruebas/precio-servidor.mjs lo comprueba). */
          huella: typeof huellaTrabajo === 'function' ? huellaTrabajo() : '',
          subCalc: sub, precioAuth: p, itemsAuth: cuerpo.itemsAuth || {}, total: total, nota: cuerpo.nota || '' };
        sellos[cuerpo.folio] = sello;
        return Promise.resolve({ ok: true, sello: sello });
      }
      if (ruta === 'estado') return Promise.resolve({ ok: true, folios: {} });
      if (ruta === 'pendientes') return Promise.resolve({ ok: true, solicitudes: [] });
      return Promise.resolve({ ok: true });
    }
  };
})();
