## Calificaciones

| Propuesta | Nota | Justificación en una frase |
|---|---|---|
| **google-nativo** | **8** | Es la única donde la pantalla de administración —corregir un número mal, ver por qué llegó un aviso— **no hay que programarla, es la Hoja**, y la única con un cron de verdad y con recordatorios que suenan en el teléfono de fabricación y de pagos **sin que ellos autoricen nada** (`CalendarApp` corriendo como el director). |
| **notion-verdad** | **7** | Respeta dónde vive la verdad y su bucle de calibración es la mejor idea del conjunto, pero pone tres cuentas nuevas y un secreto rotatorio en el camino crítico, con su propio §8 admitiendo que el puente **no lo arregla nadie en AL3D**. |
| **backend-propio** | **6** | La mejor arqueología del código y el único modelo de permisos serio, pero apoya la continuidad de un negocio con tres años de historia en un Postgres gratuito que **se pausa a la semana y no tiene respaldos**, sostenido por un cron de GitHub Actions que el director no puede leer ni depurar. |
| **local-first** | **5** | Modelo de datos impecable y la mejor lectura del offline, pero su mecanismo central es **un ritual humano diario** (intercambiar un JSON por WhatsApp cada tarde), que es exactamente la clase de acto recurrente que ya mató la copia (B) de Notion. |

---

## Los tres hallazgos más graves

**1 · local-first: el ritual de sincronización es la arquitectura, y no se va a hacer.**
Su regla 9 ("comparte el día", `RRULE` de lunes a viernes a las 18:00) y su regla 10 (conteo mensual) no son adornos: son el transporte. Tres personas mandándose un archivo cada tarde durante seis meses no ocurre — y cuando deja de ocurrir el módulo de stock **no se degrada, miente**, en tres dispositivos que se ven idénticos. La propuesta lo sabe y escribe los criterios de escalada (§8.1: >2 conteos discrepantes/mes o >24 h de retraso). Escribir el criterio de fracaso es honestidad; no hace que el ritual se cumpla. Y el módulo condenado es justo el que el de fabricación tenía que poseer.

*Agravante técnico verificado:* propone meter el cotizador en un `<iframe>` como ventaja. Los `env(safe-area-inset-*)` valen **cero dentro de un iframe** (el iframe no es el viewport visual), así que la `.mbar` —`padding-bottom:calc(9px + env(safe-area-inset-bottom))`— se mete debajo del indicador de inicio del iPhone, y `100dvh` deja de seguir el colapso de la barra de URL. La propuesta afirma "se comporta bien" sin comprobarlo.

**2 · backend-propio: el suelo de Supabase es más frágil que el problema que resuelve.**
Pausa a la semana de inactividad + **cero días de retención de respaldo** en el plan gratuito. El rol de PAGOS abre la app una vez al mes; el director se va dos semanas. La mitigación es un `keep-alive.yml` y un `pg_dump` a un artifact que caduca a los 90 días — dos piezas que el usuario no puede leer, ni depurar, ni echar a andar de nuevo. Encima, una sola tabla con RLS apagada expone todo a una anon key que va publicada a propósito, y auditar eso exige un programador. Su propio cierre lo dice mejor que yo: *"el costo real de esta arquitectura no se paga con dinero, se paga con dependencia"*. Para "nadie va a mantener infraestructura", eso es un no.

**3 · notion-verdad: su puente estrella industrializa un bug de corrupción que hoy es manual.**
Propone reutilizar el modal Registrar Venta y que *"en vez de ir al portapapeles vaya al puente"*. Verifiqué el modal (`index.html` 10038–10044 y 8761–8790):

- `<select id="rv-estatus">` ofrece `ANTICIPO / LIQUIDADO / CANCELADO / PENDIENTE`. Los reales de Notion son `REPARANDO / COBRANDO / FABRICACION / LIQUIDADO`. **Coincide uno de cuatro**, y escribir una opción inexistente en una propiedad *status* por API **la crea**: cada venta ensucia el esquema en silencio.
- `<select id="rv-cuenta">` tiene `Elias BBVA / Moni MPago / Constru BNT / Otra`: faltan `Rul HSBC` y `Tatis BNT`, y `Otra` no existe en Notion.
- `rv-fecha` es `<input type="text">` precargado con `Q.fecha` = `'22 ago 2026'`, contra una columna *date* `DD/MM/YYYY`.

Automatizar eso convierte un pegado manual que el director corrige con el ojo en una escritura silenciosa sobre la base de 199 proyectos. Y es la única propuesta que **no** detectó los cuatro defectos, precisamente la que más apuesta por ese modal.

