# El siguiente nivel — qué falta, qué cuesta y en qué orden

**Documento de decisión para el dueño.** Escrito el 3 de septiembre de 2026, después de dejar
la app abriendo en el calendario y usable en teléfono y computadora. Dice, sin adornos, qué
hace la app hoy, cuál es el límite real de usarla desde varios aparatos, y qué hay que hacer
—cuentas, clics, y dónde sí falta código— para pasar al siguiente nivel. Los tiempos y los
costos son los que están verificados en `docs/ARQUITECTURA.md` y `puente/README.md`.

---

## 1. Dónde está la app hoy

**Funciona completa en un aparato, sin cuentas, sin llaves y sin señal.** Cotizador, calendario
con la ventana de taller, proyectos, material derivado de las partidas, almacén, mapa y avisos.
Instalada en el teléfono abre en el calendario; en la computadora abre en «Todo», con el mes a
la izquierda y la fila del taller a la derecha, y se maneja con teclado (1 a 5 cambian de
módulo, ← → mueven el mes, `t` vuelve a hoy, Esc cierra).

**El límite, dicho claro: cada aparato tiene su propia base.** El cotizador guarda en
`localStorage` y la plataforma en IndexedDB, y ninguno de los dos sale del navegador donde
se escribió. Consecuencias que ya se ven:

| Lo que pasa | Por qué | Lo que hay hoy |
|---|---|---|
| Lo que cotizas en el teléfono no aparece en la computadora | no hay servidor | el **respaldo** (Ajustes → Respaldar) se manda por WhatsApp y se restaura en el otro aparato |
| Dos aparatos emiten el mismo folio `COT-0042` | el contador es local | la plataforma le pega el id del aparato por dentro; el folio del cliente sigue pudiendo repetirse. **Cotiza siempre del mismo aparato** |
| Fabricación no ve lo que dirección agendó | cada teléfono su base | el `.ics` que se descarga al agendar llega al calendario del teléfono, pero la plataforma del otro aparato no se entera |
| Los avisos solo se ven al abrir la app | una PWA no se despierta sola sin servidor | las alarmas del `.ics` sí suenan; lo demás se calcula al abrir |

Todo lo que sigue existe para quitar esa fila de límites. **Ninguno cuesta dinero al mes.**

---

## 2. Fase 2 — Google Calendar · ~15 minutos, una vez · $0

**Qué enciende:** al agendar una instalación, el evento entra solo al calendario de Google con
las tres personas como invitados, y al moverla se mueve allá. Desaparece el paso de descargar
e importar el `.ics`.

**Qué hay que hacer (solo en el aparato de Dirección):**
1. console.cloud.google.com → proyecto nuevo → habilitar **Google Calendar API**.
2. Credenciales → **OAuth Client ID, tipo Web** → en *Authorized JavaScript origins* poner
   `https://eliasgaribi-ctrl-z.github.io` (el origen, sin ruta).
3. Pantalla de consentimiento en **Testing**, con los tres correos como *test users*.
4. Pegar el Client ID en **Ajustes → Google Calendar**.

**El precio, que hay que saber antes:** la pantalla «Google no ha verificado esta app» sale una
vez por persona (Avanzado → ir de todos modos). Se quita solo con Google Workspace de pago y
consentimiento *Internal*. Con cuentas gratuitas de Gmail, se vive con ella.

**Qué código ya está:** todo. `js/nucleo/gcal.js` con crear, mover y borrar eventos, ids
deterministas para no duplicar, y la pantalla de Ajustes con los pasos. Falta cero código.

**También en fase 2:** la geocodificación de direcciones con Nominatim (para los proyectos que
llegan sin link de Maps). Requiere red y está **[POR VERIFICAR]** que Nominatim mande CORS; el
código de `js/datos/geo.js` está escrito con la cola de 1 petición por segundo que exige su
política.

---

## 3. Fase 3 — Notion + Cloudflare · ~25 minutos, una vez · $0

**Es la que resuelve «móvil y computadora».** Enciende dos cosas y solo dos:
1. **Los tres aparatos ven lo mismo.** Lo que se gana, se agenda o se avanza en uno aparece en
   los otros al abrir o al recuperar señal, a través de la bandeja de sincronización que ya
   existe (`js/datos/sync.js`).
2. **El espejo del dinero baja de Notion.** Pago pendiente, comisión restante, estatus y cuenta
   dejan de teclearse: se leen de la base `Ventas - AL3D`, que sigue siendo el libro mayor.

**Por qué hace falta un servidor y no se puede hacer desde el navegador:** la API de Notion no
manda CORS, y el token de la integración es de **escritura total** sobre el workspace — no
puede vivir en un HTML publicado. El Worker no es un rodeo al CORS: es donde vive el secreto.

**Qué hay que hacer:** los cuatro pasos de `puente/README.md`, que son cuentas y clics:
1. Integración interna de Notion, compartirle la página *Finanzas - AL3D (ELIAS)*.
2. Cuenta gratis de Cloudflare → Worker → pegar `puente/worker.js` en el editor del navegador
   → cuatro variables (tres como *Secret*). Sin node, sin terminal.
3. Crear a mano en `Ventas - AL3D` las siete propiedades que **Ajustes → Revisar el esquema**
   lista con nombre y tipo exactos. La plataforma no altera el esquema por API a propósito.
