// @ts-nocheck
// ============================================================================
// LA FUNCIÓN `importar-diario` EN UN SOLO ARCHIVO, para pegarla entera en el editor del panel de Supabase.
// GENERADO por supabase/functions/importar-diario/desplegar/armar.mjs con esbuild 0.24.2. NO SE EDITA A MANO:
// se cambian las fuentes y se vuelve a armar (node supabase/functions/importar-diario/desplegar/armar.mjs).
// Cómo se despliega y qué secretos lleva: supabase/README.md, «La copia diaria (importar-diario)».
// Fuentes (huella sha256 de 16 caracteres, con saltos LF); pruebas/supabase-importar-diario.mjs falla si una cambió:
//   998974899ffa11bc  datos/semilla.json
//   e77af4afd7f5ddf0  js/datos/agenda.js
//   d8b415f4d8dcf1ed  js/datos/catalogo-precios.js
//   64c4eb181e3d381f  js/datos/cotizador.js
//   2dd6625d9ef82214  js/datos/db.js
//   5e57c990f1be0624  js/datos/entrega.js
//   121a081376026fad  js/datos/geo.js
//   71dc554fabaf8870  js/datos/prefs.js
//   cfd0119724bf4a0e  js/datos/proyectos.js
//   4c17a0a8e1003a4e  js/datos/puente.js
//   f264d239bd03e18f  js/datos/taller.js
//   a80af2424caeef7c  js/nucleo/fechas.js
//   5be48180438525b2  js/nucleo/ingreso.js
//   182f2f140a2e13d6  js/nucleo/ui.js
//   5d93c4aec89d58bb  scripts/importador/celdas.mjs
//   9c015d4000ba42f9  scripts/importador/plan.mjs
//   97de8976ab229559  scripts/importador/sql.mjs
//   13245dbb0ee89b72  supabase/functions/_shared/http.js
//   2b5e0ad232337eb4  supabase/functions/_shared/respaldo.js
//   02ed914bbd6ab1de  supabase/functions/_shared/sello.js
//   217550f09676854a  supabase/functions/importar-diario/base.js
//   a71a48031bacb916  supabase/functions/importar-diario/copia.js
//   3effd9bd054b80dd  supabase/functions/importar-diario/handler.js
//   f258da7bfe7dfd34  supabase/functions/importar-diario/index.ts
//   944d38c278361c01  supabase/functions/importar-diario/respaldo.js
// ============================================================================
// supabase/functions/importar-diario/index.ts
import postgres from "npm:postgres@3.4.5";

// datos/semilla.json
var semilla_default = {
  _lee_esto_primero: [
    "Estos números NO existían en ningún sistema de AL3D: no están en Notion, no están en",
    "Drive, y las categorías de gasto («Laminas», «Iluminacion», «Graficos», «Maquila») no",
    "traen desglose por proyecto. Así que son un punto de partida razonado, no una medición.",
    "Cada material lleva su `factor_origen` y cada constante su `origen`: el número está a la",
    "vista con la aritmética de la que salió, para que corregirlo sea leer una frase y",
    "cambiar un dígito. VERIFICA cada factor con tu proveedor en la primera compra.",
    "La plataforma funciona con estos valores desde el minuto uno y va marcando cada línea",
    "como «estimada»; cada corrección que haga fabricación alimenta el bucle de calibración."
  ],
  version: "s-2026-08",
  unidades_compra: ["unidad", "bolsa", "caja", "lamina", "litro", "metro"],
  plazos: [
    { k: 1, semanas: 1, dias: 7, etiqueta: "1 semana" },
    { k: 2, semanas: 1.5, dias: 11, etiqueta: "1.5 semanas" },
    { k: 3, semanas: 2, dias: 14, etiqueta: "2 semanas" },
    { k: 4, semanas: 2.5, dias: 18, etiqueta: "2.5 semanas" },
    { k: 5, semanas: 3, dias: 21, etiqueta: "3 semanas o más" }
  ],
  _plazos_origen: "Las palabras textuales del dueño: «1 semana - 1.5 semanas - 2 semanas - 2.5 semanas - 3 o + semanas». 1.5 semanas son 10.5 días y se redondean a 11, y 2.5 a 18: SIEMPRE hacia arriba, porque el plazo se cuenta hacia atrás desde la instalación, un plazo más largo hace arrancar antes, y el sesgo declarado del proyecto es preferir el falso positivo. La tabla que manda es la de js/datos/taller.js; ésta es su eco, para que quien lea la semilla sepa que existe.",
  materiales: [
    {
      id: "acr-3mm",
      nombre: "Acrílico blanco/opal 3 mm",
      familia: "acrilico",
      unidad_compra: "lamina",
      medida: "1.22 × 2.44 m",
      unidad_consumo: "m²",
      factor: 2.9768,
      min_compra: 1,
      merma: 0.25,
      fraccionable: true,
      largo_cm: 244,
      ancho_cm: 122,
      factor_origen: "1.22 m × 2.44 m = 2.9768 m² por lámina. Merma 25%: el nesting de letras deja recortes que casi nunca se reusan.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "acr-6mm",
      nombre: "Acrílico blanco 6 mm",
      familia: "acrilico",
      unidad_compra: "lamina",
      medida: "1.22 × 2.44 m",
      unidad_consumo: "m²",
      factor: 2.9768,
      min_compra: 1,
      merma: 0.25,
      fraccionable: true,
      largo_cm: 244,
      ancho_cm: 122,
      factor_origen: "Igual que el de 3 mm: la lámina mide lo mismo, cambia el espesor. Se usa en letras de más de 40 cm y en caras de caja de luz, donde el 3 mm se pandea.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "al-pintado",
      nombre: "Lámina aluminio pintado",
      familia: "aluminio",
      unidad_compra: "lamina",
      medida: "1.22 × 2.44 m",
      unidad_consumo: "m²",
      factor: 2.9768,
      min_compra: 1,
      merma: 0.12,
      fraccionable: true,
      largo_cm: 244,
      ancho_cm: 122,
      factor_origen: "1.22 × 2.44 = 2.9768 m². Merma 12%, menor que el acrílico: el aluminio se dobla en vez de cortarse en silueta.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "al-brush",
      nombre: "Lámina aluminio brush cepillado",
      familia: "aluminio",
      unidad_compra: "lamina",
      medida: "1.22 × 2.44 m",
      unidad_consumo: "m²",
      factor: 2.9768,
      min_compra: 1,
      merma: 0.12,
      fraccionable: true,
      largo_cm: 244,
      ancho_cm: 122,
      factor_origen: "Igual que el pintado. OJO: el cepillado tiene dirección, así que en la práctica la merma puede ser mayor si las piezas tienen que ir todas al mismo hilo.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "fleje-al-pintado",
      nombre: "Fleje aluminio pintado 5 cm",
      familia: "fleje",
      unidad_compra: "metro",
      medida: "rollo de 30 m",
      unidad_consumo: "m",
      factor: 1,
      min_compra: 30,
      merma: 0.12,
      fraccionable: false,
      largo_cm: 3e3,
      ancho_cm: 5,
      factor_origen: "Se compra por metro y se consume por metro: factor 1. El mínimo es el rollo de 30 m porque nadie vende 4 m de fleje.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "fleje-al-brush",
      nombre: "Fleje aluminio brush 5 cm",
      familia: "fleje",
      unidad_compra: "metro",
      medida: "rollo de 30 m",
      unidad_consumo: "m",
      factor: 1,
      min_compra: 30,
      merma: 0.12,
      fraccionable: false,
      largo_cm: 3e3,
      ancho_cm: 5,
      factor_origen: "Igual que el pintado.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "fleje-inox",
      nombre: "Fleje acero inoxidable espejo 5 cm",
      familia: "fleje",
      unidad_compra: "lamina",
      medida: "1.22 × 2.44 m",
      unidad_consumo: "m",
      factor: 58.56,
      min_compra: 1,
      merma: 0.15,
      fraccionable: true,
      largo_cm: 244,
      ancho_cm: 122,
      factor_origen: "El inox no viene en rollo: se compra la lámina y se corta en tiras. floor(122 cm / 5 cm) = 24 tiras × 2.44 m = 58.56 m de fleje por lámina. Los 2 cm que sobran a lo ancho son el desperdicio ya contado.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "lam-galv",
      nombre: "Lámina galvanizada calibre 24",
      familia: "lamina",
      unidad_compra: "lamina",
      medida: "1.22 × 2.44 m",
      unidad_consumo: "m²",
      factor: 2.9768,
      min_compra: 1,
      merma: 0.1,
      fraccionable: true,
      largo_cm: 244,
      ancho_cm: 122,
      factor_origen: "1.22 × 2.44 = 2.9768 m². Es el panel del bastidor y la trasera y el marco de la caja de luz.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "alucobond",
      nombre: "Alucobond 4 mm",
      familia: "lamina",
      unidad_compra: "lamina",
      medida: "1.25 × 2.50 m",
      unidad_consumo: "m²",
      factor: 3.125,
      min_compra: 1,
      merma: 0.1,
      fraccionable: true,
      largo_cm: 250,
      ancho_cm: 125,
      factor_origen: "1.25 × 2.50 = 3.125 m². Su lámina es más grande que la de acrílico y aluminio: 2.50 m de largo, no 2.44. Importa cuando una pieza mide 2.45 m.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "vinil-corte",
      nombre: "Vinil de corte",
      familia: "vinil",
      unidad_compra: "metro",
      medida: "rollo de 1.22 m de ancho",
      unidad_consumo: "m²",
      factor: 1.22,
      min_compra: 1,
      merma: 0.2,
      fraccionable: true,
      largo_cm: null,
      ancho_cm: 122,
      factor_origen: "Un metro lineal de un rollo de 1.22 m de ancho da 1.22 m². Merma 20%: el vinil se corta con márgenes de agarre y las piezas no tesela.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "led-6500",
      nombre: "Módulo LED 12 V 6500 K (luz fría)",
      familia: "iluminacion",
      unidad_compra: "caja",
      medida: "caja de 100 módulos",
      unidad_consumo: "pieza",
      factor: 100,
      min_compra: 1,
      merma: 0.03,
      fraccionable: false,
      factor_origen: "Caja de 100. La temperatura NO cambia la cantidad: son dos claves distintas del catálogo, y hasta hoy nadie sabía cuál pedir hasta abrir la caja.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "led-3000",
      nombre: "Módulo LED 12 V 3000 K (luz cálida)",
      familia: "iluminacion",
      unidad_compra: "caja",
      medida: "caja de 100 módulos",
      unidad_consumo: "pieza",
      factor: 100,
      min_compra: 1,
      merma: 0.03,
      fraccionable: false,
      factor_origen: "Caja de 100, igual que la fría.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "fuente-60",
      nombre: "Fuente 12 V 60 W",
      familia: "iluminacion",
      unidad_compra: "unidad",
      medida: "",
      unidad_consumo: "pieza",
      factor: 1,
      min_compra: 1,
      merma: 0,
      fraccionable: false,
      factor_origen: "Se compra por pieza. 12 V 5 A = 60 W nominales; el cálculo de cuántas hacen falta usa 48 W útiles (ver DERATE_FUENTE).",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "tubular-1",
      nombre: 'Tubular 1" calibre 18',
      familia: "estructura",
      unidad_compra: "unidad",
      medida: "tramo de 6 m",
      unidad_consumo: "cm",
      factor: 600,
      min_compra: 1,
      merma: 0.08,
      fraccionable: false,
      largo_cm: 600,
      factor_origen: 'Un tramo de 6 m son 600 cm. Se consume en cm porque el bastidor se mide en cm en el cotizador. El tubular de 1" está nombrado tal cual en la descripción que el cotizador imprime.',
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "remache-18",
      nombre: 'Remache 1/8"',
      familia: "herraje",
      unidad_compra: "caja",
      medida: "caja de 500",
      unidad_consumo: "pieza",
      factor: 500,
      min_compra: 1,
      merma: 0.03,
      fraccionable: false,
      factor_origen: "Caja de 500.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "pija-taquete",
      nombre: 'Taquete + pija 1/4 × 2"',
      familia: "herraje",
      unidad_compra: "bolsa",
      medida: "bolsa de 100 juegos",
      unidad_consumo: "pieza",
      factor: 100,
      min_compra: 1,
      merma: 0.03,
      fraccionable: false,
      factor_origen: "Bolsa de 100 juegos. Se cuenta el juego completo como una pieza: nadie pone el taquete sin la pija.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "separador-20",
      nombre: "Separador inox 20 mm",
      familia: "herraje",
      unidad_compra: "bolsa",
      medida: "bolsa de 50",
      unidad_consumo: "pieza",
      factor: 50,
      min_compra: 1,
      merma: 0.03,
      fraccionable: false,
      factor_origen: "Bolsa de 50. Es lo que separa la letra del muro para que la luz posterior se vea.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 0,
      activo: true
    },
    {
      id: "silicon",
      nombre: "Silicón estructural",
      familia: "consumible",
      unidad_compra: "unidad",
      medida: "cartucho",
      unidad_consumo: "m de cordón",
      factor: 12,
      min_compra: 1,
      merma: 0,
      fraccionable: false,
      factor_origen: "Un cartucho de 300 ml da ~12 m de cordón de 5 mm. VERIFICAR: depende del grosor del cordón que use tu gente.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 1,
      activo: true
    },
    {
      id: "solvente",
      nombre: "Limpiador / solvente",
      familia: "consumible",
      unidad_compra: "litro",
      medida: "",
      unidad_consumo: "m² limpiados",
      factor: 25,
      min_compra: 1,
      merma: 0,
      fraccionable: true,
      factor_origen: "Un litro alcanza para ~25 m² de limpieza de acrílico y aluminio antes de armar. Es un consumible: no se pide por proyecto, se repone por mínimo.",
      costo_compra: null,
      proveedor: "",
      tel_proveedor: "",
      min_stock: 2,
      activo: true
    }
  ],
  constantes: [
    {
      clave: "K_ANCHO_CAJA",
      valor: 0.75,
      unidad: "ancho ÷ altura",
      grupo: "geometria",
      titulo: "Ancho de una letra respecto a su altura",
      origen: "El ancho de tinta medio de las 26 mayúsculas de una tipografía grotesca es ~0.60 em, sobre una altura de caja alta de 0.72 em: eso da 0.83. Se baja a 0.75 porque los nombres comerciales cargan a letras angostas (I, L, T, E). Si el escalador midió el ancho de verdad, este número no se usa."
    },
    {
      clave: "K_PERIM_recta",
      valor: 4,
      unidad: "× altura",
      grupo: "geometria",
      titulo: "Perímetro de una letra recta",
      origen: "Perímetro de la caja envolvente = 2(h + 0.75h) = 3.5h; el contorno de una mayúscula es ~0.9 de eso = 3.15h. Y ~40% de las capitales tienen contraforma (O, A, B, D, P, R, Q) que añade un contorno interior de ~0.6 del exterior: 3.15 + 0.4×1.9 = 3.9h. Se redondea a 4.0."
    },
    {
      clave: "K_PERIM_cursiva",
      valor: 4.8,
      unidad: "× altura",
      grupo: "geometria",
      titulo: "Perímetro de una letra cursiva",
      origen: "+20% sobre la recta: la inclinación y los trazos de unión añaden contorno sin añadir altura."
    },
    {
      clave: "K_PERIM_compleja",
      valor: 5.6,
      unidad: "× altura",
      grupo: "geometria",
      titulo: "Perímetro de una letra compleja",
      origen: "+40% sobre la recta: puntas pronunciadas y remates."
    },
    {
      clave: "K_AREA_RECORTE",
      valor: 0.95,
      unidad: "× altura²",
      grupo: "geometria",
      titulo: "Cuánto de su cuadro llena una pieza de recorte",
      origen: "Un logotipo o una silueta llenan casi todo su cuadro envolvente, al contrario de una letra. Casi 1, no 1: siempre queda algo de aire."
    },
    {
      clave: "APROV_NESTING_simple",
      valor: 0.8,
      unidad: "—",
      grupo: "aprovechamiento",
      titulo: "Aprovechamiento de lámina en corte recto",
      origen: "Cuadros envolventes acomodados en una hoja rectangular, contando el desperdicio de orilla y el ancho del corte. De cada 100 cm² de lámina se usan 80."
    },
    {
      clave: "APROV_NESTING_irregular",
      valor: 0.72,
      unidad: "—",
      grupo: "aprovechamiento",
      titulo: "Aprovechamiento en corte irregular",
      origen: "Cursiva, compleja y siluetas: las piezas no tesela y entre una y otra queda material que no se reusa."
    },
    {
      clave: "APROV_TIRAS",
      valor: 0.9,
      unidad: "—",
      grupo: "aprovechamiento",
      titulo: "Aprovechamiento del fleje",
      origen: "Cortar el canto de una tira: ~10% se va en dobleces, uniones y arranques."
    },
    {
      clave: "PROF_CANTO_CM",
      valor: 5,
      unidad: "cm",
      grupo: "taller",
      confirmar: true,
      titulo: "Profundidad del canto de una letra 3D",
      origen: "Retorno estándar de letra 3D con LED: aloja el módulo (~1.5 cm) más la separación a la cara para que no se vea el punto de luz. ESTE es uno de los tres números que conviene que confirmes: es el que más cambia de taller a taller."
    },
    {
      clave: "PROF_CAJA_CM",
      valor: 15,
      unidad: "cm",
      grupo: "taller",
      confirmar: true,
      titulo: "Profundidad de una caja de luz",
      origen: "Profundidad mínima para que la luz llegue a la cara sin manchas. Confírmalo: define cuánta lámina se va en el marco lateral."
    },
    {
      clave: "MOD_POR_M2",
      valor: 45,
      unidad: "módulos/m²",
      grupo: "iluminacion",
      titulo: "Densidad de LED en letra 3D",
      origen: "Un módulo cada ~15 cm en retícula: (100/15)² = 44.4, se redondea a 45."
    },
    {
      clave: "MOD_POR_M2_CAJA",
      valor: 30,
      unidad: "módulos/m²",
      grupo: "iluminacion",
      titulo: "Densidad de LED en caja de luz",
      origen: "Los 15 cm de profundidad difunden más que los 5 cm de una letra, así que la retícula puede abrirse a ~18 cm: (100/18)² = 30.9."
    },
    {
      clave: "W_MODULO",
      valor: 0.72,
      unidad: "W",
      grupo: "iluminacion",
      titulo: "Consumo de un módulo",
      origen: "Módulo de 3 chips SMD 2835 a 12 V: 0.24 W por chip."
    },
    {
      clave: "CAP_FUENTE_W",
      valor: 60,
      unidad: "W",
      grupo: "iluminacion",
      titulo: "Capacidad nominal de la fuente",
      origen: "Fuente de 12 V 5 A, la común. Si compras de otra capacidad, cámbialo aquí."
    },
    {
      clave: "DERATE_FUENTE",
      valor: 0.8,
      unidad: "—",
      grupo: "iluminacion",
      titulo: "Hasta dónde se carga una fuente",
      origen: "Nadie carga una fuente al 100%: se calienta y se muere. Al 80% son 48 W útiles, o 66 módulos por fuente."
    },
    {
      clave: "TRAVESANO_CM",
      valor: 60,
      unidad: "cm",
      grupo: "estructura",
      titulo: "Separación entre travesaños del bastidor",
      origen: "Refuerzo cada 60 cm para que la lámina no se pandee."
    },
    {
      clave: "REMACHE_CM",
      valor: 15,
      unidad: "cm",
      grupo: "estructura",
      titulo: "Separación entre remaches",
      origen: "Un remache cada 15 cm de perímetro."
    },
    {
      clave: "SEPARADORES_LETRA",
      valor: 4,
      unidad: "pza/letra",
      grupo: "estructura",
      titulo: "Separadores por letra",
      origen: "Cuatro por letra para montaje a muro. Una letra chica lleva 2 y una grande 6; 4 es la media y es lo que se pide de más sin que sobre una bolsa."
    },
    {
      clave: "PLAZO_COLCHON_DIAS",
      valor: 1,
      unidad: "días",
      grupo: "plazo",
      titulo: "Días entre «listo» y la instalación",
      origen: "El anuncio no se termina el mismo día que se instala: se carga y se amarra el día antes. Una cita de las 7 de la mañana con la camioneta cargándose a las 6 es como se sale sin los tornillos. Y es EL MISMO día que la plataforma ya usa: emitirSalidasDerivadas() da por salido el material cuando la instalación está a 1 día o menos (js/datos/proyectos.js). Un solo número para los dos mecanismos, en vez de dos números en dos archivos que se separan sin que nadie lo note."
    },
    {
      clave: "PLAZO_PROVEEDOR_DIAS",
      valor: 3,
      unidad: "días",
      grupo: "plazo",
      titulo: "Lo que tarda en llegar el material",
      origen: "Es el mismo 3 que ya vive en dos lugares: el corte de «grave» del semáforo (DIAS_GRAVE en js/datos/agenda.js) y la alarma A1 del .ics (TRIGGER:-P3D), escrito allá con estas palabras: «es lo que el usuario tarda en conseguir material con sus proveedores». Se saca aquí para que un taller con un proveedor de 5 días lo cambie UNA vez. La ventana de taller lo usa para decir cuándo hay que COMPRAR: el día que el material tiene que estar, menos estos días."
    }
  ]
};

// supabase/functions/importar-diario/base.js
function basePostgres(postgres2, url) {
  const sql = postgres2(url, {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 15,
    onnotice: () => {
    },
    connection: { application_name: "importar-diario" }
  });
  return {
    transaccion: (fn) => sql.begin((tx) => fn({
      ejecutar: async (texto2) => {
        await tx.unsafe(texto2);
      },
      consultar: async (texto2, params) => Array.from(await (params && params.length ? tx.unsafe(texto2, params) : tx.unsafe(texto2)))
    })),
    cerrar: () => sql.end({ timeout: 5 })
  };
}

// supabase/functions/_shared/http.js
var ORIGENES_PERMITIDOS = Object.freeze([
  "https://eliasgaribi-ctrl-z.github.io",
  "https://cotizador-al3d.pages.dev"
]);
var EN_LISTA = new Set(ORIGENES_PERMITIDOS);
var origenPermitido = (origen) => typeof origen === "string" && EN_LISTA.has(origen);
var CABECERAS_BASE = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-retry-count",
  "traceparent",
  "tracestate",
  "baggage",
  "x-al3d-contrato"
];
var MARCA_DE_SECRETO = "[oculto]";
var DEFINITIVOS = /* @__PURE__ */ new Set(["ROL_SIN_PERMISO", "NO_ENCONTRADO", "DATO_INVALIDO", "DUPLICADO"]);
function sobreDeError(codigo, mensaje, extra) {
  return { ok: false, codigo, mensaje, definitivo: DEFINITIVOS.has(codigo), ...extra || {} };
}
function ocultarSecretos(texto2, secretos) {
  let t = String(texto2);
  for (const s of secretos || []) {
    if (typeof s !== "string" || s.length < 8) continue;
    for (const forma of /* @__PURE__ */ new Set([s, JSON.stringify(s).slice(1, -1)])) {
      if (forma && t.includes(forma)) t = t.split(forma).join(MARCA_DE_SECRETO);
    }
  }
  return t;
}
function origenDe(peticion) {
  try {
    return peticion.headers.get("origin");
  } catch (_) {
    return null;
  }
}
function cabeceras(peticion, extra) {
  const h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    ...extra || {}
  });
  const origen = origenDe(peticion);
  if (origenPermitido(origen)) h.set("Access-Control-Allow-Origin", origen);
  return h;
}
function json(peticion, status, cuerpo, opciones) {
  const o = opciones || {};
  let texto2 = JSON.stringify(cuerpo);
  if (o.secretos && o.secretos.length) texto2 = ocultarSecretos(texto2, o.secretos);
  return new Response(texto2, { status, headers: cabeceras(peticion, o.cabeceras) });
}
function previa(peticion, { metodos }) {
  const origen = peticion.headers.get("origin");
  if (origen !== null && !origenPermitido(origen)) {
    return json(peticion, 403, sobreDeError("ORIGEN_NO_PERMITIDO", "Este origen no puede usar esta función.", { definitivo: true }));
  }
  const metodo = String(peticion.method || "").toUpperCase();
  if (metodo === "OPTIONS") return preflight(peticion, metodos);
  if (!metodos.includes(metodo)) {
    return json(
      peticion,
      405,
      sobreDeError("DATO_INVALIDO", "Este camino no atiende ese método."),
      { cabeceras: { Allow: metodos.concat("OPTIONS").join(", ") } }
    );
  }
  return null;
}
function preflight(peticion, metodos) {
  const h = new Headers({ "Vary": "Origin, Access-Control-Request-Headers, Access-Control-Request-Method" });
  const origen = peticion.headers.get("origin");
  if (origenPermitido(origen)) {
    const pedidas = String(peticion.headers.get("access-control-request-headers") || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9-]{1,64}$/.test(s));
    h.set("Access-Control-Allow-Origin", origen);
    h.set("Access-Control-Allow-Methods", metodos.concat("OPTIONS").join(", "));
    h.set("Access-Control-Allow-Headers", [.../* @__PURE__ */ new Set([...CABECERAS_BASE, ...pedidas])].slice(0, 40).join(", "));
    h.set("Access-Control-Max-Age", "600");
  }
  return new Response(null, { status: 204, headers: h });
}
async function leerTexto(peticion, tope) {
  const declarado = Number(peticion.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > tope) return { ok: false, motivo: "demasiado_grande" };
  const cuerpo = peticion.body;
  if (cuerpo === null || cuerpo === void 0) return { ok: true, texto: "" };
  if (typeof cuerpo.getReader !== "function") {
    const t = await peticion.text();
    return new TextEncoder().encode(t).byteLength > tope ? { ok: false, motivo: "demasiado_grande" } : { ok: true, texto: t };
  }
  const lector = cuerpo.getReader();
  const partes = [];
  let total = 0;
  try {
    for (; ; ) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > tope) {
        try {
          await lector.cancel();
        } catch (_) {
        }
        return { ok: false, motivo: "demasiado_grande" };
      }
      partes.push(value);
    }
  } catch (_) {
    return { ok: false, motivo: "ilegible" };
  }
  const todo = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    todo.set(p, o);
    o += p.byteLength;
  }
  return { ok: true, texto: new TextDecoder().decode(todo) };
}
function registrar(deps, funcion, nivel, evento, datos, secretos) {
  try {
    let linea = JSON.stringify({ funcion, evento, ...datos || {} });
    if (secretos && secretos.length) linea = ocultarSecretos(linea, secretos);
    if (deps && typeof deps.registrar === "function") deps.registrar(nivel, linea);
    else (nivel === "error" ? console.error : console.log)(linea);
  } catch (_) {
  }
}

