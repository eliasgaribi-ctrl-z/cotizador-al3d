# Decisiones de la migración a Supabase

Este documento resuelve las preguntas abiertas que dejó la lectura del código real (informe del crítico,
2026-10-10, Q-01 a Q-20) y fija los principios de diseño. **Cada decisión es el valor por defecto más
conservador y es reversible**: nada de esto cambia el comportamiento de la app mientras el interruptor
`modo` siga en `hoja` (que es como está hoy). Elías las confirma o las cambia al revisar el PR.

**El 2026-10-16 Elías las revisó todas** (ver «Revisión de Elías del 2026-10-16» abajo y cada fila de la tabla): cambió Q-05
y Q-19, confirmó Q-01, Q-02, Q-03, Q-09 y Q-13, y aceptó las demás por defecto. **Q-05 es la excepción a «no cambia nada
mientras siga la hoja»**: la regla de etapas también vive en la app y en el Apps Script, así que cambia hoy lo que cada
rol puede hacer. Q-19 también llega a lo de hoy, pero solo cuando se pegue el Apps Script nuevo (hoy la IA la da la hoja).

Plan origen: [`PLAN-SUPABASE.md`](PLAN-SUPABASE.md). Lo que el plan no decía y el código sí mostró está
marcado «(hallazgo)».

---

## A. Principios de diseño (valen para todo lo que se escriba)

1. **Nace apagado.** Todo el código nuevo se activa solo con `modo` ≠ `hoja` y con URL + llave pública
   configuradas. Con el interruptor en `hoja` la app, el service worker y el puente se comportan **idéntico**
   a hoy. Una prueba lo demuestra.
2. **La hoja sigue siendo la fuente de verdad hasta la fase 4.** Nada de esta rama toca la hoja real, datos
   reales ni producción. (Desde el 2026-10-16 existe el proyecto de producción con los datos de la hoja importados y la app apunta a él, todavía apagada por
   aparato: la hoja sigue mandando.)
3. **Escribir solo por funciones (RPC).** Las tablas de negocio no dan INSERT/UPDATE/DELETE al rol
   `authenticated`: se escribe con funciones `SECURITY DEFINER` que llevan las reglas dentro (rol por campo,
   compuerta de sellos, validaciones, IVA por cuenta). Leer es por RLS. Así «cambiar el rol en Ajustes no da
   permisos» se cumple en la base, no en la pantalla.
4. **GRANT explícito.** El proyecto de Supabase está configurado con «exponer tablas automáticamente»
   APAGADO y «RLS automático» ENCENDIDO. Cada migración declara sus propios `GRANT`/`REVOKE` y su
   `ENABLE ROW LEVEL SECURITY`. Ninguna función queda ejecutable por `anon`/`PUBLIC` salvo las públicas a
   propósito.
5. **Vistas con `security_invoker = true`** (o no se exponen). Una vista normal se salta RLS.
6. **Sin borrados duros** en tablas de negocio: `deleted_at` (lápida). Realtime no aplica RLS a DELETE. La **única** excepción son las purgas de los plazos de conservación (decididos por Elías el 2026-10-16, abajo; `0016_plazos.sql`): las corre el dueño de la base, no la app.
7. **Dinero siempre `numeric`** sin escala forzada en G/I/J (la hoja no redondea al guardar) y
   `round(numeric, 2)` (mitad lejos de cero, igual que Sheets) en neto, saldo, comisión y restante.
8. **Ids de texto.** Los ids del cliente (`proy-…`, `proy-hoja-V-NNN`, `mov-salida:…`, `inst-…`) se
   conservan como `text`; el `uid_ics` deriva del id. No se convierten a uuid.
9. **Sin nombres «notion».** Las columnas SQL nuevas no heredan `notion_*`; el traductor del cliente las
   mapea.
10. **Tiempos.** Los sellos por campo son epoch-ms (`bigint`) como hoy (`obraDeLaFila`). Las marcas de
    registro de la base son `timestamptz`.
11. **Secretos jamás en el repo.** El código solo los lee del entorno; las pruebas usan valores falsos y
    marcados como tales.
12. **Todo en español**, comentarios y mensajes de error, como el resto del repo.

---

