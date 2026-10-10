# Estado de la migración a Supabase

**Última actualización: 2026-10-10 (primera versión).** Es el avance real, fase por fase, de [`PLAN-SUPABASE.md`](PLAN-SUPABASE.md): el plan dice qué se va a hacer, [`DECISIONES-SUPABASE.md`](DECISIONES-SUPABASE.md) dice cómo, y aquí está qué ya existe, con qué evidencia y qué falta. Lo que dice **«por completar al cierre»** lo llena quien cierre la rama: otras piezas se están construyendo en paralelo y no se inventan cifras.

## En una frase

La migración está **en construcción y apagada**. La app, el puente y la hoja de Google siguen funcionando exactamente igual, **la hoja es la fuente de verdad hasta la fase 4**, y no hay ningún dato real en Supabase.

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
| 0 | Decisiones y documentación | **hecho**, salvo lo que confirma Elías | Documento de decisión aprobado; no se toca código de producción |
| 1 | Base y acceso | **pendiente** (en construcción) | Pruebas de RLS (las reglas de qué ve cada área) en verde para los tres roles; ninguna fila real todavía |
| 2 | Importar | **pendiente** | Reporte de cuadre que coincida con la hoja y con los teléfonos |
| 3 | Doble escritura | **pendiente** | Siete días seguidos de cuadre; si no cuadra, se regresa a la fase 2 |
| 4 | Cambio de lectura | **pendiente** | Los tres roles lo usan una semana sin incidentes; vuelta atrás: leer otra vez de la hoja, que sigue completa |
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
| Borrador de los cambios al aviso de privacidad | hecho (borrador); revisión de Elías pendiente | [`BORRADOR-PRIVACIDAD-SUPABASE.md`](BORRADOR-PRIVACIDAD-SUPABASE.md) |
| Confirmar la lista de áreas | bloqueado por Elías | `PLAN-SUPABASE.md` §9, punto 2 |
| Avisar al equipo de que la hoja dejará de ser editable | bloqueado por Elías | `PLAN-SUPABASE.md` §9, punto 3. La hoja **no** se declara de solo lectura antes de la fase 4 (`DECISIONES-SUPABASE.md`, Q-01) |

**Puerta de salida:** documento de decisión aprobado, sin tocar código de producción. Hoy: el plan está aprobado; las decisiones esperan la confirmación de Elías.

## Fase 1 — Base y acceso

| Pieza | Estado | Evidencia |
|---|---|---|
| Proyecto de pruebas en Supabase: `al3d-pruebas`, organización «AL3D Free», West US (North California), ref `hhwjlxukuzxearrjurtc`. Sin datos reales | hecho | Creado el 2026-10-10 desde la sesión local, con permiso de Elías (`PLAN-SUPABASE.md`, nota de implementación) |
| Límites del plan gratuito | hecho | Verificados el 2026-10-10 (ver «Verificado vs. no verificado») |
| Arnés de pruebas de base de datos en PGlite | hecho | [`supabase/tests/`](../supabase/tests/README.md): `arnes/`, `autoprueba.mjs`, `correr.sh` |
| Módulos puros de las funciones: sello de autorización, enlace corto de Maps, inteligencia artificial y verificación | hecho | `supabase/functions/_shared/{sello,maps,ia,verificar}.js` y sus pruebas `pruebas/supabase-{sello,maps,ia}.mjs`. Se probaron en node; en Deno no se han corrido. Corrida del 2026-10-10 al redactar esto: las tres pasan (504, 534 y 338 comprobaciones; se actualiza al cierre) |
| Migraciones: base común, acceso por área, proyectos y dinero, fórmulas de la hoja | pendiente (en construcción) | `supabase/migrations/0001_fundacion.sql`, `0002_acceso.sql`, `0003_proyectos.sql`, `0004_formulas.sql`. Resultado de sus pruebas: **por completar al cierre** |
| Pruebas de RLS y de las funciones SQL por rol | pendiente (en construcción) | `supabase/tests/{acceso,rls-y-dinero,formulas,obra-y-etapas}/`. Cuáles pasan en PGlite: **por completar al cierre** |
| Demás migraciones y funciones SQL (almacén, cotizaciones y solicitudes, bitácora, etc.) | pendiente | **por completar al cierre** |
| Inicio de sesión con Google (Supabase Auth) | pendiente | — |
| Probar el inicio de sesión en iPhone con la aplicación instalada | bloqueado por Elías | `DECISIONES-SUPABASE.md`, Q-08 |
| Cargar los secretos reales | bloqueado por Elías | `PLAN-SUPABASE.md` §4.12 |

