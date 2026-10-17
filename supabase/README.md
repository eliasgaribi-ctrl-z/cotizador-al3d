# supabase/ — la base de AL3D (en construcción, apagada)

Esta carpeta es la migración a Supabase del plan [`docs/PLAN-SUPABASE.md`](../docs/PLAN-SUPABASE.md). **Está apagada:**
la app, el puente y la hoja de Google siguen funcionando exactamente igual y no hay ningún dato real en Supabase.
Qué está hecho y qué falta, con la evidencia: [`docs/ESTADO-SUPABASE.md`](../docs/ESTADO-SUPABASE.md).

| Carpeta o archivo | Qué es |
|---|---|
| [`DISENO.md`](DISENO.md) | El diseño del esquema: tablas, reglas de acceso, funciones, vista de fórmulas, plan de pruebas |
| `migrations/` | Las 18 migraciones SQL, en orden (`0001` a `0018`); ver [`migrations/README.md`](migrations/README.md) |
| `tests/` | Pruebas de la base con PGlite (PostgreSQL en WASM, sin Docker): `sh supabase/tests/correr.sh`; ver [`tests/README.md`](tests/README.md) |
| `functions/` | Funciones del servidor (Deno): `salud`, `verificar`, `maps`, `ia`, `espejo`, `autorizar`, `respaldo` e `importar-diario` (la copia diaria hoja → nube; abajo), con su código compartido en `_shared/` (`autorizar` y `respaldo`, de la segunda entrega y apagadas: [`docs/supabase/NOTAS-SEGUNDA-ENTREGA-SERVIDOR.md`](../docs/supabase/NOTAS-SEGUNDA-ENTREGA-SERVIDOR.md)) |
| `opcional/` | Lo que no corre en PGlite: `prueba-de-humo.sql` (para un proyecto real), `storage.sql` (el bucket de las imágenes y sus políticas; abajo), `semilla_materiales.mjs`, `keepalive.md` |
| `config.toml` | Configuración de las funciones (todas con `verify_jwt = false`: las llaves nuevas de Supabase no son JWT, cada función valida a la persona en su código) |

## Cómo se aplica a un proyecto de Supabase

1. **Crear el proyecto** con «Enable Data API» encendido, «Automatically expose new tables» **apagado** y «Enable automatic RLS»
   encendido (cada migración declara sus propios `GRANT`/`REVOKE`; con la exposición automática encendida los privilegios finales
   quedan iguales, y una prueba lo demuestra).
