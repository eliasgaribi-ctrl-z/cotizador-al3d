# Fichas de la zona `an-mesa`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### A7. Zoom y paneo sobre la hoja
- **Dónde:** `anidador-vectores/css/anidador.css` 221–235 (`.an-lienzo`, `.an-hoja>svg` con `max-height:70vh`, `.an-hoja.alta>svg`); `js/app.js` 695–719 (`pintarResultado()`). Verificado.
- **Hoy:** cada hoja se pinta completa y no hay zoom. En un teléfono la hoja de 2.40 m cabe en unos 560 px de alto (1 px ≈ 4 mm), así que la separación de 3 mm y las piezas chicas (puntos, acentos) no se pueden revisar.
- **Propuesta:** pellizcar o usar la rueda para acercar, arrastrar para moverse y doble toque para ir a 1:1 en ese punto. Un botón «Ver hoja completa» regresa, y una barra de escala marca 100 mm.
- **Sale de:** Vengeance · Model Viewer, solo su manejo de arrastre, zoom y teclado, sin Three.js (alternativa: Skiper · skiper73 Infinite canvas; es PRO, así que solo la idea).
- **Cómo en vanilla:** Pointer Events con dos punteros para cambiar el `viewBox` del SVG; sigue siendo vector y no se pixela. `touch-action:none` solo mientras hay zoom. Con teclado: `+`, `−` y flechas.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** sin zoom, un dedo desplaza la página; no hay que secuestrar el scroll en el teléfono. `pintarResultado()` reconstruye la mesa en cada mejora, así que hay que guardar el encuadre y volver a ponerlo.

### A8. Las piezas se deslizan a su nuevo lugar en vez de volver a caer
- **Dónde:** `anidador-vectores/js/app.js` 695–719 (`pintarResultado()`: `cont.innerHTML=''` en la 696 y `--i` por pieza en 706–712); `css/anidador.css` 255–258 (`@keyframes an-cae`, 45 ms por pieza). Verificado.
- **Hoy:** en cada mejora se borra la mesa y TODAS las piezas vuelven a caer. Con 60 piezas son 2.7 s de caída y no se distingue lo que se movió de lo que no. Es lo contrario de lo que pide la cabecera del propio CSS: «si la pantalla se reescribe sin avisar, la noticia no se nota».
- **Propuesta:** la primera vez caen como hoy. Después, cada pieza viaja y gira desde donde estaba hasta su nuevo lugar; las que no cambiaron se quedan quietas y las que se movieron llevan un contorno breve.
- **Sale de:** React Bits · CardSwap, la transición de posiciones (alternativa: el reacomodo animado de Masonry).
- **Cómo en vanilla:** FLIP con Web Animations, como `_medirTotal()` y `_volarTotal()` de `js/cotizador/proceso.js` 958–965. Cada pieza lleva un `id` propio desde `svgParaMotor()` y se compara el `translate()`/`rotate()` viejo con el nuevo de su `<g>`.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** tiene que ser `id` y no `data-*`: al reemplazar un `rect` o una `ellipse`, `svgparser.js` 443–448 solo conserva `id` y `class`. Esos `id` se quitan en `armarSalida()`. Con más de unas 150 piezas o con movimiento reducido, cambio directo.

### A10. Tocar una pieza: su medida y si va girada
- **Dónde:** `anidador-vectores/js/app.js` 706–712 (cada `<g>` recibe `an-p*` y `--i`); `css/anidador.css` 255–265. Verificado.
- **Hoy:** las piezas son manchas de color sin identidad. No se sabe cuál es la «D» del pedido, cuánto mide ni si el motor la giró.
- **Propuesta:** al tocar una pieza se marca su contorno y sale una ficha «Pieza 7 · 238 × 180 mm · girada 90°». Tocar fuera la cierra.
- **Sale de:** Skiper · skiper101 Custom tooltip, GRATIS (alternativa: React Bits · WarmTooltip).
- **Cómo en vanilla:** delegación de `pointerup` en `#an-res` con `closest('g')`. `getBBox()` da la medida ya en mm y el giro sale del `rotate()` del `transform` de la `<g>`. La ficha se coloca con `getBoundingClientRect()`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** si entra el zoom (A7), hay que distinguir toque de arrastre. La mesa se repinta en cada mejora: la ficha se cierra o se vuelve a anclar por `id`.

