<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo-al3d-oscuro.svg">
    <img src="logo-al3d.svg" alt="AL3D — Anuncios Luminosos 3D" width="320">
  </picture>
</p>

<h1 align="center">Cotizador AL3D</h1>

<p align="center">
  Cotizador de anuncios luminosos: letras 3D, recorte de acrílico, bastidores y cajas de luz.
</p>

<p align="center">
  <a href="https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/cotizador.html"><b>▶ Abrir el cotizador</b></a>
</p>

---

## Qué hace

- **Partidas por tipo** — letras 3D, recorte de acrílico, bastidor, caja de luz o captura manual, cada una con su catálogo de materiales y tarifas. En letras 3D los materiales van de aluminio pintado ($30/cm) a **acero inoxidable ($55/cm)**. Si borras una partida por error, el aviso trae **Deshacer** — y también lo trae *Vaciar y empezar cotización nueva*, que es lo que más duele perder.

  Capturando a mano, la partida nueva **hereda el material de la anterior** —el único campo que hay que elegir en todas y que casi nunca cambia dentro del mismo trabajo—. Va marcado con «↩ como la anterior» para que se vea que lo puso la app y no tú: es el dato que más pesa en el precio. En cuanto eliges uno a mano, la etiqueta se quita y ese pasa a ser el que hereden las siguientes. Las partidas que crean el escalador y el vectorizador siguen naciendo sin material, porque ahí nacen de una medida y el material sí sería una suposición con precio. Junto a *+ Agregar partida* está **⧉ Igual que la anterior**, que copia la última completa.

- **Partidas plegadas: solo lo que se está cotizando** — una partida abierta enseña el catálogo completo con el que se captura: los cinco materiales, las tres complejidades, los tres acabados. Multiplicado por cada renglón de la cotización, eran 3 000 px de opciones para leer dos datos. Plegada se recoge a **la descripción, lo que ya está elegido y su total** —«Letrero de fachada FARMACIA · ✓ Acero Inoxidable · ✓ Cursiva · ✓ Luz cálida · ✓ 40 cm · ✓ 14 letras»— y se abre con un toque, en la fila completa o en el ▾ del encabezado.

  Lo que falta se resume en **una** ficha ámbar con su cuenta («Faltan 2 datos»), porque una partida recién creada tiene tres huecos y una ficha por hueco convertía a la partida más vacía en la que más ruido hacía; el itemizado se lee abajo, en el renglón de la fórmula, con sus propias palabras. De lo apagado solo se enseña lo que mueve el precio: «Sin iluminación · −20%» se queda, «Sin complejidad» —que es el valor por omisión de uno de los tres acabados— se cae. Y si la partida está oculta del PDF, lo dice con palabras y no solo con el gris.

  Al agregar una partida las anteriores se pliegan solas, y al abrir una cotización guardada solo queda desplegada la última; **Plegar todas / Abrir todas** en el encabezado de *Partidas* hace las dos cosas de golpe. Nació como arreglo del teléfono y durante un tiempo solo funcionó ahí, pero el problema no era del teléfono: era de las partidas. Es solo una manera de ver la pantalla: no se guarda con la cotización, no viaja al PDF y un Ctrl+P saca el detalle completo.
- **Deshacer, con Ctrl+Z** — antes había un «Deshacer» por acción, en el aviso: borrar una partida, vaciar la cotización, quitar la imagen. Funciona bien y se queda, pero dura lo que dura el aviso y solo cubre las tres cosas que alguien se acordó de cubrir. Ahora hay una **pila de hasta 60 pasos** para cualquier cambio: una altura que se tecleó mal, el material que se tocó por error, el orden que se movió arrastrando, una partida que se duplicó de más. Con **Ctrl+Z** (o ⌘Z) y con un botón; **Ctrl+Shift+Z** y **Ctrl+Y** rehacen, y cada vez que deshaces el aviso trae **Rehacer**, para que deshacer de más tampoco cueste nada.

  **Teclear seguido en un mismo campo es UN paso, no uno por letra.** Escribir «Taquería El Güero» son diecisiete cambios, y una pila con un paso por letra no es deshacer, es un cursor. Se agrupan los cambios seguidos del mismo campo; una pausa de segundo y medio abre otro punto de retorno, así que se puede volver a media captura y no solo al principio. Lo que **no** se agrupa nunca es una acción suelta: un chip, una partida nueva, un borrado, un arrastre. Cada una es su propio paso.

  **Con el cursor dentro de un campo manda el Ctrl+Z del navegador**, que va letra por letra sobre lo que se acaba de escribir. Es más fino que un paso nuestro y la cotización lo sigue igual: robarle el atajo habría sido cambiar una herramienta buena por una más gruesa justo donde la fina ya funcionaba.

  **La pila es de una cotización y de su captura.** Autorizar, mandar a autorizar, reabrir para editar, guardar los cambios de una edición, vaciar o abrir otra del historial son fronteras: ahí la pila se corta. Retroceder por encima de una autorización sería fingir que no pasó algo que pasó delante del cliente, y por encima de un folio sería editar a ciegas una cotización que ya no está en pantalla. Cada frontera tiene su propia puerta —*Editar partidas* para volver a tocar una autorizada, el *Deshacer* del aviso para el vaciado— y el botón lo dice cuando toca: en una cotización autorizada no se ve, y si llegas por el atajo te dice por dónde se destraba. Vive en memoria y no se guarda: al recargar la app se empieza sin pasos, porque deshacer es para el error que se acaba de cometer.

  **En el teléfono el botón va en la barra de abajo, no arriba.** Se midió: a 375 px la fila de controles ya va con 8 px de sobra, y 42 px más la partían —la barra fija pasaba de 111 a 158 px en un iPhone SE, un 13 mini y un 15 Pro—; peor todavía, como el botón aparece y desaparece según haya algo que deshacer, la pantalla habría dado un salto de 47 px en cada cambio. Abajo hay lugar de sobra, y en una pantalla que se sostiene con una mano el pulgar llega abajo y no arriba. En escritorio va arriba, junto a *Historial*, con su nombre escrito.

- **El proceso completo, en cuatro pasos** — la barra de arriba decía que cotizar tiene dos. Con la cotización ya autorizada, con su PDF hecho y su venta registrada, la única cosa de la pantalla que dice en qué punto del proceso estás seguía marcando *2 · Partidas*: cerrar el precio y entregarla no tenían nombre ni sitio, y se descubrían hasta el fondo de la columna del resumen, que en el teléfono cae debajo de todas las partidas.

  Ahora son cuatro —**Cliente · Partidas · Precio · Entrega**— y la barra dice la verdad: en cuál estás, cuáles están hechos —el número se cambia por una palomita— y cuál todavía no toca, en ámbar. Ninguno se deshabilita: tocar el que no toca dice qué falta, que es la mitad del trabajo; un botón gris no explica nada.

  Los pasos 3 y 4 **no son otra pantalla**, y eso es a propósito: el precio se ajusta *contra* las partidas —por eso el resumen vive al lado de ellas— y el documento que se entrega es el de esas mismas partidas. Tocarlos lleva al bloque donde se hacen, cada uno al suyo.

  En el teléfono, con su nombre las cuatro pestañas miden 442 px y un iPhone SE da 320: la barra desbordaba la página entera. Así que ahí el nombre lo lleva solo la pestaña en la que estás y las otras tres se quedan en su número o su palomita, que es lo que se viene a mirar de ellas. **El nombre del cliente se movió al paso en el que estás**, así que ahora sigue al vendedor por todo el proceso en vez de vivir fijo en el paso 1, y dejó de aparecer dos veces en la misma barra. Cada pestaña se anuncia entera para el lector de pantalla —«Paso 3 de 4 · Precio»—, que del ámbar y de la palomita no se entera.

