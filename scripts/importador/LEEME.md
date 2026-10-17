# El importador de la hoja (fase 2)

Pasa a Supabase lo que hoy vive en la hoja «Finanzas AL3D» y en los teléfonos. **Solo lee:** no escribe en la hoja ni se
conecta a ninguna base. Deja cinco archivos en una carpeta **fuera del repositorio** (si le das una adentro, se niega:
el repositorio es público y los reportes llevan datos de clientes).

| Archivo | Para qué |
|---|---|
| `reporte.md` | Para leerse: qué entraría, qué no y por qué, y los conflictos que hay que decidir a mano |
| `reporte.json` | Lo mismo, completo, con la tabla de remapeo de ids de los teléfonos |
| `ensayo.sql` | La carga entera dentro de una transacción que se deshace sola: dice lo que haría sin escribir nada |
| `importar.sql` | La carga. Idempotente: correrla otra vez con las mismas entradas no cambia nada |
| `cuadre.sql` | La comparación por folio contra la hoja (H, K, R, S, T, X, O, V, W). Vacía = cuadra |

El importador **no decide**: lo que no está claro (un folio repetido, dos copias de un proyecto con datos distintos y el
mismo sello, una venta del teléfono que no está en la hoja) va al reporte y se arregla en la hoja o se decide a mano.

## Cómo se usa (cuando toque, con datos reales)

1. **La copia.** Elías hace la copia completa de la hoja (Archivo → Hacer una copia, con fecha en el nombre).
2. **El volcado, en la copia.** En la COPIA: Extensiones → Apps Script → «+» → Secuencia de comandos; se pega
   `puente/volcado-para-importar.gs`, se elige `volcarParaImportar` y se da «Ejecutar». Deja en Drive un
   `al3d-volcado-<fecha>.json`. Se descarga a una carpeta fuera del repositorio.
3. **Los teléfonos.** Cada persona baja su «Respaldo completo» (Ajustes) y lo manda por un canal privado.
4. **Correr el importador** (la clave del sello solo hace falta para importar «Autorizaciones» por aquí; la carga Elías en su
   terminal, nunca en el chat. La copia diaria ya no la necesita: abajo):
   ```
   node scripts/importar-hoja.mjs --volcado <volcado.json> --salida <carpeta fuera del repo> --telefono K7QM=<respaldo.json> …
   ```
   `K7QM=` es el id del aparato (Ajustes lo muestra); si no se pone, se deduce y el reporte lo dice.
5. **Leer `reporte.md`** y arreglar lo que haga falta. Si se arregla algo en la hoja, se vuelve a sacar el volcado.
6. **`ensayo.sql`** en el Editor SQL de Supabase: termina con un error a propósito que empieza con «ENSAYO TERMINADO SIN
   ERRORES» y dice cuántas filas entrarían a cada tabla. No escribe nada.
7. **`importar.sql`**, y después **`cuadre.sql`**: la primera consulta del cuadre tiene que salir vacía.

## La copia diaria (desde el 2026-10-16)

Elías decidió que, mientras el equipo siga capturando en la hoja, la nube se ponga al día **cada madrugada** con este mismo
importador: el Apps Script de la hoja (`puente/copia-diaria.gs`) arma el volcado y se lo manda a la función de Supabase
`importar-diario`, que corre `planear` y `sqlDeImportacion(plan, { externa: true })` (el mismo SQL de `importar.sql`, sin los
`begin`/`commit` de cada lote: la transacción, UNA, la abre la función) y después la primera consulta de `cuadre.sql`
(`sqlDeDiferencias`). Lo anota en `cuadre_diario` (migración `0018`). Sin teléfonos y sin la clave del sello. Si el plan trae
conflictos o filas que no entran, no aplica nada. Cómo se pone en marcha: `supabase/README.md`, «La copia diaria».

**Las autorizaciones sin la clave (desde el 2026-10-17, solo la copia diaria).** La clave del sello no sale de la hoja: el Apps Script
comprueba ahí cada fila de «Autorizaciones» con las funciones de `Código.gs` que usa `/verificar` y manda en el volcado
`autorizaciones_comprobadas = { version: 1, filas: [{ fila, firma_ok, codificacion, canon } | { fila, firma_ok: false, motivo }] }`
(o `sin: 'clave' | 'codigo'`), nunca la clave. `planear` **solo** le cree si quien llama pasa `aceptarVeredictosDeLaHoja: true`, y eso lo
hace únicamente la función `importar-diario`, ya autenticada; `scripts/importar-hoja.mjs` no lo pasa, así que por la línea de comandos
sigue haciendo falta `AL3D_SELLO_CLAVE` (y si está, manda la clave: se recalcula aquí). Con el veredicto, una fila entra si la hoja dijo
`firma_ok: true` y `canonDe` (sello.js) de la fila tal como va a la base es **exactamente** su `canon`; se guarda con la codificación que
dijo la hoja (`ascii-?`). Lo que no entra NO es rechazo ni conflicto (no frena la copia): va a `no_importado` con `filas` y `motivos`
(lista cerrada `MOTIVOS_AUTORIZACION` de `plan.mjs`). Dos vigentes del mismo folio tampoco se deciden ahí: esperan en la hoja.
`docs/DECISIONES-SUPABASE.md`, «Las autorizaciones en la copia diaria».

## Cuándo se puede volver a correr

Las veces que haga falta **mientras la hoja sea la fuente** (hasta la fase 4): cada corrida deja la base como dice la hoja, así
que lo que alguien haya cambiado en la base desde la plataforma se pisa. Una venta que en la base ya es **viva** y que la hoja
haría histórica (pasó de FABRICACION o REPARANDO a COBRANDO o LIQUIDADO sin folio de cotización) **sigue viva**, con su estatus
y su dinero de la hoja (decidido el 2026-10-16, `docs/DECISIONES-SUPABASE.md`, «Transición», opción a). Lo que la base no deja
cambiar (una venta que pasó de histórica a viva, un abono que ya se importó y en la hoja se corrigió) no se toca: sale como
«conflicto» al final de la corrida, para decidirlo a mano.

## Qué no lleva todavía

- «Solicitudes de autorización» y «Bitácora del puente»: se cuentan en el reporte, no se importan.
- La subida del historial del cotizador desde cada teléfono con sus imágenes es `subida_unica`, dentro de la app (otra pieza).

## Cómo está hecho

- `celdas.mjs` lee las celdas del volcado por letra de columna; `plan.mjs` aplica las reglas de `supabase/DISENO.md`
  §3 y §3.5; `sql.mjs` escribe el SQL. Las reglas de la app (teléfono, ubicación, etapas, plazos, entrega) no se copian:
  se importan de `js/datos/`, y las firmas se comprueban con `supabase/functions/_shared/sello.js`.
- Pruebas: `supabase/tests/sync-e-importacion/importador.mjs` (IM-01 a IM-12 de `DISENO.md` §10.15, con hojas de mentiras); la
  copia diaria y el veredicto de la hoja, en `supabase/tests/sync-e-importacion/importar-diario.mjs` (CD-07) y
  `pruebas/supabase-importar-diario.mjs` (sección 9 bis: `Código.gs` real con una clave FALSA).
