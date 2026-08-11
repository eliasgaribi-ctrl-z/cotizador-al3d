<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo-al3d-dark.png">
    <img src="logo-al3d.png" alt="AL3D — Anuncios Luminosos 3D" width="320">
  </picture>
</p>

<h1 align="center">Cotizador AL3D</h1>

<p align="center">
  Cotizador de anuncios luminosos: letras 3D, recorte de acrílico, bastidores y cajas de luz.
</p>

<p align="center">
  <a href="https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/"><b>▶ Abrir el cotizador</b></a>
</p>

---

## Qué hace

- **Partidas por tipo** — letras 3D, recorte de acrílico, bastidor, caja de luz o captura manual, cada una con su catálogo de materiales y tarifas. En letras 3D los materiales van de aluminio pintado ($30/cm) a **acero inoxidable ($55/cm)**. Si borras una partida por error, el aviso trae **Deshacer** — y también lo trae *Vaciar y empezar cotización nueva*, que es lo que más duele perder.

  Capturando a mano, la partida nueva **hereda el material de la anterior** —el único campo que hay que elegir en todas y que casi nunca cambia dentro del mismo trabajo—. Va marcado con «↩ como la anterior» para que se vea que lo puso la app y no tú: es el dato que más pesa en el precio. En cuanto eliges uno a mano, la etiqueta se quita y ese pasa a ser el que hereden las siguientes. Las partidas que crean el escalador y el vectorizador siguen naciendo sin material, porque ahí nacen de una medida y el material sí sería una suposición con precio. Junto a *+ Agregar partida* está **⧉ Igual que la anterior**, que copia la última completa.

- **El cliente que ya conoces** — al escribir en *Cliente* se sugieren los del historial; al elegir uno se llenan teléfono, dirección y link de Maps, pero **solo los campos que estén vacíos**: nunca se pisa lo que ya escribiste.
- **Completitud dice qué falta, no solo cuánto** — la barra del resumen nombra lo primero pendiente («Falta la dirección», «Partida 2 · falta material») y tocarla lleva ahí: abre los datos del proyecto si estaban plegados y enfoca el campo, o despliega la partida. Cuando no falta nada se apaga.
- **Cotizar con IA** — analiza un JPG o PDF del proyecto y propone las partidas. Si ya tienes trabajo capturado, lo **conserva** y agrega las de la IA al final; reemplazar sigue a un toque, pero ahora es una decisión que se toma a propósito y no por omisión. También puede analizar **la imagen que acabas de medir en el escalador**, con tus cotas: ahí las medidas ya no las estima, las toma tal cual. La imagen analizada se guarda con la cotización, así que sigue ahí si recargas o cierras la pestaña.
- **Escalador de imagen** — mide elementos sobre una foto o plano sin cotas: se calibra con una referencia conocida y de ahí se sacan las demás medidas. Con el dedo, cada toque coloca un punto y deslizando sin soltar se afina con lupa antes de dejarlo; los extremos ya trazados se arrastran para corregir la medida sin borrarla, y mover la referencia recalcula todas. El botón **← Cotizador** de arriba, el que queda pegado al pie del panel y el "atrás" del celular regresan a la cotización en cualquier momento.

  Al terminar de medir hay dos salidas. **Agregar como partidas** crea una partida por medida, con la altura puesta y lo demás por capturar. **✨ Cotizar estas medidas con IA** manda esa misma foto —con las cotas dibujadas encima— y la lista de medidas a la misma IA del cotizador, que devuelve las partidas ya clasificadas: tipo, material, complejidad, iluminación y número de letras, con tus medidas exactas y sin redondear. El mismo botón está en la vista previa de la imagen, junto a las partidas. Si la IA devuelve un número de partidas distinto al de medidas, te lo dice para que revises cuál falta.