*Transversal, y lo encontró solo backend-propio:* `sw.js` es red-primero **a propósito** (su comentario lo explica: publicar es subir a `main`). Correcto para un archivo; **letal para trece**. Con mala señal, `nucleo.js` llega de la red (v2) y `material.js` de la caché (v1) → excepción de import → **pantalla blanca**, en el escenario exacto para el que existe el SW. notion-verdad, local-first y google-nativo proponen 13–18 módulos ES y las tres se limitan a subir `CACHE` a `'al3d-v2'` y añadir archivos a `BASICOS`. Ninguna aborda el desfase.

---

## Las mejores ideas sueltas, para injertar

**notion-verdad**
- **El bucle de calibración.** Cuando fabricación corrige una salida derivada, se guarda la razón `real/calculado`; al quinto ajuste la app propone subir la merma de 35 % a 41 %, un toque. **Es la mejor idea del conjunto**: convierte el único acto manual que iba a hacer de todos modos en el mecanismo que arregla las constantes. Ninguna constante es campo obligatorio.
- **`factor_origen` obligatorio.** Ningún factor de conversión sin su derivación a la vista. Es la única defensa contra un número inventado que nadie puede auditar después.
- **`eventId` determinista** (`sha1(regla+proyecto+fecha)`): insertar dos veces da 409 = "ya estaba". Idempotencia **sin estado local**.
- **Crear todos los eventos futuros por adelantado** al fijar la fecha, para que el despertador sea la infraestructura de Google y no la app.
- **No alterar el esquema de Notion por API.** Detectar las propiedades que faltan y mostrar la lista para que el humano las cree. Es lo único que garantiza que no se rompan las 7 vistas ni las 5 fórmulas.
- **Prefijo propio de claves** (`p3d_`, no `al3d_`): verificado que `restaurarDesde` hace `removeItem` de las `RESPALDO_KEYS` (línea 6939) y luego solo reescribe lo que viene en el paquete. Con prefijo `al3d_*`, restaurar un respaldo viejo **borra el estado de la plataforma en silencio**.

**local-first**
- **IndexedDB para todo lo que crece, jamás `localStorage`.** Verificado: el grep de IndexedDB en `index.html` está vacío (recurso virgen) y `saveHistorial` ya degrada soltando `aiFile.url` de las más viejas cuando no cabe. El síntoma de competir por esa cuota sería *"el cotizador dejó de guardar cotizaciones"*. Es la observación técnica más valiosa que solo hace esta propuesta.
- **Deltas, nunca valores absolutos.** Existencia = último conteo + Σ movimientos posteriores. Correcto con servidor y sin servidor.
- **El sello de frescura en cada número de stock** (`contado el 12 ago por Omar` / `derivado · nunca contado`) y la regla 8, "nadie ha fusionado en 48 h". Hacer visible la edad del dato en vez de presentarlo como verdad. **Con servidor también aplica.**
- **`origen` como copia congelada, no referencia**, para que `restaurarDesde()` no pueda huerfanar un proyecto. Precedente ya establecido en el código con `_lt`.
- **Criterios de escalada medidos**, no opinados.

**backend-propio**
- **Los cuatro arreglos de `copiarFilaVenta` + persistir la fila.** Verificado línea por línea. Es el eslabón perdido y está a medio construir en producción: cuesta una tarde, cero cuentas.
- **El `type` del escalador que se tira a la basura.** Verificado: `SC.items.push({…, type:SC.mMode})` (8264) y `scAgregarPartida` (8476) usa solo `m.cm` y `m.label`. Una medida trazada en modo `'h'` es un **ancho** medido con el dedo sobre la foto, y es el dato que le falta a todo el módulo de material. **Corrección obligatoria a su propuesta:** escribir `it.anchoMedido` *en vez de* `it.altura` pondría `lineTotal` en cero y rompería el precio. El injerto seguro es guardarlo como metadato aparte (`it.medidaTipo`, `it.anchoMedido`) sin tocar nunca `altura`.
- **El SW en dos estrategias** (red-primero para `index.html`, caché-primero con revalidación **atómica** para `/mod/*`): se promueve el conjunto completo o ninguno. *"Un módulo nuevo con un módulo viejo es una app rota, no una app vieja."*
- **El cordón de plausibilidad sobre `altura`.** El propio `PROMPT_IA` instruye usar el número del corchete *"tal cual"* aunque sea horizontal: para el precio da igual, para el material es un error de orden de magnitud. Marcar `requiere_dato` y preguntar una vez, solo en las partidas raras.
- **Separación de dinero por columna, no por fila:** la vista `proyecto_taller` con `security_invoker` y fabricación **sin ninguna policy** sobre `proyecto`. RLS filtra filas; el dinero es un problema de columnas.

