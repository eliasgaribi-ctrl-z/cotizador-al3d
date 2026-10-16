# Segunda entrega, lado servidor: huecos de la revisión, `autorizar` y `respaldo`

**Fecha: 2026-10-16. Rama `claude/supabase-huecos-autorizar`.** Todo sigue **apagado**: la hoja de Google es la fuente de verdad y no hay datos reales ni secretos reales en Supabase. Elías no estaba; cada decisión de abajo es el valor más conservador que encontré y está marcada para que la confirme o la cambie. Este archivo no sustituye a [`../ESTADO-SUPABASE.md`](../ESTADO-SUPABASE.md) (que no se tocó en esta rama): es el informe de lo que hay que pasar ahí cuando se revise.

## Qué hay

| Pieza | Archivos | Prueba |
|---|---|---|
| Migración que cierra los huecos «Abierto, a propósito» | `supabase/migrations/0013_huecos_revision.sql` | `supabase/tests/rls-y-dinero/huecos-revision.mjs` (15; **12 fallan sin la migración**) y el bloque 7 de `supabase/opcional/prueba-de-humo.sql` (C28–C36) |
| Función `autorizar` | `supabase/functions/autorizar/`, `_shared/autorizar.js`, `_shared/precio.js` | `pruebas/supabase-autorizar.mjs` (48, contra el `.gs` real en una vm) |
| Función `respaldo` y su flujo semanal | `supabase/functions/respaldo/`, `_shared/respaldo.js`, `.github/workflows/respaldo-semanal.yml` | `pruebas/supabase-respaldo.mjs` (44, con dobles) |
| `0014_autorizar.sql` | **no existe**: `autorizar` escribe con la RPC que ya había (`registrar_autorizacion`, 0008). No hizo falta una nueva | — |

## Tarea A — `0013_huecos_revision.sql`

Cada arreglo, y por qué así:

| | Hueco (ESTADO, «Abierto, a propósito») | Arreglo | Decisión |
|---|---|---|---|
| H-1 | `subida_unica` aceptaba `usuario`, `rol`, `ts` e `id` del cliente en la bitácora; se podía ocupar el `op_id` de otro | El servidor pone `usuario_texto` (correo verificado), `rol` (área real) y `ts` (`now()`). `op_id = 'tel:<uid>:<disp>:<id>'` | La hora que dice el teléfono se conserva en `procedencia.ts_cliente` (solo si cae entre 2020 y mañana): es un dato declarado, no la hora del evento. El uid va **delante** y mide siempre 36: dos personas no pueden producir el mismo `op_id`. Cambia el formato de `DISENO.md` (`tel:<disp>:<id>`); hay que actualizarlo allá |
| H-2 | Cotizaciones por `subida_unica` nacían `autorizada` sin sello | `autorizada` solo si `autorizaciones` tiene la fila `vigente` de ese folio global **y** su código es el del sello local; entonces queda enlazada (`autorizacion_id`). Si no, `retirada` y `procedencia.sin_sello_valido = true` | **`retirada` y no `pendiente`**: nadie pidió autorización y no hay solicitud; `pendiente` haría creer que alguien espera a Dirección. La base no puede comprobar el HMAC (no tiene la clave), así que exige que el sello exista del lado del servidor. **Para el importador (fase 2):** si «Autorizaciones» se carga DESPUÉS de una subida, su pasada de vínculo (`DISENO.md` §2.9 a) debe poner `autorizada` las que enlace con una `vigente` |
| H-3 | La holgura de +10 min dejaba que un rol bajo anulara a Dirección (Q-06) | (a) holgura de **60 s** para Fabricación, Pagos y toda escritura sin área (importador, service_role); **Dirección conserva 10 min**. (b) ante un conflicto, **Dirección gana** cuando el sello guardado lo puso Fabricación o Pagos: su cambio se escribe con el sello guardado **+ 1 ms** | **PROVISIONAL, la confirma Elías.** Contra otro teléfono de Dirección o contra un sello de origen desconocido (lo importado) sigue «gana el más reciente»; un cambio de Dirección **sin** sello no gana nada. El «+1 ms» hace que el reintento del teléfono bajo con su mismo sello ya no empate. Para saber quién puso cada sello: columna nueva `proyectos.sellos_area` (`{grupo: área}`), la llena un trigger con el área que el preámbulo de cada RPC fija en `al3d.area` (parámetro local a la transacción; PostgREST no deja fijarlo desde fuera y el preámbulo lo pisa). `remoto` no la devuelve. Aplica a `proyecto_actualizar`, `mover_etapa` e `instalacion_guardar` (copias de 0006 con una línea cambiada). El almacén solo recibe la holgura nueva, sin prioridad |
| H-4 | `almacen_movimientos.ts` sin tope: un conteo de 2099 congelaba la existencia | Trigger: no más de **1 día** en el futuro respecto de `now()`; `almacen_aplicar` lo contesta `DATO_INVALIDO` (definitivo) | Vale también para el importador. No se puso tope hacia el pasado (lo histórico es legítimo) |
| H-5 | Pagos podía **crear** un requerimiento | `almacen_aplicar` (copia de 0005) contesta `ROL_SIN_PERMISO` a Pagos sobre un requerimiento que **no existe**; sobre uno que existe sigue la regla de siempre (solo `estado = consumido`) | La guarda va en `almacen_aplicar` y no en un trigger: un error de trigger saldría como `DESCONOCIDO` y la bandeja lo reintentaría para siempre |
| H-6 | `authenticated` podía crear tablas temporales | `REVOKE TEMPORARY … FROM PUBLIC` y se le devuelve a **cada rol que ya existía** salvo `anon` y `authenticated` | En PGlite funciona (la prueba lo exige). En Supabase `postgres` no es superusuario y puede no ser dueño de la base: si no puede revocar, la migración **no aborta**, deja un NOTICE y el caso **C30** de la prueba de humo sale en rojo. Riesgo aceptado: un rol que la plataforma cree **después** no tendrá TEMPORARY (no conozco ninguno que lo use para servir peticiones) |

