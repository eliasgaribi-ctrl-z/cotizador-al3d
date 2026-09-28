# Piezas · 2 — Hojas, listas y transiciones (API para las pantallas)

Todo cuelga de `window.Piezas` (en la plataforma: `const P = window.Piezas;` dentro del módulo;
en el cotizador y el anidador: `Piezas.x(...)` directo). El estilo está en `css/sistema.css`,
bloque «Piezas · 2», y su apagado en «rm · piezas · 2». **No copies nada de esto en tu pantalla:
llama la pieza.** Si te falta algo, anótalo en `piezasQueFaltan`.

Reglas comunes a toda la sección:

- **Idempotentes.** Llamar dos veces sobre el mismo elemento devuelve el MISMO control y no
  duplica oyentes. Las que viven sobre listas que se repintan con innerHTML (`filasDeslizables`,
  `plegables`, `paginas`) escuchan en el CONTENEDOR: repintar sus hijos no las desarma. Llama
  una vez al montar la pantalla (sobre un contenedor que no se reemplaza).
- **La pantalla sigue siendo dueña de su repintado y de sus clics.** Las piezas no pintan tu
  lista ni saben qué hace tu botón; los botones que generan llevan TUS atributos (`data-*`) y tu
  delegación de siempre los atiende. Sin `on…=` en el HTML: sirve igual a la plataforma.
- **Nunca envuelvas lo que corre al teclear** (`transicion`, `listaViva.repintar` con
  animación): solo acciones de estructura (abrir, mover, borrar, cambiar de mes o de pantalla).
  `listaViva.repintar` sí se puede llamar en cada tecla: no reinicia nada, esa es su gracia.
  (`transicion` además se defiende sola: llamada desde un evento de escritura —`input`,
  `beforeinput`, composición— o desde una tecla que se repite por tenerla apretada, solo corre
  `fn`.)
- **Menos movimiento** se pregunta en el momento (`P.sinMovimiento()`); cada pieza dice abajo qué
  apaga y qué conserva.

---

## 13 · La hoja del teléfono se baja con el dedo — `P.hojasDeslizables(o)`

Ya está colgada en las dos apps; **ninguna pantalla tiene que hacer nada** para que sus hojas
se bajen con el dedo:

- Plataforma (`js/nucleo/ui.js`): `.pf-modal-bg.show>.pf-panel`, cabeza `.pf-panel-h`, cuerpo
  `.pf-panel-b`. Toda capa registrada con `registrarCapa(id, cerrar)` y abierta con
  `abrirCapa(id)` se cierra por su `cerrar`, igual que la ×, Escape y el atrás (P10, F8).
- Cotizador (`js/cotizador/nucleo.js`): `.modal-bg.show>.modal`, cabeza `.modal-h`, cuerpo
  `.modal-b`, cierre por `_CAPAS` (C26). OJO: `histmodal` y `climodal` son `.hist-panel`, no
  `.modal`: no son hojas para el gesto (como hasta hoy).

Parámetros (para otra superficie que quiera lo mismo, p. ej. el anidador):

| opción | tipo | qué |
|---|---|---|
| `hoja` | selector | la hoja ABIERTA, p. ej. `'.modal-bg.show>.modal'`. Su padre es el velo. |
| `cabeza` | selector | desde aquí se arrastra siempre (también con ratón). |
| `cuerpo` | selector | desde aquí solo si ninguna caja con scroll entre el dedo y la hoja tiene `scrollTop>0`. |
| `cierre` | `(velo, hoja) => Function\|null` | **obligatorio**: la función de cierre de esa capa (la de la ×). `null` = no se arrastra. |
| `excluir` | selector | nunca empieza aquí (por omisión `input,textarea,select,[contenteditable="true"],canvas`). |
| `activa` | `() => bool` | por omisión `matchMedia('(max-width:560px)')`. |
| `cierra`, `velocidad` | px, px/ms | 90 y 0,11. El umbral real es `min(90, 40 % del alto)`. |

