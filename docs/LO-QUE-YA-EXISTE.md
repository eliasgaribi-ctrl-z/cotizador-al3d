No cree, modifiqué ni borré nada. Solo lectura.

# Lo que ya existe de AL3D (y lo que no)

## Resumen en una línea
AL3D **sí tiene una estructura montada en Notion** — bastante completa y con 3 años de historia real (199 proyectos, $3.7M MXN) — pero **está triplicada en copias divergentes**, y en **Google Drive no hay prácticamente nada de AL3D** (solo 2 auditorías de Google Ads). No existe en ninguna parte: proveedores, inventario/stock, catálogo de materiales con costos, ni calendario de cuadrillas.

---

## NOTION — estructura de AL3D

Raíz del workspace: **Espacio de Trabajo** — https://app.notion.com/p/f954366fda4b4cfeb3eacf11389f257f
Tiene exactamente 5 hijos. Tres son AL3D, dos NO lo son:

| Página | ¿AL3D? | Estado |
|---|---|---|
| **Finanzas - AL3D (ELIAS)** | Sí | **VIVA — es la fuente de verdad** (datos hasta 20/ago/2026) |
| **AL3D \| Anuncios Luminosos (OMAR NOTION)** | Sí | Esquema más rico, **datos congelados en 03/dic/2025** |
| **Finanzas - AL3D - CLAUDE** | Sí | Copia intermedia (184 filas), sin uso aparente |
| Guatemala - 2026 | **No** | Viaje personal (Vuelo/Hospedaje/Tour) |
| Recuperación de Vivienda - Thiqa | **No** | Programa inmobiliario THIQA/RMV |

### 1. Finanzas - AL3D (ELIAS) — la que hay que respetar
https://app.notion.com/p/6e85d7b64a2b4866821d82e7e8e626ef

Contiene: la página *¿Cómo Cotizar?*, 2 botones (plantillas de alta), la base **Ventas - AL3D**, la base **Gastos - AL3D**, y una sección *Comisiones Elias*.

**Base: Ventas - AL3D** (una fila = un proyecto/venta)
https://app.notion.com/p/591b3a49a30f4fc891e07a26bf10b5d7 · `collection://56fa21d8-8e7d-4e16-b874-455fd6c65643`

Esquema exacto:
- `Proyecto` — **title**. Convención de nombre: `Nombre de contacto - Negocio (tipo de trabajo)`. Ej.: "Ale - Parentesis (Caja Luz Mostrador)", "Andrey - Healthylicious (Panel Alucobond)", "Priscilla - Neón Flex «Enjoy»"
- `Precio Subtotal` — number, peso mexicano
- `IVA` — **checkbox**
- `Precio Neto ` — formula (ojo: **el nombre lleva espacio final**)
- `Anticipo`, `Liquidacion`, `Abono Comision` — number MXN
- `Pago Pendiente`, `Comisiones`, `Comision Restante`, `Fecha Comision` — formulas
- `Estatus` — **status** con grupos: To-do → `REPARANDO`, `COBRANDO`; In progress → `FABRICACION`; Complete → `LIQUIDADO`
- `Cuenta ` — select (también con espacio final): `Moni MPago`, `Rul HSBC`, `Tatis BNT`, `Constru BNT`, `Elias BBVA`
- `Fecha Anticipo e Instalacion` — date DD/MM/YYYY (**un solo campo para anticipo E instalación**)
- `Fecha Liquidacion` — date

Vistas ya definidas: *Proyectos en Puerta* (filtra To-do + In progress), *Vendidos del Mes*, *Ventas del Año*, *Record de Ventas Totales*, un **calendario por Fecha Anticipo e Instalacion**, una galería y una tabla completa.

Datos reales: **199 proyectos**, del 07/sep/2023 al 20/ago/2026, `Precio Subtotal` acumulado **$3,713,419.41**. Por estatus: LIQUIDADO 183 ($3.46M), FABRICACION 9 ($102,655), COBRANDO 6 ($131,817), REPARANDO 1 ($14,000).

