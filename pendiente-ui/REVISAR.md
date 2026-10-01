# Qué revisar — lista para la auditoría

Cada zona del paquete de UI entrega aquí lo que dejó a medias, lo que no alcanzó a probar y los
supuestos que tomó. **La auditoría mira esta lista, no las ~50,000 líneas del paquete.** No hubo
revisor aparte por zona: fue el acuerdo para no agotar el límite semanal.
## Cotizador · partidas y completitud (cot-partidas)

Fichas: 9 hecho, 2 parcial.

- **[alta]** `js/cotizador/partidas.js · repintarConViaje(), togglePartida(), delItem(), css/sistema.css .pcab (sticky + backdrop-filter)`  
  El viaje de View Transitions no se midió en un Android de gama media, que es lo que pedía el Cuidado de C1 (.pcab es sticky con backdrop-filter y se fotografía junto con hasta 40 partidas nombradas). Solo se probó en Chromium de escritorio emulando 360/420 px. Si se siente pesado, lo primero a bajar es el tope de nombres o saltar el viaje con más de N partidas.

- **[media]** `js/cotizador/partidas.js · _movBajar/_movArmar/_movPoner/_movSoltar (reordenar con el dedo)`  
  El gesto se probó con eventos táctiles por CDP en Chromium, no con un dedo en un teléfono. Sin verificar: iOS Safari (long-press, selección, touch-action:none solo en el número), el autoscroll en bordes, y arrastrar una partida ABIERTA de ~1300 px (no se colapsa durante el arrastre; en la práctica conviene plegar antes). Con menos movimiento las vecinas se apartan sin transición.

- **[media]** `js/cotizador/partidas.js · _ratonArma() y el bloque dragstart/drop de renderItems()`  
  El arrastre HTML5 con ratón real no se pudo ejercitar: en este arnés ni el código original completa un drag nativo (se comprobó contra una copia del commit base). Solo están probados el drop por eventos sintéticos (cotizador-flujo.mjs, sigue verde) y que draggable se arma en pointerdown con el ratón y se desarma al soltar. Cambio de comportamiento: antes toda la partida era arrastrable, incluso desde un campo de texto; ahora presionar sobre input/textarea/select/etiqueta arrastrable no la arma. Firefox/Safari sin probar.

- **[media]** `js/cotizador/partidas.js · renderItems() (.pmover-par dentro de .pline) y css/sistema.css .partida.folded .pline{display:none}`  
  Los botones visibles ↑/↓ de C15 viven en la línea de la fórmula, que CSS oculta con la partida plegada. Plegada, la alternativa sin gesto son solo las flechas del teclado sobre el número (un lector de pantalla en modo navegación puede no mandar flechas a un botón). Habría que decidir si los ↑/↓ merecen un sitio que se vea también plegada.

- **[media]** `js/cotizador/partidas.js · _peekBajar/_peekSubir/_peekClic y _peekFoco (C13)`  
  Mantener 350 ms en un chip se probó con CDP en Chromium; en iOS Safari/Android reales queda por ver la llamada de pulsación larga (se puso -webkit-touch-callout:none, user-select:none y contextmenu prevenido). Además, si el foco llega a un chip por teclado (p. ej. enfocarHueco tras un gesto de teclado), :focus-visible dispara el importe fantasma de ese chip sin que nadie lo pidiera.