Devuelve `{ destruir() }`. Clases que pone: `.hoja-arrastrando` en la hoja; `.hoja-velo-sigue` y
`.hoja-velo-suelta` en el velo, con `--arrastre` (0–1) y `--velo-a` (el tinte que el velo tenía,
leído del render): el velo se aclara en su **color**
(`rgba(var(--nav-rgb), velo-a·(1−arrastre))`), la hoja nunca pierde opacidad.

Dos cosas que tu capa puede hacer y la pieza ya aguanta: **rehacer la hoja a medio gesto**
(`repintarEnSitio`, que reemplaza el `.pf-panel` entero) suelta el arrastre y devuelve el velo,
y el gesto siguiente vuelve a funcionar; y **negarse a cerrar** (tu `cerrar` no cierra porque hay
algo sin guardar) devuelve el velo con la hoja en vez de dejarlo aclarado.

- Dedo: eventos de toque (decide a medio gesto si es scroll). Hacia arriba desde la cabeza cede
  12 px. De lado no es de la hoja (deja pasar carruseles y renglones deslizables).
- Ratón: desde la cabeza, no sobre botones/enlaces/campos.
- Teclado: nada nuevo; Escape y el atrás siguen como hoy (`registrarCapa`, `cerrarCapa`).
- Menos movimiento: la hoja no se desplaza (la hoja de estilos se lo impide), el velo sí se
  aclara y soltar lejos sigue cerrando.
- Asa: ya la pintan las dos hojas de estilo (`.pf-panel-h::before`, `.modal-h::before` ≤560 px).

Funciones puras (probadas en node): `P.hojaResistencia(bruto, tope=12)`,
`P.hojaVelocidad(pts)`, `P.hojaSeCierra({dy, v, alto, cierra, velocidad})`.

---

## 22 · La tarjeta viaja — `P.transicion(fn, o)` y `P.flip(objetivo, fn, o)`

`P.transicion(fn, o) → Promise<void>` corre `fn` (tu repintado, síncrono) y enseña el viaje.

| opción | tipo | qué |
|---|---|---|
| `nombres` | `{nombre: selector\|Element\|()=>Element}` · o selector(es) | lo que viaja. Con objeto, cada selector es UN elemento, re-buscado después del repintado. Con selector(es) (`'.partida'`), cada elemento se nombra por `clave(el)`. Tope 40. |
| `clave` | `el => string` | por omisión `el.dataset.vt \|\| el.id \|\| el.dataset.clave`. |
| `contenedor` | selector\|Element | la pantalla o rejilla que cambia ENTERA (P24, F11, H27). |
| `direccion` | `'adelante'\|'atras'\|'sube'` | con `contenedor`: sale hacia un lado y entra del otro (24 px); `sube` = de adentro. |
| `duracion` | ms | 320 por omisión (las pantallas de marco se miden al terminar: no la alargues). |
| `vt` | bool | `false` fuerza el FLIP de respaldo. |

- Con View Transitions: nombres temporales (`vt-<clave>` y `vt-contenedor`), puestos y quitados
  por la pieza. La raíz NO se funde (`html.vt-pieza`). `html[data-va]` mientras dura.
- Sin View Transitions, o con una capa abierta encima de lo que viaja: FLIP con Web Animations.
- Menos movimiento: solo `fn()`. Dos seguidas: la primera se salta.
- La promesa rechaza si `fn` lanzó.
- **`fn` NO corre en el acto** con View Transitions: el navegador fotografía el antes y la llama
  en el cuadro siguiente. Lo que dependa del DOM nuevo —devolver el foco al botón que se usó,
  medir, llevar algo a la vista— va **dentro de `fn`**, no en la línea de después. (Sin View
  Transitions y con menos movimiento sí corre en el acto; dentro de `fn` vale siempre.)
