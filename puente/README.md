# El puente — a Google Sheets

**El lado del navegador ya está escrito.** El relevo vive en `js/datos/puente.js`, se
enchufa solo al arrancar —la URL viene de fábrica, y la llave es la cuenta de Google con la
que se entró (o, de emergencia, un token de dispositivo)—, y la pantalla de
**Ajustes → El puente** trae los pasos y los cuatro botones: *Probar*, *Revisar el esquema*,
*Mandar lo que está pendiente* y *Traer el dinero*.

**No hace falta para usar la plataforma.** Sin puente, la plataforma funciona completa en un
dispositivo: agenda, material, mapa, avisos y los `.ics` con sus alarmas. El puente añade dos
cosas y solo dos:

1. Que los **tres departamentos vean lo mismo** desde tres teléfonos distintos.
2. Que el **espejo del dinero** venga de la hoja en vez de teclearse.

---

## Qué cambió, y por qué se fue Cloudflare

Notion quedó fuera. El dinero vive ahora en la hoja de cálculo
**«Finanzas AL3D — Ventas y Comisiones»**, y el puente es un **Apps Script** publicado como
aplicación web desde esa misma hoja.

El Worker de Cloudflare existía por una sola razón, y estaba escrita en su propio README:

> El puente no es un rodeo al CORS. Es dónde vive el secreto.

Ese secreto era `Authorization: Bearer ntn_…`, un token de **escritura total** sobre todo el
workspace de Notion, que no podía vivir en un HTML publicado en GitHub Pages. Con Notion
fuera, el secreto desaparece: un Apps Script corre **dentro de la hoja**, con los permisos de
su dueño, y no hay credencial que esconder. Una cuenta menos, un secreto menos, y sin el
salto de red extra.

Lo que **no** cambió: los caminos, sus formas de respuesta, los tres roles y sus listas
blancas. La plataforma no nota la diferencia más allá de la URL.

### El detalle que sí obligó a tocar el cliente

Apps Script no tiene dónde contestar un `OPTIONS`: un Web App solo expone `doGet` y `doPost`.
Así que toda petición tiene que quedarse dentro de las **«simples» de CORS**, las que el
navegador manda sin preflight. Tanto `Authorization` como `Content-Type: application/json`
lo disparan.

Quedaban dos lugares para el token: la URL o el cuerpo de un POST con `text/plain`. **Va en
el cuerpo, y todo entra por POST.** Un token en la URL se queda escrito en el historial del
navegador, en los registros de cualquier proxy que lo vea pasar, y se va en la cabecera
`Referer` si la página navega. En el cuerpo no le pasa nada de eso. `doGet` no atiende nada:
si alguien llega por GET, no es la plataforma.

---

## Los caminos

Todos entran por **POST** a la misma URL, con el camino en el cuerpo (`{"ruta":"jalar", …}`);
`doGet` contesta que solo atiende POST y nada más. «Cualquier rol» quiere decir una cuenta de
Google que esté en «Accesos» o un token de dispositivo válido: sin ninguna de las dos, la
respuesta es `ROL_SIN_PERMISO` antes de mirar el camino. La única excepción es `/verificar`.

