# Qué revisar — lista para la auditoría

Cada zona del paquete de UI entrega aquí lo que dejó a medias, lo que no alcanzó a probar y los
supuestos que tomó. **La auditoría mira esta lista, no las ~50,000 líneas del paquete.** No hubo
revisor aparte por zona: fue el acuerdo para no agotar el límite semanal.
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

## Cotizador · precio, autorización, notario y hitos (cot-precio)

Fichas: 8 hecho, 4 parcial, 1 ya estaba.

- **[alta]** `js/cotizador/proceso.js · renderMobileBar()`  
  Es la reescritura más riesgosa: el dock ya no se rehace con innerHTML, se ajusta en sitio por 'modo' (cliente/total). Los manejadores en línea del botón se cambian con setAttribute('onclick'). Probado con la prueba nueva y las existentes, pero conviene revisar un flujo largo a mano en teléfono real (vendedor, autorizador, editMode, rechazada).

- **[media]** `js/cotizador/proceso.js · autorizarConfirmado() y SELLO_RATO_MS`  
  Cambio de comportamiento: tras responder la hoja se espera 450 ms (con _sellando en alto) antes de aplicarSello(). Rompió cotizacion-de-antes.mjs, cuya espera subí de 500 a 1100 ms (única prueba ajena editada, con razón). Si alguna otra prueba o flujo externo asume que autorizar() queda aplicado en <450 ms, fallará.

- **[media]** `js/cotizador/proceso.js · renderAuth() (_vivo, _neon, _montarCola, armarBotonesDelPanel)`  
  renderAuth ahora saca del panel viejo y devuelve el botón #a-autorizar[data-estado], la capa .neon-capa y el contenedor #auth-cola. Si cambia el marcado de authRevisionHTML (id a-autorizar) o se añaden más cosas con vida propia, hay que sumarlas ahí. Además, un repintado en pleno mantener presionado de #a-rechazar le cancela el gesto (poco probable).

- **[media]** `js/cotizador/notario.js · autorizarRemota() / remotaOcupada() / rechazarRemota()`  
  Reescritos con Piezas.trabajando y fallback sin piezas (remotaOcupada con disabled). El fallback sin Piezas NO tiene prueba. Tampoco la prueba de node de defensas-del-cotizador cubre estas funciones (pasa porque no las llama).

- **[media]** `js/cotizador/proceso.js · ANTICIPO_EXCEPCION y partirAnticipo()`  
  Supuesto de la decisión 1: la excepción de $60,000 se mide sobre el total que se cobra (con IVA), y no se prende en 60,000.00 exactos. La muestra la dejó «pendiente de confirmar con Elías»; falta esa confirmación. La frase del aviso («aplica la excepción de las condiciones de pago…») la escribí yo.

- **[media]** `js/cotizador/proceso.js · pintarPasos() y css/sistema.css (.pasos::before/::after)`  
  C12 sin Piezas.riel (decisión mía, ver ficha). El filete se verificó a 360/420 px y en computadora de 1100 px, no a 320 px ni en la capa vidrio.css con la barra más ancha; el glifo de 22 px a 320 px no se midió. El filete cuenta pasos hechos / 4 (no media el paso actual).

- **[media]** `js/cotizador/historial.js · pintarPlazo()`  
  Añade clase .plazo-nota y un <span> dentro de #f-plazo-h y #rv-plazo-h (el del modal de Registrar venta es de cot-entrega): cambió el layout de esa nota (flex). No se midió dentro del modal de venta; pruebas/navegador/cot-entrega.mjs sigue verde.

- **[media]** `js/cotizador/partidas.js · toggleItemAuth() / .ia-body`  
  NO hecho: el ajuste por partida del formulario de revisión sigue con display:none (parte de C16). Requiere tocar partidas.js (otro agente) o pasar a .plegable con data-plegar sincronizando _authAbiertas.

- **[media]** `js/cotizador/venta.js (registrarGanada) y js/cotizador/arranque.js (separarDeLaCotizacionAnterior)`  
  No conectados al vuelo de C20 (archivos ajenos). Tampoco rodarCifra en rvRecalc()/#prog-pct, ni #s-neto (renderSummary), ni el ojo tachado de .pdf-vis.