- **[media]** `js/cotizador/partidas.js · renderItems() (desliza-partida) y _armarPartidas()`  
  Decisiones de producto tomadas por mí: (a) el gesto de deslizar solo está en la partida plegada; (b) 'Borrar' del gesto NO pide sostener (quien desliza y toca un botón rojo ya lo dijo dos veces, y hay Deshacer); (c) la × de una partida con datos SÍ pide sostener aunque exista el Deshacer de 6 s (lo pide la ficha C23 #5); la vacía se borra con un toque. Revisar si (c) estorba en el uso real.

- **[baja]** `css/sistema.css .cand-cliente.ojo / #cot-antes (js/cotizador/proceso.js pintarAvisoDeAntes, fuera de mi zona)`  
  Parcial: la ficha de «esto ya estaba en pantalla» late UNA vez al aparecer (animación de CSS de un solo disparo), pero no se reinicia 'cuando algo cambia' porque quien la pinta (pintarAvisoDeAntes) no es de esta zona y la clase .ojo está fija en cotizador.html. Si se quiere un segundo latido, hay que llamar a un reinicio como latirCandado() desde ese pintor.

- **[baja]** `js/cotizador/partidas.js · setShowInPdf()`  
  El ojo del PDF ya no repinta la lista: actualiza botón, clase hidden-pdf, resumen, conteo, plazo, resumen de precios, updProg y saveState a mano. Si alguien añade algo a renderItems() que dependa de showInPdf, no se enterará. Probado en las cuatro rondas y en cotizador-flujo/precio-suelto.

- **[baja]** `js/cotizador/partidas.js · pintarLetrero() y letreroCajaHTML() (C14)`  
  La cara del letrero no toma el color del material (aluminio blanco/negro/pintado/cepillado/acero se dibujan con la cara por omisión de la pieza); solo cambia el tipo de luz, el tono y el material aluminio/acrílico. No se revisó el aspecto en un teléfono de gama media (text-shadow apilado + drop-shadow). Cada renderItems() recrea los letreros y sus ResizeObserver (se espera que se recolecten con el nodo, sin medir).

- **[baja]** `js/cotizador/partidas.js · _llevarAlPaso (proceso.js) y senalarLlegada()`  
  Se señala la tarjeta .sum (no el aside entero) al llegar a los pasos 3/4 sin autorizar; es mi lectura de 'el bloque del paso'. P.senalar espera hasta 1 s a que el scroll suave se detenga; en un scroll muy largo la mira puede aparecer cuando ya se está quieto, no antes.

- **[baja]** `pruebas/navegador/cot-partidas.mjs`  
  La prueba mide gestos con CDP y con el ratón de Playwright, nunca con un dedo ni un ratón reales. No incluye lógica pura para node, así que no añadí prueba de node: el cálculo del destino del arrastre (_movPoner) y de la tarifa mínima de los mosaicos (_mosDesde) están dentro de funciones con DOM/catálogo y solo se ejercitan por la prueba de navegador.

- **[baja]** `git log (mensaje del commit f9873c9)`  
  CONVENCIONES.md pide terminar el commit con 'Co-Authored-By: Claude Opus 5'; el commit lleva la atribución de la sesión (Claude Sonnet 5.5 + Claude-Session) porque es el modelo que lo escribió. El integrador puede reescribir la línea si el repo la quiere uniforme.

## Anidador · controles, material, veta, medida y descarga (an-controles)

Fichas: 9 hecho, 1 parcial.

- **[media]** `anidador-vectores/js/app.js · alCambiarMaterial(), preguntarVeta()`  
  SUPUESTO: leí «pregunta por los giros de 90° y por omisión los quita» (decisión nº 6) como: al elegir aluminio/MDF los giros pasan solos a 0°/180° y el globo ofrece volver a cada 90° («Sin veta»). La ficha A5 decía un botón «Usar 0° y 180°» (lo contrario: aplicar solo si aceptan). Si el taller prefiere que NO cambie nada hasta que acepten, hay que invertir el defecto. Además el globo se ancla a la ficha del material (no a #an-rot, que vive en un <details> cerrado) y tocar fuera lo cierra (la API sugería tocarFueraCierra:false para A5); el rayado sale en cualquier giro no múltiplo de 180° (incluye 45°) y solo con material con veta.

- **[media]** `anidador-vectores/js/app.js · marcarGiradas() + MutationObserver sobre #an-res`  
  El rayado de giradas se engancha con un observador de #an-res para NO editar pintarResultado() (zona an-mesa). Depende de que las hojas sigan siendo '.an-hoja > svg > g' con transform rotate(). Si an-mesa reescribe pintarResultado o la estructura, el rayado deja de salir sin error. Revisar al fusionar con an-mesa.

- **[media]** `anidador-vectores/js/app.js · pintarResultado() (líneas de #an-dl) ; anidador-vectores/index.html (marcador: se borró la línea .an-prog-track)`  
  Toqué dos sitios que viven en la región de an-mesa porque la ficha A16/A4 los nombra: reemplacé el bloque que construía los botones «Solo la hoja N» dentro de pintarResultado() por actualizarDescarga(), y borré la línea de la barra .an-prog-track del marcador en index.html. Posibles conflictos de fusión con el agente de an-mesa.

- **[media]** `anidador-vectores/js/app.js · archivoParaCompartir(), compartir()`  
  NO PROBADO EN TELÉFONO REAL. En Playwright se simuló navigator.share/canShare. En Chrome de Android el SVG no está entre los tipos compartibles: añadí un fallback a text/plain con nombre .svg (el receptor lo ve como archivo .svg). Hay que comprobar con WhatsApp y correo en un Android y un iPhone que llega bien y que no es un truco que moleste.

- **[baja]** `anidador-vectores/js/app.js · recuperarAnterior(), restaurarHoja()`  
  Recuperar también restaura hoja, separación, giros, huecos, concavas, material y, si cambió, la escala del diseño (vía escalaDiseno('ancho', ...), que deja origen 'mano'). Es más de lo que pedía la ficha; se hizo para que la pantalla no desmienta al archivo que se descarga. No restaura el interruptor del contorno. Probado con motor de mentira y una vez con el motor real, no con retazos ni con escalas cambiadas a mano entre medias.

- **[baja]** `anidador-vectores/css/anidador.css · .an-tile-hoja, .an-girar .svgi (propiedades rotate y translate)`  
  El giro de la hojita usa las propiedades CSS individuales rotate y translate (Chrome 104+, Safari 14.1+, Firefox 72+). En un navegador más viejo las tarjetas simplemente no giran (se ven paradas, como antes), sin error. Además el rebote usa una curva propia cubic-bezier(.34,1.26,.5,1) porque --mv-r no tiene rebote; la ficha pedía --mv-r.

- **[baja]** `anidador-vectores/css/anidador.css · #brandLogo.brilla::after`  
  El reflejo anima background-position (no transform/opacity) dentro de un recuadro de 76×38 px durante 600 ms, y su tamaño está escrito a mano igual a .logoimg (38 px, 2:1): si cambia el tamaño del logo en sistema.css se desalinea. No medido en un teléfono de gama media. Tampoco probado el prefijo -webkit-mask en Safari.

- **[baja]** `anidador-vectores/js/app.js · svgDeEjemplo()`  
  Las letras del ejemplo se eligen como los <path> cuyo translate(x) cae a la derecha del 75 % del ancho del lienzo de logo-al3d.svg. Es una heurística sobre un archivo generado (herramientas/trazar-logo.py): si se regenera con otra disposición, el ejemplo cambia o falla (la prueba exige 4 piezas, así que lo avisaría).

- **[baja]** `anidador-vectores/js/app.js · cargarTexto() banda, pintarArchivo(); anidador-vectores/index.html (.an-vacio de #an-orig)`  
  Cambios menores en lo de carga: la banda #an-origen ahora restablece su className al cargar otro archivo; .an-vacio de la mesa vacía pasó de <p> a <div> con un <p> y el botón; hay un segundo acceso al ejemplo (#an-ejemplo-drop) bajo el recuadro de arrastrar que no pedía la ficha.

- **[baja]** `anidador-vectores/css/anidador.css · #an-orig svg * (silueta) y .an-cotas`  
  Cambié una regla existente: la silueta de la vista pasó de var(--n8) a tinta fija #1a1d33 porque de noche era lavanda sobre la hoja blanca (casi invisible). Las cotas usan tres colores fijos (#18b6d8, #1a1d33, #8a5100) y no tokens, porque la hoja es blanca en los dos temas; --a3 de noche es claro y se perdería. Si alguien hace oscura la hoja de la vista, hay que revisar ambas cosas. Y la vista previa ya no tiene su viewBox original en 'viewBox' sino en data-lienzo.

- **[baja]** `anidador-vectores/js/app.js · pintarEstadoTrabajo() / mecha bajo #an-ir`  
  En pantalla angosta, al arrancar el motor la página se desplaza a la mesa (scrollIntoView existente), así que la mecha del paro, que está bajo «Detener» en la columna de controles, queda arriba y fuera de la vista mientras se mira la mesa. Lo pedía así la ficha; no se probó si conviene repetirla en el marcador.

- **[baja]** `pruebas/navegador/anidador.mjs`  
  Edité dos comprobaciones de una prueba ajena porque mi cambio las rompe con razón: ya no hay #an-dl-hojas (ahora se cuenta el menú) y el viewBox de la vista se lee de data-lienzo. Pasa completa.

- **[baja]** `commit 3e061dd`  
  El mensaje termina con 'Co-Authored-By: Claude Sonnet 5.5' porque así lo indicó la instrucción del sistema de esta sesión; CONVENCIONES.md pedía la línea exacta con 'Claude Opus 5'. Si el integrador quiere la otra, hay que reescribir el mensaje.

- **[baja]** `A29 / A22`  
  No hay disparo del reflejo «tras una actualización»: esa recarga ocurre en la plataforma, no en anidador-vectores/. Si A22 quiere el brillo en la página suelta del anidador, necesita llamar a algo que hoy no se expone (la clase 'brilla' de #brandLogo).