### A11. La noticia grande: una hoja menos, en m²
- **Dónde:** `anidador-vectores/index.html` 278–279 (las fichas Hojas y Merma); `js/app.js` 685–687 (`pintarStats()`) y 732–736 (el latido `.mejora`). Verificado.
- **Hoy:** cuando el acomodo baja de 3 a 2 hojas, la ficha cambia sin avisar y el marcador late igual que por un 1 % más. La merma solo se dice en %.
- **Propuesta:** si baja el número de hojas, la última se pliega y se va, y una ficha breve dice «Una hoja menos · 2.88 m² de acrílico». Debajo del % de la ficha Merma van los m² que se tiran.
- **Sale de:** React Bits · Stack, la tarjeta que sale del montón (alternativa: Vengeance · Elastic Stack).
- **Cómo en vanilla:** antes de repintar se conserva el `<figure>` que sobra y se anima con WAAPI (`height` a 0, `opacity` a 0). Los m² salen de ancho × alto de la hoja × hojas × merma, y `contar()` (174–186) ya anima el número.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** es un momento breve que se apaga y se anuncia por `#vozStatus`. Si también entra el deslizamiento de piezas (A8), que no compitan: primero la hoja, luego las piezas.

### A12. Varias hojas en carrusel, cada una con su aprovechamiento
- **Dónde:** `anidador-vectores/css/anidador.css` 221, 230 y 235 (`.an-lienzo` en columna, `.an-hoja.alta>svg` a `min(70vh,820px)`); `js/app.js` 698–719 (el figcaption en 714–717). Verificado.
- **Hoy:** las hojas se apilan hacia abajo, cada una de hasta 70vh. Con 3 hojas son más de dos pantallas de teléfono, y solo hay un % global.
- **Propuesta:** con más de una hoja, un carrusel horizontal «Hoja 2 de 3» con puntos. Cada figcaption lleva su % y una barrita. Si la última hoja va por debajo de un 25 %, sugiere «¿Cabe en un retazo?» y lleva a los retazos.
- **Sale de:** React Bits · Carousel, con gestos táctiles (alternativa: Skiper · skiper54 Shadcn clipPath Carousal, GRATIS).
- **Cómo en vanilla:** `scroll-snap-type:x mandatory` en `#an-res` e IntersectionObserver para el punto activo. El % de cada hoja es la suma de `GeometryUtil.polygonArea()` de sus piezas (con `SvgParser.polygonify()`, ya cargado) entre el área de la hoja.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** en computadora se queda en columna o rejilla, que sí cabe. Los puntos llevan zona táctil de 44 px, y el carrusel responde a las flechas del teclado.

### A13. El primer acomodo no deja la mesa vacía
- **Dónde:** `anidador-vectores/js/app.js` 610–611 (`#an-res` con «Calculando el primer acomodo…» y `#an-orig.hidden=true`); `css/anidador.css` 216–219 (el haz láser). Verificado.
- **Hoy:** al arrancar, la mesa se queda en negro con una frase hasta el primer resultado. Con muchas piezas tarda varios segundos, porque el motor calcula primero las formas de ajuste (NFP).
- **Propuesta:** la silueta de las piezas se queda en la mesa, atenuada y algo desenfocada, con una ficha «Calculando las formas… 12 s». Se aclara cuando llega el primer acomodo.
- **Sale de:** React Bits · RefineFrame (cada etapa es un cambio de desenfoque y opacidad con una ficha que la nombra).
- **Cómo en vanilla:** una clase en `#an-orig` con `filter:blur(2px) saturate(.6)` y `opacity:.5`, sin animar el desenfoque, y un cronómetro de 1 s. El haz que ya existe hace de banda: no se añade otra.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** `filter` sobre un SVG grande cuesta en teléfonos de gama media: se aplica una vez, no se anima. Con movimiento reducido, solo la opacidad.

