# Mapa 01 · Rutas, roles y seguridad del puente (Apps Script)

Alcance: `puente/hoja-apps-script.gs` leído ENTERO (5913 líneas) más lo del cliente que lo confirma
(`js/datos/puente.js`, `js/datos/proyectos.js`, `js/nucleo/ingreso.js`, `js/nucleo/puerta.js`,
`js/cotizador/notario.js`, `js/cotizador/ia.js`, `js/nucleo/asistente.js`, `verificar.html`) y
`puente/README.md` / `DESPLIEGUE.md`. Repo: `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase`.

Convención: `GS:n` = `puente/hoja-apps-script.gs` línea n. Todo lo de abajo es lo que el CÓDIGO hace hoy,
no lo que dice el plan. Las recomendaciones están marcadas como tales.

---

## 0. Forma general del puente

- Un solo Web App de Apps Script, desplegado «Ejecutar como: Yo» y «Quién tiene acceso: Cualquier usuario»
  (`puente/DESPLIEGUE.md:39-42`). URL de fábrica en `js/datos/prefs.js:83-84` (pública, repo público).
- **Todo es POST**. `doGet` contesta `{ok:false,codigo:'DATO_INVALIDO',mensaje:'Este puente solo atiende POST.'}` (GS:2167-2172).
  Motivo: Apps Script no contesta preflight de CORS; el token no debe ir en URL (GS:1808-1819).
- El cliente manda `Content-Type: text/plain;charset=utf-8` con cuerpo JSON y `redirect:'follow'` (`js/datos/puente.js:1008-1016`).
  La ruta va DENTRO del cuerpo: `{"ruta":"jalar", ...}` y, a propósito, como PRIMERA llave (`puente.js:997-999`).
  (`e.pathInfo` también se acepta, GS:2210, pero el cliente no lo usa: en POST la plataforma da 404, `puente.js:1005-1007`.)
- **HTTP siempre 200**; el error va dentro: `{ok:false, codigo, mensaje, ...}`. El cliente traduce `codigo==='ROL_SIN_PERMISO'`
  a «401» (`puente.js:1039-1045`).
- `doPost` está envuelto en try/catch: cualquier excepción devuelve `{ok:false,codigo:'DESCONOCIDO',mensaje:'El puente falló procesando eso.'}`
  y el detalle va a `console.error` (GS:2265-2270).
- Códigos de error que el servidor emite (todos en GS): `DATO_INVALIDO`, `SIN_RED`, `ROL_SIN_PERMISO`, `NO_ENCONTRADO`, `DESCONOCIDO`,
  `ESPERA_REALINEAR` (GS:2776), `CATALOGO_DESINCRONIZADO` (GS:3799), `SIN_LLAVE` (GS:4292), `CUPO_AGOTADO` (GS:4297),
  `PROVEEDOR` (GS:4260,4304), `VACIO` (GS:4247). El servidor NUNCA emite `CONFLICTO` (el cliente lo menciona, `puente.js:1678`; NO existe en el .gs: grep vacío).
  Del lado cliente, `DEFINITIVOS = ['ROL_SIN_PERMISO','NO_ENCONTRADO','DATO_INVALIDO']` (`puente.js:1190,1506`): esos tres hacen que la bandeja
  APARTE la operación (estado `rechazada`) en vez de reintentarla; `SIN_RED`/`DESCONOCIDO` se reintentan.
  `HOJA_VIEJA` es solo del cliente: lo fabrica cuando el servidor dice `NO_ENCONTRADO` con mensaje que cumpla `/camino desconocido/i` (`puente.js:1456,1472`),
  es decir DEPENDE del texto exacto `'Camino desconocido.'` (GS:2264).

---

## 1. Tabla de rutas (doPost, GS:2174-2271)

Orden real de despacho: (a) tope de tamaño → (b) parse JSON → (c) ruta → (d) `/verificar` (pública) → (e) puertas (Google, luego token) →
(f) cupo 60/min → (g) `if (ruta === ...)`. Ruta no reconocida → `{ok:false,codigo:'NO_ENCONTRADO',mensaje:'Camino desconocido.'}` (GS:2264). Ruta vacía → `'salud'` (GS:2210-2211).

| Ruta | Quién (rol) | Cuerpo (campos que lee) | Respuesta ok | Errores propios | Función / líneas | Destino en el plan |
|---|---|---|---|---|---|---|
| (GET) | nadie | — | — | `DATO_INVALIDO` «Este puente solo atiende POST.» | `doGet` GS:2167 | se retira |
| `salud` | cualquier rol (Google o token) | — | `{ok,ts:Date.now(),version:'puente-sheets-14',rol,escribibles:PUENTE_ROLES[rol],destino:'google-sheets',via:'google'\|'token',correo,ia:{qwen:bool,deepseek:bool,gemini:bool}}` | `NO_ENCONTRADO` si no hay pestaña «Ventas» | `rutaSalud_` GS:2452-2462 | Edge Function `salud` o se quita (ver §12.4) |
| `esquema` | cualquier rol | — | `{ok,faltan:[{nombre,tipo,para,opciones?}],accesos:bool,cliente:bool,nota}` (detecta, no crea) | — | `rutaEsquema_` GS:2465-2497 | sin equivalente (es del esquema de la hoja) |
| `jalar` | cualquier rol | `cursor` (opcional, fila inicial, default 2) | `{ok,registros:[{almacen:'proyectos',datos:<fila aplanada>}],cursor:string\|null,hay_mas:bool}`; TODA la hoja en una página (FIN=310 → 309 filas); salta filas sin «Proyecto»; pasa por `sinLoQueNoLeToca` | — | `rutaJalar_` GS:2500-2525, `aplanarFila` GS:2527-2587 | cliente Supabase + RLS + Realtime |
| `empujar` | cualquier rol, con lista blanca por rol | `ops:[…]` (se cortan a 25). Cada op: `{id, id_notion?, folio_cotizacion?, datos:{<nombre de columna>:valor}, sellos?:{<nombre>:ms}}`. `op.tipo` se IGNORA (lo manda el cliente: `'actualizar'\|'crear'`, `puente.js:1638`); alta vs cambio la decide la presencia de `id_notion` (GS:2761-2794) | `{ok:true,resultados:[{id,ok:true,creada,remoto:<fila filtrada por rol>,rechazadas:[{nombre,por,sinColumna?}],viejos:[{nombre,por}]} \| {id,ok:false,codigo,mensaje,motivo?,rechazadas}]}` | top-level `SIN_RED` si no consigue el candado en 20 s (GS:2680-2684); por op: `DATO_INVALIDO` (sin id; «no se dio»), `ROL_SIN_PERMISO` (nada escribible), `NO_ENCONTRADO` (+`motivo:'borrada'\|'de_otra'`), `ESPERA_REALINEAR`, `DESCONOCIDO` (sin filas libres / abono sin lugar) | `rutaEmpujar_` GS:2676-2703, `unaOperacion` GS:2705-2948, `armarCeldas` GS:2955-3069 | cliente Supabase + RLS (ver §9) |
| `expandir` | cualquier rol | `u` (liga) | `{ok:true,url:<Location o la misma>}` | `DATO_INVALIDO` «Solo se siguen ligas de Google Maps.»; `SIN_RED` «No se pudo seguir la liga.» | `rutaExpandir_` GS:3157, `expandirLiga_` GS:3164-3179 | Edge Function `maps` (ver §7: la lista tiene un hueco) |
| `solicitar` | cualquier rol (también fabricación) | `folio` (formato `COT-0042@K7QM`), `cotizacion:{proyecto,cliente,iva,subtotal,items[]}`, `nota` (≤500) | `{ok:true,estado:'pendiente'}` | `DATO_INVALIDO` (folio / cotización), `CATALOGO_DESINCRONIZADO` (+`subtotal_hoja`), `ROL_SIN_PERMISO` (pendiente de OTRA identidad, salvo dirección), `SIN_RED` (candado) | `rutaSolicitar_` GS:3769-3797 | RPC / Edge (ver §10) |
| `cancelar` | quien la pidió, o dirección | `folio` | `{ok:true,estado:'cancelada'\|null}` (null = no había viva) | `DATO_INVALIDO`, `ROL_SIN_PERMISO` («Esa solicitud la hizo otra persona…») | `rutaCancelarSolicitud_` GS:3808-3823 | RPC |
| `pendientes` | solo `rol==='direccion'` (Google O token) | — | `{ok,solicitudes:[{folio,cuando:ms\|null,solicito,nota,cotizacion}]}` (≤50, más nuevas primero, solo `pendiente` con JSON legible) | `ROL_SIN_PERMISO` «La cola de autorizaciones es de Dirección.» | `rutaPendientes_` GS:3826-3842 | RPC / vista + Realtime |
| `estado` | cualquier rol; cada quien solo lo SUYO, dirección todo | `folios:[…]` (≤20; los que no cumplen `folioValido` se omiten) | `{ok,folios:{<folio>:{estado:'autorizada'\|'pendiente'\|'rechazada'\|'cancelada'\|null,sello:{…}\|null,resolvio,nota}}}` | — | `rutaEstado_` GS:3877-3902, `selloDeLaSolicitud` GS:3866-3876 | RPC |
| `autorizar` | SOLO dirección entrando CON GOOGLE (el token de dispositivo NO basta) | `folio`, `cotizacion`, `precioAuth` (neto, 0..1e9), `itemsAuth:{idPartida:importe}`, `nota` (≤500) | `{ok:true,sello:{codigo,correo,ts,huella,subCalc,precioAuth,itemsAuth,total,nota,renglones:[{descripcion,cantidad,importe}]}, repetida?:true}` | `ROL_SIN_PERMISO`, `DATO_INVALIDO` (folio, cotización en $0, precio, ajuste), `CATALOGO_DESINCRONIZADO`, `SIN_RED` | `rutaAutorizar_` GS:3905-3976 | RPC / Edge (ver §10, §13) |
| `rechazar` | solo dirección con Google | `folio`, `nota` | `{ok:true,estado:'rechazada'}` | `ROL_SIN_PERMISO`, `DATO_INVALIDO`, `NO_ENCONTRADO` «Esa solicitud ya no está pendiente.» | `rutaRechazar_` GS:3979-3992 | RPC |
| `revocar` | solo dirección con Google | `folio` | `{ok:true}` | `ROL_SIN_PERMISO`, `DATO_INVALIDO`, `NO_ENCONTRADO` «Ese folio no tiene una autorización vigente.» | `rutaRevocar_` GS:3997-4004, `revocarAutorizacion` GS:4007 | RPC |
| `verificar` | **PÚBLICA** (sin token ni Google; va ANTES de las puertas, GS:2218-2220) | `f` (folio impreso, con o sin `@aparato`), `c` (código 12 hex) | `{ok:true,estado:'autentica'\|'superada'\|'revocada'\|'no_autentica',folio,fecha:'dd/MM/yyyy',total,proyecto,renglones:[…]\|null}` (en `no_autentica` solo `{ok:true,estado:'no_autentica'}`) | `SIN_RED` «Demasiadas consultas seguidas…» | `rutaVerificar_` GS:4023-4055 | Edge Function pública (ver §10.4) |
| `ia` | cualquier rol | ver §6 | `{ok:true,texto,prov,model}` | ver §6 | `rutaIA_` GS:4283-4313 | Edge Function `ia` |
| `empujar_almacen` | dirección y fabricación; pagos solo lo derivado (§4.5) | `ops:[…]` (≤25 = `ALM_OPS_MAX`), op: `{id, almacen:'movimientos'\|'materiales'\|'requerimientos', datos, campos?, ...}` | `{ok:true,resultados:[{id,ok,creada?,ya_estaba?,sin_cambio?,viejos?}\|{id,ok:false,codigo,mensaje}],secuencia}` | `SIN_RED` (candado 20 s), por op `DATO_INVALIDO`/`ROL_SIN_PERMISO`/`DESCONOCIDO` | `rutaEmpujarAlmacen_` GS:5597-5630, `almUnaOperacion_` GS:5643-5743 | cliente Supabase + RLS (otro mapa) |
| `jalar_almacen` | cualquier rol (costos solo a quien ve dinero) | `desde` (secuencia, ≥0) | `{ok,registros:[{almacen,datos}],hasta,hay_mas}` (páginas de 1500) | `SIN_RED` (tryLock 10 s) | `rutaJalarAlmacen_` GS:5752-5781 | Realtime |
| `carpetas` | cualquier rol (sin filtro) | — | `{ok:true,ts,raiz:url,carpetas:[{id,nombre,url,modificado:ms,archivos:[{nombre,url,tipo,modificado}]}]}` | `NO_ENCONTRADO` (+`detalle`) | `rutaCarpetas_` GS:5837-5857 | se queda en Apps Script (ver §8) |
| `crear_carpeta` | solo `rol==='direccion'` (Google O token) | `nombre` | `{ok:true,creada:bool,carpeta:{id,nombre,url,modificado,archivos}}` | `ROL_SIN_PERMISO`, `DATO_INVALIDO`, `NO_ENCONTRADO`, y `conCandado` LANZA si no consigue candado (cae al catch → `DESCONOCIDO`) | `rutaCrearCarpeta_` GS:5879-5899 | se queda en Apps Script |