**Puerta de salida:** pruebas de RLS en verde para los tres roles; ninguna fila real todavía. Hoy: **por completar al cierre**.

## Fase 2 — Importar

| Pieza | Estado | Evidencia |
|---|---|---|
| Script de importación de una sola vez (hoja y teléfonos), con reporte de conflictos y de cuadre | pendiente | `scripts/` todavía no existe. El script no decide: reporta (`DECISIONES-SUPABASE.md`, Q-14) |
| Copia completa de la hoja y exportación de cada teléfono, antes de tocar nada | bloqueado por Elías | `PLAN-SUPABASE.md` §6 y §10 |
| Aviso de privacidad actualizado antes de empezar | bloqueado por Elías | [`BORRADOR-PRIVACIDAD-SUPABASE.md`](BORRADOR-PRIVACIDAD-SUPABASE.md) |

**Puerta de salida:** reporte de cuadre —número de ventas, suma de saldos, comisiones pendientes, cotizaciones autorizadas— que coincida con la hoja y con los teléfonos.

## Fase 3 — Doble escritura

| Pieza | Estado | Evidencia |
|---|---|---|
| Ruta `espejo` en el Apps Script y función de Supabase que la llama | pendiente | Cuando exista se documenta en [`puente/README.md`](../puente/README.md) |
| Pegar y publicar el código nuevo en Apps Script | bloqueado por Elías | `DECISIONES-SUPABASE.md`, Q-10 |
| La plataforma escribe en la base a través de la bandeja | pendiente | — |
| Cuadre diario automático | pendiente | — |

**Puerta de salida:** siete días seguidos de cuadre. Si no cuadra, se regresa a la fase 2.

## Fase 4 — Cambio de lectura

| Pieza | Estado | Evidencia |
|---|---|---|
| La plataforma lee de la base; Realtime sustituye el sondeo de 30 s | pendiente | — |
| Pantallas de Pagos (cobro, abono, reparto, corrección). **No entran en esta rama**: la base ya las soporta, falta la interfaz | pendiente | `DECISIONES-SUPABASE.md`, Q-01 y §C |
| La hoja pasa a solo lectura y se avisa al equipo | bloqueado por Elías | Solo cuando existan las pantallas de Pagos y el cuadre de siete días |
| Respaldo semanal de la base a Drive, y aviso que mantiene despierto el proyecto | pendiente | `DECISIONES-SUPABASE.md`, Q-20 |

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
| Revisar y confirmar, o cambiar, las decisiones Q-01 a Q-20 | Al revisar el PR | `DECISIONES-SUPABASE.md` |
| Confirmar la lista de áreas: ¿cotizador, taller, cobranza, almacén y comisiones, o falta alguna? | Fase 1 | `PLAN-SUPABASE.md` §9 |
| Decidir si WhatsApp Business entra en la plataforma o queda fuera | Al cerrar el alcance | `PLAN-SUPABASE.md` §4.9 y §9 |
| Revisar el borrador de privacidad, decidir lo marcado **[POR DECIDIR]** (plazos, baja, región) y avisar al equipo antes de publicarlo | Antes de la fase 2 | [`BORRADOR-PRIVACIDAD-SUPABASE.md`](BORRADOR-PRIVACIDAD-SUPABASE.md) |
| Decidir la región y el proyecto de **producción** de Supabase | Antes de la fase 2 | El de pruebas está en West US (North California); el de producción no existe |
| Hacer la copia completa de la hoja (archivo nuevo en Drive, con fecha) y pedir a cada persona que exporte su teléfono | Antes de la fase 2 | `PLAN-SUPABASE.md` §6 y §10 |
| Aprobar el gestor de contraseñas y la copia fuera de línea del sello; decidir si él carga los secretos en el panel de Supabase (lo que recomienda el plan) o desde la sesión local | Fase 1 | `PLAN-SUPABASE.md` §4.12 |
| Crear y cargar los secretos reales: sello de autorización (no se rota), llaves de IA, secreto del espejo, contraseña de la base, secreto de Google | Fases 1 a 3 | `PLAN-SUPABASE.md` §4.12; `DECISIONES-SUPABASE.md` §C |
| Dar una o dos filas reales de «Autorizaciones» y la clave del sello, **por un canal que no sea el chat ni el repositorio**, para comprobar cómo se firmaron los PDF que ya están en la calle | Antes de apagar `/verificar` de Apps Script | Ver «No verificado» |
| Probar el inicio de sesión con Google en el iPhone con la aplicación instalada | Fase 1 | `DECISIONES-SUPABASE.md`, Q-08 |
| Probar un QR impreso real en las dos direcciones (`github.io` y `pages.dev`) | Antes de retirar `/verificar` de Apps Script | `DECISIONES-SUPABASE.md`, Q-11 |
| Confirmar que el plan gratuito alcanza para el tamaño actual (las imágenes y los respaldos son lo más probable que lo rebase) | Antes de la fase 2 | `PLAN-SUPABASE.md` §9, punto 7 |
| Pegar y publicar en Apps Script el código con la ruta `espejo`, y subir el tope de filas (`FIN`) | Fase 3 | `DECISIONES-SUPABASE.md`, Q-10 |
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
| Los módulos puros de las funciones pasan sus pruebas | Corrida del 2026-10-10 al redactar este documento: 504, 534 y 338 comprobaciones (se actualiza al cierre) | `pruebas/supabase-{maps,ia,sello}.mjs` |
| Las 55 pruebas de node que había al empezar pasaban | Revisión previa del 2026-10-10: Windows 11, Node 24.17, unos 4 minutos | `pruebas/*.mjs` |

