# Fichas de la zona `cot-partidas`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### C1. Que solo se mueva lo que se tocó
- **Dónde:** `js/cotizador/partidas.js` 520–675 (`renderItems()`, con `c.innerHTML=''` en la 524), llamada desde `setItem()` 221–233, `setTipo()` 355–366, `togglePartida()` 39–71, `addItem()` 108–133, `delItem()` 173–201, `dupItem()` 367–378 y el `drop` 637–652; `css/sistema.css` 3892 (`.partida{animation:entra…}`) y 4656 (`.chip.on{animation:chip-cede…}`). Verificado.
- **Hoy:** cada toque de un chip reconstruye la lista entera. Por eso TODAS las partidas vuelven a entrar con fundido desde 10 px y todos los chips elegidos rebotan otra vez. Al plegar, agregar o borrar, lo de abajo salta de golpe.
- **Propuesta:** animar solo lo que cambió. La partida nueva entra sola, la borrada se cierra, la duplicada sale de debajo de su original y las vecinas se deslizan a su sitio al plegar, abrir o reordenar. Al cambiar de tipo, el cuerpo hace un fundido corto. El resto de la lista se queda quieto.
- **Sale de:** React Bits · AnimatedList (entrada y salida por renglón) + CardSwap (transición de layout). Alternativa: Animmaster · Page Transitions (de pago).
- **Cómo en vanilla:** `document.startViewTransition(()=>renderItems())` solo en las acciones estructurales, con `view-transition-name:p-<id>` en cada `.partida`. La animación de entrada va solo a los id que no estaban en el pintado anterior (un `Set`), y se quita la de `.partida` y `.chip.on` en los repintados.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** la regla dice «se mueve por una acción del usuario», y hoy se mueve justo lo que NO se tocó. Con movimiento reducido se salta el `startViewTransition`. Nunca envolver `typeItem()` (se llama al teclear). `.pcab` es sticky y con `backdrop-filter`: probar en un Android de gama media.

### C7. Señalar dónde está lo que falta, y dejar de latir en bucle
- **Dónde:** `js/cotizador/partidas.js` 867–874 (`irACampoProy()`), 811–826 (`irAlCandado()`) y 840–845 (`_candTocarPartida()`). `js/cotizador/proceso.js` 591–622 (`llevarAPartida()`, `enfocarHueco()`) y 917–921 (`_llevarAlPaso()`). `js/cotizador/nucleo.js` 209–214 (`_anclarPaso()`). Bucles: `css/sistema.css` 3143 (`.cand-partidas{animation:late … infinite}`) y 3362 (`.cand-cliente.ojo`, clase que `cotizador.html` 288 deja fija en `#cot-antes`). Verificado.
- **Hoy:** llevar al hueco es un scroll más un foco; si el campo cae bajo la barra o bajo el dedo, no se ve adónde llegó. Mientras tanto, la ficha del candado y el aviso «esto ya estaba en pantalla» laten sin parar.
- **Propuesta:** al llegar, cuatro esquinas se cierran sobre el campo, el grupo de chips en ámbar o el bloque del paso, y se van a los 0.6 s. Las fichas del candado laten una vez al aparecer y otra cuando se toca algo bloqueado.
- **Sale de:** React Bits · TargetCursor (cuatro esquinas que se fijan en el objetivo).
- **Cómo en vanilla:** un solo `<div>` fijo con las cuatro esquinas en pseudoelementos. Se mide el destino con `getBoundingClientRect()` después de `scrollend` (o de dos rAF) y se transicionan `transform`, `width` y `height`; `animationend` lo esconde. En las fichas, `infinite` se cambia por una clase de un solo disparo.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** hoy hay cuatro cosas que se mueven solas además del botón de IA: estas dos fichas, el brillo de la barra de completitud y el icono de `.ai-drop` (`vidrio.css` 443). Con movimiento reducido: un aro fijo durante 1 s.

