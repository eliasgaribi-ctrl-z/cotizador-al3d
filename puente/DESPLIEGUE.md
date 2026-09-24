# Cómo se monta el puente

Diez minutos, una vez. Ya no hay cuenta de Cloudflare, ni `wrangler`, ni secretos que
guardar fuera del repo: el puente vive dentro de la hoja.

## Lo que hay montado

| Qué | Dónde |
|---|---|
| El sitio | GitHub Pages, desde `main` |
| El puente | Apps Script de la hoja **«Finanzas AL3D — Ventas y Comisiones»**, publicado como aplicación web |
| El código del puente | `puente/hoja-apps-script.gs` (este directorio), versionado para poder compararlo |

El sitio se sigue redesplegando solo con cada push. **El puente no**: es código de Apps
Script y se publica desde su editor.

## Los pasos

1. Abre la hoja → **Extensiones → Apps Script**.
2. Pega el contenido de `puente/hoja-apps-script.gs` en `Código.gs` y guarda. Si la hoja ya
   tenía código, **antes** bájalo y compáralo con éste (ver `README.md`, «Antes de pegar
   nada»): la copia que manda es la de la hoja.
3. **Implementar → Nueva implementación → Aplicación web**, con:
   - *Ejecutar como*: **Yo**. Es lo que le da acceso a la hoja sin pedirle nada a nadie.
   - *Quién tiene acceso*: **Cualquier usuario**. Si queda en *Solo yo*, el teléfono recibe
     la pantalla de inicio de sesión de Google en vez de JSON, y «Probar» lo dice.
4. Copia la **URL** que termina en `/exec`. La plataforma trae una de fábrica
   (`URL_PUENTE` en `js/datos/prefs.js`); si es otra, cámbiala ahí o pégala en cada teléfono.
5. En la hoja, pestaña **«Accesos»**: un renglón por persona, con su correo de Google y su
   rol (`direccion`, `fabricacion` o `pagos`). La crea `prepararHojaParaElPuente()` —corre al
   final de **⚡ AL3D → Actualizar formato y vistas**— con el dueño de la hoja ya dentro.
6. En cada teléfono: **Entrar con Google** con ese correo, y en **Ajustes → El puente**,
   **Probar**. Tiene que decir el rol y el correo. No hay que pegar nada.
7. La salida de emergencia, para el día que Google no conteste: **⚡ AL3D → Tokens del
   puente**. Ahí están la liga y tres tokens de dispositivo, uno por rol; se generan solos la
   primera vez y se pegan en **Ajustes → El puente** del teléfono que lo necesite.

## Dónde viven los secretos

Los tres tokens de dispositivo se guardan en las **propiedades del script**
(`PropertiesService`), no en el código, para que no acaben en el historial del repositorio.
Se generan con `Utilities.getUuid()` y se rotan desde la misma pantalla con
*Generar tokens nuevos* — ojo, eso deja fuera a los teléfonos que entraban con token hasta
que pegues los nuevos. A quien entra con Google no le pasa nada.

Ahí mismo viven, desde `puente-sheets-6`, dos marcas que no son secretos pero que **no hay
que borrar**: `FOLIO_MAS_ALTO` (el folio más alto que se ha repartido; sin ella, borrar la
última venta volvía a repartir su folio) y `PUENTE_Y_AD_ALINEADAS` (la fecha en que Y:AD se
realinearon; sin ella, el reacomodo no mueve ninguna fila). Hay una tercera de paso,
`PUENTE_Y_AD_VISTA_PREVIA`, que guarda la huella de la última vista previa y se borra sola al
realinear.

No hay nada más que esconder. El token de Notion, que era la razón de ser del Worker, ya no
existe.

## Cuando cambies el código

Guardar **no** publica. Hay que ir a **Implementar → Gestionar implementaciones → lápiz →
Versión: Versión nueva → Implementar**. La URL no cambia: los teléfonos no se tocan.