| Camino | Quién | Qué hace |
|---|---|---|
| `/salud` | cualquier rol | Estado, `version`, el rol, la lista de lo que **este rol** puede escribir, por qué puerta entró (Google o token) y qué proveedores de IA tienen llave —sí o no; la llave no sale nunca— |
| `/esquema` | cualquier rol | Qué columnas le faltan a la hoja, y si falta «Accesos». Las **detecta**, no las crea |
| `/jalar` | cualquier rol | **Todas** las filas de Ventas en una sola página (desde `puente-sheets-6`; antes de 50 en 50, y una fila que el reacomodo cambiaba de página a media bajada no salía): el récord de ventas de Control sale de aquí. **El dinero solo para quien lo ve**; el teléfono del cliente (AE, desde `puente-sheets-11`), para todos. Lee hasta la última columna que la hoja tenga: una hoja sin AE baja todo menos el teléfono, sin tronar |
| `/empujar` | cualquier rol, con su lista blanca | Hasta 25 operaciones, filtradas por la lista blanca del rol (`PUENTE_ROLES`). Lo que devuelve pasa por el mismo filtro de lectura que `/jalar` |
| `/expandir` | cualquier rol | Sigue un link corto de Maps hasta el largo, el que trae coordenadas. Solo dominios de Maps |
| `/solicitar` | cualquier rol | Pide a Dirección que autorice un precio. La hoja recalcula el subtotal con su copia del catálogo y, si no cuadra con el del teléfono, contesta `CATALOGO_DESINCRONIZADO`. No pisa la solicitud pendiente que **otra persona** tenga sobre el mismo folio (Dirección sí puede) |
| `/cancelar` | quien la pidió, o Dirección | Retira una solicitud pendiente: el teléfono la reabrió para editarla y lo que se pidió ya no es lo que hay |
| `/pendientes` | Dirección (con Google o con su token) | La cola de autorizaciones de todos los teléfonos: las últimas 50 solicitudes pendientes |
| `/estado` | cualquier rol, solo lo suyo | En qué quedó cada folio que pidió **esta misma identidad** (hasta 20 por pregunta): el sello, si ya se autorizó —y solo uno emitido después de su última solicitud y para ella—, o si se rechazó, con quién y la nota. Dirección ve todos los folios |
| `/autorizar` | solo Dirección **entrando con Google** | Recalcula el catálogo, firma folio, trabajo, precio, ajustes por partida (`itemsAuth`, sin IVA, por id de partida), total y —desde `puente-sheets-8`— los **renglones** del PDF (descripción corta, piezas e importe de cada partida, el que ve el cliente: con su ajuste por partida y el aumento ya repartido), lo anota en «Autorizaciones» y devuelve el sello. El token de dispositivo no basta: dice qué aparato es, no quién autoriza (`soloDireccionConGoogle`). Lo usan igual el formulario de revisión del teléfono y la revisión de una solicitud remota: desde octubre de 2026 la remota también manda `itemsAuth` lleno —antes siempre `{}`—, **sin cambio de contrato** (fue en `puente-sheets-7`): la hoja ya los validaba y firmaba, y `/estado` ya los devolvía con el sello |
| `/rechazar` | solo Dirección entrando con Google | Rechaza una solicitud pendiente, con su nota |
| `/revocar` | solo Dirección entrando con Google | La autorización vigente de un folio pasa a «revocada», y el QR de ese PDF lo dice |
| `/verificar` | **pública, sin token** | La abre el QR de un PDF desde el teléfono de cualquiera: «auténtica», «superada», «revocada» o «no auténtica», con folio, fecha, total, negocio y —si el sello los firmó— los renglones (`renglones`: `[{descripcion, cantidad, importe}]`, o `null` en un sello de antes de `puente-sheets-8`, que solo responde del total), y nada más: ni cliente, ni teléfono, ni correo. Va antes de las dos puertas, con su propio cupo: 30 consultas por folio y 400 en total cada diez minutos |
| `/empujar_almacen` | dirección y fabricación; pagos solo lo derivado | Hasta 25 operaciones del almacén —renglones del libro, materiales del catálogo, líneas de la lista de compra— en un viaje, en orden y bajo el candado (desde `puente-sheets-9`). Ver «El almacén», abajo |
| `/jalar_almacen` | cualquier rol | Lo que las tres pestañas del almacén recibieron después de la secuencia que el teléfono manda (`desde`), en páginas de 1500. **Los costos solo para quien ve el dinero** |
| `/ia` | cualquier rol | **Un** intento contra **un** proveedor (Qwen, DeepSeek o Gemini) con las llaves de la hoja; la cadena y los reintentos siguen en el teléfono. Tope de 200 por persona al día. Es el único camino que acepta cuerpos de más de 64 KB —hasta 15 MB, la imagen o el PDF—, y solo si el cuerpo **empieza** por `{"ruta":"ia"` |
| `/carpetas` | cualquier rol | Las subcarpetas de «Trabajos Pendientes» en Drive con sus archivos —nombre, liga, tipo y fecha, nunca el contenido— para que la ficha de cada proyecto enseñe su PDF de órdenes de fabricación y sus `.cdr` (desde `puente-sheets-10`). Solo lee. Cinco minutos de caché del lado de la hoja. Es la razón de que esa versión pida permiso de **leer Drive** al pegarla |
| `/crear_carpeta` | solo Dirección | Abre en «Trabajos Pendientes» la carpeta «Contacto - Negocio» del proyecto del taller que no tiene una; la pide sola la sincronización del teléfono de Dirección. Bajo el candado y sin distinguir acentos ni mayúsculas: si ya hay una con ese nombre, devuelve ésa. Solo crea; nunca mueve, renombra ni borra |

Los tres roles y lo que cada uno puede escribir son los mismos de antes:

- **dirección** — todo.
- **los tres** — el teléfono del cliente (AE «Telefono», desde `puente-sheets-11`): lo leen y lo
  escriben dirección, fabricación —que llama para instalar— y pagos —que cobra por WhatsApp—.
- **fabricación** — mueve la obra y el almacén. **No toca dinero**: ni anticipo, ni
  liquidación, ni cuenta, ni estatus de cobranza. Y desde `puente-sheets-3` tampoco lo
  **ve**: las cifras no bajan a ese teléfono. En el almacén (desde la 9), igual: registra
  movimientos, edita el catálogo y corrige las listas de compra, pero el costo de compra y el
  costo de un movimiento ni los escribe ni le bajan.
- **pagos** — cobra. **No mueve la obra ni el almacén**: de lo suyo en el almacén solo entra lo
  que la plataforma deriva sola si ese teléfono es el que está abierto el día del corte (la
  salida `derivado` y la línea que pasa a `consumido`), para que ese día el material se
  descuente igual.