- Mientras dura el viaje, Chrome manda TODO toque al `<html>`: la página se ve viva y no recibe
  nada, y dos toques seguidos en «Agregar» agregaban uno. La pieza lo atiende: ese toque salta el
  viaje y se entrega a lo que está debajo del dedo. No hay nada que hacer en la pantalla.

`P.flip(objetivo, fn, o) → Promise<Element[]>` (los que se movieron): para MUCHAS piezas. Mide
cada una por `clave` (por omisión `id`), repinta, y cada una viaja de donde estaba; las que no
se movieron, quietas. Los `<g>` de SVG se animan de matriz a matriz (su translate+rotate), y solo
si siguen en la misma hoja (`<svg>`). `o.clase` se pone a las movidas mientras viajan;
`o.maximo` (150) o menos movimiento = cambio directo.

Ejemplos:

```js
// P8 · Proyectos: la tarjeta que cambió de etapa viaja a su columna (al cerrar la ficha).
P.transicion(() => pintar(), { nombres: { ['pj-' + id]: '[data-abrir="' + id + '"]' } });

// P24 · js/app.js montarDeVerdad(): la pantalla entra según su lugar en la barra.
const dir = oculta ? 'sube' : (iNueva > iVieja ? 'adelante' : 'atras');
P.transicion(() => { vieja.hidden = true; nueva.hidden = false; }, { contenedor: '#pf-contenido', direccion: dir });

// F11 · Calendario: cambiar de mes (con ‹ ›, con el gesto o con RePág): la rejilla entra del lado.
P.transicion(() => pintarMes(), { contenedor: '.cal-rej', direccion: delta > 0 ? 'adelante' : 'atras' });

// C1 · Partidas, SOLO en agregar/borrar/duplicar/plegar/reordenar (nunca en typeItem()):
P.transicion(() => renderItems(), { nombres: '#items>.partida', clave: el => el.id });

// A8 · Anidador: cada mejora, las piezas viajan en vez de volver a caer.
P.flip('#an-res g[id]', () => pintarResultado(), { clase: 'se-movio', maximo: 150 });
```

---

## 21 · El tema se abre en círculo — `AL3D_TEMA.revelar(desde, cambiar)`

Vive en `js/tema.js` (lo cargan TODAS las páginas; las de texto no cargan piezas.js). **El botón
`[data-tema-btn]` de todas las páginas ya lo usa (A32): no hay que hacer nada.**

- `desde`: el evento del toque (círculo desde el dedo), un elemento (desde su centro), `{x, y}`
  o nada (centro de la pantalla). Un Enter (evento con `detail===0`) usa el centro del botón.
- `cambiar`: la función que cambia el tema (y repinta lo que dependa de él): corre DENTRO de la
  transición, así la foto nueva ya trae el repintado.
- Cambia de golpe, como hoy, sin View Transitions, con menos movimiento, con la pestaña oculta,
  con un revelado en curso o si la página pone `html.sin-revelado` (el anidador mientras el motor
  corre: A32 pide saltarlo con la mesa llena). Con un revelado en curso, además, el primero se
  salta antes de cambiar: cambiar el tema POR DEBAJO del círculo que sigue creciendo descubría,
  dentro del círculo, el mismo tema que había fuera.
- Atajo con el nombre de las piezas: `P.temaEnCirculo(pref, desde, despues)`.

```js
// F21 · Ajustes, en clic() rama data-tema-elegir:
window.AL3D_TEMA.revelar(ev, () => { window.AL3D_TEMA.poner(tema.dataset.temaElegir); pintar(); });
// A32 · anidador, mientras corre el motor:
document.documentElement.classList.toggle('sin-revelado', T.corriendo);
```

---

## 10 · Bordes que se desvanecen — `P.bordesDesvanecidos(el, o)`

`→ { medir(), revelar(hijo, suave?), destruir() }`

