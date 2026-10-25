# El dinero disponible y las facturas de las ventas fiscales

Lo pidió Elías el 2026-10-25, con la empresa ya en la base (`empresas.modo = 'base'`, [`BASE-MANDA.md`](BASE-MANDA.md)):

> «En el control se debe de ver cuál es el dinero que tengo disponible y que por ende se vaya restando de los gastos que hago. De la
> cuenta de ConstruImagen, cuando depositan, yo no tengo acceso a ese dinero… poder habilitar cuánto dinero ingresa a la cuenta de AL3D
> y cuánto a la de ConstruImagen para tener un registro. También necesito que los pagos que se hacen a las cuentas fiscales, como Tanit,
> ConstruImagen y Mónica, tengan un apartado para ver la constancia de situación fiscal y dos checkbox: la factura por el anticipo y la
> factura por la liquidación del proyecto.»

Lo que decidió: (1) solo **Elias BBVA** cuenta como dinero disponible (Dirección lo puede cambiar); (2) solo resta un gasto pagado **desde**
una cuenta disponible; (3) la constancia de situación fiscal es **del cliente** (por RFC), no del proyecto; (4) **Dirección y Pagos** ven y
suben las constancias y marcan las casillas; Fabricación no ve nada de esto, nunca.

Las cuentas fiscales (las que facturan) son **Constru BNT** (ConstruImagen), **Tatis BNT** (Tanit) y **Moni MPago** (Mónica). Rul HSBC y Elias
BBVA no facturan.

## Dónde se ve

Todo en **Control**, solo con la base mandando y solo para Dirección y Pagos. Con la hoja mandando Control es el de siempre: ni las pestañas,
ni la tarjeta del Resumen, ni un archivo nuevo descargado.

| Dónde | Qué |
|---|---|
| **Resumen**, arriba | «Disponible · octubre de 2026»: lo que entró este mes a las cuentas de AL3D menos los gastos que salieron de ellas, con una frase («entró $X a Elias BBVA y salieron $Y en N gastos») y la puerta a la pestaña Cuentas |
| **Cuentas** (pestaña nueva) | El disponible del periodo (este mes, 3 meses, 12 meses, todo); **«De AL3D · dinero disponible»**, cada cuenta con lo que entró (anticipos y liquidaciones), lo que salió y lo que queda; **«Otras cuentas · no son de AL3D»**, ConstruImagen, Mónica, Tanit y Rul con lo que entró; las notas de lo que no cuenta; y, para Dirección, las casillas de **qué cuentas son dinero disponible** («Guardar» pregunta antes). Pagos ve la lista sin poder cambiarla |
| **Facturas** (pestaña nueva) | Las ventas de las cuentas fiscales: «Pendientes de factura» (la de entrada), «Todas» y «Clientes», con el periodo y un buscador. Cada venta enseña su cliente fiscal (RFC y razón social), si su constancia está («Ver», una URL firmada de cinco minutos) o falta, y las dos casillas, **«Factura del anticipo»** y **«Factura de la liquidación»**, con quién y cuándo se marcaron. Marcar no pregunta; desmarcar sí. El panel del cliente asigna o cambia el RFC (los que ya existen, a la mano), da de alta uno nuevo con su razón social, lo quita, y sube la constancia (PDF o foto, hasta 5 MB) |
| **Gastos → Registrar gasto** | «Cuenta de la que salió» con los mismos nombres que la cuenta de cobro de una venta; con la base mandando cada opción dice si es «disponible», y una nota dice que un gasto de esas cuentas se resta del disponible (en efectivo o de otra cuenta, no) |

## Cómo se cuenta (js/datos/dinero-cuentas.js, pura y con pruebas)

- Lo que **entró** a una cuenta es lo que la base dice que se depositó en ella: el **anticipo** y la **liquidación** de cada venta que cobra
  ahí. Es lo mismo que Control llama «ya cobrado» (vendido menos saldo), contado depósito por depósito: una venta LIQUIDADA con depósitos de
  menos cuenta lo depositado, no su total.
