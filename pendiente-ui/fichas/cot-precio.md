# Fichas de la zona `cot-precio`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### C3. Un aviso no borra al otro
- **Dónde:** `js/cotizador/nucleo.js` 669–694 (un solo `#toast` y un solo `_toastT`). `js/cotizador/notario.js` 181–189: `aplicarSello()` avisa «el total no es el que selló la hoja», e inmediatamente las líneas 344–345 lanzan `avisoDelNotario('✓ … autorizó')`. `js/cotizador/venta.js` 276–300 encadena cuatro avisos seguidos: `rvComprometerAnticipo`, «Mandando…», «Venta registrada» con «Abrir plataforma», «No se escribió…». Verificado.
- **Hoy:** el segundo aviso reescribe al primero en el mismo tick. El error de «total distinto al sellado» queda tapado por el «✓ autorizó», y el «Abrir plataforma» de la venta queda tapado por el aviso de campos rechazados.
- **Propuesta:** una pila de hasta dos avisos. Los de error y los que traen botón no se pisan: esperan o se apilan. Los informativos sí se reemplazan.
- **Sale de:** React Bits · SwipeToast (modo en línea, apilable) + Stack.
- **Cómo en vanilla:** una cola dentro de `toast()` con prioridad (error > con acción > informativo). Dos nodos en un contenedor `display:grid`, con `grid-template-rows` de 0fr a 1fr para entrar y salir. `voz()` sigue anunciando cada uno.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** en el teléfono, máximo dos avisos y al ancho del dock, para no tapar el botón principal. El aviso de «total distinto» es el que impide mandar un PDF malo: no puede perderse nunca.

### C5. El botón que está trabajando lo dice, con reloj
- **Dónde:** `js/cotizador/proceso.js` 463 (`#a-autorizar` en `authRevisionHTML()`), 1686–1721 (`autorizarConfirmado()`, con `_sellando` en la 1705) y 1959 (`renderMobileBar()`). `js/cotizador/notario.js` 124 (tope de 30 s) y 486–508 (`remotaOcupada()`, `autorizarRemota()`). `js/cotizador/venta.js` 269–308 (`mandarALaHoja()`, 15 s) con `cotizador.html` 1086 (`#rv-registrar`). `css/sistema.css` 3452 (`.btn.trabajando`). Verificado.
- **Hoy:** sellar puede tardar hasta 30 s y el botón solo cambia su texto a «Sellando en la hoja…» con opacidad 0.8, así que se ve apagado. «Registrar venta» no cambia en absoluto: solo sale un aviso de 15 s y el botón se puede volver a tocar.
- **Propuesta:** el botón se vuelve una ficha de estado, con un relleno que avanza y un cronómetro («Sellando · 6 s»). Si sale bien, se lava en verde con el código del sello. Si falla, tiembla en rojo y ofrece «Reintentar» sin cerrar nada.
- **Sale de:** React Bits · CallChip (relleno, contador vivo, éxito y error). Alternativa: SlideCommit (su fase de «trabajando»).
- **Cómo en vanilla:** `data-estado="trabajando|ok|mal"` en el botón, un `::before` con `scaleX` por CSS, un `<span>` actualizado con `setInterval` cada 100 ms y un `@keyframes` de sacudida. También `disabled` en `#rv-registrar` mientras se espera.
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** es una espera real, no adorno, y se apaga al llegar la respuesta. El festejo del éxito ya está propuesto (#7, neón al autorizar); esto cubre solo el tránsito. El texto blanco tiene que medir 4.5:1 también sobre el relleno a medias.

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

### C20. La cotización que se guarda vuela a donde quedó
- **Dónde:** `js/cotizador/proceso.js` 1792–1840 (`nueva()`). `js/cotizador/arranque.js` 107–122 (`separarDeLaCotizacionAnterior()`). `js/cotizador/venta.js` 423–436 (`registrarGanada()`). Destinos: `cotizador.html` 168 (Historial) y 198 (Plataforma). Verificado.
- **Hoy:** al vaciar, o al abrir con la anterior ya guardada, la pantalla queda en blanco y un aviso dice dónde quedó. El miedo documentado es que se borró.
- **Propuesta:** una tarjetita fantasma con folio y cliente se encoge hacia el botón Historial (o hacia Plataforma al registrar la venta), y el botón da un pulso.
- **Sale de:** React Bits · FolderFloat. Alternativa: Vengeance · Folder Preview.
- **Cómo en vanilla:** clonar un `<div>` fijo con el rectángulo de la tarjeta y moverlo con `el.animate()` (Web Animations, nativo) hasta el rectángulo del botón.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** solo cuando de verdad quedó guardada (`copiaGuardadaDeQ()`). Un borrador que se vacía no vuela: su vuelta es «Deshacer». Empotrado, `.btn-pf` está oculto y no hay destino. Con movimiento reducido: nada.

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

### H19. Plazo de taller: marcar el sugerido y decir por qué
- **Dónde:** `js/cotizador/historial.js` 1557–1572 (`plazoSugeridoCot()`) y 1576–1591 (`pintarPlazo()`); `js/cotizador/partidas.js` 880–887 (`chip()`, cuyo parámetro `extra` no se usa aquí); `cotizador.html` 353–355. Verificado.
- **Hoy:** si se elige a mano, la nota dice «Tócalo otra vez para volver al propuesto», pero no se ve cuál era el propuesto ni de dónde sale.
- **Propuesta:** el chip sugerido lleva «sugerido» en pequeño, y un «?» abre la razón: «Letras 3D con iluminación · 2 tipos de trabajo · lado mayor a 2,44 m → 2.5 semanas». Delante del cliente, eso sustenta el plazo.
- **Sale de:** Skiper · skiper101 Custom tooltip (GRATIS); alternativa React Bits · WarmTooltip.
- **Cómo en vanilla:** que `plazoSugeridoCot()` devuelva también sus razones; `chip(…,'sugerido',true)`, y `popover` para la explicación (se abre con toque, no con hover).
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** la etiqueta chica con contraste de 4,5:1 (no `--a-claro`). El «?» de 44 px.