- `el`: la fila o lista con scroll. **Con un SELECTOR se pone en TODAS las que casen, hoy y
  después de cada repintado**, sin que nadie la vuelva a llamar: llámala UNA vez al montar la
  pantalla, aunque la fila todavía no exista y aunque haya veinte (`.mat-formula` viene en cada
  renglón de la lista, F30). Con un ELEMENTO, solo ese, para una fila que no se rehace. La fila
  que deja el documento se suelta sola.
- `o.eje`: `'x'`, `'y'` o `'auto'` (el que tenga más desborde). `o.margen`: largo del fundido en
  px (32; también pone `--borde`).
- Clases: `.bordes`, `.bordes-x`/`.bordes-y`, `.hay-antes`, `.hay-despues` → la máscara
  (`mask-image`) solo del lado con contenido escondido; cambia 3 veces en el recorrido, no en
  cada píxel. En papel no hay máscara.
- Teclado: al enfocar un hijo, la fila se corre para que no quede bajo el borde fundido.
  `revelar(hijo)` hace lo mismo desde el código (P23: llevar el chip encendido a la vista al
  pintar), sin desplazar la página.
- Dedo y ratón: es el scroll nativo; la pieza solo mira.
- Menos movimiento: nada que apagar (es una máscara quieta); `revelar(h, true)` salta en vez de
  deslizar.

```js
// P23 · la tira de etapas del teléfono y el tablero del Fold
const b = P.bordesDesvanecidos('#pj-filtros .tipo-seg', { eje: 'x' });   // una vez, al montar
b.revelar('#pj-filtros .on');          // después de pintar
P.bordesDesvanecidos('.pj-tablero', { eje: 'x' });
// F30 · la fórmula de material y la tira del asistente
P.bordesDesvanecidos('.mat-formula'); P.bordesDesvanecidos('.ia-tira');
// H26 · historial, lista del escalador y cuadernos (verticales)
P.bordesDesvanecidos('.hist-body', { eje: 'y' }); P.bordesDesvanecidos('.sp-mlist', { eje: 'y' });
```

---

## 11 · Desenfoque progresivo bajo el dock — `P.desenfoqueProgresivo(barras, o)`

**Ya está colgado** para `#mbar` y `.topbar` (cotizador, la de arriba solo ≤560 px) y para
`#pf-abajo` + `#pf-mbar` (plataforma). `→ { medir(), destruir() }`.

- `barras`: una barra o las barras apiladas (la franja sigue a la de más arriba).
- `o.lado`: `'abajo'` (la franja sube desde el borde de la pantalla hasta 28 px arriba del canto
  de la barra) o `'arriba'`. `o.alto`: 28. `o.media`: consulta que la enciende (p. ej.
  `'(max-width:560px)'`).
- Crea un `div.desenfoque-borde.abajo|arriba` hermano de la barra (no hijo: la barra lleva
  backdrop-filter y un desenfoque dentro de ella no ve la página), una capa por debajo de la
  barra, `pointer-events:none`, `aria-hidden`. `.activa` solo con algo debajo que fundir (abajo:
  no al final de la página; arriba: no en su tope). Se esconde con la barra. Sin transparencia
  (prefers-reduced-transparency) o en papel no existe.
- Una capa de 4 px enmascarada (no tres ni ocho): cuesta menos que el dock.

---

## 9 · Deslizar un renglón — `P.filaDeslizableHTML(o)` + `P.filasDeslizables(cont, o)`

HTML (para pintar con innerHTML): `P.filaDeslizableHTML({ cara, acciones, principal, clase, attrs, soloAqui }) → string`

```html
<div class="desliza [clase]" [attrs]>
  <div class="desliza-principal" aria-hidden="true"><button type="button" class="desliza-acc principal" [attrs] tabindex="-1">Ya se armó</button></div>
  <div class="desliza-acciones" aria-hidden="true"><button … class="desliza-acc">Abrir</button><button … class="desliza-acc peligro">Borrar</button></div>
  <div class="desliza-cara">…tu renglón, tal cual…</div>
</div>
```