Y si tocas el `.gs` en el repo, acuérdate de que la copia que manda es la de la hoja: hay
que pegarlo allá. `pruebas/puente.mjs` compara los dos lados y falla si los vocabularios se
separan; la plataforma, al «Probar», compara la versión que contesta la hoja con la que ella
espera y avisa si quedó vieja.

**Al pasar a `puente-sheets-4`** (septiembre de 2026) hace falta que exista la columna
**AD «Porcentaje comision»**, y no es opcional: `ULTIMA_COL` pasó a 30, así que `/jalar` pide
treinta columnas y **truena** si la hoja tiene veintinueve. La crea
`prepararHojaParaElPuente()`, que corre al final de **⚡ AL3D → Actualizar formato y vistas**
(`mejorarTodo`). Si no quieres reescribir el diseño entero solo por una columna, basta con
escribir el encabezado a mano en `AD1`: eso es lo que el puente busca.

Lo que **no** cambia es la fórmula de la comisión. En AL3D la comisión es fija —10 % del
subtotal, sin IVA— y `R` se queda así. La columna AD viaja por el puente para que el teléfono
y la hoja guarden el mismo dato, pero la hoja no la lee.

**Cuidado con el selector de funciones del editor.** Tiene más de cien nombres (126 desde
`puente-sheets-6`; los que terminan en guion bajo no salen) y `prepararHojaParaElPuente` está
a dos renglones de `mejorarTodo`. Peor: el selector revierte la elección si cierras la lista
con Esc o Enter, así que es fácil creer que elegiste una y ejecutar otra. Si vas a correr algo
desde ahí, confírmalo en **Ejecuciones** —dice qué función corrió de verdad— antes de dar por
hecho que pasó.

Estado al 19 de septiembre de 2026: la hoja corre `puente-sheets-4`, implementada como
**Versión 5**, en la misma URL de siempre. El 20 el repositorio pasó a `puente-sheets-5`
(entrar con Google).
Desde el 23 la plataforma espera **`puente-sheets-6`** (abajo). Cuál corre la hoja de verdad
lo dice **Ajustes → El puente → Probar**: si es vieja, el aviso dice qué falla con esa versión.

## 23 de septiembre de 2026 — `puente-sheets-6`

La auditoría encontró que la hoja, al reacomodarse, **revolvía** las columnas del puente, y
de ahí salían los demás síntomas. Qué cambió en el `.gs`:

- **Y:AD viajan con su fila.** `ordenarVentas` movía A:G, I:J y L:N y dejaba quietas
  «Folio cotizacion», «Etapa de obra», «Hora instalacion», «Ubicacion», «Direccion» y
  «Porcentaje comision». Tras cada reacomodo esas seis celdas eran de otra venta, y como
  `/empujar` busca la fila por «Folio cotizacion», la siguiente subida podía escribir el
  nombre y el dinero de una venta **encima de otra**.
- **«Registrar un cobro» escribía LIQUIDADO en la cuenta** (columna D) en vez del estatus (C).
  La venta seguía abierta, y la siguiente subida le cambiaba el IVA a «Sí»: un saldo fantasma
  del 16 %. Ahora escribe el estatus y reacomoda.
- **Ninguna fila sin nombre.** Un cambio contra una venta que ya no está en la hoja contesta
  `NO_ENCONTRADO` («La venta V-003 ya no está en la hoja…») en vez de crear una fila sin
  proyecto; el alta que manda PAGOS desde el cotizador (no puede escribir el nombre) tampoco
  crea nada. La fila libre que se toma se limpia antes de escribir.
- **Un folio no se reparte dos veces.** El folio nuevo sale de una marca guardada
  (`FOLIO_MAS_ALTO`) que solo sube; antes era «el más alto que se ve, más uno», y borrar la
  última venta devolvía su folio al montón. La marca se siembra sola la primera vez con
  Ventas, su respaldo, la bitácora y los abonos. Y si la fila con ese folio está atada a
  **otra** cotización, el cambio no se escribe ahí.
