# Arquitectura de la plataforma centralizada AL3D
### Local-first radical · sitio estático · cero dependencias nuevas de servidor

---

## 1. TESIS

El problema de este usuario no es que le falte esquema: **ya diseñó dos veces la plataforma que está pidiendo y la segunda vez se murió vacía**. La copia OMAR (`collection://2c0482c5-50e5-8155-bb63-000b2430c8b7`) tiene 142 filas, calendario de entregas por `Fecha de entrega`, mapa por `Ubicación entrega` y un `Tipo de proyecto` de 7 valores — y `Tipo de proyecto` está lleno en **0 de 142 filas**, `Cliente` en **0 de 142**, y `Registro de clientes` tiene **1 fila**. El trabajo real siguió en la copia ELIAS con el esquema simple porque ese esquema no pide nada que no se escriba de todas formas. Un servidor no arregla eso: un campo vacío en Postgres se ve igual que un campo vacío en Notion. Por lo tanto la arquitectura correcta es la que **deriva todo lo que puede y captura tres cosas**: la fecha de instalación, el "esta cotización se ganó", y las entradas de material — y las tres se cobran de una sola pulsación cada una porque reemplazan trabajo que ya se hace a mano hoy (`Fecha Anticipo e Instalacion` en Notion, la fila que se pega en Ventas, la compra que ya se paga). El resto de la postura se sigue de un hecho duro y de un argumento de orden. El hecho: la app se usa en la calle, delante del cliente, y el `sw.js` que ya existe está ahí exactamente por eso ("*abrirla sin señal daba la pantalla de error del navegador*"); cualquier arquitectura con servidor tiene que construir de todos modos la copia local completa, así que **la versión local-first es prerequisito estricto de la versión con servidor y construirla primero tiene costo de oportunidad cero**. El argumento de orden: la única pieza que de verdad tiene conflicto de escritura concurrente es la *cantidad* de material, y una cantidad se sincroniza sin servidor de forma matemáticamente correcta si se guardan **deltas en un log de eventos append-only** en vez de valores absolutos — la suma es conmutativa, el merge es determinista, y reimportar el mismo archivo cinco veces o fuera de orden no rompe nada. Lo que no se consigue sin servidor es *puntualidad* ni *reserva atómica*, y eso lo digo sin adornos en la §8 con el número exacto de lo que se pierde y lo que ve el usuario cuando pasa.

---

## 2. NOTION vs GOOGLE CALENDAR — gana Google Calendar, por la puerta del `.ics`

**Decisión: Google Calendar, y se llega a él generando archivos `.ics` en el dispositivo. No se usa la API de Google (todavía) ni la API de Notion (nunca).**

Las razones, en orden de peso:

1. **La API de Notion es imposible desde el navegador y además no la querrías.** No manda `Access-Control-Allow-Origin` — hay dos issues abiertos en su propio SDK por esto (`makenotion/notion-sdk-js` #96 y #408). Pero el problema mayor no es CORS: exige `Authorization: Bearer secret_…`, y ese es un token de **escritura completa sobre todo el workspace**. Ponerlo en un HTML publicado en GitHub Pages es publicar la llave de los 199 proyectos y $3.7M de historia. Aun si Notion arreglara CORS mañana, la respuesta seguiría siendo no.
2. **Los recordatorios de Notion llegan a una sola de las tres personas.** Fabricación y pagos no están en Notion; el director sí. Un recordatorio de Notion es una notificación *dentro* de Notion. La regla que importa —"tres días antes de la instalación, avisar a fabricación"— por definición no puede vivir ahí.
3. **Google Calendar llega a la notificación nativa de los tres teléfonos, gratis, sin infraestructura, y por un archivo.** Un `.ics` es texto que se arma localmente: funciona sin señal, sin cuenta, sin llave, sin proyecto de Google Cloud, sin pantalla de "app no verificada". Se genera, se descarga, el sistema operativo lo abre en el calendario. Esa es la única pieza de la plataforma que puede sonar cuando la app está cerrada, y es lo que hace posible el módulo 1 completo.
4. **La suscripción a un `.ics` publicado en el repo queda descartada, a propósito.** Google refresca calendarios suscritos cada **12–24 h** y *no hay forma de forzar un refresh*. Sirve para una agenda de consulta que tolere un día de atraso; no sirve para "acabo de agendar y quiero verlo". Por eso el camino es **descarga por evento** (importación inmediata) y, aparte, un `.ics` de "agenda completa" para cuando cambia mucho el plan.
5. **La API de Calendar (GIS token model) queda como Fase 2 opcional, no como base.** Es viable —`calendar.events`, publishing status *Testing* con hasta 100 test users, sin verificación, sin client secret— pero cuesta: un proyecto de Google Cloud, la pantalla **"Google hasn't verified this app"** con Advanced → Go to (unsafe) para los tres, un token que muere en ~1 h y exige sesión Google viva, y una dependencia de red en el camino crítico de una app que tiene que abrir sin señal. Se entra ahí solo si la fricción del `.ics` demuestra ser real (criterio numérico en §9).

### El papel exacto de la perdedora — y sí tiene uno, central

**Notion se queda siendo la fuente de la verdad del dinero y de la venta.** No se migra, no se espeja, no se toca por API.

| Dirección | Mecanismo | Qué viaja |
|---|---|---|
| Plataforma → Notion | La **fila TSV de 15 columnas que ya existe** (`copiarFilaVenta`, index.html L8769). Orden exacto: `Proyecto · Abono Comision · Anticipo · Comision Restante · Comisiones · Cuenta · Estatus · Fecha Anticipo e Instalacion · Fecha Comision · Fecha Liquidacion · IVA · Liquidacion · Pago Pendiente · Precio Neto · Precio Subtotal`. Al portapapeles, se pega en la tabla. | La venta ganada, con el nombre ya armado en la convención `Contacto - Negocio (trabajo)` |
| Notion → Plataforma | **CSV exportado a mano** de `Ventas - AL3D` (data source `collection://56fa21d8-8e7d-4e16-b874-455fd6c65643`), leído por `<input type="file">` | Los 199 proyectos históricos: dinero, estatus, fechas. Y las comisiones pendientes (`Comision Restante > 1`) para el módulo de inicio |

Notion sigue siendo donde "*mis proyectos autorizados viven*". La plataforma **importa** de ella y le **devuelve una fila lista para pegar**. Cero token, cero CORS, cero proxy, cero cuenta nueva.

Una advertencia sobre el CSV que hay que decir ahora y no descubrir después: **el esquema de `Ventas - AL3D` no tiene columna de dirección**. Ni una. Las direcciones de los 199 proyectos históricos viven en el **cuerpo de texto libre** de cada página ("*Sucursal La Perla (Genki) - Plaza Palma Real, Av. Sta. Margarita 3740 L5, Valle Real*"), y la mayoría de las páginas están en blanco (comprobado: "Susy- Rush Workout"). Consecuencia dura: **el histórico importado aporta dinero y fechas, no pines en el mapa.** Si el usuario exporta como *Markdown & CSV* (que produce un `.md` por página) el importador acepta también esos archivos con un `<input multiple>` y saca la dirección con una expresión permisiva — pero eso rendirá pines solo para las pocas páginas con memoria técnica escrita.

Segunda advertencia del CSV: `Fecha Anticipo e Instalacion` es **un solo campo para dos eventos distintos**. El histórico importado tiene fechas de anticipo disfrazadas de fechas de instalación. La plataforma las parte en dos de aquí en adelante (`fecha_anticipo` y `fecha_instalacion`) y eso **no cuesta captura extra**: la de anticipo sale del flujo de pagos y la de instalación es la única pulsación de la agenda. Y respeta los espacios finales reales de los nombres al parsear: `Precio Neto ` y `Cuenta ` los llevan.

---

## 3. MODELO DE DATOS

### 3.0 La regla de oro del acoplamiento

`index.html` es dueño exclusivo de `al3d_q`, `al3d_historial`, `al3d_queue`, `al3d_folio`, `al3d_logo`, `al3d_aifile`, `al3d_fold_proy`, `al3d_autorizador`, `al3d_ult_material`, `al3d_rv_pct`, `al3d_rv_cuenta` y las 8 claves de IA. **La plataforma jamás escribe ninguna.** Las lee y se releen en cada entrada a un módulo y en cada evento `storage` (nunca se cachean largo: `saveState()` escribe `al3d_q` *en cada tecla*).

Y la decisión que evita la corrupción cruzada: **la plataforma nunca guarda una referencia a una cotización, guarda una copia.** Si el usuario usa `restaurarDesde()` en el cotizador —que hace `removeItem` de las 11 `RESPALDO_KEYS` y las reescribe desde un JSON viejo, y termina en `location.reload()`— el historial puede quedarse sin el folio que un proyecto de la plataforma decía tener. El proyecto no se entera porque lleva su propio `origen` congelado dentro del evento `proyecto.creado`. Es exactamente el razonamiento por el que el cotizador congela `_lt` en cada partida del historial ("*sin congelarlo, subir el aluminio de $30 a $35 reescribía hacia atrás lo que ya se le cotizó a un cliente*"): el precedente ya está establecido en este proyecto, se sigue.

### 3.1 Dónde vive cada dato

| Dato | Fuente de la verdad | Quién escribe | La plataforma |
|---|---|---|---|
| Catálogo de precios (`MATERIALES`, `COMPLEJIDAD`, `CAJAS`, `RECORTES`, `BASTIDORES`) | `index.html` L2728–2760 | quien edita el HTML | lo lee para mostrar; **nunca recalcula dinero** |
| Cotización en curso | `al3d_q` | index.html | no toca |
| Cotizaciones cotizadas y con precio autorizado | `al3d_historial` | index.html | lee; **copia** al ganar |
| Cola pendiente de autorizar precio | `al3d_queue` | index.html | lee (tarjeta "esperando precio" en Inicio) |
| Contador de folios | `al3d_folio` | index.html | lee |
| **Que la cotización se ganó** | log de eventos (`proyecto.creado`) | plataforma | **escribe — es el eslabón que hoy no existe** |
| Fecha y hora de instalación | log (`instalacion.agendada`) | plataforma | escribe |
| Ubicación geográfica | log (`proyecto.ubicacion`) | plataforma | escribe (derivada, confirmable) |
| Existencia de material | log (`movimiento.*`) | plataforma | **derivada, nunca almacenada** |
| Requerimiento de material | derivado de las partidas + reglas | **nadie lo captura** | recalculado siempre |
| Dinero cobrado, comisiones, estatus contable | **Notion `Ventas - AL3D`** | el humano, en Notion | exporta TSV / importa CSV |
| Catálogo de material, unidades, factores | `/app/js/datos/materiales.js` en el repo | quien edita el archivo | lee |
| Constantes de consumo (k_p, profundidades, aprovechamientos) | `/app/js/datos/constantes.js` | quien edita el archivo | lee |
| Constancia fiscal, datos formales del cliente | Notion `Registro de clientes` (1 fila) → en la práctica: **nadie** | — | **no lo pide** |

### 3.2 El sobre: el log de eventos

Todo lo nuevo es un evento inmutable. No hay tablas mutables; el estado es una proyección que se recalcula al abrir.

```js
// Un evento. Append-only. Nunca se edita, nunca se borra.
{
  id:   'F4B2:00812',      // <disp>:<seq> — único global e IDEMPOTENTE
  disp: 'F4B2',            // id de dispositivo, 4 chars base32
  seq:  812,               // contador monótono local
  ts:   1755900000000,     // Date.now() del emisor
  rol:  'fabricacion',     // sello de quién lo hizo, para la UI
  nom:  'Omar',            // nombre humano, para los sellos «verificado por»
  tipo: 'movimiento.salida',
  ent:  'mat:acero-esp',   // entidad afectada
  dat:  { /* carga útil, ver abajo */ }
}
```

**Orden total determinista:** `(ts, disp, seq)`. `ts` puede estar mal (reloj torcido); `disp` y `seq` lo hacen total y reproducible en los tres dispositivos.

**Semántica de fusión, por tipo de campo:**

| Tipo de dato | Estrategia | Por qué |
|---|---|---|
| Campos de texto/fecha (nombre, fecha de instalación, nota) | **LWW-Register** por campo, con el orden total de arriba | Dos personas cambiando la fecha de la misma instalación: gana la última. Es lo correcto y es lo que la gente espera |
| Cantidades de material | **PN-Counter**: existencia = Σ deltas | La suma es conmutativa y asociativa → **el orden de llegada no importa y el reloj torcido no corrompe el total**. Esta es la razón de todo el diseño |
| Conjuntos (fotos de obra, materiales de un proyecto) | Add-only con lápidas (2P-Set) | Borrar es un evento, no una ausencia |
| Conteo físico (`movimiento.conteo`) | **Reset del contador**: existencia = último conteo por orden total + Σ deltas posteriores a ese conteo | Es la única aserción absoluta. Es también el único lugar donde un reloj torcido puede tragarse movimientos reales → la proyección lo marca en pantalla, no en silencio (§8) |

**El `seq` no se guarda en `localStorage`.** Se deriva al arrancar como `max(seq de mis eventos en IndexedDB) + 1`, igual que el cotizador deriva `pid=Q.items.reduce((m,it)=>Math.max(m,it.id||0),0)`. Si se limpia `localStorage` pero no IndexedDB (o al revés) no se reciclan ids con contenido distinto.

### 3.3 Almacenamiento: IndexedDB, no localStorage

Esto es una decisión, no un detalle. `saveHistorial()` (L6602–6624) ya degrada por falta de espacio: cuando `setItem` truena va soltando `aiFile.url` de la más antigua a la más reciente, y si nada cabe el usuario ve el texto literal *"No hubo espacio para guardar en el historial — respalda y borra cotizaciones viejas"*. **Meter el log de eventos en `localStorage` sería competir por esa cuota y el síntoma sería que el cotizador deja de guardar cotizaciones.** El grep de IndexedDB en `index.html` está vacío: es un recurso virgen en este origen y tiene órdenes de magnitud más espacio.

```
IndexedDB  'al3dp'  v1
  eventos   keyPath 'id'    index 'porOrden' [ts,disp,seq]   index 'porDisp' [disp,seq]
  blobs     keyPath 'id'    fotos de obra como Blob (no base64: el aiFile del cotizador
                            paga 33% de sobrecosto en base64; aquí no)
  geo       keyPath 'q'     caché de geocodificación (obligatoria por política de Nominatim)
  estado    keyPath 'k'     snapshot/checkpoint, cursores por dispositivo, última exportación
```

`localStorage`, prefijo `al3dp_` — nunca colisiona con `al3d_` y **nunca entra en `RESPALDO_KEYS`**:

| Clave | Tipo | Para qué |
|---|---|---|
| `al3dp_disp` | string 4 chars | id de dispositivo, se elige una vez con `crypto.getRandomValues` |
| `al3dp_rol` | `'direccion'\|'fabricacion'\|'pagos'` | qué módulos abren y qué botones existen |
| `al3dp_nombre` | string | el sello humano de los eventos |
| `al3dp_ult_export` | ISO 8601 | alimenta la regla 8 y el aviso de desalojo de iOS |
| `al3dp_tiles` | `'osm'\|'carto'\|'google'` | proveedor de teselas |

**El respaldo de la plataforma es aparte, a propósito.** No se extiende `RESPALDO_KEYS`: `restaurarDesde()` es transaccional con rollback y si una sola clave no cabe aborta todo (*"No cupo el respaldo en este dispositivo (N claves) — no se cambió nada"*). Meter un log de eventos y fotos de obra dentro de ese JSON convertiría el respaldo del cotizador —que hoy se manda por WhatsApp— en un archivo que ya no cabe, y rompería la restauración de las cotizaciones. Dos respaldos, cada uno del tamaño que le toca.

### 3.4 Las entidades

#### `proyecto` — la obra ganada. **El eslabón que falta.**

```js
// evento proyecto.creado — dat:
{
  pid:      'F4B2-K7M2Q9',     // id global de proyecto (disp + base32 aleatorio)
  nombre:   'Andrey - Healthylicious (Panel Alucobond)',  // convención de Notion, PREARMADO
  contacto: 'Andrey',          // sale de origen.cliente
  negocio:  'Healthylicious',  // lo teclea quien gana, si difiere del contacto
  origen: {                    // COPIA CONGELADA de la cotización. No es una referencia.
    fuente:  'cotizador',      // | 'notion-csv' | 'manual'
    folio:   'COT-0007',
    disp:    'D7K2',           // el folio NO es único entre dispositivos: se prefija
    ts:      1755100000000,    // el ts de la entrada del historial
    cliente: 'Andrey', tel: '3328130092',
    dirRaw:  'Plaza Palma Real, Av. Sta. Margarita 3740 L5, Valle Real',
    entrecalles: '', maps: 'https://maps.app.goo.gl/…',
    neto: 14900, sub: 12844.83, iva: true, anti: 7450, precioAuth: 0,
    items: [ /* copia literal de historial.items, con su _lt */ ]
  },
  tipo:     'Letras 3D con iluminación',   // DERIVADO, ver §3.5
  notaTec:  ''                 // memoria técnica libre, como el cuerpo de página en Notion
}
```

| Campo del estado proyectado | Tipo | Origen |
|---|---|---|
| `pid` | string | evento |
| `nombre` | string (LWW) | prearmado desde `origen`, editable |
| `estado` | `'ganado'\|'fabricacion'\|'listo'\|'instalado'\|'cobrando'\|'liquidado'\|'reparando'\|'cancelado'` | eventos `proyecto.estado`. Los cuatro últimos valores de Notion (`FABRICACION`, `COBRANDO`, `LIQUIDADO`, `REPARANDO`) están **literales** para que la exportación TSV no traduzca |
| `tipo` | uno de los 7 de `Tipo de proyecto` de la copia OMAR | **derivado**, §3.5 |
| `ubicacion` | `{lat, lng, fuente, precision, sello}` | `proyecto.ubicacion`; `fuente ∈ 'enlace'\|'geocodificada'\|'mano'`; **estos campos hoy no existen en el modelo y hay que crearlos** |
| `origen` | objeto congelado | evento, inmutable |
| `notaTec` | string (LWW) | evento |
| `fotos` | `[blobId]` | add-only |
| `creado` / `tocado` | epoch ms | `min(ts)` / `max(ts)` de sus eventos. **Resuelve el hueco de `ts` no inmutable del historial**: aquí `createdAt` y `updatedAt` son distintos por construcción |

#### `instalacion`

```js
// evento instalacion.agendada — dat:
{
  iid: 'F4B2-A3X1',  pid: 'F4B2-K7M2Q9',
  fecha: '2026-09-01',            // ISO, no locale es-MX. Comparable de máquina.
  hora:  '10:00',                 // HH:MM local de Guadalajara (UTC-6 fijo)
  dur:   180,                     // minutos, estimado por defecto según el tipo (§3.5)
  nocturna: false,                // se preselecciona si la nota técnica dice «nocturna»
  acceso: '',                     // texto libre: andamio, grúa, permiso de plaza, horario del local
  contactoSitio: ''               // si es distinto del cliente
}
```
Estado proyectado: `+ estado: 'agendada'|'confirmada'|'hecha'|'cancelada'`, `movida: n` (cuenta de `instalacion.movida` → alimenta `SEQUENCE` del `.ics`), `uid` estable.

Lo que sí se captura aquí: **una fecha y una hora, en un calendario, una vez.** Prellenada: si `origen.entrega` parsea (`"Viernes 15 de Agosto"`) se propone esa; si no, `origen.ts + tiempo de entrega según el tipo` (1–4 semanas, la misma taxonomía que OMAR ya pensó).

#### `material` — el catálogo que hoy no existe en ningún sistema

```js
{ id:'acero-esp',
  nom:'Acero inoxidable espejo cal. 24',
  uCompra:'lamina',        // unidad | bolsa | caja | lamina | litro | metro  ← las seis del usuario
  uConsumo:'m2',           // m2 | cm | pza | litro
  medida:'1.22 × 2.44 m',  // lo que dice el proveedor
  factor:2.9768,           // uConsumo que rinde UNA uCompra. GEOMETRÍA PURA, sin desperdicio
  minimo:1,                // no se compra fracción
  costo:0,                 // opcional; hoy nadie lo tiene y no se exige
  minStock:0,              // umbral de la regla 5; 0 = no avisar
  prov:''                  // opcional
}
```
**El desperdicio no vive aquí.** `factor` es un hecho físico; el aprovechamiento es un supuesto de proceso y vive en la regla de consumo. Se editan por separado porque se equivocan por separado.

#### `existencia` — **no es una entidad almacenada**

`existencia(matId) = conteo_más_reciente + Σ deltas posteriores`, calculada al abrir. Guardarla sería el bug: dos dispositivos escribiendo un valor absoluto se pisan; dos dispositivos sumando deltas convergen.

#### `movimiento`

```js
// tipo: movimiento.entrada | .salida | .ajuste | .conteo
{ mid:'F4B2-M009', mat:'acero-esp',
  cant: 1,               // en uCompra para entradas, en uConsumo para salidas (se normaliza al proyectar)
  u:    'lamina',
  pid:  null,            // 'F4B2-K7M2Q9' en salidas por fabricación → así SÍ hay gasto por proyecto,
                         //   que es justo lo que Gastos - AL3D nunca tuvo
  motivo:'compra',       // compra | fabricacion | merma | devolucion | conteo | correccion
  ref:  ''               // nº de factura o nada
}
```

#### `requerimiento` — derivado, con override

No hay tabla. `requerimiento(pid)` se recalcula desde `origen.items` con las reglas de §4. Lo único que se guarda es la corrección humana:
```js
// evento requerimiento.override — dat:
{ pid:'F4B2-K7M2Q9', mat:'acero-esp', cant: 2, u:'lamina', porque:'canto de 8 cm, no de 5' }
```
Y un evento `requerimiento.congelado` cuando el proyecto entra a fabricación: a partir de ahí el requerimiento no se mueve aunque alguien edite las constantes en el repo. Misma lógica que `_lt` y que `huellaAuth`.

#### `recordatorio` — **derivado también, sin tabla**

Las reglas son código (`/app/js/datos/reglas-recordatorio.js`). Las instancias se calculan al abrir. Lo único persistido es la atención, con **id determinista** para que sobreviva la fusión:
```
rid = <regla>:<entidad>:<fechaObjetivo>     // p.ej. 'faltaMaterial:F4B2-K7M2Q9:2026-08-29'
// eventos: recordatorio.atendido {rid} | recordatorio.postergado {rid, hasta:'2026-08-30'}
```
Dos dispositivos que descartan el mismo recordatorio producen dos eventos con el mismo `rid` → al fusionar, uno. Cero capturas, cero tabla, y consistente.

#### `usuario / rol`

No hay usuarios: hay **dispositivos con un rol y un nombre**. `al3dp_rol` decide qué módulos se ven y qué botones existen. Y hay que decirlo con claridad: **sin servidor no hay autorización, solo configuración.** Cualquiera con el teléfono puede cambiar su rol en Ajustes. Es aceptable aquí porque los tres son empleados en equipos de la empresa y lo que se defiende no es el secreto sino el ruido: que el de fabricación no vea la pantalla de cobranza y que el de pagos no mueva el almacén sin querer. Los instaladores no tienen acceso porque no tienen la app; reciben la información por un mensaje de WhatsApp armado (§7, regla 2).

---

### 3.5 Los dos campos que la copia OMAR nunca llenó, salen gratis

Esto es la prueba de la tesis, así que va explícito.

**`Tipo de proyecto` (0 de 142 filas en Notion) — derivado de las partidas, cero captura:**

| Partida dominante por importe | `Tipo de proyecto` (los 7 valores de OMAR, literales) |
|---|---|
| `tipo:'letras'` con `luz:true` | Letras 3D con iluminación |
| `tipo:'letras'` con `luz:false` | Letras 3D sin iluminación |
| `tipo:'caja'` | Caja de luz con iluminación *(el cotizador no puede cotizar una caja sin luz: `descTxt` la describe siempre como "Caras en Acrílico con Iluminación LED Fría")* |
| `tipo:'recorte'` con `acab:'vinil'` | Rotulación de vinil |
| `tipo:'recorte'` con `acab:'sencillo'` o `'sandwich'` | Recorte acrílico |
| `tipo:'bastidor'` o `tipo:'manual'` | Custome / Proyecto Especial |

Dominante = la de mayor `_lt`. **Incluidas las partidas con `showInPdf:false`**, que se cobran igual (se agrupan como "Conceptos adicionales") y por lo tanto se fabrican igual.

**`Ubicación entrega` (tipo place, sin usar) — derivada, cero captura:**
1. Si `origen.maps` trae coordenadas → `parseGmaps()` local, prioridad `!3d!4d` (el pin real) sobre `@lat,lng` (el centro de cámara). **Cero red, funciona sin señal.**
2. Si es un acortado (`maps.app.goo.gl`) → **imposible desde el navegador**, punto: la 30x no lleva `Access-Control-Allow-Origin` y `no-cors` da una respuesta opaca sin headers. Se cae al paso 3 y se marca.
3. `origen.dirRaw + ', ' + origen.entrecalles + ', Guadalajara, Jalisco, México'` → Nominatim, en cola de 1 req/s, **por botón explícito** ("Ubicar los 6 que faltan"), nunca al teclear (el autocomplete client-side está **prohibido** por su política), con caché obligatoria en el store `geo`.
4. Si falla: pin arrastrable a mano, `fuente:'mano'`.

El campo `Ubicación entrega` de OMAR murió porque era teclear por segunda vez una dirección que ya estaba escrita en otro lado. Aquí sale de `dirRaw`, que es la dirección "*como la compartió el cliente*" y que el cotizador ya recoge en el flujo de venta.

---

## 4. CÓMO SE DERIVA EL MATERIAL

### 4.1 La regla que manda, y la divergencia que no se arregla

La página *¿Cómo Cotizar?* de Notion documenta `Altura × Tipo de letra × Nº de letras` con **$30 / $35 / $40 / $50** por *tipo de letra* y "−20% sin iluminación". El catálogo del cotizador cobra por **material**: `al-paint 30`, `al-brush 35`, `acr-vol 40`, `acr-vinil 45`, `acero 55`, más `+5` cursiva y `+10` compleja, y el mismo `×0.8` sin luz. **Son dos reglas distintas.** El cotizador es más nuevo y más granular y es el que manda; la página de Notion queda como documentación de la regla vieja. No se toca ninguna de las dos.

Y una regla de exactitud que hay que respetar: **el material nunca se deriva del importe.** `m2Total()` cobra `Math.max(m2, 1)`, así que un letrero de 0.3 m² se cobra como 1 m² y se fabrica con 0.3 m². Para dinero se usan `itemsAuth[id]` → `_lt` → `lineTotal()`. Para material se usan **exclusivamente los campos crudos**: `altura`, `n`, `ancho`, `alto`, `material`, `acab`, `bas`, `luz`.

### 4.2 Las constantes que hoy no existen, con su valor inicial y de dónde sale

`/app/js/datos/constantes.js` — cada una comentada con su aritmética, en el registro del proyecto.

| Constante | Valor inicial | De dónde sale |
|---|---|---|
| `K_PERIM` recta | **4.4** × altura = cm de contorno por letra | Geometría del glifo. Una "O" de altura *h* con trazo 0.15h: contorno exterior π·h = 3.14h, interior π·0.7h = 2.20h → **5.34h**. Una "I": 2(h+0.15h) = **2.30h**. Una "E" ≈ **4.4h**. "M" ≈ 6h. Promedio de una palabra en mayúsculas ≈ **4.4h** |
| `K_PERIM` cursiva / compleja | **5.2 / 6.2** | `COMPLEJIDAD` ya dice que son más contorno por la misma altura; +18% y +41% sobre recta |
| `K_AREA_NEST` | **1.05** × altura² = cm² de lámina consumidos por letra | Ancho medio de mayúscula = 0.75·h (medido en sans comunes) → caja de 0.75h². Anidado en CNC con aprovechamiento **0.72** → 0.75/0.72 = **1.04**. Se redondea a 1.05 |
| `K_AREA_UTIL` | **0.34** × altura² = área real de la letra | Promedio de áreas rellenas: O 0.40h², M 0.45h², E 0.35h², A 0.33h², S 0.33h², I 0.15h² |
| `PROF_CANTO` | **5 cm** | Profundidad estándar de retorno para letra 3D con LED. El rango de taller es 3–6 cm; 5 es el default. **No se captura**: es constante con override opcional por proyecto |
| `PROF_CAJA` | **12 cm** | Profundidad típica de caja de luz de fachada con LED interior |
| `PROF_BASTIDOR` | **8 cm** | Tubular de 1" + forro |
| `APROV_TIRAS` | **0.90** | Cortar tiras de 5 cm de una lámina de 1.22 m: 24 tiras de 244 cm = 5,856 cm; el 10% se va en dobleces, uniones y arranques → **~5,270 cm de canto por lámina** |
| `APROV_ANIDADO` | **0.72** | Ya incluido en `K_AREA_NEST`; se expone aparte para poder ajustarlo |
| `APROV_PANEL` | **0.95** | Paneles rectangulares (bastidor, cara de caja) anidan casi perfecto |
| `PASO_LED` | **10 cm** | Separación entre módulos sobre el esqueleto de la letra |
| `W_MODULO` | **0.72 W** | Módulo de 3 chips SMD 12 V (3 × 0.24 W) |
| `CARGA_FUENTE` | **0.80** | Una fuente no se carga al 100%. Fuente de 60 W → 48 W útiles → **~66 módulos por fuente** |
| `PIJAS_POR_LETRA` | **4** | Montaje de letra individual a muro |
| `REND_SILICON` | **12 m** de sello por cartucho | Cordón de 5 mm |
| `REND_SOLVENTE` | **25 m²** de limpieza por litro | |
| `REND_PINTURA` | **8 m²** por litro a dos manos | |

Los cinco últimos son estimaciones de taller declaradas como tales. Y por eso **el módulo de material muestra la fórmula junto al número**, exactamente como `formulaFor()` hace en el cotizador (`"$55 ($55) × 40cm × 8"`): el de fabricación tiene que poder ver *por qué* dice 1 lámina antes de creerlo, y corregirlo con una pulsación.

### 4.3 El catálogo de material inicial

Las seis unidades de compra que dijo el usuario, tal cual: **unidad, bolsa, caja, lámina, litro, metro**. El empaque raro se expresa con `medida` + `minimo`, no inventando unidades nuevas.

| id | Material | uCompra | medida | uConsumo | factor | minimo |
|---|---|---|---|---|---|---|
| `acr-3` | Acrílico opal/transparente 3 mm | lamina | 1.22 × 1.83 m | m² | **2.2326** | 1 |
| `acr-6` | Acrílico blanco 6 mm (cara de caja) | lamina | 1.22 × 2.44 m | m² | **2.9768** | 1 |
| `al-lisa` | Lámina de aluminio lisa cal. 26 | lamina | 1.22 × 2.44 m | m² | **2.9768** | 1 |
| `al-brush` | Aluminio brush cepillado | lamina | 1.22 × 2.44 m | m² | **2.9768** | 1 |
| `acero-esp` | Acero inoxidable espejo cal. 24 | lamina | 1.22 × 2.44 m | m² | **2.9768** | 1 |
| `lam-galv` | Lámina galvanizada cal. 24 | lamina | 1.22 × 2.44 m | m² | **2.9768** | 1 |
| `alucobond` | Alucobond 4 mm | lamina | 1.25 × 2.50 m | m² | **3.125** | 1 |
| `tub-1` | Tubular 1" cal. 18 | metro | tramo de 6 m | cm | **100** | 6 |
| `led-fria` | Módulo LED 3 chips 12 V 6500 K | caja | caja de 20 | pza | **20** | 1 |
| `led-calida` | Módulo LED 3 chips 12 V 3000 K | caja | caja de 20 | pza | **20** | 1 |
| `fuente-60` | Fuente 12 V 60 W | unidad | — | pza | **1** | 1 |
| `vinil-corte` | Vinil de corte | metro | rollo de 1.22 m de ancho | m² | **1.22** | 1 |
| `vinil-impr` | Vinil de impresión | metro | rollo de 1.37 m | m² | **1.37** | 1 |
| `neon-flex` | Neón flex 12 V | metro | rollo de 5 m | cm | **100** | 5 |
| `pija-14` | Pija 1/4 × 2" con taquete | bolsa | bolsa de 100 | pza | **100** | 1 |
| `silicon` | Silicón neutro | unidad | cartucho | m de sello | **12** | 1 |
| `solvente` | Limpiador / solvente | litro | — | m² limpiados | **25** | 1 |
| `pintura` | Pintura automotiva | litro | — | m² a 2 manos | **8** | 1 |

Los tres primeros aciertos de la categoría `Categoria` de `Gastos - AL3D` que sí eran insumo (`Laminas` $33,280 en 11 gastos, `Iluminacion` $12,372, `Graficos` $22,577) mapean 1:1 sobre este catálogo — y por primera vez con `pid`, es decir **con gasto por proyecto**, que es exactamente lo que esa base nunca tuvo.

### 4.4 Las reglas de consumo, tipo por tipo

`/app/js/datos/reglas.js`. Declarativas, un objeto por tipo de partida.

#### `letras` — `{material, comp, luz, ilumTipo, altura h, n}`

```
perim_cm   = K_PERIM[comp] × h × n
esqueleto  = perim_cm / 2
area_nest  = K_AREA_NEST × h² × n / 10000            → m²
canto_m2   = perim_cm × PROF_CANTO / 10000 / APROV_TIRAS   → m²

metal      = { al-paint:'al-lisa', al-brush:'al-brush', acr-vol:'al-lisa',
               acr-vinil:'al-lisa', acero:'acero-esp' }[material]

// Los materiales con ilum 'LED posterior' (al-paint, al-brush, acero) llevan la cara
// del mismo metal y el acrílico va atrás para cerrar y montar el módulo.
// Los de 'LED fría frontal' (acr-vol, acr-vinil) llevan la cara de acrílico y el metal
// solo en el canto. Fuente: MATERIALES[].ilum (L2729-2733) y descGemini (L6094-6104).
posterior  = material in {al-paint, al-brush, acero}

metal      += canto_m2 + (posterior ? area_nest : 0)
acr-3      += area_nest
vinil-corte += (material === 'acr-vinil') ? area_nest : 0
led        = luz ? ceil(esqueleto / PASO_LED)  módulos  (led-fria | led-calida por ilumTipo)
fuente-60  = luz ? ceil(led × W_MODULO / (60 × CARGA_FUENTE))
pija-14    = PIJAS_POR_LETRA × n
silicon    = perim_cm / 100 / REND_SILICON
solvente   = area_nest / REND_SOLVENTE
pintura    = (material === 'al-paint') ? area_nest / REND_PINTURA : 0
```

#### `recorte` — `{acab, recComp, altura h, n}`
```
area_nest  = K_AREA_NEST × h² × n / 10000     // misma forma que una letra: es una silueta
acr-3      += area_nest × (acab==='sandwich' ? 2 : 1)   // sándwich = dos caras
vinil-corte += (acab==='vinil') ? area_nest : 0
led        = (acab==='sandwich') ? ceil(K_PERIM.recta × h × n / 2 / PASO_LED) : 0
fuente-60  = ceil(led × W_MODULO / 48)
silicon    = (acab==='sandwich') ? K_PERIM.recta×h×n/100/REND_SILICON : 0
```
Honestidad: el `n` de un recorte cuenta **piezas físicas** (iconos, siluetas), no área, y no hay ancho. Reusar `K_AREA_NEST` es un supuesto declarado, no un cálculo.

#### `bastidor` — `{bas, ancho, alto}` — **el único tipo con área física exacta**
```
m2_real   = ancho × alto / 10000              // ÁREA REAL, no la cobrada con max(m2,1)
panel     = { lamina:'lam-galv', alucobond:'alucobond' }[bas]
panel     += m2_real / APROV_PANEL
tub-1     += 2×(ancho+alto)  +  travesaños: floor(max(ancho,alto)/60) × min(ancho,alto)   cm
pija-14   += ceil(m2_real × 6)
solvente  += m2_real / REND_SOLVENTE
```
El tubular de 1" está nombrado literalmente en `descTxt` (L6033): *"estructura tubular de 1\" forrada de …"*. Los travesaños a 60 cm son un supuesto de taller declarado.

#### `caja` — `{tarifa, ancho, alto}`
```
m2_real   = ancho × alto / 10000
acr-6     += m2_real / APROV_PANEL                                  // cara frontal
lam-galv  += (2×(ancho+alto) × PROF_CAJA / 10000) / APROV_TIRAS      // marco lateral
tub-1     += 2×(ancho+alto)                                          // bastidor interno
led-fria  += ceil(m2_real × 10000 / (PASO_LED × PASO_LED × 1.5))     // retícula interior
fuente-60 += ceil(led × W_MODULO / 48)
silicon   += 2×(ancho+alto)/100 / REND_SILICON
// tarifa 4600 (nube/silueta) => APROV_PANEL baja a 0.75: una silueta desperdicia lámina
```
`descTxt` (L6034) fija que la caja siempre es *"Caras en Acrílico con Iluminación LED Fría"* → `led-fria`, nunca cálida. La profundidad no existe en el modelo: es constante.

#### `manual` — **excluido, y dicho con palabras**
El propio prompt de IA la describe como *"instalación, viáticos, rotulación vehicular u otros"*. No hay material derivable. En pantalla: `Sin material calculable — captúralo si lo quieres en el almacén`, con un botón para añadir líneas a mano.

**Un hueco real que hay que nombrar:** el **neón flex** se vende (hay un proyecto "Priscilla - Neón Flex «Enjoy»" en la base viva) y el cotizador no tiene un tipo para él, así que se cotiza como `manual` → **deriva cero material**. El catálogo ya trae `neon-flex` como material para que se pueda capturar a mano hoy; la solución de verdad es un sexto `tipo` en el cotizador, que se anota como pendiente y **no se toca ahora** porque toca producción.

### 4.5 El ejemplo completo: 8 letras de 40 cm de acero inoxidable, rectas, con luz fría

```
perim_cm   = 4.4 × 40 × 8                        = 1,408 cm de canto
esqueleto  = 704 cm
area_nest  = 1.05 × 40² × 8 / 10000              = 1.344 m²
canto_m2   = 1,408 × 5 / 10000 / 0.90            = 0.782 m²
acero-esp  = 1.344 (caras, es LED posterior) + 0.782 (canto) = 2.126 m²
acr-3      = 1.344 m²  (respaldo)
led-fria   = ceil(704/10) × ... → ceil(88/10)=9 por letra × 8   = 72 módulos
fuente-60  = ceil(72 × 0.72 / 48) = ceil(1.08)   = 2 pzas
pija-14    = 4 × 8                               = 32 pzas
silicon    = 14.08 m / 12                        = 1.17 → 2
solvente   = 1.344 / 25                          = 0.054 L
```
Conversión a unidad de compra — `ceil((requerido − existencia) / factor)`, respetando `minimo`:

| Material | Requerido | Existencia | Faltante | **Comprar** |
|---|---|---|---|---|
| Acero inoxidable espejo cal. 24 | 2.126 m² | 0 | 2.126 m² | **1 lámina** (2.9768 m²) |
| Acrílico 3 mm | 1.344 m² | 0.5 m² | 0.844 m² | **1 lámina** (2.2326 m²) |
| Módulo LED 12 V fría | 72 pza | 15 pza | 57 pza | **3 cajas** de 20 |
| Fuente 12 V 60 W | 2 pza | 0 | 2 | **2 unidades** |
| Pija 1/4×2" | 32 pza | 60 pza | 0 | — |
| Silicón neutro | 1.17 cartuchos | 3 | 0 | — |
| Solvente | 0.054 L | 4 L | 0 | — (se consume del existente) |

En pantalla, con la fórmula al lado y en el registro del proyecto:

> **Acero inoxidable espejo cal. 24 — 1 lámina**
> `4.4 × 40cm × 8 = 1,408 cm de canto × 5 cm ÷ 0.90 = 0.78 m² · caras 1.05 × 40² × 8 = 1.34 m² · total 2.13 m² ÷ 2.98 m²/lámina`
> Ajustar

### 4.6 Lo que sigue sin poder derivarse, y cómo se captura con el mínimo esfuerzo

| Falta | Se resuelve como | Toques humanos |
|---|---|---|
| Profundidad de canto, de caja, de bastidor | **Constante** con override por proyecto | **0** (1 si alguien quiere afinar) |
| Ancho y área real del glifo | Factores `K_PERIM` / `K_AREA_NEST` sobre la altura | **0** |
| Espesores (mm de acrílico, calibre de lámina) | Van en el **nombre del material**: `Acrílico 3 mm`, `cal. 24`. Se eligen al dar de alta el material una vez, no por proyecto | **0** por proyecto |
| Ancho de las piezas de recorte | Se supone la misma forma que una letra. Declarado | **0** |
| Costo unitario de cada material | Campo opcional en el catálogo, se llena al registrar la primera compra si a alguien le interesa. **La lista de compra funciona sin él** (dice cuántas láminas, no cuántos pesos) | **0** |
| Anclaje físico de la existencia | `movimiento.conteo`: **un número por material**, mensual, y solo de los materiales cuya existencia derivada lleva más de 30 días sin conteo. Un botón "así está" acepta el número derivado sin teclear | ~5 números al mes |
| Consumo real por proyecto | **No se captura.** Al marcar el proyecto como fabricado, la plataforma emite las `movimiento.salida` del requerimiento congelado completo, con su `pid` | **1 toque por proyecto** |
| Entrada de compra | El botón "Recibí lo de la lista" sobre la lista de compra convierte los faltantes en `movimiento.entrada` | **1 toque por compra** |

Total de captura del módulo de almacén en un mes con 15 proyectos y 6 compras: **21 toques y ~5 números**. Si esto no cabe en el día de nadie, el módulo de stock no se puede hacer local ni con servidor, y eso también hay que decirlo.

---

## 5. ARQUITECTURA DE ARCHIVOS

Estado actual del repo, verificado: `index.html` (689 KB, 10 075 líneas), `sw.js` (2 509 B), `manifest.webmanifest`, `logo-al3d.png`, `logo-al3d-dark.png`, `README.md`. Nada más.

```
/index.html                  ← INTACTO. El cotizador en producción. Cero cambios.
/sw.js                       ← MODIFICADO. Único service worker del sitio, scope '/'.
/manifest.webmanifest        ← INTACTO. Quien tiene el cotizador instalado no pierde nada.
/logo-al3d.png  /logo-al3d-dark.png   ← INTACTOS.

/app/
  index.html                 Cascarón de la plataforma: sprite SVG, topbar, nav de 6
                             módulos, un <section> por módulo, y <script type="module">.
                             Sin lógica: solo estructura y el punto de entrada.
  manifest.webmanifest       "AL3D Plataforma", start_url "./", scope "../"
  css/
    sistema.css              COPIA LITERAL del sistema de diseño (index.html L26–2101),
                             con las 5 capas en su orden: estructura, teléfono ≤560px,
                             puntero grueso, capa de barro, bloque de cierre, print.
                             Encabezado que nombra el origen y la ley de la hoja.
    plataforma.css           SOLO lo nuevo: rejilla del calendario, renglones de almacén,
                             contenedor del mapa. Cada regla en la capa que le toca.
  js/
    app.js                   Arranque, ruteo por hash (#inicio #proyectos #agenda
                             #material #mapa #cotizador), alta de _CAPAS, registro del SW,
                             ajustarTopbarMovil(), el oyente de 'storage'.
    nucleo/
      identidad.js           al3dp_disp, rol, nombre, derivación de seq
      eventos.js             crear evento, orden total (ts,disp,seq), fusión idempotente
      almacen.js             IndexedDB: abrir, escribir, leer por índice, checkpoint
      proyeccion.js          eventos → estado (proyectos, instalaciones, existencias)
      puente.js              LECTURA SOLA de al3d_historial / al3d_queue / al3d_q / al3d_folio
      compartir.js           exportar/importar el .json de intercambio (Web Share + descarga)
    datos/
      materiales.js          el catálogo de §4.3
      constantes.js          las constantes de §4.2, cada una con su aritmética comentada
      reglas.js              las reglas de consumo de §4.4
      reglas-recordatorio.js las 11 reglas de §7, como funciones puras del estado
    derivar.js               requerimiento(pid), faltantes(), listaDeCompra()
    ics.js                   buildICS(), plegado por OCTETOS, UID estable, SEQUENCE
    wa.js                    los 4 mensajes armados; reusa el patrón de wa.me de L6009
    csv.js                   importador del CSV de Ventas - AL3D (y de los .md opcionales)
    geo.js                   parseGmaps() local + cola Nominatim 1 req/s + caché en 'geo'
    mod/
      inicio.js  proyectos.js  agenda.js  material.js  mapa.js  cotizador.js
  vendor/
    leaflet.css  leaflet-src.esm.js  images/    ← VENDORIZADO, no CDN
```

### Cómo se carga sin build

`<script type="module" src="./js/app.js">`. Los módulos ES nativos funcionan en GitHub Pages sobre HTTPS sin bundler. Los import son rutas relativas explícitas con extensión.

Leaflet 1.9.4 **quitó el entrypoint ESM del `package.json`**, así que se importa el archivo concreto y **con namespace import**, porque `leaflet-src.esm.js` no tiene default export:
```js
import * as L from '../vendor/leaflet-src.esm.js';   // `import L from` da undefined
```
El CSS va con `<link>`: no hay CSS modules en navegador sin bundler.

**Leaflet va vendorizado y no por CDN por una razón leída en el código, no por gusto:** el `sw.js` actual hace `if (url.origin !== self.location.origin) return;` — **no cachea nada de otro origen**. Un Leaflet desde unpkg dejaría el mapa muerto sin señal, que es el escenario para el que existe el service worker.

### Un conflicto de z-index que hay que resolver antes de escribir el mapa

La pila del proyecto está casi agotada: filete `body::before` y `.salto` → 200, `#toast` → 100, `.modal-bg` → 60, `#lightbox` → 80, `.mbar` → 45, `.topbar` → 30. Leaflet usa internamente `z-index:400` en `.leaflet-pane` y **1000** en `.leaflet-top`/`.leaflet-bottom`. Sin aislar, los controles del mapa se pintarían encima del filete de marca y del toast.

```css
/* El mapa crea su propio contexto de apilamiento: los z-index internos de Leaflet
   —400 en los paneles, 1000 en los controles— se quedan dentro y no le ganan al
   filete de marca (200) ni al toast (100). Sin esto, el botón de zoom se pinta
   encima del aviso que dice que no se pudo guardar. */
#mapa-lienzo{position:relative;isolation:isolate;z-index:1;height:60vh}
```
Capas nuevas declaradas: `.mapa-hoja` (la ficha del pin) → **40**, debajo de `.mbar`; la hoja del día de la agenda es un `.modal-bg` normal → **60**, dada de alta en `_CAPAS`.

### El cotizador "implementado dentro"

Módulo 6 = **`<iframe src="../index.html" title="Cotizador AL3D">` a sangre completa**, mismo origen. Esto da tres cosas gratis:
1. **`localStorage` es literalmente el mismo**: el iframe lee y escribe `al3d_*` sin puentes ni serialización.
2. **Cero fork**: el cotizador en producción es el que se usa, con sus 10 075 líneas, su escalador, su vectorizador y su PDF. No hay dos versiones que divergir.
3. **La plataforma se entera de una autorización sin tocar `index.html`**: el evento `storage` **no** llega al documento que escribió, pero sí a los otros contextos de navegación. El iframe escribe `al3d_historial` al autorizar → el marco padre recibe el `storage` y aparece la tarjeta "COT-0007 autorizada · ¿se ganó?". El propio `index.html` ya usa este mecanismo con este propósito exacto (L8695+, el aviso de dos pestañas), así que está probado en este código.

Detalle de presentación: al entrar al módulo 6 la topbar de la plataforma se oculta y el iframe ocupa el alto completo (`height:100dvh`). La `.mbar` del cotizador es `position:fixed` **dentro del viewport del iframe**, que es la caja del iframe: se comporta bien. Se sale con el patrón `.hist` de §6.5 del sistema (`history.pushState` + `popstate`) para que el "atrás" del teléfono vuelva a la plataforma y no salga de la app.

### El service worker

**Un solo SW, en la raíz, scope `/`.** `index.html` ya registra `sw.js` con `registrarSW()`; `/app/index.html` registra **el mismo archivo** (`'../sw.js'`). Dos SW con scopes anidados sería una fuente de bugs sin ninguna ganancia.

Cambios a `sw.js`:
```js
const CACHE = 'al3d-v2';                       // sube de versión: activate limpia la v1
const BASICOS = ['./','./index.html','./manifest.webmanifest',
  './logo-al3d.png','./logo-al3d-dark.png',
  './app/','./app/index.html','./app/manifest.webmanifest',
  './app/css/sistema.css','./app/css/plataforma.css',
  './app/js/app.js', /* … los módulos … */
  './app/vendor/leaflet.css','./app/vendor/leaflet-src.esm.js'];
```
Se conserva `c.add(u).catch(()=>null)` de uno en uno: si un archivo falta, la instalación no se cae entera. Se conserva **red primero, caché de respaldo** para todo el propio origen, por la razón que ya está escrita en el archivo: *"el sitio se publica subiendo index.html a la rama main, así que una caché que mande siempre serviría la versión vieja después de publicar"*.

**Se añade una sola excepción, para las teselas del mapa:**
```js
/* Las teselas son el único cruce de origen que se guarda, y va al revés: caché primero.
   La política de OSM lo EXIGE («cachear según los headers HTTP; mínimo 7 días si tu caché
   no los sabe leer»), y prohíbe lo contrario —bajar por adelantado lo que el usuario no
   está viendo—. Así que aquí solo se guarda lo que ya se pintó en pantalla, con tope de
   300 entradas por LRU, y NUNCA se precarga un área. */
const TILE_HOSTS = ['tile.openstreetmap.org','basemaps.cartocdn.com'];
```
Consecuencia que el usuario va a ver: **sin señal, el mapa muestra en gris las zonas que nunca visitó, con los pines en su sitio correcto** (los pines son datos locales). El aviso lo dice con palabras: `El mapa sin señal solo dibuja las zonas que ya viste. Los pines están completos.`

### La deuda que se asume a ojos abiertos

`css/sistema.css` es una **copia** de `index.html` L26–2101. Es un fork del sistema de diseño y hay que decirlo: si alguien cambia un token en el cotizador y no en el archivo, las dos mitades de la app divergen. La alternativa —convertir el `<style>` inline de `index.html` en un `<link>`— toca producción y no se hace hoy. El archivo lleva en su encabezado la línea que lo dice y el plan: *cuando el cotizador se toque por otra razón, su `<style>` pasa a ser un `<link>` a este archivo.* El README recibe una sección con la misma nota.

---

## 6. LOS SEIS MÓDULOS

Nota transversal: el rol no es seguridad, es modo de trabajo (§3.4). Todos los importes con `money()` y `font-variant-numeric:tabular-nums`. Todo lo interpolado pasa por `esc()`. Un solo botón con relleno de color por pantalla.

### 1 · Inicio / Recordatorios (`#inicio`)

Una `.card` por regla activa, ordenadas por urgencia, cada una con **una** acción principal. Los recordatorios son instancias derivadas (§3.3), así que la lista se recalcula al abrir y no hay nada que administrar. Arriba, la barra de frescura: `Almacén: al día · Fabricación compartió hace 4 h` o, en ámbar, `Fabricación no comparte desde el martes · lo que ves del almacén tiene 3 días`.

| | DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|---|
| Instalaciones de hoy y mañana | ve todas | ve todas | — |
| Faltantes a T-3 | ve, con costo si hay | **ve, con el botón de compra** | — |
| Cotizaciones autorizadas sin ganar ni perder (>7 d) | **ve y decide** | — | — |
| Cola de precios pendientes (`al3d_queue`) | **ve y autoriza** | — | — |
| Anticipo no registrado (>3 d del ganado) | ve | — | **ve y actúa** |
| Instalación hecha sin liquidar (>48 h) | ve | — | **ve, con la fila TSV lista** |
| Comisiones pendientes (del CSV de Notion) | **ve** | — | ve |
| Existencia bajo el mínimo | ve | **ve** | — |
| Recordatorio del ritmo: "comparte el día" | 18:00 | **18:00** | viernes |

### 2 · Proyectos (`#proyectos`)

La lista de obras ganadas, agrupada por estado con los nombres de Notion (`FABRICACION`, `COBRANDO`, `LIQUIDADO`, `REPARANDO`) más los propios (`ganado`, `listo`, `instalado`). Cada renglón es un `.queue-item` con `role="button" tabindex="0"` y el `onkeydown` de `_ABRIBLE`.

**Y arriba de todo, la tarjeta que es el eslabón que falta:** una `.cand-partidas` en ámbar con latido, `Tienes 3 cotizaciones autorizadas sin decidir`. Al abrirla, la lista de `al3d_historial` que no tiene un `proyecto.creado`, cada una con dos botones: **Se ganó** / **No se dio**. "Se ganó" es *una* pulsación y produce, de golpe: el proyecto con el nombre ya armado en la convención `Contacto - Negocio (trabajo)`, el `Tipo de proyecto` derivado, el requerimiento de material calculado, la ubicación resuelta desde `maps`/`dirRaw`, la fila TSV para pegar en Notion y la invitación a agendar.

| | DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|---|
| Ganar / descartar cotización | **sí** | no | no |
| Precios e importes | ve todo | **no ve dinero** | ve todo |
| Memoria técnica, fotos | edita | **edita** | ve |
| Estado de obra | mueve todos | mueve `fabricacion→listo` | mueve `→cobrando/liquidado` |
| Fila TSV para Notion | **copia** | no | copia |

*(«no ve dinero» reutiliza `body.precios-ocultos` del cotizador, que ya existe y ya está resuelto en `@media print`.)*

### 3 · Agenda (`#agenda`)

Mes, semana y día. Un renglón por instalación con hora, proyecto, tipo y —si falta material— una `.ptok.falta`. Duración estimada por defecto según el tipo. La única captura del módulo: **fecha y hora**, prellenadas.

Acciones de la ficha: `Agendar en el calendario` (descarga el `.ics` del evento, con VALARM a −P1D y −P3D), `Confirmar con el cliente` (WhatsApp armado), `Compartir con el instalador` (WhatsApp armado: dirección, enlace de mapa, hora, qué se instala, contacto — **así el instalador tiene la información sin tener acceso a la app**), `Mover` (produce `instalacion.movida`, sube `SEQUENCE`, el `.ics` reemplaza en vez de duplicar porque el `UID` es estable), `Hecha`.

| | DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|---|
| Agendar y mover | **sí** | propone (deja un `instalacion.movida` que dirección ve) | no |
| Ver el calendario completo | sí | sí | solo las de la semana |
| Compartir con el instalador | sí | sí | no |
| Exportar `.ics` de todo | sí | sí (el suyo) | sí (el suyo) |

### 4 · Material (`#material`)

Tres pestañas con `.tipo-seg`:
- **Por comprar** — la lista de faltantes agregada de todos los proyectos con instalación agendada, en unidades de compra, con el proyecto y la fecha que la exige. `@media print` la deja como una lista de compra en papel para el taller. Botón `Recibí lo de la lista`.
- **En almacén** — un renglón por material: existencia derivada, unidad, comprometido, sello `contado el 12 ago por Omar` o `derivado · nunca contado`. Botón por renglón: `Así está` / `Corregir`.
- **Por proyecto** — el requerimiento desglosado con su fórmula al lado, y `Ajustar` por línea.

| | DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|---|
| Ver faltantes y comprometido | sí | **sí** | no |
| Registrar entradas y conteos | sí | **sí (es su módulo)** | no |
| Corregir un requerimiento | ve | **sí** | no |
| Editar el catálogo de material | **sí** | sí | no |
| Costos y totales de compra | **sí** | solo cantidades | sí |

### 5 · Mapa (`#mapa`)

Leaflet vendorizado, teselas OSM (CARTO configurable), centro en Guadalajara. Un pin por proyecto, color por estado usando los colores de estado del sistema (`--av` pendiente, `--a` agendada, `--ok` instalada, `--mal` problema) **y forma/etiqueta además del color**, nunca color solo. Los que no tienen ubicación viven en una lista aparte con el botón `Ubicar los 6 que faltan` (cola Nominatim, 1 req/s, por botón — nunca al teclear). Pin arrastrable para confirmar.

`Google Maps preparado y no implementado`, tal como se pidió: existe el objeto `TILES` con las tres entradas y la función `capaBase(prov)`; la rama `'google'` es un stub de 4 líneas con un comentario que dice qué llave necesita y qué hay que cambiar. La estructura está, el código no.

| | DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|---|
| Todos los pines, todos los estados | **sí** | sí | los que cobran |
| Ruta del día (los pines de hoy, ordenados) | sí | sí | no |
| Corregir un pin | sí | sí | no |
| Histórico importado de Notion | **sí** | no | sí |

### 6 · Cotizador (`#cotizador`)

El `index.html` real en un iframe a sangre completa. Los tres roles lo abren igual porque es la app que ya conocen; dirección y fabricación entran como `vendedor`, y el segmento de rol interno del cotizador (`vendedor`/`autorizador`) sigue funcionando tal cual porque no se toca nada.

---

## 7. AUTOMATIZACIONES

**El principio que gobierna todas:** una PWA estática **no puede despertarse sola**. Push exige un push service, VAPID y un servidor que mande; Periodic Background Sync es solo Chrome, exige PWA instalada y engagement alto, y aun así no garantiza nada. Por eso:

> **El calendario del teléfono es el despertador. La plataforma es el cerebro.**

Un `VALARM` suena a una hora fija y no sabe nada del estado del almacén. Lo que se pone en el `DESCRIPTION` no es una respuesta, es una orden de abrir la app; y al abrirla, la proyección calcula la respuesta de verdad contra los datos del momento. Eso es lo que hace que 11 reglas funcionen con cero servidor.

| # | Regla | Disparador | Recibe | Canal | Qué la hace posible |
|---|---|---|---|---|---|
| 1 | **T-3 de la instalación, falta material** | `VALARM TRIGGER:-P3D` en el `.ics` de la instalación + reevaluación al abrir | FABRICACIÓN, y DIRECCIÓN | Notificación del calendario → tarjeta ámbar en Inicio → botón `Avisar por WhatsApp` con la lista de faltantes ya escrita | El `.ics` se genera al agendar (una pulsación). El faltante se recalcula local: `requerimiento(pid) − existencia`. `wa.me` con el texto armado, como en L6009 |
| 2 | **T-1: confirmar con el cliente y avisar al instalador** | `VALARM TRIGGER:-P1D` | DIRECCIÓN | Calendario + 2 botones de WhatsApp armado (cliente / instalador) | El instalador no necesita cuenta: recibe dirección, enlace de mapa, hora y qué instalar en un mensaje |
| 3 | **Cotización autorizada hace >7 d sin ganar ni perder** | Proyección al abrir | DIRECCIÓN | Tarjeta en Inicio con `Se ganó` / `No se dio` | `al3d_historial[].ts` (el único timestamp real del modelo) menos la ausencia de un `proyecto.creado` con ese folio. **Cero captura** |
| 4 | **Proyecto ganado hace >3 d sin anticipo registrado** | Proyección al abrir | PAGOS | Inicio + la fila TSV lista para Notion | `proyecto.creado.ts` sin evento `proyecto.estado:'cobrando'` ni movimiento de anticipo |
| 5 | **Existencia bajo el mínimo** | Proyección al abrir | FABRICACIÓN | Inicio + entra a "Por comprar" | PN-Counter contra `minStock` del catálogo |
| 6 | **Comprometido supera la existencia** | Proyección al abrir | FABRICACIÓN + DIRECCIÓN | La lista de compra, ordenada por la fecha de instalación que lo exige | Suma de requerimientos de proyectos con instalación agendada − existencia. Es la regla que convierte la agenda en una lista de compra |
| 7 | **Instalación hecha hace >48 h sin liquidar** | Proyección al abrir | PAGOS | Inicio + `Copiar fila para Notion` (`Estatus: COBRANDO`) | `instalacion.hecha` sin `proyecto.estado:'liquidado'`. La fila la arma `copiarFilaVenta` que ya existe |
| 8 | **Nadie ha fusionado en 48 h** | Proyección al abrir, contra `max(ts)` por dispositivo | LOS TRES | Barra ámbar arriba de Inicio: *Fabricación no comparte desde el martes · lo que ves del almacén tiene 3 días* | Es la regla que hace **visible** el límite del local-first en vez de dejarlo silencioso. Es la más importante de la lista |
| 9 | **Ritmo diario: comparte el día** | Evento **recurrente** en el `.ics` del ritmo: `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` a las 18:00 | FABRICACIÓN | Notificación del calendario → un toque abre la app en el botón `Compartir el día` | **El calendario del teléfono es el cron.** Un `.ics` con `RRULE` da tareas recurrentes sin un solo servidor |
| 10 | **Conteo físico mensual** | `RRULE:FREQ=MONTHLY;BYMONTHDAY=1` en el mismo `.ics` de ritmo | FABRICACIÓN | Calendario → lista de los materiales sin contar en 30 días | Solo pide número de los que hayan derivado; para el resto, `Así está` |
| 11 | **Comisión pendiente** | Al importar el CSV de Notion (`Comision Restante > 1`) | DIRECCIÓN | Inicio, hasta el próximo import | La vista *Comisiones Pendientes* ya existe en Notion con ese filtro; aquí es la misma condición sobre el CSV |

Detalles del `.ics` que hay que respetar o esto no funciona:

- **`UID` estable**: `inst-<iid>@al3d.mx`. Si cambia, el importador crea un evento duplicado en vez de actualizar. Al mover una instalación se conserva el `UID` y se sube `SEQUENCE` (= cuenta de eventos `instalacion.movida`, que sale del log).
- **Variante UTC, sin `VTIMEZONE`**: elimina de golpe toda la clase de bugs de zona. Y la conversión no pasa por `Date`: México **abolió el horario de verano el 30/oct/2022** y Jalisco está fijo en UTC−6 todo el año, así que `10:00` en Guadalajara es `T160000Z` por aritmética pura (`+6`, con acarreo de día). Si algún día se reinstaura el DST, cambia una constante: `OFFSET_MX = 6`.
- **Plegado a 75 octetos, no caracteres**, sin partir un carácter multibyte — con `ó`, `é` y `ñ` en cada descripción esto no es teórico. Escapado en orden: `\` → `;` → `,` → salto de línea. `:` no se escapa. **CRLF en todas las líneas, incluida la última.**
- **La suscripción por URL no se usa** (12–24 h de refresco, imposible de forzar). Descarga por evento, y un `.ics` de agenda completa cuando cambia mucho el plan.

Y la honestidad sobre el canal de WhatsApp: `wa.me` **solo lleva texto, no adjunta archivos**. El `.ics` y el archivo de intercambio van por la hoja de compartir del sistema (`navigator.share({files:[…]})`, que exige HTTPS y gesto del usuario — GitHub Pages cumple lo primero), con respaldo a `descargarArchivo()` (L6865, ya existe) para que el usuario lo adjunte a mano. Hay que probar `navigator.canShare({files})` en el iPhone y en el Fold antes de prometerlo; el respaldo funciona siempre.

---

## 8. RIESGOS Y LÍMITES

### 8.1 La pregunta directa: ¿pueden tres personas en tres dispositivos compartir un stock sin servidor?

**La contabilidad, sí. La disponibilidad, no.** Desglosado:

| Propiedad | ¿Se consigue? | Por qué |
|---|---|---|
| **Convergencia del total** | **Sí, garantizada** | Sumar deltas es conmutativo y asociativo. Una vez que los tres archivos se cruzaron, los tres ven el mismo número, sin importar en qué orden llegaron ni cuántas veces |
| **Idempotencia del intercambio** | **Sí** | El `id` de evento es `disp:seq`. Reimportar el mismo archivo cinco veces no cambia nada. Esto es lo que hace viable un grupo de WhatsApp como transporte |
| **Puntualidad** | **No** | El número que ves tiene la edad de la última fusión. Con disciplina de una vez al día, el peor caso es 24 h. Sin disciplina, no hay techo |
| **Reserva atómica** | **No, y es imposible** | Dos personas pueden comprometer material que juntas sobregiran la existencia física. Ningún dispositivo puede ver al otro en el momento de decidir |
| **Autorización** | **No** | Sin servidor no hay permisos, solo configuración local |

**Qué ve el usuario cuando se rompe, con nombre y apellido:**

- **Compra doble.** La lista dice `Acero inoxidable — faltan 2 láminas`. Se compran. Ya había 3 en el taller que fabricación registró el martes y no compartió. Son ~$8,000 gastados dos veces.
- **La ausencia inversa, que es peor.** La lista no dice nada porque el requerimiento del proyecto de otro dispositivo nunca llegó. La cuadrilla llega el día de la instalación y no hay material.
- **El desalojo silencioso de la app.** Si nadie exporta durante dos semanas, la plataforma degrada a tres aplicaciones privadas que se ven idénticas y dicen cosas distintas.

**Lo que la arquitectura hace al respecto, y es todo lo que se puede hacer sin servidor:**
1. El stock **nunca se presenta como una verdad**: siempre lleva el sello `contado el 12 ago por Omar` o `derivado · nunca contado`, y la barra de frescura de arriba de Inicio dice la edad de cada dispositivo.
2. La lista de compra lleva la nota fija: `Verifica en el taller antes de comprar` para todo lo que pase de una unidad de compra.
3. La **regla 8** hace visible el retraso en vez de esconderlo. Es la única defensa real.
4. La regla 1 (T-3) fuerza una revisión humana **antes** de que se gaste el dinero.
5. **La escalada está medida, no opinada**: la app cuenta (a) las veces que un conteo físico difirió de la existencia derivada en más de una unidad de compra, y (b) el retraso medio de fusión. Ambos números viven en Ajustes. **Si en un mes hay más de 2 incidentes del tipo (a) o el retraso medio pasa de 24 h, se pasa a la Fase 3.** El log de eventos ya es el formato de cable, así que la escalada no cambia el cliente.

### 8.2 Los demás riesgos

| Riesgo | Cuándo pasa | Qué ve el usuario | Mitigación |
|---|---|---|---|
| **Cuota compartida con el cotizador** | Si el log viviera en `localStorage` | El cotizador diría *"No hubo espacio para guardar en el historial — respalda y borra cotizaciones viejas"*, y `saveHistorial` empezaría a soltar `aiFile.url` de las cotizaciones viejas | **Ya mitigado por diseño**: log y fotos en IndexedDB, `localStorage` solo para 5 claves cortas |
| **Desalojo de almacenamiento en iOS** | Safari puede desalojar almacenamiento de sitios sin interacción en ~7 días. El rol de PAGOS abre la app una vez al mes | Abre la app y **está vacía** | Recordatorio semanal de exportar; Inicio muestra `último respaldo: hace 9 días` en ámbar; la app instalada en pantalla de inicio se comporta mejor. **Hay que verificarlo en el iPhone real antes de prometer nada** |
| **Reloj torcido** | Un dispositivo con la fecha mal | Una edición "del futuro" que nada puede sobrescribir; o un `movimiento.conteo` que se traga movimientos reales | Los contadores son inmunes (suma). Al fusionar, los eventos con `ts > ahora + 1 día` se aceptan pero se marcan: `3 movimientos de F4B2 llegaron con fecha futura`. El `conteo` que descarta movimientos posteriores lo dice en pantalla |
| **Teselas de OSM cortadas** | Sin aviso y sin SLA. Su política advierte explícitamente que los servicios comerciales pueden perder el acceso en cualquier momento | El mapa se queda gris; los pines siguen bien | `al3dp_tiles` conmutable a CARTO (5 M/mes, el único free tier verificado sin cláusula de no-comercial) sin cambiar código |
| **Nominatim** | Máximo absoluto **1 req/s**. Repetir la misma consulta es causa de bloqueo. El autocomplete client-side está prohibido | Un pin en la lista de `ubicación no confirmada` | Cola de 1.1 s, caché obligatoria en el store `geo`, botón explícito nunca al teclear, `countrycodes=mx`, `email=` para identificar la app. Escalada: LocationIQ (5,000/día, 2 req/s, mismo formato de respuesta) |
| **Enlaces cortos de Google Maps** | `maps.app.goo.gl` — cualquier cotización compartida desde el teléfono | El proyecto entra al mapa como `ubicación no confirmada` | **No hay truco de navegador.** Se detecta, se abre en pestaña nueva y se pide el enlace largo, o se cae al geocoding de `dirRaw` |
| **`al3d_historial` restaurado desde un respaldo viejo** | El usuario usa `restaurarDesde()` | Nada. Los proyectos siguen completos | `origen` es una copia congelada, no una referencia |
| **Dos pestañas** | Siempre que alguien las abra | Nada malo en la plataforma; el cotizador ya avisa lo suyo | El log es append-only: dos pestañas que añaden no se destruyen (a diferencia de `al3d_q`, que es último-que-escribe-gana). `BroadcastChannel` para repintar |
| **Folio duplicado entre dispositivos** | Dos teléfonos generan `COT-0008` en paralelo (el contador `al3d_folio` es local) | Dos proyectos distintos con el mismo folio en la lista | El id de proyecto es `pid` global; el folio se muestra como `COT-0008 · D7K2`. Nunca es clave |
| **Fork del sistema de diseño** | Cuando alguien cambia un token en un solo archivo | Un botón con el azul de antes | Encabezado en `sistema.css` con el plan; nota en el README |
| **El log crece** | Más allá de ~20 000 eventos | El arranque tarda | Checkpoint: snapshot materializado + marca de agua de `seq` en el store `estado`. No hace falta hoy (199 proyectos + ~2 000 eventos/año) |
| **El `.al3d` no pasa por WhatsApp** | Extensión desconocida | El archivo se rechaza | Se manda como `.json` (`application/json`); respaldo `.txt`; también sirve el correo o Drive |
| **Neón flex** | Cada vez que se vende (y se vende) | El proyecto dice `Sin material calculable` | Es honesto y visible. Se captura a mano con el material `neon-flex`. El arreglo real es un sexto tipo en el cotizador, que hoy no se toca |
| **Las constantes de §4.2 están mal** | Al principio, casi seguro | La lista de compra pide de más o de menos | La fórmula se muestra siempre junto al número; `Ajustar` deja un override con su porqué; una pantalla contrasta `constante propuesta` vs `lo que corriges`, para que el director la cambie **una vez** en el archivo |

### 8.3 Por qué no Supabase, con los números

No es prejuicio; es que **no resuelve el problema y añade tres modos de falla nuevos**:
- **Pausa a la semana de inactividad.** El rol de PAGOS abre la app una vez al mes → el proyecto free se pausa → la app da error de red, no un número viejo. Requiere un cron de keep-alive (GitHub Actions) que hay que mantener.
- **Cero días de retención de backup en el free tier.** El respaldo del negocio queda a cargo del usuario, con un `pg_dump` semanal propio.
- **El 83% de las exposiciones de Supabase son RLS mal configurada**, y basta una tabla con RLS apagada para que la anon key —que va publicada en el HTML a propósito— lea todo.
- Y sobre todo: **no arregla el campo vacío.** El problema de este negocio es la captura, no la persistencia.

La escalada correcta cuando haga falta (Fase 3) no es una base de datos: es un **relevo tonto del mismo log** — `POST` para añadir eventos, `GET` para leer desde un cursor, sin esquema en el servidor. Con Apps Script + una hoja se hace hoy, sin cuentas nuevas (ya viven en Google), con `Content-Type: text/plain` para no disparar preflight, `LockService.getScriptLock()` + `SpreadsheetApp.flush()` dentro del lock, y sin gastar cuota de UrlFetch porque las llamadas del navegador *hacia* la web app no cuentan. El cliente no cambia nada: el formato de cable ya es el log.

---

## 9. FASES

### Fase 0 — Se entrega y funciona hoy. Cero cuentas, cero llaves, cero despliegues.

Se sube `/app/` y el `sw.js` v2 a `main`. Al abrir `usuario.github.io/cotizador-al3d/app/`:

- El cotizador entero, dentro, funcionando igual que hoy.
- La tarjeta de `Cotizaciones autorizadas sin decidir` leyendo `al3d_historial` del dispositivo, con `Se ganó` / `No se dio`.
- Proyectos, con `Tipo de proyecto` derivado y la fila TSV lista para pegar en Notion.
- Agenda, con `.ics` por evento (VALARM −P1D y −P3D) y `.ics` de agenda completa.
- Material: catálogo de 18 líneas, requerimiento derivado con su fórmula, existencia por movimientos, lista de compra imprimible.
- Mapa con Leaflet vendorizado, teselas OSM, pines desde `parseGmaps()` local **sin una sola petición de red**, y el botón de geocodificar los que falten.
- Inicio con las 11 reglas.
- Exportar / importar el archivo de intercambio.
- Los 4 mensajes de WhatsApp armados.
- Todo sin señal, todo instalable, todo en el sistema de diseño del proyecto.

Lo único que se le pide al usuario: **elegir su rol y su nombre la primera vez** (dos toques), y que fabricación y pagos abran el enlace una vez en su teléfono.

### Fase 1 — El usuario hace dos cosas, diez minutos, una sola vez.

1. **Exportar `Ventas - AL3D` a CSV** desde Notion y soltarlo en el importador. Resultado: los 199 proyectos históricos con dinero, estatus y fechas; `$3,713,419.41` acumulado cuadrando; las comisiones pendientes en Inicio. *(Sin direcciones — el esquema no las tiene; §2.)* Si además exporta como *Markdown & CSV* y suelta los `.md`, salen los pines de las páginas que sí tienen memoria técnica escrita.
2. **Importar el `.ics` de ritmo** una vez en el calendario de cada quien: es el que trae las reglas 9 y 10 con `RRULE`. Es lo que convierte el teléfono en el cron del sistema.

### Fase 2 — Solo si la fricción del `.ics` resulta real. El usuario crea una cosa.

Proyecto en Google Cloud + OAuth Client ID de tipo *Web application* con `https://<usuario>.github.io` en **Authorized JavaScript origins** (el origin, sin path), scope `calendar.events`, publishing status en **Testing**. Con tres usuarios sobra: hasta 100 test users, **sin verificación y sin publicar**. Sin client secret: el token model de GIS no lo usa.

Qué gana: los eventos entran directo al calendario sin el paso de descargar, y las tres agendas se ven entre sí.
Qué cuesta: los tres verán la pantalla **"Google hasn't verified this app"** y tendrán que darle a *Advanced → Go to (unsafe)*, una vez cada uno. Se evita solo con Google Workspace y la pantalla de consentimiento en **Internal**.
Criterio de entrada, no opinión: **si en un mes hay más de 5 instalaciones agendadas cuyo `.ics` nunca se descargó.** La app lo cuenta.

### Fase 3 — Solo si el intercambio falla de verdad. La cosa más pequeña posible.

Disparador medido (§8.1): más de 2 conteos con diferencia mayor a una unidad de compra en un mes, **o** retraso medio de fusión sobre 24 h.

Se despliega un **relevo del log**, no una base de datos: Apps Script + una hoja, `doPost` que añade eventos y `doGet` que devuelve desde un cursor, con `text/plain` y `LockService`. El cliente no cambia: `compartir.js` gana una tercera vía junto a la hoja de compartir y el archivo. Sigue siendo offline-first, sigue siendo CRDT, sigue abriendo sin señal. Lo único que se pierde es la propiedad de "cero servidores", y se pierde **cuando el negocio haya demostrado que la necesita**, no antes.

Lo que **no** entra en ninguna fase: la API de Notion. Ni con proxy. El token de escritura de todo el workspace no tiene por qué existir para que una plataforma sepa cuántas láminas de acero hay que comprar.