- **Vectorizador de imagen** — convierte el JPG que manda el cliente en trazo vectorial: el contorno con el que se corta el acrílico o el aluminio. Tres modos —**Corte** (una silueta), **Logotipo** (pocos colores planos) y **Foto**— con una cortina para comparar el original contra el trazo, y control de detalle, motas, esquinas y fondo. El número de colores es un tope: si el logotipo trae menos, salen menos.

  Dando el **alto o el ancho real** del diseño, el SVG se descarga a escala y abre con las medidas puestas en Illustrator, CorelDRAW o el software de corte, sin reescalar a ojo. De ahí salen también los dos datos que mueven el precio de unas letras 3D: **cuántas piezas son** —cada letra es un contorno, y el hueco de una "O" no cuenta como pieza— y **qué alto tienen**. **Agregar como partida** crea la partida de letras 3D con esos dos campos llenos; el material y la complejidad los sigues eligiendo tú, porque son los que cambian el precio. También enseña el **perímetro de corte** en metros, que es el recorrido del láser.

  **Medir el vector en el escalador** manda el trazo limpio al escalador y, si ya diste la medida real, entra ya calibrado. Medir sobre el vector es más exacto que sobre la foto: los bordes están donde de verdad se va a cortar y no donde el JPG los difuminó.
- **Autorización** — el precio se bloquea al solicitar autorización, y quien autoriza puede ajustar el total o partida por partida, hacia abajo o hacia arriba; ese precio es el que manda en el PDF, el anticipo y el registro de venta.

  La cola del autorizador solo muestra las solicitudes hechas en **ese mismo dispositivo**, y la pantalla lo dice: se guarda ahí, no en un servidor. Cuando el vendedor y el autorizador son la misma persona —que es lo normal, justo por eso—, **⚡ Autorizar yo mismo** abre ese mismo formulario de revisión dentro de la vista de vendedor, sin cambiar el rol de arriba ni volver a cambiarlo después. Es el mismo formulario, así que no hay dos maneras de autorizar que puedan contradecirse. *Solicitar autorización a alguien más* sigue ahí para el flujo de dos personas. El nombre de quien autoriza se recuerda en el dispositivo.

- **Aviso de partidas sin terminar** — una partida de letras sin material vale $0, y antes bastaba con que otra partida tuviera precio para que la incompleta pasara el filtro, se autorizara y saliera en el PDF como un renglón normal, con su descripción bien redactada, en **$0.00**. Ahora, al solicitar o al autorizar, si hay partidas incompletas se listan primero —«Partida 2 · falta material»— y se toca cada una para ir a completarla; las que están completamente vacías se quitan desde ahí mismo. Se puede continuar de todos modos, pero avisado. Si no falta nada, no agrega ni un toque.
- **PDF de cotización** con el logotipo, el desglose de partidas, IVA, descuento autorizado y anticipo sugerido.
- **Enviar por WhatsApp** — abre el chat del teléfono que capturaste con el mensaje ya escrito: folio, proyecto, total autorizado, anticipo y límite de fabricación. **El PDF se adjunta a mano**, y no es descuido: lo que la app llama «PDF» es una página que se manda a imprimir, no un archivo, así que no hay nada que adjuntar por programa.
- **Registrar venta** — anticipo, comisión, estatus y saldo pendiente, calculados sobre el precio realmente autorizado. El porcentaje de comisión y la cuenta se recuerdan.
- **Historial** de cotizaciones guardado en el propio dispositivo, con buscador y dos maneras de reusar una cotización: **↻ Abrir** la trae tal cual, autorizada, para regenerar su PDF; **⧉ Usar como base** copia los datos del cliente y las partidas a una cotización **nueva** —folio nuevo, en borrador, con el precio recalculado y sin arrastrar nada de la autorización anterior—, que es lo que se necesita cuando el mismo cliente pide otro letrero o el local de junto quiere lo mismo con otra medida. Tus plantillas son tus cotizaciones anteriores.

## Uso