- **[baja]** `js/cotizador/proceso.js · volarCotizacion() / cotizacionQueVuela()`  
  Elige el botón destino con document.querySelector('.btn-hist[onclick^="abrirHistorial"]') (no tiene id) y la tarjeta de origen entre #card-proy/#card-partidas/#sidebox. Frágil si cambia el marcado del encabezado. El vuelo se probó con ratón y dedo; el caso empotrado (.btn-pf oculto) solo por lectura.

- **[baja]** `css/sistema.css · .queue-item[class~="lista-nueva"] .qi-folio::after`  
  Uso selector por atributo porque pruebas/piezas-hojas.mjs prohíbe escribir .lista-nueva fuera del bloque de la pieza. La palabra «nueva» sale por CSS content: los lectores de pantalla la oyen por el anunciar de la lista viva, no por el CSS.

- **[baja]** `js/cotizador/proceso.js · esperaHTML() / pintarHaceEspera()`  
  El reloj de 1 s es un setInterval (no animación) que se apaga con la pantalla oculta o sin elementos; se probó con visibilityState simulado, no con una pestaña realmente en segundo plano. «Revisado hace» solo cuenta consultas posteriores a la solicitud (_estadoTs >= sol.ts).

- **[baja]** `pruebas/navegador/cot-precio.mjs`  
  Las rondas pasan 8/8 con la máquina cargada por otros agentes, pero hay esperas por tiempo (sellar 2.4 s, marca «nueva» 4 s, reloj de 2.3 s) que podrían ser frágiles en una máquina muy lenta; ya endurecí dos (cierre de la revisión remota, pendientes del vigilante). No se mide contraste real del botón que sella sobre su relleno a medias (lo mide la pieza 14), ni se probó lector de pantalla.

- **[baja]** `mensaje del commit 8b3784e`  
  El trailer Co-Authored-By dice «Claude Opus 5» porque CONVENCIONES.md pide esas líneas exactas, aunque no es el modelo que hizo el trabajo.

## Plataforma · Hoy y Tablero (pf-tablero). Worktree: /home/user/cotizador-al3d/.claude/worktrees/wf_80e50a4c-9e3-2. Archivos tocados: js/mod/tablero.js, js/mod/inicio.js, css/plataforma.css (solo bloques «Plataforma · Hoy y Tablero» y «rm · pf-tablero»; el diff de CSS no borra nada) y pruebas/navegador/pf-tablero.mjs (nuevo). PASO 0 verificado: js/piezas.js pesa 359742 bytes.

Fichas: 9 hecho.

- **[alta]** `js/mod/tablero.js · armarMecha / alApagarseLaMecha / oyente visibilitychange`  
  La escritura de «Ya se armó» ocurre 5 s DESPUÉS del toque. Si el sistema mata la pestaña antes (batería, memoria, cierre abrupto) se pierde sin aviso. Mitigado confirmando todas las mechas al ocultarse la app (visibilitychange) y con el pagehide de la pieza, pero solo se probó simulando el evento en Chromium: no en un teléfono real, ni se sabe si las escrituras async a IndexedDB alcanzan a terminar en un pagehide real.

- **[media]** `js/mod/tablero.js · armarRielPide (click con detail===0); css/plataforma.css · .pf-cuenta-t::after (content … / ""), :has(), inert, overflow:clip, scroll-snap`  
  Todo se probó solo en Chromium. No se probó en WebKit/Safari ni con VoiceOver/TalkBack: se ASUME que una activación por lector de pantalla llega como click con detail 0 (misma suposición de la pieza 5) y que Safari entiende la sintaxis de texto alternativo de content; si no, el lector lee «mayor que» y el deslizador no se podría confirmar con lector.

- **[media]** `js/mod/tablero.js · renglon()`  
  «Mover la fecha» en los renglones de la LISTA solo se alcanza deslizando a la izquierda (el botón visible solo trae Abrir): contradice la regla 10 (todo gesto con alternativa simple). Vías alternativas: el botón «Ver la semana en el Calendario» y la tarjeta «No llegan» (que sí lo trae visible), pero no hay un botón por renglón. Decidir si se añade un botón visible o si basta con el Calendario.

- **[media]** `js/mod/tablero.js · abrirPide / proyectos.js moverEtapa`  
  El deslizador de P21 protege el cruce de corte en el Tablero, pero Proyectos (moverEtapa, ficha) sigue cruzando a «Cortado» y sacando material sin preguntar, así que la protección se esquiva abriendo la ficha. No es mi archivo: la zona pf-proyectos debería igualarlo (la ficha lo pide). Lo mismo con el toast de moverEtapa() de P4.

