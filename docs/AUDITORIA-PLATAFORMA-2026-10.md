# Auditoría UI/UX de la plataforma — octubre 2026

Hecha el 2026-10-13 con la skill ui-ux-pro-max por 5 revisores en paralelo, sobre `main` (da593cb). Cada hallazgo se reprodujo en Chromium real (Playwright) con datos de prueba: teléfono y computadora, claro y oscuro, roles dirección, fabricación y pagos. No se cambió código. El interior del cotizador no entra aquí: está en `docs/REVISION-UIUX-2026-10.md`.

## Resumen para Elías

**42 hallazgos: 0 críticos, 6 altos, 16 medios, 20 bajos.** Nada pierde dinero ni borra datos por sí solo, pero hay un fallo que **cambia la etapa de un proyecto sin querer** y conviene arreglarlo primero.

### Primero (altos)

| # | Qué pasa | Pantalla |
|---|---|---|
| `tablero-1` | Arrastrar el ratón sobre un renglón (por ejemplo para copiar el nombre del cliente) **avanza el proyecto de etapa**: sale «Deshacer» y a los 5 s queda escrito. | Tablero |
| `tablero-2` | Las instalaciones de esta semana salen bajo el título «Ya pasaron y nadie las marcó»; parecen vencidas. | Tablero |
| `proyectos-1` | Un clic algo largo (⅓ s) o con la mano movida 5 px sobre una tarjeta la levanta y la ficha no se abre. | Proyectos |
| `fabmat-1` | El Calendario marca «Falta material» en rojo en cada proyecto ganado, y como Material está en mantenimiento nadie lo puede quitar. | Calendario |
| `control-1` | En computadora, el Mapa esconde los filtros «Hoy / 15 días / Todo». | Mapa |
| `marco-1` | Teléfono acostado: en el cotizador dentro de la plataforma, «Continuar a partidas» queda tapado o fuera de pantalla. | Cotizador empotrado |

