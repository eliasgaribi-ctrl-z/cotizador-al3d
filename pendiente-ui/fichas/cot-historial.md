# Fichas de la zona `cot-historial`

Son TUS fichas, copiadas del anexo. No necesitas abrir el anexo completo.

### H6. Deshacer con mecha visible que se pausa al salir de la app
- **Dónde:** `js/cotizador/nucleo.js` 670–687 (`toast()`), con llamadas en `js/cotizador/historial.js` 181–192 (`borrarDeHistorial()`) y `js/cotizador/escalador.js` 1135–1138 (escala ajustada) y 1550–1557 (`scDelMedida()`); `css/sistema.css` 1403–1416. Verificado.
- **Hoy:** el aviso con «Deshacer» dura 6–8 s sin decir cuánto queda, y el reloj sigue corriendo aunque el vendedor esté en WhatsApp.
- **Propuesta:** una línea fina al pie del aviso que se consume exactamente en `dur`. Se detiene con el dedo o el foco encima y mientras la pestaña está oculta, y al volver retoma lo que faltaba.
- **Sale de:** React Bits · SwipeToast (la mecha); alternativa FuseButton.
- **Cómo en vanilla:** `<i class="toast-mecha">` con `animation:mecha var(--dur) linear` sobre `transform:scaleX`, y `animation-play-state:paused` en `:hover` y `:focus-within`. En `visibilitychange` se guarda lo que falta con `performance.now()` y se rearma `_toastT`.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** el contrato de `docs/SISTEMA-DE-DISENO.md` §6.2 («la ventana de deshacer dura lo que dura el aviso»): mecha y temporizador son el mismo número. Con reduced-motion, los segundos en texto en vez de una barra que se desliza.

### H8. Filtros rápidos del historial por lo que falta entregar
- **Dónde:** `js/cotizador/historial.js` 226–238 (`indexarHistorial()`, que ya indexa los hitos) y 249–306 (`pintarHistorial()`); `cotizador.html` 571–574 (`.hist-search-bar`). Verificado.
- **Hoy:** solo hay un buscador de texto. «¿Cuáles autoricé y no he mandado?» no tiene respuesta directa.
- **Propuesta:** fichas bajo el buscador (Todas · Sin PDF · Sin enviar · Sin venta · Este mes), cada una con su conteo. Se combinan con la búsqueda y el contador dice «3 de 41».
- **Sale de:** Vengeance · Search Modal (etiquetas de filtro removibles con conteo en vivo).
- **Cómo en vanilla:** botones con `aria-pressed` y un predicado sobre `hitosDe(e.folio)` antes del `includes(q)`. Los conteos se calculan una vez al abrir.
- **Valor · Esfuerzo:** Alto · Bajo
- **Cuidado:** 44 px por ficha. La ficha activa no es el botón con relleno de la pantalla. Si se arma como `.seg`, aplica la #2 (ficha que se desliza).

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

### H21. Vistazo al cuaderno sin salir del formulario del cliente
- **Dónde:** `js/cotizador/historial.js` 829–843 (`actualizarAvisoCuaderno()`) y 846–850 (`verCuadernoDe()`); `cotizador.html` 314 (`#cua-aviso`); `css/sistema.css` 1753–1755. Verificado.
- **Hoy:** «Ya tiene cuaderno · 3 cotizaciones · $45,000 · Ver cuaderno» abre el modal completo encima del formulario.
- **Propuesta:** tocar el aviso abre una tarjeta flotante con las iniciales y las tres últimas cotizaciones (folio · proyecto · total · fecha), más dos acciones: «Duplicar la última» y «Abrir cuaderno». Sirve para decir «la vez pasada le cotizamos esto» sin perder lo capturado.
- **Sale de:** Vengeance · Cursor Card (tarjeta de vistazo); alternativa Masked Avatars para las iniciales.
- **Cómo en vanilla:** `popover` anclado al aviso, con los datos de `cuadernoDeQ()`. «Duplicar» llama a `cuaDuplicarCot()`.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** se abre con toque, no con hover; 44 px. Entrada breve y ninguna animación en reposo.

### H25. Restaurar un respaldo con los pasos a la vista
- **Dónde:** `js/cotizador/historial.js` 1010–1050 (`restaurarDesde()`: confirma, descarga una copia, escribe y recarga a los 900 ms). Verificado.
- **Hoy:** tras confirmar, sale el aviso «Respaldo restaurado — recargando…» y la página se recarga sin que se vea qué pasó.
- **Propuesta:** tres renglones que se van marcando («Copia de lo actual descargada», «23 cotizaciones escritas», «Recargando»). Si algo no cupo, ese renglón queda en ✕ con «No se cambió nada».
- **Sale de:** React Bits · StatusMark.
- **Cómo en vanilla:** una lista con estados `.idle/.gira/.ok/.mal` que reusa el giro `esq-gira` existente; la recarga ocurre al marcar el último.
- **Valor · Esfuerzo:** Medio · Bajo
- **Cuidado:** para la confirmación aplica la #5 (mantener presionado). Con reduced-motion, sin giro.

### H27. Cuadernos: pasar de la lista al detalle deslizando
- **Dónde:** `js/cotizador/historial.js` 632–679 (`pintarCuadernos()`) y 681–732 (`abrirCuaderno()`). Verificado.
- **Hoy:** el `innerHTML` de `#cua-body` cambia de golpe, y «Todos los clientes» regresa igual.
- **Propuesta:** el detalle entra desde la derecha y la lista vuelve desde la izquierda; las iniciales de la tarjeta se convierten en el encabezado del detalle.
- **Sale de:** React Bits · AnimatedContent (entrada con dirección); alternativa Vengeance · Expandable Bento Grid.
- **Cómo en vanilla:** `document.startViewTransition()` donde exista, con `view-transition-name` en `.cua-ini`. Si no existe, las `entra-der` / `entra-izq` que ya están en sistema.css 3899–3902.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** con reduced-motion, sin transición. Nada de retardos encadenados.

### H29. Estado de guardado de la nota del cuaderno con un glifo
- **Dónde:** `js/cotizador/historial.js` 721–725 (`#cua-nota-estado`) y 737–750 (`cuaNotaEscrita()`, `cuaGuardarNotaYa()`); `css/sistema.css` 1738 y 3718. Verificado.
- **Hoy:** una frase gris que cambia entre «Escribiendo…», «Guardada en este dispositivo.» y el error.
- **Propuesta:** un glifo de 14 px delante de la frase: anillo punteado mientras escribe, giro breve al guardar, palomita al quedar guardada y ✕ ámbar si no hay espacio.
- **Sale de:** React Bits · StatusMark.
- **Cómo en vanilla:** un `<i>` con clases de estado que reusa `.esq-giro` y los iconos del sprite.
- **Valor · Esfuerzo:** Bajo · Bajo
- **Cuidado:** el giro dura solo lo que dura el guardado. El ✕ va con texto, no solo con color.

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