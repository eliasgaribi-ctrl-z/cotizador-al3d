# Fichas de la zona `pf-mapa`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### F9. Pin a mano con retícula fija al centro
- **Dónde:** `js/mod/mapa.js` 836–847 (`abrirMano()`), 857–884 (`alTocarMapa()`, con el pin arrastrable) y 886–902 (`pintarModo()`); `css/plataforma.css` 1270 (`#mapa-lienzo.poniendo … cursor:crosshair`). Verificado.
- **Hoy:** hay que tocar el mapa donde está la obra y luego arrastrar un pin de 26 px. En el teléfono el dedo tapa justo ese punto, y la mira en cruz solo existe con ratón.
- **Propuesta:** en el modo de pin a mano, una retícula de cuatro esquinas se queda fija en el centro del lienzo. Se mueve el mapa debajo y «Guardar aquí» guarda el centro del mapa. Tocar sigue sirviendo para saltar cerca.
- **Sale de:** React Bits · TargetCursor (alternativa: Crosshair).
- **Cómo en vanilla:** un `<div>` absoluto centrado sobre `#mapa-lienzo` con `pointer-events:none`. En el evento `moveend` se actualiza `MANO.lat/lng` con `mapa.getCenter()`. El texto de `pintarModo()` pasa a decir «Mueve el mapa hasta que la cruz quede en la entrada».
- **Valor · Esfuerzo:** Alto · Medio
- **Cuidado:** nada se guarda sin tocar «Guardar aquí», para que siga sin haber pines en medio del océano. La retícula lleva un contorno contrario al tema para verse de noche. No debe tapar los controles de Leaflet.

### F12. Las paradas del día como tarjetas sobre el mapa
- **Dónde:** `js/mod/mapa.js` 705–756 (`pintarRuta()`), 669–679 (`volarA()`, con `setView`) y 360–384 (`armazon()`); `css/plataforma.css` 681–692 (`.mapa-2col`, una sola columna en ≤759 px) y 708–713 (`#mapa-lienzo`, 45dvh en el teléfono). Verificado.
- **Hoy:** en el teléfono la ruta es una lista debajo del mapa. Para ver una parada hay que bajar, tocar «Ver en el mapa» y volver a subir.
- **Propuesta:** con la ruta ordenada, una tira de tarjetas pegada al borde de abajo del mapa, con número, nombre, hora y «Abrir en Google Maps». Deslizar a la siguiente mueve el mapa a ese pin y abre su globo; tocar un pin lleva la tira a su tarjeta. La lista de abajo se queda para la computadora y para el lector de pantalla.
- **Sale de:** React Bits · Carousel (alternativa: Skiper48 Card swipe carousel; hay que revisar su licencia).
- **Cómo en vanilla:** `overflow-x:auto` con `scroll-snap-type:x mandatory` (ya se usa en `.pj-tablero`), un `IntersectionObserver` para saber qué tarjeta quedó al centro y `mapa.flyTo()` de Leaflet; con movimiento reducido, `setView`.
- **Valor · Esfuerzo:** Alto · Alto
- **Cuidado:** la tira no puede tapar el crédito de OpenStreetMap, que exige su licencia. Botones de 44 px. La nota del punto de salida supuesto sigue visible.

### F25. La ruta se dibuja y se numera al ordenarla
- **Dónde:** `js/mod/mapa.js` 685–703 (`calcularRuta()`), 642–654 (`dibujarLinea()`) y 588–592 (el icono con número en `refrescarPines()`); `css/plataforma.css` 1265 (`.mapa-ruta-linea`). Verificado.
- **Hoy:** la línea y los números aparecen de golpe.
- **Propuesta:** la línea se traza en unos 800 ms y cada pin cambia su letra por su número cuando la línea llega a él. Pasa una sola vez.
- **Sale de:** React Bits · StrokeText (el trazo que se dibuja) (alternativa: Skiper19 Svg follow scroll, GRATIS).
- **Cómo en vanilla:** `getTotalLength()` y `stroke-dashoffset` con WAAPI sobre el `<path>` que pinta Leaflet; al terminar se devuelve el punteado `7 7`.
- **Valor · Esfuerzo:** Medio · Medio
- **Cuidado:** solo al calcular la ruta, no al repintar ni al hacer zoom. Con movimiento reducido aparece entera.

