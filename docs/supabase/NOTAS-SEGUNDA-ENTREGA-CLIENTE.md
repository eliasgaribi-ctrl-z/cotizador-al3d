# Segunda entrega, lado del cliente: escritura en sombra, lectura en vivo y cuadre

**Fecha:** 2026-10-16. **Rama:** `claude/supabase-sombra-y-vivo`. **Estado:** todo construido y **APAGADO**. La hoja de Google sigue siendo la fuente de verdad.

Elías no estaba cuando se hizo esto. Cada vez que hubo que escoger, se escogió lo más conservador, y queda escrito abajo («Decisiones») para que lo confirme o lo cambie. Este documento no sustituye a [`ESTADO-SUPABASE.md`](../ESTADO-SUPABASE.md), que no se tocó: cuando Elías revise, ahí se pasan las filas de fase 3 y 4 que esto mueve.

## En una frase

Hay dos interruptores nuevos por aparato, los dos apagados y solo visibles para Dirección: la **sombra** (cada cambio que la hoja acepta se escribe también en Supabase) y la **lectura en vivo** (el aparato baja de Supabase con Realtime en vez de la hoja). Más un **cuadre** que compara la hoja con la base, a mano o una vez al día, y un flujo de GitHub para el cuadre diario, también apagado.

## Cómo se enciende (y cómo se apaga)

Todo está en Ajustes → «Supabase (pruebas)», solo para Dirección, y solo hace algo en ese aparato:

1. Encender el interruptor general (el de la pieza 3, ya existía) y entrar con Google.
2. Con la base reconociéndote como Dirección activa, aparece el bloque «Escritura en sombra, lectura en vivo y cuadre».
3. «Encender la sombra en este aparato». Desde ese momento, lo que este aparato mande a la hoja se copia a la base.
4. Con la sombra encendida: «Leer de la base (en vivo)». La lectura en vivo **exige** la sombra (si no, lo que este aparato escribe no llegaría a la base de la que lee y cada bajada le regresaría lo de antes).
5. «Cuadrar ahora» funciona con o sin sombra.

**Volver atrás:** «Volver a leer de la hoja» (o «Apagar la sombra», que apaga las dos). No hace falta recargar: los ganchos vuelven a `null` en el acto, y la siguiente bajada es de la hoja, que sigue completa porque la escritura nunca dejó de ir a ella. Apagar el interruptor general también lo apaga todo en la siguiente apertura.

## Qué se construyó

| Pieza | Dónde | Qué hace |
|---|---|---|
| Gancho de la sombra | `js/datos/sync.js` (`alSubir`) | `null` por omisión. Si alguien lo enchufa, recibe cada operación que la hoja **aceptó**, antes de sacarla de la bandeja. Lo que haga no detiene ni cambia el bombeo |
| Fuente de las filas | `js/datos/puente.js` (`fuenteDeLectura`) | `null` por omisión: `bajar()` pide `/jalar` y `/jalar_almacen` como siempre. Con una fuente enchufada, le pide a ella las mismas filas con la misma forma |
| La sombra | `js/datos/supa-sombra.js` | Interruptores, traductor bandeja → funciones de la base, cola propia en otra base local (`al3d_sombra`), reintentos y registro |
| La lectura en vivo | `js/datos/supa-vivo.js` | Arma, desde las tablas de la base, **la misma fila que manda el Apps Script** (`aplanarFila`), y el almacén; y la suscripción de Realtime |
| El cuadre | `js/datos/supa-cuadre.js` | Puro: cuenta y suma (en centavos enteros) la hoja contra `ventas_calculadas`, y compara folio por folio. La racha de días seguidos |
| El enchufe | `js/datos/supa-enchufe.js` | Conecta lo anterior a los ganchos; el cuadre del día; lo que pinta Ajustes |
| Arranque | `js/app.js` | Solo con el general **y** la sombra encendidos importa el enchufe. La vuelta de 30 s pregunta si saltarse la bajada (solo con Realtime vivo) |
| Ajustes | `js/mod/ajustes.js` | Un bloque propio (`bloqueSombra`, `accionSombra`, acciones `supasb-*`) dentro de la tarjeta de Supabase |
| Cuadre diario fuera de la app | `scripts/cuadre-diario.mjs`, `.github/workflows/cuadre-diario.yml` | Apagado sin la variable `CUADRE_DIARIO=encendido` y sus cuatro secretos |
| Service worker | `sw.js` | `APP_VERSION` 115 → 116; los cuatro módulos en el conjunto versionado |

