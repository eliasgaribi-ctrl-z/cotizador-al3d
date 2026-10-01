# Fichas de la zona `pf-ajustes`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### F2. «Enviar» que se enciende al escribir y se vuelve «Detener»
- **Dónde:** `js/nucleo/asistente.js` 138–141 (`pintar()`, `#ia-pregunta` y `.ia-enviar`), 347–352 (`alEscribir()`), 111–115 (`cerrar()`, que hoy es la única forma de cancelar) y 62 (`_cancelado`); `css/plataforma.css` 1979–1981 (`.ia-pie .btn.ia-enviar`). Verificado.
- **Hoy:** el botón de enviar es un `btn-pri` lleno aunque el campo esté vacío. Mientras la IA contesta (hasta 60 s por proveedor y hasta 4 proveedores), el campo y el botón quedan `disabled`, y para cancelar hay que cerrar el asistente.
- **Propuesta:** el botón empieza fantasma y se llena de color en cuanto hay texto. Durante la espera se convierte en un cuadro de «Detener» que usa el mismo camino que `cerrar()` (`_cancelado` + `_abort`) sin cerrar el panel. En el hilo queda el mensaje de siempre: «Quedó sin respuesta».
- **Sale de:** React Bits · PromptBar (el botón de enviar que se llena y la flecha que se vuelve cuadro de stop).
- **Cómo en vanilla:** en el evento `input` se alterna una clase `.listo`. Con `_ocupado` se cambian el `<use href>` del icono y el `aria-label`. La transición de `background` va en CSS.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** hay un solo botón de color por pantalla, y un botón vacío no cuenta como tal. Durante la espera se usa `aria-disabled` en vez de `disabled`, para que «Detener» siga respondiendo al toque. Zona táctil de 44 px.

### F14. La espera del asistente como traza con reloj (ya propuesta n.º 8, otro lugar)
- **Dónde:** `js/nucleo/asistente.js` 453–474 (el recorrido por proveedores en `preguntarIA()`), 483–488 (`ponerEspera()`) y 194 (la burbuja `.ia-espera` en `hiloHTML()`); `css/plataforma.css` 1941–1943. Verificado.
- **Hoy:** una burbuja con un reloj que gira y un texto que se sobrescribe («Preguntando a Gemini (intento 2)…»). Los intentos anteriores, y por qué fallaron, se pierden, y no se ve cuánto tiempo lleva.
- **Propuesta:** «Leí el taller ✓ · Qwen sin llave ✗ · Preguntando a Gemini · 14 s», que al contestar se pliega en «Contestó Gemini en 18 s».
- **Sale de:** React Bits · ThoughtLine.
- **Cómo en vanilla:** `ponerEspera()` junta los pasos en un arreglo en lugar de sobrescribir el texto; `setInterval` para el reloj y `<details>` para el pliegue.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** los mensajes que llegan de la hoja pasan por `esc()`. Sin movimiento con `prefers-reduced-motion`.

### F15. Una respuesta larga se lee desde su principio
- **Dónde:** `js/nucleo/asistente.js` 255–258 (`abajo()`) y 190–213 (`hiloHTML()`); `css/plataforma.css` 1926 (`.ia-hilo`). Verificado.
- **Hoy:** después de cada respuesta el hilo baja hasta `scrollHeight`, así que una cobranza de 20 renglones se abre mostrando su final.
- **Propuesta:** el scroll se ancla al principio de la burbuja nueva, y la burbuja entra con una subida breve de 150 ms.
- **Sale de:** React Bits · AnimatedList (la entrada del elemento nuevo).
- **Cómo en vanilla:** se marca `data-nueva` y se llama a `scrollIntoView({block:'start', behavior:scrollSuave()})`, con la `@keyframes entra` que ya existe.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** la animación corre solo en la burbuja nueva, no en cada `pintar()`. La portada sigue en `scrollTop=0`.

### F16. La silueta de la pantalla en vez de «Leyendo…»
- **Dónde:** `js/mod/fabricacion.js` 159–163, `js/mod/material.js` 241–243, `js/mod/mapa.js` 169–170 y `js/nucleo/asistente.js` 166–168 (`resumenHTML()`). La pieza ya existe en `js/nucleo/ui.js` 540–547 (`esqueletoModulo()`). Verificado.
- **Hoy:** el router pinta la silueta del módulo y un instante después el módulo la cambia por un reloj fijo centrado con un renglón: dos formas de «cargando» y un salto de alto.
- **Propuesta:** los tres módulos usan `esqueletoModulo(mod)` en lugar del `.vacio` de espera. El asistente pinta cuatro `.esq-n` con la forma de `.ia-cifras`.
- **Sale de:** React Bits · RefineFrame (el principio de reservar el lugar sin mover nada); la pieza ya está en el repo.
- **Cómo en vanilla:** cambiar el HTML de espera por la llamada que ya existe. Las clases `esq-*` ya respetan el movimiento reducido.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** se conservan `aria-busy` y el texto de estado. En Material, las recargas que siguen a una acción no deben volver a mostrar la silueta (ver F6).

