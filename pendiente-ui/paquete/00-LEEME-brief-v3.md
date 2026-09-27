# Ideas de UI para todo el repo AL3D — brief v3 para Claude Design

> **En este paquete** los archivos se renombraron para que se ordenen solos: `muestras-ui-cotizador-al3d.html` → `muestras-1-piezas-01-11.html`, `…-parte-2` → `muestras-2-piezas-12-26.html`, `…-parte-3` → `muestras-3-piezas-27-36.html`, `…-parte-4` → `muestras-4-piezas-37-45.html`, `…-parte-5` → `muestras-5-piezas-46-56.html`, `…-parte-6` → `muestras-6-piezas-57-66.html`, `…-parte-7` → `muestras-7-piezas-67-76.html`, `…-parte-8` → `muestras-8-piezas-77-86.html`, y `anexo-detalle-por-zona.md` → `01-anexo-153-fichas.md`.

**Fecha:** 26-sep-2026 · **Repo:** `eliasgaribi-ctrl-z/cotizador-al3d`, rama `main`, commit `9ff7318` (PR #70)
**Qué cambió:** la v1 traía 11 ideas del cotizador. La v3 suma **60 muestras nuevas (27–86)** y **cinco funciones que el repo todavía no tiene** (sección 2b). Esta revisa **todo el repo** —cotizador, plataforma (sus 10 módulos), núcleo, anidador, páginas públicas y PWA— y lo cruza contra los catálogos completos de las cuatro librerías: **153 lugares concretos**, cada uno con archivo y línea.

**Los archivos que van juntos:**

| Archivo | Para qué |
|---|---|
| **Este brief** | Qué construir, dónde va, en qué orden. Empieza aquí. |
| `anexo-detalle-por-zona.md` | Las 153 fichas completas (Dónde · Hoy · Propuesta · Sale de · Cómo · Cuidado). Los ID (C1, H4, P7…) de las tablas de abajo apuntan ahí. |
| `muestras-ui-cotizador-al3d.html` | Piezas 1–11 funcionando (v1). |
| `muestras-ui-cotizador-al3d-parte-2.html` | Piezas 12–26: las piezas compartidas. |
| `muestras-ui-cotizador-al3d-parte-3.html` | Piezas 27–36: el cotizador delante del cliente. |
| `muestras-ui-cotizador-al3d-parte-4.html` | Piezas 37–45: IA, escalador, vectorizador e historial. |
| `muestras-ui-cotizador-al3d-parte-5.html` | Piezas 46–56: plataforma, taller y anidador. |
| `muestras-ui-cotizador-al3d-parte-6.html` | Piezas 57–66: el día a día del taller. |
| `muestras-ui-cotizador-al3d-parte-7.html` | Piezas 67–76: cotizador y herramientas, lo que faltaba. |
| `muestras-ui-cotizador-al3d-parte-8.html` | Piezas 77–86: plataforma y anidador, lo que faltaba. |

**Cómo se hizo:** cinco revisores leyeron el repo por zonas con los catálogos completos (React Bits 209 componentes, Vengeance UI 74, Skiper UI 107, Animmaster por categorías). Después se comprobaron solas las **365 referencias a archivo y línea y las 297 a funciones** del anexo: todas existen. Los hallazgos de la sección 1 se revisaron a mano, uno por uno.

---

## 0. Reglas del repo (no cambian desde la v1)

1. **Vanilla JS, sin build, sin npm.** La CSP de `cotizador.html` solo deja scripts propios y de `cdnjs`. Nada de React, Framer Motion, GSAP, Tailwind ni Three.js: todo se porta a mano.
2. **`css/sistema.css` va en capas** (1–8). El movimiento nuevo va en la capa 4, y su apagado en los bloques de `prefers-reduced-motion` (el último, al cierre de la capa 8). Lee `docs/SISTEMA-DE-DISENO.md` §0 y §3.
3. **Una sola pieza se mueve sola: el botón «Cotizar con IA».** Todo lo de este brief se mueve porque alguien tocó algo, o es un momento breve que se apaga.
4. **Contraste medido, 4.5:1.** `--a-claro` y `--a3` no llevan texto. El estado no se dice con `opacity` (§4.3).
5. **`prefers-reduced-motion` apaga el adorno, no la información** (una mecha o un relleno de avance se quedan).
6. Clases semánticas en español, zonas táctiles de 44 px, tema claro **y oscuro**, teléfonos de gama media.
7. **Una sola implementación por patrón.** Las 26 piezas de la sección 2 se construyen una vez (en `js/nucleo/ui.js` para la plataforma y `js/cotizador/nucleo.js` para el cotizador —hoy hay dos `toast()`, dos `copiarTexto()`…—) y se llaman desde todos los lugares de la sección 3.

---

## 1. Antes que el diseño: seis cosas que encontré y que ya están mal

No son ideas de UI: son fallas que salieron al recorrer el código. Las revisé a mano en el repo.

| # | Qué pasa | Dónde | Por qué importa | Ficha |
|---|---|---|---|---|
| **1** | **«Verificar a mano» dice «No auténtica» a cotizaciones buenas.** El formulario pide el folio completo `COT-0042@K7QM`, pero el PDF solo imprime `COT-0042` (cabecera) y junto al QR solo el dominio y el código. La hoja rechaza cualquier folio sin `@` (`folioValido()`) y contesta `no_autentica`. | `verificar.html` 59–67 · `js/cotizador/entrega.js` 513–518 y 857 · `puente/hoja-apps-script.gs` 2899–2903 y 3291 | Es la página que ve un cliente o un tercero. Quien no escanea y teclea desde el papel recibe «No auténtica» con una cotización buena. | A1 |
| **2** | **El error «el total no es el que selló la hoja» se pierde.** En la autorización remota, `aplicarSello()` avisa el error (12 s) y regresa, y en la línea siguiente `avisoDelNotario('✓ … autorizó')` lo reemplaza, porque hay un solo `#toast`. | `js/cotizador/notario.js` 181–183 y 344–345 · `js/cotizador/nucleo.js` 670 | Es justo el aviso que evita mandar un PDF con un total y un QR con otro. La pieza 12 (pila de avisos) lo arregla. | C3 |
| **3** | **Cuatro piezas se mueven solas, además del botón de IA:** `.cand-partidas` (late en bucle), `.cand-cliente.ojo` (late en bucle), el brillo de `#prog-bar::after` y el icono de `.ai-drop` (respira en bucle). | `css/sistema.css` 3143, 3362 y 3399 · `css/vidrio.css` 443 | La regla del propio sistema de diseño dice «una sola». Hay que dejarlos en un solo disparo cuando algo cambia. | C7, C19, H20, P11 |
| **4** | **`verificar.html` se ve distinta al resto de la app:** su logo no lleva `.logoimg` (de noche el «AL» se pierde sobre el marino, el mismo defecto que ya se corrigió en `puerta.js`) y no enlaza `css/vidrio.css` (pinta con la letra del sistema aunque descarga Sora y Manrope). | `verificar.html` 20–22 y 41 | Es la página de confianza hacia afuera. | A3 |
| **5** | **WhatsApp avisa del número inválido DESPUÉS de abrir**, y marca el hito «chat abierto» aunque no haya chat. | `js/cotizador/entrega.js` 170–183 | Se puede decir antes de tocar, en la pista del hito. | H2 |
| **6** | **El anidador gira las piezas cada 90° por omisión, también en aluminio cepillado y MDF.** La mesa pinta la veta, pero nada avisa que una letra girada 90° queda con la veta atravesada. | `anidador-vectores/index.html` 229–237 (`#an-rot`, «cada 90°» seleccionado) | En brush, eso se ve en el anuncio terminado. Es una pregunta para el taller: el aluminio blanco, negro o pintado no tiene veta. | A5 |

---

## 2. Las 26 piezas compartidas: se construyen una vez y entran en muchos lugares

Esto es lo que Claude Design construye primero. Cada pieza tiene su muestra funcionando; la columna «Entra en» son los ID de la sección 3 y del anexo.

| # | Pieza | Muestra | Sale de | Entra en |
|---|---|---|---|---|
| 1 | **El total que rueda** (odómetro por dígito, alineado a la derecha) | parte 1 | React Bits Counter / CountUp · Skiper skiper37 · Vengeance Animated Number | total, dock, `.pf-cuenta` que cambian (P18, F23), diferencia de conteo (F4), cifras del vectorizador y cuadernos (H26), C23 |
| 2 | **La ficha que viaja** en un grupo de opciones | parte 1 | React Bits RubberSegment / PillNav · Vengeance Spotlight Navbar | `.seg`, `.tipo-seg`, `#f-plazo`, `#rv-plazo` (C23), barra de módulos (P19), modos y vistas del vectorizador (H26), «Como vienen / Acomodadas» (A25), índice de Ajustes (F22) |
| 3 | **Arrastrar sobre la etiqueta** para mover una medida | parte 1 | React Bits ScrubField | alto, letras y m² de partidas; alto/ancho del vectorizador y cm de referencia del escalador (H26) |
| 4 | **Popover de desglose o de vistazo** (atributo `popover` nativo) | parte 1 | React Bits WarmTooltip · Skiper skiper101 · Vengeance Cursor Card | precio de la partida, total del dock (C23), mensaje de WhatsApp (H2), plazo sugerido (H19), cuaderno del cliente (H21), pieza del anidador (A10), veta (A5), mes de Ventas (P27), menú de cuenta (F28), día del calendario (F26), iconos sin texto (C25, P31) |
| 5 | **Mantener presionado para confirmar** | parte 1 | React Bits HoldButton | Autorizar, Borrar partida, «Sí, borrar todo» y Rechazar (C23), los 5 `window.confirm()` de proyectos.js (P1), borrar del historial (H26), restaurar respaldo (H25) |
| 6 | **La palomita que se dibuja** | parte 1 | React Bits StatusMark / SpringCheck | sellado, venta registrada, copiar (F31, C11, H18), chips de la ficha (P2), «Qué atender» (P13), conteo del mes (F6), verificar renglón por renglón (A14), hitos (C23) |
| 7 | **El encendido de neón** (un momento) | parte 1 | Vengeance Border Beam · React Bits ElectricBorder / StarBorder | cotización autorizada, también la remota (C23), título de «acerca» discreto (A27), logo al volver la señal (A17) |
| 8 | **Pasos que avanzan** (traza de lo que está pasando) | parte 1 | React Bits ThoughtLine · Vengeance Kinetic Text Loader / Generate Button | IA del cotizador, asistente de la plataforma (F14), arranque de la plataforma (P22), puerta de entrada (F10), restaurar respaldo (H25), abrir PDF (H12) |
| 9 | **Deslizar un renglón** para descubrir acciones | parte 1 | React Bits SwipeRow | partidas, renglón del Tablero (P29), medida del escalador (H26) |
| 10 | **Bordes que se desvanecen** en filas con scroll | parte 1 | Skiper skiper87 | chips, tira de etapas y tablero del Fold (P23), fórmula de material y tira del asistente (F30), historial y cuadernos (H26) |
| 11 | **Desenfoque progresivo** bajo el dock | parte 1 | Skiper skiper41 · React Bits GradualBlur | `.mbar`, `.pf-abajo`, `.topbar` |
| 12 | **Aviso con mecha, pausa, deslizar y pila** | parte 2 | React Bits SwipeToast · FuseButton · AnimatedList | los dos `toast()` (C2, F1, H6, P17): pila que no se pisa (C3 = falla 2), deshacer del anidador (A9), «se actualizó la app» (A22) |
| 13 | **Hoja del teléfono que se cierra deslizando** | parte 2 | React Bits SwipeToast · Stack | `.pf-panel` de la plataforma (P10, F8), velo de las hojas del cotizador (C26) |
| 14 | **El botón que está trabajando lo dice** (relleno, reloj, ✓ o reintentar) | parte 2 | React Bits CallChip · LatticeLoader | sellar y Registrar venta (C5), puente en Ajustes y órdenes a Calendar (F7), «Traer la hoja» (P16), puerta con Google (F10), error de la IA (H7), «Detener» del asistente (F2) |
| 15 | **«Deshacer» en el mismo botón**, con mecha | parte 2 | React Bits FuseButton | «Ya se armó» (P4), «Recibí lo de la lista» (F13), volver a acomodar desde cero (A9), mecha del paro del anidador (A4) |
| 16 | **Riel de pasos** (vertical, horizontal y mini) | parte 2 | React Bits Stepper · StatusMark | hitos de entrega e historial (H3), 4 pasos del cotizador (C12), etapa en la ficha (P7), agendar (F19), calibración (H11), riel del taller (F5), estaciones (P25), pasos de Google Cloud (F32), instalar en iPhone (A18) |
| 17 | **Las esquinas que señalan** a dónde llegaste | parte 2 | React Bits TargetCursor · Crosshair | llevar a lo que falta (C7), lupa del escalador (H5), pin a mano del mapa (F9), avisos del anidador (A15), cuentas tocables (P3) |
| 18 | **La cuenta de cobro dice si lleva IVA** | parte 2 | React Bits GlideSelect | `#rv-cuenta` de Registrar venta (C4) |
| 19 | **Casillas de código y teléfono completo** | parte 2 | React Bits CodeSlots | verificar a mano (A1), `#f-tel` (C8), «BORRAR» de Ajustes (F27) |
| 20 | **Medidores quietos** (lleno, rayado, muesca) | parte 2 | React Bits SloshGauge sin oleaje | existencia de material (F3), por cobrar (P30), respaldo usado (F3), aprovechamiento por hoja (A12) |
| 21 | **El tema se abre en círculo** | parte 2 | Skiper skiper26 / skiper4 · View Transitions | Ajustes (F21), botón de tema de todas las páginas (A32) |
| 22 | **La tarjeta viaja** (View Transitions / FLIP) | parte 2 | React Bits Masonry · CardSwap · Animmaster Page Transitions (referencia) | tablero de Proyectos (P8), lista de partidas (C1), piezas del anidador (A8), cuadernos (H27), pantallas de la plataforma (P24), mes del calendario (F11) |
| 23 | **El rótulo que cambia sin brincar** | parte 2 | React Bits BellToggle · SlideCommit | botón principal del dock (C10), copiar (C11, H18), barra de acción de la plataforma (F29), ventana de instalación (F17), pista del escalador (H28), renglón «lo que sigue» (C19) |
| 24 | **El veredicto y el sello** | parte 2 | React Bits StatusMark · CircularText | verificar.html (A2, A3), estado de la solicitud a Dirección (C9), sincronización (P15), nota del cuaderno (H29) |
| 25 | **Carga con los azules del logo** | parte 2 | Skiper skiper64 Gooey (idea de React Bits MetaBalls) | verificar.html (A23), puerta (F10) |
| 26 | **El letrero mientras se escribe** (aluminio = LED posterior, acrílico = LED frontal) | parte 2 | React Bits DepthText · ShinyText | partida de letras 3D (C14) |

**Seis patrones más, sin muestra porque son CSS o APIs nativas de pocas líneas:**
- **Entra lo nuevo, sale lo quitado** (React Bits AnimatedList): C22, H24, F15, H1.
- **Pliegue que abre con su altura** (Vengeance FAQ Accordion, `interpolate-size` / `::details-content`): C16, H16, A19.
- **Búsqueda con fichas y coincidencia resaltada** (Vengeance Search Modal): P6, H8, H15.
- **Páginas con `scroll-snap`** (React Bits Carousel · Skiper skiper54): P28, F12, A12.
- **Deslizador con imanes** (React Bits ElasticSlider / WakeSlider): C17, C18, H9.
- **Silueta en vez de «Leyendo…»** (React Bits RefineFrame; `esqueletoModulo()` ya existe): F16, A13, H7.

## 2b. Piezas 27–56: las muestras de la v3

Cada una tiene su ficha en el anexo (columna «Ficha») y su comentario «Va en:» dentro del HTML. Las que dicen **función nueva** no existen hoy en el repo: son propuestas que salen de las reglas del negocio.

| # | Pieza | Página | Sale de | Ficha |
|---|---|---|---|---|
| 27 | Comparar materiales sin cambiar la partida (importe «fantasma» al pasar o mantener el dedo) | 3 | React Bits PeekRating | C13 |
| 28 | El anticipo partido a la vista («Hoy $X · Al instalar $Y», imán a cientos, excepción de $60,000) | 3 | React Bits WakeSlider | C17 |
| 29 | Ajustar el precio con imanes (0, −5, −10, −15 %, resistencia elástica) | 3 | React Bits ElasticSlider | C18 |
| 30 | Autocompletar clientes con teléfono y última cotización (combobox accesible) | 3 | React Bits GlideSelect | C6 |
| 31 | **Modo cliente**: el dinero interno tapado y el total más grande | 3 | React Bits BlurText | P12 + **función nueva** |
| 32 | **El letrero sobre la foto del local**, a escala, con su alto real y su precio | 3 | React Bits DepthText + escalador | C14 + **función nueva** |
| 33 | **La vigencia de 10 días a la vista**, con «Reenviar con fecha nueva» | 3 | Anillo tipo StatusMark | **función nueva** |
| 34 | La isla de estado junto al folio (sin señal · sellando · esperando a Dirección) | 3 | Idea de Skiper skiper2 (PRO), sin su código · BellToggle | C21 |
| 35 | El folio que cambia se nota (volteo tipo tablero de salidas) | 3 | React Bits SplitFlapText | C24 |
| 36 | La cotización guardada vuela al Historial | 3 | React Bits FolderFloat | C20 |
| 37 | La lupa que dice cuánto mide y avisa cuando se pega | 4 | React Bits Crosshair + TargetCursor | H4, H5 |
| 38 | El trazo de corte se dibuja al terminar de vectorizar, con perímetro | 4 | React Bits StrokeText | H10 |
| 39 | El plano a pantalla completa con zoom de dos dedos | 4 | React Bits DomeGallery (solo «enlarge») | H14 |
| 40 | Reordenar partidas con el dedo | 4 | React Bits CardSwap + SwipeRow | C15 |
| 41 | Los pliegues abren con su altura | 4 | Vengeance FAQ Accordion | C16, H16 |
| 42 | La zona de arrastre que abre su carpeta | 4 | React Bits FolderFloat / Folder | H20 |
| 43 | El historial con fichas de filtro y coincidencia resaltada | 4 | Vengeance Search Modal | H8, H15 |
| 44 | Lo que leyó la IA, antes de cerrar el modal | 4 | React Bits StatusMark + AnimatedList | H1 |
| 45 | Los deslizadores del vectorizador con marcas y re-trazado al soltar | 4 | React Bits ElasticSlider | H9 |
| 46 | Buscar un proyecto desde cualquier pantalla («/») | 5 | Vengeance Search Modal | P6 |
| 47 | «Más» en la barra de abajo del teléfono | 5 | Vengeance Awwwards Nav | P5 |
| 48 | Cada pantalla entra según su lugar en la barra | 5 | React Bits AnimatedContent · Animmaster Page Transitions (referencia) | P24 |
| 49 | Cambiar de mes deslizando | 5 | React Bits Carousel | F11 |
| 50 | Fechas rápidas y probar el plazo antes de fijarlo | 5 | React Bits JellyRadio + PeekRating | P14, F24 |
| 51 | El pin a mano con retícula fija al centro | 5 | React Bits TargetCursor / Crosshair | F9 |
| 52 | Las paradas del día como tarjetas sobre el mapa | 5 | React Bits Carousel | F12 |
| 53 | **Garantía y liquidación con cuenta regresiva** (2 días hábiles; 1 año eléctrico, 2 años colorimetría) | 5 | Medidor quieto · StatusMark | **función nueva** |
| 54 | **Comisiones: pagar primero las chicas** (10 % del subtotal, de menor a mayor) | 5 | Medidor quieto · SpringCheck | **función nueva** |
| 55 | El anidador: las piezas se deslizan, una hoja menos y zoom | 5 | React Bits CardSwap / Stack · Vengeance Model Viewer | A8, A11, A7 |
| 56 | Sin señal: el anuncio apagado que se enciende | 5 | Idea de React Bits ElectricLogo (sin canvas) | A17 |

### Las cinco funciones nuevas, en una línea

- **31 · Modo cliente.** Un interruptor para enseñarle la pantalla al cliente: comisión, costo y margen quedan difuminados; el total y el letrero, grandes. Mantener el dedo sobre un importe lo destapa mientras dura el toque. Es la continuación natural de P12.
- **32 · El letrero sobre la foto del local.** El escalador ya calibra la foto de la fachada; con esa escala, el texto se pinta como letrero 3D (con la luz correcta del material) encima de la foto, se arrastra y se agranda, y dice su alto real y su precio. Es la herramienta de venta más fuerte de toda la lista.
- **33 · Vigencia de 10 días.** Cada cotización del historial dice cuántos días le quedan, se pone ámbar a 3 días o menos y ofrece reenviarla con fecha nueva.
- **53 · Liquidación y garantía.** En la ficha de un proyecto instalado: cuántos días hábiles quedan para liquidar el 50 %, y hasta cuándo va la garantía eléctrica (1 año) y la de colorimetría (2 años).
- **54 · Comisiones, primero las chicas.** Con un monto disponible, la pantalla marca cuántas comisiones completas alcanza a liquidar empezando por las más chicas, para bajar el número de pendientes.

### Decisiones que salieron al construir las muestras (hay que tomarlas antes de llevarlas al repo)

| # | Pregunta | Por qué importa |
|---|---|---|
| 1 | **La excepción de $60,000, ¿se mide sobre el total con IVA o sobre el subtotal?** | La muestra 28 la mide sobre el total que se cobra. Es cambiar una constante, pero el aviso tiene que cuadrar con cómo cotiza Elías. |
| 2 | **El plazo del taller, ¿en días hábiles o de calendario?** | `js/datos/taller.js` 25–26 cuenta días de calendario a propósito; la muestra 50 cuenta hábiles. Si no se decide, la ficha y el aviso de después dirán fechas distintas. |
| 3 | **Comisiones: ¿«Pagar estas» arma la lista o marca el pago?** | En el repo solo se puede abonar la comisión de una venta liquidada, y el abono se registra en la hoja «Finanzas AL3D» (`asistente-contexto.js` 47–62 y 298). La muestra 54 las palomea; en el repo debería armar la lista para registrarla allá. |
| 4 | **La puerta de referencia, ¿200 o 210 cm?** | El botón rápido del escalador dice 200 cm; la muestra 32 usa 210 cm (la medida estándar en México). |
| 5 | **La barra de 5 del teléfono** (muestra 47) | En `RUTAS` de `js/app.js`, «hoy» se llama Tablero y el Cotizador también lleva la marca `movil`: hay que conciliarlo al implementar. |

Notas técnicas de los constructores: el comodín `*` del bloque de movimiento reducido no alcanza a `::details-content` (muestra 41), así que esa regla va aparte; el rango de Colores del vectorizador en el repo es 2–24, no 2–8 como en la muestra 45; la lupa (37), el pellizco (39, 55) y el mapa (51, 52) se probaron con eventos sintéticos y dibujos, no sobre Leaflet real ni en un teléfono.

### 2c. Piezas 57–66: el día a día del taller (página 6)

| # | Pieza | Sale de | Ficha |
|---|---|---|---|
| 57 | Cuentas tocables: la cifra baja a su tarjeta y la enciende una vez; con 0 no lleva a nada | React Bits MagicBento | P3 |
| 58 | La etapa en la ficha como pasos (Ganado → Garantía, los nombres de `ETAPAS`), el botón dice lo que sigue en pasado | React Bits Stepper | P7 |
| 59 | La solicitud a Dirección con su recorrido y «revisado hace N s» (el reloj solo corre con la pantalla visible) | React Bits StatusMark + LatticeLoader | C9 |
| 60 | El riel del taller con sus hitos; el que quedó detrás de hoy se pone rojo con muesca | React Bits Stepper (marcas) | F5 |
| 61 | El conteo del mes se palomea renglón por renglón sin repintar la lista ni mover el scroll | React Bits SpringCheck | F6 |
| 62 | La diferencia contra el libro se ve mientras se teclea, con aviso ámbar si es 3× o más | Vengeance Animated Number | F4 |
| 63 | El asistente: «Enviar» que se enciende con texto y se vuelve «Detener», con la traza que se pliega al contestar | React Bits PromptBar + ThoughtLine | F2, F14 |
| 64 | Lo atendido en «Qué atender» se palomea, se tacha y se pliega en su sitio | React Bits SpringCheck | P13 |
| 65 | WhatsApp dice a qué número va (o que no es válido) antes de tocar, y «Ver mensaje» enseña el texto exacto | Skiper skiper101 | H2 (falla 5) |
| 66 | Verificar comparando con el papel, renglón por renglón | React Bits SpringCheck | A14 |

### 2d. Piezas 67–76: cotizador y herramientas, lo que faltaba (página 7)

| # | Pieza | Sale de | Ficha |
|---|---|---|---|
| 67 | La completitud avanza y el destello pasa UNA vez cuando sube; «lo que sigue» cruza solo si cambió | React Bits ShinyText · Vengeance Flip Fade Text | C19 (falla 3) |
| 68 | Lo que llega a la cola entra con «nueva»; lo que se quita se pliega; repintar no reinicia la marca | React Bits AnimatedList | C22 |
| 69 | Los iconos sin texto dicen su nombre con pulsación larga (sin disparar la acción) y con ratón «caliente» | React Bits WarmTooltip | C25 |
| 70 | El estado vacío de partidas con mosaicos que crean la partida del tipo elegido (solo tarifas reales) | Vengeance Highlight Grid | C27 |
| 71 | La miniatura crece y «se lee» mientras la IA trabaja; el error queda sobre la imagen con «Reintentar» | React Bits RefineFrame + CallChip | H7 |
| 72 | Al apagar «Conservar», las partidas que se reemplazan se tachan de izquierda a derecha | React Bits SpringCheck | H13 |
| 73 | El plazo sugerido lleva su etiqueta y un «?» que explica por qué | Skiper skiper101 | H19 |
| 74 | Los colores del vector como fichas de 44 px con ✓/✕ y nombre tachado | React Bits SpringCheck | H22 |
| 75 | La vista previa del PDF dice «Hoja 3 de 5» con su línea de avance; tocar una hoja la pone al ancho | Skiper skiper89 | H23 |
| 76 | **Propuesta con opciones**: aluminio, acrílico y caja de luz lado a lado con su cuenta; el cliente elige | Vengeance Highlight Grid | **función nueva** |

### 2e. Piezas 77–86: plataforma y anidador, lo que faltaba (página 8)

| # | Pieza | Sale de | Ficha |
|---|---|---|---|
| 77 | Arrastrar tarjetas entre columnas (250 ms para levantar, toque corto abre la ficha, Alt + → / ←) | Vengeance Highlight Grid · React Bits SwipeRow | P9 |
| 78 | La marca del módulo activo se desliza en la barra lateral; el globo salta solo cuando la cuenta sube | React Bits PillNav + PulseHeart | P19, P20 |
| 79 | «Sí, ya se cortó» se desliza hasta el final y se abre en «Salieron 4 materiales» (o regresa con una sacudida) | React Bits SlideCommit | P21 |
| 80 | Las barras de 12 meses crecen una sola vez al verse; tocar un mes abre sus ventas | Vengeance Stats Counter + pieza 4 | P27 |
| 81 | La banda de «versión nueva» entra sin mover lo que se está leyendo, y después avisa que se actualizó | React Bits FadeContent + SwipeToast | P26, A22 |
| 82 | «Guardar» fantasma que se enciende con «Guardar 2 cambios» y marca cada campo con su valor anterior | React Bits PromptBar | F20 |
| 83 | El índice que sigue al scroll con su ficha deslizante y barra de progreso de lectura | React Bits PillNav · Skiper skiper89 | F22, A19, A26 |
| 84 | Las cotas de ancho y alto sobre el dibujo del anidador, que cambian al teclear (y «¿? mm» sin escala) | React Bits Crosshair | A6 |
| 85 | La veta: al elegir aluminio cepillado o MDF pregunta por los giros de 90°; las piezas giradas van rayadas; la hoja gira | React Bits WarmTooltip + FlipCard | A5 (falla 6), A21 |
| 86 | «Como vienen / Acomodadas» con el barrido del láser (clip-path al paso del haz) | Skiper skiper66 | A25 |

Nota técnica de la página 8: en un índice dentro de un contenedor con scroll, **no usar `scrollIntoView` para acomodar la ficha activa**: también mueve el contenedor y corta el desplazamiento suave (se corrigió en la muestra 83 moviendo solo el `scrollLeft` del índice).

---

## 3. Por pantalla: los 153 lugares

Columnas: **ID** (ficha completa en el anexo) · **Idea** · **Dónde** (la primera referencia; el anexo trae todas) · **Sale de** · **Valor · Esfuerzo**.

### 3.1 Cotizador · cliente y folio

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| C6 | Autocompletar clientes que se ve y se entiende | `cotizador.html` 311 | React Bits · GlideSelect | Alto · Medio |
| C8 | El teléfono se ve completo antes de chocar con él | `cotizador.html` 312 | React Bits · CodeSlots | Medio · Bajo |
| C21 | Una isla de estado junto al folio | `cotizador.html` 199–202 | React Bits · BellToggle | Medio · Medio |
| C24 | El folio que cambia se nota | `cotizador.html` 199 | React Bits · SplitFlapText | Bajo · Bajo |
| H21 | Vistazo al cuaderno sin salir del formulario del cliente | `js/cotizador/historial.js` 829–843 | Vengeance · Cursor Card | Medio · Bajo |

### 3.2 Cotizador · partidas

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| C1 | Que solo se mueva lo que se tocó | `js/cotizador/partidas.js` 520–675 | React Bits · AnimatedList + CardSwap | Alto · Medio |
| C13 | Comparar materiales delante del cliente sin cambiar la partida | `js/cotizador/partidas.js` 1045 | React Bits · PeekRating | Medio · Medio |
| C14 | Ver el letrero mientras se escribe el texto | `js/cotizador/partidas.js` 1082 | React Bits · DepthText | Medio · Medio |
| C15 | Reordenar partidas con el dedo | `js/cotizador/partidas.js` 593 | React Bits · CardSwap | Medio · Alto |
| C16 | Los pliegues abren y cierran con su altura | `cotizador.html` 339–363 | Vengeance · FAQ Accordion | Medio · Bajo |
| C27 | El estado vacío de partidas empieza el trabajo | `js/cotizador/partidas.js` 539–543 | Vengeance · Highlight Grid | Bajo · Bajo |
| C7 | Señalar dónde está lo que falta, y dejar de latir en bucle | `js/cotizador/partidas.js` 867–874 | React Bits · TargetCursor | Alto · Medio |

### 3.3 Cotizador · precio, autorización y notario

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| C5 | El botón que está trabajando lo dice, con reloj | `js/cotizador/proceso.js` 463 | React Bits · CallChip | Alto · Medio |
| C9 | La solicitud a Dirección, con su recorrido a la vista | `js/cotizador/proceso.js` 172–178 | React Bits · StatusMark + LatticeLoader | Medio · Medio |
| C10 | El botón principal cambia de rótulo sin brincar, y dice qué falta | `js/cotizador/proceso.js` 1922–1997 | React Bits · BellToggle | Medio · Bajo |
| C12 | El riel de cuatro pasos enseña cuánto va y el estado de cada paso | `cotizador.html` 249–282 | React Bits · Stepper + StatusMark | Medio · Bajo |
| C17 | El anticipo en un toque, y partido a la vista | `cotizador.html` 468–474 | React Bits · WakeSlider | Medio · Medio |
| C18 | El autorizador ajusta el precio arrastrando, con topes que se sienten | `js/cotizador/proceso.js` 444–450 | React Bits · ElasticSlider | Medio · Medio |
| C19 | La barra de completitud avanza, pero no brilla para siempre | `cotizador.html` 418–422 | Vengeance · Flip Fade Text para el renglón | Medio · Bajo |
| C22 | Lo que llega a la cola entra, lo que se quita se va | `js/cotizador/proceso.js` 202–218 | React Bits · AnimatedList | Medio · Bajo |
| H19 | Plazo de taller: marcar el sugerido y decir por qué | `js/cotizador/historial.js` 1557–1572 | Skiper · skiper101 Custom tooltip | Medio · Bajo |

### 3.4 Cotizador · entrega (PDF, WhatsApp) y registrar venta

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| C4 | La cuenta de cobro dice si lleva IVA | `cotizador.html` 1018–1021 | React Bits · GlideSelect | Alto · Bajo |
| C11 | Copiar y ocultar del PDF confirman en el mismo botón | `cotizador.html` 450 | Skiper · skiper99 Animated icons 002 | Medio · Bajo |
| C20 | La cotización que se guarda vuela a donde quedó | `js/cotizador/proceso.js` 1792–1840 | React Bits · FolderFloat | Medio · Medio |
| H2 | WhatsApp: decir a qué número va y dejar ver el mensaje antes de salir | `js/cotizador/entrega.js` 112–138 | Skiper · skiper101 Custom tooltip | Alto · Bajo |
| H3 | Los tres hitos como riel conectado, y el mismo riel en el historial | `js/cotizador/proceso.js` 356–382 | React Bits · Stepper | Alto · Bajo |
| H18 | Copiar para Canva, Gemini o SVG confirma en el mismo botón | `js/cotizador/entrega.js` 410 | React Bits · BellToggle | Medio · Bajo |
| H23 | Vista previa del PDF: «Hoja 2 de 5» y tocar una hoja para verla al ancho | `js/cotizador/entrega.js` 1171–1221 | Skiper · skiper89 Scroll progress 001 | Medio · Bajo |

### 3.5 Cotizador · Cotizar con IA

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| H1 | Resumen de lo que leyó la IA antes de cerrar el modal | `js/cotizador/ia.js` 812–848 | React Bits · StatusMark + AnimatedList | Alto · Medio |
| H7 | La miniatura «se lee» mientras la IA trabaja, y el error trae «Reintentar» | `js/cotizador/ia.js` 237–241 | React Bits · RefineFrame | Alto · Medio |
| H13 | Enseñar qué partidas se van a reemplazar al apagar «Conservar» | `js/cotizador/ia.js` 185–200 | React Bits · SpringCheck | Medio · Bajo |
| H20 | Zona de arrastre que se abre al acercar el archivo (y deja de respirar sola) | `css/vidrio.css` 441–444 | React Bits · FolderFloat | Medio · Bajo |

### 3.6 Cotizador · escalador

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| H4 | Lectura en centímetros pegada a la lupa | `js/cotizador/escalador.js` 519–555 | React Bits · Crosshair | Alto · Bajo |
| H5 | La lupa avisa cuando el punto se pega a una guía o a un extremo | `js/cotizador/escalador.js` 533–555 | React Bits · TargetCursor | Alto · Bajo |
| H11 | Calibración como tres pasos visibles | `cotizador.html` 857–879 | React Bits · Stepper | Medio · Bajo |
| H12 | Abrir un PDF dentro del lienzo, con cronómetro y error en su sitio | `js/cotizador/escalador.js` 101–114 | React Bits · LatticeLoader | Medio · Bajo |
| H24 | La medida nueva se ve llegar a la lista | `js/cotizador/escalador.js` 1331–1347 | React Bits · AnimatedList | Medio · Bajo |
| H28 | La pista del escalador cambia con un fundido | `js/cotizador/escalador.js` 1441–1456 | Vengeance · Morph Text | Bajo · Bajo |
| H30 | Medidas rápidas de referencia como opciones elegidas, sin emojis | `cotizador.html` 864–871 | React Bits · JellyRadio | Bajo · Bajo |

### 3.7 Cotizador · vectorizador

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| H9 | Deslizadores del vectorizador con marcas y re-trazado al soltar | `cotizador.html` 715–724 | React Bits · ElasticSlider | Alto · Medio |
| H10 | El trazo se dibuja solo al terminar de vectorizar | `js/cotizador/vectorizador.js` 911–920 | React Bits · StrokeText | Alto · Medio |
| H22 | Muestras de color del vector como fichas de 44 px que dicen su estado | `js/cotizador/vectorizador.js` 1012–1034 | React Bits · SpringCheck | Medio · Bajo |

### 3.8 Cotizador · historial, cuadernos y respaldos

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| H8 | Filtros rápidos del historial por lo que falta entregar | `js/cotizador/historial.js` 226–238 | Vengeance · Search Modal | Alto · Bajo |
| H14 | Ver el plano a pantalla completa con zoom de dos dedos | `js/cotizador/historial.js` 163–168 | React Bits · DomeGallery | Medio · Medio |
| H15 | Resaltar lo que coincide en el historial y en los cuadernos | `js/cotizador/historial.js` 249–306 | Vengeance · Search Modal | Medio · Bajo |
| H16 | Entradas del historial compactas que se despliegan | `js/cotizador/historial.js` 263–302 | Vengeance · FAQ Accordion | Medio · Bajo |
| H17 | Estados vacíos con salida | `js/cotizador/historial.js` 258–261 | Vengeance · Folder Preview | Medio · Bajo |
| H25 | Restaurar un respaldo con los pasos a la vista | `js/cotizador/historial.js` 1010–1050 | React Bits · StatusMark | Medio · Bajo |
| H27 | Cuadernos: pasar de la lista al detalle deslizando | `js/cotizador/historial.js` 632–679 | React Bits · AnimatedContent | Bajo · Bajo |
| H29 | Estado de guardado de la nota del cuaderno con un glifo | `js/cotizador/historial.js` 721–725 | React Bits · StatusMark | Bajo · Bajo |

### 3.9 Cotizador · avisos, hojas e iconos

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| C2 | El Deshacer con su mecha a la vista | `js/cotizador/nucleo.js` 669–694 | React Bits · SwipeToast + FuseButton | Alto · Bajo |
| C3 | Un aviso no borra al otro | `js/cotizador/nucleo.js` 669–694 | React Bits · SwipeToast + Stack | Alto · Medio |
| C25 | Los botones de solo icono dicen su nombre con el dedo | `cotizador.html` 166–171 y 198 | React Bits · WarmTooltip | Bajo · Bajo |
| C26 | La hoja del teléfono: el velo sigue al dedo | `js/cotizador/nucleo.js` 591–629 | React Bits · SwipeToast | Bajo · Bajo |
| H6 | Deshacer con mecha visible que se pausa al salir de la app | `js/cotizador/nucleo.js` 670–687 | React Bits · SwipeToast | Alto · Bajo |

### 3.10 Cotizador · las piezas de la v1 en más lugares

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| C23 | Otros lugares para lo ya propuesto (#1, #2, #4, #5, #6, #7) | `js/cotizador/proceso.js` 1993–1996 | Piezas 1, 2, 4, 5, 6 y 7 | Medio · Bajo |
| H26 | Llevar a esta zona las ideas ya propuestas | `cotizador.html` 703–707 | Piezas 1, 2, 3, 5, 6, 9 y 10 | Medio · Bajo |

### 3.11 Plataforma · esqueleto, navegación y arranque

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| P5 | En el teléfono: «Más» en la barra de abajo, y Control para pagos | `js/app.js` 61–95 | Vengeance · Awwwards Nav | Alto · Medio |
| P6 | Buscar un proyecto desde cualquier pantalla | `js/mod/proyectos.js` 131–138 y 149–156 | Vengeance · Search Modal | Alto · Medio |
| P19 | La marca de módulo activo se desliza en la barra lateral y en la de abajo | `js/app.js` 595–628 | React Bits · PillNav | Medio · Bajo |
| P20 | El globo de la barra avisa cuando sube | `js/app.js` 632–648 | React Bits · PulseHeart | Medio · Bajo |
| P22 | El arranque en pasos | `index.html` 273–286 | React Bits · ThoughtLine | Medio · Bajo |
| P24 | Entrar a cada pantalla según su lugar en la barra | `css/plataforma.css` 291 | React Bits · AnimatedContent | Medio · Bajo |
| P26 | La banda de aviso entra sin empujar la pantalla | `js/app.js` 729–738 | React Bits · FadeContent | Medio · Bajo |
| P15 | Indicador de sincronización en el encabezado | `js/app.js` 1106–1112 | React Bits · StatusMark | Medio · Bajo |
| P31 | Tooltip de la barra lateral con el atajo de teclado | `js/app.js` 604–612 | React Bits · WarmTooltip | Bajo · Bajo |
| F16 | La silueta de la pantalla en vez de «Leyendo…» | `js/mod/fabricacion.js` 159–163 | React Bits · RefineFrame (`esqueletoModulo()` ya existe) | Medio · Bajo |
| F28 | El menú de tu cuenta sale de su botón (ya propuesta n.º 4, otro lugar) | `js/nucleo/cuenta.js` 31–67 | React Bits · GlideSelect | Bajo · Bajo |
| A22 | Avisar que la app se actualizó | `js/app.js` 1193 | React Bits · SwipeToast | Medio · Bajo |

### 3.12 Plataforma · Hoy y «Qué atender»

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| P13 | «Qué atender»: el aviso atendido se tacha y se pliega | `js/mod/inicio.js` 279–289 | React Bits · SpringCheck | Medio · Bajo |
| P14 | Fechas rápidas al ganar y al agendar | `js/mod/inicio.js` 670–694 | React Bits · JellyRadio | Medio · Bajo |

### 3.13 Plataforma · Tablero

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| P3 | Cuentas tocables que llevan a lo que cuentan | `js/mod/tablero.js` 509–546 | React Bits · MagicBento | Alto · Bajo |
| P4 | «Ya se armó» con deshacer y mecha, sin que el renglón salte de grupo | `js/mod/tablero.js` 736–745 | React Bits · FuseButton | Alto · Medio |
| P11 | El latido de «sin decidir» tiene que apagarse | `js/mod/tablero.js` 567–590 | React Bits · BellToggle | Medio · Bajo |
| P18 | Las cuentas ruedan cuando la sincronización cambia algo | `js/app.js` 1149–1153 | React Bits · Counter | Medio · Medio |
| P21 | «Sí, ya se cortó» como deslizador que enseña el resultado | `js/mod/tablero.js` 1134–1151 | React Bits · SlideCommit | Medio · Bajo |
| P25 | La línea de estaciones dibujada como tubería | `js/mod/tablero.js` 592–625 | React Bits · Stepper | Medio · Bajo |
| P29 | Deslizar un renglón del Tablero para avanzarlo | `js/mod/tablero.js` 701–718 | React Bits · SwipeRow | Bajo · Medio |

### 3.14 Plataforma · Proyectos (tablero y ficha)

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| P1 | Cambiar los cinco `window.confirm()` por la capa de la app, y «Quitar» con mantener presionado | `js/mod/proyectos.js` 1081–1165 | React Bits · HoldButton | Alto · Bajo |
| P2 | La ficha guarda en su sitio: sin repintarse entera y con palomita en el chip | `js/mod/proyectos.js` 1201–1205 | React Bits · BellToggle | Alto · Bajo |
| P7 | La etapa en la ficha como pasos, no como siete casillas | `js/mod/proyectos.js` 873–886 | React Bits · Stepper | Alto · Medio |
| P8 | La tarjeta viaja a su nueva columna | `js/mod/proyectos.js` 517–551 | React Bits · Masonry | Alto · Medio |
| P9 | Arrastrar tarjetas entre columnas del tablero de Proyectos | `js/mod/proyectos.js` 496–515 | Skiper · skiper5 Things drag and scroll + Vengeance ·… | Alto · Alto |
| P10 | La ficha del teléfono sube y se cierra deslizando hacia abajo | `css/plataforma.css` 755–772 | React Bits · SwipeToast | Medio · Medio |
| P12 | El dinero interno, tapado delante del cliente | `js/mod/proyectos.js` 808–815 | React Bits · BlurText | Medio · Bajo |
| P23 | Bordes que se desvanecen en la tira de etapas y en el tablero del Fold | `css/plataforma.css` 1398–1411 | Skiper · skiper87 Scroll with fade effect | Medio · Bajo |
| P28 | En el teléfono, las columnas de Proyectos como páginas | `js/mod/proyectos.js` 465–467 | React Bits · Carousel | Medio · Medio |

### 3.15 Plataforma · Control (ventas y cobranza)

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| P16 | «Traer la hoja» que enseña su avance | `js/mod/control.js` 222–245 | React Bits · CallChip | Medio · Bajo |
| P27 | Barras de doce meses que crecen una vez y un mes que se puede abrir | `js/mod/control.js` 334–359 | Vengeance · Stats Counter | Medio · Medio |
| P30 | Una barra de cuánto va cobrado en «Por cobrar» | `js/mod/control.js` 495–519 | React Bits · SloshGauge | Bajo · Bajo |

### 3.16 Plataforma · Fabricación y calendario

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| F5 | El riel del taller con sus hitos marcados | `js/nucleo/ui.js` 650–655 | React Bits · Stepper | Alto · Bajo |
| F11 | Cambiar de mes deslizando con el dedo | `js/mod/fabricacion.js` 603–637 | React Bits · Carousel | Alto · Medio |
| F17 | La ventana de instalación dice qué implica al elegirla | `js/mod/fabricacion.js` 1327–1329 | Vengeance · Morph Text | Medio · Bajo |
| F18 | Al tocar un día, su lista aparece a la vista | `js/mod/fabricacion.js` 1060–1071 | React Bits · AnimatedContent | Medio · Bajo |
| F19 | La hoja de agendar muestra en qué paso va y avanza hacia adelante | `js/mod/fabricacion.js` 1272–1308 | React Bits · Stepper | Medio · Bajo |
| F24 | Probar el plazo antes de fijarlo | `js/mod/fabricacion.js` 1596–1616 | React Bits · PeekRating | Medio · Medio |
| F26 | Qué hay en un día sin abrirlo, en la computadora | `js/mod/fabricacion.js` 681–696 | React Bits · WarmTooltip | Medio · Medio |
| F29 | La barra de acción del teléfono sube y cambia de rótulo sin parpadear | `js/mod/fabricacion.js` 974–1002 | React Bits · BellToggle | Bajo · Bajo |

### 3.17 Plataforma · Material

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| F3 | Medidor de existencia en cada renglón de material | `js/mod/material.js` 503–515 | React Bits · SloshGauge | Alto · Bajo |
| F4 | La diferencia se ve mientras se corrige un conteo o una línea | `js/mod/material.js` 1171–1195 | Vengeance · Animated Number | Alto · Bajo |
| F6 | El conteo del mes se palomea renglón por renglón sin perder el sitio | `js/mod/material.js` 607–657 | React Bits · SpringCheck | Alto · Medio |
| F13 | «Recibí lo de la lista» y «Actualizar» con su «Deshacer» en el mismo botón | `js/mod/material.js` 425–433 | React Bits · FuseButton | Alto · Alto |
| F20 | «Guardar lo que cambiaste» se enciende cuando hay cambios | `js/mod/material.js` 1082–1086 | React Bits · PromptBar | Medio · Bajo |
| F30 | Bordes que se desvanecen en la fórmula y en la tira del asistente (ya propuesta n.º 10, otro lugar) | `css/plataforma.css` 592–595 | Pieza 10 (Skiper skiper87) | Bajo · Bajo |

### 3.18 Plataforma · Mapa

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| F9 | Pin a mano con retícula fija al centro | `js/mod/mapa.js` 836–847 | React Bits · TargetCursor | Alto · Medio |
| F12 | Las paradas del día como tarjetas sobre el mapa | `js/mod/mapa.js` 705–756 | React Bits · Carousel | Alto · Alto |
| F25 | La ruta se dibuja y se numera al ordenarla | `js/mod/mapa.js` 685–703 | React Bits · StrokeText | Medio · Medio |
| F33 | Los pines entran y salen al filtrar | `js/mod/mapa.js` 1044–1053 | React Bits · FadeContent | Bajo · Medio |

### 3.19 Plataforma · Ajustes

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| F7 | Botones que dicen qué están haciendo, cuánto llevan y cómo terminó | `js/mod/ajustes.js` 1141–1149 | React Bits · CallChip | Alto · Medio |
| F21 | Cambio de tema con revelado circular | `js/mod/ajustes.js` 371–381 | Skiper UI · skiper26 Theme toggle btn | Medio · Bajo |
| F22 | Índice fijo de Ajustes que sigue al scroll | `js/mod/ajustes.js` 291–326 | React Bits · PillNav | Medio · Bajo |
| F27 | «BORRAR» en casillas que se validan al teclear | `js/mod/ajustes.js` 1389–1405 | React Bits · CodeSlots | Bajo · Bajo |
| F32 | Los pasos de Google Cloud y del puente se palomean y se recuerdan | `js/mod/ajustes.js` 478 | React Bits · Stepper | Bajo · Bajo |

### 3.20 Plataforma · asistente de IA

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| F2 | «Enviar» que se enciende al escribir y se vuelve «Detener» | `js/nucleo/asistente.js` 138–141 | React Bits · PromptBar | Alto · Bajo |
| F14 | La espera del asistente como traza con reloj (ya propuesta n.º 8, otro lugar) | `js/nucleo/asistente.js` 453–474 | React Bits · ThoughtLine | Medio · Bajo |
| F15 | Una respuesta larga se lee desde su principio | `js/nucleo/asistente.js` 255–258 | React Bits · AnimatedList | Medio · Bajo |

### 3.21 Plataforma · puerta de entrada

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| F10 | La puerta de entrada dice en qué paso va | `js/nucleo/puerta.js` 495–535 | React Bits · LatticeLoader | Alto · Medio |

### 3.22 Plataforma · avisos, hojas y cuentas comunes (ui.js)

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| F1 | Aviso con mecha: la ventana de «Deshacer» se ve y se pausa | `js/nucleo/ui.js` 131–153 | React Bits · SwipeToast | Alto · Bajo |
| F8 | La hoja de abajo se cierra deslizándola | `css/plataforma.css` 768–772 | React Bits · SwipeToast | Alto · Medio |
| P17 | Avisos con mecha visible que se despiden deslizando | `js/nucleo/ui.js` 131–153 | React Bits · SwipeToast | Medio · Bajo |
| F23 | Las cuentas de arriba ruedan cuando cambian (ya propuesta n.º 1, otro lugar) | `js/mod/fabricacion.js` 564–587 | Pieza 1 (React Bits Counter) | Medio · Bajo |
| F31 | Palomita al copiar (ya propuesta n.º 6, otro lugar) | `js/mod/fabricacion.js` 1556 y 1793–1796 | Pieza 6 (StatusMark) | Bajo · Bajo |

### 3.23 Anidador (mesa de corte)

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| A4 | La mecha del paro automático | `anidador-vectores/js/app.js` 40–41 | React Bits · FuseButton, solo la mecha | Alto · Bajo |
| A5 | La veta: no girar 90° el aluminio cepillado ni el MDF | `anidador-vectores/index.html` 229–237 | React Bits · WarmTooltip | Alto · Bajo |
| A6 | Cotas sobre el dibujo al pedir la medida real | `anidador-vectores/index.html` 158–168 | React Bits · Crosshair | Alto · Bajo |
| A7 | Zoom y paneo sobre la hoja | `anidador-vectores/css/anidador.css` 221–235 | Vengeance · Model Viewer, solo su manejo de arrastre,… | Alto · Medio |
| A8 | Las piezas se deslizan a su nuevo lugar en vez de volver a caer | `anidador-vectores/js/app.js` 695–719 | React Bits · CardSwap, la transición de posiciones | Alto · Medio |
| A9 | Deshacer con mecha: al volver a acomodar desde cero y al quitar un retazo | `anidador-vectores/js/app.js` 558–572 y 599 | React Bits · FuseButton, el deshacer que se quema | Medio · Bajo |
| A10 | Tocar una pieza: su medida y si va girada | `anidador-vectores/js/app.js` 706–712 | Skiper · skiper101 Custom tooltip, GRATIS | Medio · Bajo |
| A11 | La noticia grande: una hoja menos, en m² | `anidador-vectores/index.html` 278–279 | React Bits · Stack, la tarjeta que sale del montón | Medio · Bajo |
| A12 | Varias hojas en carrusel, cada una con su aprovechamiento | `anidador-vectores/css/anidador.css` 221, 230 y 235 | React Bits · Carousel, con gestos táctiles | Medio · Bajo |
| A13 | El primer acomodo no deja la mesa vacía | `anidador-vectores/js/app.js` 610–611 | React Bits · RefineFrame | Medio · Bajo |
| A15 | Esquinas que señalan lo que se va a quedar fuera | `anidador-vectores/js/app.js` 377–383 | React Bits · TargetCursor | Medio · Medio |
| A16 | Descargar por hoja desde un menú, y mandar el archivo | `anidador-vectores/index.html` 252–253 | React Bits · GlideSelect | Medio · Bajo |
| A21 | La orientación de la hoja, a la vista | `anidador-vectores/index.html` 189–213 | React Bits · FlipCard, aplicado a 90° y no a 180° | Medio · Bajo |
| A24 | Mover y girar una pieza a mano, con choque | `anidador-vectores/js/app.js` 695–719 | React Bits · TechText, tomar una letra y que regrese a su… | Medio · Alto |
| A25 | «Como vienen / Acomodadas» con el barrido del láser | `anidador-vectores/index.html` 260 | Skiper · skiper66 SVG clip path mask, GRATIS | Bajo · Bajo |
| A29 | Brillo de aluminio cepillado que cruza el logo al terminar la carga | `anidador-vectores/index.html` 96–97 | React Bits · ShinyText | Bajo · Bajo |
| A30 | El arranque del anidador con su propio ícono | `anidador-vectores/index.html` 91 | React Bits · LatticeLoader | Bajo · Bajo |
| A31 | Probar con un ejemplo | `anidador-vectores/index.html` 288 | React Bits · StrokeText | Bajo · Bajo |
| A32 | Cambiar de tema con un revelado circular | `anidador-vectores/index.html` 101 | Skiper · skiper26 Theme toggle btn, GRATIS | Bajo · Bajo |

### 3.24 Páginas públicas y PWA (verificar, acerca, legales, sin señal, instalar)

| ID | Idea | Dónde | Sale de | Valor · Esfuerzo |
|---|---|---|---|---|
| A1 | Verificar a mano: el código en casillas y un folio que sí viene en el papel | `verificar.html` 59–67 y 127–133 | React Bits · CodeSlots | Alto · Medio |
| A2 | La espera se convierte en el veredicto | `verificar.html` 45 | React Bits · StatusMark | Alto · Bajo |
| A3 | Un sello AL3D para «Auténtica» | `verificar.html` 40–43 | React Bits · CircularText, más el sellado final de… | Alto · Bajo |
| A14 | Comparar con el papel, renglón por renglón | `verificar.html` 46–47 | React Bits · SpringCheck | Medio · Bajo |
| A17 | Sin señal: el anuncio apagado que se enciende al volver | `sw.js` 363–364 | React Bits · ElectricLogo | Medio · Bajo |
| A18 | Instalar en iPhone con dos pasos dibujados | `js/app.js` 1271–1279 | React Bits · Stepper | Medio · Bajo |
| A19 | Índice en las páginas legales | `condiciones.html` 42–98 | React Bits · LineSidebar, la lista sin el efecto de… | Medio · Bajo |
| A20 | Créditos y licencias en un solo lugar | `acerca.html` 74–83 | Requisito de licencia; Vengeance Line Hover Link | Medio · Bajo |
| A23 | Las manchas del logo como carga | `verificar.html` 50 | Skiper · skiper64 Gooey Effect, GRATIS | Medio · Medio |
| A26 | El filete de marca como progreso de lectura | `css/sistema.css` 487–494 | Skiper · skiper89 Scroll progress 001, GRATIS | Bajo · Bajo |
| A27 | El título de «acerca» se enciende como neón | `acerca.html` 38 | React Bits · StrokeText | Bajo · Bajo |
| A28 | «Qué hace» en cuatro tarjetas | `acerca.html` 47–57 | Vengeance · Why Us Bento Grid, sin isométricos ni avatares | Bajo · Medio |


---

## 4. Qué se usó de cada página

| Página | Qué es | Qué se tomó |
|---|---|---|
| **React Bits** (reactbits.dev) | 209 componentes, código abierto (MIT + Commons Clause) | **54 componentes distintos**, sobre todo de *Micro* (los más útiles para una app de trabajo): AnimatedContent, AnimatedList, BellToggle, BlurText, CallChip, CardSwap, Carousel, CircularText, CodeSlots, Counter, CountUp, Crosshair, DepthText, DomeGallery, ElasticSlider, ElectricBorder, FadeContent, FlipCard, Folder, FolderFloat, FuseButton, GlideSelect, GradualBlur, HoldButton, JellyRadio, LatticeLoader, LineSidebar, MagicBento, Masonry, PeekRating, PillNav, PromptBar, PulseHeart, RefineFrame, RubberSegment, ScrubField, ShinyText, SlideCommit, SloshGauge, SplitFlapText, SpringCheck, Stack, StaggeredMenu, StarBorder, StatusMark, Stepper, StrokeText, SwipeRow, SwipeToast, TargetCursor, TechText, ThoughtLine, WakeSlider, WarmTooltip |
| **Vengeance UI** (vengenceui.com) | 74 componentes, MIT | **23**: Border Beam, Kinetic Text Loader, Generate Button, Animated Number, Stats Counter, Animated Tooltip, Awwwards Nav, Cursor Card, Elastic Stack, Expandable Bento Grid, FAQ Accordion, Flip Fade Text, Flip Text, Folder Preview, Gooey Search, Highlight Grid, Line Hover Link, Masked Avatars, Model Viewer (solo su manejo de zoom), Morph Text, Search Modal, Spotlight Navbar, Why Us Bento Grid |
| **Skiper UI** (skiper-ui.com) | 107 componentes; 24 gratis con atribución, el resto de pago | **18**: skiper4, skiper26, skiper37, skiper41, skiper48, skiper54, skiper64, skiper66, skiper87, skiper89, skiper99, skiper101, skiper106 (gratis) + skiper2, skiper5, skiper73, skiper92, skiper103 (de pago, solo la idea). Los de pago (skiper2, skiper5, skiper73, skiper92, skiper103) solo como referencia de la idea, sin código. |
| **Animmaster Lib** (animmasterlib.dev) | 300 componentes de pago (US$4.99–8); el sitio solo muestra videos por categoría, sin nombres ni código | Solo como referencia de categoría: *Page Transitions* (P24, C1). Su código no se puede ver sin comprarlo, está hecho con GSAP y Three.js, y son recreaciones de sitios de terceros. **No vale la compra para este repo.** |

---

## 5. Orden sugerido: 7 PRs

- **PR 0 — Arreglos (sección 1), antes que nada.** Folio de verificación (1), pila de avisos para no perder el error del sello (2), apagar los cuatro latidos en bucle (3), logo y hoja de estilo de `verificar.html` (4), aviso de WhatsApp antes de abrir (5). La veta (6) necesita la decisión del taller.
- **PR 1 — Piezas base, sin cambiar pantallas todavía:** 12 aviso · 13 hoja · 14 botón con estado · 15 deshacer en botón · 17 esquinas · 23 rótulo · 6/24 glifos · 16 riel · 2 ficha que viaja · 10 bordes · 11 desenfoque. Todas en `ui.js` / `nucleo.js`, con sus pruebas.
- **PR 2 — El dinero y la confianza delante del cliente:** 1 total que rueda · 4 desglose · 3 arrastrar medida · 18 cuenta con IVA (C4) · 26 letrero en vivo (C14) · comparar materiales (C13) · anticipo partido (C17) · WhatsApp con número y vistazo (H2) · riel de entrega (H3) · autocompletar clientes (C6).
- **PR 3 — La IA y las herramientas:** 8 pasos · resumen de lo que leyó (H1) · miniatura que se lee (H7) · lupa con lectura y pegado (H4, H5) · vectorizador (H9, H10, H22) · plano con zoom (H14) · historial (H8, H15, H16, H17).
- **PR 4 — La plataforma:** confirmaciones (P1) · cuentas tocables (P3) · deshacer con mecha (P4) · «Más» en el teléfono (P5) · búsqueda global (P6) · etapa como pasos (P7) · tarjeta que viaja (P8) · hoja deslizable (P10, F8) · medidores (F3, P30) · riel del taller (F5) · pin a mano (F9) · puerta en pasos (F10) · mes deslizable (F11).
- **PR 5 — Anidador y páginas públicas:** verificar (A1, A2, A3, A14, A23) · mecha del paro (A4) · cotas (A6) · zoom (A7) · piezas que se deslizan (A8) · créditos (A20) · sin señal (A17) · índice legal (A19).
- **PR 6 — Funciones nuevas (después de decidir la sección 2b):** modo cliente (31) · letrero sobre la fachada (32) · vigencia (33) · liquidación y garantía (53) · comisiones (54) · propuesta con opciones (76).

---

## 6. Descartado, y por qué (lo que más se repitió en las cinco zonas)

- **Fondos WebGL / Three.js / shaders** (React Bits *Aurora, LiquidEther, Galaxy, MetaBalls, LiquidChrome, MetallicPaint*; Vengeance *Liquid Metal, Scroll Dissolve, Ripple Displacement*; Skiper *skiper12/14/36*; Animmaster *WebGL / 3D*): pesan en gama media y la aurora del lienzo ya existe. Donde la idea valía, se reemplazó por CSS o SVG (gooey, brillo por máscara, neón con `box-shadow`).
- **Dock con aumento por cercanía** (React Bits *Dock*, Vengeance *Glass Dock*): con el dedo no hay cercanía; la barra ya es un dock de vidrio.
- **Texto revuelto o tecleado** (*DecryptedText, Shuffle, TextType, ASCII Glitch*) en folios, totales o respuestas: el dinero y el folio se leen, no se descifran. Un total que rueda mientras alguien lo compara con su papel (verificar.html) invita a leerlo mal.
- **Cursores y rastros** (*SplashCursor, BlobCursor, ImageTrail…*): la app se usa con el dedo.
- **Espectáculo en borrados** (*Shredder, PaperCrumple*): alarga un borrado que ya tiene Deshacer, y en cancelaciones dice lo contrario de lo que el repo decidió («esconderla es no haberla guardado»).
- **Rebotes en chips** (*JellyRadio* con física, *SquishSwitch*): `sistema.css` 292–300 documenta que un rebote sobre una pieza plana se lee como fallo de pintado. Un interruptor que se arrastra y mueve el 16 % del precio invita al error.
- **Carruseles o marquesinas que se mueven solos** (*LogoLoop, Logo Slider*): rompen la regla 3.
- **TearTicket para el recibo:** el recibo es una hoja impresa; en pantalla no hay nada que arrancar.
- **Glass Surface / Fluid Glass sobre los lienzos del escalador y del vectorizador:** `sistema.css` 3778 quitó el `backdrop-filter` ahí a propósito.

Cada zona trae su propia lista de descartes al final de su parte del anexo.

---

## 7. Licencias y atribución

| Fuente | Licencia | Qué implica |
|---|---|---|
| **React Bits** (David Haz) | MIT + *Commons Clause* | Se puede usar dentro de la app, incluso con fines comerciales. **No** se pueden vender ni redistribuir los componentes, ni portados, como librería. |
| **Vengeance UI** (Ashutoshx7) | MIT | Libre, con el aviso de copyright. |
| **Skiper UI** gratis | Propia | Uso comercial permitido; **pide atribución**. Aplica a los que entran aquí: skiper26/4 (tema), skiper37 (número), skiper41 (desenfoque), skiper54 (carrusel), skiper64 (gooey), skiper66 (máscara), skiper87 (bordes), skiper89 (progreso), skiper99 (iconos), skiper101 (tooltip), skiper106 (cursor). |
| **Skiper UI** Pro · **Animmaster Lib** | De pago | No se usó código; solo nombres como referencia. |

Las muestras están **reescritas desde cero** a partir de las ideas. Aun así, la ficha **A20** propone una sección «Créditos y licencias» en `acerca.html` —hoy solo SVGnest tiene crédito; faltan Leaflet, qrcodegen y OpenStreetMap/Carto— donde entran también estas tres librerías.

---

## 8. Qué se verificó

- **Referencias:** las 365 citas a archivo y línea del anexo, y las 297 a funciones, se comprobaron contra el repo en `9ff7318`: todos los archivos existen, los números de línea caben en su archivo y las funciones están definidas.
- **Hallazgos de la sección 1:** revisados a mano; las líneas citadas son las que se leyeron.
- **Muestras 67–86:** las páginas 7 y 8 se probaron a 420 y 360 px, con y sin movimiento reducido: cada pieza ejercitada (arrastre, deslizar para confirmar, pulsación larga, teclado), cero errores, cero desborde, ninguna animación infinita en reposo.
- **Muestras 57–66:** la página 6 se probó a 420 y 360 px y con movimiento reducido: cada pieza ejercitada, cero errores, cero desborde, ninguna animación infinita.
- **Muestras 27–56:** las tres páginas nuevas se probaron a 360 y 420 px, con y sin movimiento reducido, en claro y oscuro: cero errores, cero desborde, ninguna animación infinita en reposo y ningún recurso externo fuera de Google Fonts. Cada constructor ejercitó cada muestra con ratón, dedo (toques reales por el protocolo de Chrome) y teclado, y revisó sus capturas; los números de ejemplo usan las tarifas y reglas de AL3D (p. ej. 32: acrílico $40 × 45 cm × 9 letras = $16,200; 53: 13 letras de 30 cm + caja de 0.36 m² = $17,004).
- **Muestras 1–26:** las dos páginas se probaron en Chromium headless a 420 px de ancho, sin errores de JavaScript y sin desbordar el ancho del teléfono. En la parte 2, en concreto:
  - el error del notario y el ✓ quedan los dos a la vista;
  - la mecha se pausa con el cursor encima, y deslizar hacia abajo quita el aviso;
  - un aviso informativo no pisa a uno con «Deshacer»;
  - la hoja se cierra deslizando;
  - el botón pasa de «Sellando… 1 s» a «✓ Sellada», y el que falla termina en «Reintentar»;
  - «Deshacer» cancela la escritura, y dejar correr la mecha la hace;
  - el riel no deja marcar un paso que no toca;
  - las esquinas caen exactamente sobre el campo;
  - Elias BBVA con factura dispara el aviso;
  - el código pegado se normaliza, y lo que no es del código se rechaza;
  - el teléfono «+52 3328130092» queda «33 2813 0092 ✓»;
  - la tarjeta cambia de columna con View Transition;
  - el tema cambia en círculo.
- **Lo que no se probó:** los gestos con el dedo en un teléfono real (3, 5, 9, 13, 15, 22), el tema oscuro completo de la app y un Android de gama media. Para eso quedan las pruebas del repo: `pruebas/correr.sh`, `pruebas/hojas-de-estilo.mjs`, `pruebas/csp.mjs` y, en `pruebas/navegador/`, `contraste.mjs`, `capas.mjs`, `vidrio.mjs` y `total-que-viaja.mjs`.

### Fuentes
- React Bits — https://reactbits.dev/ · código: https://github.com/DavidHDev/react-bits
- Vengeance UI — https://www.vengenceui.com/ · código: https://github.com/Ashutoshx7/VengenceUI
- Skiper UI — https://skiper-ui.com/components · licencia: https://skiper-ui.com/docs/quick-start
- Animmaster Lib — https://animmasterlib.dev/
