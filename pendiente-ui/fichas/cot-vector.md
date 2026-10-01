# Fichas de la zona `cot-vector`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### H9. Deslizadores del vectorizador con marcas y re-trazado al soltar
- **Dónde:** `cotizador.html` 715–724 (`#vt-colores`, `#vt-detalle`, `#vt-ruido`, `#vt-esq`); `js/cotizador/vectorizador.js` 261–269 (`vtOpt()`) y 274–279 (`vtSucio()`); `css/sistema.css` 1985. Verificado.
- **Hoy:** mover un ajuste solo marca «Ajustes cambiados», y hay que tocar «Volver a vectorizar» para ver el efecto. Detalle y Esquinas son rangos de tres pasos sin marcas, con pulgar nativo chico.
- **Propuesta:** marcas visibles (Bajo · Medio · Alto) y la pastilla del valor pegada al pulgar. Al soltar, si ya había trazo, se vuelve a vectorizar solo, con una barra fina arriba del lienzo en vez del velo oscuro completo.
- **Sale de:** React Bits · ElasticSlider (pasos que se acomodan al soltar); alternativa WakeSlider.
- **Cómo en vanilla:** `<datalist>` y estilos de `::-webkit-slider-thumb` / `::-moz-range-thumb`, con `--p` en CSS para colocar la pastilla. El evento `change` (no `input`) llama a `vtVectorizar()`, que ya se protege con `VT.corriendo`.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** `change` y no `input`, por la gama media. Zona táctil de 44 px en el pulgar. El botón manual se queda.

### H10. El trazo se dibuja solo al terminar de vectorizar
- **Dónde:** `js/cotizador/vectorizador.js` 911–920 (final de `vtVectorizar()`, con `vtSetVista('cmp')`) y 958–999 (`vtArmarSVG()`, `vtPintarVector()`). Verificado.
- **Hoy:** se quita el velo de progreso y el vector aparece de golpe en la vista comparar.
- **Propuesta:** un momento de ~0,8 s en que el contorno de corte recorre cada forma y luego se rellena; entonces se abre la comparación. Es enseñarle al cliente «esto es lo que corta la máquina», junto al perímetro de corte.
- **Sale de:** React Bits · StrokeText.
- **Cómo en vanilla:** un `<svg>` encima de `#vt-stage` con los `path` de `VT.svg` en `fill:none`. Se anima `stroke-dasharray/offset` desde `getTotalLength()` hasta 0, luego `fill-opacity` de 0 a 1, y se retira.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** momento breve disparado por el usuario. Se salta con reduced-motion y cuando hay muchos nodos (p. ej. >3000), porque `getTotalLength` cuesta en gama media.

### H22. Muestras de color del vector como fichas de 44 px que dicen su estado
- **Dónde:** `js/cotizador/vectorizador.js` 1012–1034 (`vtPintarResultado()`, `vtToggleColor()`); `css/sistema.css` 2004–2008, 2032 y 2597 (`.vt-sw`: 24/30/32 px, apagado con `opacity:.25`). Verificado.
- **Hoy:** cuadritos de color sin texto. Quitado es transparente con una raya, y cuál es el fondo solo se sabe por el `title`.
- **Propuesta:** fichas con la muestra, el nombre («Color 2» o «Fondo») y un ✓ que se vuelve ✕ al quitarse, con el nombre tachado. Tamaño táctil de 44 px.
- **Sale de:** React Bits · SpringCheck (casilla que llena, palomea y tacha en un solo gesto).
- **Cómo en vanilla:** `<button aria-pressed>` con la muestra en un `<span>` y el estado por clase; iconos `i-ojo` / `i-ojo-off` del sprite.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** regla 4.3: el estado no se dice con opacidad, sino con icono y palabra. 44 px.

