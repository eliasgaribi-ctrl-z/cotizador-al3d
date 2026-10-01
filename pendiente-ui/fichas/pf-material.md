# Fichas de la zona `pf-material`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### F3. Medidor de existencia en cada renglón de material
- **Dónde:** `js/mod/material.js` 503–515 (`filaCompra()`, bloque `grande`: «hay X · piden Y») y 634–639 (`filaExistencia()`, `.mat-cant` con «ya con dueño · libre»); `css/plataforma.css` 582–587 (`.mat-cant`); el mismo caso en `js/mod/ajustes.js` 402–408 (`cardRespaldo()`, «MB usados de … (pct %)»). Verificado.
- **Hoy:** cuánto hay contra cuánto piden, el mínimo y lo comprometido solo se leen en una frase chica debajo del número.
- **Propuesta:** una barra fija de 6 px debajo de la cantidad. El tramo lleno es lo que hay, el rayado es lo que ya tiene dueño, una muesca marca el mínimo o lo que piden, y el hueco hasta «piden» va en ámbar. Si el libro va en negativo, la barra sale vacía con la muesca a la izquierda. La frase se queda.
- **Sale de:** React Bits · SloshGauge (solo el tanque, sin el oleaje).
- **Cómo en vanilla:** CSS puro, con `--v`, `--min` y `--pide` en `style=` y dos `<i>` con `width:calc(var(--v)*100%)`, marcados `aria-hidden`.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** el color no es la única señal (lleno, rayado y muesca). La barra no lleva texto encima. En la hoja impresa la frase siempre va, con la barra impresa o escondida con `.no-papel`.

### F4. La diferencia se ve mientras se corrige un conteo o una línea
- **Dónde:** `js/mod/material.js` 1171–1195 (`abrirContar()`, `#mt-contar`), 1313–1333 (`hacerContar()`, que muestra `r.valor.diferencia` solo al final) y 1201–1236 (`abrirAjustar()`, `#mt-real`). Verificado.
- **Hoy:** la diferencia contra el libro se sabe hasta después de guardar, en el aviso. Un «30» escrito en lugar de «3.0» reinicia el almacén con un número diez veces mayor, porque «este número gana sobre todo lo anterior».
- **Propuesta:** debajo del campo, una línea que cambia al teclear: «El libro dice 2.4 · tú dices 3 → +0.6 láminas». En Ajustar: «Se usó 124 % de lo calculado». Si el cambio es más de tres veces mayor o menor, la línea pasa a ámbar con «¿Seguro? Es mucho más de lo que dice el libro». No bloquea el guardado.
- **Sale de:** Vengeance · Animated Number (alternativa: Skiper37 Animated number, GRATIS).
- **Cómo en vanilla:** un oyente de `input` delegado en `#pf-pide`, como hace `alEscribirHoja()`, y un `<output aria-live="polite">`. El rodar de los dígitos es opcional, con WAAPI.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** no es un cálculo de material, es la misma resta que ya devuelve `Stock.contar`. El ámbar va siempre con palabra.

### F6. El conteo del mes se palomea renglón por renglón sin perder el sitio
- **Dónde:** `js/mod/material.js` 607–657 (`filaExistencia()`, «Así está» en 646–647), 826–827 (`clicCuerpo()`), 886–891 (`aceptarDerivado()`) y 239–248 (`cargar()`, que en 241–243 pinta «Sumando el libro del almacén…» antes de repintar); `js/datos/stock.js` 207 (`frescura_dias`) y 243 (`existencia()`). Verificado.
- **Hoy:** cada «Así está» o «Corregir» pasa por `cargar()`, que cambia la lista entera por el aviso de carga y la vuelve a pintar. La página se encoge, el scroll salta y en 19 renglones hay que volver a buscar por dónde ibas. Tampoco se ve cuántos van contados hoy.
- **Propuesta:** el renglón contado se actualiza en su lugar: el sello dice «contado hoy por …» y el cuadro del icono se llena con una palomita. Arriba de la tarjeta, «Contados hoy: 7 de 19» avanza. La lista no se vacía entre toques.
- **Sale de:** React Bits · SpringCheck (con un toque se llena el cuadro y se dibuja la palomita).
- **Cómo en vanilla:** después de `Stock.aceptarDerivado`, se lee solo `Stock.existencia(id)` y se reemplaza ese `.mat-fila` con `outerHTML`, sin pasar por `cargar()`. La palomita es un `<path>` con `stroke-dashoffset`. El conteo sale de `frescura_dias === 0`.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** SpringCheck tacha y atenúa la etiqueta; aquí no se hace, porque no se usa `opacity` sobre texto (§4.3) y la marca va en el icono y en el sello. El orden del catálogo no se mueve, que es una decisión de `tabAlmacen()`.

