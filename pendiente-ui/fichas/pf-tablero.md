# Fichas de la zona `pf-tablero`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

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

### P11. El latido de «sin decidir» tiene que apagarse
- **Dónde:** `js/mod/tablero.js` 567–590 (`decidir()`) y `js/mod/proyectos.js` 629–639 (`pintarCand()`). También `css/sistema.css` 3143 (`.cand-partidas{animation:late 2.8s … infinite}`), `css/plataforma.css` 883–884 y `docs/SISTEMA-DE-DISENO.md` línea 17. Verificado.
- **Hoy:** la tarjeta late sin fin, al lado del botón del asistente que también se mueve solo. En el Tablero son dos piezas en movimiento, y la regla del sistema admite una.
- **Propuesta:** que lata tres veces al aparecer y se quede con el aro quieto. Vuelve a latir solo cuando la cuenta sube.
- **Sale de:** React Bits · BellToggle (keyframes amortiguados que terminan en reposo).
- **Cómo en vanilla:** `animation-iteration-count:3` y guardar en el estado del módulo la última `n`; si crece, se vuelve a disparar forzando un reflow.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** con movimiento reducido ya se apaga (`sistema.css` 3967). La barra fija «Decidir» sigue siendo la entrada.

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

### P18. Las cuentas ruedan cuando la sincronización cambia algo
- **Dónde:** `js/app.js` 1149–1153 (remonte cuando bajan cambios), `js/mod/tablero.js` 509–546, `js/mod/proyectos.js` 395–414 (`pintarCuentas()`) y `js/mod/control.js` 325–329. Verificado.
- **Hoy:** cuando llega algo de otro teléfono, «Van tarde 2» pasa a 3 en seco y nadie se da cuenta.
- **Propuesta:** el odómetro (idea #1), llevado aquí. Si una cuenta cambió respecto a la última vez que se pintó, la cifra rueda del valor viejo al nuevo y aparece un «+1» breve. Nunca al entrar a la pantalla.
- **Sale de:** React Bits · Counter. Alternativa: Vengeance · Animated Number.
- **Cómo en vanilla:** `@property --n <integer>` + `counter()`, o dígitos que se desplazan con `translateY`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** `desmontar()` pone `_d` en null, así que el valor previo se guarda fuera de él. Los importes mantienen sus dos decimales y el ancho `--c` de `cifraQueCabe()`.

### P21. «Sí, ya se cortó» como deslizador que enseña el resultado
- **Dónde:** `js/mod/tablero.js` 1134–1151 (`abrirPide()`), 1155–1163 (`alClicPide()`) y 1120–1127. Verificado.
- **Hoy:** el modal tiene dos botones iguales. «Sí» lo cierra al instante y el número de materiales que salieron llega en un toast aparte.
- **Propuesta:** el confirmar con gesto (idea #5), en la única escritura irreversible del Tablero. «Sí» es un deslizador que gira mientras corre `avanzarEtapa` y se abre en una píldora «Salieron 4 materiales · Ver almacén». Si falla, regresa con una sacudida y el mensaje.
- **Sale de:** React Bits · SlideCommit. Alternativa: HoldButton.
- **Cómo en vanilla:** Pointer Events sobre un riel, o un `<input type="range">` con estilo. Enter como alternativa de teclado.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** 44 px de alto. El mismo cruce desde la ficha de Proyectos no pregunta (1260–1278); conviene igualarlos.

### P25. La línea de estaciones dibujada como tubería
- **Dónde:** `js/mod/tablero.js` 592–625 (`lineaEstaciones()`) y `css/plataforma.css` 1302–1316 y 1612–1618. Verificado.
- **Hoy:** cinco cajas en una rejilla que se ven como las cuentas de arriba. El comentario dice «es una tubería, no un ranking», pero nada lo dibuja, y en el teléfono se parten en dos renglones.
- **Propuesta:** conectores entre estaciones para que se lea el flujo de Ganado a Listo. En pantallas de 400 px o menos, una sola tira que se desliza en lugar de dos renglones.
- **Sale de:** React Bits · Stepper (solo la forma, sin animación).
- **Cómo en vanilla:** `::after` en cada `.tb-etapa` menos la última, y `scroll-snap` en pantallas angostas.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** siguen siendo filtros (`aria-pressed`) y no deben confundirse con las cuentas tocables del punto P3. No depender solo del color.

### P29. Deslizar un renglón del Tablero para avanzarlo
- **Dónde:** `js/mod/tablero.js` 701–718 (`renglon()`) y 736–745, y `css/plataforma.css` 402–411 (en el teléfono las acciones van en su propio renglón). Verificado.
- **Hoy:** en el teléfono cada trabajo gasta un renglón entero en botones: treinta trabajos, treinta renglones de «Ya se armó · Abrir».
- **Propuesta:** la idea #9 aquí. Deslizar a la derecha avanza la etapa (con el deshacer del punto P4) y a la izquierda descubre «Abrir» y «Mover la fecha». Los botones se quedan para quien no desliza.
- **Sale de:** React Bits · SwipeRow.
- **Cómo en vanilla:** Pointer Events con `touch-action:pan-y` y un umbral por velocidad.
- **Valor · Esfuerzo:** Bajo · Medio
- **Cuidado:** nunca para el cruce de corte. Respetar roles. Dar una pista la primera vez para que se descubra.