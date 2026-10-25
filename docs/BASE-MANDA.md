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
| 3 | Gastos: `gasto_registrar` y `gasto_anular` (con `op_id`), la tabla a Realtime | hecho, sin publicar (abajo) |
| 4 | Cotizador: los precios de la base (y su copia en la hoja, que sigue sellando), el historial y sus imágenes a la base y de vuelta a todos los teléfonos, el V-### de la base en el recibo de «Registrar venta». Las solicitudes y el sello se quedan en la hoja (Elías, 2026-10-25) | hecho, sin publicar (abajo) |
| 5 | Pagos: las pantallas de cobros y abonos encendidas en modo base; venta sin cotización (`alta_venta`) | |
| 6 | El sello de los QR | decidido por Elías el 2026-10-25: se queda en el Apps Script (con `/solicitar`, `/autorizar`, `/verificar` y compañía, la IA, Maps y Drive) |
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

## Paso 3: los gastos (hecho, sin publicar)

Va después del paso 2 (PR #169). Hasta aquí, con la base mandando, un gasto capturado en Control se quedaba apartado en el teléfono («la base
todavía no los guarda»). Ahora va a la base, y los que se quedaron esperando salen solos en el siguiente bombeo, una sola vez.

| Pieza | Dónde | Prueba |
|---|---|---|
| **Las dos funciones**, con la regla de `/empujar_gastos` del Apps Script: `gasto_registrar` (el mismo id no entra dos veces: «ya estaba»; si trae la anulación y la base no la tiene, anula y nada más) y `gasto_anular` (lo repetido es «ya estaba»; sin su alta, y con el gasto entero en la operación, lo da de alta ya anulado). Validan como `gastoValidar_` (el día, el concepto, la categoría de la lista, el monto mayor que cero y hasta diez millones, la cuenta de las cinco o vacía, el folio); «Subió» es el correo de Google, no lo que diga el teléfono; una lápida no se revive | `supabase/migrations/0025_gastos.sql` | `supabase/tests/gastos/rpc.mjs` (GA-06 a GA-11) |
| **Quién**: Dirección y Pagos registran y anulan (cualquier gasto de su empresa, como en la hoja); Fabricación recibe `ROL_SIN_PERMISO` definitivo, y su teléfono ni lo intenta. Lo que ve cada área no cambia (la RLS de `0020`): Fabricación, ni una fila | `0025`, `supa-relevo.js` | GA-06, GA-11; RE-05; «Fabricación sin dinero» |
| **Idempotentes por `op_id`**: el id de la operación de la bandeja se guarda en la línea de la bitácora (`gasto:<op>`, `anulo:<op>`) con la respuesta, y el reintento contesta lo mismo. Y por el id del gasto: un gasto que se vuelve a encolar no se duplica | `0025` | GA-08; «el reintento… no lo duplica» |
| **La bitácora**: una línea de nivel dinero por lo que sí se escribió; la tabla aprende la entidad `gasto` | `0025` | GA-10 |
| **Realtime**: `gastos` a `supabase_realtime` (identidad DEFAULT); la lista cerrada de la auditoría pasa a 14 en `0025`. Las auditorías de antes (`0011`, `0019`, `0022`–`0024`) llevan las dos funciones en su lista de cliente y **admiten** `gastos` publicada sin exigirla: volver a correr `0011` sobre una base con `0025` no aborta | `0025` y las cinco de antes | `auditoria.mjs` (38 + 13 funciones, 14 publicadas, la idempotencia de todo), GA-11 |
| **El relevo sube los gastos** con `traducirGasto` (aparte de `traducir`: la sombra sigue sin copiarlos) y marca el gasto como enviado; **baja** de la tabla `gastos` en lugar de `/jalar_gastos` (`crearFuente().gastos`, sin lápidas, solo para quien ve el dinero), con las reglas de siempre: lo que espera en la bandeja no se pisa, lo que la base ya no trae se barre solo si este teléfono lo había visto allá, y una lectura vacía no barre nada. La pantalla de Control no cambia: `gastoDeBase` da la misma forma que `gastoDeHoja` | `js/datos/supa-relevo.js`, `supa-traductor.js`, `supa-vivo.js`, `gastos.js` | `pruebas/supabase-relevo.mjs` («Los gastos»), `pruebas/gastos.mjs`; RE-05 contra la base real |
| **Realtime en el teléfono**: con la base mandando, la suscripción incluye `gastos` (Dirección y Pagos): un gasto de otro teléfono avisa como una venta. Con la hoja mandando, no | `supa-enchufe.js`, `supa-vivo.js` (`tablasDe`) | «Sin doble envío» |
| Con la hoja mandando, **lo de siempre**: el gasto va a la pestaña por `/empujar_gastos` y baja por `/jalar_gastos`; ni una petición a Supabase | — | «Con la hoja mandando» |

