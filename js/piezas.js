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

  /* ── fin de 2 ── */

  /* ==========================================================================
     3 · NÚMEROS, MEDIDAS Y CAMPOS
     ========================================================================== */

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

    /** P.plegar(s, soloDigitos) → {txt, ini, fin}: el texto plegado y, por cada unidad de txt,
        dónde empieza y dónde termina en el original. */
    P.plegar = function (s, soloDigitos) {
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
      const n = numerica(q), qq = P.plegar(q, n).txt;
      return !qq || P.plegar(s, n).txt.includes(qq);
    };

    /** P.resaltar(texto, busqueda) → HTML escapado con <mark class="coincide"> en cada tramo que
        coincide. Listo para innerHTML: no hace falta pasarlo por esc(). */
    P.resaltar = function (s, q) {
      s = String(s == null ? '' : s);
      q = limpiarBusqueda(q);
      if (!q) return P.esc(s);
      const n = numerica(q), p = P.plegar(s, n), qq = P.plegar(q, n).txt;
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
