# Auditoría con la base mandando (25 de octubre de 2026)

Revisión visual y funcional de toda la plataforma el día que la empresa pasó a «la base manda» (2026-10-25), con la skill ui-ux-pro-max y siete agentes. Lo más urgente: dos fallas que pueden duplicar o perder dinero (DN-1, CZ-1) y una de acceso (ES-1). Informe publicado también como Artifact.

| Gravedad | Hallazgos |
|---|---|
| Crítico | 2 |
| Alto | 17 |
| Medio | 29 |
| Bajo | 19 |

## Hoy, antes de arreglar nada

1. Pídele a Pagos que no registre ventas desde el Cotizador hasta el arreglo: que te pase el folio, la abres en tu Cotizador (te llega en el historial) y tocas «Registrar venta» tú. Revisa también en su teléfono si ya hay una venta apartada (Ajustes, en la lista de lo apartado). CZ-1
2. Si un cobro dice «La base no contestó», no toques «Mandarlo como asiento nuevo»: primero «Volver a leer las ventas» y revisa si el saldo ya bajó. DN-1
3. Al dar de baja a alguien en Ajustes → Personas, quítalo también de la pestaña «Accesos» de la hoja. ES-1
4. Avisa al equipo: los cobros y abonos se registran en Control → Cobros y abonos, nunca en la hoja, aunque el asistente ✦ o la ficha digan otra cosa. TR-2 TR-1
5. Antes de «Repartir un depósito», revisa en la vista previa que no vaya a una venta cancelada. DN-2

## Lo que decide Elías

- **CZ-1** — ¿Pagos puede dar de alta en la base una venta que viene del Cotizador? Sí: un cambio chico de permisos y Pagos registra como antes. No: el Cotizador le avisa a Pagos que esa venta la registra Dirección.
- **DN-2** — ¿«Repartir un depósito» debe saltarse las comisiones de las ventas canceladas («No se dio»)? Recomendado: sí. Hoy les paga, y la pestaña Comisiones de Control no las cuenta.
- **CZ-5** — ¿Quién decide si una venta lleva IVA: la cuenta o la cotización? Recomendado: la cuenta, como ya pasa en «Venta sin cotización» y en «Datos de la venta». Hoy, una venta del Cotizador conserva el IVA de la cotización aunque la cuenta no facture.
- **DN-5** — ¿Necesitas registrar dinero que entra sin ser de una venta (préstamos, traspasos, reembolsos)? Si sí, es una tabla nueva en la base. Si no, el botón pasa a llamarse «+ Cobro de una venta».
- **CM-2** — Mientras Material siga en mantenimiento, ¿escondo sus avisos rojos, su pestaña y la tarjeta del almacén? Recomendado: sí. Está pendiente desde el 13 de octubre.
- **TR-8** — ¿Control entra a la barra del teléfono de Dirección? Hoy vive en «Más». Puede ir en lugar del Cotizador, o quedarse donde está con un atajo a «Cobros y abonos» en el Tablero.
- **TP-12** — Con «Enseñar al cliente» encendido, ¿difumino los totales de los demás clientes en la lista? Recomendado: sí.

## Orden de arreglo

Unas 77 horas de trabajo en total (S = 0.5 h, M = 2 h, L = 4 h).

- **Tanda 1 · El dinero que se duplica o se pierde** (≈ 7 h): Las dos fallas críticas y lo que hoy manda a registrar dinero donde nadie lo lee. DN-1, CZ-1, DN-2, DN-4, CZ-2, TR-1, TR-2.
- **Tanda 2 · Quién entra y qué ve cada rol** (≈ 4 h): Una baja que no saca a nadie, una pantalla que no se lee, y lo que Fabricación o el cliente ven de más. ES-1, ES-2, ES-7, TP-2, TP-7.
- **Tanda 3 · Que cada teléfono sepa si está conectado** (≈ 14 h): Hoy un teléfono sin sesión en la base parece al día y no lo está, y algunas ventanas de Google se abren solas. ES-4, TR-4, ES-3, ES-5, H-1, ES-11, TP-5, ES-8, CZ-3, TR-9.
- **Tanda 4 · Lo mismo en todos los teléfonos** (≈ 17 h): Lo que se cambia en un teléfono tiene que llegar completo a los demás, y lo que se borra o se edita para todos tiene que decirlo antes. CM-1, CM-7, TP-1, CZ-4, CZ-6, CZ-7, CZ-8, CZ-5, DN-3, DN-7, TP-6.
- **Tanda 5 · Textos de la hoja y palabras de contador** (≈ 15 h): Las frases que con la base mandando ya son falsas o dan instrucciones imposibles. TP-3, TR-3, TR-5, TR-6, TR-7, ES-9, ES-6, TR-14, DN-5, ES-10, H-3, H-5.
- **Tanda 6 · Calendario y Control en el teléfono** (≈ 12 h): El trabajo diario de Fabricación y de Pagos: menos toques, botones de tamaño de dedo, avisos que signifiquen algo. CM-2, CM-3, CM-4, CM-5, CM-6, CM-8, TP-10, TR-8, DN-6, DN-8, DN-9, TR-11, H-2, CZ-11.
- **Tanda 7 · Pulido, accesibilidad y velocidad** (≈ 9 h): Lo que no cambia el trabajo de nadie pero se nota: letra chica, lector de pantalla, atajos de la app y el peso de la primera carga. TR-12, TR-13, TP-9, TP-12, CZ-9, CM-10, CM-11, TR-10.

## Hallazgos

### DN-1 · Crítico · Control y dinero — «Reintentar» un cobro puede registrarlo dos veces y dejar la venta LIQUIDADA

- **Qué pasa:** Si la base guardó el cobro pero la respuesta se perdió (mala señal), la pantalla avisa bien y ofrece «Reintentar». Pero en cuanto llega el aviso de otro teléfono, o se toca «Volver a leer las ventas», el saldo baja y la casilla «Marcar la venta como LIQUIDADA», que nadie tocó, se marca sola. La app cree entonces que cambiaste los datos, pregunta «Cambiaste los datos de un envío que no sabemos si llegó», y su botón rojo «Mandarlo como asiento nuevo» registra el cobro otra vez. Reproducido: saldo $3,200, cobro de $1,600 → dos cobros de $1,600, saldo $0 y la venta LIQUIDADA.
- **A quién le pega:** A Pagos, en el teléfono, con mala señal, cuando el cliente paga en dos partes (el caso más común).
- **Arreglo (S):** Que la casilla no se recalcule sola después de un envío incierto (o que no cuente para decidir si «cambiaron los datos»), y que la pregunta diga QUÉ cambió, con «Cancelar» como botón principal.
- **Confianza:** Comprobado en navegador (verificado otra vez en el código) · tanda 1
- **Dónde:** `js/mod/pagos-supa.js:609 · js/datos/pagos-supa.js:239-262, 602-606, 314`

### CZ-1 · Crítico · Cotizador — Pagos «registra» una venta desde el Cotizador que nunca llega a la base

- **Qué pasa:** Con la base mandando, «Registrar venta» no revisa quién la registra. La base no deja que Pagos ni Fabricación den de alta una venta que viene de una cotización, así que su teléfono la aparta para siempre. Aun así, el Cotizador marca «Venta registrada» en verde y, a los 2 minutos, dice que el folio «llega solo». No llega: la venta se queda en ese teléfono y Dirección no la ve en Control ni en Cobros y abonos. Además, en el historial de Dirección la cotización sale como vendida.
- **A quién le pega:** A Pagos, cada vez que cierra una venta desde el Cotizador, desde hoy. Es un anticipo cobrado que no queda en el libro.
- **Arreglo (M):** Decisión tuya: (a) que Pagos pueda dar de alta ventas con cotización en la base (un cambio chico de permisos), o (b) que el Cotizador le diga a Pagos, antes de registrar, que la venta la da de alta Dirección. En los dos casos, que el recibo diga «no entró» y por qué cuando el teléfono la apartó. Hoy mismo conviene revisar el teléfono de Pagos por si ya hay una apartada.
- **Confianza:** Leído en el código (verificado otra vez en el código) · tanda 1 · **decide Elías**
- **Dónde:** `js/cotizador/venta.js:687-698 y :472 · js/datos/supa-relevo.js:322-327 · supabase/migrations/0017_decisiones_elias.sql:53 y :62`