El **cuerpo de cada página de proyecto es texto libre** con la memoria técnica del trabajo. Ejemplo textual (Andrey - Healthylicious): *"Instalacion de Panel de Aluminio (Alucobond): corte, doblez e instalacion de letras individuales 3D ya fabricadas. Sucursal La Perla (Genki) - Plaza Palma Real, Av. Sta. Margarita 3740 L5, Valle Real. Medidas 1 m x 2.95 m. Cotizacion 21/jul/2026 por $14,900. Instalacion nocturna, previamente armado en el taller."*

**Base: Gastos - AL3D**
https://app.notion.com/p/6e801d42784f49f682c0714e579d05ad · `collection://fc0fc5d1-4d15-4f01-80ba-80d7cbfd59a6`
- `Descripcion` (title), `Fecha` (date), `Cantidad ` (MXN), `Metodo de Pago` (relation a una colección a la que la integración **no tiene acceso**)
- `Categoria` — select de 13: `Prestamo Eli`, `Viaticos`, `Carro`, `Nomina Constru`, `Seguro`, `Comision`, `Google ADS`, `Deuda Raul`, `Iluminacion`, `Laminas`, `Graficos`, `Maquila`, `Recarga`
- **Está abandonada**: datos solo de 24/may/2024 a 16/oct/2025. Mayores: Nomina Constru $377,760 (39), Comision $105,122 (36), Deuda Raul $102,602 (23), Carro $40,299 (52), Laminas $33,280 (11), Graficos $22,577, Maquila $20,668, Google ADS $12,670, Iluminacion $12,372.
- Nota de esquema relevante para un cotizador: las categorías de insumo real son solo `Laminas`, `Iluminacion`, `Graficos`, `Maquila` — no hay desglose por proyecto.

**Vista de Ventas - AL3D / "Comisiones Elias"** — https://app.notion.com/p/9682b4043139497db6b02cf9ab726c72 — no es otra base, son vistas vinculadas al mismo data source: *Comisiones Pendientes* (filtro Comision Restante > 1), *Ultimas Comisiones*, *Record de Comisiones*, y un board agrupado por Estatus.

### 2. ¿Cómo Cotizar? — la regla de precios que la plataforma debe respetar
Existe en **3 copias idénticas**: https://app.notion.com/p/c4275f6609074a1ca84251c834696cfb (ELIAS) · https://app.notion.com/p/c5e482c550e583d0bb0201ed8a400d29 (CLAUDE) · https://app.notion.com/p/2c0482c550e581508ff1ccc848a3108f (OMAR)

Contenido literal:
> **Se cotiza con base en: Altura de letra × Tipo de letra × Número de letras = $$$**
> Para letras (Caras en Acrílico – Cantos en Aluminio):
> **$30** No lleva iluminación / Aluminio crudo o pintado
> **$35** Letras rectas (fáciles de hacer) / Aluminio Brush o Blanco
> **$40** Letras con puntas pronunciadas
> **$50** Si es manuscrita
> **NOTA: Para cotizar sin iluminación, solo restar el 20% del total**

Ejemplos trabajados en la página: `$35 × 33 cm = $1,155 por letra × 6 letras = $6,930` y `$40 × 28 cm = $1,120 × 6 = $6,720`. Menciona también "Acrílico 50/50" como acabado.

**Hueco importante:** esta regla cubre **solo letras individuales**. No hay ninguna fórmula documentada para cajas de luz, rotulación de vinil, neón flex, recorte de acrílico ni panel Alucobond — aunque esos trabajos sí se venden (aparecen en los nombres de proyecto).

### 3. AL3D | Anuncios Luminosos (OMAR NOTION) — el diseño más ambicioso, pero vacío
https://app.notion.com/p/2c0482c550e5806286a9dfb0d8a73297

