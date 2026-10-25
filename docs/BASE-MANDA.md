# La base manda: todo en Supabase y sincronizado en todos los teléfonos

Elías lo pidió el 2026-10-25: que todo se guarde en Supabase y se vea igual en todos los teléfonos y sesiones, y dejar de
actualizar el puente y los scripts de la hoja. Hoy la hoja es la fuente: la app escribe en ella por el puente (Apps Script) y
Supabase recibe una copia cada 3 horas. La base ya tiene todo (221 de 221 ventas iguales el 2026-10-24) y la app ya sabe leerla
(`js/datos/supa-vivo.js`); lo que falta es que la app **escriba** en la base.

## El interruptor es de la empresa, no del teléfono

`empresas.modo` (`0024_modo.sql`): `'hoja'` (hoy) o `'base'`. Uno para toda la empresa, por dos razones de dinero:

- La copia de cada 3 horas pisa la base con lo de la hoja (`scripts/importador/sql.mjs`: la liquidación, la etapa, el anticipo).
  Un cobro capturado solo en la base se revertiría. En modo `'base'` la copia ya no aplica nada: solo cuadra (`copia.js`).
- Habría dos contadores de V-###: el de la hoja y el de la base.

Cada teléfono lee el modo de `mi_acceso`. Solo Dirección lo cambia (`modo_cambiar`, con línea en la bitácora).

## Los pasos

| Paso | Qué hace | Estado |
|---|---|---|
| 1 | `0024_modo.sql` (el modo, `modo_cambiar`, `mi_acceso` con el modo) y la copia que lo respeta | este PR |
| 2 | El relevo: la app escribe y lee la base cuando el modo es `'base'` (`supa-relevo.js` con la interfaz de `sync`, sacando de la sombra el traductor); la entrada con Google para los 3 roles; la lectura en vivo sin depender de la sombra | siguiente |
| 3 | Gastos: `gasto_registrar` y `gasto_anular` (con `op_id`), la tabla a Realtime | |
| 4 | Cotizador: precios, solicitudes, «Registrar venta» por la plataforma, el historial a la nube | |
| 5 | Pagos: las pantallas de cobros y abonos encendidas en modo base; venta sin cotización (`alta_venta`) | |
| 6 | El sello de los QR (según decida Elías) | |
| 7 | El día del cambio: vaciar colas, última copia con 0 diferencias, `modo_cambiar('base')`, la hoja en solo lectura | |

Cómo se regresa en cualquier paso: `modo_cambiar('hoja')`. La hoja sigue completa mientras no se apague la copia. Ojo: el espejo a
la hoja solo lleva Ventas y Abonos; lo que se capture de almacén, gastos o autorizaciones en modo base no vuelve solo a la hoja.

## Lo que decide Elías

1. El sello de los QR: su clave a Supabase, o `/autorizar` y `/verificar` se quedan en el Apps Script.
2. Las carpetas de Drive: se quedan en el Apps Script (con el respaldo y el espejo, el Apps Script no desaparece del todo).
3. Si los borradores de cotización y las imágenes de referencia se sincronizan entre teléfonos.
4. La prueba de la entrada con Google en el iPhone.
5. La fecha del cambio.
