# Qué revisar — lista para la auditoría

Cada zona del paquete de UI entrega aquí lo que dejó a medias, lo que no alcanzó a probar y los
supuestos que tomó. **La auditoría mira esta lista, no las ~50,000 líneas del paquete.** No hubo
revisor aparte por zona: fue el acuerdo para no agotar el límite semanal.
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
  **RESUELTO (1-oct-2026).** Dirección confirmó que la excepción se mide sobre el **subtotal**, sin IVA, para que el mismo trabajo caiga del mismo lado de la regla se facture o no. `partirAnticipo(total, anti, sub)` recibe el subtotal de `desgloseFinal().sub`, y lo cubren `pruebas/cot-precio.mjs` y su prueba de navegador (un subtotal de $52,800 que con IVA da $61,248 ya no dispara el aviso). Nota original: Supuesto de la decisión 1: la excepción de $60,000 se mide sobre el total que se cobra (con IVA), y no se prende en 60,000.00 exactos. La muestra la dejó «pendiente de confirmar con Elías»; falta esa confirmación. La frase del aviso («aplica la excepción de las condiciones de pago…») la escribí yo.

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

## Cotizador · historial, cuadernos, respaldos y vigencia (cot-historial)

Fichas: 11 hecho, 1 ya estaba.

- **[media]** `js/cotizador/historial.js · reenviarConFechaNueva() / guardarEnHistorial(extra)`  
  La renovación de la vigencia se anota al ABRIR la cotización con fecha nueva, no al generar el PDF (entrega.js es de otra zona y no la toqué). Si el vendedor reenvía y nunca genera el PDF, el historial dirá 10 días aunque nada haya salido. Además `reenviada` es un campo nuevo de la entrada del historial: lo conserva guardarEnHistorial, viaja en el respaldo, pero la plataforma (js/datos/cotizador.js, réplicas) no lo conoce; no lo he mirado en esas réplicas.

- **[media]** `js/cotizador/historial.js · reenviarConFechaNueva() camino de precio movido`  
  Probé hasta quedar en estado pendiente con Q.reauth puesto y la fecha sin cambiar. NO probé el flujo completo con un Autorizador real autorizando de nuevo y luego tocando el botón por segunda vez (se supone que precioSeMovio() da false porque guardarEnHistorial congela los _lt nuevos). precioSeMovio() duplica el predicado de reabrirDeHistorial() (dos copias de la misma regla).

- **[media]** `js/cotizador/historial.js · visorMontar()/visorCerrar() y partidas.js openAiFile()`  
  El visor se probó con Pointer Events por CDP, ratón y teclado en Chromium; NO en Safari/iOS real (pellizco con touch-action:none, img.decode, ghost clicks). El cierre por velo se difiere al click que sigue a soltar (si nunca llega un click, no cierra). En openAiFile() la miniatura de origen sale de window.event.target.closest('img'), que depende de que el onclick en línea corra con window.event. El vuelo de regreso no calza al píxel con la miniatura recortada (object-fit:cover).

- **[media]** `js/cotizador/historial.js · restaurarDesde()/ejecutarRestauracion()`  
  La confirmación ya no pasa por confirmar() sino por una vista dentro del historial con P.mantener; restaurar sigue siendo destructivo. Cambia el flujo y suma ~1,6 s antes de recargar (pausas para que se vean las marcas). Cerrar el modal con Escape a media restauración no la detiene (la recarga sigue). Si cot-precio mete mantener a confirmar(), habrá dos mecanismos para lo mismo. Con la falla, «Restaurar» queda apagado y sin la pieza (P.mantener.quitar + disabled) para que el dedo que sigue encima no active «Volver» al esconderse el botón.

- **[media]** `pruebas/navegador/cot-entrega.mjs · sinDesborde()`  
  Edité una prueba de otra zona (una línea: excluir .fichas del chequeo de desborde, porque la fila de fichas del historial se desplaza de lado a propósito). Puede chocar al fusionar si cot-entrega toca esa línea.

- **[media]** `js/cotizador/historial.js · armarBoteDeBasura()`  
  P.mantener se arma con un oyente delegado en captura (pointerdown, focusin, keydown) sobre #hist-body y confía en que los oyentes que la pieza cuelga del botón en ese momento reciben el mismo evento. Funciona en Chromium (probado dedo, ratón, Enter y 'activar' sin puntero); no en otros motores. Un lector de pantalla que active sin enfocar ni tocar antes no armaría la pieza.

- **[baja]** `css/sistema.css · .hentry{content-visibility:auto}`  
  Lo añadí por rendimiento (abrir 80 entradas: ~330 ms contra ~490 ms antes, medido con CPU a 4×). content-visibility implica paint containment: recorta lo que se sale de la entrada (por eso el globo .hentry-pista va a la izquierda de la columna en ≥561 px). No lo probé en pantalla ancha con capturas ni en Safari <18 (ahí se ignora).

