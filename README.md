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

- **Partidas por tipo** — letras 3D, recorte de acrílico, bastidor, caja de luz o captura manual, cada una con su catálogo de materiales y tarifas. Si borras una por error, el aviso trae **Deshacer**.
- **Materiales de letras 3D** — aluminio pintado ($30/cm), aluminio brush cepillado ($35/cm), acrílico + aluminio ($40/cm), acrílico + vinil ($45/cm) y **acero inoxidable ($55/cm)**. El precio se cobra por centímetro de altura × letra, más el extra de complejidad tipográfica.
- **Cotizar con IA** — analiza un JPG o PDF del proyecto y propone las partidas. Antes de analizar avisa si ya tienes trabajo capturado y deja conservarlo.
- **Escalador de imagen** — mide elementos sobre una foto o plano sin cotas: se calibra con una referencia conocida y de ahí se sacan las demás medidas. Con el dedo, cada toque coloca un punto y deslizando sin soltar se afina con lupa antes de dejarlo; los extremos ya trazados se arrastran para corregir la medida sin borrarla, y mover la referencia recalcula todas. El botón **← Cotizador** de arriba, el que queda pegado al pie del panel y el "atrás" del celular regresan a la cotización en cualquier momento.
- **Autorización** — flujo de vendedor a autorizador; el precio se bloquea al solicitar autorización. El autorizador puede ajustar el total o partida por partida, hacia abajo o hacia arriba, y ese precio es el que manda en el PDF, el anticipo y el registro de venta.
- **PDF de cotización** con el logotipo, el desglose de partidas, IVA, descuento autorizado y anticipo sugerido.
- **Registrar venta** — anticipo, comisión, estatus y saldo pendiente, calculados sobre el precio realmente autorizado.
- **Historial** de cotizaciones guardado en el propio dispositivo, con buscador y botón para **volver a abrir** una cotización y regenerar su PDF.
- **Pensado para cotizar desde el celular** — el total va siempre a la vista en una barra fija abajo, con el botón de la acción que toca; las partidas se recogen en tarjetas de un renglón y solo se abre la que estás editando; los catálogos de material se leen como lista, con su precio a la derecha.

## Uso

Todo corre en el navegador, sin instalar nada. Desde el celular conviene abrir la liga y agregarla a la pantalla de inicio (Chrome → menú → *Agregar a pantalla principal*) para que quede como aplicación: así abre sin la barra de direcciones.

### En el celular

- Abajo queda fija una barra con el **total neto** —o el precio autorizado, si ya lo hay— y el botón principal: *Solicitar autorización* mientras es borrador, *Generar PDF* una vez autorizada. Tocando el total se salta al resumen.
- Con dos o más partidas, las que no estás editando se recogen en una tarjeta que muestra el tipo, lo que la distingue y su total. Si le falta algo, la tarjeta se pinta en ámbar y dice qué falta. Se toca para abrirla y se cierra sola la anterior.
- Al agregar o duplicar una partida se abre esa; al traer varias de golpe (IA o escalador) quedan todas recogidas para revisar la lista de un vistazo.

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
