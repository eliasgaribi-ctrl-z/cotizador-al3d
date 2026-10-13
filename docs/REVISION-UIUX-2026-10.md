# Revisión UI/UX del cotizador — síntesis final (octubre 2026)

> Parte de `docs/REVISION-UIUX-2026-10-PARCIAL.md` (96 hallazgos de 10 lentes, todos reproducidos en el navegador por un verificador independiente; 5 confirmados tal cual y 91 «parciales», o sea reales pero exagerados en algo). Aquí no se volvió a auditar: se fusionan duplicados, se ordena el trabajo en tandas y se dice qué no vale la pena. Las severidades son las **finales del verificador**, no las que propuso cada lente. El movimiento no entra (se auditó en el PR #75).

---

## 1. Resumen para Elías

- **La app está en muy buen estado.** Ninguna lente encontró nada crítico, ni un dato perdido ni un precio equivocado. Las bases (teclado, modales, autoguardado, máscara del teléfono, contraste del texto, sin desbordes de 320 a 1920 px) salieron bien en todas las revisiones.
- De 96 hallazgos quedan **50 problemas únicos**: muchos eran el mismo problema visto por dos o tres lentes. Por severidad: **2 altos, 27 medios, 67 bajos** (contando los 96 originales).
- **Lo más importante ya se está arreglando (Tanda 0).** (1) Con el teléfono acostado, en tableta o con zoom al 200 %, las cabeceras que se quedan pegadas arriba tapan el formulario. (2) El Historial se congela unos segundos cuando ya hay muchas cotizaciones guardadas, y cada mes va a ser peor.
- **Lo que sigue y conviene más (Tanda 1)** son arreglos chicos en lo que el vendedor toca todos los días: el primer clic en «Autorizar» que se pierde, el botón grande del teléfono que está apagado sin decir por qué, el aviso de «partidas sin terminar» que no te lleva a la partida y los bordes de los campos, que casi no se ven con sol.
- **La barra de arriba del teléfono** brinca y crece 51 px cuando sale la pastilla de estado («Sin señal», «Esperando a Dirección»). Es la causa que más hallazgos juntó (8). Para arreglarla necesito una decisión tuya: ¿se oculta el selector Vendedor/Autorizador a quien no es Dirección?
- **Lo que recibe el cliente (el PDF)** está bien resuelto con 1 a 4 partidas. Lo que falla: la letra es muy chica, no trae enlaces que se puedan tocar y la excepción de $60,000 está escrita a medias. Esto necesita tu visto bueno en la redacción.
- Hay **6 cosas que conviene no hacer** y unas 15 que pueden esperar sin problema (sección 4).

---

## 2. Fusión de duplicados: 96 hallazgos → 50 problemas únicos

Cada problema (P) es una causa raíz. Entre paréntesis va la severidad final más alta del grupo. La columna «Tanda» remite a la sección 3.

### Pantalla y capas que se quedan pegadas

| P | Causa raíz | IDs que absorbe | Sev. | Tanda |
|---|---|---|---|---|
| P01 | La cabecera de la partida (`.pcab`, sticky) y la barra de arriba no se sueltan en ventanas bajas, y `scroll-padding-top` solo cuenta la barra de arriba, no la `.pcab` | `layout-1`, `a11y-2` | alta | 0 (a11y-2 se termina en la 2) |
| P02 | La barra superior del teléfono crece de 58 a 109 px: la isla de estado no cabe en el renglón entre 386 y 427 px, y a ≤385 px el selector de rol baja a un tercer renglón pegado. En tableta o en horizontal la barra mide de 123 a 177 px | `flujo-5`, `formularios-3`, `layout-9`, `layout-4`, `flujo-8`, `layout-6` | media | 3 (layout-6 en parte en la 0) |
| P03 | La columna del dinero (`.side`, sticky) mide 827 px y no tiene tope de alto: en laptops de 630 a 768 px de alto los botones de autorizar quedan fuera de la pantalla | `layout-2`, `a11y-3` | media | 2 |
| P04 | Los modales de apoyo no se adaptan a pantallas cortas o en horizontal: Historial y Clientes se quedan sin lista, y el botón principal de IA, Registrar venta y Revisión remota queda bajo el pliegue | `apoyo-1`, `layout-5`, `apoyo-7`, `apoyo-4` | media | 6 |
| P05 | En el teléfono, Escalador y Vectorizador tienen poco lienzo, un pie fijo de 175 a 236 px y el botón «Vectorizar» enterrado | `apoyo-2`, `apoyo-3` | media | 7 |
| P06 | El campo de teléfono del cliente se corta entre 386 y 419 px (iPhone 12–15) | `layout-3` | media | 1 |
| P07 | Capturar una partida de letras ocupa casi dos pantallas en el teléfono | `layout-7` | baja | Después |
| P08 | El espaciado de 4/8 px y los márgenes laterales no son sistemáticos | `layout-8` | baja | No hacer |

### Rendimiento

| P | Causa raíz | IDs | Sev. | Tanda |
|---|---|---|---|---|
| P09 | `_focablesDe` recorre todo el Historial con lecturas de layout al abrir o cerrar un modal y en cada Tab | `rendimiento-1` | alta | 0 |
| P10 | `renderItems` reconstruye toda la lista de partidas en cada toque, y `typeItem` repinta el resumen, el dock y la barra de avance en cada tecla | `rendimiento-5`, `rendimiento-6` | baja | 12 |
| P11 | El código se publica sin minificar (790 KB gzip contra unos 313) y con 14 guiones en cadena | `rendimiento-3`, `rendimiento-2`, `rendimiento-8` | media | 12 (rendimiento-2 y -8: no hacer) |
| P12 | Service worker: cada versión vuelve a bajar 108 archivos con `cache:'reload'`, el logo pide red sin tope de espera y las fuentes vienen de Google | `rendimiento-7`, `rendimiento-9`, `rendimiento-10` | baja | 12 (rendimiento-10: Después) |
| P13 | El esqueleto destapa a los 8 s (o con un error) un formulario que no funciona | `rendimiento-4` | baja | 12 |

### Contraste y temas

| P | Causa raíz | IDs | Sev. | Tanda |
|---|---|---|---|---|
| P14 | El token `--linea` en bordes de campos, interruptores y botones secundarios da ~1,3:1 (WCAG 1.4.11 pide 3:1), y no hay `prefers-contrast` | `a11y-1`, `tema-3` | media | 1 (la parte de `prefers-contrast` va en la 11) |
| P15 | No existe ningún `@media (forced-colors)`, así que en alto contraste de Windows desaparecen los interruptores, las barras y lo elegido | `a11y-5`, `tema-1` | baja | 11 |
| P16 | Tema oscuro: textos de apoyo bajo 4,5:1 por el brillo del vidrio, la pastilla de rol a 1,18:1, el enlace de salto a 2,39:1 y el aro blanco del paso activo; además `contraste.mjs` solo corre en claro | `a11y-4`, `tema-2`, `tema-4`, `tema-5`, `tema-8`, `tema-7` | baja | 11 (tema-7: Después) |
| P17 | En oscuro, el logotipo (el de la casa al imprimir y el que sube el cliente) pierde sus letras oscuras | `tema-6`, `tema-9` | baja | 11 |
| P18 | El estado apagado (`aria-disabled`, opacidad) también atenúa lo que sí debe verse: el precio y la palomita del chip elegido tras autorizar, y el anillo de foco de «Del escalador» | `tipocolor-2`, `a11y-10` | media | 1 |

### Tipografía, color e íconos

| P | Causa raíz | IDs | Sev. | Tanda |
|---|---|---|---|---|
| P19 | En teléfono y tableta, lo que más se toca va a 10–11,5 px, más chico que en escritorio (tipo de partida, chips, precios, rótulos de Registrar venta) | `tipocolor-1`, `a11y-7`, `tipocolor-6` | media | 8 |
| P20 | A los botones les falta `font-family`, así que salen en Arial | `tipocolor-3` | baja | 8 |
| P21 | Emoji y glifos de texto funcionan como íconos junto al sprite | `tipocolor-4` | baja | Después |
| P22 | El color semántico se usa fuera de su significado: verde y ámbar que no son «ok» ni «falta», azul en rótulos fijos y varios botones azules de relleno en las herramientas Pro | `tipocolor-5`, `tipocolor-7`, `tipocolor-10` | baja | Después |
| P23 | Hay 17 tamaños de letra reales frente a 7 tokens | `tipocolor-8` | baja | No hacer |
| P24 | Hay texto cortado con elipsis que no se puede ver completo con el dedo, y el folio se parte en dos renglones | `tipocolor-9` | baja | Después |

### Táctil

| P | Causa raíz | IDs | Sev. | Tanda |
|---|---|---|---|---|
| P25 | Hay controles de menos de 44 px: `.tool-seg` (34 px, porque una regla pisa a otra), el selector de tipo (40), `.plano-b`, `.falt-ir` y la fila de iconos de la partida | `tactil-5`, `apoyo-6`, `tactil-6` | baja | 7 (apoyo-6) y 8 (tactil-5); tactil-6: no hacer |
| P26 | Los gestos que la partida arma en `pointerdown` le roban el toque al usuario: el arrastre de etiqueta cambia la cifra al hacer scroll, la «espiada» se traga el toque lento y `draggable` se lleva el clic del ratón | `tactil-1`, `tactil-2`, `tactil-7` | media | 4 |
| P27 | «Generar PDF» y «Enviar por WhatsApp» no tienen candado de reentrada (un doble toque abre dos ventanas) | `tactil-8` | baja | 4 |
| P28 | Al presionar, 10 de 28 controles no dan ninguna señal, y con «menos movimiento» casi ninguno | `tactil-4` | baja | 8 |

### Flujo y formularios

| P | Causa raíz | IDs | Sev. | Tanda |
|---|---|---|---|---|
| P29 | Al salir de un campo numérico, `saneaNum` llama otra vez a `typeItem`, eso repinta `#authbox` y el primer clic sobre «Autorizar/Solicitar» se pierde | `flujo-1` | media | 1 |
| P30 | El botón principal del dock (`renderMobileBar`, `dis:!listo`) queda apagado y mudo mientras no hay ninguna partida con precio | `flujo-2`, `formularios-4`, `tactil-3` | media | 1 |
| P31 | En una cotización bloqueada, tocar un campo o un chip no da ninguna respuesta (`_candTocarPartida` sale en seco) | `flujo-4` | baja | 4 |
| P32 | `irAPartida` choca con el `popstate` que deja el aviso al cerrarse, y el salto a la partida no ocurre en el teléfono | `formularios-1` | media | 1 |
| P33 | Con la solicitud en espera, «Editar» (en el dock y en el banner) la cancela de un toque y sin confirmar | `flujo-3` | media | 4 |
| P34 | Los campos no tienen `enterkeyhint` y Enter no lleva al siguiente | `flujo-9`, `formularios-8`, `tactil-9` | baja | 8 |
| P35 | Los errores del paso Cliente solo salen en un toast de 4,6 s y en color, sin texto junto a cada campo | `a11y-6`, `formularios-5` | baja | Después |
| P36 | Las cifras que mueven dinero no tienen tope ni aviso de magnitud: precio autorizado, medidas, tarifas y teléfonos de 11 a 15 dígitos | `formularios-2`, `formularios-6`, `formularios-7` | baja | 5 |
| P37 | Al recargar, la página vuelve arriba y cada recarga suma un escalón al botón Atrás | `flujo-6` | baja | Después |
| P38 | Después de entregar, el dock sigue proponiendo «Registrar venta» | `flujo-10` | baja | No hacer |
| P39 | El bloque «Datos que salen en el PDF» no avisa que ya tiene datos y mezcla el plazo de taller, que no sale en el PDF | `formularios-9` | baja | Después |
| P40 | Jerga interna y nombres distintos para lo mismo («sellar», «hoja», kelvin, «cm alt.») | `flujo-7`, `cliente-9` | baja | 9 |
| P41 | Tocar fuera de Registrar venta o de Revisión remota cierra el modal y descarta lo escrito | `apoyo-5` | baja | 6 |
| P42 | Nombres accesibles y orden del foco en la barra superior: el orden del foco no sigue al visual, la etiqueta no contiene el texto visible y el botón de tema usa `aria-pressed` con una etiqueta que cambia | `a11y-9`, `tema-10` | baja | 3 |

### Escalador

| P | Causa raíz | IDs | Sev. | Tanda |
|---|---|---|---|---|
| P43 | El lienzo y las guías del Escalador solo se operan arrastrando con puntero: no tienen nombre, foco ni alternativa | `a11y-8`, `apoyo-10` | baja | Después |
| P44 | «Re-calibrar» no repinta la lista y deja las medidas viejas con «Agregar como partida» activo | `apoyo-8` | baja | 7 |
| P45 | Las medidas y la calibración viven solo en memoria y se pierden al recargar | `apoyo-9` | baja | Después |

### Lo que recibe el cliente

| P | Causa raíz | IDs | Sev. | Tanda |
|---|---|---|---|---|
| P46 | `repartir()` le reserva 312 px fijos al plano en la última hoja: con plano y 5 o más partidas, la hoja 1 queda casi vacía | `cliente-1` | media | 10 |
| P47 | Ni el PDF ni `verificar.html` traen un enlace o contacto que el cliente pueda tocar | `cliente-2`, `cliente-6` | media | 9 |
| P48 | El papel tiene letra de 5 a 8 pt y el gris `--ink3` a 3,0–3,2:1 | `cliente-4`, `cliente-5` | media | 9 (gris) y 10 (letra) |
| P49 | Las condiciones comerciales están escritas a medias: la excepción de $60,000 sin explicar, y no se dice la vigencia ni el siguiente paso | `cliente-7`, `cliente-3` | media | 9 |
| P50 | Las hojas del taller (orden de trabajo, instalación, recibo) van dentro del mismo PDF que recibe el cliente | `cliente-8` | baja | Después (antes hay que contestar una pregunta de negocio) |

**Conteo final: 50 problemas únicos** (de 96 hallazgos; 46 eran el mismo problema visto por otra lente). Además, cada lente dejó una lista de «omitidos por el tope de 10» en el parcial. No se cuentan aquí y casi todos son cosméticos.

---

## 3. Tandas de arreglo

Van ordenadas por lo que le rinden al vendedor contra lo que cuestan. Cada una está pensada para caber en un PR. «Verificar» supone el arnés de Playwright y las pruebas de `pruebas/navegador/`. En casi todas las tandas el verificador ya probó el arreglo inyectándolo en la página: el detalle exacto está en la ficha de cada ID en el parcial.

### Tanda 0 — hecha (rama `claude/uiux-sintesis-y-altos`)

- **Qué:** P01 (las cabeceras pegadas tapan el formulario), P09 (el Historial se congela) y, adelantado de la Tanda 4, `tactil-7`.
- **IDs principales:** `layout-1`, `rendimiento-1`, `tactil-7`.
- **Por qué `tactil-7` subió:** la revisión lo dejó en «baja», pero Elías lo reportó el 2026-10-12 en uso real: en la plataforma las fichas del recorte de acrílico y de los materiales «se buguean y no dejan seleccionar». Reproducido: con 4 px de movimiento del ratón durante el clic, 2 de cada 3 fichas no se elegían. `_ratonArma` ya no arma `draggable` sobre fichas, botones, interruptores ni etiquetas; el asa sigue arrastrando.
- **Medido después del arreglo:** Historial con 200 entradas a CPU ×4, de 2,5–3,1 s a 0,6–0,8 s, y el foco cae en el mismo lugar. Espacio libre para el formulario: 640×400 (zoom 200 %) de −19 % a 82 %; 1024×768 de 57 % a 83 %; 1280×800 y 1440×900 sin cambio.
- **Hallazgos que estos arreglos probablemente resuelven de paso:**
  - `a11y-2`: es la **misma `.pcab` pegajosa**. El arreglo de layout-1 la vuelve estática en ventanas de menos de 1260 px de ancho y menos de 820 de alto, o de menos de 440 de alto. Eso resuelve el caso con zoom al 200 %, en tableta y con el teléfono acostado. **Queda pendiente** el foco tapado al hacer Shift+Tab en escritorios grandes (1280–1920 px de ancho, donde la `.pcab` sigue pegada). Ese resto pasa a la Tanda 2 (`scroll-margin-top` con `--pcab-alto`).
  - `layout-6`: la segunda pieza de layout-1 suelta la barra de arriba (`.topbar`, sticky) y `.side` en cualquier pantalla horizontal de 520 px de alto o menos, no solo con el dedo. Eso cubre el primer pantallazo en horizontal. La barra de 123–177 px en tableta vertical sigue en la Tanda 3.
  - `a11y-3` y `layout-2`: solo en ventanas horizontales muy bajas (por la misma segunda pieza). En laptops de 630–768 px de alto **no** se resuelven: van en la Tanda 2.
  - El omitido de accesibilidad «A 320×256 la pila pegajosa deja ~12 px» queda cubierto.
  - `rendimiento-1` no arrastra otros IDs. Ojo: según el verificador, también hay que cambiar el manejador de Tab (`nucleo.js:312-315`), no solo `_modalAbierto`/`_modalCerrado`. Si no, el primer Tab con 200 entradas tarda de 1 a 1,7 s.
- **Archivos:** `css/sistema.css` (~2423-2442 `.pcab`, ~1303 bloque horizontal) y `js/cotizador/nucleo.js` (`_focablesDe` ~335, `_modalAbierto` ~521, `_modalCerrado` ~554, Tab ~312).
- **Riesgo:** bajo. En laptops de menos de 820 px de alto y menos de 1260 de ancho, la partida abierta pierde su resumen pegado: es el costo elegido. Conviene que Elías confirme cómo se ve en el iPad horizontal.
- **Verificar:** 667×375, 640×400 (zoom 200 %) y 1024×768 con los 18 campos de la partida alcanzables. Historial con 200 y 400 entradas abriendo en menos de 400 ms a CPU ×1, y con un primer Tab rápido. Hoy `cot-historial.mjs` usa 8 entradas: conviene subirlo a 200.

### Tanda 1 — Lo diario del vendedor, barato y seguro

- **Qué:** P29, P30, P32, P14 (parte A), P18 y P06.
- **IDs:** `flujo-1`, `flujo-2`, `formularios-4`, `tactil-3`, `formularios-1`, `a11y-1`, `tema-3` (solo los bordes), `tipocolor-2`, `a11y-10`, `layout-3`.
- **Arreglos:**
  - `saneaNum` llama a `typeItem` solo si el valor cambió.
  - La rama final de `renderMobileBar` deja de apagar el botón y lleva a lo que falta («Completa la partida ›»).
  - `irAPartida` cede un microtask antes de esperar el `popstate`.
  - Los campos e interruptores pasan a `border-color:var(--n5)`: 3,07:1 en claro y 3,84:1 en oscuro.
  - Se añade la regla `.chip[aria-disabled].on small/.ck` en `--tinta2`.
  - `.plano-b` se apaga con color y no con opacidad.
  - Cambia un número en el `padding-right` de `.tel-vivo-in`.
- **Archivos:** `js/cotizador/partidas.js` (`saneaNum` ~381), `js/cotizador/proceso.js` (`renderMobileBar` ~2482, `irAPartida` ~933), `css/sistema.css` (~3038 campos, ~3120 `.tg`, ~2945 chips, 1644 `.plano-b`, ~4546 `.tel-vivo`).
- **Riesgo:** bajo. `sistema.css` es compartido, así que hay que revisar a ojo el anidador y la plataforma por el borde más oscuro. No incluir `.inp-money` en la regla de bordes (daría un aro doble). En `flujo-1`, la guarda debe excluir `k==='n'` con n=0.
- **Verificar:**
  - 1440×900 con ratón real: teclear en `#n-1` y hacer clic una sola vez en «Autorizar yo mismo» pasa el estado a `pendiente`.
  - 390×844 en Partidas sin precio: el dock dice qué falta y lleva ahí.
  - Abrir el aviso desde el fondo y tocar `.falt-ir`: la partida queda en pantalla.
  - Contraste del borde ≥3:1 en claro y oscuro.
  - Teléfono «33 1234 5678» completo a 390, 393 y 412 px.
  - Seguir en verde: `cotizador-flujo.mjs`, `cot-precio.mjs`, `precio-suelto.mjs` y `cot-cliente.mjs`.

### Tanda 2 — Escritorio: lo pegado no tapa el foco

- **Qué:** P03 y el resto de P01.
- **IDs:** `layout-2`, `a11y-3`, `a11y-2` (Shift+Tab en escritorio grande).
- **Arreglos:**
  - En `screen` y `min-width:760px`, `.side` recibe tope `max-height:calc(100dvh - var(--top-fijo) - 24px)` con scroll propio. Solo en borrador: `renderAuth` publica `data-estado`, y el tope no se aplica en `autorizada` ni en `pendiente`.
  - `scroll-margin-top:var(--pcab-alto)` en los campos de la partida abierta, más un guion que publique `--pcab-alto` solo cuando la `.pcab` está pegada.
- **Archivos:** `css/sistema.css` (~1287 `.side`, ~2423 `.pcab`), `js/cotizador/proceso.js` (`renderAuth`) y `js/cotizador/nucleo.js` (o donde ya se calcula `--top-fijo`).
- **Riesgo:** bajo a medio. Habrá dos zonas de scroll anidadas en la columna y la tarjeta se angosta 6 px cuando la columna se desborda. **No** aplicar la receta original del revisor (`scrollbar-gutter`, `overscroll-behavior:contain`), porque tiene tres regresiones medidas. Si `--pcab-alto` se publica sin filtrar por sticky, en el teléfono empujaría cada campo de más.
- **Verificar:** 1366×650, 1280×720 y 1366×768: Tab llega a «Autorizar yo mismo» y a «Solicitar autorización» con el botón visible. 1440×900: Shift+Tab sobre los chips Recta/Cursiva/Compleja ya no queda bajo la `.pcab` (`elementFromPoint` en 25 puntos).

### Tanda 3 — La barra de arriba del teléfono (necesita una decisión de Elías)

- **Qué:** P02 y P42.
- **IDs:** `flujo-5`, `formularios-3`, `layout-9`, `layout-4`, `flujo-8`, `layout-6` (resto), `a11y-9`, `tema-10`.
- **La decisión:** ¿se oculta el selector Vendedor/Autorizador a quien no es Dirección? Hoy está a la vista a propósito (`notario.js:46-47`). Ocultarlo libera el tercer renglón a ≤385 px (layout-4) y devuelve los rótulos «Clientes» e «Historial» (flujo-8).
- **Arreglos:**
  - Sacar la isla de estado del reparto de la fila cuando no cabe. Los verificadores propusieron tres variantes: colgarla bajo la barra (flujo-5), ponerla como insignia en la esquina del folio (formularios-3) o sacarla solo cuando no cabe, desde `_islaMostrar` (layout-9). Hay que elegir **una**. La de layout-9 es la menos invasiva, porque reutiliza la lógica de «¿cabe?» que ya existe a ≥561 px.
  - `html.sin-rol #roleseg{display:none}`.
  - Reordenar el HTML de la barra para que el foco siga al orden visual.
  - En `tema.js`, quitar `aria-pressed` y dejar la etiqueta como acción.
- **Archivos:** `css/sistema.css` (~852-909 barra móvil, ~5057-5082 isla, ~6564 a ≤385 px), `js/cotizador/nucleo.js` (`_islaMostrar` ~666, `ajustarTopbarMovil` ~173), `js/cotizador/notario.js` (`pintarRolDisponible`), `cotizador.html` (166-210) y `js/tema.js` (137-141).
- **Riesgo:** medio. Cambia la composición de la barra y rompe las aserciones de `cot-cliente.mjs` ~336-338, que hay que reescribir para ≤560 px. Ese test hoy no mide el alto de la barra en el teléfono: hay que añadirlo.
- **Verificar:** a 360, 375, 390, 412 y 420 px, con la isla «Sin señal» y «Esperando a Dirección», la barra se queda en 114 px (58 visibles) y Historial no brinca. Orden de Tab = orden visual.

### Tanda 4 — Toques que se pierden o se duplican, y candados que no avisan

- **Qué:** P26, P27, P31 y P33.
- **IDs:** `tactil-1`, `tactil-2`, `tactil-7`, `tactil-8`, `flujo-4`, `flujo-3`.
- **Arreglos:**
  - El arrastre de etiqueta se cancela si el navegador ya tomó el gesto como scroll.
  - La espiada pasa de 350 a 500 ms.
  - ~~`_ratonArma` deja de armar `draggable` sobre chips y botones.~~ Hecho en la Tanda 0.
  - Guarda de reentrada compartida en el cableado de los hitos.
  - `_candTocarPartida` contesta también cuando la cotización está bloqueada.
  - Nueva `editarSolicitada()`, que confirma antes de cancelar una solicitud (en el dock y en el banner; el botón del aside ya lo dice).
- **Archivos:** `js/piezas.js` (`empezarArrastre` ~3664-3745), `js/cotizador/partidas.js` (`_peekBajar` ~860, `_ratonArma` ~778, `_candTocarPartida` ~1432, `irAlCandado` ~1412), `js/cotizador/entrega.js` (HITOS ~367) y `js/cotizador/proceso.js` (`renderMobileBar` ~2455).
- **Riesgo:** bajo a medio. Son gestos documentados (C13, la espiada), así que no hay que revertirlos, solo afinarlos. `reabrir()` debe seguir siendo síncrona por `irAPartida`. Agrega un toque más para editar una solicitud pendiente.
- **Verificar:**
  - Scroll con el dedo con desvío lateral sobre «Altura (cm)»: la cifra no cambia.
  - Un toque de 400 ms en un chip lo elige.
  - Un clic con 6 px de temblor no se pierde.
  - Un doble toque en «Generar PDF» abre una sola ventana.
  - Con rol ventas y la solicitud pendiente, «Editar» pregunta antes.
  - Seguir en verde: `defensas-del-cotizador.mjs`.

### Tanda 5 — Avisos en las cifras que mueven dinero

- **Qué:** P36.
- **IDs:** `formularios-2`, `formularios-6`, `formularios-7`.
- **Arreglos:**
  - Confirmar un precio autorizado fuera de rango (muy bajo, muy alto o negativo) antes de sellarlo.
  - Aviso de magnitud en línea para medidas y tarifas raras, sin toast y sin quitar el difuminado.
  - En Entrega, avisar si el teléfono tiene más de 10 dígitos. El paso 1 **no** se bloquea, por la decisión de `REVISAR-PAQUETE-UI.md:509`.
- **Archivos:** `js/cotizador/proceso.js` (`updPrecioAuth` ~754, `#a-precio` ~722), `js/cotizador/partidas.js` (inputs ~1710-1779) y `js/cotizador/entrega.js` (`telWhatsApp` ~112, `pistaWhatsApp` ~158).
- **Riesgo:** bajo, porque solo se agregan avisos. Los umbrales («inusual») los debe dar Elías.
- **Verificar:** sellar $1 pide confirmación. Una altura de 4000 cm muestra el aviso. Un teléfono de 12 dígitos muestra la advertencia en Entrega sin cambiar el destino.

### Tanda 6 — Historial, Clientes, IA y ventas en pantalla corta

- **Qué:** P04 y P41.
- **IDs:** `apoyo-1`, `layout-5`, `apoyo-7`, `apoyo-4`, `apoyo-5`.
- **Arreglos:**
  - En ≤560 px se oculta `.hist-ayuda` y el pie del Historial pasa a 4 botones en fila con el icono arriba.
  - Reglas por alto (no por orientación) al final de `sistema.css` para que la lista de Historial y Clientes no llegue a 0.
  - IA: la variante F4 (solo JS en `ia.js`). El arreglo original oculta la propia ficha.
  - Pie pegajoso para Registrar venta y Revisión remota.
  - Tocar fuera ya no descarta lo escrito si hay cambios.
- **Archivos:** `css/sistema.css` (bloque `.hist-*` ~1727, 2327, 2530, 5857; `.rv-footer` ~2276), `cotizador.html` (609, 656, 672, 1111, 1233), `js/cotizador/ia.js` (284, 312), `js/cotizador/venta.js` (120) y `js/cotizador/notario.js` (558).
- **Riesgo:** bajo a medio. El pie del Historial en el teléfono revierte una decisión documentada (`sistema.css` ~2530): hay que mostrárselo a Elías. `#climodal` comparte `.hist-ayuda`, así que hay que usar el selector `#histmodal`.
- **Verificar:** con 14 cotizaciones, a 360×640, 375×667, 844×390 y 667×375, la lista de Historial es de 120 px o más y el pie no se sale del panel. IA durante el análisis a 360×640: se ven «Cancelar» y el estado. Registrar venta: el botón queda a la vista. Seguir en verde: `cot-historial.mjs` y `cot-entrega.mjs`.

### Tanda 7 — Escalador y Vectorizador en el teléfono

- **Qué:** P05, P44 y la parte `.tool-seg` de P25.
- **IDs:** `apoyo-2`, `apoyo-3`, `apoyo-8`, `apoyo-6`.
- **Arreglos:**
  - Mover `#vt-go` al final de la primera sección y la fila SVG/PNG a «Exportar» (el pie pasa de 236 a 182 px).
  - Quitar `.sp-back-m` del pie en ≤1000 px.
  - Agregar `scUpdateList()` en `scResetCalib(full)`.
  - `.tool-seg button{min-height:44px}` en el bloque táctil de cierre.
- **Archivos:** `cotizador.html` (782-877, 1034-1040), `css/sistema.css` (2131-2210, 2997, ~6456) y `js/cotizador/escalador.js` (1772).
- **Riesgo:** bajo a medio. Si «Ajustes del trazo» se pliega, se rompen pruebas de `cot-vector.mjs` (líneas ~193-669), que tendrían que abrir el pliegue primero. «Volver» deja de estar al alcance del pulgar: queda «← Cotizador» arriba y el gesto Atrás. Hay que avisarle a Elías.
- **Verificar:** a 390×844 y 360×640, «Vectorizar» visible sin desplazar. Ventana del panel sobre el pie: más de 150 px. Re-calibrar vacía la lista. Los botones de herramienta miden 44 px.

### Tanda 8 — Letra, tamaños táctiles y teclado en el teléfono

- **Qué:** P19, P20, P25 (`tactil-5`), P28 y P34.
- **IDs:** `tipocolor-1`, `a11y-7`, `tipocolor-6`, `tipocolor-3`, `tactil-5`, `tactil-4`, `flujo-9`, `formularios-8`, `tactil-9`.
- **Arreglos:**
  - Subir a `var(--t2)` los botones de tipo, chips y precios en ≤560 px y en 561–920 px.
  - `.rv-calc-item` a `--t1`.
  - `font-family:inherit` en los botones.
  - Mínimos de 44 px en el bloque táctil.
  - Un bloque de color en `:active` tras «Menos movimiento».
  - `enterkeyhint` más Enter que avanza en los campos del cliente y de la partida.
- **Archivos:** `css/sistema.css` (~2580, ~2601, ~6108, 2273, 2318, 1643, ~6510, ~7189), `cotizador.html` (321-350) y `js/cotizador/partidas.js` (plantillas de los campos), además de `arranque.js` para Enter.
- **Riesgo:** bajo a medio. Son cambios visuales en todo el teléfono, así que hay que mandarle capturas a Elías antes de fusionar. El selector de tipo con letra más grande puede envolver el texto a 320 px: hay que medirlo.
- **Verificar:** a 390 px, chips de 12,5 px o más y ningún botón en Arial (CDP `getPlatformFontsForNode`). Los controles de la lista miden 44 px. Enter en `#f-tel` lleva a `#f-cli`. `contraste.mjs` en verde.

### Tanda 9 — El papel del cliente: textos y enlaces (requiere el visto bueno de Elías en la redacción)

- **Qué:** P49, P47, el gris de P48 y P40.
- **IDs:** `cliente-7`, `cliente-3`, `cliente-2`, `cliente-6`, `cliente-5`, `cliente-9`, `flujo-7`.
- **Arreglos:**
  - Redactar la excepción de $60,000 tomando la cifra de `ANTICIPO_EXCEPCION`; nada de «por escrito», porque nadie lo decidió.
  - Vigencia y siguiente paso en la hoja 1 y en el mensaje de WhatsApp.
  - Enlaces `<a>` en el pie (WhatsApp, mapa) y en la verificación.
  - Contacto de AL3D en `verificar.html`.
  - `--ink3` pasa a `#686e85`.
  - «cm alt.» con espacio y los kelvin fuera del papel.
  - Solo los tres cambios de texto que propone el verificador en flujo-7 (no el glosario).
- **Archivos:** `js/cotizador/entrega.js` (EMPRESA ~87, `mensajeWhatsApp` ~168, `verificacionHTML` ~674, `desc`/`med` ~735-773, `footer` ~1118, TERMINOS ~1195, `:root` ~1246, `.pago` ~1753), `verificar.html`, `css/publico.css` y los textos de `nucleo.js`/`proceso.js`/`partidas.js` que cita flujo-7.
- **Riesgo:** bajo en lo técnico y alto en el negocio: los términos están documentados como «palabra por palabra» de Canva. Una línea más en la tarjeta de totales rompe el presupuesto de `repartir()` si no se suma a `ALTO_TOT`. Elías tiene que confirmar el enlace de Maps de Canva.
- **Verificar:** el PDF tiene anotaciones `/Link` (hoy 0) y el mismo número de hojas. La columna 1 de Términos cabe (`y ≤ 825`). `pdf-hoja-carta.mjs` y `publicas.mjs` en verde. Actualizar `docs/ESTRUCTURA-COTIZACION-CANVA.md`.

### Tanda 10 — El papel del cliente: paginación y tamaño de letra

- **Qué:** P46 y la letra de P48.
- **IDs:** `cliente-1`, `cliente-4`.
- **Arreglos:**
  - Mandar el plano a su propia hoja **solo** cuando eso ahorra una hoja de cotización.
  - Subir la escala del papel: cuerpo de 11 px y términos de 12 px, recalibrando `altoFila()`.
- **Archivos:** `js/cotizador/entrega.js` (`generarPDF`: `ALTO_IMG` ~874, `ALTO_TBODY_ULT` ~906, `repartir` ~938, `<style>` del documento ~1233-1587) y `docs/FUNCIONES.md:195`.
- **Riesgo:** medio. Sin recalibrar `altoFila()`, la holgura de la hoja intermedia baja a ~19 px. Con la recalibración, en ~3 de 9 casos sale una hoja física más. Con 1 a 4 partidas (la gran mayoría; la mediana real es 1) el documento sale idéntico.
- **Verificar:** con plano y n = 4 a 9 partidas, la hoja 1 tiene los totales o va llena. Con 1 partida, el PDF es idéntico al de hoy. Ningún desborde con 14 filas de 160 caracteres.

### Tanda 11 — Tema oscuro y modos de contraste

- **Qué:** P16, P15, P17 y la parte `prefers-contrast` de P14.
- **IDs:** `a11y-4`, `tema-2`, `tema-4`, `tema-5`, `tema-8`, `a11y-5`, `tema-1`, `tema-3` (parte B), `tema-6`, `tema-9`.
- **Arreglos:**
  - Tokens de noche en `vidrio.css` (`--cv-relleno`).
  - `.salto{background:var(--sup)}`.
  - Pastilla de rol de noche acotada a la barra del cotizador.
  - `.paso-tab.on` de noche con `--a`.
  - Un bloque `@media (forced-colors:active)` al final de `sistema.css`.
  - Logo propio en oscuro sin placa fija.
  - Logo de la casa al imprimir.
  - **Correr `contraste.mjs` también en oscuro.**
- **Archivos:** `css/vidrio.css` (l.72-126, 163), `css/sistema.css` (547, 571, 1852, 2714, 4840, 6376, 6414-6437, final), `js/tema.js` (130-136) y `pruebas/navegador/contraste.mjs` (l.105).
- **Riesgo:** bajo. Casi todo va dentro de `@media` o del bloque oscuro. `hojas-de-estilo.mjs` vigila el orden de las hojas: no hay que moverlas.
- **Verificar:** `contraste.mjs` en claro y en oscuro sin fallas (fuera de lo deshabilitado). Con `forcedColors:'active'` se ven el interruptor, la barra de completitud y lo elegido. Impresión en oscuro con el logo completo.

### Tanda 12 — Rendimiento de fondo (sin prisa)

- **Qué:** P10, P13 y P12 (menos fuentes), y P11 (minificar) si Elías acepta un paso de compilación.
- **IDs:** `rendimiento-5`, `rendimiento-6`, `rendimiento-4`, `rendimiento-7`, `rendimiento-9`, `rendimiento-3`.
- **Arreglos:**
  - No repintar el resumen en cada tecla cuando el total no cambia.
  - Repintar solo la partida tocada.
  - Que el esqueleto no destape un formulario muerto.
  - `cache:'no-cache'` en lugar de `'reload'` en `sw.js` (una línea en dos sitios).
  - Tope de 3 s a la red para el logo cuando hay copia en caché.
  - Minificar al publicar.
- **Archivos:** `js/cotizador/partidas.js` (304, 1029-1147), `js/cotizador/proceso.js` (78, 2420), `cotizador.html` (92-100), `js/cotizador/arranque.js` (60) y `sw.js` (237, 261, 520), más el flujo de publicación (GitHub Pages / Cloudflare Pages).
- **Riesgo:** de bajo (sw.js) a medio (repintado parcial). Minificar es una decisión de proceso: hoy se publica sin compilar.
- **Verificar:** con 30 partidas, tocar un chip cambia solo esa partida. Cada tecla con total mayor a $0 tarda menos de 16 ms de procesamiento a CPU ×4. Una versión nueva baja solo lo que cambió (revisar en las DevTools del SW). Los tiempos de `defer` hay que medirlos **en la ruta real** (`/#/cotizador` dentro de la plataforma), no en `?solo=1`: los verificadores de rendimiento-2 y rendimiento-3 midieron con resultados opuestos.

---

## 4. Lo que conviene NO hacer, o dejar para después

### No hacer (el verificador lo desaconseja o no vale lo que cuesta)

- **`layout-8`** (espaciado de 4/8 px no sistemático): es limpieza de medio píxel que no se nota y toca medio CSS. Si algún día se hace, solo la primera entrega «segura» que propone el verificador.
- **`tipocolor-8`** (17 tamaños contra 7 tokens): igual, una limpieza invisible para el vendedor. Lo único visible es un icono.
- **`rendimiento-8`** (purgar el CSS no usado): el propio hallazgo concluye que no conviene. El CSS sin usar casi no cuesta. Lo que pesa son los comentarios (P11).
- **`rendimiento-2`** (`defer` como arreglo de la primera visita): en la ruta real no mejora y en las corridas del verificador empeoró de 0,8 a 1,5 s. Se vuelve a medir dentro de la Tanda 12.
- **`flujo-10`** (cambiar el dock tras entregar): el verificador dice no aplicarlo. No hay que tocar `hecho[4]`, `--avance` ni la etiqueta «entregada».
- **`tactil-6`** (fila de iconos de 38 px): es una excepción documentada (`SISTEMA-DE-DISENO.md` §4.5), pasa WCAG 2.5.8 y el arreglo propuesto no se debe aplicar.
- Dentro de otros grupos: **no** adoptar el glosario de 5 palabras de `flujo-7` ni renombrar «sellar». **No** bloquear el paso 1 por los teléfonos de 11 a 15 dígitos (`formularios-7`). **No** quitar el difuminado de importes al enfocar (`formularios-6`). **No** cambiar solo los tres selectores azules de `tipocolor-7`.

### Dejar para después (bajos, de poco valor o con decisión pendiente)

- `layout-7`: de lo propuesto, solo es seguro compactar «Complejidad» (−50 px). Ocultar `.psum` no es gratis.
- `a11y-6`/`formularios-5`: texto de error junto al campo. El verificador lo marca como opcional y de baja prioridad.
- `flujo-6`: recargar a mitad de la captura. El dock y la pestaña 4 ya compensan.
- `formularios-9`: bloque «Datos del PDF».
- `tipocolor-4`: solo los `aria-hidden` baratos; 🌅/❄️ son una decisión de Elías.
- `tipocolor-5`: solo la parte A, el cambio de una palabra.
- `tipocolor-7`: solo `.autoctr .cnt` a `--tinta2`.
- `tipocolor-9` y `tipocolor-10`.
- `tema-7`: «solo si Elías quiere pulirlo».
- `rendimiento-10`: fuentes propias. Opcional y de la prioridad más baja; la caché HTTP ya las sirve sin red.
- `a11y-8`/`apoyo-10`: si se hace algo, solo la parte barata, los botones [−]/[+] para mover guías en `scUpdateGuideList`. El teclado completo del lienzo es L.
- `apoyo-9`: guardar las medidas del Escalador. Es L y no se ha pedido.
- `cliente-8`: **primero la pregunta de negocio**: ¿el cliente debe recibir la orden de trabajo, la de instalación y el recibo? Si sí (como en Canva), basta con avisarlo en la app.

---

## 5. Apéndice: los 96 IDs → problema → tanda

| ID | Sev. final | Esf. | Problema | Tanda |
|---|---|---|---|---|
| `layout-1` | alta | S | P01 | 0 |
| `rendimiento-1` | alta | S | P09 | 0 |
| `a11y-1` | media | S | P14 | 1 |
| `a11y-2` | media | M | P01 | 0 (resto en 2) |
| `a11y-3` | media | S | P03 | 2 |
| `apoyo-1` | media | M | P04 | 6 |
| `apoyo-2` | media | M | P05 | 7 |
| `apoyo-3` | media | M | P05 | 7 |
| `cliente-1` | media | M | P46 | 10 |
| `cliente-2` | media | S | P47 | 9 |
| `cliente-4` | media | M | P48 | 10 |
| `cliente-7` | media | S | P49 | 9 |
| `flujo-1` | media | S | P29 | 1 |
| `flujo-2` | media | S | P30 | 1 |
| `flujo-3` | media | M | P33 | 4 |
| `flujo-5` | media | M | P02 | 3 |
| `flujo-8` | media | S | P02 | 3 |
| `formularios-1` | media | S | P32 | 1 |
| `formularios-3` | media | M | P02 | 3 |
| `layout-2` | media | S | P03 | 2 |
| `layout-3` | media | S | P06 | 1 |
| `layout-4` | media | M | P02 | 3 |
| `layout-5` | media | M | P04 | 6 |
| `layout-9` | media | S | P02 | 3 |
| `rendimiento-3` | media | M | P11 | 12 |
| `tactil-1` | media | S | P26 | 4 |
| `tema-3` | media | M | P14 | 1 (parte B en 11) |
| `tipocolor-1` | media | S | P19 | 8 |
| `tipocolor-2` | media | S | P18 | 1 |
| `a11y-4` | baja | S | P16 | 11 |
| `a11y-5` | baja | S | P15 | 11 |
| `a11y-6` | baja | M | P35 | Después |
| `a11y-7` | baja | M | P19 | 8 |
| `a11y-8` | baja | L | P43 | Después |
| `a11y-9` | baja | M | P42 | 3 |
| `a11y-10` | baja | S | P18 | 1 |
| `apoyo-4` | baja | S | P04 | 6 |
| `apoyo-5` | baja | S | P41 | 6 |
| `apoyo-6` | baja | S | P25 | 7 |
| `apoyo-7` | baja | S | P04 | 6 |
| `apoyo-8` | baja | S | P44 | 7 |
| `apoyo-9` | baja | L | P45 | Después |
| `apoyo-10` | baja | L | P43 | Después |
| `cliente-3` | baja | S | P49 | 9 |
| `cliente-5` | baja | S | P48 | 9 |
| `cliente-6` | baja | S | P47 | 9 |
| `cliente-8` | baja | M | P50 | Después (pregunta) |
| `cliente-9` | baja | S | P40 | 9 |
| `flujo-4` | baja | S | P31 | 4 |
| `flujo-6` | baja | M | P37 | Después |
| `flujo-7` | baja | M | P40 | 9 |
| `flujo-9` | baja | S | P34 | 8 |
| `flujo-10` | baja | S | P38 | No hacer |
| `formularios-2` | baja | M | P36 | 5 |
| `formularios-4` | baja | S | P30 | 1 |
| `formularios-5` | baja | M | P35 | Después |
| `formularios-6` | baja | S | P36 | 5 |
| `formularios-7` | baja | S | P36 | 5 |
| `formularios-8` | baja | S | P34 | 8 |
| `formularios-9` | baja | S | P39 | Después |
| `layout-6` | baja | S | P02 | 0 (parcial) y 3 |
| `layout-7` | baja | M | P07 | Después |
| `layout-8` | baja | M | P08 | No hacer |
| `rendimiento-2` | baja | S | P11 | No hacer |
| `rendimiento-4` | baja | S | P13 | 12 |
| `rendimiento-5` | baja | M | P10 | 12 |
| `rendimiento-6` | baja | M | P10 | 12 |
| `rendimiento-7` | baja | M | P12 | 12 |
| `rendimiento-8` | baja | L | P11 | No hacer |
| `rendimiento-9` | baja | S | P12 | 12 |
| `rendimiento-10` | baja | S | P12 | Después |
| `tactil-2` | baja | S | P26 | 4 |
| `tactil-3` | baja | S | P30 | 1 |
| `tactil-4` | baja | S | P28 | 8 |
| `tactil-5` | baja | S | P25 | 8 |
| `tactil-6` | baja | S | P25 | No hacer |
| `tactil-7` | media (reportado por Elías) | S | P26 | 0 (hecho) |
| `tactil-8` | baja | S | P27 | 4 |
| `tactil-9` | baja | S | P34 | 8 |
| `tema-1` | baja | S | P15 | 11 |
| `tema-2` | baja | S | P16 | 11 |
| `tema-4` | baja | S | P16 | 11 |
| `tema-5` | baja | S | P16 | 11 |
| `tema-6` | baja | S | P17 | 11 |
| `tema-7` | baja | S | P16 | Después |
| `tema-8` | baja | S | P16 | 11 |
| `tema-9` | baja | S | P17 | 11 |
| `tema-10` | baja | S | P42 | 3 |
| `tipocolor-3` | baja | S | P20 | 8 |
| `tipocolor-4` | baja | S | P21 | Después |
| `tipocolor-5` | baja | S | P22 | Después |
| `tipocolor-6` | baja | S | P19 | 8 |
| `tipocolor-7` | baja | S | P22 | Después |
| `tipocolor-8` | baja | L | P23 | No hacer |
| `tipocolor-9` | baja | S | P24 | Después |
| `tipocolor-10` | baja | M | P22 | Después |

Totales del apéndice: 96 IDs → 50 problemas. Por tanda (contando cada ID en su tanda principal): T0 4 (incluye `layout-6`, cuyo resto va en la 3) · T1 10 · T2 2 · T3 7 · T4 6 · T5 3 · T6 5 · T7 4 · T8 9 · T9 7 · T10 2 · T11 9 · T12 6 · Después 16 · No hacer 6 = 96.
