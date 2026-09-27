/* ============================================================================
   Las piezas compartidas de la interfaz.

   Un solo archivo para las cuatro superficies —cotizador, plataforma, anidador y las páginas
   públicas—, y por eso es un guion CLÁSICO y no un módulo: el cotizador es un puñado de
   guiones clásicos que comparten el ámbito global y llama a toast() mientras carga, y un
   módulo llega diferido. Aquí se cuelga todo de `window.Piezas`; la plataforma, que sí es de
   módulos, lo pide por ese nombre, y js/nucleo/ui.js lo envuelve donde tiene que conservar su
   firma de siempre.

   Hasta aquí había dos toast(), dos copiarTexto() y dos hojas que se bajan con el dedo, una por
   app, y cada arreglo había que hacerlo dos veces: la segunda se olvidaba. La regla es una
   sola implementación por patrón, y esta es esa implementación. Lo que dependa de Q, de las
   partidas, de un proyecto o de la hoja NO vive aquí: esto solo sabe de pantalla.

   Tres reglas que valen para todo lo de abajo, y que no se negocian:
     · Nada se mueve solo. Se mueve porque alguien tocó algo, o es un momento breve que se
       apaga. La única pieza que se mueve sola es el botón de «Cotizar con IA», y no está aquí.
     · Menos movimiento apaga el adorno, no la información: una mecha o un relleno de avance
       se quedan, quietos o en un fundido.
     · Sin manejadores en línea. La plataforma no deja ejecutar guiones en línea (su política
       de contenido no trae 'unsafe-inline'), así que todo se cuelga con addEventListener.

   El estilo de cada pieza vive en css/sistema.css, capa 4, en el bloque «Piezas compartidas»,
   y su apagado en el bloque de movimiento reducido del cierre de la capa 8.
   ============================================================================ */
