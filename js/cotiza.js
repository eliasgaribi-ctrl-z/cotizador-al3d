/* ============================================================================
   COTIZA — el guion de cotiza.html: la plática del cliente con el agente de ventas.

   Guion CLÁSICO (no módulo), como js/verificar.js y js/taller-tv.js: es de una página suelta,
   no de la plataforma.

   Lo que hace:
     1. Busca el secreto de la conversación: primero en el link (#t=…, para seguir en otro
        teléfono), luego en este navegador. Con secreto, pide la plática (`leer`) y la pinta.
        Sin secreto enseña el saludo y NO llama a nadie: la conversación se abre hasta que el
        cliente escribe de verdad, para que una visita no gaste nada.
     2. Al enviar: si no hay conversación, la abre (`abrir`) y guarda el secreto; luego manda el
        mensaje (`mensaje`) y pinta la respuesta. El agente tarda de 5 a 40 segundos: mientras,
        «escribiendo…» y el botón apagado, para que nadie mande el mismo mensaje dos veces.
     3. Mientras la plática espere a una persona del equipo, pregunta cada minuto (si la pestaña
        está a la vista) y pinta lo nuevo: la nota de Dirección llega sola.

   El secreto viaja SIEMPRE en el cuerpo de la petición, nunca en la dirección. Lo que llega
   se pinta con textContent: es un dato, nunca HTML.
   ============================================================================ */
