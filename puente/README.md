# El puente — a Google Sheets

**El lado del navegador ya está escrito.** El relevo vive en `js/datos/puente.js`, se
enchufa solo al arrancar si este dispositivo tiene URL y token, y la pantalla de
**Ajustes → El puente** trae los pasos, un generador de los tres tokens y los cuatro
botones: *Probar*, *Revisar el esquema*, *Mandar lo que está pendiente* y *Traer el dinero*.

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
| `GET /jalar` | El espejo, de 50 en 50, con cursor. **El dinero solo para quien lo ve** |
| `POST /empujar` | Hasta 25 operaciones, filtradas por la lista blanca del rol |
| `GET /expandir` | Sigue un link corto de Maps hasta el largo, el que trae coordenadas |

Los tres roles y lo que cada uno puede escribir son los mismos de antes:

- **dirección** — todo.
- **fabricación** — mueve la obra y el almacén. **No toca dinero**: ni anticipo, ni
  liquidación, ni cuenta, ni estatus de cobranza. Y desde `puente-sheets-3` tampoco lo
  **ve**: las cifras no bajan a ese teléfono.
- **pagos** — cobra. **No mueve la obra**.

Cambiar el segmento de rol en Ajustes da otro tablero, **no da permisos**: el token de
fabricación sigue recibiendo un rechazo si manda `Anticipo`, diga lo que diga el teléfono.

---

## Tres diferencias de contrato contra la versión de Notion

1. **`Abono Comision` ya no es una celda.** En Notion se sobrescribía, y por eso solo
   sobrevivía el último pago. En la hoja es la suma de la pestaña **Abonos comisión**, así
   que escribirlo significa **agregar un renglón**. Se gana el historial de parcialidades
   sin que el teléfono se entere.

2. **`Fecha Anticipo e Instalacion` era un rango.** En la hoja son dos columnas: la del
   anticipo y la de instalación, separadas.

3. **`Pago Pendiente` sale con el signo de Notion** —negativo cuando falta cobrar— para no
   cambiarle el significado a una cifra que la plataforma ya pinta. Dentro de la hoja se ve
   al derecho: positivo es lo que te deben.

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

## Cómo está cerrado

La dirección del puente es pública —igual que lo era la del Worker— y **la puerta es el
token**. Alrededor de eso hay cinco cosas más:

1. **Todo por POST, el token en el cuerpo.** Nunca queda escrito en una URL. Ver arriba.
2. **Sesenta peticiones por minuto por token.** Es más de lo que hacen tres teléfonos
   trabajando, y mucho menos de lo que sirve para raspar la hoja entera con un token
   robado.
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

Y lo que el puente **no** puede hacer, por construcción: escribir una fórmula, escribir una
columna que no esté en su mapa, mandar correo, o tocar otra hoja del Drive.

### Lo que sigue abierto, y hay que saberlo

- **El token vive en el teléfono.** Quien tenga un teléfono desbloqueado tiene ese rol.
  Contra eso solo hay rotar: *Generar tokens nuevos* en la hoja invalida los tres.
- **Dirección y pagos sí ven todo el dinero.** El filtrado de lectura protege al teléfono
  de fabricación, que es el que anda en la calle y en el taller. Los otros dos tokens
  valen lo que vale la hoja entera.
- **La hoja puede quedarse con una versión vieja del código.** Guardar en Apps Script no
  publica. `salud` contesta su `version` —hoy `puente-sheets-3`— justo para poder verlo.

## Si algo falla

- **«Probar» dice que no es el puente y menciona la pantalla de Google.** La implementación
  quedó con acceso *Solo yo*. Tiene que estar en **Cualquier usuario**: Apps Script →
  Implementar → Gestionar implementaciones → lápiz → Quién tiene acceso.
- **401 en todo.** El token de ese teléfono no está en la lista. Vuelve a abrir
  ⚡ AL3D → Tokens del puente en la hoja y pega el que le toca.
- **Una escritura vuelve como rechazada.** El mensaje dice cuál propiedad y por qué. Casi
  siempre es un rol que no puede escribir eso, o un valor que no está en la lista.
- **Cambiaste el código y no pasa nada.** Guardar no publica: hay que implementar una
  **versión nueva**.