(function (g) {
  'use strict';
  if (!g || !g.document) return;          // node, en las pruebas que leen este archivo
  const P = g.Piezas || (g.Piezas = {});
  const d = g.document;

  /* ----- Lo que todas comparten ----- */

  /* Menos movimiento, preguntado en el momento: la preferencia se puede cambiar con la app
     abierta, y una respuesta guardada al cargar se queda vieja. */
  P.sinMovimiento = () => { try { return g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  /* Puntero fino: el hover, el «caliente» y lo que se levanta al pasar solo existen con ratón. */
  P.punteroFino = () => { try { return g.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (_) { return false; } };
  /* El mismo escapado que las dos apps, con el apóstrofo incluido. */
  P.esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  P.$ = x => (typeof x === 'string' ? d.getElementById(x) : x);

  /* ==========================================================================
     1 · AVISOS Y BOTONES QUE DICEN LO QUE PASA
     ========================================================================== */

  /* Lo que esta sección tiene: el aviso emergente (pieza 12) y su mecha, el botón que dice que
     está trabajando (14), el «Deshacer» en el mismo botón (15), el rótulo que cambia sin
     brincar (23), mantener presionado para confirmar (5), la palomita que se dibuja (6), el
     glifo de estado y el sello (24), copiar con confirmación en el botón y la región que habla.

     Dos cosas las comparten casi todas y por eso van primero:
       · Un reloj que se PAUSA. La mecha de un aviso, la de un «Deshacer» y la del paro del
         anidador son la misma promesa —«esto dura lo que ves»— y se rompe igual en los tres
         lados: el vendedor se va a WhatsApp a pegar los datos y a la vuelta el «Deshacer» ya
         caducó. El reloj de verdad es un setTimeout que lleva la cuenta de lo que falta; la
         línea que se consume es su dibujo, sincronizado en cada pausa. No al revés: una
         animación sobre un elemento que alguien repinta con innerHTML deja de avisar cuando
         termina, y un aviso que nunca se cierra es peor que uno que se cierra antes.
       · Una guardia de clic en la fase de captura del documento. Los botones del cotizador
         traen su onclick en el marcado y los de la plataforma contestan por delegación; en
         los dos casos, mientras el botón está ocupado —trabajando, ofreciendo «Deshacer» o
         esperando a que lo mantengan— el clic tiene que significar otra cosa o nada. Parar el
         evento en la captura del documento llega antes que el onclick del propio botón y que
         cualquier delegación, en todos los navegadores, sin tocar el código de cada pantalla. */

  const ahora = () => (g.performance && g.performance.now ? g.performance.now() : Date.now());
  /* Al volver de una pausa quedan por lo menos 1.5 s. Es el número que ya usaban los dos
     toast(): quien suelta el dedo a 200 ms del final no alcanzaba ni a leer el botón. */
  const RESTA_MIN = 1500;

  function _reloj(ms, alTerminar) {
    let total = Math.max(0, +ms || 0), resta = total, t0 = ahora(), id = 0, vivo = true;
    const razones = new Set();
    const fin = () => { id = 0; if (!vivo) return; vivo = false; resta = 0; if (alTerminar) alTerminar(); };
    const correr = () => { t0 = ahora(); g.clearTimeout(id); id = g.setTimeout(fin, Math.max(0, resta)); };
    correr();
    return {
      get total() { return total; },
      get vivo() { return vivo; },
      get pausado() { return razones.size > 0; },
      resta() { return !vivo ? 0 : razones.size ? resta : Math.max(0, resta - (ahora() - t0)); },
      pausar(r) {
        if (!vivo) return false;
        const ya = razones.size > 0; razones.add(r || 'x');
        if (ya) return false;
        g.clearTimeout(id); id = 0; resta = Math.max(0, resta - (ahora() - t0));
        return true;
      },
      seguir(r) {
        if (!vivo || !razones.delete(r || 'x') || razones.size) return false;
        resta = Math.max(Math.min(RESTA_MIN, total), resta);
        correr();
        return true;
      },
      reiniciar(ms2) {
        if (ms2 != null) total = Math.max(0, +ms2 || 0);
        resta = total; vivo = true;
        g.clearTimeout(id); id = 0;
        if (!razones.size) correr();
      },
      cancelar() { vivo = false; g.clearTimeout(id); id = 0; },
    };
  }

  const _MANTENER = new WeakMap(), _DESHACER = new WeakMap();
  let _guardiaPuesta = false;
  function _guardia() {
    if (_guardiaPuesta) return;
    _guardiaPuesta = true;
    d.addEventListener('click', e => {
      const t = e.target && e.target.closest ? e.target : (e.target && e.target.parentElement);
      if (!t || !t.closest) return;
      const para = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      const ocupado = t.closest('.con-estado[data-estado="trabajando"],[data-espera]');
      if (ocupado) { para(); return; }
      const des = t.closest('[data-deshacer]');
      if (des) { para(); const h = _DESHACER.get(des); if (h) h.deshacer(); return; }
      const man = t.closest('[data-mantener]');
      if (man) { para(); const h = _MANTENER.get(man); if (h) h._clic(e); }
    }, true);
  }

  /* ¿De qué color se llena este botón? Se mide en vez de adivinarlo por la clase, porque la
     plataforma y el anidador tienen botones propios, y hay tres casos que no se parecen:
       · 'claro'  — letra oscura sobre fondo claro (un botón fantasma de día): el relleno es un
                    tinte suave y la letra oscura sigue encima con su contraste completo.
       · 'oscuro' — letra clara sobre un botón de COLOR (el azul, el verde, el degradado de la
                    capa de vidrio): el relleno tiene que oscurecer, porque aclarar un azul que da
                    4,95:1 con blanco encima lo baja de 4,5.
       · 'luz'    — letra clara sobre una superficie honda (un botón fantasma de noche, o uno
                    transparente sobre la barra marina): oscurecer ahí no se ve, así que el relleno
                    aclara un poco, y la letra clara sobre un marino aclarado sigue arriba de 10:1.
     Un fondo transparente cuenta como superficie honda solo si la letra es clara: es el caso de
     los botones del encabezado marino del teléfono. */
  const _lum = rgb => {
    const l = rgb.slice(0, 3).map(v => { v = v / 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * l[0] + .7152 * l[1] + .0722 * l[2];
  };
  const _rgb = s => { const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; };
  P._relleno = function (el) {
    try {
      const s = g.getComputedStyle(el), letra = _rgb(s.color);
      if (!letra || _lum(letra) <= .4) return 'claro';
      if (s.backgroundImage && s.backgroundImage !== 'none') return 'oscuro';
      const f = _rgb(s.backgroundColor);
      return f && f[3] > .5 && _lum(f) > .04 ? 'oscuro' : 'luz';
    } catch (_) { return 'claro'; }
  };

  /* Contenido para un rótulo: un texto va por textContent (es un dato y no se escapa a mano);
     {html} es marcado de confianza —una palomita, un icono del sprite— que arma quien llama;
     un nodo se mueve tal cual. */
  function _poner(el, c) {
    el.textContent = '';
    if (c == null) return el;
    if (typeof c === 'object' && c.nodeType) el.appendChild(c);
    else if (typeof c === 'object' && 'html' in c) el.innerHTML = String(c.html);
    else el.textContent = String(c);
    return el;
  }

  /* ----- Lo que habla -----
     Las dos regiones que nunca se ocultan (#vozStatus y #vozAlert, en las cuatro superficies;
     el anidador solo tiene la primera y ahí va también lo urgente). El textContent='' y la
     escritura en el cuadro siguiente hacen que la región cuente el mensaje como inserción nueva
     aunque se repita: sin eso, dos «Copiado» seguidos se oyen una sola vez. Es la misma función
     que la voz() de cada app, y la usan las piezas que no saben en qué app están. */
  P.voz = function (msg, urgente) {
    const el = (urgente && d.getElementById('vozAlert')) || d.getElementById('vozStatus');
    if (!el) return;
    el.textContent = '';
    const poner = () => { el.textContent = String(msg == null ? '' : msg); };
    if (g.requestAnimationFrame) g.requestAnimationFrame(poner); else g.setTimeout(poner, 16);
  };

  /* «6 s», «1 min 05 s». Con {falta:true} redondea hacia arriba, que es como se cuenta lo que
     queda: una mecha que dice «0 s» y sigue ahí un segundo más se lee como que se trabó. */
  P.reloj = function (ms, o) {
    const x = Math.max(0, +ms || 0) / 1000;
    const s = (o && o.falta) ? Math.ceil(x - 1e-6) : Math.floor(x);
    if (s < 60) return s + ' s';
    const m = Math.floor(s / 60), r = s % 60;
    return m + ' min' + (r ? ' ' + String(r).padStart(2, '0') + ' s' : '');
  };

  /* ----- La mecha -----
     P.mecha(contenedor, {ms, alTerminar, segundos}) → { pausar(razón), seguir(razón),
     reiniciar(ms), cancelar(quitar), resta(), el, vivo }

     Un filete de 2 px al pie del contenedor que se consume en exactamente `ms`, dibujado con
     transform:scaleX —nada de width— y pausado junto con su reloj. Las razones de pausa se
     cuentan: el dedo encima Y la pestaña oculta son dos, y soltar el dedo con la app todavía en
     segundo plano no la reanuda. `reiniciar()` la rellena de golpe: es lo que pide el paro del
     anidador cada vez que el acomodo mejora (A4).

     Con menos movimiento la línea se queda quieta —sigue diciendo «esto tiene reloj»— y, si se
     le da un elemento en `segundos`, los segundos que faltan se escriben con letra, una vez por
     segundo (H6). */
  P.mecha = function (cont, o) {
    cont = P.$(cont); o = o || {};
    let linea = null, anim = null, tic = 0;
    if (cont) {
      linea = d.createElement('i');
      linea.className = 'mecha';
      linea.setAttribute('aria-hidden', 'true');
      cont.classList.add('con-mecha');
      cont.appendChild(linea);
    }
    const quieta = P.sinMovimiento() || !linea || typeof linea.animate !== 'function';
    const seg = o.segundos ? P.$(o.segundos) : null;
    const pintarSeg = () => { if (seg) seg.textContent = P.reloj(r.resta(), { falta: true }); };
    const dibujar = () => {
      if (quieta) return;
      if (anim) anim.cancel();
      const tot = Math.max(1, r.total);
      anim = linea.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
        { duration: tot, easing: 'linear', fill: 'forwards' });
      anim.currentTime = Math.max(0, tot - r.resta());
      if (r.pausado) anim.pause();
    };
    const r = _reloj(o.ms, () => {
      g.clearInterval(tic); tic = 0; pintarSeg();
      if (typeof o.alTerminar === 'function') o.alTerminar();
    });
    const arrancarSeg = () => { g.clearInterval(tic); tic = 0; if (seg) { pintarSeg(); tic = g.setInterval(pintarSeg, 1000); } };
    dibujar(); arrancarSeg();
    return {
      el: linea,
      get vivo() { return r.vivo; },
      resta: () => r.resta(),
      pausar(razon) { if (r.pausar(razon) && anim) anim.pause(); },
      seguir(razon) {
        if (!r.seguir(razon) || !anim) return;
        anim.currentTime = Math.max(0, r.total - r.resta());
        anim.play();
      },
      reiniciar(ms) { r.reiniciar(ms); dibujar(); arrancarSeg(); },
      cancelar(quitar) {
        r.cancelar(); g.clearInterval(tic); tic = 0;
        if (anim) { anim.cancel(); anim = null; }
        if (quitar !== false && linea && linea.parentNode) linea.remove();
      },
    };
  };

  /* ==========================================================================
     Pieza 12 · El aviso con mecha, pausa, deslizar y pila
     ==========================================================================
     P.aviso(msg, {tipo, dur, accion, pila, clave, voz}) → { cerrar(), vivo, el }

     Es el cuerpo de los tres toast() —cotizador, plataforma y anidador—, que ahora solo le
     pasan sus cuatro parámetros. Hasta aquí había un solo #toast y un solo temporizador, y el
     segundo aviso reescribía al primero en el mismo tick: el error del notario «el total no es
     el que selló la hoja» —el aviso que impide mandar un PDF con un número y un QR con otro—
     lo tapaba el «✓ … autorizó» de la línea siguiente, y el «Abrir plataforma» de la venta se
     lo comía el aviso de campos rechazados. Esa es la falla 2 del brief, y esto la cierra:

       · #toast deja de ser EL aviso y pasa a ser la PILA: un contenedor que conserva su id, su
         clase y su lugar en el documento —así siguen valiendo las reglas que lo suben sobre el
         dock, sobre el pie del escalador (.scaler-modal-bg.show+.toast) y sobre el panel de la
         plataforma— y que lleva hasta DOS avisos (.toast-uno).
       · Cada aviso tiene prioridad: error (2) > con botón (1) > informativo (0). Un aviso
         nuevo ocupa el lugar de uno informativo —esos sí se reemplazan, como siempre—, o del
         que sea el mismo aviso (mismo texto, misma `clave`, o la misma función de su botón:
         «Deshacer» de deshacerBorrado() solo sabe deshacer el ÚLTIMO borrado, y dos botones
         vivos con la misma función deshacían el segundo desde el primero). Un error y uno con
         botón no se pisan nunca: si no hay lugar, el nuevo ESPERA y entra cuando uno se va.
       · La mecha es su reloj (P.mecha): 2 px que duran exactamente `dur`. Se congela con el
         dedo, el cursor o el foco encima —la corrección de accesibilidad de verdad: quien llega
         con el tabulador a «Deshacer» ya no lo pierde— y con la app en segundo plano.
       · Se descarta deslizándolo hacia abajo (40 px, o un deslizón de más de 0,11 px/ms en el
         último tramo, los números de las hojas del teléfono) y con Escape si tiene el foco.

     Lo que no cambia, porque es contrato (docs/SISTEMA-DE-DISENO.md §6.2): con botón dura 8 s
     como mínimo, el texto va por textContent, al tocar el botón el aviso se va y la función
     corre en el mismo toque, y cada aviso se dice en la región que habla —lo urgente, en la
     asertiva— en cuanto se pide, aunque espere su turno para verse. Un aviso que se repite tal
     cual no vuelve a entrar ni parpadea, y si no trae botón tampoco reinicia su tiempo: un
     aviso que se pide en cada tecla se iría nunca. Si trae botón sí se rearma: es un acto
     nuevo, y su ventana de Deshacer empieza ahora.

     En el teléfono los avisos van al ancho del dock y encima de él, nunca sobre el botón
     principal; en la computadora, abajo a la izquierda. Eso lo dice la hoja (css/sistema.css,
     `.toast`); aquí solo se decide qué se ve. */
  const AVISO_MAX = 2, AVISO_COLA = 6, AVISO_DUR = 2600, AVISO_MIN_ACCION = 8000;
  const _accionValida = a => !!(a && a.label && typeof a.fn === 'function');

  P.aviso = function (msg, o) {
    o = o || {};
    const accion = _accionValida(o.accion) ? o.accion : null;
    const n = {
      msg: String(msg == null ? '' : msg),
      tipo: o.tipo === 'ok' || o.tipo === 'err' ? o.tipo : '',
      label: accion ? String(accion.label) : '', fn: accion ? accion.fn : null,
      clave: o.clave ? String(o.clave) : '',
      dur: P.aviso.duracion(o.dur, accion), pedido: ahora(), cerrado: false,
      el: null, msgEl: null, actEl: null, segEl: null, mecha: null, pila: null,
    };
    n.prio = P.aviso.prioridad(n);
    _mango(n);
    if (o.voz !== false) P.voz(n.msg + (n.label ? ' — ' + n.label + ' disponible' : ''), n.tipo === 'err');
    const cont = P.$(o.pila || 'toast');
    if (!cont) { n.cerrado = true; return _mango(n); }
    const pila = _pila(cont);
    n.pila = pila;
    _podar(pila);
    const dec = P.aviso.decidir(pila.vivos, n, AVISO_MAX);
    if (dec.que === 'reusar' || dec.que === 'reemplazar') {
      const v = pila.vivos[dec.i];
      const reloj = dec.que === 'reemplazar' || !!n.fn;
      Object.assign(v, { msg: n.msg, tipo: n.tipo, label: n.label, fn: n.fn, clave: n.clave, prio: n.prio, dur: n.dur });
      if (dec.que === 'reemplazar') { v.ficha = null; v.mango = null; _mango(v); }
      _pintarUno(v, reloj);
      if (!P.sinMovimiento() && v.el.animate)
        v.el.animate([{ opacity: .55 }, { opacity: 1 }], { duration: 160, easing: 'cubic-bezier(.23,1,.32,1)' });
      return v.mango;
    }
    if (dec.que === 'agregar') { _agregar(pila, n); return n.mango; }
    /* Sin lugar: espera. En la cola también vale «el mismo aviso se reemplaza», y de los
       informativos solo espera el último —uno que llega tarde ya no informa nada—. */
    const j = P.aviso.decidir(pila.cola, n, Infinity);
    if (j.que === 'reusar' || j.que === 'reemplazar') { const c = pila.cola[j.i]; c.cerrado = true; pila.cola.splice(j.i, 1); }
    pila.cola.push(n);
    while (pila.cola.length > AVISO_COLA) {
      const menos = pila.cola.slice().sort((a, b) => a.prio - b.prio || a.pedido - b.pedido)[0];
      menos.cerrado = true; pila.cola.splice(pila.cola.indexOf(menos), 1);
    }
    return _mango(n);
  };

  /* La lógica pura, a la vista para las pruebas de node (pruebas/piezas-avisos.mjs). */
  P.aviso.prioridad = a => (a && a.tipo === 'err') ? 2 : (a && (a.fn || _accionValida(a.accion))) ? 1 : 0;
  P.aviso.duracion = (dur, accion) => {
    let v = +dur;
    if (!(v > 0) || !isFinite(v)) v = AVISO_DUR;
    if (accion && v < AVISO_MIN_ACCION) v = AVISO_MIN_ACCION;
    return v;
  };
  /* Qué hacer con el aviso `n` frente a los que ya están: {que, i}.
       reusar     → es el mismo (texto, tipo y botón): se queda en su lugar.
       reemplazar → toma el lugar del i-ésimo: misma clave, misma función de botón, o un
                    informativo, que siempre cede.
       agregar    → hay lugar.
       esperar    → dos que no se pisan: entra cuando uno se vaya. */
  P.aviso.decidir = (vivos, n, max) => {
    const iguales = (a, b) => a.msg === b.msg && a.tipo === b.tipo && a.label === b.label;
    let i;
    if (n.clave && (i = vivos.findIndex(v => v.clave === n.clave)) >= 0) return { que: iguales(vivos[i], n) ? 'reusar' : 'reemplazar', i };
    if ((i = vivos.findIndex(v => iguales(v, n))) >= 0) return { que: 'reusar', i };
    if (n.fn && (i = vivos.findIndex(v => v.fn === n.fn)) >= 0) return { que: 'reemplazar', i };
    for (i = vivos.length - 1; i >= 0; i--) if (vivos[i].prio === 0) return { que: 'reemplazar', i };
    return vivos.length < (max == null ? AVISO_MAX : max) ? { que: 'agregar', i: vivos.length } : { que: 'esperar', i: -1 };
  };
  /* Lo que se ve, para las pruebas y para quien necesite saber si ya se avisó. */
  P.aviso.vivos = pilaId => {
    const cont = P.$(pilaId || 'toast'), pila = cont && _PILAS.get(cont);
    return pila ? pila.vivos.map(v => ({ msg: v.msg, tipo: v.tipo, prio: v.prio, label: v.label, resta: v.mecha ? v.mecha.resta() : 0 })) : [];
  };
  /* Quitar todos de golpe, sin salida: para una pantalla que se va entera. */
  P.aviso.limpiar = pilaId => {
    const cont = P.$(pilaId || 'toast'), pila = cont && _PILAS.get(cont);
    if (!pila) return;
    pila.cola.forEach(c => { c.cerrado = true; }); pila.cola.length = 0;
    pila.vivos.slice().forEach(v => { v.cerrado = true; if (v.mecha) v.mecha.cancelar(); if (v.el) v.el.remove(); });
    pila.vivos.length = 0; pila.sobre.clear();
    /* Las pausas de quien ya no está: un cursor que estaba encima de un aviso quitado nunca
       dispara su pointerleave, y la pila se quedaría congelada para el siguiente. */
    ['puntero', 'foco', 'arrastre'].forEach(r => _pausaPila(pila, r, false));
    cont.classList.remove('show');
  };

  const _PILAS = new WeakMap();
  function _pila(cont) {
    let p = _PILAS.get(cont);
    if (p) return p;
    p = { cont, vivos: [], cola: [], razones: new Set(), sobre: new Set() };
    _PILAS.set(cont, p);
    /* Si alguien vació el contenedor a mano (un innerHTML='' de antes), empieza limpio. */
    cont.querySelectorAll(':scope > :not(.toast-uno)').forEach(x => x.remove());
    cont.addEventListener('focusin', () => _pausaPila(p, 'foco', true));
    cont.addEventListener('focusout', e => { if (!e.relatedTarget || !cont.contains(e.relatedTarget)) _pausaPila(p, 'foco', false); });
    d.addEventListener('visibilitychange', () => _pausaPila(p, 'oculto', d.hidden));
    if (d.hidden) p.razones.add('oculto');
    return p;
  }
  function _pausaPila(p, razon, si) {
    const antes = p.razones.size > 0;
    if (si) p.razones.add(razon); else p.razones.delete(razon);
    const ahoraSi = p.razones.size > 0;
    if (antes === ahoraSi) return;
    p.vivos.forEach(v => { if (v.mecha) ahoraSi ? v.mecha.pausar('pila') : v.mecha.seguir('pila'); });
  }
  function _podar(p) {
    for (let i = p.vivos.length - 1; i >= 0; i--) {
      const v = p.vivos[i];
      if (!v.el || !v.el.isConnected) { v.cerrado = true; if (v.mecha) v.mecha.cancelar(); p.vivos.splice(i, 1); p.sobre.delete(v.el); }
    }
    if (!p.sobre.size) _pausaPila(p, 'puntero', false);
    if (!p.cont.contains(d.activeElement)) _pausaPila(p, 'foco', false);
    if (!p.vivos.length) p.cont.classList.remove('show');
  }
  /* El mango que devuelve P.aviso() es del AVISO, no del nodo: cuando otro aviso toma su lugar
     en la pila, el mango viejo muere (vivo=false, cerrar() no hace nada) y el nuevo recibe uno
     propio. Si no, quien guardó el de «Mandando la venta…» para quitarlo al llegar la respuesta
     cerraría el «Venta registrada · Abrir plataforma» que ya ocupa ese lugar. */
  function _mango(n) {
    if (n.mango) return n.mango;
    const ficha = n.ficha = {};
    n.mango = {
      get vivo() { return !n.cerrado && n.ficha === ficha; },
      get el() { return n.ficha === ficha ? n.el : null; },
      cerrar() { if (n.ficha === ficha) _cerrar(n); },
    };
    return n.mango;
  }

  function _crearUno(n) {
    const el = d.createElement('div');
    n.el = el;
    n.msgEl = d.createElement('span'); n.msgEl.className = 'toast-msg';
    el.appendChild(n.msgEl);
    const p = n.pila;
    el.addEventListener('pointerenter', () => { p.sobre.add(el); _pausaPila(p, 'puntero', true); });
    el.addEventListener('pointerleave', () => { p.sobre.delete(el); if (!p.sobre.size) _pausaPila(p, 'puntero', false); });
    el.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || n.cerrado) return;
      e.preventDefault(); e.stopPropagation();
      _cerrar(n);
    });
    _deslizable(n);
    return el;
  }
  /* Pinta el contenido de un aviso en su nodo. Con `reloj`, su mecha vuelve a empezar. */
  function _pintarUno(n, reloj) {
    const el = n.el, quieto = P.sinMovimiento();
    el.classList.add('toast-uno');
    el.classList.toggle('ok', n.tipo === 'ok');
    el.classList.toggle('err', n.tipo === 'err');
    el.dataset.prio = String(n.prio);
    n.msgEl.textContent = n.msg;
    const conSeg = quieto && !!n.fn;
    if (conSeg && !n.segEl) {
      n.segEl = d.createElement('span'); n.segEl.className = 'toast-seg'; n.segEl.setAttribute('aria-hidden', 'true');
      el.insertBefore(n.segEl, n.msgEl.nextSibling);
    } else if (!conSeg && n.segEl) { n.segEl.remove(); n.segEl = null; }
    if (n.fn && !n.actEl) {
      const b = d.createElement('button');
      b.type = 'button'; b.className = 'toast-act';
      /* La función se lee al tocar, no al pintar: un aviso reusado trae la suya, nueva. */
      b.addEventListener('click', () => { const fn = n.fn; _cerrar(n); if (fn) fn(); });
      n.actEl = b;
      el.insertBefore(b, n.mecha && n.mecha.el && n.mecha.el.parentNode === el ? n.mecha.el : null);
    } else if (!n.fn && n.actEl) { n.actEl.remove(); n.actEl = null; }
    if (n.actEl) n.actEl.textContent = n.label;
    if (reloj || !n.mecha) {
      if (n.mecha) n.mecha.cancelar();
      n.mecha = P.mecha(el, { ms: n.dur, segundos: n.segEl, alTerminar: () => _cerrar(n) });
      if (n.pila.razones.size) n.mecha.pausar('pila');
    }
  }
  function _tops(p) { return new Map(p.vivos.map(v => [v.el, v.el.getBoundingClientRect().top])); }
  /* Cuando uno entra o se va, el otro no brinca: se desliza desde donde estaba (FLIP, solo
     transform). Es la razón de que no se anime grid-template-rows, que es layout en cada cuadro. */
  function _flip(p, antes) {
    if (P.sinMovimiento()) return;
    p.vivos.forEach(v => {
      const t0 = antes.get(v.el);
      if (t0 == null || !v.el.animate) return;
      const dy = t0 - v.el.getBoundingClientRect().top;
      if (Math.abs(dy) >= 1) v.el.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }],
        { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' });
    });
  }
  function _agregar(p, n) {
    n.pila = p;
    const antes = _tops(p);
    p.cont.appendChild(_crearUno(n));
    p.vivos.push(n);
    _pintarUno(n, true);
    p.cont.classList.add('show');
    _flip(p, antes);
  }
  function _cerrar(n, desdeY) {
    if (n.cerrado) return;
    n.cerrado = true;
    const p = n.pila;
    if (!p) return;
    const iCola = p.cola.indexOf(n);
    if (iCola >= 0) { p.cola.splice(iCola, 1); return; }
    const i = p.vivos.indexOf(n);
    if (i >= 0) p.vivos.splice(i, 1);
    if (n.mecha) n.mecha.cancelar(false);
    const el = n.el;
    if (!el) return;
    const teniaFoco = el.contains(d.activeElement);
    el.classList.add('sale');
    if (desdeY != null) { el.style.transform = 'translateY(' + (desdeY + 28) + 'px)'; el.style.opacity = '0'; }
    const quitar = () => {
      if (!el.parentNode) return;
      const antes = _tops(p);
      el.remove();
      p.sobre.delete(el);
      if (!p.sobre.size) _pausaPila(p, 'puntero', false);
      if (teniaFoco || !p.cont.contains(d.activeElement)) _pausaPila(p, 'foco', false);
      _flip(p, antes);
      _deLaCola(p);
      if (!p.vivos.length) p.cont.classList.remove('show');
    };
    g.setTimeout(quitar, 160);
  }
  function _deLaCola(p) {
    while (p.vivos.length < AVISO_MAX && p.cola.length) {
      p.cola.sort((a, b) => b.prio - a.prio || a.pedido - b.pedido);
      const n = p.cola.shift();
      if (n.cerrado) continue;
      if (n.prio === 0 && ahora() - n.pedido > n.dur) { n.cerrado = true; continue; }
      _agregar(p, n);
    }
  }
  /* Deslizar hacia abajo para quitarlo. El gesto arranca pasados 6 px y solo si es más vertical
     que horizontal; hacia arriba cede con resistencia, como una hoja del sistema. Mientras el
     dedo lo lleva, la pila está en pausa. */
  function _deslizable(n) {
    const el = n.el;
    let y0 = 0, x0 = 0, id = null, dy = 0, activo = false, pts = [];
    el.addEventListener('pointerdown', e => {
      if (n.cerrado || !e.isPrimary || e.button > 0 || (e.target.closest && e.target.closest('button,a'))) return;
      id = e.pointerId; y0 = e.clientY; x0 = e.clientX; dy = 0; activo = false; pts = [[e.timeStamp, 0]];
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id || n.cerrado) return;
      const bruto = e.clientY - y0;
      if (!activo) {
        if (Math.abs(bruto) < 6 || Math.abs(bruto) < Math.abs(e.clientX - x0)) return;
        activo = true;
        try { el.setPointerCapture(id); } catch (_) {}
        el.classList.add('arrastrando');
        _pausaPila(n.pila, 'arrastre', true);
      }
      dy = bruto >= 0 ? bruto : -Math.sqrt(-bruto) * 3;
      pts.push([e.timeStamp, bruto]);
      while (pts.length > 2 && e.timeStamp - pts[0][0] > 100) pts.shift();
      el.style.transform = 'translateY(' + dy + 'px)';
      el.style.opacity = String(Math.max(.25, 1 - Math.max(0, dy) / 140));
    });
    const soltar = e => {
      if (e.pointerId !== id) return;
      id = null;
      if (!activo) return;
      activo = false;
      el.classList.remove('arrastrando');
      _pausaPila(n.pila, 'arrastre', false);
      const a = pts[0], b = pts[pts.length - 1];
      const v = (a && b && b[0] > a[0]) ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
      if (dy > 40 || (dy > 12 && v > 0.11)) { _cerrar(n, dy); return; }
      el.style.transform = ''; el.style.opacity = '';
    };
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  }

  /* ==========================================================================
     Pieza 23 · El rótulo que cambia sin brincar
     ==========================================================================
     P.cambiarRotulo(el, contenido) → true si cambió
     P.rotuloTemporal(el, contenido, {ms, sacudir}) → { volver() }
     P.rotuloHTML(aHtml, bHtml) → cadena, para quien pinta con innerHTML
     P.sacudir(el)

     El texto de un botón o de un renglón se reescribía de golpe con innerHTML, en cada tecla
     —el dock del cotizador, «Falta el teléfono ›», la pista del escalador—, y con la vista en
     la foto o en el cliente un cambio de instrucción pasaba sin verse. Aquí los dos rótulos
     viven en la MISMA celda de una rejilla (.rotulo): el viejo sale hacia arriba y el nuevo
     entra desde abajo en 180 ms, solo con opacity y transform —la barra del escalador está
     sobre un lienzo que se repinta con el dedo—, y mientras se cruzan el ancho es el del más
     largo, así que nada de alrededor se mueve.

     `cambiarRotulo` compara ANTES de tocar el DOM y no hace nada si el texto es el mismo:
     renderMobileBar() corre en cada tecla, y animar un rótulo que no cambió sería que el
     botón «respire» con cada letra. `rotuloTemporal` es el «✓ Copiado» o el «Falta el
     teléfono» de 1.5 s: el segundo rótulo se queda en su celda después de volver, invisible y
     callado, para que el botón conserve el ancho del más largo y no brinque ni al ir ni al
     volver. Quien pinta con innerHTML puede declararlos los dos desde el principio con
     P.rotuloHTML('Copiar', '✓ Copiado') y el botón nace con su ancho final.

     Con menos movimiento el cambio es inmediato (H18, H28). La sacudida (±4 px, tres veces)
     es la de «falta un dato» y la del botón que falló; con menos movimiento no hay. */
  function _envolver(el) {
    let r = el.querySelector(':scope > .rotulo');
    if (r && r.querySelector(':scope > .rotulo-a')) return r;
    r = d.createElement('span'); r.className = 'rotulo';
    const a = d.createElement('span'); a.className = 'rotulo-a';
    while (el.firstChild) a.appendChild(el.firstChild);
    r.appendChild(a); el.appendChild(r);
    return r;
  }
  P.cambiarRotulo = function (el, contenido) {
    el = P.$(el); if (!el) return false;
    const r = _envolver(el);
    r.querySelectorAll(':scope > .rotulo-sale').forEach(x => x.remove());
    const a = r.querySelector(':scope > .rotulo-a');
    const nuevo = _poner(d.createElement('span'), contenido);
    if (nuevo.innerHTML === a.innerHTML) return false;
    if (P.sinMovimiento() || !el.isConnected) { a.replaceChildren(...nuevo.childNodes); return true; }
    nuevo.className = 'rotulo-a rotulo-entra';
    if (a.hasAttribute('aria-hidden')) nuevo.setAttribute('aria-hidden', 'true');
    a.className = 'rotulo-sale'; a.setAttribute('aria-hidden', 'true');
    r.insertBefore(nuevo, a);
    void nuevo.offsetWidth;
    nuevo.classList.remove('rotulo-entra');
    g.setTimeout(() => a.remove(), 220);
    return true;
  };
  const _TEMPORALES = new WeakMap();
  P.rotuloTemporal = function (el, contenido, o) {
    el = P.$(el); o = o || {};
    const nada = { volver() {} };
    if (!el) return nada;
    const r = _envolver(el);
    const a = r.querySelector(':scope > .rotulo-a');
    let b = r.querySelector(':scope > .rotulo-b');
    if (!b) { b = d.createElement('span'); b.className = 'rotulo-b'; b.setAttribute('aria-hidden', 'true'); r.appendChild(b); }
    _poner(b, contenido);
    const previo = _TEMPORALES.get(el);
    if (previo) g.clearTimeout(previo.t);
    const volver = () => {
      const s = _TEMPORALES.get(el);
      if (s !== estado) return;
      g.clearTimeout(estado.t);
      _TEMPORALES.delete(el);
      r.classList.remove('alt');
      b.setAttribute('aria-hidden', 'true');
      const a2 = r.querySelector(':scope > .rotulo-a');
      if (a2) a2.removeAttribute('aria-hidden');
    };
    const estado = { t: 0, volver };
    _TEMPORALES.set(el, estado);
    a.setAttribute('aria-hidden', 'true'); b.removeAttribute('aria-hidden');
    r.classList.add('alt');
    if (o.sacudir) P.sacudir(el);
    const ms = o.ms == null ? 1500 : +o.ms;
    if (ms > 0 && isFinite(ms)) estado.t = g.setTimeout(volver, ms);
    return { volver };
  };
  P.rotuloHTML = (aHtml, bHtml) => '<span class="rotulo"><span class="rotulo-a">' + (aHtml || '') + '</span>' +
    (bHtml != null ? '<span class="rotulo-b" aria-hidden="true">' + bHtml + '</span>' : '') + '</span>';
  P.sacudir = function (el) {
    el = P.$(el);
    if (!el || P.sinMovimiento()) return;
    el.classList.remove('sacudida');
    void el.offsetWidth;
    el.classList.add('sacudida');
    const fin = () => el.classList.remove('sacudida');
    el.addEventListener('animationend', fin, { once: true });
    g.setTimeout(fin, 500);
  };

  /* ==========================================================================
     Pieza 6 · La palomita que se dibuja
     ==========================================================================
     P.palomitaHTML({circulo, dibujar, clase}) → cadena
     P.palomita(contenedor, opciones) → el <svg>
     P.dibujar(el) → vuelve a dibujar la palomita o la marca que haya en `el`

     Un trazo SVG de pathLength 1 que va de dashoffset 1 a 0 en 420 ms, UNA vez. Se dibuja solo
     lo que nace: la clase .dibuja la lleva la palomita recién puesta (por omisión), y quien
     repinta una lista entera con innerHTML pinta las que ya estaban con {dibujar:false}; si no,
     todas se volverían a dibujar con cada tecla. Con círculo es la marca llena (sellada,
     venta registrada, renglón coincidente); sin él es el trazo en el color del texto, para ir
     dentro de un botón («✓ Copiado»). Con menos movimiento aparece ya dibujada. */
  P.palomitaHTML = function (o) {
    o = o || {};
    const cls = 'palomita' + (o.circulo ? ' con-circulo' : '') + (o.dibujar === false ? '' : ' dibuja') + (o.clase ? ' ' + o.clase : '');
    return '<svg class="' + P.esc(cls) + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      (o.circulo ? '<circle cx="12" cy="12" r="12"/><path d="M6.8 12.4l3.4 3.4 7-7.4" pathLength="1"/>'
                 : '<path d="M4.8 12.8l4.6 4.6L19.4 7.2" pathLength="1"/>') + '</svg>';
  };
  P.palomita = function (cont, o) {
    const t = d.createElement('span');
    t.innerHTML = P.palomitaHTML(o);
    const svg = t.firstChild;
    cont = P.$(cont);
    if (cont) cont.appendChild(svg);
    return svg;
  };
  P.dibujar = function (el) {
    el = P.$(el); if (!el) return;
    const m = el.matches && el.matches('.palomita,.marca-estado') ? el : el.querySelector('.palomita,.marca-estado');
    if (!m) return;
    m.classList.remove('dibuja');
    void m.getBoundingClientRect();
    m.classList.add('dibuja');
  };

  /* ==========================================================================
     Pieza 14 · El botón que está trabajando lo dice
     ==========================================================================
     P.trabajando(btn, trabajo, {verbo, tau, ok, mal, reintentar, volver, hermanos, voz})
       → Promise<{ok:true, valor} | {ok:false, error}>   (nunca se rechaza)
     P.estadoBoton(btn) → { estado, trabajando(o), avance(p, texto), ok(texto, o), mal(motivo, o), reiniciar() }

     Sellar puede tardar 30 s, registrar la venta 15, traer la hoja veinte vueltas, y el botón
     solo cambiaba a «Sellando en la hoja…» con opacidad .8 —se veía apagado— o no cambiaba en
     absoluto y se podía volver a tocar. Aquí el botón tocado se vuelve la ficha de lo que pasa:

       · data-estado="trabajando": un relleno que avanza, el verbo y un reloj que corre
         («Sellando · 6 s»). El relleno no finge saber cuánto falta: se acerca al 90 % con
         0,9·(1 − e^(−t/τ)), con τ = lo que suele tardar, y solo llega al final cuando la
         respuesta llega. Si quien llama SÍ sabe cuánto va (la página 3 de 20), avance(p) lo
         pinta tal cual. El botón pasa a aria-busy y aria-disabled —no `disabled`: el foco se
         queda donde estaba— y la guardia se come los toques mientras tanto.
       · data-estado="ok": se lava en verde con su palomita y el texto de éxito («Sellada ·
         A1B2»), y a los 3.5 s regresa a su rótulo.
       · data-estado="mal": tiembla y dice «No contestó · Reintentar» sin cerrar nada. Tocarlo
         vuelve a correr SU propio manejador, que es el reintento: la pieza no necesita saber
         cuál es.

     El ancho no brinca: min-width del rótulo original durante todo el recorrido. El texto
     blanco se queda en 4.5:1 también sobre el relleno a medias, porque en un botón de color
     el relleno OSCURECE (ver P._relleno). Con menos movimiento no hay relleno que avance: el
     reloj con letra dice lo mismo (F7). */
  P.avance = (t, tau) => 0.9 * (1 - Math.exp(-Math.max(0, +t || 0) / Math.max(1, +tau || 1)));
  /* La misma curva en cuadros para una animación de WAAPI: nueve tramos rectos hasta 6τ, que es
     donde ya va en 89.8 % y se queda. */
  P.curvaAvance = function (tau) {
    tau = +tau > 0 ? +tau : 4000;
    const k = [0, .25, .5, 1, 1.5, 2, 3, 4, 6];
    return { duracion: 6 * tau, cuadros: k.map(x => ({ offset: x / 6, transform: 'scaleX(' + P.avance(x * tau, tau).toFixed(4) + ')' })) };
  };
  const _ESTADOS = new WeakMap();
  P.estadoBoton = function (btn) {
    btn = P.$(btn);
    if (!btn) return null;
    let h = _ESTADOS.get(btn);
    if (h) return h;
    const s = { nodos: null, minW: '', aria: null, w: 0, relleno: 'claro', t0: 0, iv: 0, anim: null, volverT: 0,
      verbo: '', texto: '', tau: 4000, p: null, hermanos: [], rel: null, tEl: null, relojEl: null };
    const nuestro = () => !!btn.querySelector(':scope > .estado-t');
    const parar = () => {
      g.clearInterval(s.iv); s.iv = 0;
      g.clearTimeout(s.volverT); s.volverT = 0;
      if (s.anim) { try { s.anim.cancel(); } catch (_) {} s.anim = null; }
    };
    const soltarHermanos = () => {
      s.hermanos.forEach(([x, a]) => { x.removeAttribute('data-espera'); a == null ? x.removeAttribute('aria-disabled') : x.setAttribute('aria-disabled', a); });
      s.hermanos = [];
    };
    const tomar = () => {
      if (s.nodos == null) {
        s.nodos = [...btn.childNodes];
        s.minW = btn.style.minWidth;
        s.aria = btn.getAttribute('aria-disabled');
        s.w = btn.getBoundingClientRect().width;
        s.relleno = P._relleno(btn);
      }
      btn.classList.add('con-estado');
      btn.dataset.relleno = s.relleno;
      if (s.w) btn.style.minWidth = Math.ceil(s.w) + 'px';
    };
    const pintarReloj = () => {
      if (!btn.isConnected) { parar(); return; }
      if (s.tEl) s.tEl.textContent = s.texto || s.verbo;
      if (s.relojEl) s.relojEl.textContent = ' · ' + P.reloj(ahora() - s.t0);
    };
    const escalaActual = () => {
      try { const m = /matrix\(([-\d.e]+)/.exec(g.getComputedStyle(s.rel).transform); return m ? +m[1] : 0; } catch (_) { return 0; }
    };
    h = {
      get estado() { return btn.dataset.estado || ''; },
      trabajando(o) {
        o = o || {};
        _guardia(); parar(); tomar();
        btn.dataset.estado = 'trabajando';
        btn.setAttribute('aria-busy', 'true');
        btn.setAttribute('aria-disabled', 'true');
        s.verbo = o.verbo || 'Trabajando'; s.texto = ''; s.tau = +o.tau > 0 ? +o.tau : 4000; s.t0 = ahora(); s.p = null;
        s.rel = d.createElement('span'); s.rel.className = 'trabajo-relleno'; s.rel.setAttribute('aria-hidden', 'true');
        s.tEl = d.createElement('span'); s.tEl.className = 'estado-t';
        s.relojEl = d.createElement('span'); s.relojEl.className = 'trabajo-reloj';
        btn.replaceChildren(s.rel, s.tEl, s.relojEl);
        pintarReloj();
        s.iv = g.setInterval(pintarReloj, 1000);
        if (!P.sinMovimiento() && s.rel.animate) {
          const c = P.curvaAvance(s.tau);
          s.anim = s.rel.animate(c.cuadros, { duration: c.duracion, fill: 'forwards' });
        }
        soltarHermanos();
        (o.hermanos || []).forEach(x => {
          x = P.$(x); if (!x || x === btn) return;
          s.hermanos.push([x, x.getAttribute('aria-disabled')]);
          x.setAttribute('aria-disabled', 'true'); x.setAttribute('data-espera', '');
        });
        return h;
      },
      avance(p, texto) {
        if (btn.dataset.estado !== 'trabajando' || !s.rel) return h;
        const v = Math.max(0, Math.min(1, +p || 0));
        if (texto != null) s.texto = String(texto);
        pintarReloj();
        if (P.sinMovimiento() || !s.rel.animate) { if (s.anim) { s.anim.cancel(); s.anim = null; } s.rel.style.transform = 'scaleX(' + v + ')'; s.p = v; return h; }
        const desde = s.p != null || s.anim ? escalaActual() : 0;
        if (s.anim) s.anim.cancel();
        s.anim = s.rel.animate([{ transform: 'scaleX(' + desde + ')' }, { transform: 'scaleX(' + v + ')' }],
          { duration: 200, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
        s.p = v;
        return h;
      },
      ok(texto, o) {
        o = o || {};
        parar(); tomar(); soltarHermanos();
        btn.dataset.estado = 'ok';
        btn.removeAttribute('aria-busy');
        s.aria == null ? btn.removeAttribute('aria-disabled') : btn.setAttribute('aria-disabled', s.aria);
        const t = d.createElement('span'); t.className = 'estado-t'; t.textContent = texto == null ? 'Listo' : String(texto);
        btn.replaceChildren(P.palomita(null, { dibujar: true }), t);
        s.rel = s.tEl = s.relojEl = null;
        const ms = o.volver == null ? 3500 : +o.volver;
        if (ms > 0) s.volverT = g.setTimeout(() => h.reiniciar(), ms);
        return h;
      },
      mal(motivo, o) {
        o = o || {};
        parar(); tomar(); soltarHermanos();
        btn.dataset.estado = 'mal';
        btn.removeAttribute('aria-busy');
        s.aria == null ? btn.removeAttribute('aria-disabled') : btn.setAttribute('aria-disabled', s.aria);
        const t = d.createElement('span'); t.className = 'estado-t';
        t.textContent = (motivo == null ? 'No se pudo' : String(motivo)) + ' · ' + (o.reintentar || 'Reintentar');
        btn.replaceChildren(t);
        s.rel = s.tEl = s.relojEl = null;
        P.sacudir(btn);
        return h;
      },
      reiniciar() {
        parar(); soltarHermanos();
        /* Si mientras tanto la pantalla repintó el botón, lo que hay adentro ya es suyo y no se
           le encima el rótulo guardado. */
        if (s.nodos && nuestro()) btn.replaceChildren(...s.nodos);
        if (s.nodos) {
          btn.style.minWidth = s.minW;
          s.aria == null ? btn.removeAttribute('aria-disabled') : btn.setAttribute('aria-disabled', s.aria);
        }
        btn.removeAttribute('aria-busy');
        delete btn.dataset.estado; delete btn.dataset.relleno;
        btn.classList.remove('con-estado');
        s.nodos = null; s.rel = s.tEl = s.relojEl = null;
        return h;
      },
    };
    _ESTADOS.set(btn, h);
    return h;
  };
  P.trabajando = function (btn, trabajo, o) {
    o = o || {};
    const h = P.estadoBoton(btn);
    if (h && h.estado === 'trabajando') return Promise.resolve({ ok: false, ocupado: true, error: new Error('El botón ya está trabajando') });
    if (h) h.trabajando(o);
    let pr;
    try { pr = Promise.resolve(typeof trabajo === 'function' ? trabajo(h) : trabajo); } catch (e) { pr = Promise.reject(e); }
    return pr.then(valor => {
      const t = typeof o.ok === 'function' ? o.ok(valor) : o.ok;
      if (h) { if (t === false) h.reiniciar(); else h.ok(t == null ? 'Listo' : t, { volver: o.volver }); }
      if (o.voz !== false && t) P.voz(t);
      return { ok: true, valor };
    }, error => {
      const m = typeof o.mal === 'function' ? o.mal(error) : o.mal;
      const motivo = m == null ? 'No se pudo' : m;
      if (h) h.mal(motivo, { reintentar: o.reintentar });
      if (o.voz !== false) P.voz(motivo + ' · ' + (o.reintentar || 'Reintentar'), true);
      return { ok: false, error };
    });
  };

  /* ==========================================================================
     Pieza 15 · «Deshacer» en el mismo botón, con mecha
     ==========================================================================
     P.deshacerEnBoton(btn, {ms, rotulo, alConfirmar, alDeshacer, voz}) → { deshacer(), confirmar(), vivo, resta() }

     «Ya se armó», «Recibí lo de la lista», «Volver a acomodar desde cero»: un toque escribía al
     instante, el renglón saltaba de grupo y no había vuelta. Aquí el botón que hizo la acción
     se vuelve «Deshacer» y una mecha se consume durante `ms` (5 s por omisión). La acción de
     verdad es alConfirmar y corre AL APAGARSE la mecha, no al tocar: mientras corre, el
     renglón no se mueve y deshacer no escribe nada. Tocarlo otra vez —con el dedo, el ratón o
     Enter— llama a alDeshacer y el botón regresa. La mecha se pausa con el cursor o el foco
     encima y con la app en segundo plano; si la página se va (pagehide) con la mecha viva, lo
     hecho se confirma: nadie tocó «Deshacer».

     El rótulo se cruza con la pieza 23, así que el botón conserva el ancho del más largo. Mientras
     ofrece deshacer, la guardia de clic le quita el toque a su onclick y a la delegación de la
     pantalla: el mismo botón ya no vuelve a hacer lo que acaba de hacer. Con menos movimiento
     la mecha se queda quieta y los segundos van con letra. Nunca para lo que no se deshace
     (el cruce de corte saca material): eso lo decide quien llama. */
  P.deshacerEnBoton = function (btn, o) {
    btn = P.$(btn); o = o || {};
    const previo = btn && _DESHACER.get(btn);
    if (previo) previo.confirmar();
    let hecho = false;
    const mango = { get vivo() { return !hecho; }, resta: () => 0, deshacer() {}, confirmar() {} };
    const terminar = confirmado => {
      if (hecho) return;
      hecho = true;
      if (btn) {
        mecha && mecha.cancelar();
        quitar.forEach(f => f());
        rot && rot.volver();
        if (seg) seg.remove();
        btn.removeAttribute('data-deshacer');
        btn.style.minWidth = minW;
        _DESHACER.delete(btn);
      }
      const f = confirmado ? o.alConfirmar : o.alDeshacer;
      if (typeof f === 'function') f();
    };
    mango.deshacer = () => terminar(false);
    mango.confirmar = () => terminar(true);
    if (!btn) { terminar(true); return mango; }
    _guardia();
    const ms = +o.ms > 0 ? +o.ms : 5000;
    const rotulo = o.rotulo || 'Deshacer';
    const minW = btn.style.minWidth;
    btn.style.minWidth = Math.ceil(btn.getBoundingClientRect().width) + 'px';
    const rot = P.rotuloTemporal(btn, rotulo, { ms: 0 });
    let seg = null;
    if (P.sinMovimiento()) {
      seg = d.createElement('span'); seg.className = 'deshacer-seg'; seg.setAttribute('aria-hidden', 'true');
      btn.appendChild(seg);
    }
    btn.setAttribute('data-deshacer', '');
    const mecha = P.mecha(btn, { ms, segundos: seg, alTerminar: () => terminar(true) });
    const quitar = [];
    const oir = (x, ev, f) => { x.addEventListener(ev, f); quitar.push(() => x.removeEventListener(ev, f)); };
    oir(btn, 'pointerenter', () => mecha.pausar('puntero'));
    oir(btn, 'pointerleave', () => mecha.seguir('puntero'));
    oir(btn, 'focus', () => mecha.pausar('foco'));
    oir(btn, 'blur', () => mecha.seguir('foco'));
    oir(d, 'visibilitychange', () => d.hidden ? mecha.pausar('oculto') : mecha.seguir('oculto'));
    oir(g, 'pagehide', () => terminar(true));
    /* El foco y el cursor que YA estaban —los del toque que hizo la acción— no la pausan: si
       no, con el ratón quieto encima la mecha no correría nunca. La pausa es para quien
       VUELVE al botón. */
    if (d.hidden) mecha.pausar('oculto');
    if (o.voz !== false) P.voz(typeof o.voz === 'string' ? o.voz : rotulo + ' disponible por ' + P.reloj(ms, { falta: true }));
    mango.resta = () => mecha.resta();
    _DESHACER.set(btn, mango);
    return mango;
  };

  /* ==========================================================================
     Pieza 5 · Mantener presionado para confirmar
     ==========================================================================
     P.mantener(btn, {ms, alConfirmar, tono, aviso, pista, otraVez, textoHecho}) → { reiniciar(), destruir(), progreso }

     Para lo que no tiene vuelta —Autorizar, Borrar partida, «Sí, borrar todo», Rechazar,
     quitar del tablero, restaurar un respaldo—: un toque no alcanza, hay que sostener 1.2 s.
     El relleno avanza de izquierda a derecha y el texto de encima cambia de color JUSTO donde
     pasa: son dos capas con el mismo rótulo, y la de color se descubre con dos translate
     opuestos —la ventana se corre hacia la derecha y su contenido hacia la izquierda—, así que
     nunca queda rojo sobre rojo y no se anima nada que no sea transform. Soltar antes regresa
     el relleno en 180 ms y no pasa nada; un toque de menos de 250 ms no es un intento, es alguien
     que no sabía, y se le dice cómo (en `aviso` si se da, o en el propio botón por 1.8 s).

     Teclado: Enter o Espacio sostenidos hacen lo mismo que el dedo; Escape suelta. Y el
     equivalente para quien no puede sostener —un lector de pantalla que activa con doble
     toque, un control por voz—: un clic que no viene de un puntero (detail = 0) arma la
     confirmación y dice «Otra vez para confirmar»; un segundo dentro de 5 s confirma.

     El avance NO se apaga con menos movimiento: es información, no adorno. Lo que se apaga es
     el encogerse al apretar. La acción va en alConfirmar: mientras el botón esté bajo esta
     pieza, su onclick y la delegación de la pantalla no reciben el clic (la guardia), y
     destruir() se lo devuelve. Llamarla otra vez sobre el mismo botón no duplica oyentes:
     actualiza las opciones y reinicia. */
  P.mantener = function (btn, o) {
    btn = P.$(btn); o = o || {};
    if (!btn) return null;
    const previo = _MANTENER.get(btn);
    /* Otra vez sobre el mismo botón: si su marcado sigue siendo el de la pieza, se actualizan las
       opciones y se reinicia, sin oyentes nuevos. Si la pantalla le reescribió el rótulo —el
       confirmar() del cotizador hace `si.textContent = o.si` en cada pregunta—, lo de antes ya no
       existe: se sueltan sus oyentes y se arma de nuevo sobre el rótulo que tiene ahora. */
    if (previo && previo._intacto()) { previo._opciones(o); previo.reiniciar(); return previo; }
    if (previo) previo._soltar();
    _guardia();
    let op = o;
    const base = d.createElement('span'); base.className = 'mantener-base';
    while (btn.firstChild) base.appendChild(btn.firstChild);
    const capa = d.createElement('span'); capa.className = 'mantener-capa'; capa.setAttribute('aria-hidden', 'true');
    const capaT = d.createElement('span'); capaT.className = 'mantener-capa-t';
    capa.appendChild(capaT);
    const sv = d.createElement('span'); sv.className = 'solo-voz';
    btn.append(base, capa, sv);
    btn.classList.add('mantener');
    btn.setAttribute('data-mantener', '');
    const ariaAntes = btn.getAttribute('aria-disabled');
    const bloqueado = () => btn.disabled || btn.getAttribute('aria-disabled') === 'true';
    const tono = () => op.tono === 'azul' || op.tono === 'ok' ? op.tono : 'mal';
    const copiar = () => {
      capaT.replaceChildren(...[...base.childNodes].map(x => x.cloneNode(true)));
      capaT.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
      if (op.textoHecho && estado === 'hecho') capaT.textContent = op.textoHecho;
      sv.textContent = ' — ' + (op.pista || 'mantén presionado para confirmar');
      /* Otra vez las marcas: confirmar() reescribe `si.className` en cada pregunta. */
      btn.classList.add('mantener');
      btn.setAttribute('data-mantener', '');
      btn.dataset.tono = tono();
      btn.dataset.relleno = P._relleno(btn);
    };
    let estado = 'quieto', desde = 0, hacia = 0, dur = 0, t0 = 0, anims = [], finT = 0, sosT0 = 0, armado = 0, pistaR = null;
    const ms = () => (+op.ms > 0 ? +op.ms : 1200);
    const tx = v => 'translateX(' + ((v - 1) * 100).toFixed(3) + '%)';
    const txi = v => 'translateX(' + ((1 - v) * 100).toFixed(3) + '%)';
    const progreso = () => dur > 0 ? desde + (hacia - desde) * Math.min(1, (ahora() - t0) / dur) : hacia;
    const ir = (a, du) => {
      const p = progreso();
      anims.forEach(x => { try { x.cancel(); } catch (_) {} });
      anims = [];
      desde = p; hacia = a; dur = Math.max(0, du); t0 = ahora();
      g.clearTimeout(finT); finT = 0;
      if (dur > 0 && capa.animate) {
        anims = [capa.animate([{ transform: tx(desde) }, { transform: tx(hacia) }], { duration: dur, fill: 'forwards' }),
                 capaT.animate([{ transform: txi(desde) }, { transform: txi(hacia) }], { duration: dur, fill: 'forwards' })];
      } else { capa.style.transform = tx(hacia); capaT.style.transform = txi(hacia); }
      if (hacia === 1) finT = g.setTimeout(completo, dur);
    };
    const completo = () => {
      if (estado === 'hecho') return;
      estado = 'hecho'; armado = 0;
      btn.classList.remove('manteniendo');
      btn.classList.add('hecho');
      btn.setAttribute('aria-disabled', 'true');
      if (op.textoHecho) capaT.textContent = op.textoHecho;
      if (op.aviso) { const a = P.$(op.aviso); if (a) a.textContent = ''; }
      if (typeof op.alConfirmar === 'function') op.alConfirmar();
    };
    const pista = () => {
      const txt = op.pista ? op.pista.charAt(0).toUpperCase() + op.pista.slice(1) : 'Mantén presionado para confirmar';
      const a = op.aviso ? P.$(op.aviso) : null;
      if (a) a.textContent = txt;
      else { pistaR = P.rotuloTemporal(base, txt, { ms: 1800 }); P.sacudir(btn); }
      P.voz(txt);
    };
    const empezar = () => {
      if (estado !== 'quieto' || bloqueado()) return;
      if (pistaR) { pistaR.volver(); pistaR = null; }
      estado = 'sosteniendo'; sosT0 = ahora();
      btn.classList.add('manteniendo');
      ir(1, ms() * (1 - progreso()));
    };
    const soltar = salio => {
      if (estado !== 'sosteniendo') return;
      estado = 'quieto';
      btn.classList.remove('manteniendo');
      const corto = ahora() - sosT0 < 250;
      ir(0, 180 * progreso());
      if (!salio && corto) pista();
    };
    let rect = null, pid = null;
    const quitar = [];
    const oir = (x, ev, f, opc) => { x.addEventListener(ev, f, opc); quitar.push(() => x.removeEventListener(ev, f, opc)); };
    oir(btn, 'pointerdown', e => {
      if (!e.isPrimary || e.button > 0) return;
      pid = e.pointerId;
      try { btn.setPointerCapture(pid); } catch (_) {}
      rect = btn.getBoundingClientRect();
      empezar();
    });
    oir(btn, 'pointerup', e => { if (e.pointerId === pid) { pid = null; soltar(false); } });
    oir(btn, 'pointercancel', e => { if (e.pointerId === pid) { pid = null; soltar(true); } });
    oir(btn, 'pointermove', e => {
      if (estado !== 'sosteniendo' || e.pointerId !== pid || !rect) return;
      const m = 10;
      if (e.clientX < rect.left - m || e.clientX > rect.right + m || e.clientY < rect.top - m || e.clientY > rect.bottom + m) soltar(true);
    });
    oir(btn, 'keydown', e => {
      if (e.key === 'Escape' && estado === 'sosteniendo') { e.preventDefault(); e.stopPropagation(); soltar(true); return; }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) empezar(); }
    });
    oir(btn, 'keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); soltar(false); } });
    oir(btn, 'blur', () => soltar(true));
    oir(btn, 'contextmenu', e => e.preventDefault());   // el menú de pulsación larga de Android
    oir(g, 'blur', () => soltar(true));
    oir(d, 'visibilitychange', () => { if (d.hidden) soltar(true); });
    copiar();
    const h = {
      get progreso() { return progreso(); },
      get estado() { return estado; },
      _opciones(o2) { op = o2 || {}; },
      _intacto: () => base.parentNode === btn && capa.parentNode === btn,
      _soltar() {
        anims.forEach(x => { try { x.cancel(); } catch (_) {} });
        g.clearTimeout(finT);
        quitar.forEach(f => f());
        btn.classList.remove('hecho', 'manteniendo');
        ariaAntes == null ? btn.removeAttribute('aria-disabled') : btn.setAttribute('aria-disabled', ariaAntes);
        _MANTENER.delete(btn);
      },
      _clic(e) {
        /* Un clic de puntero ya lo contestaron pointerdown/pointerup; solo el que no trae
           puntero —detail 0: lector de pantalla, control por voz— es la otra forma de confirmar. */
        if (!e || e.detail !== 0 || estado !== 'quieto' || bloqueado()) return;
        if (armado && ahora() - armado < 5000) { armado = 0; ir(1, 200); return; }
        armado = ahora();
        const txt = op.otraVez || 'Otra vez para confirmar';
        pistaR = P.rotuloTemporal(base, txt, { ms: 5000 });
        P.voz(txt);
      },
      reiniciar() {
        anims.forEach(x => { try { x.cancel(); } catch (_) {} });
        anims = []; g.clearTimeout(finT); finT = 0;
        estado = 'quieto'; desde = hacia = dur = 0; armado = 0;
        capa.style.transform = ''; capaT.style.transform = '';
        btn.classList.remove('hecho', 'manteniendo');
        ariaAntes == null ? btn.removeAttribute('aria-disabled') : btn.setAttribute('aria-disabled', ariaAntes);
        if (pistaR) { pistaR.volver(); pistaR = null; }
        copiar();
        return h;
      },
      destruir() {
        if (!h._intacto()) { h._soltar(); btn.classList.remove('mantener', 'hecho', 'manteniendo'); btn.removeAttribute('data-mantener'); return; }
        h.reiniciar();
        quitar.forEach(f => f());
        capa.remove(); sv.remove();
        const r = base.querySelector(':scope > .rotulo');
        if (r) { const a = r.querySelector(':scope > .rotulo-a'); r.replaceWith(...(a ? a.childNodes : [])); }
        btn.replaceChildren(...base.childNodes);
        btn.classList.remove('mantener', 'hecho', 'manteniendo');
        btn.removeAttribute('data-mantener'); delete btn.dataset.tono; delete btn.dataset.relleno;
        _MANTENER.delete(btn);
      },
    };
    _MANTENER.set(btn, h);
    return h;
  };
  /* Devolverle el botón a su clic de siempre, si lo tenía la pieza. Es lo que necesita un diálogo
     que se reusa: «Sí, borrar todo» se mantiene presionado, y la pregunta siguiente del mismo
     diálogo, que no es peligrosa, se contesta con un toque. */
  P.mantener.quitar = function (btn) {
    btn = P.$(btn);
    const h = btn && _MANTENER.get(btn);
    if (h) h.destruir();
  };

  /* ==========================================================================
     Pieza 24 · El veredicto y el sello
     ==========================================================================
     P.marcaEstadoHTML(estado, {tam, etiqueta, clase}) → cadena
     P.marcaEstado(el, estado, {tam, etiqueta}) → el .marca-estado
     P.selloHTML({texto, centro, sub, gris, tam, estampar}) → cadena
     P.sello(contenedor, opciones) → el <svg>

     El glifo de estado (StatusMark) es uno para toda la app: anillo punteado mientras espera,
     un arco que gira solo mientras hay una espera de verdad, y al llegar la respuesta la marca
     se dibuja —✓ ok, ! av, ✕ mal—. Lo usan el veredicto de verificar.html (44 px), la cola del
     notario y su insignia (16), la sincronización (20) y la nota del cuaderno (14). Por
     omisión mide 1.15em —el tamaño de la letra de al lado— y va aria-hidden: el color nunca
     va solo, siempre glifo Y palabra, y la palabra la pone la pantalla. La marca se dibuja al
     CAMBIAR a un veredicto por marcaEstado(); marcaEstadoHTML la pinta ya dibujada, para las
     listas que se repintan. Con menos movimiento el arco se queda quieto y la marca aparece.

     El sello (CircularText, sin su giro continuo) es el de «Auténtica»: un aro con el texto
     alrededor —AL3D · COTIZACIÓN AUTÉNTICA · el dominio · la hora de la consulta— y AL3D al
     centro. Cae una vez, con un golpe de sello, y se queda quieto. Un sello bonito se falsifica
     fácil en una captura, así que lleva la hora y el dominio, y la línea «la prueba es esta
     dirección, no la imagen» la escribe la página. En «ya no vigente» y «revocada» sale gris y
     cruzado. El texto se ajusta solo a la vuelta: textLength con el perímetro exacto y una letra
     que baja si el texto es largo (P.letraCircular). */
  const _ME_ESTADOS = ['espera', 'trabaja', 'ok', 'av', 'mal'];
  const _ME_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<circle class="me-base" cx="12" cy="12" r="10"/><circle class="me-arco" cx="12" cy="12" r="10" pathLength="100"/>' +
    '<path class="me-m me-ok" d="M7.4 12.5l3.1 3.1 6.1-6.5" pathLength="1"/>' +
    '<path class="me-m me-mal" d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8" pathLength="1"/>' +
    '<path class="me-m me-av" d="M12 6.8v6.6M12 16.9v.3" pathLength="1"/></svg>';
  const _meEstado = e => (_ME_ESTADOS.indexOf(e) >= 0 ? e : 'espera');
  P.marcaEstadoHTML = function (estado, o) {
    o = o || {};
    const tam = +o.tam > 0 ? ' style="--tam:' + (+o.tam) + 'px"' : '';
    const voz = o.etiqueta ? ' role="img" aria-label="' + P.esc(o.etiqueta) + '"' : ' aria-hidden="true"';
    return '<span class="marca-estado' + (o.clase ? ' ' + P.esc(o.clase) : '') + '" data-estado="' + _meEstado(estado) + '"' + tam + voz + '>' + _ME_SVG + '</span>';
  };
  P.marcaEstado = function (el, estado, o) {
    el = P.$(el); o = o || {};
    if (!el) return null;
    let m = el.classList && el.classList.contains('marca-estado') ? el : el.querySelector('.marca-estado');
    if (!m) {
      const t = d.createElement('span'); t.innerHTML = P.marcaEstadoHTML(estado, o);
      m = t.firstChild; el.insertBefore(m, el.firstChild);
      if (_meEstado(estado) === 'ok' || estado === 'av' || estado === 'mal') P.dibujar(m);
      return m;
    }
    const antes = m.dataset.estado, e = _meEstado(estado);
    if (+o.tam > 0) m.style.setProperty('--tam', (+o.tam) + 'px');
    if (o.etiqueta) { m.setAttribute('role', 'img'); m.setAttribute('aria-label', o.etiqueta); m.removeAttribute('aria-hidden'); }
    if (antes === e) return m;
    m.dataset.estado = e;
    if (e === 'ok' || e === 'av' || e === 'mal') P.dibujar(m); else m.classList.remove('dibuja');
    return m;
  };

  /* El camino de un círculo completo que empieza a la izquierda y va por arriba en el sentido
     del reloj: el texto se lee derecho en la mitad de arriba, como en un sello de goma. */
  P.circulo = (cx, cy, r) => 'M' + (cx - r) + ',' + cy + ' a' + r + ',' + r + ' 0 1,1 ' + (2 * r) + ',0 a' + r + ',' + r + ' 0 1,1 ' + (-2 * r) + ',0';
  /* La letra que cabe: unas 0.72em por carácter en mayúsculas con su espaciado, entre 6.5 y 10. */
  P.letraCircular = (texto, r) => {
    const n = Math.max(1, String(texto || '').length);
    return Math.max(6.5, Math.min(10, (2 * Math.PI * r) / (n * 0.72)));
  };
  let _selloN = 0;
  P.selloHTML = function (o) {
    o = o || {};
    const id = 'sello-c-' + (++_selloN);
    const r = 61, largo = 2 * Math.PI * r;
    const texto = o.texto || 'AL3D · COTIZACIÓN AUTÉNTICA ·';
    const cls = 'sello-circular' + (o.gris ? ' gris' : '') + (o.estampar === false ? '' : ' estampa') + (o.clase ? ' ' + P.esc(o.clase) : '');
    const tam = +o.tam > 0 ? ' style="--tam:' + (+o.tam) + 'px"' : '';
    const voz = o.etiqueta ? ' role="img" aria-label="' + P.esc(o.etiqueta) + '"' : ' aria-hidden="true"';
    return '<svg class="' + cls + '" viewBox="0 0 160 160" focusable="false"' + tam + voz + '>' +
      '<defs><path id="' + id + '" d="' + P.circulo(80, 80, r) + '"/></defs>' +
      '<circle class="sc-aro" cx="80" cy="80" r="76"/><circle class="sc-aro2" cx="80" cy="80" r="48"/>' +
      '<text class="sc-giro" font-size="' + P.letraCircular(texto, r).toFixed(2) + '"><textPath href="#' + id + '" textLength="' + (largo - 4).toFixed(1) + '" lengthAdjust="spacing">' + P.esc(texto) + '</textPath></text>' +
      '<text class="sc-centro" x="80" y="86" text-anchor="middle">' + P.esc(o.centro || 'AL3D') + '</text>' +
      (o.sub !== '' ? '<text class="sc-sub" x="80" y="104" text-anchor="middle">' + P.esc(o.sub || 'AUTÉNTICA') + '</text>' : '') +
      '<path class="sc-cruz" d="M34 126L126 34"/></svg>';
  };
  P.sello = function (cont, o) {
    const t = d.createElement('span');
    t.innerHTML = P.selloHTML(o);
    const svg = t.firstChild;
    cont = P.$(cont);
    if (cont) cont.appendChild(svg);
    return svg;
  };

  /* ==========================================================================
     Copiar, y que lo diga el botón que se tocó
     ==========================================================================
     P.copiar(texto, {boton, ok, ms}) → Promise<boolean>
     P.confirmarEnBoton(btn, texto, {ms}) → { volver() }
     P.botonDelEvento(evento) → el botón del toque que está corriendo, o null

     Había dos copiarTexto() —una por app— con el mismo respaldo escrito dos veces. Esta es la
     única: la API del portapapeles, y si no está o la niega (iOS, páginas no seguras), un
     <textarea> de solo lectura en el <body> —no dentro del diálogo, donde inerte no recibiría
     el foco—, seleccionado entero con setSelectionRange (iOS no copia con select() solo) y
     execCommand('copy'); al quitarlo se devuelve el foco adonde estaba, porque si no se queda
     en el <body> con el diálogo abierto y quien usa teclado se sale del cerco.

     Si sale bien y hay botón, el propio botón lo dice: su rótulo se cruza con una palomita que
     se dibuja y «Copiado» (piezas 23 y 6), 1.8 s, y vuelve. Un botón de solo icono cambia el
     icono por la palomita, sin texto que lo ensanche. La confirmación de abajo y la voz
     siguen siendo de quien llama —las dos copiarTexto()—: el aviso trae la instrucción
     («pégalos en la columna Proyecto…») que ningún botón cabe. Devuelve si copió; nunca se
     rechaza.

     botonDelEvento() es lo que deja a las dos copiarTexto() confirmar en el botón SIN cambiar su
     firma ni sus trece llamadas: durante un clic, window.event es ese clic y su botón es el que
     se tocó. Fuera de un toque (después de un await) no hay evento y no se confirma en nada, que
     es lo correcto: ya no se sabe qué botón fue. */
  P.botonDelEvento = function (ev) {
    ev = ev || g.event;
    if (!ev || !/^(click|pointerup|keydown|keyup|touchend)$/.test(ev.type)) return null;
    const t = ev.target && ev.target.closest ? ev.target : null;
    const b = t && t.closest('button,[role="button"]');
    if (!b || !b.isConnected || b.closest('.toast')) return null;
    return b;
  };
  P.confirmarEnBoton = function (btn, texto, o) {
    btn = P.$(btn); o = o || {};
    if (!btn || !btn.isConnected || btn.matches('.con-estado,[data-mantener],[data-deshacer]')) return { volver() {} };
    const conTexto = /\S/.test((btn.textContent || '').replace(/ /g, ' '));
    const html = P.palomitaHTML({ dibujar: true }) + (conTexto && texto ? '<span>' + P.esc(texto) + '</span>' : '');
    return P.rotuloTemporal(btn, { html }, { ms: o.ms || 1800 });
  };
  P.copiar = function (texto, o) {
    o = o || {};
    const txt = String(texto == null ? '' : texto);
    const boton = o.boton ? P.$(o.boton) : null;
    return new Promise(res => {
      let listo = false;
      const fin = bien => {
        if (listo) return;
        listo = true;
        if (bien && boton) P.confirmarEnBoton(boton, o.ok == null ? 'Copiado' : o.ok, { ms: o.ms });
        res(!!bien);
      };
      const manual = () => {
        try {
          const volver = d.activeElement;
          const ta = d.createElement('textarea');
          ta.value = txt;
          ta.setAttribute('readonly', ''); ta.setAttribute('aria-hidden', 'true'); ta.tabIndex = -1;
          ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
          d.body.appendChild(ta);
          try { ta.focus({ preventScroll: true }); } catch (_) { ta.focus(); }
          ta.select();
          try { ta.setSelectionRange(0, txt.length); } catch (_) {}
          let bien = false;
          try { bien = d.execCommand('copy'); } catch (_) { bien = false; }
          ta.remove();
          if (volver && volver.isConnected && volver !== d.body && volver.focus) { try { volver.focus({ preventScroll: true }); } catch (_) {} }
          fin(bien);
        } catch (_) { fin(false); }
      };
      try {
        const c = g.navigator && g.navigator.clipboard;
        if (c && typeof c.writeText === 'function') c.writeText(txt).then(() => fin(true), manual);
        else manual();
      } catch (_) { manual(); }
    });
  };

  /* ── fin de 1 ── */

  /* ==========================================================================
     2 · HOJAS, LISTAS Y TRANSICIONES
     ========================================================================== */

  /* ── fin de 2 ── */

  /* ==========================================================================
     3 · NÚMEROS, MEDIDAS Y CAMPOS
     ========================================================================== */
  /* Todo lo de esta sección va dentro de un bloque. Las cuatro secciones comparten el ámbito de
     la función de arriba, y un `const acotar` escrito en dos de ellas no es un aviso: es un
     SyntaxError que tumba el archivo entero —y con él el toast() de las cuatro superficies—.
     Dentro del bloque, los nombres de aquí son de aquí; lo público se cuelga de P.

     Lo que vive aquí son números que cambian delante de alguien —el total, una cuenta, una
     diferencia—, medidas que se mueven con el dedo y campos que dicen si ya están completos.
     La regla que se repite en todas: el número de verdad es el del campo o el del texto, y el
     movimiento es un dibujo encima que se puede quitar sin que nada deje de funcionar. */
  {
    /* ----- Lo que comparten las piezas de esta sección ----- */

    /* Un elemento, un id o un selector. `P.$` solo entiende ids; aquí también entra un
       selector, porque varias pantallas pintan con innerHTML y no les ponen id a sus grupos. */
    const el$ = x => {
      if (x == null) return null;
      if (typeof x !== 'string') return x;
      const porId = d.getElementById(x);
      if (porId) return porId;
      try { return d.querySelector(x); } catch (_) { return null; }
    };
    /* En papel no rueda nada ni viaja nada: el total impreso a medio giro es un número falso. */
    const enPapel = () => { try { return g.matchMedia('print').matches; } catch (_) { return false; } };
    const acotar = (v, a, b) => Math.min(b, Math.max(a, v));
    /* Dos cuadros y no uno: con uno solo, Chrome agrupa la escritura sin transición y la que sí
       la lleva en el mismo recálculo de estilo, y no anima nada. Es el truco de _volarTotal(). */
    const dosCuadros = f => g.requestAnimationFrame(() => g.requestAnimationFrame(f));
    const CURVA = 'cubic-bezier(.2,.8,.2,1)';
    let serie = 0;
    const nuevoId = p => p + '-' + (++serie).toString(36) + Math.random().toString(36).slice(2, 6);
    const decimalesDe = n => { const s = String(n), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
    /* Redondear a los decimales del paso: 0.1 + 0.2 es 0.30000000000000004, y eso escrito en un
       campo de medidas es un «30.000000000000004 cm» delante del cliente. */
    const redondear = (v, dec) => +(+v).toFixed(Math.min(10, Math.max(0, dec)));
    const esDigito = c => c >= '0' && c <= '9';
    /* El número que hay dentro de un texto de la app: «$1,234.00», «−0.6 láminas», «3». */
    const numeroDe = t => {
      const n = parseFloat(String(t == null ? '' : t).replace(/−/g, '-').replace(/[^\d.-]/g, ''));
      return isFinite(n) ? n : NaN;
    };
    /* Los mismos eventos que teclear. Con `bubbles`, para que lleguen también a la delegación
       que ya usa cada módulo, y a los manejadores en línea del cotizador (oninput="typeItem…"). */
    const avisar = (el, tipo) => el.dispatchEvent(new Event(tipo, { bubbles: true }));
    const fmtNum = x => (+x).toLocaleString('es-MX', { maximumFractionDigits: 2 });

    /* ----- La lógica sin pantalla -----
       Lo que se puede decidir sin DOM vive aquí, a la vista y probado en node
       (pruebas/piezas-numeros.mjs). Las piezas de abajo solo lo pintan. */
    P.cifras = {
      /* Qué hace cada carácter de un número que cambia de `viejo` a `nuevo`. Se alinea por la
         DERECHA: las unidades siguen siendo unidades cuando el total gana un dígito, y
         «$9,999.00 → $10,000.00» gira cuatro nueves a cero y hace nacer el uno, en vez de
         desplazar todo un lugar. `vivas` son las posiciones a medio giro de una rueda que se
         interrumpió (contadas desde la derecha): la nueva sale de ahí y no da un salto. */
      plan(viejo, nuevo, vivas) {
        const v = String(viejo == null ? '' : viejo), n = String(nuevo == null ? '' : nuevo), plan = [];
        for (let i = 0; i < n.length; i++) {
          const ch = n[i], r = n.length - 1 - i, j = v.length - 1 - r, antes = j >= 0 ? v[j] : '';
          if (!esDigito(ch)) { plan.push({ ch, digito: false, cambia: antes !== ch }); continue; }
          const viva = vivas && vivas[r] != null ? vivas[r] : null;
          const desde = viva != null ? viva : esDigito(antes) ? +antes : 0;
          plan.push({ ch, digito: true, desde, hasta: +ch, cambia: desde !== +ch });
        }
        return plan;
      },
      /* Una diferencia con su signo: «+0.6 láminas», «−1,200», «0». El menos es U+2212, el de la
         columna del dinero; el guion corto se lee como un guion. `formato` recibe el valor
         absoluto ya redondeado (para pesos: money). */
      diferencia(n, o) {
        o = o || {};
        const v = Number(n);
        if (n === null || n === '' || !isFinite(v)) return o.nada != null ? String(o.nada) : '—';
        const dec = o.decimales != null ? o.decimales : 2, f = Math.pow(10, dec);
        const abs = Math.round(Math.abs(v) * f) / f, u = o.unidad ? ' ' + o.unidad : '';
        if (abs === 0) return o.cero != null ? String(o.cero) : '0' + u;
        const num = typeof o.formato === 'function' ? String(o.formato(abs))
          : abs.toLocaleString('es-MX', { maximumFractionDigits: dec });
        return (v > 0 ? '+' : '−') + num + u;
      },
      /* 'mas', 'menos' o 'cero', con el mismo redondeo que diferencia(): «+0.001» con un decimal
         es cero, y la pantalla no puede pintarlo en ámbar si el texto dice «0». */
      signo(n, decimales) {
        const v = Number(n);
        if (n === null || n === '' || !isFinite(v)) return '';
        const f = Math.pow(10, decimales != null ? decimales : 2);
        return Math.round(Math.abs(v) * f) === 0 ? 'cero' : v > 0 ? 'mas' : 'menos';
      },
      /* ¿Lo tecleado es tres veces (o más) mayor o menor que lo que dice el libro? Es el «30» que
         se escribió en lugar de «3.0» (F4). Con el libro en cero no hay proporción que medir: un
         primer conteo no es un error. Contar cero con el libro en 2.4 sí se pregunta. */
      proporcionDudosa(libro, dice, veces) {
        veces = veces > 1 ? veces : 3;
        const a = Math.abs(Number(libro)), b = Math.abs(Number(dice));
        if (!isFinite(a) || !isFinite(b) || a === 0) return false;
        const r = b / a;
        return r >= veces || r <= 1 / veces;
      },
      /* El valor de una medida arrastrada `dx` píxeles desde `v0`: un paso cada `px` píxeles,
         con su mínimo y su máximo, y redondeado a los decimales del paso. */
      pasoDeArrastre(v0, dx, o) {
        o = o || {};
        const px = o.px > 0 ? o.px : 6, base = o.paso > 0 ? o.paso : 1, paso = base * (o.mult > 0 ? o.mult : 1);
        const v = acotar(v0 + Math.round(dx / px) * paso, o.min != null ? o.min : -Infinity, o.max != null ? o.max : Infinity);
        return redondear(v, Math.max(decimalesDe(base), decimalesDe(v0)));
      },
      /* El valor de un deslizador después de sus imanes: el imán más cercano dentro de su radio
         gana; fuera de todos, el redondeo (a cientos, por ejemplo); y siempre dentro del rango.
         Un imán es un número o {v, radio}; sin radio propio vale `o.radio` (en unidades). */
      imanar(bruto, o) {
        o = o || {};
        const min = o.min != null ? o.min : -Infinity, max = o.max != null ? o.max : Infinity;
        let mejor = null, dist = Infinity;
        for (const im of o.imanes || []) {
          const v = typeof im === 'object' ? +im.v : +im;
          const rad = typeof im === 'object' && im.radio != null ? +im.radio : +(o.radio || 0);
          const dd = Math.abs(bruto - v);
          if (dd <= rad && dd < dist) { mejor = v; dist = dd; }
        }
        if (mejor != null) return acotar(mejor, min, max);
        if (o.redondeo > 0) return acotar(redondear(Math.round(bruto / o.redondeo) * o.redondeo, decimalesDe(o.redondeo)), min, max);
        return acotar(bruto, min, max);
      },
      /* Cuánto cede la liga al jalar `v` píxeles más allá del tope: crece rápido al principio y
         se frena contra `max`, que no pasa. Es la sigmoide de ElasticSlider. */
      decaer(v, max) {
        if (!(max > 0) || !(v > 0)) return 0;
        return 2 * max * (1 / (1 + Math.exp(-v / max)) - .5);
      },
      /* Qué etiquetas de un riel caben sin pisarse: primero los extremos y los imanes, después
         las demás de izquierda a derecha. Los rótulos de Colores (2–24) no caben todos a 360 px;
         las rayitas sí, y esas se quedan todas. */
      marcasQueCaben(marcas, sep) {
        sep = sep != null ? sep : 6;
        const orden = marcas.map((m, i) => i)
          .sort((a, b) => (marcas[b].prioridad || 0) - (marcas[a].prioridad || 0) || marcas[a].x - marcas[b].x);
        const puestas = [], ver = marcas.map(() => false);
        for (const i of orden) {
          const m = marcas[i], a = m.x - m.w / 2 - sep / 2, b = m.x + m.w / 2 + sep / 2;
          if (puestas.every(([p, q]) => b <= p || a >= q)) { puestas.push([a, b]); ver[i] = true; }
        }
        return ver;
      },
      /* Las fracciones de un medidor quieto, todas entre 0 y 1. El rayado no pasa del lleno
         (lo que tiene dueño sale de lo que hay), y el hueco hasta la meta solo existe si la meta
         va por delante. Un valor negativo —el libro de material en rojo— sale vacío y marcado. */
      medidor(o) {
        o = o || {};
        const max = o.max > 0 ? +o.max : 1;
        const frac = x => (x == null || x === '' || !isFinite(+x)) ? null : acotar(+x / max, 0, 1);
        const crudo = Number(o.valor), v = isFinite(crudo) ? acotar(crudo / max, 0, 1) : 0;
        const r = frac(o.rayado), meta = frac(o.meta), muesca = frac(o.muesca);
        return {
          v, r: r == null ? 0 : Math.min(v, r),
          meta: meta != null && meta > v ? meta : null,
          muesca, bajoCero: isFinite(crudo) && crudo < 0
        };
      }
    };

    /* ======================================================================
       1 · EL TOTAL QUE RUEDA
       Sale de React Bits Counter / CountUp, Skiper skiper37 y Vengeance Animated Number,
       reescrito: NumberFlow viene de npm y la política del cotizador no lo deja entrar.

       Cada dígito es una tira 0–9 que se desliza con transform dentro de una ventana de un
       renglón. Lo que lo hace convivir con el resto de la app es que el número de VERDAD nunca
       deja de estar ahí: el elemento conserva su texto —el de `money()`, tal cual—, y la rueda
       es una capa `aria-hidden` encima que pinta sus cifras con contenido generado (::before).
       Por eso:
         · `el.textContent` sigue siendo «$23,664.00», y los `if(v.textContent!==t)` de
           proceso.js, `latirTotal()` y las pruebas que leen el total no se enteran;
         · el lector de pantalla lee el número final, una vez, y nunca los dígitos a medio giro;
         · el tamaño de la caja no cambia —la cifra que ocupa el sitio es la real, en
           transparente—, así que el vuelo del total entre pasos (_medirTotal/_volarTotal, que
           escala por el ALTO) mide lo mismo que siempre, y `cifraQueCabe()` sigue mandando;
         · el difuminado del borrador (`body.precios-ocultos`, _SEL_PRECIO) está puesto en el
           elemento, y la capa es su hija: se difumina con él, y el dedo que espía toca el mismo
           elemento de siempre.
       Al terminar, la capa se va y queda el texto solo, como si la pieza no existiera.

       Nunca rueda la primera vez que ve un número —ni al abrir la cotización, ni al montar una
       pantalla—: rueda cuando CAMBIA uno que ella misma pintó, o uno que recuerda por su
       `clave` (para lo que se repinta con innerHTML: el dock, las cuentas de la plataforma).
       Con menos movimiento, en papel, en una pestaña escondida o sin caja, el número cambia
       sin rodar.
       ====================================================================== */
    const ruedas = new WeakMap();
    const memoriaCifras = new Map();
    const ruedaDe = el => {
      let st = ruedas.get(el);
      if (!st) {
        st = { ultimo: null, vista: null, anims: [], token: 0, X: 0, promesa: null };
        ruedas.set(el, st);
        el.classList.add('rueda-cifra');
      }
      return st;
    };
    /* Dónde va cada tira de una rueda que sigue girando, para que la siguiente salga de ahí. */
    const vivasDe = st => {
      if (!st.vista || !st.X) return null;
      const hijos = Array.from(st.vista.children), out = [];
      hijos.forEach((h, i) => {
        if (!h.classList.contains('rueda-col') || !h.firstChild) return;
        const t = g.getComputedStyle(h.firstChild).transform;
        let ty = 0;
        if (t && t !== 'none') { try { ty = new g.DOMMatrixReadOnly(t).m42; } catch (_) { ty = 0; } }
        out[hijos.length - 1 - i] = acotar(-ty / st.X, 0, 9);
      });
      return out;
    };
    const pararRueda = (el, st) => {
      st.token++;
      st.anims.forEach(a => { try { a.cancel(); } catch (_) { } });
      st.anims = [];
      if (st.vista) { st.vista.remove(); st.vista = null; }
      el.classList.remove('rueda-rodando');
    };
    const puedeRodar = (el, texto) => /\d/.test(texto) && !P.sinMovimiento() && !enPapel() && el.isConnected &&
      d.visibilityState !== 'hidden' && el.getClientRects().length > 0 && typeof el.animate === 'function';
    /* Dónde está el texto dentro de su elemento, en píxeles sin escalar. Se mide con un Range
       y no con el elemento: el texto puede ir a la izquierda de un bloque (las cuentas de la
       plataforma) o centrado, y la capa tiene que caer exactamente sobre las cifras. `k`
       deshace la escala de un ancestro —un modal que entra, el vuelo del total a medio camino—
       porque las posiciones de la capa se escriben en el espacio SIN transformar. */
    const cajaDelTexto = el => {
      /* Solo los nodos de texto: el «+1» de un cambio anterior es un elemento hermano, y con
         selectNodeContents el Range devolvía su caja también y la rueda no arrancaba. */
      const textos = Array.from(el.childNodes).filter(x => x.nodeType === 3 && x.data.length);
      if (!textos.length) return null;
      const rango = d.createRange(), ult = textos[textos.length - 1];
      rango.setStart(textos[0], 0);
      rango.setEnd(ult, ult.data.length);
      const cajas = rango.getClientRects();
      if (cajas.length !== 1) return null;            // partido en dos renglones: no se adivina
      const rr = cajas[0], hr = el.getBoundingClientRect();
      let k = el.offsetHeight ? hr.height / el.offsetHeight : 1;
      if (!(k > 0) || Math.abs(k - 1) < .02) k = 1;
      const cs = g.getComputedStyle(el);
      const bt = parseFloat(cs.borderTopWidth) || 0, bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
      return {
        cs, alto: rr.height / k,
        arriba: (rr.top - hr.top) / k - bt,
        izquierda: (rr.left - hr.left) / k - bl,
        derecha: (hr.right - rr.right) / k - br,
        ancho: rr.width / k
      };
    };
    const rodar = (el, st, previo, nuevo, vivas, o) => {
      const c = cajaDelTexto(el);
      if (!c || !c.alto) return Promise.resolve(false);
      /* La ventana mide un renglón: el line-height del elemento, que es donde el navegador ya
         puso las cifras reales. Con `normal`, el alto del texto mismo. */
      let X = parseFloat(c.cs.lineHeight);
      if (!(X > 0)) X = c.alto;
      st.X = X;
      const vista = d.createElement('span');
      vista.className = 'rueda-vista';
      vista.setAttribute('aria-hidden', 'true');
      vista.style.top = (c.arriba - (X - c.alto) / 2) + 'px';
      vista.style.right = c.derecha + 'px';
      vista.style.height = X + 'px';
      vista.style.lineHeight = X + 'px';
      if (c.cs.textShadow && c.cs.textShadow !== 'none') vista.style.textShadow = c.cs.textShadow;
      const dur = o.duracion > 0 ? o.duracion : 600, escalon = o.escalon >= 0 ? o.escalon : 18;
      const plan = P.cifras.plan(previo, nuevo, vivas), n = plan.length, pedidos = [];
      plan.forEach((p, i) => {
        const r = n - 1 - i;                          // las unidades arrancan primero
        if (!p.digito) {
          const s = d.createElement('span');
          s.className = 'rueda-ch';
          s.setAttribute('data-c', p.ch);
          vista.appendChild(s);
          if (p.cambia) pedidos.push([s, [{ opacity: 0, transform: 'translateY(-40%)' }, { opacity: 1, transform: 'none' }], Math.min(dur, 240), r * escalon]);
          return;
        }
        const col = d.createElement('span'), tira = d.createElement('span');
        col.className = 'rueda-col';
        col.style.height = X + 'px';
        tira.className = 'rueda-tira';
        /* El reposo es el destino: si la animación no corre, o al terminar, la tira ya está
           donde tiene que estar y no hay un cuadro de más con la cifra vieja. */
        tira.style.transform = 'translateY(' + (-p.hasta * X) + 'px)';
        col.appendChild(tira);
        vista.appendChild(col);
        if (p.cambia) pedidos.push([tira, [{ transform: 'translateY(' + (-p.desde * X) + 'px)' }, { transform: 'translateY(' + (-p.hasta * X) + 'px)' }], dur, r * escalon]);
      });
      el.classList.add('rueda-rodando');
      el.appendChild(vista);
      st.vista = vista;
      const token = st.token;
      st.anims = pedidos.map(([nodo, kf, ms, retraso]) => nodo.animate(kf, { duration: ms, delay: retraso, easing: CURVA, fill: 'backwards' }));
      return Promise.all(st.anims.map(a => a.finished.catch(() => null))).then(() => {
        if (st.token !== token) return false;
        pararRueda(el, st);
        st.promesa = null;
        return true;
      });
    };
    /* El «+1» de P18: breve, sin texto en el árbol (va en data-d y se pinta con ::before, para
       que `textContent` siga siendo el número), y junto a la cifra, no en la orilla de la
       tarjeta. Es información —cuánto cambió—, así que con menos movimiento se queda como un
       fundido; en papel no existe. */
    const marcarDelta = (el, previo, nuevo, o) => {
      const a = numeroDe(previo), b = numeroDe(nuevo);
      if (!isFinite(a) || !isFinite(b) || a === b || enPapel()) return;
      const txt = typeof o.delta === 'function' ? o.delta(b - a) : P.cifras.diferencia(b - a, { decimales: 0 });
      if (!txt) return;
      const viejo = el.querySelector(':scope > .rueda-delta');
      if (viejo) viejo.remove();
      const c = el.isConnected ? cajaDelTexto(el) : null;
      const s = d.createElement('span');
      s.className = 'rueda-delta ' + (b > a ? 'sube' : 'baja');
      s.setAttribute('aria-hidden', 'true');
      s.setAttribute('data-d', String(txt));
      if (c) { s.style.left = (c.izquierda + c.ancho) + 'px'; s.style.top = c.arriba + 'px'; }
      el.appendChild(s);
      const quitar = () => { if (s.parentNode) s.remove(); };
      s.addEventListener('animationend', quitar, { once: true });
      g.setTimeout(quitar, 1800);
    };

    /* rodarCifra(el, texto, {clave, desde, animar, duracion, delta})
       Pone `texto` en `el` —exactamente como `el.textContent = texto`— y, si cambió respecto a
       lo último que se pintó ahí, lo hace rodar. Devuelve una promesa que dice si rodó. */
    P.rodarCifra = function (el, texto, o) {
      o = o || {};
      el = el$(el);
      const nuevo = String(texto == null ? '' : texto);
      if (!el) return Promise.resolve(false);
      const st = ruedaDe(el);
      /* La misma cifra otra vez —renderSummary() corre en cada tecla aunque el total no cambie—
         no toca nada: ni reinicia la rueda que va a medias, ni reescribe el texto (reescribirlo
         en una región viva lo vuelve a anunciar). */
      if (nuevo === st.ultimo && el.textContent === nuevo &&
          (o.clave == null || memoriaCifras.get(o.clave) === nuevo)) return st.promesa || Promise.resolve(false);
      const previo = o.desde != null ? String(o.desde)
        : o.clave != null && memoriaCifras.has(o.clave) ? memoriaCifras.get(o.clave)
          : st.ultimo;
      st.ultimo = nuevo;
      if (o.clave != null) memoriaCifras.set(o.clave, nuevo);
      const vivas = vivasDe(st);
      pararRueda(el, st);
      if (el.textContent !== nuevo) el.textContent = nuevo;
      if (previo == null || previo === nuevo || o.animar === false) { st.promesa = null; return Promise.resolve(false); }
      if (o.delta) marcarDelta(el, previo, nuevo, o);
      if (!puedeRodar(el, nuevo)) { st.promesa = null; return Promise.resolve(false); }
      return (st.promesa = rodar(el, st, previo, nuevo, vivas, o));
    };
    /* Olvidar lo que se recuerda de una clave (p. ej. al cambiar de cotización: el total de la
       nueva no tiene por qué rodar desde el de la anterior). Sin clave, olvida todas. */
    P.rodarCifra.olvidar = clave => { if (clave == null) memoriaCifras.clear(); else memoriaCifras.delete(clave); };

    /* diferenciaViva(el, n, {decimales, unidad, cero, formato, clave, animar, duracion})
       La variante «número animado» de Vengeance para una diferencia que cambia mientras se
       teclea (F4: «El libro dice 2.4 · tú dices 3 → +0.6 láminas»). Escribe el número con su
       signo, rueda corto —se teclea rápido y 600 ms por tecla se acumulan— y deja el signo en
       `data-signo` (mas · menos · cero) para que la pantalla pinte su ámbar sin volver a
       calcular. El aviso de «tres veces más» lo decide la pantalla, con
       `P.cifras.proporcionDudosa()`. Devuelve el texto que puso. */
    P.diferenciaViva = function (el, n, o) {
      o = o || {};
      const texto = P.cifras.diferencia(n, o);
      el = el$(el);
      if (!el) return texto;
      el.setAttribute('data-signo', P.cifras.signo(n, o.decimales != null ? o.decimales : 2));
      P.rodarCifra(el, texto, { duracion: o.duracion > 0 ? o.duracion : 280, escalon: 8, clave: o.clave, desde: o.desde, animar: o.animar });
      return texto;
    };

    /* ======================================================================
       2 · LA FICHA QUE VIAJA
       Sale de React Bits RubberSegment / PillNav y Vengeance Spotlight Navbar.

       En un grupo de opciones —.seg, .tipo-seg, .tool-seg, la barra de módulos, el índice de
       Ajustes— el elegido cambiaba de fondo de golpe. Aquí una sola pieza viaja del elegido
       anterior al nuevo con transform. Dos decisiones que no son de gusto:

       · La app sigue mandando. La pieza NO pone ni quita `.on`: la app lo sigue haciendo como
         siempre —con su onclick, al repintar, al restaurar del historial— y un MutationObserver
         se entera de quién es el nuevo elegido (`.on`, `.active`, aria-pressed, aria-checked,
         aria-selected o aria-current). Si la app reescribe los botones con innerHTML (como
         pintarNav() en cada cambio de pantalla), la ficha sale del rectángulo del viejo, que
         se midió antes, y llega al nuevo.

       · La ficha solo existe durante el viaje. En reposo el elegido se pinta con SU regla de
         siempre, y por eso el tema oscuro, el apagado de una partida congelada, el marino del
         .tipo-seg o el filete de la barra lateral siguen siendo los suyos sin una línea de CSS
         por variante: la ficha copia el aspecto del destino (fondo, radio, sombra, borde) al
         salir, lo esconde mientras vuela —`.ficha-destino`— y se va al llegar. Mientras viaja
         va DETRÁS de los botones (z-index negativo en un grupo aislado), así que el texto nunca
         queda debajo de ella.

       Sin movimiento, o en papel, no hay viaje: el elegido cambia como cambiaba.
       ====================================================================== */
    const ACTIVO = '.on,.active,[aria-pressed="true"],[aria-checked="true"],[aria-selected="true"],[aria-current]:not([aria-current="false"])';
    const ESTADOS = ['class', 'aria-pressed', 'aria-checked', 'aria-selected', 'aria-current', 'hidden', 'disabled', 'aria-disabled'];
    const fichas = new WeakMap();
    const fichaMemoria = new Map();
    /* La memoria de una clave vale 1.5 s: basta para cruzar un repintado —la partida entera se
       rehace con innerHTML al tocar su tipo—, y no alcanza para que la ficha «vuelva a viajar»
       al regresar a una pantalla que alguien dejó hace un rato. */
    const MEMORIA_MS = 1500;
    const soloPropias = (recs, fantasma) => recs.every(r => {
      if (r.type === 'childList') return Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).every(x => x === fantasma);
      if (r.target === fantasma) return true;
      if (r.type === 'attributes' && r.attributeName === 'class') {
        const antes = new Set(String(r.oldValue || '').split(/\s+/).filter(Boolean));
        const ahora = new Set(Array.from(r.target.classList));
        const dif = Array.from(antes).filter(x => !ahora.has(x)).concat(Array.from(ahora).filter(x => !antes.has(x)));
        return dif.every(x => x === 'ficha-destino' || x.indexOf('rueda-') === 0);
      }
      return false;
    });

    /* fichaQueViaja(grupo, {activo, item, medir, clave, duracion}) → {mover(), destruir()} */
    P.fichaQueViaja = function (grupo, o) {
      grupo = el$(grupo);
      if (!grupo) return null;
      const ya = fichas.get(grupo);
      if (ya) return ya;
      o = o || {};
      const activoSel = o.activo || ACTIVO;
      const clave = o.clave != null ? String(o.clave) : (grupo.getAttribute('data-ficha-clave') || grupo.id || null);
      const dur = o.duracion > 0 ? o.duracion : 240;
      let fantasma = null, reposo = null, activo = null, pintado = null, vuelo = null, vivo = true, tam = '';
      grupo.classList.add('con-ficha');

      const escala = () => {
        const r = grupo.getBoundingClientRect(), k = grupo.offsetWidth ? r.width / grupo.offsetWidth : 1;
        return (k > 0 && Math.abs(k - 1) >= .02) ? k : 1;
      };
      /* El rectángulo de algo, en las coordenadas del grupo: con su borde, su desplazamiento
         (el índice de Ajustes se desplaza de lado) y sin la escala de un ancestro. */
      const rel = x => {
        const gr = grupo.getBoundingClientRect(), r = x.getBoundingClientRect(), k = escala();
        return {
          x: (r.left - gr.left) / k - grupo.clientLeft + grupo.scrollLeft,
          y: (r.top - gr.top) / k - grupo.clientTop + grupo.scrollTop,
          w: r.width / k, h: r.height / k
        };
      };
      const items = () => Array.from(grupo.children).filter(x => x !== fantasma && (!o.item || x.matches(o.item)));
      const buscar = () => {
        const lista = items();
        return lista.find(x => x.matches(activoSel)) || lista.find(x => x.querySelector(activoSel)) || null;
      };
      /* Lo que lleva el relleno: el botón, o algo de dentro (la píldora del icono en la barra
         de abajo de la plataforma). */
      const pintadoDe = it => (o.medir && o.medir(it)) || it;
      const seVe = x => !!x && x.isConnected && x.getClientRects().length > 0 && grupo.getClientRects().length > 0;
      const medirReposo = () => {
        activo = buscar();
        pintado = activo && pintadoDe(activo);
        reposo = seVe(pintado) ? rel(pintado) : null;
        if (clave && reposo) fichaMemoria.set(clave, { r: reposo, i: items().indexOf(activo), t: Date.now() });
      };
      /* Un cambio de clase sin su transición de siempre, por un cuadro. Si no, el botón que se
         apaga se desvanece en 160 ms encima de la ficha que ya se fue, y el que se enciende
         aparece sobre ella antes de que llegue. */
      const quieto = (x, f) => {
        if (!x || !x.isConnected) return;
        const t0 = x.style.transition;
        x.style.transition = 'none';
        if (f) f();
        void x.offsetWidth;
        g.requestAnimationFrame(() => { if (x.style.transition === 'none') x.style.transition = t0; });
      };
      const aterrizar = () => {
        if (!vuelo) return;
        const v = vuelo;
        vuelo = null;
        g.clearTimeout(v.reloj);
        quieto(v.dest, () => v.dest.classList.remove('ficha-destino'));
        if (fantasma && fantasma.parentNode) fantasma.remove();
        medirReposo();
      };
      const volar = (desde, viejo) => {
        const dest = pintado, a = rel(dest);
        if (!a.w || !a.h || (Math.abs(a.x - desde.x) < 1 && Math.abs(a.y - desde.y) < 1 &&
            Math.abs(a.w - desde.w) < 1 && Math.abs(a.h - desde.h) < 1)) {
          if (fantasma && fantasma.parentNode) fantasma.remove();
          medirReposo();
          return;
        }
        if (viejo && viejo !== dest) quieto(viejo);
        /* El aspecto se lee del destino con su transición apagada: leído a secas, a mitad de su
           «background .16s» el fondo todavía es transparente y la ficha saldría invisible. */
        const t0 = dest.style.transition;
        dest.style.transition = 'none';
        const cs = g.getComputedStyle(dest);
        const look = {
          backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage,
          borderRadius: cs.borderRadius, boxShadow: cs.boxShadow,
          border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor
        };
        dest.classList.add('ficha-destino');
        void dest.offsetWidth;
        g.requestAnimationFrame(() => { if (dest.style.transition === 'none') dest.style.transition = t0; });
        if (!fantasma) {
          fantasma = d.createElement('span');
          fantasma.className = 'ficha-viaja';
          fantasma.setAttribute('aria-hidden', 'true');
          fantasma.addEventListener('transitionend', e => { if (e.propertyName === 'transform') aterrizar(); });
        }
        const s = fantasma.style;
        s.transition = 'none';
        s.width = a.w + 'px';
        s.height = a.h + 'px';
        s.backgroundColor = look.backgroundColor;
        s.backgroundImage = look.backgroundImage;
        s.borderRadius = look.borderRadius;
        s.boxShadow = look.boxShadow;
        s.border = look.border;
        /* FLIP: ya mide lo que el destino, y una escala inversa lo hace del tamaño del origen. */
        s.transform = 'translate(' + desde.x + 'px,' + desde.y + 'px) scale(' + (desde.w / a.w) + ',' + (desde.h / a.h) + ')';
        if (fantasma.parentNode !== grupo) grupo.insertBefore(fantasma, grupo.firstChild);
        void fantasma.offsetWidth;
        vuelo = { dest, reloj: g.setTimeout(aterrizar, dur + 160) };
        dosCuadros(() => {
          if (!vuelo || vuelo.dest !== dest) return;
          s.transition = 'transform ' + dur + 'ms var(--ease-out,' + CURVA + ')';
          s.transform = 'translate(' + a.x + 'px,' + a.y + 'px)';
        });
      };
      const cambio = () => {
        if (!vivo) return;
        if (!grupo.isConnected) { api.destruir(); return; }
        const nuevo = buscar(), nuevoPint = nuevo && pintadoDe(nuevo);
        if (vuelo && nuevoPint === vuelo.dest) return;             // el mismo destino: que siga
        if (!vuelo && nuevo === activo && nuevoPint === pintado) { medirReposo(); return; }
        let desde = reposo;
        if (vuelo) {
          /* Dos toques seguidos: la ficha sale de donde va, no de donde salió. */
          desde = fantasma && fantasma.isConnected ? rel(fantasma) : reposo;
          const v = vuelo;
          vuelo = null;
          g.clearTimeout(v.reloj);
          quieto(v.dest, () => v.dest.classList.remove('ficha-destino'));
        }
        const viejo = pintado;
        activo = nuevo;
        pintado = nuevoPint;
        if (!nuevo || !desde || P.sinMovimiento() || enPapel() || !seVe(pintado)) {
          if (fantasma && fantasma.parentNode) fantasma.remove();
          medirReposo();
          return;
        }
        volar(desde, viejo);
      };
      const mo = new g.MutationObserver(recs => { if (!soloPropias(recs, fantasma)) cambio(); });
      mo.observe(grupo, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ESTADOS });
      /* Al cambiar de tamaño solo se vuelve a medir: en reposo no hay nada que mover. El primer
         aviso del observador llega al observar, y se ignora porque el tamaño no cambió. */
      const ro = typeof g.ResizeObserver === 'function' ? new g.ResizeObserver(() => {
        if (!vivo) return;
        if (!grupo.isConnected) { api.destruir(); return; }
        const t = grupo.offsetWidth + 'x' + grupo.offsetHeight;
        if (t === tam) return;
        tam = t;
        if (vuelo) aterrizar(); else medirReposo();
      }) : null;
      const api = {
        mover() { cambio(); },
        destruir() {
          if (!vivo) return;
          vivo = false;
          mo.disconnect();
          if (ro) ro.disconnect();
          if (vuelo) { g.clearTimeout(vuelo.reloj); vuelo.dest.classList.remove('ficha-destino'); vuelo = null; }
          if (fantasma && fantasma.parentNode) fantasma.remove();
          grupo.classList.remove('con-ficha');
          fichas.delete(grupo);
        }
      };
      fichas.set(grupo, api);
      const memo = clave ? fichaMemoria.get(clave) : null;
      tam = grupo.offsetWidth + 'x' + grupo.offsetHeight;
      medirReposo();
      if (ro) ro.observe(grupo);
      if (d.fonts && d.fonts.ready) d.fonts.ready.then(() => { if (vivo && !vuelo) medirReposo(); }, () => { });
      /* Un grupo que nace de un repintado (misma clave, hace nada) y con otro elegido: viaja
         desde donde estaba el del grupo anterior. */
      if (memo && reposo && Date.now() - memo.t < MEMORIA_MS && memo.i !== items().indexOf(activo) &&
          !P.sinMovimiento() && !enPapel()) volar(memo.r, null);
      return api;
    };

    /* fichasQueViajan(raiz, selector, opciones) → {destruir()}
       Engancha la ficha a todos los grupos que coinciden, los de ahora y los que nazcan
       después dentro de `raiz` (lo que se repinta con innerHTML). La memoria de cada grupo sale
       de su `data-ficha-clave` o de su id. */
    const vigias = new WeakMap();
    P.fichasQueViajan = function (raiz, selector, o) {
      raiz = el$(raiz) || d.body || d.documentElement;
      const sel = selector || '.seg,.tipo-seg,.tool-seg';
      let porSel = vigias.get(raiz);
      if (!porSel) { porSel = new Map(); vigias.set(raiz, porSel); }
      if (porSel.has(sel)) return porSel.get(sel);
      const opciones = Object.assign({}, o || {});
      delete opciones.clave;
      const enganchar = nodo => {
        if (!nodo || nodo.nodeType !== 1) return;
        if (nodo.matches(sel)) P.fichaQueViaja(nodo, opciones);
        nodo.querySelectorAll(sel).forEach(x => P.fichaQueViaja(x, opciones));
      };
      enganchar(raiz);
      const mo = new g.MutationObserver(recs => { for (const r of recs) r.addedNodes.forEach(enganchar); });
      mo.observe(raiz, { childList: true, subtree: true });
      const api = { destruir() { mo.disconnect(); porSel.delete(sel); } };
      porSel.set(sel, api);
      return api;
    };

    /* ======================================================================
       3 · ARRASTRAR SOBRE LA ETIQUETA PARA MOVER UNA MEDIDA
       Sale de React Bits ScrubField.

       Se arrastra la ETIQUETA, no el campo: el campo sigue siendo un <input> que se teclea, y
       la etiqueta es el mango. Cada `px` píxeles es un paso del campo (su `step`, su `min` y su
       `max`), Shift lo multiplica por diez, y cada paso despacha `input` —y `change` al soltar—
       igual que teclear, así que typeItem(), vtEscala() y compañía recalculan por donde siempre.

       El teléfono no pierde el desplazamiento: la etiqueta lleva `touch-action:pan-y`, así que
       un dedo que baja por la tarjeta desplaza la página —y el navegador cancela el puntero—,
       y solo un arrastre horizontal mueve la medida. Además hay una zona muerta de 4 px: un
       toque es un toque, y un toque en la etiqueta enfoca el campo, como siempre. Lo que sí se
       traga es el clic que llega al soltar un arrastre: enfocar el campo ahí abría el teclado.

       No vibra: vibrar() está reservado para autorizar, borrar y rechazar (notario.js).
       ====================================================================== */
    const UMBRAL = 4;
    const arrastres = new WeakMap();
    const tragarHasta = new WeakMap();
    let tragaClicPuesto = false;
    const tragarClic = et => {
      tragarHasta.set(et, Date.now() + 450);
      if (tragaClicPuesto) return;
      tragaClicPuesto = true;
      d.addEventListener('click', e => {
        const t = e.target && e.target.closest ? e.target.closest('.arrastrable,[data-arrastrar]') : null;
        if (t && tragarHasta.get(t) > Date.now()) { tragarHasta.delete(t); e.preventDefault(); e.stopPropagation(); }
      }, true);
    };
    const campoDe = et => et.control ||
      (et.getAttribute('data-arrastrar') && d.getElementById(et.getAttribute('data-arrastrar'))) ||
      (et.htmlFor && d.getElementById(et.htmlFor)) || et.querySelector('input');
    const empezarArrastre = (e, et, input, o) => {
      if ((e.button != null && e.button > 0) || e.isPrimary === false) return;
      if (!input || input.disabled || input.readOnly || input.getAttribute('aria-disabled') === 'true') return;
      const lee = (a, def) => { const v = parseFloat(a); return isFinite(v) ? v : def; };
      const px = o.px > 0 ? o.px : lee(et.getAttribute('data-arrastre-px'), 6);
      const paso = o.paso > 0 ? o.paso : lee(input.step, 1) || 1;
      const min = o.min != null ? o.min : lee(input.min, -Infinity), max = o.max != null ? o.max : lee(input.max, Infinity);
      const caja = (o.caja && et.closest(o.caja)) || et.closest('.fld') || et.parentElement || et;
      const id = e.pointerId, x0 = e.clientX, y0 = e.clientY;
      let activo = false, cambio = false, v0 = 0, ultimo = null;
      const mover = ev => {
        if (ev.pointerId !== id) return;
        if (!input.isConnected) { soltar(ev); return; }
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!activo) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { soltar(ev); return; }   // era desplazar
          if (Math.abs(dx) < UMBRAL) return;
          activo = true;
          v0 = lee(input.value, isFinite(min) ? Math.max(0, min) : 0);
          ultimo = v0;
          try { et.setPointerCapture(id); } catch (_) { }
          caja.classList.add('arrastre-activo');
          et.classList.add('arrastre-activo');
          d.documentElement.classList.add('arrastre-medida');
        }
        if (ev.cancelable) ev.preventDefault();
        const v = P.cifras.pasoDeArrastre(v0, dx - Math.sign(dx) * UMBRAL, { px, paso, min, max, mult: ev.shiftKey ? 10 : 1 });
        if (v === ultimo) return;
        ultimo = v;
        cambio = true;
        input.value = String(v);
        avisar(input, 'input');
        if (o.alMover) o.alMover(v, input);
      };
      const soltar = ev => {
        if (ev && ev.pointerId !== id) return;
        g.removeEventListener('pointermove', mover);
        g.removeEventListener('pointerup', soltar);
        g.removeEventListener('pointercancel', soltar);
        if (!activo) return;
        caja.classList.remove('arrastre-activo');
        et.classList.remove('arrastre-activo');
        d.documentElement.classList.remove('arrastre-medida');
        tragarClic(et);
        if (cambio) { avisar(input, 'change'); if (o.alSoltar) o.alSoltar(ultimo, input); }
      };
      g.addEventListener('pointermove', mover, { passive: false });
      g.addEventListener('pointerup', soltar);
      g.addEventListener('pointercancel', soltar);
    };

    /* arrastrarMedida(etiqueta, input?, {px, paso, min, max, caja, alMover, alSoltar}) → {destruir()}
       Para un campo que no se repinta. Sin `input`, el de la etiqueta (`for`). */
    P.arrastrarMedida = function (etiqueta, input, o) {
      etiqueta = el$(etiqueta);
      o = o || {};
      if (!etiqueta) return null;
      const ya = arrastres.get(etiqueta);
      if (ya) return ya;
      input = el$(input) || campoDe(etiqueta);
      if (!input) return null;
      etiqueta.classList.add('arrastrable');
      const alBajar = e => empezarArrastre(e, etiqueta, input, o);
      etiqueta.addEventListener('pointerdown', alBajar);
      const api = { destruir() { etiqueta.removeEventListener('pointerdown', alBajar); etiqueta.classList.remove('arrastrable'); arrastres.delete(etiqueta); } };
      arrastres.set(etiqueta, api);
      return api;
    };
    /* arrastrarMedidas(raiz, opciones) → {destruir()}
       Un solo oyente para todo lo que se repinta: cualquier <label class="arrastrable"> (o con
       `data-arrastrar="id-del-campo"`) dentro de `raiz` arrastra su campo, aunque la partida se
       haya rehecho con innerHTML un segundo antes. Las opciones salen del campo (step, min,
       max) y de `data-arrastre-px`. */
    P.arrastrarMedidas = function (raiz, o) {
      raiz = el$(raiz) || d;
      o = o || {};
      const ya = arrastres.get(raiz);
      if (ya) return ya;
      const alBajar = e => {
        const t = e.target;
        const et = t && t.closest ? t.closest('.arrastrable,[data-arrastrar]') : null;
        if (!et || arrastres.has(et) || (raiz !== d && !raiz.contains(et))) return;
        empezarArrastre(e, et, campoDe(et), o);
      };
      raiz.addEventListener('pointerdown', alBajar);
      const api = { destruir() { raiz.removeEventListener('pointerdown', alBajar); arrastres.delete(raiz); } };
      arrastres.set(raiz, api);
      return api;
    };

    /* ======================================================================
       18 · OPCIONES CON RESALTADO QUE SE DESLIZA
       Sale de React Bits GlideSelect.

       Un role="radiogroup" de .chip con una sola pastilla que viaja —la ficha de arriba, con
       la misma implementación—, flechas del teclado como un grupo de radios de verdad (la
       flecha mueve el foco Y elige; solo el elegido entra al tabulador) y el valor en un
       <input type="hidden">: `datosParaLaHoja()` lee #rv-cuenta como siempre. Cada opción lleva
       también `.on`, así que se ve exactamente como un chip elegido del resto de la app.

       Lo que esta pieza NO hace es decidir nada del negocio: las etiquetas «con IVA / sin
       IVA», el orden y el aviso ámbar de C4 son de la pantalla.
       ====================================================================== */
    const glides = new WeakMap();
    /* opcionesDeslizantes(grupo, {valor, alCambiar, clave}) → {valor(), fijar(v, avisar), destruir()} */
    P.opcionesDeslizantes = function (grupo, o) {
      grupo = el$(grupo);
      o = o || {};
      if (!grupo) return null;
      const ya = glides.get(grupo);
      if (ya) return ya;
      const oculto = el$(o.valor) || (grupo.getAttribute('data-valor') ? d.getElementById(grupo.getAttribute('data-valor')) : null);
      grupo.setAttribute('role', 'radiogroup');
      grupo.classList.add('glide');
      const opciones = () => {
        let l = Array.from(grupo.querySelectorAll('[role="radio"]'));
        if (!l.length) { l = Array.from(grupo.querySelectorAll('button')); l.forEach(b => b.setAttribute('role', 'radio')); }
        return l;
      };
      const valorDe = b => b.getAttribute('data-v') != null ? b.getAttribute('data-v')
        : (b.value != null && b.value !== '') ? String(b.value) : b.textContent.trim();
      const apagada = b => b.disabled || b.getAttribute('aria-disabled') === 'true';
      const actual = () => opciones().find(b => b.getAttribute('aria-checked') === 'true') || null;
      const pintar = elegido => {
        const l = opciones();
        l.forEach(b => {
          const si = b === elegido;
          if (b.getAttribute('aria-checked') !== String(si)) b.setAttribute('aria-checked', si ? 'true' : 'false');
          b.classList.toggle('on', si);
          b.tabIndex = si ? 0 : -1;
        });
        if (!elegido) { const pri = l.find(b => !apagada(b)); if (pri) pri.tabIndex = 0; }
      };
      const elegir = (b, avisarlo) => {
        if (!b || apagada(b)) return;
        const antes = actual();
        pintar(b);
        const v = valorDe(b);
        if (oculto && oculto.value !== v) { oculto.value = v; if (avisarlo) { avisar(oculto, 'input'); avisar(oculto, 'change'); } }
        if (avisarlo && antes !== b && o.alCambiar) o.alCambiar(v, b);
      };
      const alClic = e => {
        const b = e.target.closest ? e.target.closest('[role="radio"]') : null;
        if (b && grupo.contains(b)) elegir(b, true);
      };
      const TECLAS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'ini', End: 'fin' };
      const alTecla = e => {
        const b = e.target.closest ? e.target.closest('[role="radio"]') : null;
        if ((e.key === ' ' || e.key === 'Enter') && b && b.tagName !== 'BUTTON') { e.preventDefault(); elegir(b, true); return; }
        if (!(e.key in TECLAS)) return;
        const lista = opciones().filter(x => !apagada(x));
        if (!lista.length) return;
        let i = lista.indexOf(b);
        if (i < 0) i = lista.indexOf(actual());
        const t = TECLAS[e.key];
        const j = t === 'ini' ? 0 : t === 'fin' ? lista.length - 1 : (i + t + lista.length) % lista.length;
        e.preventDefault();
        elegir(lista[j], true);
        lista[j].focus();
      };
      pintar((oculto && opciones().find(b => valorDe(b) === oculto.value)) || actual());
      grupo.addEventListener('click', alClic);
      grupo.addEventListener('keydown', alTecla);
      const ficha = P.fichaQueViaja(grupo, { activo: '[aria-checked="true"]', clave: o.clave });
      const api = {
        valor() { const b = actual(); return b ? valorDe(b) : ''; },
        fijar(v, avisarlo) {
          const b = opciones().find(x => valorDe(x) === String(v));
          if (b) elegir(b, !!avisarlo);
          else { pintar(null); if (oculto) oculto.value = ''; }
        },
        destruir() {
          grupo.removeEventListener('click', alClic);
          grupo.removeEventListener('keydown', alTecla);
          if (ficha) ficha.destruir();
          glides.delete(grupo);
        }
      };
      glides.set(grupo, api);
      return api;
    };
    /* El mismo grupo como cadena, para las pantallas que pintan con innerHTML. Sin manejadores
       en línea: se le llama opcionesDeslizantes() al grupo después de pintarlo.
       {id, etiqueta, etiquetadaPor, oculto (id del hidden), valor, opciones:[{v, t, sub, clase, apagada}]} */
    P.opcionesDeslizantesHTML = function (o) {
      o = o || {};
      const e = P.esc, v = o.valor != null ? String(o.valor) : null, ops = o.opciones || [];
      let primera = v == null || !ops.some(op => String(op.v) === v);
      const botones = ops.map(op => {
        const si = v != null && String(op.v) === v;
        let tab = si ? 0 : -1;
        if (primera && !op.apagada) { tab = 0; primera = false; }
        return '<button type="button" class="chip' + (si ? ' on' : '') + (op.clase ? ' ' + e(op.clase) : '') +
          '" role="radio" aria-checked="' + (si ? 'true' : 'false') + '" tabindex="' + tab + '" data-v="' + e(op.v) + '"' +
          (op.apagada ? ' aria-disabled="true"' : '') + '>' + e(op.t != null ? op.t : op.v) +
          (op.sub ? '<small>' + e(op.sub) + '</small>' : '') + '</button>';
      }).join('');
      return '<div class="glide" role="radiogroup"' + (o.id ? ' id="' + e(o.id) + '"' : '') +
        (o.etiqueta ? ' aria-label="' + e(o.etiqueta) + '"' : '') +
        (o.etiquetadaPor ? ' aria-labelledby="' + e(o.etiquetadaPor) + '"' : '') +
        (o.oculto ? ' data-valor="' + e(o.oculto) + '"' : '') + '>' + botones + '</div>' +
        (o.oculto ? '<input type="hidden" id="' + e(o.oculto) + '" value="' + e(v || '') + '">' : '');
    };

    /* ======================================================================
       19 · CASILLAS DE CÓDIGO
       Sale de React Bits CodeSlots.

       Un solo <input> transparente encima de las casillas se queda con el foco, el pegado, el
       autocompletado y el lector de pantalla; las casillas son dibujo (`aria-hidden`). La zona
       táctil es la fila entera, no cada casilla de 22 px.

       Normaliza al teclear y al pegar: mayúsculas, sin espacios ni guiones, y las
       equivalencias que se le den —para el código de verificar (A1), O→0 e I/L→1, que es lo que
       se lee mal en un papel—. Lo que no es del alfabeto se quita, la fila se sacude una vez y
       una región viva dice qué se quitó: con menos movimiento no hay sacudida, pero el borde
       rojo y la frase se quedan.

       Con `esperado` (el «BORRAR» de Ajustes, F27) cada casilla que no coincide sale en rojo
       al teclearla, y `completo` solo es verdad con la palabra exacta: el botón que se le pase
       en `boton` lleva `aria-disabled` hasta entonces —aria-disabled y no disabled, para que
       siga explicando por qué no se puede—. Nada de festejo al completar: el verde es
       `marcar('ok')`, cuando la pantalla sabe que el código era bueno.
       ====================================================================== */
    const HEX = Object.freeze({ alfabeto: /[0-9A-F]/, equivalencias: Object.freeze({ O: '0', I: '1', L: '1' }) });
    const sinGlobal = re => (re && re.global) ? new RegExp(re.source, re.flags.replace('g', '')) : re;
    P.codigo = {
      /* Las reglas del código de verificación: el alfabeto de normalizarCodigo() en la hoja
         (0-9A-F) y lo que se confunde al leerlo del papel. */
      HEX,
      /* {valor, rechazados}: lo que queda del texto y lo que se quitó (para decirlo). */
      normalizar(bruto, o) {
        o = o || {};
        const n = o.n > 0 ? o.n : 12, alf = sinGlobal(o.alfabeto) || /[0-9A-Z]/, eq = o.equivalencias || null;
        const sep = sinGlobal(o.separadores) || /[\s\-‐‑–—_.·/]/;
        let s = String(bruto == null ? '' : bruto);
        if (o.mayusculas !== false) s = s.toLocaleUpperCase('es-MX');
        let valor = '';
        const rechazados = [];
        for (const ch of s) {
          if (sep.test(ch)) continue;
          const c = eq && Object.prototype.hasOwnProperty.call(eq, ch) ? eq[ch] : ch;
          if (!alf.test(c) || valor.length >= n) { rechazados.push(ch); continue; }
          valor += c;
        }
        return { valor, rechazados };
      },
      /* «A1B2C3D4E5F6» → «A1B2-C3D4-E5F6». */
      agrupar(valor, grupo, sep) {
        const out = [], s = String(valor || ''), k = grupo > 0 ? grupo : 4;
        for (let i = 0; i < s.length; i += k) out.push(s.slice(i, i + k));
        return out.join(sep == null ? '-' : sep);
      }
    };
    const casillasVivas = new WeakMap();
    /* casillasCodigo(input, {n, grupo, alfabeto, equivalencias, esperado, boton, separador,
         etiqueta, textoRechazo, alCambiar, alCompletar})
       → {valor(), completo(), fijar(v), vaciar(cascada), marcar('ok'|'mal'|null), destruir()} */
    P.casillasCodigo = function (input, o) {
      input = el$(input);
      o = o || {};
      if (!input) return null;
      const ya = casillasVivas.get(input);
      if (ya) return ya;
      const esperado = o.esperado ? String(o.esperado).toLocaleUpperCase('es-MX') : '';
      const n = o.n > 0 ? o.n : esperado ? esperado.length : (+input.getAttribute('data-n') || 12);
      const grupo = o.grupo > 0 ? o.grupo : (+input.getAttribute('data-grupo') || (esperado ? n : 4));
      const reglas = {
        n, mayusculas: o.mayusculas,
        alfabeto: o.alfabeto || (esperado ? /[0-9A-ZÑÁÉÍÓÚÜ]/ : /[0-9A-Z]/),
        equivalencias: o.equivalencias || null
      };
      let caja = input.closest('.casillas');
      if (!caja) {
        caja = d.createElement('span');
        caja.className = 'casillas';
        input.parentNode.insertBefore(caja, input);
        caja.appendChild(input);
      }
      let cas = Array.from(caja.querySelectorAll('.casilla'));
      if (cas.length !== n) {
        caja.querySelectorAll('.casillas-grupo').forEach(x => x.remove());
        cas = [];
        for (let i = 0; i < n; i += grupo) {
          const gr = d.createElement('span');
          gr.className = 'casillas-grupo';
          gr.setAttribute('aria-hidden', 'true');
          for (let j = i; j < Math.min(n, i + grupo); j++) {
            const c = d.createElement('span');
            c.className = 'casilla';
            c.style.setProperty('--i', j);
            gr.appendChild(c);
            cas.push(c);
          }
          caja.appendChild(gr);
        }
      }
      let voz = caja.querySelector('.casillas-voz');
      if (!voz) {
        voz = d.createElement('span');
        voz.className = 'casillas-voz solo-voz';
        voz.setAttribute('role', 'status');
        voz.setAttribute('aria-live', 'polite');
        caja.appendChild(voz);
      }
      input.classList.add('casillas-in');
      [['autocomplete', 'off'], ['autocapitalize', 'characters'], ['autocorrect', 'off'], ['spellcheck', 'false']]
        .forEach(([k, v]) => { if (!input.hasAttribute(k)) input.setAttribute(k, v); });
      if (!input.getAttribute('inputmode')) input.setAttribute('inputmode', 'text');
      if (!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby') && !(input.labels && input.labels.length)) {
        input.setAttribute('aria-label', o.etiqueta || ('Código de ' + n + ' caracteres'));
      }
      const boton = el$(o.boton);
      let completoAntes = null, reloj = 0, cascada = 0;
      const decir = t => { voz.textContent = ''; g.setTimeout(() => { voz.textContent = t; }, 40); };
      const rechazar = chars => {
        const unicos = Array.from(new Set(chars)).slice(0, 3).map(c => c === ' ' ? 'un espacio' : '«' + c + '»');
        decir(typeof o.textoRechazo === 'function' ? o.textoRechazo(chars)
          : (o.textoRechazo || 'No va en el código') + ': ' + unicos.join(', '));
        caja.classList.remove('rechazo');
        void caja.offsetWidth;
        caja.classList.add('rechazo');
        g.clearTimeout(reloj);
        reloj = g.setTimeout(() => caja.classList.remove('rechazo'), 650);
      };
      const alFinal = () => { try { const k = input.value.length; input.setSelectionRange(k, k); } catch (_) { } };
      const pintar = tecleo => {
        const r = P.codigo.normalizar(input.value, reglas);
        if (input.value !== r.valor) { input.value = r.valor; alFinal(); }
        if (tecleo && r.rechazados.length) rechazar(r.rechazados);
        const v = r.valor, foco = d.activeElement === input;
        cas.forEach((c, i) => {
          const ch = v[i] || '';
          if (c.textContent !== ch) c.textContent = ch;
          c.classList.toggle('llena', !!ch);
          c.classList.toggle('cursor', foco && v.length < n && i === v.length);
          c.classList.toggle('mal', !!esperado && !!ch && ch !== esperado[i]);
        });
        const completo = v.length === n && (!esperado || v === esperado);
        caja.classList.toggle('completo', completo);
        if (!completo) caja.classList.remove('acierto');
        if (boton) boton.setAttribute('aria-disabled', completo ? 'false' : 'true');
        if (tecleo) {
          if (o.alCambiar) o.alCambiar(v, completo);
          if (completo && completoAntes === false && o.alCompletar) o.alCompletar(P.codigo.agrupar(v, grupo, o.separador));
        }
        completoAntes = completo;
      };
      const alEscribir = () => pintar(true);
      const alFoco = () => { pintar(false); alFinal(); };
      const alSalir = () => pintar(false);
      /* El cursor vive al final: las casillas no saben dibujar uno a la mitad, y teclear donde
         no se ve es escribir a ciegas. Borrar es de atrás hacia adelante. */
      const alTecla = e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'Home') e.preventDefault(); };
      input.addEventListener('input', alEscribir);
      input.addEventListener('focus', alFoco);
      input.addEventListener('click', alFoco);
      input.addEventListener('blur', alSalir);
      input.addEventListener('keydown', alTecla);
      pintar(false);
      const api = {
        valor: () => input.value,
        completo: () => caja.classList.contains('completo'),
        fijar(v) { input.value = String(v == null ? '' : v); pintar(false); },
        /* Vaciar en cascada es borrar de derecha a izquierda, una casilla cada 35 ms: la cascada
           de A1 sin animar ninguna propiedad. Con menos movimiento, de una vez. */
        vaciar(conCascada) {
          g.clearTimeout(cascada);
          if (!conCascada || P.sinMovimiento() || !input.value) { input.value = ''; pintar(false); return Promise.resolve(); }
          return new Promise(res => {
            const paso = () => {
              input.value = input.value.slice(0, -1);
              pintar(false);
              if (input.value) cascada = g.setTimeout(paso, 35); else res();
            };
            paso();
          });
        },
        marcar(estado) {
          caja.classList.remove('acierto', 'fallo');
          if (estado === 'ok') caja.classList.add('acierto');
          else if (estado === 'mal') {
            caja.classList.add('fallo');
            g.setTimeout(() => caja.classList.remove('fallo'), 900);
            return api.vaciar(true);
          }
          return Promise.resolve();
        },
        destruir() {
          input.removeEventListener('input', alEscribir);
          input.removeEventListener('focus', alFoco);
          input.removeEventListener('click', alFoco);
          input.removeEventListener('blur', alSalir);
          input.removeEventListener('keydown', alTecla);
          casillasVivas.delete(input);
        }
      };
      casillasVivas.set(input, api);
      return api;
    };
    /* Las casillas como cadena: {id, n, grupo, esperado, etiqueta, describe, clase, inputmode}.
       Pintarlas ya hechas evita el brinco de la fila al engancharlas. */
    P.casillasCodigoHTML = function (o) {
      o = o || {};
      const e = P.esc, n = o.n > 0 ? o.n : (o.esperado ? String(o.esperado).length : 12);
      const gr = o.grupo > 0 ? o.grupo : (o.esperado ? n : 4);
      let grupos = '';
      for (let i = 0; i < n; i += gr) {
        let c = '';
        for (let j = i; j < Math.min(n, i + gr); j++) c += '<span class="casilla" style="--i:' + j + '"></span>';
        grupos += '<span class="casillas-grupo" aria-hidden="true">' + c + '</span>';
      }
      return '<span class="casillas' + (o.clase ? ' ' + e(o.clase) : '') + '">' +
        '<input class="casillas-in" type="text"' + (o.id ? ' id="' + e(o.id) + '"' : '') +
        ' inputmode="' + e(o.inputmode || 'text') + '" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false"' +
        ' data-n="' + n + '" data-grupo="' + gr + '" aria-label="' + e(o.etiqueta || ('Código de ' + n + ' caracteres')) + '"' +
        (o.describe ? ' aria-describedby="' + e(o.describe) + '"' : '') + '>' +
        grupos + '<span class="casillas-voz solo-voz" role="status" aria-live="polite"></span></span>';
    };

    /* ======================================================================
       19 · EL TELÉFONO QUE SE VE COMPLETO
       C8: «33 2813 0092 ✓» en vivo, con el contador «8/10» en el borde del campo.

       El criterio NO es de esta pieza. Qué número recibe WhatsApp lo decide la regla que ya
       existe —`telWhatsApp` en js/cotizador/entrega.js y `telWa` en js/nucleo/ui.js, que
       pruebas/replicas.mjs mantiene iguales—: la pieza usa la del cotizador si está cargada,
       la que se le pase en `numeroWa`, o `P.telefono.numeroWa`, que es la misma regla y que
       pruebas/piezas-numeros.mjs compara contra las otras dos caso por caso. Así el ✓ nunca
       dice «completo» de un número que WhatsApp leería distinto.

       Lo único que agrega es decir cuando lo tecleado CONTRADICE la lectura de la regla. La
       regla cuenta dígitos y tira el «+»: «+52 33 1234 56» son diez dígitos y la regla los lee
       como el celular 52 3312 3456. La pieza no le pone ✓ a eso: dice «después del +52 van 10
       dígitos: llevas 8», en ámbar. Igual con once dígitos sin «+», que la regla acepta como
       número internacional y casi siempre es un dígito de más.

       Se reescribe el campo con espacios mientras el número es nacional y limpio, conservando
       el cursor por DÍGITOS; con un prefijo tecleado (+52, 044, 01) se deja como va hasta que
       la regla lo reconoce, y entonces queda en diez: pegar «+52 3328130092» deja
       «33 2813 0092». El formato se aplica ANTES que el oninput de la app (el oyente va en
       captura, en la caja), así que `upd('tel', this.value)` recibe ya el número con espacios.
       ====================================================================== */
    P.telefono = {
      /* La regla de telWa/telWhatsApp, línea por línea: el porqué de cada rama está allá. */
      numeroWa(tel) {
        let dd = String(tel || '').replace(/\D/g, '');
        if (!dd) return '';
        if (dd[0] === '0') {
          if (/^(044|045|01)[1-9]\d{9}$/.test(dd)) dd = dd.slice(-10);
          else if (/^00[1-9]/.test(dd)) dd = dd.slice(2);
          else return '';
        }
        if (dd.length === 10) return '52' + dd;
        if (dd.length === 12 && dd.startsWith('52')) return dd;
        if (dd.length === 13 && dd.startsWith('521')) return dd;
        if (dd.length >= 11 && dd.length <= 15) return dd;
        return '';
      },
      /* Qué se tecleó, leído con la regla. `estado`: vacio · faltan · completo · internacional ·
         internacional-parcial · revisa · sobran · no. `completo` es verdad en completo e
         internacional. `nacional` son los diez (o los que van) sin lada ni prefijo. */
      leer(tel, regla) {
        regla = typeof regla === 'function' ? regla : P.telefono.numeroWa;
        const bruto = String(tel == null ? '' : tel), dig = bruto.replace(/\D/g, '');
        let pre = '';
        if (/^\s*\+/.test(bruto)) pre = '+';
        else if (/^00/.test(dig)) pre = '00';
        else if (/^04[45]/.test(dig)) pre = dig.slice(0, 3);
        else if (/^01/.test(dig)) pre = '01';
        const out = { bruto, digitos: dig, prefijo: pre, wa: '', nacional: '', estado: 'vacio', completo: false, cuenta: 0 };
        if (!dig) return out;
        const wa = regla(bruto) || '';
        out.wa = wa;
        const mex = (wa.length === 12 && wa.startsWith('52')) || (wa.length === 13 && wa.startsWith('521'));
        const intl = pre === '+' || pre === '00';
        /* Lo que se tecleó después de la lada de país, cuando se tecleó «+» o «00»: null si esa
           lada no es la de México. */
        let tras = dig;
        if (intl) {
          tras = pre === '00' ? dig.slice(2) : dig;
          if (tras.startsWith('521') && tras.length > 12) tras = tras.slice(3);
          else if (tras.startsWith('52')) tras = tras.slice(2);
          else tras = null;
        } else if (pre) tras = dig.slice(pre.length);
        if (mex) {
          const nac = wa.slice(-10);
          if (intl && tras !== nac) { out.estado = 'revisa'; out.nacional = tras || ''; out.cuenta = out.nacional.length; return out; }
          out.nacional = nac; out.estado = 'completo'; out.completo = true; out.cuenta = 10;
          return out;
        }
        if (wa) {
          out.cuenta = dig.length;
          if (intl) { out.estado = 'internacional'; out.completo = true; }
          else out.estado = 'revisa';
          return out;
        }
        if (tras == null) { out.estado = 'internacional-parcial'; out.cuenta = dig.length; return out; }
        if (!pre && dig[0] === '0') { out.estado = 'no'; out.cuenta = dig.length; out.nacional = dig; return out; }
        out.nacional = tras;
        out.cuenta = tras.length;
        out.estado = tras.length < 10 ? 'faltan' : tras.length > 10 ? 'sobran' : 'no';
        return out;
      },
      /* «3328130092» → «33 2813 0092»: dos, cuatro y cuatro, como el placeholder del
         cotizador. Con una lada de tres dígitos se lee igual; los dígitos son los mismos. */
      formato(dig) {
        const s = String(dig || '').replace(/\D/g, '');
        if (s.length <= 2) return s;
        if (s.length <= 6) return s.slice(0, 2) + ' ' + s.slice(2);
        return s.slice(0, 2) + ' ' + s.slice(2, 6) + ' ' + s.slice(6);
      },
      /* La posición del cursor después de `digitos` dígitos de `texto`. */
      cursor(texto, digitos) {
        let k = 0, p = 0;
        while (p < texto.length && k < digitos) { if (esDigito(texto[p])) k++; p++; }
        return p;
      },
      /* Lo que dice el contador del borde del campo: «8/10», «✓», o «+11» si es internacional. */
      contador(L) {
        return L.completo ? '✓' : L.estado === 'internacional-parcial' ? '+' + L.cuenta : L.cuenta + '/10';
      },
      /* La frase de estado para el lector de pantalla (va en aria-describedby). */
      frase(L) {
        const f = L.cuenta, s = x => x === 1 ? '' : 's';
        switch (L.estado) {
          case 'vacio': return 'Teléfono de 10 dígitos';
          case 'faltan': return (10 - f === 1 ? 'Falta 1 dígito' : 'Faltan ' + (10 - f) + ' dígitos');
          case 'completo': return 'Teléfono completo';
          case 'internacional': return 'Número internacional';
          case 'internacional-parcial': return 'Número internacional: sigue escribiendo';
          case 'revisa': return L.prefijo === '+' || L.prefijo === '00'
            ? 'Después del +52 van 10 dígitos: llevas ' + f
            : 'Son ' + f + ' dígitos: si es de México, sobra' + (f - 10 === 1 ? '' : 'n') + ' ' + (f - 10);
          case 'sobran': return 'Sobra' + (f - 10 === 1 ? '' : 'n') + ' ' + (f - 10) + ' dígito' + s(f - 10);
          case 'no': return 'Un teléfono de México no empieza con 0';
          default: return '';
        }
      }
    };
    const telefonos = new WeakMap();
    /* telefonoVivo(input, {numeroWa, alCambiar}) → {repintar(), estado(), destruir()}
       `repintar()` es para cuando la app escribe el campo sin evento (historial.js al abrir una
       cotización, autocompletarCliente()). */
    P.telefonoVivo = function (input, o) {
      input = el$(input);
      o = o || {};
      if (!input) return null;
      const ya = telefonos.get(input);
      if (ya) return ya;
      const regla = typeof o.numeroWa === 'function' ? o.numeroWa
        : typeof g.telWhatsApp === 'function' ? g.telWhatsApp : P.telefono.numeroWa;
      let caja = input.closest('.tel-vivo');
      if (!caja) {
        caja = d.createElement('span');
        caja.className = 'tel-vivo';
        input.parentNode.insertBefore(caja, input);
        caja.appendChild(input);
      }
      input.classList.add('tel-vivo-in');
      let cuenta = caja.querySelector('.tel-cuenta');
      if (!cuenta) {
        cuenta = d.createElement('span');
        cuenta.className = 'tel-cuenta';
        cuenta.setAttribute('aria-hidden', 'true');
        caja.appendChild(cuenta);
      }
      let voz = caja.querySelector('.tel-estado');
      if (!voz) {
        voz = d.createElement('span');
        voz.className = 'tel-estado solo-voz';
        caja.appendChild(voz);
      }
      if (!voz.id) voz.id = nuevoId('tel-estado');
      const desc = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (desc.indexOf(voz.id) < 0) input.setAttribute('aria-describedby', desc.concat(voz.id).join(' '));
      let digAntes = null, completoAntes = null, ultimo = null, reloj = 0;
      const pintar = e => {
        let v = input.value, cursorDig = null;
        const pos = input.selectionStart != null ? input.selectionStart : v.length;
        let antesCursor = v.slice(0, pos).replace(/\D/g, '').length;
        /* Retroceso sobre un espacio: los dígitos no cambiaron, y reescribir el campo devolvería
           el espacio —la tecla no haría nada—. Se borra el dígito de antes, que es lo que la
           persona quería. Suprimir, el de después. */
        const dig0 = v.replace(/\D/g, '');
        if (e && digAntes != null && dig0 === digAntes && /^delete/.test(e.inputType || '') && !/^\s*\+/.test(v)) {
          if (e.inputType === 'deleteContentBackward' && antesCursor > 0) {
            v = dig0.slice(0, antesCursor - 1) + dig0.slice(antesCursor);
            antesCursor--;
          } else if (e.inputType === 'deleteContentForward' && antesCursor < dig0.length) {
            v = dig0.slice(0, antesCursor) + dig0.slice(antesCursor + 1);
          }
        }
        const L = P.telefono.leer(v, regla);
        let texto = v;
        if (L.estado === 'completo') {
          texto = P.telefono.formato(L.nacional);
          cursorDig = Math.max(0, antesCursor - (L.digitos.length - 10));
        } else if (!L.prefijo && L.digitos.length <= 10 && L.estado !== 'no') {
          texto = P.telefono.formato(L.digitos);
          cursorDig = antesCursor;
        }
        if (texto !== input.value) {
          input.value = texto;
          if (d.activeElement === input && cursorDig != null) {
            const p = P.telefono.cursor(texto, cursorDig);
            try { input.setSelectionRange(p, p); } catch (_) { }
          }
        }
        digAntes = input.value.replace(/\D/g, '');
        const t = P.telefono.contador(L);
        if (cuenta.textContent !== t) cuenta.textContent = t;
        caja.classList.toggle('completo', L.completo);
        caja.classList.toggle('revisa', L.estado === 'revisa' || L.estado === 'sobran' || L.estado === 'no');
        caja.setAttribute('data-estado', L.estado);
        const fr = P.telefono.frase(L);
        if (voz.textContent !== fr) voz.textContent = fr;
        if (e && L.completo && completoAntes === false) {
          caja.classList.remove('recien');
          void caja.offsetWidth;
          caja.classList.add('recien');
          g.clearTimeout(reloj);
          reloj = g.setTimeout(() => caja.classList.remove('recien'), 700);
        }
        completoAntes = L.completo;
        ultimo = L;
        if (e && o.alCambiar) o.alCambiar(L);
        return L;
      };
      /* En captura y en la caja, que es un ancestro: así corre ANTES que el oninput del campo. */
      const alEscribir = e => { if (e.target === input) pintar(e); };
      caja.addEventListener('input', alEscribir, true);
      const alSalir = () => pintar(null);
      input.addEventListener('change', alSalir);
      input.addEventListener('blur', alSalir);
      pintar(null);
      const api = {
        repintar: () => pintar(null),
        estado: () => ultimo,
        destruir() {
          caja.removeEventListener('input', alEscribir, true);
          input.removeEventListener('change', alSalir);
          input.removeEventListener('blur', alSalir);
          telefonos.delete(input);
        }
      };
      telefonos.set(input, api);
      return api;
    };
    /* El campo como cadena, para una pantalla que lo pinta con innerHTML:
       {id, valor, placeholder, etiquetadoPor, describe, requerido}. */
    P.telefonoVivoHTML = function (o) {
      o = o || {};
      const e = P.esc, L = P.telefono.leer(o.valor || '');
      return '<span class="tel-vivo' + (L.completo ? ' completo' : '') + '"><input class="tel-vivo-in" type="tel" inputmode="tel" autocomplete="tel-national"' +
        (o.id ? ' id="' + e(o.id) + '"' : '') + ' placeholder="' + e(o.placeholder || '33 0000 0000') + '"' +
        ' value="' + e(L.estado === 'completo' ? P.telefono.formato(L.nacional) : (o.valor || '')) + '"' +
        (o.etiquetadoPor ? ' aria-labelledby="' + e(o.etiquetadoPor) + '"' : '') +
        (o.describe ? ' aria-describedby="' + e(o.describe) + '"' : '') +
        (o.requerido ? ' aria-required="true"' : '') + '>' +
        '<span class="tel-cuenta" aria-hidden="true">' + e(P.telefono.contador(L)) + '</span></span>';
    };

    /* ======================================================================
       20 · MEDIDORES QUIETOS
       Sale de React Bits SloshGauge, sin el oleaje: solo la lectura del nivel.

       Una barra de 6 px que no se mueve. Tres señales que no dependen del color, porque el
       color nunca es la única: el LLENO (lo que hay, lo cobrado, lo que ocupa el respaldo), el
       RAYADO (lo que ya tiene dueño, o todo el lleno cuando el dato es estimado —el saldo que
       viene de Notion y no de la hoja—) y la MUESCA (el mínimo, lo que piden). El hueco hasta la
       meta va punteado en ámbar. Un valor negativo —el libro en rojo— sale vacío con una marca
       roja en el cero.

       La barra no lleva texto encima y la frase de hoy se queda: sin `texto`, el medidor es
       `aria-hidden` (la frase de al lado ya lo dice); con `texto`, es un role="img" con esa
       frase. En papel se imprime —print-color-adjust—, y si no, la frase va de todos modos.
       ====================================================================== */
    const fx = n => +(+n).toFixed(4);
    const medidorPartes = m => '<i class="medidor-lleno"></i>' + (m.r > 0 ? '<i class="medidor-rayado"></i>' : '') +
      (m.meta != null ? '<i class="medidor-falta"></i>' : '') + (m.muesca != null ? '<i class="medidor-muesca"></i>' : '') +
      (m.bajoCero ? '<i class="medidor-cero"></i>' : '');
    const medidorEstilo = m => '--v:' + fx(m.v) + ';--r:' + fx(m.r) + (m.meta != null ? ';--meta:' + fx(m.meta) : '') +
      (m.muesca != null ? ';--muesca:' + fx(m.muesca) : '');
    const TONOS = ['ok', 'av', 'mal'];
    const medidorClases = (m, o) => 'medidor' + (TONOS.indexOf(o.tono) >= 0 ? ' tono-' + o.tono : '') + (o.estimado ? ' estimado' : '') +
      (m.bajoCero ? ' bajo-cero' : '') + (o.clase ? ' ' + o.clase : '');
    /* medidorHTML({valor, max, rayado, meta, muesca, estimado, tono, texto, clase}) → cadena */
    P.medidorHTML = function (o) {
      o = o || {};
      const m = P.cifras.medidor(o), e = P.esc;
      return '<span class="' + e(medidorClases(m, o)) + '" style="' + medidorEstilo(m) + '"' +
        (o.texto ? ' role="img" aria-label="' + e(o.texto) + '"' : ' aria-hidden="true"') + '>' + medidorPartes(m) + '</span>';
    };
    /* pintarMedidor(el, opciones): el mismo medidor sobre un elemento que ya existe. */
    P.pintarMedidor = function (el, o) {
      el = el$(el);
      o = o || {};
      if (!el) return null;
      const m = P.cifras.medidor(o);
      el.className = medidorClases(m, o);
      el.setAttribute('style', medidorEstilo(m));
      if (o.texto) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', o.texto); el.removeAttribute('aria-hidden'); }
      else { el.removeAttribute('role'); el.removeAttribute('aria-label'); el.setAttribute('aria-hidden', 'true'); }
      el.innerHTML = medidorPartes(m);
      return m;
    };

    /* ======================================================================
       EL DESLIZADOR CON IMANES
       Sale de React Bits ElasticSlider y WakeSlider (C17 anticipo, C18 precio, H9 vectorizador).

       Sobre un <input type="range"> NATIVO, y es a propósito: el teclado (flechas, Re Pág,
       Inicio, Fin), el lector de pantalla y el foco vienen gratis y se comportan como en todas
       partes. Lo que se agrega:
         · imanes: al arrastrar, el valor se pega a un imán si pasa a menos de 12 px (o del
           radio que traiga el imán en unidades: el 50 % del anticipo pesa más que un cien);
           fuera de ellos, se redondea (a cientos). Solo al arrastrar: la flecha del teclado
           avanza lo suyo, y con `pasoTeclado` Re Pág/Av Pág saltan de imán en imán;
         · marcas con rótulo, y los rótulos que no caben no se pintan —las rayitas sí—;
         · la pastilla con el valor, pegada al pulgar (H9);
         · la liga: al jalar más allá de un tope, el riel se estira un poco y regresa al soltar
           (ElasticSlider). Solo con `elastico` y nunca con menos movimiento;
         · un `campo` espejo (#f-anti, #a-precio): el deslizador lo escribe y despacha `input`
           al moverse y `change` al soltar, y lo tecleado en el campo mueve el pulgar. El campo es
           la fuente: si alguien teclea −25 %, el pulgar se queda en el tope y la caja lleva
           `.fuera` para que la pantalla lo diga;
         · `alSoltar`, en el `change` nativo: al soltar el dedo, o una vez por tecla. Es donde el
           vectorizador vuelve a trazar (H9: en `change` y no en `input`, por la gama media).
       El oyente del `input` va en captura en la caja: así el imán ya se aplicó cuando corre el
       oninput de la app. No vibra en los imanes (vibrar() es de autorizar, borrar y rechazar).
       ====================================================================== */
    const PULGAR = 44;              // el pulgar mide 44 px: la zona táctil; se ve de 24
    const deslizadores = new WeakMap();
    const normImanes = l => (l || []).map(im => typeof im === 'object' ? { v: +im.v, radio: im.radio, t: im.t } : { v: +im });
    /* deslizadorConImanes(input, {imanes, radioPx, redondeo, pasoTeclado, marcas, etiqueta, texto,
         pastilla, elastico, origen, grueso, campo, formatoCampo, alMover, alSoltar})
       → {valor(), fijar(v, avisar), rango(min, max, {imanes, marcas, origen}), destruir()} */
    P.deslizadorConImanes = function (input, o) {
      input = el$(input);
      o = o || {};
      if (!input || input.type !== 'range') return null;
      const ya = deslizadores.get(input);
      if (ya) return ya;
      const lee = (a, def) => { const v = parseFloat(a); return isFinite(v) ? v : def; };
      const cfg = {
        min: lee(input.min, 0), max: lee(input.max, 100),
        imanes: normImanes(o.imanes), marcas: o.marcas, origen: o.origen
      };
      if (o.pasoTeclado > 0) input.step = 'any';
      let caja = input.closest('.desl-caja');
      if (!caja) {
        caja = d.createElement('span');
        caja.className = 'desl-caja';
        input.parentNode.insertBefore(caja, input);
        caja.appendChild(input);
      }
      input.classList.add('desl-iman');
      if (o.grueso) input.classList.add('grueso');
      let pastilla = null;
      if (o.pastilla) {
        pastilla = caja.querySelector('.desl-pastilla');
        if (!pastilla) {
          pastilla = d.createElement('span');
          pastilla.className = 'desl-pastilla';
          pastilla.setAttribute('aria-hidden', 'true');
          caja.insertBefore(pastilla, input);
        }
        caja.classList.add('con-pastilla');
      }
      let marcas = caja.querySelector('.desl-marcas');
      if (!marcas) {
        marcas = d.createElement('span');
        marcas.className = 'desl-marcas';
        marcas.setAttribute('aria-hidden', 'true');
        caja.appendChild(marcas);
      }
      const campo = el$(o.campo);
      let arrastrando = false, escribiendo = false, liga = null, vivo = true;
      const k = x => cfg.max > cfg.min ? acotar((x - cfg.min) / (cfg.max - cfg.min), 0, 1) : 0;
      const etiqueta = x => typeof o.etiqueta === 'function' ? String(o.etiqueta(x)) : fmtNum(x);
      const pasoNativo = () => { const s = parseFloat(input.step); return s > 0 ? s : (o.pasoTeclado > 0 ? o.pasoTeclado : 1); };
      const listaMarcas = () => {
        let l = cfg.marcas;
        if (l === true || l === 'pasos') {
          const paso = pasoNativo();
          l = [];
          for (let x = cfg.min; x <= cfg.max + 1e-9 && l.length < 200; x = redondear(x + paso, 6)) l.push(x);
        } else if (!Array.isArray(l)) l = cfg.imanes.map(im => ({ v: im.v, t: im.t }));
        return l.map(m => typeof m === 'object' ? { v: +m.v, t: m.t != null ? String(m.t) : etiqueta(+m.v) } : { v: +m, t: etiqueta(+m) });
      };
      const acomodarMarcas = () => {
        const W = input.offsetWidth;
        if (!W) return;
        const hijos = Array.from(marcas.children);
        const datos = hijos.map((s, i) => ({
          x: PULGAR / 2 + (+s.style.getPropertyValue('--k')) * (W - PULGAR),
          w: s.firstChild ? s.firstChild.getBoundingClientRect().width : 0,
          prioridad: (i === 0 || i === hijos.length - 1) ? 2 : s.classList.contains('iman') ? 1 : 0
        }));
        const ver = P.cifras.marcasQueCaben(datos, 6);
        hijos.forEach((s, i) => s.classList.toggle('sin-texto', !ver[i]));
      };
      const pintarMarcas = () => {
        marcas.textContent = '';
        listaMarcas().forEach(m => {
          const s = d.createElement('span');
          s.className = 'desl-marca' + (cfg.imanes.some(im => Math.abs(im.v - m.v) < 1e-9) ? ' iman' : '');
          s.style.setProperty('--k', String(+k(m.v).toFixed(5)));
          s.setAttribute('data-v', String(m.v));
          const b = d.createElement('b');
          b.textContent = m.t;
          s.appendChild(b);
          marcas.appendChild(s);
        });
        acomodarMarcas();
      };
      const ponerPastilla = () => {
        if (!pastilla) return;
        const W = input.offsetWidth;
        if (!W) return;
        const cx = PULGAR / 2 + k(+input.value) * (W - PULGAR), pw = pastilla.offsetWidth;
        const x = acotar(cx, pw / 2, W - pw / 2);
        pastilla.style.transform = 'translateX(' + (x - pw / 2) + 'px)';
        pastilla.style.setProperty('--fx', (cx - x) + 'px');
      };
      const pintar = () => {
        const val = +input.value;
        caja.style.setProperty('--p', String(+k(val).toFixed(5)));
        caja.style.setProperty('--p0', String(+k(cfg.origen != null ? cfg.origen : cfg.min).toFixed(5)));
        const medio = pasoNativo() / 2;
        Array.from(marcas.children).forEach(s => s.classList.toggle('en', Math.abs(+s.getAttribute('data-v') - val) < medio + 1e-9));
        const txt = typeof o.texto === 'function' ? String(o.texto(val)) : etiqueta(val);
        if (input.getAttribute('aria-valuetext') !== txt) input.setAttribute('aria-valuetext', txt);
        if (pastilla) { const pt = etiqueta(val); if (pastilla.textContent !== pt) pastilla.textContent = pt; ponerPastilla(); }
      };
      const escribirCampo = tipo => {
        if (!campo) return;
        const f = typeof o.formatoCampo === 'function' ? o.formatoCampo : (x => String(redondear(x, 2)));
        const t = f(+input.value);
        escribiendo = true;
        try {
          if (campo.value !== t) campo.value = t;
          avisar(campo, tipo);
        } finally { escribiendo = false; }
        caja.classList.remove('fuera');
      };
      const alInput = e => {
        if (e.target !== input) return;
        if (arrastrando) {
          const bruto = +input.value, W = input.offsetWidth - PULGAR;
          const radio = W > 0 ? (o.radioPx > 0 ? o.radioPx : 12) * (cfg.max - cfg.min) / W : 0;
          const vv = P.cifras.imanar(bruto, { min: cfg.min, max: cfg.max, imanes: cfg.imanes, radio, redondeo: o.redondeo });
          if (vv !== bruto) input.value = String(vv);
        }
        pintar();
        escribirCampo('input');
        if (o.alMover) o.alMover(+input.value);
      };
      const alChange = e => {
        if (e.target !== input) return;
        escribirCampo('change');
        if (o.alSoltar) o.alSoltar(+input.value);
      };
      /* La liga. Se estira contra la caja —que no se transforma— y no contra el campo, que es lo
         que se estira: medir contra lo que crece hace que cada píxel de más empuje el tope. */
      const estirar = x => {
        if (P.sinMovimiento()) return;
        const r = caja.getBoundingClientRect(), izq = r.left + PULGAR / 2, der = r.right - PULGAR / 2;
        let px = 0, lado = 0;
        if (x < izq) { px = P.cifras.decaer(izq - x, 40); lado = -1; }
        else if (x > der) { px = P.cifras.decaer(x - der, 40); lado = 1; }
        if (liga) { liga.cancel(); liga = null; }
        if (!px) { input.style.transform = ''; caja.removeAttribute('data-estira'); return; }
        input.style.transformOrigin = lado < 0 ? 'right center' : 'left center';
        input.style.transform = 'scaleX(' + (1 + px / (input.offsetWidth || 1)) + ')';
        caja.setAttribute('data-estira', String(Math.round(px)));
      };
      const soltarLiga = () => {
        const t = input.style.transform;
        if (!t) return;
        input.style.transform = '';
        caja.removeAttribute('data-estira');
        if (P.sinMovimiento() || typeof input.animate !== 'function') return;
        liga = input.animate([{ transform: t }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        liga.finished.then(() => { liga = null; }, () => { });
      };
      const alBajar = e => {
        if (e.target !== input || (e.button != null && e.button > 0)) return;
        arrastrando = true;
        const id = e.pointerId;
        const mover = ev => { if (ev.pointerId === id && o.elastico) estirar(ev.clientX); };
        const soltar = ev => {
          if (ev.pointerId !== id) return;
          arrastrando = false;
          g.removeEventListener('pointermove', mover);
          g.removeEventListener('pointerup', soltar);
          g.removeEventListener('pointercancel', soltar);
          if (o.elastico) soltarLiga();
        };
        g.addEventListener('pointermove', mover);
        g.addEventListener('pointerup', soltar);
        g.addEventListener('pointercancel', soltar);
      };
      /* Con `pasoTeclado` las flechas avanzan a múltiplos de ese paso (el anticipo de cien en
         cien aunque su valor sea $6,264.48) y Re Pág/Av Pág van al imán siguiente. */
      const alTecla = e => {
        if (!(o.pasoTeclado > 0)) return;
        const pt = o.pasoTeclado, val = +input.value, q = redondear(val / pt, 6);
        const ordenados = cfg.imanes.map(im => im.v).sort((a, b) => a - b);
        let dest;
        switch (e.key) {
          case 'ArrowRight': case 'ArrowUp': dest = Math.floor(q) * pt + pt; break;
          case 'ArrowLeft': case 'ArrowDown': dest = Math.ceil(q) * pt - pt; break;
          case 'PageUp': dest = ordenados.find(x => x > val + 1e-9); if (dest == null) dest = val + pt * 10; break;
          case 'PageDown': dest = ordenados.slice().reverse().find(x => x < val - 1e-9); if (dest == null) dest = val - pt * 10; break;
          default: return;
        }
        e.preventDefault();
        dest = acotar(redondear(dest, Math.max(2, decimalesDe(pt))), cfg.min, cfg.max);
        if (dest === val) return;
        input.value = String(dest);
        avisar(input, 'input');
        avisar(input, 'change');
      };
      const alCampo = () => {
        if (escribiendo) return;
        const n = parseFloat(String(campo.value).replace(/[^\d.-]/g, ''));
        if (!isFinite(n)) return;
        input.value = String(acotar(n, cfg.min, cfg.max));
        caja.classList.toggle('fuera', n < cfg.min - 1e-9 || n > cfg.max + 1e-9);
        pintar();
      };
      caja.addEventListener('input', alInput, true);
      caja.addEventListener('change', alChange, true);
      caja.addEventListener('pointerdown', alBajar, true);
      input.addEventListener('keydown', alTecla);
      if (campo) campo.addEventListener('input', alCampo);
      const ro = typeof g.ResizeObserver === 'function' ? new g.ResizeObserver(() => { if (vivo) { acomodarMarcas(); ponerPastilla(); } }) : null;
      if (ro) ro.observe(caja);
      pintarMarcas();
      if (campo && campo.value !== '') alCampo(); else pintar();
      const api = {
        valor: () => +input.value,
        fijar(x, avisarlo) {
          input.value = String(acotar(+x, cfg.min, cfg.max));
          caja.classList.toggle('fuera', +x < cfg.min - 1e-9 || +x > cfg.max + 1e-9);
          pintar();
          if (avisarlo) escribirCampo('input');
        },
        /* El total cambió (otra partida, factura sí o no) o el calculado del autorizador: nuevo
           rango, nuevos imanes y marcas. No escribe el campo: el valor que manda sigue siendo el
           suyo. */
        rango(nmin, nmax, oo) {
          oo = oo || {};
          cfg.min = +nmin;
          cfg.max = +nmax;
          input.min = String(cfg.min);
          input.max = String(cfg.max);
          if (oo.imanes) cfg.imanes = normImanes(oo.imanes);
          if (oo.marcas !== undefined) cfg.marcas = oo.marcas;
          if (oo.origen !== undefined) cfg.origen = oo.origen;
          pintarMarcas();
          if (campo && campo.value !== '') alCampo(); else pintar();
        },
        destruir() {
          vivo = false;
          caja.removeEventListener('input', alInput, true);
          caja.removeEventListener('change', alChange, true);
          caja.removeEventListener('pointerdown', alBajar, true);
          input.removeEventListener('keydown', alTecla);
          if (campo) campo.removeEventListener('input', alCampo);
          if (ro) ro.disconnect();
          deslizadores.delete(input);
        }
      };
      deslizadores.set(input, api);
      return api;
    };
  }
  /* ── fin de 3 ── */

  /* ==========================================================================
     4 · SEÑALAR, EXPLICAR Y SELLAR
     ========================================================================== */

  /* ── fin de 4 ── */
})(typeof window !== 'undefined' ? window : undefined);
