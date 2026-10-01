# Fichas de la zona `an-controles`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### A4. La mecha del paro automático
- **Dónde:** `anidador-vectores/js/app.js` 40–41 (`LIMITE_INTENTOS`, `LIMITE_MS`), 653 (`alAvanzar()`) y 657–669 (`alMostrar()`); `anidador-vectores/index.html` 250 (`#an-ir`) y 282 (`.an-prog-track`). Verificado.
- **Hoy:** el motor se detiene solo tras 25 intentos y 40 s sin mejorar, pero nada dice cuánto falta. La barra `#an-prog-bar` es el avance de cada intento interno: llega a 100 y vuelve a 0.
- **Propuesta:** bajo «Detener», un hilo que se quema durante los 40 s desde la última mejora y se rellena de golpe cuando mejora. Lo acompaña el texto «Sin mejora hace 18 s · faltan 7 intentos». Sustituye a la barra que va y viene.
- **Sale de:** React Bits · FuseButton, solo la mecha (alternativa: la mecha de SwipeToast).
- **Cómo en vanilla:** un `::after` con `transform:scaleX()` y `transition-duration` igual a los ms que faltan. En cada mejora se quita la transición, se fuerza un reflow y se relanza, con el mismo truco de `void m.offsetWidth` de la línea 735.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** el paro tiene DOS condiciones. Si la mecha se acaba con menos de 25 intentos, el texto tiene que decirlo, o la mecha miente. Con movimiento reducido queda solo el texto.

### A5. La veta: no girar 90° el aluminio cepillado ni el MDF
- **Dónde:** `anidador-vectores/index.html` 229–237 (`#an-rot`, que nace en 4 giros en la 234) y 177–184 (`#an-mats`); `js/app.js` 193–200 (`elegirMaterial()`); `css/anidador.css` 76, 244 y 247 (los acabados cepillado y madera). Verificado.
- **Hoy:** las piezas se giran cada 90° con cualquier material. La mesa pinta la veta del cepillado y del MDF, pero nada avisa que una letra girada 90° queda con la veta atravesada. En brush eso se ve en el anuncio terminado.
- **Propuesta:** al elegir Aluminio o MDF, sale un aviso junto a los giros: «¿Lleva veta (cepillado, madera)? Con 0° y 180° queda igual», con un botón «Usar 0° y 180°». En la mesa, las piezas giradas 90° o 270° llevan un rayado fino para verlas de un vistazo.
- **Sale de:** React Bits · WarmTooltip (alternativa: Skiper · skiper101 Custom tooltip, GRATIS).
- **Cómo en vanilla:** un `popover="manual"` junto a `#an-rot`, con anclaje CSS donde exista y posición absoluta donde no. El rayado es un `<pattern>` que se aplica por clase a las `<g>` cuyo `rotate()` sea 90 o 270.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** es una pregunta, no una regla: el aluminio blanco, negro o pintado no tiene veta. El motor aplica los giros a todo el trabajo (`config({rotations})`), no pieza por pieza.

### A6. Cotas sobre el dibujo al pedir la medida real
- **Dónde:** `anidador-vectores/index.html` 158–168 (`#an-sec-medida`, `#an-ancho-d`, `#an-alto-d` y la nota de la 166); `js/app.js` 420–452 (`pintarOriginal()`, `A.bbox`) y 473–517 (`pintarMedida()`, `escalaDiseno()`). Verificado.
- **Hoy:** la nota explica que es la medida «de lo dibujado, no la del lienzo», pero la vista no enseña qué caja se mide. Una escala mal puesta sale plausible y se descubre en la máquina.
- **Propuesta:** dos cotas, ancho y alto, dibujadas sobre la silueta alrededor de `A.bbox`, con el número en mm que cambia al teclear. La cota del campo que tiene el foco se enciende. Sin escala, dicen «¿? mm» en ámbar.
- **Sale de:** React Bits · Crosshair (solo las líneas guía, sin cursor propio).
- **Cómo en vanilla:** una `<g>` extra en el clon de la vista, no en `svgParaMotor()` (ése clona `A.raiz` limpia), con `vector-effect:non-scaling-stroke` y flechas en `<marker>`. `focusin` y `focusout` en los dos campos cambian una clase.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** el sistema dice que «el azul solo significa ELEGIDO». Las líneas van en `--a3` (informa sin ser acción) y el número en tinta, porque `--a3` no lleva texto. La silueta va sobre hoja blanca: el contraste del número se mide contra blanco.