- **La entrega también es un paso, y se acuerda de lo que ya hiciste** — autorizar no es terminar. Después vienen tres cosas que se hacen siempre y en este orden —armar el documento, mandárselo al cliente, registrar la venta— y eran siete botones apilados del mismo ancho y del mismo peso: los tres que se hacen siempre, dos salidas que se usan a veces, uno que es volver atrás y uno que cierra la cotización y abre otra. Y ninguno decía si ya se había hecho: el vendedor generaba el PDF, se iba a WhatsApp a adjuntarlo, volvía, y la pantalla estaba idéntica a antes de tocar nada. Con cinco llamadas encima, «¿ya mandé ésta?» solo se contestaba abriendo la plataforma o el chat.

  Ahora son **tres renglones en el orden en que se hacen**, cada uno con su fecha cuando ya está. El que toca lleva el único relleno de la pantalla; los que no tocan conservan su tinta —el verde de WhatsApp, el aguamarina de la venta—; el que ya está se va a neutro con su palomita y **sigue tocable**, porque un PDF se reimprime y un chat se vuelve a abrir. Cuando los tres están puestos no queda ninguno con relleno: la cotización está entregada y no hay nada que empujar. El de WhatsApp dice «chat abierto» y no «enviada», y no es un matiz: la app abre wa.me y el PDF se adjunta a mano, así que si se mandó es justo lo que no puede saber. Los dos recordatorios que hacían falta —elegir «Guardar como PDF», adjuntar el PDF que guardaste— viven en el renglón del paso, donde se leen **antes** de tocarlo; el de WhatsApp se pintaba después de abrirlo, o sea en la pestaña que el vendedor acaba de abandonar.

  Canva y el prompt de imagen bajaron a un pliegue —son salidas que se usan a veces, no pasos de la entrega—, que **nace abierto si este aparato usa Canva**: es la diferencia entre esconderle una función a quien la usa todos los días y no enseñársela a quien no la ha usado nunca. Y *Nueva cotización* quedó separada por una línea, porque estaba a un dedo de *Registrar venta*.

  Lo más caro de todo esto era que el dato ya existía y se tiraba: la constancia de que se armó la propuesta en Canva se guardaba desde que existe el botón y no se leía en ningún sitio, y la de «se ganó» solo se leía para no duplicarla. Ahora **el historial dice qué se hizo con cada folio** —«Propuesta · 12 ago · PDF generado · 12 ago · Venta registrada · 14 ago»— y se puede buscar por eso, que es la pregunta que no tenía respuesta: de las que presentamos, ¿cuántas se ganaron?

- **El link de Maps ya se guarda** — era el único campo de la cotización que se escribía y no se guardaba: se pegaba el link, se recargaba —o iOS descartaba la pestaña— y el link no estaba. Volvía solo si algo más disparaba un guardado después.
- **El cliente que ya conoces** — al escribir en *Cliente* se sugieren los del historial; al elegir uno se llenan teléfono, dirección y link de Maps, pero **solo los campos que estén vacíos**: nunca se pisa lo que ya escribiste.
- **Cliente, teléfono y proyecto van antes que la primera partida** — antes bastaba con el cliente *o* el proyecto, y el teléfono no se pedía nunca; salían cotizaciones autorizadas sin saber de quién eran, sin distinguirse de las otras tres del mismo cliente o sin un número al que mandarlas por WhatsApp, que es justo para lo que existe el botón de enviar. Los tres pasaron a ser obligatorios, pero el freno estaba solo al final, al mandar a autorización —y al final es donde corregir cuesta más—: la cotización ya está capturada entera y lo que falta es justo lo que nadie se acuerda de preguntar, el teléfono, con el cliente ya colgado.

  Ahora se piden **antes de la primera partida**. Hasta que no estén los tres, no se agrega una partida ni se duplica, no entra la IA, no bajan las medidas del escalador ni el trazo del vectorizador, y no se escribe dentro de una partida que ya estuviera capturada. No es un requisito nuevo: es el mismo de siempre, movido al único momento en que preguntarlo sale gratis, que es cuando todavía no hay nada capturado que corregir.

  Lo que **sí** se puede hacer con el candado puesto es leer la cotización entera, plegar y abrir sus partidas, imprimirla —el papel sale igual que siempre, sin lo apagado y sin la ficha—, **ocultar una partida del PDF con el ojo** y **deshacer un borrado**. Las dos por la misma razón: no meten un dato en la partida. El ojo decide qué renglones salen impresos, y bloquearlo dejaba a la app dándose instrucciones que ella misma frenaba —en una cotización ya autorizada sin teléfono, el ojo mandaba a *Editar partidas* y ahí el candado se cerraba encima y volvía a decir que no—; deshacer era el único punto donde este candado podía perder trabajo. El «Deshacer» de una partida dura seis segundos, y si en esos seis segundos el vendedor se fue a corregir el teléfono —lo borró para reescribirlo—, un candado que también lo frenara se llevaría la partida para siempre.

  Y son **dos pantallas**, no dos tarjetas en la misma. *1 · Cliente* y *2 · Partidas*: la primera son cinco campos y un botón, en una columna estrecha y centrada; la segunda son las partidas con su resumen al lado. Son dos momentos distintos de la misma llamada —de quién es esto, y qué le vamos a hacer— y verlos juntos obligaba a leer el doble para atender uno. Volver a corregir un dato es tocar el paso 1; nunca se frena, que para eso está.

  *Continuar a partidas* pasa por el mismo filtro que ya frenaba la captura, y la pestaña del paso 2 también: no es una puerta de servicio. Completar los tres campos **no salta solo** de pantalla —se sigue tecleando la dirección, que es opcional— sino que enciende el botón. Al recargar, la app abre donde toca: con los tres datos puestos, en partidas —estabas cotizando—; sin ellos, en cliente. En el celular la barra fija de abajo es *Continuar a partidas* en la primera pantalla y el total con *Autorizar yo mismo* en la segunda.

  Si una cotización llega a la pantalla 2 sin los datos —una vieja del historial, un respaldo que llegó por WhatsApp— el paso 2 **no enseña nada con qué empezar**: ni *Cotizar con IA*, ni *Escalar*, ni *Vectorizar*, ni *+ Agregar partida*. Un botón que se queda a la vista para negarse sigue diciendo «esto ya se puede». En su lugar queda una sola cosa tocable: el aviso que nombra lo que falta —«Falta el teléfono»— y que lleva a la pantalla 1 con el cursor en el hueco. En papel no hay pantallas: un Ctrl+P saca la cotización entera, las dos partes, sin la barra de pasos. Lo que ya estuviera capturado se queda fuera de esa regla y **sigue a la vista**, congelado: leer una cotización nunca estuvo prohibido. **Nada se queda callado**: tocar un chip, el selector de tipo, la × o un recuadro de una partida congelada contesta —un control que se ve y no responde es, palabra por palabra, «la app se rompió»—, aunque desde dentro de la partida solo avisa y no arrastra la pantalla hasta arriba. Lo que sirve para **leer** se queda fuera y funciona sin decir nada: el ▾, la cara plegada entera, las fichas del resumen —donde el gesto es espiar un importe tapado— y el ojo del PDF. En el celular la barra fija de abajo deja de mostrar un *Autorizar yo mismo* muerto y muestra el siguiente paso real: «Falta el teléfono del cliente ›». El candado se quita **solo**, en cuanto se termina de escribir el último de los tres —sin guardar, sin recargar, sin apretar nada—, y ahí aparece la partida en blanco con la que siempre ha arrancado la app. **Una sola vez**: si borraste esa partida a propósito y después bajaste a corregir el teléfono, no te la encuentras de vuelta al terminar de escribirlo. Sembrar lo que nunca nació es ayudar; devolver lo que alguien acaba de borrar es no hacerle caso.

  Una cotización vieja que se abra sin teléfono —del historial, de un respaldo o duplicada con *Usar como base*— conserva sus partidas a la vista, en reposo: se leen y no se pierden, y se destraban escribiendo el dato que falta. **En reposo, no apagadas**: lo que cambia es el marco —fondo gris, filete gris en vez del azul— y los controles, que por fin se ven apagados; el texto conserva su contraste completo, porque leer es justo lo único que se puede hacer con una partida congelada. El primer intento las atenuaba enteras y hundía la descripción a 2,6:1, que es el problema que este proyecto ya había arreglado una vez. De paso se arregló que un chip o un interruptor apagados —los de cualquier cotización ya autorizada, no solo los de ésta— se veían exactamente igual que uno vivo. Ahí el aviso cambia de encabezado —«Esta cotización no trae los datos del cliente»—, porque un «primero, de quién es» encima de cinco partidas ya capturadas se lee como que la app se equivocó de cotización. No es un estado del día del estreno que se vaya solo: un respaldo que llegue por WhatsApp puede traer una cotización sin teléfono en cualquier momento. El escalador y el vectorizador **siguen abriéndose sobre una cotización congelada**, porque medir no es capturar; lo que frena es el botón que baja esas medidas a las partidas. Con el paso 1 sin terminar es distinto y conviene decirlo con precisión: ahí no se llega ni a la pantalla donde viven, porque los tres datos del cliente son la puerta de todo el paso 2. Medir antes de saber de quién es el trabajo se puede hacer, pero hoy hay que escribir tres campos primero.

  Los tres se vuelven a exigir al mandar a autorización, que es donde el precio se bloquea. Si falta alguno, el aviso los nombra («faltan el teléfono del cliente y el proyecto»), los huecos se marcan en ámbar y el cursor queda en el primero, abriendo los datos del proyecto si estaban plegados. Del teléfono se cuentan **dígitos, no formato**: «33 1234 5678» y «+52 33 1234 5678» valen igual, y un «33» a medias no pasa, porque un teléfono incompleto engaña más que uno vacío —parece capturado—. *Autorizar yo mismo* pasa por el mismo filtro: autorizarse a uno mismo no es una puerta de servicio para saltarse los datos del cliente.
