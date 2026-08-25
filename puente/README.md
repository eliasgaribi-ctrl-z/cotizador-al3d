# El puente a Notion — fase 3

**El lado del navegador ya está escrito.** El relevo vive en `js/datos/puente.js`, se
enchufa solo al arrancar si este dispositivo tiene URL y token, y la pantalla de
**Ajustes → El puente** trae los pasos, un generador de los tres tokens y los cuatro
botones: *Probar*, *Revisar el esquema*, *Mandar lo que está pendiente* y *Traer el dinero
de Notion*. Lo único que falta es lo de abajo: ~25 minutos de cuentas, una vez.

**No hace falta para usar la plataforma.** Sin puente, la plataforma funciona completa en un
dispositivo: agenda, material, mapa, avisos y los `.ics` con sus alarmas. El puente añade dos
cosas y solo dos:

1. Que los **tres departamentos vean lo mismo** desde tres teléfonos distintos.
2. Que el **espejo del dinero** venga de Notion en vez de teclearse.

Si eso no hace falta todavía, no montes esto. La plataforma no se rompe sin él y lo dice en
su pantalla de Ajustes.

---

## Por qué hace falta un servidor para esto

Tres razones, y ninguna se arregla con más código del lado del navegador:

1. La API de Notion **no manda `Access-Control-Allow-Origin`**. El navegador bloquea toda
   petición cross-origin. Hay dos issues abiertos en el SDK oficial de Notion por esto.
2. `Notion-Version` es una cabecera no simple, así que dispararía un preflight que tampoco
   sería respondido.
3. Y la de fondo: `Authorization: Bearer secret_…` es un token de **escritura total** sobre
   todo tu workspace. Aunque Notion arreglara el CORS mañana, ese token no puede vivir en un
   HTML publicado en GitHub Pages, donde cualquiera lo lee con «ver código fuente».

**El puente no es un rodeo al CORS. Es dónde vive el secreto.**

Cloudflare Workers: 100,000 peticiones al día en el plan gratuito, sin tarjeta y sin cláusula
de «no comercial». Un proxy es puro esperar red, así que el límite de 10 ms de CPU por
invocación no se toca. Se edita en el navegador: no hace falta node, ni `wrangler`, ni
terminal.

---

## Montarlo — una vez, ~25 minutos

### 1. La integración de Notion
1. Ve a **notion.so/my-integrations** → *New integration*, tipo **Internal**.
2. Cópiate el token (empieza con `ntn_`). Es lo único secreto de todo esto.
3. Abre la página **Finanzas - AL3D (ELIAS)** en Notion → menú `···` → *Connections* →
   *Connect to* → tu integración.
   **Compártele la página padre, no solo la base:** así hereda el acceso y no hay que
   repetirlo cada vez que agregues algo dentro.

### 2. El Worker
1. **dash.cloudflare.com** → *Workers & Pages* → *Create* → *Worker*. Ponle `puente-al3d`.
2. *Edit code*, borra lo que trae y pega **todo** `puente/worker.js`. *Deploy*.
3. *Settings* → *Variables and Secrets*, y agrega estas cuatro. **Las tres primeras van como
   `Secret` (encriptado), no como `Text`:**

   | Nombre | Tipo | Qué va |
   |---|---|---|
   | `NOTION_TOKEN` | Secret | el token de la integración |
   | `TOKENS` | Secret | `{"<token1>":"direccion","<token2>":"fabricacion","<token3>":"pagos"}` |
   | `DS_VENTAS` | Text | `56fa21d8-8e7d-4e16-b874-455fd6c65643` |
   | `ORIGENES` | Text | `https://eliasgaribi-ctrl-z.github.io` |

   Los tres tokens de dispositivo **te los arma la plataforma** (ver el recuadro de abajo).
   **Uno por teléfono.** Son la única frontera de permisos real del sistema: el de
   fabricación puede escribir etapa de obra y no puede escribir el anticipo, aunque su
   teléfono diga «Dirección».