// supabase/functions/_shared/respaldo.js
var TABLAS = Object.freeze([
  ["empresas", "id"],
  ["miembros", "empresa_id,correo"],
  ["contadores", "empresa_id,clave,ventana"],
  ["bitacora", "id"],
  ["proyectos", "id"],
  ["ventas_dinero", "proyecto_id"],
  ["abonos", "id"],
  ["instalaciones", "id"],
  ["materiales", "empresa_id,id"],
  ["requerimientos", "empresa_id,id"],
  ["almacen_movimientos", "empresa_id,id"],
  ["almacen_costos", "id"],
  ["constantes", "empresa_id,clave"],
  ["autorizaciones", "id"],
  ["cotizaciones", "empresa_id,folio_global"],
  ["solicitudes", "id"],
  ["cuaderno_notas", "empresa_id,clave,autor_id"],
  ["cuadre_diario", "id"],
  ["tarifas", "empresa_id,grupo,clave"],
  ["gastos", "empresa_id,id"],
  ["pantallas", "id"],
  ["agente_conversaciones", "id"],
  ["agente_mensajes", "id"],
  ["agente_decisiones", "id"],
  // 0027: las cuentas disponibles, los clientes fiscales y sus ventas (al restaurar, el cliente antes que la venta que lo nombra)
  ["ajustes_dinero", "empresa_id"],
  ["clientes_fiscales", "empresa_id,rfc"],
  ["ventas_fiscales", "proyecto_id"]
].map(([nombre, orden]) => Object.freeze({ nombre, orden })));
var FORMATO = "al3d-respaldo-1";
var SECRETO_MINIMO = 32;
function secretoValido(dado, esperado) {
  const a = String(esperado ?? ""), b = String(dado ?? "");
  let d = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0 && a.length >= SECRETO_MINIMO;
}
function nombreDeArchivo(ahoraMs) {
  return "al3d-respaldo-" + new Date(ahoraMs).toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "") + ".json";
}
var MARCA = Object.freeze({ al3d: "respaldo" });

// scripts/importador/plan.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// scripts/importador/celdas.mjs
function col(letra) {
  let n = 0;
  for (const c of String(letra).toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}
var esFecha = (v) => !!v && typeof v === "object" && typeof v.$fecha === "string";
var vacia = (v) => v === "" || v === null || v === void 0;
function texto(v) {
  if (vacia(v)) return "";
  if (esFecha(v)) return v.$fecha;
  return String(v);
}
function numero(v) {
  if (vacia(v)) return { ok: true, n: 0, vacia: true };
  if (typeof v === "number") return Number.isFinite(v) ? { ok: true, n: v } : { ok: false };
  if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return { ok: true, n: Number(v), deTexto: true };
  return { ok: false };
}
function fecha(v) {
  if (vacia(v)) return null;
  if (esFecha(v) && /^\d{4}-\d{2}-\d{2}$/.test(v.$fecha)) return v.$fecha;
  return { texto: texto(v) };
}
function hora(v) {
  if (vacia(v)) return null;
  const s = esFecha(v) ? String(v.$hora || "") : String(v).trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return String(h).padStart(2, "0") + ":" + m[2];
}
function limpioParaTexto(s) {
  const t = String(s);
  return t.includes("\0") ? { s: t.replace(/\u0000/g, ""), tenia: true } : { s: t, tenia: false };
}
function filas(pestana) {
  if (!Array.isArray(pestana)) return [];
  return pestana.slice(1).map((celdas, i) => ({ fila: i + 2, celdas: Array.isArray(celdas) ? celdas : [] }));
}
function encabezados(pestana) {
  return Array.isArray(pestana) && Array.isArray(pestana[0]) ? pestana[0].map((h) => String(h ?? "").trim()) : [];
}

// js/datos/prefs.js
var CLAVES = {
  DISP: "al3d_pf_disp",
  LETRA_FOLIO: "al3d_pf_letra_folio",
  ROL: "al3d_pf_rol",
  NOMBRE: "al3d_pf_nombre",
  GANADAS: "al3d_pf_ganadas",
  TILES: "al3d_pf_tiles",
  GCAL: "al3d_pf_gcal",
  PUENTE: "al3d_pf_puente",
  /* Entrar con Google: SOLO el correo con el que se entró y, si alguien está probando otro,
     el identificador de la app. El token de acceso NUNCA se guarda aquí — es una credencial
     y esta clave viaja en los respaldos. Ver js/nucleo/ingreso.js. */
  INGRESO: "al3d_pf_ingreso",
  ULT_EXPORT: "al3d_pf_ult_export",
  EMPRESA: "al3d_pf_empresa",
  /* La mitad del cotizador de un respaldo completo, esperando a que el cotizador la tome. La
     plataforma tiene prohibido escribir las claves del cotizador (§4.1); esto es una clave
     SUYA que el cotizador lee, ofrece con un botón y borra al restaurar. */
  RESTAURAR: "al3d_pf_restaurar",
  /* «Ya probé que la key del asistente sirve»: la escribe js/nucleo/asistente.js para no
     volver a gastar una petición en comprobarla. Estaba escrita como literal allá; la lista
     de claves de la plataforma es ésta y no hay otra. */
  IA_OK: "al3d_pf_ia_ok",
  /* EL PASE. Lo que la hoja contestó la última vez que se preguntó quién es el que entró:
     {correo, rol, hasta}. Ver js/nucleo/puerta.js — el porqué de que exista está entero
     allá, y se resume en que el aparato tiene que abrir en una azotea sin señal. */
  PASE: "al3d_pf_pase",
  /* El día (AAAA-MM-DD, del aparato) en que alguien entró por última vez con el botón de
     Google. La sesión vale ese día y nada más: al día siguiente la puerta se vuelve a poner.
     Ver CIERRE_DIARIO en js/nucleo/puerta.js. */
  ENTRADA: "al3d_pf_entrada",
  /* La bolsa barajada de fondos que le faltan por salir a la puerta, y el último que salió.
     Adorno puro. */
  FONDO: "al3d_pf_fondo"
};
var CRUDAS = /* @__PURE__ */ new Set([
  CLAVES.DISP,
  CLAVES.LETRA_FOLIO,
  CLAVES.ROL,
  CLAVES.NOMBRE,
  CLAVES.TILES,
  CLAVES.ULT_EXPORT,
  CLAVES.EMPRESA,
  CLAVES.RESTAURAR
]);

// js/datos/catalogo-precios.js
var MATERIALES = [
  { key: "al-paint", label: "Aluminio Blanco/Negro/Pintado", precio: 30, ilum: "LED posterior (cálida/fría)" },
  { key: "al-brush", label: "Aluminio Brush Cepillado", precio: 35, ilum: "LED posterior (cálida/fría)" },
  { key: "acr-vol", label: "Acrílico + Aluminio (Volumen)", precio: 40, ilum: "LED fría frontal" },
  { key: "acr-vinil", label: "Acrílico + Vinil", precio: 45, ilum: "LED fría frontal" },
  { key: "acero", label: "Acero Inoxidable", precio: 55, ilum: "LED posterior (cálida/fría)" }
];
var COMPLEJIDAD = [
  { key: "recta", label: "Recta", extra: 0 },
  { key: "cursiva", label: "Cursiva", extra: 5 },
  { key: "compleja", label: "Compleja", extra: 10 }
];
var CAJAS = [
  { key: "std", label: "Estándar", tarifa: 3900, desc: "Cuadrada / rectangular / circular" },
  { key: "nube", label: "Tipo nube / silueta", tarifa: 4600, desc: "Silueta de logotipo o personaje" }
];
var RECORTES = [
  { key: "sencillo", label: "Sencillo", precio: 20 },
  { key: "vinil", label: "Rotulación de vinil", precio: 25 },
  { key: "sandwich", label: "Tipo sándwich c/iluminación", precio: 55 }
];
var RECORTE_COMP_EXTRA = 5;
var BASTIDORES = [
  { key: "lamina", label: "Lámina", tarifa: 950 },
  { key: "alucobond", label: "Alucobond", tarifa: 1500 }
];
var CAJAS_FABRICA = CAJAS.map((c) => ({ key: c.key, tarifa: c.tarifa }));
function aplicarGuardadas() {
  let t = null;
  try {
    t = JSON.parse(localStorage.getItem("al3d_tarifas") || "null");
  } catch (_) {
    return;
  }
  if (!t || !Array.isArray(t.filas)) return;
  const fab = { material: MATERIALES, complejidad: COMPLEJIDAD, recorte: RECORTES, bastidor: BASTIDORES, caja: CAJAS };
  const L = { material: [], complejidad: [], recorte: [], bastidor: [], caja: [] };
  let extra = RECORTE_COMP_EXTRA;
  for (const f of t.filas) {
    if (!f || typeof f !== "object" || !isFinite(Number(f.precio))) return;
    if (f.grupo === "recorte-extra") {
      if (f.clave === "sandwich") extra = Number(f.precio);
      continue;
    }
    const lista = fab[f.grupo];
    if (!lista) continue;
    const base = lista.find((e2) => e2.key === f.clave) || lista.find((e2) => e2.key === f.como);
    if (!base || L[f.grupo].some((e2) => e2.key === f.clave)) continue;
    const nom = String(f.nombre || "").replace(/[<>&"`]/g, "").trim().slice(0, 60);
    const e = Object.assign({}, base, { key: String(f.clave), label: nom || base.label });
    if (e.key !== base.key) e.como = base.key;
    if (f.visible === false) e.oculto = true;
    const p = Number(f.precio);
    if (f.grupo === "complejidad") e.extra = p;
    else if (f.grupo === "material" || f.grupo === "recorte") e.precio = p;
    else e.tarifa = p;
    L[f.grupo].push(e);
  }
  for (const g in fab) if (!fab[g].every((b) => L[g].some((e) => e.key === b.key))) return;
  for (const g in fab) fab[g].splice(0, fab[g].length, ...L[g]);
  RECORTE_COMP_EXTRA = extra;
}
if (typeof localStorage !== "undefined") aplicarGuardadas();

// js/datos/geo.js
var MX = { latMin: 14, latMax: 33, lngMin: -118, lngMax: -86 };
var enMexico = (la, ln) => la >= MX.latMin && la <= MX.latMax && ln >= MX.lngMin && ln <= MX.lngMax;
var enRango = (la, ln) => Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);
var AVISO_CORTO = "Ese es un link corto y el navegador no puede abrirlo. Ábrelo, espera el mapa y copia el link de la barra de direcciones.";
function esAcortado(u) {
  return /^(?:https?:\/\/)?(?:maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i.test(String(u || "").trim());
}
var N = String.raw`-?\d{1,3}(?:\.\d+)?`;
var D = String.raw`-?\d{1,3}\.\d+`;
var REGLAS = [
  { re: new RegExp(`^\\+?(${D})\\s*,\\s*\\+?(${D})$`), orden: "latlng", fuente: "coordenadas", exacta: true },
  { re: new RegExp(`^geo:\\+?(${N})\\s*,\\s*\\+?(${N})`, "i"), orden: "latlng", fuente: "geo_uri", exacta: true },
  { re: new RegExp(`!3d(${N})!4d(${N})`), orden: "latlng", fuente: "maps_pin", exacta: true },
  { re: new RegExp(`[?&](?:q|query|center|ll|destination|origin|daddr|saddr)=(?:loc:)?[+\\s]*(${N})\\s*,\\s*\\+?(${N})`, "i"), orden: "latlng", fuente: "maps_query", exacta: true },
  { re: new RegExp(`/maps/search/(${N})\\s*,\\s*\\+?(${N})`), orden: "latlng", fuente: "maps_search", exacta: true },
  { re: new RegExp(`/maps/place/(${N})\\s*,\\s*\\+?(${N})`), orden: "latlng", fuente: "maps_place", exacta: true },
  { re: new RegExp(`@(${N}),(${N})(?:,(?:\\d+(?:\\.\\d+)?)[zmayht])?`), orden: "latlng", fuente: "maps_camara", exacta: false },
  { re: new RegExp(`!2d(${N})!3d(${N})`), orden: "lnglat", fuente: "maps_dir", exacta: false },
  { re: new RegExp(`!1d(${N})!2d(${N})`), orden: "lnglat", fuente: "maps_dir", exacta: false }
];
function parseGmaps(url) {
  const crudo = String(url == null ? "" : url).trim();
  if (!crudo) return null;
  if (esAcortado(crudo)) return { corto: true, mensaje: AVISO_CORTO };
  const textos = [];
  try {
    textos.push(decodeURIComponent(crudo));
  } catch (_) {
  }
  textos.push(crudo);
  for (const { re, orden, fuente, exacta } of REGLAS) {
    for (const texto2 of textos) {
      const m = texto2.match(re);
      if (!m) continue;
      let la = parseFloat(m[1]), ln = parseFloat(m[2]);
      if (orden === "lnglat") {
        const t = la;
        la = ln;
        ln = t;
      }
      let invertida = false;
      if (!enRango(la, ln)) {
        if (!enRango(ln, la)) continue;
        const t = la;
        la = ln;
        ln = t;
        invertida = true;
      }
      const r = { lat: la, lng: ln, fuente, exacta };
      if (invertida) r.invertida = true;
      if (!enMexico(la, ln)) r.sospechoso = true;
      return r;
    }
  }
  return null;
}
var TTL_GEO = 90 * 24 * 3600 * 1e3;
var cadena = Promise.resolve();

// js/datos/entrega.js
var ENTREGAS = ["instalacion", "paqueteria", "recoleccion"];
var ENTREGA_NOMBRE = {
  instalacion: "Instalación",
  paqueteria: "Paquetería",
  recoleccion: "Recolección en taller"
};
function entregaDesdeHoja(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!s) return "";
  if (/^paquet/.test(s)) return "paqueteria";
  if (/^recole/.test(s)) return "recoleccion";
  if (/^instala/.test(s)) return "instalacion";
  return "";
}

// js/nucleo/ui.js
var _CAPAS = [];
var _piezas = typeof window !== "undefined" ? window.Piezas : null;
if (_piezas && _piezas.hojasDeslizables) {
  _piezas.hojasDeslizables({
    hoja: ".pf-modal-bg.show>.pf-panel",
    cabeza: ".pf-panel-h",
    cuerpo: ".pf-panel-b",
    excluir: 'input,textarea,select,[contenteditable="true"],canvas,.leaflet-container',
    cierre: (velo) => {
      const c = _CAPAS.find((x) => x.id === velo.id);
      return c ? c.cerrar : null;
    }
  });
}
if (_piezas && _piezas.desenfoqueProgresivo) _piezas.desenfoqueProgresivo(["#pf-abajo", "#pf-mbar"], { lado: "abajo" });

// js/datos/proyectos.js
var ETAPAS = [
  "ganado",
  "en_diseno",
  "cortado",
  "armado",
  "listo",
  "instalado",
  "garantia",
  "cancelado"
];
var VIVAS = ETAPAS.filter((e) => e !== "cancelado");
var TEL_MAX = 30;
function telefonoLimpio(v) {
  const s = String(v == null ? "" : v).replace(/[^\d +()\-]/g, " ").replace(/\s+/g, " ").trim();
  if (!/\d/.test(s)) return "";
  return s.slice(0, TEL_MAX).trim();
}
function ubicacionDeHoja(celda) {
  const t = String(celda == null ? "" : celda).trim();
  const r = t ? parseGmaps(t) : null;
  if (r && !r.corto) {
    return {
      maps_url: /^https?:/i.test(t) ? t : "",
      lat: r.lat,
      lng: r.lng,
      geo_fuente: r.exacta ? "maps_pin" : "maps_camara"
    };
  }
  return { maps_url: r && r.corto ? t : "", lat: null, lng: null, geo_fuente: "sin_ubicar" };
}
var MS_REINTENTO_LINK = 10 * 60 * 1e3;
var _salidas = Promise.resolve();

// js/datos/taller.js
var PLAZOS = [
  { k: 1, semanas: 1, dias: 7, etiqueta: "1 semana", corto: "1" },
  { k: 2, semanas: 1.5, dias: 11, etiqueta: "1.5 semanas", corto: "1½" },
  { k: 3, semanas: 2, dias: 14, etiqueta: "2 semanas", corto: "2" },
  { k: 4, semanas: 2.5, dias: 18, etiqueta: "2.5 semanas", corto: "2½" },
  { k: 5, semanas: 3, dias: 21, etiqueta: "3 semanas o más", corto: "3+" }
];
var ORDEN = ETAPAS.reduce((m, e, i) => {
  m[e] = i;
  return m;
}, {});

// js/nucleo/ingreso.js
var K_TOK = "al3d_pf_gtok";
var _tok = leerTok();
function leerTok() {
  try {
    const t = JSON.parse(localStorage.getItem(K_TOK) || "null");
    return t && typeof t.token === "string" && Number(t.expira) > Date.now() ? t : null;
  } catch (_) {
    return null;
  }
}

// js/datos/puente.js
var P = {
  proyecto: "Proyecto",
  subtotal: "Precio Subtotal",
  iva: "IVA",
  neto: "Precio Neto ",
  // fórmula
  anticipo: "Anticipo",
  liquidacion: "Liquidacion",
  abonoCom: "Abono Comision",
  pendiente: "Pago Pendiente",
  // fórmula
  comisiones: "Comisiones",
  // fórmula
  comRestante: "Comision Restante",
  // fórmula
  /* «Fecha Comision» ya no está aquí: en la hoja no existe —la fecha de cada abono vive en la
     pestaña de abonos— y la prueba que la buscaba en el Apps Script pasaba porque el nombre
     aparece… en la lista de lo que ya no existe. */
  estatus: "Estatus",
  cuenta: "Cuenta ",
  // con espacio final
  fecha: "Fecha Anticipo e Instalacion",
  fechaLiq: "Fecha Liquidacion",
  /* Las siete que la plataforma necesita y que se crean A MANO en Notion. */
  folio: "Folio cotizacion",
  etapa: "Etapa de obra",
  fechaInst: "Fecha instalacion",
  horaInst: "Hora instalacion",
  ubicacion: "Ubicacion",
  direccion: "Direccion",
  tipo: "Tipo de trabajo",
  /* El % pactado con quien trajo el trabajo, en puntos (10 = 10 %). Columna AD de la hoja
     desde puente-sheets-4; antes la hoja cobraba 10 % fijo y el teléfono enseñaba otro. */
  pctCom: "Porcentaje comision",
  /* El teléfono del cliente, columna AE desde puente-sheets-11. Lo leen y lo escriben los tres
     roles: fabricación llama para instalar y pagos cobra por WhatsApp. */
  tel: "Telefono",
  /* Cómo sale el trabajo del taller, columna AF desde puente-sheets-12: «Instalación»,
     «Paquetería» o «Recolección en taller» (ENTREGA_A_HOJA). La leen los tres roles y la
     escriben dirección y fabricación. */
  entrega: "Entrega",
  /* Las notas del proyecto y el plazo de taller, columnas AG y AH desde puente-sheets-14. Las
     notas las leen y escriben los tres roles; el plazo, dirección y fabricación. */
  notas: "Notas",
  plazo: "Plazo taller",
  /* Cuándo se cambió cada dato de la obra, columna AI (oculta) desde puente-sheets-14. No se
     escribe: la hoja la pone al día con los sellos que viajan aparte (`sellos` de la operación). */
  sellos: "Sellos"
};
var PLAZO_A_HOJA = PLAZOS.map((x) => x.etiqueta);
function plazoDesdeHoja(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase().replace("½", ".5").replace(",", ".");
  const m = /^(\d+(?:\.\d+)?)/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (n >= 3) return 5;
  const i = [1, 1.5, 2, 2.5].indexOf(n);
  return i >= 0 ? i + 1 : null;
}
var ENTREGA_A_HOJA = Object.fromEntries(ENTREGAS.map((k) => [k, ENTREGA_NOMBRE[k]]));
var ETAPA_A_NOTION = {
  ganado: "Ganado",
  en_diseno: "En diseño",
  cortado: "Cortado",
  armado: "Armado",
  listo: "Listo para instalar",
  instalado: "Instalado",
  garantia: "En garantía",
  cancelado: "No se dio"
};
var ETAPA_DESDE_NOTION = Object.fromEntries(
  Object.entries(ETAPA_A_NOTION).map(([k, v]) => [v, k])
);
var COLUMNA_DEL_SELLO = {
  etapa: P.etapa,
  notas: P.notas,
  plazo_k: P.plazo,
  tel: P.tel,
  dir_texto: P.direccion,
  ubicacion: P.ubicacion,
  entrega: P.entrega,
  instalacion: P.fechaInst
};
var GRUPO_DE_COLUMNA = Object.fromEntries(Object.entries(COLUMNA_DEL_SELLO).map(([g, c]) => [c, g]));

// supabase/functions/_shared/sello.js
var FORMATO_V1 = "AL3D-AUTH-v1";
var FORMATO_V2 = "AL3D-AUTH-v2";
var CAMPOS_PRECIO = Object.freeze([
  "tipo",
  "material",
  "comp",
  "luz",
  "altura",
  "n",
  "acab",
  "recComp",
  "bas",
  "ancho",
  "alto",
  "tarifa",
  "pz",
  "pu"
]);
var CODIFICACIONES = Object.freeze(["ascii-?", "utf-8"]);
var CODIFICACION_DE_SELLOS_NUEVOS = "ascii-?";
var COLUMNAS_DE_AUTORIZACION = Object.freeze([
  "folio_global",
  "ts_iso",
  "proyecto",
  "sub_calc",
  "precio_auth",
  "total",
  "items_auth",
  "huella",
  "autorizo",
  "renglones",
  "codigo",
  "firma",
  "estado"
]);
var COLUMNAS_DE_TEXTO = ["folio_global", "ts_iso", "proyecto", "items_auth", "huella", "autorizo", "renglones"];
var ErrorDeSello = class extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorDeSello";
    this.codigo = codigo;
  }
};
function dinero2(n) {
  return (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
}
function canonDe(r) {
  const campos = [
    String(r.folio),
    String(r.huella),
    dinero2(r.subCalc),
    dinero2(r.precioAuth),
    String(r.itemsAuth),
    dinero2(r.total),
    String(r.proyecto),
    String(r.correo),
    String(r.ts)
  ];
  if (r.renglones) return FORMATO_V2 + JSON.stringify(campos.concat([String(r.renglones)]));
  return FORMATO_V1 + JSON.stringify(campos);
}
function formatoDe(r) {
  return r.renglones ? FORMATO_V2 : FORMATO_V1;
}
var esAscii = (t) => /^[\x00-\x7f]*$/.test(t);
function aBytes(texto2, codificacion = CODIFICACION_DE_SELLOS_NUEVOS) {
  const t = String(texto2);
  if (codificacion === "utf-8") return new TextEncoder().encode(t);
  if (codificacion === "ascii-?") {
    const bytes = [];
    for (const c of t) {
      const p = c.codePointAt(0);
      bytes.push(p < 128 ? p : 63);
    }
    return Uint8Array.from(bytes);
  }
  throw new ErrorDeSello("CODIFICACION_DESCONOCIDA", "No conozco la codificación «" + codificacion + "». Las que hay: " + CODIFICACIONES.join(", ") + ".");
}
function aHex(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = (bytes[i] + 256) % 256;
    s += (b < 16 ? "0" : "") + b.toString(16);
  }
  return s;
}
function claveUsable(clave) {
  if (typeof clave !== "string") return false;
  const t = clave.trim();
  return t !== "" && t !== "undefined" && t !== "null";
}
function exigirClave(clave) {
  if (!claveUsable(clave)) {
    throw new ErrorDeSello(
      "CLAVE_AUSENTE",
      "Falta la clave del sello (SELLO_AUTORIZACION). Sin ella no se firma ni se verifica, y nunca se inventa una."
    );
  }
}
async function hmacHex(texto2, clave, codificacion = CODIFICACION_DE_SELLOS_NUEVOS) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new ErrorDeSello("SIN_WEBCRYPTO", "Este entorno no tiene WebCrypto (crypto.subtle).");
  const llave = await subtle.importKey("raw", aBytes(clave, codificacion), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return aHex(new Uint8Array(await subtle.sign("HMAC", llave, aBytes(texto2, codificacion))));
}
function codigoDe(firma) {
  const c = String(firma).slice(0, 12).toUpperCase();
  return c.slice(0, 4) + "-" + c.slice(4, 8) + "-" + c.slice(8, 12);
}
function normalizarCodigo(c) {
  return String(c || "").toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 12);
}
function iguales(a, b) {
  const x = String(a), y = String(b);
  let d = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0;
}
var comoTexto = (x) => x == null ? "" : String(x);
var tipoDe = (x) => x === null ? "null" : Array.isArray(x) ? "arreglo" : typeof x;
function exigirColumnas(fila) {
  if (!fila || typeof fila !== "object") throw new ErrorDeSello("FILA_INVALIDA", "La fila de autorización no es un objeto.");
  for (const c of COLUMNAS_DE_AUTORIZACION) {
    if (fila[c] === void 0) throw new ErrorDeSello("COLUMNA_AUSENTE", "A la fila de autorización le falta la columna «" + c + "».");
  }
}
function registroDeFila(fila) {
  exigirColumnas(fila);
  for (const c of COLUMNAS_DE_TEXTO) {
    if (fila[c] !== null && typeof fila[c] !== "string") {
      throw new ErrorDeSello("TIPO_INVALIDO", "«" + c + "» tiene que ser texto tal como se firmó (text), y vino " + tipoDe(fila[c]) + ".");
    }
  }
  const numero2 = (c) => {
    const v = fila[c];
    if (v === null) return 0;
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n)) throw new ErrorDeSello("TIPO_INVALIDO", "«" + c + "» tiene que ser un número, y vino " + tipoDe(v) + ".");
    return n;
  };
  return {
    folio: comoTexto(fila.folio_global),
    huella: comoTexto(fila.huella),
    subCalc: numero2("sub_calc"),
    precioAuth: numero2("precio_auth"),
    itemsAuth: comoTexto(fila.items_auth),
    total: numero2("total"),
    proyecto: comoTexto(fila.proyecto),
    correo: comoTexto(fila.autorizo),
    ts: comoTexto(fila.ts_iso),
    renglones: comoTexto(fila.renglones)
  };
}
function codificacionDeFila(fila) {
  const c = fila.codificacion;
  if (c === void 0 || c === null || c === "") return null;
  if (typeof c !== "string" || !CODIFICACIONES.includes(c)) {
    throw new ErrorDeSello("TIPO_INVALIDO", "«codificacion» tiene que ser " + CODIFICACIONES.map((x) => "«" + x + "»").join(" o ") + " (o venir vacía), y vino " + (typeof c === "string" ? "otro texto" : tipoDe(c)) + ".");
  }
  return c;
}
async function verificar(fila, clave, opciones) {
  exigirClave(clave);
  const r = registroDeFila(fila);
  const canon = canonDe(r);
  const guardada = comoTexto(fila.firma);
  const codigoGuardado = normalizarCodigo(fila.codigo);
  const propia = codificacionDeFila(fila);
  const lista = propia ? [propia] : opciones && opciones.codificaciones || CODIFICACIONES;
  const indistinta = !propia && esAscii(canon) && esAscii(clave);
  let firmaCoincide = false;
  for (const cod of lista) {
    const f = await hmacHex(canon, clave, cod);
    const dFirma = iguales(f, guardada);
    const dCodigo = iguales(normalizarCodigo(codigoDe(f)), codigoGuardado);
    firmaCoincide = firmaCoincide || dFirma;
    if (dFirma && dCodigo) {
      return { valida: true, motivo: "ok", formato: formatoDe(r), codificacion: indistinta ? "ascii" : cod };
    }
    if (indistinta) break;
  }
  return { valida: false, motivo: firmaCoincide ? "codigo_no_coincide" : "firma_no_coincide", formato: formatoDe(r), codificacion: null };
}

