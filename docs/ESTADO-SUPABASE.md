# Estado de la migración a Supabase

**Última actualización: 2026-10-24, novena entrega: los gastos de Control también viven en la nube (`0020` y la copia diaria trae la pestaña «Gastos»), las 55 cotizaciones del aparato 5D93 ya están en la base (subida única desde el Chrome de Elías; las 5 autorizadas llenaron su talón con `0021`). `0020`, `0021`, la función `importar-diario` y «Copia diaria» **publicadas el 2026-10-24** (PR #159). La copia diaria estuvo sin aplicarse del 2026-10-20 al 24 (V-208: la Liquidación tenía un espacio); corregida en la hoja con el dato de Elías y vuelta a correr: **cuadra**. Ver «Gastos» y «Cotizaciones del aparato 5D93» al final.** Octava entrega, 2026-10-23: los precios editables del cotizador también viven en la nube (`0019`, la función `autorizar` cobra con ellos y la copia diaria trae la pestaña «Tarifas»), **aplicados y publicados** ese día; ver «Precios editables» abajo.** Séptima entrega, 2026-10-17: las autorizaciones entran con la copia diaria comprobadas DENTRO de la hoja (la clave del sello no sale de ahí) y el respaldo semanal lo pide la hoja a `importar-diario` y lo guarda en Drive, sin cuenta de servicio; falta pegar dos archivos y ejecutar una función; ver «Séptima entrega» abajo.** Sexta entrega, 2026-10-16: la copia diaria hoja → nube (función `importar-diario`, `0018` y `puente/copia-diaria.gs`; en marcha desde el 2026-10-17); ver «Sexta entrega» abajo. Quinta entrega, el mismo día: Fabricación ve las imágenes de las obras ganadas (Q-02 bis, decidido por Elías ese día; `storage.sql` hay que volver a aplicarlo); ver «Quinta entrega» abajo. Cuarta entrega, el mismo día: las imágenes de las cotizaciones a Storage (bucket privado con las políticas de Q-02, subida con la sombra y bajada en vivo, todo apagado) y la prueba de humo que ya pasa con datos reales; ver «Cuarta entrega» abajo. Tercera entrega, el mismo día: el proyecto de PRODUCCIÓN existe y tiene los datos de la hoja, la app apunta a él (apagada) y las decisiones de Elías del mismo día (Q-05 y Q-19 cambian, `0017`); ver «Tercera entrega» abajo. Antes, ese mismo día (segunda entrega: huecos de la revisión, `autorizar`, `respaldo`, escritura en sombra, lectura en vivo y pantallas de Pagos, todo apagado; y las decisiones de Elías del mismo día sobre sellos y folios, `0014` y `0015`, y sobre los plazos de conservación, `0016`; ver «Segunda entrega» abajo). Primera entrega: 2026-10-10. Es el avance real, fase por fase, de [`PLAN-SUPABASE.md`](PLAN-SUPABASE.md): el plan dice qué se va a hacer, [`DECISIONES-SUPABASE.md`](DECISIONES-SUPABASE.md) dice cómo, y aquí está qué ya existe, con qué evidencia y qué falta. Las cifras son de corridas reales hechas ese día; lo que no se pudo comprobar está en «No verificado», sin adornos.

## En una frase

La migración está **apagada, pero ya tiene su casa de verdad**: el proyecto de producción `al3d-produccion` existe, tiene las migraciones `0001`–`0016`, Google configurado y los datos de la hoja importados (219 ventas, 186 abonos, cuadre con 0 diferencias), y la app apunta a él con el interruptor **apagado** en cada aparato. **La hoja sigue siendo la fuente de verdad hasta la fase 4** (y pasa a solo lectura después de 7 días seguidos de cuadre, cuando Elías lo confirme). Lo único que cambia hoy para la gente es la regla de etapas (Q-05): los tres roles mueven la etapa y solo Dirección cancela. Las imágenes de las cotizaciones ya tienen su bucket (aplicado en los dos proyectos el 2026-10-16, humo 69 de 69) y su código para subir a la nube, también apagado; desde Q-02 bis (Elías, 2026-10-16) Fabricación ve las de las obras ganadas, y para eso falta **volver a aplicar** `supabase/opcional/storage.sql` (humo: 74).

## Cómo leer los estados

| Estado | Qué quiere decir |
|---|---|
| **hecho** | Existe y alguien lo revisó o lo corrió |
| **hecho y verificado en PGlite** | Existe y una prueba de base de datos lo comprueba en PGlite, que es una imitación de Supabase dentro de la computadora ([`supabase/tests/README.md`](../supabase/tests/README.md)). No sustituye la prueba contra el proyecto real de pruebas |
| **pendiente** | No está terminado, incluido lo que se está construyendo ahora |
| **bloqueado por Elías** | Nadie más puede avanzar: hace falta una decisión, una cuenta o una prueba que solo él puede dar |

## Resumen por fase

| Fase | Qué es | Estado hoy | Puerta de salida (la del plan) |
|---|---|---|---|
| 0 | Decisiones y documentación | **hecho**; Elías revisó todas las decisiones el 2026-10-16 (cambian Q-05 y Q-19) | Documento de decisión aprobado; no se toca código de producción |
| 1 | Base y acceso | **hecho y verificado** (PGlite **y** el proyecto real de pruebas). Entrada con Google hecha en el cliente (apagada); falta probarla en el iPhone | Pruebas de RLS (las reglas de qué ve cada área) en verde para los tres roles; ninguna fila real todavía |
| 2 | Importar | **hecho en producción el 2026-10-16**: 219 ventas y 186 abonos, cuadre con 0 diferencias. Las 30 autorizaciones entran con la copia diaria en cuanto se peguen los archivos del 2026-10-17 (la hoja las comprueba con su clave, que no sale de ahí). La «Bitácora del puente» se queda en la hoja | Reporte de cuadre que coincida con la hoja y con los teléfonos |
| 3 | Doble escritura | **hecho con dobles, apagado**: ruta `espejo`, escritura en sombra desde la bandeja y cuadre (botón en Ajustes y flujo diario). Falta probarlo contra el proyecto real y encenderlo en cada aparato que escribe | Siete días seguidos de cuadre; si no cuadra, se regresa a la fase 2 |
| 4 | Cambio de lectura | **hecho con dobles, apagado**: lectura de Supabase con Realtime (segundo interruptor) y pantallas de Pagos. El respaldo semanal lo hace la hoja desde el 2026-10-17, sin secretos nuevos (falta pegarlo); falta la prueba real | Los tres roles lo usan una semana sin incidentes; vuelta atrás: leer otra vez de la hoja, que sigue completa |
| 5 | Retiro | **pendiente** | El Apps Script queda con dos rutas (`espejo` y `carpetas`) |
| 6 | Clientes | **pendiente** (después) | El plan no la define; por completar al decidir su arranque |

---

## Fase 0 — Decisiones y documentación

| Pieza | Estado | Evidencia |
|---|---|---|
| Plan escrito y aprobado por Elías (2026-10-10) | hecho | [`PLAN-SUPABASE.md`](PLAN-SUPABASE.md) |
| Decisiones por pregunta, Q-01 a Q-20 | hecho | [`DECISIONES-SUPABASE.md`](DECISIONES-SUPABASE.md) |
| Que Elías las confirme o las cambie al revisar el PR | bloqueado por Elías | `DECISIONES-SUPABASE.md`, arriba |
| `ARQUITECTURA.md` corregida: el punto 13 («No se usa Supabase») queda como decisión de agosto, revertida; notas «Ruta Supabase (en construcción, apagado)» en lo que el plan contradice | hecho | [`ARQUITECTURA.md`](ARQUITECTURA.md) |
| Encabezado de `js/datos/sync.js` reescrito (hablaba de Notion y de un Worker que ya no existen). Solo comentarios: cero cambios de código | hecho | [`js/datos/sync.js`](../js/datos/sync.js), líneas 1-76 y 85-124 |
| Notas «Migración a Supabase (en construcción)» y una corrección de hecho en el puente | hecho | [`puente/README.md`](../puente/README.md), [`puente/DESPLIEGUE.md`](../puente/DESPLIEGUE.md) |
| Borrador de los cambios al aviso de privacidad | hecho; **aplicado el 2026-10-16** con las decisiones de Elías (rama `claude/aviso-privacidad-supabase`). Falta avisar al equipo antes de encender y la revisión legal del aviso a clientes | [`BORRADOR-PRIVACIDAD-SUPABASE.md`](BORRADOR-PRIVACIDAD-SUPABASE.md) |
| Confirmar la lista de áreas | bloqueado por Elías | `PLAN-SUPABASE.md` §9, punto 2 |
| Avisar al equipo de que la hoja dejará de ser editable | bloqueado por Elías | `PLAN-SUPABASE.md` §9, punto 3. La hoja **no** se declara de solo lectura antes de la fase 4 (`DECISIONES-SUPABASE.md`, Q-01) |

**Puerta de salida:** documento de decisión aprobado, sin tocar código de producción. Hoy: el plan está aprobado; las decisiones esperan la confirmación de Elías.

## Fase 1 — Base y acceso

| Pieza | Estado | Evidencia |
|---|---|---|
| **Proyecto de PRODUCCIÓN en Supabase: `al3d-produccion`**, ref `gwzfdprdrdudfakjsdxf`, `https://gwzfdprdrdudfakjsdxf.supabase.co`, región us-west-1. Migraciones `0001`–`0016` aplicadas y Google configurado | hecho (2026-10-16) | Creado y configurado en la sesión de Elías del 2026-10-16. `0017` está en esta rama y **falta aplicarla** (abajo, «Tercera entrega») |
| La app apunta a producción: `js/datos/supabase-config.js` (URL y llave **pública** de `al3d-produccion`; el de pruebas queda anotado en una constante `EN_USO`, sin botón en la app) y la CSP de `index.html` (`https` y `wss`). `sw.js` 120 | hecho, **apagado** | `pruebas/supabase-entrada.mjs`: apagado no carga nada; lo publicado apunta a producción; la CSP coincide con el proyecto en uso y no deja pasar el de pruebas |
| Proyecto de pruebas en Supabase: `al3d-pruebas`, organización «AL3D Free», West US (North California), ref `hhwjlxukuzxearrjurtc`. Sin datos reales. **Sigue existiendo**; la app ya no habla con él | hecho | Creado el 2026-10-10 desde la sesión local, con permiso de Elías (`PLAN-SUPABASE.md`, nota de implementación) |
| Límites del plan gratuito | hecho | Verificados el 2026-10-10 (ver «Verificado vs. no verificado») |
| Arnés de pruebas de base de datos en PGlite | hecho | [`supabase/tests/`](../supabase/tests/README.md): `arnes/`, `autoprueba.mjs`, `correr.sh` |
| Módulos puros de las funciones: sello de autorización, enlace corto de Maps, inteligencia artificial y verificación | hecho y verificado | `supabase/functions/_shared/{sello,maps,ia,verificar}.js` y `pruebas/supabase-{sello,maps,ia}.mjs`. Probados contra el `.gs` **real** cargado en una máquina virtual (22 127 casos del sello) y, por mutación, rompiéndolos a propósito: cada rotura la detecta alguna prueba |
| Las 12 migraciones (base común, acceso, proyectos y dinero, fórmulas, almacén, funciones de obra, de pagos, notario, cupos, espejo, auditoría) | hecho y verificado | `supabase/migrations/0001`…`0012` (17 tablas, vistas con `security_invoker`, funciones `SECURITY DEFINER` con `search_path` fijo). **Aplicadas sin error en el proyecto real `al3d-pruebas`** y la auditoría `0011` pasó ahí, también después de `0012` (el endurecimiento que dejó la revisión adversarial) |
| Pruebas de la base: acceso, RLS y dinero, fórmulas al centavo, obra y etapas, pagos, almacén, notario, cupos, sincronización y auditoría | hecho y verificado en PGlite | `supabase/tests/`: **33 archivos, 780 comprobaciones, 0 fallos** (`sh supabase/tests/correr.sh`, ~4 min). Cada caso lleva su id de `supabase/DISENO.md` §10, permitido **y** denegado por rol. 70 mutaciones a las migraciones: las que sobrevivieron al principio se reforzaron y hoy todas mueren |
| **Prueba de humo en Supabase real**: las tres áreas simuladas con sus reglas de acceso (Fabricación no ve dinero, Pagos cobra y reenviar un cobro no lo suma dos veces, la persona ajena no ve nada, anon denegado, fórmulas 4640 / 3640 / 400) | hecho y verificado **en el proyecto real** | `supabase/opcional/prueba-de-humo.sql`: **27 de 27** el 2026-10-10 (los cuatro últimos son del endurecimiento: `NaN` e `Infinity` se rechazan y una cuenta de correo que no es de Google no reclama Dirección). Además, desde internet con solo la llave pública: anon no lee `proyectos` ni `ventas_dinero`, no inserta, no ejecuta `mi_acceso` y el esquema `interno` no está expuesto |
| Funciones del servidor: `salud`, `verificar`, `maps`, `ia` | hecho y verificado en node y en Deno | `supabase/functions/*` y `pruebas/supabase-funciones.mjs` (452 comprobaciones en node y 401 bajo Deno 2.9.6; `deno check` pasa). **No se han desplegado** (necesitan tus secretos) |
| Inicio de sesión con Google (Supabase Auth) | hecho, **apagado** (interruptor por aparato en Ajustes, solo Dirección); falta la prueba en iPhone | [`js/nucleo/supa.js`](../js/nucleo/supa.js): token de identidad de Google (`google.accounts.id`, mismo Client ID) con nonce → `signInWithIdToken` → `mi_acceso()` (reclama sola una invitación). Librería `vendor/supabase.js` (supabase-js 2.116.0, sin cambios, con su huella en `vendor/SUPABASE-LICENSE.txt`), que solo se carga encendido. CSP de `index.html` con el proyecto de pruebas (https y wss); `sw.js` 96. La puerta de hoy (`puerta.js`) **no se tocó**. Pruebas: `pruebas/supabase-entrada.mjs` (59). Verificado en navegador local: apagado no carga nada y Fabricación no ve la tarjeta; encendido carga la librería y pinta el botón de Google sin errores de CSP. Contra `al3d-pruebas` sin sesión: `mi_acceso` y `miembros` niegan el acceso. `eliasgaribi@gmail.com` dada de alta como Dirección **invitada** en `al3d-pruebas` (2026-10-12) |
| Altas, cambio de área y bajas desde la app | hecho, apagado | Ajustes → «Supabase (pruebas)» → Personas, solo con sesión activa de Dirección (`miembro_alta`, `miembro_cambiar_area`, `miembro_baja`) |
| Acceso retirado con sus tres candados | hecho, apagado; **el borrado está deshabilitado** | Dos respuestas explícitas con 5 s o más; solo tapa la app si la cuenta retirada es la misma de la puerta y siempre con botón para apagar; `BORRADO_HABILITADO = false` hasta que exista la subida única con acuse; conserva `al3d_pf_disp` y `al3d_folio` |
| Pendiente de esta pieza | — | Que el rol de la app salga de `mi_acceso()` (C-8) en vez de la hoja, y la CSP de `cotizador.html`/`verificar.html` (C-12): se hacen cuando la app lea de Supabase (pieza 6). Plan B por redirección (`signInWithOAuth`): necesita el secreto de Google en Supabase, que solo carga Elías |
| Probar el inicio de sesión en iPhone con la aplicación instalada | bloqueado por Elías | `DECISIONES-SUPABASE.md`, Q-08 |
| Cargar los secretos reales | bloqueado por Elías | `PLAN-SUPABASE.md` §4.12; lista de nombres en `supabase/README.md` |

**Puerta de salida:** pruebas de RLS en verde para los tres roles; ninguna fila real todavía. **Cumplida**: PGlite 780/780 y el proyecto real 27/27, sin una sola fila real.

## Fase 2 — Importar

| Pieza | Estado | Evidencia |
|---|---|---|
| Script de importación (hoja y teléfonos), con reporte de conflictos y de cuadre | hecho y verificado con hojas de mentiras | [`scripts/importar-hoja.mjs`](../scripts/importar-hoja.mjs) y [`scripts/importador/`](../scripts/importador/LEEME.md). No se conecta a la base: escribe `ensayo.sql`, `importar.sql` (idempotente) y `cuadre.sql` fuera del repositorio, y se niega a escribir dentro. No decide: reporta (Q-14). Pruebas IM-01 a IM-12 en `supabase/tests/sync-e-importacion/importador.mjs` (22 verificaciones en PGlite, siete de ellas por lo que encontró la revisión del código). **En el proyecto real `al3d-pruebas`** (2026-10-12) se corrió el ensayo (antes y después de las correcciones de la revisión) con 54 ventas inventadas, tres teléfonos y tres sellos: terminó sin errores con los mismos números que en PGlite y no dejó ninguna fila. **No probado en el proyecto real:** la carga confirmada, la segunda corrida y el cuadre (dejarían filas inventadas que la base no deja borrar) |
| Volcado de la hoja con `getValues()` | hecho, **sin correr** en una hoja real | [`puente/volcado-para-importar.gs`](../puente/volcado-para-importar.gs): se pega en la COPIA de la hoja, nunca en la original; no escribe nada en la hoja |
| **Importación a producción** | **hecho el 2026-10-16** | 219 ventas y 186 abonos en `al3d-produccion`; el cuadre contra la hoja dio **0 diferencias** (cifras de la sesión de importación de ese día; esta rama no las volvió a medir) |
| Las autorizaciones (sellos) de la hoja | **30 pendientes**; entran solas con la copia diaria en cuanto se peguen los archivos del 2026-10-17 | La hoja comprueba cada firma con su clave y manda solo el veredicto; la clave no sale de ahí («Séptima entrega», abajo) |
| «Solicitudes de autorización» y «Bitácora del puente» | no se importan (se cuentan en el reporte). **La bitácora del puente se queda en la hoja** (2026-10-16) | Son peticiones en curso e historia |
| Copia completa de la hoja y exportación de cada teléfono, antes de tocar nada | bloqueado por Elías | `PLAN-SUPABASE.md` §6 y §10 |
| Aviso de privacidad actualizado antes de empezar | hecho el 2026-10-16 (texto); falta avisar al equipo | [`BORRADOR-PRIVACIDAD-SUPABASE.md`](BORRADOR-PRIVACIDAD-SUPABASE.md) |

**Puerta de salida:** reporte de cuadre —número de ventas, suma de saldos, comisiones pendientes, cotizaciones autorizadas— que coincida con la hoja y con los teléfonos.

## Fase 3 — Doble escritura

| Pieza | Estado | Evidencia |
|---|---|---|
| Ruta `espejo` en el Apps Script y función de Supabase que la llama | hecho y verificado con dobles, **apagado** | [`puente/ESPEJO.md`](../puente/ESPEJO.md); `pruebas/supabase-espejo.mjs` (592 comprobaciones; 113 roturas a propósito, todas detectadas). Con el modo espejo apagado las 13 pruebas existentes que leen el `.gs` dan lo mismo antes y después |
| Parche de seguridad del `/expandir` (la lista blanca aceptaba `https://maps.google.com:x@evil.example/` y conectaba a evil.example) | hecho y verificado | `puente/hoja-apps-script.gs` (`expandirLiga_`) y su prueba. Corre en producción desde la versión 17 del Apps Script (2026-10-12) |
| Pegar y publicar el código nuevo en Apps Script | hecho el 2026-10-12, **espejo apagado** | Versión 18 de la implementación de siempre (misma URL), `puente-sheets-14` de `main` (`09a7842`), 366,228 caracteres, comprobado tras recargar el editor. Se corrió «3 · Preparar la hoja»: Ventas tiene AG «Notas», AH «Plazo taller» y AI «Sellos» oculta. Mientras no se carguen `ESPEJO_SECRETO` y `MODO_ESPEJO` (no existían antes de esta versión), `/espejo` no hace nada |
| La plataforma escribe en la base a través de la bandeja | pendiente | — |
| Cuadre diario automático | **en marcha desde el 2026-10-17** (primera corrida: 219 ventas, 0 diferencias): la **copia diaria** hoja → nube (función `importar-diario`, `0018`, `puente/copia-diaria.gs`), decidida por Elías el 2026-10-16 porque el equipo sigue capturando en la hoja | «Sexta entrega», abajo |

**Puerta de salida:** siete días seguidos de cuadre. Si no cuadra, se regresa a la fase 2.

## Fase 4 — Cambio de lectura

| Pieza | Estado | Evidencia |
|---|---|---|
| La plataforma lee de la base; Realtime sustituye el sondeo de 30 s | pendiente | — |
| Pantallas de Pagos (cobro, abono, reparto, corrección). **No entran en esta rama**: la base ya las soporta, falta la interfaz | pendiente | `DECISIONES-SUPABASE.md`, Q-01 y §C |
| La hoja pasa a solo lectura y se avisa al equipo | bloqueado por Elías | Solo cuando existan las pantallas de Pagos y el cuadre de siete días |
| Respaldo semanal de la base a Drive | hecho con dobles y PGlite (2026-10-17): lo pide la hoja a `importar-diario` y lo guarda en «AL3D Respaldos»; **falta pegarlo** | `DECISIONES-SUPABASE.md`, Q-20; «Séptima entrega», abajo |
| Aviso que mantiene despierto el proyecto | pendiente | `DECISIONES-SUPABASE.md`, Q-20 |

**Puerta de salida:** los tres roles lo usan una semana sin incidentes. Vuelta atrás: leer otra vez de la hoja.

## Fase 5 — Retiro

| Pieza | Estado | Evidencia |
|---|---|---|
| Quitar `/empujar`, `/jalar`, los tokens de dispositivo y lo que ya no se use | pendiente | — |
| Decidir cómo se autentican `/carpetas` y `/crear_carpeta` sin tokens ni «Accesos» | pendiente | `DECISIONES-SUPABASE.md`, Q-12 |

**Puerta de salida:** el Apps Script queda con dos rutas, `espejo` y `carpetas`. (El plan también deja `/crear_carpeta` en Apps Script en su §3.2: hay que aclararlo en esta fase.)

## Fase 6 — Clientes (después)

| Pieza | Estado | Evidencia |
|---|---|---|
| Rol `cliente` con RLS que solo deja ver su proyecto, y una vista sin dinero ni notas internas | pendiente | `PLAN-SUPABASE.md` §5 |

**Puerta de salida:** el plan no define una. Por completar al decidir su arranque.

---

## Lo que solo Elías puede hacer

| Qué | Cuándo hace falta | De dónde sale |
|---|---|---|
| ~~Revisar y confirmar, o cambiar, las decisiones Q-01 a Q-20~~ | **hecho el 2026-10-16** | `DECISIONES-SUPABASE.md` |
| **Aplicar `supabase/migrations/0017_decisiones_elias.sql`** en `al3d-pruebas` y en `al3d-produccion` (Editor SQL, completa; termina con la auditoría), y después la prueba de humo: **58** casos en verde sin `storage.sql` (57 de antes más C58, que dice que Storage no aplica) | Antes de encender Supabase en cualquier aparato | «Tercera entrega», abajo |
| ~~Aplicar `supabase/opcional/storage.sql` en `al3d-pruebas` y en `al3d-produccion`, y la prueba de humo: 69 casos~~ | **hecho el 2026-10-16** (humo 69 de 69 en los dos) | «Cuarta entrega», abajo |
| **Volver a aplicar `supabase/opcional/storage.sql`** (la versión de Q-02 bis) en `al3d-pruebas` y en `al3d-produccion` (Editor SQL, completo; es idempotente y reemplaza las cuatro políticas), y la prueba de humo: **74** casos en verde (**79** con `0018` aplicada: D01–D05 son de la copia diaria; sin ella, D01 sale en rojo y dice que falta). Con la versión anterior todavía aplicada, la prueba nueva da 73 de 74 (C70 en rojo: Fabricación no ve la obra ganada) | Antes de encender la lectura en vivo en un teléfono de Fabricación | «Quinta entrega», abajo, y `supabase/README.md`, «Las imágenes de las cotizaciones (Storage)» |
| **Pegar el Apps Script nuevo** (`puente/hoja-apps-script.gs`) e implementar una versión nueva: Pagos mueve la etapa en la hoja, «No se dio» solo Dirección, IA a 50 al día en hora de México | Ya: hasta entonces la hoja le rechaza a Pagos los cambios de etapa | `puente/DESPLIEGUE.md` |
| ~~Poner en marcha la copia diaria~~ | **hecho el 2026-10-17** (primera corrida: 219 ventas, 0 diferencias) | `supabase/README.md`, «La copia diaria» |
| **Pegar lo del 2026-10-17** (las autorizaciones y el respaldo, sin mover secretos): 1) en el panel, `importar-diario` → *Code* → pegar entero el `supabase/functions/importar-diario/desplegar/index.ts` nuevo → *Deploy*; 2) en la hoja, el archivo «Copia diaria» → pegar entero `puente/copia-diaria.gs` nuevo → guardar; 3) ejecutar **una vez** `instalarRespaldoSemanal` (si Google pide permiso de Drive, aceptarlo). Nada de secretos ni propiedades nuevas | Ya | `supabase/README.md`, «La copia diaria» y «El respaldo semanal»; «Séptima entrega», abajo |
| ~~Dar la clave del sello por un canal seguro para las 30 autorizaciones pendientes~~ | **ya no hace falta para importarlas** (2026-10-17: la hoja las comprueba). Sí hará falta en Supabase el día que `/verificar` de Supabase reemplace al de la hoja | Fase 2 |
| ~~Corregir en la hoja la Liquidación de V-208~~ | **hecho el 2026-10-24** (Elías: pagó $12,064 el 13 de octubre) | «Cotizaciones del aparato 5D93», al final |
| ~~**Publicar los gastos y el talón** (2026-10-24)~~ **hecho el 2026-10-24** (PR #159), en este orden: 1) `supabase/migrations/0020_gastos.sql` y después `0021_talon_de_la_hoja.sql` en el Editor SQL de `al3d-produccion`; 2) volver a pegar `supabase/functions/importar-diario/desplegar/index.ts` en la función `importar-diario` (*Deploy*); 3) volver a pegar `puente/copia-diaria.gs` en el archivo «Copia diaria» de la hoja. Sin secretos nuevos. Lo puede hacer Claude desde el Chrome de Elías; el clic de *Deploy* lo da Elías | Al fusionar el PR de los gastos | «Gastos», al final; `supabase/README.md`, «Los gastos (2026-10-24)» |
| Confirmar el día en que la hoja pasa a solo lectura (después de 7 días seguidos de cuadre) | Fase 3 → 4 | `DECISIONES-SUPABASE.md`, Q-01 |
| Confirmar la lista de áreas: ¿cotizador, taller, cobranza, almacén y comisiones, o falta alguna? | Fase 1 | `PLAN-SUPABASE.md` §9 |
| Decidir si WhatsApp Business entra en la plataforma o queda fuera | Al cerrar el alcance | `PLAN-SUPABASE.md` §4.9 y §9 |
| Revisar el borrador de privacidad, decidir lo marcado **[POR DECIDIR]** (plazos, baja, región) y avisar al equipo antes de publicarlo | Antes de la fase 2 | [`BORRADOR-PRIVACIDAD-SUPABASE.md`](BORRADOR-PRIVACIDAD-SUPABASE.md) |
| ~~Decidir la región y el proyecto de **producción** de Supabase~~ (**hecho el 2026-10-16**: `al3d-produccion`, us-west-1) | Antes de la fase 2 | El de pruebas está en West US (North California); el de producción no existe |
| Hacer la copia completa de la hoja (archivo nuevo en Drive, con fecha) y pedir a cada persona que exporte su teléfono | Antes de la fase 2 | `PLAN-SUPABASE.md` §6 y §10 |
| Aprobar el gestor de contraseñas y la copia fuera de línea del sello; decidir si él carga los secretos en el panel de Supabase (lo que recomienda el plan) o desde la sesión local | Fase 1 | `PLAN-SUPABASE.md` §4.12 |
| Crear y cargar los secretos reales: sello de autorización (no se rota), llaves de IA, secreto del espejo, contraseña de la base, secreto de Google | Fases 1 a 3 | `PLAN-SUPABASE.md` §4.12; `DECISIONES-SUPABASE.md` §C |
| Dar una o dos filas reales de «Autorizaciones» y la clave del sello, **por un canal que no sea el chat ni el repositorio**, para comprobar cómo se firmaron los PDF que ya están en la calle | Antes de apagar `/verificar` de Apps Script | Ver «No verificado» |
| Probar el inicio de sesión con Google en el iPhone con la aplicación instalada | Fase 1 | `DECISIONES-SUPABASE.md`, Q-08 |
| Probar un QR impreso real en las dos direcciones (`github.io` y `pages.dev`) | Antes de retirar `/verificar` de Apps Script | `DECISIONES-SUPABASE.md`, Q-11 |
| Confirmar que el plan gratuito alcanza para el tamaño actual (las imágenes y los respaldos son lo más probable que lo rebase). Estimado de las imágenes: de 0.5 a 3 MB por cotización con imágenes, unas 300 a 2 000 en 1 GB; la cifra real la da Ajustes («por subir») y una consulta en `supabase/README.md` | Antes de encender la sombra | `PLAN-SUPABASE.md` §9, punto 7; «Cuarta entrega», abajo |
| Subir el tope de filas (`FIN`) y cargar `ESPEJO_SECRETO` y `MODO_ESPEJO` (el código con la ruta `espejo` ya está publicado desde el 2026-10-12) | Fase 3 | `DECISIONES-SUPABASE.md`, Q-10 |
| Avisar al equipo de que la hoja deja de ser editable y pasarla a solo lectura | Fase 4 | `PLAN-SUPABASE.md` §9, punto 3 |

---

## Verificado vs. no verificado

### Verificado

| Qué | Cómo y cuándo | Evidencia |
|---|---|---|
| Plan y decisiones escritos | 2026-10-10 | [`PLAN-SUPABASE.md`](PLAN-SUPABASE.md), [`DECISIONES-SUPABASE.md`](DECISIONES-SUPABASE.md) |
| Proyecto de pruebas creado | 2026-10-10 | `al3d-pruebas`, organización «AL3D Free», West US (North California), ref `hhwjlxukuzxearrjurtc` |
| **Límites del plan gratuito de Supabase:** 500 MB de base de datos, 1 GB de archivos, 5 GB de egress (datos que salen), 500 000 invocaciones de funciones al mes, 200 conexiones de Realtime (la actualización en vivo), **pausa tras una semana sin actividad** y **sin respaldos automáticos** | En la página de precios, `supabase.com/pricing`, el 2026-10-10 | — |
| **La firma HMAC de dos argumentos de Apps Script** (`Utilities.computeHmacSha256Signature(valor, clave)`) codifica el valor **y la clave** en ASCII, sustituyendo por «?» cada carácter que no es ASCII. **No es UTF-8** | Ejecutada el 2026-10-10 en Apps Script de verdad (un proyecto de prueba, con claves de prueba): doce firmas | `pruebas/datos/hmac-apps-script-real.json`. El bloque 5 de `pruebas/supabase-sello.mjs` exige que el módulo del sello las reproduzca byte a byte, y los sellos nuevos se firman con esa misma codificación |
| **Las 60 pruebas de node del repositorio pasan** (las 55 que ya había más las 5 nuevas) | `sh pruebas/correr.sh`: Windows 11, Node 24.17, 4 min 26 s, salida 0, el 2026-10-10 | `pruebas/*.mjs` |
| **Las 12 migraciones corren en Supabase de verdad** y su auditoría pasa | Aplicadas una por una en el Editor SQL de `al3d-pruebas` el 2026-10-10. La auditoría `0011` **abortó la primera vez** por una función que Supabase mismo instala (`rls_auto_enable`, de tipo `event_trigger`, que no se puede invocar como RPC); se corrigió la auditoría, con prueba, y pasó | `supabase/migrations/0011_auditoria.sql`, `supabase/tests/auditoria/auditoria.mjs` |
| **Prueba de humo en el proyecto real: 27 de 27** | 2026-10-10, en el Editor SQL de `al3d-pruebas`; siempre se deshace sola | `supabase/opcional/prueba-de-humo.sql` |
| Acceso anónimo cerrado, comprobado desde internet con la llave pública | 2026-10-10: `proyectos` y `ventas_dinero` dan 401 («permission denied»), insertar también, `mi_acceso` también, y el esquema `interno` no está expuesto (`PGRST106`) | — |
| Los 6 puntos que el plan 4.6 mandaba verificar del plan gratuito | 2026-10-10 en supabase.com/pricing (ver arriba) | — |
| `/rest/v1/` a secas **ya no sirve** para mantener despierto el proyecto (pide llave secreta: 401); sí contestan con la llave pública `/auth/v1/health` y una consulta a una tabla | 2026-10-10 contra `al3d-pruebas`; el flujo de GitHub se probó en sus 4 escenarios (sin variable, dirección ajena, proyecto real, proyecto inexistente → rojo) | `.github/workflows/mantener-activo.yml` |

### No verificado

| Qué | Por qué falta | Quién lo cierra |
|---|---|---|
| **Que los sellos de producción se firmaron con esa codificación.** Lo comprobado es el comportamiento de la función de Apps Script, no las filas de «Autorizaciones» que ya están en la calle | Hace falta una fila real y su clave | Elías (ver arriba). Mientras tanto el módulo de verificación acepta las dos codificaciones y dice con cuál coincidió |
| La firma con la **clave real**, que es más larga que 64 bytes (son tres identificadores pegados: `puente/hoja-apps-script.gs`, línea 3661) | Las pruebas usan claves de prueba cortas; hay una opción para la clave y las filas reales (`AL3D_SELLO_CLAVE_REAL`, `AL3D_SELLO_FILAS_REALES`) que no se ha usado | Elías, con la clave por un canal seguro |
| Las funciones del servidor **desplegadas en Supabase**: corrieron en Deno 2.9.6 con dobles y con `supabase-js` real contra un Supabase de mentiras, pero no en el runtime real (150 s por petición, 2 s de CPU, tamaño máximo del cuerpo —no está documentado—, que Auth y PostgREST acepten las llaves `sb_*` en `apikey`) | Necesitan tus secretos y `supabase functions deploy` | Elías (secretos) y la entrega siguiente |
| **Realtime, Storage y la concurrencia entre conexiones** (dos personas cobrando a la vez, dos `siguiente('V')` a la vez) | PGlite tiene una sola conexión y no trae esos servicios; la prueba de humo corre una sola sesión. Se argumentan por construcción (candados de fila, índices únicos, `ON CONFLICT`). Las políticas de Storage sí se prueban, contra un sustituto de `storage` en PGlite y en el bloque 11 de la prueba de humo; el servicio (subida, «ya existe», URL firmada) no | La entrega siguiente, con dos clientes contra `al3d-pruebas` (EX-07 a EX-10 de `supabase/DISENO.md` §10.17); Storage, encendiendo la sombra en un aparato de Dirección contra `al3d-pruebas` |
| Cómo reacciona **PostgREST real** a lo que las funciones esperan: `max_rows` de 1000, filtros `or=(…)` del cursor y la cabecera `x-al3d-contrato` | Solo se probó el SQL, no la capa HTTP | La entrega siguiente (cliente) |
| Que el **Editor SQL corre cada archivo como una sola transacción** | Lo vimos funcionar (11 archivos, ningún estado a medias) pero no se pudo forzar un error a medio archivo para comprobar el retroceso | — |
| Las **45 pruebas de navegador** | No corren en Windows: usan rutas de Linux para el navegador (por ejemplo `pruebas/navegador/publicas.mjs`, líneas 38 y 46). No hay integración continua | Quien monte un entorno de Linux, o adapte las rutas |
| Lo que hace Google Sheets en los **empates de redondeo** de `ROUND` | Solo se midió el redondeo de JavaScript. La prueba que cuenta es comparar contra los valores reales de la hoja, por folio | Una exportación de la hoja real, para la prueba de cuadre |
| Que la **copia de la hoja** conserve las propiedades del script (sello, llaves de IA, tokens) y sus disparadores | No hay documentación que lo afirme; hay que probarlo con una copia desechable antes de llamar «respaldo» a esa copia | Elías o quien haga la copia |
| Qué datos del perfil de Google guardará el servicio de entrada de Supabase | Se decide al construir el inicio de sesión | Fase 1 |

### Lo que el plan decía y el código desmintió

El plan se aprobó tal como está y no se reescribe: estas notas lo corrigen.

- **§4.10, «es lo que hoy hace `pruebas/precio-servidor.mjs`».** Esa prueba compara el **precio de la cotización** (catálogo, huella, total y renglones del sello) entre el cotizador y el Apps Script. **No** evalúa las fórmulas de la hoja (Precio Neto, Pago Pendiente, Comisiones, Comisión Restante): ninguna prueba las evalúa hoy. El cuadre al centavo es una prueba **nueva**.
- **§4.6, un aviso semanal contra la pausa.** La pausa llega a la semana, y uno semanal no deja margen: `DECISIONES-SUPABASE.md` (Q-20) lo cambia a cada 2 días.
- **§4.9, «los eventos guardan `gcal_event_id` en `instalaciones`».** El campo existe y siempre es `null` (`js/datos/agenda.js`, línea 292; `js/mod/fabricacion.js`, línea 1529).
- **§3.1, `blobs` hacia almacenamiento de archivos.** Nadie escribe en el almacén `blobs`: las imágenes reales viven en otra base (`al3d_cot_imgs`) y dentro del historial del cotizador.
- **§3.1, «`bitacora`: se conserva el historial completo».** Cada teléfono tiene la suya y nada la manda a otro lado (no está en `ALMACENES` de `js/datos/puente.js`, línea 202).
- **§4.4, «se conserva el reintento».** No hay reintento con espera creciente: `esperaMs` no tiene llamadores y `Retry-After` no se lee. El reintento son los disparadores que vuelven a correr el bombeo (explicado en la cabecera de `js/datos/sync.js`).
- **§4.8, «la app borra IndexedDB y localStorage con datos de la empresa».** Hoy no existe: `acceso_revocado` no aparece en `js/`, y el botón de borrar todo de Ajustes no cubre lo guardado del cotizador. `DECISIONES-SUPABASE.md` (Q-09) lo diseña con tres candados.
- **§1 y §10, «Pagos tiene las mismas acciones en la plataforma».** `js/datos/puente.js` (líneas 284-285) dice que la liquidación, los abonos y la fecha de liquidación los captura quien cobra **en la hoja** y que la plataforma no los guarda. Por eso `DECISIONES-SUPABASE.md` (Q-01) construye las acciones en la base y deja las pantallas para después.
- **`ARQUITECTURA.md`, «las fórmulas nunca se calculan aquí».** Ya no era literal para los estimados de reserva que calcula la pantalla (ver la nota en su punto 4 de §11).

---

## Revisión adversarial del SQL (2026-10-10)

Un revisor que **no escribió** las migraciones intentó romperlas en el arnés: unos 100 ataques y 96 mutaciones diseñadas (60 corridas contra la batería completa). Informe completo en el PR #100.

**Limpio** (sin hallazgos): **ninguna fuga de dinero hacia Fabricación** (22 importes únicos metidos por todos los caminos de escritura, ninguno apareció en 78 fuentes que Fabricación puede leer: tablas, vistas, funciones, errores, catálogo, Realtime); ninguna escalada por membresía (escritura directa, `miembro_*`, correo sin verificar, anónimo, claims forjados, alias de Gmail, baja en caliente); privilegios, `search_path` y vistas `security_invoker` limpios; aislamiento de lectura entre empresas; libros y autorizaciones inmutables (ni `service_role` puede editarlos); idempotencia por `op_id`; inyección SQL en `almacen_aplicar`.

**Corregido en `0012_endurecimiento.sql`, con pruebas que fallan sin ella:**

| Hallazgo | Qué pasaba | Arreglo |
|---|---|---|
| **A-1 (alta)** | `NaN`, `Infinity` y valores enormes pasaban la guarda `monto <= 0` (en `numeric`, NaN no es `<= 0`): Pagos liquidaba **todas** las comisiones pendientes con `repartir_abono_fifo('NaN')` sin un depósito, en un libro solo-agregar | Las tres funciones de cobro y reparto exigen `0 < monto < 1e9`; las tablas lo exigen también |
| M-5 | Un `subtotal` de `9e131071` rompía la vista de fórmulas y el cuadre para todos | Cota en `ventas_dinero` |
| M-2 | Un requerimiento con cantidad `NaN` o `>= 1e7` rompía las salidas de material y el corte de etapa de todos | Cota en `requerimientos` |
| M-1 | `emitir_salidas_derivadas(p_hoy)` confiaba en la fecha del cliente: Pagos con `2099-12-31` consumía material de forma irreversible | El día lo decide el servidor (el del cliente solo cuenta si difiere a lo más 1 día) |
| M-3 | Textos sin tope: filas de 8 MB que sincronizan todos los teléfonos; 62 MB permanentes en un reparto | Topes de longitud |
| M-6 | El planificador estima con estadísticas de filas que la RLS oculta (canal lateral por `EXPLAIN`/`count=planned`) | Sin estadísticas en las columnas de texto y fecha de las tablas de dinero |
| Configuración | Con «Confirm email» apagado, una cuenta de correo y contraseña reclamaba la invitación de Dirección | `correo_verificado()` exige proveedor Google; `config.toml` sin registros por correo ni anónimos; **proveedor de correo apagado en `al3d-pruebas`** (verificado: solo `google` activo) |
| Mutantes M52, M53, M54 | Ninguna prueba llamaba una función con el id de un proyecto de **otra empresa**: quitar el filtro por empresa habría dejado a una Dirección ajena cobrar o editar | Prueba de cruce entre empresas por función |

**Abierto, a propósito** (no bloquea porque todo está apagado, **bloquea encender** lo que se indica):

| Hallazgo | Riesgo | Antes de encender |
|---|---|---|
| ~~`subida_unica` acepta `usuario`, `rol`, `ts` y `id` del cliente en la bitácora: Fabricación puede forjar un «Cobro de $999,999» atribuido a Pagos y ocupar el `op_id` de un evento real~~ | — | **Cerrado en `0013`** (2026-10-16) |
| La holgura de **+10 min** de los sellos deja que un rol bajo anule a Dirección (decisión Q-06, igual que el `.gs`) | aceptado | **Aceptado por Elías el 2026-10-16**: gana el más reciente con 10 min para todos, como el `.gs`. `0013` lo había cerrado de forma provisional; `0014` lo regresa |
| ~~`almacen_movimientos.ts` sin tope: un conteo con `ts` enorme congela la existencia de un material~~ | — | **Cerrado en `0013`** (2026-10-16) |
| ~~Pagos puede **crear** un requerimiento con campos que solo debería marcar (`estado`)~~ | — | **Cerrado en `0013`** (2026-10-16) |
| ~~Los precios editables (23-oct-2026): la hoja cobra con su pestaña «Tarifas» y `precio.js` seguía con el catálogo de fábrica~~ | — | **Cerrado en `0019`** (2026-10-23): ver «Precios editables», al final. Falta que el **teléfono** los lea de Supabase cuando se encienda la lectura (pieza 6): hoy los pide a la hoja |
| Ids y contadores globales entre empresas (oráculo de existencia, `folio_cot:*` sin tope), invitación cruzada | baja hoy (solo existe `al3d`) | Antes de dar de alta una segunda empresa |
| `origen_obra`: la lista blanca es de primer nivel y `contiene_dinero` es una lista de nombres | baja hoy (`renders` y `propuesta` son listas de imágenes) | Cuando el cliente mande `origen` |
| ~~Cotizaciones por `subida_unica` nacen `autorizada` sin sello; `authenticated` puede crear tablas temporales~~ | — | **Cerrado en `0013`** (2026-10-16) |
| La hoja espejo tiene todo el dinero **fuera de RLS** (R-05 del diseño) | depende de con quién se comparta el archivo de Drive | Antes de encender el espejo: que Fabricación no tenga acceso a ese archivo |

## Segunda entrega (2026-10-16)

Tres ramas, cada una con su PR; todo **apagado**. Con los interruptores apagados la app no hace ni una petición nueva (hay prueba que lo demuestra).

| Pieza | Rama | Estado | Evidencia |
|---|---|---|---|
| `0013_huecos_revision.sql`: cierra los seis hallazgos «Abierto, a propósito» de severidad media (bitácora forjada en `subida_unica`, cotizaciones sin sello, holgura de sellos —esta la deshizo `0014`—, `ts` del almacén, Pagos creando requerimientos, tablas temporales) | `claude/supabase-huecos-autorizar` | **hecho y verificado en PGlite y en el proyecto real** | `supabase/tests/rls-y-dinero/huecos-revision.mjs` (12 de 15 casos fallan sin la migración). **Aplicada en `al3d-pruebas` el 2026-10-16; prueba de humo 36 de 36** (incluido C30: `authenticated` ya no crea tablas temporales) |
| Función `autorizar` (precio del servidor + sello con la codificación real de Apps Script) | igual | hecho y verificado con dobles; **no desplegada** | `pruebas/supabase-autorizar.mjs`: 4000 cotizaciones y 3000 cuerpos comparados byte a byte contra el `.gs` real. Sin `SELLO_AUTORIZACION` contesta 503 (no inventa clave) |
| Función `respaldo` a Drive con cuenta de servicio y flujo semanal apagado | igual | hecho con dobles; **no desplegada**. Desde el 2026-10-17 es la **alternativa apagada**: el respaldo lo hace la hoja («Séptima entrega») | `pruebas/supabase-respaldo.mjs`; `.github/workflows/respaldo-semanal.yml`. Para cuando la base pase de 45 MB: la carpeta debe estar en una unidad compartida |
| Escritura en sombra desde la bandeja, idempotente por `op_id`, cola propia `al3d_sombra` | `claude/supabase-sombra-y-vivo` | hecho con dobles, apagado | `pruebas/supabase-sombra.mjs` (apagado: solo sale la URL de la hoja) |
| Lectura desde Supabase con Realtime (segundo interruptor, solo Dirección; exige la sombra encendida) | igual | hecho con dobles, apagado | `pruebas/supabase-vivo.mjs`. No hizo falta migración |
| Cuadre hoja contra `ventas_calculadas` (Ajustes y flujo diario apagado) | igual | hecho con dobles, apagado | `pruebas/supabase-cuadre.mjs` |
| Pantallas de Pagos: cobro, anticipo, abono, reparto FIFO y correcciones, en Control → «Registrar (Supabase)» | `claude/supabase-pantallas-pagos` | hecho con dobles, apagado | `pruebas/pagos-supa.mjs` (119 de 119) |
| **Decisiones de Elías (2026-10-16):** `0014_sellos_mas_reciente.sql` (Q-06: gana el más reciente, 10 min para todos; quita `proyectos.sellos_area`) y `0015_folio_de_la_hoja.sql` (Q-07: `ganar_proyecto` usa el V-### de la hoja; el contador V nunca por debajo del máximo); la sombra manda ese folio y el cuadre empareja por V-### | `claude/supabase-decisiones` | **hecho y verificado en PGlite**; **no aplicado** en `al3d-pruebas` | `huecos-revision.mjs` (H-3 nuevo), `folio-de-la-hoja.mjs` (13; 9 fallan sin `0015`), `pruebas/supabase-sombra.mjs` (83), `pruebas/supabase-cuadre.mjs` (33); prueba de humo en PGlite 39 de 39 (sin `0014`/`0015`: 6 fallos). Suites: ver «Cifras de las decisiones» abajo |
| **Plazos de conservación (Elías, 2026-10-16):** `0016_plazos.sql` — cotizaciones no ganadas a los 8 meses (con sus solicitudes y su lápida; lo ganado o con sello nunca), bitácora a 1 año, lo borrado en la app a los 30 días; libros de dinero y autorizaciones nunca. Purgas en `interno` (solo el dueño), `sin_borrar` con una excepción acotada fila por fila, pg_cron diario a las 09:15 UTC si existe. Función `respaldo`: se quedan los 8 respaldos más recientes en Drive (`RESPALDO_CONSERVAR`), lo demás que ella creó va a la papelera, solo después de una subida buena | `claude/supabase-plazos` | **hecho y verificado en PGlite y con dobles**; **no aplicado** en `al3d-pruebas`; pg_cron sin probar (no existe en PGlite) | `supabase/tests/plazos/plazos.mjs` (22; 18 fallan sin `0016`), prueba de humo C40–C48 (en PGlite 48 de 48; sin `0016`, el bloque C40–C44 y C46 fallan), `pruebas/supabase-respaldo.mjs` (64; truena sin la rotación). Qué cuenta como «no ganada»: `DECISIONES-SUPABASE.md`, «Plazos de conservación» |

Decisiones de cada pieza: [`supabase/NOTAS-SEGUNDA-ENTREGA-SERVIDOR.md`](supabase/NOTAS-SEGUNDA-ENTREGA-SERVIDOR.md), [`supabase/NOTAS-SEGUNDA-ENTREGA-CLIENTE.md`](supabase/NOTAS-SEGUNDA-ENTREGA-CLIENTE.md) y [`supabase/NOTAS-SEGUNDA-ENTREGA-PAGOS.md`](supabase/NOTAS-SEGUNDA-ENTREGA-PAGOS.md). **Elías decidió el 2026-10-16** (ver [`DECISIONES-SUPABASE.md`](DECISIONES-SUPABASE.md)): los sellos se quedan como en el `.gs` (gana el más reciente, 10 min de holgura para todos: `0014`); una venta nueva lleva en Supabase el mismo V-### que la hoja (`0015`); encender Supabase desde Ajustes sigue siendo solo de Dirección y las correcciones de Pagos siguen siendo solo abonos y liquidación (**confirmado**, sin cambios). Lo que sigue abierto en esas notas (respaldo por cuenta de servicio o Apps Script, la llave secreta del cuadre en GitHub, D-3 de Pagos) no se tocó.

**Cifras de las decisiones (rama `claude/supabase-decisiones`, Windows 11):** `sh supabase/tests/correr.sh`: **36 archivos, 831 verificaciones, 0 fallos** (288 s). `sh pruebas/correr.sh`: **68 archivos, todos en verde** (las 45 de navegador no corren en Windows). Prueba de humo en PGlite: 39 casos, 0 fallos. Una prueba vieja se ajustó a propósito: SY-12 (`sync.mjs`) esperaba el contador V en 5 con una fila V-950 en la base; con `0015` es 950.

**Cifras de los plazos (rama `claude/supabase-plazos`, Windows 11):** `sh supabase/tests/correr.sh`: **37 archivos, 853 verificaciones, 0 fallos** (~300 s). `sh pruebas/correr.sh`: **68 archivos, todos en verde** (las 45 de navegador no corren en Windows). Prueba de humo en PGlite: 48 casos, 0 fallos. Una prueba vieja se ajustó a propósito: `auditoria/orden-y-referencias.mjs` prohibía `pg_cron` en toda migración; ahora lo permite solo en `0016`, dentro de su bloque que avisa y sigue.

**Para aplicar los plazos:** `supabase/migrations/0016_plazos.sql` (Editor SQL, completa; idempotente; termina con la auditoría). Debe salir el NOTICE «programado al3d-plazos con pg_cron»; si sale «pg_cron no está disponible», habilitar la extensión en *Database → Extensions* y volver a correrla. Luego la prueba de humo: verde con **48** casos (C47 confirma el trabajo programado). Cómo revisarlo y apagarlo: `supabase/migrations/README.md`, «Los plazos en el proyecto real».

**Para aplicar en `al3d-pruebas`:** `supabase/migrations/0014_sellos_mas_reciente.sql` y después `supabase/migrations/0015_folio_de_la_hoja.sql` (Editor SQL, cada una completa; las dos idempotentes y con la auditoría al final; `0014` borra la columna `proyectos.sellos_area`, así que Supabase avisará de una operación destructiva). Luego `supabase/opcional/prueba-de-humo.sql`: verde con **39** casos.

**No verificado en esta entrega:** nada del cliente ni de las funciones corrió contra el Supabase real (PostgREST, Realtime con RLS por evento, despliegue de funciones, Drive real, clave real del sello); `deno check` (no hay Deno en esta máquina); las pruebas de navegador (no corren en Windows); el iPhone.

## Tercera entrega (2026-10-16): producción y las decisiones de Elías

Rama `claude/supabase-produccion-y-decisiones`. Supabase sigue **apagado** en cada aparato y la hoja sigue mandando.

| Pieza | Estado | Evidencia |
|---|---|---|
| Proyecto de producción `al3d-produccion` (ref `gwzfdprdrdudfakjsdxf`, us-west-1) con `0001`–`0016`, Google y los datos importados (219 ventas, 186 abonos, cuadre 0 diferencias; 30 autorizaciones esperaban la clave del sello: desde el 2026-10-17 entran con la copia diaria, comprobadas en la hoja; la bitácora del puente se queda en la hoja) | hecho (sesión de Elías) | Fase 1 y Fase 2, arriba |
| La app apunta a producción (configuración, CSP `https`+`wss`, letreros sin «pruebas»; `sw.js` 120). El de pruebas, solo como constante `EN_USO` en `js/datos/supabase-config.js`, sin botón | hecho, **apagado** | `pruebas/supabase-entrada.mjs`, `pruebas/pagos-supa.mjs`, `pruebas/csp.mjs` |
| **Q-05**: los tres roles mueven cualquier etapa; solo Dirección cancela («No se dio») o saca de ahí; «instalación hecha ⇒ instalado» también desde Fabricación | **base**: `0017` (hecho y verificado en PGlite, **sin aplicar**); **app**: hecho, **en efecto hoy**; **hoja**: hecho, **falta pegarlo** | `supabase/tests/obra-y-etapas/etapas.mjs` (7 fallan sin `0017`), `acceso/matriz.mjs` (RL-20), `obra-y-etapas/acceso-con-obra.mjs` (AC-10); `pruebas/proyectos.mjs`, `pruebas/puente.mjs` (11 ·), `pruebas/puente-hoja.mjs`; `pruebas/navegador/pf-proyectos.mjs` (no corre en Windows) |
| **Q-19**: IA a 50 consultas al día por persona, en hora de México | **base**: `0017` (`ia_cuota` nunca deja más de 50); **función `ia`**: hecho (no desplegada); **hoja**: hecho, **falta pegarlo** | `supabase/tests/cupos/cupos.mjs` (5 fallan sin `0017`), `pruebas/supabase-ia.mjs`, `pruebas/supabase-funciones.mjs`, `pruebas/notario.mjs` |
| Q-01, Q-02, Q-03, Q-09 y Q-13 confirmadas; las demás aceptadas por defecto | hecho | `DECISIONES-SUPABASE.md` (Q-02 y Q-03 verificadas contra la base) |

**Qué cambia HOY para la gente, con Supabase apagado** (en cuanto se publique esta rama): Pagos ve los pasos de la etapa en la ficha y puede
moverla (también arrastrando en el tablero); Fabricación pasa de «Listo» a «Instalado» y «En garantía», y al marcar una instalación «hecha» el
proyecto queda en «Instalado»; nadie más que Dirección cancela ni saca un proyecto de «No se dio» (antes Fabricación sí podía sacarlo en la app).
Mientras no se pegue el Apps Script nuevo, **la hoja le rechaza a Pagos el cambio de etapa** (la bandeja lo dice: «este teléfono no puede
escribir… Etapa de obra») y la IA sigue en 200 por día GMT; lo de Fabricación ya entra en la hoja de hoy, que no le ponía tope. Los letreros de
Ajustes y de «Registrar en Supabase» ya no dicen «pruebas».

**Cifras (Windows 11):** `sh supabase/tests/correr.sh`: **37 archivos, 857 verificaciones, 0 fallos** (378 s). `sh pruebas/correr.sh`: **68 archivos, todos en verde** (las 45 de navegador no corren en Windows). Prueba de humo en PGlite: **57 casos, 0 fallos** (sin `0017`: 4 fallan, C49, C51, C55 y C56). La auditoría de `0011` sigue limpia (la corre `0017` al final y C57 de la prueba de humo). Pruebas viejas que se ajustaron a propósito porque decían la regla anterior: ET-02…ET-05, ET-17 y el permiso por área de `etapas.mjs`, RL-20, AC-10 (ahora distingue a Fabricación de Pagos por la agenda), CU-01…CU-05, C08 y C12 de la prueba de humo («no cancela» en vez de «no mueve»), «pagos no mueve la obra» de `puente-hoja.mjs`, los 200 de `supabase-ia.mjs`, `supabase-funciones.mjs` y `notario.mjs`, y dos de `pf-proyectos.mjs` de navegador.

**Para aplicar:** `supabase/migrations/0017_decisiones_elias.sql` en el Editor SQL, completa, primero en `al3d-pruebas` y después en `al3d-produccion` (idempotente; no cambia ninguna firma ni privilegio; termina con la auditoría, que debe pasar). Después `supabase/opcional/prueba-de-humo.sql`: verde con **57** casos.

**No verificado en esta entrega:** `0017` contra el Supabase real (lo aplica Elías); el Apps Script nuevo en la hoja real; la app hablando con producción con el interruptor encendido (PostgREST, Realtime y la entrada con Google contra `al3d-produccion`); las pruebas de navegador (no corren en Windows); `deno check`.

## Cuarta entrega (2026-10-16): las imágenes de las cotizaciones a Storage, y la prueba de humo con datos

Rama `claude/supabase-imagenes`. Elías decidió ese día que las imágenes de las cotizaciones suben a la nube (el aviso de privacidad ya lo dice). Todo **apagado**: sin la sombra encendida en un aparato no sube nada, sin la lectura en vivo no baja nada, y con los interruptores apagados la app no hace ni una petición nueva (hay prueba).

| Pieza | Estado | Evidencia |
|---|---|---|
| `supabase/opcional/storage.sql` reescrito. Bucket privado `cotizacion-imagenes` (2 MB, jpeg/png/webp). **Leer** = quien ve esa cotización según la RLS de `cotizaciones` (Q-02: Dirección todas, Pagos las suyas, Fabricación ninguna; la política pregunta por la cotización con los permisos de quien lee, no repite la regla) y Dirección todo lo de su empresa; **subir** = el autor (Pagos, con la cotización ya en la base) o Dirección, con la ruta `<empresa>/<folio_global>/<id>.jpg`; **cambiar y borrar** = solo Dirección. Antes cualquier miembro activo, Fabricación incluida, leía y subía | hecho y verificado en PGlite (contra un sustituto de `storage`); **aplicado** en `al3d-pruebas` y `al3d-produccion` el 2026-10-16 (humo 69 de 69). La quinta entrega le agrega la rama de Q-02 bis | `supabase/tests/notario/imagenes-storage.mjs` (22; 11 fallan con el `storage.sql` anterior). La comprobación final ahora también se detiene con una política permisiva ajena para `authenticated` o una que no mira `bucket_id` |
| Por qué sigue en `opcional/` y no es una `0018` | decidido | PGlite no trae Storage: una `0018` tendría que saltarse en silencio y el arnés diría verde sin probar nada. Y no crea funciones: una nueva en `interno` haría tronar la auditoría de `0011` (GR-08, lista cerrada) en cada migración que venga |
| La purga de `0016` y las imágenes: **no se borran desde SQL; se quedan, documentadas** | decidido | Borrar la fila de `storage.objects` no borra el archivo (queda huérfano ocupando espacio) y la purga corre en pg_cron sin red ni llave. En cuanto la cotización se purga, Pagos deja de ver sus imágenes; Dirección las ve y las borra desde el panel. El teléfono solo sube las del historial (autorizadas), que la purga nunca toca. Consulta para revisarlas: `supabase/README.md` |
| Prueba de humo: cuenta solo sus filas (en producción C09 dio 220 por contar todas las ventas; C03 pasaba por la razón equivocada). Los casos de «cero filas» siguen contando todo, a propósito. Bloque 11 nuevo, de Storage (C58–C69) | hecho y verificado en PGlite | `supabase/tests/humo/prueba-de-humo.mjs` la corre entera: base vacía 58 casos, con datos que no son de humo 58, con datos y Storage 69, sin `storage.sql` 58; 0 fallos en las cuatro y la base queda fila por fila igual. La versión anterior falla con datos (C09 = 6). Con una política de más, C60, C64, C66 y C69 salen en rojo |
| Subir: `js/datos/supa-imagenes.js`, con la sombra. Del historial (cotizaciones autorizadas), cada imagen que esté en el teléfono, **una vez por id** (una duplicada comparte imágenes: van en la carpeta de la más vieja), `upsert: false`, idempotente (lo subido se anota en `al3d_sombra`, almacén nuevo `imagenes`; «ya existe» cuenta como subida), 8 por vuelta, red o sesión paran la vuelta y se sigue en la siguiente, lo definitivo se aparta, tope de 750 MB por aparato. Pagos solo a sus cotizaciones que ya están en la base (pregunta antes cuáles); Fabricación nada | hecho con dobles, **apagado** | `pruebas/supabase-imagenes.mjs` (80) |
| Bajar: con la lectura en vivo, el enchufe pone la ventanilla `AL3D_NUBE` (solo Dirección y Pagos); el cotizador le pide lo que no tiene en el teléfono, la plataforma lo trae con una URL firmada de 60 s y el cotizador lo guarda en `al3d_cot_imgs` | hecho con dobles, **apagado** | igual: el cotizador de verdad (`js/cotizador/imagenes.js`) corre en un contexto aparte; sin la ventanilla no hace ni una petición, y la CSP del cotizador sigue sin Supabase |
| Ajustes (Dirección): imágenes subidas desde el aparato, por subir y cuánto pesan, apartadas; «Mandar a la base ahora» y «Reintentar las rechazadas» también las cubren | hecho, apagado | `js/mod/ajustes.js` |
| `sw.js` 121 (el módulo nuevo entra al conjunto versionado) | hecho | `pruebas/publicacion.mjs` |

**Cuánto ocuparía (estimado, no medido: los teléfonos no se pueden leer desde aquí).** Cada imagen ya va a 1800 px en JPEG: de 150 a 700 KB. Una cotización con imágenes lleva de 3 a 7 y las de una duplicada no se vuelven a subir: de 0.5 a 3 MB por cotización, o sea **de 300 a 2 000 cotizaciones con imágenes por cada GB** (el plan gratuito da 1 GB para todo el proyecto). Las imágenes existen en el cotizador desde el 2026-10-06, así que hoy son pocas. La cifra real: Ajustes en cada teléfono («por subir», en MB) antes de encender, y en la nube la consulta de `supabase/README.md`.

**Lo que no sube:** los borradores; las entradas del historial sin aparato (`disp`, de antes de que se guardara; Ajustes las cuenta); y la imagen de referencia con la que se cotizó con IA (`aiFile`: no tiene id, vive dentro del historial y puede ser un PDF, que el bucket no acepta). Subirla sería otra pieza.

**~~Para decidir (hallazgo)~~ Decidido por Elías el 2026-10-16 (Q-02 bis):** el `origen_obra` de un proyecto ganado, que ven los tres roles, trae los ids del plano, los renders y la propuesta (están en la lista blanca de la obra, `0003`). Con la regla de Q-02, Fabricación veía esos ids pero no podía bajar las imágenes. Elías decidió abrírselas para las obras ganadas: ver «Quinta entrega», abajo.

**Mientras la app no suba las cotizaciones a la base** (la subida única, todavía pendiente), solo los teléfonos de **Dirección** suben imágenes; las de Pagos esperan solas a que su cotización esté en la base.

**Cifras (Windows 11):** `sh supabase/tests/correr.sh`: **38 archivos, 869 verificaciones, 0 fallos** (448 s; uno nuevo, `humo/prueba-de-humo.mjs`, y `notario/imagenes-storage.mjs` pasa de 15 a 22). `sh pruebas/correr.sh`: **69 archivos, todos en verde** (5 min 10 s; uno nuevo, `supabase-imagenes.mjs`, 80; las 45 de navegador no corren en Windows). Prueba de humo en PGlite: 58 casos sin Storage y 69 con el sustituto, 0 fallos, vacía y con datos. Pruebas viejas que se ajustaron a propósito: `notario/imagenes-storage.mjs` (decía la regla anterior: leer y subir cualquier miembro), C03 y C09 de la prueba de humo, y las cifras que vigila `pruebas/publicacion.mjs` (125 archivos versionados, 52 módulos ES, 69 pruebas de node).

**Para aplicar** (primero `al3d-pruebas`, después `al3d-produccion`; después de `0017`): `supabase/opcional/storage.sql` en el Editor SQL, completo (idempotente; no crea funciones; termina con su propia comprobación), y después `supabase/opcional/prueba-de-humo.sql`: verde con **69** casos (hecho en los dos proyectos el 2026-10-16: 69 de 69). Sin `storage.sql`, la prueba de humo da **58** (C58 dice que Storage no aplica). Desde la quinta entrega son **74** (abajo).

**No verificado en esta entrega:** el servicio de Storage de verdad (que la subida con sesión pase por estas políticas igual que la inserción simulada, la forma del error «ya existe» y de «no encontrado», la URL firmada y su descarga desde la app publicada con su CSP); que `authenticated` pueda insertar en `storage.objects` desde el Editor SQL (lo da por hecho el bloque 11; si no, C58 sale en rojo con el motivo); que el «borrar con SQL» de C67 lo rechace Storage o lo deje (la prueba acepta las dos); el estimado de tamaño contra los teléfonos reales; las pruebas de navegador (no corren en Windows).

## Quinta entrega (2026-10-16): Fabricación ve las imágenes de las obras ganadas (Q-02 bis)

Rama `claude/supabase-imagenes-taller`. **Decidido por Elías el 2026-10-16:** Fabricación SÍ puede ver (leer y bajar) el plano, los renders y la propuesta de las cotizaciones de obras GANADAS, para fabricarlas; las imágenes no llevan precios. Las de una cotización no ganada siguen ocultas, la cotización (con precios) sigue cerrada, y Fabricación sigue sin subir, cambiar ni borrar. Todo **apagado** en la app: solo se ve con la lectura en vivo encendida.

| Pieza | Estado | Evidencia |
|---|---|---|
| `supabase/opcional/storage.sql`: la política `cotizacion_imagenes_leer` gana una rama para **Fabricación de esa empresa**: existe un proyecto con el folio global de la carpeta, con V-### (`folio_hoja`), `etapa` ≠ `cancelado` y sin `deleted_at`. Es el «proyecto con su folio que no es una lápida pura» de `interno.cotizacion_protegida` (`0016`) del lado estricto, y el folio con el que `ganar_proyecto` ata la venta. Pregunta por `proyectos` con los permisos de quien lee (no hay función nueva: la auditoría de `0011` sigue limpia). Pagos no gana nada; subir, cambiar y borrar no cambian | hecho y verificado en PGlite; **falta volver a aplicarlo** en los dos proyectos | `supabase/tests/notario/imagenes-storage.mjs` (26; 4 fallan con el `storage.sql` anterior): ve la ganada aunque su cotización no esté en la base; no ve la de una cotización no ganada (ni la que ella pidió), una venta cancelada, una lápida «No se dio» ni una obra borrada; deja de verla en cuanto la obra se cancela; la cotización sigue cerrada; no sube, cambia ni borra en la carpeta que sí ve; Pagos y la Fabricación invitada no ganan nada; multi solo en su empresa |
| Prueba de humo, bloque 11: **C70–C74** (Fabricación ve la ganada; no la cancelada ni «No se dio»; no ve NINGUNA imagen fuera de una obra ganada, contando todas; no sube, cambia ni borra; Pagos no la ve). C60 ahora cuenta solo las de la prueba (en producción Fabricación ya ve las de obras ganadas); C72 es el «cero haya lo que haya» | hecho y verificado en PGlite | `supabase/tests/humo/prueba-de-humo.mjs` (7): vacía 58, con datos 58, con datos y Storage **74** (con imágenes reales de obras ganadas y de no ganadas), sin `storage.sql` 58; con la política anterior solo C70 sale en rojo; con una política de más salen C60, C64, C66, C69, C71, C72 y C74 |
| La duplicada ganada: la imagen que comparten dos cotizaciones vive en la carpeta de la más vieja; si se gana la otra, el teléfono que la subió la **copia** (copia de Storage, sin volver a subirla) a la carpeta de la ganada, que es la única que Fabricación conoce. Se pregunta a `proyectos` qué folios están ganados (lo que no, no se repregunta en 10 min); la copia se anota como `copia:<ruta>`, «ya existe» cuenta como hecha, lo que la base rechaza se aparta, la red para la vuelta | hecho con dobles, **apagado** (va con la sombra) | `pruebas/supabase-imagenes.mjs` |
| Bajar las de la obra: `AL3D_NUBE.obra(folio_global)` (la ventanilla de la lectura en vivo, ahora también para Fabricación; `imagenes` sigue solo para Dirección y Pagos, `obra` para Dirección y Fabricación): lee la fila de `proyectos` (`origen_obra`, sin precios), confirma que está ganada y baja cada imagen de la carpeta de su folio con URL firmada de 60 s; en memoria, nada en el teléfono | hecho con dobles, **apagado** | `pruebas/supabase-imagenes.mjs` (125; antes 80): cancelada, «No se dio», borrada o sin obra no piden ninguna imagen; Pagos y sin área no piden nada; con la ventanilla de Fabricación el cotizador de verdad no pide nada |
| Dónde aparecen: en la **ficha del proyecto** (`js/mod/proyectos.js`), una caja «Imágenes de la cotización» junto a la carpeta de Drive, que sale solo si existe la ventanilla `obra`, la obra tiene folio de cotización y no está cancelada. Hoy la ficha no enseñaba ninguna imagen (tampoco la orden de trabajo) | hecho, **apagado** | la misma prueba corre el pintado de la ficha de verdad (solo data URL de imagen, un aviso por estado) y vigila que sin la ventanilla no salga ni pida nada; `sw.js` 122 |

**Cifras (Windows 11):** `sh supabase/tests/correr.sh`: **38 archivos, 875 verificaciones, 0 fallos** (331 s). `sh pruebas/correr.sh`: **69 archivos, todos en verde** (las 45 de navegador no corren en Windows). Pruebas viejas que se ajustaron a propósito: «Fabricación NO ve ninguna» de `imagenes-storage.mjs` (ahora ve la de la obra ganada y nada más), C60 de la prueba de humo, y en `supabase-imagenes.mjs` tres que contaban todas las llamadas (ahora la primera vuelta también pregunta qué carpetas están ganadas) y la que vigilaba el cuerpo de `ponerVentanilla`.

**Para aplicar** (primero `al3d-pruebas`, después `al3d-produccion`): volver a correr `supabase/opcional/storage.sql` completo en el Editor SQL (idempotente: reemplaza las cuatro políticas; no crea funciones; termina con su comprobación) y después `supabase/opcional/prueba-de-humo.sql`: verde con **74** casos. Sin `storage.sql`, 58.

**No verificado en esta entrega:** que el servicio de Storage aplique la rama nueva al firmar la URL igual que la lectura simulada; la copia de Storage de verdad (`copy`: que pida leer el origen e insertar el destino, y cómo dice «ya existe»); la caja de la ficha en un teléfono real con la lectura en vivo (las pruebas de navegador no corren en Windows); cuánto ocupan las copias (solo las imágenes que una duplicada ganada comparte con su original).

## Sexta entrega (2026-10-16): la copia diaria hoja → nube

El equipo sigue capturando en la hoja y no usa la plataforma, así que la escritura en sombra no mantiene la nube al día. Elías
decidió una **copia automática diaria hoja → Supabase**, con cuadre diario y racha de 7 días (`DECISIONES-SUPABASE.md`,
«Transición»). Cómo se pone en marcha, paso a paso: `supabase/README.md`, «La copia diaria».

| Pieza | Estado | Evidencia |
|---|---|---|
| `supabase/migrations/0018_cuadre_diario.sql`: la bitácora de cada corrida. Solo Dirección la lee; nadie la escribe desde la app; nadie la cambia ni la borra; la auditoría de `0011` sigue limpia | hecho y verificado en PGlite, **sin aplicar** | `supabase/tests/sync-e-importacion/importar-diario.mjs` (CD-01); `auditoria/auditoria.mjs` y `rls-y-dinero/rls.mjs` (18 tablas); la prueba de humo, bloque 12 (D01–D05) |
| Función `importar-diario`: secreto `IMPORTAR_SECRETO` en tiempo constante (sin él, 503 y nada), el MISMO importador de la fase 2 en UNA transacción sobre `SUPABASE_DB_URL` (postgres.js 3.4.5), el cuadre por folio y su renglón en `cuadre_diario`; con conflictos o filas que no entran no aplica nada; si truena, se deshace entera y el fallo se anota con su código | hecho y verificado con dobles y con PGlite, **sin desplegar** | `pruebas/supabase-importar-diario.mjs` (secciones 1–6); `supabase/tests/sync-e-importacion/importar-diario.mjs` (CD-02 a CD-06, el SQL de verdad) |
| **El archivo para pegar en el panel**: `supabase/functions/importar-diario/desplegar/index.ts` (150 KB, 24 fuentes, esbuild 0.24.2 fijado). Lo único de fuera: `npm:postgres@3.4.5`, `node:crypto` y `node:fs` | hecho; corre en node con un Deno y un postgres de mentiras | `pruebas/supabase-importar-diario.mjs` (sección 8: huellas de cada fuente y, con esbuild instalado, armado otra vez idéntico byte por byte) |
| `puente/copia-diaria.gs`: un archivo NUEVO junto a `Código.gs` (no lo cambia). Arma el volcado de `volcado-para-importar.gs` en memoria (sin Drive), con el candado del puente mientras lee; lo manda con `IMPORTAR_URL` e `IMPORTAR_SECRETO`; disparador diario de 3 a 4 de la mañana, hora de México; registro sin datos de clientes | hecho y verificado en vm, **falta pegarlo** | `pruebas/supabase-importar-diario.mjs` (sección 9: mismo volcado que `volcado-para-importar.gs`, ni Drive ni escrituras, ningún nombre que choque con `Código.gs`) |
| Ajustes → Supabase (Dirección, tarjeta encendida): «cuadró X de los últimos 7 días · racha · último día» leído de `cuadre_diario`; apagado, idéntico | hecho con dobles (APP_VERSION 122) | `pruebas/supabase-importar-diario.mjs` (sección 10) y `pruebas/supabase-sombra.mjs` |

**El CPU** (el límite de una función de Supabase es 2 s de CPU por petición). Con una hoja de mentiras de 220 ventas, 189 abonos
y 1 500 renglones de bitácora (269 KB de JSON; el SQL de la copia sale de 255 KB), en node 24 en Windows: **de 50 a 140 ms (según lo ocupada que esté la máquina) la
primera petición de un proceso nuevo** (más unos 30 ms de cargar los módulos) y **unos 15 ms ya caliente**. El trabajo pesado
(aplicar el SQL y cuadrar) lo hace Postgres, que no cuenta para ese límite. El reloj de CPU de Windows avanza de 15.6 ms en 15.6
ms, así que las cifras chicas son aproximadas; en Supabase puede ser dos o tres veces más lento y sigue lejos del límite.

**La venta viva que la hoja haría histórica (hallazgo de esta entrega, decidido el mismo día: opción a).** Una venta que la hoja
tenía en FABRICACION o REPARANDO sin folio de cotización entró como «viva»; cuando pasa a COBRANDO o LIQUIDADO, la regla del
importador (DISENO §3.0) la haría «histórica» y la base no deja cambiar `historica`. Antes, el importador la dejaba sin tocar y
la anotaba como conflicto todos los días, y la racha no podía llegar a 7. Ahora **sigue viva**: el SQL del importador
(`scripts/importador/sql.mjs`, el mismo para `importar-hoja.mjs` y para la función) le pone el estatus, el dinero y lo demás de la
hoja, deja la etapa de la base si la hoja no trae una y la fecha de instalación de histórica vacía. La regla de la base **no se
aflojó**: una histórica que la hoja vuelve viva (COBRANDO → REPARANDO) sigue siendo conflicto. Hecho y verificado en PGlite:
CD-05 (la venta pasa a COBRANDO y después a LIQUIDADO: sigue viva, sin conflicto, y cuadra) y la de «sigue viva» de
`importador.mjs`. `DECISIONES-SUPABASE.md`, «Transición».

**Cifras (Windows 11):** `sh supabase/tests/correr.sh`: **39 archivos, 883 verificaciones, 0 fallos** (344 s, ya con `main` fusionado y la opción a). `sh pruebas/correr.sh`: **70 archivos, todos en verde** (`supabase-importar-diario.mjs`: 91 comprobaciones; las 45 de navegador no corren en Windows). Prueba de humo en PGlite: **63** casos sin `storage.sql` y **79** con él,
0 fallos (D01–D05 son de `0018`).

**Para aplicar** (Elías, en este orden; detalle en `supabase/README.md`, «La copia diaria»): `0018` en el Editor SQL de
`al3d-produccion` (después de `0017`) y la prueba de humo; generar el secreto sin pasarlo por el chat; desplegar la función
pegando `desplegar/index.ts` y apagar «Verify JWT»; cargar `IMPORTAR_SECRETO` en los Secrets de la función; pegar
`puente/copia-diaria.gs` en la hoja real con sus dos propiedades; correr `copiarHojaASupabase` a mano y después
`instalarCopiaDiaria`.

**Puesta en marcha (2026-10-17, sesión de Elías):** `0018` aplicada, la función desplegada pegando `desplegar/index.ts`,
`copia-diaria.gs` pegado como «Copia diaria» con `IMPORTAR_URL` e `IMPORTAR_SECRETO`, y el disparador diario de 3 a 4. Primera
corrida: 219 ventas, 0 diferencias.

**No verificado en esta entrega:** la función en el runtime real de Supabase (no hay Deno ni CLI en esta máquina: el archivo
corrió en node con un Deno de mentiras); que `SUPABASE_DB_URL` acepte la conexión de postgres.js desde la función (es lo que
documenta Supabase; no lo probé); el tamaño máximo del cuerpo que acepta la plataforma (la función pone su tope en 15 MB; la hoja
real debe andar en unos cientos de KB); el tiempo que UrlFetchApp espera la respuesta; el Apps Script en la hoja real; que el
panel llame «Verify JWT» a ese interruptor; y cuánto tarda Postgres en aplicar la copia de verdad (en PGlite, 220 ventas de
mentiras con sus abonos: 0.7 s la primera vez sobre la base vacía y 0.4 s la segunda, con la copia, el cuadre y el renglón).

## Séptima entrega (2026-10-17): autorizaciones y respaldo sin que Elías mueva secretos

Rama `claude/supabase-sin-elias`. Dos cambios, decididos el 2026-10-17 para que Elías no tenga que mover secretos
(`DECISIONES-SUPABASE.md`: «Las autorizaciones en la copia diaria» y Q-20, «El respaldo semanal»). Ningún secreto ni propiedad
nueva: todo usa `IMPORTAR_URL` e `IMPORTAR_SECRETO`, que ya están puestos.

| Pieza | Estado | Evidencia |
|---|---|---|
| **Las autorizaciones, comprobadas dentro de la hoja.** `copia-diaria.gs` comprueba cada fila de «Autorizaciones» con la clave del script y las funciones de `Código.gs` que usa `/verificar` (`registroDeFila`, `firmar`, `secretoDelSello_(false)`, `codigoDe`, `normalizarCodigo`; se llaman desde el otro archivo porque comparten el ámbito global) y manda por fila solo `{ firma_ok, codificacion: 'ascii-?', canon }` o `{ firma_ok: false, motivo }`. Nunca la clave | hecho y verificado en vm con `Código.gs` REAL y una clave FALSA, **falta pegarlo** | `pruebas/supabase-importar-diario.mjs`, sección 9 bis: buenas (v1 ASCII, v2 con acentos, «·», «×» y «»; una superada) y alteradas (total, negocio, código, hora vuelta fecha); la clave no aparece en lo que se manda ni en el registro; sin clave en la hoja no se crea una |
| El importador cree el veredicto **solo** si se lo pide `importar-diario` (`aceptarVeredictosDeLaHoja`), y una fila entra solo si el texto firmado de la fila que va a la base es EXACTAMENTE el comprobado. Se guarda verbatim con `codificacion = 'ascii-?'`. Lo que no entra no frena la copia: va a `no_importado` con su fila y su motivo | hecho y verificado con dobles y PGlite | 9 bis (lo que entra se verifica después con `sello.js`, otra implementación; texto distinto, codificación inventada y veredicto repetido no entran; dos vigentes esperan en la hoja; el importador de línea de comandos no le cree); CD-07 (en la base: 3 de 4, `/verificar` de Supabase las recalcula; día 2 sin cambios; la revocación llega) |
| **El respaldo semanal, por `importar-diario`.** Con el mismo secreto y `{ formato: 'al3d-pedir-respaldo' }` contesta el archivo «al3d-respaldo-1» (idéntico al de la función `respaldo`), leído en una transacción de solo lectura (repeatable read), con nombre, `sha256`, bytes y filas en cabeceras; 413 arriba de 45 MB | hecho y verificado con dobles y PGlite, **falta pegarlo** | sección 11 (igual a `armarArchivo`; 401/503/400/413/502; al registro solo cuentas) y CD-08 (las 18 tablas con el SQL de verdad, cuentas iguales a `count(*)`, el texto firmado verbatim, y Postgres no deja escribir dentro: 25006) |
| **`respaldarSemanal` en `copia-diaria.gs`**: lo pide, comprueba bytes y huella, lo guarda en «AL3D Respaldos» (la unidad compartida por nombre con la API de Drive y el permiso de la hoja; si no, una carpeta con ese nombre; si no, la crea en Mi unidad) y deja los 8 más recientes que él creó. `instalarRespaldoSemanal`: domingos de 5 a 6, hora de México, y hace el primero | hecho y verificado en vm con un Drive de mentiras, **falta pegarlo** | sección 12 (rotación: 2 de los suyos a la papelera, el ajeno y el de otro nombre no; lo que llega cortado o con otra huella no se guarda; si Drive no deja buscar no crea carpetas; el contenido nunca al registro) |
| `desplegar/index.ts` vuelto a armar (159 KB, 25 fuentes: entra `importar-diario/respaldo.js`) | hecho | sección 8: huellas, armado idéntico con esbuild, y el respaldo pedido al archivo para pegar |
| La función `respaldo` (cuenta de servicio) y su flujo de GitHub | **alternativa apagada**, documentada | `supabase/README.md`, «El respaldo semanal» |

**Cifras (Windows 11, node 24.17):** `sh supabase/tests/correr.sh`: **39 archivos, 887 verificaciones, 0 fallos** (381 s;
`sync-e-importacion/importar-diario.mjs` pasa de 7 a 11 con CD-07 y CD-08). `sh pruebas/correr.sh`: **70 archivos, todos en verde**
(6 min 7 s; `supabase-importar-diario.mjs` pasa de 91 a 150 comprobaciones; las 45 de navegador no corren en Windows). CPU de la
función: la copia con 220 ventas, de 60 a 80 ms en frío y unos 15 ms ya caliente (igual que antes); el respaldo de unos 1.8 MB, por
debajo de lo que mide el reloj de CPU de Windows (15.6 ms): la función solo pega el texto que arma Postgres.

**Para aplicar** (Elías, una vez; detalle en `supabase/README.md`, «La copia diaria»): 1) panel → `importar-diario` → *Code* → pegar
entero el `desplegar/index.ts` nuevo → *Deploy*; 2) hoja → archivo «Copia diaria» → pegar entero `puente/copia-diaria.gs` nuevo →
guardar; 3) ejecutar **una vez** `instalarRespaldoSemanal` (programa los domingos y hace el primero; si Google pide permiso de Drive,
aceptarlo: `Código.gs` ya usa Drive, así que lo normal es que no pida nada). La copia diaria sigue con su disparador.

