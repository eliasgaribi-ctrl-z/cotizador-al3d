# Plataforma AL3D — arquitectura

Fuente: `/home/user/cotizador-al3d/index.html` (10 075 líneas, en producción), `sw.js` (`al3d-v1`, red‑primero), `manifest.webmanifest`. Notion: `Ventas - AL3D` = `collection://56fa21d8-8e7d-4e16-b874-455fd6c65643`, database `591b3a49a30f4fc891e07a26bf10b5d7`.

---

## 1. Tesis

Notion se queda. **`Ventas - AL3D` de la copia (ELIAS) sigue siendo el sistema de registro de los proyectos ganados** —199 filas, $3,713,419.41 de `Precio Subtotal`, siete vistas en uso, cinco fórmulas de cobranza y comisión (`Precio Neto `, `Pago Pendiente`, `Comisiones`, `Comision Restante`, `Fecha Comision`), tres años de memoria técnica en el cuerpo de las páginas y tres personas que ya entran ahí— y la plataforma es **la capa operativa que Notion no puede dar**: el mapa con coordenadas de verdad, la derivación automática del material desde las partidas del cotizador, el stock, y el puente que hoy no existe en ningún sistema: *cotización autorizada → proyecto ganado*. Esta arquitectura es la correcta para **este** usuario por una razón medida, no por gusto: en la copia (OMAR) el mismo director ya diseñó exactamente la plataforma que está pidiendo —calendario de entregas e instalación, mapa por `Ubicación entrega`, `Tipo de proyecto` de 7 valores, `Registro de clientes`— y murió con **`Tipo de proyecto` lleno en 0 de 142 filas, `Cliente` en 0 de 142 y un solo cliente registrado**. No le faltó esquema: le faltó que los campos se llenaran solos. Así que la regla que gobierna cada decisión de aquí abajo es una: **todo dato que exija captura manual por proyecto se considera un módulo muerto**, y cada campo tiene que salir del cotizador, de Notion, de un link de Maps que alguien ya pegó, o de una constante de taller que se configura una vez en la vida y después **se autocalibra con el consumo real**. Añadir una pieza de infraestructura (un Worker de 60 líneas, sin estado, gratis, editable desde el navegador) es más barato que migrar tres años de datos: migrar significa reimplementar cinco fórmulas, recrear siete vistas, perder el texto libre de las 199 páginas —que no tiene esquema y por eso es lo único intransferible— y volver a enseñarle a tres personas dónde se trabaja. Y significa repetir el fracaso de la copia (OMAR) a mayor escala: un esquema nuevo mejor que nadie llena.

---

## 2. Notion vs Google Calendar

**Gana Google Calendar. Y la pregunta esconde dos preguntas distintas, que hay que separar antes de contestar.**

- ¿Dónde vive la verdad del proyecto ganado? **Notion.** Eso no se vota, ya está decidido arriba.
- ¿Quién entrega el recordatorio a un teléfono a una hora? **Google Calendar.**

Notion pierde la segunda por cuatro razones concretas:

1. **Un recordatorio que exige abrir una app no es un recordatorio.** La campana de Notion notifica cuando alguien menciona una fecha en un bloque; para "tres días antes de la instalación, si falta material" hace falta un disparador relativo a fecha con condición, y el catálogo de disparadores de automatización de Notion depende del plan (no lo verifiqué en esta sesión y no voy a construir sobre eso). Google Calendar sí lo hace: un evento con `reminders.overrides` lo despierta **la infraestructura de Google**, no nuestra app, y suena con la pantalla apagada y sin señal.
2. **Asientos.** FABRICACIÓN y PAGOS necesitan recibir avisos. Un asiento de Notion por persona cuesta; una invitación a un calendario compartido no cuesta nada, y el de fabricación probablemente ya tiene Gmail en el teléfono.
3. **Desde el navegador, Notion es imposible sin servidor.** La API de Notion no manda `Access-Control-Allow-Origin` (dos issues abiertos en su propio SDK: `notion-sdk-js` #96 y #408), `Notion-Version` es un header no simple que dispara preflight, y `Authorization: Bearer secret_…` es un token de escritura total que no puede vivir en el HTML de GitHub Pages. Google Calendar sí se puede desde el navegador: token model de Google Identity Services, sin secreto, sin refresh token, y con tres usuarios te quedas en *publishing status: Testing* (hasta 100 test users) sin verificación y sin publicar.
4. **Sin señal.** El `.ics` se genera 100 % en el dispositivo, sin red. En la calle, delante del cliente, el director agenda y el evento entra a su teléfono. Notion, sin señal, no existe.

**El papel exacto del perdedor**, que no es pequeño:

- Notion **conserva su calendario**. La vista de calendario por `Fecha Anticipo e Instalacion` que ya existe se queda tal como está, para el director que vive en Notion. No la tocamos.
- Notion **sigue siendo el registro** de todo lo que la plataforma agenda: la plataforma escribe `Fecha Instalacion` (campo nuevo) en la página del proyecto **antes** de crear el evento de Calendar, y guarda el `eventId` devuelto en la propiedad `Evento Calendar`. Si Google desaparece, la fecha sigue en Notion. Si Notion está caído, el evento sigue en el teléfono. Ninguno de los dos es punto único de falla para el dato.
- Notion **es la UI de captura de lo que no se puede derivar**: la memoria técnica en el cuerpo de la página, el `Estatus` de cobranza, la `Cuenta `. Eso ya funciona y no lo vamos a reinventar.

Lo que **no** se hace: no se usa suscripción a un `.ics` publicado. Google refresca un calendario suscrito cada 12–24 h y **no hay manera de forzarlo**; para "acabo de agendar" es inservible. La suscripción solo serviría como agenda de consulta con un día de atraso, y ya tenemos algo mejor.

---

## 3. Modelo de datos

### 3.0 Regla de oro de convivencia

La plataforma **lee** `al3d_historial`, `al3d_queue` y `al3d_q`. **Nunca las escribe. Cero excepciones.** Es lo que garantiza que el cotizador no se pueda corromper desde aquí.

Las claves nuevas llevan prefijo **`p3d_`**, no `al3d_`. No es cosmética: `restaurarDesde()` (L6890) hace `RESPALDO_KEYS.forEach(k=>localStorage.removeItem(k))` y después reescribe solo lo que viene en el paquete. Si las claves de la plataforma se llamaran `al3d_*` y alguien restaurara un respaldo viejo del cotizador, **el estado de la plataforma se borraría en silencio**. Con prefijo distinto, la lista de `RESPALDO_KEYS` no las alcanza y el respaldo de la plataforma es su propio archivo (`{app:'plataforma-al3d',formato:1,…}`), que a su vez nunca toca claves `al3d_*`.

Claves nuevas completas:

| Clave | Contenido | Se pierde si se borra |
|---|---|---|
| `p3d_espejo` | espejo de lectura de Notion (proyectos, sin cuerpos de página) + `ts` por colección | Nada: se recupera de Notion |
| `p3d_bandeja` | bandeja de salida de mutaciones pendientes | **Sí. Es lo único irrecuperable de la plataforma** → va primero en el respaldo y se avisa en pantalla si tiene >24 h |
| `p3d_materiales` | catálogo de materiales | Se resiembra del repo, se pierden costos y proveedores |
| `p3d_constantes` | constantes de taller + su versión | Vuelve a los valores del repo |
| `p3d_movimientos` | movimientos de stock aún no subidos | Sí (se van en la bandeja también) |
| `p3d_avisos` | qué recordatorio ya se emitió | Nada: los `eventId` son deterministas |
| `p3d_geo` | caché de geocodificación (obligatoria por política de Nominatim) | Nada, se vuelve a pedir a 1 req/s |
| `p3d_rol` | `DIRECCION` \| `FABRICACION` \| `PAGOS` — solo afecta lo que se *muestra* | Se vuelve a elegir |
| `p3d_dispositivo` | 3 caracteres, generado una vez (`D7K`) | Sí: rompe la unicidad de folio, hay que reasignarlo |
| `p3d_puente` | URL del Worker + token del dispositivo, ofuscado con `keyPack()` (mismo patrón que `al3d_kxs_gemini`) | Se pega de nuevo |
| `p3d_gcal` | Client ID + ids de los 4 calendarios | Se pega de nuevo |
| `p3d_tiles` | `osm` \| `carto` \| `google` | Vuelve a `osm` |

### 3.1 `proyecto` — el registro puente

**Vive en Notion, en la base que ya existe.** No se crea una base de proyectos. Se añaden **siete propiedades nuevas** a `Ventas - AL3D` y **no se toca ninguna de las existentes**, para que las siete vistas y los filtros (`Proyectos en Puerta` filtra To‑do + In progress) sigan funcionando igual.

Propiedades **existentes** (fuente de la verdad: Notion; la plataforma solo las lee y las espeja):

| Propiedad Notion | Tipo | Quién la escribe |
|---|---|---|
| `Proyecto` | title, convención `Contacto - Negocio (trabajo)` | Plataforma al crear; después Notion |
| `Precio Subtotal` | number | Plataforma al crear (de `desgloseFinal().sub`); después PAGOS en Notion |
| `IVA` | checkbox | Plataforma al crear (de `Q.iva`) |
| `Precio Neto `, `Pago Pendiente`, `Comisiones`, `Comision Restante`, `Fecha Comision` | formula | **Notion. Nadie más. Nunca se recalculan aquí** |
| `Anticipo`, `Liquidacion`, `Abono Comision` | number | PAGOS, en Notion o en la plataforma |
| `Estatus` | status (`REPARANDO`,`COBRANDO`,`FABRICACION`,`LIQUIDADO`) | **PAGOS. Es un estatus de dinero, no de obra** |
| `Cuenta ` | select (5 opciones) | PAGOS |
| `Fecha Anticipo e Instalacion` | date | Notion. **Un campo para dos eventos: no se reutiliza** |
| `Fecha Liquidacion` | date | PAGOS |
| cuerpo de la página | texto libre | FABRICACIÓN / DIRECCIÓN, en Notion |

Propiedades **nuevas** (siete, se crean a mano una vez; la plataforma detecta las que falten y muestra la lista con nombre y tipo exactos, **nunca altera el esquema por API**):

| Propiedad | Tipo | De dónde sale — cero captura manual |
|---|---|---|
| `Folio Cotizacion` | rich_text | `p3d_dispositivo + ':' + Q.folio` → `D7K:COT-0007`. Clave del puente. El folio solo es único por dispositivo (`al3d_folio` es local, L7170) |
| `Etapa` | select: `GANADO`,`EN DISENO`,`CORTADO`,`ARMADO`,`LISTO`,`INSTALADO` | Un toque de FABRICACIÓN. **Es la etapa de obra; `Estatus` es la de dinero. Separadas a propósito** |
| `Fecha Instalacion` | date (con hora) | DIRECCIÓN en la agenda. En la primera sincronización se **siembra** con `Fecha Anticipo e Instalacion` para que las 199 filas no queden en blanco |
| `Tipo de trabajo` | multi_select, los **7 valores del vocabulario que ya diseñó** en la copia (OMAR) | **Derivado** de `Q.items[].tipo` + `luz`. Un proyecto puede llevar letras Y bastidor: por eso multi, no single (ahí murió el original) |
| `Lat` / `Lng` | number / number | `parseGmaps(Q.maps)` o Nominatim sobre `Q.dirRaw + ' ' + Q.entrecalles` |
| `Geo` | select: `MAPS`, `GEOCODIFICADA`, `MANUAL`, `SIN UBICAR` | Lo pone el derivador. `SIN UBICAR` es un estado legítimo, no un error |
| `Snapshot Partidas` | rich_text (JSON, ≤1900 caracteres por objeto, se parte en varios si hace falta) | `Q.items` congelado con `_lt`. **Es lo que hace que el material se pueda recalcular desde cualquier dispositivo sin depender del `localStorage` del teléfono que cotizó** |
| `Evento Calendar` | rich_text | `eventId` de Google, para actualizar en vez de duplicar |

Y dos más, opcionales pero baratas: `Ventana` (select `MANANA`/`TARDE`/`NOCTURNA`, derivada con un regex `/nocturn/i` sobre el cuerpo de la página — las instalaciones nocturnas están documentadas en los datos: *"Instalacion nocturna, previamente armado en el taller"*) y `Duracion Min` (number, derivada del tamaño de la obra).

**Propiedad de la que estoy orgulloso y hay que defender:** con `Snapshot Partidas` + `Folio Cotizacion` + `Lat`/`Lng` en Notion, **un dispositivo nuevo con `localStorage` vacío reconstruye toda la capa operativa desde Notion y el repo.** La plataforma no tiene estado privado que importe.

### 3.2 `instalacion agendada` — no es una entidad

Son cuatro campos del proyecto: `Fecha Instalacion`, `Ventana`, `Duracion Min`, `Evento Calendar`. **No hay base de instalaciones y no la va a haber**, porque sería una relación que nadie llena y porque en este negocio un proyecto tiene una instalación (una revisita es un proyecto `REPARANDO`, que es exactamente cómo está modelado hoy: 1 fila con ese estatus). La cuadrilla no se modela: los instaladores no tienen acceso y no hay calendario de cuadrillas en ninguna parte; se les avisa por WhatsApp (§7, regla 5).

### 3.3 `material` (catálogo) — fuente de la verdad: **la plataforma**

Base nueva en Notion `Materiales - AL3D`, espejada en `p3d_materiales`. Semilla en el repo (`js/material-catalogo.js`), así que **funciona el día uno sin cuenta de nada**.

```
{
  id:            string,   // slug, PK: 'acr-3mm-blanco'
  nombre:        string,
  familia:       'aluminio'|'acero'|'acrilico'|'galvanizado'|'alucobond'
                |'vinil'|'led'|'fuente'|'tubular'|'herraje'|'consumible',
  unidad_compra: 'unidad'|'bolsa'|'caja'|'lamina'|'litro'|'metro'|'tramo',
  unidad_consumo:'cm'|'cm2'|'m'|'m2'|'pieza'|'litro',
  factor:        number,   // cuántas unidades de consumo trae UNA unidad de compra
  factor_origen: string,   // OBLIGATORIO: de dónde sale el número
  merma_pct:     number,   // 0..1
  min_stock:     number,   // en unidad de COMPRA
  costo_unitario:number|null,  // MXN por unidad de compra. null = solo cantidades, no pesos
  proveedor:     string|null,
  activo:        boolean
}
```

`factor_origen` no es documentación decorativa: es la única defensa contra un número inventado que después nadie puede auditar. Semilla (los factores y su procedencia; **estos son los que el usuario pidió**, unidad de compra ≠ unidad de consumo):

| Material | Compra | Consumo | Factor | De dónde sale | Merma |
|---|---|---|---|---|---|
| Acrílico 3 mm blanco/color | lámina | m² | **2.9768** | lámina 1.22 × 2.44 m | 35 % (piezas irregulares anidadas) |
| Acrílico 6 mm | lámina | m² | 2.9768 | idem | 35 % |
| Aluminio pintado, canto 5 cm | lámina | cm lineales | **5 856** | 1.22×2.44 m → `floor(122/5)=24` tiras × 244 cm | 15 % (corte y doblez) |
| Aluminio brush, canto 5 cm | lámina | cm lineales | 5 856 | idem | 15 % |
| Acero inoxidable espejo, canto 5 cm | lámina | cm lineales | 5 856 | idem | 15 % |
| Lámina galvanizada | lámina | m² | 2.9768 (y **2.2204** en 0.91×2.44) | dos presentaciones reales → **dos filas de catálogo, no una constante** | 12 % |
| Alucobond | lámina | m² | 2.9768 | 1.22 × 2.44 m | 12 % |
| Vinil de corte | metro | m² | **1.22** | rollo de 1.22 m de ancho, 1 m lineal = 1.22 m² | 20 % |
| Tira LED 12 V | metro | m | **5** | rollo de 5 m | 5 % |
| Fuente 12 V 60 W | unidad | pieza | 1 | — | 0 |
| Tubular 1" | tramo | cm | **600** | tramo de 6 m | 8 % |
| Remache 1/8" | caja | pieza | **500** | caja de 500 | 3 % |
| Tornillo autorroscante | caja | pieza | **100** | caja de 100 | 3 % |
| Taquete + pija | bolsa | pieza | **100** | bolsa de 100 | 3 % |
| Separador / spacer | bolsa | pieza | **50** | bolsa de 50 | 3 % |
| Solvente / limpiador | litro | litro | 1 | — | 0 |
| Silicón estructural | unidad | pieza | 1 | cartucho | 0 |

Ninguno de estos números existía en Notion ni en Drive. Son propuestas con su derivación a la vista y **son editables desde la plataforma**; ninguno se captura por proyecto.

### 3.4 `existencia` — derivada, no capturada

**No hay campo "cantidad en almacén" que alguien tenga que mantener.** La existencia es un cálculo:

```
existencia(material) = último conteo.cantidad
                     + Σ movimientos con ts > conteo.ts
```

Un número que alguien tiene que recordar actualizar se queda mal para siempre; un libro de movimientos se queda incompleto, que es un error visible y corregible. Se elige el error visible.

### 3.5 `movimiento` — fuente de la verdad: **la plataforma**

Base `Movimientos - AL3D` en Notion, espejo en `p3d_movimientos`, apéndice puro (nunca se edita una fila, se agrega la contraria).

```
{
  id:          string,   // uuid, generado en el cliente -> idempotencia
  material_id: string,
  tipo:        'entrada'|'salida'|'ajuste'|'conteo',
  cantidad:    number,   // en unidad de COMPRA, con decimales. + entra, - sale
  proyecto_id: string|null,  // notion_page_id
  origen:      'derivado'|'manual'|'conteo'|'compra',
  ts:          number,   // epoch ms, del cliente
  usuario:     'DIRECCION'|'FABRICACION'|'PAGOS',
  nota:        string
}
```

**Cómo se llena sin capturar nada:** cuando FABRICACIÓN toca `Etapa: CORTADO` —un toque que de todos modos tiene que dar para que la obra avance—, la plataforma emite automáticamente los `salida` de todo el requerimiento del proyecto, con `origen:'derivado'`. Si lo real fue otra cosa, corrige un número; y **esa corrección es la señal de calibración** de §4.6. Es el mismo truco que ya usa el cotizador con `al3d_ult_material`: el dato se guarda cuando ya es la decisión buena, no antes.

### 3.6 `requerimiento` (BOM por proyecto) — derivado

```
{
  id:                 string,   // `${proyecto_id}:${material_id}`
  proyecto_id:        string,
  material_id:        string,
  cantidad_consumo:   number,   // en unidad de consumo (cm, m2, m, pieza)
  cantidad_compra:    number,   // ya convertida y con merma, con decimales
  compra_redondeada:  number,   // Math.ceil, salvo materiales fraccionables
  partidas:           number[], // it.id de las partidas que lo produjeron
  constantes_version: string,   // p.ej. 'c-2026-08'
  estado:             'calculado'|'apartado'|'surtido'|'comprado'|'ajustado',
  cantidad_real:      number|null
}
```

No se guarda en Notion salvo como bloque de texto legible en el cuerpo de la página del proyecto ("Material calculado: 1 lámina acrílico 3 mm, 1 lámina acero, 3 rollos tira LED, 3 fuentes"), porque es **recalculable** desde `Snapshot Partidas` + `p3d_constantes`. Guardar un derivado como si fuera un hecho es cómo se corrompen los modelos.

### 3.7 `recordatorio` — **no existe como entidad**

Es el hallazgo de diseño que más infraestructura ahorra. Un recordatorio es una de dos cosas:

- **Una fila calculada en la pantalla de inicio**, evaluada al abrir la app sobre `p3d_espejo` + `al3d_historial`. No necesita almacenamiento, funciona sin señal, y no puede quedar "desincronizada" porque no se almacena.
- **Un evento de Google Calendar**, cuando tiene que llegar a un teléfono. El `eventId` es determinista: `'al3d' + base32hex(sha1(regla + proyecto + fecha))` → insertar dos veces devuelve 409, que se trata como "ya estaba". Idempotente **sin estado local**. (El charset de `id` en Calendar API es base32hex minúscula, 5–1024 caracteres; verificar antes de codificar.)

`p3d_avisos` solo guarda "esto ya lo vi" para no repintar lo atendido. Si se pierde, no pasa nada.

### 3.8 `usuario / rol` — sin cuentas de usuario

Tres personas, tres dispositivos. **No hay base de usuarios y no hay login.**

- `p3d_rol` (localStorage) decide **lo que se muestra**. Se elige una vez por dispositivo, con el mismo patrón que el `.seg` de rol que ya existe en la topbar (`#roleseg`, `Q.rol`).
- **La autoridad de escritura vive en el token del puente, no en la UI.** Cada dispositivo tiene su token; el Worker mapea `token → rol → lista blanca de propiedades escribibles`. FABRICACIÓN puede escribir `Etapa` y nunca `Precio Subtotal`; PAGOS puede escribir `Anticipo`, `Liquidacion`, `Estatus`, `Cuenta ` y nunca `Etapa`; DIRECCIÓN puede escribir todo menos las fórmulas (que Notion no deja escribir de todos modos). Cambiar el segmento de rol en la UI no da permisos: da otro tablero.
- Los instaladores **no tienen token**, no tienen app y no aparecen en el modelo. Reciben un WhatsApp.

### 3.9 Fuente de la verdad, dato por dato

| Dato | Fuente de la verdad | La plataforma… |
|---|---|---|
| Cotización, partidas, precio autorizado, `huellaAuth` | `al3d_historial` en el dispositivo que cotizó | **solo lee** |
| Cola de pendientes de autorizar | `al3d_queue` en ese dispositivo | **solo lee** |
| Que un proyecto se ganó | **Notion** (existe la fila) | crea la fila una vez |
| Dinero, estatus, cuenta, comisiones | **Notion** | espeja; PAGOS escribe vía puente |
| Fecha de instalación | **Notion** (`Fecha Instalacion`) | escribe; Calendar es copia |
| Ubicación (lat/lng) | **Notion** (`Lat`,`Lng`) | la calcula y la escribe una vez |
| Memoria técnica | **Notion** (cuerpo de página) | lee, y agrega bloques al final |
| Catálogo de precios de venta | **`index.html`** (`MATERIALES`, `RECORTES`, `BASTIDORES`, `CAJAS`) | lo lee tal cual, no lo duplica |
| Catálogo de materiales físicos y factores | **la plataforma** (`p3d_materiales` + Notion) | dueña |
| Constantes de taller | **la plataforma** (`p3d_constantes`) | dueña, y las calibra |
| Existencias | **derivadas** de movimientos | dueña del cálculo |
| Recordatorio | **derivado**; la entrega es de Google | dueña del cálculo |

Conflictos: la autoridad está particionada de forma que el traslape es casi vacío. Donde no lo es —`Fecha Instalacion`, que el director puede mover en Notion y en la agenda— cada mutación de la bandeja viaja con el valor que **esperaba** encontrar (`esperado`). Antes de escribir, el cliente relee la página; si el valor actual difiere, **la mutación no se aplica**: se aparca como `en conflicto` y se pinta en ámbar con las dos fechas y dos botones. Nunca hay sobrescritura silenciosa. Es concurrencia optimista con una relectura, cero infraestructura.

---

## 4. Cómo se deriva el material

Es el corazón. Entrada: `Snapshot Partidas` (o `al3d_historial[].items`). Salida: cantidades en **unidad de compra**.

### 4.0 Dos reglas antes de la primera fórmula

1. **Nunca derives material del importe.** `m2Total()` cobra `Math.max(m2, M2_MINIMO=1)`: una caja de 0.3 m² se **cobra** como 1 m² y se **fabrica** con 0.3 m². Para material se usa el área real. Y el `p*=0.8` de `!it.luz` es dinero: para material, `luz:false` significa **cero LED y cero fuentes**.
2. **`showInPdf===false` no filtra nada.** Esas partidas se cobran (van agrupadas como "Conceptos adicionales") y **se fabrican**. Un módulo de material que filtre por `showInPdf` deja de comprar la mitad de un letrero.

Y campos opcionales: el item que crea la IA (L5905) **no trae `matAuto`, `textoAuto` ni `ilumTipo`**. Todo se lee con default: `it.ilumTipo||'fria'`, `it.showInPdf!==false`.

### 4.1 Las constantes de taller (`p3d_constantes`)

Lo que hoy no existe en ningún sistema, propuesto como constante configurable con su derivación. **Ninguna se captura por proyecto.**

| Constante | Valor inicial | De dónde sale el valor inicial |
|---|---|---|
| `PERIM.recta` | **3.6** × altura | Contorno exterior de una mayúscula ≈ perímetro de su caja (2×(H + 0.75H) = 3.5H) × 0.9 = 3.15H. En español ~35 % de las letras tienen contraforma, que añade un contorno interior ≈ 0.55 del exterior (1.7H): 3.15 + 0.35×1.7 = **3.75H**, redondeado a 3.6 porque los nombres comerciales cargan a letras anchas y simples |
| `PERIM.cursiva` | **4.3** × altura | +20 %: la inclinación y los trazos de unión añaden contorno por unidad de altura |
| `PERIM.compleja` | **5.2** × altura | +45 %: puntas pronunciadas y remates añaden contorno sin añadir altura |
| `AREA_LETRA` | **0.30** × altura² | Caja de la letra 0.75H² × cobertura de tinta de una mayúscula (0.40) = 0.30H² |
| `AREA_RECORTE` | **0.55** × altura² | Un logotipo o silueta llena más su caja que una letra |
| `PROF_CANTO_F` | **0.12** → `prof = max(3, min(7.5, altura×0.12))` cm | Canal de retorno estándar: 3 cm en letra chica, 5 cm a 40 cm, 7.5 cm de tope. Una regla en vez de un campo |
| `PROF_CAJA` | **15** cm | Profundidad estándar de caja de luz al precio de $3,900/m² |
| `DENS_TIRA_FRONTAL` | **10** m/m² | Tiras cada 10 cm en cara iluminada de frente |
| `DENS_TIRA_CAJA` | **8** m/m² | La profundidad de 15 cm difunde más: tiras cada 12.5 cm |
| `HALO_F` | **0.90** | Tira perimetral posterior ≈ 90 % del perímetro (los remates no se cierran) |
| `LED_W_M` | **12** W/m | Tira 12 V de uso común |
| `FUENTE_W` | **60** W · `HEADROOM` **0.80** | 48 W útiles por fuente → 4 m de tira por fuente |
| `TRAVESANO_CM` | **60** cm | Un travesaño cada 60 cm en el lado largo del bastidor |
| `REMACHE_CM` | **15** cm | Un remache cada 15 cm de perímetro |
| `SEPARADORES_LETRA` | **4** | Cuatro separadores por letra a muro |

Las constantes van versionadas (`constantes_version`) para que un requerimiento viejo se pueda explicar con las constantes de su época.

### 4.2 Receta por tipo de partida

**`letras`** — cara de acrílico **siempre**, canto del material elegido, LED si `luz`. Esto no lo inventé: `descTxt` (L6031) dice *"Letras Individuales 3D: Caras en Acrílico, Cantos en {material}"* y la página "¿Cómo Cotizar?" de Notion dice *"Para letras (Caras en Acrílico – Cantos en Aluminio)"*. Dos fuentes independientes que coinciden.

```
perim_letra = PERIM[comp||'recta'] × altura                     // cm
prof        = max(3, min(7.5, altura × 0.12))                   // cm
canto_cm    = perim_letra × n                                    → material de canto según it.material
cara_m2     = AREA_LETRA × altura² × n / 10000                   → acrílico (grosor 3 mm si altura ≤ 40, 6 mm si no)
si material === 'acr-vinil':  vinil_m2 = cara_m2                 → vinil de corte
si luz:
   si material ∈ {acr-vol, acr-vinil}:  tira_m = cara_m2 × DENS_TIRA_FRONTAL   // frontal
   si material ∈ {al-paint, al-brush, acero}: tira_m = canto_cm × HALO_F / 100 // posterior
   fuentes = ceil(tira_m × LED_W_M / (FUENTE_W × HEADROOM))
separadores = SEPARADORES_LETRA × n
```
El canto se resuelve a la fila de catálogo por familia: `al-paint`→aluminio pintado, `al-brush`→aluminio brush, `acr-vol`/`acr-vinil`→aluminio pintado, `acero`→acero inoxidable espejo. `ilumTipo` (`fria`/`calida`) elige **la fila de tira**, no la cantidad: son dos SKU distintos y hoy nadie sabía cuál pedir.

**`recorte`**
```
sencillo : acrilico_m2 = AREA_RECORTE × altura² × n / 10000
vinil    : vinil_m2    = AREA_RECORTE × altura² × n / 10000        // sin acrílico: es rotulación
sandwich : acrilico_m2 = 2 × AREA_RECORTE × altura² × n / 10000     // dos caras
           tira_m      = (AREA_RECORTE × altura² × n /10000) × DENS_TIRA_FRONTAL
           fuentes     = ceil(...)
           separadores = 4 × n
```
`recComp` es complejidad de corte: **más horas de CNC, cero material adicional**. Se registra como nota, no como insumo.

**`bastidor`** — el único tipo con área física exacta.
```
m2      = ancho × alto / 10000                                   // ¡área REAL, no la cobrada!
lamina  = m2                                                     → bas==='lamina' ? galvanizada : alucobond
tubular = 2×(ancho+alto) + floor(max(ancho,alto)/TRAVESANO_CM) × min(ancho,alto)   // cm
remaches= ceil(2×(ancho+alto) / REMACHE_CM)
```
El tubular de 1" tampoco lo inventé: `descTxt` L6033 dice *"estructura tubular de 1\" forrada de …"*.

**`caja`**
```
m2_cara  = ancho × alto / 10000                                  // área real
acrilico = m2_cara
trasera  = m2_cara                                                → lámina galvanizada
marco_m2 = 2×(ancho+alto) × PROF_CAJA / 10000                     → lámina del mismo material
tira_m   = m2_cara × DENS_TIRA_CAJA                               // siempre fría: descTxt L6034
fuentes  = ceil(tira_m × LED_W_M / (FUENTE_W × HEADROOM))
si m2_cara > 1.5: tubular = 2×(ancho+alto)
```
`tarifa` distingue geometría (3900 estándar / 4600 nube‑silueta) y por eso la merma de anidado sube 10 puntos en el caso silueta. Si la tarifa es personalizada, no se puede inferir la geometría: se usa estándar y se marca el requerimiento como `aproximado`.

**`manual`** — cero material. La partida manual es "instalación, viáticos, rotulación vehicular u otros" (el propio `PROMPT_IA`, L5279). Se **excluye** y se lista aparte como "1 partida sin material calculable", que es honesto y no cuesta nada.

### 4.3 Conversión a unidad de compra

```
consumo_con_merma = consumo / (1 - merma_pct)
compra            = consumo_con_merma / factor
compra_redondeada = fraccionable ? ceil(compra × 4)/4 : ceil(compra)
```
Fraccionable = acrílico, láminas, vinil (se puede usar un retazo). No fraccionable = rollos, fuentes, cajas, bolsas, tramos.

### 4.4 El ejemplo del usuario, de punta a punta

**"8 letras de 40 cm de acero inoxidable"** (`tipo:'letras'`, `material:'acero'`, `comp:'recta'`, `luz:true`, `ilumTipo:'fria'`, `altura:40`, `n:8`). Venta: `$55 × 40 × 8 = $17,600`.

| Paso | Cuenta | Resultado |
|---|---|---|
| Perímetro por letra | 3.6 × 40 | 144 cm |
| Canto total | 144 × 8 | **1 152 cm lineales** |
| Profundidad de canto | max(3, min(7.5, 40×0.12)) | 4.8 cm |
| Con merma 15 % | 1 152 / 0.85 | 1 355 cm |
| Láminas de acero (factor 5 856) | 1 355 / 5 856 | 0.23 → **1 lámina** (rinde para ~4 trabajos así) |
| Cara de acrílico | 0.30 × 40² × 8 / 10 000 | **0.384 m²** |
| Con merma 35 % | 0.384 / 0.65 | 0.591 m² |
| Láminas de acrílico 3 mm (factor 2.9768) | 0.591 / 2.9768 | 0.20 → **0.25 de lámina** (fraccionable: usa retazo) |
| Tira LED (acero → posterior) | 1 152 × 0.90 / 100 | **10.4 m** |
| Con merma 5 %, rollos de 5 m | 10.9 / 5 | 2.19 → **3 rollos** |
| Fuentes | ceil(10.4 × 12 / 48) | **3 fuentes** |
| Separadores | 4 × 8 = 32, bolsa de 50 | **1 bolsa** |

Y la pantalla no dice "0.23 láminas": dice **"Falta 1 lámina de acero inoxidable — hay 0 en el taller"**, o **"Alcanza: hay 1 lámina abierta con 4 200 cm"**, que es la pregunta real.

### 4.5 Lo que hace falta y no existe — y cómo se captura con el mínimo esfuerzo

| Falta | Decisión |
|---|---|
| Profundidad de canto por proyecto | **No se captura.** Regla `altura × 0.12` acotada a [3, 7.5]. Un proyecto raro se corrige en el requerimiento, no en la cotización |
| Ancho / área del glifo | **No se captura.** Constantes `AREA_LETRA` y `PERIM[comp]`. Si algún día `textoAuto` viene lleno (hoy es opcional y la IA no lo pone), el derivador puede medir glifo por glifo con `canvas.measureText()` y **sin pedir nada** al usuario. Camino abierto, no requisito |
| Grosor de acrílico | **Se deriva** de la altura (≤40 cm → 3 mm) |
| Profundidad de caja | Constante `PROF_CAJA=15` |
| Densidad de LED y fuentes | Constantes, con la aritmética a la vista |
| Costo unitario y proveedor | **Se captura una vez por material, cuando se compra**, en la pantalla de material: 17 filas, no 199 proyectos. Y es **opcional**: sin costos la plataforma da cantidades, que es el 80 % del valor. `Gastos - AL3D` ya tiene las categorías `Laminas`, `Iluminacion`, `Graficos`, `Maquila` — el primer costo se puede sembrar de ahí ($33,280 en 11 gastos de láminas) |
| Consumibles (solvente, silicón) | **No se derivan por proyecto.** Se controlan por mínimo de reposición. Derivar 0.02 L de solvente por trabajo es precisión falsa |

### 4.6 Calibración: el dato que se mide en vez de teclearse

Esta es la respuesta a "todo campo manual se queda vacío". Las constantes **no dependen de que alguien las afine**: se afinan solas.

Cada vez que FABRICACIÓN corrige una `salida` derivada (`tipo:'ajuste'` con `cantidad_real`), la plataforma guarda la razón `real/calculado` por familia de material. Al quinto ajuste sobre la misma familia, la pantalla de inicio muestra una fila:

> El acrílico rinde 18 % menos de lo calculado en los últimos 6 proyectos. Subir la merma de 35 % a 41 %. **[Actualizar]**

Un toque. Y si nadie lo toca nunca, el sistema sigue funcionando con los valores del repo y con su error conocido a la vista. **Ninguna constante es un campo obligatorio.**

---

## 5. Arquitectura de archivos

```
/                              GitHub Pages, rama main, sin build, sin bundler
├── index.html                 EL COTIZADOR. Sigue en producción. Dos inserciones, ~45 líneas
├── plataforma.html            cascarón único de los 5 módulos nuevos (rutas por hash)
├── sw.js                      CACHE 'al3d-v2'
├── manifest.webmanifest       + shortcuts a #/hoy, #/material, #/agenda
├── manifest-plataforma.webmanifest   id propio, start_url ./plataforma.html#/hoy
├── al3d-sistema.css           tokens :root + componentes compartidos
├── logo-al3d.png / -dark.png  intactos
├── js/
│   ├── nucleo.js              $, esc(), money(), ico(), toast(), _CAPAS, _ABRIBLE, prefGet/Set
│   ├── almacen.js             claves p3d_*, espejo, bandeja de salida, respaldo propio
│   ├── puente.js              cliente del Worker: reintento, Retry-After, /salud, cola
│   ├── notion-mapa.js         TRADUCCIÓN propiedad Notion ⇄ dominio. Todo el esquema, aquí
│   ├── cotizacion.js          lee al3d_historial / al3d_queue. CERO escrituras
│   ├── material-catalogo.js   semilla de 17 materiales + constantes de taller
│   ├── material-derivar.js    partidas → requerimiento. El §4 en código
│   ├── material-stock.js      movimientos, existencia = conteo + Σ, mínimos
│   ├── agenda.js              fechas, ventanas, duración
│   ├── ics.js                 generador RFC 5545, plegado por OCTETOS
│   ├── gcal.js                GIS token model, eventos con id determinista
│   ├── geo.js                 parseGmaps() + Nominatim con cola 1 req/s + caché p3d_geo
│   ├── mapa.js                Leaflet, TILES configurable (osm | carto | google)
│   ├── reglas.js              las 12 automatizaciones, una función PURA por regla
│   └── ui-inicio.js  ui-proyectos.js  ui-agenda.js  ui-material.js  ui-mapa.js
├── vendor/leaflet/            leaflet.css, leaflet-src.esm.js, images/  (vendorizado)
└── puente/
    ├── worker.js              NO se publica. Se pega en el editor de Cloudflare
    └── README.md              runbook de 3 líneas por falla
```

**Cómo se carga sin build.** `plataforma.html` trae `<script type="module" src="js/ui-inicio.js">` y los módulos se importan por ruta relativa. ESM nativo, GitHub Pages sirve `.js` como `text/javascript`, no hace falta nada más. Advertencia real: **ESM no funciona por `file://`** (los módulos exigen origen), así que probar en local requiere un servidor; el cotizador, que es script inline, sigue abriéndose por doble clic. Leaflet 1.9.4 quitó el entrypoint ESM del `package.json`: hay que importar `leaflet-src.esm.js` explícito y **con namespace import** (`import * as L`, no `import L` — no hay default export), y vendorizado, no desde unpkg: así el service worker lo cachea como mismo origen, la app abre sin señal, y desaparece el problema del hash SRI que no pude verificar.

**Un solo `plataforma.html` y no cinco HTML.** Con rutas por hash, navegar entre módulos sin señal no toca la red nunca; el service worker cachea un solo documento de navegación; el registro `_CAPAS` de modales vive en un lugar; y GitHub Pages no necesita el truco del `404.html`.

**`al3d-sistema.css`.** Fase 1: es una copia de la capa compartida de `index.html` (variables `:root` + los componentes del §2 de la especificación de UI, en el orden de capas correcto: estructura → teléfono → puntero → **capa de barro** → cierre → print). No se toca `index.html`. Fase 2, cuando haya ganas y en un commit aparte: se sustituye el `<style>` inline por un `<link>` a ese mismo archivo, verificable porque es una extracción literal. La duplicación temporal está acotada porque los módulos nuevos solo usan tokens y componentes ya estabilizados.

**`index.html`, las dos únicas inserciones:**
1. Topbar: un `.btn-hist` gemelo, "Plataforma", que abre `plataforma.html#/hoy`. ~6 líneas.
2. Modal `#rv-modal-bg` (L9999): junto al botón que ya existe —`Copiar fila para Google Sheets`, `copiarFilaVenta()` L8769— un segundo botón **`Crear proyecto ganado`**. Ese modal ya arma exactamente las 15 columnas de `Ventas - AL3D` en el orden correcto; lo único que falta es que en vez de ir al portapapeles vaya al puente. **El botón de copiar se queda para siempre** como escape manual. ~35 líneas. Y de paso una corrección que hay que nombrar: su `<select id="rv-estatus">` ofrece `ANTICIPO / LIQUIDADO / CANCELADO / PENDIENTE`, y los valores reales del status de Notion son `REPARANDO / COBRANDO / FABRICACION / LIQUIDADO`. Hoy ese select produce filas con un estatus que Notion no tiene. El botón nuevo usa los cuatro valores reales.

**Service worker.** Cambios mínimos, misma filosofía:
- `const CACHE='al3d-v2'` — el handler de `activate` ya purga las versiones viejas.
- `BASICOS` suma `plataforma.html`, `al3d-sistema.css`, los 16 módulos de `js/`, y `vendor/leaflet/`. Se siguen guardando de uno en uno (`c.add(u).catch(()=>null)`): si falta un archivo, la instalación no se cae entera.
- La regla `if (url.origin !== self.location.origin) return;` **se queda intacta, y es importante que se quede.** Hace tres cosas gratis: no cachea las llamadas a las APIs de IA (razón original), no cachea el puente (así el estado nunca se sirve viejo), y **no cachea los tiles de OSM** — que es justo lo que exige su política de uso, donde precargar o archivar tiles está explícitamente prohibido. Que nadie "mejore" el SW cacheando tiles: sería una violación de la política y la forma más rápida de que nos corten.
- Se añade `plataforma.html` como respaldo de navegación cuando el `req.mode==='navigate'` empieza por `/plataforma`.
- **El SW no da datos sin señal, y no debe intentarlo.** Los datos offline vienen de `p3d_espejo` en localStorage. Separación limpia: el SW sirve la app, el espejo sirve los datos.
- **No añadir `<meta name="referrer">` restrictivo ni CSP con `referrer no-referrer`.** Verificado: `index.html` hoy no tiene ninguno de los dos. Las políticas de OSM y de Nominatim exigen un `Referer` válido desde páginas web; poner `no-referrer` es violación explícita y motivo de bloqueo.

**z-index** (la pila está casi agotada; se documentan los huecos elegidos): `.mapa-wrap` → `isolation:isolate` con `.leaflet-container{z-index:0}` dentro, porque los controles de Leaflet usan 400–1000 y perforarían la topbar; panel lateral del mapa → **40** (entre `.mbar` 45 y `.topbar` 30); cajón de faltantes → **50**; modal de pantalla completa de material → **58** (entre `.vt-modal-bg` 56 y `.modal-bg` 60), dado de alta en `_CAPAS` y con el patrón `.hist` de `history.pushState` para el botón atrás del teléfono.

**Dos empresas.** El usuario está abriendo una segunda empresa del mismo rubro. Es una línea de configuración ahora y un rediseño después: `js/config.js` con `EMPRESAS = [{id, nombre, logo, prefijo_folio:'COT-', notion_database, calendarios}]`, y `p3d_empresa` en el dispositivo. El prefijo de folio de AL3D se conserva; la empresa nueva estrena el suyo. Ignorarlo hoy significa que el día que exista la segunda base de Ventas, todos los ids del espejo, de los movimientos y de los requerimientos hay que reescribirlos.

---

## 6. Los seis módulos

Convención transversal: el dispositivo de FABRICACIÓN arranca con `body.precios-ocultos`, que **ya existe** en el cotizador (`aplicarBlurPrecios()`, líneas 217–252) y difumina importes sin bajar el contraste del texto. No se inventa un modo nuevo: se reutiliza el que ya se resolvió.

### 6.1 Inicio / recordatorios — `#/hoy`
Filas calculadas, ordenadas por lo que se rompe primero. Todo desde `p3d_espejo`, así que abre sin señal.

- **DIRECCIÓN:** instalaciones de hoy y mañana · cotizaciones autorizadas de hace >7 días que nunca se volvieron proyecto (con su importe: es dinero en la mesa) · proyectos ganados sin fecha · material faltante para lo que se instala en ≤7 días · cobranza con `Pago Pendiente > 0` · comisiones con `Comision Restante > 1` (mismo filtro que su vista *Comisiones Pendientes*) · estado del puente y de la bandeja.
- **FABRICACIÓN:** cola por `Etapa` · cortes de hoy · faltantes de material con la lista de compra · avisos de mínimo de stock · la fila de calibración. Sin dinero.
- **PAGOS:** anticipos por cobrar · liquidaciones vencidas · comisiones pendientes · lista de compra por pagar al proveedor, con costos. Sin stock, sin cortes, sin mapa.

### 6.2 Proyectos — `#/proyectos`
Tablero por `Etapa` (no por `Estatus`: son ejes distintos, y mezclarlos es cómo se corrompe una vista que ya funciona).
- **DIRECCIÓN:** todos. Acción exclusiva: **registrar una cotización autorizada como proyecto ganado** (el puente). Edita fecha, ubicación, nombre.
- **FABRICACIÓN:** de `GANADO` a `LISTO`. Ve la memoria técnica, el `Snapshot Partidas` renderizado como orden de trabajo (medidas, piezas, material, temperatura de LED) y el requerimiento. Avanza `Etapa` con un toque, que es lo que dispara las salidas de stock.
- **PAGOS:** solo los que tienen `Pago Pendiente > 0` o `Comision Restante > 1`. Escribe `Anticipo`, `Liquidacion`, `Abono Comision`, `Estatus`, `Cuenta `.

### 6.3 Agenda — `#/agenda`
Mes, semana y lista. Los tres roles leen; solo DIRECCIÓN escribe fechas.
- **DIRECCIÓN:** arrastra una fecha, elige ventana (mañana/tarde/**nocturna**), y al soltar se escribe `Fecha Instalacion` en Notion y se crea/actualiza el evento de Calendar. Exporta `.ics` por evento o por semana.
- **FABRICACIÓN:** el mismo calendario, coloreado por "material completo / falta material / sin calcular". Su pregunta no es "cuándo", es "¿llego?".
- **PAGOS:** solo los días donde se espera un cobro.

### 6.4 Material — `#/material`
Es la pantalla de FABRICACIÓN, que es quien se encarga de cortes, materiales y logotipos.
- **FABRICACIÓN:** catálogo (17 filas), existencias, conteo, movimientos, requerimiento por proyecto, y **lista de compra consolidada de todo lo que se instala en los próximos 14 días** — que es la pregunta que hoy nadie puede contestar. Edita constantes de taller y acepta las calibraciones.
- **DIRECCIÓN:** los mismos números con costos y el valor del inventario. Y, cuando `costo_unitario` esté lleno, el margen real por proyecto, que hoy no existe en ninguna parte: `Gastos - AL3D` no tiene desglose por proyecto.
- **PAGOS:** solo la lista de compra con costos, proveedor y marca de "pagado".

### 6.5 Mapa — `#/mapa`
Leaflet vendorizado, tiles de `tile.openstreetmap.org` (`maxZoom:19`) con atribución obligatoria, y `TILES` en configuración con `carto` y `google` ya declarados y sin implementar, como pidió. Pines por `Lat`/`Lng`; los `SIN UBICAR` van en una lista aparte con un botón "ubicar" que geocodifica **uno**, con la cola de 1 req/s.
- **DIRECCIÓN:** todos los pines, coloreados por `Etapa`, filtro por fecha, y orden de ruta de un día (el orden se calcula por vecino más cercano en el cliente: nada de API de rutas).
- **FABRICACIÓN:** solo las instalaciones del día, para saber a dónde va la camioneta.
- **PAGOS:** no tiene mapa. No hay nada que hacer ahí.

### 6.6 Cotizador — `index.html`
Intacto. Un botón nuevo en la topbar y un botón nuevo en el modal de Registrar Venta. Los tres roles pueden abrirlo (el rol de la cotización, `Q.rol`, sigue siendo vendedor/autorizador y no se mezcla con el rol del dispositivo: son cosas distintas y el código ya las tiene separadas).

---

## 7. Automatizaciones

**Decisión central que las hace posibles:** no programamos recordatorios, **programamos eventos**. En el momento en que se fija `Fecha Instalacion`, se crean de golpe **todos** los eventos futuros de ese proyecto, con sus `reminders.overrides`. A partir de ahí Google los dispara sin que nadie abra nada. Lo único que necesita un dispositivo en línea es *reevaluar* la condición y, si cambió, borrar o parchar el evento. Y el sesgo es explícito: **preferimos el falso positivo.** Un aviso de más cuesta diez segundos; un aviso de menos cuesta un día de instalación.

Cuatro calendarios compartidos: `AL3D · Instalaciones`, `AL3D · Fabricación`, `AL3D · Compras`, `AL3D · Cobranza`. Cada rol se suscribe a los suyos.

| # | Regla | Disparador | Recibe | Canal | Qué la hace posible |
|---|---|---|---|---|---|
| 1 | **Cotización autorizada que nunca se volvió proyecto** | entrada de `al3d_historial` con `ts` > 7 días y sin `Folio Cotizacion` en el espejo | DIRECCIÓN | fila en inicio + evento de todo el día "Dar seguimiento a COT‑0007 · $12,480" | Cruce local `al3d_historial` × `p3d_espejo`. **Cero infraestructura.** Es el eslabón que falta, hecho visible |
| 2 | **Proyecto ganado sin fecha (48 h)** | `Etapa=GANADO` y `Fecha Instalacion` vacía | DIRECCIÓN | fila en inicio + evento de todo el día | Barrido del espejo |
| 3 | **3 días antes: falta material** | al fijar la fecha se crea el evento en `Fecha Instalacion − 3d`; al recalcular, si el requerimiento ya está cubierto **se borra** | FABRICACIÓN + DIRECCIÓN | Calendar `AL3D · Fabricación`, `overrides` popup a `-P1D` y `-PT0M`. Título: *"FALTA MATERIAL: 1 lámina acrílico — Healthylicious, instala el 14"* | Evento creado por adelantado con `eventId` determinista → idempotente. Suena en el teléfono de fabricación **aunque nunca abra la plataforma**. Ésta es la regla por la que gana Google Calendar |
| 4 | **7 días antes: comprar** | `Fecha Instalacion − 7d`, si hay faltantes | FABRICACIÓN + PAGOS | Calendar `AL3D · Compras`, con la lista en la `description` en unidades de compra ("2 láminas acrílico 3 mm, 3 rollos tira LED 6500 K, 3 fuentes") | El derivador ya convierte a unidad de compra. La descripción del evento es el texto que se manda al proveedor |
| 5 | **Día de instalación** | el evento mismo | DIRECCIÓN + FABRICACIÓN, y **los instaladores** | Calendar `AL3D · Instalaciones` con `-P1D` y `-PT30M` (o `-PT120M` si `Ventana=NOCTURNA`) + botón que abre `wa.me/<tel>?text=…` con dirección, medidas y piezas | El WhatsApp es un `<a>`, cero infraestructura, y es cómo los instaladores reciben la orden sin tener cuenta. La app ya tiene el estilo `.btn-wa` y el número en `EMPRESA` |
| 6 | **Se pasó la instalación y sigue sin marcar INSTALADO (+2 d)** | `Fecha Instalacion` < hoy−2 y `Etapa ≠ INSTALADO` | DIRECCIÓN | fila en inicio | Barrido del espejo |
| 7 | **Instalado y con saldo (+3 d)** | `Etapa=INSTALADO` y `Pago Pendiente > 0` | PAGOS | Calendar `AL3D · Cobranza`, evento semanal recurrente hasta que el saldo sea 0 | **`Pago Pendiente` es una fórmula que ya existe en Notion.** No se recalcula: se lee. Y la recurrencia la lleva Google con `RRULE`, no nosotros |
| 8 | **Comisión pendiente** | `Comision Restante > 1` y `Estatus=LIQUIDADO` | PAGOS | Calendar `AL3D · Cobranza` | Mismo filtro que su vista *Comisiones Pendientes*, reutilizado |
| 9 | **Stock bajo mínimo** | después de cualquier `salida`, `existencia < min_stock` | FABRICACIÓN | fila en inicio; evento de Calendar **solo si bloquea un proyecto a ≤14 días** | Cálculo local sobre el libro de movimientos. No todo aviso merece sonar |
| 10 | **Constante desviada** | 5+ ajustes en la misma familia con desviación media >15 % | FABRICACIÓN | fila en inicio con un botón que la actualiza | El bucle de calibración de §4.6 |
| 11 | **Puente caído o bandeja atorada** | `/salud` falla 2 veces, o hay mutaciones de >24 h | quien abra la app | franja ámbar (patrón `.cand-partidas`, con latido) + botón **"Copiar fila para Notion"** | El escape manual es `copiarFilaVenta()`, que **ya está construido y probado en producción** |
| 12 | **Instalación nocturna** | `Ventana=NOCTURNA` | todos los del evento | el mismo evento, con aviso a `-PT120M` | Derivado con un regex `/nocturn/i` sobre el cuerpo de la página. Un dato que ya estaba escrito, leído sin pedirle nada a nadie |

Honestidad sobre el hueco: las reglas 1, 2, 6, 9, 10 y 11 son **de pantalla**: si nadie abre la plataforma en cinco días, nadie las ve. No hay cron. Se podría montar uno con GitHub Actions, pero no sirve para el paso que importa: un cron no puede crear eventos en el Calendar personal del director sin un refresh token de servidor, que es justo lo que el token model no da. Por eso las reglas que **tienen** que llegar a un teléfono (3, 4, 5, 7, 8) son eventos creados por adelantado, y las de pantalla son las que se pueden esperar. Está dicho, no escondido.

---

## 8. Riesgos y límites

**El material solo funciona para lo que se cotice con el cotizador, de hoy en adelante.** Ninguno de los 199 proyectos de Notion tiene partidas: se cotizaron con la regla de la página "¿Cómo Cotizar?" o de palabra. Los 16 proyectos vivos hoy (9 `FABRICACION`, 6 `COBRANDO`, 1 `REPARANDO`) **no tienen BOM y no lo van a tener** salvo captura manual. *Qué ve el usuario:* esos proyectos aparecen con la ficha "sin partidas — material no calculable" y un botón para armar el requerimiento a mano. Es el precio de no inventar datos.

**Divergencia de catálogos, no la arreglamos.** La página de Notion cobra por tipo de letra ($30 sin luz / $35 recta / $40 puntas / $50 manuscrita, −20 % sin iluminación); el cotizador cobra por **material** ($30 al pintado … $55 acero) más $5 cursiva o $10 compleja. **Manda el catálogo del cotizador.** *Qué ve el usuario:* nada, hasta el día que compare un precio de la plataforma con el ejemplo de su propia página de Notion y no cuadren. Está avisado aquí y debería estar avisado en la pantalla de constantes.

**Y el hueco documental que sigue abierto:** la regla escrita solo cubre letras. No hay fórmula para cajas de luz, vinil, neón flex, recorte de acrílico ni panel Alucobond, y esos trabajos **sí se venden** (aparecen en los nombres de los proyectos: *"Caja Luz Mostrador"*, *"Panel Alucobond"*, *"Neón Flex «Enjoy»"*). El cotizador cubre caja, recorte y bastidor; **neón flex no lo cubre nadie** y se seguirá cotizando a mano como partida manual, sin material derivable.

**Latencia.** Notion suele responder en 300–900 ms; el Worker añade 30–80 ms (estimaciones, no medidas en esta sesión). Un toque de "Crear proyecto ganado" tarda alrededor de un segundo con 4G bueno y bastante más con 4G malo. *Mitigación:* escritura optimista + bandeja. *Qué ve el usuario:* el proyecto aparece en su lista al instante, con un punto "por subir". Si falla, el punto se vuelve ámbar y dice por qué. **Nunca desaparece en silencio.**

**Límite de escritura de Notion.** La cifra documentada es un promedio de ~3 peticiones por segundo por integración, con `429` y `Retry-After` (documentada, no verificada en esta sesión). Nuestro peor caso realista: crear un proyecto son 2–3 llamadas; vaciar una bandeja de 20 mutaciones son ~60 llamadas, unos 20 segundos. Cabe de sobra. La bandeja **debe** respetar `Retry-After` y hacer retroceso exponencial, y por eso se sube de una en una y no en paralelo. Límites de tamaño que sí muerden: 2 000 caracteres por objeto `rich_text` y 100 bloques hijos por petición → `Snapshot Partidas` se parte en trozos de ≤1 900, y si aun así no cabe (una cotización de 15 partidas), se guarda solo el requerimiento ya calculado y se marca `snapshot: parcial`.

**Ediciones simultáneas.** Partición de autoridad + relectura con `esperado` + conflictos aparcados. *Qué ve el usuario:* "El proyecto Healthylicious cambió en Notion mientras no tenías señal. Tu cambio de fecha (14 sep) no se aplicó; en Notion dice 16 sep." con dos botones. Lo que **no** ve nunca es su cambio desaparecido sin aviso. Riesgo residual honesto: si el mismo dato se edita en dos dispositivos con el puente caído en los dos, el segundo en subir se aparca; nadie pierde datos, pero alguien tiene que decidir.

**Quién arregla el puente.** Nadie en AL3D. Por eso el Worker no tiene estado, ni base, ni dependencias, y por eso su caída **no puede** dejar una pantalla en blanco: la app sigue leyendo del espejo (ayer) y acumulando en la bandeja. Fallas reales y su arreglo:
1. *Cloudflare caído* — no se hace nada, la app sigue. 100 000 req/día es ~100 veces lo que necesitamos.
2. *Token de Notion revocado o caducado* — se regenera en Notion y se pega en **el editor web del dashboard de Cloudflare**. Sin laptop, sin node, sin `wrangler`. Ese es el motivo de que el Worker sea 60 líneas pegables.
3. *Alguien renombró una propiedad de Notion* — el Worker responde 403 nombrando la propiedad ofensora y se corrige una constante en `js/notion-mapa.js`, empujando a `main`. **Cero herramientas.** Por esto el Worker es un reenviador tonto con lista blanca y la traducción del esquema vive en el repo, y no al revés.
4. *El puente no vuelve nunca* — el negocio sigue exactamente como hoy: el botón "Copiar fila para Google Sheets" que ya existe, pegado a mano en Notion. **Ese camino no se retira jamás.**

**Tiles de OSM.** No hay límite numérico publicado y no hay SLA: *"Access may be blocked, without notice, if your usage degrades the service"*, y advierten específicamente a los servicios comerciales de que el acceso puede retirarse en cualquier momento. Cumplimos los requisitos técnicos (Referer válido, sin `no-cache`, atribución, sin bulk download) por construcción. *Qué ve el usuario si nos cortan:* fondo gris con los pines encima, correctos, porque los pines son nuestros datos. Se cambia `p3d_tiles` a `carto` (5 M peticiones/mes, el único free tier verificado que no está restringido a uso no comercial) y vuelve el mapa. Un renglón.

**Nominatim.** 1 req/s absoluto, caché obligatoria, y **autocompletar desde el cliente está prohibido explícitamente**: el input de ubicación es un botón, no un buscador que se dispara al teclear. El relleno inicial de las 199 filas son ~4 minutos a 1 req/s desde una sola máquina. *Qué ve el usuario en fallo:* el proyecto queda `SIN UBICAR` en una lista aparte, no un pin en medio del océano.

**Enlaces cortos de Maps.** `maps.app.goo.gl` es imposible de expandir desde el navegador: la respuesta 30x no lleva `Access-Control-Allow-Origin`, y en `no-cors` la respuesta es opaca (lista de headers vacía por especificación). *Qué ve el usuario:* "Ese es un link corto y el navegador no puede abrirlo. Ábrelo, espera el mapa y copia el link de la barra." Con el puente disponible, el endpoint `/expandir` lo hace solo.

**Google OAuth.** Con `publishing status: Testing` y tres personas nos sobran los 100 test users, no hay verificación y no hay que publicar. Precio: la pantalla **"Google hasn't verified this app"**, una vez por persona, con Advanced → Go to (unsafe). Si el correo es de Google Workspace y no `@gmail.com`, la pantalla de consentimiento se configura como **Internal** y ese aviso desaparece. El token vive ~1 hora, no hay refresh token, y la renovación silenciosa exige sesión de Google activa. *Qué ve el usuario cuando falla:* un botón "Conectar Google Calendar" y, mientras tanto, la descarga de `.ics`, que no necesita nada.

**localStorage.** El cotizador ya pelea por espacio (`saveHistorial` va soltando `aiFile.url` de la más antigua a la más nueva hasta que quepa; `AI_FILE_MAX = 2_000_000`). El espejo de 199 proyectos sin cuerpos de página pesa ~80 KB: trivial. Pero va en clave **separada** a propósito, con la misma lógica que ya justifica `al3d_aifile` fuera de `al3d_q`: si algo no cabe, que se pierda el espejo —recuperable de Notion— y nunca el historial, que es irrecuperable. Los cuerpos de página se cargan por proyecto, bajo demanda.

**Folios repetidos entre dispositivos.** `al3d_folio` es local: dos teléfonos generan `COT-0008` en paralelo. La clave del puente es `dispositivo:folio` y la pantalla muestra `COT-0008 · D7K`. Además el Worker consulta antes de crear y rechaza un `Folio Cotizacion` duplicado: el choque se vuelve un error visible, no dos proyectos.

**Fechas del cotizador.** `fecha`, `fechaAuth` y `entrega` son texto en español (`'22 ago 2026'`, `'Viernes 15 de Agosto'`, sin año). El único valor comparable es `ts` (epoch ms) **y se sobrescribe** cada vez que la entrada se reguarda: no es "fecha de autorización original". La plataforma nunca parsea `entrega`: la muestra como texto y pide la fecha de instalación aparte. Es la única captura humana real de todo el diseño, y es una fecha que ya tenían que escribir en Notion.

---

## 9. Fases

### Fase 0 — hoy, sin cuentas, sin llaves, sin desplegar nada
Entregable: `plataforma.html` con **material, agenda y mapa funcionando solo con lo que ya está en el teléfono**.
- Catálogo semilla de 17 materiales con sus factores de conversión y su `factor_origen`, y las 15 constantes de taller, editables.
- El derivador completo (§4) corriendo sobre `al3d_historial` **del propio dispositivo**. Resultado tangible el primer día: se abre una cotización autorizada del historial y la pantalla dice *"1 lámina de acero inoxidable, 0.25 de lámina de acrílico 3 mm, 3 rollos de tira LED 6500 K, 3 fuentes, 1 bolsa de separadores"*.
- Stock: conteo inicial, movimientos, mínimos, existencias. Local.
- Agenda leyendo el historial, con **descarga de `.ics`** (UTC, sin `VTIMEZONE`, para eliminar de un golpe toda la clase de bugs de zona horaria; México está fijo en UTC−6 desde el 30/oct/2022, sin horario de verano).
- Mapa con Leaflet vendorizado y los pines que salgan de `parseGmaps(Q.maps)` — sin red, sin geocodificar.
- Service worker `al3d-v2`. Todo abre sin señal.
- Los dos botones nuevos en `index.html`, con el de "Crear proyecto ganado" deshabilitado y su nota: *"Falta configurar el puente a Notion."*

**Lo que ya sirve sin nada más:** saber qué comprar antes de cortar, y ver dónde están las obras. Eso es el 60 % de lo que pidió.

### Fase 1 — una cuenta de Google, diez minutos de clics
Lo que tiene que hacer el usuario: crear un proyecto en Google Cloud, habilitar Calendar API, crear un **OAuth Client ID de tipo Web** con `https://<usuario>.github.io` en *Authorized JavaScript origins* (el origen, sin ruta), dejar el estado en **Testing** y agregarse él y sus dos compañeros como test users; crear los cuatro calendarios y compartirlos. Después: pegar el Client ID en la pantalla de configuración de la plataforma.
Se enciende: las reglas 3, 4, 5, 7, 8 y 12 — los recordatorios que suenan en el teléfono. **No hay secreto de cliente y no hay que publicar la app.** Si su correo es de Workspace, la pantalla de "app no verificada" desaparece configurando el consentimiento como Internal.

### Fase 2 — el puente
Lo que tiene que hacer el usuario, una vez, ~20 minutos:
1. Crear la integración interna en Notion y **compartirle la página "Finanzas - AL3D (ELIAS)"**.
2. Cuenta gratis de Cloudflare → crear un Worker → **pegar `puente/worker.js` en el editor del navegador** → guardar el token de Notion como *secret*. Sin node, sin `wrangler`, sin terminal.
3. Crear en `Ventas - AL3D` las **siete propiedades nuevas**. La plataforma detecta las que faltan y muestra la lista con nombre y tipo exactos, listos para copiar. La plataforma **no altera el esquema por API**, a propósito: es la única forma de garantizar que no se rompan las siete vistas ni las cinco fórmulas.
4. Pegar la URL del Worker y el token del dispositivo en la configuración de cada uno de los tres teléfonos.

Se enciende: el puente cotización→proyecto, el espejo, la bandeja de salida, el tablero por `Etapa`, la escritura de fechas y de dinero por rol, y las reglas 1, 2, 6, 9 y 11. Y en la primera sincronización, la **siembra** de `Fecha Instalacion` desde `Fecha Anticipo e Instalacion` para que las 199 filas no nazcan en blanco.

### Fase 3 — cuando haya ganas
- Relleno de coordenadas de los 199 proyectos: Nominatim, 1 req/s, ~4 minutos, desde una pestaña, una sola vez. Después el mapa tiene tres años de historia encima y se vuelve una herramienta comercial: *"ya instalamos cuatro anuncios en esta plaza"*.
- Costos y proveedores por material (17 filas), sembrados de las categorías `Laminas`, `Iluminacion`, `Graficos`, `Maquila` de `Gastos - AL3D`. Da lo que hoy no existe: **margen real por proyecto**.
- Cambio de tiles a Google Maps: un renglón de `p3d_tiles`, la estructura ya está.
- Extraer el `<style>` de `index.html` a `al3d-sistema.css` en un commit que no cambia un píxel.
- Segunda empresa: `EMPRESAS[1]` con su prefijo de folio, su base de Ventas y su logotipo.

**Y una cosa que no está en ninguna fase, porque no se va a hacer:** migrar los 199 proyectos fuera de Notion. Esa es la tesis, y todo lo de arriba está diseñado para que nunca haga falta.