**Lo que no entra en el paso 3**: los textos de Control que dicen «la hoja» junto a los gastos («esperan para mandarse a la hoja», «Los gastos
viven en la pestaña “Gastos”»): con la base mandando el gasto va a la base aunque el texto diga la hoja (mismo pendiente que los textos del paso
2). Y `gastos` no está en el espejo a la hoja.

**Para que surta efecto en producción:** (1) fusionar este PR; (2) aplicar `0025` en `al3d-pruebas` y después en `al3d-produccion` (Editor SQL,
el archivo entero; termina con la auditoría) **antes** de publicar la app: la app nueva se suscribe a `gastos` en Realtime con la base mandando;
(3) publicar la app (`sw.js` 146). No hay que volver a pegar ninguna función: ningún archivo de `js/` que vaya en sus paquetes cambió. Mientras
la empresa siga en `'hoja'` nada de esto se usa; los gastos empiezan a ir a la base el día del cambio (paso 7).

## Paso 4: el cotizador (hecho, sin publicar)

Va después del paso 3 (PR #171). Sin migración nueva: todo lo de la base ya existía (`tarifas_leer` y `tarifas_guardar` de `0019`;
`cotizaciones`, `subida_unica` y `cotizacion_guardar` de `0008`/`0021`; el bucket de `storage.sql`). Lo que faltaba era que el cotizador los
usara sin la sombra. Lo que Elías decidió ese mismo día acota el paso: **el sello se queda en el Apps Script** —el notario entero:
`/solicitar`, `/cancelar`, `/rechazar`, `/autorizar`, `/verificar`, `/estado`, `/pendientes`—, y con él la IA, los links de Maps y Drive.

El cotizador (guiones clásicos, en un `<iframe>`) no habla con la red de la base ni carga su librería: le pide a la plataforma por la ventanilla
`AL3D_NUBE` que pone el enchufe (`js/datos/supa-enchufe.js`), como ya hacía con las imágenes. Su CSP sigue sin nombrar a Supabase.