- **[baja]** `js/mod/tablero.js · ofrecerDeshacer (P4)`  
  Decisión: «Deshacer» = NO escribir (alConfirmar al apagarse la mecha), tal como documenta la API de la pieza 15, y no «llamar a Proy.avanzarEtapa(id, de)» como dice la ficha. Si el dueño quiere escribir al instante y revertir con renglón de bitácora, hay que cambiarlo y entonces sí aparece el salto de grupo que la ficha quería evitar.

- **[baja]** `js/mod/tablero.js · lineaEstaciones / css/plataforma.css · .tb-linea, .tb-etapa::before/::after`  
  La encomienda decía «pieza 16» y NO se usó P.rielHTML: las estaciones son filtros con aria-pressed y cuenta, y el riel modela estados de paso con palomita. Se dibujó el tubo con CSS (lo que dice el «Cómo en vanilla» de la ficha). No se revisó a 320 px ni en el Fold abierto; la tira queda pegada a la tarjeta de arriba (preexistente, se ve igual en la base).

- **[baja]** `js/mod/tablero.js · rodarCuentas; js/mod/inicio.js · rodarCuentas`  
  No pasan animar:false: dependen de que app.js llame olvidarCifras() al ENTRAR a la pantalla (lo hace hoy). Proyectos decide «nunca al entrar» con otro criterio (tiempo desde desmontar). Si alguien cambia app.js, el Tablero rodaría al entrar. Control y Proyectos no son míos y siguen sin P3/P18 propios.

- **[baja]** `js/mod/tablero.js · llevarA y bajarA; js/mod/inicio.js · pintarMbar`  
  La lógica «llevar a un lugar con P.senalar + foco + voz» y los helpers piezas()/puedeIr() están duplicados entre tablero.js e inicio.js (ui.js no es mío). Conviene subirlos a js/nucleo/ui.js al integrar.

- **[baja]** `js/mod/inicio.js · resolverEnSitio (P13)`  
  El renglón atendido se vuelve inerte con el atributo `inert`; en navegadores que no lo soportan (Safari < 15.5) sigue tocable ~1 s mientras se despide. Y el pliegue anima grid-template-rows (layout, no solo transform) en un solo renglón: lo pide la ficha, pero conviene mirar su fluidez en un teléfono de gama media.

- **[baja]** `js/mod/inicio.js · cuentas() (pase al Calendario)`  
  Se asume que {lente:'instalaciones', vista:'semana', dia} es una combinación válida del pase de fabricacion.js y que {lente:'taller'} aterriza en «Ganados sin fecha, con el reloj corriendo»; con el rol de PAGOS el Calendario fuerza la lente 'instalaciones', así que ahí «Ganados sin fecha» abre sin su grupo (solo probé direccion y fabricacion).

- **[baja]** `js/mod/inicio.js · abrirGanar / abrirFecha (P14)`  
  Cambié el texto de la nota bajo el campo de fecha de «Se ganó» («Para otro día, usa el campo…») y en abrirFecha NO hay ficha «Sin fecha» a propósito. «Noche» = 22:00 es una decisión mía (la ventana de las plazas); no existe una constante en agenda.js para esa hora.

- **[baja]** `pruebas/navegador/pf-tablero.mjs · contraste()`  
  El contraste se calcula con colores computados compuestos hacia arriba, solo válido para fondos lisos (lo nuevo lo es); NO es la medición por render de contraste.mjs. Márgenes más justos: texto del deslizador 4,94 y píldora «Salieron N materiales» 4,67 en claro. Si se retocan --mal-bg / --ok-bg hay que re-medir con contraste.mjs.

- **[baja]** `js/mod/tablero.js · pintar (pista); pruebas/respaldo.mjs / docs`  
  Clave nueva de localStorage al3d_pista_tablero (la pieza 9 recuerda que ya enseñó el gesto). No la vi en ninguna lista de claves de respaldo o documentación; las pruebas de node pasan, pero el integrador debería decidir si va en la documentación de claves.

- **[baja]** `pruebas/navegador/vidrio.mjs`  
  Falló una vez («700 px, con ratón, en claro: la página está de verdad en claro (data-tema=oscuro)») y pasó en la repetición y en la base; no encontré la causa. Si reaparece, mirar el arranque de tema antes de culpar a esta zona.
