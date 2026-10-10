/* ============================================================================
   Mapa — dónde está cada obra y en qué orden conviene visitarlas hoy.

   Esta pantalla existe para una decisión de la mañana: a dónde va la camioneta. Todo lo
   que hace está subordinado a eso, y de ahí salen las cinco decisiones del archivo:

   1. NINGÚN PIN EN MEDIO DEL OCÉANO. Un proyecto sin coordenada no se dibuja «por ahí»:
      se va a la lista «sin ubicar» con su dirección cruda y dos salidas para arreglarlo. Un
      pin equivocado parece un dato, y un dato equivocado se usa. La lista es la mitad
      importante de esta pantalla, no un apéndice.

   2. FORMA Y LETRA ADEMÁS DE COLOR. Uno de cada doce hombres no distingue el verde del
      ámbar, y este mapa se lee para decidir a dónde manejar. Cada pin lleva su forma —rombo
      o gota—, su relleno y una letra —G, T, L, I— que la leyenda nombra con palabras.
      El color es el tercer indicio, nunca el único.

   3. EL MAPA NO SE VUELVE A CREAR AL TOCAR UN FILTRO. Se arma una vez y después solo se
      cambian los pines. Rehacerlo perdía el acercamiento y el encuadre en cada toque —el
      barrio que estabas mirando desaparecía— y volvía a bajar los mismos cuadros del mapa,
      que es exactamente lo que la política de sus proveedores pide no hacer.

   4. LO QUE EL FILTRO ESCONDE SE DICE CON UN NÚMERO. Un mapa con tres pines cuando hay
      once proyectos se lee como «solo hay tres», y de ahí sale un día de trabajo mal
      planeado. En la hoja de abajo va el renglón que dice cuántos no se están pintando y
      por qué.

   5. LA UBICACIÓN, A LA MANO (octubre de 2026). La pantalla se parecía a un formulario con un
      mapa adentro: tres tiras de filtros apiladas encima, el mapa en 45 vh y la ruta debajo.
      Quien la usa es el que va manejando a la obra, y lo que conoce es Google Maps y Waze. Así
      que ahora el mapa ocupa la sección entera y todo flota encima, como allá: la barra de
      búsqueda arriba, los chips de filtro deslizables debajo, los botones redondos a la
      derecha, y una hoja que sube desde abajo. En reposo la hoja trae la lista (la ruta del
      día, las obras sin ubicar, las del mapa); al tocar un pin o un resultado de la búsqueda
      trae la FICHA de esa obra, con los botones grandes que se usan en la calle: «Cómo
      llegar», Waze, WhatsApp, llamar y copiar la dirección. En la computadora, de 1100 px para
      arriba, la hoja es un panel flotante a la izquierda, como Google Maps en el navegador.
      El globo de Leaflet se fue: era chico, tapaba el pin que nombraba y no cabían cuatro
      botones de 44 px.

   Leaflet va vendorizado y con `import * as`: la 1.9.4 quitó el entrypoint ESM del
   package.json y NO tiene export default —`import L from` da undefined, comprobado—. Y no
   se hace `window.L = L`: el objeto de namespace de un módulo ES es no extensible por
   especificación, así que un plugin UMD que intentara colgarse ahí lanzaría TypeError. No
   usamos plugins.
   ============================================================================ */

import * as L from '../../vendor/leaflet-src.esm.js';
import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Proyectos from '../datos/proyectos.js';
import * as Agenda from '../datos/agenda.js';
import * as Geo from '../datos/geo.js';
import * as Cot from '../datos/cotizador.js';
import { masDias } from '../nucleo/fechas.js';
import { $, esc, ico, money, toast, avisarResultado, vacio, chip, hoyISO,
         fmtFecha, fmtFechaDia, fmtHora, cuando, diasHasta, abrirCapa, cerrarCapa,
         copiarTexto, scrollSuave, telWa, linkWa, alTerminarDeEntrar, altoBarraAbajo } from '../nucleo/ui.js';

/* ============================================================================
   Estado del módulo. Todo aquí, y todo se suelta en desmontar().
   ============================================================================ */

let cont = null;
let CTX = null;

let mapa = null;            // la instancia de Leaflet
let capaPines = null;       // LayerGroup de los marcadores
let capaRuta = null;        // LayerGroup de la línea de la ruta
let MARCAS = new Map();     // proyecto_id -> marcador, para volar a uno recién ubicado
let FIRMAS = new Map();     // proyecto_id -> firma del icono: lo último que se le puso a cada marcador
let _linea = null;          // la polilínea de la ruta ya dibujada, y los puntos con que se dibujó
let _lineaClave = '';
let _traza = null;          // el trazo de la ruta mientras se dibuja, una sola vez (F25)
let _tira = null;           // el control de P.paginas() sobre la tira de paradas (F12)
let _firmaTira = '';        // las paradas con que se pintó la tira: si no cambian, no se repinta
let _parada = null;         // proyecto_id de la tarjeta «de ahora»
let _silenciarTira = false; // la tira se acaba de pintar: lo que avise la pieza no manda al mapa
let _tParada = 0;
let _ignorarTiraHasta = 0;  // mientras la tira se mueve por un toque en un pin, no manda al mapa
let _yo = null;             // la capa del punto azul de «dónde estoy», si se pidió

let PROYS = [];             // proyectos vivos
let INST = new Map();       // proyecto_id -> {fecha, hora, estado, viva}
let HOY = hoyISO();

let GRUPOS_ON = new Set(['ganado', 'taller', 'listo', 'instalado']);
let RANGO = null;           // lo fija el primer montar() según el rol, y luego manda el usuario
let RUTA = null;            // {orden:[proyecto], km:number}
let MANO = null;            // {id, nombre, lat, lng, tocado, centro} — el modo «pin a mano»
let PIDE = null;            // {id, nombre, aviso} — el panel de pegar el link

let SEL = null;             // proyecto_id de la obra cuya ficha está abierta en la hoja
let HOJA = 'baja';          // dónde está la hoja en el teléfono: 'baja' | 'media' | 'alta'
let _arrastre = null;       // {y0, base, id} mientras un dedo arrastra la hoja
let _sugActiva = -1;        // el renglón de la búsqueda marcado con las flechas

let _armado = false;        // el armazón ya está pintado (y el lienzo existe)
let _redimT = 0;
let _soltarEntrada = null;  // cancela la espera de que la sección termine de entrar
let _vigia = null;          // el ResizeObserver de la sección: si cambia de tamaño, todo se vuelve a medir
const _oyentes = [];        // [[elemento, tipo, fn]]

function on(el, tipo, fn) {
  if (!el) return;
  el.addEventListener(tipo, fn);
  _oyentes.push([el, tipo, fn]);
}

/* Las piezas compartidas (js/piezas.js) las carga index.html como guion clásico ANTES que los
   módulos y cuelgan de window.Piezas. Se piden en el momento de usarlas y con la puerta abierta
   a que falten: este módulo también lo cargan las pruebas de node, y un mapa que se queda sin
   pantalla porque una pieza no llegó es peor que uno sin animación. */
const piezas = () => (typeof window !== 'undefined' && window.Piezas) || {};

/* ¿Hay que quedarse quieto? Se pregunta en el momento, no al cargar: la preferencia se cambia
   con la app abierta. Sin la pieza se cae a la misma pregunta, porque cuatro de las cosas de
   abajo (el trazo de la ruta, los pines que entran y salen, el vuelo del mapa) son adorno que
   solo existe si nadie pidió menos movimiento. */
const quieto = () => {
  const P = piezas();
  if (P.sinMovimiento) return P.sinMovimiento();
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
};

/* ============================================================================
   Vocabulario de pantalla

   Las ocho etapas se agrupan en cuatro cosas que se leen de un vistazo desde la banqueta.
   `garantia` va con `instalado` porque en el mapa son lo mismo —el letrero ya está
   puesto—; su palabra completa sí aparece en la ficha. `cancelado` no llega aquí: se pide
   `vivos:true` y un proyecto que no se dio no es un lugar a donde ir.
   ============================================================================ */

/* `corta` es el nombre del chip. Los cuatro filtros con su palabra larga —«G · Vendido, sin
   empezar (1)»— ocupaban CUATRO renglones de chips encima del mapa en una pantalla de 390 px:
   doscientos treinta píxeles de filtros antes de ver un solo pin. Ahora van en una sola fila
   que se desliza de lado, con el nombre corto, y la palabra larga sigue viva en el `title`, en
   el nombre accesible y en la leyenda de la hoja, que es donde se consulta qué significa una
   marca. */
const GRUPOS = [
  { g: 'ganado',    marca: 'G', palabra: 'Vendido, sin empezar', corta: 'Vendido',  etapas: ['ganado'] },
  { g: 'taller',    marca: 'T', palabra: 'En el taller',         corta: 'Taller',   etapas: ['en_diseno', 'cortado', 'armado'] },
  { g: 'listo',     marca: 'L', palabra: 'Listo para instalar',  corta: 'Listo',    etapas: ['listo'] },
  { g: 'instalado', marca: 'I', palabra: 'Instalado',            corta: 'Instalado',etapas: ['instalado', 'garantia'] },
];

const GRUPO_DE = new Map();
for (const gr of GRUPOS) for (const e of gr.etapas) GRUPO_DE.set(e, gr);
const grupoDe = etapa => GRUPO_DE.get(etapa) || GRUPOS[0];

/* `garantia` y `cancelado` no llevan tono propio en `.pf-etapa`, y es a propósito: no son
   pasos del camino sino salidas de él, y para eso está el gris de `.cerrado`. Sin esta
   traducción la etiqueta de un proyecto en garantía salía sin fondo. */
const claseEtapa = e => (e === 'garantia' || e === 'cancelado') ? 'cerrado' : String(e || 'ganado');
const nombreEtapa = e => Proyectos.ETAPA_NOMBRE[e] || e || '';

/* Los tres rangos, y el de fabricación es un tope, no una sugerencia: la tabla de §8.5 le
   da «solo lo de los próximos 15 días». No es secreto —el rol se cambia en la barra— es
   que un instalador con el mapa de tres meses encima tiene que filtrar con los ojos lo que
   la pantalla podía filtrar sola. */
const RANGOS = [
  { v: 'hoy',  t: 'Hoy',      dias: 0 },
  { v: '15',   t: '15 días',  dias: 15 },
  { v: 'todo', t: 'Todo',     dias: null },
];
const rangosDelRol = () => Prefs.esFabricacion() ? RANGOS.filter(r => r.v !== 'todo') : RANGOS;
const rangoActual = () => RANGOS.find(r => r.v === RANGO) || RANGOS[1];

/* Las instalaciones que todavía le deben una visita a alguien. Una `hecha` con fecha de
   ayer ya no es trabajo; una `confirmada` de ayer que nadie marcó, sí, y por eso sigue
   apareciendo aunque el filtro sea «hoy». */
const VIVAS = new Set(['propuesta', 'confirmada', 'reagendada']);

/* ============================================================================
   Montar y desmontar
   ============================================================================ */

export async function montar(contenedor, ctx) {
  /* El pase se drena aquí y SÍ se usa: quien llega con `{proyecto_id}` —«ver en el mapa»
     desde otra pantalla— aterriza con la ficha de esa obra abierta. Cualquier otro pase no
     trae nada que este mapa sepa leer, y se suelta: un recado viejo que apareciera tres
     pantallas después sería peor que ninguno. */
  const pase = (ctx && typeof ctx.recibir === 'function') ? ctx.recibir() : null;
  cont = contenedor;
  CTX = ctx;
  HOY = hoyISO();

  /* Fabricación entra con su tope puesto, no con «todo» y un aviso después: el primer
     dibujado ya es el que le toca. */
  /* El rango solo se fija la PRIMERA vez, y por rol. Antes se reimponía en cada montaje, así
     que ir a Proyectos a mirar una dirección y volver deshacía la elección del usuario sin
     decir nada. Su chip está en pantalla (pintarFiltros), así que puede sobrevivir: la regla es
     que un filtro solo vive si su interruptor se ve. */
  if (RANGO == null) RANGO = Prefs.esFabricacion() ? '15' : 'todo';

  /* Un oyente delegado en el contenedor y uno por capa. La lista de sin ubicar se repinta
     completa cada vez que se guarda un pin: un oyente por renglón se va a la basura con el
     renglón y los del repintado anterior siguen colgados de nodos que ya nadie ve. */
  on(cont, 'click', clicCuerpo);
  /* El foco del teclado dentro de una tarjeta de la tira (F12) lleva el mapa a esa parada: es la
     alternativa de teclado de deslizar. Con el tabulador se pasa de tarjeta en tarjeta y el mapa
     las sigue. Y el foco que cae en la parte de la hoja que está fuera de la vista la sube. */
  on(cont, 'focusin', alEnfocar);
  /* La búsqueda: escribir filtra, las flechas recorren, Enter elige y Escape cierra. */
  on(cont, 'input', alEscribir);
  on(cont, 'keydown', alTeclear);
  /* La hoja se arrastra desde su asa. Con Pointer Events, que ya traen ratón, dedo y pluma. */
  on(cont, 'pointerdown', alEmpezarArrastre);
  on(window, 'pointermove', alArrastrar);
  on(window, 'pointerup', alSoltarArrastre);
  on(window, 'pointercancel', alSoltarArrastre);
  on($('pf-pide'), 'click', clicPide);
  /* El mapa mide su caja al crearse. Si la ventana cambia —girar el teléfono, abrir el
     teclado, arrastrar la ventana del escritorio— Leaflet no se enteraba y quedaba pintando
     medio lienzo gris con los pines corridos. Ahora además la sección entera mide lo que le
     queda a la ventana, así que también ella se vuelve a medir. */
  on(window, 'resize', alRedimensionar);
  on(window, 'orientationchange', alRedimensionar);

  /* La base cerrada no se pinta como un mapa sin proyectos. «No tienes obras» y «la base no
     abrió» son la misma pantalla en blanco, y la diferencia entre las dos es la diferencia
     entre estar tranquilo y perder una tarde buscando datos que están enteros. */
  if (!DB.estado().ok) {
    cont.innerHTML = vacio('No se pudo abrir la base de este dispositivo', DB.motivoTexto(),
      '<button type="button" class="btn btn-pri" data-recargar>Recargar</button>');
    return;
  }

  /* Sin texto de espera: deja puesto el esqueleto del router, que tiene la forma del mapa. */
  await cargar();
  if (pase && pase.proyecto_id && cont && PROYS.some(p => p.id === pase.proyecto_id)) {
    seleccionar(pase.proyecto_id, { volar: true });
  }
}

export function desmontar() {
  for (const [el, tipo, fn] of _oyentes) {
    try { el.removeEventListener(tipo, fn); } catch (_) {}
  }
  _oyentes.length = 0;
  clearTimeout(_redimT); _redimT = 0;
  clearTimeout(_tParada); _tParada = 0;
  if (_soltarEntrada) { _soltarEntrada(); _soltarEntrada = null; }
  if (_vigia) { _vigia.disconnect(); _vigia = null; }

  /* `map.remove()` no es opcional. Un Leaflet que no se destruye deja vivos su contenedor,
     sus oyentes de rueda y arrastre y sus peticiones de cuadros a medio camino: a la sexta
     ida y vuelta a esta pantalla el teléfono va a tirones y nadie sabe por qué. */
  destruirMapa();

  /* Lo que esta pantalla le escribe al documento —el alto de la sección, cuánto sube el botón
     del asistente y la clase que lo aparta— es del documento, no de ella: la pantalla siguiente
     no puede heredar un asistente escondido detrás de una hoja que ya no existe. */
  const raiz = document.documentElement;
  raiz.style.removeProperty('--mapa-top');
  raiz.style.removeProperty('--mapa-ia-sube');
  raiz.classList.remove('mapa-hoja-arriba');

  /* La capa también es del documento. Salir del mapa con el panel del link abierto dejaba
     el velo encima de la pantalla siguiente. */
  const capa = $('pf-pide');
  if (capa && capa.classList.contains('show')) cerrarCapa('pf-pide');
  if (capa) capa.innerHTML = '';

  PROYS = []; INST = new Map();
  /* RUTA y MANO sí se sueltan, y con razón: la ruta se calcula sobre los pines que acaban de
     leerse y el pin a mano es un gesto a medio hacer, los dos atados a un mapa que se está
     destruyendo. La ficha abierta y la posición de la hoja, igual: son de esta visita.
     GRUPOS_ON, en cambio, se QUEDA: sus cuatro chips están en pantalla, así que cumple la
     regla —el filtro cuyo interruptor se ve puede sobrevivir— y reponerlo por omisión
     borraba en silencio lo que el usuario acababa de elegir. */
  RUTA = null; MANO = null; PIDE = null; SEL = null; HOJA = 'baja'; _arrastre = null; _sugActiva = -1;
  _armado = false;
  cont = null; CTX = null;
}