- **[baja]** `js/cotizador/historial.js · histEntradaHTML() llama hitosHist(e.folio)`  
  hitosHist() es de cot-entrega; la llamo tal cual y le doy su sitio entre el renglón superior y la vigencia. Si cot-entrega cambia su firma o su marcado, hay que reconciliar aquí. Mis cambios también quedan junto a ella en el archivo (evité tocar cerrarHistorial() para no dejar hunks contiguos).

- **[baja]** `js/cotizador/historial.js · indexarHistorial()/pintarCuadernos()`  
  Cambio de comportamiento del buscador: ahora ignora acentos y mayúsculas con P.plegarTexto en historial y cuadernos (antes solo minúsculas). Un número con separadores se compara tal cual contra el texto plegado. No hay prueba de node que lo fije fuera de la de navegador.

- **[baja]** `js/cotizador/historial.js · H29 cuaEstadoNota()`  
  La ficha pedía ✕ ámbar; usé la ✕ roja (la pieza no tiene ✕ ámbar). El estado «trabaja» dura un cuadro, casi invisible. El anillo de la vigencia tampoco se anima nunca (la lista se repinta con innerHTML y el modal se cierra al reenviar), aunque la muestra decía que se movería al cambiar el día o al reenviar.

- **[baja]** `js/cotizador/historial.js · HIST_FILTROS 'Sin enviar'`  
  La ficha se llama «Sin enviar» como pide la ficha, pero el dato es el hito del chat de WhatsApp abierto (la app no sabe si se envió de verdad); le puse title «Sin chat de WhatsApp abierto». Se puede preferir otro rótulo.

- **[baja]** `Rendimiento general (pintarHistorial, histEntradaHTML)`  
  Con 80 cotizaciones y CPU a 4× el repintado cuesta ~220 ms (antes ~340). Son más nodos que antes (4900 contra 3400). No medí en un teléfono real.

- **[baja]** `Atribución del commit`  
  CONVENCIONES.md pide terminar el commit con «Claude Opus 5»; el recordatorio de la sesión pedía «Claude Sonnet 5.5» y usé ese, que es el modelo real.

- **[baja]** `pruebas/cot-historial.mjs (node)`  
  Extrae las funciones de historial.js por texto (como replicas.mjs); si se renombran medianocheLocal/vigenciaDe/vigFecha/vigenciaTexto/enEsteMes/histCuentas/VIG_DIAS/HIST_FILTROS la prueba falla. Fija TZ con process.env.TZ en tiempo de ejecución.

## Plataforma · Material (pf-material). Worktree /home/user/cotizador-al3d/.claude/worktrees/wf_59a3b4fb-37c-2. PASO 0 hecho: reset a claude/cambios-paquetes-individuales-1itp1x y js/piezas.js pesa 359742 bytes (más de 300000, trae las piezas). Archivos tocados: js/mod/material.js, css/plataforma.css (solo los bloques «Plataforma · Material» y «rm · pf-material»), pruebas/navegador/pf-material.mjs (nuevo).

Fichas: 10 hecho.

- **[alta]** `js/mod/material.js · conVentana(), pedirRecibo(), pedirCalibracion()`  
  La escritura se hace al apagarse la mecha, a los 8 s. Si la app se cierra o el sistema la mata dentro de esos 8 s (y en iOS Safari pagehide no está garantizado; además la mecha se pausa con la app en segundo plano, así que irse a WhatsApp con el recibo pendiente y que el sistema mate la pestaña lo pierde), el material recibido NO se registra y la persona cree que sí. No hay dato corrupto, hay una escritura omitida. La alternativa (escribir al tocar y anular con un movimiento compensatorio sellado) exige una función nueva en js/datos/stock.js, que no era mía. Decisión de producto pendiente.

- **[media]** `js/mod/material.js · confirmarVentanas() llamada desde pintar()`  
  Con dos ventanas de «Deshacer» abiertas a la vez (p. ej. «Actualizar» y «Recibí»), la primera en terminar repinta la pantalla y confirma la otra antes de su hora. Se eligió confirmar antes de repintar porque el botón va a dejar de existir; no se probó el cruce de dos ventanas ni que, al cruzar los 760 px con una ventana abierta, el botón pendiente pueda quedar oculto (display:none) sin poder deshacerse hasta que acabe.

- **[media]** `js/mod/material.js · alContar() y leerDatos()`  
  Cada conteo dispara en segundo plano la lectura completa (listaCompra + existencias, que recorren todo el libro). En una ráfaga de «Así está» las lecturas viejas no se cancelan, solo se descartan al terminar; no se midió en un teléfono de gama media. Además leerDatosDeVerdad() ahora asigna REQS después de su segundo await y una lectura superada devuelve la promesa de la más nueva: contar() (exportada, la usa app.js) conserva su contrato pero conviene mirarla con una sincronización real.