### F33. Los pines entran y salen al filtrar
- **Dónde:** `js/mod/mapa.js` 1044–1053 (`clicCuerpo()`, rama `data-g`) y 576–606 (`refrescarPines()`, con `clearLayers()`). Verificado.
- **Hoy:** al apagar una etapa, sus pines desaparecen de golpe y no se ve cuáles se fueron.
- **Propuesta:** los que se van se encogen y los que llegan crecen, en 160 ms; los que se quedan no se tocan.
- **Sale de:** React Bits · FadeContent.
- **Cómo en vanilla:** se compara por `proyecto_id` en lugar de vaciar con `clearLayers()`, y se anima `.mapa-pin` con WAAPI.
- **Valor · Esfuerzo:** Bajo · Medio
- **Cuidado:** `MARCAS` tiene que seguir al día para `volarA()`. Sin animación con muchos pines o con movimiento reducido.

### F29. La barra de acción del teléfono sube y cambia de rótulo sin parpadear
- **Dónde:** `js/mod/fabricacion.js` 974–1002 (`pintarMbar()`), `js/mod/material.js` 789–804 y `js/mod/mapa.js` 818–830; `css/plataforma.css` 862–863 y 2099. Verificado.
- **Hoy:** la barra aparece y desaparece con `hidden`, y cuando cambia de acción (de «Decidir 2 cotizaciones» a «Agendar (3 sin fecha)») el cambio no se nota.
- **Propuesta:** al aparecer sube 12 px con un fundido de 180 ms. Si cambia el rótulo, el nuevo se cruza con el viejo.
- **Sale de:** React Bits · BellToggle (el cruce de rótulo con `clip-path`).
- **Cómo en vanilla:** `@starting-style` para la entrada; antes de reescribir se compara con el rótulo anterior.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** `ajustarAltoBarra()` tiene que medir el alto final y no el de media animación, el mismo problema que ya resolvió `alTerminarDeEntrar()`.

### F23. Las cuentas de arriba ruedan cuando cambian (ya propuesta n.º 1, otro lugar)
- **Dónde:** `js/mod/fabricacion.js` 564–587 (`pintarCuentas()`), `js/mod/material.js` 352–377 (`cuentas()`) y `js/mod/mapa.js` 400–406 (`refrescarPiezas()`); `css/plataforma.css` 797–798 (`.pf-cuenta b`). Verificado.
- **Hoy:** después de agendar, recibir material o poner un pin, «Ganados sin fecha 3 → 2» cambia de golpe en medio de un repintado completo y se pasa por alto.
- **Propuesta:** solo la cifra que cambió rueda una vez de su valor anterior al nuevo.
- **Sale de:** la misma pieza de la n.º 1 (React Bits Counter).
- **Cómo en vanilla:** un `Map` del módulo con el último valor de cada etiqueta, y WAAPI solo si el valor cambió.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** nunca en el primer pintado ni si el valor no cambió, porque se repinta en cada toque. `cifraQueCabe()` sigue fijando el ancho.

### F31. Palomita al copiar (ya propuesta n.º 6, otro lugar)
- **Dónde:** `js/mod/fabricacion.js` 1556 y 1793–1796 (orden de trabajo), `js/nucleo/asistente.js` 211 y 307–311 (`.ia-copiar`), `js/mod/mapa.js` 954–955 y 1095–1097 («Copiar dirección»); `js/nucleo/ui.js` 407–427 (`copiarTexto()`). Verificado.
- **Hoy:** solo lo confirma el aviso de abajo; el botón que se tocó no cambia.
- **Propuesta:** durante 1.5 s el icono se vuelve una palomita que se dibuja y el rótulo dice «Copiada».
- **Sale de:** la pieza de la n.º 6.
- **Cómo en vanilla:** `copiarTexto()` ya recibe `extra` como retrollamada de éxito; ahí se cambia el `<use href>`.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** el aviso y `voz()` se quedan.

### F16. La silueta de la pantalla en vez de «Leyendo…»
- **Dónde:** `js/mod/fabricacion.js` 159–163, `js/mod/material.js` 241–243, `js/mod/mapa.js` 169–170 y `js/nucleo/asistente.js` 166–168 (`resumenHTML()`). La pieza ya existe en `js/nucleo/ui.js` 540–547 (`esqueletoModulo()`). Verificado.
- **Hoy:** el router pinta la silueta del módulo y un instante después el módulo la cambia por un reloj fijo centrado con un renglón: dos formas de «cargando» y un salto de alto.
- **Propuesta:** los tres módulos usan `esqueletoModulo(mod)` en lugar del `.vacio` de espera. El asistente pinta cuatro `.esq-n` con la forma de `.ia-cifras`.
- **Sale de:** React Bits · RefineFrame (el principio de reservar el lugar sin mover nada); la pieza ya está en el repo.
- **Cómo en vanilla:** cambiar el HTML de espera por la llamada que ya existe. Las clases `esq-*` ya respetan el movimiento reducido.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** se conservan `aria-busy` y el texto de estado. En Material, las recargas que siguen a una acción no deben volver a mostrar la silueta (ver F6).