El rol sale de la pestaña **«Accesos»** de la hoja —el correo con el que se entró con Google—
o, de emergencia, del token de dispositivo. Cambiar el segmento de rol en Ajustes da otro
tablero, **no da permisos**: quien es fabricación sigue recibiendo un rechazo si manda
`Anticipo`, diga lo que diga el teléfono.

---

## Las diferencias de contrato contra la versión de Notion

1. **`Abono Comision` ya no es una celda.** En Notion se sobrescribía, y por eso solo
   sobrevivía el último pago. En la hoja es la suma de la pestaña **Abonos comisión**, así
   que escribirlo significa **agregar un renglón**. Se gana el historial de parcialidades
   sin que el teléfono se entere. Por eso solo acepta **importes positivos** (y de menos de
   $10,000,000): un abono es un pago hecho, y un renglón negativo hacía **subir** la comisión
   pendiente. Una corrección se hace a mano, en la pestaña.

2. **`Fecha Anticipo e Instalacion` era un rango.** En la hoja son dos columnas: la del
   anticipo y la de instalación, separadas.

3. **`Pago Pendiente` sale con el signo de la hoja:** positivo es lo que te deben. Hasta
   `puente-sheets-3` se mandaba negado «con el signo de Notion», y la plataforma nunca pintó
   ese signo —hace `Math.max(0, saldo)`—, así que toda la cartera se veía cobrada. Desde
   `puente-sheets-4` las dos fórmulas de la fila, saldo y comisión restante, bajan con el
   mismo criterio, y hay una prueba que encadena la celda, el Apps Script, el relevo y la
   pantalla de Control sobre el mismo número.

4. **`Porcentaje comision` es una columna nueva (AD).** El % que se pacta con quien trae el
   trabajo se capturaba en el modal de Registrar Venta, se guardaba en la plataforma y se
   perdía. Ahora viaja y queda escrito en la hoja, pero **la comisión no lo lee**: en AL3D es
   fija, 10 % del subtotal sin IVA, y la fórmula `R` no mira la columna AD (está así desde
   `d4623f3`, y el comentario de `formulasVentas` dice por qué). Si algún día se pacta por
   venta, `R` es el único lugar que hay que cambiar. Lo escriben dirección y pagos;
   fabricación ni lo escribe ni lo ve.

5. **Un cambio contra una venta que ya no está vuelve `NO_ENCONTRADO`** (desde
   `puente-sheets-6`). Antes se creaba una fila sin nombre con lo que viniera, y la siguiente
   alta caía encima de ella. Ahora la hoja solo crea fila para un alta que trae el nombre del
   proyecto, y el teléfono aparta el cambio con la razón escrita en vez de reintentarlo para
   siempre (ver «Lo que la hoja rechaza», abajo).

6. **La identidad de la fila se comprueba.** El folio de la hoja no se reparte dos veces
   aunque se borre la última venta (una marca en las propiedades del script), «Folio
   cotizacion» no se pisa en un cambio, y el teléfono manda su folio de cotización aparte de
   los datos para que la hoja no escriba en una fila que heredó el folio de otra venta.

### Lo que baja: el récord entero, no solo lo de este teléfono

Hasta septiembre de 2026 el relevo miraba cada fila que bajaba de `/jalar` y **se quedaba solo
con las que tenían proyecto en ese teléfono**, atadas por `Folio cotizacion`. Las 199 filas
anteriores a la plataforma, las capturadas desde otro aparato y las dadas de alta en la propia
hoja (⚡ AL3D → Registrar nueva venta) se descartaban, y el «Vendido en septiembre» de Control
era el de ese teléfono, no el del negocio.

Ahora cada fila baja **dos veces, a dos sitios**:

1. **Al récord de ventas** (`ventas_hoja` en IndexedDB), entera y con el folio interno de la
   hoja (V-042) de id. No es un proyecto: no tiene partidas ni material y **no entra al
   tablero de obra**. Es el renglón del libro mayor, para sumarlo. `ventas.unificar` lo cruza
   con los proyectos del teléfono por `Folio cotizacion`; cuando una venta está en los dos
   lados **manda el dinero de la hoja** —importe, anticipo, estatus, cuenta, fórmulas y fecha
   del anticipo— y el proyecto sigue siendo dueño del nombre, la etapa y la dirección.
2. **Al proyecto de este lado**, como antes, si lo hay: el parche del espejo del dinero.

Una bajada completa —de la primera página a la última— es un **barrido**, y al cerrarlo el
cliente **borra del récord lo que la hoja ya no trajo**: una fila eliminada allá deja de sumar
aquí. Lo que no cambió no se reescribe, así que un barrido de trescientas filas no dispara
repintados ni gasta la base. El récord no entra al respaldo de la plataforma: se vuelve a bajar.

El filtrado por rol sigue valiendo: a **fabricación** las filas le llegan sin las columnas de
dinero y el renglón del récord se guarda sin importe, no con cero. Control no le aparece a ese
rol de todas formas.

