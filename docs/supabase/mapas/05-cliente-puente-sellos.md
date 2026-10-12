# MAPA 05 — Cliente del puente (js/datos/puente.js) y regla de sellos

Repo: `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase`. Rutas relativas a esa raíz.
Convención de citas: `archivo:línea`. «NO CONFIRMADO» = no pude verificarlo leyendo el código.
Leído completo: `js/datos/puente.js` (2190 líneas), `js/datos/sync.js` (1071), tramos de `proyectos.js`, `db.js`, `prefs.js`, `app.js`, `puerta.js`, `agenda.js`, `cotizador/venta.js`, `cotizador/notario.js`, y del lado servidor `puente/hoja-apps-script.gs` (rutas jalar/empujar/salud, sellos, almacén). Pruebas leídas: `pruebas/sincronizacion.mjs` (la que fija la regla de sellos), `pruebas/puente.mjs` (1-540), parte de `pruebas/puente-hoja.mjs` (índice).

---------------------------------------------------------------------------------------------------

## 0. Lo esencial en 12 líneas

1. `puente.js` es el único módulo de `js/datos` que habla con el Apps Script, pero NO es el único que habla con él: `js/cotizador/venta.js:293-414` (registrar venta, escribe a `/empujar` directo con el token de dispositivo y sin `sellos`), `js/cotizador/notario.js:59-85` (autorizar/solicitar, fallback suelto) y `verificar.html:413` tienen su propio `fetch` al mismo Apps Script. Ver §8.
2. `crear(cfg)` (puente.js:1086) devuelve un objeto «AdaptadorSync» (`nombre:'hoja'`). `sync.js` lo enchufa con `registrar()` y solo le llama: `lleva, agrupa, revive, motivo, espejos, salud, esquema, expandir, carpetas, crearCarpeta, subir, bajar, despuesDeBajar`.
3. Empujar = una petición `POST {ruta:'empujar', ops:[…]}` POR OPERACIÓN (proyectos/instalaciones) o por lote de hasta 25 (almacén). Jalar = `POST {ruta:'jalar'}` que devuelve la hoja ENTERA en una página (309 filas máx).
4. La regla «gana el cambio más reciente, dato por dato» está PARTIDA EN TRES SITIOS: (a) `sellar()`/`SELLO_DE_CAMPO` en proyectos.js:529-540 + `sellosDeLaOperacion` puente.js:473 producen y envían los sellos; (b) el `.gs` decide al SUBIR (hoja-apps-script.gs:2881-2917); (c) `obraDeLaFila` puente.js:512 decide al BAJAR. El plan solo nombra (c). Portar solo (c) deja sin compuerta la escritura.
5. Empate: al bajar, `hs > ls` estricto → gana lo local. Al subir, `llega < tiene` rechaza → en empate ESCRIBE lo que llega. Asimetría real.
6. Un sello es ms epoch del reloj del teléfono, por «grupo» de dato: `etapa, notas, plazo_k, tel, dir_texto, ubicacion, entrega` en `proyecto.sellos`; `instalacion` (la cita) vive en la propia instalación (`actualizado_en` / `sello_hoja`).
7. Versionado: `VERSION_ESPERADA = 'puente-sheets-14'` (puente.js:881), `PUENTE_VERSION` en el .gs:1881. El cliente TOLERA versiones menores (apaga funciones por umbral 9/11/12/14) y solo avisa; una prueba exige que el .gs del repo diga exactamente la esperada (pruebas/puente.mjs:341).
8. No hay backoff: `sync.esperaMs` existe (sync.js:714) y nadie la usa. Reintento = disparadores: 1.5 s tras encolar, cada 30 s si la app está visible, al volver a la pestaña, al evento `online`, al arrancar.
9. No hay mecanismo de «acceso revocado» que borre datos locales (grep `acceso_revocado` = 0 resultados). Hoy: `puerta.js` borra el «pase» y pide entrar de nuevo; IndexedDB no se toca.
10. `CONFLICTO`/`esperado` están muertos con la hoja: `esperado` nunca viaja y el .gs nunca contesta `CONFLICTO`.
11. El cliente NUNCA envía `Liquidacion`, `Abono Comision` ni `Fecha Liquidacion` (puente.js:284-286). Hoy solo se capturan en la hoja (menús del .gs). Si la hoja pasa a espejo de solo lectura, esos tres campos no tienen captura en la plataforma.
12. El `proyecto` local mezcla obra y dinero (`sub, neto, anti_pactado, iva, pct_comision, pago_pendiente, comision_restante, estatus_notion, cuenta`) y hay además un almacén local `ventas_hoja` con el renglón completo de CADA fila de la hoja (db.js:82). Con `ventas_dinero` separada por RLS, esa mezcla se resuelve en el transporte.

---------------------------------------------------------------------------------------------------

## 1. Exportaciones de puente.js (contrato)

PURA = sin red, sin DB, sin reloj (salvo `Date.now()` donde se dice).

### 1.1 Constantes de vocabulario

| Export | Línea | Valor / contenido |
|---|---|---|
| `P` | 78-121 | Nombres de propiedad (= encabezados de columna de la hoja), tal cual, con espacios finales donde los hay (abajo §3.1) |
| `PLAZO_A_HOJA` | 126 | `['1 semana','1.5 semanas','2 semanas','2.5 semanas','3 semanas o más']` (de `PLAZOS` en taller.js:55-61) |
| `ENTREGA_A_HOJA` | 147 | `{instalacion:'Instalación', paqueteria:'Paquetería', recoleccion:'Recolección en taller'}` (entrega.js:24-32) |
| `ESTATUS` | 155 | `['FABRICACION','REPARANDO','COBRANDO','LIQUIDADO']` (orden de la hoja) |
| `CUENTAS` | 157 | `['Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT']` |
| `ESTATUS_DE_PAGOS` | 159 | `['COBRANDO','LIQUIDADO']` |
| `VIVAS_EN_TALLER` | 166 | `['FABRICACION','REPARANDO']` (qué fila de la hoja se importa como tarjeta) |
| (privada) `EN_LA_LINEA` | 169 | `['ganado','en_diseno','cortado','armado','listo']` |
| `ETAPA_A_NOTION` | 188-197 | `ganado:'Ganado', en_diseno:'En diseño', cortado:'Cortado', armado:'Armado', listo:'Listo para instalar', instalado:'Instalado', garantia:'En garantía', cancelado:'No se dio'` |
| `ETAPA_DESDE_NOTION` | 198 | inverso |
| `ALMACENES` | 202 | `['proyectos','instalaciones','movimientos','materiales','requerimientos']` (lo que el relevo lleva; `sync` aparta el resto) |
| `DEL_ALMACEN` | 208 | `['movimientos','materiales','requerimientos']` (van en lote, por /empujar_almacen) |
| `VERSION_DEL_ALMACEN/TELEFONO/DE_LA_ENTREGA/DE_LA_OBRA` | 211/216/221/226 | 9 / 11 / 12 / 14 |
| `ESPEJOS` | 230 | `['ventas_hoja']` (almacén que se baja ENTERO; `sync.jalar` borra lo que la hoja ya no trajo al cerrar el barrido: sync.js:823-837) |
| `VERSION_ESPERADA` | 881 | `'puente-sheets-14'` |

NO_LLEVA (puente.js:236-240): `avisos`, `constantes`, `geo` no viajan. Otros almacenes locales que NO viajan por este relevo (porque no están en `ALMACENES`): `pendientes`, `blobs`, `bitacora`, `ventas_hoja` (ese solo baja).

### 1.2 Funciones puras

| Función | Línea | Entra | Sale | Notas |
|---|---|---|---|---|
| `plazoAHoja(k)` | 128 | cubo 1-5 | etiqueta o `''` | |
| `plazoDesdeHoja(v)` | 134 | celda AH (texto libre) | cubo 1-5 o `null` | `n>=3`→5; `[1,1.5,2,2.5]`→1..4; admite `½` y coma. Copia de `plazoDeCelda` (.gs:2001) |
| `numeroDeVersion(v)` | 260 | `'puente-sheets-9'` | `9` o `0` | |
| `motivoSinDestino(almacen)` | 250 | nombre de almacén | frase | texto para «apartado» |
| `aNotion(p, inst, opts)` | 311-403 | proyecto, su instalación viva, `{alta?, campos?}` | `{[nombre de propiedad]: valor}` | Qué viaja y cuándo: §3.1. `opts` ausente = alta |
| `instalacionANotion(inst, viva)` | 417-429 | instalación (+ la viva si se sabe) | `{'Fecha instalacion','Hora instalacion'}` o `{}` | Cancelada y sin otra viva → ambas en `''`; con otra viva → la de la viva |
| `selloDeInstalacion(i)` | 457-462 | instalación | ms | `sello_hoja` si `sello_hoja>0 && sello_hoja_en===actualizado_en`; si no, `actualizado_en` |
| `sellosDeLaOperacion(op, props, inst)` | 473-493 | operación de la bandeja, props a enviar, instalación | `{[nombre de columna]: ms}` | §4.4 |
| `obraDeLaFila(venta, local, {ocupados})` | 512-568 | renglón `ventaDeHoja` con `sellos`, proyecto local, Set de grupos ocupados (o `'*'`) | `{parche, sellos}` o `null` | §4.2 — LA regla que se porta |
| `deNotion(fila)` | 580-613 | fila cruda `/jalar` | parche de espejo del dinero o `null` (sin `Folio cotizacion`) | §3.2 |
| `ventaDeHoja(fila)` | 629-698 | fila cruda `/jalar` | renglón de `ventas_hoja` o `null` | §3.3 |
| `instalacionDeHoja(fila, proyecto, insts, {hoy, ahora, nuevoId, empresa})` | 731-788 | fila, proyecto, sus instalaciones | instalación a escribir o `null` | Sin sellos (hoja <14). MANDA LA HOJA |
| `citaDeHoja(fila, proyecto, insts, o)` | 799-824 | idem | instalación con `sello_hoja` o `null` | Con sellos; §4.5 |
| `motivoPerdida(res)` | 839-847 | respuesta de un rechazo | `'borrada'|'de_otra'|''` | lee `res.motivo` o la frase («ya es de otra venta», «ya no está en la hoja») |
| `mensajePerdida(mensaje, proy)` | 858-869 | | frase | |
| `versionVieja(v)` / `avisoVersion(v)` | 882 / 904 | versión | bool / texto | `FALLA_CON` (891-903) son frases por versión 3..13 |
| `normalizarUrl(u)` | 1073 | URL pegada | URL sin query, sin `/salud|/esquema|/jalar|/empujar|/expandir` final, sin barra final | |
| `esRechazoDeTelefono/Entrega/Obra(op)` | 2106/2112/2118 | op apartada | bool | para `revive` |
| `instrucciones()` | 2151 | | `{titulo, minutos, pasos[], notas[]}` | texto de Ajustes para montar el Apps Script |

### 1.3 Funciones con efectos

| Función | Línea | Contrato |
|---|---|---|
| `hablar(ruta, cuerpo={}, espera=15000)` | 1061 | Pregunta suelta al Apps Script con las dos puertas. Usa `Prefs.puente()` (url+token). Lanza `DATO_INVALIDO` si no hay URL. Devuelve el cuerpo tal cual (`{ok:false,…}` incluido). Lanza solo por red (`SIN_RED`, `DESCONOCIDO`) o `ROL_SIN_PERMISO`. La usan `js/mod/cotizador.js:362` (→ `window.AL3D.hablar`, que usa notario.js) y `js/nucleo/asistente.js:55,785` (rutas `salud`, `ia`). NO pasa por la bandeja |
| `crear(cfg)` | 1086 | `cfg={url,token}`. Devuelve `null` si no hay URL (basta la URL; el token ya no es obligatorio, 1088-1101). No toca la red al construirse |
| `desdePrefs()` | 2184 | `crear(Prefs.puente())` si hay `url`, si no `null` |

