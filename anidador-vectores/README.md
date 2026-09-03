# Anidador de vectores (AL3D)

Acomoda las piezas de un SVG dentro de la lámina para gastar el menor material posible
antes de mandarlas al láser o al CNC — el *nesting* que antes se hacía a mano en
svgnest.com. Corre completo en el navegador: el archivo no se sube a ningún servidor.

Vive en [`/anidador-vectores/`](https://eliasgaribi-ctrl-z.github.io/cotizador-al3d/anidador-vectores/)
y se llega a él desde el vectorizador del cotizador —**Acomodar en lámina**— o desde el botón
**Anidador** de la plataforma.

## Qué hace

1. Recibe el SVG de las piezas: arrastrado, pegado con Ctrl+V, elegido del disco, o
   directo del vectorizador del cotizador sin pasar por el disco.
2. Lo pasa a **milímetros**. Si el archivo declara sus medidas (mm, cm, in, pt) se
   convierte solo; si viene en px o sin unidades —que en SVG no es una medida— pide el
   ancho o el alto real del diseño, igual que hace el vectorizador.
3. Dice lo que se va a quedar fuera antes de empezar: textos sin convertir en contornos,
   símbolos `<use>`, imágenes, y las piezas que no caben en la lámina ni giradas.
4. Acomoda las piezas con el motor de código abierto [SVGnest](https://github.com/Jack000/SVGnest)
   (algoritmo genético + *no-fit polygon*), probando giros, y va enseñando el mejor
   acomodo encontrado. Si no caben en una lámina, abre las que hagan falta.
5. **Se detiene solo** cuando lleva 25 intentos y 40 segundos seguidos sin mejorar, porque
   el algoritmo genético nunca termina por su cuenta. «Seguir buscando» continúa desde
   donde iba; «Detener» para cuando el resultado ya convence.
6. Descarga el SVG acomodado **a escala real** (`width="1220mm"`), con una capa por lámina
   —todas en un archivo, o una lámina sola— y el contorno de la lámina en azul en su propia
   capa, para colocar el archivo en la cama y ponerlo en «no cortar».

La lámina se elige de las que compra el taller —1.22 × 2.44 m para acrílico, aluminio y
galvanizada; 1.25 × 2.50 m para alucobond; media lámina— o se teclea otra medida. La
última lámina usada se recuerda en el aparato.

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

El único cambio al motor original es la ruta de `eval.js` en `svgnest.js` (`util/eval.js` →
`js/lib/eval.js`), para que coincida con esta carpeta. El algoritmo no se tocó.

Se sirve **caché primero** con el resto de la plataforma (está en `APP_FILES` de `sw.js`),
así que un cambio aquí llega a los aparatos que ya tienen la app **solo si se sube
`APP_VERSION`**, como con cualquier archivo de la plataforma.

## Pruebas

- `pruebas/anidador-medidas.mjs` — la aritmética de unidades, en node y nada más.
- `pruebas/navegador/anidador.mjs` — carga un SVG, lo acomoda de verdad con los Web Workers,
  comprueba las piezas colocadas y que el SVG de salida esté en milímetros; y que el trazo
  que deja el cotizador se recoge y se borra. Pide Chromium: `pruebas/correr.sh --navegador`.

## Notas para el taller

- La medida que se pide es la del **diseño** —el letrero de orilla a orilla—, no la del
  lienzo o el artboard. Con el ancho o el alto basta.
- La separación es la distancia mínima entre piezas **y** con la orilla de la lámina.
- «Meter piezas chicas en los huecos grandes» sirve cuando hay una «O» o una «D» lo bastante
  grande para recibir otra pieza dentro. Tarda más en calcular.
- El motor solo lee contornos: `path`, `polygon`, `polyline`, `rect`, `circle`, `ellipse`,
  `line`. Un texto sin convertir se queda fuera y la app lo avisa al cargar.
