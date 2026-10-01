# Fichas de la zona `pf-fabricacion`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### F5. El riel del taller con sus hitos marcados
- **Dónde:** `js/nucleo/ui.js` 650–655 (`filaTaller()`: `.tal-pista`, `.tal-riel`, `.tal-hoy`); `css/plataforma.css` 1052–1062; los datos ya existen en `js/datos/taller.js` 290 (`hitos` de en_diseno, cortado, armado y listo) y 312–315 (`etapa_esperada`). Verificado.
- **Hoy:** el riel es una barra de «empezar» a «listo» con un punto que marca hoy. Los hitos intermedios, y cuál de ellos ya pasó el proyecto, solo están en la frase.
- **Propuesta:** tres marcas sobre el riel en las fechas de cortar, armar y listo. Van rellenas si `etapa_real` ya pasó ese hito y huecas si no. Una marca que quedó detrás del punto de hoy sin rellenar se pinta en rojo con muesca, así «voy tarde» se ve sin leer. El Calendario y el Tablero cambian a la vez, porque los dos usan la misma función.
- **Sale de:** React Bits · Stepper (los pasos como marcas, sin la animación; alternativa: Skiper74 Timeline calendar, PRO).
- **Cómo en vanilla:** `<i>` con posición absoluta y `left:%` calculado con `diasEntre`, igual que hoy `.tal-hoy`. CSS puro.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** `ui.js` no decide nada del taller: pinta lo que trae `v.hitos` y `v.etapa_real`. Rellena y hueca, además del color. El riel sigue `aria-hidden` y la frase sigue mandando.

### F7. Botones que dicen qué están haciendo, cuánto llevan y cómo terminó
- **Dónde:** `js/mod/ajustes.js` 1141–1149 (`conElPuente()`: aviso de 2 s y `_ocupado`, que ignora toques sin decir nada), 1246–1274 (`bombear()`), 1282–1311 (`jalar()`, hasta 20 vueltas) y 709–728 (botones de `cardPuente()`); `js/mod/fabricacion.js` 1078–1091 (`despachar()`, que solo pone `disabled`) para los casos `gcal` en 1146–1165 y `gcal-borrar` en 1170–1174. Verificado.
- **Hoy:** una llamada que tarda de 5 a 30 s solo se anuncia con un aviso que se va a los 2 s. Los botones del puente no se apagan: un segundo toque no hace nada y no dice por qué. El resultado llega en otro aviso, lejos del botón.
- **Propuesta:** el botón tocado cambia su rótulo por lo que está haciendo («Trayendo la hoja… vuelta 3 · 12 s») y se va llenando de izquierda a derecha. Sus hermanos pasan a `aria-disabled`. Al final queda «Listo ✓» en verde un momento, o «No contestó · Reintentar» con una sacudida corta.
- **Sale de:** React Bits · CallChip (alternativa: LatticeLoader, para el verbo con cronómetro).
- **Cómo en vanilla:** un helper `conEstado(btn, etiqueta, fn)` que guarda el rótulo, pone `aria-busy`, lleva un `setInterval` de 1 s y una capa con `transform:scaleX()`. `jalar()` ya sabe en qué vuelta va.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** el ancho del botón no debe brincar: `min-width` igual al del rótulo original. El resultado se sigue diciendo con `toast()`/`voz()`. Con movimiento reducido, solo cambia el texto.

### F11. Cambiar de mes deslizando con el dedo
- **Dónde:** `js/mod/fabricacion.js` 603–637 (`pintarMes()`), 644–646 (`nav()`), 1044–1051 (`alTocar()`, rama `data-mueve`) y 428 (`pintar()`, que reescribe todo con `innerHTML`); `css/plataforma.css` 489–490 (`.cal-rej`). Verificado.
- **Hoy:** el mes solo cambia con ‹ › o con ← → del teclado, y la rejilla se reemplaza de golpe. El foco del botón de mes se pierde en el repintado.
- **Propuesta:** arrastrar la rejilla a los lados cambia de mes (o de semana en esa vista), y la rejilla nueva entra desde el lado del gesto en unos 200 ms. El foco regresa al control que se usó.
- **Sale de:** React Bits · Carousel (el gesto con umbral y dirección).
- **Cómo en vanilla:** Pointer Events en `.cal-rej` con `touch-action:pan-y` y un umbral de 48 px. La transición con `document.startViewTransition()` y `::view-transition-old/new` desplazados según la dirección. Sin soporte, se cambia sin transición.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** hay que distinguir arrastre de toque, porque tocar un día sigue abriéndolo. Con movimiento reducido no hay transición; se pregunta con `matchMedia`, como en `scrollSuave()`. `.cal-cab` se queda quieto.