(function () {
  'use strict';

  /* La función del proyecto de producción. Es la dirección de js/datos/supabase-config.js; pruebas/cotiza.mjs lo vigila. */
  var FUNCION = 'https://gwzfdprdrdudfakjsdxf.supabase.co/functions/v1/agente';
  var CLAVE = 'al3d_cotiza';
  var CADA_MIN = 60 * 1000;
  var ESPERA_MS = 60 * 1000;
  /* El mismo saludo que guarda la función al abrir (_shared/agente.js, SALUDO; el de Elías): aquí se enseña antes de abrir. */
  var SALUDO = '¡Holaa! Soy el asistente de Elías, de Anuncios Luminosos 3D 🚀\n\n¿Cuál es tu nombre y de qué empresa nos contactas?\n\nCuéntame con confianza lo que necesitas o tienes en mente para poderte cotizar.\n\n¿Quieres ver más de nuestros trabajos?\n⬇️⬇️⬇️\nhttps://www.instagram.com/construimagen.gg';
  var DE = { agente: 'AL3D', direccion: 'Equipo AL3D', cliente: 'Tú' };
  var TOKEN = /^[0-9a-f]{64}$/;

  var log = document.getElementById('cot-log');
  var form = document.getElementById('cot-form');
  var texto = document.getElementById('cot-texto');
  var enviar = document.getElementById('cot-enviar');
  var esperando = document.getElementById('cot-esperando');
  var error = document.getElementById('cot-error');
  var nueva = document.getElementById('cot-nueva');

  var token = null, pintados = 0, estado = '', ocupado = false, reloj = null;

  function guardar(t) { token = t; try { if (t) localStorage.setItem(CLAVE, t); else localStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento: dura lo que dure la pestaña */ } }
  function guardado() { try { return localStorage.getItem(CLAVE); } catch (e) { return null; } }

  /* El texto con sus ligas https:// como ligas, armado con nodos: nada de HTML que venga de fuera. */
  function conLigas(p, texto) {
    var partes = String(texto).split(/(https:\/\/[^\s]+)/);
    partes.forEach(function (x, i) {
      if (i % 2) { var a = document.createElement('a'); a.href = x; a.textContent = x; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.appendChild(a); }
      else if (x) p.appendChild(document.createTextNode(x));
    });
  }

  function burbuja(de, cuerpo) {
    var b = document.createElement('div');
    b.className = 'cot-msj cot-' + (de === 'cliente' ? 'yo' : de === 'direccion' ? 'equipo' : 'agente');
    var q = document.createElement('span');
    q.className = 'cot-quien';
    q.textContent = DE[de] || 'AL3D';
    var t = document.createElement('p');
    conLigas(t, cuerpo);
    b.appendChild(q);
    b.appendChild(t);
    log.appendChild(b);
    b.scrollIntoView({ block: 'end' });
  }

  /* La tarjeta de depósito, con el diseño de las autorizadas por Elías (css/cotiza.css, .dep): franja,
     «Depósitos», el título en dos renglones, el logo, los renglones y el pie oscuro con el WhatsApp del
     comprobante. Los datos llegan de la función (con o sin factura) y se escriben con textContent. */
  function el(tag, clase, texto) { var e = document.createElement(tag); if (clase) e.className = clase; if (texto) e.textContent = texto; return e; }
  function tarjeta(c) {
    var vieja = log.querySelector('.dep');
    if (vieja) vieja.parentNode.removeChild(vieja);
    if (!c || !c.filas) return;
    var t = el('section', 'dep');
    t.setAttribute('aria-label', 'Datos para depositar, ' + c.titulo);
    var cab = el('div', 'dep-cab'), txt = el('div');
    txt.appendChild(el('span', 'dep-eti', 'Depósitos'));
    var tit = el('h2', 'dep-tit');
    String(c.titulo).split(' ').forEach(function (w) { tit.appendChild(el('span', '', w)); });
    txt.appendChild(tit);
    var logo = el('img', 'dep-logo'); logo.src = 'logo-al3d.svg'; logo.alt = 'AL3D';
    cab.appendChild(txt); cab.appendChild(logo); t.appendChild(cab);
    var dl = el('dl', 'dep-filas');
    c.filas.forEach(function (f) { var r = el('div'); r.appendChild(el('dt', '', f[0])); r.appendChild(el('dd', '', f[1])); dl.appendChild(r); });
    t.appendChild(dl);
    if (c.nota) t.appendChild(el('p', 'dep-nota', c.nota));
    var pie = el('div', 'dep-pie'), wa = el('div');
    wa.appendChild(el('span', '', 'Envía tu comprobante por WhatsApp'));
    wa.appendChild(el('b', '', c.whatsapp));
    var dir = el('p');
    (c.taller || []).forEach(function (l, i) { if (i) dir.appendChild(document.createElement('br')); dir.appendChild(document.createTextNode(l)); });
    pie.appendChild(wa); pie.appendChild(dir); t.appendChild(pie);
    log.appendChild(t);
    t.scrollIntoView({ block: 'end' });
  }

  function pintar(mensajes) {
    log.textContent = '';
    (mensajes || []).forEach(function (m) { burbuja(m.de, m.texto); });
    pintados = (mensajes || []).length;
  }

  function aviso(msj) { error.textContent = msj || ''; error.hidden = !msj; }

  function ocupar(si) {
    ocupado = si;
    enviar.disabled = si;
    texto.readOnly = si;
    esperando.hidden = !si;
  }

  /* Una llamada a la función. Siempre contesta un objeto: {ok:false, codigo, mensaje} si no hubo red. */
  function llamar(cuerpo) {
    var ctrl = new AbortController();
    var corte = setTimeout(function () { ctrl.abort(); }, ESPERA_MS);
    return fetch(FUNCION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: ctrl.signal })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, codigo: 'SIN_RED', mensaje: 'No hubo conexión. Revisa tu señal e inténtalo otra vez.' }; })
      .then(function (r) { clearTimeout(corte); return r && typeof r === 'object' ? r : { ok: false, codigo: 'DESCONOCIDO', mensaje: 'Algo falló. Inténtalo otra vez.' }; });
  }

  function seguirPreguntando() {
    clearInterval(reloj);
    reloj = null;
    if (estado === 'con_direccion') reloj = setInterval(function () { if (!document.hidden && !ocupado) cargar(); }, CADA_MIN);
  }

  function cargar() {
    if (!token) return Promise.resolve();
    return llamar({ accion: 'leer', token: token }).then(function (r) {
      if (!r.ok) {
        if (r.codigo === 'NO_ENCONTRADO' || r.codigo === 'DATO_INVALIDO') { guardar(null); pintar([]); burbuja('agente', SALUDO); }
        return;
      }
      estado = r.estado || '';
      if ((r.mensajes || []).length !== pintados) pintar(r.mensajes);
      if (r.cuenta) tarjeta(r.cuenta);
      seguirPreguntando();
    });
  }

  function abrirSiHaceFalta() {
    if (token) return Promise.resolve({ ok: true });
    return llamar({ accion: 'abrir' }).then(function (r) {
      if (r.ok && TOKEN.test(r.token || '')) { guardar(r.token); pintados = 1; }   // la función guardó el saludo que ya se ve
      return r;
    });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var t = texto.value.trim();
    if (!t || ocupado) return;
    aviso('');
    ocupar(true);
    burbuja('cliente', t);
    abrirSiHaceFalta().then(function (a) {
      if (!a.ok) return a;
      return llamar({ accion: 'mensaje', token: token, texto: t });
    }).then(function (r) {
      ocupar(false);
      if (!r.ok) {
        log.removeChild(log.lastChild);        // el mensaje no llegó: vuelve a la caja para reenviarlo
        aviso(r.mensaje || 'Algo falló. Inténtalo otra vez.');
        return;
      }
      texto.value = '';
      pintados += 2;
      burbuja('agente', r.respuesta);
      if (r.cuenta) tarjeta(r.cuenta);
      estado = r.estado || '';
      seguirPreguntando();
    });
  });

  /* Enter manda; Mayús+Enter es un renglón nuevo. En el teléfono el teclado no tiene Mayús: ahí se manda con el botón. */
  texto.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && window.matchMedia('(pointer: fine)').matches) { ev.preventDefault(); enviar.click(); }
  });

  nueva.addEventListener('click', function () {
    if (ocupado) return;
    guardar(null);
    estado = '';
    seguirPreguntando();
    pintar([]);
    burbuja('agente', SALUDO);
    aviso('');
    texto.focus();
  });

  /* El secreto del link (#t=…) gana al guardado, y se quita de la barra en cuanto se lee. */
  var m = /(?:^#|&)t=([0-9a-f]{64})(?:&|$)/.exec(location.hash);
  if (m) { guardar(m[1]); history.replaceState(null, '', location.pathname + location.search); }
  else { var g = guardado(); token = TOKEN.test(g || '') ? g : null; }

  if (token) cargar();
  else burbuja('agente', SALUDO);
})();