**Migración 0015:** **no hizo falta**. La publicación de Realtime ya tiene las 13 tablas (`0010_sync_espejo.sql`, lista cerrada), `ventas_calculadas` ya se lee con RLS (Dirección y Pagos ven filas, Fabricación cero) y todas las funciones que la sombra llama ya existen. No se tocó SQL; 0013 y 0014 siguen libres para el otro equipo.

## Cómo funciona la sombra

```
bandeja ──bombear──▶ hoja (Apps Script) ── ¿ok? ──▶ gancho alSubir ──▶ cola al3d_sombra ──▶ funciones de Supabase
                                 │ no                                        │
                                 └── como siempre (rechazada, sin destino…)  └── registro (200 eventos)
```

- **Solo lo que la hoja aceptó.** Lo rechazado, lo apartado y lo «omitido» (la lápida sin fila, la venta fuera de la hoja) no se copia. Así la base recibe exactamente lo que tiene la hoja, y el cuadre mide algo real.
- **Idempotente.** La copia se guarda con el id de la operación de la bandeja; si la app se cierra a medio bombeo y la hoja la recibe otra vez, en la cola sigue siendo una. En la base: `proyecto_actualizar` recibe ese id como `op_id`; `ganar_proyecto` y `descartar_cotizacion` son por id y folio de cotización (`ya_existia`); `mover_etapa`, `corregir_venta` e `instalacion_guardar` convergen (mismo valor y mismo sello no escriben nada); `almacen_aplicar` es por id de movimiento (`ya_estaba`).
- **Traducción** (`supabase/DISENO.md` §7.4):

| Operación de la bandeja | Función de la base |
|---|---|
| `proyectos` / `crear` (nació en el cotizador) | `ganar_proyecto` (`fecha_ganado→fecha_anticipo`, `anti_pactado→venta.anti`, `sub→venta.sub`, `estatus_notion→venta.estatus`, sellos por grupo, `origen` como `entrada`) |
| `proyectos` / `crear` con etapa `cancelado` | `descartar_cotizacion` |
| `proyectos` / `actualizar`: obra (notas, tel, dirección, ubicación —los cuatro campos juntos—, entrega, plazo, entrecalles, contacto, negocio, tipo, compromiso, fecha) | `proyecto_actualizar` con `op_id` y `sellos` |
| `proyectos` / `actualizar`: dinero (`anti_pactado`, `sub`, `cuenta`, `estatus_notion`, `pct_comision`, `nombre`) | `corregir_venta` |
| `proyectos` / `actualizar`: `etapa` | `mover_etapa` con el sello de la etapa |
| `instalaciones` | `instalacion_guardar` con el sello de la cita |
| `movimientos`, `materiales`, `requerimientos` | `almacen_aplicar` |
| `avisos`, `constantes` | no van (la hoja tampoco los lleva) |