Del lado de la hoja **no cambió nada**: `/jalar` ya mandaba todas las filas. El cambio es de
quién las guarda.

**La plataforma sabe qué versión corre la hoja.** «Probar» en Ajustes lee la `version` que
contesta `/salud` y, si es anterior a la que la plataforma espera, lo dice con los pasos en
vez de un «El puente contesta» que sería verdad y engañoso a la vez.

Las fórmulas siguen siendo de solo lectura, y por la misma razón de siempre: dos
implementaciones de la misma fórmula divergen en semanas y el sistema empieza a dar dos
respuestas. `Precio Neto `, `Pago Pendiente`, `Comisiones` y `Comision Restante` se **leen**.
Una escritura contra ellas se rechaza **con su razón**, no en silencio.

Y sigue sin aceptarse un valor inventado en ningún campo de lista: estatus, cuenta, etapa de
obra y tipo de trabajo se validan contra la lista real antes de escribir.

### El sello firma los renglones (`puente-sheets-8`)

Hasta la 7 el QR respondía del folio, la fecha, el negocio y el total. Un PDF con los importes de
dos partidas intercambiados —o con una partida cambiada por otra del mismo precio— seguía
diciendo «auténtica». Desde la 8:

- **Qué se firma.** `/autorizar` arma, por cada partida y en el orden del PDF, `[descripción,
  piezas, importe]`: la descripción corta que viajó en la cotización (cortada a 120), las piezas
  de la columna «Pzas.» (`piezasDe`) y el importe **que imprime el PDF** —`preciosCliente()`, con
  el ajuste por partida y el aumento ya repartido—. Lo calcula la hoja con su copia del catálogo
  y su total, nunca con importes del teléfono. Van todas las partidas, también las ocultas del
  PDF: ocultar no suelta el precio, y el papel las junta en «Conceptos adicionales».
- **Dónde queda.** En la columna **Q, «Renglones»**, de «Autorizaciones», como JSON en texto.
  Va al final para no correr las dieciséis de antes; la hoja le pone el título sola la primera
  vez que sella.
- **La firma es otra versión.** Con renglones se firma `AL3D-AUTH-v2` + los nueve campos de
  siempre + el texto de la columna Q. Sin renglones, la `AL3D-AUTH-v1` de siempre, igual byte por
  byte: por eso **los PDF ya impresos siguen verificando**. Vaciar la Q de un sello v2 lo hace
  comprobarse como v1, y como el prefijo es parte de lo firmado, da «no auténtica».
- **Qué contesta.** `/verificar` y el sello de `/autorizar` y `/estado` traen `renglones`:
  `[{descripcion, cantidad, importe}]`, o `null` en un sello de antes. verificar.html pinta la
  tabla y dice «Compara cada renglón con tu PDF; si alguno no coincide, el PDF fue alterado»; con
  `null`, que ese sello solo garantiza el total.
- **Un detalle de la respuesta.** `/autorizar` devolvía los ajustes por partida como llegaron y
  `/estado` como quedaron firmados, a centavo. Ahora los dos a centavo: son la base de los
  importes de los renglones, y el teléfono que autoriza y el que recibe el sello tienen que
  calcular lo mismo.
- **La copia que hay que mantener.** `cotPreciosCliente`, `cotItemPrecio`, `cotPiezas` y
  `cotPrecioFinal` son copias de `nucleo.js`, como el catálogo. `pruebas/precio-servidor.mjs` las
  compara con tres mil cotizaciones al azar: tocar el reparto del aumento es tocar los dos lados.

### El almacén, el catálogo y las listas de compra (desde `puente-sheets-9`)

Hasta la 8 el puente llevaba la venta y nada más: el libro del almacén, el catálogo de material
y las listas de compra se quedaban en cada teléfono, apartados en la bandeja «hasta que exista
su pestaña». Ahora existen, y las crea el propio Apps Script la primera vez que hacen falta (o
`prepararHojaParaElPuente`):

| Pestaña | Qué es | Cómo se escribe |
|---|---|---|
| **Almacén** | el libro de movimientos: entradas, salidas, ajustes, conteos, mermas y devoluciones | **append-only**: un renglón que ya está no se vuelve a escribir |
| **Catálogo de material** | una fila por material (`acr-3mm`) | campo por campo |
| **Listas de compra** | una fila por requerimiento (`<proyecto>:<material>`), de donde sale la lista | campo por campo |

Cada columna se describe como las de `/esquema` —`{ campo, nombre, tipo, para }`, en
`ALM_PESTANAS`—, se busca por su cabecera y no por su posición, y lleva su explicación como
nota. Al final de cada pestaña van las columnas de la hoja: **Secuencia**, **Llegó**,
**Subió**, **Sellos** (cuándo se escribió cada campo) y **Otros (JSON)** (lo que llegó sin
columna propia, para no perderlo).