4. Pegar la URL del Worker y el token de cada aparato en cada aparato. Los tres tokens los
   genera **Ajustes → Generar los tres tokens**; no se teclean.

**Costo real:** Cloudflare Workers gratis hasta 100 000 peticiones al día, sin tarjeta y sin
cláusula de «no comercial». La plataforma manda una petición por cambio y una al abrir. Con
tres personas, no se llega ni al 1 % del límite.

**Qué código ya está:** los dos lados. `puente/worker.js` (probado entero en
`pruebas/worker.mjs` contra una Notion de mentiras), `js/datos/puente.js`, el arranque que lo
enchufa solo, y la pantalla de Ajustes con *Probar*, *Revisar el esquema*, *Mandar lo
pendiente* y *Traer el dinero*.

**Qué NO lleva todavía, y hay que decirlo:** el relevo lleva `proyectos` e `instalaciones`.
El almacén, el catálogo de material y las listas de compra **se quedan en cada aparato**,
porque no existe todavía una base de Notion a la que ir. No se pierden: se apartan en la
bandeja con la razón escrita y se reincorporan solos el día que exista. Ver §4.1.

---

## 4. Lo que sí falta de código, en orden de valor

Aquí ya no son cuentas: es trabajo de programación, y cada punto dice qué compra.

### 4.1 Que el material también viaje entre aparatos
Dos bases nuevas en Notion —`Materiales - AL3D` y `Movimientos - AL3D`— y que
`js/datos/puente.js` las lleve (`ALMACENES` pasa de dos a cuatro, con su traducción de
propiedades en `aNotion`/`deNotion` y en el Worker). El libro de movimientos es append-only,
así que sincronizarlo es más fácil que sincronizar proyectos: no hay conflictos, solo
entradas que faltan. **Compra:** que fabricación descuente en el taller y dirección vea el
almacén desde la oficina. **Tamaño:** un día de trabajo, con pruebas.

### 4.2 Un folio que no se repita
Hoy el folio es un contador por aparato. Con el Worker montado, el folio lo puede dar el
servidor —un endpoint `/folio` que devuelve el siguiente número y lo reserva— y el cotizador
lo pide al autorizar, con respaldo al contador local si no hay señal (marcado como
provisional). **Compra:** que dos aparatos puedan cotizar. **Tamaño:** medio día. Depende de
la fase 3.

### 4.3 El calendario, lo que quedó numerado
En la cabecera de `js/mod/fabricacion.js` hay seis puntos sobre un contrato ya probado. Los
dos que más se notan: el mes de la lente Taller como **mapa de vencimientos** (cada día pinta
lo que vence ese día: empezar, cortar, armar, listo) y la tarjeta que late —«Se ganó / No se
dio»— subiendo de «Hoy» al calendario. **Tamaño:** un día entre los seis.

### 4.4 Avisos que lleguen con la app cerrada
Hoy solo suenan las alarmas del `.ics`. Para que «falta acrílico para el jueves» llegue al
teléfono sin abrir nada hacen falta **notificaciones push**: una suscripción Web Push en cada
aparato, y un cron en el Worker (Cloudflare Cron Triggers, gratis) que evalúe las reglas y
mande. Es lo único de esta lista que necesita que el Worker **tenga los datos**, así que
depende de 4.1. **Compra:** los avisos A6–A13 dejan de ser «reglas de pantalla». **Tamaño:**
dos días. iPhone lo soporta solo con la app instalada en la pantalla de inicio.

### 4.5 El neón flex y las tarifas que faltan
El neón flex se vende y no está en ningún catálogo: cae en partida manual, que el módulo de
material excluye por diseño. No es código: es **decidir cómo se cobra** (por metro lineal,
por color, con o sin fuente) y entonces sí, un sexto tipo de partida en el cotizador con su
receta de material. Igual para vinil, bandera y señalética.

### 4.6 Lo chico que mejora la computadora
Ya están las dos columnas y el teclado. Lo que sigue vale menos y se lista para que no se
pierda: instalar la plataforma como app de escritorio (Chrome lo ofrece solo; falta el
`display_override` en el manifiesto), arrastrar una instalación de un día a otro en el mes
(hoy es «Mover» con un formulario), y la impresión del calendario del mes.

---

## 5. El orden que recomiendo

1. **Fase 3 primero, no fase 2.** Es la que quita el límite de un aparato, y el Calendar sin
   sincronización sigue siendo un aparato hablando solo. 25 minutos de cuentas.
2. **4.1, el material viajando.** Un día. Con eso los tres aparatos ven todo lo que importa.
3. **Fase 2, Google Calendar.** 15 minutos. Quita el paso del `.ics`.
4. **4.2, el folio del servidor.** Medio día. Ya se puede cotizar de dos aparatos.
5. **4.3 y 4.4** según haga falta: el calendario cuando fabricación lo pida; los push cuando
   alguien se pierda un aviso por no abrir la app.

Y lo que **no** se va a hacer, con su razón en `docs/ARQUITECTURA.md` §11: no se migran los
199 proyectos fuera de Notion, no se llama a la API de Notion desde el navegador, no se usa
Supabase ni Vercel, no se cachean los tiles del mapa, y no hay usuarios ni login — tres
personas, tres aparatos, un token por aparato.

---

<p align="center"><sub>AL3D · Anuncios Luminosos 3D · Guadalajara, Jalisco</sub></p>