### DN-2 · Alto · Control y dinero — «Repartir un depósito» le paga comisión a ventas canceladas

- **Qué pasa:** El reparto paga las comisiones pendientes de la venta más vieja a la más nueva, y la lista que recorre no salta las ventas «No se dio». En la prueba, de $3,000, una venta cancelada se llevó $2,100 y Notaría 12 solo $900; la vista previa no dice que esa venta está cancelada. La pestaña Comisiones de Control sí las salta, así que las dos pantallas dan cifras distintas, y el reparto no se deshace. El selector de cobro también ofrece la venta cancelada con su «saldo».
- **A quién le pega:** A Pagos, al repartir el depósito de un vendedor.
- **Arreglo (M):** Decidiste que el reparto paga aunque la venta no esté LIQUIDADA; las canceladas no se habían discutido. Recomendado: que la lista excluya las canceladas (una migración chica con su auditoría) y que el selector las marque. Antes, contar en producción cuántas canceladas tienen comisión pendiente.
- **Confianza:** Comprobado en navegador (verificado otra vez en el código) · tanda 1 · **decide Elías**
- **Dónde:** `supabase/migrations/0004_formulas.sql:95-97 · 0007_rpc_pagos.sql:141 · js/mod/control.js:402 · js/datos/pagos-supa.js:697-722`

### CZ-2 · Alto · Cotizador — Volver a registrar con la cuenta o el anticipo corregidos no corrige nada

- **Qué pasa:** Con la hoja, tocar otra vez «Registrar venta» actualizaba la fila. Con la base, el segundo toque solo dice «ya estaba registrada» y no manda nada. Si el vendedor corrigió la cuenta (que decide el IVA y Facturas), el anticipo o su fecha, el cambio se pierde sin aviso.
- **A quién le pega:** A quien se equivoca de cuenta o de anticipo y lo corrige en el mismo modal, con el cliente enfrente.
- **Arreglo (S):** Si algo del modal difiere de lo registrado, decirlo: «La venta ya está en la base; para corregir cuenta o anticipo usa Control → Cobros y abonos → Datos de la venta», con un botón que lleve ahí con la venta elegida.
- **Confianza:** Comprobado en navegador · tanda 1
- **Dónde:** `js/cotizador/venta.js:651-667`

### CZ-3 · Alto · Cotizador — Sin entrar a Supabase, el teléfono cotiza con precios viejos o de fábrica sin decirlo

- **Qué pasa:** Con la base mandando, el Cotizador pide los precios a la base. Si el teléfono no ha entrado a Supabase, espera 20 s y se queda con los guardados en el aparato. Si no hay guardados, usa los de fábrica, y «Precios y materiales» dice que «todavía no se ha guardado ninguna lista», aunque la base sí tiene. Al pedir la autorización, la hoja contesta que el precio no cuadra y que «ya trajo los de la hoja», cosa que en modo base no pasa. El vendedor queda en un ciclo sin salida, y quizá ya le dio al cliente el precio de la pantalla.
- **A quién le pega:** A cualquier teléfono que no haya entrado a Supabase: el de Fabricación en Safari, un teléfono nuevo, quien tocó «Ahora no».
- **Arreglo (M):** En el paso de Precio, cuando la base manda y no hay sesión, un letrero: «Precios de este teléfono del <fecha>: entra a Supabase para traer los de hoy», con botón a Ajustes. El mismo texto cuando la autorización rebota por precios.
- **Confianza:** Comprobado en navegador · tanda 3
- **Dónde:** `js/cotizador/tarifas.js:152-156 · js/cotizador/notario.js:72 · puente/hoja-apps-script.gs:4073-4074`

### CZ-4 · Alto · Cotizador — Borrar del historial ahora borra para todos, también una ya vendida, y el aviso llega después

- **Qué pasa:** La pista solo dice «mantén presionado para eliminar». Que se borra también en la base y en los demás teléfonos lo dice el aviso de después, que dura 8 s con «Deshacer». No hay freno para una cotización ya vendida ni para la de otro vendedor: Dirección puede borrar la de Pagos y desaparece de su teléfono. Recuperarla solo se puede con SQL.
- **A quién le pega:** A Dirección, que ahora tiene en su teléfono el historial de toda la empresa.
- **Arreglo (S):** Con la base mandando, que la pista diga «para todos los teléfonos». Si la cotización está vendida o es de otro teléfono, pedir confirmación con el botón rojo antes de borrar.
- **Confianza:** Comprobado en navegador · tanda 4
- **Dónde:** `js/cotizador/historial.js:866 y :533 · js/datos/supa-cotizaciones.js:239-246`

### TR-1 · Alto · Proyectos y Tablero — La ficha y «Qué atender» siguen pidiendo «Copiar datos para la hoja»

- **Qué pasa:** Una venta recién ganada no tiene su V-### hasta que la base se lo da. En ese hueco (sin señal, o con el teléfono sin entrar a la base), la ficha le ofrece a Dirección y a Pagos «Copiar datos para la hoja». «Qué atender» dice «Copia los datos para la hoja con Estatus COBRANDO». Si alguien la pega en la hoja, esa venta queda donde ya nadie la copia a la base, y después puede llegar repetida. En el Cotizador ese botón ya se quitó; aquí no.
- **A quién le pega:** A Dirección y a Pagos, en cada venta nueva mientras espera su folio.
- **Arreglo (S):** Con la base mandando, no pintar el botón, que copiar se niegue, y que «Qué atender» diga «espera su folio de la base; sale solo al tener señal».
- **Confianza:** Leído en el código · tanda 1
- **Dónde:** `js/mod/proyectos.js:1600-1603 y :3022-3037 · js/datos/reglas.js:565 · js/mod/inicio.js:704 (también TP-4)`

### TP-1 · Alto · Proyectos y Tablero — La cuenta y el estatus de cobro se cambian de un toque, sin pregunta ni «Deshacer»

- **Qué pasa:** En «Más detalles» de la ficha, los chips de cuenta y el segmento de estatus guardan al primer toque. Con la base mandando ese toque corrige la venta en la base. La cuenta decide el «Disponible» y las «Facturas» de Control. El mismo cambio en «Datos de la venta» sí pregunta, en rojo y diciendo de cuánto a cuánto. Son cinco chips pegados de 40 px dentro de una hoja que se desliza: un roce cambia la cuenta.
- **A quién le pega:** A Dirección y a Pagos, al revisar una ficha en el teléfono.
- **Arreglo (M):** Con la base mandando, que cambiar cuenta o estatus pregunte (de → a, y cómo queda el disponible), o que lleve a «Datos de la venta» con esa venta elegida. Como mínimo, «Deshacer» en el aviso.
- **Confianza:** Leído en el código · tanda 4
- **Dónde:** `js/mod/proyectos.js:1583-1593 y :2747-2750`

### TP-2 · Alto · Proyectos y Tablero — La ficha enseña código HTML junto al subtotal, y lo ve el cliente

- **Qué pasa:** Cuando la venta no trae subtotal, la ficha lo calcula y escribe literalmente «$59,827.59 <span class="pf-sem nada">calculado</span>». Con «Enseñar al cliente», «Más detalles» se abre solo: lo ve el cliente.
- **A quién le pega:** A Dirección y a Pagos en toda venta sin subtotal guardado: las que vinieron de la hoja con la celda vacía y las cotizaciones viejas.
- **Arreglo (S):** Una palabra: pasar el permiso de HTML en esa línea (el tercer argumento de dato()).
- **Confianza:** Comprobado en navegador (verificado otra vez en el código) · tanda 2
- **Dónde:** `js/mod/proyectos.js:1445-1449`

### TP-3 · Alto · Proyectos y Tablero — Proyectos no sabe que la base manda: sus avisos piden corregir en la hoja, que ya es de solo lectura