- **Un movimiento no se descuenta dos veces.** El id lo pone el teléfono y la hoja lo busca
  antes de escribir: un reintento contesta «ya estaba». La salida que deriva el corte lleva un
  id que sale del requerimiento (`mov-salida:<proyecto>:<material>`), así que si dos teléfonos
  cortan el mismo proyecto emiten el mismo renglón y entra uno. Y el teléfono que baja un id que
  ya tiene lo descarta.
- **Solo se escribe lo que cambió.** La operación dice qué campos cambió (`campos`) y la hoja
  escribe esos; de cada uno guarda su sello, y un cambio que llega tarde —el teléfono que estuvo
  sin señal— no pisa uno más nuevo. Una línea `consumido` no vuelve a `calculado`: si volviera,
  el corte siguiente restaría el material otra vez.
- **Los roles.** Ver arriba: fabricación sin costos, pagos solo lo derivado, Dirección todo.
- **Bajar sin depender del reloj.** Cada fila escrita recibe un número de secuencia bajo el
  candado; el teléfono pide «lo de más de N» y guarda el más alto que vio. Una vez por semana
  pide todo, por si algo se quedó sin bajar.
- **El cupo.** Una compra recibida son diez renglones: `sync` los manda en **un** viaje de hasta
  25, contra el mismo cupo de 60 peticiones por minuto y el mismo candado que `/empujar`.
- **Contra una hoja vieja.** Si la hoja corre la 8 o una anterior, el teléfono lo sabe por `/salud` (o porque
  el camino contesta «Camino desconocido») y aparta lo del almacén con esa razón, sin gastar
  peticiones. En cuanto la hoja se actualiza, el siguiente bombeo lo reincorpora solo, en su
  orden.

Las tres pestañas son **el buzón de la plataforma**: se leen, no se editan a mano. Una
corrección tecleada ahí no cambia la secuencia y no llega a los teléfonos hasta la vuelta
semanal; el catálogo y las listas se corrigen en la plataforma (Material).

### `puente-sheets-11` — el teléfono en la hoja

Hasta la 10 el teléfono del cliente vivía solo en el teléfono que ganó la cotización: el
instalador que tenía que llamar para confirmar, y quien cobra por WhatsApp, se lo pedían a Elías.
Desde la 11 tiene columna en Ventas, **AE «Telefono»**, y viaja como las demás del puente.

| | |
|---|---|
| **Columna** | AE (31). `ULTIMA_COL = 31`. Texto sin formato (`@`): «+52 1 33 1234 5678» se queda así, no se vuelve número ni fórmula |
| **Quién** | lo leen y lo escriben los tres roles. No es dinero: `sinLoQueNoLeToca` no se lo quita a nadie |
| **Qué acepta** | dígitos, espacios, `+`, guiones y paréntesis, hasta 30. Lo demás (puntos, diagonales) se vuelve espacio; sin un dígito, se rechaza con su razón. Vacío borra la celda. La misma regla de los dos lados (`telefonoLimpio`, en el `.gs` y en `js/datos/proyectos.js`) |
| **Al reacomodar** | viaja con su fila, como Y:AD (`ordenarVentas`). La realineación de una sola vez de Y:AD no la toca: AE nació cuando las columnas del puente ya viajaban con su fila, así que nunca estuvo revuelta (`ULTIMA_COL_REALINEABLE`) |
| **Sube** | el del proyecto, o el de la cotización si el proyecto no tiene uno propio (lo mismo que enseña la ficha). En un alta o en un cambio de otra cosa un vacío **no** se manda: vacío solo cuando lo que cambió fue el teléfono |
| **Baja** | al récord de Control (`ventaDeHoja`), a la tarjeta importada (`desdeVentaDeHoja`) y al proyecto que ya existe **solo si ese proyecto no tiene teléfono**: uno de aquí no se pisa con el de la fila, y menos con un vacío |
| **Lo que ya había** | la columna nace vacía. Cuando una bajada trae la fila con AE vacía y el proyecto de ese teléfono sí tiene número, la revisión de la bajada (`revisarContraLaHoja`) lo manda una vez (`tel_a_la_hoja`). Y los cambios de puro teléfono que la 10 rechazó («no puede escribir nada») vuelven solos a la cola en cuanto el teléfono sabe, por `/salud`, que la hoja ya corre la 11 (`revive` del relevo; una vez por operación) |

**Contra una hoja que todavía no está en la 11** (o que ya la tiene pegada pero no ha corrido
«Preparar la hoja»): nada se rompe. Con la 10, la plataforma —que sabe la versión por `/salud`—
no manda el teléfono, y un cambio que era solo eso se despacha sin mandarse; lo recoge la
revisión de la bajada cuando la hoja se actualice. Con la 11 sin la columna AE, `/jalar` baja
hasta AD sin la llave del teléfono, y una escritura del teléfono se rechaza con la razón «la hoja
todavía no tiene la columna AE» mientras lo demás de esa operación sí se escribe. AE cuenta solo
si su encabezado dice «Telefono»: una AE usada para otra cosa no se lee ni se escribe.

---

## Montarlo