### F14. La espera del asistente como traza con reloj (ya propuesta n.º 8, otro lugar)
- **Dónde:** `js/nucleo/asistente.js` 453–474 (el recorrido por proveedores en `preguntarIA()`), 483–488 (`ponerEspera()`) y 194 (la burbuja `.ia-espera` en `hiloHTML()`); `css/plataforma.css` 1941–1943. Verificado.
- **Hoy:** una burbuja con un reloj que gira y un texto que se sobrescribe («Preguntando a Gemini (intento 2)…»). Los intentos anteriores, y por qué fallaron, se pierden, y no se ve cuánto tiempo lleva.
- **Propuesta:** «Leí el taller ✓ · Qwen sin llave ✗ · Preguntando a Gemini · 14 s», que al contestar se pliega en «Contestó Gemini en 18 s».
- **Sale de:** React Bits · ThoughtLine.
- **Cómo en vanilla:** `ponerEspera()` junta los pasos en un arreglo en lugar de sobrescribir el texto; `setInterval` para el reloj y `<details>` para el pliegue.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** los mensajes que llegan de la hoja pasan por `esc()`. Sin movimiento con `prefers-reduced-motion`.

### F16. La silueta de la pantalla en vez de «Leyendo…»
- **Dónde:** `js/mod/fabricacion.js` 159–163, `js/mod/material.js` 241–243, `js/mod/mapa.js` 169–170 y `js/nucleo/asistente.js` 166–168 (`resumenHTML()`). La pieza ya existe en `js/nucleo/ui.js` 540–547 (`esqueletoModulo()`). Verificado.
- **Hoy:** el router pinta la silueta del módulo y un instante después el módulo la cambia por un reloj fijo centrado con un renglón: dos formas de «cargando» y un salto de alto.
- **Propuesta:** los tres módulos usan `esqueletoModulo(mod)` en lugar del `.vacio` de espera. El asistente pinta cuatro `.esq-n` con la forma de `.ia-cifras`.
- **Sale de:** React Bits · RefineFrame (el principio de reservar el lugar sin mover nada); la pieza ya está en el repo.
- **Cómo en vanilla:** cambiar el HTML de espera por la llamada que ya existe. Las clases `esq-*` ya respetan el movimiento reducido.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** se conservan `aria-busy` y el texto de estado. En Material, las recargas que siguen a una acción no deben volver a mostrar la silueta (ver F6).

### F17. La ventana de instalación dice qué implica al elegirla
- **Dónde:** `js/mod/fabricacion.js` 1327–1329 (chips con `title=VENTANA_DESC`), 1351–1352 (`pintarPaso2()`) y 1426–1438 (`alTocarHoja()`, rama `ventana`); `js/datos/agenda.js` 93–97 (`VENTANA_DESC`). Verificado.
- **Hoy:** «De noche» y «Madrugada» cambian la alarma de salida a 2 h antes, pero eso solo está en un `title`, que en el teléfono nunca se ve.
- **Propuesta:** una línea debajo de los chips con la descripción de la ventana elegida, que cambia con un fundido corto.
- **Sale de:** Vengeance · Morph Text (alternativa: React Bits BellToggle, por el cruce de rótulo).
- **Cómo en vanilla:** un `<p class="hintnote" aria-live="polite">` que la rama `ventana` reescribe, con una transición solo mientras cambia.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** el texto sale de `Agenda.VENTANA_DESC` y no se copia. El estado final queda a contraste completo (§4.3).

