No creé, modifiqué ni borré nada en Canva. Solo lectura.

# La cotización AL3D tal como se entrega hoy

Leídas **25 cotizaciones reales** de Canva —las 25 más recientemente modificadas, del
2/jun/2026 al 22/ago/2026— más la `Plantilla Cotizaciones` maestra. **124 páginas** en total,
página por página, en imagen renderizada.

Por qué en imagen y no por API: la tabla de partidas es un elemento `sheet` de Canva y
**su contenido no lo expone la API**. `read-design` con transacción abierta devuelve la
geometría de la tabla —filas, columnas, altos— pero las celdas vienen vacías. Lo único que
enseña las partidas, las medidas y los totales es el render. Y `export-design` no sirve aquí:
`export-download.canva.com` está bloqueado por la política de egreso de la organización.

Las 25: Cliente 01 · Cliente 02 · Cliente 03 · Cliente 04 · Cliente 05 ·
Cliente 06 · Cliente 07 · Cliente 08 · Cliente 09 · Cliente 10 · Cliente 11 · Cliente 12 · Cliente 13 · Cliente 14 · Cliente 15 · Cliente 16 ·
Cliente 17 · Cliente 18 · Cliente 19 · Cliente 20 · Cliente 21 · Cliente 22 ·
Cliente 23 · Cliente 24 · Cliente 25.

---

## 1. Lo primero, porque cambia el modelo de datos

**Una cotización AL3D no es un documento: es un expediente que crece.** El vendedor duplica la
hoja de cotización y edita la copia, así que un mismo diseño de Canva acumula **varias
versiones del mismo proyecto a distintos precios**, cada una en su propia hoja, con su propia
fecha, su propia nota y sus propias fotos.

| Cotización | Hojas de cotización | Precios ofrecidos |
|---|---|---|
| Cliente 01 | 3 | $XX,XXX · $XX,XXX · $XX,XXX |
| Cliente 03 | 4 | $X,XXX · $XX,XXX · $XX,XXX · $XX,XXX |
| Cliente 16 | 3 | $X,XXX · $XX,XXX · $XX,XXX |
| Cliente 19 | 3 | $XX,XXX · $XX,XXX · $XX,XXX |
| Cliente 25 | 3 | $X,XXX · $XX,XXX · $X,XXX |
| Cliente 04 | 2 | $X,XXX · $X,XXX |
| Cliente 08 | 2 | $XXX,XXX · $XX,XXX |

**14 de las 25 traen más de una hoja de cotización.** Y las versiones **no van en orden
cronológico**: en Cliente 03 las de 31/jul están *después* de las de 20/ago. Se apilan
como se van creando, no como se cuentan.

El cotizador no tiene concepto de esto. Cada cotización es un folio con un precio. La forma en
que el vendedor vende —tres precios sobre la mesa, «este sin luz, este con luz posterior, este
con luz frontal»— hoy no cabe en el modelo.

## 2. La secuencia de páginas

Ninguna cotización sigue una plantilla fija. Esta es la estructura real, con la cuenta exacta:

| # | Tipo de hoja | En cuántas de las 25 | Obligatoria |
|---|---|---|---|
| 1 | **Cotización** (tabla + totales + nota + imágenes) | 25/25 | sí |
| 2 | **Términos y condiciones** | 25/25 | sí |
| 3 | **Orden de trabajo** (tabla SIN precios + sello de límite) | 7/25 | no |
| 4 | **Límite de fabricación** (hoja suelta, plantilla) | 18/25 — **las 18 en blanco** | no |
| 5 | **Orden de instalación** (hoja suelta, plantilla) | 25/25 — **las 25 en blanco** | no |
| 6 | **Propuesta visual** (solo imágenes, sin tabla ni precios) | 2/25 | no |
| 7 | **Recibo de pago** (2 recibos + talones) | 1/25 | no |

Tres cosas de esa tabla importan mucho:

**Los términos van en medio, no al final.** En Cliente 03 son la página 3 de 7; en
Cliente 19 la 2 de 6; en Cliente 13 la 4 de 6. Quedan enterrados entre versiones de
cotización porque las hojas nuevas se insertan antes.