(Privadas relevantes: `pedir` 963, `tokenDeGoogle` 943, `espejarLocal` 2075, `anotarSinMandar` 2089, `porFolioGlobal` 2133, `rango` 2128.)

### 1.4 Métodos del adaptador (objeto devuelto por `crear`)

| Método | Línea | Entra | Sale / efectos |
|---|---|---|---|
| `nombre` | 1355 | — | `'hoja'` |
| `lleva(almacen)` | 1359 | nombre | `false` si no está en `ALMACENES`; para los de `DEL_ALMACEN` solo si no se sabe que la hoja carece de pestañas (`sabeAlmacen() !== false`; el «no» caduca a los 10 min, 1134-1138) |
| `agrupa(almacen)` | 1364 | | `true` para `DEL_ALMACEN` → `sync` manda hasta `MAX_LOTE=25` seguidas (sync.js:140,666-670) |
| `revive(op)` | 1373 | op `rechazada` | `false`, o el nombre de la marca (`'revivida_tel'|'revivida_entrega'|'revivida_obra'`) para que `sync` la devuelva a `pendiente` UNA vez (sync.js:516-531). Si no se conoce la versión, pregunta `/salud` una vez |
| `motivo` | 1383 | | = `motivoSinDestino` |
| `espejos` | 1385 | | copia de `ESPEJOS` |
| `salud()` | 1387 | — | `{ok:true, mensaje, rol, version, escribibles[], via:'google'|'token', correo}` o `{ok:false, codigo, mensaje}`. Efecto: guarda `escribibles` (Set) y `versionHoja` (`notarVersion`) |
| `esquema()` | 1412 | — | `{ok, faltan[], accesos, nota, mensaje}`; añade «Accesos» a `faltan` si `accesos===false` |
| `expandir(u)` | 1436 | URL corta de Maps | `{ok:true,url}` o `{ok:false,codigo,mensaje}` |
| `carpetas()` | 1451 | — | `{ok:true, raiz, carpetas[]}` o `{ok:false, codigo(HOJA_VIEJA|…), mensaje}` |
| `crearCarpeta(nombre)` | 1467 | | `{ok:true, creada, carpeta}` o `{ok:false,…}` |
| `subir(ops)` | 1485-1703 | array de operaciones de la bandeja (`sync` manda 1, o un lote del almacén) | array de resultados `{id, ok, codigo?, mensaje?, definitivo?, motivo?, conflicto?, remoto?, rechazadas?, omitida?, ya_estaba?}` (§5) |
| `bajar(cursor)` | 1710-2030 | cursor opaco o `null` | `{registros:[{almacen, datos}], cursor, hay_mas}` (§5.3) |
| `despuesDeBajar(info)` | 2046 | `{completa, vistos:{ventas_hoja:[ids]}, rechazadas:[ops]}` | guarda la marca del almacén, llama `proyectos.revisarContraLaHoja({folios, completa, rebotes})`, devuelve `r.valor` (`{juntadas,repetidas,perdidas,reenviadas,telefonos,entregas,obras,cambios}`) |

Interfaz que `sync.js` exige (JSDoc sync.js:100-123): `{nombre, salud, subir, bajar, esquema, despuesDeBajar?, lleva?, motivo?, revive?, agrupa?, espejos?, expandir?, carpetas?, crearCarpeta?}`. `registrar(adaptador)` solo exige `subir` (sync.js:175).

---------------------------------------------------------------------------------------------------

## 2. Formas de dato que cruzan (para que los implementadores no tengan que abrir db.js)

### 2.1 Operación de la bandeja (almacén local `pendientes`, db.js:72, sync.js:306-324)

```
{ id:'op-<ts36>-<rand>', tipo:'crear'|'actualizar'|'apendice',
  almacen, entidad(=almacen), registro_id, entidad_id(=registro_id),
  datos:<FOTO COMPLETA del registro al encolar>,
  campos: string[]|null,      // null = «no sé qué cambió» (alta, o versión vieja)
  esperado:null,              // NUNCA se manda al puente
  ts:<ms>, disp:<4 letras del aparato>, intentos:n, ultimo_error:'',
  estado:'pendiente'|'conflicto'|'sin_destino'|'rechazada', conflicto:null, sync:0,
  [codigo_rechazo, motivo_rechazo, revivida_tel|revivida_entrega|revivida_obra] }
```
Marcas en la misma tabla con id que empieza por `_`: `_marcas` (sync.js:155) = `{ultimo_envio, ultima_bajada, cursor, vistos{disp:ts}, barrido{desde,vistos{almacen:[ids]},parcial}, ultima_bajada_completa, ts:0}` y `_almacen_hoja` (puente.js:1245) = `{desde, completo_en, barriendo, ts:0}`.

`campos` de proyectos: `proyectos.actualizar` pone los campos tocados sin `sync` (proyectos.js:1074-1075); `avanzarEtapa` `['etapa']` (1258); `descartar` `['etapa']` o `['etapa','notas']` (787); altas (`ganar`, `descartar` lápida) `campos:null` (proyectos.js:691, 770). Instalaciones: `campos` ausente → `null` (agenda.js:56-58).

### 2.2 Proyecto local (campos que tocan el puente)

`id`, `empresa_id`, `folio_local`, `dispositivo`, `folio_global` (`COT-0042@K7QM`, vacío en importados), `folio_hoja`, `de_hoja`, `nombre, contacto, negocio, tel, etapa, tipo_trabajo[], fecha_ganado, dir_texto, maps_url, lat, lng, geo_fuente, entrega, notas, plazo_k, sellos{}`; dinero: `sub, neto, precio_auth, anti_pactado, iva, pct_comision, pago_pendiente, comision_restante, estatus_notion, cuenta`; atadura: `notion_page_id` (NO es de Notion: guarda el FOLIO INTERNO de la hoja `V-042`), `notion_estado:'pendiente'|'enviado'|'fallido'`; marcas locales que no viajan: `hoja_perdida, fuera_de_hoja, sin_mandar, hoja_doble, duplicado_de, hoja_confirmada, folios_previos, distinta_de, tel_a_la_hoja, entrega_a_la_hoja, obra_a_la_hoja`; `creado_en, actualizado_en, sync`.
`actualizado_en` lo RE-SELLA `DB.poner` con `Date.now()` en cada escritura (db.js:230). No es reloj lógico.

### 2.3 Instalación local (agenda.js:278-295)

`{id, empresa_id, proyecto_id, fecha(ISO), hora('HH:MM'|null), ventana('dia'...), duracion_min, estado('propuesta'|'confirmada'|'reagendada'|'hecha'|'cancelada'), movida(int, = SEQUENCE del .ics), uid_ics('inst-<id>@al3d.mx'), gcal_event_id, notas, creado_en, actualizado_en, sync, [sello_hoja, sello_hoja_en]}`.

---------------------------------------------------------------------------------------------------

## 3. Mapeo exacto campo local ↔ columna de la hoja

Hoja «Ventas». Letras y números de `COL` (hoja-apps-script.gs:1915-1960). La columna A (folio interno `V-001`, id estable de fila) NO está en `COL`: es `COL_FOLIO=1` (.gs:1962); viaja como `id_notion` en `/jalar` y como `id_notion` en `/empujar`. `FIN=310` (.gs:9): filas 2..310. `ULTIMA_COL=35`.

### 3.1 SUBE: proyecto → propiedades (`aNotion`, puente.js:311-403)

`alta` = `!idNotion` (el proyecto vivo no tiene `notion_page_id`). `va(c)` = alta || `campos∋c`. `vaPropio(...cs)` = alta || `campos===null` || algún `c∈campos`. `campos` es el de la operación.

| Campo local | Propiedad (copiar EXACTO) | Col | Cuándo viaja | Valor enviado | Server escribe (rol) | Validación del .gs (armarCeldas .gs:2955-3067) |
|---|---|---|---|---|---|---|
| `nombre` | `Proyecto` | B(2) | `va('nombre')` | `String` | direccion | texto, `slice(0,2000)`, antepone `'` si empieza con `=+-@` |
| `sub` | `Precio Subtotal` | G(7) | `va('sub')` | número | direccion | `Number` finito (puede ser negativo) |
| `iva` | `IVA` | F(6) | `va('iva')` | `p.iva !== false` | direccion | escribe `'Sí'`/`'No'`. OJO: el .gs lo recalcula por cuenta (§8.4) |
| `anti_pactado` | `Anticipo` | I(9) | `va('anti_pactado')` | número | direccion, pagos | `>=0` |
| `pct_comision` | `Porcentaje comision` | AD(30) | `va('pct_comision') && >0` (0 no se manda) | número en puntos (10 = 10 %) | direccion, pagos | 0..100; `null`/`''` borra |
| `folio_global` | `Folio cotizacion` | Y(25) | si `folio_global` no vacío, SIEMPRE (alta o cambio) | `COT-0042@AAAA`. Además viaja APARTE en la op como `folio_cotizacion` | direccion | en un cambio NO se pisa si la fila ya trae otro (rechazo con razón) (.gs:2841-2863) |
| `etapa` | `Etapa de obra` | Z(26) | `vaPropio('etapa')` y etapa válida | etiqueta de `ETAPA_A_NOTION` | direccion, fabricacion | debe estar en `ETAPAS_OBRA` |
| `estatus_notion` | `Estatus` | C(3) | `va('estatus_notion')` y ∈ `ESTATUS` | texto | direccion, pagos | debe estar en `ESTATUS` |
| `cuenta` | `Cuenta ` (espacio final) | D(4) | `va('cuenta')` y ∈ `CUENTAS` | texto | direccion, pagos | debe estar en `CUENTAS` |
| `dir_texto` | `Direccion` | AC(29) | `vaPropio('dir_texto')` | `String` (puede ser `''`) | direccion, fabricacion | texto libre 2000 |
| `lat`,`lng` | `Ubicacion` | AB(28) | `vaPropio('lat','lng')` | `'lat,lng'` (JS toString) o `''` si falta/0,0/fuera de rango | direccion, fabricacion | texto libre |
| `tipo_trabajo` | `Tipo de trabajo` | E(5) | `vaPropio('tipo_trabajo')` | array de strings | direccion | cada uno ∈ `TIPOS_TRABAJO` (7); escribe `arr.join(', ')` |
| `tel` (o `origen.tel`) | `Telefono` | AE(31) | `alta || campos===null || 'tel'∈campos`; solo si hay número, o si `'tel'∈campos` (vacío = borrado explícito) | `telefonoDe(p)` | direccion, fabricacion, pagos | `telefonoLimpio` (dígitos, espacios, `+()-`, máx 30); texto `'@'` |
| `entrega` | `Entrega` | AF(32) | `alta || 'entrega'∈campos`; en alta solo si ≠ instalación; en cambio siempre | `ENTREGA_A_HOJA[ent]` | direccion, fabricacion | ∈ `ENTREGAS` (acepta sin acento); vacía = Instalación |
| `notas` | `Notas` | AG(33) | `(alta && notas.trim()) || 'notas'∈campos` | `String` (puede ser `''`) | direccion, fabricacion, pagos | `slice(0,40000)`, texto `'@'` sin apóstrofo |
| `plazo_k` | `Plazo taller` | AH(34) | `(alta && plazo≠vacío) || 'plazo_k'∈campos` | `plazoAHoja(k)` o `''` | direccion, fabricacion | ∈ 5 etiquetas (`plazoDeCelda`); `''` borra |
| `fecha_ganado` | `Fecha Anticipo e Instalacion` | L(12) | `va('fecha_ganado') && ISO` | `YYYY-MM-DD` | direccion | ISO estricta → Date |
| `inst.fecha` | `Fecha instalacion` | M(13) | si la instalación viva (`instalacionDe`) tiene fecha ISO (en cualquier op de proyecto) | `YYYY-MM-DD` | direccion, fabricacion | ISO; `''` borra |
| `inst.hora` | `Hora instalacion` | AA(27) | junto a la fecha | `texto(hora)` (`''` si null) | direccion, fabricacion | `HH:MM`/`H:MM`/`HH:MM:SS` o `''`; guarda en texto `'@'` |