Los pasos están en [`DESPLIEGUE.md`](DESPLIEGUE.md). Son unos diez minutos, una vez.

El código del puente se versiona aquí como [`hoja-apps-script.gs`](hoja-apps-script.gs) —es
el proyecto completo de la hoja, no solo el puente— para que `pruebas/puente.mjs` pueda
comparar los dos lados. Esa prueba es la que atrapa que las ocho etapas, los siete tipos de
trabajo, los cuatro estatus y las cinco cuentas sigan diciendo exactamente lo mismo de los
dos lados, con el espacio final de `Cuenta ` incluido.

**La copia que manda es la de la hoja.** Si tocas `hoja-apps-script.gs` aquí, hay que pegarlo
en el editor de Apps Script y volver a implementar: no se despliega solo como se desplegaba
el Worker.

### Antes de pegar nada: baja la copia de la hoja y compárala

Esa frase de arriba se leyó como un trámite y no lo es. En septiembre de 2026 la copia de
este repositorio llevaba **500 líneas menos** que la de la hoja —le faltaban los colores por
cuenta, el orden de las ventas, el IVA por cuenta, el reparto FIFO de abonos y las comisiones
por periodo, escritos todos directamente allá— y, lo caro:

> en la hoja **C es `Estatus` y D es `Cuenta `**, y la copia de aquí los tenía al revés.

Pegar la copia del repositorio encima habría dejado un `COL` que apunta a la columna
equivocada: cada subida de la plataforma habría escrito **la cuenta encima del estatus** en
filas de dinero real, sin marcar un solo error. La prueba de vocabulario no lo atrapa —los
dos lados dicen «Cuenta » y «Estatus», solo que en distinto número de columna— y el único
lugar donde se ve es la hoja.

Así que el orden es: **abrir Apps Script, bajar el `Codigo.gs` de la hoja, compararlo contra
éste, y fusionar a mano lo que cada lado tenga de más.** Git guarda el ancestro, así que un
`git merge-file` de tres vías hace casi todo el trabajo; lo que quede en conflicto es
justamente lo que hay que mirar con cuidado.

El `COL` de este archivo es el mapa de la hoja **de verdad**, no de una hoja ideal. Si un día
se mueve una columna allá, se mueve aquí en el mismo commit o el puente empieza a escribir
al lado.

## Cómo está cerrado

La dirección del puente es pública —igual que lo era la del Worker— y **la puerta es quién
eres**: desde `puente-sheets-5` el puente verifica con Google el token de la cuenta con la que
se entró (que sea de esta app y con el correo verificado) y busca ese correo en la pestaña
**«Accesos»**. El token de dispositivo sigue sirviendo, como salida de emergencia para el día
que Google no conteste. Alrededor de eso hay más cosas:

1. **Todo por POST, la llave en el cuerpo.** Nunca queda escrita en una URL. Ver arriba.
2. **Sesenta peticiones por minuto por persona** (por correo, o por token si se entró con
   uno). Es más de lo que hacen tres teléfonos trabajando, y mucho menos de lo que sirve para
   raspar la hoja entera con una llave robada. Se cuentan en **ventana fija** de un minuto.
   Antes cada petición volvía a darle sesenta segundos de vida a la cuenta, así que solo se
   vaciaba tras un minuto entero sin ninguna: un teléfono que sincronizaba cada 30 s no la
   dejaba vaciarse nunca, sumaba hasta pasar de sesenta y se quedaba fuera sin haber hecho
   nada raro (y con el token de dispositivo, que es uno por rol, todos los de su rol). Los
   cupos de todos juntos —las verificaciones con Google, los cuerpos grandes, `/verificar`—
   cuentan igual, en ventana fija (`contarEnVentana`).
3. **Lista blanca de dominios en `/expandir`.** Ese camino hace que un servidor de Google
   salga a internet con una dirección que mandó quien llama. Sin la lista, un token
   cualquiera convertiría el puente en trampolín para tocar direcciones que quien llama no
   alcanza. Solo Maps.
4. **El texto que entra de afuera no puede volverse fórmula.** A lo que empieza con `=`,
   `+`, `-` o `@` se le antepone un apóstrofo. Sin eso, un `=IMPORTXML(...)` metido en la
   dirección de un proyecto haría que la hoja saliera a internet sola, o leyera otra
   pestaña y la escupiera. Y tampoco puede volverse HTML: los diálogos de ⚡ AL3D (y el correo
   al dueño) **escapan el nombre del proyecto** antes de pintarlo. Ese nombre lo escribe
   cualquier teléfono que da altas, y el diálogo corre con la sesión del dueño de la hoja,
   desde la que `google.script.run` llama cualquier función del script que no termine en
   guion bajo; por eso las que tocan secretos (`secretoDelSello_`, `iaLlaves_`,
   `iaOrdenDeLlaves_`, `configurarTokensDelPuente_`) ahora sí terminan en uno. El diálogo de
   ⚡ AL3D → Tokens del puente rota los tokens con `rotarTokensDelPuente`, que los cambia y no
   devuelve nada. Y lo mismo las rutas que solo llama `doPost` —`rutaSalud_`, `rutaEsquema_`,
   `rutaJalar_`, `rutaEmpujar_`, `rutaExpandir_`, `rutaSolicitar_`, `rutaCancelarSolicitud_`,
   `rutaPendientes_`, `rutaEstado_`, `rutaAutorizar_`, `rutaRechazar_`, `rutaRevocar_`,
   `rutaVerificar_`, `rutaIA_`— y la bitácora (`anotar_`): públicas, un guion en un diálogo
   podía llamar `rutaAutorizar` con una identidad inventada y sellar un precio a nombre de
   cualquier correo. Lo que se corre desde el menú o a mano (`revocarAutorizacion`,
   `configurarAutorizaciones`) sigue sin guion bajo.