**google-nativo** (la ganadora, para no perderlas de vista)
- **El redondeo al comprar, no por proyecto.** Dos proyectos que piden 0.484 y 0.700 láminas con 0.5 en almacén: agregado = 1 lámina; redondeado por proyecto = 2. La segunda cifra es cómo un almacén se llena de sobrantes y nadie vuelve a creerle al sistema.
- **`confianza:'FALTA_DATO'` en vez de devolver cero.** Fallar fuerte nombrando el número exacto que falta es lo contrario de un campo vacío que nadie ve.
- **Inventario inicial perezoso**: cada material se cuenta la primera vez que se va a consumir, no todos al arrancar. Quita el bloqueo de lanzamiento.
- **`dedupe_key` en la tabla de recordatorios, y que la tabla sea visible.** El director puede ver por qué le llegó un correo y por qué no le llegó otro. Sin eso, la bandeja se llena de basura en una semana y deja de mirarla.
- **Dejar el valor huérfano en cero** ("Caja de luz sin iluminación" no se puede derivar porque el cotizador no la puede cotizar) en vez de inventar un campo para llenarlo.

---

## Recomendación

**Gana google-nativo.** No por elegancia —su modelo de permisos es el más débil de los cuatro y lo admite: con *Ejecutar como: yo / Acceso: cualquiera*, `Session.getActiveUser().getEmail()` viene vacío y el rol es una afirmación del cliente— sino por las dos cosas que deciden si algo sigue vivo en seis meses en este negocio:

1. **La pantalla de administración no existe porque no hace falta: es la Hoja.** Cuando el número esté mal —y va a estar mal— el de fabricación lo corrige en una celda, con validación de datos forzando los enums y rangos protegidos en los ids. Ninguna de las otras tres tiene una respuesta a "¿quién arregla un dato torcido un martes?" que no sea un programador.
2. **Es la única con un cron real.** Los triggers de Apps Script corren aunque nadie abra nada, y `CalendarApp` corriendo como el director mete el evento en calendarios compartidos: **fabricación y pagos reciben la alarma del sistema operativo sin instalar, autorizar, ni ver la pantalla de "app no verificada"**. Las otras tres admiten que sus reglas "de pantalla" solo se disparan si alguien abre la app — y el requisito 3 del usuario era *recordatorios con automatizaciones*.

Sus 2 min/día de trigger contra 90 min/día de cuota, sus <15 destinatarios contra 100/día y sus ~10 llamadas `UrlFetch` contra 20,000 dejan margen de dos órdenes de magnitud. Y `text/plain` para evitar el preflight (que Apps Script no puede contestar porque no permite fijar cabeceras) más el rechazo explícito a construir sobre `doOptions` son las dos decisiones correctas ahí.

### Lo que hay que injertarle, en orden

**1 · De backend-propio: los cuatro arreglos de `copiarFilaVenta`, antes que nada.** Es Fase 0, una tarde, cero cuentas, y **hoy está corrompiendo el esquema de Notion cada vez que se usa**. Los cuatro valores de `rv-estatus` a `REPARANDO/COBRANDO/FABRICACION/LIQUIDADO`, las cinco cuentas reales sin `Otra`, `rv-fecha` a `type="date"` con salida `DD/MM/YYYY`, y persistir la fila para que el evento "se ganó" deje rastro. Más el `type` del escalador como metadato de ancho —**sin tocar `it.altura`**— y el SW en dos estrategias en el mismo commit en que exista el segundo archivo JS.

**2 · De notion-verdad: el bucle de calibración y `factor_origen`.** Los cuatro proponen factores de glifo inventados y **no coinciden entre sí**: `k_ancho` 0.80 vs 0.72, y perímetro `3.6×h` vs `4.4×h` — un 22 % de dispersión sobre números que nadie midió. Eso significa que el valor semilla es irrelevante y lo único que importa es que se corrija solo con las correcciones que fabricación ya iba a hacer, con la fórmula y la `confianza` visibles al lado del número. Sin ese bucle, el umbral del 40 % de `cantidad_ajustada` que google-nativo propone vigilar solo sirve para apagar el módulo, no para arreglarlo.

**3 · De local-first: el sello de frescura y el aviso de retraso.** Aunque haya servidor, ningún número de stock se presenta como verdad: lleva su edad y quién lo contó. Con latencia de 0.5–3 s y escritura optimista, la banda que dice *"trabajando con la copia de este dispositivo"* es lo que evita que una diferencia se lea como "la app se rompió".

### Dos advertencias que hay que trasladar tal cual al entregable

- **El mapa muere si `maps`/`dirRaw` vienen vacíos**, y `maps` es opcional en el cotizador. Si el primer día el mapa se ve vacío, muere igual que la copia (B). Hay que empujar el hueco de ubicación como bloqueante suave (`.ptok.falta`) y permitir arreglarlo **tocando el mapa**, sin teclear.
- **El neón flex se vende y no está en ningún catálogo de ningún sistema.** Hay un proyecto real (`Priscilla - Neón Flex "Enjoy"`) y cae en `tipo:'manual'`, la partida que el módulo de material tiene que excluir por diseño. Ese es un hueco de negocio, no de arquitectura, y hay que decírselo en voz alta en vez de que lo descubra cuando la lista de compra salga incompleta.