**Las hojas 4 y 5 se entregan en blanco.** Las 25 cotizaciones traen la hoja de *Orden de
instalación* con los placeholders de la plantilla vivos: `Fecha 6 ago 2025`,
`Proyecto: ///////////`, `Dirección: ///////////`, `Teléfono: ///////////`,
`Entre calles: ///////////`. Y 18 traen igual la de *Límite de fabricación*, con
`MIERCOLES 05 DE MARZO` impreso en verde y rojo. **Es decir: en el paquete que recibe el
cliente van una o dos hojas con fecha de 2025 y campos rellenos de diagonales.**

Esto el cotizador ya lo resolvió: `hayLimite` y `hayInstal` no imprimen la hoja si no hay dato.
Es el único punto donde el cotizador ya es mejor que el original, y conviene no perderlo.

**La orden de trabajo es lo que el «Límite de fabricación» quería ser.** No es una hoja con una
fecha en medio: es **una copia de la cotización con las columnas de precio borradas**, con el
sello del límite estampado, y con el plano y las fotos. Es la hoja del taller. Aparece en
Cliente 04, Cliente 05, Cliente 06, Cliente 11, Cliente 12, Cliente 14 y Cliente 25.

```
Encabezado (logo · Fecha · Proyecto/Dirección)
Tabla de TRES columnas:  Descripción:  |  Medidas:  |  Pzas.
Nota:
      ┌──────────────────────┐
      │  Limite Fabricación  │   ← verde
      │      JUEVES          │   ← rojo sobre verde
      │  27 DE AGOSTO        │   ← verde
      └──────────────────────┘
Plano cotado + fotos
Pie
```

El orden de la Nota y el sello **se invierte según la hoja**: en Cliente 04 y Cliente 06 va
Nota → sello; en Cliente 12 y Cliente 25 va sello → Nota. No hay convención.

## 3. La hoja de cotización, bloque por bloque

Carta vertical, 816 × 1056 px. Cinta curva azul degradada en la esquina superior derecha.

```
┌─ logo AL3D ──────────────────────── [Fecha][21 ago 2026] ─┐
├─ regla azul ──────────────────────────────────────────────┤
│ [Proyecto:][ Contacto - Cliente 01 ][Dirección][ DESCONOCIDA ]
├───────────────────────────────────────────────────────────┤
│ Descripción: │ Medidas: │ Pzas. │ Precio unitario │ Total │  ← thead azul
│ ...partidas...                                            │
│                              ┌──────────────────────────┐ │
│                              │ Subtotal:      $XX,XXX   │ │
│                              │ I.V.A           $X,XXX   │ │
│                              │ Total Neto:    $XX,XXX   │ │  ← azul sólido
│                              └──────────────────────────┘ │
│                        Nota:                              │  ← centrado, subrayado
│         El cliente debe proporcionar salidas eléctricas.  │
│                                                           │
│   ╔═══════════════════════════════════════════════════╗   │
│   ║   PLANO COTADO del anuncio  (cotas en rojo)       ║   │
│   ╚═══════════════════════════════════════════════════╝   │
│   ┌────────────────────┐  ┌────────────────────┐          │
│   │  FOTO instalado    │  │  FOTO instalado    │          │
│   └────────────────────┘  └────────────────────┘          │
├─ - - - - - - - - - - - - - - - - - - - - - - - - - - - - -┤
│  Vendedor:    │  Dirección Taller.       │  Whatsapp      │
│  Elias Guerrero  Naranjos #648 Col. …    │  33-2813-0092  │
└─ barra azul ──────────────────────────────────────────────┘
```

### El bloque de imágenes es el corazón del documento

**22 de las 25 cotizaciones llevan imágenes del anuncio en la hoja de cotización.** No es
decoración: es lo que hace que el cliente entienda qué está comprando. Y **el cotizador no
imprime ninguna.**

Cinco formas distintas de armar ese bloque, todas presentes:

1. **Plano de línea cotado + 1 o 2 fotos** — el caso normal (Cliente 02, Cliente 11,
   Cliente 16, Cliente 20…). Cotas en rojo, en cm.
2. **Render a color con las cotas encima** — Cliente 10 (cotas en metros con decimales:
   0.52 / 1.42 / 0.18), Cliente 13 (foto real con cotas rojas rotuladas «1.20 MTS»).