- **Barro, y con los colores del logotipo** — la app se ve de la marca porque usa **sus** azules, no unos parecidos: el archivo del logo se muestreó píxel por píxel y salieron tres —`#3018f8` en el círculo oscuro, `#4060f8` en el grande y `#6090f8` en el chico—. De ahí sale todo: el acento, los neutros —fríos y con un toque de lavanda, no grises puros— y las tres manchas de color diluidas que tiñen el lienzo.

  El estilo es **claymorphism**, y son cuatro cosas a la vez: radio muy generoso, luz interior arriba más sombra interior abajo —que es lo que infla la pieza—, sombra exterior **teñida del acento** y en dos pasos —una corta y apretada, otra larga y abierta, para que la pieza se apoye en vez de flotar— y, la que casi nadie hace, **que ceda al tocarla**. Una pieza de barro que no se deforma al apretarla no se lee como barro: se lee como una calcomanía. Los campos van al revés, hundidos, como una huella.

  **Se mueve.** Las tarjetas y las partidas se asientan en escalera al entrar; los chips rebotan al elegirlos; los botones se hunden al apretarlos y se levantan al pasar por encima; el interruptor tiene su knob con peso; la barra de completitud lleva un brillo que la recorre; los modales entran desde abajo con la página desenfocada detrás; el aviso del candado late despacio, porque es lo único que pide que hagas algo antes de seguir; y **el total late cuando cambia de verdad** —no en cada repintado— porque es el número que se viene a mirar y uno que se reescribe sin avisar no se nota. Quien tenga activado «reducir movimiento» en su sistema recibe el estilo completo y **cero** animación: no es un extra, hay gente a la que una pantalla que se mueve le provoca mareo.

  La IA tiene su propio color —violeta hacia azul, con el degradado respirando— porque es la función estrella y la única que trae algo de fuera; escalar y vectorizar se quedan neutros. Así la fila tiene jerarquía, en vez de tres botones idénticos o tres colores peleados, que fueron los dos extremos anteriores.

  **Y todo medido sobre el render, no sobre la hoja de estilos.** Con degradados por todos lados, leer `backgroundColor` dejó de servir: devuelve transparente. Así que la prueba de contraste ahora **rasteriza cada pieza y mide sus píxeles** —agrupa colores, toma el más frecuente como fondo y el que más se le aleja como texto—. Ahí salió lo que hunde a la mitad de los diseños de este estilo: `#6090f8`, el azul claro del logo, con blanco encima da **3,07:1**, y el aguamarina **2,41:1**. Los dos son bonitos y los dos son ilegibles. Quedaron de decoración —sombras, lienzo, bordes— y el relleno que lleva texto arranca en `#4060f8`, que da 4,95:1. Nada de lo que se lee baja de 4,5:1.

- **Un sistema, no veinte decisiones sueltas** — la hoja de estilos tenía **23 tamaños de letra distintos** —de 9 a 30 px, en saltos de medio píxel—, **39 sombras**, **18 degradados** y unos veinte radios. Ninguno estaba mal por sí solo: eran decisiones tomadas de una en una a lo largo de meses. Una pantalla hecha así se siente desordenada aunque cada pieza esté bien, y eso es lo que se veía.

  Ahora hay una escala de cada cosa: **siete tamaños de letra**, espacio en múltiplos de 4, **tres radios** y **dos niveles de sombra**. Todo sale de ahí. Los nombres viejos se quedaron como alias apuntando a los nuevos, así que las mil líneas que ya los usaban siguen funcionando sin tocarlas.

  Y con el sistema vinieron las decisiones que de verdad cambian cómo se ve:

  **Fuera las cajas dentro de cajas.** La tarjeta pierde la sombra —una línea de un píxel sobre un lienzo más claro separa igual y no infla la página—, la partida deja de ser una tarjeta dentro de otra y pasa a ser una sección con su línea y su número, y los grupos de opciones dejan de ser recuadros: lo que los agrupa es el espacio. Eran tres marcos para enseñar cinco botones.

  **Un solo botón lleva color en cada pantalla**, el que hace lo que se vino a hacer. Antes *Cotizar con IA* era una barra azul sólida a todo lo ancho, *Escalar* tenía borde verde y *Vectorizar* morado: tres pesos y tres colores para tres herramientas del mismo rango. Cuando todos gritan, ninguno dirige.

  **El azul solo significa una cosa.** El chip elegido era una píldora azul con degradado, sombra de 14 px y un rebote al tocarla; multiplicado por los cinco materiales, las tres complejidades y los tres acabados de cada partida, lo ya decidido era lo más ruidoso de la pantalla justo por estar decidido. Ahora el elegido se marca con un fondo tenue del acento y su tinta. El número de la partida, el folio y las fichas de la partida plegada se volvieron neutros: son etiquetas y datos, no acciones.

  **La jerarquía la hace el tamaño, no el color.** El subtotal y el total eran dos bloques de color a pantalla completa, apilados —uno azul de marca y uno marino con degradado—, los dos objetos más llamativos de la pantalla compitiendo entre sí. Pintar de color un número no lo vuelve más importante. Ahora son dos renglones y el total es, simplemente, el número grande de la columna.

  **Menos mayúsculas diminutas.** Los títulos eran renglones de versalitas de 10 px en azul con un filete al lado; eso es decoración, y se lee peor. Ahora un título es un título.

  Todo se midió: nada de lo que lleva texto baja de **4,5:1**, y quedó escrita la regla que se rompió en el primer intento —de `--n5` para arriba, ningún tono de la rampa lleva texto—. Los modales del escalador, el vectorizador y el historial heredan los tokens nuevos, pero sus tamaños internos todavía traen valores del sistema viejo.

