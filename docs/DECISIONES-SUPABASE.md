# Decisiones de la migración a Supabase

Este documento resuelve las preguntas abiertas que dejó la lectura del código real (informe del crítico,
2026-10-10, Q-01 a Q-20) y fija los principios de diseño. **Cada decisión es el valor por defecto más
conservador y es reversible**: nada de esto cambia el comportamiento de la app mientras el interruptor
`modo` siga en `hoja` (que es como está hoy). Elías las confirma o las cambia al revisar el PR.

Plan origen: [`PLAN-SUPABASE.md`](PLAN-SUPABASE.md). Lo que el plan no decía y el código sí mostró está
marcado «(hallazgo)».

---

## A. Principios de diseño (valen para todo lo que se escriba)

1. **Nace apagado.** Todo el código nuevo se activa solo con `modo` ≠ `hoja` y con URL + llave pública
   configuradas. Con el interruptor en `hoja` la app, el service worker y el puente se comportan **idéntico**
   a hoy. Una prueba lo demuestra.
2. **La hoja sigue siendo la fuente de verdad hasta la fase 4.** Nada de esta rama toca la hoja real, datos
   reales ni producción.
3. **Escribir solo por funciones (RPC).** Las tablas de negocio no dan INSERT/UPDATE/DELETE al rol
   `authenticated`: se escribe con funciones `SECURITY DEFINER` que llevan las reglas dentro (rol por campo,
   compuerta de sellos, validaciones, IVA por cuenta). Leer es por RLS. Así «cambiar el rol en Ajustes no da
   permisos» se cumple en la base, no en la pantalla.
4. **GRANT explícito.** El proyecto de Supabase está configurado con «exponer tablas automáticamente»
   APAGADO y «RLS automático» ENCENDIDO. Cada migración declara sus propios `GRANT`/`REVOKE` y su
   `ENABLE ROW LEVEL SECURITY`. Ninguna función queda ejecutable por `anon`/`PUBLIC` salvo las públicas a
   propósito.