- **«Folio cotizacion» no se pisa en un cambio.** Un proyecto importado de la hoja en otro
  teléfono escribía ahí su folio de hoja (V-100) y Control contaba la venta dos veces.
- **`/empujar` le devuelve a cada rol solo lo que puede ver.** Fabricación recibía de vuelta
  el subtotal, el neto, el anticipo, la comisión y la cuenta.
- **Un tropiezo de Google al verificar la identidad ya no se guarda como un «no».** Un 503 o
  un 429 se guardaba sesenta segundos, y la segunda opinión de la puerta leía la caché y
  echaba a su dueño.
- **Candado en todo lo que escribe:** `alEditar` y los formularios del menú toman el mismo
  candado que `/empujar`, para que un formulario y una subida no tomen la misma fila ni el
  mismo folio.
- **`/jalar` manda la hoja entera en una página.** Paginaba por número de fila mientras la
  hoja se reacomodaba, y una venta que cruzaba de página en mitad del barrido desaparecía del
  récord de Control hasta el siguiente.
- **Una fila pegada con todo y su folio** recibe un folio nuevo al pegarse (con un aviso), y la
  columna **«Revisar»** dice «Folio repetido» si alguna se escapa.
- **`/esquema`** dice si falta la pestaña «Accesos», y la plataforma ya lo enseña.
- **La hora de instalación (AA) baja como «10:00».** Sheets vuelve hora el «10:00» que cae en
  una celda que no está en texto sin formato, y a los teléfonos les llegaba «Sat Dec 30 1899
  10:00:00 GMT-0636…». Ahora se lee como «HH:MM» guarde lo que guarde la celda, y se escribe
  en texto sin formato. Que toda la columna quede así, con las horas ya convertidas pasadas a
  texto, lo hace `prepararHojaParaElPuente` una vez: corre dentro del paso 7 de abajo.

### Cómo se sube

1. **Apps Script → `Código.gs`: copia todo lo que hay a un archivo** en tu computadora. Es la
   copia que manda. Compárala con `puente/hoja-apps-script.gs` y fusiona lo que la hoja tenga
   de más (`README.md`, «Antes de pegar nada»; con `git merge-file` contra la versión del
   repositorio de la última vez que se pegó).
2. Pega el resultado en `Código.gs` y **guarda**.
3. **Implementar → Gestionar implementaciones → lápiz → Versión: Nueva versión →
   Implementar.** La URL no cambia. (Editar la implementación que ya existe; una
   «Nueva implementación» es otra URL y los teléfonos seguirían en la vieja.)
4. Corre `revisarColumnasDelPuente` desde el selector. **No escribe nada en Ventas**: deja en
   la pestaña **«Revisión Y-AD»** lo que la realineación movería, y te lo dice en un aviso de
   la hoja y en Ejecuciones.
5. **Revisa «Revisión Y-AD»** con calma (ver abajo qué buscar). Si algo no cuadra —sobre todo
   si alguna vez se borraron o insertaron filas a mano en Ventas—, no sigas: corrígelo a mano o
   pregúntame.
6. Si está bien, corre `realinearColumnasDelPuente`. Aplica **exactamente** lo que enseñó la
   vista previa; si la hoja cambió desde entonces (subió algo un teléfono), no aplica nada,
   vuelve a escribir la vista previa y te pide revisarla otra vez (repite 5 y 6).
   Mientras no realinees, la hoja **no reacomoda filas** y los cambios de un teléfono que choquen
   con un folio de cotización revuelto **esperan** en su bandeja (no se pierden).
7. **Después** —no antes—, **⚡ AL3D → Actualizar formato y vistas** (`mejorarTodo`), para que
   la columna «Revisar» aprenda «Folio repetido» y la columna AA quede en texto sin formato.
   Antes no: rehace «Ventas (respaldo)», que es contra lo que la revisión compara los nombres.