- `cara`: tu HTML (ya escapado por ti). Va encima, con fondo `--sup` opaco.
- `acciones`: `[{texto|html, attrs, clase, peligro}]` — se descubren deslizando a la IZQUIERDA.
  `peligro` = teñida de rojo (como `.btn-dgr`).
- `principal`: `{texto|html, attrs, clase}` — deslizar a la DERECHA pasado el umbral la corre.
- `attrs`: tus `data-*` (en la fila o en cada botón): tu delegación de clics atiende los botones.
- `soloAqui`: por omisión `false` = las acciones son ATAJO de botones que ya están a la vista en
  el renglón o su menú → van `aria-hidden` y `tabindex="-1"` (si no, el Tab y el lector las
  encontrarían dos veces). `true` si NO hay otro camino: se tabulan y enfocar una abre el lado.

Controlador (una vez, en el contenedor que no se reemplaza):
`P.filasDeslizables(cont, { umbral: 0.4, pista: 'al3d_pista_xxx' }) → { cerrar(), pista(), destruir() }`

- Ratón y dedo: Pointer Events, `touch-action:pan-y` en la cara; el eje se decide a los 8 px: lo
  vertical es de la página. Izquierda, pasada la mitad de las acciones (o latigazo): queda
  abierta. Derecha, pasado el 40 % del renglón (mín. 72 px) o latigazo: `.lista` (verde) y al
  soltar **pulsa tu botón principal** (`.click()`): corre tu código, con su Deshacer.
- El clic que sigue a un arrastre se tira (deslizar un renglón no lo abre). Tocar fuera, Escape,
  pulsar una acción o cambiar el tamaño de la ventana cierran el renglón abierto. Uno abierto a
  la vez. El lado que está debajo de la cara no recibe toques mientras no esté abierto: durante
  los 260 ms en que la cara vuelve, un segundo toque en el mismo punto corría la acción otra vez.
- Teclado (con `soloAqui`): enfocar una acción abre su lado; salir del renglón o Escape lo
  cierra y devuelve el foco a la cara —a la cara misma (`tabindex="-1"`) si no trae nada
  enfocable, que es lo normal con `soloAqui`—.
- `pista()`: la primera vez en ese aparato (clave de localStorage `o.pista`), el primer renglón
  asoma 28 px y regresa. Llámala después de pintar. Nunca con menos movimiento.
- Menos movimiento: la cara sigue al dedo (es la mano), pero regresa sin recorrido.
- Nunca para el cruce de corte ni sin permiso (P29): esa decisión es de la pantalla — no pongas
  `principal` en ese renglón.

```js
// P29 · Tablero: a la derecha avanza la etapa; a la izquierda, Abrir y Mover la fecha.
html += P.filaDeslizableHTML({
  cara: renglon(v),                                   // el renglón de hoy, con sus botones visibles
  principal: puedeMover ? { texto: 'Ya se armó', attrs: 'data-avanza="' + esc(v.id) + '"' } : null,
  acciones: [{ texto: 'Abrir', attrs: 'data-abrir="' + esc(v.id) + '"' },
             { texto: 'Mover la fecha', attrs: 'data-fecha="' + esc(v.id) + '"' }],
});
P.filasDeslizables('#tb-lista', { pista: 'al3d_pista_tablero' }).pista();
// H26 · escalador: borrar una medida. La × (.sp-ibtn) sigue a la vista, así que es atajo.
//   En el cotizador los manejadores en línea están permitidos (su CSP los deja); en la
//   plataforma, nunca: allí van data-* y la delegación del módulo.
Piezas.filaDeslizableHTML({ cara: medidaHTML(m, i),
  acciones: [{ texto: 'Borrar', peligro: true, attrs: 'onclick="scQuitarMedida(' + i + ')"' }] });
Piezas.filasDeslizables('#sc-mlist');
```