- **Qué pasa con cada respuesta.** Sí → sale de la cola. «No» definitivo (`ROL_SIN_PERMISO`, `NO_ENCONTRADO`, `DATO_INVALIDO`, `DUPLICADO`, lote rechazado definitivo) → se **aparta** como rechazada con su razón, y el botón «Reintentar las rechazadas» la regresa. Red, sesión vencida, `SIN_SESION`, `ACCESO_REVOCADO`, `CLIENTE_VIEJO` o algo que no se entiende → se queda, suma un intento y **para** la vuelta (el orden importa y lo de atrás fallaría igual). Nada se descarta nunca.
- **Cuándo se reintenta:** 2 s después de cada copia, cada minuto con la app a la vista, al volver la señal y con «Mandar a la base ahora». Sin sesión en la base la copia **se guarda igual** y sale cuando se entre.
- **El id del proyecto en otro aparato.** La base guarda el id del teléfono que dio de alta la venta, o el canónico de la importación. Si la base contesta `NO_ENCONTRADO` a un id de este teléfono, se busca una vez por folio de cotización o por folio de la hoja y se reintenta con el de la base; se recuerda para las siguientes.
- **El registro** (Ajustes → «Registro de la sombra») guarda los últimos 200 eventos: escrita, rechazada (con código), reintento (con error), cuadre. Sin datos del negocio: el qué, el id de la operación y el porqué.

## Cómo funciona la lectura en vivo

- **No se copiaron las reglas de la hoja.** El relevo (`puente.js`) ya sabe todo lo que se hace con una fila: el récord de Control, el dinero sobre el proyecto, los sellos dato por dato, la cita, la revisión de copias. La lectura en vivo arma **la misma fila** que manda el Apps Script —mismos nombres de columna, la columna AI de sellos desde `proyectos.sellos`, la cita desde la instalación viva— y se la da al relevo. Una sola copia de las reglas.
- **El almacén** también sale de la base (materiales, listas de compra y el libro, este último solo lo nuevo por su secuencia `seq`). La marca de hasta dónde se leyó la base es **aparte** de la de la hoja (`al3d_pf_supa_vivo_alm`): al volver a la hoja, su marca sigue donde estaba.
- **Realtime avisa, no trae** (DISENO.md §7.2): un cambio en una tabla dispara la bajada de siempre, juntando ráfagas (1.5 s). Con la suscripción viva, la vuelta de 30 s deja de bajar y solo baja de respaldo cada 5 minutos; **sigue mandando** la bandeja cada 30 s (la escritura no cambió). Sin Realtime conectado, baja cada 30 s como siempre. Drive y los links de Maps siguen en la vuelta de 30 s.
- **R1, Fabricación jamás recibe dinero**, con dos candados: (1) con el área de Fabricación (la que dice `mi_acceso()` de la base, no el segmento de Ajustes) **no se pide** `ventas_calculadas` ni `almacen_costos`, ni hay suscripción a `ventas_dinero`, `abonos` ni `almacen_costos`; (2) aunque se pidieran, la RLS devuelve cero filas. La fila que se arma no lleva ni la llave de las once columnas de dinero (las mismas que la hoja le quita, `CAMPOS_DE_DINERO`). Un área que la base no reconoce no lee **nada**.

## El cuadre

- **Qué compara:** las filas de la hoja con folio V-### contra `ventas_calculadas`: número de ventas y la suma de subtotal, neto, anticipo, liquidación, saldo (K), comisiones (R), abonado (S) y comisión restante (T), **en centavos enteros**. Y folio por folio. Un centavo de diferencia no cuadra (es justo R-01, el redondeo de Sheets en los empates).
- **De dónde sale la hoja:** de la hoja misma (`/jalar` por el puente, en el momento), no del récord local: con la lectura en vivo encendida, el récord local ya viene de la base y compararla contra sí misma no diría nada.
- **Emparejado:** por V-###; si no, por folio de cotización (ver «Decisiones», punto 3), y eso se reporta como «con otro V-### en la base», no como venta que falta.
- **El diario:** con la sombra encendida y siendo Dirección, se hace solo la primera vez del día (día de México); si la hoja o la base no contestan, lo vuelve a intentar a la media hora. Se guardan los últimos 60 y Ajustes enseña la **racha** contra la meta de 7 días seguidos.
- **El diario fuera de la app** (`scripts/cuadre-diario.mjs` + flujo de GitHub): misma cuenta. Apagado hasta que Elías cree la variable `CUADRE_DIARIO=encendido` y cuatro secretos (`PUENTE_URL`, `PUENTE_TOKEN` de un aparato de Dirección, `SUPABASE_URL`, `SUPABASE_SECRETA`). Su bitácora es pública (el repositorio lo es): solo imprime si cuadra y **cuántas** diferencias hay de cada tipo; nunca nombres, folios ni importes. Sale en rojo si no cuadra y GitHub avisa por correo.