### F13. «Recibí lo de la lista» y «Actualizar» con su «Deshacer» en el mismo botón
- **Dónde:** `js/mod/material.js` 425–433 (`tabComprar()`), 789–804 (`pintarMbar()`) y 863–884 (`recibirTodo()`); 394–415 (`fila_calibracion()`) y 909–919 (`aplicarCalibracion()`). Verificado.
- **Hoy:** un toque mete N entradas al libro, o cambia una constante, y el único arreglo es un conteo a mano o volver a escribir el valor.
- **Propuesta:** al tocar, el rótulo pasa a «Deshacer» y un hilo se consume durante 8 s; tocarlo revierte. En la calibración, revertir es guardar el valor anterior, que ya está en `CTES`.
- **Sale de:** React Bits · FuseButton.
- **Cómo en vanilla:** el botón guarda `r.valor`, cambia el texto y el `aria-label`, y anima una capa con `transform:scaleX` usando WAAPI.
- **Valor · Esfuerzo:** Alto · Alto
- **Cuidado:** hoy `js/datos/stock.js` no tiene cómo anular una recepción. Habría que escribir esa función, con un movimiento compensatorio sellado y sin borrar renglones. Esto no es un «¿seguro?», que la cabecera de `recibirTodo()` descarta a propósito. El hilo dura lo mismo que el aviso con «Deshacer».

### F16. La silueta de la pantalla en vez de «Leyendo…»
- **Dónde:** `js/mod/fabricacion.js` 159–163, `js/mod/material.js` 241–243, `js/mod/mapa.js` 169–170 y `js/nucleo/asistente.js` 166–168 (`resumenHTML()`). La pieza ya existe en `js/nucleo/ui.js` 540–547 (`esqueletoModulo()`). Verificado.
- **Hoy:** el router pinta la silueta del módulo y un instante después el módulo la cambia por un reloj fijo centrado con un renglón: dos formas de «cargando» y un salto de alto.
- **Propuesta:** los tres módulos usan `esqueletoModulo(mod)` en lugar del `.vacio` de espera. El asistente pinta cuatro `.esq-n` con la forma de `.ia-cifras`.
- **Sale de:** React Bits · RefineFrame (el principio de reservar el lugar sin mover nada); la pieza ya está en el repo.
- **Cómo en vanilla:** cambiar el HTML de espera por la llamada que ya existe. Las clases `esq-*` ya respetan el movimiento reducido.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** se conservan `aria-busy` y el texto de estado. En Material, las recargas que siguen a una acción no deben volver a mostrar la silueta (ver F6).

### F20. «Guardar lo que cambiaste» se enciende cuando hay cambios
- **Dónde:** `js/mod/material.js` 1082–1086 (`filaConstante()`, `data-antes`), 954–958 (pie de `htmlHoja()`) y 1108–1117 (`guardarConstantes()`, con su aviso «No cambiaste ningún número»). Verificado.
- **Hoy:** el botón azul está siempre encendido y nada indica qué campos se tocaron.
- **Propuesta:** el botón empieza fantasma y se llena de color cuando algún campo difiere de `data-antes`, con la cuenta: «Guardar 2 cambios». Cada campo cambiado lleva un filete ámbar y, debajo en chico, el valor anterior.
- **Sale de:** React Bits · PromptBar (el botón que se llena cuando hay algo que mandar).
- **Cómo en vanilla:** un oyente de `input` delegado en `#pf-hoja` y la clase `.cambiado` en el `.fld`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** un solo botón de color. El valor actual se queda a contraste completo.