- **Menos letra, más cotización** — la pantalla se había ido llenando de explicaciones: un párrafo debajo de los tres obligatorios, un «Tip» para copiar el vínculo de Maps, un placeholder de tres renglones con ejemplos de dirección, dos avisos por partida sobre el material y la iluminación, la lista de precios repetida debajo de unos chips que ya la traían, y el valor elegido escrito en el encabezado de cada grupo con el chip resaltado dos renglones más abajo. Cada uno se justificaba solo; juntos eran **1 111 caracteres de texto explicativo en una pantalla**, además de los datos.

  Quedaron **418**. Lo que se fue es lo que se aprende la primera vez y estorba las otras cincuenta, lo que decía dos veces lo mismo dentro de la misma caja, y lo que ya dice otra parte de la pantalla mejor: el asterisco de un campo obligatorio, el chip resaltado de un material elegido, la cara de la partida plegada. Lo que se queda es lo que hace falta **mientras decides** —que el acrílico sin luz sale más caro que el aluminio, que el bastidor se cobra por área con mínimo de un metro— y en una línea, no en cuatro. La explicación de los obligatorios sigue ahí para el lector de pantalla, que del asterisco no se entera.

  De paso los recuadros de opciones se aplanaron —fondo blanco en vez de degradado, un poco menos de aire— y las etiquetas largas se acortaron. Una partida capturada mide **75 px menos** y la pantalla completa, 142.

- **Completitud dice qué falta, no solo cuánto — y ya no se apaga a la mitad** — la barra del resumen nombra lo primero pendiente y tocarla lleva ahí: abre los datos del proyecto si estaban plegados y enfoca el campo, o despliega la partida **y deja el cursor en el hueco**, que antes solo hacía scroll al marco y obligaba a recorrer los tres grupos otra vez buscando cuál quedó en ámbar.

  Y sigue hablando después de la captura. Era la mejor pieza de conducción de la app y moría en el 100 %: justo en el instante en que el vendedor termina de capturar y necesita que alguien le diga «ahora el precio». Ahí se quedaba, al 100 % y muda, durante todo lo que viene después. Ahora continúa —«Autoriza el precio», «Cierra el precio», «Genera el PDF», «Mándala por WhatsApp», «Registra la venta»— y solo se apaga cuando de verdad no falta nada; ahí tocarla contesta «esta cotización ya está entregada» en vez de callarse. Sale del mismo sitio que la barra de pasos y que la barra fija del teléfono, así que las tres no pueden decir cosas distintas.

  La dirección dejó de ser el titular eterno. Es opcional, no bloquea nada, y estaba delante de «Agrega una partida», que sí bloquea: una cotización recién empezada pedía la dirección antes de pedir la primera partida, y como nunca se llenaba sola se quedaba de titular para siempre — con el precio ya autorizado, el aviso decía «Falta la dirección» en lugar de «Genera el PDF». Se pide al terminar de capturar, cuando todavía se está con el cliente al teléfono y preguntarla sale gratis.
- **Cotizar con IA** — analiza un JPG o PDF del proyecto y propone las partidas. Si ya tienes trabajo capturado, lo **conserva** y agrega las de la IA al final; reemplazar sigue a un toque, pero ahora es una decisión que se toma a propósito y no por omisión. También puede analizar **la imagen que acabas de medir en el escalador**, con tus cotas: ahí las medidas ya no las estima, las toma tal cual. La imagen analizada se guarda con la cotización, así que sigue ahí si recargas o cierras la pestaña, y **vuelve contigo cuando abres esa cotización del historial**.

  **Tres maneras de darle el archivo, no una.** Antes solo entraba por el selector de archivos, así que un diseño que el cliente manda por WhatsApp había que bajarlo al disco y después ir a encontrarlo entre las descargas, con el cliente esperando. Ahora el recuadro punteado acepta que lo **arrastres** —desde el escritorio, desde el explorador o desde otra ventana—, que lo **pegues** con Ctrl+V si ya lo copiaste, o que lo **elijas** como siempre. En el celular, donde no hay nada que arrastrar, el mismo recuadro dice «Toca para elegir la foto o el PDF» y abre la galería: se decide por el tipo de puntero, no por el ancho de la pantalla. El arrastre vale en **todo el modal** y no solo dentro del recuadro —errarle por veinte píxeles no tiene por qué costar el intento—, y lo que quedó puesto se enseña con **miniatura, nombre y peso**, porque el texto gris del selector nativo era lo único que antes lo confirmaba y analizar a ciegas cuesta una llamada a la API. Lo que no es imagen ni PDF se rechaza diciendo su nombre; una carpeta arrastrada contesta que arrastres el archivo de dentro. Si arrastras una imagen desde otra página web se intenta traer sola, y cuando el sitio no lo permite dice qué sí funciona ahí: copiarla y pegarla. Y **soltar un archivo fuera de una zona que lo espera ya no se lleva la app**: el navegador abría el archivo en su lugar y la cotización en pantalla se iba con él, sin un «atrás» que la trajera.

  **Varias APIs, para que ninguna detenga la cotización.** Cada proveedor admite **hasta 8 keys**, no una. En los planes gratuitos la cuota va por key —no por proveedor—, así que dos cuentas de Google son dos cuotas de Gemini; se pegan una tras otra con *Agregar* y quedan listadas como Key 1, Key 2, Key 3. Entre análisis **se turnan**, para repartir la cuota del día en vez de quemar siempre la primera hasta agotarla.

  **Cuando una se cae, insiste la app y no tú.** Los planes gratuitos contestan «model is overloaded» (503) o «rate limit» (429) a cualquier hora, y eso salía como un error seco que obligaba a volver a pulsar *Analizar* hasta que sonara la flauta. Ahora la app recorre sola la lista: reintenta con esperas crecientes cuando el modelo está saturado —es cuestión de tiempo—, pero ante un 429, que es cuota de **esa** key, salta al instante a la siguiente key, luego a los modelos hermanos del proveedor y por último a los otros proveedores configurados. Solo usa keys guardadas en este dispositivo: nunca manda nada a un proveedor que no hayas cargado. En pantalla se ve con quién está hablando (`Gemini · gemini-2.5-flash · key 2`), y si acabó contestando **otro modelo** lo avisa, porque el borrador viene de otra IA y quien lo revisa tiene derecho a saberlo. Los errores que no se arreglan reintentando —key inválida, modelo inexistente— no gastan intentos.

  Con eso se arreglaron de paso los otros dos: Groq y OpenRouter rechazan el modo JSON del API cuando en la misma petición va una imagen, así que la app repite sin él y lee igual el JSON de la respuesta. Las fotos se reducen a 1600 px antes de subirlas —una foto de celular pesa varios MB y Groq la rechazaba por tamaño—, y un PDF con Groq u OpenRouter elegidos ya no es un callejón sin salida: si la key de Gemini está guardada, se usa esa.
- **Escalador de imagen** — mide elementos sobre una foto o plano sin cotas: se calibra con una referencia conocida y de ahí se sacan las demás medidas. Con el dedo, cada toque coloca un punto y deslizando sin soltar se afina con lupa antes de dejarlo; los extremos ya trazados se arrastran para corregir la medida sin borrarla, y mover la referencia recalcula todas. El botón **← Cotizador** de arriba, el que queda pegado al pie del panel y el "atrás" del celular regresan a la cotización en cualquier momento.

  Al terminar de medir hay dos salidas. **Agregar como partidas** crea una partida por medida, con la altura puesta y lo demás por capturar. **✨ Cotizar estas medidas con IA** manda esa misma foto —con las cotas dibujadas encima— y la lista de medidas a la misma IA del cotizador, que devuelve las partidas ya clasificadas: tipo, material, complejidad, iluminación y número de letras, con tus medidas exactas y sin redondear. El mismo botón está en la vista previa de la imagen, junto a las partidas. Si la IA devuelve un número de partidas distinto al de medidas, te lo dice para que revises cuál falta.
