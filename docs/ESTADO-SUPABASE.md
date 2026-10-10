# Estado de la migración a Supabase

**Última actualización: 2026-10-10 (cierre de la primera entrega: fase 0, fase 1 y las piezas de la 3 que no necesitan datos reales).** Es el avance real, fase por fase, de [`PLAN-SUPABASE.md`](PLAN-SUPABASE.md): el plan dice qué se va a hacer, [`DECISIONES-SUPABASE.md`](DECISIONES-SUPABASE.md) dice cómo, y aquí está qué ya existe, con qué evidencia y qué falta. Las cifras son de corridas reales hechas ese día; lo que no se pudo comprobar está en «No verificado», sin adornos.

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
| 1 | Base y acceso | **hecho y verificado** (PGlite **y** el proyecto real de pruebas). Falta el inicio de sesión de punta a punta (cliente) | Pruebas de RLS (las reglas de qué ve cada área) en verde para los tres roles; ninguna fila real todavía |
| 2 | Importar | **pendiente** (la base ya tiene lo que necesita; falta el script y tus datos) | Reporte de cuadre que coincida con la hoja y con los teléfonos |
| 3 | Doble escritura | **parcial**: la ruta `espejo` y la función están hechas y probadas con dobles, **apagadas**. Falta la escritura desde la bandeja y el cuadre diario | Siete días seguidos de cuadre; si no cuadra, se regresa a la fase 2 |
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
| Módulos puros de las funciones: sello de autorización, enlace corto de Maps, inteligencia artificial y verificación | hecho y verificado | `supabase/functions/_shared/{sello,maps,ia,verificar}.js` y `pruebas/supabase-{sello,maps,ia}.mjs`. Probados contra el `.gs` **real** cargado en una máquina virtual (22 127 casos del sello) y, por mutación, rompiéndolos a propósito: cada rotura la detecta alguna prueba |
| Las 11 migraciones (base común, acceso, proyectos y dinero, fórmulas, almacén, funciones de obra, de pagos, notario, cupos, espejo, auditoría) | hecho y verificado | `supabase/migrations/0001`…`0011` (17 tablas, vistas con `security_invoker`, funciones `SECURITY DEFINER` con `search_path` fijo). **Aplicadas sin error en el proyecto real `al3d-pruebas`** y la auditoría `0011` pasó ahí |
| Pruebas de la base: acceso, RLS y dinero, fórmulas al centavo, obra y etapas, pagos, almacén, notario, cupos, sincronización y auditoría | hecho y verificado en PGlite | `supabase/tests/`: **32 archivos, 772 comprobaciones, 0 fallos** (`sh supabase/tests/correr.sh`, ~4 min). Cada caso lleva su id de `supabase/DISENO.md` §10, permitido **y** denegado por rol. 70 mutaciones a las migraciones: las que sobrevivieron al principio se reforzaron y hoy todas mueren |
| **Prueba de humo en Supabase real**: las tres áreas simuladas con sus reglas de acceso (Fabricación no ve dinero, Pagos cobra y reenviar un cobro no lo suma dos veces, la persona ajena no ve nada, anon denegado, fórmulas 4640 / 3640 / 400) | hecho y verificado **en el proyecto real** | `supabase/opcional/prueba-de-humo.sql`: **23 de 23** el 2026-10-10. Además, desde internet con solo la llave pública: anon no lee `proyectos` ni `ventas_dinero`, no inserta, no ejecuta `mi_acceso` y el esquema `interno` no está expuesto |
| Funciones del servidor: `salud`, `verificar`, `maps`, `ia` | hecho y verificado en node y en Deno | `supabase/functions/*` y `pruebas/supabase-funciones.mjs` (452 comprobaciones en node y 401 bajo Deno 2.9.6; `deno check` pasa). **No se han desplegado** (necesitan tus secretos) |
| Inicio de sesión con Google (Supabase Auth) | configurado en el proyecto de pruebas; **falta el cliente** | Google habilitado en `al3d-pruebas` con el Client ID público de la app (el flujo de «ID token» no pide secreto), Site URL y redirecciones de GitHub Pages y pages.dev. El código del cliente (puerta) está en la segunda entrega |
| Probar el inicio de sesión en iPhone con la aplicación instalada | bloqueado por Elías | `DECISIONES-SUPABASE.md`, Q-08 |
| Cargar los secretos reales | bloqueado por Elías | `PLAN-SUPABASE.md` §4.12; lista de nombres en `supabase/README.md` |

