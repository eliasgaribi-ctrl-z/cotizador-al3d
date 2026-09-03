# Resumen del proyecto — qué es esto y para qué sirve

**Documento de orientación.** No decide nada: resume lo que ya está construido, lo que ya se
investigó y lo que sigue pendiente, con los números verificados contra el código y contra los
otros documentos de `docs/`. Si algo aquí contradice a `ARQUITECTURA.md`, manda `ARQUITECTURA.md`.

Estado al día de escribirlo: 113 commits, del 25/jul/2026 al 23/ago/2026. 67 archivos,
~30 500 líneas entre el cotizador, la plataforma y sus hojas de estilo. Las pruebas pasan
(`pruebas/correr.sh`, siete archivos, solo node).

---

## 1. El negocio, en cuatro renglones

AL3D — Anuncios Luminosos 3D, Guadalajara — fabrica e instala letras 3D, recorte de acrílico,
bastidores de lámina o Alucobond y cajas de luz. Tres personas trabajan el negocio en tres
papeles distintos: **dirección** vende y autoriza el precio, **fabricación** compra material y
arma en el taller, **pagos** cobra anticipos y liquidaciones.

Lo que hay detrás, medido: **199 proyectos** en Notion del 07/sep/2023 al 20/ago/2026, con
**$3 713 419.41** de subtotal acumulado. No es un prototipo buscando su primer cliente: es un
negocio de tres años al que se le está cambiando la herramienta por debajo.

## 2. Para qué sirve el repositorio

Antes de esto, cotizar era **duplicar una hoja de Canva y editar la copia a mano**. Se leyeron
las 25 cotizaciones reales más recientes —124 páginas, del 2/jun al 22/ago/2026— y eso es
exactamente lo que se ve: 4 de 25 no cuadran en la suma de su propia tabla, 2 de 25 se
entregaron en ceros, y 25 de 25 llevan hojas de plantilla en blanco con marcadores de 2025.
La regla de precios no vivía en ninguna herramienta: vivía en una página de Notion llamada
*¿Cómo Cotizar?*, copiada tres veces. Y de material no había **nada** en ningún sistema: ni
catálogo con costo, ni inventario, ni proveedores, ni calendario de cuadrillas.

El repositorio son **dos aplicaciones** que atacan las dos mitades de eso:

| | Qué es | Dónde vive | Tamaño |
|---|---|---|---|
| **Cotizador** | La hoja de Canva convertida en formulario: captura, calcula con la regla real, autoriza, imprime el PDF y guarda el historial | `cotizador.html` — un solo archivo, en producción (hasta sep/2026 se llamaba `index.html`) | 13 628 líneas |
| **Plataforma** | La capa operativa que Notion no puede dar: agenda, material derivado de las partidas, stock, mapa y avisos | `index.html` + `js/` + `css/` — **es la raíz del sitio** desde sep/2026 | ~19 000 líneas |

Las dos son **sitio estático en GitHub Pages**: sin compilación, sin servidor, sin cuentas y
sin llaves para empezar. Se abren sin señal, porque `sw.js` guarda una copia de la app en el
teléfono la primera vez. En la calle, delante del cliente, es la diferencia entre cotizar y
prometer que luego mandas el precio.

Liga en producción: https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/

## 3. La regla de precios, que es el corazón

Todo el cotizador cuelga de esto (`js/datos/catalogo-precios.js`, copia generada del catálogo
que vive en `index.html`):

**Letras 3D** — `altura en cm × tarifa del material × número de letras`, más el extra de
complejidad, y **×0.8 si va sin iluminación**.

| Material | $/cm | | Complejidad | Extra |
|---|---|---|---|---|
| Aluminio blanco/negro/pintado | 30 | | Recta | +0 |
| Aluminio brush cepillado | 35 | | Cursiva | +5 |
| Acrílico + aluminio (volumen) | 40 | | Compleja | +10 |
| Acrílico + vinil | 45 | | | |
| Acero inoxidable | 55 | | | |

**Recorte de acrílico** — también por cm de altura: sencillo $20, rotulación de vinil $25, tipo
sándwich con iluminación $55 (+$5 de complejidad, solo en sándwich).
**Bastidor** — por m²: lámina $950, Alucobond $1 500.
**Caja de luz** — estándar $3 900, tipo nube o silueta $4 600. **Mínimo 1 m²** de cobro.

Y una partida **manual** para todo lo que se vende sin tarifa de catálogo: vinil, banderas,
viáticos, señalética, neón, mantenimiento.

**La divergencia que hay que conocer y que está mencionada a propósito, no arreglada:** la
página *¿Cómo Cotizar?* de Notion documenta otro eje —$30 sin iluminación / $35 rectas / $40
puntas pronunciadas / $50 manuscrita— que mezcla material y forma de letra en una sola escala.
El cotizador los separa en dos. **Manda el catálogo del cotizador**: es más nuevo, más granular
y es el que está en producción.