- **Vectorizador de imagen** — convierte el JPG que manda el cliente en trazo vectorial: el contorno con el que se corta el acrílico o el aluminio. Tres modos —**Corte** (una silueta), **Logotipo** (pocos colores planos) y **Foto**— con una cortina para comparar el original contra el trazo, y control de detalle, motas, esquinas y fondo. El número de colores es un tope: si el logotipo trae menos, salen menos.

  Dando el **alto o el ancho real** del diseño, el SVG se descarga a escala y abre con las medidas puestas en Illustrator, CorelDRAW o el software de corte, sin reescalar a ojo. De ahí salen también los dos datos que mueven el precio de unas letras 3D: **cuántas piezas son** —cada letra es un contorno, y el hueco de una "O" no cuenta como pieza— y **qué alto tienen**. **Agregar como partida** crea la partida de letras 3D con esos dos campos llenos; el material y la complejidad los sigues eligiendo tú, porque son los que cambian el precio. También enseña el **perímetro de corte** en metros, que es el recorrido del láser.

  **Medir el vector en el escalador** manda el trazo limpio al escalador y, si ya diste la medida real, entra ya calibrado. Medir sobre el vector es más exacto que sobre la foto: los bordes están donde de verdad se va a cortar y no donde el JPG los difuminó.
- **Autorización** — el precio se bloquea al solicitar autorización, y quien autoriza puede ajustar el total o partida por partida, hacia abajo o hacia arriba; ese precio es el que manda en el PDF, el anticipo y el registro de venta.

  **El bloqueo no depende de que nadie apriete nada.** Al autorizar se guarda la huella del trabajo —qué partidas, con qué material, qué medidas, con IVA o sin él— y el precio autorizado vale mientras esa huella siga siendo la misma. En cuanto algo cambia, el precio vuelve al calculado y la app lo dice: no hace falta pasar por «Guardar» ni acordarse de nada, así que recargar la página a medio editar tampoco deja una cotización autorizada en el precio de otras partidas. El interruptor del IVA queda bloqueado con las partidas, porque mueve el total un 16%. Lo que sí sigue editable después de autorizar es lo que **no** mueve el precio: las entre calles, el límite de fabricación, la nota al cliente y el anticipo, que se pacta justo al cerrar.

  Si una partida trae un precio puesto a mano por el autorizador, el renglón enseña **ese** —con el calculado tachado al lado—, que es el que va a salir impreso. Antes la pantalla decía uno y el PDF otro.

  **Mientras es borrador, los importes salen difuminados.** Se captura delante del cliente y el precio no tiene por qué leerse desde el otro lado de la mesa antes de estar autorizado: se difuminan el total de cada partida, el subtotal, el IVA, el total neto y el anticipo, y también las cifras de la fórmula de cada partida —«▓▓▓ (▓▓▓) × 30cm × 6»—, porque con el «$55 × 30cm × 6» a la vista el precio se calcula de cabeza. Las medidas de la fórmula sí se quedan legibles: la altura y el número de letras son lo que se está capturando. Se espían manteniendo uno tocado —se destapan todos a la vez y se vuelven a tapar al soltar—, o con el botón **Ver precios** del aviso, que los deja destapados hasta volver a pulsarlo y es la manera de leerlos sin dedo ni ratón. Se destapan solos al solicitar autorización, porque de ahí en adelante el precio ya es un dato firme, y un Ctrl+P nunca los imprime borrosos. Las tarifas de los chips de material siguen a la vista: ésas son el catálogo con el que se captura, no el precio del trabajo. Con las partidas plegadas también se tapan las dos fichas que llevan precio de **este** trabajo —la tarifa personalizada de una caja de luz y el precio unitario de una partida manual—, que se escapaban; tocarlas las destapa sin abrir la partida, porque ahí el gesto es espiar. El autorizador nunca los ve tapados.

  La cola del autorizador solo muestra las solicitudes hechas en **ese mismo dispositivo**, y la pantalla lo dice: se guarda ahí, no en un servidor. Cuando el vendedor y el autorizador son la misma persona —que es lo normal, justo por eso—, **⚡ Autorizar yo mismo** abre ese mismo formulario de revisión dentro de la vista de vendedor, sin cambiar el rol de arriba ni volver a cambiarlo después. Es el mismo formulario, así que no hay dos maneras de autorizar que puedan contradecirse. *Solicitar autorización a alguien más* sigue ahí para el flujo de dos personas. El nombre de quien autoriza se recuerda en el dispositivo.

- **Aviso de partidas sin terminar** — una partida de letras sin material vale $0, y antes bastaba con que otra partida tuviera precio para que la incompleta pasara el filtro, se autorizara y saliera en el PDF como un renglón normal, con su descripción bien redactada, en **$0.00**. Ahora, al solicitar o al autorizar, si hay partidas incompletas se listan primero —«Partida 2 · falta material»— y se toca cada una para ir a completarla; las que están completamente vacías se quitan desde ahí mismo. Se puede continuar de todos modos, pero avisado. Si no falta nada, no agrega ni un toque.
- **PDF de cotización** con el logotipo, el cliente, el desglose de partidas, IVA, descuento autorizado, anticipo y resta al entregar. Cuando el autorizador dio un descuento, el descuento baja la base y el IVA sale de la base descontada, así que el papel cuadra consigo mismo: subtotal menos descuento, más IVA, es exactamente el total a pagar. Las partidas se reparten por hoja: antes, pasando de unas veinte, la tabla crecía más que la hoja carta, se partía en dos y la primera se quedaba sin el pie con el vendedor, el taller y el WhatsApp. El reparto se hace **desde el final**: la hoja que cierra es la que menos filas admite porque lleva los totales, la nota y el plano, así que se llena primero ella y las de más arriba van completando las anteriores.

  **Y ahora el papel se parece al que se manda de verdad.** Se revisaron las 25 cotizaciones más recientes de Canva —124 páginas, de junio a agosto de 2026— y el documento salía sin tres cosas que están en todas: el **plano del anuncio**, que va después de la nota y aparece en 22 de las 25, y que la app ya tenía guardado desde que se capturó la foto o se midió en el escalador; la **orden de trabajo**, que es la hoja del taller —la cotización con las dos columnas de precio borradas y el límite de fabricación estampado en verde y rojo—, y que sustituye a la hoja que antes solo llevaba la fecha sola en medio del papel, una hoja que en Canva existe 18 veces y sale en blanco las 18; y el **recibo de pago**, dos por hoja con su talón desprendible, que aparece cuando hay anticipo pactado. La orden de trabajo se arma con **todas** las partidas y no solo con las visibles: «ocultar del PDF» esconde un renglón de los ojos del cliente, no de los de quien lo tiene que fabricar, y ahí no hay precio que esconder. Lo que el papel de la app ya hacía mejor se queda: no imprime hojas vacías —las 25 de Canva salen con los placeholders de la plantilla de 2025 puestos—, numera las hojas, trae folio y cliente, y suma la tabla de verdad, que en 4 de las 25 no cuadra. La estructura completa, con los textos literales y el catálogo de conceptos que todavía no tienen tarifa, está en [`docs/ESTRUCTURA-COTIZACION-CANVA.md`](docs/ESTRUCTURA-COTIZACION-CANVA.md).

  **Y una capa visual, no veinte decisiones sueltas.** El papel se apoyaba en un solo tamaño de letra —10.5 px para todo— y en barras de etiqueta azul con relleno lavanda que lo hacían parecer un formulario por llenar. Ahora hay una escala de seis tamaños y una rampa de tres grises: **7 px** para las versalitas de etiqueta, **9.5 px** para el cuerpo de la tabla, **10 px** para el nombre de un concepto, **14 px** para el total, **17 px** para el tipo de documento; tinta a `#171a2b`, lo que acompaña a `#5a6076` y los rótulos a `#8a90a6` —14.6:1, 6.4:1 y 3.4:1 sobre blanco, y el terciario solo rotula—. Los cambios que más se notan: el **nombre del concepto y su especificación en dos renglones** en vez de un párrafo de negritas intercaladas, así que la columna se puede leer de un barrido; **cifras de ancho fijo** en los importes, para que los decimales no bailen; la **nota junto a los totales** y no debajo, que llena el medio ancho de hoja que quedaba vacío y le deja 70 px más de alto al plano; los **términos a 10.4 px** —estaban a 8.8, letra de contrato en papel— con su número en un cuadro azul y las dos columnas partidas por una línea; y el **plano crece hasta llenar el hueco** que le deje la hoja, con techo de 430 px. La marca de esquina ya no le pasa por encima a la fecha: entra por la esquina, se hunde bajo la regla azul y deja el bloque de identidad —logotipo, tipo de documento, folio y fecha— junto, a la izquierda.
