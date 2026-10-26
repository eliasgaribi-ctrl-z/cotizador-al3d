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
| 5 | Pagos: las pantallas de cobros y abonos encendidas en modo base; venta sin cotización (`alta_venta`); los textos que decían «la hoja» | hecho, sin publicar (abajo) |
| 6 | Lo que Elías decidió del paso 5: la base se niega a dar de alta una venta sin cotización con la hoja mandando (`0026_alta_venta_modo.sql`); «Datos de la venta», para que Dirección corrija una venta; «Repartir un depósito» se queda como está | hecho, sin publicar (abajo) |
| 7 | El día del cambio: vaciar colas, última copia con 0 diferencias, `modo_cambiar('base')`, la hoja en solo lectura | la lista, abajo |

El sello de los QR ya no es un paso: se queda en el Apps Script (decidido por Elías el 2026-10-25), con `/solicitar`, `/autorizar`, `/verificar` y
compañía, la IA, Maps y Drive.

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

## Paso 5: Pagos (hecho, sin publicar)

Va después del paso 4 (PR #172; el paso 3, #171, ya está en `main`). Sin migración nueva: todo lo de la base ya existía (`registrar_cobro`,
`corregir_venta`, `registrar_abono_comision`, `vista_previa_reparto`, `repartir_abono_fifo` y `corregir_abono` de `0007`/`0012`/`0013`;
`alta_venta` de `0006`; `ventas_dinero`, `abonos` y `proyectos` en Realtime desde `0010`). Las pantallas existían desde la segunda entrega
(`js/mod/pagos-supa.js`, docs/supabase/NOTAS-SEGUNDA-ENTREGA-PAGOS.md), como prueba: «lo que registres aquí regístralo también en la hoja». Lo
que faltaba era que, con la base mandando, fueran el lugar donde se cobra.

