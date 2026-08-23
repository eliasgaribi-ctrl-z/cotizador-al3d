# Arquitectura de la plataforma centralizada AL3D
### Google como base de datos, API y motor de automatización · v1, 22/ago/2026

---

## 1. TESIS

La copia (B) del Notion —`AL3D | Anuncios Luminosos (OMAR)`— ya es exactamente la plataforma que se está pidiendo: tiene calendario de entregas e instalación, mapa por `Ubicación entrega`, `Tipo de proyecto` de 7 valores, `Tiempo de entrega`, relación a clientes y hasta el clima embebido. Y tiene **`Tipo de proyecto` lleno en 0 de 142 filas, `Cliente` en 0 de 142, y `Registro de clientes` con 1 fila**, congelada el 03/dic/2025, mientras el trabajo real siguió en la copia (A) con el esquema simple hasta el 20/ago/2026. Eso no es un fracaso de diseño de esquema: es la prueba de que en este negocio **todo campo que exija que alguien lo escriba se queda vacío y se lleva consigo el módulo que dependía de él**. Por lo tanto la arquitectura correcta aquí no es la que tiene el mejor modelo de datos, es la que **no le pide capturar nada que no estuviera escribiendo ya**: el `Tipo de proyecto` se deriva del `tipo` de las partidas del cotizador, la ubicación se deriva del campo `maps`/`dirRaw` que el vendedor ya pega para llegar a la cita, el cliente y el teléfono ya son obligatorios en `index.html` (`OBLIGATORIOS`, L4603), las medidas y materiales ya viven en `items[]`, y el único evento nuevo —"esta cotización se ganó"— se cuelga del modal **Registrar Venta que ya existe** (L8730–8797) y que ya pide precisamente lo que falta: fecha de anticipo e instalación, cuenta, estatus y % de comisión, para pegar una fila TSV de 15 columnas en Notion. El eslabón perdido no hay que inventarlo: hay que **automatizar un copiar-y-pegar que el director ya hace a mano**. Y el backend correcto es Google porque el director ya tiene cuenta, porque los tres departamentos ya saben abrir una Hoja —de modo que la pantalla de administración, la de corregir un número mal, **no hay que programarla: es la Hoja**—, porque Apps Script trae de fábrica el cron (triggers programados), el correo (`MailApp`), los archivos (`DriveApp`) y —lo decisivo— el **calendario real con notificación al teléfono** (`CalendarApp`), que es automatización de verdad sin una sola línea de infraestructura ni una llave pegada en el HTML; y porque el único sistema que sí manda notificación desde Notion exige un token de escritura total del workspace, y la API de Notion **no manda cabeceras CORS**, así que desde `github.io` es imposible sin un proxy de servidor de todos modos. Si vas a necesitar un servidor para hablar con Notion, ese servidor ya existe y se llama Apps Script.

---

## 2. RECOMENDACIÓN: Notion vs Google Calendar

### Gana **Google Calendar**, y no está cerca.