3. **Render 3D arquitectónico del sitio completo** — Cliente 12: el modelo de la marquesina del
   local con el anuncio colocado y ocho cotas en metros anotadas a color sobre el render.
4. **Lámina de vistas ortográficas** — Cliente 06: fondo negro, tres vistas rotuladas en
   verde «VISTA FRONTAL» / «VISTA LATERAL» / «VISTA SUPERIOR», cada una con sus cotas.
5. **Rejilla 2×2 de plano+foto por producto** — Cliente 25, cuando la cotización cubre dos
   anuncios distintos.

Las unidades del plano **no son consistentes ni dentro de una misma hoja**: cm en la mayoría,
metros con decimales en Cliente 10 y Cliente 12, `MTS` en mayúsculas en Cliente 13, y
**milímetros en Cliente 18** («523 mm», «140 mm») en una hoja cuya tabla dice
«5.23m x 1.49m».

**Tres cotizaciones no llevan imagen:** Cliente 15 (dos hojas), Cliente 08 página 1 (la tabla de
siete partidas se come la hoja), y Cliente 23 lleva foto pero sin plano.

### Encabezado

- **No hay campo «Cliente»** y **no hay folio**. El nombre del contacto va dentro de
  `Proyecto:`, con la convención `Contacto - Negocio`: «Contacto - Cliente 01»,
  «Contacto - Cliente 02». Coincide con la convención de la base `Ventas - AL3D` de Notion.
  El cotizador sí imprime Cliente y Folio en su propio renglón — eso es una mejora, no una
  divergencia que haya que deshacer.
- El título del diseño y el campo `Proyecto:` **no siempre coinciden**: el diseño
  «Contacto - Fraccionamiento» dice `Proyecto: Cliente 05`. Y hay uno cuyo título
  arranca con el contacto vacío: `" - Cliente 13"`.
- **La `Dirección` casi nunca es una dirección.** De 25: **9 con dirección real**, y las otras
  16 con un literal que dice por qué no hay:

  | Literal | Veces |
  |---|---|
  | `DESCONOCIDA` | 11 |
  | `//////////` (placeholder sin llenar) | 3 |
  | `DESCONOCIDO` | 1 |
  | `ENTREGA EN TALLER` | 1 |
  | `SIN INSTALACION (ENTREGA EN TALLER)` | 1 |
  | `DESCONOCIDA (ENTREGA POR ENVIO-OCURRE)` | 1 |

  Y hay un patrón detrás: **la dirección se captura tarde**. En Cliente 11 la cotización dice
  `DESCONOCIDA` y la orden de trabajo, once días después, ya trae
  «Av. Dr. Roberto Michel 1003-Loc 002, La Aurora, 44460 Guadalajara, Jal.». La dirección no es
  un dato de la venta: es un dato de la instalación.

### La tabla de partidas

Columnas literales, en orden: `Descripción:` · `Medidas:` · `Pzas.` · `Precio unitario` ·
`Total`. Nunca cambian.

- **Rango de partidas por hoja: 1 a 7.** La mediana es 1. Cliente 08 es el techo con siete.
- **Celdas combinadas verticalmente.** Muy frecuente: 2 renglones de descripción comparten una
  sola celda de Medidas, una de Pzas y **un solo precio**. Son dos conceptos que se venden como
  uno (Cliente 03, Cliente 09, Cliente 10, Cliente 21, Cliente 22, Cliente 19 p4, Cliente 18 p2).
  El cotizador no puede expresar esto: cada partida lleva su propio importe.
- `Pzas.` es **1 en casi todas**. La única con piezas de verdad es Cliente 05: 8 señaléticas
  × $X,XXX = $X,XXX, y ahí sí cuadra el unitario.
- **`Medidas` es la huella completa del anuncio en metros**, formato `A.AAm x B.BBm` —
  «2.16m x 0.66m», «5.23m x 1.49m». No es la altura de letra. Variantes vistas:
  `0.80m diametro` (Cliente 07), `1.20 x 0.68 cms` (Cliente 13), `196km` (los viáticos de
  Cliente 08), y **dos hojas con la celda vacía** (Cliente 15).
- El cotizador imprime `{altura}cm alt.` para letras y `{ancho}×{alto} cm` para caja y
  bastidor. **No hay ni una cotización real que use ese formato.**