**Puerta de salida:** pruebas de RLS en verde para los tres roles; ninguna fila real todavía. **Cumplida**: PGlite 772/772 y el proyecto real 23/23, sin una sola fila real.

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
| Ruta `espejo` en el Apps Script y función de Supabase que la llama | hecho y verificado con dobles, **apagado** | [`puente/ESPEJO.md`](../puente/ESPEJO.md); `pruebas/supabase-espejo.mjs` (592 comprobaciones; 113 roturas a propósito, todas detectadas). Con el modo espejo apagado las 13 pruebas existentes que leen el `.gs` dan lo mismo antes y después |
| Parche de seguridad del `/expandir` (la lista blanca aceptaba `https://maps.google.com:x@evil.example/` y conectaba a evil.example) | hecho y verificado | `puente/hoja-apps-script.gs` (`expandirLiga_`) y su prueba. **Es un hueco que existe hoy en producción**: se corrige cuando se pegue el código nuevo en Apps Script |
| Pegar y publicar el código nuevo en Apps Script | bloqueado por Elías | `DECISIONES-SUPABASE.md`, Q-10. El código del repositorio no toca la hoja real |
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
| **Las 60 pruebas de node del repositorio pasan** (las 55 que ya había más las 5 nuevas) | `sh pruebas/correr.sh`: Windows 11, Node 24.17, 4 min 26 s, salida 0, el 2026-10-10 | `pruebas/*.mjs` |
| **Las 11 migraciones corren en Supabase de verdad** y su auditoría pasa | Aplicadas una por una en el Editor SQL de `al3d-pruebas` el 2026-10-10. La auditoría `0011` **abortó la primera vez** por una función que Supabase mismo instala (`rls_auto_enable`, de tipo `event_trigger`, que no se puede invocar como RPC); se corrigió la auditoría, con prueba, y pasó | `supabase/migrations/0011_auditoria.sql`, `supabase/tests/auditoria/auditoria.mjs` |
| **Prueba de humo en el proyecto real: 23 de 23** | 2026-10-10, en el Editor SQL de `al3d-pruebas`; siempre se deshace sola | `supabase/opcional/prueba-de-humo.sql` |
| Acceso anónimo cerrado, comprobado desde internet con la llave pública | 2026-10-10: `proyectos` y `ventas_dinero` dan 401 («permission denied»), insertar también, `mi_acceso` también, y el esquema `interno` no está expuesto (`PGRST106`) | — |
| Los 6 puntos que el plan 4.6 mandaba verificar del plan gratuito | 2026-10-10 en supabase.com/pricing (ver arriba) | — |
| `/rest/v1/` a secas **ya no sirve** para mantener despierto el proyecto (pide llave secreta: 401); sí contestan con la llave pública `/auth/v1/health` y una consulta a una tabla | 2026-10-10 contra `al3d-pruebas`; el flujo de GitHub se probó en sus 4 escenarios (sin variable, dirección ajena, proyecto real, proyecto inexistente → rojo) | `.github/workflows/mantener-activo.yml` |

### No verificado

