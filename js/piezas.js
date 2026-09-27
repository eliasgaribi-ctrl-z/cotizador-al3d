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

  /* ── fin de 3 ── */

  /* ==========================================================================
     4 · SEÑALAR, EXPLICAR Y SELLAR
     ========================================================================== */

  /* ── fin de 4 ── */
})(typeof window !== 'undefined' ? window : undefined);