/** Suelta el orden de la ruta. Junto con él se va el trazo a medias, si lo hubiera: una línea que
 *  sigue dibujándose para una ruta que ya no existe es lo único peor que una línea que no se dibuja. */
function soltarRuta() {
  RUTA = null;
  cancelarTraza();
}

/* ============================================================================
   Leer — todo por la capa de datos, cero cuentas propias
   ============================================================================ */

/** El globo de la barra sin montar la pantalla: lo llama app.js al arrancar y después de
 *  cada sincronización, para que los pendientes se vean sin tener que entrar aquí. Solo lee;
 *  no pinta nada. */
export async function contar() {
  if (CTX) return null;          // montado: la cuenta la publica la pantalla
  await leerDatos();
  return { mapa: sinUbicar().length };
}

async function cargar() {
  await leerDatos();
  /* Una ruta calculada con los proyectos de antes apuntaría a pines que ya se movieron. */
  soltarRuta();
  pintar();
}

async function leerDatos() {
  HOY = hoyISO();
  PROYS = await Proyectos.listar({ vivos: true });

  /* La fecha que importa en un mapa es la de la instalación, no la de la venta: es la que
     dice si hay que ir. Se lee una vez y se indexa; preguntarle a la agenda proyecto por
     proyecto son treinta lecturas del mismo almacén. */
  const inst = await Agenda.listar({});
  INST = new Map();
  for (const i of inst) {
    if (!i || !i.fecha || i.estado === 'cancelada') continue;
    const dato = { fecha: i.fecha, hora: i.hora || null, estado: i.estado, viva: VIVAS.has(i.estado) };
    const ya = INST.get(i.proyecto_id);
    /* Con dos fechas para el mismo proyecto —se reagendó y quedó la vieja marcada— gana la
       que todavía está viva, y entre dos vivas la más próxima: es la que hay que atender. */
    if (!ya || (dato.viva && !ya.viva) || (dato.viva === ya.viva && dato.fecha < ya.fecha)) {
      INST.set(i.proyecto_id, dato);
    }
  }
}

/* ============================================================================
   Filtros — puros sobre lo que ya se leyó
   ============================================================================ */

/* La prueba de «¿tiene punto en el mapa?» vive en la capa de datos y la comparten esta
   pantalla, el Tablero y el propio `listar({sinUbicar:true})`. Nació aquí —`Number(null)` es
   0, así que la prueba ingenua mandaba los proyectos sin ubicar a 0,0, la Isla Nula frente a
   Ghana— y se mudó allá cuando se descubrió que el Tablero, con su propia versión ingenua,
   contaba «0 sin ubicar» donde este mapa contaba tres. El porqué completo está en su
   comentario, en js/datos/proyectos.js.

   CON RESPALDO, y no por gusto. En la ventana de un despliegue una pestaña que ya estaba
   abierta se queda con el `js/datos/proyectos.js` de la versión anterior en el registro de
   módulos del navegador, y al entrar por primera vez a una pantalla nueva se trae ESTE
   archivo ya actualizado: un módulo nuevo importando uno viejo. El viejo no exporta `tienePin`
   —es de este mismo cambio—, así que la constante quedaba en `undefined` y el mapa moría al
   montar con «no se pudo pintar». Reproducido: servir la versión anterior, desplegar la nueva
   encima y tocar Mapa sin recargar. Es lo que el README dice con todas sus letras: un guion
   nuevo con uno viejo no es una app vieja, es una app rota. El respaldo es la misma prueba
   escrita una vez más, y deja de usarse en cuanto la pestaña se recarga. */
const coordPin = v => (v === null || v === undefined || v === '') ? NaN : Number(v);
const tienePin = Proyectos.tienePin || (p => {
  if (!p) return false;
  const la = coordPin(p.lat), ln = coordPin(p.lng);
  return Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0);
});

function pasaEtapa(p) {
  return GRUPOS_ON.has(grupoDe(p.etapa).g);
}

function pasaRango(p) {
  const r = rangoActual();
  if (r.dias === null) return true;
  const f = INST.get(p.id);
  if (!f) return false;
  const limite = masDias(HOY, r.dias);
  if (f.fecha > limite) return false;
  /* Lo de antes de hoy solo sigue en el mapa si nadie la marcó: una instalación atrasada
     es trabajo pendiente, y una hecha el mes pasado con el filtro en «hoy» sería ruido. */
  return f.fecha >= HOY ? true : f.viva;
}

const conPin = () => PROYS.filter(tienePin);
const pintables = () => conPin().filter(p => pasaEtapa(p) && pasaRango(p));

function sinUbicar() {
  const faltan = PROYS.filter(p => !tienePin(p));
  /* Primero los que tienen fecha y más cerca la tienen: ubicar el de mañana es urgente,
     ubicar uno que se ganó ayer y no se ha agendado puede esperar al martes. */
  return faltan.sort((a, b) => {
    const fa = INST.get(a.id), fb = INST.get(b.id);
    if (!!fa !== !!fb) return fa ? -1 : 1;
    if (fa && fb && fa.fecha !== fb.fecha) return fa.fecha < fb.fecha ? -1 : 1;
    return String(b.fecha_ganado || '').localeCompare(String(a.fecha_ganado || ''));
  });
}

const deHoy = () => conPin().filter(p => {
  const f = INST.get(p.id);
  return !!f && f.viva && f.fecha <= HOY;
});

/* ============================================================================
   Pintar — el armazón una vez, las piezas cuantas veces haga falta
   ============================================================================ */

function pintar() {
  if (!cont) return;

  if (!PROYS.length) {
    destruirMapa();
    if (_vigia) { _vigia.disconnect(); _vigia = null; }
    _armado = false;
    cont.innerHTML = vacio('Todavía no hay obras que poner en el mapa',
      'Cuando marques una cotización como ganada en el cotizador, su proyecto aparece aquí. ' +
      'Si trae link de Google Maps sale con su pin puesto; si no, sale en la lista de sin ' +
      'ubicar para ponérselo de un toque.',
      '<button type="button" class="btn btn-pri" data-ir="proyectos">Ver los proyectos</button>');
    if (CTX && typeof CTX.ponerCuenta === 'function') CTX.ponerCuenta('mapa', 0);
    return;
  }

  const primera = !_armado;
  if (primera) armazon();
  /* La sección mide lo que le queda a la ventana ANTES de crear el mapa: Leaflet mide su caja
     al nacer, y una caja sin alto lo deja con un solo cuadro gris en la esquina. */
  if (primera) medirSeccion();
  refrescarPiezas();
  crearMapa();
  refrescarPines();
  /* Solo en el primer dibujado. Después, encuadrar en cada repintado le quitaría el mapa de
     las manos a quien acaba de acercarse a una colonia: se reencuadra cuando el usuario
     cambia un filtro o lo pide, que es cuando lo espera. */
  if (primera) {
    ponerHoja(HOJA, { sinAnimar: true });
    encuadrar();
    /* La sección entra con una animación que la baja diez píxeles mientras dura: lo que se
       midió a la mitad sale corto. Se vuelve a medir cuando termina. */
    if (_soltarEntrada) _soltarEntrada();
    _soltarEntrada = alTerminarDeEntrar(cont, () => { _soltarEntrada = null; alRedimensionar(); });
    /* Y por si la sección cambia de tamaño sin que la ventana lo haga —el router la monta oculta y
       la enseña un cuadro después, aparece la banda de aviso de arriba, el teclado del teléfono—:
       una hoja medida con la sección en cero se quedaba pegada arriba. */
    if (_vigia) _vigia.disconnect();
    const app = $('mapa-app');
    if (app && typeof ResizeObserver === 'function') {
      _vigia = new ResizeObserver(() => alRedimensionar());
      _vigia.observe(app);
    }
  }
  if (CTX && typeof CTX.ponerCuenta === 'function') CTX.ponerCuenta('mapa', sinUbicar().length);
}

function armazon() {
  /* `innerHTML` se lleva el nodo del lienzo, y un Leaflet apuntando a un nodo huérfano
     sigue con sus oyentes puestos y sus cuadros a medio bajar. Se destruye antes. */
  destruirMapa();
  /* El mapa ocupa la sección entera y todo lo demás flota encima, como en Google Maps (ver la
     decisión 5 de la cabecera). Cuatro capas, de abajo hacia arriba:

       · el lienzo, con la tira de paradas (F12) en su caja. La tira va FUERA del lienzo: dentro
         de él, Leaflet escucha cada toque del contenedor para arrastrar el mapa, y deslizar una
         tarjeta lo habría arrastrado también;
       · la barra de arriba: la búsqueda, los chips de filtro en una sola fila que se desliza
         de lado, y la barra del pin a mano cuando se está poniendo uno;
       · los botones redondos de la derecha: dónde estoy y ver todas;
       · la hoja de abajo, con la lista en reposo y la ficha de la obra elegida.

     Los filtros flotan y ya no van apilados encima del mapa. Antes eran tres tiras en tres
     renglones —etapas, hasta cuándo y las acciones— y por eso se decidió no ponerlos encima:
     tapaban el mapa que filtraban. Ahora son UNA fila de chips que se desliza de lado, que es
     como la conoce cualquiera que haya buscado «gasolineras» en Google Maps, y las acciones se
     mudaron a la hoja y a los botones redondos. */
  cont.innerHTML =
    '<div class="mapa-app" id="mapa-app">' +
      '<div class="mapa-caja" id="mapa-caja">' +
        '<div id="mapa-lienzo"></div>' +
        '<div class="mapa-tira" id="mapa-tira" hidden></div>' +
      '</div>' +

      '<div class="mapa-arriba" id="mapa-arriba">' +
        '<div class="mapa-buscar" role="search">' +
          ico('i-buscar') +
          '<input type="search" id="mapa-q" class="mapa-q" autocomplete="off" spellcheck="false"' +
            ' enterkeyhint="search" placeholder="Buscar obra, negocio o contacto"' +
            ' aria-label="Buscar una obra por nombre, negocio, contacto o folio"' +
            ' role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="mapa-sug">' +
          '<button type="button" class="mapa-buscar-x" data-limpiar hidden aria-label="Borrar la búsqueda">' +
            ico('i-cerrar') + '</button>' +
        '</div>' +
        '<ul class="mapa-sug" id="mapa-sug" role="listbox" aria-label="Obras que coinciden" hidden></ul>' +
        '<div class="mapa-chips" id="mapa-chips">' +
          '<div class="mapa-chips-g" id="mapa-etapas" role="group" aria-label="Etapas que se pintan"></div>' +
          '<span class="mapa-chips-sep" aria-hidden="true"></span>' +
          '<div class="mapa-chips-g" id="mapa-rango" role="group" aria-label="Hasta cuándo se pinta"></div>' +
        '</div>' +
        '<div id="mapa-modo"></div>' +
      '</div>' +

      '<div class="mapa-fabs" id="mapa-fabs">' +
        '<button type="button" class="mapa-fab" data-yo aria-label="Centrar el mapa en dónde estoy" title="Dónde estoy">' +
          ico('i-ubicarme') + '</button>' +
        '<button type="button" class="mapa-fab" data-encuadrar aria-label="Ver todas las obras del mapa" title="Ver todas">' +
          ico('i-ajustar') + '</button>' +
        '<span class="mapa-fabs-zoom" role="group" aria-label="Acercar o alejar el mapa">' +
          '<button type="button" class="mapa-fab" data-zoom="1" aria-label="Acercar" title="Acercar">' + ico('i-mas') + '</button>' +
          '<button type="button" class="mapa-fab" data-zoom="-1" aria-label="Alejar" title="Alejar">' + ico('i-menos') + '</button>' +
        '</span>' +
      '</div>' +

      '<section class="mapa-hoja" id="mapa-hoja" aria-label="Obras del mapa">' +
        /* El asa es un botón de verdad: con el dedo se arrastra, con un toque sube o baja, y con
           el teclado es Enter. El área que se toca es todo el ancho y 32 px de alto; la rayita
           gris es solo el dibujo. */
        '<button type="button" class="mapa-hoja-asa" data-hoja aria-controls="mapa-hoja-cuerpo"' +
          ' aria-expanded="false" aria-label="Subir la hoja de obras"><span aria-hidden="true"></span></button>' +
        '<div class="mapa-hoja-cuerpo" id="mapa-hoja-cuerpo">' +
          '<div class="mapa-ficha" id="mapa-ficha" hidden></div>' +
          '<div class="mapa-lista" id="mapa-lista">' +
            /* Lo que se ve con la hoja abajo: las tres cuentas y el botón de la ruta. Termina
               donde dice `data-asoma`, y eso es lo que mide la hoja para saber cuánto asomar. */
            '<div class="mapa-hoja-cab" data-asoma>' +
              '<div class="mapa-cuentas" id="mapa-cuentas"></div>' +
              '<div class="mapa-acc" id="mapa-acc"></div>' +
            '</div>' +
            '<p class="pf-nota" id="mapa-oculto"></p>' +
            '<div id="mapa-ruta"></div>' +
            '<div id="mapa-faltan"></div>' +
            '<div id="mapa-obras"></div>' +
            /* La leyenda va en la hoja y no encima del mapa: se consulta cuando ya se vio un pin y
               no se sabe qué es. El dibujo es el pin en chico, con su forma y su letra, y al lado
               la palabra. */
            '<p class="mapa-leyenda">' +
              GRUPOS.map(g => '<span>' + pinMini(g) + esc(g.marca + ' — ' + g.palabra.toLowerCase()) + '</span>').join('') +
            '</p>' +
            /* La verdad de este módulo, en letra chica y sin adornos. No es un consejo: es cómo
               funciona, y saberlo es la diferencia entre «se rompió» y «no hay señal». */
            '<p class="pf-nota">El mapa se baja de internet: sin señal se queda gris y los pines no ' +
              'tienen dónde pararse. Los datos no — los proyectos, las etapas y las fechas ya están ' +
              'en este teléfono y se leen igual sin línea. Los cuadros del mapa no se guardan a ' +
              'propósito: la política de OpenStreetMap prohíbe archivarlos, y el crédito de la ' +
              'esquina del mapa es requisito de su licencia, no adorno.</p>' +
          '</div>' +
        '</div>' +
      '</section>' +
    '</div>';
  _armado = true;
}

/** El pin en chico, para los chips, la leyenda, la lista y la ficha: la misma forma, el mismo
 *  relleno y la misma letra que el del mapa, para que se reconozcan como la misma cosa. */
function pinMini(gr, txt) {
  return '<span class="mapa-pin-mini ' + gr.g + '" aria-hidden="true"><b>' + esc(txt || gr.marca) + '</b></span>';
}