### A15. Esquinas que señalan lo que se va a quedar fuera
- **Dónde:** `anidador-vectores/js/app.js` 377–383 (los avisos de textos, `<use>`, imágenes y recortes), 528–530 (`pintarArchivo()`) y 584–591 (las piezas que no caben); `css/anidador.css` 250 (todo se pinta como la misma silueta). Verificado.
- **Hoy:** el aviso dice «Trae 3 textos sin convertir», pero en la vista todo es la misma silueta y no se sabe cuáles son. Las piezas que no caben solo se cuentan.
- **Propuesta:** al tocar un aviso, cuatro esquinas se cierran sobre esos elementos en la vista previa. Las piezas que no caben llevan las mismas esquinas, en rojo. Otro toque las suelta.
- **Sale de:** React Bits · TargetCursor (solo las esquinas que se fijan, sin cursor).
- **Cómo en vanilla:** `getBBox()` de cada elemento en el clon de la vista, y por cada uno una `<g>` con cuatro trazos en L que entran de `scale(1.4)` a `none`. Para las que no caben, `poly.source` (`svgnest.js` 623) dice qué elemento es.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** los avisos se cuentan ANTES de `sanear()` (línea 386): solo se marca lo que sigue en la vista. El rojo siempre va con su palabra.

### A24. Mover y girar una pieza a mano, con choque
- **Dónde:** `anidador-vectores/js/app.js` 695–719 (`pintarResultado()`, las piezas en `<g transform="translate() rotate()">`) y 753–803 (`armarSalida()` copia esas `<g>`). Verificado.
- **Hoy:** el acomodo es final. No se puede empujar una pieza para juntar el sobrante en un retazo aprovechable ni girar una a mano.
- **Propuesta:** con el cálculo detenido, mantener presionada una pieza la levanta; se arrastra, y un botón la gira 90°. Al soltarla, si queda a menos de la separación de otra pieza o de la orilla, regresa sola a su lugar. La descarga lleva la posición nueva.
- **Sale de:** React Bits · TechText, tomar una letra y que regrese a su lugar (alternativa: el regreso de DodgeField).
- **Cómo en vanilla:** Pointer Events con `setPointerCapture` sobre la `<g>`. El choque se calcula con `window.ClipperLib`, ya cargado: desfase de media separación e intersección sobre `SvgParser.polygonify()`. El regreso, con WAAPI.
- **Valor · Esfuerzo:** Medio · Alto
- **Cuidado:** solo con el cálculo detenido. Se marca «Acomodo editado a mano» y «Seguir buscando» se esconde. Respeta la veta (A5), y las piezas más chicas que un dedo necesitan el zoom (A7).

### A25. «Como vienen / Acomodadas» con el barrido del láser
- **Dónde:** `anidador-vectores/index.html` 260 (`#an-vista-tab`, que hoy es una etiqueta y no un control); `js/app.js` 611 y 720 (`#an-orig.hidden=true`); `css/anidador.css` 216–219. Verificado.
- **Hoy:** en cuanto hay resultado, las piezas como llegaron ya no se pueden volver a ver sin volver a cargar el archivo.
- **Propuesta:** la etiqueta pasa a ser un control de dos opciones. Al cambiar, el haz del láser cruza la mesa una vez y va destapando la otra vista.
- **Sale de:** Skiper · skiper66 SVG clip path mask, GRATIS (alternativa: React Bits · PixelTransition, sin el pixelado). La ficha que se desliza es la del #2.
- **Cómo en vanilla:** las dos vistas en la misma celda de rejilla y `clip-path:inset()` en `transition`, al paso del haz. El control es un `role="radiogroup"` o un `.seg`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** 44 px por opción y atribución de Skiper. Con movimiento reducido, cambio directo.