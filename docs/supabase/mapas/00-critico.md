# 00 · Crítico de completitud: huecos, contradicciones y puntos de mayor riesgo

Fecha: 2026-10-10. Repo (solo lectura): `C:\Users\elias\Git\cotizador-al3d\.claude\worktrees\supabase`, rama `claude/supabase-fase-0-1`, HEAD `3dbd293` (incluye PR #99, `puente-sheets-14`).
Insumos: `docs/PLAN-SUPABASE.md` y los diez mapas `01..10` leídos completos, más barridos propios con Grep/Read sobre el árbol.

## 0. Método y marcas

- `[V]` = lo verifiqué yo en el código de este repo (archivo:línea). `[M0x]` = lo repito de un mapa sin releerlo. `[W]` = documentación oficial consultada hoy (URLs en §10). `[I]` = inferencia mía, no verificada.
- No usé el navegador ni la sesión de Chrome; no toqué la hoja viva, el Apps Script ni Supabase.
- Identificadores: `X-nn` contradicción entre mapas · `C-nn` contradicción mapa/código contra el plan · `N-nn` pieza que ningún mapa cubrió · `P-nn` peligro de producción · `Q-nn` pregunta para Elías.
- Fidelidad de los mapas: re-verifiqué 22 afirmaciones de alto riesgo (clave del sello, `FIN`, sellado de `DB.poner`, `esperaMs`, ausencia de `acceso_revocado`, roles de `RUTAS`, cotizador sin filtro por rol, `APP_VERSION`, claves de storage, llamadas de red, instalaciones por teléfono, pruebas que leen el `.gs`, etc.): 21 coinciden exactamente; la discrepancia es la de `X-01`. Los mapas son confiables; los huecos están en el plan, en el orden de las fases y en lo que el repo no puede mostrar.
- Scripts de apoyo (no tocan el repo): `scratchpad\cuadre-centavos*.mjs` (aritmética de redondeo citada en P-03).

## 1. Veredicto (12 líneas)

1. Los mapas casi no se contradicen entre sí (§2: 3 contradicciones reales y 1 conteo reconciliado). Los huecos relevantes están entre los mapas y el plan, y en datos vivos que ningún mapa podía ver (§9).
2. El plan sub-describe la migración en cinco frentes: (a) Pagos no tiene captura en la plataforma; (b) el dinero no vive solo en `ventas_dinero`; (c) hay >=199 ventas históricas sin proyecto; (d) «la regla de sellos se conserva» cubre solo la mitad que baja; (e) `cotizaciones`, bandeja e imágenes existen solo en teléfonos.
3. Lo más peligroso es el ORDEN: el plan apaga la hoja como captura (Fase 3) antes de que existan las pantallas de Pagos, y borra copias locales al revocar acceso (§4.8) antes de que exista la subida única del historial.
4. Cuatro riesgos baratos de evitar y caros si ocurren: el repo público sirve TODO el árbol con `.gitignore` casi vacío; las «vistas por área» del plan se saltan RLS salvo `security_invoker`; un falso «fuera» ya cerró una sesión de verdad (`js/nucleo/puerta.js:376-392`) y con el borrado local del plan habría destruido datos; la firma HMAC no tiene un solo vector real y el HMAC de `String` no tiene codificación documentada.
5. `cotizaciones` y `solicitudes` no son «dinero aparte»: el Cotizador está abierto a los tres roles (`js/app.js:78`) y el plan no define su RLS.
6. El `.gs` del repo no es necesariamente el vivo («la copia que manda es la de la hoja», `puente/DESPLIEGUE.md:89`); los diez mapas parten del del repo.
7. La hoja tiene techo duro de 309 ventas (`.gs:9`) y ya había ~214 en septiembre (`js/datos/proyectos.js:378`): el «espejo permanente» necesita plan de capacidad.
8. Hay 40 contradicciones mapa/plan consolidadas (§4), 15 piezas nuevas (§6) y 13 peligros ordenados (§7). Las preguntas que bloquean diseño están en §11.

## 2. Contradicciones ENTRE mapas

| ID | Tema | Un mapa dice | Otro mapa dice | Qué dice el código | Qué hacer |
|---|---|---|---|---|---|
| X-01 | Dónde vive el access token de Google | M05 §5.4: «1 h, solo en memoria» | M06 §4.2 y M08 §1.5: persistido en `localStorage['al3d_pf_gtok']` | [V] `js/nucleo/ingreso.js:132,137` lo lee y escribe en localStorage; el comentario `js/datos/puente.js:928` y `privacidad.html:101-106` están obsoletos | Usar M06/M08. M05 repite el comentario viejo |
| X-02 | ¿La idempotencia `mov-salida:<req.id>` evita salidas dobles entre teléfonos? | M09 §1.6: sí, «evita dos salidas entre teléfonos» | M03 §2.6 pt.7 y H1: casi nunca se ejerce (cada teléfono tiene otro `proyecto_id` local y `Mat.requerimientos(p.id)` filtra por id local) | M03 tiene razón: el id solo coincide si dos teléfonos comparten `proyecto_id` | En la importación deduplicar por (folio_hoja, material); no confiar en el id de la salida |
| X-03 | Cuántas ventas tiene la hoja | M09 §0.1 y §9.2: «~300 filas / ~300 ventas» | M02, M03, M05, M10: 199 anteriores a la plataforma; tope 309; M09 §11 cita 214 | [V] 309 es capacidad (`FIN=310`, `.gs:9`), no contenido; `js/datos/proyectos.js:378` cita 214 filas en septiembre; conteo vivo NO CONFIRMADO | Tratar «~300» como tope. Contar filas vivas en §9 |
| X-04 | Cuántas pruebas leen el `.gs` (NO es contradicción; conteo reconciliado) | M01 §13: «15 archivos» | M10 §0: «13 de node + 2 (navegador y `comun/`)» | [V] 14 archivos bajo `pruebas/` lo leen con `readFileSync`/`vm` (12 de primer nivel + `comun/hoja-de-mentiras.mjs` + `navegador/dos-telefonos.mjs`); `sincronizacion.mjs` lo hereda vía `comun/` = 15; 7 archivos de `js/` solo lo citan en comentarios | Lista exacta en §6.3 |

No encontré contradicciones entre M01/M02 (columnas y roles), M01/M04 (sello), M03/M05 (almacén), M06/M09 (modelo local), M07/M04 (cotizaciones y hoja).

## 3. Glosario de homónimos (donde dos nombres iguales significan cosas distintas, o un nombre distinto significa lo mismo)

Ningún mapa lo junta; quien escriba SQL va a mezclarlos si no se dice.

| Nombre | Significados reales (con fuente) |
|---|---|
| `entrega` | Cotizador `Q.entrega`/`entry.entrega` = texto libre del compromiso («Viernes 15 de Agosto»), en la plataforma `compromiso_texto` [M07 §2.1]. Plataforma `proyecto.entrega` = modo (`instalacion`, `paqueteria`, `recoleccion`). Hoja `Entrega` (AF) = el modo con etiquetas «Instalación», «Paquetería», «Recolección en taller»; vacía = Instalación [M09 §1.2, M02] |
| `sub` / `neto` | `entry.sub/neto` (historial) = calculados con el catálogo del momento; `venta.sub/neto` (`desgloseFinal`) = `neto=precioFinal`, `sub=neto/1.16`; `proyecto.sub/neto/precio_auth` = los de la venta; hoja G «Subtotal» (sin IVA, sin redondear) y H «Precio neto» (fórmula). Con descuento autorizado `venta.sub` != `entry.sub` [M07 §5.1] |
| folios | `folio` impreso `COT-0042-B` (contador local por aparato); `folio_local`; `folio_global` = `folio@disp` = lo que guarda la col. Y «Folio cotizacion»; `folio_hoja` = `notion_page_id` = `id_notion` = `V-###` (col. A «Folio»). `FOLIO_MAS_ALTO` cuenta los `V-###`, no los `COT-` [M09 §4, M04 §4.5] |
| `notion_*` | `notion_page_id`, `notion_estado`, `estatus_notion`, `aNotion`, `deNotion`, `id_notion` son nombres heredados de Notion que hoy significan HOJA. Las columnas SQL nuevas no deben heredar «notion» y el traductor debe mapearlas [M05, M09] |
| `estatus` vs `etapa` vs `estado` | `estatus` = eje de DINERO (`FABRICACION`, `REPARANDO`, `COBRANDO`, `LIQUIDADO`); `etapa` = eje de OBRA (8 valores); `estado` = otros ejes (instalación, solicitud, requerimiento, `Q.estado`, `notion_estado`) [M09 §1.5] |
| `proy` / `cliente` / `Proyecto` | Cotizador: `proy` = NEGOCIO, `cliente` = PERSONA. Hoja Ventas `Proyecto` (B) = «cliente - negocio (Tipo)». «Autorizaciones»/«Solicitudes»: `Proyecto` = negocio, `Cliente` = persona [M07 §5.2] |
| `sello` (4 sentidos) | (1) autorización: código/firma HMAC; (2) movimiento de almacén: `ts` = columna «Sello» (número) y `sello` = columna «Firma» (texto `Nombre · Rol (DISP)`); (3) sellos por campo: `proyectos.sellos`, col. AI «Sellos», col. «Sellos» de catálogo y listas; (4) `Prefs.sello()` [M03 §1.2, M04, M05, M06] |
| `rol` | `Q.rol` (`vendedor`/`autorizador`) = vista del cotizador, no permiso; `Prefs.rol()` (`direccion`/`fabricacion`/`pagos`); col. «Rol» de «Accesos»; `miembros.area` del plan [M07 §3.2] |
| `Solicitó` | En «Solicitudes» y «Autorizaciones» es un texto de identidad: correo o `token de <rol>`; con tokens dos aparatos son la misma identidad [M04 §4.2] |
| `Venta` / `Proyecto (id)` (almacén) | `Venta` = `folio_hoja`; `Proyecto (id)` = id LOCAL del teléfono que lo emitió [M03] |
| `Cuenta ` y `Precio Neto ` | Nombres de propiedad del puente CON espacio final; los encabezados de la hoja son `Cuenta` y `Precio neto`; en SQL `cuenta`, `precio_neto` [M02 §0, §6.21] |
| `Fecha Anticipo e Instalacion` | Nombre heredado: guarda solo la fecha del ANTICIPO (col. L); la instalación es `Fecha instalacion` (M) [M02 §1] |
| `Cuándo` | «Autorizaciones» `Cuándo (ISO)` = texto ISO (se firma); «Solicitudes» `Cuándo` = Date; «Almacén» `Cuándo` = derivado de `ts`, solo se escribe [M03, M04] |
| `ts` | `entry.ts` (ms de la autorización) != `sello.ts` (texto ISO de la hoja, se firma) != `movimiento.ts` (sello del libro) != `op.ts` (orden de la bandeja) [M07, M04, M03, M06] |

## 4. Mapas contra el plan: contradicciones consolidadas

Cada punto cita quién lo vio (`[M0x]`) y lo que yo re-verifiqué (`[V]`).

### A. Modelo y dinero

- **C-01 `ventas_dinero` con `estatus`/`iva`** (plan §3.1, §4.3, §4.7). Fabricación RECIBE `Estatus`, `IVA` y `Fecha Anticipo e Instalacion` (no están en `CAMPOS_DE_DINERO`, `.gs:2147-2153`) y el taller usa `estatus_notion` (`js/datos/carpetas.js:130-133`). Meterlos en una tabla solo para Dirección y Pagos rompe «Faltan datos» y las marcas de Drive. [M01 §12.2, M02, M09 §9.1]
- **C-02 Ventas históricas sin proyecto** (plan §3.1 «`ventas_hoja` no se migra»; §4.5 habla de `ventas`; §4.7 no la define). Hay >=199 filas (214 en septiembre) sin cotización ni proyecto que Control suma (`js/datos/ventas.js:137-237`, `js/datos/puente.js:1878-1886`). `ventas_dinero.proyecto_id` no puede ser obligatorio; hace falta tabla `ventas` (libro) o proyectos con bandera. [M02 §6.20, M05 §7, M09 §8-9]
- **C-03 El dinero no está solo en `ventas_dinero`**: `proyectos.origen` (`precioAuth`, `neto`, `sub`, `anti`, `itemsAuth`, `_lt`, `pu`), `proyecto.precio_auth`, `bitacora.antes/despues` (cuenta, anticipo, `proyectos.js:1076-1085`), `solicitudes.cotizacion` (partidas con precio), `cotizaciones`, costos de almacén (`costo_total`, `costo_compra`) y el contexto del asistente. Fabricación necesita `origen` SIN precios para la orden de trabajo (`js/mod/proyectos.js:2638-2716`). [M09 §1.3, §6.5, §10.1; M06 §13.8; M03 H2] + [V] N-02
- **C-04 Pagos «capturan solo en la plataforma… tiene las mismas acciones»** (plan §1, §10). No existe captura de `Liquidacion`, `Fecha Liquidacion`, `Abono Comision`, reparto FIFO, «Registrar un cobro» ni corrección de anticipo/subtotal/nombre: `js/datos/puente.js:284-286`; `CAMPOS_ROL.pagos` no incluye `anti_pactado`; `BLOQUEADOS` impide `sub`, `neto`, `iva`, `precio_auth` (`js/datos/proyectos.js:963-995`); solo existen como menús del `.gs` (`.gs:1263-1285`). [V grep `Liquidacion` en `js/`; M02 §5.5, M05 §6, M09 §9.4, M10 §8.9]
- **C-05 `pct_comision`** (plan §3.1, §4.7, §4.10): la hoja calcula comisión = `ROUND(G*10%,2)` fija sobre el SUBTOTAL; AD no se lee (`.gs:181-185`); el cotizador manda siempre 10 (`js/cotizador/venta.js:27,378`). Si la vista usa `pct_comision` no cuadra. [M02 §2.2, §6.6]
- **C-06 «Abonos comisión» y «Comisiones por periodo» son «cálculos»** (plan §3.1): «Abonos comisión» es un LIBRO con tres capturas (puente, formulario, reparto FIFO con ids `P-###`), admite negativos; no hay tabla `abonos` en §4.7. Solo «Comisiones por periodo» es vista. [M02 §3.1-3.2]
- **C-07 «prueba de cuadre = `pruebas/precio-servidor.mjs`»** (plan §4.10): falso; compara el catálogo de precios de la COTIZACIÓN, no H/K/R/T. No existe ninguna prueba que evalúe esas fórmulas. `docs/ARQUITECTURA.md:1346` dice lo contrario del plan («nunca se recalculan aquí»). [M02 §7.1, M10 §3, §8.1]
- **C-08 Reglas de dinero del `.gs` que el plan no nombra**: IVA lo dicta la cuenta (`Elias BBVA` = No, otra = Sí; `normalizarIvaActivos`, `.gs:1057-1067`, corre en CADA `/empujar`); `Liquidacion` es acumulativa; `Abono Comision` al escribir AGREGA un renglón; `Folio cotizacion` no se pisa; `Anticipo`/`Liquidacion` >= 0, subtotal puede ser negativo; `null`/`''` se escriben como 0. [M01 §9, M02 §2.6, §5.4, M05 §8.4]
- **C-09 Vistas por área** (plan §4.2) y vista de fórmulas (§4.10): en Postgres una vista corre con los privilegios de su dueño y se salta RLS; hace falta `security_invoker = true` (PG15+) o no exponerla [W]. Además `numeric` sin escala forzada para G/I/J: `armarCeldas` guarda `Number(valor)` sin redondear (`.gs:3004`) y Pagos/Dirección pueden teclear más de 2 decimales; desde el cotizador G llega con 2 decimales (`desgloseFinal`, `js/cotizador/nucleo.js:1452-1459`), así que los empates de `ROUND(G*10%,2)` son reales (1 de cada 10 subtotales termina en 5 centavos, [V] `scratchpad\cuadre-centavos3.mjs`). [V + M02 §2.4 + M07 §5.1]

### B. Roles y matriz

- **C-10 «Fabricación: etapa hasta Listo»** (plan §4.2): `TOPE_ROL` solo existe en el cliente (`js/datos/proyectos.js:1116`); el servidor deja a Fabricación escribir cualquiera de las 8 etapas (`.gs:2130`, `2992-2994`); `puedeMover` mira solo el DESTINO (Fabricación puede regresar un `instalado`); Dirección puede «resucitar» un `cancelado`. Pasarlo a la base es ENDURECER, no portar. Y hay dos transiciones AUTOMÁTICAS de etapa que el plan no ve [V]: (1) una tarjeta importada cuyo `Estatus` pasa a `COBRANDO`/`LIQUIDADO` se vuelve `instalado` solo de forma local y sin encolar (`js/datos/puente.js:1943-1949,2013-2016`): Pagos «mueve» la etapa de forma indirecta en todos los teléfonos; (2) una instalación `hecha` lleva el proyecto a `instalado` si el rol puede (`js/datos/agenda.js:442-452`; con Fabricación se queda en `listo`). La base debe decidir si ambas reglas son trigger o se pierden. [M01 §12.3, M02, M05 §6, M09 §1.5]
- **C-11 Matriz incompleta**: Fabricación también escribe `notas`, `plazo_k`, `entrecalles`, cita (fecha/hora); Pagos `notas`, `pct_comision`; Pagos LEE el almacén completo con costos y escribe la salida `derivado` y `consumido` (`.gs:5537-5553`); lo escribible por rol en la hoja difiere de lo que permite el cliente. [M09 §9.5, M03 §3]
- **C-12 «Cambiar el rol en Ajustes no da permisos; ya era así»** (plan §4.2): sin pase vigente `Prefs.rol()` devuelve `'direccion'` por omisión (`js/datos/prefs.js:177-178`); la pantalla se comporta como Dirección. Solo es UI; con RLS la UI debe tomar el rol de `miembros`. [M06 §5, M09 §9.12]
- **C-13 Quién crea proyecto**: `ganar` no valida rol y `drenarBuzon` lo ejecuta en CUALQUIER teléfono al arrancar (`js/datos/proyectos.js:667`, `js/datos/cotizador.js:202`); la RPC debe decidir quién puede. [M09 §10.9]

### C. Sellos, sincronización, almacén

- **C-14 «La regla de sellos se conserva tal cual (`obraDeLaFila`)»** (plan §3.3, §4.4): `obraDeLaFila` es solo la mitad que BAJA. La compuerta que SUBE vive en el servidor (`.gs:2881-2917`), la producción de sellos en `sellosDeLaOperacion` (`js/datos/puente.js:473`) y `sellar` (`proyectos.js:534`); el almacén tiene OTRA implementación (`.gs:5643-5743`, `sync.fusionar`). Además `/empujar` no es «transporte»: son ~15 reglas de servidor (validaciones por columna, idempotencia por folio, orden, folio `V-###`). [M05 §9.1, M02 §4, M03 §8.2]
- **C-15 «Se conserva el reintento»** (plan §4.4): `esperaMs` no tiene llamadores [V `js/datos/sync.js:714`, único resultado del grep]; reintento = disparadores (1.5 s, 30 s, `online`); `CONFLICTO` y `esperado` son código muerto; un error NO marcado `definitivo` se reintenta para siempre y, si cae en `SIN_RED`/`DESCONOCIDO`/`ROL_SIN_PERMISO`, detiene toda la cola. [M06 §3.5, M05 §9.2]
- **C-16 `/jalar_almacen` y `/empujar_almacen` «igual, sobre las tablas»** (plan §3.2): hay lógica de escritura (sello por campo, `estado` monótono, campos fijos, signo por tipo de movimiento, permisos por campo de Pagos, `ya_estaba`/`sin_cambio`/`viejos`): RPC o triggers, no CRUD. [M03 §8.1, H3]
- **C-17 Almacén fuera del espejo y de la matriz** (plan §4.5, §4.2): no se dice si las tres pestañas se espejan; costos en filas compartidas (RLS no oculta columnas); la secuencia de Postgres puede hacer visibles filas con número menor tras otro ya visto. [M03 §8.3-4, H2, H4]
- **C-18 «Realtime en lugar del sondeo»** (plan §4.4): la misma vuelta de 30 s corre Drive (`Carpetas.alDia`) y expansión de links de Maps (`js/app.js:2085-2111`); además borra de `ventas_hoja` lo que la hoja ya no trae (`js/datos/sync.js:823-837`): sin tombstones ni `deleted_at` los borrados no se propagan. [M09 §9.8, M05 §10.9] + Realtime no aplica RLS a DELETE [W]

### D. Identidad y acceso

- **C-19 `miembros(usuario_id, …)` vs «Dirección agrega un renglón (correo, área)»** (plan §4.7 vs §4.8): «Accesos» es por CORREO en minúsculas, con fila de ayuda en A4; `auth.users.id` no existe hasta el primer ingreso. Hace falta clave por correo/invitaciones y exigir correo verificado. [M01 §12.9, M04 §5, M08 §2.3]
- **C-20 `acceso_revocado` + borrado local** (plan §4.8): NO existe hoy [V grep: 0 resultados]; hoy una baja tarda hasta 300 s (caché positiva `.gs:2358`), existe una «segunda opinión» porque un tropiezo de red se leía como baja y «costó una sesión cerrada de verdad» ([V] `js/nucleo/puerta.js:376-392`); el borrado debería cubrir DOS IndexedDB (`al3d_pf`, `al3d_cot_imgs`), más de 20 claves de localStorage y cachés del service worker; el «cordón» manual es incompleto (`js/mod/ajustes.js:1709-1756`). [M06 §4.4, M08 §1.7, M05 §5.5]
- **C-21 Login con Google** (plan §4.9 «Cuenta se toma de la sesión»): hoy es `initTokenClient` con ACCESS token (`js/nucleo/ingreso.js:55,234`), no ID token; `signInWithIdToken` pide ID token + nonce y el Client ID en «Authorized Client IDs» [W]; `Ingreso.dentro()` es síncrona; la sesión de supabase-js guarda un refresh token en localStorage; `gcal.js:44` importa `cargarGis` de `ingreso.js`. [M08 §2, M01 §12.10]
- **C-22 Gcal, IA y asistente** (plan §4.9, §4.12): Calendar lo escribe solo Dirección (`js/nucleo/gcal.js:339-341`), con token EN MEMORIA y Client ID por aparato (`al3d_pf_gcal`), no «cada usuario» ni «`gcal_event_id` en `instalaciones`» (siempre `null`: `agenda.js:292`, `puente.js:784`, `fabricacion.js:1529-1535`); las llaves de IA ya no están en el navegador; el contexto del asistente se arma de IndexedDB filtrado en cliente (no «por RLS») y lee `ventas_hoja`; su prompt llama a la hoja «libro mayor» (`js/datos/asistente-contexto.js:306`). [M08 §6-8, M06 §2.2, M09 §2.1]
- **C-23 `/salud` «o se quita»** (plan §3.2): lo usan la puerta (rol/«fuera»), `escribibles`, el estado de llaves de IA (`asistente.js:55`, `ia.js:152`) y la versión. [M01 §12.4, M08 §8.8]
- **C-24 `/carpetas`, `/crear_carpeta` y `espejo` tras la Fase 5**: se retiran tokens y «Accesos» (que hoy autentican esas rutas, `.gs:2216-2264`) y el Web App sigue en «Cualquier usuario»; el texto de la Fase 5 («dos rutas») omite `/crear_carpeta`. Nadie dice cómo se autentican. [M01 §12.6, M08 §8.9, M10 §8.7-8]
- **C-25 Retirar tokens de dispositivo** (plan §4.8, Fase 5): `js/cotizador/venta.js:299-307,318,414` y `notario.js:59-85` escriben a la hoja SOLO con ese token y fuera de la bandeja; el cotizador suelto (`?solo=1`) depende de él. [M06 §0.7, M08 §8.12, M09 §9.11] + [V] `cotizador.html:50-76`

### E. Cotizaciones y sello

- **C-26 `cotizaciones(id, empresa_id, folio, datos, estado, sello, renglones, revocada)`** (plan §4.7): hay N sellos por folio (`vigente`/`superada`/`revocada`), cada uno evidencia firmada; el folio debe ser el GLOBAL con aparato; faltan `disp`, `ts`, `reenviada`, hitos, `huella`, imágenes (4 tipos); `al3d_queue` mezcla pendientes con renglones fantasma `autorizada`+`q:null`; `revocada` no existe en el cliente. [M04 §8.3, M07 §10]
- **C-27 `/autorizar` como RPC** (plan §3.2): la firma depende de `Math.round`, `toFixed`, `String(number)`, `sort()` UTF-16, suma flotante y `JSON.stringify`; no es reproducible bit a bit en plpgsql: Edge Function TS con un solo módulo compartido con `/verificar`. `/verificar` hoy contesta `no_autentica` si falta la clave o la hoja (`.gs:4034`): debe ser error explícito. [M04 §8.2, R1; V]
- **C-28 Secretos** (plan §3.1, §4.12): `FOLIO_MAS_ALTO` no es secreto, es el contador `V-###` (secuencia sembrada por encima del máximo de Ventas, respaldo, bitácora y abonos); faltan 5 propiedades; `revocar` NO rota (solo cambia `Estado`): rotar exige `clave_id` por fila. [M04 §8.1, §8.6, M01 §12.1]
- **C-29 QR ya impresos** (plan §3.1): hay que conservar texto verbatim de `ts`/`huella`/`itemsAuth`/`renglones`, la clave como texto, v1+v2 y las DOS URLs de `verificar.html` (github.io y pages.dev); la página llama a `URL_PUENTE` bajo una CSP que solo permite Google y el service worker la precachea. [M04 §2, §8.4, R3, R4]
- **C-30 «Unir por `Folio cotizacion`»** (plan Fase 2): la llave es `folio@disp`; entradas viejas sin `disp`; almacén se une por `id`; `proyecto_id` local difiere entre teléfonos; `DB.exportar()` NO cubre historial ni `al3d_cot_imgs` (plan §6). [M07 §10.1, §10.4, M03 §8.6, M06]
- **C-31 `blobs`, `bitacora`, `avisos`** (plan §3.1): `blobs` está vacío y sin escritores (imágenes reales en `al3d_cot_imgs` + data URL en `al3d_historial[].aiFile.url` y `al3d_aifile`); `bitacora` no viaja (cada teléfono tiene la suya; `usuario` es texto libre); `avisos` pierde las decisiones humanas. [M06 §13, M09 §9.10]

### F. Infraestructura, documentos y pruebas

- **C-32 «`sw.js` y `_headers` no cambian»** (plan §3.3): cambian `APP_FILES` (115), `APP_VERSION` (94, `sw.js:43`), `NUM` y README, frases «42 módulos»; CSP de `index.html`, `cotizador.html`, `verificar.html`; `pruebas/csp.mjs` no entiende `wss:`. [M08 §3-4, M10 §0]
- **C-33 §8 «Archivos»** omite `js/cotizador/{venta,notario,ia,proceso}.js`, `js/mod/{cotizador,ajustes}.js`, `js/nucleo/asistente.js`, `js/datos/{prefs,cotizador,carpetas,ventas}.js`, `verificar.html`, `README.md`, y las pruebas `publicacion`, `csp`, `publicas`. [M05 §9.5, M08, M10 §8.11]
- **C-34 §4.11 clasificación de pruebas**: el plan nombra 6 archivos; en realidad 6 de node se reescriben, 2 se retiran, 10 se parten y >=9 de navegador se parten o reescriben; 15 leen el `.gs` ([V] §6.3); las 45 de navegador no corren aquí (rutas `/opt/...`); no hay CI. [M10 §0-1b]
- **C-35 «hoja de mentiras para el espejo»** (plan §7): el doble no evalúa ARRAYFORMULA, no tiene HMAC, `LockService` siempre libre y `setNote` es no-op. [M10 §2.4]
- **C-36 §4.6 «un cron semanal evita la pausa»**: «Free projects are paused after 1 week of inactivity» [W]: un cron semanal no deja margen y el plan no dice dónde corre; el «respaldo exportado a Drive» no tiene mecanismo (el Apps Script solo conservaría `espejo` y `carpetas`) ni credencial. Sin respaldos diarios ni PITR en Free [W]. [V + W]
- **C-37 §4.12 reglas 1 y 2**: `.gitignore` solo contiene `__pycache__/` [V `.gitignore:1`]; no existe `.github/` [V]. Ver N-01.
- **C-38 `privacidad.html`** (plan §9.6): ya es falsa o incompleta hoy en 2 puntos (la llave de Google se guarda en localStorage, líneas 101-106; teléfono, ubicación, entrega y notas ya salen a la hoja, líneas 112-115) y la migración la falsea o deja incompleta en al menos 5 más (datos que «se quedan en tu aparato», destinatarios, ruta de la IA, retención, baja de acceso); `pruebas/navegador/publicas.mjs:640` fija 10 secciones. [M10 §6]
- **C-39 `docs/ARQUITECTURA.md`** (plan Fase 0): hay que corregir más que la línea 1364: 1346 (fórmulas), 1370 (login), 139-143, 689-733, 755-788, 1022-1060, 1172-1208. [M10 §4]
- **C-40 §7 y §9 «Docker/`supabase start`»**: no hay `docker`, `supabase` CLI ni Playwright global en esta máquina; el plan ya pide confirmarlo. [M10 §2.2]

## 5. Destinos que faltan (lo que el plan no ubica en ninguna parte)

### 5.1 Pestañas de la hoja (21 en el código `[M01 §11.3]`)

| Pestaña | Plan §3.1 | Hueco |
|---|---|---|
| `Ventas` | `proyectos` + `ventas_dinero` | No cubre ventas históricas ni capacidad 309; columnas fórmula H, K, O:X deben seguir vivas |
| `Abonos comisión` | «vista» | Es libro de datos (A..F), 1999 renglones máx. |
| `Comisiones por periodo` | vista | Correcto; es la única realmente derivada |
| `Almacén`, `Catálogo de material`, `Listas de compra` | tablas de almacén | No dice si se espejan; costos |
| `Autorizaciones`, `Solicitudes de autorización` | `cotizaciones`, `solicitudes` | N filas por folio; firma verbatim |
| `Accesos` | `miembros` | Fila de ayuda en A4; por correo |
| `Revisión Y-AD`, `Ventas (antes de realinear)`, `Ventas (respaldo)` | «no se migran» | `Ventas (respaldo)` siembra `FOLIO_MAS_ALTO` (`.gs:1366-1421`) |
| `Tablero`, `Proyectos en Puerta`, `Vendidos del Mes`, `Ventas del Año`, `Récord de Ventas`, `Cobranza`, `Comisiones`, `Gráficas` | NO MENCIONADAS | Dependen de las columnas fórmula de Ventas; correo semanal `enviarResumen` también (`.gs:1200-1237`) |
| `Bitácora del puente` (oculta, tope 5000) | NO MENCIONADA | Registro de escrituras por rol; útil para detectar teléfonos viejos tras el corte (§7 P-10) |

Memoria de Elías: «no más pestañas en la hoja»: el espejo debe reutilizar estas pestañas, no crear otras.

### 5.2 Propiedades del script

| Propiedad | En el plan | Destino propuesto |
|---|---|---|
| `PUENTE_TOKENS` | sí (se retira F5) | — |
| `SELLO_AUTORIZACION` | sí (Vault) | Vault + copia offline; sin auto-creación |
| `IA_KEYS` | sí | secretos de la Edge Function `ia` |
| `FOLIO_MAS_ALTO` | sí, como secreto | secuencia Postgres (no es secreto) |
| `IA_ROTACION`, `IA_CUOTA_<yyyyMMdd>` | NO | tabla de cuota diaria por persona (día GMT hoy: cambia a las 18:00 de México) |
| `ALMACEN_SECUENCIA` | NO | `identity`/secuencia |
| `PUENTE_Y_AD_ALINEADAS`, `PUENTE_Y_AD_VISTA_PREVIA` | NO | mueren con la realineación |

### 5.3 Rutas del puente

| Ruta | Destino en el plan | Lo que el plan no dice |
|---|---|---|
| `salud`, `esquema` | Edge o se quita | `salud` alimenta puerta, `escribibles`, IA y versión |
| `jalar`, `empujar` | cliente + RLS + Realtime | compuerta de sellos, IVA por cuenta, `V-###`, validaciones, no sobreescribir `Folio cotizacion`, rechazar fórmulas |
| `jalar_almacen`, `empujar_almacen` | «igual» | RPC con sello por campo y estado monótono |
| `solicitar`, `cancelar`, `pendientes`, `estado`, `rechazar`, `revocar` | RPC | identidad por usuario (hoy por rol con tokens); `revocar` sin UI |
| `autorizar` | RPC | no portable a plpgsql: Edge TS |
| `verificar` | Edge pública | cupo en tabla; `no_autentica` solo si no autentica |
| `ia` | Edge | cupo 200/día/persona, rotación, lista blanca de modelos, 15 MB / 100 s |
| `expandir` | Edge `maps` | copiar la LISTA, no la regex (hueco userinfo, [M01 §7]) |
| `carpetas`, `crear_carpeta` | se quedan | autenticación tras retirar tokens y «Accesos» |
| `espejo` | nueva | autenticación, capacidad, triggers a apagar, monitor |
| GET | se retira | — |

### 5.4 Tablas y columnas que el código exige y el §4.7 no tiene

`ventas` (libro, incluye histórico) · `abonos` (ledger con `pago_id`) · `autorizaciones` (N por folio, textos verbatim, `clave_id`) · `contadores` (`V-###`, secuencia de almacén) · `ia_cuota` · `verificar_cupo` (ventanas) · `invitaciones`/correo en `miembros` · `espejo_estado` (cola/reintentos/última sincronización) · `config` (versión de contrato) · `proyectos.sellos` jsonb + sello propio en `instalaciones` (columna que el servidor no re-selle) · `proyectos.origen_dinero` o equivalente · `instalaciones` completas (`estado`, `hora`, `ventana`, `duracion_min`, `notas`) · `movimientos`/`materiales`/`requerimientos` con costos en tabla restringida · `bitacora` con `usuario_id` · soft-delete (`deleted_at`) y `updated_at` indexado.

### 5.5 Campos de dinero fuera de `ventas_dinero`

`precio_auth` (lo que se cobra) · `origen.*` (precios) · `itemsAuth` · `solicitudes.cotizacion` · `cotizaciones.*` (`precioAuth`, `neto`, `sub`, `anti`) · `autorizaciones.total/subCalc/precioAuth` (el total y los importes por renglón sí son públicos vía `/verificar`) · `bitacora.antes/despues` · `fecha_liquidacion` y `fecha_anticipo` (esta última NO es dinero para Fabricación) · costos de almacén.

## 6. Piezas que NINGÚN mapa cubrió (o cubrió a medias), verificadas

### 6.1 Hallazgos nuevos

- **N-01 El repo entero se publica y el `.gitignore` está casi vacío.** [V] `.gitignore:1` solo `__pycache__/`; `_headers:3-5` («Pages sirve el repositorio entero»); el repo es público ([M10 §5]: `puente/DESPLIEGUE.md:402-414`); `pruebas/publicacion.mjs:3-8`: un documento con `{{ secrets.SUPABASE_URL }}` tumbó Pages dos días y cinco despliegues (`.nojekyll` lo evita). El plan crea `supabase/`, `scripts/importar-hoja.*` y, en Fase 2, reportes de conflicto y de cuadre con nombres, teléfonos e importes de clientes; `supabase start` deja `supabase/.temp`, volúmenes y `.env`. Todo lo commiteado queda en `https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/<ruta>` y en pages.dev. Ya hay nombres reales en el repo (`pruebas/carpetas.mjs:21-34`, [M10 §6]). Acción: antes del primer comando, `.gitignore` con `.env*`, `supabase/.temp/`, `supabase/.branches/`, `supabase/functions/**/.env`, `*.dump`, `reportes/`, `respaldos/`; los reportes y volcados se escriben FUERA del árbol; decidir si `supabase/` va en repo privado.
- **N-02 El Cotizador está abierto a los tres roles y el difuminado de precios no es un permiso.** [V] `js/app.js:78` (`roles: ['direccion','fabricacion','pagos']`); el difuminado es de cara al cliente (`js/cotizador/nucleo.js:219-227`); `puedeAutorizar` solo mira Dirección (`notario.js:44`); `/solicitar` acepta cualquier rol [M01 §1]. Hoy cada teléfono solo ve sus cotizaciones y `/estado` entrega solo lo propio o todo a Dirección (`.gs:3877-3902`, [M04 §4.3]). El plan no define el RLS de `cotizaciones`/`solicitudes`. Acción: autor o Dirección (réplica de `/estado` y `/pendientes`) y decisión explícita para Control, `conversion` y la regla A6 (hoy locales por aparato).
- **N-03 Instalaciones duplicadas y UID.** [V] `js/datos/puente.js:771-783`: cada teléfono que aprende una cita de la hoja crea SU instalación con `id` nuevo y `uid_ics = 'inst-'+id+'@al3d.mx'`; `agenda.agendar` solo evita duplicar dentro del mismo teléfono [M09 §2.2]; `gcal.idDeterminista(uid)` deriva el id del evento de Calendar del UID [M08 §7]. Al unir teléfonos habrá N instalaciones por venta con UIDs distintos; elegir mal duplica eventos en calendarios ya sincronizados. El plan solo dice «`uid_ics` y `movida` viajan». Acción: una instalación viva por proyecto (índice único parcial), UID canónico = el del teléfono de Dirección o el de mayor `movida`, el resto `cancelada` sin tocar calendario; reporte.
- **N-04 Constantes de producción incrustadas.** [V] `js/datos/asistente-contexto.js:464` (`HOJA_FINANZAS`, id de la hoja viva) y `:492` botón «Comisiones en la hoja»; `js/datos/carpetas.js:88` (`RAIZ_TRABAJOS`); `js/datos/prefs.js:83-84` (`URL_PUENTE`); `js/nucleo/ingreso.js:84-99` (`CLIENT_ID`, `ORIGENES`). Tras la migración el botón apunta a un espejo de solo lectura. Acción: centralizar en el módulo de configuración que se cree para Supabase.
- **N-05 Retazos y material del anidador.** [V] `anidador-vectores/js/app.js:43-44,442-446` guardan «los sobrantes medidos, con su nombre» (`al3d_anidador_retazos`) y la última hoja (`al3d_anidador_material`); `js/mod/herramientas.js` los referencia. Es un inventario de lámina por aparato que no es el almacén (movimientos/materiales) ni está en el plan. Decidir: dato por aparato (se pierde en un borrado) o parte del almacén.
- **N-06 `publicaciones/`** [V]: sin `fetch` de negocio (solo estáticos propios: `motor.js:171`, `plantillas.js:44,134`, `editor.js:594`); `previo.js:29` lee el pase; el editor guarda `al3d-editor-lista`/`al3d-editor-conjuntos` por aparato (`editor.js:42-59`). No requiere migración.
- **N-07 Catálogo de precios con >=4 copias.** [V] dueño `js/cotizador/catalogo.js`; `js/datos/catalogo-precios.js` GENERADO por `herramientas/extraer-catalogo.sh`; copia `COT_*` en el `.gs` (`.gs:3338-3348`); más la nueva copia TS de `/autorizar` y cualquier vista SQL. Hoy `pruebas/precio-servidor.mjs` vigila solo `.gs`<->cotizador. Acción: el módulo TS entra a esa prueba con las mismas semillas.
- **N-08 Cloudflare.** [V] El Worker `puente-al3d` retirado (`puente/retirado.js`, `puente/wrangler.jsonc`) sigue conectado al repo (`puente/DESPLIEGUE.md:23-31`) y Cloudflare Pages «queda pendiente de anotarlo desde su panel» (`puente/DESPLIEGUE.md:15-18`). Importa: (a) los QR con origen `pages.dev` dependen de que ese despliegue publique la `verificar.html` nueva; (b) añadir `supabase/` al repo puede disparar builds; (c) `_headers` solo lo aplica Cloudflare.
- **N-09 El `.gs` se despliega a mano y el del repo puede ir atrás.** [V] `puente/DESPLIEGUE.md:35-38,86-92` (pegar en el editor, sin `clasp`; «la copia que manda es la de la hoja», línea 89); [M02 §0.1] el repo iba 500 líneas atrás en septiembre. La ruta `espejo` obliga a pegar ~294 KB, publicar versión nueva y subir `PUENTE_VERSION` + `VERSION_ESPERADA` (`pruebas/puente.mjs:342,354`).
- **N-10 Lectores directos del pase.** [V] `js/tema.js:93`, `cotizador.html:73`, `anidador-vectores/index.html:44`, `publicaciones/js/previo.js:29` leen `al3d_pf_pase` `{correo, hasta}` sin módulos; lo escribe `puerta.js:451` desde `/salud`. Con Supabase hay que seguir escribiéndolo con la misma forma o tocar las cuatro.
- **N-11 Superficie síncrona de `Cot.*`.** `js/datos/cotizador.js` lee `al3d_historial`/`al3d_queue` de forma síncrona y lo consumen `mod/proyectos`, `inicio`, `fabricacion`, `tablero`, `control`, `mapa`, `datos/ventas`, `datos/reglas`, `nucleo/asistente` y `app.js` [M07 §6.6]. Mover cotizaciones a la nube vuelve asíncronos 10 módulos o exige una caché local equivalente. El cotizador (iframe, scripts clásicos con manejadores en línea, 22 apariciones de `getHistorial()` [M07 §0]) no puede importar supabase-js: solo habla por `window.AL3D`.
- **N-12 Sin hidratación inicial ni tombstones.** Ni el plan ni los mapas definen cómo un teléfono nuevo baja todo con tope de 1000 filas por petición [W], ni cómo se propagan borrados (`DB.borrar` de proyectos solo en `proyectos.js:1921,2404`; barrido de `ventas_hoja` `sync.js:823-837`). Acción: paginar por cursor (`updated_at,id`) con `range()`; `deleted_at` + purga.
- **N-13 Entregables del plan que aún no existen.** [V] No existen `docs/ESTADO-SUPABASE.md` (citado en el plan, línea 3), `supabase/`, `scripts/`, `.github/`. Sin CI nadie corre pgTAP ni las 55 pruebas.
- **N-14 Espejo sin monitor ni reconciliación.** Plan §4.5: «si falla, la base sigue bien y se reintenta». El correo semanal y 8 pestañas se calculan de la hoja: si el espejo se atrasa envejecen sin aviso; ediciones manuales a filas que no cambian en la base nunca se corrigen; el cuadre diario solo se pide en Fases 3-4 (§5). `alEditar` también asigna folios y sellos a filas tecleadas a mano (`.gs:1073-1179`): una venta tecleada en la hoja después del corte nunca llega a la base. Acción: celda visible «última sincronización» y alarma si pasa de N horas; reconciliación completa periódica e idempotente; apagar `alEditar`/`normalizarIvaActivos`/`ordenarVentas` o hacerlos inocuos.
- **N-15 La copia de la hoja probablemente no es respaldo de secretos ni de disparadores.** [I] El script ligado a la hoja se copia como proyecto nuevo (otro id); es probable que las propiedades (`SELLO_AUTORIZACION`, `IA_KEYS`, `PUENTE_TOKENS`, `FOLIO_MAS_ALTO`) y los disparadores (`alEditar`, `enviarResumen`) no viajen; no hay documentación oficial que lo afirme (búsqueda de hoy sin resultado concluyente): probarlo con una copia desechable antes de llamar «respaldo» a la «copia completa» del plan §6.

### 6.2 Barrido de superficies (confirmado con Grep sobre `js/`, `anidador-vectores/`, `publicaciones/`, HTML y `sw.js`)

- **localStorage/sessionStorage**: no hay ninguna clave distinta de las de [M06 §4] y [M07 §1.1]. Datos de negocio por aparato: `al3d_historial`, `al3d_queue`, `al3d_q`, `al3d_aifile`, `al3d_folio`, `al3d_hitos`, `al3d_canva`, `al3d_cuadernos`, `al3d_pf_ganadas`, `al3d_logo`, `al3d_anidador_retazos`, `al3d_anidador_material`. Identidad/credenciales: `al3d_pf_disp`, `al3d_pf_letra_folio`, `al3d_pf_gtok`, `al3d_pf_ingreso`, `al3d_pf_pase`, `al3d_pf_puente`, `al3d_pf_gcal`, `al3d_pf_nombre`, `al3d_pf_rol`, `al3d_pf_entrada`, `al3d_pf_restaurar`. Caché de Drive: `al3d_pf_carpetas`. Resto: preferencias.
- **IndexedDB**: solo dos bases (`al3d_pf` v3 en `js/datos/db.js:22`; `al3d_cot_imgs` en `js/cotizador/imagenes.js:18`). **Cache Storage**: `al3d-v1` y `al3d-app-94` (`sw.js:43-46`).
- **Lecturas directas de `DB.*` fuera de la capa de datos**: `js/app.js:1536,2087`, `js/nucleo/asistente.js:728` (`ventas_hoja`), `js/mod/control.js:220` (`ventas_hoja`), `js/mod/inicio.js:626`, `js/mod/ajustes.js:1160,1629-1630,1655,1722`, `js/mod/material.js:361`.
- **Red de negocio** (todas las llamadas `fetch` del repo): `js/datos/puente.js:1008` (Apps Script, `google_token`+`token`); `js/cotizador/venta.js:318` (Apps Script, solo token, `/empujar` directo); `js/cotizador/notario.js:74` (Apps Script, solo token); `verificar.html:410` (Apps Script, público); `js/nucleo/gcal.js:348` (Calendar); `js/nucleo/ingreso.js:304` (userinfo de Google) y carga de GIS; `js/datos/geo.js:343` (Nominatim); `js/datos/material.js:448` (`datos/semilla.json`). El resto son estáticos del mismo origen o `data:`/`blob:`; `js/cotizador/ia.js:612` trae una imagen arrastrada (no es negocio).
- **Llamadores del puente**: `Sync.registrar(Puente.desdePrefs())` (`app.js:1901`); `Puente.hablar` desde `js/mod/cotizador.js:362` (que alimenta `window.AL3D.hablar` para `notario.js`/`ia.js`/`proceso.js:2161`), `js/nucleo/asistente.js:55,785`; `puerta.js:445`; `mod/ajustes.js:1409-1481`. No hay otros.
- **Salidas del Apps Script** (grep `UrlFetchApp|MailApp|DriveApp|ScriptApp`): tokeninfo de Google (`.gs:2333`), `expandirLiga_` (`.gs:3172`), proveedores de IA (`.gs:4303`), Drive (`.gs:5818-5910`), correo semanal (`.gs:1236`) y los dos disparadores (`.gs:902-908`). No hay otra dependencia externa.

### 6.3 Pruebas que LEEN el `.gs` (se rompen si se recorta o retira)

`carpetas`, `cot-entrega`, `ingreso`, `notario`, `precio-servidor`, `precios-cliente`, `puente-almacen`, `puente-hoja`, `puente`, `replicas`, `revision-remota`, `verificar-desde-el-papel` (todas `.mjs` en `pruebas/`), `pruebas/comun/hoja-de-mentiras.mjs` (la usa `sincronizacion.mjs`, que es la decimoquinta) y `pruebas/navegador/dos-telefonos.mjs`; más `pruebas/navegador/hoja-de-mentiras.js` que solo lo cita. [V grep + `readFileSync`/`vm`]

## 7. Peligros para producción, por severidad

Formato: disparador, daño, evidencia, puerta de salida (qué debe ser verdad para avanzar).

**P-01 · Pérdida irreversible de datos que solo existen en teléfonos** (crítica; sin vuelta atrás)
- Disparador: borrado local por `acceso_revocado` (plan §4.8) con un falso «fuera»; cutover antes de la subida única; restaurar un respaldo viejo (SUSTITUYE, no fusiona); limpieza de Safari; cuota llena (descarta imágenes de las cotizaciones más viejas).
- Daño: `al3d_historial` (cotizaciones autorizadas, dato «más valioso y más frágil» según el plan), `al3d_queue`, bandeja `pendientes` sin subir, `al3d_cot_imgs`, bitácora y retazos desaparecen sin copia en ningún sitio.
- Evidencia: `js/cotizador/historial.js:21,24-53,1614-1616,1823-1826,1934-1942`; `js/cotizador/imagenes.js:18`; `js/datos/db.js:392-404` (`DB.exportar` no toca localStorage ni `al3d_cot_imgs`); `js/nucleo/puerta.js:376-392` (falso «fuera» real); `js/mod/ajustes.js:1709-1756`; [M07 §9.3, M06 §4.4].
- Puerta: (1) subida única de historial + cola + imágenes + `al3d_pf_disp`/`al3d_folio` con acuse por registro; (2) el borrado por revocación solo corre si la bandeja está vacía y todo tiene acuse, nunca por `sin_red`, lista vacía de RLS o JWT vencido; (3) conservar `al3d_pf_disp`/`al3d_folio` en el borrado.

**P-02 · Sellos de PDF ya entregados dejan de verificar** (crítica; confianza comercial)
- Disparador: clave perdida o regenerada; texto firmado no idéntico (guardar `ts`/`huella`/`itemsAuth`/`renglones` como `timestamptz`/`jsonb`/`numeric`); codificación del HMAC distinta; `no_autentica` por clave ausente; apagar `/verificar` de Apps Script antes de que ambos orígenes sirvan la página nueva.
- Evidencia: `.gs:3657-3665` (`secretoDelSello_(true)` INVENTA una clave nueva si falta); `.gs:4034` (sin clave contesta `no_autentica`); canon `.gs:3635-3646`; [V] `js/cotizador/partidas.js:1875-1882`: el texto por omisión de los renglones lleva `·` y `×` y casi toda descripción trae acentos, así que prácticamente todo sello v2 firma texto NO ASCII; las pruebas simulan Utilities con `createHmac(...,'utf8')` (`pruebas/notario.mjs:90`, [M04 §1.7]) y la documentación de Apps Script no declara la codificación de `computeHmacSha256Signature(String,String)` [W]; ningún vector real en el repo ([M04 §9]); `puente/DESPLIEGUE.md:15-18` y `sw.js:74,216` (precache de `verificar.html`).
- Puerta (antes de Fase 1): exportar 3-5 filas reales de «Autorizaciones» (una v1, una v2 con acentos/`«»`) y la clave por un canal que no sea el chat ni el repo; recalcular con el módulo nuevo y exigir igualdad con la col. N; congelar los vectores de [M04 §1.8] y los reales como regresión; `/verificar` de Apps Script vivo hasta probar un QR impreso real en github.io y pages.dev.

**P-03 · Errores silenciosos de dinero** (crítica)
- Disparador: vista SQL que difiere de H/K/R/T/S/U; IVA por cuenta no portado; `pct_comision` usado; `double precision` en vez de `numeric`; redondeo de empates; celdas sucias (texto en G/I/J, `Sí` con otra grafía); zona horaria de `current_date` (antigüedad); importar con la API de Sheets formateada.
- Evidencia: `.gs:170-210` (fórmulas), `.gs:1057-1067` (IVA), `.gs:3004` (G sin redondear); [M10 §3(d)] 3277 de 200 000 subtotales con centavos en 5 dan otro centavo entre redondeo binario y decimal; ninguna prueba evalúa las fórmulas (C-07).
- Evidencia propia de redondeo [V, simulación `scratchpad\cuadre-centavos*.mjs`]: con el flujo actual (el autorizador teclea el SUBTOTAL y `conIva` lo convierte, `js/cotizador/nucleo.js:1449`; `desgloseFinal` manda `sub = round2(neto/1.16)`) H = `ROUND(G*1.16,2)` coincide con el total impreso en el 100 % de 17 millones de casos; con un neto que NO sea `round2(S*1.16)` (autorizaciones tecleadas como neto en versiones anteriores [I], o G tecleado a mano) H difiere ±$0.01 en el 13.8 % de los netos redondos (p. ej. $5,000.00 -> G 4,310.34 -> H 4,999.99) y las columnas K/X de la hoja marcarían «Cobrado de más» o «Liquidado con saldo». La base debe reproducir H de la hoja (no el total impreso) y el cuadre debe incluir esos casos.
- Puerta: prueba de cuadre contra valores EXACTOS de la hoja real (leer con Apps Script `getValues()`), por folio, tolerancia 0.004, incluyendo centavos en 5, netos que no son `round2(S*1.16)`, ventas con descuento, negativos, LIQUIDADO con saldo y filas sin fecha de anticipo.

**P-04 · Pagos sin herramienta y la hoja apagada** (alta; ocurre por el orden de fases)
- Disparador: Fase 3/4 declara la hoja «solo lectura» sin pantallas de cobro/abono/reparto/corrección; o Pagos sigue tecleando en la hoja y el espejo lo pisa; o teléfonos viejos siguen mandando `/empujar`.
- Daño: cobranza detenida o datos de cobro perdidos; la base nunca se entera de lo tecleado en la hoja (el plan solo define base->hoja).
- Evidencia: C-04; `.gs:1263-1285` (menús); plan §5 Fase 3.
- Puerta: o se construyen (con RPC y pruebas) «Registrar un cobro», «Abono», «Reparto FIFO», corrección de anticipo/subtotal y alta de venta, o se define un camino hoja->base para dinero durante Fases 3-4. Nunca declarar la hoja de solo lectura antes.

**P-05 · Datos de clientes publicados por el propio sitio** (alta; barata de evitar)
- Evidencia: N-01 (`.gitignore:1`, `_headers:3-5`).
- Puerta: `.gitignore` y política de «reportes fuera del árbol» antes del primer comando de `supabase`; escaneo de secretos con protección de push activada en el repo.

**P-06 · Dinero visible a Fabricación** (alta)
- Disparador: «vistas por área» sin `security_invoker`; `origen` con precios; `bitacora`; `cotizaciones`; contexto del asistente; eventos Realtime (DELETE no pasa por RLS [W]); `Prefs.veDinero()` es solo interruptor de pantalla.
- Evidencia: C-03, C-09, N-02; `js/mod/proyectos.js:2638-2716` (Fabricación necesita `origen` sin precios).
- Puerta: pgTAP por rol que intente leer cada tabla/vista/canal; partir `origen`; prueba de que ningún objeto expuesto salta RLS.

**P-07 · Acceso y autenticación** (alta)
- Disparador: «fuera» por error transitorio; alta por correo sin `usuario_id`; cualquier cuenta de Google puede crear usuario en Supabase Auth mientras «Allow new users to sign up» esté encendido (si se apaga, «only existing users can sign in» [W], lo que choca con «quien entra con Google ya está dentro»: hay que pre-crear al usuario en cada alta o dejarlo encendido y que RLS niegue por defecto a quien no esté en `miembros`); retiro de tokens que deja sin autenticación a `/carpetas`, `/crear_carpeta`, `espejo` y al cotizador suelto; PWA en iPhone con redirección OAuth; `Ingreso.dentro()` síncrona.
- Evidencia: C-19..C-25; `js/nucleo/puerta.js:376-392`.
- Puerta: decidir A/B/C/D de [M08 §2.2] y probarlo en el aparato real (iOS instalado); definir auth de las rutas que se quedan en Apps Script; `fuera` solo tras consulta exitosa sin fila.

**P-08 · Sincronización pierde reglas que hoy defiende el servidor** (alta)
- Disparador: upsert directo sin compuerta de sellos; el cotizador manda `'Etapa de obra':'Ganado'` SIN sellos y reintenta si ya estaba registrada (`js/cotizador/venta.js:369,414,561-565`): en el `.gs` una op sin `sellos` se sella con la hora de llegada y gana siempre (`.gs:2881-2899`, [V]), así que puede regresar una etapa; sello de la cita roto por `DB.poner` ([V] `db.js:229-230` vs `puente.js:457-462,807`: `sello_hoja_en` nunca iguala a `actualizado_en`); reloj del teléfono decide (tope `ahora+10 min`); `estado` de requerimiento que retrocede; secuencia vs Realtime; tope de 1000 filas [W]; reintento infinito que bloquea la cola.
- Puerta: compuerta en SQL con las pruebas de [M05 §4.7] y [M03 §7]; el cotizador pasa por el mismo transporte con sellos; sello de cita como columna propia sin re-sello; paginación y cursor con solape.

**P-09 · Capacidad y deriva de la hoja espejo** (media-alta; fecha límite real)
- Evidencia: `.gs:9` (`FIN=310`), `.gs:2829-2832` («Ya no hay filas libres»); [V] `puente/README.md:145` (199 filas anteriores a la plataforma) y `js/datos/proyectos.js:378` (214 filas en septiembre): quedaban ~95 libres y se llenan a ritmo no medido (conteo vivo y ritmo NO CONFIRMADOS: §9); todas las ARRAYFORMULA/QUERY llevan `$2:$310`; Abonos 1999; N-14.
- Puerta: decidir ya (subir `FIN` y repasar `mejorarTodo`, o espejar subconjunto); monitor y reconciliación (N-14).

**P-10 · Flota mezclada durante el corte** (media)
- Disparador: teléfonos con service worker viejo (caché primero, `sw.js:367-409`; se actualizan al abrir la app y como mucho cada 10 min con la app visible, `js/app.js:2182-2242`) siguen escribiendo `/empujar` a la hoja o encolando fotos viejas; `iOS` sin abrir semanas.
- Daño: escrituras que el espejo luego pisa; ops que quedan `rechazada`/atascadas al retirar rutas (`js/datos/sync.js:647`).
- Puerta: `APP_VERSION` + CSP + banner; vigilar «Bitácora del puente» tras el corte; antes de retirar `/empujar` responder un código que el cliente viejo trate como «actualiza la app».

**P-11 · Identidad de datos al unir teléfonos** (media)
- Instalaciones/UID (N-03); proyectos duplicados (`proy-hoja-V-###` + proyecto del cotizador); `proyecto_id` local en movimientos/requerimientos (H1/H6/H7 de M03); folios `COT-` repetidos entre aparatos y tras perder `al3d_folio`; `Y = V-nnn` histórico en `Folio cotizacion` (`proyectos.js` [M09 §4]).
- Puerta: tabla de remapeo de ids, reporte de conflictos revisado a mano y fuera del repo, cuadre por (folio_hoja, material) del libro de almacén.

**P-12 · Plan gratuito y continuidad** (media)
- Pausa por inactividad de una semana y sin backups ni PITR [W]; cron semanal sin margen (C-36); respaldo a Drive sin mecanismo; `/verificar` público contra 500 000 invocaciones/mes [W]; Edge Functions: CPU 2 s por petición (excluye E/S), 150 s de pared en Free, memoria 256 MB; el límite de tamaño de cuerpo NO figura en la página de límites [W] (la ruta `ia` acepta hasta 15 MB y espera 100 s); Realtime 200 conexiones.
- Puerta: ping externo cada 2-3 días; respaldo semanal con mecanismo y credencial definidos; prueba real de `ia` con una imagen de 1600 px; límite por IP en `verificar`.

**P-13 · Ceguera de pruebas** (media)
- Las 45 pruebas de navegador no corren en Windows; no hay CI; 15 archivos leen el `.gs`; la suite de node tarda ~4 min aquí; `publicacion.mjs`, `csp.mjs` y `publicas.mjs` fallan por números/hosts/secciones al tocar README, `sw.js` o HTML públicos [M10].
- Puerta: CI mínimo (node) antes de Fase 1; clasificar y portar pruebas con el criterio de [M10 §1] antes de borrar código.

## 8. Huecos de secuencia del plan y puertas propuestas

| Fase | Lo que falta para poder avanzar |
|---|---|
| 0 (decisiones) | Respuestas a Q-01..Q-08; vectores de sello (P-02); bajar y diferenciar el `.gs` vivo (N-09); `.gitignore` (N-01); decisión de privacidad para clientes antes de la Fase 2 (plan §9.6) |
| 1 (base y acceso) | RLS de `cotizaciones`/`solicitudes`; vistas `security_invoker`; pgTAP por rol incluyendo Realtime y Storage; `max_rows`/paginación; Auth elegido y probado en iOS; CSP y service worker planificados (`wss:` en `csp.mjs`); tablas de §5.4; CI |
| 2 (importar) | Subida única DENTRO de la app (lee `localStorage` e `al3d_cot_imgs`; el respaldo actual no los trae completos); reportes fuera del repo; regla de unión `folio@disp` + `folio_hoja`; remapeo de `proyecto_id`; instalaciones canónicas; importar por letra de columna con `getValues()`; secuencia `V-###` sembrada |
| 3 (doble escritura) | Pantallas de Pagos (o camino hoja->base); compuerta de sellos en SQL; IVA por cuenta; prueba de cuadre con dinero real; diseño del espejo (columnas que escribe, capacidad, triggers a apagar, autenticación, monitor); guardia contra `/empujar` de teléfonos viejos |
| 4 (cambio de lectura) | Cuadre de 7 días sin diferencias; `verificar` nuevo en paralelo con el de Apps Script; adopción de la versión nueva por todos los teléfonos |
| 5 (retiro) | Borrado local por revocación solo con subida completada; auth definida para `carpetas`/`crear_carpeta`/`espejo`; `/verificar` de Apps Script se retira solo después de probar QR reales en ambos orígenes; actualizar README, `puente/*`, `ARQUITECTURA.md`, `privacidad.html` |

## 9. Datos vivos que ningún mapa pudo obtener (solo lectura; pedir autorización por ítem)

Nada de esto está en el repo. Con la sesión de Chrome de Elías se puede LEER sin escribir; las hojas contienen datos personales de clientes (no copiarlos al repo ni al chat) y los VALORES de propiedades secretas no deben pasar por el chat.

| Qué | Dónde mirar | Para qué |
|---|---|---|
| `Código.gs` vivo y su diferencia con `puente/hoja-apps-script.gs`; `appsscript.json` (`runtimeVersion` V8) | Apps Script, Ejecuciones y Configuración del proyecto | `PUENTE_VERSION` real, rutas extra, JSON/Rhino |
| Nombres (no valores) de propiedades del script | Configuración del proyecto | Confirmar las 9 propiedades y detectar otras; ¿se puede leer `SELLO_AUTORIZACION` y cómo se ve? |
| Disparadores instalados y zona horaria de la hoja | Apps Script, Activadores; Archivo > Configuración | `alEditar`, `enviarResumen`; `TODAY()` |
| Filas ocupadas de Ventas y de «Abonos comisión»; fórmulas reales de la fila 2; encabezados A1:AI1 | Hoja | Capacidad 309/1999; X-03; esquema |
| Contenido de «Accesos» (duplicados, mayúsculas, fila de A4) | Hoja | Importación de `miembros` |
| «Autorizaciones»: cuántas filas v1/v2, si hay ediciones a mano, 17 columnas; 3-5 filas de muestra | Hoja | Vectores de sello (P-02) |
| Filas de «Almacén», «Catálogo de material», «Listas de compra» y `ALMACEN_SECUENCIA` | Hoja/Propiedades | Volumen; versión viva |
| Despliegue del Web App: versión, «Ejecutar como», «Quién tiene acceso» | Apps Script > Implementaciones | Autenticación del espejo |
| Cloudflare Pages: proyecto, rama, despliegue automático; estado de «Workers Builds: puente-al3d» | Panel de Cloudflare | Origen `pages.dev` del QR (N-08) |
| Cliente OAuth de Google: orígenes, URIs de redirección, estado de la pantalla de consentimiento | Google Cloud Console | Auth (opciones A/B/C/D) |
| Supabase: organización, proyecto, región, plan | Panel de Supabase | Plan §4.6 y §9 |
| Teléfonos: cuántos, versión de la app, tamaño de `al3d_historial`, bandeja `pendientes`, entradas sin `disp` | Ajustes de cada aparato | Riesgo del plan §10 «cotización solo en un aparato» |

Reglas para usar la sesión de Chrome de Elías (el plan §4.12, regla 5, trata una captura de pantalla con una llave como fuga que obliga a rotar ese mismo día): no abrir ni capturar las pantallas de API keys, Vault, valores de propiedades del script, tokens ni el secreto del cliente OAuth; leer con `read_page`/`find` solo en pantallas sin secretos; cada escritura (crear tablas, pegar el `.gs`, publicar versión, tocar Cloudflare) pide confirmación expresa por acción; ningún dato de clientes se copia al repo ni al chat.

## 10. Verificado hoy en documentación oficial (fuente de los `[W]`)

- Edge Functions: CPU máx. 2 s por petición (excluye E/S asíncrona); duración de pared 150 s en Free y 400 s en planes de pago; tiempo de espera 150 s; memoria 256 MB; tamaño de función 20 MB (CLI) o 5 MB (panel); 100 funciones en Free; la página NO indica límite de tamaño de cuerpo. https://supabase.com/docs/guides/functions/limits
- Plan Free: «Free projects are paused after 1 week of inactivity»; sin copias de seguridad automáticas ni PITR; 500 MB de base, 1 GB de archivos, 5 GB de egress, 50 000 MAU, 500 000 invocaciones de Edge Functions, 200 conexiones Realtime y 2 millones de mensajes; 2 proyectos gratuitos. https://supabase.com/pricing y https://supabase.com/docs/guides/platform/billing-on-supabase
- Data API: tope de 1000 filas por defecto (`api.max_rows`), el servidor lo impone por encima de `.limit()` y trunca sin error; paginar con `range()`. https://supabase.com/docs/reference/python/limit y https://supabase.com/docs/guides/local-development/cli/config
- RLS: «Views bypass RLS by default because they are usually created with the `postgres` user»; en Postgres 15+ usar `security_invoker = true`; habilitar RLS en toda tabla de un esquema expuesto. https://supabase.com/docs/guides/database/postgres/row-level-security
- Realtime (Postgres Changes): «RLS policies are not applied to `DELETE` statements»; autoriza cada evento contra cada suscriptor; procesa en un solo hilo. https://supabase.com/docs/guides/realtime/postgres-changes
- Auth: existe el ajuste «Allow new users to sign up»; apagado, «only existing users can sign in»; la página no dice qué pasa con proveedores OAuth. https://supabase.com/docs/guides/auth/general-configuration
- Google con `signInWithIdToken`: ID token + nonce (hash SHA-256 hex hacia Google, valor crudo hacia Supabase); el Client ID web va en «Authorized Client IDs» del proveedor Google. https://supabase.com/docs/guides/auth/social-login/auth-google y https://supabase.com/docs/reference/javascript/auth-signinwithidtoken
- Apps Script: `Utilities.computeHmacSha256Signature(value, key)` con `String` no documenta codificación; solo la sobrecarga de tres argumentos recibe juego de caracteres. https://developers.google.com/apps-script/reference/utilities/utilities

## 11. Preguntas para Elías (bloquean diseño, en orden)

- **Q-01 Pagos**: ¿se construyen en la plataforma «Registrar un cobro», «Abono de comisión», «Reparto FIFO», corrección de anticipo/subtotal y alta de venta (con RPC), o Pagos sigue tecleando en la hoja y se necesita sincronía hoja->base durante Fases 3-4?
- **Q-02 Cotizaciones**: ¿quién lee `cotizaciones` y `solicitudes`: autor + Dirección (como `/estado` hoy) o todos? ¿Fabricación y Pagos deben ver precios de cotizaciones ajenas?
- **Q-03 `estatus`, `iva`, `fecha_anticipo`**: ¿siguen visibles para Fabricación (hoy sí)? Entonces van fuera de `ventas_dinero`.
- **Q-04 Ventas históricas**: ¿tabla `ventas` (libro) aparte de `proyectos` para las >=199 filas sin cotización?
- **Q-05 Etapa por rol**: ¿se IMPONE en la base el tope de Fabricación (`listo`) y que solo Dirección cancele/resucite, o se mantiene el servidor permisivo de hoy?
- **Q-06 Sellos**: ¿el servidor sella con `now()` o se confía en el reloj del teléfono (tope `ahora+10 min`)? ¿Se mantiene empate = escribe al subir y empate = gana lo local al bajar?
- **Q-07 Folios de cotización**: ¿contador por aparato (hoy) o secuencia de servidor? ¿Qué pasa con `COT-NNNN` y `COT-NNNN-L` ya impresos?
- **Q-08 Login**: ¿opción A (redirección completa), B (ID token con GIS), C o D? ¿Se acepta probar la PWA instalada en iPhone? ¿Se reutiliza el Client ID de Google existente (cambia orígenes autorizados)?
- **Q-09 `acceso_revocado`**: ¿borrado automático o solo bloqueo + exportación? ¿Qué se hace con la bandeja sin subir?
- **Q-10 Hoja espejo**: ¿se sube `FIN` (y todo `$2:$310`) o se espeja un subconjunto? ¿Qué disparadores se apagan (`alEditar`, `normalizarIvaActivos`, `ordenarVentas`, menús)? ¿Se espejan Almacén/Autorizaciones/Solicitudes? ¿Quién avisa si el espejo falla?
- **Q-11 `/verificar`**: ¿se mantiene la ruta de Apps Script hasta confirmar QR reales en github.io y pages.dev? ¿Se abandona github.io (README:339-346)?
- **Q-12 Auth de lo que se queda en Apps Script** (`carpetas`, `crear_carpeta`, `espejo`): ¿secreto compartido con la Edge Function, token de Supabase o proxy?
- **Q-13 Almacén**: ¿Pagos lee el almacén con costos, sin costos o nada? ¿La salida derivada del corte pasa a servidor?
- **Q-14 Importación**: ¿qué teléfono manda en un conflicto, quién revisa el reporte (fuera del repo), cuál es la fecha de congelamiento?
- **Q-15 Instalaciones/Calendar**: ¿qué UID gana para una venta con varias instalaciones (el del teléfono de Dirección que creó eventos)?
- **Q-16 Retazos del anidador**: ¿por aparato o parte del almacén?
- **Q-17 Privacidad**: ¿aviso para clientes (LFPDPPP), retención de base y respaldos de Drive, región y proveedor? Antes de la Fase 2.
- **Q-18 Repositorio**: ¿`supabase/` y `scripts/` en este repo público (con `.gitignore` y reportes fuera) o en uno privado?
- **Q-19 IA**: ¿se mantiene el cupo de 200/día por persona (día GMT), la lista blanca de modelos y las URLs `dashscope-intl`?
- **Q-20 Respaldo y continuidad**: ¿qué mecanismo y credencial escriben a Drive; dónde corre el ping contra la pausa (cada <7 días)?