Sin columna correspondiente (NUNCA se envían, puente.js:282-286): `Precio Neto ` H(8) fórmula, `Pago Pendiente` K(11) fórmula, `Comisiones` R(18) fórmula, `Comision Restante` T(20) fórmula, `Liquidacion` J(10), `Abono Comision` S(19), `Fecha Liquidacion` N(14). Las fórmulas las rechaza el .gs (`PUENTE_FORMULAS` .gs:2103-2109). `Liquidacion`/`Abono Comision`/`Fecha Liquidacion` solo los captura quien cobra EN LA HOJA (el .gs sí los acepta de pagos/direccion: `PUENTE_ROLES`, `armarCeldas`; `Abono Comision` AGREGA un renglón a «Abonos comisión», .gs:2964-2979, 3076-3088).

Instalación sola (`instalacionANotion` puente.js:417): `{'Fecha instalacion','Hora instalacion'}`; `viva` ≠ undefined: si hay viva, manda la viva; si no hay viva y la op es una cancelada → ambas `''`. El resto de la instalación (`ventana, duracion_min, estado, movida, uid_ics, gcal_event_id, notas`) NO viaja: solo `fecha` y `hora` (§3.4).

### 3.2 BAJA al proyecto existente (`deNotion` puente.js:580-613 y `bajar` 1857-2017)

Atadura (cómo se encuentra el proyecto local de una fila): (1) `fila['Folio cotizacion']` → `porFolioGlobal` (índice `porFolio` = `folio_global`, db.js:62); (2) si no, `propioPorFila` por `notion_page_id`/`folios_previos` = folio de la hoja `V-xxx`, aceptado solo si `ataLaFila` (proyectos.js:1611: folio de cotización coincide, o se llama igual, o `hoja_confirmada`); (3) si no, el importado previo `id = 'proy-hoja-'+folio_hoja`; (4) si no hay y el estatus ∈ `VIVAS_EN_TALLER` → se IMPORTA como tarjeta nueva (`desdeVentaDeHoja`, proyectos.js:440). Las filas COBRANDO/LIQUIDADO sin proyecto solo van a `ventas_hoja`.

| Columna (clave de `/jalar`) | Campo del proyecto | Regla |
|---|---|---|
| `id_notion` (A) | `notion_page_id` (y `notion_estado:'enviado'`) | siempre (`deNotion`). Para el camino «por fila»: `folio_hoja` + `hoja_confirmada` |
| `Estatus` (C) | `estatus_notion` | solo si ∈ `ESTATUS` |
| `Cuenta ` (D) | `cuenta` | solo si ∈ `CUENTAS` |
| `Anticipo` (I) | `anti_pactado` | número; celda vaciada (`null`/`''` con la llave presente) → `0`; llave ausente (fabricación) → no toca |
| `Porcentaje comision` (AD) | `pct_comision` | ídem (vacía → `0`) |
| `Pago Pendiente` (K) | `pago_pendiente` | número con signo de la hoja (positivo = te deben); vaciada → `null` |
| `Comision Restante` (T) | `comision_restante` | ídem |
| (solo tarjeta importada, sin `deNotion`) `Precio Subtotal` G / `Precio Neto ` H | `sub`, `neto`, `precio_auth` (=neto) | `aCero(null)=0`; 1927-1935 |
| `Etapa de obra` Z, `Notas` AG, `Plazo taller` AH, `Telefono` AE, `Direccion` AC, `Ubicacion` AB, `Entrega` AF | `etapa, notas, plazo_k, tel, dir_texto, lat/lng/geo_fuente/maps_url, entrega` | por `obraDeLaFila` (§4.2), SOLO si la fila trae `Sellos` |
| (hoja sin AG:AI) `Telefono` | `tel` | solo si el proyecto no tiene ninguno (1988-1989) |
| (hoja sin AG:AI) `Entrega` | `entrega` | manda la hoja si dice algo y no hay op en bandeja (1996-1997) |
| (hoja sin AG:AI) `Direccion`/`Ubicacion` | `dir_texto`, pin | solo si el proyecto no tiene; nunca con op en bandeja (2004-2011) |

NO baja jamás a un proyecto con cotización: `nombre`, `etapa` (salvo `obraDeLaFila`), `tipo_trabajo`, `sub`, `neto`, `iva`, `fecha_ganado` (puente.js:570-578 y prueba puente.mjs:222-224).

Escritura local de lo que baja (puente.js:2017): `{...aplicar, id: local.id, actualizado_en: sello}` con `sello = max(editado, local.actualizado_en)` (`editado` siempre `null`: .gs:2538). `sync.jalar` lo fusiona con `fusionar` (superposición campo a campo, gana el de `actualizado_en` mayor; remoto gana en empate, sync.js:909-927) y luego `DB.poner` re-sella `actualizado_en=ahora`. Efecto práctico: lo que `bajar` pone en el parche SIEMPRE se escribe; la decisión real de «quién gana» está en qué claves entran al parche. Marcas que `bajar` también escribe/limpia: `hoja_perdida=null`, `fuera_de_hoja=null` si la fila vino (1965-1966); quita de `aplicar` los campos de `SE_QUEDAN_HASTA_MANDARSE` (`estatus_notion, cuenta, anti_pactado, pct_comision, sub, entrega`, 2101) que estén en `sin_mandar.campos` (1973-1974); `etapa→'instalado'` si es tarjeta importada y la hoja ya está COBRANDO/LIQUIDADO y la etapa estaba en la línea del taller (1946, 2014-2016).

### 3.3 BAJA a `ventas_hoja` (renglón del libro, TODAS las filas) — `ventaDeHoja` (puente.js:629-698)

Se devuelve a `sync.jalar` como `{almacen:'ventas_hoja', datos:{...venta, actualizado_en: Date.now()}}`. Descarta la fila si no hay `Proyecto` ni `Folio cotizacion` (635).

| Campo en `ventas_hoja` | Columna / clave | Transformación |
|---|---|---|
| `id` | A / `Folio cotizacion` / `Proyecto` | `'hoja:' + (folioHoja || folioCot || nombre)` |
| `folio_hoja` | `id_notion` (A) | texto |
| `folio_cotizacion` | `Folio cotizacion` (Y) | texto |
| `nombre` | `Proyecto` (B) | texto |
| `cuenta` | `Cuenta ` (D) | ∈ `CUENTAS` o `null` |
| `estatus` | `Estatus` (C) | ∈ `ESTATUS` o `null` |
| `tipo_trabajo` | `Tipo de trabajo` (E) | array (el .gs parte por coma) |
| `iva` | `IVA` (F) | `!== false` (el .gs ya lo vuelve booleano `=== 'Sí'`) |
| `fecha_anticipo` | `Fecha Anticipo e Instalacion` (L) | ISO o `''` |
| `fecha_instalacion` | `Fecha instalacion` (M) | ISO o `''` |
| `fecha_liquidacion` | `Fecha Liquidacion` (N) | ISO o `''` |
| `etapa` | `Etapa de obra` (Z) | `ETAPA_DESDE_NOTION[..] || null` (NO inventa «ganado») |
| `direccion` | `Direccion` (AC) | texto |
| `ubicacion` | `Ubicacion` (AB) | texto crudo (`lat,lng` o link) |
| `telefono` | `Telefono` (AE) | `telefonoLimpio`, SOLO si la llave viene |
| `entrega` | `Entrega` (AF) | `entregaDesdeHoja` (`''` si vacía), SOLO si la llave viene |
| `notas`, `plazo_k`, `sellos` | `Notas` AG, `Plazo taller` AH, `Sellos` AI | SOLO si `fila.Sellos` es objeto (aunque sea `{}`); `sellos` pasa de columna→ms a grupo→ms con `GRUPO_DE_COLUMNA` y descarta ms<=0 |
| `sub` | `Precio Subtotal` (G) | número; vaciada→`null`; ausente→no pone la clave |
| `neto` | `Precio Neto ` (H) fórmula | ídem |
| `anticipo` | `Anticipo` (I) | ídem |
| `liquidacion` | `Liquidacion` (J) | ídem |
| `pago_pendiente` | `Pago Pendiente` (K) fórmula | ídem |
| `comisiones` | `Comisiones` (R) fórmula | ídem |
| `abono_comision` | `Abono Comision` (S) fórmula (suma de la pestaña «Abonos comisión») | ídem |
| `comision_restante` | `Comision Restante` (T) fórmula | ídem |
| `pct_comision` | `Porcentaje comision` (AD) | ídem |

Regla del dinero: llave ausente (fabricación no recibe `CAMPOS_DE_DINERO`) = «no vino», `fusionar` conserva; llave presente y vacía = `null` (borrado). `CAMPOS_DE_DINERO` = `Precio Subtotal, Precio Neto , Anticipo, Liquidacion, Pago Pendiente, Comisiones, Abono Comision, Comision Restante, Cuenta , Fecha Liquidacion, Porcentaje comision` (.gs:2149-2152). `Estatus` y `IVA` sí bajan a fabricación.
No se mapea `Hora instalacion` (AA) a `ventas_hoja`: solo la usa `instalacionDeHoja` desde la fila cruda.

### 3.4 Instalaciones ↔ hoja

| Local | Hoja | Sentido |
|---|---|---|
| `fecha` | `Fecha instalacion` (M) | sube (viva) y baja (`instalacionDeHoja` sin sellos / `citaDeHoja` con sellos) |
| `hora` | `Hora instalacion` (AA) | idem; `undefined`=no cambia, `null`/`''`=sin hora, `'HH:MM'` |
| (cancelación) | M y AA vacías + sello | sube vaciando; baja con `citaDeHoja` si la fila trae sello de `Fecha instalacion` y fecha vacía |
| `ventana, duracion_min, estado('hecha'/'propuesta'), notas, gcal_event_id` | — | NO viajan (cada teléfono el suyo) |
| `uid_ics`, `movida` | — | NO viajan. Al bajar una cita movida: mismo UID, `movida+1`, `estado='reagendada'` (o `hecha` si ya lo estaba), nota «Movida del … al …: así quedó en la hoja.» (751-767). Cancelada por la hoja: `movida+1`, `estado='cancelada'`, nota «Cancelada en otro dispositivo…» (814-823) |
| nueva (proyecto sin cita viva) | fecha ISO ≥ hoy y etapa ∈ `EN_LA_LINEA` | crea `{id:DB.nuevoId('inst'), empresa_id, proyecto_id, fecha, hora, ventana:'dia', duracion_min:duracionSugerida(tipo_trabajo), estado:'confirmada', movida:0, uid_ics:'inst-<id>@al3d.mx', gcal_event_id:null, notas:'Agendada desde la hoja.'}` (769-787) |

Una cita por proyecto en la hoja (un par fecha/hora por fila). Una venta con varias instalaciones locales manda solo la «viva» más reciente por `actualizado_en` (`instalacionDe`, 1343-1352).

### 3.5 Vocabularios que el .gs duplica y una prueba compara (pruebas/puente.mjs:288-348)

