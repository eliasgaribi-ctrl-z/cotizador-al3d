# Revisión UI/UX del cotizador — resumen PARCIAL (octubre 2026)

> **Esto es un corte parcial, no el reporte final.** La corrida se detuvo antes de la síntesis: no hay fusión de duplicados entre lentes ni tandas. Cada hallazgo de abajo ya pasó por un verificador independiente que lo reprodujo en el render (salvo la sección «Sin verificar»). Se genera leyendo el diario de la corrida; la síntesis completa se puede retomar después.

Método: skill ui-ux-pro-max 2.13.0, 10 lentes (una por categoría del skill), Chromium con Playwright en claro/oscuro, 320–1920 px, táctil y teclado. El movimiento NO se revisó: ya se auditó el 2026-09-26 (PR #75).

## Conteo

- Hallazgos reportados por las lentes: **96**
- Confirmados: **5** · Parciales (reales pero exagerados o mal ubicados): **91** · Refutados: **0** · No verificables: **0** · Aún sin verificar: **0**
- Vigentes (confirmados + parciales) por severidad final: críticos **0**, altos **2**, medios **27**, bajos **67**

## Índice rápido

| ID | Sev. | Esf. | Qué |
|---|---|---|---|
| `layout-1` | alta | S | En horizontal, en tableta y con zoom 200 % las cabeceras pegadas tapan la pantalla y el formulario queda inalcanzable |
| `rendimiento-1` | alta | S | Abrir el Historial se congela segundos con decenas o cientos de cotizaciones, y crece con el uso |
| `a11y-1` | media | S | Los campos de texto y el interruptor apagado casi no se ven: contorno a 1,3:1 |
| `a11y-2` | media | M | Al tabular hacia atrás, o con zoom 200 %, el campo enfocado queda escondido bajo el encabezado pegajoso de la partida |
| `a11y-3` | media | S | En laptops de 630 a 768 px de alto, «Autorizar yo mismo» y «Solicitar autorización» reciben el foco fuera de la pantalla |
| `apoyo-1` | media | M | Historial: en teléfono chico o acostado la lista casi desaparece |
| `apoyo-2` | media | M | Vectorizador en teléfono: el botón «Vectorizar» queda enterrado y casi no hay panel visible |
| `apoyo-3` | media | M | Escalador y Vectorizador en teléfono: poco lienzo y un pie fijo que se come el panel |
| `cliente-1` | media | M | Con plano y 5 o más partidas, la hoja 1 queda casi vacía y los totales se van a la hoja 2 |
| `cliente-2` | media | S | El PDF no trae ni un enlace: el cliente no puede tocar el WhatsApp, el mapa ni la verificación |
| `cliente-4` | media | M | Casi toda la letra del papel está entre 5 y 8 pt |
| `cliente-7` | media | S | La excepción de $60,000 del anticipo está sin explicar y se contradice con el total que ve el cliente |
| `flujo-1` | media | S | El primer clic en el botón de Autorizar/Solicitar se pierde si acabas de teclear en un campo numérico de la partida |
| `flujo-2` | media | S | En Partidas el botón principal del dock está apagado en silencio: al tocarlo no pasa nada ni dice por qué |
| `flujo-3` | media | M | Con la solicitud en espera, «Editar» cancela todo con un toque sin avisar, el estado de espera casi no se ve y no hay forma de cotizar a otro cliente |
| `flujo-5` | media | M | La barra superior pegajosa crece de 58 a 109 px visibles cuando aparece la isla de estado, y a 360 px ya nace así |
| `flujo-8` | media | S | La barra superior en teléfono pesa lo que no importa: selector de rol que casi nadie puede usar, iconos sin texto y el único color es el de salir |
| `formularios-1` | media | S | Tocar una partida en el aviso «Hay partidas sin terminar» no lleva a ella en el teléfono |
| `formularios-3` | media | M | En teléfonos de 390 a 412 px la isla de estado parte la barra de arriba en 3 renglones y todo baja 51 px; la frase de «sin señal» solo la oye el lector de pantalla |
| `layout-2` | media | S | El resumen con los botones de autorización es más alto que una laptop y los botones se hunden bajo el borde |
| `layout-3` | media | S | El teléfono del cliente se corta en iPhone (386–429 px) y el nombre también a 390 |
| `layout-4` | media | M | En teléfonos de 360–375 px la barra pegada de arriba crece de 58 a 109 px |
| `layout-5` | media | M | Los modales Clientes e Historial se quedan sin lista en horizontal, y la IA esconde su botón principal |
| `layout-9` | media | S | Al autorizar, la barra de arriba salta 51 px durante 2–3 segundos a 390–414 px |
| `rendimiento-3` | media | M | El código viaja con todos sus comentarios: 790 KB gzip que serían unos 313 KB, y lo mismo se descarga en cada actualización de la app |
| `tactil-1` | media | S | Hacer scroll con el pulgar sobre una etiqueta de medida cambia la cifra y el precio en silencio |
| `tema-3` | media | M | Campos, botones secundarios e interruptores apagados se delimitan a ~1,3:1, y la app ignora «aumentar contraste» y «reducir transparencia» |
| `tipocolor-1` | media | S | En teléfono y tableta, lo que más se toca queda con letra más chica que en escritorio |
| `tipocolor-2` | media | S | Tras autorizar, el precio y la palomita del material elegido quedan casi invisibles |
| `a11y-4` | baja | S | En tema oscuro tres textos de apoyo bajan de 4,5:1 y la prueba de contraste nunca corre en oscuro |
| `a11y-5` | baja | S | En Alto contraste de Windows desaparecen los interruptores y la barra de completitud |
| `a11y-6` | baja | M | Un campo obligatorio vacío solo se marca con color: el mensaje desaparece a los pocos segundos |
| `a11y-7` | baja | M | En el teléfono, los nombres de material y sus precios van a 10,5 y 11,5 px, más chicos que en escritorio; todo el texto está en px |
| `a11y-8` | baja | L | El Escalador solo se opera con puntero: marcar puntos y mover guías no tiene teclado ni alternativa sin arrastre |
| `a11y-9` | baja | M | Barra superior en teléfono: el orden del foco no sigue el orden visual; y en escritorio dos nombres accesibles no contienen el texto visible |
| `a11y-10` | baja | S | «Del escalador» (aria-disabled) apaga el anillo de foco junto con el botón: 2,2:1 |
| `apoyo-4` | baja | S | Registrar venta y Revisión remota: el botón principal nunca queda a la vista |
| `apoyo-5` | baja | S | Tocar fuera de Registrar venta o de la Revisión remota cierra y descarta lo escrito sin avisar |
| `apoyo-6` | baja | S | Los selectores de herramienta miden 34 px de alto con el dedo |
| `apoyo-7` | baja | S | Cotizar con IA: durante el análisis, cancelar, estado y traza quedan bajo el pliegue |
| `apoyo-8` | baja | S | «Re-calibrar» deja las medidas viejas visibles y con «Agregar como partida» activo |
| `apoyo-9` | baja | L | Las medidas y la calibración del Escalador viven solo en memoria |
| `apoyo-10` | baja | L | El lienzo de medir no tiene nombre ni alternativa de teclado; guías y puntos solo se mueven arrastrando |
| `cliente-3` | baja | S | Ni la hoja 1 ni el mensaje de WhatsApp dicen la vigencia ni qué hacer para arrancar |
| `cliente-5` | baja | S | 34 textos del papel usan el gris --ink3 a 3.0-3.2:1, incluidos avisos que sí informan |
| `cliente-6` | baja | S | verificar.html lleva al cliente a páginas internas del taller y no le deja ningún contacto de AL3D |
| `cliente-8` | baja | M | Las hojas del taller viajan en el mismo archivo que el cliente recibe, con partidas ocultas y notas internas |
| `cliente-9` | baja | S | La columna 'Medidas' dice solo la altura de letra y el texto repite la jerga de los kelvin |
| `flujo-4` | baja | S | En una cotización bloqueada (pendiente o autorizada), tocar un campo o chip apagado no produce ninguna respuesta |
| `flujo-6` | baja | M | Recargar a mitad de captura conserva los datos pero devuelve la página arriba del todo y suma un escalón muerto al Atrás por cada recarga |
| `flujo-7` | baja | M | El mismo estado y la misma acción reciben nombres distintos, y la jerga interna («sellar», «hoja», «renglones», «código de verificación») llega al vendedor |
| `flujo-9` | baja | S | Enter no avanza en los campos del cliente y los inputs no declaran enterkeyhint |
| `flujo-10` | baja | S | Tras enviar el PDF y el WhatsApp, el botón principal sigue empujando «Registrar venta» aunque el cliente no haya aceptado |
| `formularios-2` | baja | M | El precio autorizado acepta $1, $99,999,999 y negativos, y se sella sin avisar ni pedir confirmación |
| `formularios-4` | baja | S | El botón principal de la barra móvil queda «Autorizar yo mismo» muerto, sin decir qué falta |
| `formularios-5` | baja | M | Los errores del paso Cliente solo viven en un toast de 4.6 s y en color ámbar; no hay texto junto a cada campo |
| `formularios-6` | baja | S | Las medidas, cantidades y tarifas no tienen ningún tope ni aviso de magnitud, y el total sale difuminado por defecto |
| `formularios-7` | baja | S | Un teléfono de 11 a 15 dígitos pasa el filtro del paso 1 y WhatsApp abre un chat de otro país |
| `formularios-8` | baja | S | Los tres campos obligatorios no encadenan con la tecla Intro: sin enterkeyhint y Enter no hace nada |
| `formularios-9` | baja | S | «Datos que salen en el PDF (opcional)» no avisa que ya tiene datos y mezcla el plazo de taller, que no sale en el PDF |
| `layout-6` | baja | S | La barra de arriba mide 123–177 px entre 561 y 1179 px y deja casi sin contenido el primer pantallazo en apaisado |
| `layout-7` | baja | M | Capturar una partida de letras cuesta casi dos pantallas útiles en teléfono y el commit «menos scroll» no tocó el cotizador |
| `layout-8` | baja | M | El ritmo de 4/8 px y los gutters no son sistemáticos |
| `rendimiento-2` | baja | S | Primera visita lenta: 14 guiones se descargan uno tras otro sin defer y la app tarda 9 a 11 s en estar lista con señal mala |
| `rendimiento-4` | baja | S | A los 8 s se destapa un formulario sin vida y lo que el vendedor teclea ahí no llega a la cotización |
| `rendimiento-5` | baja | M | Cada toque a un chip, tipo, plegar, agregar o duplicar reconstruye la lista entera de partidas, incluidas las plegadas |
| `rendimiento-6` | baja | M | Teclear una altura o cantidad se vuelve lento con muchas partidas: cada tecla repinta resumen, dock y barra de avance de toda la cotización |
| `rendimiento-7` | baja | M | Cada versión nueva baja de golpe 108 archivos (2,6 MB gzip) aunque el cambio sea una línea; el cotizador solo necesita 0,8 MB |
| `rendimiento-8` | baja | L | CSS no usado: el 43 % de las reglas no se tocó en 5 anchos y 2 temas, pero no conviene recortarlas; quitar comentarios rinde mucho más |
| `rendimiento-9` | baja | S | El logo y los iconos van por red primero sin tope de espera: con señal que no responde el logo tarda en salir |
| `rendimiento-10` | baja | S | Las fuentes vienen de Google (3 peticiones a 2 orígenes) y el service worker no las guarda: sin señal la tipografía cambia |
| `tactil-2` | baja | S | Un toque lento (≥350 ms) en un chip de material no elige nada: sale la «espiada» y el toque se traga |
| `tactil-3` | baja | S | El botón principal del dock, «Autorizar yo mismo», queda apagado y mudo mientras no hay una partida con precio |
| `tactil-4` | baja | S | Presionar no confirma nada en 10 de 28 controles, y con «menos movimiento» casi en ninguno |
| `tactil-5` | baja | S | Controles que quedan bajo 44 px contra lo que dice la guía: selector de tipo (40), Libre/Horizontal/Vertical del Escalador (34), «Del escalador/Subir plano» (34), vista Original del Vectorizador (34), fila «faltantes» (35.5), «Seleccionar archivo» (39) |
| `tactil-6` | baja | S | Fila de iconos de la partida: Duplicar / Ocultar del PDF / Borrar de 38 px pegados (0 y 2 px), el ▾ con 36 px recortado por la zona del número, y pasos de 42 px a 2 px |
| `tactil-7` | baja | S | Con ratón, un temblor de 6 px al hacer clic en un chip o botón de la partida la arrastra y se pierde el clic |
| `tactil-8` | baja | S | Doble toque en «Generar PDF» o «Enviar por WhatsApp» abre dos ventanas y marca el hito dos veces |
| `tactil-9` | baja | S | Ningún campo trae enterkeyhint: el teclado no ofrece «Siguiente» ni «Listo» en la captura encadenada |
| `tema-1` | baja | S | Con colores forzados (alto contraste de Windows) desaparecen los interruptores, las barras y el «elegido» de los selectores |
| `tema-2` | baja | S | En tema oscuro 4 textos del camino principal quedan bajo 4,5:1 por el brillo blanco del vidrio, y la prueba de contraste solo corre en claro |
| `tema-4` | baja | S | De noche el selector de rol «Vendedor / Autorizador» marca el elegido con una píldora a 1,18:1 |
| `tema-5` | baja | S | El enlace «Saltar al contenido» es casi ilegible en tema oscuro (2,39:1) |
| `tema-6` | baja | S | Imprimir la pantalla con tema oscuro pierde el «AL» del logotipo y, con gráficos de fondo, deja bloques oscuros |
| `tema-7` | baja | S | De noche el modal se separa de la página casi solo por un filete de 1,2:1 |
| `tema-8` | baja | S | El paso activo lleva un aro blanco al 90 % de noche (13,6:1), la «raya de neón» que vidrio.css dice evitar |
| `tema-9` | baja | S | Un logotipo propio subido pierde sus letras oscuras en tema oscuro |
| `tema-10` | baja | S | El botón de tema combina aria-pressed con una etiqueta que cambia, y un lector lo dice dos veces |
| `tipocolor-3` | baja | S | Los botones se pintan en Arial, no en Manrope, y el mismo botón sale en dos fuentes |
| `tipocolor-4` | baja | S | Emoji de color y glifos de texto hacen de íconos junto al sprite SVG |
| `tipocolor-5` | baja | S | El verde y el ámbar de estado se usan para cosas que no son ok ni falta |
| `tipocolor-6` | baja | S | Etiquetas de 10 a 10.5 px en mayúsculas con tracking, incluido el resumen del dinero de la venta |
| `tipocolor-7` | baja | S | El azul de marca se usa también para rótulos fijos, no solo para lo elegido o accionable |
| `tipocolor-8` | baja | L | La escala de 7 tokens convive con 17 tamaños reales y un clúster entero sin tokens en las herramientas Pro |
| `tipocolor-9` | baja | S | Texto cortado sin forma táctil de verlo completo y un folio que se parte en dos renglones |
| `tipocolor-10` | baja | M | En Escalador y Vectorizador hay 3 o 4 botones azules de relleno y un resplandor que el sistema no documenta |

## Causas que se repiten (agrupadas a mano a partir de los títulos; la síntesis final las fusiona)

1. **La barra de arriba pegajosa pesa demasiado** (crece de 58 a 109 px con la isla de estado, tapa el formulario en horizontal o con zoom, esconde el foco): `flujo-5`, `layout-4`, `formularios-3`, `layout-9`, `layout-1`, `layout-6`, `layout-2`, `a11y-2`, `a11y-3`, `flujo-8`.
2. **Contraste de bordes y modos de contraste** (campos, interruptores y botones secundarios a ~1,3:1; alto contraste de Windows; tema oscuro bajo 4,5:1): `a11y-1`, `tema-3`, `a11y-5`, `tema-1`, `a11y-4`, `tema-2`, `tema-4`, `tema-5`, `tema-7`, `tema-8`, `tema-9`, `tema-10`, `a11y-10`.
3. **Botón principal apagado y mudo** (no dice por qué no responde): `flujo-2`, `formularios-4`, `tactil-3`, `flujo-4`.
4. **Teclado del teléfono sin «Siguiente/Listo»** (`enterkeyhint`, Enter no encadena): `flujo-9`, `formularios-8`, `tactil-9`.
5. **Objetivos táctiles y letra chica en teléfono**: `tactil-5`, `tactil-6`, `apoyo-6`, `tipocolor-1`, `a11y-7`, `tipocolor-6`.
6. **Gestos y toques que se pierden o se duplican** (scroll cambia una cifra, toque lento no elige, doble toque abre dos PDF, temblor arrastra): `tactil-1`, `tactil-2`, `tactil-7`, `tactil-8`, `flujo-1`.
7. **Peso y arranque del código** (comentarios, 108 archivos por versión, guiones sin defer, fuentes de Google sin caché): `rendimiento-2`, `-3`, `-7`, `-8`, `-9`, `-10`. **Repintado de toda la lista** al tocar o teclear: `rendimiento-1`, `-5`, `-6`.
8. **Herramientas y modales en teléfono chico o acostado** (poco lienzo, botón principal enterrado, cierran sin avisar): `apoyo-1` a `apoyo-5`, `apoyo-7`, `apoyo-8`, `layout-5`.
9. **El Escalador no se opera sin puntero y no guarda lo medido**: `a11y-8`, `apoyo-9`, `apoyo-10`.
10. **Lo que recibe el cliente** (PDF sin enlaces, letra de 5–8 pt, hoja 1 casi vacía con muchas partidas, anticipo sin explicar, sin vigencia): `cliente-1` a `cliente-9`.
11. **Datos sin tope ni aviso** (precio de $1 o $99,999,999, teléfono de 11–15 dígitos): `formularios-2`, `formularios-6`, `formularios-7`.
12. **Jerga interna y rótulos inconsistentes** («sellar», «hoja», «renglones», kelvin): `flujo-7`, `cliente-9`.

## Hallazgos vigentes (por severidad)

### layout-1 · [ALTA] En horizontal, en tableta y con zoom 200 % las cabeceras pegadas tapan la pantalla y el formulario queda inalcanzable  
`layout-1` · Layout y responsive · PARCIAL · esfuerzo S

- **Dónde:** .pcab (css/sistema.css:2423 position:sticky; solo se suelta en @media(max-width:560px), l.2442) + .topbar sticky (solo se suelta en @media(max-height:600px) and (orientation:landscape) and (pointer:coarse), l.1303) + #mbar (visible <760 px)
- **Qué le pasa al usuario:** Quien acuesta el teléfono (667–740 px) o usa el zoom del navegador al 200 % ve solo las cabeceras y la barra de abajo. Al deslizar, los campos de material, iluminación y medidas pasan por detrás y no se pueden tocar: hay que volver a poner el teléfono vertical para cotizar. Es el mismo problema en la tableta de 1024 px (mitad de la pantalla tapada) y para cualquier persona con baja visión que use zoom 200 % (WCAG 1.4.4 y 1.4.10).
- **Evidencia (verificador, medida por él):** Arnés Playwright propio, tema claro, partida de letras abierta (acero inox, 40 cm, 8 letras), desplazada a media partida; ventana libre = alto − topbar pegada − .pcab pegada − dock (64 px + 10 de margen). Probé con un servidor estático propio en el puerto 8933 porque el 8777 estaba caído; no toqué el repo. Sin arreglo: 667×375 (táctil) topbar static, .pcab sticky 282, dock 74, libre 15 px (4 %), 0 de 18 campos completos a la vista; el clic de Playwright pasa solo por la rendija de 15 px, pero una persona no ve nada: la captura f-667x375-sin.png muestra solo pestañas de tipo, ficha de resumen y dock. 640×400 (puntero fino, zoom 200 % de 1280×800): topbar 170 + .pcab 263 = libre −111 px (−28 […]
- **Corrección al hallazgo original:** El problema de fondo es real y sus números reproducen casi al píxel, pero el hallazgo exagera en tres cosas. (1) «Critica» no aplica: el formulario queda inalcanzable solo en un rango estrecho (teléfono acostado de menos de 760 px de ancho como 667×375, y zoom de escritorio de 200 % en ventanas de menos de ~490 px de alto). En 844×390, 561×800 y 1024×768 los 18 campos SÍ se alcanzan; solo queda poco espacio (38 %, 33 %, 52 %). Además basta girar el teléfono o bajar el zoom para salir, así que […]
- **Ya cubierto por:** No está cubierto. La regla «Pantalla acostada» (css/sistema.css l.1303, del 2026-09-19) suelta topbar y .side solo con puntero grueso, alto ≤ 600 y apaisado, y no considera la .pcab ni el dock de menos de 760 px ni el zoom de escritorio. Ninguna prueba de pruebas/navegador/ vigila la .pcab (grep «pcab» da cero) y docs/REVISAR-PAQUETE-UI.md solo la menciona por rendimiento, no por cobertura de pantalla.
- **Regla del skill:** ui-ux-pro-max 5 Layout & Responsive: fixed-element-offset y orientation-support. UX «Fixed Positioning: Fixed elements can overlap or be inaccessible» y «Sticky Navigation». Pro-rules: «Scroll and fixed element coexistence». WCAG 1.4.4 y 1.4.10.
- **Arreglo:** Dos reglas, probadas inyectándolas con p.addStyleTag, sin tocar el repo. 1) css/sistema.css, capa de estructura, justo debajo de la regla @media(max-width:560px) de la l.2442: @media (max-width:1259px) and (max-height:820px), (max-height:440px){ .partida:not(.folded) .pcab{position:static} }. El tope de ancho 1259 es donde la .pcab baja de 194 a 150 px; en laptops y monitores (≥1260 px de ancho) el resumen pegado se conserva salvo ventanas de menos de 441 px de alto. Si se prefiere no cambiar el iPad horizontal (1024×768, hoy 52 % libre y alcanzable) basta bajar 820 a 760. 2) css/sistema.css l.1303, cambiar solo el encabezado: @media(max-height:600px) and (orientation:landscape) and (pointer:coarse), (max-height:520px) and (orientation:landscape){ .side{position:static} […]
- **Riesgo del arreglo:** Bajo y acotado. (a) Producto: en ventanas bajas (≤820 px y ≤1259 px de ancho, o ≤440 px de alto) la partida abierta pierde el resumen pegado, que es la decisión documentada de sistema.css l.2397-2411 («saber en cuál partida estoy»); es el costo elegido a cambio de poder tocar los campos, y por eso el tope de ancho a 1259 protege las laptops. Conviene que Elías confirme el caso del iPad horizontal […]
- **Segunda opinión:** parcial (severidad alta). Medí con el arnés Playwright. Como el servidor 8777 estaba caído, usé un servidor estático propio en el puerto 8944 que solo lee el repo, y lo detuve al terminar. Partida de letras abierta (acero inox, 40 cm, 8 letras). Ventana libre = alto − barra de arriba pegada − .pcab pegada − dock. Además barrí el scroll cada 3 px y registré, para cada uno de los 18 campos del cuerpo, el máximo de píxeles que llega a verse en la zona libre. Tema claro salvo indicación.

SIN ARREGLO (ancho×alto, libre en […] Corrección: El hallazgo es real y sus cifras reproducen al píxel, pero exagera en tres puntos. (1) «Crítica» es demasiado: el formulario queda inutilizable solo con el teléfono acostado a menos de 760 px de ancho (667×375, 740×360) o con zoom 200 % en ventanas bajas (640×400, 683×325, 768×365). En 800×360, […]

### rendimiento-1 · [ALTA] Abrir el Historial se congela segundos con decenas o cientos de cotizaciones, y crece con el uso  
`rendimiento-1` · Rendimiento percibido · confirmado · esfuerzo S

- **Dónde:** js/cotizador/nucleo.js:335 _focablesDe, llamado en :521 _modalAbierto y :554 _modalCerrado; css/sistema.css:5873 .hentry{content-visibility:auto}
- **Qué le pasa al usuario:** El vendedor toca Historial para buscar una cotización vieja o reenviar un PDF y el teléfono se queda trabado varios segundos sin responder; cuantos más meses lleva usando la app, peor. Con un año de cotizaciones guardadas puede tardar decenas de segundos en un teléfono de gama media.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído (se apagó la compu). Levanté uno propio de solo lectura en 8791 (python http.server sobre el repo) y lo detuve al terminar. Repo sin cambios (git status solo muestra .claude/ que ya estaba).

Medí con el arnés (Chromium propio), móvil 390x844, tema claro, movimiento reducido, entradas de mentiras con 2 partidas y sin imágenes (script t1/t3 en ver-rendimiento-1a). Tiempo = abrirHistorial() hasta dos cuadros pintados; layouts = LayoutCount de CDP Performance.getMetrics.

CPU x1, código actual: 25 entradas 158-204 ms y 52 layouts; 100 entradas 532-993 ms y 127 layouts; 200 entradas 1272-2119 ms y 227 layouts; 400 entradas 4938-5143 ms y 428 […]
- **Corrección al hallazgo original:** El diagnóstico, el dónde y las cifras del hallazgo se sostienen: mis mediciones coinciden con las suyas en orden de magnitud. 100 entradas a CPU x4 dio 2,5-3,1 s contra 2,9 s de ellos. 400 entradas a CPU x1 dio 4,9-5,1 s contra 4,6-4,7 s. Layouts: 227 contra 373 de ellos con 200 entradas. Las diferencias son ruido de este equipo. Con 200 entradas a CPU x1 yo medí 1,3-2,1 s contra 1,4-1,5 s, y con el observador desconectado 354-404 ms contra 208 ms.

Lo que corrijo es el arreglo: «dejar […]
- **Ya cubierto por:** Nada lo cubre. docs/REVISAR-PAQUETE-UI.md:342-343 solo registra la ganancia de content-visibility (~330 ms con 80 entradas a CPU x4), que hoy no se reproduce (2,5-5,8 s). pruebas/navegador/cot-historial.mjs usa 8 entradas y no mide tiempo ni layouts. Ninguna prueba nombra _focablesDe. El hueco de las pruebas es exactamente ese.
- **Regla del skill:** Performance: main-thread-budget, reduce-reflows (batch DOM reads then writes), virtualize-lists (50+ items); Performance/Caching del skill
- **Arreglo:** Es JS, no CSS. Archivo: js/cotizador/nucleo.js, en el ámbito global del script clásico, junto a _focablesDe (:335).

1) Añadir dos funciones con salida temprana que usan el mismo filtro de visibilidad que hoy: _primerFocable(m) recorre m.querySelectorAll(_FOCABLES) de principio a fin y devuelve el primero que pasa getClientRects().length, checkVisibility y el descarte de details:not([open]); _ultimoFocable(m) hace lo mismo recorriendo desde el final. Probadas, con equivalencia exacta.
2) _modalAbierto (:521): usar _primerFocable(m) en lugar de _focablesDe(m)[0]. Conservar la lógica: d = el primero o m, y si no hay se pone m.tabIndex=-1.
3) _modalCerrado (:554): _primerFocable(arriba) en lugar de _focablesDe(arriba)[0].
4) Manejador de Tab (:312-315): reemplazar _focablesDe(m) por […]
- **Riesgo del arreglo:** Bajo. Solo toca JS de js/cotizador/nucleo.js. Ningún CSS, token, capa de la hoja ni z-index, así que index.html y el anidador no se ven afectados. nucleo.js se comparte con el modo empotrado, que se beneficia igual.

Equivalencia probada en los 11 modales de _CAPAS que existen, en estado abierto y con el Historial lleno, con details abierto, filtrado y sin resultados. La excepción, que no probé, […]
- **Segunda opinión:** confirmado (severidad alta). Entorno: el servidor 8777 estaba caído; levanté uno propio y de solo lectura en 8793 y lo detuve al terminar. El repo sigue igual (git status solo muestra .claude/). Medí con el arnés y mi propio script (m1.mjs, m1d.mjs, m2.mjs en ver-rendimiento-1b), con datos inventados: entradas de 3 partidas, algunas con dirección y nota, y en una tanda la mitad con imagen. Moví yo el historial a localStorage y recargué. Medí con un toque real en el botón Historial, con Event Timing hasta el cuadro pintado, […] Corrección: El diagnóstico, el dónde y el orden de magnitud del hallazgo se sostienen. Lo que corrijo es el arreglo: «dejar _focablesDe solo para el manejador de Tab» no basta, porque ese manejador la llama en cada Tab y con 200 entradas el primer Tab pasa de unos 25-56 ms a 1-1,7 s (218 layouts). El manejador […]

### a11y-1 · [MEDIA] Los campos de texto y el interruptor apagado casi no se ven: contorno a 1,3:1  
`a11y-1` · Accesibilidad · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css ~3038 `input,select,textarea,.inp-money{border:1px solid var(--linea)}` (la regla de ~1054 con --n3 queda anulada); `.tg{background:var(--linea)}` ~3120 (anula el `--n5` de ~1196). Aplica a #f-cli, #f-tel, #f-proy, #f-dir-raw, #d-1, #h-1, #n-1 y a los switches de IVA, iluminación, etc.
- **Qué le pasa al usuario:** Con el teléfono bajo el sol, en obra y a una mano, el vendedor no distingue dónde termina cada casilla ni si «IVA» o «Con iluminación» está apagado: se confunden los campos con el fondo y se teclea a ciegas. Es lo primero que se toca en cada cotización.
- **Evidencia (verificador, medida por él):** Medido sobre píxeles reales (captura a DSF 3, lectura en canvas), sin tocar el repo. Los números del hallazgo para los campos reproducen exactamente.
CAMPOS, claro, 1440 y 390 táctil: borde rgb(220,223,242) contra fondo de tarjeta rgb(254,254,255) = 1,31:1; contra el relleno blanco = 1,32:1; relleno contra tarjeta = 1,01:1. Igual en #f-cli, #f-tel, #f-proy, #f-dir-raw, #f-maps, #d-1, #h-1, #n-1 y #f-anti (computado idéntico en los 15 campos de las tres pantallas).
CAMPOS, oscuro: borde rgb(47,53,98) contra rgb(24,28,55) = 1,43:1 y contra el relleno rgb(26,29,56) = 1,41:1. En la captura de 390 los campos casi desaparecen.
INTERRUPTOR APAGADO, en reposo (espera 500 ms): claro, 'Con […]
- **Corrección al hallazgo original:** Lo real y reproducido: el filete de los campos y la pista del interruptor apagado no llegan a 3:1 (WCAG 1.4.11), en claro y en oscuro. Lo que estaba mal o exagerado:
1) Los números del interruptor apagado salen de una captura a medio fundido (la pista tiene transición de .2 s). En reposo es peor: claro 1,31:1 (no 1,50) y, en el IVA oscuro, 1,03:1 (no 1,08).
2) «Mismo cambio para .inp-money» es un error. .inp-money es un div que ya trae su propio borde y envuelve a un input que también lo trae […]
- **Regla del skill:** color-contrast / Color Contrast (skill ux) y state-clarity; WCAG 1.4.11 Contraste no textual (AA): bordes de componentes y estados ≥3:1.
- **Arreglo:** Todo en css/sistema.css, capa 4 de estructura, más docs y una prueba. Probado inyectado.
1) Bloque «Campos» (~3038-3046). Dejar `input,select,textarea,.inp-money{border:1px solid var(--linea);...}` como está y añadir justo debajo: `input,select,textarea{border-color:var(--n5)}`. NO incluir .inp-money, porque el wrapper llevaría un aro doble. Con eso, claro 3,07:1 y oscuro 3,84:1. Disabled queda pálido solo, porque `input:disabled{border-color:var(--n2)}` de ~1061 tiene (0,1,1) y gana. El foco (--a), `.fld.falta` (--amber-ico) y `.arrastre-activo` ganan por especificidad.
2) Mismo bloque, línea ~3046: en el hover pasar `border-color:var(--n4)` a `var(--tinta3)`.
3) Estados que quedarían más pálidos que el neutro (~4549 y ~4551): `.tel-vivo.completo .tel-vivo-in{border-color:var(--ok)}` y […]
- **Riesgo del arreglo:** - Peso visual: sistema.css es compartido, así que también cambian el anidador, publicaciones, verificar y la plataforma. Los campos, selects y buscadores toman el filete más oscuro. Lo vi en 390 claro y oscuro del cotizador, no en las otras superficies. Debería comprobarse a ojo en el anidador, que usa input, select y switches.
- Un `.inp-money` sin tocar queda con halo pálido por fuera y línea […]
- **Segunda opinión:** parcial (severidad media). Reproducido por mi cuenta, sin tocar el repo (git status igual que al inicio). El servidor 8777 estaba caído; serví el repo en solo lectura en 8802 desde mi carpeta y lo detuve al terminar. Arnés propio, capturas a DSF 3, píxeles leídos con canvas, movimiento reducido. Claro y oscuro; 1440 de escritorio y 390 táctil.
CAMPOS, píxel contra píxel. Claro: borde rgb(220,223,242) contra el fondo de la tarjeta rgb(254,254,255) = 1,31:1, y contra el relleno blanco = 1,32:1. El relleno contra la tarjeta […] Corrección: Lo real y reproducido: el filete de los campos y la pista del interruptor apagado no llegan a 3:1 (WCAG 1.4.11), en claro y en oscuro, y nada en el repo lo cubre. Lo que estaba mal o exagerado:
1) Los números del interruptor apagado (1,50 claro y 1,08 oscuro) salieron de una captura a medio fundido […]

### a11y-2 · [MEDIA] Al tabular hacia atrás, o con zoom 200 %, el campo enfocado queda escondido bajo el encabezado pegajoso de la partida  
`a11y-2` · Accesibilidad · PARCIAL · esfuerzo M

- **Dónde:** css/sistema.css `.pcab{position:sticky;top:calc(var(--top-fijo)+4px)}` (~2423; solo es estático a ≤560 px, ~2442) contra `html{scroll-padding-top:calc(var(--top-fijo,70px)+12px)}` (~791), que solo cuenta la barra de arriba. Campos afectados: #d-1, #h-1, #n-1, chips de material/complejidad, «Escribe el texto», «Del escalador», «Subir».
- **Qué le pasa al usuario:** Quien captura con Tab (la PC de oficina) o con la pantalla ampliada escribe en un campo que no ve: al regresar con Shift+Tab a corregir la altura o el número de letras, el cursor está detrás del encabezado. Con el teléfono acostado y el teclado en pantalla casi no queda hoja visible.
- **Evidencia (verificador, medida por él):** Medí con el arnés (Chromium propio, tema claro; la geometría no cambia en oscuro). Método: 1 partida de letras en blanco, foco real con teclado, espera de 700 ms por parada y elementFromPoint en 25 puntos del campo enfocado. Los cubiertos por .pcab, todos reproducidos, fueron estos. Shift+Tab desde el último control de la tarjeta. 1440×900, 1 partida: 3 tapadas del todo (chips Recta, Cursiva y Compleja; foco en top 107–147 px, .pcab hasta 222 px) más 2 casi tapadas (#h-1 y #n-1, 20 de 25 puntos). 1440×900, 3 partidas: 5 del todo. 1920×950, 1 partida: 6 (los 3 chips de estilo y los 3 de iluminación/luz). 1366×650: 5 del todo + 4 parciales. 1280×600: 4 + 5. 960×540: 17 (incluye #d-1, #h-1, […]
- **Corrección al hallazgo original:** Lo central es REAL y lo reproduje: el foco queda bajo el encabezado pegajoso .pcab (position:sticky, top = --top-fijo+4, de 150 px a 1440 y 232 px a 960), porque html{scroll-padding-top} (css/sistema.css ~791 = --top-fijo+12) solo cuenta la topbar. Es el fallo WCAG 2.4.11 AA, y la regla del skill existe: «Focus Not Obscured (Minimum)». Pero el hallazgo exagera o se equivoca en cinco cosas. (1) Severidad: baja de «alta» a «media». En teléfono vertical (≤560 px, el uso principal de ventas) .pcab […]
- **Regla del skill:** focus-not-obscured / Focus Not Obscured (Minimum) del skill ux, «offset sticky UI with scroll-padding»; fixed-element-offset; WCAG 2.4.11 (AA, 2.2) y 1.4.10 Reflow.
- **Arreglo:** Dos piezas, ambas en css/sistema.css junto al bloque .pcab (~2423–2442), más un guion chico. (a) Margen de desplazamiento, CSS, junto al `.pcab{position:sticky…}` y antes del `@media(max-width:560px)`: `.partida:not(.folded) .pbody :is(input,select,textarea,button,[role=button],[tabindex]){scroll-margin-top:var(--pcab-alto,0px)}`. El margen es el alto del .pcab abierto y pegado, SIN sumar --top-fijo (scroll-padding ya lo trae). Los focusables de una partida están todos dentro de .pcab o de .pbody (medido: 26 focusables, 9 en .pcab, 17 en .pbody, 0 fuera). (b) Guion: publicar `--pcab-alto` en documentElement como el mayor offsetHeight de los `.partida:not(.folded) .pcab` cuyo getComputedStyle(position) sea 'sticky' (0 si ninguno, para que en teléfono, plegadas e impresión no […]
- **Riesgo del arreglo:** Bajo y acotado. (1) Si --pcab-alto se publicara sin filtrar por sticky, en teléfono (pcab static, ~320 px) el margen sobre-desplazaría cada campo enfocado; por eso el guion debe contar solo los pegados, y sin publicar la variable vale 0 (el comportamiento de hoy). (2) --pcab-alto puede quedar viejo si el psum cambia de renglones sin repintar (por ejemplo al teclear); solo falla por unos píxeles y […]
- **Segunda opinión:** parcial (severidad media). Medido con el arnés (Chromium propio, tema claro, servidor propio en 8855 porque el 8777 estaba caído; el repo quedó intacto, git status solo muestra .claude/). Método: foco real por teclado, espera de 450 a 600 ms por parada, elementFromPoint en 25 puntos del campo enfocado, recorrido de las 50 paradas de #card-partidas. Cascada confirmada con getComputedStyle: .pcab sticky con top 72 px y z-index 5 a 1440; scroll-padding-top 80 px (= --top-fijo 68 + 12). El fondo es vidrio (rgba […] Corrección: La causa y el fallo son reales y los reproduje por mi cuenta. El encabezado pegajoso .pcab queda 4 px bajo la barra de arriba, y html{scroll-padding-top} (~791) solo suma --top-fijo+12, así que el foco del teclado puede quedar bajo el encabezado. El hallazgo exagera o se equivoca en seis puntos. […]

### a11y-3 · [MEDIA] En laptops de 630 a 768 px de alto, «Autorizar yo mismo» y «Solicitar autorización» reciben el foco fuera de la pantalla  
`a11y-3` · Accesibilidad · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css `.side{position:sticky;top:calc(var(--top-fijo,74px)+12px)}` (~1287); el único remedio, ~1303, solo vale para `(max-height:600px) and (orientation:landscape) and (pointer:coarse)`. Botones: #authbox .btn-pri, «Solicitar autorización a alguien más», «Vaciar y empezar cotización nueva».
- **Qué le pasa al usuario:** Quien autoriza con teclado en una laptop común pulsa Enter sobre el botón que decide el precio sin verlo. Es la acción principal de la pantalla.
- **Evidencia (verificador, medida por él):** Arnés Playwright con Chromium propio, tema claro, estado «precio» (una partida de letras en acero inox). Mi servidor estático fue el puerto 8791: el 8777 estaba caído, y lo dejé sin tocar. No edité nada del repo. Medido: `.side` mide 826.9 px, `position:sticky`, `top:80px`, `max-height:none`, `overflow:visible`; `--top-fijo`=68. REPRODUCIDO con Tab real, clic en `#f-anti` con scrollY=0 y luego Tab (espera de 350 ms). A 1366×630: «Ver precios» 608–633 (fuera por 3 px), «Autorizar yo mismo» 694–740 (fuera por completo), y el siguiente Tab sí la trae a la vista. A 1366×768: «Solicitar autorización» 766–808, fuera. A 1280×720: «Autorizar yo mismo» 712–758 con 720 de alto, o sea 8 px visibles. A […]
- **Corrección al hallazgo original:** Lo central es real y lo reproduje con los mismos números del revisor. Pero el hallazgo se equivoca o exagera en cuatro cosas. (1) Severidad: baja de «alta» a «media». Solo falla el foco de teclado, y solo en un instante: el Tab siguiente trae la columna a la vista. Con ratón o dedo todo se alcanza desplazando la página, y Enter sobre el botón funciona aunque no se vea. Sube a alta únicamente si las PC de oficina son de 1366×768 con ratón, porque ahí «Autorizar yo mismo» solo se ve al bajar casi […]
- **Ya cubierto por:** Parcialmente nada: no hay prueba que vigile el foco dentro de `.side`. Lo más cercano es la regla de css/sistema.css ~1303 (`@media(max-height:600px) and (orientation:landscape) and (pointer:coarse){.side{position:static}}`), que cubre solo teléfono acostado. La guía docs/SISTEMA-DE-DISENO.md §4.4 define el aro de foco, pero no dice nada de la columna pegada ni de límites de alto. docs/REVISAR-PAQUETE-UI.md no lo lista como limitación conocida.
- **Regla del skill:** focus-not-obscured / Focus Not Obscured (Minimum); fixed-element-offset; WCAG 2.4.11 (AA, 2.2).
- **Arreglo:** Archivo css/sistema.css, capa base (la de la línea ~1287, antes de la capa 8 del vidrio). Un solo bloque nuevo junto a `.side`, más una línea dentro del bloque de teléfono acostado que ya existe (~1303). Nada en vidrio.css.

Bloque nuevo, justo debajo de `.side{position:sticky;...}`:
@media screen and (min-width:760px){
  .side{max-height:calc(100dvh - var(--top-fijo,74px) - 24px);overflow-y:auto;scroll-padding-block:8px}
}

Línea nueva en el bloque existente `@media(max-height:600px) and (orientation:landscape) and (pointer:coarse)`: `.side{position:static;max-height:none;overflow:visible}`. Va después del bloque nuevo, así que gana por orden de fuente.

Por qué estos valores, todos medidos:
- `screen` deja la impresión intacta.
- `min-width:760px`, no 921, cubre la rejilla de dos […]
- **Riesgo del arreglo:** Riesgos medidos o razonados. (1) La tarjeta se angosta 6 px (320 a 314) solo cuando la columna desborda, y la línea «Mantén tocado para ver un importe» pasa a dos renglones; es cosmético. (2) La sombra de la tarjeta se recorta a los costados dentro del contenedor con scroll. (3) Dos zonas de scroll anidadas: con rueda sobre la columna, esta se desplaza primero y luego la página, lo cual es […]

### apoyo-1 · [MEDIA] Historial: en teléfono chico o acostado la lista casi desaparece  
`apoyo-1` · Pantallas de apoyo y modales · PARCIAL · esfuerzo M

- **Dónde:** #histmodal .hist-panel con .hist-ayuda, .hist-search-bar, .hist-fichas, .hist-foot y .hentry. css/sistema.css:1727 (panel), 2327 (ayuda), 2331 y 2530 (pie), 5857 (fichas). cotizador.html:609 (padding-top inline).
- **Qué le pasa al usuario:** Un vendedor que quiere reabrir, duplicar o reenviar una cotización a un cliente que le escribió ve un panel casi vacío. Con el teléfono acostado no ve ninguna cotización y no puede buscar ni desplazarse. Con 14 cotizaciones tiene que bajar casi una pantalla por tarjeta.
- **Evidencia (verificador, medida por él):** Chromium propio del arnés (copia arnes2.mjs con isMobile=true para poder probar acostado), hasTouch, claro, 14 cotizaciones sembradas en al3d_historial, espera de 900 ms, abrirHistorial(). El servidor 8777 estaba caído (ERR_CONNECTION_REFUSED) y levanté uno propio en el 8963 con python -m http.server; ya lo cerré y git status del repo no cambió. SIN ARREGLO, lista (#hist-body) contra panel: 360×640 mide 154 de 590 (26 %); 375×667, 181 de 617; 360×780, 294 de 730 (40 %); 390×844, 358 de 794 (45 %); 844×390 mide 0 de 340. Alturas fijas a 360 px: cabecera 69, ayuda 62, búsqueda 71, fichas 69, pie 164, o sea 435 (el revisor dice 436). Con la barra del navegador de un teléfono real (390×664 y […]
- **Corrección al hallazgo original:** Los números del revisor se reproducen casi al píxel; lo que cambia es la severidad, el impacto y partes del arreglo. (1) Severidad: alta no se sostiene. En vertical la lista nunca llega a 0 y las acciones de la primera tarjeta (Abrir y editar / Duplicar) quedan a la vista, así que molesta pero no bloquea. Solo acostado (844×390) es un bloqueo total, y esa postura es rara en una cotización a una mano. (2) «Con el teléfono acostado no puede buscar» es inexacto: el campo de búsqueda sí se ve y se […]
- **Ya cubierto por:** Nada lo cubre. Ninguna prueba de pruebas/navegador mide el alto visible de #hist-body ni el pie (cot-historial.mjs usa 360 y 420 de ancho con 740 de alto, donde sí cabe; cot-entrega.mjs solo mira desborde horizontal del historial). docs/REVISAR-PAQUETE-UI.md no lo lista. El único antecedente es el comentario de sistema.css ~1720 sobre el Fold, que cuidó solo que el pie no saliera del visor, no cuánta lista queda.
- **Regla del skill:** fixed-element-offset, orientation-support, content-priority, touch-density (ui-ux-pro-max: Layout y responsive)
- **Arreglo:** Dos bloques, ambos acotados a #histmodal y ya probados por inyección. NO tocar tokens ni sombra. (A) Vertical, en css/sistema.css capa (2) teléfono, dentro del @media(max-width:560px) que ya existe junto a `.hist-ayuda{padding…}` (~línea 2559), con selector de id para ganarle a la capa (4) y al vidrio:
@media(max-width:560px){
  #histmodal .hist-ayuda{display:none}   /* −62 px; Duplicar ya explica su efecto en su title */
  #histmodal .hist-foot{gap:var(--e1);padding:var(--e2) var(--e3)}
  #histmodal .hist-foot button{flex:1 1 0;min-width:0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:var(--e2) var(--e1)}
  #histmodal .hist-foot .foot-nota{margin-top:var(--e1)}
}
Con icono ARRIBA del texto y no al lado, los cuatro botones caben en una […]
- **Riesgo del arreglo:** Bajo a medio. Bloque A: cambia la apariencia del pie en teléfono (de 2×2 con icono al lado a 4 en fila con icono arriba), y eso revierte una decisión documentada en sistema.css ~2530; hay que mostrárselo a Elías. Oculta la ayuda de Duplicar solo en ≤560 px (en escritorio sigue). #climodal comparte la clase .hist-ayuda y por eso el selector va con #histmodal; si se quisiera lo mismo en Clientes […]

### apoyo-2 · [MEDIA] Vectorizador en teléfono: el botón «Vectorizar» queda enterrado y casi no hay panel visible  
`apoyo-2` · Pantallas de apoyo y modales · PARCIAL · esfuerzo M

- **Dónde:** #vectormodal .sp-side: orden de secciones en cotizador.html:782-877 (#vt-go en la línea 811) y pie .sp-actions (854-863). css/sistema.css:2180 (sticky) y 2086.
- **Qué le pasa al usuario:** Quien carga el logotipo del cliente en el teléfono no encuentra qué hacer a continuación: ve la foto, los modos Corte/Logotipo/Foto y botones grises, pero no el botón que vectoriza. Primero tiene que desplazar pasando por cuatro controles de ajuste fino que no necesita en su primer intento.
- **Evidencia (verificador, medida por él):** Reproducido yo mismo con el arnés Playwright, tema claro, táctil, imagen cargada (logo AL3D en canvas) y modal abierto con abrirVector() más vtLoadImgSrc(). El servidor 8777 estaba caído, así que usé uno propio de solo lectura sobre el mismo repo (mismos md5 de cotizador.html y sistema.css). Repo sin cambios (git status solo .claude/).

SIN ARREGLO, antes de trazar (panel, pie, franja visible sobre el pie, altura del contenido, y desplazamiento para ver «Vectorizar» entero):
- 390×844: panel 371, pie 236, franja 135, contenido 1713; el botón está en y=787 y hay que desplazar 700 px.
- 390×664 (viewport típico de Safari con barras; es inferencia mía): franja 38. El botón nunca se ve entero […]
- **Corrección al hallazgo original:** Lo real: el pie fijo de 236 px se come el panel del Vectorizador en teléfono y «Vectorizar» queda enterrado. Lo que el revisor dijo mal o dejó corto: (1) «#vt-go está a y=1260 de un panel de 1713» mezcla una coordenada de pantalla con el alto del contenido; dentro del panel el botón está en y=787, a 46% de la altura. (2) «751 px a 360×640» engaña: a 360×640 el botón NUNCA cabe entero sobre el pie; se ven 25 de sus 48 px a cualquier desplazamiento. (3) El hallazgo solo cuenta la mitad del […]
- **Regla del skill:** primary-action, content-priority, progressive-disclosure, empty-states (ui-ux-pro-max)
- **Arreglo:** Inyectado en vivo sin tocar el repo (variantes A, B, C y D más scroll-padding). Archivos y capa: capa (1) estructura de css/sistema.css y cotizador.html, sin tocar JS.

1) cotizador.html (~811): mover <button id="vt-go"> al final de la primera sección «Qué se está vectorizando», dentro de su .sp-sec-b, justo después de #vt-modo-help, con margin-top de unos 12 px. No cambia ningún onclick ni id; vtSucio() y vtVectorizar() lo siguen encontrando por id. Con esto la posición baja de y=787 a y=170 del contenido.

2) cotizador.html (~854-863): mover la fila <div class="vt-dl"> (SVG/PNG) del pie .sp-actions a la sección «Exportar», justo antes de #vt-copy-svg. Así el pie queda con Agregar, Medir y Volver, y mide 182 px y no 236. Es opcional en escritorio, donde el pie no es fijo, pero agrupa […]
- **Riesgo del arreglo:** - Pliegue de «Ajustes del trazo»: las pruebas de cot-vector.mjs manejan #vt-detalle, #vt-ruido, #vt-colores y #vt-esq (focus, boundingBox, scrollIntoView; líneas ~193-327, 533-548, 596-669). Medí que con el <details> cerrado el focus() del deslizador no prende (document.activeElement queda vacío), así que esas pruebas se romperían sin abrir el pliegue antes. Las marcas y la pastilla de las piezas […]

### apoyo-3 · [MEDIA] Escalador y Vectorizador en teléfono: poco lienzo y un pie fijo que se come el panel  
`apoyo-3` · Pantallas de apoyo y modales · PARCIAL · esfuerzo M

- **Dónde:** .sp-topbar, .sp-actions, .sp-back-m, .sp-canvas-area. css/sistema.css:2131-2196 (@media max-width:1000px) y 2204-2210 (acostado). cotizador.html:1034-1040 y 854-863.
- **Qué le pasa al usuario:** Medir con el pulgar sobre una fachada ancha deja una foto de 273 px de alto, y al medir la lista de cotas se ve a través de una rendija. El pie fijo gasta 54 px en un botón de volver que ya está arriba.
- **Evidencia (verificador, medida por él):** Servidor: el de :8777 no respondía (se apagó la compu), levanté uno propio de solo lectura en :8931 sobre el repo; git status quedó limpio (solo .claude/ que ya estaba sin seguir). Arnés Playwright, tema claro, táctil; Escalador con foto 1200×800 calibrada y 3 medidas, Vectorizador con imagen cargada; «ventana» = alto visible del panel sobre el pie fijo (sp-side.clientHeight − sp-actions.height).
REPRODUCIDO (actual): 390×844 barra 157 px (19 %), lienzo 316 (37 %), pie 175 Esc / 236 Vec, ventana 195 Esc / 134 Vec (139 con trazo). 360×640 barra 157 (25 %), lienzo 222 (35 %), ventana 85 Esc / 24 Vec. Acostado 844×390 barra 105 (27 %), lienzo 504×285, panel 340 px, pie 175 de 285 (Esc) y 236 […]
- **Corrección al hallazgo original:** Los números del revisor se reproducen casi al píxel (tema claro, táctil, ±1 px), pero el arreglo propuesto está bien solo en una de sus tres partes. (1) Ocultar .sp-back-m: correcto y es lo que más rinde. (2) «Panel al 54 % en lugar de 46 %»: no hace nada tal como está escrito, porque .sp-side tiene max-width:340px y ese tope manda (46 % de 844 son 388, ya se corta a 340). Si se quita el tope, el lienzo baja de 504 a 388 px, justo lo que el hallazgo dice que falta, y el Vectorizador se rompe: […]
- **Regla del skill:** fixed-element-offset, orientation-support, visual-hierarchy (ui-ux-pro-max)
- **Arreglo:** Cambios en css/sistema.css, capa (1) estructura, dentro del bloque @media(max-width:1000px) y su bloque acostado; no tocan vidrio.css ni los selectores del tema oscuro.
1) Quitar las dos reglas `.sp-back-m{display:block;…}` y `.sp-back-m:active{…}` del bloque @media(max-width:1000px). Basta: la base `.sp-back-m{display:none}` (capa 1, antes de ese bloque) ya lo oculta, y `html.solo-vector .sp-back-m{display:none !important}` no cambia. Dejar el botón en cotizador.html (escritorio y empotrado no lo muestran) o quitarlo con una prueba en la mano; la salida sigue siendo «← Cotizador» arriba, el gesto atrás del sistema (popstate, ya soportado) y el «Volver» al final de la sección Exportar. Actualizar los comentarios que dicen que el pie mide 174–237 px (ahora ~121–183) y el de «Volver al […]
- **Riesgo del arreglo:** Bajo para (1) y (2). (1) El único efecto de producto es que el botón «Volver» deja de estar al alcance del pulgar abajo; queda «← Cotizador» arriba a la derecha (la zona más lejana con una mano) más el gesto atrás del sistema, que ya cierra ambas herramientas (popstate en escalador.js). Es decisión deliberada previa (comentario CSS «el botón que se queda pegado abajo»), así que conviene avisarle […]

### cliente-1 · [MEDIA] Con plano y 5 o más partidas, la hoja 1 queda casi vacía y los totales se van a la hoja 2  
`cliente-1` · Salida al cliente · PARCIAL · esfuerzo M

- **Dónde:** js/cotizador/entrega.js · generarPDF(): ALTO_IMG (línea ~874), ALTO_TBODY_ULT (~906), repartir() (~938) y el aviso .sigue (~1760)
- **Qué le pasa al usuario:** Es justo la cotización más grande (la que más importa y la que se manda con plano, que es como se arma en 22 de 25 casos reales): el cliente abre el PDF, ve 1 o 2 renglones y un 60-70 % de hoja en blanco, y el total y el plan de pago están una hoja después. Parece un documento a medio imprimir. La causa es que a la última hoja se le reservan 312 px fijos para el plano y eso empuja las filas hacia atrás aunque la hoja 1 las aguantaría todas con sus totales.
- **Evidencia (verificador, medida por él):** Medido por mí con Chromium propio (Playwright), documento generado con generarPDF() y maquetado en print 816x1056 (media:print), tema claro, hoja-de-mentiras, Q.anti=15000, IVA, plano SVG 600x260. Servidor: el 8777 estaba caído (se reinició la máquina), así que serví el repo SOLO LECTURA en un puerto propio (8795) y lo apagué al terminar; git status del repo limpio. LETRAS + plano: n=4 una hoja con totales y plano, vacío 1 %. n=5: hoja 1 con 1 fila, contenido hasta 281 px de 974 (~66 % del papel en blanco), sin .neto; hoja 2 con 4 filas + totales + plano 260 px. n=6: 2 filas (73 % vacío). n=7: 3 filas (66 %). n=8: 4 filas (59 %). n=9: 5 filas (52 %). Siempre fis = tot (hojas físicas = […]
- **Corrección al hallazgo original:** Lo real: con plano y una tabla un poco larga, la hoja 1 de la cotización queda casi vacía y los totales se van a la hoja 2. Eso lo reproduje. Lo que el hallazgo exagera o dice mal es esto. (1) Severidad: no es «alta». Los datos del repo (docs/ESTRUCTURA-COTIZACION-CANVA.md) dicen que la mediana real es 1 partida (14 de 25) y el techo 7, y la única de siete partidas (Cliente 08) no llevaba imagen. La frase «la que se manda con plano, como en 22 de 25» junta dos cosas que casi no coinciden. […]
- **Regla del skill:** visual-hierarchy / content-priority (Layout & Responsive, quick-reference): lo principal (qué y cuánto) debe verse primero; whitespace-balance
- **Arreglo:** Archivo único: js/cotizador/entrega.js, dentro de generarPDF() (el HTML del PDF lleva su propio <style>; no se toca sistema.css, vidrio.css, index.html ni el anidador; sin tokens ni capas ni z-index involucrados). Cinco ediciones, probadas por inyección. (1) Después de `const trozos = repartir(itemsForPDF,ALTO_TBODY,ALTO_TBODY_ULT);` hacerlo `let trozos` y añadir: `const trozosSinFig = ALTO_IMG ? repartir(itemsForPDF,ALTO_TBODY,ALTO_TBODY_ULT+ALTO_IMG) : trozos; const figAparte = ALTO_IMG>0 && trozosSinFig.length < trozos.length; if(figAparte) trozos = trozosSinFig;` (solo se manda la figura a su hoja cuando eso ahorra una hoja de cotización, así que el total de hojas nunca sube). (2) TOTAL_HOJAS suma `(figAparte?1:0)`. (3) `const HOJA_FIG = trozos.length + 1; const HOJA_PLANOS = HOJA_FIG […]
- **Riesgo del arreglo:** Bajo. (a) Solo se activa si ahorra una hoja de cotización, así que las cotizaciones de 1 a 4 filas (la inmensa mayoría; mediana real 1) salen idénticas, y el total de hojas físicas no sube en ninguna de mis mediciones (fis = tot). (b) Cambia el diseño del documento al cliente para quien tenga 5 o más partidas con plano: el plano deja de estar al lado de los totales y pasa a una hoja propia […]

### cliente-2 · [MEDIA] El PDF no trae ni un enlace: el cliente no puede tocar el WhatsApp, el mapa ni la verificación  
`cliente-2` · Salida al cliente · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/entrega.js · footer() (~1118) y footerCot (~1129), EMPRESA (~87), verificacionHTML() (~674)
- **Qué le pasa al usuario:** El cliente lee el PDF en su teléfono, casi siempre desde WhatsApp. Para hablarle al vendedor tiene que memorizar o copiar un número de un texto de 6.75 pt; para verificar la cotización no puede escanear el QR desde la misma pantalla donde lo ve, ni tocar la dirección: tendría que teclear a mano el folio largo (COT-0042@K7QM) y el código de 12 caracteres desde letra de 6 pt. El original en Canva sí era tocable y se perdió.
- **Evidencia (verificador, medida por él):** Reproducido con Playwright propio (claro, 390x844 táctil, estado «autorizada» con la hoja de mentiras). El servidor 8777 estaba caído por el apagón, así que serví el repo (solo lectura) en un puerto propio y lo apagué al terminar.

Cómo medí: capturé el HTML que arma generarPDF() desde el blob de window.open y lo imprimí a PDF con Chromium.

Hoja base: 4 hojas, 0 etiquetas <a> en el documento. Los 10 href que hay son 7 de <use href="#marca-al3d"> y 3 de Google Fonts, ninguno es enlace tocable. El PDF base tiene 0 anotaciones /Link.

Tipografía (getComputedStyle): .pie-c>span 9 px = 6.75 pt; .verif-t p y su <b> 8 px = 6 pt; .pie-h 8 px.

Fidelidad del reporte: el código dice lo que se […]
- **Corrección al hallazgo original:** Lo central es real: el PDF no lleva ningún enlace. Lo que el hallazgo exagera es la severidad «alta». (1) El mensaje de WhatsApp que arma la app dice «Le adjunto el PDF», así que el cliente casi siempre ya está dentro del chat con el vendedor y puede contestar ahí; el enlace de WhatsApp aporta poco. El valor real está en el enlace de verificación (cliente o contador que ven el PDF en el mismo teléfono donde no pueden escanear el QR) y en el reenvío del PDF a terceros. (2) Hay un rodeo, aunque […]
- **Regla del skill:** touch/interaction: acción directa en el contexto donde se lee; 'share sheet / contact' (búsqueda sin coincidencias en la base, aplico dato de Canva) y web-target-size
- **Arreglo:** Todo en js/cotizador/entrega.js. La capa de estilo es el <style> de la plantilla del documento (dentro de generarPDF), no sistema.css ni vidrio.css, así que no afecta a index.html ni al anidador.

1) En EMPRESA (~87) agregar `mapa:'https://maps.app.goo.gl/FzVpPua2GLdefH1t5'`. Elías debe confirmar que ese enlace de Canva sigue vigente. Se pone junto a `taller`/`oficina` para que, si cambian la dirección, cambien también el enlace.

2) Dos ayudas junto a EMPRESA (o dentro de generarPDF): `aDoc(href,html)` devuelve `<a href="${esc(href)}" target="_blank" rel="noopener">${html}</a>`, o el html tal cual si no hay href. `hrefWa()` devuelve 'https://wa.me/'+telWhatsApp(EMPRESA.whatsapp), que ya da 523328130092, o '' si no hay número.

3) footer() (~1119): imprimir […]
- **Riesgo del arreglo:** Bajo. Medido con parche en memoria: mismo número de hojas (4), cajas del pie y de la verificación idénticas al píxel, sin errores de consola. Qué podría romper: (a) Las pruebas existentes leen solo .verif-t .num y que el párrafo no desborde, y envolver en <a> no cambia textContent, pero no corrí cot-entrega.mjs completo porque está escrito para Linux. (b) Seguridad: los href salen de constantes y […]
- **Segunda opinión:** parcial (severidad media). Reproducción propia con el arnés (Chromium propio): app a 390x844 táctil, tema claro, cotización de 1 partida autorizada con llegarA('autorizada'); capturé el HTML que arma generarPDF() interceptando URL.createObjectURL (uno.html, 126 881 bytes) y lo cargué a 816x1056 con media print (carta). 
- Confirmado: 0 etiquetas <a> en el documento; page.pdf() sale con 0 anotaciones /Link (4 hojas). El pie imprime '33-2813-0092' y 'Naranjos #648 Col. Lindavista Cp. 45169' en <span> planos; la URL de […] Corrección: El hecho técnico es cierto y lo reproduje por mi cuenta: el documento no trae ningún enlace, el PDF no trae anotaciones de enlace, y Chromium sí las conserva si se ponen. Pero el hallazgo exagera en tres cosas. (1) Severidad: no es «alta». El PDF viaja dentro del chat de WhatsApp con el propio […]

### cliente-4 · [MEDIA] Casi toda la letra del papel está entre 5 y 8 pt  
`cliente-4` · Salida al cliente · PARCIAL · esfuerzo M

- **Dónde:** js/cotizador/entrega.js · CSS del documento: .lbl 7px (~1290), td 9.5px (~1297), .cs 9.5px (~1307), .tsec ul 10.4px (~1423), .pie-h 8px (~1405), .rec-badge 6.5px (~1456)
- **Qué le pasa al usuario:** La parte del documento que dice QUÉ compra el cliente y qué condiciones acepta es la más chica. En papel un cliente mayor o con poca luz en la obra la lee con esfuerzo, y en el teléfono necesita hacer zoom en todo. Lo único grande es el total.
- **Evidencia (verificador, medida por él):** NOTA DE ENTORNO: el servidor 8777 estaba caído (la compu se apagó). Usé un servidor estático propio de solo lectura sobre el repo, en el puerto 8847, y lo apagué al terminar. Todo salió de mi carpeta ver-cliente-4a; no toqué el repo.

REPRODUCIDO. Chromium del arnés, print 816x1056 (el papel es siempre claro: `color-scheme: only light`). Cotización de 6 partidas con plano, anticipo, límite y teléfono: 7 hojas, 6,191 caracteres (el revisor contó 7,006: otro texto, mismas proporciones).
- Todas las hojas: 33.3 % a ≤6.75 pt, 94.9 % a ≤7.88 pt, 2.9 % a ≥9.75 pt. El revisor midió 33 %, 95 % y 2.6 %.
- Solo las 3 hojas que el cliente lee (Cotización x2, Opciones, Términos; 4,094 caracteres): 22.1 […]
- **Corrección al hallazgo original:** El núcleo es real: el papel es casi todo letra de 5 a 8 pt, el cuerpo de la tabla está a 7.13 pt, las etiquetas a 5.25 pt y los términos a 7.8 pt, y ninguna prueba lo vigila. Lo que estaba mal o exagerado:

1) El «33 % a ≤6.75 pt» incluye el pie repetido en cada hoja y el recibo. En las hojas que el cliente lee es 22 %. El 94-95 % a ≤7.88 pt sí se sostiene en ambos conteos.

2) Teléfono. La vista previa dentro de la app usa .41 en 390 px, no .48, y ya ofrece «Al ancho» (entrega.js ~1577), que […]
- **Ya cubierto por:** Ninguna prueba vigila tamaños de letra del documento (grep de fontSize/font-size en pruebas/: nada en pdf-hoja-carta.mjs, cot-entrega.mjs ni contraste.mjs, que solo cubre la app). Sí es decisión documentada: docs/FUNCIONES.md:195 describe la «escala de seis tamaños» (7 / 9.5 / 10 / 14 / 17 px y términos a 10.4 px) como una capa visual deliberada. Ahí dice que antes todo iba a 10.5 px y que se achicó el cuerpo para dar jerarquía, y el comentario de entrega.js ~1415 dice que los términos se subieron de 8.8 a 10.4 por ser «letra de contrato». Todo se razonó en px y nunca en pt de papel. El arreglo no contradice la decisión (conserva la jerarquía si se sube `.cn`), pero hay que actualizar esa línea de FUNCIONES.md. docs/REVISAR-PAQUETE-UI.md no menciona esto. La vista previa del teléfono sí tiene mitigación: «Al ancho» (H23).
- **Regla del skill:** readable-font-size y font-scale (Layout & Responsive / Typography & Color); dynamic-type. La regla de 16 px es para pantalla: traducida a papel, cuerpo ≥ 9 pt y rótulos ≥ 6.5 pt
- **Arreglo:** Archivo: js/cotizador/entrega.js, solo en el `<style>` del documento (~1233-1587), que es una hoja propia sin capas y sin relación con sistema.css ni vidrio.css. No afecta index.html ni el anidador, ni z-index ni [hidden], y no usa tokens de la app. Los azules y grises del documento no cambian.

1) CSS (probado como parche en memoria):
- `.lbl` 7→8.5px
- `th` 7.5→8.5px
- `td` 9.5→11px
- `.cn` 10→12px (obligatorio: el nombre del concepto debe seguir por encima de su especificación)
- `.cs` 9.5→11px
- `.trow` 9.5→11px
- etiqueta de `.neto` 8→9px
- `.nota p` 9.5→10.5px, `.nota small` 8→9px, `.verif-t p` 8→9px
- `.opc-et` 7→8.5px, `.opc-m` 9→10px
- `.acepta p` 9.5→10.5px, `.acepta-f>div` y `.acepta-m` 8.5→9.5px
- `.tsec ul` y `.tsec>p` 10.4→12px (9 pt; en Términos caben, 12.5 ya no)
- […]
- **Riesgo del arreglo:** 1) Holgura. Sin recalibrar altoFila(), la holgura mínima de la hoja intermedia cae de 213 px a ~19 px en el peor caso medido (14 filas de ~160 caracteres); y a 12 px de cuerpo, a 13 px. No desborda en lo medido, pero una letra de reserva más ancha o una descripción más larga lo vencería. Con altoFila recalibrado (38/46 y 15 px) la holgura sube a ~180 px, a costa de una hoja física más en ~3 de 9 […]

### cliente-7 · [MEDIA] La excepción de $60,000 del anticipo está sin explicar y se contradice con el total que ve el cliente  
`cliente-7` · Salida al cliente · confirmado · esfuerzo S

- **Dónde:** js/cotizador/entrega.js · TERMINOS apartado 1 (~1195) y .pago (~1753); regla real en js/cotizador/proceso.js (~20-31, ANTICIPO_EXCEPCION)
- **Qué le pasa al usuario:** Un cliente con un proyecto de $55,000 + IVA puede creer que no tiene que dar el 50 % de anticipo, o el de $65,000 no sabe qué cambia. Es una condición de dinero escrita a medias, justo donde luego hay discusión.
- **Evidencia (verificador, medida por él):** MEDIDO yo mismo (Playwright propio, escritorio 1440x900, tema claro). El servidor 8777 estaba caído, así que abrí la app por file:// con una copia del arnés (no toqué el repo). Llamé generarPDF() interceptando el blob, y rendericé el documento en carta (816x1056, media print).
- Caso A: partida manual de $55,000, con IVA, anticipo 50%. Hoja 1: «Subtotal $55,000.00 / I.V.A. $8,800.00 / TOTAL NETO $63,800.00 / Plan de pago: Anticipo $31,900.00, Resta $31,900.00». Hoja de términos, apartado 1: «<u>Excepción: proyectos mayores a $60,000 MXN.</u>» subrayada, en negrita, tras la viñeta de los 2 días. La app dice partirAnticipo(...).excepcion=false y el aviso del vendedor #s-anti-excep sigue […]
- **Corrección al hallazgo original:** Los hechos del hallazgo se sostienen. Matices: (1) no es solo «del anticipo»: en la app la excepción cubre las condiciones de pago en general (el aviso dice «el 50% es solo la referencia» y js/datos/proyectos.js dice que el saldo «se liquida como se pactó»), y en el papel queda justo debajo de la viñeta de los 2 días de liquidación; (2) el «por escrito» del arreglo no sale de ninguna fuente; (3) el hallazgo se queda corto: los comentarios viejos son varios y hay una contradicción de […]
- **Ya cubierto por:** Solo la mitad de la app: pruebas/cot-precio.mjs y pruebas/navegador/cot-precio.mjs vigilan que el aviso en pantalla del vendedor se mida sobre el subtotal, y docs/REVISAR-PAQUETE-UI.md lo marca RESUELTO (1-oct-2026). Nada vigila el texto de los términos ni que el PDF avise la excepción; ese hueco sigue abierto.
- **Regla del skill:** trust signals / claridad de condiciones de pago (búsqueda 'trust signals quote terms' sin coincidencias; criterio de contenido claro) y heading/semantic clarity
- **Arreglo:** Arreglo probado inyectando en el DOM del PDF (sin tocar el repo). Todo en js/cotizador/entrega.js (el PDF lleva su propia hoja de estilos en línea, no usa sistema.css ni vidrio.css ni tokens de la app).
1) TERMINOS[0], tercera viñeta: nombrar de qué es excepción y sobre qué base, y sacar la cifra de ANTICIPO_EXCEPCION (proceso.js comparte ámbito global) en vez del literal. Redacción mínima propuesta, sujeta al visto bueno de Elías: «<u>Excepción al plan de pago: proyectos mayores a $60,000 MXN antes de IVA; el anticipo y la liquidación se pactan con el cliente.</u>» Quitar el «por escrito» del hallazgo original (nadie lo decidió). Medido: la columna 1 de la hoja de términos termina en y=723 de 825; con 3 líneas (+35 px) termina en 759, cabe con 66 px libres y la hoja de Aceptación no se […]
- **Riesgo del arreglo:** - Cambiar los términos toca redacción del dueño que está documentada como «palabra por palabra» de Canva; no se debe publicar sin su OK, y habría que ajustar la nota de docs/ESTRUCTURA-COTIZACION-CANVA.md.
- La línea nueva en la tarjeta de totales rompe el presupuesto fijo de alto (588/148 px en repartir()): sin sumarla a ALTO_TOT la hoja que cierra pierde casi todo su margen (48 a 18 px) y […]

### flujo-1 · [MEDIA] El primer clic en el botón de Autorizar/Solicitar se pierde si acabas de teclear en un campo numérico de la partida  
`flujo-1` · Navegación y flujo · confirmado · esfuerzo S

- **Dónde:** js/cotizador/partidas.js:381-394 (saneaNum, onblur de #h-N y #n-N en líneas 1710/1714/1743/1745) → typeItem (l.304) → renderSummary → renderAuth en js/cotizador/proceso.js:489 (box.innerHTML=…) sobre #authbox
- **Qué le pasa al usuario:** En la PC de la oficina, el vendedor teclea «8 letras», le da clic a «Autorizar yo mismo» y no pasa nada, sin aviso ni error. Lo más natural es pensar que el botón falla y apretar de nuevo. Pasa en todas las cotizaciones, justo en el paso que cierra el trabajo. En el teléfono solo afecta a quien baja al panel en vez de usar el dock.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído (la compu se apagó). Levanté uno estático propio de solo lectura en 8791 desde la carpeta del repo, usé el arnés con PUERTO=8791 y lo detuve al terminar; git status quedó solo con «?? .claude/».
Mediciones propias con el arnés, tema claro:
1) 1440x900, ratón real: teclear 40 en #h-1 y 8 en #n-1, y bajar al botón «Autorizar yo mismo» (286x46). Eventos registrados: pointerdown, mousedown, blur:n-1, pointerup, mouseup, y NINGÚN click. Q.estado sigue 'borrador'. El nodo del botón es otro ya en el mousedown (mismo nodo = false). El segundo clic pasa a 'pendiente'. También ocurre con el p.click() del locator de Playwright, que es como lo escribe la […]
- **Corrección al hallazgo original:** Lo medido y la cadena de código son exactos (saneaNum partidas.js:381-394, onblur en 1710/1714/1743/1745, typeItem:304, renderAuth proceso.js:489). Dos ajustes: (1) la severidad baja de alta a media: no se pierde ni se falsea ningún dato, un segundo clic lo resuelve, y en el teléfono la ruta principal (el dock) funciona; solo falla en el panel del aside, o sea sobre todo en la PC de oficina. «Pasa en todas las cotizaciones» solo vale para quien deja el foco en un campo numérico de la partida y […]
- **Regla del skill:** Sin regla exacta; la más cercana es submit-feedback / tap-feedback-speed (todo toque debe responder en 100 ms). Hueco de pruebas: pruebas/navegador/cotizador-flujo.mjs pulsa el botón después de #addbtn (que ya quitó el foco) y las demás llaman autorizarYoMismo() por evaluate, así que ninguna prueba hace clic real con el foco en un campo de partida.
- **Arreglo:** Arreglo A (principal, probado inyectado en el navegador sin tocar el repo): js/cotizador/partidas.js, función saneaNum (l.381), JS puro, sin capa CSS ni tokens. Escribir el campo como hoy, pero llamar a typeItem solo si el valor realmente cambió, porque oninput ya lo escribió tecla a tecla:
function saneaNum(el,id,k,paso){
  const v=+el.value;
  const n=(v>0)?(paso?Math.round(v/paso)*paso:v):0;
  el.value=n||'';
  const it=Q.items.find(x=>x.id===id);
  const igual=it&&(+it[k]||0)===n&&!(k==='n'&&!(n>0));
  if(!igual) typeItem(id,k,n);
  if(k==='n'&&!(n>0)){ const it2=Q.items.find(x=>x.id===id); if(it2&&it2.n>0) el.value=it2.n; }
  if(k==='altura') revisarAlturaMinima(id);
}
Importante: la guarda excluye k==='n' con n=0 para no tocar el «vaciar la cuenta devuelve el mando al contador». […]
- **Riesgo del arreglo:** Arreglo A: muy bajo. Solo omite una segunda escritura idéntica de lo que ya escribió oninput. Lo que podría romper son las pruebas de cotizador-flujo.mjs (l.265-330: cuenta corregida a mano, vaciar la cuenta, entrar y salir del campo, «40 cm», 40.3), pero reproduje esos patrones con el parche y dan los mismos resultados. No afecta a index.html/anidador, CSS, z-index ni [hidden], porque es lógica […]
- **Segunda opinión:** parcial (severidad media). Entorno: el servidor 8777 estaba caído (código 7 de curl). Levanté un servidor estático propio de solo lectura (python http.server) en el puerto 8812 desde la carpeta del repo y lo detuve al terminar. Usé el arnés con PUERTO=8812, tema claro, hoja de mentiras. git status quedó solo con «?? .claude/». Mis scripts están en la carpeta ver-flujo-1b/ (r1 a r7, parche.js).

1) 1440x900, ratón real (page.mouse: mover, down, up), partida de letras con acero inox, 40 cm tecleado en #h-1 y 8 en #n-1, […] Corrección: Lo central es real y lo reproduje de forma independiente: con el foco en un campo numérico de la partida, el primer clic o toque sobre un botón del panel #authbox se pierde sin aviso y el segundo sí funciona. Lo que estaba exagerado o mal acotado: (1) La severidad no es alta. No se pierde ni se […]

### flujo-2 · [MEDIA] En Partidas el botón principal del dock está apagado en silencio: al tocarlo no pasa nada ni dice por qué  
`flujo-2` · Navegación y flujo · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/proceso.js:2482-2487 (rama final de renderMobileBar: dis:!listo), #mbar .mbar-btn
- **Qué le pasa al usuario:** Todo vendedor nuevo entra a Partidas y su botón grande de color aparece pálido y mudo. «¿Por qué está apagado, qué me falta?» se contesta tres pantallas más abajo, donde nadie mira mientras captura.
- **Evidencia (verificador, medida por él):** Reproducido con el arnés de Playwright (Chromium propio) a 390×844, táctil, tema claro, tras llegarA('partidas'). El servidor :8777 estaba caído; levanté un servidor estático de solo lectura propio en :8977 sobre la carpeta del repo y luego lo paré. El repo quedó intacto: git status solo muestra `.claude/`, como al inicio.

Estado medido: pantalla partidas, Q.items=1, totals().sub=0, rol vendedor con puedeAutorizar()=true.

Botón `#mbar .mbar-btn` «Autorizar yo mismo»:
- disabled=true, aria-disabled=null, title=null, opacity 0.55, cursor not-allowed.
- 182×46 px, dentro de un dock de 370×64.
- Altura del documento: 3011 px. `#authbox .mini` («Agrega partidas con precio para continuar.») […]
- **Corrección al hallazgo original:** Lo real: el botón está silencioso y el hallazgo describe bien los hechos. Lo exagerado: (1) la severidad «alta». No hay dato perdido, precio equivocado ni bloqueo, porque quien está en Partidas tiene que capturar la partida de todos modos y el botón se enciende solo al haber precio. (2) «el motivo solo está en #authbox .mini» es impreciso. En el mismo 390×844 y a scroll 0, la propia partida ya muestra en ámbar «! Faltan 3 datos» y «MATERIAL / ACABADO · Sin elegir». La caja de avance dice […]
- **Ya cubierto por:** Ninguna prueba ni documento lo cubre; el hueco es real. Sí existe el principio y un arreglo parcial: FUNCIONES.md:51 y 89, y proceso.js:1228 y 2474-2481 resolvieron el caso «faltan datos del cliente», pero no el caso «Partidas sin precio». Tampoco figura en docs/REVISAR-PAQUETE-UI.md.
- **Regla del skill:** disabled-states (un deshabilitado lleva atributo semántico) y empty-nav-state (explicar por qué algo no está disponible); coincide con el principio documentado en el propio código: «un botón gris no explica nada».
- **Arreglo:** Archivo js/cotizador/proceso.js, rama final de renderMobileBar (líneas 2482-2487). Es JS puro: no toca capas de CSS ni tokens, y el botón conserva `.mbar-btn` sin clase nueva.

```js
} else {
  const listo=Q.items.length>0&&totals().sub>0;
  b=!listo
    ? {cls:'mbar-btn',on:'irAPendiente()',txt:Q.items.length?'Completa la partida':'Agrega una partida',post:' ›'}
    : puedeAutorizar()
      ? {cls:'mbar-btn',on:'autorizarYoMismo()',ico:'i-rayo',txt:'Autorizar yo mismo'}
      : {cls:'mbar-btn',on:'solicitar()',ico:'i-rayo',txt:'Solicitar autorización'};
}
```

Así se quita `dis:!listo` y el botón conduce igual que la rama «Falta X ›» (l.2474-2481). Conviene dejar el rótulo corto: `.mbar-btn` tiene max-width 62%, unos 229 px, y la nota de decirFaltaEnElBoton ya avisa que el dock mide poco […]
- **Riesgo del arreglo:** Bajo.

- Ninguna prueba existente depende del dock deshabilitado (grep sobre pruebas/). Hay que comprobar que cot-precio §7 sigue en verde, sobre todo el caso de 0 mutaciones al repintar.
- El dock está oculto en escritorio, así que index.html y el anidador no se afectan.
- irAPendiente() ya lo usa la caja de avance, y reutiliza llevarAPartida() y renderItems(). El único efecto nuevo es que ese […]
- **Segunda opinión:** parcial (severidad media). Reproducido con el arnés (Chromium propio) a 390×844, táctil, tema claro, tras llegarA('partidas'). El servidor :8777 estaba caído, así que levanté un servidor estático propio de solo lectura en :8978 y lo paré al terminar. El repo quedó intacto (git status solo muestra .claude/).

Estado: pantalla partidas, items=1, totals().sub=0, rol vendedor, puedeAutorizar()=true, estado borrador.

Botón «#mbar .mbar-btn» «Autorizar yo mismo»: disabled=true, aria-disabled=null, title=null, opacity 0.55, […] Corrección: Los hechos son ciertos y reproducibles; lo exagerado es la severidad y un detalle del dónde. (1) «Alta» no se sostiene: no se pierde ningún dato ni se bloquea el trabajo. El botón solo está apagado mientras NINGUNA partida tiene precio (listo = items>0 y subtotal>0), y quien está ahí tiene que […]

### flujo-3 · [MEDIA] Con la solicitud en espera, «Editar» cancela todo con un toque sin avisar, el estado de espera casi no se ve y no hay forma de cotizar a otro cliente  
`flujo-3` · Navegación y flujo · PARCIAL · esfuerzo M

- **Dónde:** #mbar .mbar-btn «Editar» (proceso.js:2453-2455); #cand-partidas «Mandada a autorización · volver a editar» (proceso.js:1592-1596 + partidas.js:1401-1414 irAlCandado → reabrir); reabrir() proceso.js:2025-2063; toast en notario.js:243
- **Qué le pasa al usuario:** El vendedor sin Dirección (casi todo el equipo) pasa por este estado en cada cotización. Un toque, que parece solo «volver a la partida», le quita la solicitud a Dirección, que puede estar revisándola en ese momento. Y si quiere atender al siguiente cliente mientras espera, la única salida es cancelar la solicitud y luego vaciar.
- **Evidencia (verificador, medida por él):** Medí con Chromium propio de Playwright, 390x844 táctil, tema claro, rol ventas (AL3D.identidad con rol distinto de «direccion»), con la hoja de mentiras. El servidor 8777 estaba caído (se apagó la compu), así que levanté uno temporal en el puerto 8793 y lo cerré al terminar; no toqué el repo.

REPRODUCIDO:
- Tras tocar «Solicitar autorización» el estado pasa a pendiente, cola=1, hoja=pendiente. El dock queda «Total neto ▾ $20,416.00 · Editar» y el toast dice «Solicitud enviada a Dirección · te aviso cuando la autoricen».
- Un toque en el dock «Editar», o en #cand-partidas, deja estado=borrador, cola=0, hoja=cancelada, puedeDeshacer()=false y sin modal de confirmar. El toast llega después: […]
- **Corrección al hallazgo original:** Lo cierto es el núcleo: en teléfono, un toque en el «Editar» del dock o en el banner «Mandada a autorización · volver a editar» cancela la solicitud sin avisar antes. Lo exagerado o equivocado: (1) «no hay forma de cotizar a otro cliente» y «la única salida es cancelar y luego vaciar» es FALSO. En el paso 1 de una solicitud pendiente, #cli-candado trae «Empezar cotización nueva», que deja la solicitud viva en la cola y en la hoja (nuevaConEstosDatos, proceso.js:1755-1785, con aviso «la anterior […]
- **Ya cubierto por:** Parcialmente.
- La isla de 32 px sin texto en teléfono ya está listada como limitación en docs/REVISAR-PAQUETE-UI.md:500, punto 4 («En teléfono la frase no se puede leer, solo el icono… No hay forma táctil de ver el rótulo»), y en :496 por el ancho. Es la limitación que el revisor repite sin evidencia nueva.
- Empezar otra cotización con la anterior en cola está cubierto por #cli-candado y nuevaConEstosDatos (proceso.js:1755-1830; docs/FUNCIONES.md:70) y por el aviso de notario.js:361-369.
- El hecho de que «Editar» retire la solicitud es comportamiento esperado: defensas-del-cotizador.mjs:197-203 y 371.
- Sin cubrir: no hay ninguna prueba de la confirmación ni del doble toque.
- **Regla del skill:** confirmation-dialogs (confirmar acciones irreversibles; severidad Alta en el skill), undo-support y state-clarity. Los rótulos de las dos entradas no dicen lo que hace la acción.
- **Arreglo:** Dos cambios chicos, solo JS, sin CSS ni z-index nuevos.

1) Confirmar donde cancela en silencio (el dock y el banner). Para el aside no hace falta, porque su botón ya dice «Editar (cancela la solicitud)».
- En js/cotizador/proceso.js, una función nueva, p. ej. editarSolicitada(): si Q.estado==='pendiente' && !_selfAuth && _esperaViva(Q.solicitud), hace await confirmar({titulo:'¿Cancelar la solicitud a Dirección?', texto:'Si editas, la solicitud sale de su cola y tendrás que volver a pedirla.', si:'Cancelar y editar', no:'Dejarla en espera', peligro:true}) y solo si el resultado es sí llama a reabrir(). En cualquier otro caso llama a reabrir() directo.
- Se usa en renderMobileBar (la rama pendiente no propia, proceso.js ~2455: on:'editarSolicitada()') y en irAlCandado (partidas.js ~1412, […]
- **Riesgo del arreglo:** - Un toque más para quien de verdad quiere editar una pendiente. Es aceptable, pero conviene no ponerlo también en el botón del aside, que ya lo dice.
- confirmar() es de una sola instancia (_confResolver): si hay otra pregunta abierta, ésta contesta «no». Es el comportamiento actual.
- Si se cambiara reabrir() a asíncrona, se rompería irAPartida (proceso.js:935), que llama llevarAPartida(id) […]

### flujo-5 · [MEDIA] La barra superior pegajosa crece de 58 a 109 px visibles cuando aparece la isla de estado, y a 360 px ya nace así  
`flujo-5` · Navegación y flujo · PARCIAL · esfuerzo M

- **Dónde:** css/sistema.css:5057-5081 (.isla.ver, bloque ≤560 px «order:2;margin-right:auto») y .topbar (top:-56px); #isla, #roleseg, botón Historial
- **Qué le pasa al usuario:** Justo cuando el vendedor autoriza, espera a Dirección o trabaja sin señal en la obra, la barra se infla, mueve botones bajo el dedo y le quita una octava parte de la pantalla, en la que cabe la mitad de una partida.
- **Evidencia (verificador, medida por él):** Reproducido yo mismo con el arnés (Chromium propio). El servidor 8777 estaba caído por el apagón de la compu, así que serví el repo, sin tocarlo, en un puerto privado (8915) y lo apagué al terminar.

A) 390×844 y 412×915, táctil, claro y oscuro, scroll 1500, pantalla Precio.
- En reposo la barra mide 114 px (58 visibles, top:-56px puesto por JS).
- Al quedarse sin señal pasa a 165 px (109 visibles). scrollY va de 1500 a 1551, lo que compensa el anclaje de scroll de Chrome.
- La barra se queda así todo el tiempo sin señal (medido a +4.5 s). Al volver la señal sigue 2 s más («Volvió la señal») y recién entonces regresa a 114, así que hay un segundo brinco.
- «Esperando a Dirección», puesto […]
- **Corrección al hallazgo original:** El mecanismo es real, pero el hallazgo se equivoca en tres cosas. (1) A 360 px la isla NO infla la barra. La barra ya mide 165 (109 visibles) en reposo, con o sin isla (165 → 165). Eso viene de otra regla documentada, la de max-width:385px (css/sistema.css, el selector de rol baja a un tercer renglón con .seg{order:6;flex:1 1 100%}), y también pasa a 375 y 385. La isla solo causa el brinco entre 386 y 424 px de ancho. (2) El arreglo para 360 no funciona. «Bajar el relleno del .seg a 8 px» deja […]
- **Ya cubierto por:** Cubierto solo a medias. css/sistema.css (comentario de C21, ~5073-5075) pretende que en ≤560 la isla sea «solo el glifo, 32 px y sin crecer», sin romper la barra; pero esa intención no se cumple entre 386 y 424 px. pruebas/navegador/cot-cliente.mjs ~336-339 («el folio no cambió de renglón: la barra no se rompió») solo compara folio.top, y ~615-618 y ~645-649 (barra no se rompe con isla) solo corren a escritorio (1440 y 1100). Las rondas de teléfono son 360 y 420: a 420 la barra sí se rompe (Historial brinca) y la prueba pasa porque no mide el alto de la barra ni la posición de Historial. El ancho ≤385 con tres renglones es decisión documentada en el comentario de css/sistema.css (max-width:385px) y no figura en docs/REVISAR-PAQUETE-UI.md como limitación de la isla; ahí solo se anota que la frase no se lee en teléfono.
- **Regla del skill:** content-jumping / layout-shift-avoid y fixed-element-offset; compact-label-overflow (esencial primero, reflow sin brincos).
- **Arreglo:** Archivo y capa: css/sistema.css, capa de estructura, bloque «C21 · La isla de estado», dentro del @media(max-width:560px) existente (~5076-5082). vidrio.css no define .isla; no hay otra regla posterior que le cambie el position (7267-7273 solo toca transiciones).

1) Reemplazar `.topbar-in .isla.ver{order:2;margin-right:auto}` por:
.topbar-in .isla.ver{position:absolute;order:0;margin:0;left:max(12px,env(safe-area-inset-left,0px));top:calc(100% - 8px);z-index:1;pointer-events:none}
- Se ancla a .topbar-in, que ya es position:relative por `body:not(.an) .topbar-in`.
- top:calc(100% - 8px) es el relleno inferior de la barra: la pastilla queda justo debajo del renglón de controles, sin tocar a ninguno (a 360, 375 y 385 el selector de rol llega a 8 px del borde).
- Queda a la altura del folio […]
- **Riesgo del arreglo:** 1) Cambia la composición: la pastilla ya no va «junto al folio en su renglón» sino colgada del borde inferior de la barra, a la izquierda. La aserción de cot-cliente.mjs ~336-338 (`dy<=8` e `izq:i.left>=f.right-1`) fallará en las rondas de 360 y 420 y hay que reescribirla para ≤560. Lo de un solo renglón y la regla de dos renglones del doc (SISTEMA-DE-DISENO.md 3.1) quedan intactos.
2) La […]

### flujo-8 · [MEDIA] La barra superior en teléfono pesa lo que no importa: selector de rol que casi nadie puede usar, iconos sin texto y el único color es el de salir  
`flujo-8` · Navegación y flujo · PARCIAL · esfuerzo S

- **Dónde:** #roleseg (cotizador.html:207-210) y notario.js:48-54 pintarRolDisponible; .btn-hist en cotizador.html:167-168,198; css/sistema.css:881-899 y 887
- **Qué le pasa al usuario:** El espacio más visible de la pantalla se lo lleva un interruptor de rol que casi todo el equipo no puede usar, mientras «Clientes» e «Historial» se adivinan por su icono y lo que te saca de la cotización llama más la atención que lo que sigue. La voz («clic Plataforma») no encuentra el botón.
- **Evidencia (verificador, medida por él):** Serví el repo con un servidor estático propio (el de 8777 estaba caído), sin editar nada en el repo. Playwright táctil, tema claro, sin hoja de mentiras, así que identidadVerificada() es null y el usuario no es Dirección.

1) Reproducido a 390×844. #roleseg mide 158,2×46 (el hallazgo decía 155). «Vendedor» tiene fondo rgb(23,26,51) y texto blanco. «Autorizador» mide 83,9×44, con .apagado, aria-disabled=true y opacity .45. Clientes, Historial y tema miden 44×44, solo icono. a.btn-pf tiene texto rgb(48,24,248) y borde rgb(185,197,254), contra rgb(26,29,51) del resto. Tocar Autorizador deja Q.rol='vendedor' y sale el toast «Solo una cuenta de Dirección autoriza precios. Entra con ella desde la […]
- **Corrección al hallazgo original:** El hallazgo está bien en lo que mide (números a 390 reproducidos) pero se equivoca en tres cosas. (1) Ancla el costo a 390 px, donde casi no hay costo: la barra pegada mide 58 px con selector de rol y 56 sin él. El costo real está en 360/375 px y en modo empotrado, ver evidencia. (2) Dice que el title no se ve en táctil y que los iconos «se adivinan». Es cierto del title, pero la app ya tiene «mantener presionado enseña el nombre» (P.nombres en js/piezas.js, armado en […]
- **Ya cubierto por:** Parcialmente, y por eso el hallazgo es parcial.
(1) Los iconos sí tienen nombre visible al mantener presionado: P.nombres (js/piezas.js:5313), armado en js/cotizador/arranque.js:49, con prueba pruebas/navegador/cot-cliente.mjs, ronda 5 (C25). También sale con foco de teclado y con el ratón.
(2) El color acentuado de Plataforma es decisión escrita: css/sistema.css:1664-1668 y 1716-1718, con la historia de 843-851.
(3) El selector apagado con su título y su toast es decisión escrita: js/cotizador/notario.js:46-47, de la fase «Autorizar es sellar» (commit 2fb483c). Cumple `disabled-states` (opacidad .45 + aria-disabled), pero la fase no midió el costo en alto a 360/375.
(4) pruebas/navegador/contraste.mjs:283 mide el contraste de un enlace de la barra y los botones de la barra; ninguna prueba vigila ni el costo del tercer renglón pegado ni el nombre accesible contra el texto visible (WCAG 2.5.3). Ese es el hueco de la prueba.
Reglas del skill ui-ux-pro-max: `nav-label-icon`, `progressive-disclosure`, `disabled-states` y `ARIA Labels` (búsqueda ux). La última la cumple la app. La búsqueda «touch target icon only tooltip» no aportó nada adicional.
- **Regla del skill:** nav-label-icon y nav-hierarchy; primary-action (lo acentuado debe ser lo que sigue) y WCAG 2.5.3 Label in Name.
- **Arreglo:** Solo dos piezas; la tercera del hallazgo se descarta.

A) Selector de rol (lo que más pesa).
- js/cotizador/notario.js, dentro de pintarRolDisponible(): además de lo que ya hace, `document.documentElement.classList.toggle('sin-rol', !puedeAutorizar())`. Es solo para quien NO es Dirección. La función ya corre en arranque.js:111 y en setRol (proceso.js:2614).
- css/sistema.css, junto al bloque `@media(max-width:560px)` de la barra (cerca de la línea 909), pero ANTES del cierre de la capa 8 y vidrio.css: `html.sin-rol #roleseg{display:none}`. Va también `@media(min-width:350px) and (max-width:560px){html.sin-rol body:not(.an) .topbar-in .btn-hist:not(.btn-tema):not(.btn-undo):not(.btn-pf){width:auto;padding:0 12px;gap:var(--e2)} … .lbl{display:inline}}`, para devolver «Clientes» e […]
- **Riesgo del arreglo:** A) Quitar el selector a quien no es Dirección tropieza con una decisión escrita en notario.js:46-47: «se queda a la vista —es donde la gente lo busca—». Esa decisión se puede reabrir, pero quien la tomó fue Elías, así que conviene preguntarle. La app tiene una regla opuesta en el comentario de .btn-undo (sistema.css:1680-1683): un botón que se queda a la vista para negarse sigue diciendo «esto ya […]

### formularios-1 · [MEDIA] Tocar una partida en el aviso «Hay partidas sin terminar» no lleva a ella en el teléfono  
`formularios-1` · Formularios y retroalimentación · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/proceso.js:933 irAPartida() y :890 llevarAPartida(); js/cotizador/nucleo.js:463-472 (oyente popstate); botón .falt-ir en proceso.js:858
- **Qué le pasa al usuario:** El aviso dice «Toca la partida para ir a completarla», pero en el teléfono el vendedor toca y la pantalla no se mueve. Se queda mirando el resumen sin saber qué pasó, con el cursor oculto en un campo que no ve. Es justo el momento de arreglar lo que bloquea una autorización, y en obra cuesta tiempo con el cliente enfrente.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído cuando empecé (la compu se apagó), así que serví el repo, solo lectura, en 127.0.0.1:8793 con python http.server y usé el arnés con PUERTO=8793. No toqué el repo.

REPRODUCCIÓN (Chromium con el arnés, claro, táctil):
- 390x844: partida 1 de letras completa y partida 2 caja de luz sin terminar. Con la página al fondo (scrollY=2029, H=2873) toco Solicitar y luego .falt-ir con touchscreen.tap. Resultado a los 2.8 s: scrollY=2029 (el mismo de antes), la caja de la partida 2 en top=-1353 / bottom=-614 (fuera de pantalla) y el foco en un div.chip con top=-1019. El rastreo de window.scrollTo muestra irA {top:605.9, smooth} (nucleo.js:165, llamado […]
- **Corrección al hallazgo original:** El fallo es real y se reproduce, pero hay tres ajustes. (1) El arreglo del hallazgo, tal como está escrito (esperar trasElAtrasDelCodigo() en irAPartida() en el mismo tick), NO funciona: lo probé y la pantalla sigue sin moverse, porque _atrasPorCodigo solo se enciende cuando corre el MutationObserver (un microtask después del classList.remove) y la espera se resuelve al instante. Hay que ceder un microtask antes de esperar. (2) La severidad es media, no alta. El aviso no bloquea nada (existe […]
- **Regla del skill:** error-recovery · focus-management (Forms & Feedback); «Error Placement / Focusable Error Summary» del buscador --domain ux
- **Arreglo:** 1) js/cotizador/proceso.js, irAPartida() (línea 933), solo JS, sin CSS ni tokens. Probado inyectándolo sin tocar el repo:

function irAPartida(id){
  $('faltmodal').classList.remove('show'); _faltSeguir=null;
  if(locked()&&Q.rol!=='autorizador') reabrir();
  /* Cerrar el aviso pide un history.back() asíncrono; su popstate devuelve el scroll sellado al abrirlo
     (nucleo.js, `if(porCodigo&&...)`) y pisa el salto. El MutationObserver que enciende _atrasPorCodigo
     corre en un microtask: se cede uno antes de esperar el popstate (tope 450 ms, ya incluido). */
  Promise.resolve().then(trasElAtrasDelCodigo).then(()=>llevarAPartida(id));
}

Resultado medido con esto inyectado: 390x844 desde solicitar() → scrollY=606, caja en top=70, foco en top=404..448 (dentro de pantalla); desde […]
- **Riesgo del arreglo:** Bajo. (a) Añade 10 a 25 ms de retraso entre el toque y el salto (el tiempo del popstate); si el popstate no llegara, el tope es de 450 ms y la prueba de precio-suelto.mjs espera 600 ms, así que queda justo pero dentro. (b) Conserva el orden que protege el comentario de nucleo.js:542 y SISTEMA-DE-DISENO.md:1392: el foco vuelve síncrono al cerrar el aviso y enfocarHueco() corre después, ya sin […]
- **Segunda opinión:** parcial (severidad media). Nota de entorno: el servidor 8777 estaba caído (la compu se apagó). Serví el repo en solo lectura con python http.server en el puerto 8861 (ya detenido) y usé el arnés con PUERTO=8861. No toqué el repo (git status: solo .claude/ sin seguimiento, que ya estaba).

REPRODUCCIÓN, SIN ARREGLO (Chromium del arnés, táctil con touchscreen.tap, aviso abierto desde el fondo de la página):
- 390x844 claro, Solicitar, partida 2 caja vacía: antes scrollY=2029; 2.8 s después de tocar .falt-ir scrollY=2027, […] Corrección: El fallo es real y lo reproduje por mi cuenta, pero el hallazgo tiene cuatro ajustes. (1) Severidad media, no alta: no hay pérdida de datos ni precio equivocado, el aviso tiene salida («Solicitar/Autorizar de todos modos») y el vendedor se recupera subiendo el scroll a mano. Pesa más que un fallo […]

### formularios-3 · [MEDIA] En teléfonos de 390 a 412 px la isla de estado parte la barra de arriba en 3 renglones y todo baja 51 px; la frase de «sin señal» solo la oye el lector de pantalla  
`formularios-3` · Formularios y retroalimentación · PARCIAL · esfuerzo M

- **Dónde:** css/sistema.css ~5057-5082 (.isla.ver, @media max-width:560px) y ~852-900 (.topbar-in móvil); js/cotizador/nucleo.js:666 _islaMostrar() y :737 pintarConexion()
- **Qué le pasa al usuario:** Cada vez que el vendedor autoriza desde el teléfono, o pierde señal en obra, el contenido salta 51 px justo cuando está mirando el resultado, y el encabezado pegado le quita ~13 % de la pantalla. Sin señal, lo único que ve es un icono ámbar de nube tachada: «se guarda aquí», que es lo que lo tranquiliza, no se lee.
- **Evidencia (verificador, medida por él):** Arnés Playwright, Chromium propio, táctil, tema claro, pantalla Partidas; el 8777 estaba caído, así que serví el repo (archivos de solo lectura) con un servidor estático propio en otro puerto, ya detenido. Fuentes Manrope/Sora cargadas. 
MEDIDO 390x844: barra 114 px en reposo → 165 px con la isla (ctx.setOffline(true)); #pasos top 126 → 177; #card-partidas top 206 → 257 (+51); --top-fijo se queda en 58 px y scroll-padding-top en 70 px; la barra pegada termina en y=109. Igual en 412x844 (114 → 165, +51, --top-fijo 58). 
CAUSA: en la segunda fila caben folio 98 + seg 156 + 2 botones de 44 + 3 huecos de 7 = 363 px de 366 disponibles (3 px de sobra); la isla pide 32+7, así que el botón de […]
- **Corrección al hallazgo original:** Lo central es real y lo reproduje con los mismos números. Lo que el hallazgo dice mal o exagera: (1) El arreglo 1 tal como se propone (bajar el flex-basis de .seg con :has(.isla.ver)) NO sirve: medido, mantiene la barra en 114 px pero el selector de rol se encoge a 117 px (390) y recorta «Autorizador» hasta «Auto». El selector de rol deja de ser legible, así que es peor que el problema. (2) El rango exacto es de unos 388 a 427 px de ancho (iPhone 390/393/402, Android 411/412, iPhone Plus […]
- **Ya cubierto por:** Solo en parte. docs/REVISAR-PAQUETE-UI.md, sección «Cotizador · cliente, folio e iconos», ficha [media] de pintarConexion/_islaFinal, punto 4: ya admite que en teléfono la frase no se lee y que no hay forma táctil de ver el rótulo (cubre solo esa parte del hallazgo). pruebas/navegador/cot-cliente.mjs (rondas a 360 y 420 px) sí vigila «la barra no se rompió», pero solo comparando el top del folio (líneas 335-339), así que a 420 px la barra crece 51 px y la prueba pasa igual; las pruebas que sí miden el alto de la barra (líneas 615-618 y 645-649) son de escritorio. A 360 px esa prueba ni podría notarlo porque la barra ya mide 165 px desde el reposo. El salto de 51 px, el --top-fijo viejo, el foco tapado y la falta de aviso al perder señal no están documentados ni vigilados.
- **Regla del skill:** content-jumping / layout-shift-avoid (Performance y Animation); offline-support; focus-not-obscured; «Toast Notifications» --domain ux
- **Arreglo:** Orden de preferencia, todo en teléfono (≤560 px) y solo para la isla:
1) css/sistema.css, sección «Cotizador · cliente, folio e iconos», dentro de la regla @media(max-width:560px) de la isla (~5075-5082; no hay @layer, y vidrio.css no toca .isla): sacar la isla del reparto de la fila para que no gaste ancho. Probado inyectado: `.topbar-in .isla.ver{position:absolute;margin:0;order:0;width:24px!important;height:24px}` y `.isla-ic` de 22 px, más el anclaje que hace JS en _islaMostrar (rama no ancha, js/cotizador/nucleo.js:~678): `isla.style.left=(folio.offsetLeft+folio.offsetWidth-14)+'px'; isla.style.top=(folio.offsetTop-12)+'px'` (insignia en la esquina superior derecha del folio, que sigue siendo role="status" y con su frase recortada para el lector). Resultado medido a 390 y a 412: […]
- **Riesgo del arreglo:** Arreglo 1: rompe dos comprobaciones de pruebas/navegador/cot-cliente.mjs línea 336-337 (la isla «a la derecha del folio» y «dy ≤ 8» respecto al centro del folio), que habrá que actualizar a «insignia pegada a la esquina del folio». La insignia de 24 px tapa ~2x2 px de la esquina de la última letra del folio (visto en captura); si el folio se hace más ancho o cambia de renglón en otro tamaño, el […]

### layout-2 · [MEDIA] El resumen con los botones de autorización es más alto que una laptop y los botones se hunden bajo el borde  
`layout-2` · Layout y responsive · PARCIAL · esfuerzo S

- **Dónde:** .side / #sidebox (css/sistema.css:1287 position:sticky; top:calc(var(--top-fijo)+12px)) sin max-height; .sum tiene overflow:hidden (l.1296)
- **Qué le pasa al usuario:** En una laptop de oficina (1366×768, 1280×720, o un 1080p con escala 125 %) la segunda vía de autorización, «Solicitar autorización a alguien más», y «Vaciar» no se ven hasta llegar al final de la página. Con una cotización larga, quien no es autorizador no encuentra su botón y piensa que no existe.
- **Evidencia (verificador, medida por él):** NOTA DE ENTORNO: el servidor de 8777 estaba caído (se apagó la compu); levanté el mío en 8793 (python http.server de solo lectura sobre el repo) y lo cerré al terminar. Todo en escritorio, tema claro, sin tocar el repo; scripts en scratchpad/uiux/ver-layout-2a/ (m1..m12.mjs).

REPRODUCE LO REAL. .side es position:sticky, top 80 px (--top-fijo 68 + 12), max-height:none, overflow:visible; .sum tiene overflow:hidden (css/sistema.css:1287 y :1313; vidrio.css solo pinta fondo y sombra de .side>.sum; ninguna otra regla toca overflow/max-height de .side).
Arnés paso «precio» (1 partida completa) con la página desplazada a 400: la columna mide 827 px a cualquier ancho de escritorio […]
- **Corrección al hallazgo original:** Real: la columna del dinero (.side/#sidebox) mide 827 px en el paso Precio con precio (no 766; 766 es el paso Partidas con la partida en blanco) y, pegada arriba, deja fuera «Solicitar autorización a alguien más» y «Vaciar» a 1366×768, y el botón principal en visores de menos de 758 px (un laptop «1366×768» real, ~650 de visor, 1280×720, 1536×864 al 125 %). Mal o exagerado: (1) «quien no es autorizador no encuentra su botón» es falso a 768: su botón principal es el primero del bloque y se ve […]
- **Ya cubierto por:** Parcialmente, solo para el teléfono acostado: css/sistema.css:1288-1306 suelta .side (position:static) con max-height:600px + landscape + pointer:coarse, por la misma causa. Para laptops de 650–760 px de alto no hay regla, ni prueba (pruebas/navegador/cot-precio.mjs solo hace sinDesborde/sinBucles sobre #sidebox y sus rondas de escritorio no bajan de 800 de alto), ni mención en docs/REVISAR-PAQUETE-UI.md ni en docs/SISTEMA-DE-DISENO.md (solo documentan .side{position:sticky;top:calc(3px + 78px)} y el panel pegado de 760–920).
- **Regla del skill:** ui-ux-pro-max 5 Layout & Responsive: fixed-element-offset, viewport-units (dvh) y scroll-behavior. UX «Overflow Hidden: hidden overflow can clip important content». Pro-rules: «Scroll and fixed element coexistence».
- **Arreglo:** Dos piezas, en este orden.
1) JS (1 línea) en js/cotizador/proceso.js, al inicio de renderAuth(): `const sb=$('sidebox'); if(sb) sb.dataset.estado=Q.estado;` (verificar que renderAuth corre en cada cambio de Q.estado; en mi prueba lo simulé con el mismo atributo).
2) CSS en css/sistema.css, capa base, justo después de `.side{position:sticky;…}` (l.1287) y antes del bloque landscape (l.1303; no chocan porque la guarda es min-height:601px). La especificidad (.side:not()>.sum) gana a `.sum{overflow:hidden}` (l.1313) sin depender del orden:
@media screen and (min-width:760px) and (min-height:601px){
  .side:not([data-estado="autorizada"]):not([data-estado="pendiente"]){display:flex;flex-direction:column;max-height:calc(100dvh - var(--top-fijo,74px) - 20px)}
  .side>#aiPreview{flex:none} […]
- **Riesgo del arreglo:** Receta original (la del revisor): tres regresiones medidas, no aplicarla tal cual: scrollbar-gutter:stable encoge .sum 6 px en todo escritorio y vuelve a envolver el rótulo del precio (+7 px, empuja el botón principal fuera a 1366×768); overflow en .side recorta la sombra de la tarjeta; overscroll-behavior:contain atrapa la rueda sobre la columna. Aplicada a todos los estados, deja «Generar PDF» […]
- **Segunda opinión:** parcial (severidad media). ENTORNO: el servidor de 8777 estaba caído (se apagó la compu). Levanté uno propio de solo lectura en 8794 (python http.server sobre el repo) y lo cerré al terminar. El repo quedó igual (git status solo muestra .claude/). Scripts y capturas en scratchpad/uiux/ver-layout-2b/ (m1..m15.mjs, lib.mjs).

SE REPRODUCE. Escritorio, tema claro, paso Precio con 1 partida completa, estado borrador, página en scroll 300–400 para que la columna esté pegada. Computado: .side position sticky, top 80 px […] Corrección: Es real pero acotado. REAL: en escritorio con visor corto (laptop 1366×768 con ~650 de visor, 1280×720, tabletas horizontales sin dock) la columna del dinero (.side) mide 827 px en el paso Precio con precio y, pegada arriba con sticky y sin tope, deja fuera «Solicitar autorización a alguien más» y […]

### layout-3 · [MEDIA] El teléfono del cliente se corta en iPhone (386–429 px) y el nombre también a 390  
`layout-3` · Layout y responsive · PARCIAL · esfuerzo S

- **Dónde:** #fld-tel y #fld-cli dentro de .grid2 (css/sistema.css:1063, dos columnas iguales); .tel-vivo .tel-vivo-in{padding-right:64px} (l.4546); el apilado a ancho completo solo existe en @media(max-width:385px) (l.6052)
- **Qué le pasa al usuario:** El teléfono es lo primero que se captura y con él se busca el cuaderno y se manda el WhatsApp. En el iPhone 12 a 15 (390–393 px) y en el 414 el vendedor no puede revisar los dos últimos dígitos sin tocar el campo, y un número mal tecleado pasa sin que nadie lo vea.
- **Evidencia (verificador, medida por él):** Medí yo mismo con el arnés (Chromium propio, móvil táctil, tema claro, cliente capturado con «33 1234 5678» y «Farmacia San Juan», campo sin foco). El servidor de 8777 estaba caído; levanté uno propio en el puerto 8977 sobre el repo y lo apagué al terminar. El repo quedó intacto (git status solo muestra .claude/, que ya estaba).

Estado actual, ancho útil del teléfono frente a los 94,2 px que pide «33 1234 5678»:
- 386 px: 86 px (corta 8,2)
- 390 px: 79 px (corta 15,2; se pierden unos dos dígitos)
- 393 px: 80 px (corta 14,2)
- 402 px: 85 px (corta 9,2)
- 412 px: 90 px (corta 4,2)
- 414 px: 91 px (corta 3,2)
- 420 px: 94 px (0,2)
- 428 px: 98 px (cabe)
- 430 px: 99 px (cabe)

A 320, 360, […]
- **Corrección al hallazgo original:** Lo central es real, pero tres cosas del hallazgo estaban mal. (1) El rango: el teléfono se corta de 386 a ~419 px, no hasta 429. A 420 px sobran 0,2 px (invisible) y de 428 px en adelante cabe. (2) El nombre: «Farmacia San Juan» mide 136,1 px; solo se corta en ~387-401 px (130 de 136 a 390). Cualquier nombre más largo («Ferretería El Roble SA») se corta en todos los anchos de una rejilla de dos columnas, así que no es parte de este fallo sino un límite general del campo. (3) El arreglo […]
- **Ya cubierto por:** Cubierto solo en parte, y no este hueco. pruebas/navegador/cot-cliente.mjs, sección «EL TELÉFONO SE VE COMPLETO (C8)», corre a 360 y 420 px: a 360 el campo está apilado y a 420 sobran 0,2 px. No mide scrollWidth contra clientWidth y no cubre 390 ni 393. La hoja de ~l.6046 documenta el apilado a ≤385 px, pensado para el Fold de 344 px, pero no mide 386 a 419. No está en docs/REVISAR-PAQUETE-UI.md.
- **Regla del skill:** ui-ux-pro-max 5 Layout & Responsive: compact-label-overflow (los valores esenciales deben seguir visibles) y breakpoint-consistency (hueco entre 385 y 561 que el propio CSS reconoce). UX «Truncation».
- **Arreglo:** Archivo: css/sistema.css, capa de cierre/estructura donde ya vive la pieza 19 (sección «19 · El teléfono que se ve completo»). Basta cambiar un número en la regla base, sin media query ni cambio de rejilla:

.tel-vivo .tel-vivo-in{padding-right:46px}   /* antes 64px */

Hay que actualizar también el comentario de esa sección («el campo le deja 64 px», ~l.4543) a 46 px y la razón: contador de 12 px de margen más unos 32 px del «12/10», más un respiro de 2 px. Tokens: no usa ninguno nuevo; es un valor de reserva propio de la pieza, igual que el 64 original.

Resultado medido (con la regla inyectada vía p.route en sistema.css): el teléfono cabe a 386 px y más, con 97 px útiles a 390 px; el contador ámbar «12/10» no pisa el texto; y de 320 a 385 px y en escritorio no cambia nada visible.

Si […]
- **Riesgo del arreglo:** Muy bajo. El selector .tel-vivo .tel-vivo-in solo lo usa #f-tel del cotizador (arranque.js) y el campo de la vitrina de pruebas (piezas-numeros-vitrina.js, P.telefonoVivoHTML). La plataforma (index.html) y el anidador no lo usan. Ninguna prueba mide el padding de 64 px; vidrio.mjs:190 mide otra cosa (.pf-cuenta de la plataforma). Podría romper:
- Si el contador crece a más de 5 caracteres (por […]
- **Segunda opinión:** parcial (severidad media). Medí con el arnés (Chromium propio, móvil táctil, tema claro, campo sin foco, cliente capturado con «33 1234 5678» y «Farmacia San Juan»). El servidor 8777 estaba caído: levanté uno propio en el puerto 8978 y lo apagué al terminar. git status del repo: solo .claude/, que ya estaba.

Ancho útil del teléfono (texto «33 1234 5678» = 94,2 px con Manrope 16 px, que sí carga de Google Fonts, el campo no usa Figtree):
- 386 px: 86 (le faltan 8,2). 390: 79 (faltan 15,2). 393: 80 (14,2). 402: 85 (9,2). […] Corrección: Lo central es real y lo reproduje por mi cuenta, pero el hallazgo exagera en tres cosas y su arreglo trae una regresión. (1) Rango: el teléfono se corta de 386 a 419 px; a 420 sobran 0,2 px (no se nota) y de 428 en adelante cabe; «hasta 429» sobra. (2) Nombre: «Farmacia San Juan» (136,1 px) solo se […]

### layout-4 · [MEDIA] En teléfonos de 360–375 px la barra pegada de arriba crece de 58 a 109 px  
`layout-4` · Layout y responsive · PARCIAL · esfuerzo M

- **Dónde:** .topbar-in .seg{order:6;flex:1 1 100%} en @media(max-width:385px) (css/sistema.css:6564 y repetido hacia l.6046); ajustarTopbarMovil() en js/cotizador/nucleo.js:173
- **Qué le pasa al usuario:** El Android más común (360) y los iPhone SE y mini (375) pierden 51 px de pantalla fija: 15 % del alto, que se suma al dock de 68 px. Con el teclado abierto casi no queda formulario a la vista. El rol se elige una vez y casi no se toca, así que ocupa un renglón pegado para nada.
- **Evidencia (verificador, medida por él):** Medí con Chromium propio (Playwright, tactil, movimiento reducido, tema claro), sirviendo el repo desde mi propio servidor estático en el puerto 8921, porque el 8777 estaba caído (ya lo detuve; el repo quedó intacto, git status solo muestra .claude/). Estado «precio», scroll 1000, rect de `.topbar` (bottom = alto pegado):

ESTADO BASE, en reposo: 320, 344, 360, 375, 384 y 385 px -> bottom 109 (top −56, alto total 165, --top-fijo 109). 386, 390 y 414 px -> bottom 58 (alto total 114). El acantilado 384/385 contra 386 queda confirmado. Los renglones a 360 son: marca (y 8–52), folio con Clientes e Historial (y 59–103) y selector de rol (y 110–156); los dos primeros ya no se pierden al […]
- **Corrección al hallazgo original:** El núcleo es real y exacto, pero el hallazgo se equivoca o se queda corto en cuatro puntos. (1) El impacto dice «pierden 51 px: 15 % del alto». Los 51 px son 6.9 % de una pantalla de 740 (6.3 % de 812, 9 % de 568); el 15 % es el alto TOTAL de la barra (109/740), no lo que se pierde. Con el dock, la pantalla útil pasa de 76 % a 83 % con el arreglo. (2) La cita «repetido hacia l.6046» es incorrecta: la regla duplicada está en css/sistema.css l.852 (`.topbar-in .seg{order:6;flex:1 1 100%}` dentro […]
- **Ya cubierto por:** Ninguna prueba lo vigila (grep de .topbar, roleseg, ajustarTopbarMovil y --top-fijo en pruebas/ no mide el alto pegado en teléfono; cot-cliente.mjs compara la altura de la barra con la isla solo en escritorio). No está listado en docs/REVISAR-PAQUETE-UI.md. No es decisión documentada: css/sistema.css l.835–851 y l.6560–6564 explican por qué el rol baja de renglón a ≤385 px, pero no justifican que ese renglón se quede pegado, y la hoja y docs/FUNCIONES.md l.47 tratan la altura pegada como recurso a cuidar.
- **Regla del skill:** ui-ux-pro-max 5 Layout & Responsive: fixed-element-offset, content-priority y breakpoint-consistency. UX «Fixed Positioning: account for other fixed elements».
- **Arreglo:** Tres piezas probadas juntas, más prueba y docs. Nada de esto está aplicado: no toqué el repo.

1) css/sistema.css, en el bloque de cierre de la l.6564 (justo antes de la CAPA 8, donde ya vive esa regla y gana por orden). Reemplazar `@media(max-width:385px){ .topbar-in .seg{order:6;flex:1 1 100%} }` por:
@media(max-width:385px){
  .topbar-in .seg{order:2;flex:1 1 100%}            /* el rol baja a su propio renglón, debajo de la marca, y se va con ella */
  .topbar-in .folio,.topbar-in .isla.ver{order:3}   /* folio e isla se quedan en el renglón útil, con Clientes e Historial (order:4 ya viene de l.888) */
}
Sin `.topbar-in .isla.ver{order:3}` la isla (order:2 de l.5079, anterior al selector en el árbol) quedaría sola en un renglón escondido. Quitar o igualar la regla duplicada de l.852 […]
- **Riesgo del arreglo:** Bajo. Solo afecta a cotizador.html (nadie más usa `.topbar-in`; index.html, plataforma y el anidador no se tocan, comprobado por grep). Riesgos concretos: (a) El selector de rol deja de estar a la vista al desplazar en ≤385 (se ve al subir al tope), consecuencia que la propia hoja ya acepta («se elige una vez»); `Autorizar yo mismo` no depende de él y Q.rol se conserva entre cotizaciones. En la […]

### layout-5 · [MEDIA] Los modales Clientes e Historial se quedan sin lista en horizontal, y la IA esconde su botón principal  
`layout-5` · Layout y responsive · PARCIAL · esfuerzo M

- **Dónde:** .hist-panel > #cua-body / #hist-body (css/sistema.css, bloque .hist-*; .hist-ayuda, .hist-foot, .foot-nota); #aimodal .modal-b (cotizador.html:523)
- **Qué le pasa al usuario:** Con el teléfono acostado, buscar un cliente o una cotización del historial muestra una franja de menos de una fila, y en «Cotizar con IA» hay que deslizar dentro del panel para llegar al botón que ejecuta. En el iPhone SE vertical (320×568) pasa lo mismo con ese botón.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído; usé un servidor estático propio de solo lectura en otro puerto (sirve los archivos del repo tal cual). Chromium propio, tema claro, movimiento reducido, táctil.

REPRODUCIDO (coincide con el revisor), historial vacío, aperturas con aiOpen/abrirHistorial/abrirCuadernos y clic real en #aibtn:
- 667x375: panel 325 px; cabecera 69, ayuda 45 (Clientes 28,5), buscador 71, pie 95,5–112; lista 42,5 px en Historial y Clientes. 844x390: 58 / 74. 740x360: 28 / 44.
- IA 667x375: .modal-b clientHeight 268, scrollHeight 488; botón «Analizar y cotizar» en y=483–529, visible 0/46 px. A 320x568: 451/553, botón 576–622, 0/46.

NUEVO, con 5 cotizaciones […]
- **Corrección al hallazgo original:** 1) El hallazgo se queda corto: midió con el historial vacío. Con historial de verdad (aparece la fila de fichas Todas/Sin PDF/Sin enviar/Sin venta/Este mes, 69 px) la lista del Historial en horizontal mide 0 px y el pie se sale del panel (26 px a 667x375, 11 a 844x390, 41 a 740x360). 2) El arreglo propuesto es incorrecto en tres puntos: (a) «.hist-body{min-height:120px}» sin condición empuja el pie fuera del panel, que tiene overflow:hidden. Con historial el pie queda recortado 74 px a 667x375 […]
- **Regla del skill:** ui-ux-pro-max 5 Layout & Responsive: orientation-support y breakpoint-consistency; UX «Breakpoint Testing» (320, 375, 414); Pro-rules checklist: «Verified on small phone ... portrait + landscape».
- **Arreglo:** Todo va en css/sistema.css, AL FINAL de la hoja (después del bloque «Detalles del teléfono y de la jerarquía», capa 8), porque gana por orden contra las capas 4 y el cierre táctil; no junto a .hist-*. Sin min-height en .hist-body y con consulta solo por alto (sin orientation:landscape, para que alcance también a 320x568, al Fold medio doblado y al marco empotrado):

@media(max-height:640px){
  .hist-ayuda,#cua-foot .foot-nota{display:none}
  .hist-head{min-height:0;padding-block:var(--e1)}
  .hist-search-bar,.hist-fichas,.hist-foot{padding-block:var(--e1)}
}
Con esto, probado, con historial: Clientes 162/177/147 px (667x375, 844x390, 740x360); a 320x568 pasa de 49 a 191 px en el Historial; a 390x562 de 76 a 201; a 360x520 de 34 a 159. Decisión de Elías: si además se oculta #hist-nota […]
- **Riesgo del arreglo:** Bajo para la media query de alto: solo se activa con alto ≤ 640 px; no toca 390x844 ni escritorio (verifiqué 390x844 y 1280x720 sin cambio). Usa solo --e1, así que hojas-de-estilo.mjs no debería quejarse; hay que correr contraste.mjs, vidrio.mjs y cot-historial.mjs (su alto es 740, no la activa, por eso no vigilan nada de esto). cotizador-flujo.mjs lee #hist-nota por textContent, no depende de […]

### layout-9 · [MEDIA] Al autorizar, la barra de arriba salta 51 px durante 2–3 segundos a 390–414 px  
`layout-9` · Layout y responsive · PARCIAL · esfuerzo S

- **Dónde:** #isla (pastilla «Sellada», js/cotizador/nucleo.js pintarConexion()) dentro de .topbar-in a 390 px
- **Qué le pasa al usuario:** En el momento más importante de la cotización, justo al tocar «Autorizar», la pantalla da un salto que desorienta. Con pulso temblón puede provocar un segundo toque accidental.
- **Evidencia (verificador, medida por él):** Arnés Playwright propio, servidor estático mío (el 8777 estaba caído), 390×844 táctil, claro y oscuro (idéntico). (a) Autorizar con llegarA('precio')+autorizarYoMismo()+autorizar(), muestreo por frame: topbar 114 px; a ~0,9 s («sellando») 165; sigue 165 en «ok» y «se-va»; vuelve a 114 a los ~3,8 s (≈2,9 s arriba). (b) Barrido de anchos, estado offline/pastilla visible: 320, 360, 375, 385 → 165 antes y durante (sin salto); 386, 390, 393, 402, 412, 414, 415, 416, 418, 420 → 114→165 (+51); 424 y 430 → sin salto (424 es borde: en otra corrida con otro ancho de folio sí saltó). (c) Causa: elementos del renglón 2 a 390: folio x=12 w=98, pastilla x=118 w=32, rol x=158 w=168, Clientes x=334 w=44; […]
- **Corrección al hallazgo original:** El salto es real, pero el hallazgo se queda corto y se equivoca en tres cosas. 1) No dura solo 2-3 s: con la hoja de mentiras midió 2,9 s al autorizar (con la hoja real suma lo que tarde en sellar), pero con «Sin señal» o «Esperando a Dirección» la barra se queda 51 px más alta TODO el tiempo que dure ese estado (medido +5 s sin cambio, y no vuelve hasta que regresa la señal). Eso sube la severidad de baja a media. 2) El rango no es 390-414 px: es 386 a ~425 px (en 385 y menos la barra ya es de […]
- **Regla del skill:** ui-ux-pro-max 3 Performance: content-jumping y layout-shift-avoid.
- **Arreglo:** Sacar la pastilla del reparto SOLO cuando no cabe, con la misma lógica de «¿cabe sin romper la barra?» que ya usa la isla a ≥561 px. 1) js/cotizador/nucleo.js, en _islaMostrar, justo después de `el.classList.add('ver')` (o al final de la función): si !_islaAncha() { const cab=document.querySelector('.topbar-in'); if(cab){ el.classList.remove('arriba'); const con=cab.offsetHeight; el.classList.add('arriba'); const sin=cab.offsetHeight; if(con<=sin) el.classList.remove('arriba'); } } else el.classList.remove('arriba'). Todo síncrono, sin pintar en medio. En _islaSiguiente añadir 'arriba' a la lista del classList.remove('ver','abierta','se-va'). 2) css/sistema.css, dentro del bloque @media(max-width:560px) de la isla (~línea 5075-5082, capa de cot-cliente, después de `.topbar-in […]
- **Riesgo del arreglo:** Medio-bajo. (1) Con la pastilla en el renglón de la marca, al hacer scroll sale de la vista junto con la marca (ese renglón no es el pegado): offline la señal solo se ve con la página arriba; el aviso de «Volvió la señal» ya sale como toast cuando la frase no se ve, y «Sellada»/«Dirección autorizó» se repiten en la propia pantalla, pero hay que decidir con Elías si le basta. La alternativa sin […]

### rendimiento-3 · [MEDIA] El código viaja con todos sus comentarios: 790 KB gzip que serían unos 313 KB, y lo mismo se descarga en cada actualización de la app  
`rendimiento-3` · Rendimiento percibido · PARCIAL · esfuerzo M

- **Dónde:** css/sistema.css (50,5 % comentarios), css/vidrio.css (74,2 %), js/piezas.js y js/cotizador/*.js, cotizador.html; publicación en GitHub Pages y Cloudflare Pages sin paso de compilación
- **Qué le pasa al usuario:** Cada primera visita y cada versión nueva descarga más del doble de lo necesario por señal móvil, y las hojas bloqueantes retrasan lo primero que se ve. Elías no pierde nada por minificar: las notas largas se quedan en el código fuente.
- **Evidencia (verificador, medida por él):** BYTES (reproducido con zlib y esbuild en mi carpeta; el servidor 8777 estaba caído, así que serví el repo con mi propio servidor estático con gzip 6): comentarios en sistema.css 275 878 de 546 556 caracteres (50,5 %) y en vidrio.css 74,2 %, idénticos a lo reportado. Lo que baja cotizador.html?solo=1 (html, 2 css, tema.js, qrcodegen, piezas.js y 13 guiones): 770 556 B gzip-9 que quedan en 311 947 B minificado (−59,5 %); con gzip-6 −59,5 %, con brotli-4 −58,9 %, con brotli-11 650 260 a 269 726 B (−58,5 %). El % se sostiene con el compresor de Cloudflare o el de GitHub. Precaché del service worker (118 entradas de APP_FILES+BASICOS): 7,86 MB crudos, 2,62 MB gzip, 1,61 MB minificado; casi 1 MB […]
- **Corrección al hallazgo original:** 1) Los números de bytes y de tiempo combinado son correctos (mi 8757 a 3068 ms y FCP 2524 a 1592 contra su 9393 a 4034 y 2524 a 1672), pero la mejora de tiempo se le atribuye entera a minificar y cerca de la mitad es del defer, que no necesita build: solo minificar da −31 % en 'app lista' y −37 % en FCP; solo defer da −41 % en 'app lista' (los 14 scripts están a mitad del cuerpo, cotizador.html:1093-1108, y bloquean el análisis del resto del HTML hasta que bajan y corren todos). El hallazgo […]
- **Ya cubierto por:** No hay prueba ni documento que vigile el peso del código o la minificación. Lo que sí existe es la decisión documentada 'sin build': insignia y texto en README.md:19 y :40, docs/INVESTIGACION-TECNICA.md (título y sección 'Cómo se carga sin build'), docs/SISTEMA-DE-DISENO.md ('Vanilla JS, sin build') e index.html:437. sw.js ya precachea todo el conjunto y lo sirve caché-primero, lo que atenúa el costo en el uso diario. Ninguna prueba (contraste, hojas-de-estilo, vidrio, etc.) cubre el tamaño transferido.
- **Regla del skill:** Performance: bundle-splitting / Bundle Size (monitor and minimize), critical-css; Performance/Caching
- **Arreglo:** Dos pasos, el primero sin build y sin decisión de proceso. (A) En cotizador.html agregar defer a los 14 <script src> de las líneas 1093-1108 (vendor/qrcodegen.js, js/piezas.js y los 13 de js/cotizador/); el orden se conserva y los 157 onclick en línea siguen viendo los globales porque los diferidos corren antes de DOMContentLoaded. Probado como variante en mi servidor: llega a 'listo' con 0 errores y camino-completo pasa; falta correr la suite completa de pruebas/navegador antes de publicar, y en una sola subida subir APP_VERSION en sw.js. Rinde −41 % en 3G rápido sin tocar el flujo de publicación. (B) Si Elías aprueba cambiar el proceso: script herramientas/empaquetar.mjs con esbuild que escriba una carpeta de salida con .js, .css (sistema, vidrio, plataforma) minificados y […]
- **Riesgo del arreglo:** Defer (A): cualquier script en línea futuro que llame a globales de los 14 archivos antes de que carguen quedaría antes que ellos (hoy no hay ninguno tras ellos salvo HTML), y la clase 'arrancando' y el esqueleto cambiarían de momento de salida: hay que correr cot-*.mjs y camino-completo (solo corrí camino-completo y arranque). Build (B): rompe la regla documentada 'sin build' (README, […]

### tactil-1 · [MEDIA] Hacer scroll con el pulgar sobre una etiqueta de medida cambia la cifra y el precio en silencio  
`tactil-1` · Táctil e interacción · PARCIAL · esfuerzo S

- **Dónde:** label.arrastrable «Altura (cm)», «# Letras», «# Piezas», «Ancho», «Alto» de cada partida · js/piezas.js empezarArrastre/mover (UMBRAL=4 en la línea 3664; líneas 3744-3745) · css/sistema.css:4480 (.arrastrable touch-action:pan-y)
- **Qué le pasa al usuario:** Un vendedor que baja la pantalla con el pulgar y pasa por «Altura» o «# Letras» puede subir una letra o medio centímetro sin darse cuenta, y el total cambia (+$2,200 en la prueba). Nadie lo ve hasta que el cliente pregunta por qué cuesta más.
- **Evidencia (verificador, medida por él):** Medido con arnés Playwright + CDP Input.dispatchTouchEvent, 390x844, tema claro, hasTouch, partida de letras acero 40 cm x 8 (total $17,600.00), etiqueta en el centro de la pantalla. Servidor 8777 caído a mitad de trabajo; levanté uno propio en otro puerto, de solo lectura, y lo detuve al terminar. El repo no se tocó (git status solo muestra .claude/ que ya estaba).

CÓDIGO CONFIRMADO: UMBRAL=4 (piezas.js:3664). mover() líneas 3743-3745: suelta solo si |dy|>10 y |dy|>|dx|; activa con |dx|>=4 SIN pedir dominio de eje; una vez activo nunca vuelve a mirar dy. pasoDeArrastre redondea (dx-4)/6, así que 7 px de lado ya son un paso. css/sistema.css:4480 touch-action:pan-y confirmado por […]
- **Corrección al hallazgo original:** Lo real: el arrastre de la etiqueta puede cambiar la medida mientras el navegador ya se llevó el gesto como scroll, y eso cambia el total. Lo que estaba mal o exagerado: (1) El «deriva 8 px» no es una deriva lineal. Una recta de 60 px hacia arriba que termina 8 px (o 12) al lado NO cambia nada; reproduje sus cifras exactas solo con un tirón lateral al inicio (primer movimiento 8 px de lado y 5 hacia arriba, luego recto hacia arriba), o con trazos rectos de 35° a 45° respecto a la vertical. Un […]
- **Ya cubierto por:** Parcialmente: pruebas/navegador/piezas-numeros.mjs:329-339 vigila el dedo que sube por la etiqueta (4 px de deriva sobre 160 px, 16 px por evento) y que el arrastre horizontal funciona; no ejercita diagonales, tirones laterales iniciales ni toques con temblor. El diseño de zona muerta de 4 px y touch-action:pan-y está documentado en el comentario de piezas.js:3639-3643 y css/sistema.css:4476-4479, pero ni docs/REVISAR-PAQUETE-UI.md ni docs/SISTEMA-DE-DISENO.md lo listan como limitación conocida.
- **Regla del skill:** gesture-conflicts / drag-threshold (ui-ux-pro-max, Touch & Interaction); search «gesture conflict swipe»
- **Arreglo:** Archivo js/piezas.js, sección «3 · Arrastrar sobre la etiqueta», dentro de empezarArrastre. Sin CSS, sin tokens, sin z-index.
1) En mover(), solo si ev.pointerType es 'touch' o 'pen' (el ratón se queda igual): mientras !activo, soltar(ev) si |dx|+|dy| >= 6 y |dy| >= 0.6*|dx|; no activar hasta |dx| >= 10 Y |dx| > 2*|dy|. UMBRAL=4 se queda para la zona muerta del valor ya activo (pasoDeArrastre(v0, dx - signo*UMBRAL)).
2) En soltar(), justo después de «if (!cambio) return;»: si ev.type==='pointercancel' y el puntero es táctil o de lápiz, revertir: input.value = String(v0); avisar(input,'input'); avisar(input,'change'); return. (pointercancel en un puntero táctil que se activó significa que el navegador se llevó el gesto como scroll, y un arrastre cancelado no debe dejar su valor; es la red […]
- **Riesgo del arreglo:** Afecta a todos los que usan arrastrarMedida o arrastrarMedidas porque comparten piezas.js: partidas (Altura, # Letras/Piezas, Ancho, Alto), Vectorizador (vt-alto-cm, vt-ancho-cm) y Escalador (sc-ref-cm-input, px:4), así como cualquier pantalla de la plataforma que enganche etiquetas arrastrables. Con ratón no cambia nada (el arreglo es solo táctil). En táctil: (a) el arrastre horizontal tarda en […]

### tema-3 · [MEDIA] Campos, botones secundarios e interruptores apagados se delimitan a ~1,3:1, y la app ignora «aumentar contraste» y «reducir transparencia»  
`tema-3` · Tema oscuro, vidrio y contraste · PARCIAL · esfuerzo M

- **Dónde:** css/sistema.css tokens --linea/--linea2 (capa 7 y 8) y .tg (l.3120); inputs, .btn-gho, .chip. css/vidrio.css .topbar, .mbar, .modal-bg. Sin reglas @media (prefers-contrast) ni (prefers-reduced-transparency) (solo .desenfoque-borde, sistema.css l.4292).
- **Qué le pasa al usuario:** Con el teléfono al sol, el contorno de un campo o de «Escalar» casi no se ve; quien activó «Aumentar contraste» en iPhone o en el sistema no recibe ninguna ayuda extra, y quien pidió menos transparencia sigue viendo barras y velos translúcidos.
- **Evidencia (verificador, medida por él):** Medí con Playwright propio (Chromium, contexto limpio, movimiento reducido; el servidor 8777 estaba caído y usé uno estático propio de solo lectura sobre el repositorio, ya detenido; los CSS servidos tenían el mismo md5 que los del repo). Viewports 390 (táctil) y 1440, temas claro y oscuro.

REPRODUCIDO. #f-cli: borde 1px rgb(220,223,242) sobre la tarjeta (compuesta ≈rgb(254,254,255)) = 1,31:1 en claro; oscuro rgb(47,53,98) sobre ≈rgb(25,28,54) = 1,44:1. Relleno del campo contra la tarjeta = 1,01:1 (blanco sobre blanco), sin sombra ni contorno: el filete es lo único que delimita el campo. Idéntico en #f-tel, #f-proy y todo campo del paso Cliente/Partidas. .btn-gho «Solicitar autorización […]
- **Corrección al hallazgo original:** 1) Los números y la ausencia de reglas @media (prefers-contrast) son ciertos (grep: cero coincidencias en css, js, html, pruebas y docs). 2) «Todo .btn-gho» es exagerado: «Vaciar y empezar cotización» es un .btn-gho de solo texto con borde transparente y sin relleno; sí tienen el filete de 1,31:1 «Solicitar autorización…», «Escalar» y el resto de los .btn-gho con borde. 3) «La app ignora reducir transparencia» no es del todo cierto: ya hay una regla en sistema.css (.desenfoque-borde, @media […]
- **Regla del skill:** color-accessible-pairs (el filete que identifica un control también pide 3:1, WCAG 1.4.11) / state-clarity (ui-ux-pro-max)
- **Arreglo:** Parte A (alta confianza, la que importa; css/sistema.css, final del archivo, capa 8 y DESPUÉS del bloque html[data-tema="oscuro"], sin tocar --linea2):
@media (prefers-contrast:more){
  :root,html[data-tema="oscuro"]{--linea:var(--n5)}
  .chip[aria-disabled="true"].on{background:var(--n3)}
  .tg:not(.on){background:var(--n5)}
}
Por qué así: --n5 es el escalón de la rampa que el propio sistema reserva para filetes y no lleva texto; resuelve solo por tema (claro #8b90b8, oscuro #6f76a8) y se pone también en el selector del tema oscuro porque ese bloque tiene mayor especificidad que :root. No se toca --linea2 (renglones internos, no son frontera de control y se usa de relleno bajo texto). La línea del .chip congelado fija ese relleno al valor de siempre (--n3). Probado inyectado con […]
- **Riesgo del arreglo:** El arreglo ORIGINAL (--linea2:#b9bede y --linea:#8b90b8/#6f76a8) no debe aplicarse: deja ilegibles el material elegido de una cotización autorizada (1,94:1) y el número de las partidas ocultas del PDF (2,7:1). El arreglo corregido (Parte A) puede afectar a todo lo que lea --linea o --line (alias): bordes de ~36 piezas del paso Precio, .prog-track, el riel de pasos, .cal-ev.off (plataforma.css […]

### tipocolor-1 · [MEDIA] En teléfono y tableta, lo que más se toca queda con letra más chica que en escritorio  
`tipocolor-1` · Tipografía, color e íconos · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css, bloque @media(max-width:560px): .partida .tipo-seg button (font-size:10.5px, ~línea 2580), .optgrp .chip (11.5px) y .optgrp .chip small (10.5px) (~2601-2602), .hintnote (11px, ~2519). Y el bloque @media(561–920px): .optgrp .chip, .chip small y .tipo-seg button (~6108-6110).
- **Qué le pasa al usuario:** El vendedor en obra, al sol y con una mano, elige el material, la luz y el tipo de letra con las etiquetas más pequeñas de toda la app, justo en el control que decide el precio. Los precios del material (10.5 px) son los números que le cuenta al cliente y son los más difíciles de leer.
- **Evidencia (verificador, medida por él):** Arnés Playwright propio, servidor estático mío en :8842 (el de :8777 estaba caído), tema claro, movimiento reducido, tactil por debajo de 700 px, paso Precio con partida de letras (acero inox, 40 cm, 8 letras). Reproducción de tamaños (computed font-size): botones de tipo 10,5 px a 320, 360, 390, 430 y 560, y 11,5 a 600/768 (12,5 a 1024/1440); chips 11,5 px de 320 a 768 (14 px a 1024/1440); precio dentro del chip (small) 10,5 px hasta 768 (11,67 a 1024/1440); hintnote 11 px hasta 768 (12,5 a 1024/1440). Alto de los botones de tipo: 40 px en ≤560 (la hoja ya lo asume y lo comenta). Las líneas citadas por el revisor (2519, 2580, 2601-2602, 6108-6111) son correctas y no las anula otra capa: […]
- **Corrección al hallazgo original:** Los tamaños son reales y los reproduje, pero el hallazgo exagera y se equivoca en varias cosas. (1) La severidad: no es alta, es media. El visor puede hacer zoom (el viewport de cotizador.html no bloquea zoom), el contraste de esas etiquetas pasa con holgura (precio del chip 6:1 en claro y 7,45:1 en oscuro; botón de tipo sin elegir 6:1 y 7,45:1), los chips miden 44 px de alto y ocupan el ancho completo, y el elegido se distingue por palomita y relleno, no por la letra. (2) «Las etiquetas más […]
- **Ya cubierto por:** Parcialmente: docs/SISTEMA-DE-DISENO.md y sistema.css ~125-135 ya dicen que los tamaños intermedios (10,5, 11,5) deben caer al escalón más cercano, y el comentario de sistema.css ~2566-2578 reconoce que el 10,5 px de los botones de tipo ni siquiera es un escalón de la escala; es deuda de ese cierre y no está listada en docs/REVISAR-PAQUETE-UI.md. Ninguna prueba vigila el tamaño de letra de estos controles (contraste.mjs solo mide color de '#items .chip.on' y de un chip sin elegir). El comentario sobre .partida .tipo-seg y la plataforma (sistema.css ~2571-2578) ya documenta por qué esa regla se acotó a .partida.
- **Regla del skill:** readable-font-size (mín. 16 px de cuerpo en móvil), font-scale / «Font Size Scale» (escala consistente), touch-density
- **Arreglo:** Todo en css/sistema.css, en la capa donde ya viven esas reglas (los dos bloques de teléfono: @media(max-width:560px) y el de 561 a 920 px), sin tocar tokens ni la sombra, y acotado al cotizador. (a) Botones de tipo, en el bloque ≤560 px, línea ~2580, cambiar font-size:10.5px por var(--t2) (12,5 px) en .partida .tipo-seg button. Opcional pero medido y seguro: añadir font-family:inherit a esa misma regla para que usen la fuente de la app y no Arial. (b) Chips, SOLO de 360 px para arriba: añadir un bloque nuevo @media(min-width:360px) and (max-width:560px){.optgrp .chip{font-size:var(--t3)} .optgrp .chip small{font-size:var(--t1)}}. Por debajo de 360 px (la portada del Fold mide 344, y a 320/340 las filas de Iluminación y Complejidad se parten) los chips se quedan en 11,5 y 10,5: ahí un […]
- **Riesgo del arreglo:** Bajo, con tres puntos a vigilar. (1) Por debajo de 360 px cualquier alza de los chips rompe el renglón (letras +44 a +65 px a 320-344 px): por eso el arreglo lo deja fuera; si alguien copia la propuesta original sin ese corte, el Fold cerrado (344) pierde un tercio de pantalla extra por partida. (2) Acotar con .partida en el bloque 561-920: si no, .tipo-seg button también cambia las tiras de […]
- **Segunda opinión:** parcial (severidad media). Arnés Playwright propio; el servidor :8777 estaba caído (código 000) y serví el repo en solo lectura con python en :8851. Tema claro, movimiento reducido, táctil bajo 1000 px, paso Precio (acero inox, 40 cm, 8 letras) o Partidas, medido con getComputedStyle y getBoundingClientRect, sin editar el repo.
TAMAÑOS (reproducidos, anchos 320, 344, 360, 375, 390, 430, 560, 600, 768, 1024, 1440): `.partida .tipo-seg button` = 10,5 px en Arial de 320 a 560 (alto 40 px), 11,5 px a 600 y 768, 12,5 px a […] Corrección: Lo real: los tamaños. Lo exagerado o equivocado: (1) Severidad: no es alta. El contraste pasa, los chips miden 44 px de alto y el ancho casi completo, el elegido se distingue por relleno y palomita, y el visor puede hacer zoom. Es deuda de la escala de siete tamaños, no un bloqueo para vender. (2) […]

### tipocolor-2 · [MEDIA] Tras autorizar, el precio y la palomita del material elegido quedan casi invisibles  
`tipocolor-2` · Tipografía, color e íconos · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css: .chip.on small, .partida .chip.on small y .chip.on .ck, .partida .chip.on .ck (~2942-2943) ganan por orden a .chip[aria-disabled="true"].on small / .ck (~1143-1144). La opacidad .75 viene de ~1130. Afecta a chips elegidos de cualquier partida con captura bloqueada.
- **Qué le pasa al usuario:** Al revisar una cotización ya autorizada, antes de mandarla, el vendedor no puede leer la tarifa del material elegido ni ver el ✓. La información se ve mal justo cuando ya no se puede cambiar.
- **Evidencia (verificador, medida por él):** Servidor 8777 caído (ERR_CONNECTION_REFUSED); levanté un servidor estático propio en el puerto 8952 sirviendo el repo en solo lectura y lo apagué al terminar (git status del repo: solo el ?? .claude/ previo). Arnés con llegarA('autorizada'), 0 errores de consola. ANTES, claro, 390x844 táctil y 1440x900, 3 chips elegidos y bloqueados (Acero Inoxidable $55, Fría 6500K, Recta +$0), fondo rgb(220,223,242): nombre del chip rgb(92,97,132) = 4,54:1; <small> rgb(255,255,255) con opacity .75 = 1,24:1; .ck rgb(255,255,255) = 1,32:1. Oscuro (390 y 1440), fondo rgb(47,53,98): nombre 5,27:1, <small> 7,31:1, .ck 11,62:1, o sea no falla, como dijo el revisor. Causa por computed style y cascada: […]
- **Corrección al hallazgo original:** El defecto es real y los números del revisor se reproducen exactos; lo que exagera es la severidad y el alcance del daño. (1) No queda «casi invisible el precio y la palomita del material» como pérdida de información: el nombre del material sí se lee (4,54:1) y la tarifa $55 se repite legible en la línea de fórmula de la misma partida («$55 ($55) × 40cm × 8»); la palomita es redundante con el fondo y el borde del chip elegido. Es un fallo de contraste de texto secundario, no información […]
- **Regla del skill:** color-accessible-pairs (4.5:1), contrast-readability, «Color Contrast»
- **Arreglo:** En css/sistema.css, inmediatamente después de la línea ~2945 (la regla `.chip[aria-disabled=\"true\"].on{background:var(--linea);color:var(--tinta2);…}`, misma sección del paquete de UI, sin tocar vidrio.css), añadir: `.chip[aria-disabled=\"true\"].on small,.chip[aria-disabled=\"true\"].on .ck,.partida .chip[aria-disabled=\"true\"].on small,.partida .chip[aria-disabled=\"true\"].on .ck{color:var(--tinta2);opacity:1}`. Probado sin tocar el repo (el CSS insertado en esa línea exacta, servido por route de Playwright): en claro 390 y 1440, <small> y .ck pasan a 4,54:1 (igual que el nombre, el apagado se sigue haciendo con color y no con opacidad); en oscuro 390 y 1440 quedan en 5,27:1 (antes 7,31 y 11,62: el chip bloqueado se ve algo más apagado, coherente con «no se puede cambiar» y aún […]
- **Riesgo del arreglo:** Bajo. Los selectores solo coinciden con chips elegidos Y con aria-disabled=\"true\", que solo genera chip() en partidas.js cuando capturaBloqueada() (autorizada o faltan datos del cliente) y los chips con `libre` (plazo de taller) nunca llevan aria-disabled; no toca chips activos ni los no elegidos. Por especificidad (0,3,1 y 0,4,1) y orden gana a ~1130 y ~2942; ninguna regla posterior que retiña […]
- **Segunda opinión:** parcial (severidad media). Mi servidor estático propio en 8963 (el 8777 estaba caído; lo apagué al terminar; git status del repo: solo el `?? .claude/` previo). Arnés con llegarA('autorizada'), 0 errores de consola.

ANTES, getComputedStyle más mezcla de opacidad, chips `#items .chip[aria-disabled="true"].on` (Acero Inoxidable $55, Fría 6500K, Recta +$0), fondo rgb(220,223,242) en claro:
- 390x844 táctil y 1440x900, claro: nombre rgb(92,97,132) = 4,54:1; `<small>` rgb(255,255,255) con opacity .75 = 1,24:1; `.ck` blanco = […] Corrección: El defecto es real y los números se reproducen idénticos, pero el hallazgo exagera dos cosas. (1) Severidad: no es «alta». El nombre del material sí se lee (4,54:1 en claro). El chip elegido bloqueado sigue marcado por el relleno lila, el borde azul y el peso 600. La tarifa «$55» se repite legible […]

### a11y-4 · [BAJA] En tema oscuro tres textos de apoyo bajan de 4,5:1 y la prueba de contraste nunca corre en oscuro  
`a11y-4` · Accesibilidad · PARCIAL · esfuerzo S

- **Dónde:** `.brand .t small` (css/sistema.css ~547, color --tinta3); `#prog-next` / `.prog-next{color:var(--brand)}` (~1852); `.entrega-riel .riel-nota` (~4840, --tinta3). El valor oscuro de --tinta3 vive en ~6282 (`#8b92c0`). Prueba: pruebas/navegador/contraste.mjs.
- **Qué le pasa al usuario:** De noche o con poca luz, el aviso que dice qué falta por capturar y el teléfono al que se manda el WhatsApp se leen con esfuerzo; el vendedor que usa el modo oscuro es quien lo nota.
- **Evidencia (verificador, medida por él):** Lo reproduje con el arnés, midiendo píxeles como contraste.mjs (rasterizo cada pieza a ×3 y cuento colores). Tema oscuro, 1440×1000, estados cliente/partidas/precio/autorizada. El servidor 8777 se cayó a media revisión; levanté uno propio en el puerto 8791 sin tocar el repo (git status solo muestra .claude/ sin seguimiento).

Medido en oscuro a 1440:
- Subtítulo «Anuncios Luminosos 3D» (.brand .t small, 12,5/400): 4,24:1, rgb(139,146,192) sobre rgb(46,49,73).
- «Falta la dirección ›» (#prog-next, 11/700): 4,33:1, rgb(109,134,255) sobre rgb(39,42,68).
- Nota del riel (.riel-nota, 11/500): pendiente «a +52 33 1234 5678» 4,28:1; actual «elige «Guardar como PDF»» 4,21 a 4,28:1; hecha «PDF […]
- **Corrección al hallazgo original:** Lo que está bien: las tres cifras del hallazgo se reproducen (4,24 / 4,33 / 4,28), la causa de fondo es real y el arreglo funciona. Lo que había que corregir:

1) «La prueba de contraste nunca corre en oscuro» es cierto solo de contraste.mjs, que mide únicamente claro y a 1440. cot-partidas.mjs sí mide `#prog-next` en oscuro (rondas 2 y 4, 360 y 420 px), pero con un helper que compone backgroundColor y no ve el degradado de vidrio. Da 5,12:1 donde los píxeles dan 4,33, o sea un falso verde. El […]
- **Ya cubierto por:** Parcialmente y mal: cot-partidas.mjs mide #prog-next en oscuro (rondas 2 y 4) con un helper ciego al degradado y da 5,12:1, un falso verde. contraste.mjs lo cubre solo en claro. docs/SISTEMA-DE-DISENO.md línea 126 y el comentario de sistema.css ~6277 afirman 5,48:1 de --tinta3 sobre --sup, cierto sobre fondo plano pero no sobre el vidrio de .sum y .topbar. REVISAR-PAQUETE-UI.md no lo lista como limitación conocida.
- **Regla del skill:** color-contrast / color-accessible-pairs (4,5:1); color-dark-mode «test contrast separately»; WCAG 1.4.3 (AA).
- **Arreglo:** Tres cambios en css/sistema.css y dos en pruebas. Probados inyectando el CSS con addStyleTag, sin editar el repo.

1) css/sistema.css, bloque «(7) TEMA OSCURO», ~6282: `--tinta3:#959cc6;`. Actualizar el comentario (~6277–6282) y docs/SISTEMA-DE-DISENO.md línea 126. Los números nuevos son 6,13:1 sobre --sup plano y 4,6 a 4,8:1 sobre el vidrio real. Hay que decir en el comentario que el vidrio denso levanta la superficie. Medido con el arreglo en oscuro: subtítulo 4,77; riel 4,74 a 4,82; auth-divider 4,60 (el margen más justo).

2) Azul de «qué sigue» y del porcentaje. `.prog-next` (~1852) y `#prog-pct` (~1856) usan var(--brand). Lo más seguro es limitarlo a oscuro, en la sección 7 de sistema.css: `html[data-tema="oscuro"] :is(.prog-next,#prog-pct){color:var(--a-tx)}`. Da 7,32:1. La […]
- **Riesgo del arreglo:** --tinta3 oscuro lo usan unas 40 reglas de sistema.css y se hereda en index.html y el anidador; todo se aclara ~7 %.
- El anidador y el resto de la suite siguen en verde con el cambio (67/67 en oscuro).
- La jerarquía --tinta2/--tinta3 baja de 1,37 a 1,21 en razón de luminancia. En claro ya es 1,21, así que se conserva la jerarquía del tema claro, pero queda menos marcada en oscuro. A ojo, la […]

### a11y-5 · [BAJA] En Alto contraste de Windows desaparecen los interruptores y la barra de completitud  
`a11y-5` · Accesibilidad · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css `.tg`/`.tg::after` (~3120) y `.tg.on`, `.prog-track`/#prog-bar (~1857, 3499), `.seg button.on`, `.tipo-seg button.on` (~2974). No existe ningún `@media (forced-colors: active)` en css/*.css (grep: solo hay prefers-reduced-transparency).
- **Qué le pasa al usuario:** Un compañero que use Alto contraste en su PC de oficina no ve si IVA o «Con iluminación» están prendidos ni cuánto lleva de completitud; tampoco sabe qué rol o tipo de partida tiene elegido más allá de la negrita.
- **Evidencia (verificador, medida por él):** Medido con Chromium propio de Playwright (forcedColors:'active'), 1440×900, estado «precio», temas claro y oscuro. El servidor 8777 se cayó a media sesión; seguí en un servidor de solo lectura en otro puerto, que cerré al terminar, sin tocar el repo.

1. Reproducido. Paleta clara: `#ivatg` (32×18) tiene fondo rgb(255,255,255) y su recorte tiene 1 color (255,255,255), igual que el fondo. `.prog-track` (246×8) y `#prog-bar` también dan 1 color. Paleta oscura: todo en rgb(0,0,0). En modo normal el mismo recorte tiene colores azules y blancos (rgb 64,96,248), o sea que sí hay señal sin forzados.
2. Segmentados: `.seg` y `.tipo-seg` conservan su marco (borde forzado a CanvasText). `.on` y […]
- **Corrección al hallazgo original:** Lo central es real: no existe ningún @media (forced-colors) en css/*.css (grep sobre todo el repo, sin resultados), y ninguna prueba ni doc lo vigila. Pero el hallazgo exagera y se equivoca en tres cosas. (1) «Un solo color» se queda corto: ese color es el mismo que el fondo de la página (blanco en paleta clara, negro en la oscura), así que el interruptor y la barra desaparecen por completo, no solo se aplanan; junto a la etiqueta queda un hueco. (2) El impacto está inflado porque casi todo […]
- **Regla del skill:** color-not-only / color-not-decorative-only; state-clarity; system-controls; WCAG 1.4.11 y 1.4.1 en modo de colores forzados.
- **Arreglo:** Un solo bloque nuevo al FINAL de css/vidrio.css, como sección 9, la capa que gana (no mover la hoja: hojas-de-estilo.mjs vigila el orden). Comentario obligatorio dentro del bloque: aquí se rompe a propósito la convención de «selectores de una clase» porque hay que igualar la especificidad de las reglas que anulan. Solo colores de sistema, sin hex ni tokens nuevos, sin `:hover`:

@media (forced-colors: active){
  /* interruptores: el contorno es outline, que no cambia la caja; con border la perilla se mete bajo el borde */
  .tg{outline:1px solid CanvasText;outline-offset:0}
  .tg::after{background:CanvasText}
  .tg.on,.partida .tg.on,.switch:disabled .tg.on{background:Highlight}
  .tg.on::after{background:HighlightText}
  /* barra de completitud */
  .prog-track{outline:1px solid […]
- **Riesgo del arreglo:** Bajo. El bloque no se aplica fuera de forced-colors: medido idéntico en 390 px, claro y oscuro. Tres puntos a vigilar. (a) Compartido: vidrio.css lo cargan cotizador.html, index.html, el anidador y las tres páginas públicas, y `.seg button.on` existe en la plataforma. Por eso `.pf-lat-rol .seg button.on` va incluido; sin él el rol activo del sidebar desaparece en paleta clara (reproducido). […]

### a11y-6 · [BAJA] Un campo obligatorio vacío solo se marca con color: el mensaje desaparece a los pocos segundos  
`a11y-6` · Accesibilidad · PARCIAL · esfuerzo M

- **Dónde:** .fld.falta (css/sistema.css 1072-1075) en #fld-tel, #fld-cli, #fld-proy; mensaje en el toast de continuarAPartidas() (js/cotizador/nucleo.js/partidas.js) y en #vozAlert.
- **Qué le pasa al usuario:** En el teléfono, si el aviso se tapa o el vendedor mira a otro lado, solo ve dos casillas amarillentas; quien no distingue el ámbar del blanco (daltonismo, pantalla con brillo bajo al sol) no sabe cuál falla ni por qué. Para lector de pantalla está bien resuelto.
- **Evidencia (verificador, medida por él):** Reproducido con el arnés (Chromium propio, es-MX), pasos: se escribe solo el cliente, se pulsa «Continuar a partidas» (en teléfono es el botón del dock #mbar) y se mide a 0,3 s, 2,5 s, 4,8 s, 6,8 s y 8,8 s.

LO QUE SÍ SE CONFIRMA
- A 390x844 claro, a 0,3 s hay tres avisos: el toast «Antes de capturar partidas faltan el teléfono del cliente y el proyecto.», el rótulo del botón «Faltan 2 datos» y #vozAlert. A 4,8 s el toast ya no está (dura 4,6 s según proceso.js:1041). El rótulo del botón dura 1,5 s (proceso.js:1062).
- Pasados 6,5 s, recorrí todo el texto realmente visible: solo queda el contador «0/10» (span.tel-cuenta, gris neutro rgb(102,109,155), aria-hidden). Cero textos de error junto […]
- **Corrección al hallazgo original:** El hecho central se confirma: pasados ~5 s no queda ningún texto visible junto a los campos que diga qué falta, salvo el contador «n/10» sin mensaje de error. Lo que el hallazgo exagera:
(a) La severidad: baja, no media, por las razones de la evidencia, sobre todo asterisco permanente, foco al hueco y borde de 3,2:1.
(b) Que la persona con daltonismo «no sabe cuál falla»: el borde cambia de luminosidad. En acromatopsia el campo se distingue, aunque parece desactivado, y en deuteranopia se ve […]
- **Ya cubierto por:** Parcialmente, y solo en lo programático y en lo temporal:
- Para lector de pantalla: aria-invalid, aria-required, aria-describedby y el foco al primer hueco (proceso.js:1023 y 1048), más #vozAlert role=alert (cotizador.html:1088). Lo vigila cot-cliente.mjs:308-309, pero solo la clase y el atributo.
- Texto visible solo por un rato: el toast (4,6 s), el rótulo «Faltan 2 datos» del botón (1,5 s, proceso.js:1052-1063) y las esquinas ámbar de senalarLlegada (partidas.js:1475). No queda texto visible permanente. Ninguna prueba ni doc lo exige.
- Permanente: el asterisco ámbar de la etiqueta (sistema.css:1072), la etiqueta, el relleno y el borde ámbar, y el contador «n/10» del teléfono, que no dice «falta» y solo se pone ámbar con dígitos de más.
- Ninguna decisión documentada rechaza el texto bajo el campo. El comentario de cotizador.html:332 solo rechaza un párrafo estático siempre visible. SISTEMA-DE-DISENO.md §2.4 y la línea 15 describen el estado «falta» como color más ficha, y en este formulario falta la ficha.
- **Regla del skill:** color-not-only / Color Only (skill ux); error-placement y error-clarity («mensaje específico debajo del campo, con aria-describedby»); WCAG 1.4.1 y 3.3.1.
- **Arreglo:** Sí vale la pena, es pequeño y alineado con el sistema. Se probó inyectando CSS y DOM sin tocar el repo, a 390 px claro y oscuro.

1) cotizador.html, líneas 321, 322 y 331: añadir como ÚLTIMO hijo de cada .fld un `<small class="fld-err" id="err-tel"></small>` (también err-cli y err-proy), VACÍO. No dentro de .tel-vivo, porque su contador absoluto se descentraría. Sumar el id al aria-describedby estático («hint-oblig err-tel»). Una descripción vacía no se lee, y Piezas.telefonoVivo (piezas.js:4345-4346) ya anexa su id al final sin pisarlo.

2) js/cotizador/proceso.js, pintarObligatorios() (línea 1017, ya corre en cada tecla vía updProg): dentro del forEach, escribir el texto cuando `mal` y vaciarlo si no, solo si cambió. Textos: tel vacío «Falta el teléfono», tel incompleto «Faltan N […]
- **Riesgo del arreglo:** Bajo.
- Clase nueva .fld-err sin colisiones: no existe en css, js, cotizador.html, index.html, docs ni pruebas. Los ids err-tel/err-cli/err-proy tampoco aparecen en otro html o js, salvo copias dentro de .claude/worktrees.
- Es solo estado de error: no hay texto fijo nuevo. El comentario de cotizador.html:332-335 explica que quitaron un párrafo estático por repetido («la tercera vez»); esto […]

### a11y-7 · [BAJA] En el teléfono, los nombres de material y sus precios van a 10,5 y 11,5 px, más chicos que en escritorio; todo el texto está en px  
`a11y-7` · Accesibilidad · PARCIAL · esfuerzo M

- **Dónde:** css/sistema.css `.optgrp .chip{font-size:11.5px}` y `.optgrp .chip small{font-size:10.5px}` (~2601-2602 y ~6108-6109, ≤560 px) que anulan el `.chip{font-size:13px}` de ~796; tokens --t1..--t7 (~135) en px.
- **Qué le pasa al usuario:** Elegir material, color de luz y complejidad es el corazón de la cotización y se hace con el teléfono en una mano y bajo el sol; esos rótulos y los precios por m² son los más chicos de toda la pantalla y se leen mal para ojos cansados o con presbicia.
- **Evidencia (verificador, medida por él):** Medido con el arnés Playwright (Chromium propio), `movimientoReducido:true`, con getComputedStyle y getBoundingClientRect. Fuente real cargada: Manrope (`document.fonts`). 

A) 390 px, claro y oscuro, partida de letras: `#items .chip` 11,5 px (peso 500), `small` 10,5 px, `.tipo-seg button/.sm` 10,5 px, `.plano-b`, `.imgs-ayuda`, `#prog-next` y `.hintnote` 11 px, `.optgrp-t` 12,5 px, campos 16 px. 

B) Por ancho (chip/small): 360 y 390 dan 11,5/10,5; 561, 700, 773, 832 y 920 dan 11,5/10,5; 921 y 1100 dan 14/11,67. La banda 561-920 es donde vive la regla de ~6108, no ≤560. 

C) Layout a 390: los 5 chips de material miden 270×44 (una fila cada uno; el `calc(50% - 3px)` no los junta porque el […]
- **Corrección al hallazgo original:** Lo real: a 390 px (claro y oscuro) `#items .chip` mide 11,5 px, su `small` de precio 10,5, y `.tipo-seg .sm` 10,5. A 1440 el chip es 14 px y el precio 11,67. Todo está en px: 133 `font-size:…px` en sistema.css y ningún `font-size` en rem. Lo exagerado o equivocado: (1) El dónde. Las líneas ~6108-6109 NO son de ≤560 px: están dentro de `@media screen and (min-width:561px) and (max-width:920px)` (Fold 6 abierto y tabletas). Ahí el chip también sale a 11,5/10,5 aunque sobra espacio (chips de 259 a […]
- **Ya cubierto por:** No está cubierto por ninguna prueba ni decisión documentada. docs/SISTEMA-DE-DISENO.md línea ~907 documenta `.chip{font-size:13px}` en ≤920 px, y las reglas de 11,5 px de ~2601 y ~6108 la anulan. Pruebas: contraste.mjs mide color, no tamaño; plegable.mjs, vidrio.mjs y las demás no fijan font-size de chips. docs/REVISAR-PAQUETE-UI.md no lo menciona.
- **Regla del skill:** readable-font-size y dynamic-type (skill quick-reference); font-scale; WCAG 1.4.4 Cambio de tamaño del texto (se cumple con zoom, no con el ajuste de fuente).
- **Arreglo:** Solo en css/sistema.css, editando en su sitio (mismos selectores, misma capa; no hace falta regla nueva): 
1) Bloque `@media(max-width:560px)` (~línea 2601-2602, «Opciones en dos columnas»): `.optgrp .chip{...;font-size:13px;line-height:1.25}` y `.optgrp .chip small{font-size:11.5px}`. Aparte, `.tipo-seg button{font-size:11.5px}` en ese mismo ≤560 (cabe a 320 px: 41 de 47 px; no más, 12,5 ya no cabe). 
2) Bloque `@media screen and (min-width:561px) and (max-width:920px)` (~6108-6109, el comentario de arriba dice «que cada uno mida lo que dice»): `.optgrp .chip{...;font-size:13px}` y `.optgrp .chip small{font-size:11.5px}`. Esto corrige además el salto 11,5 a 14 px en 920/921 px. 
3) Actualizar docs/SISTEMA-DE-DISENO.md (fila de 561-759 y la de 560, líneas ~916 y ~919) para que citen […]
- **Riesgo del arreglo:** Bajo para el punto 1-3. En medición: sin cambio de altura a 360-414 salvo +4 a +9 px en el grupo «recorte» (un chip pasa a 2 líneas), sin desbordes, sin scroll horizontal. A 320 px el bloque de letras crece 17 px y el de recorte 45 px. Efecto en la jerarquía: el chip (13 px, peso 500) quedaría un poco más grande que el rótulo del grupo `.optgrp-t` (12,5 px, 600, mayúsculas); el comentario de […]

### a11y-8 · [BAJA] El Escalador solo se opera con puntero: marcar puntos y mover guías no tiene teclado ni alternativa sin arrastre  
`a11y-8` · Accesibilidad · PARCIAL · esfuerzo L

- **Dónde:** #scalerCanvas (cotizador.html ~912: solo onmousedown/onmousemove/ontouchstart…); js/cotizador/escalador.js scAddGuide (~1922-1930: «arrástrala por su pestaña»); único teclado: el letrero sobre la foto (~2562, flechas).
- **Qué le pasa al usuario:** Un compañero que no pueda arrastrar o use solo teclado no puede calibrar ni medir ni colocar guías; la función es opcional para cotizar (se puede teclear la altura), así que el costo real es bajo.
- **Evidencia (verificador, medida por él):** Reproducido con el arnés (Chromium propio, 1440x900 y 390x844 táctil, claro y oscuro, escalador abierto con foto de prueba). 1) Lienzo #scalerCanvas: tabindex=null, tabIndex=-1, sin role ni aria-label, sin onkeydown. En escalador.js solo hay 2 oyentes de teclado (línea 2562, el letrero con flechas, y la línea 2671, el encabezado plegable); no hay ningún manejador global de teclado para #scalermodal. Del lienzo salen onmousedown/onmousemove/onmouseup/ontouchstart… (cotizador.html 912-914). 2) Recorrido con Tab (60 pulsaciones): nunca cae en el lienzo; solo botones, resúmenes, input de nombre y botones de partida. 3) Calibrar y medir sin arrastrar: con page.mouse.click en dos puntos de la […]
- **Corrección al hallazgo original:** Lo real: (1) las guías solo se mueven arrastrando su pestaña y la lista solo ofrece «Quitar» (WCAG 2.5.7 sin alternativa de un solo puntero); (2) el lienzo no es enfocable, así que quien use SOLO teclado no puede poner puntos. Lo exagerado o equivocado: el hallazgo dice que quien no pueda arrastrar «no puede calibrar ni medir». Es falso. Calibrar y medir se hacen con clic-clic con ratón o toque-toque con el dedo, sin arrastrar nunca (el código lo prevé: «cada toque coloca un punto y el segundo […]
- **Ya cubierto por:** Parcialmente: el letrero sobre la foto ya tiene su alternativa de teclado (escalador.js 2562-2568, vigilada en pruebas/navegador/cot-escalador.mjs ~660-668), y medir/calibrar ya tiene la alternativa de clic-clic o toque-toque sin arrastre. Nada cubre mover guías sin arrastrar ni operar el lienzo con teclado, y docs/REVISAR-PAQUETE-UI.md no lo lista.
- **Regla del skill:** dragging-alternative / Dragging Movements (skill ux) y keyboard-nav; WCAG 2.5.7 y 2.1.1.
- **Arreglo:** Hacer solo la parte barata y que cierra el incumplimiento real (2.5.7) para las guías, sin tocar el lienzo. Archivo js/cotizador/escalador.js, función scUpdateGuideList (~1940-1956): en cada renglón .sp-gitem agregar una SEGUNDA LÍNEA (flex-wrap, flex-basis:100%) con [−] [campo numérico de posición en % de la foto] [+], y una función scMoverGuia(id, delta, abs) que haga g.pos=clamp(0..1) y scRender(). Etiquetas accesibles: «Mover la guía vertical 1 un 1 % a la izquierda/derecha» (horizontales: arriba/abajo) y «Posición de la guía vertical 1, en % del ancho de la foto»; input type=number min=0 max=100 step=0.5 inputmode=decimal (las flechas nativas ya funcionan con teclado). El campo debe refrescarse cuando la guía se arrastra: actualizarlo en el mover de scGuideDragStart (~1432-1441) o al […]
- **Riesgo del arreglo:** Bajo. scUpdateGuideList se llama al agregar, quitar, limpiar guías, al terminar de corregir un extremo (scEndHandle) y al restaurar/reiniciar, y repinta con innerHTML: el campo solo debe usar oninput→scRender (sin reconstruir la lista) para no perder el foco al teclear. Hay que sincronizar el valor del campo cuando la guía se arrastra con el dedo. La lista crece de ~62 a ~91 px por guía en […]

### a11y-9 · [BAJA] Barra superior en teléfono: el orden del foco no sigue el orden visual; y en escritorio dos nombres accesibles no contienen el texto visible  
`a11y-9` · Accesibilidad · PARCIAL · esfuerzo M

- **Dónde:** cotizador.html 166-198 (orden en el HTML: Deshacer, Clientes, Historial, Tema, Plataforma, rol) con el posicionamiento de css/sistema.css ~865-895 (`.btn-tema` y `.btn-pf` anclados arriba a la derecha a ≤560 px). Etiquetas: aria-label de los botones de las líneas 167 y 198.
- **Qué le pasa al usuario:** Poco para un teléfono con teclado externo; más para quien maneja la app por voz (decir «clic Plataforma» o «clic Clientes» no encuentra el botón) y para lectores de pantalla en teléfono, que recorren en el orden del HTML.
- **Evidencia (verificador, medida por él):** Chromium 151 con el arnés, tema claro, sin movimiento reducido, pantalla de cliente.

1) Orden del foco, con presiones reales de Tab. A 390 px (táctil), x,y de cada parada: logo (12,8), Clientes (282,60), Historial (334,60), Tema (282,8), Plataforma (334,8), Vendedor (116,60). Zigzag: fila 2, fila 2, fila 1, fila 1, fila 2. A 360 px: Clientes (185,59), Historial (304,59), Tema (252,8), Plataforma (304,8), Vendedor (13,111). Posiciones de los botones en 320, 360, 430, 560, 561, 640, 768, 1024 y 1440 px: de 561 en adelante el orden del foco coincide con el visual (a 1440: Clientes 626, Historial 731, Tema 837, Plataforma 891, Vendedor 1135).

2) Etiquetas, con el árbol de accesibilidad de […]
- **Corrección al hallazgo original:** Las dos mitades son reales, pero el hallazgo falla en tres puntos. (1) En 386 a 560 px el desorden es mayor que el descrito: en la segunda fila, Vendedor/Autorizador quedan visualmente ANTES de Clientes/Historial (order 3 contra order 4) y el foco los recorre DESPUÉS. A 390 la secuencia real es logo, Clientes, Historial, Tema, Plataforma, Vendedor, Autorizador. En 320 y 360 px el selector de rol baja a una tercera fila y ahí solo Tema y Plataforma están fuera de lugar. (2) El arreglo de orden […]
- **Regla del skill:** keyboard-nav «Tab order matches visual order»; WCAG 2.4.3 Orden del foco y 2.5.3 Etiqueta en el nombre (A).
- **Arreglo:** Dos cambios independientes y pequeños.

A) Etiqueta en el nombre, en cotizador.html. El `title` puede quedarse como está.
- Línea 167: `aria-label="Clientes: cuadernos de cliente"`.
- Línea 198: `aria-label="Plataforma: el taller, con tablero, calendario, material y mapa"`.
- Hay que actualizar pruebas/navegador/cot-cliente.mjs, líneas 477, 482 y 487. El selector `.btn-hist[aria-label="Cuadernos de cliente"]` pasa a `button[onclick*="abrirCuadernos"]`, y el regex `/Cuadernos de cliente/` pasa a `/Clientes: cuadernos de cliente/i`.

B) Orden del foco, solo CSS y sin tocar el HTML. Va en css/sistema.css, dentro del bloque del teléfono `@media(max-width:560px)` (capa 2, el mismo del `.rolewrap{display:contents}` y el anclaje de Tema/Plataforma), justo después de `.topbar-in{row-gap:7px}`: […]
- **Riesgo del arreglo:** A) Cambiar los aria-label rompe 3 aserciones de cot-cliente.mjs (477, 482, 487), que buscan el texto exacto. Quien lo aplique debe actualizarlas en el mismo commit. A ≤560 px el tip de nombre leerá la etiqueta nueva y más larga; ya medí que cabe. Ninguna otra prueba ni JS busca esas etiquetas. El anidador tiene su propio «Abrir el taller» y no se toca.

B) `reading-flow` y `reading-order` los […]

### a11y-10 · [BAJA] «Del escalador» (aria-disabled) apaga el anillo de foco junto con el botón: 2,2:1  
`a11y-10` · Accesibilidad · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css:1644 `.plano-b[aria-disabled="true"]{opacity:.55}`; botón «Del escalador» en cada partida sin plano.
- **Qué le pasa al usuario:** Quien tabula pierde la pista justo en ese botón, que además es de los pocos que sí se puede enfocar estando «apagado».
- **Evidencia (verificador, medida por él):** Reproducido con el arnés Playwright, tabulando con teclado real hasta el botón «Del escalador» (aria-disabled="true") de una partida de letras recién creada (llegarA "partidas", sin medición en el escalador). Medí en 1440x900 y 390x844, tema claro y oscuro, con movimiento reducido.

Causa confirmada en css/sistema.css:1644 `.plano-b[aria-disabled="true"]{opacity:.55}`. Es la única regla de la hoja que atenúa con opacity un control enfocable (`aria-disabled`). Ninguna otra capa la anula. vidrio.css y plataforma.css no tocan `.plano-b`. El foco llega de verdad: `:focus-visible` es true y el botón queda en el orden de Tab.

Números con el arreglo APAGADO (estado actual), leyendo el píxel del […]
- **Corrección al hallazgo original:** Qué es real: la causa (opacity .55 atenúa también el outline), la ubicación (sistema.css:1644), la cifra (2,20:1 claro y 2,38:1 oscuro, idénticas a 1440 y 390), que ninguna prueba ni doc lo cubre, y la severidad baja. El arreglo propuesto funciona tal cual.

Qué estaba exagerado o impreciso:
1. La referencia normativa. No es un fallo claro de WCAG 2.4.7: el anillo existe y se ve, solo es tenue, así que «foco visible» se cumple. Tampoco es claro un fallo de 1.4.11, porque los componentes […]
- **Ya cubierto por:** Ninguna prueba ni documento lo cubre. No hay referencias a `.plano-b` en pruebas/navegador/, contraste.mjs no mide el anillo de foco ni el estado aria-disabled, y docs/REVISAR-PAQUETE-UI.md no lo lista. La regla general que lo contradice sí está documentada: docs/SISTEMA-DE-DISENO.md §4.3, «Nunca apagar con opacity», con precedentes en `.pmover-b[aria-disabled]` (sistema.css:5122), `.chip[aria-disabled]` y `.mat-guardar[aria-disabled]` (plataforma.css:3572). Es la excepción sin cubrir, no una decisión documentada.
- **Regla del skill:** focus-states / Focus States (skill ux, ≥3:1) y focus-appearance; disabled-states (opacidad + atributo semántico, sin apagar el foco); WCAG 2.4.7 y 1.4.11.
- **Arreglo:** Un cambio de una línea, en el mismo sitio y en la misma capa: css/sistema.css:1644, la región del bloque del plano de la partida. Dejar de apagar con opacity y apagar con color y borde, como el resto de la hoja:

`.plano-b[aria-disabled="true"]{opacity:1;color:var(--tinta3);border-style:dashed}`

Se probó inyectándolo con p.addStyleTag, sin tocar el repo, en los 4 recorridos:
- El anillo pasa de 2,20:1 a 4,66:1 en claro y de 2,38:1 a 4,60:1 en oscuro. Los tokens (--a, --tinta3, --line) no cambian.
- El texto apagado queda en 4,97:1 en claro y 5,46:1 en oscuro.
- Visualmente (capturas a escala 2, claro y oscuro) sigue leyéndose «apagado» frente a «Subir»: gris, borde discontinuo, mismo lenguaje que el contenedor `.plano-p` y que `.mat-guardar`.
- Computado tras el arreglo: opacity 1, color […]
- **Riesgo del arreglo:** Muy bajo. `.plano-b` solo se genera en imagenes.js:147 y 148, dentro de la partida del cotizador, y solo hay una regla en la hoja para ella. El selector queda con la misma especificidad (0,2,0) y supera a `.plano-b` (0,1,0). No toca z-index, `[hidden]`, ni index.html y el anidador, que no usan esta clase. Ninguna prueba en pruebas/navegador/ la menciona. Si algo cambia, es que contraste.mjs, si […]

### apoyo-4 · [BAJA] Registrar venta y Revisión remota: el botón principal nunca queda a la vista  
`apoyo-4` · Pantallas de apoyo y modales · PARCIAL · esfuerzo S

- **Dónde:** .rv-footer (cotizador.html:1233, css/sistema.css:2276) y #rem-autorizar / #rem-rechazar (cotizador.html:672-673, dentro de .modal-b con scroll).
- **Qué le pasa al usuario:** Es el último paso de cada venta y el botón que deja constancia de que se ganó. Hay que arrastrar para encontrarlo, y en teléfono se recorre casi pantalla y media de formulario sin ver el total a pagar al mismo tiempo.
- **Evidencia (verificador, medida por él):** NOTA: el servidor compartido de 127.0.0.1:8777 estaba caído (ERR_CONNECTION_REFUSED); levanté uno propio y temporal en el puerto 8791, en loopback y solo lectura sobre el repo, y lo detuve al terminar. git status del repo sin cambios (solo el .claude/ que ya estaba sin seguimiento).

REGISTRAR VENTA (arnés, tema claro, movimiento reducido, estado «autorizada», abrirRegistrarVenta()):
- Contenido .rv-modal scrollHeight 1217 px a 1920×1080, 1440×900 y 1366×768 (coincide con el revisor). Botón «Registrar venta» top=1046, bottom=1092. Fondo del modal termina en 1064 (1080), 884 (900) y 752 (768): faltan 28, 208 y 340 px. Coincide exacto.
- 390×844: scrollHeight 1505, clientHeight 810, botón […]
- **Corrección al hallazgo original:** Lo real: los dos botones principales quedan fuera de la primera pantalla y los números del revisor salen exactos. Lo exagerado: (1) «nunca queda a la vista» es falso, porque se llega con un solo deslizamiento: en 390×844 el scroll máximo es 695 px (menos de una pantalla de 810 px), no «pantalla y media». (2) «sin ver el total a pagar al mismo tiempo» es falso: al llegar al final del scroll la caja de totales (.rv-calc, y=494-605) y «Registrar venta» (y=635-681) caben juntas en 390×844 y en […]
- **Regla del skill:** primary-action, fixed-element-offset, content-priority (ui-ux-pro-max)
- **Arreglo:** Dos cambios pequeños, ambos con las clases y tokens que ya existen (--sup, --line; sin sombra nueva, solo el filete; el z-index 2 queda dentro del contexto de .rv-modal-bg y .modal-bg que ya son z 60, así que no toca la pila documentada).

A) REGISTRAR VENTA
 1. cotizador.html (~línea 1244): mover el botón #rv-copiar fuera de .rv-footer a .rv-body, justo debajo de .rv-calc, como «.btn btn-gho» con margen de 14 px arriba (clase nueva, p. ej. .rv-copiar-cuerpo{margin-top:14px}). Conserva los mismos id y onclick, así que venta.js y las pruebas siguen igual (Piezas.trabajando lo usa por id como «hermano»). Dejar en el pie solo #rv-copied (el recibo), #rv-registrar y el Cancelar.
 2. css/sistema.css, capa de estructura, EDITAR in situ la regla existente (línea 2276; no hay otra regla de […]
- **Riesgo del arreglo:** - Teclado virtual del teléfono (NO medido; el arnés es Chromium de escritorio): al teclear en «Anticipo» el pie queda detrás del teclado igual que hoy el botón; no empeora, pero hay que verlo en un Android y un iPhone reales (docs/REVISAR-PAQUETE-UI.md ya lista «sticky con barra de URL móvil» como sin verificar fuera de Chromium).
- «Copiar datos para la hoja» pasa del pie al final del cuerpo: es […]

### apoyo-5 · [BAJA] Tocar fuera de Registrar venta o de la Revisión remota cierra y descarta lo escrito sin avisar  
`apoyo-5` · Pantallas de apoyo y modales · PARCIAL · esfuerzo S

- **Dónde:** cotizador.html:1111 (#rv-modal-bg onclick) y 656 (#remotamodal onclick); venta.js:120 y notario.js:558 reponen los valores al abrir.
- **Qué le pasa al usuario:** Un dedo que roza el borde mientras se escribe tira el trabajo. En la revisión remota Dirección pierde los precios por partida que acaba de ajustar y la nota para el vendedor.
- **Evidencia (verificador, medida por él):** Medido con Playwright en un Chromium propio. El servidor de 8777 estaba caído (connection refused), así que usé PUERTO=8791, otro http.server que sirve la misma carpeta del repo. No arranqué ni paré nada.

Registrar venta (llegarA autorizada, abrirRegistrarVenta). Con fecha de instalación 2026-10-20, anticipo 5000 y estatus COBRANDO:
- 390×844 claro, 390×844 oscuro y 1440×900 claro: el toque en el fondo cierra el modal.
- A 390 la tarjeta mide x 16 a 374 y y 16 a 828. El toque en x=6 cierra (elementFromPoint devuelve rv-modal-bg).
- Al reabrir quedan fecha vacía, anticipo 10208 y FABRICACION. Cero errores de página.

Revisión remota (cola simulada con _remotas y abrirRevisionRemota):
- Con […]
- **Corrección al hallazgo original:** Los hechos y los números se reproducen tal cual y el dónde es correcto (cotizador.html:656 y :1111, venta.js:120, notario.js:558). Lo que no sostengo: (1) la severidad media. El costo real es reteclear 2 a 4 valores. Nada queda mal registrado en silencio, porque el modal se esfuma a la vista y al reabrir se ve reseteado. Subiría a media solo si Dirección ajusta muchas partidas en una revisión remota. (2) El hallazgo describe un solo camino de pérdida y hay otros dos, más probables que el toque […]
- **Ya cubierto por:** Nada lo cubre. Ninguna prueba en pruebas/ vigila el cierre por toque de fondo de #rv-modal-bg ni de #remotamodal (grep de click/tap/fuera/velo sobre ambos ids: cero resultados). Las pruebas solo llaman cerrarRegistrarVenta() y cerrarRevisionRemota() directo. No está listado en docs/REVISAR-PAQUETE-UI.md. #aimodal sin cierre por fondo es cierto (cotizador.html:523 no tiene onclick) pero no hay decisión escrita que lo explique. Los otros cinco modales con cierre por fondo (climodal, histmodal, faltmodal, confmodal, lightbox) no guardan datos escritos, y su comportamiento es el de la plantilla documentada.
- **Regla del skill:** sheet-dismiss-confirm, confirmation-dialogs, form-autosave (ui-ux-pro-max)
- **Arreglo:** Dos piezas, probadas inyectándolas en vivo sin tocar el repo.

A) Guardia de origen del toque, en js/cotizador/nucleo.js, junto a _CAPAS y el keydown. Arregla de una vez los siete modales y es lo que corrige el caso de arrastrar y soltar fuera. Es un oyente de pointerdown en captura que guarda e.target, y un oyente de click en captura que hace e.stopImmediatePropagation() si el target tiene la clase modal-bg o rv-modal-bg y el pointerdown no empezó en ese mismo elemento. Probado a 1440: el arrastre de selección soltado fuera ya no cierra, y un clic directo en el fondo sí actúa.

B) Cerrar con el fondo solo si no hay cambios; con cambios, preguntar. Va en cotizador.html:656 y :1111, con un ayudante en nucleo.js junto a confirmar() (~línea 841).
- Cambiar los onclick de fondo de […]
- **Riesgo del arreglo:** - La guardia (A) es global: toca el cierre por fondo de los siete modales y del lightbox. El lightbox (cotizador.html:583) usa onclick="closeLightbox()" sin comprobar el target, y la guardia solo afecta clics cuyo target ES el fondo con pointerdown previo en otro sitio, así que debe verificarse con pruebas/navegador/cot-historial.mjs:713, que prueba que tocar el velo cierra el visor.
- Los […]

### apoyo-6 · [BAJA] Los selectores de herramienta miden 34 px de alto con el dedo  
`apoyo-6` · Pantallas de apoyo y modales · PARCIAL · esfuerzo S

- **Dónde:** .tool-seg button: Libre/Horizontal/Vertical (#sc-btn-libre, -h, -v), Todas/La elegida/Ninguna (#sc-cotas-*) y Original/Comparar/Vector (#vt-view-*). css/sistema.css:2997 (min-height:34px) y 2144 (min-height:40px, la pisa la de 2997); no está en el bloque táctil de cierre, css/sistema.css:6456.
- **Qué le pasa al usuario:** Cambiar entre medir libre, horizontal y vertical es lo que más se toca mientras se mide. A 34 px, con una mano, a pleno sol, es fácil tocar el vecino y trazar la cota en el eje equivocado.
- **Evidencia (verificador, medida por él):** Reproducido con el arnés, Chromium propio. El 8777 estaba caído (ERR_CONNECTION_REFUSED), así que usé 8791 y luego 8842, otros servidores que sirven este mismo repo; verifiqué que sistema.css:2997 dice min-height:34px en ambos. Medido a 390×844, hasTouch/isMobile, (hover:none) y (pointer:coarse) verdaderos, movimiento reducido, claro y oscuro (idénticos): ESCALADOR (foto cargada, calibrado, 2 medidas, 2 partidas de letras): sc-btn-libre/h/v 124×34 (grupo 374×36, minHeight 34px, fs 12.5px); sc-cotas-todas/foco/ninguna 118,3×34 (grupo 357×36, fs 11px, dentro del panel inferior); sc-lf-cuales 170×34 (x2). VECTORIZADOR (con trazo): vt-view-orig/cmp/vec 124×34 (sin trazo, cmp y vec apagados, […]
- **Corrección al hallazgo original:** Los números, el selector y la causa son correctos. Lo exagerado es el impacto y la severidad. (1) «Tocar el vecino y trazar la cota en el eje equivocado» no lo sostiene la geometría: cada botón mide 124 px de ancho a 390 px (118 los de cotas, 170 los de partida del letrero), así que acertar al segmento de al lado exigiría errar unos 60 px en horizontal. El fallo real es un toque perdido en vertical. Hit-test a 390×844: 5 a 8 px bajo el botón cae en la barra (no pasa nada), y 10 px sobre el […]
- **Ya cubierto por:** Nada lo cubre hoy: ninguna prueba mide .tool-seg, docs/REVISAR-PAQUETE-UI.md no lo lista, y docs/SISTEMA-DE-DISENO.md solo dice que es «sistema viejo» sin nombrarlo en el bloque táctil. Lo parcialmente relacionado es la regla de 44 px (§4.5 y regla 8) y las pruebas cot-escalador.mjs y cot-vector.mjs, que vigilan 44 px en otros controles de los mismos modales pero no en estos selectores.
- **Regla del skill:** touch-target-size, touch-spacing (ui-ux-pro-max: Táctil, mínimo 44 px); la regla propia del sistema es 44 px (css/sistema.css:6445)
- **Arreglo:** css/sistema.css, capa 8 (cierre táctil), dentro de @media(hover:none),(pointer:coarse) que empieza en ~6456, añadir: `.tool-seg button{min-height:44px}` con un comentario en el estilo de la capa (qué se veía, medido: 34 px; por qué: la regla de 2997 pisaba a la de 2144 y el bloque táctil no nombraba .tool-seg). Cubre sin más código los tres usos (#sc-btn-*, #sc-cotas-*, #vt-view-*) y el del letrero (.sc-lf-cuales). Gana por orden: misma especificidad (0,1,1) que 2997 y 2144 y va después; .sp-cotas .tool-seg button y .sc-lf-cuales .tool-seg button solo fijan padding, vidrio.css solo el radio. Probado inyectando ese CSS con addStyleTag a 390×844 táctil: botones 44/44/44 y grupo 46 de alto en escalador (ambos grupos), vectorizador y selector del letrero (170×44); en iPad apaisado 1180×820 el […]
- **Riesgo del arreglo:** Bajo. Solo sube la caja con puntero grueso; con ratón (1440) nada cambia. Costo de espacio medido con la inyección: la barra del modal crece 10 px, el lienzo pierde 5 px y el panel inferior 5 px. En vertical: 390×844 escalador barra 157→167, lienzo 316→311, panel 371→366; vectorizador barra 147→157, lienzo 321→316; 375×667 lienzo 235→230; 360×740 268→264; 344×882 334→329. En horizontal con […]

### apoyo-7 · [BAJA] Cotizar con IA: durante el análisis, cancelar, estado y traza quedan bajo el pliegue  
`apoyo-7` · Pantallas de apoyo y modales · PARCIAL · esfuerzo S

- **Dónde:** #ai-cancel-btn, #ai-status, #ai-traza y #ai-pick dentro de #aimodal .modal-b. js/cotizador/ia.js:284 (aiPintarTrabajando) y 312 (aiVerFicha); cotizador.html:549-577.
- **Qué le pasa al usuario:** La espera de IA dura de 10 s a un minuto con el cliente enfrente. Quien espera ve una foto y no el progreso por proveedor, y para cancelar tiene que desplazar. Si toca la × cierra y cancela el análisis, que cuesta, sin preguntar.
- **Evidencia (verificador, medida por él):** Reproduje la medición con el arnés (Playwright, tema claro, táctil, hoja de mentiras con la IA retrasada 7 s, foto subida, tap en «Analizar», medido a los 2.5 s). Se midió con el estado «precio» (una partida capturada) y con «partidas» (partida en blanco). Se usó el servidor de mi propia carpeta: el del puerto 8777 estaba caído tras apagarse la compu, y mi servidor sirve el mismo ia.js (mismo md5 que el repo). Resultados por viewport (y de arriba abajo; el pliegue es el borde inferior de .modal-b):
- Estado «precio», 390x844: ficha 510-843, Cancelar 1050-1096, estado 1107, traza 1137-1191, pliegue 843. Coincide con el revisor al píxel.
- Estado «precio», 360x640: ficha 322-634, Cancelar […]
- **Corrección al hallazgo original:** Lo medido es real y exacto, pero el hallazgo falla en tres puntos. (1) El arreglo propuesto no funciona: #ai-pick (la ficha) vive DENTRO de #ai-file-fld (cotizador.html:~560), así que ocultar #ai-file-fld esconde la propia ficha. Lo probé inyectado y dio ficha:"oculto" a 360x640, 375x667, 390x844 y 412x915. (2) Las cifras del revisor son del estado con una partida ya capturada, que añade la caja «Conservar las partidas» (133 px) entre la ficha y Cancelar. Con la cotización en blanco, que es el […]
- **Ya cubierto por:** Parcialmente. La pastilla de etapa y la banda de luz de H7 (aiEtapa, .ia-etapa, .ia-marco::after en css/sistema.css ~5510-5540) ya dicen que se está trabajando y en qué etapa. aiClose() cancela a propósito al cerrar (comentario en ia.js ~270), y el botón «Analizar» queda deshabilitado, lo que evita el doble cobro. Ninguna prueba ni documento vigila que Cancelar, el estado y la traza se vean durante la espera: cot-ia.mjs no menciona Cancelar. Y docs/REVISAR-PAQUETE-UI.md no lo lista como limitación conocida.
- **Regla del skill:** loading-states, progressive-disclosure, error-recovery, timeout-feedback (ui-ux-pro-max)
- **Arreglo:** Elegir F4 (solo JS, sin cambiar la maquetación), en js/cotizador/ia.js. No tocar sistema.css ni vidrio.css.
1) Añadir aiVerEspera(): si hay análisis en curso y el cuerpo del modal (#aimodal .modal-b) está pegado al fondo (scrollHeight - scrollTop - clientHeight < ~48 px) o es la primera llamada, hacer sc.scrollTo({top: sc.scrollHeight, behavior: Piezas.sinMovimiento()?'auto':'smooth'}) en requestAnimationFrame.
2) En aiPintarTrabajando(true) llamar a aiVerEspera() en lugar de aiVerFicha(). Dejar aiVerFicha tal cual para el estado de error (aiPintarFalloIA), que usa 'nearest' y ya funciona.
3) Dentro de aiTrazaPaso(), después de t.paso(...), si aiTrabajando, volver a pegar al fondo con behavior 'auto', solo si ya estaba pegado antes de añadir el paso. Así quien sube a mirar la imagen no es […]
- **Riesgo del arreglo:** F4 casi no tiene riesgo. No toca CSS (no afecta index.html ni el anidador, que comparten sistema.css), no cambia z-index ni [hidden] y no mueve la maquetación. No choca con cot-ia.mjs: el alto del recuadro y el foco de «Reintentar» (preventScroll) no se alteran. Vigilar tres cosas. (a) El re-pegado solo debe actuar con aiTrabajando en true, para no pelearse con el scrollIntoView del resumen […]

### apoyo-8 · [BAJA] «Re-calibrar» deja las medidas viejas visibles y con «Agregar como partida» activo  
`apoyo-8` · Pantallas de apoyo y modales · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/escalador.js:1772 (scResetCalib), 1976 (scMedidaCaraHTML), 2637 (scUpdateAddAll).
- **Qué le pasa al usuario:** Si alguien re-calibra porque la escala estaba mal y antes de terminar baja una medida a una partida, entra a la cotización un número de la escala que se quería corregir. Es un camino poco frecuente, pero el error es de dinero.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído (se reinició la compu). Usé el 8791, que sirve el mismo repo con archivos idénticos (md5 igual en escalador.js). No arranqué ni paré nada. Scripts y capturas en ver-apoyo-8a/ (rep1 a rep7.mjs, fix-inyectado.js).

REPRODUCIDO. 390x844 táctil, tema claro (y oscuro). Calibré 200 cm con el rectángulo alto, tracé una medida de 296,6 cm, abrí «Calibración de escala» y toqué «Re-calibrar» con tap real. Resultado: la insignia dice «Sin calibrar», SC.nativePxPerCm = 0, y la lista sigue con «296.6 cm», «→ Agregar como partida» habilitado (disabled=false) y el pie «→ Agregar la medida como partida» habilitado. Un tap real en «Agregar como partida» crea la […]
- **Corrección al hallazgo original:** El núcleo es real y lo reproduje. Lo que el hallazgo exagera, omite o se equivoca:
1) Impacto: no dijo que ya hay una mitigación posterior. Al confirmar la escala nueva, scRecalcTodas desmarca la medida y sale el aviso «N partida ya agregada sigue con la escala anterior: revísala». Por eso bajo la severidad a baja.
2) Alcance: se queda corto. Con la escala en 0 también quedan activos «Cotizar con IA» (pie y vista previa del cotizador), «Descargar imagen con cotas», la figura con cotas del PDF […]
- **Ya cubierto por:** Cubierto en parte, y solo después del hecho: scRecalcTodas + scNotaViejas (escalador.js ~1375 a 1388) desmarcan la medida usada que cambia y avisan «partida ya agregada sigue con la escala anterior» cuando se CONFIRMA la escala nueva. Probado. No cubre el intervalo entre «Re-calibrar» y confirmar, ni el camino de abandonar a medias. Pruebas: pruebas/navegador/cot-escalador.mjs (235 a 238) solo verifica que el riel vuelva al paso 1 tras scResetCalib, no la lista ni los botones. Ni docs/REVISAR-PAQUETE-UI.md ni docs/SISTEMA-DE-DISENO.md lo listan como limitación conocida.
- **Regla del skill:** state-clarity, disabled-states, error-feedback (ui-ux-pro-max)
- **Arreglo:** 1) js/cotizador/escalador.js, scResetCalib (1772): dentro de `if(full){scSetMode('ref');scRender();}` añadir `scUpdateList();`. Solo en la rama full, porque scLoadImgSrc y scReset la llaman con false y después vacían SC.items; repintar ahí pintaría la lista vieja.
2) scMedidaCaraHTML (1976): con SC.nativePxPerCm<=0, en .sp-mitem-cm mostrar «—» en lugar de «NNN cm». Los .sp-mitem-add (y el .par) llevan `disabled`. El rótulo de los que no están usados pasa a «Vuelve a calibrar para agregar»; los ya «Agregada» conservan su rótulo, pero disabled. Ajustar también el aria-label.
3) scUpdateAddAll (2637): `btn.disabled=!pend||locked()||SC.nativePxPerCm<=0;` y `ia.disabled=!n||locked()||SC.nativePxPerCm<=0;`.
4) Guarda como primera línea de scUsarMedida, scUsarPar, scUsarTodas y scCotizarConIA: […]
- **Riesgo del arreglo:** Bajo, probado inyectado sin errores. Puntos a vigilar:
(a) Quien toca «Re-calibrar» por error ya hoy pierde la escala y las medidas se quedan con el número viejo; con el arreglo además no puede bajarlas a partidas hasta recalibrar. Es consistente, pero conviene un complemento opcional: un aviso con «Deshacer» al re-calibrar, como el de scEndHandle («Escala restaurada»), que guarde la escala […]

### apoyo-9 · [BAJA] Las medidas y la calibración del Escalador viven solo en memoria  
`apoyo-9` · Pantallas de apoyo y modales · PARCIAL · esfuerzo L

- **Dónde:** js/cotizador/escalador.js:17 (objeto SC) y el comentario de la línea 171; js/cotizador/arranque.js:195 (beforeunload); cotizador.html:1080 y siguientes.
- **Qué le pasa al usuario:** Calibrar con una referencia y trazar seis cotas son varios minutos de mano fina, en obra. Si el vendedor sale a WhatsApp a contestar y el sistema mata la pestaña, vuelve con la foto y las cotas perdidas sin ningún aviso.
- **Evidencia (verificador, medida por él):** Entorno: arnés Playwright en 390x844 táctil, tema claro, movimiento reducido. El servidor 8777 estaba caído; usé el que ya escuchaba en 8791 (mismo repo) y no arranqué nada. Los scripts quedaron en scratchpad/uiux/ver-apoyo-9a/ (repro1.mjs, proto.mjs, costo.mjs, restaurado.png). No se tocó ningún archivo del repo.

CÓDIGO (confirmado).
- Leí escalador.js completo en las zonas relevantes. El único resultado de grep por localStorage, sessionStorage, indexedDB o persist es el comentario de la línea 171 («SC no se persiste en ningún lado»).
- arranque.js:195-208: el beforeunload sí incluye `hayMedidas` (SC.img && SC.items.length>0), pero beforeunload no corre cuando el sistema descarta una […]
- **Ya cubierto por:** Cubierto en parte, no el descarte de pestaña. El beforeunload de arranque.js:195-208 con `hayMedidas` cubre cerrar o recargar a propósito. scPuedeCambiarImagen() (confirmar con sostener) cubre cargar otra foto sobre medidas. scSnapshot/scRestaurar cubren el vaciado y su Deshacer. Ninguna prueba vigila el descarte ni hayMedidas.
- **Regla del skill:** form-autosave, state-preservation, undo-support (ui-ux-pro-max)
- **Arreglo:** Todo va en js/cotizador/escalador.js, un bloque nuevo junto a scSnapshot/scRestaurar (~línea 170). No lleva CSS, así que no toca capas de hoja ni sistema.css. Reutiliza toast() con acción, que ya existe.

1. Foto. Al elegir un archivo en cargarImagenScaler(), guardar el File original como Blob en una base IndexedDB propia y pequeña (por ejemplo 'al3d_sc', un solo registro 'foto'). No guardar la imagen que viene de «usar la imagen de IA»: Q.aiFile ya vive en al3d_aifile.
2. Estado. Clave de localStorage 'al3d_sc' con refLine, refCm, nativePxPerCm, mMode, cotas, nid, nc, gid, items, guides, imgW, imgH, nombre y una marca de identidad de la cotización (folio o sello de creación de Q). Medido: 1.0 a 1.5 KB.
   - Escribir con debounce de unos 500 ms tras cada cambio.
   - Vaciar de inmediato […]
- **Riesgo del arreglo:** - RESPALDO_KEYS: la propuesta original rompería pruebas/respaldo.mjs, que exige 'tiene 16 claves' e igualdad exacta con js/datos/cotizador.js:428. Habría que cambiar las dos listas a la vez. Aun así no sirve: IndexedDB no viaja en el respaldo, así que la clave llegaría sin su foto. restaurarDesde (historial.js:1818-1829) también borra todas las claves de la lista al restaurar. Es estado […]

### apoyo-10 · [BAJA] El lienzo de medir no tiene nombre ni alternativa de teclado; guías y puntos solo se mueven arrastrando  
`apoyo-10` · Pantallas de apoyo y modales · PARCIAL · esfuerzo L

- **Dónde:** #scalerCanvas (cotizador.html:912), #vt-split (744), pestañas de guía (scGuideDragStart, escalador.js:1426), extremos de cota (scMoveHandle, 1347). El único keydown del Escalador es el del letrero (escalador.js:2562).
- **Qué le pasa al usuario:** Un compañero que use solo teclado, o un lector de pantalla, no puede colocar ni corregir un punto. Para el equipo de ratón y dedo casi no se nota, pero deja el Escalador y el Vectorizador fuera de WCAG 2.1.1 y 2.5.7.
- **Evidencia (verificador, medida por él):** Entorno: Chromium propio por el arnés, 1440x900, tema claro, movimiento reducido, ratón. El puerto 8777 estaba caído (ERR_CONNECTION_REFUSED); usé el servidor que ya escuchaba en 8791 (PUERTO=8791) tras comprobar que sirve este repo: md5 idéntico de cotizador.html y js/cotizador/escalador.js. No arranqué ni paré servidores. Scripts en ver-apoyo-10a/a.mjs, b.mjs, c.mjs, d.mjs.
1) Escalador con foto cargada (abrirScaler + scLoadImgSrc). #scalerCanvas, #vt-cvs-out, #vt-split, #sp-hint-bar, #sc-guides-list: role=null, tabindex=null, aria-label=null, aria-live=null (los cinco). Árbol de accesibilidad por CDP del lienzo: role «Canvas», name «» (vacío), sin propiedades. cotizador.html:912 y 744 […]
- **Corrección al hallazgo original:** Lo real: el lienzo del Escalador no tiene nombre, rol ni foco, y guías y extremos solo se mueven arrastrando. Lo exagerado o equivocado: (1) «con el lienzo enfocado las flechas no hacen nada»: el lienzo ni siquiera se puede enfocar (tabIndex -1; canvas.focus() deja el foco donde estaba; Tab cicla 14 paradas del modal sin tocarlo). (2) La 2.5.7 es de WCAG 2.2 AA, no 2.1; la 2.1.1 sí aplica. Y no todo es solo-arrastre: colocar medida o referencia funciona con clic-clic o toque-toque (escalador.js […]
- **Ya cubierto por:** Parcialmente. (a) El letrero sobre la foto sí tiene alternativa de teclado (escalador.js:2562, probado en pruebas/navegador/cot-escalador.mjs ~668), lo que muestra que la intención existe pero no se extendió al lienzo. (b) El Vectorizador ya ofrece la alternativa al asa de comparación: botones Original/Comparar/Vector (comentario en vectorizador.js:296 lo explica: antes el asa era el único camino). (c) Colocar medidas y referencia no exige arrastre: clic-clic o toque-toque (escalador.js scUp). (d) La cotización no depende del Escalador: la altura se teclea en la partida. Ninguna prueba ni doc vigila el nombre, el foco o el teclado del lienzo (#scalerCanvas, #vt-split), y docs/REVISAR-PAQUETE-UI.md no lo lista como limitación conocida.
- **Regla del skill:** dragging-alternative, keyboard-nav, aria-labels, keyboard-shortcuts (ui-ux-pro-max; WCAG 2.1.1 y 2.5.7)
- **Arreglo:** Dos niveles; el barato primero y el resto solo si Elías quiere cubrir teclado.
A) Barato (esfuerzo XS, recomendable): 
 - cotizador.html:912, #scalerCanvas: añadir role="group" (NO role="img": el lienzo es interactivo; el patrón ya está en #sc-letrero, línea 963), tabindex="0", aria-label="Foto para medir" y aria-describedby="sp-hint-bar". Solo atributos: no cambia el conteo de manejadores en línea (on…=) que vigila pruebas/publicacion.mjs.
 - cotizador.html:743 (#vt-cvs-out): role="img" y aria-label="Vista previa del vector" (ahí sí es una imagen de resultado). #vt-split no necesita nada: sus botones Original/Comparar/Vector ya son la alternativa; si se quiere, role="slider" con aria-valuenow, pero es opcional.
 - cotizador.html:943 (#sp-hint-bar): role="status" (o enviar el texto a […]
- **Riesgo del arreglo:** Bajo para A, medio para B. A: tabindex=0 mete el lienzo como una parada más de Tab en el modal (el atrapa-foco de ui.js usa [tabindex]:not([-1]); queda una parada más en el recorrido) y lo hace candidato a «primero/último» del atrapa-foco, sin romperlo; con ratón y dedo no aparece anillo ni cambia nada porque scDown hace preventDefault en mousedown/touchstart (no mueve el foco) y :focus-visible […]

### cliente-3 · [BAJA] Ni la hoja 1 ni el mensaje de WhatsApp dicen la vigencia ni qué hacer para arrancar  
`cliente-3` · Salida al cliente · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/entrega.js · TERMINOS (~1195), tarjeta .pago (~1753), mensajeWhatsApp() (~168), hoja de opciones .opc-intro (~1797)
- **Qué le pasa al usuario:** El cliente no sabe hasta cuándo vale el precio, ni cómo se acepta, ni cómo paga el anticipo, ni cómo avisa cuál opción escogió: todo eso acaba en preguntas por WhatsApp que el documento podría contestar solo. Es lo que separa una cotización que se firma de una que se queda en 'lo voy a pensar'.
- **Evidencia (verificador, medida por él):** Nota: el servidor 8777 ya no responde (se apagó la compu). Usé otro servidor estático del mismo repo (puertos 8791 y 8861, de solo lectura) con el arnés. No edité nada del repo. Escritorio 1440x900, tema claro, cotización autorizada de 1 partida (acero inox 40 cm, 8 letras) con anticipo.

LO QUE SÍ SE CONFIRMÓ
1. La vigencia está una sola vez: «La cotización es válida por 10 días.» (entrega.js, TERMINOS, apartado 1, viñeta 5). Medí 10.4 px = 7.8 pt, gris rgb(90,96,118). Con 1 partida cae en la hoja 2 de 4; con una propuesta con opciones, en la hoja 3 de 5. La hoja 1 no la menciona y no hay fecha de vencimiento calculada en el documento.
2. No existe ningún dato de pago. Con grep de CLABE, […]
- **Corrección al hallazgo original:** Es real que la vigencia queda enterrada (7.8 pt, hoja 2 o 3) sin fecha concreta, y que el mensaje de WhatsApp no la menciona ni dice cómo elegir opción. Pero el hallazgo exagera y se equivoca en cuatro cosas. 1) «Ni cómo se acepta» es falso: el bloque «Aceptación» de la hoja de Términos y el apartado 8 lo dicen (depositar el anticipo o firmar). 2) «Ni una frase tipo para arrancar» es falso: «Anticipo para arrancar» está en la hoja 1 y en el mensaje. 3) «No dicen a quién ni por dónde» es falso: […]
- **Ya cubierto por:** Cubierto en parte: (1) el bloque «Aceptación» y el apartado 8 de los Términos (entrega.js, TERMINOS y .acepta) dicen cómo se acepta; (2) footerCot() pone el WhatsApp del taller en el pie de las hojas de cotización, planos, propuesta, opciones, orden de trabajo e instalación (los Términos llevan su propio pie con WhatsApp y oficina); (3) «Anticipo para arrancar» y «Resta al entregar» están en .pago de la hoja 1; (4) la vigencia de 10 días ya se calcula bien para el VENDEDOR en historial.js (vigenciaDe, vigenciaTexto, función 33), con pruebas en pruebas/cot-historial.mjs y pruebas/navegador/cot-historial.mjs. Lo que falta es llevar ese mismo cálculo al papel y al mensaje. Ninguna prueba vigila el texto del mensaje (cot-opciones.mjs solo busca «Opciones propuestas») ni el encabezado de la hoja 1. docs/REVISAR-PAQUETE-UI.md no lista esto como limitación conocida.
- **Regla del skill:** empty-states/feedback: 'Guide users … show helpful message and action' (búsqueda 'empty state guidance next step'); confirmation-messages; 'trust signals quote terms' no tuvo coincidencias en la base, apliqué criterio de claridad de condiciones
- **Arreglo:** Todo en js/cotizador/entrega.js. No hay CSS nuevo ni tokens nuevos.

1) FECHA DE VIGENCIA EN EL PAPEL. Tomarla del MISMO cálculo que el Historial, no de Q.fecha:
   const e = getHistorial().find(x => x.folio === Q.folio); const v = e ? vigenciaDe(e) : null;
   Proteger con typeof (historial.js carga después de entrega.js, pero ambos son scripts clásicos y solo se llaman en tiempo de ejecución). Sin entrada o sin ts no se imprime nada: no se inventa fecha, igual que la regla del Historial.
   Imprimirla en el encabezado de la hoja 1 (la de «Cotización») y de Opciones, junto a la fecha. hdr(titulo, fecha) hoy escapa la fecha con esc(), así que agregar un tercer parámetro opcional que se concatene a .mh-m como «&nbsp;·&nbsp;<b>Válida hasta 19 oct 2026</b>». Medido: 265 px, una línea, 0 px de […]
- **Riesgo del arreglo:** 1) Si se usa Q.fecha + 10, el papel contradice al Historial (15 oct contra 19 oct en el caso medido). Usar vigenciaDe(entrada) evita eso. 2) Si se agregan líneas a la tarjeta .pago sin subir ALTO_TOT y ALTO_TBODY_ULT, el pie puede salirse de la carta en cotizaciones largas, con descuento, dirección larga, partida oculta o plano. La holgura mínima medida baja de 34 a 16 px con +48 px. El […]

### cliente-5 · [BAJA] 34 textos del papel usan el gris --ink3 a 3.0-3.2:1, incluidos avisos que sí informan  
`cliente-5` · Salida al cliente · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/entrega.js · :root --ink3:#8a90a6 (~1246) y sus usos: .sigue (1379), .pie-h (1405), .pie-c>.lbl (1403), .pago>.lbl (1334), .fig>.lbl (1355), .acepta-m (1438), .rec-f>.lbl (1458), .rpie (1479)
- **Qué le pasa al usuario:** Es la tinta más débil del papel y en una impresora de oficina económica, en modo borrador o en una fotocopia desaparece. Y no solo rotula: ahí está el número de hoja (para rearmar un juego desordenado), el aviso de que los totales van en otra hoja y el 'no sustituye comprobante fiscal' del recibo.
- **Evidencia (verificador, medida por él):** Reproducido con mis propios scripts en mi carpeta (ver-cliente-5a: gen.mjs, medir.mjs, fix.mjs). Servidor: el 8777 estaba caído, usé el 8795, que sirve el mismo repo (md5 de entrega.js idéntico). Genero el documento real con generarPDF() (14 partidas, plano, anticipo, 7 hojas), lo cargo en Chromium 816x1056 con emulateMedia print y mido cada nodo de texto con getComputedStyle y fondo compuesto.
1) CONFIRMADO en lo medido. 43 textos con color rgb(138,144,166) (--ink3), todos bajo 4.5:1. Sobre blanco 3.17:1: 'Las partidas continúan en la hoja siguiente' (.sigue, 9px = 6.75pt), Vendedor/Dirección del taller/WhatsApp/Dirección de la oficina (.pie-c>.lbl, 9px, 19 en total; el 9px sale de […]
- **Corrección al hallazgo original:** Los números son reales; lo que exagera o yerra: (a) Severidad: baja, no media. En 2x se leen, aunque pálidos; el rótulo se entiende por el valor en tinta que tiene al lado (Vendedor/WhatsApp, Fecha/Cliente) y ninguna cifra ni condición comercial va en --ink3. Lo realmente limitante es el tamaño (5.25 a 6.75 pt), que el arreglo no toca. 'Desaparece en una fotocopia o modo borrador' no se pudo medir ni demostrar; es una suposición. Subiría a media solo si Elías confirma que el papel sale en […]
- **Ya cubierto por:** Nada lo vigila: contraste.mjs solo mide la app y pdf-hoja-carta.mjs solo geometría. Lo único cercano es la decisión documentada de la rampa de tres grises con 'el terciario solo rotula' en docs/FUNCIONES.md:195 (con números desactualizados), que no justifica 3.0-3.2:1 pero sí explica por qué el gris es tan claro.
- **Regla del skill:** color-contrast (Accesibilidad, ≥ 4.5:1) y color-accessible-pairs / contrast-readability (Typography & Color); búsqueda 'color contrast accessibility text'
- **Arreglo:** Archivo: js/cotizador/entrega.js, dentro del <style> del documento (el blob), en el bloque :root de ~1246; es un token, así que no se tocan los usos ni sistema.css, ni vidrio.css, ni index.html, ni el anidador. 1) Cambiar --ink3 de #8a90a6 a un gris más hondo. Preferible #686e85 (5.05:1 en blanco, 4.76 en --wash, 1.23:1 contra --ink2) o, si se quiere la máxima holgura, #656b82 (5.28 / 4.98, 1.18:1 contra --ink2). #6b7188 (4.84 / 4.56, 1.29:1 contra --ink2) conserva más escalón pero pasa 4.5 en --wash por solo 0.06, así que es el piso, no la meta. 2) Corregir el comentario ~1240 a '17.2:1, 6.2:1 y el terciario a ~5:1' (con el valor elegido) y cambiar 'solo rotula, nunca informa' por algo que no se contradiga con 'Hoja X de Y' y 'continúan en la hoja siguiente', o aceptar que informa. 3) […]
- **Riesgo del arreglo:** Bajo. Un color no mueve maqueta (hojas siguen en 1056 px; no cambia el reparto de filas ni las pruebas de geometría de pdf-hoja-carta.mjs). No hay pruebas que fijen #8a90a6 ni los nombres de ratio. Riesgos reales: (1) jerarquía: con #656b82 el tercer gris queda a 1.18:1 del segundo, de modo que rótulo y texto de acompañamiento casi se igualan y la distinción pasa a depender solo del tamaño, la […]

### cliente-6 · [BAJA] verificar.html lleva al cliente a páginas internas del taller y no le deja ningún contacto de AL3D  
`cliente-6` · Salida al cliente · PARCIAL · esfuerzo S

- **Dónde:** verificar.html · .pub-pie (línea ~153), ESTADOS.no_autentica (~177), #ver-alterado / armarContacto (~121-123, ~384); condiciones.html (~33-39, ~88)
- **Qué le pasa al usuario:** El cliente que escanea el QR para confiar en la cotización y toca 'Condiciones' esperando las condiciones de pago/garantía cae en un reglamento para empleados. Y si le sale 'No auténtica' (por ejemplo por teclear mal el código) la página le dice que confirme con AL3D pero no le da cómo, justo en el momento en que más desconfía; el único canal es un correo personal de Gmail, cuando el negocio atiende por WhatsApp.
- **Evidencia (verificador, medida por él):** Lo reproduje yo mismo con el arnés, en verificar.html a 390x844, tema claro, táctil, con la hoja simulada. Antes comprobé con cmp que el servidor que usé servía archivos idénticos a los del repo (verificar.html, publico.css, sistema.css, vidrio.css, condiciones.html y piezas.js).

HECHOS QUE SÍ RESISTEN
- Estados 'no_autentica', 'autentica', 'alterada', 'sin código', 'superada', 'revocada' y 'sin respuesta': los únicos enlaces visibles son Créditos (46x44 px), Privacidad (57x44) y Condiciones (68x44).
- Ningún estado trae wa.me ni tel:, y el texto no contiene el teléfono 33 2813 0092. No hay scroll horizontal (scrollW=390).
- El único contacto aparece en 'alterada' (el cliente marcó 'No […]
- **Corrección al hallazgo original:** Los hechos son ciertos y los reproduje, pero el hallazgo exagera en cuatro puntos:

1) El impacto. El cliente que escanea el QR ya tiene en el PDF el WhatsApp de AL3D impreso en cada hoja, y casi siempre el chat por donde le llegó. «Condiciones» se anuncia como interna en su primera línea, así que no engaña, solo confunde un momento. Nadie queda bloqueado.

2) «Correo personal de Gmail». Es el contacto oficial de las otras tres páginas públicas y de la hoja (CORREO en el .gs). […]
- **Ya cubierto por:** No hay nada que cubra el hueco de contacto.
- docs/REVISAR-PAQUETE-UI.md:775 punto 3 deja abierta con Elías la decisión del mailto fijo a eliasgaribi@gmail.com. Cubre el correo, no la falta de WhatsApp ni de contacto en los demás estados.
- pruebas/navegador/publicas.mjs:271 solo valida el mailto en el estado alterado.
- publicas.mjs:529-532 solo exige el enlace a Créditos en el pie de verificar.
- No hay prueba que vigile contacto en no_autentica, superada o revocada, ni que el pie de verificar no lleve enlaces internos.
- publicas.mjs:615-629 mide el contraste de .pub-pie a, que seguiría vigente tras el arreglo.
- **Regla del skill:** error-recovery ('Provide clear next steps', búsqueda 'confirmation feedback message error'), consistent-help y escape-routes (Accessibility); Feedback: error con salida
- **Arreglo:** Todo en verificar.html y css/publico.css (capa de páginas públicas, junto a .ver-alterado). No se toca sistema.css.

1) Pie de verificar.html (div.pub-pie). Quitar los enlaces a privacidad.html y condiciones.html y dejar la razón social + Créditos. La prueba publicas.mjs:529-532 solo exige Créditos. Alternativa, decisión de Elías: si quiere una Privacidad para clientes, añadir en privacidad.html una sección corta «Si escaneaste el QR de una cotización» (se manda el folio y el código a la hoja de AL3D y no se guarda nada de ti) y conservar solo ese enlace.

2) Contacto SOLO donde hace falta, no en «TODOS los estados» como propone el revisor. En 'Auténtica' el diseño busca un veredicto limpio: el propio comentario de A1 dice que el formulario abierto bajo un veredicto verde «solo invita a […]
- **Riesgo del arreglo:** Bajo.

- El número duplicado puede desfasarse si cambia el WhatsApp; la prueba del punto 4 lo evita.
- Si se usa .pub-btn en lugar de .btn-wa, rompe la regla «un botón de color por pantalla» en el estado no_autentica.
- No se puede quitar el mailto: publicas.mjs:271 exige `mailto:eliasgaribi@gmail.com?` con el folio y «no coincide: total.».
- Si no se sube APP_VERSION, los teléfonos con la PWA […]

### cliente-8 · [BAJA] Las hojas del taller viajan en el mismo archivo que el cliente recibe, con partidas ocultas y notas internas  
`cliente-8` · Salida al cliente · PARCIAL · esfuerzo M

- **Dónde:** js/cotizador/entrega.js · trozosOT usa Q.items y no itemsForPDF (~978), desc(it,'taller') con 'Ojo: el cliente aún no elige…' (~756), hojas Orden de trabajo / instalación / recibo (~1835-1923); barra del visor (~1694)
- **Qué le pasa al usuario:** El botón dice 'Ocultar del PDF' y el vendedor cree que el cliente no verá esa partida, pero otra hoja del mismo archivo la nombra. El cliente recibe además un recibo en blanco y hojas internas, y el mensaje le dice 'Le adjunto el PDF con el desglose'. Documentado como intencional para el taller (se fabrica lo oculto), pero nada avisa que en el mismo archivo va al cliente: conviene que Elías confirme si el cliente debe recibirlas. Solo recomiendo separar; no reabro la decisión de mandar opciones sin elegir.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído (conexión rechazada). No lo arranqué; levanté uno propio en el puerto 8861 desde mi carpeta, solo para lectura del repo, y lo cerré al terminar. El repo quedó intacto (git status solo muestra .claude/, que ya estaba).

Reproducción (escritorio 1440x900, tema claro, arnés Playwright). Cotización autorizada con 2 partidas: letras de acero inox de 40 cm y 8 piezas, más una partida manual oculta con el texto 'Descuento de cortesia interno al 15% - NO MOSTRAR'. Con límite de fabricación 'Viernes 30 de Octubre', teléfono y entre calles capturados y anticipo > 0. Capturé el HTML que arma generarPDF() y lo medí hoja por hoja:
- Salen 5 hojas: 1 […]
- **Corrección al hallazgo original:** Lo que estaba bien: el efecto reproducido (la partida oculta se nombra en la hoja 3 del mismo archivo, sin precio) y que la app no avisa que esas hojas van en el archivo.
Lo que estaba mal o exagerado:
- La severidad: es 'baja', no 'media'.
- Presenta como descuido algo que es una decisión documentada (entrega.js ~980-990 y docs/FUNCIONES.md:193) y que copia el paquete real de Canva (docs/ESTRUCTURA-COTIZACION-CANVA.md §2).
- Llama al recibo 'hoja del taller': trae el recibo del cliente más el […]
- **Ya cubierto por:** Cubierto en parte por una decisión documentada, no por una prueba que la vigile:
- js/cotizador/entrega.js ~980-990 (comentario) y ~1831 (la hoja de orden de trabajo solo sale con hayLimite).
- docs/FUNCIONES.md:193, docs/ESTRUCTURA-COTIZACION-CANVA.md §2, docs/ARQUITECTURA.md:797 y js/datos/material.js:15 y 635.
Pruebas que tocan el tema:
- pruebas/navegador/pdf-hoja-carta.mjs vigila que la orden de trabajo no lleve precios y que el reparto de hojas no se desborde.
- pruebas/navegador/cot-opciones.mjs:496 vigila el 'Ojo: el cliente aún no elige…'.
- pruebas/navegador/cot-entrega.mjs:536 vigila que las hojas físicas coincidan con el total.
Hueco: ninguna prueba dice a qué público va cada hoja ni qué pasa con una partida oculta en la orden de trabajo.
- **Regla del skill:** content-priority / visual-hierarchy (separar audiencias) y pro-rules: no mezclar información interna con la destinada al usuario
- **Arreglo:** Primero, una pregunta de negocio para Elías: ¿el cliente debe recibir la orden de trabajo, la de instalación y el recibo? Si sí (como en Canva), no hay nada que arreglar salvo avisar. Si no, hay que separarlas. Todo va en el documento del PDF dentro de js/cotizador/entrega.js. Ese CSS es una isla propia, con sus tokens --ink y --brand: no toca sistema.css, vidrio.css ni index.html.

Opción 1, la barata y segura (solo texto, no cambia el papel): decirlo donde el vendedor decide.
(a) En el guion del visor (entrega.js ~1631), el rótulo que se reescribe en cada scroll, añadir 'para el cliente 1–N · del taller N+1–TOTAL'. N sale de HOJA_TERMINOS, que ya existe. El texto debe ir en la plantilla de pintar(), no solo en el HTML estático de ~1699, porque pintar() lo pisa al primer scroll. Si […]
- **Riesgo del arreglo:** Opción 1 (texto): casi nulo. El único riesgo es que el rótulo de pintar() se pise con el estático si solo se edita uno, y que en 360 px se parta en 2 renglones (medido: caben en los 54 px de la barra). No cambia las hojas físicas, así que no afecta a cot-entrega.mjs:536 (hojas físicas = total) ni a pdf-hoja-carta.mjs.

Opción 2 (interruptor): con el valor por defecto encendido el papel no cambia […]

### cliente-9 · [BAJA] La columna 'Medidas' dice solo la altura de letra y el texto repite la jerga de los kelvin  
`cliente-9` · Salida al cliente · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/entrega.js · med() (~773) y desc() (~735); docs/ESTRUCTURA-COTIZACION-CANVA.md §6 puntos 4 y 7 (aún abiertos)
- **Qué le pasa al usuario:** El cliente no puede deducir de la tabla qué tan largo es el letrero que compra (solo lo ve si hay plano con cotas), y '6500K' es un dato técnico que no le dice nada; el formato mezcla 'cm alt.' y '×' con espacios distintos.
- **Evidencia (verificador, medida por él):** NOTA DE ENTORNO: el servidor de http://127.0.0.1:8777 estaba caído (conexión rechazada; la compu se apagó). Levanté uno propio y solo de lectura en el puerto 8799 y lo apagué al terminar; el repo quedó intacto (git status solo muestra .claude/).

MEDIDO CON EL ARNÉS (Chromium propio, claro, 1280x900, hoja de mentiras, generarPDF() con el blob interceptado y el documento cargado a 900 px de ancho):
- Tabla de la cotización, columna Medidas, partidas armadas por mí: letras acero 40 cm x 8 imprime «40cm alt.»; letras aluminio 30 cm x 9 imprime «30cm alt.»; caja 240x60 imprime «240×60 cm»; bastidor 300x80 imprime «300×80 cm»; recorte 25 cm imprime «25cm × pieza». Con espacio solo las cajas y […]
- **Corrección al hallazgo original:** Lo real: (1) «cm alt.» sin espacio contra «240×60 cm» con espacio, (2) los kelvin en el papel del cliente, con la incoherencia de la caja, y (3) que la tabla no dice el largo del letrero. Lo que el hallazgo exagera o se equivoca:
A) «Esfuerzo S» solo vale para el espacio y los kelvin. Mostrar «≈ ancho × alto» en letras NO es S ni es de redacción: no hay dato de dónde sacarlo. Una partida de letras no captura el ancho (it.ancho y it.alto valen 0 y no hay campo en pantalla). Cuando viene del […]
- **Ya cubierto por:** Nada lo vigila ni lo descarta. No hay prueba que fije el texto de Medidas ni los kelvin, y no hay decisión de diseño documentada que los defienda. Solo lo plantea docs/ESTRUCTURA-COTIZACION-CANVA.md §6 (puntos 4 y 7), que sigue sin aplicarse mientras los puntos 1, 2 y 3 del mismo cuadro ya se hicieron. docs/REVISAR-PAQUETE-UI.md no lo lista.
- **Regla del skill:** number-formatting y consistencia de formato (Content: Number Formatting; Typography: Font Size Scale / consistency)
- **Arreglo:** CAPA 1, sin decisión de negocio, esfuerzo S. Todo en js/cotizador/entrega.js, es JS de plantilla, no CSS, así que no toca ninguna capa de la hoja de estilo ni tokens:
1. med() (~773) y medTxt() (~485): letras «${cifra(it.altura)} cm alt.», recorte «${cifra(it.altura)} cm × pieza». Con espacio, igual que ya hacen caja y bastidor. En medTxt usar el mismo cifra() (Number) que el PDF.
2. desc() (~735): el kelvin solo cuando para==='taller': `Cálida${para==='taller'?' (3000K)':''}` y `Fría${para==='taller'?' (6500K)':''}`. Así la cotización, las tarjetas de opciones y el PDF del cliente dicen «LED Fría», igual que ya dice la caja, y la orden de trabajo conserva el dato.
3. descTxt() (~473), el texto de Canva, que lee el cliente: quitar los kelvin igual.
4. No tocar descGemini (~546), los chips […]
- **Riesgo del arreglo:** CAPA 1: bajo. (a) La hoja del taller comparte desc() y med(): hay que condicionar los kelvin por `para`, no quitarlos a secas. (b) El sello/QR no se invalida: firma shortDescAuth(), no el texto de desc() ni de med() (renglonesDelPapel, entrega.js ~609). (c) El reparto de filas por hoja (altoFila) cuenta solo desc(): quitar «(6500K)» solo hace las filas iguales o más cortas, y probado por […]

### flujo-4 · [BAJA] En una cotización bloqueada (pendiente o autorizada), tocar un campo o chip apagado no produce ninguna respuesta  
`flujo-4` · Navegación y flujo · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/partidas.js:1432-1433 (_candTocarPartida: if(locked()||!faltanDatosCliente()) return) y su oyente en arranque.js:93; #h-N, #n-N, chips de #items
- **Qué le pasa al usuario:** El cliente pide cambiar una medida después de autorizar, el vendedor toca la altura y nada contesta: parece que la app se colgó. El mismo caso queda cubierto cuando lo bloqueado son los datos del cliente, pero no cuando lo bloqueado es el precio.
- **Evidencia (verificador, medida por él):** Servidor propio en el puerto 8981, porque el 8777 estaba caído; ya lo apagué. Arnés de Playwright, claro, sin modificar el repo (git status solo muestra .claude/ sin seguimiento).

A) 390x844 táctil, cotización autorizada. Esperé 7 s a que muriera el toast de la autorización; las primeras corridas mostraban un toast sobrante («Autorizada y sellada…») que no era respuesta al toque.
- Tres toques reales con touchscreen.tap: #h-1 (143x46, disabled), chip «Fría» (132x44) y chip «Brush» (270x44). Toast class «toast» sin «show», texto vacío, foco en BODY, sin .mira, Q.estado='autorizada' y Q.editMode=false sin cambio, y ningún valor de la partida cambia.
- #n-1 (mismo tamaño que h-1) y los chips […]
- **Corrección al hallazgo original:** Lo real: en una cotización bloqueada por el precio (autorizada o pendiente) tocar un chip o el marco de la partida no contesta nada, y _candTocarPartida (partidas.js:1433) sale en seco con locked(). Lo que el hallazgo dice mal: (1) «El mismo caso queda cubierto cuando lo bloqueado son los datos del cliente» solo es cierto para chips, etiquetas y marco. Los campos NO contestan en ninguno de los dos candados: medí con el candado de datos (teléfono vacío, 390 táctil, touchscreen.tap en #h-1) y […]
- **Ya cubierto por:** Parcialmente. Cubre la mitad del patrón: el candado de DATOS del cliente, para chips, etiquetas y marco, con el oyente _candTocarPartida (partidas.js:1432) y la prueba pruebas/navegador/cot-partidas.mjs sección 2d (con .click() de JS). Existe la puerta del candado de PRECIO como tira #cand-partidas (proceso.js:1593) y su prueba en cotizador-flujo.mjs:225-248. No cubre los campos apagados (#h-N, #n-N, #d-N, los .switch) en ningún candado, ni los toques sobre partida bloqueada por precio.</ya_cubierto_por>
</invoke>

- **Regla del skill:** error-feedback (mensaje cerca del problema) y disabled-states; el mismo principio que la propia app ya documenta para el candado de datos.
- **Arreglo:** Dos piezas.

1) CSS, capa (4) de estructura y movimiento de css/sistema.css, junto a `input:disabled,select:disabled,textarea:disabled{...}` (sistema.css:3053). Que el toque caiga en el contenedor en vez de morir en el control apagado:
`#items input:disabled,#items textarea:disabled,#items .switch:disabled{pointer-events:none}`
Para conservar el cursor not-allowed del ratón: `#items .fld:has(>input:disabled){cursor:not-allowed}`.
Sin tokens nuevos, una sola sombra, sin tocar la pila de z-index. Esta pieza arregla también los campos en el candado de datos, que hoy están igual de mudos.

2) JS, js/cotizador/partidas.js, al principio de _candTocarPartida, antes del return actual. Responde solo a controles, no a cualquier toque de lectura (se mantiene la excepción […]
- **Riesgo del arreglo:** - pointer-events:none en inputs apagados: se pierde el cursor not-allowed del ratón (por eso la regla :has de apoyo), y title/tooltip del input apagado. Texto de un input disabled ya no se podía seleccionar. Revisar que ninguna prueba haga p.click(force) sobre un #h-/#n-/.switch apagado esperando que no pase nada. Grep: solo cot-partidas.mjs:449-453 hace clic en un .switch, y ese está habilitado. […]

### flujo-6 · [BAJA] Recargar a mitad de captura conserva los datos pero devuelve la página arriba del todo y suma un escalón muerto al Atrás por cada recarga  
`flujo-6` · Navegación y flujo · PARCIAL · esfuerzo M

- **Dónde:** js/cotizador/arranque.js:96-104 (history.scrollRestoration='manual' + replaceState cliente + pushState partidas en cada arranque)
- **Qué le pasa al usuario:** En Android, ir a WhatsApp a pegar el PDF puede descartar la pestaña. Al volver, el vendedor está a miles de píxeles de donde estaba (la entrega) y el botón Atrás parece roto porque no hace nada visible. Se conservan los datos, no el lugar.
- **Evidencia (verificador, medida por él):** Medí en Chromium propio con Playwright, 390x844 táctil, tema claro, con la hoja de mentiras. Como el servidor de 8777 estaba caído (se apagó la compu), serví el repo desde disco dentro de Playwright con ctx.route; no toqué ningún servidor ni archivo del repo. Con esa vía repetí los números del hallazgo. (A) Partidas, 4 partidas, página de 4,089 px, scroll 750: tras recargar, y=0, mismos datos (4 partidas), history.length pasa de 3 a 4 y de 4 a 5 en la segunda recarga. (B) Autorizada, 4,495 px, scroll 2,844 con «Generar PDF» a 170 px: tras recargar y=0, página de 4,444 px, estado autorizada, pestaña 4 encendida. (C) Pila desde Partidas, Atrás repetido: 0 recargas es Cliente y salir (2 […]
- **Corrección al hallazgo original:** El mecanismo y los números del hallazgo son reales, pero la severidad «media» y el impacto están exagerados. 1) En la cotización autorizada, tras recargar la pantalla queda arriba, pero la pestaña «4 Entrega» está encendida y a la vista (a 126 px del borde superior), y la barra fija de abajo sigue mostrando «Total neto $81,664.00 · Generar PDF». Un toque en la pestaña 4 aterriza en la entrega (scrollY 3,600) y la barra deja el PDF a un toque, sin buscar nada. El vendedor no queda «a miles de […]
- **Ya cubierto por:** Nada lo cubre. Ninguna prueba de pruebas/navegador vigila la pila ni el scroll tras recargar. docs/FUNCIONES.md dice «Al recargar, la app abre donde toca» y que los datos sobreviven, sin hablar de scroll ni de pila. docs/REVISAR-PAQUETE-UI.md no lo lista. El comentario de arranque.js:96-101 documenta a propósito el scrollRestoration manual y la semilla de dos entradas, pero no el caso de recarga. El guard parcial de nucleo.js:381 sella la y solo al cambiar de pantalla o al abrir un modal.
- **Regla del skill:** state-preservation y back-stack-integrity (Navegación, alta); UX «Back Button: Preserve navigation history properly» (Alta) y form-autosave.
- **Arreglo:** Archivo: js/cotizador/arranque.js, dentro de init(), en el bloque de las líneas 102-106. No toca CSS ni capas de la hoja ni tokens. Reutiliza _sellarScrollDePantalla() de js/cotizador/nucleo.js:381, que ya omite el sellado si el estado es de una capa. Cambio probado con una copia parcheada servida por ctx.route, sin tocar el repo: sustituir el bloque try{ replaceState(cliente); if(_pantalla==='partidas') pushState(partidas) } por: const st=history.state; if(st&&st.cot&&st.pantalla===_pantalla){ if(st.y>0) window.scrollTo({top:st.y,behavior:'auto'}); } else { replaceState({cot:1,pantalla:'cliente',y:0},''); if(_pantalla==='partidas') pushState({cot:1,pantalla:'partidas',y:0},''); }. Y registrar document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') […]
- **Riesgo del arreglo:** Corrí volver-atras.mjs, capas.mjs y cotizacion-de-antes.mjs adaptadas a Windows, con y sin el parche (13, 16 y 21 comprobaciones ✓ en ambos casos, cero fallos, cero errores de página). No probé: modo empotrado en index.html (el historial de un iframe se mezcla con el de la plataforma; hay que mirarlo antes de publicar), un descarte de pestaña real en Android, ni el escalador y el vectorizador […]

### flujo-7 · [BAJA] El mismo estado y la misma acción reciben nombres distintos, y la jerga interna («sellar», «hoja», «renglones», «código de verificación») llega al vendedor  
`flujo-7` · Navegación y flujo · PARCIAL · esfuerzo M

- **Dónde:** js/cotizador/nucleo.js:647 (_ISLA_FRASES); proceso.js:1595, 395, 404, 325; partidas.js:1360-1367; notario.js:243; entrega.js:1936-1939; cotizador.html:167-168, 609-612; imagenes/partidas (tarjeta «Imágenes del PDF»)
- **Qué le pasa al usuario:** Un vendedor nuevo no sabe si «Mandada a autorización» y «Pendiente» son dos estados o uno, ni qué es «sellar» o «la hoja». Cuando falla el PDF, el aviso le habla en idioma de programador justo cuando necesita saber qué hacer.
- **Evidencia (verificador, medida por él):** Reproducido con Chromium propio (arnés copiado y ampliado con rol sin Dirección), a 390×844 táctil, tema claro, con servidor estático propio en otro puerto (el 8777 estaba caído). Repo intacto: git status solo muestra .claude/.

1) Vendedor SIN Dirección, tras Solicitar, estado «pendiente»: badge «Pendiente de autorización»; tarjeta de Partidas «Mandada a autorización · volver a editar» (49 px de alto, ámbar rgb(138,81,0)); progreso «Esperando autorización ›»; isla «Esperando a Dirección» (data-estado=esperando; a 390 px solo icono); riel «En este teléfono / En la hoja / Dirección decide» más la frase «Solicitud en el teléfono de Dirección…»; toasts «Precio bloqueado · mandando la solicitud […]
- **Corrección al hallazgo original:** Las cadenas citadas EXISTEN, pero el hallazgo exagera en cinco puntos. (1) Los «seis nombres» no son seis nombres rivales de un mismo estado: son etiqueta de estado (badge «Pendiente de autorización»), nombre de tramo del riel («Dirección decide»), evento (toast), pastilla (isla) y renglón de «qué sigue». Todas comparten la raíz «autorización» o «Dirección». La isla ni se lee en teléfono: a 390 px es solo icono (el texto queda en title y role=status). Lo que ve a la vez un vendedor en teléfono […]
- **Ya cubierto por:** Parcialmente cubierto por decisiones documentadas: (a) «Sellando/Sellada» y «hoja» como nombres del sello y de la hoja de Google están en docs/SISTEMA-DE-DISENO.md:1553 y :1615 (muestras de voz) y en docs/FUNCIONES.md:186; (b) «Autoriza el precio → Cierra el precio → Genera el PDF…» es una secuencia documentada en docs/FUNCIONES.md:144; (c) «Precio Subtotal» es deliberado por la plantilla de Canva (docs/FUNCIONES.md:182); (d) el patrón botón con etiqueta corta y title/aria-label con el destino largo está en SISTEMA-DE-DISENO.md §7.2 y lo vigila la prueba cot-cliente.mjs:477-487 («mantener presionado “Clientes” enseña su nombre»); (e) «Esperando a Dirección» en la isla está probado en cot-cliente.mjs:381-384 y el límite de que en teléfono solo se ve el icono está reconocido en docs/REVISAR-PAQUETE-UI.md:497-500. Ninguna prueba ni doc cubre que la tarjeta de Partidas diga «Mandada a autorización» en autoautorización, ni el vocabulario de los dos avisos del PDF sin QR.
- **Regla del skill:** consistency (Estilo) y error-clarity (causa + cómo arreglarlo, sin jerga); navigation-consistency: el destino debe llamarse igual en el botón y en su pantalla.
- **Arreglo:** NO adoptar el glosario de 5 palabras ni retirar «sellar/Sellando/Sellada» ni renombrar «Autorizar yo mismo» frente a «Solicitar autorización»: contradice texto documentado, deshace la separación a propósito entre autorizarse y pedir, y toca unas 20 aserciones. Hacer solo tres cambios de texto, en este orden de valor.

1) js/cotizador/proceso.js, pintarCandadoPartidas (≈línea 1595, el último ramal de `frase`): añadir la rama de autoautorización antes del texto «Mandada…»: `:_selfAuth?'Autorizando el precio · volver a editar'`. `_selfAuth` es un `let` del mismo archivo (proceso.js:1909). Probado inyectado en el navegador a 390 px: con autoautorización dice «Autorizando el precio · volver a editar», sin ella queda «Mandada a autorización · volver a editar», y cabe en una línea (18 px de […]
- **Riesgo del arreglo:** Bajo para (1): ninguna prueba afirma el texto de la tarjeta en pendiente (cotizador-flujo.mjs:233 y precio-suelto.mjs:148 leen la de autorizada). Mantiene la restricción de una sola línea (252 px, 18 px de alto). Para (2): si se cambia el prefijo, se rompen dos regex en pruebas/defensas-del-cotizador.mjs (266 y 280); conservándolo no se rompe nada. Hay que mantener el nombre de proyecto entre «» […]

### flujo-9 · [BAJA] Enter no avanza en los campos del cliente y los inputs no declaran enterkeyhint  
`flujo-9` · Navegación y flujo · PARCIAL · esfuerzo S

- **Dónde:** cotizador.html:321-331 (#f-tel, #f-cli, #f-proy); js/cotizador/arranque.js (sin manejador de Enter)
- **Qué le pasa al usuario:** En el paso más rápido de la app (tres campos), la tecla de acción del teclado no hace nada y hay que cerrar el teclado o alcanzar el botón. En PC, quien teclea tiene que coger el ratón.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído (conexión rechazada). Para medir levanté un servidor estático mío, de solo lectura, en el puerto 8996, sirviendo el repo tal cual, y lo apagué al terminar. No toqué ningún archivo del repo.

1) 390x844, táctil, tema claro, cotizador.html?solo=1 en pantalla Cliente.
- #f-tel, #f-cli y #f-proy tienen atributo enterkeyhint null (la propiedad enterKeyHint sale ""). Ninguno está dentro de un <form> (e.form es false), así que no hay envío implícito.
- Con Enter real de Playwright en cada uno (tel 33 1234 5678, cliente Farmacia San Juan, proyecto con texto): el foco se queda en el mismo campo y _pantalla sigue en 'cliente' en los tres casos. No sale […]
- **Corrección al hallazgo original:** Lo real: no hay enterkeyhint (null en los 3), Enter no hace nada ni avanza foco ni pantalla, y no hay manejador. Lo exagerado o erróneo:
(a) «En PC, quien teclea tiene que coger el ratón» es falso. Con Tab, desde #f-proy se llega a #p1-btn en 4 pulsaciones (dir-raw, maps, summary del PDF, botón) y Enter lo activa; el botón está visible en escritorio.
(b) «La tecla de acción del teclado no hace nada» está medido solo con Enter de escritorio emulado en táctil. En Android Chrome real puede que ya […]
- **Regla del skill:** input-type-keyboard (configurar el teclado móvil) y keyboard-nav.
- **Arreglo:** Capa: solo marcado y JS. No hay CSS ni tokens, así que no hay capa de hoja ni z-index que respetar.

1) cotizador.html, líneas ~321-331:
- #f-tel y #f-cli: añadir enterkeyhint="next".
- #f-proy: añadir enterkeyhint="go".

2) js/cotizador/arranque.js, dentro de armarCotCliente(), DESPUÉS de armarComboClientes() (así el listener del combo corre primero y el nuevo puede leer e.defaultPrevented):
['f-tel','f-cli','f-proy'].forEach(id => { const el = $(id); if (!el) return; el.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.isComposing || e.repeat || e.defaultPrevented) return; e.preventDefault(); if (id === 'f-proy') continuarAPartidas(); else $(id === 'f-tel' ? 'f-cli' : 'f-proy').focus(); }); });

continuarAPartidas() ya valida: con datos faltantes saca el aviso, marca el […]
- **Riesgo del arreglo:** - Cascada y combo: el orden de los listeners importa. Si el nuevo se registra antes que el del combo, Enter con fila activa avanzaría sin elegir al cliente. Por eso va después de armarComboClientes() y con la guarda defaultPrevented. Medido: elegir con ArrowDown + Enter sigue funcionando.
- e.repeat: sin esa guarda, mantener Enter apretado recorre tel > cliente > proyecto > partidas de golpe.
- […]

### flujo-10 · [BAJA] Tras enviar el PDF y el WhatsApp, el botón principal sigue empujando «Registrar venta» aunque el cliente no haya aceptado  
`flujo-10` · Navegación y flujo · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/proceso.js:2467-2470 (dock) y 1480 (hecho[4] exige h.venta); partidas.js:1372 (siguientePaso)
- **Qué le pasa al usuario:** Una cotización mandada que espera respuesta del cliente (días) queda para siempre «incompleta» y el botón principal invita a registrar una venta que no existe; registrarla antes crea un proyecto ganado en la plataforma.
- **Evidencia (verificador, medida por él):** El servidor 8777 estaba caído (se apagó la compu). Serví el repo, sin tocarlo, con un python http.server propio en el puerto 8823, y lo apagué al terminar. git status sigue limpio, solo el ?? .claude/ de antes.

Medido con el arnés a 390x844, táctil, movimiento reducido, estado autorizada con marcarHito('pdf') y marcarHito('wa').
- Claro: dock «Registrar venta», clase 'mbar-btn' (con relleno), fondo rgb(64,96,248), texto blanco. El renglón de Completitud (#prog-next) dice «Registrar venta ›». --avance = 0.75. La pestaña 4 es 'paso-tab on'.
- Oscuro: mismo estado, fondo rgb(59,87,230).
- Con venta registrada: dock «Entregada» con 'mbar-btn gho' (claro fondo #fff, texto rgb(26,29,51); oscuro […]
- **Corrección al hallazgo original:** Lo literal es real, pero el hallazgo exagera y se equivoca en tres cosas. (1) «El paso 4 sigue sin palomita» no se debe a la venta: el paso 4 es el paso ACTUAL y el código solo pone palomita a los pasos que no son el actual (proceso.js: ok=hecho[n]&&!esta). Medido: con la venta ya registrada la pestaña 4 sigue siendo 'paso-tab on', sin palomita. Lo único que cambia al registrar la venta es --avance 0.75 a 1.00 y el dock a «Entregada». Desde otro paso la pestaña dice «falta la venta», que es […]
- **Ya cubierto por:** Parcialmente. (a) Decisión documentada: docs/FUNCIONES.md:57-59 y 144, entrega.js:354-367 y proceso.js:1385, 1480 y 2467-2470 (la entrega son PDF, WhatsApp y Venta, y «entregada» solo con los tres). El «chat abierto» y no «enviada» está explícito en el comentario de entrega.js. (b) El seguimiento de las mandadas sin cerrar ya existe en el Historial: ficha «Sin venta» (HIST_FILTROS en historial.js:~470), puntos de hitosHist() y la vigencia «Vence en N días». (c) pruebas/navegador/cot-entrega.mjs vigila el riel de tres pasos, pero ninguna prueba vigila el rótulo ni el relleno del dock tras pdf y wa sin venta.
- **Regla del skill:** multi-step-progress / state-clarity (el indicador debe decir el estado real: aquí «enviada, esperando respuesta» no existe).
- **Arreglo:** No aplicar el arreglo propuesto. No tocar hecho[4], --avance ni la etiqueta «entregada», y no escribir «Enviada · esperando al cliente».

Si Elías quiere reducir el riesgo real, que es registrar una venta que no existe, el arreglo va en el modal y no en el dock. En cotizador.html, dentro de .rv-body justo antes de .rv-grid, una sola línea fija con la clase existente .hintnote (sin CSS nuevo, sin manejador en línea). Texto corto: «Regístrala cuando el cliente confirme y cobres el anticipo.» Lo probé inyectado con un texto largo de unas 20 palabras. Con el texto largo la nota midió 60 px de alto, a 11 px, en claro y oscuro, y el modal pasó de 1226 a 1298 px de contenido, o sea +72 px. Con la frase corta debería costar la mitad. Es opcional (esfuerzo S).

Alternativa de solo texto en el […]
- **Riesgo del arreglo:** Del arreglo propuesto por el revisor:
- hecho[4]=pdf&&wa mueve --avance a 1.00 al mandar y regala la palomita del paso 4 antes de que haya venta. La etiqueta «entregada» pasaría a significar «chat abierto», contra lo documentado en FUNCIONES.md:59.
- «Enviada» contradice el comentario de entrega.js:354-366 (la app no sabe si se mandó).
- Dock en gho mientras el riel de Entrega deja Venta en […]

### formularios-2 · [BAJA] El precio autorizado acepta $1, $99,999,999 y negativos, y se sella sin avisar ni pedir confirmación  
`formularios-2` · Formularios y retroalimentación · PARCIAL · esfuerzo M

- **Dónde:** js/cotizador/proceso.js:722 (#a-precio) y :754 updPrecioAuth(); tope solo en el deslizador, proceso.js:567; puente/hoja-apps-script.gs:2865 cotTotalFinal()
- **Qué le pasa al usuario:** Un cero de menos al teclear (1760 en vez de 17600) se sella como 90 % de descuento sin que nadie pregunte; el único rastro es una línea en chiquito. Al teclear un negativo, el campo enseña un número y la cotización usa otro. Dirección es quien firma, pero sellar en la hoja es el paso más pesado de la app y tiene menos fricción que borrar una partida.
- **Evidencia (verificador, medida por él):** Reproducido con el arnés de Playwright a 390x844, tema claro, táctil, flujo «Autorizar yo mismo» (subtotal calculado $17,600, neto $20,416). El servidor 8777 estaba caído; usé el 8791, un http.server de Python que sirve la misma carpeta del repo. Scripts en scratchpad/uiux/ver-formularios-2a/ (rep.mjs, tec.mjs, post.mjs, fix.mjs).

CONFIRMADO, con clic real en #a-autorizar y sin modal de por medio (modales abiertos: ninguno):
- Con «1» el campo dice «Descuento: $17,599.00 (100%) sobre el subtotal», Q.precioAuth queda en 1.16, Q.estado pasa a autorizada y el toast dice «Autorizada y sellada en la hoja».
- Con «99999999» la frase dice «Aumento: $99,982,399.00 (568082%)» y se sella […]
- **Corrección al hallazgo original:** 1) La severidad es baja, no media. La acción se puede deshacer con un toque («Volver a autorizar el precio»), la hoja conserva la autorización vieja como 'superada', lo sellado se ve de inmediato en el dock, y solo Dirección autoriza.
2) «El límite vive solo en el deslizador» es una decisión de diseño de C18, no un descuido. El comentario de proceso.js:~552 dice que teclear −25 % deja la perilla en el tope y que la frase dice la verdad. cot-precio.mjs:319-322 lo vigila. Lo que falta es la […]
- **Ya cubierto por:** Parcialmente, y por diseño:
- proceso.js:~552-566 (comentario C18): teclear fuera del rango es intencional, la perilla se queda en el tope y «la frase de abajo dice la verdad».
- pruebas/navegador/cot-precio.mjs:319-322 vigila ese comportamiento. Tecleando −25 %, la perilla queda en el tope, se marca con .fuera y la frase dice (25%).
- El anticipo, que sí se acota con aviso (proceso.js:2655-2680), está documentado como patrón «una regla, dos sitios».
- La hoja ya rechaza precioAuth<0 y >1e9 (hoja-apps-script.gs:3392) y deja constancia de cada sello con el porcentaje de descuento y su estado 'vigente'/'superada'.
- «Volver a autorizar el precio» (reautorizar, proceso.js:1991) deshace un sello equivocado con un toque.
- No hay prueba ni documento que cubra ni el negativo ni el color del descuento fuera de rango. Ese hueco sí es nuevo.
- **Regla del skill:** confirmation-dialogs · inline-validation · error-clarity (Forms & Feedback); «Confirmation Dialogs» --domain ux
- **Arreglo:** Dos piezas, ambas en js/cotizador/proceso.js y sin tocar CSS ni tokens.

A) Pregunta al sellar, solo fuera del rango del deslizador (pendiente de decisión de Elías).
- Dónde: dentro de autorizarConfirmado(), justo después de calcular `paSub` y `precioAuth` (~línea 2085) y antes de `_sellando=true`. Así cubre #a-autorizar, el botón del dock y la continuación de «Autorizar de todos modos» del aviso de faltantes.
- Qué hace: si paSub>0 y el ajuste contra totals().sub cae fuera de [AJUSTE_DESDE, AJUSTE_HASTA], hace `if(!(await confirmar({titulo:'Descuento fuera de lo usual', texto:'Descuento de 90 % ($15,840.00) sobre el subtotal. Precio a sellar: $1,760.00 sin IVA. ¿Sellar así?', si:'Sellar así', no:'Revisar'}))) return;`. Título y verbo según sea descuento o aumento.
- Es una pregunta y no […]
- **Riesgo del arreglo:** - Ninguna prueba del repo que revisé autoriza con un precio fuera de rango. precio-suelto.mjs, cotizador-flujo.mjs y cot-precio.mjs teclean valores dentro de rango, o −25 % sin autorizar después. Pero no corrí la batería completa, así que antes de mergear hay que correr `pruebas/correr.sh --navegador`. Cualquier prueba nueva o futura que selle fuera de rango se quedará colgada esperando #conf-si. […]

### formularios-4 · [BAJA] El botón principal de la barra móvil queda «Autorizar yo mismo» muerto, sin decir qué falta  
`formularios-4` · Formularios y retroalimentación · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/proceso.js:2483-2487 (rama final de renderMobileBar: `dis:!listo`)
- **Qué le pasa al usuario:** El vendedor, con prisa y una mano, toca el botón pálido y no pasa nada ni se explica. Tiene que adivinar que hay que bajar a «Completitud», que está al fondo de la página, para ver «Partida 1 · falta altura». La app ya sabe qué falta y lo muestra en otro lado.
- **Evidencia (verificador, medida por él):** Medí con el arnés, 390x844, tema claro, táctil, movimiento reducido, partida en blanco y luego material + 8 letras sin altura (el servidor 8777 estaba caído, levanté uno mío en 8961 y lo apagué al terminar).
- #mbar .mbar-btn: texto «Autorizar yo mismo», disabled=true, title vacío, sin aria-describedby ni aria-disabled, opacity .55, cursor not-allowed, 185x46 px, y=779. Se repite con otros anchos (360, 344, 320) y en oscuro (390).
- Un toque táctil real en (275,802): scrollY queda igual, el pantalla sigue «partidas» y #toast queda con texto vacío. Nada pasa.
- Layout: #card-partidas mide 2037 px con una sola partida de letras. «Completitud / Partida 1 · falta altura ›» (.prog-box) está en […]
- **Corrección al hallazgo original:** Lo central es real: en la barra móvil el botón principal queda muerto y mudo mientras la cotización no tiene precio. Lo que estaba mal o exagerado: (1) La regla «disabled-states» que cita no respalda el hallazgo. Esa regla pide opacidad baja, cursor distinto y atributo semántico, y el botón ya cumple las tres (disabled nativo, opacity .55, cursor not-allowed). El apoyo real es la guía propia de la app (comentario de proceso.js:2475; docs/FUNCIONES.md:51 «un botón gris no explica nada»; el […]
- **Ya cubierto por:** Parcialmente. No hay prueba que vigile el estado disabled del dock en partidas incompletas. Sí está cubierto el caso hermano de datos del cliente: proceso.js:2474-2481 conduce con «Falta el teléfono ›», cot-precio.mjs sección 7 vigila el dock en la pantalla del cliente y el rótulo temporal. La partida misma ya dice qué falta (ficha ámbar «Falta 1 dato», línea «Falta: altura») y tocar el paso 3 del nav da un aviso con el motivo. docs/REVISAR-PAQUETE-UI.md no lista esto como limitación conocida. El principio ya está en docs/FUNCIONES.md:51 («un botón gris no explica nada»), pero la rama final de renderMobileBar no lo cumple.
- **Regla del skill:** disabled-states («Disabled States» --domain ux) · error-recovery · error-feedback; criterio de la propia app (proceso.js:2475)
- **Arreglo:** Archivo: js/cotizador/proceso.js, rama final de renderMobileBar (hoy líneas 2482-2487). No se toca CSS ni tokens: se reutiliza la variante `.mbar-btn.gho` de css/sistema.css (la misma que ya usa «Ver cola», «Editar» y «Entregada»), así que va en la capa de siempre, sin regla nueva. Cambiar solo la rama cuando no está listo y SOLO si hay a qué conducir:

```js
} else {
  const listo=Q.items.length>0&&totals().sub>0;
  const pend=listo?[]:partidasSinTerminar();
  if(!listo&&(!Q.items.length||pend.length)){
    let txt;
    if(!Q.items.length) txt='Agrega una partida';
    else { const f=pend[0];
      txt=f.vacia?'Partida '+f.n+' vacía'
         :f.faltan.length===1?'Falta '+f.faltan[0]
         :'Faltan '+f.faltan.length+' datos'; }
    b={cls:'mbar-btn gho',on:'irAPendiente()',txt,post:' […]
- **Riesgo del arreglo:** Bajo. Solo cambia la rama no-listo del dock móvil (≤920 px); #mbar es del cotizador y no está en index.html ni en el anidador. (1) La pila de z-index no se toca. (2) La regla «un botón de color por pantalla» mejora: la acción azul solo aparece cuando de verdad se puede autorizar. (3) El ancho del botón cambia con el rótulo (124 a 185 px medido a 390), así que el total de la izquierda se mueve un […]

### formularios-5 · [BAJA] Los errores del paso Cliente solo viven en un toast de 4.6 s y en color ámbar; no hay texto junto a cada campo  
`formularios-5` · Formularios y retroalimentación · PARCIAL · esfuerzo M

- **Dónde:** js/cotizador/proceso.js:1017 pintarObligatorios() y :1035 exigirDatosCliente(); css/sistema.css:1073-1075 (.fld.falta); cotizador.html:321-336
- **Qué le pasa al usuario:** Con el teclado abierto o el sol, el vendedor puede no llegar a leer qué falta. Cuando el toast se va, solo queda un campo ámbar sin palabra: para el teléfono a medias, el único detalle es el «4/10» del borde. Quien no distingue bien el ámbar depende de adivinar.
- **Evidencia (verificador, medida por él):** Arnés Playwright (el 8777 estaba caído; usé un http.server propio de solo lectura en 8885, ya detenido; repo sin cambios, git status solo muestra .claude/). 390x844 claro, táctil, formulario vacío, toque en «Continuar a partidas» del dock: a 0.1-2.5 s el toast existe (top 690, alto 68, texto «Antes de capturar partidas faltan el teléfono del cliente, el nombre del cliente y el proyecto.»); a 5 s ya no (alto 0). activeElement=f-tel desde los 100 ms. El rótulo-b del botón dice «Faltan 3 datos» pero vuelve a «Continuar a partidas →» antes de los 6 s (captura). A 6 s: los 3 .fld tienen clase falta; hijos de #fld-cli: LABEL, SPAN.req, INPUT, DIV.combo-menu; de #fld-proy: LABEL, SPAN.req, INPUT, […]
- **Corrección al hallazgo original:** Lo literal es cierto, pero el impacto y la severidad «media» están exagerados. Cierto: no existe ningún nodo de texto de error junto a los campos; el aviso sale con toast de 4.6 s; el rótulo «Faltan 3 datos» del botón dura 1.5 s; solo se valida al pulsar Continuar; el foco va a #f-tel. Mal o exagerado: (1) Dice que el teléfono a medias solo tiene «4/10» y que aria-describedby de los tres es solo el texto genérico. En el render el teléfono ya muestra el contador «7/10» como TEXTO (no solo color) […]
- **Ya cubierto por:** Parcialmente. El ámbar y aria-invalid los vigila pruebas/navegador/cot-cliente.mjs:306-312. El contador del teléfono «x/10» y «Faltan N dígitos» (solo-voz) vienen de Piezas.telefonoVivo (js/piezas.js:4289-4308). El aviso a lector de pantalla sale por #vozAlert. El foco al primer hueco y las esquinas ámbar vienen de irACampoProy/senalarLlegada (partidas.js:1464-1494). Que el ámbar aparezca solo tras un intento fallido es decisión escrita en proceso.js:1013-1015, y la decisión de no repetir el aviso en el formulario está en cotizador.html:332-335. Nada lo registra como limitación conocida en docs/REVISAR-PAQUETE-UI.md.
- **Regla del skill:** error-placement (alta) · inline-validation · aria-live-errors · color-not-only (Forms & Feedback); «Focusable Error Summary» --domain ux
- **Arreglo:** Opcional y de baja prioridad; si Elías lo quiere, mínimo y sin validar al salir del campo. (1) js/cotizador/proceso.js, dentro de pintarObligatorios() (línea ~1017): por cada campo que falta, crear/actualizar un span.fld-error#err-<campo> dentro de su .fld con texto CORTO: «Falta el teléfono», «Faltan 3 dígitos» (reusar P.telefono.frase o el conteo de Q.tel), «Falta el nombre», «Falta el proyecto» (usar c.corto, no c.nombre, para que quepa en 1 línea en la columna de ~158 px a 390 px); anteponer su id al aria-describedby del input; quitarlo y limpiar el id cuando deja de faltar (updProg ya llama a pintarObligatorios en cada tecla). Sin role=alert: el toast ya anuncia por #vozAlert y duplicaría la lectura. (2) css/sistema.css, capa base, justo después de la línea 1075 (.fld.falta […]
- **Riesgo del arreglo:** Salto de maquetación: cada campo crece ~17-19 px al aparecer el error y se encoge al llenarlo, así que lo de abajo se mueve mientras se teclea con el teclado abierto (medido en la inyección). Si el texto largo envuelve a 2 líneas en la columna de 158 px del grid2, la fila Teléfono/Cliente queda con alturas distintas (medido: 34 px frente a 17 px con --t2). El texto repite casi literal la etiqueta […]

### formularios-6 · [BAJA] Las medidas, cantidades y tarifas no tienen ningún tope ni aviso de magnitud, y el total sale difuminado por defecto  
`formularios-6` · Formularios y retroalimentación · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/partidas.js:1710-1779 (inputs h-/n-/an-/al-/ta-/pu-/pz-), :304 typeItem(), :381 saneaNum(); ningún input trae max
- **Qué le pasa al usuario:** Un dígito de más en la altura (400 en vez de 40, o 405 por la coma) multiplica el precio por diez y el vendedor, con el total borroso, puede no enterarse antes de mandarlo a autorizar o al cliente. Solo se ve al comparar la fórmula.
- **Evidencia (verificador, medida por él):** Reproducido con el arnés en 390x844, tema claro, táctil, movimiento reducido. El servidor de 8777 estaba caído; levanté uno propio y de solo lectura en otro puerto y ya lo apagué.
1) Base: acero inox, 40 cm, 8 letras. Subtotal $17,600.00, total neto $20,416.00.
2) Altura «99999»: subtotal $43,999,560.00, total neto $51,039,489.60. Sin aviso. # Letras «99999» con altura 405: subtotal $2,227,477,725.00. Con ambas en 99999 el dock enseña $637,987,240,063.80 sin desbordar (scrollWidth de la página 390 = ancho de pantalla).
3) Teclear «40,5» con teclado real en #h-1: value «405» y validity.badInput=false. Tras soltar el campo, it.altura=405, subtotal $178,200.00, total $206,712.00. En un HTML […]
- **Corrección al hallazgo original:** Lo real: ninguna medida, cantidad ni tarifa tiene tope ni aviso de magnitud (ningún input de partidas.js:1710-1779 lleva max, y no hay ninguna comprobación de «inusual» en js/). Y «40,5» se guarda como 405 sin decir nada. Lo exagerado: (1) «media» y «puede no enterarse antes de mandarlo al cliente». Nada llega al cliente sin pasar por Dirección: en borrador no existe ningún botón de PDF/WhatsApp en el DOM (medido, la columna f-entrega no se ve), y al pulsar Solicitar o Autorizar la cotización […]
- **Ya cubierto por:** Cubierto en parte, no del todo. (a) Dirección es la red de seguridad: solo una cuenta de Dirección autoriza (puedeAutorizar en proceso.js:1932-1935), el precio se ve sin difuminar al pasar a «pendiente», y el aviso ámbar «El subtotal pasa de $60,000» (proceso.js:45, #s-anti-excep) salta en el caso de 405 cm. (b) Por abajo, la regla de los 10 cm (revisarAlturasMinimas, catalogo.js:51) atrapa y avisa del dígito que falta (4 en vez de 40); por arriba no hay equivalente. (c) El difuminado es decisión documentada (ARQUITECTURA.md punto 8, prefs.js:189), no se reabre. (d) Ninguna prueba vigila extremos ni la coma en estos campos (grep en pruebas/ sin resultados); cot-precio.mjs solo prueba un anticipo de 99999. (e) docs/REVISAR-PAQUETE-UI.md no lo lista como limitación conocida.
- **Regla del skill:** inline-validation · error-clarity · input-helper-text (Forms & Feedback); el skill no trae regla de rangos, es juicio sobre «Confirmation Dialogs»
- **Arreglo:** Quitar del arreglo original el toast y el quitar el difuminado al enfocar. Hacerlo así, solo en JS de js/cotizador/partidas.js (sin tocar CSS: todo usa clases y tokens que ya existen):
1) Aviso persistente en línea con el componente que ya usa la regla de los 10 cm (partidas.js:1731): `<div class="hintnote nota-av" role="status"><svg class="svgi" aria-hidden="true"><use href="#i-aviso"/></svg> 405 cm de altura: ¿es correcto? Una letra de más de 3 m es poco común.</div>`. Va justo debajo del .grid3 de medidas en los 4 tipos con medidas (letras, recorte, bastidor, caja) y en la manual para cantidad/unitario, dentro de un contenedor `<div id="medida-av-${it.id}">`.
2) Se calcula desde el valor, como alturaDeRecorte, sin bandera guardada: una función `medidaInusual(it)` con umbrales en […]
- **Riesgo del arreglo:** Bajo. Es solo JS de partidas.js y un umbral en catalogo.js; usa .hintnote.nota-av, que ya existe y ya pasa claro y oscuro. Ver posibles roturas:
- Los umbrales mal puestos hacen ruido (alarma por fatiga) y la gente deja de leerlos. El 500 cm de ancho propuesto lo haría en fachadas grandes.
- Si el aviso se pinta en el template, hay que mantener sincronizado el contenedor medida-av-<id> con […]

### formularios-7 · [BAJA] Un teléfono de 11 a 15 dígitos pasa el filtro del paso 1 y WhatsApp abre un chat de otro país  
`formularios-7` · Formularios y retroalimentación · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/proceso.js:998 telIncompleto() y :999 datosFaltantes(); js/cotizador/entrega.js:112 telWhatsApp() y :158 pistaWhatsApp(); js/piezas.js:4293 frase()
- **Qué le pasa al usuario:** Un dígito de más es un error muy común al teclear desde el WhatsApp del cliente. La cotización queda con un teléfono equivocado que nadie marca como tal, y el vendedor puede mandarle el precio a un número ajeno. La app avisa «un teléfono incompleto engaña más», pero no lo contrario.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído (ERR_CONNECTION_REFUSED). Levanté uno propio y de solo lectura en el puerto 8794 sirviendo el repo, y al terminar lo detuve. No toqué el repo (git status solo muestra .claude/, que ya estaba sin seguimiento).

REPRODUCIDO con el arnés, 390x844, táctil, tema claro, paso 1 con cliente y proyecto llenos:
- «33123456789» (11 dígitos): contador «11/10», clase `tel-vivo revisa`, frase solo-voz «Son 11 dígitos: si es de México, sobra 1». datosFaltantes() no incluye `tel`. El clic real en «Continuar a partidas» pasa a card-partidas, con solo el aviso «Paso 2 de 4 · Partidas». Q.tel queda «33123456789».
- Con 12 y 13 dígitos pasa igual. Con 16 dígitos […]
- **Corrección al hallazgo original:** Es real que 11 a 15 dígitos pasan el paso 1 y que Entrega los trata como un número internacional sano («a +33123456789», wa.me/33123456789, hito «Chat abierto», sin aviso). Cambios al hallazgo original:
(a) Dónde: el paso 1 no es «sin ninguna advertencia», tiene el contador ámbar «11/10» y el borde ámbar, y no bloquear es una decisión documentada (docs/REVISAR-PAQUETE-UI.md:509). El hueco con evidencia nueva es solo Entrega.
(b) Alcance: con 16 dígitos o con prefijo 01/044 sobrante Entrega ya […]
- **Ya cubierto por:** Cubierto en parte. docs/REVISAR-PAQUETE-UI.md:509 registra que el paso 1 deja pasar 'revisa' a propósito. pruebas/piezas-numeros.mjs:205 y pruebas/navegador/piezas-numeros.mjs:460-461 vigilan que la pieza diga «revisa» (contador y ámbar). pruebas/cot-entrega.mjs sección 1 vigila que la pista sea igual a telWhatsApp.
Hueco de las pruebas: ninguna afirma qué debe pasar en Entrega o en el paso 1 con 11 a 15 dígitos sin «+» (solo con «+1…»), y el documento no menciona el lado de Entrega.
- **Regla del skill:** inline-validation · error-clarity · error-recovery (Forms & Feedback)
- **Arreglo:** NO bloquear el paso 1 (no cambiar telIncompleto ni datosFaltantes: respeta la decisión de REVISAR-PAQUETE-UI.md:509). Avisar en Entrega sin cambiar ok/num/destino/aviso:

1) js/cotizador/entrega.js, pistaWhatsApp(). En la rama `if(num)`, agregar un campo:
   const L=Piezas.telefono.leer(Q.tel,telWhatsApp);
   return {ok:true,num,destino:'a '+waLegible(num),aviso:'',revisar:(L.estado==='revisa')?Piezas.telefono.frase(L):''};
   Reutiliza la frase que ya existe («Son 11 dígitos: si es de México, sobra 1» / «Después del +52 van 10 dígitos: llevas 8»), sin copia nueva.

2) js/cotizador/proceso.js, entregaHTML(): hoy `const av=(w&&!w.ok)?…esc(w.destino)…`. Cambiarlo a `(w&&(!w.ok||w.revisar))` y que el texto sea `w.ok ? w.revisar+'. Revisa el teléfono en Cliente antes de enviar' : w.destino`. […]
- **Riesgo del arreglo:** Variante recomendada (campo nuevo `revisar` + línea ámbar):
- Bajo. ok, num, destino y aviso no cambian, así que siguen en verde las 6000 comparaciones de pruebas/cot-entrega.mjs:146-165 (w.ok === !!telWhatsApp, destino sin dígitos inventados) y la pista del paso.
- Las aserciones 'no hay .hito-av con teléfono bueno' (pruebas/navegador/cot-entrega.mjs:171) usan números sanos, que no activan […]

### formularios-8 · [BAJA] Los tres campos obligatorios no encadenan con la tecla Intro: sin enterkeyhint y Enter no hace nada  
`formularios-8` · Formularios y retroalimentación · PARCIAL · esfuerzo S

- **Dónde:** cotizador.html:321-336 (#f-tel, #f-cli, #f-proy) y :350 (#f-maps)
- **Qué le pasa al usuario:** Cada cotización empieza tecleando estos tres datos. Con el teclado del teléfono, la tecla de acción no avanza al siguiente campo ni al «Continuar»: hay que tocar cada campo y luego cerrar el teclado para llegar al botón. Son 3 a 4 toques de más en cada cotización.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído (conexión rechazada; la computadora se había apagado). Serví el repositorio en solo lectura desde un puerto propio (8851) con python http.server, con el arnés (PUERTO=8851), y al terminar lo detuve; el repositorio quedó intacto (git status solo muestra .claude/ sin seguir). 

MEDIDO (390x844, claro, táctil, estado «cliente»): #f-tel type=tel inputmode=tel; #f-cli, #f-proy y #f-maps type=text sin inputmode; #f-dir-raw textarea. enterKeyHint vacío (atributo null) en los cinco. document.forms.length = 0. 
Intro con teclado real de Playwright en #f-tel, #f-cli (lista cerrada) y #f-proy con los tres datos válidos: el foco se queda en el mismo campo […]
- **Corrección al hallazgo original:** Lo medible es real, pero el hallazgo exagera lo que no se pudo medir. (1) «La tecla de acción no avanza al siguiente campo» y «3 a 4 toques de más» se afirman sin teléfono real: con teclado de ventanilla de Chromium solo se puede probar la tecla Intro física, no el botón «Siguiente» del teclado de Android o iPhone. Android Chrome calcula solo la acción del teclado y suele ofrecer «Siguiente» aun sin <form>; iPhone tiene las flechas ‹ › de la barra de formularios; y el teclado de teléfono de […]
- **Regla del skill:** input-type-keyboard / «Mobile Keyboards» --domain ux · touch-friendly-input
- **Arreglo:** Sin CSS; el sistema de diseño no se toca. 
1) cotizador.html, líneas 321, 322 y 336 (marcado): enterkeyhint="next" en #f-tel y #f-cli; enterkeyhint="go" en #f-proy; inputmode="url" en #f-maps (línea 350; updMaps solo acepta https://, así que el teclado de URL encaja y además evita mayúscula y autocorrección al teclear un enlace). No tocar #f-dir-raw. 
2) js/cotizador/arranque.js, dentro de armarCotCliente(), DESPUÉS de la llamada a armarComboClientes() (ese orden importa): un solo bloque, por ejemplo: const SIG={'f-tel':'f-cli','f-cli':'f-proy'}; ['f-tel','f-cli','f-proy'].forEach(id=>{ const el=$(id); if(!el) return; el.addEventListener('keydown',e=>{ if(e.key!=='Enter'||e.defaultPrevented||e.isComposing||e.repeat||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey) return; e.preventDefault(); […]
- **Riesgo del arreglo:** (a) Orden de oyentes: si el nuevo keydown de #f-cli se registra antes que el de armarComboClientes (nucleo.js:1210) o en captura, se pierde la elección con teclado (probado: cliente «farm», teléfono vacío); romperían cot-cliente.mjs en sus Intro con fila activa. Por eso va después y con la guardia e.defaultPrevented. (b) Intro con la lista abierta pero sin fila activa avanza a Proyecto y deja el […]

### formularios-9 · [BAJA] «Datos que salen en el PDF (opcional)» no avisa que ya tiene datos y mezcla el plazo de taller, que no sale en el PDF  
`formularios-9` · Formularios y retroalimentación · PARCIAL · esfuerzo S

- **Dónde:** cotizador.html:355-379 (#pdf-extra-box) y js/cotizador/historial.js:2398 pintarPlazo()
- **Qué le pasa al usuario:** Alguien que escribió una nota para el cliente y cerró el bloque no puede saber de un vistazo si quedó guardada. Y quien lee «salen en el PDF (opcional)» tiene razones para no abrirlo, aunque ahí está el plazo que mueve la agenda del taller (el modal de Registrar venta lo vuelve a ofrecer, así que se corrige a tiempo).
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor de 8777 estaba caído (conexión rechazada, al parecer por el apagón). Levanté uno estático mío, de solo lectura, en el puerto 8931 y lo apagué al terminar. El repo quedó intacto: git status solo muestra .claude/, que ya estaba antes.

Reproducido con el arnés, en 390x844 táctil con movimiento reducido, en tema claro y oscuro. El <summary> de #pdf-extra-box dice exactamente «Datos que salen en el PDF (opcional)» en los tres estados:
- vacío y cerrado: 44 px de alto, 324 px de ancho;
- abierto y lleno: igual;
- cerrado con entrega, nota y entre calles escritos: igual.
No hay contador ni marca. El color del rótulo es rgb(92,97,132) en claro y rgb(167,172,214) en […]
- **Corrección al hallazgo original:** Lo real: el bloque cerrado no dice si ya tiene datos, y el rótulo «salen en el PDF» no es cierto para el plazo. Lo que el hallazgo exagera o yerra:
1. «2.5 semanas ya elegido por omisión» es solo una propuesta (plazoK null). No es un dato guardado, y un contador no debe contarlo.
2. El impacto del plazo es menor de lo que sugiere: quien no abre el bloque no pierde nada, porque se usa el propuesto y Registrar venta lo vuelve a ofrecer. Esa parte del impacto es casi cosmética; la que pesa es no […]
- **Ya cubierto por:** Cubierto en parte, no por prueba ni doc:
1. El comentario de cotizador.html:355-370 declara el plazo como opcional y aceptable con cero toques.
2. Registrar venta vuelve a ofrecer el plazo en #rv-plazo.
3. entrega.js:~950 ya imprime las hojas de orden de trabajo e instalación solo si hay datos.
Nada vigila ni documenta que el bloque cerrado no avise de su contenido, ni que «salen en el PDF» no cubra el plazo. docs/REVISAR-PAQUETE-UI.md:250 menciona pintarPlazo, pero solo por el cambio de layout de la nota (.plazo-nota), no por este tema.
- **Regla del skill:** progressive-disclosure · field-grouping (Forms & Feedback)
- **Arreglo:** Solo JS/HTML del cotizador; no hace falta CSS nuevo ni tocar sistema.css ni vidrio.css, así que no se mueve ninguna capa ni index.html ni el anidador.
1. Crear pintarPdfExtraResumen() junto a pintarObligatorios(), en js/cotizador/partidas.js (o proceso.js). Cuenta los de entrecalles, entrega y notaCliente que tengan texto sin espacios, más 1 si Q.plazoK está entre 1 y 5 (solo el elegido a mano, nunca la propuesta).
2. Si la cuenta es 0, quita la ficha. Si no, crea o actualiza dentro de '#pdf-extra-box>summary' un <span class="ptok pdf-n"> con «N dato(s)».
3. Llamarla al final de updProg() (partidas.js:1270) y al final de setPlazo() (historial.js). Con eso cubre teclear, nueva(), reabrir folio y cargar de la cola, porque renderItems() llama a updProg().
4. Usar .ptok tal cual. La doc 2.13 […]
- **Riesgo del arreglo:** Bajo.
- Ninguna prueba lee el texto del <summary> de #pdf-extra-box. La del pliegue (cot-precio.mjs:651-662) mide la altura de <details>, que no cambia, y el summary sigue en 44 px.
- No agrega color, sombra ni z-index. La ficha va dentro del flex del summary y no toca [hidden].
- Una pasada extra en updProg(), que corre en cada tecla: contar cuatro valores es barato. Evitar reescribir innerHTML […]

### layout-6 · [BAJA] La barra de arriba mide 123–177 px entre 561 y 1179 px y deja casi sin contenido el primer pantallazo en apaisado  
`layout-6` · Layout y responsive · PARCIAL · esfuerzo S

- **Dónde:** .topbar / .topbar-in (css/sistema.css, sticky top:3px a partir de 561 px); botones .btn-hist .lbl y .brand .t small; #undobtn (display:none ≤759 px)
- **Qué le pasa al usuario:** En iPad y laptops chicas la barra siempre ocupa una sexta parte de la pantalla, y en un teléfono acostado de 667 px la primera pantalla de una cotización casi no enseña nada. En la tableta el contenido se mueve 54 px al teclear el primer campo, cuando aparece «Deshacer».
- **Evidencia (verificador, medida por él):** Medí con el arnés de Playwright en tema claro. El servidor de 8777 estaba caído, así que levanté uno propio en 8946 y lo apagué al terminar. No toqué el repositorio (git status limpio salvo .claude/ que ya estaba).

LO QUE SE REPRODUCE
- Alto de .topbar sin Deshacer: 561 a 731 px mide 167 sin toque y 177 con toque (3 renglones). De 741 a 1131 mide 121/123 (2 renglones). Desde ~1141 mide 65/67 (1 renglón).
- Con Deshacer a la vista, 761 a 781 px vuelve a 167/177 (3 renglones). A 1091-1131 pasa de 65 a 121.
- A 768×1024 con toque: 123 y al teclear el primer campo 177, y #card-proy baja de y=237 a y=291 (54 px). A 1100×800 con ratón: 65 a 121 y la tarjeta baja de 175 a 231.
- Fold abierto, con […]
- **Corrección al hallazgo original:** El hallazgo exagera o se equivoca en cinco cosas.
(a) «Siempre pegada (position:sticky)» es falso en teléfono acostado con toque: a 667×375 la barra es `static` y se va con el scroll. Solo estorba en el primer pantallazo; por eso la afirmación del impacto sobre el teléfono acostado de 667 px está inflada.
(b) Las bandas de alto están corridas. 3 renglones solo en 561-~735 (y 761-781 con Deshacer), no hasta ~800. 1 renglón desde ~1131-1141, no desde 1180 (a 1179 medí 65).
(c) El salto por […]
- **Ya cubierto por:** Cubierto en parte. El teléfono (≤560 px) tiene su propio mecanismo y no se afecta. El teléfono acostado ya está resuelto por la regla de pantalla acostada (sistema.css ~1305, `position:static`). Deshacer ya se movió a solo-icono y a la barra de abajo en ≤759 px por este mismo motivo (comentarios ~1684-1711). Ninguna prueba cubre el alto de la barra entre 561 y 1179 px. Hueco real: cot-cliente.mjs mide la isla a 1100 px solo con la barra en 1 renglón, antes de que aparezca Deshacer.
- **Regla del skill:** ui-ux-pro-max 5 Layout & Responsive: fixed-element-offset, content-priority y layout-shift-avoid (3 Performance: content-jumping). UX «Sticky Navigation».
- **Arreglo:** NO aplicar el arreglo propuesto tal cual. Va en tres piezas, de la segura a la que decide Elías.

PIEZA 1, segura, sin decisión de producto (probada inyectada). css/sistema.css, capa 8, junto a «8.7 · El portátil» (o pegada a la regla `.topbar-in:has(.isla.ver) .brand .t small`, que ya establece que la aclaración «le cede su sitio»):
@media(min-width:761px) and (max-width:1179px){ body:not(.an) .topbar-in .brand .t small{display:none} }
Medido con toque y sin toque: la barra baja a 65/67 desde ~991 px (antes desde ~1141) con TODAS las palabras de los botones, y el salto de Deshacer en 1091-1131 desaparece (1100×800 tecleando de verdad: 65 sin Deshacer y 65 con Deshacer; etiquetas Clientes, Historial y Plataforma siguen en display:block). No cambia nada por debajo de 991 px.

PIEZA 2, […]
- **Riesgo del arreglo:** PIEZA 1: esconde «Anuncios Luminosos 3D» entre 761 y 1179 px. Es una aclaración opcional por diseño (sistema.css ~540-552, ya se oculta con la isla y a ≤560 px) y el logotipo ya dice AL3D; riesgo bajo. Se acota con `body:not(.an)` porque anidador-vectores/index.html comparte `.topbar-in`; ese anidador ya se protege con `.an .topbar-in .btn-hist .lbl{display:inline}` (especificidad 0,4,0), pero […]

### layout-7 · [BAJA] Capturar una partida de letras cuesta casi dos pantallas útiles en teléfono y el commit «menos scroll» no tocó el cotizador  
`layout-7` · Layout y responsive · PARCIAL · esfuerzo M

- **Dónde:** .partida / .pbody / .psum / .optgrp (js/cotizador/partidas.js, css/sistema.css); commit 42c48ad solo modificó plataforma, publicaciones y proyectos
- **Qué le pasa al usuario:** Cada cotización de letras exige dos pantallas de deslizar con el pulgar, y revisar 6 o más partidas con la lista plegada ocupa un cuarto de pantalla por partida. Con prisa, la gente se salta Iluminación o Complejidad sin darse cuenta.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor de 127.0.0.1:8777 estaba caído (conexión rechazada), así que levanté uno propio y de solo lectura en el puerto 8861 desde mi carpeta, con el arnés y PUERTO=8861. No toqué el repo (git status solo muestra .claude/, que ya estaba antes). Todo en tema claro, táctil, movimiento reducido; el diseño no depende del tema.

NÚMEROS DEL REVISOR QUE REPRODUZCO (390×844, paso Precio, 1 partida de letras de acero, 40 cm, 8 letras):
- El documento mide 3258 px y la partida abierta 1399 px. Cabecera .pcab 268.9 = .partida-top 123 + .psum 116.9. Material 341, Iluminación 141.1, Complejidad 141.1, altura y # letras 67.1, texto 44, «Proponer otra opción» 84.9, plano 79.9. […]
- **Corrección al hallazgo original:** 1) La medición es correcta, pero el diagnóstico «el resumen repite lo que se eligió justo debajo» es falso en teléfono: lo de abajo está a 500 px o más, y el resumen es lo único en la primera pantalla que dice los valores por omisión y «Faltan N datos». Ocultarlo no es una mejora gratis. 2) De los cuatro arreglos, solo el de Complejidad (−50 px) se sostiene, y con un selector acotado, un piso de 360 px y minmax(0,1fr). Material en 2 columnas ahorra 18 px y no 150, y deja píldoras de dos […]
- **Ya cubierto por:** Parcialmente, como decisiones documentadas que el hallazgo contradice: (a) comentario de css/sistema.css «El resumen se queda a la vista también con la partida ABIERTA» (antes display:none, se revirtió el 2026-09-04) y la regla .partida:not(.folded) .psum{display:flex}; en ≤560 px .pcab ya no se pega (decisión de 2026-09-18, misma sección), pero el resumen se conservó. (b) Comentario sobre `.chips-catalogo` en css/sistema.css (minmax(min(250px,100%),1fr), para que «Acrílico + Aluminio (Volumen)» no se parta en dos renglones dentro de la píldora). (c) docs/FUNCIONES.md, viñeta «Partidas plegadas: solo lo que se está cotizando» (descripción, lo elegido y total) y docs/SISTEMA-DE-DISENO.md §2.13. (d) Mitigación de largo en js/cotizador/partidas.js: «una abierta a la vez» (togglePartida/plegarOtras/addItem/sincronizarPlegado) y #fold-all-btn «Plegar todas». docs/REVISAR-PAQUETE-UI.md solo menciona de pasada la partida abierta de ~1300 px, al hablar del arrastre. Ninguna prueba vigila la altura de la partida abierta ni la altura de la cabecera plegada.
- **Regla del skill:** ui-ux-pro-max 5 Layout & Responsive: content-priority y visual-hierarchy. Pro-rules: «Scroll and fixed element coexistence».
- **Arreglo:** Aplicar solo lo medido y seguro; descartar (3) y (4) tal como están escritos, y no ocultar .psum completo.

(A) Complejidad de letras en una sola fila, de ≥360 px (−50 px por partida, medido en 360, 375, 390 y 412):
 - js/cotizador/partidas.js: añadir un parámetro de clase a grupo(titulo,valor,chipsHTML,extraHTML,catalogo) y pasar, solo en la línea de letras `grupo('Complejidad',…)`, la clase 'optgrp-fila3'. No usarla en el recorte, que usa el mismo título.
 - css/sistema.css, en el bloque «Cierre de la hoja» junto a las reglas de `@media(min-width:390px) and (max-width:560px)` (o en un `@media(min-width:360px) and (max-width:560px)` colocado después de las reglas `.optgrp .chip` del bloque ≤560, y antes de la capa de vidrio): `.optgrp.optgrp-fila3 […]
- **Riesgo del arreglo:** Con el arreglo (A) acotado: bajo. Las reglas viven solo en la rama del cotizador (`.optgrp` no aparece en index.html ni en anidador; `.optgrp` se usa en partidas.js y proceso.js), así que la plataforma no se ve afectada. Riesgos: (1) un selector genérico por número de chips recorta «Tipo sándwich c/iluminación $55» en el recorte (medido, chip de 86×63 con scrollWidth mayor que clientWidth), por […]

### layout-8 · [BAJA] El ritmo de 4/8 px y los gutters no son sistemáticos  
`layout-8` · Layout y responsive · PARCIAL · esfuerzo M

- **Dónde:** css/sistema.css: .wrap padding (l.2493, l.2501, l.6080), .topbar-in padding, .chip, .optgrp, .card-h, .ptok
- **Qué le pasa al usuario:** No se rompe nada, pero el ritmo irregular hace que la app se sienta «apretada» en unas pantallas y floja en otras, y cada ajuste futuro obliga a medir a ojo.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído (ERR_CONNECTION_REFUSED). Serví el repo, solo lectura, con python http.server en el puerto 8947 con el arnés (PUERTO=8947) y lo paré al terminar. `git status` queda igual (solo `?? .claude/`). Scripts en .../scratchpad/uiux/ver-layout-8a/ (gutters.mjs, bordes.mjs, ritmo.mjs, ofensores.mjs, prueba-fix.mjs, seg2.mjs, final.mjs).

1) Lo que SÍ reproduce. Paso Precio, tema claro, movimiento reducido, con getComputedStyle sobre .topbar, .wrap y #mbar (solo elementos visibles):
- Valores de padding, margin y gap que no son múltiplo de 4: 276 de 522 a 390 px (52,9 %; el revisor dice 52 %) y 202 de 497 a 1280 px (40,6 %; el revisor dice 39 %). Los […]
- **Corrección al hallazgo original:** 1) Los números de fondo son correctos: 52,9 % a 390 px y 40,6 % a 1280 px de valores que no son múltiplo de 4; los gutters 10/16/24/20/24; los 4 px entre marca (12) y tarjetas (16) a 390-414. Ahí el hallazgo aguanta.
2) Exagera con «gutters no sistemáticos». Los gutters por tramo son decisiones documentadas del sistema (teléfono recorta marco; Fold con identidad propia; --pad-lat publicado para la plataforma), y la regla que cita, «Adaptive gutters by breakpoint», recomienda variarlos por […]
- **Ya cubierto por:** Parcialmente documentado, no vigilado. docs/SISTEMA-DE-DISENO.md l.64 fija «múltiplos de 4», pero l.334, l.709 y l.728 muestran .chip con 9 px, .badge y .ptok con 10 px, es decir, deriva en el mismo doc. La variación del gutter por tramo es decisión explícita (doc l.914 y l.919; comentarios de css/sistema.css ~l.2488-2501 y ~l.7023-7050). No hay prueba que vigile la alineación de la barra con las tarjetas ni el ritmo de 4. No está en docs/REVISAR-PAQUETE-UI.md.
- **Regla del skill:** ui-ux-pro-max 5 Layout & Responsive: spacing-scale y breakpoint-consistency. Pro-rules: «Adaptive gutters by breakpoint».
- **Arreglo:** Dividirlo en dos entregas. La primera es segura y está probada; la segunda queda pendiente.

A) Seguro y probado: alinear la barra con el .wrap solo en dos tramos.
- ≤389 px: `.topbar-in{padding-left:max(10px,env(safe-area-inset-left,0px));padding-right:max(10px,env(safe-area-inset-right,0px))}`. Además, en el mismo bloque, repetir el relleno en los dos botones anclados: `body:not(.an) .topbar-in .btn-tema{right:calc(max(10px,env(safe-area-inset-right,0px)) + 52px)}` y `body:not(.an) .topbar-in .btn-pf{right:max(10px,env(safe-area-inset-right,0px))}`. Sin esto los botones quedan a 12 y el resto a 10.
- 760-920 px (Fold abierto): `.topbar-in{padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}` dentro del bloque 8.6 `@media screen and […]
- **Riesgo del arreglo:** Una prueba que mide por render lo que cambiaría. Resumen de riesgos y de lo que ya medí.

- Subir .topbar-in a 16 px a 390-396 px rompe la barra: sube de 114 a 165 px (a 390 y a 393) o deja el texto a 0,9 px del borde (a 396), según arriba. Mover solo `padding` sin tocar los `right` de .btn-tema y .btn-pf (sistema.css ~l.879-881, que repiten `max(12px,...)` y `+52px`) descuadra los botones […]

### rendimiento-2 · [BAJA] Primera visita lenta: 14 guiones se descargan uno tras otro sin defer y la app tarda 9 a 11 s en estar lista con señal mala  
`rendimiento-2` · Rendimiento percibido · PARCIAL · esfuerzo S

- **Dónde:** cotizador.html:1093-1108 (14 <script src> sin defer/async al final del <body>); cotizador.html:80-84 (tema.js y las dos hojas bloqueantes)
- **Qué le pasa al usuario:** Un vendedor nuevo (o a quien el sistema borró la caché) que abre el cotizador por primera vez en obra con señal regular ve el cascarón 'Abriendo el cotizador…' unos 9 a 11 segundos antes de poder teclear el cliente. Con defer baja a unos 5.
- **Evidencia (verificador, medida por él):** Entorno: Chromium propio (Playwright), servidor estático mío con gzip y max-age=600 en HTTP/1.1 y HTTP/2, 390x844 táctil, tema claro. El repo quedó intacto (git status solo muestra .claude/). Mis servidores usaron los puertos 8851-8858 y 8871-8872 y quedaron cerrados.
A) Reproducción en cotizador.html?solo=1, CPU x4 + 3G rápido (1,6 Mbps, 150 ms), DOMContentLoaded en ms:
- Sin defer, HTTP/1.1: 8890, 8717, 7989, 8421 (cada cifra es la mediana de 3 corridas; rango 7352-10721).
- Con defer, HTTP/1.1: 6348, 5567, 5761, 6416 (rango 4988-7386).
- HTTP/2: 8560 contra 5725.
- Ventana de descarga de los guiones: 7,4-8,2 s contra 4,7-5,6 s.
- En la cascada cada guion arranca justo cuando termina el […]
- **Corrección al hallazgo original:** Lo real: en cotizador.html?solo=1 en frío los 15 guiones se piden uno tras otro. Lo que el hallazgo se equivoca:
1) EL DÓNDE. ?solo=1 no es la puerta de los vendedores. Es la salida de emergencia (js/mod/cotizador.js:500, el enlace «Abrirlo en su propia pestaña») y lo que usan las pruebas. cotizador.html sin ?solo=1 reenvía a ./#/cotizador (cotizador.html:62) y el start_url de la PWA es ./#/hoy (manifest.webmanifest:6). Lo que ve un vendedor nuevo es la plataforma con el cotizador en un iframe. […]
- **Ya cubierto por:** Parcialmente. El diseño ya asume cargas lentas: el esqueleto html.arrancando con tope de 8 s (cotizador.html:99-100), el marco del cotizador con esqueleto y el texto «Sigue abriendo el cotizador… tu red va lenta, pero va» a los 4 s, y 15 s de margen antes de la salida de emergencia (js/mod/cotizador.js). pruebas/navegador/carga.mjs vigila el esqueleto y la salida de emergencia, pero no mide tiempos de carga fría. El service worker de caché primero (sw.js) hace que la segunda visita tarde ~0,6-1,2 s.
- **Regla del skill:** Performance: third-party-scripts (load async/defer), critical-css, progressive-loading, network-fallback; Performance/Bundle Size del skill
- **Arreglo:** No aplicar defer como «arreglo de primera visita»: en la ruta real no la mejora y en mis corridas la empeora 0,8-1,5 s.
Si se quiere acelerar solo la salida de emergencia cotizador.html?solo=1 (cae de ~9 s a ~6 s), el cambio es de HTML, sin CSS ni tokens:
1) En cotizador.html:1093-1108, añadir `defer` a los 15 <script src> del final del cuerpo (qrcodegen, piezas y los 13 de js/cotizador). Dejarlos AL FINAL del cuerpo y no mover nada al <head>. js/tema.js (línea 79) se queda síncrono.
2) Actualizar las regex de pruebas/publicacion.mjs:161 y :166 y de pruebas/sintaxis.mjs:95 para aceptar ` defer`, por ejemplo `<script src="…\.js"(?: defer)?></script>`. Sin eso quedan en rojo.
3) Subir APP_VERSION en sw.js (88 a 89) al publicar.
4) Validar contra la ruta de la plataforma (marco, red […]
- **Riesgo del arreglo:** 1) Rompe 3 pruebas estáticas (publicacion.mjs:161 y :166, sintaxis.mjs:95) hasta que se actualicen sus regex.
2) Hay que subir APP_VERSION o no llega a los teléfonos que ya tienen la app.
3) En la ruta de producción medí que defer empeora 0,8-1,5 s la primera visita: el marco pide los guiones en paralelo y duplica bytes con la instalación del service worker. Mis n son pequeños (4 contra 4 y 2 […]

### rendimiento-4 · [BAJA] A los 8 s se destapa un formulario sin vida y lo que el vendedor teclea ahí no llega a la cotización  
`rendimiento-4` · Rendimiento percibido · PARCIAL · esfuerzo S

- **Dónde:** cotizador.html:92-100 (setTimeout(q,8000) que quita html.arrancando); js/cotizador/arranque.js:60 init() y su loadState()
- **Qué le pasa al usuario:** El vendedor ve 'Taqueria El Güero' escrito, toca Agregar partida y la app le dice que faltan los datos del cliente aunque están a la vista; o el campo parece funcionar y la cotización queda sin cliente.
- **Evidencia (verificador, medida por él):** Arnés propio con Chromium limpio, sin service worker, 390x844 táctil, tema claro. El servidor 8777 estaba caído, así que serví el repo en solo lectura con gzip desde mi carpeta (puerto 8893) y luego lo apagué. El repo no se tocó (git status solo muestra .claude/).

A) CPU ×4, 400 kbps, latencia 400 ms (4 corridas, r1, r2, r3 y r9):
- `arrancando` se pone a los 5,4-6,3 s (el script espera a la hoja de estilos) y se quita a los 13,3-13,8 s.
- init() queda definido a los 24,5-26,7 s, o sea unos 11-13 s de formulario visible y muerto.
- En el hueco hay 99 botones con onclick, el dock vacío y los pasos «1 2 3 4» sin rótulo.
- Cronología: Q definida a ~11,8 s, upd a ~15 s, undoJuntar a ~19-20 s, […]
- **Corrección al hallazgo original:** Lo central es real, pero el hallazgo se equivoca o exagera en cuatro cosas. 1) El tope de 8 s no es la única puerta: el oyente de error de la misma línea (cotizador.html:100, `addEventListener('error',q,{once:true})`) también destapa el formulario muerto, y es más fácil de disparar. Un toque en Historial, Clientes o Deshacer de la barra de arriba (visible y tocable durante el esqueleto, pointer-events:auto) lanza «abrirHistorial is not defined» y ese primer error quita la clase. Por eso el […]
- **Ya cubierto por:** Cubierto en parte. pruebas/navegador/carga.mjs («LA SALIDA DE EMERGENCIA: UN GUION QUE NO LLEGA», líneas 246-253, y «LAS DOS PÁGINAS SUELTAS», 205-244) vigila que el esqueleto salga con un guion bloqueado y que se vea mientras baja el arranque, pero no vigila lo tecleado en el hueco, ni el toque en la barra, ni que el tope de 8 s espere a init(). No aparece en docs/REVISAR-PAQUETE-UI.md ni en docs/SISTEMA-DE-DISENO.md como limitación conocida.
- **Regla del skill:** Performance: progressive-loading (skeleton, no UI engañosa), content-jumping; Forms: Input Feedback (estado coherente con lo que se ve)
- **Arreglo:** Dos piezas. Las dos las probé inyectándolas con page.route, sin tocar el repo.

(1) cotizador.html:100, el script en línea. Reemplazarlo para que:
- el tope de 8 s no destape la página mientras `typeof init!=='function'`. En ese caso sigue revisando cada 1 s y escribe en `.arranque-t` «Tarda más de lo normal en abrir. Si no aparece, recargar suele arreglarlo.» con un botón Recargar (`.btn.btn-gho`, `role=alert`), igual que ya hace la plataforma con `avisarLento` en js/app.js;
- el oyente de error solo cuente cuando `typeof init==='function'` y se quite solo después, sin `{once:true}`. Así un ReferenceError de un manejador en línea antes de arranque.js ya no destapa nada, y la salida de emergencia por init() reventado (carga.mjs:246) sigue funcionando.

Texto del script:
`(function(){var […]
- **Riesgo del arreglo:** - Parche (1): sin el tope de emergencia, un guion que nunca llega y no lanza error (por ejemplo arranque.js caído) deja el esqueleto con el aviso y el botón Recargar para siempre. Es el comportamiento buscado, mejor que un formulario muerto. Un error en init() sí sigue destapando.
- Parche (1) en el marco empotrado: `sano()` en js/mod/cotizador.js:167 espera a que `arrancando` se vaya. Con el […]

### rendimiento-5 · [BAJA] Cada toque a un chip, tipo, plegar, agregar o duplicar reconstruye la lista entera de partidas, incluidas las plegadas  
`rendimiento-5` · Rendimiento percibido · PARCIAL · esfuerzo M

- **Dónde:** js/cotizador/partidas.js:1053 renderItems (cuerpo de cada partida en :1147), :1029 _armarPartidas, :81 togglePartida, :290 setItem
- **Qué le pasa al usuario:** En un teléfono medio un toque a un chip o a plegar tarda más de 100 a 250 ms en responder; cotizaciones largas (10 o más partidas) se sienten pesadas y el dock tarda en actualizar el total.
- **Evidencia (verificador, medida por él):** Cómo lo medí. El servidor compartido de :8777 no estaba escuchando, así que levanté uno propio y de solo lectura en :8895 desde mi carpeta (lo cerré al terminar; el repo no se tocó). Usé el arnés en 390x844, tema claro, táctil y partidas creadas con duplicarUltima(). Las pruebas fueron toque táctil real con Event Timing (click hasta el siguiente cuadro pintado, redondeado a 8 ms), perfil de muestreo por CDP y A/B intercalado (actual, arreglo, actual, arreglo) para cancelar el ruido. El arreglo lo simulé parchando en la página cuerpoConOpciones y planoPartidaHTML para que devuelvan '' en las partidas plegadas.
Aviso de ruido: la máquina estaba saturada (154 procesos chrome/node en paralelo, […]
- **Corrección al hallazgo original:** Lo que sí es cierto: renderItems rehace toda la lista con innerHTML en cada toque, y los datos de tamaño salen idénticos a los del revisor (30 partidas = 366 789 caracteres y 6 313 nodos; partida plegada = 171 nodos, 103 en un .pbody display:none; 20 partidas ≈ 4 593 elementos).

Lo que está mal o exagerado:
1) Los tiempos están inflados. Con 1 partida a CPU x4 midió 124 ms de mediana en renderItems. Yo medí 11 a 25 ms de JS (mínimo y p25; mediana 47 a 62) y 12 a 44 ms con layout. Duplicar con […]
- **Ya cubierto por:** Ninguna prueba vigila el tiempo de renderItems ni el tamaño del DOM de las partidas: no encontré presupuestos de rendimiento en pruebas/, solo en historial y mapa. docs/REVISAR-PAQUETE-UI.md reconoce de forma parcial dos límites: que el viaje de View Transitions de repintarConViaje, con hasta 40 partidas nombradas, no se midió en un Android de gama media, y que cada renderItems recrea los letreros y sus ResizeObserver «sin medir». docs/SISTEMA-DE-DISENO.md §6.6 documenta el repintado completo como patrón («renderItems() es el patrón»), pero como contrato de foco y repintado, no como decisión de rendimiento. css/sistema.css deja decidido que el papel muestra las partidas plegadas desplegadas (@media print), decisión que el arreglo propuesto rompería si no se protege.
- **Regla del skill:** Performance: main-thread-budget (≈16 ms/cuadro), reduce-reflows, tap-feedback-speed (feedback antes de 100 ms), virtualize-lists
- **Arreglo:** Orden sugerido, de mayor a menor valor por riesgo:

A) En js/cotizador/partidas.js (JS, sin tocar la hoja de estilos), hacer que el toque a un chip (setItem) repinte solo la partida tocada. Habría que sacar de renderItems el constructor de una partida a una función propia, por ejemplo _partidaNodo(it,i), que también cuelga los oyentes de arrastre, el data-tono por posición y la clase nace. setItem reemplaza #p-id con ese nodo y corre solo la cola que ya existe: pintarConteoPartidas, pintarPlazo, renderSummary, updProg, saveState, _armarPartidas solo para esa partida y devolver el foco con _focoDeItems/_devolverFocoItems. Así el toque a un chip cuesta lo de N=1 sea cual sea N, que es lo que importa porque es el toque más frecuente. No lo simulé directamente; el costo del N=1 (manejador de […]
- **Riesgo del arreglo:** Riesgo del arreglo B (cuerpos vacíos en plegadas), el más serio:
- Rompe Ctrl+P sobre el borrador. Es una ruta documentada (css/sistema.css: «Un Ctrl+P sobre el borrador…», con @media print .partida.folded .pbody{display:block}). Medí que las plegadas pasan de 959 px y 10 chips a 0 px y 0 chips. Ninguna prueba lo vigila: pruebas/navegador/cot-entrega.mjs solo comprueba la impresión del visor del […]

### rendimiento-6 · [BAJA] Teclear una altura o cantidad se vuelve lento con muchas partidas: cada tecla repinta resumen, dock y barra de avance de toda la cotización  
`rendimiento-6` · Rendimiento percibido · PARCIAL · esfuerzo M

- **Dónde:** js/cotizador/partidas.js:304 typeItem (renderSummary(); updProg(); saveState()); js/cotizador/proceso.js:78 renderSummary, :2420 renderMobileBar
- **Qué le pasa al usuario:** Quien captura medidas con el dedo siente que la app se atrasa al teclear en cotizaciones largas, justo en la tarea más repetida de la app.
- **Evidencia (verificador, medida por él):** Condiciones: Chromium de Playwright, móvil 390x844 táctil, tema claro, CPU estrangulada x4 por CDP. La máquina estaba al 100 % de CPU porque corrían otros revisores, así que los milisegundos absolutos salen inflados. Por eso las comparaciones A/B van entrelazadas, una repetición de cada variante por turno. El servidor 8777 estaba caído y levanté uno propio en 8796 (ya lo apagué).

1) Reproducido en lo grueso. El perfil de CPU a x4 con 10 partidas y total mayor que $0 da por tecla: typeItem 74 ms, renderSummary 63 ms, renderMobileBar 30 ms, montarAnticipoPartido 23 ms. renderMobileBar y pintarPasos corren 2 veces por tecla (10 llamadas en 5 teclas): una desde renderSummary y otra desde […]
- **Corrección al hallazgo original:** Tres cosas del hallazgo están mal o exageradas. (1) El título dice que se vuelve lento «con muchas partidas», y no es así: el costo por tecla NO crece con el número de partidas. Depende de que el total sea mayor que $0. En la medición original la fila de 1 partida se tecleó con la cantidad de letras todavía en 0 (total $0, el anticipo escondido) y las filas de 10 y 30 con total mayor que $0. Se compararon cosas distintas. (2) «Reconstruir la tabla completa del resumen» no existe: renderSummary […]
- **Regla del skill:** Performance: input-latency (<100 ms), debounce-throttle, reduce-reflows
- **Arreglo:** Dos cambios pequeños en JS. Ninguno toca CSS, capas, tokens, z-index ni [hidden].

1) js/piezas.js, dentro de deslizadorConImanes, función pintarMarcas() (~línea 4600). Es el arreglo que da casi toda la mejora. La firma debe describir lo que se ve (posición relativa y rótulo), y si coincide hay que actualizar data-v en sitio y salir, sin vaciar ni volver a medir:
```
const lista = listaMarcas();
const firma = lista.map(m => (+k(m.v).toFixed(5)) + ':' + m.t).join(',') + '|' + cfg.imanes.map(im => +k(im.v).toFixed(5)).join(',');
if (firma === marcasPuestas && marcas.children.length === lista.length) {
  Array.from(marcas.children).forEach((s, i) => { const v = String(lista[i].v); if (s.getAttribute('data-v') !== v) s.setAttribute('data-v', v); });
  return;
}
```
El resto de la función […]
- **Riesgo del arreglo:** - js/piezas.js lo comparten el cotizador, el vectorizador (cot-vector.mjs, sus deslizadores de Detalle y Colores) y el deslizador del autorizador (#a-precio-r). El cambio vive solo en pintarMarcas de deslizadorConImanes. Riesgo bajo, porque la firma por posición y texto produce el mismo DOM visible; lo comprobé en los 6 estados y los 2 anchos.
- Riesgo teórico: que min o max cambien pero las […]

### rendimiento-7 · [BAJA] Cada versión nueva baja de golpe 108 archivos (2,6 MB gzip) aunque el cambio sea una línea; el cotizador solo necesita 0,8 MB  
`rendimiento-7` · Rendimiento percibido · PARCIAL · esfuerzo M

- **Dónde:** sw.js:43 APP_VERSION y la lista APP_FILES; evento install con cache:'reload'
- **Qué le pasa al usuario:** En obra con datos móviles cada actualización gasta unos 2,6 MB y compite con el trabajo en pantalla; con señal mala la instalación puede fallar y reintentarse varias veces.
- **Evidencia (verificador, medida por él):** Medido con un servidor propio en el puerto 8791 (el 8777 estaba caído y no lo arranqué). Servía una copia de HEAD en mi carpeta con ETag, «Cache-Control: max-age=0, must-revalidate» y brotli, como Cloudflare Pages. Usé Chromium con service worker activo, 390x844, esperando a que terminara la instalación.

Reproducción de la actualización. Subí solo APP_VERSION de 88 a 89 y llamé a reg.update(). Resultado: 119 peticiones, todas 200 y 0 reutilizadas (111 de APP_FILES, 7 de BASICOS y sw.js). Fueron 2.718.038 bytes por la red: js 1,25 MB, publicaciones 0,74 MB, css 0,26 MB, anidador 0,15 MB, vendor 0,13 MB. El hallazgo dice 2,61 MB gzip para APP_FILES; encaja (el resto son los PNG de BASICOS […]
- **Corrección al hallazgo original:** Los números son reales, pero el hallazgo se equivoca en tres puntos. (1) «El cotizador solo necesita 0,8 MB» es engañoso. cotizador.html reenvía a la plataforma (./#/cotizador) salvo con ?solo=1, que es la salida de emergencia y lo que usan las pruebas. En la práctica el cotizador se abre dentro de la plataforma, así que lo que de verdad se necesita ronda 1,8 MB. Lo que se puede separar es Publicaciones (solo rol «direccion») y la Mesa de corte (roles «direccion» y «fabricacion»): unos 0,9 MB, […]
- **Ya cubierto por:** Cubierto en parte. sw.js:171-173 documenta a propósito que las plantillas de Publicaciones pesan un mega y aun así se precargan («peor que un mega más en la instalación»). ninguna prueba ni doc vigila la cantidad de bytes de una actualización. pruebas/navegador/service-worker.mjs y service-worker-actualizacion.mjs vigilan la atomicidad (no mezclar versiones), pero no el peso. docs/REVISAR-PAQUETE-UI.md no lo lista.
- **Regla del skill:** Performance: offline-support, network-fallback, Bundle Size (monitor and minimize); Caching del skill (repeat visits fast)
- **Arreglo:** Cambio de una línea en sw.js, en el evento install, que no toca el algoritmo ni la capa de CSS. Cambiar new Request(u, { cache: 'reload' }) por new Request(u, { cache: 'no-cache' }) en dos sitios: el addAll de APP_FILES (~sw.js:261) y el add de BASICOS (~sw.js:237). Actualizar los comentarios de ahí, que explican por qué existe 'reload', para decir que no-cache también evita copias rancias porque revalida siempre. Corregir la línea de docs/ARQUITECTURA.md (~1110) que dice {cache:'reload'}. 'no-cache' manda If-None-Match: lo que no cambió responde 304 sin cuerpo y lo que cambió baja entero. La promoción sigue siendo todo o nada y no se mezclan versiones. Una instalación que falla a medias también se reanuda barata, porque lo ya bajado queda en la caché HTTP. No hay que separar cachés ni […]
- **Riesgo del arreglo:** Bajo. (1) Si el servidor no manda ETag ni Last-Modified, la petición condicional se vuelve completa y queda igual que hoy; Cloudflare Pages y GitHub Pages sí mandan ETag. (2) Si un navegador ignorara la opción cache (no probé Safari/iOS real), caería al modo por defecto, que en Cloudflare es max-age=0 y revalida igual. En GitHub Pages (max-age 600) podría quedar rancio hasta 10 minutos, que es el […]

### rendimiento-8 · [BAJA] CSS no usado: el 43 % de las reglas no se tocó en 5 anchos y 2 temas, pero no conviene recortarlas; quitar comentarios rinde mucho más  
`rendimiento-8` · Rendimiento percibido · PARCIAL · esfuerzo L

- **Dónde:** css/sistema.css (2 520 reglas de estilo, 212 @media, 54 @keyframes), css/vidrio.css (63 reglas)
- **Qué le pasa al usuario:** Poco para el vendedor: el CSS no usado casi no cuesta pintado, solo bytes. Recortarlo a mano arriesga romper hover, foco o la plataforma.
- **Evidencia (verificador, medida por él):** Todo medido con Chromium propio (arnés Playwright con CDP) sobre una copia de solo lectura del repo servida en un puerto mío; el 8777 estaba caído. No toqué el repo: git status solo muestra .claude/, que ya estaba.
- Cobertura. Reproduje 1 076 y 31 con su recorrido. Rastreo después de cargar: 1 023 de 2 525 reglas (40,5 %). Rastreo antes de navegar: 1 059 (41,9 %). Sumando una corrida con Tab, hover y mousedown reales (móvil claro y PC 1440 claro): 1 123 (44,5 %). Unión de todo: 1 169 de 2 525 (46,3 %), 48,3 % de bytes minificados.
- Tamaños de sistema.css. Original 546 556 caracteres, de ellos 275 878 son comentarios (50,5 %). Gzip con comentarios 163 734 B y brotli 129 180 B. Sin […]
- **Corrección al hallazgo original:** La conclusión se sostiene: no conviene purgar el CSS, el CSS no usado casi no cuesta al pintar, y lo que pesa son los comentarios. Pero el hallazgo se equivoca en varios puntos.
1) Cifras de uso. Reproduje exactamente sus 1 076 reglas de sistema.css y 31 de vidrio.css (mismo recorrido, 5 combinaciones más móvil con movimiento reducido). CDP solo devuelve reglas USADAS, nunca «no usadas». Las 1 076 incluyen unas 53 entradas que son bloques @media, no reglas de estilo (50 comprobadas una por una […]
- **Ya cubierto por:** Ninguna prueba vigila el peso ni el CSS no usado: lo busqué en pruebas/ y docs/ y no está. Lo que sí vigilan, y por eso el arreglo debe respetarlo:
- pruebas/hojas-de-estilo.mjs: las tres superficies enlazan css/sistema.css, vidrio.css va al final, y los tokens no se redeclaran.
- pruebas/piezas-hojas.mjs y pruebas/cot-ia-logica.mjs: usan los comentarios como anclas.
- pruebas/navegador/contraste.mjs: contraste por render, que una purga podría alterar.
La caché del service worker (sw.js, APP_FILES) ya amortigua el costo de bytes. No es limitación listada en docs/REVISAR-PAQUETE-UI.md.
- **Regla del skill:** Performance: critical-css, bundle-splitting; Performance/Bundle Size
- **Arreglo:** Dejar el hallazgo como «no purgar», con estas correcciones al texto:
- Cifras: 40-46 % de las 2 525 reglas de estilo usadas según cobertura, no 42,7 %. En bytes, 43-48 %.
- Causa: funciones propias del cotizador en estados no recreados, más hover/foco/medios. No es «otras superficies».
- Quitar la propuesta de sacar «.pf-* y .sp-*» a otro archivo: .sp-* es del cotizador, y lo exclusivo de la plataforma son ~25 reglas, ~1-3 KB.
- Cambiar la ruta de la prueba a pruebas/hojas-de-estilo.mjs.
- Sobre quitar comentarios (hallazgo 3): no se hace editando css/sistema.css. Si se quiere, que sea una copia minificada generada al publicar, y que el fuente conserve los comentarios. Eso es un paso de despliegue nuevo, fuera del repo y de las capas del CSS, y contradice el principio «sin build» (README […]
- **Riesgo del arreglo:** - Purgar con cobertura borraría: el esqueleto de arranque y html.arrancando (28 reglas que el rastreo tardío no ve), unas 154 reglas de hover, foco y activo, 145 de print, forced-colors y reduced-motion, y el 72 % que son funciones reales (historial, cuadernos, IA, Escalador, Vectorizador, riel, neón). Rompería la plataforma y el anidador, que comparten sistema.css, y pruebas/hojas-de-estilo.mjs. […]

### rendimiento-9 · [BAJA] El logo y los iconos van por red primero sin tope de espera: con señal que no responde el logo tarda en salir  
`rendimiento-9` · Rendimiento percibido · PARCIAL · esfuerzo S

- **Dónde:** sw.js:520 async function cotizador(req) (fetch(req) sin Promise.race); aplica a logo-al3d.svg, logo-al3d-oscuro.svg, iconos y manifest.webmanifest (BASICOS), que no están en APP_FILES
- **Qué le pasa al usuario:** En obra, con señal que no responde, la marca de la barra superior sale tarde o rota aunque el teléfono ya tenga la copia, y el evento load de la página tarda en terminar.
- **Evidencia (verificador, medida por él):** Lo que SÍ resiste (ahora medido, no solo leído). Código: sw.js:520 `async function cotizador(req)` hace `await fetch(req)` sin tope y solo cae a la caché `al3d-v1` si esa promesa rechaza; el logo, los iconos y manifest.webmanifest no están en APP_FILES ni los atrapa esDeLaPlataforma, así que pasan por esa función (el servidor de prueba registró justo /logo-al3d.svg y /icono-192.png como las peticiones colgadas). Los demás fetch del cotizador son de otro origen o blob:, o sea que solo esos archivos estáticos pasan por ahí. El archivo pesa 64 755 B crudo y 16,9 KB con gzip.

Reproducción con service worker REAL (el arnés lo bloquea, así que usé un servidor propio en puerto 18795 que sirve el […]
- **Corrección al hallazgo original:** La causa y el dónde son exactos (sw.js:520, BASICOS fuera de APP_FILES) y el evento load sí se retrasa. Pero: (1) no sale «rota», sale ausente, con un hueco de 0x38 px y el título corrido 76 px; al llegar el logo el título salta. (2) Solo ocurre cuando la caché HTTP está vencida o revalida (Cloudflare Pages siempre; GitHub Pages pasados 10 min); dentro de esa ventana el logo sale en ~0,6 s aunque la señal esté colgada. (3) La app no se bloquea: se pudo teclear y nada depende de window.load; el […]
- **Ya cubierto por:** No está cubierto. pruebas/pagina-sin-senal.mjs vigila el caso en que fetch RECHAZA (sin señal, con y sin copia) y pasa 41/41, pero ningún test, doc ni REVISAR-PAQUETE-UI.md cubre «fetch colgado con copia disponible»; ese es el hueco. El comentario de sw.js sobre cotizador() («red primero… correcto para un archivo que se publica subiéndolo a main») describe el cotizador de antes del cambio de septiembre y hoy solo aplica a la marca.
- **Regla del skill:** Performance: network-fallback (degraded modes for slow networks), offline-support
- **Arreglo:** Archivo: sw.js, función cotizador() (sin capa de CSS; no toca tokens ni z-index). Poner un tope de 3 s a la red cuando hay copia en `al3d-v1`, y limpiar el temporizador. Esbozo probado en copia (ver-rendimiento-9a/sw-parchado.js):

async function cotizador(req) {
  let t;
  try {
    const red = fetch(req).then(res => { if (res && res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {}); } return res; });
    const aTiempo = new Promise(ok => { t = setTimeout(async () => { try { const g = await (await caches.open(CACHE)).match(req); if (g) ok(sinRedireccion(g)); } catch (_) {} }, 3000); });
    return await Promise.race([red, aTiempo]);
  } catch (_) { ...el respaldo de hoy, sin cambios... }
  finally { clearTimeout(t); }
}

(En mi copia no puse […]
- **Riesgo del arreglo:** Verificado: pruebas/pagina-sin-senal.mjs corrida contra mi copia parchada da 41 bien, 0 mal (igual que con el sw.js del repo), y el camino sin señal real (modo avión) no cambia. Riesgos: (a) a veces servirá el logo guardado en vez de esperar al nuevo si la red tarda más de 3 s; poco costoso porque el install ya vuelve a bajar los BASICOS con cache:'reload' en cada sw.js nuevo. (b) Si el SW muere […]

### rendimiento-10 · [BAJA] Las fuentes vienen de Google (3 peticiones a 2 orígenes) y el service worker no las guarda: sin señal la tipografía cambia  
`rendimiento-10` · Rendimiento percibido · PARCIAL · esfuerzo S

- **Dónde:** cotizador.html:13-22 (preconnect, hoja de Google Fonts con media=print); sw.js (la línea url.origin !== self.location.origin descarta lo externo)
- **Qué le pasa al usuario:** Con y sin señal la app se ve igual de ordenada, pero en obra sin señal pierde su tipografía de marca, y cada primera visita paga dos conexiones extra a terceros.
- **Evidencia (verificador, medida por él):** Todo medido con Chromium propio, móvil 390x844, tema claro, en cotizador.html?solo=1 (el servidor 8777 estaba caído; levanté uno propio de solo lectura en 8861 y lo detuve; el repo quedó intacto). Scripts en <carpeta-de-trabajo> (fria.mjs, perfil.mjs, fidelidad.mjs, lenta.mjs, pdf.mjs, servidor-fix.mjs).
1) Carga fría reproducida igual que el revisor: 3 peticiones y 2 orígenes. Hoja fonts.googleapis.com 1 328 B (cache-control private, max-age=86400, stale-while-revalidate=604800) y dos woff2 en fonts.gstatic.com, Sora 25 313 B y Manrope 24 865 B (public, […]
- **Corrección al hallazgo original:** Los números del revisor son reales, pero la conclusión principal no. (1) «Sin señal pierde su tipografía de marca» es falso en el uso normal: el service worker no guarda las fuentes (a propósito, sw.js deja pasar todo lo de otro origen), pero el caché HTTP del navegador sí, y las sirve sin red aunque se cierre y se vuelva a abrir el navegador (medido abajo). Solo se perdería con el caché HTTP purgado (típico de iOS) o con más de 8 días sin abrir la app con señal (no medido; se deduce de las […]
- **Ya cubierto por:** En buena parte ya está cubierto: la hoja de Google se carga sin bloquear (media=print con onload, cotizador.html líneas 14 a 22; lección documentada en pruebas/navegador/camino-completo.mjs), trae font-display:swap y la pila de reserva Segoe UI, Roboto y Helvetica, y el caché HTTP del navegador ya sirve las fuentes sin red (medido). Que el service worker no toque lo externo es decisión documentada en sw.js (url.origin !== self.location.origin). Ninguna prueba vigila la tipografía sin señal, y docs/REVISAR-PAQUETE-UI.md no la lista; pruebas/csp.mjs solo exige la marca data-fuentes y el <link> de Google en index, acerca, privacidad y condiciones.
- **Regla del skill:** Typography: Font Loading (font-display swap, reserve space with fallback); Performance: font-preload, third-party-scripts
- **Arreglo:** Dejarlo como mejora opcional de la prioridad más baja; no hay urgencia para el vendedor. Si se hace: (a) woff2 propios latin variables de Manrope (24.8 KB) y Sora (25.3 KB, licencia OFL) en css/fuentes/, NO en una carpeta raíz /fuentes/: sw.js esDeLaPlataforma() solo reconoce /css|js|vendor|datos/ y /publicaciones/, y una carpeta raíz saldría por cotizador() (red primero, copia solo en al3d-v1) y no desde la caché de la app, que es lo que se busca. (b) @font-face en css/vidrio.css junto a --f-texto y --f-cifra (capa 8), con font-weight 400 800 para Manrope y 400 700 para Sora, font-display swap y unicode-range latin; vale igual al inicio de sistema.css porque @font-face no participa en la cascada. (c) Añadir los dos archivos a APP_FILES en sw.js y subir APP_VERSION de 88 a 89; sin eso los […]
- **Riesgo del arreglo:** (1) Si el @font-face queda en una carpeta fuera de /css/, /js/, /vendor/ o /publicaciones/, el service worker la sirve red primero y no precacheada: sin señal en la primera apertura no habría fuentes y parecería que el arreglo no sirve. (2) Olvidar subir APP_VERSION deja a los teléfonos con el cotizador.html viejo. (3) Quitar Google de la CSP rompe Inter en el PDF del cliente (medido). (4) Los […]

### tactil-2 · [BAJA] Un toque lento (≥350 ms) en un chip de material no elige nada: sale la «espiada» y el toque se traga  
`tactil-2` · Táctil e interacción · PARCIAL · esfuerzo S

- **Dónde:** .chip[data-peek] (material, complejidad, luz, tarifas) · js/cotizador/partidas.js _peekBajar (línea 860-865, 350 ms), _peekSubir (línea 877, _peekSuprimir) y _peekClic (880)
- **Qué le pasa al usuario:** Con guantes, sol, temblor o simplemente dudando sobre el chip (se aprieta y se piensa un instante), el vendedor suelta y no pasó nada. Tiene que adivinar que debe tocar más rápido. Es el control más usado de la captura.
- **Evidencia (verificador, medida por él):** Medido por mí con el arnés, 390x844, tema claro, tactil:true, dedo CDP (touchStart, espera, touchEnd), estado «precio» (acero inox 40 cm, 8 letras) con el material puesto en al-paint y el chip objetivo «Acero Inoxidable». Medí la duración dentro de la página (pointerdown a pointerup) y aparté el ratón de Playwright con mouse.move(1,1), porque si queda quieto sobre el chip dispara el peek por hover y contamina la medición. Base sin tocar: 92, 147, 249, 281, 315 y 345 ms eligieron acero (llegó el clic). 392, 400, 490, 582, 621 y 781 ms NO eligieron (el clic nunca llegó). En esos casos el peek apareció entre 354 y 382 ms tras el pointerdown. En otra corrida: 389 ms no eligió y 282 ms sí. El […]
- **Corrección al hallazgo original:** Lo real: el mecanismo y el umbral. En js/cotizador/partidas.js, _peekBajar (l.860-865) arma un temporizador de 350 ms; si pasa, marca t.visto=true; _peekSubir (l.871-879) fija _peekSuprimir=Date.now() al soltar con pointerup; _peekClic (l.880-885, capture sobre #items) se traga el clic. Lo que el revisor exageró o se equivocó: (1) El DÓNDE está mal. Solo llevan data-peek los chips de material en Letras (l.1680), acabado en Recorte (l.1722), bastidor (l.1751) y tarifa de Caja (l.1762). Los chips […]
- **Ya cubierto por:** Parcialmente. La decisión de que soltar tras asomarse NO elige está documentada y probada: comentario de js/cotizador/partidas.js l.789-801, mensaje del commit f9873c9 y pruebas/navegador/cot-partidas.mjs l.384-395 (aserta que soltar tras asomarse no elige y que un toque de 60 ms sí elige). docs/REVISAR-PAQUETE-UI.md l.158-159 reconoce que el gesto no se probó en teléfono real, pero solo menciona la pulsación larga del sistema y el :focus-visible. Ninguna prueba ni doc cubre el caso de un toque lento intencionado que se confunde con mantener. El hueco de la prueba es que solo mide un toque de 60 ms contra uno de unos 600 ms, nunca la franja de 300 a 500 ms.
- **Regla del skill:** gesture-conflicts / gesture-alternative / tap-feedback-speed (ui-ux-pro-max); search «gesture conflict swipe»
- **Arreglo:** Hacer la espiada táctil menos propensa a confundirse con un toque, SIN revertir C13. Archivo: js/cotizador/partidas.js (JS, no hay capa de CSS). Cambio 1: en _peekBajar (l.865) subir 350 a 500 ms, con el mismo valor en el comentario de las l.794 y 789-801. Elegí 500 porque queda alineado con lo que el sistema llama «mantener», deja pasar con holgura los toques lentos de 350-470 ms (medido) y la espiada sigue apareciendo antes de que termine un segundo; 600 también funciona pero se siente más lento para quien sí quiere comparar. Cambio 2, opcional y pequeño: en _peekMostrar (l.839), cuando la espiada viene de un dedo, sustituir « — toca para elegirlo» por « — suelta y toca para elegirlo», para no pedir «toca» a quien ya tiene el dedo encima. Hace falta distinguir tipo de puntero. […]
- **Riesgo del arreglo:** Subir el retardo a 500 ms: la prueba cot-partidas.mjs l.384-395 y su cabecera asumen 350 ms y fallarían o quedarían al límite sin ajustar. En teléfono real, a 500 ms el temporizador compite con la pulsación larga del sistema (Android Chrome o iOS, con contextmenu ya prevenido en l.1014), así que la espiada podría no llegar a verse o el clic perderse por el sistema; no pude medirlo con CDP y quedó […]

### tactil-3 · [BAJA] El botón principal del dock, «Autorizar yo mismo», queda apagado y mudo mientras no hay una partida con precio  
`tactil-3` · Táctil e interacción · PARCIAL · esfuerzo S

- **Dónde:** #mbar .mbar-btn · js/cotizador/proceso.js:2483-2489 (renderMobileBar: dis:!listo y atributos() escribe `disabled`)
- **Qué le pasa al usuario:** El vendedor toca el botón grande de abajo y no pasa nada ni dice por qué; debe adivinar que falta llenar la partida o recorrer la pantalla para encontrar la explicación.
- **Evidencia (verificador, medida por él):** Medido con el arnés (Chromium propio, tactil:true, movimientoReducido:true). El servidor de 8777 se cayó a media sesión; levanté uno de solo lectura en el puerto 8791 con PUERTO=8791 y no toqué el repo (git status solo muestra .claude/, que ya estaba sin seguimiento).

1) Reproducido (390×844, claro, llegarA("partidas"), partida de letras en blanco): el botón del dock #mbar .mbar-btn tiene disabled real, opacidad 0.55, cursor not-allowed, title vacío, sin aria-describedby ni aria-disabled. Mide 182×46 px y está en x=185, y=779. El botón #authbox .btn-pri también tiene disabled y opacidad 0.55.

2) Toque real con touchscreen.tap sobre el dock: pointerdown=1, click=0, 0 mutaciones del DOM, […]
- **Corrección al hallazgo original:** El núcleo es cierto: el botón principal del dock no contesta al toque y no dice por qué (probado con toque real: 0 clicks, 0 cambios). Pero el hallazgo exagera en cinco puntos. (1) #authbox no tiene el problema: su nota «Agrega partidas con precio para continuar.» está a 59–61 px debajo del botón. Solo el dock queda sin razón. (2) La razón no vive «solo debajo de toda la lista»: la partida en blanco muestra en pantalla su ficha ámbar «Faltan 3 datos» y «Sin elegir». (3) La ventana de silencio […]
- **Ya cubierto por:** Cubierto en parte, no del todo. No hay prueba que vigile el dock en este estado. El dock SÍ conduce en la rama del candado de datos del cliente (comentario en proceso.js ~2467 y docs/FUNCIONES.md ~89), pero no aquí. En #authbox el motivo ya está adjunto («Agrega partidas con precio para continuar.»). En escritorio el dock no existe. En el teléfono, la partida en blanco ya enseña su ficha ámbar «Faltan 3 datos». docs/REVISAR-PAQUETE-UI.md no lo lista como limitación conocida.
- **Regla del skill:** disabled-states / error-feedback / empty-nav-state (ui-ux-pro-max, Forms & Feedback); search «press feedback loading button»
- **Arreglo:** Archivo js/cotizador/proceso.js, función renderMobileBar, último else (tras `const listo=...`). No lleva CSS ni cambia capas: usa el .mbar-btn azul de siempre, el mismo patrón que la rama faltanDatosCliente («Falta el teléfono ›»).

```js
const listo=Q.items.length>0&&totals().sub>0;
if(!listo){
  const f=siguientePendiente();
  const n=f&&f.item?Q.items.findIndex(x=>x.id===f.item)+1:0;
  b={cls:'mbar-btn',on:'irAPendiente()',
     txt:!Q.items.length?'Agrega una partida':n?'Completa la partida '+n:'Falta una partida con precio',
     post:' ›'};
} else b=puedeAutorizar()
  ? {cls:'mbar-btn',on:'autorizarYoMismo()',ico:'i-rayo',txt:'Autorizar yo mismo'}
  : {cls:'mbar-btn',on:'solicitar()',ico:'i-rayo',txt:'Solicitar autorización'};
```

Se quita `dis:!listo` de las dos ramas, porque ya […]
- **Riesgo del arreglo:** Bajo.
- Ninguna prueba vigila hoy el dock apagado: grep de .mbar-btn en pruebas/ solo encuentra cot-precio.mjs §7 (pantalla del cliente y mutaciones al repintar sin cambios, que no se afecta porque el cambio es de rama y no de estructura), camino-completo.mjs y puente.mjs (los dos usan «Continuar» en el paso 1).
- cotizador-flujo.mjs:117 hace click en `button:has-text("Autorizar yo mismo")`. Con […]

### tactil-4 · [BAJA] Presionar no confirma nada en 10 de 28 controles, y con «menos movimiento» casi en ninguno  
`tactil-4` · Táctil e interacción · PARCIAL · esfuerzo S

- **Dónde:** Sin :active: .logobtn, .paso-tab (css/sistema.css:3260 transform:none), .tipo-seg button (css:2978), .psum, .prog-box, .sub-copiar, .mbar-tot, .plano-b, .pmover, summary. Con prefers-reduced-motion: css/sistema.css:7172-7176 (punto 3 del bloque «Menos movimiento»)
- **Qué le pasa al usuario:** Quien tiene «quitar animaciones» en su Android (o en cualquier teléfono con ese ajuste) toca los botones y la pantalla no responde hasta que termina la acción; con sol y prisa parece que no registró el toque y se toca dos veces. Lo mismo, en menor grado, al tocar un paso de la barra o una partida plegada.
- **Evidencia (verificador, medida por él):** AVISO PARA QUIEN ORQUESTA: por error corrí `taskkill /IM node.exe` y eso mató el servidor estático de http://127.0.0.1:8777, que no debía tocar. Quise relanzarlo y el permiso me lo negó. El puerto 8777 sigue caído y quien lo use tiene que levantarlo de nuevo. Yo seguí sin servidor, con una copia del arnés (scratchpad/uiux/ver-tactil-4a/arnes-local.mjs) que sirve los archivos desde disco con page.route de Playwright. El repositorio no se tocó.

MÉTODO: Chromium con emulación táctil a 390x844, con hover:none y pointer:coarse confirmados. Mido getComputedStyle de cada control en reposo y con el botón del ratón apretado (:active), con el elemento, sus ::before/::after y sus hijos. Los eventos […]
- **Corrección al hallazgo original:** Los números del revisor sí se reproducen, pero el hallazgo exagera en tres cosas. (1) Dice que «no existe ninguna regla de color en :active», y eso es falso: .pfold:active (sistema.css:2386, 2889, 4001), .hist-close:active (1735), .sp-fold>summary:active (1944, 3888), .sp-zoom button:active (2016), .combo-op:active (5035) y .sp-back-m:active (2196) ya cambian de fondo al presionar. Eso es precedente a seguir, no un vacío total. (2) La severidad «media» pesa demasiado. Casi todos los controles […]
- **Ya cubierto por:** Ninguna prueba lo vigila: no hay aserción sobre :active ni sobre presionar con movimiento reducido. Lo cubre solo a medias el principio escrito en docs/SISTEMA-DE-DISENO.md §2.18: «sin :active un control no confirma nada», y la fila «Menos movimiento no es ninguno». El código no lo cumple en los controles mudos. Que .paso-tab y .tipo-seg/.seg no escalen es decisión documentada (docs/SISTEMA-DE-DISENO.md ~líneas 481 y 492), pero no dice que se queden sin respuesta de color. docs/REVISAR-PAQUETE-UI.md no lo lista como limitación conocida.
- **Regla del skill:** press-feedback / state-clarity / tap-feedback-speed (ui-ux-pro-max)
- **Arreglo:** Un solo bloque en css/sistema.css, capa 8, justo después del bloque «Menos movimiento no es ninguno» (tras `@keyframes pulso-lento`, ~línea 7189). Va suelto, sin @media: es solo color, vale con y sin movimiento, y no hace falta repetirlo en la capa 3 como proponía el revisor. Probado inyectado antes de vidrio.css, que equivale a esa posición:

/* Presionar confirma con COLOR, no con movimiento (también con «menos movimiento»). Neutros: fondo del token; con relleno de color: brillo, y en oscuro se aclara porque oscurecer no se ve. */
:is(.paso-tab,.psum,.prog-box,.sub-copiar,.mbar-tot,.plano-b,.logobtn,.ivabtn,summary,.tipo-seg button,.seg button,.tool-seg button,
    .btn:not(.btn-pri,.btn-ok),.addbtn,.chip,.btn-scaler-open,.btn-vector-open,.precios-ver,.btn-maps,.card-fold,.btn-hist, […]
- **Riesgo del arreglo:** - sistema.css lo comparten index.html (plataforma) y anidador-vectores. Busqué en plataforma.css y anidador.css si .btn, .chip, .btn-hist o summary van sobre un fondo oscuro fijo (donde soft-2 claro dejaría texto blanco ilegible) y no encontré caso, pero no lo medí en esas superficies. Hay que correr pruebas/navegador/pf-*.mjs, an-*.mjs y anidador.mjs, y ver a ojo una pulsación en la plataforma. […]

### tactil-5 · [BAJA] Controles que quedan bajo 44 px contra lo que dice la guía: selector de tipo (40), Libre/Horizontal/Vertical del Escalador (34), «Del escalador/Subir plano» (34), vista Original del Vectorizador (34), fila «faltantes» (35.5), «Seleccionar archivo» (39)  
`tactil-5` · Táctil e interacción · PARCIAL · esfuerzo S

- **Dónde:** .partida .tipo-seg button (css/sistema.css:2580, @560) · .tool-seg button (css:2997, min-height:34px gana a la de 40 del @1000) · .plano-b (css:1643) · #vt-view-orig · .falt-ir (css:2318) · «Seleccionar archivo» en los modales Vectorizador/Escalador
- **Qué le pasa al usuario:** El Escalador es donde se miden los letreros con una mano en obra: cambiar entre libre, horizontal y vertical con botones de 34 px pegados entre sí produce toques en el vecino. El selector de tipo de partida (Letras/Recorte/Bastidor/Caja/Manual) cambia el tipo y borra lo capturado de ese tipo, y está a 40 px.
- **Evidencia (verificador, medida por él):** Medí yo mismo con Playwright (tactil:true, isMobile, matchMedia hover:none y pointer:coarse = true, movimientoReducido), tema claro. A 390×844 y 360×740 salen los mismos números del revisor: selector de tipo de partida 56×40 (54,8×40 a 360), 5 botones con gap 2 px y letra 10,5 px; Libre/Horizontal/Vertical del Escalador 124×34 (114×34 a 360) con gap 0; Original/Comparar/Vector del Vectorizador igual 124×34; .plano-b 113×34 y 53,7×34 (y la × 32×34, que el revisor no midió porque solo aparece con un plano puesto); .falt-ir 247,3×35,5 dentro de una fila de 66; «Seleccionar archivo» 198,6×39 en los dos modales. La cascada también se confirma: `.partida .tipo-seg button{min-height:40px}` (0,2,1, […]
- **Corrección al hallazgo original:** El hallazgo es real en los números y en la cascada, pero exagera el daño y mezcla cosas. Falso: que el selector de tipo «borra lo capturado» (solo cambia `tipo`, ida y vuelta deja todo igual). Exagerado: «toques en el vecino» por los 0 px del Escalador (cada botón tiene 114-124 px de ancho; el problema real es el alto de 34 y 10 px de más en la barra); la separación de .plano-b es de 6 px, no 0; «Seleccionar archivo» es un botón secundario de 198 px de ancho con una alternativa de 44 al lado; […]
- **Ya cubierto por:** Cubierto a medias. El bloque «(8) CIERRE TÁCTIL» de css/sistema.css y docs/SISTEMA-DE-DISENO.md §4.5 ya piden 44 px con dedo y ya cubren `.tipo-seg button`/`.seg button` sueltos (Proyectos, Agenda, Material) y muchos controles más; pero `.partida .tipo-seg button` (40, comentario de sistema.css ~2571-2579 como compromiso de cinco en un renglón), `.tool-seg`, `.plano-b`, `.falt-ir` y el botón «Seleccionar archivo» quedaron fuera por cascada. Ninguna prueba de pruebas/navegador mide su tamaño (an-controles, an-mesa, cot-entrega, cot-cliente y cot-escalador:260 miden otras piezas). docs/REVISAR-PAQUETE-UI.md no lo menciona como limitación conocida.
- **Regla del skill:** touch-target-size / touch-spacing / web-target-size (ui-ux-pro-max, Touch & Interaction); search «touch target size spacing»
- **Arreglo:** Todo en css/sistema.css, dentro del bloque táctil de cierre `@media(hover:none),(pointer:coarse)` que el propio archivo rotula «(8) CIERRE TÁCTIL» (en el doc de capas es la «5 de cierre»), justo antes de la `}` que sigue a `.ia-hdr{min-height:44px}` (~línea 6510), para ganar por orden. Probado inyectando el CSS en esa posición exacta (interceptando sistema.css en el navegador, sin tocar el repo), claro y oscuro, 0 errores de consola: 1) `.tool-seg button,.partida .tipo-seg button,.falt-ir{min-height:44px}` → tipo 56×44, Libre/H/V y Original/Comparar/Vector 124×44, falt-ir 247×44. NO hace falta el selector extra `.vt-modal-bg .tool-seg button`. 2) Para .plano-b, mejor la zona invisible que documenta §4.5 y no crecer 10 px cada partida: `.plano-b{position:relative}` […]
- **Riesgo del arreglo:** Bajo. Solo suben cajas, ni letra ni color ni tokens, así que no toca el sistema de diseño ni el tema oscuro (medido igual en claro y oscuro). `.tool-seg` solo existe en cotizador.html (modales Escalador/Vectorizador, el panel de cotas y la lista «qué partida se enseña», escalador.js:2459), `.partida .tipo-seg` está acotado a la partida, y `.plano-b`/`.falt-ir` son solo del cotizador: no afecta a […]

### tactil-6 · [BAJA] Fila de iconos de la partida: Duplicar / Ocultar del PDF / Borrar de 38 px pegados (0 y 2 px), el ▾ con 36 px recortado por la zona del número, y pasos de 42 px a 2 px  
`tactil-6` · Táctil e interacción · PARCIAL · esfuerzo S

- **Dónde:** #p-N .dup, .pdf-vis, .del, .pfold, .pmover::before (css/sistema.css:5102, inset:-11px -9px; css:7581 `.partida .partida-top .pfold{width:36px}`) · #tab-1..4.paso-tab
- **Qué le pasa al usuario:** Un toque ligeramente corrido puede ocultar del PDF una partida en vez de duplicarla, o abrir el borrar. Borrar con datos pide sostener y tiene «Deshacer», así que el daño es poco; el de «Ocultar del PDF» sí cambia el documento sin avisar.
- **Evidencia (verificador, medida por él):** Medí con el arnés (Chromium táctil, tema claro, 2 partidas; mi propio servidor en el puerto 8861, porque el 8777 estaba caído) y no toqué el repo.

**Fila de iconos (confirmado).** A 390, 375 y 360 de ancho, `.dup`, `.pdf-vis` y `.del` miden 38×44. Los huecos son dup→ojo 0 px y ojo→del 2 px. Un `gap:0` del bloque `@media(max-width:560px)` ~7570 (`.partida .partida-top>.ptop-actions{…gap:0}` y `.partida-top>.ptop-actions>button{width:38px}`) anula el `gap:4px`/`var(--e2)` de las capas ~2660 y ~6075, que decían que el hueco sube a 4-6 px. El comentario de 7566 dice «42 de ancho», pero el código dice 38.

**Zona de toque con elementFromPoint a 390.** Fila abierta: `.dup` 225.5–263.5, […]
- **Corrección al hallazgo original:** Los números del revisor son correctos. Lo que falla son cuatro cosas. (1) Severidad: es baja, no media. La doc la declara excepción (docs/SISTEMA-DE-DISENO.md §4.5: «40 px para los tres iconos de acción de una fila, que van juntos»). 38×44 pasa WCAG 2.5.8 (24 px). Un toque errado es visible y se deshace con otro toque. (2) «Ocultar del PDF cambia el documento sin avisar» es exagerado: medido en 390×844 táctil, al tocar el ojo la partida pasa a clase `hidden-pdf`, se ve atenuada y el ojo sale […]
- **Ya cubierto por:** Parcialmente. docs/SISTEMA-DE-DISENO.md §4.5 documenta los 40 px de los tres iconos como excepción deliberada («van juntos»). Las capas 2660 y 7570 de css/sistema.css explican el compromiso: 44 px con importe real parte el encabezado en dos renglones, y el comentario ~6071 ya cita «a 360 se va a 96». Los pasos compactos (pastillas de 40 px para que quepa en 320 px) están justificados en el comentario de css/sistema.css ~748-757. Ninguna prueba de pruebas/navegador/ vigila el tamaño ni el hueco, y el comentario de ~2650 que promete un hueco de 4-6 px quedó desactualizado por la capa 7570.
- **Regla del skill:** touch-spacing / no-precision-required / touch-density (ui-ux-pro-max)
- **Arreglo:** NO aplicar el arreglo propuesto. Esto es lo que sí sirve, con cada pieza medida en el navegador inyectando el CSS:

**1. `.paso-tab` (css/sistema.css, capa 5/cierre, dentro del `@media(max-width:560px)` donde ya está `.paso-tab:not(.on){padding:8px 9px;gap:0}`, ~línea 765).**
Agregar `min-width:44px`. Medido a 320, 344, 360, 390, 414, 430, 480 y 560 (pantallas cliente, partidas y autorizada): los tabs hechos pasan de 42 a 44×48, la pestaña activa cede 2–6 px, la barra mide igual (62 px) y no desborda. La prueba de contraste de las pestañas sigue valiendo.

**2. Fila PLEGADA, solo hasta 390 px (misma capa de cierre).**
```
@media(max-width:390px){
 .partida.folded .partida-top>.ptop-actions{gap:8px}
 .partida.folded .partida-top>.ptop-actions>button{width:44px;min-width:44px} […]
- **Riesgo del arreglo:** **Arreglo original del revisor.** Rompe el encabezado abierto a 390, 375 y 360 con cualquier importe real: +52 px por partida abierta y los iconos solos en un renglón. Además reduce la zona de arrastre del número.

**Arreglo propuesto, pieza 1 (tabs).** Riesgo casi nulo. Afecta solo a ≤560 px y no hay ninguna prueba sobre su ancho. Debe seguir cabiendo en 320 px: se midió y cabe (activa de 148 px […]

### tactil-7 · [BAJA] Con ratón, un temblor de 6 px al hacer clic en un chip o botón de la partida la arrastra y se pierde el clic  
`tactil-7` · Táctil e interacción · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/partidas.js _ratonArma (líneas 778-787: draggable=true en cualquier pointerdown que no sea input/textarea/select/.arrastrable)
- **Qué le pasa al usuario:** En la PC de oficina, un clic algo movido sobre un material o sobre Duplicar «no hace nada» y la partida se ve atenuada un instante. Se repite el clic sin saber por qué. (El arrastre nuevo del commit 42c48ad es el del tablero de Proyectos, js/mod/proyectos.js, que usa umbral de 4 px: no lo ejercité en vivo, pero hereda el mismo riesgo de clic movido.)
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor de 8777 estaba caído (se apagó la compu). Levanté uno propio, de solo lectura, en 8793 con un script en mi carpeta, y lo paré al terminar. El repo quedó intacto (git status solo muestra .claude/).

Prueba: escritorio 1280x900, tema claro, movimiento reducido, ratón real de Playwright, pantalla Partidas con una partida de letras abierta. Estado limpio en cada intento. Escuché click, dragstart y dragend en captura.

1) El fallo se reproduce, pero el umbral real es 4 px, no 6. Probé chip de material, Duplicar (.dup), ojo del PDF (.pdf-vis) y botones del selector de tipo (.tipo-seg):
- Movimiento de 0, 2 o 3 px, o diagonal (2,2) y (3,3): click normal.
- Movimiento […]
- **Corrección al hallazgo original:** Lo que está bien: el clic se pierde con ratón al mover unos píxeles sobre un chip o un botón, y el selector draggable es la causa.

Lo que estaba mal o exagerado:
(a) El umbral es 4 px, no 6 ni 8. Con 3 px o menos, y en diagonal (3,3), el clic sobrevive.
(b) La severidad «media» está inflada. Solo ocurre con ratón, el efecto es repetir el clic con la partida atenuada mientras se mantiene presionado, no se pierde ni se cambia ningún dato, y los 4 px coinciden con el umbral de arrastre de […]
- **Ya cubierto por:** Parcialmente. docs/REVISAR-PAQUETE-UI.md:152-153 documenta el cambio de comportamiento de `_ratonArma` (antes toda la partida era arrastrable, ahora no desde input, textarea, select ni etiqueta arrastrable) y que el arrastre con ratón real no se pudo ejercitar. cot-partidas.mjs:474 y 551-554 prueban que draggable se arma al presionar y se desarma al soltar. Nada vigila el clic perdido en chips ni botones, y ese hueco sí está sin cubrir.
- **Regla del skill:** drag-threshold / dragging-alternative (ui-ux-pro-max, Touch & Interaction)
- **Arreglo:** Archivo: js/cotizador/partidas.js, función `_ratonArma`. Es solo JS, sin CSS ni capas.

Cambio mínimo: sumar a la lista `libre` los controles, con el asa como excepción. Algo como:
`const asa=e.target.closest('.pmover,.drag-handle');`
`const libre=!asa && !!e.target.closest('input,textarea,select,.arrastrable,[data-arrastrar],button,[role=button],.chip,a[href],summary,label');`
El resto de la función queda igual.

Dos puntos de detalle:
- `.pmover` es un `<button>`, así que la excepción es obligatoria. Sin ella se pierde el arrastre con ratón desde el número de la partida.
- Hay que incluir `[role=button]` o `.chip`, porque los chips son div y no los atrapa `button`.

Probado SIN tocar el repo: inyecté un oyente en burbuja que desarma `draggable` con esa misma regla.
- Con el arreglo […]
- **Riesgo del arreglo:** Bajo. Efectos esperados:
- Ya no se podrá arrastrar la partida con ratón presionando sobre un chip o un botón (Duplicar, ojo del PDF, tipo, plegar, borrar). Sigue disponible desde el asa, el número, la fila plegada, el título de tipo y las zonas en blanco. Siguen además ↑/↓ y las flechas del teclado.
- Si se omite la excepción de `.pmover`, se rompe el arrastre desde el número.
- La prueba […]

### tactil-8 · [BAJA] Doble toque en «Generar PDF» o «Enviar por WhatsApp» abre dos ventanas y marca el hito dos veces  
`tactil-8` · Táctil e interacción · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/entrega.js generarPDF (línea 685) y enviarPorWhatsApp (línea 195)
- **Qué le pasa al usuario:** En la computadora, un doble clic deja dos pestañas del mismo PDF o dos chats de WhatsApp abiertos; con imágenes pesadas el botón parece no responder y se vuelve a tocar.
- **Evidencia (verificador, medida por él):** Medí con el arnés Playwright (Chromium propio, hoja de mentiras, cotización autorizada, window.open espiado). Mi servidor en el puerto 8795 reemplazó al 8777, que estaba caído. Lo paré al terminar y el repo quedó intacto. Estado actual: `git status` solo muestra `.claude/`.

ESCRITORIO 1440x900, claro, movimiento reducido:
- Dos clics a 40 ms en «Generar PDF» dan 2 ventanas. Dos en «Enviar por WhatsApp» dan 2 ventanas.
- `dblclick()` real da 2 ventanas.
- Tras cada clic el botón se reemplaza: `document.querySelector('button.hito')` ya no es el mismo nodo.
- La fecha del hito es idéntica tras el 1.º y el 2.º clic: `{"pdf":1791560438117}`. No se marca dos veces.

TELÉFONO 390x844, táctil, […]
- **Corrección al hallazgo original:** Lo real: no hay candado de reentrada. Dos clics o toques seguidos en «Generar PDF» o «Enviar por WhatsApp» abren DOS ventanas, porque marcarHito repinta el panel y el botón nuevo sigue diciendo lo mismo. Lo que estaba mal o exagerado: (1) «marca el hito dos veces» es falso. marcarHito solo guarda la fecha la primera vez (`if(!y[k])`, entrega.js:390), así que la fecha guardada no cambia. Lo único que se repite es el repintado del panel, la barra de pasos y el riel. (2) «sin indicador» con […]
- **Ya cubierto por:** Nada lo cubre. No hay prueba que vigile el doble toque en estos botones; las pruebas existentes llaman a las funciones directo. docs/REVISAR-PAQUETE-UI.md no lo lista, y docs/SISTEMA-DE-DISENO.md no fija una política de doble envío. Otras acciones sí tienen guarda ad hoc (`_sellando` en proceso.js:2074, `_opEligiendo` en opciones, Piezas.trabajando en IA y venta), así que una guarda por bandera encaja con lo que ya hay.
- **Regla del skill:** loading-buttons / submit-feedback (ui-ux-pro-max, Touch & Interaction y Forms & Feedback); search «press feedback loading button»
- **Arreglo:** Un solo cambio, en JS, sin tocar CSS ni capas, en js/cotizador/entrega.js junto a HITOS (~línea 367). La guarda va en el CABLEADO del clic, no dentro de las funciones, y es compartida por los tres hitos:

```js
let _toqueEntregaT=0;
function toqueEntrega(f){ const t=Date.now(); if(t-_toqueEntregaT<700) return; _toqueEntregaT=t; f(); }
```
y en HITOS: `fn:'toqueEntrega(generarPDF)'`, `fn:'toqueEntrega(enviarPorWhatsApp)'`, `fn:'toqueEntrega(abrirRegistrarVenta)'`.

Esto cubre a la vez los botones del panel (entregaHTML, proceso.js:637) y el dock móvil (renderMobileBar, proceso.js:2469), porque los dos usan `HITOS[].fn`. `f()` corre síncrono dentro del toque, así que el navegador sigue tratando `window.open` como acción del usuario.

Opcional, de paso: cambiar `onclick="generarPDF()"` del […]
- **Riesgo del arreglo:** - Poner la guarda DENTRO de generarPDF o enviarPorWhatsApp, como propone el hallazgo, rompería pruebas. pruebas/cot-entrega.mjs llama `enviarPorWhatsApp()` seis veces seguidas con expectativas distintas. pruebas/navegador/pdf-hoja-carta.mjs, cot-opciones.mjs y cot-entrega.mjs llaman `generarPDF()` en secuencia. Con la guarda en el cableado esas pruebas no se afectan, porque llaman a las funciones […]

### tactil-9 · [BAJA] Ningún campo trae enterkeyhint: el teclado no ofrece «Siguiente» ni «Listo» en la captura encadenada  
`tactil-9` · Táctil e interacción · PARCIAL · esfuerzo S

- **Dónde:** cotizador.html #f-tel, #f-cli, #f-proy, #f-dir-raw, #f-maps y las plantillas de campos de partidas.js (#d-N, #h-N, #n-N, #an-N, #al-N, #pz-N, #pu-N)
- **Qué le pasa al usuario:** Capturar teléfono → cliente → proyecto → altura → letras con una mano exige tocar cada campo a mano; la tecla de Enter no dice a dónde lleva.
- **Evidencia (verificador, medida por él):** Nota de entorno: el servidor 8777 estaba caído (la compu se apagó). Usé el 8791, que ya estaba escuchando. Verifiqué que sirve archivos idénticos al repo: el md5 de cotizador.html, partidas.js y vidrio.css coincide. No toqué el repo.

LO QUE SÍ REPRODUZCO (390x844, claro, táctil):
- Ningún campo trae enterkeyhint ni autocapitalize. En el DOM con los modales cerrados hay 26 campos y 0 con enterKeyHint. La pantalla Cliente tiene 8 campos y cada tipo de partida tiene de 3 a 4 (18 sumando los cinco tipos), todos con 0. Mi conteo no llega a los 50 del revisor, pero la afirmación «ninguno» se sostiene.
- document.forms.length = 0: no hay <form>, así que el teclado no tiene un «Ir» de envío.
- Lo […]
- **Corrección al hallazgo original:** Es real pero chico, y está exagerado en tres puntos.
1) Las dos reglas citadas no lo respaldan. `input-type-keyboard` pide tipos semánticos (tel, number, inputmode) y la app ya los cumple. `touch-friendly-input` habla de altura ≥44 px, y los campos miden 46 px. Ninguna cubre enterkeyhint. La búsqueda del skill devolvió «Mobile Keyboards» e «Input Types», ambas ya cumplidas.
2) «Exige tocar cada campo a mano» se sostiene solo a medias: en Android el «Siguiente» ya funciona con un Tab nativo, y […]
- **Ya cubierto por:** Ninguna prueba ni documento lo cubre. grep de enterkeyhint en docs/ y pruebas/ no devuelve nada, y REVISAR-PAQUETE-UI.md no lo lista. Sí hay precedente en el repo: js/app.js:1250 (buscador de proyectos de la plataforma) usa enterkeyhint="go" y publicaciones/index.html:71 usa "search". Son campos donde Enter dispara una acción, no un encadenado. Lo ya cubierto de este tema es el teclado correcto por tipo: type=tel, inputmode decimal/numeric y 16 px de letra, que medí en cliente y en los cinco tipos de partida.
- **Regla del skill:** input-type-keyboard / touch-friendly-input (ui-ux-pro-max, Forms & Feedback); search «input type mobile keyboard»
- **Arreglo:** Marcado y JS, sin CSS ni tokens (no hay capa de hoja ni z-index en juego). Es esfuerzo S.

1) cotizador.html:
- #f-tel y #f-cli llevan enterkeyhint="next".
- #f-proy lleva enterkeyhint="done", porque lo que sigue es opcional y el paso siguiente es el botón del dock.
- #f-cli: autocapitalize="words" es opcional y marginal.
- NO tocar #f-dir-raw (textarea).
- #f-maps: type="url" (o inputmode="url") con autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done". Esto vale más que el enterkeyhint pedido.

2) Plantillas de js/cotizador/partidas.js: líneas ~1674 y 1776 (#d-N), 1710 y 1743 (#h-N), 1714 y 1745 (#n-N), 1757-1758 y 1769-1771 (#an/#al/#ta), 1778-1779 (#pz/#pu).
- #d-N lleva enterkeyhint="next" y data-sig="h-N" (en manual, data-sig="pz-N"). Es obligatorio el […]
- **Riesgo del arreglo:** 1) Combobox de clientes (js/cotizador/nucleo.js:1218): su Enter ya intercepta cuando la lista está abierta y hay opción activa. El oyente nuevo debe respetar e.defaultPrevented. pruebas/navegador/cot-cliente.mjs:236 y :263 pulsan Enter ahí y hay que correrlas de nuevo. Con la lista abierta y sin opción activa, Enter pasaría al proyecto y la lista se cierra por blur, igual que hoy con Tab.
2) […]

### tema-1 · [BAJA] Con colores forzados (alto contraste de Windows) desaparecen los interruptores, las barras y el «elegido» de los selectores  
`tema-1` · Tema oscuro, vidrio y contraste · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css: .tg y .tg::after (l.1196-1203, 3120-3137, 6764), .prog-track (l.1857, 3499), barra del anticipo (.anti-r), .seg button.on (l.571), .tipo-seg button.on (l.1102, 3013), .tool-seg button.active (l.1963). No hay ni un @media (forced-colors) en css/*.css ni en cotizador.html.
- **Qué le pasa al usuario:** Quien trabaja con un tema de alto contraste de Windows (o forzando colores) no ve si el IVA está sumado, si la partida lleva iluminación, ni cuál tipo de partida quedó elegido; solo lo adivina por el importe. Es un grupo chico, pero para él la pantalla de precio deja de decir su estado.
- **Evidencia (verificador, medida por él):** Entorno: Playwright con un Chromium propio y forcedColors:'active' en una copia del arnés. El servidor del 8777 estaba caído, así que levanté uno mío en el 8871, solo de lectura, y lo detuve al terminar. El repo quedó intacto (git status solo muestra .claude/, que ya estaba).

REPRODUCIDO, 390 y 1440, claro y oscuro (getComputedStyle y capturas):
- #ivatg encendido: fondo rgb(255,255,255) (Canvas) y borde 0. Su ::after también es rgb(255,255,255), ambos en claro; en oscuro los dos son rgb(0,0,0). Es idéntico al apagado. La captura de la fila «IVA 16%» a 390 no muestra interruptor.
- .prog-track y #prog-bar (scaleX .86): los dos son Canvas, borde 0. En la captura no hay barra junto a «86%». […]
- **Corrección al hallazgo original:** Lo real: con colores forzados (forcedColors:'active') se reproduce que el interruptor (.tg y su ::after), la barra de Completitud, el deslizador del anticipo y el «elegido» de .seg/.tipo-seg/.tool-seg desaparecen, y no hay ningún @media (forced-colors) ni prefers-contrast en css/, js/ ni cotizador.html (grep vacío; docs/SISTEMA-DE-DISENO.md y docs/REVISAR-PAQUETE-UI.md no lo mencionan; ninguna prueba lo vigila). Lo que está mal o exagerado: (1) Severidad «alta» exagerada. En un teléfono (Chrome […]
- **Regla del skill:** color-not-only / state-clarity (ui-ux-pro-max); WCAG 1.4.11 y 1.4.1
- **Arreglo:** Un bloque `@media (forced-colors:active)` al FINAL de css/sistema.css, después de la capa 8 y de las secciones 9 y de «La puerta». Esa hoja la comparten el cotizador, la plataforma y el anidador-vectores, y los tres tienen los mismos controles. No va en vidrio.css, porque no es material de vidrio. Va dentro de @media, así que en modo normal no cambia nada: lo medí con y sin el bloque, y los colores computados de .tg.on, la perilla, el tipo elegido y la barra salieron idénticos. Usa `!important` en los colores de estado, con precedente: la hoja ya tiene 108. Hace falta para ganarle a `.partida .tg.on`, `.partida .tipo-seg button.on`, `html[data-tema="oscuro"] …` y `#prog-bar.lleno`. Bloque probado en 390 y 1440, claro y oscuro:

@media (forced-colors:active){
  /* Interruptor: aro hacia […]
- **Riesgo del arreglo:** Bajo, con tres matices. (1) `:is(.seg,.tipo-seg) button.on` con `!important` alcanza también las mismas clases en la plataforma (`.pf-lat-rol .seg`, `#pj-filtros .tipo-seg`, `.ct-pestanas .tipo-seg`) y en el anidador-vectores. Ahí es lo que se quiere (tienen el mismo problema), pero conviene hacer una pasada visual con forcedColors en index.html; no lo medí. (2) `forced-color-adjust:none` en el […]

### tema-2 · [BAJA] En tema oscuro 4 textos del camino principal quedan bajo 4,5:1 por el brillo blanco del vidrio, y la prueba de contraste solo corre en claro  
`tema-2` · Tema oscuro, vidrio y contraste · PARCIAL · esfuerzo S

- **Dónde:** css/vidrio.css --cv-relleno (l.72) y --cv-relleno-denso (l.79), que pintan .side>.sum, .modal, .topbar, .pasos y .mbar. Hueco de la prueba: pruebas/navegador/contraste.mjs l.105 (newContext sin colorScheme ni al3d_tema; grep «oscuro|dark|colorScheme» no da nada).
- **Qué le pasa al usuario:** De noche o en un cuarto oscuro, los rótulos chicos de la columna del dinero y de la entrega («qué sigue», la nota de cada paso con el número de WhatsApp) se leen un poco más flojos de lo que la propia app se exige, justo en las pantallas donde se autoriza y se entrega. Y nadie se entera porque la prueba nunca mira el oscuro.
- **Evidencia (verificador, medida por él):** Entorno: el servidor 8777 estaba caído (000, connection refused). Levanté un http.server propio en 8923 y lo apagué al terminar. Arnés Playwright propio, Chromium 1234, git status sin cambios en el repo. Copia de pruebas/navegador/contraste.mjs en mi carpeta, con tema y CSS inyectable por variable de entorno (colorScheme, al3d_tema y deviceScaleFactor 3 como el original).

REPRODUCCIÓN, 1440×1000:
- Claro: 67 ✓ y 0 ✗.
- Oscuro: 63 ✓ y 4 ✗, idénticos a los del revisor: «qué sigue» 4,33 (rgb(109,134,255) sobre rgb(39,42,68)), .auth-divider 4,09 (sobre 49,51,75), riel-nota del paso actual 4,28 y riel-nota del paso hecho 4,28 (sobre 45,48,72).
- Oscuro a 390 px (viewport móvil táctil, mismo […]
- **Corrección al hallazgo original:** Lo central resiste y se reproduce al número. Lo que estaba mal o exagerado:
1) Severidad. Es baja y no media. Es solo en oscuro, que de todos modos es el tema por defecto en teléfonos con modo oscuro, porque js/tema.js usa 'auto'. Son rótulos secundarios de 11 a 12,5 px. Quedan 0,17 a 0,41 por debajo de 4,5:1 (entre 4,09 y 4,33), y a simple vista se leen. Lo que sí pesa es el hueco del vigilante y el documento que dice «medido».
2) El «dónde» sobra en parte. No medí el modal de IA como […]
- **Regla del skill:** color-contrast / color-accessible-pairs / dark-mode-pairing (ui-ux-pro-max)
- **Arreglo:** 1) css/vidrio.css, bloque html[data-tema="oscuro"] (l.122; especificidad 0,1,1, gana al :root de l.48), añadir:
  --cv-relleno-denso:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02)),rgba(var(--sup-rgb),.93);
  --cv-relleno:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02)),rgba(var(--sup-rgb),.86);
Usa los mismos tokens y capas. El claro queda idéntico. Corregir también el comentario de l.69-71 («una sola declaración vale para los dos temas») para decir que en oscuro la luz blanca baja al 6 %→2 % porque con 14 %→5 % la tinta3 y el azul quedaban entre 4,09:1 y 4,33:1 (valores de la prueba, no del cálculo).

2) pruebas/navegador/contraste.mjs: envolver el flujo en for (const tema of ['claro','oscuro']), con contexto nuevo por tema:
  - colorScheme: […]
- **Riesgo del arreglo:** Bajo, con dos notas.
(a) Visual: en oscuro el vidrio pierde brillo y se ve más marino. Compara capturas en los 4 sitios donde se pinta (barra, riel, columna del dinero, y en index.html la cabecera, los paneles y las fichas). En oscuro el texto es claro sobre fondo oscuro, así que un fondo más oscuro solo puede mejorar el contraste en todas esas piezas. No hay pruebas que fijen el relleno: grep de […]

### tema-4 · [BAJA] De noche el selector de rol «Vendedor | Autorizador» marca el elegido con una píldora a 1,18:1  
`tema-4` · Tema oscuro, vidrio y contraste · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css .seg button.on (l.571) sin regla de noche; el parche ya existe para .tool-seg (l.6389) y .partida .tipo-seg (l.6390). Marcado: topbar de cotizador.html.
- **Qué le pasa al usuario:** El rol decide quién puede autorizar. De noche, saber si la pantalla está en Vendedor o en Autorizador exige fijarse en cuál texto es más grueso, justo lo que el parche de las partidas quiso evitar.
- **Evidencia (verificador, medida por él):** NOTA: el servidor de 8777 estaba caído (la compu se apagó). Levanté uno propio con python en el puerto 8791, solo lectura sobre el repo, y lo paré al terminar; git status quedó igual (solo ?? .claude/).

SELECTOR DE ROL (#roleseg, cotizador.html:207), getComputedStyle y muestreo de píxeles de la captura, movimiento reducido:
- Oscuro, 390x844 táctil y 1440x900: .seg button.on = rgb(10,12,28), color blanco, font-weight 600, box-shadow none, border-width 0; carril .seg = rgb(26,29,56). Razón 1,18:1 en ambos. Muestreo de píxeles a 1440: pastilla [10,12,28] contra carril [26,29,56] = 1,18. Texto elegido blanco sobre pastilla 19,40:1; texto apagado rgb(167,172,214) sobre carril 7,45:1.
- Claro, […]
- **Corrección al hallazgo original:** El número central es real, pero el hallazgo exagera el impacto, se equivoca en el dato de los interruptores y propone un arreglo que se escapa de su zona. (1) El 1,18:1 del selector de rol sí lo reproduje, pero «solo lo distinguen la negrita y el color del texto» minimiza la señal que ya existe: la pastilla es visiblemente más oscura que el carril, el texto elegido es blanco (19,4:1) y el apagado es lavanda (7,45:1). En captura se lee como elegido a primera vista; no hay que fijarse en el […]
- **Regla del skill:** state-clarity / dark-mode-pairing / color-dark-mode (ui-ux-pro-max)
- **Arreglo:** Parte principal, css/sistema.css, capa (7) tema oscuro, justo después del bloque html[data-tema="oscuro"] .partida .tipo-seg button.on (cerca de la línea 6398) y antes de la regla de .ai-btn. Va acotada a la barra del cotizador para no tocar la barra lateral de index.html, que comparte la clase .seg:

html[data-tema="oscuro"] .topbar-in .seg button.on{background:var(--a-fill);box-shadow:inset 0 0 0 1px var(--a)}

El color:#fff del arreglo original sobra: el texto ya es blanco. Con esto la pastilla queda a 2,89:1 del carril y el aro a 5,09:1, las mismas cifras del parche de las partidas, solo con tokens (--a-fill, --a), sin colores nuevos ni sombras nuevas.

Parte opcional y de menor prioridad, interruptor encendido, misma capa: html[data-tema="oscuro"] .tg.on{box-shadow:inset 0 0 0 1px […]
- **Riesgo del arreglo:** (1) El arreglo literal del revisor (html[data-tema="oscuro"] .seg button.on) pesa (0,3,2) y le gana a .pf-lat-rol .seg button.on (0,3,1) de plataforma.css: en index.html oscuro 1440 el rol de la barra lateral (#pf-rolseg) pasaría de rgba(255,255,255,.18) a azul con aro, medido. Por eso la versión acotada a .topbar-in; con ella la plataforma queda igual. (2) Decisión de diseño: […]

### tema-5 · [BAJA] El enlace «Saltar al contenido» es casi ilegible en tema oscuro (2,39:1)  
`tema-5` · Tema oscuro, vidrio y contraste · confirmado · esfuerzo S

- **Dónde:** css/sistema.css .salto (l.2714): background:#fff crudo con color:var(--brand-strong). Mismo enlace en cotizador.html l.103 y en index.html l.77.
- **Qué le pasa al usuario:** Quien navega con teclado o con un switch ve, como primer elemento de la página, un recuadro blanco con letra azul pálida casi invisible; es la ayuda para saltarse la barra y no se lee.
- **Evidencia (verificador, medida por él):** El servidor 8777 estaba caído (ERR_CONNECTION_REFUSED). Usé PUERTO=8791, que ya servía la misma app, sin arrancar nada. Medí con Chromium del arnés, Tab recién cargada, movimiento reducido y getComputedStyle sobre `.salto` con foco real (document.activeElement===.salto, transform identidad, top 8 px, z-index 200, 152,8x44 px).

SIN ARREGLO
- Oscuro, 390 y 1440: fondo rgb(255,255,255), color rgb(143,163,255), contraste 2,37:1.
- Claro, 390 y 1440: fondo blanco, color rgb(48,24,248), contraste 8,04:1.
- Captura (zoom-sin.png): caja blanca con letra azul pálida sobre la barra oscura.
- Con foco programático en index.html (plataforma) a 390 y 1440 en oscuro salen los mismos colores.
- En […]
- **Corrección al hallazgo original:** El defecto es real y los números cuadran, pero hay tres precisiones. (1) Severidad: bajé de media a baja, porque el enlace solo se ve al pulsar Tab. El vendedor de teléfono nunca lo ve, y en PC con teclado y tema oscuro lo ve poca gente; el texto es azul claro sobre blanco, flojo pero todavía legible. Falla WCAG 1.4.3 (4,5:1), pero toca a muy pocas personas. (2) Faltó una superficie en «donde»: publicaciones/index.html l.38 (`<a href="#pb-rejilla" class="salto">`) usa la misma clase y […]
- **Regla del skill:** skip-links + color-contrast (ui-ux-pro-max)
- **Arreglo:** En css/sistema.css l.2714, en la misma regla `.salto`, cambiar `background:#fff` por `background:var(--sup)`. No hace falta regla nueva en la capa 7 (tema oscuro), porque --sup ya cambia con el tema: blanco en claro y #1a1d38 en oscuro, con 6,93:1 contra --brand-strong (#8fa3ff). Sigue con la misma sombra única al enfocar y el mismo z-index 200. Cubre cotizador.html, index.html y publicaciones/index.html, que comparten la clase.

Opcional (hueco de prueba): en pruebas/navegador/contraste.mjs añadir un caso que haga `.salto.focus()`, espere el transform y mida el par, en claro y en oscuro. Así este defecto no vuelve a pasar sin que nadie lo vea.
- **Riesgo del arreglo:** Muy bajo. En claro el color calculado no cambia (--sup = #fff). En oscuro la caja es #1a1d38 sobre una barra casi igual de oscura, así que la caja se distingue menos del fondo que la blanca; lo compensa el anillo de foco de 2 px, que ya existía y se ve bien en las capturas. Antes la distinguía el contraste del blanco, y eso era justo lo que la hacía ilegible. La sombra rgba(0,0,0,.28) casi no se […]

### tema-6 · [BAJA] Imprimir la pantalla con tema oscuro pierde el «AL» del logotipo y, con gráficos de fondo, deja bloques oscuros  
`tema-6` · Tema oscuro, vidrio y contraste · PARCIAL · esfuerzo S

- **Dónde:** js/tema.js l.130-136 (cambia el src a logo-al3d-oscuro.svg); css/sistema.css l.6436 (regla de papel con [src$="logo-al3d.svg"]) y bloque @media print de la capa 7 (l.6414-6437) que no restaura --vidrio, --vidrio-fino ni --vidrio-solido; .pcab (l.6664) y .partida .tipo-seg button.on (l.6390).
- **Qué le pasa al usuario:** Quien dé Ctrl+P a la pantalla con el tema oscuro puesto saca el logotipo mutilado y, si activó gráficos de fondo, una franja oscura donde debería haber texto. La hoja del PDF no se ve afectada.
- **Evidencia (verificador, medida por él):** Medido por mí con el arnés (Chromium propio, 1000 px, tema oscuro y claro, partida de letras en el paso Precio). El servidor 8777 estaba caído; levanté uno propio en el puerto 8861 sobre la carpeta del repo, sin tocar nada. Probé dos caminos: emulateMedia print más captura, y page.pdf() rasterizado con PyMuPDF, que es el más parecido a un Ctrl+P real.

1) Logotipo, CONFIRMADO. En print, tema oscuro, img.logoimg de la barra (.logobtn) tiene src=logo-al3d-oscuro.svg y content:normal (la regla de papel [src$="logo-al3d.svg"] ya no coincide). La captura de la barra muestra el «AL» invisible y el «3D» azul; en claro sale completo. En el PDF real con fondos apagados, que es el valor por defecto, […]
- **Corrección al hallazgo original:** Lo real es el problema, no el arreglo propuesto. (a) El logotipo mutilado es real y NO depende de «gráficos de fondo»: sale mal también con el Ctrl+P por defecto. (b) Los bloques oscuros (.pcab, tipo elegido) solo salen si el usuario activa «gráficos de fondo»; el comentario del CSS que dice que body trae print-color-adjust:exact es falso para la app (medí economy). (c) El hallazgo omite que en CLARO el tipo elegido ya sale ilegible con fondos (1,05:1): es un bug de la capa 6, no del tema […]
- **Ya cubierto por:** Ninguna prueba ni documento lo cubre. pruebas/navegador/contraste.mjs mide el render en pantalla (claro y oscuro) y no usa media print. cot-entrega.mjs y cot-opciones.mjs emulan print solo sobre el documento del PDF generado. pruebas/hojas-de-estilo.mjs y pruebas/marca.mjs no fijan la regla de papel del logotipo ni .pcab ni .tipo-seg. docs/REVISAR-PAQUETE-UI.md no lo lista. docs/SISTEMA-DE-DISENO.md l.904 describe la política de papel («lo que lleva relleno de color pasa a borde»), que respalda el arreglo de la pieza 4 y no menciona el logotipo ni el tema oscuro.
- **Regla del skill:** effects-match-style / dark-mode-pairing (ui-ux-pro-max)
- **Arreglo:** Cuatro piezas pequeñas. Nada de beforeprint/afterprint.

1. css/sistema.css, capa 7, bloque @media print (la regla de ~l.6436). Cambiar el selector para que coincida con lo que tema.js pone ahora, y dejar la regla vieja:
   html[data-tema="oscuro"] .logoimg[src$="logo-al3d.svg"], html[data-tema="oscuro"] .logoimg[src$="logo-al3d-oscuro.svg"]{content:url("../logo-al3d.svg")}
   La ruta sigue siendo relativa a la hoja y sirve igual desde anidador-vectores/. El logotipo que alguien sube no coincide con el selector y se respeta.

2. js/tema.js, aplicar(), dentro del forEach de img.logoimg, cuando t==='oscuro': precargar y retener el logotipo claro, por ejemplo guardando el new Image() en una variable del cierre, con src=(mm[1]||'')+'logo-al3d.svg'. Sin esto la impresión no espera la descarga […]
- **Riesgo del arreglo:** Bajo. Lo que hay que vigilar:
- content:url() sobre un img lo respetan Chrome y Edge, que es el Windows de oficina. Safari lo ignora (por eso tema.js cambia el src), así que en iPhone el logotipo seguiría mal al imprimir. No empeora nada. No lo resuelvo con beforeprint/afterprint porque el repo documenta que Safari de iOS no siempre dispara afterprint (js/mod/proyectos.js y material.js): podría […]

### tema-7 · [BAJA] De noche el modal se separa de la página casi solo por un filete de 1,2:1  
`tema-7` · Tema oscuro, vidrio y contraste · PARCIAL · esfuerzo S

- **Dónde:** css/vidrio.css .modal (l.288) con --cv-borde de noche (l.123) y sombra negra; velo .modal-bg en css/sistema.css.
- **Qué le pasa al usuario:** En un cuarto oscuro, la ventana de Historial o de Registrar venta no «salta» del fondo: cuesta un instante ubicar dónde acaba y dónde empieza la página.
- **Evidencia (verificador, medida por él):** Medido con Chromium del arnés, movimiento reducido, tema oscuro, píxeles reales de la captura. El servidor 8777 estaba caído (conexión rechazada); medí contra un servidor estático de solo lectura propio que sirve el repo sin cambios (ya detenido) y no toqué el repo (git status solo muestra .claude/).

1) El número base sí se reproduce, y es incluso algo peor que el del revisor. Contraste de luminancia entre el panel y la página que queda fuera, en oscuro: 1440 px: Historial 1,08, Cotizar con IA 1,02, Confirmar 1,07, Faltantes 1,06, Registrar venta 1,09. 390 px: Historial 1,07, IA 1,06, Confirmar 1,03, Registrar venta 1,15. El revisor dio 1,16 y 1,19, que es el cálculo teórico con fondo […]
- **Corrección al hallazgo original:** Parte real: el contraste panel/página en oscuro es de 1,0 a 1,2:1 en todos los modales (claro, 3,9 a 4,4:1), y el filete de Historial y Registrar venta ronda 1,4:1. Parte equivocada: (a) el dónde: Historial es `.hist-panel` y Registrar venta es `.rv-modal` (regla en css/sistema.css l.3677: border var(--linea), sombra --sombra-alta, radio 10), no el `.modal` de css/vidrio.css l.288; el borde rgb(47,53,98) es --linea, no --cv-borde. El `.modal` de vidrio (IA, Confirmar, Faltantes) ya tiene filete […]
- **Ya cubierto por:** Parcialmente cubierto por decisión documentada: docs/SISTEMA-DE-DISENO.md l.132 dice que ningún modal se separa por desenfoque propio sino por «su borde, su sombra y el velo», y en la práctica el velo desenfoca 14 px (sistema.css, capa 8, `.modal-bg` l.6679). Ninguna prueba vigila este contraste: pruebas/navegador/vidrio.mjs y contraste.mjs no miden el borde ni la separación del panel contra la página, y docs/REVISAR-PAQUETE-UI.md no lo lista. La incoherencia entre modales (`.modal` frente a `.hist-panel`/`.rv-modal`) tampoco la vigila ninguna prueba.
- **Regla del skill:** elevation-consistent / blur-purpose (ui-ux-pro-max)
- **Arreglo:** Solo si Elías o el revisor quieren pulirlo (baja prioridad, sin urgencia): archivo css/vidrio.css, dentro del bloque html[data-tema="oscuro"] de la capa final (hoy l.122-126), añadir una regla de una línea:

html[data-tema="oscuro"] :is(.hist-panel,.rv-modal){border-color:rgba(255,255,255,.16)}

Es el mismo valor que ya usa `--cv-borde` de noche (l.123), así que no inventa un token nuevo ni contradice la decisión documentada en sistema.css de bordes de noche suaves al 12-16 % (no un canto «de neón»). Sube el filete de Historial y Registrar venta de ~1,4:1 a ~1,6:1 y los alinea con los modales de vidrio. NO subir el fondo del modal a --sup2 (rompe las cavidades --sup2 y deja bandas, y en `.modal` el fondo lo tapa `.modal-b`) y NO tocar el velo ni la sombra. Si más adelante se quiere llegar […]
- **Riesgo del arreglo:** Muy bajo para la regla de una línea: solo cambia el color del filete en oscuro de dos panels, no toca layout ni z-index ni [hidden]; la inyecté y se aplicó sin cambiar cavidades ni texto. Puntos a comprobar: (1) css/vidrio.css también lo carga index.html (plataforma), donde `.hist-panel` y `.rv-modal` se usan igual; verificar ahí que no haya un `body.pf .rv-modal` con más especificidad que le […]

### tema-8 · [BAJA] El paso activo lleva un aro blanco al 90 % de noche (13,6:1), la «raya de neón» que vidrio.css dice evitar  
`tema-8` · Tema oscuro, vidrio y contraste · PARCIAL · esfuerzo S

- **Dónde:** css/vidrio.css .paso-tab.on (l.163): border-color:rgba(255,255,255,.9) sin regla de noche; el bloque de noche (l.122-126) solo cambia --cv-borde.
- **Qué le pasa al usuario:** De noche el paso en que estás es lo más brillante de la barra, más que el botón azul; en claro, en cambio, no tiene aro. Incoherencia visible entre los dos temas.
- **Evidencia (verificador, medida por él):** Reproducido con mi propio Chromium (arnés Playwright). Aviso: el servidor del puerto 8777 estaba caído, así que serví el repo en solo lectura en otro puerto (8791) y lo cerré al terminar, sin tocar archivos. Estado: «partidas», movimiento reducido, `#tab-2.paso-tab.on`. getComputedStyle: border-top-color = rgba(255, 255, 255, 0.9), 1px, en 390x844 táctil y en 1440x900, tanto en claro como en oscuro (cuatro combinaciones iguales). Cascada: sistema.css l.3242 pone border-color:transparent, pero vidrio.css l.163 (la última hoja) lo anula, y no hay ninguna regla de noche para `.paso-tab.on`. Es el único borde blanco fijo a .9 de toda vidrio.css; el riel de al lado baja a .16 de noche. Píxeles […]
- **Corrección al hallazgo original:** Lo real: el borde de `.paso-tab.on` es rgba(255,255,255,.9) en los dos temas y de noche se ve como un aro blanco. Lo que el hallazgo dice mal: (1) El comentario de la «raya de neón» NO está en css/vidrio.css l.120 (ahí solo se bajan --cv-borde, --cv-luz y --cv-sombra). Está en css/sistema.css ~l.6332, en el bloque «El vidrio, de noche», y habla de las variables --filo/--vidrio, no de la pestaña. Eso sí respalda la intención del sistema, pero el hallazgo cita el archivo equivocado. (2) El […]
- **Regla del skill:** dark-mode-pairing / color-dark-mode (ui-ux-pro-max)
- **Arreglo:** Archivo css/vidrio.css, capa de vidrio (la última), justo después del bloque `html[data-tema="oscuro"]{...}` de las l.122-126 o junto a `.paso-tab.on`: `html[data-tema="oscuro"] .paso-tab.on{border-color:var(--a)}`. Probado inyectando el CSS con addStyleTag (sin tocar el repo): el borde pasa a rgb(109,134,255), igual que el chip elegido de noche. El aro mide 3,38:1 contra el riel y 5,09:1 contra el interior de la pestaña, o sea cumple el 3:1 de elementos no textuales y ya no es una raya blanca. La captura en 390 se ve limpia y coherente con el número azul. Con `border-color:rgba(255,255,255,.16)` (el mismo canto del riel) quedaría muy discreto, 1,10:1, y la pestaña se apoyaría solo en su relleno (1,5:1). Con `transparent` también se ve, pero queda más plano. Recomiendo el azul. La […]
- **Riesgo del arreglo:** Muy bajo. `.paso-tab` solo existe en cotizador.html (sistema.css y vidrio.css); index.html y las páginas públicas cargan vidrio.css pero no usan esa clase. El bloque de impresión de sistema.css (l.6170, `.paso-tab.on{border-color:#ddd!important}`) sigue mandando en papel. Probé el foco de teclado con el arreglo: la pestaña activa lleva outline azul de 2 px con 2 px de separación, y con el borde […]

### tema-9 · [BAJA] Un logotipo propio subido pierde sus letras oscuras en tema oscuro  
`tema-9` · Tema oscuro, vidrio y contraste · confirmado · esfuerzo S

- **Dónde:** js/cotizador/entrega.js setLogo() (l.32) y la regla css/sistema.css l.6376 que solo adapta el logo de la casa (src que termina en logo-al3d.svg).
- **Qué le pasa al usuario:** Si alguien sube su logotipo real (la app lo invita), de noche la marca de la barra se ve rota. No afecta al PDF.
- **Evidencia (verificador, medida por él):** Reproducido por mí con el arnés, subiendo el archivo por el input real #logoin (pasa por reducirLogo y setLogo), a 390x844 táctil, movimiento reducido. Nota: el servidor 8777 estaba caído; usé un servidor estático propio sobre el repo en otro puerto (ya apagado), con los mismos archivos que el repo.

1) Claro: logo-al3d.png (nube azul, «AL» y raya oscuros, «3D» azul) se ve entero.
2) Oscuro: la nube y el «3D» se leen, pero el «AL» y la raya vertical desaparecen. Medido en la captura: la tinta más oscura del «AL» contra la barra da 1,3:1 (la tinta normal 54,52,53 contra el fondo 49,52,76 da 1,02:1). El tema.js y la regla css/sistema.css l.6376 no lo tocan porque su src es data:... y no […]
- **Corrección al hallazgo original:** El problema está bien descrito. Lo que corrijo es el arreglo propuesto, que como está tiene dos defectos que medí: (a) por el *{box-sizing:border-box} global (l.462), con height:38px el padding de 2px 6px se come el alto: el logo se encoge de 38 a 34 px y la barra queda con un logo más chico en oscuro que en claro; (b) una placa blanca fija hace desaparecer los logos blancos sobre transparente, que hoy sí se ven de noche (medido: queda un óvalo blanco vacío). El segundo es un caso borde, porque […]
- **Regla del skill:** dark-mode-pairing (ui-ux-pro-max)
- **Arreglo:** En css/sistema.css, capa de tema oscuro, justo debajo de la regla de la l.6376 (la que adapta el logo de la casa), añadir:

html[data-tema="oscuro"] .logoimg[src^="data:"]{box-sizing:content-box;background:#fff;border-radius:var(--rr3);padding:2px 6px}

Probado inyectándolo con addStyleTag, sin tocar el repo:
- 390 táctil oscuro: el logo propio queda [12,9,88,42], con fondo rgb(255,255,255), radio 10 px y el «AL» legible. Con box-sizing:content-box el logo sigue en 38 px.
- topbar sin cambio: 114 px a 390 y 65 px a 1440; brand 44 px (la placa de 42 cabe en el min-height:44 de .logobtn); el top negativo de ajustarTopbarMovil queda en -56px.
- 1440 oscuro: rect [121,14,88,42], topbar 65, sin cambio.
- Tema claro con logo propio: sin placa (fondo transparente, padding 0). Logo de la casa en […]
- **Riesgo del arreglo:** Bajo. 1) Un logo propio blanco sobre transparente se vuelve invisible de noche (placa blanca sobre letras blancas); hoy sí se ve. Es raro, porque en claro ya sería invisible. 2) El título «Cotizador» se corre 12 px a la derecha en oscuro con logo propio respecto a claro. 3) En modo de colores forzados (Windows alto contraste) el sistema repinta el fondo y no peor que hoy. 4) No toca index.html ni […]

### tema-10 · [BAJA] El botón de tema combina aria-pressed con una etiqueta que cambia, y un lector lo dice dos veces  
`tema-10` · Tema oscuro, vidrio y contraste · PARCIAL · esfuerzo S

- **Dónde:** js/tema.js l.137-141 (aplicar()); botón en cotizador.html l.171.
- **Qué le pasa al usuario:** Para quien usa lector de pantalla el estado del tema es confuso; para el resto no cambia nada.
- **Evidencia (verificador, medida por él):** Mi servidor estático propio (el 8777 estaba caído; levanté otro en el 8791 solo para leer el repo y lo paré al terminar) y el arnés de Playwright, 390x844, táctil, tema claro y oscuro, 0 errores de página. Con toque real: claro inicial = aria-pressed=false + aria-label/title «Cambiar a tema oscuro»; tras tocar = aria-pressed=true + «Cambiar a tema claro» (y al revés partiendo de oscuro). Botón 44x44 px, un solo [data-tema-btn] en cotizador.html. ariaSnapshot de Playwright tras el toque: `button "Cambiar a tema claro" [pressed]`; inicial claro: `button "Cambiar a tema oscuro"`. Árbol de accesibilidad vía CDP: name «Cambiar a tema claro», description «Cambiar a tema claro», pressed=true. […]
- **Corrección al hallazgo original:** Lo medido es cierto y reproduce al pie de la letra, pero el hallazgo se pasa en tres cosas. (1) Llamarlo «contradictorio» exagera: «Cambiar a tema claro» y «presionado» dicen lo mismo (ahora está oscuro). El problema real es que es redundante y ambiguo: «presionado» parece afirmar que la acción nombrada está activa. Es el anti-patrón conocido de APG: no cambiar la etiqueta Y el estado a la vez. (2) El «donde» se queda corto. js/tema.js l.137-141 pone el mismo par en TODOS los [data-tema-btn], […]
- **Regla del skill:** icon-context / aria-labels (ui-ux-pro-max); patrón de botón de alternancia (APG)
- **Arreglo:** Opción B, que es la segura para las tres páginas. js/tema.js, función aplicar(), bloque l.137-141: en lugar de poner aria-pressed, quitarlo (b.removeAttribute('aria-pressed')) y dejar title y aria-label como acción («Cambiar a tema claro/oscuro»), que además coincide con el texto visible de index.html. Para limpiar, borrar también el atributo estático aria-pressed="false" de los 4 botones (cotizador.html l.171, anidador-vectores/index.html l.112, index.html l.217 y l.255), porque un false fijo que nadie actualiza sería peor. Añadir una frase en docs/SISTEMA-DE-DISENO.md junto a la regla de l.~1617: «un interruptor cuya etiqueta ES la acción y cambia con el estado (el del tema) no lleva aria-pressed; uno de etiqueta fija sí». Y una aserción en pruebas/navegador (por ejemplo en […]
- **Riesgo del arreglo:** Bajo. Ninguna prueba ni CSS lee aria-pressed de este botón (grep en pruebas/ y css/), y A32 solo usa clic y data-tema. js/tema.js lo comparten cotizador, plataforma (index.html), anidador y las páginas de texto, así que cualquier cambio de etiqueta debe mantener el texto visible dentro del nombre accesible: la opción B lo conserva; la A fija lo rompería en index.html. pruebas/hojas-de-estilo.mjs […]

### tipocolor-3 · [BAJA] Los botones se pintan en Arial, no en Manrope, y el mismo botón sale en dos fuentes  
`tipocolor-3` · Tipografía, color e íconos · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css: falta font-family en .btn, .btn-hist, .ai-btn, .btn-scaler-open, .tipo-seg button, .cand-partidas, button.on (rol Vendedor/Autorizador), .pfold, button.del, .pdf-vis; el rule de inputs (~1054) sí lo tiene. La regla de familias está en css/vidrio.css (:root, --f-texto).
- **Qué le pasa al usuario:** Las acciones principales (autorizar, PDF, WhatsApp) no llevan la tipografía de marca y se ve mezclada junto a los textos Manrope. En Android o iPhone el botón nativo caería a Roboto o SF, o sea cada dispositivo ve una tercera fuente en sus botones.
- **Evidencia (verificador, medida por él):** NOTA DE ENTORNO: el servidor 8777 no existía y los 8796/8791 que usé como respaldo los apagaron otros revisores a media prueba. Al final serví el repo en modo solo lectura en mi propio puerto (python http.server, ya detenido). No toqué el repo.

1) LO REAL SE CONFIRMA. 390 claro, CDP CSS.getPlatformFontsForNode y getComputedStyle:
- partidas: 21 de 49 controles salen en Arial. Son Clientes, Historial, tema, Vendedor, Autorizador, Cotizar con IA, Escalar, ▾, los 5 botones de tipo (Letras/Recorte/Bastidor/Caja/Manual), duplicar, ojo, ×, + Agregar partida, Igual que la anterior, Autorizar yo mismo, Solicitar autorización y Vaciar.
- Su vecino «Vectorizar» (.btn-vector-open) sale en Manrope.
- […]
- **Corrección al hallazgo original:** El hallazgo es real (21 de 49 controles en Arial a 390, confirmado con CDP), pero se corrige en cuatro puntos.
1) Severidad: baja, no media. La diferencia Arial/Manrope se nota poco y es de coherencia de marca, no frena ni confunde.
2) «Cero desbordes nuevos» es falso: el arreglo propuesto recorta la «r» de «Autorizador» a 386-392 px y parte el renglón de cada partida a >=1280 px en precio (+44 px por partida). No lo detectó porque no probó el estado precio a 1440 y midió el desborde de […]
- **Ya cubierto por:** Parcialmente en otra superficie: css/plataforma.css:59 ya declara button,input,select,textarea,optgroup{font-family:inherit}, así que index.html no tiene el problema. En el cotizador y el anidador no hay regla equivalente ni prueba que lo vigile: pruebas/hojas-de-estilo.mjs solo verifica los tokens de vidrio.css y el <link> de Google Fonts. No hay decisión documentada que defienda Arial en esos botones.
- **Regla del skill:** font-pairing, consistency (Style Selection), text-styles-system
- **Arreglo:** Tres reglas, todas en css/sistema.css (probadas juntas inyectadas al final de la cascada):

1) Capa 1, justo antes de la regla input,select,textarea (~línea 1054): button,optgroup{font-family:inherit}
- No hace falta summary: no es un control y ya hereda.
- Queda al mismo nivel (0,0,1) que la de inputs, así que cualquier regla de clase con su propia familia sigue ganando.
- La de css/plataforma.css:59 puede quedarse (redundante e inofensiva).

2) Acompañante de escritorio, al cierre de sistema.css (antes de «CAPA 8», junto al bloque @media(max-width:385px){.topbar-in .seg...} ~6564): @media(min-width:561px){.partida-top .tipo-seg button{padding-inline:9px}}
- Quita 20 px al selector de tipo y devuelve el renglón de la partida a una sola línea.
- Probado de 560 a 2200 px en partidas y […]
- **Riesgo del arreglo:** - La regla global sola es la que rompe: el selector de rol de la barra a 386-392 px (iPhone 12-14) y la cabecera de partida a >=1280 px. Los acompañantes lo resuelven, pero la 3 baja a 11 px el selector de rol en 386-399 px.
- Los botones con line-height:normal crecen ~3 px por renglón: a 320 px +12 px en la página (.btn-gho de 2 renglones). Es aceptable, pero habría que ver el Fold (344 px) y el […]

### tipocolor-4 · [BAJA] Emoji de color y glifos de texto hacen de íconos junto al sprite SVG  
`tipocolor-4` · Tipografía, color e íconos · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/partidas.js:1695 (💡 en la nota «Opaco»), :1699 (🌅 Cálida, ❄️ Fría) con la clase .emo (css/sistema.css:582); js/cotizador/escalador.js:1407, 1415, 1768 (⚠️ en avisos); js/cotizador/notario.js:210 (✓ en el aviso de autorizar); cotizador.html:526, 584, 658, 682, 695 (× como cierre); css/sistema.css:983 (.mbar-lab .chev ▾ a 9px); proceso.js:2522.
- **Qué le pasa al usuario:** Cada teléfono dibuja los emoji a su manera (Apple, Segoe, Noto) y con color de caricatura dentro de una interfaz sobria. El ❄️ azul aparece sobre el chip elegido azul. El × de texto cambia de peso según la fuente del botón. Es incoherente y se nota en la pantalla principal de partidas.
- **Evidencia (verificador, medida por él):** Nota: el servidor 8777 estaba caído (se apagó la compu); usé el que ya corría en 127.0.0.1:8796, que sirve la misma carpeta del repo (python http.server, solo lectura), con PUERTO=8796. Arnés Playwright, movimiento reducido, partida de acero con luz. 
EMOJI: 390 px claro: 💡 10.45 px, 🌅 y ❄️ 10.925 px; 1440 px: 11.875 / 13.3 px. Fuente real por CDP: «Segoe UI Emoji» en los tres. aria-hidden = null. Nombre accesible del chip por CDP: «🌅 Cálida 3000K»; con aria-hidden inyectado en .emo queda «Cálida 3000K». Coincide con el revisor. 
DOCK: .mbar-lab .chev 9 px, opacity .7, color --n6; pintado con Segoe UI Emoji; nombre accesible del botón «Total neto ▾ $20,416.00» (claro y oscuro); con […]
- **Corrección al hallazgo original:** Lo que resiste: (a) los 3 .emo no llevan aria-hidden; (b) el 💡 es un emoji decorativo junto a una nota hermana que usa sprite; (c) el cierre tiene 3 formas distintas; (d) el ▾ del dock está a 9 px y 3.11:1 sin aria-hidden. Lo que está mal o exagerado: (1) 🌅 y ❄️ NO son un descuido: docs/SISTEMA-DE-DISENO.md (sección «Los emoji que sí sobreviven», ~línea 1237) y el comentario de css/sistema.css:579-582 los nombran como la excepción buscada («el tono de la luz»), y la pila de fuentes nombra a […]
- **Ya cubierto por:** Parcialmente: docs/SISTEMA-DE-DISENO.md sección «Por qué SVG y no emoji» y «Los emoji que sí sobreviven» (~líneas 1235-1242) y css/sistema.css:579-582 documentan .emo como excepción deliberada para «el tono de la luz», y listan × ✓ ! ▾ › como glifos de texto aceptados cubiertos por la pila de fuentes (sistema.css:483-488, vidrio.css:51-52). El patrón aria-hidden sobre glifos ya se usa en cotizador.html (.paso-flecha, .cp-go) y partidas.js:1142 (la × de .del), así que .emo y .chev son huecos de consistencia, no una política distinta. Ninguna prueba vigila emoji, .emo, .chev ni la forma del cierre (contraste.mjs no mide el chevrón del dock; docs/REVISAR-PAQUETE-UI.md no lo menciona).
- **Regla del skill:** no-emoji-icons, «No Emoji as Structural Icons» (pro-rules), icon-style-consistent, icon-context
- **Arreglo:** Hacer solo lo que es defecto real y barato, y dejar la decisión de 🌅/❄️ a Elías:
1) js/cotizador/partidas.js líneas 1695 y 1699 (capa: JS, sin CSS): poner aria-hidden="true" a los tres <span class="emo"> (el texto «Cálida», «Fría» y la nota ya dicen todo). Efecto medido: el nombre del chip pasa de «🌅 Cálida 3000K» a «Cálida 3000K».
2) js/cotizador/proceso.js:2522: <span class="chev" aria-hidden="true">▾</span>. Opcional en css/sistema.css:983 (donde ya está .mbar-lab .chev): quitar opacity:.7 (sube de 3.11 a 5.96:1 en claro, mismo token --n6, sin color nuevo).
3) 💡 de partidas.js:1695: o bien quitarlo (la nota verde ya se explica sola), o bien agregar al sprite de cotizador.html un <symbol id="i-info" viewBox="0 0 24 24"> (círculo + trazo de la «i») junto a i-aviso, y usar […]
- **Riesgo del arreglo:** Bajo. aria-hidden en .emo y .chev: sin riesgo, siempre van acompañados de texto visible. Quitar opacity:.7 del chevrón: cambia solo ese glifo de 9 px (sistema.css:983); revisar que vidrio.css no lo sobreescriba (no lo vi, pero no lo probé inyectando). Cambiar × por svg: no hay pruebas que busquen el texto «×» en esos botones; las que existen buscan por clase o selector (.lightbox-close, […]

### tipocolor-5 · [BAJA] El verde y el ámbar de estado se usan para cosas que no son ok ni falta  
`tipocolor-5` · Tipografía, color e íconos · PARCIAL · esfuerzo S

- **Dónde:** js/cotizador/partidas.js:1695 (class="hintnote nota-ok") con css/sistema.css:1176 (.hintnote.nota-ok); css/sistema.css:3259 y :5282 (.paso-tab.espera .n con --av-bg, --av y borde punteado) y :731.
- **Qué le pasa al usuario:** El verde deja de significar «listo o autorizado», porque una sugerencia de material también lo usa. El ámbar deja de significar «falta algo» y también se pone en lo que solo está por venir. El vendedor aprende que el color no es confiable y lo ignora.
- **Evidencia (verificador, medida por él):** Nota: el servidor del puerto 8777 estaba caído (conexión rechazada). Usé el que sí contesta en 127.0.0.1:8796; sus archivos son idénticos a los del repo (md5 igual en css/sistema.css y js/cotizador/partidas.js). Todo se midió con getComputedStyle en un Chromium propio.

PARTE A, la nota verde (real).
- Con la partida en «Aluminio Blanco/Negro/Pintado» o en «Acero Inoxidable» y la luz encendida, que es el valor por defecto (Q.items[0].luz=true), aparece <div class="hintnote nota-ok"><span class="emo">💡</span> Opaco: la luz sale por detrás…</div>. Con acrílico+vinil o acrílico+aluminio volumen no sale. Como el aluminio pintado es el material más común, aparece en casi todas las cotizaciones. […]
- **Corrección al hallazgo original:** El hallazgo mezcla una parte cierta y otra que no lo es.
(1) Real, pero de severidad baja y no media: la nota verde usa el tono «ok» para una sugerencia neutra. Comparte el verde exacto de la insignia «Autorizada» y de las palomitas de los pasos hechos. Es un resbalón de consistencia en un solo lugar, sin daño para el vendedor.
(2) Erróneo en detalles. Los verdes no son «distintos»: son idénticos. La nota no aparece «en los pasos Precio y Autorizada»: sale en la tarjeta de la partida cada vez […]
- **Ya cubierto por:** La parte B ya está cubierta como decisión de producto: docs/FUNCIONES.md:51, css/sistema.css:728-731, 3234-3238, 3257-3259 y 5278-5282. La parte A no está cubierta por ninguna prueba ni doc. El hueco en contraste.mjs es que no mide .hintnote.nota-ok ni .paso-tab.espera, aunque sí mide nota-av (:274) y .paso-tab.on/.hecho (:153-155).
- **Regla del skill:** color-semantic, color-not-decorative-only, consistency
- **Arreglo:** Solo la parte A, un cambio de una palabra.
1) js/cotizador/partidas.js:1695: cambiar class="hintnote nota-ok" por class="hintnote". Conservar <span class="emo">💡</span>: es de los emoji que el sistema deja vivos a propósito, porque dibuja el tono de la luz (css/sistema.css:578-583 y docs/SISTEMA-DE-DISENO.md:1237). NO cambiar el ícono por #i-info: ese símbolo no existe en el sprite de cotizador.html (los íconos disponibles son i-aviso, i-check, i-sol, i-rayo…), y el <use> saldría vacío. i-aviso sería peor: es el triángulo ámbar de advertencia.
2) No tocar css/sistema.css ni .paso-tab.espera. Es la decisión documentada «ámbar = falta» (docs/FUNCIONES.md:51). Si Elías quiere que el cliente nuevo se vea menos «pendiente», eso es una pregunta de producto, no un bug.
3) Opcional: agregar a […]
- **Riesgo del arreglo:** Muy bajo. Probado en el navegador quitando la clase con classList.remove: sin errores de consola. La nota pasa a la .hintnote neutra (fondo rgb(247,248,253), texto rgb(92,97,132), filete gris) con contraste 5.66 en claro y 6.74 en oscuro, ambos sobre 4.5. Las reglas .hintnote.nota-ok de sistema.css (:1176 y :3204) y de docs deben quedarse: Ajustes (js/mod/ajustes.js:656, 769, 785, 806, 1693, […]

### tipocolor-6 · [BAJA] Etiquetas de 10 a 10.5 px en mayúsculas con tracking, incluido el resumen del dinero de la venta  
`tipocolor-6` · Tipografía, color e íconos · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css:2273 (.rv-calc-item span:first-child), :5366 (#f-plazo .chip small, #rv-plazo .chip small), :1505 (.auth-divider); cotizador.html:1015 (h3 inline del escalador).
- **Qué le pasa al usuario:** En el cierre de venta, el vendedor lee los nombres de cada importe (qué es el neto, qué se le debe) en la letra más pequeña del modal y con las letras separadas. Se pierde la lectura rápida.
- **Evidencia (verificador, medida por él):** El servidor de 8777 estaba caído. Levanté uno propio, de solo lectura, en el puerto 8793 y lo detuve al terminar. El repo quedó intacto. Medí con getComputedStyle y el arnés, con movimiento reducido. REGISTRAR VENTA (llegarA «autorizada» y abrirRegistrarVenta). Etiquetas `.rv-calc-item span:first-child` («Precio Subtotal», «Precio Neto», «Comisiones», «Pago Pendiente»): 10.5px, 600, mayúsculas, 0.42px. Salió igual en 390 claro, 1440 claro y 390 oscuro. El valor de al lado va a 14px/700. `#rv-plazo .chip small` («sugerido»): 10px, 700, mayúsculas, 0.4px, en los tres casos. Las 9 `.rv-field label`: 11px/600/mayúsculas/0.44px. `--t1` = 11px. En paso 3 `#f-plazo .chip small` también es de 10px, […]
- **Corrección al hallazgo original:** 1) Cuatro sitios citados, uno falso. `.auth-divider` (sistema.css:1505) ya NO sale a 10.5 px: lo anula el bloque de :3522, que lo baja a var(--t1), peso 600, 0.6px y color tinta3. En el render sale 11px/600/0.6px, y contraste.mjs ya lo mide. Hay que quitarlo del hallazgo. 2) El texto «la letra más pequeña del modal» es cierto pero engaña: las otras 9 etiquetas del mismo modal (`.rv-field label`, sistema.css:2263) van a 11 px, peso 600, mayúsculas y 0.44px (.04em), o sea el mismo estilo. Las 4 […]
- **Ya cubierto por:** Solo en parte. sistema.css:3873-3884 («Un rótulo por sección, y un solo azul») ya decidió el estilo de los rótulos del panel del Escalador y bajó `.auth-divider` a --t1; esa decisión es justo la que «Medidas» incumple por llevar estilo inline. Ninguna prueba vigila el tamaño de las etiquetas de `.rv-calc-item`, ni el contraste del modal de venta.
- **Regla del skill:** letter-spacing (evitar mayúsculas apretadas o muy espaciadas en tamaños chicos), font-scale
- **Arreglo:** A) Resumen del dinero. En css/sistema.css:2273 (capa de cot-entrega, en su lugar, sin mover la regla), cambiar `font-size:10.5px` por `font-size:var(--t1)` en `.rv-calc-item span:first-child`. NO cambiar el letter-spacing: dejar .04em, igual que `.rv-field label` de :2263. No quitar las mayúsculas ni subir a --t2, porque el modal perdería su patrón de rótulo (versalitas chicas, tinta atenuada), que el sistema documenta. B) «sugerido». En :5366 cambiar `font-size:10px` por `font-size:var(--t1)` en `#f-plazo .chip small,#rv-plazo .chip small`. Dejar peso y espaciado. C) «Medidas». En cotizador.html:1014-1016 añadir `class="sp-sec-h"` al div contenedor (conserva su style inline de flex, padding y borde), quitar el `style` del h3 y borrar el span inline de la barra de 3 px, porque `.sp-sec-h […]
- **Riesgo del arreglo:** Muy bajo. A y B suben 0.5 y 1 px de letra en rótulos con mucho espacio libre y no tocan color ni espaciado. Medido: sin desborde, sin filas nuevas en los chips, +1 px de alto en el bloque. `.rv-calc*` y `#rv-plazo` solo viven en cotizador.html y sistema.css, así que no afectan a index.html ni al anidador. Las pruebas que mencionan `#rv-plazo` (cot-entrega.mjs:386-397) leen texto y chips, no […]

### tipocolor-7 · [BAJA] El azul de marca se usa también para rótulos fijos, no solo para lo elegido o accionable  
`tipocolor-7` · Tipografía, color e íconos · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css:1639 (.plano-t), :1647 (.imgs-cab), :1280 (.autoctr .cnt), con color:var(--brand).
- **Qué le pasa al usuario:** El vendedor puede tocar el rótulo creyendo que es un botón. Se debilita la regla documentada de que el azul significa «elegido» o «accionable».
- **Evidencia (verificador, medida por él):** Servidor 8777 caído (ERR_CONNECTION_REFUSED); usé el estático 8796, que sirve el mismo repo (python http.server --directory <carpeta-de-trabajo>), con el arnés y PUERTO=8796. Estado «partidas», 390x844, táctil. getComputedStyle: claro .plano-t, .imgs-cab y .autoctr .cnt = rgb(64,96,248), 11px, peso 700, cursor auto, sin onclick/role/tabindex (no son tocables). Oscuro = rgb(109,134,255). Ninguna regla de vidrio.css los toca (grep: solo sistema.css:1280, 1639, 1647) y las plantillas JS solo los emiten en js/cotizador/imagenes.js:144 y 183 y js/cotizador/partidas.js:1718 y 1748 (no aparecen en index.html ni en el anidador). Censo de texto azul en claro 390: en «partidas» y […]
- **Corrección al hallazgo original:** Lo medido es real, pero la lectura está exagerada y el arreglo propuesto es incompleto. (1) La «regla documentada» no existe tal cual para texto: docs/SISTEMA-DE-DISENO.md define --a-tx como «el azul cuando es TEXTO o filete», dice que el azul SÓLIDO (relleno) es «la acción» y que «el azul solo significa ELEGIDO» en el contexto de los matices de partida. Usar el azul como tinta de rótulo está permitido y es sistémico: css/sistema.css tiene 52 declaraciones color:var(--brand) y varias son […]
- **Ya cubierto por:** Cubierto en parte por decisión documentada: docs/SISTEMA-DE-DISENO.md permite el azul como texto (--a-tx «el azul cuando es TEXTO o filete») y ya usa --brand en rótulos sin toque (.prog-next, #prog-pct, .qi-folio, .htable td:first-child). Ninguna prueba vigila estos tres selectores (pruebas/navegador/contraste.mjs no los incluye) ni docs/REVISAR-PAQUETE-UI.md los lista.
- **Regla del skill:** color-semantic, visual-hierarchy (jerarquía sin depender solo del color)
- **Arreglo:** No cambiar solo estos tres selectores: dejaría tres rótulos grises entre decenas azules y debilita la jerarquía de .imgs-cab y .plano-t. Recomendación de prioridad baja: (a) opcional y seguro, css/sistema.css línea 1280, .autoctr .cnt → color:var(--tinta2) (el contador es un dato, no un encabezado; la medida mostró que se lee bien); (b) si Elías quiere separar «rótulo» de «control», decidirlo como regla de sistema en docs/SISTEMA-DE-DISENO.md (por ejemplo: rótulos no tocables en --tinta, y el azul solo en lo tocable o elegido) y aplicarla de una vez a .imgs-cab, .plano-t, .sub-lab, .sp-sec-h h3 y los folios, dejando los encabezados plegables (.sc-prev-head .ttl, .ai-prev-head .ttl) en azul con su chevron; (c) agregar a pruebas/navegador/contraste.mjs los selectores .plano-t, .imgs-cab, […]
- **Riesgo del arreglo:** Con el arreglo propuesto tal cual (los tres a --tinta2): se pierde la distinción entre el rótulo «Plano en el PDF» y la nota «Sin plano» (ambos grises), y .imgs-cab queda como el texto más débil de su recuadro, por debajo de los subtítulos de 13px en tinta; deja un criterio incoherente con los demás rótulos azules (.sub-lab, .sp-sec-h h3, folios) y con los encabezados plegables que sí se tocan. […]

### tipocolor-8 · [BAJA] La escala de 7 tokens convive con 17 tamaños reales y un clúster entero sin tokens en las herramientas Pro  
`tipocolor-8` · Tipografía, color e íconos · PARCIAL · esfuerzo L

- **Dónde:** css/sistema.css (134 de 432 reglas con font-size en px; clústeres .ai-* (19), .rv-* (8), .ia-* (6), .falt-* (6)); cotizador.html líneas ~705–1075 (Vectorizador y Escalador): 73 de 129 style="" y 25 de 28 font-size inline.
- **Qué le pasa al usuario:** Para el equipo: cada cambio de escala hay que hacerlo en decenas de sitios, y un tamaño intermedio (11.5, 13.5) vuelve a colarse. Para el usuario: el texto se siente desigual de una pantalla a otra.
- **Evidencia (verificador, medida por él):** Entorno: el servidor 8777 estaba caído (la compu se apagó). Usé un servidor estático de solo lectura dentro de mi propio script (puerto 8999) sirviendo el repo; comprobé que sistema.css y cotizador.html servidos son idénticos al repo (md5). Arnés propio con movimientoReducido:true. Scripts y capturas en ver-tipocolor-8a/.
A) Barrido en vivo (claro; el tamaño de letra no depende del tema), recorriendo los 4 estados (cliente, partidas, precio, autorizada), nodos de texto visibles, token = {11, 12.5, 14, 15, 20, 24, 28}: 390 px: 431 nodos, 17 tamaños (9, 10.45, 10.5, 10.925, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 19, 20, 24, 28), 179 fuera (42 %). 1440 px: 449 nodos, 14 tamaños, 84 fuera […]
- **Corrección al hallazgo original:** Lo que resiste: los números del barrido. Yo medí 17 tamaños reales y 179 de 431 nodos fuera de token (42 %) a 390, y 14 tamaños y 84 de 449 (19 %) a 1440. Hay 133 declaraciones font-size en px de 432. Lo que estaba mal o exagerado:
1) El dónde. Dice «clúster entero sin tokens en las herramientas Pro». Las herramientas Pro ya hablan casi todas en token: Vectorizador a 390 tiene 3 de 58 nodos fuera (5 %), Escalador 4 de 43 (9 %), 1440 de 7 % y 12 %. Su CSS (.vt-*, .sp-*) se pasó a la escala el […]
- **Ya cubierto por:** En parte, y sin decirlo el hallazgo. (1) La política ya está escrita en el encabezado de tipografía de css/sistema.css («Los intermedios… caen al escalón más cercano, que es la regla que esta hoja ya se dio») y en docs/SISTEMA-DE-DISENO.md (§ del sistema, línea ~1569, antes 23 tamaños, ahora 7). (2) El commit 045bbfe (2026-10-01) ya pasó los tamaños de las Pro y del historial a --t*/--e*/--rr* y dejó a propósito en px los 44 px de dedo, los filetes, las píldoras y el 16 px anti-zoom. (3) El chip a 11.5 px en teléfono es decisión documentada junto a su regla. (4) Contraste: pruebas/navegador/contraste.mjs, y el texto blanco de las Pro sobre #181c2e da 11,61:1 y 5,94:1. No hay prueba que vigile el tamaño de letra en px ni los colores crudos en cotizador.html: ese hueco es real. docs/FUNCIONES.md ~134 está desactualizado respecto al commit 045bbfe.
- **Regla del skill:** font-scale / «Font Size Scale», color-semantic (tokens, no hex crudos), spacing-scale
- **Arreglo:** Por orden de valor y riesgo, todo en español para Elías: es limpieza de «un tamaño de letra de medio píxel de diferencia», casi invisible para el vendedor; lo único visible es el icono.
1) (Lo que sí se nota, XS) cotizador.html:753 y :922: añadir color al div del icono de 58 px: `color:rgba(255,255,255,.82)` (el mismo que el título de abajo), y en :753 cambiar `rgba(106,59,216,.45)` por `rgba(var(--a-rgb),.4)`, como ya hace :922. Probado por inyección.
2) (XS) cotizador.html:992: `border:1px solid rgba(21,160,106,.2)` → `border:1px solid var(--ok-borde)`.
3) (S, mecánico) css/sistema.css, capa donde vive cada regla, sin mover reglas de sitio: llevar los literales fuera de escala al escalón más cercano, con la regla que la propia hoja ya se dio (más cercano; en empate, el de arriba): […]
- **Riesgo del arreglo:** Medido con una inyección CSSOM que lleva 75 reglas fuera de escala al token más cercano (se saltan 16 px y valores mayores de 20,5), sin tocar el repo, en claro a 344, 390 y 1440 px en los estados partidas y autorizada, y en Vectorizador, Escalador, IA y Faltantes: ningún desbordamiento horizontal (ancho de página igual al del viewport), cero textos nuevos truncados, altura de página -3 px, y […]

### tipocolor-9 · [BAJA] Texto cortado sin forma táctil de verlo completo y un folio que se parte en dos renglones  
`tipocolor-9` · Tipografía, color e íconos · PARCIAL · esfuerzo S

- **Dónde:** css/sistema.css:1751 (.hentry-name) y :1774 (.cua-nombre) con white-space:nowrap y ellipsis; small#tab-N-sub del nav; js/cotizador/notario.js:210 (aviso con Q.sello.codigo); css/sistema.css:1440 (.toast-msg); #f-cli a 390.
- **Qué le pasa al usuario:** El nombre del cliente y del proyecto son el identificador de la cotización y en el teléfono no hay forma de verlos completos. Un folio dictado por teléfono o copiado del aviso se lee roto.
- **Evidencia (verificador, medida por él):** Medido con Playwright (Chromium propio), 390x844, tema claro, táctil; el servidor del 8777 estaba caído, levanté uno propio, solo lectura, en otro puerto. Repo sin cambios (git status solo muestra .claude/).

CUADERNOS (abrirCuadernos, 1 cliente): span.cua-nombre mide 138 px de ancho; con el cliente de 87 caracteres scrollWidth 588, con ellipsis y sin title en el texto (solo title en el botón .cua-card). Con nombres reales a 390: «Farmacia San Juan» (17 car.) cabe; «Panadería La Esperanza» (22), «Óptica Visión Integral» (22), «Taller Mecánico Hermanos López», «Restaurante El Rincón de Don Chuy» y «Operadora de Restaurantes del Pacífico» se cortan todos. Al abrir el cuaderno, el nombre […]
- **Corrección al hallazgo original:** El hallazgo mezcla seis cosas de peso distinto. REAL: (a) nombre de cliente cortado en Cuadernos (.cua-nombre), que es el caso más frecuente y empieza con nombres de solo 22 caracteres, no con los 78 del ejemplo; (b) proyecto cortado en Historial (.hentry-name); (c) el código se parte en el aviso de autorizada; (d) el placeholder de #f-cli sale cortado, pero solo entre 390 y 396 px de ancho, 4 px; (e) viuda de una palabra en .foot-nota de Cuadernos, solo a 390. EXAGERADO O ERRÓNEO: (1) «en […]
- **Ya cubierto por:** Nada lo cubre como defecto. Las pruebas pruebas/navegador/contraste.mjs, hojas-de-estilo.mjs y cot-historial.mjs miden contraste, hojas y escape de HTML, no truncado ni cortes de línea del aviso; no hay prueba que vigile .hentry-name, .cua-nombre, el corte de #f-cli ni .toast-msg (piezas-avisos.mjs solo mide centrado y contraste). docs/SISTEMA-DE-DISENO.md (checklist, punto 7) documenta el recorte de una línea con ellipsis como convención, pero no decide que un identificador de cotización deba cortarse. docs/REVISAR-PAQUETE-UI.md no lo lista. El comentario de cotizador.html:316-320 es el único antecedente directo: ya acortaron el ejemplo del teléfono por el mismo motivo (campo angosto en la rejilla de 2 columnas).
- **Regla del skill:** truncation-strategy, «Essential Text Truncation», long-token-wrapping, heading-line-balance
- **Arreglo:** Priorizado por utilidad real:

1) css/sistema.css, capa base, en las mismas reglas de la línea 1751 (.hentry-name) y 1774 (.cua-nombre); ninguna capa posterior pisa white-space ni overflow (las reglas de 3746 y 3785 solo cambian tamaño, peso y color). Sustituir white-space:nowrap;text-overflow:ellipsis por la receta que ya usa css/plataforma.css:2632 (.pf-buscar-n): display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;overflow-wrap:anywhere. En .cua-nombre mantener que quede en bloque de columna (hoy display:block). Probado inyectado a 390, claro y oscuro: Cuadernos, 64 px -> 83 px de alto de tarjeta solo cuando el nombre pasa de una línea; cabían 2 líneas «Panadería La / Esperanza», «Óptica Visión / Integral», «Taller Mecánico / Hermanos […]
- **Riesgo del arreglo:** 1) Alturas: cada tarjeta con nombre largo crece 19-20 px. Ninguna prueba vigila el alto de .cua-card ni .hentry (cot-historial.mjs:762 lo lee pero no lo compara; el chequeo de contraste y desborde no cambia). Hay que volver a correr pruebas/navegador/cot-historial.mjs y hojas-de-estilo.mjs (que vigila propiedades de la hoja) por si -webkit-box o la capa lo molestan; no pude correrlas sin tocar el […]

### tipocolor-10 · [BAJA] En Escalador y Vectorizador hay 3 o 4 botones azules de relleno y un resplandor que el sistema no documenta  
`tipocolor-10` · Tipografía, color e íconos · PARCIAL · esfuerzo M

- **Dónde:** cotizador.html:756 y :925 (botón «Seleccionar archivo» con style inline: background:var(--brand-grd) y box-shadow azul); css/sistema.css .sp-addall, .vt-go, .sp-ai; #sc-btn-calib.btn-pri.
- **Qué le pasa al usuario:** Dentro de la herramienta, el usuario no sabe cuál es el paso siguiente porque casi todo es azul. Los botones que aún no se pueden usar quedan como azules pálidos.
- **Evidencia (verificador, medida por él):** El servidor 8777 estaba caído (ERR_CONNECTION_REFUSED). Levanté uno propio de solo lectura en el puerto 8791 desde mi carpeta y lo cerré al terminar; el repositorio quedó intacto. Medí con el arnés y getComputedStyle en 390x844 y 1440x900, claro y oscuro, con movimiento reducido y capturas de las pantallas clave. ESCALADOR, vacío: «Seleccionar archivo» (inline, bg rgb(64,96,248), sombra rgba(64,96,248,.4) 0 4px 18px, 199x39, habilitado), `#sc-btn-calib` (.btn-pri, deshabilitado, opacity .55) y `#sc-btn-addall` (.sp-addall, bg rgb(64,96,248), deshabilitado, opacity .45). En 390 a primera pantalla: «Seleccionar archivo» y `#sc-btn-addall` (y=678). Con foto: solo `#sc-btn-calib` sólido y […]
- **Corrección al hallazgo original:** Lo real: el conteo. Con el modal recién abierto, sin imagen, hay 3 botones pintados de azul en el Escalador y 4 en el Vectorizador; en el teléfono (390 px) se ven 2 a la vez en el Escalador. Lo que el hallazgo exagera o dice mal: (1) «casi todo es azul» y «no sabe cuál es el paso siguiente». En cada paso que recorrí (vacío, con foto, calibrada, con medida; vacío, con foto, vectorizado) hay UN solo botón azul sólido que se puede tocar. Los otros azules son uno deshabilitado (opacity .45 o .55, […]
- **Ya cubierto por:** No hay prueba que lo vigile: contraste.mjs, cot-escalador.mjs y cot-vector.mjs no miden `.sp-addall`, `.vt-go`, `#vt-btn-scaler` ni el botón en línea de «Seleccionar archivo». El comentario de sistema.css capa 4 («La salida del aparato, y la de al lado») ya decide que `.sp-addall` es el botón relleno del pie del escalador y que `.sp-mitem-add` se queda neutro para no tener cinco rellenos. SISTEMA-DE-DISENO §2.17 y la capa 8.4 documentan el degradado de IA como excepción, pero solo para acciones de IA. Ninguna decisión documentada cubre el «Seleccionar archivo» en línea ni los azules pálidos del botón deshabilitado, y docs/REVISAR-PAQUETE-UI.md no los lista.
- **Regla del skill:** primary-action (un solo CTA principal por pantalla), state-clarity
- **Arreglo:** Todo en css/sistema.css (más un cambio de HTML), sin tocar tokens. 1) cotizador.html:756 y :925: cambiar el `<button style="pointer-events:all;…">` de «Seleccionar archivo» por `<button type="button" class="sp-overlay-btn pri" onclick="…">` (mismo `onclick`, mismo ícono), quitando el `style`. Ya existe esa pieza en el mismo recuadro (`.sp-overlay-btn.pri`, sistema.css ~5744: min-height 44, relleno `--a-fill`, sin resplandor, con :active y :hover). 2) sistema.css capa 8, junto a `.sp-overlay-btn` (~línea 5750): `.sp-overlay-cara>.sp-overlay-btn{pointer-events:auto;font-size:var(--t3);font-weight:700}`. El pointer-events es necesario porque `.sp-overlay` es `pointer-events:none`. El tamaño y peso son necesarios porque la declaración existente `font:700 13px/1 inherit` en `.sp-overlay-btn` […]
- **Riesgo del arreglo:** Bajo. `.sp-addall` solo existe en los dos modales de cotizador.html, no hay prueba que lo vigile y la regla va acotada por `#scalermodal` / `#vectormodal`. Riesgos concretos: (a) los botones deshabilitados dejan de verse «azul pálido»; es una decisión de diseño que se aparta de la convención general de §2.2 (deshabilitado = mismo relleno con menos opacidad), y `#sc-btn-calib` y `#vt-go` seguirían […]

## Sin verificar todavía (0)

Los reportó una lente pero el verificador no alcanzó a terminar. Léelos como «posibles».


## Refutados o no verificables (0)

Para transparencia: lo que una lente reportó y el verificador no pudo sostener.


## Lo que las lentes encontraron bien

### Accesibilidad

- Tab de principio a fin en 6 recorridos (cliente/partidas/autorizada × 1440/390): 21, 54 y 35 paradas a 1440; 21, 55 y 37 a 390. El ciclo siempre cierra, sin trampas de teclado y sin elementos interactivos sin nombre (árbol de accesibilidad: 0 botones, enlaces ni campos sin nombre).
- Los chips son div role=button con tabindex y responden a Enter y Espacio (probado: cambian aria-pressed, el foco se conserva tras repintar y el Espacio no hace scroll). Bloqueados (autorizada) llevan aria-disabled.
- Anillo de foco visible en todas las paradas en claro (botones: outline 2 px azul, 3,4 a 4,9:1; campos: borde azul + anillo, 3,7:1 contra el borde de reposo). Salvo «Del escalador» (hallazgo 10), ninguna parada sin indicador.
- 10 modales: role=dialog/alertdialog + aria-modal + nombre accesible correcto; el foco entra; Tab/Shift+Tab (51 pulsaciones por modal) nunca sale; Escape cierra; el foco vuelve al botón que lo abrió; .wrap/.topbar/.mbar quedan inert y se liberan al cerrar. Igual a 390 oscuro.
- Semántica: html lang=es, un h1 y h2 por tarjeta, landmarks navigation/main/complementary/región del dock, salto al contenido que funciona (Enter + Tab entra a main), combobox de clientes con aria-activedescendant, 27 controles con aria-pressed/checked/expanded/current coherentes con lo visual, todos los input con label o aria-label (los 4 file ocultos son la excepción lógica).
- Avisos: toast() alimenta #vozStatus (polite) y los errores #vozAlert (assertive); validar sin teléfono deja aria-invalid=true, mueve el foco al primer campo faltante y anuncia el motivo.
- Movimiento reducido: 0 animaciones infinitas con y sin la preferencia; con prefers-reduced-motion no corre ninguna animación en cliente, partidas, modal IA ni tras autorizar.
- Alternativas a gestos: reordenar partidas tiene ↑/↓ y flechas sobre el número; «mantener para confirmar» acepta Enter/Espacio sostenidos (probado: tap corto avisa y no borra, 1,5 s sostenido sí) y clic de tecnología asistiva; deslizar fila siempre tiene botones visibles; la lupa y las etiquetas arrastrables tienen campo numérico.
- Estados no solo por color: chip elegido lleva ✓ + negrita + relleno; pasos hecho/actual/pendiente con texto accesible («· hecho», «todavía no»); aria-current=step.
- Reflow a 320 px: sin scroll horizontal (scrollWidth 314 ≤ 320).
- Contraste de texto en claro (≈45 piezas, 1440 y 390): todo ≥4,5:1 salvo controles deshabilitados (exentos) y el asterisco de obligatorio (3,20:1, baja). Placeholders 7,45:1 en oscuro y ≥4,5 en claro.
- Iconos con significado (× borrar, duplicar, ojo del PDF, plegar): 3,1 a 7,4:1 (≥3:1 pedido, los dos primeros en claro rozan 3,10).
- Tamaño táctil en teléfono ≥44 px en todo lo tabulable; en escritorio IVA (88×18) y «Copiar» (56×23) son pequeños pero pasan por la excepción de espaciado de WCAG 2.5.8.

### Táctil e interacción

- Tamaños: topbar (44×44), nav de pasos (48 de alto), dock #mbar (44–46), resumen/autorización/entrega (44–46), campos (46) y los 10 modales no tienen objetivos bajo 44 salvo los reportados; la ✕ de cada modal mide 44×44 (t1/t3 a 390 y 360).
- Zonas ampliadas verificadas con elementFromPoint: el número .pmover (26×22 visibles) agarra 42×42 (8 px por lado, 10 arriba y abajo, ::before inset -11px -9px); el interruptor .switch mide 264×44 / 88×44.
- Sin desborde horizontal (scrollWidth = ancho) ni objetivos a menos de 8 px del borde de pantalla en cliente, partidas y autorizada a 390, 360 y 344 (portada del Fold).
- Campos: los 50 inputs/textarea/select medidos tienen font-size 16 px (sin zoom de iOS); teléfono es type=tel inputmode=tel; altura/anticipo/precios usan number con inputmode decimal y letras/piezas numeric; todos con etiqueta.
- Hover: no hay nada que solo aparezca con :hover (todo está tras (hover:hover) and (pointer:fine)); el viewport no bloquea el zoom.
- Gestos que funcionan bien: reordenar con el dedo (se arma a los 300 ms, la partida sigue al dedo), deslizar la partida plegada (bloquea eje a 8 px, revela Duplicar/Borrar sin pelear con el scroll), sostener la × (toque corto da la pista «Mantén presionado para borrar la partida»; soltar a 500 ms no borra; 1,1 s borra con «Deshacer»), deslizador de anticipo (pulgar de 44 px, touch-action pan-y).
- Carga y doble envío: Cotizar con IA (aria-busy + aria-disabled + reloj, cerrar la ventana cancela), Autorizar/sellar y Registrar venta (Piezas.trabajando con «Sellando», reintento), Vectorizar (VT.corriendo, botón apagado y barra con pasos). Todos dicen qué pasa si tarda.
- Candado de la cotización autorizada explicado: banner «El precio está autorizado · editar partidas ›»; «Continuar a partidas» sin datos contesta con el aviso exacto de lo que falta, con el teléfono incompleto también.
- Presión a ≤100 ms donde existe: en los botones principales el transform scale(.97) ya cambió a los 30 ms (transición de 160 ms desde el primer cuadro).
- Teclado simulado (viewport 390×400): los campos enfocados quedan entre la barra de arriba y el dock con 245–268 px de hueco; solo ~30 px del fondo de la textarea de dirección (4 renglones) queda bajo el dock, con el cursor visible.

### Layout y responsive

- Sin desborde horizontal: en los 13 tamaños × 5 estados, scrollWidth == clientWidth (en escritorio 6 px menos por la barra de scroll) y 0 elementos con right > innerWidth. En todos los cortes de media query de la lista, en partidas y autorizada, también da 0.
- Reflow a 320 px CSS (equivale a zoom 200 % sobre 640 px): sw = cw = 320 en cliente, partidas, 6 partidas, precio y autorizada.
- Datos extremos, 320 / 360 / 390 / 1280 px: cliente de 60 caracteres, proyecto de 120, descripción de 400, material de 90, monto $2,111,279.70 y 25 partidas no rompen el resumen, el dock, el topbar, el folio ni los chips. El importe del dock mide 136 px y cabe. Las cadenas sin espacios (60 W, 120 M, 400 X) se recortan con elipsis en small#tab-2-sub, .pdsc e .ia-desc, sin desborde. Al añadir una partida, 24 de 25 se pliegan solas.
- Dock sin tapar contenido: .wrap lleva padding-bottom 94 px y html scroll-padding-bottom 94 px. En el fondo del documento el último contenido queda 20–22 px sobre el dock, medido a 320, 360, 390, 414 y 667×375.
- Saltos de paso: irAPaso(1..4) deja el destino bajo la barra pegada y sobre el dock. scroll-padding-top vale 70 px a 390, 121 px a 360 y 80 px a 1280, y coincide con --top-fijo.
- Meta viewport correcto: width=device-width, initial-scale=1.0, viewport-fit=cover, sin user-scalable=no. Con áreas seguras emuladas por CDP (top 47/bottom 34 en vertical; izquierda y derecha 44–47 en apaisado) el dock queda en bottom 810 = 844−34, en left 44/right 623 a 667 px, y los gutters del contenido respetan el inset lateral.
- Sticky sano: ningún ancestro de .topbar, .side, #pasos ni .pcab tiene overflow, contain o transform que lo rompa.
- Contenedor .wrap con max-width 1240 px: a 1920 las columnas son 852|320 centradas, sin líneas de lectura de 1,500 px. Entre 1024 y 1280 el aside se queda en 320 px y no se corta a lo ancho.
- Modales en vertical (320×568 a 1280×800): Clientes, Historial, IA, confirmar y faltantes caben dentro del viewport (bottom ≤ alto) y sin desborde horizontal. dvh se usa en las capas de modal y pantalla completa.
- Tema oscuro: misma geometría que el claro (alto del documento y del topbar idénticos en 390, 1280 y 667). La app solo reacomoda la barra de arriba al pasar por cortes de ancho; no depende del tema.

### Rendimiento percibido

- CLS en la carga: 0.0005 en PC y 0.0007 en móvil con CPU ×4 más 3G rápido. El esqueleto 'arrancando' tapa el cambio de fuentes, y las fuentes de Google (media=print más swap) no bloquean el render según renderBlockingStatus=non-blocking.
- Fuentes: con Google Fonts retrasado 6 s o bloqueado del todo, la altura de la página cambia solo 2 px de 3011 (3009 contra 3011) y el CLS tras la fuente es 0. El layout no depende de la tipografía web.
- CLS durante el flujo (cliente, partidas, agregar x3, plegar, precio, Historial, Clientes, IA): 0 a 0.0096 por paso. Los saltos de 0.13 al ir a Partidas en PC y al autorizar en móvil los disparé por código (sin entrada del usuario); con un toque real el navegador los excluye del CLS.
- Fugas: tras 30 ciclos de agregar y quitar partida, 60 repintados, 20 vueltas entre pantallas, 20 aperturas del Historial, 40 plegar/abrir y 100 teclas, los nodos del DOM y los oyentes vuelven a la base (3 650 contra 3 633 nodos en la pantalla Cliente) y el heap crece 0.8 MB en total.
- Scroll táctil con 20 partidas abiertas (30 625 px de página) a CPU ×4: mediana de 16,7 ms por cuadro, p95 16,8 ms y 0 cuadros sobre 50 ms, igual con y sin backdrop-filter. Sin tareas largas de animación.
- Pintado: como máximo 4 elementos con backdrop-filter visibles a la vez (topbar blur16 de 114 px, dock #mbar, y los dos .desenfoque-borde blur4); will-change en 0 elementos; en reposo solo corre ia-barrido (transform, 2 iteraciones) y con movimiento reducido no corre nada; sombras grandes solo en topbar, dock y botón de IA.
- Teclear en #f-cli y #f-proy con historial vacío a CPU ×4: 24 a 32 ms por tecla hasta pintar, procesamiento de 2 a 5 ms. saveState cuesta 0.4 a 1.5 ms y las cadenas JSON de la cotización pesan 0.8 KB con 1 partida y 8.7 KB con 30.
- Fotos del Historial con loading=lazy y decoding=async (historial.js histEntradaHTML). El modal Clientes con 200 clientes abre en 147 ms con 4 layouts: no sufre el problema del Historial.
- Service worker (leído, no ejecutado): la plataforma y el cotizador van en un conjunto versionado y atómico con caché primero, la instalación que falla no apaga la versión anterior, hay página propia de sin señal, la recarga por versión nueva espera si hay un campo enfocado o un modal abierto, y los tiles de OSM no se cachean. Con la app instalada la segunda visita no usa red.
- Imágenes con width/height declarados (logo 260x130), una sola imagen en la carga. Fuentes con preconnect y la técnica media=print correctamente aplicada.

### Tipografía, color e íconos

- Familias reales: Manrope (web) pinta el cuerpo y Sora (web) los títulos y cifras, según CDP en h1, .neto .amt y body; Manrope 400–800 y Sora 600/700 cargan. Sin red a 390 cae a Segoe UI sin desbordes (scrollWidth = viewport en los 4 estados) y la tarjeta del cliente solo cambia 6 px de alto (523→529).
- Cifras: 21 de 27 nodos numéricos del resumen usan tabular-nums (los 6 restantes son diminutos). A 390 y a 1440, IVA y Total neto comparten el borde derecho (x=357 y x=1296). Total neto es la cifra mayor del resumen (28 px, Sora) y el dock móvil la repite a 20 px.
- Interlineado: el cuerpo va a 1.45 y no hay ningún texto de varias líneas con line-height menor a 1.4 (lo que parecían casos eran chips con min-height de 44 px).
- Sprite SVG: todos los svg visibles llevan aria-hidden. El trazo es proporcional por símbolo (stroke ≈ 7.9% de la caja en i-ia, i-basura e i-check), así que el peso visual es coherente entre tamaños.
- Contraste calculado en oscuro a 390 en los 4 estados: solo fallan lo deshabilitado, el enlace de salto fuera de pantalla y un glifo × de 3.79:1 (gráfico, aceptable). Los estados ok, falta y mal se leen igual de bien en oscuro.
- Botón de relleno por pantalla: Cliente 1 (Continuar), Entrega 1 (Generar PDF), IA, Faltantes y Registrar venta 1 cada una. Confirmar usa «Borrar» con borde rojo y «Conservar» neutro, sin relleno. En Partidas la única pareja de color es la excepción documentada de IA más Autorizar.
- Estados que no dependen solo del color: ✓ en pasos hechos, número y etiqueta en el paso actual, círculo punteado en pasos en espera, texto «Sin elegir» / «Faltan 3 datos», insignia «Autorizada» con ✓, «Sin calibrar» con punto y texto.
- Texto largo: con un cliente de 78 caracteres y un proyecto de 100 no hay desborde horizontal en ningún estado ni modal (390 y 1440). El nombre del cliente se parte en renglones en el historial, y el paso 2 del nav conserva el nombre completo en aria-label.
- Fuentes con red demorada 2.5 s: la página no se corre. Fuentes bloqueadas: sin desborde.
- Disciplina de colores crudos: los hex de entrega.js son la hoja de papel (tokens propios documentados) y los del escalador son dibujo de lienzo. Los colores crudos del CSS se concentran en .sp-* y .vt-*, los marcos oscuros de las herramientas Pro, y no rompen el contraste en oscuro.

### Formularios y retroalimentación

- Etiquetas: los 8 campos de cliente y todos los de partida (altura, #letras/piezas, ancho, alto, tarifa, piezas, precio unitario, descripción) tienen label for/id. Los 3 obligatorios llevan aria-required y asterisco aria-hidden, con ayuda solo-voz. Las unidades están a la vista en la etiqueta: Altura (cm), Ancho (cm), Tarifa ($/m²), Anticipo ($).
- Teléfono: máscara 33 1234 5678, contador 0/10 que pasa a ✓, y frase para lector de pantalla («Faltan 6 dígitos»). Al pegar «  (33) 1234-5678 », «+52 1 33 1234 5678», «tel: 33 1234 5678 (WhatsApp)» o «Llamar al 3312345678 mañana» siempre queda 33 1234 5678 con ✓. Medido en 390 px.
- Números: las letras no entran, «40 cm» queda en 40, «  40 » queda en 40, y 0, negativos o texto vuelven al campo vacío con la fórmula «Falta: altura» (nunca un 0 silencioso con importe). La altura se redondea a 0.5, y la regla de 10 cm convierte a recorte con aviso visible y anuncio por voz.
- Anticipo: -5000 vuelve al sugerido con aviso, 999999 se acota al total con aviso, y mientras se teclea ya sale «El anticipo supera el total» en línea. Medido en 390 px.
- Autoguardado: recargar a mitad de captura conserva cliente, teléfono, partida y pantalla sin avisos falsos. beforeunload solo salta cuando de verdad hay algo en riesgo, y «sin guardar» aparece en el folio si el almacenamiento falla.
- Partidas sin terminar: el grupo en ámbar dice «Sin elegir» con texto (no solo color), el faltmodal lista cada partida con «Falta tipo de caja» y ofrece «Quitar» solo en las vacías. «Igual que la anterior» y el material heredado («↩ como la anterior») funcionan como atajos.
- Toasts: el de «Deshacer» dura 7.8 s con botón de 44 px. Se anuncian en vozStatus o vozAlert (los errores en asertiva), no roban foco, y el toast queda encima de aimodal, histmodal y confmodal con su botón clicable (elementFromPoint).
- Estados vacíos: Historial («Aún no hay cotizaciones autorizadas… Restaurar un respaldo») y Clientes («Todavía no hay clientes…») explican qué pasa y dan una acción.
- Errores de red: la IA sin señal dice la causa junto al botón («la IA contesta a través de la hoja de AL3D»). Los errores de la hoja traen causa y camino de vuelta (notario.js 120-125), y el dock vuelve a «Autorizar» para reintentar. El anticipo y la comisión del modal de venta no inventan números.
- Foco no tapado: scroll-padding-top 70 px y bottom 94 px. En un recorrido con Tab de 89 elementos en 390 px, ningún campo de formulario quedó bajo el dock ni la barra superior (con señal).
- Contraste del estado «falta»: etiqueta ámbar 6.45:1 en claro y 10.03:1 en oscuro; borde del campo vs tarjeta 3.22:1 y 7.35:1. El color no va solo: hay asterisco, aria-invalid y toast.
- Plegar «Datos que salen en el PDF» no pierde lo escrito (Q.entrega y Q.notaCliente se conservan), y el resumen y los chips del plazo son de 44 px.
- Importes difuminados por defecto (body.precios-ocultos): es decisión de producto y los campos de dinero editables (precio unitario, anticipo, precio autorizado) NO se difuminan, así que se ve lo que se teclea.

### Navegación y flujo

- Barra de pasos (#pasos): nunca deshabilita; tocar un paso futuro explica y lleva al sitio útil. Medido en 4 estados: con cliente vacío, toast «Antes de capturar partidas faltan el teléfono del cliente, el nombre del cliente y el proyecto.» y foco en #f-tel; sin partida con precio, «Antes del precio hace falta una partida con precio mayor a cero.»; en borrador, tab 4 dice «Primero autoriza el precio.» y cae en el paso 3. Cada cambio anuncia «Paso N de 4 · Nombre» para lector de pantalla.
- «Continuar a partidas» con los 3 campos vacíos: el botón dice «Faltan 3 datos», sale el toast, el foco va a #f-tel y los 3 campos se marcan en ámbar (medido a 390).
- Atrás/Adelante: de Partidas, Atrás vuelve a Cliente con lo capturado y Adelante regresa; un modal abierto (Cotizar con IA) se cierra con Atrás sin sacar de la cotización. Los pasos 3 y 4 no suman escalón (decisión documentada).
- Recarga conserva datos: tras recargar en Partidas seguían h=40, n=8, material acero; autorizada vuelve autorizada con paso 4. /cotizador.html sin ?solo=1 reenvía a /#/cotizador con replace, sin rebote. Hay aviso si el cotizador está abierto en otra pestaña.
- Destructivas con fricción proporcional: × de partida (mantener 900 ms + Deshacer 6 s; la partida vacía se borra con un toque), vaciar cotización (mantener + Deshacer 7 s), borrar del historial (900 ms + Deshacer 8 s), restaurar respaldo (copia previa descargada + 1.2 s + pasos visibles) y Rechazar (un toque dice «Mantén presionado para confirmar»). Entrar a «Editar partidas» en una autorizada avisa que habrá que volver a autorizar.
- Sin señal: toast claro «Sin señal no se puede sellar el precio. Lo que tecleaste se queda aquí: autoriza cuando vuelva la señal.» y botón «No se selló · Reintentar».
- Dock y aside dicen lo mismo en borrador (Autorizar yo mismo / Solicitar autorización), autorizada (Generar PDF → Enviar por WhatsApp → Registrar venta → Entregada) y editar (Guardar); un solo botón de color por columna salvo la excepción documentada de «Cotizar con IA».
- Tuteo consistente en toasts, placeholders y ayudas. Objetivos táctiles a 390: pestañas de paso 44×48, botones de la barra 44×44, dock 370×64 (el apartado táctil no se reabre aquí).

### Pantallas de apoyo y modales

- Foco y teclado: Escalador (14 paradas), Vectorizador (19) e IA (6) mantienen el Tab dentro del modal, todo con anillo de 2 px azul visible; Escape cierra y devuelve el foco. Verificado con teclado real.
- Objetivos táctiles a 390 px: IA, Historial, Registrar venta y sus campos miden 44 a 46 px; los campos van a 16 px (iOS no hace zoom); los deslizadores del Vectorizador miden 44 px de alto; los lienzos llevan touch-action:none.
- Estados vacíos con instrucción: Historial vacío y Cuadernos vacío explican qué hacer y ofrecen «Restaurar un respaldo»; el Escalador y el Vectorizador muestran invitación y pista; IA sin archivo dice qué falta.
- Vista de restaurar respaldo: cabe en 390×844, 360×640 y 844×390 (409 y 340 px de alto), el foco cae en el título, el botón «Restaurar» se confirma sosteniendo y la traza de tres pasos se ve.
- Errores de archivo: un JPG dañado o un .txt dan un mensaje que dice qué hacer en Escalador, Vectorizador e IA, sin errores de página.
- Rendimiento con foto 4000×3000: Escalador 0,85 s del cambio a imagen con CPU 4× (0,26 s sin límite); vectorizar 1,3 a 3,2 s con CPU 4×, con barra de avance y aria-busy; fotos de 8000×6000 y 12000×9000 cargan sin error.
- Arrastre de un extremo de cota con 5 cotas y CPU 4×: scMove mediana 7,9 ms, cuadros con p95 de 44 ms y pico de 103 ms (tirón leve); sin límite de CPU p95 de 19,8 ms. No se traba.
- Movimiento reducido: ninguna animación infinita en reposo ni durante el análisis de IA, en Historial, Registrar venta, IA y Vectorizador.
- Protección del trabajo: Cuadernos guarda la nota al cerrar (cerrarCuadernos llama cuaGuardarNotaYa); cargar otra foto en el Escalador pregunta con «sostener»; borrar una medida trae «Deshacer»; el modal de IA NO se cierra al tocar fuera.
- Registrar venta y Revisión remota: el botón trabajador muestra espera, éxito y «Reintentar»; los campos de fecha, anticipo y cuenta son claros y los de solo lectura (IVA, comisión) se distinguen.
- Tema oscuro: Historial, Registrar venta y Escalador se leen bien en 390×844; las superficies, bordes y chips conservan su separación.
- Sin errores de página en ninguna de las ejecuciones (arrays de errores vacíos).

### Salida al cliente

- Hoja 1 con 1 a 4 partidas (con y sin plano): cliente, proyecto y dirección en la ficha, título a 12.75 pt, 'Total neto' en bloque azul de 11.25 pt a ~32 % del alto de la hoja, plan de pago debajo y QR de verificación dentro de la nota. Jerarquía qué / para quién / cuánto resuelta.
- Cifras: money() da $17,600.00, columnas Precio unitario y Total alineadas a la derecha con tabular-nums (encabezado y valores terminan en el mismo x medido), Subtotal + I.V.A. 16% + Total neto cierran; la prueba pdf-hoja-carta.mjs además vigila que la tabla sume y que no se imprima un unitario que no multiplica.
- Geometría de papel: 16 de 16 hojas medidas miden 1056 px de alto en print, el PDF físico tiene el mismo número de páginas que .pg (7/7 en el caso de 6 partidas) y el pie 'Hoja X de Y' dice la verdad. En pantalla cada hoja es 816x1056 y en teléfono de 390 px el documento no desborda (scrollWidth 390).
- Vista previa en teléfono: la hoja se encoge a zoom .41 (335 px de ancho), la barra fija mide 54 px con botones 'Al ancho' y 'Guardar PDF' de 44 px de alto, y 'Al ancho' sí pone la hoja a zoom 1 (probado con clic; ya estaba documentado).
- color-scheme:only light en el documento: no se invierte con el modo oscuro del teléfono del cliente.
- Blanco sobre el azul de marca (#3018f8) da 8.04:1 y en escala de grises el azul equivale a ~#393939: los encabezados de tabla y el Total neto siguen legibles en blanco y negro; el descuento lleva signo '−' además del verde (no depende solo del color).
- La hoja de términos (8 apartados, 7.8 pt, interlineado 1.7, dos columnas con divisor) se lee ordenada, y el bloque de aceptación con firma/fecha cabe sin cortarse.
- Hoja de opciones: tarjetas A/B/C lado a lado con precio a 10.5 pt y marca 'Incluida en el total'; la tabla suma solo la opción abierta.
- El mensaje de WhatsApp es corto (287 a 431 caracteres, 8 a 10 renglones), sin emojis, con folio y proyecto en negrita de WhatsApp, total con '(IVA incluido)', anticipo y límite; y no mete la nota de respaldo. 'Ver mensaje' lo enseña antes de salir.
- verificar.html a 390 px: sin desborde, veredicto con glifo y palabra (no solo color), sello 'La prueba es esta dirección, no la imagen', botones Coincide / No coincide de ≥44 px y pie con enlaces de 44 px de alto. Ya lo vigila publicas.mjs.
- El PDF no imprime hojas vacías (instalación sin datos, recibo sin anticipo) y el nombre de archivo que sugiere el navegador sale del título: 'Cotización COT-0042 · AL3D'.

### Tema oscuro, vidrio y contraste

- Arranque sin destello: con sistema.css y vidrio.css retrasados 2,5 s, el primer pintado (2648 ms) ya salió oscuro; en DOMContentLoaded data-tema=oscuro y body rgb(15,17,36). tema.js corre antes de las hojas.
- logo-al3d-oscuro.svg sí se usa: tema.js cambia el src de los 3 img.logoimg del cotizador al tema oscuro (verificado en render). meta theme-color pasa a #0f1124 en oscuro y color-scheme:dark queda en <html>.
- Vidrio con contenido real detrás (scroll cada ~60 px, 390 y 1440): peor caso 4,82:1 en claro y 4,87:1 en oscuro en barra, dock y pestañas; sin backdrop-filter (inyectado *{backdrop-filter:none}) el peor es 4,61:1. El relleno al 93 % hace seguro el respaldo sin desenfoque.
- Velo de los modales (rgba .52 + blur 14 px): la página detrás queda a 1,2–1,3:1 de rango (ya no se lee) en claro y en oscuro, con IA, Historial y Confirmar a 390 y 1440.
- Avisos emergentes: neutro 17,0:1 claro / 16,1:1 oscuro; verde 5,13 / 5,38; rojo 5,56 / 7,02; botón «Deshacer» 11,9 / 13,7.
- Foco por teclado (39 controles, 1440): outline 2 px de --a en todos (4,95:1 claro, 5,11:1 oscuro); los inputs enfocados cambian de borde. En colores forzados el foco de un input sí se ve y los chips elegidos conservan el ✓.
- Hover: ~8 controles cambian borde o fondo en los dos temas con magnitudes comparables (chip, +Agregar partida, Historial, pasos).
- Paridad general: barrido de 7 estados × 2 anchos en oscuro no encontró superficies claras sueltas ni textos <3:1 salvo el enlace de salto; escalador, vectorizador, cuadernos y Registrar venta se ven coherentes en ambos temas.
- Impresión: con tema oscuro el papel sale claro (body blanco, color-scheme light); de 1351 elementos solo 20 difieren del claro y casi todos están ocultos al imprimir. La hoja del PDF declara color-scheme:only light.
- Selector de tema: 44×44 px, luna en claro y sol en oscuro, title y aria-label cambian, se guarda en al3d_tema y el meta theme-color acompaña.

## Resumen de cada lente

### Accesibilidad

Revisé la lente de Accesibilidad con Chromium propio (Playwright) y el árbol de accesibilidad de CDP. Recorrí con Tab los estados cliente, partidas y autorizada a 1440 y a 390 en claro (más 1440 en oscuro); probé 10 modales con teclado (Historial, Cuadernos, Registrar venta, Confirmar, IA, Escalador, Vectorizador, Faltantes, Revisión remota con datos de prueba y respaldo del PDF) a 1440 claro y 390 oscuro; hice barrido semántico, etiquetas, contraste de texto y no textual en claro y oscuro, movimiento reducido, alto contraste forzado, reflow a 320 px, viewports de zoom 200 % y laptop, y tamaños de texto. No toqué ningún archivo del repo: los arreglos de los hallazgos 2 y 3 los validé inyectando CSS en una página desechable.

Juicio general: la base de accesibilidad es sólida y muy trabajada (modales, nombres, estados ARIA, alternativas a gestos, movimiento reducido). Los problemas reales son de otro tipo: (1) el foco del teclado queda tapado por los bloques pegajosos (encabezado de partida y columna del dinero) en laptops chicas, con zoom o con el teléfono acostado; (2) los contornos de campos e interruptores son demasiado pálidos; (3) el tema oscuro nunca se mide en contraste.

NO pude revisar: lector de pantalla real (VoiceOver/TalkBack), teclado virtual del teléfono, el visor a pantalla completa (lightbox), el flujo de restaurar respaldo, el modo empotrado, Safari/iOS, ni el ajuste de tamaño de fuente del navegador (solo análisis de código: 0 rem, 133 declaraciones en px). La revisión remota se probó con una solicitud inventada.

_Omitidos por el tope de 10:_ Asterisco de obligatorio (.req, --amber-ico) a 3,20:1 en claro; 12,5 px/800; rápido de arreglar con el ámbar de texto (--amber).; «Autorizar yo mismo» y «Solicitar autorización» deshabilitados (disabled, no aria-disabled) no reciben foco ni se enlazan por aria-describedby con «Agrega partidas con precio para continuar»; el botón del dock tampoco explica el motivo (lo cubre #prog-next).; Los totales (subtotal, neto, Completitud, anticipo) cambian sin región activa: un lector de pantalla no oye el importe nuevo mientras se teclea (solo hay live en #vozStatus, #vozAlert, #isla y #cand-partidas-txt).; No hay landmark de banner (la barra superior es un div) y las partidas no son encabezados: el lector de pantalla solo ve h1 y h2 «Partidas».; En los modales el foco inicial cae en «Cerrar» (×), no en el primer campo (p. ej. el buscador del Historial).; El anillo de foco del tipo de partida elegido en oscuro (Letras 3D) mide 1,76:1 contra su relleno azul, aunque contra el fondo del segmento llega a 5,1:1 (se ve; es criterio AAA 2.4.13).; Los iconos × y «Duplicar» dan 3,10:1 en claro: pasan el 3:1 por muy poco.; Los chips son div role=button con tabindex y funcionan, pero el skill prefiere <button> nativo (Compact Control Semantics).; Barra de completitud: relleno contra pista 2,04:1 en oscuro (el porcentaje va en texto, así que no bloquea).; A 320×256 la pila pegajosa (partida-top de 123 px + dock de 74 px) deja ~12 px de hoja visible (extremo de reflow 400 %; lo cubre el hallazgo 2).

### Táctil e interacción

Revisé el cotizador desde la lente táctil e interacción, con un Chromium propio (arnés Playwright) a 390×844 y 360×740 (más 344 para desbordes y 390×400 para el teclado), en los estados cliente, cliente con «Datos del PDF» abierto, partidas (una plegada y otra abierta), autorizada, y dentro de 10 modales (IA, Cuadernos, Historial, confirmar con y sin «sostener», faltantes, revisión remota, Registrar venta, Vectorizador y Escalador con y sin imagen). Medí el rectángulo de todos los objetivos visibles, probé con elementFromPoint las zonas ampliadas con ::before, tracé qué regla CSS gana en cada control chico, y ejercité gestos con dedo real por CDP (reordenar, deslizar fila, sostener para borrar, tap lento, scroll desde etiquetas) y con ratón.

Juicio general: la base táctil está bien trabajada. No hay objetivos a menos de 8 px del borde, ni desborde horizontal a 344, 360 y 390, y los campos están a 16 px con teclados correctos. Los fallos que sí importan son de gestos que pelean entre sí, no de tamaños. El más serio: arrastrar la etiqueta de una medida cambia cifras (y precio) en silencio cuando el pulgar se desvía al hacer scroll.

Lo que NO pude revisar: dispositivo real (teclado virtual real, safe-area, vibración), :active con toque (los toques sintéticos de CDP no lo activan en este Chromium, así que la presión se midió con ratón en emulación hover:none), el nuevo arrastre con ratón del commit 42c48ad vive en el Tablero de Proyectos (js/mod/proyectos.js, plataforma, fuera del cotizador) y solo lo leí, no lo ejercité en vivo; lo que probé del «draggable armado en pointerdown» es su equivalente en el cotizador (partidas.js, desde el 1-oct). Tampoco vi los controles del Vectorizador/Escalador después de vectorizar/medir, ni repetí en tema oscuro (la lente no depende del tema).

_Omitidos por el tope de 10:_ «Mantén tocado para ver un importe»: el dedo tapa el número que se quiere leer (hay alternativa con el botón «Ver precios» de 44 px).; Explicaciones solo en title=: «Escalar imagen — medir elementos sin cotas», «Vectorizar — convertir el logotipo en trazo de corte», rol Vendedor/Autorizador y «% Comisión · fija» (readonly); en táctil son inalcanzables aunque cada modal las explica al abrirse.; Pasos ya hechos de la barra son tres palomitas iguales sin rótulo (solo el activo muestra texto); hay que adivinar cuál es «Precio».; Chips de material y complejidad a 6 px entre sí y chips de cuenta en «Registrar venta» a 4 px (44 px de alto): bajo los 8 px recomendados pero con objetivos grandes.; La zona del número .pmover (42×42, touch-action:none) es una zona donde el pulgar no desplaza la página.; Pieza «borrar» deslizando la fila plegada borra con un solo toque (con «Deshacer» de 6 s): decisión documentada, no un fallo.; Toast «Autorizada y sellada en la hoja» tapa campos de Registrar venta y las fichas de partida unos segundos (no es de la lente táctil).; El dock no sube con el teclado: no verificable fuera de un teléfono real (en 390×400 queda visible y no tapa el campo enfocado).

### Layout y responsive

Revisé el Cotizador en vivo con Chromium propio (Playwright) en 13 tamaños: 320×568, 320×450, 360×740, 390×844, 414×896, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900, 1920×1080 y los apaisados 844×390 y 667×375. Los estados fueron cliente, partidas (1 y 6), precio y autorizada; además barrí los cortes 339/341, 384/386, 559/561, 759/761, 919/921, 999/1001, 1023/1025 y 1179/1180. También probé datos extremos, 25 partidas, zoom 200 % simulado, áreas seguras emuladas por CDP, teclado simulado con viewport reducido y 5 modales. Verifiqué cada arreglo propuesto inyectando CSS en el navegador, sin tocar el repositorio.

Juicio: la base de layout es sólida, porque no hay desborde horizontal en ningún tamaño ni corte y los datos extremos no rompen nada. Lo que falla son las capas pegadas, que no se dimensionan por alto de pantalla: la cabecera de la partida (.pcab), la barra de arriba y el resumen .side. En horizontal, en tableta, en laptops de 768 px de alto y con zoom 200 % se comen la pantalla. El corte «teléfono» está pensado solo por ancho (≤560 y ≤385) y deja huecos en 386–429 px (iPhone).

Aviso sobre el commit 42c48ad: no tocó css/sistema.css ni el cotizador, solo plataforma, publicaciones y proyectos. Para el cotizador «menos scroll» no cambió nada. Su idioma de columna lateral (max-height + overflow-y:auto + overscroll-behavior:contain) es justo lo que necesita .side.

No pude revisar: dispositivo real, teclado real, la barra de estado de iOS, tema oscuro más allá de confirmar la misma geometría (documento y topbar idénticos en 390, 1280 y 667), ni los modales Escalador, Vectorizador, Registrar venta, lightbox y revisión remota, ni el modo empotrado. Las fuentes pudieron variar unos px respecto al teléfono real.

_Omitidos por el tope de 10:_ Documentación desfasada: SISTEMA-DE-DISENO.md §3.1 dice que .mbar aparece a ≤920 px, pero en render solo aparece a ≤759 px (a 760 y 921 no hay dock); y el comentario de .pcab (css/sistema.css:2430) afirma que en computadora mide un renglón, cuando mide 150–290 px.; .vistazo usa vh en lugar de dvh (css/sistema.css:4655 100vh−24px, :4670 min(72vh,560px), :5410 44vh): en Safari de iPhone con barra dinámica puede pasarse del alto visible. Solo leído en código, sin medir.; Con safe-area-inset-top emulado en 47 px, el renglón pegado de la topbar a 390 px queda en y 4–54, bajo la hora y el notch. Solo ocurriría si iOS devuelve inset superior mayor que 0 (PWA con barra translúcida; el meta apple-mobile-web-app-status-bar-style es «default»). No verificable sin aparato.; Caja de luz a 390 px en tres columnas de 93 px: la etiqueta «Ancho (cm)» mide 101 px y se pasa 8 px, y solo 1 px del hueco de 7 px. Invisible.; Material de nombre largo (90 caracteres, solo si el catálogo cambia): el token .ptok de la partida se corta contra el borde de la tarjeta sin cierre redondeado. Hoy el material más largo mide 32 caracteres.; El navegador de pasos (#pasos) nunca se queda pegado: en una cotización larga no se ve en qué paso se está sin volver arriba. El dock compensa con el total y la acción, así que lo dejo como decisión de diseño, no como defecto.; Falsos positivos de mi detector de texto cortado: button#aibtn (reflejo animado, scrollWidth 623 sobre 322), span.mantener-capa, y span#isla a 768–1024 px (se medía en plena animación de salida).

### Rendimiento percibido

Revisé el Cotizador AL3D con mi lente de rendimiento percibido, en render real con Playwright y en el código, usando cuatro búsquedas del skill ui-ux-pro-max (cumulative layout shift, font loading swap, content visibility lazy, debounce throttle, más virtualize list y perceived performance skeleton). No toqué el repositorio: git status sigue igual y mis scripts quedaron en scratchpad/uiux/rendimiento. Para medir peso gzip levanté un proxy propio en otros puertos, que ya cerré, y no toqué el servidor 8777. Medí lo siguiente.
- Carga en frío con CDP: CPU ×4 más 3G rápido (150 ms, 1,6 Mbps) y 3G lento (400 kbps).
- CLS en la carga y a lo largo de todo el flujo.
- Teclear y tocar con 1, 6, 10 y 30 partidas.
- Fugas de nodos y oyentes tras ciclos de uso.
- Scroll táctil con 20 partidas abiertas (30 625 px de página).
- Cobertura de CSS en 5 anchos/temas.
- Un historial sintético de 25 a 400 cotizaciones.
- Lectura de sw.js.
El hallazgo más importante no estaba en la lista sugerida: abrir el Historial se vuelve lentísimo con el uso, por el vigilante de foco de los modales. Después vienen la carga en frío (14 guiones encadenados y todo sin minificar) y la pantalla muerta del esqueleto a los 8 s.
Límites de lo medido:
- Corrí en Chromium headless de Windows con rasterizado por software, así que no puedo juzgar el costo real de los desenfoques en la GPU de un teléfono.
- El ×4 de CPU es emulación y no un teléfono real.
- No ejecuté el service worker (el arnés lo bloquea); lo valoré leyendo sw.js.
- Otros revisores corrían a la vez, así que los tiempos tienen ruido y doy medianas y rangos, y me apoyo en conteos de layouts, que son estables.
- La cobertura de CSS no cubre :hover, :focus ni :active.
- No probé Safari ni iPhone ni el modo empotrado.
Juicio general: en uso normal con pocas partidas la app responde bien. Teclear y scrollear van fluidos, el CLS es casi cero, no hay fugas y el pintado es sobrio. Los problemas reales aparecen con volumen (historial largo, listas largas de partidas) o con mala señal en una primera visita. Ahí hay arreglos baratos y probados: uno de ellos, parchado solo en la página, bajó la apertura del Historial de 1441 ms a 280 ms.

_Omitidos por el tope de 10:_ Teclear el nombre del cliente con 400 cotizaciones en el historial cuesta 13 a 51 ms de procesamiento por tecla a CPU ×1 contra 1 a 6 ms sin historial (nucleo.js _comboFiltrar, _comboColocar y getBoundingClientRect); sube con el uso pero no estorba solo.; logo-al3d.svg pesa 64,7 KB (16,7 KB gzip) con 9 trazos y 61 números de 4 o más decimales; redondear coordenadas con svgo lo bajaría a unos 30 KB, ganancia chica.; Módulos secundarios cargados al arrancar aunque casi nunca se abren: escalador.js, vectorizador.js e ia.js suman unos 56 KB gzip minificados (≈23 % del JS); cargarlos con defer ya ayuda y sacarlos a carga bajo demanda exige refactor del ámbito global.; renderItems registra 5 oyentes de arrastre por partida en cada repintado (partidas.js ~1163); sin fugas medidas, pero delegarlos en #items bajaría trabajo y memoria.; .pcab sticky con backdrop-filter blur(14px) saturate(1.7) de 800x150 px en PC y el velo .modal-bg de pantalla completa con blur(14px): sin jank medido, pero mi navegador rasteriza por software y no puedo juzgar la GPU de un teléfono real.; El service worker llama a revalidar(req) con un fetch no-cache de un archivo solo para 'enterarse' de un sw.js nuevo; el navegador ya revisa sw.js por su cuenta, así que ese toque a la red parece de más (sw.js revalidar).

### Tipografía, color e íconos

Revisé la lente de tipografía, color, íconos y consistencia en el navegador (Chromium propio con el arnés), sin tocar el repo. Cubrí 4 estados (cliente, partidas, precio, autorizada) a 390 y 1440 en claro, más 390 en oscuro, y 8 modales (IA, cuadernos, historial, faltantes, confirmar, escalador, vectorizador, registrar venta). Medí con getComputedStyle, con la fuente realmente pintada (CDP CSS.getPlatformFontsForNode) y con capturas. Probé nombres largos, sin red de fuentes y anchos de 320 a 1440. Los arreglos de fuentes los probé inyectando CSS en mi propia página, con medición de desborde.

Lo que no pude revisar: la revisión remota y el lightbox (necesitan datos de la hoja real), las fuentes de reserva reales de iOS y Android (solo vi las de este Windows), el oscuro a 1440, la hoja PDF y el modo empotrado. El contraste calculado sobre vidrio o degradado es aproximado y los casos dudosos los confirmé con capturas.

Juicio general: la base es sólida. Los tokens, las cifras tabulares, el contraste en oscuro, el sprite SVG y el uso de un solo botón de color por pantalla se cumplen en lo principal. Los problemas reales son pocos pero visibles. En teléfono y tableta la letra de lo que más se toca (tipo de partida, chips, precios) queda por debajo de la escritorio. Los botones se pintan en Arial. El material elegido queda casi ilegible después de autorizar. Hay un par de usos de color y de ícono que se salen del propio sistema.

Con el skill corrí 7 búsquedas (ux, typography, color e icons) y leí las reglas de quick-reference y pro-rules. El dominio icons no devolvió coincidencias, así que ahí apliqué la regla «No Emoji as Structural Icons» de pro-rules.

_Omitidos por el tope de 10:_ Asterisco de campo obligatorio (span.req) en ámbar rgb(193,131,15) con 3.19:1 a 12.5px, aria-hidden; está en el límite de 3:1 para un gráfico.; css/sistema.css declara Figtree y Outfit en :root, pero nunca se cargan (no hay @font-face ni <link>); solo funciona porque css/vidrio.css las reemplaza por Manrope y Sora. El texto de docs/SISTEMA-DE-DISENO.md sigue diciendo Figtree.; css/vidrio.css pone degradado y sombra de resplandor en todo .btn-pri; docs/SISTEMA-DE-DISENO.md dice que el único degradado que queda es el del botón de IA.; La pila de z-index del documento no lista los valores 90, 99, 299 y 300 que sí usa el CSS (confirmar, avisos, puerta).; Cifras sin tabular-nums, todas de 11 a 12.5 px: «$55» en chips, «$17,600.00 × 1.16», «$0», «50%» y el número del nav.; Los importes «Hoy $10,208.00 / Al instalar $10,208.00» del anticipo van a 11 px en Sora (peso 700), menos jerarquía que el dinero que el vendedor le dice al cliente.; authnote con tres style="border-color:var(--amber-ico);background:var(--amber-bg)…" repetidos en js/cotizador/proceso.js (~427, 438, 443): mejor una clase .authnote.aviso.; Los pies fijos de Escalador y Vectorizador a 390 tapan el último renglón de texto de ayuda (p.vt-esc-note queda recortado bajo el pie).

### Formularios y retroalimentación

Revisé la lente de formularios y retroalimentación en vivo con Playwright, con el arnés compartido y mi propio Chromium. Los viewports fueron 390x844 táctil como principal y 1440x900 de comparación, con tema claro y algunas mediciones en oscuro. Los estados fueron: cliente vacío y a medias, partidas en blanco y completas, precio y autorizada, faltmodal, modal de venta, historial y clientes vacíos, IA sin señal, hoja que falla y recarga a mitad de captura. También corrí 9 búsquedas del skill (inline validation, required, toast/undo, empty state, autosave, teclado/Enter, rangos numéricos, disabled, success feedback) y leí el código de proceso.js, partidas.js, nucleo.js, piezas.js y notario.js.

Lo que NO pude medir: el teclado virtual real de Android o iOS (cuánto tapa el toast y el dock), Safari en iPhone, la IA con un proveedor real, y las formas del Escalador, el Vectorizador y la revisión remota (solo las leí por encima). Tampoco corrí las pruebas existentes; solo busqué qué vigilan.

Mi juicio es que la capa de formularios está muy trabajada: etiquetas, máscara de teléfono, saneo numérico, anticipo acotado, autoguardado, toasts y estados vacíos salen bien. Los problemas reales se concentran en tres sitios:
- El camino de recuperación del aviso de partidas sin terminar falla en teléfono.
- No hay topes ni confirmación en los precios y las medidas que mueven dinero.
- La isla de estado rompe la barra superior en los teléfonos de 390 a 412 px.

_Omitidos por el tope de 10:_ En el modal de Registrar venta, #rv-anticipo no avisa en línea cuando supera el total (venta.js:210 rvAcotar solo corre al comprometer; el campo del resumen sí avisa al teclear). Medido: «99999999» deja «Pago pendiente $0.00» sin mensaje hasta guardar.; Los placeholders se cortan en 390 px: «Nombre o negocio» (campo de 158 px), «Ej. Farmacia San Juan – Letrero fachada» y el de Descripción. Es cosmético porque la etiqueta siempre está visible.; Las filas .falt-ir del aviso de partidas sin terminar miden 36 px de alto en táctil (< 44); entra en el hallazgo 1 como arreglo secundario.; La autoguardado correcto es invisible: nada dice «se guarda sola» en la pantalla de captura (solo el pie de Cuadernos, y la nota del cuaderno sí tiene indicador de guardado); «sin guardar» solo aparece si falla.; Q.cliente se guarda sin recortar espacios («  Farmacia   San Juan  »); verificar que PDF y WhatsApp usen trim.; Con «0» tecleado en #f-anti el rótulo sigue «Anticipo sugerido (50%)» sobre un anticipo de $0.; El teléfono «0123456789» (10 dígitos) se lee como prefijo 01 y el contador dice «8/10»; caso muy raro.; La pista de la × de borrar partida al toque corto (aviso: _avisoBorrar()) no pude verla como texto visible en mis pruebas de ratón con touch emulado; el anuncio por voz sí sale. No lo afirmo como falla.; Coherencia de confirmaciones: borrar UNA partida pide sostener 1 s y además ofrece Deshacer 8 s; vaciar todo pide toque, confirmación inline, sostener y Deshacer 7 s; sellar un precio es un solo toque. El hallazgo 2 cubre la parte de dinero; el resto es criterio de producto.; No pude probar con teclado virtual real el aviso, el dock y los toasts (viewport reducido, interactive-widget no declarado en el meta viewport).

### Navegación y flujo

Recorrí Cliente → Partidas → Precio → Entrega en Chromium propio con clics y toques reales: 390 táctil y 1440 con ratón, tema claro; vendedor con pase de Dirección y vendedor sin él (rol «ventas» sobre la hoja de mentiras); sin señal, recarga, Atrás/Adelante, deep link y estados bloqueados. Conteo hasta «PDF generado»: 10 toques y 5 campos a 390 con Dirección; 11 clics a 1440 (uno se pierde, ver hallazgo 1); el vendedor sin Dirección llega a «Solicitud enviada» en 8 toques y 5 campos y ahí se detiene hasta que Dirección autorice. Corrí 6 búsquedas del skill (stepper, back, destructivas, acción primaria, multi-paso y undo) y apliqué sus reglas de Navegación, Formularios y Táctil. El flujo está muy trabajado: la barra de pasos explica en vez de bloquear, las destructivas llevan mantener presionado y Deshacer. Lo que falla son costuras entre piezas: un repintado que se come el primer clic, el dock mudo cuando está apagado, y el estado «esperando a Dirección», que solo se entiende a 3 pantallas de distancia. No pude revisar: teléfono real ni teclado virtual (el dock puede quedar tapado al teclear), el modo empotrado más allá de ver que el deep link llega a /#/cotizador, la cola remota de Dirección real, ni el tema oscuro (solo claro). El movimiento no se tocó (auditado en PR #75).

_Omitidos por el tope de 10:_ Pasos 2–4 solo muestran el número a 360–390 px (la pestaña activa se queda con 212 px y las demás con 42): el vendedor nuevo no sabe qué son «2 3 4» hasta llegar.; El folio provisional (borde punteado) solo se explica en el title, que no se ve en táctil; el sufijo de dispositivo (-Q, -H, -A) no se explica en ningún lado.; Dock del Autorizador: «Revisar precio» (verde, sube al resumen) convive con «Autorizar precio» (verde) en el formulario: dos verdes con verbos distintos.; Para Dirección, «Autorizar yo mismo» y luego «Autorizar precio» son dos toques aunque no se ajuste el precio.; El toast del sello parte el código en dos líneas («PRUE-BA00-» / «0001») y dura lo mismo que un aviso corriente.; Modo empotrado en 390: el dock del cotizador se apila sobre la barra inferior de la plataforma (no medido a fondo, fuera de alcance).; Texto de ayuda «el/la cliente» en la etiqueta de dirección frente a «del cliente» en el resto.

### Pantallas de apoyo y modales

Revisé en Chromium (Playwright) las pantallas de apoyo: Escalador, Cotizar con IA, Historial (lista y vista de restaurar), Cuadernos, Registrar venta, Revisión remota, Faltantes, Confirmar y Vectorizador. Medí a 1440×900, 1366×768, 1920×1080, 390×844, 360×640, 360×780, 375×667 y 844×390 apaisado, en claro (oscuro en Historial, Registrar venta y Escalador) y con movimiento reducido. Probé con ratón, con dedo (touchscreen y eventos CDP) y con Tab/Escape. También probé una foto de 4000×3000 con la CPU 4× más lenta, fotos de hasta 12000×9000 y archivos dañados. Corrí 7 búsquedas del skill. Lo más serio está en el teléfono: el Historial pierde la lista cuando la pantalla es corta o está acostada, el botón «Vectorizar» queda enterrado, y Escalador y Vectorizador regalan poco lienzo y un pie fijo muy grande. Registrar venta y Revisión remota tienen el botón principal fuera de pantalla y se cierran al tocar fuera descartando lo escrito. En lo demás la app está muy cuidada: foco, Escape, estados vacíos, errores y rendimiento salieron bien. Las pruebas de navegador existentes miden estas pantallas con alturas de 780 a 950 px, así que no ven el hueco de pantallas más cortas ni de teléfono acostado. No pude probar: teléfono real, teclado en pantalla, el análisis de IA exitoso (la hoja de mentiras no tiene llaves; simulé la espera con un retraso de 7 s), PDF (pdf.js viene del CDN), el visor de imagen (lightbox) ni el detalle de un cuaderno.

_Omitidos por el tope de 10:_ Dibujo de cotas sobre la foto: letra de 10,5 px, y dos de los ocho colores del texto no llegan a 4,5:1 sobre el halo blanco (#e65100 da 3,79:1, #558b2f da 4,10:1, la cota elegida #e03060 da 4,41:1). La guía cian (#00b8d9) da 2,37:1 contra blanco (js/cotizador/escalador.js:41-42, 1145).; Cargar una foto grande en el Escalador no muestra ningún indicador: con CPU 4× pasan 0,85 s (foto de 4000×3000) a 1,8 s (8000×6000) con el recuadro «Carga una imagen para medir» todavía a la vista. Un PDF sí tiene traza.; Vectorizador: «Medir el vector en el escalador» usa la clase .sp-ai, el degradado de IA que el sistema reserva para IA (docs/SISTEMA-DE-DISENO.md, §2.17). Con «Vectorizar» y «Agregar como partida» quedan tres botones llenos en el mismo panel.; El texto de error de IA sin archivo dice «Arrastra aquí el archivo, pégalo, o toca el recuadro…» en el teléfono, donde no se arrastra ni se pega (ia.js; el recuadro sí tiene variantes solo-raton y solo-dedo).; IA acepta un JPG dañado: la ficha sale verde con el icono de imagen rota y «Analizar y cotizar» sigue activo; el fallo llega hasta el análisis.; Revisión remota: «Rechazar» (btn-dgr) queda a 8 px debajo de «Autorizar precio», se manda con un solo toque, avisa al otro teléfono y no se puede deshacer.; Cerrar el modal de IA con × o Escape cancela un análisis en curso, que cuesta dinero, sin preguntar (ia.js:387, aiClose).; Vectorizador: elegir otra imagen reemplaza el trazo, los colores quitados y la medida real sin preguntar (vectorizador.js:104).; Faltantes: el renglón «ir a la partida» (.falt-ir) mide 36 px de alto con el dedo; el resto de los botones del modal llega a 44.; Vista de restaurar: la fecha del respaldo sale en ISO («2026-10-08»), distinta de «8 oct 2026» del resto de la app.; El recuadro «Proveedores de IA» cerrado mide 70 px de alto, casi tanto como la zona de arrastre, y es configuración que un vendedor no usa.

### Salida al cliente

Revisé la salida al cliente de punta a punta. Generé la hoja de verdad con generarPDF() desde la app en estado «autorizada» (1 partida con plano, anticipo, límite y datos de instalación, y 6 partidas con una de ellas con 3 opciones), la rendericé en Chromium con media=print a 816x1056 (carta), medí el DOM, capturé hojas y saqué PDF para contar páginas y anotaciones de enlace. También medí el mismo documento en pantalla de teléfono (390 px), el mensaje de WhatsApp (mensajeWhatsApp) y verificar.html y condiciones.html a 390 px, y leí entrega.js, ESTRUCTURA-COTIZACION-CANVA.md y pdf-hoja-carta.mjs. Corrí 8 búsquedas del skill; dos (share sheet y trust signals) no dieron resultados en la base y lo digo en las reglas citadas. Juicio general: la hoja 1 con 1 a 4 partidas está muy bien resuelta (se ve cliente, proyecto y Total neto sin hacer scroll, cifras alineadas, QR, plan de pago), pero hay huecos reales en lo que el cliente hace con el documento: no puede tocar nada, no sabe el siguiente paso, y la letra y el gris del papel son demasiado chicos. NO pude revisar: papel impreso ni teléfono real (Android/iOS), el diálogo real de Guardar PDF en teléfono, cómo se ve el mensaje dentro de WhatsApp, ni el B/N físico (lo estimé con matemática de luminancia). En mis corridas Inter cargó de Google; sin red cae a Segoe UI y eso ya lo vigila pdf-hoja-carta.mjs. En el caso de 6 partidas el PDF salió sin QR porque el sello de la hoja de mentiras era de 1 partida: es el comportamiento esperado (generarPDF avisa), no un hallazgo.

_Omitidos por el tope de 10:_ Recibo de pago: 'La cantidad de $', 'Monto $' y 'Saldo pendiente $' salen en blanco aunque la app ya sabe el anticipo y la resta (pre-imprimirlos en el primer recibo ahorraría escribirlos); La nota se estira a la altura de la tarjeta de totales (~230 px) con una sola línea de texto cuando no hay QR en medio (seis-pg2.png): bloque lavanda casi vacío; 'Resta al entregar' (hoja 1) vs 'debe liquidar en máximo 2 días posterior a la instalación' (términos): dos formas de decir la misma condición; Con las hojas del taller dentro, 'Hoja 4 de 7' es la última que el cliente necesita y el pie sugiere que faltan tres; El QR mide 62 px (16 mm, módulo ~0.36 mm): funciona, pero está en el límite de lo recomendable para impresoras de oficina; subir a 72 px daría holgura; El mensaje de WhatsApp promete 'Le adjunto el PDF' aunque el PDF se adjunta a mano; ya mitigado con la pista 'adjunta el PDF que guardaste' del hito; 'Créditos' del pie de verificar.html cae a la derecha sola mientras Privacidad y Condiciones bajan a un segundo renglón a 390 px

### Tema oscuro, vidrio y contraste

Revisé la lente «tema oscuro, vidrio y modos de contraste» sobre el render real (Chromium propio, 127.0.0.1:8777), en solo lectura. Fotografié y medí 9 estados (cliente, partidas sin y con chips elegidos, precio, autorizada, Historial, IA, avisos, confirmar, más escalador/vectorizador/cuadernos/venta) en claro y oscuro a 390 y 1440. Medí: contraste por píxeles sobre vidrio con 250 lecturas de scroll por tema, fronteras de ~60 controles por estado, velo de modales, foco por teclado en 39 controles, hover y pulsado, avisos, impresión emulada, arranque con CSS retrasado, y los modos forcedColors:active, contrast:more y prefers-reduced-transparency (este último vía CDP). También volví a correr la prueba contraste.mjs del propio repo en oscuro con copia propia. El vidrio, el velo, el arranque sin destello y el foco están bien. Lo que falla son los bordes del sistema: no hay NINGUNA respuesta a colores forzados, «aumentar contraste» ni «reducir transparencia», y el tema oscuro tiene huecos que la prueba de contraste no ve porque solo corre en claro. No pude revisar: Windows con tema de contraste real (Chromium solo emula la paleta), iOS/Android reales (barra de estado, pantalla de arranque de la PWA), el diálogo de impresión nativo ni lector de pantalla. No toqué ningún archivo del repo (git status solo muestra el .claude/ que ya existía).

_Omitidos por el tope de 10:_ Pantalla de arranque de la PWA instalada: manifest.webmanifest trae background_color #f2f3fe fijo (claro), así que abierta en oscuro puede mostrar un destello claro antes de pintar; un manifiesto no varía por tema y no se pudo medir aquí.; apple-mobile-web-app-status-bar-style=default (cotizador.html l.32 e index.html) sigue al sistema y no al tema de la app: con sistema claro y app oscura la barra de estado de iOS quedaría clara. Sin teléfono real para confirmar.; Los botones no elegidos de .seg y .tipo-seg no cambian nada al pasar el cursor, en claro ni en oscuro (no es de tema, pero se ve en la tabla de hover).; cotizador.html l.992: borde rgba(21,160,106,.2) escrito a mano que no cambia de noche (inocuo).; docs/SISTEMA-DE-DISENO.md dice que ningún modal desenfoca el fondo, pero el render da backdrop-filter blur(14px) saturate(1.3) en .modal-bg: el CSS manda, el documento está desfasado.; El pulgar del interruptor sigue blanco sobre la pista en forzado: con el arreglo de colores forzados hay que usar ButtonText para el pulgar apagado.