### F18. Al tocar un día, su lista aparece a la vista
- **Dónde:** `js/mod/fabricacion.js` 1060–1071 (`alTocar()`, rama `data-dia`) y 719–761 (`pintarDiaAbierto()`); `css/plataforma.css` 559 (`.dia-lista`) y 999 (`.cal-dia[aria-current="date"]`). Verificado.
- **Hoy:** la lista del día se pinta debajo de la rejilla y la pantalla no se mueve. En el teléfono puede quedar fuera de la vista, y el foco se pierde con el repintado.
- **Propuesta:** al abrir un día, la lista entra con una subida corta, la página baja lo justo para mostrar su encabezado y el foco va al título del día. Si se repinta con el día ya abierto, nada se mueve.
- **Sale de:** React Bits · AnimatedContent.
- **Cómo en vanilla:** un `data-recien` que solo se pone cuando cambia `_dia`, `scrollIntoView({block:'nearest', behavior:scrollSuave()})` y la `@keyframes entra` que ya existe.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** no se desplaza si la lista ya está a la vista.

### F19. La hoja de agendar muestra en qué paso va y avanza hacia adelante
- **Dónde:** `js/mod/fabricacion.js` 1272–1308 (`pintarPaso1()`), 1311–1370 (`pintarPaso2()`), 1397–1411 («Ya está agendada», dentro de `guardarAgenda()`) y 1221–1228 (`ponerEnCapa()`). Verificado.
- **Hoy:** tres contenidos en la misma capa (proyecto → día → al teléfono) que se reemplazan sin transición ni indicador. No hay forma de volver del paso 2 al 1 sin cerrar.
- **Propuesta:** tres puntos, «Proyecto · Día · Al teléfono», y el contenido nuevo entrando por la derecha, o por la izquierda al volver. En el paso 2, un «‹ Otro proyecto» que regresa al 1 sin perder el filtro.
- **Sale de:** React Bits · Stepper.
- **Cómo en vanilla:** `startViewTransition` alrededor del `innerHTML` de `ponerEnCapa()`, con la dirección en un atributo, y un `<ol>` con `aria-current="step"`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** no se llama `abrirCapa` dos veces, porque cada capa lleva una sola entrada de historial. El tercer paso sigue sin cerrarse solo, porque ahí se ofrece el .ics.

### F23. Las cuentas de arriba ruedan cuando cambian (ya propuesta n.º 1, otro lugar)
- **Dónde:** `js/mod/fabricacion.js` 564–587 (`pintarCuentas()`), `js/mod/material.js` 352–377 (`cuentas()`) y `js/mod/mapa.js` 400–406 (`refrescarPiezas()`); `css/plataforma.css` 797–798 (`.pf-cuenta b`). Verificado.
- **Hoy:** después de agendar, recibir material o poner un pin, «Ganados sin fecha 3 → 2» cambia de golpe en medio de un repintado completo y se pasa por alto.
- **Propuesta:** solo la cifra que cambió rueda una vez de su valor anterior al nuevo.
- **Sale de:** la misma pieza de la n.º 1 (React Bits Counter).
- **Cómo en vanilla:** un `Map` del módulo con el último valor de cada etiqueta, y WAAPI solo si el valor cambió.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** nunca en el primer pintado ni si el valor no cambió, porque se repinta en cada toque. `cifraQueCabe()` sigue fijando el ancho.

### F24. Probar el plazo antes de fijarlo
- **Dónde:** `js/mod/fabricacion.js` 1596–1616 (`abrirPlazo()`), 1775–1791 (rama `plazo`, donde el chip guarda al tocarlo) y 1647–1652 (chips de `abrirGanar()`). Verificado.
- **Hoy:** los cinco cubos, de «1 semana» a «3 semanas o más», no dicen qué fecha resulta; se sabe hasta el aviso de después.
- **Propuesta:** al pasar el dedo o el cursor sobre los chips, una ficha que salta con ellos dice «Entra al taller el lun 8 · listo el vie 19». Tocar confirma, como hoy.
- **Sale de:** React Bits · PeekRating (probar antes de comprometerse).
- **Cómo en vanilla:** `pointermove` con `elementFromPoint` y la fecha de `Taller.ventanaTaller()` llamada con el proyecto y el plazo candidato.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** la fecha la calcula `datos/taller.js`, porque la pantalla no calcula nada. Con teclado, la ficha aparece al enfocar cada chip.