El mínimo de 1 m² de la caja de luz merece su propio renglón porque es el ejemplo de por qué
esto no se puede resolver con una sola tabla: una caja de 0.3 m² se **cobra** como 1 m² y se
**fabrica** con 0.3. Comprar material por el área cobrada es comprar tres veces lo que se
necesita.

## 4. El recorrido de una cotización

1. **Cliente, teléfono y proyecto.** Los tres, antes de la primera partida. Sin ellos no se
   captura, no entra la IA y no bajan las medidas del escalador.
2. **Partidas.** Una por tipo, con su catálogo. La nueva hereda el material de la anterior
   —marcado con «↩ como la anterior», para que se vea que lo puso la app—. Plegadas se leen
   solo con lo que ya está elegido y su total.
3. **Solicitar autorización.** Ahí se **congela el precio**: se sella una huella del trabajo
   (`huellaTrabajo`/`sellarAuth`) y si después se toca una partida, la autorización se suelta.
4. **Autorizar.** Quien autoriza ajusta el total o partida por partida, hacia arriba o hacia
   abajo. Se emite el folio (`COT-0001`, consecutivo **por dispositivo**).
5. **Entregar.** PDF con logotipo, desglose, IVA, descuento autorizado, anticipo y resta al
   entregar. O WhatsApp, con el mensaje ya escrito al teléfono capturado. Un **aumento** no se
   imprime como renglón: se reparte entre las partidas en proporción a lo que vale cada una
   (`preciosCliente`), porque un «Ajuste + $646.90» debajo del subtotal es una invitación a
   preguntar por qué. El descuento sí, que es un argumento de venta.
6. **Registrar venta.** Anticipo, comisión, estatus y saldo, sobre el precio realmente
   autorizado. De aquí sale la fila TSV de 15 columnas para pegar en Notion.
7. **Historial**, con los importes **congelados** (`_lt` por partida, `itemsAuth` por
   cotización): subir el precio del aluminio no reescribe hacia atrás lo que un cliente firmó.

Tres herramientas viven dentro de ese recorrido: **Cotizar con IA** (analiza un JPG o PDF del
proyecto y propone las partidas), el **escalador** (mide sobre una foto sin cotas, calibrando
con una referencia conocida) y el **vectorizador** (convierte el JPG del cliente en el trazo
con el que se corta el acrílico). La IA es lo único que necesita red y llave: se pega la propia
—Gemini, Groq u OpenRouter— y **el respaldo no la incluye a propósito**, porque un respaldo se
manda por WhatsApp y una llave que viaja así deja de ser secreta.

## 5. La plataforma — seis módulos, tres papeles

`js/app.js` es un router por hash sobre un solo documento. Los papeles no son seguridad —en
fase 1 no hay servidor y cualquiera cambia el suyo— son **modo de trabajo**: que fabricación no
tenga enfrente la pantalla de cobranza.

| Módulo | Para qué | Quién lo ve |
|---|---|---|
| **Hoy** | Los avisos del día y los cuatro mensajes de WhatsApp ya armados | los tres |
| **Proyectos** | La cartera de ganados, con el puente *cotización autorizada → proyecto* | los tres |
| **Agenda** | Calendario propio y descarga de `.ics` por instalación | los tres |
| **Material** | Catálogo, constantes de taller, derivación, existencias y lista de compra | dirección, fabricación |
| **Mapa** | Pines de instalación, resueltos del link de Maps de la cotización | dirección, fabricación |
| **Ajustes** | Papel, constantes, respaldo, llaves | los tres, oculto de la barra |

Lo que hace especial al módulo de Material: **no se teclea un stock**. Hay 19 materiales
semilla con **unidad de compra distinta de la unidad de consumo**, 18 constantes de taller
editables, y las existencias salen de un **libro de movimientos append-only**. El redondeo se
hace **al comprar, no por proyecto**: 0.484 y 0.700 de lámina, sumados, son una lámina; por
separado son dos. Eso está probado en `pruebas/stock.mjs`, con ese caso exacto.

## 6. Cómo está hecho, técnicamente

- **Sin compilación.** ES modules nativos. Se edita un archivo y se sube; GitHub Pages
  redespliega en 30–60 segundos.
- **Datos locales.** El cotizador en `localStorage` (historial, folios, cotización en curso,
  cuadernos); la plataforma en **IndexedDB**, que es lo que crece. No se sincronizan entre
  dispositivos: hay respaldo propio en cada una, y export CSV.
- **Mapa sin llave.** Leaflet vendorizado en `vendor/` + tiles de OpenStreetMap. Las
  coordenadas se sacan del link de Google Maps con una regex, **sin una sola petición de red**.
- **Calendario sin cuenta.** `.ics` RFC 5545 generado en el dispositivo, con `VALARM` a −3 días,
  −1 día y −30 minutos. Las alarmas suenan porque las dispara el calendario del teléfono, no
  la app.