## B. Decisiones por pregunta

| Q | Decisión (valor por defecto) | Por qué es el lado seguro |
|---|---|---|
| **Q-01 Pagos** | Se construye en la base lo que Pagos hace hoy en la hoja: `registrar_cobro`, `registrar_abono_comision`, `repartir_abono_fifo`, `corregir_venta` (anticipo/subtotal/nombre/cuenta), `alta_venta`. **Las pantallas de Pagos NO entran en esta rama.** La hoja **no se pasa a solo lectura** hasta que existan las pantallas y el cuadre de 7 días. (hallazgo: la plataforma hoy no tiene captura de liquidación, abonos ni reparto) **Decidido por Elías el 2026-10-16: CONFIRMADO.** La hoja pasa a **solo lectura después de 7 días seguidos de cuadre**, y el cambio lo confirma Elías ese día (no es automático). **Desde el 2026-10-16 los 7 días los cuenta la copia diaria** (`cuadre_diario`; abajo, «Transición»). | Declarar la hoja «solo lectura» antes de que exista la captura detendría la cobranza |
| **Q-02 Cotizaciones y solicitudes** | **Decidido por Elías el 2026-10-16: CONFIRMADO como está.** Dirección las lee **todas**; Pagos, **las suyas** (`cotizaciones.creado_por`, `solicitudes.solicito_id`); Fabricación, **ninguna**, porque llevan precios (R1 manda sobre «cada quien las suyas»). Verificado en la base: políticas `cotizaciones_sel_direccion`/`cotizaciones_sel_autor_pagos` y `solicitudes_sel_direccion`/`solicitudes_sel_autor_pagos` de `0008_notario.sql`; ninguna migración posterior las toca. (La versión anterior de esta fila decía «Fabricación y Pagos solo las suyas»: la base nunca le dio cotizaciones a Fabricación.) (hallazgo: el Cotizador está abierto a los 3 roles) **Q-02 bis, decidido por Elías el 2026-10-16: Fabricación SÍ VE (lee y baja) las IMÁGENES —plano, renders y propuesta— de las cotizaciones de obras GANADAS**, para fabricarlas: no llevan precios. La cotización (con precios) sigue cerrada para Fabricación, y las imágenes de una cotización no ganada, de una venta cancelada o de una lápida «No se dio» también; sigue sin subir, cambiar ni borrar. Ver «Las imágenes de las obras ganadas», abajo. | Hoy cada teléfono ve solo lo suyo: es un superconjunto de lo actual para Dirección y nunca más abierto; a Fabricación no le llega un precio |
| **Q-03 estatus, iva, fecha anticipo** | Siguen **visibles para los 3 roles** (hoy lo son). Viven fuera de `ventas_dinero`. (hallazgo) **Decidido por Elías el 2026-10-16: CONFIRMADO.** Verificado en la base: `estatus`, `iva` y `fecha_anticipo` viven en `proyectos` (`0003_proyectos.sql`), que leen los tres roles; las cifras siguen en `ventas_dinero`. | Romperlo quita «Faltan datos» y las marcas de Drive del Tablero |
| **Q-04 Ventas históricas** | Las ≥199 filas de la hoja sin proyecto **no se pierden**: existen en la base (ver decisión de tablas en `DISENO.md`). `ventas_dinero.proyecto_id` no puede suponer que hay cotización. (hallazgo) **Aceptado por defecto (Elías no pidió cambio, 2026-10-16).** | Control suma todas |
| **Q-05 Etapa por rol** | **Decidido por Elías el 2026-10-16: CAMBIA.** **Los tres roles (Dirección, Fabricación y Pagos) mueven cualquier etapa; solo Dirección cancela** («No se dio», `cancelado`). Se lee también al revés: **sacar** un proyecto de `cancelado` deshace esa decisión y también es solo de Dirección (para Fabricación ya era así en la base). Las dos transiciones automáticas **se quedan**: cobro ⇒ instalado en filas importadas (sin cambio) e instalación `hecha` ⇒ `instalado`, que ahora corre para toda área que puede marcar «instalado» según la matriz (Dirección y Fabricación; Pagos no toca la agenda), como ya lo hace el teléfono. Dónde vive: **la base** (`supabase/migrations/0017_decisiones_elias.sql`: la matriz `etapas`, `mover_etapa` e `instalacion_guardar`); **la app** (`puedeMover` en `js/datos/proyectos.js`, la ficha y el tablero de Proyectos), que con la hoja como fuente **cambia hoy** lo que cada quien puede hacer; y **la hoja** (`PUENTE_ROLES` y `ETAPA_CANCELADA` en `puente/hoja-apps-script.gs`), que surte efecto cuando se pegue. Antes (valor por defecto): Dirección cualquiera; Fabricación solo `ganado…listo` en origen y destino; Pagos ninguna. | Lo pidió Elías. El riesgo que queda es el de cualquier etapa: la mueve quien tiene el teléfono, y queda en la bitácora con su nombre |
| **Q-06 Sellos** | **Decidido por Elías el 2026-10-16: gana el cambio más reciente, con 10 minutos de holgura para TODOS los roles, como funciona hoy el `.gs`.** Se conserva el sello **del cliente** (la edición sin señal cuenta con la hora en que se hizo, no la de llegada). La base **acota** el sello a `ahora + 10 min` para Dirección, Fabricación, Pagos y lo que no viene de una RPC. Empate: al subir **escribe**; al bajar **gana lo local** (igual que hoy). No hay prioridad por área. La decisión provisional de `0013` (60 s para los roles bajos y «Dirección gana ante Fabricación o Pagos») se **deshizo** en `0014_sellos_mas_reciente.sql`, que además quita la columna `proyectos.sellos_area` (solo servía para esa prioridad). | Es la regla ya probada; el riesgo de que un reloj de taller adelantado pise a Dirección hasta 10 min queda **aceptado** por Elías |
| **Q-06 bis (la revisión del SQL)** | El hallazgo «la holgura de +10 min deja que un rol bajo anule a Dirección» pasa de «cerrado en `0013`» a **aceptado** (decidido por Elías, 2026-10-16) | Es el comportamiento de hoy; cambiarlo no se pidió |
| **Q-07 Folios** | Contador por aparato como hoy. Se agrega `UNIQUE(empresa, folio_global)` donde no sea vacío. `V-###` sale de una secuencia sembrada por encima del máximo de la hoja. No se cambia ningún `COT-NNNN` ya impreso. **Decidido por Elías el 2026-10-16: mientras la hoja sea la fuente, una venta nueva lleva en Supabase el MISMO V-### que le dio la hoja.** La sombra manda ese folio y `ganar_proyecto` lo usa (`0015_folio_de_la_hoja.sql`): validado (formato del libro, que nadie más lo tenga); si choca, `DATO_INVALIDO` con `causa: folio_ocupado` y la sombra lo aparta con su motivo, sin bloquear. El contador `V` nunca queda por debajo del folio más alto (trigger). El cuadre empareja por V-### y deja el folio de cotización de respaldo para lo dado de alta antes | No rompe PDF impresos; un solo número por venta en los dos lados |
| **Q-08 Login** | `signInWithIdToken` con el ID token de Google Identity Services como camino principal; `signInWithOAuth` (redirección) como respaldo. Se reutiliza el Client ID de Google existente. **La prueba en iPhone con la PWA instalada queda como pendiente verificable por Elías** (no se puede probar desde aquí). (hallazgo: hoy es un access token, no un ID token) **Aceptado por defecto (Elías no pidió cambio, 2026-10-16).** | Cambia lo mínimo de la puerta |
| **Q-09 Acceso revocado** | Se sigue tu decisión (4.8): el teléfono borra su copia local. Con **tres candados** (hallazgo, un falso «fuera» ya cerró una sesión de verdad): (1) solo ante una respuesta **explícita** de la base (`acceso_revocado`), nunca por falta de señal, lista vacía de RLS ni JWT vencido; (2) solo si la bandeja está vacía y lo local ya tiene acuse; si no, se **bloquea la pantalla** y no se borra; (3) se conservan `al3d_pf_disp` y `al3d_folio`. Todo detrás del interruptor y deshabilitado hasta que exista la subida única **Decidido por Elías el 2026-10-16: CONFIRMADO** (la baja borra la copia del teléfono, con los tres candados). | Evita perder datos que solo existen en un teléfono |
| **Q-10 Hoja espejo** | El espejo respeta `FIN` (tope de filas) y avisa `capacidad_agotada`; subir `FIN` es un paso del despliegue, no de esta rama. Espeja **Ventas + Abonos comisión** (de ellas dependen S/T/U y 8 pestañas); Almacén, Autorizaciones y Solicitudes quedan como archivo congelado. En modo espejo `alEditar`/`normalizarIvaActivos`/`ordenarVentas` quedan inocuos. Celda visible «última sincronización». **No se crean pestañas nuevas** **Aceptado por defecto (Elías no pidió cambio, 2026-10-16).** | Tu regla: no más pestañas |
| **Q-11 /verificar** | La ruta de Apps Script **se queda viva** hasta probar un QR impreso real en `github.io` **y** `pages.dev`. `verificar.html` llama a la función nueva solo si el interruptor lo indica. (hallazgo: CSP y service worker) **Aceptado por defecto (Elías no pidió cambio, 2026-10-16).** | Un PDF impreso que deja de verificar no tiene arreglo |
| **Q-12 Auth de lo que se queda en Apps Script** | `espejo` y `respaldo`: secreto compartido (propiedad del script + secreto de la función), comparación en tiempo constante. `/carpetas` y `/crear_carpeta` **no se tocan en esta rama**; su autenticación tras retirar tokens (fase 5) queda como decisión explícita de esa fase **Aceptado por defecto (Elías no pidió cambio, 2026-10-16).** | La fase 5 no entra aquí |
| **Q-13 Almacén** | Paridad con hoy: Dirección y Pagos ven costos; Fabricación opera el almacén **sin ver costos** (los costos van en tabla restringida). La salida derivada del corte pasa a RPC **Decidido por Elías el 2026-10-16: CONFIRMADO** (Fabricación opera el almacén sin ver costos; los costos siguen en `almacen_costos`, `0005_almacen.sql`, que Fabricación no lee). | RLS no oculta columnas: se separan |
| **Q-14 Importación** | El script **no decide**: reporta conflictos y cuadre. Los reportes se escriben **fuera del árbol** del repo. Es idempotente y re-ejecutable (la fase 3 lo usa para re-cuadrar) Con este criterio se hizo la importación a producción el 2026-10-16 (219 ventas, 186 abonos, cuadre con 0 diferencias); no estaba en la lista de Elías de ese día. | El repo es público |
| **Q-15 Instalaciones/UID** | Una instalación viva por proyecto (índice único parcial). UID canónico = el de mayor `movida`; las demás quedan `cancelada` sin tocar calendario; todo va al reporte. (hallazgo: unir teléfonos duplica citas) **Aceptado por defecto (Elías no pidió cambio, 2026-10-16).** | No duplica eventos ya sincronizados |
| **Q-16 Retazos del anidador** | Por aparato, sin migrar. Queda documentado **Aceptado por defecto (Elías no pidió cambio, 2026-10-16).** | Fuera de alcance |
| **Q-17 Privacidad** | Se redacta el cambio de `privacidad.html` con hechos (qué se guarda, dónde, quién lo ve, cómo se baja un acceso). **Es borrador para tu revisión**; no es asesoría legal Aplicado el 2026-10-16 con las decisiones de Elías (`BORRADOR-PRIVACIDAD-SUPABASE.md`); no estaba en la lista de ese día. | El plan pide actualizarlo antes de la fase 2 |
| **Q-18 Repositorio** | `supabase/` y `scripts/` van en **este** repo. `.gitignore` y `_headers` (noindex) cubren `.env*`, `supabase/.temp/`, volcados y `reportes/`. Reportes con datos de clientes **nunca** dentro del árbol (el sitio publica todo) **Aceptado por defecto (Elías no pidió cambio, 2026-10-16).** | El código no es secreto; los datos sí |
| **Q-19 IA** | **Decidido por Elías el 2026-10-16: CAMBIA a 50 consultas al día por persona** (antes 200), contado en el día de **México** (`America/Mexico_City`). La base lo impone: `ia_cuota` nunca deja más de 50 aunque quien llama pida más (`0017_decisiones_elias.sql`). Lo dicen también la función `ia` (`IA_LIMITE_DIARIO` en `supabase/functions/_shared/ia.js`) y el Apps Script, que hoy es el que da la IA (`IA_LIMITE_DIARIO` = 50 y el día del cupo en hora de México en lugar de GMT; surte efecto cuando se pegue en la hoja). Se cuenta en una tabla (las funciones no guardan estado). Lista blanca de modelos y URLs igual | Lo pidió Elías; con la hoja y la base contando igual no hay una hora del día en que el cupo se reinicie antes |
| **Q-20 Respaldo y pausa** | **Pausa**: un flujo de GitHub Actions programado cada 2 días llama a una función pública `salud` (la pausa es a la semana). **Respaldo**: función `respaldo` (secreto compartido) + función de Apps Script que escribe a Drive; semanal; se enciende después de la fase 4. Sin respaldos propios de Supabase en el plan Free (verificado 2026-10-10) **Aceptado por defecto (Elías no pidió cambio, 2026-10-16).** | Un cron semanal no deja margen |