Notas por ruta:
- `empujar`: tras escribir corre `anotar_` (bitácora) y luego `normalizarIvaActivos(h); ordenarVentas(h)` dentro de try (un fallo ahí no tumba la escritura, GS:2696-2698).
  **Regla de negocio escondida**: cada `/empujar` reescribe «IVA» (col F) de todas las filas no LIQUIDADO según la cuenta: cuenta `Elias BBVA` → `No`, cualquier otra cuenta no vacía → `Sí`
  (`CUENTA_SIN_FACTURA` GS:935, `normalizarIvaActivos` GS:1057-1067). El IVA que mande el teléfono se pisa.
- `jalar`: un `cursor` solo se acepta si es número ≥2 (GS:2501-2503); como `tam=FIN-1`, en la práctica siempre responde `hay_mas:false`, `cursor:null`.
- `salud.ia` es lo que usan `js/nucleo/asistente.js:55` y `js/cotizador/ia.js:152` para saber qué proveedores tienen llave («sí o no»; la llave no sale).
- `crear_carpeta` y `carpetas` pasan por las mismas puertas y el mismo cupo que el resto (no hay ruta alterna).

---

## 2. Autenticación y límites (doPost, GS:2216-2264, 2281-2430)

### 2.1 Orden de decisión

1. `/verificar` → pública, antes de todo (GS:2218).
2. `gtok = cuerpo.google_token`, `token = cuerpo.token` (GS:2228-2229). Van las dos en la misma petición (el cliente las manda juntas, `puente.js:1000-1001`).
3. `ingreso = gtok ? identidadDelIngreso(gtok) : null`; `rol = ingreso ? ingreso.rol : rolDelToken(token)` (GS:2230-2231).
   **Si el token de Google no da rol, se CAE al token de dispositivo** (si viene y es válido): `via:'token'`. La identidad manda cuando existe; el token es reserva.
4. Sin rol → `{ok:false,codigo:'ROL_SIN_PERMISO',mensaje: gtok ? 'Entraste con Google, pero ese correo no está en la pestaña «Accesos» de la hoja. Pídele a Dirección que te agregue.' : 'Este teléfono no tiene un token válido del puente. Pégalo otra vez en Ajustes.'}` (GS:2232-2237).
5. Cupo: `dentroDelLimite(ingreso ? 'g:'+correo : token)` → si excede `{ok:false,codigo:'SIN_RED',mensaje:'Demasiadas peticiones seguidas desde este teléfono. Espera un minuto.'}` (GS:2241-2244).

### 2.2 Token de dispositivo (`PUENTE_TOKENS`)

- Propiedad `PUENTE_TOKENS` = JSON `{ "<token>": "<rol>" }`, tres entradas (una por rol `direccion`,`fabricacion`,`pagos`) (`configurarTokensDelPuente_` GS:2440-2449).
- Token = `Utilities.getUuid() + Utilities.getUuid().slice(0,8)` (36+8 = 44 caracteres).
- `rolDelToken(token)` (GS:2281-2289): rechaza si `!token || token.length < 30`; JSON.parse del mapa; `hasOwnProperty`; el rol debe existir en `PUENTE_ROLES`.
- El token decide solo el ROL; NO identifica persona. `quienSoy(rol,ingreso)` = correo, o `'token de <rol>'` (GS:3747): las solicitudes de quien entra con token se firman «token de pagos», etc.
- Se crea/rota desde el menú «Tokens del puente» (`dialogoTokens` GS:1747-1787; «Generar tokens nuevos» → `rotarTokensDelPuente` GS:2439, que no devuelve nada; el nombre termina en `_` en `configurarTokensDelPuente_` para que `google.script.run` no pueda llamarla y leer secretos).
- El token de dispositivo SIGUE aceptándose en TODAS las rutas salvo `/autorizar`, `/rechazar`, `/revocar` (que exigen Google, `soloDireccionConGoogle` GS:3748-3754).
  `pendientes` y `crear_carpeta` aceptan token con rol dirección (solo miran `rol`).
- Cliente: el token vive en `localStorage` (`al3d_pf_puente`: `{url,token}`; `puente.js`/`prefs.js`). Con Google puesto ya no hace falta pegarlo (`puente.js:1088-1101`).

### 2.3 Google: es un ACCESS token verificado con `tokeninfo` (NO un ID token)

- Cliente: `google.accounts.oauth2.initTokenClient({client_id, scope:'openid email'})` → `requestAccessToken` → `resp.access_token`, dura `expires_in` (~3600 s, se descuentan 60 s), se guarda en `localStorage` bajo `al3d_pf_gtok` solo mientras vale (`js/nucleo/ingreso.js:33, 55, 127-137, 234-276`). Aparte pide `https://www.googleapis.com/oauth2/v3/userinfo` solo para mostrar el correo (`ingreso.js:302-311`).
- Servidor, `identidadDelIngreso(tok)` (GS:2305-2360):
  1. Si `!tok || tok.length < 20 || !PUENTE_CLIENT_IDS.length` → `null`.
  2. Caché `CacheService.getScriptCache()` con clave `'ing_' + base64WebSafe(SHA-256(tok))` (no se guarda el token). Valor `'correo|rol'` o `'-'`.
  3. Antes de preguntar a Google: si `cache['ing_fallos'] >= 5` → `null`; si `contarEnVentana(cache,'ing_min',60) > 120` → `null` (tope global de verificaciones no cacheadas por minuto).
  4. `UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(tok), {muteHttpExceptions:true})`.
     - 200: exige `PUENTE_CLIENT_IDS.indexOf(String(j.aud)) !== -1` **y** `String(j.email_verified) === 'true'`; correo = `String(j.email).trim().toLowerCase()`.
     - 400/401: «no» definitivo. 429 o ≥500: se cuenta `ing_fallos` (TTL 15 s) y NO se guarda el «no».
     - Excepción de red: `null` (**falla cerrado**: «fallar abierto sería dejar la puerta sin llave cuando falla la llave», GS:2349-2351).
  5. `rol = rolDelCorreo(correo)`; caché: **sí → 300 s, no → 60 s** (GS:2358). Un «no» solo se cachea si fue definitivo (GS:2353).
  6. Consecuencia: quitar a alguien de «Accesos» surte efecto en ≤5 min (por el TTL de 300 s).
- `PUENTE_CLIENT_IDS` (GS:1898-1901), constante pública (no secreto):
  `['1057893837924-3np1vkcbpqmkh6sio0ktse00kd9b5ulr.apps.googleusercontent.com']` (el mismo `CLIENT_ID` de `js/nucleo/ingreso.js:84-85`). Lista vacía = Google apagado, solo tokens. Orígenes autorizados en Google: `https://eliasgaribi-ctrl-z.github.io` y `https://cotizador-al3d.pages.dev` (`ingreso.js:98-99`).
- Rol por correo: pestaña «Accesos» (`HOJA_ACCESOS`, GS:1909): fila 1 = `['Correo','Rol','Nota']`; datos desde la fila 2; compara `String(A).trim().toLowerCase()` con el correo; rol = `String(B).trim().toLowerCase()`, válido solo si `PUENTE_ROLES[rol]` (GS:2363-2375). Validación de datos de col B: lista `direccion, fabricacion, pagos` (GS:2387-2390). `crearHojaAccesos` (GS:2379-2398) siembra el dueño (`Session.getEffectiveUser().getEmail()`) como `direccion` en la fila 2 y deja un texto de ayuda en **A4** (un importador debe SALTAR filas cuya A no sea un correo o cuya B no sea un rol válido). Sin pestaña → nadie entra por Google.
- Detalle de puerta del cliente (`puerta.js`): el pase vive en el aparato; entra YA con pase y confirma por detrás con `/salud`; `ROL_SIN_PERMISO` en `/salud` ⇒ «fuera» ⇒ borra el pase y expulsa (`puerta.js:201-232, 448-460`). El token de dispositivo NO rescata a quien salió de «Accesos» (`puerta.js:220-224`).

