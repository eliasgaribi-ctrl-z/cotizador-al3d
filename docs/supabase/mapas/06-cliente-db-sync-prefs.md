# Mapa 06 — Cliente: db.js, sync.js, prefs.js, bitacora.js, geo.js, conservar.js, respaldo.mjs, replicas.mjs

Repo: `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase` (todas las rutas de abajo son relativas a él).
Todo lo de aquí describe el CÓDIGO REAL a HEAD `3dbd293` (PR #99 ya incluido). Lo que no pude confirmar va marcado «NO CONFIRMADO».
Para armar las formas de objeto tuve que leer, además de mis 8 archivos, los módulos que escriben en cada almacén (`proyectos.js`, `agenda.js`, `material.js`, `stock.js`, `reglas.js`, `puente.js`, `ajustes.js`, `puerta.js`, `ingreso.js`, `app.js`, y de lado del cotizador `historial.js`, `venta.js`, `imagenes.js`, `entrega.js`).

---------------------------------------------------------------------------------------------------

## 0. Resumen de lo que cambia el diseño (leer primero)

1. `esperaMs()` (el «backoff exponencial») es CÓDIGO MUERTO: nadie la llama (`js/datos/sync.js:714`; grep en `js/` y `pruebas/`: cero usos). El reintento real es: 1.5 s después de cada `encolar`, al arrancar, al evento `online`, al volver a la pestaña y cada 30 s con la app visible (`js/app.js:1819,1830,1837-1842`, `MS_SINCRONIZAR=30000` L1921). NO hay tope de intentos, NO hay espera creciente, NO se descarta nada por edad. `intentos` solo se cuenta; no gobierna nada.
2. `esperado` es SIEMPRE `null` en toda operación que existe (todos los que encolan pasan `esperado: null`: `proyectos.js:69`, `agenda.js:57`, `material.js:58`, `stock.js:45`, `reglas.js:847`, `proyectos.js:1204`). El Apps Script nunca contesta `CONFLICTO` (grep en `puente/hoja-apps-script.gs`: cero). Por tanto el estado `conflicto` de la bandeja y `Sync.resolver/conflictos` son rutas inalcanzables en producción (solo las toca una prueba de navegador, `pruebas/navegador/puente.mjs:498`).
3. Hoy NO existe «acceso revocado» con borrado de datos. Cuando la hoja dice que el correo ya no tiene acceso (`estado:'fuera'`), la app SOLO hace `Prefs.borrarPase()` y vuelve a poner la puerta (`js/nucleo/puerta.js:197,225,246,428,609,632,1293`). `Salir` tampoco borra nada (`puerta.js:1290-1295`). El único borrado de datos es el «cordón» manual de Ajustes (`js/mod/ajustes.js:1709-1756`) y deja fuera la mitad del cotizador (ver §4).
4. El almacén `blobs` está declarado pero NADIE escribe en él (grep `'blobs'`: solo `db.js` y `ajustes.js:1630` que lo cuenta). Las imágenes de referencia reales viven en OTRA IndexedDB, `al3d_cot_imgs` (`js/cotizador/imagenes.js:18`) y como dataURL dentro de `al3d_historial[].aiFile.url`. Esa IDB NO entra a ningún respaldo.
5. `geo` tampoco recibe escrituras: su único escritor, `Geo.geocodificar` (`geo.js:318`), no tiene ningún llamador en `js/`.
6. `bitacora` nunca sale del teléfono: nadie la encola y `puente.js:202` (`ALMACENES`) no la lleva. Cada teléfono tiene SU bitácora y nada más. Igual `constantes` y `avisos`: se encolan (`material.js:426`, `reglas.js:846`) y quedan apartadas como `sin_destino` para siempre (`puente.js:236-240`).
7. El cotizador (iframe) escribe a la hoja POR SU CUENTA, fuera de la bandeja: `js/cotizador/venta.js:299-311,414` lee `al3d_pf_puente` ({url, token}) del localStorage y hace POST `empujar` con SOLO el token de dispositivo. Y `notario.js:62` igual. Cuando se retiren los tokens (fase 5) eso se rompe.
8. `Prefs.empresa()` (`prefs.js:323`) nunca cambia: no existe ningún `Prefs.set(CLAVES.EMPRESA, …)` ni UI en Ajustes (grep `empresa` en `ajustes.js`: cero). Devuelve `'al3d'`. El mensaje de `proyectos.js:970` («La empresa se cambia en ajustes») es falso.
9. `DB.poner` SIEMPRE reescribe `actualizado_en = Date.now()` (`db.js:229-230`), también cuando lo llama `sync.jalar` con filas de la hoja (`sync.js:800,814`) y las marcas locales (`proyectos.js:1837`). Así `actualizado_en` NO es la hora real de edición. Las horas reales por dato viven en `proyectos.sellos` y en `instalaciones.sello_hoja`/`sello_hoja_en`.
10. `conservar.js` NO tiene nada que ver con datos: es el planificador de qué pantallas-marco (iframe) se conservan vivas en el router. No migrar, no tocar.

---------------------------------------------------------------------------------------------------

## 1. IndexedDB `al3d_pf` — esquema físico (`js/datos/db.js`)

- Nombre: `al3d_pf` (`db.js:22`). Versión: `3` (`db.js:29`). v2 = nació `bitacora`; v3 = nació `ventas_hoja` (`db.js:23-28`).
- `onupgradeneeded` (L105-119): para cada nombre de `ALMACENES` crea el almacén si falta y crea los índices que falten. NO hay migraciones de datos (`ev.oldVersion` sin usar, L116-118). Nunca se borra un almacén.
- Estado de apertura: `estado()` → `{ok, motivo}`; motivos: `ok | sin_abrir | sin_indexeddb | bloqueada | sin_espacio` (L142-154).
- Reglas de la capa: las lecturas nunca lanzan (devuelven `[]`, `null` o `0`); las mutaciones devuelven `Resultado` `{ok:true,valor}|{ok:false,codigo,mensaje}` y nunca lanzan. Códigos: `DB_NO_DISPONIBLE`, `SIN_ESPACIO`, `NO_ENCONTRADO`, `DATO_INVALIDO`, `DESCONOCIDO` (L44-50, 204-207).
- Sellado automático en `poner` (L213-238): `actualizado_en = Date.now()` SIEMPRE; `creado_en` = el del registro previo, o el que traiga el registro, o ahora. `ponerVarios` (L250-280): `actualizado_en = ahora` (o el del registro si `conservarSello` y es >0), `creado_en = reg.creado_en || ahora`. «Todo o nada» por aborto de transacción.
- Identificadores `DB.nuevoId(prefijo)` (L368-375): `prefijo + '-' + Date.now().toString(36) + '-' + 6 chars` (ej. `proy-mh3k9x1a-4f7q2z`, `op-…`, `mov-…`, `inst-…`, `bit-…`).

| Almacén | keyPath | Índices (nombre → campo) | ¿Se consulta el índice? | ¿Entra al respaldo? | ¿Se encola a la bandeja? | ¿Lo lleva el puente a la hoja? |
|---|---|---|---|---|---|---|
| `proyectos` | `id` | `porEtapa`→`etapa`; `porFecha`→`fecha_ganado`; `porFolio`→`folio_global` | porEtapa (`proyectos.js:898`), porFolio (`proyectos.js:649`, `puente.js:2135`); porFecha NO | sí | sí (`proyectos.js:64`) | sí |
| `instalaciones` | `id` | `porFecha`→`fecha`; `porProyecto`→`proyecto_id` | porProyecto (`proyectos.js:1853`, `puente.js:1345`); porFecha NO | sí | sí (`agenda.js:52`) | sí |
| `materiales` | `id` | `porFamilia`→`familia` | NO | sí | sí (`material.js:50`) | sí (pestaña «Catálogo de material», solo si la hoja es ≥ puente-sheets-9) |
| `movimientos` | `id` | `porMaterial`→`[material_id, ts]`; `porProyecto`→`proyecto_id`; `porSync`→`sync` | porMaterial y porProyecto (`stock.js:247,852,853`); porSync NO | sí | sí, tipo `apendice` (`stock.js:39`) | sí (pestaña «Almacén») |
| `requerimientos` | `id` | `porProyecto`→`proyecto_id`; `porMaterial`→`material_id` | porProyecto (`material.js:1024,1063`); porMaterial NO | sí | sí (`material.js:50`, `proyectos.js:1203`) | sí (pestaña «Listas de compra») |
| `avisos` | `rid` | `porEstado`→`estado` | NO | sí | sí (`reglas.js:846`) | NO → queda `sin_destino` |
| `constantes` | `clave` | — | — | sí (incluye fila `_semilla`) | sí (`material.js:426`) | NO → queda `sin_destino` |
| `pendientes` | `id` | `porTs`→`ts` | sí (`sync.js`, siempre `porTs`) | NO (`NO_RESPALDA`) | es la bandeja | — |
| `geo` | `q` | — | — | sí | NO | NO |
| `blobs` | `id` | — | — | sí (con `blob`→`dataUrl`) | NO | NO |
| `bitacora` | `id` | `porTs`→`ts`; `porEntidad`→`entidad_id` | ambos (`bitacora.js:88,90`) | sí | NO | NO |
| `ventas_hoja` | `id` | `porFecha`→`fecha_anticipo`; `porFolio`→`folio_cotizacion` | NO (siempre `DB.listar('ventas_hoja')` completo) | NO (`NO_RESPALDA`) | NO (solo baja) | solo baja (`ESPEJOS`, `puente.js:230`) |

Filas «marca» dentro de almacenes (id que empieza con `_`; los lectores las filtran): `pendientes._marcas` (sync.js:155), `pendientes._almacen_hoja` (puente.js:1245), `constantes._semilla` (material.js:540). `esMarca` = `!r || typeof r.id !== 'string' || r.id.charAt(0) === '_'` (sync.js:238). La fila `constantes._semilla` tiene `clave:'_semilla'`; `DB` no la filtra: la filtran los lectores con `esInterna()` (`material.js:349`). Las de `pendientes` las filtra cada lector (`esMarca` en `sync.js`; `charAt(0)==='_'` en `puente.js:1252,1778,1812`).

Campos de plomería que TODAS las filas llevan: `creado_en` (ms), `actualizado_en` (ms), y en los almacenes de negocio `sync` (0 = cambio local sin confirmar; 1 = escrito por una bajada). `sync` NUNCA vuelve a 1 tras una subida exitosa (nadie lo actualiza; grep `sync: 1` solo en `sync.js:800,808,925,963`): no sirve como «ya subido». El índice `porSync` jamás se usa. `puente.js:1174` lo quita antes de mandar a la hoja.

---------------------------------------------------------------------------------------------------

## 2. Forma de cada almacén (campo, tipo, ejemplo)

Convención: «ms» = `Date.now()` entero. `ISO` = `AAAA-MM-DD`.

### 2.1 `proyectos` — dos orígenes

Creado por `armarProyecto` (`proyectos.js:545-641`, desde una cotización ganada/`descartar`) o por `desdeVentaDeHoja` (`proyectos.js:440-519`, importado de una fila de la hoja).

| Campo | Tipo | Ejemplo | Notas |
|---|---|---|---|
| `id` | string | `"proy-mh3k9x1a-4f7q2z"` / `"proy-hoja-V-214"` | importado: determinista `'proy-hoja-'+folio_hoja` |
| `empresa_id` | string | `"al3d"` | `Prefs.empresa()`; BLOQUEADO para editar (`proyectos.js:970`) |
| `folio_local` | string | `"COT-0042"` | folio impreso |
| `dispositivo` | string | `"K7QM"` / `"hoja"` | quién ganó la venta (4 letras) |
| `folio_global` | string | `"COT-0042@K7QM"` | `folio + '@' + disp` (`cotizador.js:186`). Importado: `""`. Llave de dedupe (`yaExiste`) |
| `folio_hoja` | string | `"V-214"` | solo importados al crear; en los del cotizador lo pone la bajada al atar la fila |
| `de_hoja` | bool | `true` | solo importados (junto con `origen:null`) |
| `nombre` | string | `"Ale - Parentesis (Caja Luz Mostrador)"` | derivado `contacto - negocio (etiquetas)` |
| `contacto`, `negocio` | string | `"Ale"`, `"Parentesis"` | |
| `tel` | string | `"33 1234 5678"` | ≤30, regla `telefonoLimpio` (`proyectos.js:397`) |
| `etapa` | string | `"ganado"` | `ganado\|en_diseno\|cortado\|armado\|listo\|instalado\|garantia\|cancelado` (`proyectos.js:90`) |
| `tipo_trabajo` | string[] | `["Letras 3D con iluminacion"]` | 7 valores cerrados (`proyectos.js:132-140`) |
| `fecha_ganado` | ISO | `"2026-10-08"` | |
| `compromiso_texto` | string | `"3 semanas después del anticipo"` | texto crudo, no se parsea |
| `dir_texto`, `entrecalles` | string | | |
| `maps_url` | string | | link tal cual lo pegaron (puede ser corto `maps.app.goo.gl`) |
| `lat`, `lng` | number\|null | `20.6736`, `-103.344` | null = sin ubicar; (0,0) se rechaza |
| `geo_fuente` | string | `"maps_pin"` | `maps_pin\|maps_camara\|sin_ubicar\|manual\|coordenadas\|geo_uri\|maps_query\|maps_search\|maps_place\|maps_dir\|nominatim` |
| `entrega` | string | `"instalacion"` | `instalacion\|paqueteria\|recoleccion` (`entrega.js:24`) |
| `ubicacion_pendiente` | bool (opcional) | `true` | solo si se registró «todavía no la tengo» (`proyectos.js:601`); NO viaja a la hoja |
| `sub`, `neto`, `precio_auth` | number | `10000`, `11600`, `11600` | congelados; no se recalculan |
| `anti_pactado` | number | `5800` | |
| `iva` | bool | `true` | |
| `notion_page_id` | string\|null | `"V-214"` | = folio interno de la fila de la hoja (id_notion). null hasta que sube |
| `notion_estado` | string | `"pendiente"` | `pendiente\|enviado\|fallido` |
| `estatus_notion` | string\|null | `"FABRICACION"` | `FABRICACION\|REPARANDO\|COBRANDO\|LIQUIDADO` (`puente.js:155`) |
| `cuenta` | string\|null | `"Elias BBVA"` | `Elias BBVA\|Constru BNT\|Moni MPago\|Rul HSBC\|Tatis BNT` (`puente.js:157`) |
| `pago_pendiente`, `comision_restante` | number\|null | `5800`, `580` | fórmulas de la hoja; solo bajan |
| `pct_comision` | number | `10` | puntos (10 = 10 %) |
| `plazo_k` | 1..5\|null | `3` | `null` = «manda el propuesto» |
| `origen` | object\|null | ver abajo | copia congelada de la entrada del historial; null en importados |
| `notas` | string | | |
| `sellos` | object | `{"etapa":1760000000000,"tel":…,"dir_texto":…,"ubicacion":…,"entrega":…,"plazo_k":…}` | hora de cambio por dato (`SELLO_DE_CAMPO`, `proyectos.js:529`). Claves: `etapa,notas,plazo_k,tel,dir_texto,ubicacion,entrega` (la cita usa el sello de la instalación, no uno aquí) |
| `creado_en`,`actualizado_en`,`sync` | ms,ms,0\|1 | | |

Marcas LOCALES de reconciliación con la hoja (no viajan; se escriben con `DB.poner` directo, sin encolar; cada escritura sube `actualizado_en`): `hoja_confirmada` string (V-folio); `hoja_perdida` `{motivo:'borrada'|'de_otra'|'no_bajo', folio, desde:ms, mensaje}` (`proyectos.js:1520`); `fuera_de_hoja` ms\|null; `sin_mandar` `{desde:ms, campos:string[]}`\|null (`:1650`); `duplicado_de` `{id,nombre,folio,folio_hoja,desde,por:string[],claves:string[]}`\|null (`:1981`); `distinta_de` string[]; `hoja_doble` `{folios:string[], desde}`\|null (`:2057`); `folios_previos` string[]; `tel_a_la_hoja` string; `entrega_a_la_hoja` string; `obra_a_la_hoja` string (huella). Para Supabase estas marcas desaparecen con la hoja como fuente (son «la hoja y este teléfono no cuadran»).

`origen` (copia de `historial[]`, `historial.js:119-162`, con `aiFile.url` vaciado por `congelar`, `proyectos.js:344`): `folio, proy, cliente, tel, dirRaw, direccion, maps, entrecalles, entrega, notaCliente, fecha, plazoK, fechaAuth, autorizador, nota, precioAuth, neto, sub, iva, huellaAuth, sello, anti, antiManual, items[] (partidas con `_lt`), itemsAuth{}, aiFile{name,type,url:''}, renders[], propuesta[], disp, ts, reenviada, fuente`.

Roles que escriben cada campo: `ESCRIBIBLES` (`proyectos.js:954`), `CAMPOS_ROL` (`:982`; dirección todo; fabricación `notas,lat,lng,geo_fuente,maps_url,entrecalles,plazo_k,entrega,tel,dir_texto,sync`; pagos `notas,cuenta,estatus_notion,notion_page_id,notion_estado,pct_comision,tel,sync`), `TOPE_ROL` etapa (`:1116`: dirección null, fabricación hasta `listo`, pagos no mueve). `BLOQUEADOS` (`:963`): `origen,folio_global,folio_local,creado_en,id,dispositivo,empresa_id,etapa,pago_pendiente,comision_restante,sub,neto,precio_auth,iva`.

Ejemplo (nacido del cotizador, recortado):
```json
{"id":"proy-mh3k9x1a-4f7q2z","empresa_id":"al3d","folio_local":"COT-0042","dispositivo":"K7QM","folio_global":"COT-0042@K7QM",
 "nombre":"Ale - Parentesis (Caja Luz)","contacto":"Ale","negocio":"Parentesis","tel":"33 1234 5678","etapa":"ganado",
 "tipo_trabajo":["Caja de luz con iluminacion"],"fecha_ganado":"2026-10-08","compromiso_texto":"","dir_texto":"Av. Vallarta 123",
 "entrecalles":"","maps_url":"https://maps.app.goo.gl/xxxx","lat":null,"lng":null,"geo_fuente":"sin_ubicar","entrega":"instalacion",
 "sub":10000,"neto":11600,"precio_auth":11600,"anti_pactado":5800,"iva":true,"notion_page_id":null,"notion_estado":"pendiente",
 "estatus_notion":"FABRICACION","cuenta":"Elias BBVA","pago_pendiente":null,"comision_restante":null,"pct_comision":10,"plazo_k":null,
 "origen":{"folio":"COT-0042","items":[{"id":1,"tipo":"caja","_lt":10000}],"neto":11600,"…":"…"},"notas":"",
 "sellos":{"etapa":1760000000000,"tel":1760000000000,"dir_texto":1760000000000,"ubicacion":1760000000000,"entrega":1760000000000},
 "creado_en":1760000000000,"actualizado_en":1760000000000,"sync":0}
```

### 2.2 `instalaciones` (`agenda.js:278-295`; bajada de la hoja `puente.js:773-787`)
| Campo | Tipo | Ejemplo | Notas |
|---|---|---|---|
| `id` | string | `"inst-mh3k…-ab12cd"` | |
| `empresa_id` | string | `"al3d"` | las de la hoja: `proyecto.empresa_id \|\| o.empresa \|\| ''` (puede ser `''`) |
| `proyecto_id` | string | `"proy-…"` | id LOCAL del teléfono (en otro teléfono la misma venta tiene otro id) |
| `fecha` | ISO | `"2026-10-20"` | |
| `hora` | `"HH:MM"`\|null | `"10:00"` | null = «sin hora» |
| `ventana` | string | `"dia"` | `dia\|noche\|madrugada` (se aceptan heredados `manana\|tarde`→dia) |
| `duracion_min` | int | `240` | 1..600 |
| `estado` | string | `"confirmada"` | `propuesta\|confirmada\|reagendada\|hecha\|cancelada` (dirección crea `confirmada`; otros `propuesta`) |
| `movida` | int | `0` | = SEQUENCE del .ics; sube al reagendar y al cancelar |
| `uid_ics` | string | `"inst-<id>@al3d.mx"` | NUNCA cambia |
| `gcal_event_id` | null | `null` | SIEMPRE null: `fabricacion.js:1529` dice que no se guarda (el id de Calendar es determinista). Contradice al plan §4.9 |
| `notas` | string | | se anexan renglones «Movida del … al …» |
| `sello_hoja`,`sello_hoja_en` | ms | | solo si la cita bajó de la hoja (`puente.js:807`) |
| `creado_en`,`actualizado_en`,`sync` | | | las creadas desde la hoja no traen `sync` |

### 2.3 `materiales` (`material.js:301-316`; semilla `:469-491`)
`id` (slug, ej. `"acr-3mm"`), `empresa_id`, `nombre`, `familia` (`acrilico|aluminio|lamina|fleje|vinil|iluminacion|estructura|herraje|consumible|sin_familia`), `unidad_consumo` (`m2|m|cm|pieza|litro`), `unidad_compra` (`unidad|bolsa|caja|lamina|litro|metro`), `medida` string, `factor` number>0, `factor_origen` string (obligatorio), `largo_cm`/`ancho_cm` number\|null, `espesor` string, `merma_pct` number [0,1), `fraccionable` bool, `min_compra` number, `min_stock` number, `costo_compra` number\|null, `proveedor` string, `tel_proveedor` string, `activo` bool, `sync`, `creado_en`, `actualizado_en`. Semilla: `datos/semilla.json` = 19 materiales, se siembra con `actualizado_en:1` (`material.js:532`). Ejemplo: `{"id":"acr-3mm","empresa_id":"al3d","nombre":"Acrílico blanco/opal 3 mm","familia":"acrilico","unidad_consumo":"m2","unidad_compra":"lamina","medida":"1.22 × 2.44 m","factor":2.9768,"factor_origen":"1.22 m × 2.44 m = 2.9768 m² por lámina…","largo_cm":244,"ancho_cm":122,"espesor":"","merma_pct":0.25,"fraccionable":true,"min_compra":1,"min_stock":0,"costo_compra":null,"proveedor":"","tel_proveedor":"","activo":true,"sync":0,"creado_en":1,"actualizado_en":1}`.

### 2.4 `requerimientos` (`material.js:1077-1091`; `proyectos.js:1196`)
`id` = `<proyecto_id>:<material_id>` (determinista, ej. `"proy-…:acr-3mm"`), `empresa_id`, `proyecto_id`, `material_id`, `cantidad_consumo` number, `unidad_consumo` string, `cantidad_compra` number, `unidad_compra` string, `partidas` number[] (ids de partida), `formula` string (texto auditable), `confianza` (`exacta|estimada|requiere_dato`), `requiere` string (frases unidas con ` · `), `constantes_version` string (ej. `"c-2026-08.4kz1"`), `cantidad_ajustada` number\|null (corrección humana), `motivo_ajuste` string, `ajustado_por` string (= `Prefs.sello()`), `ajustado_en` ms, `estado` (`calculado|apartado|comprado|consumido|descartado`), `creado_en`, `actualizado_en`, `sync`. Los `descartado` NO se borran (guardan la corrección).

### 2.5 `movimientos` — libro append-only (`stock.js:343-370`, `:785-793`)
`id` (`"mov-<ts36>-<rand>"`; para salidas al cortar es DETERMINISTA: `"mov-salida:"+requerimiento.id`, `proyectos.js:1178`), `empresa_id`, `material_id`, `tipo` (`entrada|salida|ajuste|conteo|merma|devolucion`), `cantidad` number CON SIGNO (salida/merma negativas; `conteo` y `ajuste` toman el número tal cual), `unidad_compra`, `proyecto_id` string\|null, `requerimiento_id` string\|null, `origen` (`derivado|manual|conteo|compra`), `costo_total` number\|null, `nota` string, `ts` ms (lo pone la capa, nunca quien llama), `usuario` (= `Prefs.nombre()`, texto libre ≤40, NO es correo), `rol`, `dispositivo` (4 letras), `sello` (`"Beto · Fabricación (K7QM)"`), `sync`, `creado_en`, `actualizado_en`. Existencia = último `conteo` + suma de lo posterior (`stock.js:153`).

### 2.6 `constantes`
`{clave, valor:number, unidad:string, nota:string, version:string, actualizado_por:string(Prefs.sello()), creado_en, actualizado_en}` (`material.js:417-423`; semilla `:520-525`). SIN `empresa_id` y SIN `sync`. 20 constantes de taller (`CTS_BASE`: `K_ANCHO_CAJA,K_PERIM_recta,K_PERIM_cursiva,K_PERIM_compleja,K_AREA_RECORTE,APROV_NESTING_simple,APROV_NESTING_irregular,APROV_TIRAS,PROF_CANTO_CM,PROF_CAJA_CM,MOD_POR_M2,MOD_POR_M2_CAJA,W_MODULO,CAP_FUENTE_W,DERATE_FUENTE,TRAVESANO_CM,REMACHE_CM,SEPARADORES_LETRA,PLAZO_COLCHON_DIAS,PLAZO_PROVEEDOR_DIAS`; `material.js:174-182`; la semilla trae las mismas 20; los comentarios dicen «18»: obsoleto). `VERSION_BASE='c-2026-08'`. Fila marca `{clave:'_semilla', valor:0, nota, version:'s-2026-08', ids:string[], claves:string[]}` (`material.js:540-547`) = lo ya sembrado para no resucitar lo borrado: no migrar.

### 2.7 `avisos` (`reglas.js:802-815`, `decidir` `:833-839`)
`{rid:"A7:proy-…" (regla+':'+sufijo), regla, entidad, entidad_id, rol (solo roles[0]), titulo, cuerpo, severidad, vence, estado ('pendiente'|'atendido'|'postergado'|'descartado'), postergado_hasta ISO|null, gcal_event_id|null, visto_en, resuelto_en, sync, creado_en, actualizado_en}`. Se recalculan en cada teléfono; solo la decisión humana (`estado`/`postergado_hasta`) es dato. Sin `empresa_id`.

### 2.8 `geo`
`{q:string (consulta normalizada: trim, espacios colapsados, minúsculas), ts:ms, hallado:bool, lat:number|null, lng:number|null, nombre:string, creado_en, actualizado_en}` (`geo.js:355-359`). TTL 90 días (`geo.js:289`). Efectivamente VACÍO: `geocodificar` sin llamadores en `js/`.

### 2.9 `blobs`
Sin forma definida: `keyPath id`; el respaldo asume `{id, blob:Blob, …}` y lo serializa como `{…resto, dataUrl}` (`db.js:406-429`). Sin escritores en el código ⇒ vacío en todos los teléfonos (NO CONFIRMADO en los aparatos reales: solo por lectura de código). «Fotos de obra» en la pantalla de borrado (`ajustes.js:1638`) cuenta este almacén vacío.

### 2.10 `bitacora` (`bitacora.js:53-77`)
`{id:"bit-…", ts:ms, accion:string ('gano','descarto','etapa','cambio','agendo','reagendo','marco','cancelo','guardo','conteo','compra','restauro'…), entidad:'proyecto'|'instalacion'|'material'|'constante'|'almacen'|'plataforma', entidad_id:string ('' si no aplica; id de proyecto/material/clave), titulo:string(≤200), detalle:string(≤600), antes:any|null, despues:any|null, usuario:string(nombre libre), rol:string, dispositivo:string, sello:string, creado_en, actualizado_en}`. Append-only: la restauración descarta un id ya presente (`db.js:490`). Sin `empresa_id`. Nunca se encola.

### 2.11 `ventas_hoja` (espejo de la hoja, `puente.js:629-698`)
`id:"hoja:V-042"` (= `'hoja:'+(folio_hoja||folio_cotizacion||nombre)`), `folio_hoja`, `folio_cotizacion` (el `folio_global` del proyecto; si la fila no nació en el cotizador puede ser igual a `folio_hoja` o vacío), `nombre`, `cuenta`\|null, `estatus`\|null, `tipo_trabajo` string[], `iva` bool, `fecha_anticipo`/`fecha_instalacion`/`fecha_liquidacion` ISO o `''`, `etapa`\|null, `direccion`, `ubicacion` (`"lat,lng"` o link), y SOLO si la hoja manda la columna: `telefono`, `entrega`, `notas`, `plazo_k`, `sellos{grupo:ms}`; dinero SOLO si el rol lo recibe: `sub, neto, anticipo, liquidacion, pago_pendiente, comisiones, abono_comision, comision_restante, pct_comision` (number|null; ausente≠null: fabricación recibe la fila sin dinero). `+ sync:1, creado_en, actualizado_en`. Se BORRAN al cerrar un barrido completo las que la hoja ya no trae (`sync.js:823-837`). No entra al respaldo.

### 2.12 `pendientes` — ver §3.

### 2.13 Otra IndexedDB del cotizador: `al3d_cot_imgs`
`js/cotizador/imagenes.js:18-49`: DB `al3d_cot_imgs` v1, almacén `img`, keyPath `id`, filas `{id:"img-<ts36>-<rand6>", url:<dataURL JPEG, lado máx 1800 px>, w, h, ts}`. Las referencian `items[].plano`, `Q.renders`, `Q.propuesta` (ids) dentro de `al3d_historial`. NO entra a `DB.exportar` ni a `RESPALDO_KEYS` («llegaron en un respaldo sin ellas», `imagenes.js:199`). Limpieza: borra lo no referenciado con más de 7 días (`imagenes.js:75-84`).

---------------------------------------------------------------------------------------------------

## 3. La bandeja de salida `pendientes` (`js/datos/sync.js`)

### 3.1 Forma exacta de una operación (la escribe `encolar`, `sync.js:293-329`)
```json
{
 "id": "op-mh3k9x1a-4f7q2z",
 "tipo": "crear|actualizar|apendice",
 "almacen": "proyectos", "entidad": "proyectos",
 "registro_id": "proy-…",  "entidad_id": "proy-…",
 "datos": { /* foto COMPLETA del registro al encolar */ },
 "campos": ["etapa"] ,
 "esperado": null,
 "ts": 1760000000000,
 "disp": "K7QM",
 "intentos": 0,
 "ultimo_error": "",
 "estado": "pendiente",
 "conflicto": null,
 "sync": 0,
 "creado_en": 1760000000000, "actualizado_en": 1760000000000
}
```
- `almacen`/`entidad` y `registro_id`/`entidad_id` son duplicados a propósito (`sync.js:284-289`). `registro_id`: `registro.id` salvo `constantes` (`clave`) y `avisos` (`rid`) (`material.js:56`, `reglas.js:846`).
- `tipo`: `crear|actualizar|apendice`; cualquier cosa en `movimientos` se fuerza a `apendice` (`sync.js:300-304`). `registro_id` y `almacen` vacíos ⇒ `DATO_INVALIDO`, no se guarda.
- `campos`: `string[]|null`; `null` = «todo» (alta). Lo llenan `proyectos.actualizar`, `avanzarEtapa` (`['etapa']`), `resincronizar` (`camposDelRecalculo`), `guardarMaterial`/`recalcular`/`ajustar` (`material.js`), `emitirSalidasAhora` (`['estado']`). Para una hoja ≥14 se usa para no pisar dinero/nombre.
- `ts`: ms de encolado; define el ORDEN de la cola (índice `porTs`). Las marcas llevan `ts:0`.
- `datos` para `proyectos` es el proyecto ENTERO, incluido `origen.items` (cargas grandes por operación).
- Campos que aparecen después según el estado: `codigo_rechazo` string|null, `motivo_rechazo` string|null (p. ej. `'de_otra'`), `revivida_tel|revivida_entrega|revivida_obra: true`, `conflicto` (objeto remoto).
- No hay deduplicación ni coalescencia: cada escritura local = una operación nueva con id nuevo; varias operaciones sobre el mismo registro viajan en orden, cada una con su foto.

### 3.2 Quién encola qué
| Módulo | `almacen` | `tipo` | `campos` | Disparador |
|---|---|---|---|---|
| `proyectos.js:64` | `proyectos` | `crear`/`actualizar` | según el cambio | ganar, descartar, actualizar, avanzarEtapa, resincronizar, volverADarDeAlta |
| `agenda.js:52` | `instalaciones` | `crear`/`actualizar` | no lleva | agendar, reagendar, marcar |
| `material.js:50` | `materiales`, `constantes`, `requerimientos` | `crear`/`actualizar` | diferencias | guardarMaterial, guardarConstante, recalcular, ajustar |
| `proyectos.js:1203` | `requerimientos` | `actualizar` | `['estado']` | salida de material al cortar |
| `stock.js:39` | `movimientos` | `apendice` | no lleva | mover, contar, recibirCompra |
| `reglas.js:846` | `avisos` | `actualizar` | no lleva | atender/postergar/descartar |
Nadie encola `bitacora`, `geo`, `blobs`, `ventas_hoja`.

### 3.3 Estados y transiciones
`estado` ∈ `pendiente` (o ausente = pendiente, `sync.js:426`) · `conflicto` · `sin_destino` · `rechazada`.
- `encolar` → `pendiente`; programa bombeo a 1500 ms (debounce: `clearTimeout`; solo si `configurado()` y `navigator.onLine !== false`) (`sync.js:338-348`).
- `pendiente` → (borrada) por éxito, o por `omitida:true` (despachada sin mandar; no cuenta como subida).
- `pendiente` → `sin_destino` si el relevo no lleva ese almacén (`lleva()`=false) o contesta `SIN_DESTINO` (`sync.js:555-559, 598-601`). Vuelve sola a `pendiente` en el primer bombeo en que el relevo ya la lleve (`revivirSinDestino`, L499-509).
- `pendiente` → `rechazada` si la respuesta trae `definitivo:true` (L605-618). El relevo marca definitivos `ROL_SIN_PERMISO|NO_ENCONTRADO|DATO_INVALIDO` (`puente.js:1190,1506`). No para el bombeo. Cuenta como `fallidas` y `rechazadas`. Sale de ahí por `reintentarRechazadas()` (botón de Ajustes; reinicia `intentos:0`) o por `revivirRechazadas` (L516-531, una sola vez por marca `revivida_*`).
- `pendiente` → `conflicto` si `codigo==='CONFLICTO'` (L620-631). NUNCA ocurre con el Apps Script real.
- Fallo no definitivo: se queda `pendiente` con `intentos+1` y `ultimo_error` (L633-639).
- Salidas manuales: `resolver(id,'mio'|'suyo')` (L942-967), `descartarDelProyecto(proyectoId, estados)` (L404-413; por omisión solo `rechazada`, nunca `conflicto`).

### 3.4 `bombear()` (L482-707)
1. Una sola promesa en vuelo (`_bombeando`); quien llega segundo espera la misma.
2. Si `configurado()`: `revivirSinDestino()` y `revivirRechazadas()`.
3. `cola = pendientes()` = índice `porTs` sin marcas y sin `conflicto|sin_destino|rechazada`.
4. Sin `configurado()` → `ok({…conteoVacio, pendientes:cola.length, motivo:'sin_puente', sin_adaptador:true, mensaje})`. Offline → `ok({motivo:'sin_red', mensaje})`. Cola vacía → `ok({motivo:'nada_que_mandar'})`.
5. Recorre en SERIE. Antes de gastar red, `lleva(op)`; si no → `sin_destino`. Si `agrupa(op.almacen)` (movimientos, materiales, requerimientos) arma un lote de hasta `MAX_LOTE=25` operaciones CONSECUTIVAS que también agrupen; todo lo demás va de una en una.
6. `adaptador.subir(lote)` → arreglo de respuestas `{id, ok, codigo?, mensaje?, definitivo?, motivo?, omitida?, rechazadas?, remoto?, conflicto?}`. Si `subir` LANZA: `_ultimoError`, `fallidas++` y se corta el bombeo (L672-684). Respuesta ausente para una op = `null` → `codigo` por omisión `'SIN_RED'`.
7. Se detiene el bombeo entero (sin tocar las que siguen) cuando una respuesta no definitiva trae `codigo` en `SIN_RED|DESCONOCIDO|ROL_SIN_PERMISO` (L647). Cualquier otro código no definitivo (p. ej. `DATO_INVALIDO` que el relevo no marcó definitivo) incrementa intentos y SIGUE con las demás.
8. Éxito con `rechazadas[]` (propiedades que la hoja no escribió): se acumula en `rechazos` y `motivo:'ok_incompleto'`.
9. Al terminar: `ponerMarcas({ultimo_envio:now})` si hubo `subidas`; limpia `_ultimoError` solo si `(subidas||omitidas) && fallidas===rechazadasN`.
10. Devuelve `ok({mandadas, subidas, fallidas, conflictos, pendientes:(cola restante), sin_destino, rechazadas, omitidas, rechazos, motivo:'ok'|'ok_incompleto'|'con_fallas'})`. Nunca devuelve `{ok:false}`.

### 3.5 Reintento y backoff — realidad vs. lo escrito
- Escrito (`sync.js:469`, `:709-717`): «Respeta Retry-After y retrocede exponencialmente»; `esperaMs(n)=min(1h, 5000·2^n)`.
- Real: `esperaMs` sin llamadores; `Retry-After` no se lee en ningún lado de `js/`; `bombearDeVerdad` ignora `intentos` y `ts`. Cada vuelta intenta TODA la cola otra vez (salvo corte por `SIN_RED|DESCONOCIDO|ROL_SIN_PERMISO`). Cadencias reales: +1.5 s tras encolar; al arrancar (`app.js:1819`); evento `online` (L1830); cada 30 s si la pestaña está visible (L1837); al volver visible (L1840); botones de Ajustes/Control/Proyectos (`ajustes.js:1532`, `control.js:333`, `proyectos.js:2267,2282`).
- Cuando el transporte sea Supabase: una operación que falle por RLS/validación y NO se marque `definitivo` se reintentará cada 30 s para siempre y, si su código cae en el conjunto de corte, bloqueará toda la cola detrás de ella.

### 3.6 Descarte
Nada se descarta por antigüedad ni por número de intentos. Se elimina una op solo por: éxito, `omitida`, `resolver(...,'suyo')`, `descartarDelProyecto`, o el borrado total (`DB.vaciar` por almacén en `ajustes.js:1721`). `sin_destino` y `rechazada` se conservan indefinidamente «por si algún día hay destino» (`sync.js:435-445`).

### 3.7 Idempotencia (por almacén)
- `movimientos`: id generado en el cliente y estable en reintento (`stock.js:344`); en la bajada, un id ya presente se DESCARTA sin mirar contenido (`sync.js:795-799`); en la restauración también (`db.js:490`); la hoja contesta `ya_estaba` y el relevo lo cuenta como éxito (`puente.js:1218-1221`). Salidas al cortar: id determinista `mov-salida:<req.id>` (`proyectos.js:1178`).
- `requerimientos`: id determinista `<proyecto_id>:<material_id>`.
- `proyectos`: dedupe local por `folio_global` (`COT-0042@K7QM`, índice `porFolio`, `yaExiste` `proyectos.js:643`); importados `proy-hoja-<V-folio>`; hacia la hoja la identidad es `id_notion` (= `notion_page_id`, el V-folio) o, para altas, el folio de cotización (`puente.js:1626-1641`). Cómo dedupe el .gs un alta repetida: NO CONFIRMADO (no leí el .gs; `venta.js:489-490` afirma que «el puente busca por folio antes de crear»).
- `instalaciones`: una instalación VIVA por proyecto: `agendar` mueve la que existe en vez de crear otra (`agenda.js:255-274`).
- `materiales`/`constantes`/`avisos`: llave natural (`id`/`clave`/`rid`), upsert.
- Marcas de dispositivo para IDs: `Prefs.dispositivo()` 4 caracteres.

### 3.8 `esperado` y conflictos
Siempre `null` (ver §0.2). El relevo no lo manda (`puente.js:32-39`). `resolver('mio')` es el único que pondría `esperado = op.conflicto` (L949) y `resolver('suyo')` aplica `op.conflicto` encima del registro local con `sync:1` (L963). Todo inerte hoy.

### 3.9 La bajada: `jalar()` (L728-876) y marcas
- `jalar` = una sola en vuelo; `adaptador.bajar(cursor)` → `{registros:[{almacen,datos}], cursor, hay_mas}`. Cada registro: ignora si `almacen ∉ DB.ALMACENES` o sin llave (`LLAVE={avisos:'rid',constantes:'clave',geo:'q'}`, defecto `id`).
- `movimientos`: si ya existe se descarta; si no, `poner({...datos, sync:1})`.
- El resto: `fusionar(local, remoto)` = superposición campo a campo del más reciente sobre el más viejo por `actualizado_en` del registro; `undefined` no pisa; `creado_en`=mínimo; `sync=1`. Si `mismoDato` (ignora `actualizado_en,creado_en,sync`) no se reescribe ni cuenta.
- Almacenes `espejos` (hoy `['ventas_hoja']`): se anotan ids vistos por barrido; al cerrar un barrido COMPLETO (no `parcial`) se borra lo que no vino.
- Tras cerrar: `adaptador.despuesDeBajar({completa, vistos, rechazadas})`.
- Marca `pendientes._marcas`: `{id:'_marcas', ts:0, ultimo_envio, ultima_bajada, cursor, vistos:{[disp]:ms}, barrido:{desde, vistos:{[almacen]:string[]}, parcial}|null, ultima_bajada_completa}` (L240-256). `vistos[disp]` se alimenta de `datos.dispositivo||datos.disp` y `datos.actualizado_en`/`ts` (en la práctica casi solo del libro de `movimientos`, porque las filas de hoja no traen `dispositivo`).
- Marca `pendientes._almacen_hoja`: `{id, ts:0, desde, completo_en, barriendo}` (`puente.js:1303`): secuencia del almacén; barrido completo cada 7 días.
- `app.js:2079-2080` guarda `al3d_pf_ultima_bajada` (ms) en localStorage cuando una vuelta sale sin falla ni `SIN_RED`.

### 3.10 Contrato real del adaptador (lo que un relevo Supabase debe cumplir)
`Sync.registrar(adaptador)` (L175): acepta cualquier objeto con `subir` función. Hoy el único es `Puente.desdePrefs()` → `crear()` (`puente.js:1086`, `nombre:'hoja'`; `app.js:1897-1903`). Miembros usados por `sync.js`/consumidores:
- obligatorios en la práctica: `nombre`, `subir(ops[])`, `bajar(cursor)`.
- usados por Ajustes/puerta: `salud()` → `{ok, mensaje, codigo?, rol, version, escribibles[], via:'google'|'token', correo}`; `esquema()` → `{ok, faltan[], accesos, nota, mensaje}`.
- opcionales: `lleva(almacen)`, `motivo(almacen)`, `agrupa(almacen)`, `revive(op)` (puede devolver `true` o `'revivida_xxx'`), `espejos[]`, `despuesDeBajar(info)`.
- pasarelas FUERA de la bandeja: `carpetas()`, `crearCarpeta(nombre)`, `expandir(u)` (`sync.js:192-219`) → siguen apuntando a Apps Script/Edge Function en el plan.
- Transporte actual (`puente.js:963-1016`): TODO es `POST` a la URL del Apps Script con `Content-Type: text/plain;charset=utf-8`, cuerpo JSON `{ruta, …extra, google_token?, token?}`; tope de espera 15 s; `ROL_SIN_PERMISO` (401/403 o `ok:false,codigo:'ROL_SIN_PERMISO'`) LANZA con `e.codigo`. No hay cabecera `Authorization`.
- Rutas que usa el cliente: `salud`, `esquema`, `jalar`, `empujar` (1 op de proyecto/instalación por viaje), `jalar_almacen` (`{desde}`, hasta 20 páginas de 1500), `empujar_almacen` (`{ops:[…]}` hasta 25), `expandir`, `carpetas`, `crear_carpeta`, y por `Puente.hablar`: `ia`, notario, etc.

---------------------------------------------------------------------------------------------------

## 4. localStorage / sessionStorage — TODAS las claves (producción)

Leyenda «Revocar»: BORRAR = dato de empresa o credencial; MANTENER = preferencia de aparato/UI sin dato de empresa; DECIDIR = identidad del aparato.
Nota: `prefs.js` dice «Las once están en CLAVES y en ningún otro sitio» (L2): falso, hay 16 en `CLAVES` y 7 más `al3d_pf_*` fuera de ella (6 en localStorage y 1 en sessionStorage).

### 4.1 Plataforma — `Prefs.CLAVES` (`prefs.js:26-60`)
`CRUDAS` (texto sin JSON, L101): `DISP, LETRA_FOLIO, ROL, NOMBRE, TILES, ULT_EXPORT, EMPRESA, RESTAURAR`. El resto va con `JSON.stringify` (ojo: `ENTRADA` se guarda como `"2026-10-10"` CON comillas).

| Clave | Contenido / forma | Escribe | Revocar |
|---|---|---|---|
| `al3d_pf_disp` | 4 letras del aparato (alfabeto `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`; respaldo `'D'+4 dígitos`) | `Prefs.dispositivo()` L132; también lo lee `entrega.js:302` del cotizador | DECIDIR (identidad; entra en `folio_global`, `disp` de ops y filas) |
| `al3d_pf_letra_folio` | 1 letra `A-Z` | `setLetraFolio` L157 | MANTENER |
| `al3d_pf_rol` | `direccion\|fabricacion\|pagos` (solo para aparatos SIN pase) | Ajustes `setRol` | BORRAR (si no, `rol()` cae a este valor o a `'direccion'`) |
| `al3d_pf_nombre` | nombre de la persona (≤40) | `setNombre` | BORRAR (PII; viaja en bitácora/libro) |
| `al3d_pf_ganadas` | buzón `[{folio, disp, huella, fecha_instalacion, fecha_anticipo, plazo_k, cuenta, estatus, pct_comision, sub, neto, anti, ts}]` (`venta.js:525-548`) | cotizador | BORRAR (importes) |
| `al3d_pf_tiles` | `osm\|carto\|google` | `setTiles` | MANTENER |
| `al3d_pf_gcal` | `{clientId, calendarioId, invitados:[correos]}` | Ajustes `setGcal` | BORRAR (correos del equipo) |
| `al3d_pf_puente` | `{url?, token?, rol?, probado?}`; `token` = token de dispositivo EN CLARO | Ajustes `setPuente` (`ajustes.js:1433,1458,1477`); el cotizador la LEE (`venta.js:293,301`) | BORRAR (credencial) |
| `al3d_pf_ingreso` | `{correo, clientId?}` (el token de acceso NO va aquí) | `ingreso.js:289,319` | BORRAR |
| `al3d_pf_ult_export` | ISO del último respaldo | `marcarExport` | MANTENER |
| `al3d_pf_empresa` | texto; NUNCA escrito por la app | — | BORRAR si existe |
| `al3d_pf_restaurar` | texto JSON de la MITAD del cotizador de un respaldo completo, pendiente de restaurar (puede ser de varios MB) | `dejarRestauracion` | BORRAR |
| `al3d_pf_ia_ok` | `true` («ya probé que la key sirve») | `asistente.js:414` | MANTENER |
| `al3d_pf_pase` | `{correo, rol, hasta:ms, visto:ms}`; vale `DIAS_PASE=30` (`puerta.js:128`); lo leen SIN módulos `cotizador.html:73`, `js/tema.js:93`, `publicaciones/js/previo.js:29`, `anidador-vectores/index.html:44` | `puerta.js:451` | BORRAR (ya lo hace hoy `borrarPase`) |
| `al3d_pf_entrada` | `"AAAA-MM-DD"` (con comillas JSON): último día que entró con el botón de Google (`CIERRE_DIARIO=true`, `puerta.js:125`) | `puerta.js:585` | BORRAR |
| `al3d_pf_fondo` | `{bolsa:[…], ult}` adorno de la puerta | `puerta.js:878` | MANTENER |

### 4.2 Plataforma — claves FUERA de `CLAVES`
| Clave | Contenido | Dónde | Revocar |
|---|---|---|---|
| `al3d_pf_gtok` | `{token, expira:ms}` token de acceso de Google (1 h) EN CLARO (la cabecera de `ingreso.js:33-39` lo admite; `puente.js:928` dice «solo en memoria»: obsoleto) | `ingreso.js:127-138` | BORRAR (credencial) |
| `al3d_pf_carpetas` | caché de Drive `{ts, raiz, carpetas:[…]}` (nombres de carpetas y archivos de clientes) | `carpetas.js:179` | BORRAR |
| `al3d_pf_cand_abierta` | `'1'\|'0'` UI | `mod/proyectos.js:895` | MANTENER |
| `al3d_pf_ultima_bajada` | ms (string) | `app.js:1963` | MANTENER (o borrar con todo) |
| `al3d_pf_pasos_gcal`, `al3d_pf_pasos_puente` | `{n, hechos:[…]}` checklist de Ajustes | `ajustes.js:97` | MANTENER |
| sessionStorage `al3d_pf_actualizada` | ms (caduca al minuto) | `app.js:2148` | no aplica |

### 4.3 Cotizador (iframe del mismo origen: comparte localStorage)
`RESPALDO_KEYS` (16, `historial.js:1574`, copia en `js/datos/cotizador.js:428`, comparadas por `pruebas/respaldo.mjs:40-45`):
| Clave | Contenido | Revocar |
|---|---|---|
| `al3d_historial` | JSON `[]` de cotizaciones autorizadas (forma en `historial.js:119-162`; incluye cliente, tel, dirección, precios, `aiFile.url` dataURL) | BORRAR |
| `al3d_queue` | cola de cotizaciones pendientes de autorizar `[{folio,proy,cliente,neto,fecha_sol,estado:'pendiente',precioAuth,autorizador,nota,fechaAuth,q:snapshot}]` (`historial.js:1950`) | BORRAR |
| `al3d_q` | borrador de cotización en curso | BORRAR |
| `al3d_folio` | contador local de folios (entero en texto) | DECIDIR (si se borra, el siguiente folio puede repetirse en ese aparato) |
| `al3d_logo` | dataURL del logo propio | BORRAR (marca de empresa) |
| `al3d_canva` | `{…}` objeto de datos de «Canva» por folio | BORRAR |
| `al3d_hitos` | `{…}` hitos por folio (venta registrada, PDF, WhatsApp…) | BORRAR |
| `al3d_pf_ganadas` | (ya en 4.1) | BORRAR |
| `al3d_cuadernos` | notas por cliente `{…}` | BORRAR |
| `al3d_aifile` | dataURL de la imagen de la cotización en curso (≤2 MB) | BORRAR |
| `al3d_autorizador` | nombre de quien autoriza | BORRAR |
| `al3d_ult_material` | último material usado | MANTENER |
| `al3d_rv_pct`, `al3d_rv_cuenta` | % de comisión y cuenta recordada (ej. «Elias BBVA») | BORRAR (cuenta bancaria nominal) |
| `al3d_respaldo_ts`, `al3d_respaldo_n` | marcas del último respaldo del cotizador | MANTENER |
Otras del cotizador/anidador/publicaciones: `al3d_anidar` (SVG de paso vectorizador→anidador, se borra al leer), `al3d_anidador_material`, `al3d_anidador_retazos` (inventario de sobrantes con nombre → BORRAR), `al3d_pista_medidas`/`al3d_pista_partidas`/`al3d_pista_tablero` (pista de gesto, `'1'`), `al3d_tema` (`oscuro|claro`), `al3d_kxs_*`/`ai_key*`/`ai_model`/`ai_provider` (llaves de IA heredadas: el cotizador las BORRA al arrancar, `ia.js:140-145`), `al3d_fold_proy` (muerta, la borra `arranque.js:70`), `al3d-editor-lista` y `al3d-editor-conjuntos` (editor de publicaciones, `publicaciones/js/editor.js:42-59`). sessionStorage `al3d_sesion` (`historial.js:2516`).
Sin datos de empresa en Cache Storage: `sw.js:345-355` solo cachea GET del mismo origen (app estática y `datos/semilla.json`), nunca el puente ni las APIs.

### 4.4 Qué borra hoy el «cordón» manual (`ajustes.js:1709-1756`)
`DB.vaciar` de los 12 almacenes; `Prefs.set(GANADAS, [])`; `setPuente(null)`; `setGcal(null)`; los dos `pasos_*`; luego `location.reload()`. NO toca: `al3d_historial`, `al3d_queue`, `al3d_q`, `al3d_aifile`, `al3d_cuadernos`, `al3d_canva`, `al3d_hitos`, `al3d_logo`, `al3d_rv_*`, `al3d_autorizador`, `al3d_anidador_*`, `al3d_pf_gtok`, `al3d_pf_ingreso`, `al3d_pf_pase`, `al3d_pf_nombre`, `al3d_pf_carpetas`, `al3d_pf_restaurar`, la IDB `al3d_cot_imgs`. Un «acceso revocado» que borre «IndexedDB y localStorage con datos de la empresa» tiene que cubrir TODA la lista BORRAR de arriba, las DOS IndexedDB (`al3d_pf` y `al3d_cot_imgs`) y, si se quiere, los cachés del service worker.

---------------------------------------------------------------------------------------------------

## 5. Prefs: empresa, rol, puente, tokens (`js/datos/prefs.js`)

- Empresa: `empresa()` = `get(CLAVES.EMPRESA,'al3d')` (L323). Siempre `'al3d'`. Consumidores: `agenda.js:280`, `material.js:302,472,1067`, `proyectos.js:458,573`, `puente.js:1821,1823` (→`instalacionDeHoja` `o.empresa`, `:775`), `stock.js:345,764`. `empresa_id` solo existe en filas de `proyectos`, `instalaciones`, `materiales`, `requerimientos`, `movimientos` (y a veces `''` en instalaciones bajadas de la hoja). NO existe en `constantes`, `bitacora`, `avisos`, `geo`, `ventas_hoja`, `pendientes`.
- Rol (L174-193): `rol()` = rol del PASE vigente (`pase()` exige `correo` string, `rol∈ROLES`, `hasta>now`) o, sin pase válido, `get(CLAVES.ROL,'direccion')` → RIESGO: pase vencido/ausente ⇒ rol efectivo `direccion` por omisión. `ROLES=['direccion','fabricacion','pagos']`. `veDinero()` = `rol()!=='fabricacion'`. `rolDeLaHoja()` = hay pase. El rol «no es seguridad»; la frontera real es el Apps Script (`ingreso.js:19-23`).
- URL del puente: constante `URL_PUENTE` en código (`prefs.js:83-84`, deploy `https://script.google.com/macros/s/AKfycbwY6q…/exec`); `puente()` (L278) devuelve `{...guardado, url: guardado.url||URL_PUENTE}`; `puenteGuardado()` solo lo escrito; Ajustes puede anular por aparato.
- `hayPuente()` (L294-300): hay `url` (siempre) Y (`p.token` O `ingreso().correo`). Es lo que hace `configurado()`.
- Tokens: (a) token de dispositivo en `al3d_pf_puente.token`; (b) token de acceso de Google en `al3d_pf_gtok` (1 h; `Ingreso.token()` devuelve `''` si no vive); (c) cada petición manda ambos en el CUERPO (`google_token`, `token`), la hoja decide (`puente.js:992-1001`); (d) token de Calendar: solo memoria (`gcal.js:30`). Ninguno de (a)(b) está en los respaldos (`db.js:385-387`, `RESPALDO_KEYS`).
- Identidad del aparato: `dispositivo()` L132-145; `sello()` = `"Nombre · Rol (DISP)"` (L212) se congela en libro, bitácora y `ajustado_por`.
- `leerBuzon/quitarDelBuzon` (L255-265): el buzón `al3d_pf_ganadas` entre cotizador y plataforma; la clave del buzón es `folio|disp`.
- Pruebas que fijan esto: `pruebas/replicas.mjs:262-268` exige que el alfabeto `AB` de `prefs.js` (por REGEX sobre el texto: `/const AB = '([^']+)'/`) sea el de `entrega.js`, y que `DISP_KEY`, buzón, `PUENTE_KEY`, `RESTAURAR_PF_KEY` coincidan con `Prefs.CLAVES`.

---------------------------------------------------------------------------------------------------

## 6. Exportación / respaldo (`db.js:377-518`, `app.js:1535`, `ajustes.js:1145-1183`)

Archivo de la plataforma sola (`DB.exportar`, `db.js:392-404`); el «cordón» de borrado lo baja como `plataforma-al3d-antes-de-borrar-<AAAA-MM-DD-HHMM>.json` (`ajustes.js:1661`) y el botón normal de respaldar baja el completo (abajo):
```json
{"app":"plataforma-al3d","formato":1,"fecha":"<ISO>","datos":{
  "proyectos":[…filas crudas…],"instalaciones":[…],"materiales":[…],"movimientos":[…],"requerimientos":[…],
  "avisos":[…],"constantes":[…],"geo":[…],"blobs":[{…resto,"dataUrl":"data:…"}],"bitacora":[…]}}
```
- Se excluyen `pendientes` y `ventas_hoja` (`NO_RESPALDA`). Las filas son las de IDB tal cual: con `sync`, `empresa_id`, marcas locales, `origen` completo.
- NO incluye: identidad del aparato (`al3d_pf_disp`), nombre, rol, ni las imágenes `al3d_cot_imgs`.
Archivo completo (`respaldar`, `app.js:1535-1550`), `al3d-respaldo-completo-<sello>.json`:
```json
{"app":"al3d-completo","formato":1,"fecha":"<ISO>","plataforma":{…el objeto de arriba…},
 "cotizador":{"app":"cotizador-al3d","formato":1,"fecha":"<ISO>","datos":{"<clave>":"<texto JSON crudo de localStorage>"}}}
```
`cotizador.datos` = solo las 16 `RESPALDO_KEYS` que existan, como TEXTO sin parsear.
Importación (`DB.importar`, `db.js:450-500`): valida `app==='plataforma-al3d'`, `formato<=1`, cada almacén conocido debe ser arreglo, y que ningún `keyPath` presente sea clave IDB inválida (todo o nada ANTES de escribir). Por almacén y por registro: sin llave → `descartados`; `movimientos`/`bitacora` con id ya presente → `descartados`; si lo de aquí tiene `actualizado_en` mayor y el del archivo también trae → `conservados`; el resto entra con `ponerVarios(..., {conservarSello:true})`. Devuelve `{almacenes, registros, descartados, conservados}`. Idempotente.
Restauración del cotizador: la plataforma NO la escribe; deja la mitad en `al3d_pf_restaurar` y el cotizador la ofrece (`ajustes.js:1172`, `historial.js:1683,1853-1878`).
Para la fase 2: el archivo NO dice de qué teléfono viene. El `dispositivo` solo se infiere de `proyectos[].dispositivo`/`movimientos[].dispositivo`/`bitacora[].dispositivo` (los importados de la hoja traen `"hoja"`).

---------------------------------------------------------------------------------------------------

## 7. `sin_puente` y el contrato de `frescura()`

`sin_puente` es un valor de `motivo` dentro de resultados OK:
- `bombear()` sin `configurado()`: `ok({mandadas:0,subidas:0,fallidas:0,conflictos:0,pendientes:<cola.length>,sin_destino:0,rechazadas:0,omitidas:0, motivo:'sin_puente', sin_adaptador:true, mensaje:MSG.SIN_PUENTE})` (`sync.js:542-545`).
- `jalar()` sin `configurado()`: `ok({nuevos:0,actualizados:0,descartados:0,motivo:'sin_puente'})` (L739-741).
`configurado()` = adaptador registrado Y `Prefs.hayPuente()` (L181). NADIE fuera de `sync.js` lee `motivo==='sin_puente'` (grep): los consumidores usan `Sync.configurado()` (`app.js:1898,2031`, `control.js:315`, `mod/proyectos.js:1364,2266,2281`, `ui.js:bandaFrescura(f, disponible)`). Es informativo, no un error (`sync.js:17-20`).
Otros `motivo`: bombear `sin_red|nada_que_mandar|ok|ok_incompleto|con_fallas`; jalar `ok`.

`frescura()` (L990-1071) devuelve SIEMPRE un objeto con: `al_dia:boolean`, `dispositivos:[{disp, ts, horas}]`, `texto`, `mensaje` (misma cadena que `texto`), `ultimo_envio:ms|null`, `ultima_bajada:ms|null`, `pendientes:int`, `edad_horas:int|null`; más `atascado:true` (rama 1) o `rechazadas:int` (rama 2). Sin lectura de red (solo marcas locales). Orden de decisión:
0. No `configurado()` → `{al_dia:true, dispositivos:[], texto:'', pendientes}`.
1. ATASCADO: `cola.length>0` y (`estado().ultimo_error` o nunca se envió o `horasSinEnviar>=48`) → `al_dia:false`, `texto:'Este teléfono no ha podido mandar N cambio(s): …'`, `atascado:true`, `edad_horas:horasSinEnviar`.
2. RECHAZADAS: hay `estado==='rechazada'` → `al_dia:false`, texto con el `ultimo_error` de la más reciente, `rechazadas:n`.
3. ATRASADOS: dispositivos de `marcas.vistos` ≠ este con `(now-ts)/h >= 48` (`HORAS_VIEJO`, L976) → `al_dia:false`, `dispositivos` ordenados por horas desc, texto nombra al peor, `edad_horas` del peor.
4. Si no, `al_dia:true` (rama 0).
`bandaFrescura(f, disponible)` (`ui.js:836-856`) solo pinta: sin `disponible` → «Todo lo que ves vive en este dispositivo…»; `al_dia` → «Al día · queda(n) N cambios…»; si no, banda con `f.texto||f.mensaje`.
Otras lecturas instantáneas: `estado()` → `{ok, configurado, adaptador, bombeando, ultimo_error, dispositivo}`; `estadoBajada()` → `{configurado, ultima, completa, a_medias, ultimo_error}`.
Qué tendría que reemplazar Supabase: la rama 3 depende de `vistos` (libro de otros aparatos); con Realtime se derivaría de otra fuente.

---------------------------------------------------------------------------------------------------

## 8. El encabezado de `sync.js` (L1-90) frente a la realidad

Afirmaciones que YA NO son ciertas:
| Línea | Dice | Hoy |
|---|---|---|
| 1-9 | «Ninguna pantalla habla con un servidor… La única pantalla que llama a este archivo directamente es Ajustes» | Lo llaman `app.js` (L1898-1903, 2031-2066), `mod/control.js:315-337`, `mod/inicio.js:125,459`, `mod/tablero.js:290`, `mod/proyectos.js:1364,2266-2282`, `mod/ajustes.js`, `datos/carpetas.js` y, por import dinámico, `proyectos/agenda/material/stock/reglas` |
| 10 | «EN FASE 1 NO HAY SERVIDOR» | Fase 3 está en producción: relevo `puente.js` contra Apps Script; `configurado()` es true con solo entrar con Google (`prefs.js:294-300`) y la URL va en el código |
| 11-16 | `encolar` escribe «aunque no haya a dónde mandarlo»; bandeja vacía = backfill | Hay destino; aún aplica solo a `avisos/constantes` (sin destino por diseño) |
| 17-20, 472 | `bombear` sin puente = «estado normal de Fase 1» | Cierto en código (L538-546) pero ya no es el estado normal; nadie lee el `motivo` |
| 21-25, 979-989 | `frescura()` «siempre conteste al día» con un dispositivo | Tiene 3 ramas activas (atascado, rechazadas, atrasados) |
| 26-30, 315, 895, 1005 | Notion sin comparación-e-intercambio; «cambió en Notion mientras no tenías señal» | Ya no hay Notion (`puente.js:2172`: «Ya no hay token de Notion ni Worker de Cloudflare»); el texto vive en `sync.js:627` pero el estado `conflicto` no puede ocurrir |
| 32-34 | idempotencia solo en `movimientos` (id del cliente) | También `requerimientos` (id determinista), salidas `mov-salida:…`, `ya_estaba` de la hoja, una instalación viva por proyecto |
| 43-90 | «CONTRATO DEL WORKER DE FASE 3»: Cloudflare Worker, secreto de Notion, `Authorization: Bearer`, `GET /salud`, `POST /empujar {ops}`, `GET /jalar?cursor=&desde=`, `GET /expandir?u=`, 401/503, `Retry-After` | Todo es POST a un Apps Script web app con `text/plain`, cuerpo `{ruta,…,google_token?,token?}` (`puente.js:963-1016`); rutas extra `jalar_almacen`, `empujar_almacen`, `carpetas`, `crear_carpeta`, `ia`; `/jalar` ya no pagina (`sync.js:870-873`); no se lee `Retry-After`; la autoridad es el Apps Script (rol por correo de Accesos o token) |
| 92-98 | typedef `Operacion.estado:'pendiente'\|'conflicto'` | También `sin_destino` y `rechazada`; campos extra `codigo_rechazo`, `motivo_rechazo`, `revivida_*` |
| 100-123 | typedef `AdaptadorSync` | Faltan `espejos`, `carpetas`, `crearCarpeta`, `expandir` (los usa `sync.js:192-219`) y el detalle de que `salud()` devuelve `via`/`correo` |
| 469, 709-717 | `bombear` «respeta Retry-After y retrocede exponencialmente»; `esperaMs` la usa «el bombeo» y la pantalla de conflictos | Falso: código muerto (§3.5) |
| 893-897 | «no existe un sello por campo en ninguna parte» | Existe `proyectos.sellos` (`proyectos.js:521-540`) y `obraDeLaFila` lo usa; `fusionar` sigue por registro |
| 148-154 | «§4.2 congeló nueve claves» | Hay 16 en `CLAVES` + 7 `al3d_pf_*` fuera (§4) |

Lo que hace HOY el módulo: (1) es la bandeja local `pendientes` (cola ordenada por `ts`, marcas, estados `pendiente|sin_destino|rechazada|conflicto`); (2) registra un único relevo (hoy `puente.js`, hoja) y le delega `subir/bajar/salud/esquema/lleva/agrupa/revive/espejos/despuesDeBajar`; (3) bombea en serie con lotes de 25 para el almacén, aparta lo que no tiene destino o fue rechazado, nunca descarta; (4) baja con `jalar` (fusión por superposición, barridos completos con borrado de espejos); (5) expone `frescura/estado/estadoBajada` para la UI; (6) pasarelas `carpetas/crearCarpeta/expandir` fuera de la cola. Plan §5 Fase 0 ya pide reescribir este encabezado.

---------------------------------------------------------------------------------------------------

## 9. `geo.js` (solo lo que toca datos)
- Puro salvo `geocodificar` (red Nominatim + almacén `geo`) y `capaBase` (Leaflet). `parseGmaps`/`resolverLink` son lo que de verdad usa la app (`proyectos.js:44`, `mod/datos-entrega.js:255`, `mod/mapa.js:2255`). `resolverLink(texto, expandir)` recibe `Sync.expandir` (→ ruta `expandir` de la hoja; plan: Edge Function).
- Constantes: `centroGDL`, caja `MX`, `TILES` (`osm|carto|google`; `carto` hoy pide llave; `google` stub sin URL), `FASE=2`.
- Escritura única: `DB.poner('geo', {q, ts, hallado, lat, lng, nombre})` (L355). Sin llamadores ⇒ almacén vacío.

## 10. `bitacora.js`
`anotar(hecho)` nunca lanza; devuelve el renglón o `null`; exige `titulo`; usa `DB.estado().ok`; sella `usuario=Prefs.nombre()`, `rol`, `dispositivo`, `sello`. `listar(filtro)` por `porEntidad` (si `entidad_id`) o `porTs`, orden desc, filtros `entidad`, `desde`, `texto` (sin acentos), `limite`. `contar()`. Llamada por import dinámico desde `proyectos/agenda/material/stock` DESPUÉS de escribir y dentro de try. Acciones/entidades en §2.10. Lectores: pantalla Control y ficha de proyecto.

## 11. `conservar.js`
Planificador PURO de montaje de pantallas del router (`planDeMontaje`, `TOPE_CONSERVADAS=1`): decide qué `<iframe>` (Cotizador, Mesa de corte, Vectorizador) se conservan vivos al cambiar de ruta. Cero acceso a datos, sync o storage. Sin impacto en la migración (lo prueba `pruebas/conservar.mjs`).

---------------------------------------------------------------------------------------------------

## 12. Pruebas: qué fijan

`pruebas/respaldo.mjs`:
- L40-45: la lista `RESPALDO_KEYS` de `js/datos/cotizador.js` debe ser IGUAL (como conjunto) a la de `js/cotizador/historial.js` y tener EXACTAMENTE 16 claves; `al3d_fold_proy` no puede volver.
- L53-62: `armarRespaldoCotizador()` → `{app:'cotizador-al3d', formato:1, fecha ISO, datos:{clave:texto}}`.
- L65-68: el cotizador sigue validando `paquete.app==='al3d-completo'&&paquete.cotizador`, `Array.isArray(JSON.parse(D['al3d_historial']))` y lee `RESTAURAR_PF_KEY='al3d_pf_restaurar'`.
- L97-258: IndexedDB de mentira (`idbDeMentira`): soporta SOLO `objectStoreNames.contains`, `createObjectStore`, `createIndex` (no-op), `transaction().objectStore().get/put/delete/clear`, `abort()`, `indexedDB.cmp`. NO soporta cursores, `index()`, `count()`, `getAll()`. Si `db.js` empieza a usarlos, estas pruebas se rompen; `db.listar/contar` no se prueban aquí (sí en `pruebas/comun/base-de-mentiras.mjs`, `idbConIndices`, usado por `sincronizacion.mjs`).
- L264-391: contratos de `poner/ponerVarios/borrar/vaciar/importar/obtener`: `SIN_ESPACIO` si la transacción aborta tras `onsuccess`; «todo o nada»; ids `null/undefined/objeto/NaN` ⇒ `DATO_INVALIDO` sin lanzar; restaurar el viejo y luego el bueno conserva sellos (`conservarSello`); formato `{app:'plataforma-al3d', formato:1}`.
`pruebas/replicas.mjs`: compara réplicas cotizador↔plataforma (huella de partidas, descripciones, cobrado, tipo de trabajo, cuadernos, alfabeto del dispositivo, claves `DISP/GANADAS/PUENTE/RESTAURAR`, IA, nombres de propiedad del puente `P` y columnas del .gs `COL`, estatus/cuentas, `M2_MINIMO`, `telWa`). Importa `js/datos/{cotizador,proyectos,puente,prefs,catalogo-precios,asistente-contexto}.js` y `js/nucleo/ui.js` en node: esos módulos NO pueden tocar `localStorage`/`indexedDB` a nivel módulo. Leen `puente/hoja-apps-script.gs` (L280-322) → se ROMPEN cuando el .gs pierda `IA_MODELOS`, `IA_PROVS`, `COL` o `CUENTA_SIN_FACTURA`.

---------------------------------------------------------------------------------------------------

## 13. Contradicciones con el plan (`docs/PLAN-SUPABASE.md`)

1. §3.1 `blobs` → Storage «revisar tamaño»: el almacén `blobs` está VACÍO y sin escritores; las imágenes reales son `al3d_cot_imgs.img` (+ dataURL en `al3d_historial[].aiFile.url` y `al3d_aifile`), que el plan no menciona y que ningún respaldo incluye.
2. §3.1 `bitacora` → «se conserva el historial completo»: la bitácora no existe centralmente; vive solo en cada teléfono (nadie la encola). Solo se recupera de los archivos de respaldo de cada aparato. `usuario` es un nombre libre, no un correo.
3. §3.1 `avisos` «no se migra»: lo que no se puede recalcular es la decisión (`atendido/postergado/descartado`); es local.
4. §4.4 «Se conserva … el reintento»: no hay backoff ni tope (§3.5). `esperado`/conflictos no existen en la práctica.
5. §4.8 «la app borra IndexedDB y localStorage con datos de la empresa»: hoy no hay borrado en la revocación (solo `borrarPase`); el cordón manual es incompleto (§4.4); hay DOS IndexedDB.
6. §4.1 «`Prefs.empresa()` deja de decidir»: nunca decidió (constante `'al3d'` sin setter). `constantes`/`bitacora`/`avisos`/`geo` no tienen `empresa_id` local.
7. §3.1 `proyectos`: «Quita `empresa_id` de la copia local» — hoy SÍ lo lleva (`proyectos.js:458,573`); es BLOQUEADO para editar (`:970`).
8. §3.1 «Dinero en `proyectos` (`sub`, `anti_pactado`, `pago_pendiente`, `comision_restante`, `pct_comision`, `estatus_notion`, `cuenta`)»: además están `neto`, `precio_auth`, `iva` y `origen.*` (precios, `precioAuth`, `anti`, `itemsAuth`, `_lt`); y `ventas_hoja` trae `comisiones`, `abono_comision`, `liquidacion`. Para RLS de «Fabricación no ve dinero», `origen` y `precio_auth/neto/sub` también son dinero en la fila de `proyectos`.
9. §4.9 «Los eventos [de Calendar] guardan `gcal_event_id` en `instalaciones`»: el campo existe y es siempre `null`; no se guarda (`fabricacion.js:1529`).
10. §4.4/§5 Fase 5 «se retiran los tokens de dispositivo»: el cotizador embebido escribe a la hoja SOLO con ese token (`venta.js:299-311,414`, `notario.js:62`), fuera de la bandeja.
11. §4.1 / §3.2: las pantallas estáticas (`cotizador.html:73`, `tema.js:93`, `publicaciones/js/previo.js:29`, `anidador-vectores/index.html:44`) se protegen leyendo `al3d_pf_pase` `{correo, hasta}`; si el login pasa a Supabase hay que seguir escribiendo ese pase o tocar las cuatro.
12. §3.1 «`movimientos` es append-only»: coincide en el cliente (no hay editar/borrar), pero NO está declarado en `db.js` (solo en importar/jalar); la restauración y la bajada descartan ids repetidos.
13. §3.2 `/empujar`, `/jalar`: el contrato real mezcla un camino por proyecto (1 op por viaje, identidad `id_notion`/folio de cotización) y un camino de lotes de 25 para el almacén (`empujar_almacen`), cada uno con su lógica de `definitivo`.
14. Comentarios internos obsoletos que podrían confundir a un implementador: `material.js` «las 18» (son 20), `prefs.js:2` «las once» (son 16), `puente.js:928` «token solo en memoria» (se guarda en `al3d_pf_gtok`).

---------------------------------------------------------------------------------------------------

## 14. NO CONFIRMADO / preguntas abiertas
- Cómo el `.gs` deduplica un `crear` repetido de proyecto (no leí el Apps Script; el cliente confía en que «busca por folio»).
- Si hay filas reales en teléfonos con `blobs`/`geo` (solo por lectura de código no hay escritores).
- Si existen proyectos viejos sin `empresa_id` (versiones anteriores).
- Qué campos exactos tiene `al3d_canva`, `al3d_hitos`, `al3d_cuadernos` (están en `entrega.js:268-447` y `historial.js:1134-1151`; solo los describí por función).
- El efecto práctico de que `DB.poner` pise `actualizado_en` con `now` dentro de `jalar` sobre la regla «gana el más reciente»: `fusionar` compara contra el `actualizado_en` local ya pisado; no lo analicé a fondo (la regla por dato real es `obraDeLaFila`/`sellos`).
- Decisión pendiente para «acceso revocado»: ¿se conserva `al3d_pf_disp`/`al3d_folio` (identidad del aparato y contador de folios)? Borrarlos cambia el sufijo de `folio_global` y puede repetir folios.