function refrescarPiezas() {
  const pines = pintables();
  const faltan = sinUbicar();
  const hoy = deHoy();

  const cu = $('mapa-cuentas');
  if (cu) {
    /* Las tres cuentas de siempre, ahora como UN renglón de la hoja —por eso «para hoy» y no
       «por instalar hoy»: con la palabra larga se partía en dos y la hoja asomaba el doble—.
       «Sin ubicar» es un botón porque es lo que hay que ir a arreglar: lleva a la lista. */
    cu.innerHTML =
      '<span class="mapa-cuenta"><b data-cuenta="pines">' + pines.length + '</b> en el mapa</span>' +
      '<span class="mapa-cuenta' + (hoy.length ? ' urge' : '') + '"><b data-cuenta="hoy">' + hoy.length + '</b> para hoy</span>' +
      (faltan.length
        ? '<button type="button" class="mapa-cuenta urge" data-ver-faltan><b data-cuenta="sinubicar">' +
            faltan.length + '</b> sin ubicar</button>'
        : '<span class="mapa-cuenta"><b data-cuenta="sinubicar">0</b> sin ubicar</span>');
    rodarCuentas(cu);
  }

  const et = $('mapa-etapas');
  if (et) {
    /* La cuenta de cada chip se calcula sobre lo que el rango ya dejó pasar, no sobre el
       total: un chip que dice «(7)» y prende dos pines hace dudar del número o del mapa. */
    const porGrupo = new Map(GRUPOS.map(g => [g.g, 0]));
    for (const p of conPin().filter(pasaRango)) {
      const g = grupoDe(p.etapa).g;
      porGrupo.set(g, (porGrupo.get(g) || 0) + 1);
    }
    /* El chip lleva el pin en chico y el nombre CORTO en los dos tamaños: la fila se desliza de
       lado, así que ya no hace falta el par largo/corto que ponía «Vendido, sin empezar» en la
       computadora. La palabra larga vive en el `aria-label`, en el `title` y en la leyenda de la
       hoja. No se arma con `chip()` porque esa escapa su etiqueta y aquí va el pin adentro; la
       clase, el estado y el `aria-pressed` son los mismos. */
    et.innerHTML = GRUPOS.map(g => {
      const n = porGrupo.get(g.g) || 0;
      const etiq = g.marca + ' · ' + g.palabra + ' (' + n + ')';
      const on = GRUPOS_ON.has(g.g);
      return '<button type="button" class="chip mapa-chip' + (on ? ' on' : '') + (n ? '' : ' cero') + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '" data-g="' + g.g + '"' +
        ' title="' + esc(etiq) + '" aria-label="' + esc(etiq) + '">' +
        pinMini(g) + esc(g.corta) + ' <span class="mapa-chip-n">' + n + '</span></button>';
    }).join('');
  }

  const ra = $('mapa-rango');
  if (ra) {
    ra.innerHTML = rangosDelRol()
      .map(r => chip(r.t, RANGO === r.v, 'data-rango="' + esc(r.v) + '"')).join('');
    for (const b of ra.querySelectorAll('.chip')) b.classList.add('mapa-chip');
  }

  const ac = $('mapa-acc');
  if (ac) {
    /* La acción de la mañana, a la vista con la hoja abajo. Antes vivía en la barra fija del
       teléfono y además arriba del mapa; ahora es una sola, en la hoja, que es donde el pulgar
       ya está. Sin instalaciones de hoy con pin no hay botón: uno que no lleva a ningún lado
       ocupa el lugar donde el pulgar espera encontrar algo. */
    ac.innerHTML = hoy.length
      ? '<button type="button" class="btn ' + (RUTA ? 'btn-gho' : 'btn-pri') + ' mapa-acc-ruta" data-ruta="' +
          (RUTA ? 'quitar' : 'calcular') + '">' + ico('i-camion') +
          esc(RUTA ? 'Quitar el orden de la ruta' : 'Ordenar la ruta de hoy (' + hoy.length + ')') + '</button>'
      : '';
    ac.hidden = !hoy.length;
  }

  const oc = $('mapa-oculto');
  if (oc) {
    const t = textoOculto(pines.length);
    oc.textContent = t;
    oc.hidden = !t;
  }

  pintarModo();
  pintarRuta();
  pintarTira();
  pintarFaltan(faltan);
  pintarObras(pines);
  pintarFicha();
  medirHoja();
}

/* ----- Las cuentas de la hoja ruedan cuando cambian (F23) -----
   «3 sin ubicar» pasaba a «2» de golpe en medio de un repintado completo —esta cinta se rehace
   con innerHTML en cada toque de un filtro—, justo después de poner un pin, que es cuando se vino
   a mirar ese número. La pieza `rodarCifra` recuerda el último valor de cada cifra por su `clave`
   (que sobrevive al innerHTML) y solo hace rodar la que cambió: la que sigue igual no se toca.

   Lo que decide CUÁNDO tiene sentido no está aquí sino en el router: entrar a la pantalla olvida
   todo (`olvidarCifras()` de app.js), así que el primer pintado nunca rueda —abrir el mapa no es
   un cambio— y por eso este módulo no lleva su propia cuenta de «primer pintado». Sin «+1»: son
   conteos que un filtro mueve de a varios, y «−4» junto a «en el mapa» lee como un aviso.
   `data-cuenta` es lo que la pieza necesita para saber cuál es cuál. */
function rodarCuentas(raiz) {
  const P = piezas();
  if (!P.rodarCifra || !raiz) return;
  for (const b of raiz.querySelectorAll('b[data-cuenta]')) {
    P.rodarCifra(b, b.textContent, { clave: 'mapa:' + b.dataset.cuenta });
  }
}

/** Lo que el filtro está escondiendo, con su número y su razón. Sin este renglón un mapa
 *  con tres pines de once proyectos se lee como «solo hay tres», y con eso se planea un día. */
function textoOculto(pintados) {
  const total = conPin().length;
  const escondidos = total - pintados;
  if (!escondidos) return '';
  const r = rangoActual();
  const partes = ['No se están pintando ' + escondidos + ' de ' + total + ' obras con pin.'];
  if (r.dias !== null) {
    const sinFecha = conPin().filter(p => !INST.has(p.id)).length;
    if (sinFecha) {
      partes.push(sinFecha === 1
        ? 'Una no tiene fecha de instalación.'
        : sinFecha + ' no tienen fecha de instalación.');
    }
    partes.push(Prefs.esFabricacion()
      ? 'Con tu rol el mapa llega hasta los próximos 15 días.'
      : 'Con «Todo» se ven todas.');
  } else if (GRUPOS_ON.size < GRUPOS.length) {
    partes.push('Prende las etapas que apagaste para verlas.');
  }
  return partes.join(' ');
}

/* ============================================================================
   El lienzo y la capa base
   ============================================================================ */

const hayLeaflet = () => !!L && typeof L.map === 'function' && typeof L.divIcon === 'function';

/** La capa de fondo. Se le pide primero a `Geo.capaBase`, que es la dueña del contrato.
 *
 *  Y casi siempre devuelve null aquí, a propósito: `capaBase` busca Leaflet en
 *  `globalThis.L` —la forma en que lo encuentra una página con el <script> clásico— y esta
 *  plataforma no publica L en window, porque el objeto de namespace de un módulo ES es no
 *  extensible y asignarle algo lanza. Así que el respaldo arma la capa con el mismo
 *  renglón de `Geo.TILES` que usaría ella: la URL, el maxZoom, los subdominios y —lo que
 *  no se negocia— la misma atribución. Que salga de `proveedorActivo` es lo que impide que
 *  el crédito de OpenStreetMap se quede viejo o se pierda al cambiar de proveedor. */
function capaBase() {
  const prov = Prefs.tiles();
  const capa = Geo.capaBase(prov);
  if (capa) return capa;
  const t = Geo.proveedorActivo(prov);
  if (!t || !t.url) return null;
  return L.tileLayer(t.url, {
    maxZoom: t.maxZoom, attribution: t.attribution, subdomains: t.sub || 'abc',
  });
}

function destruirMapa() {
  /* El trazo y la tira se sueltan ANTES de quitar el mapa: los dos tienen relojes y oyentes
     colgados de él, y uno que despierta después encuentra un mapa que ya no existe. */
  cancelarTraza();
  clearTimeout(_tParada); _tParada = 0;
  if (_tira) { try { _tira.destruir(); } catch (_) {} _tira = null; }
  _firmaTira = ''; _parada = null;
  if (mapa) {
    try { mapa.off(); mapa.remove(); } catch (e) { console.warn('el mapa no se pudo destruir', e); }
  }
  mapa = null; capaPines = null; capaRuta = null; _yo = null;
  MARCAS = new Map(); FIRMAS = new Map();
  _linea = null; _lineaClave = '';
  if (MANO) MANO = null;
}

function crearMapa() {
  const div = $('mapa-lienzo');
  if (!div || mapa) return;

  if (!hayLeaflet()) {
    /* El mapa es la mitad de esta pantalla, no toda: la lista de sin ubicar sigue sirviendo
       y es donde se arregla el dato. Así que se dice qué falta y el resto se queda. */
    div.innerHTML = '<div class="vacio">' + ico('i-nube-off') +
      '<p class="vacio-t">El mapa no cargó</p>' +
      '<p class="vacio-d">Falta el archivo de Leaflet de la carpeta vendor. La lista de la hoja ' +
      'sigue funcionando; el dibujo del mapa, no.</p></div>';
    return;
  }

  try {
    /* Sin el zoom de Leaflet: arriba a la izquierda lo tapaba la búsqueda y abajo a la derecha el
       botón del asistente. Acercar y alejar son dos botones redondos más en la columna de la
       derecha (`data-zoom`), que la hoja de estilos esconde en las pantallas táctiles —ahí se
       acerca con dos dedos—. Con el lienzo enfocado, + y − siguen acercando con el teclado. */
    mapa = L.map(div, { zoomControl: false, attributionControl: true });
    /* El crédito de los cuadros SÍ se queda, en su esquina: es requisito de la licencia. Lo que
       se quita es la banderita de Leaflet que va antes, que no lo es. */
    if (mapa.attributionControl) {
      mapa.attributionControl.setPrefix(false);
      /* Abajo a la IZQUIERDA: la esquina de la derecha es la del botón del asistente, que lo tapaba.
         Sube con la hoja en el teléfono y en la computadora se corre a la derecha del panel. */
      mapa.attributionControl.setPosition('bottomleft');
    }
    mapa.setView([Geo.centroGDL.lat, Geo.centroGDL.lng], 11);
    const base = capaBase();
    /* Sin capa de fondo el mapa es un rectángulo gris con pines flotando, y eso se lee como
       «se rompió». `proveedorActivo` siempre cae a OSM, así que llegar aquí sin capa
       significa que el archivo de Leaflet está incompleto: se dice. */
    if (base) base.addTo(mapa);
    else toast('El fondo del mapa no cargó. Los pines se ven, las calles no', 'err', 5000);
    capaPines = L.layerGroup().addTo(mapa);
    capaRuta = L.layerGroup().addTo(mapa);
    mapa.on('click', alTocarMapa);
    mapa.on('moveend', alTerminarDeMoverse);
    /* El módulo se monta dentro de una <section> que estaba oculta hasta hace un cuadro, y
       un Leaflet creado sin alto medido se queda con un solo cuadro gris en la esquina. */
    requestAnimationFrame(() => { try { mapa && mapa.invalidateSize(); } catch (_) {} });
  } catch (e) {
    console.error('el mapa no se pudo crear', e);
    mapa = null;
    div.innerHTML = '<div class="vacio">' + ico('i-aviso') +
      '<p class="vacio-t">El mapa no se pudo dibujar</p>' +
      '<p class="vacio-d">' + esc(e && e.message ? e.message : 'Error desconocido') +
      '</p></div>';
  }
}

function alRedimensionar() {
  /* Girar el teléfono dispara resize varias veces seguidas y cada `invalidateSize` puede
     pedir cuadros nuevos. Se espera a que pare. */
  clearTimeout(_redimT);
  _redimT = setTimeout(() => {
    medirSeccion();
    try { mapa && mapa.invalidateSize(); } catch (_) {}
    medirHoja();
  }, 180);
}

/* ============================================================================
   La sección a pantalla completa, y la hoja de abajo

   La sección mide lo que le queda a la ventana debajo del encabezado. No se escribe a mano
   ningún alto de encabezado: se mide dónde empieza la sección (con `offsetTop`, que no lo
   engaña la animación de entrada como sí lo haría `getBoundingClientRect`) y se publica en
   `--mapa-top`. La hoja de estilos hace la resta. En el teléfono el mapa llega hasta el borde
   de abajo y el dock de módulos flota encima, como flota sobre cualquier otra pantalla.

   La hoja, en el teléfono, tiene tres paradas: abajo (asoma lo de `data-asoma`: las cuentas y
   la ruta, o el nombre de la obra y sus botones), media (la mitad) y arriba (hasta debajo de
   la búsqueda, que sigue a la mano). Su posición es una sola variable, `--hoja-y`, en píxeles:
   la usa el `transform` y la usa el relleno de abajo del cuerpo, para que con la hoja a medio
   subir lo último de la lista se pueda alcanzar. En la computadora la hoja es un panel fijo y
   nada de esto corre.
   ============================================================================ */

const esPanel = () => { try { return window.matchMedia('(min-width:1100px)').matches; } catch (_) { return false; } };

function medirSeccion() {
  const app = $('mapa-app');
  if (!app) return;
  /* Se mide el <main> y no la sección: mientras el router cambia de pantalla, la que se va sigue
     pintada un momento ENCIMA de esta, y la sección medida en ese momento salía cientos de
     píxeles más abajo —el mapa nacía de 360 px y crecía un segundo después—. El <main> está
     siempre donde va a quedar la sección; se le suma el margen de arriba de la caja del mapa,
     que en el teléfono es negativo (va a sangre, pegado al encabezado). */
  const base = $('pf-contenido') || cont || app;
  let y = 0;
  for (let n = base; n; n = n.offsetParent) y += n.offsetTop || 0;
  y += parseFloat(getComputedStyle(app).marginTop) || 0;
  document.documentElement.style.setProperty('--mapa-top', Math.max(0, Math.round(y)) + 'px');
}

/** Cuánto de la sección tapa el dock de módulos del teléfono. Se mide contra la sección y no
 *  se escribe: el dock flota, y su alto lo decide la última hoja de estilos (ver
 *  `altoBarraAbajo`). En la computadora no hay dock y da 0. */
function tapaDelDock(app) {
  const d = altoBarraAbajo();
  if (!d || !app) return 0;
  /* Contra donde la sección VA a terminar (su arriba medido más su alto), no contra donde se ve
     ahora: mientras el router cambia de pantalla la sección está corrida hacia abajo, y medida así
     el dock «tapaba» media hoja y la hoja nacía subida del todo. */
  const arriba = parseFloat(document.documentElement.style.getPropertyValue('--mapa-top')) || 0;
  const fin = arriba + app.offsetHeight - (window.scrollY || 0);
  return Math.max(0, Math.round(fin - (window.innerHeight - d)));
}

/** Las tres paradas de la hoja, en píxeles de `translateY` (0 = el borde de arriba de la hoja
 *  pegado al de la sección). */
function paradasHoja() {
  const app = $('mapa-app'), hoja = $('mapa-hoja');
  if (!app || !hoja) return null;
  const alto = hoja.offsetHeight;
  /* Con la sección todavía oculta todo mide cero, y una hoja calculada así se pegaba arriba. Se
     deja la posición de la hoja de estilos hasta que haya algo que medir. */
  if (!alto) return null;
  /* Lo que tapa el dock de módulos: la hoja asoma ENCIMA de él, no debajo. */
  const dock = tapaDelDock(app);
  hoja.style.setProperty('--mapa-dock', dock + 'px');
  const buscar = app.querySelector('.mapa-buscar');
  const arriba = buscar ? buscar.offsetTop + buscar.offsetHeight + 8 : 64;
  const fin = SEL ? hoja.querySelector('#mapa-ficha [data-asoma]') : hoja.querySelector('#mapa-lista [data-asoma]');
  let asoma = 120;
  if (fin) {
    let y = 0;
    for (let n = fin; n && n !== hoja; n = n.offsetParent) y += n.offsetTop || 0;
    asoma = y + fin.offsetHeight + 12;
  }
  const max = Math.max(arriba, alto - dock - 72);
  const baja = Math.min(max, Math.max(arriba, alto - dock - asoma));
  const media = Math.min(baja, Math.max(arriba, Math.round(alto * .45)));
  return { alta: arriba, media, baja, alto, dock };
}

/** Pone la hoja en una de sus paradas. Con `sinAnimar` salta (el primer pintado, o quien pidió
 *  menos movimiento). */
function ponerHoja(estado, op) {
  const hoja = $('mapa-hoja'), app = $('mapa-app');
  if (!hoja) return;
  HOJA = estado;
  medirArriba();
  if (app) app.dataset.estadoHoja = estado;
  if (esPanel()) {
    hoja.style.removeProperty('--hoja-y');
    hoja.dataset.estado = 'panel';
    publicarTapa();
    return;
  }
  const P = paradasHoja();
  if (!P) return;
  const y = P[estado] != null ? P[estado] : P.baja;
  hoja.classList.toggle('sin-animar', !!(op && op.sinAnimar) || quieto());
  /* Abajo, la hoja asoma su principio —las cuentas y la ruta, o el nombre y los botones—, no el
     pedazo de lista al que se había bajado con la hoja arriba. */
  if (estado === 'baja') { const c = $('mapa-hoja-cuerpo'); if (c && c.scrollTop) c.scrollTop = 0; }
  hoja.style.setProperty('--hoja-y', y + 'px');
  hoja.dataset.estado = estado;
  const asa = hoja.querySelector('[data-hoja]');
  if (asa) {
    asa.setAttribute('aria-expanded', estado === 'baja' ? 'false' : 'true');
    asa.setAttribute('aria-label', estado === 'baja'
      ? (SEL ? 'Subir la ficha de la obra' : 'Subir la hoja de obras')
      : (SEL ? 'Bajar la ficha de la obra' : 'Bajar la hoja de obras'));
  }
  publicarTapa(y, P);
}

