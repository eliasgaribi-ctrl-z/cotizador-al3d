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
| 2 | El relevo: la app escribe y lee la base cuando el modo es `'base'` (`supa-relevo.js` con la interfaz de `sync`, sacando de la sombra el traductor); la entrada con Google para los 3 roles; la lectura en vivo sin depender de la sombra | hecho, sin publicar (abajo) |
| 3 | Gastos: `gasto_registrar` y `gasto_anular` (con `op_id`), la tabla a Realtime | |
| 4 | Cotizador: precios, solicitudes, «Registrar venta» por la plataforma, el historial a la nube | |
| 5 | Pagos: las pantallas de cobros y abonos encendidas en modo base; venta sin cotización (`alta_venta`) | |
| 6 | El sello de los QR (según decida Elías) | |
| 7 | El día del cambio: vaciar colas, última copia con 0 diferencias, `modo_cambiar('base')`, la hoja en solo lectura | |

## Paso 2: el relevo (hecho, sin publicar)

Va después del paso 1 (PR #168, `0024_modo.sql`): sin `0024` aplicada, `mi_acceso` no dice el modo y nada de esto se enciende.

| Pieza | Dónde | Prueba |
|---|---|---|
| **Quién manda en este aparato.** `mi_acceso` dice el modo; el aparato guarda el último que oyó (`al3d_pf_supa_modo`, fuera de `Prefs.CLAVES`) y avisa a la app si cambió (`al3d-modo`), que vuelve a enchufar la bandeja. La base manda aquí solo con el interruptor de Supabase encendido **y** el último modo `'base'`; sin saberlo, la hoja. Sin señal vale lo último que se oyó | `js/nucleo/supa.js` (`laBaseManda`, `guardarModo`); la misma regla, sin cargar nada, en `js/app.js`, `js/nucleo/puerta.js` y `js/cotizador/venta.js` | `pruebas/supabase-relevo.mjs` («La elección»: las cuatro copias contestan lo mismo) |
| **El relevo** (`'base'`): la misma interfaz que el de la hoja. Sube cada operación con el traductor de la sombra, ahora compartido (`js/datos/supa-traductor.js`); el almacén en un viaje (`almacen_aplicar`); lo definitivo se aparta, la red, la sesión o lo que no se entiende paran el bombeo. Baja con `crearFuente` y las reglas de siempre (la fuente de lectura del relevo de la hoja), nunca `/jalar`; sin cuenta activa no lee nada y una lectura vacía no tira un récord lleno. Drive y los links de Maps siguen en el Apps Script | `js/datos/supa-relevo.js` | `pruebas/supabase-relevo.mjs`; `supabase/tests/sync-e-importacion/relevo.mjs` (RE-01 a RE-04, contra la base real en PGlite) |
| **El V-### de una venta nueva** sale de `ganar_proyecto` (el contador de la base) y vuelve al teléfono como el de la hoja: `remoto.id_notion` y `notion_page_id`. El reintento contesta «ya existía» con el mismo folio | `supa-relevo.js` | RE-01; «Cada operación» |
| **El dinero:** lo que el área no escribe (`permisos` de `mi_acceso`) no se manda y se nombra en `rechazadas`, como los `escribibles` de la hoja; un alta desde Fabricación o Pagos se aparta («dala de alta desde el de Dirección»). Fabricación no pide ni una columna de dinero al bajar | `supa-relevo.js` (`porArea`), `supa-vivo.js` | RE-02; «Fabricación sin dinero» |
| **Las ventas de antes del cambio** (la base las conoce como `proy-hoja-V-###`): se encuentran por folio, y su lista de compra va con el id de la base | `supa-traductor.js` (`crearEscritor`), `supa-relevo.js` | RE-04 |
| **Los tres roles entran a Supabase** en Ajustes (la tarjeta ya no es solo de Dirección; personas, pantallas y la sombra siguen siendo de Dirección), con una nota de quién manda | `js/mod/ajustes.js` | `pruebas/supabase-entrada.mjs` |
| **El rol sale de la base** con la base mandando: la puerta pregunta `mi_acceso` (misma persona que la de Google); sin sesión en la base pregunta la hoja, para no dejar a nadie fuera, y la bandeja espera a que entre. «Fuera» lo sigue diciendo solo la hoja; un acceso retirado en la base lo tapa la vigilancia de `supa.js` (dos respuestas explícitas) y el relevo no manda nada de esa cuenta | `js/nucleo/puerta.js` (`preguntarALaBase`) | `pruebas/supabase-entrada.mjs`, `pruebas/puerta.mjs` |
| **La lectura en vivo sin la sombra** con la base mandando (Realtime para saber cuándo bajar) y **la sombra quieta**: ni se engancha, ni bombea su cola, ni cuadra contra la hoja. Una operación no sale dos veces | `js/datos/supa-enchufe.js` (`arrancarBase`) | «Sin doble envío» (la prueba falla si se quita la guarda) |
| **«Registrar venta»** con la base mandando no escribe en la hoja: la venta va por la plataforma (la constancia de `al3d_pf_ganadas` → la bandeja → `ganar_proyecto`) y recibe el V-### de la base en el proyecto | `js/cotizador/venta.js` | «Con la hoja mandando» |
| Con la hoja mandando, **lo de siempre**: ni una petición nueva, ni un `<script>`, ni una base local nueva | — | «Con la hoja mandando»; `pruebas/supabase-sombra.mjs` |

**Lo que no entra en el paso 2** (dicho, para que nadie lo dé por hecho): enseñar el V-### de la base en el recibo del cotizador y quitar
«Copiar datos para la hoja» (paso 4); los gastos, que en modo base se apartan en el teléfono hasta que exista su función (paso 3); las
imágenes de las cotizaciones, que con la base mandando ya no suben (iban con la sombra; paso 4); el notario y la IA, que siguen en el Apps
Script; los textos que todavía dicen «lo manda la hoja» junto al rol y «lo último de la hoja» en el glifo de sincronización.

**Para que surta efecto en producción:** (1) fusionar #168 y luego este PR, aplicar `0024` y publicar la app (`sw.js` 145); no hay que volver
a pegar ninguna función (no se tocó ningún archivo de `js/` que vaya en sus paquetes); (2) en cada teléfono, Ajustes → Supabase → «Encender en
este aparato» y entrar con Google (las 3 de Fabricación y la de Pagos ya están invitadas); (3) el día del cambio (paso 7), Dirección corre
`modo_cambiar('base')` (todavía sin botón). Cada teléfono se entera en su siguiente consulta a la base: al abrir la app o Ajustes, o a los 10
minutos como mucho. Hasta entonces escribe en la hoja: por eso el paso 7 necesita la hoja en solo lectura, para que eso se quede en la bandeja
y salga a la base después.

Cómo se regresa en cualquier paso: `modo_cambiar('hoja')`. La hoja sigue completa mientras no se apague la copia. Ojo: el espejo a
la hoja solo lleva Ventas y Abonos; lo que se capture de almacén, gastos o autorizaciones en modo base no vuelve solo a la hoja.

## Lo que decide Elías

1. El sello de los QR: su clave a Supabase, o `/autorizar` y `/verificar` se quedan en el Apps Script.
2. Las carpetas de Drive: se quedan en el Apps Script (con el respaldo y el espejo, el Apps Script no desaparece del todo).
3. Si los borradores de cotización y las imágenes de referencia se sincronizan entre teléfonos.
4. La prueba de la entrada con Google en el iPhone.
5. La fecha del cambio.