`ETAPAS_OBRA` (.gs:2111) = `Object.values(ETAPA_A_NOTION)` mismo orden; `ESTATUS`, `CUENTAS`, `TIPOS_TRABAJO` (7), `ENTREGAS`, `PLAZOS_TALLER`, cada nombre de `P` ∈ `COL`. En Supabase: enums/CHECK en la base y UNA lista en el cliente.

### 3.6 Almacén (referencia; mapa propio probablemente en otra clave)

Pestañas «Almacén» (movimientos, anexo), «Catálogo de material» (materiales), «Listas de compra» (requerimientos): `ALM_PESTANAS` (.gs:5277-5360) con columna por campo (campo → encabezado: p.ej. `material_id→Material`, `cantidad→Cantidad`, `unidad_compra→Unidad`, `ts→Sello`, `id→Id`; materiales: `id→Clave`, `nombre→Nombre`, `familia→Familia`, … `actualizado_en→Editado`; requerimientos: `folio_hoja→Venta`, `cantidad_compra→Cantidad`, `cantidad_ajustada→Corrección`, `estado→Estado`, `id→Id`, …). Extras de hoja: `Otros (JSON)`, `Sellos`(JSON campo→ms; no en el libro), `Secuencia`, `Llegó`, `Subió`. Sello por campo = `actualizado_en` del registro; el .gs rechaza un campo si `Number(sellos[campo]) > ts` (estricto: empate escribe) (.gs:5695). Estado de lista de compra no retrocede desde `comprado`/`consumido` (.gs:5590-5594). Fabricación no recibe/escribe `costo_total`, `costo_compra`. Pagos solo escribe movimiento `origen:'derivado' tipo:'salida'` y requerimientos con `campos⊆{estado,folio_hoja}` y `estado:'consumido'` (.gs:5537-5553).

---------------------------------------------------------------------------------------------------

## 4. LA REGLA DE SELLOS (la que se porta)

### 4.1 Formato del sello, por todos lados

| Dónde | Forma | Quién lo escribe |
|---|---|---|
| `proyecto.sellos` (local) | `{ [grupo]: ms }`, `grupo ∈ {etapa, notas, plazo_k, tel, dir_texto, ubicacion, entrega}`. Clave ausente = «no sé cuándo» = 0 | `sellar(registro, campos, ts)` (proyectos.js:534-540) al guardar, solo de los campos que de verdad cambiaron; y `obraDeLaFila` al bajar |
| mapa campo→grupo | `SELLO_DE_CAMPO = {etapa:'etapa', notas:'notas', plazo_k:'plazo_k', tel:'tel', dir_texto:'dir_texto', lat:'ubicacion', lng:'ubicacion', entrega:'entrega'}` (proyectos.js:529-532). No sellan: `nombre, maps_url, geo_fuente, entrecalles, compromiso_texto, tipo_trabajo, dinero…` | |
| mapa grupo→columna | `COLUMNA_DEL_SELLO = {etapa:'Etapa de obra', notas:'Notas', plazo_k:'Plazo taller', tel:'Telefono', dir_texto:'Direccion', ubicacion:'Ubicacion', entrega:'Entrega', instalacion:'Fecha instalacion'}` (puente.js:447-450); `GRUPO_DE_COLUMNA` es el inverso | |
| cita de instalación | sello de la instalación = `actualizado_en` (si fue tocada aquí) o `sello_hoja` (si bajó de la hoja y nadie la tocó) — `selloDeInstalacion` (457) | `agenda.js` (reagendar/marcar/agendar ponen `actualizado_en`) |
| en la OPERACIÓN que sube | `op.sellos = { [nombre de COLUMNA]: ms }` solo para las columnas que van en `datos` con ms>0. La hora comparte el de la fecha | `sellosDeLaOperacion` (473) |
| celda `Sellos` (AI, oculta, texto `'@'`) | JSON `{"Etapa de obra":1760000000000,…}`; claves ⊆ `SELLADAS` = `['Etapa de obra','Fecha instalacion','Hora instalacion','Ubicacion','Direccion','Telefono','Entrega','Notas','Plazo taller']` (.gs:2019); `Hora instalacion` se guarda bajo `Fecha instalacion` (`claveDeSello_`, .gs:2021); valores enteros >0 | el .gs en `unaOperacion` y `alEditar` (a mano) |
| en `/jalar` | `fila['Sellos'] = {columna:ms}` (objeto ya parseado, solo si la hoja tiene AG:AI) → `ventaDeHoja` lo vuelve `venta.sellos = {grupo:ms}` | |
| recorte de reloj | el .gs acepta como máximo `ahora + 10 min` (`SELLO_HOLGURA_MS` .gs:2024, `selloValido_` .gs:2025-2029: `min(floor(n), ahora+holgura)`, 0 si no es número>0) | |

Sellos iniciales de un proyecto recién ganado: `etapa, tel, dir_texto, ubicacion, entrega` = `Date.now()` (+ `plazo_k` si hay plazo válido); `notas` NO (proyectos.js:635-636). Una tarjeta importada de la hoja nace con los sellos de la fila menos `instalacion` (proyectos.js:513-514).

### 4.2 Bajar: `obraDeLaFila` (puente.js:512-568) — pseudocódigo exacto

```js
obraDeLaFila(venta, local, o = {}):
  if (!venta || !local || !venta.sellos || typeof venta.sellos !== 'object') return null   // hoja sin AI → reglas viejas
  ocupados = o.ocupados instanceof Set ? o.ocupados : new Set()
  ls       = local.sellos (objeto) o {}
  parche   = {}; sellos = { ...ls }; cambio = false

  toma(g, valorHoja, vacio, igual, aplicar, borrable):
     if (ocupados.has('*') || ocupados.has(g)) return                 // hay un cambio MÍO en la bandeja para ese grupo
     explicito = Number(venta.sellos[g]) > 0
     hs = explicito ? Number(venta.sellos[g]) : (vacio ? 0 : 1)       // valor sin sello = «antiquísimo» (1); vacío sin sello = 0
     if (!(hs > (Number(ls[g]) || 0))) return                         // ESTRICTO: empate → gana lo local
     if (vacio && (!explicito || !borrable)) return                   // un vacío solo borra si trae sello Y el dato es borrable
     sellos[g] = hs; cambio = true                                    // el sello local sube AUNQUE el valor sea igual
     if (!igual) aplicar()

  et = venta.etapa || null
  toma('etapa',  et, !et, et === local.etapa, () => parche.etapa = et, false)

  if (typeof venta.notas === 'string'):
     n = venta.notas
     toma('notas', n, !n.trim(), n === String(local.notas || ''), () => parche.notas = n, true)

  if (venta.plazo_k !== undefined):
     k  = venta.plazo_k === null ? null : Number(venta.plazo_k)
     lk = local.plazo_k == null ? null : Number(local.plazo_k)
     toma('plazo_k', k, k === null, k === lk, () => parche.plazo_k = k, true)

  if (typeof venta.telefono === 'string'):
     t = venta.telefono
     toma('tel', t, !t, t === telefonoDe(local), () => parche.tel = t, true)   // telefonoDe = tel propio || origen.tel, limpiado

  d = String(venta.direccion || '')                                           // SIEMPRE se evalúa
  toma('dir_texto', d, !d.trim(), d === String(local.dir_texto || ''), () => parche.dir_texto = d, true)

  u     = ubicacionDeHoja(venta.ubicacion)            // {maps_url, lat, lng, geo_fuente}
  vacia = !String(venta.ubicacion || '').trim()
  igual = u.lat !== null
            ? (tienePin(local) && mismoPin(u.lat, local.lat) && mismoPin(u.lng, local.lng))   // mismoPin: toFixed(6) iguales
            : (vacia ? !tienePin(local)
                     : (!tienePin(local) && u.maps_url === String(local.maps_url || '').trim()))
  toma('ubicacion', venta.ubicacion, vacia, igual, () => {
        if (u.lat !== null) Object.assign(parche, {lat:u.lat, lng:u.lng, geo_fuente:u.geo_fuente}, u.maps_url ? {maps_url:u.maps_url} : {})
        else                Object.assign(parche, {lat:null, lng:null, geo_fuente:'sin_ubicar'}, u.maps_url ? {maps_url:u.maps_url} : {})
     }, true)

  if (typeof venta.entrega === 'string'):
     e = venta.entrega
     toma('entrega', e, !e, e === entregaDe(local), () => parche.entrega = e, false)

  return cambio ? { parche, sellos } : { parche: {}, sellos: null }
```

Lo que hace `bajar` con el resultado (1983-1987): `Object.assign(aplicar, obra.parche); if (obra.sellos) aplicar.sellos = obra.sellos;`. `sellos` es el mapa COMPLETO (`{...ls, grupos actualizados}`), y `fusionar` lo sustituye entero (no fusiona por clave: sync.js:917-921). `ocupados` = grupos con op `pendiente` de ese proyecto en la bandeja (`op.campos` mapeados por `SELLO_DE_CAMPO`; `'*'` si la op es `crear` o `campos===null`; `'instalacion'` si hay op de instalación) + `sin_mandar.campos` (puente.js:1771-1796). Solo cuentan ops `estado==='pendiente'`; las `rechazada`/`sin_destino` NO ocupan.

Efectos finos que hay que conservar:
- `igual` no impide subir el sello local: converge el sello aunque el valor ya coincida.
- Valor con valor y sin sello en la hoja: `hs=1` → pisa a lo local sin sello (0) y pierde contra cualquier sello local ≥ 1. Es el caso de datos migrados sin sellos.
- Vacío sin sello (celda borrada a mano: `alEditar` quita el sello, .gs:1147-1170): jamás borra. Vacío con sello y `borrable`: borra (alguien lo borró en la plataforma). `etapa` y `entrega` jamás se vacían.
- `ocupados` bloquea por grupo, no por proyecto (salvo `'*'`).

### 4.3 Subir: producir los sellos (`sellosDeLaOperacion`, puente.js:473-493)

```js
sellosDeLaOperacion(op, props, inst):
  out = {}; d = op.datos || {}; tiene = d.sellos && typeof d.sellos === 'object'
  campos = new Set(Array.isArray(op.campos) ? op.campos : [])
  for (col of Object.keys(props)):
     ms = 0
     if (col === 'Fecha instalacion' || col === 'Hora instalacion') ms = selloDeInstalacion(inst)
     else:
        g = GRUPO_DE_COLUMNA[col];  if (!g) continue                         // dinero, nombre, etc.: sin sello
        if (tiene) ms = Number(d.sellos[g]) || 0                             // op nueva: solo lo que se selló
        else if (algún campo c de SELLO_DE_CAMPO con SELLO_DE_CAMPO[c]===g está en campos) ms = Number(op.ts) || 0   // op de antes de los sellos
     if (ms > 0) out[col] = ms
  return out
```
Ejemplos fijados en pruebas/sincronizacion.mjs:138-147: op `{ts:999,campos:['notas','tel'],datos:{sellos:{notas:500}}}` + props `{Notas, Telefono, 'Folio cotizacion'}` → `{Notas:500}` (el teléfono no se selló aquí → 0 → no va); op vieja `{ts:999,campos:['tel'],datos:{}}` → `{Telefono:999}`; cita con `{actualizado_en:700}` → `{'Fecha instalacion':700,'Hora instalacion':700}`.

### 4.4 Subir: la compuerta del servidor (hoja-apps-script.gs:2881-2917) — HAY QUE PORTARLA A SQL