5. **Vistas con `security_invoker = true`** (o no se exponen). Una vista normal se salta RLS.
6. **Sin borrados duros** en tablas de negocio: `deleted_at` (lápida). Realtime no aplica RLS a DELETE.
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
| **Q-01 Pagos** | Se construye en la base lo que Pagos hace hoy en la hoja: `registrar_cobro`, `registrar_abono_comision`, `repartir_abono_fifo`, `corregir_venta` (anticipo/subtotal/nombre/cuenta), `alta_venta`. **Las pantallas de Pagos NO entran en esta rama.** La hoja **no se pasa a solo lectura** hasta que existan las pantallas y el cuadre de 7 días. (hallazgo: la plataforma hoy no tiene captura de liquidación, abonos ni reparto) | Declarar la hoja «solo lectura» antes de que exista la captura detendría la cobranza |
| **Q-02 Cotizaciones y solicitudes** | Las lee el **autor y Dirección** (réplica de `/estado` y `/pendientes`). Fabricación y Pagos solo las suyas. (hallazgo: el Cotizador está abierto a los 3 roles) | Hoy cada teléfono ve solo lo suyo: es un superconjunto de lo actual, nunca más abierto |
| **Q-03 estatus, iva, fecha anticipo** | Siguen **visibles para los 3 roles** (hoy lo son). Viven fuera de `ventas_dinero`. (hallazgo) | Romperlo quita «Faltan datos» y las marcas de Drive del Tablero |
| **Q-04 Ventas históricas** | Las ≥199 filas de la hoja sin proyecto **no se pierden**: existen en la base (ver decisión de tablas en `DISENO.md`). `ventas_dinero.proyecto_id` no puede suponer que hay cotización. (hallazgo) | Control suma todas |
| **Q-05 Etapa por rol** | **Se impone en la base**: Dirección cualquier etapa; Fabricación solo dentro de `ganado…listo` en origen **y** destino; Pagos ninguna; cancelar («No se dio») solo Dirección. Las dos transiciones automáticas (instalación `hecha` → `instalado`; cobrando/liquidado en filas importadas) quedan como reglas de la RPC, no se pierden. (hallazgo: hoy el servidor es permisivo y la regla solo vive en el cliente) | Endurece sin quitar nada que la UI ofrezca |
| **Q-06 Sellos** | Se conserva «gana el cambio más reciente» con el sello **del cliente** (la edición sin señal debe contar con la hora en que se hizo, no la de llegada). La base **acota** el sello a `ahora + 10 min`. Empate: al subir **escribe**; al bajar **gana lo local** (igual que hoy). | Es la regla ya probada |
| **Q-07 Folios** | Contador por aparato como hoy. Se agrega `UNIQUE(empresa, folio_global)` donde no sea vacío. `V-###` sale de una secuencia sembrada por encima del máximo de la hoja. No se cambia ningún `COT-NNNN` ya impreso | No rompe PDF impresos |
| **Q-08 Login** | `signInWithIdToken` con el ID token de Google Identity Services como camino principal; `signInWithOAuth` (redirección) como respaldo. Se reutiliza el Client ID de Google existente. **La prueba en iPhone con la PWA instalada queda como pendiente verificable por Elías** (no se puede probar desde aquí). (hallazgo: hoy es un access token, no un ID token) | Cambia lo mínimo de la puerta |
| **Q-09 Acceso revocado** | Se sigue tu decisión (4.8): el teléfono borra su copia local. Con **tres candados** (hallazgo, un falso «fuera» ya cerró una sesión de verdad): (1) solo ante una respuesta **explícita** de la base (`acceso_revocado`), nunca por falta de señal, lista vacía de RLS ni JWT vencido; (2) solo si la bandeja está vacía y lo local ya tiene acuse; si no, se **bloquea la pantalla** y no se borra; (3) se conservan `al3d_pf_disp` y `al3d_folio`. Todo detrás del interruptor y deshabilitado hasta que exista la subida única | Evita perder datos que solo existen en un teléfono |
| **Q-10 Hoja espejo** | El espejo respeta `FIN` (tope de filas) y avisa `capacidad_agotada`; subir `FIN` es un paso del despliegue, no de esta rama. Espeja **Ventas + Abonos comisión** (de ellas dependen S/T/U y 8 pestañas); Almacén, Autorizaciones y Solicitudes quedan como archivo congelado. En modo espejo `alEditar`/`normalizarIvaActivos`/`ordenarVentas` quedan inocuos. Celda visible «última sincronización». **No se crean pestañas nuevas** | Tu regla: no más pestañas |
| **Q-11 /verificar** | La ruta de Apps Script **se queda viva** hasta probar un QR impreso real en `github.io` **y** `pages.dev`. `verificar.html` llama a la función nueva solo si el interruptor lo indica. (hallazgo: CSP y service worker) | Un PDF impreso que deja de verificar no tiene arreglo |
| **Q-12 Auth de lo que se queda en Apps Script** | `espejo` y `respaldo`: secreto compartido (propiedad del script + secreto de la función), comparación en tiempo constante. `/carpetas` y `/crear_carpeta` **no se tocan en esta rama**; su autenticación tras retirar tokens (fase 5) queda como decisión explícita de esa fase | La fase 5 no entra aquí |
| **Q-13 Almacén** | Paridad con hoy: Dirección y Pagos ven costos; Fabricación opera el almacén **sin ver costos** (los costos van en tabla restringida). La salida derivada del corte pasa a RPC | RLS no oculta columnas: se separan |
| **Q-14 Importación** | El script **no decide**: reporta conflictos y cuadre. Los reportes se escriben **fuera del árbol** del repo. Es idempotente y re-ejecutable (la fase 3 lo usa para re-cuadrar) | El repo es público |
| **Q-15 Instalaciones/UID** | Una instalación viva por proyecto (índice único parcial). UID canónico = el de mayor `movida`; las demás quedan `cancelada` sin tocar calendario; todo va al reporte. (hallazgo: unir teléfonos duplica citas) | No duplica eventos ya sincronizados |
| **Q-16 Retazos del anidador** | Por aparato, sin migrar. Queda documentado | Fuera de alcance |
| **Q-17 Privacidad** | Se redacta el cambio de `privacidad.html` con hechos (qué se guarda, dónde, quién lo ve, cómo se baja un acceso). **Es borrador para tu revisión**; no es asesoría legal | El plan pide actualizarlo antes de la fase 2 |
| **Q-18 Repositorio** | `supabase/` y `scripts/` van en **este** repo. `.gitignore` y `_headers` (noindex) cubren `.env*`, `supabase/.temp/`, volcados y `reportes/`. Reportes con datos de clientes **nunca** dentro del árbol (el sitio publica todo) | El código no es secreto; los datos sí |
| **Q-19 IA** | Cupo de 200/día por persona se conserva, contado en una tabla (las funciones no guardan estado); el día se cuenta en `America/Mexico_City` (hoy es GMT y cambia a las 18:00). Lista blanca de modelos y URLs igual | Es un cambio menor y documentado |
| **Q-20 Respaldo y pausa** | **Pausa**: un flujo de GitHub Actions programado cada 2 días llama a una función pública `salud` (la pausa es a la semana). **Respaldo**: función `respaldo` (secreto compartido) + función de Apps Script que escribe a Drive; semanal; se enciende después de la fase 4. Sin respaldos propios de Supabase en el plan Free (verificado 2026-10-10) | Un cron semanal no deja margen |

---

## C. Lo que queda para después de esta rama (y por qué)

- **Pantallas de Pagos** (cobro, abono, reparto, corrección): la base ya las soporta; falta la interfaz.
- **Lectura desde la base y Realtime en producción** (fase 4) y **retiro** (fase 5): requieren datos reales,
  una semana de cuadre y tu visto bueno.
- **Prueba de login en iPhone**, **QR impreso real**, **secretos reales** (sello, llaves de IA, secreto del
  espejo, secreto de Google): solo tú puedes.