- **[media]** `css/plataforma.css · .pf-mbar.mat-mbar y @starting-style`  
  La entrada de la barra usa @starting-style (Chrome 117+, Safari 17.5+, Firefox 129+): en un navegador más viejo o en un WebView de Android antiguo la barra simplemente aparece de golpe. Solo se probó en Chromium. Está scoped a .mat-mbar; si los agentes de fabricacion y mapa implementan F29 sobre .pf-mbar a secas habrá dos reglas para lo mismo y el integrador debería unificarlas en una.

- **[media]** `pruebas/navegador/pf-material.mjs (todas las rondas)`  
  Solo se probó en Chromium de Playwright. No se probó en Safari de iOS: ahí un toque no enfoca el botón (la restauración de foco por conservandoFoco y la pausa de la mecha por foco se comportan distinto), ni con un lector de pantalla real: el <output aria-live=polite> de la diferencia re-anuncia con cada tecla y puede ser verboso. La aserción de foco tras «Así está» se omite en las rondas táctiles.

- **[media]** `js/mod/material.js · medidorCompra() y medidorExistencia()`  
  Interpretación mía: en «Por comprar» las líneas no traen comprometido, así que el rayado es min(hay, requerido) («lo que hay y ya está pedido»), la muesca es el mínimo de almacén o, si no hay, lo que piden; en «En almacén» el rayado es el comprometido real (solo de proyectos con instalación agendada). El rayado significa algo ligeramente distinto en las dos pestañas; confirmar con quien definió la ficha. El medidor de js/mod/ajustes.js (cardRespaldo) queda sin hacer, no es de esta zona.

- **[baja]** `js/mod/material.js · hacerContar()`  
  El aviso «Ojo» lleva un botón «Entendido» cuya función no hace nada, solo para que la pila lo trate como prioridad 1 y no lo pise el informativo; además depende del orden (se lanza primero). Es una decisión de criterio: las alternativas eran tipo 'err' (rojo, no es un error) o fundir los dos textos en un solo aviso.

- **[baja]** `js/mod/material.js · selloMostrado() y contadoHoy()`  
  «contado hoy por X · N movimientos después» reescribe aquí el sufijo que arma selloFrescura() en js/datos/stock.js (que no podía editar) y «hoy» es frescura_dias === 0; si esa capa cambia su redacción, divergen. Un conteo con ts futuro por reloj atrasado también sale «contado hoy».

- **[baja]** `js/mod/material.js · repintarHoja() / marcarCambios()`  
  Lo tecleado sin guardar sobrevive al repintado de la hoja (guardar la lámina, un guardado con fallo), pero cambiar de segmento Catálogo/Constantes (data-hmodo) sigue descartando lo tecleado sin avisar; era así antes y con «Guardar 2 cambios» a la vista se nota más.

- **[baja]** `js/mod/material.js · cargar() (sin-espera) y cuentas()`  
  La silueta 'sin-espera' se decide leyendo una vez la opacidad de la del router: si está a medio fundido el módulo la sustituye a opacidad plena (un pequeño salto) y se apoya en que el router la quita en una microtarea posterior. Para la cifra del costo se usa cifraQueCabe(...).replace('<b ', '<b data-cuenta="costo" '), que depende de que esa función siga devolviendo un <b> al principio.

- **[baja]** `pruebas/navegador/pf-material.mjs · contraste()`  
  El contraste se mide con colores computados contra el primer fondo opaco de los ancestros (las tarjetas de Material son lisas), no rasterizando como contraste.mjs; la palomita blanca sobre --ok-fill de .mat-caja no es texto y no se midió. Playwright da por apagado todo lo que lleva aria-disabled, por eso el toque a «Guardar» fantasma se hace con force:true; y waitForFunction no espera predicados async, por eso hay un helper hasta().

- **[baja]** `mensaje de los dos commits`  
  Terminan con «Co-Authored-By: Claude Sonnet 5.5» (la instrucción del sistema de la sesión) y no con la línea «Claude Opus 5» que pide CONVENCIONES.md; las demás zonas ya lo anotaron así. El integrador puede reescribir el mensaje si el repo quiere la otra.

## Cotizador · vectorizador (cot-vector)

Fichas: 5 hecho, 1 ya estaba.

- **[media]** `js/cotizador/vectorizador.js · vtSetVista`  
  Habilité los botones de vista (Original/Comparar/Vector), que estaban disabled en el marcado y nada los encendía (ni en el commit original). Supongo que era un descuido. Si el apagado era intencional, hay que revertirlo; la ficha que viaja entre vistas depende de que estén habilitados.

- **[media]** `js/cotizador/vectorizador.js · vtVectorizar + vtDibujarCorte`  
  Decisión mía: el dibujo del trazo corre solo en la primera vez de cada imagen (primera = !VT.hecho), no en cada re-trazo ni con «Volver a vectorizar». La ficha no lo distingue. Si se quiere en cada re-trazo, cambiar esa condición.