5. **Bitácora.** Toda escritura que entra queda anotada en una pestaña oculta: cuándo, qué
   rol, qué folio y qué campos. Es lo que convierte «algo se movió» en «esto se movió, el
   martes, desde el teléfono de pagos».
6. **El rol también cierra la lectura.** `/jalar` le quita a fabricación las diez columnas
   de dinero —subtotal, neto, anticipo, liquidación, pendiente, comisiones, cuenta y fecha
   de liquidación— antes de mandar la fila. El estatus sí baja, porque es una etiqueta de
   estado y el tablero de obra la necesita para saber qué ya se cobró. Un rol que no esté
   en la tabla tampoco ve el dinero: el default es cerrado.
7. **El dinero solo sube cuando cambió.** Mover la etapa o poner un pin desde el teléfono ya
   no reescribe `Precio Subtotal`, `Anticipo`, `IVA` ni `Proyecto` con lo que el teléfono
   tenía guardado: esas celdas viajan en el alta de la fila, o cuando la operación dice que
   ese campo fue justo lo que se cambió. Y el anticipo corregido en la hoja **baja** al
   teléfono, que antes seguía estimando el saldo con el viejo.
   Lo mismo, desde septiembre de 2026, con **el estatus, la cuenta, la etapa, la dirección, el
   pin y el tipo de trabajo**: suben solo cuando son lo que cambió. Antes viajaban en cada
   subida con lo que el teléfono tenía al encolar, y pisaban lo que PAGOS acababa de corregir
   en la hoja: un LIQUIDADO regresaba al estatus de antes porque Dirección movió una etapa
   antes de su siguiente bajada. Una
   operación que encoló una versión anterior de la app no dice qué cambió, y de ésa se manda
   lo que se mandaba entonces.
8. **Las solicitudes son de quien las pide.** `/solicitar` no pisa la solicitud pendiente
   que otra persona tenga sobre el mismo folio (la propia sí se reemplaza, y Dirección puede
   con cualquiera); `/cancelar` solo la retira quien la pidió o Dirección; y `/estado` le
   contesta a cada quien solo por sus solicitudes, y solo con un sello emitido **después** de
   su última: un sello trae el precio autorizado, los ajustes y la nota, y fabricación no ve
   dinero en ninguna otra parte. Antes, con una autorización vigente de antes, volver a pedir
   contestaba «autorizada» con el sello viejo.
9. **Un abono que no se escribió no vuelve como escrito.** Si la pestaña «Abonos comisión» no
   existe o ya no tiene renglones libres, el `Abono Comision` vuelve en `rechazadas` con su
   razón; y si era lo único de la operación, la operación vuelve `ok: false`. Antes se perdía
   en silencio: el teléfono lo daba por registrado y la comisión seguía pendiente en la hoja.

Y lo que el puente **no** puede hacer, por construcción: escribir una fórmula, escribir una
columna que no esté en su mapa, mandar correo, o tocar otra hoja del Drive.

### Lo que la hoja rechaza, el teléfono lo aparta

Un rechazo de **una** operación —un alta desde un teléfono cuyo rol no escribe el nombre, un
cambio de puros campos que ese rol no toca, una venta que ya no está en la hoja— vuelve
marcado `definitivo`, y la bandeja lo **aparta** (estado `rechazada`, con la razón) y sigue
con lo demás. Antes volvía como el mismo `ROL_SIN_PERMISO` de una llave que la hoja no
reconoce y el bombeo se paraba ahí: lo de detrás no salía nunca. Lo apartado no se pierde:
la banda de frescura del Tablero lo dice con su razón, y `sync.resolver(id, 'mio')` lo
devuelve a la cola (por ejemplo, cuando ese teléfono ya entra como Dirección).

### Lo que sigue abierto, y hay que saberlo

