# Mapa 03 — Almacén, Catálogo de material y Listas de compra

Alcance: hojas «Almacén», «Catálogo de material», «Listas de compra»; rutas `/empujar_almacen` y `/jalar_almacen`; cliente `js/datos/stock.js`, `js/datos/material.js` y la parte de sincronización de `js/datos/sync.js`, `js/datos/puente.js`, `js/datos/db.js`, `js/datos/proyectos.js`; prueba `pruebas/puente-almacen.mjs`.

Repo: `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase` (rama desde main, con PR #99). Versión del puente: `PUENTE_VERSION = 'puente-sheets-14'` (`puente/hoja-apps-script.gs:1881`). El almacén en la hoja existe desde `puente-sheets-9` (commit `9f2846a`, 2026-10-01).

Convenciones: `.gs` = `puente/hoja-apps-script.gs`. Cuando una afirmación no la pude confirmar en el código lo digo como NO CONFIRMADO. Las columnas «tipo PG sugerido» son mías, no están en el código.

---

## 0. Resumen de 12 líneas

1. Tres entidades con tres pestañas: `movimientos` -> «Almacén» (append-only), `materiales` -> «Catálogo de material», `requerimientos` -> «Listas de compra» (`.gs:5277-5360`).
2. Un único transporte para las tres: POST `ruta:"empujar_almacen"` (hasta 25 ops, bajo candado) y `ruta:"jalar_almacen"` (todo lo que tenga `Secuencia` mayor que `desde`, páginas de 1500) (`.gs:2259-2260`, `5597`, `5752`).
3. Idempotencia del libro: el id del movimiento lo pone el teléfono; la hoja lo busca ANTES de escribir y contesta `ya_estaba` (`.gs:5665`). La salida derivada del corte usa id determinista `mov-salida:<requerimiento.id>` (`proyectos.js:1178`).
4. Catálogo y listas se escriben CAMPO POR CAMPO con sello por campo (columna «Sellos»): un cambio con sello más viejo no pisa (`.gs:5695`); `consumido` nunca retrocede (`.gs:5590-5594`).
5. Roles: Dirección todo. Fabricación escribe todo menos costos (se ignoran en silencio, tampoco los recibe). Pagos LEE todo (con costos) y solo escribe la salida `derivado` y marcar un requerimiento `consumido` (`.gs:5537-5553`).
6. La pantalla Material no existe para Pagos (`app.js:73`), pero la API sí le entrega todo el almacén.
7. El cliente recalcula existencias, comprometido y lista de compra escaneando el libro local COMPLETO (`stock.js:266-269`, `653-657`): cada cliente necesita el libro entero.
8. Dato de dinero dentro del almacén: solo dos campos, `costo_total` (movimiento) y `costo_compra` (material) (`.gs:5263`).
9. `constantes` del taller NO viajan (puente.js:236-240): son por dispositivo y sus ops quedan apartadas `sin_destino` para siempre.
10. Volumen: el libro es la única tabla que crece sin techo; el orden de magnitud esperado es de unos miles de renglones al año (estimación, NO CONFIRMADO el conteo real). Catálogo ~19 filas.
11. El catálogo de la hoja es un SUBCONJUNTO: `sembrar()` no encola nada (`material.js:501-551`); solo llegan los materiales que alguien editó.
12. Riesgo mayor de diseño: hoy SOLO el teléfono dueño del proyecto con partidas emite la salida del corte (las tarjetas importadas `proy-hoja-*` tienen `origen:null` y no derivan nada; las líneas de otro teléfono llevan otro `proyecto_id`). La idempotencia cruzada que el doc promete casi nunca se ejerce. Con `proyectos` global en Supabase, cualquier teléfono podría emitir y la PK `mov-salida:<req>` pasa a ser el mecanismo central (Hallazgo H1).

---

## 1. Las tres hojas, columna por columna

### 1.1 Reglas comunes a las tres (`.gs:5268-5276`, `5371-5466`)

- Las columnas se buscan POR SU ENCABEZADO exacto, no por posición (`almPestana_`, `.gs:5399-5403`). **Las letras de abajo son las de una pestaña recién creada por el script** (columna 1 = A, en el orden de `ALM_PESTANAS` más las de la hoja). Una hoja real puede tener columnas movidas; la prueba lo cubre (`pruebas/puente-almacen.mjs:277-282`). Para importar, leer SIEMPRE por encabezado.
- Si falta un encabezado, se agrega al final (`.gs:5404-5426`). La pestaña se crea sola en la primera escritura o con `prepararPestanasDelAlmacen()` (`.gs:5434`; llamada desde «3 · Preparar la hoja para el puente», `.gs:4757`).
- Protección: `protect().setWarningOnly(true)` («La escribe el puente — no se edita a mano», `.gs:5391`). Solo aviso, no candado.
- Fila 1 = encabezados (negrita, fondo AZUL), `setFrozenRows(1)`. Una fila sin valor en la columna `id` no cuenta como fila (`almFilas_`, `.gs:5469-5480`).
- Tipos de celda (`almACelda_`/`almDeCelda_`, `.gs:5439-5466`):

| tipo hoja | se escribe como | se lee como (celda vacía) |
|---|---|---|
| texto | `String(v).slice(0, 2000)`; si empieza con `=`, `+`, `-` o `@` se antepone `'` (`/^[=+\-@]/`) y al leer se quita ese `'` | `''` (NO null) |
| número | `Number(v)` o `''` si no es finito | `null` |
| sello | igual que número (milisegundos epoch); formato `0` | `null` |
| sí/no | boolean `true/false` | `false` |
| lista | `JSON.stringify(v)`; formato `@` | `null` (si no parsea) |
| cuándo | `new Date(ms)`; formato `dd/mm/yyyy HH:mm`; SOLO se escribe, nunca se lee | no se devuelve |

- Consecuencia para el import: un `proyecto_id`, `requerimiento_id`, `nota`, `espesor`, etc. que fue `null` en el teléfono vuelve como `''` desde la hoja. Hacer `nullif(x,'')`. Texto mayor de 2000 caracteres fue truncado al escribirse (p. ej. `formula`). Una celda mayor de 45 000 (`ALM_CELDA_MAX`) no se escribe y el campo se reporta en `viejos` (`.gs:5701`).
- Columnas de la hoja (no de la plataforma), al final de cada pestaña (`ALM_COLUMNAS_DE_LA_HOJA`, `.gs:5362-5368`). «Sellos» NO existe en «Almacén» (`soloFichas`, `.gs:5373`):

| campo interno | Encabezado | tipo | significado |
|---|---|---|---|
| `_otros` | `Otros (JSON)` | lista | lo que llegó sin columna propia (objeto `{campo: valor}`); al leer se mezcla debajo de las columnas (las columnas mandan) |
| `_sellos` | `Sellos` | lista | `{campo: ms}` cuándo se escribió cada campo (solo catálogo y listas) |
| `_secuencia` | `Secuencia` | número | contador global que cada fila recibe al escribirse; lo que cada teléfono pregunta |
| `_llego` | `Llegó` | cuándo | hora de la hoja al recibirlo (`new Date()`) |
| `_subio` | `Subió` | texto | correo (entró con Google) o `token de <rol>` (`.gs:5611`, `2259`) |

### 1.2 «Almacén» (entidad `movimientos`, `anexo: true`, `fijos: ['id']`) — `.gs:5278-5302`

22 columnas, A..V. Nota de la pestaña: «El libro de movimientos del almacén. Lo escribe el puente y nunca se edita: una corrección es otro movimiento (un ajuste o un conteo). La existencia es el último conteo más lo que pasó después.»

| Col | Encabezado exacto | campo local | tipo hoja | significado / valores | tipo PG sugerido |
|---|---|---|---|---|---|
| A | `Cuándo` | (derivado de `ts`) | cuándo | fecha legible; «la que vale es Sello» | no se migra (derivable) |
| B | `Material` | `material_id` | texto | clave del catálogo (`acr-3mm`); NO se valida contra el catálogo | text |
| C | `Tipo` | `tipo` | texto | `entrada`, `salida`, `ajuste`, `conteo`, `merma`, `devolucion` | text CHECK |
| D | `Cantidad` | `cantidad` | número | en UNIDAD DE COMPRA y CON SIGNO (+ entra, − sale); 6 decimales (`red`, `stock.js:93`) | numeric |
| E | `Unidad` | `unidad_compra` | texto | `unidad`, `bolsa`, `caja`, `lamina`, `litro`, `metro`; copia de la del material para auditar | text CHECK |
| F | `Origen` | `origen` | texto | `derivado`, `manual`, `conteo`, `compra` | text CHECK |
| G | `Nota` | `nota` | texto | texto libre de quien lo movió | text |
| H | `Quién` | `usuario` | texto | `Prefs.nombre()` del teléfono | text |
| I | `Rol` | `rol` | texto | rol con que se capturó | text |
| J | `Dispositivo` | `dispositivo` | texto | 4 letras del aparato (`Prefs.dispositivo()`) | text |
| K | `Proyecto (id)` | `proyecto_id` | texto | id del proyecto EN EL TELÉFONO que lo emitió, o `''` | text/uuid FK? ver H1/H6 |
| L | `Venta` | `folio_hoja` | texto | folio de la fila en Ventas (`V-042`); lo agrega el relevo al subir si el proyecto ya tiene fila (`puente.js:1176-1185`) | text |
| M | `Requerimiento` | `requerimiento_id` | texto | `<proyecto_id>:<material_id>` de la línea que lo produjo, o `''` | text |
| N | `Costo total` | `costo_total` | número | pesos; DINERO (fabricación no lo escribe ni lo recibe) | numeric, en tabla restringida |
| O | `Firma` | `sello` | texto | texto `Nombre · Rol (DISP)` congelado al capturar (`Prefs.sello()`, `prefs.js:212`) | text |
| P | `Empresa` | `empresa_id` | texto | hoy siempre `al3d` (`Prefs.empresa()`, `prefs.js:323`) | text |
| Q | `Sello` | `ts` | sello | instante del movimiento, ms epoch del teléfono. **Es la `ts`, NO la columna `sello`.** Ordena el libro y ancla los conteos | bigint |
| R | `Id` | `id` | texto | lo pone el teléfono (`mov-<ts36>-<rand6>`, `db.js:368`) o `mov-salida:<req.id>`; clave de idempotencia | text PK |
| S | `Otros (JSON)` | — | lista | en la práctica contiene `creado_en` y `actualizado_en` cuando el movimiento salió por `stock.apendice` (ver 3.1) | descartable |
| T | `Secuencia` | — | número | orden de llegada a la hoja | bigint identity |
| U | `Llegó` | — | cuándo | hora de la hoja | timestamptz default now() |
| V | `Subió` | — | texto | correo o `token de <rol>` | text |

Confusión de nombres a recordar: en el movimiento, `ts` = «Sello» (col. Q, número) y `sello` = «Firma» (col. O, texto). En catálogo/listas, «Sellos» (plural, `_sellos`) = JSON de sellos por campo.

### 1.3 «Catálogo de material» (entidad `materiales`, `anexo: false`, `fijos: ['id']`) — `.gs:5303-5331`

27 columnas, A..AA. Nota: «El catálogo de material de la plataforma. Lo escribe el puente campo por campo; se edita en la plataforma (Material → Catálogo), no aquí: un cambio a mano no viaja a los teléfonos.»

| Col | Encabezado exacto | campo local | tipo hoja | significado | tipo PG sugerido |
|---|---|---|---|---|---|
| A | `Clave` | `id` | texto | clave corta (`acr-3mm`); no cambia nunca; el cliente la normaliza a minúsculas con `-` (`material.js:261`) | text PK |
| B | `Nombre` | `nombre` | texto | como se le pide al proveedor | text |
| C | `Familia` | `familia` | texto | `acrilico`, `aluminio`, `led`, `fuente`… (texto libre en el servidor; el cliente usa `sin_familia` por omisión) | text |
| D | `Unidad de compra` | `unidad_compra` | texto | las 6 de `ALM_UNIDADES_COMPRA` | text CHECK |
| E | `Unidad de consumo` | `unidad_consumo` | texto | `m2`, `m`, `cm`, `pieza`, `litro` | text CHECK |
| F | `Medida` | `medida` | texto | lo que dice el proveedor | text |
| G | `Factor` | `factor` | número | unidades de consumo que rinde UNA de compra; > 0 | numeric CHECK > 0 |
| H | `De dónde sale el factor` | `factor_origen` | texto | OBLIGATORIO en el cliente (`material.js:281-285`); el servidor NO lo exige | text |
| I | `Largo (cm)` | `largo_cm` | número | de la hoja si es lámina | numeric null |
| J | `Ancho (cm)` | `ancho_cm` | número | idem | numeric null |
| K | `Espesor` | `espesor` | texto | | text |
| L | `Merma` | `merma_pct` | número | 0 a 0.99 (solo lo valida el cliente) | numeric |
| M | `Fraccionable` | `fraccionable` | sí/no | si un retazo sirve (se redondea a cuartos) | boolean |
| N | `Mínimo de compra` | `min_compra` | número | en unidad de compra | numeric |
| O | `Mínimo de almacén` | `min_stock` | número | 0 = no avisar | numeric |
| P | `Costo de compra` | `costo_compra` | número | pesos por unidad de compra; DINERO | numeric, en tabla restringida |
| Q | `Proveedor` | `proveedor` | texto | | text |
| R | `Teléfono del proveedor` | `tel_proveedor` | texto | | text |
| S | `Activo` | `activo` | sí/no | baja lógica (no existe borrado de materiales) | boolean |
| T | `Empresa` | `empresa_id` | texto | | text |
| U | `Creado` | `creado_en` | sello | ms | bigint |
| V | `Editado` | `actualizado_en` | sello | ms del teléfono que editó | bigint |
| W..AA | `Otros (JSON)`, `Sellos`, `Secuencia`, `Llegó`, `Subió` | — | | ver 1.1 | |

### 1.4 «Listas de compra» (entidad `requerimientos`, `anexo: false`, `fijos: ['id','proyecto_id','material_id']`) — `.gs:5332-5359`

26 columnas, A..Z. Nota: «Lo que cada proyecto pide de cada material: de aquí sale la lista de compra. Lo escribe el puente campo por campo; la cantidad que vale es «Corrección» cuando la hay. No se edita a mano.»

| Col | Encabezado exacto | campo local | tipo hoja | significado | tipo PG sugerido |
|---|---|---|---|---|---|
| A | `Venta` | `folio_hoja` | texto | folio de la venta en Ventas (`V-042`); lo agrega el relevo al subir | text |
| B | `Material` | `material_id` | texto | clave del material | text |
| C | `Cantidad` | `cantidad_compra` | número | unidad de compra, SIN redondear (fraccionaria a propósito) | numeric |
| D | `Unidad` | `unidad_compra` | texto | | text |
| E | `Corrección` | `cantidad_ajustada` | número | la de una persona; si no es null, MANDA sobre la calculada | numeric null |
| F | `Estado` | `estado` | texto | `calculado`, `apartado`, `comprado`, `consumido`, `descartado` | text CHECK |
| G | `Confianza` | `confianza` | texto | `exacta`, `estimada`, `requiere_dato` (el servidor NO lo valida) | text |
| H | `Le falta` | `requiere` | texto | qué dato falta | text |
| I | `Cómo se calculó` | `formula` | texto | cuenta con los números puestos (truncada a 2000 en la hoja) | text |
| J | `Consumo` | `cantidad_consumo` | número | en unidad de consumo, con merma | numeric |
| K | `Unidad de consumo` | `unidad_consumo` | texto | | text |
| L | `Partidas` | `partidas` | lista | array de `it.id` de la cotización (`[3,4]`) | jsonb / int[] |
| M | `Por qué se corrigió` | `motivo_ajuste` | texto | | text |
| N | `Corrigió` | `ajustado_por` | texto | `Prefs.sello()` de quien corrigió | text |
| O | `Corregido` | `ajustado_en` | sello | ms; `0` si nunca | bigint |
| P | `Constantes` | `constantes_version` | texto | con qué números del taller se calculó (`c-2026-08.4kz1`) | text |
| Q | `Proyecto (id)` | `proyecto_id` | texto | id del proyecto EN EL TELÉFONO que lo calculó | text/uuid, ver H1/H6 |
| R | `Empresa` | `empresa_id` | texto | | text |
| S | `Creado` | `creado_en` | sello | | bigint |
| T | `Editado` | `actualizado_en` | sello | | bigint |
| U | `Id` | `id` | texto | `<proyecto_id>:<material_id>`; no cambia nunca | text PK |
| V..Z | `Otros (JSON)`, `Sellos`, `Secuencia`, `Llegó`, `Subió` | — | | ver 1.1 | |

### 1.5 Campos locales que NO tienen columna

- `sync` (marca local 0/1): `ALM_NO_VIAJA` (`.gs:5266`), nunca se guarda.
- Cualquier campo que no esté en `ALM_PESTANAS` va a `Otros (JSON)` y se devuelve (prueba: `color: 'frío'`, `pruebas/puente-almacen.mjs:236-237`).
- Un campo cuyo nombre empieza con `_` se ignora (`.gs:5687`).
- Para movimientos, `creado_en` y `actualizado_en` caen en `Otros (JSON)` si el movimiento salió por `stock.apendice` (el `datos` es `r.valor` de `DB.poner`, que los sella: `db.js:230-231`). Los de `stock.recibirCompra` salen sin ellos (se encola el objeto previo a `ponerVarios`, `stock.js:785-798`). Conclusión: al importar, ignorar `creado_en`/`actualizado_en` de movimientos y usar `ts`.

### 1.6 Registro local (IndexedDB `al3d_pf`, `db.js:60-84`)

| almacén IDB | keyPath | índices | forma del registro |
|---|---|---|---|
| `movimientos` | `id` | `porMaterial` = `[material_id, ts]`, `porProyecto` = `proyecto_id`, `porSync` = `sync` | campos de 1.2 + `sync`, `creado_en`, `actualizado_en` |
| `materiales` | `id` | `porFamilia` = `familia` | campos de 1.3 + `sync` |
| `requerimientos` | `id` | `porProyecto` = `proyecto_id`, `porMaterial` = `material_id` | campos de 1.4 + `sync` (+ `folio_hoja` si bajó de la hoja) |
| `constantes` | `clave` | ninguno | `{clave, valor, unidad, nota, version, actualizado_por, creado_en, actualizado_en}`; más un renglón interno `_semilla` `{clave:'_semilla', valor:0, nota, version, ids[], claves[]}` que NO es dato |

`DB.poner` sella `actualizado_en = Date.now()` en CADA escritura y fija `creado_en` solo si es nuevo (`db.js:229-232`). No hay borrado de movimientos, materiales ni requerimientos en ningún lugar del cliente (grep `DB.borrar`: solo `pendientes`, `proyectos` y espejos). Bajas lógicas: material `activo:false`, requerimiento `estado:'descartado'`.

---

## 2. Protocolo `/empujar_almacen` y `/jalar_almacen`

### 2.1 Transporte común (`.gs:2174-2271`, `puente.js:963-1050`)

- Todo es POST a la URL única del Web App, `Content-Type: text/plain;charset=utf-8`, cuerpo JSON; `doGet` no atiende nada.
- El camino va como primer campo del JSON: `{"ruta":"empujar_almacen", ...}`. Se agregan `google_token` (si hay sesión Google viva) y/o `token` (token de dispositivo). La identidad de Google manda sobre el token (`.gs:2228-2231`).
- Tope de cuerpo: 65 536 caracteres para todo menos `/ia` (`.gs:2189-2213`). Una respuesta `{ok:false,codigo:'DATO_INVALIDO'}` de nivel superior por cuerpo grande NO se marca `definitivo` en el cliente (`puente.js:1210-1211`), así que un lote muy grande se reintentaría para siempre (riesgo menor; 25 requerimientos con fórmulas largas podrían acercarse al tope).
- Rol: de la pestaña «Accesos» (correo -> rol, `.gs:2363-2375`) o del token (`PUENTE_TOKENS`, `.gs:2281-2289`). Rol inexistente: `ROL_SIN_PERMISO` de nivel superior, que el cliente convierte en excepción y detiene el bombeo (`puente.js:1039-1044`, `sync.js:647`).
- Cupo: 60 peticiones/minuto por persona o token (`LIMITE_POR_MINUTO`, `.gs:2164`, `2241`).
- `/salud` devuelve `escribibles: PUENTE_ROLES[rol]`, que SOLO lista columnas de Ventas: el cliente no sabe de antemano qué puede escribir en el almacén (`.gs:2455-2461`).

### 2.2 `/empujar_almacen`

Petición (lo que de verdad sale del teléfono, `paraLaHoja`, `puente.js:1172-1187`):

```json
{
  "ruta": "empujar_almacen",
  "google_token": "<opcional>", "token": "<opcional>",
  "ops": [
    { "id": "op-<ts36>-<rand6>",
      "almacen": "movimientos | materiales | requerimientos",
      "tipo": "apendice | crear | actualizar",
      "registro_id": "<id del registro>",
      "datos": { "...registro completo, sin la clave 'sync'; con 'folio_hoja' agregado si el proyecto ya tiene fila..." },
      "campos": ["campo1", "campo2"]  /* o null */ }
  ]
}
```

- `ops` se recorta a 25 (`ALM_OPS_MAX`, `.gs:5241`, `5598-5599`); el cliente arma lotes de hasta `MAX_LOTE = 25` operaciones SEGUIDAS de la bandeja (`sync.js:140`, `667-670`). `esperado`, `ts`, `disp`, `intentos` NO viajan. `op.id` identifica la operación en la respuesta; la idempotencia es por `datos.id`, no por `op.id`.
- `campos`: lista de campos que cambiaron. Para `crear`/alta es `null`. Los calcula `camposQueCambiaron` (`material.js:63-73`), que excluye `sync`, `actualizado_en`, `creado_en`. `stock.js` encola movimientos sin `campos`; `proyectos.emitirSalidas` encola `campos:['estado']` para el requerimiento (`proyectos.js:1203-1205`); `ajustar` encola `['cantidad_ajustada','motivo_ajuste','ajustado_por','ajustado_en']` (`material.js:1159-1160`).
- La hoja ignora `op.tipo`; lo que decide si es libro o ficha es `ALM_PESTANAS[almacen].anexo`.

Respuesta:

```json
{ "ok": true,
  "resultados": [
    { "id": "op-…", "ok": true, "creada": true,  "viejos": [] },            /* escrita (alta o cambio) */
    { "id": "op-…", "ok": true, "ya_estaba": true },                        /* solo libro: el id ya existía */
    { "id": "op-…", "ok": true, "sin_cambio": true, "viejos": ["proveedor"] }, /* nada más nuevo que lo que hay */
    { "id": "op-…", "ok": false, "codigo": "ROL_SIN_PERMISO|DATO_INVALIDO|DESCONOCIDO", "mensaje": "…" }
  ],
  "secuencia": 123 }
/* error de nivel superior, p. ej. candado ocupado: */
{ "ok": false, "codigo": "SIN_RED", "mensaje": "La hoja está ocupada con otra escritura. Se vuelve a intentar solo." }
```

Algoritmo exacto por lote (`rutaEmpujarAlmacen_`, `.gs:5597-5630`):
1. `LockService.getScriptLock().waitLock(20000)`; si falla, `SIN_RED` de nivel superior y no se escribe nada. Es el mismo candado de `/empujar` (una escritura a la vez en toda la hoja).
2. `ctx.secuencia = almLeerSecuencia_()`: propiedad de script `ALMACEN_SECUENCIA`; si falta o es 0, toma el máximo de la columna `Secuencia` de las tres pestañas (`.gs:5520-5533`).
3. Para cada op EN ORDEN, con `try/catch` propio (una que truena no se lleva a las demás; devuelve `DESCONOCIDO`): `almUnaOperacion_`.
4. `SpreadsheetApp.flush()`; guarda `ALMACEN_SECUENCIA`; `anotar_` en la pestaña oculta «Bitácora del puente» (tope 5000 renglones, `.gs:3282-3284`); devuelve `{ok:true, resultados, secuencia}`.

Algoritmo de UNA operación (`almUnaOperacion_`, `.gs:5643-5743`), en este orden:
1. `op.id` obligatorio, `op.almacen` en {movimientos, materiales, requerimientos}, `op.datos` objeto: si no, `DATO_INVALIDO`.
2. Permiso (`almPermiso_`): `ROL_SIN_PERMISO` con mensaje. Ver sección 3.
3. Validación (`almValidar_`): `DATO_INVALIDO`. Ver 2.5.
4. Carga la pestaña una sola vez por viaje (`almContexto_`, `.gs:5633-5641`), con mapa `porId`; `siguiente = max(lastRow+1, 2)`.
5. Libro (`anexo`) y la fila ya existe: devuelve `{ok:true, ya_estaba:true}` y NO escribe ni gasta secuencia (`.gs:5665`). Como `porId` se actualiza tras cada escritura (`.gs:5738`), dos ops con el mismo id DENTRO del mismo lote también dan `[creada, ya_estaba]` (prueba `:147-152`).
6. Qué campos se consideran (`lista`, `.gs:5679-5682`): alta (no existe la fila) -> TODAS las claves de `datos`, aunque venga `campos`; cambio con `campos` array -> solo esos; cambio sin `campos` -> todas las claves de `datos` (versión anterior de la app).
7. Por cada campo candidato (`.gs:5685-5708`) se salta si: no está en `datos`; está en `ALM_NO_VIAJA` o empieza con `_`; es `creado_en` y la fila ya existía; es un campo «fijo» y la fila ya existía (`id`; en requerimientos también `proyecto_id` y `material_id`); es un campo de dinero (`costo_total`, `costo_compra`) y el rol no ve dinero (se ignora EN SILENCIO, no se reporta); el sello guardado del campo es MAYOR que el de la op (`Number(sellos[campo]) > ts`) -> va a `viejos`; (solo requerimientos.estado) la transición no está admitida (`almEstadoAdmite_`) -> va a `viejos`; el texto resultante supera 45 000 -> `viejos`.
   - `ts` del sello = `Number(datos.actualizado_en)` si es > 0, si no la hora de la hoja (`.gs:5674`). Es decir, el reloj del TELÉFONO decide quién gana. Empate de sello: pasa (gana el que llega después).
   - Lo que tiene columna se escribe en ella; lo que no, en `_otros[campo]`. Cada campo escrito guarda `sellos[campo] = ts`.
8. Si era un cambio y no se escribió nada: `{ok:true, sin_cambio:true, viejos:[…]}` y NO gasta secuencia (`.gs:5710-5715`). Un reenvío idéntico (mismo sello) SÍ reescribe y gasta secuencia (el `>` es estricto).
9. Se escribe `Cuándo` (de `ts`) si `ts` se escribió; `Otros (JSON)`; `Sellos` (si la pestaña lo tiene); `ctx.secuencia++` -> `Secuencia`; `Llegó` = ahora; `Subió` = correo o `token de <rol>`.
10. La fila se escribe ENTERA con `setValues` en `previa.fila` o en `P.siguiente++` (se agregan filas de 200 en 200 si hace falta).
11. Devuelve `{ok:true, creada:!previa, viejos}`.

### 2.3 `/jalar_almacen` (`.gs:5752-5781`)

Petición: `{"ruta":"jalar_almacen","desde":<N>}`. `desde` no numérico o negativo se toma como 0. Cualquier rol válido.

Respuesta:

```json
{ "ok": true,
  "registros": [ { "almacen": "movimientos|materiales|requerimientos", "datos": { … } } ],
  "hasta": 123,
  "hay_mas": false }
```

- `tryLock(10000)` aun siendo lectura (para no ver una escritura de varias filas a medias); si no se obtiene: `{ok:false,codigo:'SIN_RED'}`.
- Toma de las TRES pestañas TODAS las filas con `Secuencia > desde` y `id` no vacío, las ordena globalmente por `Secuencia`, corta a `ALM_POR_PAGINA = 1500`; `hasta` = la secuencia más alta de la página (o `desde` si vacía); `hay_mas = total > pagina`.
- Cada `datos` = `almRegistro_(P, valores, rol)` (`.gs:5483-5514`): mezcla `Otros (JSON)` y columnas (las columnas mandan), omite `Cuándo`, y los campos `_*`. Regla null: una celda vacía de un campo que NUNCA se escribió (su clave no está en `Sellos`) se OMITE; si sí se escribió vacío (p. ej. costo borrado) baja como `null`. El libro no tiene `Sellos`, así que ahí no se omite nada. Para roles sin dinero se borran `costo_total` y `costo_compra` del objeto.
- La hoja lee las pestañas completas en cada llamada (`getValues` de todo): costo O(n) por petición.

### 2.4 Lado cliente de la bajada (`puente.js:1227-1306`, `sync.js:738-876`)

- Cada ~30 s con la app visible y al volver a la pestaña (`app.js:1837-1842`, `MS_SINCRONIZAR = 30000`), `sincronizarDeVerdad` hace `Sync.bombear()` y luego `Sync.jalar()` hasta 10 vueltas (`app.js:2064-2076`). `bajarAlmacen` corre al final de la última página de la venta (`puente.js:2025-2027`): son 2 peticiones por ciclo por teléfono.
- Marca en IndexedDB: registro `_almacen_hoja` en el almacén `pendientes`: `{id:'_almacen_hoja', ts:0, desde, completo_en, barriendo}` (`puente.js:1245`, `1303`). Se guarda SOLO después de que `sync` escribió lo bajado (`despuesDeBajar`, `puente.js:2046-2052`).
- Pasada ENTERA (desde 0) si nunca se completó o pasó más de una semana (`MS_SEMANA`, `puente.js:1244`, `1265`); hasta 20 páginas por bajada; si no alcanza, sigue donde se quedó (`barriendo`).
- Qué se hace con cada registro bajado: `movimientos` -> tal cual; `materiales` y `requerimientos` -> `{...datos, actualizado_en: Date.now()}` (se re-sella con la hora LOCAL; el sello original del editor se pierde), SALVO si ese registro tiene una op esperando en la bandeja (estado `pendiente`, `sin_destino` o vacío): se omite en esta ronda (`puente.js:1247-1256`, `1285-1286`).
- `sync.jalar` (`sync.js:777-821`): movimientos con id ya presente -> DESCARTADO sin mirar el contenido (`sync.js:795-799`); materiales/requerimientos -> `fusionar(local, remoto)` (`sync.js:909-927`): gana el de `actualizado_en` mayor (el remoto, por el re-sello), campo por campo (un campo `undefined` no pisa), y si el dato es igual no se reescribe (`mismoDato`).

### 2.5 Validaciones del servidor (`almValidar_`, `.gs:5556-5584`) — los CHECK que SQL debe reproducir

- Todas: `id` no vacío y ≤ 200 caracteres.
- `movimientos`:
  - `tipo` ∈ {entrada, salida, ajuste, conteo, merma, devolucion}; `origen` ∈ {derivado, manual, conteo, compra}; `material_id` no vacío; `unidad_compra` ∈ las 6.
  - `cantidad` no null/`''`, finita y `|c| ≤ 1e7`.
  - Signo por tipo (`ALM_SIGNO`): `entrada`/`devolucion` -> `c > 0`; `salida`/`merma` -> `c < 0`; `conteo` -> `c ≥ 0` (cero permitido: «no queda nada» es un dato); `ajuste` -> `c ≠ 0` (puede ir para los dos lados).
  - `ts > 0`; `costo_total`, si viene, numérico.
- `materiales`: `unidad_compra` ∈ 6 si viene; `unidad_consumo` ∈ 5 si viene; `factor > 0` si viene. (Solo valida lo que viene en `datos`, que casi siempre es la fila completa.)
- `requerimientos`: `proyecto_id` y `material_id` no vacíos; `estado` ∈ 5 si viene.
- Cliente además (no en servidor): unidad del movimiento debe igualar la del material (`stock.js:335-340`); cantidad ≠ 0 salvo conteo (`stock.js:327`); signo forzado por tipo (`stock.js:348`: `signo===0 ? cantidad : signo*abs(cantidad)`); `costo_total` a 2 decimales; `factor_origen` no vacío; merma 0..0.99; mínimos ≥ 0.

### 2.6 Cómo se evita restar dos veces (capas, en orden)

1. El id del movimiento lo genera el cliente antes de escribir (`stock.js:344`, `DB.nuevoId('mov')`), se guarda local y se encola con ese mismo `datos.id`. Un reintento reenvía el mismo id (la op se queda en la bandeja hasta recibir `ok`).
2. La hoja busca el id ANTES de escribir y contesta `ya_estaba` (`.gs:5665`) bajo el candado global; no compara contenido.
3. El cliente que baja un id que ya tiene lo descarta (`sync.js:795-799`); `DB.importar` también (`db.js:490`).
4. Salida derivada del corte: id determinista `mov-salida:` + `req.id` (`proyectos.js:1178`), con `req.id = <proyecto_id>:<material_id>` (`material.js:1073`). Antes de emitir se mira si ya existe localmente (`proyectos.js:1179-1180`); se marca el requerimiento `consumido` UNO POR UNO tras cada salida (`1196-1197`); las emisiones se serializan en una cadena de promesas (`_salidas`, `1147-1151`).
5. `consumido` no retrocede: el servidor rechaza (a `viejos`) cualquier cambio de `estado` desde `consumido` que no sea `consumido`, y desde `comprado` solo admite `comprado`/`consumido` (`almEstadoAdmite_`, `.gs:5590-5594`); `recalcular` no toca líneas `comprado`/`consumido` (`material.js:1076`, `1099`); `emitirSalidasAhora` salta las `consumido` (`proyectos.js:1162`).
6. Validación del signo en cliente y servidor (un `salida` positivo haría CRECER el almacén al consumir).
7. Alcance real de la capa 4 (ver H1): el id `mov-salida:<proyecto_id>:<material>` solo coincide entre dos teléfonos si los dos tienen el MISMO `proyecto_id` (p. ej. un respaldo restaurado en otro aparato). En la operación normal cada teléfono tiene ids de proyecto distintos para la misma venta, y además `Mat.requerimientos(p.id)` filtra por el `proyecto_id` local (`material.js:1022-1034`), así que un teléfono nunca emite la salida de una línea calculada en otro: la deduplicación cruzada casi no se ejerce. La prueba usa el mismo `proyecto_id` en ambas ops (`puente-almacen.mjs:147-150`).

Disparadores de la salida derivada: al CRUZAR la etapa `cortado` o mayor (`avanzarEtapa`, `proyectos.js:1252-1262`, origen `manual`), y a un día de la instalación o después, sin que nadie haya marcado el corte (`emitirSalidasDerivadas`, `proyectos.js:1297-1325`, origen `derivado`), llamada por `reglas.js:760-761` desde cualquier teléfono que evalúe reglas. Por eso un teléfono con rol Pagos puede emitirla.

### 2.7 Resolución de conflictos (resumen)

| entidad | regla |
|---|---|
| `movimientos` | No hay conflicto: append-only, primer id que llega gana, contenido no se compara. Mismo id con contenido distinto -> el segundo se pierde en silencio. |
| `materiales`, `requerimientos` | Último cambio gana POR CAMPO: sello por campo en `Sellos` = `datos.actualizado_en` del teléfono; sello guardado > sello de la op -> la op NO escribe ese campo (`viejos`) y se contesta `ok` (no es rechazo). Empate: escribe. |
| `requerimientos.estado` | Monótono (ver 2.6, punto 5). |
| `id`, `proyecto_id`, `material_id` | Inmutables tras el alta (requerimientos); `id` inmutable (materiales). |
| `costo_*` | Fabricación no los escribe (se ignoran sin avisar). |
| Cliente | La bajada re-sella con `Date.now()` y gana el remoto, salvo registros con op pendiente en la bandeja. No existe estado `CONFLICTO` para el almacén: `esperado` es siempre `null` (`stock.js:46`, `material.js:57`). |

Estados de una op en la bandeja (`pendientes`, `sync.js:350-457`, `571-648`): `pendiente` (reintenta con retroceso exponencial `esperaMs`, tope 1 h, `sync.js:714-717`), `sin_destino` (la hoja corre una versión < 9 o el almacén no se lleva; se reincorpora solo, `revivirSinDestino`, `sync.js:499-509`), `rechazada` (`definitivo`: códigos `ROL_SIN_PERMISO`, `NO_ENCONTRADO`, `DATO_INVALIDO` desde la op, `puente.js:1190`; se aparta con su razón y el bombeo sigue), `conflicto` (nunca para almacén). `SIN_RED`/`DESCONOCIDO`/`ROL_SIN_PERMISO` de nivel superior detienen el bombeo (`sync.js:647`).

---

## 3. Roles: quién puede qué

### 3.1 Escritura (servidor, `almPermiso_`, `.gs:5537-5553`, antes de mirar la hoja)

| Rol | `movimientos` | `materiales` | `requerimientos` | costos (`costo_total`, `costo_compra`) |
|---|---|---|---|---|
| `direccion` | cualquier tipo/origen | cualquier campo | cualquier campo | los escribe |
| `fabricacion` | cualquier tipo/origen | cualquier campo (sin costo) | cualquier campo (sin costo) | se IGNORAN al escribir (`.gs:5694`); no error |
| `pagos` | SOLO `origen === 'derivado'` Y `tipo === 'salida'`; cualquier otro: `ROL_SIN_PERMISO` («el almacén lo mueven fabricación y dirección; desde pagos solo entra la salida que deriva la obra sola») | `ROL_SIN_PERMISO` («el catálogo de material lo editan fabricación y dirección») | SOLO si `op.campos` es un array no vacío con elementos ⊆ {`estado`,`folio_hoja`} Y `datos.estado === 'consumido'`; si no: `ROL_SIN_PERMISO` | no escribe nada de costos (no escribe catálogo) |

Notas: «derivado» no abre `entrada` a Pagos (prueba `:191-192`). El servidor no valida cantidad/material de la salida derivada de Pagos. Un rol inexistente: «ese rol no existe».

### 3.2 Lectura (servidor, `almRegistro_`, `.gs:5512`; `VE_EL_DINERO`, `.gs:2153`)

- `/jalar_almacen` no filtra por rol más que los costos: Dirección, Fabricación y Pagos reciben las TRES pestañas completas. `VE_EL_DINERO = {direccion:true, pagos:true, fabricacion:false}`. Fabricación NO recibe `costo_total` ni `costo_compra` (las claves se borran del objeto, no van como null). Pagos SÍ recibe los costos (`pruebas/puente-almacen.mjs:205`).
- Respuesta a «¿Pagos ve el almacén?»: por la API de hoy, SÍ, todo, con costos. Por la interfaz, NO tiene pantalla: la ruta `material` está limitada a `['direccion','fabricacion']` (`app.js:73`); la tarjeta de almacén de Control solo la calcula Dirección (`control.js:241-249`, «el almacén, solo para dirección: fabricación no entra aquí y pagos no compra»). Pero el teléfono de Pagos igual baja y guarda el libro, el catálogo y las listas.
- Por qué el código le da lectura a Pagos (inferido, NO CONFIRMADO como intención): `emitirSalidasDerivadas` corre en cualquier teléfono, incluido el de Pagos, y consulta localmente `DB.obtener('movimientos', idSalida)` y `Mat.requerimientos(p.id)` (`proyectos.js:1158-1180`); y `inicio.js:130-131` / `reglas.js:770-772` leen `listaCompra`/`existencias` para los avisos. Ojo con H1: solo emite de proyectos propios con partidas.
- «Fabricación escribe» -> SÍ: mueve el almacén, cuenta, recibe compras, edita el catálogo (sin costo) y corrige las listas.

### 3.3 Cliente (no es seguridad, `stock.js:288-300`)

- `permiso(origen)`: si `Prefs.rol() === 'pagos'` y el origen NO es `derivado` -> `ROL_SIN_PERMISO` local («El almacén lo mueve fabricación o dirección. Si te toca a ti, cambia de rol en Ajustes.»). Afecta `mover`, `contar`, `aceptarDerivado`, `recibirCompra` (origen `'compra'`) y `ajustar` (su movimiento `manual` falla pero la corrección queda guardada, `material.js:1176-1180`).
- `Prefs.veDinero() = rol !== 'fabricacion'` (`prefs.js:193`): `existencias`, `listaCompra`, `valorInventario` y las pantallas ocultan costos para Fabricación y `valorInventario` devuelve `null` (`stock.js:219`, `674`, `727-728`, `894`).
- `guardarMaterial`, `recalcular` y `ajustar` no revisan rol: un teléfono con rol Pagos las encola y el servidor las rechaza (`rechazada`, definitivo).
- El rol efectivo sale del pase de Google/«Accesos» (`prefs.js:174-179`, `314`); cambiar el rol en Ajustes no da permisos de servidor.

---

## 4. Mapeo hoja <-> campos locales (resumen operativo)

| Concepto | Hoja -> local | Local -> hoja |
|---|---|---|
| Fila vacía de campo nunca escrito | se OMITE la clave (el teléfono conserva lo suyo) | — |
| Costo borrado (escrito vacío) | baja `null` | `null` -> celda `''` y el sello del campo queda registrado |
| texto null | baja `''` | `''` |
| sí/no | `true/false`; vacío = `false` | boolean |
| `partidas` | JSON parseado a array | `JSON.stringify` |
| `folio_hoja` | columna `Venta` | lo agrega `paraLaHoja` si `proyectos[pid].notion_page_id \|\| folio_hoja` existe y `datos.folio_hoja` no |
| `proyecto_id` | el del teléfono que lo calculó/emitió | tal cual (id local) |
| `empresa_id` | `al3d` | `Prefs.empresa()` |
| `actualizado_en` | columna `Editado` (catálogo/listas); el cliente lo sobreescribe con `Date.now()` al bajar | sello del campo y `Editado` |
| `Cuándo` | no se devuelve | de `ts` |

Dónde nace cada entidad en el cliente:
- Material: `guardarMaterial` (`material.js:258`), `sembrar` (`501`) desde `datos/semilla.json` (19 materiales y 20 constantes: 18 de taller + 2 de plazo; verificado con `node`, archivo de 18 232 bytes) o de `MAT_BASE` si el fetch falla (`material.js:446-467`). `sembrar` corre en cada arranque de cada teléfono (`app.js:1756-1761`), escribe con `actualizado_en: 1` y NO encola (`material.js:532`).
- Requerimiento: `recalcular(proyectoId)` (`material.js:1044-1120`), disparado al crear el proyecto (`proyectos.js:705`, `1445`) y desde Material/Inicio; `ajustar` (`1133`); `emitirSalidas` (estado `consumido`).
- Movimiento: `mover`, `contar`, `aceptarDerivado`, `recibirCompra`, `emitirSalidas*`, `ajustar`.

Vocabulario duplicado a propósito: `.gs` (`ALM_TIPOS`, `ALM_ORIGENES`, `ALM_UNIDADES_*`, `ALM_ESTADOS_REQ`, `ALM_SIGNO`) vs `stock.js:64-73` y `material.js:90-91`; la prueba los compara (`puente-almacen.mjs:315-330`). Los estados de requerimiento solo viven en el `.gs` (`ALM_ESTADOS_REQ`) y en comentarios del cliente; el cliente solo produce `calculado`, `apartado` (preserva), `descartado` y `consumido`; `comprado` nunca lo escribe código alguno del cliente (solo se preserva).

---

## 5. Volumen y qué crece

| Dato | Crece | Estimación basada en código | Fuente |
|---|---|---|---|
| `materiales` | No (casi constante) | 19 de semilla + altas manuales | `datos/semilla.json` |
| `constantes` | No | 20 + 1 marcador `_semilla` | `semilla.json`, `material.js:174-198` |
| `requerimientos` | Con cada proyecto, para siempre (nunca se borran; `descartado` queda) | 1 fila por (proyecto, material); las recetas piden hasta unos 11 materiales distintos (letras, recorte, bastidor, caja) y un proyecto típico unas 3 a 10 líneas | `material.js:738-1012` |
| `movimientos` | SÍ, sin techo, nunca se edita ni se borra | por proyecto: 1 salida por línea con cantidad > 0 (+ ajustes/mermas); más conteos (hasta 19 por conteo mensual completo = ~228/año), entradas por compra recibida (1 por material) | `stock.js:444`, `554-810` |
| Tamaño por fila | — | movimiento ~350-600 bytes JSON; requerimiento ~600-1500 (por `formula`, `partidas`) | estimación mía |
| «Bitácora del puente» (hoja oculta) | Tope fijo | 5000 renglones | `.gs:3282` |

- Contexto de negocio: Ventas tiene como máximo 309 filas (`FIN = 310`, `.gs:9`) y «tres años» de historia con 199 filas anteriores a la plataforma (`puente.js:45-46`): del orden de ~100 ventas/año. Orden de magnitud esperado del libro: del orden de 1 a 3 mil renglones por año. Es una ESTIMACIÓN; NO CONFIRMADO el número real de renglones en las pestañas ni la versión que corre la hoja real (no se leyó la hoja viva).
- Las pestañas del almacén en la hoja existen desde 2026-10-01 (commit `9f2846a`) si el Apps Script en producción ya corre la 9 o posterior. Antes de eso, todo vivía solo en IndexedDB de cada teléfono (y en la bandeja `sin_destino`). Por eso el dato histórico real puede estar repartido: parte en las pestañas, parte en los teléfonos que nunca subieron.
- El cliente lee el libro completo en memoria en cada consulta (`DB.listar('movimientos')` sin rango en `existencias`, `listaCompra`; `stock.js:266-269`, `653-657`); `movimientos()` (la pantalla) corta a 200 por omisión (`stock.js:849`).
- El coste de lectura de la hoja es lineal por petición (todas las filas × todas las columnas en cada `/jalar_almacen`).

---

## 6. Lógica de cliente que depende de este modelo (para decidir qué se queda en cliente)

Todo esto hoy es JS puro sobre IndexedDB; el plan lo mantiene en cliente (`PLAN-SUPABASE.md:180`).
- `calcularExistencia(movs)` (`stock.js:153-172`): ordena por `(ts, id)` (`localeCompare` en el desempate, `stock.js:139`); el ÚLTIMO `conteo` es ancla absoluta; suma los demás movimientos con `ts` ESTRICTAMENTE mayor al del ancla (un movimiento con el mismo `ts` que el conteo NO entra); sin conteo suma todo. Resultado redondeado a 6 decimales. La existencia NUNCA se guarda.
- `comprometido`/`recolectarDemanda` (`stock.js:473-576`): proyectos abiertos (etapa no `instalado`/`garantia`/`cancelado`), instalación más próxima no cancelada; requerimientos NO `consumido`/`descartado`; `cantidad_ajustada` manda sobre `cantidad_compra`; una línea ajena se ata al proyecto local por `folio_hoja` (`notion_page_id` o `folio_hoja` del proyecto) y la línea propia gana sobre la ajena para el mismo (proyecto, material).
- `listaCompra` (`stock.js:649-739`): agrega todos los proyectos ANTES de redondear; `objetivo = requerido + min_stock`; `faltante = max(0, objetivo - existencia)`; `cuantoComprar` (`stock.js:622-633`): fraccionable -> cuartos (`ceil((f-1e-9)*4)/4`), si no -> `ceil`, y piso `min_compra`.
- `bajoMinimo`, `valorInventario` (devuelve `null`, no 0, sin costos o para Fabricación).
- `material.derivar` (pura) y `recalcular` (preserva `cantidad_ajustada`, `motivo_ajuste`, `ajustado_*`, y no toca `comprado`/`consumido`; marca `descartado` lo que ya no se pide).
- `calibracion`: razón real/calculado por familia con >= 5 muestras y desviación > 15 % -> propone cambiar una constante.

---

## 7. Pruebas existentes: la especificación de aceptación

`pruebas/puente-almacen.mjs` (538 líneas, node, hoja de mentiras con `vm`; el `.gs` se carga entero). Bloques y lo que afirman (útiles como criterios para el SQL/RPC):
- `:128-153` Libro: la 1ª subida crea la pestaña; columnas por nombre; `Subió` = correo, `Secuencia` = 1; `sync` no se guarda; reintento -> `ya_estaba` y una sola fila; dos ops con el mismo id en el mismo lote -> `[[ok,no],[ok,ya_estaba]]`; la secuencia no se gasta en `ya_estaba` (`[1,2]`).
- `:155-181` Rechazos `DATO_INVALIDO`: salida positiva, entrada negativa, conteo negativo, tipo/unidad inventados, `ts:0`, cantidad no numérica; conteo de 0 SÍ entra; nota con `=` se guarda con `'` y baja intacta.
- `:183-206` Roles: Pagos no registra `entrada` manual; `derivado+salida` sí; `derivado+entrada` no; Pagos no edita catálogo; Fabricación corrige `min_stock` sin borrar el `costo_compra` de Dirección; Fabricación no recibe costos (ni del catálogo ni del libro); Dirección y Pagos sí.
- `:208-238` Catálogo campo por campo: cambios de dos roles coexisten; un cambio atrasado no pisa y no es rechazo (`viejos:['proveedor']`) ni gasta secuencia; op sin `campos` = «todos» con la misma regla del sello; costo borrado baja `null`; unidad inventada -> `DATO_INVALIDO`; campo sin columna viaja en `Otros`.
- `:240-263` Listas: `consumido` no vuelve a `calculado` aunque lo demás del cambio sí entra; `partidas` viajan como lista; la corrección de Fabricación sobrevive a un recálculo que no la tocó; Pagos marca `consumido` pero no corrige cantidades; `proyecto_id` no cambia en un cambio.
- `:265-293` Bajar: orden por secuencia entre pestañas; `hasta`/`hay_mas`; «desde ahí, nada»; columnas movidas a mano no desvían escrituras; si se pierde la propiedad de secuencia, sigue de la más alta; con candado ocupado subir y bajar dan `SIN_RED` sin escribir nada.
- `:295-330` Puerta (doPost con token) y duplicados de vocabulario.
- `:400-508` Teléfono contra la hoja: apartar contra hoja v8 y reincorporar solo contra v9; un viaje de 4 ops en orden; sin `sync` en el cuerpo; `folio_hoja` agregado; reintento no duplica; la bajada trae lo ajeno sin duplicar lo propio; marca `desde` guardada tras escribir; cambio pendiente en bandeja no se pisa con lo que baja y luego la hoja junta ambos; la línea ajena entra a la lista de compra por folio de venta.
- `:510-535` Corte: `avanzarEtapa('cortado')` emite `mov-salida:proy-c:lam-galv` con `cantidad -0.4`, encola `campos:['estado']` del requerimiento; volver a cruzar el corte no emite otra.

Tras la migración: `puente-almacen.mjs` se reescribe (partes 1-3 hablan con el `.gs`); `stock.mjs` y `material.mjs` (puras) siguen valiendo; `sincronizacion.mjs`, `navegador/dos-telefonos.mjs` y `navegador/pf-material.mjs` tocan el relevo (no leí sus cuerpos; NO CONFIRMADO su dependencia exacta).

---

## 8. Contradicciones con el plan (`docs/PLAN-SUPABASE.md`)

1. **Línea 79 (`/jalar_almacen`, `/empujar_almacen` -> «Cliente de Supabase + RLS + Realtime», «igual, sobre las tablas de almacén»).** Subestima. `/empujar_almacen` tiene lógica de servidor que un upsert + RLS no reproduce: sello por campo con las dos tablas de ficha (`.gs:5695`), estado monótono (`.gs:5590`), campos fijos, validación de signo por tipo (`.gs:5565-5570`), permisos por rol y por CAMPO (Pagos: `campos ⊆ {estado,folio_hoja}`, `.gs:5546-5551`), alta que escribe todo aunque venga `campos`, respuesta por operación (`ya_estaba`/`sin_cambio`/`viejos`). Hace falta una función RPC (tipo `empujar_almacen(ops jsonb)`) o triggers, no solo CRUD.
2. **Líneas 91 y 122 (la regla de sellos «se conserva tal cual», `obraDeLaFila`/`sellarFila_`).** Esas dos son de la hoja Ventas (`puente.js:512`, `.gs:2049`). El almacén tiene su propia implementación, distinta: sellos por campo dentro de `almUnaOperacion_` (`.gs:5643-5743`) y, en el cliente, `sync.fusionar` + re-sello `Date.now()` al bajar (`puente.js:1286`, `sync.js:909`). No están cubiertas por el PR #99 ni por lo que el plan manda portar.
3. **Líneas 106-109 (matriz de roles) y 113-116 (dinero aparte).** El plan no dice nada de Pagos en el almacén ni de los costos del almacén. Código: Pagos LEE todo el almacén con costos y ESCRIBE solo la salida `derivado` y `requerimiento -> consumido`; los costos son dos columnas dentro de tablas compartidas (`movimientos.costo_total`, `materiales.costo_compra`). RLS por fila no oculta columnas: hay que separar los costos a otra tabla/vista (como `ventas_dinero`) o usar vistas por rol.
4. **Línea 127 (el espejo escucha cambios de `ventas` y `ventas_dinero`).** Las tres pestañas del almacén no están incluidas, aunque la línea 66 las migra y la hoja debe ser «espejo permanente» (línea 34). Falta decidir: ¿se espejan (hay que escribir un espejo columna-por-encabezado equivalente a `almPestana_`) o se congelan como archivo?
5. **Línea 180 («el material se calcula en el navegador»).** Compatible, pero implica que cada cliente que calcula (Dirección y Fabricación; Pagos solo si se le deja correr avisos y `emitirSalidasDerivadas`) necesita el libro de movimientos COMPLETO y los requerimientos de todos los proyectos. La migración debe entregarlos completos, no por consulta.
6. **Línea 251 (unir lo de los teléfonos «por `Folio cotizacion`»).** Para el almacén la llave de unión es otra: `id` del movimiento/material/requerimiento. Los requerimientos y movimientos referencian `proyecto_id` LOCAL de cada teléfono; el único puente a la venta es `folio_hoja` (`V-042`), que a veces falta (si el proyecto aún no tenía fila al subir). El plan no contempla ese remapeo de ids.
7. **Línea 55 («`movimientos` es append-only»).** Verdad con una excepción en el cliente: `proyectos.juntar` reescribe `proyecto_id` de movimientos locales (`proyectos.js:1916-1919`) sin encolar, así que el libro de un teléfono puede diferir del de la hoja en ese campo. Un `proyecto_id` inmutable en SQL contradice esta operación (que desaparece si hay una sola tabla `proyectos`, pero hay que decidirlo).
8. **Línea 56 (`constantes` por empresa).** Correcto, pero hoy `constantes` ni siquiera viaja: `puente.js:236-240` («Las constantes del taller se quedan en este dispositivo»), y `guardarConstante` encola ops que quedan `sin_destino` para siempre (`material.js:426`). No migrar el renglón `_semilla`.

---

## 9. Hallazgos críticos (los que cambian el diseño)

**H1. Quién emite la salida del corte hoy, y qué cambia con `proyectos` global.** El id `mov-salida:<proyecto_id>:<material>` (`proyectos.js:1178`) usa el id de proyecto LOCAL: `DB.nuevoId('proy')` (`proyectos.js:572`) o `proy-hoja-<folio>` (`457`). Las tarjetas importadas de la hoja nacen con `origen: null` (`proyectos.js:511`), por lo que `Material.recalcular` las rechaza («no trae partidas», `material.js:1051-1053`) y `Mat.requerimientos(p.id)` solo ve líneas con SU `proyecto_id` (`material.js:1022-1034`). Resultado: en la práctica solo el teléfono dueño del proyecto con partidas (el que ganó la cotización) emite la salida; mover a `cortado` una tarjeta importada en Fabricación emite 0 movimientos. NO CONFIRMADO en producción (inferido del código). ARQUITECTURA.md:779 y `proyectos.js:1170-1177` dicen que dos teléfonos emiten «el mismo renglón»: solo es cierto si comparten `proyecto_id`; `puente.js:1167-1168` y `stock.js:513-535` reconocen los ids distintos pero lo resuelven solo al LEER la demanda. Con una tabla `proyectos` única todos los teléfonos verían el mismo id y todos podrían emitir: la PK determinista `mov-salida:<req.id>` (con `ON CONFLICT DO NOTHING` = «ya estaba») pasa a ser el mecanismo principal. En la importación, deduplicar salidas por (venta, material) y reportar.

**H2. Costos en filas compartidas.** `costo_total` y `costo_compra` son las únicas cifras de dinero del almacén; Fabricación no las escribe (se ignoran, `.gs:5694`) ni las recibe (`.gs:5512`); Pagos y Dirección sí. En Postgres RLS no oculta columnas: separar a tablas/vistas.

**H3. La lógica del servidor es de escritura, no solo de seguridad.** Sellos por campo, `estado` monótono, `fijos`, signo por tipo y permisos por campo (ver Contradicción 1). Sin RPC/trigger el almacén de Supabase perdería la protección «consumido no vuelve atrás» y «un cambio atrasado no pisa».

**H4. El cursor de bajada depende de que lectura y escritura se serialicen.** La secuencia es un contador global bajo candado (`.gs:5232-5237`, `5730-5731`, lectura con `tryLock` `5756`), y el cliente guarda el máximo visto (`puente.js:1289-1293`). Una secuencia/identity de Postgres puede hacer visibles filas con número menor después de que un cliente ya vio un número mayor (transacciones que confirman fuera de orden): el cliente las saltaría. Hace falta Realtime + pasada completa periódica (hoy semanal, `puente.js:1244`) o un cursor con solape. NO CONFIRMADO cuál elegirán los implementadores.

**H5. El reloj del teléfono decide quién gana.** `ts = datos.actualizado_en` (`.gs:5674`) y la comparación `sello > ts` (`.gs:5695`); al bajar, el cliente re-sella con `Date.now()` (`puente.js:1286`). Un teléfono con reloj adelantado «congela» un campo del catálogo/lista. Decidir si el servidor sella (`now()`) o se acota el sello.

**H6. `proyecto_id` sin integridad referencial.** Los requerimientos y movimientos llevan un id de proyecto local que puede no existir en `proyectos` (proyectos importados `proy-hoja-*`, tarjetas borradas con `DB.borrar`, `proyectos.js:1921`, `2404`). Una FK estricta haría fallar el import. Igual `movimientos.material_id`: el cliente tolera materiales ausentes del catálogo (`stock.js:224-237`, `existe:false`), y el catálogo de la hoja es un subconjunto porque `sembrar()` no encola (`material.js:501-551`). Sembrar las 19 filas de `semilla.json` ANTES de importar movimientos, o no poner FK a `materiales`.

**H7. Dedupe de requerimientos al unificar ids de proyecto.** Dos teléfonos pueden tener `proy-a:acr-3mm` y `proy-hoja-V-042:acr-3mm` para la misma venta; el cliente hoy colapsa en lectura con «la propia gana» (`stock.js:527-535`). Con un `unique(proyecto_id, material_id)` se necesita una regla (propuesta: preferir `consumido`/`comprado`, luego mayor `actualizado_en`, y reportar). Regla a decidir por Elías.

**H8. Ida y vuelta null/''.** Texto null vuelve `''`, texto largo se truncó a 2000, un texto que empieza con `=+-@` lleva `'` (`.gs:5448-5449`, `5465`). El import debe leer por encabezado, aplicar la misma limpieza de `almDeCelda_` y `nullif`.

**H9. Pagos: «ve el almacén» es una decisión abierta.** Hoy su API lo ve todo (con costos) y su UI nada; los teléfonos de Pagos también EMITEN salidas derivadas. Si se endurece RLS (p. ej. Pagos sin costos del almacén), hay que decidir quién emite las derivadas: quedan en el cliente (necesita leer libro y listas) o pasan a una función de servidor.

**H10. Tope de 25 ops / 64 KB y la secuencia bajo candado son parte del contrato actual** (`.gs:5241`, `2189`); en Postgres no aplican, pero conviene conservar el lote atómico por RPC para que una compra recibida (diez renglones, `stock.js:754-810`) entre completa o no entre (el cliente la guarda local en una sola transacción `ponerVarios`).

---

## 10. Preguntas abiertas / NO CONFIRMADO

1. Número real de renglones en «Almacén», «Catálogo de material» y «Listas de compra», y valor de la propiedad de script `ALMACEN_SECUENCIA` (sugiero contar filas con `Id` no vacío y leer esa propiedad). No se leyó la hoja viva.
2. Qué versión del Apps Script corre la hoja de producción (`/salud` -> `version`; el repo declara `puente-sheets-14`). Si es < 9, el almacén aún vive solo en los teléfonos.
3. Cuántos teléfonos tienen ops de almacén en la bandeja (`sin_destino`/`rechazada`/`pendiente`) sin subir.
4. ¿Pagos debe leer el almacén con costos en Supabase, sin costos, o nada? (H9)
5. ¿La salida derivada pasa a una función de servidor (cron/RPC) o se queda en el cliente? (H1, H9)
6. ¿Quién sella: reloj del cliente o `now()` del servidor? (H5)
7. ¿Se espejan a la hoja las tres pestañas del almacén? (Contradicción 4)
8. Regla de dedupe de requerimientos/movimientos al unificar `proyecto_id` y cómo se remapean los ids locales sin `folio_hoja`. (H1, H6, H7)
9. ¿`constantes` y la semilla de 19 materiales las siembra el servidor por empresa y los clientes dejan de correr `sembrar()` (`app.js:1756-1761`)?
10. NO CONFIRMADO: el contenido de `pruebas/sincronizacion.mjs`, `pruebas/stock.mjs`, `pruebas/material.mjs` y `navegador/*` (no los leí; solo `puente-almacen.mjs` completo).
11. NO CONFIRMADO: si el desempate `String(a.id).localeCompare(String(b.id))` del libro (`stock.js:139`) debe reproducirse en SQL (solo afecta empates exactos de `ts`; con `COLLATE "C"` el orden podría diferir de `localeCompare`). Solo importa si la existencia se calcula alguna vez en SQL.

---

## 11. Anexo: referencias de código por tema

- Hojas y vocabulario: `.gs:5189-5368`. Pestaña/celdas: `5371-5514`. Secuencia: `5520-5533`. Permisos: `5535-5553`. Validación: `5555-5584`. Estado: `5586-5594`. Empujar: `5596-5743`. Jalar: `5745-5781`. Ruteo: `2259-2260`. Roles: `2120-2153`. Cupos: `2164`, `2412-2430`.
- Cliente libro: `stock.js` (153-376 existencia/apéndice; 388-460 conteo; 462-598 demanda; 600-739 lista de compra; 741-810 recibir compra; 812-918 avisos y valor).
- Cliente catálogo/listas: `material.js` (50-73 cola y campos; 258-340 guardar; 356-434 constantes; 501-551 sembrar; 1022-1185 requerimientos y ajuste; 1220-1274 calibración).
- Sincronización: `sync.js` (136-145 vocabulario; 293-329 encolar; 482-707 bombear; 738-876 jalar; 909-927 fusionar); `puente.js` (202-211 almacenes; 1157-1306 subir/bajar; 2021-2052 enchufe).
- Esquema local: `db.js:60-84`; sellado `db.js:213-238`; importación `db.js:450-500`.
- Corte y salidas: `proyectos.js:1129-1325`; excepciones: `proyectos.js:1911-1921`.
- Navegación/roles UI: `app.js:70-108`; sondeo `app.js:1832-1842`, `1921`, `2030-2077`.
