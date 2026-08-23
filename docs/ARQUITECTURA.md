# PLATAFORMA AL3D — ARQUITECTURA DEFINITIVA
**v1.0 · 23/ago/2026 · Documento de construcción. Los agentes constructores no vuelven a decidir nada de lo que está aquí.**

Todo lo que sigue está verificado contra `/home/user/cotizador-al3d/index.html` (10 075 líneas, en producción) y `/home/user/cotizador-al3d/sw.js`. Lo que no pude verificar (comportamiento de red, CORS, aceptación de un `.ics` por un cliente real) está marcado **[POR VERIFICAR]** y por regla dura vive en Fase 2, nunca en Fase 1.

---

## 1. DECISIÓN Y POR QUÉ

Gana **notion-verdad**: Notion sigue siendo el sistema de registro de los proyectos ganados —199 filas, $3,713,419.41, cinco fórmulas de cobranza y siete vistas que tres personas ya usan— y la plataforma es la capa operativa que Notion no puede dar: la derivación de material desde las partidas del cotizador, el stock, el mapa con coordenadas reales y el puente *cotización autorizada → proyecto ganado*, que hoy no existe en ningún sistema. Gana porque es la única que pasa las seis pruebas de respeto a lo existente (dos inserciones aditivas en `index.html`, cero cambios en el camino de precios, las fórmulas de Notion declaradas intocables, el modelo de datos no duplicado sino congelado con el precedente de `_lt`) y la que menos infraestructura nueva pone en el camino crítico. Se le injertó: de **backend-propio**, el mecanismo de entrega de recordatorios por `attendees` (no por calendario compartido), la promoción atómica del service worker, los cuatro defectos verificados del modal Registrar Venta y el dato del escalador que hoy se tira a la basura; de **local-first**, IndexedDB para todo lo que crece, la existencia como suma de deltas sobre el último conteo, los sellos de frescura y los criterios numéricos de escalada; de **google-nativo**, agregar antes de redondear, el área de caja envolvente en vez del área de tinta, `confianza` con fallo fuerte y `dedupe_key` en los avisos. **El hallazgo de juez que cambió la arquitectura** es el de corrección técnica (G2): en Google Calendar los recordatorios son **por usuario, no por evento** —`reminders.overrides` aplica a la copia del dueño del calendario, y quien tiene acceso de lectura a un calendario compartido no los hereda—, lo que echaba abajo el argumento central de notion-verdad ("suena en el teléfono de fabricación aunque nunca abra la plataforma"). La consecuencia es estructural: todos los eventos se crean **desde el dispositivo de DIRECCIÓN con las tres personas como `attendees`**, un solo consentimiento OAuth que sostener, y eso mueve el motor de recordatorios de Fase 1 a Fase 2. Segundo hallazgo que cambió cosas: `body.precios-ocultos` es inerte para lo que la plataforma va a mostrar —verificado en `index.html:2894`, `const tapar = Q.estado==='borrador' && Q.rol!=='autorizador'`, y una cotización ganada está siempre en `autorizada`—, así que la frontera del dinero para FABRICACIÓN no es un difuminado: **el importe no se pinta**.

---

## 2. NOTION vs GOOGLE CALENDAR — LOS DOS TIENEN PAPEL, Y NO SE TOCAN

**Recomendación: Google Calendar es el único canal de recordatorio. Notion es el libro mayor del dinero y de la venta, y nunca es fuente de lectura de ninguna pantalla.**

### Por qué Calendar y no Notion, en cuatro razones y ninguna de estilo