/** Hasta dónde llega lo que flota arriba (la búsqueda, los chips, la barra del pin a mano; la lista
 *  de la búsqueda no cuenta, porque se despliega ENCIMA de todo): los botones redondos y, en la computadora, el panel se paran debajo. */
function medirArriba() {
  const app = $('mapa-app'), ar = $('mapa-arriba');
  if (app && ar) app.style.setProperty('--mapa-arriba-h', Math.round(ar.offsetTop + ar.offsetHeight) + 'px');
}

/** Vuelve a medir la hoja en su parada de ahora: cambió lo que asoma (otra ficha, la ruta). */
function medirHoja() { ponerHoja(HOJA, { sinAnimar: true }); }

/* Cuánto del mapa tapa la hoja, publicado para tres cosas que lo necesitan:
     · el crédito de los cuadros y el zoom de Leaflet SUBEN con la hoja (`--mapa-abajo`), como el
       logotipo de Google sube con la suya: la licencia pide que el crédito se vea, y debajo de
       una hoja no se ve. Con la hoja arriba se queda al pie de la búsqueda;
     · la tira de paradas se para encima de la hoja;
     · el botón del asistente, que flota en la esquina de abajo, sube encima de la hoja en vez de
       taparle los botones, y se aparta cuando la hoja sube (la clase del documento). */
function publicarTapa(y, P) {
  const app = $('mapa-app');
  if (!app) return;
  const raiz = document.documentElement;
  if (y == null || !P) {
    app.style.setProperty('--mapa-abajo', '0px');
    raiz.style.removeProperty('--mapa-ia-sube');
    raiz.classList.remove('mapa-hoja-arriba');
    return;
  }
  const visible = Math.max(0, P.alto - y - P.dock);
  const abajo = Math.min(P.alto - P.alta - 40, visible + P.dock);
  app.style.setProperty('--mapa-abajo', Math.max(0, Math.round(abajo)) + 'px');
  /* Con la tira de paradas a la vista, el asistente sube también por encima de ella: en su esquina
     le tapaba el «Cómo llegar» de la tarjeta. */
  const tira = $('mapa-tira');
  const sobreTira = tira && !tira.hidden && tira.offsetParent ? tira.offsetHeight + 26 : 0;
  raiz.style.setProperty('--mapa-ia-sube', Math.round(visible + sobreTira) + 'px');
  raiz.classList.toggle('mapa-hoja-arriba', HOJA !== 'baja');
}

/* ----- Arrastrar la hoja -----
   Solo desde el asa: arrastrar desde la lista pelearía con el desplazamiento de la lista. El
   dedo mueve la hoja sin transición, y al soltar se va a la parada más cercana —o a la
   siguiente, si el gesto fue un tirón—. Un toque sin arrastre es un clic, y el clic del asa sube
   o baja la hoja (eso lo hace `clicCuerpo`). */
function alEmpezarArrastre(ev) {
  const asa = ev.target && ev.target.closest && ev.target.closest('.mapa-hoja-asa');
  const hoja = $('mapa-hoja');
  if (!asa || !hoja || esPanel() || (ev.button != null && ev.button !== 0)) return;
  const y = parseFloat(hoja.style.getPropertyValue('--hoja-y')) || 0;
  _arrastre = { y0: ev.clientY, base: y, ultimo: y, t: Date.now(), v: 0, movio: false, id: ev.pointerId };
}

function alArrastrar(ev) {
  if (!_arrastre || ev.pointerId !== _arrastre.id) return;
  const hoja = $('mapa-hoja');
  const P = paradasHoja();
  if (!hoja || !P) return;
  const dy = ev.clientY - _arrastre.y0;
  if (!_arrastre.movio && Math.abs(dy) < 6) return;
  _arrastre.movio = true;
  hoja.classList.add('sin-animar');
  const y = Math.min(P.baja + 24, Math.max(P.alta, _arrastre.base + dy));
  const ahora = Date.now();
  _arrastre.v = (y - _arrastre.ultimo) / Math.max(1, ahora - _arrastre.t);
  _arrastre.ultimo = y; _arrastre.t = ahora;
  hoja.style.setProperty('--hoja-y', y + 'px');
  publicarTapa(y, P);
}

function alSoltarArrastre(ev) {
  if (!_arrastre || (ev && ev.pointerId !== _arrastre.id)) return;
  const a = _arrastre;
  _arrastre = null;
  if (!a.movio) return;
  /* El clic que sigue a un arrastre no es un toque: si llegara a `clicCuerpo`, la hoja recién
     soltada saltaría a otra parada. */
  const asa = cont && cont.querySelector('.mapa-hoja-asa');
  if (asa) asa.dataset.arrastrada = '1';
  const P = paradasHoja();
  if (!P) return;
  const orden = ['alta', 'media', 'baja'];
  let destino;
  if (Math.abs(a.v) > .5) {
    /* Un tirón: a la parada siguiente en la dirección del dedo. */
    const sig = orden.filter(k => a.v > 0 ? P[k] > a.ultimo : P[k] < a.ultimo);
    destino = sig.length ? sig.sort((x, z) => Math.abs(P[x] - a.ultimo) - Math.abs(P[z] - a.ultimo))[0] : (a.v > 0 ? 'baja' : 'alta');
  } else {
    destino = orden.sort((x, z) => Math.abs(P[x] - a.ultimo) - Math.abs(P[z] - a.ultimo))[0];
  }
  ponerHoja(destino);
}

/** Un toque en el asa: abajo sube a la mitad (o arriba, si es la ficha); lo demás baja. */
function alternarHoja() {
  if (HOJA === 'baja') ponerHoja(SEL ? 'alta' : 'media');
  else ponerHoja('baja');
}

/* ============================================================================
   Los pines
   ============================================================================ */

/* El icono de un pin: la gota de Google Maps, con su forma, su letra o su número. La forma se
   conserva de la decisión 2: lo que todavía no está listo para instalar —vendido y en el
   taller— es un ROMBO (la gota con la punta cuadrada), y lo listo y lo instalado es una GOTA
   redonda. El relleno separa dentro de cada par (hueco o lleno) y la letra lo dice con todas sus
   palabras. El elegido crece, para que se vea cuál nombra la ficha de abajo.

   `iconSize` va en el icono porque Leaflet lo escribe como estilo en línea y le REEMPLAZA la
   clase por la que se le pase. El ancla es la punta de la gota, no su centro: es la punta la que
   marca la entrada de la obra. */
function iconoDe(gr, n, sel) {
  /* Las medidas son las de la hoja de estilos (`.mapa-pin::before`): el cuadrado girado de 24 px
     (30 el elegido) tiene la punta a 32 px de arriba (40 el elegido), y ahí va el ancla. */
  const w = sel ? 40 : 32, h = sel ? 43 : 34, punta = sel ? 40 : 32;
  return L.divIcon({
    className: 'mapa-pin ' + gr.g + (n ? ' ruta' : '') + (sel ? ' sel' : ''),
    html: '<b>' + esc(n ? String(n) : gr.marca) + '</b>',
    iconSize: [w, h], iconAnchor: [w / 2, punta],
  });
}

/* El título es lo que oye quien navega con teclado y lo que ve quien deja el cursor encima: la
   letra del pin sola no es un nombre. */
const tituloDe = (p, gr) => (p.nombre || p.folio_local || 'Proyecto') + ' — ' + gr.palabra;

/* ¿Este pin va marcado? El de la ficha abierta, o con la ruta ordenada la tarjeta de ahora. */
const marcado = id => id === SEL || (!!RUTA && id === _parada && !!_tira && !SEL);

/* Con más cambios que estos, el filtro es otra pantalla y no una lista que se acomoda: cuarenta
   pines creciendo a la vez en un teléfono de gama media es el único momento en que esta
   animación cuesta, y ahí nadie sigue a cada uno con los ojos. */
const TOPE_PINES_ANIMADOS = 40;

/* ----- Los pines entran y salen al filtrar (F33) -----
   Apagar una etapa hacía desaparecer sus pines de golpe, y quien lo hizo no veía CUÁLES se
   habían ido: el mapa quedaba distinto y había que adivinar la diferencia. Antes se vaciaba la
   capa entera con `clearLayers()` y se volvía a armar, y eso tiraba también a los que no
   cambiaron. Ahora se compara por `proyecto_id`: el que se queda no se toca (su nodo es el
   mismo, y con él su foco), el que se va se encoge y el que llega crece, en 160 ms.

   La animación va sobre el elemento del pin con la API de animaciones y NO con una clase de CSS:
   Leaflet coloca cada pin con `transform: translate3d(...)` en línea, y una regla `transform`
   —o una animación que la reemplace— lo mandaría a la esquina del mapa mientras dura. Se
   conserva el traslado que ya trae y se le añade el `scale` detrás.

   `animar` solo lo pide quien filtró (un toque en un chip). El primer pintado, el que sigue a
   guardar un pin o el de una sincronización no animan: ahí los pines no «llegan», ya estaban.
   MARCAS se mantiene al día en el acto, aunque el pin todavía se esté encogiendo, porque
   `seleccionar()` lo consulta. */
function refrescarPines(op) {
  if (!mapa || !capaPines) return;

  const lista = pintables();
  const orden = new Map();
  if (RUTA) RUTA.orden.forEach((p, i) => orden.set(p.id, i + 1));

  const quedan = new Set(lista.map(p => p.id));
  const salen = [...MARCAS.keys()].filter(id => !quedan.has(id));
  const entran = lista.filter(p => !MARCAS.has(p.id)).length;
  const animar = !!(op && op.animar) && !quieto() && entran + salen.length <= TOPE_PINES_ANIMADOS;

  for (const id of salen) {
    const m = MARCAS.get(id);
    MARCAS.delete(id); FIRMAS.delete(id);
    quitarPin(m, animar);
  }

  for (const p of lista) {
    const gr = grupoDe(p.etapa);
    const real = orden.get(p.id) || 0;
    /* Mientras la línea se traza, el pin conserva su letra hasta que ella lo alcanza (F25). */
    const n = (real && _traza && !_traza.hechos.has(p.id)) ? 0 : real;
    const sel = marcado(p.id);
    const icono = gr.g + '|' + n + '|' + (sel ? 1 : 0) + '|' + tituloDe(p, gr);
    let m = MARCAS.get(p.id);

    if (!m) {
      m = L.marker([Number(p.lat), Number(p.lng)], {
        icon: iconoDe(gr, n, sel), title: tituloDe(p, gr), riseOnHover: true,
        zIndexOffset: sel ? 1000 : 0, keyboard: true,
      });
      /* Tocar el pin abre la ficha en la hoja (o, con la ruta ordenada en el teléfono, lleva la
         tira a su tarjeta). Ya no hay globo: ver la decisión 5 de la cabecera. */
      m.on('click', () => alTocarPin(p.id));
      m.addTo(capaPines);
      MARCAS.set(p.id, m);
      FIRMAS.set(p.id, icono);
      if (animar) animarPin(m.getElement(), 'entra');
      continue;
    }

    const ll = m.getLatLng();
    if (ll.lat !== Number(p.lat) || ll.lng !== Number(p.lng)) m.setLatLng([Number(p.lat), Number(p.lng)]);
    if (FIRMAS.get(p.id) !== icono) {
      m.options.title = tituloDe(p, gr);
      m.setIcon(iconoDe(gr, n, sel));
      m.setZIndexOffset(sel ? 1000 : 0);
      FIRMAS.set(p.id, icono);
    }
  }

  dibujarLinea();
}

/** Anima el pin y le devuelve su animación. Ver el porqué del traslado en `refrescarPines`. */
function animarPin(el, tipo) {
  if (!el || typeof el.animate !== 'function') return null;
  const base = el.style.transform ? el.style.transform + ' ' : '';
  const entra = tipo === 'entra';
  const de = entra ? { esc: .3, op: 0 } : { esc: 1, op: 1 };
  const a = entra ? { esc: 1, op: 1 } : { esc: .3, op: 0 };
  try {
    return el.animate([
      { transform: base + 'scale(' + de.esc + ')', opacity: de.op },
      { transform: base + 'scale(' + a.esc + ')', opacity: a.op },
    ], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)', fill: entra ? 'none' : 'forwards' });
  } catch (_) { return null; }
}

/** Saca un pin de la capa. Con `animar`, primero se encoge; mientras tanto ya no responde al dedo,
 *  para que nadie abra la ficha de algo que se está yendo. */
function quitarPin(m, animar) {
  const capa = capaPines;
  const sacar = () => { try { if (capa && capa.hasLayer(m)) capa.removeLayer(m); } catch (_) {} };
  const el = animar && m && m.getElement ? m.getElement() : null;
  const a = el ? animarPin(el, 'sale') : null;
  if (!a) { sacar(); return; }
  el.style.pointerEvents = 'none';
  a.onfinish = sacar; a.oncancel = sacar;
  /* Por si el navegador cancela la animación sin avisar (la pestaña se oculta a medias). */
  setTimeout(sacar, 400);
}

/* ============================================================================
   La ficha de una obra — lo que se necesita en la banqueta, en la hoja de abajo

   Es lo que antes era el globo del pin, y le cabe lo que al globo no: el nombre del negocio y
   su contacto, la etapa con su letra, la fecha de instalación, la dirección como la escribieron
   y una fila de botones grandes en el orden en que se usan al salir: cómo llegar, Waze, escribir
   o llamar al cliente («ya voy llegando»), copiar la dirección. La fila asoma con la hoja abajo
   (`data-asoma`), así que lo de manejar está a un toque sin subir nada.

   Una obra SIN pin también tiene ficha —se llega a ella desde la búsqueda—, y en lugar de cómo
   llegar trae las dos salidas de siempre para ubicarla y una búsqueda de su dirección en Google
   Maps. Esa búsqueda no pone ningún pin (decisión 1): abre Google Maps con el texto, y de ahí
   sale el link bueno que se pega aquí.
   ============================================================================ */

function pintarFicha() {
  const caja = $('mapa-ficha'), lista = $('mapa-lista');
  if (!caja || !lista) return;
  const p = SEL ? PROYS.find(x => x.id === SEL) : null;
  if (SEL && !p) SEL = null;           // se borró o se canceló mientras estaba abierta
  caja.hidden = !p;
  lista.hidden = !!p;
  const app = $('mapa-app');
  if (app) app.classList.toggle('con-ficha', !!p);
  caja.innerHTML = p ? fichaHTML(p) : '';
}

