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
     el gesto. */
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
      d.addEventListener('touchend', () => _hojaSuelta(true), { passive: true });
      d.addEventListener('touchcancel', () => _hojaSuelta(false), { passive: true });
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
    if (_gesto || e.touches.length !== 1) return;
    const h = _hojaDe(e.target); if (!h) return;
    const p = e.touches[0];
    if (_hojaEmpieza(h.cfg, h.hoja, e.target, p.clientX, p.clientY, { tipo: 'toque' }))
      d.addEventListener('touchmove', _hojaToqueMueve, { passive: false });
  }
  function _hojaToqueMueve(e) {
    if (!_gesto || _gesto.tipo !== 'toque') return;
    if (e.touches.length !== 1) { _hojaSuelta(false); return; }   // un segundo dedo no mueve la hoja
    const p = e.touches[0];
    /* Que no se mueva la página de atrás ni se dispare el «jalar para recargar». */
    if (_hojaMueve(p.clientX, p.clientY, e.timeStamp) && e.cancelable) e.preventDefault();
  }
  function _hojaPuntero(e) {
    if (_gesto || e.pointerType === 'touch' || e.button !== 0) return;
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
    d.removeEventListener('touchmove', _hojaToqueMueve);
    const gs = _gesto; _gesto = null;
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
    }, 360);
    if (cierra) { try { gs.cerrar(); } catch (_) {} }
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
     que corre al teclear: cada tecla fotografiaría la pantalla entera. */
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
  /**
   * Corre `fn` —el repintado— y enseña el viaje de lo nombrado.
   * @param {Function} fn
   * @param {{nombres?:string|string[]|Object, clave?:Function, contenedor?:string|Element,
   *          direccion?:'adelante'|'atras'|'sube', duracion?:number, vt?:boolean}} o
   * @returns {Promise<void>}  se cumple al terminar el viaje (o en el acto, sin movimiento)
   */
  P.transicion = function (fn, o = {}) {
    if (typeof fn !== 'function') return Promise.resolve();
    const correr = () => { try { fn(); return Promise.resolve(); } catch (e) { return Promise.reject(e); } };
    if (_vt) { try { _vt.skipTransition(); } catch (_) {} }
    if (P.sinMovimiento() || d.hidden) return correr();
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
    if (o.duracion) raiz.style.setProperty('--vt-dur', o.duracion + 'ms');
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
     borrada; al enfocarla, la fila se corre lo justo para que se lea entera. */
  const _bordes = new WeakMap();
  /** ¿Hay contenido escondido antes y después? pos, tamaño total, tamaño visible. */
  P.bordesDe = (pos, total, vista, tol = 2) => ({ antes: pos > tol, despues: pos + vista < total - tol });
  /**
   * @param {string|Element} x  la fila (o lista) que se desplaza
   * @param {{eje?:'x'|'y'|'auto', margen?:number}} o
   * @returns {{medir():void, revelar(el:string|Element, suave?:boolean):void, destruir():void}|null}
   */
  P.bordesDesvanecidos = function (x, o = {}) {
    const el = _el(x); if (!el) return null;
    if (_bordes.has(el)) return _bordes.get(el);
    const eje = o.eje || 'auto', margen = o.margen || 32;
    let horiz = eje === 'x', rq = 0;
    el.classList.add('bordes');
    if (o.margen) el.style.setProperty('--borde', margen + 'px');
    const medir = () => {
      rq = 0;
      if (!el.isConnected) return;
      horiz = eje === 'x' || (eje === 'auto' && el.scrollWidth - el.clientWidth > el.scrollHeight - el.clientHeight);
      const b = horiz ? P.bordesDe(Math.abs(el.scrollLeft), el.scrollWidth, el.clientWidth)
                      : P.bordesDe(el.scrollTop, el.scrollHeight, el.clientHeight);
      el.classList.toggle('bordes-x', horiz);
      el.classList.toggle('bordes-y', !horiz);
      el.classList.toggle('hay-antes', b.antes);
      el.classList.toggle('hay-despues', b.despues);
    };
    const pedir = () => { if (!rq) rq = _raf(medir); };
    const revelar = (h, suave) => {
      const hijo = typeof h === 'string' ? el.querySelector(h) : h;
      if (!hijo || !el.contains(hijo)) return;
      const r = hijo.getBoundingClientRect(), c = el.getBoundingClientRect();
      const comp = { behavior: suave ? _suave() : 'auto' };
      if (horiz) {
        const dx = r.left < c.left + margen ? r.left - c.left - margen : r.right > c.right - margen ? r.right - c.right + margen : 0;
        if (Math.abs(dx) >= 1) el.scrollBy(Object.assign({ left: dx }, comp));
      } else {
        const dy = r.top < c.top + margen ? r.top - c.top - margen : r.bottom > c.bottom - margen ? r.bottom - c.bottom + margen : 0;
        if (Math.abs(dy) >= 1) el.scrollBy(Object.assign({ top: dy }, comp));
      }
    };
    /* Un cuadro después: el navegador también corre la fila al enfocar, y lo hace DESPUÉS del
       evento; corregir antes que él sería corregir para nada. */
    const alEnfocar = e => { const t = e.target; if (t !== el) _raf(() => { revelar(t, false); pedir(); }); };
    el.addEventListener('scroll', pedir, { passive: true });
    el.addEventListener('focusin', alEnfocar);
    g.addEventListener('resize', pedir, { passive: true });
    let ro = null, mo = null;
    try { ro = new g.ResizeObserver(pedir); ro.observe(el); } catch (_) {}
    /* Las fichas cambian con cada repintado y el contenedor no cambia de tamaño: sin esto, un
       filtro que deja tres fichas seguiría diciendo que hay más. */
    try { mo = new g.MutationObserver(pedir); mo.observe(el, { childList: true, subtree: true, characterData: true }); } catch (_) {}
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(pedir, () => {});
    medir();
    const control = {
      medir, revelar,
      destruir() {
        el.removeEventListener('scroll', pedir); el.removeEventListener('focusin', alEnfocar);
        g.removeEventListener('resize', pedir);
        if (ro) ro.disconnect(); if (mo) mo.disconnect();
        el.classList.remove('bordes', 'bordes-x', 'bordes-y', 'hay-antes', 'hay-despues');
        _bordes.delete(el);
      },
    };
    _bordes.set(el, control);
    return control;
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
  /**
   * @param {string|Element|Array<string|Element>} barras  la barra (o las barras apiladas)
   * @param {{lado?:'abajo'|'arriba', alto?:number, media?:string}} o
   * @returns {{medir():void, destruir():void}}
   */
  P.desenfoqueProgresivo = function (barras, o = {}) {
    const lado = o.lado === 'arriba' ? 'arriba' : 'abajo';
    const lista = Array.isArray(barras) ? barras : [barras];
    const clave = lado + '|' + lista.map(b => (typeof b === 'string' ? b : (b && b.id) || '?')).join(',');
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
    const alBajar = e => {
      if (e.button > 0 || e.isPrimary === false) return;
      const c = e.target.closest && e.target.closest('.desliza-cara');
      const f = c && c.parentElement;
      if (!f || !f.classList.contains('desliza') || !cont.contains(f)) return;
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
      if (acc) { const f = acc.closest('.desliza'); setTimeout(() => { if (f && f.isConnected) cerrar(f); }, 0); }
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
      const f = abierta; cerrar(f);
      const c = cara(f), foco = c && c.querySelector('button,a[href],[tabindex]:not([tabindex="-1"])');
      if (foco && f.contains(d.activeElement)) { try { foco.focus({ preventScroll: true }); } catch (_) {} }
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
     tiempo: es información, no adorno. */
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
   *            olvidar(clave:string):void, destruir():void}|null}
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
        if (P.sinMovimiento() || !el.animate) return Promise.resolve();
        return el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(.98)' }],
          { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished.then(() => {}, () => {});
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
     Con menos movimiento, ir a una página es un salto y no un desplazamiento. */
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
    tira.classList.add('paginas');
    if (!tira.hasAttribute('tabindex')) tira.tabIndex = 0;
    if (!tira.hasAttribute('role')) tira.setAttribute('role', 'region');
    tira.setAttribute('aria-roledescription', 'carrusel');
    if (o.etiqueta) tira.setAttribute('aria-label', o.etiqueta);
    const centros = () => {
      const c = tira.getBoundingClientRect();
      return pags.map(p => { const r = p.getBoundingClientRect(); return r.left - c.left + tira.scrollLeft + r.width / 2; });
    };
    const pintarBarra = () => {
      if (!barra) return;
      const n = pags.length, muchos = n > 7;
      barra.hidden = n < 2;
      let h = '';
      if (o.flechas !== false) h += '<button type="button" class="paginas-flecha" data-pag="-1" aria-label="' + P.esc(Nombre) + ' anterior">‹</button>';
      if (muchos) h += '<span class="paginas-cuenta" aria-hidden="true"></span>';
      else for (let i = 0; i < n; i++) h += '<button type="button" class="paginas-punto" data-pag-ir="' + i + '" aria-label="Ir a la ' + P.esc(nombre) + ' ' + (i + 1) + ' de ' + n + '"></button>';
      if (o.flechas !== false) h += '<button type="button" class="paginas-flecha" data-pag="1" aria-label="' + P.esc(Nombre) + ' siguiente">›</button>';
      barra.innerHTML = h;
    };
    const marcar = () => {
      if (!barra) return;
      barra.querySelectorAll('.paginas-punto').forEach((b, i) => { if (i === actual) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      const cuenta = barra.querySelector('.paginas-cuenta'); if (cuenta) cuenta.textContent = (actual + 1) + ' / ' + pags.length;
      const f = barra.querySelectorAll('.paginas-flecha');
      if (f[0]) f[0].disabled = actual <= 0;
      if (f[1]) f[1].disabled = actual >= pags.length - 1;
    };
    const calcular = () => {
      rq = 0;
      if (!pags.length) return;
      const i = P.paginaMasCercana(tira.scrollLeft + tira.clientWidth / 2, centros());
      if (i === actual) return;
      actual = i;
      pags.forEach((p, k) => p.classList.toggle('pagina-actual', k === i));
      marcar();
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
      pags = Array.from(tira.children).filter(p => p.nodeType === 1 && !p.hidden);
      pags.forEach((p, i) => {
        if (!p.hasAttribute('role')) p.setAttribute('role', 'group');
        p.setAttribute('aria-roledescription', nombre);
        /* El nombre de la página es de la pantalla si ya lo trae («Parada 2 de 4»); si no, el
           nuestro, y el nuestro se reescribe al cambiar la cuenta. */
        if (!p.hasAttribute('aria-label') || p.dataset.pagRotulo) { p.setAttribute('aria-label', Nombre + ' ' + (i + 1) + ' de ' + pags.length); p.dataset.pagRotulo = '1'; }
      });
      pintarBarra();
      actual = -1;            // que calcular() vuelva a marcar el punto y avise a la pantalla
      calcular();
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
    const pedir = () => { if (!rq) rq = _raf(calcular); };
    tira.addEventListener('scroll', pedir, { passive: true });
    tira.addEventListener('keydown', alTecla);
    if (barra) { barra.addEventListener('click', alClicBarra); barra.addEventListener('keydown', alTecla); }
    g.addEventListener('resize', pedir, { passive: true });
    try { mo = new g.MutationObserver(leer); mo.observe(tira, { childList: true }); } catch (_) {}
    leer();
    const control = {
      ir: i => ir(i), actual: () => actual, medir: leer,
      destruir() {
        clearTimeout(tAnuncio);
        tira.removeEventListener('scroll', pedir); tira.removeEventListener('keydown', alTecla);
        g.removeEventListener('resize', pedir);
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
     El dibujo es mudo (aria-hidden); lo que se oye es el texto de estado, en role="status". */
  const _BARRAS = { t: 'esq-t', d: 'esq-d', n: 'esq-n', campo: 'esq-campo', largo: 'esq-campo esq-largo', boton: 'esq-boton', bloque: 'esq-bloque' };
  const _barra = b => '<span class="esq-b ' + (_BARRAS[b] || 'esq-t') + '"></span>';
  /**
   * El HTML de una silueta. `forma`: 'lista' | 'cifras' | 'tarjeta' | 'bloque' | 'miniatura', o una
   * lista de barras (['t','d','campo','boton'…]).
   * @param {string|string[]} forma
   * @param {{texto?:string, filas?:number, cifras?:number, alto?:number, proporcion?:string, clase?:string, giro?:boolean}} o
   * @returns {string}
   */
  P.silueta = function (forma, o = {}) {
    let cuerpo = '';
    if (Array.isArray(forma)) cuerpo = forma.map(_barra).join('');
    else if (forma === 'lista') cuerpo = ('<span class="silueta-fila"><span class="esq-b silueta-ico"></span><span class="silueta-tx">' + _barra('t') + _barra('d') + '</span></span>').repeat(o.filas || 3);
    else if (forma === 'cifras') cuerpo = '<span class="silueta-cifras">' + ('<span class="silueta-cifra">' + _barra('n') + _barra('d') + '</span>').repeat(o.cifras || 4) + '</span>';
    else if (forma === 'bloque') cuerpo = '<span class="esq-b esq-bloque" style="height:' + (+o.alto || 220) + 'px"></span>';
    else if (forma === 'miniatura') cuerpo = '<span class="esq-b silueta-mini" style="aspect-ratio:' + P.esc(o.proporcion || '4 / 3') + '"></span>';
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

  /* ── fin de 3 ── */

  /* ==========================================================================
     4 · SEÑALAR, EXPLICAR Y SELLAR
     ========================================================================== */

  /* ── fin de 4 ── */
})(typeof window !== 'undefined' ? window : undefined);