### 2.4 Versión y negociación

- Servidor: `PUENTE_VERSION = 'puente-sheets-14'` (GS:1881), solo se expone en `/salud.version`. **El servidor NO valida versión del cliente** (grep: ninguna lectura de `cuerpo.version` ni equivalente). No existe «versión mínima del cliente».
- Cliente decide solo: `VERSION_ESPERADA = 'puente-sheets-14'` (`puente.js:881`), `versionVieja()` = número < esperado; puertas por función: `VERSION_DEL_ALMACEN=9`, `VERSION_DEL_TELEFONO=11`, `VERSION_DE_LA_ENTREGA=12`, `VERSION_DE_LA_OBRA=14` (`puente.js:211,216,221,226`). `avisoVersion` solo pinta un aviso en Ajustes (`js/mod/ajustes.js:1481`).
- La única negociación «servidor rechaza cliente viejo» es de PRECIO: `/solicitar` y `/autorizar` recalculan el subtotal con la copia del catálogo del servidor y, si no cuadra con el del teléfono (±0.01), responden `CATALOGO_DESINCRONIZADO` con «Actualiza la app y vuelve a intentarlo» (`descuadre` GS:3798-3803).
- Las pruebas exigen `PUENTE_VERSION` del .gs == `VERSION_ESPERADA` (`pruebas/puente.mjs:342,354`; `pruebas/puente-almacen.mjs:326`).

### 2.5 Límites y cupos (todos en `CacheService`/`PropertiesService`/`LockService` del script)

| Qué | Valor | Clave / mecanismo | Líneas |
|---|---|---|---|
| Peticiones por persona | **60 por minuto** (`LIMITE_POR_MINUTO`), ventana FIJA de 60 s; clave = SHA-256(token) o SHA-256(`'g:'+correo`), 24 chars; si la caché falla → deja pasar | `dentroDelLimite` → `contarEnVentana(cache,'p_'+hash,60)` | GS:2164, 2412-2430 |
| Verificaciones de Google no cacheadas | >120 por minuto (global) → `null` (sin Google ese minuto) | `ing_min@<ventana>` | GS:2331 |
| Fallos 5xx/429 de Google | 5 seguidos → 15 s sin preguntar | `ing_fallos` (TTL 15 s) | GS:2330, 2346 |
| Tamaño del cuerpo | **65 536 caracteres** (no bytes) para todo | `crudo.length` | GS:2189-2201 |
| Tamaño del cuerpo en `/ia` | **15 MB** (`IA_MAX_CUERPO = 15*1024*1024`) solo si el texto EMPIEZA por `/^\s*\{\s*"ruta"\s*:\s*"ia"\s*,/` (primeros 80 chars) Y la ruta ya parseada es `'ia'` (si no: `DATO_INVALIDO` «El cuerpo es demasiado grande.») | doble comprobación | GS:2189-2214, 4126 |
| Cuerpos grandes (>64 KB) | **40 por minuto, entre todos** (`CUERPOS_GRANDES_POR_MINUTO`), `SIN_RED` «La hoja está recibiendo demasiados archivos a la vez…» | `contarEnVentana(cache,'grandes',60)` | GS:4130-4136, 2194-2196 |
| `/verificar` | **30 por folio corto / 10 min** (`VERIFICAR_POR_FOLIO`) y **400 en total / 10 min** (`VERIFICAR_EN_TOTAL`) | claves `v_<hash(folioCorto)>` y `v__total`, ventanas de 600 s | GS:4021-4022, 4079-4088 |
| IA por persona | **200 por día** (`IA_LIMITE_DIARIO`), día = fecha **GMT** (`yyyyMMdd`), se cuenta ANTES de llamar al proveedor | propiedad `IA_CUOTA_<yyyyMMdd>` = `{hash16(quien):n}`; borra las de días pasados | GS:4124, 4174-4193 |
| Candados | `/empujar`, `/empujar_almacen`, notario: `waitLock(20000)`; `/jalar_almacen`: `tryLock(10000)`; cupo IA: `tryLock(3000)`; formularios/`conCandado`: `tryLock(30000)` y LANZA; `alEditar`: `tryLock(25000)` y se rinde | `LockService.getScriptLock()` (UN candado para todo el script) | GS:2679-2684, 5603-5608, 5755-5758, 4176, 1191-1197, 1090-1091 |
| Cuota de Google | ~20 000 `UrlFetchApp` al día para toda la cuenta gratuita (comentario) | — | GS:4122-4123 |

`contarEnVentana(cache, base, segundos)` (GS:2412-2417): clave `base + '@' + floor(Date.now()/(segundos*1000))`, `put(clave, n, segundos)`. Ventana fija: en la frontera caben dos cupos.
El cupo de `dentroDelLimite` y el de IA cuentan por identidad: `'g:'+correo` (Google) o el token (dispositivo; UN token por rol ⇒ todos los teléfonos de un rol comparten cupo). IA usa `'g:'+correo` o `'t:'+token` (GS:2258).

---

## 3. Columnas de «Ventas» a las que se refiere todo lo de roles (copia exacta de `COL`, GS:1915-1960)

| Nombre de protocolo (exacto) | N.º | Letra | Nota |
|---|---|---|---|
| `Proyecto` | 2 | B | |
| `Estatus` | 3 | C | de DINERO (FABRICACION/REPARANDO/COBRANDO/LIQUIDADO) |
| `Cuenta ` (CON espacio final) | 4 | D | |
| `Tipo de trabajo` | 5 | E | |
| `IVA` | 6 | F | |
| `Precio Subtotal` | 7 | G | |
| `Precio Neto ` (CON espacio final) | 8 | H | fórmula |
| `Anticipo` | 9 | I | |
| `Liquidacion` | 10 | J | |
| `Pago Pendiente` | 11 | K | fórmula; positivo = te deben |
| `Fecha Anticipo e Instalacion` | 12 | L | en la hoja es la fecha de ANTICIPO |
| `Fecha instalacion` | 13 | M | |
| `Fecha Liquidacion` | 14 | N | |
| `Comisiones` | 18 | R | fórmula = ROUND(G*10%,2) |
| `Abono Comision` | 19 | S | fórmula (suma de «Abonos comisión»); escribirlo AGREGA renglón en esa pestaña |
| `Comision Restante` | 20 | T | fórmula |
| `Folio cotizacion` | 25 | Y | |
| `Etapa de obra` | 26 | Z | |
| `Hora instalacion` | 27 | AA | «HH:MM», texto |
| `Ubicacion` | 28 | AB | «lat,lng» |
| `Direccion` | 29 | AC | |
| `Porcentaje comision` | 30 | AD | viaja pero la fórmula R NO lo lee |
| `Telefono` | 31 | AE | |
| `Entrega` | 32 | AF | |
| `Notas` | 33 | AG | |
| `Plazo taller` | 34 | AH | |
| `Sellos` | 35 | AI | oculta; JSON `{nombre:ms}` |

`COL_FOLIO = 1` (A, id interno `V-001`), `ULTIMA_COL = 35`, `FIN = 310` (filas 2..310). Encabezados REALES de A..X (`HEAD`, GS:20-24):
`Folio, Proyecto, Estatus, Cuenta, Tipo de trabajo, IVA, Subtotal, Precio neto, Anticipo, Liquidación, Saldo por cobrar, Fecha anticipo, Fecha instalación, Fecha liquidación, Días de cobro, Días de antigüedad, Antigüedad, Comisión 10%, Abono comisión, Comisión pendiente, Pagos de comisión, Año, Mes, Revisar`.
Los nombres de protocolo NO son los encabezados (ej. protocolo `Cuenta ` vs encabezado `Cuenta`; `Fecha instalacion` vs `Fecha instalación`: `rutaEsquema_` los trata como equivalentes, GS:2484). Y/AB..AI tienen encabezado igual al nombre de protocolo (los escribe `prepararHojaParaElPuente`, GS:4672-4684).
Catálogos cerrados del servidor: `ESTATUS=['FABRICACION','REPARANDO','COBRANDO','LIQUIDADO']` (GS:37), `CUENTAS=['Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT']` (GS:29),
`ETAPAS_OBRA=['Ganado','En diseño','Cortado','Armado','Listo para instalar','Instalado','En garantía','No se dio']` (GS:2111-2112),
`TIPOS_TRABAJO=['Caja de luz con iluminacion','Caja de luz sin iluminacion','Letras 3D con iluminacion','Letras 3D sin iluminacion','Rotulacion de vinil','Recorte acrilico','Custome / Proyecto Especial']` (GS:2114-2116),
`ENTREGAS=['Instalación','Paquetería','Recolección en taller']` (GS:2072), `PLAZOS_TALLER=['1 semana','1.5 semanas','2 semanas','2.5 semanas','3 semanas o más']` (GS:1997).

---

## 4. Roles (copia EXACTA)

### 4.1 `PUENTE_ROLES` — lo que cada rol PUEDE ESCRIBIR en Ventas (GS:2120-2136)

```js
var PUENTE_ROLES = {
  direccion: ['Proyecto', 'Precio Subtotal', 'IVA', 'Anticipo', 'Liquidacion', 'Abono Comision',
              'Estatus', 'Cuenta ', 'Fecha Anticipo e Instalacion', 'Fecha Liquidacion',
              'Folio cotizacion', 'Etapa de obra', 'Fecha instalacion', 'Hora instalacion',
              'Ubicacion', 'Direccion', 'Tipo de trabajo', 'Porcentaje comision', 'Telefono',
              'Entrega', 'Notas', 'Plazo taller'],
  fabricacion: ['Etapa de obra', 'Fecha instalacion', 'Hora instalacion', 'Ubicacion', 'Direccion',
                'Telefono', 'Entrega', 'Notas', 'Plazo taller'],
  pagos: ['Anticipo', 'Liquidacion', 'Abono Comision', 'Estatus', 'Cuenta ', 'Fecha Liquidacion',
          'Porcentaje comision', 'Telefono', 'Notas']
};
```

Matriz equivalente (E = escribe):

| Campo | direccion | fabricacion | pagos |
|---|---|---|---|
| Proyecto, Precio Subtotal, IVA, Fecha Anticipo e Instalacion, Folio cotizacion, Tipo de trabajo | E | — | — |
| Anticipo, Liquidacion, Abono Comision, Estatus, Cuenta , Fecha Liquidacion, Porcentaje comision | E | — | E |
| Etapa de obra, Fecha instalacion, Hora instalacion, Ubicacion, Direccion | E | E | — |
| Entrega, Plazo taller | E | E | — |
| Telefono, Notas | E | E | E |
| Precio Neto , Pago Pendiente, Comisiones, Comision Restante, Fecha Comision | fórmulas: se RECHAZAN con razón (`PUENTE_FORMULAS` GS:2103-2109) | idem | idem |