### Confirmadas por Elías el 2026-10-16 (segunda entrega)

- **Encender Supabase desde Ajustes: solo Dirección.** Pagos **no** lo enciende desde Ajustes (la tarjeta de Supabase sigue siendo solo de Dirección); en un teléfono de Pagos se enciende a mano, como dice `supabase/NOTAS-SEGUNDA-ENTREGA-PAGOS.md` (D-2). **CONFIRMADO, sin cambios.**
- **Correcciones desde la pantalla de Pagos: solo abonos de comisión y liquidación** (D-5 de las notas de Pagos). Subtotal, nombre, cuenta, estatus, porcentaje e IVA siguen fuera. **CONFIRMADO, sin cambios.**
- **Q-06** y **Q-07**: arriba, en la tabla.

### Revisión de Elías del 2026-10-16 (con el proyecto de producción)

Ese día Elías revisó las preguntas que quedaban con su valor por defecto, ya con el proyecto de producción `al3d-produccion`
creado y los datos importados. En la tabla de arriba cada fila dice qué decidió:

- **Cambian:** **Q-05** (los tres roles mueven cualquier etapa; solo Dirección cancela o saca de «No se dio») y **Q-19** (IA: 50
  consultas al día por persona, en hora de México). Los dos están en `supabase/migrations/0017_decisiones_elias.sql`, con pruebas que
  fallan sin ella, y en la app y el Apps Script (ver cada fila).
