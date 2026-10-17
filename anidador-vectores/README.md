# Anidador de vectores (AL3D)

Acomoda las piezas de un SVG dentro de la hoja para gastar el menor material posible
antes de mandarlas al láser o al CNC — el *nesting* que antes se hacía a mano en
svgnest.com. Corre completo en el navegador: el archivo no se sube a ningún servidor.

Vive en [`/anidador-vectores/`](https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/anidador-vectores/)
y se llega a él desde el vectorizador del cotizador —**Acomodar en hoja**— o desde el botón
**Anidador** de la plataforma.

## Qué hace

1. Recibe el SVG **o el DXF** de las piezas: arrastrado, pegado con Ctrl+V, elegido del disco,
   o directo del vectorizador del cotizador sin pasar por el disco. El DXF se lee aquí mismo
   (`js/dxf-entrada.js`: LINE, LWPOLYLINE/POLYLINE con bulge, ARC, CIRCLE, ELLIPSE, SPLINE,
   bloques INSERT; unidades de `$INSUNITS`, mm si no lo dice y se avisa) y entra como un SVG en mm.
   **Limpieza antes de acomodar** (`js/contornos.js`), lo que antes se hacía con «Reparar
   problema»: las líneas sueltas —de un DXF o un `<line>`/trazo abierto de un SVG— se juntan por
   sus extremos con tolerancia creciente (de 1 micra a 0.5 mm); lo que no cierra se pinta en ámbar
   y se avisa; los contornos repetidos y lo que no tiene área se quitan. Cuando una letra viene
   dibujada entera y además partida por dentro en mitades o tiras (AVIDA, Primaria y America Car
   Rental), se corta **el contorno completo**, con todos sus huecos, y se quitan las partes (Elías,
   17/10/2026: «tiene que ser el contorno»); el aviso deja cambiar a cortar las partes. La
   **línea doble** (un contorno casi igual a ≤3 mm alrededor de otro) se quita: se cortaría una
   tira. Lo quitado se pinta punteado.
2. Lo pasa a **milímetros**. Si el archivo declara sus medidas (mm, cm, in, pt) se
   convierte solo; si viene en px o sin unidades —que en SVG no es una medida— pide el
   ancho o el alto real del diseño, igual que hace el vectorizador.
3. Dice lo que se va a quedar fuera antes de empezar: textos sin convertir en contornos,
   símbolos `<use>`, imágenes, y las piezas que no caben en la hoja ni giradas.