### Cómo se redacta una descripción

El patrón es siempre el mismo: **`Título en negrita:` + especificación técnica**, y la
especificación siempre cierra diciendo qué pasa con la luz.

Catálogo completo de lo que aparece, con la cuenta:

| Concepto (literal) | Veces | ¿lo cubre el cotizador? |
|---|---|---|
| `Letras Individuales 3D:` | 19 | **sí** |
| `Recorte de Acrílico Negro:` | 8 | sí (como «Recorte de Acrílico») |
| `Caja de luz:` / `Caja de Luz:` | 4 | **sí** |
| `Rotulación de Vinil:` | 5 | **no** |
| `Anuncio Tipo Nube:` | 3 | parcial (existe «Caja de Luz Tipo Nube») |
| `Anuncio Tipo Bandera "Doble vista":` | 3 | **no** |
| `Bastidor para Letras 3D:` | 1 | **sí** |
| `Señalética:` | 1 | **no** |
| `Viáticos e Instalación:` | 2 | **no** |
| `Letrero de Neón Flex:` | 1 | **no** |
| `Letrero de Acrílico:` | 1 | **no** |
| `Mantenimiento sobre letrero coexistente:` | 1 | **no** |
| `Mantenimiento de Letras Individuales 3D:` | 1 | **no** |
| `Caja de luz "DOBLE VISTA":` | 1 | **no** |

Materiales nombrados que **no están en el catálogo del cotizador**: `Aluminio Cepillado
(Brush)` —sí está como «al-brush» pero con otra redacción—, `Aluminio Espejo (CROMO)`,
`Aluminio Dorado Cepillado`, `Aluminio Negro/Amarillo`, `Aluminio Pintado color Azul`,
`Acrílico Espejo Dorado`, `Lámina Galvanizada` con rotulación de vinil.

Y **el volumen/grosor se dice explícito en 14 descripciones**: «volumen de 5cm», «de 6cm»,
«de 6.7cm», «de 7cm», «de 8cm», «grosor de 5cm», «de 6mm». El cotizador no captura el volumen
de la letra. Es dato de fabricación y de precio, y va escrito en el papel.

La iluminación se redacta de nueve formas distintas: `con Iluminación Led Fría` ·
`ILUMINACION LED CALIDA O FRIA` · `Iluminacion Led Posterior Calida` ·
`iluminación Led Calida Posterior` · `Iluminacion Posterior Fria/Calida` ·
`iluminación Led Frontal Fria` · `Iluminación Led Interior Fría` · `SIN ILUMINACION LED` ·
`Sin Iluminacion Led`. El cotizador emite dos: «con Iluminación LED Cálida (3000K)» /
«Fría (6500K)» y «sin iluminación». **Los kelvin no aparecen en ninguna cotización real.**

**El paréntesis subrayado que dice el alcance.** Cuando una partida cubre solo parte del
rótulo, se anota entre paréntesis y subrayado dentro de la descripción:

- `(SOLO TEXTO "MERO")` y `(EL RESTANTE DE ELEMENTOS)` — Cliente 21
- `(MERO, LINEAS, RAYOS, ESTRELLAS Y PUNTOS)` y `(Lonches, Burritos, Aguachiles)` — idem, otra hoja
- `(TODA LA ILUMINACION ES POSTERIOR)` — Cliente 01
- `(rotulacion de vinil café para textos "Café & Brunch")` — Cliente 12

### Totales

Tres renglones, siempre los mismos, pegados a la derecha bajo las dos últimas columnas:
`Subtotal:` · `I.V.A` (sin punto final, a diferencia del `I.V.A.` del cotizador) ·
`Total Neto:` en azul sólido con texto blanco.

- **IVA en 25 de 25.** Nunca se emitió una sin IVA. El interruptor `Q.iva` del cotizador existe,
  pero en la práctica siempre va encendido.
- **No existe renglón de anticipo, ni de resta al entregar, ni de descuento.** El cotizador
  imprime «Anticipo para arrancar» y «Resta al entregar» cuando `Q.anti > 0`, y el renglón de
  «Descuento» cuando el autorizador **bajó** el precio. Nada de eso está en Canva. El 50/50
  vive solo en los términos. Cuando el autorizador **subió** el precio, el cotizador tampoco
  imprime nada: el aumento va repartido entre las partidas y los tres renglones de abajo son
  los mismos tres de Canva (ver `preciosCliente()` en el modelo de datos, §9.5).