// scripts/importador/plan.mjs
var EMPRESA = "al3d";
var MOTIVOS_AUTORIZACION = Object.freeze([
  "firma_no_coincide",
  "codigo_no_coincide",
  "no_se_pudo_comprobar",
  "sin_veredicto",
  "veredicto_invalido",
  "texto_distinto",
  "fila_mal_formada",
  "dos_vigentes",
  "sin_comprobacion",
  "sin_clave_en_la_hoja",
  "sin_codigo_gs"
]);
function leerVeredictos(x) {
  const no = (motivo, por) => ({ ok: false, motivo, por });
  if (!objeto(x) || x.version !== 1) {
    return no("sin_comprobacion", "la hoja no mandó su comprobación de firmas (puente/copia-diaria.gs de antes del 2026-10-17): se pegan los archivos nuevos y entran solas");
  }
  if (x.sin === "clave") return no("sin_clave_en_la_hoja", "la hoja no tiene la clave del sello en sus propiedades (SELLO_AUTORIZACION): no pudo comprobar ninguna");
  if (x.sin === "codigo") return no("sin_codigo_gs", "la hoja no encontró las funciones del sello de Código.gs: no comprobó ninguna");
  if (!Array.isArray(x.filas)) return no("sin_comprobacion", "la comprobación de firmas de la hoja no trae sus filas");
  const porFila = /* @__PURE__ */ new Map();
  const repetidas = /* @__PURE__ */ new Set();
  for (const v of x.filas) {
    if (!objeto(v) || !Number.isInteger(v.fila) || v.fila < 2) continue;
    if (porFila.has(v.fila)) repetidas.add(v.fila);
    porFila.set(v.fila, v);
  }
  for (const f of repetidas) porFila.delete(f);
  return { ok: true, porFila };
}
var ESTATUS = ["FABRICACION", "REPARANDO", "COBRANDO", "LIQUIDADO"];
var CUENTAS = ["Elias BBVA", "Constru BNT", "Moni MPago", "Rul HSBC", "Tatis BNT"];
var TIPOS = [
  "Caja de luz con iluminacion",
  "Caja de luz sin iluminacion",
  "Letras 3D con iluminacion",
  "Letras 3D sin iluminacion",
  "Rotulacion de vinil",
  "Recorte acrilico",
  "Custome / Proyecto Especial"
];
var ETAPAS2 = ["ganado", "en_diseno", "cortado", "armado", "listo", "instalado", "garantia", "cancelado"];
var AREAS = ["direccion", "fabricacion", "pagos"];
var UNIDADES_COMPRA = ["unidad", "bolsa", "caja", "lamina", "litro", "metro"];
var FABRICA_TARIFAS = Object.freeze({
  material: ["al-paint", "al-brush", "acr-vol", "acr-vinil", "acero"],
  complejidad: ["recta", "cursiva", "compleja"],
  recorte: ["sencillo", "vinil", "sandwich"],
  "recorte-extra": ["sandwich"],
  bastidor: ["lamina", "alucobond"],
  caja: ["std", "nube"]
});
var CATEGORIAS_GASTO = Object.freeze([
  "Material",
  "Mano de obra",
  "Renta y servicios",
  "Herramienta",
  "Transporte y gasolina",
  "Publicidad",
  "Comisiones y nómina",
  "Otros"
]);
var MOTIVOS_GASTO = Object.freeze(["sin_id", "id_no_sirve", "id_repetido", "fecha_no_se_entiende", "sin_concepto", "monto_no_sirve"]);
var NORM_CONSUMO = {
  "m²": "m2",
  "m2": "m2",
  "m² limpiados": "m2",
  "m de cordón": "m",
  "m de cordon": "m",
  "m": "m",
  "cm": "cm",
  "pieza": "pieza",
  "piezas": "pieza",
  "litro": "litro"
};
var TIPOS_MOV = ["entrada", "salida", "ajuste", "conteo", "merma", "devolucion"];
var ORIGENES_MOV = ["derivado", "manual", "conteo", "compra"];
var ESTADOS_REQ = ["calculado", "apartado", "comprado", "consumido", "descartado"];
var ESTADOS_INST = ["propuesta", "confirmada", "reagendada", "hecha", "cancelada"];
var RE_FOLIO_HOJA = /^V-\d{3,7}$/;
var RE_FOLIO_GLOBAL = /^[A-Za-z0-9-]{1,24}@[A-Za-z0-9_-]{1,24}$/;
var RE_ID = /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,119}$/;
var RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
var RE_TS_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
var RE_DISP = /^[A-Za-z0-9_-]{1,24}$/;
var GRUPO_DE_ENCABEZADO = {
  "Etapa de obra": "etapa",
  "Notas": "notas",
  "Plazo taller": "plazo_k",
  "Telefono": "tel",
  "Direccion": "dir_texto",
  "Ubicacion": "ubicacion",
  "Entrega": "entrega",
  "Fecha instalacion": "instalacion",
  "Hora instalacion": "instalacion"
};
var GRUPOS_OBRA = {
  etapa: ["etapa"],
  notas: ["notas"],
  plazo_k: ["plazo_k"],
  tel: ["tel"],
  dir_texto: ["dir_texto"],
  ubicacion: ["maps_url", "lat", "lng", "geo_fuente"],
  entrega: ["entrega"]
};
var V = Object.fromEntries([
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "R",
  "S",
  "T",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "AA",
  "AB",
  "AC",
  "AD",
  "AE",
  "AF",
  "AG",
  "AH",
  "AI"
].map((l) => [l, col(l)]));
var sha = (s, n = 12) => createHash("sha256").update(String(s)).digest("hex").slice(0, n);
var md5 = (s) => createHash("md5").update(String(s)).digest("hex");
var ms = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};
var objeto = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : null;
var igualJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var numFolio = (f) => {
  const m = /^V-(\d+)$/.exec(String(f || "").trim().toUpperCase());
  return m ? Number(m[1]) : 0;
};
function nuevoReporte() {
  const r = { rechazos: [], conflictos: [], avisos: [], fuera: [], no_importado: [], resumen: {} };
  r.rechazar = (donde, fila, que, por) => r.rechazos.push({ donde, fila, que, por });
  r.conflicto = (tema, que, detalle) => r.conflictos.push({ tema, que, detalle });
  r.avisar = (donde, fila, que, por) => r.avisos.push({ donde, fila, que, por });
  return r;
}
function leerTelefono(t, i) {
  const r = objeto(t && t.respaldo) || {};
  const plat = r.app === "al3d-completo" ? objeto(r.plataforma) || {} : r;
  const datos = objeto(plat.datos) || {};
  const cot = r.app === "al3d-completo" ? objeto(objeto(r.cotizador) && r.cotizador.datos) || {} : {};
  const json2 = (s, def) => {
    try {
      const v = JSON.parse(s);
      return v ?? def;
    } catch (_) {
      return def;
    }
  };
  const lista = (a) => Array.isArray(a) ? a.filter((x) => x && typeof x === "object") : [];
  const historial = lista(typeof cot.al3d_historial === "string" ? json2(cot.al3d_historial, []) : cot.al3d_historial);
  const tel = {
    etiqueta: String(t && t.etiqueta || "telefono-" + (i + 1)),
    proyectos: lista(datos.proyectos),
    instalaciones: lista(datos.instalaciones),
    materiales: lista(datos.materiales),
    movimientos: lista(datos.movimientos),
    requerimientos: lista(datos.requerimientos),
    constantes: lista(datos.constantes),
    historial,
    hitos: objeto(typeof cot.al3d_hitos === "string" ? json2(cot.al3d_hitos, {}) : cot.al3d_hitos) || {},
    folio: Number(String(cot.al3d_folio ?? "").replace(/\D/g, "")) || 0
  };
  const votos = /* @__PURE__ */ new Map();
  const votar = (d) => {
    if (RE_DISP.test(d || "") && d !== "hoja") votos.set(d, (votos.get(d) || 0) + 1);
  };
  for (const e of historial) votar(e.disp || String(e.sello && e.sello.folio || "").split("@")[1]);
  if (!votos.size) for (const p of tel.proyectos) votar(p.dispositivo);
  const elegido = [...votos.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  tel.disp = RE_DISP.test(t && t.disp || "") ? t.disp : elegido ? elegido[0] : "";
  tel.disp_inferido = !(t && t.disp);
  return tel;
}
async function planear(entrada) {
  const empresa2 = entrada.empresa || EMPRESA;
  const vol = objeto(entrada.volcado);
  if (!vol || vol.formato !== "al3d-volcado") throw new Error("El volcado no es de volcarParaImportar (falta formato «al3d-volcado»).");
  const P2 = objeto(vol.pestanas) || {};
  const rep = nuevoReporte();
  const tels = (entrada.telefonos || []).map(leerTelefono);
  const T = {
    proyectos: [],
    ventas_dinero: [],
    abonos: [],
    miembros: [],
    instalaciones: [],
    materiales: [],
    almacen_costos: [],
    requerimientos: [],
    almacen_movimientos: [],
    constantes: [],
    cotizaciones: [],
    autorizaciones: [],
    tarifas: [],
    gastos: []
  };
  const esperado = [];
  const remapeo = {};
  const ref = (donde, fila) => `${donde}!${fila}`;
  const ventas = [];
  const vistos = /* @__PURE__ */ new Map();
  for (const { fila, celdas } of filas(P2["Ventas"])) {
    const c = (l) => celdas[V[l]];
    const nombre = texto(c("B")).trim();
    if (!nombre) continue;
    const folio = texto(c("A")).trim().toUpperCase();
    if (!RE_FOLIO_HOJA.test(folio)) {
      rep.rechazar("Ventas", fila, "A «Folio»", `«${texto(c("A"))}» no es un folio V-###`);
      continue;
    }
    const g = numero(c("G")), i = numero(c("I")), j = numero(c("J"));
    const malos = [];
    if (!g.ok) malos.push("G «Precio Subtotal» trae texto");
    if (!i.ok || i.n < 0) malos.push("I «Anticipo» " + (i.ok ? "es negativo" : "trae texto"));
    if (!j.ok || j.n < 0) malos.push("J «Liquidacion» " + (j.ok ? "es negativo" : "trae texto"));
    if (g.ok && Math.abs(g.n) >= 1e9) malos.push("G «Precio Subtotal» pasa del tope de la base");
    if (i.ok && i.n >= 1e9 || j.ok && j.n >= 1e9) malos.push("I o J pasan del tope de la base");
    if (malos.length) {
      rep.rechazar("Ventas", fila, folio, malos.join("; ") + ": la fila espera a que se arregle la hoja");
      continue;
    }
    const v = { fila, folio, nombre, celdas, g: g.n, i: i.n, j: j.n, celdasRaras: {} };
    if (vistos.has(folio)) vistos.get(folio).push(v);
    else vistos.set(folio, [v]);
    ventas.push(v);
  }
  for (const [folio, lista] of vistos) {
    if (lista.length > 1) {
      rep.conflicto("folio repetido en Ventas", folio, "filas " + lista.map((x) => x.fila).join(", ") + ": no se importa ninguna hasta que la hoja diga cuál es");
      for (const x of lista) x.descartada = true;
    }
  }
  const copias = [];
  for (const tel of tels) for (const p of tel.proyectos) if (p.id) copias.push({ tel, p });
  const porGlobal = /* @__PURE__ */ new Map(), porHoja = /* @__PURE__ */ new Map();
  for (const x of copias) {
    const fg = String(x.p.folio_global || "").trim(), fh = String(x.p.folio_hoja || "").trim().toUpperCase();
    if (RE_FOLIO_GLOBAL.test(fg)) (porGlobal.get(fg) || porGlobal.set(fg, []).get(fg)).push(x);
    if (RE_FOLIO_HOJA.test(fh)) (porHoja.get(fh) || porHoja.set(fh, []).get(fh)).push(x);
    for (const marca of ["hoja_perdida", "duplicado_de", "hoja_doble", "fuera_de_hoja"]) {
      if (x.p[marca]) rep.fuera.push({ telefono: x.tel.etiqueta, id: x.p.id, marca, valor: x.p[marca], nombre: x.p.nombre || "" });
    }
  }
  const usadas = /* @__PURE__ */ new Set();
  const canonico = (grupo, fg, folio) => {
    const propias = grupo.filter((x) => !x.p.de_hoja && !String(x.p.id).startsWith("proy-hoja-"));
    const disp = fg ? fg.split("@")[1] : "";
    const delEmisor = propias.filter((x) => x.p.dispositivo === disp).sort((a, b) => ms(a.p.creado_en) - ms(b.p.creado_en) || (a.p.id < b.p.id ? -1 : 1))[0];
    if (delEmisor) return delEmisor.p.id;
    const viejo = propias.slice().sort((a, b) => (ms(a.p.creado_en) || Infinity) - (ms(b.p.creado_en) || Infinity) || (a.p.id < b.p.id ? -1 : 1))[0];
    if (viejo) return viejo.p.id;
    return folio ? "proy-hoja-" + folio : grupo[0].p.id;
  };
  const proyectoDeFolio = /* @__PURE__ */ new Map();
  const ygUsados = /* @__PURE__ */ new Map();
  const idsDeFilas = /* @__PURE__ */ new Set();
  for (const v of ventas) {
    if (v.descartada) continue;
    const c = (l) => v.celdas[V[l]];
    const { folio, fila } = v;
    const procedencia = { fila_hoja: fila, celdas: {} };
    const raro = (l, valor) => {
      procedencia.celdas[l] = valor;
    };
    const yTxt = texto(c("Y")).trim();
    let y = RE_FOLIO_GLOBAL.test(yTxt) && yTxt.toUpperCase() !== folio ? yTxt : null;
    if (yTxt && !y) raro("Y", yTxt);
    if (y && ygUsados.has(y)) {
      rep.conflicto("folio de cotización en dos filas", y, `filas ${ygUsados.get(y)} y ${fila}: la segunda entra sin folio de cotización`);
      raro("Y", yTxt);
      y = null;
    }
    const grupoTodo = [.../* @__PURE__ */ new Set([...y ? porGlobal.get(y) || [] : [], ...porHoja.get(folio) || []])];
    const grupo = grupoTodo.filter((x) => !usadas.has(x));
    if (grupo.length < grupoTodo.length) {
      rep.conflicto("copia de teléfono que apunta a dos filas", folio, grupoTodo.filter((x) => usadas.has(x)).map((x) => `${x.tel.etiqueta}:${x.p.id}`).join(", ") + " ya se unió a otra fila: esta entra sin ella");
    }
    const globalesDelGrupo = [...new Set(grupo.map((x) => String(x.p.folio_global || "").trim()).filter((f) => RE_FOLIO_GLOBAL.test(f)))];
    if (globalesDelGrupo.length > 1) {
      rep.conflicto("copias con folios de cotización distintos", folio, globalesDelGrupo.join(" vs ") + ": se importa la fila de la hoja sin unirla a ningún teléfono");
    }
    let unibles = globalesDelGrupo.length > 1 ? [] : grupo;
    let conCotizacion = unibles.some((x) => !x.p.de_hoja && RE_FOLIO_GLOBAL.test(String(x.p.folio_global || "")));
    if (!y && conCotizacion) {
      y = globalesDelGrupo[0];
      if (ygUsados.has(y)) {
        rep.conflicto("folio de cotización en dos filas", y, `filas ${ygUsados.get(y)} y ${fila}: la segunda entra sin unirse al teléfono`);
        y = null;
        unibles = [];
        conCotizacion = false;
      } else if (yTxt) rep.avisar("Ventas", fila, folio, `Y «${yTxt}» no es el folio de la cotización del teléfono (${y}): se usa el del teléfono`);
    }
    if (unibles.length && idsDeFilas.has(canonico(unibles, conCotizacion ? y : null, folio))) {
      rep.conflicto("dos filas para el mismo proyecto de teléfono", folio, `${canonico(unibles, conCotizacion ? y : null, folio)} ya es de otra fila: esta entra sola`);
      unibles = [];
      conCotizacion = false;
    }
    if (y) ygUsados.set(y, fila);
    const estatusTxt = texto(c("C")).trim();
    const estatus = ESTATUS.includes(estatusTxt) ? estatusTxt : null;
    if (estatusTxt && !estatus) raro("C", estatusTxt);
    let fuente = "hoja", historica;
    if (y && conCotizacion) {
      fuente = "cotizacion";
      historica = false;
    } else if (estatus === "FABRICACION" || estatus === "REPARANDO") historica = false;
    else historica = !y;
    const id = unibles.length ? canonico(unibles, fuente === "cotizacion" ? y : null, folio) : "proy-hoja-" + folio;
    if (!RE_ID.test(id)) {
      rep.rechazar("Ventas", fila, folio, `el id «${id}» no es válido para la base`);
      continue;
    }
    for (const x of unibles) {
      usadas.add(x);
      if (x.p.id !== id) remapeo[x.p.id] = id;
    }
    idsDeFilas.add(id);
    const cuentaTxt = texto(c("D")).trim();
    const cuenta2 = CUENTAS.includes(cuentaTxt) ? cuentaTxt : null;
    if (cuentaTxt && !cuenta2) raro("D", cuentaTxt);
    const tiposTxt = texto(c("E")).split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
    const tipo_trabajo = tiposTxt.filter((t) => TIPOS.includes(t));
    if (tiposTxt.length !== tipo_trabajo.length) raro("E", texto(c("E")));
    const ivaTxt = texto(c("F")).trim();
    const iva = ivaTxt.toLowerCase() === "sí";
    if (ivaTxt !== "Sí" && ivaTxt !== "No") rep.avisar("Ventas", fila, folio, `F «IVA» dice «${ivaTxt}» (se lee como ${iva ? "Sí" : "No"})`);
    const fechaDe = (l, nombreCol) => {
      const f = fecha(c(l));
      if (f && typeof f === "object") {
        rep.avisar("Ventas", fila, folio, `${l} «${nombreCol}» tiene texto («${f.texto}»), no una fecha: queda vacía`);
        raro(l, f.texto);
        return null;
      }
      return f;
    };
    const fecha_anticipo = fechaDe("L", "Fecha Anticipo");
    const fechaInst = fechaDe("M", "Fecha instalacion");
    const fecha_liquidacion = fechaDe("N", "Fecha Liquidacion");
    const etapaTxt = texto(c("Z")).trim();
    let etapa = ETAPA_DESDE_NOTION[etapaTxt] || null;
    if (etapaTxt && !etapa) raro("Z", etapaTxt);
    if (!etapa && !historica) etapa = "ganado";
    const ubic = ubicacionDeHoja(texto(c("AB")));
    if (ubic.lat === 0 && ubic.lng === 0) {
      raro("AB", texto(c("AB")));
      Object.assign(ubic, { lat: null, lng: null, geo_fuente: "sin_ubicar" });
    }
    if (texto(c("AB")).trim() && ubic.lat === null && !ubic.maps_url) raro("AB", texto(c("AB")));
    const telCrudo = texto(c("AE"));
    const tel = telefonoLimpio(telCrudo);
    if (telCrudo.trim() && tel !== telCrudo.trim()) rep.avisar("Ventas", fila, folio, `AE «Telefono» «${telCrudo}» se guarda como «${tel}»`);
    const entTxt = texto(c("AF")).trim();
    const entrega = entregaDesdeHoja(entTxt) || null;
    if (entTxt && !entrega) raro("AF", entTxt);
    const pct = numero(c("AD"));
    const pct_comision = pct.ok && !pct.vacia && pct.n >= 0 && pct.n <= 100 ? pct.n : null;
    if (!pct.vacia && pct_comision === null) raro("AD", texto(c("AD")));
    let sellosHoja = {};
    const aiTxt = texto(c("AI")).trim();
    if (aiTxt) {
      let ai = null;
      try {
        ai = JSON.parse(aiTxt);
      } catch (_) {
      }
      if (objeto(ai)) {
        for (const [k, val] of Object.entries(ai)) {
          const gr = GRUPO_DE_ENCABEZADO[k], n = ms(val);
          if (gr && n) sellosHoja[gr] = Math.max(sellosHoja[gr] || 0, n);
        }
      } else raro("AI", aiTxt);
    }
    const hoja = {
      tel,
      etapa,
      notas: texto(c("AG")),
      plazo_k: plazoDesdeHoja(texto(c("AH"))),
      dir_texto: texto(c("AC")),
      maps_url: ubic.maps_url,
      lat: ubic.lat,
      lng: ubic.lng,
      geo_fuente: ubic.geo_fuente,
      entrega
    };
    const proyectoTel = unibles.find((x) => x.p.id === id) || unibles.find((x) => !x.p.de_hoja) || unibles[0] || null;
    const obra = { ...hoja };
    const sellos = { ...sellosHoja };
    if (unibles.length) {
      for (const [grupoObra, campos] of Object.entries(GRUPOS_OBRA)) {
        let gana = { sello: sellosHoja[grupoObra] || 0, de: "hoja", vals: Object.fromEntries(campos.map((k) => [k, hoja[k]])) };
        for (const x of unibles) {
          const s = ms(objeto(x.p.sellos) && x.p.sellos[grupoObra]);
          const vals = Object.fromEntries(campos.map((k) => [k, valorDeTelefono(x.p, k)]));
          if (!igualJSON(vals, gana.vals)) {
            if (s > gana.sello) {
              rep.conflicto("obra distinta entre copias", folio, `${grupoObra}: gana ${x.tel.etiqueta} (sello ${s}) sobre ${gana.de} (sello ${gana.sello})`);
              gana = { sello: s, de: x.tel.etiqueta, vals };
            } else if (s === gana.sello && s > 0) {
              rep.conflicto("obra distinta con el mismo sello", folio, `${grupoObra}: ${x.tel.etiqueta} y ${gana.de} con sello ${s}; se queda ${gana.de}`);
            } else {
              rep.avisar("Ventas", fila, folio, `${grupoObra}: ${x.tel.etiqueta} tiene otro valor pero un sello más viejo; se queda ${gana.de}`);
            }
          }
          if (s > (sellos[grupoObra] || 0)) sellos[grupoObra] = s;
        }
        Object.assign(obra, gana.vals);
      }
      for (const x of unibles) {
        const s = ms(objeto(x.p.sellos) && x.p.sellos.instalacion);
        if (s > (sellos.instalacion || 0)) sellos.instalacion = s;
      }
      for (const x of unibles) {
        const p = x.p, dif = [];
        if (p.sub !== void 0 && p.sub !== null && Number(p.sub) !== v.g) dif.push(`subtotal ${p.sub} vs G ${v.g}`);
        if (p.anti_pactado !== void 0 && p.anti_pactado !== null && Number(p.anti_pactado) !== v.i) dif.push(`anticipo ${p.anti_pactado} vs I ${v.i}`);
        if (p.cuenta && p.cuenta !== cuenta2) dif.push(`cuenta ${p.cuenta} vs D ${cuenta2}`);
        if (p.estatus_notion && p.estatus_notion !== estatus) dif.push(`estatus ${p.estatus_notion} vs C ${estatus}`);
        if (typeof p.iva === "boolean" && p.iva !== iva) dif.push(`IVA ${p.iva ? "Sí" : "No"} vs F ${iva ? "Sí" : "No"}`);
        if (dif.length) rep.avisar("Ventas", fila, folio, `${x.tel.etiqueta} tiene otro dinero (manda la hoja): ${dif.join("; ")}`);
      }
    }
    const pt = proyectoTel && proyectoTel.p;
    let nombreFinal = v.nombre;
    if (pt && String(pt.nombre || "").trim() && String(pt.nombre).trim() !== v.nombre) {
      nombreFinal = String(pt.nombre).trim();
      raro("B", v.nombre);
    }
    const partes = pt && (pt.contacto || pt.negocio) ? { contacto: String(pt.contacto || ""), negocio: String(pt.negocio || "") } : partirNombre(nombreFinal);
    if (!Object.keys(procedencia.celdas).length) delete procedencia.celdas;
    if (!historica && !ETAPA_DESDE_NOTION[etapaTxt] && obra.etapa === hoja.etapa) procedencia.etapa_vacia = true;
    if (unibles.length) procedencia.telefonos = [...new Set(unibles.map((x) => x.tel.etiqueta))];
    if (pt && ms(pt.actualizado_en)) procedencia.actualizado_ms = ms(pt.actualizado_en);
    for (const k of ["hoja_perdida", "duplicado_de", "hoja_doble", "fuera_de_hoja"]) if (pt && pt[k]) (procedencia.marcas ||= {})[k] = pt[k];
    const proyecto = {
      id,
      empresa_id: empresa2,
      folio_hoja: folio,
      folio_global: fuente === "cotizacion" || !historica && y ? y : null,
      folio_local: fuente === "cotizacion" && pt ? String(pt.folio_local || folio) : folio,
      dispositivo: fuente === "cotizacion" && pt && RE_DISP.test(String(pt.dispositivo || "")) ? pt.dispositivo : "hoja",
      fuente,
      historica,
      nombre: nombreFinal,
      contacto: partes.contacto,
      negocio: partes.negocio,
      tel: obra.tel,
      etapa: obra.etapa && ETAPAS2.includes(obra.etapa) ? obra.etapa : historica ? null : "ganado",
      tipo_trabajo: tipo_trabajo.length || !pt ? tipo_trabajo : Array.isArray(pt.tipo_trabajo) ? pt.tipo_trabajo.filter((t) => TIPOS.includes(t)) : [],
      fecha_anticipo,
      compromiso_texto: pt ? String(pt.compromiso_texto || "") : "",
      dir_texto: obra.dir_texto,
      entrecalles: pt ? String(pt.entrecalles || "") : "",
      maps_url: obra.maps_url || "",
      lat: obra.lat ?? null,
      lng: obra.lng ?? null,
      geo_fuente: obra.geo_fuente || "",
      ubicacion_pendiente: !!(pt && pt.ubicacion_pendiente),
      entrega: obra.entrega || null,
      plazo_k: obra.plazo_k || null,
      notas: obra.notas || "",
      estatus,
      iva,
      fecha_instalacion_hist: historica ? fechaInst : null,
      sellos,
      origen: fuente === "cotizacion" && pt && objeto(pt.origen) ? pt.origen : null,
      procedencia,
      creado_ms: pt ? ms(pt.creado_en) : 0
    };
    acotarProyecto(proyecto, rep, "Ventas!" + fila);
    T.proyectos.push(proyecto);
    proyectoDeFolio.set(folio, proyecto);
    const neto = numero(c("H"));
    T.ventas_dinero.push({
      proyecto_id: id,
      empresa_id: empresa2,
      subtotal: v.g,
      anticipo: v.i,
      liquidacion: v.j,
      cuenta: cuenta2,
      fecha_liquidacion,
      pct_comision,
      precio_auth: fuente === "cotizacion" && pt && Number.isFinite(Number(pt.precio_auth)) && pt.precio_auth !== null ? Number(pt.precio_auth) : neto.ok && !neto.vacia ? neto.n : null,
      origen: proyecto.origen,
      venta_local: pt && (pt.sub !== void 0 || pt.neto !== void 0) ? { sub: pt.sub ?? null, neto: pt.neto ?? null } : null,
      /* Un importe VACÍO en la hoja entra como 0 (la columna no admite null y las fórmulas lo leen igual), y se dice cuál: «sin capturar»
         no es «cero» para el teléfono, que con un 0 pisaría el anticipo pactado. La lectura en vivo lo regresa vacío (2026-10-24). */
      procedencia: { fila_hoja: fila, ...["G", "I", "J"].some((l) => vacia(c(l))) ? { vacias: ["G", "I", "J"].filter((l) => vacia(c(l))) } : {} }
    });
    if (!historica && fechaInst) {
      const selloTel = Math.max(0, ...unibles.map((x) => ms(objeto(x.p.sellos) && x.p.sellos.instalacion)));
      proyecto._citaHoja = { fecha: fechaInst, hora: hora(c("AA")), sello: sellosHoja.instalacion || 0, selloTel };
    }
    esperado.push({ folio, h: c("H"), k: c("K"), r: c("R"), s: c("S"), t: c("T"), x: c("X"), o: c("O"), v: c("V"), w: c("W") });
  }
  const sinHoja = /* @__PURE__ */ new Map();
  for (const x of copias) {
    if (usadas.has(x)) continue;
    const fh = String(x.p.folio_hoja || "").trim().toUpperCase();
    if (RE_FOLIO_HOJA.test(fh)) {
      rep.fuera.push({ telefono: x.tel.etiqueta, id: x.p.id, marca: "su venta no está en la hoja", valor: fh, nombre: x.p.nombre || "" });
      continue;
    }
    const fg = String(x.p.folio_global || "").trim();
    const llave = RE_FOLIO_GLOBAL.test(fg) ? fg : "id:" + x.p.id;
    (sinHoja.get(llave) || sinHoja.set(llave, []).get(llave)).push(x);
  }
  for (const [llave, grupo] of sinHoja) {
    const fg = llave.startsWith("id:") ? null : llave;
    const canceladas = grupo.every((x) => x.p.etapa === "cancelado");
    if (fg && canceladas) {
      const id = canonico(grupo, fg, null);
      for (const x of grupo) if (x.p.id !== id) remapeo[x.p.id] = id;
      const p = (grupo.find((x) => x.p.id === id) || grupo[0]).p;
      if (!RE_ID.test(id)) {
        rep.rechazar("teléfonos", id, "proyecto", "id no válido para la base");
        continue;
      }
      T.proyectos.push({
        id,
        empresa_id: empresa2,
        folio_hoja: null,
        folio_global: fg,
        folio_local: String(p.folio_local || ""),
        dispositivo: RE_DISP.test(String(p.dispositivo || "")) ? p.dispositivo : fg.split("@")[1],
        fuente: "cotizacion",
        historica: false,
        nombre: String(p.nombre || fg).trim() || fg,
        contacto: String(p.contacto || ""),
        negocio: String(p.negocio || ""),
        tel: telefonoLimpio(p.tel),
        etapa: "cancelado",
        tipo_trabajo: Array.isArray(p.tipo_trabajo) ? p.tipo_trabajo.filter((t) => TIPOS.includes(t)) : [],
        fecha_anticipo: /^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha_ganado || "")) ? p.fecha_ganado : null,
        compromiso_texto: String(p.compromiso_texto || ""),
        dir_texto: String(p.dir_texto || ""),
        entrecalles: String(p.entrecalles || ""),
        maps_url: String(p.maps_url || ""),
        lat: Number.isFinite(p.lat) ? p.lat : null,
        lng: Number.isFinite(p.lng) ? p.lng : null,
        geo_fuente: String(p.geo_fuente || ""),
        ubicacion_pendiente: !!p.ubicacion_pendiente,
        entrega: ["instalacion", "paqueteria", "recoleccion"].includes(p.entrega) ? p.entrega : null,
        plazo_k: [1, 2, 3, 4, 5].includes(p.plazo_k) ? p.plazo_k : null,
        notas: String(p.notas || ""),
        estatus: null,
        iva: p.iva !== false,
        fecha_instalacion_hist: null,
        sellos: sellosValidos(p.sellos),
        origen: objeto(p.origen),
        procedencia: { telefonos: [...new Set(grupo.map((x) => x.tel.etiqueta))], lapida: true },
        creado_ms: ms(p.creado_en)
      });
      acotarProyecto(T.proyectos.at(-1), rep, "teléfonos");
    } else {
      for (const x of grupo) {
        rep.fuera.push({ telefono: x.tel.etiqueta, id: x.p.id, marca: "fuera de la hoja (sin folio V-###)", valor: x.p.folio_global || "", nombre: x.p.nombre || "" });
      }
    }
  }
  const idsImportados = new Set(T.proyectos.map((p) => p.id));
  const canon = (idLocal) => {
    const i = remapeo[idLocal] || idLocal;
    return idsImportados.has(i) ? i : null;
  };
  const instPorId = /* @__PURE__ */ new Map();
  for (const tel of tels) {
    for (const ins of tel.instalaciones) {
      if (!ins.id) continue;
      const prev = instPorId.get(ins.id);
      if (!prev || (Number(ins.movida) || 0) > (Number(prev.ins.movida) || 0) || (Number(ins.movida) || 0) === (Number(prev.ins.movida) || 0) && ms(ins.actualizado_en) > ms(prev.ins.actualizado_en)) {
        instPorId.set(ins.id, { ins, tel });
      }
    }
  }
  const instPorProyecto = /* @__PURE__ */ new Map();
  for (const { ins, tel } of instPorId.values()) {
    const pid = canon(ins.proyecto_id);
    if (!pid) {
      rep.rechazar("instalaciones", ins.id, tel.etiqueta, `su proyecto «${ins.proyecto_id}» no se importa`);
      continue;
    }
    if (!RE_ID.test(ins.id)) {
      rep.rechazar("instalaciones", ins.id, tel.etiqueta, "id no válido para la base");
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ins.fecha || ""))) {
      rep.rechazar("instalaciones", ins.id, tel.etiqueta, `fecha «${ins.fecha}» no válida`);
      continue;
    }
    const fila = {
      id: ins.id,
      empresa_id: empresa2,
      proyecto_id: pid,
      fecha: ins.fecha,
      hora: hora(ins.hora),
      ventana: ["dia", "noche", "madrugada"].includes(ins.ventana) ? ins.ventana : "dia",
      duracion_min: Number.isInteger(ins.duracion_min) && ins.duracion_min >= 1 && ins.duracion_min <= 600 ? ins.duracion_min : 180,
      estado: ESTADOS_INST.includes(ins.estado) ? ins.estado : "confirmada",
      movida: Math.max(0, Number(ins.movida) || 0),
      notas: String(ins.notas || "").slice(0, 2e4),
      procedencia: { telefono: tel.etiqueta },
      creado_ms: ms(ins.creado_en),
      _act: ms(ins.actualizado_en)
    };
    (instPorProyecto.get(pid) || instPorProyecto.set(pid, []).get(pid)).push(fila);
  }
  for (const p of T.proyectos) {
    const lista = instPorProyecto.get(p.id) || [];
    const vivas = lista.filter((x) => x.estado !== "cancelada").sort((a, b) => b.movida - a.movida || b._act - a._act || (a.id < b.id ? -1 : 1));
    if (vivas.length > 1) {
      rep.conflicto(
        "dos citas vivas para un proyecto",
        p.folio_hoja || p.id,
        `se queda ${vivas[0].id} (movida ${vivas[0].movida}); ${vivas.slice(1).map((x) => x.id).join(", ")} quedan canceladas sin tocar el calendario`
      );
      for (const x of vivas.slice(1)) {
        x.estado = "cancelada";
        x.procedencia.fusionada_en = vivas[0].id;
      }
    }
    const cita = p._citaHoja;
    delete p._citaHoja;
    if (cita) {
      const viva = vivas[0];
      if (!viva) {
        lista.push({
          id: "hoja-" + p.folio_hoja,
          empresa_id: empresa2,
          proyecto_id: p.id,
          fecha: cita.fecha,
          hora: cita.hora,
          ventana: "dia",
          duracion_min: 180,
          estado: "confirmada",
          movida: 0,
          notas: "Agendada desde la hoja.",
          procedencia: { hoja: true },
          creado_ms: 0,
          _act: 0
        });
      } else if (viva.fecha !== cita.fecha || (viva.hora || null) !== (cita.hora || null)) {
        if (cita.sello > cita.selloTel || cita.sello === 0 && cita.selloTel === 0) {
          rep.conflicto("cita distinta entre la hoja y el teléfono", p.folio_hoja, `gana la hoja (${cita.fecha} ${cita.hora || ""}) sobre ${viva.fecha} ${viva.hora || ""}`);
          viva.fecha = cita.fecha;
          viva.hora = cita.hora;
        } else {
          rep.conflicto("cita distinta entre la hoja y el teléfono", p.folio_hoja, `gana el teléfono (${viva.fecha} ${viva.hora || ""}) sobre la hoja ${cita.fecha} ${cita.hora || ""}`);
        }
      }
    }
    for (const x of lista) {
      delete x._act;
      T.instalaciones.push(x);
    }
  }
  const semilla = entrada.semilla === void 0 ? JSON.parse(readFileSync(new URL("../../datos/semilla.json", import.meta.url), "utf8")) : entrada.semilla;
  const mats = /* @__PURE__ */ new Map();
  const ponerMaterial = (m, editado, donde, costo) => {
    const id = String(m.id || "").trim();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) {
      if (id) rep.rechazar("materiales", id, donde, "clave no válida para la base");
      return;
    }
    const uc = NORM_CONSUMO[String(m.unidad_consumo || "").trim()] || null;
    const ucompra = UNIDADES_COMPRA.includes(m.unidad_compra) ? m.unidad_compra : null;
    const factor = Number(m.factor);
    if (!uc || !ucompra || !(factor > 0)) {
      rep.rechazar("materiales", id, donde, "unidad o factor no válidos");
      return;
    }
    const merma = Number(m.merma_pct !== void 0 ? m.merma_pct : m.merma) || 0;
    const fila = {
      empresa_id: empresa2,
      id,
      nombre: String(m.nombre || id),
      familia: String(m.familia || "sin_familia"),
      unidad_compra: ucompra,
      unidad_consumo: uc,
      medida: String(m.medida || ""),
      factor,
      factor_origen: String(m.factor_origen || ""),
      largo_cm: numONull(m.largo_cm),
      ancho_cm: numONull(m.ancho_cm),
      espesor: String(m.espesor || ""),
      merma_pct: merma >= 0 && merma < 1 ? merma : 0,
      fraccionable: !!m.fraccionable && m.fraccionable !== "FALSE",
      min_compra: Math.max(0, Number(m.min_compra) || 0),
      min_stock: Math.max(0, Number(m.min_stock) || 0),
      proveedor: String(m.proveedor || ""),
      tel_proveedor: String(m.tel_proveedor || ""),
      activo: m.activo === void 0 || m.activo === "" ? true : !!m.activo && m.activo !== "FALSE",
      sellos: { ...objeto(m.sellos) || {}, _editado: editado },
      procedencia: { de: donde },
      creado_ms: ms(m.creado_en)
    };
    const prev = mats.get(id);
    if (!prev || editado > prev.fila.sellos._editado) mats.set(id, { fila, costo: costo !== void 0 ? costo : prev && prev.costo });
    else if (costo !== void 0 && (!prev.costo || costo.sello > prev.costo.sello)) prev.costo = costo;
  };
  for (const m of semilla && semilla.materiales || []) ponerMaterial(m, 1, "semilla");
  for (const tel of tels) for (const m of tel.materiales) {
    ponerMaterial(
      m,
      ms(m.actualizado_en) || 1,
      tel.etiqueta,
      m.costo_compra === void 0 ? void 0 : { importe: numONull(m.costo_compra), sello: ms(m.actualizado_en) }
    );
  }
  const cat = P2["Catálogo de material"];
  if (cat) {
    const h = encabezados(cat), k = (n) => h.indexOf(n);
    for (const { fila, celdas } of filas(cat)) {
      const v = (n) => k(n) >= 0 ? celdas[k(n)] : "";
      const id = texto(v("Clave")).replace(/^'/, "").trim();
      if (!id) continue;
      let sellosM = {};
      try {
        sellosM = objeto(JSON.parse(texto(v("Sellos")) || "{}")) || {};
      } catch (_) {
      }
      const editado = ms(v("Editado")) || 1;
      const costoCelda = v("Costo de compra");
      ponerMaterial(
        {
          id,
          nombre: texto(v("Nombre")),
          familia: texto(v("Familia")),
          unidad_compra: texto(v("Unidad de compra")),
          unidad_consumo: texto(v("Unidad de consumo")),
          medida: texto(v("Medida")),
          factor: numero(v("Factor")).n,
          factor_origen: texto(v("De dónde sale el factor")),
          largo_cm: vacia(v("Largo (cm)")) ? null : numero(v("Largo (cm)")).n,
          ancho_cm: vacia(v("Ancho (cm)")) ? null : numero(v("Ancho (cm)")).n,
          espesor: texto(v("Espesor")),
          merma_pct: numero(v("Merma")).n,
          fraccionable: v("Fraccionable") === true || texto(v("Fraccionable")).toUpperCase() === "TRUE",
          min_compra: numero(v("Mínimo de compra")).n,
          min_stock: numero(v("Mínimo de almacén")).n,
          proveedor: texto(v("Proveedor")),
          tel_proveedor: texto(v("Teléfono del proveedor")),
          activo: v("Activo") === "" ? true : v("Activo") === true || texto(v("Activo")).toUpperCase() === "TRUE",
          sellos: sellosM,
          creado_en: v("Creado")
        },
        editado,
        "Catálogo de material!" + fila,
        sellosM.costo_compra || !vacia(costoCelda) ? { importe: vacia(costoCelda) ? null : numero(costoCelda).n, sello: ms(sellosM.costo_compra) || editado } : void 0
      );
    }
  }
  for (const { fila, costo } of mats.values()) {
    T.materiales.push(fila);
    if (costo) T.almacen_costos.push({ empresa_id: empresa2, material_id: fila.id, movimiento_id: null, importe: costo.importe, sello: costo.sello });
  }
  const ctes = /* @__PURE__ */ new Map();
  for (const tel of tels) for (const c of tel.constantes) {
    const clave = String(c.clave || "");
    if (!/^[A-Za-z0-9_]{1,64}$/.test(clave) || clave === "_semilla" || !Number.isFinite(Number(c.valor))) continue;
    const prev = ctes.get(clave);
    if (!prev || ms(c.actualizado_en) > prev.act) {
      if (prev && Number(prev.fila.valor) !== Number(c.valor)) rep.conflicto("constante distinta entre teléfonos", clave, `${prev.fila.valor} vs ${c.valor}: gana la más reciente (${tel.etiqueta})`);
      ctes.set(clave, { act: ms(c.actualizado_en), fila: {
        empresa_id: empresa2,
        clave,
        valor: Number(c.valor),
        unidad: String(c.unidad || ""),
        nota: String(c.nota || ""),
        version: String(c.version || ""),
        actualizado_por: String(c.actualizado_por || "")
      } });
    }
  }
  for (const { fila } of ctes.values()) T.constantes.push(fila);
  const tar = P2["Tarifas"];
  if (tar) {
    const h = encabezados(tar), k = (n) => h.indexOf(n), vistas = /* @__PURE__ */ new Set();
    for (const { fila, celdas } of filas(tar)) {
      const v = (n) => k(n) >= 0 ? celdas[k(n)] : "";
      const grupo = texto(v("Grupo")).trim(), clave = texto(v("Clave")).trim();
      if (!grupo && !clave) continue;
      const fab = FABRICA_TARIFAS[grupo];
      const gratis = grupo === "complejidad" || grupo === "recorte-extra";
      const p = numero(v("Precio"));
      const nombre = texto(v("Nombre")).replace(/[<>&"`]/g, "").trim().slice(0, 60), como = fab && fab.includes(clave) ? "" : texto(v("Se fabrica como")).trim();
      let por = "";
      if (!fab || !/^[a-z0-9-]{2,24}$/.test(clave)) por = "grupo o clave que no sirven";
      else if (vistas.has(grupo + "|" + clave)) por = "la clave viene dos veces";
      else if (!p.ok || p.vacia || p.n < 0 || !gratis && p.n <= 0 || p.n > 1e6) por = "el precio no sirve";
      else if (!fab.includes(clave) && (gratis || !fab.includes(como))) por = "un renglón nuevo sin «se fabrica como» de fábrica";
      else if (!nombre) por = "sin nombre";
      if (por) {
        rep.avisar("Tarifas", fila, clave || "?", por + ": se queda el de fábrica");
        continue;
      }
      vistas.add(grupo + "|" + clave);
      const vis = v("Visible"), act = v("Actualizado");
      const actMs = esFecha(act) ? Date.parse(act.$fecha + (act.$hora ? "T" + act.$hora : "")) : Date.parse(texto(act));
      T.tarifas.push({
        empresa_id: empresa2,
        grupo,
        clave,
        nombre,
        precio: Math.round(p.n * 100) / 100,
        como,
        visible: grupo === "recorte-extra" || grupo === "complejidad" && clave === "recta" || !(vis === false || /^(false|no|0)$/i.test(texto(vis).trim())),
        orden: numero(v("Orden")).ok ? Math.trunc(numero(v("Orden")).n) : 0,
        detalle: texto(v("Detalle")).slice(0, 120),
        actualizado_por: texto(v("Por")).slice(0, 120),
        actualizado_ms: ms(actMs)
      });
    }
  }
  let gastosEnHoja = null;
  const gas = P2["Gastos"];
  if (Array.isArray(gas) && !encabezados(gas).includes("ID")) {
    const n = filas(gas).filter((x) => x.celdas.some((c) => !vacia(c))).length;
    if (n) rep.no_importado.push({ que: "Gastos", n, por: "la pestaña «Gastos» no tiene la columna «ID»: no se lee y no se toca ningún gasto de la base" });
  } else if (Array.isArray(gas)) {
    gastosEnHoja = [];
    const h = encabezados(gas), k = (n) => h.indexOf(n);
    const leidos = [], fuera2 = [], veces = /* @__PURE__ */ new Map();
    for (const { fila, celdas } of filas(gas)) {
      const v = (n) => k(n) >= 0 ? celdas[k(n)] : "";
      const id = texto(v("ID")).trim();
      if (!id) {
        if (texto(v("Concepto")).trim() || !vacia(v("Monto"))) fuera2.push({ fila, motivo: "sin_id" });
        continue;
      }
      gastosEnHoja.push(id);
      veces.set(id, (veces.get(id) || 0) + 1);
      const fecha2 = diaDeGasto(v("Fecha"));
      const concepto = sinApostrofo(texto(v("Concepto"))).trim().slice(0, 200);
      const monto = montoDeGasto(v("Monto"));
      const catHoja = texto(v("Categoría")).trim();
      const categoria = categoriaDeGasto(catHoja);
      const anulado = siNoDeGasto(v("Anulado"));
      const motivo = !RE_ID_GASTO.test(id) ? "id_no_sirve" : !fecha2 ? "fecha_no_se_entiende" : !concepto ? "sin_concepto" : !(monto > 0 && monto <= 1e7) ? "monto_no_sirve" : null;
      leidos.push({ fila, id, motivo, g: {
        empresa_id: empresa2,
        id,
        fecha: fecha2,
        concepto,
        categoria,
        monto,
        cuenta: texto(v("Cuenta")).trim().slice(0, 60),
        folio: sinApostrofo(texto(v("Folio del proyecto"))).trim().slice(0, 40),
        registro_por: sinApostrofo(texto(v("Registró"))).trim().slice(0, 200),
        registrado_ms: msDeCelda(v("Registrado el")),
        anulado,
        anulo: anulado ? sinApostrofo(texto(v("Anuló"))).trim().slice(0, 200) : "",
        anulado_ms: anulado ? msDeCelda(v("Anulado el")) : 0,
        subio: sinApostrofo(texto(v("Subió"))).trim().slice(0, 200),
        fila_hoja: fila,
        procedencia: catHoja && catHoja !== categoria ? { categoria_hoja: catHoja.slice(0, 60) } : {}
      } });
    }
    for (const x of leidos) {
      const motivo = veces.get(x.id) > 1 ? "id_repetido" : x.motivo;
      if (motivo) fuera2.push({ fila: x.fila, motivo });
      else T.gastos.push(x.g);
    }
    if (fuera2.length) {
      fuera2.sort((a, b) => a.fila - b.fila);
      const motivos = {};
      for (const x of fuera2) motivos[x.motivo] = (motivos[x.motivo] || 0) + 1;
      rep.no_importado.push({ que: "Gastos", n: fuera2.length, por: "renglones de la pestaña «Gastos» que la base no acepta: se quedan en la hoja y no frenan la copia (" + Object.entries(motivos).map(([m, n]) => m + " " + n).join(", ") + ")", filas: fuera2.map((x) => x.fila), motivos });
    }
  }
  const proyectoDeVenta = (f) => {
    const p = proyectoDeFolio.get(String(f || "").trim().toUpperCase());
    return p ? p.id : null;
  };
  const reqs = /* @__PURE__ */ new Map();
  const rangoReq = (e) => ({ consumido: 3, comprado: 2 })[e] || 1;
  const ponerReq = (r, donde, venta, sello2) => {
    const pid = canon(r.proyecto_id) || proyectoDeVenta(venta);
    const mat = String(r.material_id || "").trim();
    if (!pid || !mat) {
      rep.rechazar("requerimientos", r.id || "?", donde, pid ? "sin material" : `su proyecto «${r.proyecto_id || venta || ""}» no se importa`);
      return;
    }
    const ucompra = UNIDADES_COMPRA.includes(r.unidad_compra) ? r.unidad_compra : null;
    if (!ucompra) {
      rep.rechazar("requerimientos", r.id || "?", donde, `unidad de compra «${r.unidad_compra}» no válida`);
      return;
    }
    const fila = {
      empresa_id: empresa2,
      id: pid + ":" + mat,
      proyecto_id: pid,
      material_id: mat,
      cantidad_consumo: Number(r.cantidad_consumo) || 0,
      unidad_consumo: String(r.unidad_consumo || ""),
      cantidad_compra: Math.max(0, Number(r.cantidad_compra) || 0),
      unidad_compra: ucompra,
      partidas: Array.isArray(r.partidas) ? r.partidas : [],
      formula: String(r.formula || ""),
      confianza: String(r.confianza || "estimada"),
      requiere: String(r.requiere || ""),
      constantes_version: String(r.constantes_version || ""),
      cantidad_ajustada: r.cantidad_ajustada === null || r.cantidad_ajustada === void 0 || r.cantidad_ajustada === "" ? null : Math.max(0, Number(r.cantidad_ajustada) || 0),
      motivo_ajuste: String(r.motivo_ajuste || ""),
      ajustado_por: String(r.ajustado_por || ""),
      ajustado_ms: ms(r.ajustado_en ?? r.ajustado_ms),
      estado: ESTADOS_REQ.includes(r.estado) ? r.estado : "calculado",
      sellos: { ...objeto(r.sellos) || {}, _editado: sello2 },
      procedencia: { de: donde, ...r.id && r.id !== pid + ":" + mat ? { id_local: r.id } : {}, ...r.proyecto_id && r.proyecto_id !== pid ? { proyecto_id_local: r.proyecto_id } : {} },
      creado_ms: ms(r.creado_en)
    };
    if (fila.cantidad_compra >= 1e7 || (fila.cantidad_ajustada ?? 0) >= 1e7) {
      rep.rechazar("requerimientos", fila.id, donde, "cantidad fuera del tope de la base");
      return;
    }
    if (fila.formula.length === 2e3) rep.avisar("requerimientos", fila.id, donde, "«Cómo se calculó» mide exactamente 2000: pudo truncarse en la hoja");
    const prev = reqs.get(fila.id);
    if (!prev) {
      reqs.set(fila.id, fila);
      return;
    }
    const a = [rangoReq(fila.estado), sello2], b = [rangoReq(prev.estado), prev.sellos._editado];
    const gana = a[0] > b[0] || a[0] === b[0] && a[1] > b[1];
    const empate = a[0] === b[0] && a[1] === b[1];
    if (empate && !igualJSON({ ...fila, procedencia: 0, sellos: 0, creado_ms: 0 }, { ...prev, procedencia: 0, sellos: 0, creado_ms: 0 })) {
      rep.conflicto("requerimiento duplicado sin ganador", fila.id, `${prev.procedencia.de} y ${donde}: mismo estado (${fila.estado}) y mismo sello; se queda ${prev.procedencia.de}`);
    } else if (!empate) {
      rep.avisar("requerimientos", fila.id, donde, `duplicado con ${prev.procedencia.de}: se queda ${gana ? donde : prev.procedencia.de} (${gana ? fila.estado : prev.estado})`);
    }
    if (gana) reqs.set(fila.id, fila);
  };
  for (const tel of tels) for (const r of tel.requerimientos) ponerReq(r, tel.etiqueta, r.folio_hoja, ms(r.actualizado_en) || 1);
  const listas = P2["Listas de compra"];
  if (listas) {
    const h = encabezados(listas), k = (n) => h.indexOf(n);
    for (const { fila, celdas } of filas(listas)) {
      const v = (n) => k(n) >= 0 ? celdas[k(n)] : "";
      if (vacia(v("Material"))) continue;
      let partidas = [];
      try {
        partidas = JSON.parse(texto(v("Partidas")) || "[]");
      } catch (_) {
      }
      let sellosR = {};
      try {
        sellosR = objeto(JSON.parse(texto(v("Sellos")) || "{}")) || {};
      } catch (_) {
      }
      ponerReq({
        id: texto(v("Id")),
        proyecto_id: texto(v("Proyecto (id)")),
        material_id: texto(v("Material")).replace(/^'/, ""),
        cantidad_compra: numero(v("Cantidad")).n,
        unidad_compra: texto(v("Unidad")),
        cantidad_ajustada: vacia(v("Corrección")) ? null : numero(v("Corrección")).n,
        estado: texto(v("Estado")),
        confianza: texto(v("Confianza")),
        requiere: texto(v("Le falta")),
        formula: texto(v("Cómo se calculó")),
        cantidad_consumo: numero(v("Consumo")).n,
        unidad_consumo: texto(v("Unidad de consumo")),
        partidas,
        motivo_ajuste: texto(v("Por qué se corrigió")),
        ajustado_por: texto(v("Corrigió")),
        ajustado_ms: ms(v("Corregido")),
        constantes_version: texto(v("Constantes")),
        sellos: sellosR,
        creado_en: v("Creado")
      }, "Listas de compra!" + fila, texto(v("Venta")), ms(v("Editado")) || 1);
    }
  }
  T.requerimientos.push(...reqs.values());
  const movs = /* @__PURE__ */ new Map();
  const ponerMov = (m, donde, venta) => {
    const id = String(m.id || "").trim();
    const tipo = TIPOS_MOV.includes(m.tipo) ? m.tipo : null, origen = ORIGENES_MOV.includes(m.origen) ? m.origen : null;
    const cantidad = Number(m.cantidad), ts = ms(m.ts);
    const ucompra = UNIDADES_COMPRA.includes(m.unidad_compra) ? m.unidad_compra : null;
    const signoOk = tipo && (["entrada", "devolucion"].includes(tipo) && cantidad > 0 || ["salida", "merma"].includes(tipo) && cantidad < 0 || tipo === "conteo" && cantidad >= 0 || tipo === "ajuste" && cantidad !== 0);
    if (!id || id.length > 200 || !tipo || !origen || !ucompra || !Number.isFinite(cantidad) || Math.abs(cantidad) > 1e7 || !ts || !signoOk || !String(m.material_id || "").trim()) {
      rep.rechazar("almacen_movimientos", id || "?", donde, "renglón incompleto o con signo que no corresponde a su tipo");
      return;
    }
    const pidLocal = String(m.proyecto_id || "");
    const pid = canon(pidLocal) || proyectoDeVenta(venta);
    const reqLocal = String(m.requerimiento_id || "");
    const fila = {
      empresa_id: empresa2,
      id,
      material_id: String(m.material_id).trim(),
      tipo,
      cantidad,
      unidad_compra: ucompra,
      origen,
      nota: String(m.nota || "").slice(0, 500),
      usuario: String(m.usuario || "").slice(0, 200),
      rol: String(m.rol || ""),
      dispositivo: String(m.dispositivo || ""),
      proyecto_id: pid,
      requerimiento_id: reqLocal ? pid ? pid + ":" + String(m.material_id).trim() : reqLocal : null,
      firma: String(m.sello ?? m.firma ?? "").slice(0, 200),
      ts,
      procedencia: {
        de: donde,
        ...pidLocal && pidLocal !== pid ? { proyecto_id_local: pidLocal } : {},
        ...m.secuencia_hoja ? { secuencia_hoja: m.secuencia_hoja } : {},
        ...m.subio ? { subio: m.subio } : {}
      },
      creado_ms: ms(m.creado_en ?? m.llego),
      costo: m.costo_total === void 0 || m.costo_total === null || m.costo_total === "" ? void 0 : numONull(m.costo_total)
    };
    if (String(m.nota || "").length > 500 || String(m.usuario || "").length > 200) rep.avisar("almacen_movimientos", id, donde, "nota o usuario recortados al tope de la base");
    const prev = movs.get(id);
    if (prev && !igualJSON({ ...prev, procedencia: 0, creado_ms: 0 }, { ...fila, procedencia: 0, creado_ms: 0 })) {
      rep.conflicto("movimiento con el mismo id y distinto contenido", id, `${prev.procedencia.de} y ${donde}: se queda el primero`);
    }
    if (!prev) movs.set(id, fila);
  };
  for (const tel of tels) for (const m of tel.movimientos) ponerMov(m, tel.etiqueta, m.folio_hoja);
  const alm = P2["Almacén"];
  if (alm) {
    const h = encabezados(alm), k = (n) => h.indexOf(n);
    for (const { fila, celdas } of filas(alm)) {
      const v = (n) => k(n) >= 0 ? celdas[k(n)] : "";
      if (vacia(v("Id"))) continue;
      ponerMov({
        id: texto(v("Id")),
        material_id: texto(v("Material")).replace(/^'/, ""),
        tipo: texto(v("Tipo")),
        cantidad: numero(v("Cantidad")).n,
        unidad_compra: texto(v("Unidad")),
        origen: texto(v("Origen")),
        nota: texto(v("Nota")),
        usuario: texto(v("Quién")),
        rol: texto(v("Rol")),
        dispositivo: texto(v("Dispositivo")),
        proyecto_id: texto(v("Proyecto (id)")),
        requerimiento_id: texto(v("Requerimiento")),
        costo_total: vacia(v("Costo total")) ? void 0 : numero(v("Costo total")).n,
        firma: texto(v("Firma")),
        ts: v("Sello"),
        secuencia_hoja: numero(v("Secuencia")).n || void 0,
        subio: texto(v("Subió")),
        llego: esFecha(v("Llegó")) ? v("Llegó").$ms : v("Llegó")
      }, "Almacén!" + fila, texto(v("Venta")));
    }
  }
  const derivadas = /* @__PURE__ */ new Map();
  for (const m of [...movs.values()].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1))) {
    if (m.tipo !== "salida" || m.origen !== "derivado" || !m.proyecto_id) continue;
    const llave = m.proyecto_id + "|" + m.material_id;
    if (derivadas.has(llave)) {
      rep.conflicto("salida de material repetida", llave, `${m.id} (${m.procedencia.de}) repite a ${derivadas.get(llave)}: no se importa`);
      movs.delete(m.id);
    } else derivadas.set(llave, m.id);
  }
  const ordenMov = (a, b) => (a.procedencia.secuencia_hoja || Infinity) - (b.procedencia.secuencia_hoja || Infinity) || a.ts - b.ts || (a.id < b.id ? -1 : 1);
  for (const m of [...movs.values()].sort(ordenMov)) {
    const { costo, ...fila } = m;
    T.almacen_movimientos.push(fila);
    if (costo !== void 0) T.almacen_costos.push({ empresa_id: empresa2, material_id: null, movimiento_id: m.id, importe: costo, sello: m.ts });
  }
  const ocurrencias = /* @__PURE__ */ new Map();
  let maxP = 0;
  for (const { fila, celdas } of filas(P2["Abonos comisión"])) {
    const folio = texto(celdas[0]).trim().toUpperCase();
    if (!folio && vacia(celdas[2])) continue;
    const imp = numero(celdas[2]);
    if (!RE_FOLIO_HOJA.test(folio)) {
      rep.rechazar("Abonos comisión", fila, "A «Folio»", `«${texto(celdas[0])}» no es un folio V-###`);
      continue;
    }
    if (!imp.ok || imp.vacia || Math.abs(imp.n) >= 1e7) {
      rep.rechazar("Abonos comisión", fila, folio, `C «Importe» «${texto(celdas[2])}» no es un importe válido`);
      continue;
    }
    const f = fecha(celdas[3]);
    const nota = texto(celdas[4]), pagoTxt = texto(celdas[5]).trim().toUpperCase();
    const pago_id = /^P-\d{3,}$/.test(pagoTxt) ? pagoTxt : null;
    if (pagoTxt && !pago_id) rep.avisar("Abonos comisión", fila, folio, `F «Pago» «${pagoTxt}» no es un P-### y queda vacío`);
    if (pago_id) maxP = Math.max(maxP, Number(pago_id.slice(2)));
    const tipo = imp.n < 0 ? "correccion" : imp.n > 0 && pago_id && /^reparto/i.test(nota.trim()) ? "reparto" : "historico";
    const procedencia = { fila_hoja: fila };
    if (f && typeof f === "object") {
      procedencia.fecha_texto = f.texto;
      rep.avisar("Abonos comisión", fila, folio, "D «Fecha» es texto: el abono queda sin fecha");
    } else if (esFecha(celdas[3]) && celdas[3].$hora && celdas[3].$hora !== "00:00") procedencia.hora_original = celdas[3].$hora;
    if (nota.length > 500) {
      procedencia.nota_completa = nota;
      rep.avisar("Abonos comisión", fila, folio, "la nota pasa de 500 caracteres: se recorta y la completa queda en procedencia");
    }
    if (!proyectoDeFolio.has(folio)) rep.avisar("Abonos comisión", fila, folio, "el folio no tiene fila en Ventas: el abono se importa igual (suma donde hoy suma)");
    const base = [folio, imp.n, typeof f === "string" ? f : "", nota, pago_id || ""].join("|");
    const n = (ocurrencias.get(base) || 0) + 1;
    ocurrencias.set(base, n);
    T.abonos.push({
      empresa_id: empresa2,
      folio_hoja: folio,
      importe: imp.n,
      fecha: typeof f === "string" ? f : null,
      nota: nota.slice(0, 500),
      pago_id,
      tipo,
      op_id: "hoja:abono:" + sha(base, 16) + ":" + n,
      procedencia
    });
  }
  const correos = /* @__PURE__ */ new Map();
  for (const { fila, celdas } of filas(P2["Accesos"])) {
    const correo2 = texto(celdas[0]).trim().toLowerCase(), area = texto(celdas[1]).trim().toLowerCase();
    if (!RE_CORREO.test(correo2) || !AREAS.includes(area)) continue;
    if (correos.has(correo2)) {
      rep.avisar("Accesos", fila, correo2, `repetido (ya estaba en la fila ${correos.get(correo2)}): gana la primera, como en la hoja`);
      continue;
    }
    correos.set(correo2, fila);
    T.miembros.push({ empresa_id: empresa2, correo: correo2, area, nota: texto(celdas[2]).slice(0, 500) });
  }
  if (!T.miembros.some((m) => m.area === "direccion")) rep.avisar("Accesos", "-", "-", "no hay nadie de Dirección: sin uno activo nadie podrá dar altas");
  const auts = [];
  const pestAut = P2["Autorizaciones"];
  const filasAut = filas(pestAut).filter((x) => !vacia(x.celdas[1]));
  const conVeredicto = !entrada.clave && entrada.aceptarVeredictosDeLaHoja === true;
  const veredictos = conVeredicto ? leerVeredictos(vol.autorizaciones_comprobadas) : null;
  const fuera = [];
  const noEntra = (fila, folio, motivo, por) => {
    if (conVeredicto) fuera.push({ fila, folio, motivo, por });
    else rep.rechazar("Autorizaciones", fila, folio, por + ": no entra y se queda en la hoja congelada");
  };
  if (filasAut.length && !entrada.clave && !conVeredicto) {
    rep.no_importado.push({ que: "Autorizaciones", n: filasAut.length, por: "falta la clave del sello (AL3D_SELLO_CLAVE): sin ella no se puede comprobar que cada fila sea lo que se firmó" });
  } else if (filasAut.length && conVeredicto && !veredictos.ok) {
    rep.no_importado.push({ que: "Autorizaciones", n: filasAut.length, por: veredictos.por, motivos: { [veredictos.motivo]: filasAut.length } });
  } else {
    for (const { fila, celdas } of filasAut) {
      const t = (i) => texto(celdas[i]);
      let ts = celdas[0];
      if (esFecha(ts)) {
        rep.avisar("Autorizaciones", fila, t(1), "A «Cuándo (ISO)» llegó como fecha y no como texto: se reconstruye y puede no cuadrar");
        ts = new Date(ts.$ms).toISOString();
      }
      const reg = {
        folio_global: t(1),
        ts_iso: String(ts ?? ""),
        proyecto: t(2),
        cliente: t(3),
        sub_calc_txt: dinero2(Number(celdas[4])),
        precio_auth_txt: dinero2(Number(celdas[5])),
        total_txt: dinero2(Number(celdas[6])),
        ajuste_pct: numero(celdas[7]).ok && !vacia(celdas[7]) ? numero(celdas[7]).n : null,
        items_auth: t(8),
        huella: t(9),
        autorizo: t(10).trim().toLowerCase(),
        solicito: t(11),
        codigo: "",
        firma: t(13).trim().toLowerCase(),
        estado: t(14).trim(),
        nota: t(15).slice(0, 500),
        renglones: t(16),
        fila_hoja: fila
      };
      const cod = normalizarCodigo(t(12));
      reg.codigo = cod.length === 12 ? cod.slice(0, 4) + "-" + cod.slice(4, 8) + "-" + cod.slice(8) : t(12);
      if (!["vigente", "superada", "revocada"].includes(reg.estado)) {
        rep.avisar("Autorizaciones", fila, reg.folio_global, `estado «${reg.estado}» se lee como superada, como en la hoja`);
        reg.estado = "superada";
      }
      const malo = !RE_FOLIO_GLOBAL.test(reg.folio_global) ? "folio sin aparato" : !RE_TS_ISO.test(reg.ts_iso) ? "la hora no es ISO" : !/^[0-9a-f]{64}$/.test(reg.firma) ? "firma mal formada" : reg.codigo.replace(/-/g, "") !== reg.firma.slice(0, 12).toUpperCase() ? "el código no es el inicio de la firma" : !reg.autorizo ? "falta quién autorizó" : null;
      if (malo) {
        noEntra(fila, reg.folio_global, "fila_mal_formada", malo);
        continue;
      }
      const filaFirmada = {
        folio_global: reg.folio_global,
        ts_iso: reg.ts_iso,
        proyecto: reg.proyecto,
        sub_calc: reg.sub_calc_txt,
        precio_auth: reg.precio_auth_txt,
        total: reg.total_txt,
        items_auth: reg.items_auth,
        huella: reg.huella,
        autorizo: reg.autorizo,
        renglones: reg.renglones,
        codigo: reg.codigo,
        firma: reg.firma,
        estado: reg.estado
      };
      if (!conVeredicto) {
        let r;
        try {
          r = await verificar(filaFirmada, entrada.clave);
        } catch (e) {
          r = { valida: false, motivo: e.message };
        }
        if (!r.valida) {
          rep.rechazar("Autorizaciones", fila, reg.folio_global, `la firma no cuadra (${r.motivo}): no entra y se queda en la hoja congelada`);
          continue;
        }
        reg.codificacion = r.codificacion === "ascii" ? "utf-8" : r.codificacion;
        auts.push(reg);
        continue;
      }
      const v = veredictos.porFila.get(fila);
      let canon2 = null;
      try {
        canon2 = canonDe(registroDeFila(filaFirmada));
      } catch (_) {
        canon2 = null;
      }
      if (!v) {
        noEntra(fila, reg.folio_global, "sin_veredicto", "la hoja no dijo si su firma cuadra");
        continue;
      }
      if (v.firma_ok !== true) {
        const m = MOTIVOS_AUTORIZACION.includes(v.motivo) ? v.motivo : "firma_no_coincide";
        noEntra(fila, reg.folio_global, m, `la hoja dice que su firma no cuadra (${m})`);
        continue;
      }
      if (!CODIFICACIONES.includes(v.codificacion) || typeof v.canon !== "string") {
        noEntra(fila, reg.folio_global, "veredicto_invalido", "el veredicto de la hoja no tiene la forma esperada");
        continue;
      }
      if (canon2 === null || v.canon !== canon2) {
        noEntra(fila, reg.folio_global, "texto_distinto", "lo que se guardaría no es EXACTAMENTE el texto que la hoja comprobó (se firmaría una cosa y se guardaría otra)");
        continue;
      }
      reg.codificacion = v.codificacion;
      auts.push(reg);
    }
    const porFolio2 = /* @__PURE__ */ new Map();
    for (const a of auts) (porFolio2.get(a.folio_global) || porFolio2.set(a.folio_global, []).get(a.folio_global)).push(a);
    for (const [fg, lista] of porFolio2) {
      const vig = lista.filter((a) => a.estado === "vigente");
      if (vig.length <= 1) continue;
      if (conVeredicto) {
        for (const a of lista) {
          noEntra(a.fila_hoja, fg, "dos_vigentes", "su folio tiene dos autorizaciones vigentes en la hoja: se decide en la hoja");
          auts.splice(auts.indexOf(a), 1);
        }
        continue;
      }
      rep.conflicto("dos autorizaciones vigentes", fg, `filas ${vig.map((a) => a.fila_hoja).join(", ")}: queda vigente la ${vig.at(-1).fila_hoja}, las demás como superadas`);
      for (const a of vig.slice(0, -1)) a.estado = "superada";
    }
    if (fuera.length) {
      fuera.sort((a, b) => a.fila - b.fila);
      const motivos = {};
      for (const x of fuera) motivos[x.motivo] = (motivos[x.motivo] || 0) + 1;
      rep.no_importado.push({ que: "Autorizaciones", n: fuera.length, por: "la copia diaria no las importa y se quedan en la hoja (no frenan la copia): " + Object.entries(motivos).map(([k, n]) => k + " " + n).join(", "), filas: fuera.map((x) => x.fila), motivos, detalle: fuera });
    }
    T.autorizaciones.push(...auts.map((a) => ({ empresa_id: empresa2, ...a, origen: "importada_hoja", clave_id: "k1" })));
  }
  const cots = /* @__PURE__ */ new Map();
  for (const tel of tels) {
    for (const e of tel.historial) {
      const folio = String(e.folio || "").trim();
      if (!/^[A-Za-z0-9-]{1,24}$/.test(folio)) {
        rep.rechazar("cotizaciones", folio || "?", tel.etiqueta, "folio no válido");
        continue;
      }
      let disp = String(e.disp || "").trim(), inferido = false;
      if (!RE_DISP.test(disp)) disp = String(e.sello && e.sello.folio || "").split("@")[1] || "";
      if (!RE_DISP.test(disp)) {
        disp = tel.disp;
        inferido = true;
      }
      if (!RE_DISP.test(disp)) {
        disp = "HIST" + md5(folio + "|" + (e.cliente || "") + "|" + (e.fecha || "")).slice(0, 6);
        inferido = true;
      }
      const fg = folio + "@" + disp;
      const hitos = objeto(tel.hitos[folio]) || {};
      const fila = {
        empresa_id: empresa2,
        folio_global: fg,
        folio,
        disp,
        estado: "autorizada",
        datos: e,
        hitos,
        procedencia: { telefonos: [tel.etiqueta], ...inferido ? { disp_inferido: true } : {} }
      };
      if (inferido) rep.avisar("cotizaciones", fg, tel.etiqueta, "la cotización no dice de qué aparato es: se le puso " + disp + " (pide el id del aparato en Ajustes)");
      const prev = cots.get(fg);
      if (!prev) {
        cots.set(fg, fila);
        continue;
      }
      prev.procedencia.telefonos.push(tel.etiqueta);
      if (!igualJSON(prev.datos, e)) rep.conflicto("cotización distinta entre teléfonos", fg, `${prev.procedencia.telefonos[0]} y ${tel.etiqueta}: se queda la del primero`);
    }
    if (tel.disp && tel.folio) T._folioCot = [...T._folioCot || [], { disp: tel.disp, n: tel.folio }];
  }
  for (const a of T.autorizaciones) {
    if (cots.has(a.folio_global)) continue;
    const [folio, disp] = a.folio_global.split("@");
    cots.set(a.folio_global, {
      empresa_id: empresa2,
      folio_global: a.folio_global,
      folio,
      disp,
      estado: "autorizada",
      datos: { proy: a.proyecto, cliente: a.cliente, subtotal: Number(a.sub_calc_txt), huellaAuth: a.huella, items: [] },
      hitos: {},
      procedencia: { stub: "Autorizaciones", fila_hoja: a.fila_hoja },
      solicito: a.solicito
    });
  }
  T.cotizaciones.push(...cots.values());
  let maxV = 0;
  for (const nombre of ["Ventas", "Ventas (respaldo)", "Ventas (antes de realinear)"]) for (const { celdas } of filas(P2[nombre])) maxV = Math.max(maxV, numFolio(texto(celdas[0])));
  for (const { celdas } of filas(P2["Bitácora del puente"])) maxV = Math.max(maxV, numFolio(texto(celdas[2])));
  for (const { celdas } of filas(P2["Abonos comisión"])) maxV = Math.max(maxV, numFolio(texto(celdas[0])));
  let maxAlm = Number(vol.almacen_secuencia) || 0;
  for (const m of T.almacen_movimientos) maxAlm = Math.max(maxAlm, Number(m.procedencia.secuencia_hoja) || 0);
  const contadores = [{ clave: "V", n: maxV }, { clave: "P", n: maxP }, { clave: "alm", n: maxAlm }];
  const folioCot = /* @__PURE__ */ new Map();
  for (const x of T._folioCot || []) folioCot.set(x.disp, Math.max(folioCot.get(x.disp) || 0, x.n));
  for (const c of T.cotizaciones) {
    const n = Number((/(\d+)/.exec(c.folio) || [])[1]) || 0;
    if (!c.procedencia.stub) folioCot.set(c.disp, Math.max(folioCot.get(c.disp) || 0, n));
  }
  delete T._folioCot;
  for (const [disp, n] of [...folioCot].sort()) contadores.push({ clave: "folio_cot:" + disp, n });
  const cuenta = (nombre) => filas(P2[nombre]).filter((x) => x.celdas.some((v) => !vacia(v))).length;
  if (cuenta("Solicitudes de autorización")) rep.no_importado.push({ que: "Solicitudes de autorización", n: cuenta("Solicitudes de autorización"), por: "esta versión no las importa (son peticiones en curso; se vuelven a pedir en la plataforma)" });
  if (cuenta("Bitácora del puente")) rep.no_importado.push({ que: "Bitácora del puente", n: cuenta("Bitácora del puente"), por: "esta versión no la importa (es historia; queda en la hoja congelada)" });
  for (const tel of tels) {
    const otros = ["proyectos", "instalaciones", "materiales", "movimientos", "requerimientos", "constantes"].reduce((a, k) => a + tel[k].length, 0);
    if (!otros && !tel.historial.length) rep.avisar("teléfonos", tel.etiqueta, "-", "el respaldo no trae nada: ¿es el archivo correcto?");
  }
  for (const [tabla, lista] of Object.entries(T)) {
    for (const f of lista) {
      for (const [k, val] of Object.entries(f)) {
        if (typeof val === "string") {
          const l = limpioParaTexto(val);
          if (l.tenia) {
            f[k] = l.s;
            rep.avisar(tabla, f.id || f.folio_hoja || f.folio_global || "?", k, "traía un carácter NUL: se quitó");
          }
        }
      }
    }
  }
  rep.resumen = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.length]));
  rep.resumen.filas_de_ventas_leidas = ventas.length;
  rep.resumen.historicas = T.proyectos.filter((p) => p.historica).length;
  rep.resumen.con_cotizacion = T.proyectos.filter((p) => p.fuente === "cotizacion").length;
  rep.resumen.telefonos = tels.map((t) => ({ etiqueta: t.etiqueta, disp: t.disp, disp_inferido: t.disp_inferido, proyectos: t.proyectos.length, cotizaciones: t.historial.length }));
  delete rep.rechazar;
  delete rep.conflicto;
  delete rep.avisar;
  return { empresa: empresa2, tablas: T, contadores, esperado, remapeo, reporte: rep, gastos_en_hoja: gastosEnHoja };
}
function valorDeTelefono(p, k) {
  const v = p[k];
  if (k === "tel") return telefonoLimpio(v);
  if (k === "lat" || k === "lng") return pinValido(p.lat, p.lng) ? v : null;
  if (k === "plazo_k") return [1, 2, 3, 4, 5].includes(v) ? v : null;
  if (k === "entrega") return ["instalacion", "paqueteria", "recoleccion"].includes(v) ? v : null;
  if (k === "etapa") return ETAPAS2.includes(v) ? v : null;
  return v === void 0 || v === null ? "" : String(v);
}
var pinValido = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
function acotarProyecto(p, rep, donde) {
  if (!pinValido(p.lat, p.lng)) {
    if (p.lat !== null || p.lng !== null) rep.avisar("proyectos", p.folio_hoja || p.id, donde, `el pin «${p.lat},${p.lng}» no es válido: queda sin pin`);
    p.lat = null;
    p.lng = null;
  }
  for (const [k, tope] of [["nombre", 2e3], ["contacto", 2e3], ["negocio", 2e3], ["dir_texto", 2e3], ["notas", 4e4], ["maps_url", 2e3], ["geo_fuente", 200]]) {
    if (typeof p[k] === "string" && p[k].length > tope) {
      (p.procedencia.recortado ||= {})[k] = p[k];
      p[k] = p[k].slice(0, tope);
      rep.avisar("proyectos", p.folio_hoja || p.id, donde, `${k} pasa de ${tope} caracteres: se recorta y el texto completo queda en procedencia`);
    }
  }
}
function sellosValidos(s) {
  const o = {};
  for (const [k, v] of Object.entries(objeto(s) || {})) if (["etapa", "notas", "plazo_k", "tel", "dir_texto", "ubicacion", "entrega", "instalacion"].includes(k) && ms(v)) o[k] = ms(v);
  return o;
}
function numONull(v) {
  if (v === null || v === void 0 || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
var RE_ID_GASTO = /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,79}$/;
var planoGasto = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
var sinApostrofo = (s) => /^'[=+\-@]/.test(s) ? s.slice(1) : s;
function categoriaDeGasto(v) {
  const p = planoGasto(v);
  return p && CATEGORIAS_GASTO.find((c) => planoGasto(c) === p) || "Otros";
}
function diaDeGasto(v) {
  const s = texto(v).trim();
  let iso = "";
  if (s.length === 10 || /^\d{4}-\d{2}-\d{2}T/.test(s)) iso = s.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) iso = m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!p) return "";
  const [a, me, d] = [Number(p[1]), Number(p[2]), Number(p[3])];
  const ok = a >= 2e3 && a <= 2100 && me >= 1 && me <= 12 && d >= 1 && d <= new Date(Date.UTC(a, me, 0)).getUTCDate();
  return ok ? iso : "";
}
function montoDeGasto(v) {
  const r2 = (n2) => Math.round((n2 + Number.EPSILON) * 100) / 100;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? r2(v) : 0;
  const s = texto(v);
  if (/^\s*[-−]/.test(s)) return 0;
  const limpio = s.replace(/[^\d.]/g, "");
  const i = limpio.indexOf(".");
  const t = i < 0 ? limpio : limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/\./g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? r2(n) : 0;
}
function siNoDeGasto(v) {
  if (v === true) return true;
  return ["si", "true", "x", "anulado", "1"].includes(planoGasto(v));
}
var msDeCelda = (v) => esFecha(v) ? ms(v.$ms) : typeof v === "number" ? ms(v) : 0;
function partirNombre(nombre) {
  const limpio = String(nombre || "").replace(/\s*\([^()]*\)\s*$/, "").trim();
  const i = limpio.indexOf(" - ");
  if (i < 0) return { contacto: "", negocio: limpio };
  return { contacto: limpio.slice(0, i).trim(), negocio: limpio.slice(i + 3).trim() };
}