```
para cada celda c a escribir cuya columna ∈ SELLADAS:
   clave  = (columna == 'Hora instalacion') ? 'Fecha instalacion' : columna
   llega  = op.sellos presente ? selloValido(op.sellos[columna] || op.sellos[clave]) : ahora      // selloValido: floor, tope ahora+10min, 0 si no es >0
   tiene  = Sellos[clave] || 0
   si tiene > 0 y llega < tiene  →  NO escribir; viejos.push({nombre, por:'ya tenía un cambio más reciente'})
   si no → escribir; si llega > (Sellos nuevos[clave] || 0) → Sellos[clave] = llega
si no queda ninguna celda ni abono → responder {ok:true, remoto: fila actual (filtrada por rol), rechazadas, viejos}  // «ya está, y lo que hay es más nuevo»
las columnas NO selladas (dinero, nombre, folio, tipo, fechas L/N…) se escriben siempre (último en llegar gana, sin sello)
```
Consecuencias a copiar: (a) `llega=0` (el dato no trae sello): se escribe solo si la celda tampoco tiene sello; (b) EMPATE (`llega == tiene`) escribe; (c) el cliente NO usa `viejos` (puente.js:1673-1674 solo reenvía `remoto` y `rechazadas`): lo que pierde se corrige en la siguiente bajada; (d) una op sin `op.sellos` (cotizador `venta.js:414`, versiones viejas) sella con la hora de llegada, o sea GANA SIEMPRE: `venta.js:369-370` manda `'Etapa de obra':'Ganado'` y `'Direccion'` sin sellos, y `venta.js:561-563` lo REINTENTA si la cotización ya estaba registrada («apretar dos veces»), así que un reintento tardío puede devolver la etapa a «Ganado» sobre una etapa más avanzada (confirmado por lectura de .gs:2891,2899 y venta.js; no ejecutado). En la implementación nueva, esa vía debe pasar por el mismo transporte y llevar sellos; (e) tras escribir se rehace el JSON de `Sellos` solo si cambió.
Almacén (distinto, por campo del registro): `if (previa && Number(sellos[campo]) > ts) viejos` con `ts = d.actualizado_en` (o ahora si falta) (.gs:5674,5695); empate escribe.

### 4.4b Edición a mano en la hoja (desaparece al ser espejo de solo lectura)

`alEditar` (.gs:1147-1170): celda editada con dato → sello `ahora` de la hoja; celda editada vacía → se QUITA el sello (no cuenta como cambio). En Supabase no existe esta vía (la hoja es espejo): la distinción «vacío sin sello no borra» solo seguirá siendo necesaria para datos migrados sin sello.

### 4.5 La cita: `citaDeHoja` (puente.js:799-824) y `instalacionDeHoja` (731-788)

```js
citaDeHoja(fila, proyecto, insts, o):
  hs = Number(fila.Sellos['Fecha instalacion']) || 0
  ls = max(selloDeInstalacion(i) para i en insts) o 0
  if (!(hs > ls)) return null                                  // estricto
  marca = x => x ? {...x, sello_hoja: hs, sello_hoja_en: x.actualizado_en} : null
  if (fecha ISO en fila['Fecha instalacion']) return marca(instalacionDeHoja(fila, proyecto, insts, o))   // mueve o crea (mismas condiciones que sin sellos)
  viva = la instalación no cancelada con fecha ISO y mayor actualizado_en
  if (!viva) return null
  return marca({...viva, estado:'cancelada', movida:viva.movida+1, uid_ics: viva.uid_ics||'inst-'+viva.id+'@al3d.mx', notas: viva.notas + '\nCancelada en otro dispositivo: así quedó en la hoja.', actualizado_en: o.ahora})
```
`instDeHoja` (puente.js:1798-1827) solo corre si la fila trae fecha ISO o un sello de `Fecha instalacion` >0; se salta si el proyecto tiene op pendiente (proyecto o instalación) o ya procesó una cita de ese proyecto en la página (`agenda.hechos`: la misma venta en dos filas → manda la primera). Sin sellos: `instalacionDeHoja` MANDA LA HOJA (decisión de Elías 2026-10-08, puente.js:707-711), nunca cancela por celda vacía, solo agenda si etapa ∈ `EN_LA_LINEA` y fecha ≥ hoy.
Reglas heredadas de `instalacionDeHoja`: si `proyecto.etapa==='cancelado'` → null; hora `undefined`/`null`/`'HH:MM'` según la llave; con viva: si fecha y hora iguales → null; si no, mueve (`estado:'reagendada'` salvo `'hecha'`).

DEFECTO PROBABLE (verificado por lectura, no ejecutado): `citaDeHoja` marca `sello_hoja_en = x.actualizado_en` (= `o.ahora`), pero `sync.jalar` escribe con `DB.poner`, que re-sella `actualizado_en = Date.now()` al escribir (db.js:230; sync.js:808-814). Salvo coincidencia al milisegundo, `selloDeInstalacion` verá `sello_hoja_en !== actualizado_en` y devolverá `actualizado_en` (la hora de escritura local, posterior al sello de la hoja). Efecto: un cambio de cita de otro teléfono con sello entre `hs` y la hora de escritura local se ignora aquí. La prueba cubre solo la función pura (sincronizacion.mjs:145-147). En Supabase, el sello de la cita debe ser una columna propia que no se re-selle.

### 4.6 `fusionar` y `jalar` (sync.js) — la parte genérica de la fusión

`fusionar(local, remoto)` (sync.js:909-927): `tR>=tL ? remoto es «nuevo»`; sale `{...viejo}` con las claves definidas del «nuevo» encima; `actualizado_en=max`, `creado_en=min`, `sync=1`. `undefined` no pisa. Para proyectos el parche de `bajar` trae `actualizado_en: sello ≥ local` → remoto siempre es el «nuevo». `mismoDato` (sync.js:880-889) ignora `actualizado_en, creado_en, sync` para no reescribir lo que no cambió. Movimientos (`APPEND_ONLY`): id ya presente → se descarta sin mirar contenido (sync.js:795-806).

### 4.7 Casos que fijan la regla (pruebas/sincronizacion.mjs:111-152) — convertir a pruebas de la implementación nueva

`local={etapa:'cortado',notas:'mía',plazo_k:2,tel:'33 1',dir_texto:'Calle 1',lat:20.1,lng:-103.1,entrega:'instalacion',sellos:{etapa:100,notas:100,tel:100}}`; `venta={etapa:'armado',notas:'de la hoja',plazo_k:2,telefono:'33 9',direccion:'Calle 1',ubicacion:'20.1,-103.1',entrega:'',sellos:{etapa:200,notas:50,tel:200}}`:
- parche `{etapa:'armado', tel:'33 9'}` sin notas; `sellos` resultante etapa 200, tel 200, notas 100.
- con `ocupados={'etapa'}` → `parche.etapa` indefinido; con `'*'` → `parche` vacío.
- vacía sin sello (`notas:''`, `sellos:{}`, local sin sellos) → no borra; vacía con `sellos.notas=300` → `notas=''`.
- `etapa:null` con sello 300 → no toca etapa.
- dirección con valor y `sellos:{}` vs local `sellos:{}` → `dir_texto='Calle 2'`; vs local `dir_texto:5` → no.
- `sellos` indefinido → `null`.
Integración (dos teléfonos contra el .gs real): etapa A→B y B→A; nota; plazo (`null` borra y llega); cita mover/cancelar con mismo UID y `movida>=2`; nota de A (primero) vs nota de B (después) → gana B aunque la de A llegue después; sin señal: lo de la bandeja no se pisa al bajar, y al subir un «En diseño» más viejo que el «Cortado» de otro la hoja no lo escribe (y no queda nada atorado); teclear en la hoja: dirección llega, vaciar notas NO borra, etapa a mano llega; pagos escribe notas pero no plazo (`rechazadas:['Plazo taller']`).

---------------------------------------------------------------------------------------------------

## 5. Protocolo push/pull

### 5.1 Disparadores y bucle (quién llama a quién)

- `proyectos.js`/`agenda.js`/`stock.js`/`material.js`/`reglas.js` encolan con `sync.encolar` → `programarBombeo` (1.5 s, sync.js:338-348; no corre si no hay puente o `navigator.onLine===false`).
- `app.js`: al arrancar `enchufarPuente()` (1897) + `sincronizarCallado()`; `setInterval` cada `MS_SINCRONIZAR=30000` solo si la pestaña está visible (1837-1842); `visibilitychange` visible; evento `online` (1830). `sincronizarDeVerdad` (2030): `Sync.bombear()` y luego hasta 10 vueltas de `Sync.jalar()` mientras `hay_mas`; después Drive (`Carpetas.alDia`) y `resolverLinksPendientes`. Una a la vez (promesa compartida).
- Cupo del Apps Script: 60 peticiones/min por correo o token (`LIMITE_POR_MINUTO` .gs:2164, ventana fija), cuerpo ≤64 KB salvo `/ia`.

### 5.2 `bombear()` (sync.js:482-707) y `subir()` del relevo

1. `revivirSinDestino()` (ops `sin_destino` cuyo almacén ya `lleva`) y `revivirRechazadas()` (`revive(op)`).
2. `cola = pendientes()` = ops sin marca, no `conflicto/sin_destino/rechazada`, ordenadas por `ts` (índice `porTs`).
3. Sin puente → `{ok, motivo:'sin_puente'}`; sin red → `motivo:'sin_red'`; cola vacía → `'nada_que_mandar'`.
4. Recorre en serie. Si `!adaptador.lleva(op)` → `sin_destino`. Lote = op + las siguientes que `agrupa`, hasta 25.
5. `adaptador.subir(lote)`. Si lanza: `_ultimoError`, `fallidas++`, corta (el orden no se rompe).
6. Por cada respuesta `tratar`:
   - `ok && omitida` → borra de la bandeja, `omitidas++` (no cuenta como subida).
   - `ok` → borra; acumula `rechazadas[]` (propiedades no escritas con su razón) → `rechazos`; `subidas++`.
   - `codigo==='SIN_DESTINO'` → `sin_destino` con `mensaje`.
   - `definitivo` → `estado:'rechazada'`, `ultimo_error`, `codigo_rechazo`, `motivo_rechazo`; no para el bombeo.
   - `CONFLICTO` → `estado:'conflicto'` con `conflicto` (código muerto con la hoja).
   - otro → `intentos+1`, `ultimo_error`; PARA el bombeo si `codigo ∈ {SIN_RED, DESCONOCIDO, ROL_SIN_PERMISO}`.
7. `ponerMarcas({ultimo_envio})` si hubo subidas. Resultado `{mandadas, subidas, fallidas, conflictos, pendientes, sin_destino, rechazadas, omitidas, rechazos, motivo:'ok'|'ok_incompleto'|'con_fallas'}`.