- **Confirmadas tal como están:** Q-01 (la hoja pasa a solo lectura después de **7 días seguidos de cuadre**; ese día lo confirma Elías),
  Q-02, Q-03, Q-09 y Q-13.
- **Aceptadas por defecto** (Elías no pidió cambio): Q-04, Q-08, Q-10, Q-11, Q-12, Q-15, Q-16, Q-18 y Q-20.
- Q-06 y Q-07 ya estaban decididas (segunda entrega); Q-14 y Q-17 no estaban en la lista y se quedan como dicen sus filas.
- Después, el mismo día: **Q-02 bis** (Fabricación ve las imágenes de las obras ganadas; abajo).

### Las imágenes de las obras ganadas (Q-02 bis, decidido por Elías el 2026-10-16)

Fabricación necesita el plano, los renders y la propuesta para fabricar, y las imágenes no llevan precios. Lo implementan
`supabase/opcional/storage.sql` (la política `cotizacion_imagenes_leer` gana una rama), `js/datos/supa-imagenes.js` y la ficha del
proyecto (`js/mod/proyectos.js`), todo apagado mientras no se encienda la lectura en vivo.

- **Qué es «ganada»** (lo que la base ya tiene, sin funciones nuevas): existe un proyecto con el folio global de la carpeta de la imagen
  (`proyectos.folio_global`, la llave con la que `ganar_proyecto` ata la venta a su cotización), que es una **venta** (`folio_hoja`,
  el V-###; una lápida «No se dio» no lo tiene), que **no está cancelado** (`etapa` ≠ `cancelado`: ni «No se dio» ni una venta que se
  cayó) y que no está borrado (`deleted_at`). Es el criterio de `interno.cotizacion_protegida` de `0016` («un proyecto con su folio que
  no es una lápida pura»), del lado estricto: ahí, ante la duda, la cotización se queda; aquí, ante la duda, la imagen no se enseña.