Todo corre en el navegador, sin instalar nada. Desde el celular conviene abrir la liga y agregarla a la pantalla de inicio (Chrome → menú → *Agregar a pantalla principal*; en iPhone, Safari → *Compartir* → *Agregar a inicio*) para que quede como aplicación, a pantalla completa y sin la barra del navegador.

En el teléfono la pantalla se acomoda sola y se aprovecha completa:

- **Partidas plegables.** Una partida capturada se recoge a su encabezado —número, tipo, lo que ya está elegido y su total— y se abre con un toque. Al agregar una nueva, las anteriores se pliegan solas, así se ve el resumen de lo que ya iba junto al formulario de lo que se está capturando; al abrir una cotización guardada solo queda desplegada la última. El botón **Plegar todas / Abrir todas** del encabezado de *Partidas* hace las dos cosas de golpe. Es solo una manera de ver la pantalla: no se guarda con la cotización ni sale en el PDF.
- **Barra de arriba a la mitad.** Al desplazarse, el logotipo se va y se queda pegado únicamente el renglón que se usa —folio, rol e historial—: de 115 px fijos a unos 50.
- **Barra fija abajo** con el total y el siguiente paso —solicitar autorización, generar el PDF, lo que toque según el estado—, ya sin tapar el final de la página en los iPhone con franja de gesto.
- Los cinco tipos de partida caben en un solo renglón, las opciones de material y acabado van en dos columnas, y la tarjeta de *Datos del proyecto* se pliega con un toque para dejar las partidas hasta arriba.
- Cada partida nueva se trae a la vista al crearla, todo lo tocable mide 40 px o más, y los campos de medidas abren el teclado numérico.

## Respaldar y mover los datos

Los datos —historial, folios, cotización en curso, logotipo— se guardan localmente en cada dispositivo y no se sincronizan entre ellos. Eso se pierde al borrar los datos del navegador, al cambiar de teléfono o cuando iOS limpia los sitios que llevan semanas sin abrirse.

En el pie del historial hay tres botones:

- **⬇ Respaldar** descarga un archivo con todo lo que la app guarda en ese teléfono.
- **⬆ Restaurar** lo devuelve. Reemplaza lo que haya, así que antes de escribir nada descarga solo un respaldo de lo que estaba, por si acaso.
- **📄 CSV** exporta el historial completo —folio, cliente, teléfono, proyecto, quién autorizó, totales y el detalle de partidas— para pegarlo en Google Sheets.

El respaldo **no incluye la API key** a propósito: un respaldo se manda por WhatsApp o por correo, y una key que viaja así deja de ser secreta. Se vuelve a pegar en el teléfono nuevo, que es un minuto.

Un aviso: el contador de folios también es por dispositivo. Si cotizas desde dos aparatos distintos, los dos empiezan en `COT-0001` y vas a acabar con folios repetidos; mientras no haya sincronización de verdad, conviene cotizar siempre desde el mismo.

Dentro de *Datos del proyecto* hay un bloque plegable, **Datos que salen en el PDF**, con las entre calles, el límite de fabricación y la nota que se imprime para el cliente. Esos tres campos siguen editables después de autorizar, porque normalmente la fecha de entrega se define justo en ese momento. La nota que escribe el autorizador es interna y no aparece en el documento del cliente.

## Actualizar la versión publicada

El sitio se sirve desde `index.html` en la rama `main`. Para publicar cambios:

1. Renombrar el HTML nuevo a **`index.html`**.
2. Subirlo en [/upload/main](https://github.com/eliasgaribi-ctrl-z/cotizador-al3d/upload/main) y hacer commit a `main`.
3. Esperar entre 30 y 60 segundos a que GitHub Pages redespliegue.

Si el celular sigue mostrando la versión anterior, es la caché: recargar forzando o abrir la liga con `?v=2` al final.

---

<p align="center"><sub>AL3D · Anuncios Luminosos 3D · Guadalajara, Jalisco</sub></p>