- Cada depósito cae en el periodo de **su** fecha: el anticipo en la del anticipo (la de la venta) y la liquidación en la de la liquidación.
  Los periodos son los de siempre de Control (desde el día 1 del primer mes). La liquidación es **acumulativa** en la base (una cifra y la fecha
  del último cobro): si se cobró en dos partes, cae entera en el mes de la última. Una liquidación **sin fecha** solo cuenta en «Todo», y la
  pantalla dice cuántas son.
- Lo que **salió** son los gastos no anulados cuya cuenta es esa (un gasto tecleado a mano en la hoja con «elias bbva» también es de Elias BBVA).
  Un gasto en efectivo o sin cuenta no resta de ninguna; se dice aparte.
- **Disponible** = lo que entró a las cuentas disponibles − lo que salió de ellas, en el periodo.
- No cuentan: una venta **cancelada** (como en todo Control), y una venta que **solo está en este teléfono** (todavía no llega a la base: su
  anticipo es el pactado en la cotización, no uno registrado). Las dos se dicen.

**No es el saldo del banco.** Los gastos de antes de que se empezaran a capturar no están (hoy son 0 en la base), así que «Todo» sumaría años
de depósitos contra los gastos de unos días. Por eso la pestaña arranca en «Este mes» y la letra chica lo dice.

## La base (`supabase/migrations/0027_dinero_y_facturas.sql`)

| Tabla | Qué guarda | Quién la lee |
|---|---|---|
| `ajustes_dinero` | Un renglón por empresa con las **cuentas disponibles** (nace con `['Elias BBVA']`) y quién la cambió | Dirección y Pagos |
| `clientes_fiscales` | Un renglón por RFC (por empresa): la razón social y la constancia (ruta en el bucket, tipo, peso, quién y cuándo) | Dirección y Pagos |
| `ventas_fiscales` | Un renglón por venta fiscal tocada: a qué RFC se factura y las dos casillas, cada una con quién y cuándo | Dirección y Pagos |

Por qué no `constantes` (0005) para las cuentas disponibles: guarda números, la leen los tres roles y `constante_guardar` la escriben
Dirección y **Fabricación**. Tampoco una columna en `empresas`, que la leen los tres roles entera. Y por qué `ventas_fiscales` va aparte de
`ventas_dinero`: la copia de cada 3 horas escribe `ventas_dinero` con lo de la hoja y no conoce esta tabla, así que nunca la pisa.

Las cinco funciones (todas SECURITY DEFINER con el preámbulo de siempre, **idempotentes por `op_id`** y con una línea de nivel **dinero** en la
bitácora por lo que sí escribieron; la bitácora aprende la entidad `cliente`):

| Función | Quién | Qué |
|---|---|---|
| `cuentas_disponibles_guardar` | **solo Dirección** | La lista de cuentas disponibles (una o más de las cinco) |
| `cliente_fiscal_guardar` | Dirección y Pagos | Alta de un RFC o cambio de su razón social |
| `venta_cliente_fiscal` | Dirección y Pagos | Liga una venta **fiscal** a un RFC (y lo da de alta en el mismo viaje si es nuevo) o se lo quita |
| `venta_factura_marcar` | Dirección y Pagos | Marca (solo en una venta fiscal) o desmarca (siempre) una de las dos casillas |
| `constancia_registrar` | Dirección y Pagos | Después de subir el archivo, dice que es la constancia del RFC (la ruta tiene que ser la de ese RFC y su extensión la de su tipo) |

El RFC se guarda limpio (mayúsculas, sin espacios ni guiones) y con la forma del SAT: 3 letras (persona moral) o 4 (física), la fecha AAMMDD
que exista y la homoclave; los genéricos (`XAXX010101000`, `XEXX010101000`) no. No se recalcula el dígito verificador. Las mismas reglas en el
teléfono (`js/datos/facturas.js`) y en la base.