Es una copia del sistema con un **esquema notablemente más rico** (`collection://2c0482c5-50e5-8155-bb63-000b2430c8b7`). Además de todo lo de la versión viva, añade:
- `Cliente` — relation → *Registro de clientes*
- `Tipo de proyecto` — select de 7: `Caja de luz con iluminación`, `Caja de luz sin iluminación`, `Letras 3D con iluminación`, `Letras 3D sin iluminación`, `Rotulación de vinil`, `Recorte acrílico`, `Custome / Proyecto Especial`
- `Tiempo de entrega` — select: `1 Semana` … `4 Semanas`
- `Fecha de entrega` — formula (calculada desde fecha + tiempo de entrega)
- `Ubicación entrega` — tipo **place** (geolocalizado)
- `Adjuntar cotización` — **file**
- `Constancia situación fiscal` — rollup desde el cliente
- `Proyecto relacionado` — auto-relación

Y una portada con secciones ya armadas: **Calendario de entregas e instalación** (vista calendario por `Fecha de entrega`), un embed de **pronóstico del clima** (indify.co), **Mapa de instalaciones** (vista *map* por `Ubicación entrega`), **Metas próximas**, Ventas, Gastos, una **gráfica de dona** de Comisión Restante por Proyecto, Comisiones Elias y Registro de clientes.

**Base: Registro de clientes** — https://app.notion.com/p/2c2482c550e580fd9a3cdc3bccb72a35
`Nombre de cliente` (title), `Empresa/Organización` (text), `Teléfono` (phone), `Email` (email), `Dirección` (place), `Constancia situación fiscal` (file), `Proyectos relacionados` (relation).

**Base: Metas próximas** — `collection://2c3482c5-50e5-809f-b043-000baeab61f1` — `Name`, `Métrica`, `Valor meta`, `Valor actual`, `Progreso actual` (formula). Filas reales: *Lograr 200 ventas al año* (180/200), *100,000 followers en redes* (80,000/100,000), *Aumentar la plantilla* a 40 personas (30/40), *Reducir tiempos de entrega* (sin métrica).

**El dato clave sobre esta copia:** tiene 142 filas, pero **`Tipo de proyecto` está lleno en 0 filas y `Cliente` en 0 filas**, y *Registro de clientes* tiene **1 sola fila**. Su última fecha es 03/dic/2025. Es decir: el esquema bonito se diseñó y se abandonó sin poblarse; el trabajo real siguió en la versión ELIAS con el esquema simple.

---

## GOOGLE DRIVE — casi nada de AL3D

Solo **2 archivos** en todo el Drive, ambos en la carpeta `1nkjLRGSuck8KhifeHds_wJl4Iu6arZFN`, ambos del 11/ago/2026, mismo título:

1. **Auditoria_Google_Ads_AL3D** (Google Doc) — https://docs.google.com/document/d/1ojRQ20KzIEPkE0jzZ_I4wy6Nymxedc-m5Y2NtnWEQps — auditoría de toda la cuenta (jul 2023 – ago 2026): cuenta "Eliasgaribi" ID 144-000-4227, sitio anunciosluminosos3d.com.mx, 19,870 clics / 3.59 M impresiones / $72,446 MXN / 1,876 conversiones. Hallazgos: puja en "Maximizar clics" en vez de conversiones; WhatsApp-2026 (149 conv.) marcado como secundario; la campaña que traía 96% de conversiones fue eliminada; la Performance Max más eficiente ($6.22/conv) está pausada; el recurso de ubicación mezcla AL3D (Naranjos 648) con **Publi 3** (Pino Suárez 534); estructura de 1 grupo de anuncios y 11 keywords — recomienda separar por línea de producto (**aluminio, acrílico, cajas de luz, neón**); sitio WordPress lento (Slider Revolution).
2. **Auditoria_Google_Ads_AL3D** (Google Doc) — https://docs.google.com/document/d/1QDXSwZTG91JHDeF1OaQW7Pyj65ZT8WFEeO7m1khTfOI — versión enfocada solo en la campaña "Busqueda - Agente Google Ads 2026" (1 ene – 11 ago 2026): 1,539 clics, $13,553.56, 32 conversiones, $423.55/conv, CTR 2.08%, ~24% del gasto vía "IA Max" con peor rendimiento. Términos que sí convierten: "anuncios luminosos cerca de mi", "letreros luminosos cerca de mi", "anuncios luminosos guadalajara".