- **[media]** `js/cotizador/vectorizador.js · vtDibujarCorte`  
  Rendimiento medido solo en headless con CPU a 4x (98 lazos, 761 nodos): cuadros de 17 ms con un tirón de ~133 ms al arrancar (crear los paths y llamar getTotalLength). No probé un teléfono de gama media real. Los topes (3000 nodos, 150 lazos) los puse yo siguiendo el 3000 de la ficha.

- **[media]** `js/cotizador/vectorizador.js · vtLoadPDF / vtOverlayPdf`  
  No hay red a cdnjs en el entorno: lo probé con un pdf.js de mentira (pdfjsLib stub) y con la descarga abortada. La ruta con el pdf.js real, la huella SRI y un PDF de verdad no se ejercitó. Tampoco probé una hoja de PDF que renderice pero que el navegador no decodifique (el camino alFallar de vtLoadImgSrc).

- **[baja]** `pruebas/navegador/cot-escalador.mjs líneas ~939, 947, 955, 956`  
  Edité cuatro selectores de una prueba ajena para acotarlos a #scalermodal. El vectorizador ahora tiene las mismas clases sp-overlay-tarjeta y sp-overlay-btn y, al venir antes en el DOM, document.querySelector devolvía la mía (escondida): 32 fallos. Solo cambié el prefijo de los selectores. Posible conflicto de fusión si otra rama toca esas líneas.

- **[baja]** `css/sistema.css · bloque cot-escalador (.sp-overlay-*)`  
  La tarjeta de PDF del vectorizador depende de las clases sp-overlay-* que viven en el bloque cot-escalador (otra zona). Si esa zona las renombra o las cambia, el recuadro del vectorizador cambia con ellas sin avisar.

- **[baja]** `css/sistema.css · bloque cot-vector (.vt-row:has(+ .desl-caja))`  
  Esconder la píldora .vt-val depende de :has(). En navegadores sin :has (Firefox anterior al 121) el valor se dice dos veces (pastilla y etiqueta). No se probó en Firefox ni Safari; todo corrió en Chromium.

- **[baja]** `js/cotizador/vectorizador.js · vtMedidaArrastrable`  
  La semilla de arrastre desde el campo vacío sale del placeholder («Ej. 40» y «Ej. 120»). Si alguien cambia el texto del placeholder, la semilla cambia (cae a 40 si no hay número). Es una adaptación local de lo que el escalador hace con su referencia; la pieza no trae esa semilla.

- **[baja]** `js/cotizador/vectorizador.js · vtPintarMuestras / vtToggleColor`  
  Con más de 8 colores, el nombre visible es solo el número («3»); el nombre accesible (aria-label) sigue diciendo «Color 3 #hex». Es mi decisión para que quepan en el panel; el modo Foto con 24 colores se probó con 16.

- **[baja]** `js/cotizador/vectorizador.js · vtCablearPiezas`  
  Las piezas se enganchan al abrir el modal por primera vez, no al cargar el script. Si algo llamara a vtLoadImgSrc o vtVectorizar sin pasar por abrirVector(), los deslizadores, la ficha y la etiqueta arrastrable no estarían enganchados (el modal está escondido hasta entonces, así que hoy no hay otro camino).

- **[baja]** `commit 17a56ee (mensaje)`  
  La guía (CONVENCIONES.md) pedía terminar el commit con «Co-Authored-By: Claude Opus 5»; el recordatorio de atribución del entorno pedía «Claude Sonnet 5.5». Usé el del entorno, que es el modelo real. El integrador puede reescribir la línea si necesita la otra.

- **[baja]** `pruebas/navegador/cot-vector.mjs`  
  Varias comprobaciones dependen del tiempo (el toque que termina el dibujo en <450 ms, que la ficha exista justo después del clic, la rueda de cifras). Corrió estable cuatro veces seguidas, pero en una máquina más lenta podría haber falsos fallos. La prueba usa una imagen sintética de 6 capas y exige solo ≥3 fichas.

## Plataforma · Control, ventas y comisiones (pf-control)

Fichas: 5 hecho, 1 parcial.

- **[media]** `js/mod/control.js traerDeLaHoja / encenderBoton / cerrarBoton / aplicarCierre`  
  El Apps Script real YA NO PAGINA (sync.js: 'manda las 309 filas en una respuesta'), así que en producción el botón casi siempre mostrará 'Página 1' y pasará a verde; el avance por página solo se ve con un puente que pagine (mi mock lo hace). El total de páginas es desconocido: el relleno usa la curva asintótica P.avance(página, 5) y no un porcentaje real. Quien audite debe decidir si la ficha tiene sentido con una sola página.

