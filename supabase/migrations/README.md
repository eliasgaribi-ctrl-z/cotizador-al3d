# Migraciones de la base (Supabase / PostgreSQL 15–18)

Dieciocho archivos, **en orden numérico**. Cada uno trae sus propias tablas, triggers, índices, `ENABLE ROW LEVEL SECURITY`, políticas y `GRANT`/`REVOKE`, y ninguno depende
de uno posterior. Son idempotentes (`create … if not exists`, `create or replace`, `drop … if exists`): volver a aplicar uno no rompe nada. El diseño completo está en
`docs/PLAN-SUPABASE.md` y `docs/DECISIONES-SUPABASE.md`; la regla que lo resume: **se lee por RLS y se escribe solo por RPC `SECURITY DEFINER`** (`authenticated` no tiene
`INSERT`/`UPDATE`/`DELETE` en ninguna tabla; `anon` no tiene nada; `service_role` tiene `SELECT`/`INSERT`/`UPDATE` y ni siquiera él borra; lo único que borra son las purgas de los plazos de conservación de `0016`, que corre el dueño).

| Archivo | Qué hace |
|---|---|
| `0001_fundacion.sql` | privilegios por defecto (nada se abre solo), esquema `interno` (no expuesto), triggers comunes (`tocar`, `sin_borrar`, `solo_agregar`), utilidades puras, `empresas` (semilla `al3d`), `contadores` y `bitacora` |
| `0002_acceso.sql` | `miembros`, helpers de RLS, `mi_acceso`/`reclamar_acceso`/`miembro_*`, versión de contrato, la matriz de permisos |
| `0003_proyectos.sql` | `proyectos`, `ventas_dinero`, `instalaciones`, `abonos`; `partir_origen` (Fabricación no lee dinero) y `limpiar_cotizacion` |
| `0004_formulas.sql` | las vistas de fórmulas (`ventas_calculadas`, `comisiones_pendientes`), `normalizar_iva`, `comisiones_cobradas` |
| `0005_almacen.sql` | materiales, requerimientos, libro de movimientos, costos (solo Dirección/Pagos), constantes y sus RPC |
| `0006_rpc_obra.sql` | ganar/descartar/alta de venta, `proyecto_actualizar` (compuerta de sellos), `mover_etapa`, instalaciones |
| `0007_rpc_pagos.sql` | cobros, abonos de comisión, reparto FIFO, correcciones |
| `0008_notario.sql` | autorizaciones (sellos firmados, inmutables), cotizaciones, solicitudes, cuadernos y la subida única; dos RPC solo para `service_role` |
| `0009_cupos.sql` | cuotas de IA, `verificar_cupo`, turno de llaves y `contador_sembrar` (solo `service_role`) |
| `0010_sync_espejo.sql` | vistas del espejo a la hoja, `cuadre_hoja` (solo `service_role`) y el cierre de la publicación `supabase_realtime` (lista cerrada de 13 tablas) |
| `0011_auditoria.sql` | **la aduana**: comprueba los privilegios REALES y **aborta el despliegue** si algo quedó abierto (ver abajo) |
| `0012_endurecimiento.sql` | lo que encontró la revisión adversarial: importes finitos y acotados (`NaN`/`Infinity` ya no entran), `p_hoy` acotado, topes de texto, estadísticas apagadas en las tablas de dinero y correo verificado solo con proveedor Google. Idempotente; conviene volver a correr `0011` después |
| `0013_huecos_revision.sql` | lo que la revisión adversarial dejó «abierto, a propósito»: `subida_unica` ya no acepta quién, rol ni hora del cliente en la bitácora y no deja nacer cotizaciones autorizadas sin sello del servidor; holgura de sellos de 60 s para los roles bajos y Dirección gana ante ellos (decisión **provisional**, Q-06, con `proyectos.sellos_area`: **la deshace `0014`**); tope de `almacen_movimientos.ts`; Pagos no crea requerimientos; sin tablas temporales para `authenticated`. Idempotente; termina corriendo la auditoría |
| `0014_sellos_mas_reciente.sql` | Q-06 decidida por Elías (2026-10-16): **gana el cambio más reciente, con 10 min de holgura para todas las áreas**, como el `.gs`. Regresa `sello_valido`, `compuerta`, `preambulo` y las tres RPC de obra a la regla de siempre y **borra** `proyectos.sellos_area` con su trigger y sus funciones (ya nada los usa). Lo demás de `0013` no cambia. Idempotente; termina corriendo la auditoría |
| `0015_folio_de_la_hoja.sql` | Q-07 decidida por Elías (2026-10-16): `ganar_proyecto` acepta el V-### que ya le dio la hoja (`p_op.folio_hoja`, validado; si está ocupado, `DATO_INVALIDO` con `causa: folio_ocupado`), y un trigger mantiene el contador `V` a la altura del folio más alto. Idempotente; termina corriendo la auditoría |
| `0016_plazos.sql` | Plazos de conservación, decididos por Elías (2026-10-16): purgas en `interno` (solo el dueño las ejecuta) de las **cotizaciones no ganadas a los 8 meses** (con sus solicitudes y su lápida; lo ganado o con sello nunca), la **bitácora a 1 año** y lo **borrado en la app a los 30 días**; `sin_borrar` deja pasar solo la fila que la purga marcó y que cumple la regla de su tabla (los libros de dinero y las autorizaciones, nunca). `interno.purgar_plazos()` corre todas y anota en la bitácora; **pg_cron** la programa a diario (09:15 UTC) si la extensión se puede habilitar (en Supabase sí; en PGlite avisa y sigue). Ver abajo «Los plazos en el proyecto real». Idempotente; termina corriendo la auditoría |
| `0017_decisiones_elias.sql` | Lo que Elías decidió el 2026-10-16 al revisar las preguntas abiertas (`docs/DECISIONES-SUPABASE.md`). **Q-05:** los tres roles (Dirección, Fabricación y Pagos) mueven cualquier etapa; **solo Dirección cancela** («No se dio») y solo ella saca un proyecto de `cancelado` (la matriz de `etapas` y el preámbulo de `mover_etapa`); la transición automática «instalación hecha ⇒ instalado» corre para quien puede marcar «instalado» (Dirección y Fabricación). **Q-19:** `ia_cuota` deja **50** consultas de IA al día por persona (antes 200), aunque quien llama pida más. Copias íntegras de `matriz_permisos`, `mover_etapa`, `instalacion_guardar` e `ia_cuota` con el cambio marcado «0017:»; ninguna firma, tabla ni privilegio nuevo. Idempotente; termina corriendo la auditoría |
| `0018_cuadre_diario.sql` | La **copia diaria** hoja → nube, decidida por Elías el 2026-10-16: la tabla `cuadre_diario`, donde la función `importar-diario` deja un renglón por corrida (si se aplicó, si cuadró, cuántas diferencias, conflictos y filas que no entran, y un `resumen` sin nombres ni importes). Solo Dirección la lee (RLS); nadie la escribe desde la app (la función entra con `SUPABASE_DB_URL`); nadie la cambia ni la borra (`tocar`, `sin_borrar` y `solo_agregar`, como la bitácora); no va por Realtime. Una tabla y ninguna función: las listas cerradas de `0011` no cambian. Idempotente; termina corriendo la auditoría |
| `0019_tarifas.sql` | Los **precios del cotizador, editables por Dirección** (decidido por Elías el 2026-10-23): la tabla `tarifas` (un renglón por precio; las claves de fábrica no se borran, se ocultan; un renglón nuevo dice de cuál de fábrica se fabrica), el catálogo de fábrica `interno.tarifas_fabrica()`, y tres RPC: `tarifas_leer` (cualquier área), `tarifas_guardar` (solo Dirección, todo o nada, con bitácora) y `tarifas_de` (de servicio: la pide `autorizar` antes de recalcular). Vuelve a crear `interno.auditoria()` con esas tres en sus listas cerradas (idéntica a la de `0011`, que también se actualizó). La copia diaria trae la pestaña «Tarifas» de la hoja |

