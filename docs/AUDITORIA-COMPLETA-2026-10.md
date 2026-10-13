# Auditoría completa de la plataforma — 13 de octubre de 2026

Hecha con la skill ui-ux-pro-max por 5 revisores en paralelo sobre `main` (a8c60a0, ya con #110, #111 y #114). Cubre **todo**: el cotizador (solo y dentro de la plataforma), las pantallas de la plataforma, el marco y la accesibilidad general, y por primera vez lo que ve alguien de fuera (puerta, acerca, condiciones, privacidad, verificar, publicaciones, página sin señal). Cada hallazgo nuevo se reprodujo en Chromium real (Playwright) en teléfono y computadora, claro y oscuro. No se cambió código.

No se repitió desde cero lo ya auditado: se revisó, uno por uno, si los problemas de las dos auditorías anteriores siguen abiertos.
- Cotizador: `docs/REVISION-UIUX-2026-10.md` (50 problemas, P01–P50).
- Plataforma: `docs/AUDITORIA-PLATAFORMA-2026-10.md` en la rama `claude/auditoria-plataforma-2026-10` (42 hallazgos: tablero-, proyectos-, control-, fabmat-, marco-).

## Resumen para Elías

| | Altos | Medios | Bajos | Total |
|---|---|---|---|---|
| **Nuevos de hoy** | 2 | 13 | 17 | **32** |
| Anteriores que siguen abiertos (plataforma) | | | | 35 de 42 (6 arreglados, 1 dormido) |
| Anteriores que siguen abiertos (cotizador) | | | | 47 de 50 (1 arreglado, 2 a medias) |

Nada borra datos ni cambia dinero por sí solo. Los dos altos nuevos:

1. **`cot-1` La pantalla parpadea casi un segundo después de abrirla.** Pasó con el cambio de pantalla del PR #111. Con el Cotizador se ve fuerte (toda la pantalla se apaga y vuelve), y el mismo mecanismo hace que **todas** las pantallas entren dos veces. Arreglo de una línea de CSS.
2. **`pub-1` En la puerta, «Entrar con Google» se mueve justo cuando lo vas a tocar.** Si el captcha tarda, una nota aparece arriba del botón y lo empuja 38–49 px. Es lo primero que ve cualquiera que entra.

Lo que más se repite: **el botón flotante «Preguntar» tapa cosas** (ahora también lo que tiene el foco del teclado), **objetivos táctiles de 16–38 px** en lugares sueltos y **letra de 9,5–11 px** en etiquetas.

Desde las auditorías anteriores se arreglaron los clics que se perdían (tablero-1, tablero-5, proyectos-1, control-2), el orden de «Se instala esta semana» (tablero-2), los filtros del Mapa en computadora (control-1) y el congelamiento del Historial del cotizador (P09). El cotizador por dentro **no ha cambiado** desde la Tanda 0.

## Tandas de arreglo sugeridas

Todo es esfuerzo S salvo donde se indica. Orden por lo que más se nota contra lo que cuesta.

**Tanda A — lo que se ve roto (½ día).**
- `cot-1` parpadeo al entrar a cualquier pantalla.
- `pub-1` + `pub-6` botón de la puerta que se mueve y que pide dos toques sin avisar (pub-6 es M).
- `cot-2` = `marco-1`: teléfono acostado, el dock del cotizador fuera de pantalla (misma causa: `js/mod/cotizador.js:416`, `Math.max(360,…)`).
- `tab-1`: después de «Acomodar en la lámina», Atrás saca del Tablero y la mesa se queda puesta.

**Tanda B — «Preguntar» y el foco.** `mar-1` (foco tapado), `mar-2` (su aro de foco no se ve en claro), `marco-10`, `proyectos-7`, `control-6`. Un `scroll-padding-bottom` y un respiro abajo de cada lista lo resuelven casi todo.

**Tanda C — dedos.** `tab-2` (pestañas de etapa 34 px), `ope-3` = `mar-4` (plegables de Ajustes 20 px), `pub-4` (pie de la puerta 16 px), `pub-9` (filtros de publicaciones 38 px), `proyectos-6` (pie de la ficha con 4 botones), `tab-3` («Acomodar» en cada renglón del teléfono).

**Tanda D — formularios y errores.** `ope-1` (error que se queda tras cambiar a Paquetería), `ope-2` (errores en ámbar y sin anunciar), `control-4`, `control-7`, `control-8`, `fabmat-3`, `proyectos-3` («Subtotal $0.00»).

**Tanda E — permisos de pagos.** `tablero-4` y `tab-4`: a pagos le salen «Mover la fecha» y «Ganado sin fecha» que no puede usar.

**Tanda F — páginas públicas que brincan o pesan.** `pub-2` (fondo acrílico, CLS sin fin), `pub-3` (verificar brinca 0,70 al llegar el veredicto), `pub-7`, `pub-8` (M), `pub-5` («Ir a…» 2,4:1 en oscuro), `pub-10` a `pub-13`.

**Tanda G — legibilidad y contraste.** `mar-3` (bordes de campos 1,3:1; = P14 del cotizador; M por revisión a ojo), `mar-6`, `tab-6`, `ope-4`, `pub-12`, `fabmat-4`, P16, P19.

**Tanda H — navegación y teclado.** `proyectos-2`, `mar-5`, `marco-4`, `marco-7`, `marco-8`, `control-11`, `fabmat-5`.

**Tanda I — listas largas y estado de la señal.** `tablero-3`, `marco-5`, `marco-6`, `tab-5`, `ope-5`, `marco-2`, `marco-3`, `marco-9` (M).

**Después — el cotizador por dentro:** las tandas 1–12 de `docs/REVISION-UIUX-2026-10.md`, tal cual (47 abiertos).

### Decisiones que son de Elías
- Material sigue apagado: el Calendario marca «Falta material» que nadie puede quitar (`fabmat-1`) y Material sigue en el menú sin salida (`fabmat-8`). ¿Se esconde el semáforo y la entrada mientras siga en mantenimiento?
- Tanda 3 del cotizador: ¿se oculta el selector Vendedor/Autorizador a quien no es Dirección?
- P50: hojas del taller en el PDF.

---

# Detalle de los nuevos

## Cotizador

#### cot-1 · [ALTA] La pantalla parpadea ~820 ms después de abrirla (y todas entran dos veces)
- **Dónde:** `css/plataforma.css:2884` (`#mod-cotizador{animation:none}` con `va-adelante/va-atras`, #111), `:303-304` (`.pf-mod` con `pf-aparece` desde opacidad .001) y `js/app.js:985-1006` (`ponerDireccion`, respaldo de 800 ms).
- **Qué pasa:** con `animation:none` nunca llega `animationend`. A los 800 ms el respaldo quita la clase, vuelve la regla base, `pf-aparece` arranca otra vez desde 0,001 y la pantalla entera se apaga y vuelve en 70 ms. En las demás pantallas: se deslizan (230 ms) y a los 256 ms se vuelven a fundir desde casi transparente.
- **Reproducido:** 390×844 táctil claro y 1366 ratón oscuro, cada visita: opacidad 0.001→0.52→0.82→0.93→0.98 a 820–834 ms; `animationName` pasa de `none` a `pf-aparece` en ese cuadro. Con «menos movimiento» no pasa.
- **Arreglo:** no usar `none`: conservar el mismo nombre de animación o `animation-duration:0s` (como el modo teclado, `:309`), y revisar que la regla de dirección no suelte `pf-aparece` al quitar la clase. Agregar a `pf-esqueleto.mjs` «ningún cuadro bajo 0,98 después de 300 ms».

#### cot-2 · [MEDIA] Teléfono acostado: «Continuar/Autorizar» del cotizador queda bajo el borde
- **Dónde:** `js/mod/cotizador.js:416` (`Math.max(360, …)`). Es la misma causa de `marco-1`.
- **Qué pasa:** a 844×390, cabecera 88 px + marco 360 px = termina en y=448, 58 px fuera; del dock solo asoman 16 px.
- **Arreglo:** que el piso nunca pase del alto disponible (`Math.min`), o bajarlo a ~240 px y usar el alto mayor solo con el teclado abierto.

Sin reproducir: `js/piezas.js:1694` mide la velocidad al soltar una hoja con `performance.now()`; con el hilo atrasado un latigazo contaría como 0. Mejor usar `timeStamp` del evento.

## Tablero, Qué atender y Proyectos

#### tab-1 · [MEDIA] Tras «Acomodar en la lámina», el Tablero se queda en la mesa de corte y Atrás saca de la pantalla
- **Dónde:** `js/mod/tablero.js:1573-1585` (cambia de vista sin `pushState` y con `scrollTo(0)`); `:77-82` recuerda la vista entre visitas.
- **Qué pasa:** Atrás lleva a Proyectos en vez de volver al renglón; al regresar al Tablero sigue la mesa de corte; la posición se pierde (3 477 → 0).
- **Arreglo:** `pushState` al abrir la mesa desde un renglón, guardar posición e id, y no recordar esa vista al salir. Esfuerzo S-M.

#### tab-2 · [MEDIA] Pestañas «Etapa de obra» de Proyectos miden 34 px en el teléfono
- **Dónde:** `css/sistema.css:2983-2984` (`.tipo-seg button,.seg button{min-height:34px}`) le gana por orden a la regla táctil de `:2667-2668`.
- **Arreglo:** repetir `min-height:44px` dentro de `@media (pointer:coarse)` después de la línea 2983.

#### tab-3 · [BAJA] En el teléfono, «Acomodar en la lámina» en cada renglón los alarga a ~326 px y lleva a una herramienta de computadora
- **Dónde:** `tablero.js:1128-1133`, `:1100-1104`; `proyectos.js:1454-1459`.
- **Arreglo:** en teléfono, moverlo a las acciones que salen al deslizar o a la ficha.

#### tab-4 · [BAJA] Para pagos, «Ganado sin fecha» cae en el Calendario sin hoja ni aviso
- **Dónde:** `tablero.js:629`, `:644`. **Arreglo:** para pagos, llevar a Proyectos filtrado o no hacerlo botón (mismo criterio que tablero-4).

#### tab-5 · [BAJA] La barra flotante «Ver el que no llega» tapa la lista todo el tiempo en el teléfono
- **Dónde:** `tablero.js:1403-1440`. **Arreglo:** esconderla cuando «No llegan» está en pantalla (IntersectionObserver).

#### tab-6 · [BAJA] Etiquetas de cifras y de tarjetas en 11 px
- **Dónde:** `.pf-cuenta`, cifras de Proyectos, `.pj-tarj-folio` (`--t1`). **Arreglo:** 12 px en el teléfono o `--t2`.

## Mapa, Calendario, Control, Ajustes, Datos de entrega y anidador

#### ope-1 · [MEDIA] «Datos para la entrega»: al cambiar a Paquetería se queda un error que pide controles que ya no están
- **Dónde:** `js/mod/datos-entrega.js:139-150` y `:168-178` (`ajustar()` esconde campos pero no limpia sus mensajes).
- **Arreglo:** `limpiar(b,'dir')` y `limpiar(b,'maps')` en `ajustar()`; revalidar solo lo visible.

#### ope-2 · [MEDIA] Los errores de «Datos para la entrega» se ven como notas y no se anuncian
- **Dónde:** `datos-entrega.js:120` (`hintnote nota-av`), `css/sistema.css:1073-1074`.
- **Arreglo:** estilo de error propio (rojo e icono), `role="alert"` o un resumen «Faltan 2 datos…», y `aria-invalid` (junto con control-7).

#### ope-3 · [BAJA] Ajustes: los plegables miden 20 px de alto (= mar-4)
- **Dónde:** `js/mod/ajustes.js:674`, `:839`, `:857`, `:869`. **Arreglo:** el estilo de `.pj-cand>summary` (44 px, flecha propia, `cursor:pointer`).

#### ope-4 · [BAJA] Ajustes: casi toda la ayuda en 11 px gris, incluida la advertencia de «Restaurar»
- **Dónde:** `css/plataforma.css:1177`. **Arreglo:** `.pf-nota` a `--t2` en Ajustes.

#### ope-5 · [BAJA] Ajustes mide 8 845 px en el teléfono y los 12 pasos de Google Cloud vienen abiertos
- **Dónde:** `ajustes.js:674`, `:325-334`. **Arreglo:** plegable siempre cerrado con «Configurar ahora».

#### ope-6 · [BAJA] «Recolección en taller» se parte en dos renglones
- **Dónde:** `datos-entrega.js:73`. **Arreglo:** «Recoge en taller».

## Marco y accesibilidad general

#### mar-1 · [MEDIA] Con el teclado, el foco cae en un botón tapado por «Preguntar»
- **Dónde:** `#pf-ia-btn` (`css/plataforma.css:2165`); sin `scroll-padding-bottom`. WCAG 2.4.11.
- **Reproducido:** 1366, `#/hoy`, el 7.º Tab es «Abrir» y en su centro está el botón «Preguntar».
- **Arreglo:** `html{scroll-padding-bottom:calc(48px + 32px)}` (+ `--mbar-h` en el teléfono).

#### mar-2 · [MEDIA] El aro de foco de «Preguntar» casi no se ve en claro (1,1:1)
- **Dónde:** `css/plataforma.css:2165`. **Arreglo:** en claro, `outline:2px solid var(--a-tx);outline-offset:3px`.

#### mar-3 · [MEDIA] Campos, chips y botones secundarios se distinguen solo por un borde de 1,3:1
- **Dónde:** `css/sistema.css:1054`, `:1125`. WCAG 1.4.11 pide 3:1. Es P14 del cotizador.
- **Arreglo:** token `--borde-control` (`--n5` en claro, ~`#5a6196` en oscuro) en campos, `.chip` y `.btn` secundario. Esfuerzo S en código, M en revisión a ojo.

#### mar-5 · [BAJA] Al abrir la app, el primer Tab se salta «Ir al contenido», la lupa y el menú
- **Dónde:** `js/app.js:757-758` (`main.focus()` también en el primer montaje). **Arreglo:** no enfocar `main` en el arranque.

#### mar-6 · [BAJA] Letra de 9,5–10,5 px en la barra de abajo y en el calendario del teléfono
- **Dónde:** `css/plataforma.css:188`, `:203`, `:563`. **Arreglo:** `var(--t1)`.

## Lo que ve alguien de fuera

#### pub-1 · [ALTA] En la puerta, «Entrar con Google» se mueve justo cuando lo vas a tocar
- **Dónde:** `js/nucleo/puerta.js:843-844`, `:887-897`; `css/plataforma.css:2958-2960`.
- **Reproducido:** 360×780, captcha que tarda 4 s y falla: el botón pasa de y=448 a 486 al tocar y a 497 al fallar. Con captcha lento, la caja crece de 576 a 674 px.
- **Arreglo:** la nota y el recuadro del captcha debajo del botón, o con su lugar apartado desde el principio.

#### pub-2 · [MEDIA] El fondo «acrílico» de la puerta reacomoda la página en cada cuadro
- **Dónde:** `css/plataforma.css:3198-3200` (`pf-barrido` anima `left`); menos en `pf-cabeza` (`:3150`, fondo «cnc»).
- **Reproducido:** CLS +0,45 cada 5 s en reposo. **Arreglo:** `transform: translateX()`.

#### pub-3 · [MEDIA] Verificar: al llegar el veredicto todo el texto brinca (CLS 0,70 en el teléfono)
- **Dónde:** `verificar.html:83`, `:259-265` (el `<h1>` pasa de 2 renglones a 1).
- **Arreglo:** mantener el alto del título, o dejar fija la pregunta y poner el veredicto dentro de la tarjeta.

#### pub-4 · [MEDIA] Los enlaces del pie de la puerta miden 16 px de alto
- **Dónde:** `css/sistema.css:7542-7543`. **Arreglo:** lo mismo que `.pub-pie a` (44 px).

#### pub-5 · [MEDIA] El enlace «Ir a…» del teclado se lee a 2,4:1 en oscuro
- **Dónde:** `css/sistema.css:2728` (`.salto{background:#fff;color:var(--brand-strong)}`). Afecta a publicaciones, al cotizador y al anidador (= parte de P16).
- **Arreglo:** `background:var(--sup);color:var(--a-tx)`.

#### pub-6 · [MEDIA] El primer toque a «Entrar con Google» no hace nada si el captcha no terminó, y el botón no lo avisa
- **Dónde:** `js/nucleo/puerta.js:904-909`; `css/plataforma.css:2961` (opacidad .72, ~3,1:1).
- **Arreglo:** el botón dice «Comprobando…» y luego «Listo, toca para entrar», sin moverse. Esfuerzo M.

#### pub-7 · [BAJA] Al pasar del logo a la puerta, Chrome cuenta un salto de 0,12 en escritorio
- **Dónde:** `css/sistema.css:7499` (`body::after` cambia de `inset:0` a `-12%`). **Arreglo:** usar `body::before` o un `<div>` propio.

#### pub-8 · [BAJA] El fondo «semitono» baja a 21–40 cuadros por segundo en escritorio
- **Dónde:** `js/nucleo/puerta-fondos.js:108-135`. **Arreglo:** rejilla más abierta arriba de 1000 px o dibujar a 30 fps. Esfuerzo M.

#### pub-9 · [BAJA] Publicaciones: filtros de 38 px, números de 11 px y sin `<h1>`
- **Dónde:** `publicaciones/css/publicaciones.css:55`, `:57`, `:242`; `publicaciones/index.html`.

#### pub-10 · [BAJA] Publicaciones: miniaturas que el lector de pantalla anuncia como «P01 1x1»
- **Dónde:** `publicaciones/js/editor.js:189`. **Arreglo:** etiqueta con tipo y formato si falta el nombre.

#### pub-11 · [BAJA] Las páginas que revisa Google no tienen vista previa para compartir ni dirección canónica
- **Dónde:** `acerca.html`, `condiciones.html`, `privacidad.html`, `index.html`. **Arreglo:** etiquetas `og:` y `canonical`.

#### pub-12 · [BAJA] Acerca: las rutas de las licencias van en 11,5 px
- **Dónde:** `acerca.html:132-145`. **Arreglo:** `code{font-size:max(.85em,12px)}`.

#### pub-13 · [BAJA] La página «sin señal» no sigue el tema elegido en la app
- **Dónde:** `sw.js:450-452`. **Arreglo:** leer `al3d_tema` antes de pintar; «abre la app una vez con señal».

---

# Estado de los hallazgos anteriores

## Plataforma (`AUDITORIA-PLATAFORMA-2026-10.md`)

| Id | Estado | Nota de hoy |
|---|---|---|
| tablero-1 | Arreglado | `piezas.js:2321` ignora el ratón |
| tablero-2 | Arreglado | |
| tablero-3 | Abierto | `faltanDatos` sin tope (`tablero.js:781`) |
| tablero-4 | Abierto | `tablero.js:1069`, `:722` |
| tablero-5 | Arreglado | |
| proyectos-1 | Arreglado | `MOVER_RATON = 8` |
| proyectos-2 | Abierto | Alt+→ deja el foco en `body` |
| proyectos-3 | Abierto | `datos/proyectos.js:488`, `:1418` |
| proyectos-4 | Abierto | 1.ª tarjeta en y=576 a 360 |
| proyectos-5 | Abierto (por código) | `plataforma.css:1665` |
| proyectos-6 | Empeoró | 4 botones en el pie tras #114 |
| proyectos-7 | Abierto (por código) | |
| control-1 | Arreglado | |
| control-2 | Arreglado | |
| control-3 a control-11 | Abiertos | |
| fabmat-1 a fabmat-8 | Abiertos | fabmat-4: 1,64:1 en oscuro |
| fabmat-9 | Dormido | Solo importa al reencender Material |
| marco-1 a marco-10 | Abiertos | marco-10 ahora también tapa el foco (mar-1) |

## Cotizador (`REVISION-UIUX-2026-10.md`)

P09 arreglado (Tanda 0). P01 a medias (la cabecera ya es estática en ventanas bajas; falta Shift+Tab en escritorio grande). P26 a medias (tactil-7 hecho; siguen tactil-1 y tactil-2). Los otros 47 siguen abiertos; ningún archivo del cotizador cambió desde 3045db4. **P02 está peor dentro de la plataforma:** a 360×780 solo queda libre el 55 % de la pantalla (barra de la plataforma + barra del cotizador + dock + barra de módulos).

---

# Lo que está bien

- **Sin errores ni desbordes:** 0 errores de página y 0 scroll de lado en todas las combinaciones de pantalla, tamaño, rol y tema; también con zoom al 200 % y a 320 px.
- **Nombres y estructura:** 0 controles sin nombre, un solo `h1` por pantalla de la plataforma, encabezados en orden, `lang="es"` y zoom libre.
- **Contraste del texto** medido sobre la captura: pasa en claro y oscuro. El aro de foco general da 4,95:1.
- **Movimiento reducido** respetado. El cambio de pantalla de #111 aguanta 12 toques seguidos y 5 «Atrás» sin dejar restos.
- **Sin señal:** con el service worker instalado abren Tablero, Calendario, Proyectos, Control y el cotizador empotrado.
- **El tema** cambia en el cotizador empotrado en el mismo cuadro, sin destello.
- **Verificar** está muy bien resuelta: acepta el folio como sale impreso, aguanta pegar el código, cada veredicto lleva glifo y palabra, y se reintenta sola.
- **Las páginas públicas** cargan en 40–150 ms; la puerta deja entrar aunque el captcha no cargue, y lo dice.
- **Los arreglos anteriores se sostienen:** clics con ratón, filtros del Mapa, Historial del cotizador.

Scripts, capturas y salidas de cada revisor: `scratchpad/aud/{cotizador,tablero,mapa,marco,publicas}/` de la sesión 3354ea45 (temporales).