4. Acomoda las piezas con **sparrow** ([repositorio](https://github.com/JeroenGar/sparrow),
   KU Leuven 2025, MIT), lo más avanzado que hay en código abierto para piezas irregulares, a
   través del puente WebAssembly de [sparrow-studio](https://github.com/JeroenGar/sparrow-studio)
   (MIT). Desde el 17/10/2026 es el motor de omisión: Elías dijo que el de SVGnest «no está bien
   optimizado» y era cierto —con su letrero de AVIDA, 2.37 m de hoja contra 2.04 de sparrow, y a
   1 cm de separación dos hojas contra una—. Lo que hace:
   - colisiones exactas con la **separación** pedida, de pieza a pieza y con la orilla;
   - **giro libre** de omisión (cualquier ángulo); con veta, solo 0° y 180°;
   - acomoda en una franja del ancho de la hoja buscando el **menor largo**, así que lo que
     sobra queda junto, como **retazo** rectangular de lado a lado; en los trabajos chicos prueba
     también franjas más angostas y se queda con la que gasta menos superficie (las piezas
     quedan en una esquina);
   - corre **varias búsquedas a la vez** (una por núcleo, menos uno) con distinta semilla y se
     queda con la mejor; si no cabe en una hoja, lo que cabe entero en el primer largo es la
     hoja 1 y lo demás vuelve al motor para la siguiente;
   - no mete piezas dentro del hueco de otra (reserva la huella de fuera entera).
   El código: `js/motor-sparrow.js` (la traducción, pura y probada en node),
   `js/motor-sparrow-mesa.js` (los Web Workers, las semillas, los anchos y el reparto en hojas),
   `js/motor-sparrow-trabajador.js` (el Worker) y `motor/` (el paquete compilado, con sus
   licencias y SHA256SUMS; ver «El motor compilado» abajo). Donde no hay Web Workers de módulo o
   WebAssembly, se usa el motor viejo, [SVGnest](https://github.com/Jack000/SVGnest).
5. **Cuánto busca**: 2, 5 o 10 minutos (Elías, 17/10/2026: «quiero que todo sea a fondo»; el modo
   «Rápido» se quitó). «Detener» se queda con el mejor acomodo que lleve. El marcador dice el
   aprovechamiento de lo que se gasta de hoja (las hojas llenas y, de la última, el rectángulo
   usado) y el retazo que queda.
6. Descarga el acomodo **a escala real**, con una capa por hoja —todas en un archivo, o una
   hoja sola— y el contorno de la hoja en azul en su propia capa, para colocar el archivo en
   la cama y ponerlo en «no cortar». En **DXF**, el de omisión y el del router: R12, en mm,
   cada contorno —el de fuera de cada pieza y cada hueco— como UNA polilínea cerrada, con
   las curvas a 0.05 mm (`js/dxf.js`). Antes iba solo el SVG, y el programa del router lo
   abría con cada curva en tramitos sueltos y encimados que había que juntar a mano o con
   «Reparar problema». O en **SVG** (`width="1200mm"`), para el láser o Illustrator.

La hoja se elige mirándola: en este taller todas son de 1.20 × 2.40 m, así que las tarjetas
son la completa, la media y el cuarto, y la cuarta es el retazo, que se mide a mano y se
guarda con su nombre para la próxima vez. El material —acrílico, aluminio, galvanizada,
alucobond, MDF— cambia el acabado con el que se pinta la hoja en la mesa y el nombre del
archivo que se descarga. Hoja, material y retazos se recuerdan en el aparato
(`al3d_anidador_material`, `al3d_anidador_retazos`).

La mesa es la cama de un láser: oscura, con cuadrícula, y las hojas encima con su acabado.
Las piezas caen en su lugar, cada una de su color, cada vez que el motor mejora; el marcador
lleva el aprovechamiento en una aguja con su calificación, la merma, las colocadas y las
hojas. Con «reducir movimiento» en el sistema, nada se mueve.

**La separación** se elige a la vista: 3 mm, 6 mm o 1 cm de un toque, o cualquier número en el
campo. Es la distancia mínima entre pieza y pieza; con la orilla de la hoja SVGnest deja al menos
la mitad (media separación arriba y a la izquierda, una y media abajo y a la derecha), y así lo
dice la interfaz y lo revisan `cabe()` y `revisarSeparacion()`. Se recuerda en el aparato, sale en el pie de cada hoja y en el nombre del archivo
descargado (`…-sep6mm-acomodado.dxf`). «Se corta con» ya no se deduce de la separación: la broca
elegida se queda y la marca de vibración la sigue usando. A SVGnest se le pide 1 mm de más
(`MARGEN_MOTOR_MM`): su polígono de cada pieza se queda corto de la curva y, medido con AVIDA a
6 mm, dejaba 17 lugares más juntos que lo pedido; con el milímetro de más, cero.

**Nada a menos de la separación.** Con el acomodo quieto (del motor, de `colocar()` o movido a
mano), `revisarSeparacion()` revisa cada par con la curva fina y marca en rosa punteado las piezas
que queden a menos de la separación (0.1 mm de gracia), o a menos de ella de la orilla, y el pie
dice cuáles.

**El retazo útil.** Junto al aprovechamiento, «Te queda un retazo de 1.20 × 1.55 m»: el rectángulo
libre más grande de la última hoja, a la separación de las piezas (`js/sobrante.js`), dibujado
punteado sobre la mesa y con «Guardar como retazo».

**Para conectar otro motor** sin tocar la interfaz (`window.Anidador`):
`piezasLimpias(tolerancia)` → `[{id, numero, contorno:[{x,y}], huecos:[[{x,y}]], origen:{x,y}}]` en
mm, cada pieza trasladada a su esquina mínima; `colocar([{id, x, y, giro, hoja}], {mensaje})` arma
las hojas de la mesa (la pieza en su esquina mínima se gira `giro`° alrededor de (0,0) y se lleva a
(x, y) de la hoja `hoja`), y de ahí salen igual la mesa, mover a mano, la vibración, la separación,
el retazo y el DXF/SVG; `posiciones()` devuelve lo que hay en la mesa en ese mismo formato.

## Cómo correrla en local

El cálculo corre en Web Workers, y los navegadores no dejan crear Web Workers desde un
archivo abierto con doble clic (`file://`). Hay que servir la carpeta **raíz del repo** —no
esta carpeta, porque la página toma la hoja de estilos y el logotipo de arriba—:

```bash
# desde la raíz del repositorio
python3 -m http.server 8000
# abre http://localhost:8000/anidador-vectores/
```

No requiere `npm install` ni ninguna dependencia.

## Estructura

```
anidador-vectores/
├── index.html               la interfaz
├── README.md                este archivo
├── css/
│   └── anidador.css         solo lo que css/sistema.css no tiene: la rejilla y el lienzo
└── js/
    ├── app.js               la interfaz: cargar, medir, acomodar, descargar
    ├── medidas.js           unidades del archivo → milímetros; puro, probado en node
    ├── dxf.js               el acomodo en DXF R12, polilíneas cerradas; puro, probado en node
    ├── vibracion.js         cortes rectos muy juntos (el router vibra); puro, probado en node
    ├── dxf-entrada.js       abrir un DXF: entidades, curvas, bloques, unidades; puro, en node
    ├── contornos.js         juntar líneas sueltas, quitar repetidos/guías/líneas dobles; puro, en node
    ├── sobrante.js          el rectángulo libre más grande de una hoja; puro, en node
    ├── svgnest.js           motor de anidamiento (genético + NFP)       ┐
    ├── svgparser.js         formas SVG → polígonos                       │ vendorizados de
    ├── SVGNEST-LICENSE.txt  licencia MIT del motor                       │ SVGnest (MIT),
    └── lib/                 dependencias del motor:                      │ sin tocar el
        ├── clipper.js         booleanas de polígonos                     │ algoritmo
        ├── geometryutil.js    áreas, NFP, rotaciones                     │
        ├── matrix.js          matrices de transformación SVG             │
        ├── placementworker.js coloca las piezas dado un conjunto de NFPs │
        ├── parallel.js        arma los Web Workers                       │
        ├── eval.js            punto de entrada de los Web Workers        │
        ├── json.js            polyfill de JSON para los workers          │
        └── pathsegpolyfill.js pathSegList, que Chrome quitó              ┘
```

Hay dos cambios locales al motor original, los dos en `svgnest.js` y marcados con `AL3D`:
la ruta de `eval.js` (`util/eval.js` → `js/lib/eval.js`), para que coincida con esta carpeta,
y la «corrida»: un número que sube en `stop()` y en `config()`; cada intento en los workers se
lleva el suyo y, si al volver ya no es el vigente, no toca la caché de NFP ni `best`. Sin ella,
detener un cálculo a 3 mm y volver a acomodar a 30 mm se quedaba en «Calculando el primer
acomodo…» para siempre (lo cubre `pruebas/navegador/anidador.mjs`). El algoritmo de
anidamiento no se tocó.

Se sirve **caché primero** con el resto de la plataforma (está en `APP_FILES` de `sw.js`),
así que un cambio aquí llega a los aparatos que ya tienen la app **solo si se sube
`APP_VERSION`**, como con cualquier archivo de la plataforma.

## Pruebas

- `pruebas/anidador-medidas.mjs` — la aritmética de unidades, en node y nada más.
- `pruebas/anidador-dxf.mjs` — el DXF, leído de vuelta par por par: cerrado, sin puntos
  repetidos, en su capa, a escala y sin espejo.
- `pruebas/anidador-contornos.mjs` — juntar líneas sueltas (huecos de dibujo, tramos repetidos y
  encimados); con una letra entera y sus partes, cortar el contorno (o las partes, si se pide); y
  quitar la línea doble y lo repetido sin tocar un hueco de verdad.
- `pruebas/anidador-dxf-entrada.mjs` — un DXF armado a mano: unidades, LINE sueltas, bulge, ARC,
  CIRCLE, ELLIPSE, SPLINE racional, bloques girados y escalados, extrusión al revés; y el retazo útil.
- `pruebas/anidador-vibracion.mjs` — los cortes rectos muy juntos: qué es tramo recto, qué par
  se marca y cuál no (esquinas, piezas giradas, la misma letra, una pieza dentro de un hueco).
- `pruebas/navegador/an-entrada.mjs` — abre un DXF en cm con LINE sueltas, un repetido, un contorno
  de guía con sus mitades, una línea doble, una línea que no cierra y un texto; revisa la limpieza,
  cortar el contorno completo o las partes, que a 3 mm, 6 mm y 1 cm ninguna pieza quede a menos de
  la separación, el retazo útil, y `colocar(posiciones())`.
- `pruebas/navegador/an-sparrow.mjs` — el motor sparrow de verdad en la página: arranca (Worker,
  .wasm, snippets/), se para al tiempo pedido, nada encimado ni a menos de la separación (medido en
  el DXF con las curvas finas), la veta a 0° y 180° en la hoja parada, y «Detener».
- `pruebas/navegador/anidador.mjs` — carga un SVG, lo acomoda de verdad con los Web Workers,
  comprueba las piezas colocadas y que el SVG de salida esté en milímetros; y que el trazo
  que deja el cotizador se recoge y se borra. Pide Chromium: `pruebas/correr.sh --navegador`.

## Notas para el taller

- La medida que se pide es la del **diseño** —el letrero de orilla a orilla—, no la del
  lienzo o el artboard. Con el ancho o el alto basta.
- La separación es la distancia mínima entre piezas; con la orilla queda al menos la mitad.
- «Se corta con» la escribe con un toque, con los números del taller: **láser 2 mm**, y en
  router el diámetro de la broca más un poco de aire —**1/8″ 4.5 mm, 3/16″ 6 mm, 1/4″ 7.5 mm**—.
  Con 3 mm, la de omisión, no pasa ni la broca más chica.
- **Donde el router vibra.** Con una broca elegida en «Se corta con», la mesa marca en rojo las
  piezas cuyas orillas rectas quedan paralelas y tan juntas que la tira de material de en medio
  vibra (audio del taller, 16/10/2026: «no puedo poner dos L a la par»), y el pie dice cuáles son
  para mover solo esas. Cuenta lo que queda entre los dos cortes —la distancia entre las orillas
  menos el ancho de la broca— contra «Material mínimo entre dos cortes rectos» (3 mm de omisión;
  el número es del taller). Solo tramos rectos de 15 mm o más que corran juntos 15 mm o más, con
  hasta 5° de diferencia, y entre piezas distintas. Se revisa con el acomodo quieto y al mover
  piezas a mano; la marca es de la mesa y no llega al archivo de corte.
- «Meter piezas chicas en los huecos grandes» sirve cuando hay una «O» o una «D» lo bastante
  grande para recibir otra pieza dentro. Tarda más en calcular.
- «Buscar también dentro de las concavidades» (el *Explore concave areas* del demo original)
  mete piezas en el hueco abierto de una «C», una «U» o una «G», que de entrada se trata
  como lleno. Tarda bastante más; nace apagado, igual que en svgnest.com.
- Lo vendorizado es byte por byte el `master` de SVGnest, salvo los dos cambios de
  `svgnest.js` descritos arriba (ruta de `eval.js` y «corrida»): al actualizar el motor hay que
  volver a aplicarlos. Los
  parámetros que el demo original expone y aquí no se piden —tolerancia de curva, tamaño de
  población y mutación del genético— van con sus valores por omisión (0.3, 10 y 10 %),
  porque en mm la tolerancia de 0.3 ya es fina para rotulación y los otros dos no cambian
  el resultado en trabajos de este tamaño.
- El motor solo lee contornos: `path`, `polygon`, `polyline`, `rect`, `circle`, `ellipse`.
  Los `line` y trazos abiertos se juntan antes en contornos (`juntarSueltas()`). Un texto sin
  convertir se queda fuera y la app lo avisa al cargar.