Las constancias viven en el bucket **privado** `constancias-fiscales` (`supabase/opcional/constancias.sql`): 5 MB, solo PDF, JPG, PNG y WebP.
Leer y subir, Dirección y Pagos de esa empresa (subir, solo en la carpeta de un RFC que ya es cliente fiscal, con la forma
`<empresa>/<RFC>/csf-<id>.<ext>`); cambiar y borrar, solo Dirección; Fabricación y `anon`, nada. Reemplazar es subir otra: la de antes se queda
en el bucket.

**Sin Realtime**: la pestaña de facturas lee la base al abrir, al volver, después de cada toque y cuando el enchufe avisa que cambió el dinero.
Así la lista cerrada de la auditoría sigue en 14.

## Pruebas

| Qué | Dónde |
|---|---|
| La base: quién, qué acepta, idempotencia, bitácora, RLS por rol (Fabricación cero filas), los CHECK, que la copia de cada 3 horas no toca nada de esto, las auditorías de antes que se vuelven a correr | `supabase/tests/dinero/cuentas.mjs` (DC-01 a DC-05), `supabase/tests/dinero/facturas.mjs` (FI-01 a FI-10) |
| Las políticas del bucket (sobre el sustituto de `storage`) | `supabase/tests/dinero/constancias-storage.mjs` (CS-01 a CS-04) |
| La prueba de humo en el proyecto real: F01–F08 (0027) y G01–G05 (las constancias) | `supabase/opcional/prueba-de-humo.sql`; en PGlite, `supabase/tests/humo/prueba-de-humo.mjs` |
| La aritmética, los periodos, lo que no cuenta, la lista de cuentas, Control con la hoja mandando | `pruebas/dinero-cuentas.mjs` |
| El RFC, el archivo, la lista y sus filtros, los planes, las respuestas, la subida y la pantalla | `pruebas/facturas.mjs` |

## Para que surta efecto en producción

1. Fusionar el PR.
2. En `al3d-pruebas`: pegar **`supabase/migrations/0027_dinero_y_facturas.sql`** entero en el Editor SQL (termina con la auditoría: si sale
   «AUDITORIA DE SEGURIDAD (0027)…», no se aplicó nada y el mensaje dice por qué); después **`supabase/opcional/constancias.sql`** entero (termina
   con su propia comprobación); después **`supabase/opcional/prueba-de-humo.sql`**: verde con **94** casos (con `storage.sql` y `constancias.sql`).
3. Lo mismo en `al3d-produccion`.
4. **La función `importar-diario` otra vez** (el respaldo semanal ahora incluye las tres tablas nuevas): Edge Functions → `importar-diario` →
   *Code*, pegar entero `supabase/functions/importar-diario/desplegar/index.ts` → *Deploy*. Los secretos no cambian. Sin pegarla, el respaldo
   de los domingos sigue funcionando pero sin esas tres tablas.
5. Publicar la app (`sw.js` 152).

No hay que tocar el Apps Script ni ninguna otra función.

## Lo que no hace (dicho, para que nadie lo dé por hecho)

- **No es el saldo del banco** (arriba). Si un día se quiere, haría falta un saldo inicial por cuenta.
- La liquidación cobrada en partes cae entera en el mes de su último cobro (así la guarda la base).
- No genera facturas ni habla con el SAT: las casillas dicen que alguien ya la hizo. No se recalcula el dígito verificador del RFC.
- No hay una casilla por cada abono de la liquidación: una por la liquidación de la venta, como lo pidió Elías.
- Las ventas fiscales de antes (hoy unas 105, casi todas de Constru BNT) salen como pendientes en «Todo» hasta que alguien marque sus casillas.
  La vista arranca en «3 meses».
- Nada de esto se probó en un navegador ni contra `al3d-produccion`: falta la prueba en el iPhone (sobre todo «Ver» la constancia, que abre una
  ventana nueva, y subir una foto desde la cámara).