- **Qué pasa:** La pantalla de Proyectos no consulta el modo ni una vez. Tiene unas 40 frases con «la hoja». Las peores dan instrucciones que ya no se pueden cumplir: «en la hoja, borra la que sobra», «márcala «No se dio» también en la hoja», el botón «Volver a darla de alta en la hoja». Además, la revisión contra la hoja sigue corriendo después de cada bajada de la base, así que esos avisos pueden seguir saliendo.
- **A quién le pega:** A Dirección y a Pagos, en las fichas con avisos de la hoja.
- **Arreglo (M):** Frases según quién manda, como ya hace Control. Con la base: que los avisos lleven a «Cobros y abonos → Datos de la venta», quitar las salidas que exigen editar la hoja, y apagar la revisión contra la hoja.
- **Confianza:** Leído en el código · tanda 5
- **Dónde:** `js/mod/proyectos.js:877-879, 1429, 1471-1472, 1583-1590, 1776-1778, 2461-2564, 3028 · js/datos/supa-relevo.js:496-503 → puente.js:2257`

### CM-1 · Alto · Calendario y Mapa — A los demás teléfonos la cita solo les llega con la fecha y la hora

- **Qué pasa:** Al bajar de la base, la cita se convierte en un renglón «como de la hoja» y pierde el estado, la ventana (día, noche o madrugada), la duración y las notas. Por eso «Ya se instaló» marcado en un teléfono no llega a los otros: el proyecto instalado sigue en «ya pasó y nadie la marcó», con globo rojo. Lo que Fabricación propone le llega a Dirección como «Confirmada». Una cita de noche llega como de día, con la alarma del instalador mal. Las notas («subir por atrás…») no viajan. Y si un proyecto tiene dos citas (la instalación hecha y una visita de garantía), los otros teléfonos se quedan con la más vieja.
- **A quién le pega:** A Dirección y a los instaladores, todos los días.
- **Arreglo (L):** Bajar de la base la cita completa (estado, ventana, duración, notas) y aplicarla tal cual; tomar la cita viva más próxima, no la más vieja. Parche inmediato: que «ya pasó y nadie la marcó» no cuente proyectos en Instalado o después.
- **Confianza:** Leído en el código (verificado otra vez en el código) · tanda 4
- **Dónde:** `js/datos/supa-vivo.js:77-78, :181-183 · js/datos/puente.js:783-838`

### CM-2 · Alto · Calendario y Mapa — Material está en mantenimiento, pero el aviso rojo de material sigue en casi cada cita

- **Qué pasa:** Material está apagado, pero el Calendario sigue pintando «Falta y es ya» en rojo, y arriba del día dice «Falta Acrílico blanco/opal 3 mm y 6 materiales más — se instala hoy». Las ventas sin partidas piden «apuntarlo a mano» en una pantalla que no existe. El Resumen de Control enseña «Almacén · vale $0.00 · 4 bajo mínimo», la tira de Herramientas lleva a la pantalla en mantenimiento y «Llevar a mi teléfono» ofrece la alarma mensual de conteo del almacén. Tanto rojo hace que nadie lo vea.
- **A quién le pega:** A Dirección y a Fabricación, cada día.
- **Arreglo (S):** Mientras Material siga en mantenimiento: apagar el aviso de material, esconder la pestaña y la tarjeta del almacén, y quitar la alarma de conteo. Es la decisión que quedó pendiente el 13 de octubre (fabmat-1 y fabmat-8).
- **Confianza:** Comprobado en navegador · tanda 6 · **decide Elías**
- **Dónde:** `js/mod/material.js:199 · js/mod/fabricacion.js:1049, 1193, 1375, 1427, 1498, 2405, 1592 · js/datos/agenda.js:696-707 (también CM-12)`

### TR-3 · Alto · Entrada y Ajustes — Ajustes sigue contando la plataforma de antes

- **Qué pasa:** Con la base mandando, Ajustes dice que «la hoja de finanzas es el libro mayor», que «no hay copia en la nube» y que «el respaldo es la única defensa». La tarjeta principal sigue llamándose «La hoja de finanzas», con «Puente enchufado» y el botón «Traer el dinero de la hoja» (también para Fabricación). El índice de arriba tiene «Puente» y no tiene «Supabase», aunque Control y la bandeja mandan a «Ajustes → Supabase».
- **A quién le pega:** A los tres roles, cada vez que algo los manda a Ajustes.
- **Arreglo (M):** Con la base: «La base de datos» primero y en el índice; la tarjeta de la hoja plegada como «Hoja (solo lectura: Drive, IA, Maps y el sello)»; reescribir «Lo que esta pantalla tiene que decir»; botón «Traer de la base».
- **Confianza:** Comprobado en navegador · tanda 5
- **Dónde:** `js/mod/ajustes.js:362, :834-839, :931-939, :1616-1635, :1290`

### TR-4 · Alto · Entrada y Ajustes — «Ahora no» en la banda de arriba parece inofensivo, y deja al teléfono desconectado todo el día

- **Qué pasa:** La banda dice «Conecta tu cuenta a la nube con un toque» con un botón «Ahora no». Con la base mandando y sin sesión, el teléfono no sube ni baja nada. Tras «Ahora no» solo queda una nube roja de 20 px: Tablero, Proyectos y Calendario siguen con datos viejos sin decirlo, y lo que se capture se queda en el teléfono.
- **A quién le pega:** Sobre todo a Fabricación en el iPhone (Safari no da la cuenta en silencio).
- **Arreglo (M):** Con la base mandando, que la banda diga «Sin esto, lo que hagas se queda solo en este teléfono». Cambiar «Ahora no» por «Recordármelo» (vuelve a los 15 min), y un aviso fijo en el Tablero mientras no haya sesión.
- **Confianza:** Leído en el código · tanda 3
- **Dónde:** `js/app.js:1856-1858 · js/datos/supa-relevo.js:114-116`

### ES-1 · Alto · Entrada y Ajustes — Dar de baja a alguien en Ajustes → Personas no lo saca: entra por la hoja, y la pantalla de bloqueo trae su propia salida

- **Qué pasa:** Si la base dice que la persona ya no está activa, la puerta no la deja fuera: le pregunta a la hoja, y quien sigue en la pestaña «Accesos» entra con su rol de siempre. Ya adentro, la app sí la tapa con «Tu acceso a AL3D se retiró», pero esa pantalla trae el botón «Apagar Supabase en este aparato». Al tocarlo se recarga y abre Control con los datos de dinero guardados en el teléfono. La confirmación de «Dar de baja» no avisa que también hay que quitarla de «Accesos».
- **A quién le pega:** A Dirección, el día que da de baja a alguien de Pagos o del taller.
- **Arreglo (M):** Con la base mandando, que la puerta trate «dado de baja» como «fuera» en lugar de preguntar a la hoja; quitar «Apagar Supabase» de la pantalla de bloqueo y borrar el pase al bloquear. Mientras tanto: al dar de baja a alguien, quitarlo también de «Accesos» de la hoja (y que la confirmación lo diga).
- **Confianza:** Comprobado en navegador (verificado otra vez en el código) · tanda 2
- **Dónde:** `js/nucleo/puerta.js:541-543, 589-593 · js/nucleo/supa.js:460-509 · js/mod/ajustes.js:1438-1439`

### ES-2 · Alto · Entrada y Ajustes — En tema claro, la pantalla «Tu acceso se retiró» es texto blanco sobre gris claro

- **Qué pasa:** El color de la letra apunta a una variable que no existe, y queda blanco sobre gris claro (contraste ~1:1). No se lee ni el título ni la explicación.
- **A quién le pega:** A la persona dada de baja, justo cuando hay que explicarle qué pasó.
- **Arreglo (S):** Usar los colores reales de la app (--sup y --tinta) o una clase de sistema.css.
- **Confianza:** Comprobado en navegador (verificado otra vez en el código) · tanda 2
- **Dónde:** `js/nucleo/supa.js:495-496`

### TR-2 · Alto · Toda la app — El asistente ✦ sigue diciendo que el dinero se registra en la hoja