// scripts/importador/sql.mjs
var LOTE = 200;
var TIPO_SQL = { t: "text", n: "numeric", f: "double precision", i: "integer", b: "boolean", d: "date", j: "jsonb", a: "text[]", ts: "timestamptz", bi: "bigint" };
var cadena2 = (s) => "'" + String(s).replace(/'/g, "''") + "'";
var RE_NO_GUARDABLE = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
var guardable = (s) => String(s).replace(RE_NO_GUARDABLE, (m) => m === "\0" ? "" : "�");
function profundo(v) {
  if (typeof v === "string") return guardable(v);
  if (Array.isArray(v)) return v.map(profundo);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [guardable(k), profundo(x)]));
  return v;
}
function lit(v, tipo) {
  if (v === null || v === void 0) return "NULL::" + TIPO_SQL[tipo];
  switch (tipo) {
    case "t":
      return cadena2(guardable(v)) + "::text";
    case "n":
    case "f":
    case "i":
    case "bi": {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error("número no finito: " + v);
      return cadena2(String(n)) + "::" + TIPO_SQL[tipo];
    }
    case "b":
      return v ? "true" : "false";
    case "d":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new Error("fecha no válida: " + v);
      return cadena2(v) + "::date";
    case "j":
      return cadena2(JSON.stringify(profundo(v))) + "::jsonb";
    case "a":
      return "ARRAY[" + v.map((x) => cadena2(guardable(x))).join(",") + "]::text[]";
    case "ts": {
      const n = Number(v);
      return n > 0 ? `to_timestamp(${Math.trunc(n)} / 1000.0)` : "NULL::timestamptz";
    }
    default:
      throw new Error("tipo desconocido: " + tipo);
  }
}
var COLS = {
  proyectos: [
    ["id", "t"],
    ["empresa_id", "t"],
    ["folio_hoja", "t"],
    ["folio_global", "t"],
    ["folio_local", "t"],
    ["dispositivo", "t"],
    ["fuente", "t"],
    ["historica", "b"],
    ["nombre", "t"],
    ["contacto", "t"],
    ["negocio", "t"],
    ["tel", "t"],
    ["etapa", "t"],
    ["tipo_trabajo", "a"],
    ["fecha_anticipo", "d"],
    ["compromiso_texto", "t"],
    ["dir_texto", "t"],
    ["entrecalles", "t"],
    ["maps_url", "t"],
    ["lat", "f"],
    ["lng", "f"],
    ["geo_fuente", "t"],
    ["ubicacion_pendiente", "b"],
    ["entrega", "t"],
    ["plazo_k", "i"],
    ["notas", "t"],
    ["estatus", "t"],
    ["iva", "b"],
    ["fecha_instalacion_hist", "d"],
    ["sellos", "j"],
    ["origen", "j"],
    ["procedencia", "j"],
    ["creado_ms", "ts"]
  ],
  ventas_dinero: [
    ["proyecto_id", "t"],
    ["empresa_id", "t"],
    ["subtotal", "n"],
    ["anticipo", "n"],
    ["liquidacion", "n"],
    ["cuenta", "t"],
    ["fecha_liquidacion", "d"],
    ["pct_comision", "n"],
    ["precio_auth", "n"],
    ["origen", "j"],
    ["venta_local", "j"],
    ["procedencia", "j"]
  ],
  abonos: [["empresa_id", "t"], ["folio_hoja", "t"], ["importe", "n"], ["fecha", "d"], ["nota", "t"], ["pago_id", "t"], ["tipo", "t"], ["op_id", "t"], ["procedencia", "j"]],
  miembros: [["empresa_id", "t"], ["correo", "t"], ["area", "t"], ["nota", "t"]],
  instalaciones: [
    ["id", "t"],
    ["empresa_id", "t"],
    ["proyecto_id", "t"],
    ["fecha", "d"],
    ["hora", "t"],
    ["ventana", "t"],
    ["duracion_min", "i"],
    ["estado", "t"],
    ["movida", "i"],
    ["notas", "t"],
    ["procedencia", "j"],
    ["creado_ms", "ts"]
  ],
  materiales: [
    ["empresa_id", "t"],
    ["id", "t"],
    ["nombre", "t"],
    ["familia", "t"],
    ["unidad_compra", "t"],
    ["unidad_consumo", "t"],
    ["medida", "t"],
    ["factor", "n"],
    ["factor_origen", "t"],
    ["largo_cm", "n"],
    ["ancho_cm", "n"],
    ["espesor", "t"],
    ["merma_pct", "n"],
    ["fraccionable", "b"],
    ["min_compra", "n"],
    ["min_stock", "n"],
    ["proveedor", "t"],
    ["tel_proveedor", "t"],
    ["activo", "b"],
    ["sellos", "j"],
    ["procedencia", "j"],
    ["creado_ms", "ts"]
  ],
  almacen_costos: [["empresa_id", "t"], ["material_id", "t"], ["movimiento_id", "t"], ["importe", "n"], ["sello", "bi"]],
  constantes: [["empresa_id", "t"], ["clave", "t"], ["valor", "n"], ["unidad", "t"], ["nota", "t"], ["version", "t"], ["actualizado_por", "t"]],
  requerimientos: [
    ["empresa_id", "t"],
    ["id", "t"],
    ["proyecto_id", "t"],
    ["material_id", "t"],
    ["cantidad_consumo", "n"],
    ["unidad_consumo", "t"],
    ["cantidad_compra", "n"],
    ["unidad_compra", "t"],
    ["partidas", "j"],
    ["formula", "t"],
    ["confianza", "t"],
    ["requiere", "t"],
    ["constantes_version", "t"],
    ["cantidad_ajustada", "n"],
    ["motivo_ajuste", "t"],
    ["ajustado_por", "t"],
    ["ajustado_ms", "bi"],
    ["estado", "t"],
    ["sellos", "j"],
    ["procedencia", "j"],
    ["creado_ms", "ts"]
  ],
  almacen_movimientos: [
    ["orden", "i"],
    ["empresa_id", "t"],
    ["id", "t"],
    ["material_id", "t"],
    ["tipo", "t"],
    ["cantidad", "n"],
    ["unidad_compra", "t"],
    ["origen", "t"],
    ["nota", "t"],
    ["usuario", "t"],
    ["rol", "t"],
    ["dispositivo", "t"],
    ["proyecto_id", "t"],
    ["requerimiento_id", "t"],
    ["firma", "t"],
    ["ts", "bi"],
    ["procedencia", "j"],
    ["creado_ms", "ts"]
  ],
  autorizaciones: [
    ["orden", "i"],
    ["empresa_id", "t"],
    ["folio_global", "t"],
    ["huella", "t"],
    ["sub_calc_txt", "t"],
    ["precio_auth_txt", "t"],
    ["items_auth", "t"],
    ["total_txt", "t"],
    ["proyecto", "t"],
    ["autorizo", "t"],
    ["ts_iso", "t"],
    ["renglones", "t"],
    ["cliente", "t"],
    ["ajuste_pct", "n"],
    ["solicito", "t"],
    ["codigo", "t"],
    ["firma", "t"],
    ["estado", "t"],
    ["nota", "t"],
    ["clave_id", "t"],
    ["codificacion", "t"],
    ["origen", "t"],
    ["fila_hoja", "i"]
  ],
  cotizaciones: [["empresa_id", "t"], ["folio_global", "t"], ["folio", "t"], ["disp", "t"], ["estado", "t"], ["datos", "j"], ["hitos", "j"], ["procedencia", "j"]],
  tarifas: [
    ["empresa_id", "t"],
    ["grupo", "t"],
    ["clave", "t"],
    ["nombre", "t"],
    ["precio", "n"],
    ["como", "t"],
    ["visible", "b"],
    ["orden", "i"],
    ["detalle", "t"],
    ["actualizado_por", "t"],
    ["actualizado_ms", "ts"]
  ],
  gastos: [
    ["empresa_id", "t"],
    ["id", "t"],
    ["fecha", "d"],
    ["concepto", "t"],
    ["categoria", "t"],
    ["monto", "n"],
    ["cuenta", "t"],
    ["folio", "t"],
    ["registro_por", "t"],
    ["registrado_ms", "ts"],
    ["anulado", "b"],
    ["anulo", "t"],
    ["anulado_ms", "ts"],
    ["subio", "t"],
    ["fila_hoja", "i"],
    ["procedencia", "j"]
  ]
};
var ESCRIBIR = {
  proyectos: `
    -- Una venta que en la base nació en el cotizador (fuente «cotizacion»: la dio de alta la plataforma, con la sombra) sigue siéndolo
    -- aunque la copia, que no lleva teléfonos, la vea como de la hoja: la copia no sabe de dónde vino y la base sí. Sin esto, cada venta
    -- que la sombra daba de alta era un conflicto la madrugada siguiente y el día no cuadraba (hallazgo del 2026-10-24). Va ANTES de la
    -- regla de abajo, que pide la misma fuente en los dos lados.
    update _lote l set fuente = p.fuente
      from public.proyectos p
     where p.empresa_id = l.empresa_id and p.id = l.id and p.fuente = 'cotizacion' and l.fuente = 'hoja' and not p.historica;
    -- Una venta que en la base ya es VIVA sigue viva aunque la hoja ahora la haría histórica (pasó de FABRICACION o REPARANDO a
    -- COBRANDO o LIQUIDADO sin folio de cotización: el ciclo normal de una venta). Decidido el 2026-10-16 (DECISIONES, «Transición»,
    -- opción a). La base no deja cambiar \`historica\` y eso NO se afloja: la fila entra como viva, con su estatus y su dinero de la
    -- hoja, la etapa de la base si la hoja no trae una (una viva siempre tiene etapa) y sin fecha de instalación de histórica.
    update _lote l set historica = false, etapa = coalesce(l.etapa, p.etapa), fecha_instalacion_hist = null
      from public.proyectos p
     where p.empresa_id = l.empresa_id and p.id = l.id and not p.historica and l.historica and p.fuente = l.fuente;
    insert into _imp_cambios (tabla, llave, accion)
      select 'proyectos', l.id, 'conflicto: su folio ya es de ' || p.id
        from _lote l join public.proyectos p on p.empresa_id = l.empresa_id and p.id <> l.id
                                              and (p.folio_hoja = l.folio_hoja or p.folio_global = l.folio_global);
    -- lo que la base no deja cambiar de un proyecto (de histórica a viva, de dónde viene): se reporta y la fila no se toca
    insert into _imp_cambios (tabla, llave, accion)
      select 'proyectos', l.id, 'conflicto: en la base es ' || case when p.historica then 'histórica' else 'viva' end || ' de ' || p.fuente
                                || ' y ahora sería ' || case when l.historica then 'histórica' else 'viva' end || ' de ' || l.fuente
        from _lote l join public.proyectos p on p.empresa_id = l.empresa_id and p.id = l.id
       where (p.historica, p.fuente) is distinct from (l.historica, l.fuente);
    with w as (
      insert into public.proyectos as t (id, empresa_id, folio_hoja, folio_global, folio_local, dispositivo, fuente, historica, nombre, contacto, negocio, tel,
             etapa, tipo_trabajo, fecha_anticipo, compromiso_texto, dir_texto, entrecalles, maps_url, lat, lng, geo_fuente, ubicacion_pendiente, entrega, plazo_k,
             notas, estatus, iva, fecha_instalacion_hist, sellos, origen_obra, procedencia, created_at)
      select l.id, l.empresa_id, l.folio_hoja, l.folio_global, l.folio_local, l.dispositivo, l.fuente, l.historica, l.nombre, l.contacto, l.negocio, l.tel,
             l.etapa, l.tipo_trabajo, l.fecha_anticipo, l.compromiso_texto, l.dir_texto, l.entrecalles, l.maps_url, l.lat, l.lng, l.geo_fuente, l.ubicacion_pendiente,
             l.entrega, l.plazo_k, l.notas, l.estatus, l.iva, l.fecha_instalacion_hist, l.sellos,
             case when l.origen is null then null else (select o.obra from interno.partir_origen(l.origen) o) end,
             l.procedencia, coalesce(l.creado_ms, now())
        from _lote l
       where not exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id <> l.id
                                                          and (p.folio_hoja = l.folio_hoja or p.folio_global = l.folio_global))
         and not exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.id
                                                          and (p.historica, p.fuente) is distinct from (l.historica, l.fuente))
      on conflict (id) do update set
             folio_hoja = coalesce(t.folio_hoja, excluded.folio_hoja), folio_global = coalesce(t.folio_global, excluded.folio_global),
             nombre = excluded.nombre, contacto = excluded.contacto, negocio = excluded.negocio, tel = excluded.tel, etapa = excluded.etapa,
             tipo_trabajo = excluded.tipo_trabajo, fecha_anticipo = excluded.fecha_anticipo, compromiso_texto = excluded.compromiso_texto,
             dir_texto = excluded.dir_texto, entrecalles = excluded.entrecalles, maps_url = excluded.maps_url, lat = excluded.lat, lng = excluded.lng,
             geo_fuente = excluded.geo_fuente, ubicacion_pendiente = excluded.ubicacion_pendiente, entrega = excluded.entrega, plazo_k = excluded.plazo_k,
             notas = excluded.notas, estatus = excluded.estatus, iva = excluded.iva, fecha_instalacion_hist = excluded.fecha_instalacion_hist,
             sellos = excluded.sellos, origen_obra = excluded.origen_obra, procedencia = excluded.procedencia
       where (t.folio_hoja, t.folio_global, t.nombre, t.contacto, t.negocio, t.tel, t.etapa, t.tipo_trabajo, t.fecha_anticipo, t.compromiso_texto, t.dir_texto,
              t.entrecalles, t.maps_url, t.lat, t.lng, t.geo_fuente, t.ubicacion_pendiente, t.entrega, t.plazo_k, t.notas, t.estatus, t.iva,
              t.fecha_instalacion_hist, t.sellos, t.origen_obra, t.procedencia)
             is distinct from
             (coalesce(t.folio_hoja, excluded.folio_hoja), coalesce(t.folio_global, excluded.folio_global), excluded.nombre, excluded.contacto, excluded.negocio,
              excluded.tel, excluded.etapa, excluded.tipo_trabajo, excluded.fecha_anticipo, excluded.compromiso_texto, excluded.dir_texto, excluded.entrecalles,
              excluded.maps_url, excluded.lat, excluded.lng, excluded.geo_fuente, excluded.ubicacion_pendiente, excluded.entrega, excluded.plazo_k, excluded.notas,
              excluded.estatus, excluded.iva, excluded.fecha_instalacion_hist, excluded.sellos, excluded.origen_obra, excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'proyectos', llave, case when nuevo then 'alta' else 'cambio' end from w;`,
  ventas_dinero: `
    with w as (
      insert into public.ventas_dinero as t (proyecto_id, empresa_id, subtotal, anticipo, liquidacion, cuenta, fecha_liquidacion, pct_comision, precio_auth,
             origen_dinero, procedencia)
      select l.proyecto_id, l.empresa_id, l.subtotal, l.anticipo, l.liquidacion, l.cuenta, l.fecha_liquidacion, l.pct_comision, l.precio_auth,
             case when l.origen is null and l.venta_local is null then null
                  else case when l.origen is null then '{}'::jsonb else (select o.dinero from interno.partir_origen(l.origen) o) end
                       || case when l.venta_local is null then '{}'::jsonb else jsonb_build_object('venta', l.venta_local) end end,
             l.procedencia
        from _lote l
       where exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.proyecto_id and p.folio_hoja is not null)
      on conflict (proyecto_id) do update set
             subtotal = excluded.subtotal, anticipo = excluded.anticipo, liquidacion = excluded.liquidacion, cuenta = excluded.cuenta,
             fecha_liquidacion = excluded.fecha_liquidacion, pct_comision = excluded.pct_comision, precio_auth = excluded.precio_auth,
             origen_dinero = excluded.origen_dinero, procedencia = excluded.procedencia
       where (t.subtotal, t.anticipo, t.liquidacion, t.cuenta, t.fecha_liquidacion, t.pct_comision, t.precio_auth, t.origen_dinero, t.procedencia)
             is distinct from (excluded.subtotal, excluded.anticipo, excluded.liquidacion, excluded.cuenta, excluded.fecha_liquidacion,
                               excluded.pct_comision, excluded.precio_auth, excluded.origen_dinero, excluded.procedencia)
      returning t.proyecto_id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'ventas_dinero', llave, case when nuevo then 'alta' else 'cambio' end from w;`,
  abonos: `
    with w as (
      insert into public.abonos as t (empresa_id, folio_hoja, importe, fecha, nota, pago_id, tipo, op_id, procedencia)
      select l.empresa_id, l.folio_hoja, l.importe, l.fecha, l.nota, l.pago_id, l.tipo, l.op_id, l.procedencia from _lote l
      on conflict (empresa_id, op_id, folio_hoja) where op_id is not null do nothing
      returning t.op_id as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'abonos', llave, 'alta' from w;`,
  miembros: `
    with w as (
      insert into public.miembros as t (empresa_id, correo, area, nota)
      select l.empresa_id, l.correo, l.area, l.nota from _lote l
      on conflict (empresa_id, correo) do nothing
      returning t.correo as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'miembros', llave, 'alta' from w;`,
  instalaciones: `
    -- una cita viva por proyecto: la que la base ya tenga y el plan no traiga (p. ej. la «hoja-V-…» de una corrida anterior sin teléfonos)
    -- se cancela antes de escribir la viva del plan, sin tocar el calendario
    with w as (
      update public.instalaciones t set estado = 'cancelada', procedencia = t.procedencia || jsonb_build_object('fusionada_en', l.id)
        from _lote l
       where l.estado <> 'cancelada' and t.empresa_id = l.empresa_id and t.proyecto_id = l.proyecto_id and t.id <> l.id
         and t.estado <> 'cancelada' and t.deleted_at is null
      returning t.id as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'instalaciones', llave, 'cambio: cancelada (otra cita es la viva)' from w;
    with w as (
      insert into public.instalaciones as t (id, empresa_id, proyecto_id, fecha, hora, ventana, duracion_min, estado, movida, uid_ics, notas, procedencia, created_at)
      select l.id, l.empresa_id, l.proyecto_id, l.fecha, l.hora, l.ventana, l.duracion_min, l.estado, l.movida, 'inst-' || l.id || '@al3d.mx', l.notas,
             l.procedencia, coalesce(l.creado_ms, now())
        from _lote l
       where exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.proyecto_id)
       order by (l.estado <> 'cancelada'), l.id
      on conflict (id) do update set
             fecha = excluded.fecha, hora = excluded.hora, ventana = excluded.ventana, duracion_min = excluded.duracion_min, estado = excluded.estado,
             movida = greatest(t.movida, excluded.movida), notas = excluded.notas, procedencia = excluded.procedencia
       where (t.fecha, t.hora, t.ventana, t.duracion_min, t.estado, t.movida, t.notas, t.procedencia)
             is distinct from (excluded.fecha, excluded.hora, excluded.ventana, excluded.duracion_min, excluded.estado,
                               greatest(t.movida, excluded.movida), excluded.notas, excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'instalaciones', llave, case when nuevo then 'alta' else 'cambio' end from w;`,
  materiales: `
    with w as (
      insert into public.materiales as t (empresa_id, id, nombre, familia, unidad_compra, unidad_consumo, medida, factor, factor_origen, largo_cm, ancho_cm,
             espesor, merma_pct, fraccionable, min_compra, min_stock, proveedor, tel_proveedor, activo, sellos, procedencia, created_at)
      select l.empresa_id, l.id, l.nombre, l.familia, l.unidad_compra, l.unidad_consumo, l.medida, l.factor, l.factor_origen, l.largo_cm, l.ancho_cm,
             l.espesor, l.merma_pct, l.fraccionable, l.min_compra, l.min_stock, l.proveedor, l.tel_proveedor, l.activo, l.sellos, l.procedencia,
             coalesce(l.creado_ms, now())
        from _lote l
      on conflict (empresa_id, id) do update set
             nombre = excluded.nombre, familia = excluded.familia, unidad_compra = excluded.unidad_compra, unidad_consumo = excluded.unidad_consumo,
             medida = excluded.medida, factor = excluded.factor, factor_origen = excluded.factor_origen, largo_cm = excluded.largo_cm,
             ancho_cm = excluded.ancho_cm, espesor = excluded.espesor, merma_pct = excluded.merma_pct, fraccionable = excluded.fraccionable,
             min_compra = excluded.min_compra, min_stock = excluded.min_stock, proveedor = excluded.proveedor, tel_proveedor = excluded.tel_proveedor,
             activo = excluded.activo, sellos = excluded.sellos, procedencia = excluded.procedencia
       where (t.nombre, t.familia, t.unidad_compra, t.unidad_consumo, t.medida, t.factor, t.factor_origen, t.largo_cm, t.ancho_cm, t.espesor, t.merma_pct,
              t.fraccionable, t.min_compra, t.min_stock, t.proveedor, t.tel_proveedor, t.activo, t.sellos, t.procedencia)
             is distinct from (excluded.nombre, excluded.familia, excluded.unidad_compra, excluded.unidad_consumo, excluded.medida, excluded.factor,
                               excluded.factor_origen, excluded.largo_cm, excluded.ancho_cm, excluded.espesor, excluded.merma_pct, excluded.fraccionable,
                               excluded.min_compra, excluded.min_stock, excluded.proveedor, excluded.tel_proveedor, excluded.activo, excluded.sellos,
                               excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'materiales', llave, case when nuevo then 'alta' else 'cambio' end from w;`,
  almacen_costos: `
    with w as (
      insert into public.almacen_costos as t (empresa_id, material_id, importe, sello)
      select l.empresa_id, l.material_id, l.importe, l.sello from _lote l
       where l.material_id is not null and exists (select 1 from public.materiales m where m.empresa_id = l.empresa_id and m.id = l.material_id)
      on conflict (empresa_id, material_id) where material_id is not null do update set importe = excluded.importe, sello = excluded.sello
       where (t.importe, t.sello) is distinct from (excluded.importe, excluded.sello)
      returning t.material_id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'almacen_costos', llave, case when nuevo then 'alta' else 'cambio' end from w;
    with w as (
      insert into public.almacen_costos as t (empresa_id, movimiento_id, importe, sello)
      select l.empresa_id, l.movimiento_id, l.importe, l.sello from _lote l
       where l.movimiento_id is not null and exists (select 1 from public.almacen_movimientos m where m.empresa_id = l.empresa_id and m.id = l.movimiento_id)
      on conflict (empresa_id, movimiento_id) where movimiento_id is not null do update set importe = excluded.importe, sello = excluded.sello
       where (t.importe, t.sello) is distinct from (excluded.importe, excluded.sello)
      returning t.movimiento_id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'almacen_costos', llave, case when nuevo then 'alta' else 'cambio' end from w;`,
  constantes: `
    with w as (
      insert into public.constantes as t (empresa_id, clave, valor, unidad, nota, version, actualizado_por)
      select l.empresa_id, l.clave, l.valor, l.unidad, l.nota, l.version, l.actualizado_por from _lote l
      on conflict (empresa_id, clave) do update set valor = excluded.valor, unidad = excluded.unidad, nota = excluded.nota,
             version = excluded.version, actualizado_por = excluded.actualizado_por
       where (t.valor, t.unidad, t.nota, t.version, t.actualizado_por)
             is distinct from (excluded.valor, excluded.unidad, excluded.nota, excluded.version, excluded.actualizado_por)
      returning t.clave as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'constantes', llave, case when nuevo then 'alta' else 'cambio' end from w;`,
  requerimientos: `
    with w as (
      insert into public.requerimientos as t (empresa_id, id, proyecto_id, material_id, cantidad_consumo, unidad_consumo, cantidad_compra, unidad_compra,
             partidas, formula, confianza, requiere, constantes_version, cantidad_ajustada, motivo_ajuste, ajustado_por, ajustado_ms, estado, sellos,
             procedencia, created_at)
      select l.empresa_id, l.id, l.proyecto_id, l.material_id, l.cantidad_consumo, l.unidad_consumo, l.cantidad_compra, l.unidad_compra, l.partidas,
             l.formula, l.confianza, l.requiere, l.constantes_version, l.cantidad_ajustada, l.motivo_ajuste, l.ajustado_por, l.ajustado_ms, l.estado,
             l.sellos, l.procedencia, coalesce(l.creado_ms, now())
        from _lote l
       where exists (select 1 from public.proyectos p where p.empresa_id = l.empresa_id and p.id = l.proyecto_id)
      on conflict (empresa_id, id) do update set
             cantidad_consumo = excluded.cantidad_consumo, unidad_consumo = excluded.unidad_consumo, cantidad_compra = excluded.cantidad_compra,
             unidad_compra = excluded.unidad_compra, partidas = excluded.partidas, formula = excluded.formula, confianza = excluded.confianza,
             requiere = excluded.requiere, constantes_version = excluded.constantes_version, cantidad_ajustada = excluded.cantidad_ajustada,
             motivo_ajuste = excluded.motivo_ajuste, ajustado_por = excluded.ajustado_por, ajustado_ms = excluded.ajustado_ms, estado = excluded.estado,
             sellos = excluded.sellos, procedencia = excluded.procedencia
       where (t.cantidad_consumo, t.unidad_consumo, t.cantidad_compra, t.unidad_compra, t.partidas, t.formula, t.confianza, t.requiere,
              t.constantes_version, t.cantidad_ajustada, t.motivo_ajuste, t.ajustado_por, t.ajustado_ms, t.estado, t.sellos, t.procedencia)
             is distinct from (excluded.cantidad_consumo, excluded.unidad_consumo, excluded.cantidad_compra, excluded.unidad_compra, excluded.partidas,
                               excluded.formula, excluded.confianza, excluded.requiere, excluded.constantes_version, excluded.cantidad_ajustada,
                               excluded.motivo_ajuste, excluded.ajustado_por, excluded.ajustado_ms, excluded.estado, excluded.sellos, excluded.procedencia)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'requerimientos', llave, case when nuevo then 'alta' else 'cambio' end from w;`,
  almacen_movimientos: `
    with w as (
      insert into public.almacen_movimientos as t (empresa_id, id, material_id, tipo, cantidad, unidad_compra, origen, nota, usuario, rol, dispositivo,
             proyecto_id, requerimiento_id, firma, ts, procedencia, created_at)
      select l.empresa_id, l.id, l.material_id, l.tipo, l.cantidad, l.unidad_compra, l.origen, l.nota, l.usuario, l.rol, l.dispositivo,
             l.proyecto_id, l.requerimiento_id, l.firma, l.ts, l.procedencia, coalesce(l.creado_ms, now())
        from _lote l order by l.orden
      on conflict (empresa_id, id) do nothing
      returning t.id as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'almacen_movimientos', llave, 'alta' from w;`,
  autorizaciones: `
    with w as (
      update public.autorizaciones t set estado = l.estado
        from _lote l
       where t.empresa_id = l.empresa_id and t.folio_global = l.folio_global and t.firma = l.firma
         and t.estado = 'vigente' and l.estado <> 'vigente'
      returning t.id::text as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'autorizaciones', llave, 'cambio' from w;
    with w as (
      insert into public.autorizaciones as t (empresa_id, folio_global, huella, sub_calc_txt, precio_auth_txt, items_auth, total_txt, proyecto, autorizo,
             ts_iso, renglones, cliente, ajuste_pct, solicito, codigo, firma, estado, nota, clave_id, codificacion, origen, fila_hoja)
      select l.empresa_id, l.folio_global, l.huella, l.sub_calc_txt, l.precio_auth_txt, l.items_auth, l.total_txt, l.proyecto, l.autorizo,
             l.ts_iso, l.renglones, l.cliente, l.ajuste_pct, l.solicito, l.codigo, l.firma, l.estado, l.nota, l.clave_id, l.codificacion, l.origen, l.fila_hoja
        from _lote l
       where not exists (select 1 from public.autorizaciones a where a.empresa_id = l.empresa_id and a.folio_global = l.folio_global and a.firma = l.firma)
       order by (l.estado = 'vigente'), l.orden
      returning t.id::text as llave)
    insert into _imp_cambios (tabla, llave, accion) select 'autorizaciones', llave, 'alta' from w;`,
  cotizaciones: `
    -- Un TALÓN (la cotización que se arma de una fila de «Autorizaciones» sin teléfono: procedencia.stub) no pisa una que no es talón: la
    -- que subió el aparato que emitió el folio (subida_unica, 0021) se queda. Sin esto, la copia diaria la volvía talón cada madrugada.
    with w as (
      insert into public.cotizaciones as t (empresa_id, folio_global, folio, disp, estado, datos, hitos, procedencia)
      select l.empresa_id, l.folio_global, l.folio, l.disp, l.estado, interno.datos_cotizacion(l.datos), l.hitos, l.procedencia from _lote l
      on conflict (empresa_id, folio_global) do update set datos = excluded.datos, hitos = excluded.hitos, procedencia = excluded.procedencia
       where (t.datos, t.hitos, t.procedencia) is distinct from (excluded.datos, excluded.hitos, excluded.procedencia)
         and (not (excluded.procedencia ? 'stub') or t.procedencia ? 'stub')
      returning t.folio_global as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'cotizaciones', llave, case when nuevo then 'alta' else 'cambio' end from w;`
};
ESCRIBIR.tarifas = `
    with w as (
      insert into public.tarifas as t (empresa_id, grupo, clave, nombre, precio, como, visible, orden, detalle, actualizado_por, actualizado_en)
      select l.empresa_id, l.grupo, l.clave, l.nombre, l.precio, l.como, l.visible, l.orden, l.detalle, l.actualizado_por, l.actualizado_ms from _lote l
      on conflict (empresa_id, grupo, clave) do update set nombre = excluded.nombre, precio = excluded.precio, como = excluded.como,
             visible = excluded.visible, orden = excluded.orden, detalle = excluded.detalle, actualizado_por = excluded.actualizado_por,
             actualizado_en = excluded.actualizado_en
       where (t.nombre, t.precio, t.como, t.visible, t.orden, t.detalle, t.actualizado_por, t.actualizado_en)
             is distinct from (excluded.nombre, excluded.precio, excluded.como, excluded.visible, excluded.orden, excluded.detalle,
                               excluded.actualizado_por, excluded.actualizado_en)
      returning t.grupo || ':' || t.clave as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'tarifas', llave, case when nuevo then 'alta' else 'cambio' end from w;`;