**No existe en Drive:** ninguna hoja de cálculo de materiales, precios, costos, inventario, proveedores, proyectos, instalaciones ni cotizaciones de AL3D. Cero carpetas llamadas AL3D / Anuncios / Luminosos.

---

## Separación explícita: qué NO es de AL3D

Todo el resto del Drive del usuario es **THIQA / RMV (programa inmobiliario de remates)** y no tiene relación con anuncios luminosos:
- `RMV - BITACORA MAESTRA DE REMATES - THIQA`, `CONTABILIDAD RMV`, `Domicilios - Cartera SOJI`, `Domicilios_Combinados`, `BITACORA DE VIVIENDA THIQA.xlsx`, `Tablero_de_Cobros_v4.xlsx`, carpetas `ELIAS - GENERAL` / `ELIAS - RMV` / `PRV_INFVT_035`, PDFs `PRV_INFVT_* - Recibo honorarios obra`, `RMV__Reporte_de_gastos__Infonavit_PIC_SOJI`, guías de vecindario, `Ruta_8_Tony_Mares`.
- **Trampa a evitar:** la hoja **`CONTABILIDAD`** (`1KYPayr26mTzgaU0YOS69nr3ucMVECckSscQM0R9zuMk`) aparece al buscar "Garibi" — la leí completa: es la contabilidad de THIQA (categorías OBRA, RMV, FLIPPING, NOMINA, THIQASA, PRESTAMOS). *Elias Guerrero Garibi* sale ahí como **nómina de THIQA**, no como AL3D. Es la misma persona en dos negocios distintos; el archivo no aporta nada al cotizador.
- Igualmente, el PDF *"PRV_INFVT_010 - Cotizacion y remisiones materiales - Montevideo 143"* apareció al buscar "cotización" pero es material de obra de una casa de RMV, no un anuncio.
- En Notion: `Recuperación de Vivienda - Thiqa` y sus páginas de domicilios/carteras; y `Guatemala - 2026` con su base `Costos de Guatemala` (categorías Vuelo / Hospedaje / Tour, `Precio x persona`) que es un **viaje personal**, no una expansión del negocio.

---

## Huecos reales (lo que la plataforma tendría que crear, no espejar)

Comprobado con búsquedas específicas y sin resultados: **no existe ningún registro de proveedores, inventario, stock, almacén, catálogo de materiales con costo unitario, ni calendario de cuadrillas/instaladores** en Notion ni en Drive. Las únicas dos coincidencias con "material" fueron dos páginas de gasto tituladas *"Anticipo material"*. Tampoco hay tarifario para cajas de luz, vinil, neón ni Alucobond, ni un solo archivo de cotización almacenado (el campo `Adjuntar cotización` del esquema OMAR está sin usar).

## Recomendación de compatibilidad para el cotizador
1. **Espejar el esquema de `Ventas - AL3D` de la versión ELIAS** (es la que tiene los 199 registros vivos), incluyendo las rarezas de nombre `Precio Neto ` y `Cuenta ` con espacio final, el par Anticipo/Liquidación, `IVA` como booleano y `Estatus` con esos 4 valores exactos.
2. **Adoptar los vocabularios ya diseñados en la copia OMAR** (`Tipo de proyecto` de 7 valores, `Tiempo de entrega` 1–4 semanas, `Ubicación entrega` como lugar) — son la taxonomía que el usuario ya pensó, aunque nunca la llenó.
3. **La fórmula de cotización `altura × tarifa-por-tipo × núm. letras`, con las 4 tarifas ($30/$35/$40/$50) y el −20% sin iluminación**, es la regla de negocio real y debe implementarse tal cual.
4. Mantener la convención de nombre `Contacto - Negocio (trabajo)` y un campo de notas libre por proyecto: así es como opera hoy.
5. No duplicar Gastos - AL3D tal como está (abandonada desde oct/2025) sin resolver antes el vínculo gasto→proyecto, que hoy no existe.