# Mapa 09 — Modelo de proyectos, instalaciones, clientes, folios y ciclo de sincronización

Base: worktree `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase`, rama desde main en `3dbd293` (incluye PR #99, puente-sheets-14).
Alcance: lo que el CÓDIGO hace hoy (no lo que `docs/PLAN-SUPABASE.md` dice). Solo lectura.

Convenciones de rutas (para no repetir `js/`): `proyectos.js, agenda.js, taller.js, ventas.js, entrega.js, datos-de-entrega.js, reglas.js, prefs.js, sync.js, puente.js, db.js, carpetas.js, bitacora.js, geo.js, asistente-contexto.js, cotizador.js` = `js/datos/…` (OJO: `cotizador.js` a secas es el puente de datos al cotizador, `js/datos/cotizador.js`); `app.js` = `js/app.js`; `mod/X.js` = `js/mod/X.js`; `ics.js, gcal.js, puerta.js, ui.js` = `js/nucleo/…`; `historial.js` y `venta.js` y «cotizador/entrega.js» = `js/cotizador/…` (el cotizador es un script clásico, no módulo ES). `archivo:línea` relativo al worktree. «.gs» = `puente/hoja-apps-script.gs`. «NO CONFIRMADO» = no pude verificarlo en el código y se dice por qué. Los nombres de propiedad JS están copiados tal cual; donde propongo columnas SQL lo marco como SUGERENCIA y uso el mismo nombre que la propiedad JS para no inventar.

Archivos leídos completos: `js/datos/proyectos.js` (2620 l.), `ventas.js`, `agenda.js`, `taller.js`, `entrega.js`, `datos-de-entrega.js`, `bitacora.js`, `prefs.js`, `cotizador.js` (datos), `sync.js` (casi todo), `js/nucleo/ics.js`. Leídos por tramos: `reglas.js` (REGLAS, a7, a11), `js/app.js` (RUTAS, arranque, sondeo, sincronizarDeVerdad), `js/mod/ajustes.js` (rol, respaldo, puente, cordón), `puente.js` (mapeos, subir, bajar), `db.js`, `js/cotizador/venta.js`, `historial.js` (folio y entrada), `.gs` (COL, formulas, PUENTE_ROLES, armarCeldas, folios), `js/mod/{proyectos,tablero,control,mapa,fabricacion}.js` (solo lo de rol/dinero/etapa).

---------------------------------------------------------------------------------------------------

## 0. Resumen de una página

1. El «proyecto» NO es una entidad de cliente ni de venta: es un renglón de IndexedDB (`proyectos`, keyPath `id`) que nace de dos maneras: (a) «Se ganó» una cotización del historial del cotizador (lleva `origen` = copia congelada de la cotización, con TODOS sus precios) y (b) importado de una fila VIVA de la hoja (`de_hoja:true`, `origen:null`, id determinista `proy-hoja-V-NNN`). Las ~300 filas restantes de la hoja (cobradas/liquidadas, históricas) NO son proyectos: viven solo como renglones del espejo `ventas_hoja` y Control las suma junto con los proyectos (`ventas.js:137-237`).
2. Dinero en el proyecto: `sub, neto, precio_auth, anti_pactado, iva, pct_comision, pago_pendiente, comision_restante, cuenta, estatus_notion` + todo el dinero dentro de `origen`. `veDinero()` es SOLO un interruptor de pantalla (`prefs.js:193`); la única barrera de lectura real hoy es el filtro de la hoja `CAMPOS_DE_DINERO` (`.gs:2149-2153`), que NO incluye `Estatus`, `IVA` ni `Fecha anticipo`.
3. Etapas (8): `ganado, en_diseno, cortado, armado, listo, instalado, garantia, cancelado`. No hay máquina de estados: `avanzarEtapa` acepta cualquier destino desde cualquier origen; el rol solo limita el DESTINO (`puedeMover`, `proyectos.js:1121-1127`). Cruzar `cortado` hacia adelante emite salidas de material una sola vez.
4. Cada instalación es 1:N con el proyecto en el código, pero la hoja guarda UNA sola cita por fila. El tipo de entrega (`instalacion|paqueteria|recoleccion`) es del PROYECTO (`entrega`), no de la instalación.
5. No existe entidad cliente: son campos del proyecto (`contacto, negocio, tel, dir_texto, entrecalles, maps_url, lat, lng`) y «cuadernos» virtuales del cotizador (`cotizador.js:267`).
6. Folios: tres distintos y sin ninguna restricción de unicidad en ninguna capa (ver sección 4).
7. Sondeo: `MS_SINCRONIZAR = 30000` (`app.js:1921`); cada vuelta = empujar bandeja y luego jalar TODA la hoja; más Drive y links de Maps en la misma vuelta.

---------------------------------------------------------------------------------------------------

## 1. El PROYECTO

### 1.1 Almacén físico y creación

- IndexedDB `al3d_pf`, versión 3 (`db.js:22-29`), almacén `proyectos`, keyPath `id`, índices `porEtapa`→`etapa`, `porFecha`→`fecha_ganado`, `porFolio`→`folio_global` (`db.js:61-62`). Ningún índice es único.
- `DB.poner` sella `actualizado_en = Date.now()` (ms) en CADA escritura y `creado_en` solo si es nuevo (`db.js:229-231`). Ambos son enteros epoch-ms, no fechas.
- IDs: `DB.nuevoId('proy')` = `'proy-' + Date.now().toString(36) + '-' + <6 chars base36>` (`db.js:368-375`). Importados de la hoja: `'proy-hoja-' + folio_hoja` (ej. `proy-hoja-V-214`) DETERMINISTA, de lo cual depende que no se dupliquen entre barridos (`proyectos.js:457`, comentario `384-388`). => La PK debe ser TEXT, no uuid, o hay que guardar el id viejo.
- `empresa_id`: siempre `Prefs.empresa()` = `'al3d'` por omisión (`prefs.js:323`). NO existe pantalla para cambiarla (el mensaje de `BLOQUEADOS.empresa_id`, `proyectos.js:970`, dice «se cambia en ajustes» pero ningún código la escribe) => backfill constante `al3d`.

Caminos que crean/modifican un proyecto (todos locales + cola `pendientes`):

| Camino | Función | Rol requerido |
|---|---|---|
| Se ganó una cotización | `ganar(entrada, extra)` `proyectos.js:667-726` | NINGUNO en la capa de datos. Los botones «Se ganó» solo los pinta Dirección (`fabricacion.js:361`, `mod/proyectos.js:339`, `tablero.js:326`), pero `drenarBuzon` (`cotizador.js:202-248`, llamado en cada arranque `app.js:1767` y en cada `storage` `app.js:1798-1810`) convierte el buzón `al3d_pf_ganadas` en proyecto en el teléfono de CUALQUIER rol |
| No se dio (lápida) | `descartar(ref, motivo)` `proyectos.js:739-793` | `direccion` (línea 741) |
| Importar fila viva de la hoja | `desdeVentaDeHoja(venta)` `proyectos.js:440-519`, invocado desde `puente.js:1878-1886` solo si `venta.estatus ∈ VIVAS_EN_TALLER=['FABRICACION','REPARANDO']` (`puente.js:166`) | automático (bajada) |
| Parches de campos | `actualizar(id, parche)` `proyectos.js:1011-1087` | por campo, ver 1.8 |
| Mover etapa | `avanzarEtapa(id, etapa)` `proyectos.js:1223-1273` | por etapa, ver 1.5 |
| Recalcular con la cotización de hoy | `resincronizar(id)` `proyectos.js:1380-1450` | ninguno explícito (botón solo en ficha de Dirección vía aviso A12) |
| Espejo de dinero/obra que baja de la hoja | `puente.bajar` `puente.js:1710-2030` | automático |

### 1.2 Campos (propiedad = nombre exacto JS)

Leyenda columna «$»: D = dinero duro (ventas_dinero); d = dinero en duda/compartido; n = no es dinero.
«Quién escribe» = quién puede cambiarlo vía la capa de datos hoy (`ESCRIBIBLES`, `CAMPOS_ROL`), ver 1.8.

| Propiedad | Tipo / valores | Nulo | $ | Significado y reglas | Fuente |
|---|---|---|---|---|---|
| `id` | text | no | n | PK. Ver 1.1. Inmutable (`BLOQUEADOS.id`) | `proyectos.js:572,457` |
| `empresa_id` | text `'al3d'` | no | n | Constante hoy. Inmutable | `proyectos.js:573` |
| `folio_local` | text | no | n | Folio IMPRESO de la cotización: `COT-0042-B` (o `COT-0042` sin letra en antiguos). En importados = `folio_hoja` (`V-214`). Inmutable | `proyectos.js:574,459` |
| `dispositivo` | text 4 car. `[2-9A-HJ-NP-Z]{4}` (o `D####`, o `'hoja'`) | no | n | Aparato que ganó el proyecto (`extra.disp` o este teléfono). Parte del `folio_global`. Importados: `'hoja'`. Inmutable | `proyectos.js:575`, `prefs.js:132-145` |
| `folio_global` | text `^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$` | `''` en importados | n | `${folio_local}@${dispositivo}`. Es la LLAVE de negocio que ata proyecto, historial, buzón y fila de la hoja (col. Y). Inmutable | `cotizador.js:186`, `proyectos.js:576,464`, regex `.gs:3573-3577` |
| `folio_hoja` | text `V-NNN` | sí | n | Folio interno de la hoja. Presente en importados y en los propios una vez que la bajada los ató. Es lo que usa `ventas.unificar` para no contar doble | `proyectos.js:465` , `puente.js:1918` |
| `notion_page_id` | text `V-NNN` | sí | n | Legado de Notion: es el `id_notion` del puente = folio de la hoja de la fila de ESTE proyecto. Escrito por el relevo al crear/subir (`puente.js:1663-1666`) | `proyectos.js:498,613` |
| `notion_estado` | `'pendiente'\|'enviado'\|'fallido'` | no | n | Estado del envío a la hoja. Plomería | `proyectos.js:499,614`, `puente.js:1663,1679` |
| `de_hoja` | boolean `true` | sí (ausente=false) | n | Marca de tarjeta importada de la hoja (sin partidas, sin origen). Con `id` que empieza `proy-hoja-` | `proyectos.js:467`, `esImportado` `proyectos.js:1492` |
| `nombre` | text | no | n | `nombreDerivado(origen,tipos)` = `«contacto - negocio (etiqueta1 + etiqueta2 +N)»`; máx. 3 etiquetas, luego ` +n`; nunca vacío (cae a folio, luego `'Sin nombre'`). Importados: nombre de la fila tal cual. Escribible solo Dirección | `proyectos.js:280-318` |
| `contacto` | text | no (puede ser '') | n | `origen.cliente` trim. En importados: parte antes de ` - ` del nombre (conservador: sin ` - ` queda vacío) | `proyectos.js:578,426-431` |
| `negocio` | text | no | n | `origen.proy` trim. En importados: parte después del primer ` - ` (sin el «(Tipo)» final) | `proyectos.js:579,426-431` |
| `tel` | text, `telefonoLimpio`: solo `[\d +()\-]`, espacios colapsados, máx `TEL_MAX=30`, exige ≥1 dígito (si no, `''`) | no | n | Teléfono del cliente. Efectivo = `telefonoDe(p)` = limpio(`p.tel` o `origen.tel`). «Válido» = `telWa(...)` truthy (10 dígitos MX, 12 con 52, 13 con 521; `nucleo/ui.js:578-600`). Escriben los 3 roles | `proyectos.js:396-407,580`, `datos-de-entrega.js:53-55` |
| `etapa` | enum 8 (1.5) | no | n | Etapa de OBRA. Sellada. No escribible por `actualizar` (BLOQUEADA) | `proyectos.js:90-91,577` |
| `tipo_trabajo` | array de 0..7 de los 7 valores EXACTOS (1.10) | no (`[]`) | n | DERIVADO de partidas; `actualizar` solo acepta subconjunto de los siete, en orden canónico, no vacío | `proyectos.js:132-140,205-230,1041-1044` |
| `fecha_ganado` | `YYYY-MM-DD` | no | n | Cuándo se ganó = FECHA DEL ANTICIPO (col. L de la hoja). Del buzón `fecha_anticipo` o `hoyISO()`. Importados: primera ISO válida de `fecha_anticipo, fecha_instalacion, fecha_liquidacion`, si no hoy | `proyectos.js:583,452-453` |
| `compromiso_texto` | text libre | no | n | `origen.entrega` («Viernes 15 de Agosto»). Se guarda CRUDO y NO se parsea jamás | `proyectos.js:588` |
| `dir_texto` | text multilínea | no | n | Dirección cruda (`extra.dir_texto` o `origen.dirRaw`/`origen.direccion`). Es DESTINO si `entrega='paqueteria'`. Sellada (`dir_texto`). Col. AC | `proyectos.js:589` |
| `entrecalles` | text | no | n | `origen.entrecalles`. No sellada, no viaja a la hoja | `proyectos.js:590` |
| `maps_url` | text | no (`''`) | n | Link de Maps tal cual. Si es link CORTO (`maps.app.goo.gl`) queda sin pin hasta que `resolverLinksPendientes` lo expande por la hoja (`/expandir`) | `proyectos.js:591,849-885` |
| `lat`, `lng` | number\|null | sí | n | Pin. `null` = sin ubicar (NO 0,0: se rechaza 0,0 y fuera de rango; `tienePin` `proyectos.js:821-825`). Selladas bajo grupo `ubicacion` | `proyectos.js:592-593,1036-1040` |
| `geo_fuente` | text libre | no | n | `'maps_pin','maps_camara','manual','sin_ubicar'` y los de `parseGmaps` (`'coordenadas','geo_uri','maps_query','maps_search','maps_place','maps_dir'`). NO usar enum cerrado | `proyectos.js:594`, `geo.js:95-103` |
| `ubicacion_pendiente` | `true`\|ausente | sí | n | «Todavía no la tengo» (casilla de Se ganó). Solo cambia el texto del Tablero. «Es de este lado y no viaja a la hoja» | `proyectos.js:601`, `datos-de-entrega.js:84-88` |
| `entrega` | `'instalacion'\|'paqueteria'\|'recoleccion'` | SÍ, con significado | n | AUSENTE ≠ `'instalacion'`: `entregaDe(p)` la lee como instalación para pintar, pero `queLeFalta` la marca «sin forma de entrega» (`!ENTREGAS.includes(p.entrega)`, `datos-de-entrega.js:62-72`). Proyectos anteriores a #97 no la traen. => columna NULLABLE (null=«nadie lo dijo») | `entrega.js:24-70`, `proyectos.js:597` |
| `plazo_k` | int 1..5 \| null | sí | n | Cubo de plazo de taller (1 sem, 1.5, 2, 2.5, 3+). `null` = «manda el propuesto desde tipo_trabajo». Selladas. Escriben dirección y fabricación | `proyectos.js:330-333,631`, `taller.js:55-61` |
| `notas` | text multilínea (hoja: máx 40 000) | no (`''`) | n | Notas internas del proyecto. Selladas. Escriben los 3 roles. `descartar` anexa el motivo con `\n` | `proyectos.js:633,783`, `.gs:3035-3040` |
| `sub` | number | no | **D** | Subtotal sin IVA (col. G). Del buzón/cotización, congelado | `proyectos.js:607` |
| `neto` | number | no | **D** | Total con IVA calculado (col. H, fórmula). Del buzón o `origen.neto` | `proyectos.js:608` |
| `precio_auth` | number | no | **D** | Lo que se cobra: `Cot.totalVendido(origen)` = `cobrado(neto,precioAuth)` = `precioAuth` si `>0` y difiere del neto en `>0.01`, si no `neto` (`cotizador.js:96-105`). Importados: = `neto` de la hoja | `proyectos.js:609,490` |
| `anti_pactado` | number | no (0) | **D** | Anticipo (col. I). Del buzón o `origen.anti`. Un `0` explícito manda (no cae al 50 %). Escribible solo Dirección en la plataforma; Pagos lo corrige en la hoja | `proyectos.js:610,606` |
| `iva` | boolean | no | **d** | `origen.iva !== false`. NO está en `CAMPOS_DE_DINERO` de la hoja (fabricación lo recibe). Regla de negocio: cuenta `Elias BBVA` = sin IVA, cualquier otra = con IVA (`venta.js:52-63`, `.gs:1043-1054`) | `proyectos.js:611` |
| `estatus_notion` | `'FABRICACION'\|'REPARANDO'\|'COBRANDO'\|'LIQUIDADO'` \| null | sí | **d** | Eje de DINERO (no de obra). Por omisión del modal del cotizador: `FABRICACION`. La capa de datos NO valida el valor (`ESCRIBIBLES` solo); `aNotion` filtra por `ESTATUS.includes` (`puente.js:343`). UI: Pagos solo elige `COBRANDO`/`LIQUIDADO` (`mod/proyectos.js:1432`). LO USAN TODOS LOS ROLES: `carpetas.enTaller` (`carpetas.js:130-133`) -> «Faltan datos» y marcas de Drive del Tablero | `proyectos.js:615` |
| `cuenta` | uno de 5 \| null | sí | **D** | `'Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT'` (`puente.js:157`, `.gs:29`). Sin validación en la capa de datos. Fabricación NO la recibe de la hoja (`CAMPOS_DE_DINERO` incluye `'Cuenta '`) | `proyectos.js:616` |
| `pago_pendiente` | number\|null | sí | **D** | FÓRMULA de la hoja (col. K = `ROUND(H-I-J,2)`). Solo la escribe la bajada; null = «la hoja no lo sabe» (distinto de 0). `actualizar` lo rechaza (`BLOQUEADOS`). Si null, `ventas.saldoDe` estima `vendido - anti_pactado` y la pantalla dice «estimado» | `proyectos.js:619,972`, `ventas.js:59-70` |
| `comision_restante` | number\|null | sí | **D** | FÓRMULA (col. T = `ROUND(R-S,2)`). Igual que arriba | `proyectos.js:620,973` |
| `pct_comision` | number (puntos) | no (0) | **D** | % «pactado». HOY LA COMISIÓN ES 10 % FIJO DEL SUBTOTAL; la hoja NO lee AD (`.gs:181-186`); el cotizador manda siempre 10 (`venta.js:27`). 0/vacío = «el de siempre, 10 %» | `proyectos.js:625` |
| `origen` | jsonb (objeto) \| `null` | sí (importados) | **D parcial** | Copia CONGELADA de la entrada de historial del cotizador. Ver 1.3. Inmutable por `actualizar`; solo `resincronizar` la reemplaza | `proyectos.js:344-352,964` |
| `sellos` | `{etapa,notas,plazo_k,tel,dir_texto,ubicacion,entrega: epoch-ms}` | sí | n | Hora de cada dato de la obra para «gana el más reciente». `lat`/`lng`→`ubicacion` (`SELLO_DE_CAMPO` `proyectos.js:529-532`). `instalacion` NO vive aquí (su sello es `actualizado_en` de la instalación; se filtra en `desdeVentaDeHoja` `proyectos.js:513-514`) | `proyectos.js:529-540,635-636` |
| `creado_en`, `actualizado_en` | int epoch-ms | no | n | Sellos de registro (reloj del teléfono) | `db.js:229-231` |
| `sync` | 0/1 | no | n | Plomería (0 = tocado localmente, 1 = vino de afuera). Se escribe en cada `actualizar` (`fila.sync=0`) | `proyectos.js:639,1063` |

### 1.3 `origen` — la copia congelada y su dinero

`congelar(entrada)` = `JSON.parse(JSON.stringify(entrada))` con `aiFile.url` vaciado a `''` (`proyectos.js:344-352`); agrega `fuente = 'cotizador'` si falta. La entrada la arma `guardarEnHistorial` (`js/cotizador/historial.js:119-162`):

Claves de `origen` (= entrada del historial): `folio, proy, cliente, tel, dirRaw, direccion, maps, entrecalles, entrega, notaCliente, fecha, plazoK, fechaAuth, autorizador, nota, precioAuth, neto, sub, iva, huellaAuth, sello, anti, antiManual, items[], itemsAuth{}, aiFile{name,type,url:''}, renders[], propuesta[], disp, ts, reenviada, fuente` (+ `huellaAuth` sobrescrita por la del buzón, `proyectos.js:551-552`).

Claves de `items[]` vistas en el código: `id, tipo('letras'|'recorte'|'bastidor'|'caja'|'manual'), material, comp, luz, ilumTipo, altura, n, acab, recComp, bas, ancho, alto, tarifa, pz, pu, desc, matAuto, showInPdf, plano, _lt` (`cotizador.js:115-116`, `historial.js:141`).

DINERO dentro de `origen` (hay que sacarlo de lo que ve Fabricación): `precioAuth, neto, sub, anti, antiManual, itemsAuth{id→importe}, items[]._lt, items[].pu`, y también `huellaAuth` (la huella concatena `pu` y `tarifa` por partida: `cotizador.js:115-129`) y `sello`/`autorizador`/`fechaAuth`/`nota` (autorización). Lo que Fabricación NECESITA de `origen` (orden de trabajo y material): `items[].{tipo,material,comp,luz,ilumTipo,altura,n,acab,recComp,bas,ancho,alto,tarifa,pz,desc,showInPdf}` + `cliente, proy, tel, dirRaw/direccion, entrecalles, notaCliente, entrega` (`mod/proyectos.js:2638-2716`).
Quien lee `origen` por dinero: `Cot.totalVendido(p.origen)` en Mapa (`mod/mapa.js:1238`) y la fórmula de huella `Cot.estadoOrigen` (`cotizador.js:151-158`).

### 1.4 Campos locales de reconciliación con la hoja (OBSOLETOS en un modelo de fuente única)

Marcas que existen SOLO en el teléfono (no viajan; se escriben con `DB` directo, `proyectos.js:1483-1487`): `hoja_perdida{motivo:'borrada'|'de_otra'|'no_bajo',folio,desde,mensaje}`, `duplicado_de{id,nombre,folio,folio_hoja,desde,por[],claves[]}`, `hoja_doble{folios[],desde}`, `fuera_de_hoja(ms)`, `sin_mandar{desde,campos[]}`, `hoja_confirmada`, `folios_previos[]`, `distinta_de[]`, `tel_a_la_hoja`, `entrega_a_la_hoja`, `obra_a_la_hoja`. Toda esa maquinaria (`avisoDeHoja`, `mismaVentaQueLaFila`, `ataLaFila`, `revisarContraLaHoja` `proyectos.js:1504-2179`, `volverADarDeAlta`, `dejarFueraDeLaHoja`, `quitarDelTablero`, `noEsLaMisma`, `juntarConLaDeAqui`) existe porque hay DOS fuentes de verdad. Con Supabase como única fuente desaparece; el importador solo debe leer `folio_hoja`, `de_hoja` y descartar las marcas.

### 1.5 Etapas, orden y transiciones

Vocabulario (todo en `proyectos.js:88-121`):
`ETAPAS = ['ganado','en_diseno','cortado','armado','listo','instalado','garantia','cancelado']`.
`ORDEN = {ganado:0,en_diseno:1,cortado:2,armado:3,listo:4,instalado:5}` — `garantia` y `cancelado` NO están en ORDEN (undefined).
`ETAPA_NOMBRE` (idéntico a `ETAPA_A_NOTION` `puente.js:188-197` y a `ETAPAS_OBRA` del .gs `2111-2112`): Ganado / En diseño / Cortado / Armado / Listo para instalar / Instalado / En garantía / No se dio.
`EN_TALLER = ['ganado','en_diseno','cortado','armado','listo']` (`carpetas.js:126`); `ETAPAS_CERRADAS = {instalado,garantia,cancelado}` (`reglas.js:174`); `VIVAS` = todas menos cancelado.

Reglas de `avanzarEtapa(id, etapa)` (`proyectos.js:1223-1273`), en orden:
1. `etapa` debe estar en `ETAPAS`, si no `DATO_INVALIDO`.
2. `etapa === 'cancelado'` ⇒ delega a `descartar(id,'')`: exige rol `direccion` (`ROL_SIN_PERMISO` si no), deja `etapa:'cancelado'`, sella `etapa`, anota bitácora `descarto`. Es «No se dio»: lápida, no borrado.
3. `puedeMover(rol, etapa)` (`proyectos.js:1116-1127`) con `TOPE_ROL = {direccion:null, fabricacion:'listo', pagos:false}`:
   - `direccion`: cualquier etapa destino.
   - `fabricacion`: solo si `ORDEN[destino] <= ORDEN.listo` (o sea ganado…listo). `instalado` y `garantia` ⇒ no (`garantia` tiene ORDEN undefined ⇒ false).
   - `pagos`: nunca (Pagos mueve `estatus_notion`, el otro eje).
   La regla solo mira el DESTINO, NO el origen: fabricación SÍ puede «regresar» un proyecto de `instalado`/`garantia` a `ganado..listo` en la capa de datos (la UI no le pinta esos pasos, `mod/proyectos.js:1508-1512`, pero `avanzarEtapa` no lo impide). Dirección puede «resucitar» un `cancelado` moviéndolo a cualquier etapa (agenda.js:244-245 lo pide en su mensaje).
4. Misma etapa ⇒ éxito sin escribir (doble toque).
5. `cruzaCorte` = `ORDEN[nueva] >= ORDEN.cortado && (ORDEN[antes] === undefined || ORDEN[antes] < ORDEN.cortado)` — «alcanzar» no «tocar»: `ganado→listo` también emite. Desde `cancelado`/`garantia` (ORDEN undefined) hacia `cortado+` TAMBIÉN cruza (`proyectos.js:1252-1253`).
6. Escribe `etapa` + sello `etapa` (`sellar`), encola `actualizar` con `campos:['etapa']`.
7. Si `cruzaCorte`: `emitirSalidas(proyecto,'manual', nota)` (1.6).
8. Bitácora `accion:'etapa'` con `antes/despues`; texto «regresó a» si el destino es menor en ORDEN.

Lo que hace SOLO la UI (no está en la capa de datos; la RPC debe decidir si lo replica):
- Regresar etapa pide confirmación y avisa que el material NO vuelve al almacén (`mod/proyectos.js:2482-2498`).
- Avanzar cruzando `cortado` pide «¿ya se cortó?» (`2499-2512`).
- No se puede saltar más de un paso en el riel de la ficha: «Ese paso todavía no toca» (`mod/proyectos.js:1238-1246`), pero el Tablero arrastrando tarjetas sí puede (`proyectos.js:1216-1219` documenta que `ganado→listo` es legítimo).
- `moverEtapa('instalado')` marca la instalación viva como `hecha` (`mod/proyectos.js:2516-2522`); inversamente `Agenda.marcar(...,'hecha')` mueve el proyecto a `instalado` solo si `ORDEN[etapa] < ORDEN.instalado` y `puedeMover(rol,'instalado')` (`agenda.js:430,442-452`). Es un acoplamiento instalación↔etapa que hoy vive en dos capas.

Transiciones AUTOMÁTICAS (no hechas por una persona):
- Instalación marcada `hecha` ⇒ `instalado` (arriba).
- Tarjeta importada de la hoja cuya fila pasa a `COBRANDO`/`LIQUIDADO` y cuya etapa sigue en la línea (`ganado..listo`) ⇒ `instalado`, solo de este lado, sin encolar (`puente.js:1946,2012-2016`).
- `desdeVentaDeHoja`: etapa = la de la fila si la trae, si no `'ganado'` (`proyectos.js:477`).
- La «etapa esperada» de `taller.ventanaTaller` es solo una comparación, JAMÁS se escribe (`taller.js:311-317`).
- No hay transición automática por fecha a `garantia`.

Etapa en la hoja: columna Z «Etapa de obra» con los 8 nombres legibles; filas históricas tienen vacío ⇒ `etapa:null` en `ventas_hoja` (`puente.js:653-656`).

### 1.6 Salidas de material al cortar (efecto de la etapa)

`emitirSalidas` (`proyectos.js:1147-1210`), serializada en cola de promesas (`_salidas`): por cada requerimiento del proyecto que NO esté `'consumido'`, con cantidad > 0 (`cantidad_ajustada` si no es null, si no `cantidad_compra`), emite un movimiento `tipo:'salida'`, `cantidad:-cant`, con ID DETERMINISTA `'mov-salida:' + req.id` (`proyectos.js:1178`) — si ya existe en el libro no se vuelve a emitir, solo se marca el requerimiento `estado:'consumido'` (encola `actualizar` almacén `requerimientos` con `campos:['estado']`). Esa idempotencia por id es la que evita dos salidas entre teléfonos.
`emitirSalidasDerivadas(hoy)` (`proyectos.js:1297-1325`, llamada por `reglas.js` al evaluar): para toda instalación no cancelada con fecha a ≤1 día (o ya pasada), emite las salidas con `origen:'derivado'` y nota «Derivado, nunca confirmado…» SIN mover la etapa.

### 1.7 Actualizar: validaciones por campo (`actualizar`, `proyectos.js:1011-1087`)

- Parche con un campo en `BLOQUEADOS` o fuera de `ESCRIBIBLES` ⇒ se rechaza TODO el parche.
- `BLOQUEADOS` (con su razón): `origen, folio_global, folio_local, creado_en, id, dispositivo, empresa_id, etapa (usar avanzarEtapa), pago_pendiente, comision_restante, sub, neto, precio_auth, iva` (`proyectos.js:963-978`). Es decir: NADIE, ni Dirección, edita el importe/IVA de un proyecto salvo reautorizando en el cotizador y `resincronizar`.
- `ESCRIBIBLES` (`proyectos.js:954-959`): `nombre, contacto, negocio, tel, notas, tipo_trabajo, compromiso_texto, dir_texto, entrecalles, maps_url, lat, lng, geo_fuente, anti_pactado, cuenta, estatus_notion, notion_page_id, notion_estado, pct_comision, fecha_ganado, plazo_k, entrega, sync`.
- Normalizaciones: `lat/lng` → number o null; `tipo_trabajo` array, filtrado a los 7, no vacío; `anti_pactado`/`pct_comision` → `num`; `fecha_ganado` `YYYY-MM-DD`; `entrega` ∈ 3; `plazo_k` 1..5 o null.
- Sello solo de lo que realmente cambió (`JSON.stringify` antes/después) (`proyectos.js:1066-1067`).
- Bitácora `accion:'cambio'` con antes/después cuando se toca UN campo.

### 1.8 Permisos de escritura por rol (capa de datos) — `CAMPOS_ROL` (`proyectos.js:982-995`)

| Rol | Campos de `proyectos` | Etapa | Instalaciones |
|---|---|---|---|
| direccion | todos los `ESCRIBIBLES` | cualquiera (`cancelado` solo por `descartar`, solo ella) | agenda: crea `confirmada`; mover/cancelar/marcar |
| fabricacion | `notas, lat, lng, geo_fuente, maps_url, entrecalles, plazo_k, entrega, tel, dir_texto, sync` | destino ≤ `listo` | crea como `propuesta`; puede mover y `marcar` cualquier estado (el permiso solo bloquea a Pagos, `agenda.js:210-217`) |
| pagos | `notas, cuenta, estatus_notion, notion_page_id, notion_estado, pct_comision, tel, sync` | ninguna | ninguna (`ROL_SIN_PERMISO` en agendar/reagendar/marcar) |

Puntos finos que el plan (4.2) no recoge:
- Fabricación también escribe `notas`, `plazo_k`, `entrecalles`; Pagos escribe `notas` y `pct_comision`.
- `anti_pactado` solo Dirección en la plataforma, pero en la hoja Pagos escribe `Anticipo` (`.gs:2134`).
- Pagos NO puede cambiar `sub`, `nombre`, `iva`; en la hoja tampoco `Precio Subtotal`/`IVA`/`Proyecto` (solo Dirección, `.gs:2121-2125`), pero «en la hoja PAGOS corrige a mano el subtotal, el nombre o el anticipo» (`proyectos.js:1346-1349`). INFERENCIA mía: esa edición directa de celdas (`alEditar`) no pasa por `PUENTE_ROLES`, que solo gobierna lo que escribe el puente; no leí los permisos de edición de la propia hoja (NO CONFIRMADO).
- La hoja es la frontera real hoy: `PUENTE_ROLES` (`.gs:2120-2136`):
  - direccion: Proyecto, Precio Subtotal, IVA, Anticipo, Liquidacion, Abono Comision, Estatus, Cuenta, Fecha Anticipo e Instalacion, Fecha Liquidacion, Folio cotizacion, Etapa de obra, Fecha instalacion, Hora instalacion, Ubicacion, Direccion, Tipo de trabajo, Porcentaje comision, Telefono, Entrega, Notas, Plazo taller.
  - fabricacion: Etapa de obra, Fecha instalacion, Hora instalacion, Ubicacion, Direccion, Telefono, Entrega, Notas, Plazo taller.
  - pagos: Anticipo, Liquidacion, Abono Comision, Estatus, Cuenta, Fecha Liquidacion, Porcentaje comision, Telefono, Notas.
- Validaciones del lado de la hoja que hay que portar a SQL (`armarCeldas`, `.gs:2955-3069`): `Estatus` ∈ 4; `Cuenta` ∈ 5; `Etapa de obra` ∈ 8 nombres; `Tipo de trabajo` ⊂ 7; `Anticipo`/`Liquidacion` número ≥ 0; `Precio Subtotal` número (puede ser negativo); `Porcentaje comision` 0..100 o vacío; fechas `YYYY-MM-DD` o vacío; `Entrega` ∈ 3 o vacío; `Plazo taller` ∈ 5 o vacío; `Notas` ≤ 40 000; `Hora instalacion` `HH:MM` o vacía; `Telefono` pasa por `telefonoLimpio` y exige un dígito; texto libre ≤ 2000; `Abono Comision` `>0` y `<1e7`.

### 1.9 Derivaciones puras que el SQL/cliente debe conservar

- `tiposDerivados(items)` (`proyectos.js:205-230`): ignora partidas en blanco (`partidaEnBlanco` `162-167`); `letras`→«Letras 3D con/sin iluminacion» según `luz !== false`; `caja`→«Caja de luz con/sin iluminacion»; `recorte`→`acab==='vinil'` ? «Rotulacion de vinil» : «Recorte acrilico»; `bastidor`, `manual` o desconocido → «Custome / Proyecto Especial». Salida en el orden canónico de `TIPOS_TRABAJO`.
- Los 7 valores (SIN acentos, «Custome» mal escrito A PROPÓSITO, `proyectos.js:132-140`): `Caja de luz con iluminacion`, `Caja de luz sin iluminacion`, `Letras 3D con iluminacion`, `Letras 3D sin iluminacion`, `Rotulacion de vinil`, `Recorte acrilico`, `Custome / Proyecto Especial`.
- `nombreDerivado` (ver 1.2).
- `plazoSugerido(tipos, items)` (`taller.js:135-167`): `CUBO_POR_TIPO` vinil=1, recorte=1, letras/caja sin luz=2, con luz=3, Custome=4; base = el más alto; `+ (n_tipos_reconocidos − 1)`; `+1` si la pieza mayor `> 244 cm`; tope 5; sin tipo reconocido → 4 (`PLAZO_DEFECTO`).
- `PLAZOS` (`taller.js:55-61`): k1=7 d, k2=11 d, k3=14 d, k4=18 d, k5=21 d; etiquetas «1 semana», «1.5 semanas», «2 semanas», «2.5 semanas», «3 semanas o más».
- `ventanaTaller(p, inst, {hoy,cts})` (`taller.js:247-345`): cuenta hacia atrás desde la instalación viva (colchón `PLAZO_COLCHON_DIAS=1`, proveedor `PLAZO_PROVEEDOR_DIAS=3`, `taller.js:176-179`); sin instalación, desde `fecha_ganado` hacia adelante; NUNCA ancla en hoy. Estados: `a_tiempo, justo, tarde, no_llega, hecho, cancelado, sin_fecha`.
- Garantía y liquidación (`proyectos.js:2522-2620`): `LIQUIDACION_HABILES=2` días hábiles (lun-vie, sin festivos) tras instalar; excepción total `> 60 000` (`LIQUIDACION_EXCEPCION`) no cuenta regresiva; `GARANTIAS` eléctrico 12 meses, colorimetría 24; estados `pagada|excepcion|aTiempo|venceHoy|vencida`.

### 1.10 Saldo, cobrado y comisión (fórmulas que hoy viven en cliente)

- `vendidoDe(p) = cobrado(p.neto, p.precio_auth)` (`ventas.js:53`).
- `saldoDe(p)` (`ventas.js:59-65`): 0 si `cancelado` o `estatus_notion==='LIQUIDADO'`; si `pago_pendiente` es número ⇒ `max(0, red2(pago_pendiente))`; si no ⇒ `max(0, red2(vendido − anti_pactado))`.
- `comisionDe(p)` (`asistente-contexto.js:50-63`): `PCT_COMISION=10`; `comision = comisiones de la hoja si bajó, si no red2(sub*10/100)` (con `sub` o `vendido/1.16` si no hay); restante = `comision_restante` si viene; se ABONA solo si el estatus es `LIQUIDADO`.
- Hoja (`.gs:170-205`), para que la vista SQL cuadre «al centavo»: `H = ROUND(G*(1+IF(F="Sí",16%,0)),2)`; `K = ROUND(H-I-J,2)`; `O = N-L`; `R = ROUND(G*10%,2)`; `S = SUMIF(Abonos!A:A=A, Abonos!C:C)`; `T = ROUND(R-S,2)`.

---------------------------------------------------------------------------------------------------

## 2. INSTALACIONES

Almacén `instalaciones`, keyPath `id`, índices `porFecha`→`fecha`, `porProyecto`→`proyecto_id` (`db.js:63-64`).

### 2.1 Campos (creación en `agenda.agendar`, `agenda.js:278-295`; importada de la hoja `puente.js:773-787`)

| Propiedad | Tipo / valores | Notas |
|---|---|---|
| `id` | text `'inst-' + ts36 + '-' + 6 car.` (`DB.nuevoId('inst')`) | PK. DEBE conservarse: `uid_ics` se arma con él |
| `empresa_id` | text | `Prefs.empresa()` o el del proyecto |
| `proyecto_id` | text (FK al proyecto) | `juntar` puede repuntarlo (`proyectos.js:1912-1915`) |
| `fecha` | `YYYY-MM-DD` | «el día en que el trabajo SALE del taller» (para envío/recolección también) (`entrega.js:14-17`) |
| `hora` | `'HH:MM'` \| null | null = sin hora = evento de todo el día en .ics. Nunca obligatoria (`agenda.js:11-17`). Normaliza `normHora`: 1-2 dígitos de hora, 00-23 / 00-59 |
| `ventana` | `'dia'\|'noche'\|'madrugada'` | Antiguas `'manana'`,`'tarde'` se leen como `'dia'` (`agenda.js:90-116`). Noche/madrugada ⇒ alarma larga −PT120M |
| `duracion_min` | int, 1..600 | Sugerida (`duracionSugerida`, `agenda.js:135-176`): base 180; por tipo 240/180/120; `+30` por tipo de más; redondeo a 30; tope `DURACION_TOPE=600` |
| `estado` | `'propuesta'\|'confirmada'\|'reagendada'\|'hecha'\|'cancelada'` | Inicial: `confirmada` si crea Dirección, `propuesta` si no (`agenda.js:219`). `VIVAS` = todas menos `cancelada`. `reagendar` fija `reagendada` salvo que ya sea `hecha` (se queda `hecha`) |
| `movida` | int ≥ 0 | = SEQUENCE del .ics. +1 al reagendar (solo si cambió fecha/hora/ventana/duración) y al CANCELAR; nunca baja |
| `uid_ics` | text `inst-<id>@al3d.mx` | INMUTABLE. Se rellena si falta (`i.uid_ics \|\| 'inst-'+i.id+'@al3d.mx'`). Si el UID cambia el calendario del instalador DUPLICA el evento |
| `gcal_event_id` | `null` siempre | CAMPO MUERTO: solo se escribe `null` al crear (`agenda.js:292`, `puente.js:784`); nadie lo lee ni lo escribe después. El id de Google Calendar es determinista sobre el `uid` (`gcal.js` `idDeterminista`, `fabricacion.js:1529-1535` lo dice) |
| `notas` | text multilínea | Registro acumulativo: se ANEXA «Movida del … al …: motivo», «Cancelada: motivo», «Agendada desde la hoja.», «Cancelada en otro dispositivo: …» |
| `creado_en`, `actualizado_en`, `sync` | ms, ms, 0/1 | |
| `sello_hoja`, `sello_hoja_en` | ms | Solo en instalaciones tocadas por `citaDeHoja` (`puente.js:807`): sello de la hoja y la hora local en que se escribió, para `selloDeInstalacion` (`puente.js:457-462`) |

El tipo de entrega (instalación / paquetería / recolección) NO está en la instalación: es `proyectos.entrega`. `agenda.paraIcs` lo lee del proyecto (`agenda.js:785`) y cambia título («Instalación · », «Envío: », «Recolección: »), descripción, LOCATION (envío: vacía; recolección: «Anuncios Luminosos 3D, Naranjos #648, Col. Lindavista, 45169 Zapopan, Jal.», `entrega.js:58-59`) y alarmas.

### 2.2 Reglas

- UNA sola instalación VIVA por proyecto: `agendar` sobre un proyecto que ya tiene una viva REAGENDA la existente en vez de crear otra (`agenda.js:259-274`); idempotente si nada cambió. NO está forzado por índice: un `UNIQUE (proyecto_id) WHERE estado <> 'cancelada'` sería nuevo.
- No se agenda un proyecto `cancelado`.
- `reagendar` conserva UID, sube `movida`, apunta «Movida del A al B: motivo» en `notas`.
- `marcar(instId, estado, motivo)`: `estado` ∈ los 5; `cancelada` sube `movida`; `hecha` ⇒ `instalarProyecto` (ver 1.5). Sin chequeo de transición entre estados.
- Pagos no toca la agenda; Fabricación PROPONE (nace `propuesta`) pero luego puede confirmar vía `marcar`.
- Una instalación cancelada NO cuenta como fecha del proyecto (`proyectos.listar sinFecha` `proyectos.js:919-928`, `taller.js:267`).
- Semáforo de material por día (`agenda.js:644-763`): `ok|falta|grave`, `DIAS_GRAVE=3`; un proyecto sin requerimientos cuenta como falta, no como listo; `de_hoja` sin partidas ⇒ código `sin_partidas`.
- Hoja ↔ instalación: UNA cita por fila (cols. M «Fecha instalacion» y AA «Hora instalacion»). La hoja manda al bajar (decisión 2026-10-08, `puente.js:700-722`): fecha distinta ⇒ `reagendar` (movida+1, nota «así quedó en la hoja»); sin instalación y proyecto en la línea del taller con fecha ≥ hoy ⇒ crea `confirmada` con `ventana:'dia'`, `duracion_min` sugerida, nota «Agendada desde la hoja.»; con sellos, fecha vacía + sello más nuevo ⇒ `cancelada` (movida+1). Una fecha vacía sin sello NO cancela.
- Quién lee: los 3 roles ven el Calendario; Pagos con filtro «solo días con cobro» (`pago_pendiente>0`, `fabricacion.js:584-590`) y sin semáforo ni WhatsApp (`fabricacion.js:575-581`).
- El .ics NO lleva dinero (`agenda.js:775`).

### 2.3 .ics (`js/nucleo/ics.js`)

`UID` = `uid_ics` tal cual si trae `@`; `SEQUENCE` = `movida`; `STATUS` = TENTATIVE(propuesta) / CONFIRMED(confirmada, reagendada, hecha) / CANCELLED(cancelada) (`ics.js:168-171`); fecha/hora en UTC sumando 6 h a la hora de Guadalajara (`OFFSET_MX = 6`, sin VTIMEZONE, `ics.js:45-48`); sin hora ⇒ `DTSTART;VALUE=DATE` con `DTEND` = día siguiente; alarmas `-P3D`, `-P1D`, y `-PT30M` (o `-PT120M` con ventana noche/madrugada) solo con hora; descripciones distintas para paquetería/recolección; `DURATION` por defecto 180 min; plegado a 75 octetos; CRLF; `PRODID -//THIQA//Plataforma AL3D 1.0//ES`. Google Calendar (token por persona, solo Dirección ve los botones: `fabricacion.js:1215,1972`) usa el mismo `alarmasDe`.

---------------------------------------------------------------------------------------------------

## 3. CLIENTES: no existe la entidad

Dónde viven hoy:
- En el proyecto: `contacto`, `negocio`, `tel`, `dir_texto`, `entrecalles`, `maps_url`, `lat`, `lng`, `geo_fuente`, `ubicacion_pendiente` (1.2). Un «cliente» repetido en dos proyectos son dos copias independientes.
- Dentro de `origen`: `cliente`, `proy`, `tel`, `dirRaw`, `direccion`, `maps`, `entrecalles`, `notaCliente`.
- En el historial del cotizador (localStorage `al3d_historial`): mismos campos por cotización.
- «Cuadernos de cliente» (agrupación VIRTUAL, no almacenada) en `cotizador.js:261-366`: pasada 1 agrupa por `telClave` = últimos 10 dígitos si hay ≥10 dígitos (`clave 'tel:<10>'`); pasada 2 las entradas sin teléfono se unen por nombre normalizado (`trim().toLowerCase()` con espacios colapsados) solo si ese nombre pertenece a UN solo grupo de teléfono; si no, `'nom:<nombre>'`; sin nombre `'?'`. Cada grupo da `nombre, tel, dirRaw, maps, alias[], vendido(suma totalVendido), primera, ultima`. La NOTA del cuaderno vive en localStorage `al3d_cuadernos` (por clave de grupo, `cotizador.js:344-357`).
- En la hoja: SOLO `Proyecto` (col. B, «Contacto - Negocio» con el «(Tipo)» opcional, ver 7), `Telefono` (AE), `Direccion` (AC), `Ubicacion` (AB). No hay cliente separado ni identificador.
- Almacén `geo` (caché de geocodificación, `LLAVE.geo='q'`): no migra.

Reglas de dato:
- Teléfono: `telefonoLimpio` (1.2). Idéntica regla en el .gs (`telefonoLimpio` es una réplica probada por `pruebas/puente.mjs`).
- Ubicación: `lat/lng` con `0,0` rechazado y rango `|lat|≤90,|lng|≤180`; la hoja la guarda como texto `'lat,lng'` o el link si no se pudo leer (`puente.js:352-354`, `proyectos.js:412-420`).
- La dirección es texto crudo, no se parte en campos: «es lo que el instalador va a leer en la calle» (`mod/proyectos.js:1388-1393`).
- Entrega ≠ instalación: con `paqueteria`, `dir_texto` es DESTINO y no se pide pin; con `recoleccion` no se pide dirección (usa la del taller) (`datos-de-entrega.js:11-24`).
- «Faltan datos» (`datos-de-entrega.js:62-72`): `tel` si `!telValido`; `entrega` si el campo no es uno de los 3; si `entregaLimpia==='instalacion'`: `dir` si `dir_texto` vacío y `pin` si `!tienePin`. Solo para proyectos `enTaller` (etapa ganado..listo y estatus ∉ {COBRANDO,LIQUIDADO} y sin `hoja_perdida`). `DIAS_PRONTO=7` (urgente).

Consecuencia para `clientes` (plan 4.7): hay que DEFINIR la regla de deduplicación (la de `cuadernos()` es la única que existe) y decidir si `proyectos` mantiene `contacto/negocio/tel/dir_texto` desnormalizados (hoy el proyecto es la fuente de lo que se llama por teléfono y lo que se instala).

---------------------------------------------------------------------------------------------------

## 4. FOLIOS

Cuatro identificadores distintos, todos con un propósito diferente:

| Nombre | Formato | Quién lo genera | Dónde vive | Unicidad hoy |
|---|---|---|---|---|
| Folio impreso de cotización (`origen.folio`, `proyecto.folio_local`, `Q.folio`) | `COT-` + 4 dígitos `padStart(4,'0')` + `-` + 1 LETRA del teléfono, ej. `COT-0042-B` (los viejos: `COT-0042`) | Cotizador en el teléfono: `nextFolio()` = `folioFmt(n)`, `n = al3d_folio + 1` saltando los números ya tomados por la cola (`al3d_queue`, salvo rechazadas) y el historial (`historial.js:2570-2599`). `al3d_folio` (localStorage) solo sube al AUTORIZAR (`confirmarFolio`); mientras es borrador es provisional. `folioNum` lee los PRIMEROS dígitos, así que con/sin letra comparten contador | localStorage del teléfono (`al3d_folio`, en `RESPALDO_KEYS`) | Contador POR TELÉFONO. Dos teléfonos emiten el mismo `COT-0042`; la letra (`al3d_pf_letra_folio`, editable en Ajustes `ajustes.js:1069-1075`, por omisión la 1ª letra del id del aparato) solo reduce la colisión. `reFoliarSiEsOtroCliente` puede re-numerar (`historial.js:95-106`) |
| Id del aparato `dispositivo` | 4 car. de `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (sin 0/O/1/I), generado con `crypto.getRandomValues`; fallback `D####` | `Prefs.dispositivo()` / `dispositivo()` del cotizador (misma clave `al3d_pf_disp`) | localStorage; NO entra al respaldo a propósito (`js/cotizador/entrega.js:299-301`) | Aleatorio, sin registro central |
| «Folio cotizacion» = `folio_global` | `<folio impreso>@<dispositivo>`, ej. `COT-0042-B@K7QM`. Validado: `^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$` (`.gs:3573-3577`) | `Cot.folioGlobal(folio, disp)` (`cotizador.js:186`) con `disp` = `extra.disp` o el de ESTE teléfono | `proyecto.folio_global`; hoja col. Y; `ventas_hoja.folio_cotizacion`; historial no lo guarda (se arma con `e.folio + '@' + (e.disp \|\| este)`) | NINGUNA restricción: índice `porFolio` no único; `yaExiste` (`proyectos.js:643-654`) es una guarda de aplicación (carrera posible entre teléfonos). En la hoja `filaPorFolioCotizacion` toma la primera coincidencia; la columna `Revisar` solo marca duplicados de la col. A, no de Y |
| Folio interno de la hoja | `V-` + `n` con al menos 3 dígitos (`V-001`…`V-1000`) | Apps Script: `reservarFolios(h,k)` sube la propiedad `FOLIO_MAS_ALTO` (`.gs:1366-1421`) con candado; nunca se reparte dos veces ni baja al borrar. `numeroDeFolio` solo acepta `^V-\d{1,7}$` | hoja col. A; `proyecto.notion_page_id`/`folio_hoja`; `proyecto.id` de importados | Único por construcción de la marca, pero solo mientras exista la hoja |

Detalles que afectan al importador y a la unicidad:
- `ganar` desde la UI («Se ganó» de Dirección, `inicio.js:1015`, `fabricacion.js:2500`, `mod/proyectos.js:1066`) NO pasa `disp`: usa el dispositivo del teléfono que toca el botón (`proyectos.js:678-679`), mientras que `descartar(entradaObjeto)` y `drenarBuzon` usan `e.disp` / `g.disp` (`proyectos.js:759`, `cotizador.js:233`). Una cotización restaurada de otro teléfono puede entrar con un `@DISP` distinto al que dice su entrada ⇒ no se puede asumir `folio_global == historial.folio + '@' + historial.disp`.
- Un proyecto importado de la hoja tiene `folio_global=''` y `folio_local=folio_hoja`. `aNotion` ya no manda `folio_local` a la col. Y (`puente.js:329-338`): defecto histórico de septiembre de 2026 que dejó filas con `Y = V-nnn` (huella: `llaveDeCotizacion` lo ignora, `.gs:3095-3100`).
- La col. Y de una fila NO se pisa en un cambio una vez atada (`.gs:2841-2863`); una fila atada a otro folio responde `NO_ENCONTRADO motivo:'de_otra'`.
- El alta busca antes de crear: primero por `id_notion` (con verificación de que la llave de cotización coincida), luego por `Folio cotizacion` (`.gs:2754-2781`); sin `id_notion` crea SOLO si trae `Proyecto`, y no crea una venta con etapa «No se dio» (`.gs:2807-2816`).
- Capacidad de la hoja: `FIN = 310` (`.gs:9`): como máximo 309 ventas; `primeraFilaLibre` falla con «Ya no hay filas libres antes de la 310» (`.gs:2829-2833`) y todas las ARRAYFORMULA acaban en la fila 310.

---------------------------------------------------------------------------------------------------

## 5. SONDEO Y CICLO DE SINCRONIZACIÓN (js/app.js + js/datos/sync.js)

### 5.1 Arranque (`arrancar`, `app.js:1557-1890`), en orden
1. `registrarSW()` (antes de la puerta).
2. `Puerta.custodiar()` — no resuelve hasta que hay derecho a pasar (pase `{correo, rol, hasta}`: `DIAS_PASE = 30` días offline, `CIERRE_DIARIO = true`: la sesión vale el día natural en que se entró con Google, `puerta.js:124-134,451`; `prefs.js:314-319`).
3. Pintar barra/rol, `DB.abrir()` (`app.js:1746`).
4. `Mat.sembrar()` (catálogo y constantes).
5. `Cot.drenarBuzon()` — convierte `al3d_pf_ganadas` en proyectos (`app.js:1767`) y de nuevo en cada evento `storage` (`app.js:1798-1810`).
6. `montar(ruta)` (primera pantalla).
7. `enchufarPuente()` (`app.js:1897-1910`): si `Prefs.hayPuente()` (hay token de dispositivo O un correo de ingreso Google guardado, `prefs.js:294-300`) ⇒ `Sync.registrar(Puente.desdePrefs())`.
8. `sincronizarCallado()` (`app.js:1819`) y luego los oyentes de 5.2.

### 5.2 Qué dispara EMPUJAR (`Sync.bombear`) y JALAR (`Sync.jalar`)

| Disparador | Empuja | Jala | Dónde |
|---|---|---|---|
| Arranque | sí | sí | `app.js:1819` |
| `setInterval` cada `MS_SINCRONIZAR = 30000` ms, SOLO si `document.visibilityState==='visible'` | sí | sí | `app.js:1837-1839`, `1921` |
| `visibilitychange` → visible | sí | sí | `app.js:1840-1842` |
| `window 'online'` | sí | sí | `app.js:1830` |
| Tras renovar el token de Google con un clic (frenos: 60 s entre renovaciones, 10 min tras negarse) | sí | sí | `app.js:1860-1880` |
| Cada `encolar()` (operación nueva) ⇒ `programarBombeo()` a los 1500 ms (`MS_BOMBEO_DIFERIDO`), solo si configurado y online | sí | no | `sync.js:338-348` |
| Entrar a Control con datos >10 min (`MIN_FRESCO_MS`) | sí | sí | `control.js:117-120,333-337` |
| Botones de Ajustes «Mandar lo que está pendiente» / «Traer el dinero de la hoja» (hasta 20 vueltas) | sí | sí | `ajustes.js:1529-1600` |
| Juntar copias (botones de la ficha) | sí | no | `mod/proyectos.js:2267,2282` |
| App en segundo plano | NO se sondea nada («batería y cupo») | | `app.js:1833-1836` |

`sincronizarCallado` serializa: una vuelta a la vez; quien llega segundo espera la misma promesa (`app.js:2013-2019`); `bombear` y `jalar` también tienen su propia promesa compartida (`sync.js:487-489,733-735`).

### 5.3 Una vuelta (`sincronizarDeVerdad`, `app.js:2030-2121`)
1. `Sync.configurado()`; si `navigator.onLine===false` ⇒ estado `sin-senal` y NADA sale.
2. `Sync.bombear()`: lee `pendientes()` (`estado` ≠ `conflicto|sin_destino|rechazada`) en orden `ts` (índice `porTs`), una a una; lote de hasta `MAX_LOTE=25` solo para almacén (`movimientos`, `materiales`, `requerimientos`); para proyectos/instalaciones de una en una por `POST /empujar`. Respuestas: `ok` ⇒ borra; `ok+omitida` ⇒ borra sin contar; `SIN_DESTINO` ⇒ estado `sin_destino`; `definitivo` ⇒ estado `rechazada` (con `codigo_rechazo`, `motivo_rechazo`); `CONFLICTO` ⇒ estado `conflicto`; otro error ⇒ `intentos+1`, `ultimo_error`, queda `pendiente`. PARA el bombeo solo con `SIN_RED`, `DESCONOCIDO` o `ROL_SIN_PERMISO` de la puerta (`sync.js:641-647`). `esperaMs(intentos)` (backoff `min(1h, 5s·2^n)`, `sync.js:714-717`) está EXPORTADO PERO NINGÚN CÓDIGO LO USA: no hay reintento exponencial real; cada vuelta reintenta TODO lo pendiente.
3. `Sync.jalar()` en bucle hasta 10 vueltas mientras `hay_mas` (`app.js:2065-2076`): la hoja manda ya todas sus filas de una vez (~309), así que en la práctica es una. Cada vuelta baja el barrido de la pestaña Ventas completo (`ventas_hoja`, con borrado de lo que la hoja ya no trae al cerrar un barrido COMPLETO) y, en la última página, el almacén (pestañas Almacén/Catálogo/Listas). `sync.fusionar` = superposición de campos del más reciente por `actualizado_en` a nivel de REGISTRO (`sync.js:909-927`); para la obra manda además `obraDeLaFila` con sellos por dato; el dinero baja SIEMPRE de la hoja.
4. Marca `al3d_pf_ultima_bajada` (localStorage, clave suelta fuera de `Prefs.CLAVES`) si no hubo falla (`app.js:1963,2078-2081`).
5. Después, siempre que haya red: `Carpetas.alDia(proyectos, rol)` (Drive; Dirección abre la carpeta que falta) y `Proy.resolverLinksPendientes(Sync.expandir)` (hasta `LINKS_POR_VUELTA=5` links cortos de Maps por vuelta, reintento a los 10 min). Cada uno en su propio try.
6. Estado visible: `quieto|trabaja(>1s)|ok(2.6s, solo si bajó algo)|sin-senal|mal`. Se repinta la pantalla SOLO si algo bajó (`movio`) o Drive/links cambiaron Y `puedeRepintar()` (sin capa abierta ni campo enfocado); si no, queda para la siguiente vuelta.
7. Lo SUBIDO no cuenta como cambio para repintar (`app.js:2041-2046`).

### 5.4 Qué pasa al volver la señal
`online` ⇒ `sincronizarCallado()`: primero empuja TODA la bandeja en orden de emisión (la que se acumuló offline), luego baja la hoja. Mientras tanto: `programarBombeo` no sale offline (`sync.js:344-345`), `bombear` devuelve `{motivo:'sin_red'}`, `jalar` devuelve `SIN_RED`. La bandeja (`pendientes`) es durable en IndexedDB. Conflictos: no existe `esperado` real en la hoja (`puente.js:32-42`); las operaciones se aplican con las reglas de sellos (`obraDeLaFila` / `SELLADAS` del .gs); `CONFLICTO` casi no se produce hoy. `frescura()` avisa si hay cola atorada ≥48 h o rechazadas (`sync.js:990-1059`).

### 5.5 Forma de una operación de la bandeja (`sync.encolar`, `sync.js:293-329`)
`{id:'op-…', tipo:'crear'|'actualizar'|'apendice', almacen, entidad, registro_id, entidad_id, datos:<registro COMPLETO al encolar>, campos:string[]|null, esperado, ts, disp, intentos, ultimo_error, estado:'pendiente', conflicto, sync:0}` + al apartar: `codigo_rechazo, motivo_rechazo, revivida_tel|revivida_entrega|revivida_obra`. Ids reservados `_marcas` en el mismo almacén guardan `ultimo_envio, ultima_bajada, cursor, vistos, barrido, ultima_bajada_completa`. `movimientos` es `apendice` (append-only, idempotente por id). `campos` le dice al relevo qué viaja (el dinero y el nombre solo viajan en el alta o cuando son el campo que cambió).

### 5.6 Otros hechos de ciclo
- Timeout por petición al puente 15 s (`puente.js:922`, `venta.js:294`).
- Cupo de la hoja: 60 peticiones/min (`.gs:2164`).
- `ctx.sincronizar = sincronizarCallado` queda expuesto a los módulos (`app.js:2122`).
- Respaldo/restauración (Ajustes): `DB.exportar/importar` por id con «gana el más nuevo»: `NO_RESPALDA=['pendientes','ventas_hoja']` (`db.js:38`); `movimientos` y `bitacora` repetidos se descartan; la mitad del cotizador se deja en `al3d_pf_restaurar` (`ajustes.js:1123-1183`). «Cordón» (`ajustes.js:1709-1756`): `DB.vaciar` de TODOS los almacenes + `Prefs.GANADAS=[]`, `setPuente(null)`, `setGcal(null)`; conserva nombre, rol y `dispositivo`. NO toca claves del cotizador (`al3d_historial`…). «Salir de Google» borra solo el pase y recarga; lo guardado NO se borra (`ajustes.js:1294,1314-1325`) ⇒ el «borrar copia local al revocar acceso» del plan 4.8 es comportamiento NUEVO.

---------------------------------------------------------------------------------------------------

## 6. QUÉ VE Y QUÉ NO VE CADA ROL

### 6.1 Rol y su origen
`Prefs.rol()` = rol del PASE vigente (de la pestaña «Accesos» de la hoja) si hay; si no, `al3d_pf_rol` o `'direccion'` por omisión (`prefs.js:174-179`). `ROLES=['direccion','fabricacion','pagos']`. `veDinero() = rol() !== 'fabricacion'` (`prefs.js:193`). Con pase el interruptor de rol está apagado. La barrera real hoy es el token/correo en el Apps Script, no la pantalla.

### 6.2 Rutas por rol (`RUTAS`, `app.js:69-109`)
- Tablero (`hoy`), Calendario (`agenda`), Proyectos, Cotizador, Qué atender (`atender`, oculta), Ajustes: los TRES roles.
- Material, Mapa, Mesa de corte (`anidador`), Vectorizador: `direccion` y `fabricacion`.
- Control (`control`): `direccion` y `pagos`.
- Publicaciones: solo `direccion`.
⇒ Fabricación no tiene Control; Pagos no tiene Material, Mapa ni herramientas de corte.

### 6.3 Dinero por pantalla (todo es OCULTAR EN LA PANTALLA; el dato igual está en el IndexedDB del teléfono)

| Pantalla | Dirección | Pagos | Fabricación | Fuente |
|---|---|---|---|---|
| Tablero: tarjeta «En el taller $X» (suma `precio_auth` de los que están en ventana hoy) | ve | ve | NO existe el elemento | `tablero.js:649-660` |
| Tablero: tarjeta «Control» | sí | sí | no | `tablero.js:1289` |
| Tablero: «Trabajo sin material»/«Falta material» | sí | no | sí | `tablero.js:638-641` |
| Tablero: «cotizaciones sin decidir» (Se ganó / No se dio) | sí | no | no | `tablero.js:326`, `proyectos.js:339`, `fabricacion.js:361` |
| Ficha de proyecto: Subtotal, Total vendido, Anticipo, IVA, Comisión pactada, Pago pendiente, Comisión restante | ve | ve | NO (bloque `if (ve)`) | `mod/proyectos.js:1300-1333` |
| Ficha: «Estatus en la hoja (dinero)» y «Cuenta de cobro» | ve | ve | **LOS PINTA IGUAL** (en la práctica `cuenta` le llega vacía porque la hoja se la quita; el estatus sí le llega) | `mod/proyectos.js:1295-1298`, `.gs:2149-2153` |
| Ficha: botones de estatus/cuenta | los 4 estatus + 5 cuentas | solo `COBRANDO`/`LIQUIDADO` + 5 cuentas | no | `mod/proyectos.js:1431-1444` |
| Ficha: pasos de etapa | todos menos cancelado | NO se pinta | hasta «Listo» | `mod/proyectos.js:1429,1508-1512` |
| Ficha: «Orden de trabajo» (usa `origen.items`, sin precios) | sí | no | sí (botón primario) | `mod/proyectos.js:1447-1450,2638-2716` |
| Ficha: «Copiar datos para la hoja» (solo si no tiene `notion_page_id`) / «No se dio» | sí / sí | sí / no | no / no | `mod/proyectos.js:1454-1460` |
| «Enseñar al cliente» (tapa comisión pactada y restante) | sí | sí | no existe | `mod/proyectos.js:1689-1705` |
| Mapa: «Vendido en $X» (`Cot.totalVendido(p.origen)`) | ve | (no tiene Mapa) | NO | `mod/mapa.js:1234-1240` |
| Mapa: rango por defecto | `todo` | — | `15` días, sin opción «todo» | `mod/mapa.js:168,196` |
| Calendario: saldo por cobrar de la instalación | ve | ve | NO | `fabricacion.js:1148-1152,1959` |
| Calendario: total de cada cotización por decidir | ve | ve | NO | `fabricacion.js:660-667` |
| Calendario: filtro «solo los días con cobro» | no | sí | no | `fabricacion.js:841,584-590` |
| Calendario: semáforo de material y WhatsApp | sí | NO | sí | `fabricacion.js:575-581` |
| Calendario: agendar | confirma | NO | propone (`propuesta`) | `fabricacion.js:575-576` |
| Calendario: botones de Google Calendar | sí | no | no | `fabricacion.js:1215,1972` |
| Control (ventas, por cobrar, comisiones, bitácora, por tipo de trabajo) | sí | sí | no tiene la ruta | `control.js:32-33` |
| Control: valor del almacén y bajo mínimo | sí | no | — | `control.js:243-249` |
| Control: enlace de cada renglón a su proyecto | sí | no | — | `control.js:700` |
| Control: importes de «por tipo de trabajo» | `veDinero()` | ve | — | `control.js:545-674` |
| Material: costos | ve | (no tiene Material) | NO | `mod/material.js:457,624,868…` |
| «Qué atender»: reglas A6 sin decidir, A7 sin fecha, A10 se pasó, A12 huella | solo Dirección | no | no | `reglas.js:66-113` |
| A8 falta material, A9 bajo mínimo, A13 constante | Dirección + Fabricación | no | sí | idem |
| A11 instalado con saldo (cobrar) | Dirección + Pagos | sí | no | idem |
| A14 sin respaldo, A15 hoja no cuadra | los 3 | los 3 | los 3 (A15 con restricciones por tipo) | idem |
| Tablero «Faltan datos» (completar teléfono/entrega/dirección/pin) | puede completar todo | solo `tel` (lee el resto) | tel, entrega, dir, pin | `tablero.js:816-822`, `CAMPOS_ROL` |

Lecturas: TODOS los roles leen TODOS los proyectos (no hay scoping por obra ni por cliente) — `Proy.listar({})` sin filtro por rol en Tablero, Calendario, Proyectos, Mapa.

### 6.4 Lo que NO es dinero según el código aunque el plan lo trate como dinero
- `estatus_notion`: la hoja se lo manda a Fabricación (`CAMPOS_DE_DINERO` no lo incluye, comentario `.gs:2147-2148`: «es una etiqueta de estado, no una cifra, y el tablero de obra la usa para saber qué ya se cobró y se puede cerrar») y el código del taller depende de él (`carpetas.js:130-133` → «Faltan datos», marca de órdenes de Drive).
- `iva` y `fecha_ganado` (col. L) también le llegan a Fabricación.
- Lo que SÍ se le quita a Fabricación en la hoja (`CAMPOS_DE_DINERO`, `.gs:2149-2152`): `Precio Subtotal, Precio Neto, Anticipo, Liquidacion, Pago Pendiente, Comisiones, Abono Comision, Comision Restante, Cuenta, Fecha Liquidacion, Porcentaje comision`. Estos son exactamente los candidatos a `ventas_dinero`.

### 6.5 Dinero escondido en otros lugares (no sólo en `ventas_dinero`)
- `proyectos.origen` (1.3).
- `bitacora`: `ganar` anota el precio y el anticipo en `detalle` (`proyectos.js:692-696`); `actualizar` guarda `antes/despues` de `cuenta`, `estatus_notion`, `anti_pactado`, `pct_comision` (`proyectos.js:1076-1085`). Control (Dirección y Pagos) muestra la bitácora; Fabricación la ESCRIBE pero no tiene Control. La bitácora hoy NO viaja (no está en `puente.ALMACENES`, `puente.js:202`): cada teléfono solo tiene la suya.
- Cola `pendientes`: `datos` es el registro completo con dinero y `origen`.
- Cotizador (ruta abierta a los 3 roles, iframe con `localStorage` propio): `al3d_historial` con todos los precios en cualquier teléfono donde se haya cotizado.

---------------------------------------------------------------------------------------------------

## 7. Hoja «Ventas» ↔ proyecto (columna por columna)

Fuentes: `COL` (`.gs:1915-1960`), `HEAD` (`.gs:20-24`), `P` (`puente.js:78-121`), `ventaDeHoja` (`puente.js:629-698`), `aNotion` (`puente.js:311-403`). Filas 2 a 310 (`FIN=310`). El «nombre del puente» incluye espacios finales donde existen: `'Precio Neto '`, `'Cuenta '`.

| Col | Encabezado HEAD | Nombre del puente (`P`) | Tipo | Campo del proyecto (`proyectos`) | Campo en `ventas_hoja` (`ventaDeHoja`) | Dinero (fab no lo recibe) | Escribe hoja (`PUENTE_ROLES`) |
|---|---|---|---|---|---|---|---|
| A | Folio | `id_notion` (clave, no es propiedad) | `V-NNN` | `notion_page_id`, `folio_hoja` (e `id` `proy-hoja-V-NNN` si importado) | `folio_hoja`, `id:'hoja:'+folio` | no | nadie (auto) |
| B | Proyecto | `Proyecto` | texto ≤2000 | `nombre` (alta de plataforma manda `p.nombre` CON «(Tipo)»; el cotizador manda «cliente - proy»); `contacto`/`negocio` solo se derivan al importar | `nombre` | no | direccion |
| C | Estatus | `Estatus` | 4 valores | `estatus_notion` | `estatus` | no (llega a todos) | direccion, pagos |
| D | Cuenta | `Cuenta ` | 5 valores | `cuenta` | `cuenta` | **sí** | direccion, pagos |
| E | Tipo de trabajo | `Tipo de trabajo` | lista (coma-separada en la celda; array en la API) de 7 | `tipo_trabajo` | `tipo_trabajo` | no | direccion (la hoja también la clasifica sola desde el nombre, `.gs:212-229`) |
| F | IVA | `IVA` | `Sí`/`No` (boolean en la API) | `iva` | `iva` | no (llega a todos) | direccion |
| G | Subtotal | `Precio Subtotal` | número | `sub` | `sub` | **sí** | direccion |
| H | Precio neto | `Precio Neto ` | FÓRMULA | `neto` (y `precio_auth` en importados) | `neto` | **sí** | nadie |
| I | Anticipo | `Anticipo` | número ≥0 | `anti_pactado` | `anticipo` | **sí** | direccion, pagos |
| J | Liquidación | `Liquidacion` | número ≥0 | NO EXISTE en el proyecto | `liquidacion` | **sí** | direccion, pagos |
| K | Saldo por cobrar | `Pago Pendiente` | FÓRMULA | `pago_pendiente` | `pago_pendiente` | **sí** | nadie |
| L | Fecha anticipo | `Fecha Anticipo e Instalacion` | fecha | `fecha_ganado` | `fecha_anticipo` | no | direccion |
| M | Fecha instalación | `Fecha instalacion` | fecha | instalación viva `.fecha` | `fecha_instalacion` | no | direccion, fabricacion |
| N | Fecha liquidación | `Fecha Liquidacion` | fecha | NO EXISTE | `fecha_liquidacion` | **sí** | direccion, pagos |
| O | Días de cobro | — | FÓRMULA `N-L` | — | — | — | nadie |
| P | Días de antigüedad | — | FÓRMULA (K>0.004 y estatus≠FABRICACION y L no vacío: `HOY − (M o L)`) | — | — | — | nadie |
| Q | Antigüedad | — | FÓRMULA (rangos 0-30/31-60/61-90/Más de 90) | — | — | — | nadie |
| R | Comisión 10% | `Comisiones` | FÓRMULA `ROUND(G*10%,2)` | (solo en la lista unificada: `comisiones`) | `comisiones` | **sí** | nadie |
| S | Abono comisión | `Abono Comision` | FÓRMULA = SUMIF de la pestaña de abonos | NO EXISTE | `abono_comision` | **sí** | direccion, pagos (escribir = AGREGAR un renglón a «Abonos comisión»: folio, importe, fecha, «Registrado desde la plataforma») |
| T | Comisión pendiente | `Comision Restante` | FÓRMULA `ROUND(R-S,2)` | `comision_restante` | `comision_restante` | **sí** | nadie |
| U | Pagos de comisión | — | FÓRMULA COUNTIF | — | — | — | nadie |
| V, W | Año, Mes | — | FÓRMULA de L | — | — | — | nadie |
| X | Revisar | — | FÓRMULA de alertas («Folio repetido», «IVA no corresponde a la cuenta», «Cobrado de más», «Comisión pagada de más», «Liquidado con saldo», «Falta fecha de liquidación») | — | — | — | nadie |
| Y | (sin HEAD) | `Folio cotizacion` | texto `COT-0042-B@K7QM` | `folio_global` | `folio_cotizacion` | no | direccion (alta); NO se pisa en un cambio |
| Z | | `Etapa de obra` | 8 nombres | `etapa` (vía `ETAPA_A_NOTION`) | `etapa` | no | direccion, fabricacion |
| AA | | `Hora instalacion` | `HH:MM` (texto `@`) | instalación viva `.hora` | (en la fila) | no | direccion, fabricacion |
| AB | | `Ubicacion` | `lat,lng` o link no leído | `lat`,`lng`,(`maps_url`,`geo_fuente`) | `ubicacion` | no | direccion, fabricacion |
| AC | | `Direccion` | texto | `dir_texto` | `direccion` | no | direccion, fabricacion |
| AD | | `Porcentaje comision` | número 0-100; vacío = 10 | `pct_comision` | `pct_comision` | **sí** | direccion, pagos |
| AE | | `Telefono` | texto `@` | `tel` | `telefono` | no | los 3 |
| AF | | `Entrega` | `Instalación`/`Paquetería`/`Recolección en taller` (vacío = Instalación) | `entrega` (null = nadie lo dijo) | `entrega` (`''` = la hoja no dice) | no | direccion, fabricacion |
| AG | | `Notas` | texto ≤40 000 | `notas` | `notas` | no | los 3 |
| AH | | `Plazo taller` | 5 etiquetas | `plazo_k` (1-5) | `plazo_k` | no | direccion, fabricacion |
| AI | | `Sellos` | JSON `{nombre de columna: ms}` (oculta) | `sellos` (`{grupo: ms}`) | `sellos` | no | el puente (no se teclea) |

Notas de mapeo:
- Sentido por campo: DINERO baja siempre de la hoja (`deNotion`, `puente.js:580-613`) y la plataforma solo sube `cuenta`, `estatus`, `pct_comision` (y `sub/anticipo/iva/nombre/fecha` en alta o cuando son el campo que cambió). OBRA (etapa, notas, plazo, teléfono, dirección, ubicación, entrega, cita) viaja en ambos sentidos con sellos: «gana el cambio más reciente» (`obraDeLaFila`, `puente.js:512-568`; `.gs:2881-2929`).
- `ventas_hoja` (almacén espejo, keyPath `id='hoja:'+folio_hoja`, índices `porFecha`→`fecha_anticipo`, `porFolio`→`folio_cotizacion`) tiene TODAS las filas; `NO_RESPALDA`; se borra lo que la hoja ya no trae al cerrar un barrido completo (`sync.js:823-837`).
- Tarjetas que se importan como proyecto: solo filas con `estatus ∈ {FABRICACION, REPARANDO}` sin proyecto atable (`puente.js:1878-1886`). Una fila con `Folio cotizacion` atable al `folio_global` de un proyecto, o al `notion_page_id`/`folios_previos`, recibe el espejo de dinero.
- Atadura fila↔proyecto (orden en `bajar`): (1) `deNotion(...).folio_global` = `folio_global`; (2) por `folio_hoja` ligado a `notion_page_id`/`folios_previos` con `mismaVentaQueLaFila` ∈ {folio, nombre, confirmada} (`proyectos.js:1576-1617`); (3) id `proy-hoja-<folio_hoja>`.
- Nombre en tres formas: `Contacto - Negocio (Etiqueta + …)` (alta de la plataforma), `Contacto - Negocio` (alta desde el cotizador / copiar TSV `mod/proyectos.js:2590-2602`), texto libre (altas a mano). `partirNombreDeHoja` quita el «(…)» final y parte en el primer « - ».
- Cuenta ⇒ IVA: «solo `Elias BBVA` cobra sin factura» (`CUENTA_SIN_FACTURA`, `.gs:935,1043-1054`; réplica en `venta.js:52-63`). La hoja lo reescribe SOLO en edición manual (`alEditar`) y en normalización (`normalizarIvaActivos`, no toca LIQUIDADO); el puente al escribir `Cuenta ` no lo aplica. La plataforma no lo impone.
- La hoja se reacomoda por estatus (`ordenarVentas`, orden `FABRICACION<REPARANDO<COBRANDO<LIQUIDADO`, `.gs:936-944,1549`): el número de fila NO es estable; la identidad es `A` (V-NNN) o `Y`.
- Pestaña «Accesos» (correo, rol) decide el rol de cada persona (`prefs.js:162-179`); la plataforma no la escribe.

---------------------------------------------------------------------------------------------------

## 8. Unificación ventas ↔ proyectos (lo que Control suma)

`Ventas.unificar(proyectos, ventasHoja)` (`ventas.js:137-237`) produce UNA lista:
- Cada proyecto se ata a su fila por `laSuya` (`hoja_doble`) → `folio_global` → `folio_hoja` (solo si la fila no dice ser de OTRA cotización, `filaDeOtraCotizacion`).
- Si está atado, manda el dinero de la HOJA sobre el del proyecto: `fecha_ganado` ← `fecha_anticipo`; `neto/precio_auth` ← `neto` (si >0, y `sub` si >0); `anti_pactado`, `estatus_notion`, `cuenta`, `pago_pendiente`, `comisiones`, `comision_restante`, `pct_comision` (`ventas.js:206-217`). Lo demás (nombre, etapa, tipo, dirección) sigue siendo del proyecto.
- Las filas sin proyecto se agregan con `ventaDesdeHoja` (`de_hoja:true`, `etapa` null si no la trae).
- Un importado (`de_hoja`) cuya fila ya no viene se descarta (solo si hay espejo).
- `indicadores`, `resumenMensual`, `porCobrar`, `conversion`, `csvProyectos` (columnas `COLUMNAS_CSV`, `ventas.js:372-374`), `ventas-por-tipo.js` y el asistente (`asistente-contexto.js`) trabajan sobre esa lista.
=> En Supabase el equivalente es una vista/consulta `ventas ⟕ proyectos` ya resuelta; `ventas_hoja` no «desaparece» sin un reemplazo (plan 3.1 dice «No se migra»): hay que reemplazarlo por una tabla de ventas.

---------------------------------------------------------------------------------------------------

## 9. Contradicciones con el plan (`docs/PLAN-SUPABASE.md`)

1. Plan 4.7/3.1: `ventas_dinero(proyecto_id, …, cuenta, estatus, …)`. Código: `estatus` NO es dinero (llega a Fabricación y lo usa su Tablero: `carpetas.js:130-133`, `.gs:2147-2153`); `iva` y `fecha_anticipo` tampoco. `ventas_dinero` debería llevar solo lo de `CAMPOS_DE_DINERO` y `estatus`/`iva`/`fecha_anticipo` quedar en una tabla visible a los 3 roles.
2. Plan 3.1 («Hoja «Ventas» → `proyectos` + `ventas_dinero`», `ventas_hoja` «No se migra»): hay ~300 ventas en la hoja y solo las vivas son proyecto (`puente.js:1878-1886`); Control y `Ventas.unificar` necesitan las demás. `ventas_dinero.proyecto_id` NO puede ser obligatorio. El plan 4.5 habla de `ventas` y `ventas_dinero` pero 4.7 no define `ventas`.
3. Plan 4.3: «Fabricación ni siquiera recibe la fila de `ventas_dinero`». Cierto para esa tabla, pero el dinero también está en `proyectos.origen` (precioAuth, neto, sub, anti, itemsAuth, `_lt`, `pu`) que Fabricación sí necesita para la orden de trabajo y el material, y en `bitacora`. No basta con RLS sobre `ventas_dinero`.
4. Plan 1 y 4.2: «Pagos pasan a capturar solo en la plataforma». La plataforma NO tiene dónde capturar `Liquidacion`, `Fecha Liquidacion`, `Abono Comision`, el anticipo (Pagos no tiene `anti_pactado` en `CAMPOS_ROL`), ni corregir `sub`/`nombre` (`BLOQUEADOS`): hoy todo eso se captura directo en la hoja (`PUENTE_ROLES.pagos`, `.gs:2134`; edición manual de celdas). Además `saldoDe` (cliente) da 0 con `LIQUIDADO` aunque la hoja siga mostrando saldo hasta que alguien teclee la liquidación.
5. Plan 4.2 («Pagos: … No mueve la etapa» / «Fabricación: etapa hasta Listo»): correcto pero incompleto. Fabricación también escribe `notas`, `plazo_k`, `entrecalles`, agenda (propone); Pagos escribe `notas`, `pct_comision`. `puedeMover` solo valida el destino (Fabricación puede regresar un `instalado`).
6. Plan 4.7 `clientes(id, empresa_id, nombre, teléfono, dirección)` y `proyectos(…, cliente_id, folio, …)`: no hay entidad cliente en el código; hay que inventar la deduplicación (la de `cuadernos()` usa los últimos 10 dígitos del teléfono y luego el nombre). Y no hay UN `folio`: son `folio_local`, `folio_global`, `folio_hoja`/`notion_page_id`.
7. Plan 4.9: «Los eventos guardan `gcal_event_id` en `instalaciones`». Falso hoy: `gcal_event_id` siempre es `null` y nadie lo escribe (`agenda.js:292`, `puente.js:784`, `fabricacion.js:1529-1535`).
8. Plan 4.4: «Realtime en lugar del sondeo cada 30 s (`app.js:1837`)». Confirmado, pero esa misma vuelta también corre Drive (`Carpetas.alDia`) y `resolverLinksPendientes` (expansión de links de Maps por la hoja) cada 30 s (`app.js:2085-2111`); esos dos necesitan su propio disparador al retirar el sondeo.
9. Plan 3.1 («`pendientes` No se migra; se reconstruye; se drena antes del corte») y 4.4 («Se conserva la bandeja y el reintento»): la bandeja guarda el registro completo; el «reintento exponencial» del comentario de `sync.js` NO existe (`esperaMs` sin uso).
10. Plan 3.1 («`bitacora` → `bitacora`, historial completo»): la bitácora hoy es local a cada teléfono (no viaja); el historial completo no existe en ningún sitio. Y contiene importes en texto (ver 6.5) mientras que su lectura (Control) es de Dirección y Pagos.
11. Plan 3.2: solo menciona `/empujar` como ruta de la plataforma, pero el COTIZADOR también la llama directo con su propio token (`al3d_pf_puente`, `venta.js:299-336,414`) para «Registrar venta»: es un segundo cliente del puente (script clásico dentro de un iframe, sin módulos ES), y solo funciona si el aparato tiene token (`puenteCfg` exige `c.token`, `venta.js:299-307`).
12. Plan 4.2 («Cambiar el rol en Ajustes no da permisos; ya era así»): sin pase, `Prefs.rol()` devuelve `'direccion'` (`prefs.js:177-178`); la pantalla se comporta como Dirección. Con RLS la UI debe tomar el rol de `miembros`.
13. Plan 3.1 («`proyectos` quita `empresa_id` de la copia local»): `instalaciones` también lo lleva (`agenda.js:280`).
14. Plan 4.5 (espejo): la hoja tiene tope de 309 ventas (`FIN=310`) y se reordena sola por estatus; el espejo debe indexar por `A` (V-NNN) o `Y`, no por número de fila, y no puede crecer sin tocar todas las fórmulas.

---------------------------------------------------------------------------------------------------

## 10. Hallazgos críticos (para el diseño)

1. `origen` contiene todo el dinero y lo necesita Fabricación: partir en `origen` (sin precios) y `origen_dinero`, o publicar vista con las claves filtradas (`historial.js:119-146`, `proyectos.js:344-352`, `mod/proyectos.js:2640`).
2. `estatus_notion` debe ser visible a los 3 roles (`carpetas.js:130`, `.gs:2147`).
3. `ventas` (libro) ≠ `proyectos`: ~300 filas sin proyecto que Control suma (`ventas.js:137-237`); `ventas_dinero.proyecto_id` nullable o tabla `ventas` separada.
4. Pagos necesita pantallas/RPC nuevas: liquidación, fecha de liquidación, abonos de comisión (renglones append-only con folio, importe, fecha, nota), corrección de anticipo/subtotal (`proyectos.js:963-995`, `.gs:2134`, `.gs:2968-2979,3076-3088`).
5. Ids de texto y `uid_ics` derivado del id: no convertir a uuid sin guardar el id y el uid (`db.js:368-375`, `agenda.js:291`, `proyectos.js:457`).
6. `folio_global` no es único por construcción: añadir `UNIQUE(empresa_id, folio_global) WHERE folio_global <> ''` y definir qué pasa con colisiones de teléfonos distintos (`proyectos.js:643-654`, `historial.js:2578-2592`).
7. `entrega` nullable con significado (null = «falta»; ausente se pinta como instalación) (`datos-de-entrega.js:62-72`, `entrega.js:68-70`).
8. Las reglas de etapa son cliente-lado y permisivas; la RPC `mover_etapa` debe replicar: rol por destino, `cruzaCorte` incluso desde `garantia/cancelado`, idempotencia de salidas `mov-salida:<req.id>`, bitácora, sello `etapa`, y el acoplamiento con instalación `hecha` (`proyectos.js:1121-1273`, `agenda.js:442-452`).
9. `ganar` no valida rol y `drenarBuzon` lo ejecuta en cualquier teléfono; definir quién puede crear proyecto en la RPC (`proyectos.js:667`, `cotizador.js:202`).
10. Salidas derivadas de material (`emitirSalidasDerivadas`) se disparan desde pantalla al evaluar reglas (`reglas.js`), no hay servidor que lo haga (`proyectos.js:1297-1325`).
11. Sellos por dato: 7 grupos (etapa, notas, plazo_k, tel, dir_texto, ubicacion, entrega) más el sello implícito de la instalación; `actualizado_en` es reloj del teléfono en ms (`proyectos.js:529-540`, `puente.js:447-568`).
12. Tipo de `geo_fuente` libre; `tipo_trabajo` array de 7 literales exactos (con «Custome» y sin acentos): CHECK con esa lista (`proyectos.js:132-140`).
13. El sondeo hace además Drive y expansión de links de Maps; esas dos funciones viven en el Apps Script y quedan (`app.js:2085-2111`).
14. Reglas de negocio de dinero a replicar en SQL: neto, saldo, comisión 10 % de `G`, abonos por SUMIF, cuenta→IVA (`.gs:170-205,1043-1054`, `venta.js:52-63`).
15. Hoja con tope de 309 ventas: el espejo debe resolver el crecimiento (`.gs:9`).

---------------------------------------------------------------------------------------------------

## 11. NO CONFIRMADO / preguntas abiertas

- Conteos reales (proyectos, instalaciones, ventas) por teléfono: no accesibles desde el repo. Los comentarios citan 214 filas con etapa vacía, 309 filas en la respuesta de `/jalar` y 16 en FABRICACION (`proyectos.js:357-381`, `sync.js:870-873`) — NO CONFIRMADO su vigencia.
- Significado de negocio exacto de `REPARANDO`: el código solo lo trata como «trabajo del taller» junto a `FABRICACION` (`puente.js:160-166`).
- Cuántos proyectos locales traen `entrega` ausente (previos a #97) y cuántos `geo_fuente` con los valores largos de `parseGmaps`: NO CONFIRMADO.
- No leí la ruta `/jalar` del .gs ni `aplanarFila` (otro mapa): solo sé por `puente.js` que manda `id_notion` y las claves de `P`, con `Sellos` objeto y que a fabricación le filtra `CAMPOS_DE_DINERO`.
- El resto de `puente.js` (almacén) y `.gs` (autorizaciones, IA, verificar) fuera de mi alcance.
- Qué teléfono tiene el único ejemplar de ciertas cotizaciones/proyectos (plan 10): no se puede saber desde aquí.
- Decisión pendiente: ¿`entrega`/`dir_texto`/`tel` siguen en `proyectos` o pasan a `clientes`? El código los trata como del proyecto (pueden diferir entre obras del mismo cliente).

## 12. Pruebas que ya definen el contrato (para clasificar en el plan 4.11)

`pruebas/proyectos.mjs`, `pruebas/ventas.mjs`, `pruebas/taller.mjs`, `pruebas/entrega.mjs`, `pruebas/datos-de-entrega.mjs`, `pruebas/ics.mjs`, `pruebas/reglas.mjs`, `pruebas/cuadernos.mjs`, `pruebas/letra-del-folio.mjs`, `pruebas/comisiones.mjs`, `pruebas/puente.mjs` (compara listas del .gs y del cliente: estatus, cuentas, entregas, plazos, `telefonoLimpio`), `pruebas/puente-hoja.mjs`, `pruebas/sincronizacion.mjs`, `pruebas/replicas.mjs`, `pruebas/pf-proyectos-garantia.mjs`.