ESCRIBIR.gastos = `
    with w as (
      insert into public.gastos as t (empresa_id, id, fecha, concepto, categoria, monto, cuenta, folio, registro_por, registrado_en, anulado, anulo,
             anulado_en, subio, fila_hoja, procedencia)
      select l.empresa_id, l.id, l.fecha, l.concepto, l.categoria, l.monto, l.cuenta, l.folio, l.registro_por, l.registrado_ms, l.anulado, l.anulo,
             l.anulado_ms, l.subio, l.fila_hoja, l.procedencia from _lote l
      on conflict (empresa_id, id) do update set fecha = excluded.fecha, concepto = excluded.concepto, categoria = excluded.categoria,
             monto = excluded.monto, cuenta = excluded.cuenta, folio = excluded.folio, registro_por = excluded.registro_por,
             registrado_en = excluded.registrado_en, anulado = excluded.anulado, anulo = excluded.anulo, anulado_en = excluded.anulado_en,
             subio = excluded.subio, fila_hoja = excluded.fila_hoja, procedencia = excluded.procedencia, deleted_at = null
       where (t.fecha, t.concepto, t.categoria, t.monto, t.cuenta, t.folio, t.registro_por, t.registrado_en, t.anulado, t.anulo, t.anulado_en,
              t.subio, t.fila_hoja, t.procedencia, t.deleted_at)
             is distinct from (excluded.fecha, excluded.concepto, excluded.categoria, excluded.monto, excluded.cuenta, excluded.folio,
                               excluded.registro_por, excluded.registrado_en, excluded.anulado, excluded.anulo, excluded.anulado_en, excluded.subio,
                               excluded.fila_hoja, excluded.procedencia, null::timestamptz)
      returning t.id as llave, (t.xmax = 0) as nuevo)
    insert into _imp_cambios (tabla, llave, accion) select 'gastos', llave, case when nuevo then 'alta' else 'cambio' end from w;`;