Además: `0013` termina corriendo la auditoría de `0011` (aborta como ella si algo quedó abierto). Las pruebas que fijaban el comportamiento viejo se ajustaron al nuevo, a propósito y con comentario: `utilidades-puras` y `almacen` (AL-15) por la holgura, `subida-unica` por H-1/H-2, y `orden-y-referencias` ya no supone exactamente doce migraciones.

**Lo que NO se hizo, a propósito** (siguen abiertos y así deben quedar en ESTADO): los de severidad baja que dependen de dar de alta una **segunda empresa** (ids y contadores globales entre empresas, oráculo de existencia, `folio_cot:*` sin tope, invitación cruzada), la lista blanca de primer nivel de `origen_obra` (cuando el cliente mande `origen`) y la hoja espejo con el dinero fuera de RLS (antes de encender el espejo: que Fabricación no tenga acceso a ese archivo).

## Tarea B — `autorizar`

Dirección autoriza un precio y sale el sello. Es `rutaAutorizar_` del `.gs` portada: limpia la cotización, **recalcula el precio con el catálogo del servidor** (`_shared/precio.js`, copia línea por línea del `.gs`), arma huella, total y renglones, y firma con `_shared/sello.js` en la codificación **real** de Apps Script (`ascii-?`). Escribe solo por `registrar_autorizacion` (candado, «repetida», supera la vigente, guarda verbatim, resuelve la solicitud).

Cómo se probó que es igual: `pruebas/supabase-autorizar.mjs` carga el `.gs` real en una vm con una hoja de mentiras que escribe y un `Utilities` fiel (ASCII con «?»), y compara **4000** cotizaciones al azar función por función y **3000** cuerpos al azar por la ruta entera: la respuesta es el mismo JSON byte por byte y el renglón firmado (texto, firma, código, ajuste %) es el mismo (en la corrida: 1983 autorizadas, 887 rechazadas con el mismo error). Con PGlite, 12 autorizaciones pasan por la función, se guardan con la RPC real y `sello.verificar()` las verifica desde la fila. Mutar el catálogo o el reparto de centavos rompe la prueba.

Decisiones:

- **Sin `SELLO_AUTORIZACION` no se firma** (503 `CONFIGURACION` con el nombre). El `.gs` inventaba una clave y firmaba todo lo que seguía con ella.
- **Medio emoji**: si `slice(0, 140)` deja la mitad de un emoji en el nombre del proyecto, el `.gs` lo firma con un «?» pero Postgres no lo puede guardar tal cual; aquí se contesta `DATO_INVALIDO` (pasó en ~4 % del azar porque el generador lo busca; en la vida real es raro). Lo que **no** se firma (cliente y la copia de la cotización) guarda U+FFFD en su lugar.
- «Ajuste %» absurdo (|pct| ≥ 1e6) se guarda vacío: es informativo y la base lo rechazaría.
- Quién autoriza lo decide la sesión (`auth.js` + `mi_acceso`, Dirección activa), no el token. Dirección en varias empresas manda `empresa` (si no, 400 `EMPRESA_REQUERIDA`).
- Los errores de negocio salen con 200 y el cuerpo exacto del `.gs` (la app ya los pinta); la base caída es 503 `SIN_RED` transitorio, nunca «no autorizada».

## Tarea B — `respaldo`