| Criterio | Google Calendar | Notion |
|---|---|---|
| ¿Suena en el teléfono de alguien que no abrió la app? | **Sí.** Evento en el calendario nativo de Android/iOS, con `popup` a −1 día y −30 min. Es el mecanismo que la gente ya usa para todo lo demás de su vida. | Solo con la app de Notion instalada, sesión activa y notificaciones concedidas; y los recordatorios de Notion se ponen **fecha por fecha, a mano**, por propiedad. Exactamente la clase de capturita que mató la copia (B). |
| ¿Se puede escribir desde una PWA en GitHub Pages? | **Sí, dos caminos.** (a) `CalendarApp` desde Apps Script, corriendo como el director: **cero OAuth, cero pantalla de consentimiento, cero "app no verificada"**. (b) Google Identity Services + Calendar API desde el navegador, scope `calendar.events`, publishing status *Testing* (tope de 100 test users, sobran 97), sin client secret y sin refresh token. | **No.** `api.notion.com` no manda `Access-Control-Allow-Origin`; hay dos issues abiertos en el SDK oficial por esto (`notion-sdk-js` #96 y #408). Y aunque lo arreglaran, `Notion-Version` es cabecera no simple → preflight, y `Authorization: Bearer secret_…` significa **poner un token de escritura total del workspace en el HTML público**. |
| ¿Puede notificar a los otros dos departamentos sin que tengan cuenta en el sistema? | **Sí.** El director crea dos calendarios secundarios —`AL3D · Fabricación`, `AL3D · Pagos`— y los comparte. Los dueños de esos teléfonos reciben la alarma del sistema operativo sin instalar nada ni autorizar nada. | Requiere que cada persona sea miembro del workspace y tenga la app. |
| Costo | $0 | $0, pero con un proxy de servidor obligatorio de por medio. |

**El papel exacto de Notion, que no desaparece:** Notion sigue siendo **el libro mayor del dinero y la fuente de la verdad de la venta**, tal como lo dijo el usuario ("mis proyectos autorizados viven en notion"). La base `Ventas - AL3D` de la copia ELIAS (`collection://56fa21d8-8e7d-4e16-b874-455fd6c65643`) tiene 199 proyectos, $3,713,419.41 de `Precio Subtotal` acumulado, y todas las fórmulas de `Pago Pendiente`, `Comisiones`, `Comision Restante` y las vistas de *Comisiones Pendientes* que el director usa todos los días. **Arrancar eso de ahí es la manera más rápida de matar el proyecto.** Así que:

- **Notion → Hoja**: espejo de solo lectura, una vez por noche (`Estatus`, `Precio Subtotal`, `Precio Neto `, `Anticipo`, `Liquidacion`, `Pago Pendiente`, `Fecha Liquidacion`). ~2 peticiones para las 199 filas, paginando de 100 en 100. Cuesta 2 de las 20,000 llamadas `UrlFetch` diarias.
- **Hoja → Notion**: **una sola escritura, un solo momento**: cuando una cotización se marca ganada se crea la página del proyecto (`POST /v1/pages`) con el nombre en la convención real `Contacto - Negocio (tipo de trabajo)`, el `Precio Subtotal`, el `IVA`, el `Anticipo`, la `Cuenta `, el `Estatus` en `FABRICACION` y la `Fecha Anticipo e Instalacion`. Es la fila que hoy se copia a mano con `copiarFilaVenta()`.
- **Notion no es el motor de recordatorios y no se le pide que lo sea.** Su vista de calendario es una vista, no una alarma.
- La página **¿Cómo Cotizar?** se marca con una línea al inicio: *"la regla vigente vive en el cotizador"*. No se arregla la divergencia (la página dice $40 = "letras con puntas pronunciadas" y $50 = manuscrita; el cotizador cobra por material: $40 acrílico+aluminio, $55 acero inoxidable, +$5 cursiva, +$10 compleja). **El catálogo del cotizador manda.**

**Descartado y por qué, en una línea cada uno.** Supabase: se pausa a la semana de inactividad, **no tiene backups en el plan free**, y nadie del equipo puede abrir Postgres a corregir un número mal —y esa capacidad es justo lo que hace que un sistema sobreviva su primer mes. Cloudflare Workers: excelente y gratis de verdad, pero es una cuenta más, un despliegue más y un secreto más para un negocio que necesita menos piezas, no más; queda como salida de emergencia si la latencia de Apps Script estorba. Vercel Hobby: su plan free es explícitamente **no comercial**; descalificado para una empresa.

---

## 3. MODELO DE DATOS

**Un solo documento**: Hoja de Google `AL3D · Operación`. Una pestaña por entidad, primera columna = id estable, fila 1 congelada, encabezados ASCII minúsculas con guion bajo (son claves de objeto en JS y viajan en URLs; y un humano lee `fecha_instalacion` sin problema). Tres cosas nativas de Sheets hacen el trabajo que normalmente cuesta pantallas de administración: **validación de datos** en cada columna enum (los enums quedan forzados por la UI, sin código), **rangos protegidos** en las columnas de id y de fórmula (para que corregir no se vuelva romper), y **filtros/vistas** para que cada departamento se arme su tabla.

### Tabla de la verdad — antes de los campos, quién manda sobre qué

| Dato | Fuente de la verdad | Quién más lo tiene, y en qué carácter |
|---|---|---|
| Partidas, medidas, materiales, precios congelados de una cotización | **`al3d_historial`** en el teléfono que la autorizó (`_lt` por partida, `itemsAuth`, `huellaAuth`) | `proyectos.items_json` = **copia congelada**, sellada con `ts_cot` y `huella_cot`. Nunca se reescribe hacia atrás |
| Catálogo de precios de venta | **`index.html`** (`MATERIALES`, `COMPLEJIDAD`, `RECORTES`, `BASTIDORES`, `CAJAS`, L2728–2760) | La página *¿Cómo Cotizar?* de Notion es documentación histórica y **divergente** |
| Folio | `al3d_folio` + `al3d_historial` **de cada dispositivo** (el contador es local: dos teléfonos generan `COT-0008` en paralelo) | `proyectos.folio_cot` + `proyectos.dispositivo`. El id global es `proyecto_id`, que lo asigna el servidor |
| Dinero de la venta, estatus financiero, comisiones, cuentas | **Notion `Ventas - AL3D` (copia ELIAS)** | `proyectos.estatus_notion`, `precio_*` = espejo de solo lectura, refrescado cada noche |
| Fecha de instalación | **la Hoja (`instalaciones.fecha`)** | Google Calendar = proyección con id de vuelta; Notion `Fecha Anticipo e Instalacion` = se escribe al crear y se reconcilia |
| Estado de la obra | **la Hoja (`proyectos.estatus_obra`)** | No existe en Notion. El `Estatus` de Notion es financiero (LIQUIDADO/COBRANDO/FABRICACION/REPARANDO), no de obra |
| Existencia de material | **la Hoja, y no es un número que nadie escriba**: es `SUMIFS(movimientos)` | `existencias` es una pestaña de puras fórmulas |
| Catálogo de material, factores de compra, proveedores, parámetros de taller | **la Hoja** (`materiales`, `parametros`) | No existe hoy en ninguna parte. Se crea, no se espeja |
| Requerimiento de material por proyecto | **derivado** de `items_json`; la Hoja guarda el resultado | `cantidad_ajustada` es la corrección humana y **siempre gana** sobre la fórmula |
| Cliente y teléfono | **`al3d_historial`** — el cotizador ya los exige (`OBLIGATORIOS`, `telIncompleto` ≥10 dígitos) | `clientes` de la Hoja se autopobla con la misma deduplicación que ya hace `clientesConocidos()` (L3168). El `Registro de clientes` de Notion se queda con su 1 fila: **no se puebla a mano** |
| Ubicación geográfica | **la Hoja** (`lat`, `lng`, `geo_fuente`, `geo_precision`) | `maps`/`dirRaw` del historial son la **entrada**; Notion recibe solo una URL |

### 3.1 `proyectos` — la obra ganada

| campo | tipo | origen |
|---|---|---|
| `proyecto_id` | texto PK `P-2026-0034` | servidor, contador en Script Properties. **Es el único id global** |
| `folio_cot` | texto `COT-0007` | `al3d_historial.folio` |
| `dispositivo` | texto 4 chars | nueva clave `al3d_dispositivo`, aleatoria, una vez por navegador. `dispositivo+folio_cot` es único |
| `notion_page_id` | uuid | respuesta de `POST /v1/pages` |
| `nombre_proyecto` | texto | **derivado**: `${contacto} - ${negocio} (${tipo_proyecto_corto})`, la convención real de Notion |
| `cliente`, `tel` | texto | historial (obligatorios en el cotizador) |
| `direccion_texto` | texto | `dirRaw` (multilínea, tal como la mandó el cliente) |
| `entrecalles` | texto | historial |
| `maps_url` | texto | historial `maps` (validado solo con `/^https?:\/\//i`, puede ser cualquier cosa) |
| `lat`, `lng` | número \| '' | `parseGmaps()` → Nominatim → toque en el mapa |
| `geo_fuente` | enum `link_pin \| link_camara \| nominatim \| manual \| ''` | |
| `geo_precision` | enum `pin \| camara \| aprox \| ''` | `@lat,lng` es el centro de cámara, no el pin: se marca distinto |
| `tipo_proyecto` | enum de 7 (los de la copia B) | **derivado de las partidas**, ver §3.9 |
| `semanas_entrega` | entero 1–4 | derivado, override de un toque |
| `fecha_limite_fab` | fecha ISO | `fecha_ganado + semanas*7`, o `entrega` si parsea |
| `estatus_obra` | enum `POR_FABRICAR \| FABRICANDO \| LISTO \| AGENDADO \| INSTALADO \| GARANTIA` | la Hoja |
| `estatus_notion` | enum `LIQUIDADO \| COBRANDO \| FABRICACION \| REPARANDO` | espejo nocturno, **solo lectura** |
| `precio_sub`, `precio_neto`, `anticipo` | número MXN | `desgloseFinal()` al ganar; reconciliado contra Notion |
| `iva` | booleano | historial (`e.iva!==false`) |
| `fecha_ganado` | fecha ISO | el momento del clic |
| `items_json` | texto JSON | **copia congelada de `historial.items[]`** con sus `_lt`. Un proyecto típico pesa 2–6 KB; el tope de celda son 50,000 caracteres |
| `ts_cot` | número epoch ms | `historial.ts` |
| `huella_cot` | texto | `huellaAuth`. Si cambia, el trabajo cambió y hay que reconfirmar material |
| `drive_aifile_id` | texto | la imagen del diseño subida a Drive al ganar (rescata el `aiFile` antes de que `saveHistorial` lo suelte por falta de espacio) |
| `creado_en`, `actualizado_en`, `creado_por` | ISO datetime, email | servidor |

### 3.2 `instalaciones`

`instalacion_id` PK `I-0087` · `proyecto_id` FK · `fecha` fecha ISO · `hora_inicio` `HH:MM` · `duracion_min` entero · `nocturna` booleano (real en este negocio: *"Instalación nocturna, previamente armado en el taller"*) · `estado` enum `PROPUESTA|CONFIRMADA|REAGENDADA|HECHA|CANCELADA` · `motivo_reagenda` texto · `gcal_event_id` texto · `gcal_calendar_id` texto · `requiere` multi-enum `andamio,grua,permiso,electricidad,noche,plaza` · `contacto_sitio`, `tel_sitio` texto opcional · `notas` texto · `actualizado_en` ISO.

`gcal_event_id` es lo que evita el bug clásico: se **actualiza** el evento, no se crea otro.

### 3.3 `materiales` — el catálogo con las dos unidades

`material_id` PK `MAT-ACRI-3` · `nombre` · `familia` enum `acrilico|aluminio|acero|lamina|alucobond|vinil|led|fuente|perfil|tubular|herraje|consumible` · **`unidad_consumo`** enum `cm|m|m2|pieza|litro` · **`unidad_compra`** enum `unidad|bolsa|caja|lamina|litro|metro|tramo|rollo` (la lista textual del usuario) · **`factor`** número = cuántas unidades de consumo trae una unidad de compra · `merma_pct` número · `costo_compra` MXN por unidad de compra · `proveedor`, `tel_proveedor` · `lead_time_dias` · `min_pedido` (en unidad de compra) · `punto_reorden` (en unidad de consumo) · `activo` booleano.

### 3.4 `existencias` — pestaña de puras fórmulas, nadie teclea un stock

`material_id` · `ubicacion` enum `taller|camioneta|maquila` · `en_consumo` `=SUMIFS(movimientos!cantidad;…)` · `en_compra` `=en_consumo/factor` · `comprometido` `=SUMIFS(requerimientos de proyectos abiertos)` · `disponible` `=en_consumo-comprometido` · `alerta` `=SI(disponible<punto_reorden;"COMPRAR";"")`. **La existencia es siempre la suma del libro de movimientos.** No hay un número editable que pueda mentir.

### 3.5 `movimientos` — libro append-only

`mov_id` PK · `fecha` ISO datetime · `material_id` · `cantidad_consumo` número **con signo** (+ entra, − sale) · `unidad` (copia de `unidad_consumo`, para auditar) · `tipo` enum `INVENTARIO_INICIAL|COMPRA|CONSUMO|MERMA|DEVOLUCION|AJUSTE|TRASPASO` · `proyecto_id` (nullable) · `req_id` (nullable) · `usuario` · `nota` · `factura_drive_id` (nullable). Se escribe con `appendRow` dentro de `LockService.getScriptLock()`. **Nunca se edita una fila; se corrige con un `AJUSTE`.**

### 3.6 `requerimientos` — material por proyecto

`req_id` PK · `proyecto_id` · `material_id` · `cantidad_calculada` (unidad de consumo, **fraccionaria a propósito**) · `cantidad_ajustada` (vacío = usa la calculada) · `origen` enum `DERIVADO|MANUAL` · `regla` texto (`letras/canto v1`) · `confianza` enum `EXACTO|ESTIMADO|FALTA_DATO` · `estado` enum `PENDIENTE|COMPRADO|SURTIDO|CANCELADO` · `calculado_en`.

Regla de convivencia: cuando `items_json` o `huella_cot` cambian, las filas `DERIVADO` con `estado=PENDIENTE` se recalculan; **`cantidad_ajustada` y todo lo que ya está `COMPRADO`/`SURTIDO` sobrevive intacto**. Que la corrección humana gane siempre es lo que hace que alguien confíe en la cifra.

### 3.7 `recordatorios` — la cola y la bitácora de las automatizaciones

`rec_id` PK · `regla` enum `R0…R10` · `entidad` enum `proyecto|instalacion|requerimiento|material` · `entidad_id` · `programado_para` ISO datetime · `canal` enum `gcal|gmail|ambos` · `destinatarios` (emails, coma) · `asunto` · `cuerpo` · `estado` enum `PENDIENTE|ENVIADO|OMITIDO|ERROR` · `enviado_en` · `error` · **`dedupe_key`** texto único (`R2|I-0087|2026-09-01`).

`dedupe_key` es la pieza que impide el desastre clásico de las automatizaciones: el mismo aviso mandado 40 veces porque el trigger corrió 40 veces. Y como es una tabla, el director puede **ver por qué le llegó un correo** y por qué no le llegó otro.

### 3.8 `usuarios`

`email` PK · `nombre` · `rol` enum `DIRECCION|FABRICACION|PAGOS` · `token` (32 chars aleatorios, se pega una vez en cada dispositivo) · `gcal_calendar_id` · `telefono` · `activo` booleano · `notificar_email` booleano. Los instaladores **no tienen fila**. Sobre lo débil que es esto, §8.2.

### 3.9 Derivación de `tipo_proyecto` — la prueba de la tesis

El campo que estuvo lleno en **0 de 142 filas** se llena al 100% sin que nadie lo toque, con la partida de mayor `lineTotal`:

| partida dominante | `tipo_proyecto` |
|---|---|
| `caja` | Caja de luz con iluminación (el cotizador siempre la lleva: *"Caras en Acrílico con Iluminación LED Fría"*, L6034) |
| `letras` con `luz:true` | Letras 3D con iluminación |
| `letras` con `luz:false` | Letras 3D sin iluminación |
| `recorte` con `acab:'vinil'` | Rotulación de vinil |
| `recorte` con `acab:'sencillo'` o `'sandwich'` | Recorte acrílico |
| `bastidor`, `manual`, o ≥2 tipos sin dominante claro | Custome / Proyecto Especial |

Nota honesta: **"Caja de luz sin iluminación" nunca se va a poder derivar** porque el cotizador no la puede cotizar. Ese valor huérfano es evidencia de que la taxonomía es anterior al cotizador. Se deja en el enum y se queda en cero; no se inventa un campo para llenarlo.

### 3.10 Lo que se añade a `localStorage` (y el detalle que se olvida siempre)

Nuevas claves: `al3d_dispositivo`, `al3d_gas_url`, `al3d_usuario`, `al3d_token`, `al3d_cache_op` (espejo de la Hoja para abrir sin señal), `al3d_outbox` (escrituras pendientes).

**Hay que meterlas en `RESPALDO_KEYS` (L6856) o se pierden en cada restauración**, porque `restaurarDesde()` **ignora en silencio toda clave que no esté en esa lista**. Son dos líneas y es el error más fácil de cometer aquí.

---

## 4. CÓMO SE DERIVA EL MATERIAL

Punto de partida incómodo y hay que decirlo claro: **`MATERIALES[].precio` es $30–$55 por centímetro de altura por pieza. Es una tarifa de venta, no una lista de materiales.** No describe consumo. Lo que sigue es cómo se pasa de una tarifa a metros y láminas, con tres niveles de dato: (1) lo que la partida ya trae, (2) constantes de taller que se ponen **una sola vez**, (3) **un solo número opcional por partida** que el fabricante ya tiene delante.

### 4.1 `parametros` — las constantes, con su valor inicial y de dónde sale

| clave | valor | unidad | de dónde sale ese valor inicial |
|---|---|---|---|
| `lamina_ancho_cm` / `lamina_largo_cm` | 122 / 244 | cm | Lámina estándar 4'×8' = 1.22×2.44 m: la medida en que se venden en México acrílico, aluminio, acero, lámina galvanizada y Alucobond. **2.9768 m² por lámina** |
| `prof_canto_con_luz_cm` | 6 | cm | El retorno tiene que alojar el módulo LED (~1.5 cm) más separación a la cara para que no se vea el punto de luz |
| `prof_canto_sin_luz_cm` | 4 | cm | Volumen sin necesidad de alojar LED |
| `k_ancho_letra` | 0.80 | — | Ancho de tinta promedio de las 26 mayúsculas de una grotesca ≈0.60 em, sobre altura de caja alta 0.72 em → 0.83. Se baja a 0.80 porque los logotipos reales traen más letras angostas (I, L, T, E) que anchas (M, W) |
| `k_perimetro_recta` / `cursiva` / `compleja` | 1.9 / 2.3 / 2.8 | — | El contorno de una mayúscula de trazo 0.16·H mide 1.8–2.1 veces el perímetro de su caja envolvente (trazado a mano sobre H, E, S). Los escalones siguen el mismo salto que **ya usa el precio** en `COMPLEJIDAD`: el campo `comp`, que existía para cobrar, resulta ser exactamente "cuánto contorno por caja" |
| `merma_nesting_recta` / `cursiva` / `compleja` | 15 / 20 / 28 | % | Acomodo de piezas en lámina sin software de nesting |
| `merma_tira_pct` | 8 | % | Puntas y dobleces perdidos al cortar tiras de canto |
| `area_por_modulo_letra_m2` | 0.04 | m² | Un módulo LED por cada 20×20 cm de cara |
| `area_por_modulo_caja_m2` | 0.06 | m² | La caja tiene más profundidad y difunde más: 25×25 cm |
| `watts_modulo` | 0.72 | W | Módulo de 3 LED 2835 a 12 V, el más común |
| `cap_fuente_w` / `derate_fuente` | 60 / 0.80 | W / — | Fuente de 12 V 5 A; no se carga una fuente arriba del 80% |
| `prof_caja_cm` | 15 | cm | Profundidad mínima para que la luz llegue a la cara sin manchas |
| `sep_travesano_cm` | 60 | cm | Separación de refuerzos de un bastidor |
| `tramo_tubular_m` | 6 | m | El PTR de 1" se vende en tramos de 6 m |
| `holgura_doblez_cm` | 3 | cm | Pestaña de doblez del Alucobond por lado (la memoria técnica real dice *"corte, doblez e instalación"*) |
| `rollo_vinil_ancho_m` | 1.22 | m | Ancho estándar de rollo (48") → 1.22 m² por metro lineal |
| `sep_remache_cm` | 15 | cm | |
| `k_ancho_recorte` | 1.0 | — | Un ícono o silueta se supone tan ancho como alto **mientras nadie lo mida** |

Son 22 números. Se ponen **una vez**, por fabricación, en una pestaña. No hay ni uno por proyecto.

### 4.2 `tipo:'letras'` — el caso completo

De la partida: `n`, `altura` (cm), `material`, `comp`, `luz`, `ilumTipo`.

```
W    = k_ancho_letra × altura                       // ancho supuesto por letra
A_bb = n × altura × W / 10000                       // m² de caja envolvente, TODAS las letras
Per  = n × 2 × (altura + W) × k_perimetro[comp]     // cm de contorno total
```

- **Cara de acrílico** (solo `acr-vol`, `acr-vinil`, `acero` — los tres que la propia tarifa describe como *"Caras en Acrílico"*): `m2 = A_bb × (1 + merma_nesting[comp])`. Se usa la **caja envolvente, no el área de tinta**, porque el hueco de una "O" no se reutiliza con confianza. Eso además elimina la necesidad de conocer el área del glifo.
- **Canto** (aluminio pintado / brush / acero, según `material`): `m = Per × (1 + merma_tira) / 100`. La conversión a compra es 2D y es exactamente el "factor" que el usuario pedía: una lámina de 122×244 cortada en tiras de 6 cm da `floor(122/6)=20` tiras de 2.44 m = **48.8 m por lámina**.
- **LED**: `n_mod = ceil(A_bb / area_por_modulo_letra_m2)`. El material concreto lo decide `ilumTipo`: `MAT-LED-6500K` (fría) o `MAT-LED-3000K` (cálida) — **derivación exacta de un campo que ya existe**. Compra en `bolsa` de 20 → factor 20.
- **Fuentes**: `ceil(n_mod × watts_modulo / (cap_fuente_w × derate))`.
- **Cable**: `n × 0.5 + 5` m. Marcado `ESTIMADO`.
- **Vinil** (`acr-vinil`): `m2 = m2_cara`, comprado por metro de rollo de 1.22 m → factor 1.22 m²/m.

**Ejemplo pedido: 8 letras de 40 cm de acero inoxidable, rectas, con luz fría.**

| paso | cuenta | resultado |
|---|---|---|
| Ancho supuesto | 0.80 × 40 | 32 cm |
| Caja envolvente | 8 × 40 × 32 / 10000 | 1.024 m² |
| Acrílico de cara | 1.024 × 1.15 | **1.178 m²** → /2.9768 = **0.396 láminas** |
| Contorno | 8 × 2 × (40+32) × 1.9 | 2,188.8 cm |
| Tira de acero | 21.89 m × 1.08 | **23.6 m** → /48.8 = **0.484 láminas** |
| Módulos LED 6500K | ceil(1.024 / 0.04) | **26 módulos** → ceil(26/20) = **2 bolsas** |
| Fuentes | ceil(26 × 0.72 / 48) | **1 fuente** |
| Cable | 8 × 0.5 + 5 | **9 m** |

### 4.3 El resto de los tipos

**`recorte`** — `acab`, `altura`, `n`. `m2 = n × altura² × k_ancho_recorte / 10000 × (1+merma)`. `sencillo` → 1 cara de acrílico. `vinil` → acrílico + el mismo m² de vinil. `sandwich` → **2 caras** de acrílico + separadores + LED por área. `recComp` suma merma. Todo el bloque sale marcado **`ESTIMADO`**: el ancho es una suposición pura.

**`bastidor`** — **el único exacto.** `m2_real = ancho×alto/10000`, y aquí va la trampa: **para comprar se usa el área real, no la cobrada.** `lineTotal` aplica `Math.max(m2, 1)` (`M2_MINIMO`), así que un letrero de 0.3 m² se cobra como 1 m² y se fabrica con 0.3. Derivar material desde el importe da un error del 233%. Alucobond suma pestaña de doblez: `(ancho+2d)(alto+2d)/10000`. Tubular: `2(ancho+alto)/100 + n_travesaños × lado_menor/100`, con `n_travesaños = max(0, floor(lado_mayor/60) − 1)`, comprado en tramos de 6 m. Remaches: `ceil(perímetro/15)`, caja de 500.

**`caja`** — `m2_cara = ancho×alto/10000` (una cara por defecto). Forro lateral: `perímetro_m × prof_caja/100` de lámina galvanizada. LED por área con la constante de caja, **siempre fría**. La geometría sale de la tarifa: `3900` = rectangular, merma 12%; `4600` = nube/silueta, merma 30%; cualquier otra tarifa = "personalizada", `FALTA_DATO`.

**`manual`** — **no genera material y no se finge que sí.** El módulo lo lista aparte: *"3 partidas manuales sin desglose de material — revísalas"*. Y aquí sale un hallazgo de negocio: **el neón flex se vende** (hay un proyecto real, `Priscilla - Neón Flex "Enjoy"`) y el cotizador **no lo puede cotizar**, así que se captura como `manual` → es invisible para el módulo de stock. Falta una tarifa de neón flex en $/m. Es el único hueco real del tarifario: el cotizador ya cubre cajas ($3,900/$4,600 por m²), bastidores ($950/$1,500 por m²) y recorte/vinil ($20/$25/$55 por cm), que la página *¿Cómo Cotizar?* no documenta.

### 4.4 El redondeo se hace al comprar, no por proyecto

Es la regla que decide si el módulo sirve o estorba:

```
requerido    = Σ sobre proyectos abiertos de (cantidad_ajustada ?? cantidad_calculada)
disponible   = existencia_consumo − comprometido_consumo
faltante     = max(0, requerido − disponible)              // en unidad de CONSUMO, fraccionario
a_comprar    = max(min_pedido, ceil(faltante / factor))     // en unidad de COMPRA, entero
```

Dos proyectos que necesitan 0.484 y 0.700 láminas de acero, con 0.5 en almacén: agregando → 1.184 − 0.5 = 0.684 → **1 lámina**. Redondeando por proyecto → 1 + 1 = **2 láminas**. La segunda cifra es la que hace que un almacén se llene de sobrantes y que nadie vuelva a creerle al sistema.

### 4.5 Lo que NO existe hoy, y cómo se captura con el mínimo esfuerzo humano

| falta | costo humano propuesto | por qué es aceptable |
|---|---|---|
| **Ancho real de las letras** (el dato de más valor) | **Un número por partida, opcional**: `ancho_total_cm` del letrero completo. Con él, `m2 = altura × ancho_total / 10000` y la confianza salta de `ESTIMADO` a `EXACTO` sin `k_ancho_letra` | El fabricante lo lee del plano que ya tiene abierto. Y ya existe media solución: `textoAuto` (L4045+) guarda el texto real de las letras cuando alguien usa el autocontador — cuando está, se pueden estimar anchos por glifo |
| Profundidad de canto, de caja, espesores, calibres | **22 números, una vez, en `parametros`** | No son por proyecto. Es una tarde de fabricación, nunca más |
| Tamaños de lámina, factores, costos, proveedores | **Una fila por material, ~25 materiales, una vez** | Es el catálogo que no existe en ningún sistema. Hay que crearlo de todos modos |
| Caja de una o dos caras | **Un toque** (interruptor en la ficha del proyecto) | No se teclea nada |
| Inventario inicial | **Conteo perezoso**: cada material se cuenta la primera vez que se va a consumir, no todos al arrancar | No bloquea el lanzamiento. Un `INVENTARIO_INICIAL` por material, cuando toca |
| **Que los factores `k_*` sean adivinanzas** | **Se corrigen con evidencia, no con opinión.** La pestaña `calibracion` compara, por familia, `Σ movimientos CONSUMO` real contra `Σ requerimientos` derivado del mismo proyecto, y da el cociente. A los ~10 proyectos, fabricación ajusta `k_ancho_letra` y `k_perimetro_*` con datos propios | Es el único camino honesto: los factores no existen en ningún sistema, así que se arrancan con un valor razonado y se refinan midiendo |

**Y la regla anti-copia-(B):** si falta un parámetro, la derivación **no devuelve cero en silencio**. Devuelve `confianza:'FALTA_DATO'` y el módulo dice, con el número exacto que hace falta: *"no puedo calcular el canto de acero hasta que alguien ponga la profundidad de canto — es 1 número, una vez"*. Fallar fuerte y nombrando el hueco es lo contrario de un campo vacío que nadie ve.

---

## 5. ARQUITECTURA DE ARCHIVOS

Restricciones que no se negocian: GitHub Pages, sin build, sin bundler, sin node en producción; `index.html` son 10,075 líneas en producción y en uso; la app abre sin señal.

**Decisión de fondo: `index.html` no se reescribe y no se parte. La plataforma es una página nueva, `app.html`.** Comparten `localStorage` porque comparten origen, que es exactamente lo que hace falta para leer `al3d_historial` sin API.

```
/                                 raíz de GitHub Pages
  index.html                      EL COTIZADOR. Intacto salvo el puente aditivo de §5.2
  app.html                        LA PLATAFORMA. Shell + 6 módulos, ES modules nativos
  sw.js                           red-primero, con las rutas nuevas y el respaldo por ruta
  manifest.webmanifest            sin cambios
  logo-al3d.png · logo-al3d-dark.png
  css/
    sistema.css                   tokens + componentes: COPIA VERBATIM de index.html 26–2101
    plataforma.css                lo nuevo: rejilla de módulos, tarjeta de proyecto,
                                  renglón de agenda, tabla de stock, marco del mapa
  js/
    app.js                        único entrypoint: <script type="module" src="js/app.js">
    nucleo/
      config.js                   URL del Web App, ids de calendario, TILES, banderas
      api.js                      el ÚNICO que habla con Apps Script. POST text/plain
                                  (petición simple → sin preflight), outbox, reintentos,
                                  idempotency_key
      estado.js                   caché de la Hoja en al3d_cache_op + render suscrito
      cotizador-puente.js         lee al3d_historial y al3d_q. SOLO LECTURA. Nunca escribe
      dominio.js                  enums, validadores, proyecto_id ↔ folio+dispositivo
      ui.js                       copia de $, money, esc, ico, toast, _CAPAS, chip(), grupo()
      sesion.js                   rol, token, dispositivo
    material/
      parametros.js               las 22 constantes con su valor inicial y su origen
      derivar.js                  items[] → requerimientos[]. PURO, sin efectos, testeable
      unidades.js                 consumo ↔ compra, factores, redondeo AGREGADO
    mapa/
      mapa.js                     Leaflet + capa de tiles configurable
      geo.js                      parseGmaps() + cola Nominatim 1 req/s + caché obligatoria
      proveedor-google.js         STUB documentado, misma interfaz. NO implementado
    modulos/
      inicio.js  proyectos.js  agenda.js  material.js  mapa-vista.js  cotizador.js
    vendor/
      leaflet.css  leaflet-src.esm.js  images/   (al repo, no CDN: offline y sin SRI dudoso)
  apps-script/                    NO se publica. Es el fuente del backend, versionado aquí
    Codigo.gs                     doGet/doPost, ruteo por acción, LockService
    Hoja.gs · Notion.gs · Calendario.gs · Correo.gs · Automatizaciones.gs
    appsscript.json
  tools/
    verificar-sistema.sh          diff del bloque de tokens index.html ↔ css/sistema.css
    pruebas-derivar.html          corre los casos de derivación en el navegador, sin node
```

**Cómo se carga sin build.** Un solo `<script type="module" src="js/app.js">`; el resto son `import` nativos relativos. Leaflet 1.9.4 **quitó el entrypoint ESM del `package.json`**, así que se apunta al archivo explícito y con *namespace import* porque `leaflet-src.esm.js` **no tiene default export** (`import L from …` da `undefined`):

```js
import * as L from '../vendor/leaflet-src.esm.js';
window.L = L;   // los plugins 1.x son UMD y esperan el global
```
El CSS de Leaflet va con `<link>`: no hay CSS modules en el navegador sin bundler.

**La duplicación del sistema de diseño, dicha sin adornos.** `css/sistema.css` es una copia literal de las líneas 26–2101 de `index.html`, con este encabezado: `/* COPIA VERBATIM de index.html 26–2101. No la edites aquí: edítala allá y vuelve a copiar. */`. La alternativa era extraer el CSS de un archivo de 10,075 líneas en producción y reordenar seis capas de cascada donde **gana la última regla** y donde la capa de barro (1666–2033) pisa a propósito a la de estructura. Eso es exactamente el cambio que no se puede permitir hoy. `tools/verificar-sistema.sh` hace `diff` del bloque de tokens y grita si divergen. **Convergencia programada:** la próxima vez que `index.html` se toque por otra razón, se reemplazan esas líneas por un `<link>` y la duplicación desaparece.

### 5.1 El service worker

Cambios mínimos y todos en la misma línea de la estrategia existente (red primero, caché de respaldo, porque el sitio se publica subiendo a `main` y una caché que mande serviría la versión vieja):

1. `CACHE = 'al3d-v2'` — el `activate` borra la v1 y se re-siembra. Solo llega con red, así que no deja a nadie sin nada.
2. `BASICOS` crece con `./app.html`, los dos CSS, los ~18 módulos JS y los archivos de Leaflet, **de uno en uno con `.catch(()=>null)`**, tal como ya está hecho: `addAll` fallaría entero si falta un archivo.
3. **El respaldo de navegación deja de ser siempre `index.html`.** Hoy `req.mode==='navigate'` devuelve la portada del cotizador; hay que elegir por ruta, o abrir la plataforma sin señal manda al cotizador y parece que la app se rompió.
4. **No se toca la regla de solo-mismo-origen.** Eso ya excluye `script.google.com`: **las llamadas a la API nunca se cachean**, que es lo correcto. Cero cambios ahí.
5. Los tiles de OSM son cross-origin → tampoco se cachean, y **no se pueden precargar**: la política de OSM prohíbe *"any pre-emptive fetching of tiles other than those a user is actively viewing"* y en concreto bajar más de 250 tiles en zoom ≥13. El mapa es el único módulo que no funciona sin señal, y se dice en pantalla.

### 5.2 El puente en `index.html` — la superficie total del cambio

Tres cosas, todas aditivas, ninguna dentro de la lógica de precios, de `huellaTrabajo` ni del PDF:

1. **Dos líneas en `RESPALDO_KEYS`** (L6856) para las claves nuevas.
2. **Un botón `.btn-gho` "← Plataforma"** inyectado en runtime en `.topbar-in` cuando la URL trae `?volver=app`. Lo crea el propio puente con `createElement`; no se edita el markup.
3. **Un botón `.btn-ok` "Marcar como ganado"** junto a *Copiar fila* en el modal Registrar Venta, con una función de ~60 líneas que hace `POST` al Web App con lo que el modal **ya tiene capturado**. Si no hay señal, encola en `al3d_outbox`.

Y una decisión explícita: **el cotizador no va en un `<iframe>`.** Tiene seis capas `position:fixed`, modales de `100dvh`, `history.pushState` con el patrón `.hist` para el botón atrás del teléfono, y su propio service worker de respaldo. Todo eso se comporta mal dentro de un iframe, y son 690 KB de página duplicados en memoria de un celular. El módulo Cotizador es una **navegación completa** a `index.html?volver=app`.

---

## 6. LOS SEIS MÓDULOS

Nota transversal: FABRICACIÓN entra con `body.precios-ocultos` activo por defecto —el mecanismo de difuminado de precios **ya existe** en `index.html` con su botón `.precios-ver`— así que ve medidas, materiales y fechas, y no ve importes salvo que lo pida a propósito.

### M1 · Inicio / recordatorios — la pantalla de "hoy"
| DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|
| 4 fichas: ganados del mes, por instalar, faltantes de material, por cobrar (de Notion). Bandeja de avisos de `recordatorios` con el motivo de cada uno. Cotizaciones autorizadas sin marcar ganadas/perdidas | Lo que hay que fabricar esta semana, ordenado por `fecha_limite_fab`. Semáforo de material por proyecto. Botón grande **Registrar consumo** | Anticipos por cobrar, liquidaciones vencidas (`Pago Pendiente > 0` con `Fecha Liquidacion` vacía), comisiones pendientes — las tres son las vistas que ya existen en Notion, aquí solo se leen |

### M2 · Proyectos — la cartera de ganados
| DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|
| Lista y ficha completas. Edita todo. Es quien marca ganado y quien cancela | Ficha técnica: partidas con medidas y material, imagen del diseño desde Drive, `items_json` desglosado, requerimientos. Edita `estatus_obra` y `ancho_total_cm`. **No ve `precio_*`** | Ficha financiera: `precio_sub`, `precio_neto`, `anticipo`, `estatus_notion`, `Cuenta `, comisión. **No ve requerimientos ni parámetros** |

### M3 · Agenda
Calendario mensual/semanal + lista de la semana. Cada instalación muestra: cliente, dirección, medidas, si es nocturna y el semáforo de material.
| DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|
| **La única que escribe fecha.** Agenda, mueve, cancela; el cambio va al evento de Calendar por `gcal_event_id` y a Notion | Solo lectura + el semáforo. Puede marcar `LISTO` (fabricado) | Ve solo la fecha, porque el campo de Notion es `Fecha Anticipo e Instalacion`: esa fecha **es** el punto de cobro |

### M4 · Material — tres pestañas, y fabricación es el dueño
**Faltantes** (agregado por material y por proveedor, con `a_comprar` en unidades de compra reales — "faltan 2 láminas de acrílico 3 mm y 1 bolsa de módulos 6500K") · **Almacén** (existencias, todas fórmula; registrar movimiento) · **Catálogo** (`materiales` + `parametros`, con el origen de cada constante a la vista).
| DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|
| Ve todo, autoriza la compra (un toque que crea el movimiento `COMPRA` esperado y avisa) | **Dueño del módulo.** Registra compras y consumos, corrige `cantidad_ajustada`, mantiene el catálogo y los parámetros | Ve la orden de compra con costos y proveedor, para pagar. No edita catálogo |

### M5 · Mapa
Leaflet + OSM. Pin por `estatus_obra` con la paleta del sistema: `POR_FABRICAR`/`FABRICANDO` ámbar (`--av`), `AGENDADO` azul (`--a`), `INSTALADO` verde (`--ok`), `GARANTIA` rojo (`--mal`). Filtros por estado, mes y tipo. Lista lateral "sin ubicar" con **poner el pin a mano tocando el mapa** (un toque, sin teclear).
| DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|
| Todo. Es el módulo que pidió: instalados + pendientes por instalar | Solo `AGENDADO` y `LISTO`, para armar la ruta del día | **Oculto.** No lo necesita, y un módulo que un rol no necesita no debe estar en su barra |

### M6 · Cotizador
Navegación a `index.html?volver=app`. Los tres roles lo ven; el cotizador ya trae su propio segmentado Vendedor/Autorizador y su propio candado (`locked()`), y esa lógica no se duplica ni se toca.

---

## 7. AUTOMATIZACIONES

Motores disponibles: `doPost` (evento del usuario), un trigger diario a las 06:30, uno cada hora, y un `onEdit` instalable en la Hoja. Todo aviso pasa por la tabla `recordatorios` con su `dedupe_key`, así que se manda **una vez** y queda por escrito por qué.

| # | Qué la dispara | Quién la recibe | Canal | Qué la hace posible aquí |
|---|---|---|---|---|
| **R0** | Clic en **Marcar como ganado** (`doPost`) | DIRECCIÓN (en pantalla), FABRICACIÓN | Gmail + evento en el calendario de Fabricación si ya hay fecha | El modal Registrar Venta **ya captura** fecha, cuenta, estatus y % comisión. Apps Script crea la fila, sube `aiFile` a Drive, crea la página en Notion vía `UrlFetch` y deriva los requerimientos |
| **R1** | Diario: proyecto ganado hace >48 h **sin** `instalaciones` | DIRECCIÓN | Gmail + ficha en Inicio | `proyectos.fecha_ganado` + `LEFT JOIN` vacío contra `instalaciones` |
| **R2** | **Diario 06:30: `instalaciones.fecha == hoy+3` y algún requerimiento con `faltante > 0`** | FABRICACIÓN + DIRECCIÓN | **Evento en Calendar hoy a las 08:00** ("⚠ FALTA MATERIAL — P-0034: 2 láminas acrílico 3 mm") **+ Gmail** | Requerimientos derivados de `items_json` sin que nadie los capture + `existencias` como suma de `movimientos` + `CalendarApp`. El evento suena en el teléfono aunque nadie abra el correo |
| **R3** | Al agendar: el evento nace con `addPopupReminder(1440)` y `(30)` | Quien tenga el calendario compartido | Notificación nativa del sistema operativo | `CalendarApp` sobre calendarios secundarios compartidos. Cero OAuth para los otros dos |
| **R4** | Lunes 07:00: material con `disponible < punto_reorden` | FABRICACIÓN | Gmail, **agrupado por proveedor** con teléfono y `lead_time_dias` | `materiales.punto_reorden` + `existencias`. Un correo por proveedor, no uno por material |
| **R5** | Instalación marcada `HECHA` (`doPost` u `onEdit`) | PAGOS | Gmail | Escribe `estatus_obra=INSTALADO`, pasa el `Estatus` de Notion a `COBRANDO` si no está `LIQUIDADO`, y avisa "toca cobrar la liquidación de P-0034: $X" |
| **R6** | Diario: proyecto instalado hace >N días con `Anticipo` en Notion pero `Liquidacion` vacía | PAGOS | Gmail | El espejo nocturno de Notion. **No se recalcula** `Pago Pendiente`: es una fórmula de Notion y se lee |
| **R7** | Lunes: `Estatus=COBRANDO` con `Pago Pendiente>0` y sin `Fecha Liquidacion` a >15 días | PAGOS + DIRECCIÓN | Gmail | Idem. Es la vista *Cobranza* que ya existe, ahora con alarma |
| **R8** | Al registrar un consumo que deja una existencia **negativa** (`doPost`, inmediato) | FABRICACIÓN | Gmail + toast en pantalla | El libro append-only. "El inventario dice −3 m de tira de aluminio: falta registrar una compra." Es el mecanismo de autocorrección del inventario, y es lo que evita que la cifra se vuelva ficción |
| **R9** | Diario: cotización autorizada hace 7 días, sin marcar ganada ni perdida | DIRECCIÓN | Gmail: "seguimiento a 3 cotizaciones" | La pestaña espejo `cotizaciones` la sincroniza `cotizador-puente.js` al abrir la plataforma en el dispositivo que autorizó. **Honesto:** solo se enteran las cotizaciones del teléfono que abrió la plataforma; el director es quien autoriza y quien la abre |
| **R10** | Diario: reconciliación Calendar ↔ Hoja | DIRECCIÓN, solo si hay diferencia | Gmail | Compara el `start` de cada `gcal_event_id` contra `instalaciones.fecha`. Si el director movió el evento a mano en Google Calendar, la Hoja se actualiza y se avisa. Hasta 24 h de desfase (§8.9) |

**Cuota real de todo esto**, con los números verificados: los triggers consumen ~2 minutos diarios de los **90 min/día** de una cuenta de consumidor; los correos son <15 destinatarios de los **100/día**; el espejo de Notion son ~10 de las **20,000 llamadas `UrlFetch`/día**. Y un dato que cambia el diseño: **las peticiones del navegador al Web App no gastan cuota de `UrlFetch`** — `UrlFetch` cuenta las salidas *desde* Apps Script. Escribir en la Hoja cuesta cero. Solo Notion cuesta.

---

## 8. RIESGOS Y LÍMITES

**8.1 Latencia de Apps Script.** 0.5–3 s típicos, peor en arranque frío, más el salto obligatorio a `script.googleusercontent.com` (el Content Service redirige a un URL de un solo uso). **Lo que ve el usuario:** un botón que se queda pensando dos segundos. **Mitigación no negociable:** ninguna pantalla espera a la red. Se escribe optimista en `al3d_cache_op`, se encola en `al3d_outbox` con `idempotency_key`, y se sincroniza atrás. Y el `POST` va con `Content-Type: text/plain;charset=utf-8` mandando JSON en el cuerpo: es petición simple, no dispara preflight, y el preflight es lo que Apps Script **no puede** contestar porque no permite fijar cabeceras de respuesta. `doOptions` no está en la referencia oficial y no se construye nada sobre él.

**8.2 El modelo de permisos de un Web App es débil, y esto es lo más incómodo del diseño.** Con *Ejecutar como: yo* + *Acceso: cualquiera* —la única configuración que funciona sin que cada petición pida login— **`Session.getActiveUser().getEmail()` devuelve cadena vacía**. Es decir: **el servidor no sabe quién llama.** El rol es una afirmación del cliente. Lo que se hace: un `token` de 32 caracteres por usuario en la pestaña `usuarios`, obligatorio en cada petición, revocable borrando la fila; lista blanca de acciones; nunca devolver la Hoja completa en una llamada. **Lo que eso NO es: autenticación.** Es una llave de puerta. Si el URL del Web App y un token se filtran juntos, quien los tenga lee y escribe la operación completa. Con tres personas de confianza y sin datos de tarjetas es un riesgo aceptable y hay que decirlo en voz alta, no esconderlo. Las dos salidas cuando deje de serlo: Google Workspace (acceso *"cualquiera con cuenta de Google"* + `getActiveUser()` real + pantalla de consentimiento *Internal*, que además elimina el aviso de "app no verificada"), o Supabase con RLS.

**8.3 Escrituras concurrentes.** `LockService.getScriptLock()` (no `getUserLock`, que solo protege del mismo usuario), `waitLock(30000)`, y `SpreadsheetApp.flush()` **dentro** del candado —si el `flush` queda fuera, el write puede ejecutarse después de soltarlo y la protección era decorativa—, con `releaseLock()` en `finally`. Con tres usuarios no va a haber contención jamás. **Lo que sí se rompe:** dos personas editando la **misma fila** desde pantallas distintas → gana el último y en silencio. Mitigación: comparar `actualizado_en` al escribir y rechazar con *"alguien más cambió esto hace 2 minutos — vuelve a cargar"*.

**8.4 Límites de Sheets.** 10 M celdas en el documento, 50,000 caracteres por celda (`items_json` pesa 2–6 KB: sobra). Lo que crece rápido es `movimientos`: ~20 filas por proyecto × 200 proyectos/año = 4,000 filas/año. Sano por una década, **pero** las lecturas se degradan si se leen celda por celda: siempre `getDataRange().getValues()` una sola vez, y archivar `movimientos` a un documento por año.

**8.5 Notion: los nombres con espacio final.** `"Precio Neto "` y `"Cuenta "` **llevan un espacio al final del nombre, de verdad.** Si alguien los renombra en Notion, la lectura devuelve `undefined` y el espejo escribiría ceros sobre datos buenos. Mitigación: **el espejo valida el esquema en cada corrida y, si falta una propiedad, no escribe nada y manda un correo a DIRECCIÓN.** Además: `Estatus` es propiedad de tipo *status*, y la API exige el nombre exacto de la opción (`FABRICACION`, no `Fabricación`). Y una verificación pendiente honesta: la propiedad `Ubicación entrega` de la copia (B) es de tipo *place* y **probablemente no es escribible por la API pública**; hasta comprobarlo, a Notion se le manda una URL y las coordenadas viven en la Hoja.

**8.6 Nominatim.** Máximo absoluto **1 petición por segundo**, **autocompletar desde el cliente está prohibido** (así que el campo de dirección lleva botón, no búsqueda al teclear), y **cachear es obligatorio** —repetir la misma consulta es causa de bloqueo—. La rellenada histórica de 199 direcciones son ~200 segundos de goteo: es un botón deliberado con barra de progreso, nunca automático. **Lo que ve el usuario:** de esas 199, muchas no van a geocodificar; `dirRaw` es texto libre y dice cosas como *"el local de junto al Oxxo"*. Tasa esperada realista: 50–70%. El resto aparece en la lista "sin ubicar" y se resuelve con un toque en el mapa. Escape: LocationIQ free, 5,000/día y 2 req/s, con la key restringida por dominio.

**8.7 Tiles de OSM.** **No hay límite numérico publicado**: la política es cualitativa y dice *"no SLA or guarantees"* y *"access may be blocked, without notice"*, con una advertencia específica para servicios comerciales. Prohibido precargar (>250 tiles en zoom ≥13). **Lo que ve el usuario sin señal: cuadros grises donde iba el mapa, y la lista de proyectos funcionando al lado.** Se dice en pantalla con una `.hintnote`: *"el mapa necesita señal; los datos no"*. El `TILES` de `config.js` permite cambiar a CARTO (5 M/mes, el único free tier verificado sin cláusula de "solo no comercial") sin tocar código, y `proveedor-google.js` es el hueco con la misma interfaz para cuando se quiera pagar Google Maps.

**8.8 Un aviso sobre el mapa que no es técnico:** el mapa solo va a tener pines si `maps`/`dirRaw` están llenos, y `maps` es **opcional** en el cotizador. Si el mapa se ve vacío el primer día, el módulo muere igual que murió la copia (B). Contramedida: la ficha de proyecto empuja el hueco de ubicación como bloqueante suave (`.ptok.falta`, ámbar) y el mapa se puede arreglar tocándolo, sin escribir.

**8.9 Calendar.** Los eventos viven en calendarios del director. Si retira el compartido, los otros dos dejan de recibir alarmas y **nadie se enterará hasta que falle un aviso**. Y si mueve un evento a mano en Google Calendar en lugar de en la app, la Hoja queda desfasada **hasta 24 h**, hasta que corra R10.

**8.10 La derivación de material vive en un solo lugar, a propósito.** `derivar.js` en el navegador es **la única implementación**; el servidor no deriva, solo **valida rangos y escribe** lo que el cliente calculó. Es una decisión deliberada: dos copias de esta lógica (una en JS y otra en `.gs`, sin build que las comparta) divergirían en semanas y el sistema empezaría a dar dos respuestas distintas. El costo es que un cliente malicioso podría escribir números absurdos; con tres usuarios conocidos y validación de rangos en el servidor, es aceptable. La ganancia es que la derivación funciona sin señal.

**8.11 Los factores de conversión son estimaciones al arrancar.** `k_ancho_letra = 0.80` y `k_perimetro = 1.9/2.3/2.8` no salen de una medición de este taller: salen de razonar tipografía y de trazar tres letras. **La primera lista de compras va a estar mal en algún renglón.** Por eso cada requerimiento nace con su `confianza` a la vista, `cantidad_ajustada` siempre gana, y la pestaña `calibracion` existe desde el día uno. Vender esto como exacto sería la manera más rápida de perder la confianza del fabricante y con ella el módulo.

**8.12 La plataforma no es respaldo del cotizador.** `al3d_historial` sigue viviendo en un solo teléfono, y `saveHistorial` ya suelta `aiFile.url` de las entradas más viejas cuando no cabe (por eso `url:''` con `name` presente significa *"la imagen existió y se descartó"*, no *"no había imagen"*). La plataforma rescata a Drive las imágenes de lo **ganado**, pero de lo cotizado-y-no-ganado no rescata nada. **`respaldar()` sigue siendo obligatorio.**

**8.13 Y el riesgo que importa más que todos los técnicos juntos:** que el módulo de material pida más de lo que devuelve. Si a las tres semanas el fabricante tiene que corregir cada renglón a mano, deja de abrirlo, las existencias se congelan, R2 empieza a mentir y la plataforma se convierte en la copia (B) con más pasos. Señal temprana medible: si en el primer mes más del 40% de los `requerimientos` acaba con `cantidad_ajustada`, los parámetros están mal y hay que recalibrarlos **antes** de añadir cualquier módulo nuevo.

---

## 9. FASES

### Fase 0 — se entrega y funciona hoy. El usuario no crea nada, no pega nada, no despliega nada.
`app.html` con los seis módulos leyendo **solo** `al3d_historial` y `al3d_q` del mismo navegador, sin red:
- **Proyectos**: lista de cotizaciones autorizadas con `tipo_proyecto` ya derivado (el campo que estuvo en 0/142), cliente, teléfono, partidas, medidas.
- **Material**: derivación completa con los 22 parámetros por defecto, faltantes agregados por material y en unidades de compra reales. Sin existencias todavía (no hay inventario) → muestra el requerimiento, que es la mitad útil.
- **Mapa**: pines de todo lo que traiga `maps` con coordenadas, con `parseGmaps()` **sin una sola petición de red**. Los acortados `maps.app.goo.gl` piden el link expandido, porque desde el navegador seguir ese redirect es imposible: la respuesta 30x no lleva `Access-Control-Allow-Origin` y en `no-cors` la respuesta es opaca y sin cabeceras.
- **Agenda**: fechas en `localStorage` + **descarga de `.ics`** por instalación (variante UTC, sin `VTIMEZONE`, que elimina de golpe la clase entera de bugs de zona horaria) con `VALARM` a −1 día y −30 min. Cero autenticación, cero cuota, se importa a Google, Apple u Outlook. **Los recordatorios ya funcionan en la fase 0.**
- **Inicio** y **Cotizador**.

Esto se entrega antes de que exista ninguna cuenta. Es deliberado: el usuario tiene que ver algo que sirve antes de que se le pida crear nada.

### Fase 1 — el usuario hace 3 cosas, ~20 minutos
1. Abrir una Hoja nueva y ejecutar una vez `crearEstructura()` (crea las 9 pestañas, encabezados, validaciones, rangos protegidos y los 22 parámetros con su valor inicial).
2. Pegar los `.gs` de `apps-script/` y **desplegar como Web App**: *Ejecutar como: yo*, *Acceso: cualquiera*. (Y la advertencia de operación número uno: para actualizar sin cambiar el URL es **Administrar implementaciones → editar → versión nueva**, nunca *New deployment*.)
3. Pegar el URL en la plataforma, una vez por dispositivo, más su token.

Desbloquea: datos compartidos entre los tres dispositivos, roles, inventario, movimientos, y la Hoja como pantalla de administración que nadie programó.

### Fase 2 — el usuario hace 2 cosas, ~10 minutos
1. Crear dos calendarios secundarios (`AL3D · Fabricación`, `AL3D · Pagos`) y compartirlos con esas dos personas.
2. Autorizar el script una vez y activar los triggers (diario 06:30, cada hora, lunes 07:00).

Desbloquea: **R1 a R5, R8, R9, R10**. Eventos reales con alarma en el teléfono de cada departamento, sin que ellos instalen ni autoricen nada. Aquí el sistema deja de ser una pantalla y se vuelve algo que avisa.

### Fase 3 — el usuario hace 1 cosa, ~15 minutos
Crear una integración interna de Notion, compartir con ella `Ventas - AL3D` y `Gastos - AL3D` de la copia **ELIAS**, pegar el token en las Propiedades del Script (no en el HTML: ahí es donde vive el secreto), y añadir **una** propiedad de texto `Folio COT` a `Ventas - AL3D` —añadir una propiedad no rompe ninguna vista ni fórmula existente, y esa columna la escribe la API, no una persona.

Desbloquea: espejo nocturno de dinero y estatus (**R6, R7**), y la creación automática de la página del proyecto al ganar, que es el eslabón que hoy no existe en ningún sistema.

### Fase 4 — solo si hace falta, y cuesta dinero
Google Maps si OSM se queda corto (`proveedor-google.js` ya está preparado con la misma interfaz). Google Workspace si el modelo de permisos deja de alcanzar o si molesta la pantalla de "app no verificada" en el camino OAuth del navegador. LocationIQ si Nominatim empieza a devolver 429.

### Tabla de dependencias, para leer de un golpe

| Módulo | Fase 0 (nada) | Fase 1 (Hoja) | Fase 2 (Calendar) | Fase 3 (Notion) |
|---|---|---|---|---|
| Cotizador | **completo** | — | — | — |
| Proyectos | lectura local | compartido, 3 roles | — | dinero y estatus reales |
| Material | requerimientos | + existencias, movimientos, faltantes | avisos R2/R4 | — |
| Agenda | fechas locales + `.ics` | compartida | **alarmas reales** | fecha escrita en Notion |
| Mapa | pines de `maps` | + geocodificación y pines a mano | — | — |
| Inicio | avisos calculados en pantalla | bitácora `recordatorios` | correo y eventos | cobranza |

---

### Los dos números que hay que vigilar en el primer mes
1. **`tipo_proyecto` derivado ≠ vacío en el 100% de los proyectos nuevos.** Si esto se cumple, la tesis de la §1 se sostiene y el sistema es distinto de la copia (B).
2. **Menos del 40% de los `requerimientos` con `cantidad_ajustada`.** Si se pasa, los parámetros están mal calibrados y hay que arreglarlos antes de construir nada más encima.