`subir(ops)` de proyectos/instalaciones (puente.js:1485-1703), por cada op:
1. `escribibles` = `Set` de `/salud` (cacheado; si `/salud` falla → todas devuelven `{ok:false, codigo}` y no se manda nada).
2. `proy = proyectoVivo(op)` (el proyecto VIVO de IndexedDB; los VALORES salen de `op.datos`, la foto). Si no existe (y es instalación) → `NO_ENCONTRADO` definitivo.
3. `proy.fuera_de_hoja` → `anotarSinMandar` y `{ok:true, omitida:true}`. `proy.hoja_perdida.motivo==='de_otra'` con su folio → `NO_ENCONTRADO` definitivo `motivo:'de_otra'`. Lápida sin fila (`!idNotion && etapa==='cancelado'`) → `omitida`.
4. `props = aNotion(op.datos, instalacionDe(proy.id), {alta:!idNotion, campos})` (proyectos) o `instalacionANotion(op.datos, viva)` (instalaciones). Se QUITAN `Telefono`/`Entrega`/`Notas`/`Plazo taller` si la versión de la hoja es <11/<12/<14; si el cambio era solo de eso → `omitida` (lo reenvía la revisión de la bajada).
5. `filtrar(props, escribibles)`; si el resultado es vacío o es alta sin `Proyecto`, se refresca `escribibles` UNA vez por tanda (`refrescada`) y se vuelve a filtrar; si sigue mal → `ROL_SIN_PERMISO` definitivo (mensajes 1614-1622).
6. `POST` con `{ruta:'empujar', ops:[{id, tipo:idNotion?'actualizar':'crear', id_notion:idNotion, datos:enviables, sellos:sellosDeLaOperacion(op, enviables, instEnviada), folio_cotizacion?}]}`. `tipo` es informativo: el .gs lo ignora y decide por `id_notion`/`folio_cotizacion`/existencia de fila (.gs:2759-2783).
7. Respuesta ok: `espejarLocal(proy.id, {notion_page_id: res.remoto.id_notion || idNotion, notion_estado:'enviado'})` SIN encolar, y devuelve `{ok:true, remoto, rechazadas}`.
8. Respuesta no ok: si `codigo ∉ {CONFLICTO, SIN_RED}` → `notion_estado:'fallido'`; si hubo `id_notion` y `motivoPerdida(res)` → `marcarPerdidaEnLaHoja`; devuelve `{ok:false, codigo, definitivo: ∈{ROL_SIN_PERMISO, NO_ENCONTRADO, DATO_INVALIDO}, motivo?, mensaje, conflicto}`.
9. Error de red al hacer la petición → `{ok:false, codigo:'SIN_RED'}` y `break` del lote. OJO: si el .gs contesta `{ok:false, codigo:'SIN_RED'}` en el cuerpo (cupo o candado ocupado), `r.cuerpo.resultados` no existe → el relevo lo traduce a `DESCONOCIDO` (1652-1656), que también para el bombeo.

Almacén (`subirAlmacen`, 1189-1225): `POST {ruta:'empujar_almacen', ops:[{id, almacen, tipo, registro_id, datos(sin 'sync'), campos}]}`; añade `datos.folio_hoja` (de `p.notion_page_id || p.folio_hoja`) si cuelga de un proyecto con fila (1172-1187). Respuesta `{ok, resultados:[{id, ok, creada?, ya_estaba?, sin_cambio?, viejos?, codigo?, mensaje?}], secuencia}`. `NO_ENCONTRADO` a nivel cuerpo = hoja anterior a la 9 → `noSabe()`; `SIN_DESTINO`.

### 5.3 `bajar(cursor)` (puente.js:1710-2030) y `sync.jalar` (sync.js:738-876)

Petición: `POST {ruta:'jalar', cursor?}`. Respuesta del .gs (rutaJalar_ .gs:2500-2525): `{ok:true, registros:[{almacen:'proyectos', datos:<fila aplanada>}], cursor:string|null, hay_mas:bool}`. Fila aplanada (`aplanarFila` .gs:2527-2587): `id_notion` (A), `editado:null`, y cada propiedad de `COL` con su tipo (fechas ISO `yyyy-MM-dd` en la zona de la hoja; `IVA` booleano; `Tipo de trabajo` array; hora `HH:MM`; números `null` si vacío); `Telefono`, `Entrega`, `Notas`, `Plazo taller`, `Sellos` SOLO si la hoja tiene esas columnas. A fabricación se le quitan las `CAMPOS_DE_DINERO` (.gs:2590-2594). Omite filas sin `Proyecto`.
Paginación: la hoja ya NO pagina (una sola página de hasta 309 filas, `tam=FIN-1`, .gs:2504-2511); el cursor (número de fila) se sigue aceptando. `sync.jalar` guarda `cursor` y `barrido` en `_marcas`; cierra el barrido cuando `hay_mas` es falso: borra de los `ESPEJOS` (`ventas_hoja`) los ids no vistos (solo si el barrido no es `parcial`) y llama `despuesDeBajar`.

Pasos de `bajar` por página:
1. `ventasPagina = filas.map(ventaDeHoja)`; `hojaConEntrega`/`hojaConObra` = alguna fila trae la llave/sellos.
2. Por fila: (1) `ventas_hoja` siempre; (2) `deNotion` + localizar proyecto (4 caminos de §3.2); (3) sin proyecto: importar si `VIVAS_EN_TALLER` (+ cita); (4) con proyecto: descartar si la misma venta está en dos filas (`hoja_doble`) y no es la suya; armar `aplicar` (`deAqui` | `parche` | derivado de `venta` para importados); `hoja_confirmada`; quitar `sin_mandar`; `obraDeLaFila` o reglas viejas; `etapa→'instalado'` (importada cobrada); `registros.push({almacen:'proyectos', datos:{...aplicar,id,actualizado_en:sello}})`; `instDeHoja(...)`.
3. Solo en la última página y si la hoja sabe de almacén: `bajarAlmacen()`.

`bajarAlmacen` (1258-1297): `POST {ruta:'jalar_almacen', desde:<secuencia>}` hasta 20 páginas de 1500; respuesta `{ok, registros:[{almacen, datos}], hasta, hay_mas}`; secuencia global que pone la hoja bajo candado. Una vez por semana (`MS_SEMANA`) o si no hay marca, `desde=0` (barrido entero, `barriendo` si no cupo en 20 páginas). Movimientos tal cual (`sync.jalar` descarta ids repetidos); catálogo y listas con `actualizado_en: Date.now()` (para que gane lo que acaba de bajar), saltando los registros con op pendiente en la bandeja local (`esperandoEnLaBandeja`). La marca se guarda en `despuesDeBajar` (`_almacen_hoja`), después de que `sync` escribió.

### 5.4 Petición HTTP (`pedir`, puente.js:963-1050)

- SIEMPRE `POST` a la URL pelada (Apps Script no acepta path en POST), `Content-Type: text/plain;charset=utf-8` (evita preflight CORS), `redirect:'follow'`, `AbortController` a 15 s (`MS_ESPERA`).
- Cuerpo: `{ruta:'<camino sin barra>', ...cuerpo, google_token?, token?}` con `ruta` PRIMERO (el .gs solo abre el tope de 64 KB a cuerpos que empiezan por `{"ruta":"ia",`). Los `?clave=valor` de la ruta se doblan al cuerpo.
- Doble puerta en la misma petición: `google_token` (token de acceso de Google, 1 h, solo en memoria, `Ingreso.token()`) y `token` (de dispositivo, `Prefs.puente().token`). El .gs prefiere Google (rol por correo en la pestaña «Accesos»), si no el token (rol por `PUENTE_TOKENS`). Cache de verificación: 300 s con rol, 60 s sin él (.gs:2358).
- Renovación del token de Google (`tokenDeGoogle` 943-957): si hubo ingreso en este aparato y el token no está vivo, `Ingreso.renovar()` con tope 5 s (`MS_RENOVAR`) y como mucho 1 intento por minuto.
- Errores → `falla(codigo, mensaje)` (un `Error` con `.codigo`): red/timeout → `SIN_RED`; 2xx sin JSON → `DESCONOCIDO`; HTTP 401/403 o `{ok:false, codigo:'ROL_SIN_PERMISO'}` → lanza `ROL_SIN_PERMISO`; ≥400 sin cuerpo → `SIN_RED`. Un cuerpo `{ok:false,…}` (que no sea ROL_SIN_PERMISO) se DEVUELVE; cada método decide.
- Códigos de la hoja que el cliente entiende: `ROL_SIN_PERMISO, NO_ENCONTRADO, DATO_INVALIDO, SIN_RED, DESCONOCIDO, SIN_DESTINO (solo cliente), CONFLICTO (nunca llega), ESPERA_REALINEAR (cae en el «otro»: no definitivo), CUPO_AGOTADO (IA)`.

### 5.5 Acceso revocado / sesión

- Hoy no hay borrado local por revocación. `puerta.js` (348-465): `preguntarALaHoja()` llama `relevo.salud()`; si `s.ok && via==='google'` guarda el «pase» `{correo, rol, hasta, visto}` (`Prefs.setPase`, prefs.js:314-321); si `codigo==='ROL_SIN_PERMISO'` y hay token de Google vivo → `estado:'fuera'`; en el camino callado se pregunta DOS veces (la segunda tras `MS_SEGUNDA_OPINION`) porque el Apps Script contesta ese mismo código cuando Google no le contesta; confirmado `fuera` → `Prefs.borrarPase()` + `pedirEntrada(...)`. No se tocan IndexedDB ni localStorage de datos.
- El rol lo manda la hoja: `Prefs.rol()` = rol del pase vigente, si no el ajuste local (prefs.js:174-179); cambiar el segmento en Ajustes «no da permisos».
- Al cambiar el rol por el pase: `location.reload()` (puerta.js:434).

### 5.6 Versionado del esquema

- `/salud` devuelve `version:'puente-sheets-N'`. El relevo la guarda (`notarVersion`: `versionHoja`, `hojaSabeAlmacen = N>=9`) y la usa para APAGAR funciones: teléfono (<11), entrega (<12), notas y plazo (<14), almacén (<9) — se quitan de lo que se manda y se reenvían solos cuando la hoja sube.
- `Ajustes` compara con `VERSION_ESPERADA` y muestra `avisoVersion(v)` (qué falla con esa versión). No bloquea.
- Coincidencia exigida: solo por prueba de CI (`pruebas/puente.mjs:341`: el `.gs` del repo declara `VERSION_ESPERADA`). El servidor y la plataforma NO necesitan coincidir en ejecución; sí deben coincidir en vocabulario (listas de §3.5) y en el nombre de las propiedades.
- Para Supabase: reemplazar por una versión de contrato (p. ej. columna/RPC `version_contrato`) con el mismo uso: una sola, sin umbrales por función si el esquema se migra de golpe.

---------------------------------------------------------------------------------------------------

## 6. Cómo decide el cliente qué campos escribe cada rol

Tres capas independientes; solo la última es autoridad.

1. Dominio local (`proyectos.js`): `actualizar(id, parche)` rechaza campos fuera de `ESCRIBIBLES` (954-959: `nombre, contacto, negocio, tel, notas, tipo_trabajo, compromiso_texto, dir_texto, entrecalles, maps_url, lat, lng, geo_fuente, anti_pactado, cuenta, estatus_notion, notion_page_id, notion_estado, pct_comision, fecha_ganado, plazo_k, entrega, sync`) y los de `BLOQUEADOS` (963-978: `origen, folio_global, folio_local, creado_en, id, dispositivo, empresa_id, etapa, pago_pendiente, comision_restante, sub, neto, precio_auth, iva`); y filtra por `CAMPOS_ROL[Prefs.rol()]` (982-995):
   - `direccion`: `null` = todo `ESCRIBIBLES`.
   - `fabricacion`: `notas, lat, lng, geo_fuente, maps_url, entrecalles, plazo_k, entrega, tel, dir_texto, sync`.
   - `pagos`: `notas, cuenta, estatus_notion, notion_page_id, notion_estado, pct_comision, tel, sync` (NO `anti_pactado`).
   `puedeEscribir(rol, campo)` (1000) para que la UI solo ofrezca lo guardable.
   Etapa: `puedeMover(rol, etapa)` con `TOPE_ROL = {direccion:null, fabricacion:'listo', pagos:false}` (1116-1127; compara `ORDEN`); `descartar` («No se dio»/`cancelado`) solo direccion (741-743). `avanzarEtapa` (1223): ROL_SIN_PERMISO si no puede.
   Otros: agenda (`agenda.js:211`, pagos no agenda; fabricación solo propone: `estadoInicial()`), stock (`stock.js:295` pagos no mueve almacén), gcal solo direccion.