- **Qué pasa:** El asistente no sabe que la base manda. A «¿cómo pago esta comisión?» contesta «Registra el abono con ⚡ AL3D → Registrar abono de comisión en la hoja. La plataforma solo lo espeja», y su botón «Comisiones en la hoja» abre la hoja. Desde hoy, lo que se escriba en la hoja ya no llega a la base: es un abono que nadie lee.
- **A quién le pega:** A Pagos y a Dirección, cuando le preguntan al asistente por comisiones, saldos o liquidaciones.
- **Arreglo (S):** Pasarle el modo al asistente. Con la base: «se registra en Control → Cobros y abonos», el enlace a esa pestaña, y quitar «la plataforma solo la espeja», «LIQUIDADO en la hoja» y «saldo que calcula la hoja».
- **Confianza:** Leído en el código (verificado otra vez en el código) · tanda 1
- **Dónde:** `js/datos/asistente-contexto.js:306-309, :492, :555`

### ES-3 · Alto · Toda la app — Ventanas de permiso de Google que se abren solas mientras se trabaja

- **Qué pasa:** Con la base mandando, entrar por el botón de Google de la puerta ya no deja el permiso de la hoja. Pero cada 5 minutos la app revisa las carpetas de Drive y los links de Maps, que siguen en la hoja. Si en ese segundo la persona acaba de tocar algo, la app pide el permiso y Google abre su ventana en medio del trabajo. En un teléfono que nunca dio ese permiso (como los de Fabricación), puede repetirse cada 5 minutos; si se cierra, Proyectos enseña un error de Drive.
- **A quién le pega:** A los tres roles, sobre todo a Fabricación.
- **Arreglo (M):** Con la base mandando, que las revisiones de fondo nunca abran la ventana de Google; el permiso de la hoja se pide solo desde un botón explícito («Conectar Drive», «Autorizar», la IA).
- **Confianza:** Leído en el código · tanda 3
- **Dónde:** `js/datos/carpetas.js:180 · js/datos/puente.js:960-976 · js/nucleo/ingreso.js:61-62, 431-433 · js/app.js:2536-2547 (también H-4)`

### ES-4 · Alto · Toda la app — Un teléfono sin sesión en la base dice «0 trabajos» y «Nada urgente hoy»

- **Qué pasa:** Con la base mandando y sin sesión (Safari, «Ahora no», Google que no cargó), el teléfono no baja nada. En uno que nunca bajó, el Tablero afirma «0 trabajos en el taller» y «Nada urgente hoy». Si Google no cargó al abrir, la app no vuelve a intentar hasta reabrirla, aunque vuelva la señal; solo queda una cruz de 20 px.
- **A quién le pega:** A un instalador nuevo o a un teléfono reinstalado: ve el taller vacío y tranquilo.
- **Arreglo (M):** Con la base mandando y sin sesión, un estado propio en vez de los vacíos («Este teléfono no ha entrado a la base: lo que ves puede no estar al día», con el botón de Google ahí mismo), y volver a intentar al recuperar la señal y al volver a la app.
- **Confianza:** Comprobado en navegador · tanda 3
- **Dónde:** `js/datos/supa-relevo.js:236-239, 431-435 · js/app.js:1812`

### TR-5 · Medio · Control y dinero — Control: quedan frases de «la hoja» con la base mandando

- **Qué pasa:** Ya estaban en la lista de BASE-MANDA: el globo «Venta de la hoja», «Por cobrar — según la hoja» y las explicaciones del Resumen. Nuevas: los estados vacíos («Cuando una venta pase a COBRANDO en la hoja»), «Un saldo es estimado: la hoja todavía no lo trae», «saldo de la hoja», «Marcar LIQUIDADO — en la hoja…», «Esta venta solo está en la hoja de finanzas», «se corrige en la columna Tipo de trabajo de la hoja» (hoy es en la ficha) y «Escrito en la hoja» en un gasto.
- **A quién le pega:** A Dirección y a Pagos.
- **Arreglo (M):** Una sola función «la base / la hoja» en esas frases; con la base, «saldo registrado».
- **Confianza:** Leído en el código · tanda 5
- **Dónde:** `js/mod/control.js:241, 667-669, 709, 768, 869-875, 989-991, 1014-1015, 1150-1156, 1387-1393, 1420, 1497-1504, 1550, 1863`

### TR-8 · Medio · Control y dinero — Con la base, el dinero se mueve en Control, y Control queda lejos en el teléfono

- **Qué pasa:** En el teléfono de Dirección, Control vive en «Más» (dos toques). Dentro hay 9 pestañas en rejilla de 3×3, con letra de 11.5 px, y «Cobros y abonos», la pantalla de trabajo de Pagos, queda en la 7.ª posición.
- **A quién le pega:** A Pagos y a Dirección, varias veces al día.
- **Arreglo (M):** Con la base mandando, «Cobros y abonos» como segunda pestaña o un atajo en el Tablero de Pagos y Dirección. Decisión tuya: si Control entra a la barra de Dirección en lugar del Cotizador.
- **Confianza:** Comprobado en navegador · tanda 6 · **decide Elías**
- **Dónde:** `js/app.js (RUTAS) · js/mod/control.js (tabs)`

### TR-9 · Medio · Control y dinero — Sin datos todavía, el Resumen dice $0.00 y «ya está todo cobrado»

- **Qué pasa:** Sin récord bajado (sin señal o sin sesión), el Resumen enseña «Disponible $0.00» y «Todo lo que está en fabricación y en cobranza ya está cobrado». Arriba sí dice que no se ha traído el récord, pero un cero afirmativo frente al cliente lleva a malas decisiones.
- **A quién le pega:** A Dirección y a Pagos, al abrir Control sin señal o sin sesión.
- **Arreglo (S):** Mientras no haya datos completos, cifras en «—» y la frase «sin datos de la base todavía».
- **Confianza:** Comprobado en navegador · tanda 3
- **Dónde:** `js/mod/control.js (Resumen)`

### DN-3 · Medio · Control y dinero — El «Disponible» del mes se mueve con los cobros en partes y con fechas atrasadas

- **Qué pasa:** La base guarda la liquidación como una sola cifra con la fecha del último cobro, y la pisa aunque esa fecha sea más vieja. Un cliente que pagó $10,000 en septiembre y $5,000 en octubre suma $15,000 al disponible de octubre. Capturar hoy un cobro olvidado con fecha de septiembre manda toda la liquidación a septiembre, y octubre baja. Está en la letra chica, pero la cifra grande no avisa.
- **A quién le pega:** A Dirección, al leer el disponible del mes.
- **Arreglo (M):** Contar cada cobro con su monto y su fecha (las líneas de la bitácora ya los tienen). Mínimo: que un cobro con fecha vieja no retroceda la fecha de la liquidación.
- **Confianza:** Leído en el código · tanda 4
- **Dónde:** `supabase/migrations/0012_endurecimiento.sql:43 · js/datos/dinero-cuentas.js:97`

### DN-4 · Medio · Control y dinero — Un gasto nuevo arranca en «Efectivo u otra», la opción que no resta del disponible

- **Qué pasa:** «Cuenta de la que salió» viene preseleccionada en «Efectivo u otra». Si quien captura no la cambia, el gasto no resta de Elias BBVA y el «Disponible» sale inflado sin que nadie lo note.
- **A quién le pega:** A Dirección y a Pagos, en cada gasto desde «+ Gasto».
- **Arreglo (S):** Con la base mandando, sin opción preseleccionada («Elige la cuenta…») y obligatoria, o la última usada en ese teléfono.
- **Confianza:** Comprobado en navegador · tanda 1
- **Dónde:** `js/mod/control.js:1918`

### DN-5 · Medio · Control y dinero — «+ Ingreso» solo sirve para cobrar una venta, y el formulario habla como contador

