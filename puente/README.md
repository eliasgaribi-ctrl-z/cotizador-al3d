# El puente a Notion — fase 3

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

   Los tres tokens de dispositivo los generas donde sea con `crypto.randomUUID()` — en la
   consola del navegador, por ejemplo. **Uno por teléfono.** Son la única frontera de
   permisos real del sistema: el de fabricación puede escribir etapa de obra y no puede
   escribir el anticipo, aunque su teléfono diga «Dirección».

### 3. Las siete propiedades que faltan en Notion
Abre `https://puente-al3d.<tu-subdominio>.workers.dev/esquema` con su token, o entra a
**Ajustes → El puente** en la plataforma y aprieta *Revisar esquema*. Te va a listar lo que
falta con su nombre y su tipo exactos.

**Créalas a mano.** El puente las detecta y **no las crea**, y es a propósito: es la única
garantía de que no se rompan las siete vistas ni las cinco fórmulas de una base con tres años
y $3.7 M encima. Una propiedad creada por API con el tipo equivocado es media hora de
arreglar a mano y una vista que nadie nota que dejó de filtrar.

### 4. Los teléfonos
En cada uno: **Ajustes → El puente**, pega la URL del Worker y el token que le toca.
*Probar* tiene que contestar en verde y decirte qué rol reconoció.

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
4. **No valida un estatus inventado.** Solo acepta `REPARANDO`, `COBRANDO`, `FABRICACION` y
   `LIQUIDADO`. Pegar un valor inexistente en una propiedad de tipo *status* **no falla**:
   Notion **lo crea**. Así se ensució el esquema durante meses y así ya no.

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

**La regla de oro cuando el puente esté caído:** no pasa nada. La plataforma sigue funcionando
con lo que tiene en el teléfono, y el botón **Copiar fila para Notion** del cotizador sigue
siendo el camino manual. Ese botón no se retira nunca, precisamente para esto.

---

## Costo

Cero, y sin tarjeta. 100,000 peticiones al día en el plan gratuito de Workers; tres personas
sincronizando gastan del orden de cien. Si algún día se pasara, el aviso llega por correo de
Cloudflare antes de que se corte nada.