- **[media]** `js/mod/control.js aplicarCierre / _cierre`  
  Hallazgo mientras probaba: el app corre su propia sincronización (sincronizarCallado, al arrancar y cada 30 s) que comparte Sync.jalar y REMONTA la pantalla cuando trajo algo, así que el verde de 'N cambios' se borraba al instante. Lo resolví guardando el resultado fuera del botón y reponiéndolo tras cada pintado (3,5 s el verde; el rojo hasta reintentar o salir de la pantalla). Además repito la voz 450 ms después del remonte porque rematar() del router anuncia 'Control' encima de la región que habla. Dos apoyos frágiles: (1) el rojo repuesto quita la clase 'sacudida' a mano (detalle interno de Piezas.sacudir); (2) si el router deja de anunciar el nombre en cada remonte, la frase se dirá dos veces. Probado con mock de puente pero no contra el Apps Script real.

- **[media]** `js/mod/control.js llevarA y css/plataforma.css (.pf-cuenta.va, .solo-voz)`  
  llevarA() duplica la función privada del mismo nombre de js/mod/tablero.js (candidata a ui.js, que no es mío). Las cuentas de Control dependen del CSS .pf-cuenta.va / .pf-cuenta-t del bloque pf-tablero y de .solo-voz de sistema.css: si la fusión cambia ese bloque, pierden flecha y aro de foco (la prueba lo detectaría en 'flecha de ir').

- **[media]** `js/mod/control.js medidorCobro`  
  Invertí a propósito el ejemplo de pendiente-ui/api/piezas-3.md (estimado: !!x.deNotion): deNotion es 'el saldo viene de la hoja', así que lo rayado es !x.deNotion, como dice el Cuidado de la ficha. Si el integrador copia el ejemplo de la API a otra pantalla repetirá el error.