var ORDEN2 = [
  "proyectos",
  "ventas_dinero",
  "abonos",
  "miembros",
  "instalaciones",
  "materiales",
  "constantes",
  "requerimientos",
  "almacen_movimientos",
  "almacen_costos",
  "autorizaciones",
  "cotizaciones",
  "tarifas",
  "gastos"
];
function lotes(tabla, filas2, conTransaccion) {
  const cols = COLS[tabla];
  const [ini, fin] = conTransaccion ? ["begin;\n", "\ncommit;"] : ["", ""];
  const out = [];
  for (let i = 0; i < filas2.length; i += LOTE) {
    const trozo = filas2.slice(i, i + LOTE);
    const valores = trozo.map((f, k) => "  (" + cols.map(([c, tipo]) => lit(c === "orden" ? i + k : f[c], tipo)).join(", ") + ")").join(",\n");
    out.push(`-- ${tabla}: filas ${i + 1} a ${i + trozo.length}
${ini}drop table if exists _lote;
create temp table _lote as
select * from (values
${valores}
) as v(${cols.map((c) => c[0]).join(", ")});${ESCRIBIR[tabla]}${fin}
`);
  }
  return out;
}
function sqlDeImportacion(plan, { hecho = "", ensayo = false, externa = false } = {}) {
  const e = cadena2(plan.empresa);
  const propias = !ensayo && !externa;
  const partes = [
    `-- Importación de la hoja y los teléfonos a Supabase (scripts/importar-hoja.mjs). ${hecho}`,
    "-- IDEMPOTENTE: correrlo dos veces con las mismas entradas no cambia nada la segunda vez.",
    "-- Es para correrse MIENTRAS LA HOJA ES LA FUENTE (hasta la fase 4): lo que alguien haya cambiado en la base desde la plataforma, lo pisa con la hoja.",
    "-- CONTIENE DATOS DE CLIENTES: no lo subas al repositorio ni lo mandes por chat.",
    ...ensayo ? ["-- ENSAYO: todo va en UNA transacción que al final se DESHACE (rollback). No queda nada escrito.", "begin;"] : [],
    "",
    "create temp table if not exists _imp_cambios (tabla text not null, llave text, accion text not null);",
    "truncate _imp_cambios;",
    ""
  ];
  for (const t of ORDEN2) {
    let filas2 = plan.tablas[t] || [];
    if (t === "instalaciones") filas2 = [...filas2.filter((f) => f.estado === "cancelada"), ...filas2.filter((f) => f.estado !== "cancelada")];
    partes.push(...lotes(t, filas2, propias));
  }
  const ops = (plan.tablas.abonos || []).map((a) => a.op_id);
  partes.push(`-- abonos de una corrida anterior que ya no están en la hoja
insert into _imp_cambios (tabla, llave, accion)
  select 'abonos', a.folio_hoja || ' ' || a.importe || ' (fila ' || coalesce(a.procedencia->>'fila_hoja', '?') || ')',
         'conflicto: ya no está en la hoja; si se corrigió, va una corrección a mano'
    from public.abonos a
   where a.empresa_id = ${e} and a.op_id like 'hoja:abono:%' and a.op_id <> all (${lit(ops, "a")});
`);
  if (Array.isArray(plan.gastos_en_hoja)) {
    partes.push(`-- gastos que ya no están en la hoja: lápida (deleted_at), nunca borrado
${propias ? "begin;" : ""}
with w as (
  update public.gastos g set deleted_at = now()
   where g.empresa_id = ${e} and g.deleted_at is null and g.id <> all (${lit(plan.gastos_en_hoja, "a")})
  returning g.id as llave)
insert into _imp_cambios (tabla, llave, accion) select 'gastos', llave, 'cambio: ya no está en la hoja' from w;
${propias ? "commit;" : ""}
`);
  }
  partes.push(`-- cotizaciones ↔ autorizaciones
${propias ? "begin;" : ""}
with ult as (
  select distinct on (a.folio_global) a.folio_global, a.id from public.autorizaciones a where a.empresa_id = ${e}
   order by a.folio_global, (a.estado = 'vigente') desc, a.id desc),
w as (
  update public.cotizaciones c set autorizacion_id = u.id from ult u
   where c.empresa_id = ${e} and c.folio_global = u.folio_global and c.autorizacion_id is distinct from u.id
  returning c.folio_global as llave)
insert into _imp_cambios (tabla, llave, accion) select 'cotizaciones', llave, 'cambio: autorización' from w;
with ult as (
  select distinct on (a.folio_global) a.folio_global, a.estado from public.autorizaciones a where a.empresa_id = ${e}
   order by a.folio_global, a.id desc),
w as (
  update public.cotizaciones c set revocada_en = now() from ult u
   where c.empresa_id = ${e} and c.folio_global = u.folio_global and u.estado = 'revocada' and c.revocada_en is null
  returning c.folio_global as llave)
insert into _imp_cambios (tabla, llave, accion) select 'cotizaciones', llave, 'cambio: revocada' from w;
${propias ? "commit;" : ""}
`);
  partes.push("-- contadores: nunca bajan (contador_sembrar toma el mayor)");
  for (const c of plan.contadores) partes.push(`select public.contador_sembrar(${e}, ${cadena2(c.clave)}, ${Math.trunc(Number(c.n) || 0)});`);
  if (externa) return partes.join("\n") + "\n";
  partes.push(
    "",
    "-- lo que hizo esta corrida (vacío = nada cambió)",
    "select tabla, accion, count(*)::int as filas from _imp_cambios group by tabla, accion order by tabla, accion;"
  );
  if (ensayo) {
    partes.push(`do $$ begin
  raise exception 'ENSAYO TERMINADO SIN ERRORES (no se escribió nada): %',
    (select coalesce(string_agg(tabla || ' ' || accion || ' ' || n, ', ' order by tabla, accion), 'sin cambios')
       from (select tabla, accion, count(*) as n from _imp_cambios group by tabla, accion) x);
end $$;`);
  }
  return partes.join("\n") + "\n";
}
function valorHoja(v) {
  if (v === "" || v === null || v === void 0) return null;
  if (typeof v === "object" && typeof v.$fecha === "string") return v.$fecha;
  return v;
}
function sqlDeDiferencias(plan) {
  const e = cadena2(plan.empresa);
  const n = (v) => {
    const x = valorHoja(v);
    return x === null || !Number.isFinite(Number(x)) ? "NULL::numeric" : cadena2(String(Number(x))) + "::numeric";
  };
  const t = (v) => {
    const x = valorHoja(v);
    return x === null ? "NULL::text" : cadena2(String(x)) + "::text";
  };
  const w = (v) => {
    const x = valorHoja(v);
    return x === null ? "NULL::text" : cadena2(String(x).slice(0, 7)) + "::text";
  };
  const filas2 = plan.esperado.map((x) => `  (${cadena2(x.folio)}, ${n(x.h)}, ${n(x.k)}, ${n(x.r)}, ${n(x.s)}, ${n(x.t)}, ${t(x.x)}, ${n(x.o)}, ${n(x.v)}, ${w(x.w)})`);
  const valores = filas2.length ? filas2.join(",\n") : "  (NULL::text, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, NULL::text, NULL::numeric, NULL::numeric, NULL::text)";
  return `-- Cuadre de la importación: la hoja (getValues de las fórmulas) contra ventas_calculadas, por folio.
-- CERO renglones en la primera consulta = cuadra. Tolerancia: 0.004 en importes (DISENO.md §10.15, IM-01).
-- CONTIENE DATOS DE CLIENTES: no lo subas al repositorio.
with hoja (folio, h, k, r, s, t, x, o, v, w) as (values
${valores}
), hoja_ok as (select * from hoja where folio is not null),
base as (select * from public.ventas_calculadas where empresa_id = ${e}),
dif as (
  select h.folio, c.col, c.en_hoja, c.en_base
    from hoja_ok h left join base b on b.a_folio = h.folio
    cross join lateral (values
      ('fila', 'sí', case when b.a_folio is null then 'no está' else 'sí' end, b.a_folio is null),
      ('H', h.h::text, b.h_neto::text, abs(coalesce(h.h, 0) - coalesce(b.h_neto, 0)) > 0.004),
      ('K', h.k::text, b.k_saldo::text, abs(coalesce(h.k, 0) - coalesce(b.k_saldo, 0)) > 0.004),
      ('R', h.r::text, b.r_comision::text, abs(coalesce(h.r, 0) - coalesce(b.r_comision, 0)) > 0.004),
      ('S', h.s::text, b.s_abonado::text, abs(coalesce(h.s, 0) - coalesce(b.s_abonado, 0)) > 0.004),
      ('T', h.t::text, b.t_restante::text, abs(coalesce(h.t, 0) - coalesce(b.t_restante, 0)) > 0.004),
      ('X', coalesce(h.x, ''), coalesce(b.x_revisar, ''), coalesce(h.x, '') <> coalesce(b.x_revisar, '')),
      ('O', h.o::text, b.o_dias_cobro::text, h.o is distinct from b.o_dias_cobro::numeric),
      ('V', h.v::text, b.v_anio::text, h.v is distinct from b.v_anio::numeric),
      ('W', h.w, b.w_mes, h.w is distinct from b.w_mes)
    ) as c(col, en_hoja, en_base, distinto)
   where c.distinto and (b.a_folio is not null or c.col = 'fila')
  union all
  select b.a_folio, 'fila', 'no está', 'sí' from base b where not exists (select 1 from hoja_ok h where h.folio = b.a_folio)
)
select * from dif order by folio, col;
`;
}