2. **Correr `migrations/0001` … `0018` en orden** en el Editor SQL del panel (o `supabase db push`). Cada archivo es completo y
   se corre de una vez. `0011` es la **auditoría**: si algo quedó mal protegido, aborta nombrando la regla (GR-xx); `0012` es el
   endurecimiento que dejó la revisión adversarial y `0013` cierra lo que esa revisión dejó abierto (termina corriendo la auditoría él mismo); `0014` y `0015` son las decisiones de Elías del 2026-10-16 (sellos: gana el más reciente con 10 min para todos; el V-### de la hoja); `0016`, los plazos de conservación; `0017`, las decisiones de Elías del mismo día sobre etapas e IA, y `0018`, la bitácora de la copia diaria (`cuadre_diario`). `0014` **borra** la columna `proyectos.sellos_area` (solo la usaba `0013`): Supabase avisará de una operación destructiva, y es esperado.
   Después de cada una conviene volver a correr `0011` (es idempotente).
   Si Supabase pregunta por «operaciones destructivas» es el aviso genérico por los `REVOKE`/`ALTER`; en un proyecto vacío es seguro.
3. **Correr `opcional/storage.sql`** completo (el bucket privado de las imágenes de las cotizaciones y sus políticas; ver
   «Las imágenes de las cotizaciones (Storage)», abajo).
4. **Correr `opcional/prueba-de-humo.sql`** completo. Simula a las tres áreas y siempre se deshace; el «error» final
   `HUMO_RESULTADO {"fallos":0,…}` es el resultado esperado (verde = `fallos` en 0): **79** casos con `storage.sql` aplicado,
   **63** sin él (el caso C58 dice entonces que Storage no aplica); D01–D05 son de `0018`. Pasa igual en una base vacía que en una con datos reales:
   cada caso cuenta solo las filas de la prueba.
5. **Auth → Sign In / Providers → Google**: habilitar con el Client ID público de la app (`js/nucleo/ingreso.js`); el flujo de
   «ID token» no pide secreto. **Auth → URL Configuration**: Site URL y las redirecciones de GitHub Pages y pages.dev.
6. **Dar de alta a la primera persona de Dirección**, a mano en el Editor SQL (a propósito no viene sembrada: un repositorio
   público no debe llevar correos). Una sola vez por proyecto, con el correo en minúsculas:
   ```sql
   insert into public.miembros (empresa_id, correo, area, estado) values ('al3d', 'correo@ejemplo.com', 'direccion', 'invitado');
   ```
   Al entrar con Google y reclamar el acceso (`reclamar_acceso`) queda vinculada a su cuenta. Las demás personas las da de alta
   Dirección desde la plataforma con `miembro_alta`; quien entra con una cuenta que no está en `miembros` ve `sin_acceso` y nada más.

En `al3d-pruebas` los pasos 1, 2, 4 y 5 se hicieron el 2026-10-10; en `al3d-produccion`, el 2026-10-16 (con `0001`–`0016`). Qué
migraciones faltan en cada uno lo lleva `docs/ESTADO-SUPABASE.md`. El paso 3 (`storage.sql`) se aplicó en los dos el 2026-10-16
(humo 69 de 69); la versión con Q-02 bis (Fabricación ve las imágenes de las obras ganadas) hay que **volver a aplicarla** en los
dos, y la prueba de humo da entonces 74.

## Las imágenes de las cotizaciones (Storage)

Lo decidió Elías el 2026-10-16: las imágenes de las cotizaciones (el plano de cada partida, los renders y la propuesta visual)
suben a la nube. Las sube el teléfono con la **sombra** encendida (`js/datos/supa-imagenes.js`) y las baja, si le faltan, con la
**lectura en vivo** encendida; apagado, la app no hace ni una petición nueva.

**Cómo se aplica** (primero en `al3d-pruebas`, después en `al3d-produccion`):

1. Con `0001`–`0017` ya aplicadas, pegar **`supabase/opcional/storage.sql`** completo en el Editor SQL y correrlo. Es idempotente:
   se puede volver a correr, y cada vez deja el bucket y las políticas exactamente como dice el archivo. No crea ninguna función
   (la auditoría de `0011` sigue limpia). Si termina con `AUDITORIA: …`, hay una política de `storage.objects` que abre el bucket
   (hecha a mano en el panel, o de otro uso): el mensaje dice cuál; quitarla y volver a correrlo.
2. Correr **`supabase/opcional/prueba-de-humo.sql`**: verde con **79** casos (C58–C74 son de Storage; C70–C74, de Q-02 bis; D01–D05, de `0018`).
3. En *Storage* del panel debe aparecer el bucket `cotizacion-imagenes`, **privado**, con tope de 2 MB y solo `image/jpeg`,
   `image/png` e `image/webp`.

**Quién puede qué** (detalle en la cabecera de `storage.sql`): leer, quien puede **ver esa cotización** (lo decide la RLS de
`cotizaciones`: Dirección todas, Pagos las suyas, Fabricación ninguna) y Dirección todo lo de su empresa; además **Fabricación lee
las de las obras GANADAS** (Q-02 bis, decidido por Elías el 2026-10-16: un proyecto con el folio de la carpeta, con V-###, no
cancelado ni borrado; la cotización sigue cerrada para ella, solo se abren sus imágenes); subir, el autor (Pagos, con la cotización
ya en la base) o Dirección; cambiar y borrar, solo Dirección. Ruta: `<empresa>/<folio_global>/<id>.jpg`, una vez por imagen (y,
si una duplicada que la comparte se ganó, una copia en la carpeta de la ganada, que es donde la busca Fabricación). Hoy la app todavía no sube las cotizaciones a la base (falta la subida única), así que **solo los teléfonos de
Dirección suben imágenes**; las de Pagos esperan, solas, a que su cotización esté en la base.

**Cuánto ocupa.** El plan gratuito da **1 GB** de archivos para todo el proyecto (y 5 GB al mes de salida). Cada imagen ya va
reducida a 1800 px en JPEG: entre 150 y 700 KB. Una cotización con imágenes lleva de 3 a 7 (las duplicadas no se suben otra vez),
así que pesa de 0.5 a 3 MB: **unas 300 a 2 000 cotizaciones con imágenes caben en 1 GB**. Las imágenes existen desde el
2026-10-06, así que hoy son pocas. La cifra de verdad la da Ajustes en cada teléfono («por subir», en MB) y, en la nube:

```sql
select count(*) as imagenes, pg_size_pretty(sum((metadata ->> 'size')::bigint)) as peso
  from storage.objects where bucket_id = 'cotizacion-imagenes';
```

Cada teléfono se para solo si llega a 750 MB subidos (Ajustes lo dice). Bajar una imagen solo pasa cuando le falta a un teléfono.

**Imágenes sin cotización.** La purga de `0016` borra cotizaciones no ganadas, pero **no** sus imágenes: borrar la fila de
`storage.objects` con SQL no borra el archivo (quedaría huérfano, ocupando espacio), y la purga no tiene ni red ni llave para usar
la API de Storage. En cuanto la cotización ya no existe, Pagos deja de ver sus imágenes; Dirección las sigue viendo. Como el
teléfono solo sube las del historial (cotizaciones autorizadas) y la purga nunca toca una autorizada, lo normal es que no quede
ninguna. Para revisarlo:

```sql
select (storage.foldername(o.name))[2] as folio_global, count(*) as imagenes, pg_size_pretty(sum((o.metadata ->> 'size')::bigint)) as peso
  from storage.objects o
 where o.bucket_id = 'cotizacion-imagenes'
   and not exists (select 1 from public.cotizaciones c
                    where c.empresa_id = (storage.foldername(o.name))[1] and c.folio_global = (storage.foldername(o.name))[2])
 group by 1 order by 1;
```

**Ojo:** mientras la app no suba las cotizaciones a la base, esa lista son TODAS las carpetas: no borrar con ella todavía. Se
borra desde el panel (*Storage → cotizacion-imagenes*, seleccionar la carpeta → *Delete*), que sí borra el archivo; con SQL, no.

## La copia diaria de la hoja a la nube (`importar-diario`)

Lo decidió Elías el 2026-10-16: el equipo **sigue capturando en la hoja**, así que la escritura en sombra no basta para tener
la nube al día. Cada madrugada (de 3 a 4, hora de México) el Apps Script de la hoja manda la hoja entera a la función
`importar-diario`, que la pasa a la base con **el mismo importador** con el que se importó el 2026-10-16
(`scripts/importador`), todo en **una sola transacción**, y la cuadra por folio. Cada corrida deja un renglón en
`public.cuadre_diario` y Ajustes → Supabase lo enseña: «cuadró X de los últimos 7 días». Cuando lleve 7 seguidos, Elías
decide el día del cambio (abajo).

Son tres piezas: la tabla (`migrations/0018_cuadre_diario.sql`), la función (para pegar en el panel:
**`functions/importar-diario/desplegar/index.ts`**) y el Apps Script (**`puente/copia-diaria.gs`**, un archivo nuevo junto a
`Código.gs`, que no se toca).

**Cómo se pone en marcha (una vez, en este orden).** No hace falta la CLI ni Docker: todo es desde el navegador.

1. **La tabla.** En el Editor SQL de `al3d-produccion`, pegar `supabase/migrations/0018_cuadre_diario.sql` completo y
   ejecutarlo (después de `0017`). Termina corriendo la auditoría: si sale «AUDITORIA DE SEGURIDAD…», no se aplicó nada y el
   mensaje dice por qué. Después la prueba de humo: verde con **63** casos (**79** con `storage.sql`).
2. **El secreto.** Es una contraseña larga que solo conocen la función y la hoja. Generarlo en la computadora, **sin pasarlo
   por ningún chat**, y guardarlo en el gestor de contraseñas. Por ejemplo, en PowerShell:
   `[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')` (da 64 letras y números; sirve cualquiera de 32 o más).
3. **La función.** En el panel de Supabase: *Edge Functions* → *Deploy a new function* → *Via Editor*. Nombre, exactamente:
   `importar-diario`. Borrar el código de ejemplo, pegar **entero** `supabase/functions/importar-diario/desplegar/index.ts`
   (en GitHub: abrir el archivo → *Raw* → seleccionar todo y copiar) y *Deploy function*. Después, en la página de la función
   (*Details*), **apagar «Verify JWT»** (puede decir «Enforce JWT verification»): la hoja no trae una sesión de Supabase; a
   esta función la protege su secreto.
4. **El secreto en la función.** *Edge Functions* → *Secrets* → *Add new secret*: nombre `IMPORTAR_SECRETO`, valor el del
   paso 2 → *Save*. `SUPABASE_DB_URL` (la conexión a la base) la pone Supabase sola en cada función: no se carga.
5. **El Apps Script.** En la hoja de VERDAD: *Extensiones* → *Apps Script* → «+» → *Secuencia de comandos*, nombre «Copia
   diaria», pegar `puente/copia-diaria.gs` entero y guardar. Luego el engrane (*Configuración del proyecto*) →
   *Propiedades de la secuencia de comandos* → agregar dos:
   `IMPORTAR_URL` = `https://gwzfdprdrdudfakjsdxf.supabase.co/functions/v1/importar-diario` y
   `IMPORTAR_SECRETO` = el mismo valor del paso 2. Guardar.
6. **Probarla a mano.** En el editor, elegir `copiarHojaASupabase` → *Ejecutar* (la primera vez pide permiso para «conectarse
   a un servicio externo»). El registro de ejecución dice, en una línea, cómo salió: «aplicada · CUADRA · 219 ventas · 0
   diferencias · 0 conflictos» o por qué no.
7. **Programarla.** Elegir `instalarCopiaDiaria` → *Ejecutar*. Queda todos los días entre las 3 y las 4 de la mañana (hora de
   México). `quitarCopiaDiaria` la quita (solo esa: los demás disparadores de la hoja no se tocan).

**Qué puede decir cada día** (en Ajustes, o en el Editor SQL con
`select fecha, aplicado, cuadra, diferencias, conflictos, rechazos, resumen from public.cuadre_diario order by id desc limit 7;`).
El `resumen` dice pestañas, filas, folios y columnas; **nunca** nombres ni importes.

- **Aplicada y cuadra:** la nube dice lo mismo que la hoja. Ese día cuenta para los 7.
- **No se aplicó:** el importador encontró algo que no decide solo (un folio repetido, una fila con texto donde va un
  importe…). No se escribió nada. Se arregla en la hoja y la copia del día siguiente lo toma.
- **Aplicada pero con conflictos de la base:** algo que la base no deja cambiar, por ejemplo **una venta que ya era histórica y
  la hoja vuelve a poner en FABRICACION o REPARANDO** (una garantía): esa venta no se actualiza, el día no cuadra y lo decide
  una persona. Lo contrario, el ciclo normal (una venta en FABRICACION que pasa a COBRANDO o LIQUIDADO), **no** es conflicto:
  sigue viva en la base, con su estatus y su dinero de la hoja (`docs/DECISIONES-SUPABASE.md`, «Transición», opción a).
- **La función contestó 401:** el secreto de la hoja y el de la función no son el mismo. **503:** a la función le falta
  `IMPORTAR_SECRETO`. **409:** ya había otra copia corriendo (no pasa nada; se queda la otra).

**Lo que no hace.** No toca la hoja (solo la lee, con el candado del puente mientras lee). No importa las autorizaciones (no
usa la clave del sello: siguen como en la importación del 2026-10-16). No borra nada de la base. Un volcado de hace más de
36 horas se rechaza. Cuánto gasta: con una hoja de mentiras de 220 ventas, unos 0.1 s de CPU en frío (el límite de una
función es 2 s); el trabajo pesado lo hace Postgres, que no cuenta para ese límite.

**Si se cambia el código** de la función o del importador: `npm ci` una vez en `supabase/functions/importar-diario/desplegar/`,
después `node supabase/functions/importar-diario/desplegar/armar.mjs` (vuelve a armar `desplegar/index.ts`) y pegarlo otra
vez en el panel. Si no se arma, `pruebas/supabase-importar-diario.mjs` falla y lo dice. (Con la CLI bastaría
`supabase functions deploy importar-diario`, que usa `importar-diario/index.ts`; no se ha probado.)

**Cambiar el secreto:** generar otro y ponerlo en los dos lugares (pasos 4 y 5) el mismo día, antes de las 3 de la mañana.

**El día del cambio** (lo decide Elías con los 7 días en verde): correr `copiarHojaASupabase` a mano una última vez y ver que
cuadre; `quitarCopiaDiaria`; poner la hoja en solo lectura; y el equipo pasa a la plataforma, con la sombra y la lectura en
vivo encendidas (`docs/DECISIONES-SUPABASE.md`, «Transición»).

## Secretos: qué es cada uno, dónde vive y quién lo carga

Ninguno va al repositorio, a la hoja ni al chat (regla del plan §4.12). Aquí solo van los **nombres**.

| Secreto | Dónde vive | Quién lo carga | Para qué |
|---|---|---|---|
| `SELLO_AUTORIZACION` | Secretos de las funciones de Supabase | **Elías**, desde el Apps Script actual. **No se rota** (cambiarla invalida todos los PDF ya entregados); guardar una copia fuera de línea | Firmar y verificar los sellos de autorización |
| `IA_KEYS` (JSON con las llaves de Qwen, DeepSeek y Gemini) | Secretos de las funciones | **Elías** | La función `ia` (las llaves salen del navegador) |
| `ESPEJO_SECRETO_FUNCION`, `ESPEJO_URL`, `ESPEJO_SECRETO`, `ESPEJO_EMPRESA` (opcional) | Secretos de las funciones | **Elías** | La función `espejo`; `ESPEJO_SECRETO` es el mismo valor que la propiedad del Apps Script (ver [`puente/ESPEJO.md`](../puente/ESPEJO.md)) |
| `RESPALDO_GOOGLE_CREDENCIALES` | Secretos de las funciones | **Elías** | La función `respaldo`: el JSON de la llave de una **cuenta de servicio** de Google (`client_email`, `private_key`). Solo necesita acceso a la carpeta del respaldo |
| `RESPALDO_CARPETA_DRIVE` | Secretos de las funciones | **Elías** | La función `respaldo`: el id de la carpeta de Drive (de una unidad compartida) donde se sube el archivo semanal |
| `RESPALDO_SECRETO_FUNCION` | Secretos de las funciones **y** secreto de GitHub Actions (el mismo valor, 32 caracteres o más) | **Elías** | Quien dispara `respaldo` (el flujo semanal) lo presenta en la cabecera `x-respaldo-secreto`. En GitHub va junto a la variable `RESPALDO_URL_FUNCION`; sin las dos, el flujo no hace nada |
| `IMPORTAR_SECRETO` | Secretos de las funciones **y** propiedad del script de la hoja (el mismo valor, 32 caracteres o más) | **Elías** | La función `importar-diario`: el Apps Script de la hoja (`puente/copia-diaria.gs`) lo presenta en la cabecera `x-importar-secreto`. Sin él la función contesta 503 y no hace nada. Abajo, «La copia diaria» |
| `RESPALDO_CONSERVAR` | Secretos de las funciones (**opcional**; no es secreto, pero ahí viven las variables de la función) | **Elías** | La función `respaldo`: cuántos respaldos se quedan en la carpeta, de 1 a 520. **Sin ella, 8** (decidido por Elías el 2026-10-16). Después de cada subida buena, lo que sobra de lo que la función creó va a la papelera de Drive; un valor que no sirve apaga la rotación (el respaldo se sube igual y la respuesta lo dice) |
| Contraseña de la base de datos | Gestor de contraseñas de Elías | **Elías** | Acceso directo a PostgreSQL (`supabase link` / `db push`) |
| Llave secreta (`sb_secret_…`) | La inyecta Supabase a las funciones; nunca fuera de ahí | Supabase | Que las funciones lean con privilegios de servicio |
| Llave pública (`sb_publishable_…`) y URL del proyecto | En el código de la app y en la variable `SUPABASE_PROYECTOS` de GitHub | Cualquiera | Es pública por diseño; la protege RLS |

Un secreto propio **no puede** empezar con `SUPABASE_` (nombres reservados de la plataforma). Para cargar los secretos:
`supabase secrets set --env-file <archivo temporal fuera del repositorio>` o el panel; nunca escritos en la línea de comandos.

## Cómo se prueba

```sh
sh supabase/tests/correr.sh          # la base: migraciones, RLS, reglas de negocio (PGlite)
sh pruebas/correr.sh                 # las pruebas de node del repositorio, incluidas las de las funciones
```

PGlite valida el SQL y las políticas pero **no es Supabase** (límites en [`tests/README.md`](tests/README.md)): por eso existe
`opcional/prueba-de-humo.sql`, que se corre en el proyecto real. Las pruebas de las funciones bajo Deno se corren si hay `deno`
en el PATH (o con `AL3D_DENO=<ruta>`) y se saltan con aviso si no.