- Un rol que no está en la tabla escribe `[]` (default cerrado, GS:2957). `rolDelToken` y `rolDelCorreo` exigen `PUENTE_ROLES[rol]`.
- `/salud.escribibles` devuelve el arreglo del rol tal cual (GS:2456); el cliente filtra lo que manda contra él (`puente.js:1390, 1600-1608`).

### 4.2 Lo que cada rol puede LEER: `CAMPOS_DE_DINERO`, `VE_EL_DINERO` y `sinLoQueNoLeToca`

```js
var CAMPOS_DE_DINERO = ['Precio Subtotal', 'Precio Neto ', 'Anticipo', 'Liquidacion',
                        'Pago Pendiente', 'Comisiones', 'Abono Comision',
                        'Comision Restante', 'Cuenta ', 'Fecha Liquidacion',
                        'Porcentaje comision'];                       // GS:2149-2152  (11 nombres; el README dice «diez»)
var VE_EL_DINERO = { direccion: true, pagos: true, fabricacion: false };   // GS:2153

function sinLoQueNoLeToca(fila, rol) {                                // GS:2590-2594
  if (VE_EL_DINERO[rol]) return fila;
  CAMPOS_DE_DINERO.forEach(function (c) { delete fila[c]; });
  return fila;
}
```

- Se aplica DESPUÉS de leer (la fila ya está armada) y en **dos** sitios: cada registro de `/jalar` (GS:2520) y el `remoto` de cada operación de `/empujar` (GS:2914, 2946). Rol no listado ⇒ `VE_EL_DINERO[rol]` es `undefined` ⇒ se le quita el dinero (cerrado).
- A **fabricación** le llegan: `id_notion`, `editado`, `Proyecto`, `Estatus`, `Tipo de trabajo`, `IVA`, `Fecha Anticipo e Instalacion`, `Fecha instalacion`, `Folio cotizacion`, `Etapa de obra`, `Hora instalacion`, `Ubicacion`, `Direccion`, y (si la hoja tiene las columnas) `Telefono`, `Entrega`, `Notas`, `Plazo taller`, `Sellos`.
  - `Estatus` baja a propósito: «es una etiqueta de estado, no una cifra, y el tablero de obra la usa para saber qué ya se cobró y se puede cerrar» (GS:2147-2148).
  - `IVA` (booleano) y `Fecha Anticipo e Instalacion` (fecha del anticipo) NO están en `CAMPOS_DE_DINERO`: bajan a fabricación hoy.
- Dirección y pagos reciben todo (README lo admite: «Dirección y pagos sí ven todo el dinero», `puente/README.md:615-617`).
- Almacén: `CAMPOS_DE_DINERO_ALMACEN = ['costo_total','costo_compra']` (GS:5263), quitados con `VE_EL_DINERO[rol]` en lectura (`almRegistro_` GS:5512) y no escritos por quien no ve dinero (GS:5694).

### 4.3 `CAMPOS_ROL` y `TOPE_ROL` — viven en el CLIENTE, no en el .gs (`js/datos/proyectos.js`)

```js
const ESCRIBIBLES = new Set([                                        // proyectos.js:954-959
  'nombre', 'contacto', 'negocio', 'tel', 'notas', 'tipo_trabajo', 'compromiso_texto',
  'dir_texto', 'entrecalles', 'maps_url', 'lat', 'lng', 'geo_fuente', 'anti_pactado',
  'cuenta', 'estatus_notion', 'notion_page_id', 'notion_estado', 'pct_comision',
  'fecha_ganado', 'plazo_k', 'entrega', 'sync',
]);

const CAMPOS_ROL = {                                                 // proyectos.js:982-995
  direccion: null,   // todo lo escribible
  fabricacion: new Set(['notas', 'lat', 'lng', 'geo_fuente', 'maps_url', 'entrecalles', 'plazo_k',
                        'entrega', 'tel', 'dir_texto', 'sync']),
  pagos: new Set(['notas', 'cuenta', 'estatus_notion', 'notion_page_id', 'notion_estado',
                  'pct_comision', 'tel', 'sync']),
};

const TOPE_ROL = { direccion: null, fabricacion: 'listo', pagos: false };   // proyectos.js:1116
export const ORDEN = { ganado: 0, en_diseno: 1, cortado: 2, armado: 3, listo: 4, instalado: 5 };  // proyectos.js:120
// puedeMover(rol, etapa) (proyectos.js:1121-1127): tope===null/undefined => true; tope===false => false;
//   si no: ORDEN[etapa] <= ORDEN[tope]  (garantía y cancelado NO tienen ORDEN => fabricación NO puede marcarlas)
// ETAPAS = ['ganado','en_diseno','cortado','armado','listo','instalado','garantia','cancelado']  (proyectos.js:90-91)
```

Mensajes de rechazo del cliente: `actualizar` → `ROL_SIN_PERMISO` «Con el rol de X no se cambia «k». Cámbialo desde el dispositivo de Dirección.» (proyectos.js:1027-1030); `avanzarEtapa` → `ROL_SIN_PERMISO` (proyectos.js:1242-1243); solo dirección decide si una cotización «se dio» (proyectos.js:742) y resuelve pérdidas de fila (proyectos.js:2214).
El propio código dice: «No es seguridad —en fase 1 cualquiera cambia su rol— es ruido» (proyectos.js:980-981).

### 4.4 Correspondencia cliente ↔ servidor (y dónde NO coinciden)

| Campo del cliente | Columna servidor | direccion | fabricacion | pagos |
|---|---|---|---|---|
| `notas` | Notas | sí | sí | sí |
| `tel` | Telefono | sí | sí | sí |
| `lat`,`lng` | Ubicacion («lat,lng») | sí | sí | no |
| `dir_texto` | Direccion | sí | sí | no |
| `entrega` | Entrega | sí | sí | no |
| `plazo_k` | Plazo taller | sí | sí | no |
| `cuenta` | `Cuenta ` | sí | no | sí |
| `estatus_notion` | Estatus | sí | no | sí |
| `pct_comision` | Porcentaje comision | sí | no | sí |
| `anti_pactado` | Anticipo | sí | no (cliente) | no (cliente) — **pero el servidor SÍ deja a pagos escribir `Anticipo` y `Liquidacion`** |
| etapa (por `avanzarEtapa`) | Etapa de obra | todas | cliente: hasta `listo`; **servidor: cualquiera de las 8** | cliente: nunca; servidor: no está en su lista |

**El tope `listo` de fabricación NO existe en el servidor**: `PUENTE_ROLES.fabricacion` incluye `'Etapa de obra'` y `armarCeldas` solo valida que el valor esté en `ETAPAS_OBRA` (GS:2992-2994). Hoy un token de fabricación puede escribir «Instalado», «En garantía» o «No se dio».

### 4.5 Permisos del almacén (`almPermiso_`, GS:5537-5553)

- `PUENTE_ROLES[rol]` debe existir, si no: «ese rol no existe».
- direccion y fabricacion: todo (movimientos, catálogo, listas), pero fabricación no escribe `costo_total`/`costo_compra` (GS:5694) ni los recibe.
- pagos: `movimientos` solo si `d.origen==='derivado' && d.tipo==='salida'`; `requerimientos` solo si TODOS los `campos` son `estado`/`folio_hoja` y `d.estado==='consumido'`; `materiales` nunca.
- Resto de reglas del almacén (vocabularios `ALM_*`, signo por tipo, estados que no retroceden `almEstadoAdmite_`, sello por campo) están en GS:5240-5594 (las cubre otro mapa).

### 4.6 Reglas de notario por rol/identidad

- `soloDireccionConGoogle` (GS:3748): solo `ingreso && ingreso.rol==='direccion'`; mensajes distintos si entró con Google con otro rol o con token.
- `solicitar`: cualquier rol; `cancelar`: solicitante o dirección; `estado`: solicitante (misma identidad `quienSoy`) o dirección; `pendientes`: `rol==='direccion'`.

---

## 5. Propiedades del script (`PropertiesService.getScriptProperties()`) y caché

| Propiedad | Contenido | Quién la escribe | Quién la lee | Líneas |
|---|---|---|---|---|
| `PUENTE_TOKENS` | `{token:rol}` (3) | `configurarTokensDelPuente_` (menú «Tokens del puente») | `rolDelToken`, `dialogoTokens` | GS:2283, 2447, 1749 |
| `SELLO_AUTORIZACION` (`PROP_SECRETO`) | clave HMAC = `UUID+UUID+UUID` (108 chars con guiones), se CREA sola en la primera autorización o con `configurarAutorizaciones` | `secretoDelSello_(true)` | `/autorizar` (crear), `/verificar` (`secretoDelSello_(false)`: si falta ⇒ `no_autentica`) | GS:3334, 3657-3665, 4033, 4092 |
| `IA_KEYS` | `{qwen:[k…],deepseek:[…],gemini:[…]}`; cada llave string ≥10 chars; al guardar se aceptan hasta 4 por proveedor (`IA_MAX_LLAVES`) | `guardarLlavesIA` (menú «Llaves de IA») | `iaLlaves_` | GS:4141-4147, 4339-4352 |
| `IA_ROTACION` | `{prov:índice}` turno de llaves | `iaOrdenDeLlaves_` (sin candado a propósito) | idem | GS:4155-4165 |
| `IA_CUOTA_<yyyyMMdd>` (GMT) | `{hash16(quien):n}`; se borran las de otros días | `dentroDelCupoIA` | idem | GS:4174-4193 |
| `FOLIO_MAS_ALTO` (`PROP_FOLIO`) | número: el folio de hoja más alto repartido (`V-###`); solo sube; se siembra con el máximo de Ventas, «Ventas (respaldo)», «Bitácora del puente» y «Abonos comisión» | `reservarFolios`, `recordarFolio`, `mejorarTodo` | `marcaDeFolios` | GS:1366-1421, 62-69 |
| `ALMACEN_SECUENCIA` | último número de secuencia del almacén (si falta: máximo de las pestañas) | `rutaEmpujarAlmacen_` | `almLeerSecuencia_` | GS:5240, 5520-5533, 5624 |
| `PUENTE_Y_AD_ALINEADAS` | ISO de cuándo se hizo la realineación de Y:AD; sin ella `ordenarVentas` NO reacomoda | `realinearSiHaceFalta` | `estadoDeAlineacion` | GS:4378, 4384-4388, 4614 |
| `PUENTE_Y_AD_VISTA_PREVIA` | huella de la última vista previa | `revisarColumnasDelPuente` | `realinearSiHaceFalta` | GS:4584, 4628 |