function fichaHTML(p) {
  const gr = grupoDe(p.etapa);
  const f = INST.get(p.id);
  const conPinOk = tienePin(p);
  const n = RUTA ? RUTA.orden.findIndex(x => x.id === p.id) + 1 : 0;
  const titulo = p.negocio || p.nombre || p.folio_local || 'Proyecto sin nombre';
  /* Debajo del negocio, quién recibe y el folio que tiene en la mano. El `nombre` del proyecto no
     se repite: es «contacto - negocio (tipo)», o sea lo mismo que ya dicen estos dos renglones. */
  const sub = [p.contacto, p.folio_local].map(x => String(x || '').trim())
    .filter((x, i, a) => x && a.indexOf(x) === i && x !== titulo);
  const tel = String(p.tel || (p.origen && p.origen.tel) || '').trim();
  const wa = telWa(tel);
  const dir = dirDe(p);

  let fecha;
  if (f && f.viva) {
    fecha = 'Instala ' + cuando(f.fecha) + ' · ' + fmtFechaDia(f.fecha) +
            (f.hora ? ' a las ' + fmtHora(f.hora) : ' (sin hora)');
  } else if (f) {
    fecha = 'Se instaló el ' + fmtFechaDia(f.fecha);
  } else {
    fecha = 'Sin fecha de instalación · se ganó el ' + fmtFecha(p.fecha_ganado);
  }
  const urge = f && f.viva && diasHasta(f.fecha) <= 0;

  /* Los botones de la calle. El primero es el lleno —es el que se busca con el pulgar—, y
     todos son enlaces o botones de 44 px con su palabra: «Waze» con un icono genérico se
     confundiría con «Cómo llegar». */
  const acc = [];
  if (conPinOk) {
    acc.push('<a class="btn btn-pri mapa-ficha-b" target="_blank" rel="noopener" href="' + esc(urlMaps(p)) + '">' +
      ico('i-navegar') + 'Cómo llegar</a>');
    acc.push('<a class="btn btn-gho mapa-ficha-b" target="_blank" rel="noopener" href="' + esc(urlWaze(p)) + '"' +
      ' aria-label="Abrir la ruta en Waze">' + ico('i-camion') + 'Waze</a>');
  } else {
    acc.push('<button type="button" class="btn btn-pri mapa-ficha-b" data-link="' + esc(p.id) + '">' +
      ico('i-copiar') + 'Pegar link</button>');
    acc.push('<button type="button" class="btn btn-gho mapa-ficha-b" data-mano="' + esc(p.id) + '">' +
      ico('i-pin') + 'Pin a mano</button>');
  }
  /* WhatsApp solo con un número que pueda serlo de verdad (ver `telWa`); llamar, con cualquier
     teléfono que haya: un fijo con extensión se marca igual. */
  if (wa) {
    acc.push('<a class="btn btn-wa mapa-ficha-b" target="_blank" rel="noopener" href="' + esc(linkWa(tel)) + '"' +
      ' aria-label="Escribirle por WhatsApp a ' + esc(p.contacto || titulo) + '">' + ico('i-wa') + 'WhatsApp</a>');
  }
  if (tel) {
    acc.push('<a class="btn btn-gho mapa-ficha-b" href="tel:' + esc(tel.replace(/[^\d+]/g, '')) + '"' +
      ' aria-label="Llamar a ' + esc(p.contacto || titulo) + '">' + ico('i-tel') + 'Llamar</a>');
  }
  if (dir || conPinOk) {
    acc.push('<button type="button" class="btn btn-gho mapa-ficha-b" data-copiar-dir="' + esc(p.id) + '">' +
      ico('i-copiar') + 'Copiar dirección</button>');
  }
  if (!conPinOk && dir) {
    acc.push('<a class="btn btn-gho mapa-ficha-b" target="_blank" rel="noopener" href="' + esc(urlBuscar(dir)) + '">' +
      ico('i-buscar') + 'Buscarla en Google Maps</a>');
  }

  /* Con el rol de fabricación el importe NO SE PINTA. No se difumina ni se tacha: el
     elemento no existe, que es la única forma de que no se lea de reojo. */
  let dinero = '';
  if (Prefs.veDinero()) {
    const total = Cot.totalVendido(p.origen);
    if (total > 0) dinero = '<p class="mapa-ficha-dato"><span>Vendido en</span> ' + esc(money(total)) + '</p>';
  }

  /* Tiene pin pero el filtro de arriba no lo pinta: sin decirlo, la ficha nombra una obra que
     no está en el mapa y parece que el pin se perdió. */
  const oculto = conPinOk && !pintables().some(x => x.id === p.id)
    ? '<p class="hintnote nota-av">' + ico('i-aviso') + ' El filtro de arriba no pinta esta obra: cambia ' +
      'las etapas o el rango de fechas para ver su pin.</p>'
    : '';

  return '<div class="mapa-ficha-cab">' +
      pinMini(gr, n ? String(n) : '') +
      '<div class="mapa-ficha-tx">' +
        '<h2 class="mapa-ficha-t">' + esc(titulo) + '</h2>' +
        (sub.length ? '<p class="mapa-ficha-sub">' + esc(sub.join(' · ')) + '</p>' : '') +
      '</div>' +
      '<button type="button" class="pf-cerrar mapa-ficha-x" data-cerrar-ficha aria-label="Cerrar la ficha y volver a la lista">' +
        ico('i-cerrar') + '</button>' +
    '</div>' +
    '<p class="mapa-ficha-etq">' +
      '<span class="pf-etapa ' + esc(claseEtapa(p.etapa)) + '">' + esc(gr.marca + ' · ' + nombreEtapa(p.etapa)) + '</span>' +
      (n ? ' <span class="pf-cuando">parada ' + n + '</span>' : '') +
      (conPinOk ? '' : ' <span class="pf-cuando hoy">sin ubicar</span>') +
    '</p>' +
    '<p class="mapa-ficha-fecha' + (urge ? ' urge' : '') + '">' + ico('i-agenda') + esc(fecha) + '</p>' +
    '<div class="mapa-ficha-acc" data-asoma role="group" aria-label="Qué hacer con esta obra">' + acc.join('') + '</div>' +
    oculto +
    '<div class="mapa-ficha-dir">' +
      '<p class="mapa-ficha-lab">Dirección como la escribieron</p>' +
      '<p class="mapa-dir">' + esc(dir || (conPinOk
        ? 'No escribieron dirección; el pin es lo único que hay.'
        : 'No escribieron dirección. Con esto solo queda ponerle el pin a mano.')) + '</p>' +
    '</div>' +
    dinero +
    '<div class="btn-fila mapa-ficha-pie">' +
      '<button type="button" class="btn btn-gho" data-ver-proyecto="' + esc(p.id) + '">' +
        ico('i-proyectos') + 'Ver el proyecto</button>' +
      (conPinOk ? '<button type="button" class="btn btn-gho" data-link="' + esc(p.id) + '">' +
        ico('i-pin') + 'Cambiar el pin</button>' : '') +
    '</div>';
}

/** El enlace a Google Maps de una obra: el mismo en la ficha y en la tarjeta de la tira. */
function urlMaps(p) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' +
    encodeURIComponent(Number(p.lat) + ',' + Number(p.lng));
}

/** El de Waze, con la navegación ya arrancada: el formato de enlace universal que Waze publica
 *  para abrir la app (o su página, si no está instalada). */
function urlWaze(p) {
  return 'https://waze.com/ul?ll=' + encodeURIComponent(Number(p.lat) + ',' + Number(p.lng)) + '&navigate=yes';
}

/** Una búsqueda de texto en Google Maps. No es un pin: es para encontrar el lugar y volver con su link. */
function urlBuscar(dir) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(String(dir).replace(/\s+/g, ' '));
}

/** Abre la ficha de una obra. Con `volar`, el mapa va a su pin (si tiene) y lo deja en lo que la
 *  hoja no tapa. */
function seleccionar(id, op) {
  const p = PROYS.find(x => x.id === id);
  if (!p || !cont) return;
  if (MANO) cerrarMano();
  SEL = id;
  cerrarSug();
  pintarFicha();
  refrescarPines();
  ponerHoja('baja');
  const cuerpo = $('mapa-hoja-cuerpo');
  if (cuerpo) cuerpo.scrollTop = 0;
  if (!mapa || !tienePin(p)) return;
  if (op && op.volar) moverA(Number(p.lat), Number(p.lng), Math.max(15, mapa.getZoom()));
  else asegurarVisible(Number(p.lat), Number(p.lng));
}

/** Cierra la ficha y vuelve a la lista. El foco regresa a algo que siga existiendo. */
function cerrarFicha(op) {
  if (!SEL) return;
  SEL = null;
  pintarFicha();
  refrescarPines();
  ponerHoja('baja');
  if (op && op.foco) {
    const q = $('mapa-q');
    if (q) { try { q.focus({ preventScroll: true }); } catch (_) {} }
  }
}

/* ============================================================================
   La lista de las obras que se ven en el mapa

   Es la «ubicación a la mano» sin buscar: cada obra pintada, la más próxima a instalarse
   primero, con su pin en chico y un toque para abrir su ficha. Las de la ruta del día ya tienen
   su tarjeta arriba, y las sin pin la suya; esta es la de todo lo demás que el filtro deja ver.
   ============================================================================ */

function pintarObras(pines) {
  const caja = $('mapa-obras');
  if (!caja) return;
  if (!pines.length) { caja.innerHTML = ''; return; }
  const orden = [...pines].sort((a, b) => {
    const fa = INST.get(a.id), fb = INST.get(b.id);
    const va = fa && fa.viva, vb = fb && fb.viva;
    if (va !== vb) return va ? -1 : 1;
    if (va && vb && fa.fecha !== fb.fecha) return fa.fecha < fb.fecha ? -1 : 1;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  });
  caja.innerHTML = '<h2 class="mapa-hoja-h">En el mapa (' + pines.length + ')</h2>' +
    '<ul class="mapa-obras">' + orden.map(p => {
      const gr = grupoDe(p.etapa);
      const f = INST.get(p.id);
      const d = f && f.viva ? 'Instala ' + cuando(f.fecha) + (f.hora ? ' · ' + fmtHora(f.hora) : '')
        : f ? 'Instalada el ' + fmtFecha(f.fecha) : 'Sin fecha de instalación';
      return '<li><button type="button" class="mapa-obra" data-sel="' + esc(p.id) + '">' +
        pinMini(gr) +
        '<span class="mapa-obra-tx"><span class="mapa-obra-t">' + esc(p.negocio || p.nombre || p.folio_local || 'Proyecto') + '</span>' +
        '<span class="mapa-obra-d">' + esc(d + (p.contacto ? ' · ' + p.contacto : '')) + '</span></span>' +
      '</button></li>';
    }).join('') + '</ul>';
}

/* ============================================================================
   La búsqueda de arriba

   Busca en TODAS las obras vivas, no solo en las pintadas: una obra que el filtro esconde, o
   que no tiene pin, también se busca —es justo cuando más se necesita encontrarla—. Sin acentos
   y en minúsculas, como el buscador de Proyectos. Es un combobox con su lista: las flechas
   recorren, Enter abre la marcada (o la primera) y Escape cierra.
   ============================================================================ */

const plano = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const TOPE_SUG = 6;

function buscar(q) {
  const t = plano(q).trim();
  if (!t) return [];
  const partes = t.split(/\s+/);
  return PROYS.filter(p => {
    const txt = plano([p.nombre, p.negocio, p.contacto, p.folio_local, p.tel, p.dir_texto].join(' '));
    return partes.every(w => txt.includes(w));
  }).slice(0, TOPE_SUG);
}

function pintarSug() {
  const q = $('mapa-q'), ul = $('mapa-sug'), x = cont && cont.querySelector('[data-limpiar]');
  if (!q || !ul) return;
  const valor = q.value || '';
  if (x) x.hidden = !valor;
  const hall = buscar(valor);
  if (!valor.trim()) { cerrarSug(); return; }
  if (_sugActiva >= hall.length) _sugActiva = hall.length - 1;
  ul.innerHTML = hall.length
    ? hall.map((p, i) => {
        const gr = grupoDe(p.etapa);
        const d = tienePin(p) ? (p.contacto || nombreEtapa(p.etapa)) : 'Sin ubicar · ' + (p.contacto || nombreEtapa(p.etapa));
        return '<li role="option" id="mapa-sug-' + i + '" class="mapa-sug-i' + (i === _sugActiva ? ' activa' : '') + '"' +
          ' aria-selected="' + (i === _sugActiva ? 'true' : 'false') + '" data-sel="' + esc(p.id) + '">' +
          pinMini(gr) +
          '<span class="mapa-obra-tx"><span class="mapa-obra-t">' + esc(p.negocio || p.nombre || p.folio_local || 'Proyecto') + '</span>' +
          '<span class="mapa-obra-d">' + esc(d) + '</span></span></li>';
      }).join('')
    : '<li class="mapa-sug-nada" role="option" aria-disabled="true">Ninguna obra se llama así. Busca por negocio, contacto, folio o calle.</li>';
  ul.hidden = false;
  q.setAttribute('aria-expanded', 'true');
  if (_sugActiva >= 0) q.setAttribute('aria-activedescendant', 'mapa-sug-' + _sugActiva);
  else q.removeAttribute('aria-activedescendant');
}

function cerrarSug() {
  const q = $('mapa-q'), ul = $('mapa-sug');
  _sugActiva = -1;
  if (ul) { ul.hidden = true; ul.innerHTML = ''; }
  if (q) { q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); }
}

function alEscribir(ev) {
  if (!ev.target || ev.target.id !== 'mapa-q') return;
  _sugActiva = -1;
  pintarSug();
}

function alTeclear(ev) {
  const t = ev.target;
  if (ev.key === 'Escape' && SEL && !(t && t.id === 'mapa-q')) { cerrarFicha({ foco: true }); return; }
  if (!t || t.id !== 'mapa-q') return;
  const ul = $('mapa-sug');
  const n = ul && !ul.hidden ? ul.querySelectorAll('[data-sel]').length : 0;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    if (!n) return;
    ev.preventDefault();
    _sugActiva = ev.key === 'ArrowDown' ? (_sugActiva + 1) % n : (_sugActiva <= 0 ? n - 1 : _sugActiva - 1);
    pintarSug();
    return;
  }
  if (ev.key === 'Enter') {
    ev.preventDefault();
    const items = ul ? ul.querySelectorAll('[data-sel]') : [];
    const it = items[_sugActiva >= 0 ? _sugActiva : 0];
    if (it) elegirSug(it.dataset.sel);
    return;
  }
  if (ev.key === 'Escape') {
    if (ul && !ul.hidden) { ev.preventDefault(); cerrarSug(); }
    else if (t.value) { ev.preventDefault(); t.value = ''; pintarSug(); }
  }
}

/** Elegir un resultado: la caja se queda con su nombre, el teclado del teléfono se cierra y el
 *  mapa va a la obra. */
function elegirSug(id) {
  const p = PROYS.find(x => x.id === id);
  const q = $('mapa-q');
  if (q && p) { q.value = p.negocio || p.nombre || p.folio_local || ''; try { q.blur(); } catch (_) {} }
  const x = cont && cont.querySelector('[data-limpiar]');
  if (x) x.hidden = !(q && q.value);
  seleccionar(id, { volar: true });
}

/* ============================================================================
   Dónde estoy — el punto azul

   Se pide una vez, al tocar el botón, y no se sigue: seguir la posición gasta batería en una
   pantalla que se mira dos minutos por la mañana, y para seguir el camino está Google Maps o
   Waze, a un toque desde la ficha. La posición no se guarda en ningún lado.
   ============================================================================ */