2. Relevo (`puente.js subir`): `escribibles` de `/salud` = lista de NOMBRES DE COLUMNA que el servidor permite al rol (`PUENTE_ROLES`), cacheada; `filtrar(props, escribibles)` (1309-1316) quita lo no permitido y lo NOMBRA en `fuera`. Alta sin `Proyecto` permitido → `ROL_SIN_PERMISO` definitivo («dala de alta desde el de Dirección»). Op sin nada escribible → `ROL_SIN_PERMISO` definitivo. Se refresca la lista una vez por tanda antes de apartar por rol (por si Dirección cambió el rol a media sesión).
3. Servidor (`.gs`): `PUENTE_ROLES` (.gs:2120-2136) — autoridad real, y `CAMPOS_DE_DINERO`/`VE_EL_DINERO` para lectura (.gs:2149-2153).

| Columna (nombre) | direccion | fabricacion | pagos |
|---|---|---|---|
| Proyecto, Precio Subtotal, IVA, Fecha Anticipo e Instalacion, Folio cotizacion, Tipo de trabajo | escribe | — | — |
| Anticipo, Liquidacion, Abono Comision, Fecha Liquidacion, Porcentaje comision | escribe | — | escribe |
| Estatus, Cuenta  | escribe | — | escribe |
| Etapa de obra, Fecha instalacion, Hora instalacion, Ubicacion, Direccion, Entrega, Plazo taller | escribe | escribe | — |
| Telefono, Notas | escribe | escribe | escribe |

Diferencias cliente/servidor que importan al migrar la matriz a SQL:
- Etapa: el servidor deja a fabricación escribir CUALQUIERA de las 8 etapas; el tope «hasta listo» y «pagos no mueve etapa» existen SOLO en el cliente (`TOPE_ROL`). Plan §4.2 lo pide en base: es regla nueva.
- Pagos: el servidor le permite `Anticipo`/`Liquidacion`/`Abono Comision`/`Fecha Liquidacion`; el cliente no tiene UI ni campo para los tres últimos y `CAMPOS_ROL.pagos` excluye `anti_pactado`. Hoy esos importes los teclea Pagos en la hoja (menús del .gs: registrar cobro, abono, reparto FIFO).
- Fabricación: el servidor le permite `Hora instalacion`/`Fecha instalacion` (la cita); en el cliente `agenda.js` decide (fabricación «solo propone»).
- Lectura: fabricación no recibe `CAMPOS_DE_DINERO` (filtrado después de leer, `sinLoQueNoLeToca` .gs:2590); `Estatus` e `IVA` sí.

---------------------------------------------------------------------------------------------------

## 7. Qué cosas del módulo son plomería de «fila de hoja» y desaparecen con un id compartido

Existen porque la identidad entre teléfonos es una FILA DE HOJA, no un id: importar tarjetas `proy-hoja-V-xxx`, `propioPorFila`/`ataLaFila`/`mismaVentaQueLaFila` (proyectos.js:1576-1617), `hoja_perdida`, `hoja_doble`, `duplicado_de`, `fuera_de_hoja`, `sin_mandar` + `anotarSinMandar` (puente.js:2089), `hoja_confirmada`, `folios_previos`, `distinta_de`, `ventas_hoja` + `ESPEJOS` + cierre de barrido, `motivoPerdida`/`mensajePerdida`, `revive*` por versión, `tel_a_la_hoja`/`entrega_a_la_hoja`/`obra_a_la_hoja` (proyectos.js:2084-2149), `deNotion` por folio de cotización. Con `proyectos.id` único y migración que una por `Folio cotizacion` (plan §5 fase 2), el núcleo que queda es: sellos (§4), mapeo de campos, cola de salida, permisos por rol, citas.
Lo que SÍ hay que cuidar al quitarlo: lo que `Control` suma hoy sale de `ventas_hoja` (récord de TODAS las filas, incluidas las 199 históricas sin proyecto): proyectos.js/ventas.js leen ese almacén; sin él Control pierde las históricas salvo que migren a `proyectos`/`ventas_dinero`.

---------------------------------------------------------------------------------------------------

## 8. Acoplamientos al Apps Script y propuesta de «transporte»

### 8.1 Dónde está pegado hoy

| Qué | Dónde | Detalle |
|---|---|---|
| URL fija del puente | `js/datos/prefs.js:83-84` `URL_PUENTE`; anulable por dispositivo en `localStorage.al3d_pf_puente` (`{url, token, rol, probado}`) (`Prefs.puente()` 278) | Ajustes la edita (ajustes.js:1414-1448). `db.js:385` impide que entre al respaldo |
| `normalizarUrl` | puente.js:1073; copia casi idéntica en `cotizador/venta.js:299-308` | quita `/salud|/esquema|/jalar|/empujar|/expandir` |
| Formato de petición | `pedir` puente.js:963; copias: `cotizador/venta.js:314-335` (`puentePost`, solo token, mensajes propios) y `cotizador/notario.js:70-85` (`_postHoja`, fallback suelto) | POST text/plain, `{ruta,…,token}` |
| Tokens | `google_token` (`Ingreso`, js/nucleo/ingreso.js:167-171) y `token` de dispositivo (`PUENTE_TOKENS` en Script Properties) | doble puerta por petición |
| Formato de respuesta | `{ok:boolean, codigo, mensaje, …}`; siempre HTTP 200 (el .gs no usa códigos HTTP) | `pedir` traduce ROL_SIN_PERMISO→401 interno |
| Rutas usadas | Relevo: `salud, esquema, jalar, empujar, jalar_almacen, empujar_almacen, expandir, carpetas, crear_carpeta`. `hablar` (puente.js) desde `nucleo/asistente.js:55,785`: `salud`, `ia`. `hablarHoja` de `cotizador/notario.js` (vía `window.AL3D.hablar` o `_postHoja`): `autorizar` (124), `solicitar` (223), `cancelar` (280), `estado` (322), `pendientes` (468), `rechazar` (718, y `cotizador/proceso.js:2161`); `cotizador/ia.js:152,876`: `salud`, `ia`. `revocar` existe en el .gs (doPost 2257) pero NO CONFIRMADO que el cliente la llame. `verificar` (público, sin identidad) la llama `verificar.html:413` con su propio `fetch`. `empujar` directo desde `cotizador/venta.js:414`. Catálogo completo de rutas del servidor: .gs doPost 2246-2262 | Cinco puntos de salida distintos al Apps Script: `puente.js pedir`, `venta.js puentePost`, `notario.js _postHoja`, `verificar.html`, y `Puente.hablar` (que reutiliza `pedir`) |
| Nombres de columna como API | `P` (puente.js:78-121) y el `.gs` `COL`; `venta.js:357-387` también escribe con esos nombres (`'Cuenta '`, `'Folio cotizacion'`…) | |
| Versión | `VERSION_ESPERADA` y umbrales (puente.js:211-226,881) | |
| Rol/identidad | `/salud` → `{rol, via, correo, escribibles}`; `puerta.js` guarda pase; `Prefs.rol()` | |
| CSP | `connect-src` con `https://script.google.com https://script.googleusercontent.com` en `index.html`, `cotizador.html`, `verificar.html:6` (y `pruebas/csp.mjs`) | Supabase exige añadir `https://<ref>.supabase.co` y `wss://<ref>.supabase.co` |
| Textos de UI | `instrucciones()` (puente.js:2151), `FALLA_CON` (891), `motivoSinDestino`, `mensajePerdida`, Ajustes («El puente», «Probar», «Revisar el esquema») | hablan de hoja/Apps Script |
| Drive | `carpetas`, `crearCarpeta` (puente.js:1451,1467) → `Sync.carpetas/crearCarpeta` (sync.js:192-205) | el plan lo deja en Apps Script |

### 8.2 Interfaz de transporte propuesta (lo mínimo para cambiar hoja→Supabase sin tocar la regla de sellos)

Tres capas; la regla vive en la del medio y no conoce red ni forma de fila.

```
CAPA A — Regla (pura, SE PORTA TAL CUAL; viven en puente.js hoy):
   sellar()/SELLO_DE_CAMPO (proyectos.js)     — producir sellos al guardar
   sellosDeLaOperacion(op, props, inst)       — qué sellos viajan (hoy por nombre de columna; en Supabase por grupo)
   obraDeLaFila(venta, local, {ocupados})     — decidir al bajar
   selloDeInstalacion / citaDeHoja            — la cita (corregir el defecto de §4.5)
   [compuerta de subir: HOY EN EL SERVIDOR → SQL]   §4.4

CAPA B — Traductor de forma (por transporte):
   hoja:     aNotion / instalacionANotion / deNotion / ventaDeHoja (columnas y vocabulario P)
   supabase: filaDeProyecto(row, dineroRow?) → «venta» con la MISMA forma que ventaDeHoja usa en obraDeLaFila:
             {etapa, notas, plazo_k, telefono, direccion, ubicacion:'lat,lng'|maps_url|'', entrega, sellos:{grupo:ms}}
             y proyectoARow(op) → columnas/jsonb de sellos.

CAPA C — Transporte (red, auth, paginación, errores):
   interface Transporte {
     nombre: string
     salud(): Promise<{ok, rol, via, correo, escribibles?, version, mensaje?, codigo?}>
     subir(ops: Operacion[]): Promise<Resultado[]>           // mismo contrato de resultados de §5.2 (ok/omitida/definitivo/codigo/mensaje/rechazadas/remoto)
     bajar(cursor): Promise<{registros:[{almacen, datos}], cursor, hay_mas}>
     lleva(almacen), agrupa(almacen), espejos[], revive(op), motivo(almacen)      // ya existen en AdaptadorSync
     despuesDeBajar(info)
     rpc(ruta, cuerpo, espera)   // = hablar(): solicitar/autorizar/revocar/ia/verificar (cotizador, asistente)
     expandir(u), carpetas(), crearCarpeta(n)   // se quedan en Apps Script según el plan
     // nuevo para el plan §4.4/§4.8:
     suscribir?(cb)  // Realtime
     alAccesoRevocado?(cb)
   }
```
`sync.js` ya consume exactamente esta interfaz (`AdaptadorSync`); un `crearSupabase(cfg)` que devuelva el mismo objeto basta para `Sync.registrar(...)`. Lo que hay que sacar de `puente.js` hacia afuera para esto: constantes de vocabulario (`ESTATUS, CUENTAS, ETAPA_*, ESTATUS_DE_PAGOS` las importa `js/mod/proyectos.js:36`), `hablar`/`normalizarUrl` (importados por `mod/cotizador.js`, `nucleo/asistente.js`, `mod/ajustes.js`, `nucleo/puerta.js`) y `desdePrefs` (app.js:1900).

Puntos de contacto a reescribir además de puente.js (no están en la lista del plan §8): `js/cotizador/venta.js` (293-434), `js/cotizador/notario.js` (59-85 y sus rutas), `js/cotizador/ia.js:152,876`, `js/cotizador/proceso.js:2161`, `js/mod/cotizador.js:339-362` (`AL3D.hablar`, `AL3D.identidad`, `AL3D.sesion`), `js/nucleo/asistente.js:55,785`, `js/nucleo/puerta.js:444-465`, `js/mod/ajustes.js` (probar/esquema/versión), `js/datos/prefs.js` (`URL_PUENTE`, `puente()`, `hayPuente`, `pase`), `verificar.html:413`, `index.html`/`cotizador.html`/`verificar.html` (CSP), `pruebas/csp.mjs`. (Las rutas `solicitar/autorizar/rechazar/estado/pendientes/revocar/verificar/ia` las cubre, se supone, otro mapa del servidor y del notario; aquí solo se registra el acoplamiento del transporte.)