// supabase/functions/importar-diario/copia.js
var LLAVE_CANDADO = 7316250418;
var TIEMPO_SENTENCIA = "110s";
var TOPE_LISTA = 50;
var CopiaOcupada = class extends Error {
  constructor() {
    super("Ya hay una copia en curso.");
    this.name = "CopiaOcupada";
  }
};
var ErrorDeCopia = class extends Error {
  constructor(mensaje, error) {
    super(mensaje);
    this.name = "ErrorDeCopia";
    this.error = error || null;
  }
};
var RE_FOLIO = /^V-\d{3,7}$/;
var RE_TEMA = /^[a-záéíóúñü ]{1,80}$/i;
var COLUMNAS_CUADRE = ["fila", "H", "K", "R", "S", "T", "X", "O", "V", "W"];
var TABLAS_PLAN = [
  "proyectos",
  "ventas_dinero",
  "abonos",
  "miembros",
  "instalaciones",
  "materiales",
  "almacen_costos",
  "requerimientos",
  "almacen_movimientos",
  "constantes",
  "cotizaciones",
  "autorizaciones",
  "tarifas",
  "gastos"
];
var PESTANAS = [
  "Ventas",
  "Abonos comisión",
  "Accesos",
  "Autorizaciones",
  "Solicitudes de autorización",
  "Almacén",
  "Catálogo de material",
  "Listas de compra",
  "Bitácora del puente",
  "Ventas (respaldo)",
  "Ventas (antes de realinear)",
  "Tarifas",
  "Gastos"
];
var entero = (v) => Number.isInteger(v) && v >= 0 ? v : 0;
var folioDe = (s) => {
  const m = /V-\d{3,7}/.exec(String(s || ""));
  return m ? m[0] : null;
};
function contar(items, llave, campoLista, extra) {
  const m = /* @__PURE__ */ new Map();
  for (const it of items) {
    const k = llave(it);
    const id = JSON.stringify(k);
    if (!m.has(id)) m.set(id, { ...k, n: 0, ...campoLista ? { [campoLista]: [] } : {} });
    const g = m.get(id);
    g.n++;
    if (campoLista) {
      const x = extra(it);
      if (x !== null && x !== void 0 && !g[campoLista].includes(x) && g[campoLista].length < TOPE_LISTA) g[campoLista].push(x);
    }
  }
  return [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map((e) => e[1]);
}
function resumenDelPlan(plan, volcado) {
  const rep = plan.reporte || {};
  const res = rep.resumen || {};
  const v = volcado && typeof volcado === "object" ? volcado : {};
  const p = v.pestanas && typeof v.pestanas === "object" ? v.pestanas : {};
  const pestanas = {};
  for (const nombre of PESTANAS) if (Array.isArray(p[nombre])) pestanas[nombre] = Math.max(0, p[nombre].length - 1);
  return {
    v: 1,
    volcado: {
      hecho: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(String(v.hecho || "")) ? v.hecho : null,
      puente_version: /^[a-z0-9-]{1,40}$/i.test(String(v.puente_version || "")) ? v.puente_version : null,
      pestanas
    },
    plan: Object.fromEntries([...TABLAS_PLAN, "filas_de_ventas_leidas", "historicas", "con_cotizacion"].map((k) => [k, entero(res[k])])),
    avisos: Array.isArray(rep.avisos) ? rep.avisos.length : 0,
    no_importado: (rep.no_importado || []).map(noImportado),
    conflictos_plan: contar(rep.conflictos || [], (c) => ({ tema: RE_TEMA.test(String(c.tema)) ? c.tema : "otro" }), "folios", (c) => RE_FOLIO.test(String(c.que)) ? c.que : null),
    rechazos: contar(rep.rechazos || [], (r) => ({ donde: RE_TEMA.test(String(r.donde)) || r.donde === "almacen_movimientos" ? r.donde : "otro" }), "filas", filaDeRechazo)
  };
}
function noImportado(x) {
  const o = { que: RE_TEMA.test(String(x.que)) ? x.que : "otro", n: entero(x.n) };
  if (Array.isArray(x.filas)) o.filas = x.filas.filter((f) => Number.isInteger(f) && f > 0).slice(0, TOPE_LISTA);
  if (x.motivos && typeof x.motivos === "object") {
    const validos = o.que === "Gastos" ? MOTIVOS_GASTO : MOTIVOS_AUTORIZACION;
    o.motivos = {};
    for (const [k, n] of Object.entries(x.motivos)) {
      const m = validos.includes(k) ? k : "otro";
      o.motivos[m] = (o.motivos[m] || 0) + entero(n);
    }
  }
  return o;
}
function filaDeRechazo(r) {
  if (Number.isInteger(r.fila) && r.fila > 0) return r.fila;
  const m = /!(\d{1,6})$/.exec(String(r.que || ""));
  return m ? Number(m[1]) : null;
}
function resumenDeCambios(filas2) {
  const lista = Array.isArray(filas2) ? filas2 : [];
  const tablaOk = (t) => TABLAS_PLAN.includes(t) ? t : "otra";
  const tipoConflicto = (a) => {
    if (/^conflicto: su folio ya es de /.test(a)) return "su folio ya es de otro proyecto";
    const m = /^conflicto: en la base es (viva|histórica) de ([a-z]+) y ahora sería (viva|histórica) de ([a-z]+)$/.exec(a);
    if (m) return `en la base es ${m[1]} de ${m[2]} y ahora sería ${m[3]} de ${m[4]}`;
    if (/^conflicto: ya no está en la hoja/.test(a)) return "ya no está en la hoja";
    return "otro";
  };
  const conflictos = lista.filter((f) => /^conflicto/.test(String(f.accion)));
  const cambios = lista.filter((f) => !/^conflicto/.test(String(f.accion)));
  return {
    cambios: contar(cambios, (f) => ({ tabla: tablaOk(f.tabla), accion: /^(alta|cambio)(: [a-záéíóúñ ()]{1,60})?$/i.test(String(f.accion)) ? String(f.accion) : "otro" })),
    conflictos_base: contar(conflictos, (f) => ({ tabla: tablaOk(f.tabla), tipo: tipoConflicto(String(f.accion)) }), "folios", (f) => folioDe(f.llave)),
    n_conflictos: conflictos.length
  };
}
function resumenDeDiferencias(filas2) {
  const lista = Array.isArray(filas2) ? filas2 : [];
  const columnas = {};
  const folios = [];
  for (const f of lista) {
    const c = COLUMNAS_CUADRE.includes(f.col) ? f.col : "otra";
    columnas[c] = (columnas[c] || 0) + 1;
    const folio = RE_FOLIO.test(String(f.folio)) ? f.folio : null;
    if (folio && !folios.includes(folio) && folios.length < TOPE_LISTA) folios.push(folio);
  }
  return { n: lista.length, columnas, folios };
}
function errorSinDatos(e) {
  const o = { codigo: "DESCONOCIDO" };
  if (e && /^[0-9A-Z]{5}$/.test(String(e.code || ""))) o.codigo = e.code;
  else if (e && e.codigo && /^[A-Z_]{3,40}$/.test(e.codigo)) o.codigo = e.codigo;
  const tabla = e && (e.table_name || e.table);
  const restriccion = e && (e.constraint_name || e.constraint);
  if (/^[a-z_][a-z0-9_]{0,62}$/.test(String(tabla || ""))) o.tabla = tabla;
  if (/^[a-z_][a-z0-9_]{0,62}$/.test(String(restriccion || ""))) o.restriccion = restriccion;
  return o;
}
var INSERTAR = `insert into public.cuadre_diario (empresa_id, aplicado, cuadra, diferencias, conflictos, rechazos, resumen, duracion_ms)
values ($1, $2, $3, $4, $5, $6, $7::text::jsonb, $8)
returning id::text as id, fecha::text as fecha, cuadra`;
async function anotar(tx, d) {
  const cuadra = d.aplicado && !d.error && d.diferencias === 0 && d.conflictos === 0 && d.rechazos === 0;
  const filas2 = await tx.consultar(INSERTAR, [d.empresa, d.aplicado, cuadra, d.diferencias, d.conflictos, d.rechazos, JSON.stringify(d.resumen), d.duracion_ms]);
  const f = filas2 && filas2[0] || {};
  return { id: f.id || null, fecha: f.fecha || null, cuadra };
}
async function copiar({ base, plan, volcado, ahora, inicio }) {
  const empresa2 = plan.empresa;
  const rep = plan.reporte || {};
  const conflictosPlan = (rep.conflictos || []).length, rechazos = (rep.rechazos || []).length;
  const bloqueada = conflictosPlan > 0 || rechazos > 0;
  const resumen = resumenDelPlan(plan, volcado);
  const duracion = () => Math.max(0, Math.min(36e5, Math.round(Number(ahora()) - Number(inicio))));
  let sqlCopia = null, sqlDif = null, errorAlArmar = null;
  try {
    sqlDif = sqlDeDiferencias(plan);
    if (!bloqueada) sqlCopia = sqlDeImportacion(plan, { externa: true });
  } catch (_) {
    errorAlArmar = { codigo: "SQL_NO_SE_ARMO" };
  }
  if (!errorAlArmar) {
    try {
      return await base.transaccion(async (tx) => {
        const c = await tx.consultar("select pg_try_advisory_xact_lock($1::bigint) as ok", [LLAVE_CANDADO]);
        if (!c || !c[0] || c[0].ok !== true) throw new CopiaOcupada();
        await tx.ejecutar(`set local statement_timeout = '${TIEMPO_SENTENCIA}'`);
        const m = await tx.consultar("select modo from public.empresas where id = $1", [empresa2]);
        const mandaLaBase = !!(m && m[0] && m[0].modo === "base");
        let cambios = { cambios: [], conflictos_base: [], n_conflictos: 0 };
        if (sqlCopia && !mandaLaBase) {
          await tx.ejecutar(sqlCopia);
          cambios = resumenDeCambios(await tx.consultar("select tabla, llave, accion from _imp_cambios"));
          await tx.ejecutar("drop table if exists _lote; drop table if exists _imp_cambios;");
        }
        const dif = resumenDeDiferencias(await tx.consultar(sqlDif));
        const r = {
          ...resumen,
          motivo: mandaLaBase ? "la base manda (modo base): la copia de la hoja ya no aplica nada, solo cuadra" : bloqueada ? "el plan trae conflictos o filas que no entran: no se aplicó nada" : null,
          cambios: cambios.cambios,
          conflictos_base: cambios.conflictos_base,
          diferencias: { columnas: dif.columnas, folios: dif.folios }
        };
        const d = {
          empresa: empresa2,
          aplicado: !!sqlCopia && !mandaLaBase,
          diferencias: dif.n,
          conflictos: conflictosPlan + cambios.n_conflictos,
          rechazos,
          resumen: r,
          duracion_ms: duracion()
        };
        const g = await anotar(tx, d);
        return { ...d, ...g };
      });
    } catch (e) {
      if (e instanceof CopiaOcupada) throw e;
      errorAlArmar = errorSinDatos(e);
    }
  }
  const error = errorAlArmar;
  try {
    return await base.transaccion(async (tx) => {
      let dif = null;
      if (sqlDif) {
        await tx.ejecutar("savepoint cuadre");
        try {
          dif = resumenDeDiferencias(await tx.consultar(sqlDif));
          await tx.ejecutar("release savepoint cuadre");
        } catch (_) {
          await tx.ejecutar("rollback to savepoint cuadre");
          dif = null;
        }
      }
      const r = {
        ...resumen,
        motivo: "la copia falló y se deshizo entera: no se escribió nada",
        error,
        diferencias: dif ? { columnas: dif.columnas, folios: dif.folios } : null
      };
      const d = { empresa: empresa2, aplicado: false, error, diferencias: dif ? dif.n : 0, conflictos: conflictosPlan, rechazos, resumen: r, duracion_ms: duracion() };
      const g = await anotar(tx, d);
      return { ...d, ...g };
    });
  } catch (e) {
    throw new ErrorDeCopia("No se pudo ni anotar el fallo en cuadre_diario.", { ...error, al_anotar: errorSinDatos(e) });
  }
}

// supabase/functions/importar-diario/respaldo.js
var PEDIDO = "al3d-pedir-respaldo";
var TOPE_RESPALDO = 45 * 1024 * 1024;
var TIEMPO_RESPALDO = "60s";
var MODO_LECTURA = "set transaction isolation level repeatable read, read only";
var RespaldoGrande = class extends Error {
  constructor() {
    super("El respaldo pasa del tope.");
    this.name = "RespaldoGrande";
  }
};
var esPedidoDeRespaldo = (v) => !!v && typeof v === "object" && !Array.isArray(v) && v.formato === PEDIDO && v.version === 1;
var RE_IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
function consultaDeTabla(t) {
  const cols = t.orden.split(",");
  if (!RE_IDENT.test(t.nombre) || !cols.every((c) => RE_IDENT.test(c))) throw new Error("nombre de tabla o columna no válido");
  return `select coalesce(json_agg(x order by ${cols.map((c) => "x." + c).join(", ")}), '[]'::json)::text as filas, count(*)::int as n from public.${t.nombre} x`;
}
async function exportar(base, { tope = TOPE_RESPALDO } = {}) {
  return base.transaccion(async (tx) => {
    await tx.ejecutar(MODO_LECTURA);
    await tx.ejecutar(`set local statement_timeout = '${TIEMPO_RESPALDO}'`);
    const partes = [], filas2 = {};
    let largo = 0;
    for (const t of TABLAS) {
      const r = await tx.consultar(consultaDeTabla(t));
      const texto2 = String(r && r[0] && r[0].filas || "[]");
      filas2[t.nombre] = Number(r && r[0] && r[0].n) || 0;
      largo += texto2.length;
      if (largo > tope) throw new RespaldoGrande();
      partes.push(JSON.stringify(t.nombre) + ":" + texto2);
    }
    return { partes, filas: filas2 };
  });
}
function armarContenido({ partes, filas: filas2, ahoraMs, origen }) {
  return '{"formato":' + JSON.stringify(FORMATO) + ',"creado":' + JSON.stringify(new Date(ahoraMs).toISOString()) + ',"origen":' + JSON.stringify(origen ?? null) + ',"filas":' + JSON.stringify(filas2) + ',"tablas":{' + partes.join(",") + "}}";
}
function origenDe2(urlProyecto) {
  try {
    const h = new URL(String(urlProyecto || "")).hostname;
    return /^[a-z0-9-]{1,63}\.supabase\.co$/.test(h) ? h : null;
  } catch (_) {
    return null;
  }
}
async function paquete({ partes, filas: filas2, ahoraMs, origen, tope = TOPE_RESPALDO }) {
  const bytes = new TextEncoder().encode(armarContenido({ partes, filas: filas2, ahoraMs, origen }));
  if (bytes.byteLength > tope) throw new RespaldoGrande();
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return {
    bytes,
    sha256: Array.from(h, (b) => b.toString(16).padStart(2, "0")).join(""),
    nombre: nombreDeArchivo(ahoraMs),
    filas: Object.values(filas2).reduce((a, n) => a + n, 0)
  };
}

// supabase/functions/importar-diario/handler.js
var VARIABLES = Object.freeze({ secreto: "IMPORTAR_SECRETO", base: "SUPABASE_DB_URL" });
var CABECERA_SECRETO = "x-importar-secreto";
var CABECERAS_RESPALDO = Object.freeze({ nombre: "x-respaldo-nombre", sha256: "x-respaldo-sha256", bytes: "x-respaldo-bytes", filas: "x-respaldo-filas" });
var SECRETO_MINIMO2 = 32;
var MAX_CUERPO = 15 * 1024 * 1024;
var VIGENCIA_MS = 36 * 3600 * 1e3;
var ADELANTO_MS = 10 * 60 * 1e3;
var FUNCION = "importar-diario";
var leerVar = (entorno2, n) => {
  try {
    const x = entorno2(n);
    return typeof x === "string" ? x : "";
  } catch (_) {
    return "";
  }
};
function secretosDeEsta(entorno2) {
  const s = [];
  const sec = leerVar(entorno2, VARIABLES.secreto);
  if (sec.length >= 8) s.push(sec);
  const url = leerVar(entorno2, VARIABLES.base);
  if (url.length >= 8) {
    s.push(url);
    try {
      const u = new URL(url);
      if (u.password) {
        s.push(u.password);
        try {
          s.push(decodeURIComponent(u.password));
        } catch (_) {
        }
      }
    } catch (_) {
    }
  }
  return s;
}
function problemaDelVolcado(v, ahoraMs) {
  if (!v || typeof v !== "object" || Array.isArray(v) || v.formato !== "al3d-volcado" || v.version !== 1) {
    return "El cuerpo no es un volcado «al3d-volcado» versión 1 (el que arma puente/copia-diaria.gs).";
  }
  if (!v.pestanas || typeof v.pestanas !== "object" || !Array.isArray(v.pestanas["Ventas"]) || !v.pestanas["Ventas"].length) {
    return "El volcado no trae la pestaña «Ventas».";
  }
  const hecho = Date.parse(String(v.hecho || ""));
  if (!Number.isFinite(hecho)) return "El volcado no dice cuándo se hizo.";
  if (ahoraMs - hecho > VIGENCIA_MS) return "El volcado tiene más de 36 horas: no se aplica (volvería la base a como estaba la hoja entonces).";
  if (hecho - ahoraMs > ADELANTO_MS) return "El volcado dice que se hizo en el futuro: revisa el reloj.";
  return null;
}
async function manejar(peticion, deps) {
  const inicio = Number(deps.ahora());
  const secretos = secretosDeEsta(deps && deps.entorno);
  const responder = (status, cuerpo) => json(peticion, status, cuerpo, { secretos });
  let base = null;
  try {
    const previo = previa(peticion, { metodos: ["POST"] });
    if (previo) return previo;
    const esperado = leerVar(deps.entorno, VARIABLES.secreto);
    if (esperado.length < SECRETO_MINIMO2) {
      registrar(deps, FUNCION, "error", "sin_secreto_configurado", { variable: VARIABLES.secreto }, secretos);
      return responder(503, sobreDeError(
        "CONFIGURACION",
        "Falta configurar " + VARIABLES.secreto + " (32 caracteres o más) en los secretos de la función: no se hizo nada.",
        { variables: [VARIABLES.secreto] }
      ));
    }
    if (!secretoValido(peticion.headers.get(CABECERA_SECRETO), esperado)) return responder(401, sobreDeError("SIN_SESION", "No autorizado."));
    const url = leerVar(deps.entorno, VARIABLES.base);
    if (!/^postgres(?:ql)?:\/\/\S+$/.test(url)) {
      registrar(deps, FUNCION, "error", "configuracion", { variables: [VARIABLES.base] }, secretos);
      return responder(503, sobreDeError("CONFIGURACION", "Falta " + VARIABLES.base + " (la pone Supabase en cada función): no se hizo nada.", { variables: [VARIABLES.base] }));
    }
    const t = await leerTexto(peticion, MAX_CUERPO);
    if (!t.ok) return responder(t.motivo === "demasiado_grande" ? 413 : 400, sobreDeError("DATO_INVALIDO", t.motivo === "demasiado_grande" ? "El volcado pasa de 15 MB." : "No se pudo leer el cuerpo."));
    let volcado;
    try {
      volcado = JSON.parse(t.texto);
    } catch (_) {
      return responder(400, sobreDeError("DATO_INVALIDO", "El cuerpo no es JSON."));
    }
    if (esPedidoDeRespaldo(volcado)) {
      base = deps.abrirBase(url);
      let p;
      try {
        p = await paquete({ ...await exportar(base), ahoraMs: inicio, origen: origenDe2(leerVar(deps.entorno, "SUPABASE_URL")) });
      } catch (e) {
        if (e instanceof RespaldoGrande) {
          registrar(deps, FUNCION, "error", "respaldo_grande", { tope_mb: TOPE_RESPALDO / 1048576 }, secretos);
          return responder(413, sobreDeError("RESPALDO_GRANDE", "El respaldo pasa de " + TOPE_RESPALDO / 1048576 + " MB y UrlFetchApp no lo recibe: no se mandó nada. Toca la alternativa de la función respaldo (supabase/README.md)."));
        }
        registrar(deps, FUNCION, "error", "respaldo_base", { error: errorSinDatos(e) }, secretos);
        return responder(502, sobreDeError("BASE_NO_CONTESTA", "La base no contestó al leer el respaldo: no se mandó nada.", { transitorio: true }));
      }
      registrar(deps, FUNCION, "info", "respaldo", { bytes: p.bytes.byteLength, filas: p.filas, duracion_ms: Math.max(0, Number(deps.ahora()) - inicio) }, secretos);
      return new Response(p.bytes, { status: 200, headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        [CABECERAS_RESPALDO.nombre]: p.nombre,
        [CABECERAS_RESPALDO.sha256]: p.sha256,
        [CABECERAS_RESPALDO.bytes]: String(p.bytes.byteLength),
        [CABECERAS_RESPALDO.filas]: String(p.filas)
      } });
    }
    const malo = problemaDelVolcado(volcado, inicio);
    if (malo) return responder(400, sobreDeError("DATO_INVALIDO", malo));
    let plan;
    try {
      plan = await planear({ volcado, telefonos: [], clave: null, semilla: deps.semilla, aceptarVeredictosDeLaHoja: true });
    } catch (_) {
      return responder(400, sobreDeError("DATO_INVALIDO", "El importador no pudo leer el volcado."));
    }
    base = deps.abrirBase(url);
    const r = await copiar({ base, plan, volcado, ahora: deps.ahora, inicio });
    const sinAut = (plan.reporte.no_importado || []).find((x) => x.que === "Autorizaciones");
    const res = {
      id: r.id,
      fecha: r.fecha,
      aplicado: r.aplicado,
      cuadra: r.cuadra,
      diferencias: r.diferencias,
      conflictos: r.conflictos,
      rechazos: r.rechazos,
      ventas: (plan.reporte.resumen || {}).filas_de_ventas_leidas || 0,
      duracion_ms: r.duracion_ms,
      autorizaciones: { comprobadas: plan.tablas.autorizaciones.length, no_entran: sinAut ? Number(sinAut.n) || 0 : 0 }
    };
    registrar(deps, FUNCION, r.error ? "error" : "info", "copia", { ...res, ...r.error ? { error: r.error } : {} }, secretos);
    if (r.error) {
      return responder(502, {
        ...sobreDeError("BASE_RECHAZO", "La base rechazó la copia y se deshizo entera: no se escribió nada. El fallo quedó anotado en cuadre_diario."),
        ...res,
        error: r.error
      });
    }
    return responder(200, { ok: true, ...res, motivo: r.aplicado ? null : "conflictos" });
  } catch (e) {
    if (e instanceof CopiaOcupada) return responder(409, sobreDeError("OCUPADA", "Ya hay una copia en curso: esta no hizo nada."));
    if (e instanceof ErrorDeCopia) {
      registrar(deps, FUNCION, "error", "base", { error: e.error }, secretos);
      return responder(502, sobreDeError("BASE_NO_CONTESTA", "La base no contestó: no se escribió nada.", { transitorio: true }));
    }
    registrar(deps, FUNCION, "error", "inesperado", { tipo: String(e && e.name || typeof e).slice(0, 40) }, secretos);
    return responder(500, sobreDeError("DESCONOCIDO", "La copia falló por algo que no se esperaba."));
  } finally {
    if (base && typeof base.cerrar === "function") {
      try {
        await base.cerrar();
      } catch (_) {
      }
    }
  }
}

// supabase/functions/importar-diario/index.ts
var entorno = (nombre) => Deno.env.get(nombre);
Deno.serve((peticion) => manejar(peticion, {
  ahora: () => Date.now(),
  entorno,
  semilla: semilla_default,
  abrirBase: (url) => basePostgres(postgres, url)
}));