### C11. Copiar y ocultar del PDF confirman en el mismo botón
- **Dónde:** `cotizador.html` 450 (`#s-sub-copiar`) y 327 («Copiar link»). `js/cotizador/proceso.js` 1917–1921 (`copiarSubtotal()`) y 2034–2037 (`copiarLinkDirRaw()`). `js/cotizador/partidas.js` 603 (`.pdf-vis` siempre pinta `i-ojo`) y 382–398 (`setShowInPdf()`). `css/sistema.css` 2138 (`.pdf-vis.off{opacity:.4}`). Verificado.
- **Hoy:** «Copiar» no cambia, y la confirmación sale abajo a la izquierda, lejos del número. El ojo de «ocultar del PDF» es el mismo icono prendido o apagado y solo baja al 40 % de opacidad, aunque `#i-ojo-off` ya está en el sprite.
- **Propuesta:** «Copiar» pasa a «✓ Copiado» durante 1.5 s y vuelve. El ojo se tacha (cambia a `i-ojo-off`) al ocultar.
- **Sale de:** Skiper · skiper99 Animated icons 002 (GRATIS). El rótulo, de React Bits · BellToggle.
- **Cómo en vanilla:** dos `<use>` superpuestos con transición de `opacity` o `clip-path`, o la raya del tachado con `stroke-dashoffset`. `aria-pressed` en el ojo.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** la misma hoja dice que el estado no se comunica con opacidad (deja el texto en 2:1): el ojo apagado tiene que medir 4.5:1. El aviso se queda para el lector de pantalla (`voz()`).

### C13. Comparar materiales delante del cliente sin cambiar la partida
- **Dónde:** `js/cotizador/partidas.js` 1045 (`matChips` en `bodyFor()`), 880–888 (`chip()`), 264–266 (repintado ligero de `#lt-<id>`) y 231 (`setItem` guarda el material como preferencia). `js/cotizador/nucleo.js` 806–811 (`lineTotalCrudo()`). `css/sistema.css` 3104–3107 (`.chips-catalogo`). Verificado.
- **Hoy:** cada chip dice su tarifa por cm. Saber cuánto saldría en brush obliga a elegirlo y regresar, y eso de paso quita la marca de heredado y cambia la preferencia guardada.
- **Propuesta:** mantener un chip presionado (o pasar el cursor) enseña, en el total de la partida, el importe que quedaría con ese material, en tinta fantasma. Soltar sin tocar lo devuelve; tocar lo elige, como hoy.
- **Sale de:** React Bits · PeekRating (probar antes de decidir). Alternativa: Vengeance · Highlight Grid.
- **Cómo en vanilla:** Pointer Events. Con ratón, `pointerenter`; con el dedo, 350 ms de `pointerdown`. Se calcula `lineTotal({...it,material:k})` sin escribir en `Q` y se pinta con `.lt.fantasma`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** en borrador, el fantasma se difumina igual que `.lt`. No aplica con la cotización cerrada. La iluminación (aluminio posterior, acrílico frontal) se lee del catálogo, no se deduce.

### C14. Ver el letrero mientras se escribe el texto
- **Dónde:** `js/cotizador/partidas.js` 1082 (`.autoctr` en `bodyFor()`), 429–475 (`autoContarLetras()`) y 1061–1064 (fichas de luz cálida/fría). `js/cotizador/catalogo.js` 17–23 (`MATERIALES`, con su campo `ilum`). Verificado.
- **Hoy:** «Escribe el texto →» solo cuenta letras. Lo más parecido a una imagen es copiar un prompt para Gemini.
- **Propuesta:** debajo del campo, el texto tecleado dibujado como letras con volumen. En aluminio, la cara es opaca y el halo cae en la pared (LED posterior); en acrílico, la cara brilla (LED frontal). El tono sigue la ficha cálida o fría, y lleva la etiqueta «ilustrativo».
- **Sale de:** React Bits · DepthText (letras extruidas por capas). El brillo, de ShinyText, sin bucle.
- **Cómo en vanilla:** CSS puro: `text-shadow` apilado (6 a 8 capas) para el canto, y `filter:drop-shadow()` con el color de la luz para el halo. Clases según `it.material` e `it.ilumTipo`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** no invertir la iluminación (aluminio = posterior, acrílico = frontal). Solo se mueve porque el usuario escribe. No es la tipografía del cliente y tiene que decirlo.