## Decisiones (tomadas sin Elías, todas reversibles)

1. **La sombra copia solo lo que la hoja aceptó**, y después de que lo aceptó. Alternativa descartada: escribir en la base al encolar. Si la base recibiera algo que la hoja rechazó, divergirían por diseño y el cuadre no serviría para nada.
2. **La lectura en vivo exige la sombra.** Sin ella, las correcciones de este aparato irían solo a la hoja, y cada bajada de la base las regresaría en pantalla.
3. **El V-### de una venta nueva puede no coincidir.** `ganar_proyecto` toma el folio de su propio contador (Q-07) y la hoja el suyo. No se cambió la función (habría que aceptar el folio de la hoja en la operación: es SQL nuevo y una decisión de la fase 4). El cuadre empareja por folio de cotización y lo cuenta aparte. **Por decidir:** que en sombra la base reciba el V-### de la hoja (respuesta `remoto.id_notion`, que la cola ya guarda).
4. **Las notas de una instalación ya creada no viajan.** La base pide el renglón nuevo (`anexo`, C-4) y la bandeja guarda las notas completas; mandarlas completas las duplicaría en el registro acumulativo. Al crear la cita sí van.
5. **Una operación vieja sin `campos`** manda solo la obra, con sus sellos (la base decide por sello y no pisa lo más nuevo); ni el dinero ni la etapa, que solo viajan cuando se sabe que fueron lo que cambió (la misma regla que `aNotion`).
6. **Una venta que la base ya tiene con otro id** (`DUPLICADO` en `ganar_proyecto`) cuenta como «ya estaba»: la trajo la importación. Las operaciones siguientes la encuentran por folio.
7. **Con Realtime vivo, la vuelta de 30 s baja de respaldo cada 5 min**, no nunca (el plan §4.4 dice «el sondeo queda como respaldo»).
8. **El cuadre diario en la app** corre en el aparato de Dirección con la sombra encendida. Que «siete días seguidos» signifique siete días con la app abierta en ese aparato es una limitación: el flujo de GitHub la cubre si Elías lo enciende.
9. **El flujo de GitHub usa la llave secreta.** Es la única forma de que algo fuera de la app lea `ventas_calculadas` sin sesión de Google. Da acceso total a la base: por eso el flujo está apagado y la decisión de cargarla es de Elías. Alternativa si no quiere: dejar el cuadre solo en la app.
10. **Los módulos nuevos van en el conjunto del service worker** (como `supa.js` en la pieza 3): un teléfono los descarga al actualizarse aunque nunca los ejecute. Es descarga de código, no una petición de la app; sin eso, encenderlos sin red mezclaría versiones (pantalla blanca, ver la cabecera de `sw.js`).
11. **La cola de la sombra vive en otra base local** (`al3d_sombra`) y no en la bandeja: la bandeja tiene muchos lectores (sync, puente, proyectos) que tendrían que aprender a saltársela. Se agregó a la lista de bases que borra el acceso retirado (`BASES_LOCALES` de `js/nucleo/supa.js`, borrado que sigue **deshabilitado**).

## Lo que la sombra NO cubre (y por qué)