- **[media]** `js/mod/control.js comisionesDe / htmlComisionesVivas`  
  Supuestos de F54: (1) el monto de cada comisión es lo que FALTA pagar (comisionDe.abonable), no la comisión entera, y el orden es por ese monto; (2) la lista sale del récord unificado (D.ventas), igual que el asistente; (3) la pestaña es nueva (cuarta) y a 360 px 'Comisiones · 9' parte en dos renglones dentro del segmento (revisado en captura a 360 claro; 420 y oscuro solo por medidas de desborde y contraste); (4) importar comisionDe carga asistente-contexto.js junto con Control; (5) no probé el rol pagos ni la lista con más de 100 comisiones (COM_TOPE); (6) compartir es linkWa('', texto), sin navigator.share. La decisión de no marcar pagos es la de CONVENCIONES (#3) y está probada.

- **[media]** `pruebas/navegador/puente.mjs`  
  Falla en Proyectos ('quitar' la tarjeta importada, 'la de la lápida' y un timeout en #pj-filtros) con o sin mis cambios: lo comprobé corriendo la misma prueba contra una copia limpia de HEAD (mismas dos líneas ✗ y mismo timeout). No es de mi zona y no lo toqué, pero esa prueba no llega a verificar lo de Control que viene después (Y CONTROL LO SUMA) en esta rama.

- **[baja]** `js/mod/control.js irA('lista:mes') y cuentas de Ventas`  
  Decisión mía: tocar 'Vendido en <mes>' cambia el periodo de la lista a 'Este mes' (queda así el resto de la visita) para que la lista cuadre con la cifra. El mes pasado y 'No se dio' no filtran la lista (no existe filtro por mes): llevan al renglón de ese mes en las barras, donde el globo tiene el desglose. 'Autorizado sin decidir' navega a Proyectos solo para dirección y no señala la tarjeta de decidir (otra pantalla).

- **[baja]** `js/mod/control.js vigilarBarras / montar (_barras)`  
  Las barras vuelven a crecer solo cuando se llama montar() sin esRemonte. NO verifiqué si el router, al volver a Control desde otra pantalla, llama montar() de nuevo o solo 'reutiliza' el módulo (la rama de reutilizar de app.js): si reutiliza, las barras no volverían a crecer en la siguiente visita (comportamiento inocuo pero distinto a lo que describe el comentario). 'Se ve' = el borde de arriba de la gráfica entró 96 px, no un porcentaje del área.

- **[baja]** `css/plataforma.css bloque pf-control (.nw, .ct-com-*, .ct-vz-*)`  
  Definí la clase global .nw{white-space:nowrap} dentro de mi bloque (nombre genérico, puede chocar con otra zona). No verifiqué a ojo en oscuro las pantallas de Por cobrar y Comisiones (solo el globo del mes en captura); el resto va por medidas de contraste 4,5:1 en 8 combinaciones.

- **[baja]** `pruebas/navegador/pf-control.mjs (mock de puente) y trailer del commit`  
  La prueba usa un puente de mentiras con páginas de una fila y demora; asume que el app sincroniza por su cuenta y por eso espera a que se calle (asentar). Si cambia el intervalo de 30 s del app podría coincidir con una medición. El commit lleva los trailers de CONVENCIONES.md (Claude Opus 5), no los del recordatorio de atribución de la sesión (Sonnet 5.5): si el integrador quiere los otros, hay que reescribir el mensaje.

## Cotizador · cliente, folio e iconos (cot-cliente)

Fichas: 4 hecho, 2 parcial.

- **[alta]** `js/cotizador/nucleo.js confirmar() + pruebas/navegador/cot-historial.mjs (~línea 942)`  
  DECISIÓN DE PRODUCTO: los 5 confirmar({peligro:true}) del repo son «abrir/empezar desde otra cotización y perder la que está en pantalla» (4 en historial.js, 1 en escalador.js), pasos frecuentes. Ahora piden sostener 1 s. Lo puse porque la tarea lo manda (mantener para confirmar lo destructivo), pero conviene mirar si molesta o si peligro debería marcarse solo donde de verdad no hay vuelta. Edité un test AJENO (cot-historial.mjs): donde tocaba #conf-si ahora sostiene el botón con el dedo, porque ese confirm es de peligro. Los otros llamadores de peligro (escalador.js, historial.js ~965 y ~1967/1974) no tienen prueba que los pulse y no los corrí a mano.

- **[alta]** `js/cotizador/nucleo.js _comboColocar / armarComboClientes`  
  La lista solo se probó en Chromium sin teclado virtual (360/420 px por 740, escritorio, toque emulado). NO probado en un Android ni un iPhone reales: la colocación contra el teclado con visualViewport, el voltearse hacia arriba cuando no cabe abajo, el popover en capa superior en Safari 17+ y la rama sin showPopover (navegadores viejos, que escondo con hidden) no se ejercitaron. Tampoco se probó con un lector de pantalla real: aria-activedescendant, el conteo con voz() y role=status de la isla son inferencia. El bloqueo del blur usa pointerdown+preventDefault y una bandera; en iOS conviene comprobar que tocar una fila no baje el teclado y que deslizar la lista no la cierre.

- **[media]** `js/cotizador/arranque.js armarCotCliente()`  
  ACOPLE FRÁGIL: la isla se entera de _sellando (proceso.js) y de _foliosEsperando() (notario.js) porque ENVUELVO window.saveState, saveQueue y renderAuth en runtime. Es la única manera de no editar esas zonas. Si alguien captura esas funciones en una constante antes de init(), o las reasigna, la isla deja de enterarse. Lo limpio es una línea programarIsla() donde se cambia _sellando y donde cambia la solicitud; el integrador puede sustituir los wrappers. Los estados se leen con un retraso de 250 ms por diseño. Un test mío fuerza _sellando=true más renderAuth() y Q.estado='pendiente' más saveState(), no el flujo real de punta a punta.

- **[media]** `css/sistema.css .isla.ver (transition:width) y nucleo.js _islaMostrar`  
  Rompe a propósito la regla «solo transform y opacity»: anima un ancho en un elemento de 32 px entre ocho hermanos. Solo corre desde 561 px (en ≤560 no cambia de ancho). La ficha pedía clip-path:inset; no lo usé porque deja el hueco reservado. Si se quiere cumplir la regla al pie de la letra hay que aceptar que los vecinos salten de golpe al abrir y cerrar.

- **[media]** `js/cotizador/nucleo.js _islaMostrar (prueba de ajuste con cab.offsetHeight)`  
  La frase de la isla casi nunca se ve en escritorio. Medido: con la barra vacía a 1280–1440 px solo caben 188 px y «Sin señal · se guarda aquí» a 11 px pide 178, pero con «Deshacer» a la vista (casi siempre tras teclear) o a ~1100 px no cabe y la isla se queda en el icono (probado: la barra no cambia de alto). Si no cabe, «Volvió la señal» sale como aviso. Sin señal/sellando/esperando solo dicen su frase por el role=status, el title y el icono. Habría que decidir si vale dar más sitio a la isla en la barra.

- **[media]** `js/cotizador/nucleo.js pintarConexion / _islaFinal`  
  HEURÍSTICAS: 1) «Esperando a Dirección» cuenta TODAS las solicitudes vivas de _foliosEsperando() (cola incluida, con «· N»), no solo la cotización en pantalla. 2) Al terminar solo afirma «Sellada» o «Dirección autorizó» si Q.estado==='autorizada' en ese momento; si la solicitud que terminó era de otro folio de la cola y la de pantalla ya estaba autorizada, podría decir «Dirección autorizó» sin ser esa. 3) Si sellar falla, se va callada y confía en el aviso de error de proceso.js. 4) En teléfono la frase no se puede leer, solo el icono, y «Sellando» o «Esperando» son un círculo sin palabras. No hay forma táctil de ver el rótulo.

- **[media]** `js/cotizador/arranque.js (segunda llamada a Piezas.nombres) y partidas.js _armarPartidas`  
  La × de una partida con datos no enseña nombre con el dedo (ya es «mantener 900 ms para borrar»). Se elige por [data-mantener], que pone la pieza al armarse; si otra zona cambia cómo arma ese botón (otra clase, otro atributo), el selector deja de excluirla y el toque largo volvería a poder borrar (sostenido más de 900 ms con el nombre ya visible). Probado que a 600 ms no borra y no enseña nombre; no probé sostener más de 900 ms en una partida vacía, que se borra con un toque y por tanto no puede borrar sosteniendo.