function irAMiUbicacion(boton) {
  if (!mapa) return;
  if (!navigator.geolocation) { toast('Este navegador no sabe dónde estás', 'err', 3600); return; }
  if (boton) boton.classList.add('buscando');
  navigator.geolocation.getCurrentPosition(pos => {
    if (boton) boton.classList.remove('buscando');
    if (!mapa) return;
    const ll = [pos.coords.latitude, pos.coords.longitude];
    const r = Math.min(2000, Math.max(10, pos.coords.accuracy || 30));
    if (_yo) { try { mapa.removeLayer(_yo); } catch (_) {} }
    _yo = L.layerGroup([
      L.circle(ll, { radius: r, className: 'mapa-yo-aro', interactive: false }),
      L.circleMarker(ll, { radius: 8, className: 'mapa-yo', interactive: false }),
    ]).addTo(mapa);
    moverA(ll[0], ll[1], Math.max(14, mapa.getZoom()));
  }, err => {
    if (boton) boton.classList.remove('buscando');
    toast(err && err.code === 1
      ? 'No diste permiso de ubicación. Se cambia en los ajustes del navegador, en este sitio'
      : 'No se pudo saber dónde estás. Prueba otra vez con señal', 'err', 4600);
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}

/** Los puntos de la línea de la ruta, o nada si no hay con qué dibujarla (una sola parada no
 *  tiene línea). */
function puntosDeLaRuta() {
  if (!RUTA || RUTA.orden.length < 2) return [];
  const pts = RUTA.orden.filter(tienePin).map(p => [Number(p.lat), Number(p.lng)]);
  return pts.length < 2 ? [] : pts;
}

/* La línea no se rehace si sus puntos son los mismos. Se llama al final de cada repintado de
   pines —un filtro, una sincronización— y rehacerla cada vez no solo era trabajo de más: era el
   momento exacto en que un trazo a medias (F25) se habría llevado puesto. Devuelve la
   polilínea que hay dibujada, o null. */
function dibujarLinea() {
  if (!capaRuta) return null;
  /* Mientras la ruta espera su turno de trazarse, la línea todavía no existe: nace cuando
     empieza a dibujarse, y no un instante antes punteada entera. */
  if (_traza && !_traza.lanzada) return null;
  const pts = puntosDeLaRuta();
  const clave = pts.map(q => q.join(',')).join(';');
  if (_linea && clave === _lineaClave) return _linea;
  capaRuta.clearLayers();
  _linea = null; _lineaClave = '';
  if (!pts.length) return null;
  /* El color va por CSS con `className` y no por la opción `color`: Leaflet pinta el trazo
     con un atributo de presentación, que cualquier regla de hoja de estilos le gana, y así
     la línea usa el mismo acento del sistema en vez de un azul suelto de la librería. */
  try {
    _linea = L.polyline(pts, { className: 'mapa-ruta-linea', interactive: false }).addTo(capaRuta);
    _lineaClave = clave;
  } catch (e) { console.warn('la línea de la ruta no se pudo dibujar', e); }
  return _linea;
}

/* ----- La ruta se dibuja y se numera al ordenarla (F25) -----
   La línea y los números aparecían de golpe, y una ruta que aparece hecha no dice en qué orden se
   recorre. Ahora la línea se traza de la primera parada a la última en unos 800 ms y cada pin
   cambia su letra por su número cuando la línea llega a él: el orden se lee en el tiempo, no solo
   en los dígitos.

   Pasa UNA vez por pedido de ruta, y por eso se arma en `calcularRuta()` y en ningún otro lado:
   ni al repintar (un filtro, una sincronización) ni al hacer zoom —el zoom redibuja la línea, y
   un trazo que se repitiera en cada acercamiento sería la pantalla moviéndose sola—. Con menos
   movimiento no hay trazo: la línea y los números aparecen enteros.

   Dos cuidados:
     · No arranca hasta que el mapa termina de encuadrar. Mientras Leaflet acerca, el trazo mide
       la línea a una escala y la termina de dibujar a otra; arrancar con la vista final es lo que
       hace que 800 ms sean 800 ms. Si el encuadre no mueve nada, `moveend` igual llega; el
       temporizador de abajo es por si no.
     · El trazo es el de `stroke-dashoffset` sobre el `<path>` que pinta Leaflet; al terminar, la
       animación se suelta sola y vuelve el punteado `7 7` de la hoja de estilos, que es lo que
       dice «orden sugerido, no calle por calle». */
const MS_TRAZO = 800;

function prepararTraza() {
  cancelarTraza();
  if (!mapa || quieto() || puntosDeLaRuta().length < 2) return;
  const t = _traza = { hechos: new Set(), timers: [], lanzada: false, anim: null, alMoverse: null };
  t.alMoverse = () => { if (_traza === t) empezarTraza(t); };
  mapa.on('moveend', t.alMoverse);
  t.timers.push(setTimeout(() => { if (_traza === t && !t.lanzada) empezarTraza(t); }, 900));
}

function empezarTraza(t) {
  if (t.alMoverse && mapa) { mapa.off('moveend', t.alMoverse); }
  t.alMoverse = null;
  t.lanzada = true;
  const linea = dibujarLinea();
  const path = linea && typeof linea.getElement === 'function' ? linea.getElement() : null;
  const largo = path && typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
  if (!(largo > 0) || typeof path.animate !== 'function') { terminarTraza(t); return; }

  t.anim = path.animate([
    { strokeDasharray: largo + 'px', strokeDashoffset: largo + 'px' },
    { strokeDasharray: largo + 'px', strokeDashoffset: '0px' },
  ], { duration: MS_TRAZO, easing: 'linear' });
  t.anim.onfinish = () => terminarTraza(t);

  /* Cada pin cambia cuando la línea llega a él: la fracción del recorrido que lleva andada hasta
     esa parada, por la duración. El trazo es lineal justamente para que esta cuenta sea una
     multiplicación y no la inversa de una curva. */
  const paradas = RUTA.orden.filter(tienePin);
  let total = 0;
  for (let i = 1; i < paradas.length; i++) total += Geo.distanciaKm(paradas[i - 1], paradas[i]);
  let andado = 0;
  paradas.forEach((parada, i) => {
    if (i) andado += Geo.distanciaKm(paradas[i - 1], parada);
    const ms = total > 0 ? Math.round(andado / total * MS_TRAZO) : 0;
    t.timers.push(setTimeout(() => numerarParada(t, parada.id), ms));
  });
}

/** Le pone su número al pin al que la línea acaba de llegar, con un latido breve. */
function numerarParada(t, id) {
  if (_traza !== t) return;
  t.hechos.add(id);
  const m = MARCAS.get(id);
  const p = PROYS.find(x => x.id === id);
  const n = RUTA ? RUTA.orden.findIndex(x => x.id === id) + 1 : 0;
  if (!m || !p || !n) return;
  const gr = grupoDe(p.etapa);
  const sel = marcado(id);
  m.setIcon(iconoDe(gr, n, sel));
  FIRMAS.set(id, gr.g + '|' + n + '|' + (sel ? 1 : 0) + '|' + tituloDe(p, gr));
  const el = m.getElement();
  if (el && typeof el.animate === 'function') {
    const base = el.style.transform ? el.style.transform + ' ' : '';
    try {
      el.animate([
        { transform: base + 'scale(1)' }, { transform: base + 'scale(1.3)', offset: .4 }, { transform: base + 'scale(1)' },
      ], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } catch (_) {}
  }
}

/** El trazo llegó al final: todos los pines con su número, y ya no queda nada pendiente. */
function terminarTraza(t) {
  if (_traza !== t) return;
  t.timers.forEach(clearTimeout);
  _traza = null;
  refrescarPines();
}

function cancelarTraza() {
  const t = _traza;
  if (!t) return;
  _traza = null;
  t.timers.forEach(clearTimeout);
  if (t.alMoverse && mapa) { try { mapa.off('moveend', t.alMoverse); } catch (_) {} }
  if (t.anim) { try { t.anim.cancel(); } catch (_) {} }
}

/* ----- Lo que tapa lo que flota -----
   El mapa ocupa toda la sección y encima flotan la búsqueda, la hoja y —con la ruta ordenada— la
   tira de paradas. Todo lo que el mapa hace con «el centro» —volar a una obra, encuadrar la ruta,
   abrir una ficha— tiene que contar con que esos pedazos no se ven, o el pin al que se fue queda
   justo debajo de la ficha que lo nombra. Devuelve, en píxeles del lienzo, cuánto tapa cada lado:
   arriba la búsqueda y los chips, abajo la hoja (y la tira, si está encima de ella), y a la
   izquierda el panel de la computadora. */
function tapas() {
  const l = $('mapa-lienzo');
  const t = { arriba: 0, abajo: 0, izq: 0 };
  if (!l) return t;
  const L0 = l.getBoundingClientRect();
  const ar = $('mapa-arriba'), hoja = $('mapa-hoja'), tira = $('mapa-tira');
  if (esPanel()) {
    if (hoja) t.izq = Math.max(0, Math.round(hoja.getBoundingClientRect().right - L0.left));
  } else {
    if (ar) t.arriba = Math.max(0, Math.round(ar.getBoundingClientRect().bottom - L0.top));
    /* Se cuenta desde donde la hoja VA a quedar (`--hoja-y`), no desde donde está: quien pide
       volar justo después de mover la hoja la encontraría a media transición. Lo mismo con la
       tira, que se para encima de lo que la hoja tapa (`--mapa-abajo`) más el crédito. */
    let tope = L0.bottom;
    if (hoja) tope = Math.min(tope, L0.top + (parseFloat(hoja.style.getPropertyValue('--hoja-y')) || 0));
    if (tira && !tira.hidden && tira.offsetParent) {
      const app = $('mapa-app');
      const ab = app ? parseFloat(app.style.getPropertyValue('--mapa-abajo')) || 0 : 0;
      tope = Math.min(tope, L0.bottom - ab - 26 - tira.offsetHeight);
    }
    t.abajo = Math.max(0, Math.round(L0.bottom - tope));
  }
  /* Si entre lo de arriba y lo de abajo no queda casi nada (la hoja subida del todo), se cuenta
     solo lo de arriba: centrar en una rendija de veinte píxeles no sirve de nada. */
  if (L0.height - t.arriba - t.abajo < 120) t.abajo = 0;
  return t;
}

/** Mueve el mapa para que (lat, lng) quede en el centro de lo que SÍ se ve: no detrás de la
 *  hoja ni de la búsqueda. Vuela en vez de saltar, salvo con menos movimiento. */
function moverA(lat, lng, zoom) {
  if (!mapa) return;
  const t = tapas();
  const corre = L.point(t.izq / 2, (t.arriba - t.abajo) / 2);
  const destino = mapa.unproject(mapa.project(L.latLng(lat, lng), zoom).subtract(corre), zoom);
  if (quieto()) mapa.setView(destino, zoom);
  else mapa.flyTo(destino, zoom, { duration: .6 });
}

/** El pin que se acaba de tocar ya está en pantalla, pero la ficha que sube puede taparlo. Solo
 *  si queda tapado se corre el mapa, y lo justo: mover el mapa debajo del dedo sin necesidad es
 *  quitárselo a quien lo estaba mirando. */
function asegurarVisible(lat, lng) {
  if (!mapa) return;
  const t = tapas();
  const tam = mapa.getSize();
  const pt = mapa.latLngToContainerPoint([lat, lng]);
  const margen = 48;
  const dentro = pt.x > t.izq + margen && pt.x < tam.x - margen &&
                 pt.y > t.arriba + margen && pt.y < tam.y - t.abajo - margen;
  if (!dentro) moverA(lat, lng, mapa.getZoom());
}

function encuadrar() {
  if (!mapa) return;
  /* Con menos movimiento el encuadre salta en vez de deslizar y acercarse: Leaflet anima sus
     acercamientos por su cuenta —escala los cuadros durante un cuarto de segundo— y esa
     preferencia no la lee. */
  const op = { animate: !quieto() };
  const lista = (RUTA ? RUTA.orden : pintables()).filter(tienePin);
  if (!lista.length) { mapa.setView([Geo.centroGDL.lat, Geo.centroGDL.lng], 11, op); return; }
  if (lista.length === 1) {
    const t = tapas();
    const corre = L.point(t.izq / 2, (t.arriba - t.abajo) / 2);
    const c = mapa.unproject(mapa.project([Number(lista[0].lat), Number(lista[0].lng)], 15).subtract(corre), 15);
    mapa.setView(c, 15, op);
    return;
  }
  const t = tapas();
  try {
    mapa.fitBounds(L.latLngBounds(lista.map(p => [Number(p.lat), Number(p.lng)])),
      { paddingTopLeft: [28 + t.izq, 40 + t.arriba], paddingBottomRight: [28, 28 + t.abajo], maxZoom: 16, animate: op.animate });
  } catch (e) { console.warn('no se pudo encuadrar', e); }
}

/** Ir al pin que se acaba de guardar y abrir su ficha. Guardar un pin sin ver dónde cayó es
 *  guardar a ciegas, y un pin en la colonia de al lado se ve igual de convincente. */
function volarA(id) {
  const p = PROYS.find(x => x.id === id);
  if (!mapa || !tienePin(p)) return;
  seleccionar(id, { volar: true });
  if (MARCAS.get(id)) return;
  /* El pin se guardó pero el filtro de arriba no lo pinta —lo más común: no tiene fecha de
     instalación y el rango son 15 días—. Sin este aviso el mapa se va a un lugar vacío y
     parece que no se guardó nada. La ficha también lo dice, pero la ficha no se lee al vuelo. */
  toast('El pin quedó guardado. Este filtro no lo pinta: cambia el rango de fechas o las etapas para verlo', '', 5200);
}

/** El mapa terminó de moverse: si se está poniendo un pin a mano, su centro es la cruz. */
function alTerminarDeMoverse() {
  alMoverseConMano();
}

/* ============================================================================
   La ruta del día — un heurístico, y la pantalla lo dice
   ============================================================================ */

function calcularRuta() {
  const puntos = deHoy();
  if (!puntos.length) {
    toast('Hoy no hay instalaciones con pin. Si hay obra hoy, ubícala en la lista de sin ubicar y vuelve a darle', '', 4600);
    return;
  }
  /* Se arranca desde el centro de Guadalajara porque el taller no tiene coordenada guardada
     en ningún lado. Es un supuesto y se dice en el panel: quien sale de Tlaquepaque a las
     siete sabe leer el orden y empezar por la segunda. */
  const orden = Geo.rutaVecinoMasCercano(puntos, Geo.centroGDL);
  RUTA = { orden, km: Geo.largoRutaKm(orden, Geo.centroGDL) };
  /* El mapa se deja en lo de hoy: una ruta numerada entre veinte pines de otros días se lee
     como veinte paradas. */
  RANGO = 'hoy';
  /* La ficha abierta se cierra y la hoja baja: lo que se pidió es ver la ruta, y la ruta es el
     mapa con sus números y la tira de paradas encima de la hoja. */
  SEL = null;
  HOJA = 'baja';
  refrescarPiezas();
  /* El orden de las cuatro líneas de abajo importa (F25). Primero se arma el trazo, que deja los
     pines con su letra y la línea sin dibujar; luego se pintan los pines; y recién después se
     encuadra, porque el trazo arranca cuando el mapa termina de moverse y tiene que estar
     escuchando antes de que empiece a hacerlo. */
  prepararTraza();
  refrescarPines();
  encuadrar();
}

function pintarRuta() {
  const caja = $('mapa-ruta');
  if (!caja) return;
  /* Sin ruta la tarjeta NO desaparece: se queda chica y dice por qué. Vacía, en el monitor la
     columna de la derecha medía 0 px cuando además nada estaba sin pin, y el 40 % de la
     pantalla al lado del mapa quedaba en blanco: parecía una pantalla rota. En la hoja de abajo
     una tarjeta corta no estorba. Dos casos, porque se arreglan distinto: hay paradas y falta
     ordenarlas —el botón está al principio de la hoja—, o no hay. */
  if (!RUTA) {
    const n = deHoy().length;
    caja.innerHTML = '<div class="card"><div class="card-h"><h2>' + ico('i-camion') +
      'La ruta de hoy</h2></div><div class="card-b"><p class="pf-fila-d">' + (n
        ? (n === 1 ? 'Hoy hay 1 parada con pin.' : 'Hoy hay ' + n + ' paradas con pin.') +
          ' «Ordenar la ruta de hoy», aquí arriba, las pone en orden para no cruzar la ciudad tres veces.'
        : 'Hoy no hay instalaciones con fecha y pin. Cuando las haya, aquí sale el orden de las paradas para no cruzar la ciudad tres veces.') +
      '</p></div></div>';
    return;
  }

  const filas = RUTA.orden.map((p, i) => {
    const f = INST.get(p.id);
    return '<div class="pf-fila">' +
      '<span class="pf-fila-ico" aria-hidden="true">' + (i + 1) + '</span>' +
      '<span class="pf-fila-tx">' +
        '<span class="pf-fila-t">' + esc(p.nombre || p.folio_local || 'Proyecto') + '</span>' +
        '<span class="pf-fila-d">' +
          /* El día se escribe cuando NO es hoy. Una parada atrasada en la ruta del día es
             correcta —hay que ir— pero si dijera solo la hora, parecería de hoy. */
          esc((f && f.fecha && f.fecha < HOY ? 'Atrasada del ' + fmtFecha(f.fecha) + ' · ' : '') +
              (f && f.hora ? 'A las ' + fmtHora(f.hora) : 'Sin hora')) +
          (p.entrecalles ? ' · ' + esc(p.entrecalles) : '') + '</span>' +
      '</span>' +
      '<span class="pf-fila-acc">' +
        '<button type="button" class="btn btn-gho pf-btn-corto" data-ver="' + esc(p.id) + '">' +
          'Ver en el mapa</button>' +
      '</span>' +
    '</div>';
  }).join('');

  caja.innerHTML = '<div class="card"><div class="card-h"><h2>' + ico('i-camion') +
    'La ruta de hoy</h2></div><div class="card-b">' +
    '<p class="hintnote nota-av">' +
      (RUTA.orden.length === 1 ? 'Es 1 parada y unos ' : 'Son ' + RUTA.orden.length + ' paradas y unos ') +
      esc(String(RUTA.km)) + ' km en línea recta, empezando desde el centro de Guadalajara ' +
      '—el taller no tiene pin guardado, así que si sales de otro lado, lee el orden y ' +
      'empieza por la que te quede—. Van también las instalaciones atrasadas que nadie ' +
      'marcó, porque siguen debiendo una visita. No es la ruta óptima y no pretende serlo: ' +
      'es «no cruces la ciudad tres veces». Por calle sale entre 20 % y 40 % más largo, y ' +
      'el orden casi nunca cambia por eso.</p>' +
    /* Las filas van en su propia caja para que el teléfono pueda esconderlas cuando las paradas
       están en la tira de arriba (F12): la nota de la salida supuesta se queda a la vista, que es
       lo que tiene que leer quien sale. */
    '<div class="mapa-ruta-filas">' + filas + '</div>' +
    '</div></div>';
}

/* ============================================================================
   Las paradas del día, como tarjetas sobre el mapa (F12)

   En el teléfono la ruta era una lista DEBAJO del mapa: para ver una parada había que bajar, tocar
   «Ver en el mapa» y volver a subir con el mapa ya movido. Ahora, con la ruta ordenada, una tira
   de tarjetas se para encima de la hoja de abajo: deslizar a la siguiente lleva el mapa a esa
   parada y marca su pin; tocar un pin lleva la tira a su tarjeta; tocar la tarjeta abre la ficha
   de la obra (con Waze, WhatsApp y lo demás). Deslizar ES recorrer la ruta.

   El deslizamiento es el de siempre —scroll-snap, que el pulgar ya conoce— y lo que la pieza
   `Piezas.paginas()` pone encima es lo que el scroll-snap no trae: saber en qué tarjeta se quedó,
   anunciarla («Parada 2 de 4») cuando se asienta, y las flechas del teclado con la tira enfocada.
   Sin puntos: la tarjeta siguiente asoma por el borde, y los números van dentro de cada tarjeta.

   Tres cuidados que son de esta pantalla:
     · La tira NO tapa el crédito de los cuadros, que exige su licencia: la hoja de estilos la
       para sobre él y sobre la hoja (`--mapa-abajo` más `--mapa-cred`), y las pruebas miden que
       sus cajas no se toquen.
     · Las filas de la ruta de la hoja se esconden en el teléfono mientras la tira existe, y se
       quedan en la computadora, donde la tira no se ve. No es la tira la que queda sin lector de pantalla: es
       una región con un grupo por parada, con su número y su nombre, y con la misma instrucción.
       Dos listas con el mismo contenido en el mismo teléfono serían leer cada parada dos veces.
     · Lo que la pieza avisa al pintar la tira (la primera tarjeta «es la de ahora») no manda al
       mapa a ningún lado: la ruta se acaba de encuadrar entera y lo último que se quiere es que
       un aviso de arranque la cambie por el primer pin. */
function pintarTira() {
  const tira = $('mapa-tira'), caja = $('mapa-caja'), ruta = $('mapa-ruta');
  if (!tira) return;
  const P = piezas();
  const hay = !!(mapa && RUTA && RUTA.orden.length && P.paginas);
  if (ruta) ruta.classList.toggle('con-tira', hay);

  /* La firma son las paradas en su orden y sus horas: si no cambió, la tira se queda como está,
     con su posición, y un filtro que repinta la pantalla entera no le quita el dedo de encima. */
  const firma = hay ? RUTA.orden.map(x => x.id + '@' + ((INST.get(x.id) || {}).hora || '') +
    '@' + ((INST.get(x.id) || {}).fecha || '')).join('|') : '';
  if (firma === _firmaTira) return;
  _firmaTira = firma;
  _parada = null;
  clearTimeout(_tParada); _tParada = 0;

  if (!hay) {
    tira.hidden = true; tira.innerHTML = '';
    if (caja) caja.classList.remove('con-tira');
    if (mapa) { try { mapa.invalidateSize({ animate: false }); } catch (_) {} }
    return;
  }

  _silenciarTira = true;
  setTimeout(() => { _silenciarTira = false; }, 0);
  const n = RUTA.orden.length;
  tira.innerHTML = RUTA.orden.map((x, i) => {
    const f = INST.get(x.id);
    const cuando = (f && f.fecha && f.fecha < HOY ? 'Atrasada del ' + fmtFecha(f.fecha) + ' · ' : '') +
      (f && f.hora ? 'A las ' + fmtHora(f.hora) : 'Sin hora');
    return '<article class="mapa-parada" data-parada="' + esc(x.id) + '" aria-label="Parada ' + (i + 1) + ' de ' + n + '">' +
      '<span class="mapa-parada-n" aria-hidden="true">' + (i + 1) + '</span>' +
      '<span class="mapa-parada-tx">' +
        '<span class="mapa-parada-t">' + esc(x.nombre || x.folio_local || 'Proyecto') + '</span>' +
        '<span class="mapa-parada-d">' + esc(cuando) + '</span>' +
      '</span>' +
      '<a class="btn btn-pri pf-btn-corto mapa-parada-ir" target="_blank" rel="noopener" href="' + esc(urlMaps(x)) + '">' +
        ico('i-navegar') + 'Cómo llegar</a>' +
    '</article>';
  }).join('');
  tira.hidden = false;
  if (caja) caja.classList.add('con-tira');
  if (mapa) { try { mapa.invalidateSize({ animate: false }); } catch (_) {} }

  if (!_tira) {
    _tira = P.paginas(tira, {
      nombre: 'parada', etiqueta: 'Paradas de hoy, desliza para pasar a la siguiente',
      puntos: false, flechas: false, alCambiar: alCambiarParada,
    });
  } else if (typeof _tira.medir === 'function') _tira.medir();
}

/** La pieza avisa que la tarjeta «de ahora» es otra: el mapa va a esa parada. Se espera a que la
 *  tira se asiente (140 ms), porque deslizar por encima de tres tarjetas no es pedir tres vuelos. */
function alCambiarParada(i, pagina) {
  const id = pagina && pagina.dataset ? pagina.dataset.parada : null;
  if (!id) return;
  if (_silenciarTira) { _parada = id; return; }
  clearTimeout(_tParada);
  if (id === _parada || Date.now() < _ignorarTiraHasta) return;
  _tParada = setTimeout(() => {
    _tParada = 0;
    if (!mapa || id === _parada || Date.now() < _ignorarTiraHasta) return;
    _parada = id;
    irAParada(id);
  }, 140);
}

/** El mapa vuela a una parada y su pin se marca (el más grande), que es lo que antes hacía el globo. */
function irAParada(id) {
  const x = PROYS.find(q => q.id === id);
  if (!mapa || !tienePin(x)) return;
  refrescarPines();
  moverA(Number(x.lat), Number(x.lng), 16);
}

/** ¿Está la tira a la vista? En la computadora la esconde la hoja de estilos, y con una ficha
 *  abierta también: la ficha dice lo mismo y más. */
const tiraVisible = () => {
  const t = $('mapa-tira');
  return !!(_tira && RUTA && t && !t.hidden && t.offsetParent);
};

/** Tocar una tarjeta: abre la ficha de esa obra, con el mapa en su pin. Si era la de al lado, la
 *  tira la centra primero, para que al cerrar la ficha se vuelva a la misma parada. */
function alTocarTarjeta(id) {
  const i = RUTA ? RUTA.orden.findIndex(x => x.id === id) : -1;
  if (i < 0) return;
  _parada = id;
  clearTimeout(_tParada);
  _ignorarTiraHasta = Date.now() + (quieto() ? 250 : 900);
  if (_tira) _tira.ir(i);
  seleccionar(id, { volar: true });
}

/** Tocar un pin. Con la ruta ordenada y la tira a la vista, la tira se corre a su tarjeta y el pin
 *  se marca: la tarjeta ya nombra la obra y tiene «Cómo llegar», y tocarla abre la ficha entera.
 *  Mientras se corre no manda al mapa de vuelta (de lo contrario, la tarjeta por la que pasa de
 *  camino se lo llevaría). En cualquier otro caso, el pin abre su ficha. */
function alTocarPin(id) {
  if (MANO) return;
  const i = RUTA ? RUTA.orden.findIndex(x => x.id === id) : -1;
  if (i >= 0 && !SEL && tiraVisible()) {
    _parada = id;
    clearTimeout(_tParada);
    _ignorarTiraHasta = Date.now() + (quieto() ? 250 : 900);
    _tira.ir(i);
    refrescarPines();
    return;
  }
  seleccionar(id);
}

/* ============================================================================
   Los que no tienen pin
   ============================================================================ */

function pintarFaltan(faltan) {
  const caja = $('mapa-faltan');
  if (!caja) return;
  if (!faltan.length) { caja.innerHTML = ''; return; }

  const filas = faltan.map(p => {
    const f = INST.get(p.id);
    const dias = f ? diasHasta(f.fecha) : null;
    const urge = dias !== null && dias <= 3;
    const dir = dirDe(p);
    return '<div class="pf-fila">' +
      '<span class="pf-fila-ico' + (urge ? ' urge' : '') + '">' + ico('i-pin') + '</span>' +
      '<span class="pf-fila-tx">' +
        '<span class="pf-fila-t">' + esc(p.nombre || p.folio_local || 'Proyecto') + ' ' +
          '<span class="pf-etapa ' + esc(claseEtapa(p.etapa)) + '">' +
            esc(nombreEtapa(p.etapa)) + '</span>' +
          (f ? ' <span class="pf-cuando' + (urge ? ' hoy' : '') + '">' + esc(cuando(f.fecha)) + '</span>' : '') +
        '</span>' +
        /* La dirección va como la escribieron, con sus renglones. Reacomodarla es lo que
           convierte «interior 4, atrás de la farmacia» en una calle que no existe. */
        '<span class="pf-fila-d mapa-dir">' + esc(dir || 'No escribieron dirección. Con esto solo queda ponerle el pin a mano.') + '</span>' +
      '</span>' +
      '<span class="pf-fila-acc">' +
        '<button type="button" class="btn btn-gho pf-btn-corto" data-link="' + esc(p.id) + '">' +
          ico('i-copiar') + 'Pegar link</button>' +
        '<button type="button" class="btn btn-gho pf-btn-corto" data-mano="' + esc(p.id) + '">' +
          ico('i-pin') + 'Pin a mano</button>' +
      '</span>' +
    '</div>';
  }).join('');

  caja.innerHTML = '<div class="card mapa-sinubicar"><div class="card-h"><h2>' +
    'Sin ubicar (' + faltan.length + ')</h2></div><div class="card-b">' +
    '<p class="hintnote">Estas obras no tienen pin, y no se inventa uno: un pin equivocado ' +
      'parece un dato y un dato equivocado se usa. Se arregla de dos maneras — pegando el ' +
      'link de Google Maps que mandaron por WhatsApp, o tocando el mapa donde está.</p>' +
    filas + '</div></div>';
}

function dirDe(p) {
  const partes = [];
  const d = String(p.dir_texto || (p.origen && p.origen.dirRaw) || '').trim();
  if (d) partes.push(d);
  const e = String(p.entrecalles || '').trim();
  if (e) partes.push('Entre ' + e);
  return partes.join('\n');
}

/* ============================================================================
   Poner el pin a mano — mover el mapa, no el dedo (F9)

   Antes había que tocar el mapa donde estaba la obra y luego arrastrar un pin de 26 px para
   acomodarlo. En el teléfono, el dedo tapa justo el punto que se quiere marcar, y la mira en cruz
   del cursor solo existía con ratón. Ahora, mientras se pone un pin a mano, una retícula de cuatro
   esquinas se queda FIJA en el centro del lienzo y lo que se mueve es el mapa debajo: el dedo
   arrastra la calle hasta que la cruz cae en la entrada, y «Guardar aquí» guarda el centro del
   mapa. Tocar sigue sirviendo, pero para saltar cerca: el mapa corre hasta dejar ese punto bajo
   la cruz.

   Se conserva lo que importaba de antes:
     · NADA SE GUARDA SIN «GUARDAR AQUÍ». El centro del mapa es siempre una coordenada válida, y
       justo por eso no se toma sola: un mapa recién abierto está centrado en Guadalajara, y
       guardar eso sería poner un pin en medio de la ciudad que parece un dato. El botón se
       enciende cuando el mapa se movió (o se tocó) por primera vez desde que se abrió el modo.
     · LA RETÍCULA ES UNA PIEZA COMPARTIDA (`Piezas.reticulaHTML`) con contorno de la superficie
       del tema, para que se lea de día y de noche, y no recibe toques: el mapa de abajo sigue
       siendo el que se arrastra. Va por debajo de los controles de Leaflet (z-index 500 contra
       sus 800) para no tapar el zoom ni el crédito.
     · LA ALTERNATIVA DE TECLADO ES LA DEL MAPA: con el lienzo enfocado, las flechas lo mueven y
       +/− acercan, así que quien no puede arrastrar mueve el mapa debajo de la cruz.

   La coordenada se guarda al terminar de moverse el mapa (`moveend`), no en cada cuadro del
   arrastre, y el botón lee el centro en el momento de tocarlo. */

function abrirMano(id) {
  const p = PROYS.find(x => x.id === id);
  if (!p) return;
  if (!mapa) { toast('El mapa no cargó, así que no hay dónde tocar. Pega el link de Google Maps', 'err', 4600); return; }
  MANO = { id, nombre: p.nombre || p.folio_local || 'la obra', lat: null, lng: null, tocado: false,
           centro: mapa.wrapLatLng(mapa.getCenter()) };
  /* El mapa se destapa solo: el botón que se acaba de tocar está en la hoja o en la ficha, y la
     instrucción «mueve el mapa» con el mapa tapado es una instrucción a ciegas. La ficha se
     cierra y la hoja baja; la barra del modo flota arriba, debajo de la búsqueda. */
  SEL = null;
  pintarFicha();
  refrescarPines();
  ponerReticula();
  pintarModo();
  ponerHoja('baja');
  const div = $('mapa-lienzo');
  if (div) {
    /* El foco pasa al mapa para que las flechas lo muevan sin tener que buscarlo con el
       tabulador. Con ratón o dedo no se nota (el anillo es de teclado). */
    try { div.focus({ preventScroll: true }); } catch (_) {}
  }
}

function cerrarMano() {
  const id = MANO ? MANO.id : null;
  MANO = null;
  quitarReticula();
  pintarModo();
  medirHoja();
  /* Cancelar deja el foco donde estaba: en el «Pin a mano» de esa obra, si la lista sigue ahí. */
  if (id && cont) {
    const b = [...cont.querySelectorAll('[data-mano]')].find(x => x.dataset.mano === id);
    if (b) { try { b.focus({ preventScroll: true }); } catch (_) {} }
  }
}

function ponerReticula() {
  const div = $('mapa-lienzo'), P = piezas();
  if (!div || !P.reticulaHTML || div.querySelector('.mapa-reticula')) return;
  div.insertAdjacentHTML('beforeend', P.reticulaHTML({ clase: 'mapa-reticula' }));
}

function quitarReticula() {
  const div = $('mapa-lienzo');
  const r = div && div.querySelector('.mapa-reticula');
  if (r) r.remove();
}

/** Tocar el mapa en este modo salta cerca: el punto tocado pasa a quedar bajo la cruz. Fuera de
 *  él, tocar el mapa (no un pin) cierra la ficha y la búsqueda, como en Google Maps. */
function alTocarMapa(ev) {
  if (!MANO) {
    cerrarSug();
    if (SEL) cerrarFicha();
    return;
  }
  if (!ev || !ev.latlng || !mapa) return;
  mapa.panTo(ev.latlng, { animate: !quieto() });
}

/** El mapa terminó de moverse con el modo puesto: su centro es donde está la cruz. Redimensionar o
 *  abrir una ficha también mueven el mapa; mientras el centro sea el mismo de cuando se abrió el
 *  modo, no cuenta como haber puesto nada. */
function alMoverseConMano() {
  if (!MANO || !mapa) return;
  const c = mapa.wrapLatLng(mapa.getCenter());
  const movido = Math.abs(c.lat - MANO.centro.lat) > 1e-7 || Math.abs(c.lng - MANO.centro.lng) > 1e-7;
  if (!movido && !MANO.tocado) return;
  MANO.lat = c.lat; MANO.lng = c.lng;
  if (MANO.tocado) return;
  MANO.tocado = true;
  /* Solo se enciende el botón. Repintar toda la barra aquí le quitaría el foco a quien esté en
     «Cancelar», y la barra es una región `role="status"` que volvería a leerse entera. */
  const ok = cont && cont.querySelector('[data-mano-ok]');
  if (ok) ok.disabled = false;
}

function pintarModo() {
  const caja = $('mapa-modo');
  const div = $('mapa-lienzo');
  if (div) div.classList.toggle('poniendo', !!MANO);
  if (!caja) return;
  if (!MANO) { caja.innerHTML = ''; return; }

  caja.innerHTML = '<div class="hintnote nota-av mapa-modo" role="status">' +
    '<span>Mueve el mapa hasta que la cruz quede en la entrada de <b>' + esc(MANO.nombre) + '</b>.</span>' +
    /* «Guardar aquí» está desde el principio —apagado hasta que el mapa se mueva—: si aparecía
       después, la barra cambiaba de alto justo bajo el dedo y empujaba el mapa. */
    '<button type="button" class="btn btn-ok pf-btn-corto" data-mano-ok' + (MANO.tocado ? '' : ' disabled') + '>' +
      ico('i-check') + 'Guardar aquí</button>' +
    '<button type="button" class="btn btn-gho pf-btn-corto" data-mano-no>Cancelar</button>' +
    '</div>';
}

async function guardarMano() {
  if (!MANO || !MANO.tocado || !mapa) return;
  /* El centro de AHORA, no el del último `moveend`: es exactamente donde el ojo ve la cruz. Y
     envuelto, porque un mapa arrastrado más allá de la línea de cambio de fecha da longitudes
     fuera de ±180 que ningún lugar de México tiene. */
  const c = mapa.wrapLatLng(mapa.getCenter());
  const lat = Math.round(c.lat * 1e6) / 1e6, lng = Math.round(c.lng * 1e6) / 1e6;
  const id = MANO.id;
  const r = await Proyectos.actualizar(id, { lat, lng, geo_fuente: 'manual' });
  if (!avisarResultado(r, 'Pin puesto a mano')) return;
  cerrarMano();
  await cargar();
  volarA(id);
}

/* ============================================================================
   Pegar el link de Google Maps — 'pf-pide'

   `Geo.parseGmaps` resuelve el link con expresiones regulares y sin una sola petición de
   red: es lo único de la ubicación que funciona en fase 1, en el taller, sin señal y sin
   llaves de nadie.
   ============================================================================ */

function abrirLink(id) {
  const p = PROYS.find(x => x.id === id);
  if (!p) return;
  PIDE = { id, nombre: p.nombre || p.folio_local || 'la obra', dir: dirDe(p), aviso: null, valor: p.maps_url || '' };
  pintarPide();
  abrirCapa('pf-pide', { hist: true });
}

function cerrarPide() {
  PIDE = null;
  cerrarCapa('pf-pide');
  const capa = $('pf-pide');
  if (capa) capa.innerHTML = '';
}

function pintarPide() {
  const capa = $('pf-pide');
  if (!capa || !PIDE) return;
  const a = PIDE.aviso;
  capa.innerHTML = '<div class="pf-panel">' +
    '<div class="pf-panel-h"><h2>Ubicar ' + esc(PIDE.nombre) + '</h2>' +
      '<button type="button" class="pf-cerrar" data-pide="cerrar" aria-label="Cerrar">' +
      ico('i-cerrar') + '</button></div>' +
    '<div class="pf-panel-b">' +
      (PIDE.dir ? '<dl class="pf-dato"><dt>Dirección como la escribieron</dt>' +
        '<dd class="mapa-dir">' + esc(PIDE.dir) + '</dd></dl>' : '') +
      '<div class="fld"><label for="mapa-link">El link de Google Maps</label>' +
        '<textarea id="mapa-link" rows="3" placeholder="https://www.google.com/maps/place/…">' +
        esc(PIDE.valor) + '</textarea></div>' +
      '<div class="btn-fila">' +
        '<button type="button" class="btn btn-gho" data-pide="pegar">' + ico('i-copiar') + 'Pegar</button>' +
        (PIDE.dir ? '<button type="button" class="btn btn-gho" data-pide="copiardir">' +
          ico('i-copiar') + 'Copiar dirección</button>' : '') +
      '</div>' +
      (a ? '<p class="hintnote nota-av">' + ico('i-aviso') + ' ' + esc(a.txt) + '</p>' : '') +
      '<p class="hintnote">El link se lee aquí mismo, sin internet. Si te llegó el corto de ' +
        'WhatsApp (maps.app.goo.gl) no sirve tal cual: ábrelo, espera que cargue el mapa y ' +
        'copia el link de la barra de direcciones.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Cancelar</button>' +
      (a && a.forzar
        ? '<button type="button" class="btn btn-pri" data-pide="forzar">Guardarlo así</button>'
        : '<button type="button" class="btn btn-pri" data-pide="guardar">Poner el pin</button>') +
    '</div></div>';
}

async function guardarLink(forzar) {
  if (!PIDE) return;
  const campo = $('mapa-link');
  const url = campo ? String(campo.value || '').trim() : '';
  PIDE.valor = url;

  if (!url) {
    PIDE.aviso = { txt: 'Falta el link. Pégalo en el campo de arriba.' };
    pintarPide(); return;
  }

  const r = Geo.parseGmaps(url);

  if (!r) {
    PIDE.aviso = { txt: 'Ese texto no trae coordenadas. El link bueno es el que sale de ' +
      '«Compartir» en Google Maps con el mapa ya cargado, y trae números con punto decimal.' };
    pintarPide(); return;
  }
  /* El link corto no se puede expandir desde el navegador y no hay truco: la redirección no
     manda el encabezado que haría falta para leerla. El texto de por qué vive en geo.js
     porque tres pantallas dicen lo mismo y tienen que decirlo igual. */
  if (r.corto) { PIDE.aviso = { txt: r.mensaje }; pintarPide(); return; }

  if (r.sospechoso && !forzar) {
    PIDE.aviso = { forzar: true, txt: 'Ese pin cae fuera de México (' +
      r.lat.toFixed(4) + ', ' + r.lng.toFixed(4) + '). Casi siempre es un link a medio ' +
      'copiar. Revísalo, o guárdalo así si de verdad es ahí.' };
    pintarPide(); return;
  }

  /* El vocabulario de `geo_fuente` de §4.4 tiene cinco valores y `parseGmaps` distingue
     seis maneras de sacar la coordenada. Lo que importa después es una sola cosa: si el par
     era el del lugar o el de la cámara, que es lo que decide si el pin es exacto. */
  const fuente = r.exacta ? 'maps_pin' : 'maps_camara';
  const id = PIDE.id;
  const res = await Proyectos.actualizar(id,
    { lat: r.lat, lng: r.lng, geo_fuente: fuente, maps_url: url });
  if (!avisarResultado(res, r.exacta
    ? 'Pin puesto donde marca el link'
    : 'Pin puesto donde apuntaba la cámara del link — revísalo en el mapa')) return;

  cerrarPide();
  await cargar();
  volarA(id);
}

/* ----- «Copiar dirección» confirma en el botón (F31) -----
   Lo único que decía que se copió era el aviso de abajo; el botón que se tocó no cambiaba, y con el
   panel abierto y el pulgar encima nadie mira abajo. Durante un segundo y medio el icono del botón
   es una palomita que se dibuja y el rótulo dice «Copiada».

   `copiarTexto()` ya lo hace solo con «Copiado» —sale del clic que corre—; aquí se llama a la pieza
   directamente para poder decir «Copiada», que es como se dice de una dirección. El aviso de abajo
   se queda, con su instrucción («búscala en Google Maps y regresa con el link»), y así lo que oye
   un lector de pantalla no cambia: el botón confirma con los ojos y el aviso con la voz. */
function copiarDireccion(dir, boton, aviso) {
  /* Desde el panel del link, el aviso dice qué hacer con ella; desde la ficha, que se copió y ya:
     ahí se copia para pegarla en otro lado (un mensaje, otra app de mapas). */
  const msg = aviso || 'Dirección copiada — búscala en Google Maps y regresa con el link';
  const P = piezas();
  if (!P.copiar) { copiarTexto(dir, msg); return; }
  P.copiar(dir, { boton, ok: 'Copiada', ms: 1500 }).then(bien => {
    if (bien) toast(msg, 'ok', 3400);
    else toast('Este navegador no dejó copiar — selecciona el texto a mano', 'err', 4200);
  });
}

async function pegarDelPortapapeles() {
  const campo = $('mapa-link');
  if (!campo) return;
  try {
    const t = await navigator.clipboard.readText();
    if (!t) { toast('El portapapeles está vacío', '', 3000); return; }
    campo.value = t.trim();
    campo.focus();
  } catch (_) {
    /* En iOS y en Firefox leer el portapapeles no se permite sin permiso explícito. No es
       un error del usuario, así que se le dice qué hacer en su lugar. */
    toast('Este navegador no dejó leer el portapapeles. Mantén el dedo en el campo y elige Pegar', '', 4600);
    campo.focus();
  }
}

/* ============================================================================
   Los toques
   ============================================================================ */

function clicCuerpo(ev) {
  const t = ev.target;

  if (t.closest('[data-recargar]')) { location.reload(); return; }

  const ir = t.closest('[data-ir]');
  if (ir && CTX && typeof CTX.ir === 'function') { CTX.ir(ir.dataset.ir); return; }

  const asa = t.closest('[data-hoja]');
  if (asa) {
    /* El clic que llega al soltar un arrastre no cuenta: la hoja ya se fue a donde la dejó el dedo. */
    if (asa.dataset.arrastrada) { delete asa.dataset.arrastrada; return; }
    alternarHoja();
    return;
  }

  const g = t.closest('[data-g]');
  if (g) {
    const k = g.dataset.g;
    if (GRUPOS_ON.has(k)) GRUPOS_ON.delete(k); else GRUPOS_ON.add(k);
    /* Apagar la última etapa deja el mapa en blanco sin decir por qué: se vuelve a prender
       todo, que es lo que el usuario quería decir con «no quiero ninguna». */
    if (!GRUPOS_ON.size) GRUPOS.forEach(x => GRUPOS_ON.add(x.g));
    refrescarPiezas(); refrescarPines({ animar: true }); encuadrar();
    return;
  }

  const ra = t.closest('[data-rango]');
  if (ra) {
    RANGO = ra.dataset.rango;
    /* La ruta se calculó con los pines de hoy. Cambiar el rango a mano cambia el conjunto,
       y una numeración que ya no corresponde a lo que se ve es peor que ninguna. */
    soltarRuta();
    refrescarPiezas(); refrescarPines({ animar: true }); encuadrar();
    return;
  }

  const ru = t.closest('[data-ruta]');
  if (ru) {
    if (ru.dataset.ruta === 'quitar') {
      soltarRuta();
      refrescarPiezas(); refrescarPines();
    } else calcularRuta();
    return;
  }

  if (t.closest('[data-encuadrar]')) { encuadrar(); return; }

  const zm = t.closest('[data-zoom]');
  if (zm && mapa) { mapa.setZoom(mapa.getZoom() + Number(zm.dataset.zoom), { animate: !quieto() }); return; }

  const yo = t.closest('[data-yo]');
  if (yo) { irAMiUbicacion(yo); return; }

  if (t.closest('[data-limpiar]')) {
    const q = $('mapa-q');
    if (q) { q.value = ''; try { q.focus(); } catch (_) {} }
    pintarSug();
    return;
  }

  /* Un renglón de la búsqueda o de la lista de obras: abre su ficha. */
  const sug = t.closest('.mapa-sug [data-sel]');
  if (sug) { elegirSug(sug.dataset.sel); return; }
  const sel = t.closest('[data-sel]');
  if (sel) { seleccionar(sel.dataset.sel, { volar: true }); return; }

  if (t.closest('[data-cerrar-ficha]')) { cerrarFicha({ foco: true }); return; }

  const vf = t.closest('[data-ver-faltan]');
  if (vf) {
    /* «2 sin ubicar» lleva a la lista que los arregla: la hoja sube y la lista se asoma. */
    ponerHoja('alta');
    /* Se desplaza el cuerpo de la hoja y nada más. `scrollIntoView` desplaza TODOS los
       antepasados que puedan, y la caja del mapa —con `overflow:hidden`, pero desplazable por
       programa— se corría hacia arriba y se llevaba la búsqueda fuera de la vista. */
    const caja = $('mapa-faltan'), cuerpo = $('mapa-hoja-cuerpo');
    if (caja && cuerpo) {
      setTimeout(() => cuerpo.scrollTo({ top: Math.max(0, caja.offsetTop - cuerpo.offsetTop - 8), behavior: scrollSuave() }),
        quieto() ? 0 : 260);
    }
    return;
  }

  const cd = t.closest('[data-copiar-dir]');
  if (cd) {
    const p = PROYS.find(x => x.id === cd.dataset.copiarDir);
    if (!p) return;
    /* Lo que se copia es la dirección como la escribieron; sin ella, las coordenadas, que
       cualquier app de mapas entiende pegadas en su buscador. */
    const txt = dirDe(p).replace(/\n+/g, ', ') || (Number(p.lat).toFixed(6) + ', ' + Number(p.lng).toFixed(6));
    copiarDireccion(txt, cd, dirDe(p) ? 'Dirección copiada' : 'Coordenadas copiadas');
    return;
  }

  const vp = t.closest('[data-ver-proyecto]');
  if (vp && CTX) {
    if (typeof CTX.pasar === 'function') CTX.pasar('proyectos', { proyecto_id: vp.dataset.verProyecto });
    else if (typeof CTX.ir === 'function') CTX.ir('proyectos');
    return;
  }

  const ver = t.closest('[data-ver]');
  if (ver) { volarA(ver.dataset.ver); return; }

  /* Tocar una tarjeta de la tira lleva el mapa a esa parada (y la tira a la tarjeta, si era la
     de al lado). El enlace a Google Maps de la tarjeta es de ella y no pasa por aquí. */
  const tarj = t.closest('[data-parada]');
  if (tarj && !t.closest('a')) { alTocarTarjeta(tarj.dataset.parada); return; }

  const link = t.closest('[data-link]');
  if (link) { abrirLink(link.dataset.link); return; }

  const mano = t.closest('[data-mano]');
  if (mano) { abrirMano(mano.dataset.mano); return; }

  if (t.closest('[data-mano-ok]')) { guardarMano(); return; }
  if (t.closest('[data-mano-no]')) { cerrarMano(); return; }

  /* Un toque fuera de la búsqueda la cierra, como cualquier lista que se despliega. */
  if (!t.closest('.mapa-buscar') && !t.closest('.mapa-sug')) cerrarSug();
}

/** El foco llegó a una tarjeta de la tira. Solo si llegó por teclado (`:focus-visible`): tocar el
 *  enlace de «Abrir en Google Maps» con ratón también lo enfoca, y eso no es pedir el mapa. */
function alEnfocar(ev) {
  const t = ev.target;
  if (!t || !t.closest) return;
  /* El tabulador que entra a la parte de la hoja que está debajo del borde la sube: un foco que
     no se ve es un foco perdido. */
  if (HOJA === 'baja' && !esPanel() && t.closest('.mapa-hoja-cuerpo')) {
    const r = t.getBoundingClientRect();
    const piso = window.innerHeight - (altoBarraAbajo() || 0);
    if (r.bottom > piso) ponerHoja('alta');
  }
  const tarj = t.closest('[data-parada]');
  if (!tarj || tarj.dataset.parada === _parada) return;
  let porTeclado = false;
  try { porTeclado = t.matches(':focus-visible'); } catch (_) {}
  if (porTeclado) alTocarTarjeta(tarj.dataset.parada);
}

function clicPide(ev) {
  const b = ev.target.closest('[data-pide]');
  if (!b) return;
  const q = b.dataset.pide;
  if (q === 'cerrar') { cerrarPide(); return; }
  if (q === 'pegar') { pegarDelPortapapeles(); return; }
  if (q === 'copiardir') {
    if (PIDE) copiarDireccion(PIDE.dir, b);
    return;
  }
  if (q === 'guardar') { guardarLink(false); return; }
  if (q === 'forzar') { guardarLink(true); return; }
}
