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
   prueba pruebas/notario.mjs contra el .gs de verdad.

   Cada ruta contesta con la FORMA de la de verdad (doPost y sus rutaX_ en el .gs), aunque el
   contenido sea de mentiras: un {ok:true} pelón pasaba por bueno donde el teléfono espera
   `texto`, `folios` o `estado`, y la prueba que llegara ahí fallaba lejos de la causa —la IA,
   por ejemplo, acababa en extractJSON('')—. La IA contesta lo que contesta una hoja sin llaves
   (SIN_LLAVE): ninguna prueba de navegador llama a un proveedor de verdad. */
(function () {
  if (!/cotizador\.html$/.test(location.pathname)) return;
  var n = 0;
  var sellos = {};
  var solicitudes = {};   // folio → { estado, nota, vez }, como la pestaña «Solicitudes»
  var vez = 0, vezDelSello = {};   // el orden de los sucesos: un sello solo vale si es posterior a la solicitud
  window.__hoja = { llamadas: [], sellos: sellos, solicitudes: solicitudes };
  var no = function (codigo, mensaje, extra) {
    var r = { ok: false, codigo: codigo, mensaje: mensaje };
    for (var k in (extra || {})) r[k] = extra[k];
    return Promise.resolve(r);
  };
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
        vezDelSello[cuerpo.folio] = ++vez;
        sellos[cuerpo.folio] = sello;
        if (solicitudes[cuerpo.folio] && solicitudes[cuerpo.folio].estado === 'pendiente') {
          solicitudes[cuerpo.folio].estado = 'autorizada';
          solicitudes[cuerpo.folio].nota = cuerpo.nota || solicitudes[cuerpo.folio].nota;
        }
        return Promise.resolve({ ok: true, sello: sello });
      }
      /* rutaSalud_: `ia` dice qué proveedores tienen llave. Ninguno, como en la hoja sin llaves. */
      if (ruta === 'salud') return Promise.resolve({ ok: true, ts: Date.now(), version: 'puente-sheets-7',
        rol: 'direccion', escribibles: [], destino: 'google-sheets', via: 'google', correo: 'Elías',
        ia: { qwen: false, deepseek: false, gemini: false } });
      /* rutaIA_ sin llaves: el mismo codigo y la misma frase que el .gs. */
      if (ruta === 'ia') {
        var nom = { qwen: 'Qwen', deepseek: 'DeepSeek', gemini: 'Gemini' }[cuerpo && cuerpo.prov] || String(cuerpo && cuerpo.prov);
        return no('SIN_LLAVE', nom + ' no tiene llave en la hoja — Dirección la pega en ⚡ AL3D → Llaves de IA',
          { prov: cuerpo && cuerpo.prov, transitorio: false });
      }
      if (ruta === 'solicitar') {
        solicitudes[cuerpo.folio] = { estado: 'pendiente', nota: cuerpo.nota || '', vez: ++vez };
        return Promise.resolve({ ok: true, estado: 'pendiente' });
      }
      if (ruta === 'cancelar') {
        var viva = solicitudes[cuerpo.folio] && solicitudes[cuerpo.folio].estado === 'pendiente';
        if (viva) solicitudes[cuerpo.folio].estado = 'cancelada';
        return Promise.resolve({ ok: true, estado: viva ? 'cancelada' : null });
      }
      if (ruta === 'rechazar') {
        var s = solicitudes[cuerpo.folio];
        if (!s || s.estado !== 'pendiente') return no('NO_ENCONTRADO', 'Esa solicitud ya no está pendiente.');
        s.estado = 'rechazada'; s.nota = cuerpo.nota || '';
        return Promise.resolve({ ok: true, estado: 'rechazada' });
      }
      if (ruta === 'revocar') {
        if (!sellos[cuerpo.folio]) return no('NO_ENCONTRADO', 'Ese folio no tiene una autorización vigente.');
        delete sellos[cuerpo.folio];
        return Promise.resolve({ ok: true });
      }
      /* rutaEstado_: un renglón por folio preguntado. El sello va solo si es POSTERIOR a la última
         solicitud del folio, como en el .gs: uno viejo no le contesta a una solicitud nueva. */
      if (ruta === 'estado') {
        var folios = {};
        ((cuerpo && cuerpo.folios) || []).slice(0, 20).forEach(function (f) {
          var sol = solicitudes[f], se = sellos[f];
          if (se && sol && vezDelSello[f] < sol.vez) se = null;
          folios[f] = { estado: se ? 'autorizada' : (sol ? sol.estado : null), sello: se || null,
                        resolvio: sol && sol.estado !== 'pendiente' ? 'Elías' : '', nota: sol ? sol.nota : '' };
        });
        return Promise.resolve({ ok: true, folios: folios });
      }
      /* Las solicitudes de este mismo teléfono ya están en su cola local (el cotizador las filtra
         por el sufijo del aparato), así que la cola que llega de la hoja va vacía. */
      if (ruta === 'pendientes') return Promise.resolve({ ok: true, solicitudes: [] });
      return no('NO_ENCONTRADO', 'Camino desconocido.');
    }
  };
})();