- **La aritmética falla en 4 de 25.** En dos hojas el IVA impreso no es el 16 % del subtotal,
  y en otras dos el subtotal no es la suma de sus propias partidas. Son celdas tecleadas a
  mano: nada las suma.
- Y hay dos hojas **entregadas sin precio**: Cliente 17 p2 con `Pzas 0`, `$0.00`,
  `Total Neto $0.00`, y Cliente 25 p4 con la segunda partida sin importe.

### La nota

Bloque centrado, `Nota:` en negrita y subrayado, luego 1 a 4 renglones. **24 de 25 la traen**
(Cliente 13 es la única sin nota). Es el campo más usado del documento y el que más trabaja.

Las recurrentes:

| Texto | Veces |
|---|---|
| `El cliente debe proporcionar salidas eléctricas.` | 14 |
| `No incluye iluminacion led.` / `El proyecto no incluye iluminacion led.` | 5 |
| `Ningun elemento tiene iluminacion led.` | 3 |

Y las de una sola vez, que es donde se ve para qué sirve de verdad:

- «Solo 1 de los 2 conceptos tiene iluminacion Led.»
- «Se ilumina el frente de» — *frase cortada, así se entregó*
- «La iluminacion refleja hacia la pared.»
- «Texto "Movement Community" no tiene iluminacion y su volumen es de 6mm»
- «Este concepto incluye unicamente la desinstalacion de los proyectos que estan instalados en la fachada del cliente (no incluye pintura ni resane)»
- «El proyecto no incluye instalacion, se hace entrega en fraccionamiento o recoleccion en nuestro taller.»
- «No incluye base para instalar, se instalan directo sobre pared»
- «El cliente proporciona todos los archivos editables de los diseños»
- «Probablemente sea necesario engrosar un poco los textos para que el modulo led pueda caber en los elementos»
- «**La nueva actualizacion del vinil tiene 3 veces mas de area que el cotizado anteriormente.**» — en negrita
- «Se recomienda adquirir una fotocelda para prolongar la vida util de los modulos led.»
- «Se debe confirmar la altura del letrero.» / «No se hace cambio de iluminacion, pura lona.»
- «Se incluye el numero "3" Numero Residencial de 15cm»

Cuatro familias: **requisito al cliente**, **exclusión de alcance**, **aclaración técnica de
qué se ilumina y qué no**, y **recomendación comercial**. El cotizador tiene `Q.notaCliente`
como texto libre con «El cliente debe proporcionar salidas eléctricas.» por omisión: la pieza
está, y el default es exactamente el más usado.

En Cliente 22 la nota **contradice la descripción**: la partida dice «con Iluminación Led
Fría» y la nota dice «No incluye iluminacion led».

### El pie

Tres columnas separadas por línea punteada, cada una con etiqueta en negrita y valor
subrayado con hipervínculo:

```
Vendedor:          Dirección Taller.                        Whatsapp
Elias Guerrero     Naranjos #648 Col. Lindavista Cp. 45169   33-2813-0092
                   → maps.app.goo.gl/FzVpPua2GLdefH1t5       → wa.me/523328130092
```

En la hoja de términos el pie cambia a dos columnas: `Whatsapp` y `Direccion Oficina`
(sin acento en «Direccion», tal cual). **No hay numeración de hojas en ninguna cotización.**
El cotizador ya imprime «Hoja X de Y · FOLIO», que es una mejora real: un juego de hojas
desordenado sobre un escritorio no se vuelve a armar.

## 4. Términos y condiciones

Ocho apartados en dos columnas. El cotizador ya los reproduce **palabra por palabra**, con dos
diferencias de redacción a favor del cotizador (corrige «mas IVA» → «más IVA» y desarrolla
«Se atiende según disponibilidad del equipo»). Los ocho títulos: Pagos y Facturación ·
Requisitos para Instalación · Modificaciones · Garantías · Cancelaciones y Penalizaciones ·
Uso y Responsabilidad · Permisos · Consentimiento y Uso de Imágenes.

