# Anexo — las 153 fichas completas, por zona

Cada ficha: **Dónde** (archivo y líneas, comprobados contra `9ff7318`) · **Hoy** · **Propuesta** · **Sale de** · **Cómo en vanilla** · **Valor · Esfuerzo** · **Cuidado**. Los números de «idea #N» o «ya propuesta n.º N» se refieren a las piezas 1–11 de la v1 (las mismas 1–11 de la sección 2 del brief).

| Zona | Prefijo | Qué cubre |
|---|---|---|
| 1 | C | Flujo principal del cotizador: `cotizador.html`, arranque, catálogo, partidas, proceso, núcleo, venta, notario |
| 2 | H | Herramientas y salida: entrega (PDF/WhatsApp), historial, escalador, vectorizador, IA |
| 3 | P | Plataforma: esqueleto (`index.html`, `app.js`), Hoy, Tablero, Proyectos, Control, Herramientas |
| 4 | F | Fabricación, Material, Mapa, Ajustes y el núcleo (`ui.js`, asistente, puerta, ingreso, Calendar) |
| 5 | A | Anidador, páginas públicas (verificar, acerca, legales), `sw.js`, manifiesto y logo |


---

## Zona 1 · Cotizador — flujo principal (C)

### C1. Que solo se mueva lo que se tocó
- **Dónde:** `js/cotizador/partidas.js` 520–675 (`renderItems()`, con `c.innerHTML=''` en la 524), llamada desde `setItem()` 221–233, `setTipo()` 355–366, `togglePartida()` 39–71, `addItem()` 108–133, `delItem()` 173–201, `dupItem()` 367–378 y el `drop` 637–652; `css/sistema.css` 3892 (`.partida{animation:entra…}`) y 4656 (`.chip.on{animation:chip-cede…}`). Verificado.
- **Hoy:** cada toque de un chip reconstruye la lista entera. Por eso TODAS las partidas vuelven a entrar con fundido desde 10 px y todos los chips elegidos rebotan otra vez. Al plegar, agregar o borrar, lo de abajo salta de golpe.
- **Propuesta:** animar solo lo que cambió. La partida nueva entra sola, la borrada se cierra, la duplicada sale de debajo de su original y las vecinas se deslizan a su sitio al plegar, abrir o reordenar. Al cambiar de tipo, el cuerpo hace un fundido corto. El resto de la lista se queda quieto.
- **Sale de:** React Bits · AnimatedList (entrada y salida por renglón) + CardSwap (transición de layout). Alternativa: Animmaster · Page Transitions (de pago).
- **Cómo en vanilla:** `document.startViewTransition(()=>renderItems())` solo en las acciones estructurales, con `view-transition-name:p-<id>` en cada `.partida`. La animación de entrada va solo a los id que no estaban en el pintado anterior (un `Set`), y se quita la de `.partida` y `.chip.on` en los repintados.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** la regla dice «se mueve por una acción del usuario», y hoy se mueve justo lo que NO se tocó. Con movimiento reducido se salta el `startViewTransition`. Nunca envolver `typeItem()` (se llama al teclear). `.pcab` es sticky y con `backdrop-filter`: probar en un Android de gama media.

### C2. El Deshacer con su mecha a la vista
- **Dónde:** `js/cotizador/nucleo.js` 669–694 (`toast()`); `css/sistema.css` 1403–1424 y 3876–3878 (`.toast`, `#toast`). Avisos con Deshacer: `partidas.js` 200 (`delItem`) y 1219 (`clearAiFile`), `proceso.js` 1835–1837 (`nueva`). Verificado.
- **Hoy:** el aviso se va a los 6–9 s sin enseñar cuánto le queda. No se pausa con el dedo encima ni se puede apartar. El único reloj es un `setTimeout`.
- **Propuesta:** un filete de 2 px que se consume durante exactamente la ventana del Deshacer. Tocarlo, pasar el cursor o enfocar el botón lo pausa; deslizarlo hacia abajo lo descarta.
- **Sale de:** React Bits · SwipeToast (mecha y deslizar para cerrar) + FuseButton (deshacer con mecha).
- **Cómo en vanilla:** `::after` con `transform:scaleX` y `animation:mecha var(--dur) linear forwards`. `animation-play-state:paused` en `:hover,:focus-within`, más un temporizador que guarda el tiempo restante. Pointer Events para el arrastre (umbral de 40 px o por velocidad).
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** es un momento breve que se apaga y lo disparó el usuario. Con movimiento reducido no hay mecha animada, pero la pausa se queda. Hay que conservar la subida por encima del dock (≤759 px) y la regla `.scaler-modal-bg.show+.toast`.

### C3. Un aviso no borra al otro
- **Dónde:** `js/cotizador/nucleo.js` 669–694 (un solo `#toast` y un solo `_toastT`). `js/cotizador/notario.js` 181–189: `aplicarSello()` avisa «el total no es el que selló la hoja», e inmediatamente las líneas 344–345 lanzan `avisoDelNotario('✓ … autorizó')`. `js/cotizador/venta.js` 276–300 encadena cuatro avisos seguidos: `rvComprometerAnticipo`, «Mandando…», «Venta registrada» con «Abrir plataforma», «No se escribió…». Verificado.
- **Hoy:** el segundo aviso reescribe al primero en el mismo tick. El error de «total distinto al sellado» queda tapado por el «✓ autorizó», y el «Abrir plataforma» de la venta queda tapado por el aviso de campos rechazados.
- **Propuesta:** una pila de hasta dos avisos. Los de error y los que traen botón no se pisan: esperan o se apilan. Los informativos sí se reemplazan.
- **Sale de:** React Bits · SwipeToast (modo en línea, apilable) + Stack.
- **Cómo en vanilla:** una cola dentro de `toast()` con prioridad (error > con acción > informativo). Dos nodos en un contenedor `display:grid`, con `grid-template-rows` de 0fr a 1fr para entrar y salir. `voz()` sigue anunciando cada uno.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** en el teléfono, máximo dos avisos y al ancho del dock, para no tapar el botón principal. El aviso de «total distinto» es el que impide mandar un PDF malo: no puede perderse nunca.

### C4. La cuenta de cobro dice si lleva IVA
- **Dónde:** `cotizador.html` 1018–1021 (`#rv-iva`, de solo lectura) y 1032–1046 (`<select id="rv-cuenta">`). `js/cotizador/venta.js` 70 y 78–80 (`abrirRegistrarVenta()`), 236–239 (`datosParaLaHoja()`). La regla de la hoja está en `puente/hoja-apps-script.gs` 77, 935 y 1022–1025 (`ivaDeCuenta`). Verificado.
- **Hoy:** la cuenta es un `<select>` suelto y el IVA sale de la cotización. Nada avisa si se elige una cuenta sin factura para una cotización con IVA, y después la hoja «realinea» el IVA según la cuenta.
- **Propuesta:** las cinco cuentas como fichas con su etiqueta «con IVA» o «sin IVA», con la que coincide con la cotización primero. Si no coinciden, un aviso ámbar dentro del modal: «la hoja le va a quitar el IVA: el neto registrado no será el del PDF».
- **Sale de:** React Bits · GlideSelect (resaltado que se desliza entre opciones). Alternativa: JellyRadio.
- **Cómo en vanilla:** `role="radiogroup"` con los `.chip` que ya existen y una sola pastilla de resaltado movida con `transform`. El valor sigue en un `<input type=hidden id="rv-cuenta">`, así `datosParaLaHoja()` no cambia.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** la hoja dice que solo Elias BBVA cobra sin factura, y las instrucciones del proyecto dicen que Rul HSBC tampoco lleva IVA. Hay que confirmar la tabla con Elías antes de pintar las etiquetas. Nunca cambiar el IVA en automático: solo avisar.