### F30. Bordes que se desvanecen en la fórmula y en la tira del asistente (ya propuesta n.º 10, otro lugar)
- **Dónde:** `css/plataforma.css` 592–595 (`.mat-formula`, con `overflow-x:auto;white-space:nowrap`) y 1972–1973 (`.ia-tira`, con la barra de desplazamiento escondida). Verificado.
- **Hoy:** las dos se cortan por la derecha sin nada que diga que hay más.
- **Propuesta:** el desvanecido de la n.º 10, solo del lado donde todavía hay contenido.
- **Sale de:** la pieza de la n.º 10 (Skiper87 Scroll with fade effect, GRATIS).
- **Cómo en vanilla:** `mask-image` con variables que un oyente de `scroll` pasivo ajusta.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** la máscara se quita en `@media print`, porque la fórmula también se imprime.

### F31. Palomita al copiar (ya propuesta n.º 6, otro lugar)
- **Dónde:** `js/mod/fabricacion.js` 1556 y 1793–1796 (orden de trabajo), `js/nucleo/asistente.js` 211 y 307–311 (`.ia-copiar`), `js/mod/mapa.js` 954–955 y 1095–1097 («Copiar dirección»); `js/nucleo/ui.js` 407–427 (`copiarTexto()`). Verificado.
- **Hoy:** solo lo confirma el aviso de abajo; el botón que se tocó no cambia.
- **Propuesta:** durante 1.5 s el icono se vuelve una palomita que se dibuja y el rótulo dice «Copiada».
- **Sale de:** la pieza de la n.º 6.
- **Cómo en vanilla:** `copiarTexto()` ya recibe `extra` como retrollamada de éxito; ahí se cambia el `<use href>`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** el aviso y `voz()` se quedan.

### F7. Botones que dicen qué están haciendo, cuánto llevan y cómo terminó
- **Dónde:** `js/mod/ajustes.js` 1141–1149 (`conElPuente()`: aviso de 2 s y `_ocupado`, que ignora toques sin decir nada), 1246–1274 (`bombear()`), 1282–1311 (`jalar()`, hasta 20 vueltas) y 709–728 (botones de `cardPuente()`); `js/mod/fabricacion.js` 1078–1091 (`despachar()`, que solo pone `disabled`) para los casos `gcal` en 1146–1165 y `gcal-borrar` en 1170–1174. Verificado.
- **Hoy:** una llamada que tarda de 5 a 30 s solo se anuncia con un aviso que se va a los 2 s. Los botones del puente no se apagan: un segundo toque no hace nada y no dice por qué. El resultado llega en otro aviso, lejos del botón.
- **Propuesta:** el botón tocado cambia su rótulo por lo que está haciendo («Trayendo la hoja… vuelta 3 · 12 s») y se va llenando de izquierda a derecha. Sus hermanos pasan a `aria-disabled`. Al final queda «Listo ✓» en verde un momento, o «No contestó · Reintentar» con una sacudida corta.
- **Sale de:** React Bits · CallChip (alternativa: LatticeLoader, para el verbo con cronómetro).
- **Cómo en vanilla:** un helper `conEstado(btn, etiqueta, fn)` que guarda el rótulo, pone `aria-busy`, lleva un `setInterval` de 1 s y una capa con `transform:scaleX()`. `jalar()` ya sabe en qué vuelta va.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** el ancho del botón no debe brincar: `min-width` igual al del rótulo original. El resultado se sigue diciendo con `toast()`/`voz()`. Con movimiento reducido, solo cambia el texto.

### F21. Cambio de tema con revelado circular
- **Dónde:** `js/mod/ajustes.js` 371–381 (`cardApariencia()`) y 820–827 (`clic()`, rama `data-tema-elegir`). Verificado.
- **Hoy:** Claro, Oscuro y «El del sistema» cambian la app de golpe.
- **Propuesta:** el tema nuevo se abre en círculo desde el botón tocado, en unos 350 ms.
- **Sale de:** Skiper UI · skiper26 Theme toggle btn (GRATIS, con atribución) (alternativa: skiper4).
- **Cómo en vanilla:** `document.startViewTransition(() => AL3D_TEMA.poner(v))` con `clip-path:circle()` sobre `::view-transition-new(root)`, animado desde las coordenadas del clic.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** sin soporte, o con movimiento reducido, el cambio es directo. El sol y la luna del encabezado viven en `js/tema.js`, fuera de mi zona.