- **Enviar por WhatsApp** — abre el chat del teléfono que capturaste con el mensaje ya escrito: folio, proyecto, total autorizado, anticipo y límite de fabricación. **El PDF se adjunta a mano**, y no es descuido: lo que la app llama «PDF» es una página que se manda a imprimir, no un archivo, así que no hay nada que adjuntar por programa.
- **Registrar venta** — anticipo, comisión, estatus y saldo pendiente, calculados sobre el precio realmente autorizado. El porcentaje de comisión y la cuenta se recuerdan.
- **Historial** de cotizaciones guardado en el propio dispositivo, con los importes **congelados** al momento de autorizar —el catálogo de precios se edita a mano en este mismo archivo, y sin congelarlos subir el precio del aluminio reescribía hacia atrás lo que ya se le había cotizado a un cliente—, con **un buscador que ya busca por la fecha que él mismo imprime** —filtraba sobre seis campos y la fecha de autorización no era uno, así que teclear «ago» no devolvía nada aunque la fecha estuviera a la vista; ahora entran también lo que se cotizó, el total y lo que se hizo con el folio— y dos maneras de reusar una cotización: **↻ Abrir y editar** la trae tal cual, autorizada, para regenerar su PDF o para modificarla —al cambiar las partidas el precio autorizado se suelta y hay que volver a autorizarlo, porque el que aprobó una persona ya no corresponde a ese trabajo—, **con la imagen con la que se cotizó**: se ponía en blanco al abrirla y, al volver a autorizar, ese blanco se escribía encima de la imagen guardada. La cotización se conservaba completa y la foto del letrero desaparecía para siempre, que es justo la que hace falta semanas después, cuando el cliente pregunta por lo que se le cotizó. Guardar encima ya nunca la borra: si la de la pantalla se perdió por el camino se conserva la que ya tenía ese folio, y para quitarla del historial hay que borrar la cotización. La ✕ de la vista previa, que en un borrador tira la única copia que existe, sale con **Deshacer**; **⧉ Duplicar** copia los datos del cliente y las partidas a una cotización **nueva** —folio nuevo, en borrador, con el precio recalculado y sin arrastrar nada de la autorización anterior—, que es lo que se necesita cuando el mismo cliente pide otro letrero o el local de junto quiere lo mismo con otra medida. Tus plantillas son tus cotizaciones anteriores.

- **Cuadernos de cliente** — el historial contesta «¿qué cotizamos?»; los cuadernos contestan la otra pregunta, la que se hace cuando suena el teléfono: «¿quién es este y qué le hemos hecho?». El botón **Clientes** de la barra de arriba abre la lista de todos, con cuántas cotizaciones lleva cada uno y cuánto suma lo autorizado; al entrar a uno están sus datos, sus cotizaciones —cada una con *Abrir* y *Duplicar*, las mismas del historial—, sus cifras y una **nota del cuaderno** que se guarda sola: cómo paga, con quién se habla, qué quedó pendiente. Lo que no cabe en ninguna cotización.

  **No hay alta de clientes que llenar**: el cuaderno se arma solo con lo que ya guarda cada cotización autorizada. Quién es quién lo decide el **teléfono**, en sus últimos diez dígitos, que es lo único que el cliente no cambia de una cotización a otra —el nombre se teclea «Farmacia San Juan» un martes y «farmacia san juan suc. centro» el jueves, y son el mismo señor—; así «33 1234 5678», «+52 33 1234 5678» y «521 33 1234 5678» caen en el mismo cuaderno, y el nombre viejo se sigue enseñando como *también capturado como…* para que quien lo busque así lo reconozca. Sin teléfono manda el **nombre**, porque el historial trae cotizaciones de cuando el teléfono no era obligatorio y ésas no se pueden quedar fuera; y una cotización sin teléfono cuyo nombre sí aparece en un cuaderno con teléfono se une a ese cuaderno —es el mismo cliente, capturado antes—, pero **solo si ese nombre apunta a un único teléfono**: si el mismo nombre aparece con dos números distintos, adivinar sería mezclar dos clientes, así que se quedan separados y a la vista para que decida quien sabe. Lo que no tiene ni nombre ni teléfono cae en *Sin identificar*: la suma de los cuadernos es siempre el historial completo, nada se esconde.

  **Cotizarle algo nuevo** empieza una cotización en blanco con el cliente, el teléfono y la dirección ya puestos, y el cursor en lo único que falta, el proyecto —es *Duplicar* pero sin partidas, para cuando el cliente que regresa quiere otra cosa—. Y en la pantalla del cliente, en cuanto tecleas un nombre o un teléfono que ya tiene cuaderno, sale el aviso **«Ya tiene cuaderno · 3 cotizaciones · $30,000.00»** con la liga para verlo: saber que es un cliente que vuelve, y por cuánto, es justo lo que hay que saber *antes* de poner el precio.

  Se exporta a CSV por cliente —sus cotizaciones— o de la cartera entera: un renglón por cliente con teléfono, totales, primera y última cotización y la nota del cuaderno.

## La plataforma

El cotizador termina en «autorizada» y ahí se detiene. Todo lo que pasa después —que el
cliente diga sí, cuándo se instala, qué material hay que comprar, si ya se instaló, cuánto
deben— vivía en la cabeza de alguien. La plataforma es eso, y se abre desde el botón
**Plataforma** de la barra de arriba, o directo en
[la raíz del sitio](https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/) — es lo que abre la liga de siempre.

**El eslabón que faltaba.** En *Registrar venta* hay un botón nuevo, **Registrar como
proyecto ganado**, al lado del que copia la fila para Notion. Un toque, y del otro lado
aparece el proyecto completo: cliente, teléfono, dirección, el punto en el mapa sacado del
link de Google Maps, el tipo de trabajo derivado de las partidas, la fecha de instalación y
**el material que hay que comprar**. Nada de eso se captura. Es todo el invento; lo demás
son seis pantallas que se alimentan de ahí.

- **Calendario** — la pantalla que abre. Dos lentes: **Taller**, la fila de lo que está en
  fabricación con su ventana —cuándo empezar, cuándo tiene que estar el material, cuándo
  listo— contada hacia atrás desde el día de instalación con el plazo de 1 a 3+ semanas, y si
  va tarde por cuántos días; e **Instalaciones**, el calendario de siempre con el semáforo
  por día que contesta la pregunta de fabricación mirando el mes: ¿llego?
- **Hoy** — lo que se rompe primero, en orden: «falta material y esto se instala en 2 días»,
  «esta cotización lleva nueve días autorizada y nadie dijo si se ganó».
- **Proyectos** — el tablero por etapa de obra (ganado, cortado, armado, listo, instalado),
  con la orden de trabajo de fabricación, que incluye la temperatura del LED.