- **Quién**: solo Fabricación de esa empresa (Dirección ya leía todo; Pagos sigue con las de sus cotizaciones). La política pregunta por
  `proyectos` con los permisos de quien lee, así que una baja o una obra que se cancela surten efecto en la siguiente petición.
- **La duplicada ganada**: una imagen que comparten dos cotizaciones se sube una vez, en la carpeta de la más vieja. Si la que se gana es
  la otra, el teléfono que la subió la **copia** (una copia de Storage, sin volver a subirla) a la carpeta de la ganada, que es donde la
  busca Fabricación. Sin eso, la duplicada ganada se quedaba sin plano.
- **Dónde se ven**: en la ficha del proyecto, junto a la carpeta de Drive, solo con la lectura en vivo encendida (Dirección y
  Fabricación); con URL firmada de 60 s y sin guardarlas en el teléfono.

### Plazos de conservación (decidido por Elías el 2026-10-16)

Hasta aquí nada se borraba nunca (A.6). Elías fijó cuánto se guarda cada cosa en la nube; lo implementan
`supabase/migrations/0016_plazos.sql` (purgas en el esquema `interno` y su programación diaria con pg_cron, 03:15 de México) y la
función `respaldo` (la rotación en Drive).

| Qué | Plazo | Cómo |
|---|---|---|
| Cotizaciones **no ganadas** | se borran a los **8 meses** de su última actividad | `interno.purgar_cotizaciones_no_ganadas`. Se van con sus solicitudes y su lápida «No se dio». «Última actividad» = lo más reciente entre su `updated_at`, su `created_at`, sus solicitudes y su lápida |
| Bitácora | se conserva **1 año** (por la hora del hecho, `ts`) | `interno.purgar_bitacora`. Sigue sin poder editarse |
| Lo borrado en la app (`deleted_at`) | se purga a los **30 días** de marcado | `interno.purgar_borrados`: cotizaciones (si no están protegidas), notas de cuaderno y citas |
| Respaldos semanales en Drive | se quedan los **8 más recientes** | La función `respaldo`, solo después de una subida buena y solo sobre lo que ella creó (nombre `al3d-respaldo-…Z.json` **y** su marca `appProperties.al3d = respaldo`); lo que sobra va a la papelera de Drive. `RESPALDO_CONSERVAR` lo cambia (8 por omisión) |
| Libros de dinero (ventas, abonos, comisiones) y autorizaciones | **no se purgan nunca** (contabilidad) | Ninguna purga los toca y `sin_borrar` los rechaza aun dentro de una purga. Tampoco `proyectos`/`ventas_dinero` con `deleted_at`: son el libro de ventas |