Exporta las 17 tablas de `public` (con la llave secreta, página por página en el orden de su llave primaria) a **un** JSON (`al3d-respaldo-1`, con `sha256`) y lo sube a una carpeta de Drive con una **cuenta de servicio** (JWT RS256 con WebCrypto → token de Google → subida reanudable). La dispara `.github/workflows/respaldo-semanal.yml` (domingo 10:23 UTC y a mano, con opción «en seco»), que **no hace nada** si falta la variable `RESPALDO_URL_FUNCION` o el secreto `RESPALDO_SECRETO_FUNCION`.

Decisiones:

- **Se aparta de la Q-20 original** (`DECISIONES-SUPABASE.md`: «respaldo con secreto compartido + función de Apps Script que escribe a Drive») porque esta entrega pidió cuenta de servicio con credenciales del entorno. Ventaja: no depende del Apps Script, que se retira en la fase 5. Elías decide cuál queda.
- Secreto nuevo además de los dos pedidos: **`RESPALDO_SECRETO_FUNCION`** (quien dispara la función lo presenta en `x-respaldo-secreto`; sin él cualquiera podría lanzar exportaciones). 401 siempre igual si falta o no coincide.
- Alcance `drive` (no `drive.file`): la carpeta la crea Elías, no la aplicación; la cuenta solo ve lo que se comparte con ella.
- La carpeta debe estar en una **unidad compartida** (las cuentas de servicio no tienen cuota propia); un 403 `storageQuotaExceeded` lo dice con esa pista. **No verificado contra Google.**
- El token se pide siempre a `oauth2.googleapis.com` aunque el archivo traiga otra `token_uri`; la subida solo va a `www.googleapis.com`.
- **No se borra nada en Drive**: la retención la decide Elías en la carpeta.
- Es una foto aproximada: PostgREST no da una transacción que abarque las 17 lecturas. Si la base falla a medias, **no se sube nada**.

## Secretos nuevos (solo nombres; ya están en `supabase/README.md`)

`RESPALDO_GOOGLE_CREDENCIALES`, `RESPALDO_CARPETA_DRIVE` y `RESPALDO_SECRETO_FUNCION` en los secretos de las funciones; `RESPALDO_SECRETO_FUNCION` (mismo valor) y la variable `RESPALDO_URL_FUNCION` en GitHub Actions. `autorizar` usa el `SELLO_AUTORIZACION` que ya estaba en la lista.

## Cómo aplicarlo al proyecto de pruebas

1. SQL Editor: `supabase/migrations/0013_huecos_revision.sql` completo (es idempotente y corre la auditoría al final). Si aparece el NOTICE de tablas temporales, anotarlo: H-6 no quedó cerrado ahí.
2. Volver a correr `0011` y después `supabase/opcional/prueba-de-humo.sql` completo: verde = `{"fallos":0,…}` con 36 casos.
3. Funciones (cuando se quiera): `supabase functions deploy autorizar respaldo` y sus secretos. Nada de esto se desplegó.

## Cifras de esta rama (Windows 11, node 24.17)

- `sh supabase/tests/correr.sh`: **35 archivos, 818 verificaciones, 0 fallos**.
- `sh pruebas/correr.sh`: **64 archivos, 0 fallos** (`supabase-autorizar.mjs` 48 y `supabase-respaldo.mjs` 44 comprobaciones). El `README.md` raíz pasó de 62 a **64** pruebas de node porque `pruebas/publicacion.mjs` lo exige.
- `prueba-de-humo.sql` corrida en PGlite: 36 casos, 0 fallos (sin `0013`: 8 fallos).

## No verificado

- **`deno check`**: no hay `deno` en esta máquina; los `index.ts` nuevos no se comprobaron bajo Deno (las pruebas lo intentan si lo hay).
- Nada contra Supabase real: `0013` no se aplicó a `al3d-pruebas`; en particular H-6 depende de los privilegios reales de `postgres` allá.
- Google Drive y la cuenta de servicio reales (solo dobles): alcance, unidad compartida y cuota.
- La clave real del sello y filas reales de «Autorizaciones» (la prueba de oro de `pruebas/supabase-sello.mjs`).
- Concurrencia entre conexiones (dos autorizaciones del mismo folio a la vez): el candado está en la RPC, PGlite tiene una sola conexión.

## Para que Elías decida

1. **Q-06 (H-3)**: ¿se queda «60 s para roles bajos + Dirección gana ante ellos», o prefiere solo una de las dos?
2. **H-2**: ¿`retirada` para lo subido sin sello válido le parece bien, o prefiere otro estado?
3. **Respaldo**: ¿cuenta de servicio (esta rama) o Apps Script (Q-20 original)? ¿Hay una unidad compartida para la carpeta?
4. Pasar este informe a `docs/ESTADO-SUPABASE.md` (esta rama no lo tocó, a propósito).