### F26. Qué hay en un día sin abrirlo, en la computadora
- **Dónde:** `js/mod/fabricacion.js` 681–696 (`celdaDia()`: la respuesta completa vive en `aria-label` y solo el punto del semáforo tiene `title`). Verificado.
- **Hoy:** con ratón, para saber qué esconde un «+2» hay que tocar la celda, lo que repinta la pantalla.
- **Propuesta:** con `hover:hover`, una ficha con el texto del `aria-label`. La primera vez espera 400 ms; después sigue al cursor sin espera.
- **Sale de:** React Bits · WarmTooltip.
- **Cómo en vanilla:** un solo `<div role="tooltip">` que se reutiliza, con `pointerover` delegado en `.cal-rej`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** solo con `(hover:hover)`. La ficha va arriba de la celda y no sustituye al toque.

### F29. La barra de acción del teléfono sube y cambia de rótulo sin parpadear
- **Dónde:** `js/mod/fabricacion.js` 974–1002 (`pintarMbar()`), `js/mod/material.js` 789–804 y `js/mod/mapa.js` 818–830; `css/plataforma.css` 862–863 y 2099. Verificado.
- **Hoy:** la barra aparece y desaparece con `hidden`, y cuando cambia de acción (de «Decidir 2 cotizaciones» a «Agendar (3 sin fecha)») el cambio no se nota.
- **Propuesta:** al aparecer sube 12 px con un fundido de 180 ms. Si cambia el rótulo, el nuevo se cruza con el viejo.
- **Sale de:** React Bits · BellToggle (el cruce de rótulo con `clip-path`).
- **Cómo en vanilla:** `@starting-style` para la entrada; antes de reescribir se compara con el rótulo anterior.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** `ajustarAltoBarra()` tiene que medir el alto final y no el de media animación, el mismo problema que ya resolvió `alTerminarDeEntrar()`.

### F31. Palomita al copiar (ya propuesta n.º 6, otro lugar)
- **Dónde:** `js/mod/fabricacion.js` 1556 y 1793–1796 (orden de trabajo), `js/nucleo/asistente.js` 211 y 307–311 (`.ia-copiar`), `js/mod/mapa.js` 954–955 y 1095–1097 («Copiar dirección»); `js/nucleo/ui.js` 407–427 (`copiarTexto()`). Verificado.
- **Hoy:** solo lo confirma el aviso de abajo; el botón que se tocó no cambia.
- **Propuesta:** durante 1.5 s el icono se vuelve una palomita que se dibuja y el rótulo dice «Copiada».
- **Sale de:** la pieza de la n.º 6.
- **Cómo en vanilla:** `copiarTexto()` ya recibe `extra` como retrollamada de éxito; ahí se cambia el `<use href>`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** el aviso y `voz()` se quedan.

### P14. Fechas rápidas al ganar y al agendar
- **Dónde:** `js/mod/inicio.js` 670–694 (`abrirGanar()`, campo en 685–686) y 717–736 (`abrirFecha()`, día en 723–724 y hora en 725–726). Verificado.
- **Hoy:** el selector nativo viene con «hoy» ya puesto y la hora aparte. Con el dedo y el cliente enfrente son varios toques, y es fácil dejar «hoy» por inercia.
- **Propuesta:** una fila de fichas encima del campo: «Hoy · Mañana · sáb 3 · lun 5 · Sin fecha». El campo se queda para cualquier otro día. Para la hora: «9 a.m. · 12 · 4 p.m. · Noche».
- **Sale de:** React Bits · JellyRadio (sin su física). Alternativa: GlideSelect.
- **Cómo en vanilla:** radios nativos con el `.chip` que ya existe; escriben en el `<input type="date|time">`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** 44 px de zona táctil. «Sin fecha» vacía el campo, lo cual ya está permitido (687). Las fechas se calculan con `fechas.js` y nunca con `new Date(iso)`.