Constantes en código que parecen secretos pero son públicos/identificadores: `PUENTE_CLIENT_IDS` (GS:1898), `CARPETA_TRABAJOS = '1XfM5KMFn5p87LI_W-IglmflaZcs3y_wB'` (GS:5806), `CORREO = 'eliasgaribi@gmail.com'` (GS:17, destinatario del resumen semanal).

Claves de `CacheService.getScriptCache()`: `ing_<hash>` (identidad, 300/60 s), `ing_fallos`, `ing_min@n`, `p_<hash>@n` (60/min), `grandes@n`, `v_<hash>@n` y `v__total@n` (600 s), `carpetas-trabajos-v1` (300 s).
La caché es volátil y por-script: un reinicio la vacía; ninguna cuenta de ahí es una garantía dura.

---

## 6. `/ia` (GS:4097-4352, ruta GS:4283-4313)

### 6.1 Petición
```
{ "ruta":"ia", "prov":"qwen"|"deepseek"|"gemini", "model":<de la lista>, "modo":"cotizar"|"chat", ... }
```
- `prov` ∈ `IA_PROVS=['qwen','deepseek','gemini']`; si no: `DATO_INVALIDO` «Ese proveedor de IA no existe.»
- `model` ∈ `IA_MODELOS` (lista blanca, para que el teléfono no escoja el costo): `qwen: ['qwen3.7-flash','qwen3.6-flash']`, `deepseek: ['deepseek-flash']`, `gemini: ['gemini-3.1-flash-lite','gemini-3.6-flash']` (GS:4118-4119). Si no: `DATO_INVALIDO` «<Nombre>: el modelo «x» no está en la lista de la hoja.»
  El cliente espera exactamente esas listas (`AI_DEFAULTS`/`AI_RESPALDO`, `js/cotizador/ia.js:796-804`) y `pruebas/replicas.mjs:281` las extrae del .gs con una regex sobre `var IA_MODELOS = {…};`.
- `modo`: cualquier valor distinto de `'chat'` es `'cotizar'` (`limpiarPeticionIA` GS:4263-4282).
  - **cotizar**: `prompt` (string, obligatorio, ≤30 000), `imagen:{b64,mime}`, `sinJson` (bool). `b64` obligatorio y los PRIMEROS 200 chars deben cumplir `/^[A-Za-z0-9+\/=]+$/` (el resto no se valida); `mime` ∈ `IA_MIMES=['image/jpeg','image/png','image/webp','application/pdf']`; PDF solo con `gemini` (`DATO_INVALIDO` «Solo Gemini lee PDF.»). Mensajes: «Falta la instrucción para la IA.» / «Falta el archivo que se va a analizar.» / «Solo se analizan JPG, PNG, WEBP o PDF.»
  - **chat**: `sistema` (≤40 000), `pregunta` (obligatoria, ≤4 000), `mensajes` (arreglo; se queda con los ÚLTIMOS 20; cada `{role:'assistant'|'user', content ≤8 000}`; todo role distinto de `assistant` se vuelve `user`). Error: «Falta la pregunta.»
- Orden de verificaciones tras auth: proveedor → modelo → limpiar petición → PDF/no-gemini → llaves (`SIN_LLAVE`, no consume cupo) → cupo diario → llamada(s).

### 6.2 Armado de la petición al proveedor (`iaPeticion`, GS:4197-4227)
- **gemini**: `POST https://generativelanguage.googleapis.com/v1beta/models/<encodeURIComponent(model)>:generateContent?key=<encodeURIComponent(key)>`, `contentType:'application/json'`.
  - cotizar: `{contents:[{parts:[{text:prompt},{inline_data:{mime_type:mime,data:b64}}]}], generationConfig:{responseMimeType:'application/json',temperature:0.2}}` (ignora `sinJson`).
  - chat: `{systemInstruction:{parts:[{text:sistema}]}, contents:[...mensajes(role assistant→'model', si no 'user', parts:[{text}]), {role:'user',parts:[{text:pregunta}]}], generationConfig:{temperature:0.2,maxOutputTokens:1200}}`.
- **qwen**: `POST https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions`; **deepseek**: `POST https://api.deepseek.com/chat/completions` (`IA_URLS`, GS:4113-4114). Header `Authorization: Bearer <key>`.
  - cotizar: `{model, temperature:0.2, max_tokens:4096, messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:'data:<mime>;base64,<b64>'}}]}]}` y, salvo `sinJson`, `response_format:{type:'json_object'}`.
  - chat: `{model, temperature:0.2, max_tokens:1200, messages:[{role:'system',content:sistema}, ...mensajes, {role:'user',content:pregunta}]}`.
  - deepseek añade `thinking:{type:'disabled'}`.
- Todas con `muteHttpExceptions:true`.

### 6.3 Llaves y reintentos
- Llaves de `IA_KEYS[prov]` (≥10 chars). Se turnan por llamada (`IA_ROTACION`). Se prueba la siguiente llave del MISMO proveedor solo si `res.status` es 429, 401 o 403 (GS:4310); un modelo inexistente o un `VACIO` corta. Excepción de red en una llave ⇒ sigue con la siguiente (`ultima` = PROVEEDOR transitorio).
- La cadena Qwen → DeepSeek → Gemini, los 4 reintentos con esperas `[1200,3000,7000]` ms y el respaldo `[1500]` son del CLIENTE (`ia.js:810-811`, `AI_TIMEOUT=100000`): cada `/ia` es UN intento contra UN proveedor.

### 6.4 Respuesta (`iaRespuesta`, GS:4230-4262)
- 2xx con texto: `{ok:true,texto,prov,model}`. Texto = `candidates[0].content.parts[].text` (gemini; `razon = finishReason || promptFeedback.blockReason`) o `choices[0].message.content` (`razon = finish_reason`).
- 2xx sin texto: `{ok:false,codigo:'VACIO',razon,transitorio:!razon,prov,mensaje:'<Nombre> respondió vacío'}`.
- Error: `{ok:false,codigo:'PROVEEDOR',status,transitorio,crudo,prov,mensaje}` con `status` = `error.code` numérico (≥100) o el HTTP; `transitorio` verdadero para 429, 408 y ≥500; frases: 429 «alcanzó su límite de peticiones»; 408/≥500 «está saturado»; 401/403 «la llave de X que está en la hoja no es válida o no tiene saldo»; 404 «no reconoce el modelo «m»»; 413 «el archivo pesa demasiado para X»; otro «rechazó la petición (HTTP s)»; `crudo` = mensaje del proveedor sin HTML, ≤140.
- Otros: `SIN_LLAVE` `{prov,transitorio:false}` «X no tiene llave en la hoja — Dirección la pega en ⚡ AL3D → Llaves de IA»; `SIN_RED` transitorio (no consiguió el candado de 3 s para contar); `CUPO_AGOTADO` transitorio:false «Llegaste al tope de 200 consultas de IA por hoy. Mañana se reinicia.» (el día cambia a las 18:00 hora de México porque es GMT).
- El cliente trata `CUPO_AGOTADO`/`ROL_SIN_PERMISO` como definitivos y `SIN_LLAVE` marca el proveedor sin llave (`ia.js:899-908`, `asistente.js:794-799`). Un 400 con texto json/response_format/schema/format reintenta con `sinJson:true` (`ia.js:917-918`).

---

## 7. `/expandir` — lista blanca y anti-SSRF (GS:2155-2159, 3148-3179)

```js
var DOMINIOS_MAPS = ['maps.app.goo.gl', 'goo.gl', 'maps.google.com',
                     'www.google.com', 'google.com', 'g.co'];     // GS:2158-2159
```
Reglas reales de `expandirLiga_(liga)`:
1. `u = String(liga||'').trim()`.
2. `m = /^https?:\/\/([^\/:?#]+)/i.exec(u)`; `host = m ? m[1].toLowerCase() : ''`.
3. Si `!host` o `host` no está EXACTO en la lista ⇒ `{ok:false,codigo:'DATO_INVALIDO',mensaje:'Solo se siguen ligas de Google Maps.'}`. Sin comodines ni subdominios (`foo.google.com` se rechaza).
4. `UrlFetchApp.fetch(u, {followRedirects:false, muteHttpExceptions:true})` → **UN solo salto**: devuelve `{ok:true,url: Location || u}`. No devuelve cuerpo ni cabeceras; solo la `Location`. Excepción ⇒ `{ok:false,codigo:'SIN_RED',mensaje:'No se pudo seguir la liga.'}`.
5. Se permite `http://` y `https://` (la regex acepta ambos).
6. El cliente encadena hasta 3 saltos (`Geo.resolverLink`; en el .gs, `ubicacionDeLiga_` GS:3232-3248 hace lo mismo con `for i<3`), y cada salto vuelve a pasar la lista.
- Se usa también en el menú «Registrar nueva venta» (`datosDeEntregaDelDialogo_` → `ubicacionDeLiga_` → `expandirLiga_`), para que la lista sea UNA.
- Quién llama: cualquier rol (después de las puertas y del cupo).

**HUECO (verificado ejecutando la regex en node)**: el host se corta en el primer `:`; `https://maps.google.com:x@evil.example/` da `host = 'maps.google.com'` (permitido) pero el host REAL de la URL (WHATWG `new URL`) es `evil.example` (lo de antes del `@` es userinfo). `UrlFetchApp` conectaría a `evil.example`. Los casos `https://maps.google.com@evil.example/` y `https://evil.example@maps.google.com/` sí quedan rechazados (el `@` no está en la clase excluida). Para la Edge Function: parsear con `new URL(u)`, exigir `protocol==='https:'`, `username==='' && password==='' && port===''`, comparar `hostname` en minúsculas con la lista, `redirect:'manual'` y revalidar cada salto. NO copiar la regex.
(Aparte: `www.google.com` y `google.com` permiten cualquier ruta de Google, p. ej. redirectores abiertos; el límite es el salto único y que solo se devuelve `Location`.)

Constantes de lectura de coordenadas del lado de la hoja (`GEO_REGLAS`, GS:3189-3201, `coordenadasDeMaps_` 3205, `coordEnRango_` 3202) son copia de `parseGmaps` de `js/datos/geo.js`; `pruebas/puente-hoja.mjs` las compara.

---

