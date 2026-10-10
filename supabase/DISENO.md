# Esquema Supabase de AL3D — Diseño A: «unificado y mínimo»

Estado: **diseño para comparar** (2026-10-10). Cubre **datos, reglas y contratos**; no diseña pantallas ni código de cliente. Insumos leídos: `docs/PLAN-SUPABASE.md`, `docs/DECISIONES-SUPABASE.md` (Q-01..Q-20, obligatorias), el crítico `mapas/00-critico.md` (entero), los mapas 01–07 y 09, y lo que ya hay en el worktree para la migración: el arnés de PGlite `supabase/tests/arnes/` y los módulos `supabase/functions/_shared/` (`sello.js`, `verificar.js`, `ia.js`, `maps.js`); las afirmaciones sobre el código se verificaron contra el `.gs` y el cliente del worktree (`.gs:170-210`, `2705-2969`, `4826-4958`, `1641-1744`; `proyectos.js:1100-1330`; `agenda.js:395-455`). Donde un mapa y el código discrepaban, manda el código.

**Índice:** 0 Resumen · 1 Convenciones · 2 Tablas · 3 Cobertura · 4 Seguridad · 5 Catálogo de RPC · 6 Vista de fórmulas · 7 Sincronización · 8 Cupos y contadores · 9 Migraciones y shim · 10 Plan de pruebas · 11 Riesgos, supuestos y preguntas.

> **Dónde están las citas.** Las referencias `[M01]…[M09]` de este documento son los mapas del código real que están en
> [`docs/supabase/mapas/`](../docs/supabase/mapas/) (`[M02 §4]` = `02-ventas-dinero-formulas.md`, sección 4); `[00 §n]` y los ids
> `C-nn`, `N-nn`, `P-nn`, `X-nn`, `Q-nn` son del informe del crítico, `docs/supabase/mapas/00-critico.md`. Los ids de las pruebas
> (AC-, SE-, ET-, PG-, FM-, …) son los casos de la sección 10, implementados en `supabase/tests/`. Este documento es el DISEÑO:
> la verdad ejecutable son las migraciones de `supabase/migrations/` y sus pruebas; si difieren, mandan las migraciones y este
> documento se corrige (ver `docs/ESTADO-SUPABASE.md`). Una decisión posterior al diseño: **los sellos nuevos se firman con ASCII-?**
> (no UTF-8, como dice §11 R-02/EX-02): comprobado en Apps Script real el 2026-10-10.

---

## 0. Resumen de estructura y qué ventaja tiene

1. Dos esquemas: `public` (17 tablas, 4 vistas, 37 RPC) e `interno` (helpers y núcleos de reglas, no expuesto). Se escribe **solo por RPC** `SECURITY DEFINER`; `authenticated` no tiene INSERT/UPDATE/DELETE; se lee por RLS; vistas `security_invoker`; ninguna función ejecutable por `anon`.
2. **El centro:** `proyectos` es UNA tabla para toda fila de la hoja «Ventas» y todo proyecto; `historica=true` marca las ≥199 filas sin cotización ni obra (R2). `ventas_dinero` es 1:1 y restringida; `abonos` es un libro append-only. Una venta se identifica por `folio_hoja` (V-###): desaparece la «atadura» fila↔proyecto.
3. **Dinero por TABLAS** (RLS no oculta columnas): `ventas_dinero`, `abonos`, `almacen_costos`, `autorizaciones`; cotizaciones y solicitudes solo para autor + Dirección; bitácora con `nivel` por fila; `origen` partido en obra (lista blanca + CHECK) y dinero. Fabricación nunca recibe dinero (R1).
4. **Compuerta de sellos por campo en la base** (`interno.compuerta`, función pura): el empate al subir escribe, «vacío sin sello» no borra, `etapa`/`entrega` no se vacían, el sello se acota a `ahora+10 min`.
5. **Fórmulas:** la vista `ventas_calculadas` reproduce H, K, O–X con `numeric` exacto; R = 10 % fijo del subtotal; el IVA por cuenta es regla de las RPC.
6. **Obra y Pagos:** `mover_etapa` impone la etapa por rol (Q-05) con la salida `mov-salida:<req.id>` idempotente y las dos transiciones automáticas; cobro, abono, reparto FIFO, corrección y alta viven en RPC con `op_id`.
7. **Autorizaciones:** N sellos por folio, textos en `text` verbatim e inmutables; el HMAC lo calcula una Edge Function TypeScript; `registrar_autorizacion` solo `service_role`; **la clave del sello no existe en la base**.
8. **Acceso y empresas:** invitación = fila sin `usuario_id`; `reclamar_acceso` la vincula con el correo verificado; la baja es un estado y la única fuente de `acceso_revocado`; `empresa_id` en toda tabla con FK compuestas, derivado de la membresía.
9. **Sincronización:** cursor `(updated_at, id)` con solape de 30 s, tombstones `deleted_at`, una RPC por operación de la bandeja, idempotencia por id de cliente (y `op_id` solo en cobro, abono y reparto), versión de contrato por cabecera.
10. **Cupos sin estado:** una tabla `contadores` (V-###, P-###, secuencia del almacén, cuota IA por día de México, ventanas de `/verificar`).
11. **Verificable en PGlite** con el arnés que ya está en el worktree y sin extensiones de Supabase: 310+ casos numerados, permitidos y denegados por rol y regla, y una auditoría del catálogo dentro de la migración `0011`; lo que PGlite no ve va a Deno y al proyecto de pruebas. **Ya se corrió**: los bloques SQL de §2, §4–§8 se cargaron en el arnés sin error y el pseudocódigo de 31 de las 37 RPC se tradujo a PL/pgSQL de prueba y se ejecutó: 171 comprobaciones en verde, y salieron 11 correcciones (§9.2).
12. **Cobertura exhaustiva (§3):** hoja A..AI y 21 pestañas, almacén, autorizaciones, solicitudes, accesos, 12 almacenes de IndexedDB campo por campo, ~60 claves de storage y las propiedades del script.

**Ventaja sobre la alternativa obvia** (el plan §4.7 al pie de la letra: `proyectos` + `ventas_dinero` + una tabla `ventas` para el histórico + `clientes`, más lo que el crítico §5.4 añade: `abonos`, `autorizaciones`, `contadores`, `ia_cuota`, `verificar_cupo`, `invitaciones`, `espejo_estado`, `config` ≈ **22 tablas**):

| Dimensión | Alternativa obvia | Este diseño (17 tablas) |
|---|---|---|
| Identidad de una venta | dos entidades (`ventas` y `proyectos`) con la maquinaria de atadura, duplicados y fusión que hoy ocupa ~700 líneas del cliente [M05 §7] | **una**: `proyectos` con `folio_hoja`; Control suma un solo `JOIN` |
| Superficie de ataque | CRUD por RLS con compuertas repartidas entre trigger, vista y cliente | **una sola puerta de escritura** (RPC), una forma de política (`empresa_id in empresas_donde(áreas)`), 0 `INSERT/UPDATE/DELETE` para `authenticated` |
| Dinero | «vistas por área» que se saltan RLS salvo `security_invoker` [C-09] | separación por **tablas**; ninguna vista de lectura por área |
| Tablas auxiliares | `ia_cuota`, `verificar_cupo`, `config`, `espejo_estado`, `invitaciones`, `clientes` | `contadores` (1), una función para la versión, `miembros` hace de invitación, no existe `clientes` (no hay entidad: [M09 §3]) |
| Verificabilidad | reglas repartidas ⇒ pruebas de integración | funciones **puras** (`compuerta`, `sello_valido`, `neto`, `comision`), auditoría del catálogo dentro de la migración (`0011`) y **ya corrido**: el SQL y el pseudocódigo de 31 RPC contra el arnés de PGlite (§9.2) |

### 0.1 Demostración de los requisitos duros

| Req. | Cómo se cumple | Dónde | Pruebas |
|---|---|---|---|
| **R1** Fabricación no lee dinero por ninguna vía | tablas separadas sin política para Fabricación; `origen` partido (lista blanca + `CHECK` recursivo); `tarifa` fuera; bitácora por nivel; RPC que proyectan; Realtime con lista cerrada, sin `DELETE` ni `REPLICA IDENTITY FULL`; costos de almacén aparte | §2.7, 2.8, 2.17, 4.2–4.6, 5.14 | R1-01..R1-18, GR-04, GR-05, PX-01..PX-04 |
| **R2** las ≥199 históricas existen y Control las suma | `proyectos.historica` + una fila de `ventas_dinero` por cada una; la vista las incluye | §2.6, 3.0, 6.6 | HI-01..HI-07, FM-30 |
| **R3** compuerta de sellos en la base | `interno.compuerta` (SQL exacto) + `proyecto_actualizar`, `mover_etapa`, `instalacion_guardar`, `almacen_aplicar`; traducción de `.gs:2881-2929` y `obraDeLaFila` | §5.4 | SE-01..SE-24, ET-21, IN-06, AL-07, AL-15 |
| **R4** fórmulas al centavo | vista `ventas_calculadas` (SQL exacto), `numeric`, IVA-por-cuenta, R = `ROUND(G*10%,2)` sin `pct_comision` | §6, 5.7 | FM-01..FM-35, PG-07, PG-08 |
| **R5** etapa por rol, 2 transiciones automáticas, salidas idempotentes | `mover_etapa` (tabla rol×origen×destino), `mover_etapa_core`, `emitir_salidas` (`mov-salida:<req.id>` + `ON CONFLICT DO NOTHING`) | §5.6, 5.8 | ET-01..ET-23 |
| **R6** acciones de Pagos en la base | cobro/liquidación, abono, FIFO, corrección, alta; abonos append-only con `P-###` | §5.7, 2.8 | PG-01..PG-30 |
| **R7** autorizaciones | N sellos por folio, verbatim, solicitud→autorización→revocación con quién puede cada transición; cotizaciones/solicitudes autor + Dirección | §2.10–2.12, 5.10 | NO-01..NO-25, VB-01..VB-06, EX-01..EX-03 |
| **R8** acceso por correo | invitación sin `usuario_id`, `reclamar_acceso` con correo verificado, baja con bitácora, `acceso_revocado` explícito | §2.3, 5.3, 7.5 | AC-01..AC-18 |
| **R9** multiempresa | `empresa_id` en toda tabla, FK compuestas, `ctx()` | §1.1, 4.2 | MT-01..MT-07, RL-17 |
| **R10** sincronización | cursor `(updated_at,id)` con solape, tombstones, idempotencia, versión de contrato | §7 | SY-01..SY-14, AC-16 |
| **R11** cupos sin estado | `contadores`, `ia_cuota` (día MX), `verificar_cupo`, `V-###`, `seq` del almacén | §8 | CU-01..CU-15 |
| **R12** nada se pierde sin destino | cobertura exhaustiva del plan §3.1 y del crítico §5 | §3 | IM-01..IM-12 |

### 0.2 El crítico §5.4 («tablas y columnas que el código exige y el §4.7 no tiene») frente a este diseño

| Lo que exige el código | Dónde queda |
|---|---|
| `ventas` (libro, incluye histórico) | `proyectos` con `historica` (§2.6) |
| `abonos` (ledger con `pago_id`) | `abonos` (§2.8) |
| `autorizaciones` (N por folio, verbatim, `clave_id`) | `autorizaciones` (§2.10) |
| `contadores` (V-###, secuencia del almacén) | `contadores` (§2.4, §8) |
| `ia_cuota`, `verificar_cupo` | filas de `contadores` + `ia_cuota()`/`verificar_cupo()` (§8) |
| `invitaciones`/correo en `miembros` | `miembros` por correo (§2.3) |
| `espejo_estado` | fila de `contadores` + vistas `espejo_*` (§7.8) |
| `config` (versión de contrato) | `public.version_contrato()` (§7.6) |
| `proyectos.sellos` + sello propio de la cita | `proyectos.sellos` (8 claves, incluye `instalacion`); la instalación no se re-sella (§2.9, §5.4) |
| `proyectos.origen_dinero` | `ventas_dinero.origen_dinero`; la parte de obra en `proyectos.origen_obra` (§4.5) |
| `instalaciones` completas | §2.9 |
| `movimientos`/`materiales`/`requerimientos` con costos restringidos | §2.14–2.17 |
| `bitacora` con `usuario_id` | §2.5 |
| soft-delete y `updated_at` indexado | §1.1 y un índice `*_sync` por tabla |

---

## 1. Convenciones

**Leyenda de citas.** `[M01]..[M09]` = mapas del código real (`scratchpad\mapas\0N-*.md`), con su sección (`[M02 §4.3]`); `[C-nn]`, `[N-nn]`, `[P-nn]`, `[X-nn]`, `[Q-nn]` = hallazgos del crítico `[00 §…]`; `[PLAN §x]` = `docs/PLAN-SUPABASE.md`; `[DEC Q-nn]` = `docs/DECISIONES-SUPABASE.md`; `.gs:N` = `puente/hoja-apps-script.gs`; `archivo.js:N` = el worktree `…\.claude\worktrees\supabase`. Lo que no pude confirmar va marcado **NO CONFIRMADO** con la decisión por defecto. Las decisiones nuevas de este diseño (no estaban en el plan ni en las Q-01..Q-20) llevan id `Q-A##` y se listan en §11.

### 1.1 Esquemas, ids, tiempos, borrado, nombres

| Tema | Regla | Por qué / fuente |
|---|---|---|
| Esquema `public` | Tablas de negocio, **vistas con `security_invoker = true`**, RPC para el cliente (`authenticated`) y RPC solo para Edge Functions (`service_role`). Nada más. | PostgREST expone `public`; «exponer tablas automáticamente» está APAGADO, así que cada objeto lleva su GRANT [DEC A.4] |
| Esquema `interno` | Helpers de RLS, núcleos de las reglas (`mover_etapa_core`, `compuerta`, `emitir_salidas`…), triggers y utilidades. **No está en `db_schemas` de PostgREST.** `authenticated` y `service_role` tienen `USAGE` en el esquema y `EXECUTE` solo en los helpers que las políticas RLS necesitan; `anon` no tiene nada. | Una función en un esquema expuesto es RPC pública; las políticas evalúan helpers con los privilegios del que consulta, por eso hace falta `USAGE`/`EXECUTE` |
| Funciones `SECURITY DEFINER` | Todas con `set search_path = ''`, nombres calificados (`public.`, `interno.`, `auth.`, `pg_catalog.` implícito), `REVOKE ALL … FROM PUBLIC, anon, authenticated` y `GRANT EXECUTE` solo a quien toca, **en el mismo archivo y justo después del `CREATE FUNCTION`**. Además, al inicio: `alter default privileges for role postgres revoke execute on functions from public;`. | En Postgres toda función nace con `EXECUTE` para `PUBLIC`; con `anon` ejecutable, una RPC es una puerta abierta. La prueba GR-01 lo audita sobre el catálogo |
| Funciones de trigger | `set search_path = ''`, no `SECURITY DEFINER` (corren con los privilegios de la RPC que las dispara). | |
| Ids | `text` para todo lo que el cliente ya genera (`proy-…`, `proy-hoja-V-214`, `inst-…`, `mov-…`, `mov-salida:<req.id>`, claves de material); no se convierten a `uuid` [DEC A.8; M09 §10.5]. `bigint generated always as identity` para filas que solo crea el servidor (`autorizaciones`, `solicitudes`, `abonos`, `bitacora`, `almacen_costos`). `uuid` solo para ids de `auth.users` (`usuario_id`, `creado_por`). | `uid_ics = 'inst-'||id||'@al3d.mx'` depende del id (si el UID cambia el calendario duplica el evento) [M09 §2.1] |
| Registro y sincronización | Todas las tablas mutables llevan `created_at timestamptz not null default now()` y `updated_at timestamptz not null default clock_timestamp()`; un trigger `interno.tocar()` pone `updated_at = clock_timestamp()` en cada INSERT y en cada UPDATE **que cambie algo** (un upsert idempotente del importador no mueve el cursor, IM-02). Es **el cursor de sincronización** (§7), nunca un sello de «quién gana». `clock_timestamp()` (no `now()`) para que el orden refleje el momento de escritura dentro de la transacción. | R10 |
| Sellos «quién gana» | `bigint` epoch-ms del reloj del **teléfono**, acotados por el servidor a `ahora + 10 min` [DEC Q-06; `.gs:2024-2029`]. Viven en `proyectos.sellos` (jsonb de ≤8 claves), `materiales.sellos`, `requerimientos.sellos`, `almacen_costos.sello`. Nunca se confunden con `updated_at`. | [M02 §4; M05 §4] |
| Fechas de negocio | `date` (sin zona) para fechas de la hoja (L, M, N, `fecha` de instalación, de abono). «Hoy» = `interno.hoy_mx()` = fecha de `now()` en `America/Mexico_City` (`Q-A14`). | [M02 §6.10] |
| Textos firmados | `text`, **nunca** `jsonb`, `timestamptz` ni `numeric`: `autorizaciones.ts_iso`, `huella`, `items_auth`, `renglones`, `proyecto`, `autorizo`, `folio_global` y los tres importes en su forma firmada `NNNN.NN` (`*_txt`). Una celda se importa tal cual (`getValues()`), sin recortar espacios. | R7 (un PDF ya impreso debe seguir verificando); `.gs:3635-3646`; [M04 §1.2, §1.7] |
| Dinero | `numeric` **sin escala** en subtotal, anticipo, liquidación, abonos (la hoja guarda `Number(valor)` sin redondear, `.gs:3004`). `round(numeric, 2)` (mitad lejos de cero sobre el valor decimal exacto) solo en H, K, R, T; que coincida con `ROUND` de Sheets en los empates reales (doble precisión) es **NO CONFIRMADO** (`Q-A15`, FM-35). Nunca `double precision` [DEC A.7; C-09]. | [M02 §2.4] |
| Coordenadas | `double precision` (no son dinero; el cliente compara con `toFixed(6)`). | |
| Borrado | **Sin borrados duros.** `deleted_at timestamptz` (lápida) en `proyectos`, `ventas_dinero`, `instalaciones`, `cotizaciones`, `cuaderno_notas`. Tablas **append-only** (sin lápida; se corrigen con contra-asiento o cambio de estado): `abonos`, `almacen_movimientos`, `autorizaciones` (solo cambia `estado`), `bitacora`. Bajas lógicas con su propio estado: `materiales.activo`, `requerimientos.estado='descartado'`, `miembros.estado='baja'`, `solicitudes.estado`. Las lápidas **no se purgan** (volumen ínfimo; `Q-A18`). `service_role` ni siquiera tiene el privilegio `DELETE` (§4.2) y un trigger `interno.sin_borrar()` rechaza el `DELETE` en todas las tablas de negocio aunque lo intentara el dueño (segunda defensa). | [DEC A.6]; Realtime no aplica RLS a DELETE [00 §10] |
| `empresa_id` | En **toda** tabla de negocio, `not null references empresas(id)`, y las llaves únicas son por empresa. Los hijos usan FK compuesta `(empresa_id, padre_id)` contra `unique (empresa_id, id)` del padre, así una fila hija no puede apuntar a un padre de otra empresa. Las RPC **derivan** la empresa de la membresía (`interno.ctx`); jamás se lee `empresa_id` de la carga del cliente. | R9 [PLAN §4.1] |
| Nombres | Español, `snake_case`, tablas en plural, sin `notion_*` [DEC A.9]. Columnas técnicas (`created_at`, `updated_at`, `deleted_at`) en inglés porque así las pide el contrato de sincronización. Los nombres de propiedad del puente con espacio final (`'Cuenta '`, `'Precio Neto '`) **no** existen en SQL; los traduce el cliente [M02 §6.21]. | |
| jsonb | Solo donde el cliente ya congela un objeto: `proyectos.origen_obra`, `ventas_dinero.origen_dinero`, `cotizaciones.datos`, `solicitudes.cotizacion`, `*.sellos`, `cotizaciones.hitos`, `requerimientos.partidas`, `bitacora.antes/despues`, `*.procedencia`. | |
| `procedencia jsonb` | Bolsa de trazabilidad de la importación (`{fila_hoja, importado_en, celdas_originales, telefonos[], ids_fusionados[]}`): conserva lo que no cupo en una columna tipada (p. ej. un «Tipo de trabajo» tecleado a mano) sin perderlo. Solo se escribe por importación/`subida_unica`. | R12 |
| Errores | Las RPC devuelven un **sobre**: `{ok:true,…}` o `{ok:false, codigo, mensaje, definitivo, …}` (`interno.err`). Códigos: los del puente (`DATO_INVALIDO`, `ROL_SIN_PERMISO`, `NO_ENCONTRADO`, `DESCONOCIDO`, `CATALOGO_DESINCRONIZADO` —solo de la Edge `autorizar`—, `CUPO_AGOTADO`, `SIN_RED`) + nuevos `ACCESO_REVOCADO`, `SIN_ACCESO`, `SIN_SESION`, `EMPRESA_REQUERIDA`, `CLIENTE_VIEJO`, `DUPLICADO`, `ACCESO_CONFLICTO`, `LOTE_RECHAZADO` (qué RPC devuelve cuál: §5.15). `definitivo = true` solo para `ROL_SIN_PERMISO`, `NO_ENCONTRADO`, `DATO_INVALIDO`, `DUPLICADO` (la bandeja los aparta, igual que hoy `puente.js:1190`); `ACCESO_REVOCADO`/`CLIENTE_VIEJO`/`SIN_ACCESO`/`SIN_SESION`/`EMPRESA_REQUERIDA` **no** son definitivos: detienen el bombeo sin descartar nada [P-01]; `LOTE_RECHAZADO` lleva el `definitivo` de la op que lo causó. `RAISE EXCEPTION` solo para bugs (el cliente lo trata como reintentable). **Toda validación y todo chequeo de rol ocurre antes de la primera escritura**; los mensajes de error nunca llevan importes. | [M05 §5.2; C-15] |
| Lotes y subtransacciones | Una RPC de lote procesa cada op en un bloque `begin … exception when others` (subtransacción): una op que truena no se lleva a las demás, salvo `p_atomico = true` (compra recibida: «entra completa o no entra», [M03 H10]). | |
| Contrato | Cabecera HTTP `x-al3d-contrato: <entero>` que las RPC de escritura leen de `request.headers` (`interno.guardia_contrato`); ausente o menor que el mínimo ⇒ `CLIENTE_VIEJO`. `public.version_contrato()` y `mi_acceso().contrato` entregan `{actual, minimo}`. Reemplaza `VERSION_ESPERADA`/umbrales 9/11/12/14 [M05 §5.6]. | R10 |
| Idempotencia | Ver §7.3: por id natural (`PRIMARY KEY`), por `UNIQUE` de negocio (`folio_global`), por `op_id` único solo en las tres operaciones **acumulativas** (cobro, abono, reparto). | R10 |
| Archivos de migración | `supabase/migrations/NNNN_nombre.sql`; idempotentes (`create … if not exists`, `create or replace`) salvo los `create table`; los opcionales (Storage, pg_cron, pg_net, vault) viven en `supabase/opcional/` y **no** se corren en PGlite (§9). | |
| Políticas RLS | Nombre `<tabla>_<op>_<areas>` (`ventas_dinero_sel_dir_pag`). Siempre `to authenticated`; nunca políticas para `anon`. `service_role` salta RLS (`BYPASSRLS`), pero sus privilegios de tabla se conceden explícitamente. | |

### 1.2 Vocabularios cerrados (CHECK) que el cliente y el `.gs` duplican hoy

Una sola lista en la base; el cliente la lee de aquí o la copia con prueba de paridad [M05 §3.5; M02 §5.4].

| Vocabulario | Valores | Dónde se impone |
|---|---|---|
| Áreas | `direccion`, `fabricacion`, `pagos` (`cliente` queda para la fase 6: sin políticas ⇒ no ve nada) | `miembros.area` |
| Estatus (eje dinero) | `FABRICACION`, `REPARANDO`, `COBRANDO`, `LIQUIDADO` (sin acentos, mayúsculas) | `proyectos.estatus` [`.gs:37`] |
| Cuentas | `Elias BBVA`, `Constru BNT`, `Moni MPago`, `Rul HSBC`, `Tatis BNT`; solo `Elias BBVA` no factura | `ventas_dinero.cuenta` [`.gs:29,935`] |
| Etapas (eje obra) | `ganado`, `en_diseno`, `cortado`, `armado`, `listo`, `instalado`, `garantia`, `cancelado`; `ORDEN` = 0..5 solo para las seis primeras | `proyectos.etapa`, `interno.orden_etapa()` [`proyectos.js:88-121`] |
| Tipos de trabajo | `Caja de luz con iluminacion`, `Caja de luz sin iluminacion`, `Letras 3D con iluminacion`, `Letras 3D sin iluminacion`, `Rotulacion de vinil`, `Recorte acrilico`, `Custome / Proyecto Especial` (sin acentos, «Custome» a propósito) | `proyectos.tipo_trabajo <@` [`proyectos.js:132-140`] |
| Entrega | `instalacion`, `paqueteria`, `recoleccion`; `NULL` = «nadie lo dijo» (≠ instalación) | `proyectos.entrega` [M09 §1.2] |
| Plazo de taller | cubo `1..5` (1 sem, 1.5, 2, 2.5, 3+) o `NULL` | `proyectos.plazo_k` |
| Instalación | estado `propuesta`, `confirmada`, `reagendada`, `hecha`, `cancelada`; ventana `dia`, `noche`, `madrugada`; duración 1..600 | `instalaciones` [M09 §2.1] |
| Almacén | tipo `entrada`, `salida`, `ajuste`, `conteo`, `merma`, `devolucion`; origen `derivado`, `manual`, `conteo`, `compra`; unidad de compra `unidad`, `bolsa`, `caja`, `lamina`, `litro`, `metro`; de consumo `m2`, `m`, `cm`, `pieza`, `litro`; estado de requerimiento `calculado`, `apartado`, `comprado`, `consumido`, `descartado` | [`.gs:5240-5266`; M03 §2.5] |
| Autorización / solicitud | `autorizaciones.estado`: `vigente`, `superada`, `revocada`; `solicitudes.estado`: `pendiente`, `autorizada`, `rechazada`, `cancelada` | [M04 §4.1] |
| Niveles de bitácora | `general` (los tres roles), `dinero` (Dirección y Pagos), `direccion` (solo Dirección: accesos, sistema) | `bitacora.nivel` |
| Grupos de sello | `etapa`, `notas`, `plazo_k`, `tel`, `dir_texto`, `ubicacion`, `entrega`, `instalacion` (el 8.º es la cita; vive aquí y no en la instalación, ver §5.4) | `interno.sellos_validos()` [M02 §4.1; M05 §4.1] |

### 1.3 Cómo se escribe cada cosa (regla de oro del diseño)

```
Leer   : PostgREST sobre tablas/vistas, filtrado por RLS (§4.2). Ninguna RPC de lectura salvo las que PROYECTAN
         (estado_solicitudes, vista_previa_reparto, comisiones_cobradas, mi_acceso) porque la fila completa no se puede dar.
Escribir: SOLO por RPC SECURITY DEFINER (§5). authenticated no tiene INSERT/UPDATE/DELETE en NINGUNA tabla.
Secreto : la clave del sello NO existe en la base (ni columna, ni función, ni Vault). La firma la calcula la Edge
          Function; la base guarda los textos firmados verbatim y rechaza cualquier UPDATE que los toque.
```

---

## 2. Tablas

### 2.0 Inventario y justificación (diseño A: el menor número de piezas que cumple R1..R12)

17 tablas (el plan §4.7 nombra 13, contando `clientes`). Cada tabla que **no** está en el plan lleva su razón; la que el plan trae y yo quito, también.

| # | Tabla | ¿Plan §4.7? | Papel | Justificación de lo que cambia |
|---|---|---|---|---|
| 1 | `empresas` | sí | multiempresa (R9) | — |
| 2 | `miembros` | sí | acceso por correo, invitación sin `usuario_id`, baja con estado (R8) | el plan decía `(usuario_id, empresa_id, area)`; la hoja «Accesos» se llave por **correo** y `auth.users.id` no existe hasta el primer ingreso [C-19] |
| 3 | `proyectos` | sí | **UNA sola tabla** para toda fila de la hoja «Ventas» y todo proyecto de la plataforma; bandera `historica` para las ≥199 filas sin cotización ni obra (R2) | evita una tabla `ventas` aparte y toda la maquinaria de «atadura» fila↔proyecto (`mismaVentaQueLaFila`, `hoja_doble`, `duplicado_de`…, [M05 §7]) |
| 4 | `ventas_dinero` | sí | dinero 1:1, RLS solo Dirección y Pagos (R1) | solo lo que está en `CAMPOS_DE_DINERO`; `estatus`/`iva`/`fecha_anticipo` **no** van aquí (Q-03) |
| 5 | `abonos` | **no** | libro append-only de «Abonos comisión» con ids `P-###` (R6) | es un LIBRO con 3 formas de captura, no un cálculo [C-06; M02 §3.1] |
| 6 | `instalaciones` | sí | citas (1:N, una viva por proyecto) | — |
| 7 | `cotizaciones` | sí | copia de trabajo de cada cotización, llave `folio_global` (R7) | el plan usaba `folio`; el corto se repite entre teléfonos [M07 §6.1] |
| 8 | `solicitudes` | sí | cola solicitud→resolución | — |
| 9 | `autorizaciones` | **no** | N sellos por folio, textos verbatim (R7) | no caben en una columna de `cotizaciones` [C-26] |
| 10 | `cuaderno_notas` | **no** | destino de `al3d_cuadernos` (R12) | el plan trae `clientes`, pero **no existe la entidad cliente** en el código [M09 §3]; la agrupación «cuaderno» es una lectura derivada y solo su nota es dato |
| 11 | `materiales` | sí | catálogo, sellos por campo | — |
| 12 | `requerimientos` | sí | listas de compra | — |
| 13 | `almacen_movimientos` | sí | libro append-only | — |
| 14 | `almacen_costos` | **no** | `costo_compra` y `costo_total` aparte (R1) | RLS no oculta columnas [M03 H2] |
| 15 | `constantes` | sí | constantes del taller por empresa | — |
| 16 | `bitacora` | sí | historia, con nivel de visibilidad (R1) | también sirve de diario de idempotencia (`op_id`) y de bitácora de accesos (R8) |
| 17 | `contadores` | **no** | `V-###`, `P-###`, secuencia del almacén, cuota IA, ventanas de `/verificar` (R11) | una sola tabla para todo lo que hoy es `PropertiesService`/`CacheService` |

**Quitada:** `clientes` (ver fila 10). **No son tablas** (y por qué): configuración de versión de contrato (es la función `public.version_contrato()`: cambia con una migración, que es cuando cambia el contrato); estado del espejo (una fila de `contadores` y las vistas `espejo_*`); cola de reintento del espejo (vive en la Edge Function y en su cursor).

### 2.1 Triggers comunes (se crean en cada tabla; el DDL de abajo no los repite)

```sql
-- updated_at es el cursor de sincronización: solo se mueve si la fila CAMBIÓ de verdad (un upsert del importador con los mismos valores no la «ensucia», IM-02)
create function interno.tocar() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new is distinct from old then new.updated_at := clock_timestamp(); end if;
  return new;
end $$;

create function interno.sin_borrar() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Las filas de % no se borran: use su baja logica', tg_table_name using errcode = 'P0001'; end $$;

create function interno.solo_agregar() returns trigger language plpgsql set search_path = '' as $$
begin raise exception '% es un libro: no se edita, se corrige con otro asiento', tg_table_name using errcode = 'P0001'; end $$;

-- por tabla mutable:   create trigger <t>_tocar      before insert or update on public.<t> for each row execute function interno.tocar();
-- por TODA tabla de negocio (todas menos `contadores`, que limpia sus ventanas vencidas, §8):
--                      create trigger <t>_sin_borrar before delete          on public.<t> for each row execute function interno.sin_borrar();
-- libros append-only:  create trigger <t>_solo_agregar before update        on public.<t> for each row execute function interno.solo_agregar();
--                      (abonos, almacen_movimientos, bitacora; autorizaciones usa su propio trigger, §2.10)
```

**Utilidades puras que los `CHECK` de las tablas necesitan** (van **antes** de las tablas; el resto de las utilidades está en §5.2). Son las dos defensas de R1 y R3 en la base: `contiene_dinero` (el `CHECK` de `proyectos.origen_obra`, §4.5) y `sellos_validos` (el de `proyectos.sellos`).

```sql
create function interno.ahora_ms() returns bigint language sql volatile set search_path = '' as $$
  select floor(extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- V-001 … V-999, V-1000 …: `lpad` TRUNCA si el texto ya es más largo que el ancho (lpad('1000', 3, '0') = '100'), por eso el ancho nunca baja de lo que mide el número
create function interno.folio_texto(p_prefijo text, p_n bigint) returns text language sql immutable set search_path = '' as $$
  select p_prefijo || '-' || pg_catalog.lpad(p_n::text, greatest(3, pg_catalog.length(p_n::text)), '0') $$;

create function interno.orden_etapa(e text) returns int language sql immutable set search_path = '' as $$
  select case e when 'ganado' then 0 when 'en_diseno' then 1 when 'cortado' then 2 when 'armado' then 3
                when 'listo' then 4 when 'instalado' then 5 end $$;                      -- garantia, cancelado y lo demas: NULL

create function interno.telefono_limpio(t text) returns text language sql immutable set search_path = '' as $$
  select case when t is null then null
              when pg_catalog.btrim(t) = '' then ''                                    -- vacio de entrada = «borrar»
              else (select case when s ~ '[0-9]' then pg_catalog.btrim(pg_catalog.left(s, 30)) end    -- sin digitos: NULL = invalido
                      from (select pg_catalog.btrim(pg_catalog.regexp_replace(
                                     pg_catalog.regexp_replace(t, '[^0-9 +()-]', ' ', 'g'), '\s+', ' ', 'g')) as s) x)
         end $$;                                                                          -- `telefonoLimpio`, .gs:2095-2099

-- los sellos de un proyecto: objeto cuyas claves son los 8 grupos y cuyos valores son enteros >= 0 (epoch-ms)
create function interno.sellos_validos(j jsonb) returns boolean language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_typeof(j) = 'object'
     and not exists (
       select 1 from pg_catalog.jsonb_each(j) e
        where e.key <> all (array['etapa','notas','plazo_k','tel','dir_texto','ubicacion','entrega','instalacion'])
           or case when pg_catalog.jsonb_typeof(e.value) = 'number'
                   then (e.value #>> '{}')::numeric < 0 or (e.value #>> '{}')::numeric <> pg_catalog.trunc((e.value #>> '{}')::numeric)
                   else true end) $$;

-- R1: ninguna clave de dinero, a ningun nivel (objetos y arreglos anidados), sin importar mayusculas
create function interno.contiene_dinero(j jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
begin
  case pg_catalog.jsonb_typeof(j)
    when 'object' then
      for k, v in select * from pg_catalog.jsonb_each(j) loop
        if pg_catalog.lower(k) = any (array['tarifa','pu','_lt','precioauth','neto','sub','anti','antimanual','itemsauth','huellaauth',
                                           'sello','autorizador','fechaauth','nota','total','importe','precio','costo','subtotal',
                                           'anticipo','liquidacion','comision','saldo'])
           or interno.contiene_dinero(v) then return true; end if;
      end loop;
    when 'array' then
      for v in select * from pg_catalog.jsonb_array_elements(j) loop
        if interno.contiene_dinero(v) then return true; end if;
      end loop;
    else null;
  end case;
  return false;
end $$;
```

### 2.2 `empresas`

Propósito: ancla de multiempresa. Hoy una sola fila (`al3d`); `Prefs.empresa()` deja de decidir [M06 §5].

```sql
create table public.empresas (
  id         text primary key check (id ~ '^[a-z][a-z0-9_]{1,31}$'),
  nombre     text not null check (btrim(nombre) <> ''),
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.empresas (id, nombre) values ('al3d', 'AL3D') on conflict (id) do nothing;
```

| Quién | Operación |
|---|---|
| Lee | `authenticated`: solo las empresas donde es miembro activo (§4.2) |
| Escribe | nadie desde el cliente; alta de empresa = migración / `service_role` |

### 2.3 `miembros`

Propósito: acceso por correo (R8). **Una invitación es una fila con `usuario_id` nulo** y `estado='invitado'`; el primer ingreso con correo verificado la reclama (`reclamar_acceso`). Quitar el acceso **no borra la fila**: `estado='baja'` (queda la evidencia y la señal explícita `acceso_revocado`).

```sql
create table public.miembros (
  empresa_id   text not null references public.empresas (id),
  correo       text not null check (correo = lower(btrim(correo)) and correo ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  area         text not null check (area in ('direccion','fabricacion','pagos')),
  estado       text not null default 'invitado' check (estado in ('invitado','activo','baja')),
  usuario_id   uuid,                         -- auth.users.id; sin FK a propósito: borrar la cuenta no debe borrar la evidencia
  nota         text not null default '' check (length(nota) <= 500),
  invitado_por uuid,
  invitado_en  timestamptz not null default now(),
  reclamado_en timestamptz,
  baja_en      timestamptz,
  baja_por     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default clock_timestamp(),
  primary key (empresa_id, correo),
  constraint miembros_estado_coherente check (
       (estado = 'invitado' and usuario_id is null)
    or (estado = 'activo'   and usuario_id is not null)
    or (estado = 'baja')
  )
);
-- una persona (usuario) tiene UN área activa por empresa:
create unique index miembros_activo_uno   on public.miembros (empresa_id, usuario_id) where usuario_id is not null and estado = 'activo';
create index        miembros_por_usuario on public.miembros (usuario_id) where usuario_id is not null;
create index        miembros_sync        on public.miembros (empresa_id, updated_at, correo);
```

| Quién | Lee | Escribe |
|---|---|---|
| Dirección | todas las filas de su empresa | RPC `miembro_alta`, `miembro_cambiar_area`, `miembro_baja` |
| Fabricación / Pagos | **solo su propia fila** (`usuario_id = auth.uid()`), baja incluida: así se entera de que salió | `reclamar_acceso()` (solo vincula su propia invitación) |
| `anon` | nada | — |

### 2.4 `contadores`

Propósito: **todo lo que hoy es estado en el script** y las funciones sin estado no pueden guardar (R11): `FOLIO_MAS_ALTO` (`V-###`), `ALMACEN_SECUENCIA`, ids `P-###`, cuota IA diaria, ventanas de `/verificar`, turno de llaves IA, folio máximo por aparato, cursor del espejo.

```sql
create table public.contadores (
  empresa_id text   not null,                -- '*' para contadores globales (cuota IA por usuario, /verificar público); sin FK
  clave      text   not null,                -- 'V' | 'P' | 'alm' | 'ia:<uid>' | 'ia_turno:<prov>' | 'ver:<hash>' | 'ver:total' | 'ver:ip:<hash>' | 'folio_cot:<disp>' | 'espejo:ventas'
  ventana    text   not null default '',     -- '' = permanente; 'yyyymmdd' (día MX) o el número de ventana de 600 s
  n          bigint not null default 0 check (n >= 0),
  texto      text,                           -- p. ej. cursor del espejo 'iso|id'
  updated_at timestamptz not null default clock_timestamp(),
  primary key (empresa_id, clave, ventana)
);
```

| Quién | Lee | Escribe |
|---|---|---|
| authenticated / anon | **nada** (RLS activa sin políticas y sin GRANT) | nada |
| Funciones `SECURITY DEFINER` | sí | `interno.siguiente()`, `ia_cuota`, `verificar_cupo`, `contador_sembrar` (solo `service_role`) |

Semántica de `interno.siguiente(p_empresa, p_clave, p_ventana, p_n)`: `insert … on conflict (empresa_id,clave,ventana) do update set n = contadores.n + p_n returning n`. El `ON CONFLICT DO UPDATE` toma el candado de la fila hasta el `COMMIT`: los números salen **en el orden de confirmación** y un número que nunca se confirmó (rollback) se puede reutilizar sin que nadie lo haya visto. Un folio confirmado jamás se vuelve a repartir aunque se «borre» la venta (no hay borrado) [M02 §1.2].

### 2.5 `bitacora`

Propósito: historia con **nivel de visibilidad por fila** (R1, R8) y diario de idempotencia. La escribe la base dentro de cada RPC (el `anotar` local de cada teléfono deja de ser la fuente [M09 §9.10]).

```sql
create table public.bitacora (
  id            bigint generated always as identity primary key,
  empresa_id    text not null references public.empresas (id),
  ts            timestamptz not null default now(),
  nivel         text not null default 'general' check (nivel in ('general','dinero','direccion')),
  accion        text not null check (btrim(accion) <> ''),
  entidad       text not null check (entidad in ('proyecto','instalacion','material','constante','almacen',
                                                 'cotizacion','autorizacion','abono','venta','miembro','plataforma','sistema')),
  entidad_id    text not null default '',
  titulo        text not null check (btrim(titulo) <> '' and length(titulo) <= 200),
  detalle       text not null default '' check (length(detalle) <= 600),
  antes         jsonb,
  despues       jsonb,
  usuario_id    uuid,
  usuario_texto text not null default '',     -- correo (escrita por RPC) o nombre libre (subida desde un teléfono)
  rol           text not null default '',
  dispositivo   text not null default '',
  op_id         text,                          -- clave de idempotencia de las operaciones acumulativas y de la subida única
  resultado     jsonb,                         -- lo que se contestó, para devolver lo mismo en un reintento
  procedencia   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default clock_timestamp()
);
create unique index bitacora_op      on public.bitacora (empresa_id, op_id) where op_id is not null;
create index        bitacora_entidad on public.bitacora (empresa_id, entidad, entidad_id, ts desc);
create index        bitacora_sync    on public.bitacora (empresa_id, updated_at, id);
```

Reglas de nivel (las pone la RPC, **nunca el cliente**): `general` = hechos de obra sin importes (etapa, agenda, almacén sin costos, material); `dinero` = todo lo que lleve un importe, una cuenta o un estatus de cobro (`antes/despues` con `anticipo`, `subtotal`, `cuenta`, cobros, abonos, autorizaciones); `direccion` = altas/bajas/cambios de área y eventos del sistema (espejo, importación). Ningún `titulo`/`detalle` de una fila `general` contiene un importe (prueba R1-09).

| Quién | Lee (RLS) | Escribe |
|---|---|---|
| Dirección | los tres niveles | RPC (vía `interno.anotar`), `subida_unica` |
| Pagos | `general` y `dinero` | — |
| Fabricación | solo `general` | — |

### 2.6 `proyectos` (la tabla unificada)

Propósito: **toda fila de la hoja «Ventas» y todo proyecto de la plataforma son una fila de esta tabla** (R2). No hay tabla `ventas` aparte ni «atadura» entre una fila de hoja y un proyecto: una venta es un proyecto y viceversa. Lo que distingue a cada fila son dos columnas:

| Columna | Valores | Significado |
|---|---|---|
| `fuente` | `cotizacion` | nació de una cotización autorizada (`ganar_proyecto`, o su lápida `descartar_cotizacion`). Trae `folio_global` y `origen_obra` |
| | `hoja` | importada de una fila de la hoja (una tarjeta viva `FABRICACION`/`REPARANDO` sin cotización, o una fila histórica) |
| | `manual` | alta hecha en la base (`alta_venta`), equivalente al menú «Registrar nueva venta» de la hoja [M02 §5.6] |
| `historica` | `true` | **fila anterior a la plataforma, sin cotización ni obra** (≥199 filas [M02 §6.20; `puente/README.md:146`]): Control la suma, la UI de obra no la pinta como tarjeta. Solo con `fuente='hoja'`, sin `origen_obra`, sin `folio_global`, sin instalaciones |

«Filas importadas» (la regla automática de etapa de Q-05) = `fuente in ('hoja','manual') and not historica` [M09 §1.5]. La **lápida** («No se dio» antes de ser venta) es `fuente='cotizacion'`, `etapa='cancelado'`, `folio_hoja is null`: existe para que la cotización deje de contar como «sin decidir» [M09 §1.1] y **no** entra al libro ni a `ventas_calculadas` (no tiene fila en `ventas_dinero`).

```sql
create table public.proyectos (
  id                     text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$'),
  empresa_id             text not null references public.empresas (id),

  -- identidad y clasificación ------------------------------------------------
  folio_hoja             text check (folio_hoja ~ '^V-[0-9]{3,7}$'),                                -- A «Folio» (V-###); NULL = lápida
  folio_global           text check (folio_global ~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$'),   -- Y «Folio cotizacion» (COT-0042-B@K7QM)
  folio_local            text not null default '',                                                  -- folio impreso (en importados = folio_hoja)
  dispositivo            text not null default '' check (dispositivo ~ '^[A-Za-z0-9_-]{0,24}$'),   -- aparato que ganó la venta; 'hoja' en importados
  fuente                 text not null check (fuente in ('cotizacion','hoja','manual')),
  historica              boolean not null default false,

  -- cliente y obra: visibles a los TRES roles (nada de dinero) -----------------
  nombre                 text not null check (btrim(nombre) <> '' and length(nombre) <= 2000),     -- B «Proyecto» («Contacto - Negocio (Tipo)»)
  contacto               text not null default '' check (length(contacto) <= 2000),
  negocio                text not null default '' check (length(negocio) <= 2000),
  tel                    text not null default '' check (length(tel) <= 30 and tel !~ '[^0-9 +()-]' and (tel = '' or tel ~ '[0-9]')),  -- AE «Telefono»
  etapa                  text check (etapa in ('ganado','en_diseno','cortado','armado','listo','instalado','garantia','cancelado')),       -- Z «Etapa de obra»
  tipo_trabajo           text[] not null default '{}'
                         check (tipo_trabajo <@ array['Caja de luz con iluminacion','Caja de luz sin iluminacion','Letras 3D con iluminacion',
                                                      'Letras 3D sin iluminacion','Rotulacion de vinil','Recorte acrilico','Custome / Proyecto Especial']), -- E
  fecha_anticipo         date,                                                                      -- L (= `fecha_ganado`; Q-03: no es dinero para Fabricación)
  compromiso_texto       text not null default '',                                                  -- texto libre del compromiso (cotizador `entrega`), NO el modo de entrega
  dir_texto              text not null default '' check (length(dir_texto) <= 2000),                -- AC «Direccion»
  entrecalles            text not null default '',
  maps_url               text not null default '',
  lat                    double precision check (lat between -90 and 90),                           -- AB «Ubicacion» (grupo de sello `ubicacion`)
  lng                    double precision check (lng between -180 and 180),
  geo_fuente             text not null default '',                                                  -- libre: maps_pin, maps_camara, manual, sin_ubicar, coordenadas…
  ubicacion_pendiente    boolean not null default false,                                            -- «todavía no la tengo»; no viaja a la hoja
  entrega                text check (entrega in ('instalacion','paqueteria','recoleccion')),        -- AF «Entrega»; NULL = nadie lo dijo
  plazo_k                smallint check (plazo_k between 1 and 5),                                  -- AH «Plazo taller»
  notas                  text not null default '' check (length(notas) <= 40000),                   -- AG «Notas»

  -- lo que el taller necesita saber del cobro SIN ver cifras (Q-03) ----------------
  estatus                text check (estatus in ('FABRICACION','REPARANDO','COBRANDO','LIQUIDADO')), -- C «Estatus»
  iva                    boolean not null default true,                                             -- F «IVA» (la cuenta lo dicta en ventas abiertas, §5.7)

  -- cita heredada de una fila histórica (no hay objeto instalación) ----------------
  fecha_instalacion_hist date,                                                                      -- M de filas históricas; en las demás manda la instalación viva

  -- sellos por dato, epoch-ms: {"etapa":ms,"notas":ms,…} (grupos en §1.2) ------------
  sellos                 jsonb not null default '{}'::jsonb check (interno.sellos_validos(sellos)), -- AI «Sellos» (con otras claves)

  -- copia congelada de la cotización SIN precios (el dinero vive en ventas_dinero.origen_dinero)
  origen_obra            jsonb check (origen_obra is null
                                      or (jsonb_typeof(origen_obra) = 'object' and not interno.contiene_dinero(origen_obra))),

  procedencia            jsonb not null default '{}'::jsonb,
  creado_por             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default clock_timestamp(),
  deleted_at             timestamptz,

  constraint proyectos_unico_con_empresa unique (empresa_id, id),            -- destino de las FK compuestas de los hijos
  constraint proyectos_folio_hoja_unico  unique (empresa_id, folio_hoja),    -- varios NULL permitidos (lápidas)
  constraint proyectos_folio_global_unico unique (empresa_id, folio_global), -- Q-07; varios NULL permitidos
  constraint proyectos_pin_valido        check ((lat is null) = (lng is null) and not (lat = 0 and lng = 0)),
  constraint proyectos_etapa_obligatoria check (etapa is not null or historica),
  constraint proyectos_cotizacion_folio  check (fuente <> 'cotizacion' or folio_global is not null),
  constraint proyectos_libro             check (folio_hoja is not null or (fuente = 'cotizacion' and etapa = 'cancelado')),
  constraint proyectos_historica         check (not historica or (fuente = 'hoja' and folio_hoja is not null
                                                                  and folio_global is null and origen_obra is null)),
  constraint proyectos_cita_historica    check (fecha_instalacion_hist is null or historica)
);
create index proyectos_sync    on public.proyectos (empresa_id, updated_at, id);
create index proyectos_etapa   on public.proyectos (empresa_id, etapa)   where deleted_at is null;
create index proyectos_estatus on public.proyectos (empresa_id, estatus) where deleted_at is null;
```

Triggers propios (además de los comunes de §2.1): `proyectos_inmutable` — no cambian `id`, `empresa_id`, `fuente`, `historica`, `dispositivo`, `folio_local`, `created_at`, y `folio_hoja`/`folio_global` no cambian una vez fijados (pasar de `NULL` a un valor sí: lo hace la importación al fusionar), porque «la llave que ata la fila a la cotización de un teléfono no se pisa» [`.gs:2841-2863`].

```sql
create function interno.proyectos_inmutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.empresa_id, new.fuente, new.historica, new.dispositivo, new.folio_local, new.created_at)
       is distinct from (old.id, old.empresa_id, old.fuente, old.historica, old.dispositivo, old.folio_local, old.created_at)
     or (old.folio_hoja   is not null and new.folio_hoja   is distinct from old.folio_hoja)
     or (old.folio_global is not null and new.folio_global is distinct from old.folio_global) then
    raise exception 'La identidad de un proyecto no se cambia' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger proyectos_inmutable before update on public.proyectos for each row execute function interno.proyectos_inmutable();
```

Una **lápida** (sin `folio_hoja`) **no cambia de etapa** (`mover_etapa` → `DATO_INVALIDO`, `Q-A23`): sacarla de `cancelado` sin darle folio violaría `proyectos_libro`, y no hay dinero que darle.

| Quién | Lee | Escribe |
|---|---|---|
| Dirección, Fabricación, Pagos | **todas** las filas de su empresa, lápidas incluidas (Q-03: `estatus`, `iva`, `fecha_anticipo` no son dinero; `origen_obra` no tiene precios) | solo RPC: `ganar_proyecto`, `descartar_cotizacion`, `alta_venta`, `proyecto_actualizar`, `mover_etapa`, `corregir_venta` (nombre/estatus/iva), `instalacion_guardar` (sello de cita) — cada una con su matriz de campos por rol (§5.1) |

**Qué NO hay aquí y por qué:** `sub`, `neto`, `precio_auth`, `anti_pactado`, `pago_pendiente`, `comision_restante`, `pct_comision`, `cuenta` → `ventas_dinero`; `pago_pendiente`/`comision_restante`/`neto` además son **fórmulas** (`ventas_calculadas`, §6) [C-03]. `notion_page_id`, `notion_estado`, `hoja_perdida`, `fuera_de_hoja`, `sin_mandar`, `hoja_doble`, `duplicado_de`, `distinta_de`, `hoja_confirmada`, `folios_previos`, `tel_a_la_hoja`, `entrega_a_la_hoja`, `obra_a_la_hoja`, `sync`: plomería de «hay dos fuentes de verdad»; con una sola desaparecen [M09 §1.4; M05 §7] (destino en §3.5).

### 2.7 `ventas_dinero` (1:1, restringida)

Propósito: **todo el dinero de una venta**, y solo el dinero. Exactamente los 11 `CAMPOS_DE_DINERO` del `.gs` (`.gs:2149-2152`; el README dice «diez», manda el código [M02 §7.9]): los **6 que son dato** (`Precio Subtotal`, `Anticipo`, `Liquidacion`, `Cuenta`, `Fecha Liquidacion`, `Porcentaje comision`) viven aquí; los **5 que son fórmula** (`Precio Neto`, `Pago Pendiente`, `Comisiones`, `Abono Comision`, `Comision Restante`) viven en la vista `ventas_calculadas` (§6). Se agregan `precio_auth` (lo que dice la cotización) y la copia congelada del dinero de `origen`.

```sql
create table public.ventas_dinero (
  proyecto_id       text primary key,
  empresa_id        text not null,
  subtotal          numeric not null default 0,                                        -- G «Subtotal» (sin IVA, SIN redondear, puede ser negativo)
  anticipo          numeric not null default 0 check (anticipo    >= 0),               -- I «Anticipo»
  liquidacion       numeric not null default 0 check (liquidacion >= 0),               -- J «Liquidación» (acumulativa)
  cuenta            text check (cuenta in ('Elias BBVA','Constru BNT','Moni MPago','Rul HSBC','Tatis BNT')),   -- D «Cuenta»
  fecha_liquidacion date,                                                              -- N «Fecha liquidación»
  pct_comision      numeric check (pct_comision between 0 and 100),                    -- AD «Porcentaje comision»: INFORMATIVO, ninguna fórmula lo lee (C-05)
  precio_auth       numeric,                                                           -- lo que dice la cotización autorizada (`Cot.totalVendido`); informativo
  origen_dinero     jsonb check (origen_dinero is null or jsonb_typeof(origen_dinero) = 'object'),  -- parte con precios de `origen` (§4.5)
  procedencia       jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default clock_timestamp(),
  deleted_at        timestamptz,
  foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id)
);
create index ventas_dinero_sync on public.ventas_dinero (empresa_id, updated_at, proyecto_id);
```

Existe **exactamente una fila por cada proyecto con `folio_hoja`** (la crea la misma RPC que crea el proyecto o la importación); `proyecto_id` NO puede suponer que hay cotización [DEC Q-04]. El trigger `ventas_dinero_libro` (BEFORE INSERT; no hace falta diferirlo: la FK compuesta ya obliga a que el proyecto exista antes, y `folio_hoja` no cambia una vez fijado) impide una fila de dinero para una lápida. La otra mitad («todo proyecto con `folio_hoja` tiene su fila») no se puede expresar sin diferir y la comprueba `cuadre_hoja` (`proyectos_sin_dinero`, §5.13) y la importación.

```sql
create function interno.ventas_dinero_libro() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.proyectos p
                  where p.empresa_id = new.empresa_id and p.id = new.proyecto_id and p.folio_hoja is not null) then
    raise exception 'ventas_dinero solo existe para un proyecto con folio_hoja (%)', new.proyecto_id using errcode = '23514';
  end if;
  return new;
end $$;
create trigger ventas_dinero_libro before insert on public.ventas_dinero for each row execute function interno.ventas_dinero_libro();
```

| Quién | Lee | Escribe |
|---|---|---|
| Dirección, Pagos | todas las filas de su empresa | solo RPC: `registrar_cobro`, `corregir_venta`, `alta_venta`, `ganar_proyecto`, `proyecto_actualizar` (solo `origen`, Dirección) |
| Fabricación | **ninguna** (no hay política para su área; la fila ni siquiera llega por la API) | nada |

### 2.8 `abonos` (libro de comisión, append-only)

Propósito: «Abonos comisión» de la hoja: un LIBRO con tres formas de captura (puente, formulario, reparto FIFO) [M02 §3.1]. **Se enlaza por el folio `V-###` como texto**, como la hoja (`SUMIF` por columna A), y no por FK: así los abonos con folio inexistente que ya existen en la hoja (`— folio no encontrado —`) se conservan y siguen sumando donde hoy suman (p. ej. «Comisiones por periodo», `A10` sin filtro de folio).

```sql
create table public.abonos (
  id             bigint generated always as identity primary key,
  empresa_id     text not null references public.empresas (id),
  folio_hoja     text not null check (folio_hoja ~ '^V-[0-9]{3,7}$'),                    -- A «Folio» (llave contra Ventas!A)
  importe        numeric not null check (abs(importe) < 10000000),                       -- C «Importe» (<1e7, como el puente)
  fecha          date,                                                                   -- D «Fecha» (NULL = «sin fecha»: no aparece en ningún periodo)
  nota           text not null default '',                                               -- E «Nota»
  pago_id        text check (pago_id ~ '^P-[0-9]{3,}$'),                                 -- F «Pago» (id de depósito; solo el reparto FIFO lo crea)
  tipo           text not null default 'abono' check (tipo in ('abono','reparto','correccion','historico')),
  op_id          text,                                                                   -- idempotencia de cobro/abono/reparto (§7.3)
  registrado_por uuid,
  registrado_en  timestamptz not null default now(),
  procedencia    jsonb not null default '{}'::jsonb,                                     -- {fila_hoja, hora_original, …}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default clock_timestamp(),
  constraint abonos_signo check ((tipo in ('abono','reparto') and importe > 0) or tipo in ('correccion','historico'))
);
create unique index abonos_op      on public.abonos (empresa_id, op_id, folio_hoja) where op_id is not null;
create index        abonos_folio   on public.abonos (empresa_id, folio_hoja);
create index        abonos_pago    on public.abonos (empresa_id, pago_id) where pago_id is not null;
create index        abonos_sync    on public.abonos (empresa_id, updated_at, id);
```

Los abonos **no se editan ni se borran** (`solo_agregar`, `sin_borrar`): una corrección es un renglón `tipo='correccion'` con importe negativo (RPC `corregir_abono`, solo Dirección, nota obligatoria) — lo que hoy se hace «a mano en la pestaña» [M02 §3.1].

| Quién | Lee | Escribe |
|---|---|---|
| Dirección, Pagos | todas las filas | RPC `registrar_abono_comision`, `repartir_abono_fifo`, `corregir_abono` (solo Dirección) |
| Fabricación | **ninguna** | nada |

### 2.9 `instalaciones`

Propósito: la cita (1:N con el proyecto; **una viva por proyecto**, hoy solo por convención de `agenda.agendar`, aquí por índice único parcial) [M09 §2.2; DEC Q-15]. El sello de la cita (grupo `instalacion`) vive en `proyectos.sellos`, no aquí: así no existe el defecto de `sello_hoja_en` que se re-sella al escribir [M05 §4.5].

```sql
create table public.instalaciones (
  id           text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$'),
  empresa_id   text not null,
  proyecto_id  text not null,
  fecha        date not null,
  hora         text check (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),                -- NULL = sin hora (evento de todo el día)
  ventana      text not null default 'dia' check (ventana in ('dia','noche','madrugada')),
  duracion_min integer not null default 180 check (duracion_min between 1 and 600),
  estado       text not null check (estado in ('propuesta','confirmada','reagendada','hecha','cancelada')),
  movida       integer not null default 0 check (movida >= 0),                      -- = SEQUENCE del .ics; nunca baja
  uid_ics      text not null,
  notas        text not null default '',                                             -- registro acumulativo («Movida del … al …: motivo»)
  procedencia  jsonb not null default '{}'::jsonb,
  creado_por   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default clock_timestamp(),
  deleted_at   timestamptz,
  foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id),
  constraint instalaciones_uid check (uid_ics = 'inst-' || id || '@al3d.mx'),         -- inmutable: si el UID cambia, el calendario DUPLICA el evento
  constraint instalaciones_unico_id unique (empresa_id, id)
);
create unique index instalaciones_una_viva on public.instalaciones (proyecto_id) where estado <> 'cancelada' and deleted_at is null;
create index        instalaciones_fecha     on public.instalaciones (empresa_id, fecha) where deleted_at is null;
create index        instalaciones_sync      on public.instalaciones (empresa_id, updated_at, id);
```

Triggers propios: `instalaciones_inmutable` (BEFORE UPDATE: `id`, `empresa_id`, `proyecto_id`, `uid_ics` no cambian; `movida` no decrece).

```sql
create function interno.instalaciones_inmutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.empresa_id, new.proyecto_id, new.uid_ics) is distinct from (old.id, old.empresa_id, old.proyecto_id, old.uid_ics) then
    raise exception 'La identidad de una instalacion no se cambia' using errcode = 'P0001';
  end if;
  if new.movida < old.movida then raise exception 'movida solo sube' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger instalaciones_inmutable before update on public.instalaciones for each row execute function interno.instalaciones_inmutable();
```

**No hay `gcal_event_id`**: es un campo muerto, siempre `null` (`agenda.js:292`, `puente.js:784`, `fabricacion.js:1529-1535`); el id del evento de Calendar es determinista sobre el UID [C-22; M09 §2.1]. No hay `sello`, `sello_hoja`, `sello_hoja_en` (ver arriba).

| Quién | Lee | Escribe |
|---|---|---|
| Dirección, Fabricación, Pagos | todas (Pagos ve el Calendario con filtro «solo días con cobro», que es de pantalla) | RPC `instalacion_guardar` (Dirección: crea `confirmada`; Fabricación: crea `propuesta`, puede mover/marcar; **Pagos: nada**, `ROL_SIN_PERMISO`) [`agenda.js:210-217`] |

**Invariantes que la base impone y hoy son convención de la app:** una sola instalación viva por proyecto; `uid_ics` derivado del id e inmutable; `movida` solo sube (la RPC la sube al reagendar y **al cancelar**, para que el .ics de la cancelación no se tome por un evento que el calendario ya conoce, `agenda.js:412-415`).

### 2.10 `autorizaciones` (N sellos por folio, evidencia firmada)

Propósito: una fila por fila de la hoja «Autorizaciones» (17 columnas, oculta): **N por folio** (`vigente` / `superada` / `revocada`), cada una evidencia firmada que `/verificar` recalcula [C-26; M04 §4.1]. Los diez campos que entran a la firma están en `text` **verbatim** (R: «un PDF ya impreso debe seguir verificando»); los tres importes se guardan en su forma firmada `NNNN.NN` y sus `numeric` son **columnas generadas** a partir de ese texto (única fuente de verdad). La clave del sello **no existe aquí**; `clave_id` es solo una etiqueta para una rotación futura (hoy un único `k1`) [M04 §1.6; 00 P-02]. `codificacion` guarda con qué codificación se firmó cada fila: el módulo `supabase/functions/_shared/sello.js` (ya en el worktree) firma los sellos nuevos con UTF-8 y trae **evidencia, no verificada, de que el Apps Script real codifica como US-ASCII con «?» por cada carácter no ASCII**, así que las filas heredadas se verifican con la que cuadre y cada fila recuerda cuál fue (§5.10, `R-02`).

```sql
create table public.autorizaciones (
  id              bigint generated always as identity primary key,
  empresa_id      text not null references public.empresas (id),

  -- FIRMADO: canon = 'AL3D-AUTH-v1'|'AL3D-AUTH-v2' || JSON.stringify([#1..#9 (,#10)])  (`.gs:3635-3646`)
  folio_global    text not null check (folio_global ~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$'),   -- #1  B «Folio» (COT-0042-B@K7QM)
  huella          text not null,                                                                    -- #2  J «Huella»
  sub_calc_txt    text not null check (sub_calc_txt    ~ '^-?[0-9]+[.][0-9]{2}$'),                  -- #3  E «Subtotal calculado»      dinero2()
  precio_auth_txt text not null check (precio_auth_txt ~ '^-?[0-9]+[.][0-9]{2}$'),                  -- #4  F «Precio autorizado (neto)» dinero2() ('0.00' = sin ajuste)
  items_auth      text not null default '',                                                         -- #5  I «Ajustes por partida» 'id:1500.00,id2:300.00' o ''
  total_txt       text not null check (total_txt       ~ '^-?[0-9]+[.][0-9]{2}$'),                  -- #6  G «Total»                   dinero2()
  proyecto        text not null,                                                                    -- #7  C «Proyecto» (negocio; ya recortado a 140)
  autorizo        text not null check (autorizo <> '' and autorizo = lower(autorizo)),              -- #8  K «Autorizó» (correo, minúsculas)
  ts_iso          text not null check (ts_iso ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'),  -- #9 A «Cuándo (ISO)»
  renglones       text not null default '',                                                         -- #10 Q «Renglones» (JSON como TEXTO; '' = sello v1)

  -- NO firmado (cambiarlo no rompe la firma)
  cliente         text not null default '',                                                         -- D (privado)
  ajuste_pct      numeric,                                                                          -- H «Ajuste %» (informativo)
  solicito        text not null default '',                                                         -- L «Solicitó» (correo, o 'token de pagos' en los históricos)
  codigo          text not null check (codigo ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),          -- M «Código»
  firma           text not null check (firma ~ '^[0-9a-f]{64}$'),                                   -- N «Firma»
  estado          text not null check (estado in ('vigente','superada','revocada')),               -- O «Estado» (lo único que cambia)
  nota            text not null default '' check (length(nota) <= 500),                             -- P «Nota»

  -- derivados del texto firmado (lectura y reportes; jamás se firma desde ellos)
  sub_calc        numeric generated always as (sub_calc_txt::numeric)    stored,
  precio_auth     numeric generated always as (precio_auth_txt::numeric) stored,
  total           numeric generated always as (total_txt::numeric)       stored,
  formato         text    generated always as (case when renglones <> '' then 'v2' else 'v1' end) stored,

  -- trazabilidad
  clave_id        text not null default 'k1',
  codificacion    text not null default 'utf-8' check (codificacion in ('utf-8','ascii-?')),         -- cómo se vuelven bytes el texto y la clave al firmar (`sello.js`): los sellos NUEVOS, UTF-8; los heredados, la que cuadre (§5.10)
  origen          text not null default 'plataforma' check (origen in ('plataforma','importada_hoja')),
  fila_hoja       integer,
  usuario_id      uuid,                                                                             -- quien autorizó (NULL en las importadas)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default clock_timestamp(),

  constraint autorizaciones_codigo_es_firma check (replace(codigo, '-', '') = upper(left(firma, 12)))
);
create unique index autorizaciones_una_vigente on public.autorizaciones (empresa_id, folio_global) where estado = 'vigente';   -- invariante del candado de hoy
create index        autorizaciones_folio      on public.autorizaciones (empresa_id, folio_global, id desc);
create index        autorizaciones_verificar  on public.autorizaciones (upper(split_part(folio_global, '@', 1)), codigo);       -- folio corto + código

create function interno.autorizaciones_inmutable() returns trigger language plpgsql set search_path = '' as $$
begin
  -- todo lo firmado y lo informativo es inmutable; solo cambia `estado` (y `nota`, únicamente junto con el cambio de estado)
  if (new.id, new.empresa_id, new.folio_global, new.huella, new.sub_calc_txt, new.precio_auth_txt, new.items_auth,
      new.total_txt, new.proyecto, new.autorizo, new.ts_iso, new.renglones, new.cliente, new.ajuste_pct, new.solicito,
      new.codigo, new.firma, new.clave_id, new.codificacion, new.origen, new.fila_hoja, new.usuario_id, new.created_at)
     is distinct from
     (old.id, old.empresa_id, old.folio_global, old.huella, old.sub_calc_txt, old.precio_auth_txt, old.items_auth,
      old.total_txt, old.proyecto, old.autorizo, old.ts_iso, old.renglones, old.cliente, old.ajuste_pct, old.solicito,
      old.codigo, old.firma, old.clave_id, old.codificacion, old.origen, old.fila_hoja, old.usuario_id, old.created_at)
  then raise exception 'Una autorizacion firmada no se edita' using errcode = 'P0001'; end if;
  if old.estado <> 'vigente' and new.estado is distinct from old.estado then
    raise exception 'Una autorizacion % es terminal', old.estado using errcode = 'P0001'; end if;
  if new.estado = 'vigente' and old.estado <> 'vigente' then
    raise exception 'Una autorizacion no se resucita' using errcode = 'P0001'; end if;
  if new.nota is distinct from old.nota and new.estado is not distinct from old.estado then
    raise exception 'La nota solo cambia al revocar' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger autorizaciones_inmutable before update on public.autorizaciones for each row execute function interno.autorizaciones_inmutable();
```

| Quién | Lee | Escribe |
|---|---|---|
| Dirección | todas (tabla, por RLS) | `registrar_autorizacion` (**solo `service_role`**, lo llama la Edge Function `autorizar`) inserta; `revocar_autorizacion` (Dirección) cambia `estado` |
| Autor de la solicitud (Pagos) | su sello **vía** `estado_solicitudes()` (proyección), no la tabla | — |
| Fabricación | nada (ni el sello: lleva importes) | — |
| `service_role` | todo, incluido `autorizacion_para_verificar()` para `/verificar` | inserta y supera |

### 2.11 `cotizaciones` (copia de trabajo; llave `folio_global`)

Propósito: la entrada del historial del cotizador (`al3d_historial`, 31 campos) y las pendientes de `al3d_queue`, **por `(empresa, folio_global)`**: el folio corto se repite entre teléfonos, el global (`COT-0042-B@K7QM`) no [M07 §6.1; C-30]. La entrada se guarda **entera** en `datos` (sin `aiFile.url` ni data URLs: las imágenes van a Storage, §3.5); cuatro columnas (`proy`, `cliente`, `tel`, `huella_auth`) se derivan de ella para no divergir. El registro firmable vive en `autorizaciones`, no aquí (el `sello` local de la entrada es una copia parcial [M07 §0.9]).

```sql
create table public.cotizaciones (
  empresa_id      text not null references public.empresas (id),
  folio_global    text not null check (folio_global ~ '^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$'),
  folio           text not null,                          -- impreso (COT-0042-B)
  disp            text not null,                          -- aparato que la emitió (entradas sin `disp`: 'HIST'+hash, ver §3.5)
  creado_por      uuid,                                   -- autor (auth.users.id): base del RLS «autor + Dirección» (Q-02)
  estado          text not null check (estado in ('pendiente','autorizada','rechazada','retirada')),
  datos           jsonb not null check (jsonb_typeof(datos) = 'object'),    -- la entrada del historial (o el renglón `q` de la cola)
  proy            text generated always as (coalesce(datos ->> 'proy', ''))       stored,     -- NEGOCIO (no la persona)
  cliente         text generated always as (coalesce(datos ->> 'cliente', ''))    stored,     -- PERSONA
  tel             text generated always as (coalesce(datos ->> 'tel', ''))        stored,
  huella_auth     text generated always as (datos ->> 'huellaAuth')               stored,     -- '' = autorización suelta; NULL = anterior a la huella
  hitos           jsonb not null default '{}'::jsonb,     -- {pdf:ms, wa:ms, venta:ms, propuesta:{primera,ultima,veces}}  (al3d_hitos + al3d_canva)
  autorizacion_id bigint references public.autorizaciones (id),             -- la vigente (NULL mientras no haya sello)
  revocada_en     timestamptz,                            -- la revocación NO existe en el cliente; aquí sí [M07 §4.3]
  procedencia     jsonb not null default '{}'::jsonb,     -- {telefonos:[disp…], sello_local:{…}, disp_inferido:bool, subida_unica:ts}
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default clock_timestamp(),
  deleted_at      timestamptz,
  primary key (empresa_id, folio_global),
  constraint cotizaciones_folio_global check (folio_global = folio || '@' || disp)
);
create index cotizaciones_autor on public.cotizaciones (empresa_id, creado_por) where deleted_at is null;
create index cotizaciones_sync  on public.cotizaciones (empresa_id, updated_at, folio_global);
```

Reglas de estado (solo las RPC lo tocan): `solicitar` ⇒ `pendiente` (si no había sello vigente); `registrar_autorizacion` ⇒ `autorizada` + `autorizacion_id`; `rechazar_solicitud` ⇒ `rechazada` (solo si estaba `pendiente`); `cancelar_solicitud` ⇒ `retirada` (idem). Un re-pedido sobre una cotización `autorizada` **no cambia** su estado (el sello vigente sigue valiendo hasta que se reautorice o se revoque, como `Q.reauth` [M07 §3.3]). `autorizacion suelta` = `estado='autorizada' and huella_auth = ''` (derivable, no se guarda).

| Quién | Lee (RLS) | Escribe |
|---|---|---|
| Dirección | todas las de su empresa | RPC `solicitar`, `cotizacion_guardar`, `subida_unica`, `registrar_autorizacion` (service) |
| Pagos | **solo las suyas** (`creado_por = auth.uid()`) | `solicitar`, `cotizacion_guardar` (solo las suyas), `subida_unica` |
| Fabricación | **ninguna** (R1 > Q-02, `Q-A01`): puede *pedir* autorización y ver el estado **sin importes** por `estado_solicitudes()` | `solicitar`, `cotizacion_guardar` (solo las suyas), `subida_unica` (escribe, nunca lee) |

### 2.12 `solicitudes`

Propósito: «Solicitudes de autorización» (13 columnas): cola operativa, **no evidencia** (no está firmada [M04 §4.1]). Una fila por petición; a lo sumo una `pendiente` por folio (re-pedir sobrescribe la misma fila).

```sql
create table public.solicitudes (
  id               bigint generated always as identity primary key,
  empresa_id       text not null,
  folio_global     text not null,
  ts               timestamptz not null default now(),                  -- A «Cuándo» (se sobrescribe al re-pedir)
  proyecto         text not null default '',                            -- C
  cliente          text not null default '',                            -- D
  subtotal         numeric not null default 0,                          -- E: el que DECLARÓ el cliente (se verifica al autorizar, Q-A20)
  iva              boolean not null default true,                       -- F
  huella           text not null default '',                            -- G (la declarada; la firmada la recalcula la Edge Function)
  cotizacion       jsonb not null check (jsonb_typeof(cotizacion) = 'object'),  -- H: `limpiarCotizacion` {proyecto,cliente,iva,subtotal,items[≤80]}
  solicito_id      uuid,                                                -- identidad = persona (auth.uid()), no «token de <rol>» (M04 §4.2)
  solicito_texto   text not null default '',                            -- I «Solicitó»: correo; en las importadas puede ser 'token de pagos'
  estado           text not null check (estado in ('pendiente','autorizada','rechazada','cancelada')),   -- J
  resolvio_id      uuid,                                                -- K
  resolvio_texto   text not null default '',
  ts_resolvio      timestamptz,                                         -- L
  nota             text not null default '' check (length(nota) <= 500),-- M
  autorizacion_id  bigint references public.autorizaciones (id),        -- el sello que resolvió esta solicitud (reemplaza el cotejo por fechas de `selloDeLaSolicitud`, `.gs:3866-3876`)
  procedencia      jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default clock_timestamp(),
  foreign key (empresa_id, folio_global) references public.cotizaciones (empresa_id, folio_global)
);
create unique index solicitudes_una_pendiente on public.solicitudes (empresa_id, folio_global) where estado = 'pendiente';
create index        solicitudes_folio         on public.solicitudes (empresa_id, folio_global, id desc);
create index        solicitudes_autor         on public.solicitudes (empresa_id, solicito_id);
create index        solicitudes_sync          on public.solicitudes (empresa_id, updated_at, id);
```

| Quién | Lee (RLS) | Escribe |
|---|---|---|
| Dirección | todas | `solicitar`, `cancelar_solicitud`, `rechazar_solicitud`, `registrar_autorizacion` (service) |
| Pagos | solo `solicito_id = auth.uid()` | `solicitar`, `cancelar_solicitud` (las suyas) |
| Fabricación | **ninguna** (la solicitud lleva `cotizacion` con precios y `subtotal`) | `solicitar`, `cancelar_solicitud` (las suyas) |

### 2.13 `cuaderno_notas`

Propósito: la nota de cada «cuaderno de cliente» (`al3d_cuadernos`, máx. 1200 caracteres) [M07 §5.3]. La agrupación (por los últimos 10 dígitos del teléfono y luego por nombre normalizado) es una **lectura derivada** que el cliente sigue haciendo sobre sus cotizaciones; no hay entidad `clientes`. La clave es la del grupo (`tel:<10 dígitos>` o `nom:<nombre normalizado>`); la nota es **por autor** (`Q-A11`), porque cada quien solo ve las cotizaciones de sus propios clientes (Q-02).

```sql
create table public.cuaderno_notas (
  empresa_id text not null references public.empresas (id),
  clave      text not null check (clave ~ '^(tel:[0-9]{10}|nom:.{1,200})$'),
  autor_id   uuid not null,
  nota       text not null default '' check (length(nota) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (empresa_id, clave, autor_id)
);
create index cuaderno_notas_sync on public.cuaderno_notas (empresa_id, updated_at, clave);
```

| Quién | Lee | Escribe |
|---|---|---|
| Dirección | todas | RPC `cuaderno_guardar` (la suya) |
| Pagos, Fabricación | solo las suyas (`autor_id = auth.uid()`) | RPC `cuaderno_guardar` (la suya) |

### 2.14 `materiales` (catálogo de material)

Propósito: pestaña «Catálogo de material» (27 columnas, 19 materiales de semilla). Se escribe **campo por campo con sello por campo** (`sellos` jsonb: campo→ms; un cambio con sello más viejo no pisa; empate escribe) [`.gs:5695`; M03 §2.2]. El costo no está aquí: `almacen_costos`.

```sql
create table public.materiales (
  empresa_id     text not null references public.empresas (id),
  id             text not null check (id ~ '^[a-z0-9][a-z0-9-]{0,62}$'),               -- A «Clave» (acr-3mm); inmutable
  nombre         text not null default '',                                              -- B
  familia        text not null default 'sin_familia',                                   -- C (texto libre en el servidor)
  unidad_compra  text not null check (unidad_compra  in ('unidad','bolsa','caja','lamina','litro','metro')),   -- D
  unidad_consumo text not null check (unidad_consumo in ('m2','m','cm','pieza','litro')),                      -- E
  medida         text not null default '',                                              -- F
  factor         numeric not null check (factor > 0),                                   -- G
  factor_origen  text not null default '',                                              -- H (el cliente lo exige; el servidor no)
  largo_cm       numeric,                                                               -- I
  ancho_cm       numeric,                                                               -- J
  espesor        text not null default '',                                              -- K
  merma_pct      numeric not null default 0 check (merma_pct >= 0 and merma_pct < 1),  -- L (el cliente valida 0..0.99)
  fraccionable   boolean not null default false,                                        -- M
  min_compra     numeric not null default 0 check (min_compra >= 0),                    -- N
  min_stock      numeric not null default 0 check (min_stock  >= 0),                    -- O
  proveedor      text not null default '',                                              -- Q
  tel_proveedor  text not null default '',                                              -- R
  activo         boolean not null default true,                                         -- S (baja lógica: no existe borrado de materiales)
  sellos         jsonb not null default '{}'::jsonb check (jsonb_typeof(sellos) = 'object'),   -- «Sellos» (campo→ms)
  procedencia    jsonb not null default '{}'::jsonb,                                    -- {otros:{…}} = «Otros (JSON)»; secuencia_hoja
  created_at     timestamptz not null default now(),                                    -- U «Creado»
  updated_at     timestamptz not null default clock_timestamp(),                        -- (≠ V «Editado», que es el sello del cliente: va en `sellos`)
  primary key (empresa_id, id)
);
create index materiales_sync on public.materiales (empresa_id, updated_at, id);
```

### 2.15 `requerimientos` (listas de compra)

Propósito: «Listas de compra» (26 columnas): lo que cada proyecto pide de cada material. `id = <proyecto_id>:<material_id>` determinista (de ahí cuelga la idempotencia de la salida `mov-salida:<id>`). **FK a `proyectos`** (con la unificación de ids hay un solo `proyecto_id` válido; el huérfano se reporta en la importación, [M03 H6]); **sin FK a `materiales`** (el cliente tolera materiales fuera del catálogo y el catálogo de la hoja es un subconjunto, [M03 H6]).

```sql
create table public.requerimientos (
  empresa_id         text not null references public.empresas (id),
  id                 text not null,                                                      -- U «Id»
  proyecto_id        text not null,                                                      -- Q «Proyecto (id)»: AHORA el id canónico
  material_id        text not null check (btrim(material_id) <> ''),                     -- B
  cantidad_consumo   numeric not null default 0,                                         -- J
  unidad_consumo     text not null default '',                                           -- K
  cantidad_compra    numeric not null default 0 check (cantidad_compra >= 0),            -- C (sin redondear, fraccionaria a propósito)
  unidad_compra      text not null check (unidad_compra in ('unidad','bolsa','caja','lamina','litro','metro')),   -- D
  partidas           jsonb not null default '[]'::jsonb check (jsonb_typeof(partidas) = 'array'),                -- L (ids de partida)
  formula            text not null default '',                                           -- I «Cómo se calculó» (la hoja la truncaba a 2000)
  confianza          text not null default 'estimada',                                   -- G (exacta|estimada|requiere_dato; el servidor no lo valida)
  requiere           text not null default '',                                           -- H
  constantes_version text not null default '',                                           -- P
  cantidad_ajustada  numeric check (cantidad_ajustada is null or cantidad_ajustada >= 0),-- E «Corrección»: si no es null, MANDA
  motivo_ajuste      text not null default '',                                           -- M
  ajustado_por       text not null default '',                                           -- N («Nombre · Rol (DISP)»)
  ajustado_ms        bigint not null default 0,                                          -- O «Corregido» (0 = nunca)
  estado             text not null default 'calculado' check (estado in ('calculado','apartado','comprado','consumido','descartado')),  -- F (monótono, §5.9)
  sellos             jsonb not null default '{}'::jsonb check (jsonb_typeof(sellos) = 'object'),
  procedencia        jsonb not null default '{}'::jsonb,                                 -- {proyecto_id_local, disp, otros:{…}}
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default clock_timestamp(),
  primary key (empresa_id, id),
  constraint requerimientos_id_canonico check (id = proyecto_id || ':' || material_id),
  foreign key (empresa_id, proyecto_id) references public.proyectos (empresa_id, id)
);
create index requerimientos_proyecto on public.requerimientos (empresa_id, proyecto_id);
create index requerimientos_material on public.requerimientos (empresa_id, material_id);
create index requerimientos_sync     on public.requerimientos (empresa_id, updated_at, id);
```

La columna «Venta» de la hoja (`folio_hoja`) **no se guarda**: sale de `proyectos.folio_hoja` por el FK.

### 2.16 `almacen_movimientos` (libro append-only)

Propósito: «Almacén» (22 columnas): el libro del que sale la existencia (último `conteo` + lo posterior, `stock.js:153`). **Nunca se edita ni se borra**; una corrección es otro movimiento. Idempotente por `id` (el del teléfono, o `mov-salida:<req.id>` para la salida del corte). `seq` es el orden de llegada (la `Secuencia` de la hoja): lo asigna un trigger con el contador `alm`, que serializa las altas del libro por el candado de la fila del contador.

```sql
create table public.almacen_movimientos (
  empresa_id     text not null references public.empresas (id),
  id             text not null check (length(id) between 1 and 200),                    -- R «Id»
  seq            bigint not null,                                                        -- T «Secuencia» (trigger `interno.movimiento_seq`)
  material_id    text not null check (btrim(material_id) <> ''),                         -- B «Material» (no se valida contra el catálogo)
  tipo           text not null check (tipo in ('entrada','salida','ajuste','conteo','merma','devolucion')),     -- C
  cantidad       numeric not null check (abs(cantidad) <= 10000000),                     -- D (unidad de COMPRA, CON SIGNO)
  unidad_compra  text not null check (unidad_compra in ('unidad','bolsa','caja','lamina','litro','metro')),     -- E
  origen         text not null check (origen in ('derivado','manual','conteo','compra')),                       -- F
  nota           text not null default '',                                               -- G
  usuario        text not null default '',                                               -- H «Quién» (texto libre del teléfono, o el correo si lo escribió la base)
  rol            text not null default '',                                               -- I
  dispositivo    text not null default '',                                               -- J
  proyecto_id    text,                                                                   -- K: SIN FK (el libro es evidencia; un id local sin proyecto no puede tumbar una salida)
  requerimiento_id text,                                                                 -- M
  firma          text not null default '',                                               -- O «Firma» (campo local `sello`: «Nombre · Rol (DISP)»)
  ts             bigint not null check (ts > 0),                                         -- Q «Sello» (campo local `ts`): ms del movimiento; ordena el libro y ancla los conteos
  usuario_id     uuid,
  procedencia    jsonb not null default '{}'::jsonb,                                     -- {secuencia_hoja, proyecto_id_local, otros:{…}}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default clock_timestamp(),
  primary key (empresa_id, id),
  constraint movimientos_signo check (
       (tipo in ('entrada','devolucion') and cantidad > 0)
    or (tipo in ('salida','merma')       and cantidad < 0)
    or (tipo = 'conteo'                  and cantidad >= 0)         -- «no queda nada» es un dato
    or (tipo = 'ajuste'                  and cantidad <> 0)
  )
);
create unique index movimientos_seq         on public.almacen_movimientos (empresa_id, seq);
create index        movimientos_material_ts on public.almacen_movimientos (empresa_id, material_id, ts, id);   -- porMaterial = [material_id, ts]
create index        movimientos_proyecto    on public.almacen_movimientos (empresa_id, proyecto_id) where proyecto_id is not null;
create index        movimientos_sync        on public.almacen_movimientos (empresa_id, updated_at, id);

create function interno.movimiento_seq() returns trigger language plpgsql set search_path = '' as $$
begin new.seq := interno.siguiente(new.empresa_id, 'alm', '', 1); return new; end $$;
create trigger movimientos_seq before insert on public.almacen_movimientos for each row execute function interno.movimiento_seq();
```

### 2.17 `almacen_costos` (la única cifra de dinero del almacén)

Propósito: `costo_compra` (por material) y `costo_total` (por movimiento) **fuera** de las filas compartidas, porque RLS no oculta columnas [M03 H2]. Fabricación ni los recibe ni los escribe (sus costos se ignoran **en silencio**, como `.gs:5694`).

```sql
create table public.almacen_costos (
  id             bigint generated always as identity primary key,
  empresa_id     text not null references public.empresas (id),
  material_id    text,                                      -- P «Costo de compra» del catálogo
  movimiento_id  text,                                      -- N «Costo total» del libro
  importe        numeric,                                   -- NULL = «borrado» (la hoja lo bajaba como null y guardaba su sello)
  sello          bigint not null default 0,                 -- sello del campo (ms); mismo criterio que `materiales.sellos`
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default clock_timestamp(),
  constraint almacen_costos_uno check ((material_id is null) <> (movimiento_id is null)),
  foreign key (empresa_id, material_id)    references public.materiales (empresa_id, id),
  foreign key (empresa_id, movimiento_id)  references public.almacen_movimientos (empresa_id, id)
);
create unique index almacen_costos_material   on public.almacen_costos (empresa_id, material_id)   where material_id is not null;
create unique index almacen_costos_movimiento on public.almacen_costos (empresa_id, movimiento_id) where movimiento_id is not null;
create index        almacen_costos_sync       on public.almacen_costos (empresa_id, updated_at, id);
```

### 2.18 `constantes`

Propósito: las 20 constantes del taller (`CTS_BASE`), hoy **por dispositivo y sin viajar** (`puente.js:236-240`: sus ops quedan `sin_destino` para siempre [M03 §8.8]); el plan las pasa a la empresa. No es dinero. **No se migra** la fila marca `_semilla` (el check la prohíbe).

```sql
create table public.constantes (
  empresa_id      text not null references public.empresas (id),
  clave           text not null check (clave ~ '^[A-Za-z0-9_]{1,64}$' and clave <> '_semilla'),
  valor           numeric not null,
  unidad          text not null default '',
  nota            text not null default '',
  version         text not null default '',               -- 'c-2026-08.4kz1'
  actualizado_por text not null default '',               -- «Nombre · Rol (DISP)» (`Prefs.sello()`)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default clock_timestamp(),
  primary key (empresa_id, clave)
);
create index constantes_sync on public.constantes (empresa_id, updated_at, clave);
```

### 2.19 Quién lee y escribe el almacén (resumen; la matriz exacta está en §4.2)

| Tabla | Dirección | Fabricación | Pagos | Escribe (RPC) |
|---|---|---|---|---|
| `materiales` | lee | lee | lee | `almacen_aplicar` (Dirección, Fabricación) |
| `requerimientos` | lee | lee | lee | `almacen_aplicar` (Dirección y Fabricación todo; **Pagos**: solo `estado:'consumido'` con `campos ⊆ {estado,folio_hoja}`); `mover_etapa` y `emitir_salidas_derivadas` (internas) |
| `almacen_movimientos` | lee | lee | lee | `almacen_aplicar` (Dirección y Fabricación cualquier tipo/origen; **Pagos**: solo `origen='derivado'` y `tipo='salida'`) |
| `almacen_costos` | lee | **nada** | lee | `almacen_aplicar` (solo Dirección escribe costos) |
| `constantes` | lee | lee | lee | `constante_guardar` (Dirección, Fabricación) |

Paridad con hoy: la API actual ya entrega a Pagos el almacén completo con costos y su pantalla no existe [M03 §3.2]; `DEC Q-13` lo conserva (Dirección y Pagos ven costos, Fabricación opera sin verlos).

### 2.20 Volumen y plan gratuito (estimación, NO CONFIRMADA con datos vivos)

| Tabla | Filas esperadas al año | Tamaño por fila | Nota |
|---|---|---|---|
| `proyectos` + `ventas_dinero` | ~100–300 (la hoja tiene 199 anteriores en ~3 años [M02 §0.4]) | 3–8 KB (`origen_obra`) | |
| `cotizaciones` (+`solicitudes`, `autorizaciones`) | ~300–1000 | 3–10 KB sin imágenes | las imágenes (hasta ~600 KB c/u) **no entran a la base**: Storage, 1 GB gratis |
| `almacen_movimientos` | 1000–3000 [M03 §5] | 0.4–0.6 KB | única tabla sin techo |
| `requerimientos` | 1000–3000 | 0.6–1.5 KB | |
| `bitacora` | ~5 000 | 0.3–1 KB | |

Conclusión: la base cabe con holgura en los 500 MB del plan gratuito [PLAN §4.6]; el riesgo de tamaño son las imágenes (Storage) y los respaldos, no estas tablas.

---

## 3. Cobertura (tablas EXHAUSTIVAS)

Convención de las tablas: **origen → destino** (`tabla.columna`) o **«no se migra»** con su razón. «Imp.» = regla del importador (script de una sola vez, idempotente, que **no decide**: reporta conflictos y cuadre [DEC Q-14]). El importador lee la hoja **con Apps Script `getValues()` y por LETRA de columna, nunca por encabezado**: los nombres de propiedad del puente no coinciden con los encabezados y la API de Sheets en modo formateado rompe `dinero2` [M02 §0.3; M04 §7]. Una celda con texto donde va un número, o un negativo en `Anticipo`/`Liquidacion`, **no se corrige solo**: se reporta y la fila espera a que se arregle la hoja (el CHECK de la base prohíbe el negativo y H/K cambiarían).

### 3.0 Cómo se decide qué es cada fila de «Ventas» (R2)

```
para cada fila 2..310 con B (trim) no vacío:
  y   = Y válida (regex folio global) y distinta de A                       -- «Y = V-nnn» es el defecto de sept-2026, se ignora [M09 §4]
  si y y existe un proyecto de teléfono con ese folio_global  -> fuente 'cotizacion' (se FUSIONA con el del teléfono; manda el dinero de la HOJA, `ventas.js:206-217`)
  si no y estatus en (FABRICACION, REPARANDO)                -> fuente 'hoja', historica = false  (la «tarjeta viva» de `desdeVentaDeHoja`, `puente.js:1878-1886`)
  si no y y                                                  -> fuente 'hoja', historica = false  (tiene folio de cotización conocido; cotización creada de «Autorizaciones»)
  si no                                                      -> fuente 'hoja', historica = true   (las ≥199 históricas; R2)
  siempre: se inserta ventas_dinero; folio V-### = A (nunca se renumera)
```

### 3.1 Hoja «Ventas», columnas A..AI (35)

| Col | Encabezado / propiedad del puente | Destino | Regla / nota |
|---|---|---|---|
| A | `Folio` (`id_notion`, `COL_FOLIO`) | `proyectos.folio_hoja` | `trim().toUpperCase()`, debe cumplir `^V-\d{3,7}$` (si no: reporte y la fila espera). Siembra `contadores('V')` con el máximo de A, de «Ventas (respaldo)», de «Bitácora del puente» (col C) y de «Abonos comisión» (col A) = lo que sembraba `marcaDeFolios` (`.gs:1386-1398`) |
| B | `Proyecto` | `proyectos.nombre` | `trim`; B vacía = la fila no existe (no se importa; `/jalar` también la salta, `.gs:2519`). `contacto`/`negocio` se derivan con `partirNombreDeHoja` (primer « - »; quita el «(Tipo)» final) [M09 §7] |
| C | `Estatus` | `proyectos.estatus` | si no está en la lista: `NULL` + `procedencia.celdas.C` |
| D | `Cuenta ` (espacio final) | `ventas_dinero.cuenta` | si no está en la lista: `NULL` + `procedencia.celdas.D` (la vista marca X solo con cuenta no vacía) |
| E | `Tipo de trabajo` | `proyectos.tipo_trabajo` (`text[]`) | parte por `/\s*,\s*/`; valores fuera de los 7 se descartan del arreglo y quedan en `procedencia.celdas.E` (la validación de la celda es abierta) |
| F | `IVA` | `proyectos.iva` | `lower(trim(v)) = 'sí'` → `true`, lo demás `false` (= lo que calcula H: `F="Sí"`); se **reportan** las grafías que no sean exactamente `Sí`/`No` porque Sheets compara sin mayúsculas y el puente con ellas [M02 §6.5] |
| G | `Precio Subtotal` | `ventas_dinero.subtotal` | número tal cual (sin redondear; negativo permitido); texto → reporte (H daría error) |
| H | `Precio Neto ` (fórmula) | `ventas_calculadas.h_neto` | **no se guarda**; la vista lo recalcula y el cuadre lo compara |
| I | `Anticipo` | `ventas_dinero.anticipo` | número ≥ 0; vacío = 0 |
| J | `Liquidacion` | `ventas_dinero.liquidacion` | número ≥ 0; vacío = 0 |
| K | `Pago Pendiente` (fórmula) | `ventas_calculadas.k_saldo` | no se guarda |
| L | `Fecha Anticipo e Instalacion` | `proyectos.fecha_anticipo` | solo valores `Date` (una fecha tecleada como texto no baja, `.gs`/[M02 §2.5]) → reporte |
| M | `Fecha instalacion` | **filas vivas:** `instalaciones.fecha` (una instalación `confirmada`, `ventana='dia'`, `duracion_min` sugerida, nota «Agendada desde la hoja.», `uid_ics='inst-'||id||'@al3d.mx'`) y `proyectos.sellos.instalacion`; **históricas:** `proyectos.fecha_instalacion_hist` | el UID canónico y las instalaciones de los teléfonos se resuelven por la regla de §3.5 (Q-15) |
| N | `Fecha Liquidacion` | `ventas_dinero.fecha_liquidacion` | |
| O | `Días de cobro` | `ventas_calculadas.o_dias_cobro` | fórmula; no se guarda |
| P | `Días de antigüedad` | `ventas_calculadas.p_dias` | fórmula volátil (`TODAY()`): **no se persiste** [M02 §6.10] |
| Q | `Antigüedad` | `ventas_calculadas.q_antiguedad` | fórmula |
| R | `Comisiones` (`Comisión 10%`) | `ventas_calculadas.r_comision` | `ROUND(G*10%,2)` fija; **no lee `pct_comision`** [C-05] |
| S | `Abono Comision` | `ventas_calculadas.s_abonado` | `SUM(abonos.importe)` por folio. Escribir esta propiedad = **agregar un renglón** a `abonos` (`registrar_abono_comision`) |
| T | `Comision Restante` | `ventas_calculadas.t_restante` | `ROUND(R−S,2)` |
| U | `Pagos de comisión` | `ventas_calculadas.u_pagos` | `COUNT(abonos)` |
| V | `Año` | `ventas_calculadas.v_anio` | del año de **L** |
| W | `Mes` | `ventas_calculadas.w_mes` | `YYYY-MM` de **L** |
| X | `Revisar` | `ventas_calculadas.x_revisar` | 7 banderas en el orden de la hoja |
| Y | `Folio cotizacion` | `proyectos.folio_global` | solo si cumple la regex y ≠ A; si no, `NULL` y el valor original a `procedencia.celdas.Y` |
| Z | `Etapa de obra` | `proyectos.etapa` + `proyectos.sellos.etapa` | etiqueta → clave con `ETAPA_DESDE_NOTION`; vacía en histórica → `NULL`; vacía en fila viva → `'ganado'` (`proyectos.js:477`) |
| AA | `Hora instalacion` (texto `@`) | `instalaciones.hora` (`HH:MM`) | comparte el sello de la fecha |
| AB | `Ubicacion` (`lat,lng` o link) | `proyectos.lat`, `lng`, `maps_url`, `geo_fuente` | se interpreta con `parseGmaps` (copia en el importador); `0,0` y fuera de rango se rechazan [M09 §1.2] |
| AC | `Direccion` | `proyectos.dir_texto` | |
| AD | `Porcentaje comision` | `ventas_dinero.pct_comision` | informativo; vacío = `NULL` |
| AE | `Telefono` | `proyectos.tel` | pasa por `interno.telefono_limpio` (réplica de `telefonoLimpio`); si cambia, se reporta |
| AF | `Entrega` | `proyectos.entrega` | `''` → `NULL` («nadie lo dijo», que `queLeFalta` marca) [M09 §1.2]; `Instalación`→`instalacion`, `Paquetería`→`paqueteria`, `Recolección en taller`→`recoleccion` |
| AG | `Notas` | `proyectos.notas` | |
| AH | `Plazo taller` | `proyectos.plazo_k` | etiqueta → cubo (`plazoDesdeHoja`) |
| AI | `Sellos` (JSON, oculta) | `proyectos.sellos` | `{columna:ms}` → `{grupo:ms}` con `GRUPO_DE_COLUMNA`; `Fecha instalacion`→`instalacion`; la clave `Hora instalacion` no existe; valores ≤0 se descartan. Una fila sin AI conserva `sellos = {}` (= «antiquísimo», 0) |

Lo que una fila de la hoja **no** trae y la base sí necesita (se rellena en la importación): `empresa_id='al3d'`, `fuente`, `historica`, `dispositivo='hoja'` para las que nacen de la hoja, `folio_local = A`, `id = 'proy-hoja-'||A` (determinista, como `proyectos.js:457`) salvo que se fusione con un proyecto de teléfono, y `ventas_dinero.precio_auth = H` en las que no tienen cotización [M09 §1.2].

### 3.2 Las demás pestañas de la hoja (21 en el código `[M01 §11.3]`)

| Pestaña | Contenido | Destino | Razón |
|---|---|---|---|
| `Ventas` | libro (35 columnas) | `proyectos` + `ventas_dinero` (§3.1) | |
| `Abonos comisión` | libro: `Folio`, `Proyecto` (fórmula), `Importe`, `Fecha`, `Nota`, `Pago` | `abonos` | A→`folio_hoja`, B (fórmula `VLOOKUP`) → no se migra, C→`importe`, D→`fecha` (se trunca a fecha; la hora que ponía el puente se guarda en `procedencia.hora_original`), E→`nota`, F→`pago_id`. Importados con `tipo='historico'` (los que traen `P-###` y nota «Reparto…» → `reparto`; los negativos → `correccion`). `op_id` nulo. Un folio sin fila en Ventas **se importa igual** (suma donde hoy suma) y se reporta. Orden de llegada = orden de fila |
| `Comisiones por periodo` | vista de `Abonos comisión` (resumen, por mes, por proyecto, detalle) | función `public.comisiones_cobradas(desde, hasta)` + el cliente agrupa `abonos` | **única realmente derivada** [C-06]; en el espejo la pestaña sigue calculándose sola sobre `Abonos comisión` espejada |
| `Cobranza` | «COBRANZA POR ANTIGÜEDAD» | `ventas_calculadas` (columnas P, Q, K, C) | cálculo, no dato; en la hoja sigue viva sobre las columnas espejadas |
| `Tablero` | resumen general, comisiones, antigüedad, por tipo, año, cuenta, estatus, mes | `ventas_calculadas` | cálculo, no dato |
| `Comisiones` | tarjetas + pendientes + historial + récord | `ventas_calculadas`, `abonos` | cálculo, no dato |
| `Proyectos en Puerta`, `Vendidos del Mes`, `Ventas del Año`, `Récord de Ventas`, `Gráficas` | vistas sobre Ventas | `ventas_calculadas` | cálculo; **dependen de H, K, O:X, que el espejo no escribe** (siguen siendo fórmulas de la hoja) [M02 §3.6] |
| `Accesos` | `Correo`, `Rol`, `Nota` (+ texto de ayuda en `A4`) | `miembros` (§3.4) | |
| `Autorizaciones` (oculta) | 17 columnas | `autorizaciones` (§3.4) | |
| `Solicitudes de autorización` | 13 columnas | `solicitudes` (§3.4) | |
| `Almacén`, `Catálogo de material`, `Listas de compra` | libro y fichas | `almacen_movimientos`, `materiales`, `requerimientos`, `almacen_costos` (§3.3) | **archivo congelado** en la hoja (Q-10): no se espejan [DEC Q-10] |
| `Bitácora del puente` (oculta, tope 5000) | `Cuándo`, `Rol`, `Folio`, `Fila`, `Qué escribió`, `Nota` | `bitacora` | `nivel='dinero'` si «Qué escribió» nombra una propiedad de `CAMPOS_DE_DINERO` o un abono, si no `general`; `entidad='venta'`, `entidad_id=Folio`, `rol`, `usuario_texto='token de <rol>'` o correo; `procedencia.fila_hoja`. Es útil después del corte para detectar teléfonos viejos que siguen escribiendo [00 §5.1] |
| `Ventas (respaldo)` (oculta) | copia anterior a la realineación | **no se migra** | auxiliar de una realineación ya terminada; **solo** aporta su máximo `V-###` a la siembra del contador (`.gs:1366-1421`) |
| `Ventas (antes de realinear)` (oculta) | idem | no se migra | idem |
| `Revisión Y-AD` | vista previa de la realineación | no se migra | muere con la realineación (`PUENTE_Y_AD_*`) |

**Lo que el espejo escribe** (contrato en §7.8): solo las columnas **capturadas** `A:G, I:J, L:N, Y:AI` (`bloquesCapturados`, `.gs:971-978`), localizando la fila **por folio (col. A)**, nunca por número de fila (`ordenarVentas` las reacomoda), y deja intactas las fórmulas `H, K, O:X`. No crea pestañas (memoria de Elías: «no más pestañas en la hoja»).

### 3.3 Almacén, Catálogo de material y Listas de compra

**Reglas comunes de importación** [M03 §1.1, H8]: se lee **por encabezado exacto** (las columnas de una hoja real pueden estar movidas); texto vacío → `NULL`/`''` según la columna destino (`nullif`); se quita el apóstrofo inicial que antepone `almACelda_`; el texto de más de 2000 caracteres pudo truncarse al escribirse (p. ej. `formula`): se importa como está y se reporta la longitud exacta de 2000; «Sello»/«Corregido» y demás sellos son milisegundos. Las tres pestañas **solo se importan si la hoja viva ya corre `puente-sheets-9` o posterior** (NO CONFIRMADO: ver §11 y [M03 §10.2]); si no, el almacén vive solo en los teléfonos y se importa de sus respaldos.

**«Almacén» (22 columnas, A..V)**

| Col | Encabezado | Destino | Nota |
|---|---|---|---|
| A | `Cuándo` | **no se migra** | derivado de Q (`ts`); la hoja solo lo escribe |
| B | `Material` | `almacen_movimientos.material_id` | |
| C | `Tipo` | `.tipo` | |
| D | `Cantidad` | `.cantidad` | unidad de compra y con signo |
| E | `Unidad` | `.unidad_compra` | |
| F | `Origen` | `.origen` | |
| G | `Nota` | `.nota` | texto; `''` si vacía |
| H | `Quién` | `.usuario` | nombre libre del teléfono |
| I | `Rol` | `.rol` | |
| J | `Dispositivo` | `.dispositivo` | |
| K | `Proyecto (id)` | `.proyecto_id` | **id local del teléfono**: se remapea al `proyectos.id` canónico con la tabla de ids (§3.5, vía L `Venta` o el id local); si no hay proyecto, `NULL` y el original en `procedencia.proyecto_id_local` |
| L | `Venta` | no se guarda | es `proyectos.folio_hoja`; solo sirve para remapear K |
| M | `Requerimiento` | `.requerimiento_id` | remapeado igual que K (`<proyecto_id canónico>:<material>`) |
| N | `Costo total` | `almacen_costos.importe` (`movimiento_id`) | solo si trae número |
| O | `Firma` | `.firma` | «Nombre · Rol (DISP)» |
| P | `Empresa` | `.empresa_id` | siempre `al3d` |
| Q | `Sello` | `.ts` | **es el `ts` del movimiento, no la Firma** [M03 §1.2] |
| R | `Id` | `.id` | `mov-<ts36>-<rand>` o `mov-salida:<req.id>` |
| S | `Otros (JSON)` | `.procedencia.otros` | contiene `creado_en`/`actualizado_en` del teléfono: se **ignoran** para el orden (manda `ts`) |
| T | `Secuencia` | `.procedencia.secuencia_hoja` | el `seq` nuevo lo da el trigger, en el orden de esa secuencia |
| U | `Llegó` | `.created_at` | |
| V | `Subió` | `.procedencia.subio` | correo o `token de <rol>` |

Salidas duplicadas entre teléfonos (**la idempotencia `mov-salida:<req.id>` casi no se ejerce hoy** [X-02; M03 H1]): antes de insertar se deduplica por `(folio_hoja de la venta, material_id, origen='derivado'|'manual', tipo='salida')`, se conserva la de menor `ts` y las demás se reportan; **no** se confía en el id.

**«Catálogo de material» (27 columnas, A..AA)**

| Col | Encabezado | Destino | Nota |
|---|---|---|---|
| A | `Clave` | `materiales.id` | |
| B | `Nombre` | `.nombre` | |
| C | `Familia` | `.familia` | |
| D | `Unidad de compra` | `.unidad_compra` | |
| E | `Unidad de consumo` | `.unidad_consumo` | |
| F | `Medida` | `.medida` | |
| G | `Factor` | `.factor` | |
| H | `De dónde sale el factor` | `.factor_origen` | |
| I | `Largo (cm)` | `.largo_cm` | |
| J | `Ancho (cm)` | `.ancho_cm` | |
| K | `Espesor` | `.espesor` | |
| L | `Merma` | `.merma_pct` | |
| M | `Fraccionable` | `.fraccionable` | |
| N | `Mínimo de compra` | `.min_compra` | |
| O | `Mínimo de almacén` | `.min_stock` | |
| P | `Costo de compra` | `almacen_costos.importe` (`material_id`) + `.sello` | un costo **escrito vacío** baja como `null` con sello; un campo **nunca escrito** se omite [M03 §2.3] |
| Q | `Proveedor` | `.proveedor` | |
| R | `Teléfono del proveedor` | `.tel_proveedor` | |
| S | `Activo` | `.activo` | |
| T | `Empresa` | `.empresa_id` | |
| U | `Creado` | `.created_at` | ms → `timestamptz` |
| V | `Editado` | `.sellos` (clave `_editado`) | es el sello del cliente, no `updated_at` |
| W | `Otros (JSON)` | `.procedencia.otros` | |
| X | `Sellos` | `.sellos` | `{campo:ms}` |
| Y | `Secuencia` | `.procedencia.secuencia_hoja` | |
| Z | `Llegó` | `.procedencia.llego` | |
| AA | `Subió` | `.procedencia.subio` | |

El catálogo de la hoja es **un subconjunto**: `sembrar()` no encola nada (`material.js:501-551`). **Antes de importar movimientos y requerimientos se siembran las 19 filas de `datos/semilla.json`** (`actualizado_ms=1`, como el cliente) para que `unidad_compra` y demás existan; los movimientos no llevan FK a `materiales`, de modo que un material ausente no pierde el renglón.

**«Listas de compra» (26 columnas, A..Z)**

| Col | Encabezado | Destino | Nota |
|---|---|---|---|
| A | `Venta` | no se guarda | = `proyectos.folio_hoja`; remapea Q |
| B | `Material` | `requerimientos.material_id` | |
| C | `Cantidad` | `.cantidad_compra` | |
| D | `Unidad` | `.unidad_compra` | |
| E | `Corrección` | `.cantidad_ajustada` | |
| F | `Estado` | `.estado` | |
| G | `Confianza` | `.confianza` | |
| H | `Le falta` | `.requiere` | |
| I | `Cómo se calculó` | `.formula` | |
| J | `Consumo` | `.cantidad_consumo` | |
| K | `Unidad de consumo` | `.unidad_consumo` | |
| L | `Partidas` | `.partidas` | JSON → `jsonb` |
| M | `Por qué se corrigió` | `.motivo_ajuste` | |
| N | `Corrigió` | `.ajustado_por` | |
| O | `Corregido` | `.ajustado_ms` | |
| P | `Constantes` | `.constantes_version` | |
| Q | `Proyecto (id)` | `.proyecto_id` | remapeado al id canónico; el original a `procedencia.proyecto_id_local`. **Dos teléfonos pueden tener `proy-a:acr-3mm` y `proy-hoja-V-042:acr-3mm` para la misma venta** [M03 H7]: unicidad `(proyecto, material)` y regla de dedupe: prefiere `consumido`, luego `comprado`, luego el mayor sello; las demás se reportan |
| R | `Empresa` | `.empresa_id` | |
| S | `Creado` | `.created_at` | |
| T | `Editado` | `.sellos._editado` | |
| U | `Id` | `.id` | recalculado: `<proyecto canónico>:<material>`; el original a `procedencia` |
| V..Z | `Otros (JSON)`, `Sellos`, `Secuencia`, `Llegó`, `Subió` | `.procedencia.otros`, `.sellos`, `.procedencia.secuencia_hoja`, `.procedencia.llego`, `.procedencia.subio` | |

### 3.4 «Autorizaciones», «Solicitudes de autorización», «Accesos»

**«Autorizaciones» (17 columnas, A..Q) → `autorizaciones`** [M04 §4.1]. Importar con `getValues()`: devuelve números crudos, textos sin apóstrofo y fechas reales. **Todo texto firmado se toma tal cual, sin `trim`.**

| Col | Encabezado | Destino | Firmada | Nota de importación |
|---|---|---|---|---|
| A | `Cuándo (ISO)` | `ts_iso` | #9 | texto ISO con `.mmmZ`; si la celda llegó como `Date` se formatea `toISOString()` y se **reporta** (Sheets pudo convertirla) |
| B | `Folio` | `folio_global` | #1 | `COT-0042-B@K7QM`; el folio de PDFs anteriores al 01-oct-2026 no lleva letra (`COT-0042@K7QM`): la regex acepta ambos [M04 §9.7] |
| C | `Proyecto` | `proyecto` | #7 | |
| D | `Cliente` | `cliente` | no | privado |
| E | `Subtotal calculado` | `sub_calc_txt` | #3 | `dinero2(Number(celda))` |
| F | `Precio autorizado (neto)` | `precio_auth_txt` | #4 | `dinero2` (`0.00` = sin ajuste) |
| G | `Total` | `total_txt` | #6 | `dinero2` |
| H | `Ajuste %` | `ajuste_pct` | no | |
| I | `Ajustes por partida` | `items_auth` | #5 | texto canónico `id:1500.00,…`, `''` permitido |
| J | `Huella` | `huella` | #2 | |
| K | `Autorizó` | `autorizo` | #8 | correo en minúsculas |
| L | `Solicitó` | `solicito` | no | correo o `token de pagos` (histórico, no es correo) |
| M | `Código` | `codigo` | no | se normaliza a `XXXX-XXXX-XXXX` con `normalizarCodigo` |
| N | `Firma` | `firma` | no | 64 hex minúscula |
| O | `Estado` | `estado` | no | cualquier otro texto se lee como `superada` (como `.gs`); se reporta |
| P | `Nota` | `nota` | no | |
| Q | `Renglones` | `renglones` | #10 | JSON como texto; vacío = sello **v1** (no se reescribe como v2) |

Cada fila se **verifica antes de insertarse**: el script recalcula la firma con el módulo TS y la clave (que llega al script por el entorno, **nunca** por el chat ni el repo) y la compara con N; las que no cuadran se reportan, **no abortan** y se conservan en la hoja congelada. Si una fila no cumple los CHECK (`codigo` ≠ prefijo de `firma`, etc.) tampoco entra y se reporta. Después de importar, la **prueba de oro** (`IM-05`) recalcula todas desde la base y exige `firma` idéntica.

**Vínculo con `cotizaciones` y la columna que la hoja no tiene.** `autorizaciones.folio_global` **no** es FK a `cotizaciones`: la evidencia firmada no puede depender de que exista la copia de trabajo (el teléfono que la creó puede no haber subido nunca su historial), y `cotizaciones.autorizacion_id` ya apunta en sentido contrario (un ciclo de FK complicaría la importación). El importador, **después** de cargar «Autorizaciones», «Solicitudes de autorización» y las cotizaciones de los teléfonos (`subida_unica` o respaldo), recorre cada `folio_global` distinto: **(a)** si la cotización existe, fija `autorizacion_id` = la fila `vigente` (si no hay, la de mayor `id`) y, si la última fila es `revocada`, `revocada_en` = la fecha de la importación (la hoja no guarda cuándo se revocó) **sin** tocar `estado`, igual que `revocar_autorizacion`; **(b)** si no existe, crea un **stub**: `folio` y `disp` partidos de `folio_global`, `estado='autorizada'`, `datos = {proy: C, cliente: D, subtotal: E, huellaAuth: J, items: []}`, `creado_por` = el miembro cuyo correo es L «Solicitó» (o `NULL`), `procedencia = {stub: 'Autorizaciones', fila_hoja}`. `codificacion` no es una columna de la hoja: la fija el importador con lo que devuelve `verificar()` de `sello.js` (`utf-8`, `ascii-?`, o `utf-8` si el texto es todo ASCII y las dos dan lo mismo).

**«Solicitudes de autorización» (13 columnas, A..M) → `solicitudes`** [M04 §4.1]

| Col | Encabezado | Destino | Nota |
|---|---|---|---|
| A | `Cuándo` (`Date`) | `ts` | |
| B | `Folio` | `folio_global` | si no existe la cotización, se crea una **cotización stub** desde H |
| C | `Proyecto` | `proyecto` | |
| D | `Cliente` | `cliente` | |
| E | `Subtotal` | `subtotal` | |
| F | `IVA` (`Sí`/`No`) | `iva` | |
| G | `Huella` | `huella` | |
| H | `Cotización` (JSON) | `cotizacion` | `limpiarCotizacion`; **sin teléfono, dirección, anticipo, notas ni imágenes**: la hoja no puede reconstruir una pendiente completa [M07 §3.3] |
| I | `Solicitó` | `solicito_texto` (+ `solicito_id` si el correo coincide con un miembro) | `token de <rol>` se conserva como texto |
| J | `Estado` | `estado` | |
| K | `Resolvió` | `resolvio_texto` | |
| L | `Cuándo se resolvió` (`Date`) | `ts_resolvio` | |
| M | `Nota` | `nota` | |

Varias filas por folio (una pendiente como máximo; re-pedir tras un rechazo creó otra) → varias filas en `solicitudes`; `solicitudes_una_pendiente` impide dos pendientes (si la hoja trajera dos, la más antigua se importa como `cancelada` y se reporta).

**«Accesos» (3 columnas) → `miembros`** [M04 §5]

| Col | Encabezado | Destino | Nota |
|---|---|---|---|
| A | `Correo` | `miembros.correo` | `trim().toLowerCase()`; **se salta toda fila cuya A no sea un correo o cuya B no sea un rol válido** (el texto de ayuda de `A4`, la fila 1) ; duplicados: gana la **primera** coincidencia (como `rolDelCorreo`, `.gs:2363-2375`) y los demás se reportan |
| B | `Rol` | `.area` | `direccion`, `fabricacion`, `pagos` |
| C | `Nota` | `.nota` | el `.gs` nunca la lee; se conserva |
| — | (no existe) | `.estado='invitado'`, `.usuario_id=NULL` | nadie queda «activo» hasta su primer ingreso con correo verificado |

El dueño de la hoja (fila 2, nota «El dueño de la hoja. Se puso solo.») queda como `direccion`: sin al menos un Dirección activo nadie puede dar altas (§5.1).

### 3.5 IndexedDB: cada almacén, campo por campo

Dos bases: `al3d_pf` v3 (`db.js:22`) y `al3d_cot_imgs` (`imagenes.js:18`). Cache Storage (`al3d-v1`, `al3d-app-94`) no guarda datos de negocio [M06 §4.3]. El archivo de respaldo `DB.exportar()` **no** trae `pendientes` ni `ventas_hoja` ni el historial del cotizador ni `al3d_cot_imgs` ni la identidad del aparato [M06 §6]; por eso la subida de lo que vive en `localStorage` e `al3d_cot_imgs` es **una subida única dentro de la app** (`subida_unica`, §5.12), no un archivo.

**Reglas de unión entre teléfonos y hoja** (el importador las aplica y **reporta**; no decide más allá de ellas) [DEC Q-14, Q-15; M09 §8; C-30]:

| Tema | Regla |
|---|---|
| Llave de proyecto | `folio_global` (`folio@disp`); si no hay, `folio_hoja`; si no, el `id` local. **No** «Folio cotizacion» a secas (el corto se repite entre aparatos; entradas viejas sin `disp`) |
| Id canónico | el id del proyecto del teléfono cuyo `dispositivo` = el `@disp` de `folio_global`; si no hay, el de menor `created_at`; si no hay proyecto de teléfono, `proy-hoja-<folio_hoja>`. Todos los demás ids → **tabla de remapeo** (`id_local → id_canonico`), que se escribe en el reporte (fuera del repo) y se usa para `instalaciones.proyecto_id`, `requerimientos.proyecto_id`, `almacen_movimientos.proyecto_id` y los ids de requerimiento |
| Dinero | **manda la hoja** (columnas G, I, J, D, C, N, AD, F, L) sobre lo del proyecto del teléfono, como `Ventas.unificar` (`ventas.js:206-217`); donde difieren, se reporta |
| Obra (etapa, notas, plazo, tel, dirección, ubicación, entrega, cita) | gana el **mayor sello** entre las copias; si no hay sellos, la hoja; las diferencias se reportan |
| Instalaciones | una viva por proyecto; **UID canónico = el de mayor `movida`** (empate: el de mayor `actualizado_en`); las demás quedan `cancelada` con `procedencia.fusionada_en`, **sin tocar el calendario** (no se vuelve a emitir su .ics) [N-03] |
| Requerimientos | `(proyecto canónico, material)` único; prefiere `consumido`, luego `comprado`, luego mayor sello; el resto se reporta [M03 H7] |
| Movimientos | por `id`; las salidas derivadas se deduplican por `(venta, material)` (§3.3) |
| Cotizaciones | por `(folio, disp)`; entradas sin `disp`: se infiere de `sello.folio` (parte tras `@`) y, si no hay, del `proyectos[].dispositivo` del respaldo completo; si aun así no se sabe, `disp = 'HIST' || left(md5(folio||cliente||fecha),6)` y `procedencia.disp_inferido = true` (hay que pedir el id del aparato: Ajustes lo muestra, `mod/ajustes.js:511`) |
| Conflictos que el importador **no resuelve** | dos teléfonos con la misma cotización y `datos` distintos; mismo proyecto con etapas distintas y sellos iguales; requerimientos de igual estado y sello; folios `V-###` repetidos en la hoja; todo va al reporte |

**`proyectos`** (keyPath `id`; índices `porEtapa`, `porFecha`, `porFolio`) [M06 §2.1; M09 §1.2]

| Campo local | Destino | Nota |
|---|---|---|
| `id` | `proyectos.id` | canónico (tabla de remapeo); los importados de la hoja ya son `proy-hoja-<V-###>` |
| `empresa_id` | `proyectos.empresa_id` | constante `al3d`; nadie lo escribió nunca [M06 §0.8] |
| `folio_local` | `.folio_local` | |
| `dispositivo` | `.dispositivo` | `hoja` en importados |
| `folio_global` | `.folio_global` | `''` → `NULL` |
| `folio_hoja` | `.folio_hoja` | manda el de la hoja si discrepa |
| `de_hoja` | `.fuente` (`true` → `'hoja'`, si no `'cotizacion'`) | |
| `nombre`, `contacto`, `negocio` | `.nombre`, `.contacto`, `.negocio` | si el B de la hoja difiere: se conserva el del proyecto y B va a `procedencia.celdas.B` |
| `tel` | `.tel` | por `telefono_limpio` |
| `etapa` | `.etapa` | unión por sello |
| `tipo_trabajo` | `.tipo_trabajo` | |
| `fecha_ganado` | `.fecha_anticipo` | manda L de la hoja |
| `compromiso_texto`, `dir_texto`, `entrecalles`, `maps_url`, `lat`, `lng`, `geo_fuente`, `ubicacion_pendiente`, `entrega`, `plazo_k`, `notas` | mismo nombre | `ubicacion_pendiente` «no viaja a la hoja» pero sí se migra (es dato del proyecto) |
| `sub` | `ventas_dinero.subtotal` | solo si la hoja no trae G; el valor local queda en `ventas_dinero.origen_dinero.venta.sub` |
| `neto` | no se guarda | es H (fórmula); el local queda en `origen_dinero.venta.neto` |
| `precio_auth` | `ventas_dinero.precio_auth` | |
| `anti_pactado` | `ventas_dinero.anticipo` | manda I |
| `iva` | `proyectos.iva` | manda F |
| `estatus_notion` | `proyectos.estatus` | manda C |
| `cuenta` | `ventas_dinero.cuenta` | manda D |
| `pct_comision` | `ventas_dinero.pct_comision` | |
| `pago_pendiente`, `comision_restante` | **no se migran** | fórmulas de la hoja (K, T) |
| `origen` | `proyectos.origen_obra` + `ventas_dinero.origen_dinero` | `interno.partir_origen` (§4.5); `aiFile.url` ya viene vacío (`congelar`, `proyectos.js:344`) |
| `sellos` | `proyectos.sellos` | |
| `notion_page_id` | `proyectos.folio_hoja` (duplicado) | = el folio `V-###` de la fila |
| `notion_estado` | no se migra | plomería de envío |
| `creado_en` | `created_at` | ms → `timestamptz` |
| `actualizado_en` | no se migra (`procedencia.actualizado_ms`) | `DB.poner` lo re-sella con `Date.now()` en cada escritura: **no es la hora real de edición** [M06 §0.9] |
| `sync` | no se migra | plomería |
| `hoja_confirmada`, `folios_previos`, `distinta_de`, `tel_a_la_hoja`, `entrega_a_la_hoja`, `obra_a_la_hoja`, `sin_mandar` | no se migran | «la hoja y este teléfono no cuadran»: desaparece con una sola fuente; el importador solo lee `folio_hoja` y `de_hoja` [M09 §1.4] |
| `hoja_perdida`, `duplicado_de`, `hoja_doble`, `fuera_de_hoja` | **no se migran, pero se reportan** | llevan una decisión humana pendiente (venta borrada en la hoja, copias, «déjala fuera de la hoja»). Un proyecto vivo «fuera de la hoja» **entra al libro** con folio nuevo salvo que Elías diga otra cosa (`Q-A19`, §11) |

**`instalaciones`** (`porFecha`, `porProyecto`) [M09 §2.1]

| Campo local | Destino | Nota |
|---|---|---|
| `id` | `instalaciones.id` | se conserva: el UID depende de él |
| `empresa_id` | `.empresa_id` | a veces `''` en las bajadas de la hoja → `al3d` |
| `proyecto_id` | `.proyecto_id` | remapeado |
| `fecha`, `hora`, `ventana`, `duracion_min`, `estado`, `movida`, `notas` | mismo nombre | `ventana` heredada `manana`/`tarde` → `dia` |
| `uid_ics` | `.uid_ics` | `inst-<id>@al3d.mx` (CHECK) |
| `gcal_event_id` | **no se migra** | siempre `null` [C-22] |
| `sello_hoja`, `sello_hoja_en` | no se migran | el sello de la cita es `proyectos.sellos.instalacion` (el mayor de los `selloDeInstalacion` de las copias) |
| `creado_en`, `actualizado_en`, `sync` | `created_at` / no / no | |

**`materiales`, `requerimientos`, `movimientos`, `constantes`**

| Almacén | Campo local | Destino |
|---|---|---|
| `materiales` | `id, nombre, familia, unidad_consumo, unidad_compra, medida, factor, factor_origen, largo_cm, ancho_cm, espesor, merma_pct, fraccionable, min_compra, min_stock, proveedor, tel_proveedor, activo` | `materiales.<igual>` |
| | `costo_compra` | `almacen_costos.importe` (`material_id`) |
| | `empresa_id` | `empresa_id` (`al3d`) |
| | `creado_en` / `actualizado_en` / `sync` | `created_at` / `sellos._editado` / no se migra |
| `requerimientos` | `id` (recalculado), `proyecto_id` (remapeado), `material_id`, `cantidad_consumo`, `unidad_consumo`, `cantidad_compra`, `unidad_compra`, `partidas`, `formula`, `confianza`, `requiere`, `constantes_version`, `cantidad_ajustada`, `motivo_ajuste`, `ajustado_por`, `ajustado_en`, `estado` | `requerimientos.<igual>` (`ajustado_en` → `ajustado_ms`) |
| | `folio_hoja` (si bajó de la hoja) | no se guarda (sale de `proyectos`) |
| | `empresa_id`, `creado_en`, `actualizado_en`, `sync` | `empresa_id` / `created_at` / `sellos._editado` / no se migra |
| `movimientos` | `id, material_id, tipo, cantidad, unidad_compra, proyecto_id (remapeado), requerimiento_id (remapeado), origen, nota, ts, usuario, rol, dispositivo` | `almacen_movimientos.<igual>` (`usuario` → `usuario`) |
| | `sello` («Nombre · Rol (DISP)») | `almacen_movimientos.firma` |
| | `costo_total` | `almacen_costos.importe` (`movimiento_id`) |
| | `empresa_id`, `creado_en`, `actualizado_en`, `sync` | `empresa_id` / `created_at` / no se migra / no se migra |
| `constantes` | `clave, valor, unidad, nota, version, actualizado_por` | `constantes.<igual>` |
| | `creado_en` / `actualizado_en` | `created_at` / no se migra |
| | fila marca `_semilla` (`ids[]`, `claves[]`) | **no se migra** (el CHECK la prohíbe; es la bitácora de lo ya sembrado) |

**`avisos`, `geo`, `blobs`, `bitacora`, `ventas_hoja`, `pendientes`**

| Almacén | Campos | Destino | Razón |
|---|---|---|---|
| `avisos` (`rid`, `regla`, `entidad`, `entidad_id`, `rol`, `titulo`, `cuerpo`, `severidad`, `vence`, `estado`, `postergado_hasta`, `gcal_event_id`, `visto_en`, `resuelto_en`, `sync`, `creado_en`, `actualizado_en`) | todos | **no se migra** (decisión del plan) | se recalculan en cada teléfono [PLAN §3.1]. **Costo honesto:** se pierden las decisiones humanas `atendido`/`postergado`/`descartado` [C-31]; cada persona vuelve a ver sus avisos pendientes |
| `geo` (`q`, `ts`, `hallado`, `lat`, `lng`, `nombre`, …) | todos | no se migra | caché de geocodificación; está **vacía** (`Geo.geocodificar` no tiene llamadores) [M06 §0.5] |
| `blobs` (`id`, `blob`) | todos | no se migra | **vacío y sin escritores** [M06 §0.4]; las imágenes reales son `al3d_cot_imgs` (abajo) |
| `bitacora` (`id`, `ts`, `accion`, `entidad`, `entidad_id`, `titulo`, `detalle`, `antes`, `despues`, `usuario`, `rol`, `dispositivo`, `sello`, `creado_en`, `actualizado_en`) | uno a uno | `bitacora` (`ts`→`ts`, `usuario`→`usuario_texto`, `sello`→`procedencia.sello`, `id`→`op_id = 'tel:'||dispositivo||':'||id`) | **no viajó nunca** (cada teléfono tiene la suya) [M09 §9.10]; se sube en la subida única, idempotente por `op_id`. `nivel` por lista blanca de acciones sin importes (`etapa`, `agendo`, `reagendo`, `marco`, `cancelo` → `general`); **todo lo demás `dinero`** porque `ganar` anota precio y anticipo en `detalle` (`proyectos.js:692-696`) y `actualizar` guarda `antes/despues` de `cuenta`, `anti_pactado`… (`proyectos.js:1076-1085`) [M09 §6.5] |
| `ventas_hoja` (`id`, `folio_hoja`, `folio_cotizacion`, `nombre`, `cuenta`, `estatus`, `tipo_trabajo`, `iva`, `fecha_*`, `etapa`, `direccion`, `ubicacion`, `telefono`, `entrega`, `notas`, `plazo_k`, `sellos`, `sub`, `neto`, `anticipo`, `liquidacion`, `pago_pendiente`, `comisiones`, `abono_comision`, `comision_restante`, `pct_comision`, `sync`, `creado_en`, `actualizado_en`) | todos | **desaparece** | era el espejo local de la hoja: ahora la base es la fuente y Control lee `ventas_calculadas` (que incluye las ≥199 históricas) [PLAN §3.1; M05 §7] |
| `pendientes` (op: `id`, `tipo`, `almacen`, `entidad`, `registro_id`, `entidad_id`, `datos`, `campos`, `esperado`, `ts`, `disp`, `intentos`, `ultimo_error`, `estado`, `conflicto`, `sync`, `creado_en`, `actualizado_en`, `codigo_rechazo`, `motivo_rechazo`, `revivida_*`) | todos | **no se migra: se drena antes del corte** | la bandeja se reconstruye; `esperado`/`conflicto` son código muerto [M06 §0.2]. Si al importar hay ops `pendiente` o `rechazada` en un teléfono, el **procedimiento del corte** las obliga a subirse primero (§7.6) |
| `pendientes` marcas `_marcas` (`ultimo_envio`, `ultima_bajada`, `cursor`, `vistos`, `barrido`, `ultima_bajada_completa`) y `_almacen_hoja` (`desde`, `completo_en`, `barriendo`) | todas | no se migran | el cursor del transporte nuevo es otro (§7.2) |

**`al3d_cot_imgs.img`** (`id`, `url` dataURL JPEG ≤1800 px, `w`, `h`, `ts`) → **Supabase Storage**, bucket privado `cotizacion-imagenes`, ruta `<empresa>/<folio_global>/<id>.jpg` (`url` decodificado; `w`,`h`,`ts` en los metadatos del objeto). Lo referencian `items[].plano`, `renders[]` y `propuesta[]` dentro de `cotizaciones.datos` **por id**; esos ids se conservan. Política de Storage en `supabase/opcional/storage.sql` (no se corre en PGlite): lectura para miembros de la empresa, escritura para el autor y Dirección. Hay que **subirlas desde el propio teléfono** (ningún respaldo las contiene [M07 §8.2]).

### 3.6 Cada clave de `localStorage` / `sessionStorage` con datos de negocio o de identidad

Columna «En revocación» = lo que hace el borrado por `acceso_revocado` **cuando se cumplan los tres candados** (§7.5): BORRAR (dato de empresa o credencial), MANTENER (preferencia de aparato/UI), CONSERVAR (identidad del aparato que no se debe perder) [M06 §4.1-4.4]. El borrado **debe cubrir también las dos IndexedDB** (`al3d_pf`, `al3d_cot_imgs`) y los cachés del service worker; el «cordón» manual de Ajustes es incompleto [C-20].

| Clave | Contenido | Destino | En revocación |
|---|---|---|---|
| `al3d_pf_disp` | id del aparato (4 car.) | **no es dato de la base**; se REGISTRA en `subida_unica` como `contadores('folio_cot:<disp>')` (acuse). Entra en `folio_global` | CONSERVAR (si se borra, el folio puede repetirse) |
| `al3d_pf_letra_folio` | letra del folio impreso | no se migra | MANTENER |
| `al3d_pf_rol` | rol manual (aparatos sin pase) | no se migra: el rol ahora sale de `miembros` vía `mi_acceso()`; **sin pase válido ya no cae a `'direccion'`** [C-12] | BORRAR |
| `al3d_pf_nombre` | nombre de la persona | no se migra (PII; solo aparece en `usuario_texto` de lo que ese teléfono subió) | BORRAR |
| `al3d_pf_ganadas` | buzón de ventas ganadas (importes) | se **drena antes del corte**; lo que quede se convierte con `ganar_proyecto` desde el teléfono dueño y se borra | BORRAR |
| `al3d_pf_tiles` | capa del mapa | no se migra | MANTENER |
| `al3d_pf_gcal` | `{clientId, calendarioId, invitados[]}` | no se migra (el token de Calendar es de cada persona y no pasa por la base [PLAN §4.9]) | BORRAR (correos del equipo) |
| `al3d_pf_puente` | `{url, token de dispositivo en claro}` | **se retira** (tokens: fase 5) | BORRAR |
| `al3d_pf_ingreso` | `{correo, clientId}` | lo sustituye la sesión de Supabase | BORRAR |
| `al3d_pf_ult_export` | ISO del último respaldo | no se migra | MANTENER |
| `al3d_pf_empresa` | nunca escrita | no se migra | BORRAR si existe |
| `al3d_pf_restaurar` | mitad del cotizador de un respaldo (MB) | no se migra (transitoria) | BORRAR |
| `al3d_pf_ia_ok` | «ya probé la llave» | no se migra | MANTENER |
| `al3d_pf_pase` | `{correo, rol, hasta}` (`prefs.js:305-320`: `pase()` exige `correo` texto, `rol` de las 3 áreas y `hasta` futuro) | **se sigue escribiendo con la misma forma `{correo, rol, hasta}`** desde `mi_acceso()` (rol = el del área activa) porque lo leen `prefs.pase()` y, **sin módulos**, `js/tema.js:93`, `cotizador.html:73`, `anidador-vectores/index.html:44` y `publicaciones/js/previo.js:29` (estos solo miran `correo` y `hasta`) [N-10] | BORRAR |
| `al3d_pf_entrada` | día del último ingreso con Google | no se migra | BORRAR |
| `al3d_pf_fondo` | adorno de la puerta | no se migra | MANTENER |
| `al3d_pf_gtok` | access token de Google (1 h, **en claro en localStorage**; `puente.js:928` dice «solo en memoria»: obsoleto [X-01]) | lo sustituye el JWT de Supabase | BORRAR |
| `al3d_pf_carpetas` | caché de Drive (nombres de clientes) | no se migra (Drive se queda en Apps Script) | BORRAR |
| `al3d_pf_cand_abierta`, `al3d_pf_pasos_gcal`, `al3d_pf_pasos_puente` | UI / checklist | no se migra | MANTENER |
| `al3d_pf_ultima_bajada` | ms de la última bajada | lo sustituye el cursor `(updated_at,id)` del transporte nuevo | MANTENER (o borrar con todo) |
| `al3d_historial` | cotizaciones autorizadas (31 campos por entrada) | `cotizaciones` (+ `procedencia.sello_local`) por `subida_unica`; imágenes a Storage | BORRAR |
| `al3d_queue` | cola de pendientes (`q` = foto de `Q`) y renglones fantasma `autorizada`+`q:null` | los `pendiente` → `cotizaciones` (`pendiente`) + `solicitudes`; los fantasma solo aportan el **máximo de folio** a `contadores('folio_cot:<disp>')` | BORRAR |
| `al3d_q` | borrador en curso (un renglón por aparato) | **no se migra** (no hay estado `borrador` en la base; `Q-A17`) | BORRAR |
| `al3d_aifile` | imagen analizada en curso (≤2 MB) | no se migra (va con el borrador) | BORRAR |
| `al3d_folio` | contador local de folios | `contadores('folio_cot:<disp>')` (acuse del máximo) | CONSERVAR |
| `al3d_hitos` | `{folio corto: {pdf,wa,venta}}` | `cotizaciones.hitos` de `(folio, <disp del teléfono que sube>)` (la clave por folio corto colisiona entre aparatos) | BORRAR |
| `al3d_canva` | `{folio corto: {primera,ultima,veces}}` | `cotizaciones.hitos.propuesta` | BORRAR |
| `al3d_cuadernos` | notas por cliente (`tel:…`/`nom:…`) | `cuaderno_notas` (autor = quien sube) | BORRAR |
| `al3d_logo` | logo propio (≤300 KB) | no se migra: preferencia visual del aparato (mover a Storage por empresa = mejora posterior) | BORRAR |
| `al3d_autorizador` | nombre de quien autoriza | no se migra | BORRAR |
| `al3d_ult_material` | último material usado | no se migra | MANTENER |
| `al3d_rv_pct`, `al3d_rv_cuenta` | % y cuenta recordados | no se migra (cuenta bancaria nominal) | BORRAR |
| `al3d_respaldo_ts`, `al3d_respaldo_n` | marcas del último respaldo | no se migra | MANTENER |
| `al3d_anidador_retazos`, `al3d_anidador_material` | sobrantes de lámina con nombre / última hoja | **no se migra**: inventario por aparato, no es el almacén (`Q-16`, documentado) [N-05] | BORRAR |
| `al3d_anidar`, `al3d_pista_*`, `al3d_tema`, `al3d_fold_proy`, `al3d_kxs_*`, `ai_key*`, `ai_model`, `ai_provider` | transitorios, UI o heredadas (el cotizador las borra) | no se migran | MANTENER / se borran solas |
| `al3d-editor-lista`, `al3d-editor-conjuntos` | editor de publicaciones, por aparato | no se migra (no es dato de negocio) [N-06] | MANTENER |
| sessionStorage `al3d_sesion`, `al3d_pf_actualizada` | marcas de sesión | no se migra | no aplica |
| Cache Storage `al3d-v1`, `al3d-app-94` | estáticos de la app | no se migra | se limpian con el service worker |

### 3.7 Propiedades del script, `CacheService` y constantes en el código

| Propiedad / caché | Qué es | Destino | Quién |
|---|---|---|---|
| `PUENTE_TOKENS` | `{token: rol}` | **se retira** (fase 5): reemplazado por `miembros` + JWT | — |
| `SELLO_AUTORIZACION` | clave HMAC (texto UTF-8) | **secreto de la Edge Function** (`autorizar`, `verificar`) y copia fuera de línea; **jamás en la base** ni en Vault de la base; no se rota (rotar = «no auténtica» en todos los PDF) | Elías, desde el panel; no pasa por el chat |
| `IA_KEYS` | `{qwen:[…],deepseek:[…],gemini:[…]}` | secretos de la Edge Function `ia` | Elías |
| `IA_ROTACION` | turno de llaves | `contadores('*','ia_turno:<prov>')` (`public.ia_turno`) | función |
| `IA_CUOTA_<yyyyMMdd>` (**GMT**) | `{hash(quien): n}` | `contadores('*','ia:<uid>', 'yyyymmdd MX')` (`public.ia_cuota`) | función |
| `FOLIO_MAS_ALTO` | contador `V-###` (**no es secreto**; el plan lo metía en Vault [C-28]) | `contadores('al3d','V')`, sembrado ≥ máximo de A, `Ventas (respaldo)`, `Bitácora del puente` y `Abonos comisión` | `contador_sembrar` |
| `ALMACEN_SECUENCIA` | secuencia de `/jalar_almacen` | `contadores('al3d','alm')` → `almacen_movimientos.seq` (sembrado con su valor) | trigger |
| `PUENTE_Y_AD_ALINEADAS`, `PUENTE_Y_AD_VISTA_PREVIA` | realineación Y:AD | no se migran (mueren con ella) | — |
| `CacheService`: `ing_<hash>`, `ing_fallos`, `ing_min@n`, `p_<hash>@n`, `grandes@n` | caché de identidad y cupo de 60/min | no se migran: la identidad la da el JWT; el cupo por persona lo da la plataforma (Supabase), no la base | — |
| `CacheService`: `v_<hash>@n`, `v__total@n` | cupo de `/verificar` | `contadores('*','ver:…', ventana)` (`public.verificar_cupo`) | función |
| `CacheService`: `carpetas-trabajos-v1` | caché de Drive | se queda en Apps Script | — |
| `PUENTE_CLIENT_IDS`, `CLIENT_ID` (`ingreso.js:84-85`) | id del cliente OAuth de Google (público) | «Authorized Client IDs» del proveedor Google en Supabase (Q-08); no es dato | Elías |
| `URL_PUENTE` (`prefs.js:83-84`), `HOJA_FINANZAS` (`asistente-contexto.js:464`), `RAIZ_TRABAJOS` (`carpetas.js:88`), `CARPETA_TRABAJOS` (`.gs:5806`), `CORREO` (`.gs:17`) | constantes de producción incrustadas [N-04] | módulo de configuración del cliente / Apps Script; no son dato de la base | — |
| `FIN = 310` (`.gs:9`), rangos `$2:$310`, `Abonos 2000` | capacidad de la hoja | **no es de la base**: la base no tiene tope; el espejo tiene su propio chequeo de capacidad (§7.8) [P-09] | espejo |

### 3.8 Rutas del puente → destino [00 §5.3]

| Ruta | Destino |
|---|---|
| `salud`, `esquema` | `public.mi_acceso()` + `version_contrato()` (identidad, área, permisos, contrato). El estado de las llaves de IA (`salud.ia`) lo da la Edge Function `ia` |
| `jalar`, `empujar` | lecturas por RLS con cursor (§7.2) + RPC por entidad (§5): `ganar_proyecto`, `proyecto_actualizar`, `mover_etapa`, `corregir_venta`, `instalacion_guardar`… La **compuerta de sellos**, el IVA por cuenta, la validación por columna, el folio `V-###` y la idempotencia **viven en la base** (no son «transporte») [C-14] |
| `jalar_almacen`, `empujar_almacen` | lecturas por RLS + `almacen_aplicar` |
| `solicitar`, `cancelar`, `estado`, `rechazar`, `revocar` | `solicitar`, `cancelar_solicitud`, `estado_solicitudes`, `rechazar_solicitud`, `revocar_autorizacion` |
| `pendientes` | lectura de `solicitudes` por RLS (solo Dirección): `estado = 'pendiente'` |
| `autorizar` | **Edge Function `autorizar`** (TypeScript; calcula catálogo, huella, renglones y firma) → `registrar_autorizacion` (solo `service_role`) |
| `verificar` (pública) | **Edge Function `verificar`** → `verificar_cupo` + `autorizacion_para_verificar` (solo `service_role`); recalcula la firma; **error explícito** (nunca `no_autentica`) si falta la clave o la base |
| `ia` | Edge Function `ia` → `ia_cuota`, `ia_turno` |
| `expandir` | Edge Function `maps` (parsea con `new URL`, `https:` sin userinfo ni puerto, compara `hostname` con la lista, `redirect:'manual'`; copiar la **lista**, no la regex [M01 §7]) |
| `carpetas`, `crear_carpeta` | se quedan en Apps Script (Drive); su autenticación tras retirar tokens es decisión de la fase 5 [DEC Q-12] |
| `espejo` (nueva) | Apps Script ← Edge Function `espejo`, que lee las vistas `espejo_ventas`/`espejo_abonos` con `service_role` (§7.8) |
| GET | se retira |

---

## 4. Seguridad

### 4.1 Helpers (esquema `interno`)

Todo helper que las políticas o las RPC llaman es `SECURITY DEFINER`, `set search_path = ''`, con nombres calificados. Los que leen `miembros` saltan su RLS (el dueño es `postgres`, con `BYPASSRLS`; en PGlite es superusuario) para no recursar.

```sql
-- empresas donde la persona es miembro ACTIVO con alguna de las áreas dadas (se evalúa UNA vez por consulta: `hashed SubPlan`)
create function interno.empresas_donde(p_areas text[]) returns setof text
language sql stable security definer set search_path = '' as $$
  select m.empresa_id from public.miembros m
   where m.usuario_id = auth.uid() and m.estado = 'activo' and m.area = any (p_areas)
$$;

-- el correo con el que la persona entró, SOLO si Supabase lo verificó (nunca `user_metadata.email_verified`: el usuario lo edita con updateUser).
-- «No anónimo» sale del claim `is_anonymous` del JWT: la `auth.users` del arnés no trae esa columna (S-01).
create function interno.correo_verificado() returns text
language sql stable security definer set search_path = '' as $$
  select pg_catalog.lower(pg_catalog.btrim(u.email)) from auth.users u
   where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- contexto de una RPC: empresa, área y MOTIVO. Aquí nace la señal explícita `acceso_revocado` (R8):
--   'ok' | 'sin_sesion' | 'sin_acceso' (nunca tuvo fila) | 'acceso_revocado' (tuvo y la fila quedó en 'baja') | 'empresa_requerida'
create type interno.contexto_t as (empresa_id text, area text, usuario_id uuid, motivo text);

create function interno.ctx(p_empresa text default null) returns interno.contexto_t
language plpgsql stable security definer set search_path = '' as $$
declare r interno.contexto_t; v_uid uuid := auth.uid(); v_n int; v_e text; v_a text;
begin
  r.usuario_id := v_uid;
  if v_uid is null then r.motivo := 'sin_sesion'; return r; end if;
  if p_empresa is not null then
    select m.area into v_a from public.miembros m
     where m.usuario_id = v_uid and m.empresa_id = p_empresa and m.estado = 'activo';
    if v_a is not null then r.empresa_id := p_empresa; r.area := v_a; r.motivo := 'ok'; return r; end if;
  else
    select count(*), min(m.empresa_id), min(m.area) into v_n, v_e, v_a
      from public.miembros m where m.usuario_id = v_uid and m.estado = 'activo';
    if v_n = 1 then r.empresa_id := v_e; r.area := v_a; r.motivo := 'ok'; return r; end if;
    if v_n > 1 then r.motivo := 'empresa_requerida'; return r; end if;
  end if;
  r.motivo := case when exists (select 1 from public.miembros m where m.usuario_id = v_uid and m.estado = 'baja'
                                   and (p_empresa is null or m.empresa_id = p_empresa))   -- la baja cuenta SOLO en la empresa que se pidió
                   then 'acceso_revocado' else 'sin_acceso' end;
  return r;
end $$;

-- sobre de error: el cliente ya entiende {ok, codigo, mensaje, definitivo} (`puente.js:1036-1049`)
create function interno.err(p_codigo text, p_mensaje text, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok', false, 'codigo', p_codigo, 'mensaje', p_mensaje,
           'definitivo', p_codigo in ('ROL_SIN_PERMISO','NO_ENCONTRADO','DATO_INVALIDO','DUPLICADO')) || coalesce(p_extra, '{}'::jsonb)
$$;

-- guardia de contrato: cabecera x-al3d-contrato (PostgREST la expone en el GUC request.headers)
create function interno.guardia_contrato() returns jsonb language plpgsql stable set search_path = '' as $$
declare v_h text; v_min int := (public.version_contrato() ->> 'minimo')::int;      -- una sola fuente (§7.6)
begin
  v_h := (nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb) ->> 'x-al3d-contrato';
  if v_h is null or v_h !~ '^[0-9]{1,6}$' or v_h::int < v_min then
    return interno.err('CLIENTE_VIEJO', 'Actualiza la app y vuelve a intentarlo.', jsonb_build_object('minimo', v_min));
  end if;
  return null;
end $$;
```

**Preámbulo común de toda RPC de escritura para el cliente** (se escribe una vez como macro de pseudocódigo en §5):

```
g := interno.guardia_contrato();            si g no es null -> devolver g
c := interno.ctx(p_empresa)
si c.motivo = 'acceso_revocado'    -> interno.err('ACCESO_REVOCADO', 'Tu acceso a esta empresa ya no está activo.')       (NO definitivo)
si c.motivo = 'sin_acceso'         -> interno.err('SIN_ACCESO', 'Esta cuenta no tiene acceso. Pídele a Dirección que te agregue.')
si c.motivo = 'empresa_requerida'  -> interno.err('EMPRESA_REQUERIDA', …)
si c.motivo <> 'ok'                -> interno.err('ROL_SIN_PERMISO', …)
si c.area no está entre las permitidas de la RPC (o del CAMPO, §5.1) -> interno.err('ROL_SIN_PERMISO', …)   -- ANTES de leer una sola fila
```

### 4.2 GRANT / REVOKE y matriz de permisos

**Base común** (migración `0001`, antes de crear nada):

```sql
revoke create on schema public from public;
alter default privileges for role postgres                     revoke execute on functions from public;
alter default privileges for role postgres in schema public    revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public    revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public    revoke all on sequences from anon, authenticated;
create schema if not exists interno;
revoke all on schema interno from public, anon, authenticated;
grant  usage on schema interno to authenticated, service_role;
-- por cada tabla t de negocio (en la migración que la crea):
alter table public.t enable row level security;
revoke all  on public.t from public, anon, authenticated;
grant select on public.t to authenticated;               -- solo si tiene política de lectura (todas menos `contadores`)
grant select, insert, update on public.t to service_role;  -- SIN delete: ni siquiera service_role borra (trigger `sin_borrar`)
-- por cada función f:
revoke all on function … from public, anon, authenticated;
grant execute on function … to authenticated;            -- RPC de cliente
grant execute on function … to service_role;             -- RPC de Edge Functions; helpers de políticas: authenticated y service_role
```

**Matriz tabla × rol × operación.** `S` select, `I` insert, `U` update, `D` delete. **`authenticated` no tiene `I`, `U` ni `D` en ninguna tabla** (se escribe por RPC, que corre como dueño); `anon` no tiene nada; `service_role` tiene `S/I/U` (sin `D`: el trigger `sin_borrar` lo prohíbe a todos). La columna «Condición exacta de S» es la expresión de la política.

| Tabla | S Dirección | S Fabricación | S Pagos | I/U/D `authenticated` | `anon` | `service_role` |
|---|---|---|---|---|---|---|
| `empresas` | `id in empresas_donde({dir,fab,pag})` | ídem | ídem | no | no | S/I/U |
| `miembros` | `usuario_id = auth.uid()` **o** `empresa_id in empresas_donde({dir})` | solo `usuario_id = auth.uid()` (su propia fila, baja incluida) | ídem | no (`miembro_*` y `reclamar_acceso`) | no | S/I/U |
| `proyectos` | `empresa_id in empresas_donde({dir,fab,pag})` (lápidas incluidas) | ídem | ídem | no | no | S/I/U |
| `ventas_dinero` | `empresa_id in empresas_donde({dir,pag})` | **sin política: 0 filas** | ídem que Dirección | no | no | S/I/U |
| `abonos` | `empresa_id in empresas_donde({dir,pag})` | **0 filas** | sí | no | no | S/I/U |
| `instalaciones` | `empresa_id in empresas_donde({dir,fab,pag})` | sí | sí | no | no | S/I/U |
| `cotizaciones` | `empresa_id in empresas_donde({dir})` | **0 filas** (`Q-A01`) | `creado_por = auth.uid()` y `empresa_id in empresas_donde({pag})` | no | no | S/I/U |
| `solicitudes` | `empresa_id in empresas_donde({dir})` | **0 filas** | `solicito_id = auth.uid()` y `empresa_id in empresas_donde({pag})` | no | no | S/I/U |
| `autorizaciones` | `empresa_id in empresas_donde({dir})` | **0 filas** | **0 filas** (su sello llega por `estado_solicitudes`) | no (`UPDATE` de `estado` solo por `revocar_autorizacion`/`registrar_autorizacion`) | no | S/I/U |
| `cuaderno_notas` | `empresa_id in empresas_donde({dir})` | `autor_id = auth.uid()` y `empresa_id in empresas_donde({fab})` | ídem con `{pag}` | no (`cuaderno_guardar`) | no | S/I/U |
| `materiales` | `empresa_id in empresas_donde({dir,fab,pag})` | sí | sí | no | no | S/I/U |
| `requerimientos` | ídem | sí | sí | no | no | S/I/U |
| `almacen_movimientos` | ídem | sí | sí | no | no | S/I/U |
| `almacen_costos` | `empresa_id in empresas_donde({dir,pag})` | **0 filas** | sí | no | no | S/I/U |
| `constantes` | `empresa_id in empresas_donde({dir,fab,pag})` | sí | sí | no (`constante_guardar`) | no | S/I/U |
| `bitacora` | `nivel='general'` (tres áreas) **o** `nivel='dinero'` (`{dir,pag}`) **o** `nivel='direccion'` (`{dir}`) | solo `nivel='general'` | `general` y `dinero` | no | no | S/I/U |
| `contadores` | **ninguna política y ningún GRANT**: ni leer | ídem | ídem | no | no | S/I/U |
| vista `ventas_calculadas` | hereda RLS de `proyectos`/`ventas_dinero`/`abonos` (`security_invoker`): todas las filas | **0 filas** (el `JOIN` interno con `ventas_dinero` no devuelve nada) | todas | — | no | S |
| vista `comisiones_pendientes` | ídem (sobre `ventas_calculadas`) | 0 filas | todas | — | no | S |
| vistas `espejo_ventas`, `espejo_abonos` | **sin GRANT** | sin GRANT | sin GRANT | — | no | S |

Las políticas, tal cual (todas `for select to authenticated`; nombre = `<tabla>_sel_<áreas>`):

```sql
create policy empresas_sel_todos            on public.empresas       for select to authenticated using (id         in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));
create policy miembros_sel_propia           on public.miembros       for select to authenticated using (usuario_id = (select auth.uid()));
create policy miembros_sel_direccion        on public.miembros       for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion'])));
create policy proyectos_sel_todos           on public.proyectos      for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));
create policy ventas_dinero_sel_dir_pag     on public.ventas_dinero  for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));
create policy abonos_sel_dir_pag            on public.abonos         for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));
create policy instalaciones_sel_todos       on public.instalaciones  for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));
create policy cotizaciones_sel_direccion    on public.cotizaciones   for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion'])));
create policy cotizaciones_sel_autor_pagos  on public.cotizaciones   for select to authenticated using (creado_por = (select auth.uid()) and empresa_id in (select interno.empresas_donde(array['pagos'])));
create policy solicitudes_sel_direccion     on public.solicitudes    for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion'])));
create policy solicitudes_sel_autor_pagos   on public.solicitudes    for select to authenticated using (solicito_id = (select auth.uid()) and empresa_id in (select interno.empresas_donde(array['pagos'])));
create policy autorizaciones_sel_direccion  on public.autorizaciones for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion'])));
create policy cuaderno_sel_direccion        on public.cuaderno_notas for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion'])));
create policy cuaderno_sel_propia           on public.cuaderno_notas for select to authenticated using (autor_id = (select auth.uid()) and empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));
create policy materiales_sel_todos          on public.materiales     for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));
create policy requerimientos_sel_todos      on public.requerimientos for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));
create policy movimientos_sel_todos         on public.almacen_movimientos for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));
create policy almacen_costos_sel_dir_pag    on public.almacen_costos for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));
create policy constantes_sel_todos          on public.constantes     for select to authenticated using (empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));
create policy bitacora_sel_general          on public.bitacora       for select to authenticated using (nivel = 'general'   and empresa_id in (select interno.empresas_donde(array['direccion','fabricacion','pagos'])));
create policy bitacora_sel_dinero           on public.bitacora       for select to authenticated using (nivel = 'dinero'    and empresa_id in (select interno.empresas_donde(array['direccion','pagos'])));
create policy bitacora_sel_direccion        on public.bitacora       for select to authenticated using (nivel = 'direccion' and empresa_id in (select interno.empresas_donde(array['direccion'])));
-- contadores: RLS activa y NINGUNA política (denegado por defecto) + sin GRANT.
```

**EXECUTE de los helpers y SELECT de las vistas** (sin esto las políticas y las vistas fallan con `permission denied for function`): una política, una vista `security_invoker` y un `CHECK` se evalúan **con los privilegios de quien consulta o escribe**, no del dueño. Todo lo demás de `interno` solo lo ejecuta el dueño, desde las RPC (`SECURITY DEFINER`).

```sql
grant execute on function interno.empresas_donde(text[])        to authenticated, service_role;   -- políticas RLS
grant execute on function interno.neto(numeric, boolean)        to authenticated, service_role;   -- vista ventas_calculadas
grant execute on function interno.comision(numeric)             to authenticated, service_role;
grant execute on function interno.hoy_mx()                      to authenticated, service_role;
grant execute on function interno.sellos_validos(jsonb)         to service_role;                  -- CHECK de proyectos: el importador escribe directo
grant execute on function interno.contiene_dinero(jsonb)        to service_role;

revoke all    on public.ventas_calculadas, public.comisiones_pendientes, public.espejo_ventas, public.espejo_abonos from public, anon, authenticated;
grant  select on public.ventas_calculadas, public.comisiones_pendientes to authenticated, service_role;
grant  select on public.espejo_ventas, public.espejo_abonos             to service_role;          -- solo la Edge Function `espejo`
```

**Cierre de privilegios de las RPC** (idempotente; corre al final de cada migración que crea funciones en `public`, y la auditoría de `0011` lo comprueba): las 30 de cliente son de `authenticated`; las 7 de servicio, solo de `service_role`; nadie más ejecuta nada.

```sql
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname = any (array['registrar_autorizacion','autorizacion_para_verificar','verificar_cupo','ia_cuota','ia_turno','contador_sembrar','cuadre_hoja'])
      then execute format('grant execute on function %s to service_role', f.sig);
      else execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
```

**Multiempresa en RLS:** todas las condiciones comparan el `empresa_id` **de la fila** contra las empresas donde la persona es miembro con esa área; un usuario de otra empresa no ve nada, y alguien que sea Dirección en una empresa y Fabricación en otra recibe, en cada fila, los privilegios de **esa** empresa (prueba MT-03). Las RPC usan `interno.ctx(p_empresa)`: con una sola membresía activa no hace falta `p_empresa`; con varias, `EMPRESA_REQUERIDA`.

### 4.3 Vistas

Toda vista lleva `with (security_invoker = true)` (PG15+): corre con los privilegios de **quien consulta**, así que RLS de las tablas base aplica. Una vista normal corre como su dueño y **se salta RLS** [00 §10; C-09].

| Vista | Para quién | Por qué es segura |
|---|---|---|
| `ventas_calculadas` | Dirección, Pagos (Control) | lee `ventas_dinero` con el `JOIN` **interno**: a Fabricación no le llega ninguna fila, ni siquiera con el nombre del proyecto |
| `comisiones_pendientes` | Dirección, Pagos | sobre `ventas_calculadas` |
| `espejo_ventas`, `espejo_abonos` | solo `service_role` (la Edge Function `espejo`) | `REVOKE` a todos los demás; `security_invoker` igualmente |

No hay «vistas por área» para leer (como pedía el plan §4.2): la separación es por **tablas** y por RLS, que es más simple y verificable. La prueba GR-04 recorre `pg_class` y falla si existe una vista sin `security_invoker`.

### 4.4 Realtime: qué se publica y por qué no filtra dinero

```sql
do $$ declare t text; begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  foreach t in array array['proyectos','ventas_dinero','abonos','instalaciones','cotizaciones','solicitudes','materiales',
                           'requerimientos','almacen_movimientos','almacen_costos','constantes','bitacora','miembros'] loop
    execute format('alter table public.%I replica identity default', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
```

| Pregunta | Respuesta |
|---|---|
| ¿Qué se publica? | las 13 tablas de arriba. **No** `empresas`, `autorizaciones`, `cuaderno_notas`, `contadores` |
| ¿Por qué `ventas_dinero`, `abonos`, `almacen_costos`, `cotizaciones`, `solicitudes` no filtran dinero a Fabricación? | (1) Postgres Changes **autoriza cada evento INSERT/UPDATE contra cada suscriptor con su JWT**: Fabricación no pasa la política de `SELECT`, no recibe el evento [00 §10]. (2) Los eventos `DELETE` **no** pasan por RLS, pero **no existen** (trigger `sin_borrar` en todas las tablas) y, si existieran, con `REPLICA IDENTITY DEFAULT` solo llevan la llave primaria (`proyecto_id`, `id`), sin importes. (3) Ninguna tabla tiene `REPLICA IDENTITY FULL` (con FULL el `old` completo viajaría en el DELETE: prueba GR-05). (4) La publicación es una **lista cerrada**: una tabla nueva no entra sola |
| ¿Qué reemplaza al sondeo de 30 s? | el evento es solo un **aviso**: el cliente responde con una lectura incremental por cursor (§7.2). Si Realtime falla, el sondeo de respaldo es el mismo cursor |
| ¿Broadcast / Presence? | no se usan; no se crean canales privados con datos |

### 4.5 Qué ve Fabricación de `origen` (R1)

Hoy `proyectos.origen` es la copia congelada de la entrada del cotizador **con todos sus precios** y Fabricación la necesita para la orden de trabajo y el material (`mod/proyectos.js:2638-2716`) [C-03; M09 §1.3]. La base la **parte en dos**; `interno.partir_origen(origen jsonb) → (obra jsonb, dinero jsonb)` la llaman `ganar_proyecto`, `proyecto_actualizar` (`origen`, Dirección) y la importación, de modo que **un cliente que mande `origen` completo no puede filtrarlo**:

| Parte | Dónde vive | Quién la lee | Contenido |
|---|---|---|---|
| `origen_obra` | `proyectos.origen_obra` | los tres roles | **lista blanca**. Raíz: `folio, proy, cliente, tel, dirRaw, direccion, maps, entrecalles, entrega, notaCliente, fecha, plazoK, disp, fuente, iva, items, renders, propuesta, aiFile{name,type}`. Cada `items[]`: `id, tipo, material, matAuto, comp, luz, ilumTipo, altura, n, acab, recComp, bas, ancho, alto, pz, desc, descAi, textoAuto, showInPdf, plano, nManual, descAuto, medidaTipo, anchoMedido, opciones, caja_forma`; las `opciones.lista[].d` se filtran con la misma lista |
| `ventas_dinero.origen_dinero` | tabla restringida | Dirección, Pagos | todo lo demás: `precioAuth, neto, sub, anti, antiManual, itemsAuth, huellaAuth, sello, autorizador, fechaAuth, nota, ts, reenviada` y por partida `{_lt, pu, tarifa}` indexados por `id` de partida (`{"items":{"1":{"_lt":…,"pu":…,"tarifa":…}}}`), más `venta:{sub, neto, anti, precio_auth, iva}` (lo que el modal «Registrar venta» mandó) |

- **`tarifa` es dinero** (el precio por m² de la caja de luz) y **no** va en `origen_obra`. Lo que el taller usa de ella es **la forma** de la caja (`cajaOf(tarifa)` → `std`/`nube`, `mod/proyectos.js:2753`; `material.js:956-972`); la parte de obra lleva `caja_forma ∈ {std, nube, otra}` que **calcula el cliente** (tiene el catálogo; la base no copia precios: N-07). Un cliente viejo que no la mande deja `caja_forma` nulo y el material se calcula «con la geometría estándar», que es lo que el código ya hace cuando la tarifa no está en el catálogo (`material.js:969`) (`Q-A02`).
- **Doble candado:** el `CHECK` de `origen_obra` usa `interno.contiene_dinero()` (denylist recursiva de claves: `tarifa, pu, _lt, precioauth, neto, sub, anti, antimanual, itemsauth, huellaauth, sello, autorizador, fechaauth, nota, total, importe, precio, costo, subtotal, anticipo, liquidacion, comision, saldo`), así que aunque otra ruta intentara escribir un precio en la parte de obra, la base lo rechaza (R1-05).
- **Residuo honesto:** `desc` (descripción libre de la partida), `notas`, `instalaciones.notas` y `almacen_movimientos.nota` son texto libre; si alguien escribe un precio ahí, la base no puede saberlo (`R-07`, §11).

### 4.6 R1 vía por vía: Fabricación no lee dinero

| Vía | Cómo se cierra | Prueba |
|---|---|---|
| Tabla | `ventas_dinero`, `abonos`, `almacen_costos`, `autorizaciones`, `cotizaciones`, `solicitudes`: sin política para Fabricación | R1-01..R1-07 |
| Vista | `ventas_calculadas` con `JOIN` interno y `security_invoker`; ninguna vista sin `security_invoker` | R1-02, GR-04 |
| Embedding de PostgREST (`proyectos?select=*,ventas_dinero(*)`) | RLS se aplica a la tabla embebida: llega vacío | R1-08 |
| RPC | toda RPC que devuelve importes comprueba el área **antes** de leer (`vista_previa_reparto`, `comisiones_cobradas`, `estado_solicitudes` proyecta sin importes, `registrar_*`, `corregir_*`) y las demás **no** los devuelven (`proyecto_actualizar`, `mover_etapa`, `almacen_aplicar`: respuesta sin dinero) | R1-10..R1-14 |
| `remoto` de una escritura | lo que vuelve a Fabricación sale **solo de `proyectos`** (sin dinero) | R1-13 |
| Realtime | §4.4 | R1-15, GR-05 |
| `origen` | §4.5 | R1-04, R1-05 |
| Bitácora | `nivel` por fila, lo pone la RPC; `titulo`/`detalle` de `general` sin importes | R1-09 |
| Cotizaciones | sin lectura para Fabricación (`Q-A01`) | R1-06 |
| Almacén con costos | `almacen_costos` aparte; sus costos de entrada se **ignoran en silencio** y no se devuelven | R1-07, AL-09 |
| Mensajes de error | la comprobación de área precede a cualquier lectura y los mensajes no llevan valores | R1-16 |
| El espejo (hoja) | **canal de dinero fuera de RLS**: quien abra la hoja ve todo; el archivo de Drive no se comparte con Fabricación (`R-05`, §11) | — |

### 4.7 Configuración de Auth que el diseño supone (no es SQL)

`Allow new users to sign up` **encendido** (apagado, «only existing users can sign in», chocaría con «quien entra con Google ya está dentro»: habría que pre-crear el usuario en cada alta [P-07]); proveedor **solo Google**; `Confirm email` encendido; el RLS niega por defecto a quien no esté en `miembros`, así que una cuenta nueva ve `sin_acceso` y nada más. La identidad verificada es `auth.users.email_confirmed_at is not null` (y **no** `user_metadata.email_verified`, que el propio usuario puede editar con `updateUser`).

---

## 5. Catálogo de RPC

### 5.0 Resumen: 37 funciones (30 para el cliente, 7 solo para Edge Functions)

Todas `SECURITY DEFINER`, `set search_path = ''`, `REVOKE … FROM PUBLIC, anon` (y de `authenticated` las de servicio). Las 30 del cliente empiezan con el preámbulo de §4.1 (contrato → contexto → área). «Idem.» = idempotencia (§7.3). Una operación jsonb por entidad (`p_op`), con el **id del cliente** dentro: la bandeja manda una RPC por operación.

| # | RPC (en `public`) | Firma SQL | Quién | Idem. |
|---|---|---|---|---|
| 1 | `mi_acceso` | `(p_empresa text default null) returns jsonb` | cualquier sesión (miembro o no) | lectura |
| 2 | `reclamar_acceso` | `() returns jsonb` | cualquier sesión con correo verificado | por fila: ya vinculada = ok |
| 3 | `miembro_alta` | `(p_correo text, p_area text, p_nota text default '', p_empresa text default null)` | Dirección | `upsert` por correo |
| 4 | `miembro_cambiar_area` | `(p_correo text, p_area text, p_empresa text default null)` | Dirección | misma área = sin cambio |
| 5 | `miembro_baja` | `(p_correo text, p_empresa text default null)` | Dirección | ya en baja = sin cambio |
| 6 | `version_contrato` | `() returns jsonb` | sesión | lectura |
| 7 | `ganar_proyecto` | `(p_op jsonb, p_empresa text default null)` | Dirección | `id` y `folio_global` únicos |
| 8 | `descartar_cotizacion` | `(p_op jsonb, p_empresa text default null)` | Dirección | `folio_global` único |
| 9 | `alta_venta` | `(p_op jsonb, p_empresa text default null)` | Dirección, Pagos | `id` único |
| 10 | `proyecto_actualizar` | `(p_op jsonb, p_empresa text default null)` | Dirección, Fabricación, Pagos (por campo) | sello: empate escribe el mismo valor |
| 11 | `mover_etapa` | `(p_proyecto text, p_etapa text, p_sello bigint default null, p_motivo text default '', p_empresa text default null)` | Dirección; Fabricación solo `ganado…listo` en origen **y** destino | misma etapa = sin cambio |
| 12 | `instalacion_guardar` | `(p_op jsonb, p_empresa text default null)` | Dirección, Fabricación | `id` único + una viva por proyecto |
| 13 | `emitir_salidas_derivadas` | `(p_hoy date default null, p_empresa text default null)` | Dirección, Fabricación, Pagos | `mov-salida:<req.id>` |
| 14 | `registrar_cobro` | `(p_proyecto text, p_monto numeric, p_fecha date default null, p_liquidar boolean default true, p_op_id text default null, p_empresa text default null)` | Dirección, Pagos | `op_id` |
| 15 | `registrar_abono_comision` | `(p_proyecto text, p_monto numeric, p_fecha date default null, p_nota text default '', p_op_id text default null, p_empresa text default null)` | Dirección, Pagos | `op_id` |
| 16 | `repartir_abono_fifo` | `(p_monto numeric, p_fecha date default null, p_nota text default '', p_op_id text default null, p_empresa text default null)` | Dirección, Pagos | `op_id` |
| 17 | `vista_previa_reparto` | `(p_monto numeric, p_empresa text default null) returns jsonb` | Dirección, Pagos | lectura |
| 18 | `corregir_venta` | `(p_proyecto text, p_cambios jsonb, p_empresa text default null)` | Dirección, Pagos (por campo) | valores absolutos |
| 19 | `corregir_abono` | `(p_proyecto text, p_monto numeric, p_nota text, p_fecha date default null, p_op_id text default null, p_empresa text default null)` | Dirección | `op_id` |
| 20 | `comisiones_cobradas` | `(p_desde date, p_hasta date, p_empresa text default null) returns jsonb` | Dirección, Pagos | lectura |
| 21 | `almacen_aplicar` | `(p_ops jsonb, p_atomico boolean default false, p_empresa text default null)` | Dirección, Fabricación; Pagos limitado | por `id` de registro |
| 22 | `constante_guardar` | `(p_op jsonb, p_empresa text default null)` | Dirección, Fabricación | upsert |
| 23 | `cotizacion_guardar` | `(p_op jsonb, p_empresa text default null)` | autor, Dirección | `folio_global` |
| 24 | `solicitar` | `(p_op jsonb, p_empresa text default null)` | cualquier miembro | re-pedir sobrescribe la pendiente |
| 25 | `cancelar_solicitud` | `(p_folio_global text, p_empresa text default null)` | autor, Dirección | sin pendiente = `estado:null` |
| 26 | `rechazar_solicitud` | `(p_folio_global text, p_nota text default '', p_empresa text default null)` | Dirección | sin pendiente = `NO_ENCONTRADO` |
| 27 | `revocar_autorizacion` | `(p_folio_global text, p_nota text default '', p_empresa text default null)` | Dirección | sin vigente = `NO_ENCONTRADO` |
| 28 | `estado_solicitudes` | `(p_folios text[], p_empresa text default null) returns jsonb` | cualquier miembro (proyección por área) | lectura |
| 29 | `cuaderno_guardar` | `(p_clave text, p_nota text, p_empresa text default null)` | cualquier miembro | upsert |
| 30 | `subida_unica` | `(p_lote jsonb, p_empresa text default null)` | cualquier miembro | por registro (`folio_global`, `op_id`) |
| 31 | `registrar_autorizacion` | `(p_empresa text, p_usuario uuid, p_folio_global text, p_ts_iso text, p_proyecto text, p_cliente text, p_sub_calc_txt text, p_precio_auth_txt text, p_total_txt text, p_ajuste_pct numeric, p_items_auth text, p_huella text, p_autorizo text, p_codigo text, p_firma text, p_nota text, p_renglones text, p_cotizacion jsonb default null, p_clave_id text default 'k1', p_codificacion text default 'utf-8')` | **solo `service_role`** | decisión idéntica = `repetida` |
| 32 | `autorizacion_para_verificar` | `(p_folio text, p_codigo text) returns jsonb` (`{ok, filas:[…]}`, más antigua primero) | **solo `service_role`** | lectura |
| 33 | `verificar_cupo` | `(p_folio_corto text, p_ahora timestamptz default now(), p_ip text default null) returns jsonb` | **solo `service_role`** | — (§8) |
| 34 | `ia_cuota` | `(p_usuario uuid, p_limite int default 200, p_ahora timestamptz default now()) returns jsonb` | **solo `service_role`** | — (§8) |
| 35 | `ia_turno` | `(p_prov text, p_n int) returns int` | **solo `service_role`** | — (§8) |
| 36 | `contador_sembrar` | `(p_empresa text, p_clave text, p_minimo bigint) returns bigint` | **solo `service_role`** | `greatest` |
| 37 | `cuadre_hoja` | `(p_empresa text) returns jsonb` | **solo `service_role`** | lectura |

### 5.1 Matriz de permisos por campo (la fuente única: `interno.matriz_permisos()`)

Una función `interno.matriz_permisos() returns jsonb` devuelve esta tabla; **las RPC la consultan** y `mi_acceso()` la entrega al cliente como `permisos` (reemplaza a `escribibles` de `/salud` [M05 §8.3]). Así la lista no se copia a mano en seis funciones y una prueba compara tabla y comportamiento (RL-20).

**`proyecto_actualizar`** (no toca dinero; el dinero es de `corregir_venta`). Columnas = `PUENTE_ROLES` (`.gs:2120-2136`) ∪ `CAMPOS_ROL` (`proyectos.js:982-995`):

| Campo(s) | Grupo de sello | Dirección | Fabricación | Pagos | ¿Se puede vaciar? |
|---|---|---|---|---|---|
| `notas` | `notas` | sí | sí | sí | sí |
| `tel` | `tel` | sí | sí | sí | sí |
| `dir_texto` | `dir_texto` | sí | sí | no | sí |
| `lat`, `lng`, `maps_url`, `geo_fuente` | `ubicacion` | sí | sí | no | sí |
| `entrega` | `entrega` | sí | sí | no | **no** |
| `plazo_k` | `plazo_k` | sí | sí | no | sí (vuelve al propuesto) |
| `entrecalles`, `ubicacion_pendiente` | — (sin sello) | sí | sí | no | — |
| `contacto`, `negocio`, `tipo_trabajo`, `compromiso_texto`, `fecha_anticipo` | — (no se sellan) | sí | no | no | — |
| `origen` (se parte con `partir_origen`) | — | sí | no | no | — |
| `etapa` | `etapa` | vía `mover_etapa` | vía `mover_etapa` (rango) | no | **no** |
| cita (fecha, hora) | `instalacion` | vía `instalacion_guardar` | vía `instalacion_guardar` | no | cancelar = estado |

**`corregir_venta`** (dinero; todo se registra en `bitacora` nivel `dinero` con `antes/despues`):

| Campo | Dirección | Pagos | Regla |
|---|---|---|---|
| `nombre` | sí | sí | no vacío, ≤2000 (Pagos «corrige a mano el nombre», `proyectos.js:1346-1349`; `Q-01`) |
| `subtotal` | sí | sí | número finito, puede ser negativo |
| `anticipo`, `liquidacion` | sí | sí | ≥ 0 |
| `cuenta` | sí | sí | una de las 5; **no se puede vaciar** |
| `estatus` | sí | sí (`Q-A04`: los 4, como `PUENTE_ROLES.pagos`) | uno de los 4 |
| `fecha_liquidacion` | sí | sí | `YYYY-MM-DD` o `null` |
| `pct_comision` | sí | sí | 0..100 o `null`; **informativo** |
| `iva` | sí | **no** | solo si va a quedar: venta `LIQUIDADO` o sin cuenta; si no, rechazada («la cuenta dicta el IVA», `.gs:1057-1067`) |

**`instalacion_guardar`:** Dirección crea `confirmada`; Fabricación crea `propuesta` y puede mover y marcar cualquier estado; Pagos nada. **`almacen_aplicar`:** §5.9. **Alta de proyecto:** `ganar_proyecto` y `descartar_cotizacion` solo Dirección (los botones «Se ganó» solo los pinta Dirección, pero `drenarBuzon` los ejecuta en cualquier teléfono hoy: **la base decide**, [C-13]); `alta_venta` Dirección y Pagos (`Q-A03`: es el menú «Registrar nueva venta» de la hoja, que Pagos usa).

### 5.2 Utilidades que las RPC comparten (esquema `interno`)

| Función | Qué hace |
|---|---|
| `interno.ahora_ms()` | `floor(extract(epoch from clock_timestamp()) * 1000)::bigint` |
| `interno.sello_valido(x jsonb, ahora_ms bigint)` | `n = floor(Number(x))`; si no es número finito o `n ≤ 0` ⇒ `0`; si no `least(n, ahora_ms + 600000)` (`.gs:2024-2029`, `SELLO_HOLGURA_MS = 10 min`). Acepta número o texto numérico (como `Number(x)`) |
| `interno.compuerta(tiene bigint, sellos_op jsonb, grupo text, ahora_ms bigint, vacio boolean, borrable boolean)` | **la compuerta de sellos** (§5.4), pura e `immutable`: devuelve `(accion, sello_nuevo, motivo)` con `accion ∈ {escribir, viejo, rechazar}` |
| `interno.orden_etapa(e text)` | `ganado 0, en_diseno 1, cortado 2, armado 3, listo 4, instalado 5`; `garantia`/`cancelado`/otro ⇒ `NULL` (`proyectos.js:120`) |
| `interno.telefono_limpio(t text)` | réplica de `telefonoLimpio` (`.gs`, probada por `pruebas/puente.mjs`): reemplaza todo lo que no sea `[0-9 +()-]` por espacio, colapsa espacios, `trim`, exige ≥1 dígito (si no: `NULL` = inválido; `''` de entrada = «vacío», que borra), recorta a 30 |
| `interno.hoy_mx()` / `interno.dia_mx(ts timestamptz)` | fecha de hoy y `yyyymmdd` en `America/Mexico_City` |
| `interno.siguiente(empresa, clave, ventana, n)` | contador (§2.4) |
| `interno.anotar(…)` | inserta en `bitacora` (nivel, entidad, antes/despues, `op_id`, `resultado`) |
| `interno.partir_origen(origen jsonb)` | `(obra, dinero)` según §4.5 |
| `interno.limpiar_cotizacion(c jsonb)` | port de `limpiarCotizacion` (`.gs:3530-3571`): `items` 1..80, cada partida con `id` (número o texto ≤40, único) y **solo** los 14 campos de precio `tipo, material, comp, luz, altura, n, acab, recComp, bas, ancho, alto, tarifa, pz, pu` (cada valor `null`, número finito, texto ≤60 o booleano) más `desc` ≤300; `proyecto`/`cliente` `trim` ≤140; `iva` booleano; `subtotal` número; tamaño total ≤100 000 caracteres |
| `interno.normalizar_iva(p_proyecto)` | IVA por cuenta (§5.7) |
| `interno.mover_etapa_core(…)`, `interno.emitir_salidas(…)` | §5.6 |
| `interno.items_auth_a_json(t text)`, `interno.renglones_a_json(t text)` | `itemsAuthDeCanon` y `renglonesDeTexto` (`.gs:3516-3622`) para devolver el sello al cliente en su forma de objeto |
| `interno.matriz_permisos()` | §5.1 |
| `interno.correo_verificado()` | correo de `auth.users` solo si `email_confirmed_at is not null` y el JWT no es anónimo (SQL en §4.1) |

`ahora_ms`, `orden_etapa`, `telefono_limpio`, `sellos_validos` y `contiene_dinero` están en SQL en §2.1 (los `CHECK` de las tablas las necesitan antes que las tablas); `sello_valido` y `compuerta`, en §5.4; `neto`, `comision` y `pesos`, en §5.7; `hoy_mx` y `dia_mx`, en §6.1. Falta `anotar`, que usa el tipo de contexto de §4.1:

```sql
-- escribe en la bitácora dentro de la transacción de la RPC. El nivel, el título y el detalle los pone la RPC, nunca el cliente.
-- En el pseudocódigo de §5 `anotar(nivel, accion, entidad, id, titulo, …)` lleva implícito `p_ctx` = el `c` del preámbulo.
create function interno.anotar(p_ctx interno.contexto_t, p_nivel text, p_accion text, p_entidad text, p_entidad_id text, p_titulo text,
                               p_detalle text default '', p_antes jsonb default null, p_despues jsonb default null,
                               p_op_id text default null, p_resultado jsonb default null) returns void
language plpgsql set search_path = '' as $$
begin
  insert into public.bitacora (empresa_id, nivel, accion, entidad, entidad_id, titulo, detalle, antes, despues,
                               usuario_id, usuario_texto, rol, dispositivo, op_id, resultado)
  values (p_ctx.empresa_id, p_nivel, p_accion, p_entidad, coalesce(p_entidad_id, ''), pg_catalog.left(p_titulo, 200),
          pg_catalog.left(coalesce(p_detalle, ''), 600), p_antes, p_despues, p_ctx.usuario_id,
          coalesce(interno.correo_verificado(), ''), p_ctx.area, 'srv', p_op_id, p_resultado);
end $$;
```

### 5.3 Acceso por correo (R8)

```
interno.correo_verificado() -> text                      -- correo de auth.users SOLO si email_confirmed_at is not null y no es anónimo
                                                         -- (NO user_metadata.email_verified: el usuario lo edita con updateUser)
mi_acceso(p_empresa)   [cualquier sesión; NO exige contrato ni membresía]
  si auth.uid() es null -> err('SIN_SESION', …)
  filas := miembros donde usuario_id = auth.uid()
  estado :=  'activo'                si alguna fila está 'activo'
             'acceso_revocado'       si no hay activas y alguna está 'baja'            <- SEÑAL EXPLÍCITA (única fuente: la fila 'baja')
             'invitacion_pendiente'  si no hay filas y existe una 'invitado' con correo = correo_verificado()
             'sin_acceso'            en cualquier otro caso (nunca tuvo fila)
  devuelve {ok:true, estado, usuario:{id, correo}, empresas:[{empresa_id, area, estado}], contrato:{actual, minimo},
            permisos: matriz_permisos()[area de la empresa elegida] }
  Jamás devuelve 'acceso_revocado' por: lista vacía de RLS, error, JWT vencido o falta de señal (esas no llegan a esta función).

reclamar_acceso()   [cualquier sesión]
  v_correo := correo_verificado()
  si null -> {ok:true, estado:'correo_no_verificado'}                          -- no vincula nada
  UPDATE miembros SET usuario_id = auth.uid(), estado = 'activo', reclamado_en = now()
   WHERE correo = v_correo AND estado = 'invitado' AND usuario_id IS NULL      -- una fila por empresa invitada
  si no actualizó nada:
       si existe fila (correo = v_correo, estado = 'activo', usuario_id <> auth.uid())
            -> err('ACCESO_CONFLICTO', 'Ese correo ya está vinculado a otra cuenta; que Dirección lo reactive.')   (Q-A16)
  anotar(nivel 'direccion', 'reclamo', 'miembro', correo, usuario_id = auth.uid())
  devuelve mi_acceso()                                                         -- idempotente: si ya estaba vinculada, solo la devuelve

miembro_alta(p_correo, p_area, p_nota, p_empresa)   [PREÁMBULO(dir)]
  correo := lower(btrim(p_correo)); validar regex y área -> DATO_INVALIDO
  fila := miembros(empresa, correo) FOR UPDATE
  caso fila:
     no existe      -> INSERT (estado 'invitado', usuario_id null, invitado_por = uid);                          accion 'alta'
     'invitado'     -> UPDATE area, nota                                                                         accion 'alta'
     'activo'       -> UPDATE area (si cambia es un cambio de área)                                              accion 'cambio_area'
     'baja'         -> estado := (usuario_id is null ? 'invitado' : 'activo'); baja_en/baja_por := null; area    accion 'reactivo'
  anotar(nivel 'direccion', accion, 'miembro', correo, antes {area, estado}, despues {area, estado})
miembro_cambiar_area(p_correo, p_area, p_empresa)   [PREÁMBULO(dir)]
  fila no existe o 'baja' -> NO_ENCONTRADO
  si fila es 'activo' direccion y p_area <> 'direccion' y NO queda otro Dirección activo -> DATO_INVALIDO 'Debe quedar al menos un Dirección activo.'
  UPDATE area; anotar(…'cambio_area'…, antes {area}, despues {area})           -- surte efecto en la SIGUIENTE petición: RLS y ctx() leen miembros en cada consulta
miembro_baja(p_correo, p_empresa)   [PREÁMBULO(dir)]
  fila no existe -> NO_ENCONTRADO; ya 'baja' -> {ok:true, sin_cambio:true}
  si es el último Dirección activo -> DATO_INVALIDO (nadie podría dar altas)
  UPDATE estado := 'baja', baja_en := now(), baja_por := uid                    -- la fila NO se borra: es la evidencia y la señal
  anotar(nivel 'direccion', 'baja', 'miembro', correo, quién lo hizo = usuario_id)
```

Efecto inmediato de una baja: la política `empresas_donde()` y `ctx()` consultan `miembros` en **cada** petición, así que el JWT que siga vigente (hasta 1 h) deja de leer y de escribir en el acto; lo que el teléfono recibe de las escrituras es `ACCESO_REVOCADO` (no definitivo: la bandeja se detiene **sin descartar**) y `mi_acceso()` dice `acceso_revocado`. Qué hace el teléfono con eso (los tres candados de [DEC Q-09]) está en §7.5.

### 5.4 La compuerta de sellos por campo (R3)

**Qué hace la base y qué no.** Hoy la regla «gana el cambio más reciente, dato por dato» está partida en tres sitios [C-14; M05 §0.4]: (a) producir sellos al guardar (`sellar`/`SELLO_DE_CAMPO`, `proyectos.js:529-540`; `sellosDeLaOperacion`, `puente.js:473`), (b) **el servidor decide al SUBIR** (`.gs:2881-2929`), (c) el cliente decide al BAJAR (`obraDeLaFila`, `puente.js:512-568`). Con una sola fuente de verdad, **la base ES el «servidor» de (b)** y absorbe de (c) lo que sobrevive sin bandeja local. Se queda en el cliente solo lo que depende de que el teléfono tenga **estado propio sin enviar** (`ocupados`: un cambio mío en la bandeja bloquea que baje el remoto). La tabla de traducción de reglas está al final de esta sección.

**Grupos y columnas** (los ocho de `SELLADAS`/`claveDeSello_`, `.gs:2019-2021`):

| Grupo | Columnas de `proyectos` | Borrable | Clave en la hoja (`COLUMNA_DEL_SELLO`, `puente.js:447-450`) |
|---|---|---|---|
| `etapa` | `etapa` | **no** | `Etapa de obra` |
| `notas` | `notas` | sí | `Notas` |
| `plazo_k` | `plazo_k` | sí | `Plazo taller` |
| `tel` | `tel` | sí | `Telefono` |
| `dir_texto` | `dir_texto` | sí | `Direccion` |
| `ubicacion` | `lat`, `lng`, `maps_url`, `geo_fuente` | sí | `Ubicacion` |
| `entrega` | `entrega` | **no** | `Entrega` |
| `instalacion` | la cita (`fecha`, `hora`, y su cancelación) en `instalaciones` | — (cancelar es un estado) | `Fecha instalacion` (comparte con `Hora instalacion`) |

**SQL exacto de la compuerta** (`immutable`, sin acceso a tablas: se prueba como función pura):

```sql
create function interno.sello_valido(p_x jsonb, p_ahora_ms bigint) returns bigint
language plpgsql immutable set search_path = '' as $$
declare n numeric;
begin
  if p_x is null or jsonb_typeof(p_x) not in ('number','string') then return 0; end if;
  begin n := floor((p_x #>> '{}')::numeric); exception when others then return 0; end;
  if n is null or n in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) or n <= 0 then return 0; end if;   -- Number(x) no finito o ≤ 0 => 0
  return least(n, (p_ahora_ms + 600000)::numeric)::bigint;                                                          -- tope: ahora + 10 min (`.gs:2024-2029`)
end $$;

create function interno.compuerta(p_tiene bigint, p_sellos_op jsonb, p_grupo text, p_ahora_ms bigint,
                                  p_vacio boolean, p_borrable boolean)
returns table (accion text, sello_nuevo bigint, motivo text)
language plpgsql immutable set search_path = '' as $$
declare v_tiene bigint := coalesce(p_tiene, 0);
        v_llega bigint := interno.sello_valido(p_sellos_op -> p_grupo, p_ahora_ms);
begin
  if v_tiene > 0 and v_llega < v_tiene then                    -- `.gs:2901`: ESTRICTO; un sello IGUAL al guardado SÍ escribe
    return query select 'viejo'::text, v_tiene, 'ya tenía un cambio más reciente'::text; return;
  end if;
  if p_vacio and v_llega = 0 then                              -- `obraDeLaFila`: «vacío sin sello no borra»
    return query select 'rechazar'::text, v_tiene, 'vacío sin sello no borra'::text; return;
  end if;
  if p_vacio and not p_borrable then                           -- `obraDeLaFila`: etapa y entrega jamás se vacían
    return query select 'rechazar'::text, v_tiene, 'este dato no se puede vaciar'::text; return;
  end if;
  return query select 'escribir'::text, greatest(v_tiene, v_llega), null::text;   -- `.gs:2905`: el sello sube solo si llega > tiene
end $$;
```

**Pseudocódigo de la RPC `proyecto_actualizar`** (el de `mover_etapa` e `instalacion_guardar` usa la misma compuerta con su grupo):

```
p_op = { id:'proy-…', op_id:'op-…', campos:{ notas, tel, dir_texto, lat, lng, maps_url, geo_fuente, entrecalles, ubicacion_pendiente,
         entrega, plazo_k, contacto, negocio, tipo_trabajo, compromiso_texto, fecha_anticipo, origen },
         sellos:{ notas:ms, tel:ms, dir_texto:ms, ubicacion:ms, entrega:ms, plazo_k:ms } }          -- el sello viaja por GRUPO
PREÁMBULO(dir, fab, pag)
p := SELECT * FROM proyectos WHERE empresa_id = c.empresa_id AND id = p_op.id AND deleted_at IS NULL FOR UPDATE   -- el candado de fila serializa a dos teléfonos
si no existe -> NO_ENCONTRADO
ahora := interno.ahora_ms();  escritos, viejos, rechazadas := []
1. PERMISO POR CAMPO (matriz §5.1), antes de escribir: campo desconocido, de dinero, `etapa`, `id`, `empresa_id`, `folio_*`, `sub`, `neto`, `iva`, `precio_auth`… ->
      rechazadas += {nombre, por:'el rol X no puede escribir esta propiedad'}  (BLOQUEADOS, `proyectos.js:963-978`); NO aborta el resto
2. por cada GRUPO sellado g presente (notas, tel, dir_texto, ubicacion, entrega, plazo_k):
      si p_op.sellos no es un OBJETO                    -> DATO_INVALIDO 'Faltan los sellos'   (Q-A05: ENDURECE; hoy una op sin `sellos` se sella con la hora de llegada y GANA SIEMPRE, `.gs:2891,2899`, lo que dejaba a un reintento tardío del cotizador regresar la etapa [P-08])
                                                          con el objeto presente, la clave de g que falte VALE 0 y decide la compuerta (viejo si ya hay sello guardado; escribe sin crear sello si no: SE-04, SE-15, SE-16)
      v := valor normalizado del grupo
            tel: telefono_limpio(); si inválido -> rechazadas {nombre:'tel', por:'un teléfono lleva dígitos…'}
            ubicacion: lat y lng ambos o ninguno, |lat|≤90, |lng|≤180, no (0,0); vacío = lat, lng nulos y maps_url vacío
            plazo_k: 1..5 o null; entrega: una de 3; notas ≤ 40000; dir_texto ≤ 2000
      vacio := (texto: btrim = '' ; plazo_k: null ; ubicacion: vacía ; entrega: null/'')
      (accion, sello, motivo) := interno.compuerta(p.sellos ->> g, p_op.sellos, g, ahora, vacio, borrable(g))
      'viejo'    -> viejos     += {nombre:g, por:motivo}           -- NO es error: otro teléfono lo cambió después y gana
      'rechazar' -> rechazadas += {nombre:g, por:motivo}
      'escribir' -> escritos += g ; aplicar v ; p.sellos[g] := sello
3. campos SIN sello (entrecalles, ubicacion_pendiente, contacto, negocio, tipo_trabajo, compromiso_texto, fecha_anticipo): se validan y se escriben (último en llegar gana, igual que `.gs`)
4. `origen` (solo Dirección): (obra, dinero) := partir_origen(valor): origen_obra := obra; ventas_dinero.origen_dinero := dinero
5. si no hay nada que escribir -> {ok:true, escritos:[], viejos, rechazadas, remoto: fila vigente}   -- «ya está, y lo que hay es más nuevo» (`.gs:2908-2916`)
6. UPDATE proyectos (solo las columnas que CAMBIARON de verdad: «volver a guardar la misma nota no la vuelve la más reciente», `proyectos.js:1066-1067`)
7. anotar(nivel 'general', 'cambio', 'proyecto', p.id, …) con la lista de campos y SIN importes
8. devolver {ok:true, escritos, viejos, rechazadas, remoto: <fila de proyectos como quedó; jamás ventas_dinero>}
```

**Traducción de las reglas del servidor (`.gs:2881-2929`) y de `obraDeLaFila` (`puente.js:512-568`):**

| Regla actual | En la base | Dónde |
|---|---|---|
| `selloValido_`: `floor`, tope `ahora+10 min`, `0` si no es número > 0 | igual | `sello_valido` |
| `tiene && llega < tiene` ⇒ no escribe, devuelve en `viejos` (no es error) | igual; la respuesta es `ok:true` con `viejos` y `remoto` | `compuerta` |
| **Empate al subir ESCRIBE** (`<` estricto) | igual | `compuerta` |
| `llega = 0` solo escribe donde la celda tampoco tiene sello y no crea sello | un valor **no vacío** con `llega=0` y `tiene=0` escribe y no crea sello (`greatest(0,0)=0`); con `tiene>0` cae en `viejo` | `compuerta` |
| `Hora instalacion` comparte el sello de `Fecha instalacion` | un solo grupo `instalacion` | `instalacion_guardar` |
| Op **sin** `sellos` ⇒ `llega = ahora` (gana siempre) | **ya no**: `DATO_INVALIDO` (`Q-A05`) | RPC |
| Al bajar, **empate gana lo local** (`hs > ls`) | **no aplica**: no hay «lo local» en la base; el empate escribe (regla de subir) | — |
| Vacío solo borra si trae sello **y** el grupo es borrable; `etapa` y `entrega` nunca | igual (`p_vacio`, `p_borrable`) | `compuerta` |
| Valor sin sello y no vacío = «antiquísimo» (`hs = 1`) | solo en la **importación** (un dato sin sello queda con sello 0) | importador |
| `ocupados` (cambio mío pendiente en la bandeja bloquea lo remoto) | **se queda en el cliente** | cliente |
| `alEditar`: borrar a mano **quita** el sello; teclear sella con la hora de la hoja | **desaparece** (la hoja es solo lectura); `alEditar` se apaga o queda inocuo (Q-10) | espejo |
| Dinero no se sella: la hoja baja siempre | el dinero tampoco se sella; la última RPC gana y todo queda en `bitacora` | RPC de Pagos |

**Casos de prueba de la compuerta** (SE-01..SE-24, completos en §10; fijan [M02 §4; M05 §4.7], adaptados: «local» = lo guardado en la base, «op» = el cambio que llega). Parten de `proyecto = {etapa:'cortado', notas:'mía', plazo_k:2, tel:'33 1', dir_texto:'Calle 1', lat:20.1, lng:-103.1, entrega:'instalacion', sellos:{etapa:100, notas:100, tel:100}}`:

| Op (sellos) | Resultado esperado |
|---|---|
| `etapa:'armado'` (200), `notas:'de la hoja'` (50), `tel:'33 9'` (200) | etapa y tel se escriben (sellos 200 y 200); `notas` va a `viejos` (50 < 100); `sellos.notas` sigue 100 |
| `notas:'otra'` con sello **100** (igual al guardado) | **se escribe** (empate escribe); `sellos.notas` queda 100 |
| `notas:''` con sello 300 | borra (`notas=''`, sello 300) |
| `notas:''` **sin** sello para `notas` (op trae `sellos` pero no esa clave) | `viejo` (llega 0 < tiene 100) |
| `notas:''` sobre proyecto **sin** sello de notas, sin sello en la op | `rechazar` («vacío sin sello no borra») |
| `etapa:null` (300) / `entrega:null` (300) | `rechazar` («no se puede vaciar»); nada cambia |
| sello de la op = `ahora + 1 h` | se **acota** a `ahora + 10 min` y ese es el que queda guardado |
| op sin objeto `sellos` y con campos sellados | `DATO_INVALIDO` definitivo |
| `plazo_k:null` (400) | borra (vuelve al propuesto), sello 400 |
| mismo valor, sello más nuevo | no cambia el valor, **sí** sube el sello (converge, como `obraDeLaFila`: «`igual` no impide subir el sello local»); como cambia `sellos`, sube `updated_at` |
| mismo valor, mismo sello (reintento) | no cambia nada: **ni** `sellos` **ni** `updated_at` (no hay escritura) |

### 5.5 ganar_proyecto, descartar_cotizacion, alta_venta

```
ganar_proyecto(p_op, p_empresa)         [PREÁMBULO(dir)]
 p_op = { id, folio_global, folio_local, dispositivo,
          entrada:{…entrada del historial completa…},                         -- se parte con partir_origen (§4.5); la base no confía en que el cliente la haya partido
          nombre, contacto, negocio, tel, tipo_trabajo[], fecha_anticipo, compromiso_texto, dir_texto, entrecalles, maps_url,
          lat, lng, geo_fuente, ubicacion_pendiente, entrega, plazo_k, notas,
          venta:{ sub, neto, anti, iva, cuenta, estatus, pct_comision, precio_auth, liquidacion?, fecha_liquidacion? },
          fecha_instalacion?, hora?, instalacion_id?,
          sellos:{ etapa, tel, dir_texto, ubicacion, entrega, plazo_k? }, op_id }
 validar: id (regex), folio_global (regex), nombre no vacío, venta.sub numérico, cuenta ∈ 5 o null, estatus ∈ 4 (def. 'FABRICACION'), venta.anti ≥ 0
 pg_advisory_xact_lock(hashtextextended(empresa || ':' || folio_global, 0))                          -- serializa dos «Se ganó» de la misma cotización
 e := proyectos(empresa, folio_global)
 si e existe:  e.id = p_op.id -> {ok:true, ya_existia:true, proyecto_id, folio_hoja}                  -- reintento idempotente: NO mueve la etapa [P-08]
               e.id ≠ p_op.id -> err('DUPLICADO', 'Esa cotización ya es un proyecto', {proyecto_id: e.id})   (`yaExiste`, `proyectos.js:643-654`)
 si existe proyectos.id = p_op.id -> DATO_INVALIDO
 (obra, dinero) := partir_origen(entrada)
 folio_hoja := interno.folio_texto('V', interno.siguiente(empresa,'V','',1))                          -- nunca se reparte dos veces; V-001…V-999, V-1000… (§2.1)
 INSERT proyectos (…, fuente 'cotizacion', historica false, etapa 'ganado', folio_hoja, folio_global, fecha_anticipo = coalesce(op, hoy_mx()),
                   estatus, iva = venta.iva, sellos = clamp(op.sellos) con sello_valido, origen_obra = obra, creado_por = uid)
 INSERT ventas_dinero (subtotal = venta.sub, anticipo = venta.anti, cuenta, pct_comision = coalesce(venta.pct_comision, 10),
                       precio_auth = venta.precio_auth, origen_dinero = dinero || {venta:{sub,neto,anti,iva,precio_auth}},
                       liquidacion = venta.liquidacion (modal con estatus LIQUIDADO: max(0, neto − anti)), fecha_liquidacion)
 interno.normalizar_iva(id)
 si fecha_instalacion: INSERT instalaciones (id = op.instalacion_id, estado 'confirmada', ventana 'dia', duracion_min 180, uid_ics derivado) y sellos.instalacion
 anotar(general,'gano','proyecto', id, 'Se ganó <nombre>', sin importes)  y  anotar(dinero,'gano','venta', id, …, despues {subtotal, anticipo, cuenta, estatus, precio_auth})
 devolver {ok:true, proyecto_id, folio_hoja}

descartar_cotizacion(p_op, p_empresa)   [PREÁMBULO(dir)]                -- la «lápida» (`proyectos.js:739-793`)
 p_op = { id, folio_global, folio_local, dispositivo, entrada, nombre, motivo, sellos:{etapa} }
 si existe proyecto con ese folio_global: lápida con el mismo id -> ok idempotente; si no -> DUPLICADO
 INSERT proyectos (fuente 'cotizacion', etapa 'cancelado', folio_hoja NULL, notas = motivo, origen_obra = partir_origen(entrada).obra, sellos.etapa)
 NO se crea ventas_dinero (no es una venta: «un alta metía en el libro un subtotal, un anticipo que nunca se cobró y una comisión pendiente», `.gs:2807-2811`)
 anotar(general,'descarto','proyecto', id, …)

alta_venta(p_op, p_empresa)             [PREÁMBULO(dir, pag)]            -- el menú «Registrar nueva venta» de la hoja (`.gs:1424-1579`)
 p_op = { id, nombre, cuenta, estatus?, tipo_trabajo[], subtotal, anticipo?, fecha_anticipo?, fecha_instalacion?, hora?, tel, entrega,
          dir_texto?, maps_url?, lat?, lng?, notas?, plazo_k?, sellos }
 validar como el diálogo: nombre; cuenta ∈ 5 (obligatoria; el diálogo la propone `Elias BBVA`); estatus def. FABRICACION; subtotal numérico;
          anticipo ≥ 0; tel con ≥ 10 dígitos y entrega OBLIGATORIOS
 INSERT proyectos (fuente 'manual', historica false, etapa 'ganado', folio_local = folio_hoja, dispositivo = '', iva = (cuenta <> 'Elias BBVA'), …)
 INSERT ventas_dinero ; si fecha_instalacion: INSERT instalaciones (estado = 'confirmada' si Dirección, 'propuesta' si Pagos)
 interno.normalizar_iva(id) ; anotar(general/dinero)
 devolver {ok:true, proyecto_id, folio_hoja}
```

### 5.6 mover_etapa, salidas de material y las dos transiciones automáticas (R5)

**Permiso (Q-05) — se IMPONE en la base; el servidor de hoy es permisivo y la regla solo vive en el cliente (`TOPE_ROL`, `proyectos.js:1116`) [C-10]:**

| Área | Origen | Destino | Resultado |
|---|---|---|---|
| Dirección | cualquiera (incluso `cancelado`, `garantia`) | cualquiera (incluso `cancelado`) | permitido («resucitar» un cancelado también) |
| Fabricación | `ganado…listo` | `ganado…listo` | permitido (también retroceder **dentro** del rango) |
| Fabricación | `ganado…listo` | `instalado`, `garantia`, `cancelado` | `ROL_SIN_PERMISO` |
| Fabricación | `instalado`, `garantia`, `cancelado` | cualquiera | `ROL_SIN_PERMISO` (**endurece**: hoy `puedeMover` mira solo el destino y deja «regresar» un `instalado`, `proyectos.js:1121-1127`) |
| Pagos | cualquiera | cualquiera | `ROL_SIN_PERMISO` (Pagos mueve `estatus`, el otro eje) |

```
mover_etapa(p_proyecto, p_etapa, p_sello, p_motivo, p_empresa)   [PREÁMBULO(dir, fab)]
 p_etapa ∉ 8 etapas -> DATO_INVALIDO
 p := proyectos(id) FOR UPDATE (no borrado)  / NO_ENCONTRADO
 permiso: según la tabla de arriba (orden_etapa(origen) y orden_etapa(destino) en 0..4 para Fabricación) -> ROL_SIN_PERMISO
 si p.folio_hoja es null (una lápida) -> DATO_INVALIDO 'Una cotización que no se dio no cambia de etapa.'        -- Q-A23: sacarla de `cancelado` violaría `proyectos_libro`
 si p.etapa = p_etapa -> {ok:true, sin_cambio:true}                                 -- el doble toque de un dedo
 (accion, sello, motivo) := interno.compuerta(p.sellos ->> 'etapa', jsonb_build_object('etapa', p_sello), 'etapa', ahora, false, false)
 si p_sello es null -> DATO_INVALIDO (Q-A05) ; si 'viejo' -> {ok:true, viejos:[{nombre:'etapa', por:motivo}], remoto}
 r := interno.mover_etapa_core(p, p_etapa, sello, 'manual', p_motivo)
 devolver {ok:true, etapa:p_etapa, salidas:r.salidas, remoto: fila de proyectos}      -- sin dinero

interno.mover_etapa_core(p, p_etapa, sello, origen_mov, nota) -> (salidas int)
 cruza_corte := orden_etapa(p_etapa) >= 2 AND (orden_etapa(p.etapa) IS NULL OR orden_etapa(p.etapa) < 2)
                -- «alcanzar» y no «tocar»: ganado→listo también emite; desde garantia/cancelado (orden NULL) hacia cortado+ TAMBIÉN cruza (`proyectos.js:1252-1253`)
 UPDATE proyectos SET etapa = p_etapa, sellos = sellos || {etapa: sello}
 si cruza_corte: salidas := interno.emitir_salidas(p, origen_mov, nota)
 anotar(general, 'etapa', 'proyecto', p.id, '<nombre> pasó a / regresó a <Etapa>', detalle 'Estaba en …' + salidas, antes {etapa}, despues {etapa})   -- «regresó a» si orden baja

interno.emitir_salidas(p, origen_mov, nota) -> int          -- idempotente por 'mov-salida:' || req.id (`proyectos.js:1129-1210`)
 para cada requerimiento r de p (estado NOT IN ('consumido','descartado'): los descartados no se pintan, `material.js:1030`), orden por material_id:
    cant := coalesce(r.cantidad_ajustada, r.cantidad_compra);  si no (cant > 0) -> continuar     -- una línea en cero no se emite ni desaparece
    INSERT almacen_movimientos (id = 'mov-salida:' || r.id, tipo 'salida', cantidad = −cant, unidad_compra = r.unidad_compra,
          origen = origen_mov, nota, proyecto_id = p.id, requerimiento_id = r.id, usuario = correo, rol = área, dispositivo = 'srv',
          firma = correo || ' · ' || área || ' (srv)', ts = ahora_ms(), usuario_id = uid)
          ON CONFLICT (empresa_id, id) DO NOTHING                    -- si otro teléfono (o una llamada anterior) ya la emitió: «ya estaba», solo se marca
    UPDATE requerimientos SET estado = 'consumido', sellos = sellos || {estado: ahora_ms()} WHERE (empresa_id, id) = r     -- uno por uno, como el cliente
    si el INSERT insertó -> salidas++
 devolver salidas

emitir_salidas_derivadas(p_hoy, p_empresa)   [PREÁMBULO(dir, fab, pag)]          -- la «degradación» (`proyectos.js:1297-1325`); la llamaba `reglas.js` desde cualquier teléfono
 dia := coalesce(p_hoy, hoy_mx())
 para cada proyecto p con una instalación NO cancelada, no borrada, con (fecha − dia) ≤ 1 (mañana o ANTES: el sesgo es el falso positivo) y p.etapa ≠ 'cancelado':
     emitir_salidas(p, 'derivado', 'Derivado, nunca confirmado: se instala <fecha> y nadie marcó el corte.')      -- NO mueve la etapa
 devolver {ok:true, proyectos, movimientos}
```

**Las dos transiciones automáticas de etapa** [C-10; M09 §1.5] — reglas de la RPC, no se pierden:

| Transición | Disparador | Regla exacta | Efecto |
|---|---|---|---|
| (1) instalación `hecha` ⇒ `instalado` | `instalacion_guardar` con `estado='hecha'` | si el que llama es **Dirección** y `orden_etapa(p.etapa) < 5` ⇒ `mover_etapa_core(p,'instalado')` (si cruza el corte, emite salidas). Con Fabricación el proyecto **se queda donde está** (`agenda.js:442-452`) | `bitacora` general |
| (2) cobro ⇒ `instalado` en filas importadas | cualquier cambio de `estatus` a `COBRANDO`/`LIQUIDADO` (`registrar_cobro`, `corregir_venta`, importación) | si `fuente in ('hoja','manual')`, **no** `historica` y `orden_etapa(p.etapa) between 0 and 4` ⇒ `etapa := 'instalado'` **sin** emitir salidas (el cliente lo hacía «solo de este lado, sin encolar», `puente.js:1946,2012-2016`) y sellando `etapa` con la hora del servidor (`Q-A12`: así una op vieja de la bandeja no puede revertirla) | `bitacora` general |

### 5.7 Pagos en la base (R6, Q-01)

La plataforma **no tiene hoy** captura de liquidación, abono de comisión, reparto FIFO ni corrección de anticipo/subtotal/nombre: solo existen como menús del `.gs` o edición a mano [C-04; M02 §5.5]. Aquí nacen como RPC con las reglas dentro. **Las pantallas no entran en esta rama** [DEC Q-01]; la hoja no pasa a solo lectura hasta que existan y haya siete días de cuadre.

Utilidades de dinero (SQL, `immutable`, las usa la vista y las RPC para que haya **una sola** aritmética):

```sql
create function interno.neto(p_subtotal numeric, p_iva boolean) returns numeric language sql immutable set search_path = '' as $$
  select round(coalesce(p_subtotal, 0) * (1 + case when p_iva then 0.16 else 0 end), 2) $$;                     -- H
create function interno.comision(p_subtotal numeric) returns numeric language sql immutable set search_path = '' as $$
  select round(coalesce(p_subtotal, 0) * 0.10, 2) $$;                                                          -- R: 10 % FIJO del SUBTOTAL; no lee pct_comision
create function interno.pesos(n numeric) returns text language sql immutable set search_path = '' as $$
  select '$' || pg_catalog.to_char(round(n, 2), 'FM999,999,999,990.00') $$;                                    -- `pesos()` del .gs:1338
```

```
interno.normalizar_iva(p_proyecto)       -- «el IVA lo manda la cuenta» (`normalizarIvaActivos`, .gs:1057-1067; `ivaDeCuenta`, .gs:1043)
  si ventas_dinero.cuenta IS NOT NULL y proyectos.estatus IS DISTINCT FROM 'LIQUIDADO':
       iva := (cuenta <> 'Elias BBVA')          -- 'Elias BBVA' no factura; cualquier otra sí
       si difiere: UPDATE proyectos SET iva
  -- una venta LIQUIDADA o sin cuenta NO se toca (el histórico no se reescribe).  Lo llaman ganar_proyecto, alta_venta, corregir_venta, registrar_cobro.
  -- NO lo llama la importación: las filas importadas conservan su F tal cual; la vista las marca con «IVA no corresponde a la cuenta» (X).

registrar_cobro(p_proyecto, p_monto, p_fecha, p_liquidar, p_op_id, p_empresa)     [PREÁMBULO(dir, pag)]   -- «Registrar un cobro» (`.gs:1644-1670`)
  p_monto nulo o ≤ 0 -> DATO_INVALIDO 'Un cobro es un importe mayor a cero; para corregir usa corregir_venta'      (Q-A07: el formulario no validaba el signo)
  p := proyectos(id, libro) FOR UPDATE ;  d := ventas_dinero FOR UPDATE ;  NO_ENCONTRADO si no es una venta del libro
  si p_op_id: r := bitacora(empresa, op_id = 'cobro:' || p_op_id).resultado  -- DESPUÉS de tener el candado de la fila: dos reintentos concurrentes no pasan juntos
              si existe -> devolver r                                       -- idempotente: Liquidación es ACUMULATIVA, un reintento sin esto la sumaría dos veces
  antes := {liquidacion, fecha_liquidacion, estatus}
  d.liquidacion := d.liquidacion + p_monto                                  -- numeric exacto (la hoja sumaba doubles)
  d.fecha_liquidacion := coalesce(p_fecha, interno.hoy_mx())                -- Q-A07 (la hoja solo la escribía si el formulario la mandaba; siempre la manda)
  si p_liquidar: p.estatus := 'LIQUIDADO' ; transición automática (2) de §5.6
  si no: interno.normalizar_iva(p.id)
  saldo := interno.neto(d.subtotal, p.iva) - d.anticipo - d.liquidacion  (redondeado a 2)             -- K
  anotar(dinero, 'cobro', 'venta', p.id, 'Cobro de <pesos(p_monto)> registrado en <folio>', antes, despues, op_id := 'cobro:'||p_op_id, resultado := respuesta)
  devolver {ok:true, liquidacion, saldo, estatus, fecha_liquidacion}        -- «Queda en ceros» si saldo ≤ 0.004

registrar_abono_comision(p_proyecto, p_monto, p_fecha, p_nota, p_op_id, p_empresa)   [PREÁMBULO(dir, pag)]    -- puente: `registrarAbonoDesdePuente` (`.gs:3076-3088`)
  p_monto nulo, no > 0 o ≥ 1e7 -> DATO_INVALIDO 'un abono de comisión va en positivo y es de menos de $10,000,000' (`.gs:2976`); los negativos son corregir_abono
  p := proyectos(id, libro) / NO_ENCONTRADO ;  pg_advisory_xact_lock(hashtextextended(empresa||':fifo', 0))   -- serializa con el reparto y con otros abonos
  si existe abonos(empresa, op_id = p_op_id, folio) -> devolver lo mismo
  INSERT abonos (folio_hoja = p.folio_hoja, importe = p_monto, fecha = coalesce(p_fecha, hoy_mx()),         -- Q-A08: `date`; el puente guardaba `new Date()` con hora y «Comisiones por periodo» (`D <= TODAY()`) lo excluía hasta el día siguiente
                 nota = coalesce(nullif(btrim(p_nota),''), 'Registrado desde la plataforma'), tipo 'abono', op_id, registrado_por = uid)
  devolver {ok:true, importe, abonado: S, restante: T}                       -- T puede quedar negativo: «Comisión pagada de más» la marca la vista (no se impide)

repartir_abono_fifo(p_monto, p_fecha, p_nota, p_op_id, p_empresa)   [PREÁMBULO(dir, pag)]     -- `guardarRepartoConCandado_` (`.gs:4928-4958`)
  p_monto nulo o ≤ 0 -> DATO_INVALIDO 'Escribe un importe mayor a cero.'
  pg_advisory_xact_lock(hashtextextended(empresa||':fifo', 0))
  si existen abonos con (empresa, op_id = p_op_id) -> devolver el mismo reparto (leyendo esos renglones)
  lista := SELECT folio, nombre, pend FROM comisiones_pendientes WHERE empresa ORDER BY numero_folio ASC        -- pend = T redondeado > 0.004; «el folio es cronológico»
  lista vacía -> DATO_INVALIDO 'No hay comisiones pendientes que abonar.'
  resta := round(p_monto, 2)
  para cada fila de lista MIENTRAS resta > 0.004:                                                                   -- `calcularReparto` (`.gs:4861-4878`)
      toca := round(least(resta, pend), 2);   resta := round(resta - toca, 2);   guardar {folio, nombre, pend, abono: toca, queda: round(pend - toca, 2)}
  pago_id := interno.folio_texto('P', interno.siguiente(empresa,'P','',1))                                           -- la hoja desbordaba a «P-000» al llegar a 1000: aquí sale P-1000
  nota := (p_nota<>'' ? p_nota || ' · ' : '') || 'Reparto ' || pago_id || ' de ' || interno.pesos(p_monto)
  INSERT abonos (un renglón por proyecto: importe = abono, fecha = coalesce(p_fecha, hoy_mx()), nota, pago_id, tipo 'reparto', op_id)   -- TODOS o ninguno (una transacción)
  devolver {ok:true, pago_id, repartido:[…], sobrante: resta, repartido_total}          -- lo que sobra NO se aplica

vista_previa_reparto(p_monto, p_empresa)   [PREÁMBULO(dir, pag)]      -- `vistaPreviaReparto`: el mismo cálculo, sin escribir
  devolver {ok:true, filas:[{folio, nombre, pend, abono, queda}], sobrante, total_pendiente, cuantas}

corregir_venta(p_proyecto, p_cambios, p_empresa)   [PREÁMBULO(dir, pag)]                 -- lo que Pagos hace «a mano» en la hoja (`proyectos.js:1346-1349`)
  p_cambios: objeto con claves de la matriz §5.1; vacío -> DATO_INVALIDO
  p, d := FOR UPDATE ; NO_ENCONTRADO
  por cada clave: fuera de la matriz del área -> rechazadas {nombre, por:'el rol X no puede escribir esta propiedad'} (no aborta el resto)
     validar (valores ABSOLUTOS, por eso es idempotente): subtotal número finito (puede ser negativo); anticipo y liquidacion ≥ 0
       («un anticipo o una liquidación negativos son dinero que “sale” de una venta», `.gs:3006-3008`); cuenta ∈ 5 y no nula; estatus ∈ 4;
       fecha_liquidacion `YYYY-MM-DD` o null; pct_comision 0..100 o null; nombre no vacío ≤ 2000;
       iva: solo Dirección y solo si quedará (estatus LIQUIDADO o sin cuenta)
  aplicar; interno.normalizar_iva(p.id)
  si estatus pasó a COBRANDO/LIQUIDADO -> transición automática (2)
  anotar(dinero, 'cambio', 'venta', p.id, 'Se corrigió …', antes, despues SOLO de lo que cambió)
  devolver {ok:true, escritos, rechazadas, venta:{nombre, subtotal, anticipo, liquidacion, cuenta, estatus, iva, fecha_liquidacion, pct_comision}}

corregir_abono(p_proyecto, p_monto, p_nota, p_fecha, p_op_id, p_empresa)   [PREÁMBULO(dir)]     -- lo que hoy se hace «a mano en la pestaña, aquí sí se admiten negativos»
  p_monto = 0 o |p_monto| ≥ 1e7 -> DATO_INVALIDO ; p_nota vacía -> DATO_INVALIDO (la corrección se explica)
  INSERT abonos (tipo 'correccion', importe = p_monto) con el mismo candado y la misma idempotencia por op_id

comisiones_cobradas(p_desde, p_hasta, p_empresa)   [PREÁMBULO(dir, pag)]      -- «Comisiones por periodo» (`.gs:5037-5100`); `desde/hasta` INCLUSIVOS
  devolver {cobrado:  SUM(importe)                          WHERE fecha BETWEEN desde AND hasta                  -- A10: SIN filtro de folio
            abonos:   COUNT(*)                              WHERE fecha BETWEEN … AND folio_hoja <> ''           -- B10
            proyectos:COUNT(DISTINCT folio_hoja)            WHERE fecha BETWEEN …                                -- C10
            depositos:COUNT(DISTINCT coalesce(pago_id,''))  WHERE fecha BETWEEN … AND folio_hoja <> ''           -- D10: un renglón sin «Pago» cuenta como UN valor distinto, como UNIQUE(FILTER(…))
            promedio: cobrado / abonos si abonos > 0, si no 0}                                                   -- E10
  un abono sin fecha no aparece en ningún periodo (ni «Todo»)
```

### 5.8 `instalacion_guardar` (cita, UID y coupling con la etapa)

```
instalacion_guardar(p_op, p_empresa)     [PREÁMBULO(dir, fab)]                  -- Pagos: ROL_SIN_PERMISO («Pagos no toca la agenda», `agenda.js:210-217`)
 p_op = { id, proyecto_id, fecha, hora, ventana, duracion_min, estado?, anexo?, notas? (solo al crear), sello }
 p := proyectos(proyecto_id) FOR UPDATE ; NO_ENCONTRADO
 p.etapa = 'cancelado' y estado ≠ 'cancelada' -> DATO_INVALIDO 'No se agenda un proyecto cancelado'
 validar: fecha date; hora null o HH:MM (1-2 dígitos de hora, normaliza); ventana ∈ {dia, noche, madrugada} ('manana'/'tarde' heredadas ⇒ 'dia'); duracion_min 1..600; estado ∈ 5;
          p_op.sello nulo -> DATO_INVALIDO (Q-A05, también al crear la cita)
 e    := instalaciones(empresa, id = p_op.id)
 viva := instalación del proyecto con estado <> 'cancelada' y deleted_at IS NULL
 CASO A — no existe e:
     si viva existe -> aplicar CASO B sobre `viva` con los datos de p_op y devolver {ok:true, instalacion:{…viva…}, id_canonico: viva.id}
                       («agendar sobre un proyecto que ya tiene una viva REAGENDA la existente», `agenda.js:259-274`)
     estado := (área = 'direccion' ? 'confirmada' : 'propuesta')           -- el cliente no elige el estado inicial (`agenda.js:219`)
     INSERT (id, uid_ics := 'inst-' || id || '@al3d.mx', movida 0, notas)   -- la cita nueva siembra proyectos.sellos.instalacion con p_op.sello (clamp) vía compuerta
 CASO B — existe e:
     cambio_cita := (fecha, hora) difieren ;  cambio := cambio_cita OR (ventana, duracion_min) difieren
     si cambio_cita o estado pasa a 'cancelada': compuerta(p.sellos ->> 'instalacion', {instalacion: p_op.sello}, 'instalacion', ahora, false, true)
          'viejo' -> {ok:true, viejos:[{nombre:'instalacion', por}], instalacion: vigente}      -- otro teléfono la movió después
          p_op.sello nulo -> DATO_INVALIDO (Q-A05)
     movida := e.movida + (cambio ? 1 : 0)  +  (estado pasa de ≠'cancelada' a 'cancelada' ? 1 : 0)   -- «cancelar SUBE movida» (`agenda.js:412-415`); nunca baja
     estado := p_op.estado, o 'reagendada' si cambió la cita y no vino estado (salvo que ya sea 'hecha': se queda 'hecha')
     notas := e.notas || E'\n' || p_op.anexo                                 -- «registro acumulativo»: el cliente manda el RENGLÓN nuevo, no el texto entero (dos teléfonos no se pisan)
     UPDATE; proyectos.sellos.instalacion := greatest(…)
 acoplamiento instalación ↔ etapa (transición automática 1): si estado resultante = 'hecha' Y área = 'direccion' Y orden_etapa(p.etapa) < 5
     -> interno.mover_etapa_core(p, 'instalado', ahora, 'manual', 'Instalación hecha')      -- con Fabricación se queda en 'listo'
 anotar(general, 'agendo'|'reagendo'|'marco'|'cancelo', 'instalacion', e.id, …)
 devolver {ok:true, instalacion:{…fila…}, viejos}
```

La base **impide** (CHECK/índice/trigger): `uid_ics ≠ 'inst-'||id||'@al3d.mx'`, `proyecto_id` distinto del original, `movida` que baje, **dos instalaciones vivas del mismo proyecto**. Ya no hace falta `sello_hoja`/`sello_hoja_en`.

### 5.9 Almacén: `almacen_aplicar`, `constante_guardar` (R5, H1–H10)

El `.gs` hace aquí ~60 reglas de escritura (`.gs:5535-5743`); **no es CRUD** [C-16; M03 H3]. Un upsert + RLS perdería «`consumido` no vuelve atrás» y «un cambio atrasado no pisa».

```
almacen_aplicar(p_ops, p_atomico, p_empresa)        [PREÁMBULO(dir, fab, pag)]
 p_ops = [ { id:'op-…', almacen:'movimientos'|'materiales'|'requerimientos', tipo:'apendice'|'crear'|'actualizar',
             registro_id, datos:{…registro completo SIN 'sync'…}, campos:[…]|null }, … ]        -- ≤ 25 ops (`ALM_OPS_MAX`); más -> DATO_INVALIDO
 para cada op EN ORDEN, cada una en su subtransacción (BEGIN … EXCEPTION WHEN OTHERS):          -- una que truena no se lleva a las demás
     r := interno.almacen_una(c, op)                         -- {id, ok:true, creada?, ya_estaba?, sin_cambio?, viejos:[campo…]} | {id, ok:false, codigo, mensaje}
 si p_atomico y alguna r.ok = false -> deshacer TODO (bloque externo BEGIN/EXCEPTION) y devolver {ok:false, codigo:'LOTE_RECHAZADO', op_fallida, mensaje}
        -- «la compra recibida (diez renglones) entra completa o no entra» (`stock.js:754-810`) [M03 H10]
 devolver {ok:true, resultados:[…]}

interno.almacen_una(c, op):
 1. op.id (≤ 200, no vacío), op.almacen ∈ 3, op.datos objeto -> si no DATO_INVALIDO
 2. PERMISO por área (`almPermiso_`, `.gs:5537-5553`), ANTES de mirar nada:
      Dirección, Fabricación: todo.     Pagos: movimientos solo si datos.origen = 'derivado' Y datos.tipo = 'salida'  («derivado» no le abre `entrada`);
                                         requerimientos solo si op.campos es un arreglo NO vacío ⊆ {estado, folio_hoja} Y datos.estado = 'consumido';
                                         materiales: nunca.        -> si no: ROL_SIN_PERMISO con el mensaje del .gs
 3. VALIDACIÓN (`almValidar_`, `.gs:5556-5584`) -> DATO_INVALIDO:
      movimientos: tipo ∈ 6; origen ∈ 4; material_id no vacío; unidad_compra ∈ 6; cantidad finita con |c| ≤ 1e7 y signo por tipo
                   (entrada/devolucion > 0; salida/merma < 0; conteo ≥ 0; ajuste ≠ 0); ts > 0; costo_total numérico si viene
      la fila se identifica por op.registro_id (por datos.id si falta)
      materiales:  unidad_compra ∈ 6 y unidad_consumo ∈ 5 si vienen; factor > 0 si viene; en el ALTA las tres son OBLIGATORIAS (la tabla las exige: sin esta validación el NOT NULL truena como
                   DESCONOCIDO y la bandeja reintenta para siempre una operación que nunca va a pasar)
      requerimientos: estado ∈ 5 si viene; en el ALTA: proyecto_id y material_id no vacíos, id = proyecto_id || ':' || material_id (AL-19: DATO_INVALIDO, no un check_violation),
                   el proyecto EXISTE (FK; si no: DATO_INVALIDO 'ese proyecto no existe') y unidad_compra obligatoria; en un CAMBIO esas llaves de datos se ignoran (AL-11)
 4. MOVIMIENTOS (libro; `tipo` de la bandeja se ignora, decide la tabla):
      si existe almacen_movimientos(empresa, id) -> {ok:true, ya_estaba:true}   -- NO compara contenido, NO gasta `seq`; mismo id con otro contenido: el segundo se pierde en silencio
      INSERT (el trigger asigna seq).  Si area = 'direccion' y datos.costo_total no es null -> INSERT almacen_costos (movimiento_id, importe, sello = ts)
      (Fabricación: el costo se IGNORA en silencio, no se reporta, no se guarda)         -- `.gs:5694`
 5. MATERIALES / REQUERIMIENTOS (fichas; sello por campo):
      ts := interno.sello_valido(datos.actualizado_en, ahora)  (0 o ausente -> ahora)    -- se ACOTA a ahora+10 min (H5: un reloj adelantado ya no «congela» un campo)
      alta (no existe la fila): se escriben TODAS las claves de datos que tengan columna; las demás van a procedencia.otros; 'creado_en' -> created_at no se toca;
               costo_compra -> almacen_costos (solo Dirección); sellos[campo] := ts para cada campo escrito
      cambio: lista := op.campos si es arreglo, si no TODAS las claves de datos (versión anterior de la app)
          por cada campo de lista, se SALTA si: no está en datos; es 'sync' o empieza con '_'; es 'creado_en'; es fijo y la fila ya existía
               (materiales: id; requerimientos: id, proyecto_id, material_id); es de dinero (costo_compra, costo_total) y area ≠ 'direccion' (en silencio);
          (accion, nuevo, motivo) := interno.compuerta(sellos ->> campo, jsonb_build_object(campo, ts), campo, ahora, false, true)
               'viejo' -> viejos += campo                                       -- «ya tenía un cambio más reciente»; empate escribe
          requerimientos.estado: transición NO admitida -> viejos += 'estado':  desde 'consumido' solo 'consumido';  desde 'comprado' solo 'comprado' o 'consumido'
                                (`almEstadoAdmite_`, `.gs:5590-5594`; el cliente nunca escribe 'comprado', solo lo preserva)
          si no se escribió nada -> {ok:true, sin_cambio:true, viejos}          -- NO gasta nada; un reenvío idéntico (mismo sello) sí reescribe
          UPDATE solo los campos que pasaron; sellos[campo] := nuevo; sellos._editado := ts
 6. devolver {id, ok:true, creada, viejos}                                          -- jamás devuelve costos
```

Reglas que la base asegura y el código de hoy solo comenta:

| Regla | Cómo |
|---|---|
| Salida del corte idempotente **entre teléfonos** | PK `(empresa_id, id)` con `id = 'mov-salida:'||req.id` + `ON CONFLICT DO NOTHING`; con `proyectos` global todos los teléfonos ven el mismo id y la PK pasa a ser **el mecanismo principal** (H1) |
| `consumido` no retrocede | `almEstadoAdmite_` portado (arriba) |
| `proyecto_id` de un requerimiento siempre válido | FK compuesta; el movimiento **no** lleva FK (evidencia) |
| Costos solo para quien los ve | `almacen_costos` aparte (§2.17) |
| Orden de llegada | `seq` por trigger (serializado por el candado del contador) |

```
constante_guardar(p_op, p_empresa)      [PREÁMBULO(dir, fab)]          -- `guardarConstante` (`material.js:426`): hoy quedaba `sin_destino` para siempre
 p_op = { clave, valor, unidad, nota, version }   validar: clave ^[A-Za-z0-9_]{1,64}$ y ≠ '_semilla'; valor numérico finito
 UPSERT constantes (actualizado_por := correo || ' · ' || área); anotar(general, 'guardo', 'constante', clave, antes/despues del valor)
 devolver {ok:true, constante:{…}}
```

### 5.10 Notario: solicitar → autorizar → revocar (R7)

**Quién puede cada transición** (hoy: `.gs:3748-3754`, `3769-4004`; con identidad por **persona** (`auth.uid()`) y no por «token de <rol>», que hacía de dos aparatos la misma identidad [M04 §4.2]):

| Transición | RPC | Quién | Efecto |
|---|---|---|---|
| ∅ → solicitud `pendiente` | `solicitar` | cualquier miembro (también Fabricación) | fila nueva; si ya hay pendiente **del mismo autor o de Dirección**, sobrescribe la misma |
| `pendiente` → `cancelada` | `cancelar_solicitud` | el autor, o Dirección | `estado`, `resolvio_*`, `ts_resolvio`; la cotización vuelve a `retirada` si estaba `pendiente` |
| `pendiente` → `rechazada` | `rechazar_solicitud` | **solo Dirección** | ídem con `nota`; **no toca** una autorización vigente |
| `pendiente` → `autorizada` + sello `vigente` | Edge `autorizar` → `registrar_autorizacion` | **solo Dirección** (la Edge Function lo comprueba con el JWT y la base lo vuelve a comprobar) | fila nueva `vigente` en `autorizaciones`; la solicitud queda `autorizada` con `autorizacion_id` |
| ∅ → `vigente` (sin solicitud previa) | ídem | solo Dirección | igual, sin tocar `solicitudes`; `solicito = correo` |
| `vigente` → `superada` | `registrar_autorizacion` con **otra decisión** | solo Dirección | la vigente pasa a `superada` y entra una `vigente` nueva |
| `vigente` → misma | `registrar_autorizacion` con **la misma decisión** | solo Dirección | no se escribe nada; devuelve `repetida:true` **y resuelve la solicitud pendiente** (`Q-A06`) |
| `vigente` → `revocada` | `revocar_autorizacion` | **solo Dirección** | solo cambia `estado` (+`nota`); terminal: reautorizar el folio crea una `vigente` nueva |

```
solicitar(p_op, p_empresa)        [PREÁMBULO(dir, fab, pag)]
 p_op = { folio_global (con @aparato OBLIGATORIO: `folioValido`), cotizacion:{proyecto, cliente, iva, subtotal, items[]}, entrada?:{…historial…}, nota?, huella? }
 cot := interno.limpiar_cotizacion(p_op.cotizacion)               -- `limpiarCotizacion` (.gs:3530-3571); DATO_INVALIDO con el mismo texto del .gs
 pg_advisory_xact_lock(hashtextextended(empresa || ':sol:' || folio_global, 0))
 co := cotizaciones(empresa, folio_global) FOR UPDATE
 si co existe y área ≠ 'direccion' y co.creado_por ≠ uid -> ROL_SIN_PERMISO 'Ese folio es de otra persona.'
 pend := solicitudes(empresa, folio_global, 'pendiente') FOR UPDATE
 si pend existe y pend.solicito_id ≠ uid y área ≠ 'direccion' -> ROL_SIN_PERMISO 'Ese folio ya tiene una solicitud pendiente de otra persona…'     -- las dos comprobaciones ANTES de escribir
 UPSERT cotizaciones PRIMERO (solicitudes tiene FK a cotizaciones: al revés, la primera petición de un folio fallaría con foreign_key_violation):
                      INSERT si no existe (folio, disp := split_part(folio_global,'@',2), creado_por = uid, estado 'pendiente',
                                           datos := coalesce(entrada sin dataURL, stub {proy, cliente, iva, subtotal, items} desde cot));
                      si existe: datos := coalesce(entrada, datos); estado := 'pendiente' salvo que ya sea 'autorizada' (el sello vigente sigue valiendo)
 luego la solicitud:
    si pend existe: UPDATE pend SET ts = now(), proyecto, cliente, subtotal, iva, huella, cotizacion = cot, nota          -- re-pedir sobrescribe la MISMA fila
    si no:          INSERT solicitudes (estado 'pendiente', solicito_id = uid, solicito_texto = correo_verificado(), …)
 anotar(dinero, 'solicito', 'cotizacion', folio_global, …sin importes en titulo)
 devolver {ok:true, estado:'pendiente'}
 -- NO recalcula el catálogo aquí (Q-A20): el CATALOGO_DESINCRONIZADO lo da la Edge Function `autorizar` (|subtotalServidor − subtotal| > 0.01)

cancelar_solicitud(p_folio_global)   [PREÁMBULO(dir, fab, pag)]
 pend := solicitudes(empresa, folio, 'pendiente') FOR UPDATE ;  no existe -> {ok:true, estado:null}                    -- «null = no había viva»
 pend.solicito_id ≠ uid y área ≠ 'direccion' -> ROL_SIN_PERMISO 'Esa solicitud la hizo otra persona.'
 UPDATE pend SET estado = 'cancelada', resolvio_id = uid, resolvio_texto = correo, ts_resolvio = now()               -- no toca `nota`
 cotizaciones.estado := 'retirada' SI estaba 'pendiente'
 devolver {ok:true, estado:'cancelada'}

rechazar_solicitud(p_folio_global, p_nota)   [PREÁMBULO(dir)]
 pend no existe -> NO_ENCONTRADO 'Esa solicitud ya no está pendiente.'
 UPDATE pend SET estado = 'rechazada', resolvio_id = uid, resolvio_texto = correo, ts_resolvio = now(), nota = left(p_nota, 500)
 cotizaciones.estado := 'rechazada' SI estaba 'pendiente'                          -- NO toca una autorización vigente del mismo folio
 devolver {ok:true, estado:'rechazada'}

estado_solicitudes(p_folios, p_empresa)   [PREÁMBULO(dir, fab, pag)]               -- `/estado` (`.gs:3877-3902`), reescrito sin el cotejo por fechas
 folios := los primeros 20 de p_folios que cumplan `folioValido`; los demás se OMITEN del mapa (como hoy)
 por cada folio:
    sol := la ÚLTIMA solicitud (id desc); si área ≠ 'direccion' solo si solicito_id = uid   -- cada quien solo lo SUYO; Dirección todo
    sin sol -> out[folio] = {estado:null, sello:null, resolvio:'', nota:''}
    aut := autorizaciones(sol.autorizacion_id)    -- el sello que RESOLVIÓ esa solicitud (reemplaza `selloDeLaSolicitud`, `.gs:3866-3876`: una pendiente nueva NO devuelve el sello viejo)
    estado := 'autorizada' si aut; si no sol.estado
    sello  := null si no hay aut; si no, por ÁREA:
        Dirección y Pagos: {codigo, correo := autorizo, ts := ts_iso, huella, subCalc := sub_calc, precioAuth := precio_auth,
                            itemsAuth := interno.items_auth_a_json(items_auth), total, nota, renglones := interno.renglones_a_json(renglones)}   -- `selloDeFila` (.gs:3741)
        Fabricación:       {codigo, correo, ts}  — SIN importes ni renglones (R1; Q-A01)
    out[folio] = {estado, sello, resolvio := sol.resolvio_texto, nota := sol.nota}

registrar_autorizacion(…)    [SOLO service_role; la llama la Edge Function `autorizar` DESPUÉS de firmar]
 entradas: los textos FIRMADOS tal cual (ts_iso, huella, sub/precio/total en 'NNNN.NN', items_auth, proyecto, autorizo, renglones), más codigo, firma y codificacion
           (lo que devuelve `sellar()` de `_shared/sello.js`: { firma, codigo, formato, codificacion });
           p_usuario = auth.users.id de quien autoriza (el verificado por la Edge Function con su JWT); p_cotizacion = la cotización limpia (para crear el stub si falta)
 1. REVALIDA (defensa en profundidad; la base NO tiene la clave y no puede recomputar el HMAC):
      p_usuario es miembro ACTIVO con área 'direccion' en p_empresa -> si no ROL_SIN_PERMISO
      folio con @aparato; codigo `XXXX-XXXX-XXXX`; firma 64 hex; replace(codigo,'-','') = upper(left(firma,12)); ts_iso con .mmmZ; importes 'NNNN.NN';
      p_codificacion ∈ {'utf-8','ascii-?'}
      p_autorizo = lower(correo de auth.users de p_usuario)  (el correo firmado ES el del autorizador)           -> si no DATO_INVALIDO
 2. pg_advisory_xact_lock(hashtextextended(p_empresa || ':aut:' || p_folio_global, 0))                              -- el «candado de notario» (.gs:3759-3764)
 3. vig := autorizaciones(empresa, folio_global, 'vigente')
      vig existe y (huella, sub_calc_txt, precio_auth_txt, items_auth, proyecto, renglones) son IDÉNTICOS a los que llegan   -- «misma decisión» (T-N:308-313)
           -> NADA se escribe; resuelve la solicitud pendiente del folio (autorizada, resolvio = p_usuario, autorizacion_id = vig.id)   (Q-A06: el .gs la dejaba pendiente, .gs:3939-3952)
              devolver {ok:true, repetida:true, sello:<vig>}
      vig existe y difiere -> UPDATE vig SET estado = 'superada'
 4. INSERT autorizaciones (… estado 'vigente', origen 'plataforma', usuario_id = p_usuario, clave_id, codificacion)      -- el índice único parcial garantiza ≤ 1 vigente por folio
 5. UPSERT cotizaciones: si no existe, stub desde p_cotizacion (creado_por = p_usuario); estado := 'autorizada'; autorizacion_id := nueva; revocada_en := NULL
 6. la ÚLTIMA solicitud 'pendiente' del folio (de cualquiera) -> estado 'autorizada', resolvio_id = p_usuario, resolvio_texto = correo, ts_resolvio = now(),
       nota = coalesce(nullif(p_nota,''), nota), autorizacion_id = nueva
 7. anotar(dinero, 'autorizo', 'autorizacion', folio_global, antes/despues {estado}, SIN importes en titulo)
 8. devolver {ok:true, repetida:false, sello:{codigo, correo, ts, huella, subCalc, precioAuth, itemsAuth, total, nota, renglones}}

revocar_autorizacion(p_folio_global, p_nota, p_empresa)   [PREÁMBULO(dir)]
 vig := vigente del folio FOR UPDATE ;  no existe -> NO_ENCONTRADO 'Ese folio no tiene una autorización vigente.'
 UPDATE autorizaciones SET estado = 'revocada', nota = left(p_nota, 500)          -- el trigger solo deja cambiar estado (+nota con él)
 cotizaciones.revocada_en := now()
 anotar(dinero, 'revoco', 'autorizacion', …)
 devolver {ok:true}                       -- el PDF impreso pasa a «Revocada» en /verificar con SU total (T-V:206-219)

autorizacion_para_verificar(p_folio, p_codigo)   [SOLO service_role]      -- lo llama la Edge Function pública `verificar` DESPUÉS de `verificar_cupo`
 f := btrim(p_folio); cod := upper(regexp_replace(p_codigo, '[^0-9A-Fa-f]', '', 'g')) recortado a 12
 forma inválida (f ∉ ^[A-Za-z0-9-]{1,24}(@[A-Za-z0-9_-]{1,24})?$ o length(cod) ≠ 12) -> {ok:true, filas:[]}     (no gasta cupo: lo decide la Edge antes)
 filas := autorizaciones, de la MÁS ANTIGUA a la más nueva (order by id), hasta 50, donde
      (f contiene '@' ? folio_global = f : upper(split_part(folio_global,'@',1)) = upper(split_part(f,'@',1)))   -- «el folio sin @aparato» solo aquí
      AND replace(codigo,'-','') = cod
 devolver {ok:true, filas:[ {folio_global, ts_iso, proyecto, sub_calc, precio_auth, total, items_auth, huella, autorizo, renglones, codigo, firma, estado, codificacion}, … ]}
      -- es EXACTAMENTE lo que espera `leerFilas` de `_shared/verificar.js` (`COLUMNAS_DE_AUTORIZACION` de `sello.js`, más `codificacion`): los importes viajan como el
      -- texto firmado 'NNNN.NN' (el módulo acepta texto numérico) y todo lo demás VERBATIM; el módulo busca de atrás para adelante («la última que cuadre es la que vale»),
      -- recalcula el HMAC y compara con `firma` y `codigo`.
 -- La base NO decide «auténtica»: no tiene la clave. Falta de clave o de base -> la Edge Function responde ERROR explícito (ok:false), NUNCA `no_autentica`;
 -- «no se halló fila con ese folio y ese código» (filas:[]) sí es `no_autentica`: es el papel falso o mal copiado.
```

**Por qué `registrar_autorizacion` no es plpgsql puro:** el sello depende de `Math.round` (mitad hacia +∞), `toFixed`, `String(number)`, `sort()` por unidades UTF-16, suma flotante secuencial y `JSON.stringify`; ninguno es reproducible bit a bit en Postgres [C-27; M04 §1.7]. La Edge Function usa **un solo módulo** compartido con `verificar` —ya existe en el worktree: `supabase/functions/_shared/sello.js` y `verificar.js`, que no tocan la base ni el entorno— y se prueba con los vectores de [M04 §1.8] más 3–5 filas reales. La base solo **guarda** el resultado y aplica estados y permisos. **La codificación es la duda que queda** (`R-02`): `sello.js` documenta que `Utilities.computeHmacSha256Signature` recibe dos `String` sin decir con qué codificación los vuelve bytes, y que doce HMAC atribuidos al Apps Script real (con claves falsas, `pruebas/supabase-sello.mjs` bloque 5) coinciden con «US-ASCII y un `?` por cada carácter no ASCII», no con UTF-8; su procedencia **no está verificada**. Por eso `verificar()` acepta las dos, `sellar()` firma los nuevos con UTF-8 y **cada fila guarda su `codificacion`** (la fija `sellar()` al firmar o el importador, con lo que devuelve `verificar()`, al importar una fila heredada). Lo que la Edge Function debe dejar fijo (no es de este esquema, pero el esquema lo supone): `HMAC-SHA256(clave = SELLO_AUTORIZACION, mensaje = canon)`, ambos a bytes con la `codificacion` de la fila (UTF-8 para los sellos nuevos), hex minúscula; `canon = 'AL3D-AUTH-v2' + JSON.stringify([folio, huella, dinero2(sub), dinero2(precio), items, dinero2(total), proyecto, correo, ts, renglones])` (v1 sin el décimo); `dinero2(n) = (Math.round(Number(n||0)*100)/100).toFixed(2)`; el código impreso = primeros 12 hex en mayúsculas en 3 grupos de 4.

### 5.11 `cotizacion_guardar` y `cuaderno_guardar`

```
cotizacion_guardar(p_op, p_empresa)   [PREÁMBULO(dir, fab, pag)]       -- actualiza la copia de trabajo de una cotización que YA existe (se crea con `solicitar` o `subida_unica`)
 p_op = { folio_global, datos?:{…entrada del historial…}, hitos?:{pdf, wa, venta, propuesta:{primera, ultima, veces}}, borrar?:true }
 folio_global con @aparato -> DATO_INVALIDO
 co := cotizaciones(empresa, folio_global) FOR UPDATE ;  no existe -> NO_ENCONTRADO 'Esa cotización no existe: nace al pedir la autorización o con la subida única.'
 área ≠ 'direccion' y co.creado_por ≠ uid -> ROL_SIN_PERMISO 'Ese folio es de otra persona.'                          -- ANTES de tocar nada
 si p_op.borrar:  UPDATE cotizaciones SET deleted_at = now() ;  anotar(dinero, 'borro', 'cotizacion', folio_global, 'Se quitó <proyecto>')
                  -- la fila se queda y la autorización firmada (`autorizaciones`) NO se toca: un PDF impreso sigue verificando
 si no:  datos := p_op.datos sin data URLs ni `aiFile.url` (las imágenes van a Storage); debe ser objeto de ≤ 200 000 caracteres y su `folio`/`disp`
         coherentes con folio_global -> DATO_INVALIDO
         UPDATE cotizaciones SET datos = coalesce(datos_nuevos, datos), hitos = hitos || coalesce(p_op.hitos, '{}')
         -- NUNCA toca `estado`, `autorizacion_id` ni `revocada_en`: eso es de las RPC del notario. Las columnas generadas (proy, cliente, tel, huella_auth) se recalculan solas
 devolver {ok:true}            -- no anota los cambios de `datos`/`hitos`: no son hechos nuevos y serían ruido (la última escritura gana, `R-25`)

cuaderno_guardar(p_clave, p_nota, p_empresa)   [PREÁMBULO(dir, fab, pag)]
 p_clave ∉ ^(tel:[0-9]{10}|nom:.{1,200})$ o length(p_nota) > 1200 -> DATO_INVALIDO
 UPSERT cuaderno_notas (empresa, clave, autor_id = uid) SET nota = p_nota                    -- la nota es POR AUTOR (Q-A11)
 devolver {ok:true}
```

### 5.12 `subida_unica` (el historial del cotizador, dentro de la app) [P-01]

Es **la puerta de salida de los datos que solo existen en un teléfono** (`al3d_historial`, `al3d_queue`, hitos, cuadernos, bitácora local, `al3d_pf_disp`/`al3d_folio`). Los demás almacenes de IndexedDB (proyectos, instalaciones, material, almacén) los trae el importador desde el respaldo de cada teléfono o salen por las RPC normales de su bandeja. **Sin esta subida, con acuse por registro, el borrado local por revocación no puede habilitarse** (§7.5).

```
subida_unica(p_lote, p_empresa)         [PREÁMBULO(dir, fab, pag)]            -- cualquier miembro sube lo SUYO; Fabricación escribe y nunca lee de vuelta
 p_lote = { disp:'K7QM', letra_folio:'B', folio_max:42,
            cotizaciones:[ {…entrada del historial…} … ≤ 50 ],                                -- al3d_historial
            cola:[ { folio, proy, cliente, neto, fecha_sol, estado, precioAuth, autorizador, nota, fechaAuth, q:{…}|null, itemsAuth?, huellaAuth? } … ≤ 50 ],   -- al3d_queue
            hitos:{ '<folio corto>':{pdf,wa,venta} }, canva:{ '<folio corto>':{primera,ultima,veces} },
            cuadernos:{ 'tel:3312345678':'nota', … },
            bitacora:[ {id, ts, accion, entidad, entidad_id, titulo, detalle, antes, despues, usuario, rol, dispositivo, sello} … ≤ 200 ] }
 acuse := []
 1. contador del aparato: contadores('*', 'folio_cot:' || disp) := greatest(n, folio_max, máximo número de folio de `cola`, incl. renglones «fantasma» autorizada+q:null)
 2. por cada entrada e de cotizaciones:
      disp_e := e.disp ; si no, parte tras '@' de e.sello.folio ; si no, p_lote.disp ; si no, 'HIST' || left(md5(e.folio||e.cliente||e.fecha), 6) con procedencia.disp_inferido
      fg := e.folio || '@' || disp_e ;  c := cotizaciones(empresa, fg)
      c no existe        -> INSERT (estado 'autorizada', creado_por = uid, datos := e SIN dataURL, hitos := hitos[e.folio] + canva[e.folio],
                                    procedencia {telefonos:[p_lote.disp], sello_local: e.sello, disp_inferido?, subida_unica: now()})            acuse 'creada'
      c existe, c.creado_por ≠ uid y área ≠ 'direccion' -> acuse 'rechazada' (ROL_SIN_PERMISO)       -- se decide PRIMERO: lo ajeno no se compara ni se revela
      c existe y c.datos = e (ignorando dataURL)                                                                                                       acuse 'ya_estaba'
      c existe y datos distintos -> NO sobrescribe; procedencia.telefonos += disp                                                                      acuse 'conflicto' (motivo)
 3. por cada renglón de cola con estado 'pendiente' y q no nulo: si no existe la cotización ni solicitud pendiente -> INSERT cotización 'pendiente' + solicitud 'pendiente'
      (solicito_id = uid, procedencia.subida_unica); si ya existe -> 'ya_estaba'.  Los «fantasma» solo aportaron folio al contador.
 4. cuadernos -> cuaderno_notas (autor = uid);   bitacora -> INSERT con op_id = 'tel:' || disp || ':' || b.id ON CONFLICT DO NOTHING, nivel por la lista blanca de §3.5
 devolver {ok:true, acuse:[{tipo:'cotizacion'|'cola'|'bitacora'|'cuaderno', id, estado, motivo?}], resumen:{creadas, ya_estaban, conflictos, rechazadas}}
```

Las imágenes (`al3d_cot_imgs`, `aiFile.url`) **no** van por esta RPC: se suben a Storage desde el teléfono y el acuse de cada una es el propio `storage.objects` (§3.5). La unión por `(folio, disp)` y no por «folio cotizacion» a secas [C-30]; los conflictos **no se resuelven aquí**: quedan en `procedencia` y en el reporte.

### 5.13 Lo demás que usa la importación (solo `service_role`)

| RPC | Qué hace |
|---|---|
| `contador_sembrar(p_empresa, p_clave, p_minimo)` | `n := greatest(n, p_minimo)`: siembra `V` por encima del máximo de la hoja y sus respaldos, `P` por encima del máximo `P-###` de «Abonos comisión», `alm` por encima de `ALMACEN_SECUENCIA`/máximo de «Secuencia» |
| `cuadre_hoja(p_empresa)` | el **reporte de cuadre** de la fase 2: `{invariantes:{proyectos_sin_dinero} (todo proyecto con `folio_hoja` debe tener su fila en `ventas_dinero`; la otra mitad la impone el trigger `ventas_dinero_libro`), proyectos:{total, historicas, vivas, lapidas, por_fuente}, ventas:{filas, suma_subtotal, suma_neto, suma_cobrado, n_saldo, suma_saldo_positivo, comisiones_generadas, abonado, comisiones_pendientes}, abonos:{n, suma, huerfanos}, cotizaciones:{por_estado}, autorizaciones:{total, vigentes, superadas, revocadas, v1, v2}, solicitudes:{por_estado}, miembros:{por_estado}, almacen:{movimientos, materiales, requerimientos, costos}, contadores:{V, P, alm}, x_revisar:{<bandera>: n}}`. El script lo compara con la hoja y con los teléfonos; **por folio** compara cada columna H, K, R, S, T, X contra `getValues()` con tolerancia 0.004 [P-03] |
| escritura directa | el importador escribe por PostgREST con `service_role` (`upsert … on conflict`) respetando CHECK, UNIQUE y triggers; **no** usa las RPC de cliente (no debe disparar IVA por cuenta, folios ni transiciones) y escribe en lotes de **≤ 200 filas por transacción** (<5 s) para que el cursor con solape de 30 s cubra el desorden de confirmación (§7.2) |

### 5.14 `interno.partir_origen` (SQL) e `interno.limpiar_cotizacion` (pseudocódigo)

**`partir_origen`** (R1; lo llaman `ganar_proyecto`, `descartar_cotizacion`, `proyecto_actualizar` con `origen` y la importación). Parte la copia congelada de la cotización en la **obra** (lista blanca: `RAIZ_OBRA` e `ITEM_OBRA` de §4.5; la ven los tres roles) y el **dinero** (todo lo demás; solo Dirección y Pagos). Detalles que el SQL fija: `aiFile` queda `{name, type}` (las imágenes van a Storage, la `url` no se guarda); `caja_forma` se conserva solo si es un texto de ≤ 20 caracteres y **la base no la deriva de `tarifa`** (no copia el catálogo, N-07); en `opciones` solo viajan `activa` y `lista`, y cada opción solo `k` y `d` (con `d` filtrada con la misma lista, sin anidar `opciones`); **todo lo que se quita se conserva** en `dinero` para reconstruir el `origen` completo (`dinero.items[<id>]` lleva `_lt`, `pu`, `tarifa`… y, si se quitó algo dentro de `opciones`, `opciones_fuera: {raiz, d[]}`); y la **postcondición** `not contiene_dinero(obra)` hace que un hueco de la lista blanca (p. ej. un `renders` con una clave de dinero) **aborte** en vez de guardar un precio. Verificado en PGlite con una entrada completa (PX-01..PX-04, R1-04).

```sql
create function interno.solo_claves(j jsonb, p_claves text[]) returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_object_agg(e.key, e.value) filter (where e.key = any (p_claves)), '{}'::jsonb) from pg_catalog.jsonb_each(j) e $$;

create function interno.sin_claves(j jsonb, p_claves text[]) returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_object_agg(e.key, e.value) filter (where e.key <> all (p_claves)), '{}'::jsonb) from pg_catalog.jsonb_each(j) e $$;

create function interno.partir_origen(o jsonb) returns table (obra jsonb, dinero jsonb)
language plpgsql immutable set search_path = '' as $$
declare
  v_raiz text[] := array['folio','proy','cliente','tel','dirRaw','direccion','maps','entrecalles','entrega','notaCliente','fecha','plazoK',
                         'disp','fuente','iva','items','renders','propuesta','aiFile'];
  v_item text[] := array['id','tipo','material','matAuto','comp','luz','ilumTipo','altura','n','acab','recComp','bas','ancho','alto','pz','desc',
                         'descAi','textoAuto','showInPdf','plano','nManual','descAuto','medidaTipo','anchoMedido','opciones','caja_forma'];
  v_dado text[] := pg_catalog.array_remove(v_item, 'opciones');                       -- las opciones no se anidan a sí mismas
  v_obra jsonb; v_dinero jsonb; v_items jsonb := '[]'::jsonb; v_din_items jsonb := '{}'::jsonb;
  it jsonb; v_ord bigint; v_it jsonb; v_rest jsonb; v_op jsonb; v_lista jsonb; v_dl jsonb; e jsonb; v_d jsonb; v_opfuera jsonb;
begin
  if pg_catalog.jsonb_typeof(o) is distinct from 'object' then raise exception 'origen debe ser un objeto' using errcode = '22023'; end if;
  v_obra   := interno.solo_claves(o, v_raiz) - 'items' - 'aiFile';
  v_dinero := interno.sin_claves(o, v_raiz);
  if pg_catalog.jsonb_typeof(o -> 'aiFile') = 'object' then                                   -- las imágenes van a Storage: solo {name, type}
    v_obra := v_obra || pg_catalog.jsonb_build_object('aiFile', interno.solo_claves(o -> 'aiFile', array['name','type']));
  end if;
  if pg_catalog.jsonb_typeof(o -> 'items') = 'array' then
    for it, v_ord in select a.value, a.ordinality from pg_catalog.jsonb_array_elements(o -> 'items') with ordinality a loop
      if pg_catalog.jsonb_typeof(it) <> 'object' then continue; end if;
      v_it   := interno.solo_claves(it, v_item);
      v_rest := interno.sin_claves(it, v_item);                                                -- _lt, pu, tarifa, … lo que se quita de la partida
      if v_it ? 'caja_forma' and not (pg_catalog.jsonb_typeof(v_it -> 'caja_forma') = 'string' and pg_catalog.length(v_it ->> 'caja_forma') <= 20) then
        v_it := v_it - 'caja_forma';                                                           -- solo un texto corto que calculó el cliente
      end if;
      if pg_catalog.jsonb_typeof(v_it -> 'opciones') = 'object' then                           -- opciones: activa y lista; cada opción, k y d filtrada
        v_op := v_it -> 'opciones'; v_opfuera := interno.sin_claves(v_op, array['activa','lista']);
        v_lista := '[]'::jsonb; v_dl := '[]'::jsonb;
        if pg_catalog.jsonb_typeof(v_op -> 'lista') = 'array' then
          for e in select a.value from pg_catalog.jsonb_array_elements(v_op -> 'lista') a loop
            if pg_catalog.jsonb_typeof(e) = 'object' then
              v_d := e -> 'd';
              v_lista := v_lista || pg_catalog.jsonb_build_array(interno.solo_claves(e, array['k'])
                           || case when pg_catalog.jsonb_typeof(v_d) = 'object' then pg_catalog.jsonb_build_object('d', interno.solo_claves(v_d, v_dado)) else '{}'::jsonb end);
              v_dl    := v_dl    || pg_catalog.jsonb_build_array(interno.sin_claves(e, array['k','d'])
                           || case when pg_catalog.jsonb_typeof(v_d) = 'object' and interno.sin_claves(v_d, v_dado) <> '{}'::jsonb
                                   then pg_catalog.jsonb_build_object('d', interno.sin_claves(v_d, v_dado)) else '{}'::jsonb end);
            else
              v_lista := v_lista || pg_catalog.jsonb_build_array(e); v_dl := v_dl || pg_catalog.jsonb_build_array('{}'::jsonb);
            end if;
          end loop;
        end if;
        v_it := v_it || pg_catalog.jsonb_build_object('opciones', interno.solo_claves(v_op, array['activa']) || pg_catalog.jsonb_build_object('lista', v_lista));
        if v_opfuera <> '{}'::jsonb or exists (select 1 from pg_catalog.jsonb_array_elements(v_dl) x where x <> '{}'::jsonb) then
          v_rest := v_rest || pg_catalog.jsonb_build_object('opciones_fuera', pg_catalog.jsonb_build_object('raiz', v_opfuera, 'd', v_dl));   -- lo que se quitó, para reconstruir
        end if;
      end if;
      v_items := v_items || pg_catalog.jsonb_build_array(v_it);
      if v_rest <> '{}'::jsonb then v_din_items := v_din_items || pg_catalog.jsonb_build_object(coalesce(it ->> 'id', '#' || v_ord), v_rest); end if;
    end loop;
  end if;
  v_obra := v_obra || pg_catalog.jsonb_build_object('items', v_items);
  if v_din_items <> '{}'::jsonb then v_dinero := v_dinero || pg_catalog.jsonb_build_object('items', v_din_items); end if;
  if interno.contiene_dinero(v_obra) then                                                      -- si esto pasa, la lista blanca tiene un hueco: jamás se guarda
    raise exception 'La parte de obra de origen trae dinero: la lista blanca está incompleta' using errcode = 'P0001';
  end if;
  return query select v_obra, v_dinero;
end $$;
```

```
interno.limpiar_cotizacion(c jsonb) -> jsonb                              -- `limpiarCotizacion` (`.gs:3530-3571`)
  c no es objeto o c.items no es arreglo de 1..80 -> DATO_INVALIDO «La cotización necesita al menos una partida» / «demasiadas partidas»
  por cada partida: objeto con `id` (número o texto ≤ 40, ÚNICO en la cotización); copia SOLO los 14 campos de precio presentes
        (tipo, material, comp, luz, altura, n, acab, recComp, bas, ancho, alto, tarifa, pz, pu), cada valor null | número finito | texto ≤ 60 | booleano; más desc ≤ 300
        orden de las llaves: id, los campos de precio en ESE orden, desc    -- el .gs lo cuidaba para el texto de la celda; en jsonb el orden no se conserva y no importa: nada firmado depende de él (la huella se arma con CAMPOS_PRECIO, §5.10)
  proyecto, cliente := btrim(texto) recortado a 140 ; iva := booleano ; subtotal := número finito
  length(resultado::text) > 100000 -> DATO_INVALIDO «La cotización es demasiado grande. Divídela en dos cotizaciones.»
```

### 5.15 Códigos de error por RPC

**Comunes a las 27 RPC con preámbulo** (todas menos `mi_acceso`, `reclamar_acceso` y `version_contrato`; en las 7 de servicio no hay preámbulo): `CLIENTE_VIEJO` (cabecera ausente o menor que el mínimo), `SIN_ACCESO` (nunca tuvo fila), `ACCESO_REVOCADO` (su fila quedó en `baja`), `EMPRESA_REQUERIDA` (varias empresas y sin `p_empresa`) y `ROL_SIN_PERMISO` (sesión sin `sub` o área fuera de las permitidas: se decide **antes** de leer una sola fila). Una validación que falla aborta **antes** de la primera escritura. Lo que no es un fallo de negocio sino un dato descartado (un campo no permitido, un cambio viejo) viaja en `rechazadas[]`/`viejos[]` con `ok:true`. `RAISE EXCEPTION` queda para bugs: PostgREST contesta 4xx/5xx y el cliente lo trata como `DESCONOCIDO` (reintentable).

| RPC | Códigos propios (con la causa) |
|---|---|
| `mi_acceso` | `SIN_SESION` (sin `auth.uid()`); jamás `ACCESO_REVOCADO` por falta de señal |
| `reclamar_acceso` | `SIN_SESION`; `ACCESO_CONFLICTO` (el correo ya está vinculado a otra cuenta); `ok:true, estado:'correo_no_verificado'` **no** es error |
| `miembro_alta` | `DATO_INVALIDO` (correo o área) |
| `miembro_cambiar_area`, `miembro_baja` | `NO_ENCONTRADO` (no existe, o ya en baja al cambiar de área); `DATO_INVALIDO` (dejaría sin Dirección activo) |
| `version_contrato` | ninguno |
| `ganar_proyecto` | `DATO_INVALIDO` (id, folio, nombre, subtotal, cuenta, estatus, anticipo); `DUPLICADO` (la cotización ya es **otro** proyecto: reintento del mismo `id` = `ya_existia`) |
| `descartar_cotizacion` | `DATO_INVALIDO`; `DUPLICADO` (ya es un proyecto con otro `id`) |
| `alta_venta` | `DATO_INVALIDO` (nombre, cuenta, subtotal, anticipo, teléfono < 10 dígitos o entrega ausentes) |
| `proyecto_actualizar` | `NO_ENCONTRADO`; `DATO_INVALIDO` (op mal formada o **sin sello** para un grupo sellado, `Q-A05`) |
| `mover_etapa` | `NO_ENCONTRADO`; `DATO_INVALIDO` (etapa fuera de las 8, sin `p_sello`, lápida `Q-A23`); `ROL_SIN_PERMISO` (tabla rol × origen × destino de §5.6) |
| `instalacion_guardar` | `NO_ENCONTRADO` (proyecto); `DATO_INVALIDO` (proyecto cancelado, fecha, hora, ventana, duración, estado o sello ausente); `ROL_SIN_PERMISO` (Pagos) |
| `emitir_salidas_derivadas` | ninguno propio |
| `registrar_cobro` | `DATO_INVALIDO` (monto nulo o ≤ 0); `NO_ENCONTRADO` (inexistente, lápida o sin folio) |
| `registrar_abono_comision` | `DATO_INVALIDO` (monto nulo, ≤ 0 o ≥ 1e7); `NO_ENCONTRADO` |
| `repartir_abono_fifo`, `vista_previa_reparto` | `DATO_INVALIDO` (monto ≤ 0; no hay comisiones pendientes) |
| `corregir_venta` | `DATO_INVALIDO` (`p_cambios` vacío); `NO_ENCONTRADO`; los campos no permitidos o inválidos van en `rechazadas[]` |
| `corregir_abono` | `DATO_INVALIDO` (monto 0 o ≥ 1e7, nota vacía); `NO_ENCONTRADO`; `ROL_SIN_PERMISO` (solo Dirección) |
| `comisiones_cobradas` | `DATO_INVALIDO` (fechas) |
| `almacen_aplicar` | `DATO_INVALIDO` (más de 25 ops); por op: `DATO_INVALIDO`, `ROL_SIN_PERMISO`; con `p_atomico`, `LOTE_RECHAZADO` + `op_fallida` |
| `constante_guardar` | `DATO_INVALIDO` (clave, `_semilla`, valor) |
| `cotizacion_guardar` | `NO_ENCONTRADO`; `ROL_SIN_PERMISO` (folio de otra persona); `DATO_INVALIDO` |
| `solicitar` | `DATO_INVALIDO` (folio sin `@aparato`, cotización inválida: mismos textos que `limpiarCotizacion`); `ROL_SIN_PERMISO` (folio o pendiente de otra persona) |
| `cancelar_solicitud` | `ROL_SIN_PERMISO` (ajena); sin pendiente = `ok:true, estado:null` |
| `rechazar_solicitud`, `revocar_autorizacion` | `NO_ENCONTRADO` (ya no hay pendiente / no hay vigente) |
| `estado_solicitudes`, `cuaderno_guardar` | `cuaderno_guardar`: `DATO_INVALIDO`; `estado_solicitudes` omite lo inválido |
| `subida_unica` | `DATO_INVALIDO` (lote mal formado o fuera de tope); por registro, el acuse `rechazada` lleva `ROL_SIN_PERMISO` |
| `registrar_autorizacion` | `ROL_SIN_PERMISO` (`p_usuario` no es Dirección activa de la empresa); `DATO_INVALIDO` (forma de los textos firmados o `codificacion`) |
| `autorizacion_para_verificar`, `cuadre_hoja`, `contador_sembrar`, `ia_turno` | ninguno (forma inválida = `filas:[]`) |
| `verificar_cupo` | `SIN_RED` (cupo agotado, con el texto de hoy) |
| `ia_cuota` | `DATO_INVALIDO`; `CUPO_AGOTADO` (`transitorio:false`) |

---

## 6. Vista de fórmulas (R4): la hoja, al centavo

**Qué se reproduce.** Las doce columnas fórmula de «Ventas» (`formulasVentas`, `.gs:170-210`): **H, K, O, P, Q, R, S, T, U, V, W, X**, con **redondeo decimal exacto** (`numeric`) y la regla **IVA-por-cuenta**. El plan decía «una prueba que compara ambos resultados… es lo que hoy hace `pruebas/precio-servidor.mjs`»: **es falso**, esa prueba compara el catálogo de precios de la cotización, no H/K/R/T [C-07; M02 §7.1]. La prueba de cuadre se escribe de cero (§6.4).

### 6.1 SQL exacto

`R` es **10 % fijo del SUBTOTAL (G)**, no del neto: el IVA no entra y `pct_comision` (col. AD) **no se lee** (`.gs:181-185`; el cotizador manda siempre 10, `venta.js:27,378`) [C-05]. Una sola aritmética (`interno.neto`, `interno.comision`, §5.7) la comparten la vista y las RPC.

```sql
create function interno.hoy_mx() returns date language sql stable set search_path = '' as $$
  select (pg_catalog.now() at time zone 'America/Mexico_City')::date $$;
create function interno.dia_mx(p_ts timestamptz default now()) returns text language sql stable set search_path = '' as $$
  select pg_catalog.to_char(p_ts at time zone 'America/Mexico_City', 'YYYYMMDD') $$;

create view public.ventas_calculadas with (security_invoker = true) as
with ab as (                                                   -- S y U: SUMIF/COUNTIF de «Abonos comisión» por folio
  select a.empresa_id, a.folio_hoja, sum(a.importe) as abonado, count(*)::int as pagos
    from public.abonos a group by a.empresa_id, a.folio_hoja
), b as (
  select p.empresa_id, p.id as proyecto_id, p.folio_hoja, p.nombre, p.estatus, d.cuenta, p.tipo_trabajo, p.iva,
         d.subtotal, d.anticipo, d.liquidacion, p.fecha_anticipo,
         coalesce(i.fecha, p.fecha_instalacion_hist)      as fecha_instalacion,   -- M: la instalación viva; en las históricas, la fecha heredada
         d.fecha_liquidacion, d.pct_comision, p.historica, p.fuente, p.etapa, p.folio_global,
         interno.neto(d.subtotal, p.iva)                  as h_neto,              -- H
         interno.comision(d.subtotal)                     as r_comision,          -- R
         coalesce(ab.abonado, 0)                          as s_abonado,           -- S
         coalesce(ab.pagos, 0)                            as u_pagos              -- U
    from public.proyectos p
    join public.ventas_dinero d on d.proyecto_id = p.id and d.empresa_id = p.empresa_id     -- JOIN INTERNO: sin ventas_dinero visible (Fabricación), 0 filas
    left join lateral (select x.fecha from public.instalaciones x
                        where x.proyecto_id = p.id and x.estado <> 'cancelada' and x.deleted_at is null
                        order by x.fecha limit 1) i on true                          -- a lo sumo UNA viva (índice único parcial)
    left join ab on ab.empresa_id = p.empresa_id and ab.folio_hoja = p.folio_hoja
   where p.deleted_at is null and d.deleted_at is null and p.folio_hoja is not null  -- la lápida no es venta
), k as (
  select b.*,
         round(b.h_neto - b.anticipo - b.liquidacion, 2)  as k_saldo,              -- K
         round(b.r_comision - b.s_abonado, 2)             as t_restante            -- T
    from b
), pa as (
  select k.*,
         case when k.fecha_anticipo is null or coalesce(k.estatus, '') = 'FABRICACION' then null
              when k.k_saldo > 0.004 then interno.hoy_mx() - coalesce(k.fecha_instalacion, k.fecha_anticipo)   -- P
         end as p_dias
    from k
)
select pa.empresa_id, pa.proyecto_id,
       pa.folio_hoja                        as a_folio,
       pa.nombre                            as b_proyecto,
       pa.estatus                           as c_estatus,
       pa.cuenta                            as d_cuenta,
       pa.tipo_trabajo                      as e_tipo,
       pa.iva                               as f_iva,
       pa.subtotal                          as g_subtotal,
       pa.h_neto,                                                                                              -- H
       pa.anticipo                          as i_anticipo,
       pa.liquidacion                       as j_liquidacion,
       pa.k_saldo,                                                                                             -- K
       pa.fecha_anticipo                    as l_fecha_anticipo,
       pa.fecha_instalacion                 as m_fecha_instalacion,
       pa.fecha_liquidacion                 as n_fecha_liquidacion,
       case when pa.fecha_liquidacion is not null and pa.fecha_anticipo is not null
            then pa.fecha_liquidacion - pa.fecha_anticipo end                               as o_dias_cobro,   -- O
       pa.p_dias,                                                                                              -- P
       case when pa.p_dias is null then null
            when pa.p_dias <= 30 then '0-30 días'  when pa.p_dias <= 60 then '31-60 días'
            when pa.p_dias <= 90 then '61-90 días' else 'Más de 90 días' end                as q_antiguedad,   -- Q
       pa.r_comision,                                                                                          -- R
       pa.s_abonado, pa.t_restante, pa.u_pagos,                                                                -- S, T, U
       extract(year from pa.fecha_anticipo)::int                                            as v_anio,         -- V (de L)
       pg_catalog.to_char(pa.fecha_anticipo, 'YYYY-MM')                                     as w_mes,          -- W (de L)
       case                                                                                                    -- X: la PRIMERA que cumpla, en este orden
         when count(*) over (partition by pa.empresa_id, pa.folio_hoja) > 1                 then 'Folio repetido'          -- inalcanzable con UNIQUE; se conserva por paridad
         when pa.cuenta is not null and pa.iva is distinct from (pa.cuenta <> 'Elias BBVA') then 'IVA no corresponde a la cuenta'
         when pa.k_saldo < -0.004                                                           then 'Cobrado de más'
         when pa.t_restante < -0.004                                                        then 'Comisión pagada de más'
         when pa.estatus = 'LIQUIDADO' and pa.k_saldo > 0.004                               then 'Liquidado con saldo'
         when pa.estatus = 'LIQUIDADO' and pa.fecha_liquidacion is null                     then 'Falta fecha de liquidación'
         else '' end                                                                         as x_revisar,
       pa.historica, pa.fuente, pa.etapa, pa.folio_global, pa.pct_comision
  from pa;

create view public.comisiones_pendientes with (security_invoker = true) as          -- `pendientesFIFO` (`.gs:4849-4858`)
select v.empresa_id, v.a_folio as folio, v.b_proyecto as nombre, v.t_restante as pend,
       (substring(v.a_folio from 3))::int as numero_folio
  from public.ventas_calculadas v where v.t_restante > 0.004;
-- grant select on ambas vistas to authenticated; execute de interno.neto/comision/hoy_mx a authenticated y service_role
```

### 6.2 Fórmula de la hoja ↔ SQL (uno a uno)

| Col | Fórmula de la hoja (`.gs`) | SQL |
|---|---|---|
| H | `ROUND(G*(1+IF(F="Sí",16%,0)),2)` | `round(coalesce(subtotal,0)*(1+case when iva then 0.16 else 0 end),2)` |
| K | `IFERROR(ROUND(H-I-J,2),"")` | `round(h_neto - anticipo - liquidacion, 2)` |
| O | `IF((L="")+(N="")>0,"",N-L)` | `fecha_liquidacion - fecha_anticipo` si ambas existen |
| P | `IF((B="")+(L="")+(C="FABRICACION")>0,"",IF(K>0.004,TODAY()-IF(M="",L,M),""))` | `case when fecha_anticipo is null or estatus='FABRICACION' then null when k_saldo>0.004 then hoy_mx() - coalesce(M, L) end` |
| Q | `<=30 "0-30 días"; <=60 "31-60 días"; <=90 "61-90 días"; si no "Más de 90 días"` | `case` idéntico |
| R | `ROUND(G*10%,2)` | `round(coalesce(subtotal,0)*0.10, 2)` |
| S | `SUMIF('Abonos comisión'!A,A,'Abonos comisión'!C)` | `sum(abonos.importe)` por `(empresa, folio_hoja)` |
| T | `IFERROR(ROUND(R-S,2),"")` | `round(r_comision - s_abonado, 2)` |
| U | `COUNTIF('Abonos comisión'!A,A)` | `count(*)` por folio |
| V | `YEAR(L)` | `extract(year from fecha_anticipo)` |
| W | `TEXT(L,"yyyy-mm")` | `to_char(fecha_anticipo,'YYYY-MM')` |
| X | 7 `IF` anidados | `case` en el mismo orden |

`B=""` (fila inexistente) no tiene equivalente: una fila sin nombre **no existe** (`proyectos.nombre` no puede estar vacío) [M02 §6.1].

### 6.3 La regla IVA-por-cuenta (R4)

Hoy la impone el servidor al final de **cada** `/empujar` (`normalizarIvaActivos`, `.gs:1057-1067`, llamada en `.gs:2698`) y al editar la col. D a mano (`aplicarIva`, que **no** exceptúa `LIQUIDADO`, `.gs:1048`). Sin ella H, K y R **no cuadran** en ventas abiertas [M02 §2.6; 00 C-08]. En la base es `interno.normalizar_iva()` (§5.7): para toda venta con cuenta y estatus ≠ `LIQUIDADO`, `iva := (cuenta <> 'Elias BBVA')`; se llama en `ganar_proyecto`, `alta_venta`, `corregir_venta` y `registrar_cobro`. Un `IVA` mandado por el cliente **se descarta** si la cuenta dice otra cosa; una venta `LIQUIDADO` o sin cuenta no se toca. La **importación no la aplica**: lo que traen las filas se conserva y la columna X marca las que no cuadran.

### 6.4 Casos borde y cómo se prueban

La prueba construye cada fila con SQL directo (`service_role`), consulta `ventas_calculadas` como Dirección y compara **igualdad exacta** (`numeric`, sin tolerancia) contra el valor calculado a mano. «`D`» = `interno.hoy_mx()` leído de la propia base (las fechas son relativas, así no hay reloj que simular).

| Caso | Entradas | Esperado | Id |
|---|---|---|---|
| Venta con IVA | G=10000, iva sí, cuenta Constru BNT, COBRANDO, I=5800, J=0, L=D−40 | H=11600.00, K=5800.00, R=1000.00, S=0, T=1000.00, U=0, P=40, Q=«31-60 días», X='' | FM-01 |
| Venta sin IVA | G=10000, iva no, cuenta Elias BBVA | H=10000.00, K=10000.00, X='' | FM-02 |
| **Centavos en 5 (empate de comisión)** | G=1.45 | R=0.15 (0.145 → mitad lejos de cero), H=1.68, K=1.68, T=0.15 | FM-03 |
| | G=2.35 | R=0.24, H=2.73 | FM-04 |
| | G=0.05 | R=0.01, H=0.06 | FM-05 |
| **Subtotal negativo** | G=−1.45, iva sí | R=−0.15, H=−1.68, K=−1.68, X='Cobrado de más' | FM-06 |
| **H ≠ total impreso** | G=4310.34, iva sí, I=5000, J=0 | H=4999.99 (no 5000.00), K=−0.01, X='Cobrado de más' [00 P-03] | FM-07 |
| LIQUIDADO con saldo | G=1000, iva sí, Constru BNT, LIQUIDADO, I=500, J=100, N=D−1 | H=1160.00, K=560.00, X='Liquidado con saldo' | FM-08 |
| LIQUIDADO sin fecha | G=1000, iva sí, LIQUIDADO, I=1160, N=null | K=0.00, X='Falta fecha de liquidación' | FM-09 |
| Cobrado de más | G=1000, iva sí, I=1000, J=200 | K=−40.00, X='Cobrado de más' | FM-10 |
| Comisión pagada de más | G=1000, iva sí, I=1160, abono 150 | S=150, T=−50.00, U=1, X='Comisión pagada de más' | FM-11 |
| IVA no corresponde (cuenta sin factura con IVA) | cuenta Elias BBVA, iva sí, K<0 | X='IVA no corresponde a la cuenta' (precede a las demás) | FM-12 |
| IVA no corresponde (inverso) | cuenta Rul HSBC, iva no | ídem | FM-13 |
| Sin cuenta | cuenta null, iva no | no hay bandera de IVA | FM-14 |
| Subtotal 0 | G=0 | H=0.00, R=0.00 | FM-15 |
| Subtotal negativo con IVA | G=−500, iva sí | H=−580.00, R=−50.00 | FM-16 |
| **Importes sin escala** | G=100.005, iva sí, I=0.001, J=0.002 | H=116.01, R=10.00, K=116.01 | FM-17 |
| Cubos de antigüedad (K>0.004, COBRANDO, L=D−100) | M=D−30 / D−31 / D−60 / D−61 / D−90 / D−91 | P=30,31,60,61,90,91; Q=0-30, 31-60, 31-60, 61-90, 61-90, Más de 90 | FM-18 |
| Instalación futura | M=D+5 | P=−5, Q=«0-30 días» | FM-19 |
| Sin instalación | M=null, L=D−45 | P=45 (cuenta desde el anticipo) | FM-20 |
| Sin fecha de anticipo con saldo | L=null, K>0 | P=null, Q=null (no entra a ningún cubo aunque deba) | FM-21 |
| FABRICACION no vence | estatus FABRICACION, K>0 | P=null | FM-22 |
| Saldo mínimo | G=0.01, iva no | K=0.01 > 0.004 ⇒ P definido | FM-23 |
| Días de cobro | L=D−20, N=D−8 / N null | O=12 / O=null | FM-24 |
| Año y mes | L=2026-10-08 / null | V=2026, W='2026-10' / null,null | FM-25 |
| Abonos | G=10000 (R=1000.00), abonos 100.00, 200.00, 50.55 | S=350.55, U=3, T=649.45; con corrección −50 ⇒ S=300.55, U=4, T=699.45 | FM-26 |
| Abono de folio inexistente | abono con folio sin proyecto | no suma en ningún S; sí en `comisiones_cobradas` | FM-27 |
| Folio repetido | segundo `insert` con el mismo `folio_hoja` | error de UNIQUE (la bandera X «Folio repetido» queda inalcanzable) | FM-28 |
| Lápida y borrado lógico | proyecto cancelado sin folio; proyecto con `deleted_at` | no aparecen en la vista | FM-29 |
| Histórica | `historica=true`, `fecha_instalacion_hist=D−70`, K>0, COBRANDO | aparece; P=70, Q='61-90 días' | FM-30 |
| Comisiones pendientes | T=0.00 / 0.01 | solo 0.01 entra a `comisiones_pendientes` (T>0.004) | FM-31 |
| Orden de X | fila que cumple varias | gana la primera de la lista | FM-32 |
| Fabricación | misma consulta | **0 filas** | FM-33 |

**Prueba diferencial FM-34.** Un oráculo en JS con aritmética decimal exacta (enteros `BigInt` con escala fija, **no** `Number`) calcula H, K, R, S, T, U, X para **20 000 filas aleatorias** (subtotales de 0–3 decimales, ~10 % terminados en 5 centavos, negativos, I/J de 0–3 decimales, estatus y cuentas al azar, abonos 0–4 por folio) y las compara con la vista: **cero diferencias**.

**Cuadre contra la hoja real FM-35 (puerta de P-03).** Un script con Apps Script `getValues()` lee A..X de las filas vivas, y compara **por folio**, con tolerancia 0.004 en importes y exactitud en texto/enteros: H, K, O, R, S, T, U, V, W, X (y P/Q el mismo día), incluyendo filas con centavos en 5, netos que no son `round2(S*1.16)`, ventas con descuento, negativos, `LIQUIDADO` con saldo y filas sin fecha de anticipo. **NO CONFIRMADO** (Q-A15): el redondeo de Sheets en un empate real de `ROUND(G*10%,2)` (centavos en 5): `numeric` da «mitad lejos de cero» sobre el valor decimal exacto; Sheets trabaja en doble precisión y pudo diferir en ~2 % de esos casos [M02 §2.4]. Esta prueba es la que lo decide **antes** de la fase 4; si Sheets resultara dar otro centavo, se documenta y se decide con Elías si manda la hoja o la base.

### 6.5 Lo que se queda en el cliente (y por qué no entra a la vista)

`ventas.saldoDe` (`ventas.js:59-66`) fuerza 0 si el proyecto está `cancelado` o `LIQUIDADO` y recorta a ≥ 0; `comisionDe` (`asistente-contexto.js:50-63`) recorta con `Math.max(0, …)` y solo «abona» con estatus `LIQUIDADO`; `rvRecalc` (`venta.js:237`) es una vista previa. Son **reglas de presentación distintas** de K/T de la hoja (la hoja **no** recorta: existen negativos). La vista replica la de la hoja; el recorte queda en el cliente [M02 §6.8-6.9].

### 6.6 Control suma todo, incluidas las ≥199 históricas (R2)

```sql
-- lo que hoy suma el Tablero (`.gs:408-524`) sobre `Ventas`, ahora sobre TODAS las filas del libro
select count(*)                                              as proyectos_registrados,      -- COUNTA(B)
       count(*) filter (where historica)                     as historicas,
       sum(g_subtotal)                                       as venta_subtotal,             -- SUM(G)
       sum(h_neto)                                           as venta_neta,                 -- SUM(H)
       sum(i_anticipo + j_liquidacion)                       as cobrado,                    -- SUM(I)+SUM(J)
       sum(k_saldo)     filter (where k_saldo > 0)           as saldo_por_cobrar,           -- SUMIF(K,">0")
       -sum(k_saldo)    filter (where k_saldo < 0)           as cobrado_de_mas,
       sum(r_comision)                                       as comisiones_generadas,       -- SUM(R)
       sum(s_abonado)                                        as comisiones_pagadas,         -- SUM(S)
       sum(t_restante)  filter (where t_restante > 0)        as comisiones_pendientes       -- SUMIF(T,">0")
  from public.ventas_calculadas where empresa_id = 'al3d';
```

La prueba HI-01 inserta 199 filas históricas (más 3 vivas y 2 con cotización) y exige que `proyectos_registrados = 204` y que **cada suma** coincida con la suma directa de las filas, de modo que ninguna agregación las pierda. Un reporte «por tipo de trabajo» con tipos combinados (`"A, B"`) **no** las cuenta hoy en ninguna fila (defecto del Tablero [M02 §3.5]); con `text[]` el cliente decide si lo reproduce o lo corrige.

---

## 7. Sincronización (R10)

**Modelo.** Se conserva la **bandeja de salida** local (`pendientes`) y su disciplina; cambia el transporte: **subir = una RPC por operación de la bandeja** (§7.4); **bajar = lectura por RLS con cursor `(updated_at, id)`** (§7.2); Realtime solo **avisa** (§4.4). La regla de sellos vive en la base (§5.4). Sin señal la app sigue con su copia local y su bandeja, como hoy [PLAN §4.4]. Lo que el plan llamaba «transporte» incluía ~15 reglas de servidor (validación por columna, compuerta de sellos, IVA por cuenta, folio `V-###`, idempotencia, orden): **ya están en las RPC** [C-14].

### 7.1 Qué baja cada rol (lectura por RLS)

| Tabla | Desempate del cursor | Dirección | Fabricación | Pagos | Tombstone |
|---|---|---|---|---|---|
| `proyectos` | `id` | sí | sí | sí | `deleted_at` |
| `ventas_dinero` | `proyecto_id` | sí | **0 filas** | sí | `deleted_at` |
| `abonos` | `id` | sí | 0 | sí | — (append-only) |
| `instalaciones` | `id` | sí | sí | sí | `deleted_at` |
| `cotizaciones` | `folio_global` | todas | 0 | las suyas | `deleted_at` |
| `solicitudes` | `id` | todas | 0 | las suyas | — (estado) |
| `cuaderno_notas` | `clave` | todas | las suyas | las suyas | `deleted_at` |
| `materiales`, `requerimientos` | `id` | sí | sí | sí | — (`activo`/`descartado`) |
| `almacen_movimientos` | `id` | sí | sí | sí | — (append-only) |
| `almacen_costos` | `id` | sí | 0 | sí | — |
| `constantes` | `clave` | sí | sí | sí | — |
| `bitacora` | `id` | los tres niveles | solo `general` | `general` y `dinero` | — |
| `miembros` | `correo` | todas | su fila | su fila | `estado='baja'` |

Una **lista vacía de RLS no significa «sin acceso»**: Fabricación recibe 0 filas de `ventas_dinero` por diseño. Solo `mi_acceso()`/`ACCESO_REVOCADO` dicen que el acceso se perdió (§7.5).

### 7.2 Bajar: cursor `(updated_at, id)`, solape, tombstones, hidratación

```
HIDRATACIÓN (teléfono nuevo o tras un borrado): cursor = (−infinito, ''), tablas en este orden:
   miembros(propia) → proyectos → instalaciones → ventas_dinero* → abonos* → cotizaciones* → solicitudes* → materiales → requerimientos
   → almacen_movimientos → almacen_costos* → constantes → bitacora (la última: la más grande)         (* si RLS devuelve filas)
VUELTA INCREMENTAL (cada vez que Realtime avisa, y cada 30 s con la app visible como RESPALDO; al volver la señal; al volver a la pestaña):
   inicio := cursor_guardado[tabla] − 30 s            -- SOLAPE: cubre el desorden de confirmación (una transacción larga confirma después de otra más nueva)
   (ts, id) := (inicio, '')
   repetir:
      GET /rest/v1/<tabla>?empresa_id=eq.<emp>
          &or=(updated_at.gt.<ts>,and(updated_at.eq.<ts>,<desempate>.gt.<id>))
          &order=updated_at.asc,<desempate>.asc&limit=500                       -- 500 < max_rows 1000: el servidor TRUNCA SIN ERROR por encima del tope
      aplicar cada fila:  upsert por llave si fila.updated_at > la local o la local no existe   (idempotente: releer lo ya visto no hace nada)
                          fila con deleted_at -> borrar de la copia local (tombstone)
      si recibió < 500 -> fin de la tabla;  si no, (ts, id) := (updated_at, desempate) de la última fila
   cursor_guardado[tabla] := updated_at máximo VISTO en la ronda (del SERVIDOR; nunca el reloj del teléfono)
```

| Pregunta | Respuesta |
|---|---|
| ¿Por qué solape de 30 s? | `updated_at` lo pone el trigger con `clock_timestamp()` al **escribir**, pero la fila solo es visible al **confirmar**: una transacción que tarde puede confirmar con `updated_at` anterior al cursor de un cliente que ya vio otra más nueva. Las RPC de cliente duran milisegundos (`statement_timeout` de 8 s para `authenticated`); el importador escribe en lotes ≤200 filas (<5 s). 30 s cubre ambos con margen [M03 H4] |
| ¿Por qué no un número de secuencia? | una `identity`/`SEQUENCE` puede hacer visibles filas con número **menor** después de que un cliente vio uno mayor; la hoja lo evitaba con un candado global [M03 H4]. `almacen_movimientos.seq` existe como orden de llegada serializado por el contador, pero el cursor es el mismo `(updated_at,id)` para todas las tablas (menos piezas) |
| ¿Y los borrados? | **no hay borrados duros**; el borrado es `deleted_at` y viaja como una fila más (tombstone). Sin esto «los borrados no se propagan» (el barrido de `ventas_hoja` los inferían por ausencia, `sync.js:823-837`) [N-12; C-18]. Realtime no aplica RLS a `DELETE`, por eso tampoco se usa |
| ¿Qué pasa si se pierde el cursor? | se repite la hidratación: es idempotente |
| ¿Y lo que hacía el sondeo de 30 s además de la hoja? | la misma vuelta corría Drive (`Carpetas.alDia`) y la expansión de links de Maps (`app.js:2085-2111`): al retirar el sondeo esas dos necesitan **su propio disparador** (siguen en Apps Script y en la Edge Function `maps`) [C-18; M09 §9.8] |
| Fabricación y `ventas_dinero` | el cliente de Fabricación **no la pide**; si la pidiera recibiría 0 filas |

### 7.3 Idempotencia por id de cliente

| Operación | Mecanismo | Reintento |
|---|---|---|
| crear proyecto / lápida / venta | `proyectos.id` (PK) y `unique (empresa_id, folio_global)` | mismo `id` ⇒ `ya_existia`; otro `id` con el mismo folio ⇒ `DUPLICADO` |
| actualizar obra | la compuerta: empate escribe el mismo valor; mismo valor y mismo sello no escribe nada | converge |
| mover etapa | misma etapa ⇒ `sin_cambio` | converge |
| instalación | `instalaciones.id` + una viva por proyecto | converge |
| movimiento de almacén | PK `(empresa_id, id)` (y `mov-salida:<req.id>`) | `ya_estaba` |
| materiales / requerimientos | por campo con sello; `estado` monótono | converge |
| solicitar | re-pedir sobrescribe la pendiente | converge |
| cancelar / rechazar / revocar | estados terminales | `estado:null` / `NO_ENCONTRADO` |
| `registrar_autorizacion` | misma decisión ⇒ `repetida` | converge |
| **cobro, abono, reparto** (acumulativos) | **`op_id`** único: `bitacora(empresa_id, op_id)` para cobros; `abonos(empresa_id, op_id, folio_hoja)` para abonos y repartos | devuelve el **mismo** resultado de la primera vez |
| `subida_unica` | `folio_global` y `op_id = 'tel:'||disp||':'||id` | acuse `ya_estaba` |

El `op_id` lo genera el cliente **al crear la operación** (el id de la bandeja `op-…`), no al enviarla: un reintento reenvía el mismo.

### 7.4 Subir: una RPC por operación de la bandeja

`sync.encolar` sigue produciendo `{id, tipo, almacen, registro_id, datos, campos, ts, disp}`; el **traductor de forma** del cliente decide la RPC (esto no es diseño de cliente: es el contrato que la base ofrece) [M05 §8.2]:

| Operación de la bandeja | RPC | Traducción de nombres |
|---|---|---|
| `proyectos` / `crear` (nació de una cotización) | `ganar_proyecto` | `fecha_ganado→fecha_anticipo`, `anti_pactado→venta.anti`, `sub→venta.sub`, `estatus_notion→estatus`; `sellos` por grupo |
| `proyectos` / `crear` con `etapa='cancelado'` (lápida) | `descartar_cotizacion` | |
| `proyectos` / `actualizar`, `campos ⊆ {etapa}` | `mover_etapa` | |
| `proyectos` / `actualizar`, campos de dinero (`anti_pactado`, `cuenta`, `estatus_notion`, `pct_comision`) o el nombre desde Pagos | `corregir_venta` | `anti_pactado→anticipo`, `estatus_notion→estatus` |
| `proyectos` / `actualizar`, el resto | `proyecto_actualizar` | `sellos` por grupo, no por nombre de columna |
| `proyectos` / `actualizar` que re-sincroniza `origen` | `proyecto_actualizar` (`origen`, Dirección) | la base lo parte |
| `instalaciones` / cualquiera | `instalacion_guardar` | `anexo` en vez de `notas` completas |
| `movimientos` / `materiales` / `requerimientos` | `almacen_aplicar` en lotes de ≤25 consecutivas | sin `sync` |
| `constantes` | `constante_guardar` | |
| `avisos` | sin destino: queda `sin_destino` (se recalculan en cada teléfono) | |
| «Registrar venta» del cotizador (hoy `/empujar` directo con el token, fuera de la bandeja, `venta.js:299-436`) | `ganar_proyecto`, **por el mismo transporte y con sellos** | un reintento ya no puede regresar la etapa [P-08] |
| cobro, abono, reparto, corrección (nuevas) | RPC de Pagos con `op_id` | |

**Sobre de respuesta y qué hace la bandeja con él** (reemplaza a `{ok, codigo, mensaje, definitivo, …}` del puente):

| Respuesta | La bandeja |
|---|---|
| `ok:true` (con `viejos[]` y `rechazadas[]` informativos) | borra la operación; `remoto` actualiza la copia local (nunca trae dinero a quien no lo ve) |
| `ok:false`, `definitivo:true` (`ROL_SIN_PERMISO`, `NO_ENCONTRADO`, `DATO_INVALIDO`, `DUPLICADO`) | la **aparta** como `rechazada`, conservándola con su razón; el bombeo sigue |
| `ok:false`, `ACCESO_REVOCADO` / `SIN_ACCESO` / `CLIENTE_VIEJO` (no definitivos) | **detiene el bombeo sin descartar nada**; `ACCESO_REVOCADO` activa el flujo de §7.5; `CLIENTE_VIEJO` muestra «actualiza la app» |
| error de red / 5xx / `DESCONOCIDO` | se queda `pendiente`; se reintenta por los disparadores existentes (1.5 s tras encolar, 30 s con la app visible, `online`, al volver a la pestaña) |

Observación heredada que **no se arregla en la base**: `esperaMs` (backoff exponencial) **no tiene llamadores** y un error no definitivo se reintenta para siempre [C-15; M06 §3.5]. Con envoltorio explícito, la base no produce errores «ni definitivos ni transitorios» de negocio; el tope de reintentos del cliente queda como mejora recomendada, no como requisito de este esquema.

### 7.5 `acceso_revocado` y el borrado local (R8, [DEC Q-09])

Lo que **la base** garantiza: (1) la señal es **explícita y única** (`mi_acceso().estado = 'acceso_revocado'`, `ACCESO_REVOCADO` en una escritura, o el evento Realtime/lectura de la propia fila `miembros` en `baja`); (2) **nunca** se produce por falta de señal, lista vacía de RLS ni JWT vencido (el JWT vencido es un `401` de PostgREST, distinto); (3) quitar el acceso corta la lectura y la escritura **en la siguiente petición**; (4) la fila `baja` queda como evidencia con quién y cuándo.

Lo que **el cliente** debe cumplir (tres candados; todo deshabilitado hasta que exista `subida_unica` en producción):

| Candado | Condición | Dónde se apoya en la base |
|---|---|---|
| 1 | borrar solo ante la **respuesta explícita**, tras una segunda consulta de `mi_acceso()` con ≥ 5 s de separación (hoy un falso «fuera» ya cerró una sesión de verdad, `puerta.js:376-392`) | `mi_acceso()` es la única fuente |
| 2 | solo si la **bandeja está vacía** y todo lo local con datos del negocio tiene **acuse** de `subida_unica`; si no, se **bloquea la pantalla** y no se borra | el acuse por registro (`creada`/`ya_estaba`) |
| 3 | se conservan `al3d_pf_disp` y `al3d_folio` | `contadores('folio_cot:<disp>')` tiene su máximo |

Límite honesto (se dice así a Dirección): un teléfono que **no vuelve a conectarse** conserva sus datos; sin conexión no hay forma de borrarlos [PLAN §4.8]. La lista de lo que se borra (las dos IndexedDB, >20 claves de `localStorage`, cachés del service worker) está en §3.6.

### 7.6 Versión de contrato y flota mezclada

| Pieza | Regla |
|---|---|
| `public.version_contrato()` | `{actual: 1, minimo: 1, esquema: 'al3d-1'}`; cambia en una migración |
| Cabecera `x-al3d-contrato` | las RPC de escritura la leen de `request.headers`; ausente o `< minimo` ⇒ `CLIENTE_VIEJO` (no definitivo). Reemplaza a `VERSION_ESPERADA` y a los umbrales por función 9/11/12/14: **una sola versión, sin umbrales**, porque el esquema se migra de golpe [M05 §5.6] |
| `mi_acceso().contrato` | el cliente compara al arrancar y muestra el aviso sin bloquear lectura |
| Teléfonos viejos que siguen hablando con el Apps Script tras el corte | no tocan la base; la hoja es espejo y su siguiente escritura los pisa: vigilar «Bitácora del puente» y, antes de retirar `/empujar`, hacer que conteste un código que el cliente viejo trate como «actualiza la app» [P-10; N-14] |

La versión es **una sola función**: `guardia_contrato` (§4.1) y `mi_acceso().contrato` la leen, así que subir el contrato es una migración con este `create or replace`.

```sql
create function public.version_contrato() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('actual', 1, 'minimo', 1, 'esquema', 'al3d-1') $$;
```

### 7.7 Qué parte de la sincronización NO es de la base (para que nadie la busque aquí)

`obraDeLaFila`/`ocupados` (reconciliación de lo local con lo remoto), la bandeja y sus estados, `frescura()`, la caché local, el sondeo de Drive y de Maps, el token de Google Calendar de cada persona, y el login (Q-08): son del cliente y de las Edge Functions.

### 7.8 Espejo hacia la hoja (solo lectura, permanente) [PLAN §4.5; DEC Q-10]

La Edge Function `espejo` (con `service_role`) lee dos vistas y llama a la ruta `espejo` del Apps Script con un **secreto compartido** (propiedad del script y secreto de la función; comparación en tiempo constante) [DEC Q-12].

```sql
create view public.espejo_ventas with (security_invoker = true) as          -- una fila por venta del libro; SOLO columnas capturadas
select p.empresa_id, p.updated_at, d.updated_at as dinero_updated_at,
       p.folio_hoja                                           as a_folio,
       p.nombre                                               as b_proyecto,
       p.estatus                                              as c_estatus,
       d.cuenta                                               as d_cuenta,
       array_to_string(p.tipo_trabajo, ', ')                  as e_tipo,
       case when p.iva then 'Sí' else 'No' end                as f_iva,
       d.subtotal                                             as g_subtotal,
       d.anticipo                                             as i_anticipo,
       d.liquidacion                                          as j_liquidacion,
       p.fecha_anticipo                                       as l_fecha_anticipo,
       coalesce(i.fecha, p.fecha_instalacion_hist)            as m_fecha_instalacion,
       d.fecha_liquidacion                                    as n_fecha_liquidacion,
       p.folio_global                                         as y_folio_cotizacion,
       case p.etapa when 'ganado' then 'Ganado' when 'en_diseno' then 'En diseño' when 'cortado' then 'Cortado' when 'armado' then 'Armado'
                    when 'listo' then 'Listo para instalar' when 'instalado' then 'Instalado' when 'garantia' then 'En garantía'
                    when 'cancelado' then 'No se dio' end     as z_etapa,
       i.hora                                                 as aa_hora,
       case when p.lat is not null then p.lat::text || ',' || p.lng::text else p.maps_url end as ab_ubicacion,
       p.dir_texto                                            as ac_direccion,
       d.pct_comision                                         as ad_pct,
       p.tel                                                  as ae_telefono,
       case p.entrega when 'instalacion' then 'Instalación' when 'paqueteria' then 'Paquetería' when 'recoleccion' then 'Recolección en taller' else '' end as af_entrega,
       p.notas                                                as ag_notas,
       case p.plazo_k when 1 then '1 semana' when 2 then '1.5 semanas' when 3 then '2 semanas' when 4 then '2.5 semanas' when 5 then '3 semanas o más' else '' end as ah_plazo,
       (select json_object_agg(m.k, m.v)::text from (values
            ('Etapa de obra',     (p.sellos ->> 'etapa')::bigint),    ('Fecha instalacion', (p.sellos ->> 'instalacion')::bigint),
            ('Ubicacion',         (p.sellos ->> 'ubicacion')::bigint),('Direccion',         (p.sellos ->> 'dir_texto')::bigint),
            ('Telefono',          (p.sellos ->> 'tel')::bigint),      ('Entrega',           (p.sellos ->> 'entrega')::bigint),
            ('Notas',             (p.sellos ->> 'notas')::bigint),    ('Plazo taller',      (p.sellos ->> 'plazo_k')::bigint)) as m(k, v)
         where m.v is not null)                               as ai_sellos
  from public.proyectos p
  join public.ventas_dinero d on d.proyecto_id = p.id and d.empresa_id = p.empresa_id
  left join lateral (select x.fecha, x.hora from public.instalaciones x where x.proyecto_id = p.id and x.estado <> 'cancelada' and x.deleted_at is null order by x.fecha limit 1) i on true
 where p.deleted_at is null and d.deleted_at is null and p.folio_hoja is not null;

create view public.espejo_abonos with (security_invoker = true) as          -- «Abonos comisión» A, C, D, E, F (B es fórmula de la hoja)
select a.empresa_id, a.id, a.updated_at, a.folio_hoja as a_folio, a.importe as c_importe, a.fecha as d_fecha, a.nota as e_nota, a.pago_id as f_pago from public.abonos a;
-- revoke all on ambas de public, anon, authenticated;  grant select a service_role (solo)
```

| Regla del espejo | Detalle |
|---|---|
| Qué escribe | solo `A:G, I:J, L:N, Y:AI` de «Ventas» y A, C, D, E, F de «Abonos comisión»; **nunca** H, K, O:X (fórmulas) ni crea pestañas |
| Dónde | localiza la fila por **folio (col. A)**, nunca por número de fila (`ordenarVentas` las reacomoda) |
| Formato | pone `@` antes de escribir `Hora instalacion`, `Telefono`, `Notas`, `Sellos` (`horasATexto`, `.gs:2661`); aplica la protección anti-fórmula (`textoProtegido`, `.gs:4394`: antepone `'` a lo que empiece con `= + - @`) que en la base **no** se guarda |
| Candado | toma `LockService.getScriptLock()` (30 s), como los formularios [M02 §6.18] |
| Cursor | `contadores('*','espejo:ventas').texto = '<updated_at>|<id>'`, con el mismo solape de 30 s; **reconciliación completa periódica** e idempotente (una edición manual a una fila que la base no vuelve a tocar nunca se corregiría sola) [N-14] |
| Capacidad | compara `count(*)` del libro con `FIN − 1` (309 hoy); si no cabe, responde `capacidad_agotada` y **no** escribe parcial; subir `FIN` (y todos los `$2:$310`) es un paso del despliegue, no de esta rama [P-09; DEC Q-10] |
| Disparadores | `alEditar`, `normalizarIvaActivos` y `ordenarVentas` quedan inocuos en modo espejo (que no reescriban lo que la base mandó); `enviarResumen` sigue [M02 §6.19] |
| Visibilidad | una celda «última sincronización» y alarma si pasa de N horas; si el espejo falla, la base sigue bien y se reintenta |
| Riesgo | la hoja espejo contiene **todo el dinero** fuera de RLS: su permiso de Drive no debe incluir a Fabricación (`R-05`, §11) |

---

## 8. Cupos y contadores (R11)

**Principio:** una Edge Function o una RPC **no guardan estado**; todo lo que hoy es `PropertiesService`/`CacheService` del script vive en `contadores` y se toca solo desde funciones `SECURITY DEFINER` (`authenticated` no puede ni leerla). Es la única tabla **sin** el trigger `sin_borrar`: las ventanas vencidas se limpian solas (borrado perezoso de hasta 20 filas por llamada), no por `pg_cron` (que PGlite no tiene).

| Clave (`clave`) | `empresa_id` | `ventana` | Para qué | Quién |
|---|---|---|---|---|
| `V` | `al3d` | `''` | folio `V-###` de la hoja (`FOLIO_MAS_ALTO`) | `ganar_proyecto`, `alta_venta` (`interno.siguiente`); sembrado con `contador_sembrar` |
| `P` | `al3d` | `''` | id de depósito `P-###` | `repartir_abono_fifo`; sembrado |
| `alm` | `al3d` | `''` | `almacen_movimientos.seq` (`ALMACEN_SECUENCIA`) | trigger `movimientos_seq`; sembrado |
| `ia:<uid>` | `*` | `yyyymmdd` (día en `America/Mexico_City`) | cuota IA por persona (200/día) | `ia_cuota` |
| `ia_turno:<prov>` | `*` | `''` | turno de llaves (`IA_ROTACION`) | `ia_turno` |
| `ver:<hash24(UPPER(folio corto))>`, `ver:total`, `ver:ip:<hash24>` | `*` | número de ventana de 600 s | cupo de `/verificar` | `verificar_cupo` |
| `folio_cot:<disp>` | `*` | `''` | máximo folio `COT-NNNN` visto de ese aparato (acuse de `subida_unica`) | `subida_unica` |
| `espejo:ventas`, `espejo:abonos` | `*` | `''` | cursor del espejo (`texto = '<updated_at>|<id>'`) | Edge `espejo` vía `service_role` |

```sql
create function interno.siguiente(p_empresa text, p_clave text, p_ventana text default '', p_n bigint default 1)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if p_n is null or p_n < 1 then raise exception 'p_n debe ser >= 1'; end if;
  insert into public.contadores as c (empresa_id, clave, ventana, n) values (p_empresa, p_clave, p_ventana, p_n)
  on conflict (empresa_id, clave, ventana) do update set n = c.n + p_n, updated_at = clock_timestamp()
  returning c.n into v;
  return v;                    -- el ON CONFLICT DO UPDATE toma el candado de la fila hasta el COMMIT: números en orden de confirmación
end $$;

create function public.contador_sembrar(p_empresa text, p_clave text, p_minimo bigint) returns bigint     -- solo service_role
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into public.contadores as c (empresa_id, clave, ventana, n) values (p_empresa, p_clave, '', greatest(p_minimo, 0))
  on conflict (empresa_id, clave, ventana) do update set n = greatest(c.n, excluded.n), updated_at = clock_timestamp()
  returning c.n into v;
  return v;
end $$;
```

### 8.1 Cuota de IA: día en `America/Mexico_City` (R11, [DEC Q-19])

Hoy el día es **GMT** (`yyyyMMdd` en UTC) y por eso el tope de 200 se reinicia a las **18:00 de México** [M01 §2.5]. Aquí el día se cuenta en `America/Mexico_City`. La cuenta se hace **antes** de llamar al proveedor y es atómica.

```sql
create function public.ia_cuota(p_usuario uuid, p_limite int default 200, p_ahora timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_dia text := interno.dia_mx(p_ahora); v_n bigint;
begin
  if p_usuario is null or p_limite is null or p_limite < 1 then return interno.err('DATO_INVALIDO', 'Falta el usuario o el tope.'); end if;
  delete from public.contadores where ctid in (                    -- limpieza perezosa: días de hace más de 3
    select ctid from public.contadores where clave like 'ia:%' and ventana < interno.dia_mx(p_ahora - interval '3 days') limit 20);
  insert into public.contadores as c (empresa_id, clave, ventana, n) values ('*', 'ia:' || p_usuario::text, v_dia, 1)
  on conflict (empresa_id, clave, ventana) do update set n = c.n + 1, updated_at = clock_timestamp() where c.n < p_limite
  returning c.n into v_n;                                          -- si ya llegó al tope, el WHERE no actualiza y no devuelve fila
  if v_n is null then
    return interno.err('CUPO_AGOTADO', 'Llegaste al tope de ' || p_limite || ' consultas de IA por hoy. Mañana se reinicia.',
                       jsonb_build_object('transitorio', false, 'limite', p_limite, 'dia', v_dia));
  end if;
  return jsonb_build_object('ok', true, 'usadas', v_n, 'limite', p_limite, 'dia', v_dia);
end $$;

create function public.ia_turno(p_prov text, p_n int) returns int language sql security definer set search_path = '' as $$
  select (interno.siguiente('*', 'ia_turno:' || p_prov, '', 1) % greatest(p_n, 1))::int $$;       -- reemplaza a IA_ROTACION
```

### 8.2 Cupo de `/verificar`: ventanas de 600 s (R11)

Se conservan los topes de hoy: **30 por folio corto y 400 en total por ventana fija de 600 s** (`VERIFICAR_POR_FOLIO`, `VERIFICAR_EN_TOTAL`, `.gs:4021-4031, 4079-4088`), y se agregan dos cosas que `CacheService` no podía: el folio se cuenta **en mayúsculas** (hoy `cot-0042` y `COT-0042` son cubetas distintas y el tope por folio es burlable, [M04 §3]) y un tope **por IP** (`Q-A10`: 60 por ventana, el hash lo manda la Edge Function desde `x-forwarded-for`; se omite si no hay IP). Se cuenta **antes** de buscar y aunque la consulta sea inválida *de contenido* (una **forma** inválida del folio no llega aquí: la Edge Function la responde sin cupo, como hoy). Un fallo de la base **no deja pasar**: la Edge Function responde error explícito (hoy `CacheService` falla abierto, `catch → true`).

```sql
create function public.verificar_cupo(p_folio_corto text, p_ahora timestamptz default now(), p_ip text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_w bigint := floor(extract(epoch from p_ahora) / 600)::bigint;
        v_k text   := 'ver:' || left(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(upper(coalesce(p_folio_corto, '')), 'UTF8')), 'hex'), 24);
        n1 bigint; n2 bigint; n3 bigint := 0;
begin
  delete from public.contadores where ctid in (                    -- ventanas de hace más de 6 (1 h)
    select ctid from public.contadores
     where clave like 'ver:%' and (case when ventana ~ '^[0-9]+$' then ventana::bigint end) < v_w - 6 limit 20);
  n1 := interno.siguiente('*', v_k,         v_w::text, 1);
  n2 := interno.siguiente('*', 'ver:total', v_w::text, 1);
  if p_ip is not null then
    n3 := interno.siguiente('*', 'ver:ip:' || left(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_ip, 'UTF8')), 'hex'), 24), v_w::text, 1);
  end if;
  if n1 <= 30 and n2 <= 400 and n3 <= 60 then return jsonb_build_object('ok', true, 'n_folio', n1, 'n_total', n2); end if;   -- la 31.ª del folio y la 401.ª total se rechazan (T-N:274-277, 438-440)
  return interno.err('SIN_RED', 'Demasiadas consultas seguidas. Espera unos minutos.');
end $$;
```

**Cómo se conecta con los módulos que ya están en el worktree** (`supabase/functions/_shared/verificar.js` e `ia.js`; son lógica pura que recibe sus dependencias). `verificarPublico` espera un `contarCupo(clave, ventana) → n` y decide 30/400 en JS (`decidirCupo`), con las claves `v_<FOLIO>` y `v__total` y **sin** tope por IP; `ia.js` espera «la cuenta de la persona hoy, contando esta consulta» y decide en `decidirCuota` (la 200 pasa, la 201 no), con el día que calcula `cuotaDelDia(ahora, 'America/Mexico_City')`. Las dos decisiones están **también en SQL** (`verificar_cupo`, `ia_cuota`) con los mismos topes y los mismos textos (`MENSAJE_CUPO`, «Llegaste al tope de 200 consultas de IA por hoy. Mañana se reinicia.»), para que la regla se verifique en PGlite (CU-01..CU-15) y para que ni el día de México ni el tope por IP dependan de que la Edge Function los calcule bien. La Edge Function llama **una vez** a la RPC y, si no es `ok`, devuelve su sobre tal cual (429 / `CUPO_AGOTADO`); a `verificarPublico` le pasa un `contarCupo` que devuelve 1 (para no contar la misma consulta dos veces). Lo que no debe hacer es contar con dos contadores distintos ni con el día GMT (C-14).

### 8.3 Contadores de folio y de pago

- **`V-###`**: `interno.folio_texto('V', n)` (§2.1): mínimo 3 dígitos y `V-1000` no se trunca. Ojo: `lpad(n::text, 3, '0')` **trunca** un texto más largo que el ancho (`lpad('1000', 3, '0')` da `'100'`): lo encontró la prueba PG-21 al correr el pseudocódigo, y por eso el ancho es `greatest(3, length(n::text))`. Se siembra con `contador_sembrar('al3d','V', max(A de «Ventas», «Ventas (respaldo)», «Bitácora del puente» col. C, «Abonos comisión» col. A))` **antes** de abrir escritura [C-28; M04 §4.5]. `recordarFolio` (subir la marca si un teléfono pregunta por un folio borrado) **ya no hace falta**: no hay borrado y la base es la única que reparte.
- **`P-###`**: `interno.folio_texto('P', n)`: la hoja desbordaba a `P-000` al llegar a 1000 (`('000'+(max+1)).slice(-3)`); aquí sale `P-1000`. Sembrado con el máximo `P-###` de «Abonos comisión».
- **Folio impreso `COT-NNNN-L`**: **no es de la base.** Sigue siendo contador por aparato (`al3d_folio`) [DEC Q-07]; la base solo garantiza `unique (empresa_id, folio_global)` y registra el máximo por aparato (`folio_cot:<disp>`). Ningún `COT-NNNN` ya impreso cambia.
- **`seq` del almacén**: orden de llegada del libro; sembrado con el valor de `ALMACEN_SECUENCIA`.

---

## 9. Orden de migraciones y qué simula el shim de PGlite

### 9.1 Archivos (carpeta `supabase/migrations/`)

Cada archivo hace sus propios `GRANT`/`REVOKE` y `ENABLE ROW LEVEL SECURITY` [DEC A.4]. Un archivo no depende de nada posterior.

| Archivo | Contenido | Depende de |
|---|---|---|
| `0001_fundacion.sql` | privilegios por defecto (§4.2), esquema `interno`, triggers comunes (`tocar`, `sin_borrar`, `solo_agregar`), utilidades puras (`err`, `ahora_ms`, `sello_valido`, `compuerta`, `sellos_validos`, `contiene_dinero`, `telefono_limpio`, `orden_etapa`, `folio_texto`, `pesos`, `neto`, `comision`, `hoy_mx`, `dia_mx`, `items_auth_a_json`, `renglones_a_json`), tablas `empresas`, `contadores` (+`siguiente`), `bitacora`, semilla `al3d` | — |
| `0002_acceso.sql` | `miembros`, helpers de RLS (`empresas_donde`, `ctx` y su tipo `contexto_t`, `correo_verificado`, `guardia_contrato`, `matriz_permisos`, `anotar`), RPC `mi_acceso`, `reclamar_acceso`, `miembro_alta`, `miembro_cambiar_area`, `miembro_baja`, `version_contrato` | 0001 |
| `0003_proyectos.sql` | `proyectos`, `ventas_dinero`, `instalaciones`, `abonos`, triggers de inmutabilidad (`proyectos_inmutable`, `instalaciones_inmutable`, `ventas_dinero_libro`), índices, RLS y políticas; `partir_origen` (+ `solo_claves`, `sin_claves`), `limpiar_cotizacion` | 0001, 0002 |
| `0004_formulas.sql` | vistas `ventas_calculadas`, `comisiones_pendientes`; `normalizar_iva`; `comisiones_cobradas` | 0003 |
| `0005_almacen.sql` | `materiales`, `requerimientos`, `almacen_movimientos` (+trigger `seq`), `almacen_costos`, `constantes`; RLS; `almacen_aplicar` (+`almacen_una`), `constante_guardar` | 0001–0003 |
| `0006_rpc_obra.sql` | `ganar_proyecto`, `descartar_cotizacion`, `alta_venta`, `proyecto_actualizar`, `mover_etapa` (+ `mover_etapa_core`, `emitir_salidas`), `instalacion_guardar`, `emitir_salidas_derivadas` | 0003, 0004, 0005 (la salida del corte lee `requerimientos` y escribe `almacen_movimientos`) |
| `0007_rpc_pagos.sql` | `registrar_cobro`, `registrar_abono_comision`, `repartir_abono_fifo`, `vista_previa_reparto`, `corregir_venta`, `corregir_abono` | 0004 |
| `0008_notario.sql` | `autorizaciones` (+trigger), `cotizaciones`, `solicitudes`, `cuaderno_notas`; RLS; `cotizacion_guardar`, `solicitar`, `cancelar_solicitud`, `rechazar_solicitud`, `revocar_autorizacion`, `estado_solicitudes`, `cuaderno_guardar`, `subida_unica`; **service_role:** `registrar_autorizacion`, `autorizacion_para_verificar` | 0002, 0003 |
| `0009_cupos.sql` | `ia_cuota`, `ia_turno`, `verificar_cupo`, `contador_sembrar` | 0001 |
| `0010_sync_espejo.sql` | índices de cursor que falten, vistas `espejo_ventas`, `espejo_abonos`, `cuadre_hoja`, publicación `supabase_realtime` y `replica identity default` | todas |
| `0011_auditoria.sql` | bloque `DO $$ … $$` que **aborta la migración** si: alguna tabla de `public` no tiene RLS; alguna función de `public`/`interno` es ejecutable por `anon`/`PUBLIC` salvo la lista permitida; alguna vista sin `security_invoker`; alguna tabla publicada con `replica identity full`; o cualquier tabla de negocio con `INSERT/UPDATE/DELETE` para `authenticated` (la misma comprobación que GR-01..GR-08, pero dentro del despliegue) | todas |

**Archivos opcionales (`supabase/opcional/`; no se corren en PGlite; cada uno se aplica por separado en el proyecto real):**

| Archivo | Contenido | Por qué es opcional |
|---|---|---|
| `storage.sql` | bucket privado `cotizacion-imagenes`, políticas sobre `storage.objects` por prefijo `<empresa>/` | requiere el esquema `storage` de Supabase |
| `respaldo.sql` | tarea de respaldo semanal (Edge `respaldo` + Apps Script a Drive) | `pg_cron`/`pg_net`/`vault` |
| `keepalive.md` | el flujo de GitHub Actions cada 2 días contra la Edge Function pública `salud` (la pausa del plan Free es a la semana) | no es SQL |
| `semilla_materiales.mjs` | siembra las 19 filas de `datos/semilla.json` y las 20 constantes por empresa | datos, no esquema |

### 9.2 El arnés de PGlite que ya está en el worktree (PostgreSQL 18 en WASM; **sin** `pg_cron`/`pg_net`/`vault`/pgTAP)

El worktree trae un arnés (`supabase/tests/`, hecho antes de este diseño): PGlite 0.5.8 (PostgreSQL 18), el shim `arnes/shim.sql`, `arnes/arnes.mjs` (`crearBase`, `clonarBase`, `sql`, `crearUsuarioAuth`, `como`, `auditarRLS`, `exigirAuditoriaLimpia`), el mini marco `arnes/marco.mjs` (`describir`, `prueba`, `igual`, `cierto`, `esperarError`, `dato`) y `correr.sh` (corre cada `*.mjs` de `supabase/tests/` y de sus subcarpetas de un nivel, salvo `arnes/`). **Este diseño lo usa tal cual**; no necesita ninguna pieza que el shim no traiga. El diseño **no usa ninguna extensión de Supabase en el núcleo**: ni `pgcrypto` (el HMAC está en la Edge Function; los hashes usan `sha256()` y `md5()` del catálogo), ni `pg_cron` (la limpieza es perezosa), ni Vault (el sello **no** está en la base).

| Pieza | Lo que da el arnés | Lo que el diseño necesita de ella |
|---|---|---|
| Roles | `anon`, `authenticated`, `service_role` (`BYPASSRLS`) y `authenticator` | `postgres` (superusuario de PGlite) es el dueño de las funciones y **salta RLS igual que en Supabase**; las RPC `SECURITY DEFINER` corren como él |
| Esquema `auth` | `auth.uid()`, `auth.role()`, `auth.email()`, `auth.jwt()` (leen `request.jwt.claims` y la clave suelta `request.jwt.claim.sub`); `auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, …)` que `anon` y `authenticated` **no** pueden leer | `correo_verificado()` solo lee `email` y `email_confirmed_at` y el claim `is_anonymous` **del JWT**, no una columna que el arnés no trae (`S-01`). Un usuario sin verificar: `crearUsuarioAuth(db, {verificado:false})`; uno anónimo: `como(db, {claims:{is_anonymous:true}})` |
| Privilegios por defecto | **ninguno** sobre `public` (equivale a «exponer tablas automáticamente» APAGADO); las **funciones** nacen con `EXECUTE` para `PUBLIC`, como en Postgres | `0001` hace `alter default privileges … revoke execute on functions from public` (§4.2) y la auditoría lo comprueba |
| Publicación | `supabase_realtime`, vacía | `0010` agrega las 13 tablas (GR-05); se prueban las políticas y el catálogo (§4.4), no el servicio Realtime |
| Cabeceras | `como(db, {cabeceras:{'x-al3d-contrato':'1'}})` las pone en `request.headers` (llaves en minúsculas) | `guardia_contrato` (§4.1) |
| Sesiones | `como(db, {rol, uid, correo, verificado, claims, cabeceras, confirmar})` → `.query`, `.intentar`, `.rpc` (argumentos con nombre, como PostgREST), `.transaccion`; **cada petición se DESHACE por omisión** (`confirmar:true` la persiste) y limpia la sesión; hay UNA conexión y una cola evita que dos peticiones se mezclen | los casos de §10 se escriben así: permitido **y** denegado por rol. Lo que debe quedar para el caso siguiente se confirma (`confirmar:true`) |
| Auditoría | `auditarRLS(db, {esquemas:['public','interno'], expuestos:['public']})`: tablas sin RLS, vistas sin `security_invoker`, `SECURITY DEFINER` sin `search_path`, funciones ejecutables por `anon` | cubre GR-01 (en `public`), GR-03, GR-04 y GR-07; GR-02, GR-05, GR-06 y GR-08..GR-10 son consultas al catálogo (`has_function_privilege`, `pg_publication_tables`, `relreplident`, `role_table_grants`) |
| Zona horaria y colación | la sesión va en UTC, como Supabase; la colación es `C` (la de Supabase, `en_US.UTF-8`) | `America/Mexico_City` **existe** en PGlite 0.5.8 (verificado: CU-03/CU-04 pasan sin ningún desfase a mano, `S-02`); ningún caso depende del orden de texto: los folios `V-###` se ordenan por su número (PG-18) |

**Lo que PGlite NO valida** y dónde se cubre: PostgREST (`max_rows` de 1000, filtros `or=(…)`, embedding, el GUC `request.headers` real) → proyecto de pruebas de Supabase + prueba de navegador `dos-telefonos`; el servicio Realtime (entrega de eventos a suscriptores) → proyecto de pruebas; Storage y sus políticas; Edge Functions (HMAC, `verificar`, `ia`, `maps`, `espejo`) → pruebas de Deno con los vectores de [M04 §1.8]; el `statement_timeout` de 8 s de `authenticated`; concurrencia real entre dos conexiones (las pruebas de PGlite son de una sola conexión: las invariantes de concurrencia se **argumentan por construcción** —candados de fila, `ON CONFLICT`, índices únicos— y se verifican en el proyecto de pruebas con dos clientes). Antes de decir «funciona en Supabase» recordar que PGlite valida el SQL y las políticas, pero la validación real es en el proyecto `al3d-pruebas`.

**Lo que ya se verificó al escribir este diseño** (con el arnés de arriba; 171 comprobaciones, todas en verde). **(1) El SQL del documento:** los bloques de §2.1–§2.18, §4.1, §4.2, §4.4, §5.2, §5.4, §5.7, §5.14, §6.1, §7.8 y §8 se armaron en el orden de §9.1 y se cargaron **sin error**; 77 comprobaciones: `auditarRLS()` limpia; `anon` sin `EXECUTE` en ninguna función; GR-06 y GR-08; la compuerta (SE-21, SE-22), `telefono_limpio`, `sellos_validos`, `contiene_dinero` (PX-04) y `folio_texto`; R1-05 (el `CHECK` rechaza precios, también para `service_role` en el camino del importador); **FM-01..FM-31 contra la vista** con el valor calculado a mano (H = 4999.99, centavos en 5, los seis cubos de antigüedad, histórica, abonos con corrección); RLS por rol sobre las tablas y las dos vistas; libros y triggers (`solo_agregar`, `seq` por empresa, `uid_ics`, una instalación viva, una autorización vigente por folio, lo firmado inmutable, texto verbatim con U+2028 y emoji, `proyectos_libro`, `proyectos_historica`); CU-01, CU-03..CU-15 (cupos, día de México, `siguiente`, `contador_sembrar`, limpieza perezosa); GR-05. **(2) El pseudocódigo de las RPC:** se tradujo a PL/pgSQL **solo para la prueba** (no es parte del diseño) y se corrió contra el esquema: **31 de las 37 RPC** (acceso, ganar/descartar/alta, `proyecto_actualizar` con la compuerta, etapa y salidas, pagos y reparto FIFO, instalaciones, almacén, notario completo, subida única, constantes y cuaderno) más las 4 de cupos que ya son SQL: 94 comprobaciones con los casos de §10 (AC, SE, ET, PG, IN, AL, NO, PX, R1-04, R1-10, R1-11). Quedan sin correr `version_contrato` y `cuadre_hoja`. Los guiones de esta verificación (extractor de bloques SQL de este documento, ensamblador en el orden de §9.1, las traducciones de prueba y los casos) quedaron en el directorio de trabajo de la sesión, `scratchpad\probe-a\`: sirven de punto de partida para `supabase/tests/`.

**Lo que salió de correrlo y ya está corregido en este documento:** (a) faltaban los `GRANT EXECUTE` de los helpers y los `SELECT` de las vistas (sin ellos todo daba `permission denied`); (b) `service_role` no puede borrar y recibe `permission denied`, no el error del trigger; (c) `pg_catalog.extract` no se puede calificar y el plan de RLS es un `hashed SubPlan`, no un `InitPlan`; (d) **`lpad(n::text, 3, '0')` trunca**: `V-1000` salía `V-100` (ahora `folio_texto`); (e) **`ctx` marcaba `acceso_revocado` por una baja en OTRA empresa** (ahora la baja cuenta solo en la empresa pedida); (f) **`solicitar` fallaba en la primera petición de un folio** porque insertaba la solicitud antes que su cotización (FK); (g) el pseudocódigo de `proyecto_actualizar` pedía el sello de cada grupo, pero la tabla de casos (SE-04, SE-15, SE-16) manda que, con el objeto `sellos` presente, el que falte valga 0; (h) `almacen_aplicar` dejaba que un alta incompleta tronara como `DESCONOCIDO` —que la bandeja reintenta para siempre— y exigía la identidad del requerimiento también en un cambio (AL-11); (i) `subida_unica` debe decidir `rechazada` antes de comparar datos; (j) `mi_acceso` no es ejecutable por `anon` (AC-17); (k) faltaban en SQL `contiene_dinero`, `sellos_validos`, `partir_origen`, `correo_verificado`, `anotar` y los triggers de inmutabilidad. **Lo que NO se pudo correr:** el servicio PostgREST/Realtime/Storage, las Edge Functions, la concurrencia entre conexiones (EX-07..EX-12) y todo lo que se lee de la hoja viva.

---

## 10. Plan de pruebas

**Cómo se corre.** Archivos `supabase/tests/<área>/<nombre>.mjs` (`correr.sh` recorre `*.mjs` y `*/*.mjs`) escritos con el mini marco `arnes/marco.mjs` (`describir`, `prueba`, `igual`, `cierto`, `esperarError`, `dato`) sobre una base armada **una vez** con `crearBase({migraciones: '../migrations', extra: [semilla]})` y copiada por prueba con `clonarBase`. Cada petición `como(db, {rol, uid, correo, cabeceras})` se deshace al terminar (lo que un caso necesita después se confirma con `confirmar:true`), y se escribe **permitido y denegado** para cada rol. No hay pgTAP (PGlite no lo trae). Lo que PGlite no valida (PostgREST real, Realtime como servicio, Storage, Edge Functions, concurrencia entre conexiones) va a las pruebas del proyecto `al3d-pruebas` (§9.2).

**Fixture común (`semilla de pruebas`, valores falsos y marcados como tales):**

| Id | Quién | Notas |
|---|---|---|
| `u_dir`, `u_dir2` | Dirección activos en `al3d` | dos, para probar «último Dirección» |
| `u_fab`, `u_pag` | Fabricación y Pagos activos en `al3d` | |
| `u_inv` | invitación sin reclamar (`fab2@al3d.test`, `fabricacion`) con correo verificado | |
| `u_noverif` | invitación vigente pero `email_confirmed_at is null` | |
| `u_ext` | sin fila en `miembros` | |
| `u_baja` | miembro `baja` | |
| `u_otra` | Dirección en la empresa `otra` | |
| `u_multi` | Dirección en `al3d` y Fabricación en `otra` | |
| datos | 3 proyectos con cotización (uno con `origen` completo con precios), 1 `manual`, 1 lápida, 1 histórica; 2 instalaciones; 5 requerimientos; 6 movimientos; 4 abonos; 3 autorizaciones (1 v1, 2 v2); 2 solicitudes; clave de sello **FALSA** de [M04 §1.8] | |

Todas las claves, tokens y correos son falsos; **ningún secreto real** entra a una prueba [PLAN §4.12 regla 6].

### 10.1 Acceso por correo (R8)

| Id | Rol | Caso | Esperado |
|---|---|---|---|
| AC-01 | `u_ext` | `mi_acceso`, `reclamar_acceso`, leer `proyectos`, `mover_etapa` | `sin_acceso`; `sin_acceso`; **0 filas**; `SIN_ACCESO` (no definitivo). Nunca `acceso_revocado` |
| AC-02 | `u_inv` | `mi_acceso`; `reclamar_acceso` | `invitacion_pendiente`; `activo`, `usuario_id` = su uid, `reclamado_en` no nulo, fila en `bitacora` nivel `direccion` (que el propio `u_inv`, Fabricación, **no** ve) |
| AC-03 | `u_inv` | `reclamar_acceso` por segunda vez | `ok`, sin cambios (idempotente) |
| AC-04 | `u_noverif` | `reclamar_acceso` | `correo_no_verificado`; la fila sigue `invitado` |
| AC-05 | `u_dir` | `miembro_alta(' Ana@AL3D.test ')`, luego la reclama `ana` con correo `ana@al3d.test` | se guarda normalizado (`ana@al3d.test`); se vincula |
| AC-06 | usuario anónimo (`is_anonymous`) | `reclamar_acceso` | `correo_no_verificado` |
| AC-07 | cuenta **recreada** (otro uid, mismo correo que un miembro activo; `auth.users.email` es único, así que no hay dos cuentas vivas con el mismo correo) | `reclamar_acceso` | `ACCESO_CONFLICTO`; la fila no cambia |
| AC-08 | `u_dir` → `u_fab` | `miembro_baja(fab)`; después `u_fab`: `mi_acceso`, leer `proyectos`, `mover_etapa`, leer su fila de `miembros` | `acceso_revocado`; **0 filas**; `ACCESO_REVOCADO` con `definitivo=false`; **sí** ve su propia fila `baja`; `bitacora` `direccion` con quién la dio |
| AC-09 | `u_fab` (misma sesión/JWT) | leer `proyectos` antes y después de la baja | N filas → 0 filas **sin reautenticar** |
| AC-10 | `u_dir` | `miembro_cambiar_area(u_fab → pagos)` | en la **siguiente** petición `u_fab` lee `ventas_dinero` (antes 0 filas) y `mover_etapa` pasa a `ROL_SIN_PERMISO`; `bitacora` con `antes {area}` y `despues {area}` |
| AC-11 | `u_dir` | `miembro_alta` de un correo en `baja` con `usuario_id` / sin él | `activo` (reactiva, sin reclamar) / `invitado` |
| AC-12 | `u_fab`, `u_pag` | `miembro_alta`, `miembro_cambiar_area`, `miembro_baja`; `select * from miembros` | `ROL_SIN_PERMISO` ×3; **solo su propia fila** |
| AC-13 | `u_dir` | `miembro_baja(u_dir)` siendo el único Dirección activo; con `u_dir2` activo | `DATO_INVALIDO` («debe quedar al menos un Dirección activo»); permitido |
| AC-14 | `u_fab` | leer `ventas_dinero` (0 filas por diseño) y luego `mi_acceso` | `activo`: **una lista vacía de RLS no es revocación** |
| AC-15 | `u_multi` | baja en `otra`, activo en `al3d`; `mi_acceso`; RPC con `p_empresa='otra'`; RPC con una empresa que **nunca** tuvo (`jamas`) | `estado:'activo'` con `empresas` que incluye la `baja`; `ACCESO_REVOCADO` solo para `otra`; `SIN_ACCESO` para `jamas` (la baja cuenta solo en la empresa pedida: lo encontró la prueba) |
| AC-16 | cualquiera | RPC de escritura sin cabecera / con `x-al3d-contrato: 0` / con `1`; `mi_acceso` sin cabecera | `CLIENTE_VIEJO` (no definitivo) ×2; ok; `mi_acceso` no la exige |
| AC-17 | `anon` (sin sesión) | `mi_acceso` | `permission denied` (no es ejecutable por `anon`; PostgREST lo contesta 401/403, que **no** revoca); `SIN_SESION` queda para un JWT `authenticated` sin `sub` (teórico) |
| AC-18 | `u_dir` (en `al3d`) y `u_otra` (en `otra`) | invitar el mismo correo | dos filas independientes por empresa |

### 10.2 Multiempresa (R9)

| Id | Rol | Caso | Esperado |
|---|---|---|---|
| MT-01 | `u_otra` | leer `proyectos` de `al3d`; `ganar_proyecto` con `p_empresa='al3d'` | 0 filas; `SIN_ACCESO`/`ROL_SIN_PERMISO` |
| MT-02 | `u_multi` | RPC sin `p_empresa`; con `p_empresa` | `EMPRESA_REQUERIDA`; funciona |
| MT-03 | `u_multi` | `select` de `ventas_dinero`; `mover_etapa(…,'instalado')` en `otra` y en `al3d` | filas solo de `al3d` (Dirección ahí; Fabricación en `otra` no lee dinero); `ROL_SIN_PERMISO` en `otra`; ok en `al3d` |
| MT-04 | `service_role` | `insert` en `instalaciones` con `empresa_id='otra'` apuntando a un proyecto de `al3d` | violación de FK compuesta |
| MT-05 | `service_role` | mismo `folio_hoja` en dos empresas / dos veces en la misma | permitido / `unique_violation` |
| MT-06 | `u_dir` | `ganar_proyecto` con `"empresa_id":"otra"` en la carga | se ignora; la fila queda en la empresa del contexto |
| MT-07 | `u_dir`, `u_otra` | `contadores('V')` de cada empresa | independientes |

### 10.3 RLS: matriz tabla × rol × operación (R1, R9) y auditoría de privilegios

| Id | Caso | Esperado |
|---|---|---|
| RL-01 | `empresas`: Dir/Fab/Pag; `u_ext`; anon | 1 fila; 0; `permission denied` |
| RL-02 | `miembros`: Dir; Fab; Pag | todas; solo la suya; solo la suya |
| RL-03 | `proyectos`: los tres roles; `u_ext`; anon | todas (lápida e histórica incluidas); 0; `permission denied` |
| RL-04 | `ventas_dinero`, `abonos`, `almacen_costos`: Dir; Pag; Fab | todas; todas; **0** |
| RL-05 | `instalaciones`, `materiales`, `requerimientos`, `almacen_movimientos`, `constantes`: los tres | todas |
| RL-06 | `cotizaciones`: Dir; Pag (autor de una); Pag (ajena); Fab | todas; solo la suya; 0; **0** (incluida una que él mismo creó) |
| RL-07 | `solicitudes`: igual que RL-06 | igual |
| RL-08 | `autorizaciones`: Dir; Pag; Fab | todas; 0; 0 |
| RL-09 | `cuaderno_notas`: Dir; Pag; Fab | todas; las suyas; las suyas |
| RL-10 | `bitacora`: Dir; Pag; Fab | los tres niveles; `general`+`dinero`; solo `general` |
| RL-11 | `contadores`: `authenticated` y anon `select` | `permission denied` |
| RL-12 | `insert`/`update`/`delete` directos como `authenticated` en **cada** tabla | `permission denied` (42501) |
| RL-13 | lo mismo como anon | `permission denied` |
| RL-14 | `service_role`: `select`/`insert`/`update`; `delete` en tablas de negocio; el dueño (`postgres`) hace `delete` | permitido; **`permission denied`** (42501: no tiene el privilegio); **error del trigger** `sin_borrar` (P0001). En `contadores` el borrado de ventanas vencidas lo hacen las funciones `SECURITY DEFINER` (§8) |
| RL-15 | `ventas_calculadas`, `comisiones_pendientes`: Dir; Pag; Fab | todas; todas; **0** |
| RL-16 | `espejo_ventas`, `espejo_abonos`: Dir/Fab/Pag; `service_role` | `permission denied`; sí |
| RL-17 | RLS **por empresa**: la misma consulta de `u_otra` sobre cada tabla | 0 filas de `al3d` |
| RL-18 | tombstones: proyecto con `deleted_at` | **sí** aparece en la lectura (los clientes lo necesitan) |
| RL-19 | `miembros` baja: `u_baja` lee `proyectos` | 0 filas |
| RL-20 | `interno.matriz_permisos()` vs comportamiento: para cada (área, campo) de §5.1 se intenta `proyecto_actualizar`/`corregir_venta` | permitido/rechazado coincide con la matriz, sin excepciones |
| RL-21 | las políticas evalúan `empresas_donde` **una vez** por consulta (`empresa_id in (select …)` sin correlación) | `EXPLAIN` de `select * from proyectos` como Dirección muestra `Filter: (ANY (empresa_id = (hashed SubPlan 1).col1))`, no una llamada por fila (rendimiento; verificado en PGlite 0.5.8 / PG 18) |

| Id | Auditoría del catálogo (corre también dentro de `0011_auditoria.sql`) | Esperado |
|---|---|---|
| GR-01 | `has_function_privilege('anon', f, 'EXECUTE')` para toda función de `public` e `interno` | **falso** en todas |
| GR-02 | las 7 funciones de servicio; las 30 de cliente | `authenticated` **no** ejecuta las 7; **sí** las 30; `service_role` las 7 |
| GR-03 | `relrowsecurity` de toda tabla de `public`; políticas de `contadores` | verdadero; **ninguna** |
| GR-04 | `reloptions` de toda vista de `public` | contiene `security_invoker=true` |
| GR-05 | `relreplident` de las 13 tablas publicadas; contenido de `supabase_realtime` | `d` (default) en todas; **exactamente** esas 13 |
| GR-06 | `information_schema.role_table_grants` para `anon`/`authenticated` | `anon`: nada; `authenticated`: solo `SELECT`, y en tablas solo donde hay política (en vistas, solo `ventas_calculadas` y `comisiones_pendientes`) |
| GR-07 | `proconfig` de toda función `SECURITY DEFINER` | contiene `search_path=""` |
| GR-08 | el esquema `interno` y sus funciones, por rol | `anon`: sin `USAGE` ni `EXECUTE`; `authenticated`: `USAGE` y `EXECUTE` **solo** en `empresas_donde`, `neto`, `comision` y `hoy_mx` (los que ejecutan las políticas y la vista); `service_role`: esas cuatro más `sellos_validos` y `contiene_dinero` (los `CHECK` que dispara el importador) |
| GR-09 | trigger `*_sin_borrar` en toda tabla de negocio | presente |
| GR-10 | tras un flujo completo de autorización con la clave **falsa**, buscar esa cadena en todo el texto de las tablas y en `pg_proc.prosrc` | **no aparece**: la base nunca guarda la clave |

### 10.4 R1: Fabricación no lee NINGÚN dinero por ninguna vía

| Id | Rol | Caso | Esperado |
|---|---|---|---|
| R1-01 | Fab | `select * from ventas_dinero` con 5 filas existentes | 0 filas (Dir y Pag: 5) |
| R1-02 | Fab | `ventas_calculadas`, `comisiones_pendientes` (aun con `count(*)` y agregados) | 0 / 0 filas, agregados nulos |
| R1-03 | Fab | `abonos`, `almacen_costos`, `autorizaciones` | 0 filas cada una |
| R1-04 | Fab | `origen_obra` del proyecto cuya entrada traía `precioAuth`, `neto`, `sub`, `anti`, `itemsAuth`, `huellaAuth`, `_lt`, `pu`, `tarifa` | **ninguna** de esas claves en ningún nivel; sí `items` sin importes y `caja_forma`; `aiFile` solo `{name,type}` |
| R1-05 | `service_role` | `update proyectos set origen_obra = '{"items":[{"id":1,"pu":100}]}'` y variantes (`{"precioAuth":1}`, `opciones.lista[0].d.tarifa`) | `check_violation` (23514) en las tres |
| R1-06 | Fab | `solicitar` (ok) y luego leer `cotizaciones`/`solicitudes` | 0 filas, incluida la suya |
| R1-07 | Fab | `almacen_aplicar` con `costo_total` y `costo_compra`; Dir con lo mismo | ok sin costos guardados ni devueltos; Dir guarda en `almacen_costos` |
| R1-08 | Fab | lectura con **embedding** (`proyectos` + `ventas_dinero`) como en PostgREST (join bajo RLS) | la parte de dinero llega vacía |
| R1-09 | Fab | `bitacora` tras `ganar_proyecto`, `corregir_venta`, `registrar_cobro`, `mover_etapa` | solo ve las `general`; ningún `titulo`/`detalle` de una fila `general` contiene un importe (regex `\$|[0-9]+\.[0-9]{2}`) |
| R1-10 | Fab | `registrar_cobro`, `registrar_abono_comision`, `repartir_abono_fifo`, `vista_previa_reparto`, `corregir_venta`, `corregir_abono`, `comisiones_cobradas`, `alta_venta` | `ROL_SIN_PERMISO` **igual** para un proyecto existente y para uno inexistente (no revela existencia ni datos) |
| R1-11 | Fab | `ganar_proyecto`, `descartar_cotizacion`, `revocar_autorizacion`, `rechazar_solicitud` | `ROL_SIN_PERMISO` |
| R1-12 | Fab | `mover_etapa` dentro de su rango; `proyecto_actualizar`; `instalacion_guardar` | ok; la respuesta (`remoto`) trae **solo** columnas de `proyectos`/`instalaciones` |
| R1-13 | Fab | inspeccionar el JSON de todas las respuestas anteriores | ninguna clave de dinero (`subtotal`, `anticipo`, `liquidacion`, `cuenta`, `neto`, `saldo`, `costo*`) |
| R1-14 | Fab | `estado_solicitudes` de un folio ajeno / de uno propio autorizado | `{estado:null,…}` / sello `{codigo, correo, ts}` **sin** `total`, `subCalc`, `precioAuth`, `itemsAuth`, `renglones` |
| R1-15 | catálogo + Fab | la política de `SELECT` que Realtime evalúa para `ventas_dinero`, `abonos`, `almacen_costos`, `cotizaciones`, `solicitudes` | devuelve 0 filas para Fab; (GR-05 cubre publicación e identidad de réplica) |
| R1-16 | Fab | los mensajes de error de R1-10/R1-11 | no contienen cifras ni nombres de proyecto |
| R1-17 | Fab | columnas de `almacen_movimientos` y `materiales` (catálogo de PostgreSQL) | no existe ninguna `costo_*` |
| R1-18 | Pag | lo mismo que R1-01..R1-03 | **sí** lee (Pagos ve el dinero): contraprueba de que la política no es «cerrar todo» |

### 10.5 Compuerta de sellos (R3, mapas 02 §4 y 05 §4.7)

Parten de `proyecto = {etapa:'cortado', notas:'mía', plazo_k:2, tel:'33 1', dir_texto:'Calle 1', lat:20.1, lng:-103.1, entrega:'instalacion', sellos:{etapa:100, notas:100, tel:100}}`.

| Id | Rol | Op | Esperado |
|---|---|---|---|
| SE-01 | Dir | `etapa:'armado'`(200), `notas:'de la hoja'`(50), `tel:'33 9'`(200) | etapa y tel escritos (sellos 200/200); `notas` en `viejos`; `sellos.notas` = 100 |
| SE-02 | Dir | `notas:'otra'` con sello **igual** (100) | se **escribe** (empate); sello 100 |
| SE-03 | Dir | `notas:''` con sello 300 | borra; sello 300 |
| SE-04 | Dir | `notas:''` con `sellos` presente pero **sin** la clave `notas` | `viejos` (llega 0 < tiene 100) |
| SE-05 | Dir | `notas:''` con sello 0, sobre un proyecto **sin** sello de notas | `rechazadas` («vacío sin sello no borra») |
| SE-06 | Dir | `entrega:null`(300) vía `proyecto_actualizar`; `mover_etapa` no admite vaciar | `rechazadas` («no se puede vaciar»); nada cambia |
| SE-07 | Dir | sello `ahora + 1 h` | se guarda `ahora + 10 min` |
| SE-08 | Dir | campos sellados sin objeto `sellos` | `DATO_INVALIDO` definitivo |
| SE-09 | Dir | `plazo_k:null`(400) | borra; sello 400 |
| SE-10 | Dir | mismo valor, sello más nuevo; mismo valor y mismo sello | sube el sello (y `updated_at`); **no** escribe nada (ni `updated_at`) |
| SE-11 | Dir/Fab | `lat` sin `lng`; `(0,0)`; `lat=91` | `rechazadas` las tres |
| SE-12 | Dir/Fab/Pag | `tel`: `'abc'`, `'33 1234 5678'`, `'+52 (33) 1234-5678'`, 40 caracteres | rechazado; ok; ok; recortado a 30 |
| SE-13 | Dir | notas de A (sello 100) y de B (sello 200) en orden B → A | gana B; A en `viejos` |
| SE-14 | Dir/Fab | cita: sello menor al guardado / igual / mayor | `viejos` / escribe / escribe |
| SE-15 | Dir | `sellos: {notas: 0}` con `tiene=0` y valor no vacío | escribe y **no** crea sello |
| SE-16 | Dir | `tiene>0`, `llega=0` | `viejos` |
| SE-17 | Dir | sello como `"250"`, `"abc"`, `-5`, `250.9` | acepta 250; 0; 0; 250 |
| SE-18 | Dir | campos sin sello (`contacto`, `tipo_trabajo`, `compromiso_texto`, `fecha_anticipo`) | siempre se escriben |
| SE-19 | Dir | `sub`, `neto`, `iva`, `etapa`, `folio_global`, `id` en `proyecto_actualizar` | `rechazadas` (BLOQUEADOS); el resto se escribe |
| SE-20 | Pag | `notas`, `tel` / `dir_texto`, `entrega`, `plazo_k` | escribe / `rechazadas` con su razón |
| SE-21 | — | función pura `interno.compuerta`: las 16 combinaciones de (`tiene`∈{0,100}, `llega`∈{0,50,100,200}, `vacio`, `borrable`) | tabla de verdad de §5.4 |
| SE-22 | — | `interno.sello_valido` con `null`, `{}`, `[]`, `'NaN'`, `'Infinity'`, `'-1'` | 0 |
| SE-23 | Dir | dos operaciones sobre el mismo proyecto en **ambos órdenes** de llegada | el mismo estado final (conmutan por sello) |
| SE-24 | Dir | reintento tardío de «Ganado» del cotizador sobre un proyecto ya en `armado` | `ganar_proyecto` devuelve `ya_existia`; **la etapa no regresa** [P-08] |

### 10.6 Etapa por rol, salidas de material y transiciones automáticas (R5, Q-05)

| Id | Rol | Caso | Esperado |
|---|---|---|---|
| ET-01 | Dir | las 8 × 8 transiciones (incluye `cancelado` → cualquiera y cualquiera → `cancelado`) | todas permitidas |
| ET-02 | Fab | las 25 transiciones dentro de `ganado…listo` (incluso retroceder) | permitidas |
| ET-03 | Fab | desde `ganado…listo` a `instalado`, `garantia`, `cancelado` | `ROL_SIN_PERMISO` |
| ET-04 | Fab | desde `instalado`, `garantia`, `cancelado` a cualquiera | `ROL_SIN_PERMISO` (**endurece**) |
| ET-05 | Pag | cualquier movimiento | `ROL_SIN_PERMISO` |
| ET-06 | Dir | misma etapa | `sin_cambio`, sin escritura, sin bitácora |
| ET-07 | Dir | `ganado→cortado` con 3 requerimientos (2 con cantidad, 1 en cero) | 2 salidas `mov-salida:<req.id>` con cantidad **negativa**, requerimientos `consumido`; la línea en cero queda `calculado` |
| ET-08 | Fab | `ganado→listo` (salta `cortado`) | emite (alcanzar, no tocar) |
| ET-09 | Dir | volver a `ganado` y cruzar otra vez | no emite ni duplica (`consumido`) |
| ET-10 | Dir | un movimiento `mov-salida:<req>` ya insertado por **otro teléfono** (`almacen_aplicar`) y luego `mover_etapa` | no duplica; marca `consumido`; `salidas = 0` |
| ET-11 | Dir | `cantidad_ajustada` presente | manda sobre `cantidad_compra` |
| ET-12 | Dir | `cancelado→armado` y `garantia→armado` | cruza el corte (orden nulo) y emite lo no consumido |
| ET-13 | Dir | requerimiento `descartado` | no se emite |
| ET-14 | Dir/Fab/Pag | `emitir_salidas_derivadas` con instalación mañana / ayer / en 3 días / cancelada / proyecto cancelado | emite (`origen='derivado'`) / emite / no / no / no; segunda llamada = 0; **no mueve la etapa** |
| ET-15 | Pag | `emitir_salidas_derivadas` | permitido (`derivado`+`salida`) |
| ET-16 | Dir | instalación `hecha` con etapa `listo`; con `instalado`/`garantia`/`cancelado` | → `instalado`; no cambia |
| ET-17 | Fab | marca `hecha` con etapa `listo` | la etapa **se queda** en `listo` |
| ET-18 | Dir | `hecha` con etapa `ganado` | → `instalado` y emite (cruzó el corte) |
| ET-19 | Pag | `registrar_cobro(liquidar)` sobre proyecto `fuente='hoja'` en `armado`; sobre `fuente='cotizacion'`; sobre histórica; en `garantia` | → `instalado` (sin salidas, sello de etapa nuevo); **no cambia**; no cambia; no cambia |
| ET-20 | Dir/Pag | `corregir_venta(estatus:'COBRANDO')` en `fuente='manual'` en `listo` | → `instalado` |
| ET-21 | Fab | una op vieja `etapa='en_diseno'` con sello anterior a ET-19 | `viejos`: **no revierte** |
| ET-22 | Dir | `mover_etapa` sin `p_sello` | `DATO_INVALIDO` |
| ET-23 | Dir | `cancelado` | etapa `cancelado`, sin salidas, bitácora `etapa` |
| ET-24 | Dir | `mover_etapa` de una lápida (sin `folio_hoja`) a `ganado`; `ganar_proyecto` sobre el mismo `folio_global` | `DATO_INVALIDO` (`Q-A23`); `DUPLICADO`; la fila no cambia |

### 10.7 Pagos (R6) y alta de venta

| Id | Rol | Caso | Esperado |
|---|---|---|---|
| PG-01 | Dir/Pag | `registrar_cobro` 100.00 y 50.25 | `liquidacion = 150.25` exacto; `fecha_liquidacion` = `hoy_mx()` si no se pasó; `LIQUIDADO` con `p_liquidar`; el `saldo` devuelto = K de la vista |
| PG-02 | Pag | reintento con el mismo `op_id` | misma respuesta; **no** suma dos veces |
| PG-03 | Pag | monto 0, negativo, `null` | `DATO_INVALIDO` |
| PG-04 | Fab | `registrar_cobro` | `ROL_SIN_PERMISO` |
| PG-05 | Pag | `p_liquidar=false` | el estatus no cambia; el IVA se normaliza |
| PG-06 | Pag | cobro sobre lápida / proyecto sin folio / inexistente | `NO_ENCONTRADO` |
| PG-07 | Dir | `corregir_venta(cuenta:'Elias BBVA')` en venta `COBRANDO` con `iva=true`; en `LIQUIDADO`; sin cuenta; con `Rul HSBC` | `iva=false`; sin cambio; sin cambio; `iva=true` |
| PG-08 | Dir/Pag | `corregir_venta(iva:…)` en venta abierta con cuenta; en `LIQUIDADO` | `rechazadas` («la cuenta dicta el IVA»); Dirección lo escribe; **Pagos nunca** |
| PG-09 | Pag | `corregir_venta`: `nombre`, `subtotal`, `anticipo`, `liquidacion`, `cuenta`, `estatus` (los 4), `fecha_liquidacion`, `pct_comision` | todo permitido |
| PG-10 | Dir/Pag | `anticipo:-1`, `liquidacion:-5`, `cuenta:null`, `estatus:'X'`, `pct:101`, `fecha:'10/10/26'`, `nombre:''`; `subtotal:-500` | `rechazadas` ×7; el subtotal negativo **sí** |
| PG-11 | Dir | `corregir_venta` | `bitacora` nivel `dinero` con `antes/despues` **solo** de lo que cambió |
| PG-12 | Dir/Pag | `registrar_abono_comision` 0, −1, 1e7, 100 | `DATO_INVALIDO` ×3; ok. `op_id` repetido = mismo resultado |
| PG-13 | Pag | abono sin nota ni fecha | nota «Registrado desde la plataforma», `fecha = hoy_mx()` |
| PG-14 | Dir/Pag | abono mayor que la comisión | aceptado; T negativo; la vista marca «Comisión pagada de más» |
| PG-15 | Pag | `repartir_abono_fifo(120.00)` con pendientes V-001 100.00, V-002 50.50, V-003 200.00 | V-001 100.00 (queda 0), V-002 20.00 (queda 30.50), V-003 nada; **mismo** `pago_id` P-001; nota «Reparto P-001 de $120.00»; sobrante 0 |
| PG-16 | Pag | `repartir_abono_fifo(400)` | reparte 350.50, **sobrante 49.50 sin aplicar** |
| PG-17 | Pag | sin comisiones pendientes | `DATO_INVALIDO` |
| PG-18 | Pag | orden: V-010, V-100, V-999, V-1000 | ascendente **numérico** |
| PG-19 | Pag | T = 0.00 / 0.004 / 0.01 | solo 0.01 entra al reparto |
| PG-20 | Pag | repetir el reparto con el mismo `op_id` | no escribe renglones nuevos; mismo resultado |
| PG-21 | — | contador `P` sembrado en 999 | siguiente `P-1000` (no `P-000`) |
| PG-22 | Pag | `vista_previa_reparto(120.00)` | no escribe; coincide con PG-15 |
| PG-23 | Dir | `corregir_abono(−50, nota)`; sin nota; Pag | ok (tipo `correccion`, S baja, T sube); `DATO_INVALIDO`; `ROL_SIN_PERMISO` |
| PG-24 | `service_role` | `update` / `delete` en `abonos` | error del trigger de libro (P0001) / `permission denied` (42501) |
| PG-25 | Dir/Pag | `comisiones_cobradas` con rango inclusivo, abono sin fecha, abono de folio inexistente, renglones sin `pago_id` | sin fecha: no cuenta; folio inexistente: **sí** suma en `cobrado`; los sin pago cuentan como **un** depósito distinto |
| PG-26 | Pag | `alta_venta` | crea `fuente='manual'` + `ventas_dinero` + `V-###`; `iva` por cuenta; sin entrega o con tel < 10 dígitos → `DATO_INVALIDO`; Fab → `ROL_SIN_PERMISO` |
| PG-27 | Dir/Pag | `alta_venta` con `fecha_instalacion` | instalación `confirmada` (Dir) / `propuesta` (Pag) |
| PG-28 | Dir | crear, crear una lápida, crear otra | `V-n`, (la lápida **no** consume), `V-n+1`: **nunca se reparte dos veces** |
| PG-29 | Pag | `LIQUIDADO` con saldo restante | la vista marca «Liquidado con saldo» |
| PG-30 | Pag | estatus `FABRICACION`, `REPARANDO`, `COBRANDO`, `LIQUIDADO` | los cuatro permitidos (`Q-A04`) |

### 10.8 Fórmulas (R4) e históricas (R2)

Casos **FM-01..FM-35**: §6.4 (tabla de casos borde, prueba diferencial de 20 000 filas y cuadre contra la hoja real).

| Id | Caso | Esperado |
|---|---|---|
| HI-01 | 199 históricas + 3 vivas + 2 con cotización | `ventas_calculadas` = 204 filas; cada suma de §6.6 = suma directa; `cuadre_hoja.proyectos.historicas = 199` |
| HI-02 | `historica` con `folio_global`, con `origen_obra`, con `fuente≠'hoja'`, sin `folio_hoja` | `check_violation` |
| HI-03 | histórica con `fecha_instalacion_hist` | alimenta P/Q |
| HI-04 | Fab: leer `proyectos` históricos; `ventas_calculadas` | **sí** las filas de `proyectos` (sin dinero, `Q-A09`); 0 de la vista |
| HI-05 | tarjeta viva de la hoja (`FABRICACION`, sin cotización) | `fuente='hoja'`, `historica=false`, etapa `ganado` por omisión |
| HI-06 | fila sin `folio_hoja` que no sea lápida; lápida | `check_violation`; la lápida no está en la vista |
| HI-07 | la transición automática (2) sobre una histórica | no cambia nada |

### 10.9 Instalaciones

| Id | Rol | Caso | Esperado |
|---|---|---|---|
| IN-01 | Dir/Fab/Pag | crear | `confirmada` / `propuesta` / `ROL_SIN_PERMISO` |
| IN-02 | Dir | segunda instalación con id nuevo sobre un proyecto con una viva | **reagenda la existente** y devuelve `id_canonico`; un `insert` directo viola el índice único |
| IN-03 | `service_role` | `uid_ics` distinto de `'inst-'||id||'@al3d.mx'`; `update` de `uid_ics`/`proyecto_id` | `check_violation`; error del trigger |
| IN-04 | Dir | reagendar, cancelar, marcar `hecha`; intentar bajar `movida` | +1, +1, sin cambio; la base no la baja |
| IN-05 | Dir | mover una `confirmada` / una `hecha` | `reagendada` / se queda `hecha` |
| IN-06 | Fab | sello menor / igual / mayor al de la cita; sin sello | `viejos` / escribe / escribe; `DATO_INVALIDO` |
| IN-07 | Dir/Fab | dos `anexo` de dos teléfonos | ambos en `notas`, en orden de llegada |
| IN-08 | Dir | agendar un proyecto `cancelado`; cancelar su cita | `DATO_INVALIDO`; ok |
| IN-09 | Dir | hora `25:00`; sin hora | `DATO_INVALIDO`; ok (todo el día) |
| IN-10 | Dir | duración 0 / 601; ventana `manana` | `DATO_INVALIDO`; `dia` |

### 10.10 Almacén

| Id | Rol | Caso | Esperado |
|---|---|---|---|
| AL-01 | Fab | movimiento nuevo; el mismo `id` otra vez | `creada`; `ya_estaba`, **`seq` no avanza** |
| AL-02 | Fab | dos ops con el mismo id en el mismo lote | `[creada, ya_estaba]` |
| AL-03 | Fab | salida positiva, entrada negativa, conteo negativo, ajuste 0; conteo 0 | `DATO_INVALIDO` ×4; **ok** |
| AL-04 | Fab | `tipo`/`unidad`/`origen` inventados, `ts:0`, cantidad no numérica o > 1e7 | `DATO_INVALIDO` |
| AL-05 | Pag | `entrada` manual; `derivado+salida`; `derivado+entrada`; catálogo; requerimiento `campos:['estado']` con `consumido`; con `campos:['cantidad_ajustada']` | `ROL_SIN_PERMISO`; ok; `ROL_SIN_PERMISO`; `ROL_SIN_PERMISO`; ok; `ROL_SIN_PERMISO` |
| AL-06 | Dir/Fab | todo el almacén | permitido |
| AL-07 | Fab/Dir | catálogo por campo: dos roles coexisten; un cambio atrasado; op sin `campos` | coexisten; `viejos` sin error ni gasto; «todos» con la misma regla del sello |
| AL-08 | Fab | `consumido→calculado`, `comprado→apartado`, `comprado→consumido`, `calculado→comprado` | `viejos`, `viejos`, ok, ok |
| AL-09 | Fab/Dir | `costo_compra`/`costo_total` | Fab: ignorado en silencio y no se devuelve; Dir: guarda; Pag lee; Fab no |
| AL-10 | Fab | campo sin columna (`color:'frío'`) | a `procedencia.otros`; no falla |
| AL-11 | Fab | cambiar `id`, `proyecto_id`, `material_id` de un requerimiento existente | ignorados |
| AL-12 | Fab | requerimiento con proyecto inexistente | `DATO_INVALIDO` |
| AL-13 | Fab | lote de 10 con el 7.º inválido: `p_atomico=true` / `false` | ninguna fila + `LOTE_RECHAZADO` / 9 ok y 1 error |
| AL-14 | Fab | lote de 26 | `DATO_INVALIDO` |
| AL-15 | Fab | sello de campo con reloj adelantado 1 h | se acota a +10 min |
| AL-16 | `service_role` | `update` / `delete` en `almacen_movimientos` | error del trigger de libro (P0001) / `permission denied` (42501) |
| AL-17 | — | `seq`: monótono por empresa, independiente entre empresas | sí |
| AL-18 | Dir/Fab | `constante_guardar`; Pag; `clave='_semilla'` | ok; `ROL_SIN_PERMISO`; `DATO_INVALIDO` |
| AL-19 | — | `requerimientos.id ≠ proyecto_id||':'||material_id` | `check_violation` |
| AL-20 | — | sembrar las 19 filas de semilla dos veces | idempotente |

### 10.11 Notario: solicitud, autorización, revocación, verificación (R7)

| Id | Rol | Caso | Esperado |
|---|---|---|---|
| NO-01 | Dir/Fab/Pag | `solicitar`; folio sin `@`; 0 y 81 partidas; campos ajenos en partidas | ok `pendiente` ×3; `DATO_INVALIDO`; `DATO_INVALIDO`; se **eliminan** del jsonb limpio |
| NO-02 | Pag | re-pedir el mismo folio; otro Pagos; Dirección | misma fila con `ts` nuevo; `ROL_SIN_PERMISO`; permitido |
| NO-03 | — | dos pendientes del mismo folio (`insert` directo) | `unique_violation` |
| NO-04 | Pag/otro/Dir | `cancelar_solicitud` propia; ajena; sin pendiente | `cancelada` (cotización `retirada`); `ROL_SIN_PERMISO`; `estado:null` |
| NO-05 | Dir/Fab | `rechazar_solicitud`; sin pendiente; con vigente | ok / `ROL_SIN_PERMISO`; `NO_ENCONTRADO`; **no toca** la vigente |
| NO-06 | `service_role` | `registrar_autorizacion` (Dirección) | `vigente`; solicitud `autorizada` con `autorizacion_id`; cotización `autorizada` |
| NO-07 | Dir/anon | `registrar_autorizacion` | `permission denied` (no ejecutable) |
| NO-08 | `service_role` | `p_usuario` Fab; Dirección de otra empresa; inexistente | `ROL_SIN_PERMISO` ×3 |
| NO-09 | `service_role` | misma decisión dos veces | `repetida:true`, **cero** filas nuevas, **resuelve** la pendiente (`Q-A06`) |
| NO-10 | `service_role` | otra decisión | la vieja `superada`, la nueva `vigente`; **una** vigente |
| NO-11 | `service_role` | autorizar sin solicitud previa | ok; `solicito = correo` |
| NO-12 | `service_role` | `codigo` mal formado, `firma` no hex-64, `codigo` ≠ prefijo de `firma`, `ts_iso` sin `.mmmZ`, importe `'12.5'`, `p_codificacion = 'latin1'` | `DATO_INVALIDO` ×6 |
| NO-13 | `service_role` | `p_autorizo` ≠ correo de `p_usuario` | `DATO_INVALIDO` |
| NO-14 | Dir/Fab | `revocar_autorizacion`; reautorizar; `update` a `vigente`; sin vigente | `revocada`; nueva `vigente`; error del trigger (terminal); `NO_ENCONTRADO` / `ROL_SIN_PERMISO` |
| NO-15 | `service_role` | `update` de cualquier columna firmada | error del trigger; solo `estado` cambia (y `nota` con él) |
| NO-16 | Dir/Pag/Fab | `estado_solicitudes` (21 folios, 2 inválidos, uno ajeno) | Dir todo; Pag solo lo suyo con sello completo; Fab estado y sello **sin importes**; recorta a 20; omite inválidos |
| NO-17 | Pag | pedir reautorizar una `autorizada` | `estado:'pendiente'` y **sin sello** hasta que se resuelva (no devuelve el viejo) |
| NO-18 | autor / otra persona / Dir | `cotizacion_guardar` con `datos` y `hitos`; folio inexistente; `borrar:true` | ok **sin** cambiar `estado`, `autorizacion_id` ni `revocada_en`, y el `datos` guardado no trae `dataURL` ni `aiFile.url`; `ROL_SIN_PERMISO`; ok para Dirección; `NO_ENCONTRADO`; `deleted_at` y la autorización firmada intacta |
| NO-19 | `service_role` | `autorizacion_para_verificar` con folio corto, con `@`, en minúsculas; dos `COT-0042` de aparatos distintos; forma inválida; inexistente; la misma firma superada y vigente | `filas` de la **más antigua a la más nueva** con los nombres de columna de `COLUMNAS_DE_AUTORIZACION` y `codificacion`; el código separa a los dos aparatos; `filas:[]` en forma inválida o inexistente; importes como texto `'NNNN.NN'`; la fila alimenta a `verificar()` de `sello.js` sin adaptar nada |
| NO-20 | `service_role` | `revocada` y `superada` | se devuelven con **su** total y su estado |
| NO-21 | Dir/Pag | `cuaderno_guardar` con clave inválida / nota de 1201 | `DATO_INVALIDO`; por autor |
| NO-22 | cualquiera | `subida_unica`: crea; reintento; datos distintos; autor ajeno; cola `pendiente`; fantasma; bitácora; `disp` inferido | `creada`; `ya_estaba`; `conflicto` **sin sobrescribir**; `rechazada`; crea cotización y solicitud `pendiente`; solo sube el contador; idempotente por `op_id`; `procedencia.disp_inferido` |
| NO-23 | Fab | `subida_unica` de sus cotizaciones; leerlas | escribe; **0 filas** |
| NO-24 | Dir | dos `COT-0042` con distinto `disp` | coexisten (`folio_global` distinto) |
| NO-25 | — | `cotizaciones.proy/cliente/tel/huella_auth` generadas | reflejan `datos`; no se pueden escribir |

### 10.12 Texto verbatim y firma (R: PDF ya impresos)

| Id | Caso | Esperado |
|---|---|---|
| VB-01 | `proyecto` = `Tacos "El Güero" \| Ñandú «x» \\ ` + U+2028 + emoji, guardado y leído | **bytes idénticos** (`convert_to(…,'UTF8')`) |
| VB-02 | `renglones` = `[["Letras «TACOS»",8,9600],["Bastidor",1,1710]]` | texto idéntico (sin espacios añadidos, mismo orden y escapes); **no** `jsonb` |
| VB-03 | `ts_iso`, `huella` (`~`, `,`, `\|`), `items_auth` (`1:8500.00,10:5.00,2:1500.00`: orden **de texto**) | idénticos |
| VB-04 | importes `12500.00`, `0.00`, `13119.60`; columnas generadas | `sub_calc = 12500.00`, etc. |
| VB-05 | recalcular en Node la firma de los vectores **V1, E2E-A, E2E-B, E2E-C, V5** de [M04 §1.8] con la clave FALSA, **después** de un viaje de ida y vuelta por la base | coincide con `firma` y `codigo` (`6C3B-AA7B-1964`, `1031-54B3-55D4`, `280B-5AB3-5179`, `CF18-8179-9DD0`, `76F4-C52C-2BC6`) |
| VB-06 | una fila v2 con `renglones=''` | se verifica como v1 y **falla a propósito** (no se «arregla») |

### 10.13 Sincronización (R10)

| Id | Rol | Caso | Esperado |
|---|---|---|---|
| SY-01 | Dir | 1200 proyectos; paginar de 500 con `(updated_at, id)` desde cero | exactamente 1200 filas, **sin repetir ni saltar**; 3 páginas (500, 500, 200) |
| SY-02 | Dir | fila confirmada por una transacción larga con `updated_at` 10 s anterior al cursor guardado; otra a 40 s | la de 10 s se recupera con el solape de 30 s; la de 40 s no (límite documentado) |
| SY-03 | Dir/Fab | soft-delete de proyecto, instalación, cotización | aparece en la lectura incremental con `deleted_at`; el cliente la borra |
| SY-04 | todos | reenviar la misma operación de `mover_etapa`, `ganar_proyecto`, `almacen_aplicar`, `solicitar`, `instalacion_guardar` | mismo resultado, **sin duplicados** |
| SY-05 | Pag | cobro/abono/reparto con `op_id` tras «respuesta perdida» | devuelve lo mismo, **sin segunda suma** |
| SY-06 | todos | códigos del sobre | `DATO_INVALIDO`, `ROL_SIN_PERMISO`, `NO_ENCONTRADO`, `DUPLICADO` ⇒ `definitivo`; `ACCESO_REVOCADO`, `SIN_ACCESO`, `CLIENTE_VIEJO` ⇒ **no** |
| SY-07 | todos | versión de contrato | cabecera ausente o `0` ⇒ `CLIENTE_VIEJO`; `1` ⇒ ok; `mi_acceso().contrato = {actual:1, minimo:1}` |
| SY-08 | Fab / Dir | hidratación completa desde cero | Fab **no** recibe dinero ni cotizaciones (0 filas, sin error); Dir recibe todo |
| SY-09 | Fab | `remoto` de toda escritura | solo columnas sin dinero |
| SY-10 | — | 100 inserciones en una transacción | `updated_at` no decrece y `(updated_at, id)` es único |
| SY-11 | `service_role` | `espejo_ventas` / `espejo_abonos` | columnas capturadas (A:G, I:J, L:N, Y:AI), etiquetas de etapa/entrega/plazo, `ai_sellos` con **nombres de columna**; ningún rol de cliente tiene `SELECT` |
| SY-12 | `service_role` | `cuadre_hoja` | conteos y sumas iguales a consultas directas |
| SY-13 | `service_role` | contador `espejo:ventas` con cursor | se actualiza por `service_role`; ningún cliente lo ve |
| SY-14 | Dir | lectura de `bitacora` entre rondas | los eventos nuevos llegan por cursor; `op_id` repetidos no se duplican |

### 10.14 Cupos y contadores (R11)

| Id | Rol | Caso | Esperado |
|---|---|---|---|
| CU-01 | `service_role` | `ia_cuota` 200 veces y una más | 200 ok; la 201.ª `CUPO_AGOTADO` (`transitorio:false`); el contador **no pasa de 200** |
| CU-02 | `service_role` | otro usuario | su propio cupo |
| CU-03 | `service_role` | `dia_mx('2026-10-11 05:59:00Z')` y `dia_mx('2026-10-11 06:00:00Z')` | `20261010` y `20261011` (la medianoche de México) |
| CU-04 | `service_role` | `dia_mx('2026-10-11 00:00:00Z')` (= **18:00 en México**) | `20261010`: **el tope ya no se reinicia a las 18:00** como con el día GMT de hoy [M01 §2.5] |
| CU-05 | `service_role` | `ia_cuota` con `p_ahora` el día siguiente | `usadas = 1` (ventana nueva) |
| CU-06 | `service_role` | limpieza perezosa | borra ventanas `ia:` de hace > 3 días; **no** toca `V`, `P`, `alm`, `folio_cot:*` |
| CU-07 | `service_role` | `verificar_cupo` 30 veces el mismo folio y la 31.ª | ok ×30; la 31.ª `SIN_RED` («Demasiadas consultas seguidas…») |
| CU-08 | `service_role` | 400 folios distintos y el 401.º | ok ×400; `SIN_RED` |
| CU-09 | `service_role` | misma consulta en la ventana siguiente (`p_ahora` +600 s) | ok (ventana nueva) |
| CU-10 | `service_role` | `cot-0042` y `COT-0042` | **comparten** cubeta (antes eran dos: tope burlable) |
| CU-11 | `service_role` | 60 consultas por IP y la 61.ª; sin IP | `SIN_RED`; no cuenta |
| CU-12 | `service_role` | `contador_sembrar('al3d','V',214)` y dos altas; sembrar con 100 después | siguiente `V-215`, `V-216`; **solo sube** (`greatest`); `V-1000` no se trunca |
| CU-13 | `service_role` | `ia_turno('qwen', 3)` ×4 | 1, 2, 0, 1 (rota y vuelve) |
| CU-14 | Dir/Fab/Pag/anon | `ia_cuota`, `verificar_cupo`, `contador_sembrar`, `ia_turno` | `permission denied` |
| CU-15 | — | dos `siguiente()` en la misma transacción | consecutivos; tras `rollback` el número se reutiliza |

### 10.15 Importación y cuadre (fase 2)

El importador se prueba con **hojas de mentiras** (conjuntos sintéticos que imitan `getValues()`), nunca con datos reales; los reportes con nombres de clientes **no se escriben dentro del árbol del repo** (el script se niega) [DEC Q-14, Q-18; N-01].

| Id | Caso | Esperado |
|---|---|---|
| IM-01 | 50 filas sintéticas con todos los casos borde de §6.4 | `cuadre_hoja` y la comparación **por folio** de H, K, R, S, T, X, O, V, W: **0 diferencias** (tolerancia 0.004 en importes) |
| IM-02 | segunda corrida idéntica | no cambia ninguna fila (`updated_at` intacto donde no hubo diferencia); el reporte de cambios queda vacío |
| IM-03 | celdas sucias: texto en G, I o J negativo, fecha como texto, `Y='V-014'` | la fila de G/I/J no se importa y va al reporte; la fecha → `NULL` + reporte; `Y` → `NULL` y `procedencia.celdas.Y` |
| IM-04 | clasificación de §3.0 | `Y` válida con proyecto de teléfono ⇒ `cotizacion` fusionado; `FABRICACION` sin `Y` ⇒ `hoja` viva; `COBRANDO`/`LIQUIDADO` sin `Y` ⇒ `historica=true` |
| IM-05 | **prueba de oro de firmas**: filas sintéticas firmadas con el módulo (`sello.js`) y la clave **FALSA**, unas con UTF-8 y otras con `ascii-?`; tras importar, recalcular todas desde la base | `firma` idéntica en todas; cada fila guarda la `codificacion` con la que cuadró (`verificar()`); las alteradas a mano (ts, renglones, proyecto) aparecen en el reporte y **no abortan** |
| IM-06 | remapeo de ids con dos teléfonos para la misma venta | `instalaciones`, `requerimientos` y `almacen_movimientos` apuntan al id canónico; huérfanos en el reporte; instalaciones: **UID canónico = mayor `movida`**, las demás `cancelada` sin tocar calendario |
| IM-07 | requerimientos duplicados `(proyecto, material)` | gana `consumido`, luego `comprado`, luego mayor sello; el resto en el reporte |
| IM-08 | contadores | `V` ≥ máximo de A, `Ventas (respaldo)`, bitácora y abonos; la siguiente alta = máximo + 1; `P` y `alm` sembrados |
| IM-09 | ruta de reportes dentro del árbol del repo | el script **se niega** a escribir |
| IM-10 | «Accesos» con la fila de ayuda de `A4`, rol inválido, duplicados con otra grafía | filas basura saltadas; la primera coincidencia gana; todos `invitado` |
| IM-11 | salidas de material duplicadas entre teléfonos | deduplicadas por `(venta, material)`, una por par; el resto en el reporte |
| IM-12 | cotización con `disp` desconocido | `disp = 'HIST'+hash6`, `procedencia.disp_inferido = true`, listada en el reporte |

### 10.16 Partir `origen` (R1)

| Id | Caso | Esperado |
|---|---|---|
| PX-01 | `partir_origen` de una entrada completa (con `tarifa`, `pu`, `_lt`, `precioAuth`, `itemsAuth`, `huellaAuth`, `sello`, `aiFile.url`, `opciones`) | `obra` sin ninguna clave prohibida; `dinero` con `precioAuth`, `itemsAuth`, `sello` y `items:{id:{_lt,pu,tarifa}}`; `aiFile` sin `url`; `opciones.lista[].d` filtradas |
| PX-02 | partida con `tarifa=3900` y **sin** `caja_forma` | la parte de obra queda sin `tarifa` y con `caja_forma` nulo |
| PX-03 | idempotencia: partir otra vez la parte de obra | no cambia |
| PX-04 | `contiene_dinero` con claves en mayúsculas/minúsculas mezcladas y anidadas en arreglos | detecta todas |

### 10.17 Pruebas que NO corren en PGlite (se escriben igual, contra `al3d-pruebas` o con Deno)

| Id | Dónde | Qué |
|---|---|---|
| EX-01 | Deno | módulo de firma (`_shared/sello.js`): los 5 vectores de [M04 §1.8] + 3–5 filas **reales** de «Autorizaciones» (v1 y v2 con acentos, `«»`) con la clave real (por el entorno, nunca por el chat) = la **prueba de oro** de P-02, antes de la fase 1; **decide la `codificacion`** de las filas heredadas (`verificar()` dice con cuál cuadra cada una: si salen `ascii-?`, la evidencia de `sello.js` era cierta) |
| EX-02 | Deno | `autorizar`: catálogo alterado ⇒ `CATALOGO_DESINCRONIZADO`; precio fuera de 0..1e9 ⇒ `DATO_INVALIDO`; solo Dirección; los sellos nuevos con texto no ASCII (ñ, `«»`) se firman con **UTF-8** y se guardan con `codificacion='utf-8'` |
| EX-03 | Deno | `verificar`: sin clave o sin base ⇒ **error explícito** (nunca `no_autentica`); folio corto vs largo; desempate por código; cupo; `superada`/`revocada` con su total |
| EX-04 | Deno | `maps`: `https://maps.google.com:x@evil.example/` ⇒ rechazado (el hueco del userinfo, [M01 §7]); un solo salto, `redirect:'manual'`; copia de la **lista** de dominios |
| EX-05 | Deno | `ia`: cupo de 200/día por persona, lista blanca de modelos, imagen de 1600 px dentro del límite de la función (cuerpo y 150 s: **NO CONFIRMADO** el límite de cuerpo, [00 §10]) |
| EX-06 | Deno | `espejo`: escribe solo columnas capturadas, localiza por folio, `capacidad_agotada` sin escritura parcial, secreto compartido en tiempo constante |
| EX-07 | proyecto de pruebas | PostgREST: `max_rows` 1000 trunca sin error (la paginación de 500 lo evita); `or=(…)` del cursor; embedding bajo RLS; cabecera `x-al3d-contrato` llega a `request.headers` |
| EX-08 | proyecto de pruebas | Realtime: con dos sesiones (Dirección y Fabricación) un `update` de `ventas_dinero` **solo** llega a Dirección; el `DELETE` no existe |
| EX-09 | proyecto de pruebas | concurrencia: dos conexiones ejecutan `registrar_cobro` con el mismo `op_id`, `ganar_proyecto` con el mismo `folio_global`, `repartir_abono_fifo` y `registrar_abono_comision` a la vez, dos `siguiente('V')`: **esperado** un solo efecto, sin repetir folio y sin doble reparto |
| EX-10 | proyecto de pruebas | Auth: «Allow new users to sign up» encendido ⇒ una cuenta nueva ve `sin_acceso` y nada más; `signInWithIdToken`/OAuth en iPhone con la PWA instalada (**solo Elías puede probarlo**, [DEC Q-08]) |
| EX-11 | navegador | `pruebas/navegador/dos-telefonos.mjs` reescrita contra el proyecto de pruebas: la regla de sellos con dos aparatos; `acceso_revocado` con sus tres candados |
| EX-12 | impreso | un **QR impreso real** verifica en `github.io` **y** en `pages.dev` antes de apagar `/verificar` del Apps Script [DEC Q-11] |

### 10.18 De las pruebas actuales a las nuevas

| Prueba actual | Destino |
|---|---|
| `precio-servidor.mjs` (catálogo cotizador ↔ `.gs`) | se conserva y **se extiende** al módulo TS de la Edge Function (mismas semillas) [N-07] |
| `puente-hoja.mjs`, `puente.mjs`, `puente-almacen.mjs`, `sincronizacion.mjs`, `navegador/dos-telefonos.mjs`, `notario.mjs`, `verificar-desde-el-papel.mjs` (leen el `.gs` en una VM) | **se reescriben** contra las RPC (los casos de [M05 §4.7], [M03 §7], [M04 §1.9] ya están convertidos en SE/AL/NO/VB arriba); las que dependen del `.gs` **no se borran** hasta que el cuadre de 7 días pase [00 §6.3] |
| `proyectos.mjs`, `ventas.mjs`, `taller.mjs`, `entrega.mjs`, `datos-de-entrega.mjs`, `ics.mjs`, `reglas.mjs`, `cuadernos.mjs`, `comisiones.mjs` | **siguen valiendo** (funciones puras del cliente) |
| `csp.mjs`, `publicacion.mjs`, `navegador/publicas.mjs` | se actualizan por `wss:` y por los hosts nuevos (CSP de `index.html`, `cotizador.html`, `verificar.html`) [C-32] |
| ninguna evalúa H/K/R/T | **nuevas: FM-01..FM-35** [C-07] |

---

## 11. Riesgos, supuestos y preguntas que quedan

### 11.1 Supuestos (si alguno falla, el diseño cambia en el punto indicado)

| Id | Supuesto | Si falla |
|---|---|---|
| S-01 | `auth.users` del arnés (`id`, `email`, `email_confirmed_at`, …) basta para `correo_verificado()`, y en Supabase real el JWT trae el claim `is_anonymous` y `email_confirmed_at` está lleno para quien entró con Google | si el claim faltara, `correo_verificado()` solo exigiría `email_confirmed_at`; si `email_confirmed_at` quedara vacío para Google, ver `S-07` |
| S-02 | `America/Mexico_City` existe en la base de zonas de PGlite | **verificado** en PGlite 0.5.8 (CU-03/CU-04 pasan); si una versión futura no la trajera, `hoy_mx`/`dia_mx` con offset fijo −06:00 (válido desde oct-2022) |
| S-03 | en Supabase el dueño de las migraciones (`postgres`) tiene `BYPASSRLS`, así que las funciones `SECURITY DEFINER` saltan RLS aunque la tabla la tenga | ninguna política podría usarse para `miembros` desde helpers: habría que `FORCE`/exceptuar con `SET row_security = off` en cada helper |
| S-04 | PostgREST publica las cabeceras en el GUC `request.headers` | el contrato iría como parámetro `p_contrato` de cada RPC |
| S-05 | `round(numeric,2)` (mitad lejos de cero, decimal exacto) = `ROUND` de Sheets en los empates reales | ver R-01: se documenta la diferencia y manda lo que decida Elías |
| S-06 | la hoja viva corre `puente-sheets-14` con AG:AI, y las tres pestañas del almacén existen [M02 §0.1; M03 §10.2] | las filas sin sellos entran con sello 0; el almacén se importa solo de los teléfonos |
| S-07 | un usuario de Google tiene `email_confirmed_at` no nulo en `auth.users` | `reclamar_acceso` nunca vincularía; habría que aceptar `app_metadata.provider='google'` como segunda prueba |
| S-08 | una persona = un correo (Google no cambia el correo principal) | un cambio de correo se maneja como baja + alta |
| S-09 | «Allow new users to sign up» queda **encendido** [P-07] | apagarlo exige pre-crear el usuario en cada alta |
| S-10 | `clock_timestamp()` + solape de 30 s cubren el desorden de confirmación | subir el solape (barato) o añadir `seq` a más tablas |
| S-11 | las ≥199 filas históricas y los volúmenes de §2.20 | el diseño no cambia; cambia el tamaño de los lotes del importador |
| S-12 | Fabricación **no** tiene acceso al archivo de Drive de la hoja espejo | el espejo es un canal de dinero fuera de RLS (R-05) |

### 11.2 Riesgos

| Id | Riesgo | Mitigación en el diseño | Queda abierto |
|---|---|---|---|
| R-01 | **Redondeo de Sheets en empates** (centavos en 5 de `ROUND(G*10%,2)`): `numeric` redondea sobre el valor decimal exacto; Sheets (doble precisión) pudo dar otro centavo en ~2 % de esos casos [M02 §2.4] | FM-03..FM-05 y FM-34 (oráculo decimal); **FM-35 contra la hoja real antes de la fase 4** | si Sheets difiere, decide Elías si manda la hoja o la base |
| R-02 | **El HMAC con `String` en Apps Script** no documenta codificación [00 P-02]; el repo trae evidencia **no verificada** de US-ASCII con «?» (12 HMAC atribuidos al Apps Script real, `sello.js` y `pruebas/supabase-sello.mjs`) y ninguna fila real | la base guarda verbatim y **no firma**; cada fila guarda su `codificacion` y la Edge verifica con ella (C-13); los sellos nuevos, UTF-8; EX-01 con filas reales **antes de la fase 1**; la firma vive en una sola Edge Function | hay que sacar 3–5 filas reales y la clave por un canal que no sea el chat ni el repo. **Residuo**: un sello heredado con `ascii-?` no distingue un carácter no ASCII de otro (un acento cambiado no rompe la firma); no se corrige hacia atrás sin reimprimir PDF |
| R-03 | PGlite ≠ Supabase real (PostgREST, Realtime, Storage, concurrencia) | §9.2 y §10.17; el proyecto `al3d-pruebas` es la validación real | confirmar la lista de EX-07..EX-10 |
| R-04 | Realtime y RLS: que el servicio realmente filtre por suscriptor | GR-05 + R1-15 + EX-08; **nunca** hay `DELETE` ni `REPLICA IDENTITY FULL` | EX-08 en el proyecto de pruebas |
| R-05 | **La hoja espejo contiene todo el dinero fuera de RLS** | S-12; permisos de Drive del archivo; el espejo solo escribe columnas capturadas | confirmar con Elías quién tiene acceso al archivo hoy |
| R-06 | cualquier cuenta de Google puede crear un usuario de Auth (registro abierto) | RLS niega por defecto; `mi_acceso` → `sin_acceso`; no se ve ni un dato | alerta si alguien reclama acceso inesperado: la bitácora de accesos lo registra |
| R-07 | **texto libre con dinero** (`desc` de una partida, `notas`, `instalaciones.notas`, `almacen_movimientos.nota`): la base no puede saber si alguien escribió un precio | la base garantiza lo estructural (R1-01..R1-18) | hábito y capacitación: no poner importes en notas que ve Fabricación |
| R-08 | **pérdida de datos que solo existen en un teléfono** al borrar por revocación [P-01] | `subida_unica` con acuse por registro; tres candados; **todo deshabilitado hasta que exista** (§7.5) | un teléfono que nunca vuelve a conectarse conserva sus datos (se dice así a Dirección) |
| R-09 | **Pagos sin pantallas**: la base ya soporta cobro/abono/reparto/corrección, pero declarar la hoja «solo lectura» antes de que existan las pantallas detendría la cobranza [P-04] | `DEC Q-01`: la hoja no pasa a solo lectura hasta pantallas + 7 días de cuadre | las pantallas no entran en esta rama |
| R-10 | **capacidad de la hoja** (309 ventas, 1999 abonos) frente a una base sin tope [P-09] | el espejo compara y responde `capacidad_agotada` sin escribir parcial | subir `FIN` y repasar `mejorarTodo`, o espejar un subconjunto (decisión del despliegue) |
| R-11 | **el reloj del teléfono decide quién gana**; el tope de `ahora+10 min` deja una ventana de 10 min en la que un reloj adelantado puede ganar | `compuerta` acota; SE-07, AL-15 | no se resuelve del todo sin sellar con `now()` (Q-06 eligió el sello del cliente para no perder ediciones sin señal) |
| R-12 | **datos vivos que ningún mapa pudo ver** (filas reales de Ventas/Abonos, versión del script, `Accesos`, `Autorizaciones`, teléfonos y tamaños) [00 §9] | el importador reporta, no decide; cuadre por folio | leer la hoja viva (solo lectura) antes de la fase 2 |
| R-13 | **Fabricación como autora de cotizaciones** (`Q-A01`): pierde `estado` con importes, no imprime QR de sus propias cotizaciones | puede pedir autorización y ve estado/código sin importes; basta una cláusula `OR` en dos políticas para abrirlo | confirmar si Fabricación cotiza de verdad |
| R-14 | **plan gratuito**: pausa a los 7 días y sin respaldos ni PITR [00 §10] | opcionales: keep-alive cada 2 días (GitHub Actions) y respaldo semanal por Edge + Apps Script a Drive; nada de esto vive en el esquema | definir la credencial del respaldo |
| R-15 | el diseño **exige cambios de contrato al cliente** (§11.5) | todo está en la lista; sin ellos la base rechaza (`CLIENTE_VIEJO`, `DATO_INVALIDO`) | construirlos |
| R-16 | `Q-A05` (sellos obligatorios) rechaza operaciones legítimas de un cliente con un error | rechazo **definitivo** con mensaje claro; la bandeja la aparta, no la pierde | prueba de navegador EX-11 |
| R-17 | una cuenta de Google comprometida = acceso (la identidad es el correo verificado) | bitácora `direccion` de altas/reclamos; `miembro_baja` corta en la siguiente petición | MFA de Google es del usuario |
| R-18 | fusionar instalaciones duplicadas puede dejar un evento duplicado en un calendario **ya sincronizado** [N-03] | UID canónico = mayor `movida`; las demás `cancelada` sin tocar calendario; reporte | Elías revisa el reporte |
| R-19 | teléfonos con el service worker viejo siguen escribiendo a la hoja tras el corte [P-10] | §7.6 | responder «actualiza la app» desde `/empujar` |
| R-20 | lápidas sin purga | volumen ínfimo; `Q-A18` | revisar a los 2 años |
| R-21 | el `CHECK autorizaciones_codigo_es_firma` rechaza una fila cuyo `Código` esté mal escrito en la hoja | el importador normaliza con `normalizarCodigo`; si aún no cuadra, reporte y la fila queda en la hoja congelada | — |
| R-22 | CPU 2 s por petición en Edge Functions (excluye E/S) y cuerpo no documentado | HMAC y JSON son baratos; EX-05 mide `ia` con 1600 px | **NO CONFIRMADO** el límite de cuerpo |
| R-23 | `solicitar` no recalcula el catálogo (`Q-A20`): un vendedor desactualizado llega a la cola de Dirección | el error aparece al autorizar (`CATALOGO_DESINCRONIZADO`), nunca un sello equivocado | si molesta, `solicitar` pasa por la Edge Function |
| R-24 | un `proyecto` con **sustituto suelto** (emoji partido) no se puede guardar en `text` y `JSON.stringify` lo escaparía como `\ud83d` | la Edge Function sanea (`toWellFormed`) **antes** de firmar y guarda lo firmado | ver [M04 §1.2] |
| R-25 | `cotizaciones.datos` se reemplaza entero: la última escritura gana entre autor y Dirección | la evidencia firmada está en `autorizaciones` (inmutable) | `Q-A21` |

### 11.3 Preguntas que quedan (con el valor por defecto elegido)

| Id | Pregunta | Valor por defecto elegido | Efecto de cambiarlo |
|---|---|---|---|
| Q-A01 | Si **R1 (nada de dinero a Fabricación)** pesa más que `DEC Q-02` («Fabricación y Pagos leen las suyas»): ¿Fabricación lee sus propias cotizaciones? | **No**: ve estado y código sin importes por `estado_solicitudes` | una cláusula `OR creado_por = auth.uid()` en `cotizaciones_sel_*` y `solicitudes_sel_*` (2 políticas) y quitar la proyección |
| Q-A02 | ¿`tarifa` (precio por m² de la caja) es dinero para Fabricación? | **Sí**: se sustituye por `caja_forma` que calcula el cliente | si no: se deja `tarifa` en `origen_obra` y se quita del denylist |
| Q-A03 | ¿Pagos puede dar de alta una venta manual (`alta_venta`)? | **Sí**, como el menú «Registrar nueva venta» (`Q-01`); `ganar_proyecto` solo Dirección | quitar `pagos` de dos listas |
| Q-A04 | ¿Pagos puede poner cualquiera de los 4 estatus? | **Sí** (igual que `PUENTE_ROLES.pagos`, `.gs:2134`) | restringir a `COBRANDO`/`LIQUIDADO` como su pantalla |
| Q-A05 | ¿Una operación **sin el objeto `sellos`** (o sin `p_sello`) que toca un grupo sellado se rechaza? | **Sí**, `DATO_INVALIDO` (hoy gana siempre); con el objeto presente, el sello que falte vale 0 y lo decide la compuerta | volver a `llega = ahora` (reabre P-08) |
| Q-A06 | ¿Autorizar **la misma decisión** resuelve la solicitud pendiente? | **Sí** (el `.gs` la dejaba pendiente, `.gs:3939-3952`) | no resolver (comportamiento actual) |
| Q-A07 | ¿Cobro solo con monto > 0 y fecha por omisión = hoy? | **Sí**; las correcciones van por `corregir_venta` | aceptar negativos |
| Q-A08 | ¿`abonos.fecha` es `date` (sin hora)? | **Sí** (así «Comisiones por periodo» incluye el abono de hoy; hoy el puente guarda la hora y lo excluye hasta mañana, **NO CONFIRMADO** en vivo) | `timestamptz` |
| Q-A09 | ¿Fabricación lee las filas históricas de `proyectos`? | **Sí** (paridad con lo que ya baja) | política con `not historica` para Fabricación |
| Q-A10 | ¿Tope por IP de `/verificar`? | **60 por ventana de 600 s** (`p_ip` opcional) | quitarlo |
| Q-A11 | ¿Las notas del cuaderno son por autor? | **Sí** | una por cliente y empresa, leída por Dirección |
| Q-A12 | ¿La transición automática (2) sella `etapa` con la hora del servidor? | **Sí** | no sellar |
| Q-A13 | ¿`etapa` y `entrega` no se pueden vaciar? | **No se vacían** (`borrable=false`, como `obraDeLaFila`) | permitirlo |
| Q-A14 | Zona horaria de «hoy» (antigüedad) y de la cuota IA | `America/Mexico_City` (la hoja dice «la zona de México», `.gs:2616`; id exacto **NO CONFIRMADO**) | leer `getSpreadsheetTimeZone()` y alinear |
| Q-A15 | Redondeo de Sheets en empates reales | `numeric` decimal exacto, **NO CONFIRMADO** | FM-35 decide |
| Q-A16 | `reclamar_acceso` con un correo ya vinculado a otra cuenta | `ACCESO_CONFLICTO`; Dirección reactiva | RPC de reasignación |
| Q-A17 | `al3d_q` (borrador en curso) | **no se migra** (no hay estado `borrador`) | agregar `borrador` a `cotizaciones.estado` |
| Q-A18 | lápidas sin purga | **sin purga** | purga por `service_role` tras 2 años |
| Q-A19 | proyecto vivo marcado «fuera de la hoja» por Dirección | **entra al libro** con folio nuevo y se reporta | dejarlo como lápida |
| Q-A20 | `solicitar` sin recalcular el catálogo | **sin recalcular**; el error llega al autorizar | pasar por la Edge Function |
| Q-A21 | `cotizaciones.datos` reemplazado entero (autor vs Dirección) | **última escritura gana** | versionar con `autorizacion_id`/hash |
| Q-A22 | región y proveedor de la base (para el aviso de privacidad) | la del proyecto `al3d-pruebas` (West US N. California) y la de producción por decidir | `Q-17` |
| Q-A23 | ¿una lápida («No se dio») se puede volver a ganar o sacar de `cancelado`? | **No**: `mover_etapa` → `DATO_INVALIDO` y `ganar_proyecto` sobre su `folio_global` → `DUPLICADO` (como `yaExiste`, `proyectos.js:643-654`); se vuelve a cotizar | permitir que `ganar_proyecto` la reabra (`UPDATE` de la misma fila + folio nuevo + `ventas_dinero` en ceros; `folio_hoja` pasa de `NULL` a valor, que `proyectos_inmutable` ya admite) |

### 11.4 Cómo se aplican las decisiones `DEC Q-01..Q-20`

| DEC | Dónde se cumple |
|---|---|
| Q-01 Pagos | §5.7 (`registrar_cobro`, `registrar_abono_comision`, `repartir_abono_fifo`, `corregir_venta`, `alta_venta`); §10.7; las pantallas **no** entran |
| Q-02 Cotizaciones/solicitudes | §2.11–2.12, §4.2: autor + Dirección; **más estricto** para Fabricación (`Q-A01`) |
| Q-03 `estatus`, `iva`, fecha de anticipo | §2.6: en `proyectos`, visibles a los tres roles |
| Q-04 Históricas | §2.6 (`historica`), §3.0, §6.6, HI-01..HI-07 |
| Q-05 Etapa por rol | §5.6, ET-01..ET-23 (incluye las dos transiciones automáticas) |
| Q-06 Sellos | §5.4: sello del **cliente**, acotado a `ahora+10 min`; empate al subir escribe; al bajar gana lo local (**se queda en el cliente**) |
| Q-07 Folios | §8.3: `V-###` por contador sembrado; `unique(empresa_id, folio_global)`; `COT-NNNN` intactos |
| Q-08 Login | §4.7 y `reclamar_acceso`; el flujo `signInWithIdToken` es del cliente; EX-10 (iPhone: solo Elías) |
| Q-09 `acceso_revocado` | §5.3, §7.5, AC-08..AC-15 |
| Q-10 Hoja espejo | §7.8, §3.2: Ventas + Abonos, `FIN`, `capacidad_agotada`, sin pestañas nuevas |
| Q-11 `/verificar` | §3.8, §5.10, EX-03, EX-12 |
| Q-12 Auth de Apps Script | §7.8: secreto compartido, tiempo constante |
| Q-13 Almacén | §2.14–2.19, §4.2, §5.9: Dirección y Pagos ven costos; Fabricación opera sin verlos |
| Q-14 Importación | §3.0, §3.5, §5.13, §10.15 |
| Q-15 Instalaciones/UID | §2.9, §3.5, IN-01..IN-10, IM-06 |
| Q-16 Retazos | §3.6: por aparato, sin migrar |
| Q-17 Privacidad | **fuera de este documento**; lo que pasa a la base (para quien lo redacte): `proyectos.tel`, `dir_texto`, `lat`/`lng`/`maps_url`, `contacto`, `negocio`, `notas`; `cotizaciones.datos` (cliente, teléfono, dirección, partidas, precios); `autorizaciones.cliente`; `miembros.correo`; `bitacora.usuario_texto`; imágenes en Storage |
| Q-18 Repositorio | §9.1: `supabase/` y `scripts/` en este repo; reportes y volcados **fuera** del árbol (IM-09) |
| Q-19 IA | §8.1: 200/día por persona en `America/Mexico_City`; lista blanca de modelos y URLs en la Edge Function |
| Q-20 Respaldo y pausa | §9.1 (opcionales); R-14 |

### 11.5 Lo que este diseño exige del cliente y de las Edge Functions (contrato; no es diseño de pantallas)

| # | Exigencia | Por qué |
|---|---|---|
| C-1 | los sellos viajan **por grupo** (`etapa`, `notas`, `plazo_k`, `tel`, `dir_texto`, `ubicacion`, `entrega`, `instalacion`) y **siempre** que se toque un grupo sellado | §5.4 |
| C-2 | `items[].caja_forma` (el cliente tiene el catálogo) y no mandar `tarifa` en lo que va a Fabricación; la base de todos modos lo quita | §4.5 |
| C-3 | `op_id` (el id de la operación de la bandeja) en cobro, abono, reparto, corrección de abono | §7.3 |
| C-4 | `anexo` (el renglón nuevo) en vez de `notas` completas en instalaciones | §5.8 |
| C-5 | cabecera `x-al3d-contrato` en toda llamada de escritura | §7.6 |
| C-6 | traducir nombres: `anti_pactado→anticipo`, `estatus_notion→estatus`, `fecha_ganado→fecha_anticipo`, `sub→subtotal`; ignorar `sync` y `notion_*` | §3.5 |
| C-7 | el cotizador (iframe con scripts clásicos que no pueden importar `supabase-js`) habla **solo** por `window.AL3D` hacia el padre, también para «Registrar venta» [N-11; C-25] | §7.4 |
| C-8 | `Prefs.rol()` sale de `mi_acceso()`; sin pase válido **no** cae a `'direccion'`; se sigue escribiendo `al3d_pf_pase` `{correo, rol, hasta}` (`prefs.pase()` exige `rol`; los lectores sin módulos solo miran `correo` y `hasta`) | §3.6 |
| C-9 | `subida_unica` (con acuse) y la subida de imágenes a Storage **antes** de habilitar el borrado por revocación | §7.5 |
| C-10 | Control lee `ventas_calculadas` (no `ventas_hoja`) | §6.6 |
| C-11 | la edge `autorizar` sanea con `toWellFormed()`, firma con **un solo módulo** (`_shared/sello.js`) compartido con `verificar`, y devuelve error explícito (nunca `no_autentica`) si falta la clave | §5.10 |
| C-12 | CSP de `index.html`, `cotizador.html` y `verificar.html` con `https://<ref>.supabase.co` y `wss://<ref>.supabase.co`; subir `APP_VERSION` de `sw.js` | [C-32; M08] |
| C-13 | la edge `verificar` pasa a `verificar()` de `sello.js` la `codificacion` **de cada fila** (`codificaciones: [fila.codificacion]`); hoy el módulo acepta las dos para todas, y un sello **nuevo** podría verificar también como `ascii-?` (un acento cambiado no se detectaría) | §5.10, R-02 |
| C-14 | las edges `verificar` e `ia` cuentan el cupo **una sola vez**, con `verificar_cupo` / `ia_cuota` (el día de México y el tope por IP los pone la base), y devuelven su sobre tal cual | §8 |

### 11.6 Lo que hay que leer de la hoja viva ANTES de implementar (solo lectura; nada de esto está en el repo)

| Qué | Para qué |
|---|---|
| `Código.gs` vivo vs `puente/hoja-apps-script.gs`; `PUENTE_VERSION`; `appsscript.json` (V8) | S-06, R-02 |
| nombres (no valores) de las propiedades del script; disparadores; zona horaria de la hoja | §3.7, Q-A14 |
| filas ocupadas de Ventas y de «Abonos comisión»; fórmulas de la fila 2; encabezados A1:AI1 | §3.1, R-10 |
| «Accesos» (duplicados, mayúsculas, fila de ayuda de `A4`) | §3.4 |
| «Autorizaciones»: cuántas filas v1/v2, ediciones a mano, 3–5 filas de muestra | EX-01 |
| «Almacén», «Catálogo», «Listas» y `ALMACEN_SECUENCIA` | §3.3 |
| despliegue del Web App («Ejecutar como», «Quién tiene acceso») | §7.8 |
| teléfonos: cuántos, tamaño de `al3d_historial`, bandeja, entradas sin `disp` | §5.12 |

Reglas para leerla [00 §9]: no abrir ni capturar pantallas de llaves, Vault, valores de propiedades del script ni el secreto del cliente OAuth; ningún dato de clientes se copia al repo ni al chat; cada escritura pide confirmación expresa.
