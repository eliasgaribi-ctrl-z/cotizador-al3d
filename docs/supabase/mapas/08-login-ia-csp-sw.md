# Mapa 08 — Login (Google), IA, CSP, service worker, vendor, gcal

Repo leído: `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase` (rama desde main, incluye PR #99; `git status` solo muestra `docs/PLAN-SUPABASE.md` sin seguir). Todas las rutas son relativas a esa raíz. Línea = línea del archivo tal como está hoy.
Convención: «NO CONFIRMADO» = no se pudo verificar en el repo; se dice por qué. Todo lo que es conocimiento general de Supabase/Google (no leído en este repo) va marcado así.

Archivos leídos completos: `js/nucleo/ingreso.js`, `js/nucleo/puerta.js`, `js/nucleo/cuenta.js`, `js/nucleo/gcal.js`, `js/nucleo/asistente.js`, `js/datos/asistente-contexto.js` (hasta la línea 419 completa y el resto por Grep de lo relevante), `sw.js`, `pruebas/csp.mjs`, `pruebas/blindaje-de-la-app.mjs`, `pruebas/ingreso.mjs`, `pruebas/puerta.mjs`, `<head>` de los 10 HTML. `js/cotizador/ia.js` (1545 líneas) leído en los tramos 100-180 y 790-1010 (el resto es lógica de partidas/UI sin relación con login ni `/ia`; ubicado por Grep de `hablarHoja|AI_|fetch(`).
Leídos además por necesidad: `js/datos/prefs.js`, `js/datos/puente.js` (tramos 915-1115, 1380-1410), `js/mod/cotizador.js` (180-380), `js/cotizador/notario.js` (20-100), `js/cotizador/venta.js` (275-335), `js/app.js` (1570-1660, 1830-1900, 2182-2245), `js/tema.js` (70-130), `puente/hoja-apps-script.gs` (1880-1915, 2150-2271, 2278-2375, 2440-2497, 4085-4351).

---------------------------------------------------------------------------------------------------

## 1. Cómo funciona HOY el inicio de sesión

### 1.1 Resumen en cinco líneas
1. Se usa **Google Identity Services, modelo de TOKEN OAuth2** (`google.accounts.oauth2.initTokenClient`), scope `openid email`, que devuelve un **access token opaco** (NO un id_token/JWT). Ver `js/nucleo/ingreso.js:55`, `:234`.
2. El access token (1 h) se manda al Apps Script en el cuerpo del POST como `google_token`; el Apps Script lo verifica contra `https://oauth2.googleapis.com/tokeninfo?access_token=…`, exige `aud ∈ PUENTE_CLIENT_IDS` y `email_verified === 'true'`, y busca el correo en la pestaña **«Accesos»** de la hoja (col A = Correo, col B = Rol, col C = Nota) para sacar el rol.
3. La app guarda en el aparato: el token vivo (`al3d_pf_gtok`, solo mientras vale), el correo (`al3d_pf_ingreso`) y **el pase** `{correo, rol, hasta, visto}` (`al3d_pf_pase`) que es lo que deja abrir la app sin señal.
4. «El token de dispositivo» es la cadena pegada a mano en Ajustes (`al3d_pf_puente.token`), de 3 posibles (una por rol), que el Apps Script reconoce por `PUENTE_TOKENS`. Ya NO abre la puerta; solo sirve para hablarle al puente (y para el cotizador suelto).
5. La puerta fuerza **re-entrada diaria** (`CIERRE_DIARIO = true`, `puerta.js:125`) y confirma el pase contra la hoja por detrás.

### 1.2 `js/nucleo/ingreso.js` — inventario exacto

| Qué | Línea | Valor / comportamiento |
|---|---|---|
| Guion de Google | 48 | `const GIS = 'https://accounts.google.com/gsi/client';` (csp.mjs lo detecta con la regex `const GIS = '…'`) |
| Scope | 55 | `const SCOPE = 'openid email';` (no sensibles: sin «app no verificada», según el comentario 50-54) |
| **CLIENT_ID (web)** | 84-85 | `1057893837924-3np1vkcbpqmkh6sio0ktse00kd9b5ulr.apps.googleusercontent.com` — cliente tipo «Aplicación web», proyecto «My First Project» de Elías, creado 2026-09-20 (comentario 57-60). **Es el ÚNICO identificador de ingreso en el código.** |
| **ORIGENES** | 98-99 | `['https://eliasgaribi-ctrl-z.github.io', 'https://cotizador-al3d.pages.dev']` (copia local de «Orígenes autorizados de JavaScript» de Google). `origenAutorizado(origen)` 104-107: sin origen → true; compara en minúsculas sin `/` final. |
| URL_APP | 100 | `https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/` |
| Mensajes | 112-124 | `MSG.SIN_CONFIG/SIN_RED/RECHAZADO/CERRADO/ORIGEN(origen)/BLOQUEADA` |
| Clave del token | 127 | `const K_TOK = 'al3d_pf_gtok'`; `_tok = leerTok()` (128) — lee `{token, expira}` de localStorage y lo descarta si `expira <= Date.now()` (130-135); `guardarTok` 136-138 |
| `clienteId()` | 149-153 | `Prefs.ingreso().clientId` (si alguien lo escribió) gana sobre `CLIENT_ID`. **No hay campo en Ajustes que lo escriba** (grep `setIngreso` solo aparece en ingreso.js); solo lo siembran pruebas (`pruebas/blindaje-de-la-app.mjs:98`, `pruebas/navegador/pf-esqueleto.mjs:858`). |
| `configurado()` | 156 | `!!clienteId()` |
| `correo()` | 159-163 | `_correo` en memoria o `Prefs.ingreso().correo` |
| `dentro()` | 167 | **síncrona**: `!!(_tok && _tok.token && _tok.expira > Date.now())` |
| `token()` | 171 | token vivo o `''` |
| `cargarGis()` | 176-199 | inyecta `<script src=GIS async defer data-gis="1">`; reutiliza la etiqueta `script[data-gis]` si existe; la importa también `gcal.js:44` |
| `entrar(callado)` | 209-292 | ver 1.3 |
| `renovar()` | 296-300 | si `dentro()` ok; si no hay `correo()` → `mal('DATO_INVALIDO', SIN_CONFIG)`; si no `entrar(true)` (`prompt:''`) |
| `preguntarCorreo(tok)` | 302-311 | `fetch('https://www.googleapis.com/oauth2/v3/userinfo', {headers:{Authorization:'Bearer '+tok}})` → `j.email` si `email_verified !== false` |
| `salir()` | 315-320 | `_tok=null`, borra `al3d_pf_gtok`, `_correo=''`, `Prefs.setIngreso({...ingreso, correo:''})`. **No revoca el consentimiento** en Google. |

Códigos de `Resultado` que devuelve: `ok(valor)` / `mal(codigo, mensaje)` con `codigo ∈ {'DATO_INVALIDO','SIN_RED'}`. `DATO_INVALIDO` = ventana cerrada, origen no autorizado, cliente roto; `SIN_RED` = sin red, ventana bloqueada, fallo genérico (app.js:1874 lo oye para no insistir).

### 1.3 Secuencia de `entrar(callado)` (ingreso.js:209-292)
1. `id = clienteId()`; vacío → `DATO_INVALIDO`.
2. Si `dentro()` → devuelve `ok({correo, expira})` sin ventana.
3. **Antes de la red**: si `id === CLIENT_ID && !origenAutorizado(location.origin)` → `DATO_INVALIDO` con `MSG.ORIGEN`. (pruebas/ingreso.mjs:219-222 exige que esta línea aparezca ANTES de `await cargarGis()`.)
4. `navigator.onLine === false` → `SIN_RED`.
5. `await cargarGis()` (si falla → `SIN_RED`).
6. `initTokenClient({client_id:id, scope:SCOPE, callback:()=>{}, error_callback})` **una sola vez por client_id** (`_cliente`, `_clienteDe`). `error_callback`: `popup_failed_to_open`→`SIN_RED`+`MSG.BLOQUEADA`; `popup_closed`→`DATO_INVALIDO`+`MSG.CERRADO`; otro→`SIN_RED`. Se engancha por `_fallo` (hueco que rellena cada llamada).
7. `_cliente.callback = resp => …`: sin `access_token` → `DATO_INVALIDO` si `error ∈ {access_denied, popup_closed}` si no `SIN_RED`; con token: `expira = Date.now() + (expires_in||3600 − 60) * 1000`, `guardarTok(_tok)`.
8. `requestAccessToken(op)` con `op = {}` o `{prompt:''}` (callado) y `op.login_hint = correo()` si hay (270-276).
9. `preguntarCorreo(_tok.token)` → `_correo`, `Prefs.setIngreso({...Prefs.ingreso(), correo})` (283-290).
**Tiene que salir de un click**: puerta.js:58-67 explica que la ventana se bloquea si entre clic y `requestAccessToken` hay una espera de red (dos `import()` dinámicos lo causaron en producción). `pruebas/pf-esqueleto.mjs:151-179` lo amarra por texto.

### 1.4 Qué se manda al puente (cuerpo EXACTO) y cómo lo recibe
`js/datos/puente.js` `pedir()` (963-1050):
- `POST` a `Prefs.puente().url` (URL pelada, sin camino) con `Content-Type: text/plain;charset=utf-8`, `redirect:'follow'`, timeout `MS_ESPERA = 15000` (922).
- Cuerpo JSON (se arma en 984-1001): `Object.assign({ruta: <sin / inicial>}, cuerpoDeLaLlamada)` + `google_token: <access token>` si hay + `token: <token de dispositivo>` si `cfg.token`. **La `ruta` va primera** porque el .gs solo abre el tope de 15 MB a un cuerpo que empieza por `{"ruta":"ia",` (hoja-apps-script.gs:2189-2201).
- El token de Google se renueva en cada petición si caducó (`tokenDeGoogle()`, 943-957): `Ingreso.dentro()`→token; si no hay `configurado()+correo()`→`''`; máx. una renovación por minuto (`MS_ENTRE_RENOVACIONES = 60000`, 940) y con tope de 5 s (`MS_RENOVAR = 5000`, 939).
- Respuesta: `{ok:false, codigo:'ROL_SIN_PERMISO'}` se traduce a estado 401 → `falla('ROL_SIN_PERMISO')` (1039-1045).
- `salud()` (1387-1410) devuelve `{ok:true, mensaje, rol, version, escribibles, via:'google'|'token', correo}`; `ok:false` conserva `codigo`.

Lado Apps Script (`puente/hoja-apps-script.gs`):
- `doPost` 2174-2271. Las DOS puertas: `gtok = cuerpo.google_token`, `token = cuerpo.token`; `ingreso = gtok ? identidadDelIngreso(gtok) : null`; `rol = ingreso ? ingreso.rol : rolDelToken(token)` (2228-2231). Sin rol → `{ok:false, codigo:'ROL_SIN_PERMISO', mensaje:…}` (2232-2237).
- Cupo: `LIMITE_POR_MINUTO = 60` (2164) por `'g:'+correo` o por token (2241).
- `identidadDelIngreso(tok)` 2305-2360: tokeninfo; **`aud` debe estar en `PUENTE_CLIENT_IDS`** (lista, 1898-1901, hoy el mismo CLIENT_ID de ingreso.js); `email_verified === 'true'`; correo en minúsculas; caché por SHA-256 del token (`ing_<hash>`): 300 s si hay rol, 60 s si «no definitivo»; falla CERRADO (sin red/5xx/429 → null); contador de fallos `ing_fallos ≥ 5` → 15 s sin consultar; tope `ing_min > 120/min`.
- `rolDelCorreo(correo)` 2363-2375: pestaña `HOJA_ACCESOS = 'Accesos'` (1909), filas 2.., col A = correo (trim+lowercase), col B = rol (trim+lowercase), válido si `PUENTE_ROLES[rol]` (2120).
- `/verificar` va ANTES de las dos puertas (2218-2220).
- `rutaSalud_(rol, via, correo)` 2452-2462 → `{ok, ts, version, rol, escribibles, destino:'google-sheets', via, correo, ia:{qwen,deepseek,gemini}}`.

### 1.5 Dónde se guarda qué (localStorage; todo del origen de la app)

| Clave | Quién escribe | Contenido | Notas |
|---|---|---|---|
| `al3d_pf_gtok` | `ingreso.js:136-138` | `{"token":"<access>","expira":<ms>}` | SOLO mientras vale (~59 min); se borra en `salir()`. NO está en `RESPALDO_KEYS` (`js/datos/cotizador.js:428`, `js/cotizador/historial.js:1574`; grep de `al3d_pf_gtok` solo da ingreso.js y los README). Razonamiento en ingreso.js:32-39. |
| `al3d_pf_ingreso` | `Prefs.setIngreso` | `{correo, clientId?}` | `Prefs.CLAVES.INGRESO` (prefs.js:38). Su existencia con `correo` enciende `Prefs.hayPuente()` (prefs.js:294-300). |
| **`al3d_pf_pase`** | `Prefs.setPase` ← `puerta.js:451` | `{correo, rol, hasta, visto}`; `hasta = now + 30 días` | `Prefs.pase()` (prefs.js:314-319) exige `correo` string, `rol ∈ ['direccion','fabricacion','pagos']`, `hasta > Date.now()`. **Lo leen a mano OTRAS páginas**: `js/tema.js:93-94` (antepuerta), `cotizador.html:73-74`, `anidador-vectores/index.html:44` (comprueban `p.correo` y `Number(p.hasta)>Date.now()`), y `window.AL3D.identidad()` (`js/mod/cotizador.js:352-355`). **Clave y forma son contrato**; pruebas/puerta.mjs:340-372 la amarra por texto en cotizador.html y anidador. |
| `al3d_pf_entrada` | `Prefs.set(CLAVES.ENTRADA, hoyISO())` puerta.js:585 | `"AAAA-MM-DD"` (JSON) | Día de la última entrada con botón. |
| `al3d_pf_rol` | Ajustes | `direccion|fabricacion|pagos` (cruda) | Solo manda si NO hay pase vivo (`Prefs.rol()` prefs.js:174-179). |
| `al3d_pf_puente` | `Prefs.setPuente` (Ajustes) | `{url?, token?, rol?, probado?}` | `Prefs.puente()` siempre devuelve `url` (la de fábrica `URL_PUENTE` prefs.js:83-84 si no hay). |
| `al3d_pf_gcal` | `Prefs.setGcal` | `{clientId, calendarioId, invitados[]}` | Solo se usa en gcal.js; por aparato. |
| `al3d_pf_ia_ok` | asistente.js:414 | `true` | «entendido» de mandar resumen a la IA. |
| `al3d_pf_fondo` | puerta.js:864-878 | `{bolsa[], ult}` | Adorno. |

### 1.6 El token de dispositivo
- Es una cadena de ≥ 30 caracteres (`uuid + uuid.slice(0,8)`) generada por el menú «⚡ AL3D → Tokens del puente» → `configurarTokensDelPuente_()` (.gs 2440-2449). Se guardan en la Script Property **`PUENTE_TOKENS`** = JSON `{token: rol}` (tres, uno por rol). `rolDelToken(token)` .gs 2281-2289 (`token.length < 30` → null).
- En el teléfono se pega en Ajustes («Salida de emergencia», ajustes.js:866-878) y se guarda con `Prefs.setPuente({...prev, url, token})` (ajustes.js:1433) en **`al3d_pf_puente`**. No viaja en respaldos (ajustes.js:878). No se vuelve a mostrar.
- Se manda como `cuerpo.token` en TODA petición (puente.js:1001), junto con `google_token` si hay.
- **Ya no abre la puerta** (puerta.js:257-265, decisión de Dirección sept-2026; `pruebas/puerta.mjs:374-382`). Sigue sirviendo: (a) sincronizar con el puente, (b) el cotizador SUELTO (`cotizador.html?solo=1`), cuyo camino `puenteCfg()` (`js/cotizador/venta.js:299-308`) y `_postHoja` (`js/cotizador/notario.js:59-85`) leen `al3d_pf_puente` y mandan solo `token`, nunca `google_token`.
- Plan lo retira en la fase 5 (docs/PLAN-SUPABASE.md:162 y :260). Eso mata el cotizador suelto salvo que se rehaga (ver 8).

### 1.7 Qué pasa al expirar (tabla)

| Qué expira | Cuándo | Efecto hoy |
|---|---|---|
| Access token de Google | ~1 h (`expires_in − 60 s`) | `dentro()`→false; `puente.js` renueva callado en la siguiente petición (tope 5 s, 1/min) o `app.js:1860-1880` en el siguiente CLIC (1/min; si `DATO_INVALIDO` → espera `MS_TRAS_NEGARSE`); tras renovar `P.reconfirmar()`. Si la ventana callada se bloquea → la petición sale solo con el token de dispositivo (si hay) y el pase no se renueva. |
| Pase | 30 días (`DIAS_PASE`, puerta.js:128) desde la última confirmación `ok` | `Prefs.pase()`→null; `custodiar()` rama 2 (renovación callada, tope 30 s) y si falla → puerta con `MSG.CADUCO`. A 7 días (`MS_AVISO`, 134) la banda dice «Te quedan N días…» (`avisoDePase`, 486-493). |
| Sesión del día | cada medianoche (`CIERRE_DIARIO`) | Primera apertura de un día nuevo (o medianoche, `vigilarElDia` 474-483, y `visibilitychange`): `Ingreso.salir()` + `Prefs.borrarPase()` + puerta con `MSG.NUEVO_DIA`. Sin señal ese primer rato no se entra (`MSG.SIN_RED_HOY`). |
| Alta revocada (correo quitado de «Accesos») | siguiente verificación | `fuera` → `Prefs.borrarPase()` + puerta con `MSG.FUERA` + botón «Entrar con otra cuenta»; si la puerta se pone con la app ya montada (`echando=true`), volver a entrar **recarga**. **NO se borra IndexedDB ni localStorage** (puerta.js:18-29; ajustes.js:1294-1295 «Lo guardado en este aparato no se borra»). |

Segunda opinión: si `/salud` dice `fuera` en el camino callado, se espera `MS_SEGUNDA_OPINION = 4000` ms y se pregunta otra vez; la segunda solo puede absolver (puerta.js:388-392). El motivo: el .gs falla cerrado y contesta el MISMO `ROL_SIN_PERMISO` ante una baja que ante un tropiezo de red (puerta.js:376-387). Además `preguntarALaHoja` trata `ROL_SIN_PERMISO` sin token vivo como `sin_red`, no como baja (puerta.js:454-460).

### 1.8 `js/nucleo/puerta.js` — parte de acceso (no los fondos)

Imports estáticos a propósito (puerta.js:58-71): `Prefs`, `Ingreso`, `Puente`, `{$, esc}`, `{hoyISO}`. Ver comentario 58-67.

Constantes: `CIERRE_DIARIO=true` (125) · `DIAS_PASE=30`, `MS_PASE` (128-129) · `MS_AVISO=7d` (134) · `MS_CALLADO=30000` (306) · `MS_CON_PANTALLA=180000` (307) · `MS_SEGUNDA_OPINION=4000` (311) · `PASOS_PUERTA = [{clave:'google', texto:'Google · tu cuenta'}, {clave:'hoja', texto:'La hoja · qué te toca'}]` (672-675) · `MSG` (148-160: `FUERA(correo)` con `fuera:true`, `SIN_RED_PRIMERA`, `NUEVO_DIA(correo)`, `SIN_RED_HOY`, `CADUCO(correo)`).

`export async function custodiar(avisar)` (176-266) devuelve una Promesa que SOLO resuelve cuando hay derecho a pasar: `{ok:true, via:'local'|'google', correo, rol, nota}`. Ramas, en orden:
- **0** `esCopiaLocal()` (271-276: `file:` | `localhost` | `127.0.0.1` | hostname vacío — exactamente 3 comparaciones `h === '…'`, lo vigila puerta.mjs:260-263) → `dentro('local','', Prefs.rol())`.
- **0b** `CIERRE_DIARIO && Prefs.get(CLAVES.ENTRADA,'') !== hoyISO()` → `_delDia=true; Ingreso.salir(); Prefs.borrarPase(); return pedirEntrada(MSG.NUEVO_DIA(quien)|null)`.
- **1 pase vivo** (`Prefs.pase()`): entra YA (`dentro('google', p.correo, p.rol, avisoDePase(p))`), y por detrás `confirmarSuelto(false).real.then(…)`: `fuera` → `borrarPase()` + `pedirEntrada(MSG.FUERA, null, true)`; `ok` con rol distinto → `location.reload()`; `ok` igual → `avisar('')`. + `vigilarElDia()`.
- **2 había entrado antes** (`correoPrevio` del pase viejo o de `Prefs.ingreso().correo`): `confirmarSuelto(false).conTope` (30 s): `ok` → entra; `fuera` → `borrarPase()` + puerta `MSG.FUERA`; `tarde` → puerta (con la promesa viva por si contesta).
- **3** nunca entró → `pedirEntrada(null)`.

`confirmarDeVerdad(conPantalla, alPaso)` (348-399): `paso('google','trabaja')` **síncrono** antes de `await Ingreso.entrar(false)` (con pantalla) o `await Ingreso.renovar()` (callado) → falla ⇒ `{estado:'sin_red', mensaje}` y nunca `fuera` (puerta.mjs:233-239) → `paso('google','ok', correo)` → `preguntarALaHoja()` → segunda opinión → `paso('hoja', ok|mal)`.
`preguntarALaHoja()` (444-465): `Puente.desdePrefs().salud()`; si `s.ok && s.via==='google' && s.correo && Prefs.ROLES.includes(s.rol)` → `Prefs.setPase({correo, rol, hasta: now+MS_PASE, visto: now})` → `{estado:'ok', correo, rol}`; `s.codigo==='ROL_SIN_PERMISO'` → `fuera` (si `Ingreso.dentro()`) o `sin_red`; `s.ok && s.via!=='google'` → `sin_red` (el token de dispositivo no da pase). Tres desenlaces: **`ok | fuera | sin_red`** (puerta.mjs:248-250 exige UNA sola aparición de `return { estado: 'fuera'`).
`reconfirmar()` (419-441): la llama app.js:1873 tras renovar por clic; solo con `Ingreso.dentro()`.
`pedirEntrada(av, pendiente, echando)` (510-666): pinta `#pf-puerta` (existe en index.html:430), inerta el resto del body, `Ingreso.cargarGis()` precargado (569), clic en `button[data-puerta]` → `arrancarPasos` + `pedirConGoogle(btn, t, otra)` (usa `window.Piezas.trabajando` y `P.traza`); éxito: «Adentro» 900 ms + 240 ms, `Prefs.set(ENTRADA, hoyISO())`, `vigilarElDia()`, resuelve `dentro('google', r.correo, r.rol)`.
`export function salir()` (1291-1295): `Ingreso.salir(); Prefs.borrarPase(); location.reload()`. La llaman `cuenta.js:86-87`, `ajustes.js:1323-1324`.
`export function sinPuerta()` (1275-1287). `Prefs.rol()` = rol del pase vivo (prefs.js:174-183).
Consumidor: `app.js:1594-1640` (`await Puerta.custodiar(nota=>…)`, `_quien`, `cuenta.montar(_quien)`).

### 1.9 `js/nucleo/cuenta.js` (90 líneas)
Pinta el disco de la cuenta (`#pf-sesion`), recibe `quien = {correo, rol}` de `custodiar()` (no consulta nada). Menú: Ajustes / «Cerrar sesión» (`confirmarPf` → `Puerta.salir()`, 83-88). Texto fijo: «Tu sesión se queda guardada en este aparato…» (38). **Con Supabase no cambia salvo que `Puerta.salir` pase a async.**

---------------------------------------------------------------------------------------------------

## 2. Qué habría que cambiar para Supabase Auth con Google, manteniendo la UX de la puerta

### 2.1 Hecho que condiciona todo
`signInWithIdToken({provider:'google', token})` necesita un **ID token (JWT OIDC)** cuyo `aud` esté en los client IDs autorizados de Supabase (NO CONFIRMADO desde el repo: es conocimiento general de Supabase). El código de hoy usa `initTokenClient` (**access token opaco**, `ingreso.js:234`; nunca lee `id_token`). **Ese token no sirve para `signInWithIdToken`.** Hay que cambiar de API de GIS o usar el OAuth con redirección de Supabase.

### 2.2 Opciones (todas dejan intacto: `Prefs.pase()`, `ROLES`, `AL3D.identidad()`, y el contrato `{estado:'ok'|'fuera'|'sin_red', correo, rol}` de la puerta)

| Opción | Cómo | UX de la puerta | Riesgos / costo |
|---|---|---|---|
| **A. `signInWithOAuth` con redirección completa** | Botón actual → `supabase.auth.signInWithOAuth({provider:'google', options:{redirectTo, queryParams:{login_hint: correo}}})`; al volver, supabase-js (`detectSessionInUrl`, PKCE) canjea `?code=` y deja sesión. `custodiar()` en la carga siguiente ve sesión. | Botón y fondos iguales. **Se pierde** el progreso en vivo de los dos pasos (la página se va y vuelve) y el «Adentro» 900 ms del mismo documento; se elimina el problema de ventana bloqueada y `MS_CON_PANTALLA`. | `redirectTo` debe estar en la lista de URLs de Supabase (`https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/` y `https://cotizador-al3d.pages.dev/`); el cliente de Google necesita añadir el URI de redirección `https://<ref>.supabase.co/auth/v1/callback` (hoy está VACÍO a propósito, gcal.js:516) y el secreto del cliente va al panel de Supabase, no al repo (plan 4.12). **PWA instalada en iPhone: navegar a accounts.google.com sale del alcance** (`manifest.webmanifest` `scope:"./"`); NO CONFIRMADO cómo se comporta, hay que probarlo en el aparato. Desde el cotizador empotrado (`AL3D.sesion()`) la redirección navegaría la ventana padre; el cotizador autoguarda `al3d_q` en cada tecla (mod/cotizador.js:321). El SW sirve `/?code=…` desde caché porque `plataforma()` usa `ignoreSearch:true` (sw.js:369). |
| **B. ID token con GIS (`google.accounts.id`) + `signInWithIdToken`** | `google.accounts.id.initialize({client_id: CLIENT_ID, callback, nonce…})` + `renderButton`; el callback recibe `credential` (JWT) → `supabase.auth.signInWithIdToken({provider:'google', token, nonce})`. Mismo `CLIENT_ID` (hay que listarlo en «Authorized Client IDs»; NO CONFIRMADO el nombre exacto del campo). | Sin recarga y sin ventana bloqueable (la abre el iframe de Google), pero **el botón es el de Google** (`renderButton`: tema/tamaño/texto limitados) y no `.puerta-btn` con la G propia, `P.trabajando` ni «Entrar con otra cuenta». One Tap (`prompt()`) no sirve como botón: se suprime tras descartarlo. | CSP de index.html ya permite `https://accounts.google.com` en script/style/frame/connect. Nonce: Supabase pide pasar el nonce hasheado a GIS y el crudo a `signInWithIdToken`, o desactivar la comprobación (NO CONFIRMADO). |
| **C. Popup propio con `signInWithOAuth({skipBrowserRedirect:true})`** | Abrir `window.open('', 'al3d-google', …)` SÍNCRONO en el clic y asignarle luego `data.url`; el `redirectTo` apunta a una página de retorno nueva que cierra la ventana; la ventana principal se entera por `onAuthStateChange`/almacenamiento. | Casi idéntica a hoy (popup + pasos en vivo). | Página nueva (HTML con CSP, entrada en `APP_FILES`, `PAGINAS` de sw.js, pruebas `publicacion.mjs`/`csp.mjs`). Complejidad mayor. Sincronización entre ventanas de supabase-js: NO CONFIRMADO en la versión que se vendorice. |
| **D. `initCodeClient` (popup) + Edge Function que canjea el code → `signInWithIdToken`** | Mantiene botón y popup. | 1:1 con hoy. | Edge Function nueva con el secreto del cliente de Google; más piezas. Solo si Elías exige UX idéntica. |

Recomendación técnica (a decidir con Elías, ver preguntas abiertas): **A** como más simple y robusta; **C** si se exige conservar los dos pasos en vivo.

### 2.3 Cambios por archivo (para cualquier opción)

**Nuevo `js/datos/supabase.js`** (nombre sugerido; no existe): constantes públicas `SUPABASE_URL`, `SUPABASE_ANON_KEY` (la `anon` es pública, plan 4.12); `cliente()` perezoso que llame a `createClient(URL, KEY, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:<A: true | B: false>, flowType:'pkce', storageKey:<propio>}})`. Debe tolerar `globalThis.supabase` ausente (los `.mjs` de node importan `ingreso.js`/`puente.js` sin DOM). Escribir `const SUPABASE_URL = 'https://…'` como literal para que una regex nueva de `csp.mjs` lo vea.

**`js/nucleo/ingreso.js`** — conservar el MISMO API exportado (`configurado, correo, dentro, token, entrar, renovar, salir, cargarGis, clienteId, CLIENT_ID, ORIGENES, URL_APP, origenAutorizado`) para no tocar a: `puerta.js`, `puente.js`, `app.js:1867-1870`, `ajustes.js:1266-1306`, `mod/cotizador.js:357-359`, `gcal.js:44` (`cargarGis`). Cambios:
- `dentro()` es **síncrona** y se llama en caminos síncronos (puente.js:944, puerta.js:421/458, app.js:1868). supabase-js es asíncrono: mantener un espejo en memoria `_tok = {token: session.access_token, expira: session.expires_at*1000 − 60000}` actualizado por `onAuthStateChange` (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT).
- `entrar()` → opción elegida (A/B/C). Se puede quitar `SCOPE`, `preguntarCorreo` (el correo sale de `session.user.email`), `userinfo` y el origen-check de Google **solo si** ya no se usa GIS token-model para Calendar con este módulo (gcal.js sigue necesitando `cargarGis`).
- `renovar()` → `getSession()`/refresh automático; **desaparece la ventana callada** (y con ella `MS_RENOVAR`, `MS_ENTRE_RENOVACIONES`, el freno por clic de app.js:1844-1880 y los tests blindaje:176-194).
- `salir()` → `supabase.auth.signOut({scope:'local'})` (solo este aparato) **y** borrar `al3d_pf_gtok` heredada. Como es asíncrona, `Puerta.salir()` (hoy síncrona, 1291) debe `await` antes de `location.reload()`; `cuenta.js:87` y `ajustes.js:1324` ya la llaman con `await`/sin él.
- La sesión de supabase-js persiste un **refresh token en localStorage** (clave `sb-<ref>-auth-token` por omisión; NO CONFIRMADO). Hoy ningún token de larga vida se guarda (gcal.js:30-32, ingreso.js:32-39, README.md:326). Es una credencial más duradera que `al3d_pf_gtok`: decidirlo y documentarlo. Un `storage` propio permitiría usar otra clave.

**`js/nucleo/puerta.js`**:
- `preguntarALaHoja()` (444-465) → p. ej. `preguntarAlAcceso()`: con sesión viva, consultar la membresía (`select` a `miembros` con RLS o una RPC `mi_acceso()`), y devolver el MISMO `{estado, correo, rol}`; escribir `Prefs.setPase({correo, rol, hasta, visto})` igual que hoy. `rol` = `miembros.area` (`direccion|fabricacion|pagos`, idénticos a `Prefs.ROLES`).
- **`fuera` debe salir solo de «consulta exitosa sin fila»**. Hoy sale de `codigo==='ROL_SIN_PERMISO'` (454-460). PostgREST con RLS devuelve lista vacía, no error: no confundir con fallo de red ni con JWT vencido (`401`); los errores de red/401 deben ir a `sin_red` (puerta.mjs:241-250 lo vigila por texto).
- `PASOS_PUERTA` (672-675): rótulo `'La hoja · qué te toca'` ya no es cierto → `'Tu acceso · qué te toca'` o similar; `pf-esqueleto.mjs:167` amarra la regex `{ clave: 'google'…},\s*{ clave: 'hoja'`.
- `CIERRE_DIARIO` (192-198): `Ingreso.salir()` debe cerrar la sesión local de Supabase; el resto de la lógica del día no cambia. Con refresh token el «renovar callado» deja de depender de Google, pero el cierre diario sigue obligando a tocar el botón.
- Decisión del plan 4.8: «el teléfono borra su copia local al siguiente contacto» **NO existe hoy**; sería código nuevo en las 4 salidas `fuera` (puerta.js:225-227, 246, 427-430, 609) y en `salir()`. Hoy explícitamente NO se borra (ver 1.7).
- `esCopiaLocal()` (271-276) exime `file:`/localhost/127.0.0.1: con RLS, esa copia no tendrá sesión y no leerá datos de Supabase; la capa de sync debe tolerar «sin sesión» (las 17+ pruebas de navegador corren ahí).

**`js/datos/puente.js`** — `tokenDeGoogle()` (943-957), `pedir()` (963-1050) y `hablar()` (1061) son los puntos de conexión con el puente actual; otros mapas cubren su reemplazo. Lo que afecta a login: (1) `cuerpo.google_token` deja de existir; Supabase usa `Authorization: Bearer <access_token de Supabase>` que pone el cliente solo. (2) **Dejar `window.AL3D.hablar(ruta, cuerpo, espera)` (mod/cotizador.js:362) con el mismo contrato** (devuelve el cuerpo `{ok, codigo, mensaje, …}` y solo lanza por red o `ROL_SIN_PERMISO` con `e.codigo`): lo consumen `notario.js:59-65`, `ia.js:876` y `asistente.js:785`.

**`js/mod/cotizador.js:350-377` (`window.AL3D`)**: conservar `identidad()` (desde `Prefs.pase()`), `hablar`, `avisar`; `sesion()` (356-361) hoy llama `Ingreso.entrar(false)` dentro de un toque.

**`js/app.js`**: 1844-1880 (renovación por clic) se elimina o se reduce; 1594-1609 sin cambios si `custodiar()` conserva firma.

**`js/mod/ajustes.js:1261-1325`** (`bloqueIngreso`, `entrarConGoogle`, `salirDeGoogle`): textos que dicen «la pestaña Accesos de la hoja» (1276-1277, 1289-1293) y `Prefs.ROL_LO_MANDA_LA_HOJA` (prefs.js:204-206) ya no serán ciertos.

**`js/datos/prefs.js`**: `hayPuente()` (294-300) depende de `p.token` o `Prefs.ingreso().correo`; `puente()`/`URL_PUENTE` (83-84) los consumen `verificar.html:163`, `puerta.js`, `puente.js`. `ROL_NO_ES_SEGURIDAD`/`ROL_LO_MANDA_LA_HOJA` (201-206).

**`miembros` (plan)**: plan 4.7 dice `miembros(usuario_id, empresa_id, area)` pero 4.8 dice «Dirección agrega un renglón en miembros (correo, área)» **antes** de que la persona haya entrado (no existe aún `auth.users.id`). Hoy «Accesos» va por **correo en minúsculas** (.gs:2368-2373). Hace falta clave por correo (o tabla de invitaciones + enlace en el primer ingreso) y exigir correo verificado. Un `auth.users` sin fila en `miembros` = estado `fuera`.

### 2.4 Qué NO cambia
`Prefs.pase()`/`setPase`/`borrarPase`, `Prefs.rol()`, `Prefs.veDinero()`, `ROLES`, `window.AL3D.identidad()`, la antepuerta de `js/tema.js:87-97`, las compuertas de `cotizador.html:68-76` y `anidador-vectores/index.html:~44` (leen `al3d_pf_pase`), `cuenta.js`, el marcado `#pf-puerta` de index.html:430, los fondos (`puerta-fondos.js`).

---------------------------------------------------------------------------------------------------

## 3. CSP — texto EXACTO de cada HTML y lo que verifican las pruebas

Todas las políticas van en `<meta http-equiv="Content-Security-Policy">` (GitHub Pages no manda cabeceras). `_headers` (Cloudflare Pages, solo lo lee Cloudflare) NO contiene `connect-src`: solo `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy: frame-ancestors 'self'` y `X-Frame-Options: SAMEORIGIN` en `/*`, más `X-Robots-Tag: noindex` en rutas de docs. **No hace falta tocarlo.**

### 3.1 Políticas exactas (copiadas con grep del contenido del atributo)

`index.html:24` (la PLATAFORMA)
```
default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.basemaps.cartocdn.com; connect-src 'self' https://www.googleapis.com https://accounts.google.com https://script.google.com https://script.googleusercontent.com https://nominatim.openstreetmap.org; frame-src 'self' https://accounts.google.com; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'
```
`cotizador.html:10`
```
default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' data: blob: https://script.google.com https://script.googleusercontent.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; frame-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'self'
```
`verificar.html:6`
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src https://script.google.com https://script.googleusercontent.com; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'
```
`acerca.html:6`, `privacidad.html:6`, `condiciones.html:6` (idénticas)
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'
```
`plataforma.html:9` (reenvío; `<html>` sin `<head>`)
```
default-src 'none'; script-src 'sha256-Mwe/goL4lDQTPlGfHQxgGJhVYadc8bK3BP6TuBg6qzM='; object-src 'none'; base-uri 'none'; form-action 'self'
```
`anidador-vectores/index.html:10`
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'
```
`publicaciones/index.html:11` / `publicaciones/motor.html:10`
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' data: blob:; media-src 'self' blob:; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'
```
Otros `<head>` de las páginas (para el SW y scripts): `index.html` → `<link rel="manifest" href="manifest.webmanifest">` (28), `<script src="js/tema.js">` (64), `./js/piezas.js` clásico (447), `<link rel="modulepreload">` de `./js/nucleo/puerta.js`, `./js/nucleo/ingreso.js`, `./js/datos/puente.js` (451-453), `<script type="module" src="./js/app.js">` (454). **No hay `<script type="importmap">` en ningún HTML.** `cotizador.html` carga `js/tema.js` (79) y al final 15 `<script src>` clásicos: `vendor/qrcodegen.js` (1093), `js/piezas.js` (1095) y los 13 de `js/cotizador/` terminando en `arranque.js` (1096-1108); tiene varios scripts en línea (50, 68, 92…) y `onload` en el `<link>` de fuentes (21), por eso su `script-src` lleva `'unsafe-inline'`.

### 3.2 Qué hay que cambiar para permitir Supabase

Todos los servicios de Supabase cuelgan del host `https://<ref>.supabase.co`: REST `/rest/v1`, Auth `/auth/v1`, Storage `/storage/v1`, Functions `/functions/v1`, Realtime `wss://<ref>.supabase.co/realtime/v1/websocket` (NO CONFIRMADO desde el repo: no hay proyecto aún; conocimiento general). supabase-js podría usar el host `<ref>.functions.supabase.co` para Functions según versión (NO CONFIRMADO; `https://*.supabase.co` lo cubriría).

| Página | Cambio |
|---|---|
| **index.html** | `connect-src` += `https://<ref>.supabase.co wss://<ref>.supabase.co` (el plan dice `https://*.supabase.co wss://*.supabase.co`: el comodín deja hablar con CUALQUIER proyecto Supabase, que es el mismo debilitamiento que ya reconoce el comentario de index.html:15-21 para script.google.com; recomendable el host exacto). `wss:` hay que listarlo explícito: un origen `https:` no cubre solicitudes `wss:` (CSP3; NO CONFIRMADO en cada navegador). `img-src` += el host solo si se muestran `<img src>` de URLs firmadas de Storage (los blobs ya están en `blob:`). **`script-src` NO cambia** si supabase-js se sirve desde `'self'` (`vendor/`). Si se usa GIS-ID (opción B) tampoco: `accounts.google.com` ya está en script/style/frame/connect. Si se usa redirección, la navegación no la restringe ninguna directiva presente (`form-action 'self'` solo aplica a formularios). |
| **cotizador.html** | Sin cambio **si todo se enruta por `window.AL3D`** (en el marco, las llamadas las hace el código de la ventana padre, con la CSP del padre). El cotizador suelto `?solo=1` seguiría hablando solo con Apps Script (ver 8). Si el cotizador llamara a Supabase directo, `connect-src` += host, `script-src` += lo que cargara. |
| **verificar.html** | Solo si `/verificar` pasa a Edge Function: `connect-src` += `https://<ref>.supabase.co` (NO lleva `'self'`, hoy solo las dos de Apps Script). Hoy hace `fetch(URL_PUENTE, {method:'POST', redirect:'follow', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({ruta:'verificar', f, c})})` (verificar.html:410-413) e importa `URL_PUENTE` de `prefs.js` (163). Una función pública necesita CORS y `verify_jwt` apagado (NO CONFIRMADO detalles); `text/plain` evita el preflight. En la transición conviene dejar ambas políticas porque `csp.mjs:102` exige la hoja. |
| acerca / privacidad / condiciones | Ninguno (`connect-src 'self'` exacto lo exige `csp.mjs:104`). Texto de privacidad: plan 4.9. |
| anidador / publicaciones / plataforma.html | Ninguno. |

### 3.3 Qué verifica `pruebas/csp.mjs` (224 líneas) — y qué romperá o no vigilará

1. **L33-35 PAGINAS (10 páginas)**; **L64-75**: cada una trae meta CSP con regex exacta `<meta http-equiv="Content-Security-Policy" content="([^"]+)">` (comillas dobles, sin `"` dentro) y va ANTES del primer `<script` (tras quitar comentarios).
2. **L77-89 negativas**: ningún `*`, `https:` ni `http:` sueltos (un `https://*.supabase.co` SÍ pasa); sin `'unsafe-eval'`; `object-src` = `['\'none\'']`; `base-uri` = `['\'none\'']`; `form-action` = `'self'`; **ninguna página tiene en `connect-src` hosts de IA** (`dashscope-intl.aliyuncs.com`, `api.deepseek.com`, `generativelanguage.googleapis.com`) — la IA debe seguir yendo por la función, no directa.
3. **L91-104 «lo que cada página necesita»**: index permite hoja (`https://script.google.com/macros/s/x/exec`) y la redirección (`https://script.googleusercontent.com/macros/echo`) por `connect-src`; `script-src` permite `https://accounts.google.com/gsi/client`; `connect-src` permite `https://www.googleapis.com/oauth2/v3/userinfo`; `frame-src` permite `https://accounts.google.com/gsi/iframe` y `'self'`; `img-src` permite tiles de OSM y Carto. cotizador: hoja+redirección, pdf.js 3.11.174 por `script-src` y `worker-src`, `frame-src` incluye `data:`, **no** permite el guion GIS. verificar: hoja+redirección y `connect-src` **no incluye `'self'`**. Las tres de texto: `connect-src` exactamente `["'self'"]`.
4. **L106-146 «el código cabe en su política»**: recorre todos los `.js` de `js/`, `anidador-vectores/js`, `publicaciones/js` (sin comentarios) buscando 6 formas: `fetch('https://…`, `.src = 'https://….js'`, `workerSrc = '…'`, `const GIS = '…'`, `url: '…{z}…'`, `const API = '…'`; cada hallazgo debe estar permitido en SU página (`js/cotizador/*`→cotizador.html; anidador; publicaciones; todo lo demás→index.html). `vistos.length >= 6`. Geo (nominatim) comprobado aparte (145-146). **El host de Supabase no lo detecta ninguna de esas regexes** (se pasaría `createClient(URL, KEY)` con una constante): conviene añadir una regex (`const SUPABASE_URL = '…'`→`connect-src`) y una regla `wss`.
5. **`permite(pol, directiva, url)` L50-61**: solo entiende fuentes `https?://` (`if (!/^https?:\/\//.test(f)) return false;`, L56) y `*.`; **una fuente `wss://…` siempre da false** → ampliar para `wss:`.
6. **L148-192 guiones en línea**: `SIN_EN_LINEA = index, acerca, privacidad, condiciones, plataforma, publicaciones/index, publicaciones/motor` (L156-157): `script-src` sin `'unsafe-inline'`, sin atributos `on…=`, y **todo `<script>` sin `src` debe tener su `sha256` en la política**. Un `<script type="importmap">` en línea cuenta como guion en línea (necesitaría hash) → **no usar import map**; usar rutas relativas. Además: ningún módulo de `js/app.js`, `js/mod`, `js/nucleo`, `js/datos` escribe `on…="` en su marcado (L183-186); el `<link>` de tipografías de index lleva `data-fuentes`; la nota de index.html «A dónde puede hablar esta página» debe seguir diciendo `CUALQUIER Apps Script` y **no** contener `no tendría a qué servidor` (L187-191): si se reescribe el comentario de index.html:5-23 para hablar de Supabase, conservar esa frase.
7. L194-204 (publicaciones no hablan con nadie), L206-221 (frame-busting de `js/tema.js`, todas las páginas cargan `js/tema.js` menos `plataforma.html`).

`pruebas/blindaje-de-la-app.mjs` (261 líneas; importa `prefs.js`, `gcal.js`, `ingreso.js` en NODE con `localStorage` y `google.accounts.oauth2.initTokenClient` de mentira, L36-58):
- L60-93 gcal: `error_callback` (popup_closed → «cerró la ventana»; popup_failed_to_open → «bloqueó la ventana»), un cliente por Client ID (`initTokenClient` recibe `client_id` y `scope` `https://www.googleapis.com/auth/calendar.events`), `MS_VENTANA` ≥ 60000 con el `setTimeout(() => fin(mal('SIN_RED', MSG.SIN_RESPUESTA)), MS_VENTANA)`. **Siguen valiendo** (gcal no cambia).
- L95-113 ingreso: `Ingreso.entrar(false)` usa el `clientId` de `Prefs.setIngreso`, scope `'openid email'`, un cliente por id, `error_callback popup_closed` ⇒ `r.codigo === 'DATO_INVALIDO'`. **Se rompen** si `entrar()` deja de usar `initTokenClient`.
- L115-140 restauración de respaldo; L142-174 versión nueva/sync (app.js por texto); **L176-194 «el permiso de Google con freno»**: regexes sobre app.js (`MS_ENTRE_RENOVACIONES = 60000` tanto en app.js como en puente.js, `_renovadoEn = Date.now()` antes de `await Ingreso.renovar()`, `P.reconfirmar()` sin await) y sobre puerta.js (`reconfirmar` contiene `await confirmarDeVerdad(false)`, `if (!Ingreso.dentro()) return;`, `r.estado === 'fuera'…borrarPase()…pedirEntrada(MSG.FUERA(…), null, true)`, `r.rol !== rolAntes) { location.reload()`, `_avisar('')`). **Se rompen** al quitar la renovación por clic o renombrar estas piezas.
- L196-209 poda de marcos, L211-222 instalar, L224-239 mesa de corte, L241-258 smooth/`sw.js`: `PAGINAS` debe aceptar `/verificar`, `/verificar.html`, `/cotizador`; el conteo de guiones del cotizador contra las frases de sw.js.

`pruebas/ingreso.mjs` (226 líneas): **L1-206 prueban el Apps Script** (`identidadDelIngreso`: audiencia, correo verificado, mayúsculas, rol inventado, sin pestaña «Accesos», falla cerrado, caché, 3 roles) evaluando `puente/hoja-apps-script.gs` en `vm`; **siguen valiendo mientras el .gs conserve `carpetas`/`espejo`** y hasta que se retire (fase 5). **L208-223** importan `ingreso.js` en node (`I.origenAutorizado('https://eliasgaribi-ctrl-z.github.io')`, `…pages.dev`, rechazo de `https://al3d.pages.dev`, `'null'`, `http://localhost:8080`, `''` → true) y exigen `indexOf('origenAutorizado(origenActual())') < indexOf('await cargarGis()')`.

`pruebas/puerta.mjs` (399 líneas): L55-111 pase y rol (puras, siguen valiendo); L113-140 `URL_PUENTE` https y `hayPuente` con `al3d_pf_ingreso`; L153-173 `Puente.desdePrefs()`/`crear()` (no devuelven null sin token); **L179-338 «lo que la puerta promete» por TEXTO de puerta.js**: `Promise.race`, `MS_CALLADO`, `MS_CON_PANTALLA` (≥ 60000 y > MS_CALLADO), `MS_CALLADO > MS_ESPERA` de puente.js, `MS_SEGUNDA_OPINION`, `v2.estado !== 'fuera'`, `if (!Ingreso.dentro()) return { estado: 'sin_red' };`, `DIAS_PASE` entre 7 y 90, `s.via === 'google'`, `codigo === 'ROL_SIN_PERMISO'…estado: 'fuera'` con UNA sola aparición, `if (esCopiaLocal()) return dentro('local'`, app.js (`await Puerta.custodiar(` antes de `await montar(rutaDelHash())`, `registrarSW();` antes de la puerta y una sola vez), `sw.js` contiene `'./js/nucleo/puerta.js'`; L340-372 compuertas de cotizador.html y anidador (`localStorage.getItem('al3d_pf_pase')`, `Number(p.hasta)>Date.now()`, `if(parent!==window)return;`, `location.replace('./#/cotizador'|'../#/anidador')`, **no** leer `al3d_pf_puente`); L374-396 sin `dentro('token'`, `sinPuerta();`, `closest('button[data-puerta]')` + `caja.contains(b)`.
También por texto: `pruebas/pf-esqueleto.mjs:151-179` (`await Ingreso.entrar(false)` literal en puerta.js, `paso('google', 'trabaja'); const e = conPantalla`, `PASOS_PUERTA`, `pedirConGoogle(btn, t, otra)`, `hermanos: otra ? [otra] : []`); navegador: `pruebas/navegador/puerta.mjs` (aborta toda petición que no sea al3d.prueba/127.0.0.1, L66; siembra `al3d_pf_pase`/`al3d_pf_entrada`), `pf-fabricacion.mjs:107` y `pf-esqueleto.mjs:858-864` (doble de `initTokenClient`).

---------------------------------------------------------------------------------------------------

## 4. Service worker (`sw.js`, 552 líneas)

- **APP_VERSION = 94** (sw.js:43). `CACHE = 'al3d-v1'` (cotizador/marca, red primero, no cambia) y `APP = 'al3d-app-' + APP_VERSION` (plataforma, caché primero).
- **BASICOS** (50-53): manifest, logos, iconos; se guardan de uno en uno con `{cache:'reload'}` y `catch` en `al3d-v1`.
- **APP_FILES**: líneas 57-199, **115 entradas** (cuenta hecha con script; README.md:368 dice «ciento quince»). Incluye `./`, `./index.html`, `./plataforma.html`, manifests, css, las 4 públicas (`acerca`, `privacidad`, `condiciones`, `verificar`) + `css/publico.css`, `js/tema.js`, `js/piezas.js`, `cotizador.html` + 13 `js/cotizador/*`, `js/app.js`, todos los módulos `js/nucleo/*` (incl. `gcal.js`, `ingreso.js`, `puerta.js`, `puerta-fondos.js`, `cuenta.js`, `asistente.js`), `js/datos/*`, `js/mod/*`, `datos/semilla.json`, **`vendor/qrcodegen.js`, `vendor/leaflet.css`, `vendor/leaflet-src.esm.js`, `vendor/images/*`**, anidador (13), `vendor/html-to-image.js`, publicaciones.
- **install** (231-313): `BASICOS` best-effort; `caches.open(APP).addAll(APP_FILES.map(u => new Request(u,{cache:'reload'})))` **todo o nada**; si falla y hay una `al3d-app-*` anterior → `throw` (el SW viejo sigue sirviendo); en primera instalación se sigue (el cotizador vale más). `skipWaiting()` al final.
- **activate** (315-338): borra toda caché que no sea `al3d-v1` ni la `APP` vigente; borra `./` e `./index.html` de `al3d-v1`; `clients.claim()`.
- **fetch** (340-358): solo GET; **`if (url.origin !== self.location.origin) return;` (354)** → peticiones a Supabase (REST/Auth/Functions), Google y OSM NO pasan por el SW; los WebSocket de Realtime tampoco son `fetch`. `esDeLaPlataforma(url)` (217-229): pathname termina en `/`, `PAGINAS = /\/(index|cotizador|plataforma|acerca|privacidad|condiciones|verificar)(\.html)?$/` (216), `manifest-plataforma.webmanifest`, `/anidador-vectores/`, `/publicaciones/`, o **`/\/(css|js|vendor|datos)\//`** (228) → `plataforma(req)`; todo lo demás → `cotizador(req)` (red primero, copia en `al3d-v1`).
- `plataforma(req)` (367-409): `c.match(req, {ignoreSearch:true})` → si hay, `revalidar(req)` (un `fetch(…, {cache:'no-cache'})` con tope 5 s, no escribe en la caché) y devuelve la copia (`sinRedireccion`); si no está → red + `c.put` si `ok`; sin red: navegación → `./index.html`; si no, `sinSenal()` (503 HTML) o 503 de texto. **Los archivos solo se actualizan por un `install` nuevo**, es decir, hay que subir `APP_VERSION` (o cualquier byte de sw.js).
- Registro: `app.js:2182-2242` (`register('sw.js')`, recarga una vez al cambiar de controlador).

**Qué hacer al agregar un archivo vendor (supabase-js) o módulos nuevos:**
1. Añadirlo a `APP_FILES` (sw.js:57-199) con ruta `./vendor/<archivo>` (los `.js` de `js/` están obligados por `pruebas/publicacion.mjs:89-95`; `vendor/` NO se cuenta salvo `vendor/html-to-image.js`, `publicacion.mjs:127` → hay que ponerlo a mano). Si falta en el servidor, `addAll` rechaza y la plataforma no se actualiza en ningún teléfono que ya la tenía (publicacion.mjs:55-68 comprueba que lo prometido existe).
2. **Subir `APP_VERSION`** (94 → 95).
3. `README.md:368` («Son ciento quince archivos que se cargan en orden…») **y** el mapa `NUM` de `pruebas/publicacion.mjs:219-222`, que termina en `'ciento quince': 115`: cada archivo nuevo en APP_FILES exige añadir la palabra al `NUM` y cambiar el README (publicacion.mjs:223-226).
4. Si se añaden módulos nuevos bajo `js/` (p. ej. `js/datos/supabase.js`): actualizar las frases de sw.js «**La plataforma son 42 módulos ES**» (sw.js:30) y «**la plataforma pide 42 módulos al arrancar**» (sw.js:512), que `publicacion.mjs:235-244` compara con el conteo real (42 hoy, sin contar `tema.js`, `piezas.js` ni `js/cotizador/`). Añadir `<link rel="modulepreload">` en index.html:451-453 si la puerta lo importa estáticamente.
5. Si se añade una página HTML nueva (p. ej. retorno de OAuth, opción C): ampliar `PAGINAS` (sw.js:216) y `esDeLaPlataforma`, y la lista `PAGINAS` de `csp.mjs:33-35`; sin ello cae en la ruta «red primero» del cotizador.
6. Licencia y créditos (ver 5): `pruebas/navegador/publicas.mjs:512` exige **exactamente 3** `<code>` de archivos de licencia en `acerca.html#creditos` (hoy SVGnest, Leaflet, qrcodegen); añadir una cuarta rompe la prueba hasta actualizarla.
7. Los cambios de CSP van en el `<meta>` de index.html (que está en APP_FILES): también exigen subir `APP_VERSION` para llegar a los teléfonos.

---------------------------------------------------------------------------------------------------

## 5. Cómo se cargan las librerías de `vendor/` y cómo vendorizar `@supabase/supabase-js` sin bundler

Estado actual (`vendor/`): `html-to-image.js` (19 570 B), `leaflet-src.esm.js` (424 545 B), `leaflet.css`, `qrcodegen.js` (32 845 B), `images/*`, y `*-LICENSE.txt` de cada una.

| Librería | Carga | Dónde |
|---|---|---|
| Leaflet | **ES module vendorizado**, import estático relativo: `import * as L from '../../vendor/leaflet-src.esm.js';` (`js/mod/mapa.js:47`; comentario 40-44: sin default export, no se puede colgar en `window`). CSS por `<link>` (index.html:67). | solo cuando se monta `mapa.js` |
| qrcodegen | **Script clásico**, `<script src="vendor/qrcodegen.js">` (`cotizador.html:1093`) | cotizador |
| html-to-image | **Script clásico `defer`** (`publicaciones/index.html:33`, `motor.html:22`) | Publicaciones |
| pdf.js | **Inyección de `<script>` con `integrity` SRI + `crossOrigin`** desde `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js` (`escalador.js:345`, `vectorizador.js:208`) | cotizador |
| Google GIS | inyección de `<script async defer data-gis>` (`ingreso.js:176-199`) | plataforma |

No hay `package.json`, ni bundler, ni import map; el repo se publica tal cual en Pages («Módulos ES nativos, sin build y sin bundler», index.html:440-444). `pruebas/sintaxis.mjs:37` ignora `vendor/` al comprobar sintaxis.

**Metadatos de npm (consulta de solo lectura, sin descargar paquetes):** `@supabase/supabase-js` versión **2.117.3**; `main: dist/index.cjs`, `module: dist/index.mjs`, `jsdelivr`/`unpkg`: **`dist/umd/supabase.js`**; `exports["./dist/*"]` abierto; dependencias exactas del mismo número de versión: `@supabase/auth-js`, `storage-js`, `realtime-js`, `functions-js`, `postgrest-js`. Un `HEAD` a jsDelivr confirmó que existen `dist/umd/supabase.js` y `dist/index.mjs` en 2.117.3 (HTTP 200; sin `Content-Length`). **NO CONFIRMADO**: tamaño de cada uno; si `dist/index.mjs` trae los paquetes `@supabase/*` dentro o los importa como especificadores desnudos (no se descargó el archivo). Licencia MIT (consulta `npm view … license` truncada por la salida; NO CONFIRMADO en esta sesión; el repo exigirá `vendor/SUPABASE-LICENSE.txt` por convención).

Opciones para vendorizar:
1. **UMD autocontenido (`dist/umd/supabase.js`) como script clásico** — es el equivalente de `qrcodegen.js`/`html-to-image.js`: `<script src="vendor/supabase.js">` en index.html antes del módulo (como `piezas.js`, index.html:447) o inyección perezosa con el patrón de `cargarGis()`. Expone el global `supabase` (`supabase.createClient`; NO CONFIRMADO el nombre del global). La CSP no cambia (`script-src 'self'`). En módulos: `const { createClient } = globalThis.supabase`. Es lo más barato de aplicar; añadir `<link rel="preload" as="script">` para que baje mientras se pinta la puerta.
2. **ESM de un solo archivo** (como `leaflet-src.esm.js`): requiere generarlo UNA vez fuera del repo (bundle de `dist/index.mjs`, o la variante `+esm` de jsDelivr) y comprometer el artefacto; documentar versión y comando en la cabecera del archivo. `import { createClient } from '../../vendor/supabase.esm.js'`. Si el import fuera estático en `ingreso.js`/`puente.js`, los `.mjs` de node que los importan (`pruebas/ingreso.mjs:212`, `puerta.mjs:155`, `blindaje:55-56`) cargarían la librería entera: usar `await import()` perezoso o un wrapper que tolere su ausencia.
3. Import map: **descartado** (guion en línea ⇒ necesitaría hash en `script-src`, `csp.mjs:167-170`).

Nota de orden de arranque: `custodiar()` con pase vivo entra sin esperar la red (puerta.js:215-235), así que la librería debe estar en la caché del SW (APP_FILES) o el arranque sin señal falla; la comprobación de acceso por detrás ya necesita el cliente.

---------------------------------------------------------------------------------------------------

## 6. El asistente de IA

### 6.1 De dónde salen las llaves hoy
- **No están en el navegador.** Viven en las Script Properties del Apps Script: `IA_KEYS` = JSON `{qwen:[…], deepseek:[…], gemini:[…]}` (hasta `IA_MAX_LLAVES = 4` por proveedor, `.gs` 4125; cada una `string` de ≥ 10 caracteres, `iaLlaves_` 4141-4147), rotación en `IA_ROTACION` (4155-4165), cuota diaria en `IA_CUOTA_<yyyyMMdd>` (4174-4193). Se pegan con «⚡ AL3D → Llaves de IA» (`dialogoLlavesIA` ~4317; guardado 4342-4351). `SIN_LLAVE` si el proveedor no tiene.
- El cotizador borra restos de llaves viejas del teléfono al arrancar (`ia.js:141-147`, regex `^(al3d_kxs?_|ai_key|ai_model|ai_provider)`).
- **Cuidado con el plan 4.9/4.12**: «las llaves de IA salen del navegador (Edge Function `ia`)» ya es cierto hoy; lo que se migra es Apps Script → Edge Function.

### 6.2 Cómo llega a `/ia`
- Asistente: `llamar(c, sistema, previos, pregunta)` (`asistente.js:771-803`) → `Puente.hablar('ia', {modo:'chat', prov, model, sistema, mensajes: previos, pregunta}, TIMEOUT=60000)` → `pedir()` (cuerpo `{ruta:'ia', modo, prov, model, sistema, mensajes, pregunta, google_token?, token?}`) → `.gs rutaIA_(cuerpo, 'g:'+correo | 't:'+token)` (2258).
- Cotizador: `aiLlamar` (`ia.js:909-922`) → `aiPedirHoja` (873-887) → `hablarHoja('ia', {modo:'cotizar', prov, model, prompt, imagen:{b64,mime}, sinJson}, AI_TIMEOUT=100000)` → empotrado: `window.AL3D.hablar` (`notario.js:59-61`, es `Puente.hablar` de la plataforma); suelto: `_postHoja` con token de dispositivo (notario.js:62-64, 70-85).
- Estado de llaves: `/salud` → `ia:{qwen:bool,deepseek:bool,gemini:bool}` (`iaEstado`, .gs 4148-4152; `rutaSalud_` 2461). El asistente lo pide al abrir el panel (`refrescarIA()`, asistente.js:54-56, 137) y `cadenaIA(estado)` filtra proveedores (`asistente-contexto.js:362-364`); el cotizador lo guarda en `_iaEnHoja` (`ia.js:150-153`, `aiPintarProveedores` 155-161). **Quitar `/salud` (plan 3.2) rompe esto**: la función `ia` necesita una forma de decir «qué proveedores tienen llave» sin revelar llaves.
- Cadena en el cliente: `PROVEEDORES = ['qwen','deepseek','gemini']`, `MODELO_DEFECTO = {qwen:'qwen3.7-flash', deepseek:'deepseek-flash', gemini:'gemini-3.1-flash-lite'}` (asistente-contexto.js:356-358; `pruebas/replicas.mjs:273-284` compara con `ia.js` y con `IA_PROVS` del .gs); asistente: hasta 4 intentos, un candidato por proveedor (asistente.js:677); cotizador: `AI_RESPALDO` (qwen: `qwen3.7-flash, qwen3.6-flash`; deepseek: ninguno; gemini: `gemini-3.1-flash-lite, gemini-3.6-flash`), `AI_MAX_INTENTOS=12`, `AI_ESPERAS=[1200,3000,7000]`; un PDF solo va a Gemini (`ia.js:965`).
- Contrato de respuesta que el cliente interpreta (el .gs `iaRespuesta`, 4230-4262): `{ok:true, texto, prov, model}`; `{ok:false, codigo:'VACIO', razon, transitorio, prov, mensaje}`; `{ok:false, codigo:'PROVEEDOR', status, transitorio, crudo, prov, mensaje}`; códigos de `rutaIA_`: `DATO_INVALIDO` (proveedor/modelo fuera de lista blanca `IA_MODELOS` 4118-4119, mimes `IA_MIMES` 4120, falta pregunta/prompt/archivo), `SIN_LLAVE`, `SIN_RED` (no se pudo contar la cuota), `CUPO_AGOTADO` (`IA_LIMITE_DIARIO = 200` por persona y día), `ROL_SIN_PERMISO` (puerta). Cliente asistente: `r.ok && r.texto` → texto; `SIN_LLAVE` marca `_iaEstado[prov]=false`; `CUPO_AGOTADO|ROL_SIN_PERMISO` ⇒ `definitivo` (no pasa al siguiente proveedor) (asistente.js:794-799). Cliente cotizador: `aiErrorDeHoja` (ia.js:899-908) + reintento sin modo JSON si `status===400` y `crudo` menciona json/format.
- Límites que la función debe igualar o decidir: `sistema` ≤ 40 000 car., `pregunta` ≤ 4 000 (el cliente recorta a 1 500, asistente.js:539), `mensajes` últimos 20 con ≤ 8 000 car. c/u (`limpiarPeticionIA` 4263-4282), `prompt` ≤ 30 000, cuerpo ≤ `IA_MAX_CUERPO = 15 MB` (4126; imagen en base64; el cliente reduce a 1600 px, `AI_IMG_MAX`, ia.js:812). Petición a proveedores: Qwen `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions`, DeepSeek `https://api.deepseek.com/chat/completions` (con `thinking:{type:'disabled'}`), Gemini `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=<llave>` (`iaPeticion`, 4197-4227: `temperature 0.2`, `max_tokens 4096`/`maxOutputTokens 1200`). **NO CONFIRMADO**: topes de tamaño de cuerpo y de tiempo de una Edge Function en el plan gratuito frente a 15 MB y a `AI_TIMEOUT = 100 s`; verificar antes de fijar el diseño.
- Rotación entre llaves y reintento con la siguiente solo si 429/401/403 (4308-4311); en Supabase la cuota por persona y día necesita una tabla o RPC atómica (hoy: candado + propiedades).

### 6.3 Qué contexto manda el asistente
`leerTaller()` (asistente.js:720-764) lee **solo del dispositivo** (IndexedDB y localStorage), con `FRESCURA_MS = 45000`:
`Proy.listar({})`, `Agenda.listar({vivas:true})`, `Material.constantes()`, `Agenda.contextoMaterial()`, **`DB.listar('ventas_hoja')`** solo si `Prefs.veDinero()` (728), `Ventas.unificar(proyectos, hoja)`, `Cot.sinDecidir`, `Cot.historial()` (localStorage `al3d_historial`), `Cot.cola()` (`al3d_queue`), `Bitacora.listar({limite:25})`, `stock.listaCompra({hastaDias:30})`, `stock.bajoMinimo()`, `reglas.refrescar({hoy})`.
`armarResumen(d)` (asistente-contexto.js:140-285) → objeto con: `hoy, rol, quien, ve_dinero, proyectos[]` (abiertos + 40 cerrados; por proyecto: folio, nombre, `cliente: p.contacto`, `negocio`, tipo, etapa, ganado, instalacion, entrega, taller/atraso_dias, material, notas ≤160 car.; con dinero: `vendido, anticipo, saldo_estimado, cuenta, estatus_notion, comision*`), `no_se_dieron`, `instalaciones_proximas`, `instalaciones_vencidas_sin_marcar`, `material_por_comprar`, `bajo_minimo`, `avisos`, `ultimos_movimientos`, y solo con dinero: `ventas`, `conversion`, `cobranza`, `comisiones`, `cotizaciones_autorizadas_sin_decidir` (lista) — sin dinero esa clave es un número —, `esperando_precio`. **Sin teléfono, dirección ni coordenadas** (comentario 12-15; el aviso al usuario dice «Sin teléfonos ni direcciones», asistente.js:307; el nombre del cliente SÍ viaja).
`promptSistema(resumen)` (295-316): reglas 1-8 + `JSON.stringify(resumen, (k,v) => k==='id'?undefined:v)`. La regla 4 (línea 306) dice que **la hoja «Finanzas AL3D — Ventas y Comisiones» es el libro mayor y la plataforma solo la espeja**, y las 5-6 hablan de «LIQUIDADO en la hoja» y de `comision_de_notion`/«fórmula de la hoja»: tras la migración **estas reglas serían falsas** (la hoja pasa a espejo de solo lectura). `pruebas/asistente.mjs` y `pruebas/comisiones.mjs` las cubren.
Primera vez que algo sale: el panel pide «entendido» y guarda `al3d_pf_ia_ok` (asistente.js:584-589, 414). Lo calculable (8 `INTENCIONES`, asistente-contexto.js:385-394) se contesta local sin red ni IA (`respuestaLocal`).

### 6.4 Cómo se filtra por rol
Todo en el cliente; **el servidor no filtra** (la ruta `ia` solo reenvía `sistema`).
- `Prefs.veDinero()` = `rol() !== 'fabricacion'` (prefs.js:193): **Pagos y Dirección ven dinero**; solo Fabricación no.
- `portadaHTML` (asistente.js:243-252) quita los grupos `dinero:true`; `tiraHTML` (349-354) y `preguntar()` (547) quitan `INTENCIONES[k].dinero`; `resumenHTML` cambia 4/3 cifras (258-280).
- `leerTaller` no lee `ventas_hoja` ni pasa `ventas`/`kpi`/`conversion` sin dinero (728-748, 761).
- `armarResumen`/`resumirProyecto` omiten dinero con `veDinero:false` (92-121, 186, 211, 216-282) y `promptSistema` cambia la regla 5/6 (307-309).
- `accionesHTML` (326-346) oculta botones a pantallas que el rol no tiene vía `_ctx.tieneRuta`.
- **Contradicción con plan 4.9** («su contexto se arma desde la base por RLS»): hoy el contexto sale de IndexedDB + filtro de cliente. Para que sea cierto, hay que (a) que el IndexedDB se llene desde Supabase bajo RLS, y (b) reescribir `leerTaller()` porque `ventas_hoja` «desaparece» (plan 3.1) y `Cot.historial()/cola()` pasan a `cotizaciones`.

---------------------------------------------------------------------------------------------------

## 7. `js/nucleo/gcal.js` — qué se conserva sin cambios

**Todo, con una sola dependencia que hay que respetar.**
- API exportada intacta: `disponible()`, `conectado()`, `correo()`, `pedirToken(silencioso)`, `conectar()`, `desconectar()`, `idDeterminista(id)`, `crearEvento(ev)`, `moverEvento/actualizarEvento`, `borrarEvento/cancelarEvento`, `instrucciones()`.
- **GIS token model propio y separado del ingreso**: `initTokenClient({client_id, scope:'https://www.googleapis.com/auth/calendar.events', callback, error_callback})` (150-163); token solo en memoria (`_tok`, 68; NO en localStorage, comentario 30-32); `MS_VENTANA = 180000` (77); renovación callada `requestAccessToken({prompt:''})` (192). `llamar()` usa `fetch('https://www.googleapis.com/calendar/v3/calendars/<id>/events…')` con `Authorization: Bearer` (343-366); `const API` en línea 53 (csp.mjs lo exige en `connect-src` de index.html: **`https://www.googleapis.com` debe seguir permitido aunque ingreso.js deje de usar `userinfo`**).
- **Client ID de Calendar NO está en el código**: sale de `Prefs.gcal().clientId` (`al3d_pf_gcal`, por aparato, pegado en Ajustes; gcal.js:89-96). Plan 4.12 dice que está «en `PUENTE_CLIENT_IDS` y gcal.js»: solo el de ingreso está en el código/.gs.
- Reglas de negocio: `puedeEscribir()` = `Prefs.rol() === 'direccion'` (339-341; solo Dirección crea eventos, con los demás como `attendees` de `Prefs.gcal().invitados` en SU calendario; no «cada usuario» como dice el plan 4.9); `TZ='America/Mexico_City'`; alarmas desde `alarmasDe` de `ics.js` (`reminders.useDefault:false`); `sendUpdates=all`; 409 → lee el evento y `moverEvento` si cambió (421-431); `idDeterminista(uid)` base32hex con prefijo `al3d` (227-249).
- **`gcal_event_id` NO se guarda**: `fabricacion.js:1529-1533` lo dice («no se guarda; el id es determinista sobre el UID… volver a darle al botón no duplica»). Los campos `gcal_event_id: null` existen solo como relleno en `agenda.js:292`, `puente.js:784`, `reglas.js:811/836`. Plan 4.9 («Los eventos guardan `gcal_event_id` en `instalaciones`») no coincide. Lo que SÍ debe viajar por la base: `uid_ics` y `movida` (`Agenda.paraIcs` los usa) — `agenda.js:290-292`.
- Único acoplamiento a login: `import { cargarGis } from './ingreso.js'` (gcal.js:44). Si `ingreso.js` se reescribe, **`cargarGis()` debe seguir exportándose desde algún sitio** (o moverse a gcal.js/un módulo `gis.js`), porque Calendar sigue usando el guion de GIS. Consumidores: `js/mod/fabricacion.js:65,1215-1553,1972,2061,2445`, `js/mod/ajustes.js:38,641-719,1330`.
- Pruebas que lo cubren: `blindaje-de-la-app.mjs:60-93` (importa gcal.js en node con `initTokenClient` falso), `pruebas/ics.mjs`.

---------------------------------------------------------------------------------------------------

## 8. Contradicciones con el plan (`docs/PLAN-SUPABASE.md`)

1. **4.9 «Google Calendar: cada usuario crea eventos en su calendario»** → solo Dirección (`gcal.js:339-341`) y en SU calendario, con los otros como invitados.
2. **4.9 «Los eventos guardan `gcal_event_id` en `instalaciones`»** → no se guarda; id determinista del `uid_ics` (`fabricacion.js:1529-1533`). `gcal_event_id` solo existe como `null` de relleno.
3. **4.12 tabla «IDs de cliente de Google: `PUENTE_CLIENT_IDS` y `js/nucleo/gcal.js`»** → el de ingreso está en `js/nucleo/ingreso.js:84-85` (y en `PUENTE_CLIENT_IDS`, .gs:1898-1901); gcal.js no tiene ninguno (es por aparato, `al3d_pf_gcal`).
4. **4.12 «Token de Google Calendar … en `localStorage` del aparato»** → en memoria, no en localStorage (gcal.js:30-32, 66-68). El que SÍ está en localStorage (1 h) es el del ingreso (`al3d_pf_gtok`).
5. **4.9 Asistente «su contexto se arma desde la base por RLS»** → se arma de IndexedDB/localStorage y se filtra en el cliente (`Prefs.veDinero()`); además lee `ventas_hoja` (que el plan 3.1 dice que desaparece) y el prompt llama «libro mayor» a la hoja (asistente-contexto.js:306).
6. **4.9 «Las llaves de IA salen del navegador»** → ya no están en el navegador desde sept-2026 (viven en Script Properties `IA_KEYS`); la migración es Apps Script → Edge Function, y hay que replicar cuota 200/día, rotación y lista blanca de modelos.
7. **4.8 «el teléfono borra su copia local al siguiente contacto»** (acceso revocado) → hoy NO se borra nada (puerta.js:18-29; ajustes.js:1294-1295). Es comportamiento nuevo, no un port.
8. **3.2 `/salud` «(o se quitan)»** → el cliente lo usa para: confirmación de identidad/rol en la puerta (`preguntarALaHoja`), `escribibles`, estado de llaves de IA (asistente.js:55, ia.js:152), versión del .gs (`puente.js:872-915`). No se puede quitar sin reemplazarlos.
9. **3.2/3.3 «Carpetas se queda en Apps Script»** + **4.8 «tokens de dispositivo se retiran en fase 5»** → `/carpetas` y `/crear_carpeta` se llaman por `puente.js:1453/1469` autenticadas con el access token de Google (o el token de dispositivo). Con Supabase Auth no existirá access token de Google en el navegador (opciones A/B/C/D); hace falta una decisión explícita: (a) mantener un GIS token model silencioso solo para Apps Script, (b) proxy por Edge Function con secreto compartido, o (c) `session.provider_token` (solo aparece en el primer ingreso con redirección y no se refresca; NO CONFIRMADO su fiabilidad).
10. **4.7 `miembros(usuario_id, …)` vs 4.8 «Dirección agrega un renglón en miembros (correo, área)»** → inconsistente: la persona no tiene `usuario_id` hasta su primer ingreso; hoy «Accesos» es por correo.
11. **4.4/3.3 «Partes que no cambian: sw.js»** → sí cambia: APP_FILES, APP_VERSION, README y `NUM` de `publicacion.mjs`, frases de conteo de módulos en sw.js (ver 4).
12. **El cotizador suelto (`cotizador.html?solo=1`)** usa solo el token de dispositivo (`venta.js:299-308`, `notario.js:59-85`) y su CSP solo permite `script.google.com`: la fase 5 (retiro de tokens) lo deja sin autenticación; el plan no lo menciona.
13. **Plan 4.9 «Cuenta se toma de la sesión de Supabase»** → hoy `cuenta.js` lee `quien` de `custodiar()` (pase); es compatible y de bajo costo, solo conviene que `quien` siga saliendo del pase.

---------------------------------------------------------------------------------------------------

## 9. NO CONFIRMADO / preguntas abiertas
- Modo de ingreso (A/B/C/D de 2.2) y comportamiento de la redirección OAuth en la PWA instalada (iOS/Android).
- Quién autentica `/carpetas`/`/crear_carpeta` tras quitar el access token de Google (hallazgo 9).
- Estado de la pantalla de consentimiento del proyecto «My First Project» (¿en producción?): ingreso.js:50-54 supone que `openid email` no exige verificación; gcal.js:512 manda poner la app en «Testing» (100 usuarios) — son dos clientes/estados posibles; no se pudo verificar sin la consola de Google.
- URI de redirección de Supabase en el cliente de Google, secreto del cliente en el panel de Supabase (plan 4.12), «Authorized Client IDs» para `signInWithIdToken`, nonce: conocimiento general, sin proyecto aún en el repo (`grep supabase` solo aparece en docs).
- Tamaño de `dist/umd/supabase.js`, si `dist/index.mjs` es autocontenido, nombre del global UMD, clave de almacenamiento `sb-<ref>-auth-token` y sincronización entre pestañas: no se descargó el paquete.
- Límites de Edge Functions (cuerpo, CPU, duración) frente a 15 MB y 100 s de `/ia`; CORS/`verify_jwt` de la función pública `verificar`.
- Cómo corren las pruebas de navegador (127.0.0.1, puerta exenta, sin sesión) cuando la lectura sea RLS (`esCopiaLocal`, puerta.js:271-276).
- Si el host de Functions de supabase-js es `<ref>.supabase.co/functions/v1` o `<ref>.functions.supabase.co` en la versión elegida (define si basta el host exacto en CSP).
