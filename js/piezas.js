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