**No verificado en esta entrega:** el `.gs` en la hoja real con la clave real (las 30 filas reales se ven la primera madrugada: el
registro dice cuántas entraron y `cuadre_diario` qué filas no y por qué); que `DriveApp.getFolderById` abra una unidad compartida por
su id y cree archivos en ella (es lo documentado; se probó con un Drive de mentiras); que el token del script (`ScriptApp.getOAuthToken`)
deje listar unidades compartidas (`drives.list` pide el permiso `drive`, que la hoja ya tiene por `Código.gs`); que la plataforma de
Supabase entregue una respuesta de varios MB sin problema (hoy son KB); el tiempo que `UrlFetchApp` espera.

## Lo que quedaba para la segunda entrega (resuelto arriba, salvo los secretos y la prueba real)

No se hizo por una razón concreta, no por olvido: cada pieza necesita datos reales, secretos o una decisión tuya, o es código de cliente que no se puede validar sin los teléfonos.

| Pieza | Por qué falta | Qué la desbloquea |
|---|---|---|
| Función **`autorizar`** (firma el sello con la clave) y **`respaldo`** a Drive | `autorizar` repite el cálculo de precios del servidor con el catálogo; necesita la clave real (`SELLO_AUTORIZACION`) para su prueba de oro. `respaldo` necesita una credencial hacia Drive | Tus secretos y filas reales de «Autorizaciones» |
| **Cliente**: inicio de sesión con Google en la puerta, escritura en la sombra desde la bandeja, lectura con Realtime, CSP y service worker | Cambia código de producción y no se puede validar sin los teléfonos; con el interruptor apagado no debe cambiar nada y eso se demuestra con las pruebas de navegador, que no corren en Windows | Una sesión con un teléfono y la lista de cambios de contrato (`DISENO.md` §11.5) |
| **Pantallas de Pagos** (cobro, abono, reparto, corrección) | La base ya las soporta; falta la interfaz | `DECISIONES-SUPABASE.md`, Q-01 |