Pura: `P.filaDecide({dx, v, anchoAcc, anchoFila, principal, umbral}) → 'principal'|'abierta'|'cerrada'`.

---

## Entra lo nuevo, sale lo quitado — `P.listaViva(cont, o)`

`→ { repintar(fn) → {nuevos: Element[], quitados: string[]}, quitar(el) → Promise,
     mostrar(el, bloque?), olvidar(clave), destruir() }`

- `cont`: el contenedor cuyos HIJOS son los renglones, cada uno con clave (`data-clave` o `id`;
  o `o.clave(el)`). No se reemplaza el contenedor, sí sus hijos. La clave tiene que ser la
  **identidad** del renglón (el folio, el id de la medida), nunca su lugar en la lista: con el
  índice, borrar la medida 2 de cinco hace «irse» a la 5, y la que se agrega después hereda un
  número ya visto y no se marca nueva.
- `repintar(fn)`: mide, corre `fn` (tu innerHTML), y: lo que no se había visto entra
  (`.lista-entra`) y queda marcado `.lista-nueva` durante `o.marca` ms (4000); lo que siguió se
  corre a su sitio (FLIP); lo quitado se desvanece en su lugar (fantasma inerte, `.lista-se-va`).
  **La marca no se reinicia** al repintar (hereda su edad con `--lista-edad`): llámalo en cada
  tecla si quieres. Devuelve los nuevos (p. ej. para `mostrar()` del primero).
- El primer pintado con la lista vacía no marca nada (lo que ya había no es «nuevo»), salvo
  `o.animarPrimera:true`.
- `quitar(el)`: la salida ANTES de repintar (C22 «Quitar»): `lista.quitar(fila).then(() => lista.repintar(pintar))`.
  El renglón queda mudo, inerte y fuera del alcance del dedo desde el primer momento; si el
  repintado lo deja vivo (el borrado falló), vuelve entero.
- `mostrar(el, bloque='nearest'|'start')`: llevar a la vista lo que llegó moviendo **solo la caja
  con scroll** que lo contiene, nunca la página. Úsalo en vez de `scrollIntoView`: el escalador
  (H24) mide sobre la foto y un `scrollIntoView` movía la página debajo del dedo; el asistente
  (F15) ancla la respuesta nueva a su principio con `'start'`.
- `o.anunciar(elUltimo, nuevos) → string`: lo que se dice al lector de pantalla cuando llega algo.
- La marca es un `::after` con filete del acento: el renglón no debe usar su propio `::after` ni
  ir `position:absolute` (la marca le pone `position:relative`).
- Menos movimiento: sin entrada, sin viaje, sin fantasma; la marca se queda quieta el mismo
  tiempo y se quita al vencer.

```js
// C22 · la cola de solicitudes (renderAuth corre en cada tecla del anticipo: no pasa nada)
const cola = Piezas.listaViva('#auth-cola', { clave: el => el.dataset.folio, anunciar: el => 'Llegó la solicitud ' + el.dataset.folio });
cola.repintar(() => { $('auth-cola').innerHTML = remotasHTML(); });
// H24 · escalador: la medida nueva llega a la lista y la lista va hasta ella, sin mover la foto
const L = Piezas.listaViva('.sp-mlist'), r = L.repintar(() => scUpdateList());
if (r.nuevos[0]) { r.nuevos[0].classList.add('sc-flash'); L.mostrar(r.nuevos[0]); }
// F15 · asistente: la burbuja nueva entra y el hilo se ancla a su principio
const hilo = P.listaViva('.ia-hilo'), { nuevos } = hilo.repintar(() => pintar());
if (nuevos[0]) hilo.mostrar(nuevos[0], 'start');
```

---