**Qué cuenta como «no ganada» (criterio conservador: ante la duda, se queda).** Una cotización está **protegida** —no se borra ni
a los 8 meses ni borrada en la app— si: está `autorizada`, tiene `autorizacion_id` o `revocada_en`; existe **cualquier** sello con su
folio en `autorizaciones` (vigente, superada o revocada: es evidencia de un PDF impreso); alguna de sus solicitudes quedó autorizada;
existe un proyecto con su folio que no es una lápida pura (una venta con V-###, una fila de la hoja o manual, cualquier etapa que no
sea `cancelado`, o una lápida con citas, requerimientos o dinero colgando); o sus `hitos` dicen `venta`. Lo demás —`pendiente` sin
resolver, `rechazada`, `retirada`— es «no ganada».

**El camino para borrar.** `sin_borrar` sigue en todas las tablas (la auditoría de `0011` lo exige) y `service_role` sigue sin
`DELETE`. La purga corre como el dueño (`postgres`, que es como corre pg_cron), marca la tabla en una variable de transacción y el
trigger deja pasar **solo** la fila que cumple la regla de su tabla, revisada otra vez fila por fila. Las purgas no las ejecuta
`service_role`, `authenticated` ni `anon`. Cada corrida que borra algo deja una línea en la bitácora de su empresa (nivel
`direccion`). El aviso de Realtime de cada borrado lleva solo la llave primaria (identidad de réplica DEFAULT), nunca la fila: se
acepta. Una cotización purgada puede volver si un teléfono que todavía la tiene la sube otra vez (la purga es de la nube, no de los
teléfonos).