### C5. El botón que está trabajando lo dice, con reloj
- **Dónde:** `js/cotizador/proceso.js` 463 (`#a-autorizar` en `authRevisionHTML()`), 1686–1721 (`autorizarConfirmado()`, con `_sellando` en la 1705) y 1959 (`renderMobileBar()`). `js/cotizador/notario.js` 124 (tope de 30 s) y 486–508 (`remotaOcupada()`, `autorizarRemota()`). `js/cotizador/venta.js` 269–308 (`mandarALaHoja()`, 15 s) con `cotizador.html` 1086 (`#rv-registrar`). `css/sistema.css` 3452 (`.btn.trabajando`). Verificado.
- **Hoy:** sellar puede tardar hasta 30 s y el botón solo cambia su texto a «Sellando en la hoja…» con opacidad 0.8, así que se ve apagado. «Registrar venta» no cambia en absoluto: solo sale un aviso de 15 s y el botón se puede volver a tocar.
- **Propuesta:** el botón se vuelve una ficha de estado, con un relleno que avanza y un cronómetro («Sellando · 6 s»). Si sale bien, se lava en verde con el código del sello. Si falla, tiembla en rojo y ofrece «Reintentar» sin cerrar nada.
- **Sale de:** React Bits · CallChip (relleno, contador vivo, éxito y error). Alternativa: SlideCommit (su fase de «trabajando»).
- **Cómo en vanilla:** `data-estado="trabajando|ok|mal"` en el botón, un `::before` con `scaleX` por CSS, un `<span>` actualizado con `setInterval` cada 100 ms y un `@keyframes` de sacudida. También `disabled` en `#rv-registrar` mientras se espera.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** es una espera real, no adorno, y se apaga al llegar la respuesta. El festejo del éxito ya está propuesto (#7, neón al autorizar); esto cubre solo el tránsito. El texto blanco tiene que medir 4.5:1 también sobre el relleno a medias.

### C6. Autocompletar clientes que se ve y se entiende
- **Dónde:** `cotizador.html` 311 (`#f-cli` con `<datalist id="clientes-conocidos">`) y 314 (`#cua-aviso`). `js/cotizador/nucleo.js` 737–759 (`clientesConocidos()`, `pintarClientes()`) y 776–787 (`autocompletarCliente()`). Verificado.
- **Hoy:** un `<datalist>` nativo, que en Android sale como tira sobre el teclado, sin teléfono ni pista de cuál «Farmacia San Juan» es. Al elegir, los campos se llenan y solo un aviso abajo dice cuáles.
- **Propuesta:** una lista propia bajo el campo, con nombre, teléfono y la última cotización del cuaderno. Los campos que llenó la app se iluminan un instante, para que se vea qué puso ella.
- **Sale de:** React Bits · GlideSelect (menú con resaltado que se desliza). El lavado de color viene de CodeSlots.
- **Cómo en vanilla:** patrón combobox (`role=combobox`, `aria-activedescendant`, flechas, Enter y Escape) sobre un `popover="manual"`. El resaltado es un solo elemento movido con `translateY`. El lavado es una clase de 600 ms que anima `background-color`.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** respetar `vaciadoAMano()` para no devolver lo que alguien borró a propósito. Renglones de 44 px. En borrador, el importe del cuaderno va difuminado como los demás (`precios-ocultos`).

### C7. Señalar dónde está lo que falta, y dejar de latir en bucle
- **Dónde:** `js/cotizador/partidas.js` 867–874 (`irACampoProy()`), 811–826 (`irAlCandado()`) y 840–845 (`_candTocarPartida()`). `js/cotizador/proceso.js` 591–622 (`llevarAPartida()`, `enfocarHueco()`) y 917–921 (`_llevarAlPaso()`). `js/cotizador/nucleo.js` 209–214 (`_anclarPaso()`). Bucles: `css/sistema.css` 3143 (`.cand-partidas{animation:late … infinite}`) y 3362 (`.cand-cliente.ojo`, clase que `cotizador.html` 288 deja fija en `#cot-antes`). Verificado.
- **Hoy:** llevar al hueco es un scroll más un foco; si el campo cae bajo la barra o bajo el dedo, no se ve adónde llegó. Mientras tanto, la ficha del candado y el aviso «esto ya estaba en pantalla» laten sin parar.
- **Propuesta:** al llegar, cuatro esquinas se cierran sobre el campo, el grupo de chips en ámbar o el bloque del paso, y se van a los 0.6 s. Las fichas del candado laten una vez al aparecer y otra cuando se toca algo bloqueado.
- **Sale de:** React Bits · TargetCursor (cuatro esquinas que se fijan en el objetivo).
- **Cómo en vanilla:** un solo `<div>` fijo con las cuatro esquinas en pseudoelementos. Se mide el destino con `getBoundingClientRect()` después de `scrollend` (o de dos rAF) y se transicionan `transform`, `width` y `height`; `animationend` lo esconde. En las fichas, `infinite` se cambia por una clase de un solo disparo.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** hoy hay cuatro cosas que se mueven solas además del botón de IA: estas dos fichas, el brillo de la barra de completitud y el icono de `.ai-drop` (`vidrio.css` 443). Con movimiento reducido: un aro fijo durante 1 s.

### C8. El teléfono se ve completo antes de chocar con él
- **Dónde:** `cotizador.html` 312 (`#f-tel`). `js/cotizador/proceso.js` 677 (`telIncompleto()`), 683–686 (`faltaTexto()`), 696–704 (`pintarObligatorios()`) y 2005–2014 (`upd()`). Verificado.
- **Hoy:** es texto libre. Que faltan dígitos solo se sabe al intentar continuar (ámbar más aviso), y un «33 1234 567» parece capturado.
- **Propuesta:** formato en vivo «33 1234 5678» y, en el borde derecho del campo, un contador «8/10» que al llegar a 10 se vuelve ✓ con un lavado verde.
- **Sale de:** React Bits · CodeSlots (ranuras que se llenan y se funden al completar). Alternativa: Skiper · skiper106 Smooth caret input (GRATIS).
- **Cómo en vanilla:** en `oninput`, volver a meter los espacios conservando el cursor (`selectionStart` recontado por dígitos). El contador es un `<span>` absoluto dentro de `.fld`, y el estado va en `aria-describedby`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** pegar «+52 33…» o con guiones tiene que seguir funcionando (se cuentan dígitos, como hoy). Los 16 px contra el zoom de iOS ya están puestos.

### C9. La solicitud a Dirección, con su recorrido a la vista
- **Dónde:** `js/cotizador/proceso.js` 172–178 (`esperaHTML()`), 181–182 (insignia de estado), 245–252 (rama pendiente de `renderAuth()`), 200 y 203 (nota «revisado a las…» y `.queue-empty`). `js/cotizador/notario.js` 197–239 (`enviarSolicitud()`), 265 y 281–301 (`VIGILA_MS`, `vigilarSolicitudes()`, `consultarSolicitudes()`). Verificado.
- **Hoy:** una frase y un giro: «Solicitud en el teléfono de Dirección…». No dice cuándo se preguntó por última vez, ni que la app vuelve a preguntar sola cada 15 s.
- **Propuesta:** tres etapas en un renglón (en este teléfono · en la hoja · Dirección decide), cada una con su glifo: anillo punteado, arco que gira, palomita o cruz. Al lado, «revisado hace 9 s». La insignia Pendiente/Autorizada/Rechazada usa el mismo glifo.
- **Sale de:** React Bits · StatusMark (anillo → arco → ✓/✗) + LatticeLoader (reloj vivo).
- **Cómo en vanilla:** un SVG de 16 px con `stroke-dasharray` y `stroke-dashoffset` según la clase. Un `setInterval` de 1 s que corre solo con la pantalla visible (notario.js ya escucha `visibilitychange`).
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** no es lo mismo que #8 (pasos de la IA): esto es la cola del notario. El arco gira solo mientras hay una espera real (`_esperaViva()`). Con movimiento reducido: arco quieto y solo el texto.

### C10. El botón principal cambia de rótulo sin brincar, y dice qué falta
- **Dónde:** `js/cotizador/proceso.js` 1922–1997 (`renderMobileBar()`, con la rama del cliente en 1932–1944), 1053–1059 (`pintarCierrePaso1()`), 714–728 (`exigirDatosCliente()`) y 847 (`continuarAPartidas()`). Verificado.
- **Hoy:** el rótulo del dock y el de «Continuar a partidas» se reescriben de golpe con `innerHTML`, en cada tecla. Si faltan datos, el botón no cambia y el porqué sale en un aviso aparte.
- **Propuesta:** cuando cambia el siguiente paso (Autorizar → Generar PDF → Enviar por WhatsApp…), el rótulo hace un fundido y el ancho lo acompaña. Si se toca con datos faltantes, el propio botón dice «Falta el teléfono» durante 1.5 s, con una sacudida corta, y vuelve.
- **Sale de:** React Bits · BellToggle (fundido del rótulo y desenrollado con `clip-path`). La sacudida viene de SlideCommit.
- **Cómo en vanilla:** comparar el texto nuevo con el actual antes de tocar el DOM. Dos `<span>` superpuestos con transición de `opacity` y `filter:blur`, y un `@keyframes` de ±4 px tres veces.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** como hoy se repinta en cada tecla, hay que animar solo cuando el texto cambia de verdad. El relleno de este botón sigue siendo el único de la pantalla.

### C11. Copiar y ocultar del PDF confirman en el mismo botón
- **Dónde:** `cotizador.html` 450 (`#s-sub-copiar`) y 327 («Copiar link»). `js/cotizador/proceso.js` 1917–1921 (`copiarSubtotal()`) y 2034–2037 (`copiarLinkDirRaw()`). `js/cotizador/partidas.js` 603 (`.pdf-vis` siempre pinta `i-ojo`) y 382–398 (`setShowInPdf()`). `css/sistema.css` 2138 (`.pdf-vis.off{opacity:.4}`). Verificado.
- **Hoy:** «Copiar» no cambia, y la confirmación sale abajo a la izquierda, lejos del número. El ojo de «ocultar del PDF» es el mismo icono prendido o apagado y solo baja al 40 % de opacidad, aunque `#i-ojo-off` ya está en el sprite.
- **Propuesta:** «Copiar» pasa a «✓ Copiado» durante 1.5 s y vuelve. El ojo se tacha (cambia a `i-ojo-off`) al ocultar.
- **Sale de:** Skiper · skiper99 Animated icons 002 (GRATIS). El rótulo, de React Bits · BellToggle.
- **Cómo en vanilla:** dos `<use>` superpuestos con transición de `opacity` o `clip-path`, o la raya del tachado con `stroke-dashoffset`. `aria-pressed` en el ojo.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** la misma hoja dice que el estado no se comunica con opacidad (deja el texto en 2:1): el ojo apagado tiene que medir 4.5:1. El aviso se queda para el lector de pantalla (`voz()`).

### C12. El riel de cuatro pasos enseña cuánto va y el estado de cada paso
- **Dónde:** `cotizador.html` 249–282 (`#pasos`). `js/cotizador/proceso.js` 1087–1129 (`pintarPasos()`; el cambio de número a ✓ está en la 1122). `css/sistema.css` 697–712 (`.hecho .n::after{content:'✓'}` en la 703) y 3161–3171. `css/vidrio.css` 140–173. Verificado.
- **Hoy:** el número cambia a un ✓ de texto de golpe, «en espera» es solo el número en ámbar, y nada une los cuatro pasos (las flechas están en `display:none`).
- **Propuesta:** un filete fino dentro del riel que se llena de 0 a 100 % según los pasos hechos (se mueve solo al autorizar o al entregar). El círculo de cada paso se vuelve un glifo de estado: anillo punteado ámbar (todavía no), relleno (actual) y palomita dibujada (hecho).
- **Sale de:** React Bits · Stepper (conectores que se llenan) + StatusMark.
- **Cómo en vanilla:** `.pasos::after` con `transform:scaleX(var(--avance))`, y `--avance` escrito desde `pintarPasos()`. Un SVG en línea dentro de `.n`, con `stroke-dasharray`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** a 320 px las pestañas que no son la actual quedan solo con su número, así que el glifo debe caber en 22 px. `pintarPasos()` corre en cada tecla: animar solo cuando cambia el estado.

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

### C16. Los pliegues abren y cierran con su altura
- **Dónde:** `cotizador.html` 339–363 (`#pdf-extra-box`). `js/cotizador/proceso.js` 302–308 (`details.otras-salidas`). `js/cotizador/partidas.js` 1233–1244 (`toggleItemAuth()`, que usa `display:none`). `css/sistema.css` 1389–1394. Verificado.
- **Hoy:** los `<details>` y los renglones del ajuste por partida aparecen y desaparecen de golpe y empujan todo lo de abajo.
- **Propuesta:** que se abran con la altura animada, con la flecha girando a la vez, en 200 ms.
- **Sale de:** Vengeance · FAQ Accordion. Alternativa: Skiper · skiper103 Bouncy accordion (PRO), sin el rebote.
- **Cómo en vanilla:** `interpolate-size:allow-keywords` más `::details-content{transition:height, content-visibility allow-discrete}`. En `.ia-body`, `grid-template-rows` de 0fr a 1fr.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** `renderAuth()` ya reabre «otras salidas» a mano (líneas 325–327): la animación no debe dispararse en esa reapertura.

### C17. El anticipo en un toque, y partido a la vista
- **Dónde:** `cotizador.html` 468–474 (`#f-anti`, `#s-anti-rest`). `js/cotizador/proceso.js` 90–108 (`renderSummary()`), 2096 y 2109–2124 (oyentes de `input` y `change`). Verificado.
- **Hoy:** un campo numérico y un renglón gris con «Resta al entregar». Pactar otro porcentaje se hace con calculadora.
- **Propuesta:** una barra de dos tramos, «Hoy $X · Al instalar $Y», que se arrastra, con marca en el 50 % sugerido y tope en el total. El campo sigue ahí para teclear.
- **Sale de:** React Bits · WakeSlider. Alternativa: ElasticSlider.
- **Cómo en vanilla:** Pointer Events sobre la barra. Escribe en `#f-anti` y despacha `input` y `change`, así el acotado y `antiManual` siguen saliendo del código de hoy. Imán a pesos redondos.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** la regla es 50 % de anticipo y el resto a 2 días hábiles de la instalación, con excepción arriba de $60,000. Con factura, el anticipo lleva IVA (`precioFinal()` ya lo incluye). Difuminado en borrador.

### C18. El autorizador ajusta el precio arrastrando, con topes que se sienten
- **Dónde:** `js/cotizador/proceso.js` 444–450 (`#a-precio` en `authRevisionHTML()`) y 475–501 (`updPrecioAuth()`). `cotizador.html` 603 (`#rem-precio`) y `js/cotizador/notario.js` 471–484 (`abrirRevisionRemota()`, `pintarRemotaNeto()`). Verificado.
- **Hoy:** se teclea el subtotal y abajo se leen el neto y «Descuento: $X (N%)». Regatear delante del cliente es teclear y borrar.
- **Propuesta:** un deslizador de −20 % a +10 % del calculado, con imanes en 0, −5, −10 y −15 % y en cientos redondos. Al arrastrar se escribe el campo y la frase del ajuste se actualiza en vivo.
- **Sale de:** React Bits · ElasticSlider.
- **Cómo en vanilla:** Pointer Events con `setPointerCapture` y resistencia elástica con `transform` más allá de los extremos. Escribe `#a-precio` y llama a `updPrecioAuth(+v,subCalc)`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** el precio se decide SIN IVA: el campo es el subtotal. No vibrar en los imanes, porque `vibrar()` está reservado para autorizar, borrar y rechazar (`notario.js` 524–534). El campo sigue siendo la fuente del número.

### C19. La barra de completitud avanza, pero no brilla para siempre
- **Dónde:** `cotizador.html` 418–422 (`.prog-box`). `js/cotizador/partidas.js` 700–725 (`updProg()`) y 793–803 (`pintarPendiente()`). `css/sistema.css` 3388–3402 (`#prog-bar::after{animation:brillo 2.4s linear infinite}`). Verificado.
- **Hoy:** mientras no llega al 100 %, un destello recorre la barra en bucle. El renglón «Falta el teléfono ›» cambia de texto de golpe.
- **Propuesta:** el destello pasa una sola vez, cuando el porcentaje SUBE. El renglón de lo que sigue hace un fundido vertical cuando cambia.
- **Sale de:** Vengeance · Flip Fade Text para el renglón. React Bits · ShinyText, con un solo barrido.
- **Cómo en vanilla:** `updProg()` guarda el porcentaje anterior y pone una clase de un solo disparo. Dos `<span>` con `translateY` y `opacity`, solo si el texto cambió.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** la regla dice que solo se mueve sola una pieza, y hoy esta barra es la segunda. `updProg()` corre en cada tecla.

### C20. La cotización que se guarda vuela a donde quedó
- **Dónde:** `js/cotizador/proceso.js` 1792–1840 (`nueva()`). `js/cotizador/arranque.js` 107–122 (`separarDeLaCotizacionAnterior()`). `js/cotizador/venta.js` 423–436 (`registrarGanada()`). Destinos: `cotizador.html` 168 (Historial) y 198 (Plataforma). Verificado.
- **Hoy:** al vaciar, o al abrir con la anterior ya guardada, la pantalla queda en blanco y un aviso dice dónde quedó. El miedo documentado es que se borró.
- **Propuesta:** una tarjetita fantasma con folio y cliente se encoge hacia el botón Historial (o hacia Plataforma al registrar la venta), y el botón da un pulso.
- **Sale de:** React Bits · FolderFloat. Alternativa: Vengeance · Folder Preview.
- **Cómo en vanilla:** clonar un `<div>` fijo con el rectángulo de la tarjeta y moverlo con `el.animate()` (Web Animations, nativo) hasta el rectángulo del botón.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** solo cuando de verdad quedó guardada (`copiaGuardadaDeQ()`). Un borrador que se vacía no vuela: su vuelta es «Deshacer». Empotrado, `.btn-pf` está oculto y no hay destino. Con movimiento reducido: nada.

### C21. Una isla de estado junto al folio
- **Dónde:** `cotizador.html` 199–202 (`#folio`, `#sin-senal`). `js/cotizador/nucleo.js` 631–640 (`pintarConexion()`). `css/sistema.css` 3461–3463. Estados: `js/cotizador/proceso.js` 1685 (`_sellando`) y `notario.js` 274–280 (`_foliosEsperando()`). Verificado.
- **Hoy:** «Sin señal» aparece y desaparece de golpe. Que la hoja está sellando, o que hay una solicitud esperando, solo se ve bajando hasta la columna del dinero.
- **Propuesta:** una sola pastilla junto al folio que se desenrolla para decir lo que pasa fuera de la pantalla (sin señal · sellando · esperando a Dirección) y se enrolla sola al terminar.
- **Sale de:** React Bits · BellToggle. Alternativa: Skiper · skiper2 Dynamic island (PRO).
- **Cómo en vanilla:** `clip-path:inset()` transicionado entre el ancho del icono y el del rótulo, dentro de un solo `role="status"`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** la barra de arriba está medida al píxel (`css/sistema.css` 790–890): hasta 560 px, solo el icono y sin crecer. No se mueve sola: cambia cuando cambia el estado.

### C22. Lo que llega a la cola entra, lo que se quita se va
- **Dónde:** `js/cotizador/proceso.js` 202–218 (cola en `renderAuth()`), 555–577 y 638–646 (`pintarFaltantes()`, `quitarDesdeFaltantes()`). `js/cotizador/notario.js` 426–456 (`cargarPendientesRemotas()`, `remotasHTML()`). Verificado.
- **Hoy:** cuando llega una solicitud de otro teléfono, la lista se repinta entera y nada distingue la nueva. En el aviso de partidas sin terminar, «Quitar» desaparece el renglón de golpe.
- **Propuesta:** la solicitud nueva entra deslizándose y queda marcada como «nueva» unos segundos. La quitada se cierra hacia arriba antes del repintado.
- **Sale de:** React Bits · AnimatedList.
- **Cómo en vanilla:** un `Set` con los folios ya pintados, y la clase de entrada solo para los nuevos. La salida con `grid-template-rows:0fr` y `transitionend`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** `renderAuth()` corre seguido (por ejemplo, en cada tecla del anticipo): la marca de «nueva» no puede reiniciarse en cada repintado.

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

### C24. El folio que cambia se nota
- **Dónde:** `cotizador.html` 199 (`#folio`). Cambia en `js/cotizador/proceso.js` 1823 (`nueva()`) y 1337 (`cerrarEdicionCliente()`). Se pinta en `js/cotizador/historial.js` 1757–1770 (`pintarFolio()`). Verificado.
- **Hoy:** el folio se reescribe sin ninguna señal, y el error documentado es capturar otro cliente encima del mismo folio.
- **Propuesta:** al pasar a otro número, sus caracteres voltean una vez, como un tablero de salidas.
- **Sale de:** React Bits · SplitFlapText. Alternativa: Vengeance · Flip Text.
- **Cómo en vanilla:** un `<span>` por carácter con `rotateX`, escalonado cada 30 ms, solo si el folio anterior no estaba vacío.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** `pintarFolio()` vive fuera de mi zona. La marca «sin guardar» no debe voltear.

### C25. Los botones de solo icono dicen su nombre con el dedo
- **Dónde:** `cotizador.html` 166–171 y 198 (Deshacer, Clientes, Historial, Tema, Plataforma). `css/sistema.css` 886–890 (hasta 560 px quedan solo con icono). `js/cotizador/partidas.js` 602–604 (duplicar, ojo, borrar). `js/cotizador/proceso.js` 1927–1929 (`.mbar-undo`). Verificado.
- **Hoy:** el nombre solo existe en `title` y `aria-label`, que en un teléfono no se ven.
- **Propuesta:** mantener presionado un icono muestra su nombre en una etiqueta. Con ratón, la primera tarda un poco y las vecinas salen al instante.
- **Sale de:** React Bits · WarmTooltip. Alternativa: Skiper · skiper101 Custom tooltip (GRATIS).
- **Cómo en vanilla:** `popover="manual"` posicionado con `getBoundingClientRect()`. Se abre con 450 ms de `pointerdown` y se cancela el `click` que viene después.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** en `.del`, el toque largo nunca puede terminar borrando la partida.

### C26. La hoja del teléfono: el velo sigue al dedo
- **Dónde:** `js/cotizador/nucleo.js` 591–629 (arrastrar para cerrar hojas); `css/sistema.css` 4881–4888. Verificado.
- **Hoy:** el gesto ya existe y la hoja baja con el dedo, pero el velo de detrás no cambia y hacia arriba no hay resistencia.
- **Propuesta:** el velo se aclara conforme baja la hoja. Si se jala hacia arriba, cede unos píxeles con resistencia y regresa.
- **Sale de:** React Bits · SwipeToast (descartar por distancia o por latigazo).
- **Cómo en vanilla:** en `touchmove`, escribir `--arrastre=dy/altura` en el `.modal-bg` y calcular su `background-color` con `calc()`. Hacia arriba, `dy` multiplicado por 0.2, hasta 12 px.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** solo desde el encabezado o con el cuerpo arriba, como ya funciona hoy.

### C27. El estado vacío de partidas empieza el trabajo
- **Dónde:** `js/cotizador/partidas.js` 539–543 (`.empty`); `css/sistema.css` 1051. Verificado.
- **Hoy:** un recuadro punteado con una frase que enumera los cinco tipos.
- **Propuesta:** los cinco tipos como mosaicos tocables, con su «desde $30/cm» del catálogo, que crean la partida ya del tipo elegido. Más una línea hacia «Cotizar con IA».
- **Sale de:** Vengeance · Highlight Grid.
- **Cómo en vanilla:** una rejilla de `button` que llama a `addItem()` y `setTipo()`, con un solo resaltado movido con `transform`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** hoy casi nunca se ve, porque el arranque siembra una partida en blanco. El botón de IA sigue siendo lo único que se mueve solo.

#### Descartado en esta zona
- React Bits · SquishSwitch para el IVA y la iluminación: arrastrar un interruptor que mueve el 16 % del precio invita al error, y el actual ya da 44 px.
- React Bits · HalftoneReveal / DitherVeil para espiar precios: pintan en canvas por cada importe, pesan en gama media, y el `blur(7px)` ya resuelve sin mover la caja.
- React Bits · ClickSpark / StarBorder / ElectricBorder al registrar la venta: el momento de festejo ya es #7, y más chispas serían otra pieza moviéndose.
- React Bits · JellyRadio y los rebotes en los chips de material: `css/sistema.css` 292–300 documenta que un rebote sobre una pieza plana se lee como fallo de pintado.
- React Bits · Dock / Vengeance · Glass Dock para la barra de abajo: la ampliación por cercanía del cursor no existe con el dedo.
- CountUp en el importe de cada partida (`.lt`): cambia en cada tecla, y veinte cifras rodando son ruido. El odómetro se queda solo en el total.
- View Transitions para el vuelo del total: ya existe un FLIP hecho a mano (`proceso.js` 924–999) que funciona.
- Animmaster Lib: el código solo se ve después de pagar y está hecho con GSAP/Three; no se puede portar ni medir sin verlo.

---

## Zona 2 · Cotizador — herramientas y entrega (H)

### H1. Resumen de lo que leyó la IA antes de cerrar el modal
- **Dónde:** `js/cotizador/ia.js` líneas 812–848 (`aiAnalyze()`, el `setTimeout(()=>{…aiClose()},1500)` de la 848) y 1013–1023 (`applyAi()`); `cotizador.html` 533 (`#ai-status`). Verificado.
- **Hoy:** mete las partidas directo en `Q.items`, pinta «Borrador generado» y el modal se cierra solo a los 1,5 s. Lo que faltó se dice con un número en un aviso («una medida se quedó sin partida — revisa cuál falta»).
- **Propuesta:** el modal no se cierra. Enseña un renglón por partida detectada (tipo · medida · piezas · material) con ✓ si ya cotiza o «!» ámbar si falta material o acabado. Si venía del escalador, cada medida lleva ✓/✕ según si alguna partida usa esa cifra. Lo que la IA leyó distinto (`_aiLeido`) aparece con un botón «Usar». Hay un solo botón con relleno: «Ver partidas».
- **Sale de:** React Bits · StatusMark (la marca de cada renglón) + AnimatedList (la entrada, recortada).
- **Cómo en vanilla:** `<ol>` generada desde `nuevos` (que `applyAi()` devuelva el arreglo). La marca va por clases CSS y la entrada usa la animación `entra` que ya existe. El cruce medida↔partida compara `cm` contra `altura/ancho/alto` con ±0,05.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** la escalera de retardos se quitó a propósito (comentario junto a `@keyframes entra`, sistema.css 3880–3886), así que todo entra en ≤240 ms. El «!» ámbar va con texto, no solo con color. Un solo botón con relleno.

### H2. WhatsApp: decir a qué número va y dejar ver el mensaje antes de salir
- **Dónde:** `js/cotizador/entrega.js` 112–138 (`telWhatsApp()`), 139–162 (`mensajeWhatsApp()`), 163–184 (`enviarPorWhatsApp()`) y 284 (pista fija del hito `wa`); `js/cotizador/proceso.js` 356–382 (`entregaHTML()`). Verificado.
- **Hoy:** la pista siempre dice «adjunta el PDF que guardaste». El aviso de «número no válido / sin teléfono» sale después de `window.open` (líneas 170 y 181), cuando WhatsApp ya abrió sin chat.
- **Propuesta:** la pista del hito dice el número normalizado («a +52 33 2813 0092 · adjunta el PDF») o, en ámbar, «el teléfono no parece válido: WhatsApp abrirá sin chat», antes de tocar. Junto al hito, un botón chico «Ver mensaje» abre una burbuja con el texto exacto y «Copiar».
- **Sale de:** Skiper · skiper101 Custom tooltip (GRATIS); alternativa Vengeance · Animated Tooltip.
- **Cómo en vanilla:** atributo `popover` + `popovertarget`; en teléfono se estiliza como hoja inferior fija. El texto va con `white-space:pre-wrap`. La pista se calcula en `entregaHTML()` con `telWhatsApp(Q.tel)`.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** el hito sigue abriendo de un toque; el vistazo es opcional. Hoy la pista solo sale en el paso que toca, y el número debe verse siempre. El botón chico de 44 px.

### H3. Los tres hitos como riel conectado, y el mismo riel en el historial
- **Dónde:** `js/cotizador/proceso.js` 356–382 (`entregaHTML()`); `js/cotizador/entrega.js` 282–286 (`HITOS`) y 296–313 (`marcarHito()`); `js/cotizador/historial.js` 317–326 (`hitosHist()`); `css/sistema.css` 1343–1362 (`.hito*`) y 2260–2262 (`.hentry-hitos`). Verificado.
- **Hoy:** tres botones apilados sin nada que los una. En el historial los hitos son una línea de texto: «✓ Propuesta · 27 ago · PDF generado · 28 ago…».
- **Propuesta:** un conector vertical entre PDF → WhatsApp → Venta que se llena en verde al marcarse el anterior, para leer de un vistazo «vas en el 2 de 3». En cada entrada del historial, cuatro puntos (Propuesta · PDF · Chat · Venta), llenos o huecos, con la fecha en el `title`: se ve cuáles quedaron a medias sin tener que leer.
- **Sale de:** React Bits · Stepper (versión vertical y mini).
- **Cómo en vanilla:** `<ol>` con `::before` como segmento y `transform:scaleY()` en transición al cambiar `.hito-hecho`. Los puntos llevan un `aria-label` con la lista completa.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** «un solo botón lleva color», así que el conector va en `--ok` y no en azul de marca. El punto lleno lleva además icono o letra, no solo color. La palomita que se dibuja (#6) no se repite aquí.

### H4. Lectura en centímetros pegada a la lupa
- **Dónde:** `js/cotizador/escalador.js` 519–555 (`SC_LOUPE`, `scLoupe()`), 673–677 (cota provisional en `scScene()`) y 1077–1096 (`scMoveHandle()`); `css/sistema.css` 1943–1944 (`.sp-loupe`). Verificado.
- **Hoy:** la lupa solo enseña foto y retícula. El número de la medida se dibuja sobre la línea, que en el teléfono queda debajo del dedo.
- **Propuesta:** una etiqueta bajo el círculo con la cifra viva («42.5 cm», «Referencia», «Medida 3 · 118 cm» al arrastrar un extremo). Así se lee mientras se mueve el dedo y se suelta en la buena.
- **Sale de:** React Bits · Crosshair (lectura que sigue al puntero; en escritorio, además, las dos líneas finas de alineación).
- **Cómo en vanilla:** un `<span>` hermano de `#sc-loupe` (el círculo tiene `overflow:hidden`), colocado dentro del mismo `scLoupe()`. La cuenta es la de la línea 675, o `h.item.cm` cuando se arrastra un extremo.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** cifras tabulares (`--f-cifra`), blanco sobre marino ≥4,5:1. Sin animación propia: se mueve porque se mueve el dedo.

### H5. La lupa avisa cuando el punto se pega a una guía o a un extremo
- **Dónde:** `js/cotizador/escalador.js` 533–555 (`scLoupe()`), 595–622 (`scSceneLite()`, donde las guías siempre salen punteadas), 982–998 (`scSnapGuides()`) y 1047–1076 (`scHandleHit()`). Verificado.
- **Hoy:** el pegado solo se marca en el lienzo principal (guía sólida, 724–728), que está tapado por la mano. Dentro de la lupa la guía se ve igual, pegada o no.
- **Propuesta:** con `SC.snapH/snapV` o `SC.dragH` activos, la cruz de la lupa se vuelve cuatro esquinas que se cierran sobre el punto y la guía pegada se pinta sólida. Al engancharse, una vibración corta.
- **Sale de:** React Bits · TargetCursor.
- **Cómo en vanilla:** dibujar cuatro «L» en el canvas de la lupa, con un radio que se interpola en 120 ms solo cuando cambia el estado (detección de flanco), dentro del repintado que ya hace `scMove`. La vibración es `vibrar([6])`, de `notario.js` 528.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** nada de bucle `requestAnimationFrame` propio, porque el lienzo ya se repinta con cada movimiento del dedo. `vibrar` ya respeta `prefers-reduced-motion`.

### H6. Deshacer con mecha visible que se pausa al salir de la app
- **Dónde:** `js/cotizador/nucleo.js` 670–687 (`toast()`), con llamadas en `js/cotizador/historial.js` 181–192 (`borrarDeHistorial()`) y `js/cotizador/escalador.js` 1135–1138 (escala ajustada) y 1550–1557 (`scDelMedida()`); `css/sistema.css` 1403–1416. Verificado.
- **Hoy:** el aviso con «Deshacer» dura 6–8 s sin decir cuánto queda, y el reloj sigue corriendo aunque el vendedor esté en WhatsApp.
- **Propuesta:** una línea fina al pie del aviso que se consume exactamente en `dur`. Se detiene con el dedo o el foco encima y mientras la pestaña está oculta, y al volver retoma lo que faltaba.
- **Sale de:** React Bits · SwipeToast (la mecha); alternativa FuseButton.
- **Cómo en vanilla:** `<i class="toast-mecha">` con `animation:mecha var(--dur) linear` sobre `transform:scaleX`, y `animation-play-state:paused` en `:hover` y `:focus-within`. En `visibilitychange` se guarda lo que falta con `performance.now()` y se rearma `_toastT`.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** el contrato de `docs/SISTEMA-DE-DISENO.md` §6.2 («la ventana de deshacer dura lo que dura el aviso»): mecha y temporizador son el mismo número. Con reduced-motion, los segundos en texto en vez de una barra que se desliza.

### H7. La miniatura «se lee» mientras la IA trabaja, y el error trae «Reintentar»
- **Dónde:** `js/cotizador/ia.js` 237–241 (`aiPintarTrabajando()`), 380–396 (`aiPintarArchivo()`), 499–506 (`aiStatus()`) y 849–863 (rama de error); `cotizador.html` 525 y 531–533; `css/sistema.css` 1567–1573 (`.ai-pick`) y 3735–3737 (giro de `.ai-status.work`). Verificado.
- **Hoy:** durante 10 s a 1 min solo gira un punto junto a una frase, y el archivo queda en una miniatura de 52 px. El error es un párrafo rojo y hay que volver a tocar «Analizar y cotizar».
- **Propuesta:** al analizar, la ficha del archivo crece a una vista de proporción reservada, con una banda de luz que la recorre y una pastilla de etapa (Preparando · Analizando · Reintentando · Lista). Si falla, la imagen se oscurece y encima queda «Reintentar» con el motivo corto.
- **Sale de:** React Bits · RefineFrame; alternativa CallChip (sacudida y glifo de reintento en el error).
- **Cómo en vanilla:** clase `.ai-pick.trabajando` con `aspect-ratio`. La banda va en `::after` y se mueve con `transform`, la misma técnica que `ia-barrido`. La pastilla la alimenta `aiStatus()` y el botón llama a `aiAnalyze()`.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** solo se mueve mientras hay análisis (lo dispara el usuario) y se apaga al terminar. Nada de `filter:blur` animado en gama media. El velo de error va sobre la imagen, nunca sobre texto (regla 4.3).

### H8. Filtros rápidos del historial por lo que falta entregar
- **Dónde:** `js/cotizador/historial.js` 226–238 (`indexarHistorial()`, que ya indexa los hitos) y 249–306 (`pintarHistorial()`); `cotizador.html` 571–574 (`.hist-search-bar`). Verificado.
- **Hoy:** solo hay un buscador de texto. «¿Cuáles autoricé y no he mandado?» no tiene respuesta directa.
- **Propuesta:** fichas bajo el buscador (Todas · Sin PDF · Sin enviar · Sin venta · Este mes), cada una con su conteo. Se combinan con la búsqueda y el contador dice «3 de 41».
- **Sale de:** Vengeance · Search Modal (etiquetas de filtro removibles con conteo en vivo).
- **Cómo en vanilla:** botones con `aria-pressed` y un predicado sobre `hitosDe(e.folio)` antes del `includes(q)`. Los conteos se calculan una vez al abrir.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** 44 px por ficha. La ficha activa no es el botón con relleno de la pantalla. Si se arma como `.seg`, aplica la #2 (ficha que se desliza).

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

### H11. Calibración como tres pasos visibles
- **Dónde:** `cotizador.html` 857–879 (`#sc-sec-calib`) y 820 (`#sc-calib-badge`); `js/cotizador/escalador.js` 1315–1330 (rama de referencia de `scCommitLine()`), 1352–1385 (`scConfirmCalib()`) y 1386–1398 (`scResetCalib()`). Verificado.
- **Hoy:** el avance se deduce de qué bloque aparece (ayuda → fila de cm con destello `.sc-flash` → caja verde) y de la pastilla «Sin calibrar».
- **Propuesta:** arriba de la sección, «1 Marca 2 puntos · 2 Escribe cuánto mide · 3 Mide», con el paso actual marcado y los ya hechos con palomita. «Re-calibrar» lo reinicia.
- **Sale de:** React Bits · Stepper.
- **Cómo en vanilla:** `<ol>` con `aria-current="step"`, y estado derivado de `SC.mode`, `SC.refLine` y `SC.nativePxPerCm` en esas tres funciones. Mismo CSS que el riel del punto 3.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** solo el paso actual en azul de marca; el resto, neutro. Sin movimiento propio.

### H12. Abrir un PDF dentro del lienzo, con cronómetro y error en su sitio
- **Dónde:** `js/cotizador/escalador.js` 101–114 (`usarImagenAIEnScaler()`) y 256–293 (`scLoadPDF()`, con `toast('Cargando PDF…','',8000)`); `js/cotizador/vectorizador.js` 119–149 (`vtLoadPDF()`); `cotizador.html` 833–838 y 682–687 (`.sp-overlay`). Verificado.
- **Hoy:** el primer PDF baja pdf.js de cdnjs y renderiza la hoja con solo un aviso abajo, mientras el lienzo sigue diciendo «Carga una imagen». El error llega en otro aviso.
- **Propuesta:** el mismo recuadro del lienzo pasa a «Abriendo el PDF · 2,3 s», con una rejilla que late por fases y termina en ✓ o ✕. Si falla (sin conexión, archivo dañado), el motivo y «Elegir otro archivo» quedan ahí mismo.
- **Sale de:** React Bits · LatticeLoader.
- **Cómo en vanilla:** 3×3 celdas con `animation-delay` por `--i`, un `setInterval` de 100 ms para el reloj y estados `.hecho` / `.falla` en `.sp-overlay`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** solo se mueve mientras carga; con reduced-motion la rejilla queda quieta. Limpiar el intervalo en `finally`.

### H13. Enseñar qué partidas se van a reemplazar al apagar «Conservar»
- **Dónde:** `js/cotizador/ia.js` 185–200 (`toggleAiMerge()`, `aiPintarMerge()`); `cotizador.html` 527–530 (`#ai-merge-box`). Verificado.
- **Hoy:** al apagarlo solo dice «⚠️ tus 3 partidas ya capturadas se reemplazarán».
- **Propuesta:** debajo, la lista corta de esas partidas («Letras 3D · 40 cm · 6 letras»…), que se tacha de izquierda a derecha al apagar y se destacha al encender.
- **Sale de:** React Bits · SpringCheck (el tachado del renglón).
- **Cómo en vanilla:** renglones con una descripción corta al estilo de `histDsc()`. El tachado es un `background` lineal de 1,5 px que crece en `background-size` de 0 a 100 % en 200 ms.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** no bajar el texto con `opacity` (regla 4.3): tachado y ámbar medido.

### H14. Ver el plano a pantalla completa con zoom de dos dedos
- **Dónde:** `js/cotizador/historial.js` 163–168 (`openHistImg()`); `js/cotizador/partidas.js` 1202–1211 (`openAiFile()`, `closeLightbox()`); `cotizador.html` 538–541; `css/sistema.css` 1603 (`.lightbox-img`). Verificado.
- **Hoy:** la imagen aparece ajustada a la pantalla, sin zoom ni transición. En el teléfono, un plano con cotas no se lee.
- **Propuesta:** la imagen crece desde la miniatura tocada hasta el centro. Dentro se puede pellizcar, arrastrar y hacer doble toque para 2×. Al cerrar regresa a su sitio.
- **Sale de:** React Bits · DomeGallery (solo el «enlarge» de la miniatura con velo).
- **Cómo en vanilla:** FLIP con el rect de la miniatura (la misma técnica de `_volarTotal()`), y Pointer Events para escala y traslado reusando la cuenta de `scGestureStart/scGestureMove` (`escalador.js` 482–517).
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** `touch-action:none` solo sobre la imagen. Botón de cerrar de 44 px. Con reduced-motion, sin vuelo.

### H15. Resaltar lo que coincide en el historial y en los cuadernos
- **Dónde:** `js/cotizador/historial.js` 249–306 (`pintarHistorial()`) y 632–679 (`pintarCuadernos()`). Verificado.
- **Hoy:** el filtro busca en folio, cliente, teléfono, total y partidas, pero no se ve por qué salió cada resultado, sobre todo si coincidió en una partida o en el teléfono.
- **Propuesta:** envolver en `<mark>` el tramo que coincide en folio, nombre, subtítulo y descripción de partidas.
- **Sale de:** Vengeance · Search Modal (resultado filtrado en vivo).
- **Cómo en vanilla:** escapar con `esc()` primero y luego reemplazar la coincidencia (sin acentos) por `<mark>…</mark>`. Estilo: `mark{background:var(--a-suave);color:var(--tinta)}`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** `--a-claro` y `--a3` no llevan texto: el fondo es `--a-suave` con tinta completa, medido a 4,5:1. Escapar antes de marcar.

### H16. Entradas del historial compactas que se despliegan
- **Dónde:** `js/cotizador/historial.js` 263–302 (plantilla `.hentry`, con la `.htable` completa siempre abierta e imagen en 265–267); `css/sistema.css` 1682–1699. Verificado.
- **Hoy:** cada entrada trae imagen de 96 px, tabla de todas las partidas, hitos, total y nota. Con 40 cotizaciones es un pergamino.
- **Propuesta:** por defecto se ven folio, nombre, total, hitos y «3 partidas ▾»; la tabla y la nota se abren con un toque. Las imágenes llevan `loading="lazy" decoding="async"`.
- **Sale de:** Vengeance · FAQ Accordion.
- **Cómo en vanilla:** `<details>` con `grid-template-rows` de `0fr` a `1fr`, o `interpolate-size:allow-keywords` donde exista.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** `summary` de 44 px. «Abrir y editar» y «Duplicar» siguen a la vista. Con reduced-motion abre sin transición.

### H17. Estados vacíos con salida
- **Dónde:** `js/cotizador/historial.js` 258–261 (`pintarHistorial()`), 652–655 (`pintarCuadernos()`) y 939–945 (`respaldoTexto()`). Verificado.
- **Hoy:** «Aún no hay cotizaciones autorizadas» y «Ninguna cotización coincide con «x»», en texto gris y sin acción.
- **Propuesta:** en el vacío de verdad, una ilustración quieta de carpeta y, si el aparato nunca se ha respaldado, «Restaurar un respaldo» (el caso del teléfono nuevo). Sin coincidencias: «Borrar búsqueda» y «Buscar en clientes».
- **Sale de:** Vengeance · Folder Preview (solo la ilustración de carpetas apiladas, estática).
- **Cómo en vanilla:** plantilla con dos tarjetas desplazadas en CSS y el icono `i-historial` del sprite. Los botones llaman a `pedirRestaurar()` o limpian `#hist-search`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** un solo botón con relleno. La ilustración no se mueve.

### H18. Copiar para Canva, Gemini o SVG confirma en el mismo botón
- **Dónde:** `js/cotizador/entrega.js` 410 (`copiarParaCanva()`) y 466 (`copiarParaGemini()`); `js/cotizador/vectorizador.js` 1176–1178 (`vtCopiarSVG()`); `js/cotizador/nucleo.js` 699–706 (`copiarTexto()`); `js/cotizador/proceso.js` 302–307. Verificado.
- **Hoy:** el botón no cambia. La confirmación es un aviso al pie de la pantalla, lejos de donde se tocó y fuera del pliegue «Otras salidas».
- **Propuesta:** el rótulo del botón pasa a «✓ Copiado» con un fundido corto y vuelve a los 2 s. El aviso de abajo se queda solo para el lector de pantalla.
- **Sale de:** React Bits · BellToggle (el rótulo que se funde y el estado apretado como recibo); alternativa Vengeance · Flip Text.
- **Cómo en vanilla:** `copiarTexto()` recibe el botón, le pone la clase `.copiado` (cruza dos `<span>` por `opacity`) y un `setTimeout` lo regresa.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** es distinto de la #6 (palomita que se dibuja). `voz()` sigue anunciando. Con reduced-motion cambia sin fundido.

### H19. Plazo de taller: marcar el sugerido y decir por qué
- **Dónde:** `js/cotizador/historial.js` 1557–1572 (`plazoSugeridoCot()`) y 1576–1591 (`pintarPlazo()`); `js/cotizador/partidas.js` 880–887 (`chip()`, cuyo parámetro `extra` no se usa aquí); `cotizador.html` 353–355. Verificado.
- **Hoy:** si se elige a mano, la nota dice «Tócalo otra vez para volver al propuesto», pero no se ve cuál era el propuesto ni de dónde sale.
- **Propuesta:** el chip sugerido lleva «sugerido» en pequeño, y un «?» abre la razón: «Letras 3D con iluminación · 2 tipos de trabajo · lado mayor a 2,44 m → 2.5 semanas». Delante del cliente, eso sustenta el plazo.
- **Sale de:** Skiper · skiper101 Custom tooltip (GRATIS); alternativa React Bits · WarmTooltip.
- **Cómo en vanilla:** que `plazoSugeridoCot()` devuelva también sus razones; `chip(…,'sugerido',true)`, y `popover` para la explicación (se abre con toque, no con hover).
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** la etiqueta chica con contraste de 4,5:1 (no `--a-claro`). El «?» de 44 px.

### H20. Zona de arrastre que se abre al acercar el archivo (y deja de respirar sola)
- **Dónde:** `css/vidrio.css` 441–444 (`.ai-drop .ico` con `vid-respira` infinita); `css/sistema.css` 1546–1559 (`.ai-drop`, `.sobre`); `js/cotizador/ia.js` 408–425 (`aiPintarArrastre()`, `aiDragEntra/Sobre/Sale`); `cotizador.html` 671 y 828 (arrastre del vectorizador y del escalador con `outline` en línea). Verificado.
- **Hoy:** el icono de la zona late sin parar mientras espera. En los dos lienzos, el arrastre solo pinta un contorno punteado, sin texto.
- **Propuesta:** el icono queda quieto en reposo. Con un archivo encima, la carpeta abre la tapa y asoma una hoja («Suéltalo aquí»); al soltar, la hoja entra. Lo mismo en los lienzos: «Suelta para medir» / «Suelta para vectorizar».
- **Sale de:** React Bits · FolderFloat; alternativa Folder.
- **Cómo en vanilla:** SVG en línea de dos piezas (cuerpo y tapa) con `transform:rotateX()` y `translateY` bajo `.sobre`, en 180 ms. En los lienzos, una clase en lugar del `style.outline`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** la respiración perpetua rompe «una sola pieza se mueve sola»; con esto solo se mueve cuando el usuario arrastra. Con reduced-motion, sin tapa.

### H21. Vistazo al cuaderno sin salir del formulario del cliente
- **Dónde:** `js/cotizador/historial.js` 829–843 (`actualizarAvisoCuaderno()`) y 846–850 (`verCuadernoDe()`); `cotizador.html` 314 (`#cua-aviso`); `css/sistema.css` 1753–1755. Verificado.
- **Hoy:** «Ya tiene cuaderno · 3 cotizaciones · $45,000 · Ver cuaderno» abre el modal completo encima del formulario.
- **Propuesta:** tocar el aviso abre una tarjeta flotante con las iniciales y las tres últimas cotizaciones (folio · proyecto · total · fecha), más dos acciones: «Duplicar la última» y «Abrir cuaderno». Sirve para decir «la vez pasada le cotizamos esto» sin perder lo capturado.
- **Sale de:** Vengeance · Cursor Card (tarjeta de vistazo); alternativa Masked Avatars para las iniciales.
- **Cómo en vanilla:** `popover` anclado al aviso, con los datos de `cuadernoDeQ()`. «Duplicar» llama a `cuaDuplicarCot()`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** se abre con toque, no con hover; 44 px. Entrada breve y ninguna animación en reposo.

### H22. Muestras de color del vector como fichas de 44 px que dicen su estado
- **Dónde:** `js/cotizador/vectorizador.js` 1012–1034 (`vtPintarResultado()`, `vtToggleColor()`); `css/sistema.css` 2004–2008, 2032 y 2597 (`.vt-sw`: 24/30/32 px, apagado con `opacity:.25`). Verificado.
- **Hoy:** cuadritos de color sin texto. Quitado es transparente con una raya, y cuál es el fondo solo se sabe por el `title`.
- **Propuesta:** fichas con la muestra, el nombre («Color 2» o «Fondo») y un ✓ que se vuelve ✕ al quitarse, con el nombre tachado. Tamaño táctil de 44 px.
- **Sale de:** React Bits · SpringCheck (casilla que llena, palomea y tacha en un solo gesto).
- **Cómo en vanilla:** `<button aria-pressed>` con la muestra en un `<span>` y el estado por clase; iconos `i-ojo` / `i-ojo-off` del sprite.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** regla 4.3: el estado no se dice con opacidad, sino con icono y palabra. 44 px.

### H23. Vista previa del PDF: «Hoja 2 de 5» y tocar una hoja para verla al ancho
- **Dónde:** `js/cotizador/entrega.js` 1171–1221 (CSS de `.visor` y los `zoom` .52/.46/.41/.37) y 1234–1238 (barra del visor). Verificado.
- **Hoy:** la barra dice fijo «Hoja carta vertical · 5 hojas». En el teléfono cada hoja sale al 37–52 % y no hay forma de ampliar una para enseñársela al cliente.
- **Propuesta:** la barra dice en qué hoja vas, con una línea de progreso. Tocar una hoja la pone a lo ancho (con desplazamiento lateral) hasta que se vuelve a tocar.
- **Sale de:** Skiper · skiper89 Scroll progress 001 (GRATIS).
- **Cómo en vanilla:** `<script>` en línea dentro del mismo documento (la CSP ya permite `'unsafe-inline'`). IntersectionObserver sobre `.pg`, `transform:scaleX` para la línea y una clase `.ampliada{zoom:1}`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** todo dentro de `@media screen`. La barra sigue antes de la primera `.pg` (1229–1233, por el `:last-child`). Nada toca el papel.

### H24. La medida nueva se ve llegar a la lista
- **Dónde:** `js/cotizador/escalador.js` 1331–1347 (rama de medida de `scCommitLine()`) y 1506–1545 (`scUpdateList()`); `css/sistema.css` 1914–1915 (`.sc-flash`). Verificado.
- **Hoy:** la lista se rehace completa sin llevar la vista a la medida nueva. En el teléfono, con la lista debajo del lienzo, no se nota que se sumó.
- **Propuesta:** la tarjeta nueva entra con su filete de color y la lista se desplaza hasta ella; el contador de medidas da un salto chico.
- **Sale de:** React Bits · AnimatedList (entrada del renglón nuevo).
- **Cómo en vanilla:** tras `scUpdateList()`, llevar `list.scrollTop` a la última y ponerle la `.sc-flash` que ya existe. Para el contador, la animación `chip-cede` (sistema.css 4656–4657).
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** desplazar solo el contenedor `.sp-mlist`, nunca la página mientras se mide. Con reduced-motion, sin salto.

### H25. Restaurar un respaldo con los pasos a la vista
- **Dónde:** `js/cotizador/historial.js` 1010–1050 (`restaurarDesde()`: confirma, descarga una copia, escribe y recarga a los 900 ms). Verificado.
- **Hoy:** tras confirmar, sale el aviso «Respaldo restaurado — recargando…» y la página se recarga sin que se vea qué pasó.
- **Propuesta:** tres renglones que se van marcando («Copia de lo actual descargada», «23 cotizaciones escritas», «Recargando»). Si algo no cupo, ese renglón queda en ✕ con «No se cambió nada».
- **Sale de:** React Bits · StatusMark.
- **Cómo en vanilla:** una lista con estados `.idle/.gira/.ok/.mal` que reusa el giro `esq-gira` existente; la recarga ocurre al marcar el último.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** para la confirmación aplica la #5 (mantener presionado). Con reduced-motion, sin giro.

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

### H27. Cuadernos: pasar de la lista al detalle deslizando
- **Dónde:** `js/cotizador/historial.js` 632–679 (`pintarCuadernos()`) y 681–732 (`abrirCuaderno()`). Verificado.
- **Hoy:** el `innerHTML` de `#cua-body` cambia de golpe, y «Todos los clientes» regresa igual.
- **Propuesta:** el detalle entra desde la derecha y la lista vuelve desde la izquierda; las iniciales de la tarjeta se convierten en el encabezado del detalle.
- **Sale de:** React Bits · AnimatedContent (entrada con dirección); alternativa Vengeance · Expandable Bento Grid.
- **Cómo en vanilla:** `document.startViewTransition()` donde exista, con `view-transition-name` en `.cua-ini`. Si no existe, las `entra-der` / `entra-izq` que ya están en sistema.css 3899–3902.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** con reduced-motion, sin transición. Nada de retardos encadenados.

### H28. La pista del escalador cambia con un fundido
- **Dónde:** `js/cotizador/escalador.js` 1441–1456 (`scSetHint()`), 1289 y 1314 (pistas con «↺ Quitar punto»); `css/sistema.css` 1817–1822 y 3785 (`.sp-hint-bar`). Verificado.
- **Hoy:** el texto se borra y se reescribe al instante. Con la vista puesta en la foto, un cambio de instrucción («✓ Primer punto — toca el otro extremo») pasa desapercibido.
- **Propuesta:** el texto viejo sale hacia arriba y entra el nuevo en 140 ms; las pistas temporales regresan igual.
- **Sale de:** Vengeance · Morph Text; alternativa React Bits · BlurText (sin el desenfoque).
- **Cómo en vanilla:** dos `<span>` superpuestos que se intercambian con `opacity` y `translateY`; `transitionend` quita el viejo.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** solo `opacity` y `transform`, porque la barra está sobre un lienzo que se repinta con el dedo. Con reduced-motion, instantáneo.

### H29. Estado de guardado de la nota del cuaderno con un glifo
- **Dónde:** `js/cotizador/historial.js` 721–725 (`#cua-nota-estado`) y 737–750 (`cuaNotaEscrita()`, `cuaGuardarNotaYa()`); `css/sistema.css` 1738 y 3718. Verificado.
- **Hoy:** una frase gris que cambia entre «Escribiendo…», «Guardada en este dispositivo.» y el error.
- **Propuesta:** un glifo de 14 px delante de la frase: anillo punteado mientras escribe, giro breve al guardar, palomita al quedar guardada y ✕ ámbar si no hay espacio.
- **Sale de:** React Bits · StatusMark.
- **Cómo en vanilla:** un `<i>` con clases de estado que reusa `.esq-giro` y los iconos del sprite.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** el giro dura solo lo que dura el guardado. El ✕ va con texto, no solo con color.

### H30. Medidas rápidas de referencia como opciones elegidas, sin emojis
- **Dónde:** `cotizador.html` 864–871 (`.ref-known`, con `onclick="$('sc-ref-cm-input').value=200"` y 🚪🧍🪟🚗⬜); `css/sistema.css` 1916–1919 y 2084. Verificado.
- **Hoy:** tocar «200» escribe en el campo sin marcar cuál se eligió. Los iconos son emojis, fuera del sprite, y se ven distinto en cada teléfono.
- **Propuesta:** un grupo de opciones con la elegida marcada, que se desmarca si se teclea otra cifra; iconos del sprite; y el foco salta a «Confirmar escala».
- **Sale de:** React Bits · JellyRadio.
- **Cómo en vanilla:** `role="radiogroup"` con botones `aria-checked`, y la animación `chip-cede` de `.chip.on` (sistema.css 4656) como único rebote.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** 44 px (hoy son 40 con puntero grueso). Iconos del sprite, según §5 del sistema de diseño.

#### Descartado en esta zona
- React Bits · Shredder y PaperCrumple para borrar del historial o una medida: espectáculo pesado que alarga un borrado que ya tiene Deshacer.
- React Bits · TearTicket para el recibo: el recibo es una hoja impresa (`entrega.js` 1366–1410); en pantalla no hay nada que arrancar.
- React Bits · HalftoneReveal, DitherVeil y RippleDistortion sobre la foto del escalador: `scRender()` repinta en cada `touchmove`, y un efecto encima le quita cuadros al gama media justo al medir.
- React Bits · MorphSlider y Vengeance · Ripple Displacement Slider para Original↔Vector: el `vt-split` con `clip-path` ya compara al píxel, y una transición que deforma impide ver si el trazo coincide.
- Texto animado (React Bits · DecryptedText, Shuffle, SplitFlapText; Vengeance · Kinetic Text Loader) en folio, totales o `vt-prog`: el dinero y el folio se leen, no se descifran, y la barra con porcentaje real informa más.
- React Bits · ClickSpark y Vengeance · Liquid Metal en «Generar PDF»: serían una segunda pieza con brillo propio compitiendo con `.ai-btn`.
- React Bits · GlassSurface y FluidGlass en las barras del escalador y del vectorizador: `css/sistema.css` 3778 quitó el `backdrop-filter` a propósito sobre lienzos que se repintan.
- Animmaster: es de pago y no tiene nombres ni código públicos; no hay nada que verificar.

---

## Zona 3 · Plataforma — esqueleto, tablero y proyectos (P)

### P1. Cambiar los cinco `window.confirm()` por la capa de la app, y «Quitar» con mantener presionado
- **Dónde:** `js/mod/proyectos.js` líneas 1081–1165 (función `decisionHoja()`; los `window.confirm` están en 1092, 1099, 1102, 1114 y 1122). Verificado.
- **Hoy:** cinco `confirm()` nativos con párrafos largos. En la app instalada de iPhone salen con el dominio por título, recortan el texto, no pasan por el registro de capas (Escape y botón atrás) y «Quitar» (que borra del teléfono) se ve igual que «Dejarla».
- **Propuesta:** pasar los cinco a `confirmarPf()`, que ya existe (`js/nucleo/ui.js` 307–335) y ya usan `moverEtapa()` y `app.js`. Cada uno con título corto, el texto partido en «Qué pasa / Qué no se toca» y `peligro` en quitar y juntar. «Quitar del tablero» se confirma manteniendo presionado (idea #5 en otro lugar).
- **Sale de:** React Bits · HoldButton (solo para «Quitar»).
- **Cómo en vanilla:** `await confirmarPf({titulo,texto,si,no,peligro})`. `.conf-texto` ya respeta los saltos de línea (`white-space:pre-line`, `css/sistema.css` 3464). El relleno del HoldButton se hace con WAAPI sobre `clip-path` en `pointerdown` y se cancela en `pointerup`.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** `#pf-confirma` va encima de la ficha (z-index 90, `sistema.css` 3459) y consume su propia entrada de historial, así que no hay que cerrar la ficha antes. Hay que conservar el `boton.disabled` de la línea 1127. El gesto necesita equivalente por teclado.

### P2. La ficha guarda en su sitio: sin repintarse entera y con palomita en el chip
- **Dónde:** `js/mod/proyectos.js` 1201–1205 (`clicFicha()`, estatus y cuenta), 1252–1258 (`parchar()`) y 1244–1250 (`refrescarFicha()`, que hace `capa.innerHTML = htmlFicha(p)`). Los chips de cuenta están en 897–898. Verificado.
- **Hoy:** tocar una cuenta de cobro o un estatus reescribe el panel completo. `.pf-panel-b` vuelve arriba del todo, el foco se cae al `<body>` y la única confirmación es un toast.
- **Propuesta:** actualizar solo el grupo tocado: marcar `.on` y `aria-pressed`, dibujar una palomita breve en el chip elegido (idea #6 en otro lugar) y conservar el `scrollTop` y el foco del panel.
- **Sale de:** React Bits · BellToggle (el estado apretado es el recibo). Alternativa: JellyRadio.
- **Cómo en vanilla:** parche puntual del DOM después de `Proy.actualizar()`. Si hace falta repintar, guardar `scrollTop` y el `data-*` del foco antes y reponerlos después. Palomita con `stroke-dashoffset`.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** si `avisarResultado()` falla, el chip regresa a su valor anterior. La lista de atrás sí puede recargarse con `cargar()`.

### P3. Cuentas tocables que llevan a lo que cuentan
- **Dónde:** `js/mod/tablero.js` 509–546 (`cuentas()` y `unaCuenta()` pintan `<p class="pf-cuenta">`) y 984–1013 (`pintarMbar()`, que hace scroll sin señalar a dónde llegó). También `js/mod/inicio.js` 185–219 y `js/mod/control.js` 325–329. Verificado.
- **Hoy:** las cifras grandes no se pueden tocar. Para ver cuáles son los «3 van tarde» hay que buscarlos en la lista, y la barra fija lleva a una tarjeta sin decir cuál es.
- **Propuesta:** cada cuenta se vuelve botón. «Van tarde / No llegan» baja a su tarjeta, «Trabajos sin material» baja a «Falta material», «Ganados sin fecha» abre el Calendario con pase y «Por cobrar» abre esa pestaña de Control. La tarjeta de llegada se enciende una vez con el aro del acento.
- **Sale de:** React Bits · MagicBento (la ficha como puerta; solo su `clickEffect` breve). Alternativa: Vengeance · Highlight Grid.
- **Cómo en vanilla:** `<button class="pf-cuenta">` + `scrollIntoView({behavior:scrollSuave()})` + la clase `.sc-flash`, que ya existe (`sistema.css` 1914–1915) y se aplica una sola vez.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** la línea de estaciones también es `.pf-cuenta` pero FILTRA. El KPI tiene que distinguirse (una flecha de «ir»). Con cuenta en 0 no lleva a ningún lado.

### P4. «Ya se armó» con deshacer y mecha, sin que el renglón salte de grupo
- **Dónde:** `js/mod/tablero.js` 736–745 (`accionesRenglon()`) y 1101–1129 (`avanzar()`, con `recargar()` en 1128). Verificado.
- **Hoy:** el botón escribe al instante, el repintado manda el renglón a otro grupo de estación y no hay deshacer. El toast de 3,2 s solo dice «avanzó».
- **Propuesta:** el botón se convierte en «Deshacer» y una línea se va consumiendo durante 5 s. El renglón se queda donde está hasta que se apaga la mecha, y «Deshacer» llama a `Proy.avanzarEtapa(id, de)`. Lo mismo para el toast de `moverEtapa()` (`proyectos.js` 1301–1302).
- **Sale de:** React Bits · FuseButton.
- **Cómo en vanilla:** WAAPI `el.animate(scaleX 1→0, {duration:5000})` que se pausa con hover o `visibilitychange`, y cruce del rótulo con `opacity`.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** nunca para el cruce de corte (saca material) ni para «Ya se instaló», que también marca la instalación como hecha (1109–1119). Deshacer es otra escritura y deja renglón en la bitácora. Hay que revisar `puedeMover(rol, de)`.

### P5. En el teléfono: «Más» en la barra de abajo, y Control para pagos
- **Dónde:** `js/app.js` 61–95 (`RUTAS`, marca `movil`; Control en la 92 sin ella) y 620–627 (`pintarNav()`). También `index.html` 318–331 y `js/mod/tablero.js` 914–978 (`pie()`, hoy la única puerta). Verificado.
- **Hoy:** Material, Control, Mesa de corte y Vectorizador solo se alcanzan bajando hasta el pie del Tablero. Pagos tiene 4 botones abajo y aun así no tiene Control, que es su pantalla.
- **Propuesta:** llenar la barra hasta 5 según el rol (pagos recibe Control). Donde sobran rutas, un botón «Más» o subir el dock con el dedo abre una hoja con las demás, cada una con su globo de cuenta.
- **Sale de:** Vengeance · Awwwards Nav (dock de vidrio que se expande). Alternativa: React Bits · StaggeredMenu.
- **Cómo en vanilla:** capa registrada con `registrarCapa()` y la misma lista de `RUTAS`. El gesto hacia arriba con Pointer Events sobre `.pf-abajo`.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** a 360 px, con seis botones cada uno queda en unos 56 px. «Más» va sin rótulo (icono de 44 px con `aria-label`) y hay que medirlo. La regla de «una sola lista» (`RUTAS`) no se rompe.

### P6. Buscar un proyecto desde cualquier pantalla
- **Dónde:** `js/mod/proyectos.js` 131–138 y 149–156 (buscador solo dentro de Proyectos) y 382–393 (`aplicar()`). También `index.html` 224–231 (encabezado) y `js/app.js` 920–931 (teclado) y 117 (`ctx.pasar`). Verificado.
- **Hoy:** para contestarle al cliente «¿cómo va mi letrero?» hay que ir a Proyectos, escribir y abrir la tarjeta.
- **Propuesta:** una lupa en el encabezado y la tecla «/» abren una paleta con resultados en vivo (nombre, folio, etapa, fecha) y la coincidencia resaltada. Tocar un resultado abre la ficha con `ctx.pasar('proyectos',{proyecto_id})`.
- **Sale de:** Vengeance · Search Modal. Alternativas: Gooey Search, o Skiper · skiper92 Vercel Command Search (PRO).
- **Cómo en vanilla:** capa con `registrarCapa()`, `<input type="search">` con la misma espera de 220 ms, `<mark>` en la coincidencia.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** buscar con `Proy.listar({texto})`, no con un segundo buscador (lo prohíbe el comentario de 383–386). Fabricación no ve importes en los resultados. El encabezado del teléfono ya va justo (`plataforma.css` 120–127).

### P7. La etapa en la ficha como pasos, no como siete casillas
- **Dónde:** `js/mod/proyectos.js` 873–886 (`htmlFicha()`, `segmento(... 'data-mover')`) y 1260–1306 (`moverEtapa()`). También `css/plataforma.css` 1744–1754 (con 5 o más opciones se queda la rejilla de tres). Verificado.
- **Hoy:** siete botones iguales en tres renglones. No se ve qué etapas ya pasaron ni cuál sigue.
- **Propuesta:** una línea de pasos. Las etapas hechas llevan palomita, la actual va encendida y la siguiente es el botón principal con su verbo en pasado («Ya se cortó»). Las anteriores se pueden tocar con la confirmación que ya existe (1268–1277). También sirve para enseñarle al cliente en qué va.
- **Sale de:** React Bits · Stepper.
- **Cómo en vanilla:** `<ol>` con conectores en `::before` y `aria-current="step"`, sin animación en reposo.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** fabricación llega hasta «Listo» y pagos no ve este bloque. «Instalado» también marca la instalación (1283–1286). En la ficha, el cruce hacia «Cortado» hoy no pregunta (solo se confirma retroceder), mientras que el Tablero sí pregunta: conviene igualarlo aquí.

### P8. La tarjeta viaja a su nueva columna
- **Dónde:** `js/mod/proyectos.js` 517–551 (`tarjeta()`) y 1304–1305 (`cargar()` tras mover). También `js/mod/tablero.js` 323–331 (`pintar()`) y 1128, y `css/plataforma.css` 1722, 1305 y 1787–1788 (transiciones declaradas). Verificado.
- **Hoy:** cada cambio rehace el `innerHTML`, así que la tarjeta aparece en otra columna sin transición. Las transiciones del CSS nunca corren porque los nodos son nuevos.
- **Propuesta:** envolver el repintado en una View Transition y darle nombre solo a la tarjeta o al renglón afectado. Se desliza de su columna vieja a la nueva y el número de la columna cambia en el mismo cuadro. En Proyectos se dispara al cerrar la ficha.
- **Sale de:** React Bits · Masonry (reflujo animado). Alternativa: CardSwap.
- **Cómo en vanilla:** `document.startViewTransition(() => pintar())` con `view-transition-name:pj-<id>` en un solo elemento. Si no hay soporte, se pinta directo.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** con `prefers-reduced-motion` no se usa. Nombrar 1 o 2 elementos, no 200. No hacerlo con una capa abierta porque el velo entraría en la captura.

### P9. Arrastrar tarjetas entre columnas del tablero de Proyectos
- **Dónde:** `js/mod/proyectos.js` 496–515 (`tablero()`), 526–527 (la tarjeta es un `<button data-abrir>`) y 1260–1306 (`moverEtapa()`). También `css/plataforma.css` 1326–1373 (el comentario de 1355–1357 habla de «una pieza que se mueve de columna», pero no existe el arrastre). Verificado.
- **Hoy:** la tarjeta solo abre la ficha. Cambiar de columna exige abrirla, bajar al segmento y tocar.
- **Propuesta:** mantener presionado unos 250 ms levanta la tarjeta. La columna sobre la que pasa se ilumina, y al soltar se llama a `moverEtapa()`, que ya confirma retrocesos (y debería confirmar el corte). La columna vacía («Nada aquí», 512) se vuelve zona para soltar.
- **Sale de:** Skiper · skiper5 Things drag and scroll (PRO, solo como referencia) + Vengeance · Highlight Grid. Alternativa: React Bits · SwipeRow (su captura del puntero).
- **Cómo en vanilla:** Pointer Events con `setPointerCapture`, un clon fantasma movido con `transform`, `elementFromPoint` para saber la columna y desplazamiento automático en los bordes. Por teclado: Alt+→ con la tarjeta enfocada.
- **Valor · Esfuerzo:** Alto · Alto
- **Cuidado:** solo a 760 px o más. Respetar roles (`puedeMover`). En el Fold el tablero se desliza en horizontal (1491–1494), por eso se levanta con pulsación larga. Un toque corto sigue abriendo la ficha.

### P10. La ficha del teléfono sube y se cierra deslizando hacia abajo
- **Dónde:** `css/plataforma.css` 755–772 (`.pf-modal-bg`, `.pf-panel`; por debajo de 560 px es una hoja pegada abajo) y `css/sistema.css` 3604 (solo el velo tiene animación). También `js/mod/proyectos.js` 741–748 (`abrirFicha()`). Verificado.
- **Hoy:** la hoja aparece de golpe (`.pf-panel` no es `.modal` y no hereda `vidrio-entra`). Para cerrarla hay que alcanzar la X de arriba o usar el botón atrás.
- **Propuesta:** que suba desde abajo en 0,32 s y que arrastrarla hacia abajo desde la cabecera la cierre, por distancia o por velocidad. Aplica a ficha, orden de trabajo y preguntas.
- **Sale de:** React Bits · SwipeToast (despedir deslizando hacia abajo). Alternativa: Stack.
- **Cómo en vanilla:** `@starting-style` + transición de `transform:translateY` en `.pf-modal-bg.show .pf-panel`, y Pointer Events solo en `.pf-panel-h`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** cerrar por gesto tiene que pasar por `cerrarCapa()` (`ui.js` 269–293), que consume la entrada de historial. No arrastrar desde `.pf-panel-b`, que tiene scroll propio. Con movimiento reducido, sin deslizamiento.

### P11. El latido de «sin decidir» tiene que apagarse
- **Dónde:** `js/mod/tablero.js` 567–590 (`decidir()`) y `js/mod/proyectos.js` 629–639 (`pintarCand()`). También `css/sistema.css` 3143 (`.cand-partidas{animation:late 2.8s … infinite}`), `css/plataforma.css` 883–884 y `docs/SISTEMA-DE-DISENO.md` línea 17. Verificado.
- **Hoy:** la tarjeta late sin fin, al lado del botón del asistente que también se mueve solo. En el Tablero son dos piezas en movimiento, y la regla del sistema admite una.
- **Propuesta:** que lata tres veces al aparecer y se quede con el aro quieto. Vuelve a latir solo cuando la cuenta sube.
- **Sale de:** React Bits · BellToggle (keyframes amortiguados que terminan en reposo).
- **Cómo en vanilla:** `animation-iteration-count:3` y guardar en el estado del módulo la última `n`; si crece, se vuelve a disparar forzando un reflow.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** con movimiento reducido ya se apaga (`sistema.css` 3967). La barra fija «Decidir» sigue siendo la entrada.

### P12. El dinero interno, tapado delante del cliente
- **Dónde:** `js/mod/proyectos.js` 808–815 (comisión pactada) y 818–819 (comisión restante), dentro de `htmlFicha()`. También `js/mod/tablero.js` 528–539 (`.pf-cuenta.dinero` «En el taller»). El patrón de referencia está en `js/cotizador/nucleo.js` 241–263. Verificado.
- **Hoy:** la ficha que se le enseña al cliente para decirle en qué va su anuncio lleva a la vista la comisión, y la pantalla de entrada abre con la suma de todo lo que hay en el taller.
- **Propuesta:** esas cifras nacen tapadas y se destapan mientras se mantiene tocado, igual que el cotizador. Un botón «Ver importes» cubre el caso del teclado.
- **Sale de:** React Bits · BlurText (el paso de borroso a nítido).
- **Cómo en vanilla:** una clase en `<body>` con `filter:blur` sobre los selectores de dinero interno, más `pointerdown/up` delegados.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** respetar la decisión escrita en `proyectos.js` 563–565: el importe del propio proyecto no se tapa. Fabricación no ve ninguna de estas cifras (no se pintan, no se difuminan).

### P13. «Qué atender»: el aviso atendido se tacha y se pliega
- **Dónde:** `js/mod/inicio.js` 279–289 (`filaAviso()`), 473–488 (`alTocar()`) y 633–636 (`marcarYRecargar()`). Verificado.
- **Hoy:** después de «Ya se instaló», «Recalcular» o «Aceptar», la lista entera se repinta. El renglón atendido desaparece sin decir cuál fue y los demás suben.
- **Propuesta:** el renglón se resuelve en su sitio: la palomita se dibuja (idea #6 aquí), el título queda tachado y tenue, y el renglón se pliega en unos 300 ms antes de repintar.
- **Sale de:** React Bits · SpringCheck. Alternativa: StatusMark con tachado.
- **Cómo en vanilla:** clase `.hecho` con `stroke-dashoffset`, `text-decoration` y `grid-template-rows:1fr→0fr`. `recargar()` en `transitionend`, con un tope de tiempo por si no llega.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** si la acción falla, no se tacha. `voz()` anuncia qué se atendió. Con movimiento reducido, sin pliegue.

### P14. Fechas rápidas al ganar y al agendar
- **Dónde:** `js/mod/inicio.js` 670–694 (`abrirGanar()`, campo en 685–686) y 717–736 (`abrirFecha()`, día en 723–724 y hora en 725–726). Verificado.
- **Hoy:** el selector nativo viene con «hoy» ya puesto y la hora aparte. Con el dedo y el cliente enfrente son varios toques, y es fácil dejar «hoy» por inercia.
- **Propuesta:** una fila de fichas encima del campo: «Hoy · Mañana · sáb 3 · lun 5 · Sin fecha». El campo se queda para cualquier otro día. Para la hora: «9 a.m. · 12 · 4 p.m. · Noche».
- **Sale de:** React Bits · JellyRadio (sin su física). Alternativa: GlideSelect.
- **Cómo en vanilla:** radios nativos con el `.chip` que ya existe; escriben en el `<input type="date|time">`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** 44 px de zona táctil. «Sin fecha» vacía el campo, lo cual ya está permitido (687). Las fechas se calculan con `fechas.js` y nunca con `new Date(iso)`.

### P15. Indicador de sincronización en el encabezado
- **Dónde:** `js/app.js` 1106–1112 (`sincronizarCallado()`), 1123–1154 (`sincronizarDeVerdad()`) y 1014–1019 (reloj de 30 s). También `index.html` 224–249. Verificado.
- **Hoy:** la sincronización es muda a propósito. Nadie sabe si el teléfono está al día antes de contestarle algo al cliente.
- **Propuesta:** un glifo de 20 px. En reposo, una nube quieta. Un arco que avanza solo si la vuelta tarda más de 1 s. Una palomita breve si bajó algo. Una cruz si falló, con el motivo en el `title`.
- **Sale de:** React Bits · StatusMark. Alternativa: LatticeLoader.
- **Cómo en vanilla:** SVG con `stroke-dasharray` que cambia por clase, con los estados emitidos desde `sincronizarDeVerdad()`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** que no sea una segunda pieza que se mueve sola: nada se mueve en reposo ni en las vueltas cortas. `aria-live` solo para el error.

### P16. «Traer la hoja» que enseña su avance
- **Dónde:** `js/mod/control.js` 222–245 (`lineaHoja()`, botón en 225–227) y 175–205 (`traerDeLaHoja()`). Verificado.
- **Hoy:** el botón dice «Trayendo la hoja…» y se deshabilita. No dice cuántas páginas van (pueden ser hasta 20) y el resultado llega en un toast aparte.
- **Propuesta:** el botón se va llenando por página traída con «página 3 · 2,1 s». Termina en verde con «12 cambios» o se detiene en rojo con «Reintentar».
- **Sale de:** React Bits · CallChip.
- **Cómo en vanilla:** `::before` con `transform:scaleX(var(--p))` actualizado en cada vuelta y el texto con `textContent`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** `pintar()` rehace toda la pantalla (251–265). Durante la bajada hay que tocar solo el botón. El refresco silencioso al entrar no lo enciende.

### P17. Avisos con mecha visible que se despiden deslizando
- **Dónde:** `js/nucleo/ui.js` 131–153 (`toast()`, fuera de mi zona pero lo usan mis módulos) y `css/sistema.css` 1403–1416. Usos con acción: `js/mod/tablero.js` 1123–1124 y `js/mod/proyectos.js` 688–689 y 1294–1297. Verificado.
- **Hoy:** un aviso con botón dura 8 s como mínimo, sin nada que diga cuánto le queda, y no se puede quitar. Mientras tanto tapa la barra de acción.
- **Propuesta:** una mecha de 2 px en el borde de abajo que dura exactamente lo que dura el aviso. Se pausa con el dedo o el cursor encima, y deslizar hacia abajo lo cierra.
- **Sale de:** React Bits · SwipeToast.
- **Cómo en vanilla:** WAAPI `scaleX 1→0` con `duration=dur`, `pause/play` en `pointerenter/leave`, y Pointer Events con un umbral de 40 px o por velocidad.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** es una pieza compartida y hay que coordinarla con quien lleve `ui.js`. Con movimiento reducido, la mecha queda fija. `voz()` se queda igual.

### P18. Las cuentas ruedan cuando la sincronización cambia algo
- **Dónde:** `js/app.js` 1149–1153 (remonte cuando bajan cambios), `js/mod/tablero.js` 509–546, `js/mod/proyectos.js` 395–414 (`pintarCuentas()`) y `js/mod/control.js` 325–329. Verificado.
- **Hoy:** cuando llega algo de otro teléfono, «Van tarde 2» pasa a 3 en seco y nadie se da cuenta.
- **Propuesta:** el odómetro (idea #1), llevado aquí. Si una cuenta cambió respecto a la última vez que se pintó, la cifra rueda del valor viejo al nuevo y aparece un «+1» breve. Nunca al entrar a la pantalla.
- **Sale de:** React Bits · Counter. Alternativa: Vengeance · Animated Number.
- **Cómo en vanilla:** `@property --n <integer>` + `counter()`, o dígitos que se desplazan con `translateY`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** `desmontar()` pone `_d` en null, así que el valor previo se guarda fuera de él. Los importes mantienen sus dos decimales y el ancho `--c` de `cifraQueCabe()`.

### P19. La marca de módulo activo se desliza en la barra lateral y en la de abajo
- **Dónde:** `js/app.js` 595–628 (`pintarNav()` reescribe las dos barras en cada montaje) y `css/plataforma.css` 180–183, 1706–1707 (transición de `.pil`), 335 y 2029 (`.pf-tab`) y 1687–1688. Verificado.
- **Hoy:** como las barras se reescriben en cada cambio de pantalla, las transiciones declaradas nunca corren y la píldora aparece de golpe en el destino.
- **Propuesta:** pintar las barras una sola vez y solo mover `.on` y `aria-current`. Una única píldora (abajo) y un único filete (barra lateral) se deslizan al destino: la idea #2 llevada aquí.
- **Sale de:** React Bits · PillNav. Alternativa: RubberSegment.
- **Cómo en vanilla:** un elemento absoluto con `transform` calculado desde el `getBoundingClientRect()` del botón activo y `transition:var(--mv-r)`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** al cambiar de rol la lista sí cambia y hay que reconstruir. Los globos `.cta` viven dentro de los botones (642). Con movimiento reducido, sin deslizamiento.

### P20. El globo de la barra avisa cuando sube
- **Dónde:** `js/app.js` 632–648 (`ponerCuenta()` y `pintarCuentasNav()`), `css/plataforma.css` 188–193 y 343–345, y `css/sistema.css` 1128 (`@keyframes chipPop` ya existe). Verificado.
- **Hoy:** el globo pasa de 2 a 3 en silencio después de cada conteo.
- **Propuesta:** cuando la cuenta SUBE, el globo hace un `chipPop` una sola vez. Cuando baja, nada.
- **Sale de:** React Bits · PulseHeart (la cuenta que cambia un dígito con un pulso).
- **Cómo en vanilla:** comparar con el valor anterior de `_cuentas`, poner la clase `.sube` y quitarla en `animationend`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** no animar el primer llenado de `contarTodo()` al arrancar (997). Con movimiento reducido, sin pulso.

### P21. «Sí, ya se cortó» como deslizador que enseña el resultado
- **Dónde:** `js/mod/tablero.js` 1134–1151 (`abrirPide()`), 1155–1163 (`alClicPide()`) y 1120–1127. Verificado.
- **Hoy:** el modal tiene dos botones iguales. «Sí» lo cierra al instante y el número de materiales que salieron llega en un toast aparte.
- **Propuesta:** el confirmar con gesto (idea #5), en la única escritura irreversible del Tablero. «Sí» es un deslizador que gira mientras corre `avanzarEtapa` y se abre en una píldora «Salieron 4 materiales · Ver almacén». Si falla, regresa con una sacudida y el mensaje.
- **Sale de:** React Bits · SlideCommit. Alternativa: HoldButton.
- **Cómo en vanilla:** Pointer Events sobre un riel, o un `<input type="range">` con estilo. Enter como alternativa de teclado.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** 44 px de alto. El mismo cruce desde la ficha de Proyectos no pregunta (1260–1278); conviene igualarlos.

### P22. El arranque en pasos
- **Dónde:** `index.html` 273–286 (texto en 285) y `js/app.js` 295–298 (`faseArranque()`, llamada en 838, 933, 943 y 968) y 308–317 (`avisarLento()`). Verificado.
- **Hoy:** una sola línea que va cambiando de texto. Si se atora, a los 8 s dice «tarda más de lo normal» pero no en qué paso.
- **Propuesta:** la lista de pasos (idea #8), llevada aquí. Las cuatro fases se ven como una lista corta, cada una pasa de anillo punteado a palomita, y la que se atora queda marcada en el aviso de lentitud.
- **Sale de:** React Bits · ThoughtLine. Alternativa: StatusMark.
- **Cómo en vanilla:** cuatro `<li>` de marcado fijo en `index.html`. `faseArranque()` pone `data-hecho` y el resto es CSS.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** el esqueleto es marcado fijo a propósito (265–272). Tiene que conservar la geometría del Tablero para que nada salte al quitarlo.

### P23. Bordes que se desvanecen en la tira de etapas y en el tablero del Fold
- **Dónde:** `css/plataforma.css` 1398–1411 (`#pj-filtros .tipo-seg` con desplazamiento horizontal y barra oculta), 1326–1327 y 1491–1494 (`.pj-tablero`). También `js/mod/proyectos.js` 416–429. Verificado.
- **Hoy:** la tira del teléfono se desliza sin barra visible, y en el Fold abierto el tablero se corta en la cuarta columna. Nada dice que hay más.
- **Propuesta:** la idea #10 aquí. El borde del lado donde queda contenido se desvanece, y se apaga al llegar al final.
- **Sale de:** Skiper · skiper87 Scroll with fade effect (GRATIS).
- **Cómo en vanilla:** `mask-image` con `linear-gradient` y `animation-timeline:scroll(inline)`, o una clase por evento `scroll`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** al pintar, llevar el chip encendido a la vista con `scrollIntoView` para que la máscara no lo tape.

### P24. Entrar a cada pantalla según su lugar en la barra
- **Dónde:** `css/plataforma.css` 291 (`.pf-mod{animation:entra}`), `css/sistema.css` 3899–3902 (`entra-der` y `entra-izq` y `html.va-adelante` ya existen para el cotizador) y `js/app.js` 496–498 (`montarDeVerdad()`). Verificado.
- **Hoy:** todas las pantallas entran igual, subiendo 10 px. Ir y volver entre dos pantallas se ve idéntico.
- **Propuesta:** la pantalla que está después en la barra entra desde la derecha y la que está antes, desde la izquierda. Las ocultas (Qué atender, Ajustes) siguen subiendo, porque son «de adentro».
- **Sale de:** React Bits · AnimatedContent (con dirección). Referencia: Animmaster · Page Transitions.
- **Cómo en vanilla:** `html.classList` con `va-adelante` o `va-atras` antes de quitar el `hidden`, reutilizando los keyframes que ya existen.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** las pantallas de marco miden su alto al terminar de entrar (`cotizador.js` 245–253), así que la duración debe seguir en 0,32 s. El movimiento reducido ya lo apaga.

### P25. La línea de estaciones dibujada como tubería
- **Dónde:** `js/mod/tablero.js` 592–625 (`lineaEstaciones()`) y `css/plataforma.css` 1302–1316 y 1612–1618. Verificado.
- **Hoy:** cinco cajas en una rejilla que se ven como las cuentas de arriba. El comentario dice «es una tubería, no un ranking», pero nada lo dibuja, y en el teléfono se parten en dos renglones.
- **Propuesta:** conectores entre estaciones para que se lea el flujo de Ganado a Listo. En pantallas de 400 px o menos, una sola tira que se desliza en lugar de dos renglones.
- **Sale de:** React Bits · Stepper (solo la forma, sin animación).
- **Cómo en vanilla:** `::after` en cada `.tb-etapa` menos la última, y `scroll-snap` en pantallas angostas.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** siguen siendo filtros (`aria-pressed`) y no deben confundirse con las cuentas tocables del punto P3. No depender solo del color.

### P26. La banda de aviso entra sin empujar la pantalla
- **Dónde:** `js/app.js` 729–738 (`pintarBanda()`) y 741–774 (`revisarDispositivo()`, versión nueva en 752–755). También `index.html` 262 y `css/plataforma.css` 367–375 y 1650–1654. Verificado.
- **Hoy:** a mitad de sesión la banda aparece con `hidden=false` («Hay una versión nueva…») y baja toda la pantalla justo cuando alguien va a tocar.
- **Propuesta:** que se despliegue en 0,2 s y, si la persona ya había bajado en la pantalla, compensar el scroll para que el contenido no se mueva.
- **Sale de:** React Bits · FadeContent. Alternativa: AnimatedContent.
- **Cómo en vanilla:** `grid-template-rows:0fr→1fr` con `@starting-style`, y `scrollBy(0, alto)` cuando `scrollY > 0`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** la regla `[hidden]{display:none!important}` (317) mata cualquier transición, así que hay que usar una clase en lugar de `hidden`.

### P27. Barras de doce meses que crecen una vez y un mes que se puede abrir
- **Dónde:** `js/mod/control.js` 334–359 (`graficaMeses()`) y `css/plataforma.css` 1781–1799 (`.ct-b{transition:width}` en 1787–1788, que nunca corre). Verificado.
- **Hoy:** las barras nacen ya con su ancho final y un mes no se puede tocar. Para saber qué se vendió en agosto hay que filtrar la lista a mano.
- **Propuesta:** al entrar a Ventas, las barras crecen una sola vez desde 0. Tocar un mes abre un popover con sus ventas y su total: el desglose en popover (idea #4), llevado aquí.
- **Sale de:** Vengeance · Stats Counter (disparo único al verse). Alternativa: React Bits · AnimatedContent.
- **Cómo en vanilla:** poner el ancho en una variable después de un `requestAnimationFrame`, `IntersectionObserver` para disparar al verse, y la API `popover`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** un mes en cero no lleva barra (342–346). No volver a animar cuando la búsqueda repinta (621–625).

### P28. En el teléfono, las columnas de Proyectos como páginas
- **Dónde:** `js/mod/proyectos.js` 465–467 (`pintarLista()`, `.pj-lista-movil`), 416–429 y 488 (`ANCHO`). También `css/plataforma.css` 1379–1414. Verificado.
- **Hoy:** en el teléfono hay una tira de etapas y una lista, y se pierde la forma de «dónde se hace tapón».
- **Propuesta:** las cinco columnas como páginas a pantalla completa que se deslizan, sincronizadas con la tira de arriba y con la cuenta de cada una.
- **Sale de:** React Bits · Carousel. Alternativa: Skiper · skiper54 Shadcn clipPath Carousel (GRATIS).
- **Cómo en vanilla:** `scroll-snap-type:x mandatory`, e `IntersectionObserver` para saber la página visible y actualizar `aria-pressed`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** hay que decidir qué pasa con «Todas». No pelear con el gesto de atrás de Android en el borde de la pantalla.

### P29. Deslizar un renglón del Tablero para avanzarlo
- **Dónde:** `js/mod/tablero.js` 701–718 (`renglon()`) y 736–745, y `css/plataforma.css` 402–411 (en el teléfono las acciones van en su propio renglón). Verificado.
- **Hoy:** en el teléfono cada trabajo gasta un renglón entero en botones: treinta trabajos, treinta renglones de «Ya se armó · Abrir».
- **Propuesta:** la idea #9 aquí. Deslizar a la derecha avanza la etapa (con el deshacer del punto P4) y a la izquierda descubre «Abrir» y «Mover la fecha». Los botones se quedan para quien no desliza.
- **Sale de:** React Bits · SwipeRow.
- **Cómo en vanilla:** Pointer Events con `touch-action:pan-y` y un umbral por velocidad.
- **Valor · Esfuerzo:** Bajo · Medio
- **Cuidado:** nunca para el cruce de corte. Respetar roles. Dar una pista la primera vez para que se descubra.

### P30. Una barra de cuánto va cobrado en «Por cobrar»
- **Dónde:** `js/mod/control.js` 495–519 (`filaCobro()`) y 472–493. Verificado.
- **Hoy:** cada venta dice «vendido $X · anticipo $Y» y el saldo aparte. Para comparar cuánto falta de cada una hay que hacer la resta.
- **Propuesta:** una barra fina debajo del texto, con lo cobrado en un color, el saldo en ámbar y el porcentaje escrito.
- **Sale de:** React Bits · SloshGauge (solo la lectura del nivel, sin la física).
- **Cómo en vanilla:** `<meter>`, o dos `<i>` con ancho en porcentaje como las barras de `ct-grafica`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** cuando el saldo es estimado y no de la hoja (`x.deNotion`), la barra va rayada. Palabra además de color.

### P31. Tooltip de la barra lateral con el atajo de teclado
- **Dónde:** `js/app.js` 604–612 (`title` «Nombre · tecla N») y `css/plataforma.css` 346–357. Verificado.
- **Hoy:** el atajo solo vive en el `title` nativo, que tarda en salir, no tiene estilo y no existe en pantallas táctiles.
- **Propuesta:** en la computadora, un tooltip propio con la tecla en `<kbd>`. El primero espera, y los siguientes salen al instante mientras el grupo sigue «caliente».
- **Sale de:** React Bits · WarmTooltip. Alternativa: Skiper · skiper101 Custom tooltip (GRATIS).
- **Cómo en vanilla:** un solo nodo que se coloca en `pointerenter` y `focus`, con retardo compartido.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** solo con `hover:hover`. El nombre ya es el texto del botón, así que no hay que leerlo dos veces.

#### Descartado en esta zona
- **React Bits Dock / Vengeance Glass Dock:** agrandan iconos según la cercanía del cursor, y en el teléfono no hay cursor. La barra ya es un dock.
- **GooeyNav / FlowingMenu:** la gota que se deforma entre pestañas es puro espectáculo. La píldora que se desliza (punto P19) resuelve lo mismo.
- **CountUp / Stats Counter al montar las cuentas:** cada navegación remonta la pantalla. Contar desde 0 sería movimiento sin acción del usuario y el número estaría mal un segundo. Solo tiene sentido rodar cuando cambia (punto P18).
- **RotatingText / Morph Text en el título del encabezado:** el título se escribe antes de cargar para que se lea enseguida, y animarlo lo retrasa.
- **DecryptedText / Shuffle para destapar importes:** los caracteres revueltos sobre una cantidad en pesos parecen un error delante del cliente. El desenfoque (punto P12) basta.
- **ElectricBorder / StarBorder / BorderGlow en «sin decidir»:** serían otra pieza moviéndose sola, justo lo que la regla prohíbe.
- **RefineFrame / LatticeLoader para «Leyendo proyectos…» (`proyectos.js` 206):** los esqueletos ya existen (`sistema.css` capa 9). Basta con usar `.esq-b` con la forma de las columnas.
- **Shredder para «Quitar del tablero»:** dramatiza un borrado que ya es delicado. Confirmar con mantener presionado (punto P1) es lo correcto.

---

## Zona 4 · Plataforma — taller, material, mapa, ajustes y núcleo (F)

### F1. Aviso con mecha: la ventana de «Deshacer» se ve y se pausa
- **Dónde:** `js/nucleo/ui.js` líneas 131–153 (función `toast()`); `css/sistema.css` 1403–1416 (`.toast`, `.toast-act`, `.toast.ok/.err`) y 3876–3878 (`#toast`); caso que se pisa: `js/mod/material.js` 1323–1331 (`hacerContar()` lanza dos avisos seguidos). Verificado.
- **Hoy:** un `setTimeout` fijo esconde el aviso. No se ve cuánto queda para «Deshacer», el tiempo no se detiene con el dedo o el foco encima, y un segundo aviso reemplaza al primero aunque ese traiga «Deshacer».
- **Propuesta:** un filete de 2 px que se consume en exactamente `dur`, para cumplir el contrato de que «la ventana de deshacer dura lo que dura el aviso». Se congela mientras haya dedo, cursor o foco sobre el aviso, y el aviso se descarta deslizándolo hacia abajo. Si llega otro aviso con uno de «Deshacer» todavía vivo, se apilan (máximo 2) en vez de borrarse.
- **Sale de:** React Bits · SwipeToast (para la pila: AnimatedList).
- **Cómo en vanilla:** `el.animate([{transform:'scaleX(1)'},{transform:'scaleX(0)'}],{duration:dur})` en un `<span>`, que sustituye al `setTimeout` usando `anim.finished`, con `pause()/play()` en `pointerenter`/`focusin`. El gesto de deslizar va con Pointer Events y `translateY`, con un umbral de 40 px.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** la pausa por foco es la corrección de accesibilidad de verdad: hoy quien llega con el tabulador a «Deshacer» puede perderlo. `voz()` se queda igual. Con `prefers-reduced-motion` la mecha no se anima.

### F2. «Enviar» que se enciende al escribir y se vuelve «Detener»
- **Dónde:** `js/nucleo/asistente.js` 138–141 (`pintar()`, `#ia-pregunta` y `.ia-enviar`), 347–352 (`alEscribir()`), 111–115 (`cerrar()`, que hoy es la única forma de cancelar) y 62 (`_cancelado`); `css/plataforma.css` 1979–1981 (`.ia-pie .btn.ia-enviar`). Verificado.
- **Hoy:** el botón de enviar es un `btn-pri` lleno aunque el campo esté vacío. Mientras la IA contesta (hasta 60 s por proveedor y hasta 4 proveedores), el campo y el botón quedan `disabled`, y para cancelar hay que cerrar el asistente.
- **Propuesta:** el botón empieza fantasma y se llena de color en cuanto hay texto. Durante la espera se convierte en un cuadro de «Detener» que usa el mismo camino que `cerrar()` (`_cancelado` + `_abort`) sin cerrar el panel. En el hilo queda el mensaje de siempre: «Quedó sin respuesta».
- **Sale de:** React Bits · PromptBar (el botón de enviar que se llena y la flecha que se vuelve cuadro de stop).
- **Cómo en vanilla:** en el evento `input` se alterna una clase `.listo`. Con `_ocupado` se cambian el `<use href>` del icono y el `aria-label`. La transición de `background` va en CSS.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** hay un solo botón de color por pantalla, y un botón vacío no cuenta como tal. Durante la espera se usa `aria-disabled` en vez de `disabled`, para que «Detener» siga respondiendo al toque. Zona táctil de 44 px.

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

### F5. El riel del taller con sus hitos marcados
- **Dónde:** `js/nucleo/ui.js` 650–655 (`filaTaller()`: `.tal-pista`, `.tal-riel`, `.tal-hoy`); `css/plataforma.css` 1052–1062; los datos ya existen en `js/datos/taller.js` 290 (`hitos` de en_diseno, cortado, armado y listo) y 312–315 (`etapa_esperada`). Verificado.
- **Hoy:** el riel es una barra de «empezar» a «listo» con un punto que marca hoy. Los hitos intermedios, y cuál de ellos ya pasó el proyecto, solo están en la frase.
- **Propuesta:** tres marcas sobre el riel en las fechas de cortar, armar y listo. Van rellenas si `etapa_real` ya pasó ese hito y huecas si no. Una marca que quedó detrás del punto de hoy sin rellenar se pinta en rojo con muesca, así «voy tarde» se ve sin leer. El Calendario y el Tablero cambian a la vez, porque los dos usan la misma función.
- **Sale de:** React Bits · Stepper (los pasos como marcas, sin la animación; alternativa: Skiper74 Timeline calendar, PRO).
- **Cómo en vanilla:** `<i>` con posición absoluta y `left:%` calculado con `diasEntre`, igual que hoy `.tal-hoy`. CSS puro.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** `ui.js` no decide nada del taller: pinta lo que trae `v.hitos` y `v.etapa_real`. Rellena y hueca, además del color. El riel sigue `aria-hidden` y la frase sigue mandando.

### F6. El conteo del mes se palomea renglón por renglón sin perder el sitio
- **Dónde:** `js/mod/material.js` 607–657 (`filaExistencia()`, «Así está» en 646–647), 826–827 (`clicCuerpo()`), 886–891 (`aceptarDerivado()`) y 239–248 (`cargar()`, que en 241–243 pinta «Sumando el libro del almacén…» antes de repintar); `js/datos/stock.js` 207 (`frescura_dias`) y 243 (`existencia()`). Verificado.
- **Hoy:** cada «Así está» o «Corregir» pasa por `cargar()`, que cambia la lista entera por el aviso de carga y la vuelve a pintar. La página se encoge, el scroll salta y en 19 renglones hay que volver a buscar por dónde ibas. Tampoco se ve cuántos van contados hoy.
- **Propuesta:** el renglón contado se actualiza en su lugar: el sello dice «contado hoy por …» y el cuadro del icono se llena con una palomita. Arriba de la tarjeta, «Contados hoy: 7 de 19» avanza. La lista no se vacía entre toques.
- **Sale de:** React Bits · SpringCheck (con un toque se llena el cuadro y se dibuja la palomita).
- **Cómo en vanilla:** después de `Stock.aceptarDerivado`, se lee solo `Stock.existencia(id)` y se reemplaza ese `.mat-fila` con `outerHTML`, sin pasar por `cargar()`. La palomita es un `<path>` con `stroke-dashoffset`. El conteo sale de `frescura_dias === 0`.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** SpringCheck tacha y atenúa la etiqueta; aquí no se hace, porque no se usa `opacity` sobre texto (§4.3) y la marca va en el icono y en el sello. El orden del catálogo no se mueve, que es una decisión de `tabAlmacen()`.

### F7. Botones que dicen qué están haciendo, cuánto llevan y cómo terminó
- **Dónde:** `js/mod/ajustes.js` 1141–1149 (`conElPuente()`: aviso de 2 s y `_ocupado`, que ignora toques sin decir nada), 1246–1274 (`bombear()`), 1282–1311 (`jalar()`, hasta 20 vueltas) y 709–728 (botones de `cardPuente()`); `js/mod/fabricacion.js` 1078–1091 (`despachar()`, que solo pone `disabled`) para los casos `gcal` en 1146–1165 y `gcal-borrar` en 1170–1174. Verificado.
- **Hoy:** una llamada que tarda de 5 a 30 s solo se anuncia con un aviso que se va a los 2 s. Los botones del puente no se apagan: un segundo toque no hace nada y no dice por qué. El resultado llega en otro aviso, lejos del botón.
- **Propuesta:** el botón tocado cambia su rótulo por lo que está haciendo («Trayendo la hoja… vuelta 3 · 12 s») y se va llenando de izquierda a derecha. Sus hermanos pasan a `aria-disabled`. Al final queda «Listo ✓» en verde un momento, o «No contestó · Reintentar» con una sacudida corta.
- **Sale de:** React Bits · CallChip (alternativa: LatticeLoader, para el verbo con cronómetro).
- **Cómo en vanilla:** un helper `conEstado(btn, etiqueta, fn)` que guarda el rótulo, pone `aria-busy`, lleva un `setInterval` de 1 s y una capa con `transform:scaleX()`. `jalar()` ya sabe en qué vuelta va.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** el ancho del botón no debe brincar: `min-width` igual al del rótulo original. El resultado se sigue diciendo con `toast()`/`voz()`. Con movimiento reducido, solo cambia el texto.

### F8. La hoja de abajo se cierra deslizándola
- **Dónde:** `css/plataforma.css` 768–772 (en ≤560 px, `.pf-modal-bg` alinea abajo y `.pf-panel` lleva solo las esquinas de arriba) y 1581–1582 (`body.pf .pf-panel`); `js/nucleo/ui.js` 249–298 (`abrirCapa()`, `cerrarCapa()`, `cerrarCapaDeArriba()`). Verificado.
- **Hoy:** en el teléfono todas las fichas son hojas que salen de abajo (agendar, mover, contar, pegar link, asistente), pero no tienen asa ni responden al gesto de bajarlas. Solo se cierran con la X, el velo, Escape o el botón atrás.
- **Propuesta:** un asa de 36×4 px y arrastre hacia abajo desde el encabezado del panel. La hoja sigue al dedo con resistencia; pasado un umbral, o con un tirón rápido, se cierra por la función de cierre de esa capa. Si no, regresa a su lugar.
- **Sale de:** React Bits · SwipeToast (el mismo descarte por distancia o por velocidad, con banda elástica).
- **Cómo en vanilla:** Pointer Events en `.pf-panel-h` con `setPointerCapture`, `translateY` y la velocidad de los últimos 100 ms. Al soltar se llama a `cerrarCapaDeArriba()`, que consume la entrada de historial igual que el atrás.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** el arrastre no arranca si `.pf-panel-b` tiene `scrollTop>0` ni desde dentro de un campo. Solo aplica a ≤560 px. El asa tiene zona táctil de 44 px.

### F9. Pin a mano con retícula fija al centro
- **Dónde:** `js/mod/mapa.js` 836–847 (`abrirMano()`), 857–884 (`alTocarMapa()`, con el pin arrastrable) y 886–902 (`pintarModo()`); `css/plataforma.css` 1270 (`#mapa-lienzo.poniendo … cursor:crosshair`). Verificado.
- **Hoy:** hay que tocar el mapa donde está la obra y luego arrastrar un pin de 26 px. En el teléfono el dedo tapa justo ese punto, y la mira en cruz solo existe con ratón.
- **Propuesta:** en el modo de pin a mano, una retícula de cuatro esquinas se queda fija en el centro del lienzo. Se mueve el mapa debajo y «Guardar aquí» guarda el centro del mapa. Tocar sigue sirviendo para saltar cerca.
- **Sale de:** React Bits · TargetCursor (alternativa: Crosshair).
- **Cómo en vanilla:** un `<div>` absoluto centrado sobre `#mapa-lienzo` con `pointer-events:none`. En el evento `moveend` se actualiza `MANO.lat/lng` con `mapa.getCenter()`. El texto de `pintarModo()` pasa a decir «Mueve el mapa hasta que la cruz quede en la entrada».
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** nada se guarda sin tocar «Guardar aquí», para que siga sin haber pines en medio del océano. La retícula lleva un contorno contrario al tema para verse de noche. No debe tapar los controles de Leaflet.

### F10. La puerta de entrada dice en qué paso va
- **Dónde:** `js/nucleo/puerta.js` 495–535 (`pintar()`, con el botón «Entrando…» en 519–523), 472–491 (clic en `[data-puerta]`) y 282–314 (`confirmarDeVerdad()`: primero Google, luego la hoja); `css/sistema.css` 5138–5153 (`.puerta-aviso`, `.puerta-btn`). Verificado.
- **Hoy:** hasta 180 s con solo «Entrando…» y el giro. Un Apps Script en frío tarda de 5 a 10 s y la pantalla parece congelada. Si el reintento falla con el mismo aviso, el HTML queda idéntico y parece que no pasó nada.
- **Propuesta:** dos renglones debajo del botón, «Google · tu cuenta» y «La hoja · qué te toca», cada uno con su reloj corriendo y terminando en ✓ o ✗. Si el aviso nuevo es igual al anterior, da una sacudida corta que dice «lo intenté otra vez».
- **Sale de:** React Bits · LatticeLoader (verbo con cronómetro que termina en ✓ o ✗; alternativa: StatusMark).
- **Cómo en vanilla:** `confirmarDeVerdad()` recibe un `onPaso(fase)` que `pintar()` escucha, con `setInterval` de 1 s. La sacudida es una clase con `@keyframes` de 250 ms que se quita en `animationend`.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** entre el clic y `requestAccessToken` no puede haber nada, como explica la cabecera, porque la ventana de Google se bloquea. Los pasos se pintan después. El `.esq-giro` que ya existe basta y la retícula es opcional. Se conserva `role="alert"`.

### F11. Cambiar de mes deslizando con el dedo
- **Dónde:** `js/mod/fabricacion.js` 603–637 (`pintarMes()`), 644–646 (`nav()`), 1044–1051 (`alTocar()`, rama `data-mueve`) y 428 (`pintar()`, que reescribe todo con `innerHTML`); `css/plataforma.css` 489–490 (`.cal-rej`). Verificado.
- **Hoy:** el mes solo cambia con ‹ › o con ← → del teclado, y la rejilla se reemplaza de golpe. El foco del botón de mes se pierde en el repintado.
- **Propuesta:** arrastrar la rejilla a los lados cambia de mes (o de semana en esa vista), y la rejilla nueva entra desde el lado del gesto en unos 200 ms. El foco regresa al control que se usó.
- **Sale de:** React Bits · Carousel (el gesto con umbral y dirección).
- **Cómo en vanilla:** Pointer Events en `.cal-rej` con `touch-action:pan-y` y un umbral de 48 px. La transición con `document.startViewTransition()` y `::view-transition-old/new` desplazados según la dirección. Sin soporte, se cambia sin transición.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** hay que distinguir arrastre de toque, porque tocar un día sigue abriéndolo. Con movimiento reducido no hay transición; se pregunta con `matchMedia`, como en `scrollSuave()`. `.cal-cab` se queda quieto.

### F12. Las paradas del día como tarjetas sobre el mapa
- **Dónde:** `js/mod/mapa.js` 705–756 (`pintarRuta()`), 669–679 (`volarA()`, con `setView`) y 360–384 (`armazon()`); `css/plataforma.css` 681–692 (`.mapa-2col`, una sola columna en ≤759 px) y 708–713 (`#mapa-lienzo`, 45dvh en el teléfono). Verificado.
- **Hoy:** en el teléfono la ruta es una lista debajo del mapa. Para ver una parada hay que bajar, tocar «Ver en el mapa» y volver a subir.
- **Propuesta:** con la ruta ordenada, una tira de tarjetas pegada al borde de abajo del mapa, con número, nombre, hora y «Abrir en Google Maps». Deslizar a la siguiente mueve el mapa a ese pin y abre su globo; tocar un pin lleva la tira a su tarjeta. La lista de abajo se queda para la computadora y para el lector de pantalla.
- **Sale de:** React Bits · Carousel (alternativa: Skiper48 Card swipe carousel; hay que revisar su licencia).
- **Cómo en vanilla:** `overflow-x:auto` con `scroll-snap-type:x mandatory` (ya se usa en `.pj-tablero`), un `IntersectionObserver` para saber qué tarjeta quedó al centro y `mapa.flyTo()` de Leaflet; con movimiento reducido, `setView`.
- **Valor · Esfuerzo:** Alto · Alto
- **Cuidado:** la tira no puede tapar el crédito de OpenStreetMap, que exige su licencia. Botones de 44 px. La nota del punto de salida supuesto sigue visible.

### F13. «Recibí lo de la lista» y «Actualizar» con su «Deshacer» en el mismo botón
- **Dónde:** `js/mod/material.js` 425–433 (`tabComprar()`), 789–804 (`pintarMbar()`) y 863–884 (`recibirTodo()`); 394–415 (`fila_calibracion()`) y 909–919 (`aplicarCalibracion()`). Verificado.
- **Hoy:** un toque mete N entradas al libro, o cambia una constante, y el único arreglo es un conteo a mano o volver a escribir el valor.
- **Propuesta:** al tocar, el rótulo pasa a «Deshacer» y un hilo se consume durante 8 s; tocarlo revierte. En la calibración, revertir es guardar el valor anterior, que ya está en `CTES`.
- **Sale de:** React Bits · FuseButton.
- **Cómo en vanilla:** el botón guarda `r.valor`, cambia el texto y el `aria-label`, y anima una capa con `transform:scaleX` usando WAAPI.
- **Valor · Esfuerzo:** Alto · Alto
- **Cuidado:** hoy `js/datos/stock.js` no tiene cómo anular una recepción. Habría que escribir esa función, con un movimiento compensatorio sellado y sin borrar renglones. Esto no es un «¿seguro?», que la cabecera de `recibirTodo()` descarta a propósito. El hilo dura lo mismo que el aviso con «Deshacer».

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

### F20. «Guardar lo que cambiaste» se enciende cuando hay cambios
- **Dónde:** `js/mod/material.js` 1082–1086 (`filaConstante()`, `data-antes`), 954–958 (pie de `htmlHoja()`) y 1108–1117 (`guardarConstantes()`, con su aviso «No cambiaste ningún número»). Verificado.
- **Hoy:** el botón azul está siempre encendido y nada indica qué campos se tocaron.
- **Propuesta:** el botón empieza fantasma y se llena de color cuando algún campo difiere de `data-antes`, con la cuenta: «Guardar 2 cambios». Cada campo cambiado lleva un filete ámbar y, debajo en chico, el valor anterior.
- **Sale de:** React Bits · PromptBar (el botón que se llena cuando hay algo que mandar).
- **Cómo en vanilla:** un oyente de `input` delegado en `#pf-hoja` y la clase `.cambiado` en el `.fld`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** un solo botón de color. El valor actual se queda a contraste completo.

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

### F25. La ruta se dibuja y se numera al ordenarla
- **Dónde:** `js/mod/mapa.js` 685–703 (`calcularRuta()`), 642–654 (`dibujarLinea()`) y 588–592 (el icono con número en `refrescarPines()`); `css/plataforma.css` 1265 (`.mapa-ruta-linea`). Verificado.
- **Hoy:** la línea y los números aparecen de golpe.
- **Propuesta:** la línea se traza en unos 800 ms y cada pin cambia su letra por su número cuando la línea llega a él. Pasa una sola vez.
- **Sale de:** React Bits · StrokeText (el trazo que se dibuja) (alternativa: Skiper19 Svg follow scroll, GRATIS).
- **Cómo en vanilla:** `getTotalLength()` y `stroke-dashoffset` con WAAPI sobre el `<path>` que pinta Leaflet; al terminar se devuelve el punteado `7 7`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** solo al calcular la ruta, no al repintar ni al hacer zoom. Con movimiento reducido aparece entera.

### F26. Qué hay en un día sin abrirlo, en la computadora
- **Dónde:** `js/mod/fabricacion.js` 681–696 (`celdaDia()`: la respuesta completa vive en `aria-label` y solo el punto del semáforo tiene `title`). Verificado.
- **Hoy:** con ratón, para saber qué esconde un «+2» hay que tocar la celda, lo que repinta la pantalla.
- **Propuesta:** con `hover:hover`, una ficha con el texto del `aria-label`. La primera vez espera 400 ms; después sigue al cursor sin espera.
- **Sale de:** React Bits · WarmTooltip.
- **Cómo en vanilla:** un solo `<div role="tooltip">` que se reutiliza, con `pointerover` delegado en `.cal-rej`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** solo con `(hover:hover)`. La ficha va arriba de la celda y no sustituye al toque.

### F27. «BORRAR» en casillas que se validan al teclear
- **Dónde:** `js/mod/ajustes.js` 1389–1405 (`cordonFinal()`, `#aj-borrar`) y 1407–1413 (`cordonBorrar()`, que solo valida al apretar). Verificado.
- **Hoy:** se escribe en un campo libre y el error se descubre al tocar «Borrar de verdad».
- **Propuesta:** seis casillas que se van llenando, y «Borrar de verdad» solo se habilita con BORRAR completo.
- **Sale de:** React Bits · CodeSlots.
- **Cómo en vanilla:** el mismo `<input>` transparente encima de seis `<span>`, y `aria-disabled` en el botón hasta que el valor sea «BORRAR».
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** `aria-disabled` y no `disabled`, para que el botón siga explicando por qué no se puede. Nada de festejo al completar.

### F28. El menú de tu cuenta sale de su botón (ya propuesta n.º 4, otro lugar)
- **Dónde:** `js/nucleo/cuenta.js` 31–67 (`montar()`: `hidden`, clic fuera y Escape hechos a mano); `index.html` 235–236 (`#pf-sesion-menu role="menu"`); `css/plataforma.css` 141–143. Verificado.
- **Hoy:** aparece de golpe y dice `role="menu"` sin navegación con flechas.
- **Propuesta:** un `popover` nativo que crece desde la esquina del avatar y se cierra solo al tocar fuera.
- **Sale de:** React Bits · GlideSelect (el menú que sale de su propia esquina).
- **Cómo en vanilla:** `popover="auto"` con `popovertarget`, `transform-origin:top right` y `@starting-style`. Se quitan los dos oyentes globales de `document`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** «Cerrar sesión» sigue pasando por `confirmarPf()`. El rol debe ser de diálogo, o el menú necesita flechas.

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

### F31. Palomita al copiar (ya propuesta n.º 6, otro lugar)
- **Dónde:** `js/mod/fabricacion.js` 1556 y 1793–1796 (orden de trabajo), `js/nucleo/asistente.js` 211 y 307–311 (`.ia-copiar`), `js/mod/mapa.js` 954–955 y 1095–1097 («Copiar dirección»); `js/nucleo/ui.js` 407–427 (`copiarTexto()`). Verificado.
- **Hoy:** solo lo confirma el aviso de abajo; el botón que se tocó no cambia.
- **Propuesta:** durante 1.5 s el icono se vuelve una palomita que se dibuja y el rótulo dice «Copiada».
- **Sale de:** la pieza de la n.º 6.
- **Cómo en vanilla:** `copiarTexto()` ya recibe `extra` como retrollamada de éxito; ahí se cambia el `<use href>`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** el aviso y `voz()` se quedan.

### F32. Los pasos de Google Cloud y del puente se palomean y se recuerdan
- **Dónde:** `js/mod/ajustes.js` 478 (`cardGcal()`, 13 pasos en `<ol class="aj-pasos">`) y 566 (`cardPuente()`); `css/plataforma.css` 1161–1163. Verificado.
- **Hoy:** al ir y volver de la consola de Google en el teléfono, se pierde por qué paso ibas.
- **Propuesta:** cada paso se palomea al tocarlo, el primero sin palomear queda resaltado como «vas aquí», y se recuerda en este dispositivo.
- **Sale de:** React Bits · Stepper.
- **Cómo en vanilla:** cada `<li>` es un botón y el estado va por `Prefs`, con su try/catch.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** los textos siguen saliendo de `Gcal.instrucciones()` y `Puente.instrucciones()`.

### F33. Los pines entran y salen al filtrar
- **Dónde:** `js/mod/mapa.js` 1044–1053 (`clicCuerpo()`, rama `data-g`) y 576–606 (`refrescarPines()`, con `clearLayers()`). Verificado.
- **Hoy:** al apagar una etapa, sus pines desaparecen de golpe y no se ve cuáles se fueron.
- **Propuesta:** los que se van se encogen y los que llegan crecen, en 160 ms; los que se quedan no se tocan.
- **Sale de:** React Bits · FadeContent.
- **Cómo en vanilla:** se compara por `proyecto_id` en lugar de vaciar con `clearLayers()`, y se anima `.mapa-pin` con WAAPI.
- **Valor · Esfuerzo:** Bajo · Medio
- **Cuidado:** `MARCAS` tiene que seguir al día para `volarA()`. Sin animación con muchos pines o con movimiento reducido.

#### Descartado en esta zona
- **Shredder / PaperCrumple en «No se dio» o «Cancelarla»:** la cancelación se guarda y se ve a propósito («esconderla es no haberla guardado»), y una trituradora dice lo contrario.
- **SpringCheck en «Por comprar»:** `material.js` 519–520 y 857–862 deciden que la casilla es del papel; en la pantalla se toca «Recibí».
- **TextType / DecryptedText en las respuestas del asistente:** la respuesta ya llegó completa y teclearla solo retrasa la lectura. La espera la cubre F14.
- **VoicePill en el asistente:** el teclado del teléfono ya dicta, y pedir el micrófono sería un permiso más en el teléfono del taller.
- **ElectricLogo / MetallicPaint / Noise en la puerta:** WebGL o un lienzo corriendo en la primera pantalla de un teléfono de gama media, y sería una segunda pieza que se mueve sola.
- **HoldButton o SlideCommit en «Borrar de verdad»:** ya lleva dos paneles, respaldo obligatorio y BORRAR escrito a mano; una tercera traba no protege más.
- **Dock con magnificación en la barra de módulos:** con el dedo no hay proximidad, y la barra ya es un dock de vidrio.
- **Radar / DotGrid de fondo en el mapa:** compite con los pines, que ya se distinguen por forma, letra y color.

---

## Zona 5 · Anidador, páginas públicas y PWA (A)

### A1. Verificar a mano: el código en casillas y un folio que sí viene en el papel
- **Dónde:** `verificar.html` líneas 59–67 y 127–133 (`#ver-form`, `#f-f`, `#f-c`, listener `submit`); `js/cotizador/entrega.js` 513–518 (`verificacionHTML()`) y 857 (el folio de la cabecera del PDF); `puente/hoja-apps-script.gs` 2899–2903 (`folioValido()`) y 3291. Verificado.
- **Hoy:** son dos campos de texto libre. El formulario pide el «folio completo» (`COT-0042@K7QM`), pero el PDF imprime solo `COT-0042` y junto al QR pone solo la dirección y el código. Como `folioValido()` exige la `@`, quien teclea desde el papel una cotización buena recibe «No auténtica».
- **Propuesta:** el código va en 3 grupos de 4 casillas. Aceptan pegar «A1B2-C3D4-E5F6», pasan a mayúsculas y rechazan lo que no sea hexadecimal; se lavan en verde al acertar y se vacían en cascada al fallar. El origen también se arregla: imprimir el folio completo en el bloque del QR, o que `/verificar` busque solo por código. Si ya hay resultado por QR, el formulario se pliega en un `<details>`.
- **Sale de:** React Bits · CodeSlots (alternativa: Skiper · skiper106 Smooth caret input, GRATIS).
- **Cómo en vanilla:** un solo `<input>` oculto con `autocapitalize="characters"` se queda con el foco, el pegado y el autocompletado. Los 12 `<span>` se pintan desde su `value` en cada `input`, y el relleno es una `transition` de CSS.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** CodeSlots solo acepta dígitos y aquí el alfabeto es 0-9A-F (`normalizarCodigo()`, .gs 2970), así que conviene convertir O→0 e I/L→1 al teclear. Las casillas son solo dibujo: la zona táctil de 44 px es la fila entera. El falso «No auténtica» va primero aunque lo demás no se haga.

### A2. La espera se convierte en el veredicto
- **Dónde:** `verificar.html` 45 (`h1`), 49–50 (`#ver-est`, `.ver-giro`), 81–94 (`ESTADOS`, `pintar()`) y 107–109 (el `catch` de «Sin respuesta»); `css/publico.css` 105–120. Verificado.
- **Hoy:** un anillo gris gira junto al texto. Al llegar la respuesta cambian el color de la tarjeta y el texto, pero el título sigue preguntando «¿Esta cotización es auténtica?».
- **Propuesta:** un glifo de 44 px que empieza como el arco que gira y termina en ✓ (auténtica), ✕ (no auténtica o revocada) o «!» (ya no vigente o sin respuesta). El título pasa a ser la respuesta («Auténtica.») con un fundido breve. En «Sin respuesta» se reintenta sola al volver la señal.
- **Sale de:** React Bits · StatusMark (alternativa para el título: Vengeance · Morph Text). Es la palomita del #6 llevada a esta página, pero naciendo del giro.
- **Cómo en vanilla:** un SVG con un `<circle>` (arco con `stroke-dasharray` que gira) y un `<path>` de la marca con `stroke-dashoffset` en `transition`. La clase `ok/av/mal` que ya pone `pintar()` decide cuál se dibuja. Para el reintento, `addEventListener('online', …)`.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** el color nunca va solo, siempre glifo y palabra. La `<section>` ya es `aria-live`; si el `h1` también lo fuera, se anunciaría dos veces. Con movimiento reducido, el glifo final aparece sin trazo.

### A3. Un sello AL3D para «Auténtica»
- **Dónde:** `verificar.html` 40–43 (`.pub-marca`; el `<img>` de la línea 41 no lleva `.logoimg`), 51–56 (`#ver-datos`) y 20–22 (las hojas enlazadas; falta `css/vidrio.css`). Verificado.
- **Hoy:** «auténtica» es una tarjeta verde con cuatro datos. Sin `.logoimg`, `js/tema.js` (105–111) no cambia el logo y de noche el «AL» se pierde sobre el marino. Es el mismo defecto que ya se corrigió en `js/nucleo/puerta.js` 506–511. Además, sin `vidrio.css` la página pinta en la letra del sistema aunque baja Sora y Manrope.
- **Propuesta:** un sello circular con el logo al centro y alrededor «AL3D · COTIZACIÓN AUTÉNTICA · dominio · consultado hoy 14:32». Cae una vez con un golpe de sello. En «ya no vigente» y en «revocada» sale gris y cruzado. De paso, poner `.logoimg` y enlazar `vidrio.css`.
- **Sale de:** React Bits · CircularText (sin su giro continuo), más el sellado final de TearTicket.
- **Cómo en vanilla:** un SVG con `<textPath>` sobre un círculo y el logo en `<image href="logo-al3d.svg">`. Un `@keyframes` de una sola pasada, de `scale(1.08) rotate(-8deg)` a `none`.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** un sello bonito se falsifica fácil en una captura. Que lleve la hora de la consulta y el dominio, y una línea: «La prueba es esta dirección, no la imagen». Queda quieto después de caer. En papel, estático.

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

### A9. Deshacer con mecha: al volver a acomodar desde cero y al quitar un retazo
- **Dónde:** `anidador-vectores/js/app.js` 558–572 y 599 (`iniciar()`: `config()` borra el cálculo y deja `T.mejor=null`), 741 (la etiqueta del botón), 321–325 (`quitarRetazo()`) y 136–143 (`toast()` local, sin acción). Verificado.
- **Hoy:** un toque en «Volver a acomodar desde cero» tira el mejor acomodo encontrado, que puede llevar minutos de cálculo, y no hay vuelta. La × de un retazo lo borra de una vez y el aviso no trae «Deshacer».
- **Propuesta:** guardar `T.anterior` y avisar «Se guardó el acomodo anterior (78 %, 2 hojas) · Recuperar» con una mecha de 8 s. Recuperar lo deja listo para descargar. Lo mismo al quitar un retazo.
- **Sale de:** React Bits · FuseButton, el deshacer que se quema (alternativa para el reinicio: el #5 HoldButton ya propuesto).
- **Cómo en vanilla:** portar la firma `toast(msg,tipo,dur,accion)` de `docs/SISTEMA-DE-DISENO.md` §6.2, porque el anidador tiene una versión sin acción. La mecha es un `::after` con `scaleX` en `.toast` que dura lo mismo que el aviso.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** lo recuperado no se puede «seguir buscando» porque el motor ya no lo tiene: `#an-seguir` sigue escondido. Con acción, el aviso dura 8 s como mínimo (es el contrato de §6.2).

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

### A14. Comparar con el papel, renglón por renglón
- **Dónde:** `verificar.html` 46–47 («Compara lo que dice aquí con tu papel»), 51–56 (`#ver-datos`) y 114–120. Verificado.
- **Hoy:** la página pide comparar y enseña cuatro datos, pero no ayuda a hacerlo ni dice qué hacer si algo no cuadra. «Confírmala directo con AL3D» no dice cómo.
- **Propuesta:** cada renglón (folio, fecha, negocio, total) lleva «Coincide» y «No coincide». Cada «Coincide» dibuja su palomita y atenúa el renglón; con los cuatro sale «Todo coincide con tu papel». Un «No coincide» cambia la tarjeta al aviso de documento alterado, con un botón para escribir a AL3D con el folio ya puesto.
- **Sale de:** React Bits · SpringCheck.
- **Cómo en vanilla:** un `<button aria-pressed>` por renglón y la palomita con `stroke-dashoffset`. El contacto es un enlace `wa.me` o `mailto:` con el texto ya armado.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** la página promete no mostrar datos del cliente, así que el contacto es el de AL3D; falta confirmar con Elías cuál. No se guarda nada de lo que se marca.

### A15. Esquinas que señalan lo que se va a quedar fuera
- **Dónde:** `anidador-vectores/js/app.js` 377–383 (los avisos de textos, `<use>`, imágenes y recortes), 528–530 (`pintarArchivo()`) y 584–591 (las piezas que no caben); `css/anidador.css` 250 (todo se pinta como la misma silueta). Verificado.
- **Hoy:** el aviso dice «Trae 3 textos sin convertir», pero en la vista todo es la misma silueta y no se sabe cuáles son. Las piezas que no caben solo se cuentan.
- **Propuesta:** al tocar un aviso, cuatro esquinas se cierran sobre esos elementos en la vista previa. Las piezas que no caben llevan las mismas esquinas, en rojo. Otro toque las suelta.
- **Sale de:** React Bits · TargetCursor (solo las esquinas que se fijan, sin cursor).
- **Cómo en vanilla:** `getBBox()` de cada elemento en el clon de la vista, y por cada uno una `<g>` con cuatro trazos en L que entran de `scale(1.4)` a `none`. Para las que no caben, `poly.source` (`svgnest.js` 623) dice qué elemento es.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** los avisos se cuentan ANTES de `sanear()` (línea 386): solo se marca lo que sigue en la vista. El rojo siempre va con su palabra.

### A16. Descargar por hoja desde un menú, y mandar el archivo
- **Dónde:** `anidador-vectores/index.html` 252–253 (`#an-dl`, `#an-dl-hojas`); `js/app.js` 722–731 (un botón «Solo la hoja N» por hoja) y 805–816 (`descargar()`). Verificado.
- **Hoy:** un botón descarga todas y debajo hay un botón fantasma por hoja: con 5 hojas son 6 botones.
- **Propuesta:** «Descargar SVG ▾» abre un menú desde su esquina: Todas (una capa por hoja), Hoja 1, Hoja 2… y Compartir, para mandarlo por WhatsApp o correo a la computadora del láser.
- **Sale de:** React Bits · GlideSelect.
- **Cómo en vanilla:** `popover` con `popovertarget`. El resaltado es un solo `div` que se mueve con `transform` en `pointerover` y `focus`. Compartir usa `navigator.canShare({files})` y se esconde si no hay soporte.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** hay un solo botón de color por pantalla y ya es «Acomodar». Renglones de 44 px. Es la misma técnica del popover del #4, en otro lugar.

### A17. Sin señal: el anuncio apagado que se enciende al volver
- **Dónde:** `sw.js` 363–364 (la `Response` 503 de texto plano), 416 (`cotizador()` lanza el error y el navegador pinta su página) y 50–53 (`BASICOS`: los logos ya están en caché). Verificado.
- **Hoy:** sin señal y sin copia guardada, la plataforma enseña una línea de texto plano en la letra del sistema, y el cotizador la página de error del navegador.
- **Propuesta:** una página mínima de AL3D con el logo «apagado» (gris, sin brillo), el texto «Sin señal y sin copia guardada todavía: ábrela una vez con señal» y un botón «Reintentar». Al volver la señal, el logo se enciende y la página recarga sola.
- **Sale de:** React Bits · ElectricLogo (solo la idea del logo que se enciende; el componente es canvas y no se porta).
- **Cómo en vanilla:** el HTML se arma dentro de `sw.js`, con el CSS en línea. El `<img src="logo-al3d.svg">` lo sirve la misma caché. En el evento `online`, `filter:grayscale(1)` pasa a color con `drop-shadow`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** nada de fuentes ni guiones de fuera, y esta respuesta no se guarda en caché. El encendido es un momento breve.

### A18. Instalar en iPhone con dos pasos dibujados
- **Dónde:** `js/app.js` 1271–1279 (`instalarApp()`: en iPhone, un aviso de texto de 9 s); `manifest.webmanifest` 19–24 (`shortcuts` sin la Mesa de corte, y el manifiesto no trae `screenshots`). Verificado.
- **Hoy:** un gesto de dos pasos en la interfaz de Safari se explica con un texto que se va solo. En Android sale el diálogo de instalación mínimo.
- **Propuesta:** en iPhone, una hoja con dos pasos ilustrados (el ícono de Compartir y luego «Agregar a inicio») y una flecha hacia donde está el botón en Safari. En el manifiesto, `screenshots` y el atajo «Mesa de corte».
- **Sale de:** React Bits · Stepper.
- **Cómo en vanilla:** el `.modal` del sistema (§2.8) con dos pasos y un indicador; los íconos en SVG en línea.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** `docs/pantalla-*.png` miden 2880 × 1880: sirven para `form_factor:"wide"`, pero para teléfono hace falta una captura angosta. El atajo abre algo que solo ven Dirección y Fabricación. Hay dos manifiestos iguales: se cambian los dos.

### A19. Índice en las páginas legales
- **Dónde:** `condiciones.html` 42–98 (nueve `h2` numerados), `privacidad.html` 43–136 (diez `h2`); `css/publico.css` 48. Verificado.
- **Hoy:** no hay índice. Para llegar a «Respaldos» o a «Cómo quitas tu acceso» hay que bajar por todo el documento.
- **Propuesta:** un índice corto bajo la entradilla. De 1000 px para arriba va pegado en una columna al lado; en el teléfono va plegado en «En esta página». Al saltar a una sección, su título destella una vez.
- **Sale de:** React Bits · LineSidebar, la lista sin el efecto de proximidad, que es de ratón (alternativa: Vengeance · FAQ Accordion, solo para plegar el índice).
- **Cómo en vanilla:** un `id` en cada `h2` con `scroll-margin-top`, y `h2:target{animation:scFlash 1.5s}` con los keyframes que ya existen en `css/sistema.css` 1915. El plegado es un `<details>` nativo.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** estas páginas no llevan guiones a propósito (`publico.css` 18–20): todo en HTML y CSS. Se pliega el índice, nunca el texto.

### A20. Créditos y licencias en un solo lugar
- **Dónde:** `acerca.html` 74–83 («Quién responde por esto» y el pie); `anidador-vectores/index.html` 295–297 (SVGnest, el único crédito de la app). Verificado.
- **Hoy:** solo SVGnest tiene crédito. Leaflet, qrcodegen, OpenStreetMap/Carto y lo que se porte de estas librerías no aparecen juntos en ningún lado.
- **Propuesta:** una sección «Créditos y licencias» en `acerca.html`, con un renglón por pieza, su licencia y su liga, y un enlace «Créditos» en el pie de las cuatro páginas públicas.
- **Sale de:** ninguna librería: es un requisito de ellas (Skiper GRATIS pide atribución; React Bits es MIT + Commons Clause). Para los enlaces, Vengeance · Line Hover Link.
- **Cómo en vanilla:** HTML y CSS; el subrayado crece con `background-size` en `:hover` y `:focus-visible`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** cada pieza portada de Skiper necesita su renglón, por ejemplo skiper87 o skiper41 si entran por los #10 y #11. El aviso de licencia de React Bits también se queda en la cabecera del archivo portado.

### A21. La orientación de la hoja, a la vista
- **Dónde:** `anidador-vectores/index.html` 189–213 (las tarjetas, con `--w` y `--h` fijos, y `#an-girar`); `js/app.js` 214–221 (`sincronizarHoja()`), 256–271 y 280–284; `css/anidador.css` 100–107. Verificado.
- **Hoy:** las tarjetas siempre dibujan la hoja parada. «Girar la hoja» solo intercambia los números y lanza un aviso; la tarjeta sigue dibujándola parada.
- **Propuesta:** con la hoja acostada, la hojita de cada tarjeta gira 90° con un pequeño rebote, y el ícono de «Girar» gira con ella.
- **Sale de:** React Bits · FlipCard (el asentado con resorte), aplicado a 90° y no a 180°.
- **Cómo en vanilla:** `sincronizarHoja()` pone la clase `.acostada` en `#an-tiles`, que aplica `.an-tile-hoja{transform:rotate(90deg)}` con `transition`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** `--mv-liq` es «SOLO lo que es de vidrio» (`sistema.css` 445): aquí va `--mv-r`. El marco de la figura mide 46 px y la hoja completa acostada (44 × 22) cabe.

### A22. Avisar que la app se actualizó
- **Dónde:** `js/app.js` 1193 (`recargar()`), 1197–1217 (`controllerchange`) y 752–755 (la banda «Hay una versión nueva…»); `sw.js` 43 (`APP_VERSION`). Verificado.
- **Hoy:** la versión nueva recarga la página sola al cambiar de pantalla o al irse la app a segundo plano. Quien la usa ve un parpadeo completo sin explicación, y puede ser delante del cliente.
- **Propuesta:** después de esa recarga, un aviso breve y deslizable: «Se puso la versión nueva de la app», con el brillo del logo (A29) una sola vez.
- **Sale de:** React Bits · SwipeToast.
- **Cómo en vanilla:** `recargar()` deja una marca en `sessionStorage`; el arranque la lee, la borra y llama a `toast()`. El deslizar para cerrar va con Pointer Events.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** no en la primera instalación (`ignorarUno`). La página no conoce `APP_VERSION`: no hay que inventar el número.

### A23. Las manchas del logo como carga
- **Dónde:** `verificar.html` 50 (`.ver-giro` en «Consultando el registro de AL3D…»), `css/publico.css` 116–120; también `js/nucleo/puerta.js` 519–522 («Entrando…») y `css/sistema.css` 5084–5086 (`.esq-giro`). Verificado.
- **Hoy:** el mismo anillo gris de toda la app, también en la única página que ve un tercero.
- **Propuesta:** tres círculos en los azules del logo (#341efd, #4267fe, #6290ff) que se juntan y se separan como líquido. Al llegar la respuesta se quedan en la forma del logo.
- **Sale de:** Skiper · skiper64 Gooey Effect, GRATIS (la idea viene de React Bits · MetaBalls, que es WebGL y no se porta).
- **Cómo en vanilla:** un SVG de 48 × 24 con tres `<circle>` y un `<filter>` (`feGaussianBlur` más un `feColorMatrix` de umbral). Los círculos se mueven con `transform` en `@keyframes`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** esos azules no llevan texto. La carga se apaga en cuanto hay respuesta; con movimiento reducido, logo quieto. Lleva atribución de Skiper.

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

### A26. El filete de marca como progreso de lectura
- **Dónde:** `css/sistema.css` 487–494 (`body::before`, el filete de 3 px), en `condiciones.html` y `privacidad.html`. Verificado.
- **Hoy:** el filete es fijo; en un documento largo nada dice cuánto falta.
- **Propuesta:** en las páginas `body.pub` largas, el filete se llena de izquierda a derecha conforme se lee.
- **Sale de:** Skiper · skiper89 Scroll progress 001, GRATIS.
- **Cómo en vanilla:** CSS puro, con una animación ligada al scroll: `animation-timeline:scroll(root)` sobre un `scaleX`, dentro de un `@supports`. Sin soporte queda el filete de hoy.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** cero JS, como exige `publico.css`. La parte vacía va en `--a-suave` para que la marca no desaparezca al 0 %.

### A27. El título de «acerca» se enciende como neón
- **Dónde:** `acerca.html` 38 (`<h1>La plataforma del taller</h1>`), `css/publico.css` 47. Verificado.
- **Hoy:** un título plano, en la página que ven los revisores de Google y quien toca «Qué es esto» en la puerta.
- **Propuesta:** el contorno del título se traza como un tubo de neón flex y se enciende una vez, con relleno y un halo suave; luego queda quieto.
- **Sale de:** React Bits · StrokeText.
- **Cómo en vanilla:** CSS puro, porque la página tiene `script-src 'self'` y ningún guion propio. `-webkit-text-stroke` con `color:transparent` pasa a relleno en `@keyframes`, con un `text-shadow` en `--a` al final.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** el halo es adorno: el título tiene que leerse igual sin él. El neón fuerte es el del #7 al autorizar; éste va discreto (alfa ≤ .25).

### A28. «Qué hace» en cuatro tarjetas
- **Dónde:** `acerca.html` 47–57 (`<h2>Qué hace</h2>` y su lista de cuatro). Verificado.
- **Hoy:** una lista con viñetas.
- **Propuesta:** una rejilla de 2 × 2, cada tarjeta con una ilustración mínima hecha con piezas del propio sistema: una letra 3D (cotiza), tres puntos de etapa (obra), el ícono `i-anidar` (corte) y una línea de ventas (dinero). Todo quieto.
- **Sale de:** Vengeance · Why Us Bento Grid, sin isométricos ni avatares (alternativa: React Bits · MagicBento, sin su foco de luz).
- **Cómo en vanilla:** CSS grid, que pasa a una columna bajo 480 px; ilustraciones en SVG en línea.
- **Valor · Esfuerzo:** Bajo · Medio
- **Cuidado:** `publico.css` no declara colores propios: solo tokens. Nada de efectos de hover, que en el teléfono no existen.

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

#### Descartado en esta zona
- React Bits · CountUp / Counter en el total de `verificar.html`: un número que rueda mientras alguien lo compara con su papel invita a leerlo mal. El total tiene que aparecer quieto (y en el anidador ya existe `contar()`).
- React Bits · DecryptedText / Shuffle y Vengeance · ASCII Glitch Ripple para el folio y el código: el revuelto «de hacker» en una página de verificación parece truco y retrasa el dato.
- React Bits · MetaBalls, LiquidChrome y MetallicPaint para el logo y el aluminio: son shaders WebGL; los sustituyen el filtro gooey (A23) y el brillo por máscara (A29).
- React Bits · Aurora / SoftAurora y Vengeance · Aurora Hero para las páginas públicas: la aurora ya existe en `body::after` (`sistema.css` 4551–4563) y también se pinta en `body.pub`.
- React Bits · LogoLoop y Vengeance · Logo Slider para los créditos: un carrusel que se mueve solo rompe la regla de «una sola pieza se mueve sola».
- React Bits · ScrollReveal / AnimatedContent en las páginas legales: esconden el texto hasta que se baja, y Google revisa estas páginas con herramientas que no siempre esperan (`publico.css` 18–20).
- React Bits · SloshGauge para el aprovechamiento: la aguja ya existe (`anidador.css` 178–190), y un líquido que se mece es movimiento sin información.
- React Bits · SquishSwitch y CursorGrid para los interruptores del avanzado y la mesa: el `.switch` ya existe, y una cuadrícula que reacciona al cursor no sirve con el dedo.