## El pliegue abre con su altura — `.pliegue`, `.plegable`, `P.plegar`, `P.plegables`, `P.abrirSinAnimar`

- `<details class="pliegue">`: **solo CSS.** Abre y cierra con su altura en 200 ms donde hay
  `::details-content` + `interpolate-size` (Chrome ≥131); donde no, en seco como hoy. Una flecha
  con `.pliegue-flecha` dentro del `<summary>` gira a la vez. Enter/Espacio son del navegador.
- `P.abrirSinAnimar(details|plegable, abierto=true)`: reabrir desde el código sin animar (C16:
  `renderAuth()` reabre «otras salidas» a mano).
- Lo que se pliega con clases (C16 `toggleItemAuth()`, hoy `display:none`):

```html
<button type="button" data-plegar aria-controls="auth-3" aria-expanded="false">Ajuste por partida <span class="pliegue-flecha" aria-hidden="true">▾</span></button>
<div class="plegable" id="auth-3"><div>…lo de dentro…</div></div>
```

  `P.plegables(raiz)` (una vez; delegado) atiende los `[data-plegar][aria-controls]` de `raiz`;
  `P.plegar(el, abierto?) → bool` lo hace desde el código y pone al día `aria-expanded` de todo
  botón con `aria-controls=id`. `.plegable.abierto` = abierto; cerrado, lo de dentro queda fuera
  del tabulador (visibility al terminar de cerrar, e `inert`). Un solo hijo directo.
- Menos movimiento: abre en seco (el apagado nombra `::details-content`: el comodín no lo alcanza).
- En papel los `.plegable` salen abiertos.

```js
// H16 · historial: la tabla y la nota van en <details class="pliegue">; «Abrir y editar» y «Duplicar» fuera.
// A19 · legales (sin guiones): <details class="pliegue"><summary>En esta página <span class="pliegue-flecha">▾</span></summary>…</details>
```

---

## Páginas con scroll-snap — `P.paginas(tira, o)`

`→ { ir(i), actual(), medir(), destruir() }`

- `tira`: el contenedor; sus hijos son las páginas. Pone `.paginas` (rejilla en columna,
  `scroll-snap-type:x mandatory`, sin barra), `tabindex=0`, `role=region`,
  `aria-roledescription="carrusel"`, y a cada página `role=group` y `aria-label="Hoja 2 de 5"`
  (si la pantalla ya le puso su `aria-label`, se respeta).
- `o.nombre` ('hoja' · 'columna' · 'parada'), `o.etiqueta` (aria-label de la tira),
  `o.alCambiar(i, pagina)` (sincroniza tu tira de filtros, tu mapa…), `o.puntos` (false = sin
  barra; un elemento = pintarla ahí), `o.flechas` (false = sin ‹ ›), `o.anunciar` (false = mudo).
- Barra `.paginas-barra`: ‹ › (44 px) y un punto de 44 px por página (`aria-current`).
  **Ningún botón se encoge**, así que la barra mide lo que hay y decide, y se vuelve a decidir al
  cambiar el ancho: puntos con flechas; si no caben, puntos SIN flechas (los puntos son de todos,
  las flechas son del ratón, y el teclado ya tiene ← → Inicio Fin); y si tampoco, «2 / 7». Con
  más de 5 páginas, «2 / 7» siempre. En un teléfono de 360 px caben cinco puntos sin flechas.
  `--pag-ancho` (100 %) deja asomar la siguiente (F12: `84%`), `--pag-hueco` el hueco.
- Repintar las páginas con innerHTML NO es cambiar de página: la barra no se rehace si el número
  no cambió (el foco que estaba en un punto se queda ahí) y `alCambiar` solo se llama cuando
  cambia la página o el número. Una pantalla puede repintar desde su `alCambiar` sin hacer ciclo.