- **Pruebas donde no se ve el error.** El cotizador se auditó a mano, pantalla por pantalla;
  eso sirve para una interfaz y no sirve para la aritmética de material ni para un generador de
  iCalendar, donde el error sale como un número plausible y se descubre cuando fabricación
  compró de menos. Siete archivos, `node` y nada más.

Y todo eso está organizado en **tres fases**, que es la decisión de diseño más importante del
proyecto:

- **Fase 1 — lo que funciona hoy.** Cero cuentas, cero llaves, cero despliegues. Un
  dispositivo, todo local, todo sin señal. Al usuario se le piden dos toques (papel y nombre) y
  la confirmación de tres números.
- **Fase 2 — una cuenta de Google Cloud, ~15 minutos, una vez.** Los eventos entran solos al
  calendario, con las tres personas como invitados. Aquí vive también la geocodificación con
  Nominatim, porque necesita red.
- **Fase 3 — una integración de Notion y un Worker de Cloudflare, ~25 minutos, una vez.** Los
  tres teléfonos ven lo mismo y el espejo del dinero viene de Notion en vez de teclearse.
  `puente/worker.js` existe porque la API de Notion no manda `Access-Control-Allow-Origin` y,
  sobre todo, porque su token es de escritura total sobre el workspace y no puede vivir en un
  HTML publicado. **El puente no es un rodeo al CORS: es dónde vive el secreto.**

Lo que hace que las fases valgan: `js/datos/sync.js` es un adaptador, así que encender la
fase 2 o la 3 **no cambia una línea de ningún módulo**.

## 7. La investigación que ya está hecha, y dónde leerla

`docs/` son ~8 000 líneas de investigación previa. Vale la pena saber que existe antes de
volver a preguntar algo que ya se contestó:

| Documento | Contesta |
|---|---|
| `LO-QUE-YA-EXISTE.md` | Qué hay en Notion y en Drive, verificado. Las tres copias divergentes, los 199 proyectos, y los huecos reales |
| `ESTRUCTURA-COTIZACION-CANVA.md` | Cómo se entrega hoy una cotización, leídas 25 reales y 124 páginas |
| `MODELO-DE-DATOS-COTIZADOR.md` | Cada clave de `localStorage`, cada campo de una partida, cada fórmula, con número de línea |
| `INVESTIGACION-TECNICA.md` | Las decisiones de plataforma con su fuente: tiles, Nominatim, ICS, Calendar, Notion, Apps Script, Supabase |
| `SISTEMA-DE-DISENO.md` | Las variables, los componentes, los breakpoints, las reglas de contraste y el tono |
| `ARQUITECTURA.md` | **La decisión.** Modelo de datos congelado, contratos de API, derivación de material |
| `diseno/prop-*.md` | Las cuatro arquitecturas que se propusieron y compitieron |
| `diseno/juez-*.md` | Las tres que las calificaron: corrección técnica, realidad operativa, respeto a lo existente |

La arquitectura no se eligió a ojo: se escribieron cuatro propuestas completas
—`local-first`, `google-nativo`, `notion-verdad`, `backend-propio`— y tres jueces las
calificaron con una lente cada uno. Ganó **`notion-verdad`**: Notion se queda como libro mayor
del dinero y de la venta, y la plataforma es la capa operativa. Los jueces encontraron cosas
concretas —10 de 14 tablas de `backend-propio` nunca activan RLS; el recordatorio de
`google-nativo` no llega al teléfono de quien debe actuar— y esos hallazgos están injertados
en el documento final.

## 8. Lo que falta, y está planteado a ojos abiertos

- **Versiones de una cotización.** 14 de las 25 cotizaciones de Canva traen 2 a 4 precios del
  mismo proyecto: así se vende —tres precios sobre la mesa— y eso hoy no cabe en el modelo,
  donde una cotización es un folio con un precio. Es cambio de modelo de datos, no de PDF.
- **Los cuatro defectos del puente que ya existe.** `copiarFilaVenta()` arma la fila de 15
  columnas pero no persiste nada; ofrece cuatro estatus de los que **coincide uno** con los
  reales de Notion —y pegar un estatus inexistente en una propiedad *status* la crea, así que
  cada venta ensucia el esquema en silencio—; le faltan dos cuentas; y la fecha va como texto
  es-MX donde la columna es *date*. Arreglarlo es fase 1 y no necesita ninguna cuenta.
- **Del papel:** el PDF no imprime ninguna imagen y 22 de 25 cotizaciones llevan plano o fotos;
  el formato de medidas no coincide con el que usan; falta el volumen de la letra, que 14 de 25
  dicen en la descripción.
- **Folios repetidos.** El contador es por dispositivo: dos aparatos empiezan los dos en
  `COT-0001`. Mientras no haya sincronización de verdad, conviene cotizar siempre del mismo.
- **Tarifa para lo que hoy va en partida manual** —vinil, nube, bandera, señalética, neón,
  mantenimiento—. Eso es **decisión de negocio**, no de código, y por eso nadie la inventó.

---

<p align="center"><sub>AL3D · Anuncios Luminosos 3D · Guadalajara, Jalisco</sub></p>