## 8. `/carpetas` y `/crear_carpeta` (Drive) (GS:5784-5913)

- Raíz: `CARPETA_TRABAJOS = '1XfM5KMFn5p87LI_W-IglmflaZcs3y_wB'` («Trabajos Pendientes»), por `DriveApp.getFolderById`; si falla, busca por nombre `DriveApp.searchFolders('title = "Trabajos Pendientes" and trashed = false')` (hasta 20; si no es la de siempre y hay exactamente 1 con ese nombre, la usa); si no: `{ok:false,codigo:'NO_ENCONTRADO',mensaje:'La hoja no alcanza la carpeta «Trabajos Pendientes» de Drive.',detalle:'Por id: … · Por nombre: …'}` (`carpetaDeTrabajos_` GS:5816-5835).
- `/carpetas`: lista hasta `CARPETAS_MAX=150` subcarpetas de la raíz, cada una con hasta `ARCHIVOS_MAX=60` archivos `{nombre,url,tipo(mime),modificado(ms)}`; solo LEE nombres/ligas/fechas. Caché `carpetas-trabajos-v1` 300 s (si la respuesta no cabe en 100 KB, contesta sin guardar). Los tres roles ven lo mismo.
- `/crear_carpeta`: solo `rol==='direccion'`; `nombre` = quitar `[\/\\:*?"<>|\u0000-\u001f]+` → espacio, colapsar espacios, trim; vacío o >120 ⇒ `DATO_INVALIDO`. Bajo `conCandado` busca una subcarpeta con el mismo nombre normalizado (`normalize('NFD')`, sin marcas `\p{M}`, minúsculas, espacios colapsados) y si existe devuelve esa con `creada:false`; si no `raiz.createFolder(nombre)`, borra la caché y devuelve `creada:true`. Solo CREA; nunca mueve, renombra ni borra.
- Permiso OAuth: scope `https://www.googleapis.com/auth/drive` (se pide al pegar la versión; `autorizarDrive` GS:5907-5913 con `ScriptApp.requireScopes(FULL,[…drive])` existe porque Google a veces no vuelve a preguntar).
- Cliente: `js/datos/carpetas.js` (`alDia`) la pide al sincronizar el teléfono de Dirección con «Contacto - Negocio» (`puente.js:1451-1479`).
- **Autenticación hoy**: las puertas genéricas (Google/token + 60 por minuto). En el plan, tras la fase 5 se retiran tokens y la lectura de «Accesos»; este mapa NO encuentra que el plan diga cómo se autentican estas dos rutas después (ver §12.6).

---

## 9. `/empujar` — escrituras a Ventas: validaciones por columna (`armarCeldas` GS:2955-3069), para replicar como CHECK/RPC

Procesado de cada nombre en `datos` (en este orden): `Abono Comision` (caso especial) → `PUENTE_FORMULAS` → permiso del rol → que exista en `COL` → validación por tipo:

| Campo | Regla |
|---|---|
| `Abono Comision` | permiso `pagos`/`direccion`; número finito, `>0` y `≤1e7` (si no: «un abono de comisión va en positivo y es de menos de $10,000,000»); NO escribe celda: agrega un renglón en «Abonos comisión» `[folio, (B fórmula), importe, new Date(), 'Registrado desde la plataforma']` (GS:3076-3088); sin pestaña o sin renglón libre ⇒ queda en `rechazadas` (y si era lo único: `ok:false` `DESCONOCIDO`) |
| `Estatus` | ∈ ESTATUS |
| `Cuenta ` | ∈ CUENTAS |
| `Etapa de obra` | ∈ ETAPAS_OBRA |
| `Tipo de trabajo` | array o valor; cada uno ∈ TIPOS_TRABAJO; se guarda `join(', ')` |
| `IVA` | `valor ? 'Sí' : 'No'` (luego `normalizarIvaActivos` lo pisa por la cuenta) |
| `Precio Subtotal`, `Anticipo`, `Liquidacion` | `Number(valor)` finito; `Anticipo` y `Liquidacion` no negativos (el subtotal SÍ puede ser negativo) |
| `Porcentaje comision` | `null`/`''` borra; si no, 0..100 |
| `Fecha Anticipo e Instalacion`, `Fecha Liquidacion`, `Fecha instalacion` | `null`/`''` borra; si no regex `^\d{4}-\d{2}-\d{2}$` (fecha local) |
| `Entrega` | vacío borra; `entregaDeCelda` (acentos/mayúsculas tolerados: `^paquet`, `^recole`, `^instala`); si no, rechazada |
| `Plazo taller` | vacío borra; `plazoDeCelda` (acepta «2», «1½», «1,5», «3+»); si no, rechazada |
| `Notas` | texto ≤40 000, formato `@` (sin apóstrofo) |
| `Telefono` | vacío borra; `telefonoLimpio`: reemplaza todo lo que no sea `[\d +()\-]` por espacio, colapsa espacios, exige ≥1 dígito, corta a 30 (`TEL_MAX`); formato `@` |
| `Hora instalacion` | `horaEscrita`: vacío ⇒ `''`; `HH:MM` o `H:MM[:SS]` válida (segundos ≥58 suben un minuto); si no, rechazada; formato `@` |
| resto (`Proyecto`, `Ubicacion`, `Direccion`, `Folio cotizacion`) | texto ≤2000; si empieza por `= + - @` se antepone `'` (anti-fórmula) |

Reglas de identidad y de «quién gana» dentro de `unaOperacion` (GS:2705-2948):
- `fc = datos['Folio cotizacion'] || op.folio_cotizacion`. Fila por `id_notion` (= folio de hoja `V-###`, col A); si la fila está atada a OTRO folio de cotización ⇒ no es la de este teléfono (`NO_ENCONTRADO` motivo `de_otra`, o `ESPERA_REALINEAR` si Y:AD no están realineadas); si no hay `id_notion` busca por `Folio cotizacion` (col Y).
- Se crea fila SOLO con alta real: nunca con `id_notion`; no si la etapa es `No se dio` (`DATO_INVALIDO`); exige nombre de proyecto no vacío (`NO_ENCONTRADO` explicando que el rol no escribe `Proyecto`).
- «Folio cotizacion» no se pisa si la fila ya trae otro, ni se acepta el folio de hoja en esa columna.
- Sellos por campo (puente-sheets-14): `SELLADAS=['Etapa de obra','Fecha instalacion','Hora instalacion','Ubicacion','Direccion','Telefono','Entrega','Notas','Plazo taller']`; `Hora instalacion` comparte el sello de `Fecha instalacion` (`claveDeSello_`). Llega con `op.sellos[nombre]` (ms); `selloValido_` lo capa a `ahora + 10 min` (`SELLO_HOLGURA_MS`); un cambio con sello menor al guardado NO se escribe y vuelve en `viejos:[{nombre,por:'ya tenía un cambio más reciente'}]` (no es error); si todo era más viejo ⇒ `ok:true` con la fila como quedó en `remoto`. Sin `op.sellos` ⇒ sella con la hora de llegada. (Detalle de sellos: otro mapa.)
- Folio nuevo de hoja: `siguienteFolio` = `V-` + número (mínimo 3 dígitos) a partir de `FOLIO_MAS_ALTO`.
- Bitácora de escrituras: pestaña oculta «Bitácora del puente» con `['Cuándo','Rol','Folio','Fila','Qué escribió','Nota']`, tope 5 000 filas (`anotar_` GS:3259-3288).

---

## 10. Notario: `/solicitar`, `/cancelar`, `/pendientes`, `/estado`, `/autorizar`, `/rechazar`, `/revocar`, `/verificar` (GS:3290-4095)

### 10.1 Pestañas (índices exactos)
- «Autorizaciones» (oculta; `COLS_AUT`, 17 columnas A..Q, GS:3685-3687): `Cuándo (ISO)`, `Folio`, `Proyecto`, `Cliente`, `Subtotal calculado`, `Precio autorizado (neto)`, `Total`, `Ajuste %`, `Ajustes por partida`, `Huella`, `Autorizó`, `Solicitó`, `Código`, `Firma`, `Estado`, `Nota`, `Renglones` (`A_TS=0 … A_RENGLONES=16`). `Estado` ∈ `vigente`/`superada`/`revocada`.
- «Solicitudes de autorización» (`COLS_SOL`, 13 columnas, GS:3695-3696): `Cuándo`, `Folio`, `Proyecto`, `Cliente`, `Subtotal`, `IVA`, `Huella`, `Cotización`, `Solicitó`, `Estado`, `Resolvió`, `Cuándo se resolvió`, `Nota`. `Estado` ∈ `pendiente`/`autorizada`/`rechazada`/`cancelada`.
- Todo texto se escribe con apóstrofo delante (`txt()`, GS:3682) para que Sheets no lo convierta (fechas ISO, «1:8500.00») y poder recalcular la firma al leerlo.

### 10.2 Reglas de entrada
- `folioValido(f)`: `/^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/` (folio largo `COT-0042@K7QM`, obligatorio en rutas que escriben). `folioDePapel_(f)`: igual pero `@aparato` opcional (solo `/verificar`, GS:3597-3599).
- `limpiarCotizacion(c)` (GS:3530-3571): `items` arreglo no vacío, ≤`MAX_PARTIDAS=80`; cada partida objeto con `id` (number o string ≤40, único); copia solo los campos de `COT_CAMPOS_PRECIO=['tipo','material','comp','luz','altura','n','acab','recComp','bas','ancho','alto','tarifa','pz','pu']` (cada valor null/number finito/string ≤60/boolean) más `desc` (≤300); `proyecto`/`cliente` ≤140 (trim); `iva` booleano; `subtotal` número; `cotHuella` o JSON > `CELDA_MAX=45000` ⇒ error «La cotización es demasiado grande para guardarla en la hoja. Divídela en dos cotizaciones.»
- Recalculo con copia del catálogo (GS:3337-3402): `COT_MATERIALES={'al-paint':30,'al-brush':35,'acr-vol':40,'acr-vinil':45,'acero':55}`, `COT_COMPLEJIDAD={'recta':0,'cursiva':5,'compleja':10}`, `COT_RECORTES={'sencillo':20,'vinil':25,'sandwich':55}`, `COT_RECORTE_COMP_EXTRA=5`, `COT_BASTIDORES={'lamina':950,'alucobond':1500}`, `COT_M2_MINIMO=1`, `COT_IVA=0.16`; por tipo (`cotLineTotalCrudo`): `letras` = `(mat+comp)*altura*n` ×0.8 si `!luz`; `recorte` = `(tarifa[acab] (+5 si sandwich y recComp))*altura*n`; `bastidor` = `max(ancho*alto/10000,1)*tarifa[bas]`; `caja` = `max(ancho*alto/10000,1)*tarifa` (0 si m2≤0); otro = `pz*pu`; cada línea `Math.round(x*100)/100`. Debe coincidir con `js/cotizador/catalogo.js` y `nucleo.js` (`pruebas/precio-servidor.mjs`). Si `|subtotal_calculado − c.subtotal| > 0.01` ⇒ `CATALOGO_DESINCRONIZADO`.
- `/autorizar` además: `subCalc>0`; `precioAuth` 0..1e9; `limpiarItemsAuth` (cada id debe existir, importe 0..1e8).

