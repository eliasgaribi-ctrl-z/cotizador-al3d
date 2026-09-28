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

  /* Lo que se MUEVE entre dos estados: la hoja que baja con el dedo, la tarjeta que cambia de
     columna, el renglón que llega o se va, el pliegue que se abre, la fila de fichas que tiene
     más de lo que cabe. Todo esto existía repartido —dos hojas que se bajan con el dedo, una por
     app y casi iguales; tres esqueletos; dos maneras de entrar a una pantalla— y cada arreglo
     había que hacerlo en cada copia.

     Cuatro reglas de la sección, además de las tres de arriba:
       · La pantalla sigue siendo dueña de su repintado y de sus clics. Ninguna pieza pinta la
         lista por ella ni sabe qué hace un botón: reciben elementos o selectores, miden, y
         devuelven un control. Por eso sirven igual al cotizador (manejadores en línea) y a la
         plataforma (delegación, sin guiones en línea).
       · Idempotentes: la segunda llamada sobre el mismo elemento devuelve el MISMO control y no
         cuelga otro oyente. Las que viven sobre listas que se repintan con innerHTML escuchan en
         el contenedor, así que un repintado no las desarma.
       · Un gesto siempre tiene su camino de teclado o de toque simple, y lo que se desliza de
         lado nunca pelea con el scroll: el eje se decide en los primeros 8 px.
       · Nada de esto corre al teclear. Una transición envuelve un cambio de estructura —abrir,
         mover, borrar, cambiar de mes—, nunca el repintado de cada tecla. */

  const _mm = q => { try { return g.matchMedia(q).matches; } catch (_) { return false; } };
  /* Un elemento, de un selector CSS o del elemento mismo. P.$ busca por id; aquí se aceptan
     selectores completos porque las pantallas nombran cosas como '.pf-modal-bg.show>.pf-panel'. */
  const _el = x => (typeof x === 'string' ? d.querySelector(x) : x) || null;
  const _todos = x => {
    if (!x) return [];
    if (typeof x === 'string') return Array.from(d.querySelectorAll(x));
    if (x.nodeType === 1) return [x];
    return Array.from(x).filter(e => e && e.nodeType === 1);
  };
  const _CURVA = 'cubic-bezier(.2,.8,.2,1)';
  const _suave = () => (P.sinMovimiento() ? 'auto' : 'smooth');
  const _raf = f => (g.requestAnimationFrame ? g.requestAnimationFrame(f) : setTimeout(f, 16));
  /* La velocidad del último tramo, en px/ms, de una lista de [tiempo, posición]. */
  const _vel = pts => {
    const a = pts && pts[0], b = pts && pts[pts.length - 1];
    return a && b && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
  };
  /* Decirlo al lector de pantalla. Si la sección de avisos ya dejó su voz, se usa esa; si no, la
     región #vozStatus que traen las tres apps; y en una página que no la trae, una propia. El
     vaciado y la escritura un cuadro después son los que hacen que «Hoja 2 de 5» dos veces
     seguidas se oiga dos veces. */
  let _vozPropia = null;
  function _decir(msg) {
    if (!msg) return;
    if (typeof P.voz === 'function') { try { P.voz(msg); return; } catch (_) {} }
    let el = d.getElementById('vozStatus');
    if (!el) {
      if (!_vozPropia) {
        _vozPropia = d.createElement('div');
        _vozPropia.className = 'solo-voz';
        _vozPropia.setAttribute('role', 'status');
        _vozPropia.setAttribute('aria-live', 'polite');
        (d.body || d.documentElement).appendChild(_vozPropia);
      }
      el = _vozPropia;
    }
    el.textContent = '';
    _raf(() => { el.textContent = String(msg); });
  }

  /* ----- 13 · La hoja del teléfono se baja con el dedo -----
     Sale de React Bits · SwipeToast (despedir por distancia o por latigazo). Entra en la ficha,
     la hoja de trabajo, el asistente y las preguntas de la plataforma (.pf-panel, P10 y F8) y en
     las hojas del cotizador (.modal, C26). Las dos apps la cuelgan en una línea —js/nucleo/ui.js
     y js/cotizador/nucleo.js— con sus propios selectores y la función de cierre de su capa.

     Había dos copias casi iguales y con el mismo defecto: el velo se aclaraba con `opacity`
     sobre el `.modal-bg`, que es el PADRE de la hoja, así que con el dedo abajo la ficha entera
     —texto, botones, el total— se iba hasta el 35 %: la regla 4.3 del sistema, rota a mitad de
     gesto. Ahora el velo se aclara en su COLOR (`--arrastre`, de 0 a 1, ver sistema.css) y la
     hoja se queda en su contraste completo.

     Lo que se conserva de las dos copias, porque se midió:
       · Solo desde el encabezado, o desde el cuerpo cuando está arriba del todo: la primera vez
         que alguien baja por el historial buscando una cotización, la hoja no puede cerrarse. Y
         ahora se mira CUALQUIER caja con scroll entre el dedo y la hoja, no solo el cuerpo: una
         tabla con su propio scroll dentro de la ficha tampoco la cierra.
       · Cierra por distancia —90 px, o el 40 % de una hoja corta: en «¿Seguro?», que mide 200,
         noventa era media hoja— o por la velocidad del último tramo de ~100 ms, con el umbral de
         Sonner y Vaul: 0,11 px/ms. El promedio desde el toque no servía: «tocar, pensarlo y
         deslizar» nunca cerraba.
       · El `touchmove` con passive:false se cuelga solo durante el gesto: colgado siempre, cada
         scroll de la página esperaría a este guion antes de moverse.
       · Se cierra con la función de su capa —la misma de la ×, de Escape y del atrás—, así que
         el foco, la entrada de historial y lo que cada capa limpia pasan igual.
     Lo nuevo: desde el encabezado, hacia arriba, cede hasta 12 px con resistencia y regresa (una
     pared se lee como app trabada; la hoja del sistema operativo cede); de lado, el gesto se le
     deja a lo que esté dentro —un carrusel, un renglón que se desliza—; y con ratón se arrastra
     desde el encabezado, que en una ventana angosta también es hoja.

     Con el dedo va por eventos de TOQUE y no de puntero, a propósito: el cuerpo tiene scroll
     propio y hay que poder decidir a medio gesto si es scroll o es la hoja, y con Pointer Events
     el navegador ya se quedó con el gesto (pointercancel) para cuando se sabe.
     Con menos movimiento la hoja no se desplaza —la hoja de estilos se lo impide con
     !important—, pero el velo sí se aclara y soltar lejos sigue cerrando: se va el adorno, no
     el gesto.

     Y la hoja que se rehace a medio gesto. La plataforma rehace la ficha con innerHTML con la
     capa abierta (repintarEnSitio), y un touchmove o un touchend van SIEMPRE al elemento donde
     empezó el toque: si ese nodo ya no está en el documento, no suben hasta `document`. Con los
     oyentes colgados solo del documento, el gesto se quedaba vivo para siempre —el velo aclarado
     a medias y ningún otro arrastre posible hasta recargar—, que es lo que encontró la revisión.
     Por eso el touchmove y el touchend se oyen en el nodo del toque mismo, un toque nuevo suelta
     cualquier gesto que se haya quedado colgado, y si la hoja deja el documento a medio camino
     el gesto se suelta sin cerrar. */
  const _HOJA = { cierra: 90, velocidad: 0.11, cede: 12 };
  /** Lo que baja la hoja por cada píxel del dedo: todo hacia abajo; hacia arriba, 0,2 y hasta 12. */
  P.hojaResistencia = (bruto, tope = _HOJA.cede) => (bruto >= 0 ? bruto : -Math.min(tope, -bruto * 0.2));
  /** La velocidad del último tramo, en px/ms, de una lista de [tiempo, y]. */
  P.hojaVelocidad = _vel;
  /** ¿Soltar aquí cierra? Por distancia, o por latigazo habiendo recorrido al menos 12 px. */
  P.hojaSeCierra = ({ dy = 0, v = 0, alto = 0, cierra = _HOJA.cierra, velocidad = _HOJA.velocidad } = {}) => {
    const umbral = alto > 0 ? Math.min(cierra, alto * 0.4) : cierra;
    return dy > umbral || (dy > 12 && v > velocidad);
  };

  const _hojas = [];          // una configuración por selector de hoja
  let _gesto = null;          // el arrastre en curso: uno a la vez en todo el documento
  let _hojasOyen = false;
  /* Con ratón no se empieza sobre algo que se toca: la × vive en el encabezado. */
  const _NO_ARRASTRA = 'button,a[href],input,select,textarea,label,summary,[role="button"],[contenteditable="true"]';

  /**
   * Las hojas que casan con `hoja` se bajan con el dedo (y con el ratón, desde la cabeza).
   * @param {{hoja:string, cabeza?:string, cuerpo?:string, excluir?:string,
   *          cierre:(velo:Element, hoja:Element)=>Function|null, activa?:()=>boolean,
   *          cierra?:number, velocidad?:number}} o
   * @returns {{destruir():void}|null}
   */
  P.hojasDeslizables = function (o) {
    if (!o || !o.hoja || typeof o.cierre !== 'function') return null;
    const ya = _hojas.find(c => c.hoja === o.hoja);
    if (ya) return ya.control;
    const cfg = Object.assign({
      cabeza: null, cuerpo: null,
      excluir: 'input,textarea,select,[contenteditable="true"],canvas',
      activa: () => _mm('(max-width:560px)'),
      cierra: _HOJA.cierra, velocidad: _HOJA.velocidad,
    }, o);
    cfg.control = { destruir() { const i = _hojas.indexOf(cfg); if (i >= 0) _hojas.splice(i, 1); } };
    _hojas.push(cfg);
    if (!_hojasOyen) {
      _hojasOyen = true;
      d.addEventListener('touchstart', _hojaToca, { passive: true });
      d.addEventListener('pointerdown', _hojaPuntero);
      d.addEventListener('pointermove', _hojaPunteroMueve);
      d.addEventListener('pointerup', e => { if (_gesto && _gesto.id === e.pointerId) _hojaSuelta(true); });
      d.addEventListener('pointercancel', e => { if (_gesto && _gesto.id === e.pointerId) _hojaSuelta(false); });
    }
    return cfg.control;
  };
  function _hojaDe(t) {
    if (!t || !t.closest) return null;
    for (const cfg of _hojas) { const hoja = t.closest(cfg.hoja); if (hoja) return { cfg, hoja }; }
    return null;
  }
  function _hojaEmpieza(cfg, hoja, t, x, y, extra) {
    if (!cfg.activa()) return false;
    if (cfg.excluir && t.closest(cfg.excluir)) return false;
    const cab = cfg.cabeza ? t.closest(cfg.cabeza) : null;
    const desdeCabeza = !!(cab && hoja.contains(cab));
    if (!desdeCabeza) {
      const cuerpo = cfg.cuerpo ? t.closest(cfg.cuerpo) : null;
      if (!cuerpo || !hoja.contains(cuerpo)) return false;
      for (let n = t; n && n !== hoja; n = n.parentElement) if (n.scrollTop > 0) return false;
    }
    const velo = hoja.parentElement;
    const cerrar = cfg.cierre(velo, hoja);
    if (typeof cerrar !== 'function') return false;
    _gesto = Object.assign({ cfg, hoja, velo, cerrar, desdeCabeza, x0: x, y0: y, dy: 0, activo: false, pts: [], alto: 0 }, extra);
    return true;
  }
  function _hojaToca(e) {
    if (e.touches.length !== 1) return;
    /* Un solo dedo en la pantalla quiere decir que cualquier gesto anterior ya terminó, aunque su
       touchend no haya llegado nunca. */
    if (_gesto) _hojaSuelta(false);
    const t = e.target, h = _hojaDe(t); if (!h) return;
    const p = e.touches[0];
    if (_hojaEmpieza(h.cfg, h.hoja, t, p.clientX, p.clientY, { tipo: 'toque', blanco: t })) {
      t.addEventListener('touchmove', _hojaToqueMueve, { passive: false });
      t.addEventListener('touchend', _hojaToqueSuelta, { passive: true });
      t.addEventListener('touchcancel', _hojaToqueCancela, { passive: true });
    }
  }
  function _hojaToqueMueve(e) {
    if (!_gesto || _gesto.tipo !== 'toque') return;
    if (e.touches.length !== 1) { _hojaSuelta(false); return; }   // un segundo dedo no mueve la hoja
    const p = e.touches[0];
    /* Que no se mueva la página de atrás ni se dispare el «jalar para recargar». */
    if (_hojaMueve(p.clientX, p.clientY, e.timeStamp) && e.cancelable) e.preventDefault();
  }
  function _hojaToqueSuelta() { if (_gesto && _gesto.tipo === 'toque') _hojaSuelta(true); }
  function _hojaToqueCancela() { if (_gesto && _gesto.tipo === 'toque') _hojaSuelta(false); }
  function _hojaPuntero(e) {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    /* Un botón que baja sin que el anterior haya subido: aquel pointerup se perdió (un diálogo
       del sistema, una ventana encima). Se suelta sin cerrar. */
    if (_gesto && _gesto.tipo === 'puntero') _hojaSuelta(false);
    if (_gesto) return;
    const t = e.target, h = _hojaDe(t); if (!h) return;
    if (!h.cfg.cabeza || !t.closest(h.cfg.cabeza) || t.closest(_NO_ARRASTRA)) return;
    _hojaEmpieza(h.cfg, h.hoja, t, e.clientX, e.clientY, { tipo: 'puntero', id: e.pointerId, capta: t });
  }
  function _hojaPunteroMueve(e) {
    const gs = _gesto; if (!gs || gs.tipo !== 'puntero' || e.pointerId !== gs.id) return;
    if (!_hojaMueve(e.clientX, e.clientY, e.timeStamp)) return;
    if (!gs.captado) {
      gs.captado = true;
      try { gs.capta.setPointerCapture(e.pointerId); } catch (_) {}
      try { g.getSelection().removeAllRanges(); } catch (_) {}
    }
    e.preventDefault();
  }
  /* true si el movimiento es de la hoja. */
  function _hojaMueve(x, y, ts) {
    const gs = _gesto, bruto = y - gs.y0;
    /* La pantalla rehízo la hoja: el dedo ya no lleva nada que se vea. */
    if (!gs.hoja.isConnected) { _hojaSuelta(false); return false; }
    if (!gs.activo) {
      const ax = Math.abs(x - gs.x0), ay = Math.abs(bruto);
      if (ax < 6 && ay < 6) return false;
      /* De lado es de otra pieza; hacia arriba desde el cuerpo es scroll. En los dos casos la
         hoja se aparta del gesto entero y el navegador sigue con él. */
      if (ax > ay || (bruto < 0 && !gs.desdeCabeza)) { _hojaSuelta(false); return false; }
      gs.activo = true;
      gs.alto = gs.hoja.offsetHeight || 600;
      gs.hoja.style.transition = 'none';
      gs.hoja.classList.add('hoja-arrastrando');
      clearTimeout(gs.velo._tHoja);
      /* El tinte del velo se lee del render, antes de tocarlo: las dos apps lo pintan al .52,
         pero otra superficie (el anidador, una capa con su propio velo) puede traer otro, y
         aclararse desde un número que no es el suyo sería un brinco al primer píxel. */
      if (!gs.velo.classList.contains('hoja-velo-sigue')) {
        const a = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(g.getComputedStyle(gs.velo).backgroundColor || '');
        if (a) gs.velo.style.setProperty('--velo-a', a[1]); else gs.velo.style.removeProperty('--velo-a');
      }
      gs.velo.classList.remove('hoja-velo-suelta');
      gs.velo.classList.add('hoja-velo-sigue');
    }
    gs.dy = P.hojaResistencia(bruto);
    gs.pts.push([ts, bruto]);
    while (gs.pts.length > 2 && ts - gs.pts[0][0] > 100) gs.pts.shift();
    gs.hoja.style.transform = 'translateY(' + gs.dy.toFixed(1) + 'px)';
    gs.velo.style.setProperty('--arrastre', Math.max(0, Math.min(1, gs.dy / gs.alto)).toFixed(3));
    return true;
  }
  function _hojaSuelta(evaluar) {
    const gs = _gesto; _gesto = null;
    if (gs && gs.blanco) {
      gs.blanco.removeEventListener('touchmove', _hojaToqueMueve);
      gs.blanco.removeEventListener('touchend', _hojaToqueSuelta);
      gs.blanco.removeEventListener('touchcancel', _hojaToqueCancela);
    }
    if (!gs || !gs.activo) return;
    if (gs.captado) { try { gs.capta.releasePointerCapture(gs.id); } catch (_) {} }
    const cierra = !!evaluar && P.hojaSeCierra({ dy: gs.dy, v: _vel(gs.pts), alto: gs.alto,
      cierra: gs.cfg.cierra, velocidad: gs.cfg.velocidad });
    /* La salida de la hoja de estilos (translateY(100%)) parte de donde la dejó el dedo: el
       transform se quita en el mismo cuadro en que se quita .show. Si no cierra, regresa con la
       transición de siempre. */
    gs.hoja.style.transition = ''; gs.hoja.style.transform = '';
    gs.hoja.classList.remove('hoja-arrastrando');
    const velo = gs.velo;
    velo.classList.add('hoja-velo-suelta');
    /* Si cierra, el velo se desvanece desde lo aclarado: devolverle su tinte en ese cuadro lo
       haría oscurecerse de golpe justo antes de irse. */
    if (!cierra) velo.style.setProperty('--arrastre', '0');
    clearTimeout(velo._tHoja);
    velo._tHoja = setTimeout(() => {
      velo.classList.remove('hoja-velo-sigue', 'hoja-velo-suelta');
      velo.style.removeProperty('--arrastre');
      velo.style.removeProperty('--velo-a');
    }, 360);
    if (cierra) {
      try { gs.cerrar(); } catch (_) {}
      /* Una capa puede negarse a cerrar (lo que se estaba escribiendo, una pregunta pendiente):
         la hoja ya regresa sola con su transición, y el velo tiene que regresar con ella en vez
         de quedarse aclarado hasta que venza el reloj y oscurecerse de golpe. */
      if (gs.hoja.isConnected && gs.hoja.matches(gs.cfg.hoja)) velo.style.setProperty('--arrastre', '0');
    }
  }

  /* ----- 22 · La tarjeta viaja -----
     Sale de React Bits · Masonry y CardSwap (el reacomodo animado); de pantallas, la referencia
     es Animmaster · Page Transitions. Entra en el tablero de Proyectos (P8), la lista de partidas
     en sus acciones de estructura (C1), los cuadernos (H27), las pantallas de la plataforma
     (P24), el mes del calendario (F11) y, con P.flip, las piezas del anidador (A8).

     Las pantallas se repintan con innerHTML, así que la tarjeta que «se movió» es en realidad un
     nodo NUEVO en otra columna, y las transiciones que el CSS ya declaraba no corrían nunca. Dos
     maneras de enseñar el viaje, y la pieza elige:
       · View Transitions donde existen: el navegador fotografía el antes y el después y mueve la
         foto. Se nombra SOLO lo que viaja —una tarjeta, dos—, con un view-transition-name puesto
         antes, quitado dentro, vuelto a poner al terminar el repintado y quitado al final.
         Nombrar 200 tarjetas es fotografiar 200: el tope es 40.
       · Donde no, un FLIP a mano con Web Animations —medir, repintar, medir y animar la
         diferencia con transform—, el mismo que ya hacen _medirTotal()/_volarTotal() en el
         cotizador. También cuando hay una capa abierta ENCIMA de lo que viaja: el velo quedaría
         congelado en la foto mientras dura el viaje.
     Lo que no se funde es la página: la raíz cambia en seco (html.vt-pieza, en sistema.css). Con
     el fundido de siempre parpadeaban en cada viaje el aviso, la cuenta de cada columna y el
     velo de la capa que se estaba cerrando.

     Con menos movimiento solo corre `fn`. Si llega otra mientras una va en curso —dos toques
     seguidos—, la primera se salta: la segunda ya trae el estado final. Y nunca se envuelve lo
     que corre al teclear: cada tecla fotografiaría la pantalla entera. La pieza lo cuida sola
     también: llamada desde un evento de escritura (input, beforeinput, composición) o desde
     una tecla que se repite por tenerla apretada, solo corre `fn`.

     Dos cosas de View Transitions que la pantalla tiene que saber, y que salieron en la
     revisión:
       · `fn` NO corre en el acto: el navegador primero fotografía el antes y la llama en el
         cuadro siguiente. Lo que dependa del DOM nuevo —devolver el foco al botón que se usó,
         medir, llevar algo a la vista— va DENTRO de `fn`, no en la línea de después. (Sin View
         Transitions y con menos movimiento sí corre en el acto; dentro de `fn` vale siempre.)
       · Mientras dura el viaje, Chrome manda TODO toque al <html>: la página se ve viva pero no
         recibe nada. Dos toques seguidos en «Agregar» agregaban una. Aquí el toque que cae en
         el <html> durante un viaje salta el viaje y, al soltar, se entrega a lo que está debajo
         del dedo: la segunda partida se agrega y el viaje se corta, que es lo que se espera de
         algo que se toca. */
  const _VELOS = '.modal-bg.show,.rv-modal-bg.show,.scaler-modal-bg.show,.vt-modal-bg.show';
  const _ENTRADAS = {
    adelante: [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }],
    atras: [{ opacity: 0, transform: 'translateX(-24px)' }, { opacity: 1, transform: 'none' }],
    sube: [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
  };
  const _nombreVT = s => 'vt-' + String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
  /* Lo que viaja, leído del DOM de AHORA como Map(nombre → elemento). Se vuelve a leer después
     del repintado, porque el nodo del «después» casi nunca es el del «antes». */
  function _objetivos(o) {
    const clave = o.clave || (el => el.dataset.vt || el.id || el.dataset.clave || '');
    const n = o.nombres;
    return () => {
      const m = new Map();
      if (!n) return m;
      if (typeof n === 'object' && !Array.isArray(n) && !n.nodeType && typeof n.length !== 'number') {
        for (const k of Object.keys(n)) {
          const el = typeof n[k] === 'function' ? n[k]() : _el(n[k]);
          if (el) m.set(_nombreVT(k), el);
        }
        return m;
      }
      for (const sel of (Array.isArray(n) ? n : [n])) {
        for (const el of _todos(sel)) {
          const k = clave(el);
          if (k && !m.has(_nombreVT(k))) m.set(_nombreVT(k), el);
          if (m.size >= 40) return m;
        }
      }
      return m;
    };
  }
  let _vt = null;
  /* El toque que el viaje se tragó (ver arriba). Se oye en captura, antes que nadie, y solo
     mientras hay un viaje o justo después: un clic en el <html> fuera de eso no es de aquí. */
  let _tragado = null, _vtOyen = false;
  const _TECLEO = /^(input|beforeinput|compositionstart|compositionupdate|compositionend)$/;
  function _vtOir() {
    if (_vtOyen) return;
    _vtOyen = true;
    d.addEventListener('pointerdown', e => {
      if (!_vt || e.target !== d.documentElement || e.isPrimary === false || e.button > 0) return;
      _tragado = { x: e.clientX, y: e.clientY, t: e.timeStamp, vt: _vt };
      try { _vt.skipTransition(); } catch (_) {}
    }, true);
    d.addEventListener('click', e => {
      const tr = _tragado; _tragado = null;
      if (!tr || e.target !== d.documentElement) return;
      if (e.timeStamp - tr.t > 1000 || Math.abs(e.clientX - tr.x) > 12 || Math.abs(e.clientY - tr.y) > 12) return;
      e.stopImmediatePropagation();
      const entregar = () => {
        const el = d.elementFromPoint(tr.x, tr.y);
        if (!el || el === d.documentElement || el === d.body) return;
        const foco = el.closest('button,a[href],input,select,textarea,summary,[tabindex]');
        if (foco) { try { foco.focus({ preventScroll: true }); } catch (_) {} }
        el.click();
      };
      tr.vt.finished.then(entregar, entregar);
    }, true);
  }
  /**
   * Corre `fn` —el repintado— y enseña el viaje de lo nombrado.
   * @param {Function} fn  con View Transitions corre en el cuadro siguiente: lo que dependa del
   *                       DOM nuevo (foco, medidas) va dentro
   * @param {{nombres?:string|string[]|Object, clave?:Function, contenedor?:string|Element,
   *          direccion?:'adelante'|'atras'|'sube', duracion?:number, vt?:boolean}} o
   * @returns {Promise<void>}  se cumple al terminar el viaje (o en el acto, sin movimiento)
   */
  P.transicion = function (fn, o = {}) {
    if (typeof fn !== 'function') return Promise.resolve();
    const correr = () => { try { fn(); return Promise.resolve(); } catch (e) { return Promise.reject(e); } };
    if (_vt) { try { _vt.skipTransition(); } catch (_) {} }
    if (P.sinMovimiento() || d.hidden) return correr();
    const ev = g.event;
    if (ev && (_TECLEO.test(ev.type) || (ev.type === 'keydown' && ev.repeat))) return correr();
    const leer = _objetivos(o);
    const cont = o.contenedor ? _el(o.contenedor) : null;
    const dir = _ENTRADAS[o.direccion] ? o.direccion : '';
    const antes = leer();
    if (!antes.size && !(cont && dir)) return correr();
    const ref = cont || antes.values().next().value;
    const velos = Array.from(d.querySelectorAll(_VELOS));
    const bajoCapa = velos.length > 0 && !velos.some(v => v.contains(ref));
    if (typeof d.startViewTransition !== 'function' || o.vt === false || bajoCapa)
      return _flipTransicion(fn, leer, antes, cont, dir, o);

    const raiz = d.documentElement, yo = {};
    let puestos = [];
    const poner = m => {
      puestos = [];
      m.forEach((el, nombre) => { el.style.viewTransitionName = nombre; el._vtDe = yo; puestos.push(el); });
      const c = cont && dir ? (_el(o.contenedor) || cont) : null;
      if (c) { c.style.viewTransitionName = 'vt-contenedor'; c._vtDe = yo; puestos.push(c); }
    };
    /* Solo lo que puso ESTA: si la anterior se saltó, su final llega después de que esta ya
       nombró sus tarjetas, y sin la marca se las despintaría antes de la foto. */
    const quitar = () => { puestos.forEach(el => { if (el._vtDe === yo) { el.style.viewTransitionName = ''; el._vtDe = null; } }); puestos = []; };
    poner(antes);
    raiz.classList.add('vt-pieza');
    if (dir) raiz.dataset.va = dir; else delete raiz.dataset.va;
    /* Siempre se escribe o se quita: si la anterior se saltó, su final no limpia (ya no es la
       vigente) y esta heredaba su duración. */
    if (o.duracion) raiz.style.setProperty('--vt-dur', o.duracion + 'ms'); else raiz.style.removeProperty('--vt-dur');
    _vtOir();
    let error = null, vt;
    try {
      vt = d.startViewTransition(() => { quitar(); try { fn(); } catch (e) { error = e; } poner(leer()); });
    } catch (_) {
      quitar(); raiz.classList.remove('vt-pieza');
      return correr();
    }
    _vt = vt;
    vt.ready.catch(() => {});
    vt.updateCallbackDone.catch(() => {});
    const fin = () => {
      quitar();
      if (_vt === vt) {
        _vt = null;
        raiz.classList.remove('vt-pieza');
        delete raiz.dataset.va;
        raiz.style.removeProperty('--vt-dur');
      }
      if (error) throw error;
    };
    return vt.finished.then(fin, fin);
  };
  function _flipTransicion(fn, leer, antes, cont, dir, o) {
    const fotos = new Map();
    antes.forEach((el, k) => fotos.set(k, el.getBoundingClientRect()));
    try { fn(); } catch (e) { return Promise.reject(e); }
    const dur = o.duracion || 320, anims = [];
    leer().forEach((el, k) => {
      const r0 = fotos.get(k); if (!r0 || !el.animate) return;
      const r1 = el.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      anims.push(el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: dur, easing: _CURVA }));
    });
    const c = cont && dir ? (_el(o.contenedor) || cont) : null;
    if (c && c.animate) anims.push(c.animate(_ENTRADAS[dir], { duration: dur, easing: _CURVA }));
    return Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {});
  }

  /* El FLIP a secas, para muchas piezas a la vez (A8, las piezas del anidador): cada una viaja
     de donde estaba a donde quedó, las que no se movieron se quedan quietas y las que sí llevan
     `o.clase` mientras viajan. La clave es el `id` y no un data-*: svgparser.js solo conserva
     id y class al reemplazar un rect o una ellipse. Un <g> de SVG no se mide con su caja sino
     con su matriz —su `transform` es translate() y rotate()—, y se anima de matriz a matriz: un
     transform de CSS sobre un elemento de SVG sustituye al atributo, así que animar solo el
     desplazamiento le quitaría el giro. Con más de `o.maximo` (150) o con menos movimiento,
     cambio directo: 60 piezas volando ya son muchas para un teléfono de gama media. */
  function _matrizSVG(el) {
    const t = el.transform && el.transform.baseVal;
    if (!t || !g.DOMMatrix) return null;
    let m = new g.DOMMatrix();
    for (let i = 0; i < t.numberOfItems; i++) {
      const x = t.getItem(i).matrix;
      m = m.multiply(new g.DOMMatrix([x.a, x.b, x.c, x.d, x.e, x.f]));
    }
    return m;
  }
  const _esSVG = el => !!(g.SVGGraphicsElement && el instanceof g.SVGGraphicsElement && !(el instanceof g.SVGSVGElement));
  /**
   * @param {string|Element[]|Function} objetivo  lo que puede moverse (se vuelve a leer después)
   * @param {Function} fn  el repintado
   * @param {{clave?:Function, duracion?:number, maximo?:number, clase?:string}} o
   * @returns {Promise<Element[]>}  los que se movieron
   */
  P.flip = function (objetivo, fn, o = {}) {
    if (typeof fn !== 'function') return Promise.resolve([]);
    const clave = o.clave || (el => el.id || (el.dataset && (el.dataset.vt || el.dataset.clave)) || '');
    const leer = () => {
      const m = new Map(), svgs = Array.from(d.querySelectorAll('svg'));
      for (const el of _todos(typeof objetivo === 'function' ? objetivo() : objetivo)) {
        const k = clave(el); if (!k || m.has(k)) continue;
        m.set(k, _esSVG(el) ? { el, m: _matrizSVG(el), hoja: svgs.indexOf(el.ownerSVGElement) } : { el, r: el.getBoundingClientRect() });
      }
      return m;
    };
    const antes = P.sinMovimiento() ? null : leer();
    if (!antes || antes.size > (o.maximo || 150)) { fn(); return Promise.resolve([]); }
    fn();
    const dur = o.duracion || 320, movidos = [], anims = [];
    leer().forEach((f1, k) => {
      const f0 = antes.get(k), el = f1.el;
      if (!f0 || !el.animate) return;
      let a = null;
      if (f1.m && f0.m) {
        if (f0.hoja !== f1.hoja || f0.m.toString() === f1.m.toString()) return;
        a = el.animate([{ transform: f0.m.toString() }, { transform: f1.m.toString() }], { duration: dur, easing: _CURVA });
      } else if (f1.r && f0.r) {
        const dx = f0.r.left - f1.r.left, dy = f0.r.top - f1.r.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        a = el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: dur, easing: _CURVA });
      }
      if (a) { movidos.push(el); anims.push(a); }
    });
    if (o.clase) movidos.forEach(el => el.classList.add(o.clase));
    return Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {
      if (o.clase) movidos.forEach(el => el.classList.remove(o.clase));
      return movidos;
    });
  };

  /* ----- 21 · El tema se abre en círculo -----
     Vive en js/tema.js y no aquí: el botón del sol y la luna está en TODAS las páginas, y las
     tres de texto (acerca, privacidad, condiciones) no cargan este archivo. Aquí queda el atajo
     con el nombre de las demás piezas, para las pantallas que ya hablan con `Piezas`.
       P.temaEnCirculo('oscuro', evento)  ≡  AL3D_TEMA.revelar(evento, () => AL3D_TEMA.poner('oscuro')) */
  P.temaEnCirculo = (pref, desde, despues) => {
    const T = g.AL3D_TEMA; if (!T) return;
    const cambiar = () => { T.poner(pref); if (typeof despues === 'function') despues(); };
    if (typeof T.revelar === 'function') T.revelar(desde, cambiar); else cambiar();
  };

  /* ----- 10 · Bordes que se desvanecen en una fila con scroll -----
     Sale de Skiper · skiper87 (Scroll with fade effect). Entra en las fichas de filtro, la tira de
     etapas y el tablero del Fold (P23), la fórmula de material y la tira del asistente (F30), el
     historial, la lista del escalador y los cuadernos (H26).

     Una fila que se desliza sin barra visible se corta en seco por la derecha y nada dice que hay
     más: en la tira de etapas del teléfono, la cuarta etapa no existía para quien no probaba a
     deslizar. El borde del lado donde queda contenido se funde, y se apaga al llegar al final.

     La muestra lo hacía con `animation-timeline:scroll()`, sin guion. No aquí, por dos cosas
     medidas: Safari y Firefox no la tienen, y ahí quedaba un degradado fijo que tapaba el último
     chip aunque ya se hubiera llegado; y una animación ligada al scroll recalcula la máscara en
     cada cuadro. Con clases, la máscara cambia TRES veces en todo el recorrido (al salir del
     principio, al llegar al final y al volver), y el resto del tiempo es una imagen quieta que la
     GPU compone. Se mide en un cuadro de animación, nunca en el evento de scroll mismo.

     Y el enfoque: tabular hasta una ficha que queda debajo del borde fundido la dejaría medio
     borrada; al enfocarla, la fila se corre lo justo para que se lea entera.

     Casi todas sus filas se REHACEN con innerHTML: la fórmula de material viene en cada renglón
     de la lista (hay veinte a la vez), la tira del asistente y el tablero de Proyectos se pintan
     de nuevo en cada repintado. Con un control por elemento la pantalla tenía que volver a
     llamar la pieza después de cada repintado, y cada llamada dejaba colgados su oyente de
     resize y sus dos observadores sobre un nodo muerto —veinte repintados, veinte oyentes—, y
     con un selector de varios solo se atendía el primero. Por eso ahora:
       · con un SELECTOR, la pieza se pone en todo lo que case, hoy y en cada repintado, sin que
         nadie la vuelva a llamar: `P.bordesDesvanecidos('.mat-formula')` una vez, al montar;
       · con un ELEMENTO, lo de antes, para una fila que no se rehace;
       · los oyentes son de la pieza y no de cada fila —un scroll en captura, un focusin, un
         resize, un ResizeObserver y un MutationObserver para todo el documento—, y la fila que
         deja el documento se suelta sola en el siguiente cuadro. */
  const _bordes = new WeakMap();      // fila → { eje, margen, horiz, rq, control }
  const _bordesVivas = new Set();     // las filas con la pieza puesta, para el resize y la poda
  const _bordesSel = new Map();       // clave del selector → { sel, o, control }
  let _bordesRO = null, _bordesMO = null, _bordesOyen = false, _bordesBarrido = 0;
  /** ¿Hay contenido escondido antes y después? pos, tamaño total, tamaño visible. */
  P.bordesDe = (pos, total, vista, tol = 2) => ({ antes: pos > tol, despues: pos + vista < total - tol });
  function _bordesMedir(el) {
    const s = _bordes.get(el); if (!s) return;
    s.rq = 0;
    if (!el.isConnected) return;
    s.horiz = s.eje === 'x' || (s.eje === 'auto' && el.scrollWidth - el.clientWidth > el.scrollHeight - el.clientHeight);
    const b = s.horiz ? P.bordesDe(Math.abs(el.scrollLeft), el.scrollWidth, el.clientWidth)
                      : P.bordesDe(el.scrollTop, el.scrollHeight, el.clientHeight);
    el.classList.toggle('bordes-x', s.horiz);
    el.classList.toggle('bordes-y', !s.horiz);
    el.classList.toggle('hay-antes', b.antes);
    el.classList.toggle('hay-despues', b.despues);
  }
  const _bordesPedir = el => { const s = _bordes.get(el); if (s && !s.rq) s.rq = _raf(() => _bordesMedir(el)); };
  function _bordesRevelar(el, h, suave) {
    const s = _bordes.get(el); if (!s) return;
    const hijo = typeof h === 'string' ? el.querySelector(h) : h;
    if (!hijo || hijo === el || !el.contains(hijo)) return;
    const r = hijo.getBoundingClientRect(), c = el.getBoundingClientRect(), m = s.margen;
    const comp = { behavior: suave ? _suave() : 'auto' };
    if (s.horiz) {
      const dx = r.left < c.left + m ? r.left - c.left - m : r.right > c.right - m ? r.right - c.right + m : 0;
      if (Math.abs(dx) >= 1) el.scrollBy(Object.assign({ left: dx }, comp));
    } else {
      const dy = r.top < c.top + m ? r.top - c.top - m : r.bottom > c.bottom - m ? r.bottom - c.bottom + m : 0;
      if (Math.abs(dy) >= 1) el.scrollBy(Object.assign({ top: dy }, comp));
    }
  }
  function _bordesSoltar(el) {
    const s = _bordes.get(el); if (!s) return;
    _bordes.delete(el); _bordesVivas.delete(el);
    if (_bordesRO) { try { _bordesRO.unobserve(el); } catch (_) {} }
    el.classList.remove('bordes', 'bordes-x', 'bordes-y', 'hay-antes', 'hay-despues');
    if (s.puso) el.style.removeProperty('--borde');
  }
  /* Poda y enganche, en un cuadro: lo que dejó el documento se suelta; lo nuevo que casa con un
     selector pedido se engancha. Corre solo cuando entraron o salieron nodos. */
  function _bordesBarrer() {
    _bordesBarrido = 0;
    _bordesVivas.forEach(el => { if (!el.isConnected) _bordesSoltar(el); });
    _bordesSel.forEach(r => { d.querySelectorAll(r.sel).forEach(el => _bordesPoner(el, r.o)); });
  }
  function _bordesOir() {
    if (_bordesOyen) return;
    _bordesOyen = true;
    /* El scroll no sube, pero se oye en captura: un solo oyente para todas las filas. */
    d.addEventListener('scroll', e => { const t = e.target; if (t && t.nodeType === 1 && _bordes.has(t)) _bordesPedir(t); }, { capture: true, passive: true });
    /* Un cuadro después: el navegador también corre la fila al enfocar, y lo hace DESPUÉS del
       evento; corregir antes que él sería corregir para nada. */
    d.addEventListener('focusin', e => {
      const t = e.target, el = t && t.parentElement && t.parentElement.closest('.bordes');
      if (el && _bordes.has(el)) _raf(() => { _bordesRevelar(el, t, false); _bordesPedir(el); });
    });
    g.addEventListener('resize', () => _bordesVivas.forEach(_bordesPedir), { passive: true });
    try { _bordesRO = new g.ResizeObserver(es => es.forEach(en => _bordesPedir(en.target))); } catch (_) {}
    /* Las fichas cambian con cada repintado y la fila no cambia de tamaño: sin esto, un filtro
       que deja tres fichas seguiría diciendo que hay más. */
    try {
      _bordesMO = new g.MutationObserver(regs => {
        let nodos = false;
        for (const r of regs) {
          const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
          const el = t && t.closest && t.closest('.bordes');
          if (el) _bordesPedir(el);
          if (r.type === 'childList' && (r.addedNodes.length || r.removedNodes.length)) nodos = true;
        }
        if (nodos && !_bordesBarrido) _bordesBarrido = _raf(_bordesBarrer);
      });
      _bordesMO.observe(d.documentElement, { childList: true, subtree: true, characterData: true });
    } catch (_) {}
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(() => _bordesVivas.forEach(_bordesPedir), () => {});
  }
  function _bordesPoner(el, o) {
    if (_bordes.has(el)) return _bordes.get(el);
    const s = { eje: o.eje || 'auto', margen: o.margen || 32, horiz: o.eje === 'x', rq: 0, puso: !!o.margen, control: null };
    _bordes.set(el, s); _bordesVivas.add(el);
    el.classList.add('bordes');
    if (o.margen) el.style.setProperty('--borde', s.margen + 'px');
    if (_bordesRO) { try { _bordesRO.observe(el); } catch (_) {} }
    _bordesMedir(el);
    return s;
  }
  /**
   * @param {string|Element} x  la fila (o lista) que se desplaza; con un selector, TODAS las que
   *   casen, hoy y después de cada repintado
   * @param {{eje?:'x'|'y'|'auto', margen?:number}} o
   * @returns {{medir():void, revelar(el:string|Element, suave?:boolean):void, destruir():void}|null}
   */
  P.bordesDesvanecidos = function (x, o = {}) {
    if (!x) return null;
    _bordesOir();
    if (typeof x === 'string') {
      const k = x + '|' + (o.eje || 'auto') + '|' + (o.margen || '');
      if (_bordesSel.has(k)) return _bordesSel.get(k).control;
      const reg = { sel: x, o, control: null };
      const todas = () => Array.from(d.querySelectorAll(x)).filter(el => _bordes.has(el));
      reg.control = {
        medir() { todas().forEach(_bordesMedir); },
        /* El hijo dice en cuál de las filas: la que lo contiene (P23 lleva el chip encendido a la
           vista justo después de pintar, antes de que la poda del cuadro siguiente la enganche). */
        revelar(h, suave) {
          const hijo = typeof h === 'string' ? d.querySelector(h) : h;
          const el = hijo && hijo.closest && hijo.closest(x);
          if (!el) return;
          _bordesPoner(el, o);
          _bordesRevelar(el, hijo, suave);
        },
        destruir() { _bordesSel.delete(k); todas().forEach(_bordesSoltar); },
      };
      _bordesSel.set(k, reg);
      d.querySelectorAll(x).forEach(el => _bordesPoner(el, o));
      return reg.control;
    }
    const el = _el(x); if (!el || el.nodeType !== 1) return null;
    const s = _bordesPoner(el, o);
    if (s.control) return s.control;
    s.control = {
      medir() { if (!_bordes.has(el) && el.isConnected) _bordesPoner(el, o); _bordesMedir(el); },
      revelar(h, suave) { if (!_bordes.has(el) && el.isConnected) _bordesPoner(el, o); _bordesRevelar(el, h, suave); },
      destruir() { _bordesSoltar(el); },
    };
    return s.control;
  };

  /* ----- 11 · Desenfoque progresivo bajo el dock -----
     Sale de Skiper · skiper41 (Progressive Blur) y React Bits · GradualBlur. Entra en el dock del
     cotizador (.mbar), la barra de módulos de la plataforma (.pf-abajo, con su barra de acción
     #pf-mbar encima cuando la hay) y la barra de arriba del teléfono (.topbar).

     El dock flota de vidrio, pero la lista que pasa por debajo se cortaba en seco contra su canto:
     a 1 px del vidrio el texto se leía nítido, y dentro borroso. Una franja de 28 px justo fuera
     del canto funde ese paso.

     Tres decisiones que salen de la capa 8 y de su cuenta de desenfoques:
       · La franja es un ELEMENTO hermano de la barra, no un ::before de ella. La barra lleva
         backdrop-filter, y eso la vuelve «raíz de fondo»: un desenfoque dentro de ella solo ve lo
         que pinta la barra, no la página. Por eso esto es un guion y no una regla de CSS.
       · UNA capa de 4 px enmascarada, no las tres de la muestra ni las ocho de GradualBlur. Cada
         backdrop-filter se recalcula en cada cuadro de scroll; esta cubre una franja de 28 px más
         lo que ya está debajo del dock, y cuesta menos que el propio dock (24 px de radio).
       · Solo cuando hay algo que fundir: la de abajo se apaga al llegar al final de la página, y
         la de arriba mientras la página está en su tope —ahí debajo de la barra está el relleno
         de la página y la primera tarjeta en reposo, que no tienen por qué verse borrosas—.
     No tapa toques (pointer-events:none), va una capa por debajo de su barra, se esconde con la
     barra y no existe en papel ni con transparencia reducida. */
  const _bandas = new Map();
  /* Con qué se reconoce una barra ya pedida. Un selector o un id se dicen solos; un elemento sin
     id llevaba un '?' y dos barras distintas compartían clave: la segunda devolvía la franja de
     la primera y se quedaba sin la suya, sin decir nada. Se le pone un número propio. */
  let _bandaN = 0;
  const _bandaNombre = new WeakMap();
  const _bandaClave = b => {
    if (typeof b === 'string') return b;
    if (!b || b.nodeType !== 1) return '?';
    if (b.id) return '#' + b.id;
    if (!_bandaNombre.has(b)) _bandaNombre.set(b, '@' + (++_bandaN));
    return _bandaNombre.get(b);
  };
  /**
   * @param {string|Element|Array<string|Element>} barras  la barra (o las barras apiladas)
   * @param {{lado?:'abajo'|'arriba', alto?:number, media?:string}} o
   * @returns {{medir():void, destruir():void}}
   */
  P.desenfoqueProgresivo = function (barras, o = {}) {
    const lado = o.lado === 'arriba' ? 'arriba' : 'abajo';
    const lista = Array.isArray(barras) ? barras : [barras];
    const clave = lado + '|' + lista.map(_bandaClave).join(',');
    if (_bandas.has(clave)) return _bandas.get(clave);
    const alto = o.alto || 28;
    const banda = d.createElement('div');
    banda.className = 'desenfoque-borde ' + lado;
    banda.setAttribute('aria-hidden', 'true');
    banda.hidden = true;
    banda.style.setProperty('--db-alto', alto + 'px');
    let rq = 0, ro = null;
    const visibles = () => lista.map(_el).filter(b => {
      if (!b || !b.isConnected || b.hidden) return false;
      const r = b.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      /* Una barra que no va pegada (la de arriba se suelta en el teléfono acostado) y ya salió de
         la pantalla no tiene franja: quedaba una tira borrosa pegada al borde sin barra encima. */
      if (lado === 'arriba' ? r.bottom <= 0 : r.top >= g.innerHeight) return false;
      const cs = g.getComputedStyle(b);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    const medir = () => {
      rq = 0;
      const vis = (o.media && !_mm(o.media)) ? [] : visibles();
      if (!vis.length) { banda.hidden = true; return; }
      const primera = vis[0];
      if (banda.parentNode !== primera.parentNode) primera.parentNode.insertBefore(banda, primera);
      const z = Math.min.apply(null, vis.map(b => parseInt(g.getComputedStyle(b).zIndex, 10) || 1)) - 1;
      const rs = vis.map(b => b.getBoundingClientRect());
      const h = lado === 'abajo'
        ? g.innerHeight - Math.min.apply(null, rs.map(r => r.top)) + alto
        : Math.max.apply(null, rs.map(r => r.bottom)) + alto;
      const doc = d.scrollingElement || d.documentElement;
      const hay = lado === 'abajo' ? g.scrollY + g.innerHeight < doc.scrollHeight - 2 : g.scrollY > 2;
      const hpx = Math.max(0, Math.round(h)) + 'px';
      if (banda.style.height !== hpx) banda.style.height = hpx;
      if (banda.style.zIndex !== String(z)) banda.style.zIndex = String(Math.max(0, z));
      banda.classList.toggle('activa', hay);
      banda.hidden = false;
    };
    const pedir = () => { if (!rq) rq = _raf(medir); };
    g.addEventListener('scroll', pedir, { passive: true });
    g.addEventListener('resize', pedir, { passive: true });
    try { ro = new g.ResizeObserver(pedir); lista.map(_el).forEach(b => { if (b) ro.observe(b); }); ro.observe(d.documentElement); } catch (_) {}
    medir();
    const control = {
      medir: pedir,
      destruir() {
        g.removeEventListener('scroll', pedir); g.removeEventListener('resize', pedir);
        if (ro) ro.disconnect();
        banda.remove(); _bandas.delete(clave);
      },
    };
    _bandas.set(clave, control);
    return control;
  };

  /* ----- 9 · Deslizar un renglón para descubrir acciones -----
     Sale de React Bits · SwipeRow. Entra en las partidas del cotizador (Duplicar y Borrar), el
     renglón del Tablero (P29: a la derecha avanza la etapa, a la izquierda descubre «Abrir» y
     «Mover la fecha») y una medida del escalador (H26: Borrar).

     Es ATAJO y nunca el único camino: las mismas acciones siguen a la vista en su renglón o en su
     menú. Por eso, por omisión, lo que descubre el gesto va con aria-hidden y fuera del
     tabulador —si no, el lector de pantalla y el Tab encontrarían cada acción dos veces—. Una
     pantalla que NO tenga esos botones a la vista pasa `soloAqui:true`, y entonces el Tab llega
     a ellos y enfocar uno abre el renglón.

     Delegado en el contenedor: las listas se repintan con innerHTML y el renglón nuevo ya
     funciona sin que nadie lo vuelva a colgar. `touch-action:pan-y` en la cara: el dedo que baja
     sigue desplazando la página, y el eje se decide a los 8 px; lo vertical nunca se toca.
     Un arrastre no es un toque: el clic que el navegador manda después de soltar se tira, para
     que deslizar un renglón no lo abra. La acción principal no la corre esta pieza: pulsa el
     botón de la pantalla, así que corre el mismo código que el botón —su «Deshacer» incluido—. */
  const _filas = new WeakMap();
  /** Qué hace soltar: 'principal' (pasó el umbral a la derecha), 'abierta' o 'cerrada'. */
  P.filaDecide = ({ dx = 0, v = 0, anchoAcc = 0, anchoFila = 0, principal = false, umbral = 0.4 } = {}) => {
    if (principal && dx > 0 && (dx >= Math.max(72, anchoFila * umbral) || (dx > 40 && v > 0.5))) return 'principal';
    if (anchoAcc > 0 && dx < 0 && (dx <= -anchoAcc / 2 || (dx < -24 && v < -0.5))) return 'abierta';
    return 'cerrada';
  };
  /**
   * El HTML de un renglón deslizable, para las pantallas que pintan con innerHTML.
   * `cara` va tal cual (ya escapado por quien lo arma); `texto` se escapa aquí; `html` no.
   * @param {{cara:string, acciones?:Array<{texto?:string, html?:string, attrs?:string, clase?:string, peligro?:boolean}>,
   *          principal?:{texto?:string, html?:string, attrs?:string, clase?:string},
   *          clase?:string, attrs?:string, soloAqui?:boolean}} o
   */
  P.filaDeslizableHTML = function (o = {}) {
    const solo = !!o.soloAqui, oculto = solo ? '' : ' aria-hidden="true"';
    const boton = (a, cls) => '<button type="button" class="desliza-acc' + (cls ? ' ' + cls : '') + (a.clase ? ' ' + a.clase : '') + '"' +
      (a.attrs ? ' ' + a.attrs : '') + (solo ? '' : ' tabindex="-1"') + '>' + (a.html != null ? a.html : P.esc(a.texto || '')) + '</button>';
    const acc = o.acciones || [];
    return '<div class="desliza' + (o.clase ? ' ' + o.clase : '') + '"' + (o.attrs ? ' ' + o.attrs : '') + '>' +
      (o.principal ? '<div class="desliza-principal"' + oculto + '>' + boton(o.principal, 'principal') + '</div>' : '') +
      (acc.length ? '<div class="desliza-acciones"' + oculto + '>' + acc.map(a => boton(a, a.peligro ? 'peligro' : '')).join('') + '</div>' : '') +
      '<div class="desliza-cara">' + (o.cara || '') + '</div></div>';
  };
  /**
   * @param {string|Element} x  el contenedor de los renglones .desliza
   * @param {{umbral?:number, pista?:string}} o  pista: clave de localStorage para enseñar el gesto una vez
   * @returns {{cerrar():void, pista():void, destruir():void}|null}
   */
  P.filasDeslizables = function (x, o = {}) {
    const cont = _el(x); if (!cont) return null;
    if (_filas.has(cont)) return _filas.get(cont);
    const umbral = o.umbral || 0.4;
    let gs = null, abierta = null, suprimir = 0;
    const cara = f => f.querySelector(':scope>.desliza-cara');
    const accs = f => f.querySelector(':scope>.desliza-acciones');
    const princ = f => f.querySelector(':scope>.desliza-principal .desliza-acc');
    const poner = (f, px, animar) => {
      const c = cara(f); if (!c) return;
      c.style.transition = animar ? '' : 'none';
      c.style.transform = px ? 'translateX(' + px + 'px)' : '';
      f.classList.toggle('abierta', px < 0);
      /* De cada lado se ve solo lo suyo: con la cara a la derecha, las acciones de la izquierda
         (que viven pegadas a la derecha, encima de la principal) asomaban entre las dos. */
      f.classList.toggle('a-la-derecha', px > 0);
    };
    const fuera = e => { if (abierta && !abierta.contains(e.target)) cerrar(); };
    function cerrar(f, animar = true) {
      f = f || abierta; if (!f) return;
      poner(f, 0, animar);
      f.classList.remove('lista');
      if (f === abierta) { abierta = null; d.removeEventListener('pointerdown', fuera, true); }
    }
    function abrir(f, lado) {
      if (abierta && abierta !== f) cerrar(abierta);
      let px = 0;
      if (lado === 'principal') { if (!princ(f)) return; px = Math.min(120, f.offsetWidth * 0.34); }
      else { const a = accs(f); if (!a) return; px = -a.offsetWidth; }
      poner(f, px, true);
      if (abierta !== f) { abierta = f; d.addEventListener('pointerdown', fuera, true); }
    }
    /* El gesto se ancla al RENGLÓN y no a su cara: mientras la cara regresa a su sitio —los
       260 ms de después de un latigazo— debajo del dedo ya no está la cara sino el hueco que
       deja, y anclándolo a la cara el segundo latigazo seguido se perdía sin decir nada. Sobre
       una acción descubierta no se empieza: ahí se toca, no se arrastra. */
    const alBajar = e => {
      if (e.button > 0 || e.isPrimary === false) return;
      const t = e.target.closest ? e.target : e.target.parentElement;
      if (!t || t.closest('.desliza-acc')) return;
      const f = t.closest('.desliza');
      if (!f || !cont.contains(f)) return;
      const c = cara(f); if (!c) return;
      const a = accs(f);
      gs = { f, c, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, decidido: false,
        base: abierta === f ? (f.classList.contains('abierta') ? -(a ? a.offsetWidth : 0) : 0) : 0,
        anchoAcc: a ? a.offsetWidth : 0, principal: princ(f), anchoFila: f.offsetWidth, pts: [[e.timeStamp, e.clientX]] };
    };
    const alMover = e => {
      if (!gs || e.pointerId !== gs.id) return;
      const mx = e.clientX - gs.x0, my = e.clientY - gs.y0;
      if (!gs.decidido) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        if (Math.abs(my) >= Math.abs(mx)) { gs = null; return; }                     // es scroll
        if (gs.base === 0 && (mx < 0 ? !gs.anchoAcc : !gs.principal)) { gs = null; return; }   // nada de ese lado
        gs.decidido = true;
        try { gs.c.setPointerCapture(gs.id); } catch (_) {}
        gs.f.classList.add('arrastrando');
        if (abierta && abierta !== gs.f) cerrar(abierta);
      }
      let px = gs.base + mx;
      const maxDer = gs.principal ? gs.anchoFila * 0.9 : 0, maxIzq = -gs.anchoAcc;
      if (px > maxDer) px = maxDer + Math.min(16, (px - maxDer) * 0.2);
      if (px < maxIzq) px = maxIzq - Math.min(16, (maxIzq - px) * 0.2);
      gs.dx = px;
      gs.pts.push([e.timeStamp, e.clientX]);
      while (gs.pts.length > 2 && e.timeStamp - gs.pts[0][0] > 100) gs.pts.shift();
      poner(gs.f, px, false);
      gs.f.classList.toggle('lista', P.filaDecide({ dx: px, anchoFila: gs.anchoFila, principal: !!gs.principal, umbral }) === 'principal');
      if (e.cancelable) e.preventDefault();
    };
    const alSoltar = (e, cancelado) => {
      if (!gs || e.pointerId !== gs.id) return;
      const s = gs; gs = null;
      if (!s.decidido) return;
      s.f.classList.remove('arrastrando', 'lista');
      suprimir = Date.now();
      const r = cancelado ? 'cerrada' : P.filaDecide({ dx: s.dx, v: _vel(s.pts), anchoAcc: s.anchoAcc,
        anchoFila: s.anchoFila, principal: !!s.principal, umbral });
      if (r === 'abierta') { abrir(s.f); return; }
      cerrar(s.f);
      if (r === 'principal') { const b = s.principal; _raf(() => { if (b.isConnected) b.click(); }); }
    };
    const alSubir = e => alSoltar(e, false);
    const alCancelar = e => alSoltar(e, true);
    /* El clic que sigue a un arrastre no es un toque. */
    const alClic = e => {
      if (Date.now() - suprimir < 350 && e.target.closest && e.target.closest('.desliza-cara')) { e.preventDefault(); e.stopPropagation(); return; }
      const acc = e.target.closest && e.target.closest('.desliza-acc');
      if (!acc) return;
      const f = acc.closest('.desliza');
      setTimeout(() => {
        if (!f || !f.isConnected) return;
        cerrar(f);
        /* El toque enfoca el botón, y un botón mudo (aria-hidden) con el foco dentro deja al lector
           de pantalla sin saber dónde está, y al Tab siguiente saliendo de algo que no se ve. Si
           la pantalla no se llevó el foco a otro lado, vuelve a la cara del renglón. */
        const a = d.activeElement;
        if (a && f.contains(a) && a.closest('[aria-hidden="true"]')) devolverFoco(f);
      }, 0);
    };
    /* El foco vuelve a la cara del renglón. Si la cara no trae nada enfocable —que es justo el
       caso de `soloAqui`: se usa PORQUE no hay otro botón— la cara misma lo recibe con un
       tabindex de -1, que no la mete en el tabulador pero sí deja que el foco aterrice ahí.
       Antes se quedaba en un botón invisible (o se caía al <body>, y el Tab siguiente volvía a
       empezar desde arriba de la página). */
    const devolverFoco = f => {
      const c = cara(f); if (!c) return;
      let foco = c.querySelector('button,a[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])');
      if (!foco) { foco = c; if (!c.hasAttribute('tabindex')) c.tabIndex = -1; }
      try { foco.focus({ preventScroll: true }); } catch (_) {}
    };
    /* Teclado: enfocar una acción abre su lado; salir del renglón lo cierra; Escape también. */
    const alEnfocar = e => {
      const b = e.target.closest && e.target.closest('.desliza-acc'); if (!b) return;
      const f = b.closest('.desliza'); if (!f || !cont.contains(f)) return;
      abrir(f, b.classList.contains('principal') ? 'principal' : 'acciones');
    };
    const alSalir = e => {
      const f = e.target.closest && e.target.closest('.desliza');
      if (f && f === abierta && !(e.relatedTarget && f.contains(e.relatedTarget))) cerrar(f);
    };
    const alTecla = e => {
      if (e.key !== 'Escape' || !abierta) return;
      const f = abierta, dentro = f.contains(d.activeElement);
      cerrar(f);
      if (dentro) devolverFoco(f);
      e.stopPropagation();
    };
    const alCambiarTam = () => { if (abierta) cerrar(abierta, false); };
    cont.addEventListener('pointerdown', alBajar);
    cont.addEventListener('pointermove', alMover);
    cont.addEventListener('pointerup', alSubir);
    cont.addEventListener('pointercancel', alCancelar);
    cont.addEventListener('click', alClic, true);
    cont.addEventListener('focusin', alEnfocar);
    cont.addEventListener('focusout', alSalir);
    cont.addEventListener('keydown', alTecla);
    g.addEventListener('resize', alCambiarTam, { passive: true });
    const control = {
      cerrar: () => cerrar(),
      /* La primera vez que un aparato ve la lista, el primer renglón asoma sus acciones 28 px y
         regresa: sin eso el gesto no se descubre nunca. Una vez por aparato, y nunca con menos
         movimiento. */
      pista() {
        if (!o.pista || P.sinMovimiento()) return;
        try { if (g.localStorage.getItem(o.pista)) return; g.localStorage.setItem(o.pista, '1'); } catch (_) { return; }
        const f = cont.querySelector('.desliza'), c = f && cara(f);
        if (!c || !c.animate) return;
        const lado = accs(f) ? -28 : princ(f) ? 28 : 0; if (!lado) return;
        c.animate([{ transform: 'none' }, { transform: 'translateX(' + lado + 'px)', offset: 0.4 }, { transform: 'none' }],
          { duration: 900, delay: 350, easing: 'ease-in-out' });
      },
      destruir() {
        cont.removeEventListener('pointerdown', alBajar); cont.removeEventListener('pointermove', alMover);
        cont.removeEventListener('pointerup', alSubir); cont.removeEventListener('pointercancel', alCancelar);
        cont.removeEventListener('click', alClic, true); cont.removeEventListener('focusin', alEnfocar);
        cont.removeEventListener('focusout', alSalir); cont.removeEventListener('keydown', alTecla);
        g.removeEventListener('resize', alCambiarTam); d.removeEventListener('pointerdown', fuera, true);
        _filas.delete(cont);
      },
    };
    _filas.set(cont, control);
    return control;
  };

  /* ----- Entra lo nuevo, sale lo quitado -----
     Sale de React Bits · AnimatedList. Entra en la cola de solicitudes (C22), la medida nueva del
     escalador (H24), la respuesta larga del asistente (F15) y el resumen de lo que leyó la IA (H1).

     La lista se repinta entera y nada distinguía lo que acababa de llegar; lo quitado se iba de
     golpe y lo de abajo brincaba. Aquí la lista lleva la cuenta —un Set por lista, de claves ya
     vistas— y en cada repintado:
       · lo que no se había visto ENTRA (.lista-entra) y queda marcado «nuevo» `marca` ms;
       · lo quitado se va desvaneciendo en su sitio mientras lo de alrededor se corre al suyo
         (FLIP con transform: nada de alto animado, que recalcula la página en cada cuadro).
     La marca NO se reinicia al repintar, que es el cuidado de C22: renderAuth() corre en cada
     tecla del anticipo, y una marca que vuelve a empezar en cada tecla se queda encendida para
     siempre. El nodo nuevo hereda la edad del viejo con un animation-delay negativo, así que el
     fundido sigue exactamente donde iba.
     Con menos movimiento no hay entrada ni viaje, pero la marca «nuevo» se queda quieta el mismo
     tiempo: es información, no adorno.

     La clave tiene que ser la IDENTIDAD del renglón —el folio, el id de la medida—, nunca su
     lugar en la lista: con el índice, borrar la medida 2 de cinco hacía «irse» a la 5 y la medida
     que se agregaba después heredaba un número ya visto y no se marcaba nueva. */
  const _listas = new WeakMap();
  /** Qué claves llegaron y cuáles se fueron entre dos pintados. */
  P.cambiosDeLista = (antes, ahora) => {
    const a = new Set(antes), b = new Set(ahora);
    return { nuevas: ahora.filter(k => !a.has(k)), quitadas: antes.filter(k => !b.has(k)) };
  };
  /**
   * @param {string|Element} x  el contenedor cuyos hijos son los renglones
   * @param {{clave?:(el:Element)=>string, marca?:number, animarPrimera?:boolean, anunciar?:(el:Element)=>string}} o
   * @returns {{repintar(fn?:Function):{nuevos:Element[], quitados:string[]}, quitar(el:Element):Promise<void>,
   *            mostrar(el:Element, bloque?:'nearest'|'start'):void, olvidar(clave:string):void, destruir():void}|null}
   */
  P.listaViva = function (x, o = {}) {
    const cont = _el(x); if (!cont) return null;
    if (_listas.has(cont)) return _listas.get(cont);
    const clave = o.clave || (el => (el.dataset && el.dataset.clave) || el.id || '');
    const marca = o.marca == null ? 4000 : o.marca;
    const hijos = () => Array.from(cont.children).filter(el => !el.classList.contains('lista-se-va') && clave(el));
    const vistas = new Map();      // clave → cuándo se vio por primera vez (ms); -1 = ya estaba
    let lista = hijos().length > 0 || !!o.animarPrimera, tMarca = 0;
    hijos().forEach(el => vistas.set(clave(el), -1));
    const marcar = (el, visto, ahora, nace) => {
      const edad = visto < 0 ? Infinity : ahora - visto;
      el.classList.toggle('lista-entra', !!nace && !P.sinMovimiento());
      if (edad < marca) {
        /* Solo al nodo que todavía no la lleva: a uno que sigue vivo, cambiarle el retardo a
           media animación la adelantaría otra vez lo que ya corrió. */
        if (!el.classList.contains('lista-nueva')) {
          el.style.setProperty('--lista-marca', marca + 'ms');
          el.style.setProperty('--lista-edad', -edad + 'ms');
          el.classList.add('lista-nueva');
        }
      } else if (el.classList.contains('lista-nueva')) {
        el.classList.remove('lista-nueva');
        el.style.removeProperty('--lista-edad');
      }
    };
    /* Un reloj, el de la marca que vence primero: quitarla es información («ya no es nueva»). */
    const programar = () => {
      clearTimeout(tMarca);
      const ahora = Date.now();
      let prox = Infinity;
      vistas.forEach(t => { if (t >= 0 && ahora - t < marca) prox = Math.min(prox, marca - (ahora - t)); });
      if (prox < Infinity) tMarca = setTimeout(() => { const t = Date.now(); hijos().forEach(el => marcar(el, vistas.get(clave(el)), t, false)); programar(); }, prox + 30);
    };
    function repintar(fn) {
      const mov = !P.sinMovimiento();
      const antes = new Map();
      for (const el of hijos()) antes.set(clave(el), { el, r: mov ? el.getBoundingClientRect() : null });
      if (typeof fn === 'function') fn();
      const ahora = hijos(), t = Date.now(), nuevos = [];
      /* Lo que quitar() despidió y el repintado dejó en su sitio —el borrado falló, o la pantalla
         reutiliza sus nodos en vez de rehacerlos— vuelve a verse: si no, se quedaba un renglón
         invisible, con su lugar ocupado y sus botones tocables. */
      for (const el of ahora) if (el.dataset.listaSeFue) {
        delete el.dataset.listaSeFue;
        if (el._listaSale) { try { el._listaSale.cancel(); } catch (_) {} el._listaSale = null; }
        el.removeAttribute('aria-hidden');
        try { el.inert = false; } catch (_) {}
        el.style.removeProperty('pointer-events');
      }
      if (!lista) {
        ahora.forEach(el => vistas.set(clave(el), -1));
        lista = true;
        return { nuevos: [], quitados: [] };
      }
      const claves = new Set();
      for (const el of ahora) {
        const k = clave(el); claves.add(k);
        const nace = !vistas.has(k);
        if (nace) { vistas.set(k, t); nuevos.push(el); }
        marcar(el, vistas.get(k), t, nace);
      }
      const quitados = [];
      antes.forEach((v, k) => { if (!claves.has(k)) quitados.push(k); });
      if (mov && ahora.length + quitados.length <= 80) {
        /* Los que se quedan se corren desde donde estaban. */
        for (const el of ahora) {
          const a = antes.get(clave(el)); if (!a || !a.r || !el.animate) continue;
          const r = el.getBoundingClientRect(), dy = a.r.top - r.top, dx = a.r.left - r.left;
          if (Math.abs(dy) >= 1 || Math.abs(dx) >= 1)
            el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 240, easing: _CURVA });
        }
        /* Y lo quitado se desvanece en su sitio. El nodo viejo ya no está en la lista —el
           repintado lo tiró— y se vuelve a poner, fuera del flujo, inerte y mudo, solo lo que
           dura el fundido. Su lugar lo calcula donde cayó: así da igual cuál de los de arriba
           sea su contenedor posicionado. */
        for (const k of quitados) {
          const { el, r } = antes.get(k);
          if (!r || el.isConnected || el.dataset.listaSeFue || !el.animate) continue;
          el.classList.add('lista-se-va'); el.classList.remove('lista-entra', 'lista-nueva');
          el.setAttribute('aria-hidden', 'true'); try { el.inert = true; } catch (_) {}
          Object.assign(el.style, { position: 'absolute', left: '0px', top: '0px', width: r.width + 'px', height: r.height + 'px', margin: '0', pointerEvents: 'none' });
          cont.appendChild(el);
          const aqui = el.getBoundingClientRect();
          el.style.left = (r.left - aqui.left) + 'px'; el.style.top = (r.top - aqui.top) + 'px';
          el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(.98)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
            .finished.catch(() => {}).then(() => el.remove());
        }
      }
      if (o.anunciar && nuevos.length) { const msg = o.anunciar(nuevos[nuevos.length - 1], nuevos); if (msg) _decir(msg); }
      programar();
      return { nuevos, quitados };
    }
    const control = {
      repintar,
      /* Quitar antes de repintar: «Quitar» en el aviso de partidas sin terminar cierra el renglón
         y DESPUÉS se repinta. La promesa se cumple al terminar la salida. */
      quitar(el) {
        if (!el || !cont.contains(el)) return Promise.resolve();
        el.dataset.listaSeFue = '1';
        /* El renglón que se está yendo deja de existir para el dedo y para el teclado en el
           mismo momento en que empieza a irse, no cuando termina: durante el fundido es algo
           transparente con sus botones todavía tocables encima de la lista, y si el repintado
           no llega (falló el borrado, se perdió la señal) se queda así. Igual que el fantasma
           de repintar(); y repintar() lo deshace si el renglón sigue vivo. */
        el.setAttribute('aria-hidden', 'true');
        try { el.inert = true; } catch (_) {}
        el.style.pointerEvents = 'none';
        if (P.sinMovimiento() || !el.animate) return Promise.resolve();
        el._listaSale = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(.98)' }],
          { duration: 180, easing: 'ease-in', fill: 'forwards' });
        return el._listaSale.finished.then(() => {}, () => {});
      },
      /* Llevar a la vista lo que llegó moviendo SOLO la caja con scroll que lo contiene, nunca la
         página: el escalador (H24) mide sobre la foto y un scrollIntoView movía la página debajo
         del dedo; el asistente (F15) ancla la respuesta nueva a su principio ('start'). */
      mostrar(el, bloque = 'nearest') {
        if (!el || !el.isConnected) return;
        let caja = el.parentElement;
        const raiz = d.scrollingElement || d.documentElement;
        for (; caja && caja !== d.body && caja !== raiz; caja = caja.parentElement) {
          const oy = g.getComputedStyle(caja).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && caja.scrollHeight > caja.clientHeight + 1) break;
        }
        if (!caja || caja === d.body || caja === raiz) return;
        const r = el.getBoundingClientRect(), c = caja.getBoundingClientRect();
        const dy = bloque === 'start' ? r.top - c.top
          : r.top < c.top ? r.top - c.top : r.bottom > c.bottom ? Math.min(r.bottom - c.bottom, r.top - c.top) : 0;
        if (Math.abs(dy) >= 1) caja.scrollBy({ top: dy, behavior: _suave() });
      },
      olvidar(k) { vistas.delete(k); },
      destruir() { clearTimeout(tMarca); _listas.delete(cont); },
    };
    _listas.set(cont, control);
    return control;
  };

  /* ----- El pliegue abre con su altura -----
     Sale de Vengeance · FAQ Accordion (sin el rebote de Skiper · skiper103). Entra en
     #pdf-extra-box y «otras salidas» (C16), el renglón de ajuste por partida (C16, que hoy es un
     display:none), la entrada del historial (H16) y el índice de las páginas legales (A19).

     Para un <details>, CSS y nada más: la clase `.pliegue` le da `interpolate-size` y anima
     `::details-content` —abrir y cerrar—, y la flecha (.pliegue-flecha) gira con la misma curva
     y el mismo tiempo. Donde el navegador no conoce esas dos piezas, abre en seco como hasta hoy.
     No hace falta guion ni para el teclado: Enter y Espacio en el <summary> son del navegador.

     Para lo que se pliega con clases y no es un <details> —el ajuste por partida—, `.plegable`
     con su rejilla de 0fr a 1fr y un botón con aria-expanded y aria-controls. Delegado: la
     pantalla pinta el botón con `data-plegar` y la pieza lo atiende en cualquier repintado.
     Cerrado, lo de dentro queda fuera del tabulador (visibility, al terminar de cerrar).

     El alto animado no es transform ni opacity, y es a propósito: lo que abre un pliegue es
     espacio, y empujar lo de abajo es justo lo que tiene que verse. Dura 200 ms, lo dispara un
     toque, y con menos movimiento abre en seco. */
  /** Reabrir sin animar: renderAuth() reabre «otras salidas» a mano, y eso no es un toque. */
  P.abrirSinAnimar = function (x, abierto = true) {
    const el = _el(x); if (!el) return;
    el.classList.add('pliegue-quieto');
    if (el.tagName === 'DETAILS') el.open = !!abierto; else P.plegar(el, abierto);
    _raf(() => _raf(() => el.classList.remove('pliegue-quieto')));
  };
  /**
   * Abre o cierra un `.plegable` y pone al día el botón que lo controla (aria-controls).
   * @param {string|Element} x  el .plegable
   * @param {boolean} [abierto]  si falta, alterna
   * @returns {boolean} cómo quedó
   */
  P.plegar = function (x, abierto) {
    const el = _el(x); if (!el) return false;
    const v = abierto == null ? !el.classList.contains('abierto') : !!abierto;
    el.classList.toggle('abierto', v);
    try { el.inert = !v; } catch (_) {}
    if (el.id) {
      d.querySelectorAll('[aria-controls="' + (g.CSS && g.CSS.escape ? g.CSS.escape(el.id) : el.id) + '"]')
        .forEach(b => b.setAttribute('aria-expanded', v ? 'true' : 'false'));
    }
    return v;
  };
  const _plegables = new WeakMap();
  /** Atiende, por delegación, los botones [data-plegar][aria-controls] dentro de `raiz`. */
  P.plegables = function (x) {
    const raiz = _el(x) || d; if (_plegables.has(raiz)) return _plegables.get(raiz);
    const alClic = e => {
      const b = e.target.closest && e.target.closest('[data-plegar][aria-controls]');
      if (!b || !raiz.contains(b)) return;
      const el = d.getElementById(b.getAttribute('aria-controls')); if (!el) return;
      e.preventDefault();
      P.plegar(el);
    };
    raiz.addEventListener('click', alClic);
    const control = { destruir() { raiz.removeEventListener('click', alClic); _plegables.delete(raiz); } };
    _plegables.set(raiz, control);
    return control;
  };

  /* ----- Páginas con scroll-snap -----
     Sale de React Bits · Carousel (alternativa: Skiper · skiper54). Entra en las columnas de
     Proyectos como páginas en el teléfono (P28), las paradas del día sobre el mapa (F12) y las
     hojas del anidador cuando son varias (A12).

     El desplazamiento lo hace el navegador —scroll-snap, que el pulgar ya conoce—; la pieza pone
     lo que el scroll-snap no trae: saber en qué página se quedó (la que cruza una franja angosta
     al centro), puntos que la dicen y llevan a cada una, flechas ‹ › para el ratón, las flechas
     del teclado con la tira enfocada, y «Hoja 2 de 5» al lector de pantalla cuando se ASIENTA en
     otra página, no en cada píxel del camino.
     Con menos movimiento, ir a una página es un salto y no un desplazamiento.

     Dos cosas que salieron en la revisión:
       · Los puntos miden 44 px y NO se encogen. Con seis o siete páginas no caben con sus dos
         flechas en una tarjeta de 360 (9 × 44 = 396), y la barra de flex los encogía a 30 px sin
         avisar. Ahora, con más de cinco páginas o cuando no caben a su medida en el ancho que
         hay, la barra dice «2 / 7» entre las flechas; y se vuelve a decidir al cambiar el ancho.
       · Las pantallas repintan sus páginas con innerHTML (las columnas de Proyectos, cada vez que
         cambia un proyecto). Repintar no es cambiar de página: la barra no se rehace si el número
         de páginas no cambió —el foco que estaba en un punto se queda ahí— y `alCambiar` solo se
         llama cuando cambia la página o el número de páginas. Antes se llamaba en cada
         repintado, y una pantalla que repintara desde su alCambiar entraba en un ciclo. */
  const _paginas = new WeakMap();
  /** La página más cercana a `pos`, dados los centros de cada una. */
  P.paginaMasCercana = (pos, centros) => {
    let mejor = 0, dist = Infinity;
    centros.forEach((c, i) => { const dd = Math.abs(c - pos); if (dd < dist) { dist = dd; mejor = i; } });
    return mejor;
  };
  /**
   * @param {string|Element} x  la tira; sus hijos son las páginas
   * @param {{nombre?:string, etiqueta?:string, puntos?:boolean|Element, flechas?:boolean,
   *          alCambiar?:(i:number, pagina:Element)=>void, anunciar?:boolean}} o
   * @returns {{ir(i:number):void, actual():number, medir():void, destruir():void}|null}
   */
  P.paginas = function (x, o = {}) {
    const tira = _el(x); if (!tira) return null;
    if (_paginas.has(tira)) return _paginas.get(tira);
    const nombre = o.nombre || 'hoja', Nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);
    let pags = [], actual = -1, anunciada = -1, tAnuncio = 0, rq = 0, barra = null, mo = null;
    let pintadas = -1, modo = '', vivo = true;
    tira.classList.add('paginas');
    if (!tira.hasAttribute('tabindex')) tira.tabIndex = 0;
    if (!tira.hasAttribute('role')) tira.setAttribute('role', 'region');
    tira.setAttribute('aria-roledescription', 'carrusel');
    if (o.etiqueta) tira.setAttribute('aria-label', o.etiqueta);
    const centros = () => {
      const c = tira.getBoundingClientRect();
      return pags.map(p => { const r = p.getBoundingClientRect(); return r.left - c.left + tira.scrollLeft + r.width / 2; });
    };
    /* Qué cabe en la barra, midiendo su ancho de verdad (44 px por botón y 2 de hueco; nada se
       encoge, flex:none). El orden con que se cede importa: las fichas piden PUNTOS, uno por
       columna y de 44 px (P28 son cinco, A12 hasta tres), así que lo primero que se suelta son
       las flechas ‹ › —son el camino del ratón, y el teclado ya tiene ← → Inicio Fin y los
       puntos mismos—; solo si tampoco así caben los puntos, la barra dice «2 / 7». Con más de
       cinco páginas se dice la cuenta siempre: seis puntos ya no son un vistazo. Sin ancho
       medible —la barra escondida, o todavía sin pintar— se decide solo por el número. */
    const modoQueToca = n => {
      if (n > 5) return 'cuenta';
      const ancho = barra ? barra.clientWidth : 0;
      if (!ancho) return 'puntos';
      const cabe = k => k * 44 + (k - 1) * 2 <= ancho;
      if (cabe(n + (o.flechas !== false ? 2 : 0))) return 'puntos';
      return cabe(n) ? 'sin-flechas' : 'cuenta';
    };
    /* true si la rehízo. */
    const pintarBarra = (forzar) => {
      if (!barra) return false;
      const n = pags.length;
      barra.hidden = n < 2;
      const m = modoQueToca(n), muchos = m === 'cuenta', flechas = o.flechas !== false && m !== 'sin-flechas';
      if (!forzar && n === pintadas && m === modo) return false;
      pintadas = n; modo = m;
      let h = '';
      if (flechas) h += '<button type="button" class="paginas-flecha" data-pag="-1" aria-label="' + P.esc(Nombre) + ' anterior">‹</button>';
      if (muchos) h += '<span class="paginas-cuenta" aria-hidden="true"></span>';
      else for (let i = 0; i < n; i++) h += '<button type="button" class="paginas-punto" data-pag-ir="' + i + '" aria-label="Ir a la ' + P.esc(nombre) + ' ' + (i + 1) + ' de ' + n + '"></button>';
      if (flechas) h += '<button type="button" class="paginas-flecha" data-pag="1" aria-label="' + P.esc(Nombre) + ' siguiente">›</button>';
      barra.innerHTML = h;
      return true;
    };
    const marcar = () => {
      if (!barra) return;
      barra.querySelectorAll('.paginas-punto').forEach((b, i) => { if (i === actual) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      const cuenta = barra.querySelector('.paginas-cuenta'); if (cuenta) cuenta.textContent = (actual + 1) + ' / ' + pags.length;
      const f = barra.querySelectorAll('.paginas-flecha');
      if (f[0]) f[0].disabled = actual <= 0;
      if (f[1]) f[1].disabled = actual >= pags.length - 1;
    };
    /* `repaso`: las páginas se acaban de leer; se vuelven a marcar aunque la página sea la misma
       (los nodos son otros), y se avisa a la pantalla solo si cambió el número. */
    const calcular = (repaso, cambioN) => {
      rq = 0;
      if (!vivo || !pags.length) return;
      const i = P.paginaMasCercana(tira.scrollLeft + tira.clientWidth / 2, centros());
      const cambio = i !== actual;
      if (!cambio && !repaso) return;
      actual = i;
      pags.forEach((p, k) => p.classList.toggle('pagina-actual', k === i));
      marcar();
      if (!cambio && !cambioN) return;
      if (typeof o.alCambiar === 'function') { try { o.alCambiar(i, pags[i]); } catch (_) {} }
      /* Se anuncia cuando se ASIENTA: 180 ms sin cambiar. Deslizar de la 1 a la 4 dice «4 de 5»,
         no «2, 3, 4». */
      clearTimeout(tAnuncio);
      tAnuncio = setTimeout(() => {
        if (o.anunciar === false || actual === anunciada) return;
        const primera = anunciada < 0; anunciada = actual;
        if (!primera) _decir(Nombre + ' ' + (actual + 1) + ' de ' + pags.length);
      }, 180);
    };
    const leer = () => {
      if (!vivo) return;
      const n0 = pags.length;
      pags = Array.from(tira.children).filter(p => p.nodeType === 1 && !p.hidden);
      pags.forEach((p, i) => {
        if (!p.hasAttribute('role')) p.setAttribute('role', 'group');
        p.setAttribute('aria-roledescription', nombre);
        /* El nombre de la página es de la pantalla si ya lo trae («Parada 2 de 4»); si no, el
           nuestro, y el nuestro se reescribe al cambiar la cuenta. */
        if (!p.hasAttribute('aria-label') || p.dataset.pagRotulo) { p.setAttribute('aria-label', Nombre + ' ' + (i + 1) + ' de ' + pags.length); p.dataset.pagRotulo = '1'; }
      });
      const rehizo = pintarBarra();
      if (rehizo || pags.length !== n0) actual = -1;   // otra barra u otra cuenta: se marca y se avisa de nuevo
      calcular(true, pags.length !== n0);
    };
    const ir = (i, salto) => {
      if (!pags.length) return;
      const k = Math.max(0, Math.min(pags.length - 1, i));
      tira.scrollTo({ left: centros()[k] - tira.clientWidth / 2, behavior: salto ? 'auto' : _suave() });
    };
    if (o.puntos !== false) {
      barra = o.puntos && o.puntos.nodeType === 1 ? o.puntos : d.createElement('div');
      barra.classList.add('paginas-barra');
      if (!barra.hasAttribute('role')) barra.setAttribute('role', 'group');
      barra.setAttribute('aria-label', 'Elegir ' + nombre);
      if (!barra.parentNode) tira.insertAdjacentElement('afterend', barra);
    }
    const alClicBarra = e => {
      const b = e.target.closest && e.target.closest('[data-pag],[data-pag-ir]'); if (!b) return;
      if (b.dataset.pagIr != null) ir(+b.dataset.pagIr); else ir(actual + +b.dataset.pag);
    };
    const alTecla = e => {
      if (e.target !== tira && !(barra && barra.contains(e.target))) return;
      const k = e.key;
      const j = k === 'ArrowRight' || k === 'PageDown' ? actual + 1 : k === 'ArrowLeft' || k === 'PageUp' ? actual - 1
        : k === 'Home' ? 0 : k === 'End' ? pags.length - 1 : null;
      if (j == null) return;
      e.preventDefault(); ir(j);
    };
    const pedir = () => { if (!rq) rq = _raf(() => calcular()); };
    /* Con otro ancho puede que los puntos quepan o dejen de caber. */
    const alCambiarTam = () => { if (pintarBarra()) marcar(); pedir(); };
    tira.addEventListener('scroll', pedir, { passive: true });
    tira.addEventListener('keydown', alTecla);
    if (barra) { barra.addEventListener('click', alClicBarra); barra.addEventListener('keydown', alTecla); }
    g.addEventListener('resize', alCambiarTam, { passive: true });
    try { mo = new g.MutationObserver(leer); mo.observe(tira, { childList: true }); } catch (_) {}
    leer();
    const control = {
      ir: i => ir(i), actual: () => actual, medir: () => { leer(); if (pintarBarra()) marcar(); },
      destruir() {
        vivo = false;
        clearTimeout(tAnuncio);
        tira.removeEventListener('scroll', pedir); tira.removeEventListener('keydown', alTecla);
        g.removeEventListener('resize', alCambiarTam);
        tira.classList.remove('paginas');
        if (mo) mo.disconnect();
        if (barra) { barra.removeEventListener('click', alClicBarra); barra.removeEventListener('keydown', alTecla); if (!o.puntos || !o.puntos.nodeType) barra.remove(); }
        _paginas.delete(tira);
      },
    };
    _paginas.set(tira, control);
    return control;
  };

  /* ----- La silueta en vez de «Leyendo…» -----
     Sale de React Bits · RefineFrame: reservar el lugar de lo que viene sin mover nada. Entra en
     Fabricación, Material, el Mapa y el asistente de la plataforma (F16), el primer acomodo del
     anidador (A13) y la miniatura que la IA está leyendo en el cotizador (H7).

     El router ya pinta la silueta del módulo (esqueletoModulo() en js/nucleo/ui.js) y un instante
     después el módulo la cambiaba por un reloj centrado con un renglón: dos formas de «cargando» y
     un salto de alto. Esta es la pieza genérica, con las mismas barras (.esq-b, .esq-t, .esq-n…
     de sistema.css) para que las tres superficies dibujen igual, y con una diferencia: el brillo
     pasa UNA vez, al aparecer, y no en bucle. Un brillo que corre diez segundos seguidos mientras
     la IA piensa es la pantalla moviéndose sola; lo que dice «sigo trabajando» es el giro junto al
     texto y el texto mismo. Con menos movimiento, ni el brillo.
     El dibujo es mudo (aria-hidden); lo que se oye es el texto de estado, en role="status".

     La miniatura de la IA (H7) no es un hueco gris: es la foto que se está leyendo, en su
     proporción reservada. `o.dentro` pone ese contenido (la <img> de la pantalla) dentro de la
     caja del bloque o de la miniatura, debajo del brillo; y la proporción solo acepta números
     («4 / 3»), porque va a dar a un style. */
  const _BARRAS = { t: 'esq-t', d: 'esq-d', n: 'esq-n', campo: 'esq-campo', largo: 'esq-campo esq-largo', boton: 'esq-boton', bloque: 'esq-bloque' };
  const _barra = b => '<span class="esq-b ' + (_BARRAS[b] || 'esq-t') + '"></span>';
  /**
   * El HTML de una silueta. `forma`: 'lista' | 'cifras' | 'tarjeta' | 'bloque' | 'miniatura', o una
   * lista de barras (['t','d','campo','boton'…]).
   * @param {string|string[]} forma
   * @param {{texto?:string, filas?:number, cifras?:number, alto?:number, proporcion?:string, dentro?:string, clase?:string, giro?:boolean}} o
   * @returns {string}
   */
  P.silueta = function (forma, o = {}) {
    let cuerpo = '';
    if (Array.isArray(forma)) cuerpo = forma.map(_barra).join('');
    else if (forma === 'lista') cuerpo = ('<span class="silueta-fila"><span class="esq-b silueta-ico"></span><span class="silueta-tx">' + _barra('t') + _barra('d') + '</span></span>').repeat(o.filas || 3);
    else if (forma === 'cifras') cuerpo = '<span class="silueta-cifras">' + ('<span class="silueta-cifra">' + _barra('n') + _barra('d') + '</span>').repeat(o.cifras || 4) + '</span>';
    /* El alto va a dar a un style, así que solo pasan números y dentro de lo que cabe en una
       pantalla: un negativo o una letra caen al de siempre en vez de volverse otra medida. */
    else if (forma === 'bloque') cuerpo = '<span class="esq-b esq-bloque" style="height:' + (Math.min(2000, Math.max(0, +o.alto || 0)) || 220) + 'px">' + (o.dentro || '') + '</span>';
    else if (forma === 'miniatura') {
      const pr = /^\s*\d+(\.\d+)?\s*(\/\s*\d+(\.\d+)?\s*)?$/.test(String(o.proporcion || '')) ? String(o.proporcion).trim() : '4 / 3';
      cuerpo = '<span class="esq-b silueta-mini" style="aspect-ratio:' + pr + '">' + (o.dentro || '') + '</span>';
    }
    else cuerpo = _barra('t') + _barra('d') + _barra('campo') + _barra('campo');
    const texto = o.texto ? '<p class="silueta-t" role="status">' + (o.giro === false ? '' : '<span class="esq-giro" aria-hidden="true"></span> ') + '<span>' + P.esc(o.texto) + '</span></p>' : '';
    return '<div class="silueta' + (o.clase ? ' ' + P.esc(o.clase) : '') + '" aria-busy="true"><div class="silueta-dibujo" aria-hidden="true">' + cuerpo + '</div>' + texto + '</div>';
  };
  /**
   * Pone la silueta en `cont` mientras algo llega, y la quita al llegar.
   * @returns {{quitar(html?:string):void}}
   */
  P.conSilueta = function (x, forma, o = {}) {
    const cont = _el(x);
    if (!cont) return { quitar() {} };
    cont.setAttribute('aria-busy', 'true');
    cont.innerHTML = P.silueta(forma, o);
    return {
      quitar(html) {
        cont.removeAttribute('aria-busy');
        if (html != null) cont.innerHTML = html;
        else { const s = cont.querySelector(':scope>.silueta'); if (s) s.remove(); }
      },
    };
  };

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

  /* Lo que APUNTA a algo que ya está en la pantalla —las esquinas que caen sobre el campo que
     falta, el globo que explica una cifra, el nombre de un icono—, lo que CUENTA qué está
     pasando —los pasos con su reloj, el riel, la carga con los azules del logo— y lo que SELLA
     un momento —el neón al autorizar, el letrero que se ve mientras se escribe—.

     Cuatro reglas de esta sección, además de las tres de la cabecera:
       · Lo que flota va en la CAPA SUPERIOR del navegador (el atributo `popover`), no con
         z-index. La pila de la app está agotada casi entera (docs/SISTEMA-DE-DISENO.md §1): un
         globo con z-index 90 queda bien encima del cotizador, pero el mismo globo dentro de una
         hoja de la plataforma, que abre su propio contexto de apilamiento, se pintaba debajo
         del velo. En la capa superior no hay contexto que lo encierre, y el velo de un modal no
         lo tapa.
       · Nada se coloca con el anclaje de CSS (`anchor()`): Safari 17 y Firefox todavía no lo
         traen, y un globo que en la mitad de los teléfonos sale pegado a la esquina de arriba
         es peor que no tenerlo. Se mide con getBoundingClientRect y se acomoda aquí.
       · Todo es idempotente. Las pantallas repintan con innerHTML y vuelven a llamar a la pieza
         después de cada pintado; la segunda llamada sobre el mismo elemento devuelve el mismo
         control y no cuelga oyentes nuevos.
       · Lo que termina en HTML (vistazoHTML, rielHTML, letreroHTML…) devuelve una cadena y no
         toca el DOM, para las pantallas que pintan con innerHTML. Lo que interpola pasa por
         P.esc(); lo único que entra crudo es lo que su comentario dice que es HTML de la
         pantalla.

     Todo vive dentro de un bloque `{ … }`: las cuatro secciones comparten el ámbito de este
     archivo, y un `const fuera` aquí y otro en la sección 2 serían un error de sintaxis el día
     que se junten. Desde fuera solo se ve lo que se cuelga de P. */
  {
    /* ----- Lo que comparten las piezas de esta sección ----- */

    /* ¿Hay capa superior? Safari la trae desde la 17 y Firefox desde la 125. Donde no está, el
       mismo nodo se pinta con position:fixed y z-index 90 (el @supports del CSS), que queda
       bien en todo salvo dentro de un contenedor con transform. */
    const CAPA = !!(g.HTMLElement && g.HTMLElement.prototype && 'showPopover' in g.HTMLElement.prototype);
    const cuadro = f => (g.requestAnimationFrame ? g.requestAnimationFrame(f) : setTimeout(f, 16));
    /* Dos cuadros y no uno, como _volarTotal() en proceso.js: con uno solo Chrome junta la
       escritura sin transición y la que la lleva en el mismo recálculo, y no anima nada. */
    const dosCuadros = f => cuadro(() => cuadro(f));
    const ahora = () => (g.performance ? g.performance.now() : Date.now());
    let serie = 0;
    const nuevoId = p => 'pz4-' + p + '-' + (++serie).toString(36);
    const anchoVista = () => (d.documentElement && d.documentElement.clientWidth) || g.innerWidth || 0;
    const altoVista = () => (g.visualViewport && g.visualViewport.height) || g.innerHeight || 0;
    /* Una variable de CSS en px que publica la app (--top-fijo, --mbar-h). Si no está, 0: fuera
       del cotizador no hay barra fija que restar. */
    const pxDe = nombre => {
      try { return parseFloat(g.getComputedStyle(d.documentElement).getPropertyValue(nombre)) || 0; }
      catch (_) { return 0; }
    };
    const enfocar = el => {
      if (!el || !el.focus) return;
      try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (__) { /* nada */ } }
    };
    /* La vibración es movimiento: quien lo pidió sin movimiento tampoco la quiere en la mano. */
    const vibrar = ms => {
      if (P.sinMovimiento()) return;
      try { if (g.navigator && g.navigator.vibrate) g.navigator.vibrate(ms); } catch (_) { /* nada */ }
    };
    const esControl = el => /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName);
    function subir(n) {
      n.classList.add('pz-abierto');
      if (CAPA) { try { if (!n.matches(':popover-open')) n.showPopover(); } catch (_) { /* nada */ } }
    }
    function bajar(n) {
      n.classList.remove('pz-abierto');
      if (CAPA) { try { if (n.matches(':popover-open')) n.hidePopover(); } catch (_) { /* nada */ } }
    }
    /* Un nodo flotante nuevo, colgado de <body>: así no hereda el overflow ni el transform de
       la tarjeta donde está su ancla. */
    function flotante(clase) {
      const n = d.createElement('div');
      n.className = clase;
      if (CAPA) n.setAttribute('popover', 'manual');
      d.body.appendChild(n);
      return n;
    }

    /* =================== 4 · El globo que explica: desglose o vistazo ===================
       Tocar el precio de la partida y que diga «$40 × 30 cm × 9 letras» es lo que da confianza
       delante del cliente; tocar el «?» del plazo y leer por qué son 2.5 semanas es lo que lo
       sostiene. Es la misma pieza en once lugares —el desglose del total del dock, el mensaje
       de WhatsApp, el cuaderno del cliente, la pieza del anidador, el mes de Ventas, el menú de
       la cuenta…—, así que es UNA: un globo con el atributo `popover`, colocado junto a su ancla
       en JS y sin salirse de una pantalla de 360 px.

       Se usa `popover="manual"` y no `auto`, y el cierre lo hace esta pieza, por tres razones
       medidas: (1) un `auto` cierra a todos los demás `auto` de la página, y otras piezas de
       este archivo también flotan; (2) el Escape de `auto` lo atiende el navegador, pero el
       evento sigue su camino y el oyente de Escape del cotizador (_CAPAS en nucleo.js) o de la
       plataforma (vigilarCapas en ui.js) cerraba ADEMÁS el modal de abajo: un Escape se llevaba
       dos capas. Aquí el Escape se atiende en la fase de captura de window y no sigue; (3) el
       globo de la veta (A5) es una pregunta y no se puede ir con un toque fuera.

       Dos maneras de usarlo:
         · Declarativa, para lo que se pinta con innerHTML: un botón con data-vistazo="id" y el
           globo con ese id en el marcado (P.vistazoHTML, P.porqueHTML). Un solo oyente en el
           documento, puesto al cargar, abre y cierra; la pantalla no llama a nada.
         · Con P.vistazo(ancla, opciones), cuando el contenido se calcula al abrir (el desglose
           del total, que cambia con cada tecla) o el ancla sale de una delegación (las barras
           de los meses, las piezas del anidador). */
    const GLOBO_DE = new WeakMap();      // nodo del globo → su control
    const GLOBOS_EN = new WeakMap();     // ancla o contenedor → Map(delegar → control)
    let globoAbierto = null;             // uno a la vez: abrir otro cierra el anterior

    /* La cuenta de dónde cae el globo, sin DOM, para poder probarla en node.
         a: el rectángulo del ancla (left, top, right, bottom, width, height)
         t: el tamaño del globo {w, h}
         v: la vista {w, h, arriba, abajo} (arriba/abajo: lo que tapan las barras fijas)
         o: {lado:'abajo'|'arriba', alinear:'inicio'|'centro'|'fin', margen, hueco}
       Devuelve {x, y, lado, alto, ancho}; `alto` no es null cuando el globo no cabe entero y
       tiene que desplazarse por dentro. El lado pedido se respeta mientras quepa; si no cabe
       y del otro lado hay más sitio, se voltea. */
    function ubicarGlobo(a, t, v, o) {
      o = o || {};
      const m = o.margen == null ? 12 : o.margen;
      const h = o.hueco == null ? 8 : o.hueco;
      const arriba = v.arriba || 0, abajo = v.abajo || 0;
      const w = Math.max(0, Math.min(t.w, v.w - 2 * m));
      let x = o.alinear === 'centro' ? a.left + a.width / 2 - w / 2
        : o.alinear === 'fin' ? a.right - w : a.left;
      x = Math.max(m, Math.min(v.w - m - w, x));
      const libreAbajo = v.h - abajo - m - (a.bottom + h);
      const libreArriba = a.top - h - (arriba + m);
      let lado = o.lado === 'arriba' ? 'arriba' : 'abajo';
      if (lado === 'abajo' && t.h > libreAbajo && libreArriba > libreAbajo) lado = 'arriba';
      else if (lado === 'arriba' && t.h > libreArriba && libreAbajo > libreArriba) lado = 'abajo';
      let libre = Math.max(0, lado === 'abajo' ? libreAbajo : libreArriba);
      /* Con el ancla casi en el borde —un teléfono acostado, el teclado abierto— los dos lados
         pueden quedarse en 60 px. Un globo de 60 px no se lee: se deja tapar el ancla y se usa
         el alto de la vista. */
      const minimo = Math.min(t.h, 160);
      let solapa = false;
      if (libre < minimo) { libre = v.h - arriba - abajo - 2 * m; solapa = true; }
      const alto = t.h > libre ? Math.floor(Math.max(0, libre)) : null;
      const hh = alto == null ? t.h : alto;
      let y = solapa ? arriba + m + (libre - hh) / 2
        : lado === 'abajo' ? a.bottom + h : a.top - h - hh;
      y = Math.max(arriba + m, Math.min(v.h - abajo - m - hh, y));
      return { x: Math.round(x), y: Math.round(y), lado, alto, ancho: Math.floor(w) };
    }

    const hojaAhora = () => { try { return g.matchMedia('(max-width:560px)').matches; } catch (_) { return false; } };

    function prepararGlobo(n) {
      n.classList.add('vistazo');
      if (!n.id) n.id = nuevoId('vistazo');
      if (CAPA && !n.hasAttribute('popover')) n.setAttribute('popover', 'manual');
      if (!n.hasAttribute('tabindex')) n.setAttribute('tabindex', '-1');
      return n;
    }

    /* Flechas, Inicio y Fin dentro de un globo con rol de menú: `role="menu"` sin flechas
       promete un patrón que no existe (F28 lo encontró en el menú de la cuenta). */
    function navegarMenu(n, e) {
      if (!/^(ArrowDown|ArrowUp|Home|End)$/.test(e.key)) return;
      const items = [...n.querySelectorAll('[role="menuitem"]')].filter(x => !x.disabled && x.getClientRects().length);
      if (!items.length) return;
      const i = items.indexOf(d.activeElement);
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
        : e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      e.preventDefault();
      enfocar(items[j]);
    }

    /* El tabulador dentro del globo. El globo vive al final de <body>, así que lo que sigue en el
       orden natural es el final del documento; y dentro de un modal del cotizador, el cerco de
       tabulador de _CAPAS ve el foco «fuera del modal» y lo regresa a su primer control. Así que
       se resuelve aquí y el evento no sigue: dentro del globo se recorre en orden; pasando el
       último, el globo se cierra y el foco sigue DESPUÉS de su ancla, como si el globo fuera parte
       de ella; antes del primero, vuelve al ancla. */
    function tabuladorEnGlobo(c, e) {
      e.stopPropagation();
      const n = c.pop, ancla = c._ancla();
      const f = [...n.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(x => x.getClientRects().length);
      const act = d.activeElement, i = f.indexOf(act);
      const sale = e.shiftKey ? (act === n || i === 0) : (act === n ? !f.length : i === f.length - 1);
      if (!sale) return;
      c.cerrar('foco');
      if (!ancla || !ancla.isConnected) return;
      enfocar(ancla);
      /* Hacia adelante no se detiene el evento: el navegador mueve el foco desde el ancla al que
         le sigue. Hacia atrás se queda en el ancla, que es lo anterior al globo. */
      if (e.shiftKey) e.preventDefault();
    }

    let oyendoGlobos = false;
    function oirGlobos() {
      if (oyendoGlobos) return;
      oyendoGlobos = true;
      /* En la captura de window: corre antes que los oyentes de Escape de las dos apps, que
         están en window pero en la fase de burbuja, y stopPropagation les quita el evento. */
      g.addEventListener('keydown', e => {
        const c = globoAbierto;
        if (!c) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); c.cerrar('escape'); return; }
        if (!c.pop.contains(d.activeElement)) return;
        if (e.key === 'Tab') { tabuladorEnGlobo(c, e); return; }
        if (c._rol() === 'menu') navegarMenu(c.pop, e);
      }, true);
      d.addEventListener('pointerdown', e => {
        const c = globoAbierto;
        if (!c || !c._fueraCierra() || c._contiene(e.target)) return;
        c.cerrar('fuera');
      }, true);
      /* El tabulador que se sale del globo lo cierra: si no, se quedaba abierto encima de lo
         que el teclado ya estaba recorriendo. */
      d.addEventListener('focusin', e => {
        const c = globoAbierto;
        if (!c || !c._fueraCierra() || c._contiene(e.target)) return;
        c.cerrar('foco');
      });
      let pedido = false;
      const pedir = () => {
        if (pedido || !globoAbierto) return;
        pedido = true;
        cuadro(() => { pedido = false; if (globoAbierto) globoAbierto.reubicar(); });
      };
      g.addEventListener('resize', pedir);
      g.addEventListener('scroll', pedir, { capture: true, passive: true });
    }

    /** P.vistazo(ancla, opciones) → { abrir(el?), cerrar(), alternar(el?), abierto(), reubicar(), pop, destruir() }
        ancla: el botón (elemento o id), el contenedor si hay `delegar`, o null para abrirlo
        solo desde el código. Opciones: pop (el globo ya pintado; si falta, se crea uno en
        <body>), contenido (cadena de HTML de la pantalla, nodo, o función (ancla, pop) que
        devuelve cualquiera de los dos; se llama en cada apertura), titulo (aria-label), rol
        ('dialog' · 'menu' · 'nota'), lado, alinear, hoja (en el teléfono sale como hoja de
        abajo), tocarFueraCierra, enfocar, delegar (selector), sinClic, alAbrir(pop, ancla),
        alCerrar(pop, motivo), clase. */
    P.vistazo = function (ancla, opciones) {
      const o = Object.assign({ rol: 'dialog', lado: 'abajo', alinear: 'inicio', hoja: false,
        tocarFueraCierra: true, enfocar: true }, opciones || {});
      const raiz = ancla == null ? null : P.$(ancla);
      const dado = o.pop ? P.$(o.pop) : null;
      const llave = raiz || dado;
      if (llave) {
        const ya = (GLOBOS_EN.get(llave) || new Map()).get(o.delegar || '');
        if (ya) { ya._fijar(opciones || {}); return ya; }
      }
      let pop = dado ? prepararGlobo(dado) : null;
      let actual = null;
      const nota = () => o.rol === 'nota';
      const marcar = (el, abierto) => {
        el.classList.toggle('vistazo-ancla-abierta', abierto);
        if (nota()) {
          if (abierto) el.setAttribute('aria-describedby', pop.id); else el.removeAttribute('aria-describedby');
          return;
        }
        el.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        if (abierto) {
          el.setAttribute('aria-controls', pop.id);
          if (!el.hasAttribute('aria-haspopup')) el.setAttribute('aria-haspopup', o.rol === 'menu' ? 'menu' : 'dialog');
        }
      };
      const c = {
        get pop() {
          if (!pop) { pop = prepararGlobo(flotante('vistazo' + (o.clase ? ' ' + o.clase : ''))); GLOBO_DE.set(pop, c); }
          return pop;
        },
        abierto: () => globoAbierto === c,
        abrir(el) {
          el = el ? P.$(el) : raiz;
          if (!el || !el.isConnected) return c;
          if (globoAbierto && globoAbierto !== c) globoAbierto.cerrar('otro');
          const n = c.pop;
          if (globoAbierto === c && actual === el) return c.reubicar();
          if (actual && actual !== el) marcar(actual, false);
          actual = el;
          if (o.contenido != null) {
            const r = typeof o.contenido === 'function' ? o.contenido(el, n) : o.contenido;
            if (typeof r === 'string') n.innerHTML = r;
            else if (r && r.nodeType) n.replaceChildren(r);
          }
          if (o.titulo) n.setAttribute('aria-label', o.titulo);
          n.setAttribute('role', o.rol === 'menu' ? 'menu' : nota() ? 'note' : 'dialog');
          if (o.rol === 'menu') n.querySelectorAll('button,a[href]').forEach(b => { if (!b.hasAttribute('role')) b.setAttribute('role', 'menuitem'); });
          n.classList.toggle('en-hoja', !!o.hoja && hojaAhora());
          marcar(el, true);
          globoAbierto = c;
          oirGlobos();
          subir(n);
          c.reubicar();
          /* El foco entra al globo para que el lector lo lea y el tabulador siga dentro; en un
             menú, al primer renglón. Una nota (la ficha de una pieza) no se lleva el foco: se
             anuncia como descripción del ancla. */
          if (!nota() && o.enfocar !== false) {
            const primero = o.rol === 'menu' ? n.querySelector('[role="menuitem"]') : null;
            enfocar(primero || n);
          }
          if (o.alAbrir) o.alAbrir(n, el);
          return c;
        },
        cerrar(motivo) {
          if (globoAbierto !== c) return c;
          const n = pop, el = actual;
          const teniaFoco = !!(n && n.contains(d.activeElement));
          globoAbierto = null;
          /* El teclado no anima (§2.18): Escape cierra sin salida. */
          if (motivo === 'escape') { n.classList.add('vz-corte'); dosCuadros(() => n.classList.remove('vz-corte')); }
          bajar(n);
          if (el) marcar(el, false);
          actual = null;
          /* Se devuelve el foco con Escape, o cuando lo cerró el código con el foco adentro
             (un «Copiar» que termina el trabajo). Con un toque fuera no: el dedo ya eligió a
             dónde va, y quitárselo es pelearle. */
          const devolver = motivo === 'escape' || (teniaFoco && (motivo == null || motivo === 'codigo' || motivo === 'alternar'));
          if (devolver && el && el.isConnected) enfocar(el);
          if (o.alCerrar) o.alCerrar(n, motivo || 'codigo');
          return c;
        },
        alternar(el) {
          el = el ? P.$(el) : raiz;
          if (globoAbierto === c && (!el || el === actual)) return c.cerrar('alternar');
          return c.abrir(el);
        },
        reubicar() {
          if (globoAbierto !== c) return c;
          const n = pop;
          if (!n.isConnected) { globoAbierto = null; actual = null; return c; }
          let el = actual;
          /* La pantalla repintó y el ancla ya no existe. Si tenía id se busca a su gemela (el
             anidador repinta la mesa en cada mejora y vuelve a poner los mismos ids); si no, el
             globo se cierra: un globo que apunta a nada miente. */
          if (!el || !el.isConnected) {
            const gemela = el && el.id ? d.getElementById(el.id) : null;
            if (!gemela) { c.cerrar('ancla'); return c; }
            actual = el = gemela;
            marcar(el, true);
          }
          if (n.classList.contains('en-hoja')) { n.style.left = n.style.top = n.style.maxHeight = ''; return c; }
          n.style.maxHeight = '';
          const u = ubicarGlobo(el.getBoundingClientRect(), { w: n.offsetWidth, h: n.offsetHeight },
            { w: anchoVista(), h: altoVista() }, o);
          n.style.left = u.x + 'px';
          n.style.top = u.y + 'px';
          if (u.alto != null) n.style.maxHeight = u.alto + 'px';
          n.dataset.lado = u.lado;
          n.style.setProperty('--vz-origen', (u.lado === 'abajo' ? 'top ' : 'bottom ') +
            (o.alinear === 'fin' ? 'right' : o.alinear === 'centro' ? 'center' : 'left'));
          return c;
        },
        destruir() {
          c.cerrar('codigo');
          if (raiz) {
            raiz.removeEventListener('click', alClic);
            raiz.removeEventListener('keydown', alTecla);
            const m = GLOBOS_EN.get(raiz);
            if (m) m.delete(o.delegar || '');
          }
          if (pop && !dado) pop.remove();
        },
        _fijar: nuevas => Object.assign(o, nuevas),
        _rol: () => o.rol,
        _fueraCierra: () => o.tocarFueraCierra !== false,
        _ancla: () => actual,
        _contiene: t => !!((pop && pop.contains(t)) || (actual && actual.contains(t))),
      };
      function alClic(e) {
        if (o.delegar) {
          const el = e.target.closest ? e.target.closest(o.delegar) : null;
          if (!el || !raiz.contains(el)) return;
          e.preventDefault();
          c.alternar(el);
          return;
        }
        e.preventDefault();
        c.alternar(raiz);
      }
      /* Delegado sobre algo que no es botón —una <g> del SVG del anidador con tabindex—:
         Enter y Espacio abren, como en un botón. */
      function alTecla(e) {
        if (!o.delegar || (e.key !== 'Enter' && e.key !== ' ')) return;
        const el = e.target.closest ? e.target.closest(o.delegar) : null;
        if (!el || !raiz.contains(el) || esControl(el)) return;
        e.preventDefault();
        c.alternar(el);
      }
      if (raiz && !o.sinClic) {
        raiz.addEventListener('click', alClic);
        raiz.addEventListener('keydown', alTecla);
        if (!o.delegar && !nota()) {
          raiz.setAttribute('aria-haspopup', o.rol === 'menu' ? 'menu' : 'dialog');
          raiz.setAttribute('aria-expanded', 'false');
          raiz.setAttribute('aria-controls', c.pop.id);
        }
      }
      if (llave) {
        let m = GLOBOS_EN.get(llave);
        if (!m) GLOBOS_EN.set(llave, m = new Map());
        m.set(o.delegar || '', c);
      }
      if (pop) GLOBO_DE.set(pop, c);
      return c;
    };
    P.vistazo.ubicar = ubicarGlobo;

    /* La manera declarativa: un solo oyente en el documento para todos los botones con
       data-vistazo. Si la pantalla ya cableó ese botón con P.vistazo(), su clic llega aquí con
       defaultPrevented y no se abre dos veces. */
    if (!P._vistazosDeclarados && d.addEventListener) {
      P._vistazosDeclarados = true;
      d.addEventListener('click', e => {
        if (e.defaultPrevented) return;
        const b = e.target && e.target.closest ? e.target.closest('[data-vistazo]') : null;
        if (!b) return;
        const n = d.getElementById(b.getAttribute('data-vistazo'));
        if (!n) return;
        e.preventDefault();
        const c = GLOBO_DE.get(n) || P.vistazo(null, { pop: n, sinClic: true,
          rol: n.getAttribute('data-rol') || 'dialog',
          lado: b.getAttribute('data-lado') || 'abajo',
          alinear: b.getAttribute('data-alinear') || 'inicio',
          hoja: b.hasAttribute('data-hoja') });
        c.alternar(b);
      });
    }

    /** El globo como cadena, para pintarlo con innerHTML junto a su botón. `cuerpo` es HTML de
        la pantalla (ya escapado). rol: 'dialog' (por omisión), 'menu' o 'nota'. */
    P.vistazoHTML = function (o) {
      o = o || {};
      const rol = o.rol === 'menu' ? 'menu' : o.rol === 'nota' ? 'note' : 'dialog';
      return `<div class="vistazo${o.clase ? ' ' + P.esc(o.clase) : ''}" id="${P.esc(o.id)}" popover="manual" role="${rol}"` +
        (o.rol && o.rol !== 'dialog' ? ` data-rol="${P.esc(o.rol)}"` : '') +
        (o.titulo ? ` aria-label="${P.esc(o.titulo)}"` : '') + ` tabindex="-1">${o.cuerpo || ''}</div>`;
    };

    /** El «?» que explica (muestra 73, el plazo sugerido): el botón de 44 px y su globo, juntos.
        { id, etiqueta (aria-label del botón), titulo, cuerpo (HTML de la pantalla), clase } */
    P.porqueHTML = function (o) {
      o = o || {};
      const id = o.id || nuevoId('porque');
      return `<button type="button" class="porque${o.clase ? ' ' + P.esc(o.clase) : ''}" data-vistazo="${P.esc(id)}" data-alinear="${P.esc(o.alinear || 'centro')}"` +
        ` aria-haspopup="dialog" aria-expanded="false" aria-controls="${P.esc(id)}" aria-label="${P.esc(o.etiqueta || 'Por qué')}">?</button>` +
        P.vistazoHTML({ id, titulo: o.titulo || o.etiqueta || 'Por qué', cuerpo: o.cuerpo });
    };

    /* =================== Variante · Los iconos sin texto dicen su nombre ===================
       Hasta 560 px el cotizador deja solo el icono en Deshacer, Clientes, Historial, Tema y
       Plataforma (sistema.css, bloque del teléfono), y los tres de cada partida —duplicar, ojo,
       borrar— nunca tuvieron texto. El nombre existía en `title` y en `aria-label`, y ninguno de
       los dos se ve en un teléfono.

       Con el dedo: mantener 450 ms enseña el nombre y ESE toque ya no dispara la acción. Es lo
       importante: en el bote de la partida, el toque largo del que quería saber qué era no puede
       terminar borrándola. El clic que llega después se detiene en la fase de captura, antes que
       el onclick en línea del botón.
       Con ratón: el primero espera 400 ms y, mientras el grupo sigue «caliente» (600 ms después
       de salir de uno), los vecinos salen al instante — WarmTooltip.
       Con teclado: al enfocar con el tabulador (:focus-visible), al momento; Escape lo quita.

       Es un solo nodo para toda la página, aria-hidden: el nombre ya lo tiene el botón en su
       aria-label, y leerlo dos veces es ruido. Solo se ve en los que NO tienen texto visible —
       un botón con su rótulo ya dice su nombre—, salvo con `siempre`, para la barra lateral de
       la plataforma (P31), donde lo que añade es la tecla del atajo. */
    const SEL_NOMBRES = 'button[aria-label],a[aria-label],[role="button"][aria-label],button[title],a[title],[data-nombre]';
    const NOMBRES_EN = new WeakMap();     // raíz → Map(selector → control)
    let tip = null, tipPara = null, calienteHasta = 0, oyendoTip = false;

    const tieneTexto = el => /[\p{L}\p{N}]{2,}/u.test(el.innerText || '');
    /* El `title` nativo sale al segundo y se encima con el nuestro: mientras el ratón está
       encima se guarda aparte. Si el botón no tenía otro nombre que ese title, se le presta como
       aria-label, para no dejarlo sin nombre justo mientras se le apunta. */
    function guardarTitulo(el) {
      const t = el.getAttribute('title');
      if (t == null) return;
      el.setAttribute('data-pz-titulo', t);
      el.removeAttribute('title');
      if (!el.hasAttribute('aria-label') && !tieneTexto(el)) { el.setAttribute('aria-label', t); el.setAttribute('data-pz-presto', ''); }
    }
    function devolverTitulo(el) {
      const t = el.getAttribute('data-pz-titulo');
      if (t == null) return;
      el.removeAttribute('data-pz-titulo');
      /* Si la app le puso otro title mientras tanto (un ojo que pasó a «Mostrar en el PDF»),
         manda el suyo. */
      if (!el.hasAttribute('title')) el.setAttribute('title', t);
      if (el.hasAttribute('data-pz-presto')) { el.removeAttribute('aria-label'); el.removeAttribute('data-pz-presto'); }
    }
    function nombreDe(el, o) {
      const r = o.texto ? o.texto(el) : null;
      if (r && typeof r === 'object') return { nombre: String(r.nombre || ''), tecla: String(r.tecla || '') };
      /* El último recurso es el texto del botón: en la barra lateral (P31) el nombre ya se ve y
         lo que añade la etiqueta es la tecla. */
      const nombre = r || el.getAttribute('data-nombre') || el.getAttribute('aria-label') ||
        el.getAttribute('data-pz-titulo') || el.getAttribute('title') || el.textContent || '';
      return { nombre: String(nombre).replace(/\s+/g, ' ').trim(), tecla: el.getAttribute('data-tecla') || el.getAttribute('aria-keyshortcuts') || '' };
    }
    function ensenarNombre(el, o) {
      const { nombre, tecla } = nombreDe(el, o);
      if (!nombre || !el.isConnected) return false;
      if (!tip || !tip.isConnected) { tip = flotante('nombre-tip'); tip.setAttribute('aria-hidden', 'true'); }
      tip.textContent = nombre;
      if (tecla) { const k = d.createElement('kbd'); k.textContent = tecla; tip.append(' ', k); }
      subir(tip);
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      const x = Math.max(8, Math.min(anchoVista() - w - 8, r.left + r.width / 2 - w / 2));
      /* Arriba del icono, que es donde no lo tapa el dedo; si no cabe (la barra de arriba del
         teléfono), abajo. */
      let y = r.top - h - 8, lado = 'arriba';
      if (y < 8) { y = r.bottom + 8; lado = 'abajo'; }
      tip.style.left = Math.round(x) + 'px';
      tip.style.top = Math.round(y) + 'px';
      tip.dataset.lado = lado;
      tipPara = el;
      if (!oyendoTip) {
        oyendoTip = true;
        g.addEventListener('scroll', () => { if (tipPara) esconderNombre(); }, { capture: true, passive: true });
      }
      return true;
    }
    function esconderNombre(caliente) {
      if (tipPara) calienteHasta = ahora() + (caliente == null ? 600 : caliente);
      tipPara = null;
      if (tip) bajar(tip);
    }

    /** P.nombres(raiz = document, opciones) → { destruir() }
        Opciones: selector (qué elementos; por omisión los que tienen aria-label o title),
        siempre (también los que tienen texto visible), toque (mantener para ver; true),
        raton (el caliente; true), espera (400), caliente (600), mantener (450),
        texto(el) → cadena o {nombre, tecla} (por omisión data-nombre, aria-label o title; la
        tecla sale de data-tecla o aria-keyshortcuts). */
    P.nombres = function (raiz, opciones) {
      raiz = raiz == null ? d : P.$(raiz);
      if (!raiz) return null;
      const o = Object.assign({ selector: SEL_NOMBRES, siempre: false, toque: true, raton: true,
        espera: 400, caliente: 600, mantener: 450 }, opciones || {});
      let m = NOMBRES_EN.get(raiz);
      if (!m) NOMBRES_EN.set(raiz, m = new Map());
      if (m.has(o.selector)) { Object.assign(m.get(o.selector)._o, opciones || {}); return m.get(o.selector); }

      let tRaton = 0, tLargo = 0, pres = null, x0 = 0, y0 = 0, suprimir = null, suprimirHasta = 0;
      const objetivo = t => {
        const el = t && t.closest ? t.closest(o.selector) : null;
        if (!el || (raiz !== d && !raiz.contains(el))) return null;
        return o.siempre || !tieneTexto(el) ? el : null;
      };
      const soltarPres = () => { if (pres) pres.classList.remove('nombre-presionando'); pres = null; };
      const oyentes = {
        pointerover(e) {
          if (!o.raton || e.pointerType !== 'mouse' || !P.punteroFino()) return;
          const el = objetivo(e.target);
          if (!el || el === tipPara) return;
          clearTimeout(tRaton);
          guardarTitulo(el);
          const caliente = tipPara || ahora() < calienteHasta;
          tRaton = setTimeout(() => { if (el.matches(':hover')) ensenarNombre(el, o); }, caliente ? 0 : o.espera);
        },
        pointerout(e) {
          if (e.pointerType !== 'mouse') return;
          const el = objetivo(e.target);
          if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
          clearTimeout(tRaton);
          devolverTitulo(el);
          if (tipPara === el) esconderNombre(o.caliente);
        },
        focusin(e) {
          const el = objetivo(e.target);
          if (!el) return;
          let visible = false;
          try { visible = el.matches(':focus-visible'); } catch (_) { visible = false; }
          /* El teclado gana: un «caliente» pendiente de otro icono bajo el ratón ya no sale. */
          if (visible) { clearTimeout(tRaton); ensenarNombre(el, o); }
        },
        focusout(e) { if (tipPara && tipPara === objetivo(e.target)) esconderNombre(0); },
        pointerdown(e) {
          if (!o.toque || e.pointerType === 'mouse') return;
          clearTimeout(tLargo);
          soltarPres();
          suprimir = null;
          const el = objetivo(e.target);
          if (!el) return;
          pres = el; x0 = e.clientX; y0 = e.clientY;
          el.classList.add('nombre-presionando');
          tLargo = setTimeout(() => {
            if (pres !== el) return;
            if (ensenarNombre(el, o)) { suprimir = el; suprimirHasta = ahora() + 1500; vibrar(8); }
          }, o.mantener);
        },
        pointermove(e) {
          if (!pres || e.pointerType === 'mouse') return;
          /* Diez píxeles es desplazar la página, no mantener: se suelta sin enseñar nada. */
          if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) { clearTimeout(tLargo); soltarPres(); }
        },
        pointerup(e) {
          if (e.pointerType === 'mouse') return;
          clearTimeout(tLargo);
          const el = pres;
          soltarPres();
          if (el && suprimir === el) setTimeout(() => { if (tipPara === el) esconderNombre(0); }, 900);
        },
        pointercancel() {
          clearTimeout(tLargo);
          const el = pres;
          soltarPres();
          if (el && suprimir === el) setTimeout(() => { if (tipPara === el) esconderNombre(0); }, 900);
        },
        /* En captura, en la raíz: corre ANTES que el onclick del botón y que la delegación de
           la plataforma, y el toque que solo quería saber el nombre no llega a ninguno. */
        click(e) {
          if (!suprimir) return;
          const el = e.target && e.target.closest ? e.target.closest(o.selector) : null;
          if (el !== suprimir || ahora() > suprimirHasta) { suprimir = null; return; }
          suprimir = null;
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        },
        /* El menú del toque largo de Android (copiar, abrir en pestaña) sobre un icono. */
        contextmenu(e) { if ((pres || suprimir) && objetivo(e.target)) e.preventDefault(); },
        keydown(e) { if (e.key === 'Escape' && tipPara) esconderNombre(0); },
      };
      const captura = { click: true, contextmenu: true };
      for (const k in oyentes) raiz.addEventListener(k, oyentes[k], !!captura[k]);
      const c = {
        _o: o,
        destruir() {
          for (const k in oyentes) raiz.removeEventListener(k, oyentes[k], !!captura[k]);
          clearTimeout(tRaton); clearTimeout(tLargo); soltarPres();
          if (tipPara && objetivo(tipPara)) esconderNombre(0);
          m.delete(o.selector);
        },
      };
      m.set(o.selector, c);
      return c;
    };

    /* =================== 7 · El encendido de neón, un momento ===================
       La cotización autorizada —también la que autoriza Dirección desde otro teléfono— se
       ENCIENDE como un anuncio de neón flex: dos parpadeos, un haz de luz que da dos vueltas al
       borde, y se apaga. Dura 2.6 s y no vuelve: la regla de la hoja es que una sola pieza se
       mueve sola, y esto es un momento, no una pieza que se mueve.

       Tres modos, para los tres lugares que lo piden:
         · 'borde' (C23): una capa encima del borde con el halo y, dentro, el haz: un cuadro con
           un degradado cónico que GIRA con transform, recortado a un anillo de 2 px con una
           máscara. La muestra lo hacía girando el ángulo del degradado con @property, que
           repinta la tarjeta entera en cada cuadro; girar una capa es trabajo del compositor.
         · 'texto' (A27, el título de «acerca»): una copia del texto con text-shadow, encima,
           que parpadea en opacidad. Discreto (alfa .25): el título se lee igual sin él. La
           página no tiene guiones, así que también existe solo con CSS: la clase
           `neon-al-cargar` lo enciende al cargar.
         · 'logo' (A17, al volver la señal): la envoltura del logo lleva `neon-apagado` (el
           logo en gris) y se enciende encima una copia a color; al terminar se queda a color.
       Con menos movimiento no hay parpadeo ni haz: el halo aparece y se va en un fundido. */
    const NEON = new WeakMap();

    /** P.encenderNeon(el, {modo:'borde'|'texto'|'logo', fuerza:'fuerte'|'discreta', queda, alTerminar})
        → { listo: Promise, apagar() }. Llamarla otra vez sobre el mismo elemento reinicia. */
    P.encenderNeon = function (el, opciones) {
      el = P.$(el);
      const o = Object.assign({ modo: 'borde', fuerza: 'fuerte', queda: false }, opciones || {});
      if (!el || !el.isConnected) return { listo: Promise.resolve(false), apagar() {} };
      const previo = NEON.get(el);
      if (previo) previo.apagar();
      const quieto = P.sinMovimiento();
      const modo = /^(borde|texto|logo)$/.test(o.modo) ? o.modo : 'borde';
      const fuerza = o.fuerza === 'discreta' ? 'discreta' : 'fuerte';
      const capas = [];
      const span = cls => { const s = d.createElement('span'); s.className = cls; s.setAttribute('aria-hidden', 'true'); return s; };
      let estatico = false;
      try { estatico = g.getComputedStyle(el).position === 'static'; } catch (_) { estatico = false; }
      if (estatico && modo !== 'texto') el.classList.add('neon-ancla');
      let prestoTexto = false, prestoClase = false;
      if (modo === 'borde') {
        const capa = span('neon-capa');
        if (!quieto && fuerza === 'fuerte') {
          const haz = span('neon-haz');
          const r = el.getBoundingClientRect();
          /* El cuadro que gira tiene que cubrir la tarjeta en cualquier ángulo: su diagonal. */
          haz.style.setProperty('--neon-d', Math.ceil(Math.hypot(r.width, r.height) + 4) + 'px');
          capa.appendChild(haz);
        }
        el.appendChild(capa);
        capas.push(capa);
      } else if (modo === 'texto') {
        if (!el.hasAttribute('data-neon')) { el.setAttribute('data-neon', (el.textContent || '').trim()); prestoTexto = true; }
        if (!el.classList.contains('neon-texto')) { el.classList.add('neon-texto'); prestoClase = true; }
      } else {
        const img = el.querySelector('img,svg');
        if (img) {
          const copia = img.cloneNode(true);
          copia.removeAttribute('id');
          if (copia.tagName === 'IMG') copia.alt = '';
          const caja = span('neon-logo-copia');
          caja.appendChild(copia);
          el.appendChild(caja);
          capas.push(caja);
        }
        const halo = span('neon-halo');
        el.appendChild(halo);
        capas.push(halo);
      }
      el.classList.remove('neon-queda');
      el.classList.add('neon-encendido', 'neon-' + fuerza);
      if (modo !== 'texto') el.classList.add('neon-' + modo);
      let hecho = false, t = 0, resolver = null;
      const listo = new Promise(r => { resolver = r; });
      const apagar = () => {
        if (hecho) return;
        hecho = true;
        clearTimeout(t);
        capas.forEach(x => x.remove());
        el.classList.remove('neon-encendido', 'neon-borde', 'neon-logo', 'neon-fuerte', 'neon-discreta', 'neon-ancla');
        if (modo === 'logo') el.classList.remove('neon-apagado');
        if (modo === 'texto') {
          if (o.queda) el.classList.add('neon-queda');
          else {
            if (prestoClase) el.classList.remove('neon-texto');
            if (prestoTexto) el.removeAttribute('data-neon');
          }
        }
        NEON.delete(el);
        resolver(true);
        if (o.alTerminar) o.alTerminar();
      };
      /* Por reloj y no por animationend: una pestaña en segundo plano o un display:none a medio
         camino se tragan el evento, y la capa se quedaría puesta. Las duraciones son las del CSS. */
      const dura = quieto ? 1100 : modo === 'logo' ? 1900 : fuerza === 'discreta' ? 1800 : 2700;
      t = setTimeout(apagar, dura);
      NEON.set(el, { apagar });
      return { listo, apagar };
    };

    /* =================== 8 · Pasos que avanzan: la traza de lo que está pasando ===================
       Hoy #ai-status del cotizador, la burbuja de espera del asistente y el «Entrando…» de la
       puerta son UN renglón que se reescribe: «Preguntando a Gemini (intento 2)…» borra que
       Qwen no tenía llave, y a los 40 s nadie sabe si la app está trabajando o colgada. Con el
       cliente enfrente se lee mejor una lista que avanza: qué se hizo, en qué va, cuánto lleva.

       Avanza POR EVENTOS: la pantalla llama a paso() cuando algo pasa de verdad (el proveedor
       contestó, la hoja respondió, el PDF abrió); esta pieza no inventa progreso. El reloj de
       cada paso es el tiempo real desde que ese paso empezó, y al terminar se queda con lo que
       tardó. Un solo intervalo por traza, y solo mientras haya un paso trabajando.

       Al terminar se pliega en un renglón («Contestó Gemini en 18 s») con los pasos dentro de un
       <details>, por si alguien quiere ver por qué tardó.

       El lector de pantalla oye los cambios de estado por una región viva propia y NO oye el
       reloj: un aria-live sobre la lista leería «14 s, 15 s, 16 s…». */
    const TRAZAS = new WeakMap();
    const DICE_TRAZA = { espera: 'en espera', trabaja: 'en curso', ok: 'listo', salta: 'se saltó', mal: 'falló' };

    /* El reloj como texto: 's' cuenta segundos enteros («14 s»), 'ds' décimas («2.3 s», el PDF
       que abre en dos segundos). Pasado el minuto, «2 min 05 s»: el asistente puede tardar
       cuatro proveedores de 60 s y «185 s» no se lee. Menos de un segundo en 's' no se escribe. */
    function reloj(ms, modo) {
      if (!modo || ms == null || !(ms >= 0)) return '';
      const s = ms / 1000;
      if (s >= 60) { const e = Math.floor(s); return Math.floor(e / 60) + ' min ' + String(e % 60).padStart(2, '0') + ' s'; }
      if (modo === 'ds') return s.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s';
      return s < 1 ? '' : Math.floor(s) + ' s';
    }

    const FILA_TRAZA = '<span class="traza-marca" aria-hidden="true"></span><span class="traza-txt"><span class="traza-t"></span> <span class="traza-d"></span></span>' +
      '<span class="traza-reloj" aria-hidden="true"></span><span class="solo-voz traza-e"></span>';

    /** P.trazaHTML({etiqueta, pasos:[{clave, texto, estado, detalle}]}) → cadena. Para las
        listas de marcado fijo, como el arranque de la plataforma (P22): se pinta con esto y
        luego P.traza() la adopta tal como está. */
    P.trazaHTML = function (o) {
      o = o || {};
      const filas = (o.pasos || []).map(p => {
        const e = DICE_TRAZA[p.estado] ? p.estado : 'espera';
        return `<li class="traza-paso" data-clave="${P.esc(p.clave)}" data-estado="${e}"><span class="traza-marca" aria-hidden="true"></span>` +
          `<span class="traza-txt"><span class="traza-t">${P.esc(p.texto)}</span> <span class="traza-d">${P.esc(p.detalle || '')}</span></span>` +
          `<span class="traza-reloj" aria-hidden="true"></span><span class="solo-voz traza-e"> · ${DICE_TRAZA[e]}</span></li>`;
      }).join('');
      return `<div class="traza"${o.etiqueta ? ` role="group" aria-label="${P.esc(o.etiqueta)}"` : ''}><ol class="traza-pasos">${filas}</ol>` +
        '<p class="solo-voz traza-voz" role="status" aria-live="polite"></p></div>';
    };

    /** P.traza(el, {reloj:'s'|'ds'|false, plegar:true}) → { paso(clave, texto, estado, detalle),
        hecho(clave, detalle?), falla(clave, detalle?), salta(clave, detalle?),
        terminar({ok, resumen}), limpiar(), actual(), destruir() }
        Estados: espera · trabaja · ok · salta · mal. `texto` y `detalle` van como texto, nunca
        como HTML (los mensajes del asistente llegan de la hoja). */
    P.traza = function (el, opciones) {
      el = P.$(el);
      if (!el) return null;
      if (TRAZAS.has(el)) { const ya = TRAZAS.get(el); Object.assign(ya._o, opciones || {}); return ya; }
      const o = Object.assign({ reloj: 's', plegar: true }, opciones || {});
      el.classList.add('traza');
      let ol = el.querySelector('.traza-pasos');
      if (!ol) { ol = d.createElement('ol'); ol.className = 'traza-pasos'; el.appendChild(ol); }
      let voz = el.querySelector('.traza-voz');
      if (!voz) {
        voz = d.createElement('p');
        voz.className = 'solo-voz traza-voz';
        voz.setAttribute('role', 'status');
        voz.setAttribute('aria-live', 'polite');
        el.appendChild(voz);
      }
      const filas = new Map();
      ol.querySelectorAll('li[data-clave]').forEach(li => {
        filas.set(li.getAttribute('data-clave'), { li, t0: li.dataset.estado === 'trabaja' ? ahora() : 0, t1: 0 });
      });
      let tic = 0, pliegue = null;
      const parar = () => { clearInterval(tic); tic = 0; };
      const pintarReloj = f => {
        const r = f.li.querySelector('.traza-reloj');
        if (!r) return;
        const e = f.li.dataset.estado;
        const ms = e === 'trabaja' ? ahora() - f.t0 : (f.t0 && f.t1 ? f.t1 - f.t0 : null);
        r.textContent = reloj(ms, o.reloj);
      };
      const latir = () => {
        if (!el.isConnected) { parar(); return; }
        let alguno = false;
        filas.forEach(f => { if (f.li.dataset.estado === 'trabaja') { alguno = true; pintarReloj(f); } });
        if (!alguno) parar();
      };
      const arrancar = () => { if (!tic && o.reloj) tic = setInterval(latir, o.reloj === 'ds' ? 100 : 1000); };
      const estadoGeneral = () => {
        let t = false, m = false;
        filas.forEach(f => { const e = f.li.dataset.estado; if (e === 'trabaja') t = true; if (e === 'mal') m = true; });
        el.dataset.estado = t ? 'trabaja' : m ? 'mal' : 'quieta';
      };
      const desplegar = () => {
        if (!pliegue) return;
        el.insertBefore(ol, pliegue);
        pliegue.remove();
        pliegue = null;
      };
      const c = {
        _o: o,
        paso(clave, texto, estado, detalle) {
          clave = String(clave);
          estado = DICE_TRAZA[estado] ? estado : 'trabaja';
          desplegar();
          let f = filas.get(clave);
          if (!f) {
            const li = d.createElement('li');
            li.className = 'traza-paso';
            li.setAttribute('data-clave', clave);
            li.innerHTML = FILA_TRAZA;
            /* La entrada va en lo que NACE (§2.18): un paso nuevo entra; uno que cambia de estado,
               no vuelve a entrar. */
            if (!P.sinMovimiento()) { li.classList.add('nace'); li.addEventListener('animationend', () => li.classList.remove('nace'), { once: true }); }
            ol.appendChild(li);
            f = { li, t0: 0, t1: 0 };
            filas.set(clave, f);
          }
          const antes = f.li.dataset.estado;
          if (texto != null) f.li.querySelector('.traza-t').textContent = texto;
          if (detalle !== undefined) f.li.querySelector('.traza-d').textContent = detalle == null ? '' : detalle;
          if (estado !== antes) {
            const t = ahora();
            if (estado === 'trabaja') { f.t0 = t; f.t1 = 0; }
            else if (antes === 'trabaja') f.t1 = t;
            f.li.dataset.estado = estado;
            f.li.querySelector('.traza-e').textContent = ' · ' + DICE_TRAZA[estado];
            if (estado !== 'espera') {
              const tx = f.li.querySelector('.traza-t').textContent, dt = f.li.querySelector('.traza-d').textContent;
              voz.textContent = tx + (estado === 'trabaja' ? '' : ': ' + DICE_TRAZA[estado]) + (dt && estado !== 'trabaja' ? ' ' + dt : '');
            }
          }
          pintarReloj(f);
          if (estado === 'trabaja') arrancar();
          estadoGeneral();
          return c;
        },
        hecho: (clave, detalle) => c.paso(clave, null, 'ok', detalle),
        falla: (clave, detalle) => c.paso(clave, null, 'mal', detalle),
        salta: (clave, detalle) => c.paso(clave, null, 'salta', detalle),
        /* Lo que seguía trabajando al terminar se cierra con el resultado general; lo que
           esperaba se queda esperando (nunca empezó, y decir «listo» sería mentir). */
        terminar(r) {
          r = r || {};
          const ok = r.ok !== false;
          filas.forEach((f, clave) => { if (f.li.dataset.estado === 'trabaja') c.paso(clave, null, ok ? 'ok' : 'mal'); });
          parar();
          el.dataset.estado = ok ? 'ok' : 'mal';
          if (r.resumen) {
            voz.textContent = r.resumen;
            if (o.plegar && !pliegue && filas.size) {
              pliegue = d.createElement('details');
              pliegue.className = 'traza-pliegue';
              const s = d.createElement('summary');
              s.className = 'traza-resumen';
              s.dataset.estado = ok ? 'ok' : 'mal';
              s.innerHTML = '<span class="traza-marca" aria-hidden="true"></span><span class="traza-t"></span>';
              s.lastChild.textContent = r.resumen;
              pliegue.appendChild(s);
              el.insertBefore(pliegue, ol);
              pliegue.appendChild(ol);
            }
          }
          return c;
        },
        limpiar() {
          parar();
          desplegar();
          ol.replaceChildren();
          filas.clear();
          voz.textContent = '';
          delete el.dataset.estado;
          return c;
        },
        actual() {
          for (const [clave, f] of filas) {
            if (f.li.dataset.estado === 'trabaja') return { clave, texto: f.li.querySelector('.traza-t').textContent, ms: ahora() - f.t0 };
          }
          return null;
        },
        destruir() { parar(); TRAZAS.delete(el); },
      };
      TRAZAS.set(el, c);
      if ([...filas.values()].some(f => f.li.dataset.estado === 'trabaja')) arrancar();
      return c;
    };
    P.traza.reloj = reloj;

    /* =================== 16 · Riel de pasos: vertical, horizontal, mini y con marcas ===================
       Nueve lugares con la misma pregunta —¿en qué paso va y qué falta?—: los hitos de entrega
       (PDF → WhatsApp → Venta) y sus puntos en el historial, los cuatro pasos del cotizador, la
       etapa en la ficha del proyecto, agendar, la calibración del escalador, el riel del taller,
       las estaciones del Tablero, los pasos de Google Cloud e instalar en el iPhone.

       Cuatro formas y un solo vocabulario de estados:
         hecho     relleno en --ok-fill con palomita (no solo color: la palomita es la forma)
         actual    anillo en azul con su número, y aria-current="step"
         pendiente anillo neutro con su número
         espera    anillo punteado ámbar: todavía no, espera a alguien (Dirección, el cliente)
         tarde     anillo rojo con una muesca: el hito que se quedó detrás de hoy (F5)
       El conector se llena en --ok-fill y no en azul: el azul es «el botón de la pantalla».

       rielHTML() devuelve el marcado y no cablea nada; P.riel() lo cablea (tocar un paso, no
       dejar marcar uno que no toca, palomear una lista que se recuerda) y fijar() cambia los
       estados EN SU SITIO, que es lo único que anima: la palomita entra y el conector se llena
       cuando un paso pasa a hecho, no cuando la pantalla repinta —pintarPasos() corre en cada
       tecla—. Un riel recién pintado con innerHTML nace quieto. */
    const RIELES = new WeakMap();
    const DICE_RIEL = { hecho: 'hecho', actual: 'paso actual', pendiente: 'pendiente', espera: 'en espera', tarde: 'va tarde' };
    const PALOMITA = '<svg class="riel-palomita" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.6 8.4l2.9 2.9 5.9-6.3"/></svg>';

    /* Los pasos como objetos con su estado. Sin estado escrito, lo decide `actual`: los de antes
       hechos, ese el actual y los de después pendientes. Una cadena suelta es el texto. */
    function normalizarPasos(pasos, actual) {
      const ps = (pasos || []).map(p => (typeof p === 'string' ? { texto: p } : Object.assign({}, p)));
      const hayEstados = ps.some(p => DICE_RIEL[p.estado]);
      const cur = actual == null ? (hayEstados ? -1 : 0) : actual;
      ps.forEach((p, i) => {
        if (!DICE_RIEL[p.estado]) p.estado = hayEstados ? 'pendiente' : i < cur ? 'hecho' : i === cur ? 'actual' : 'pendiente';
      });
      return ps;
    }
    const posRiel = v => { const n = Number(v); return Math.max(0, Math.min(1, isFinite(n) ? n : 0)); };

    /** P.rielHTML(pasos, opciones) → cadena.
        pasos: [{texto, nota, estado, clave, titulo, extra, pos}] o cadenas. `extra` es HTML de
        la pantalla (el botón del hito) y va debajo del texto; `pos` (0–1) solo en 'marcas'.
        opciones: forma ('vertical' · 'horizontal' · 'mini' · 'marcas'), actual (índice),
        tocable (cada paso es un botón), etiqueta (aria-label), id, clase, numeros (true),
        desliza (horizontal que se desliza en vez de apretarse), hoy (0–1, en 'marcas'). */
    P.rielHTML = function (pasos, opciones) {
      const o = Object.assign({ forma: 'vertical', numeros: true }, opciones || {});
      const ps = normalizarPasos(pasos, o.actual);
      const esc = P.esc;
      const cls = o.clase ? ' ' + esc(o.clase) : '';
      const id = o.id ? ` id="${esc(o.id)}"` : '';
      if (o.forma === 'mini') {
        const dice = o.etiqueta || ps.map(p => p.texto + ': ' + DICE_RIEL[p.estado]).join(' · ');
        return `<span class="riel riel-mini${cls}"${id} role="img" aria-label="${esc(dice)}">` +
          ps.map(p => `<i class="riel-punto" data-estado="${p.estado}"${p.titulo ? ` title="${esc(p.titulo)}"` : ''}>${p.estado === 'hecho' ? PALOMITA : ''}</i>`).join('') +
          '</span>';
      }
      if (o.forma === 'marcas') {
        /* aria-hidden a propósito (F5): el riel es el dibujo de una frase que ya se lee al lado. */
        return `<div class="riel riel-marcas${cls}"${id} aria-hidden="true"><span class="riel-pista"></span>` +
          ps.map(p => `<i class="riel-marca" data-estado="${p.estado}" style="--riel-pos:${posRiel(p.pos)}"${p.titulo ? ` title="${esc(p.titulo)}"` : ''}></i>`).join('') +
          (o.hoy != null ? `<i class="riel-hoy" style="--riel-pos:${posRiel(o.hoy)}"></i>` : '') + '</div>';
      }
      const h = o.forma === 'horizontal';
      const items = ps.map((p, i) => {
        const punto = `<span class="riel-punto" aria-hidden="true">${PALOMITA}${o.numeros ? `<b>${i + 1}</b>` : ''}</span>`;
        const txt = `<span class="riel-txt"><span class="riel-t">${esc(p.texto)}</span>` +
          (p.nota ? `<small class="riel-nota">${esc(p.nota)}</small>` : '') +
          `<span class="solo-voz riel-e"> · ${DICE_RIEL[p.estado]}</span></span>`;
        const cara = o.tocable
          ? `<button type="button" class="riel-boton" data-riel-i="${i}"${p.titulo ? ` title="${esc(p.titulo)}"` : ''}>${punto}${txt}</button>`
          : punto + txt;
        return `<li class="riel-paso" data-riel-i="${i}" data-estado="${p.estado}"${p.estado === 'actual' ? ' aria-current="step"' : ''}` +
          `${p.clave != null ? ` data-clave="${esc(p.clave)}"` : ''}>${cara}${p.extra ? `<div class="riel-extra">${p.extra}</div>` : ''}</li>`;
      }).join('');
      return `<ol class="riel riel-${h ? 'h' : 'v'}${o.desliza ? ' riel-desliza' : ''}${cls}"${id}${o.etiqueta ? ` aria-label="${esc(o.etiqueta)}"` : ''}>${items}</ol>`;
    };

    /** P.riel(el, opciones) → { fijar(pasos|estados, actual?), estados(), actual(), puede(i), negar(i), destruir() }
        el: el <ol class="riel"> que pintó rielHTML, o su contenedor. Opciones:
          alTocar(i, estado, li, evento): se tocó el paso i (solo con `tocable`).
          enOrden: no deja tocar un paso que no toca (ni adelantarse); dice cuál sigue.
          permitirAtras: con enOrden, los hechos sí se pueden tocar (true).
          marcable: tocar palomea o despalomea el paso (los pasos de Google Cloud, F32); el
            primero sin palomear queda como «vas aquí».
          alCambiar(estados): después de palomear, para que la pantalla lo recuerde.
          aviso(texto): cómo decir «ese paso todavía no toca» (el toast de la app); si falta, se
            dice por una región viva y el paso actual da una sacudida corta. */
    P.riel = function (el, opciones) {
      el = P.$(el);
      if (!el) return null;
      if (!el.classList.contains('riel')) el = el.querySelector('.riel') || el;
      if (RIELES.has(el)) { const ya = RIELES.get(el); Object.assign(ya._o, opciones || {}); return ya; }
      const o = Object.assign({ enOrden: false, permitirAtras: true, marcable: false }, opciones || {});
      const lis = () => [...el.children].filter(x => x.classList.contains('riel-paso'));
      const estados = () => lis().map(li => li.dataset.estado);
      const actual = () => {
        const l = lis();
        const i = l.findIndex(li => li.dataset.estado === 'actual');
        return i >= 0 ? i : l.findIndex(li => li.dataset.estado !== 'hecho');
      };
      let voz = null;
      const decir = t => {
        if (o.aviso) { o.aviso(t); return; }
        if (!voz) {
          voz = d.createElement('span');
          voz.className = 'solo-voz';
          voz.setAttribute('role', 'status');
          voz.setAttribute('aria-live', 'polite');
          if (el.parentNode) el.after(voz); else return;
        }
        voz.textContent = '';
        cuadro(() => { voz.textContent = t; });
      };
      const c = {
        _o: o,
        estados,
        actual,
        puede(i) {
          const l = lis(), li = l[i];
          if (!li) return false;
          if (!o.enOrden) return true;
          const cur = actual();
          if (i === cur) return true;
          if (li.dataset.estado !== 'hecho' || !o.permitirAtras) return false;
          /* Palomeando en orden, solo se despalomea el último: si no, queda un hueco en medio. */
          return !o.marcable || i === (cur < 0 ? l.length : cur) - 1;
        },
        negar(i) {
          const l = lis(), cur = actual();
          const sig = l[cur];
          const t = sig ? 'Ese paso todavía no toca. Sigue: ' + (sig.querySelector('.riel-t') || sig).textContent.trim() : 'Ese paso no se puede cambiar ahora';
          decir(t);
          if (sig && !P.sinMovimiento()) {
            sig.classList.remove('niega');
            void sig.offsetWidth;
            sig.classList.add('niega');
            sig.addEventListener('animationend', () => sig.classList.remove('niega'), { once: true });
          }
          return c;
        },
        fijar(nuevos, cur) {
          const l = lis();
          const ps = normalizarPasos((nuevos || []).map(x => (typeof x === 'string' && DICE_RIEL[x] ? { estado: x } : x)), cur);
          l.forEach((li, i) => {
            const p = ps[i];
            if (!p) return;
            if (p.texto != null) { const t = li.querySelector('.riel-t'); if (t && t.textContent !== String(p.texto)) t.textContent = p.texto; }
            if (p.nota != null) { const n = li.querySelector('.riel-nota'); if (n) n.textContent = p.nota; }
            const antes = li.dataset.estado;
            if (p.estado === antes) return;
            li.dataset.estado = p.estado;
            if (p.estado === 'actual') li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
            const e = li.querySelector('.riel-e');
            if (e) e.textContent = ' · ' + DICE_RIEL[p.estado];
            if (p.estado === 'hecho' && !P.sinMovimiento()) {
              li.classList.add('recien');
              setTimeout(() => li.classList.remove('recien'), 700);
            }
          });
          return c;
        },
        destruir() { el.removeEventListener('click', alClic); if (voz) voz.remove(); RIELES.delete(el); },
      };
      function alClic(e) {
        const b = e.target.closest ? e.target.closest('.riel-boton') : null;
        if (!b || !el.contains(b)) return;
        const l = lis();
        const i = l.indexOf(b.closest('.riel-paso'));
        if (i < 0) return;
        if (!c.puede(i)) { c.negar(i); return; }
        const li = l[i], antes = li.dataset.estado;
        if (o.marcable) {
          const marcas = l.map(x => x.dataset.estado === 'hecho');
          marcas[i] = !marcas[i];
          const primero = marcas.indexOf(false);
          c.fijar(marcas.map((m, k) => (m ? 'hecho' : k === primero ? 'actual' : 'pendiente')));
          if (o.alCambiar) o.alCambiar(estados());
        }
        if (o.alTocar) o.alTocar(i, antes, li, e);
      }
      el.addEventListener('click', alClic);
      RIELES.set(el, c);
      return c;
    };

    /* =================== 17 · Las esquinas que señalan a dónde llegaste ===================
       «Llevar a lo que falta» hace scroll y enfoca, pero si el campo queda bajo la barra fija o
       bajo el dedo no se ve a dónde llegó. Cuatro esquinas vuelan al rectángulo del destino, se
       quedan un momento y se van — TargetCursor, sin cursor.

       Tres cuidados que la muestra ya había pagado y que aquí se conservan:
         · Se mide cuando el destino DEJA DE MOVERSE. `scrollend` puede llegar de un scroll
           anterior, o no llegar (Safari hasta la 18); se espera a que su posición quede igual
           tres cuadros seguidos, con tope de 1 s.
         · La barra fija de arriba: `--top-fijo` (la publica ajustarTopbarMovil()) dice cuánto
           tapa. Si el destino queda debajo de ella o del dock, primero se trae a la vista;
           html lleva scroll-padding-top con esa misma variable, así que scrollIntoView lo deja
           por debajo de la barra.
         · Mientras están a la vista siguen al destino cuadro por cuadro, porque el dedo puede
           seguir desplazando. Es un bucle de un segundo, no uno que se queda.
       Solo se animan transform y opacity: cada esquina es una caja de 14 px que se traslada. La
       muestra animaba width y height del marco, que recalcula el trazado en cada cuadro.
       Con menos movimiento: un aro fijo durante 1 s, sin vuelo. */
    const LADO_ESQUINA = 14;
    const miras = [];                      // nodos que se reusan

    /* Dónde va la esquina de arriba a la izquierda de cada una de las cuatro cajas de 14 px, para
       enmarcar el rectángulo r con un margen de `pad` px. Sin DOM, para node. */
    function esquinasDe(r, pad, lado) {
      pad = pad || 0; lado = lado || LADO_ESQUINA;
      const izq = r.left - pad, arr = r.top - pad, der = r.left + r.width + pad - lado, aba = r.top + r.height + pad - lado;
      return [{ x: izq, y: arr }, { x: der, y: arr }, { x: izq, y: aba }, { x: der, y: aba }];
    }
    function ponerEsquinas(n, r, pad) {
      esquinasDe(r, pad).forEach((p, i) => { n.children[i].style.transform = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`; });
    }
    function rectDe(x) {
      if (!x) return null;
      if (x.getBoundingClientRect) return x.isConnected === false ? null : x.getBoundingClientRect();
      if (typeof x.left === 'number') return { left: x.left, top: x.top, width: x.width || 0, height: x.height || 0 };
      return null;
    }
    function cuandoQuieto(el, tope) {
      return new Promise(res => {
        if (!el || !el.getBoundingClientRect) { res(); return; }
        const t0 = ahora();
        let antes = null, iguales = 0;
        const mira = () => {
          const r = el.getBoundingClientRect(), k = Math.round(r.top) + ',' + Math.round(r.left);
          iguales = k === antes ? iguales + 1 : 0;
          antes = k;
          if (iguales >= 3 || ahora() - t0 > (tope || 1000)) res(); else cuadro(mira);
        };
        cuadro(mira);
      });
    }
    /* ¿Se ve entero, entre la barra fija de arriba y el dock de abajo? */
    function aLaVista(r) {
      const arriba = pxDe('--top-fijo'), abajo = pxDe('--mbar-h');
      return r.top >= arriba + 4 && r.top + r.height <= altoVista() - abajo - 4 && r.left >= 0 && r.left + r.width <= anchoVista();
    }

    /** P.senalar(destino, opciones) → { listo: Promise, soltar() }
        destino: elemento, id, rectángulo {left, top, width, height} o una lista de ellos (los
        avisos del anidador marcan varias piezas a la vez). Opciones: tono ('' · 'av' · 'mal' ·
        'ok'), pad (4), abre (de cuánto más grande vienen: 18), dura (900 ms a la vista),
        desplazar (traerlo a la vista primero), esperar (a que deje de moverse: true), quedar
        (se quedan hasta soltar(): «otro toque las suelta», A15). */
    P.senalar = function (destino, opciones) {
      const o = Object.assign({ tono: '', pad: 4, abre: 18, dura: 900, desplazar: false, esperar: true, quedar: false }, opciones || {});
      const lista = (Array.isArray(destino) ? destino : [destino]).map(x => (typeof x === 'string' ? P.$(x) : x)).filter(Boolean);
      let resolver = null, soltado = false;
      const listo = new Promise(r => { resolver = r; });
      const usados = [];
      let sigueRaf = 0, oyendo = false;
      const reubicar = () => usados.forEach(([n, x]) => { const r = rectDe(x); if (r) ponerEsquinas(n, r, o.pad); });
      const seguir = () => { if (soltado) return; reubicar(); sigueRaf = cuadro(seguir); };
      const alDesplazar = () => cuadro(reubicar);
      const fin = () => {
        if (soltado) return;
        soltado = true;
        if (sigueRaf && g.cancelAnimationFrame) g.cancelAnimationFrame(sigueRaf);
        sigueRaf = 0;
        if (oyendo) { g.removeEventListener('scroll', alDesplazar, true); g.removeEventListener('resize', alDesplazar); }
        usados.forEach(([n]) => n.classList.remove('ve'));
        setTimeout(() => { usados.forEach(([n]) => { bajar(n); n.classList.remove('sigue', 'sin-transicion'); miras.push(n); }); usados.length = 0; resolver(true); }, 220);
      };
      const mostrar = () => {
        if (soltado) return;
        const quieto = P.sinMovimiento();
        lista.forEach(x => {
          const r = rectDe(x);
          if (!r) return;
          let n = miras.pop();
          if (!n || !n.isConnected) n = flotante('mira');
          if (!n.children.length) { n.setAttribute('aria-hidden', 'true'); n.innerHTML = '<i></i><i></i><i></i><i></i>'; }
          n.dataset.tono = o.tono || '';
          n.classList.add('sin-transicion');
          n.classList.remove('ve', 'sigue');
          ponerEsquinas(n, r, quieto ? o.pad : o.pad + o.abre);
          subir(n);
          usados.push([n, x]);
        });
        if (!usados.length) { soltado = true; resolver(false); return; }
        dosCuadros(() => {
          if (soltado) return;
          usados.forEach(([n, x]) => {
            n.classList.remove('sin-transicion');
            n.classList.add('ve');
            const r = rectDe(x);
            if (r) ponerEsquinas(n, r, o.pad);
          });
          /* Cuando terminó de cerrarse, deja de transicionar y sigue al destino sin retraso. */
          setTimeout(() => {
            if (soltado) return;
            usados.forEach(([n]) => n.classList.add('sigue'));
            if (o.quedar) {
              oyendo = true;
              g.addEventListener('scroll', alDesplazar, { capture: true, passive: true });
              g.addEventListener('resize', alDesplazar);
            } else seguir();
          }, quieto ? 160 : 400);
          if (!o.quedar) setTimeout(fin, (quieto ? 1000 : o.dura) + (quieto ? 160 : 400));
        });
      };
      const primero = lista.find(x => x && x.getBoundingClientRect);
      let espera = Promise.resolve();
      if (primero && o.desplazar) {
        const r = primero.getBoundingClientRect();
        if (!aLaVista(r)) {
          try { primero.scrollIntoView({ block: 'center', inline: 'nearest', behavior: P.sinMovimiento() ? 'auto' : 'smooth' }); }
          catch (_) { primero.scrollIntoView(); }
        }
      }
      if (primero && (o.esperar || o.desplazar)) espera = cuandoQuieto(primero, 1000);
      espera.then(mostrar);
      return { listo, soltar: fin };
    };
    P.senalar.esquinas = esquinasDe;

    /** Las mismas cuatro esquinas dibujadas en un <canvas>: la lupa del escalador (H5) se
        repinta con cada movimiento del dedo y no puede llevar un nodo encima. r = {x, y, w, h}
        (el rectángulo que enmarcan), o = {largo: 8, grosor: 2, color}. */
    P.senalar.lienzo = function (ctx, r, o) {
      if (!ctx || !r) return;
      o = o || {};
      const L = o.largo || 8, x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;
      let color = o.color;
      if (!color) { try { color = g.getComputedStyle(d.documentElement).getPropertyValue('--a').trim(); } catch (_) { color = ''; } }
      ctx.save();
      ctx.strokeStyle = color || '#4060f8';
      ctx.lineWidth = o.grosor || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1 + L); ctx.lineTo(x1, y1); ctx.lineTo(x1 + L, y1);
      ctx.moveTo(x2 - L, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + L);
      ctx.moveTo(x1, y2 - L); ctx.lineTo(x1, y2); ctx.lineTo(x1 + L, y2);
      ctx.moveTo(x2 - L, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - L);
      ctx.stroke();
      ctx.restore();
    };

    /** La retícula fija del pin a mano (F9): cuatro esquinas quietas en el centro de su
        contenedor (que tiene que ser position:relative), con el contorno contrario al tema para
        verse de noche sobre el mapa. No se mueve: se mueve el mapa debajo. */
    P.reticulaHTML = function (o) {
      o = o || {};
      return `<div class="reticula${o.clase ? ' ' + P.esc(o.clase) : ''}" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
    };

    /* =================== 25 · Carga con los azules del logo ===================
       verificar.html es la única página que ve un tercero, y esperaba con el mismo anillo gris
       de toda la app. Tres círculos en los azules del logotipo que se juntan y se separan como
       líquido: el filtro «gooey» de Skiper (skiper64, gratis con atribución; la idea original es
       MetaBalls de React Bits, que es WebGL y no se porta) — un desenfoque y un umbral de alfa
       sobre tres <circle> que se trasladan con transform.
       Es una espera real: se mueve solo mientras dura, y terminar() la detiene y deja los tres
       círculos juntos, en la forma del logo. Con menos movimiento, un pulso lento de opacidad
       (el mismo `pulso-lento` de los giros de espera): la espera se sigue viendo.
       Los azules no llevan texto encima, nunca. */
    let serieGoo = 0;

    /** P.cargaLogoHTML({etiqueta, chica}) → cadena. `etiqueta` es lo que oye el lector
        («Consultando el registro»); sin ella, la carga es adorno de un texto que ya está al lado. */
    P.cargaLogoHTML = function (o) {
      o = o || {};
      const id = 'pz4-goo-' + (++serieGoo);
      return `<span class="carga-logo${o.chica ? ' carga-logo-chica' : ''}" data-carga="espera"${o.etiqueta ? ' role="status"' : ' aria-hidden="true"'}>` +
        '<svg class="carga-logo-svg" viewBox="0 0 96 40" aria-hidden="true" focusable="false">' +
        `<defs><filter id="${id}" x="-25%" y="-50%" width="150%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/>` +
        '<feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"/></filter></defs>' +
        `<g filter="url(#${id})"><circle class="c1" cx="30" cy="20" r="11"/><circle class="c2" cx="48" cy="20" r="9"/><circle class="c3" cx="64" cy="20" r="7"/></g></svg>` +
        (o.etiqueta ? `<span class="solo-voz carga-logo-voz">${P.esc(o.etiqueta)}</span>` : '') + '</span>';
    };

    /** P.cargaLogo(el, opciones) → { terminar(estado = 'ok' | 'mal', texto?), destruir() }
        el: un .carga-logo ya pintado, o el contenedor donde se agrega uno nuevo. */
    P.cargaLogo = function (el, opciones) {
      el = P.$(el);
      if (!el) return null;
      let n = el.classList.contains('carga-logo') ? el : el.querySelector('.carga-logo');
      if (!n) { el.insertAdjacentHTML('beforeend', P.cargaLogoHTML(opciones)); n = el.lastElementChild; }
      else n.dataset.carga = 'espera';
      return {
        nodo: n,
        /* Al quitar la animación el círculo saltaría a su sitio de reposo. Se copia primero dónde
           va (el transform calculado), se fija en línea y, un cuadro después, se suelta hacia la
           forma final con una transición: se juntan, no brincan. */
        terminar(estado, texto) {
          if (n.dataset.carga !== 'espera') return;
          const cs = [...n.querySelectorAll('circle')];
          const donde = cs.map(x => { try { return g.getComputedStyle(x).transform; } catch (_) { return 'none'; } });
          cs.forEach((x, i) => { x.style.transform = donde[i] === 'none' ? '' : donde[i]; });
          n.dataset.carga = estado === 'mal' ? 'mal' : 'ok';
          void n.getBoundingClientRect();
          dosCuadros(() => cs.forEach(x => { x.style.transform = ''; }));
          const voz = n.querySelector('.carga-logo-voz');
          if (voz && texto) voz.textContent = texto;
        },
        destruir() { n.remove(); },
      };
    };

    /* =================== 26 · El letrero mientras se escribe ===================
       «Escribe el texto →» solo contaba letras. Debajo del campo, el texto tecleado dibujado
       como letras con volumen: DepthText de React Bits, en CSS puro (text-shadow apilado para el
       canto) y sin bucle.

       La regla del negocio, que no se invierte nunca:
         · ALUMINIO = cara opaca y LED POSTERIOR: la luz sale por detrás y lava la pared. Es un
           halo con drop-shadow del color de la luz, detrás de la letra.
         · ACRÍLICO = canto de aluminio y LED FRONTAL: la cara ES la luz y brilla hacia el frente.
       El tono sigue la ficha de luz cálida o fría; el color de la cara, el del material.

       Sirve igual encima de la foto del local (función 32): `alto` en px es el alto REAL de la
       letra en la foto (cm × px por cm del escalador), y el tamaño de letra se saca de la altura
       de la mayúscula medida en la tipografía de verdad, no de un 0.7 supuesto: en Sora la «H»
       mide 0.70 del cuerpo, en la de reserva 0.73, y a 45 cm eso son 2 cm de mentira en la foto
       que se le enseña al cliente.
       Siempre dice «ilustrativo»: no es la tipografía del cliente. */
    const RAZON_H = new Map();
    function razonMayuscula(el) {
      let fam = '';
      try { fam = g.getComputedStyle(el).fontFamily; } catch (_) { fam = ''; }
      if (RAZON_H.has(fam)) return RAZON_H.get(fam);
      let r = 0.72;
      try {
        const cx = d.createElement('canvas').getContext('2d');
        cx.font = '800 100px ' + fam;
        const m = cx.measureText('H');
        if (m.actualBoundingBoxAscent > 30 && m.actualBoundingBoxAscent < 100) r = m.actualBoundingBoxAscent / 100;
      } catch (_) { r = 0.72; }
      /* Con la fuente todavía de camino se mide la de reserva: vale para ahora, no se guarda. */
      if (!d.fonts || d.fonts.status === 'loaded') RAZON_H.set(fam, r);
      return r;
    }
    const tamLetra = (altoPx, razon) => Math.max(1, Number(altoPx) / (razon || 0.72));
    const LUCES = { fria: 'luz fría', calida: 'luz cálida', ninguna: 'sin luz' };
    function claseLetrero(o) {
      const mat = o.material === 'acrilico' ? 'acrilico' : 'aluminio';
      const luz = LUCES[o.luz] ? (o.luz === 'ninguna' ? 'sin-luz' : 'luz-' + o.luz) : 'luz-propia';
      return 'letrero letrero-' + mat + ' ' + luz;
    }
    function etiquetaLetrero(texto, o) {
      const mat = o.material === 'acrilico' ? 'acrílico con LED frontal' : 'aluminio con LED posterior';
      const luz = LUCES[o.luz] || 'luz de color';
      return 'Letrero ilustrativo: «' + texto + '» · ' + (o.luz === 'ninguna' ? (o.material === 'acrilico' ? 'acrílico' : 'aluminio') + ' sin luz' : mat + ' · ' + luz);
    }
    function estiloLetrero(o, razon) {
      const partes = [];
      if (o.color) partes.push('--letrero-cara:' + o.color);
      if (!LUCES[o.luz] && o.luz) partes.push('--letrero-luz:' + o.luz);
      if (o.alto) partes.push('font-size:' + tamLetra(o.alto, razon).toFixed(1) + 'px');
      else if (o.tam) partes.push('font-size:' + (typeof o.tam === 'number' ? o.tam + 'px' : o.tam));
      return partes.join(';');
    }

    /** P.letreroHTML(texto, opciones) → cadena.
        opciones: material ('aluminio' · 'acrilico'), luz ('fria' · 'calida' · 'ninguna' · un
        color CSS), color (la cara: aluminio pintado negro, acrílico rojo…), alto (px de la
        mayúscula), tam (tamaño de letra), pared (lo envuelve en la pared oscura con la nota
        «Ilustrativo»), nota (el texto de esa nota). */
    P.letreroHTML = function (texto, opciones) {
      const o = Object.assign({ material: 'aluminio', luz: 'fria' }, opciones || {});
      texto = String(texto == null ? '' : texto);
      const estilo = estiloLetrero(o, null);
      const letra = `<span class="${claseLetrero(o)}" role="img" aria-label="${P.esc(etiquetaLetrero(texto, o))}"` +
        `${estilo ? ` style="${P.esc(estilo)}"` : ''}>${P.esc(texto)}</span>`;
      if (!o.pared) return letra;
      return `<div class="letrero-pared">${letra}<span class="letrero-nota" aria-hidden="true">${P.esc(o.nota || 'Ilustrativo')}</span></div>`;
    };

    const LETREROS = new WeakMap();
    /** P.letrero(el, opciones) → { fijar(cambios), destruir() }
        el: el nodo que ES el letrero (un <span> vacío sirve). Mismas opciones que letreroHTML,
        más texto, y ajustar (achica la letra hasta que quepa en su contenedor: la vista previa
        de C14 en un teléfono de 360). Solo se mueve porque alguien escribe: fijar() no anima. */
    P.letrero = function (el, opciones) {
      el = P.$(el);
      if (!el) return null;
      if (LETREROS.has(el)) { const ya = LETREROS.get(el); ya.fijar(opciones || {}); return ya; }
      const o = Object.assign({ material: 'aluminio', luz: 'fria', texto: el.textContent || '' }, opciones || {});
      let obs = null, pedido = false;
      const ajustar = () => {
        if (!o.ajustar || !el.parentElement) return;
        el.style.fontSize = '';
        const cs = g.getComputedStyle(el);
        const base = o.alto ? tamLetra(o.alto, razonMayuscula(el)) : o.tam ? parseFloat(o.tam) || parseFloat(cs.fontSize) : parseFloat(cs.fontSize);
        el.style.fontSize = base + 'px';
        const p = el.parentElement, pc = g.getComputedStyle(p);
        const cabe = p.clientWidth - (parseFloat(pc.paddingLeft) || 0) - (parseFloat(pc.paddingRight) || 0);
        const mide = el.scrollWidth;
        if (cabe > 0 && mide > cabe) el.style.fontSize = Math.max(12, base * cabe / mide * 0.98).toFixed(1) + 'px';
      };
      const pedirAjuste = () => { if (pedido) return; pedido = true; cuadro(() => { pedido = false; ajustar(); }); };
      const c = {
        fijar(cambios) {
          Object.assign(o, cambios || {});
          const texto = String(o.texto == null ? '' : o.texto);
          if (el.textContent !== texto) el.textContent = texto;
          /* Se cambian solo las clases del letrero: las que puso la pantalla (dónde va sobre la
             foto) se quedan. */
          [...el.classList].forEach(k => { if (/^(letrero(-aluminio|-acrilico)?|luz-(fria|calida|propia)|sin-luz)$/.test(k)) el.classList.remove(k); });
          claseLetrero(o).split(' ').forEach(k => el.classList.add(k));
          el.setAttribute('role', 'img');
          el.setAttribute('aria-label', etiquetaLetrero(texto, o));
          el.style.removeProperty('--letrero-cara');
          el.style.removeProperty('--letrero-luz');
          if (o.color) el.style.setProperty('--letrero-cara', o.color);
          if (o.luz && !LUCES[o.luz]) el.style.setProperty('--letrero-luz', o.luz);
          if (o.ajustar) ajustar();
          else if (o.alto) el.style.fontSize = tamLetra(o.alto, razonMayuscula(el)).toFixed(1) + 'px';
          else if (o.tam) el.style.fontSize = typeof o.tam === 'number' ? o.tam + 'px' : o.tam;
          else el.style.fontSize = '';
          return c;
        },
        destruir() { if (obs) obs.disconnect(); LETREROS.delete(el); },
      };
      c.fijar();
      if (o.ajustar && g.ResizeObserver && el.parentElement) { obs = new g.ResizeObserver(pedirAjuste); obs.observe(el.parentElement); }
      /* La tipografía llega después del primer trazado: al llegar, se vuelve a medir la H. */
      if (d.fonts && d.fonts.status !== 'loaded' && d.fonts.ready) d.fonts.ready.then(() => { if (el.isConnected) c.fijar(); }).catch(() => {});
      LETREROS.set(el, c);
      return c;
    };
    P.letrero.tamLetra = tamLetra;

    /* =================== Patrón · Búsqueda con fichas y coincidencia resaltada ===================
       El historial busca en folio, cliente, teléfono, total y partidas, pero no se veía POR QUÉ
       salió cada resultado —sobre todo si coincidió en una partida o en el teléfono—, y
       «¿cuáles autoricé y no he mandado?» no tenía respuesta directa (H8, H15, P6).

       plegar() quita acentos y mayúsculas SIN perder a qué letra original corresponde cada letra
       plegada: así la marca cae en «Panadería» aunque se buscó «panaderia». Con una búsqueda de
       puros números se comparan solo los dígitos: «331234» encuentra «33 1234 5678», que es como
       se pega un teléfono. resaltar() escapa POR TRAMOS —esc(antes) + <mark>esc(tramo)</mark>—,
       así que buscar «amp» nunca rompe un &amp;, y lo único que añade es <mark>.
       La marca va en --a-suave con la tinta completa (--a-claro y --a3 no llevan texto). */
    const DIACRITICOS = /[̀-ͯ]/g;

    /** P.plegarTexto(s, soloDigitos) → {txt, ini, fin}: el texto plegado y, por cada unidad de txt,
        dónde empieza y dónde termina en el original. */
    P.plegarTexto = function (s, soloDigitos) {
      s = String(s == null ? '' : s);
      let txt = '';
      const ini = [], fin = [];
      for (let i = 0; i < s.length;) {
        const ch = String.fromCodePoint(s.codePointAt(i));
        const plegado = ch.normalize('NFD').replace(DIACRITICOS, '').toLowerCase();
        for (const u of plegado) {
          if (soloDigitos && !/\d/.test(u)) continue;
          for (let k = 0; k < u.length; k++) { txt += u[k]; ini.push(i); fin.push(i + ch.length); }
        }
        i += ch.length;
      }
      return { txt, ini, fin };
    };
    const limpiarBusqueda = q => String(q == null ? '' : q).trim().replace(/\s+/g, ' ');
    const numerica = q => /\d/.test(q) && /^[\d\s,.$()+-]+$/.test(q);
    P.esNumerica = q => numerica(limpiarBusqueda(q));

    /** P.coincide(texto, busqueda) → true si la búsqueda está en el texto, sin acentos ni
        mayúsculas (y solo dígitos si la búsqueda es de puros números). Vacía coincide siempre. */
    P.coincide = function (s, q) {
      q = limpiarBusqueda(q);
      if (!q) return true;
      const n = numerica(q), qq = P.plegarTexto(q, n).txt;
      return !qq || P.plegarTexto(s, n).txt.includes(qq);
    };

    /** P.resaltar(texto, busqueda) → HTML escapado con <mark class="coincide"> en cada tramo que
        coincide. Listo para innerHTML: no hace falta pasarlo por esc(). */
    P.resaltar = function (s, q) {
      s = String(s == null ? '' : s);
      q = limpiarBusqueda(q);
      if (!q) return P.esc(s);
      const n = numerica(q), p = P.plegarTexto(s, n), qq = P.plegarTexto(q, n).txt;
      if (!qq) return P.esc(s);
      let out = '', desde = 0, i = p.txt.indexOf(qq);
      while (i !== -1) {
        const a = p.ini[i], b = p.fin[i + qq.length - 1];
        if (a >= desde) { out += P.esc(s.slice(desde, a)) + '<mark class="coincide">' + P.esc(s.slice(a, b)) + '</mark>'; desde = b; }
        i = p.txt.indexOf(qq, i + qq.length);
      }
      return out + P.esc(s.slice(desde));
    };

    /** P.fichasHTML(fichas, {activo, etiqueta, multiple}) → cadena.
        fichas: [{id, texto, n}] — `n` es el conteo (se calcula una vez al abrir: dice cuántas hay,
        no cuántas quedan tras buscar). Cada ficha es un <button> con aria-pressed; la activa va
        hundida en --a-suave y NO es el botón con relleno de la pantalla. */
    P.fichasHTML = function (fichas, opciones) {
      const o = opciones || {};
      const activas = new Set([].concat(o.activo == null ? [] : o.activo).map(String));
      return `<div class="fichas" role="group"${o.etiqueta ? ` aria-label="${P.esc(o.etiqueta)}"` : ''}>` +
        (fichas || []).map(f => `<button type="button" class="chip ficha" data-ficha="${P.esc(f.id)}" aria-pressed="${activas.has(String(f.id))}">` +
          `${P.esc(f.texto)}${f.n != null ? ` <span class="ficha-n">${P.esc(f.n)}</span>` : ''}</button>`).join('') + '</div>';
    };

    const FICHAS = new WeakMap();
    /** P.fichas(el, {alElegir(valor, boton), multiple, todas}) → { elegir(id), valor(), contar(mapa), destruir() }
        el: el .fichas (o su contenedor). Sencilla por omisión: una activa a la vez, y tocar la
        activa la suelta y regresa a `todas` si existe («etiquetas removibles»). Con `multiple`,
        cada una se prende y se apaga, y valor() es la lista. */
    P.fichas = function (el, opciones) {
      el = P.$(el);
      if (!el) return null;
      if (!el.classList.contains('fichas')) el = el.querySelector('.fichas') || el;
      if (FICHAS.has(el)) { const ya = FICHAS.get(el); Object.assign(ya._o, opciones || {}); return ya; }
      const o = Object.assign({ multiple: false, todas: null }, opciones || {});
      const botones = () => [...el.querySelectorAll('[data-ficha]')];
      const prendidas = () => botones().filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.getAttribute('data-ficha'));
      const c = {
        _o: o,
        valor: () => (o.multiple ? prendidas() : (prendidas()[0] == null ? null : prendidas()[0])),
        elegir(id, avisar) {
          id = id == null ? null : String(id);
          botones().forEach(b => {
            const es = b.getAttribute('data-ficha') === id;
            if (o.multiple) { if (es) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); }
            else b.setAttribute('aria-pressed', es ? 'true' : 'false');
          });
          if (avisar !== false && o.alElegir) o.alElegir(c.valor(), botones().find(b => b.getAttribute('data-ficha') === id) || null);
          return c;
        },
        contar(mapa) {
          botones().forEach(b => {
            const k = b.getAttribute('data-ficha');
            if (!mapa || !(k in mapa)) return;
            let n = b.querySelector('.ficha-n');
            if (!n) { n = d.createElement('span'); n.className = 'ficha-n'; b.append(' ', n); }
            n.textContent = mapa[k];
          });
          return c;
        },
        destruir() { el.removeEventListener('click', alClic); FICHAS.delete(el); },
      };
      function alClic(e) {
        const b = e.target.closest ? e.target.closest('[data-ficha]') : null;
        if (!b || !el.contains(b)) return;
        const id = b.getAttribute('data-ficha');
        if (!o.multiple && b.getAttribute('aria-pressed') === 'true') {
          if (o.todas != null && id !== String(o.todas)) c.elegir(o.todas);
          return;
        }
        c.elegir(id);
      }
      el.addEventListener('click', alClic);
      FICHAS.set(el, c);
      return c;
    };
  }
  /* ── fin de 4 ── */
})(typeof window !== 'undefined' ? window : undefined);