### F22. Índice fijo de Ajustes que sigue al scroll
- **Dónde:** `js/mod/ajustes.js` 291–326 (`pintar()`: nueve tarjetas, de «Quién eres» hasta el cordón de borrado). Verificado.
- **Hoy:** una columna de nueve tarjetas largas. Llegar a «Respaldo» o al «Puente» es desplazarse a ciegas.
- **Propuesta:** una tira fija con «Quién eres · Tema · Respaldo · Mapa · Calendar · Puente · Borrar». La de la tarjeta visible va marcada, con una ficha que se desliza entre ellas, y tocar una lleva a su tarjeta.
- **Sale de:** React Bits · PillNav (alternativa: Skiper89 Scroll progress 001, GRATIS).
- **Cómo en vanilla:** un `IntersectionObserver` sobre cada `.card` con `id`, `position:sticky` y `irA()` para el salto.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** 44 px de alto. En el teléfono la tira se desplaza de lado con bordes que se desvanecen (ya propuesta n.º 10). Va debajo del encabezado.

### F27. «BORRAR» en casillas que se validan al teclear
- **Dónde:** `js/mod/ajustes.js` 1389–1405 (`cordonFinal()`, `#aj-borrar`) y 1407–1413 (`cordonBorrar()`, que solo valida al apretar). Verificado.
- **Hoy:** se escribe en un campo libre y el error se descubre al tocar «Borrar de verdad».
- **Propuesta:** seis casillas que se van llenando, y «Borrar de verdad» solo se habilita con BORRAR completo.
- **Sale de:** React Bits · CodeSlots.
- **Cómo en vanilla:** el mismo `<input>` transparente encima de seis `<span>`, y `aria-disabled` en el botón hasta que el valor sea «BORRAR».
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** `aria-disabled` y no `disabled`, para que el botón siga explicando por qué no se puede. Nada de festejo al completar.

### F32. Los pasos de Google Cloud y del puente se palomean y se recuerdan
- **Dónde:** `js/mod/ajustes.js` 478 (`cardGcal()`, 13 pasos en `<ol class="aj-pasos">`) y 566 (`cardPuente()`); `css/plataforma.css` 1161–1163. Verificado.
- **Hoy:** al ir y volver de la consola de Google en el teléfono, se pierde por qué paso ibas.
- **Propuesta:** cada paso se palomea al tocarlo, el primero sin palomear queda resaltado como «vas aquí», y se recuerda en este dispositivo.
- **Sale de:** React Bits · Stepper.
- **Cómo en vanilla:** cada `<li>` es un botón y el estado va por `Prefs`, con su try/catch.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** los textos siguen saliendo de `Gcal.instrucciones()` y `Puente.instrucciones()`.

### F3. Medidor de existencia en cada renglón de material
- **Dónde:** `js/mod/material.js` 503–515 (`filaCompra()`, bloque `grande`: «hay X · piden Y») y 634–639 (`filaExistencia()`, `.mat-cant` con «ya con dueño · libre»); `css/plataforma.css` 582–587 (`.mat-cant`); el mismo caso en `js/mod/ajustes.js` 402–408 (`cardRespaldo()`, «MB usados de … (pct %)»). Verificado.
- **Hoy:** cuánto hay contra cuánto piden, el mínimo y lo comprometido solo se leen en una frase chica debajo del número.
- **Propuesta:** una barra fija de 6 px debajo de la cantidad. El tramo lleno es lo que hay, el rayado es lo que ya tiene dueño, una muesca marca el mínimo o lo que piden, y el hueco hasta «piden» va en ámbar. Si el libro va en negativo, la barra sale vacía con la muesca a la izquierda. La frase se queda.
- **Sale de:** React Bits · SloshGauge (solo el tanque, sin el oleaje).
- **Cómo en vanilla:** CSS puro, con `--v`, `--min` y `--pide` en `style=` y dos `<i>` con `width:calc(var(--v)*100%)`, marcados `aria-hidden`.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** el color no es la única señal (lleno, rayado y muesca). La barra no lleva texto encima. En la hoja impresa la frase siempre va, con la barra impresa o escondida con `.no-papel`.