### 10.3 Lo que se FIRMA (no cambiar jamás: invalidaría los PDF impresos)
```
canon v2 (con renglones) = 'AL3D-AUTH-v2' + JSON.stringify([folio, huella, dinero2(subCalc), dinero2(precioAuth), itemsAuth, dinero2(total), proyecto, correo, ts, renglones])
canon v1 (sin renglones) = 'AL3D-AUTH-v1' + JSON.stringify([folio, huella, dinero2(subCalc), dinero2(precioAuth), itemsAuth, dinero2(total), proyecto, correo, ts])
firma  = hex minúsculas de HMAC-SHA256(canon, SELLO_AUTORIZACION)       // Utilities.computeHmacSha256Signature(string,string), aHex
código = firma.slice(0,12).toUpperCase() → 'XXXX-XXXX-XXXX'             // codigoDe; normalizarCodigo: mayúsculas, solo [0-9A-F], 12
dinero2(n) = (Math.round(Number(n||0)*100)/100).toFixed(2)
itemsAuthCanon(ia) = Object.keys(ia).sort().map(k => k + ':' + dinero2(ia[k])).join(',')
huella = cotHuella(iva, items) = (iva?'c':'s') + '|' + items.map(it => it.id + ':' + COT_CAMPOS_PRECIO.map(k => it[k]===undefined?'':String(it[k])).join('~')).sort().join(',')
total  = cotTotalFinal(subCalc, iva, precioAuth) = +fin.toFixed(2), fin = (precioAuth>0 && |precioAuth−neto|>0.01) ? precioAuth : neto, neto = iva ? sub+sub*0.16 : sub
ts     = new Date().toISOString() (RELOJ DE LA HOJA, texto, p. ej. '2026-10-01T18:04:11.000Z')
renglones = JSON.stringify(items.map(it => [String(desc).slice(0,120), piezas, +importeCliente.toFixed(2)]))   // renglonesDe, GS:3505-3512
```
(`canonDe` GS:3635-3646, `firmar` GS:3666, `registroDeFila` GS:3735-3740: la firma se RECALCULA desde lo guardado en la fila; `ts` y `renglones` se usan como TEXTO tal cual.) Un v2 sin renglones se firmaría como v1 y ya no cuadra: «no auténtica».
**Implicación**: la cadena canónica sale de `JSON.stringify` de JS; `jsonb::text` / `json_build_array` de Postgres NO es byte-idéntico (espacios, escapes). Preservar `ts`, `huella`, `itemsAuth`, `renglones`, `proyecto` y `correo` como TEXTO exacto al importar.

### 10.4 `/verificar` (pública)
- Entrada `f` (trim) y `c` (normalizado). Si `!folioDePapel_(f)` o el código no tiene 12 hex ⇒ `{ok:true,estado:'no_autentica'}` (sin gastar cupo).
- Cupo antes de buscar (§2.5). Busca de atrás hacia adelante en «Autorizaciones» (`ultimaFilaDeVerificar_` GS:4064-4078): con `@aparato` exige folio exacto; sin él compara folio corto en MAYÚSCULAS; y siempre `normalizarCodigo(Código)===cod`.
- Recalcula `firmar(registroDeFila(fila), secreto)`; debe igualar la columna `Firma` Y `normalizarCodigo(codigoDe(firma))===cod`; si no ⇒ `no_autentica`. Sin hoja o sin secreto ⇒ `no_autentica`.
- Estado de la fila: `vigente`→`autentica`, `revocada`→`revocada`, cualquier otro→`superada`. Devuelve solo `folio` corto (de la fila), `fecha` (`dd/MM/yyyy`, zona de la hoja), `total`, `proyecto`, `renglones` (null si el sello es anterior a puente-sheets-8). Nunca cliente, teléfono, dirección ni correo.
- Consumidor: `verificar.html:407-455` (`fetch(URL_PUENTE, {ruta:'verificar',f,c})`), y su CSP `connect-src` solo permite `script.google.com`/`script.googleusercontent.com` (`verificar.html:6`).

---

## 11. Menús, disparadores y utilidades de la hoja (qué conservar / retirar)

### 11.1 Menú `onOpen` (GS:1263-1285; disparador simple por nombre; los rótulos llevan un emoji al inicio)
Menú «⚡ AL3D»: «Registrar nueva venta» → `dialogoVenta`; «Registrar un cobro» → `dialogoCobro`; «Registrar abono de comisión» → `dialogoAbono`; «Repartir un abono entre comisiones» → `dialogoReparto`; —; «Tokens del puente» → `dialogoTokens`; «Llaves de IA» → `dialogoLlavesIA`; «Preparar las autorizaciones selladas» → `configurarAutorizaciones`; «Mandarme el resumen ahora» → `enviarResumen`; «Actualizar formato y vistas» → `mejorarTodo`; «Rehacer vista de comisiones por periodo» → `construirComisionesPorPeriodo`; —; submenú «Actualizar el puente»: «1 · Revisar columnas Y–AD (vista previa, no escribe)» → `revisarColumnasDelPuente`; «2 · Realinear columnas Y–AD» → `realinearColumnasDelPuente`; «3 · Preparar la hoja para el puente» → `prepararHojaParaElPuente`.

### 11.2 Disparadores instalables (`instalarTriggers`, GS:901-910, los crea `mejorarTodo`)
- `enviarResumen`: semanal, lunes 08:00 (`MailApp.sendEmail` a `CORREO`, lee Ventas A:X: saldo=col 11, días=col 16, comisión pendiente=col 20; GS:1200-1237).
- `alEditar`: `forSpreadsheet(...).onEdit()` (GS:1073-1179): (1) folio nuevo al escribir B o A (y para copias con folio repetido, quitándoles `Folio cotizacion`); (2) IVA por cuenta al editar D; (3) sellos de las columnas de obra tecleadas a mano (borrar quita el sello); (4) `ordenarVentas` al cambiar C. Todo con candado `tryLock(25000)`.

### 11.3 Recomendación por función (los NÚMEROS son del plan, la columna «Sugerencia» es mía)
| Grupo | Funciones | Sugerencia |
|---|---|---|
| Rutas que se mudan | `rutaJalar_`, `rutaEmpujar_`, `unaOperacion`, `armarCeldas`, `aplanarFila`, `sinLoQueNoLeToca`, `rutaSalud_`, `rutaEsquema_`, rutas del notario, `rutaIA_`, `rutaExpandir_`, `rutaEmpujarAlmacen_`, `rutaJalarAlmacen_`, `almUnaOperacion_` | retirar en fase 5 tras el cuadre (no antes: son el rollback de la fase 4) |
| Auth de dispositivo/Google | `rolDelToken`, `identidadDelIngreso`, `rolDelCorreo`, `crearHojaAccesos`, `dialogoTokens`, `rotarTokensDelPuente`, `configurarTokensDelPuente_`, `dentroDelLimite`, `contarEnVentana`, `cupoDeCuerposGrandes`, `cupoDeVerificar` | retirar en fase 5 (el plan: tokens se van); `contarEnVentana` puede servir al cupo de `espejo` |
| Diálogos de captura | `dialogoVenta`/`guardarVenta*`, `dialogoCobro`/`guardarCobro*`, `dialogoAbono`/`guardarAbono*`, `dialogoReparto`/`guardarReparto*` | contradicen «hoja de solo lectura»; retirar del menú en fase 4 (la repartición FIFO y el abono son lógica de negocio a portar) |
| Llaves | `dialogoLlavesIA`, `guardarLlavesIA`, `iaLlaves_`, `iaOrdenDeLlaves_`, `dentroDelCupoIA` | retirar cuando `ia` viva en Supabase; ANTES copiar las llaves a los secretos de la función |
| Realineación Y:AD | `revisarColumnasDelPuente`, `realinearColumnasDelPuente`, `propuestaDeRealineacion`, `escribirRevision`, `realinearSiHaceFalta`, `huellaDePropuesta`, `estadoDeAlineacion`, `avisar` | retirar; `ordenarVentas` hoy NO reacomoda mientras `PUENTE_Y_AD_ALINEADAS` no exista (GS:984-990): decidir si el espejo reacomoda |
| Preparación | `prepararHojaParaElPuente`, `protegerColumnasCalculadas`, `alinearTiposDeTrabajo`, `prepararPestanasDelAlmacen`, `almPestana_` | conservar la parte que crea/protege columnas y cabeceras si el espejo escribe ahí; resto retirar |
| Diseño/reportes (solo leen Ventas/Abonos) | `mejorarTodo`, `respaldar`, `fijarFolios`, `agregarColumnas`, `formulasVentas`, `disenoVentas`, `reglasVentas`, `tablero`, `vistas`, `construirVista`, `cobranza`, `comisiones`, `graficas`, `construirComisionesPorPeriodo`, `enviarResumen` | CONSERVAR (la hoja sigue siendo espejo con tableros y fórmulas); ojo: `mejorarTodo` reescribe fórmulas en filas 2..310 y llama `ordenarVentas` |
| Drive | `rutaCarpetas_`, `rutaCrearCarpeta_`, `carpetaDeTrabajos_`, `archivosDeCarpeta_`, `nombreDeCarpeta_`, `autorizarDrive` | CONSERVAR (el plan las deja en Apps Script) |
| Utilidades compartidas | `responder`, `conCandado`, `conCandadoNotario`, `escaparHtml`, `marco`, `hoja*`, `anotar_` | conservar `responder`/`conCandado`; `anotar_` sirve de bitácora del espejo si se quiere |
| Mantenimiento manual | `revocarAutorizacion(folio)`, `configurarAutorizaciones` | pasan a RPC/Edge; `revocarAutorizacion` hoy es el único camino de operación manual |