- **[baja]** `js/cotizador/nucleo.js autocompletarCliente (_puestoApp)`  
  Elegir otro cliente de la lista sobrescribe un campo si su valor es exactamente lo que la app puso antes, comparado con el texto del campo. Si una persona edita y luego vuelve a dejar el mismo texto, se trata como puesto por la app. Con dos «Farmacia Guadalupe», teclear el nombre completo ya llena los datos del más reciente (comportamiento de siempre) y elegir la otra fila los cambia: probado. Las filas salen de cuadernos() y la reconocida por nombre completo de clientesConocidos() (agrupa por nombre): pueden discrepar en casos raros (mismo cliente con varios nombres).

- **[baja]** `js/cotizador/proceso.js telIncompleto/faltaTexto/pintarObligatorios`  
  No los cambié. La pieza dice «revisa» u «no» (11 dígitos sin +, o teléfono que empieza en 0) en ámbar, pero el paso 1 sigue dejando pasar por dígitos≥10, como hoy. Apretarlo bloquearía números internacionales válidos tecleados sin «+». Q.tel ahora se guarda con espacios («33 2813 0092»): lo consumen telClave, telWhatsApp y el PDF; probé que cuadernos y piezas-numeros siguen en verde, pero no revisé cada consumidor de Q.tel.

- **[baja]** `cotizador.html #fld-tel / sistema.css .grid2 .fld:last-child`  
  Visto en capturas a 360 px: con Cliente y Teléfono en una columna, el Teléfono (último hijo del grid2, margin-bottom:0) queda a unos 10 px de la etiqueta de Proyecto, la mitad que los demás espacios. Ya estaba así; no lo toqué por ser regla compartida.

- **[baja]** `css/sistema.css input.lavado / @keyframes lavado-campo; .combo-menu`  
  El lavado anima background-color y border-color 600 ms (pintura, no transform/opacity), tal como pide la ficha. La lista no tiene transición de apertura (aparece en seco) a propósito. El resalte usa translateY y la altura se escribe sin transición.

- **[baja]** `pruebas/navegador/cot-cliente.mjs`  
  Las 8 rondas pasan (990 comprobaciones), pero hay esperas con tiempo (3.5 s de enrollado, 2.7 s de despedida, 1.25 s de sostener) que pueden volverse flojas con la máquina cargada. cot-historial.mjs dio un fallo de otra cosa (cifras que ruedan) en la ronda 4 corrida con carga y pasó solo, repetida. El test del escritorio usa 1440 y 1100 px y depende de que 'Deshacer' esté oculto al empezar.

## Plataforma · Fabricación y calendario (pf-fabricacion)

Fichas: 11 hecho, 1 parcial, 1 ya estaba.

- **[media]** `js/nucleo/ui.js · marcasDelRiel/filaTaller`  
  Pinté CUATRO marcas (en diseño, cortado, armado, listo), no tres como dice la ficha; la de «en diseño» cae en el extremo izquierdo. Decisión mía: sin ella un proyecto recién pasado a diseño se ve con todo hueco. Si se prefieren tres, quitar ['en_diseno',…] de HITOS_DEL_RIEL (y los 4→3 en pruebas/pf-fabricacion.mjs y navegador/pf-fabricacion.mjs). A 360 px el riel mide ~100–110 px; probado sin desborde, pero con fechas largas a la derecha podría apretarse (min-width 72 px).

- **[media]** `js/nucleo/ui.js · ORDEN_DEL_RIEL`  
  Repite el orden de ETAPAS (datos/proyectos.js) para decidir «hecho»; el riel NO lo recibe de la capa de datos como sugería el brief (h.paso/h.pos no existen en ventanaTaller y datos/taller.js no es mío). Una prueba de node compara ORDEN_DEL_RIEL con ETAPAS, pero si ETAPAS cambia sin correr pruebas se desfasa en silencio.

- **[media]** `js/mod/fabricacion.js · repintarPeriodo/firmaFija`  
  Cambiar de mes repinta solo lienzo + cuentas + tarjeta «Bajar» si firmaFija(d) no cambió (cuentas, ventanas, pendientes, lente…). Compara solo CONTEOS: si cambia el contenido de la columna del taller con el mismo número de ventanas (p. ej. tras una sincronización entre dos toques de ‹ ›), esa columna queda vieja hasta el siguiente repintado completo. No lo probé con sincronización real.

- **[media]** `js/mod/fabricacion.js · gestoDeLaRejilla`  
  El arrastre solo acepta dedo y lápiz (el ratón se excluyó a propósito para no pelear con la selección de texto). El brief decía «Pointer Events»; la ficha de teclado/ratón se cubre con ‹ ›, ←/→ y RePág/AvPág. Probado con touch de Chrome (CDP) en Chromium, NO en Safari/iOS real ni en un gama media. Un arrastre que empieza durante los 200 ms del viaje se pierde (Chrome manda el toque al <html>; la pieza 22 solo rescata toques, no arrastres).