| Qué | Por qué falta | Quién lo cierra |
|---|---|---|
| **Que los sellos de producción se firmaron con esa codificación.** Lo comprobado es el comportamiento de la función de Apps Script, no las filas de «Autorizaciones» que ya están en la calle | Hace falta una fila real y su clave | Elías (ver arriba). Mientras tanto el módulo de verificación acepta las dos codificaciones y dice con cuál coincidió |
| La firma con la **clave real**, que es más larga que 64 bytes (son tres identificadores pegados: `puente/hoja-apps-script.gs`, línea 3661) | Las pruebas usan claves de prueba cortas; hay una opción para la clave y las filas reales (`AL3D_SELLO_CLAVE_REAL`, `AL3D_SELLO_FILAS_REALES`) que no se ha usado | Elías, con la clave por un canal seguro |
| Las funciones del servidor **desplegadas en Supabase**: corrieron en Deno 2.9.6 con dobles y con `supabase-js` real contra un Supabase de mentiras, pero no en el runtime real (150 s por petición, 2 s de CPU, tamaño máximo del cuerpo —no está documentado—, que Auth y PostgREST acepten las llaves `sb_*` en `apikey`) | Necesitan tus secretos y `supabase functions deploy` | Elías (secretos) y la entrega siguiente |
| **Realtime, Storage y la concurrencia entre conexiones** (dos personas cobrando a la vez, dos `siguiente('V')` a la vez) | PGlite tiene una sola conexión y no trae esos servicios; la prueba de humo corre una sola sesión. Se argumentan por construcción (candados de fila, índices únicos, `ON CONFLICT`) | La entrega siguiente, con dos clientes contra `al3d-pruebas` (EX-07 a EX-10 de `supabase/DISENO.md` §10.17) |
| Cómo reacciona **PostgREST real** a lo que las funciones esperan: `max_rows` de 1000, filtros `or=(…)` del cursor y la cabecera `x-al3d-contrato` | Solo se probó el SQL, no la capa HTTP | La entrega siguiente (cliente) |
| Que el **Editor SQL corre cada archivo como una sola transacción** | Lo vimos funcionar (11 archivos, ningún estado a medias) pero no se pudo forzar un error a medio archivo para comprobar el retroceso | — |
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

## Lo que NO entra en esta entrega (segunda entrega)

No se hizo por una razón concreta, no por olvido: cada pieza necesita datos reales, secretos o una decisión tuya, o es código de cliente que no se puede validar sin los teléfonos.

| Pieza | Por qué falta | Qué la desbloquea |
|---|---|---|
| **Importador** de la hoja y de los teléfonos (`scripts/importar-hoja.mjs`) con reporte de conflictos y de cuadre (IM-01 a IM-12 de `DISENO.md` §10.15) | Hay que leer la hoja real con `getValues()` y los teléfonos exportan por separado; se prueba con «hojas de mentiras», nunca con datos reales | Tu visto bueno a la fase 2 y la copia completa de la hoja |
| Función **`autorizar`** (firma el sello con la clave) y **`respaldo`** a Drive | `autorizar` repite el cálculo de precios del servidor con el catálogo; necesita la clave real (`SELLO_AUTORIZACION`) para su prueba de oro. `respaldo` necesita una credencial hacia Drive | Tus secretos y filas reales de «Autorizaciones» |
| **Cliente**: inicio de sesión con Google en la puerta, escritura en la sombra desde la bandeja, lectura con Realtime, CSP y service worker | Cambia código de producción y no se puede validar sin los teléfonos; con el interruptor apagado no debe cambiar nada y eso se demuestra con las pruebas de navegador, que no corren en Windows | Una sesión con un teléfono y la lista de cambios de contrato (`DISENO.md` §11.5) |
| **Pantallas de Pagos** (cobro, abono, reparto, corrección) | La base ya las soporta; falta la interfaz | `DECISIONES-SUPABASE.md`, Q-01 |

## Cierre de la primera entrega

- [x] `README.md` ya dice **60** pruebas de node (se movió con cada prueba nueva) y `pruebas/publicacion.mjs` pasa.
- [x] Corridas completas: `sh pruebas/correr.sh` (60 archivos, salida 0) y `sh supabase/tests/correr.sh` (32 archivos, 772 comprobaciones, 0 fallos).
- [x] Migraciones aplicadas, auditadas y probadas en el proyecto real de pruebas.
- [ ] Revisión de seguridad adversarial del SQL (un agente que no lo escribió intenta romperlo): ver el PR.
- [ ] Que Elías revise, confirme o cambie las decisiones (`DECISIONES-SUPABASE.md`) y apruebe el PR en GitHub.