## Antes de aplicar: la configuración del proyecto

El proyecto real se configura con **«exponer tablas automáticamente» APAGADO** y **«RLS automático» ENCENDIDO** (`docs/DECISIONES-SUPABASE.md`). Por eso **cada objeto declara
su `GRANT`**, también para `service_role`: `BYPASSRLS` salta la RLS, no los privilegios. Cada tabla, vista y función empieza revocando a `PUBLIC`, `anon`, `authenticated` **y
`service_role`** y solo después da lo que da, así que los privilegios finales son los mismos aunque el proyecto tuviera «exponer tablas automáticamente» encendido (se
probó simulando esos privilegios por defecto). Nada aquí depende de extensiones de Supabase (ni `pgcrypto`, `pg_net` ni `vault`), salvo `0016`, que **habilita `pg_cron` si puede** para programar las purgas diarias; sin él (PGlite) avisa con un NOTICE, sigue, y las purgas se corren a mano.

`0001` usa `alter default privileges for role postgres …`: **las migraciones tienen que correr como `postgres`** (lo que hacen el SQL Editor del panel y
`supabase db push`). Si se corren con otro rol, esos privilegios por defecto no aplican a lo que ese rol cree.

## Cómo aplicar

- **SQL Editor del panel de Supabase:** abrir cada archivo y ejecutarlo, uno por uno, de `0001` a `0019`, en ese orden. Un archivo es una sola consulta de varias
  sentencias, que Postgres ejecuta como una transacción implícita (en PGlite un error deshace todo el archivo; en el panel no lo verifiqué). Como son idempotentes,
  después de un fallo basta arreglar la causa y volver a ejecutar el mismo archivo.
- **CLI:** con el proyecto enlazado (`supabase link`), `supabase db push` aplica en orden los que falten.