Pestañas que crea/usa el script: `Ventas`, `Ventas (respaldo)` (oculta), `Abonos comisión`, `Tablero`, `Proyectos en Puerta`, `Vendidos del Mes`, `Ventas del Año`, `Récord de Ventas`, `Cobranza`, `Comisiones`, `Gráficas`, `Comisiones por periodo`, `Accesos`, `Bitácora del puente` (oculta), `Autorizaciones` (oculta), `Solicitudes de autorización`, `Revisión Y-AD`, `Ventas (antes de realinear)` (oculta), `Almacén`, `Catálogo de material`, `Listas de compra`.
Restricciones para quien escriba la ruta `espejo`: `CALC=['A','H','K','O','P','Q','R','S','T','U','V','W','X']` (GS:27) solo pinta el encabezado «calculado»; las FÓRMULAS (ARRAYFORMULA en la fila 2, `formulasVentas` GS:170-210) son H, K, O, P, Q, R, S, T, U, V, W, X y NO deben escribirse (A es el folio, lo escribe el script, no es fórmula); `ordenarVentas` mueve de fila los bloques `[1,7]`, `[9,10]`, `[12,14]` y `[25,35]` (`bloquesCapturados` GS:971-978), así que el espejo debe localizar la fila por folio (col A), no por número; AA, AE, AG y AI deben ir en formato texto `@`.

---

## 12. Contradicciones con el plan (`docs/PLAN-SUPABASE.md`)

1. **§3.1/§4.12 inventario de propiedades incompleto.** El plan lista `PUENTE_TOKENS`, `SELLO_AUTORIZACION`, `IA_KEYS`, `FOLIO_MAS_ALTO`. El código usa además `IA_ROTACION`, `IA_CUOTA_<yyyyMMdd>`, `ALMACEN_SECUENCIA`, `PUENTE_Y_AD_ALINEADAS`, `PUENTE_Y_AD_VISTA_PREVIA` (§5). `FOLIO_MAS_ALTO` no es secreto pero es el contador de folios `V-###`: la secuencia de Supabase debe sembrarse por encima.
2. **§4.3 / §4.7 `ventas_dinero` contiene `estatus` e `iva` y Fabricación «ni siquiera recibe la fila».** Hoy fabricación RECIBE `Estatus` (a propósito, GS:2147-2148), `IVA` y `Fecha Anticipo e Instalacion` (no están en `CAMPOS_DE_DINERO`). Si el estatus vive en `ventas_dinero`, el tablero de obra de fabricación pierde «qué ya se cobró y se puede cerrar».
3. **§4.2 «Fabricación: etapa hasta Listo» se presenta como regla de la matriz que pasa a la base, pero hoy `TOPE_ROL` solo existe en el cliente** (`proyectos.js:1116`); el servidor acepta cualquier etapa de fabricación (GS:2130, 2992-2994). Pasarlo a RLS/RPC sería ENDURECER, no portar.
4. **§3.2 `/salud` «o se quita».** `/salud` entrega `rol`, `via`, `correo`, `escribibles`, `version` y `ia` (qué proveedores tienen llave); los usan `puerta.js` (acceso/expulsión), `asistente.js:55`, `cotizador/ia.js:152` y Ajustes. Quitarlo exige reemplazar esas cuatro cosas.
5. **§3.2 `/expandir` «misma lista blanca».** La lista copiada está bien; la REGLA que la aplica (`GS:3166`) tiene el hueco del userinfo (§7). Portar la lista, no la regex.
6. **§5 fase 5 «Apps Script con dos rutas (`espejo`, `carpetas`)» vs §3.2 que también conserva `/crear_carpeta`**, y no dice cómo se autentican `carpetas`/`crear_carpeta`/`espejo` cuando se retiran tokens y la pestaña «Accesos» (hoy lo hace `identidadDelIngreso`/`rolDelToken`). El Web App seguiría público («Cualquier usuario»).
7. **§3.2 `/verificar` «Edge Function pública con su propio límite».** El límite actual (30/folio y 400 totales por 10 min, `CacheService`) no se puede portar a una función sin estado; necesita contador en base. Y las funciones SQL (RPC) para `/autorizar`/`/verificar` chocan con la serialización JSON byte-exacta de la firma (§10.3).
8. **§4.8 «la base devuelve `acceso_revocado` en cada respuesta» / «surte efecto en la siguiente petición».** Hoy la revocación tarda hasta 300 s (caché positiva, GS:2358) y existe una defensa específica para NO tomar un tropiezo de red/Google como «dado de baja» (GS:2318-2323, `puerta.js:380-382`). El nuevo señal debe distinguir «no es miembro» de «error transitorio».
9. **§4.8 `miembros(usuario_id, empresa_id, area)` y «Alta: Dirección agrega un renglón (correo, área)».** «Accesos» se llave por CORREO (3 columnas: Correo, Rol, Nota). Con Supabase `usuario_id` no existe hasta el primer login: hace falta invitación/tabla previa por correo. El plan no lo resuelve.
10. **§4.9 «Cuenta (`js/nucleo/cuenta.js`) se toma de la sesión de Supabase».** El ingreso actual obtiene un ACCESS token con `initTokenClient` (`ingreso.js:55,234-265`), no un ID token; `signInWithIdToken` de Supabase pide ID token (NO CONFIRMADO contra la documentación de Supabase). Cambia el flujo de login, no solo la verificación.
11. **§8 Archivos a modificar** no incluye las CSP: `index.html` (`connect-src 'self' https://www.googleapis.com https://accounts.google.com https://script.google.com https://script.googleusercontent.com https://nominatim.openstreetmap.org`), `cotizador.html` y `verificar.html` (`connect-src https://script.google.com https://script.googleusercontent.com`) bloquearán `https://<proyecto>.supabase.co` y su `wss://` hasta que se actualicen (`pruebas/csp.mjs` las prueba).
12. **README del puente dice «diez columnas de dinero»; el código tiene 11** (`CAMPOS_DE_DINERO`, GS:2149-2152). Irrelevante para el plan salvo que alguien cuente.

---

## 13. Riesgos de portado detectados leyendo el código (no son contradicciones, pero cambian el diseño)

- **Estado en memoria del servidor**: toda cuota (60/min, 200 IA/día, 30+400 verificar, 40 cuerpos grandes) usa `CacheService`/`PropertiesService`; en Supabase hay que ponerlas en tablas o en el borde.
- **Un solo candado global** (`LockService.getScriptLock`) serializa todas las escrituras de la hoja (20-30 s). En Postgres desaparece, pero algunas garantías dependían de él: folio sin repetir, abono en renglón libre, secuencia del almacén, id del movimiento antes de escribir.
- **`/estado` usa la identidad del solicitante** (`quienSoy`): con token es el ROL, no la persona; con Supabase será `auth.uid()`.
- **Pruebas que leen `puente/hoja-apps-script.gs`** (15 archivos con la cadena `hoja-apps-script`; fallarán o habrá que reescribirlas si el .gs se recorta o se retira): `pruebas/puente-hoja.mjs:75-77` (extrae vía VM `armarCeldas, rutaExpandir_, sinLoQueNoLeToca, aplanarFila, PUENTE_ROLES, PUENTE_FORMULAS, COL, COL_FOLIO, ULTIMA_COL, HEAD, ESTATUS, CUENTAS, ETAPAS_OBRA, TIPOS_TRABAJO, DOMINIOS_MAPS, CAMPOS_DE_DINERO, VE_EL_DINERO, PUENTE_VERSION`), `pruebas/ingreso.mjs:115` (`identidadDelIngreso, rolDelCorreo, PUENTE_ROLES, PUENTE_CLIENT_IDS`), `pruebas/replicas.mjs:281` (regex sobre `var IA_MODELOS = {…};`), `pruebas/puente-almacen.mjs:325-327`, `pruebas/puente.mjs:342`, `pruebas/precio-servidor.mjs`, `pruebas/notario.mjs`, `pruebas/verificar-desde-el-papel.mjs`, `pruebas/sincronizacion.mjs`, `pruebas/revision-remota.mjs`, `pruebas/precios-cliente.mjs`, `pruebas/cot-entrega.mjs`, `pruebas/carpetas.mjs`, `pruebas/navegador/dos-telefonos.mjs`, y la hoja de mentiras `pruebas/comun/hoja-de-mentiras.mjs`. (Que esos archivos la mencionen está confirmado; cuáles la EJECUTAN en una VM, solo los tres de arriba con líneas citadas.)
- **Tamaños**: `/ia` acepta hasta 15 M caracteres de cuerpo; el límite de cuerpo/tiempo de una Edge Function de Supabase en el plan gratuito NO CONFIRMADO aquí (el cliente espera hasta `AI_TIMEOUT=100000` ms, `ia.js:806`).

---

## 14. NO CONFIRMADO / preguntas abiertas

1. ¿Se puede LEER `SELLO_AUTORIZACION` fuera del script? Ningún menú ni ruta lo devuelve (`secretoDelSello_` lleva `_` a propósito, GS:3655-3657). Hará falta una función temporal o verlo en la configuración del proyecto de Apps Script: NO CONFIRMADO cómo se vería el valor. Sin esa clave los PDF ya impresos dejan de verificar.
2. ¿El tope `listo` de fabricación debe ENFORCARSE en la base? (hoy solo cliente).
3. ¿Dónde vive `Estatus` para que fabricación lo siga leyendo? (§12.2) ¿Y `IVA` / `Fecha Anticipo e Instalacion`?
4. ¿Cómo se autentican `carpetas`/`crear_carpeta`/`espejo` tras la fase 5? (§12.6)
5. ¿Se mantiene el cupo IA de 200/día/persona (GMT) y dónde se cuenta? ¿Se mantienen las URLs `dashscope-intl` (región internacional)?
6. Límites reales de Edge Functions (cuerpo, tiempo, invocaciones) en el plan gratuito: NO CONFIRMADO, hay que revisarlos.
7. `signInWithIdToken` vs `signInWithOAuth` y el cambio de `initTokenClient` (access token) a credenciales ID: NO CONFIRMADO, depende de la documentación de Supabase.
8. `PUENTE_CLIENT_IDS` y `CLIENT_ID` comparten el mismo identificador de Google: el plan dice que «Supabase tiene el suyo». ¿Se reutiliza el cliente de Google existente o se crea otro? (afecta los orígenes autorizados `https://eliasgaribi-ctrl-z.github.io` y `https://cotizador-al3d.pages.dev`).
9. La regla de IVA por cuenta (`Elias BBVA` ⇒ No; otra ⇒ Sí; solo no-LIQUIDADO) vive en la hoja y se aplica en CADA `/empujar` y en `alEditar` (GS:1043-1067, 1143-1145): el plan §4.10 habla de «Precio Neto» pero no de ésta.