### 8.3 Lo que no se puede abstraer sin decisión

- El servidor de hoy decide quién gana al SUBIR. Con Supabase + RLS no hay comparación por campo: necesita una función SQL/RPC (o trigger) que reciba `{id, columnas/valores, sellos}` y haga §4.4. El cliente no puede hacerlo escribiendo directo a la tabla.
- `escribibles` por rol lo calcula el servidor; con Supabase el cliente necesita una fuente equivalente (vista/RPC `mis_permisos`) o conservar la copia de `CAMPOS_ROL` y dejar que la base rechace.
- El «tipo» `crear`/`actualizar` es irrelevante hoy; el alta se resuelve por `Folio cotizacion` (idempotencia). En Supabase: upsert por `(empresa_id, folio_global)` o por id de cliente.

### 8.4 Reglas de negocio que viven en el .gs y afectan al dinero (aviso para quien diseñe `ventas_dinero`)

- IVA por cuenta: `ivaDeCuenta` («Elias BBVA» cobra sin factura = `'No'`, cualquier otra `'Sí'`; `CUENTA_SIN_FACTURA` .gs:935) se reaplica en cada `/empujar` a toda fila no LIQUIDADA (`normalizarIvaActivos`, .gs:1057-1067, llamada en `rutaEmpujar_` .gs:2698) y al editar la columna D (`alEditar` .gs:1143-1145). El `iva` que sube el teléfono se sobrescribe, y `iva` no baja a `proyectos` (deNotion no lo trae), así que el local puede quedar con un IVA distinto al de la hoja. La base tendría que aplicar la misma regla.
- Fórmulas Precio Neto/Pago Pendiente/Comisiones/Comision Restante se calculan en la hoja (el cliente solo las lee, puente.js:602-611). Plan §4.10 pide reproducirlas.
- Orden/reacomodo de la hoja por estatus (`ordenarVentas`), `FIN=310` filas, folios `V-nnn` autoincrementales con marca `FOLIO_MAS_ALTO`: infraestructura de hoja, no dato.

---------------------------------------------------------------------------------------------------

## 9. Contradicciones con el plan

1. Plan §3.3 y §4.4: «La regla de sellos (`obraDeLaFila`, `sellos` por campo) se conserva tal cual». `obraDeLaFila` es solo la mitad que BAJA. La compuerta que SUBE está en el .gs (hoja-apps-script.gs:2881-2917) y la producción de sellos en `sellosDeLaOperacion` (puente.js:473) y `sellar` (proyectos.js:534). Sin la compuerta en SQL, dos escrituras cruzadas se pisan (último en llegar gana).
2. Plan §4.4: «Se conserva la bandeja de salida y el reintento». La bandeja se conserva, pero no hay reintento con espera: `esperaMs` (sync.js:714) está exportada y sin uso; el «reintento» son disparadores (§5.1). Y `CONFLICTO`/`esperado` son código muerto con la hoja.
3. Plan §4.8: «la base devuelve `acceso_revocado` … la app borra IndexedDB y localStorage». Hoy no existe ningún mecanismo de borrado por revocación (0 resultados de `acceso_revocado`); solo `Prefs.borrarPase()` + pantalla de entrada (puerta.js:427-430). Hay que construirlo, y respetar la «segunda opinión» (puerta.js:376-392) para no echar a alguien por un tropiezo.
4. Cabecera de puente.js:12: «Ningún módulo importa este». Falso: lo importan `app.js:1900`, `puerta.js:69`, `ajustes.js:39`, `mod/cotizador.js:76`, `nucleo/asistente.js:34`, `mod/proyectos.js:36` (constantes). Y `cotizador/venta.js` y `cotizador/notario.js` hablan con el Apps Script SIN pasar por él.
5. Plan §8 («Modificar … js/datos/puente.js (mapeos y sellos)»): faltan en la lista `js/cotizador/venta.js`, `js/cotizador/notario.js`, `js/cotizador/ia.js`, `js/cotizador/proceso.js`, `js/mod/cotizador.js`, `js/nucleo/asistente.js`, `js/mod/ajustes.js`, `verificar.html` y las tres CSP (`js/nucleo/puerta.js` sí está). `js/datos/sync.js` figura en el plan como «bandeja → Supabase», pero hoy su interfaz `AdaptadorSync` ya está pensada para enchufar otro relevo sin tocarlo (sync.js:4-8, 100-123).
6. Plan §4.2: «Fabricación: etapa hasta Listo; Pagos: no mueve la etapa». Hoy es solo cliente (`TOPE_ROL`); el servidor no lo impone (§6). No es «pasar a la base lo que ya hay»: es regla nueva a imponer.
7. Plan §1/§5 fase 3: «Pagos y Dirección dejan de editar en la hoja … pasan a capturar solo en la plataforma… las mismas acciones». La plataforma NO tiene hoy captura de `Liquidacion`, `Abono Comision`, `Fecha Liquidacion`, registrar cobro, ni reparto FIFO de abonos (puente.js:284-286; solo existen como menús/diálogos del .gs). Faltaría construirlos antes de apagar la edición en la hoja.
8. Plan §3.1 («`ventas_hoja` … No se migra»; «Hoja Ventas → `proyectos` + `ventas_dinero`»): `ventas_hoja` alimenta Control con las 199 filas históricas que NO son proyectos. Si no se migran a `proyectos`/`ventas_dinero`, Control pierde su récord de vendidas.
9. Plan §4.7: `proyectos(..., sellos, …)`. Falta `instalaciones` con sello propio: hoy la cita sella con `actualizado_en`/`sello_hoja` (con el defecto de §4.5) y solo viajan `fecha` y `hora`; `uid_ics`/`movida`/`estado` no viajan (el plan dice que «viajan en `instalaciones`»: sería una tabla, no una columna de la hoja; ahí sí viajarían).
10. Plan §3.1 asigna a `proyectos` el dinero en una tabla aparte, pero el cliente asume dinero en el mismo objeto `proyecto` (`sub, neto, anti_pactado, pago_pendiente, …`) y fabricación debe seguir viendo un proyecto sin esas llaves. El traductor del transporte debe fusionar `ventas_dinero` en el proyecto local (o los módulos que leen `p.sub` cambian).

---------------------------------------------------------------------------------------------------

## 10. NO CONFIRMADO / preguntas abiertas

1. NO CONFIRMADO en ejecución: el defecto de `sello_hoja_en` (§4.5). Lo establece la lectura de db.js:230 + sync.js:808-814 + puente.js:807; no corrí nada.
2. NO CONFIRMADO: qué sellos genera `agenda.js` en `agendar` (nuevo) — usa `actualizado_en: ahora` y `DB.poner` re-sella; asumo que `selloDeInstalacion` = el `actualizado_en` guardado = hora de escritura local.
3. NO CONFIRMADO: contenido completo de `pruebas/puente-hoja.mjs` (solo índice y cabecera) y de `pruebas/navegador/dos-telefonos.mjs`; no los necesité para los contratos.
4. Decisión pendiente (plan): ¿el sello de grupo viaja como `jsonb` en `proyectos.sellos` con claves de GRUPO (`etapa`,`notas`,`plazo_k`,`tel`,`dir_texto`,`ubicacion`,`entrega`) y `instalaciones.sello`? Recomendado: sí, usando los nombres de grupo para no traducir a columnas.
5. Decisión pendiente: ¿la compuerta de subir se hace con una RPC `empujar_proyecto(jsonb)` (SECURITY INVOKER + RLS) o con un trigger BEFORE UPDATE que compare `NEW`/`OLD` y los sellos de la fila? Con trigger, un cliente directo no puede saltarse la regla.
6. Decisión pendiente: reloj. Los sellos son del reloj del teléfono con tope `ahora+10 min` (ahora en el .gs); en SQL equivaldría a `least(sello, extract(epoch from now())*1000 + 600000)`.
7. ¿`etapa`/`entrega` seguirán sin poder vaciarse (`borrable=false`)? Es regla del cliente de hoy; en Supabase serían NOT NULL.
8. ¿Se conserva `ubicacion` como cadena `'lat,lng'` en la regla o pasa a `lat`,`lng`,`maps_url`,`geo_fuente` separados (el sello sigue siendo un solo grupo `ubicacion`)? `obraDeLaFila` espera `venta.ubicacion` string y usa `ubicacionDeHoja`/`parseGmaps`; el traductor puede reconstruirla. Nota: hoy `geo_fuente` no viaja y lo que baja de la hoja siempre queda `maps_pin` (parseGmaps de «lat,lng» es `exacta:true`).
9. ¿Qué pasa con la bajada incremental? Hoy `/jalar` es snapshot completo + borrado por barrido (`ESPEJOS`); con Supabase hace falta delta (por `updated_at`/secuencia) y tombstones, o seguir con snapshot por empresa. El almacén ya usa secuencia + barrido semanal.
10. ¿Se retira `Prefs.puente().token` (dispositivo)? El plan lo retira en fase 5; `cotizador/venta.js` y `notario.js` dependen de él mientras tanto (`puenteCfg` exige `c.token`).

---------------------------------------------------------------------------------------------------

## 11. Índice rápido de archivos y líneas citados

- `js/datos/puente.js`: vocabulario 78-230; mapeos 311-698; instalación 731-824; versión 881-916; red 922-1067; relevo `crear` 1086-2067 (subirAlmacen 1189, bajarAlmacen 1258, subir 1485, bajar 1710, despuesDeBajar 2046); helpers 2075-2137; instrucciones 2151; desdePrefs 2184.
- `js/datos/sync.js`: contrato 43-123; encolar 293; bombear 482-707; jalar 738-876; fusionar 909; frescura 990.
- `js/datos/proyectos.js`: desdeVentaDeHoja 440; SELLO_DE_CAMPO/sellar 529-540; armarProyecto 545; ESCRIBIBLES/CAMPOS_ROL 954-995; actualizar 1011; TOPE_ROL/puedeMover 1116-1127; avanzarEtapa 1223; ataLaFila 1611; sumarSinMandar 1650; revisarContraLaHoja 1949.
- `js/datos/db.js`: ESQUEMA 60-84; poner 213 (re-sello 230).
- `js/datos/prefs.js`: URL_PUENTE 83; rol 174; puente 278; hayPuente 294; pase 314.
- `js/datos/agenda.js`: encolar 52; agendar 278; reagendar 329; marcar 395.
- `js/app.js`: enchufarPuente 1897; MS_SINCRONIZAR 1921; sincronizarDeVerdad 2030.
- `js/nucleo/puerta.js`: confirmarDeVerdad 348; reconfirmar 419; preguntarALaHoja 444.
- `js/cotizador/venta.js`: puenteCfg 299; puentePost 314; datosParaLaHoja 350; mandarALaHoja 393. `js/cotizador/notario.js`: hablarHoja 59; _postHoja 70.
- `puente/hoja-apps-script.gs`: COL 1915; PUENTE_VERSION 1881; SELLADAS 2019; sellos helpers 2021-2063; PUENTE_ROLES 2120; CAMPOS_DE_DINERO 2149; doPost 2174; rutaSalud_ 2452; rutaJalar_ 2500; aplanarFila 2527; rutaEmpujar_ 2676; unaOperacion 2705; compuerta de sellos 2881-2917; armarCeldas 2955; alEditar 1073; almacén 5240-5781.
- `puente/README.md`: «Quién gana» 395-480.
- Pruebas que fijan contratos: `pruebas/sincronizacion.mjs` (regla de sellos), `pruebas/puente.mjs` (mapeos, coherencia con el .gs, versión, relevo contra puente de mentiras 429-502).