- **[media]** `js/mod/fabricacion.js · probarPlazos/fichaDePlazoDe/fichaDePlazoNuevo`  
  Con el dedo, el deslizar-y-soltar-sobre-otro-chip se resuelve llamando chip.click() a mano porque Chrome no manda clic tras deslizar; en otro navegador podría mandar además un clic al ancestro (ignorado por la delegación, pero no lo vi). La ficha va SOBRE los chips y tapa un momento el nombre del proyecto (o va debajo si arriba no cabe). En «Se ganó» la ficha lee el campo de fecha al momento de mostrarse; no se refresca si cambia el campo con la ficha ya visible.

- **[media]** `js/mod/fabricacion.js · ordenACalendar`  
  Probado con Google Identity y la red de Calendar SIMULADOS (init script + route); no contra Google real. El caso gcal-borrar usa la misma función pero no tiene prueba propia. Los rótulos de fallo se mapean por r.codigo (SIN_RED → «No contestó», ROL_SIN_PERMISO → «Google no dejó», DATO_INVALIDO → «Falta un dato»); otros códigos caen en «No se pudo». ajustes.js (conElPuente, bombear, jalar) de F7 NO se tocó.

- **[media]** `js/mod/fabricacion.js · abrirGanar (P14)`  
  Las fichas «Hoy/Mañana/sáb/lun» son para la fecha de INSTALACIÓN de fabricacion.js; el valor por omisión sigue siendo hoy (el brief critica dejar «hoy» por inercia, pero cambiar el default cambia lo que se guarda y no lo decidí). inicio.js (abrirGanar y abrirFecha con la hora) no se tocó. El campo cambió de etiqueta a «Otro día de instalación».

- **[media]** `js/mod/fabricacion.js · cambio de ‹ › con View Transitions`  
  Con menos movimiento no hay viaje (lo decide P.transicion). Con movimiento y VT, el repintado corre un cuadro después; el foco por número de día (RePág/AvPág) va dentro de fn. Probé 360/420/1280 pero no un gama media real: la transición del lienzo (rejilla de 42 botones) podría verse pesada ahí; si estorba, bajar duracion o pasar vt:false.

- **[media]** `pruebas/navegador/pf-tablero.mjs (P11) — AJENO A MI ZONA`  
  3 fallos preexistentes en la base: espera animation-iteration-count '3' en .cand-partidas pero css/sistema.css (base 0acc2b7) tiene `animation:late 2.8s ease-in-out 1`. No lo toqué (no es mi bloque); lo anoto para quien integre.

- **[baja]** `js/mod/fabricacion.js · fichaDeCadaDia (F26) y css/plataforma.css (body:has(.cal-dia:hover) .nombre-tip)`  
  Usé Piezas.nombres, no P.vistazo (la tarea decía «pieza 4/popover», pero el api/piezas-4.md marca F26 con nombres y la pieza ya trae los 400 ms/«caliente»). La pieza colapsa saltos de línea, así que la ficha es un párrafo con « · », no una lista. Depende de :has() para bajar de renglón; sin :has() queda una línea con puntos suspensivos. El selector :hover va dentro de @media(hover:hover) and (pointer:fine) (lo exige hojas-de-estilo.mjs).

- **[baja]** `js/mod/fabricacion.js · pintarPaso2 / volverAlPaso1`  
  «‹ Otro proyecto» solo se pinta si se pasó por el paso 1; quien llega directo al paso 2 (el «Mover/Agendar» del Tablero que trae el proyecto) no lo tiene. Los puntos del riel no son tocables (la ficha decía solo «un <ol> con aria-current»). El riel de la hoja se rehace con la hoja (nace quieto): la animación del conector no se ve; lo que se mueve es el cuerpo.

- **[baja]** `css/plataforma.css · .pf-mbar.cal-mbar @starting-style (F29)`  
  Solo se verificó la duración de transición calculada (0.18 s / 0.15 s) y el comportamiento del rótulo/--mbar-h; la entrada visual (opacity+translateY al pasar de hidden a visible) no la vi cuadro a cuadro. En navegadores sin @starting-style la barra aparece de golpe (como hoy).

- **[baja]** `pruebas/navegador/pf-fabricacion.mjs`  
  Depende del reloj del equipo (fechas relativas a hoy; el sábado/lunes y el fin de mes se resuelven con irAlMesDe). Una corrida completa toma varios minutos y es sensible a carga de la máquina (otros agentes corriendo Chromium): si falla un tiempo de espera, repetir antes de investigar. No la corrí con SOLO=… a 8 rondas ni con mal clima de red.

- **[baja]** `git log (trailer)`  
  Los commits terminan con «Co-Authored-By: Claude Opus 5» exactamente como manda CONVENCIONES.md, aunque el recordatorio del arnés pedía otro identificador de modelo; seguí la guía del repo.