> **Los tres tokens no los teclees a mano.** En **Ajustes → El puente** hay un botón,
> *Generar los tres tokens*, que arma el JSON de `TOKENS` ya listo para pegar y te deja
> poner en este teléfono el que le toque. Es el paso que más se rompe de los doce: una coma
> de más o una comilla curva del teclado del celular y el Worker contesta 401 a todo sin
> poder decir por qué. Los tres se ven **una sola vez**: al salir de la pantalla se olvidan.

### 3. Las siete propiedades que faltan en Notion
Entra a **Ajustes → El puente** y aprieta *Revisar el esquema*. Te va a listar lo que falta
con su nombre y su tipo exactos, y hay un botón para copiar la lista entera. (También sale
en `https://puente-al3d.<tu-subdominio>.workers.dev/esquema` con su token.)

**Mientras falte una sola, dar de alta una venta rebota**, y con razón: Notion contesta 400
a un cambio contra una propiedad que no existe. La pantalla lo dice con esas palabras.

**Créalas a mano.** El puente las detecta y **no las crea**, y es a propósito: es la única
garantía de que no se rompan las siete vistas ni las cinco fórmulas de una base con tres años
y $3.7 M encima. Una propiedad creada por API con el tipo equivocado es media hora de
arreglar a mano y una vista que nadie nota que dejó de filtrar.

### 4. Los teléfonos
En cada uno: **Ajustes → El puente**, pega la URL del Worker y el token que le toca.
*Probar* tiene que contestar en verde y decirte qué rol reconoció. Guardar ya prueba solo:
guardar una URL sin decir si sirve es cómo alguien se va del taller creyendo que sincroniza.

Y a partir de ahí **nadie tiene que apretar nada más**. Al abrir la plataforma, y cada vez
que vuelve la señal, lo que está en la bandeja sale solo y el espejo del dinero baja solo.
Los botones de mandar y traer siguen ahí para forzarlo.

---

## Lo que el puente lleva hoy, y lo que no

Lleva **la venta y su instalación**: el proyecto ganado se convierte en una fila de
`Ventas - AL3D` con lo que el cotizador siempre tuvo y nunca llegaba —la dirección, el
punto del mapa, el tipo de trabajo derivado, el folio— y la fecha de instalación cuando se
agenda.

**No lleva** el libro del almacén, el catálogo de material, las listas de compra, los avisos
ni las constantes del taller: sus bases de Notion todavía no existen. Eso **no se descarta y
no se cuenta como pendiente**. Se aparta en la bandeja con la razón escrita, se dice en
Ajustes («3 cambios apartados que este puente no lleva»), y el día que exista su base se
reincorpora solo en el primer bombeo. Descartarlo perdería la historia; contarlo como
pendiente daría un contador que nunca baja, y un número que nunca baja se aprende a ignorar.

---

## Lo que el puente NO hace, y no es descuido

1. **No altera el esquema de Notion.** Detecta y avisa. Ver arriba.
2. **No recalcula ninguna fórmula de Notion.** `Precio Neto `, `Pago Pendiente`,
   `Comisiones`, `Comision Restante` y `Fecha Comision` se leen. Si intentas escribirlas, las
   rechaza con el motivo. Dos implementaciones de la misma fórmula divergen en semanas, y
   entonces el sistema da dos respuestas a la misma pregunta.
3. **No escribe nada fuera de la lista blanca del rol**, ni aunque el teléfono lo mande. Lo
   rechazado se devuelve nombrado, nunca se descarta en silencio: una escritura que se ignora
   sin decirlo es la peor falla posible, porque el usuario cree que guardó.