8. En un teléfono: **Ajustes → El puente → Probar** tiene que contestar sin aviso de versión, y
   **Revisar el esquema** no tiene que listar «Accesos».

### Una sola vez: realinear Y:AD si la hoja ya quedó revuelta

Si la hoja corrió `puente-sheets-5` o anterior con la plataforma subiendo ventas, sus columnas
Y a AD ya están revueltas: cada reacomodo dejó el folio de cotización, la etapa, la dirección
y el % de una venta junto a otra. `realinearColumnasDelPuente()` las regresa con su venta
usando la **bitácora del puente**: cada subida quedó anotada con su folio, la fila en que
escribió y qué columnas; como el código de antes nunca movió Y:AD, lo que hay hoy en una celda
de Y:AD es lo que escribió ahí la última subida que la tocó, y va a la fila donde ese folio
está hoy. Lo hace una sola vez (deja `PUENTE_Y_AD_ALINEADAS` en las propiedades), **solo
cuando tú la corres y después de la vista previa**, y antes de escribir copia Ventas a la
pestaña oculta **«Ventas (antes de realinear)»**. Ninguna subida la corre sola.

Hasta que se realinea, el código nuevo **no reacomoda filas**, para no borrar la pista. Lo
único que no hay que hacer es correr `realinearColumnasDelPuente` **antes de publicar** la
versión nueva: la implementación vieja seguiría reacomodando sin mover Y:AD y revolvería otra
vez lo recién realineado. Por eso en «Cómo se sube» la vista previa va después de implementar.

En la pestaña **«Revisión Y-AD»**:

- **Celdas que cambian**: fila, folio, proyecto, columna, lo que decía y lo que queda. Mira que
  la dirección y el folio de cotización que le quedan a cada venta sean suyos.
- **De ventas que ya no están**: lo que era de un folio que alguien borró de Ventas. Sale de
  la hoja (se quedaba al lado de otra venta) y queda anotado ahí.
- **Sin dueño en la bitácora**: celdas que nadie subió por el puente —escritas a mano, o de
  antes de la bitácora—. Se quedan donde estaban; revísalas a ojo. Ojo: una celda que un
  teléfono subió y que **después** alguien corrigió a mano cuenta como del teléfono, no como
  «sin dueño»: si corregiste a mano direcciones o etapas revueltas, búscalas en «Celdas que
  cambian».
- **Ventas que cambiaron de nombre desde el último respaldo**: si nadie las renombró, una
  subida escribió otra venta **encima** (buscó la fila por un folio de cotización revuelto).
  Eso la realineación no lo arregla: la venta pisada se recupera de **Archivo → Historial de
  versiones**, o de «Ventas (respaldo)».

Dos límites que hay que saber: si desde que existe el puente alguien **borró o insertó filas
a mano** en Ventas, la fila que anotó la bitácora ya no es la misma y esas líneas de la
revisión pueden estar mal; y una fila cuyo «Folio cotizacion» dice su propio folio (V-…) es la
huella del defecto del proyecto importado: la hoja ya no la toma por llave, y se corrige sola
con el siguiente cambio que mande el teléfono dueño de esa cotización.

## Las cabeceras del sitio

En la raíz del repo hay un `_headers`, que Cloudflare Pages lee y GitHub Pages ignora.
Pages publica el repositorio entero, así que `docs/`, `pruebas/`, `puente/` y
`herramientas/` también se sirven: no son secretos —el repo es público—, pero ese archivo
les pone `X-Robots-Tag: noindex` para que un buscador no los enseñe antes que la app, y le
pone a todo `X-Content-Type-Options: nosniff`.

**Ojo con esto ahora que el `.gs` vive en el repo:** no contiene ningún secreto (los tokens
están en las propiedades del script), pero sí describe el esquema completo de la hoja. Si
eso te incomoda, el repo tendría que volverse privado; no se arregla con `_headers`.
