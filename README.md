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

- **Partidas por tipo** — letras 3D, recorte de acrílico, bastidor, caja de luz o captura manual, cada una con su catálogo de materiales y tarifas. En letras 3D los materiales van de aluminio pintado ($30/cm) a **acero inoxidable ($55/cm)**. Si borras una partida por error, el aviso trae **Deshacer**.
- **Cotizar con IA** — analiza un JPG o PDF del proyecto y propone las partidas. Antes de analizar avisa si ya tienes trabajo capturado y deja conservarlo. También puede analizar **la imagen que acabas de medir en el escalador**, con tus cotas: ahí las medidas ya no las estima, las toma tal cual.
- **Escalador de imagen** — mide elementos sobre una foto o plano sin cotas: se calibra con una referencia conocida y de ahí se sacan las demás medidas. Con el dedo, cada toque coloca un punto y deslizando sin soltar se afina con lupa antes de dejarlo; los extremos ya trazados se arrastran para corregir la medida sin borrarla, y mover la referencia recalcula todas. El botón **← Cotizador** de arriba, el que queda pegado al pie del panel y el "atrás" del celular regresan a la cotización en cualquier momento.

  Al terminar de medir hay dos salidas. **Agregar como partidas** crea una partida por medida, con la altura puesta y lo demás por capturar. **✨ Cotizar estas medidas con IA** manda esa misma foto —con las cotas dibujadas encima— y la lista de medidas a la misma IA del cotizador, que devuelve las partidas ya clasificadas: tipo, material, complejidad, iluminación y número de letras, con tus medidas exactas y sin redondear. El mismo botón está en la vista previa de la imagen, junto a las partidas. Si la IA devuelve un número de partidas distinto al de medidas, te lo dice para que revises cuál falta.
- **Vectorizador de imagen** — convierte el JPG que manda el cliente en trazo vectorial: el contorno con el que se corta el acrílico o el aluminio. Tres modos —**Corte** (una silueta), **Logotipo** (pocos colores planos) y **Foto**— con una cortina para comparar el original contra el trazo, y control de detalle, motas, esquinas y fondo. El número de colores es un tope: si el logotipo trae menos, salen menos.

  Dando el **alto o el ancho real** del diseño, el SVG se descarga a escala y abre con las medidas puestas en Illustrator, CorelDRAW o el software de corte, sin reescalar a ojo. De ahí salen también los dos datos que mueven el precio de unas letras 3D: **cuántas piezas son** —cada letra es un contorno, y el hueco de una "O" no cuenta como pieza— y **qué alto tienen**. **Agregar como partida** crea la partida de letras 3D con esos dos campos llenos; el material y la complejidad los sigues eligiendo tú, porque son los que cambian el precio. También enseña el **perímetro de corte** en metros, que es el recorrido del láser.

  **Medir el vector en el escalador** manda el trazo limpio al escalador y, si ya diste la medida real, entra ya calibrado. Medir sobre el vector es más exacto que sobre la foto: los bordes están donde de verdad se va a cortar y no donde el JPG los difuminó.
- **Autorización** — flujo de vendedor a autorizador; el precio se bloquea al solicitar autorización. El autorizador puede ajustar el total o partida por partida, hacia abajo o hacia arriba, y ese precio es el que manda en el PDF, el anticipo y el registro de venta.
- **PDF de cotización** con el logotipo, el desglose de partidas, IVA, descuento autorizado y anticipo sugerido.
- **Registrar venta** — anticipo, comisión, estatus y saldo pendiente, calculados sobre el precio realmente autorizado.
- **Historial** de cotizaciones guardado en el propio dispositivo, con buscador y botón para **volver a abrir** una cotización y regenerar su PDF.

## Uso

Todo corre en el navegador, sin instalar nada. Desde el celular conviene abrir la liga y agregarla a la pantalla de inicio (Chrome → menú → *Agregar a pantalla principal*; en iPhone, Safari → *Compartir* → *Agregar a inicio*) para que quede como aplicación, a pantalla completa y sin la barra del navegador.

En el teléfono la pantalla se acomoda sola y se aprovecha completa:

- **Partidas plegables.** Una partida capturada se recoge a su encabezado —número, tipo, lo que ya está elegido y su total— y se abre con un toque. Al agregar una nueva, las anteriores se pliegan solas, así se ve el resumen de lo que ya iba junto al formulario de lo que se está capturando; al abrir una cotización guardada solo queda desplegada la última. El botón **Plegar todas / Abrir todas** del encabezado de *Partidas* hace las dos cosas de golpe. Es solo una manera de ver la pantalla: no se guarda con la cotización ni sale en el PDF.
- **Barra de arriba a la mitad.** Al desplazarse, el logotipo se va y se queda pegado únicamente el renglón que se usa —folio, rol e historial—: de 115 px fijos a unos 50.
- **Barra fija abajo** con el total y el siguiente paso —solicitar autorización, generar el PDF, lo que toque según el estado—, ya sin tapar el final de la página en los iPhone con franja de gesto.
- Los cinco tipos de partida caben en un solo renglón, las opciones de material y acabado van en dos columnas, y la tarjeta de *Datos del proyecto* se pliega con un toque para dejar las partidas hasta arriba.
- Cada partida nueva se trae a la vista al crearla, todo lo tocable mide 40 px o más, y los campos de medidas abren el teclado numérico.

Los datos —historial, cotizaciones, logotipo— se guardan localmente en cada dispositivo y no se sincronizan entre ellos.

Dentro de *Datos del proyecto* hay un bloque plegable, **Datos que salen en el PDF**, con las entre calles, el límite de fabricación y la nota que se imprime para el cliente. Esos tres campos siguen editables después de autorizar, porque normalmente la fecha de entrega se define justo en ese momento. La nota que escribe el autorizador es interna y no aparece en el documento del cliente.

## Actualizar la versión publicada

El sitio se sirve desde `index.html` en la rama `main`. Para publicar cambios:

1. Renombrar el HTML nuevo a **`index.html`**.
2. Subirlo en [/upload/main](https://github.com/eliasgaribi-ctrl-z/cotizador-al3d/upload/main) y hacer commit a `main`.
3. Esperar entre 30 y 60 segundos a que GitHub Pages redespliegue.

Si el celular sigue mostrando la versión anterior, es la caché: recargar forzando o abrir la liga con `?v=2` al final.

---

<p align="center"><sub>AL3D · Anuncios Luminosos 3D · Guadalajara, Jalisco</sub></p>