### Transición: copia diaria hoja → nube (decidido por Elías el 2026-10-16)

**Lo que pasa hoy.** El equipo **no usa la plataforma**: sigue capturando directo en la hoja «Finanzas AL3D — Ventas y
Comisiones». La escritura en sombra (fase 3) solo copia a la nube lo que pasa por la app, así que con la hoja como única
entrada la nube se quedaría como el día de la importación.

**Lo que decidió Elías.** Una **copia automática diaria de la hoja a Supabase**, con su **cuadre diario** y la **racha de 7
días**. El día que Elías diga: una última copia, la hoja a **solo lectura** y el equipo pasa a la plataforma. La escritura en
sombra queda para **después del cambio** (mientras la hoja manda, la copia de cada madrugada pisa la base con la hoja: encender
la sombra antes no estorba, pero no hace falta).

**Cómo quedó** (`supabase/README.md`, «La copia diaria»):

- `puente/copia-diaria.gs`, un archivo nuevo del proyecto de Apps Script de la hoja (no cambia `Código.gs`), arma cada madrugada
  (de 3 a 4, hora de México) el mismo volcado que `volcado-para-importar.gs`, en memoria, y lo manda a la función
  `importar-diario` con el secreto `IMPORTAR_SECRETO` (en los Secrets de la función y en las propiedades del script).
- La función corre **el mismo importador** de la fase 2 (Q-14: no decide), en **una sola transacción**, y después el cuadre por
  folio de `cuadre.sql`. Deja un renglón en `cuadre_diario` (`0018`), que solo lee Dirección, sin nombres ni importes.
- Si el **plan** trae conflictos o filas que no entran, **no se aplica nada** ese día (se anota y se arregla en la hoja). Lo que
  la **base** no deja cambiar lo deja sin tocar el propio SQL del importador y se anota como conflicto: lo demás sí se aplica.
- Sin teléfonos y sin la clave del sello, como la importación del 2026-10-16: las 30 autorizaciones siguen esperando la clave.

**Cómo se lee Q-01 desde hoy.** «7 días seguidos de cuadre» = 7 días de México seguidos cuyo último renglón de `cuadre_diario`
dice `cuadra` (se aplicó, 0 diferencias, 0 conflictos, 0 filas que no entran). Ajustes → Supabase lo cuenta. El día del cambio
lo sigue confirmando Elías: no es automático.

**Abierto (para Elías).** Una venta que la hoja tenía en **FABRICACION o REPARANDO** sin folio de cotización entró a la base como
«viva»; cuando pasa a **COBRANDO o LIQUIDADO**, la regla de la fase 2 (DISENO §3.0) la haría «histórica», y la base no deja
cambiar eso. La copia lo anota como conflicto, **esa venta deja de actualizarse** y el día no cuadra, todos los días, hasta que se
decida. Es el ciclo normal de una venta, así que es lo más probable que corte la racha, y **no hay un arreglo a mano limpio**
(ni en la hoja ni en la base: `historica` no se puede cambiar, a propósito). Hace falta una regla: (a) en el importador, una
venta que ya es viva en la base sigue viva (con su etapa) y se actualizan su estatus y su dinero; o (b) en la base, dejar que una
fila de la hoja pase de viva a histórica. **Por defecto no cambia nada** hasta que Elías decida; mientras, cada venta así se
anota y el día no cuadra. Los detalles: `docs/ESTADO-SUPABASE.md`, «Sexta entrega».

---

## C. Lo que queda para después de esta rama (y por qué)

- **Pantallas de Pagos** (cobro, abono, reparto, corrección): la base ya las soporta; falta la interfaz.
- **Lectura desde la base y Realtime en producción** (fase 4) y **retiro** (fase 5): requieren datos reales,
  una semana de cuadre y tu visto bueno.
- **Prueba de login en iPhone**, **QR impreso real**, **secretos reales** (sello, llaves de IA, secreto del
  espejo, secreto de Google): solo tú puedes.