### A9. Deshacer con mecha: al volver a acomodar desde cero y al quitar un retazo
- **Dónde:** `anidador-vectores/js/app.js` 558–572 y 599 (`iniciar()`: `config()` borra el cálculo y deja `T.mejor=null`), 741 (la etiqueta del botón), 321–325 (`quitarRetazo()`) y 136–143 (`toast()` local, sin acción). Verificado.
- **Hoy:** un toque en «Volver a acomodar desde cero» tira el mejor acomodo encontrado, que puede llevar minutos de cálculo, y no hay vuelta. La × de un retazo lo borra de una vez y el aviso no trae «Deshacer».
- **Propuesta:** guardar `T.anterior` y avisar «Se guardó el acomodo anterior (78 %, 2 hojas) · Recuperar» con una mecha de 8 s. Recuperar lo deja listo para descargar. Lo mismo al quitar un retazo.
- **Sale de:** React Bits · FuseButton, el deshacer que se quema (alternativa para el reinicio: el #5 HoldButton ya propuesto).
- **Cómo en vanilla:** portar la firma `toast(msg,tipo,dur,accion)` de `docs/SISTEMA-DE-DISENO.md` §6.2, porque el anidador tiene una versión sin acción. La mecha es un `::after` con `scaleX` en `.toast` que dura lo mismo que el aviso.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** lo recuperado no se puede «seguir buscando» porque el motor ya no lo tiene: `#an-seguir` sigue escondido. Con acción, el aviso dura 8 s como mínimo (es el contrato de §6.2).

### A16. Descargar por hoja desde un menú, y mandar el archivo
- **Dónde:** `anidador-vectores/index.html` 252–253 (`#an-dl`, `#an-dl-hojas`); `js/app.js` 722–731 (un botón «Solo la hoja N» por hoja) y 805–816 (`descargar()`). Verificado.
- **Hoy:** un botón descarga todas y debajo hay un botón fantasma por hoja: con 5 hojas son 6 botones.
- **Propuesta:** «Descargar SVG ▾» abre un menú desde su esquina: Todas (una capa por hoja), Hoja 1, Hoja 2… y Compartir, para mandarlo por WhatsApp o correo a la computadora del láser.
- **Sale de:** React Bits · GlideSelect.
- **Cómo en vanilla:** `popover` con `popovertarget`. El resaltado es un solo `div` que se mueve con `transform` en `pointerover` y `focus`. Compartir usa `navigator.canShare({files})` y se esconde si no hay soporte.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** hay un solo botón de color por pantalla y ya es «Acomodar». Renglones de 44 px. Es la misma técnica del popover del #4, en otro lugar.

### A21. La orientación de la hoja, a la vista
- **Dónde:** `anidador-vectores/index.html` 189–213 (las tarjetas, con `--w` y `--h` fijos, y `#an-girar`); `js/app.js` 214–221 (`sincronizarHoja()`), 256–271 y 280–284; `css/anidador.css` 100–107. Verificado.
- **Hoy:** las tarjetas siempre dibujan la hoja parada. «Girar la hoja» solo intercambia los números y lanza un aviso; la tarjeta sigue dibujándola parada.
- **Propuesta:** con la hoja acostada, la hojita de cada tarjeta gira 90° con un pequeño rebote, y el ícono de «Girar» gira con ella.
- **Sale de:** React Bits · FlipCard (el asentado con resorte), aplicado a 90° y no a 180°.
- **Cómo en vanilla:** `sincronizarHoja()` pone la clase `.acostada` en `#an-tiles`, que aplica `.an-tile-hoja{transform:rotate(90deg)}` con `transition`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** `--mv-liq` es «SOLO lo que es de vidrio» (`sistema.css` 445): aquí va `--mv-r`. El marco de la figura mide 46 px y la hoja completa acostada (44 × 22) cabe.

### A29. Brillo de aluminio cepillado que cruza el logo al terminar la carga
- **Dónde:** `anidador-vectores/index.html` 96–97 (`#brandLogo` y su `.logoimg`); `js/app.js` 885–887 (el fin del arranque); `css/sistema.css` 520 (`.logoimg`). Verificado.
- **Hoy:** el logo es fijo y nada marca el momento en que la app ya cargó.
- **Propuesta:** al quitarse el esqueleto, y también tras una actualización (A22), un solo reflejo de aluminio cepillado cruza el logo en 600 ms.
- **Sale de:** React Bits · ShinyText (alternativa: el brillo de Vengeance · Animated Button).
- **Cómo en vanilla:** un `::after` sobre `#brandLogo` (un `<img>` no admite pseudoelementos) con `mask:url(logo-al3d.svg) center/contain no-repeat` y un `linear-gradient` que cruza una vez.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** una vez por carga, no en cada cambio de pantalla de la plataforma (una sola pieza se mueve sola). La máscara tiene la misma forma en los dos temas.

### A30. El arranque del anidador con su propio ícono
- **Dónde:** `anidador-vectores/index.html` 91 (`#i-anidar`, cuatro rectángulos) y 110–121 (`#an-arranque`, con «Abriendo el anidador…» en la 119); `css/sistema.css` 5084–5086 y 5098. Verificado.
- **Hoy:** el mismo punto que gira en todas las cargas, durante 700 a 950 ms.
- **Propuesta:** los cuatro rectángulos del ícono caen a su lugar uno tras otro junto al texto. Es el ícono de la Mesa de corte en la plataforma, así que la carga lo enseña. Sirve también para la ficha del A13.
- **Sale de:** React Bits · LatticeLoader (celdas que se encienden en ola desfasada).
- **Cómo en vanilla:** un SVG de 24 px con 4 `<rect>` y `@keyframes` con `animation-delay` escalonado.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** desaparece con el esqueleto (`app.js` 886–887). Con movimiento reducido, ícono quieto; hay que añadirlo a la regla de la línea 5098.

### A31. Probar con un ejemplo
- **Dónde:** `anidador-vectores/index.html` 288 (`.an-vacio`, «Sube un SVG para verlo aquí…») y 138–142 (`#an-drop`); `js/app.js` 350 (`cargarTexto()`). Verificado.
- **Hoy:** la mesa vacía es la cuadrícula y una frase; alguien nuevo en el taller no tiene con qué probar.
- **Propuesta:** un botón «Probar con un ejemplo» que carga las letras «AL3D» del logotipo a una medida conocida. Sus contornos se trazan sobre la cama y se rellenan al llegar.
- **Sale de:** React Bits · StrokeText.
- **Cómo en vanilla:** `fetch('../logo-al3d.svg')`, que ya está en caché; se quedan solo los trazos de las letras, se pone un `width` en mm y se pasa a `cargarTexto(texto,'ejemplo-al3d.svg')`. El trazo, con `stroke-dashoffset`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** la banda tiene que decir «Ejemplo» para que nadie lo mande a cortar. El logo es un archivo generado («No editar a mano»): solo se lee.

### A32. Cambiar de tema con un revelado circular
- **Dónde:** `anidador-vectores/index.html` 101 (`.btn-tema[data-tema-btn]`); `js/tema.js` 121–126 (`alternar()`). Verificado.
- **Hoy:** el cambio entre claro y oscuro es instantáneo.
- **Propuesta:** el tema nuevo se abre en círculo desde el botón del sol o la luna.
- **Sale de:** Skiper · skiper26 Theme toggle btn, GRATIS (alternativa: skiper4).
- **Cómo en vanilla:** `document.startViewTransition(() => aplicar())` y `::view-transition-new(root)` con un `clip-path:circle()` que crece desde el botón. Sin soporte, como hoy.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** `tema.js` lo comparten todas las páginas. Con movimiento reducido, cambio directo. La captura de la transición cuesta con la mesa llena: saltarla mientras el motor corre.