### H12. Abrir un PDF dentro del lienzo, con cronómetro y error en su sitio
- **Dónde:** `js/cotizador/escalador.js` 101–114 (`usarImagenAIEnScaler()`) y 256–293 (`scLoadPDF()`, con `toast('Cargando PDF…','',8000)`); `js/cotizador/vectorizador.js` 119–149 (`vtLoadPDF()`); `cotizador.html` 833–838 y 682–687 (`.sp-overlay`). Verificado.
- **Hoy:** el primer PDF baja pdf.js de cdnjs y renderiza la hoja con solo un aviso abajo, mientras el lienzo sigue diciendo «Carga una imagen». El error llega en otro aviso.
- **Propuesta:** el mismo recuadro del lienzo pasa a «Abriendo el PDF · 2,3 s», con una rejilla que late por fases y termina en ✓ o ✕. Si falla (sin conexión, archivo dañado), el motivo y «Elegir otro archivo» quedan ahí mismo.
- **Sale de:** React Bits · LatticeLoader.
- **Cómo en vanilla:** 3×3 celdas con `animation-delay` por `--i`, un `setInterval` de 100 ms para el reloj y estados `.hecho` / `.falla` en `.sp-overlay`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** solo se mueve mientras carga; con reduced-motion la rejilla queda quieta. Limpiar el intervalo en `finally`.

### H18. Copiar para Canva, Gemini o SVG confirma en el mismo botón
- **Dónde:** `js/cotizador/entrega.js` 410 (`copiarParaCanva()`) y 466 (`copiarParaGemini()`); `js/cotizador/vectorizador.js` 1176–1178 (`vtCopiarSVG()`); `js/cotizador/nucleo.js` 699–706 (`copiarTexto()`); `js/cotizador/proceso.js` 302–307. Verificado.
- **Hoy:** el botón no cambia. La confirmación es un aviso al pie de la pantalla, lejos de donde se tocó y fuera del pliegue «Otras salidas».
- **Propuesta:** el rótulo del botón pasa a «✓ Copiado» con un fundido corto y vuelve a los 2 s. El aviso de abajo se queda solo para el lector de pantalla.
- **Sale de:** React Bits · BellToggle (el rótulo que se funde y el estado apretado como recibo); alternativa Vengeance · Flip Text.
- **Cómo en vanilla:** `copiarTexto()` recibe el botón, le pone la clase `.copiado` (cruza dos `<span>` por `opacity`) y un `setTimeout` lo regresa.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** es distinto de la #6 (palomita que se dibuja). `voz()` sigue anunciando. Con reduced-motion cambia sin fundido.

### H26. Llevar a esta zona las ideas ya propuestas
- **Dónde:** `cotizador.html` 703–707 (`.vt-modo`), 659–663 (`#vt-view-*`), 905–909 (`#sc-cotas-*`), 757–758 (`#vt-alto-cm`, `#vt-ancho-cm`) y 863 (`#sc-ref-cm-input`); `js/cotizador/historial.js` 287 (`.hentry-del`) y 716–720 (`.cua-cifra`); `js/cotizador/escalador.js` 1533–1539 (`.sp-mitem-add`, `.sp-ibtn`); `js/cotizador/vectorizador.js` 1017–1020 (`#vt-st-*`). Verificado.
- **Hoy:** son controles del mismo tipo que los ya propuestos, pero sin esos patrones.
- **Propuesta:**
  - #2, ficha que se desliza: modos del vectorizador, vista Original/Comparar/Vector y cotas.
  - #3, ScrubField: alto y ancho reales y los cm de la referencia.
  - #5, mantener presionado: borrar en el historial.
  - #6, palomita que se dibuja: «Agregada».
  - #9, deslizar para borrar: una medida del escalador.
  - #1, odómetro: cifras del vectorizador y de los cuadernos.
  - #10, bordes que se desvanecen: `.hist-body`, `.sp-mlist` y `#cua-body`.
- **Sale de:** los mismos componentes ya elegidos.
- **Cómo en vanilla:** la misma implementación de cada una, sin variantes nuevas.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** una sola implementación por patrón; no crear segundas versiones.