- **Qué pasa:** El botón abre «Cobro o anticipo» y exige elegir una venta: no hay cómo registrar dinero que entra sin venta (un préstamo, un traspaso, un reembolso). El formulario dice «Cobro (se suma)», «Anticipo (total)», «liquidación», «asiento». Cobrar con «Cobro» el anticipo de una venta del Cotizador que ya lo traía lo cuenta dos veces.
- **A quién le pega:** A Pagos y a Dirección.
- **Arreglo (M):** Rotular «+ Cobro de una venta»; en el formulario, «Pago del cliente (después del anticipo)» y «Corregir el anticipo», con la nota de que el anticipo del Cotizador ya está registrado. Si quieres registrar ingresos sin venta, hace falta una tabla nueva.
- **Confianza:** Comprobado en navegador · tanda 5 · **decide Elías**
- **Dónde:** `js/mod/control.js:2078-2082 · js/mod/pagos-supa.js`

### DN-6 · Medio · Control y dinero — Para elegir la venta hay un desplegable con las 221, sin buscador

- **Qué pasa:** En los cinco formularios, la venta se elige de un solo desplegable. En el iPhone la rueda corta el texto («V-215 · Restaurante Mar Azul — sal…») y no se puede buscar por cliente ni por folio. En «Datos de la venta» ni siquiera hay un orden útil.
- **A quién le pega:** A Pagos, en cada cobro: es fácil elegir la venta de al lado.
- **Arreglo (M):** Un buscador con lista (nombre, V-###, monto). Mínimo: grupos «Con saldo / Liquidadas / Canceladas» y el saldo al principio.
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `js/datos/pagos-supa.js:273-281`

### CZ-5 · Medio · Cotizador — Hay dos reglas de IVA para la misma venta, y el aviso describe la de la hoja

- **Qué pasa:** El aviso dice «la hoja le quita el IVA». La base no lo hace: una venta que entra desde el Cotizador guarda el IVA de la cotización aunque la cuenta no facture (Elias BBVA). Una venta sin cotización sí lo saca de la cuenta. Queda una venta con IVA en una cuenta que Facturas no lista.
- **A quién le pega:** A Pagos y a Dirección, al cuadrar Facturas y el disponible.
- **Arreglo (M):** Decisión tuya: lo coherente con Facturas es que la cuenta mande, como en «Venta sin cotización» y «Datos de la venta». Después, corregir el texto.
- **Confianza:** Leído en el código · tanda 4 · **decide Elías**
- **Dónde:** `js/cotizador/venta.js:115-116 · supabase/migrations/0006_rpc_obra.sql (ganar_proyecto vs alta_venta:415) · js/datos/supa-traductor.js:95`

### CZ-6 · Medio · Cotizador — Un cambio de precios no llega a los teléfonos que tienen la app abierta

- **Qué pasa:** El aviso al guardar dice que los demás los toman «al abrir el Cotizador», pero el Cotizador no se recarga al cambiar de pantalla y no vuelve a pedir precios al regresar a la app. En un iPhone con la app viva se cotiza con lo de ayer hasta que la autorización rebota.
- **A quién le pega:** A quien cotiza el día que Dirección cambia precios.
- **Arreglo (S):** Volver a pedir los precios al regresar a la app (como mucho una vez cada 5 min) y corregir el texto.
- **Confianza:** Leído en el código · tanda 4
- **Dónde:** `js/cotizador/tarifas.js:212, :248, :368`

### CZ-7 · Medio · Cotizador — No se ve de quién es una cotización, y editar la de otro la cambia para todos

- **Qué pasa:** Una cotización de otro teléfono se ve igual a las propias: solo la delata la letra del folio, y sale el nombre de quien autorizó, no el del vendedor. «Abrir y editar» sobre la de otro la pisa en el teléfono de quien la hizo.
- **A quién le pega:** A Dirección, con el historial de toda la empresa.
- **Arreglo (M):** Guardar el vendedor y pintar una chapa «de <nombre>» cuando no es de este teléfono; pedir una confirmación de un renglón antes de editar una ajena.
- **Confianza:** Comprobado en navegador · tanda 4
- **Dónde:** `js/cotizador/historial.js:178-184`

### CZ-8 · Medio · Cotizador — El aviso rojo de «folio repetido» sale en cada apertura y no tiene arreglo

- **Qué pasa:** «Una cotización de la base no entra a este historial: su folio ya es de otra de este teléfono» sale en rojo, 9 s, cada vez que se abre la app. Cambiar la letra no arregla los folios que ya existen. La letra sale al azar del aparato: con 5 teléfonos hay ~36 % de probabilidad de que dos compartan letra.
- **A quién le pega:** A Dirección y a Pagos.
- **Arreglo (M):** Avisarlo una sola vez por cotización, sin rojo, con el folio y el teléfono. Que la base asigne una letra por persona.
- **Confianza:** Comprobado en navegador · tanda 4
- **Dónde:** `js/cotizador/historial.js:280-284 · js/cotizador/entrega.js:336-341`

### TP-5 · Medio · Proyectos y Tablero — Un cambio que la base rechaza deja la tarjeta movida solo en este teléfono, y solo Ajustes lo dice

- **Qué pasa:** Si la base rechaza para siempre un cambio de etapa (por ejemplo, mover una cotización que no se dio, o un rol sin permiso), el teléfono lo aparta. La tarjeta se queda en la etapa nueva, el glifo no pone cruz y el aviso solo vive en Ajustes. Este teléfono y los demás ven etapas distintas.
- **A quién le pega:** A quien mueve tarjetas en el Tablero o la ficha.
- **Arreglo (M):** Una marca en la tarjeta y en la ficha («No se guardó: motivo · Ver») y un botón «Volver a lo de la base».
- **Confianza:** Leído en el código · tanda 3
- **Dónde:** `js/datos/sync.js:677-688 · js/app.js:2501-2508 · js/datos/supa-relevo.js:347`

### TP-6 · Medio · Proyectos y Tablero — El buscador de Proyectos no encuentra por V-###, y la ficha no lo enseña

- **Qué pasa:** Buscar «V-321» o «321» da 0 resultados. Con la base mandando, el V-### es la llave común: lo da el recibo del Cotizador y lo usan Cobros y abonos y Facturas. La cabecera de la ficha solo enseña el COT.
- **A quién le pega:** A Dirección y a Pagos, al buscar una venta que vieron en Control.
- **Arreglo (S):** Buscar también por V-### y por folio global, y enseñar el V-### junto al COT en la tarjeta y la ficha.
- **Confianza:** Comprobado en navegador · tanda 4
- **Dónde:** `js/datos/proyectos.js:930-933`

### TP-7 · Medio · Proyectos y Tablero — Fabricación ve «Cuenta de cobro» y «Estatus en la hoja (dinero)» en la ficha

- **Qué pasa:** Esos dos renglones están fuera del bloque de lo que solo ve quien maneja dinero. En ventas nuevas dicen «Sin capturar» en amarillo (una falsa alarma que Fabricación no puede arreglar). En las viejas enseñan la cuenta que quedó en el teléfono (Constru BNT, Moni MPago…), contra la regla de que Fabricación no ve nada de dinero.
- **A quién le pega:** A Fabricación, en cada ficha.
- **Arreglo (S):** Meter «Cuenta de cobro» dentro del bloque de dinero y quitarle «(dinero)» al estatus para Fabricación.
- **Confianza:** Comprobado en navegador (verificado otra vez en el código) · tanda 2
- **Dónde:** `js/mod/proyectos.js:1429-1432`

### CM-3 · Medio · Calendario y Mapa — En el teléfono, lo de hoy queda abajo, tapado por la barra

- **Qué pasa:** A 375 px el título «hoy» empieza en y=695, debajo de «Agendar» y de la barra de abajo; lo primero que se ve es el mes con puntos. En «Semana», hoy queda al final.
- **A quién le pega:** A Fabricación, cada mañana.
- **Arreglo (M):** En el teléfono, abrir en «Lista» para Fabricación, o poner hoy arriba de la rejilla.
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `js/mod/fabricacion.js`

### CM-4 · Medio · Calendario y Mapa — «Ver en Maps» del renglón mide 69×16 px

- **Qué pasa:** Es el «cómo llegar» de los instaladores y es un enlace diminuto pegado a la dirección; en «Lista» se parte en dos renglones. Los demás botones del renglón miden 40 px, y Mes/Semana/Lista 34 px (la regla es 44×44).
- **A quién le pega:** A los instaladores, en la calle.
- **Arreglo (S):** Un botón «Cómo llegar» de 44 px en la fila de acciones, como en la tira del Mapa.
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `js/mod/fabricacion.js`

### CM-5 · Medio · Calendario y Mapa — Marcar «Ya se instaló» cuesta tres pasos

- **Qué pasa:** Hay que bajar, tocar «Abrir» y luego «Ya se instaló» en la ficha. El renglón ofrece en cambio «Al calendario del teléfono» e «Instalador» (en la ficha se llama «Orden al instalador»).
- **A quién le pega:** A Fabricación, en cada instalación.
- **Arreglo (S):** En las citas de hoy y atrasadas, «Ya se instaló» (con deshacer) en lugar de «Al calendario del teléfono».
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `js/mod/fabricacion.js`

### CM-6 · Medio · Calendario y Mapa — «Listo para instalar» e «Instalado» tienen casi el mismo verde

- **Qué pasa:** En el teléfono la etapa solo se ve como un punto de color, y esos dos verdes casi no se distinguen (en claro y en oscuro).
- **A quién le pega:** A Fabricación y a Dirección.
- **Arreglo (S):** Otro tono para «Instalado», o un punto con forma o palomita.
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `css/plataforma.css (colores de etapa)`

### CM-7 · Medio · Calendario y Mapa — La hoja «Agendar» de Fabricación dice «Agendar» aunque solo propone

- **Qué pasa:** El botón es verde y dice «Agendar»; el aviso «queda como propuesta» está al final, debajo del pliegue. Con CM-1, la propuesta además llega como «Confirmada».
- **A quién le pega:** A Fabricación.
- **Arreglo (S):** Rótulo «Proponer» y el aviso arriba del formulario; va junto con CM-1.
- **Confianza:** Comprobado en navegador · tanda 4
- **Dónde:** `js/mod/fabricacion.js:2207-2214`

### CM-8 · Medio · Calendario y Mapa — El globo rojo del Calendario suma todos los «sin ubicar» del Mapa

- **Qué pasa:** En la prueba de Fabricación el Calendario marcó 14 con solo 3 pendientes de agenda. Con ventas importadas sin pin, el globo queda alto para siempre y deja de significar algo.
- **A quién le pega:** A Dirección y a Fabricación.
- **Arreglo (S):** Contar solo los sin pin con instalación en los próximos 15 días, o un globo neutro para eso.
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `js/app.js:1382 · js/mod/mapa.js:392`

### ES-5 · Medio · Entrada y Ajustes — «Salir de Supabase» no pregunta, y después el glifo sigue diciendo «al día»

- **Qué pasa:** Es el primer botón de la tarjeta y sale de un toque. La app no se entera de que la sesión se cerró: a los 33 s el glifo seguía en «Sincronización: al día». Pasa lo mismo si la sesión se cae sola.
- **A quién le pega:** A los tres roles.
- **Arreglo (S):** Confirmar «Salir» con la base mandando, y escuchar el cierre de sesión para poner la cruz y volver a ofrecer la banda.
- **Confianza:** Comprobado en navegador · tanda 3
- **Dónde:** `js/mod/ajustes.js:1423 · js/datos/supa-relevo.js:63 · js/datos/supa-enchufe.js:352-354`

### ES-6 · Medio · Entrada y Ajustes — Cuando el captcha pide marcar la casilla, la puerta dice «En un momento puedes entrar»

- **Qué pasa:** Hoy en la app publicada el captcha pidió casilla. Mientras no se marque, el botón oficial de Google no sale (por eso no apareció), y la nota dice «Comprobando que eres una persona… En un momento puedes entrar». Si se toca el botón de la app, sale «toca otra vez». Nunca dice «marca la casilla». Y entrar por el botón de la app en un teléfono nuevo cuesta dos toques (la hoja y luego la base).
- **A quién le pega:** A teléfonos nuevos, redes con VPN y navegadores dentro de otras apps.
- **Arreglo (S):** Cuando el captcha pide casilla, decir «Marca la casilla de abajo para seguir».
- **Confianza:** Comprobado en navegador · tanda 5
- **Dónde:** `js/nucleo/puerta.js:1091, 1170`

### ES-7 · Medio · Entrada y Ajustes — «Apagar en este aparato» sigue a la mano de los tres roles con la base mandando

- **Qué pasa:** Apagado, el teléfono escribe en una hoja de solo lectura y la puerta deja de enseñar el botón de Google. La pregunta lo advierte, pero cualquiera de los tres roles lo tiene a un toque.
- **A quién le pega:** A Pagos y a Fabricación.
- **Arreglo (S):** Con la base mandando, solo Dirección lo ve, o va detrás de «Avanzado».
- **Confianza:** Comprobado en navegador · tanda 2
- **Dónde:** `js/mod/ajustes.js:1285, 1298, 1322, 1417-1418`

### ES-8 · Medio · Entrada y Ajustes — Lo que la base rechazó se ve sin decir de qué venta era, y solo se puede «Volver a intentar»

- **Qué pasa:** La lista de apartados vive en la tarjeta del puente y solo enseña el texto del error, sin cliente, campo ni fecha. Para la venta apartada de Pagos (CZ-1) no dice de qué cliente es. «Volver a intentarlos» rebota igual, y no hay «Descartar» ni «Pasar a Dirección».
- **A quién le pega:** A quien tiene algo apartado y a Dirección cuando le preguntan.
- **Arreglo (M):** Cada apartado con el nombre del proyecto y qué cambio era, más «Descartar» con confirmación; con la base mandando, en la tarjeta de la base.
- **Confianza:** Leído en el código · tanda 3
- **Dónde:** `js/mod/ajustes.js:750-759`

### ES-9 · Medio · Entrada y Ajustes — Si la base no contesta, la puerta habla de «mientras la empresa siga trabajando con la hoja»

- **Qué pasa:** Los mensajes de la puerta cuando la base tarda o la persona no está activa siguen hablando de la hoja, y el renglón del camino dice «La hoja · qué te toca».
- **A quién le pega:** A quien entra con mala señal.
- **Arreglo (S):** Frases según quién manda: «La base no contestó: toca otra vez».
- **Confianza:** Leído en el código · tanda 5
- **Dónde:** `js/nucleo/puerta.js:174-175, 193-194, 863`

### TR-6 · Medio · Toda la app — Mapa, Calendario, Cotizador y «Qué atender»: más frases de la hoja y jerga

- **Qué pasa:** Mapa: el chip «Sin estatus en la hoja» y «el pin se pone cuando sincronice con la hoja». Calendario: las notas «Agendada desde la hoja», «así quedó en la hoja» y «vino de la hoja». Qué atender: «El puente está puesto · base», «Pon Estatus en la hoja en COBRANDO» y «Sin respaldo… el respaldo es la única defensa». Cotizador: la comisión «la misma que calcula la hoja de finanzas». (Lo del sello, la IA y la autorización sigue siendo cierto: el notario se quedó en la hoja.)
- **A quién le pega:** A los tres roles.
- **Arreglo (M):** «Estatus de cobro» en vez de «Estatus en la hoja»; «Sincroniza con la base» en vez de «El puente está puesto»; notas neutras en las citas.
- **Confianza:** Leído en el código · tanda 5
- **Dónde:** `js/mod/mapa.js:161 · js/datos/geo.js:56 · js/datos/puente.js:775, 797, 835 · js/datos/agenda.js:703 · js/mod/inicio.js:486, 716 · js/datos/reglas.js:102 · js/cotizador/venta.js:163 (también CM-9, CZ-10)`

### TR-7 · Medio · Toda la app — Sin señal, el error habla de «Apps Script» y «Cualquier usuario»

- **Qué pasa:** «No se pudo llegar al puente. Puede ser que no haya señal, o que la implementación del Apps Script no esté publicada con acceso Cualquier usuario.» Sale sin señal en la caja de Drive de Proyectos (también con la base) y en el glifo.
- **A quién le pega:** A los tres roles, sin señal.
- **Arreglo (S):** «Sin señal: lo de Drive se ve en cuanto vuelva»; la pista técnica solo en Ajustes → Avanzado.
- **Confianza:** Comprobado en navegador · tanda 5
- **Dónde:** `js/datos/puente.js:1041`

### TR-10 · Medio · Toda la app — La primera carga baja ~400 KB comprimidos de CSS y JS antes de poder tocar

- **Qué pasa:** 51 peticiones y 2.7 MB sin comprimir. sistema.css (557 KB) trae también los estilos del Cotizador, que vive en su propio marco. La segunda carga sale del service worker y es rápida (0.7 s), pero el primer día y después de cada versión nueva, en 4G, se nota.
- **A quién le pega:** A todos, después de cada versión.
- **Arreglo (L):** Separar el CSS del Cotizador del de la plataforma y cargar el CSS del mapa solo con el Mapa.
- **Confianza:** Comprobado en navegador · tanda 7
- **Dónde:** `css/sistema.css · css/plataforma.css · js/piezas.js`

### H-1 · Medio · Toda la app — Se crean 2 a 4 conexiones a Supabase en cada carga

- **Qué pasa:** Cuando varias partes de la app piden la conexión al mismo tiempo, cada una crea la suya. Son varias sesiones iguales renovando la llave por su cuenta y canales de tiempo real colgados de conexiones huérfanas. Puede explicar avisos que llegan dos veces o una sesión que se cae sola.
- **A quién le pega:** A los tres roles, con la base mandando.
- **Arreglo (S):** Guardar la promesa de la conexión, no la conexión: un cambio de una línea.
- **Confianza:** Leído en el código (verificado otra vez en el código) · tanda 3
- **Dónde:** `js/nucleo/supa.js:214-221`

### TR-11 · Bajo · Control y dinero — «+ Ingreso» y «+ Gasto» no miden lo mismo

- **Qué pasa:** En la tarjeta «Disponible», Ingreso mide ~53 px de alto y Gasto ~45 px, en el mismo renglón.
- **A quién le pega:** A Dirección y a Pagos.
- **Arreglo (S):** El mismo alto y la misma clase de botón.
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `js/mod/control.js (tarjeta Disponible)`

### H-2 · Bajo · Control y dinero — En Cuentas, cada casilla queda en su propio renglón, encima del nombre

- **Qué pasa:** En «Qué cuentas son dinero disponible», la regla de estilo busca un label dentro de .pg-check, pero aquí el label es el propio .pg-check.
- **A quién le pega:** A Dirección.
- **Arreglo (S):** Darle flex a .ct-cta-casilla.
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `css/plataforma.css:4756 · js/mod/control.js:2173`

### H-5 · Bajo · Control y dinero — Facturas enseña el estatus en código y mezcla formatos de fecha

- **Qué pasa:** Sale «FABRICACION» o «COBRANDO» tal cual viene de la base, y las fechas mezclan «09/09/2026» con «22 oct 2026». A 375 px los tres indicadores quedan en 2+1, con medio renglón vacío.
- **A quién le pega:** A Dirección y a Pagos.
- **Arreglo (S):** Estatus con su nombre y su chip de color, una sola forma de fecha, y los tres indicadores en una fila o en columna.
- **Confianza:** Comprobado en navegador · tanda 5
- **Dónde:** `js/mod/facturas.js · js/mod/cuentas.js`

### DN-7 · Bajo · Control y dinero — Al recargar la app, el aviso del cobro en duda desaparece

- **Qué pasa:** Quedan los datos tecleados, pero ya no hay letrero de que el envío anterior quedó en duda. Al cerrar la app en el iPhone se pierde todo, y el siguiente envío va como uno nuevo (con DN-1, más riesgo de doble cobro).
- **A quién le pega:** A Pagos.
- **Arreglo (S):** Pintar el aviso desde el borrador en duda y guardarlo de forma que sobreviva al cierre.
- **Confianza:** Comprobado en navegador · tanda 4
- **Dónde:** `js/mod/pagos-supa.js (_aviso, borrador.incierto)`

### DN-8 · Bajo · Control y dinero — En «Datos de la venta», cambiar a una cuenta fiscal no mueve el campo IVA

- **Qué pasa:** La nota dice «Con esta cuenta la venta lleva IVA (16 %)», pero el desplegable sigue en «Sin IVA».
- **A quién le pega:** A Dirección.
- **Arreglo (S):** Mover el desplegable al valor que pone la cuenta, o apagarlo junto con la nota.
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `js/datos/pagos-supa.js:517`

### DN-9 · Bajo · Control y dinero — Cobros y abonos en escritorio: botones de ~1000 px y huecos sueltos

- **Qué pasa:** «Volver a leer las ventas» y «Registrar cobro…» ocupan todo el ancho; entre la casilla LIQUIDADA y su nota queda un hueco grande.
- **A quién le pega:** A Dirección en la computadora.
- **Arreglo (S):** Un ancho máximo para el pie del formulario y la nota pegada a la casilla.
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `css/plataforma.css (Cobros y abonos)`

### CZ-11 · Bajo · Cotizador — Con la base, el botón «Registrar venta» no da señal de trabajo

- **Qué pasa:** Con la hoja, el botón decía «Registrando… / Registrada». Con la base no cambia; el resultado vive en un recibo al pie del modal, fuera de la vista en escritorio.
- **A quién le pega:** A quien registra una venta.
- **Arreglo (S):** Poner el botón en «Registrada · esperando folio» y desplazar el modal hasta el recibo.
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `js/cotizador/venta.js`

### CZ-9 · Bajo · Cotizador — La imagen de referencia que no viaja sale en otro teléfono como un documento que no abre

- **Qué pasa:** La imagen con la que se cotizó no se sincroniza. En otro teléfono la entrada pinta el ícono de documento, como si hubiera algo que abrir.
- **A quién le pega:** A Dirección, al revisar cotizaciones de otros.
- **Arreglo (S):** Un ícono de imagen apagado con «La referencia está en el teléfono que la cotizó».
- **Confianza:** Leído en el código · tanda 7
- **Dónde:** `js/cotizador/historial.js:783-785 · js/datos/supa-cotizaciones.js:100-105`

### TP-10 · Bajo · Proyectos y Tablero — «Instalación pasada sin marcar» cuenta proyectos que ya están instalados

- **Qué pasa:** El Tablero no excluye proyectos en Instalado o En garantía; «Qué atender» sí. Con CM-1 esto pasa más seguido.
- **A quién le pega:** A Dirección, en el Tablero.
- **Arreglo (S):** La misma guarda que usa «Qué atender» (regla A10).
- **Confianza:** Comprobado en navegador · tanda 6
- **Dónde:** `js/mod/tablero.js:288-290 · js/datos/reglas.js:504`

### TP-12 · Bajo · Proyectos y Tablero — «Enseñar al cliente» no tapa la lista: al cerrar la ficha se ven los totales de otros clientes

- **Qué pasa:** El modo cliente solo tapa lo interno de la ficha. Al cerrarla delante del cliente, la lista y el Tablero enseñan nombres, totales y «resta» de los demás.
- **A quién le pega:** A quien enseña una ficha en el teléfono frente al cliente.
- **Arreglo (S):** Mientras el modo cliente esté encendido, difuminar los montos de las demás tarjetas. Puede ser decisión tuya.
- **Confianza:** Leído en el código · tanda 7 · **decide Elías**
- **Dónde:** `js/mod/proyectos.js (CSS .pf-interno, .pf-cuenta.dinero)`

### TP-9 · Bajo · Proyectos y Tablero — El lector de pantalla solo oye «Abrir …» en cada tarjeta

- **Qué pasa:** La etiqueta de la tarjeta reemplaza todo su contenido: no se oyen la etapa, la fecha ni el saldo.
- **A quién le pega:** A quien usa el lector de pantalla.
- **Arreglo (S):** Quitar el aria-label o usar aria-describedby.
- **Confianza:** Leído en el código · tanda 7
- **Dónde:** `js/mod/proyectos.js:863-864`

### CM-10 · Bajo · Calendario y Mapa — «Lo Que Viene» y «Toda La Agenda» salen en mayúscula de título

- **Qué pasa:** La regla que pone en mayúscula el nombre del mes alcanza también a esos títulos.
- **A quién le pega:** A todos.
- **Arreglo (S):** Aplicarla solo al nombre del mes.
- **Confianza:** Comprobado en navegador · tanda 7
- **Dónde:** `css/plataforma.css:517`

### CM-11 · Bajo · Calendario y Mapa — En el Mapa del teléfono, el botón del asistente tapa la tira de paradas

- **Qué pasa:** El botón flotante tapa el borde derecho de la tira; los pines miden 32×34 px.
- **A quién le pega:** A Fabricación.
- **Arreglo (S):** Subir el botón del asistente cuando la tira está a la vista.
- **Confianza:** Comprobado en navegador · tanda 7
- **Dónde:** `js/mod/mapa.js`

### H-3 · Bajo · Entrada y Ajustes — Doble punto en «p.m..» en la nota del Cotizador de Ajustes

- **Qué pasa:** La fecha ya termina en «p.m.» y el texto le agrega otro punto.
- **A quién le pega:** A los tres roles.
- **Arreglo (S):** Quitar el punto.
- **Confianza:** Comprobado en navegador · tanda 5
- **Dónde:** `js/mod/ajustes.js:1356`

### ES-10 · Bajo · Entrada y Ajustes — Ajustes → Supabase: restos de la etapa de prueba y personas con botones apilados

- **Qué pasa:** Sigue el bloque «Escritura en sombra», que dice «La hoja sigue mandando», con un botón que no hace nada. Cada persona lleva selector, «Cambiar área» y «Dar de baja» a todo lo ancho; «Dar de baja» se ve igual que «Cambiar área», sale también en tu propia fila, y darle a alguien el área de Dirección o Pagos (con acceso al dinero) no pregunta.
- **A quién le pega:** A Dirección.
- **Arreglo (M):** Quitar el bloque de la sombra con la base mandando; personas en una fila compacta, «Dar de baja» en rojo y sin acciones en «tú»; confirmar los cambios hacia Dirección o Pagos.
- **Confianza:** Comprobado en navegador · tanda 5
- **Dónde:** `js/mod/ajustes.js:1430-1433, 1483-1494`

### TR-12 · Bajo · Toda la app — Letra de 10 a 11.5 px y botones de 34 a 40 px en varios controles

- **Qué pasa:** Pestañas a 11.5 px, barra del teléfono a 11 px, etiquetas de la barra lateral y años de la gráfica a 10 px, tarjetas de Proyectos a 11 px. Botones por debajo de 44 px: filtro de etapa (34), segmentos de la ficha (34), chips de cuenta (40), cerrar (40), sesión del encabezado (36). Las capas de z-index no siguen una escala.
- **A quién le pega:** A todos, sobre todo en el teléfono y al sol.
- **Arreglo (M):** Mínimo de 12 px en lo que se lee, 44 px en lo que se toca, y tokens de z-index.
- **Confianza:** Comprobado en navegador · tanda 7
- **Dónde:** `css/sistema.css · css/plataforma.css (también TP-8, TP-11)`

### TR-13 · Bajo · Toda la app — Los atajos de la app instalada no incluyen Control y sí Material

- **Qué pasa:** Los atajos de la app (mantener presionado el ícono) son Tablero, Cotizador, Material y Calendario. Falta Control, la pantalla de Pagos; sobra Material, que está en mantenimiento. Hay además un manifest duplicado que nadie usa.
- **A quién le pega:** A Pagos y a Dirección.
- **Arreglo (S):** Cambiar Material por Control y quitar el duplicado.
- **Confianza:** Leído en el código · tanda 7
- **Dónde:** `manifest.webmanifest · manifest-plataforma.webmanifest`

### TR-14 · Bajo · Toda la app — Jerga técnica: «Supabase», «relevo», «Más módulos», «la nube»

- **Qué pasa:** «Supabase» como título de tarjeta y de ruta, «este dispositivo, respaldo y relevo», «Más módulos».
- **A quién le pega:** A los tres roles.
- **Arreglo (S):** «La base de datos» y «Más pantallas».
- **Confianza:** Comprobado en navegador · tanda 5
- **Dónde:** `js/app.js:130 · js/mod/ajustes.js`

### ES-11 · Bajo · Toda la app — Cada carga pregunta 4 a 6 veces quién eres y baja los proyectos dos veces

- **Qué pasa:** Además de las conexiones repetidas (H-1), cada carga pide el acceso varias veces y baja los proyectos dos veces.
- **A quién le pega:** A todos, con la base mandando.
- **Arreglo (S):** Arreglar H-1 y recordar el acceso unos segundos.
- **Confianza:** Comprobado en navegador · tanda 3
- **Dónde:** `js/nucleo/supa.js (acceso) · js/datos/supa-relevo.js`

## Lo que está bien

- Fabricación no ve un solo «$» en Tablero, Proyectos, Calendario, Mapa, Ajustes ni en la banda de arriba, y la base tampoco le baja columnas de dinero (la excepción es TP-7).
- El doble toque no duplica: ni la venta del Cotizador ni un cobro. El reintento normal usa el mismo número de operación y la base contesta lo de la primera vez.
- Las confirmaciones de dinero dicen de cuánto a cuánto y cómo quedan el neto, el saldo y la comisión; un cobro de más sale con «OJO» en rojo, y el reparto se recalcula antes de confirmar.
- Un aviso de otro teléfono no mueve el cursor ni borra lo que se está escribiendo, en Cobros y abonos ni con una ficha abierta.
- Sin sesión no se pierde nada: lo pendiente espera en el teléfono y sale cuando vuelve la sesión.
- Cero desborde de lado a 375 y 1280 px en todas las pantallas, roles y temas; los campos miden 16 px (el iPhone no hace zoom) y el contraste medido pasa 4.5:1 en Control, Ajustes, Tablero, Proyectos y Calendario.
- «Disponible» cuadra con los datos (en la prueba, $18,700 que entró menos $8,630 de gastos = $10,070) y separa claro las cuentas que no son de AL3D.
- Herramientas conserva el trabajo al salir y volver, y la segunda carga de la app sale del teléfono en ~0.7 s.

## Lo que no se pudo comprobar

- Nada se probó contra la base real ni con una sesión real de Google: el modo base se vio con una base de mentiras que imita a Supabase dentro del navegador.
- El iPhone de verdad: Safari, la app instalada, el botón oficial de Google, el teclado tapando campos y la muesca.
- Realtime entre dos teléfonos reales y después de horas en segundo plano; la ventana de permiso de Google de ES-3.
- Datos de producción: si ya hay ventas apartadas en el teléfono de Pagos (CZ-1), cuántas canceladas tienen comisión pendiente (DN-2) y si hay cobros en partes que cruzan de mes (DN-3).
- La subida real de constancias e imágenes a Storage, y la red real (los tiempos son de la computadora).

## Cómo se hizo

Siete agentes revisaron en paralelo con la skill ui-ux-pro-max (accesibilidad, toques, formularios, navegación, estados vacíos y de error). Abrieron la app en Chromium a 375 px y 1280 px, en claro y en oscuro, con los tres roles. Áreas: Control y el dinero, Cotizador, Tablero y Proyectos, Calendario, Mapa y Herramientas, Entrada y Ajustes, y lo transversal.

Para ver la app como está hoy, con la base mandando, uno de ellos armó una base de mentiras que imita a Supabase en el navegador (13 ventas, cuentas, gastos, facturas y personas). Nada salió a internet ni tocó la base real.

Los hallazgos marcados como «verificado otra vez» los revisé yo en el código. No se repite lo de las auditorías anteriores (REVISION-UIUX-2026-10 y AUDITORIA-TECNICA-2026-10); sus puntos abiertos siguen en sus documentos.

Tamaño del arreglo: S, menos de 1 hora; M, de 1 a 3 horas; L, más de 3 horas.