### C15. Reordenar partidas con el dedo
- **Dónde:** `js/cotizador/partidas.js` 593 (`.drag-handle`) y 616–657 (arrastre HTML5); `css/sistema.css` 2378–2383 (`.drag-handle{display:none}` hasta 920 px). Verificado.
- **Hoy:** en el teléfono y en el Fold no hay forma de cambiar el orden: el arrastre HTML5 no funciona al tocar y el asa se esconde. En escritorio sí se reordena, pero las vecinas saltan.
- **Propuesta:** mantener presionado el número de la partida la levanta; al arrastrar, las demás se apartan para hacerle hueco. Para teclado y lector de pantalla, «subir» y «bajar» en el mismo sitio.
- **Sale de:** React Bits · CardSwap (intercambio con transición). El gesto sigue el patrón de Pointer Events de SwipeRow.
- **Cómo en vanilla:** Pointer Events con `setPointerCapture`, 300 ms para armar el arrastre y `touch-action:none` solo en el asa. FLIP para las vecinas. Al soltar se usa el mismo `splice` que ya corrige el índice (línea 650).
- **Valor · Esfuerzo:** Medio · Alto
- **Cuidado:** el orden es el de los renglones del PDF y no mueve la huella (`huellaTrabajo()` ya ordena). No debe chocar con #9 (SwipeRow): aquel es horizontal y esto es vertical, desde el número. Zona de 44 px.

### C19. La barra de completitud avanza, pero no brilla para siempre
- **Dónde:** `cotizador.html` 418–422 (`.prog-box`). `js/cotizador/partidas.js` 700–725 (`updProg()`) y 793–803 (`pintarPendiente()`). `css/sistema.css` 3388–3402 (`#prog-bar::after{animation:brillo 2.4s linear infinite}`). Verificado.
- **Hoy:** mientras no llega al 100 %, un destello recorre la barra en bucle. El renglón «Falta el teléfono ›» cambia de texto de golpe.
- **Propuesta:** el destello pasa una sola vez, cuando el porcentaje SUBE. El renglón de lo que sigue hace un fundido vertical cuando cambia.
- **Sale de:** Vengeance · Flip Fade Text para el renglón. React Bits · ShinyText, con un solo barrido.
- **Cómo en vanilla:** `updProg()` guarda el porcentaje anterior y pone una clase de un solo disparo. Dos `<span>` con `translateY` y `opacity`, solo si el texto cambió.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** la regla dice que solo se mueve sola una pieza, y hoy esta barra es la segunda. `updProg()` corre en cada tecla.

### C27. El estado vacío de partidas empieza el trabajo
- **Dónde:** `js/cotizador/partidas.js` 539–543 (`.empty`); `css/sistema.css` 1051. Verificado.
- **Hoy:** un recuadro punteado con una frase que enumera los cinco tipos.
- **Propuesta:** los cinco tipos como mosaicos tocables, con su «desde $30/cm» del catálogo, que crean la partida ya del tipo elegido. Más una línea hacia «Cotizar con IA».
- **Sale de:** Vengeance · Highlight Grid.
- **Cómo en vanilla:** una rejilla de `button` que llama a `addItem()` y `setTipo()`, con un solo resaltado movido con `transform`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** hoy casi nunca se ve, porque el arranque siembra una partida en blanco. El botón de IA sigue siendo lo único que se mueve solo.

### C23. Otros lugares para lo ya propuesto (#1, #2, #4, #5, #6, #7)
- **Dónde:**
  - #1 odómetro: `js/cotizador/proceso.js` 1993–1996 (`.mbar-amt`) y 1133–1156 (`#paso-total-v`); `venta.js` 121–124 (`rvRecalc()`); `partidas.js` 715–716 (`#prog-pct`).
  - #2 ficha que se desliza: `cotizador.html` 354 y 1015 (`#f-plazo`, `#rv-plazo`).
  - #4 desglose en popover: `proceso.js` 1993 (el total del dock).
  - #5 mantener para confirmar: `proceso.js` 1754–1764 («Sí, borrar todo») y 1733–1753 (`rechazar()`); `nucleo.js` 657 (`confirmar()` con `peligro`).
  - #6 palomita dibujada: `proceso.js` 374–380 (hitos de entrega); `css/sistema.css` 703 (paso hecho); `cotizador.html` 1081 (`#rv-copied`).
  - #7 neón al autorizar: `notario.js` 490–508 (`autorizarRemota()`).
  - Verificado.
- **Hoy:** estos lugares repiten el mismo patrón que ya tiene pieza propuesta en otro sitio.
- **Propuesta:** usar la misma pieza, con el mismo código, en estos lugares.
- **Sale de:** lo ya propuesto (React Bits · Counter, RubberSegment, HoldButton, SpringCheck; Vengeance · Border Beam).
- **Cómo en vanilla:** las mismas funciones del sitio original, llamadas desde estos puntos.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** el dock se repinta en cada tecla, así que el odómetro solo debe rodar si el importe cambió. «Mantener para confirmar» va solo en lo destructivo.