## Cierre de la primera entrega

- [x] `README.md` ya dice **60** pruebas de node (se movió con cada prueba nueva) y `pruebas/publicacion.mjs` pasa.
- [x] Corridas completas: `sh pruebas/correr.sh` (60 archivos, salida 0) y `sh supabase/tests/correr.sh` (33 archivos, 780 comprobaciones, 0 fallos).
- [x] Migraciones aplicadas, auditadas y probadas en el proyecto real de pruebas.
- [x] Revisión de seguridad adversarial del SQL por alguien que no lo escribió: hecha; lo crítico y barato está en `0012`, el resto está en la tabla «Abierto, a propósito».
- [x] La CI de Linux cazó una prueba vieja del espejo (comparaba el texto de un `REVOKE` que el endurecimiento cambió): corregida.
- [ ] Segunda opinión con otro modelo (prompt en `docs/REVISION-INDEPENDIENTE-SUPABASE.md`): pendiente, a cargo de Elías.
- [ ] Que Elías revise, confirme o cambie las decisiones (`DECISIONES-SUPABASE.md`) y apruebe el PR en GitHub.

## Precios editables (2026-10-23)

Elías pidió (nota de voz del 2026-10-23) que Dirección cambie los precios del cotizador y agregue u oculte materiales. Hoy la hoja
manda: la tabla vive en su pestaña «Tarifas» y la escribe el cotizador por `/guardar_tarifas` (PR #154). Para que la nube esté lista
el día que se encienda, decidió que también exista aquí («Deja la hoja como está y agrega también la tabla de tarifas en Supabase»):

| Pieza | Estado | Evidencia |
|---|---|---|
| `supabase/migrations/0019_tarifas.sql`: tabla `tarifas`, catálogo de fábrica, `tarifas_leer`, `tarifas_guardar` (solo Dirección, todo o nada, nunca borra, con bitácora), `tarifas_de` (servicio). Auditoría limpia con las tres en sus listas | **aplicada en `al3d-produccion` el 2026-10-23** (auditoría limpia; `tarifas_de` da los 16 renglones de fábrica; RLS encendida; `authenticated` no ejecuta `tarifas_de`) | `supabase/tests/tarifas/tarifas.mjs` (TA-01 a TA-04), `supabase/tests/auditoria/auditoria.mjs` |
| La función `autorizar` cobra con la tabla de su empresa (`tarifas_de` → `mapasDeTarifas`); sin la tabla, con la de fábrica (un precio que no conoce da «no cuadra», nunca un sello con otro importe) | hecho con dobles, apagada como siempre | `pruebas/supabase-autorizar.mjs`: 4000 cotizaciones al azar con una tabla cambiada, iguales a la hoja partida por partida |
| La copia diaria trae la pestaña «Tarifas» (`copia-diaria.gs` y `volcado-para-importar.gs` la mandan; `scripts/importador` la escribe; lo que no se entiende se avisa sin frenar la copia) | **publicada el 2026-10-23**: la función `importar-diario` redesplegada (Verify JWT sigue apagado; sin secreto contesta 401) y `Copia diaria.gs` pegado en la hoja | TA-04; `pruebas/supabase-importar-diario.mjs` |
| El teléfono lee los precios de Supabase | **pendiente** (pieza 6, con la lectura) | Hoy los pide a la hoja (`js/cotizador/tarifas.js`) |

**Para aplicar, en este orden** (si se invierte, la copia diaria intentaría escribir en una tabla que no existe y esa noche no se
aplicaría): 1) `0019` en el Editor SQL de `al3d-produccion`; 2) volver a pegar `supabase/functions/importar-diario/desplegar/index.ts`
en la función `importar-diario`; 3) pegar el `Código.gs` nuevo (PR #154) y el `copia-diaria.gs` nuevo en la hoja y publicar la versión.

**Puesta en marcha (2026-10-23, en ese orden, desde el Chrome de Elías):**
1. `0019` en el Editor SQL de `al3d-produccion`, tomada del commit `6aec86b` de `main` (con #155). Antes: `tarifas` no existía, `0018` sí,
   auditoría limpia. Después: auditoría limpia, 16 renglones de fábrica, 0 guardados.
2. La función `importar-diario` con el `desplegar/index.ts` de ese commit.
3. El Apps Script de la hoja (proyecto «Vistas - Finanzas AL3D», la hoja `1tTU_FX…`): el `Código.gs` vivo era EXACTAMENTE el del commit
   `287af19` (16-oct), sin cambios hechos solo en la hoja, y `Copia diaria.gs` el de `main`. Se pegaron los dos de `6aec86b` y se publicó
   la **versión 20** de la implementación de siempre (`AKfycbwY6qs…`, misma URL). Con eso entraron también los cuatro cambios de la
   auditoría técnica del 17-oct (#145) que estaban pendientes de aplicar a mano. Lo guardado quedó idéntico a `main` (huella sha256).

Falta: que Elías pruebe en la app, con su cuenta de Dirección, el engrane **Precios** (la app pide entrar con Google). La pestaña
«Tarifas» aparece en la hoja con el primer guardado.

## Gastos (2026-10-24)

Elías fijó el 2026-10-24 que **toda la información de la plataforma vive en Supabase** y en Google Drive **solo los archivos de
diseño** (ya paga 5 TB de Drive). Al revisar dónde vivía cada dato, los gastos de Control (puente-sheets-15, PR #157) eran lo único de
dinero que no llegaba a la nube: solo estaban en la pestaña «Gastos» de la hoja. Esta entrega les da su tabla y los mete en la copia
diaria, igual que las tarifas el 23. La hoja sigue mandando; la plataforma sigue capturando los gastos por el puente.

| Pieza | Estado | Evidencia |
|---|---|---|
| `supabase/migrations/0020_gastos.sql`: tabla `gastos` con el mismo id que en la hoja (`gas-…`, `hoja-…`) y las reglas de `gastoValidar_` del `.gs`. La leen Dirección y Pagos (Fabricación no, como `GASTOS_ROLES`); nadie la escribe desde la app todavía; nadie la borra (`sin_borrar`); un renglón que sale de la hoja queda con `deleted_at` y lo pierde si vuelve. Sin estadísticas en texto y fecha (M-6), fuera de Realtime, ninguna función: la auditoría de `0011` sigue limpia | **aplicada en `al3d-produccion` el 2026-10-24** (auditoría limpia; la tabla existe, 0 gastos: la hoja todavía no tiene la pestaña) | `supabase/tests/gastos/gastos.mjs` (GA-01 a GA-05); `auditoria/auditoria.mjs` (20 tablas) |
| La copia diaria trae la pestaña «Gastos» (`copia-diaria.gs` y `volcado-para-importar.gs` la mandan; `scripts/importador` la lee **como la lee el teléfono**: la categoría que no está en la lista es «Otros», un monto con «$» se lee, una fecha «23/10/2026» también). Lo que la base no acepta (sin ID, ID repetido, sin día, sin concepto, monto que no es mayor que cero) **no frena la copia**: va a `no_importado` con su fila y su motivo (`MOTIVOS_GASTO`), sin conceptos ni montos | **publicado el 2026-10-24**: `importar-diario` redesplegada (Verify JWT sigue apagado) y «Copia diaria» pegada (idéntica a `main`; la anterior era la de `main` sin cambios a mano) | GA-04 y GA-05; `pruebas/gastos.mjs` («La copia diaria lee los gastos como el teléfono»: las cuatro listas de categorías y cada lectura, celda por celda, contra `js/datos/gastos.js`) |
| Sin la pestaña en el volcado (un `copia-diaria.gs` de antes, o una hoja que todavía no la tiene) o sin su columna «ID», no se toca ningún gasto de la base | hecho y verificado en PGlite | GA-04 |
| El respaldo semanal guarda también `gastos` (20 tablas) | hecho y verificado con dobles y PGlite | `pruebas/supabase-respaldo.mjs`, `pruebas/supabase-importar-diario.mjs`, CD-08 |
| `desplegar/index.ts` vuelto a armar (174 KB, 25 fuentes) | hecho | `pruebas/supabase-importar-diario.mjs`, sección 8 |
| La plataforma lee y escribe los gastos en Supabase | **pendiente** (con la lectura y la escritura de lo demás, al encender Supabase en los teléfonos) | Hoy los manda y los baja de la hoja (`js/datos/gastos.js`) |

**Para aplicar, en este orden** (si se invierte, la copia de esa madrugada fallaría entera y se anotaría; no se pierde nada): 1) `0020`
en el Editor SQL de `al3d-produccion`; 2) volver a pegar `supabase/functions/importar-diario/desplegar/index.ts` en la función
`importar-diario`; 3) volver a pegar `puente/copia-diaria.gs` en «Copia diaria». `Código.gs` no cambia.

**No verificado en esta entrega:** `0020` y la copia contra el Supabase real (se aplica al fusionar); la pestaña «Gastos» de la hoja
real (el 2026-10-23 no se registró ningún gasto de prueba, porque un gasto no se borra: la primera copia con gastos reales se ve en
`cuadre_diario` la madrugada después del primero que se registre).

## Cotizaciones del aparato 5D93 y la copia detenida (2026-10-24)

Elías pidió subir las cotizaciones de su Chrome de escritorio («este dispositivo es el único que tiene cotizaciones»). Se hizo desde su
Chrome, con su sesión: Ajustes → Supabase → encendido en ese aparato, entrada con Google (`eliasgaribi@gmail.com`, Dirección activa) y
`subida_unica` con el historial del cotizador. Nada se borró ni se cambió en el aparato.

| Qué | Estado | Evidencia |
|---|---|---|
| Lo que había en el aparato: 55 cotizaciones en `al3d_historial` (COT-0003 a COT-0060; 29 con aparato 5D93 y 26 de antes de que se guardara, que entran como 5D93), 39 con la imagen de referencia de IA, 17 en la cola (ninguna pendiente), hitos de 2; ninguna imagen en `al3d_cot_imgs` | revisado | consulta en el Chrome de Elías (solo cuentas y folios) |
| **50 cotizaciones subidas** (`retirada`, sin sello del servidor, como dice 0013), 175 partidas, 52 kB; sin `aiFile.url` ni data URL (la base no guarda imágenes) | **hecho** | acuse: 50 creadas, 0 rechazadas; consulta en `al3d-produccion` |
| **5 no entraron**: COT-0056 a COT-0060@5D93, las autorizadas. La copia diaria ya tenía su TALÓN (de «Autorizaciones») y `subida_unica` no sobrescribe | **hecho el 2026-10-24**: `0021` aplicada y la subida otra vez: 5 talones llenados (siguen `autorizada` y ligadas), 50 «ya_estaba». En la base: 55 subidas, 0 talones de 5D93 | acuse; `supabase/tests/notario/talon.mjs` (NO-25) |
| La copia diaria volvía talón una cotización completa cada madrugada | arreglado en `scripts/importador/sql.mjs` (un talón no pisa lo que no es talón); va con la función | NO-25 |
| Las imágenes de referencia de IA (39) y el respaldo del aparato | **solo en el aparato**: el último respaldo es del 2026-09-10. Dónde guardarlas (Drive o Storage) lo decide Elías | Ajustes del aparato |
| **La copia diaria no se aplicó del 2026-10-20 al 24**: «Ventas», renglón 21 el 24 (20 antes): V-208, la Liquidación (J) era un espacio. El importador lo rechaza (texto donde va un importe) y, con una fila rechazada, no aplica nada (Q-14). La base se quedó con la hoja del 19 (el 24, 29 diferencias) | **hecho el 2026-10-24**: con el dato de Elías (pagó $12,064 el 13 de octubre) se puso J = 12,064 y N «Fecha liquidación» = 13/10/2026 (K quedó en $0), y `copiarHojaASupabase` a mano a las 12:50: **aplicada · CUADRA · 221 ventas · 0 diferencias · 0 conflictos · 35 autorizaciones**. Las 50 cotizaciones subidas siguieron intactas. La racha vuelve a empezar: 1 de 7 | `cuadre_diario` del 24 (segundo renglón); registro de ejecución de la hoja |
| Lo demás en `al3d-produccion`: `0017` y la versión de `storage.sql` con Q-02 bis ya aplicadas; 29 talones de cotización (5 de 5D93 y 24 de 954G); en `miembros`, Dirección activa (Elías), 3 de Fabricación y 1 de Pagos invitados | revisado | consulta del 2026-10-24 |

**Publicado el 2026-10-24, desde el Chrome de Elías, con `main` en `be84586` (PR #159):** `0020` (con el aviso genérico de «operaciones
destructivas» del panel, por los `REVOKE` y `DROP … IF EXISTS`) y `0021` en el Editor SQL de `al3d-produccion`, cada una tomada por SHA
y comprobada con su huella; la función `importar-diario` con el `desplegar/index.ts` de ese commit (Verify JWT sigue apagado); «Copia
diaria.gs» pegada y guardada (`Código.gs` ya era el de `main`). Después, la subida de las 5 autorizadas y `copiarHojaASupabase` a mano a
las 12:58: **aplicada · CUADRA · 221 ventas · 0 diferencias · 0 conflictos · 35 autorizaciones**, sin cambios en las cotizaciones (la copia
ya no las vuelve talón). La auditoría de la base: 0 problemas. La hoja todavía no tiene la pestaña «Gastos» (nace con el primer gasto o
con «3 · Preparar la hoja»): hasta entonces la copia no manda gastos.

## La lectura en vivo contra la base real, y lo que falta para el día del cambio (2026-10-24)

Primera prueba de la fase 4 contra `al3d-produccion`, **sin encender nada y sin escribir**: desde el Chrome de Elías (sesión de Supabase
como Dirección), en la consola, `crearFuente` de `js/datos/supa-vivo.js` y `suscribir`, comparando con el espejo `ventas_hoja` que ese
mismo Chrome bajó de la hoja.

| Qué | Resultado |
|---|---|
| Las filas de ventas desde la base (`proyectos` + `instalaciones` + `ventas_calculadas`, paginadas de 500) | **221 de 221**, en 0.9 s; PostgREST aceptó los filtros (`not … is null`, `is`, `neq`, `range`) |
| El almacén (materiales, listas de compra, libro) | 19 materiales y 9 requerimientos, en 0.9 s |
| Venta por venta contra la hoja, 28 campos | iguales en todo lo del negocio salvo dos, **arreglados el mismo día** (abajo): (1) **un importe vacío en la hoja llegaba como 0** desde la base (liquidación en 45 ventas, anticipo en 2): el importador guarda `''` como 0 y la base no distingue «sin capturar» de «cero», y para el teléfono no es lo mismo (`ventas.js`: con un 0 pisaría el anticipo pactado del proyecto); (2) **3 ventas en FABRICACION sin «Etapa de obra»** en la hoja salían `ganado` (la base no deja una viva sin etapa) |
| Realtime | el canal `al3d-vivo` se une en ~1 s; no se probó la llegada de un aviso (haría falta escribir) |

**Por qué la sombra NO se encendió:** con la sombra, una venta nueva ganada en ese aparato entraba a la base por `ganar_proyecto` con el id
del teléfono y como «de cotización»; la copia de la madrugada, que no lleva teléfonos, arma esa misma venta como `proy-hoja-V-###` y «de la
hoja», y el SQL del importador lo anotaba como conflicto: el día no cuadraba y la racha volvía a 0. Lo comprobó la prueba CS-02. Lo que decían
las notas de la transición («encender la sombra antes no estorba») no era cierto.

**Arreglado el mismo día** (este PR; `supabase/tests/sync-e-importacion/sombra-y-copia.mjs`, CS-01 a CS-03):

- **La sombra da de alta la venta con el id de la copia** (`proy-hoja-V-###`, cuando la hoja ya le dio su V-###) y recuerda el del teléfono
  para lo que siga (`js/datos/supa-sombra.js`); **la copia respeta que una venta nació en el cotizador** (`fuente = 'cotizacion'` en la base)
  aunque ella la vea como de la hoja (`scripts/importador/sql.mjs`). Las dos piezas hacen falta: CS-01 cuadra dos días seguidos, y también
  si la copia llegó antes que la sombra.
- **Lo vacío se lee vacío:** la copia anota qué importes tenía vacíos la hoja (`ventas_dinero.procedencia.vacias`: G, I, J) y qué venta viva
  no tenía etapa (`proyectos.procedencia.etapa_vacia`), y la lectura en vivo los regresa vacíos mientras sigan en 0 o en «ganado»
  (`js/datos/supa-vivo.js`). Un importe que después se capture en la base ya no es 0 y se enseña.
- Para que llegue: volver a pegar `importar-diario` (la copia de esa madrugada llena las marcas) y publicar la app (`sw.js` 141).

Con esto la pieza 1 de abajo queda hecha.

**Lo que falta para el día del cambio, en piezas:**

1. ~~Que la sombra y la copia no choquen~~ **hecho el 2026-10-24** (arriba). Deja encender la sombra en el Chrome de Elías sin romper la racha.
2. «La base manda»: un interruptor por aparato con el que la bandeja escribe en Supabase en vez de la hoja (el traductor de la sombra ya
   existe), más lo que hoy solo va a la hoja: los gastos (falta su RPC), los precios (`tarifas_guardar` ya existe, falta el cliente) y
   «Registrar venta» del cotizador. Grande.
3. Probar la entrada con Google en el iPhone (solo Elías).
4. Cada persona entra a Supabase en su teléfono (ya están invitados: 3 de Fabricación y 1 de Pagos) y Pagos captura cobros y abonos en
   la plataforma (las pantallas existen, apagadas).
5. Los QR de los PDF impresos: la clave del sello tendría que vivir también en Supabase para autorizar y verificar después del cambio, o
   `/verificar` y `/autorizar` se quedan en el Apps Script. Lo decide Elías.
6. Siete días seguidos cuadrando (van 1, desde el 2026-10-24) y el día del cambio.

## Décima entrega (2026-10-24): la pantalla del taller

Rama `claude/pantalla-taller`. Pedida por Elías ese día: una TV en la pared del taller con las obras por etapa, quién va tarde y las
próximas instalaciones, sin dinero; y, rotando, la orden de trabajo de cada obra en diseño, corte o armado. Cómo se publica:
`supabase/README.md`, «La pantalla del taller».

| Pieza | Estado | Evidencia |
|---|---|---|
| `0022_pantallas.sql`: la tabla `pantallas`, vincular con un código de 6 letras (Dirección lo aprueba), leer sin dinero y desconectar; la auditoría con las cuatro RPC en sus listas y `pantallas` como excepción de GR-09 (solo borra códigos vencidos) | hecho y verificado en PGlite | `supabase/tests/pantallas/pantallas.mjs` |
| Función `pantalla`: el secreto lo inventa la función y a la base solo llega su huella; los atrasos con `js/datos/taller.js` (idénticos al Tablero); la orden de trabajo con las reglas de la impresa; el plano con una liga firmada de una hora | hecho y verificado en node | `pruebas/supabase-pantalla.mjs` |
| `taller.html`: JavaScript viejo (TV de 2017), la hora de México sin horario de verano, rotación tablero 40 s / orden 15 s | hecho, probado en el navegador con datos de mentiras | `pruebas/taller-tv.mjs` |
| Ajustes → Supabase → «Pantallas del taller» (Dirección): vincular con el código y desconectar | hecho | `js/mod/ajustes.js`, `js/nucleo/supa.js` |
| La copia hoja → nube cada 3 horas (antes una vez al día), para que la pantalla no enseñe lo de ayer (Elías eligió cada 3 horas) | hecho y publicado el 2026-10-24: pegado en el Apps Script de la hoja; `instalarCopiaDiaria` dejó ocho disparadores (0, 3, 6, … 21 h) en lugar del de las 3 a. m. | `puente/copia-diaria.gs`, `pruebas/supabase-importar-diario.mjs` |
| Aplicar `0022` en `al3d-pruebas` y `al3d-produccion`, y desplegar la función `pantalla` desde el panel | hecho el 2026-10-24: `0022` en las dos bases (auditoría limpia); `pantalla` desplegada **solo en producción**, con Verify JWT apagado | `curl` a la función: `NO_ENCONTRADO` con un secreto inventado; 403 desde otro origen |
| El permiso de `service_role` para leer `pantallas` (lo usa el respaldo semanal; entró a `0022` después de aplicarla) | aplicado aparte en las dos bases el 2026-10-24; la auditoría de producción sigue limpia (`interno.auditoria()` devuelve `[]`). Ya se puede volver a pegar `importar-diario` | `supabase/tests/rls-y-dinero/rls.mjs` (RL-14) |
| Que la orden de trabajo salga para las obras de hoy | no sale: las obras en diseño, corte y armado vienen de la hoja (`fuente = 'hoja'`), sin `origen_obra` ni folio global, y las cotizaciones de la nube no están ligadas a la hoja. Sale para las obras que se ganen desde la app con su cotización en la nube | consulta en `al3d-produccion`, 2026-10-24 |
| Que el plano salga en la TV | depende de que las imágenes de la obra estén en Storage (suben con la sombra, que sigue apagada en los aparatos): sin ellas, la orden sale con «todavía no tiene su plano en la nube» | — |

## Undécima entrega (2026-10-24): el agente de ventas (sin publicar)

Rama `claude/agente-ventas`. Pedido por Elías ese día: que AL3D siga cotizando cuando él entre a trabajar en enero. Plan y
decisiones: `docs/AGENTE-VENTAS.md`. **Nada de esto está aplicado ni desplegado.**

| Pieza | Estado | Evidencia |
|---|---|---|
| La ficha de obra: qué se pregunta para cotizar, fabricar e instalar, qué decide Dirección y por qué, el precio con `precio.js` y las notas de la orden | hecho y verificado en node | `supabase/functions/_shared/ficha.js`, `pruebas/ficha-agente.mjs` |
| `0023_agente.sql`: conversaciones (con la huella del secreto del link), mensajes que no se editan ni se borran, la cola «Necesita tu decisión» (una pendiente por conversación), los topes (60 conversaciones nuevas por hora y empresa, 80 mensajes del cliente al día) y `agente_decidir` para Dirección; la auditoría con las cuatro RPC en sus listas | hecho y verificado en PGlite | `supabase/tests/agente/agente.mjs` |
| Función `agente`: dos llamadas a la IA por mensaje (sacar datos y redactar); los precios y la cuenta los escribe el código, y se quita cualquier dinero que escriba la IA; lo que Dirección ya decidió no se vuelve a preguntar | hecho y verificado en node con base e IA de mentiras | `supabase/functions/agente/handler.js`, `pruebas/agente-logica.mjs` |
| `0024_modo.sql` (2026-10-25, primer paso de «la base manda», `docs/BASE-MANDA.md`): `empresas.modo` ('hoja' o 'base', nace en 'hoja'), `modo_cambiar` solo Dirección y con bitácora, `mi_acceso` dice el modo; la copia de cada 3 horas no aplica nada en modo 'base' (solo cuadra) | hecho y verificado en PGlite; sin aplicar | `supabase/tests/acceso/modo.mjs` (MO-01 a MO-04), `pruebas/supabase-importar-diario.mjs` |
| Aplicar `0023` en `al3d-pruebas` y `al3d-produccion` | hecho el 2026-10-25, con el OK de Elías: la auditoría limpia en las dos (`interno.auditoria()` = `[]`), 3 tablas y 4 RPC; producción con sus 221 proyectos | consulta en el Editor SQL de cada proyecto |
| Desplegar la función `agente` (solo en producción, que es a la que habla `cotiza.html`), con Verify JWT apagado | hecho el 2026-10-25 desde el panel (`functions/agente/desplegar/index.ts`) | `curl`: `leer` con un secreto inventado → `NO_ENCONTRADO`; GET → 405; otro origen → 403; el de la app → CORS |
| Cargar `IA_KEYS` en los secretos de las funciones de producción (hoy las llaves solo viven en el Apps Script) | **pendiente de Elías** (es un secreto: lo pega él). Sin ella, `mensaje` contesta `CONFIGURACION` | página Secrets del panel: no aparece |
| Cargar `AGENTE_CUENTA` (banco, titular y CLABE) y volver a pegar `respaldo`, `importar-diario` y `pantalla` | pendiente | — |
| El portal del cliente (`cotiza.html`): la plática sin cuenta, el secreto solo en el cuerpo o después del «#», pinta con textContent | hecho; probado en el navegador con un agente de mentiras | `pruebas/cotiza.mjs` |
| «El agente de ventas te pregunta» en el Tablero de Dirección, con su panel (precio, nota, «No lo hacemos») | hecho; probado en el navegador con una nube de mentiras (no contra la base real) | `js/mod/tablero.js`, `js/nucleo/supa.js` |