| Pieza | Dónde | Prueba |
|---|---|---|
| **Los precios salen de la base** (`tarifas_leer`): al abrir el cotizador, al abrir «Precios y materiales» y cuando el subtotal no cuadra; la caché del aparato es la misma (`al3d_tarifas`, que también lee la plataforma). A la hoja ni se le pregunta. Sin ventanilla todavía (sin sesión en la base) se queda la de este aparato | `js/cotizador/tarifas.js` (`refrescarTarifas`), `js/nucleo/supa.js` (`tarifasLeer`) | `pruebas/supabase-cotizador.mjs` («Los precios»); `cotizaciones.mjs` CO-05 (PGlite) |
| **Dirección los guarda en la base** (`tarifas_guardar`; Pagos y Fabricación reciben `ROL_SIN_PERMISO`) **y la misma tabla se copia a la pestaña «Tarifas» de la hoja**: el notario recalcula con ella antes de sellar. Si la hoja no contesta, queda pendiente (`al3d_tarifas_espejo`) y se reintenta sola la siguiente vez que el teléfono de Dirección lee los precios; y si al autorizar la hoja dice que no cuadra y la base no cambió, el teléfono de Dirección le pone los de la base y lo dice («vuelve a autorizar») | `tarifas.js` («El espejo de la hoja») | «Los precios» |
| **El historial a la base, solo**: la plataforma lee lo que el cotizador guarda (nunca escribe sus claves) y lo manda. La primera vez que un aparato corre con la base mandando, **todo** su historial (la subida única automática, en lotes de 50, la que antes se corrió a mano); después, solo lo que cambia: al guardar (el evento `storage`), cada minuto con la app a la vista si quedó algo, y a los 15 min de todos modos. Idempotente: lo que la base ya tiene se recuerda por la firma de su contenido (`al3d_sombra`, almacén `cotizaciones`, versión 3), y si se manda dos veces la base contesta «ya estaba». Lo que la base no acepta se aparta con su motivo | `js/datos/supa-cotizaciones.js` (`subir`), `supa-enchufe.js` (`subirCotizaciones`) | «Subir»; CO-01 |
| **Quién gana** cuando la misma cotización cambió en dos teléfonos: la editada al último (`editado`, que el cotizador pone al guardar con la base mandando, solo si algo cambió); en un empate, el teléfono que emitió el folio. Antes de pisar con `cotizacion_guardar` se lee la fila: si la base la tiene más nueva, se espera a que la bajada la traiga. Los hitos (PDF, WhatsApp, venta) se suman | `supa-cotizaciones.js` (`ganaLocal`, `planDeSubida`) | «Lo puro»; CO-02 |
| **El historial de la empresa en cada teléfono**: el cotizador pide lo que cambió en la base (`AL3D_NUBE.cotizaciones(desde)`, una vez al día todo) al abrir, al volver a la app y al abrir el historial o los clientes, y lo junta con el suyo (`mezclar`): sin duplicar, la más nueva gana, conserva la imagen de referencia de aquí, quita lo borrado allá. La escritura es del cotizador, en un solo paso con la lectura: lo que se guardó mientras la red contestaba no se pierde. Una de otro teléfono corregida aquí conserva su aparato (su folio global), y se vende con él | `js/cotizador/historial.js` («El historial de la empresa»), `venta.js` (`dispDeLaCotizacion`) | «El cotizador»; CO-02, CO-04 |
| **Quién ve qué** (la RLS de `cotizaciones`, 0008): Dirección baja las de toda la empresa; Pagos, las suyas; a Fabricación no se le pone `cotizaciones` en la ventanilla (llevan precios): su historial sube (la base se lo deja) y nunca baja. Pagos con una cotización de otra persona (de un respaldo): la base no se la deja subir y no se reintenta | `supa-enchufe.js` (`ponerVentanilla`), `supa-cotizaciones.js` | «Quién ve qué»; CO-03 |
| **Borrar** una cotización del historial con la base mandando la borra en la base (`deleted_at`; la fila y su autorización se quedan) y en los demás teléfonos, pasada la ventana de «Deshacer» (la lápida `al3d_hist_borradas`); el aviso lo dice | `historial.js` (`_histLapida`), `supa-cotizaciones.js` | «Subir»; CO-04 |
| **Las imágenes** de esas cotizaciones suben a Storage después de cada vuelta del historial (Pagos solo puede las de sus cotizaciones ya en la base: por eso van detrás) y bajan por la misma ventanilla, sin la sombra | `supa-enchufe.js` (`subirImagenes`) | «El enchufe»; `pruebas/supabase-imagenes.mjs` |
| **«Registrar venta»**: el recibo dice «esperando su folio de la base…» y, cuando la base le da el V-### (la bandeja de la plataforma lo trae en segundos), «Venta registrada en la base — V-123»; al volver a abrir el modal de una ya vendida, su folio. **«Copiar datos para la hoja» se quita** con la base mandando (y el aviso de «sin espacio» ya no lo ofrece) | `venta.js` (`esperarFolioDeVenta`), `js/mod/cotizador.js` (`AL3D.folioDeVenta`, que lee la base local de la plataforma) | «Registrar venta» |
| **Ajustes → Supabase** dice, para los tres roles, cuántas cotizaciones están en la base, si ya terminó la subida del historial de ese aparato y lo que espera | `js/mod/ajustes.js` (`notaDelCotizador`) | — |
| Con la hoja mandando, **lo de siempre**: ni una pregunta a la ventanilla, ni una clave nueva, ni `editado`, el botón de copiar en su lugar | — | «Con la hoja mandando» (en las cuatro partes) |

**Lo que no entra en el paso 4** (dicho, para que nadie lo dé por hecho):

- **Los borradores** (`al3d_q`, la cotización en pantalla, que se guarda en cada tecla) no se sincronizan. Hacerlo pide su propia tabla
  (`cotizaciones.estado` no admite «borrador»: una migración con RLS, RPC y las listas cerradas de la auditoría), subirlo con pausa (no en cada
  tecla), decidir qué pasa si dos teléfonos abren el mismo borrador a la vez, y una pantalla para «abrir el borrador del otro teléfono». Es
  un paso aparte.
- **La imagen de referencia** con la que se cotizó (`aiFile`: puede ser un PDF y no tiene id) no sube; en otro teléfono la cotización llega
  sin ella. Los planos, renders y propuesta sí.
- La cola de autorización (`al3d_queue`) y las solicitudes: se quedan en la hoja con el notario. Una cotización llega a la base cuando ya
  está en el historial (autorizada). El notario no se tocó: sigue firmando con el folio global de ESTE teléfono, así que reautorizar aquí
  una cotización que vino de otro la sella con el aparato de este (como hoy con un respaldo de otro teléfono); la cotización, su venta y sus
  imágenes siguen con el suyo, y el QR verifica igual (lo comprueba la hoja con el folio del sello).