`0011` termina con un bloque que **aborta** si encuentra: una tabla de `public` sin RLS; una función ejecutable por `anon`/`PUBLIC`, o una de servicio ejecutable por
`authenticated`; una vista sin `security_invoker`; una tabla publicada con `replica identity full` (o fuera de la lista cerrada); privilegios de escritura para
`authenticated`; `service_role` con `DELETE`; una `SECURITY DEFINER` sin `search_path`; acceso a `interno` fuera de lo permitido; o una tabla sin su trigger `sin_borrar`.
Si aborta, el mensaje lista **todos** los hallazgos con su id (GR-01…GR-09). La misma comprobación se puede repetir cuando se quiera, como `postgres`:

```sql
select interno.auditoria();   -- {} = limpio; si no, una lista de problemas
```

Conviene correrla **después de cada migración nueva**: una función o tabla que no esté en las listas cerradas de `0011` sale nombrada.

## Los plazos en el proyecto real (`0016`)

Al aplicar `0016` en el SQL Editor, el panel muestra uno de dos avisos (NOTICE): «programado al3d-plazos con pg_cron» o «pg_cron no
está disponible aquí». En Supabase debe salir el primero (la migración habilita la extensión con `create extension if not exists
pg_cron`; si el plan o el proyecto no la dejan, se habilita a mano en *Database → Extensions* y se vuelve a correr `0016`). Para
revisarlo después, como `postgres`:

```sql
select jobname, schedule, command, active from cron.job where jobname = 'al3d-plazos';               -- 15 9 * * *  (03:15 en México)
select status, return_message, start_time from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'al3d-plazos') order by start_time desc limit 5;
select titulo, despues from public.bitacora where accion = 'purgo' order by id desc limit 5;          -- lo que borró cada corrida
select interno.purgar_plazos();                                                                     -- correrla a mano (ya, con now())
select cron.unschedule('al3d-plazos');                                                              -- apagarla sin quitar las funciones
```

Sin pg_cron (PGlite, o un proyecto donde no se habilite) las funciones quedan instaladas y **no corren solas**: hay que llamarlas a
mano. `supabase/opcional/prueba-de-humo.sql` (C40–C48; C49–C57 son de `0017`) comprueba los bordes, que los libros quedan exactos y que el trabajo está
programado.

## Lo que no es una migración

`supabase/opcional/` (aparte, no se aplica con las migraciones): `storage.sql` (bucket privado de imágenes y sus políticas; necesita el esquema `storage` del proyecto),
`semilla_materiales.mjs` (siembra el catálogo y las constantes) y `keepalive.md` (cómo no dejar que el plan gratuito pause el proyecto).

## Cómo se prueba

`sh supabase/tests/correr.sh` aplica todos los archivos sobre PGlite (PostgreSQL 18 en WASM) y corre las pruebas de cada área (`acceso`, `rls-y-dinero`, `formulas`,
`obra-y-etapas`, `pagos`, `almacen`, `notario`, `cupos`, `sync-e-importacion`, `auditoria`, `plazos`). **PGlite no es Supabase.** Lo que NO cubre y hay que comprobar en el proyecto
de pruebas antes de confiar en el real:

- PostgREST de verdad: el tope de 1000 filas (`max_rows`), los filtros `or=(…)` del cursor, el *embedding* bajo RLS y que la cabecera `x-al3d-contrato` llegue a `request.headers`;
- Realtime como servicio (que un cambio de `ventas_dinero` llegue solo a Dirección y a Pagos, y que no exista el `DELETE`) y las políticas de Storage contra el servicio real
  (`opcional/storage.sql` solo se probó contra un sustituto mínimo de `storage.objects`);
- las Edge Functions (`autorizar`, `verificar`, `espejo`, `ia`, `maps`, `salud`), el HMAC con la clave real y la prueba de oro con filas reales de «Autorizaciones»;
- la concurrencia entre conexiones (dos `registrar_cobro` con el mismo `op_id`, dos altas a la vez, dos repartos FIFO): PGlite tiene una sola conexión; el candado de fila y los
  `pg_advisory_xact_lock` están escritos pero no se pudieron someter a una carrera;
- los privilegios por defecto del proyecto real (los de Supabase pueden diferir de los del arnés): para eso está `0011`, que mira el catálogo de verdad;
- el límite de tiempo por sentencia (`statement_timeout`) del rol `authenticated` y el rendimiento con el volumen real (la prueba diferencial usa 20 000 filas de la vista, no el plan de ejecución del proyecto);
- el script importador de la fase 2 (no existe en esta rama) y todo lo que se lee de la hoja viva: `IM-01`, `IM-03`, `IM-04`, `IM-09`, `IM-10`, la parte de script de `IM-06`, `IM-07` e
  `IM-11` (lo que la base impone sí está probado) y `FM-35` (el cuadre contra la hoja real);
- `EX-01`…`EX-12` de `supabase/DISENO.md` §10.17 (Deno y proyecto de pruebas): no están escritas en esta rama. `EX-02` debe decir que los sellos nuevos se firman con
  `ascii-?` (lo que hace Apps Script de verdad), no con UTF-8.