- **Material** — de «8 letras de 40 cm de acero» a «1 lámina de acrílico, 1 de fleje inox,
  44 módulos LED, 1 fuente». **Con la cuenta a la vista** y su etiqueta de confianza, porque
  un número que no se puede auditar no se corrige nunca.
- **Mapa** — las obras por instalar y las instaladas, con el orden de ruta del día.
- **Ajustes** — el rol de este dispositivo, el respaldo, y la verdad del sistema escrita.

**En la computadora también.** De 1 100 px para arriba el calendario abre en «Todo»: el mes a
la izquierda y la fila del taller a la derecha, con el mismo marcado que en el teléfono. Y se
maneja con teclado: **1 a 5** cambian de módulo, **← →** mueven el mes o la semana, **t**
vuelve a hoy y **Esc** cierra lo que esté abierto.

**Los recordatorios que sí suenan.** Una app en el teléfono no se puede despertar sola sin
pagar un servidor, así que no se finge: cada instalación **descarga un evento para el
calendario del teléfono**, con alarmas a 3 días, 1 día y 30 minutos. Esas alarmas las dispara
el calendario, no la app, y por eso suenan aunque nadie abra nada. Los demás avisos —material
que falta, cobranza, cotizaciones sin decidir— **se calculan al abrir la plataforma**: si
nadie la abre en cinco días, nadie los ve. Está dicho así en Ajustes.

**Notion sigue siendo el libro mayor.** Los proyectos ganados, las fórmulas de comisión y la
cobranza se quedan donde están. La plataforma es la capa operativa que Notion no puede dar.

**Y el puente ya está de los dos lados.** En **Ajustes → El puente** se pega la dirección de
un Worker de Cloudflare y el token de este teléfono, y a partir de ahí la venta ganada
**sale sola** hacia la base `Ventas - AL3D` —con la dirección, el punto del mapa, el tipo de
trabajo derivado y el folio, que es justo lo que el cotizador siempre tuvo y nunca
llegaba— y el **espejo del dinero** (pago pendiente, comisión restante, estatus y cuenta)
baja solo. Nadie aprieta nada: se manda al abrir la plataforma y cada vez que vuelve la
señal. Montarlo son unos 25 minutos de cuentas, una vez, y los pasos están en la propia
pantalla de Ajustes y en `puente/README.md`.

Sin puente no se rompe nada: la plataforma funciona completa en un dispositivo y el botón
**Copiar fila para Notion** del cotizador sigue siendo el camino manual. Ese botón no se
retira nunca.

**Los datos viven en el dispositivo**, igual que el cotizador. El respaldo de Ajustes baja
**un solo archivo con todo** —plataforma y cotizador— y es la forma de mover la app a otro
aparato: se manda por WhatsApp o correo, se restaura en Ajustes del otro lado, y el cotizador
toma su parte al abrir. Mientras no haya servidor, es el puente entre el teléfono y la
computadora.

## Uso

Todo corre en el navegador, sin instalar nada. Desde el celular conviene abrir la liga y agregarla a la pantalla de inicio (Chrome → menú → *Agregar a pantalla principal*; en iPhone, Safari → *Compartir* → *Agregar a inicio*) para que quede como aplicación, a pantalla completa y sin la barra del navegador.

**Y abre sin señal.** La app guarda una copia de sí misma en el teléfono la primera vez que se abre con datos, así que en la calle —o en un local sin señal— sigue arrancando y el historial, los folios y la cotización en curso, que están en *ese* teléfono, siguen alcanzables. Lo que sí necesita conexión es *Cotizar con IA*, y leer un PDF en el escalador o el vectorizador la primera vez de cada sesión, porque el lector de PDF se descarga en ese momento; si no hay red, lo dice con esas palabras en vez de un error seco.

En el teléfono la pantalla se acomoda sola y se aprovecha completa:

- **Partidas plegadas.** Es lo que más se nota aquí —una partida de letras mide 1 293 px en un iPhone—, aunque ya funciona en cualquier pantalla: está descrito arriba, en *Qué hace*.
- **Barra de arriba a la mitad.** Al desplazarse, el logotipo se va y se queda pegado únicamente el renglón que se usa —folio, rol e historial—: de 115 px fijos a unos 50.
- **Barra fija abajo** con el total y el siguiente paso —solicitar autorización, generar el PDF, lo que toque según el estado—, ya sin tapar el final de la página en los iPhone con franja de gesto.
- Los cinco tipos de partida caben en un solo renglón, las opciones de material y acabado van en dos columnas, y la tarjeta de *Datos del proyecto* se pliega con un toque para dejar las partidas hasta arriba.
- Cada partida nueva se trae a la vista al crearla, todo lo tocable mide 40 px o más, y los campos de medidas abren el teclado numérico.

## Respaldar y mover los datos

Los datos —historial, folios, cotización en curso, notas de los cuadernos, logotipo— se guardan localmente en cada dispositivo y no se sincronizan entre ellos. Eso se pierde al borrar los datos del navegador, al cambiar de teléfono o cuando iOS limpia los sitios que llevan semanas sin abrirse.

**Y ahora la app lo pide.** Nunca lo hacía: de los siete sitios que ofrecen respaldar, seis son avisos de «no hubo espacio», o sea que se ofrecía cuando ya se estaba perdiendo algo. Ahora se apunta la fecha del último, el pie del historial la dice —«Último respaldo hace 24 días · 7 sin respaldar»— y al autorizar, si lleva más de treinta días o más de diez cotizaciones sin respaldarse, el aviso que ya sale lo nombra con su botón. No es un aviso nuevo: autorizar es el único momento del día en que se acaba de crear algo que dolería perder.

**Y cuando el teléfono se llena, se ve.** El aviso salía una vez y se iba, y después la pantalla quedaba idéntica a una que sí está guardando: se seguía capturando delante del cliente creyendo que estaba a salvo. Un aviso que se va no puede representar una condición que sigue, así que la píldora del folio dice **sin guardar** mientras el problema esté puesto, en rojo —el ámbar de esta app significa «falta un dato», y aquí no falta nada, se está perdiendo—. La imagen del análisis que no cabe también lo dice ahora: eran dos `return` mudos, y la foto de la que salieron las partidas desaparecía sin una palabra.

En el pie del historial hay cuatro botones:

- **⬇ Respaldar** descarga un archivo con todo lo que la app guarda en ese teléfono.
- **⬆ Restaurar** lo devuelve. Reemplaza lo que haya, así que antes de escribir nada descarga solo un respaldo de lo que estaba, por si acaso.
- **📄 CSV** exporta el historial completo —folio, cliente, teléfono, proyecto, quién autorizó, totales y el detalle de partidas— para pegarlo en Google Sheets.
- **📓 Clientes** cruza al otro lado de los mismos datos: las cotizaciones agrupadas por cliente.

El respaldo **no incluye las API keys** a propósito: un respaldo se manda por WhatsApp o por correo, y una key que viaja así deja de ser secreta. Se vuelven a pegar en el teléfono nuevo, que es un minuto.

Un aviso: el contador de folios también es por dispositivo. Si cotizas desde dos aparatos distintos, los dos empiezan en `COT-0001` y vas a acabar con folios repetidos; mientras no haya sincronización de verdad, conviene cotizar siempre desde el mismo.

Dentro de *Datos del proyecto* hay un bloque plegable, **Datos que salen en el PDF**, con las entre calles, el límite de fabricación y la nota que se imprime para el cliente. Esos tres campos siguen editables después de autorizar, porque normalmente la fecha de entrega se define justo en ese momento. La nota que escribe el autorizador es interna y no aparece en el documento del cliente.

## Actualizar la versión publicada