| Pieza | Dónde | Prueba |
|---|---|---|
| **La pestaña la decide el modo de la empresa**, no un interruptor suyo: con la base mandando, «Cobros y abonos» para Dirección y Pagos (el rol que dice la base); Fabricación no la tiene, y si llegara, la base no le da ni una fila. Con la hoja mandando, «Registrar (Supabase)» como siempre | `js/mod/control.js` (`tabs`, su copia de `laBaseManda`) | `pruebas/pagos-supa.mjs` («Apagado no cambia nada»); `pruebas/supabase-relevo.mjs` («La elección»: cinco copias) |
| **Ya no dice que se registre en la hoja** (está en solo lectura) ni ofrece «Apagar Supabase» (este teléfono volvería a escribir en ella) | `js/mod/pagos-supa.js` | «Con la base mandando» |
| **Cobro, anticipo, liquidación, abono, reparto y corrección** por las funciones de siempre, con el op_id que nace una vez por formulario y se reusa al reintentar: el reintento de un envío sin respuesta no suma dos veces la liquidación (que es acumulativa) ni reparte dos veces | `js/datos/pagos-supa.js` | «Cada formulario…», «El op_id…»; `supabase/tests/pagos/pantalla.mjs` PA-01 a PA-03 (PGlite) |
| **Lo raro se pregunta con el botón de peligro**: un cobro mayor que el saldo (dice por cuánto queda cobrada de más), una venta ya LIQUIDADA, todo reparto (no se deshace: un error es otro renglón, y eso solo lo hace Dirección), una venta nueva con anticipo mayor que el neto | `pagos-supa.js` (`plan`, `peligro`) | «Lo raro se pregunta…»; PA-01 |
| **El reparto que se confirma es el que se vio**: justo antes de preguntar se vuelve a calcular; si otro teléfono abonó en medio, se enseña el nuevo y no se manda nada. El reintento de un reparto incierto no se recalcula: va con el mismo op_id y la base contesta lo de la primera vez | `js/mod/pagos-supa.js` (`repartoAlDia`), `pagos-supa.js` (`mismoReparto`) | «El reparto que se confirma…»; PA-03 |
| **Doble toque**: uno a la vez, también mientras se recalcula el reparto; el botón se apaga; dos confirmaciones no pueden quedar abiertas a la vez (`confirmarPf` cancela la anterior) | `js/mod/pagos-supa.js` | «Doble envío y confirmación» |
| **Montos vacíos, NaN, Infinity, «1e9», tres decimales**: no salen del teléfono; y si salieran, la base tampoco los toma | `pagos-supa.js` (`leerMonto`) | «Montos…»; PA-01 |
| **La venta sin cotización** (el menú «Registrar nueva venta» de la hoja): proyecto, cuenta, estatus, tipos de trabajo, subtotal, anticipo y su fecha, fecha de instalación, teléfono, entrega, dirección y liga de Maps, con las reglas de `alta_venta`. El IVA no se pregunta: lo decide la cuenta, como en la base (la pregunta dice el neto). La base le da el V-### de su contador; el id de la venta sale del op_id del formulario, así que el reintento es la MISMA venta («ya existía», el mismo folio). Con la cita, `propuesta` si la da Pagos y `confirmada` si la da Dirección. Al confirmarse, la app sincroniza y la venta baja a este teléfono | `pagos-supa.js` (`plan('venta')`), `js/mod/pagos-supa.js` (`formVenta`) | «La venta sin cotización»; PA-04 |
| **Quién la da de alta**: Dirección y Pagos (la matriz de `0017`, `alta.alta_venta`, Q-A03); si `mi_acceso` dice que el área no puede, el formulario no sale. **Solo con la base mandando**: con la hoja, el formulario no existe y la capa pura se niega (habría dos contadores de V-###) | `pagos-supa.js` (`formulariosDe`) | «La venta sin cotización» |
| **Fabricación nunca ve dinero**: la pestaña no existe para ella; si la base dice Fabricación, ni se piden las ventas; la base le niega cada llamada como error seguro | — | «Quién ve los formularios», «Con la base mandando»; PA-05 |
| **Realtime: todos los teléfonos ven el saldo nuevo.** El enchufe avisa (`al3d-base-cambio`) cuando la base cambia y la pestaña relee los saldos; si alguien está escribiendo en un campo, espera a que lo suelte (no le mueve el cursor); al volver a la pestaña también relee. El resto de la app ya se enteraba por la bajada de siempre | `js/datos/supa-enchufe.js` (`avisarPantallas`), `js/mod/pagos-supa.js` (`alCambiarLaBase`) | «Con la base mandando»; PA-06 |
| **Los textos que decían «la hoja»** con la base mandando: el candado del rol («lo manda la base», con dónde se cambia: Ajustes → Supabase → Personas), el glifo de sincronización («lo último de la base»), y en Control el récord («Traer de la base»), los gastos (a dónde van, qué pasa al anular, «Falta actualizar el puente» ya no sale) y las comisiones (se abonan en «Cobros y abonos», una por una, con un botón que lleva ahí). Con la hoja mandando, cada frase es la de siempre | `js/datos/quien-manda.js` (nuevo: va aparte de `prefs.js` para no tocar los paquetes de las funciones), `js/mod/ajustes.js`, `js/app.js` (`fraseDeSync`), `js/mod/control.js` | «Los textos que decían “la hoja”»; `pruebas/pf-esqueleto.mjs` |

**Lo que no entra en el paso 5** (dicho, para que nadie lo dé por hecho):

- **El sello de los QR**: se queda en el Apps Script (decidido por Elías el 2026-10-25).
- **Corregir subtotal, nombre, cuenta, estatus o porcentaje de una venta** desde el teléfono (D-5 de la segunda entrega, confirmado por Elías el
  2026-10-16: las correcciones son abonos y liquidación). Una venta sin cotización que quedó mal la corrige Dirección con `corregir_venta`
  (hoy, solo desde el Editor SQL): falta decidir desde qué pantalla. **Resuelto en el paso 6**: «Datos de la venta», en «Cobros y abonos», solo
  Dirección.
- **La venta sin cotización desde otra pantalla** (Proyectos, el Tablero): por ahora vive en Control → «Cobros y abonos».
- Otros textos de Control que dicen «la hoja» y no son de gastos ni comisiones (las explicaciones del Resumen, «Por cobrar» —«según la hoja»—, el
  globo de una venta «de la hoja»): con la base mandando siguen diciendo «la hoja», aunque los números ya son de la base.

**Riesgos que conviene saber:**

- ~~**La base no sabe del modo en `alta_venta`.**~~ La regla «solo con la base mandando» la cumplía solo el teléfono; la base, con la empresa en
  `'hoja'`, aceptaba una alta (y gastaba un V-### que la hoja no conoce). **Cerrado en el paso 6** (`0026`, decidido por Elías el 2026-10-25).
- **«Repartir un depósito» paga TODA comisión pendiente**, de la venta más antigua a la más nueva, esté o no LIQUIDADA la venta (`comisiones_pendientes`
  es `t_restante > 0`); la pestaña Comisiones de Control, en cambio, solo deja pagar las de ventas liquidadas, de la más chica a la más grande. Era
  así desde `0007`; ahora es dinero de verdad. La vista previa dice a qué ventas va antes de preguntar. **Decidido por Elías el 2026-10-25: se
  queda así, a propósito** (no se salta las no liquidadas).
- **Un cobro de más se acepta** (la base lo marca «Cobrado de más»), como en la hoja. La pantalla lo pregunta en rojo, con la cifra.
- **«Cobros y abonos» lee la base en vivo**, no la copia del teléfono: sin señal no hay saldos que enseñar ni asientos que hacer (lo dice). Un
  asiento nunca se queda «en la bandeja»: o la base lo confirmó, o la pantalla dice que no sabe y ofrece reintentar con el mismo op_id.

**Para que surta efecto en producción:** (1) fusionar #172 y después este PR; (2) **no hay SQL que aplicar** (todo está en las dos bases desde
`0006`, `0007`, `0012`, `0013` y `0017`); (3) publicar la app (`sw.js` 148). No hay que volver a pegar ninguna función: ningún archivo de `js/` que
vaya en sus paquetes cambió (`prefs.js` no se tocó a propósito; `pruebas/supabase-pantalla.mjs` y `supabase-importar-diario.mjs` lo comprueban).
Mientras la empresa siga en `'hoja'`, la pestaña sigue siendo la prueba de siempre y nada de lo nuevo se ve.

## Paso 6: lo que decidió Elías del paso 5 (hecho, sin publicar)

Va después del paso 5 (PR #173). Las tres preguntas que dejó abiertas el paso 5, contestadas por Elías el 2026-10-25: la base también se niega a
dar de alta una venta sin cotización con la hoja mandando; Dirección corrige una venta desde una pantalla; el reparto se queda como está.

| Pieza | Dónde | Prueba |
|---|---|---|
| **Con la hoja mandando, la base NO da de alta una venta sin cotización.** Antes solo el teléfono lo cumplía (el formulario no sale); ahora `alta_venta` también se niega con la empresa en `'hoja'`: `DATO_INVALIDO` definitivo («La empresa todavía trabaja con la hoja…»), sin escribir nada ni gastar un V-### del contador de la base. Es `DATO_INVALIDO` porque así se niega la base por el estado de las cosas («No se agenda un proyecto cancelado», `0013`/`0017`) y es definitivo: la bandeja no insiste y la pantalla enseña la frase. No `ROL_SIN_PERMISO` (el área sí puede, y la pantalla diría «es de Dirección y Pagos») ni uno de los de la puerta (pararían el bombeo de la bandeja). El orden: el área primero (Fabricación sigue recibiendo `ROL_SIN_PERMISO`), la validación de siempre, «ya existía» (el reintento de un alta que sí entró con la base mandando dice la verdad aunque ya se haya vuelto a la hoja) y entonces el modo, leído con `FOR SHARE` frente al `FOR UPDATE` de `modo_cambiar`. Ninguna función nueva: las listas cerradas de la auditoría no cambian | `supabase/migrations/0026_alta_venta_modo.sql` | `supabase/tests/acceso/modo.mjs` (MO-05 a MO-07) |
| **La copia de cada 3 horas sigue igual**: no usa `alta_venta` (escribe directo con `service_role`, que ni siquiera puede ejecutarla). Nadie más la llama con la hoja mandando: la sombra y el relevo nunca la traducen. La prueba de humo sí la usaba para sembrar su venta: ahora pone la empresa en `'base'` dentro de su transacción (se deshace sola) y sus casos E01–E02 comprueban la negativa con la hoja mandando | `0026`, `supabase/opcional/prueba-de-humo.sql` | MO-07; `supabase/tests/humo/prueba-de-humo.mjs` (65 y 81 casos; sin `0026`, E01 y E02 en rojo) |
| **«Repartir un depósito» se queda como está**, a propósito: paga TODA comisión pendiente, de la venta más antigua a la más nueva, esté o no LIQUIDADA. No se cambió nada | — | PA-03, sin cambios |
| **«Datos de la venta»**: Dirección corrige el nombre, el subtotal, la cuenta, el estatus, el IVA, la fecha de liquidación o el % pactado de una venta (hasta aquí, solo desde el Editor SQL), en Control → «Cobros y abonos». Sin migración: es `corregir_venta` (`0007`), la que ya usaban el anticipo y la liquidación y, por el relevo, los botones de cuenta y estatus de la ficha. Lo que faltaba era la pantalla | `js/datos/pagos-supa.js` (`plan('datos')`, `correccionAlDia`), `js/mod/pagos-supa.js` (`formDatos`, `datosAlDia`) | `pruebas/pagos-supa.mjs` («Los datos de la venta»); `supabase/tests/pagos/pantalla.mjs` (PA-07) |
| **Solo Dirección y solo con la base mandando.** La base también se lo deja a Pagos (la matriz de `0017`): «solo Dirección» lo cumple la pantalla, como pidió Elías, y Pagos sigue con el anticipo, la liquidación y los botones de cuenta y estatus de siempre. Con la hoja mandando no existe (la copia de cada 3 horas pondría otra vez lo de la hoja). Fabricación no tiene la pestaña ni ve una cifra | `pagos-supa.js` (`puedeCorregirLaVenta`, `formulariosDe`) | «Los datos de la venta»; PA-05 |
| **El dinero**: se manda solo lo que cambió, en valores absolutos (mandarlo dos veces deja lo mismo y no escribe otra línea); la pregunta dice de cuánto a cuánto y cómo quedan el neto, el saldo y la comisión (la aritmética de la base), con el botón de peligro si cambia el dinero, y avisa de un cobro de más, de una comisión pagada de más o de una venta LIQUIDADA con saldo. El IVA lo pone la cuenta; a mano, solo en una venta LIQUIDADA (la regla de la base). Un envío a la vez, el op_id del formulario y su «Reintentar», como en los demás | `pagos-supa.js` | «Los datos de la venta»; PA-07 |
| **Lo que se corrige es lo que la base tiene AHORA**: justo antes de preguntar se vuelve a leer la venta. Si otro teléfono cambió en medio alguno de esos campos, se enseña lo nuevo y no se manda nada; si la base ya tiene lo que se quiere poner (el envío sin respuesta sí llegó, u otro teléfono puso lo mismo), tampoco; sin poder leer, no se pregunta. Lo que cambió en otros campos no estorba (no se manda) | `pagos-supa.js` (`correccionAlDia`), `js/mod/pagos-supa.js` (`datosAlDia`) | «Los datos de la venta»; PA-07 |
| **La bitácora**: la línea de la base la escribe `corregir_venta` (nivel dinero, «Se corrigió V-###», con lo de antes y lo de después de cada campo que cambió, el IVA también); además, una en la de este teléfono (Control → Bitácora) | `0007`; `js/mod/pagos-supa.js` (`anotarCorreccion`) | PA-07 |
| **Realtime**: los demás teléfonos releen la pestaña con el aviso de la base (como en el paso 5) y su copia de la venta se pone al día con la bajada de siempre; este teléfono sincroniza en el acto | `js/mod/pagos-supa.js` | «Con la base mandando» |
| Con la hoja mandando, **lo de siempre**: ni el formulario, ni una petición nueva | — | «Los datos de la venta», «Quién ve los formularios» |

**Lo que no entra en el paso 6** (dicho, para que nadie lo dé por hecho):

- **Corregir desde la ficha del proyecto.** La corrección vive en «Cobros y abonos»; la ficha sigue con sus botones de cuenta y estatus, que van por
  la bandeja y sin pregunta, como siempre. Un botón en la ficha que lleve a «Datos de la venta» con esa venta elegida sería lo siguiente.
- **La fecha del anticipo** (la que decide el mes de la venta en Control) y los datos de la obra no están en «Datos de la venta»: los de la obra se
  cambian en la ficha; la fecha del anticipo sigue solo desde el Editor SQL (`proyecto_actualizar`, Dirección).
- El anticipo, la liquidación y los abonos siguen en sus formularios. Una venta no se borra.
- Nada de esto se probó en un navegador ni contra `al3d-produccion` (hace falta la app publicada y la empresa en `'base'`).

**Riesgos que conviene saber:**

- **El dinero no se sella: la última corrección gana.** La revisión de antes de preguntar cierra casi toda la ventana, pero dos teléfonos de Dirección
  corrigiendo el mismo campo en el mismo segundo pueden pisarse (`corregir_venta` no recibe el valor esperado). Y un botón de cuenta o de estatus
  tocado en la ficha sin señal sale cuando vuelve la señal y gana, aunque llegue después de la corrección.
- **Pagos puede corregir por la base** (la matriz de `0017`): la regla de solo Dirección es de la pantalla. Cerrarla del lado de la base es cambiar la
  matriz, y dejaría a Pagos sin fijar el anticipo ni corregir la liquidación (usan la misma función).
- **La prueba de humo pone la empresa en `'base'`** dentro de su transacción: mientras corre (segundos), un alta o un cambio de modo de verdad
  esperan a que termine. Nada queda cambiado.

**Para que surta efecto en producción:** (1) fusionar #173 y después este PR; (2) aplicar `0026` en `al3d-pruebas` y después en `al3d-produccion`
(Editor SQL, el archivo entero; termina con la auditoría: si sale «AUDITORIA DE SEGURIDAD (0026)…», no se aplicó nada y el mensaje dice por qué) y
correr la prueba de humo: verde con 65 casos (81 con `storage.sql`); (3) publicar la app (`sw.js` 149). No hay que volver a pegar ninguna función
(ningún archivo que vaya en sus paquetes cambió) ni tocar el Apps Script. `0026` y la app no dependen una de la otra: con la hoja mandando ningún
teléfono llama a `alta_venta`, y «Datos de la venta» solo sale con la base mandando.

## Paso 7: el día del cambio (la lista)

La fecha la decide Elías. **Antes del día:**

1. Todo publicado: #168, #169, #171, #172, #173 y el del paso 6 fusionados; `0024`, `0025` y `0026` aplicadas en las dos bases (la auditoría
   limpia; la prueba de humo, 65 casos, 81 con `storage.sql`); la app publicada (`sw.js` 149) y abierta en cada teléfono con señal, para que
   tenga la versión nueva.
2. Si Fabricación debe ver las imágenes de las obras ganadas: volver a aplicar `supabase/opcional/storage.sql` (Q-02 bis) en las dos bases.
3. En cada teléfono (Dirección, Pagos y las 3 de Fabricación): abrir la app (`sw.js` 151 o más) y entrar como siempre con Google. Desde la
   **entrada única** (abajo) el teléfono se enciende y entra a Supabase solo; si Google pide un toque, la banda de arriba trae su botón.
   Desde **un toque en la puerta** (abajo, `sw.js` 151), con la base mandando el botón de Google de la puerta basta: no se pasa por la hoja.
   Ajustes → Supabase dice el área que da la base. La entrada en el iPhone, probada (pendiente de Elías).
4. La copia de cada 3 horas, cuadrando: Ajustes → Supabase → «cuadró X de los últimos 7 días» en 7.

**El día, en este orden:**

1. Avisar al equipo: desde ahora no se captura en la hoja.
2. Vaciar las colas: en cada teléfono, nada pendiente ni apartado en la bandeja (el glifo de sincronización y Control lo dicen).
3. La última copia, a mano: Apps Script → `copiarHojaASupabase` → «aplicada · CUADRA · … · 0 diferencias · 0 conflictos». Si no cuadra, se
   arregla en la hoja y se repite; no se sigue con diferencias.
4. `quitarCopiaDiaria` (el respaldo semanal se queda: lee la base, no la hoja).
5. La base manda: `modo_cambiar('base')` con la sesión de Dirección. Todavía no tiene botón: desde la consola del navegador de la app de Dirección
   (con la sesión de Supabase), o, como dueño en el Editor SQL, `update public.empresas set modo = 'base', modo_desde = now() where id = 'al3d';`
   (este último no deja la línea en la bitácora).
6. La hoja en solo lectura (proteger las pestañas o quitarle al equipo el permiso de edición): un teléfono que todavía no se entera del modo deja
   lo suyo en la bandeja, y sale a la base después.
7. Cada teléfono se entera al abrir la app o Ajustes, o a los 10 minutos como mucho: la pestaña de Control pasa a «Cobros y abonos», el candado del
   rol dice «lo manda la base» y el historial del cotizador empieza a subir solo (Ajustes → Supabase dice cuándo terminó).
8. Comprobar en el teléfono de Dirección: «Cobros y abonos» lee las ventas con su saldo y ofrece «Datos de la venta»; el récord de Control dice
   «de la base»; el candado del rol, «lo manda la base». En el de Fabricación: ni «Cobros y abonos» ni una cifra.

**Cómo se regresa:** `modo_cambiar('hoja')`, volver a instalar la copia (`instalarCopiaDiaria`) y quitarle a la hoja el solo lectura (abajo).

Cómo se regresa en cualquier paso: `modo_cambiar('hoja')`. La hoja sigue completa mientras no se apague la copia. Ojo: el espejo a
la hoja solo lleva Ventas y Abonos; lo que se capture de almacén, gastos o autorizaciones en modo base no vuelve solo a la hoja. Con los gastos,
además: de vuelta en la hoja, la copia de cada 3 horas le pone lápida (`deleted_at`) a los que se capturaron en la base y no están en la
pestaña; no se pierden (siguen en la base), pero dejan de verse hasta que alguien los pase a la hoja. Y desde el paso 6, de vuelta en la hoja la
base ya no da de alta ventas sin cotización (`0026`) y «Datos de la venta» desaparece: las dos cosas vuelven a hacerse en la hoja.

## Lo que decide Elías

1. ~~El sello de los QR: su clave a Supabase, o `/autorizar` y `/verificar` se quedan en el Apps Script.~~ Decidido el 2026-10-25: se quedan
   en el Apps Script, con todo el notario, la IA y los links de Maps.
2. ~~Las carpetas de Drive~~: se quedan en el Apps Script (decidido el 2026-10-25). Desde `puente-sheets-16` (2026-10-26) la hoja
   acepta la sesión de la base para Drive y Maps: sin eso, con la base mandando, la ficha dejó de enseñar los diseños.
3. Si los borradores de cotización y las imágenes de referencia se sincronizan entre teléfonos (las imágenes de las cotizaciones del historial
   ya se sincronizan desde el paso 4; los borradores y la imagen de referencia, no: ver «Paso 4»).
4. La prueba de la entrada con Google en el iPhone.
5. La fecha del cambio.
6. ~~Si «Repartir un depósito» debe saltarse las comisiones de ventas que todavía no están LIQUIDADAS.~~ Decidido el 2026-10-25: **no**, se queda
   como está (paga toda comisión pendiente, de la más antigua a la más nueva).
7. ~~Desde qué pantalla se corrige el subtotal, el nombre o la cuenta de una venta con la base mandando.~~ Decidido el 2026-10-25: una pantalla
   para Dirección; hecha en el paso 6 («Datos de la venta», en «Cobros y abonos»).
8. ~~Si `alta_venta` se cierra también del lado de la base con la empresa en `'hoja'`.~~ Decidido el 2026-10-25: **sí**; hecho en el paso 6
   (`0026_alta_venta_modo.sql`).

## La entrada única (2026-10-25)

Elías preguntó por qué había que entrar dos veces con Google (la puerta de la app y luego Ajustes → Supabase). La razón: la puerta pide
a Google un token de **acceso** (el que verifica la hoja) y Supabase pide un token de **identidad** (`signInWithIdToken`); son dos fichas
distintas del mismo Google, y la segunda solo salía del botón de Ajustes, con el interruptor encendido a mano.

Ahora, al abrir la app con la cuenta de Google de la puerta (`js/app.js`, `conectarLaNube`):

- el interruptor de Supabase se enciende solo en ese aparato, salvo que alguien lo haya apagado ahí a propósito (Ajustes, o la base que
  retiró el acceso: `al3d_pf_supa_no`), y salvo que se haya entrado con el token de emergencia (sin correo de Google);
- se le pide a Google el token de identidad **sin botón** (`entrarSinBoton` en `js/nucleo/supa.js`: `prompt()` con `auto_select`, la cuenta
  de la puerta en `login_hint` y FedCM). Si esa cuenta ya aceptó una vez, entra sin enseñar nada; si no, Google enseña su tarjeta
  «Continuar como …» de un toque;
- si Google no la da sola (Safari, la tarjeta cerrada, sin respuesta en 20 s), la banda de arriba de la app trae el botón de Google, con
  «Ahora no»;
- una cuenta de Google distinta de la de la puerta no se queda dentro (se sale y se dice).

Con la empresa en «hoja» esto no cambia lo que se guarda ni a dónde: deja a cada teléfono dentro de Supabase y sabiendo quién manda, que es
lo que lo cambia de lado el día del cambio. Pruebas: `pruebas/supabase-entrada-unica.mjs`.

### Un toque en la puerta (2026-10-25, `sw.js` 151)

Elías, desde el iPhone: «no tener que ingresar nuevamente con Google cuando ya lo hice desde un principio». La hoja y el Apps Script no
se tocan (decisión de Elías): la hoja sigue sin saber leer el token de identidad. Lo que cambia es la puerta (`js/nucleo/puerta.js`):

- enseña **el botón de Google mismo** (un iframe de Google, `montarGoogle`; el nonce como siempre: a Google la huella, a Supabase el
  original). Al tocarlo, la puerta entra a Supabase ahí mismo (`entrarConCredencial` en `supa.js`) y pregunta `mi_acceso`;
- con la empresa en **`'base'`** y la persona **activa**: adentro con el área de la base y su pase (`de: 'base'`). **No toca la hoja**: ni
  `/salud`, ni token de acceso, ni otra ventana de Google. Después tampoco: la vuelta de fondo que confirma el pase pregunta a la base sin
  pedir el permiso de la hoja, y el clic que renovaba ese permiso ya no lo hace con la base mandando. Lo único que todavía lo pide es lo
  que sigue en el Apps Script (el sello, la IA, Maps, Drive), y solo cuando se usa;
- con la empresa en **`'hoja'`**, o si la base no contesta, o si la persona no está activa en la base (no invitada, dada de baja): la hoja
  decide como hoy, con su «fuera» y su segunda opinión. Eso pide el permiso de Google de la hoja: si el navegador todavía lo deja, sigue
  solo; si no, «Falta un toque» y el botón de la app hace el resto. Para no cobrar ese segundo toque cada mañana, un teléfono que **ya sabe**
  que la empresa sigue en la hoja enseña el botón de siempre (un toque, y Supabase por detrás como arriba); uno que no lo sabe enseña el de
  Google y así se entera. Cambiarlo es una constante (`BOTON_GOOGLE_CON_LA_HOJA`);
- si el botón de Google no carga en 6 s (sin señal, bloqueado, un navegador viejo), o Supabase está apagado a propósito en ese teléfono,
  queda el botón de siempre con su camino de siempre. Con captcha, el de Google sale cuando el captcha da el visto bueno.

El token de identidad no se guarda en ningún lado: su correo queda como el de la puerta (`Ingreso.anotarCredencial`) y el token va directo
a Supabase. La banda de arriba ya no sale después de entrar así: `entrarSinBoton` encuentra la sesión de la puerta (y si es de otra cuenta
que la de la puerta, la suelta y pide la buena). Pruebas: `pruebas/supabase-entrada-unica.mjs` (la puerta con el token, de punta a punta),
`pruebas/ingreso.mjs` (leer el token), `pruebas/puerta.mjs`. Sin probar en un navegador de verdad: el botón de Google en el iPhone.

## Auditoría del 2026-10-25: 0028

La auditoría del día del cambio ([`AUDITORIA-SUPABASE-2026-10.md`](AUDITORIA-SUPABASE-2026-10.md)) encontró tres cosas que se arreglan en la base,
con `supabase/migrations/0028_auditoria_base.sql` (Elías pidió aplicarlo todo; se tomó lo recomendado):

| Hallazgo | Qué pasaba | Qué hace 0028 | Prueba |
|---|---|---|---|
| **CZ-1** | Pagos «registraba» desde el Cotizador una venta que nunca llegaba a la base: `ganar_proyecto` era solo de Dirección, la bandeja la apartaba y el recibo decía que el folio «llega solo» | Pagos da de alta la venta que viene de una cotización (la matriz que lee el teléfono y el preámbulo que decide la base), **solo con la base mandando** (con la hoja, `DATO_INVALIDO` definitivo sin escribir nada, como `alta_venta` en `0026`); su cita nace `propuesta`. Fabricación sigue sin poder | `supabase/tests/pagos/auditoria-0028.mjs` (A28-01 a A28-04); `acceso/matriz.mjs` (RL-20); humo H01–H02 |
| (de paso) | El reintento de un «Se ganó» que SÍ entró con su cita (la respuesta se perdió) contestaba «Ese id de instalación ya existe», definitivo: la bandeja lo apartaba y el teléfono nunca recibía su V-###. Venía desde `0006` | Esa pregunta va después de «ya existía», como en `alta_venta`: el reintento contesta «ya existía» con el mismo folio | A28-08 |
| **DN-2** | «Repartir un depósito» le pagaba comisión a ventas canceladas («No se dio») | `comisiones_pendientes` las deja fuera: la vista previa y el reparto ya no las tocan. La T de `ventas_calculadas` no cambia | A28-06; humo H03 |
| **DN-3** | Un cobro olvidado, capturado hoy con su fecha vieja, regresaba `fecha_liquidacion` y movía toda la liquidación a ese mes | La fecha de liquidación solo avanza (`greatest`) | A28-07; humo H04 |
| CZ-5 | El aviso del Cotizador decía «la hoja le quita el IVA» | Nada en la base: el IVA ya lo ponía la cuenta al ganar desde `0006` (`normalizar_iva`). Falta solo el texto del Cotizador | A28-05 |

**Para que surta efecto en producción:** aplicar `0028` en `al3d-pruebas` y después en `al3d-produccion` (Editor SQL, el archivo entero; termina
con la auditoría) y correr `supabase/opcional/prueba-de-humo.sql`: verde con **78** casos (94 con `storage.sql`, 98 con `storage.sql` y
`constancias.sql`). No hay que volver a pegar ninguna función ni tocar el Apps Script. La app no depende de `0028` para funcionar: sin ella, la
venta de Pagos se sigue apartando como hoy; con ella, el teléfono de Pagos se entera en su siguiente `mi_acceso` (al abrir la app o Ajustes, o a
los 10 minutos) y la bandeja manda las ventas nuevas. Una que ya se apartó antes de `0028` no sale sola: en el teléfono de Pagos, Ajustes →
«Volver a intentarlos» (o Dirección la registra desde su Cotizador).

**Aplicada el 2026-10-25** (con permiso de Elías, desde su Chrome): el archivo tomado del commit `4997dbe` con su huella sha256 comprobada
(`c4457cfa…59849`), primero en `al3d-pruebas` (empresa en `'hoja'`) y después en `al3d-produccion` (empresa en `'base'`); las dos contestaron
«Success» con la auditoría limpia. Prueba de humo en las dos: **98 de 98, 0 fallos** (H01–H04 en verde). En producción, después: la empresa
sigue en `'base'`, `ganar_proyecto` y `registrar_cobro` llevan el cambio «0028:», la matriz dice `pagos.alta.ganar_proyecto = true` y no quedó
ninguna fila de la prueba.