- Dedo: el scroll-snap del navegador. Ratón: ‹ › y puntos. Teclado (tira o barra enfocada): ← →,
  RePág/AvPág, Inicio, Fin. Anuncia «Hoja 2 de 5» cuando se ASIENTA (180 ms quieta).
- Menos movimiento: `ir()` salta.
- Cuida el gesto de atrás de Android: no pongas la tira pegada al borde sin su relleno lateral.

```js
// P28 · Proyectos en el teléfono: las columnas como páginas, sincronizadas con la tira de etapas
P.paginas('.pj-lista-movil', { nombre: 'columna', etiqueta: 'Columnas de Proyectos',
  alCambiar: i => marcarEtapa(ETAPAS[i]) });
// F12 · las paradas del día sobre el mapa (asoma la siguiente)
el.style.setProperty('--pag-ancho', '84%');
P.paginas('#mapa-paradas', { nombre: 'parada', alCambiar: i => volarA(paradas[i]) });
// A12 · anidador, con más de una hoja
Piezas.paginas('#an-res', { nombre: 'hoja', etiqueta: 'Hojas del acomodo' });
```

---

## La silueta en vez de «Leyendo…» — `P.silueta(forma, o)` / `P.conSilueta(cont, forma, o)`

`P.silueta(forma, o) → string` (HTML). `P.conSilueta(cont, forma, o) → { quitar(html?) }` la
pone en `cont` (con `aria-busy`) y la quita al llegar.

- `forma`: `'lista'` (o.filas, 3) · `'cifras'` (o.cifras, 4: la forma de `.ia-cifras`) ·
  `'tarjeta'` · `'bloque'` (o.alto px) · `'miniatura'` (o.proporcion, `'4 / 3'`: la vista
  reservada de H7) · o una lista de barras `['t','d','n','campo','largo','boton','bloque']`.
- `o.dentro`: HTML que va DENTRO de la caja del bloque o de la miniatura, debajo del brillo —la
  foto que la IA está leyendo (H7) no es un hueco gris—. Va tal cual: escápalo tú.
  `o.proporcion` y `o.alto` acaban en un `style`, así que solo pasan números; lo demás cae en el
  de siempre.
- `o.texto`: el estado («Leyendo el taller…»), en `role="status"`, con el giro `.esq-giro`
  (`o.giro:false` sin él). `o.clase`: una clase más para acomodarla.
- Marcado: `.silueta[aria-busy] > .silueta-dibujo[aria-hidden] (barras .esq-b …) + p.silueta-t`.
  Usa las mismas barras que `esqueletoModulo()` / `esqueletoMarco()` (que siguen en
  `js/nucleo/ui.js` para el router y los marcos, sin cambios).
- El brillo pasa **una vez** al aparecer (no en bucle); lo que dice «sigo» es el giro y el texto.
  Menos movimiento: sin brillo (el giro late en opacidad, como ya lo apaga la hoja).

```js
// F16 · Fabricación / Material / Mapa: en vez del .vacio con reloj
const s = P.conSilueta(cont, 'lista', { texto: 'Leyendo el taller…' }); … s.quitar(html);
// F16 · asistente: las cuatro cifras
resumen.innerHTML = P.silueta('cifras', { cifras: 4, texto: 'Leyendo el taller…' });
// H7 · la miniatura que la IA está leyendo, con la foto dentro
Piezas.silueta('miniatura', { proporcion: '4 / 3', dentro: '<img src="' + P.esc(url) + '" alt="">', texto: 'Analizando…' })
```

---

## Funciones puras (node: `pruebas/piezas-hojas.mjs`)

`P.hojaResistencia`, `P.hojaVelocidad`, `P.hojaSeCierra`, `P.bordesDe(pos, total, vista, tol)`,
`P.filaDecide`, `P.cambiosDeLista(antes, ahora)`, `P.paginaMasCercana(pos, centros)`.

Vitrina de todas: `pruebas/navegador/piezas-hojas.html` (y su prueba, `piezas-hojas.mjs`).