### Un mismo patrón en 4 pantallas: los clics que se pierden
El fallo de las fichas del recorte (PR #106) no era único. Gestos de arrastre que se arman al apretar el botón se comen los clics con un poco de temblor: **Proyectos** (`proyectos-1`), **Tablero** (`tablero-1`, `tablero-5`), **Mapa** (`control-2`). Conviene arreglarlos juntos con una sola regla: con ratón, no arrastrar desde controles y exigir más movimiento antes de convertir un clic en arrastre.

### Después (medios, en tandas)
- **Estado de la señal:** tarda 30 s en decir «sin señal» y en el teléfono no se puede leer (`marco-2`, `marco-3`).
- **Listas que no tienen tope:** Tablero de 32 000 px en el teléfono y lento con 200+ proyectos; «Qué atender» de 37 000 px (`tablero-3`, `marco-5`).
- **Cosas que tiran trabajo o lo hacen sin querer:** «Datos para la entrega» se cierra sin preguntar (`control-4`); la hoja Agendar trae hoy puesto (`fabmat-3`); las teclas 1–9 cambian de pantalla estando en un botón (`marco-4`).
- **Permisos:** pagos ve «Mover la fecha» y le sale un error (`tablero-4`).
- **Acomodo:** pestañas de Control muy abajo (`control-3`), primer proyecto muy abajo en teléfono (`proyectos-4`), Mapa acostado (`control-5`), agendar sin botón en computadora (`fabmat-2`).
- **Otros:** Alt+→ en Proyectos pierde el foco (`proyectos-2`), «Subtotal $0.00» falso (`proyectos-3`), hoy en el calendario oscuro ilegible (`fabmat-4`).

### Pulido (bajos)
Botón flotante «Preguntar» tapando cosas en varias pantallas (`proyectos-7`, `control-5`, `control-6`, `marco-10`), textos y formatos (`fabmat-6`, `fabmat-7`, `control-8`, `control-9`, `control-10`), teclado y enlaces (`fabmat-5`, `marco-7`, `marco-8`, `control-11`), y el resto en el detalle de abajo.

### Nota sobre las pruebas
Los 3 fallos de `pruebas/navegador/capas.mjs` **no son de la app**: su sección 4 busca el catálogo de Material, apagado por mantenimiento desde 7dabd21. Basta saltar esa sección mientras Material siga apagado.

---

# Detalle por grupo


## Grupo: Tablero e Inicio

## Auditoría UI/UX — grupo `tablero`

- **Pantallas:** Tablero (`#/hoy`, js/mod/tablero.js) y «Qué atender» (`#/atender`, js/mod/inicio.js; es lo que pinta inicio.js desde que la app abre en el Tablero).
- **Roles:** direccion, fabricacion, pagos (los datos se sembraron siempre como dirección con `ganar()`/`agendar()`/`avanzarEtapa()` y luego se cambió de rol, porque pagos no puede agendar y sembrar como pagos deja todo «sin fecha»).
- **Tamaños:** 360×780, 390×844, 768×1024 (táctil); 844×390 (teléfono acostado, oscuro); 1024×768, 1366×768, 1920×1080 (ratón).
- **Temas:** claro y oscuro en los tres roles a 360 y 1366.
- **Datos:** 7 proyectos en todas las etapas (tarde, vencido, cortado ×2, armado, listo, sin fecha) + 3 cotizaciones sin decidir; para el rendimiento, 57 y 227 proyectos, con CPU normal y ×4.
- Scripts: `scratchpad/pw/tb-*.mjs`. Capturas: `aud/tablero/cap/`. Salidas: `aud/tablero/*.txt`.

---

#### tablero-1 · [ALTA] En la computadora, arrastrar el ratón sobre un renglón para seleccionar el nombre avanza el proyecto de etapa
- **Dónde:** js/piezas.js:2302-2335 (`alBajar`/`alMover` del renglón deslizable; no distinguen ratón de dedo). Se usa en js/mod/tablero.js:1060-1068.
- **Qué le pasa al usuario:** Elías quiere copiar el nombre de un cliente del Tablero, arrastra el ratón sobre el texto y el renglón se va a la derecha: aparece «Deshacer» y a los ~4 s el proyecto queda marcado como «Ya se armó» (o lo que toque). Además el texto nunca se selecciona.
- **Cómo lo reproduje:** 1366×768, dirección, claro. Renglón «La Perla» (cortado). Botón del ratón abajo a 20, 50 o 100 px del borde izquierdo del renglón, arrastrar en horizontal hasta el 95 % del ancho, soltar. Las tres veces salió «Deshacer». Sin tocarlo: t+2.5 s etapa `cortado`, t+5 s etapa `armado` (leído de IndexedDB). `getSelection()` vacío. Captura `cap/f-arrastre-seleccion.png`. Salida `func3.txt`.
- **Arreglo propuesto:** en `alBajar` de piezas.js, ignorar el gesto cuando `e.pointerType === 'mouse'` (el ratón ya tiene los botones de la cara: «Ya se armó», «Abrir»), o como mínimo exigir `pointerType !== 'mouse'` para la acción `principal` (deslizar a la derecha) y dejar solo el lado izquierdo para el ratón. Con eso también vuelve a poderse seleccionar texto.
- **Esfuerzo:** S. **Riesgo:** bajo; la prueba `pf-tablero.mjs` P29 usa dedo de verdad (CDP touch), no ratón, así que no la rompe; revisar si alguna prueba arrastra con ratón.

#### tablero-2 · [ALTA] Las instalaciones de esta semana salen debajo del título «Ya pasaron y nadie las marcó»
- **Dónde:** js/mod/tablero.js:1178-1195 (`seInstalaEstaSemana`).
- **Qué le pasa al usuario:** En la tarjeta de la derecha se ve «Se instala esta semana 1» sin nada debajo, luego «Ya pasaron y nadie las marcó 1» y debajo DOS renglones: el que de verdad ya pasó (10 oct) y el de esta semana (17 oct). Parece que la instalación del sábado ya está vencida.
- **Cómo lo reproduje:** 1366×900, dirección, claro, con un proyecto instalado hace 3 días (Parentesis) y otro a 4 días (Healthylicious). En el DOM, el orden es: encabezado «Se instala esta semana», encabezado «Ya pasaron…», fila Parentesis, fila Healthylicious. Captura `cap/orden-semana.png` (también visible en 360 y en oscuro).
- **Arreglo propuesto:** el código empuja el encabezado de la semana, luego el bloque de vencidas completo, y al final las filas de la semana. Mover el bloque de vencidas ANTES de `const h = [...]` (que es lo que dice el comentario: «Arriba, en tono malo»), o pintar las filas de la semana justo después de su encabezado.
- **Esfuerzo:** S. **Riesgo:** bajo.

#### tablero-3 · [MEDIA] Con 50+ proyectos el Tablero del teléfono mide 30 000 px y el taller queda a 18 000 px de la parte de arriba
- **Dónde:** js/mod/tablero.js:779-800 (`faltanDatos`, sin tope), «Hoy en el taller» y «No llegan» sin tope; orden en 414 (`taller-primero`).
- **Qué le pasa al usuario:** En el teléfono, antes de llegar a los renglones del taller hay que pasar por todas las tarjetas: con 57 proyectos «Faltan datos» trae 57 renglones con su botón «Completar» (9 225 px él solo) y el primer renglón del taller empieza en y=18 030. Además, en un teléfono medio tarda en pintar.
- **Cómo lo reproduje:** 390×844 táctil, dirección. Con 57 proyectos: alto de página 32 520 px, «Faltan datos» en y=8 630, primer `.tb-renglon` en y=18 030 (en 1366: 16 588 / 7 101). Con 227 proyectos: 114 682 px de alto, 11 851 nodos; con CPU ×4 el Tablero tarda 6,1 s en aparecer (tarea larga de 1,7 s) y «Qué atender» 7,1 s; con 57 proyectos, 1,7 s y 2,2 s. Filtrar por estación sí baja a la lista (bien), pero regresar arriba son 17 500 px. Salidas `perf2.txt`, `perf.txt`; captura `cap/faltan-390.png`.
- **Arreglo propuesto:** en `faltanDatos` pintar solo los 5 primeros (ya vienen ordenados por entrega) + botón «Ver los N que faltan» que lleve a Proyectos filtrado; igual para «Hoy en el taller» (tope 5-8 y «Ver todos»). En teléfono, plegar la tarjeta «Faltan datos» bajo un `<details>` con la cuenta en el resumen.
- **Esfuerzo:** M. **Riesgo:** bajo; revisar que la cuenta «7 Faltan datos ›» siga bajando a algo visible.

#### tablero-4 · [MEDIA] Pagos ve «Mover la fecha» y al tocarlo lo mandan al Calendario con un error
- **Dónde:** js/mod/tablero.js:720 (botón en «No llegan a su fecha») y 1064-1067 (acción oculta del renglón al deslizar a la izquierda). El permiso ya existe en js/mod/fabricacion.js:575 (`puedeAgendar`).
- **Qué le pasa al usuario:** La persona de pagos desliza un renglón, ve «Mover la fecha», lo toca, la app cambia de pantalla al Calendario y ahí le sale en rojo «Agendar es de dirección. Si te toca a ti, cambia de rol en Ajustes.». Perdió su lugar en el Tablero por un botón que nunca pudo usar.
- **Cómo lo reproduje:** 390×844 táctil, rol pagos. Deslizar a la izquierda «La Perla» con dedo (CDP touch): aparecen «Abrir» y «Mover la fecha». Tocar «Mover la fecha» → `#/agenda` + aviso rojo. Captura `cap/pagos-mover.png`. En «No llegan a su fecha» el botón está a la vista para pagos.
- **Arreglo propuesto:** en tablero.js, agregar la acción solo si `Prefs.rol() !== 'pagos'` (mejor: exportar `puedeAgendar` de un solo lugar y usarlo en los dos puntos). Para pagos, la acción oculta queda solo «Abrir».
- **Esfuerzo:** S. **Riesgo:** bajo.

#### tablero-5 · [BAJA] Un clic con el ratón un poco movido (9 px o más de lado) sobre «Abrir» no hace nada
- **Dónde:** js/piezas.js:2317 (umbral de 8 px antes de decidir arrastre), sobre botones de la cara del renglón.
- **Qué le pasa al usuario:** Con touchpad o ratón flojo, un clic que se resbala un poco sobre «Abrir» o «Ya se armó» se toma como inicio de deslizamiento y el clic se pierde sin aviso; hay que volver a darle.
- **Cómo lo reproduje:** 1366×768, dirección, «Gym Titanio» → botón «Abrir» de la cara. Clic con 4 px de temblor: abre Proyectos. Con 9 px y con 14 px: se queda en `#/hoy`, nada abre, etapa sin cambio (`func2.txt`). Con 3 y 6 px funciona.
- **Arreglo propuesto:** queda resuelto con el arreglo de tablero-1 (no armar el gesto con ratón). Si se quiere conservar con ratón, no empezar el gesto cuando `pointerdown` cae sobre un `button` de la cara.
- **Esfuerzo:** S. **Riesgo:** bajo.

---

### Lo que está bien
- Sin errores de página ni de consola en ningún rol/tamaño/tema (17 combinaciones + pruebas de función).
- Sin scroll horizontal en ningún tamaño (la tubería de estaciones en teléfono se recorre de lado dentro de su tira, como está diseñado).
- Todos los objetivos táctiles miden ≥44 px en 360/390/768; ningún botón sin nombre; contraste de texto ≥4,5:1 en claro y oscuro (lo único que marcó el medidor fue el `btn-pri` con degradado, falso positivo).
- Atrás del navegador: «Abrir» abre la ficha, el primer Atrás la cierra y el segundo regresa al Tablero en la misma posición de scroll.
- «No se dio» en «Qué atender» pide confirmación con motivo opcional antes de escribir.
- Filtrar por estación baja a la lista filtrada y marca `aria-pressed`.
- Los permisos de fabricación y pagos se respetan en los botones de la cara (pagos solo ve «Abrir»; fabricación no ve «Ya se instaló»).

### Sin reproducir
- Foco del teclado tapado por la barra fija o el botón «Preguntar»: el recorrido con Tab se cortó por un error de mi script y no lo repetí por presupuesto.
- Botón «Decidir N cotizaciones» de la barra pegajosa del Tablero: no lo encontré dentro de `#mod-tablero` con mi selector; no verifiqué a dónde lleva.
- Teléfono físico (safe-area, teclado virtual): solo emulación.


## Grupo: Proyectos

## Auditoría UI/UX · grupo `proyectos`

- **Pantalla:** Proyectos (`#/proyectos`, `js/mod/proyectos.js`): tablero/lista por etapa, ficha, cambio de etapa (ratón, teclado), estatus de dinero y cuenta de cobro, «No se dio», Escape y atrás, ir y volver de pantalla.
- **Datos:** 150 proyectos sembrados por `Proy.ganar()` + `avanzarEtapa()` (25 por etapa, 125 en obra en el tablero), con nombres largos (60+ caracteres). Script: `aud/proyectos/a1.mjs` + pasos `paso.mjs`, `movil.mjs`, `p3.mjs`…`p6.mjs`.
- **Tamaños:** 360x780 y 390x844 (táctil), 844x390 (teléfono acostado, táctil), 768x1024, 1024x768, 1366x768, 1920x1080.
- **Roles:** dirección (todo), pagos (390, ficha), fabricación (1366, ficha). **Temas:** claro y oscuro (1366).
- **Rendimiento con 150:** primer pintado 130–160 ms, abrir ficha 27 ms, mover tarjeta 123–136 ms, buscar ~420 ms (con su espera). Cero `pageerror` en todas las corridas. Sin scroll horizontal de página en ningún tamaño.

### Las 3 fallas de `pruebas/navegador/capas.mjs`: es la PRUEBA vieja, no la app

Corrí la prueba tal cual contra el servidor 8940 (copia con rutas de Windows en `aud/proyectos/capas.mjs`): **todas las secciones de Proyectos pasan** (X de la orden, atrás una por toque, «No se dio» desde la ficha y contestarlo, asistente encima de la ficha). Las 3 fallas son de la **sección 4, que no es de Proyectos**: abre `#/material`, toca `[data-hoja="catalogo"]` y luego `[data-editmat]`. Desde el commit 7dabd21 (9-oct) Material está en mantenimiento (`js/mod/material.js:199` `EN_MANTENIMIENTO = true`, `montar()` pinta solo el aviso y sale en :208-213), así que no existe ningún botón de catálogo: `al editar quedaron []` y `un Escape dejó []` salen de ahí, y `el atrás … hash:'#/proyectos'` es el `goBack()` que, sin capa abierta, regresa de `#/material` a la pantalla anterior (Proyectos). No es un defecto de capas.

Además reproduje el mismo caso de la sección 4 (Escape con dos capas) en Proyectos: ficha + orden de trabajo → un Escape deja solo la ficha con `history.state = {"capa":"pf-ficha"}`, y el atrás siguiente cierra la ficha quedándose en `#/proyectos`. Correcto.

**Arreglo propuesto:** en `pruebas/navegador/capas.mjs:139-160`, saltar la sección 4 mientras Material esté apagado (o mejor: moverla a Proyectos con ficha + «Orden de trabajo», que es el mismo par de capas apiladas y sigue vivo). Esfuerzo S. Riesgo nulo.

---

#### proyectos-1 · ALTA · Un clic «lento» o un poco movido sobre una tarjeta no abre la ficha

- **Dónde:** `js/mod/proyectos.js:1818-1819` (`MS_LEVANTAR = 250`, `MOVER_RATON = 4`) y :1866-1880 (rama de ratón de `cablearArrastre`); `soltarEnColumna()` :2003-2010 con `frenarClicUnaVez()`.
- **Qué le pasa al usuario:** en la PC, si se deja el botón apretado un cuarto de segundo o la mano tiembla 5 px al hacer clic, la tarjeta «se levanta», se vuelve a caer en su columna y la ficha no se abre. No sale ningún aviso visible; parece que el clic no sirvió y hay que repetirlo.
- **Cómo lo reproduje:** 1366x768, dirección, 150 proyectos, ratón sobre la 3.ª tarjeta del tablero. Resultados: clic quieto → ficha; clic con 3 px → ficha; clic 180 ms → ficha; **clic con 5-6 px → nada**; **clic sostenido 320 ms → nada** (a los 320 ms ya hay `.pj-levantada`, `.pj-fantasma` y la voz «Tarjeta levantada…»; al soltar la ficha sigue cerrada; el clic siguiente sí la abre). Es el mismo patrón de clic comido que ya se encontró en el cotizador, ahora reproducido en el tablero.
- **Arreglo propuesto:** con ratón, no levantar por tiempo (quitar el `setTimeout(... MS_LEVANTAR)` de la rama `pointerType === 'mouse'`, :1878) y subir `MOVER_RATON` a 8 px. Y en `soltarEnColumna()`, si la columna de destino es la misma de origen (`_arr.desde === etapa`) y el recorrido total fue < 12 px, no llamar a `frenarClicUnaVez()` sino abrir la ficha (tratarlo como clic).
- **Esfuerzo:** S. **Riesgo:** bajo; `pruebas/navegador/pf-proyectos.mjs` P9 prueba «mantener presionado también la levanta» con ratón: habría que ajustar esa expectativa (con el dedo se queda igual).

#### proyectos-2 · MEDIA · Mover una tarjeta con Alt+→ tira el foco: la segunda Alt+→ no hace nada

- **Dónde:** `js/mod/proyectos.js:1899-1914` (oyente de Alt+flechas) → `moverEtapa()` repinta el tablero y la tarjeta enfocada se destruye.
- **Qué le pasa al usuario:** quien mueve obra con teclado (atajo anunciado por la propia app) solo puede dar un paso: tras el primero el foco cae al `<body>` y hay que volver a buscar la tarjeta con Tab entre 125.
- **Cómo lo reproduje:** 1366x768, 150 proyectos, foco en la 1.ª tarjeta de «Ganado», Alt+→: se mueve a «En diseño» (voz «Ahora está en «En diseño»») y `document.activeElement` = `BODY.pf`. Segunda Alt+→: la tarjeta sigue en `en_diseno`.
- **Arreglo propuesto:** al terminar el repintado de `moverEtapa`, volver a enfocar `.pj-tarj[data-abrir="<id>"]` (con `{preventScroll:false}`) si el movimiento vino de teclado; mismo patrón que ya se usa al cerrar la ficha (el foco sí vuelve a LA MISMA tarjeta tras Escape y tras la X — medido).
- **Esfuerzo:** S. **Riesgo:** bajo.

#### proyectos-3 · MEDIA · La ficha dice «Subtotal $0.00» cuando la venta no trajo subtotal

- **Dónde:** `js/mod/proyectos.js:1305` (`p.sub != null ? money(p.sub) : …calculado / Sin capturar`) contra `js/datos/proyectos.js:325` (`num()` convierte `undefined` en `0`) usado en :488 (`desdeVentaDeHoja`: `sub: num(v.sub)`), :607 y :1418.
- **Qué le pasa al usuario:** al lado de «Total vendido $106,492.00» aparece «Subtotal $0.00». Es dinero que no cuadra a la vista, justo en la ficha que se le enseña al cliente. El propio comentario del código dice que esto ya se había querido evitar, pero la guarda nunca se cumple porque el dato llega como 0, no como vacío.
- **Cómo lo reproduje:** 1366x768, dirección; proyecto creado con `ganar()` sin `sub` (como una venta importada de la hoja con la celda vacía o una cotización vieja). Ficha de COT-7132: «Subtotal $0.00 / Total vendido $106,492.00» (captura `ficha-1366.png`).
- **Arreglo propuesto:** en `js/datos/proyectos.js` guardar `sub: trae(x) ? num(x) : null` en las tres rutas (:488, :607, :1418), para que la ficha caiga en «calculado» o «Sin capturar» como ya está escrito.
- **Esfuerzo:** S. **Riesgo:** bajo; revisar que la exportación TSV/hoja (`data-tsv`) trate `null` como vacío.

#### proyectos-4 · MEDIA · En teléfono (y acostado) casi no se ve ningún proyecto sin bajar

- **Dónde:** cabecera del módulo `js/mod/proyectos.js:170-190` (4 cifras grandes + tarjeta «Proyectos» con «Enseñar al cliente» + buscador + tira de etapas) y su CSS en `css/plataforma.css`.
- **Qué le pasa al usuario:** al abrir Proyectos en el teléfono la primera tarjeta empieza a 577-581 px: se ve un pedazo de un solo proyecto. Con el teléfono acostado (844x390) la primera tarjeta queda en y=422, **fuera de la pantalla**: no se ve ningún proyecto.
- **Cómo lo reproduje:** 360x780 y 390x844 táctil: `primeraTarjTop` 577/581; 844x390: 422 con alto de vista 390 (`t-844x390-direccion.png`). En 1366x768 la primera tarjeta está en 399.
- **Arreglo propuesto:** por debajo de 760 px de ancho o 500 de alto, convertir las 4 cifras en una sola fila compacta de chips (o plegarlas tras «Resumen»), y bajar «Enseñar al cliente» al lado del buscador. Meta: primera tarjeta por encima de ~300 px en 390x844.
- **Esfuerzo:** M. **Riesgo:** bajo; pf-proyectos P12 depende del interruptor de modo cliente, solo cambia de sitio.

#### proyectos-5 · BAJA · A 1024 px el importe se sale de la tarjeta y el folio se parte en dos renglones

- **Dónde:** `css/plataforma.css:1647-1650` (`.pj-tarj-pie` flex con `.pj-tarj-folio` + `.pj-tarj-monto`), columnas de 136 px.
- **Qué le pasa al usuario:** en una laptop chica o tablet acostada el «$115,264.00» rebasa el borde de la tarjeta y «COT-7144» se parte en «COT-» / «7144»; los nombres ocupan hasta 10 renglones. Se ve descuadrado.
- **Cómo lo reproduje:** 1024x768, dirección: 21 elementos sobresalen de su tarjeta; el monto termina en x=972 con la tarjeta en 969 (`t-1024-alfinal.png`).
- **Arreglo propuesto:** `.pj-tarj-pie{flex-wrap:wrap}` y `.pj-tarj-folio{white-space:nowrap}`; o dar a las columnas `min-width:180px` y dejar que el tablero se deslice a lo ancho (ya lo hace a 768).
- **Esfuerzo:** S. **Riesgo:** bajo.

#### proyectos-6 · BAJA · En el teléfono los botones del pie de la ficha se parten en 3–4 renglones y se comen la ficha

- **Dónde:** pie de la ficha `js/mod/proyectos.js:1445-1460` (Orden de trabajo / Copiar datos para la hoja / No se dio en tres columnas).
- **Qué le pasa al usuario:** a 360 px los tres botones miden 102 px de alto («Copiar datos para la hoja» en 4 renglones); el pie ocupa 130 de 780 px y la parte que se lee de la ficha queda en ~450 px.
- **Cómo lo reproduje:** 360x780 táctil, ficha de la 1.ª tarjeta (`m-ficha-360x780.png`); 390x844 igual (102 px).
- **Arreglo propuesto:** bajo 420 px, rótulos cortos («Orden», «Copiar», «No se dio») con el texto largo en `aria-label`, o «No se dio» a todo lo ancho en una segunda fila de 44 px.
- **Esfuerzo:** S. **Riesgo:** bajo.

#### proyectos-7 · BAJA · El botón flotante «Preguntar» tapa el importe de la tarjeta de la última columna

- **Dónde:** `#pf-ia-btn` (flotante, `js/app.js`/`css/plataforma.css`) sobre el tablero.
- **Qué le pasa al usuario:** en 1024 y 1366 tapa el pie («COT-7148 $1…») de la tarjeta de «Listo para instalar» que quede a esa altura; en el teléfono tapa el monto de la tarjeta que pasa por la esquina. Se resuelve desplazando, pero estorba justo en el dato del dinero.
- **Cómo lo reproduje:** capturas `t-1024x768-direccion.png`, `lista-1366-claro.png`, `t-390x844-pagos.png`.
- **Arreglo propuesto:** `padding-bottom` en `#mod-proyectos` igual al alto del flotante + 16 px, y en el tablero de escritorio `padding-right` en la última columna o el flotante solo con ícono (56 px) en Proyectos.
- **Esfuerzo:** S. **Riesgo:** nulo.

---

### Lo que está bien

- Capas: X, Escape y atrás cierran una capa por toque, «No se dio» se abre y se puede contestar, el atrás nunca saca de Proyectos con una capa abierta; el foco vuelve a la misma tarjeta tras Escape o X.
- 150 proyectos no congelan nada (pintado < 170 ms, abrir ficha 27 ms, mover 130 ms).
- Contraste ≥ 4.5:1 en todo texto visible de lista y ficha, en claro y oscuro; foco visible (anillo de 2 px).
- Sin desborde horizontal de página en 360–1920; en teléfono las etapas son páginas que se deslizan; objetivos de toque ≥ 44 px en lista y ficha a 360/390.
- Roles: pagos ve dinero y cuentas sin etapas; fabricación ve etapas y orden sin dinero.
- Estatus de dinero: tocar «COBRANDO» guarda, marca `aria-pressed` y no pierde el foco ni el scroll de la ficha.
- Búsqueda sin resultados tiene salida («Borrar la búsqueda»).

### Sin reproducir

- **Carpetas de Drive en la ficha / aviso `#pj-drive`:** con la hoja de mentiras no hay puente configurado (`SIN_CONFIG`), así que el bloque no se pinta. No lo inventé.
- **Pagos/anticipos capturados como monto:** la ficha no tiene campos de monto editables (solo «Anticipo pactado» de lectura, estatus y cuenta); no encontré dónde se registra un pago parcial en esta pantalla.
- **Arrastre con el dedo en tablet (768):** solo lo leí (mantener 250 ms levanta, por diseño); no lo ejercité con toques reales.
- **Columna con 150 tarjetas:** con rol pagos todas quedaron en «Ganado» (pagos no puede avanzar etapa) y la página midió 28,204 px sin «ver más»; es un caso de mi siembra, no lo cuento como hallazgo, pero conviene un tope por columna si el taller llega a ese volumen.


## Grupo: Calendario y Material

## Hallazgos · grupo `fabmat`

**Pantallas:** Calendario (`#/agenda`, js/mod/fabricacion.js) y Material (`#/material`, js/mod/material.js).
**Código:** worktree `auditoria-pf` (main b7f0aff). Servidor 127.0.0.1:8940.
**Probado:** 360x740, 390x844, 844x390 (teléfono acostado), 768x1024, 1024x768, 1366x768. Roles direccion y fabricacion. Claro y oscuro. Dedo (hasTouch) en teléfono, ratón y teclado en escritorio.
**Datos:** sembrados por la capa de datos como en `pf-fabricacion.mjs`: 14 proyectos ganados con `Proy.ganar()`, 4 agendados (a +3, +3, +9 y +16 días), uno en «cortado», conteos y un movimiento de almacén. Para rendimiento, 264 proyectos con 254 agendados.
**Scripts y capturas:** `scratchpad/pw/fabmat/*.mjs` y `scratchpad/aud/fabmat/*.png`.

**Material está apagado en main** (`const EN_MANTENIMIENTO = true`, js/mod/material.js:199). Lo que ve el usuario es una tarjeta de «en mantenimiento». La pantalla real la revisé solo de pasada, forzando la bandera a `false` en mi navegador (s6.mjs). Lo que salió de ahí va marcado «al reencender».

---

#### fabmat-1 · [ALTA] El Calendario avisa «Falta material» en rojo aunque la pantalla de Material está apagada
- **Dónde:** js/mod/fabricacion.js:593 (`PALABRA_SEM`), :907 (`veSemaforo() … dia.semaforo`), :1033 (fila del día). Lo origina js/datos/proyectos.js:705: `ganar()` llama a `Mat.recalcular()` en cada proyecto ganado. La pantalla está apagada en js/mod/material.js:199. El texto de exportar está en `pintarExportar` (fabricacion.js:1205).
- **Qué le pasa al usuario:** Cada proyecto ganado sale en el calendario con punto ámbar o rojo y con «Falta y es ya · Falta Acrílico blanco/opal 3 mm y 8 materiales más». Nadie puede quitar ese aviso, porque la pantalla donde se recibe y se cuenta material está «en mantenimiento». El equipo aprende a ignorar el rojo, y el día que sea de verdad tampoco lo va a ver. Además, la tarjeta «Al calendario del teléfono» promete «3 días antes para revisar el material» y «el conteo del almacén el día 1 de cada mes», y esa pantalla no existe ahora.
- **Cómo lo reproduje:** 390x844, direccion, claro. Sembré 5 proyectos con `ganar()` y los agendé. En `#/agenda`, el 16 oct (hoy + 3) sale con punto rojo y el 22 con punto ámbar. Al tocar el 16 sale la etiqueta roja «Falta y es ya» con la frase de arriba (captura `s2-dia-390x844-claro-direccion.png`). En `#/material` sale «Material está en mantenimiento» (`material-390x844-claro-direccion.png`). Pasa igual en oscuro y con el rol fabricacion, a 360x740.
- **Arreglo propuesto:** Exportar la bandera (`export const EN_MANTENIMIENTO` en material.js, o moverla a js/datos/prefs.js) y, mientras esté prendida: (a) que `veSemaforo()` en fabricacion.js devuelva `false`, así no salen puntos de color ni la etiqueta «Falta…»; (b) que `pintarExportar` quite del texto la alarma «revisar el material» y el «conteo del almacén», y que el .ics del ritmo no traiga ese evento.
- **Esfuerzo:** S · **Riesgo:** bajo. Al reencender Material todo vuelve solo. Hay que revisar que `pf-fabricacion.mjs` no espere el semáforo con la bandera prendida.

#### fabmat-2 · [MEDIA] En la computadora y en la tableta no hay botón para agendar los «10 ganados sin fecha»
- **Dónde:** css/sistema.css:956 (`.mbar{display:none}`). La barra solo se muestra por debajo de 760 px y `#pf-mbar` hereda esa regla. El botón se arma en js/mod/fabricacion.js:1261 (`pintarMbar`). La tarjeta de la cuenta sale de `pintarCuentas` (fabricacion.js:781).
- **Qué le pasa al usuario:** En el teléfono hay un botón grande, «Agendar (10 sin fecha)». En la computadora de la oficina, y en una tableta de 768 px, ese botón no existe. La tarjeta «10 GANADOS SIN FECHA» no se puede picar y no hay lista de cuáles son. La única forma de agendar es adivinar que hay que dar clic en un día vacío.
- **Cómo lo reproduje:** Con 1366x768, 1024x768 y 768x1024, direccion, entré a `#/agenda`. `#pf-mbar` tiene el texto «Agendar (10 sin fecha)» pero queda en `display:none`. Busqué botones visibles con «agendar», «proponer» o «sin fecha» y solo aparecen las celdas de los días, por su aria-label «Tocar para agendar». La tarjeta es un `<p>` con `cursor:auto`. El clic en un día vacío futuro sí abre la hoja «Agendar el 18 oct 2026» (s4.mjs, s5.mjs; captura `s5-decidir-1366.png`).
- **Arreglo propuesto:** Que la tarjeta «ganados sin fecha» sea un `<button data-abrir-agendar>` en `pintarCuentas`; el `alTocar` del módulo ya sabe abrir la hoja. O, desde 760 px, pintar el mismo botón de `pintarMbar` en la fila de Mes/Semana/Lista. Con fabricacion el texto es «Proponer un día».
- **Esfuerzo:** S · **Riesgo:** bajo.

#### fabmat-3 · [MEDIA] La hoja «Agendar» propone HOY como día de instalación, y un toque lo guarda
- **Dónde:** js/mod/fabricacion.js:1740-1741 (`propuesta = … || hoyISO()`) y :1777 (`<input type="date" id="pf-ag-fecha" value=…>`).
- **Qué le pasa al usuario:** Si se agenda un proyecto que nunca tuvo fecha, el campo ya viene con la fecha de hoy y el botón verde «Agendar» está listo. Un toque distraído deja la instalación para hoy. Como la fecha de la hoja mueve la cita del Calendar del equipo, el error se propaga sin que nadie haya elegido ese día. El código ya tiene el aviso «Falta el día…» (fabricacion.js:1816), pero nunca sale porque el campo nunca está vacío.
- **Cómo lo reproduje:** 390x844, direccion. Toqué «Agendar (10 sin fecha)» y luego el primer proyecto («Relleno 9»). El paso 2 trae «Día de la instalación: 13/10/2026», que es hoy, y el botón «Agendar» activo (captura `s3-hoja2.png`).
- **Arreglo propuesto:** Si no hay día tocado en la rejilla ni una instalación previa, dejar `propuesta = ''` y que el aviso de :1816 haga su trabajo. Opcional: debajo del campo, chips de fecha rápida como los de «Se ganó» (fabricacion.js:2332).
- **Esfuerzo:** S · **Riesgo:** bajo. Revisar si `pf-fabricacion.mjs` (hoja de agendar) espera la fecha prellenada.

#### fabmat-4 · [MEDIA] En tema oscuro, el número de HOY casi no se lee
- **Dónde:** css/plataforma.css:540, `.cal-dia.hoy .cal-n{background:var(--av);color:#fff}`. En oscuro, `--av` es #f5c26b.
- **Qué le pasa al usuario:** El número del día de hoy, que es la referencia para contar cuánto falta, sale en blanco sobre ámbar claro. Se ve una pastilla amarilla sin número.
- **Cómo lo reproduje:** Con 390x844 y con 360x740, en oscuro (direccion y fabricacion), en `#/agenda`. El texto del 13 tiene color rgb(255,255,255) sobre rgb(245,194,107): contraste **1.64:1**. Lo pide 4.5:1. En claro se lee bien. Captura `s3-hoy-oscuro.png`.
- **Arreglo propuesto:** En el bloque de tema oscuro, `html[data-tema="oscuro"] .cal-dia.hoy .cal-n{color:#1d1407}`, o el token de tinta sobre ámbar si existe.
- **Esfuerzo:** S · **Riesgo:** nulo.

#### fabmat-5 · [BAJA] Con el teclado hay que pasar los 31 días del mes uno por uno
- **Dónde:** js/mod/fabricacion.js:949 (cada `.cal-dia` es tabulable) y `alTeclear` (←/→ cambian de MES aunque el foco esté en un día).
- **Qué le pasa al usuario:** En la computadora, para llegar con Tab a la lista del día o a «Bajar» hay que pasar por cada día del mes. Las flechas no se mueven entre días, cambian de mes.
- **Cómo lo reproduje:** 1366x768, ratón y teclado. Desde «Mes anterior», 12 Tabs seguidos fueron mes siguiente, 1 oct, 2 oct… 10 oct. Con el foco en «sáb 10 oct», → cambió a noviembre. El foco visible está bien en todos (contorno de 2 px).
- **Arreglo propuesto:** Usar tabindex itinerante en la rejilla: solo el día abierto o hoy lleva `tabindex=0` y el resto `-1`. Con el foco dentro de la rejilla, ←/→/↑/↓ se mueven por días y RePág/AvPág cambian de mes. Fuera de la rejilla, ←/→ siguen siendo el atajo de mes que anuncia el encabezado («Teclas ← → mes»).
- **Esfuerzo:** M · **Riesgo:** medio. `pf-fabricacion.mjs` defiende el comportamiento actual de ←/→ (F11) y habría que ajustar esa prueba.

#### fabmat-6 · [BAJA] La duración se pide en minutos («240») y el resto de la app habla en horas
- **Dónde:** js/mod/fabricacion.js, paso 2 de la hoja (`input type=number` con la duración sugerida de `Agenda.duracionSugerida`).
- **Qué le pasa al usuario:** El campo dice «Cuánto va a durar, en minutos: 240». En la lista del día la misma cita sale como «4 h». Hay que hacer la cuenta de cabeza.
- **Cómo lo reproduje:** 390x844, en la hoja de Agendar, paso 2 (captura `s3-hoja2.png`). En la lista del día, la fila dice «… · 4 h».
- **Arreglo propuesto:** Usar chips de radio «2 h · 4 h · 6 h · Día completo» con el mismo `grupo` que «Ventana», o un campo en horas con `step=0.5` que se convierta a minutos al guardar.
- **Esfuerzo:** S · **Riesgo:** bajo. El dato guardado sigue en minutos.

#### fabmat-7 · [BAJA] La fecha del día abierto sale con Mayúsculas En Cada Palabra
- **Dónde:** css/plataforma.css:496 y :598-599 (`text-transform:capitalize` en el título del mes y en `.dia-t`).
- **Qué le pasa al usuario:** Se lee «Vie 16 Oct 2026 · En 3 Días». En español se escribe «Vie 16 oct 2026 · en 3 días». Se ve traducido.
- **Cómo lo reproduje:** 390x844, toqué el 16 oct (captura `s2-dia-390x844-claro-direccion.png`).
- **Arreglo propuesto:** Cambiar `text-transform:capitalize` por `.dia-t::first-letter{text-transform:uppercase}`, igual en el título del mes.
- **Esfuerzo:** S · **Riesgo:** nulo.

#### fabmat-8 · [BAJA] Material en mantenimiento es un callejón sin salida
- **Dónde:** js/mod/material.js:208-214, y js/app.js:73 (sigue en el menú lateral, con el subtítulo «en mantenimiento»).
- **Qué le pasa al usuario:** El menú lleva a una tarjeta que dice que la sección está apagada, sin botón para regresar ni decir a dónde ir. En el teléfono queda la pantalla casi vacía.
- **Cómo lo reproduje:** 390x844 y 1366x768, direccion y fabricacion, `#/material` (`material-390x844-claro-direccion.png`).
- **Arreglo propuesto:** Mientras `EN_MANTENIMIENTO` esté prendida, quitar la entrada del menú (`roles: []` en app.js:73) o añadir un botón «Ir al Calendario» en la tarjeta.
- **Esfuerzo:** S · **Riesgo:** nulo.

#### fabmat-9 · [BAJA, al reencender] En el teléfono, cada material repite la lista entera de proyectos con su nombre largo
- **Dónde:** js/mod/material.js, renglón de «Por comprar» (el texto «Para …» de cada material).
- **Qué le pasa al usuario:** En el teléfono, la lista de compra de 9 materiales mide 3,874 px. Cada tarjeta repite «Para La Perla - … (Letras Luz) (en 3 días), Farmacias Guadalajara Sucursal … — anuncio de fachada …» y el material y la cantidad se pierden entre el texto.
- **Cómo lo reproduje:** Forcé `EN_MANTENIMIENTO=false` solo en mi navegador (s6.mjs), con 390x844, claro y 5 proyectos con material (captura `s5-material-390.png`). Ojo: los nombres de mi siembra son largos a propósito.
- **Arreglo propuesto:** Mostrar «Para 5 proyectos · el primero se instala en 3 días» y el desglose dentro de un `<details>`.
- **Esfuerzo:** S · **Riesgo:** bajo.

---

### Lo que está bien
- Ningún `pageerror` ni error de consola en ninguna corrida: 6 tamaños, 2 temas, 2 roles, ida y vuelta entre pantallas, atrás y adelante.
- Sin scroll de lado de 360 a 1366, ni con el teléfono acostado.
- La hoja de Agendar agrega una sola entrada al historial y el «atrás» del navegador la cierra. Ir a Proyectos y regresar (y atrás/adelante) deja el calendario y la barra intactos.
- Al tocar un día, el foco va al título del día y la lista queda a la vista. Ninguna celda queda tapada por la barra ni por el botón «Preguntar» al centrarla.
- Foco visible (contorno de 2 px) en todos los controles del Calendario.
- Con 254 instalaciones el mes se pinta en ~170 ms y la tarea larga máxima fue de 68 ms. La vista Lista con 260 renglones no se congela, aunque mide 56,000 px.
- En tema claro no hubo ningún texto por debajo de 4.5:1.

### Sin reproducir
- **Tamaño de toque de las flechas de mes y de Mes/Semana/Lista (34 px).** Mi emulación (hasTouch + isMobile) no activa `pointer:coarse`. El CSS ya sube `.cal-nav` a 44 px con `(pointer:coarse)` (plataforma.css:509) y en el teléfono acostado «Mes» midió 44x44. No sé si en un teléfono real Mes/Semana/Lista quedan en 34 px: hay que medirlo en el aparato.
- **Arrastre con el dedo para cambiar de mes y la ficha de los chips de «Ventana».** No los probé con dedo real (CDP). El código ignora el ratón en los dos (fabricacion.js:487 y :2201), así que el patrón de «draggable que se come el clic con 4 px de temblor» no aplica aquí.
- **Envío a Google Calendar («Al calendario del teléfono», «Crear en Calendar»).** No lo probé: no hay token ni red.
- **Material encendido a fondo (recibir, conteos, deshacer).** La pantalla está apagada en main; solo hice la pasada de fabmat-9.


## Grupo: Control, Mapa y herramientas

## Hallazgos · grupo `control`

**Pantallas:** Control (`#/control`), Mapa (`#/mapa`), Mesa de corte (`#/anidador`), Vectorizador (`#/vectorizar`, solo el marco: el contenido ya se auditó en `docs/REVISION-UIUX-2026-10-PARCIAL.md` apoyo-2/3) y el bloque «Datos para la entrega» (js/mod/datos-entrega.js, abierto desde «Se ganó» de Proyectos).
**Probado:** rol direccion. Tamaños 360×740, 360×640, 390×844, 768×1024, 844×390 (teléfono acostado), 1366×768 y 1920×768. Tema claro y oscuro. Con táctil por debajo de 760 px y ratón por encima. Datos sembrados como en `pf-control.mjs` (13 ventas de la hoja, 3 por cobrar, 9 comisiones) y `pf-mapa.mjs` (5 obras, 3 con pin y 2 sin ubicar). Prueba de carga con 313 ventas.
**Scripts y capturas:** `scratchpad/pw/ctl/r1…r13.mjs`; capturas en esta carpeta.
No hubo `pageerror` en ninguna corrida. Los únicos errores de consola son las teselas de OpenStreetMap, que bloqueé a propósito.

---

#### control-1 · [ALTA] En computadora, el Mapa esconde los filtros «Hoy / 15 días / Todo» y medio chip «Instalado»
**Dónde:** css/plataforma.css:807-809 (`.mapa-chips{overflow-x:auto;scrollbar-width:none}` y `::-webkit-scrollbar{display:none}`). Lo pinta js/mod/mapa.js (~600-620: `data-g` y `data-rango`).
**Qué le pasa al usuario:** En la compu, la fila de filtros se corta en el chip «Instalado» y los chips del rango de fechas nunca se ven. No hay barra ni flecha, y la rueda del ratón no la mueve, así que con ratón no hay forma de cambiar el rango.
**Cómo lo reproduje:** 1366×768 y 1920×768, ratón, `#/mapa` con 5 obras. La caja visible termina en x=637. «Instalado» va de 588 a 717: su centro cae sobre el mapa (`elementFromPoint` da `leaflet-container`). «Hoy» [734-789], «15 días» [795-868] y «Todo» [874-936] quedan enteros FUERA. Después de `mouse.wheel(0,300)` sobre la fila, `scrollLeft` sigue en 0. Captura: `mapa-1366.png`.
**Arreglo propuesto:** En el panel lateral de escritorio (`@media (min-width:760px)`), que `.mapa-chips` haga `flex-wrap:wrap; overflow:visible`. Hay espacio vertical de sobra. El deslizado de lado se queda solo para el teléfono. Otra opción: un oyente `wheel` que traduzca deltaY a scrollLeft, más un degradado en el borde que avise que hay más.
**Esfuerzo:** S · **Riesgo:** bajo. Revisar que la fila de dos renglones no empuje la hoja (`--mapa-top` se mide).

#### control-2 · [MEDIA] En el Mapa con ratón, un clic con un temblor de 3 px sobre un pin no abre su ficha
**Dónde:** js/mod/mapa.js:763 (`L.map(div, {...})` sin tolerancia) y :1098 (`m.on('click', …)`).
**Qué le pasa al usuario:** En la compu, hacer clic en un pin a veces no hace nada. Leaflet trata cualquier movimiento de 3 px o más entre apretar y soltar como un arrastre del mapa y se come el clic. Es el mismo patrón que ya se había encontrado con `draggable`.
**Cómo lo reproduje:** 1366×768, ratón, mismo pin. Temblor de 0 px y de 2 px: abre la ficha. De 3, 4 y 6 px: no abre nada (`[data-cerrar-ficha]` = 0). En el teléfono, con tap, sí abre.
**Arreglo propuesto:** Antes de crear el mapa, `L.Draggable.prototype.options.clickTolerance = 8;`. Otra forma: abrir la ficha también en `m.on('mouseup')` cuando el desplazamiento fue menor de 8 px.
**Esfuerzo:** S · **Riesgo:** bajo. Arrastrar el mapa empezaría 5 px después.

#### control-3 · [MEDIA] En Control, las pestañas Ventas / Por cobrar / Comisiones quedan a más de una pantalla de distancia
**Dónde:** js/mod/control.js:562 (la tarjeta «Vendido por tipo de trabajo» se pinta antes que las pestañas) y :496-504 (las pestañas).
**Qué le pasa al usuario:** Para cobrar o pagar comisiones, que es el trabajo diario, Elías tiene que desplazarse por encima de una gráfica y de 9 tarjetas de tipo. Con la hoja sin tipos capturados, 8 de esas tarjetas dicen «0 trabajos · $0.00». Las pestañas no se quedan pegadas arriba.
**Cómo lo reproduje:** La primera pestaña está en y=1040 a 390×844 y en y=1027 a 1366×768, con `position:static`. En la compu, la primera pantalla entera es la tarjeta de tipos (`control-1366.png`). En el teléfono son 1.2 pantallas (`control-full-390.png`).
**Arreglo propuesto:** Mover las pestañas y sus cuentas arriba y dejar «Vendido por tipo» como la última tarjeta, o plegarla con `<details>` cerrado por omisión en el teléfono. Además, ocultar las tarjetas de tipo que están en 0 en ambos periodos y juntarlas en un renglón «Sin ventas: Caja de luz sin iluminación, Rotulación…».
**Esfuerzo:** M · **Riesgo:** bajo. Hay que ajustar `pf-control.mjs` (P27 mide que las barras crezcan al verse).

#### control-4 · [MEDIA] «Datos para la entrega»: Escape (o cerrar) tira lo que ya se escribió, sin preguntar
**Dónde:** js/mod/proyectos.js:1031-1049 (`ganar()` rehace el `innerHTML` de `pf-pide` cada vez). Pasa lo mismo en los otros tres que usan `DE.html` (fabricacion.js:2311, inicio.js:916, tablero.js:854).
**Qué le pasa al usuario:** Escribe el teléfono y la dirección y luego le da Escape, toca fuera o «Cancelar» sin querer. El panel se cierra sin avisar y, al volver a «Se ganó», todo está vacío otra vez.
**Cómo lo reproduje:** 390×844, 360×640 y 1366×768. Abrí «Se ganó» de COT-7101, escribí «33 12» en el teléfono y elegí Paquetería. Al presionar Escape, `#pf-pide.show` pasó a false. Al reabrir, `ganar()` vuelve a pintar el bloque con los datos de la cotización.
**Arreglo propuesto:** Al cerrar, si `DE.leer(capa)` trae algo distinto de lo inicial, pedir confirmación con «Descartar lo escrito / Seguir llenando». También se puede guardar un borrador por folio en memoria (`_borradorDE[folio]`) y pasarlo a `DE.html()` al reabrir.
**Esfuerzo:** S/M · **Riesgo:** bajo.

#### control-5 · [MEDIA] En el teléfono acostado, el Mapa deja una franja de 250 px y el «Preguntar» flota encima
**Dónde:** css/plataforma.css (disposición del mapa en ≥760 px). La altura no cuenta con este caso.
**Qué le pasa al usuario:** Con el teléfono de lado entra el diseño de escritorio. El mapa queda en una franja corta, la hoja de abajo asoma solo 49 px y el botón «Preguntar» queda al lado de los filtros, tapando parte del mapa.
**Cómo lo reproduje:** 844×390 táctil, `#/mapa`. El lienzo empieza en top=89 y la hoja en top=341, así que se ve el mapa de 89 a 341. La hoja se sale de la ventana (418 px de alto en una ventana de 390). Captura: `mapa-acostado.png`.
**Arreglo propuesto:** Usar `@media (min-width:760px) and (min-height:520px)` para el diseño de escritorio del mapa. Con menos alto, usar el diseño del teléfono o el panel lateral a la izquierda (como a 1366), sin hoja inferior. Cuando la altura sea menor de 500 px, bajar `#pf-ia-btn` a la esquina inferior.
**Esfuerzo:** M · **Riesgo:** medio. `pf-mapa.mjs` mide las paradas de la hoja.

#### control-6 · [BAJA] Las barras de la gráfica mensual de Control miden 36 px de ancho en el teléfono, y el botón del asistente tapa la de octubre
**Dónde:** js/mod/control.js (barras de «Por mes», cada una es un `button`). El botón flotante es `#pf-ia-btn`.
**Qué le pasa al usuario:** Las barras son botones que abren el detalle del mes, pero son angostas. La del mes actual, que es la que más interesa, queda debajo del botón morado del asistente.
**Cómo lo reproduje:** A 360 y 390 px, 10 barras de 36×204 px (el mínimo es 44 de ancho). Con Tab, el foco de las barras de jul y oct cae en una zona donde `elementFromPoint` devuelve `pf-ia-btn` (y=526, alto 204). En la captura `control-390.png` el botón tapa la parte baja de la barra de oct.
**Arreglo propuesto:** Ampliar el área de toque de cada barra a toda su columna con `::before` (inset negativo hasta 44 px, usando el `gap`). Dejar un `padding-right` de 72 px a la gráfica en el teléfono, o que `.mapa-ia-sube` haga lo mismo aquí y suba el botón mientras la gráfica está a la vista.
**Esfuerzo:** S · **Riesgo:** bajo.

#### control-7 · [BAJA] Los campos con error de «Datos para la entrega» no se anuncian como inválidos
**Dónde:** js/mod/datos-entrega.js:~185-245 (`marcar()` muestra el mensaje pero no pone `aria-invalid`).
**Qué le pasa al usuario:** El mensaje se ve bien, junto al campo y con el foco ahí. Pero un lector de pantalla no anuncia el campo como erróneo y el campo no cambia de borde por estado.
**Cómo lo reproduje:** «Guardar el proyecto» con todo vacío. Salen «Falta el teléfono del cliente.» y «Falta la dirección y el link de Maps…» y el foco va a `#pf-de-tel`, pero `aria-invalid` queda en null en `pf-de-tel`, `pf-de-dir` y `pf-de-maps`. Igual en claro, oscuro, 360, 390 y 1366.
**Arreglo propuesto:** En `marcar()`, `campo.setAttribute('aria-invalid','true')` al mostrar el mensaje y `removeAttribute` al ocultarlo. En CSS, `[aria-invalid=true]{border-color:var(--rojo)}`.
**Esfuerzo:** S · **Riesgo:** nulo.

#### control-8 · [BAJA] El ejemplo del teléfono («33 1234 5678») parece un número ya capturado
**Dónde:** js/mod/datos-entrega.js:65 (`placeholder="33 1234 5678"`).
**Qué le pasa al usuario:** En tema oscuro, el campo vacío muestra un número completo con un gris claro. Arriba sale el error «Falta el teléfono del cliente» y parece que ya estaba puesto.
**Cómo lo reproduje:** 360×640, oscuro. El placeholder es rgb(167,172,214) y el texto real rgb(236,238,251), sobre rgb(26,29,56). Captura: `de-err-360-oscuro.png`.
**Arreglo propuesto:** Usar `placeholder="10 dígitos"` o quitar el número de ejemplo y ponerlo en la pista de abajo.
**Esfuerzo:** S · **Riesgo:** nulo.

#### control-9 · [BAJA] En «Vendido por tipo», el «(0)» al final de la comparación no se entiende
**Dónde:** js/mod/control.js:583 (`' (' + antes + ')'`).
**Qué le pasa al usuario:** Lee «▲ 11 más que en 2025 al 13 oct (0)» y no sabe qué es el 0. Es lo que se vendió el año anterior.
**Cómo lo reproduje:** 390 y 1366, «Este año», en todas las tarjetas (`control-1366.png`).
**Arreglo propuesto:** Cambiarlo por `' · en ' + etiqueta + ': ' + antes`, o por «▲ 11 más que el año pasado a esta fecha (0 entonces)».
**Esfuerzo:** S · **Riesgo:** nulo. Revisar el texto que esperan las pruebas.

#### control-10 · [BAJA] «Monto disponible» de Comisiones lee «1500.5.2» como $1,500.52 sin avisar
**Dónde:** js/datos/ventas.js:436 (`montoDeTexto`).
**Qué le pasa al usuario:** Si teclea un punto de más, la pantalla calcula con otro monto y no dice que lo que escribió no es un número. Con «1.500», pensando en el punto como separador de miles, calcula $1.50.
**Cómo lo reproduje:** En la página: `montoDeTexto('1500.5.2')` da 1500.52 y `montoDeTexto('1.500')` da 1.5. El flujo normal sí funciona: «1500» se formatea a $1,500.00, arma 2 comisiones por $810 y al cambiar el monto la lista se descarta.
**Arreglo propuesto:** Si hay más de un punto, o un punto seguido de exactamente 3 dígitos sin coma, devolver NaN y que la frase diga «Ese monto no se entiende». No adivinar.
**Esfuerzo:** S · **Riesgo:** bajo. Tiene prueba unitaria propia.

#### control-11 · [BAJA] Las pestañas de Control no viven en el enlace: «Atrás» sale de Control
**Dónde:** js/mod/control.js:137 (la pestaña solo llega por `pase`) y :1248.
**Qué le pasa al usuario:** Está en «Por cobrar», da Atrás en el teléfono esperando volver a «Ventas» y regresa a la pantalla anterior. Tampoco puede mandar un enlace directo a «Comisiones».
**Cómo lo reproduje:** 390×844. Pasé de `#/hoy` a `#/control`, toqué «Comisiones» y luego «Por cobrar»: la URL sigue en `#/control`. Con `goBack()` llegué a `#/hoy`.
**Arreglo propuesto:** `history.replaceState` con `#/control?tab=cobrar` (sin agregar una entrada) y leerlo al montar. Así se arregla el enlace directo y la recarga. Para el Atrás, decidir con Elías si cada pestaña debe sumar una entrada al historial.
**Esfuerzo:** S · **Riesgo:** bajo. Ver la nota de app.js:229 sobre `#/control` escrito a mano.

---

### Lo que está bien
- Control con 313 ventas: monta en ~560 ms y el buscador responde en 14-17 ms por tecla sin perder el foco.
- «Pagar estas» arma la lista, pasa el foco a «Copiar la lista», copia bien y la lista se cae al cambiar el monto. No escribe nada.
- Sin desborde horizontal en ninguna pantalla del grupo, de 360 a 1920. Sin `pageerror`.
- En el teléfono, el Mapa abre la ficha al tocar el pin, el asa de la hoja sube con un toque, la pantalla sobrevive a ir a Control y regresar con Atrás, y nada queda tapado por la barra inferior.
- «Datos para la entrega» pone los errores junto a cada campo, lleva el foco al primero y explica el teléfono corto («no tiene los 10 dígitos»).
- La Mesa de corte acomoda el ejemplo sin errores a 390 y 1366.

### Sin reproducir
- **Mesa de corte, clic con temblor sobre una pieza** (anidador-vectores/js/app.js:1700: el umbral del ratón es 4 px y luego levanta la pieza). Lo intenté con 5 px, pero el cálculo seguía corriendo y las piezas no eran editables, así que no se movió nada. Habría que repetirlo con el acomodo terminado. Si se confirma, sería el mismo patrón de clic perdido.
- **«Instala hace 5 días» en una obra ya instalada** (mapa.js:1191). Salió porque mi siembra agendó la fecha después de pasar la obra a «instalado» y la cita quedó viva. No sé si el flujo real cierra la cita al marcar instalado, así que no lo reporto.
- **«Se ganó» invisible en Proyectos** (`[data-gano]` existe pero no se ve a 390 ni a 1366 con 3 cotizaciones autorizadas). Es del grupo de Proyectos y no lo investigué. Lo abrí con `click()` desde JS.
- **El ejemplo AL3D de la Mesa de corte** parece salirse un poco de la hoja blanca y la cota de 400 mm cruza la «D» (`anid-ej-1366.png`). No lo medí.


## Grupo: Marco: menú, navegación, Ajustes, cotizador empotrado

## Hallazgos · grupo `marco` (lo transversal de la plataforma)

**Pantallas:** marco general (menú lateral, barra de abajo y hoja «Más», cabecera, rutas, atrás/adelante, enlaces directos, cambio de rol), modales/hojas de `ui.js` (buscador, «Más», «Tu cuenta»), asistente, `#/ajustes`, `#/atender`, `#/publicaciones` (solo el marco, no el interior), `#/cotizador` empotrado (iframe, alto, scroll doble, conservar captura), glifo de sincronización y estado sin señal.

**Probado:** 360×740, 390×844, 667×375 y 844×390 (teléfono acostado), 768×1024, 1024×768, 1024×600, 1366×768, 1920×1080. Rol `direccion` en todo; `pagos` para cambio de rol y enlace a ruta no permitida. Tema claro y oscuro (1366). Tacto en teléfono, ratón+teclado en escritorio. Datos sembrados en IndexedDB: 20, 30 y 300 proyectos. Puente de mentiras (script.google.com interceptado) para el glifo de sincronización y la caída de señal (`ctx.setOffline`). Service worker bloqueado (como pide el brief). Scripts: `scratchpad/pw/marco*.mjs`; capturas: `aud/marco/cap/`.

---

#### marco-1 · [ALTA] Con el teléfono acostado, el botón «Continuar a partidas» del cotizador queda debajo de la barra de módulos o fuera de la pantalla
**Dónde:** js/mod/cotizador.js:417 (`Math.max(360, …)` en `medirMarco`), css/plataforma.css:1712 (`.pf-marco{height:var(--pf-marco-h)}`).
**Qué le pasa al usuario:** con el teléfono en horizontal (para ver mejor una tabla o porque se giró), el cotizador muestra solo una franja de ~55 px de formulario y el botón para avanzar no se puede tocar: queda tapado por la barra de Tablero/Calendario/… o por debajo del borde. Hay que desplazar «la página de afuera», algo que nadie sabe que existe.
**Cómo lo reproduje:** rol dirección, `#/cotizador`. A 667×375: el marco mide 360 px desde y=72 y acaba en y=432 (57 px fuera del visor). Desplazando la página al fondo (scrollY=57), el centro de «Continuar a partidas» cae en y=333 y `elementFromPoint` devuelve la píldora de `#pf-abajo` (barra de abajo). A 844×390: marco de 88 a 448 (58 px cortados); sin desplazar la página de afuera, el botón está fuera de la pantalla; la rueda sobre el marco solo mueve el interior (página scrollY sigue en 0). Capturas `land-667-cotizador.png`, `land-667-cot-scroll.png`, `844x390-cotizador.png`. Publicaciones tiene el mismo piso: 17–18 px cortados a 667×375 y 844×390.
**Arreglo propuesto:** en `medirMarco` (cotizador.js:417) y su gemelo en herramientas.js:~174, bajar el piso a lo que de verdad cabe: `const util = alto - arriba - (abajo || insetInferior()+8); const h = Math.round(teclado ? Math.max(360, util) : util);` donde `teclado` = `vv && vv.height < window.innerHeight * 0.75` (el piso solo tiene sentido con teclado abierto, que es para lo que se puso). Además, en apaisado de teléfono (`(max-height:480px) and (orientation:landscape)`), ocultar la barra de abajo o reducirla a íconos de 44 px para recuperar ~70 px.
**Esfuerzo:** S. **Riesgo:** bajo; volver a correr la prueba del Fold cerrado que motivó el comentario de la línea 407 y un caso con teclado abierto.

#### marco-2 · [MEDIA] Al perder la señal, el glifo sigue diciendo «al día» hasta 30 segundos
**Dónde:** js/app.js:1837 (solo hay oyente de `online`, no de `offline`); js/app.js:1844 (vuelta cada 30 s).
**Qué le pasa al usuario:** en una azotea se va la señal y la cabecera sigue con la nube normal («Sincronización: al día») medio minuto; quien le contesta a un cliente en ese rato cree que lo que ve está al día.
**Cómo lo reproduje:** 390×844, puente configurado, en línea → «Sincronización: al día». `ctx.setOffline(true)` (navigator.onLine=false): a 1, 5, 10 y 20 s sigue «al día»; a los 31 s cambia a «Sin señal: lo que hagas se guarda aquí…».
**Arreglo propuesto:** junto a la línea 1837: `window.addEventListener('offline', () => { if (Sync.configurado()) pintarSync('sin-senal'); });`.
**Esfuerzo:** S. **Riesgo:** nulo.

#### marco-3 · [MEDIA] En el teléfono, el glifo de sincronización no se puede leer: «sin señal» o «falló» solo viven en el `title`
**Dónde:** js/app.js:1999 `pintarSync` (el `<span class="pf-sync" role="img">` con `title`/`aria-label`), comentario de 1950–1962.
**Qué le pasa al usuario:** en el teléfono aparece una nubecita tachada de 20 px gris claro sobre la cabecera oscura y no hay forma de saber qué quiere decir; si la vuelta falla, el motivo de la cruz solo está en un `title`, que con el dedo no se ve nunca.
**Cómo lo reproduje:** 390×844, puente configurado, sin señal 32 s → glifo «sin señal». Es `SPAN role=img tabindex=-1`, color `rgba(255,255,255,.72)`. Tocarlo: no sale nada (ningún globo, aviso ni `role=status` nuevo). Captura `sinsenal-390.png`.
**Arreglo propuesto:** hacer del glifo un `<button type="button" class="pf-sync" aria-label="…">` de 44×44 (el dibujo sigue de 20 px) que al tocar haga `toast(fraseDeSync(...), estado==='mal'?'error':'info', 4000)`; en estado `mal` además enlazar a Ajustes › Puente.
**Esfuerzo:** S. **Riesgo:** bajo (revisar que no rompa la regla de «nada se anuncia por voz» salvo `mal`: el toast va solo al tocar).

#### marco-4 · [MEDIA] Los números 1–9 cambian de pantalla aunque el foco esté en un botón
**Dónde:** js/app.js:1724–1741 (atajo de una sola tecla, guarda solo para campos de texto).
**Qué le pasa al usuario:** alguien que navega con teclado, o un lector de pantalla/dictado que «teclea» un número sobre un botón, salta de pantalla sin querer. Ej.: en Ajustes, con el foco en el selector de rol, pulsar «2» manda al Calendario.
**Cómo lo reproduje:** 1366×768, ratón+teclado, `#/ajustes`, foco en el botón «Fabricación», tecla `2` → hash `#/agenda`. Tecla `3` con foco en el body → `#/proyectos`. (Dentro de campos de texto, buscador, asistente y el buscador de Publicaciones no pasa: bien.)
**Arreglo propuesto:** exigir que el foco esté en el body o en el menú: `if (t && t !== document.body && !t.closest('#pf-nav,#pf-abajo')) return;` y dejar una casilla en Ajustes › Este dispositivo «Atajos de una tecla» (WCAG 2.1.4 pide poder apagarlos o limitarlos al foco).
**Esfuerzo:** S. **Riesgo:** bajo; quien use el atajo desde el body sigue igual.

#### marco-5 · [MEDIA] «Qué atender» con muchos avisos: una tira de 37 000 px que repite el mismo párrafo en cada renglón
**Dónde:** js/datos/reglas.js:359 (el `detalle` fijo de «sin fecha»), pintado por js/mod/inicio.js.
**Qué le pasa al usuario:** cada proyecto sin fecha trae la misma explicación de dos renglones («Sin fecha no hay alarmas en el teléfono…»); con un par de cientos, en el teléfono cada aviso mide ~185 px y la lista no se acaba nunca; lo urgente distinto (material, cobros) queda enterrado.
**Cómo lo reproduje:** 390×844, 300 proyectos sembrados → «Qué atender 201», alto del documento 37 622 px; con 30 proyectos a 1366×768 se ven 7 renglones idénticos salvo el nombre. Captura `atender-300-390.png`, `1366x768-atender.png`. (Rendimiento OK: tarea larga máx. 103 ms.)
**Arreglo propuesto:** agrupar los avisos del mismo tipo: un encabezado «Ganados sin fecha · 200» con la explicación UNA vez, los 5 más viejos visibles y «Ver los 195 restantes» (o enlace a Calendario filtrado). En inicio.js, agrupar por `regla.id` antes de pintar.
**Esfuerzo:** M. **Riesgo:** bajo.

#### marco-6 · [BAJA] «Ganados sin fecha» de arriba no cuadra con la lista de abajo
**Dónde:** js/mod/inicio.js:223 (`d.sinFecha.length` en la cinta) frente a las reglas de reglas.js que filtran la lista.
**Qué le pasa al usuario:** la ficha dice 30 (o 300) y la lista «Qué atender» trae menos; Elías no sabe cuál creer.
**Cómo lo reproduje:** 1366×768, 30 proyectos sin fecha en etapas variadas → ficha «30 Ganados sin fecha», lista «Qué atender 21» (20 sin fecha + 1 material). Con 300: ficha 300, lista 201. La diferencia son los que están en etapa instalado/garantía sin fecha: la ficha los cuenta, la lista no. (Que exista un instalado sin fecha es plausible en proyectos importados de la hoja.)
**Arreglo propuesto:** que la ficha use el mismo filtro de la regla (excluir instalado/garantía) o que diga «sin fecha (todas las etapas)». Un solo origen: exponer el conteo desde reglas.js y leerlo en inicio.js:223.
**Esfuerzo:** S. **Riesgo:** bajo.

#### marco-7 · [BAJA] El globo del menú lateral tapa la pestaña de arriba al pasar el ratón
**Dónde:** js/app.js:843–846 (`data-nombre`/`data-tecla`, globo de la pieza P31) y su CSS en css/plataforma.css.
**Qué le pasa al usuario:** al acercar el ratón a «Proyectos», sale un globo «Proyectos 3» encima de «Calendario»; repite el nombre que ya se lee (el menú está expandido) y esconde la opción vecina justo cuando se está apuntando.
**Cómo lo reproduje:** 1366×768, ratón sobre `#pf-nav [data-ruta=proyectos]` → globo sobre la fila de Calendario (captura `globo.png`; también sale tras hacer clic, ver `offline-1366.png`, `offline-cot.png`). El «3» no dice que es una tecla.
**Arreglo propuesto:** con el menú expandido (≥1024 px, nombres visibles) mostrar solo la tecla, a la DERECHA dentro de la misma fila (`.pf-tab::after{content:attr(data-tecla)}` en un `kbd` gris), y reservar el globo para el menú colapsado; o desplazarlo a la derecha del menú, no encima.
**Esfuerzo:** S. **Riesgo:** nulo.

#### marco-8 · [BAJA] El menú son botones, no enlaces: Ctrl+clic o clic central no abre otra pestaña y no se puede copiar el enlace
**Dónde:** js/app.js:840–850 (`<button type="button" class="pf-tab" data-ruta=…>`), también la barra de abajo (863) y la hoja «Más» (916).
**Qué le pasa al usuario:** en la computadora no puede abrir Proyectos en otra pestaña para comparar con el Calendario, ni copiar «el link del Mapa» para mandarlo; Ctrl+clic navega en la misma pestaña.
**Cómo lo reproduje:** 1366×768, Ctrl+clic en «Proyectos» del menú → no se abre pestaña nueva (2,5 s esperando evento `page`), y la pestaña actual cambia a `#/proyectos`.
**Arreglo propuesto:** pintar `<a class="pf-tab" href="#/<ruta>" data-ruta=…>`; en el oyente (app.js:1662) hacer `if (ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.button===1) return;` antes de `ir()`. Los estilos `.pf-tab` ya no dependen de que sea botón.
**Esfuerzo:** S. **Riesgo:** bajo (revisar `aria-current` y el estilo de foco en `<a>`).

#### marco-9 · [BAJA] Sin señal y sin la copia guardada, la pantalla que no carga culpa a «una actualización a medias» y ofrece Recargar
**Dónde:** js/app.js:718 (`No se pudo cargar «…» · Puede ser que la app se haya actualizado a medias. Recargar la deja completa.`).
**Qué le pasa al usuario:** si abre el Cotizador por primera vez sin señal, le dice que la app se actualizó mal y le pide recargar; recargar sin señal lo deja peor (página en blanco del navegador).
**Cómo lo reproduje:** 1366×768 (service worker bloqueado, como en la primera visita antes de que se guarde la copia), `ctx.setOffline(true)`, clic en «Cotizador» → la tarjeta de arriba (captura `offline-cot.png`), con `navigator.onLine === false`.
**Arreglo propuesto:** en app.js:718, si `navigator.onLine === false`: «Esta pantalla todavía no está guardada en este aparato y no hay señal. Vuelve a intentar cuando haya.» con botón «Reintentar» que llame `montar(ruta,{forzar:true})` y se active solo con el evento `online`.
**Esfuerzo:** S. **Riesgo:** nulo.

#### marco-10 · [BAJA] El botón «Preguntar» del asistente se para encima de los botones de la lista
**Dónde:** `#pf-ia-btn` (fijo abajo a la derecha), css/plataforma.css.
**Qué le pasa al usuario:** en «Qué atender» a 1366×768, el «Poner fecha» del séptimo renglón queda debajo del botón flotante y el clic se va al asistente; en Ajustes a 360 px el botón tapa el final del texto «…puede cambiarlo».
**Cómo lo reproduje:** 1366×768 `#/atender` con 30 proyectos: `elementFromPoint` en el centro de «Poner fecha» devuelve `pf-ia-btn` (captura `1366x768-atender.png`). 360×740 `#/ajustes`: captura `360x740-ajustes.png`. Al final del scroll ya no tapa (hay relleno), así que es un estorbo de paso, no un bloqueo.
**Arreglo propuesto:** en escritorio, que la columna de acciones de las listas deje `padding-right` del ancho del botón (≈140 px) o que el botón se haga solo ícono (48 px) cuando la ventana tenga <1440 px; en teléfono, ocultarlo mientras se desplaza hacia abajo y mostrarlo al subir.
**Esfuerzo:** S. **Riesgo:** bajo.

---

### Lo que está bien
- Sin `pageerror` en ninguna ruta, tamaño ni rol (el único `console.error` es el recurso externo bloqueado por la prueba). Sin scroll horizontal en los 7 tamaños probados.
- El cotizador empotrado conserva lo capturado y su posición de scroll al ir a Proyectos y volver con Atrás (mismo iframe, scrollY 156→156), y también tras cambiar de rol en Ajustes.
- Atrás/adelante del navegador recorren las rutas bien; un enlace a una ruta que el rol no tiene (`pagos` → `#/publicaciones`) cae al Tablero y reescribe el hash sin doble montaje.
- Hojas/modales: «Más» y el buscador enfocan al abrir, el Tab queda atrapado dentro, Esc cierra y el foco regresa al botón que los abrió; el menú «Tu cuenta» igual. El asistente abre con foco en el campo, Esc devuelve el foco a «Preguntar», y avisa qué datos viajan a la IA antes de enviar.
- Teclear números dentro de campos (nombre, buscador, asistente, Publicaciones) no dispara los atajos.
- 300 proyectos: Tablero, Qué atender y Ajustes montan con tareas largas ≤111 ms; el buscador filtra al teclear sin trabarse.
- Importar un archivo que no es respaldo da un mensaje claro («Ese archivo no se pudo leer. ¿Es el respaldo de la plataforma?» / «…El del cotizador se restaura desde el cotizador.»).
- Foco visible en el menú (contorno 2 px azul).

### Sin reproducir
- **Escritura en sombra/cola sin señal y reenvío al volver:** solo verifiqué el glifo; no armé una escritura real hacia la hoja para ver si se reenvía al volver la señal (el puente de mentiras no guarda estado).
- **Contraste en oscuro del marco:** el escaneo automático en 1366 oscuro no encontró textos <4,5:1 en menú, cabecera, Qué atender ni Ajustes, pero el cálculo sobre vidrio translúcido es aproximado; no hay hallazgo.
- **Copia del service worker sin señal:** con el SW bloqueado no se puede probar la experiencia real sin señal de una app ya instalada (cotizador/publicaciones desde caché).
- **Patrón `draggable` en `pointerdown`:** no aparece en app.js, ui.js, asistente.js, ajustes.js, inicio.js ni cotizador.js de la plataforma; no hay hallazgo en este grupo.