- Las notas de los cuadernos de cliente (`al3d_cuadernos`) y las vistas de la propuesta (`al3d_canva`) no se sincronizan.
- Las cotizaciones subidas con la base mandando quedan en la base como `retirada` (sin sello de Supabase: el sello es de la hoja, y en modo
  base la copia ya no trae las autorizaciones). No cambia nada de lo que se ve —el PDF, el QR y su verificación siguen en la hoja—, pero es
  lo que habrá que revisar si algún día el sello pasa a Supabase.

**Riesgos que conviene saber:**

- **La pestaña «Tarifas» de la hoja pasa a ser una copia** para el notario. Editarla a mano con la base mandando no sirve: el teléfono cotiza
  con los de la base, y la autorización diría que no cuadra hasta que el teléfono de Dirección le vuelva a poner los de la base (lo hace solo
  en esa misma autorización).
- **Borrar del historial ya no es solo de este teléfono.** Antes era limpiar la lista; con la base mandando es borrar para todos (la base
  la conserva con fecha de borrado y se puede recuperar con SQL).
- **El historial de un teléfono de Dirección crece** con las cotizaciones de toda la empresa, en el `localStorage` del teléfono (de 5 a 10 KB
  por cotización sin imágenes; hoy son 55). Si un día no cabe, `saveHistorial` lo dice («respalda y borra cotizaciones viejas») y la bajada se
  reintenta a la hora. Y lo que la plataforma saca del historial (Control, los clientes, las reglas de «Qué atender») cuenta, en ese teléfono,
  las de toda la empresa: es lo que se pidió, pero las cifras cambian el día del cambio.
- **«La más nueva gana» usa la hora de cada teléfono.** Uno con la hora muy atrasada puede perder una corrección frente a una copia más vieja.
- **Un folio corto, una cotización**: si dos teléfonos tienen la misma letra (Ajustes), una cotización de otro con el mismo folio no entra al
  historial de este (se avisa una vez). Por eso cada teléfono lleva su letra. Y como los folios ocupados por cotizaciones de otros teléfonos
  cuentan para el siguiente número (`foliosOcupados`), el contador de un teléfono de Dirección puede saltarse números; no cambia nada más.

**Para que surta efecto en producción:** (1) fusionar #171 y después este PR; (2) **no hay SQL que aplicar** (lo que este paso usa ya está en
las dos bases: `0019`, `0008`, `0021` y el bucket); `storage.sql` en su versión de Q-02 bis sigue pendiente de volver a aplicar, y solo hace falta
para que Fabricación vea las imágenes de las obras ganadas; (3) publicar la app (`sw.js` 147). No hay que volver a pegar ninguna función
(ningún archivo de `js/` que vaya en sus paquetes cambió) ni tocar el Apps Script (`/guardar_tarifas`, el que recibe la copia de los precios,
está publicado desde el 2026-10-23). Mientras la empresa siga en `'hoja'` nada de esto se usa. El día del cambio (paso 7), en cada teléfono con Supabase encendido y la
sesión de Google en la base, la subida del historial arranca sola; Ajustes → Supabase dice cuándo terminó.

Cómo se regresa en cualquier paso: `modo_cambiar('hoja')`. La hoja sigue completa mientras no se apague la copia. Ojo: el espejo a
la hoja solo lleva Ventas y Abonos; lo que se capture de almacén, gastos o autorizaciones en modo base no vuelve solo a la hoja. Con los gastos,
además: de vuelta en la hoja, la copia de cada 3 horas le pone lápida (`deleted_at`) a los que se capturaron en la base y no están en la
pestaña; no se pierden (siguen en la base), pero dejan de verse hasta que alguien los pase a la hoja.

## Lo que decide Elías

1. ~~El sello de los QR: su clave a Supabase, o `/autorizar` y `/verificar` se quedan en el Apps Script.~~ Decidido el 2026-10-25: se quedan
   en el Apps Script, con todo el notario, la IA y los links de Maps.
2. ~~Las carpetas de Drive~~: se quedan en el Apps Script (decidido el 2026-10-25).
3. Si los borradores de cotización y las imágenes de referencia se sincronizan entre teléfonos (las imágenes de las cotizaciones del historial
   ya se sincronizan desde el paso 4; los borradores y la imagen de referencia, no: ver «Paso 4»).
4. La prueba de la entrada con Google en el iPhone.
5. La fecha del cambio.