El sitio se sirve desde la rama `main`. **Ya no es un solo archivo**, y esa es la diferencia
que importa: la plataforma son unos treinta archivos que se importan entre sí, y el cotizador
es uno solo.

> **Quién es quién, desde el cambio de puerta de entrada.** La raíz del sitio —`index.html`—
> es **la plataforma**: el calendario, la obra, el material. El cotizador es
> **`cotizador.html`**. Antes era al revés, y durante un año publicar fue «renombrar el HTML
> nuevo a `index.html`». **Hacer eso hoy sobrescribe la app con el cotizador y borra la puerta
> de entrada.** `pruebas/publicacion.mjs` lo detecta antes de subir, pero solo si se corre.

**Para publicar un cambio del cotizador** (`cotizador.html`):

1. Renombrar el HTML nuevo a **`cotizador.html`** — no a `index.html`.
2. Subirlo en [/upload/main](https://github.com/eliasgaribi-ctrl-z/cotizador-al3d/upload/main) y hacer commit a `main`.
3. Esperar entre 30 y 60 segundos a que GitHub Pages redespliegue.

**Para publicar un cambio de la plataforma** hay un paso más, y sin él el cambio no llega a
los teléfonos que ya tienen la app:

4. En **`sw.js`**, subir **`APP_VERSION`** una unidad. Es la primera línea de código del
   archivo y está señalada con un recuadro.

La razón es la estrategia de caché, y es a propósito. El cotizador se sirve *red primero*:
quien tiene señal ve siempre lo último. La plataforma se sirve *caché primero*, porque son
treinta módulos que se importan entre sí y con mala señal llegarían mezclados —unos nuevos y
otros viejos—, el `import` fallaría y quedaría una pantalla blanca, justo en el escenario
para el que el service worker existe. Un módulo nuevo con uno viejo no es una app vieja: es
una app rota. Así que el conjunto se cambia completo, y lo que dispara el cambio es ese
número.

Si el cotizador se toca por cualquier razón, hay que regenerar sus dos copias:

    herramientas/extraer-estilo.sh      # css/sistema.css
    herramientas/extraer-catalogo.sh    # js/datos/catalogo-precios.js

Son copias generadas del `<style>` y del catálogo de precios de `cotizador.html`, para que la
plataforma se vea y cobre igual que el cotizador sin volver a decidir un token ni copiar un
precio a mano. Los scripts avisan si algo cambió.

Y antes de subir, `pruebas/correr.sh` corre en unos segundos con node y nada más. Una de sus
pruebas es justo la que revisa que el sitio *se pueda publicar*, y otra corre el Worker del
puente entero contra una Notion de mentiras, sin cuenta y sin red.

Las seis de navegador van aparte porque piden Chromium y un servidor, y se corren de una vez:

    pruebas/correr.sh --navegador

**El cotizador ya tiene las suyas.** Se auditaba a mano, pantalla por pantalla, y eso encuentra
lo que se ve; no encuentra lo que solo se rompe en una de dos ramas —el botón «Quitar» del aviso
de partidas sin terminar salía llegando por *Solicitar autorización* y no llegando por *Autorizar
yo mismo*, que es el camino que se usa casi siempre— ni lo que solo se rompe en una dirección
—arrastrar una partida hacia arriba acomodaba bien y hacia abajo la dejaba una posición de más—.
Las dos aparecieron cuando se escribieron estas dos:

    pruebas/navegador/cotizador-flujo.mjs    el flujo por sus dos lados
    pruebas/navegador/contraste.mjs          nada de lo que lleva texto baja de 4,5:1

La de contraste es la que este documento decía tener y no estaba en el repositorio: rasteriza
cada pieza y cuenta sus píxeles, porque con degradados por todos lados leer `backgroundColor`
devuelve «transparent». Escrita, encontró tres reglas de color nuevas que a ojo pasaban.

Junto a los archivos de la app viven tres piezas que se subieron una vez y no hay que volver a tocar: **`sw.js`**, que es lo que hace que la app abra sin señal; **`manifest.webmanifest`**, que es lo que hace que Android la instale como aplicación y no como acceso directo; y **`.nojekyll`**, un archivo vacío que le pide a GitHub publicar el repositorio tal cual. Si se borran los dos primeros, la app sigue funcionando con conexión.

Si se borra el tercero es peor, porque no se nota: GitHub vuelve a pasar todo por Jekyll, Jekyll se atora con el primer `{{` que encuentre en la documentación —hoy hay cuatro en `docs/ARQUITECTURA.md` y cuatro más en `docs/INVESTIGACION-TECNICA.md`, dentro de bloques de código que igual lo tumban— y **deja de publicar**. El repositorio se ve al día, los commits están, y el sitio se queda congelado en la última versión que sí compiló. Cuando un cambio no aparece por más que recargues, ahí es donde hay que ver: [Actions](https://github.com/eliasgaribi-ctrl-z/cotizador-al3d/actions) → *pages build and deployment*.

Si el celular sigue mostrando la versión anterior, es la caché: recargar forzando o abrir la liga con `?v=2` al final. La copia local no estorba a esto —pide siempre la versión del servidor primero y solo usa la guardada cuando no hay red—, así que publicar y recargar alcanza.

## Pendientes

Lo que se sabe que falta, escrito aquí para no tener que buscarlo a media frase en otra
sección. **El mapa completo del siguiente nivel —Notion, Cloudflare, Google Calendar, qué
cuesta y en qué orden— está en [`docs/SIGUIENTE-NIVEL.md`](docs/SIGUIENTE-NIVEL.md).**

- **Los folios se repiten entre dispositivos.** El contador es local a cada teléfono, así
  que dos aparatos empiezan en `COT-0001` y acaban emitiendo el mismo folio para trabajos
  distintos. La plataforma lo mitiga por dentro —le pega el identificador del dispositivo al
  folio para no confundir dos proyectos— y ahora el cotizador guarda ese mismo identificador
  con cada cotización y lo saca en una columna del CSV, que es lo único que desempata dos
  `COT-0042` pegados en el mismo Sheet. Pero el folio que el cliente tiene en la mano sigue
  pudiendo repetirse: cambiarlo sería cambiar el número de un documento ya firmado. Mientras
  el puente no esté montado, conviene cotizar siempre desde el mismo aparato.

- **El puente lleva la venta, y por ahora nada más.** El almacén, el catálogo de material y
  las listas de compra no tienen todavía una base de Notion a la que ir, así que se quedan en
  cada dispositivo. No se pierden: se apartan en la bandeja con la razón escrita, Ajustes lo
  dice con su número, y el día que existan esas bases se reincorporan solos. Lo que sí viaja
  hoy es lo que importaba primero, que es la venta.

- **Los modales traen tamaños del sistema viejo.** El escalador, el vectorizador y el
  historial heredan los tokens nuevos, pero sus medidas internas son de antes de la escala de
  siete tamaños. Se ve bien; solo no está alineado al sistema.

- **El neón flex se vende y no está en ningún catálogo.** Hay proyectos reales de neón flex y
  el cotizador no tiene tarifa para él, así que cae en partida *manual* — que es justo la que
  el módulo de material excluye por diseño. Es un hueco de negocio, no de programa: para que
  la lista de compra lo incluya hace falta decidir cómo se cobra.

- **La tarifa documentada no coincide con la del cotizador.** La página *¿Cómo Cotizar?* de
  Notion cobra por **tipo de letra** ($30 sin luz, $35 recta, $40 puntas, $50 manuscrita, con
  −20 % sin iluminación); el cotizador cobra por **material** ($30 el aluminio pintado hasta
  $55 el acero) más $5 de cursiva o $10 de compleja. Manda el cotizador, que es más nuevo y
  está en producción. La documentación de Notion es la que está desactualizada.

---

<p align="center"><sub>AL3D · Anuncios Luminosos 3D · Guadalajara, Jalisco</sub></p>