Aquí no hay nada que cambiar.

## 5. El recibo de pago

Una sola cotización lo trae (Cliente 13, página 3) y es el hallazgo más aprovechable, porque
conecta con algo que el cotizador **ya calcula** y hoy no puede entregar.

Dos recibos por hoja, cada uno con su talón desprendible a la izquierda:

```
┌ TALÓN ─────┬ ─────────────────────────────────────────────────────┐
│ [logo]     │  [logo]   Recibo de Pago                    [Fecha]  │
│ TALÓN —    │  ───────────────────────────────────────────────────  │
│ COPIA      │  Concepto:  ☐ Anticipo   ☐ Liquidación               │
│ NEGOCIO    │  Recibí de: ______________________________________   │
│            │  La cantidad de $ ________________________________   │
│ FECHA      │  (con letra): ____________________________________   │
│ ────────   │  Proyecto: _______________________________________   │
│ CLIENTE    │  Forma de pago: ☐ Efectivo ☐ Transferencia ☐ Tarjeta │
│ ────────   │  Saldo pendiente: $ ______________________________   │
│ MONTO $    │                                                      │
│ ────────   │  ______________          ______________              │
│            │  Entregué (cliente)      Recibí — AL3D               │
│ Conserve   │  Este recibo no sustituye comprobante fiscal ·        │
│ este talón.│  Whatsapp 33-2813-0092                               │
└────────────┴──────────────────────────────────────────────────────┘
```

Los campos son exactamente el par Anticipo/Liquidación de la base `Ventas - AL3D` de Notion, y
«Saldo pendiente» es la «Resta al entregar» que el cotizador ya imprime en los totales.

## 6. Lo que hay que cambiarle al cotizador

Ordenado por lo que más se nota en el papel.

| # | Hueco | Evidencia | Qué hacer |
|---|---|---|---|
| 1 | **El PDF no imprime ninguna imagen** | 22/25 llevan plano y/o fotos | Imprimir `Q.aiFile` después de la Nota en la última hoja. La app ya la tiene, y la foto del escalador ya viene **con cotas**: es exactamente lo que pegan en Canva. |
| 2 | **La «Hoja de límite de fabricación» no existe en la realidad** | 7/25 usan orden de trabajo; 0/25 usan una hoja suelta con la fecha | Convertirla en **orden de trabajo**: tabla sin las dos columnas de precio + sello del límite + imagen. |
| 3 | **No hay recibo de pago** | 1/25 lo trae, y el cotizador ya calcula anticipo y resta | Hoja nueva con 2 recibos + talones, con Proyecto y Cliente ya impresos. |
| 4 | **El formato de `Medidas` no coincide** | 0/25 usan `{altura}cm alt.` | Imprimir la huella del anuncio en metros, `A.AAm × B.BBm`, y dejar la altura de letra como dato secundario. |
| 5 | **Falta el volumen de la letra** | 14/25 lo dicen en la descripción | Campo de volumen/grosor por partida, que entre en la descripción. |
| 6 | **Conceptos sin catálogo** | vinil 5, bandera 3, nube 3, viáticos 2, señalética 1, neón 1, mantenimiento 2 | Hoy caben en la partida manual. Poner tarifa a cada uno **es decisión de negocio**: no la invento. Lo que sí conviene es que la partida manual acepte un título en negrita, para que se lea como las demás. |
| 7 | **Los kelvin no se usan** | 0/25 mencionan 3000K/6500K | Quitarlos de la descripción, o dejarlos solo si el vendedor los pide. |
| 8 | **`I.V.A.` con puntos** | 25/25 imprimen `I.V.A` | Detalle de un carácter. |
| 9 | Sin concepto de versiones | 14/25 traen 2-4 precios del mismo proyecto | Cambio de modelo, no de PDF. Queda planteado, no resuelto. |

Y lo que **el cotizador ya hace mejor y no hay que tocar**: no imprime hojas vacías (25/25 de
las de Canva salen con placeholders de 2025), numera las hojas, trae folio y cliente, suma la
tabla de verdad (4/25 de las de Canva no cuadran), y bloquea autorizar sin precio
(2/25 de las de Canva se entregaron en ceros).