- **La llave vive en el teléfono.** Quien tenga un teléfono desbloqueado con la sesión
  abierta tiene ese rol. Contra eso: quitar su renglón de «Accesos» (surte efecto en
  minutos) y, si tenía token de emergencia, *Generar tokens nuevos* en la hoja. Y no solo
  quien tiene el teléfono: el token de Google (`al3d_pf_gtok`) y el del puente
  (`al3d_pf_puente`) están en el `localStorage` de un origen que GitHub Pages comparte con
  todas las páginas de la misma cuenta. Ver «El origen compartido» en el
  [`README`](../README.md#el-origen-compartido).
- **Dirección y pagos sí ven todo el dinero.** El filtrado de lectura protege al teléfono
  de fabricación, que es el que anda en la calle y en el taller. Los otros dos roles
  valen lo que vale la hoja entera.
- **La hoja puede quedarse con una versión vieja del código.** Guardar en Apps Script no
  publica. `salud` contesta su `version` —hoy `puente-sheets-11`— justo para poder verlo, y
  «Probar» lo compara con la que la plataforma espera y dice qué falla con la que hay.

## Si algo falla

- **«Probar» dice que no es el puente y menciona la pantalla de Google.** La implementación
  quedó con acceso *Solo yo*. Tiene que estar en **Cualquier usuario**: Apps Script →
  Implementar → Gestionar implementaciones → lápiz → Quién tiene acceso.
- **«Ese correo no está en la pestaña «Accesos»».** Agrega su renglón (correo y rol) en la
  hoja. Si la pestaña no existe, «Revisar el esquema» lo dice y `prepararHojaParaElPuente()`
  la crea.
- **401 en todo, en un teléfono que entra con token.** El token de ese teléfono no está en la
  lista. Vuelve a abrir ⚡ AL3D → Tokens del puente en la hoja y pega el que le toca.
- **«La venta V-… ya no está en la hoja».** Alguien borró esa fila. El cambio no se escribió
  en ninguna otra, y el proyecto queda marcado: en su ficha, Dirección elige «Volver a darla de
  alta en la hoja» (una fila nueva con todos sus datos) o «Dejarla fuera de la hoja». Registrarla
  otra vez desde el cotizador no sirve: la plataforma contesta que ya es proyecto. Mientras está
  fuera, sus cambios no se mandan pero no se tiran: el teléfono anota que quedaron sin mandar, y lo
  mismo con los cambios que ya habían rebotado al dejarla fuera. Si la fila vuelve a la hoja (con su
  folio o con su «Folio cotizacion»), la siguiente bajada quita la marca y la decisión de dejarla
  fuera, y manda de una vez lo que se cambió mientras tanto, con la etapa y la instalación de ese
  día. Lo que se cambió aquí de la cuenta, el estatus o el anticipo no lo pisa la fila que vuelve:
  se le manda a ella. Si la venta ya está como «No se dio», su única salida en la ficha es dejarla
  fuera de la hoja.
- **Una venta dice «Dos veces en la hoja».** Dirección la volvió a dar de alta y después alguien
  deshizo el borrado de la fila vieja (o la metió otra vez a mano): dos filas traen la misma venta.
  El teléfono se queda con la fila a la que ya mandaba, Control la cuenta una vez y nada se borra.
  En la hoja, Dirección borra la que sobra —revisa antes cuál tiene los cobros—; con la siguiente
  bajada el aviso se va, y si la que quedó es la otra, la venta se ata a ella.
- **Una tarjeta importada dice «Ya no está en la hoja».** Su fila no vino en una bajada completa,
  o un cambio rebotó contra ella. Cualquiera que tenga ese teléfono decide en la ficha: «Quitar del
  tablero» (solo si nada de este teléfono la nombra: una instalación que no esté cancelada, un
  movimiento del almacén o material) o «Dejarla». Las marcas son de cada teléfono y no viajan.
- **Una tarjeta dice «Repetida».** Es la copia importada de una venta que este teléfono ya
  tenía. Se junta sola solo si es seguro que es la misma venta (la fila trae su «Folio
  cotizacion» o su mismo nombre) y no se pierde nada: ni su etapa, ni sus notas, pin o plazo, ni
  los datos que se le escribieron aquí (dirección, teléfono del cliente, entrecalles,
  compromiso…). Si no, Dirección elige en la ficha «Juntar», «No es la misma venta» o, si la de
  aquí está como «No se dio» y la fila también, quitar la copia. Si la de aquí dice «No se dio» y
  la fila la trae viva, la ficha no ofrece quitarla: o se marca «No se dio» también en la hoja, o
  se regresa la de aquí a su etapa y se juntan. Mientras tanto, Control cuenta la fila viva.
  «Juntar» espera a que salga lo que la copia tenga en la bandeja (una instalación recién
  agendada, por ejemplo). Una venta que se ató a su fila por el nombre se queda atada aunque
  después se corrija el nombre en la hoja; si la fila pasa a traer el «Folio cotizacion» de otra
  venta, deja de ser suya y la ficha lo dice («ya es de otra venta»).
- **Una escritura vuelve como rechazada.** El mensaje dice cuál propiedad y por qué. Casi
  siempre es un rol que no puede escribir eso, o un valor que no está en la lista.
- **Cambiaste el código y no pasa nada.** Guardar no publica: hay que implementar una
  **versión nueva**.