### F23. Las cuentas de arriba ruedan cuando cambian (ya propuesta n.º 1, otro lugar)
- **Dónde:** `js/mod/fabricacion.js` 564–587 (`pintarCuentas()`), `js/mod/material.js` 352–377 (`cuentas()`) y `js/mod/mapa.js` 400–406 (`refrescarPiezas()`); `css/plataforma.css` 797–798 (`.pf-cuenta b`). Verificado.
- **Hoy:** después de agendar, recibir material o poner un pin, «Ganados sin fecha 3 → 2» cambia de golpe en medio de un repintado completo y se pasa por alto.
- **Propuesta:** solo la cifra que cambió rueda una vez de su valor anterior al nuevo.
- **Sale de:** la misma pieza de la n.º 1 (React Bits Counter).
- **Cómo en vanilla:** un `Map` del módulo con el último valor de cada etiqueta, y WAAPI solo si el valor cambió.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** nunca en el primer pintado ni si el valor no cambió, porque se repinta en cada toque. `cifraQueCabe()` sigue fijando el ancho.

### F29. La barra de acción del teléfono sube y cambia de rótulo sin parpadear
- **Dónde:** `js/mod/fabricacion.js` 974–1002 (`pintarMbar()`), `js/mod/material.js` 789–804 y `js/mod/mapa.js` 818–830; `css/plataforma.css` 862–863 y 2099. Verificado.
- **Hoy:** la barra aparece y desaparece con `hidden`, y cuando cambia de acción (de «Decidir 2 cotizaciones» a «Agendar (3 sin fecha)») el cambio no se nota.
- **Propuesta:** al aparecer sube 12 px con un fundido de 180 ms. Si cambia el rótulo, el nuevo se cruza con el viejo.
- **Sale de:** React Bits · BellToggle (el cruce de rótulo con `clip-path`).
- **Cómo en vanilla:** `@starting-style` para la entrada; antes de reescribir se compara con el rótulo anterior.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** `ajustarAltoBarra()` tiene que medir el alto final y no el de media animación, el mismo problema que ya resolvió `alTerminarDeEntrar()`.

### F30. Bordes que se desvanecen en la fórmula y en la tira del asistente (ya propuesta n.º 10, otro lugar)
- **Dónde:** `css/plataforma.css` 592–595 (`.mat-formula`, con `overflow-x:auto;white-space:nowrap`) y 1972–1973 (`.ia-tira`, con la barra de desplazamiento escondida). Verificado.
- **Hoy:** las dos se cortan por la derecha sin nada que diga que hay más.
- **Propuesta:** el desvanecido de la n.º 10, solo del lado donde todavía hay contenido.
- **Sale de:** la pieza de la n.º 10 (Skiper87 Scroll with fade effect, GRATIS).
- **Cómo en vanilla:** `mask-image` con variables que un oyente de `scroll` pasivo ajusta.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** la máscara se quita en `@media print`, porque la fórmula también se imprime.

### F1. Aviso con mecha: la ventana de «Deshacer» se ve y se pausa
- **Dónde:** `js/nucleo/ui.js` líneas 131–153 (función `toast()`); `css/sistema.css` 1403–1416 (`.toast`, `.toast-act`, `.toast.ok/.err`) y 3876–3878 (`#toast`); caso que se pisa: `js/mod/material.js` 1323–1331 (`hacerContar()` lanza dos avisos seguidos). Verificado.
- **Hoy:** un `setTimeout` fijo esconde el aviso. No se ve cuánto queda para «Deshacer», el tiempo no se detiene con el dedo o el foco encima, y un segundo aviso reemplaza al primero aunque ese traiga «Deshacer».
- **Propuesta:** un filete de 2 px que se consume en exactamente `dur`, para cumplir el contrato de que «la ventana de deshacer dura lo que dura el aviso». Se congela mientras haya dedo, cursor o foco sobre el aviso, y el aviso se descarta deslizándolo hacia abajo. Si llega otro aviso con uno de «Deshacer» todavía vivo, se apilan (máximo 2) en vez de borrarse.
- **Sale de:** React Bits · SwipeToast (para la pila: AnimatedList).
- **Cómo en vanilla:** `el.animate([{transform:'scaleX(1)'},{transform:'scaleX(0)'}],{duration:dur})` en un `<span>`, que sustituye al `setTimeout` usando `anim.finished`, con `pause()/play()` en `pointerenter`/`focusin`. El gesto de deslizar va con Pointer Events y `translateY`, con un umbral de 40 px.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** la pausa por foco es la corrección de accesibilidad de verdad: hoy quien llega con el tabulador a «Deshacer» puede perderlo. `voz()` se queda igual. Con `prefers-reduced-motion` la mecha no se anima.