- **«Registrar venta» del cotizador** va directo a la hoja (`/empujar` con el token, fuera de la bandeja: `venta.js`). No pasa por el gancho. C-7 pide que hable por `window.AL3D` hacia el padre; es una pieza aparte. Mientras tanto, la venta llega a la base cuando la plataforma recoge la ganada del buzón y da de alta su proyecto por la bandeja (la hoja contesta con la fila que ya existe y la sombra la copia).
- **Lo que Pagos captura en la hoja** (liquidación, abonos, fecha de liquidación): no hay pantallas de Pagos (Q-01, otro equipo). Esas cifras no pasan por la bandeja, así que la base no las recibe y **el cuadre no va a cuadrar** en liquidación, saldo, abonado y restante mientras Pagos siga capturando en la hoja. Es lo esperado y es exactamente lo que el cuadre tiene que mostrar. La lectura en vivo, por lo mismo, enseñaría esas cifras atrasadas: es para probar, no para operar.
- **Lo que hacen los aparatos sin la sombra encendida** (Fabricación, Pagos, otro teléfono de Dirección) no llega a la base. Para que la fase 3 cuadre siete días, la sombra tiene que estar encendida en **todos** los aparatos que escriben, o la importación (fase 2) tiene que volver a correr; el interruptor es por aparato a propósito (decisión de la pieza 3).
- **La sombra no arregla lo que la importación no hizo.** Sin la importación de la fase 2 (bloqueada por la copia de la hoja), la base está vacía y el primer cuadre dirá «309 solo en la hoja». También es lo esperado.

## Qué no se pudo verificar

- **Nada de esto corrió contra Supabase de verdad.** Las pruebas usan un doble de supabase-js. No se probó: que PostgREST acepte los filtros (`or=`, `not.is.null`, `range`), el `max_rows`, que Realtime con RLS entregue o niegue cada evento por suscriptor (EX-08), ni que `supabase-js` 2.116 mande el token de la sesión al canal. Es lo primero que hay que probar con `al3d-pruebas` y una cuenta de cada área.
- **El navegador.** Las pruebas de navegador no corren en Windows y no se escribió ninguna nueva. Lo de Ajustes (el bloque, los botones, los avisos) no se vio pintado.
- **El iPhone** con la app instalada (sigue pendiente desde la pieza 3).
- **El flujo de GitHub** no se ejecutó (necesita los secretos).
- **Dos personas a la vez** contra la base (concurrencia, Realtime cruzado): no hay con qué en esta máquina.

## Pruebas

| Archivo | Qué cuida | Resultado |
|---|---|---|
| `pruebas/supabase-sombra.mjs` | **Apagado no carga ni llama nada nuevo**: un teléfono de Dirección de verdad contra el Apps Script de verdad gana, manda, baja y mueve una venta; toda la red es la URL del puente, no se crea ningún `<script>`, solo se abre la base de siempre; nadie importa los módulos nuevos de forma estática. Encendida no cambia el bombeo (ni si truena). El traductor, las respuestas y la cola | 73 / 73 |
| `pruebas/supabase-vivo.mjs` | La fila de la base = la fila de la hoja; **R1** (Fabricación no pide ni recibe dinero, un área desconocida no lee nada); páginas de 500; el libro por secuencia; Realtime; **la vuelta atrás** contra el Apps Script de verdad | 32 / 32 |
| `pruebas/supabase-cuadre.mjs` | Cuadra y no cuadra (un centavo), centavos enteros, dónde no cuadra, la racha, el script (apagado, sin datos en la bitácora, sin detalle dentro del repo) y el flujo apagado | 29 / 29 |
| `pruebas/supabase-entrada.mjs` | (ya existía) se ajustó la lista de bases locales | 59 / 59 |

Las cifras de las suites completas están en el mensaje del commit final y en el reporte de la sesión.

## Para pasar a `ESTADO-SUPABASE.md` cuando Elías lo revise

- Fase 3, «La plataforma escribe en la base a través de la bandeja»: **hecho, apagado** (sombra por aparato; ver las limitaciones de arriba).
- Fase 3, «Cuadre diario automático»: **hecho, apagado** (en la app y en GitHub).
- Fase 4, «La plataforma lee de la base; Realtime sustituye el sondeo de 30 s»: **hecho, apagado, sin probar contra Supabase real**.
- Pendiente de Elías: encender en `al3d-pruebas` con una cuenta de cada área; decidir el punto 3 (V-### de la hoja en la base) y el 9 (llave secreta en GitHub).