4. **No acepta un valor inventado en ningún campo de lista.** Ni en `Estatus` (solo
   `REPARANDO`, `COBRANDO`, `FABRICACION`, `LIQUIDADO`), ni en `Cuenta `, ni en
   `Etapa de obra`, ni en `Tipo de trabajo`. Pegar un valor inexistente en un *status*, un
   *select* o un *multi_select* **no falla**: Notion **lo crea**. Así se ensució el esquema
   durante meses y así ya no. Lo rechazado vuelve nombrado, con su razón.
5. **No crea la misma venta dos veces.** Antes de dar de alta busca por `Folio cotizacion`,
   porque Notion no tiene restricciones de unicidad y no se le puede pedir «crea esto solo
   si no está». El caso no es raro: el teléfono manda el alta, Notion la crea, la respuesta
   se pierde en un elevador y la bandeja reintenta. Sin esa búsqueda serían dos ventas, con
   dos anticipos y dos comisiones sumando en las siete vistas. No cierra la ventana del
   todo —dos altas simultáneas del mismo folio desde dos teléfonos seguirían pasando— la
   estrecha de «cada reintento duplica» a «solo un empate exacto».

---

## Cuando algo falle — el runbook

| Lo que ves | Qué pasó | Qué hacer |
|---|---|---|
| «Este teléfono no tiene un token válido» (401) | El token no está en `TOKENS`, o se pegó con un espacio | Vuelve a pegarlo en Ajustes. Revisa que `TOKENS` sea JSON válido |
| «El puente no tiene acceso a esa página» (403) | La integración no está conectada a la página | Notion → `···` → *Connections* → conecta la integración |
| «Notion está limitando las peticiones» (429) | Se pasó el límite | Nada. La bandeja lo reintenta sola, respetando el `Retry-After` |
| «Notion no está respondiendo» (5xx) | Notion caído | Nada. Todo quedó en el teléfono y se manda al volver |
| «Al puente le faltan sus secretos» (500) | Falta `NOTION_TOKEN` o `TOKENS` | Cloudflare → Settings → Variables |
| El navegador dice CORS | Tu dominio no está en `ORIGENES` | Agrégalo, separado por comas, sin barra final |
| «Esa fila cambió en Notion» | Alguien la editó al mismo tiempo | La pantalla de conflictos te enseña las dos y tú eliges |
| Notion rechaza el alta y nombra una propiedad | Falta crearla a mano en la base | Ajustes → *Revisar el esquema* → créala con ese nombre y ese tipo |
| «Este teléfono no puede dar de alta la venta» | El token es de fabricación o de pagos | Se da de alta desde el de Dirección. Desde ese ya puedes mover la obra |

---

## Cómo se prueba sin cuenta

Dos pruebas cubren esto y corren sin Notion, sin Cloudflare y sin tarjeta:

- `pruebas/worker.mjs` importa **este mismo Worker** y lo corre contra una Notion de
  mentiras: los tokens, la lista blanca por rol, las cuatro validaciones, las fórmulas, las
  fechas y la fila duplicada. Va en `pruebas/correr.sh` con todas las demás.
- `pruebas/navegador/puente.mjs` levanta su propio servidor y recorre el camino entero con
  clics de verdad: cotizar → autorizar → «Registrar como proyecto ganado» → abrir la
  plataforma → y comprueba que la venta salió sola con su dirección y su tipo de trabajo, que
  el id de la página se guardó, y que el espejo del dinero bajó.

  ```
  node pruebas/navegador/puente.mjs
  ```

Si tocas este archivo, corre las dos antes de pegarlo en Cloudflare.

**La regla de oro cuando el puente esté caído:** no pasa nada. La plataforma sigue funcionando
con lo que tiene en el teléfono, y el botón **Copiar fila para Notion** del cotizador sigue
siendo el camino manual. Ese botón no se retira nunca, precisamente para esto.

---

## Costo

Cero, y sin tarjeta. 100,000 peticiones al día en el plan gratuito de Workers; tres personas
sincronizando gastan del orden de cien. Si algún día se pasara, el aviso llega por correo de
Cloudflare antes de que se corte nada.
