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

| Camino | Qué hace |
|---|---|
| `GET /salud` | Estado y la lista de lo que **este rol** puede escribir |
| `GET /esquema` | Qué columnas le faltan a la hoja. Las **detecta**, no las crea |
| `GET /jalar` | **Todas** las filas de Ventas en una sola página (desde `puente-sheets-6`; antes de 50 en 50, y una fila que el reacomodo cambiaba de página a media bajada no salía): el récord de ventas de Control sale de aquí. **El dinero solo para quien lo ve** |
| `POST /empujar` | Hasta 25 operaciones, filtradas por la lista blanca del rol. Lo que devuelve pasa por el mismo filtro de lectura que `/jalar` |
| `GET /expandir` | Sigue un link corto de Maps hasta el largo, el que trae coordenadas |

Los tres roles y lo que cada uno puede escribir son los mismos de antes:

- **dirección** — todo.
- **fabricación** — mueve la obra y el almacén. **No toca dinero**: ni anticipo, ni
  liquidación, ni cuenta, ni estatus de cobranza. Y desde `puente-sheets-3` tampoco lo
  **ve**: las cifras no bajan a ese teléfono.
- **pagos** — cobra. **No mueve la obra**.

El rol sale de la pestaña **«Accesos»** de la hoja —el correo con el que se entró con Google—
o, de emergencia, del token de dispositivo. Cambiar el segmento de rol en Ajustes da otro
tablero, **no da permisos**: quien es fabricación sigue recibiendo un rechazo si manda
`Anticipo`, diga lo que diga el teléfono.

---

## Las diferencias de contrato contra la versión de Notion

1. **`Abono Comision` ya no es una celda.** En Notion se sobrescribía, y por eso solo
   sobrevivía el último pago. En la hoja es la suma de la pestaña **Abonos comisión**, así
   que escribirlo significa **agregar un renglón**. Se gana el historial de parcialidades
   sin que el teléfono se entere.

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
   raspar la hoja entera con una llave robada.
3. **Lista blanca de dominios en `/expandir`.** Ese camino hace que un servidor de Google
   salga a internet con una dirección que mandó quien llama. Sin la lista, un token
   cualquiera convertiría el puente en trampolín para tocar direcciones que quien llama no
   alcanza. Solo Maps.
4. **El texto que entra de afuera no puede volverse fórmula.** A lo que empieza con `=`,
   `+`, `-` o `@` se le antepone un apóstrofo. Sin eso, un `=IMPORTXML(...)` metido en la
   dirección de un proyecto haría que la hoja saliera a internet sola, o leyera otra
   pestaña y la escupiera.
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
  minutos) y, si tenía token de emergencia, *Generar tokens nuevos* en la hoja.
- **Dirección y pagos sí ven todo el dinero.** El filtrado de lectura protege al teléfono
  de fabricación, que es el que anda en la calle y en el taller. Los otros dos roles
  valen lo que vale la hoja entera.
- **La hoja puede quedarse con una versión vieja del código.** Guardar en Apps Script no
  publica. `salud` contesta su `version` —hoy `puente-sheets-6`— justo para poder verlo, y
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
  en ninguna otra; si la venta sigue viva, vuelve a registrarla desde el cotizador.
- **Una escritura vuelve como rechazada.** El mensaje dice cuál propiedad y por qué. Casi
  siempre es un rol que no puede escribir eso, o un valor que no está en la lista.
- **Cambiaste el código y no pasa nada.** Guardar no publica: hay que implementar una
  **versión nueva**.