1. **La API de Notion es inalcanzable desde el navegador y además no la querrías.** No manda `Access-Control-Allow-Origin` (dos issues abiertos en su propio SDK, `notion-sdk-js` #96 y #408), `Notion-Version` es cabecera no simple y dispara preflight, y `Authorization: Bearer secret_…` es un token de escritura total sobre el workspace que no puede vivir en el HTML de GitHub Pages. Calendar sí: token model de Google Identity Services, sin secreto de cliente, sin refresh token, `publishing status: Testing` (tope 100 test users, aquí son 3), sin verificación y sin publicar.
2. **Un recordatorio de Notion es una campana dentro de Notion.** FABRICACIÓN y PAGOS no están en el workspace y cada asiento cuesta. Un `attendee` de Calendar no cuesta nada y su teléfono ya trae el calendario del sistema.
3. **Los disparadores de automatización de Notion dependen del plan.** No lo verifiqué en esta sesión y no se construye sobre eso.
4. **Sin señal, Notion no existe.** El `.ics` se genera 100 % en el dispositivo. En la calle, delante del cliente, el director agenda y el evento entra al teléfono.

### El papel exacto de Notion, que es grande

- **Conserva su calendario y sus siete vistas.** No se tocan. La vista de calendario por `Fecha Anticipo e Instalacion` se queda como está.
- **Es el destino de escritura de la venta ganada** (Fase 3): una fila en `Ventas - AL3D` de la copia **(A) ELIAS**, `collection://56fa21d8-8e7d-4e16-b874-455fd6c65643`, respetando los nombres literales con **espacio final incluido**: `Precio Neto ` y `Cuenta `.
- **Es el relevo de sincronización multidispositivo** (Fase 3): dos bases nuevas, `Movimientos - AL3D` y `Materiales - AL3D`, que la plataforma usa como buzón compartido. No hace falta ninguna otra pieza de infraestructura.
- **Nunca es fuente de lectura de una pantalla.** Ninguna vista de la plataforma espera un `fetch` a Notion. Si el puente está caído, la plataforma funciona idéntica con el espejo local y el botón *Copiar fila para Google Sheets* —que ya está en producción— sigue siendo el camino manual. **Ese camino no se retira jamás.**
- Las copias **(B) OMAR** y **(C) CLAUDE** son archivo muerto. De (B) se hereda únicamente el vocabulario (`Tipo de proyecto` de 7 valores, `Tiempo de entrega` 1–4 semanas), y se hereda porque ahora se **deriva** en vez de capturarse.

### Y lo que no se hace, con su razón numérica

**No se usa suscripción a un `.ics` publicado.** Google refresca un calendario suscrito cada 12–24 h y no hay forma de forzarlo. Para "acabo de agendar y quiero verlo" es inservible.

### Los cuatro defectos verificados del puente que ya existe

`copiarFilaVenta()` (`index.html:8769`) ya arma la fila TSV de 15 columnas en el orden exacto del CSV de Ventas de Notion. Verificado línea por línea, le falta esto:

| # | Defecto | Evidencia | Consecuencia |
|---|---|---|---|
| 1 | **No persiste nada.** Solo escribe `al3d_rv_pct` y `al3d_rv_cuenta` | `:8780` | El evento «se ganó» no deja rastro en ningún sistema. **Es el eslabón perdido, literalmente** |
| 2 | `<select id="rv-estatus">` ofrece `ANTICIPO / LIQUIDADO / CANCELADO / PENDIENTE` | `:10037-10042` | Los reales de Notion son `REPARANDO / COBRANDO / FABRICACION / LIQUIDADO`. **Coincide uno de cuatro**, y pegar una opción inexistente en una propiedad *status* **la crea**: cada venta ensucia el esquema en silencio |
| 3 | `<select id="rv-cuenta">` tiene `Elias BBVA / Moni MPago / Constru BNT / Otra` | `:10029-10034` | Faltan `Rul HSBC` y `Tatis BNT`; `Otra` no existe en Notion |
| 4 | `rv-fecha` es `<input type="text">` precargado con `Q.fecha` = `'22 ago 2026'` | `:8739`, `:10014` | La columna es *date* `DD/MM/YYYY`. Texto es-MX, no parseable sin mapa de meses |

**Arreglar esos cuatro puntos y persistir la fila es Fase 1 y no requiere ninguna cuenta.**

---

## 3. FASES

### FASE 1 — se entrega y funciona hoy. Cero cuentas, cero llaves, cero despliegues.

Un dispositivo, todo local, todo sin señal (salvo los tiles del mapa).

- `plataforma.html` con los seis módulos, cargando ES modules nativos y el sistema de diseño.
- **El botón «Registrar como proyecto ganado»** en el modal Registrar Venta, más los cuatro arreglos de arriba. Un toque produce: el proyecto con el nombre ya armado en la convención `Contacto - Negocio (tipo)`, `tipo_trabajo` derivado (el campo que quedó en 0/142), la ubicación resuelta desde `Q.maps` con `parseGmaps()` **sin una sola petición de red**, y el requerimiento de material calculado.
- **Material completo**: catálogo semilla de 19 filas con unidad de compra ≠ unidad de consumo y `factor_origen` obligatorio, 18 constantes de taller editables, derivación por tipo de partida, existencias por libro de movimientos, lista de compra agregada y redondeada al comprar, imprimible con `@media print`.
- **Agenda** con calendario propio y **descarga de `.ics`** por instalación (variante UTC, sin `VTIMEZONE`) con `VALARM` a −P3D, −P1D y −PT30M, más el `.ics` de ritmo con `RRULE`. Estas alarmas **sí suenan en Fase 1**: las dispara el calendario del teléfono, no la app.
- **Mapa** con Leaflet vendorizado y tiles de OSM, pines de `parseGmaps()`, y pin arrastrable a mano para lo que no se pudo resolver.
- **Inicio** con las reglas de pantalla y los cuatro mensajes de WhatsApp armados (`wa.me`, un `<a>`, cero infraestructura: así el instalador recibe la orden sin tener acceso a la app).
- **Respaldo propio** de la plataforma (`exportar`/`importar` un JSON), independiente del respaldo del cotizador.
- `sw.js` con la segunda estrategia y promoción atómica.
- El dato del escalador rescatado, de forma **aditiva**.

Lo único que se le pide al usuario en Fase 1: elegir rol y nombre (dos toques) y confirmar **tres números** en la pantalla de constantes (profundidad de canto, profundidad de caja, y si su lámina de acrílico es 1.22×2.44 o 1.22×1.83).

### FASE 2 — el usuario crea una cuenta de Google Cloud. ~15 minutos, una vez.

Lo que hace: proyecto en Google Cloud, habilitar Calendar API, crear un **OAuth Client ID tipo Web** con `https://<usuario>.github.io` en *Authorized JavaScript origins* (el origen, sin ruta), scope `https://www.googleapis.com/auth/calendar.events`, dejar el estado en **Testing** y agregar los tres correos como test users. Pegar el Client ID en la configuración de la plataforma, **solo en el dispositivo de DIRECCIÓN**.

Se enciende: los eventos entran solos al calendario, con las tres personas como `attendees`. Precio: la pantalla **"Google hasn't verified this app"** una vez por persona (Advanced → Go to unsafe); desaparece solo con Google Workspace y consentimiento *Internal*.

**También en Fase 2, y no antes: la geocodificación con Nominatim.** Requiere red y depende de que `nominatim.openstreetmap.org` mande `Access-Control-Allow-Origin: *` **[POR VERIFICAR en la pestaña de red antes de prometerlo]**. Cola estricta de 1 petición por segundo, caché obligatoria, `countrycodes=mx`, y **botón explícito: autocompletar desde el cliente está prohibido por su política**.

### FASE 3 — el usuario crea una integración de Notion y una cuenta de Cloudflare. ~25 minutos, una vez.

1. Integración interna de Notion, compartirle la página *Finanzas - AL3D (ELIAS)*.
2. Cuenta gratis de Cloudflare, crear un Worker, **pegar `puente/worker.js` en el editor del navegador**, guardar el token como *secret*. Sin node, sin `wrangler`, sin terminal.
3. Crear **a mano** en `Ventas - AL3D` las siete propiedades nuevas (la plataforma detecta las que faltan y muestra la lista con nombre y tipo exactos, listos para copiar). **La plataforma no altera el esquema por API, a propósito**: es la única garantía de que no se rompan las siete vistas ni las cinco fórmulas.
4. Pegar la URL del Worker y el token de dispositivo en cada teléfono.

Se enciende: espejo del dinero desde Notion, creación automática de la página del proyecto al ganar, y sincronización de proyectos y movimientos entre los tres dispositivos a través del adaptador de sync, **sin que ningún módulo cambie una línea**.

---

## 4. MODELO DE DATOS CONGELADO

### 4.0 Fuente de la verdad, dato por dato

| Dato | Fuente de la verdad | La plataforma |
|---|---|---|
| Catálogo de precios de venta (`MATERIALES`, `COMPLEJIDAD`, `RECORTES`, `BASTIDORES`, `CAJAS`) | `index.html:2728-2760` | lo lee para mostrar. **Nunca lo duplica ni recalcula dinero** |
| Cotización, partidas, precio autorizado, `huellaAuth` | `al3d_historial` del dispositivo que autorizó | **solo lee.** Copia congelada al ganar |
| Cola de pendientes de autorizar | `al3d_queue` de ese dispositivo | **solo lee** |
| Contador de folio | `al3d_folio` (local, monótono) | lee. Desambigua con `dispositivo` |
| **Que la cotización se ganó** | **la plataforma** (`proyectos`) | dueña. **Es lo que no existía** |
| Fecha y hora de instalación | **la plataforma** (`instalaciones`) | dueña. Calendar y Notion son espejos |
| Ubicación (lat/lng) | **la plataforma** (`proyectos.lat/lng`) | dueña |
| Etapa de obra | **la plataforma** (`proyectos.etapa`) | dueña. **No existe en Notion**: el `Estatus` de Notion es de dinero |
| Catálogo de material, factores, proveedores | **la plataforma** (`materiales`) | dueña. No existe en ningún sistema |
| Constantes de taller | **la plataforma** (`constantes`) | dueña, y las calibra |
| Existencias | **derivadas** de `movimientos` | dueña del cálculo. **Nunca un número guardado** |
| Requerimiento de material | **derivado** de las partidas | recalculable. Solo se persiste la corrección humana |
| Dinero, `Estatus`, `Cuenta `, comisiones | **Notion** (Fase 3) | espeja de solo lectura; PAGOS escribe vía puente |
| Fórmulas `Precio Neto `, `Pago Pendiente`, `Comisiones`, `Comision Restante`, `Fecha Comision` | **Notion. Nadie más. Nunca se recalculan aquí** | las lee |
| Memoria técnica del proyecto | **Notion** (cuerpo de página) | lee; agrega bloques al final |

### 4.1 Qué pasa cuando el cotizador reescribe una entrada del historial

Verificado: `guardarEnHistorial` hace `arr[idx]=entry` —reemplaza la entrada completa— al reautorizar, al editar y al ocultar una partida del PDF, y **`ts` se sobrescribe**, así que no es "fecha de autorización original". Por lo tanto:

> **La plataforma nunca guarda una referencia a una cotización: guarda una copia congelada.** `proyectos.origen` es `JSON.parse(JSON.stringify(entradaHistorial))` con su `ts` y su `huellaAuth` del momento de ganar. Es el mismo razonamiento por el que el propio cotizador congela `_lt` (`:6640-6643`).

Consecuencias, definidas:
1. Si la entrada del historial cambia, **el proyecto no cambia**. Se compara `origen.huellaAuth` contra la entrada de hoy; si difieren, se levanta el aviso `R6_huella_cambio`: *"COT-0007 se editó después de ganarse. El material calculado ya no corresponde."* Con dos botones: **recalcular material** (reemplaza `origen` y vuelve a derivar) o **dejar como está**.
2. Si la entrada desaparece (`restaurarDesde()` con un respaldo viejo, o `borrarDeHistorial`), **el proyecto sigue completo**. No hay huérfanos posibles.
3. La plataforma **jamás escribe** `al3d_historial`, `al3d_q`, `al3d_queue`, `al3d_folio`, `al3d_logo`, `al3d_aifile`, ni ninguna clave de IA. Cero excepciones.

### 4.2 localStorage — las claves nuevas, nombre literal definitivo

Prefijo `al3d_pf_` (pf = plataforma). Todas son **cortas y de tamaño acotado**; nada que crezca vive aquí.

| Clave literal | Tipo | Contenido | Default |
|---|---|---|---|
| `al3d_pf_disp` | string 4 chars | id de dispositivo, `crypto.getRandomValues`, una vez en la vida | se genera |
| `al3d_pf_rol` | string | `'direccion'` \| `'fabricacion'` \| `'pagos'` | `'direccion'` |
| `al3d_pf_nombre` | string | nombre humano, para el sello de los movimientos | `''` |
| `al3d_pf_ganadas` | JSON array | **buzón de entrega** de `index.html` → plataforma. La plataforma lo drena a IndexedDB al abrir y lo vacía. Máximo unos KB | `[]` |
| `al3d_pf_tiles` | string | `'osm'` \| `'carto'` \| `'google'` | `'osm'` |
| `al3d_pf_gcal` | JSON | `{clientId, calendarioId}` (Fase 2) | `null` |
| `al3d_pf_puente` | JSON | `{url, token}` del Worker, ofuscado con `keyPack()` (Fase 3) | `null` |
| `al3d_pf_ult_export` | string ISO | último respaldo de la plataforma. Alimenta el aviso de desalojo | `''` |
| `al3d_pf_empresa` | string | id de empresa activa | `'al3d'` |

**Regla dura, y es una corrección a dos de las propuestas:** ninguna de estas claves se añade a `RESPALDO_KEYS` (`index.html:6856`). Verificado el mecanismo real: `restaurarDesde` hace `RESPALDO_KEYS.forEach(k => removeItem(k))` y **solo toca las claves de la lista**, así que una clave fuera de la lista sobrevive intacta a una restauración. Añadirlas tendría tres costos y ningún beneficio: (a) restaurar un respaldo viejo borraría el estado actual de la plataforma en silencio; (b) reinstalaría una cola de sync vieja que reenviaría operaciones ya aplicadas; (c) `restaurarDesde` es todo-o-nada con rollback y aborta completa si una clave no cabe, así que meter un espejo de tamaño arbitrario podría **volver imposible restaurar tres años de cotizaciones**. La plataforma tiene su propio archivo de respaldo, `{app:'plataforma-al3d', formato:1, …}`, que a su vez nunca toca claves `al3d_*` del cotizador.

**`al3d_pf_puente` no entra en el respaldo de la plataforma.** `keyPack()` es XOR+base64, reversible en dos líneas, y el propio código lo dice en `:6849`: *"un respaldo se manda por WhatsApp o por correo, y una key que viaja así deja de ser secreta"*.

### 4.3 IndexedDB — todo lo que crece

Verificado: `grep -c -i indexeddb index.html` = **0**. Es un recurso virgen en este origen. Y la razón por la que es obligatorio: `saveHistorial` (`:6602-6624`) ya degrada por falta de cuota soltando `aiFile.url` de la cotización más antigua a la más reciente hasta que quepa, y el usuario ve *"No hubo espacio para guardar en el historial — respalda y borra cotizaciones viejas"*. **Un libro de movimientos creciendo en localStorage destruiría imágenes del historial del cotizador, que es el único dato irrecuperable del sistema.**

```
IndexedDB  'al3d_pf'  v1
  proyectos       keyPath 'id'    índices: porEtapa(etapa), porFecha(fecha_ganado), porFolio(folio_global)
  instalaciones   keyPath 'id'    índices: porFecha(fecha), porProyecto(proyecto_id)
  materiales      keyPath 'id'    índice: porFamilia(familia)
  movimientos     keyPath 'id'    índices: porMaterial([material_id, ts]), porProyecto(proyecto_id), porSync(sync)
  requerimientos  keyPath 'id'    índices: porProyecto(proyecto_id), porMaterial(material_id)
  avisos          keyPath 'rid'   índice: porEstado(estado)
  constantes      keyPath 'clave'
  pendientes      keyPath 'id'    índice: porTs(ts)          // bandeja de salida de sync
  geo             keyPath 'q'                                 // caché de geocodificación
  blobs           keyPath 'id'                                // fotos de obra como Blob, no base64
```

### 4.4 `proyecto`

```js
{
  id:            'string',   // uuid, crypto.randomUUID()
  empresa_id:    'al3d',
  folio_local:   'COT-0007',
  dispositivo:   'D7K2',                  // al3d_pf_disp del que ganó
  folio_global:  'D7K2:COT-0007',         // derivado. El folio NO es único entre dispositivos
  nombre:        '',        // DERIVADO: `${contacto} - ${negocio} (${tipo_corto})`
  contacto:      '',        // origen.cliente
  negocio:       '',        // origen.proy
  tel:           '',
  etapa:         'ganado',  // ganado|en_diseno|cortado|armado|listo|instalado|garantia|cancelado
  tipo_trabajo:  [],        // string[] DERIVADO, los 7 valores de la copia OMAR. MULTI, no single
  fecha_ganado:  '2026-08-23',            // ISO. El día del toque
  compromiso_texto: '',     // origen.entrega crudo: 'Viernes 15 de Agosto'. NUNCA se parsea
  dir_texto:     '',        // origen.dirRaw, multilínea
  entrecalles:   '',
  maps_url:      '',
  lat:           null,      // number|null
  lng:           null,
  geo_fuente:    'sin_ubicar', // maps_pin|maps_camara|geocodificada|manual|sin_ubicar
  // dinero: se guarda para mostrar, NUNCA se recalcula
  sub:           0, neto: 0, precio_auth: 0, anti_pactado: 0, iva: true,
  // espejo de Notion (Fase 3). Solo lectura desde la plataforma
  notion_page_id: null,
  notion_estado:  'pendiente',  // pendiente|enviado|fallido|manual
  estatus_notion: null,         // REPARANDO|COBRANDO|FABRICACION|LIQUIDADO
  cuenta:         null,         // Moni MPago|Rul HSBC|Tatis BNT|Constru BNT|Elias BBVA
  pago_pendiente: null,         // FÓRMULA DE NOTION. Se lee, jamás se calcula
  comision_restante: null,      // FÓRMULA DE NOTION
  // la copia congelada
  origen: {
    fuente: 'cotizador',        // cotizador|manual|notion_csv
    folio: 'COT-0007', ts: 0, huellaAuth: '',
    cliente:'', tel:'', dirRaw:'', entrecalles:'', maps:'',
    neto:0, sub:0, iva:true, anti:0, antiManual:false, precioAuth:0,
    items: []                   // copia literal de historial.items, con su _lt
  },
  notas:         '',        // texto libre. NADA depende de esto
  creado_en:     0,         // epoch ms, inmutable
  actualizado_en:0,
  sync:          0          // 0 = local, 1 = subido. Índice porSync
}
```

`tipo_trabajo` es **array** a propósito: un proyecto lleva letras Y bastidor. El single-select es exactamente donde murió la copia OMAR.

### 4.5 `instalacion`

```js
{
  id:'uuid', empresa_id:'al3d', proyecto_id:'uuid',
  fecha:'2026-09-01',        // ISO. LA ÚNICA CAPTURA HUMANA REAL DEL SISTEMA
  hora:'10:00',              // 'HH:MM'|null. null es una respuesta válida
  ventana:'dia',             // dia|manana|tarde|noche
  duracion_min:180,          // derivada del tipo, editable
  estado:'confirmada',       // propuesta|confirmada|reagendada|hecha|cancelada
  movida:0,                  // cuenta de reagendas. Alimenta SEQUENCE del .ics
  uid_ics:'inst-<id>@al3d.mx',   // ESTABLE. Si cambia, el importador duplica
  gcal_event_id:null,
  notas:'',                  // libre. NADA depende de esto
  creado_en:0, actualizado_en:0, sync:0
}
```

**Eliminados a propósito**, y esto es la aplicación de la prueba del campo vacío al propio esquema: `altura_montaje_m`, `requiere_andamio`, `requiere_grua`, `contacto_sitio`, `tel_sitio`. Son captura pura, iban a estar vacíos en el 100 % de las filas, y un campo estructurado vacío es peor que una nota libre porque invita a construir una consulta encima. Lo que hace falta decir cabe en `notas`.

### 4.6 `material`

```js
{
  id:'acr-3mm',                    // slug, PK
  empresa_id:'al3d',
  nombre:'Acrílico blanco 3 mm',
  familia:'acrilico',              // acrilico|aluminio|acero|galvanizado|alucobond|vinil|led|fuente|tubular|herraje|consumible
  unidad_consumo:'m2',             // m2|m|cm|pieza|litro
  unidad_compra:'lamina',          // LAS SEIS QUE DIJO EL USUARIO: unidad|bolsa|caja|lamina|litro|metro
  medida:'1.22 × 2.44 m',          // lo que dice el proveedor
  factor:2.9768,                   // unidades de consumo que rinde UNA unidad de compra
  factor_origen:'Hoja 4′×8′ = 1.22 × 2.44 m del mercado mexicano. VERIFICAR con proveedor: también se vende 1.22 × 1.83',
  largo_cm:244, ancho_cm:122,      // geometría de la hoja. Sirve para saber si la PIEZA cabe
  espesor:'3 mm',
  merma_pct:0.25,                  // 0..1
  fraccionable:true,               // true = se puede usar un retazo -> ceil a cuartos
  min_compra:1,                    // en unidad de compra
  min_stock:0,                     // en unidad de compra. 0 = no avisar
  costo_compra:null,               // MXN por unidad de compra. null = solo cantidades
  proveedor:'', tel_proveedor:'',
  activo:true, sync:0
}
```

`factor_origen` es **obligatorio y no vacío**. Es la única defensa auditable contra un número inventado que nadie puede rastrear después. El validador de `Material.guardar` lo rechaza vacío.

### 4.7 `movimiento` — el libro, append-only

```js
{
  id:'uuid',                       // generado en el cliente -> idempotencia en el pull
  empresa_id:'al3d', material_id:'acr-3mm',
  tipo:'salida',                   // entrada|salida|ajuste|conteo|merma|devolucion
  cantidad:-0.25,                  // EN UNIDAD DE COMPRA, CON SIGNO. + entra, - sale
  unidad_compra:'lamina',          // copia, para auditar. NO se omite
  proyecto_id:null,
  requerimiento_id:null,
  origen:'derivado',               // derivado|manual|conteo|compra
  costo_total:null,
  nota:'',
  ts:0,                            // epoch ms del emisor
  usuario:'Omar', rol:'fabricacion', dispositivo:'D7K2',
  sync:0
}
```

Nunca se edita ni se borra una fila. Una corrección es un movimiento `ajuste`. **La cantidad siempre está en unidad de compra y la unidad viaja en la fila**: es lo que evita que una suma acumule metros donde se esperaban rollos.

### 4.8 `requerimiento`

```js
{
  id:'<proyecto_id>:<material_id>',
  empresa_id:'al3d', proyecto_id:'uuid', material_id:'acr-3mm',
  cantidad_consumo:0.762, unidad_consumo:'m2',      // ya con merma
  cantidad_compra:0.256,  unidad_compra:'lamina',   // fraccionaria A PROPÓSITO
  partidas:[3,4],                                    // it.id que lo produjeron
  formula:'0.75×40²×8 = 0.5714 m² / 0.75 aprov = 0.762 m² / 2.9768 m²/lámina',
  confianza:'estimada',                              // exacta|estimada|requiere_dato
  requiere:'',                                       // qué dato falta, si confianza==='requiere_dato'
  constantes_version:'c-2026-08',                    // CONGELADA
  cantidad_ajustada:null,                            // la corrección humana. SIEMPRE GANA
  motivo_ajuste:'', ajustado_por:'', ajustado_en:0,
  estado:'calculado',                                // calculado|apartado|comprado|consumido|descartado
  creado_en:0, sync:0
}
```

**Nunca se redondea aquí.** El redondeo vive en la lista de compra, agregando primero.

### 4.9 `aviso` — el recordatorio, sin tabla de programación

```js
{
  rid:'R2_material:<proyecto_id>:2026-08-29',   // DETERMINISTA. PK. Es el dedupe
  regla:'R2_material',
  entidad:'proyecto', entidad_id:'uuid',
  rol:'fabricacion',
  titulo:'', cuerpo:'',
  severidad:'aviso',            // info|aviso|urgente
  vence:'2026-08-29',
  estado:'pendiente',           // pendiente|atendido|postergado|descartado
  postergado_hasta:null,
  gcal_event_id:null,
  visto_en:0, resuelto_en:0, sync:0
}
```

`rid` determinista es lo que impide el desastre clásico: reevaluar las reglas en cada apertura crea **un** aviso, no diez. Y dos dispositivos que descartan el mismo aviso producen uno.

### 4.10 `constante`

```js
{ clave:'K_ANCHO_CAJA', valor:0.75, unidad:'ancho/altura',
  nota:'derivación completa, obligatoria', version:'c-2026-08',
  actualizado_en:0, actualizado_por:'' }
```

---

## 5. CONTRATOS DE API CONGELADOS

**Esta sección es el contrato. Un módulo que necesite algo que no esté aquí no lo inventa: se añade a este documento primero.**

### 5.0 Convenciones, sin excepción

```js
/** Resultado de toda MUTACIÓN. Nunca se lanza una excepción a la UI. */
/** @typedef {{ok:true, valor:*}|{ok:false, codigo:CodigoError, mensaje:string}} Resultado */

/** @typedef {'DB_NO_DISPONIBLE'|'SIN_ESPACIO'|'NO_ENCONTRADO'|'DUPLICADO'
 *          |'DATO_INVALIDO'|'ROL_SIN_PERMISO'|'SIN_RED'|'CONFLICTO'|'DESCONOCIDO'} CodigoError */
```

- **Las LECTURAS nunca lanzan y nunca devuelven `undefined`.** Devuelven `[]`, `null` o `0`. Si la base no abrió, `DB.estado()` lo dice y la UI pinta la banda de degradación.
- **Las MUTACIONES devuelven `Promise<Resultado>` y nunca lanzan.** `mensaje` viene ya escrito en español de México, en el registro del proyecto, listo para `toast(r.mensaje,'err')`.
- **Toda función que muta encola sola en `Sync`.** Ningún módulo llama a `Sync` directamente salvo la pantalla de ajustes.
- Todas las fechas de calendario son `'YYYY-MM-DD'`. Todos los sellos de tiempo son epoch ms. **Nunca se guarda una fecha en formato es-MX.**

### 5.1 `datos/db.js` — la capa física

```js
export const ALMACENES = ['proyectos','instalaciones','materiales','movimientos',
                          'requerimientos','avisos','constantes','pendientes','geo','blobs'];

/** Abre (y migra) la base. Idempotente. Llamar una vez desde app.js antes de montar nada. */
export function abrir(): Promise<boolean>

/** @returns {{ok:boolean, motivo:string}} 'ok'|'sin_indexeddb'|'bloqueada'|'sin_espacio' */
export function estado(): {ok:boolean, motivo:string}

/** Inserta o reemplaza. Sella `actualizado_en`. Si es nuevo, sella `creado_en`.
 *  Falla: SIN_ESPACIO (QuotaExceededError), DB_NO_DISPONIBLE. */
export function poner(almacen:string, registro:Object): Promise<Resultado>   // valor = registro sellado

/** Transacción única. Todo o nada. valor = cuántos escribió. */
export function ponerVarios(almacen:string, registros:Object[]): Promise<Resultado>

/** @returns el registro o null. NUNCA lanza. */
export function obtener(almacen:string, id:string): Promise<Object|null>

/** opts = {indice?:string, rango?:IDBKeyRange, limite?:number, desc?:boolean}
 *  @returns array, vacío si algo falló. NUNCA lanza. */
export function listar(almacen:string, opts?:Object): Promise<Object[]>

export function contar(almacen:string, opts?:Object): Promise<number>
export function borrar(almacen:string, id:string): Promise<Resultado>   // valor = true

/** Respaldo propio de la plataforma. Los blobs van como data URL.
 *  @returns string JSON {app:'plataforma-al3d', formato:1, fecha, disp, datos:{almacen:[...]}} */
export function exportar(): Promise<string>

/** Fusiona por id. Idempotente: reimportar el mismo archivo no cambia nada.
 *  Para `movimientos`, un id repetido se descarta (nunca se suma dos veces).
 *  Falla: DATO_INVALIDO si no es un paquete de la plataforma. */
export function importar(texto:string): Promise<Resultado>   // valor = {almacenes, registros, descartados}
```

### 5.2 `datos/prefs.js` — localStorage envuelto

```js
export const CLAVES = {
  DISP:'al3d_pf_disp', ROL:'al3d_pf_rol', NOMBRE:'al3d_pf_nombre',
  GANADAS:'al3d_pf_ganadas', TILES:'al3d_pf_tiles', GCAL:'al3d_pf_gcal',
  PUENTE:'al3d_pf_puente', ULT_EXPORT:'al3d_pf_ult_export', EMPRESA:'al3d_pf_empresa'
};
export function get(clave:string, def?:*): *          // JSON si aplica; nunca lanza
export function set(clave:string, valor:*): boolean   // false si no cupo
export function dispositivo(): string                 // genera y persiste la primera vez
export function rol(): 'direccion'|'fabricacion'|'pagos'
export function setRol(r:string): boolean
export function nombre(): string
```

### 5.3 `datos/cotizador.js` — el puente. **SOLO LECTURA. CERO ESCRITURAS.**

```js
/** Lee al3d_historial. Ordenado como está (más reciente primero). Nunca lanza. */
export function historial(): Array<Object>

/** Lee al3d_queue. Para la tarjeta «esperando precio» de Inicio. */
export function cola(): Array<Object>

/** @returns la entrada del historial con ese folio, o null. */
export function porFolio(folio:string): Object|null

/** Los catálogos de precios, leídos del window global de index.html si está,
 *  o de la copia embebida en datos/catalogo-precios.js si la plataforma corre sola.
 *  NO se recalcula dinero con esto: es para etiquetas y para derivar material. */
export function catalogos(): {MATERIALES, COMPLEJIDAD, RECORTES, BASTIDORES, CAJAS,
                             RECORTE_COMP_EXTRA, TIPO_NOMBRE, TIPO_CORTO}

/** Descripción textual canónica de una partida. Réplica de histDsc() de index.html. */
export function descPartida(item:Object): string

/** Drena al3d_pf_ganadas: convierte el buzón de index.html en proyectos y lo vacía.
 *  Llamar en cada arranque y en cada evento 'storage'. Idempotente por folio_global.
 *  @returns {creados:number, repetidos:number} */
export function drenarBuzon(): Promise<{creados:number, repetidos:number}>

/** Compara origen.huellaAuth contra la entrada de hoy.
 *  @returns 'igual'|'cambio'|'desaparecio' */
export function estadoOrigen(proyecto:Object): string
```

### 5.4 `datos/proyectos.js`

```js
/** Crea el proyecto desde una entrada del historial. Congela `origen`.
 *  Deriva nombre, tipo_trabajo y ubicación. Calcula el requerimiento.
 *  Falla: DUPLICADO si ya existe ese folio_global; DATO_INVALIDO si la entrada no trae items.
 *  @param extra {fecha_instalacion?, hora?, sub?, neto?, anti_pactado?, cuenta?, estatus_notion?} */
export function ganar(entradaHistorial:Object, extra?:Object): Promise<Resultado>  // valor = proyecto

/** filtro = {etapa?, etapas?:string[], desde?, hasta?, sinFecha?:boolean,
 *            sinUbicar?:boolean, conPendiente?:boolean, texto?} */
export function listar(filtro?:Object): Promise<Object[]>
export function obtener(id:string): Promise<Object|null>

/** Parche superficial. Rechaza tocar `origen`, `folio_global`, `creado_en` y
 *  los campos de fórmula de Notion (pago_pendiente, comision_restante).
 *  Falla: ROL_SIN_PERMISO según §8. */
export function actualizar(id:string, parche:Object): Promise<Resultado>

/** Mueve etapa. Al pasar a 'cortado' emite las salidas de material del requerimiento
 *  (una sola vez: la idempotencia es requerimiento.estado==='consumido').
 *  @returns valor = {proyecto, movimientos:number} */
export function avanzarEtapa(id:string, etapa:string): Promise<Resultado>

/** Los 7 valores de la copia OMAR, derivados de las partidas. PURA, sin efectos. */
export function tiposDerivados(items:Array<Object>): string[]

/** `${contacto} - ${negocio} (${tipoCorto})`, la convención real de Notion. PURA. */
export function nombreDerivado(origen:Object, tipos:string[]): string

/** Recalcula requerimiento y ubicación con el origen de hoy. Para el aviso R6. */
export function resincronizar(id:string): Promise<Resultado>
```

### 5.5 `datos/material.js` — catálogo, constantes y derivación

```js
export function listarMateriales(filtro?:{familia?, activo?}): Promise<Object[]>
export function obtenerMaterial(id:string): Promise<Object|null>

/** Valida: factor > 0, factor_origen no vacío, unidad_compra en las seis permitidas.
 *  Falla: DATO_INVALIDO con el mensaje del campo ofensor. */
export function guardarMaterial(mat:Object): Promise<Resultado>

/** Siembra el catálogo y las constantes desde datos/semilla.json si están vacíos.
 *  Idempotente: no pisa lo que el usuario ya editó. */
export function sembrar(): Promise<Resultado>   // valor = {materiales, constantes}

export function constantes(): Promise<Object>          // {CLAVE: valor}
export function versionConstantes(): Promise<string>   // 'c-2026-08'
export function guardarConstante(clave:string, valor:number, nota?:string): Promise<Resultado>

/** EL NÚCLEO. Función PURA: sin DOM, sin red, sin IndexedDB. Testeable sola.
 *  @param items  Array de partidas (historial.items o Q.items)
 *  @param cts    el objeto de constantes()
 *  @param cat    catalogos() del cotizador
 *  @returns {lineas: LineaReq[], sinMaterial: number[], avisos: string[]}
 *           LineaReq = {material_id, cantidad_consumo, unidad_consumo,
 *                       cantidad_compra, unidad_compra, partidas:number[],
 *                       formula:string, confianza:'exacta'|'estimada'|'requiere_dato',
 *                       requiere:string}
 *  NUNCA devuelve 0 en silencio: si falta un parámetro, confianza='requiere_dato'
 *  y `requiere` nombra el número exacto que falta. */
export function derivar(items:Array<Object>, cts:Object, cat:Object): Object

/** Persiste el resultado de derivar() para un proyecto. Preserva cantidad_ajustada
 *  y todo requerimiento en estado 'comprado'|'consumido'. Congela constantes_version. */
export function recalcular(proyectoId:string): Promise<Resultado>  // valor = {lineas, preservadas}

export function requerimientos(proyectoId:string): Promise<Object[]>

/** La corrección humana. Emite el movimiento 'ajuste' por la diferencia y
 *  registra la razón real/calculado para el bucle de calibración. */
export function ajustar(reqId:string, cantidadReal:number, motivo:string): Promise<Resultado>

/** La calibración: por familia, la razón media real/calculado y cuántas muestras.
 *  @returns [{familia, muestras, razon, constante_sugerida, valor_actual, valor_sugerido}] */
export function calibracion(): Promise<Object[]>
```

### 5.6 `datos/stock.js`

```js
/** Existencia = último `conteo` (por ts) + Σ movimientos con ts mayor.
 *  NUNCA se guarda un número de existencia.
 *  @returns {cantidad, unidad_compra, ultimo_conteo:number|null,
 *            contado_por:string, edad_dias:number|null, sello:string}
 *  `sello` viene escrito: 'contado el 12 ago por Omar' | 'derivado · nunca contado' */
export function existencia(materialId:string): Promise<Object>

export function existencias(): Promise<Object[]>   // una por material activo

/** Apéndice puro. Rechaza cantidad 0 y unidad distinta a la del material.
 *  Sella ts, usuario, rol, dispositivo. Falla: DATO_INVALIDO, SIN_ESPACIO. */
export function mover(mov:Object): Promise<Resultado>   // valor = movimiento sellado

/** Un conteo físico. Es la única aserción absoluta: reinicia la suma.
 *  Si hay movimientos posteriores al ts del conteo, el resultado los avisa
 *  en `valor.movimientos_posteriores` para que la UI lo diga, no lo esconda. */
export function contar(materialId:string, cantidad:number, nota?:string): Promise<Resultado>

/** Lo que hay que comprar. AGREGA TODOS los proyectos abiertos ANTES de redondear.
 *  filtro = {hastaDias?:number}  (default 14, medido contra instalaciones.fecha)
 *  @returns [{material, requerido_consumo, disponible_consumo, faltante_consumo,
 *             comprar:number, unidad_compra, costo:number|null,
 *             proyectos:[{id,nombre,fecha}], confianza}] */
export function listaCompra(filtro?:Object): Promise<Object[]>

/** «Recibí lo de la lista»: convierte los faltantes en movimientos 'entrada'. Un toque. */
export function recibirCompra(lineas:Array<{material_id, cantidad, costo_total?}>): Promise<Resultado>

export function bajoMinimo(): Promise<Object[]>
export function movimientos(filtro?:{material_id?, proyecto_id?, desde?, limite?}): Promise<Object[]>
```

### 5.7 `datos/agenda.js`

```js
export function agendar(proyectoId:string, {fecha, hora, ventana, duracion_min}): Promise<Resultado>
export function reagendar(instId:string, {fecha, hora, motivo}): Promise<Resultado>  // sube `movida`
export function marcar(instId:string, estado:string): Promise<Resultado>
export function listar(filtro?:{desde?, hasta?, estado?, proyecto_id?}): Promise<Object[]>

/** Semáforo de material de una instalación: 'cubierto'|'estimado'|'falta'|'sin_calcular' */
export function semaforo(instId:string): Promise<string>

/** Duración por defecto según tipo_trabajo. PURA. */
export function duracionSugerida(tipos:string[]): number
```

### 5.8 `nucleo/ics.js` — RFC 5545. Fase 1, funciona sin nada.

```js
/** Variante UTC, SIN VTIMEZONE: elimina de golpe la clase entera de bugs de zona.
 *  México abolió el horario de verano el 30/oct/2022 y Jalisco está fijo en UTC−6,
 *  así que la conversión es aritmética pura sobre los campos, sin pasar por Date:
 *  const OFFSET_MX = 6.
 *  Plegado a 75 OCTETOS (no caracteres: ó, é, ñ pesan 2 en UTF-8), sin partir
 *  un carácter multibyte. Escapado en orden: \ ; , y salto de línea. ':' NO se escapa.
 *  CRLF en todas las líneas, incluida la última.
 *  @param ev {uid, fecha:'YYYY-MM-DD', hora:'HH:MM', duracion_min, summary,
 *             description, location, secuencia:number, alarmas:string[]}
 *  @returns string */
export function evento(ev:Object): string

/** Un VCALENDAR con varios VEVENT. */
export function calendario(evs:Array<Object>): string

/** El .ics de ritmo: RRULE semanal y mensual. El cron del teléfono, sin servidor. */
export function ritmo(): string

/** Descarga. Reusa el patrón de descargarArchivo() de index.html. */
export function descargar(texto:string, nombre:string): boolean
```

### 5.9 `datos/geo.js`

```js
/** Regex local, cero red. Prioridad: !3d!4d (el pin real) > ?q= > /search/ > @ (cámara)
 *  > !2d!3d y !1d!2d (INVERTIDOS: en contexto dir/embed el orden se voltea).
 *  Valida rangos y, si el par no valida, prueba invertido antes de descartar.
 *  @returns {lat, lng, fuente:'maps_pin'|'maps_camara'|...}|null */
export function parseGmaps(url:string): Object|null

/** true para maps.app.goo.gl y goo.gl/maps. Desde el navegador es IMPOSIBLE expandirlos:
 *  la 30x no manda ACAO y en no-cors la respuesta es opaca, con lista de headers vacía. */
export function esAcortado(url:string): boolean

/** FASE 2. Cola estricta de 1 req/s, caché obligatoria en el almacén `geo`,
 *  countrycodes=mx. Se llama SOLO desde un botón: autocompletar está prohibido.
 *  Falla: SIN_RED. Devuelve null si no encontró. */
export function geocodificar(texto:string): Promise<Object|null>

export const TILES = {
  osm:   {url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max:19,
          attr:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'},
  carto: {url:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          max:20, sub:'abcd', attr:'&copy; OpenStreetMap contributors &copy; CARTO'},
  google:null   // STUB DOCUMENTADO. Preparado, no implementado. Ver §11.
};
```

### 5.10 `datos/reglas.js` — los avisos, sin tabla de programación

```js
/** Evalúa TODAS las reglas contra el estado local. FUNCIÓN PURA sobre los datos que recibe.
 *  Genera avisos con rid determinista. Idempotente: correr diez veces produce los mismos.
 *  @returns Aviso[] ya filtrados por rol y por estado */
export function evaluar(ctx:{proyectos, instalaciones, requerimientos, existencias,
                             historial, cola, rol, hoy:string}): Array<Object>

/** Corre evaluar() con datos frescos, persiste los nuevos y devuelve los pendientes. */
export function refrescar(): Promise<Object[]>

export function atender(rid:string): Promise<Resultado>
export function postergar(rid:string, hasta:string): Promise<Resultado>

/** Texto de WhatsApp ya armado. clase = 'confirmar_cliente'|'orden_instalador'
 *                                     |'pedir_material'|'cobrar'
 *  @returns {texto, url}  url = 'https://wa.me/52<tel>?text=<encoded>' */
export function mensajeWa(clase:string, datos:Object): {texto:string, url:string}
```

### 5.11 `datos/sync.js` — EL ADAPTADOR. La interfaz que congela Fase 2 y 3.

**Ningún módulo llama a un servidor. Los módulos llaman a las funciones de dominio; las funciones de dominio encolan aquí. Cuando llegue la Fase 3 no se reescribe una línea de UI.**

```js
/** @typedef {{id:string, tipo:'crear'|'actualizar'|'apendice', almacen:string,
 *             registro_id:string, datos:Object, esperado:Object|null,
 *             ts:number, intentos:number, ultimo_error:string}} Operacion */

/** @typedef {{
 *   nombre: string,
 *   salud(): Promise<{ok:boolean, mensaje:string}>,
 *   subir(ops:Operacion[]): Promise<Array<{id:string, ok:boolean,
 *          codigo?:CodigoError, remoto?:Object, conflicto?:Object}>>,
 *   bajar(cursor:string|null): Promise<{registros:Array<{almacen, datos}>, cursor:string|null}>,
 *   esquema(): Promise<{ok:boolean, faltan:Array<{nombre,tipo}>}>
 * }} AdaptadorSync */

export function registrar(adaptador:AdaptadorSync|null): void
export function disponible(): boolean

/** Encola. SIEMPRE devuelve ok si cupo en IndexedDB: la escritura local ya ocurrió. */
export function encolar(op:Operacion): Promise<Resultado>

/** Sube de una en una (nunca en paralelo), respeta Retry-After y retrocede
 *  exponencialmente. Una operación con `esperado` que no cuadra NO se aplica:
 *  se aparca como conflicto. Nunca hay sobrescritura silenciosa detectable.
 *  Sin adaptador: devuelve {subidas:0, pendientes:n, sin_adaptador:true}. */
export function bombear(): Promise<{subidas:number, fallidas:number,
                                    conflictos:number, pendientes:number}>

export function jalar(): Promise<{nuevos:number, actualizados:number, descartados:number}>

/** Lo que alimenta la banda de frescura. SIN RED, instantáneo. */
export function frescura(): Promise<{ultimo_envio:number|null, ultima_bajada:number|null,
                                     pendientes:number, edad_horas:number|null,
                                     mensaje:string}>

export function conflictos(): Promise<Object[]>
export function resolver(opId:string, quien:'mio'|'suyo'): Promise<Resultado>
```

**Nota de honestidad que va en el código:** Notion no tiene comparación-e-intercambio (ni `If-Match`, ni ETag, ni versión de página) ni restricciones de unicidad. El campo `esperado` estrecha la ventana de sobrescritura, **no la cierra**. La UI dice "cambió en Notion mientras no tenías señal", no "nunca se pierde nada". Para los `movimientos` la idempotencia sí es real y es la que importa: el id lo genera el cliente y `jalar()` descarta ids ya presentes, así que un reintento **no resta el material dos veces**.

### 5.12 `nucleo/gcal.js` — Fase 2

```js
/** Token model de GIS. Sin secreto, sin refresh token. initTokenClient exige gesto
 *  del usuario, así que se llama desde un click. El token vive ~1 h y se renueva
 *  con prompt:'' (silencioso si hay sesión Google viva). */
export function conectar(): Promise<Resultado>   // valor = {email}
export function conectado(): boolean

/** SIEMPRE con las tres personas como `attendees`, y SIEMPRE desde el dispositivo
 *  de DIRECCIÓN. Los recordatorios de Calendar son POR USUARIO, no por evento:
 *  un calendario compartido NO hereda reminders.overrides. Es la razón entera de
 *  que el creador sea uno solo. `id` determinista: al reinsertar, un 409 se trata
 *  como «ya estaba» SOLO si un GET confirma que existe y no está cancelado.
 *  Falla: SIN_RED, ROL_SIN_PERMISO. */
export function crearEvento(ev:Object): Promise<Resultado>   // valor = {eventId}
export function actualizarEvento(eventId:string, ev:Object): Promise<Resultado>
export function cancelarEvento(eventId:string): Promise<Resultado>
```

---

## 6. DERIVACIÓN DE MATERIAL

### 6.0 Las tres reglas antes de la primera fórmula

1. **Nunca se deriva material del importe.** `m2Total()` cobra `Math.max(m2, M2_MINIMO=1)`: una caja de 0.3 m² se **cobra** como 1 m² y se **fabrica** con 0.3. Para material se usa el **área real**. Y el `p *= 0.8` de `!it.luz` es dinero: para material, `luz:false` significa **cero LED y cero fuentes**.
2. **`showInPdf === false` no filtra nada.** Esas partidas se cobran (agrupadas como "Conceptos adicionales") y **se fabrican**.
3. **Todo campo se lee con default.** El item que crea la IA (`:5905`) **no trae `matAuto`, `textoAuto` ni `ilumTipo`**: `it.ilumTipo||'fria'`, `it.showInPdf!==false`.

### 6.1 Las 18 constantes, con valor inicial y derivación

Se editan **una vez** en la pantalla de constantes. **Ninguna se captura por proyecto.** Se congela `constantes_version` en cada requerimiento, por la misma razón por la que el historial congela `_lt`.

| clave | valor | unidad | derivación del valor inicial |
|---|---|---|---|
| `K_ANCHO_CAJA` | **0.75** | ancho/altura | Ancho de tinta medio de las 26 mayúsculas de una grotesca ≈ 0.60 em sobre altura de caja alta 0.72 em = 0.83; se baja a 0.75 porque los nombres comerciales cargan a letras angostas (I, L, T, E) |
| `K_PERIM_recta` | **4.0** | ×altura | Perímetro de la caja envolvente = 2(h + 0.75h) = 3.5h; el contorno de una mayúscula ≈ 0.9 de eso = 3.15h; ~40 % de las capitales tienen contraforma (O, A, B, D, P, R, Q) que añade un contorno interior ≈ 0.6 del exterior (1.9h) → 3.15 + 0.4×1.9 = **3.9h** |
| `K_PERIM_cursiva` | **4.8** | ×altura | +20 %: inclinación y trazos de unión añaden contorno sin añadir altura |
| `K_PERIM_compleja` | **5.6** | ×altura | +40 %: puntas pronunciadas y remates |
| `K_AREA_RECORTE` | **0.95** | ×altura² | Un logotipo o silueta llena casi su caja envolvente, a diferencia de una letra |
| `APROV_NESTING_simple` | **0.80** | — | Cajas envolventes teseladas en hoja rectangular, con desperdicio de orilla y kerf |
| `APROV_NESTING_irregular` | **0.72** | — | Cursiva, compleja y siluetas |
| `APROV_TIRAS` | **0.90** | — | Cortar tiras de canto de una lámina: 10 % se va en dobleces, uniones y arranques |
| `PROF_CANTO_CM` | **5.0** | cm | Retorno estándar de letra 3D con LED: aloja el módulo (~1.5 cm) más separación a la cara. **El único número que se le pregunta al usuario** |
| `PROF_CAJA_CM` | **15.0** | cm | Profundidad mínima para que la luz llegue a la cara sin manchas |
| `MOD_POR_M2` | **45** | mód/m² | Un módulo cada ~15 cm en retícula = 44/m² |
| `MOD_POR_M2_CAJA` | **30** | mód/m² | Los 15 cm de profundidad difunden más: retícula de ~18 cm |
| `W_MODULO` | **0.72** | W | Módulo de 3 chips SMD 2835 a 12 V |
| `CAP_FUENTE_W` | **60** | W | Fuente 12 V 5 A, la común |
| `DERATE_FUENTE` | **0.80** | — | Nadie carga una fuente al 100 % → 48 W útiles → 66 módulos por fuente |
| `TRAVESANO_CM` | **60** | cm | Separación de refuerzo del bastidor |
| `REMACHE_CM` | **15** | cm | Un remache cada 15 cm de perímetro |
| `SEPARADORES_LETRA` | **4** | pza | Montaje de letra individual a muro |

**Decisión que corrige a dos propuestas:** el acrílico de cara se calcula sobre el **área de caja envolvente**, no sobre el área de tinta del glifo. El hueco de una "O" no se reutiliza con confianza. Usar el área de tinta (0.30h² o 0.62 de relleno) sub-compra acrílico de forma sistemática en un 40 %, y ninguna merma razonable cierra ese hueco.

### 6.2 El catálogo semilla — 19 filas, con las seis unidades de compra del usuario

`unidad_compra ∈ {unidad, bolsa, caja, lamina, litro, metro}`, exactamente el vocabulario que dio. El empaquetado raro se expresa con `medida` + `factor` + `min_compra`, nunca inventando unidades nuevas.

| id | nombre | u. compra | medida | u. consumo | factor | min | merma | fracc. |
|---|---|---|---|---|---|---|---|---|
| `acr-3mm` | Acrílico blanco/opal 3 mm | lamina | 1.22 × 2.44 m | m² | **2.9768** | 1 | 0.25 | sí |
| `acr-6mm` | Acrílico blanco 6 mm | lamina | 1.22 × 2.44 m | m² | 2.9768 | 1 | 0.25 | sí |
| `al-pintado` | Lámina aluminio pintado | lamina | 1.22 × 2.44 m | m² | 2.9768 | 1 | 0.12 | sí |
| `al-brush` | Aluminio brush cepillado | lamina | 1.22 × 2.44 m | m² | 2.9768 | 1 | 0.12 | sí |
| `fleje-al-pintado` | Fleje aluminio pintado 5 cm | metro | rollo de 30 m | m | **1** | 30 | 0.12 | no |
| `fleje-al-brush` | Fleje aluminio brush 5 cm | metro | rollo de 30 m | m | 1 | 30 | 0.12 | no |
| `fleje-inox` | Fleje acero inox espejo 5 cm | lamina | 1.22 × 2.44 m | m | **58.56** | 1 | 0.15 | sí |
| `lam-galv` | Lámina galvanizada cal. 24 | lamina | 1.22 × 2.44 m | m² | 2.9768 | 1 | 0.10 | sí |
| `alucobond` | Alucobond 4 mm | lamina | 1.25 × 2.50 m | m² | **3.125** | 1 | 0.10 | sí |
| `vinil-corte` | Vinil de corte | metro | rollo de 1.22 m de ancho | m² | **1.22** | 1 | 0.20 | sí |
| `led-6500` | Módulo LED 12 V 6500 K | caja | caja de 100 | pieza | **100** | 1 | 0.03 | no |
| `led-3000` | Módulo LED 12 V 3000 K | caja | caja de 100 | pieza | 100 | 1 | 0.03 | no |
| `fuente-60` | Fuente 12 V 60 W | unidad | — | pieza | **1** | 1 | 0 | no |
| `tubular-1` | Tubular 1" cal. 18 | unidad | tramo de 6 m | cm | **600** | 1 | 0.08 | no |
| `remache-18` | Remache 1/8" | caja | caja de 500 | pieza | **500** | 1 | 0.03 | no |
| `pija-taquete` | Taquete + pija 1/4 × 2" | bolsa | bolsa de 100 | pieza | **100** | 1 | 0.03 | no |
| `separador-20` | Separador inox 20 mm | bolsa | bolsa de 50 | pieza | **50** | 1 | 0.03 | no |
| `silicon` | Silicón estructural | unidad | cartucho | m de cordón | **12** | 1 | 0 | no |
| `solvente` | Limpiador / solvente | litro | — | m² limpiados | **25** | 1 | 0 | sí |

`factor_origen` de `fleje-inox`: *"Lámina 1.22×2.44 m cortada en tiras de 5 cm: floor(122/5)=24 tiras × 2.44 m = 58.56 m de fleje."* Todos los demás llevan el suyo, y todos dicen **VERIFICAR con proveedor en la primera compra**. Ninguno de estos números existía en Notion ni en Drive.

### 6.3 Receta, tipo por tipo

**`letras`** — cara de acrílico **siempre**, canto del material elegido, LED si `luz`. No es invención: `descTxt` (`:6031`) dice *"Letras Individuales 3D: Caras en Acrílico, Cantos en {material}"* y la página *¿Cómo Cotizar?* dice *"Para letras (Caras en Acrílico – Cantos en Aluminio)"*. Dos fuentes independientes que coinciden.

```
W        = it.anchoMedido ? (it.anchoMedido / n) : (altura × K_ANCHO_CAJA)
caja_m2  = altura × W × n / 10000
aprov    = (comp==='recta') ? APROV_NESTING_simple : APROV_NESTING_irregular
cara_m2  = caja_m2 / aprov                     -> acr-3mm si altura<=40, acr-6mm si no
perim_cm = K_PERIM[comp||'recta'] × altura × n
canto_m  = perim_cm / 100 / APROV_TIRAS        -> fleje según material
vinil_m2 = (material==='acr-vinil') ? cara_m2 : 0
si luz:
   mod   = ceil(caja_m2 × MOD_POR_M2)          -> led-6500 | led-3000 según ilumTipo||'fria'
   fte   = ceil(mod × W_MODULO / (CAP_FUENTE_W × DERATE_FUENTE))
separadores = SEPARADORES_LETRA × n
silicon_m   = perim_cm / 100
solvente_m2 = cara_m2
```
Mapeo de canto por material: `al-paint`→`fleje-al-pintado`, `al-brush`→`fleje-al-brush`, `acr-vol`→`fleje-al-pintado`, `acr-vinil`→`fleje-al-pintado`, `acero`→`fleje-inox`. `ilumTipo` elige **la fila de catálogo**, no la cantidad: son dos SKU distintos y hoy nadie sabía cuál pedir. `comp` es complejidad de corte: más horas de CNC, **cero material adicional** — solo cambia el aprovechamiento del nesting.

**`recorte`**
```
caja_m2 = K_AREA_RECORTE × altura² × n / 10000
acr_m2  = (caja_m2 / APROV_NESTING_irregular) × (acab==='sandwich' ? 2 : 1)
   (acab==='vinil': acr_m2 = 0. Es rotulación, no hay acrílico)
vinil   = (acab==='vinil') ? caja_m2 / APROV_NESTING_irregular : 0
si acab==='sandwich':
   mod = ceil(caja_m2 × MOD_POR_M2);  fte = ceil(mod × 0.72 / 48)
   separadores = 4 × n
```
`recComp` no suma material: se registra como nota.

**`bastidor`** — el único tipo con área física exacta.
```
m2_real  = ancho × alto / 10000            // ÁREA REAL, no la cobrada con max(m2,1)
panel    = m2_real / APROV_NESTING_simple  -> lam-galv | alucobond según `bas`
tubular  = 2×(ancho+alto) + floor(max(ancho,alto)/TRAVESANO_CM) × min(ancho,alto)   // cm
remaches = ceil(2×(ancho+alto) / REMACHE_CM)
pijas    = ceil(m2_real × 6)
```
El tubular de 1" está nombrado literalmente en `descTxt` (`:6033`).

**`caja`**
```
m2_cara  = ancho × alto / 10000
aprov    = (tarifa >= 4600) ? APROV_NESTING_irregular : APROV_NESTING_simple  // silueta desperdicia
acr-6mm  = m2_cara / aprov
lam-galv  = m2_cara / aprov                                    // trasera
lam-galv += (2×(ancho+alto) × PROF_CAJA_CM / 10000) / APROV_TIRAS   // marco lateral
tubular   = 2×(ancho+alto)                                     // bastidor interno
led-6500  = ceil(m2_cara × MOD_POR_M2_CAJA)                    // SIEMPRE fría: descTxt :6034
fuente-60 = ceil(mod × W_MODULO / 48)
silicon_m = 2×(ancho+alto)/100
si tarifa no está en CAJAS: confianza='estimada', se usa geometría estándar
```

**`manual`** — **cero material, y se dice con palabras.** El propio `PROMPT_IA` (`:5279`) la describe como *"instalación, viáticos, rotulación vehicular u otros"*. Va a `sinMaterial[]` y la pantalla dice: *"1 partida sin material calculable — captúrala si la quieres en el almacén"*.

### 6.4 Conversión a unidad de compra, y el redondeo agregado

```
consumo_con_merma = consumo / (1 - merma_pct)
cantidad_compra   = consumo_con_merma / factor        // FRACCIONARIA, se guarda así
```
El redondeo **no vive en el requerimiento**. Vive en `listaCompra()`:
```
requerido  = Σ (cantidad_ajustada ?? cantidad_compra) de TODOS los proyectos abiertos
disponible = existencia(material)
faltante   = max(0, requerido - disponible)
comprar    = faltante <= 0 ? 0
           : fraccionable ? max(min_compra, ceil(faltante*4)/4)
                          : max(min_compra, ceil(faltante))
```
Dos proyectos que piden 0.484 y 0.700 láminas con 0.5 en almacén: agregado = **1 lámina**. Redondeando por proyecto = **2**. La segunda cifra es cómo un almacén se llena de sobrantes y nadie vuelve a creerle al sistema.

### 6.5 El cordón de plausibilidad, y el dato del escalador

`PROMPT_IA` (`:5261`) instruye textualmente: *"No importa si el corchete es vertical u horizontal: usa ese numero tal cual como centimetros. NUNCA ignores un corchete porque sea horizontal"*. Para el precio da igual (la regla es $/cm × altura × n); para el material es un error de un orden de magnitud. Por eso:

- Si `altura × K_ANCHO_CAJA × n > 1200 cm` de frente de anuncio → `confianza:'requiere_dato'`, `requiere:'¿los 92 cm son de alto o de ancho?'`. Una confirmación, solo en las partidas raras.
- Verificado: el escalador **ya mide el ancho y lo tira**. `SC.items.push({… type: SC.mMode})` (`:8264`) guarda `'h'|'v'|'libre'`, y `scAgregarPartida` (`:8476`) usa solo `m.cm` → `it.altura`. **El arreglo es aditivo y no toca el precio**: `it.medidaTipo = m.type; if(m.type==='h') it.anchoMedido = m.cm;` **sin dejar de escribir `it.altura` como hoy**. Verificado que ninguno de los dos campos está en `_CAMPOS_PRECIO` (`:3255`), así que `huellaTrabajo()` no cambia y **no se suelta ninguna autorización**. Con `anchoMedido` presente, `confianza` sube de `estimada` a `exacta` sin pedirle nada a nadie.
- **Se compara la dimensión mayor de la pieza contra la geometría de la hoja**, no solo el área: si `max(ancho,alto) > material.largo_cm`, la línea avisa *"la pieza mide 2.95 m y el panel 2.44 m: hay junta, o hay que pedir panel de 3.05 m"*.

### 6.6 El ejemplo obligado, de punta a punta

> **Corrección al documento (23/ago/2026).** Las dos filas de piezas contadas —LED y
> separadores— decían 0.44 y 0.64: se habían escrito sin el paso de la merma, aunque el
> §6.4 dice que la conversión es pareja para todo material y la semilla les declara 3% con
> su origen. Los valores correctos son **0.45 caja** y **0.66 bolsa**, y son los que la
> prueba `pruebas/material.mjs` exige. Un módulo LED sí se rompe al soldarlo.

**8 letras de 40 cm de acero inoxidable, rectas, con luz fría.** Venta: `$55 × 40 × 8 = $17,600`.

| paso | cuenta | resultado |
|---|---|---|
| Ancho supuesto | 40 × 0.75 | 30 cm |
| Caja envolvente | 40 × 30 × 8 / 10000 | 0.96 m² |
| Cara de acrílico (aprov 0.80) | 0.96 / 0.80 | 1.20 m² |
| + merma 25 % | 1.20 / 0.75 | 1.60 m² → **0.54 lámina** de `acr-3mm` |
| Perímetro | 4.0 × 40 × 8 | 1 280 cm |
| Canto (aprov tiras 0.90) | 12.8 / 0.90 | 14.22 m |
| + merma 15 % | 14.22 / 0.85 | 16.73 m → **0.29 lámina** de `fleje-inox` |
| Módulos LED 6500 K | ceil(0.96 × 45) = 44, ÷ 0.97 merma | 45.36 → **0.45 caja** |
| Fuentes | ceil(44 × 0.72 / 48) | **1 pza** |
| Separadores | 4 × 8 = 32 pza, ÷ 0.97 merma | 32.99 → **0.66 bolsa** |
| Silicón | 12.8 m / 12 | **1.07 unidad** |

Y la pantalla **no dice "0.54 láminas"**. Dice lo que se pregunta:

> **Acrílico blanco 3 mm** · faltan **0** — hay 2.4 láminas, esto usa 0.54
> **Fleje acero inox espejo 5 cm** · **FALTA 1 lámina** — no hay nada en el taller
> `4.0 × 40cm × 8 = 1,280 cm ÷ 0.90 ÷ 0.85 = 16.73 m ÷ 58.56 m/lámina = 0.29`
> *Estimado.* El ancho salió del factor de caja (0.75), no de una medida. Mide el ancho en el escalador para afinar. · **Ajustar**

### 6.7 Qué se supone, qué se captura, y el bucle que corrige los factores

| falta | decisión | toques humanos |
|---|---|---|
| Profundidad de canto, de caja | **constante**, se confirma una vez | 0 por proyecto |
| Ancho y área del glifo | constantes `K_ANCHO_CAJA` / `K_PERIM`; exacto si hay `anchoMedido` | 0 |
| Grosor de acrílico | **derivado** de la altura (≤40 cm → 3 mm) | 0 |
| Espesores y calibres | van en el **nombre del material**, se eligen al dar de alta la fila | 0 por proyecto |
| Densidad de LED, fuentes | constantes, con la aritmética a la vista | 0 |
| Ancho de las piezas de recorte | `K_AREA_RECORTE`, supuesto **declarado** | 0 |
| Costo unitario y proveedor | **opcional**, `null` por default. Sin costos la plataforma da cantidades, que es el 80 % del valor | 0 |
| Consumibles (solvente, silicón) | por mínimo de reposición, no por proyecto. Derivar 0.02 L es precisión falsa | 0 |

**El bucle de calibración, que es lo que hace que ninguna constante sea un campo obligatorio.** Cada vez que FABRICACIÓN corrige una salida derivada, `Material.ajustar()` guarda la razón `real/calculado` por familia. Al quinto ajuste con desviación media >15 %, Inicio muestra una fila:

> El acrílico rinde 18 % menos de lo calculado en los últimos 6 proyectos. Subir la merma de 25 % a 31 %. **[Actualizar]**

Un toque. Si nadie lo toca nunca, el sistema sigue funcionando con los valores del repo y con su error **a la vista**.

---

## 7. ARQUITECTURA DE ARCHIVOS DEFINITIVA

```
index.html                          EL COTIZADOR. Cinco inserciones aditivas, ~55 líneas en total
sw.js                               MODIFICADO: dos estrategias, promoción atómica, respaldo por ruta
manifest.webmanifest                INTACTO
logo-al3d.png · logo-al3d-dark.png  INTACTOS

plataforma.html                     Cascarón único: sprite SVG, topbar, nav de 6 módulos, un <section> por módulo. Cero lógica
manifest-plataforma.webmanifest     id propio, start_url ./plataforma.html#/hoy, shortcuts a #/hoy #/material #/agenda

css/sistema.css                     COPIA generada de index.html L26-2101. Las 6 capas en su orden. Dep: ninguna
css/plataforma.css                  Solo lo nuevo: rejilla del calendario, renglones de stock, marco del mapa. Dep: sistema.css

js/app.js                           Arranque, router por hash, alta de _CAPAS, registro del SW, ajustarTopbarMovil, oyente 'storage'. Dep: nucleo/*, datos/*
js/nucleo/ui.js                     $, esc, money, ico, toast, voz, chip, grupo, _ABRIBLE, el MutationObserver de modales, el patrón .hist. Dep: ninguna
js/nucleo/ics.js                    Generador RFC 5545, plegado por OCTETOS, UID estable, SEQUENCE. Dep: ninguna
js/nucleo/gcal.js                   FASE 2. GIS token model, eventos con attendees e id determinista. Dep: prefs
js/datos/db.js                      IndexedDB: abrir, migrar, poner, listar, exportar, importar. Dep: ninguna
js/datos/prefs.js                   Las 9 claves al3d_pf_*, envueltas en try/catch. Dep: ninguna
js/datos/cotizador.js               LECTURA de al3d_historial/queue/folio + drenarBuzon(). CERO escrituras. Dep: db, prefs
js/datos/catalogo-precios.js        Copia de MATERIALES/COMPLEJIDAD/RECORTES/BASTIDORES/CAJAS para cuando la plataforma corre sin index.html cargado. Dep: ninguna
js/datos/proyectos.js               ganar, listar, actualizar, avanzarEtapa, tiposDerivados, nombreDerivado. Dep: db, cotizador, material, geo, sync
js/datos/material.js                catálogo, constantes, derivar() PURA, recalcular, ajustar, calibracion. Dep: db, catalogo-precios, sync
js/datos/stock.js                   existencia = conteo + Σ deltas, mover, contar, listaCompra, recibirCompra. Dep: db, material, sync
js/datos/agenda.js                  agendar, reagendar, semaforo, duracionSugerida. Dep: db, material, stock, sync
js/datos/geo.js                     parseGmaps() local + TILES + geocodificar() (Fase 2, cola 1 req/s + caché). Dep: db
js/datos/reglas.js                  evaluar() PURA + refrescar + mensajeWa. Dep: db, cotizador, stock, agenda
js/datos/sync.js                    EL ADAPTADOR. encolar, bombear, jalar, frescura, conflictos. Dep: db, prefs
js/mod/inicio.js                    Dep: reglas, sync, cotizador, stock
js/mod/proyectos.js                 Dep: proyectos, material, cotizador
js/mod/agenda.js                    Dep: agenda, proyectos, ics, gcal
js/mod/material.js                  Dep: material, stock
js/mod/mapa.js                      Dep: proyectos, geo, vendor/leaflet
js/mod/cotizador.js                 Solo navega a index.html. 12 líneas
datos/semilla.json                  Los 19 materiales y las 18 constantes con su derivación. Dep: ninguna

vendor/leaflet.css                  VENDORIZADO, no CDN
vendor/leaflet-src.esm.js           idem. `import * as L` (no tiene default export)
vendor/images/*                     los marcadores de Leaflet

puente/worker.js                    FASE 3. NO se publica. Se pega en el editor de Cloudflare
puente/README.md                    Runbook de 3 líneas por falla
herramientas/extraer-estilo.sh      Regenera css/sistema.css desde index.html L26-2101 y hace diff
```

### Cómo se carga sin build

`plataforma.html` trae un `<link rel="stylesheet">` a los dos CSS y **un solo punto de entrada**:

```html
<script type="module" src="./js/app.js"></script>
```

Módulos ES nativos, `import` relativos con extensión explícita. GitHub Pages sirve `.js` como `text/javascript`. El router hace `import('./mod/'+nombre+'.js')`; cada módulo exporta `montar(contenedor, ctx)` y `desmontar()`. Sin framework, sin dependencias.

Leaflet 1.9.4 quitó el entrypoint ESM del `package.json`, así que se importa el archivo concreto y **con namespace import**: `import * as L from '../vendor/leaflet-src.esm.js'` (`import L from` da `undefined`). **No se hace `window.L = L`**: el objeto de namespace de un módulo ES es no extensible por especificación y un plugin UMD que haga `L.MiPlugin = …` lanzaría `TypeError`. No usamos plugins; el día que haga falta uno, se hace `const G = {...ns}; window.L = G`, y está anotado.

Va vendorizado y no por CDN por una razón leída en el código: `sw.js` hace `if (url.origin !== self.location.origin) return;` — **no cachea nada de otro origen**, así que un Leaflet desde unpkg dejaría el mapa muerto sin señal, que es el escenario para el que existe el service worker. Y desaparece el problema del hash SRI que no se pudo verificar.

**Advertencia real:** los módulos ES no funcionan por `file://`. Probar en local requiere un servidor; el cotizador, que es script inline, sigue abriéndose por doble clic.

**Un solo `plataforma.html` con rutas por hash**, no cinco HTML: navegar entre módulos sin señal no toca la red, el SW cachea un solo documento de navegación, `_CAPAS` vive en un lugar, y GitHub Pages no necesita el truco del `404.html`.

**`css/sistema.css` es una copia y eso es deuda declarada.** Encabezado obligatorio: `/* COPIA GENERADA de index.html L26-2101. No la edites aquí. Edítala allá y corre herramientas/extraer-estilo.sh. */`. La herramienta la regenera y hace diff. Convergencia programada: la próxima vez que `index.html` se toque por otra razón, ese `<style>` se convierte en un `<link>` a este archivo.

### Pila de z-index — los huecos elegidos, documentados

La pila está casi agotada (filete y `.salto` 200, `#toast` 100, `#lightbox` 80, `.modal-bg` 60, `.vt-modal-bg` 56, `.scaler-modal-bg` 55, `.mbar` 45, `.topbar` 30). Nuevos:

```css
/* Leaflet usa 400 en sus paneles y 1000 en sus controles. Sin aislar, el botón de zoom
   se pinta encima del filete de marca (200) y del aviso que dice que no se pudo guardar.
   `isolation:isolate` crea un contexto de apilamiento propio: sus 1000 se quedan dentro. */
#mapa-lienzo{position:relative;isolation:isolate;z-index:1;height:60vh}
```
Ficha lateral del mapa → **40** (entre `.mbar` 45 y `.topbar` 30). Cajón de faltantes → **50**. Modal de pantalla completa de material → **58** (entre `.vt-modal-bg` 56 y `.modal-bg` 60), dado de alta en `_CAPAS` y con el patrón `.hist` de `history.pushState` para el botón atrás del teléfono.

### Qué cambia en `sw.js`

**Dos estrategias, una por ruta.** El comentario actual explica por qué es red-primero: *"el sitio se publica subiendo index.html a la rama main, así que una caché que mande siempre serviría la versión vieja"*. Correcto para **un** archivo. Fatal para veinte: con mala señal, `app.js` llega de la red (v2) y `material.js` de la caché (v1) → excepción de import → **pantalla blanca**, en el escenario exacto para el que existe el SW.

```js
const CACHE = 'al3d-v1';        // el cotizador. Red-primero. SU COMPORTAMIENTO NO CAMBIA
const APP   = 'al3d-app-1';     // la plataforma. Se sube UNA LÍNEA al publicar
const BASICOS = ['./','./index.html','./manifest.webmanifest','./logo-al3d.png','./logo-al3d-dark.png'];
const APP_FILES = ['./plataforma.html','./manifest-plataforma.webmanifest',
  './css/sistema.css','./css/plataforma.css',
  './js/app.js', /* … los 18 módulos … */
  './datos/semilla.json',
  './vendor/leaflet.css','./vendor/leaflet-src.esm.js',
  './vendor/images/marker-icon.png','./vendor/images/marker-shadow.png'];
```

1. `install`: siembra `CACHE` como hoy (de uno en uno con `.catch(()=>null)`, para que un logotipo faltante no tire la instalación entera) **y** siembra `APP` con **promoción atómica**: baja los `APP_FILES` con `{cache:'reload'}` a una caché temporal y **solo si todos llegaron** la renombra a `APP`. Si uno falla, se conserva el conjunto anterior completo. *Un módulo nuevo con un módulo viejo es una app rota, no una app vieja.*
2. `activate`: se conserva el purgado, ajustado para no borrar `CACHE` ni el `APP` vigente.
3. `fetch`, ruta del cotizador (`./`, `./index.html`, logos, manifest): **idéntico a hoy, sin tocar una coma.**
4. `fetch`, ruta de la plataforma (`/plataforma.html`, `/css/`, `/js/`, `/vendor/`, `/datos/`): **caché-primero**, respuesta instantánea, y revalidación en segundo plano con `Promise.race` a 5 s de timeout que reintenta la promoción atómica del conjunto. Un timeout aquí no cuesta nada porque ya se sirvió la copia.
5. Respaldo de navegación **por ruta**: hoy cualquier `req.mode==='navigate'` sin copia devuelve `./index.html`, así que abrir la plataforma sin señal manda al cotizador y parece que la app se rompió. Ahora, si la ruta empieza por `/plataforma`, el respaldo es `./plataforma.html`.
6. **La regla `if (url.origin !== self.location.origin) return;` se queda intacta, y es importante que se quede.** Hace tres cosas gratis: no cachea las APIs de IA (razón original), no cachea el puente (así el estado nunca se sirve viejo), y **no cachea los tiles de OSM** — que es justo lo que exige su política, donde archivar tiles o precargar más de 250 en zoom ≥13 está explícitamente prohibido. **Que nadie "mejore" el SW cacheando tiles: es una violación de la política y la forma más rápida de que nos corten.**
7. El SW **no da datos sin señal, y no debe intentarlo.** Los datos offline vienen de IndexedDB. El SW sirve la app; la base sirve los datos.
8. **No se añade `<meta name="referrer">` ni CSP con `no-referrer`.** Verificado: `grep -i "referrer\|Content-Security-Policy" index.html` no devuelve nada. Las políticas de OSM y de Nominatim exigen un `Referer` válido desde páginas web; poner `no-referrer` es violación explícita y motivo de bloqueo.

### Qué cambia en `index.html` — cinco inserciones, ~55 líneas, todas aditivas

Cero cambios en el CSS, en el PDF, en el escalador (salvo 3 líneas aditivas), en el vectorizador, en la IA, en `lineTotal`, en `totals`, en `huellaTrabajo` ni en el flujo de autorización.

1. **Topbar** (~6 líneas): un `.btn-gho` gemelo del `.btn-hist`, "Plataforma", `<a href="plataforma.html#/hoy">`.
2. **`rv-estatus`** (`:10037-10042`, 4 líneas): las opciones pasan a `FABRICACION` (default), `COBRANDO`, `LIQUIDADO`, `REPARANDO`. Y `abrirRegistrarVenta` cambia `document.getElementById('rv-estatus').value='ANTICIPO'` por `='FABRICACION'`.
3. **`rv-cuenta`** (`:10029-10034`, 5 líneas): las cinco reales `Moni MPago`, `Rul HSBC`, `Tatis BNT`, `Constru BNT`, `Elias BBVA`. Se quita `Otra`. El default se sigue leyendo de `PREF_RV_CUENTA` con el guardia `[...selCuenta.options].some(...)` que ya existe, así que una preferencia vieja de `Otra` simplemente no aplica.
4. **`rv-fecha`** (~7 líneas): pasa a `<input type="date">`; `abrirRegistrarVenta` le pone la fecha de hoy en ISO; `copiarFilaVenta` la convierte a `DD/MM/YYYY` al armar la fila. Se añade un `<label>` "Fecha de anticipo e instalación" para que se lea lo que es.
5. **Botón nuevo y `registrarGanada()`** (~35 líneas): un `.btn-ok` en `.rv-footer`, **antes** del de copiar, que llama a una función que arma el objeto `GanadaLocal` y lo empuja a `al3d_pf_ganadas`:

```js
/* El evento «esta cotización se ganó» no existía en ningún sistema: el modal ya
   capturaba todo (fecha, cuenta, estatus, comisión) y todo se iba al portapapeles.
   Aquí solo se deja constancia en una clave propia; la plataforma la recoge y la
   convierte en proyecto. El botón de copiar se queda para siempre como escape manual. */
function registrarGanada(){
  const t=desgloseFinal();
  const g={
    folio:Q.folio, disp:localStorage.getItem('al3d_pf_disp')||'',
    ts_hist:Date.now(), huella:Q.huellaAuth||'',
    fecha_instalacion:($('rv-fecha').value||''),
    cuenta:$('rv-cuenta').value, estatus:$('rv-estatus').value,
    pct_comision:parseFloat($('rv-pct').value)||0,
    sub:t.sub, neto:t.neto, anti:parseFloat($('rv-anticipo').value)||0,
    ts:Date.now()
  };
  try{
    const arr=JSON.parse(localStorage.getItem('al3d_pf_ganadas')||'[]');
    if(arr.some(x=>x.folio===g.folio&&x.disp===g.disp)){
      toast('Esta cotización ya se registró como proyecto','',3200); return;
    }
    arr.push(g);
    localStorage.setItem('al3d_pf_ganadas',JSON.stringify(arr));
    toast('Registrada como proyecto ganado','ok',4200,{label:'Abrir plataforma',
      fn:()=>{ location.href='plataforma.html#/proyectos'; }});
  }catch(_){ toast('No hubo espacio para registrar el proyecto','err',4200); }
}
```
6. **`scAgregarPartida`** (`:8476`, 3 líneas aditivas, después de `it.altura=h`):
```js
  /* El escalador ya sabe si la medida se trazó horizontal o vertical (SC.mMode) y hasta
     hoy lo tiraba. La altura NO se toca —es la única dimensión que cobra, y el propio
     PROMPT_IA manda usar el número del corchete tal cual—: el modo se guarda aparte,
     fuera de _CAMPOS_PRECIO, para que el módulo de material tenga el ancho MEDIDO en vez
     de un factor supuesto, sin mover un peso ni soltar una autorización. */
  it.medidaTipo=m.type||'';
  if(m.type==='h') it.anchoMedido=m.cm;
```

**Ninguna clave `al3d_pf_*` se añade a `RESPALDO_KEYS`.** Ver §4.2 para las tres razones.

---

## 8. LOS MÓDULOS

**El rol no es seguridad, es modo de trabajo, y hay que decirlo en la pantalla de ajustes:** en Fase 1 no hay servidor y cualquiera puede cambiar su rol. Lo que se defiende no es el secreto, es el ruido: que FABRICACIÓN no vea la pantalla de cobranza y que PAGOS no mueva el almacén sin querer. En Fase 3, `sync.js` valida el rol contra el token del dispositivo en el Worker, y ahí sí es una frontera.

**La frontera del dinero para FABRICACIÓN no es un difuminado.** Verificado que `aplicarBlurPrecios` (`:2894`) solo tapa cuando `Q.estado==='borrador'`, así que sería inerte para proyectos ganados, y sus selectores son ids del cotizador. Para FABRICACIÓN, **el importe no se pinta**: `mod/proyectos.js` y `mod/material.js` consultan `Prefs.rol()` y omiten los campos, no los tapan.

### 8.1 Inicio / recordatorios — `#/hoy`
Filas calculadas, ordenadas por lo que se rompe primero. Todo desde IndexedDB, abre sin señal. Arriba, la **banda de frescura** de `Sync.frescura()`: `Al día` o, en ámbar con el patrón `.cand-partidas`, `Fabricación no comparte desde el martes · lo que ves del almacén tiene 3 días`.

| | DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|---|
| Instalaciones de hoy y mañana | sí | sí | — |
| Cotizaciones autorizadas sin decidir (>7 d) con su importe | **sí, y decide** | — | — |
| Cola esperando precio (`al3d_queue`) | sí | — | — |
| Proyectos ganados sin fecha | sí | — | — |
| Faltantes a T-3 y T-7, con la lista de compra | ve | **ve, es su acción** | ve solo costos |
| Bajo mínimo, con el WhatsApp del proveedor | ve | **sí** | — |
| Fila de calibración | ve | **sí** | — |
| Cobranza (`pago_pendiente > 0`), comisiones (`comision_restante > 1`) | sí | — | **sí** |
| Huella cambiada (R6) | **sí** | — | — |
| Estado del puente y de la bandeja | sí | — | — |

Dep: `Reglas.refrescar`, `Reglas.mensajeWa`, `Sync.frescura`, `Cotizador.historial/cola`, `Stock.bajoMinimo`.

### 8.2 Proyectos — `#/proyectos`
Tablero por **`etapa`**, nunca por `estatus_notion`: son ejes distintos y mezclarlos es cómo se corrompe una vista que ya funciona. Arriba, la tarjeta `.cand-partidas` con latido: `Tienes 3 cotizaciones autorizadas sin decidir` → **Se ganó** / **No se dio**.

| | DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|---|
| Ganar / descartar | **sí** | no | no |
| Importes | ve todo | **no se pintan** | ve todo |
| Orden de trabajo (partidas con medidas, material, temperatura de LED) | ve | **sí, es su ficha** | no |
| Avanzar etapa | todas | `ganado → listo` | `→ cobrando/liquidado` |
| Memoria técnica y notas | edita | **edita** | ve |
| Fila TSV / espejo a Notion | **sí** | no | sí |

Dep: `Proyectos.*`, `Material.requerimientos`, `Cotizador.historial/estadoOrigen`.

### 8.3 Agenda — `#/agenda`
Mes, semana y lista. **La única captura humana real del sistema vive aquí.**

| | DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|---|
| Agendar, mover, cancelar | **sí, y es la única** | propone (deja el aviso) | no |
| Descargar `.ics` | sí | sí (el suyo) | sí (el suyo) |
| Crear evento de Calendar (Fase 2) | **sí, es el único creador** | no | no |
| Semáforo de material sobre el calendario | ve | **sí, es su pregunta: ¿llego?** | no |
| WhatsApp al cliente / al instalador | sí | sí | no |
| Ver solo los días con cobro | — | — | **sí** |

Dep: `Agenda.*`, `Ics.evento/descargar`, `Gcal.crearEvento`, `Reglas.mensajeWa`.

### 8.4 Material — `#/material`
Tres pestañas con `.tipo-seg`: **Por comprar** (agregado, en unidades de compra, con el proyecto y la fecha que lo exige; `@media print` la deja como lista de compra en papel), **En almacén** (existencia con su sello de frescura, botón `Así está` / `Corregir`), **Por proyecto** (requerimiento con su fórmula al lado y `Ajustar` por línea).

| | DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|---|
| Faltantes y comprometido | sí | **sí, es su módulo** | no |
| Entradas, conteos, ajustes | sí | **sí** | no |
| Catálogo de material y constantes | **edita** | edita | no |
| Costos, valor de inventario, margen por proyecto | **sí** | solo cantidades | ve la orden de compra con costos |

Dep: `Material.*`, `Stock.*`.

### 8.5 Mapa — `#/mapa`
Leaflet vendorizado, tiles de OSM con atribución visible, centro en Guadalajara. Pin por `etapa`, con **forma y etiqueta además de color**, nunca color solo. Los `sin_ubicar` van en una lista aparte con `Ubicar los 6 que faltan` (Fase 2, cola de 1 req/s, por botón) y **pin arrastrable a mano** (Fase 1, un toque, sin teclear).

| | DIRECCIÓN | FABRICACIÓN | PAGOS |
|---|---|---|---|
| Todos los pines, filtros por fecha y etapa | **sí** | solo lo de los próximos 15 días | — |
| Orden de ruta del día (vecino más cercano, en el cliente) | sí | sí | — |
| Corregir un pin | sí | sí | — |
| Acceso | sí | sí | **ninguno.** Un módulo que un rol no necesita no debe estar en su barra |

Dep: `Proyectos.listar`, `Geo.*`.

### 8.6 Cotizador — `index.html`
**Navegación completa** a `index.html`, no iframe. Los tres roles lo abren. La razón de rechazar el iframe está verificada: `index.html` tiene **27 declaraciones `env(safe-area-inset-*)`** —el `padding-top` de `.topbar-in`, el `padding-bottom` de `.mbar`, `.wrap`, `body::before`, el relleno de los modales— y **dentro de un iframe esos insets valen 0** porque pertenecen al viewport de nivel superior: el botón de acción principal quedaría debajo del indicador de inicio del iPhone. Además `history` es conjunto para toda la pestaña y el cotizador ya empuja entradas (`{sc:1}`, `{vt:1}`) desde dentro, así que un `pushState` del padre produciría una pila mezclada. Y son 690 KB duplicados en la memoria de un celular.

---

## 9. AUTOMATIZACIONES DE FASE 1

**El principio:** una PWA estática no puede despertarse sola. Push exige un push service y un servidor; Periodic Background Sync es solo Chrome y no garantiza nada. Por lo tanto **el calendario del teléfono es el despertador y la plataforma es el cerebro.** Un `VALARM` suena a una hora fija y no sabe nada del estado del almacén; lo que dice el `DESCRIPTION` no es una respuesta, es una orden de abrir la app, y al abrirla se recalcula la respuesta real. Sesgo explícito: **preferimos el falso positivo.** Un aviso de más cuesta diez segundos; uno de menos cuesta un día de instalación.

| # | Regla | Disparador | Recibe | Canal | Qué la hace posible sin servidor |
|---|---|---|---|---|---|
| **A1** | Revisar material 3 días antes | `VALARM TRIGGER:-P3D` en el `.ics` de la instalación, creado al agendar | FABRICACIÓN, DIRECCIÓN | **Notificación nativa del calendario** + tarjeta al abrir | El `.ics` se genera en el dispositivo y se importa una vez. La alarma la dispara el teléfono, no la app |
| **A2** | Confirmar con el cliente | `VALARM -P1D` en el mismo `.ics` | DIRECCIÓN | Calendario + botón de WhatsApp armado | `wa.me` es un `<a>` |
| **A3** | 30 min antes (120 si `ventana==='noche'`) | `VALARM -PT30M` / `-PT120M` | quien importó el `.ics` | Calendario | idem |
| **A4** | Ritmo: "comparte el día" | `.ics` de ritmo con `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` a las 18:00 | FABRICACIÓN | Calendario → abre en el botón de exportar | **Un `.ics` con `RRULE` es el cron del teléfono.** Cero infraestructura |
| **A5** | Conteo físico mensual | `RRULE:FREQ=MONTHLY;BYMONTHDAY=1` en el mismo `.ics` | FABRICACIÓN | Calendario → lista de los materiales sin contar en 30 días | Solo pide número de los que hayan derivado; para el resto, `Así está` |
| **A6** | Cotización autorizada hace >7 d sin decidir | `Reglas.evaluar()` al abrir | DIRECCIÓN | Tarjeta con **Se ganó** / **No se dio** | Cruce local de `al3d_historial[].ts` contra la ausencia de un proyecto con ese `folio_global`. **Cero infraestructura. Es el eslabón perdido hecho visible** |
| **A7** | Proyecto ganado sin fecha (48 h) | al abrir | DIRECCIÓN | Tarjeta | barrido local |
| **A8** | Comprometido supera la existencia | al abrir | FABRICACIÓN, DIRECCIÓN | La lista de compra, ordenada por la fecha que lo exige | Suma de requerimientos de proyectos con instalación agendada − existencia. **Es la regla que convierte la agenda en una lista de compra** |
| **A9** | Bajo mínimo | después de cualquier salida | FABRICACIÓN | Tarjeta + WhatsApp al proveedor | Cálculo local sobre el libro |
| **A10** | Se pasó la instalación y sigue sin `instalado` (+2 d) | al abrir | DIRECCIÓN | Tarjeta | barrido local |
| **A11** | Instalado con saldo (+3 d) | al abrir | PAGOS | Tarjeta + **Copiar fila para Notion** con `Estatus: COBRANDO` | El botón ya existe y está probado en producción |
| **A12** | Huella de la cotización cambió | al abrir | DIRECCIÓN | Tarjeta con **recalcular material** | Reutiliza `huellaAuth`, el mecanismo que ya existe en `:3255-3280` |
| **A13** | Constante desviada (5+ ajustes, >15 %) | al abrir | FABRICACIÓN | Tarjeta con un botón que la actualiza | El bucle de calibración de §6.7 |
| **A14** | Sin respaldo en 9 días | al abrir | quien abra | Franja ámbar | Safari puede desalojar almacenamiento de sitios sin interacción; el aviso es la única defensa **[POR VERIFICAR en el iPhone real]** |

**Honestidad, y va en el entregable, no escondida aquí:** A6 a A13 son **reglas de pantalla**. Si nadie abre la plataforma en cinco días, nadie las ve. No hay cron y no lo puede haber: un cron externo no puede crear eventos en el calendario personal del director sin un refresh token de servidor, que es justo lo que el token model no da. Las que **tienen** que llegar a un teléfono (A1–A5) son alarmas del calendario creadas por adelantado. Fase 2 mueve A8, A9 y A11 a eventos reales de Calendar.

**Detalles del `.ics` que hay que respetar o esto no funciona:** `UID` estable (`inst-<id>@al3d.mx`; si cambia, el importador duplica en vez de actualizar); al mover, se conserva el `UID` y se sube `SEQUENCE` (= `instalaciones.movida`); variante UTC sin `VTIMEZONE`, con la conversión hecha sobre los campos y **no** pasando por `Date` (`OFFSET_MX = 6`, fijo desde que México abolió el horario de verano el 30/oct/2022); plegado a **75 octetos** sin partir un carácter multibyte (con `ó`, `é` y `ñ` en cada descripción esto no es teórico); escapado en orden `\` → `;` → `,` → salto de línea, y `:` **no** se escapa; **CRLF en todas las líneas, incluida la última**. **[POR VERIFICAR]** que Google Calendar y Apple Calendar acepten el archivo sin quejarse: hay que probarlo en los tres teléfonos antes de cerrar Fase 1.

`wa.me` **solo lleva texto, no adjunta archivos**. El `.ics` y el archivo de respaldo van por `navigator.share({files:[…]})` con respaldo a `descargarArchivo()` (`:6865`, ya existe). **[POR VERIFICAR]** `navigator.canShare({files})` en el iPhone y en el Fold; el respaldo funciona siempre.

---

## 10. LA PRUEBA DEL CAMPO VACÍO

El usuario ya diseñó este sistema en Notion y murió con `Tipo de proyecto` en **0 de 142 filas**, `Cliente` en **0 de 142** y `Registro de clientes` con **1 fila**. Esta tabla es el filtro. **Todo campo de captura manual que no pase, se quitó del diseño o se degradó a opcional con un default que sirve.**

| Campo | De dónde sale | Quién lo escribe | En qué momento de su día ya hacía esto | Qué se rompe si queda vacío | Veredicto |
|---|---|---|---|---|---|
| `nombre` del proyecto | **Derivado** del cotizador: `${cliente} - ${proy} (${tipo})` | nadie | — | nada | pasa |
| `contacto`, `negocio`, `tel` | **Derivado** (`OBLIGATORIOS` del cotizador ya los exige, `telIncompleto` ≥10 dígitos) | nadie | — | nada | pasa |
| `tipo_trabajo` (los 7 de OMAR) | **Derivado** de `items[].tipo` + `luz` + `acab` | nadie | — | nada. **Este es el campo que murió en Notion y aquí se llena al 100 % sin tocarlo** | pasa |
| `sub`, `neto`, `anti_pactado`, `iva` | **Derivado** de `desgloseFinal()` | nadie | — | nada | pasa |
| `lat`/`lng` | **Derivado** de `parseGmaps(Q.maps)`; Fase 2 de `dirRaw` | nadie | — | el proyecto sale en la lista `sin_ubicar`, **no un pin en medio del océano** | pasa |
| `origen` (snapshot) | **Derivado** | nadie | — | nada | pasa |
| Requerimiento de material | **Derivado** de las partidas + constantes | nadie | — | nada | pasa |
| **«Se ganó» / «No se dio»** | **1 toque** | DIRECCIÓN | Ya abre el modal Registrar Venta y copia la fila TSV para pegarla en Notion. El botón nuevo está **al lado** del que ya aprieta | **Todo lo de abajo.** Sin este toque no hay proyecto, ni agenda, ni material, ni mapa | **pasa: es el toque que ya daba** |
| **`fecha` de instalación** | **1 fecha, prellenada** | DIRECCIÓN | El campo `rv-fecha` del modal **ya existe y ya se llena**: es la columna `Fecha Anticipo e Instalacion` que teclea en Notion de todas formas | Agenda vacía, A1–A3 no se crean, el mapa no filtra por fecha | **pasa: es la misma fecha que ya escribía** |
| `hora` | **1 toque, opcional** | DIRECCIÓN | al agendar | nada: `null` es válido y la agenda dice "sin hora". El `.ics` sale como evento de todo el día | **opcional con default útil** |
| `ventana` | select con default `'dia'` | DIRECCIÓN | al agendar | nada. En Fase 3 se deriva con `/nocturn/i` sobre el cuerpo de la página de Notion | **opcional con default útil** |
| `duracion_min` | **Derivado** de `tipo_trabajo`, editable | nadie | — | nada | pasa |
| **`etapa`** | **1 toque por avance** | FABRICACIÓN | El toque que de todos modos da para que la obra avance y para saber qué sigue en su cola | Si nunca se toca: el stock nunca descuenta. **Degradación definida:** a `fecha − 1 día` la plataforma emite las salidas con `origen:'derivado'` y marca el stock `derivado · nunca confirmado`. **El módulo no muere, se degrada y lo dice** | **pasa con degradación** |
| **`conteo` de material** | **~5 números al mes** | FABRICACIÓN | El conteo del día 1, disparado por A5, y **solo de los materiales sin contar en 30 días** | Nada inmediato: la existencia sigue siendo la suma de deltas. El sello dice `derivado · nunca contado`, y el criterio de escalada lo mide | **pasa: 5 números, con botón `Así está` que acepta el derivado sin teclear** |
| **`entrada` de compra** | **1 toque: «Recibí lo de la lista»** | FABRICACIÓN | Ya recibe el material y ya firma la remisión | El stock se queda corto y la lista de compra pide dos veces | **pasa** |
| `costo_total` de una compra | **opcional**, `null` | FABRICACIÓN o PAGOS | al pagar la factura | Nada: sin costos la plataforma da **cantidades**, que es el 80 % del valor. Solo se pierde el margen por proyecto | **opcional con default útil** |
| `costo_compra` del material | **opcional**, `null` | FABRICACIÓN | al dar de alta la fila, **19 filas, una vez** | idem | **opcional con default útil** |
| `proveedor`, `tel_proveedor` | **opcional**, `''` | FABRICACIÓN | idem | El WhatsApp de A9 no tiene a quién mandarse; el aviso sigue apareciendo | **opcional con default útil** |
| `min_stock` | **opcional**, `0` = no avisar | FABRICACIÓN | idem | A9 no se dispara para ese material | **opcional con default útil** |
| `PROF_CANTO_CM`, `PROF_CAJA_CM`, medida de la lámina de acrílico | **3 números, una vez en la vida del taller** | FABRICACIÓN o DIRECCIÓN | Una tarde, en la pantalla de constantes, al arrancar | Nada: hay valor inicial razonado. Solo cambia la exactitud, y `confianza` lo dice | **pasa: no es por proyecto** |
| Las otras 15 constantes | valor inicial del repo | nadie | — | nada | pasa |
| `cantidad_ajustada` de un requerimiento | **1 número, solo cuando el cálculo falló** | FABRICACIÓN | Ya iba a corregir el material que sacó | Nada: manda el calculado. **Y cada corrección alimenta el bucle de calibración**, así que el trabajo de corregir **arregla** el sistema | **pasa: es trabajo que ya hacía, ahora con rendimiento** |
| `anchoMedido` | **Derivado** del `type` del escalador, si usó el escalador | nadie | — | nada: `confianza` baja a `estimada` y se usa `K_ANCHO_CAJA` | pasa |
| Pin del mapa a mano | **1 toque sobre el mapa, sin teclear** | DIRECCIÓN o FABRICACIÓN | Solo cuando `parseGmaps` y el geocoding fallaron | El proyecto se queda en `sin_ubicar` | **opcional** |
| `notas` del proyecto / de la instalación | texto libre, `''` | cualquiera | cuando tiene algo que decir | **nada. Ninguna consulta, vista, regla ni cálculo lo usa como entrada** | **opcional por construcción** |
| `nombre` y `rol` del dispositivo | 2 toques la primera vez | cada uno | al abrir la app por primera vez | los sellos dicen "sin nombre" | pasa |

### Campos que se quitaron del diseño por no pasar la prueba

- `altura_montaje_m`, `requiere_andamio`, `requiere_grua`, `contacto_sitio`, `tel_sitio`. Son captura pura, iban a estar vacíos en el 100 % de las filas, y un campo estructurado vacío es **peor** que una nota libre porque invita a construir una consulta encima. Lo que haga falta decir cabe en `notas`.
- `Cliente` como relación a una base de clientes, y `Registro de clientes`. Verificado que tiene **1 fila** después de tres años. La plataforma no pide una entidad cliente: usa `contacto` y `tel`, que el cotizador ya obliga, y deduplica por nombre con la misma lógica de `clientesConocidos()` (`:3168`) cuando hace falta autocompletar. **No se puebla a mano.**
- `Constancia situación fiscal`, `RFC`, `Email`. Cero filas en tres años. Nadie los necesita para instalar un anuncio.
- `Tiempo de entrega` como select de 1–4 semanas capturado. Se deriva del tipo de trabajo para proponer `duracion_min` y `compromiso_fecha`, y `compromiso_texto` guarda el `Q.entrega` crudo sin parsearlo nunca.

### Los dos números que se vigilan el primer mes, y son criterios, no opiniones

1. **`tipo_trabajo` distinto de vacío en el 100 % de los proyectos nuevos.** Si se cumple, la tesis se sostiene y este sistema es distinto de la copia (B). Si no, hay un bug en la derivación, no una falta del usuario.
2. **Menos del 40 % de los requerimientos con `cantidad_ajustada`.** Si se pasa, las constantes están mal calibradas y hay que arreglarlas **antes** de construir cualquier módulo nuevo encima. Y el bucle de calibración ya tiene los datos para hacerlo.
3. **Criterio de escalada a Fase 3:** más de 2 conteos con diferencia mayor a una unidad de compra en un mes, **o** retraso medio de fusión sobre 24 h. Los dos números viven en Ajustes y los cuenta la app.

---

## 11. LO QUE NO SE VA A HACER, Y POR QUÉ

1. **No se migran los 199 proyectos fuera de Notion.** Migrar significa reimplementar cinco fórmulas, recrear siete vistas, perder el texto libre de las 199 páginas —que no tiene esquema y por eso es lo único intransferible— y volver a enseñarle a tres personas dónde se trabaja. Y significa repetir el fracaso de la copia (B) a mayor escala: un esquema nuevo mejor que nadie llena.

2. **No se llama a la API de Notion desde el navegador. Nunca, ni con CORS arreglado.** No manda `Access-Control-Allow-Origin`, `Notion-Version` dispara preflight, y `Authorization: Bearer secret_…` es un token de escritura total sobre el workspace. Aun si Notion arreglara CORS mañana, ese token no puede vivir en un HTML publicado. El puente vive en un Worker o no vive.

3. **No se altera el esquema de Notion por API.** La plataforma detecta las propiedades que faltan y muestra la lista con nombre y tipo exactos para que un humano las cree. Es la única forma de garantizar que no se rompan las siete vistas ni las cinco fórmulas de una base con tres años y $3.7M.

4. **No se recalcula ninguna fórmula de Notion.** `Precio Neto `, `Pago Pendiente`, `Comisiones`, `Comision Restante`, `Fecha Comision` se leen. Nunca se calculan aquí. Dos implementaciones de la misma fórmula divergen en semanas y el sistema empieza a dar dos respuestas.

5. **No se arregla la divergencia de precios, se menciona.** La página *¿Cómo Cotizar?* cobra por **tipo de letra** ($30 sin luz / $35 recta / $40 puntas / $50 manuscrita, −20 % sin iluminación); el cotizador cobra por **material** ($30 al pintado … $55 acero) más $5 cursiva o $10 compleja. Son dos ejes distintos. **Manda el catálogo del cotizador**: es más nuevo, más granular y está en producción. La pantalla de constantes lo dice con una línea para que nadie compare un precio con el ejemplo de su propia página de Notion y crea que hay un bug.

6. **No se inventa la tarifa que falta.** La regla escrita solo cubre letras. El cotizador cubre además caja ($3,900 / $4,600 por m², mínimo 1 m²), bastidor ($950 / $1,500 por m²) y recorte/vinil ($20 / $25 / $55 por cm). **El neón flex se vende** —hay un proyecto real, `Priscilla - Neón Flex "Enjoy"`— **y no está en ningún catálogo de ningún sistema.** Cae en `tipo:'manual'`, que es la partida que el módulo de material excluye por diseño. Ese es un hueco de negocio, no de arquitectura, y se dice en voz alta ahora en vez de que se descubra cuando la lista de compra salga incompleta. El arreglo real es un sexto `tipo` en el cotizador, y **no se toca hoy** porque toca producción.

7. **No se mete el cotizador en un iframe.** 27 declaraciones `env(safe-area-inset-*)` que valen 0 dentro de un iframe, un `history` compartido que ya lleva las entradas del escalador y del vectorizador, y 690 KB duplicados en la memoria de un celular.

8. **No se reutiliza `body.precios-ocultos` como frontera de dinero.** Verificado inerte para cotizaciones autorizadas (`Q.estado==='borrador'`), con selectores del cotizador, y de todos modos un `filter:blur(7px)` que se levanta con un `pointerdown` o con el botón *Ver precios*. Es una mampara contra el cliente sentado enfrente, no un permiso. Para FABRICACIÓN el importe **no se pinta**.

9. **No se cachean los tiles del mapa en el service worker.** La política de OSM prohíbe archivar tiles y precargar lo que el usuario no está viendo (más de 250 tiles en zoom ≥13 es explícitamente inaceptable). La regla `url.origin !== self.location.origin` del SW ya lo garantiza por construcción y **no se toca**. Consecuencia que el usuario va a ver y que la pantalla dice con palabras: *"el mapa necesita señal; los datos no"*.

10. **No se implementa Google Maps, se deja preparado.** `TILES.google` es un stub de cuatro líneas con un comentario que dice qué llave necesita y qué cambiar. `Geo.capaBase(prov)` tiene la misma interfaz para los tres. Cambiar de proveedor es cambiar `al3d_pf_tiles`, no reescribir el módulo. Es literalmente lo que pidió: *"OSM como borrador, y en caso de quererlo mejorar, Google Maps, pero tenlo dentro de la estructura al pendiente"*.

11. **No se usa autocompletar de direcciones.** La política de Nominatim lo prohíbe explícitamente para clientes. El campo de ubicación lleva **botón**, no búsqueda al teclear.

12. **No se intenta expandir los links cortos de Google Maps desde el navegador.** `maps.app.goo.gl` no manda CORS en su 30x, en `no-cors` la respuesta es opaca con lista de headers vacía por especificación, y `redirect:'manual'` tampoco. **No hay truco.** La pantalla dice: *"Ese es un link corto y el navegador no puede abrirlo. Ábrelo, espera el mapa y copia el link de la barra."* Con el puente de Fase 3, un endpoint `/expandir` lo hace solo.

13. **No se usa Supabase.** Se pausa a la semana de inactividad —y el rol de PAGOS abre la app una vez al mes—, tiene **cero días de retención de respaldo** en el plan gratuito, y una sola tabla con RLS apagada expone todo a una anon key que va publicada a propósito. Añade tres modos de falla nuevos que el usuario no puede leer ni depurar, y **no arregla el campo vacío**, que es el problema de este negocio.

14. **No se usa Vercel Hobby.** Su plan gratuito es explícitamente no comercial. Descalificado para una empresa.

15. **No se suscribe un `.ics` publicado en el repo.** Google refresca cada 12–24 h y no se puede forzar. Sirve para una agenda de consulta con un día de atraso; no para "acabo de agendar".

16. **No hay usuarios, ni login, ni base de usuarios en Fase 1.** Tres personas, tres dispositivos, un rol por dispositivo. En Fase 3 la autoridad de escritura vive en el token del dispositivo dentro del Worker, que mapea `token → rol → lista blanca de propiedades escribibles`. Cambiar el segmento de rol en la UI no da permisos: da otro tablero.

17. **Los instaladores no tienen acceso, y no aparecen en el modelo.** Ni fila, ni token, ni app. Reciben un WhatsApp armado con dirección, link de mapa, hora, qué se instala y a quién buscar. Es una decisión del usuario y se respeta tal cual.

18. **No se extrae hoy el `<style>` de `index.html`.** Reordenar seis capas de cascada donde gana la última regla y donde la capa de barro pisa a propósito a la de estructura, en un archivo de 10 075 líneas en producción, es exactamente el cambio que no se puede permitir. Se copia, se regenera con una herramienta que hace diff, y se converge la próxima vez que ese archivo se toque por otra razón.

19. **No se toca `lineTotal`, `totals`, `huellaTrabajo`, `precioFinal`, `desgloseFinal`, el PDF, el escalador (salvo 3 líneas aditivas), el vectorizador, la IA ni el flujo de autorización.** Y en particular: **el arreglo del `type` del escalador es aditivo.** Desviar una medida horizontal a `anchoMedido` **en vez de** a `it.altura` dejaría la partida en `$0` —`lineTotal` es `factorOf(it) × altura × n`, la altura es la única dimensión que cotiza letras— y contradiría la regla de negocio explícita de `PROMPT_IA:5261`. Es una regresión de precio en producción disfrazada de mejora de datos, y no se hace.

20. **No se promete nada que dependa de una red que no pude verificar.** El CORS de Nominatim, la aceptación del `.ics` por Google y Apple, `navigator.canShare({files})` en iPhone y Fold, el `maxZoom:19` del layer estándar de OSM, el desalojo de Safari a los 7 días y la escritura por API de una propiedad *status* de Notion están marcados **[POR VERIFICAR]** y ninguno es prerrequisito de Fase 1. Si algo no puede funcionar hoy, va a Fase 2.