### No verificado

| Qué | Por qué falta | Quién lo cierra |
|---|---|---|
| **Que los sellos de producción se firmaron con esa codificación.** Lo comprobado es el comportamiento de la función de Apps Script, no las filas de «Autorizaciones» que ya están en la calle | Hace falta una fila real y su clave | Elías (ver arriba). Mientras tanto el módulo de verificación acepta las dos codificaciones y dice con cuál coincidió |
| La firma con la **clave real**, que es más larga que 64 bytes (son tres identificadores pegados: `puente/hoja-apps-script.gs`, línea 3661) | Las pruebas usan claves de prueba cortas; hay una opción para la clave y las filas reales (`AL3D_SELLO_CLAVE_REAL`, `AL3D_SELLO_FILAS_REALES`) que no se ha usado | Elías, con la clave por un canal seguro |
| Los módulos de las funciones **en Deno**, que es donde correrán en Supabase | Solo se probaron en node | Al correr las funciones en el proyecto de pruebas |
| Las **migraciones contra el proyecto real de pruebas** (`al3d-pruebas`) | Hoy se prueban en PGlite, que es una imitación: no trae Realtime, almacenamiento, funciones, bóveda de secretos ni cron (límites en `supabase/tests/README.md`) | **Por completar al cierre** |
| Las **45 pruebas de navegador** | No corren en Windows: usan rutas de Linux para el navegador (por ejemplo `pruebas/navegador/publicas.mjs`, líneas 38 y 46). No hay integración continua | Quien monte un entorno de Linux, o adapte las rutas |
| Lo que hace Google Sheets en los **empates de redondeo** de `ROUND` | Solo se midió el redondeo de JavaScript. La prueba que cuenta es comparar contra los valores reales de la hoja, por folio | Una exportación de la hoja real, para la prueba de cuadre |
| Que el código de Apps Script que corre en producción sea el del repositorio | `puente/DESPLIEGUE.md` dice que «la copia que manda es la de la hoja»; las pruebas leen la del repositorio | Elías, bajando el código de la hoja |
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

## Antes de abrir el PR (por completar al cierre)

- [ ] `README.md`, línea 379, dice **55** pruebas de node y hoy son **58** (se sumaron las tres `pruebas/supabase-*.mjs`): `pruebas/publicacion.mjs` falla por eso (comprobado el 2026-10-10). El número se corrige donde lo diga, no la prueba; y se vuelve a revisar al cierre, porque cada prueba nueva lo mueve.
- [ ] Correr otra vez todas las pruebas de node y las de `supabase/tests/`, y anotar aquí el resultado.
- [ ] Llenar las filas marcadas «por completar al cierre».
