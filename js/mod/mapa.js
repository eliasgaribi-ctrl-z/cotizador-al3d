/* ============================================================================
   Mapa — dónde está cada obra y en qué orden conviene visitarlas hoy.

   Esta pantalla existe para una decisión de la mañana: a dónde va la camioneta. Todo lo
   que hace está subordinado a eso, y de ahí salen las cuatro decisiones del archivo:

   1. NINGÚN PIN EN MEDIO DEL OCÉANO. Un proyecto sin coordenada no se dibuja «por ahí»:
      se va a la lista de abajo con su dirección cruda y dos salidas para arreglarlo. Un
      pin equivocado parece un dato, y un dato equivocado se usa. La lista es la mitad
      importante de esta pantalla, no un apéndice.

   2. FORMA Y LETRA ADEMÁS DE COLOR. Uno de cada doce hombres no distingue el verde del
      ámbar, y este mapa se lee para decidir a dónde manejar. Cada pin lleva su cuadro o
      su círculo, su relleno y una letra —G, T, L, I— que la leyenda nombra con palabras.
      El color es el tercer indicio, nunca el único.

   3. EL MAPA NO SE VUELVE A CREAR AL TOCAR UN FILTRO. Se arma una vez y después solo se
      cambian los pines. Rehacerlo perdía el acercamiento y el encuadre en cada toque —el
      barrio que estabas mirando desaparecía— y volvía a bajar los mismos cuadros de OSM,
      que es exactamente lo que su política pide no hacer.

   4. LO QUE EL FILTRO ESCONDE SE DICE CON UN NÚMERO. Un mapa con tres pines cuando hay
      once proyectos se lee como «solo hay tres», y de ahí sale un día de trabajo mal
      planeado. Debajo de la leyenda va el renglón que dice cuántos no se están pintando y
      por qué.

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
         copiarTexto, ajustarAltoBarra, scrollSuave } from '../nucleo/ui.js';

/* ============================================================================
   Estado del módulo. Todo aquí, y todo se suelta en desmontar().
   ============================================================================ */

let cont = null;
let CTX = null;

let mapa = null;            // la instancia de Leaflet
let capaPines = null;       // LayerGroup de los marcadores
let capaRuta = null;        // LayerGroup de la línea de la ruta
let MARCAS = new Map();     // proyecto_id -> marcador, para volar a uno recién ubicado
let FIRMAS = new Map();     // proyecto_id -> {icono, globo}: lo último que se le puso a cada marcador
let _linea = null;          // la polilínea de la ruta ya dibujada, y los puntos con que se dibujó
let _lineaClave = '';
let _traza = null;          // el trazo de la ruta mientras se dibuja, una sola vez (F25)
let _tira = null;           // el control de P.paginas() sobre la tira de paradas (F12)
let _firmaTira = '';        // las paradas con que se pintó la tira: si no cambian, no se repinta
let _parada = null;         // proyecto_id de la tarjeta «de ahora»
let _silenciarTira = false; // la tira se acaba de pintar: lo que avise la pieza no manda al mapa
let _tParada = 0;
let _ignorarTiraHasta = 0;  // mientras la tira se mueve por un toque en un pin, no manda al mapa
let _globoAlLlegar = null;  // proyecto_id cuyo globo se abre cuando el mapa termine de moverse

let PROYS = [];             // proyectos vivos
let INST = new Map();       // proyecto_id -> {fecha, hora, estado, viva}
let HOY = hoyISO();

let GRUPOS_ON = new Set(['ganado', 'taller', 'listo', 'instalado']);
let RANGO = null;           // lo fija el primer montar() según el rol, y luego manda el usuario
let RUTA = null;            // {orden:[proyecto], km:number}
let MANO = null;            // {id, nombre, lat, lng, tocado, centro} — el modo «pin a mano»
let PIDE = null;            // {id, nombre, aviso} — el panel de pegar el link

let _armado = false;        // el armazón ya está pintado (y el lienzo existe)
let _redimT = 0;
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
   puesto—; su palabra completa sí aparece en el globo. `cancelado` no llega aquí: se pide
   `vivos:true` y un proyecto que no se dio no es un lugar a donde ir.
   ============================================================================ */

/* `corta` es el nombre para el teléfono. Los cuatro filtros con su palabra larga —«G ·
   Vendido, sin empezar (1)»— ocupaban CUATRO renglones de chips encima del mapa en una
   pantalla de 390 px: doscientos treinta píxeles de filtros antes de ver un solo pin, o sea
   el mapa entero debajo del doblez. Con el nombre corto caben en dos, y la palabra larga
   sigue viva en el `title` y en la leyenda de debajo del mapa, que es donde se consulta qué
   significa una marca. Es la misma solución que el selector de tipo de una partida ya usa con
   `.lg`/`.sm`. */
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
  /* Este módulo NO drena el pase, a propósito. Drenarlo sin usarlo sería borrar un recado
     que nadie leyó, y declarar la variable para no usarla es prometer un aterrizaje que no
     existe. Al mapa se llega hoy con un `ir()` limpio y se ve todo, que para «ver la ruta
     del día» es lo correcto. Cuando haya un filtro al que aterrizar, se lee aquí. */
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
     las sigue. */
  on(cont, 'focusin', alEnfocar);
  on($('pf-pide'), 'click', clicPide);
  /* El mapa mide su caja al crearse. Si la ventana cambia —girar el teléfono, abrir el
     teclado, arrastrar la ventana del escritorio— Leaflet no se enteraba y quedaba pintando
     medio lienzo gris con los pines corridos. */
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
}

export function desmontar() {
  for (const [el, tipo, fn] of _oyentes) {
    try { el.removeEventListener(tipo, fn); } catch (_) {}
  }
  _oyentes.length = 0;
  clearTimeout(_redimT); _redimT = 0;
  clearTimeout(_tParada); _tParada = 0;

  /* `map.remove()` no es opcional. Un Leaflet que no se destruye deja vivos su contenedor,
     sus oyentes de rueda y arrastre y sus peticiones de cuadros a medio camino: a la sexta
     ida y vuelta a esta pantalla el teléfono va a tirones y nadie sabe por qué. */
  destruirMapa();

  /* La barra fija es del documento, no de este módulo: si se sale con «Ordenar la ruta de
     hoy» puesto, el primer dedo del día lo aprieta creyendo que es de la pantalla que está
     viendo. Se limpia aquí y no en la que sigue. */
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; b.classList.remove('mapa-mbar'); ajustarAltoBarra(); }

  /* La capa también es del documento. Salir del mapa con el panel del link abierto dejaba
     el velo encima de la pantalla siguiente. */
  const capa = $('pf-pide');
  if (capa && capa.classList.contains('show')) cerrarCapa('pf-pide');
  if (capa) capa.innerHTML = '';

  PROYS = []; INST = new Map();
  /* RUTA y MANO sí se sueltan, y con razón: la ruta se calcula sobre los pines que acaban de
     leerse y el pin a mano es un gesto a medio hacer, los dos atados a un mapa que se está
     destruyendo. GRUPOS_ON, en cambio, se QUEDA: sus cuatro chips están en pantalla, así que
     cumple la regla —el filtro cuyo interruptor se ve puede sobrevivir— y reponerlo por
     omisión borraba en silencio lo que el usuario acababa de elegir. */
  RUTA = null; MANO = null; PIDE = null;
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
    _armado = false;
    cont.innerHTML = vacio('Todavía no hay obras que poner en el mapa',
      'Cuando marques una cotización como ganada en el cotizador, su proyecto aparece aquí. ' +
      'Si trae link de Google Maps sale con su pin puesto; si no, sale en la lista de abajo ' +
      'para ponérselo de un toque.',
      '<button type="button" class="btn btn-pri" data-ir="proyectos">Ver los proyectos</button>');
    if (CTX && typeof CTX.ponerCuenta === 'function') CTX.ponerCuenta('mapa', 0);
    return;
  }

  const primera = !_armado;
  if (primera) armazon();
  refrescarPiezas();
  crearMapa();
  refrescarPines();
  /* Solo en el primer dibujado. Después, encuadrar en cada repintado le quitaría el mapa de
     las manos a quien acaba de acercarse a una colonia: se reencuadra cuando el usuario
     cambia un filtro o lo pide, que es cuando lo espera. */
  if (primera) encuadrar();
  pintarMbar();
  if (CTX && typeof CTX.ponerCuenta === 'function') CTX.ponerCuenta('mapa', sinUbicar().length);
}

function armazon() {
  /* `innerHTML` se lleva el nodo del lienzo, y un Leaflet apuntando a un nodo huérfano
     sigue con sus oyentes puestos y sus cuadros a medio bajar. Se destruye antes. */
  destruirMapa();
  /* Dos columnas: el mapa a la izquierda y la ruta del día a la derecha.
     Estaban una debajo de la otra, y eso significaba que la ruta —que es la razón por la que
     alguien abre esta pantalla por la mañana— vivía SEISCIENTOS píxeles más abajo del mapa,
     fuera de la vista. Y las dos se leen juntas: se mira una parada en la lista y se busca su
     pin, y al revés. En el teléfono siguen apiladas, con el mapa en 45 vh —que es la mitad de
     la pantalla, suficiente para ver dónde caen las paradas— y la ruta debajo, que es el
     orden en que se usan con una mano.

     Los filtros se quedan ARRIBA del mapa y no flotando encima como en la maqueta: allí son
     dos («Por instalar · 5 / Instaladas · 6») y aquí son tres tiras —etapas, hasta cuándo, y
     las acciones—, y tres tiras flotando taparían el mapa que filtran. */
  cont.innerHTML =
    '<div class="pf-cuentas" id="mapa-cuentas"></div>' +
    '<div class="mapa-2col">' +
      '<div class="mapa-col">' +
        '<div class="chips" id="mapa-etapas" role="group" aria-label="Etapas que se pintan"></div>' +
        '<div class="chips" id="mapa-rango" role="group" aria-label="Hasta cuándo se pinta"></div>' +
        '<div class="btn-fila" id="mapa-acc"></div>' +
        '<div id="mapa-modo"></div>' +
        /* La tira de paradas (F12) va FUERA del lienzo, en una caja que los envuelve a los dos:
           dentro de él, Leaflet escucha cada toque del contenedor para arrastrar el mapa, y
           deslizar una tarjeta lo habría arrastrado también. Al lado, la caja la pega al borde
           de abajo del mapa sin que el mapa se entere. */
        '<div class="mapa-caja" id="mapa-caja">' +
          '<div id="mapa-lienzo"></div>' +
          '<div class="mapa-tira" id="mapa-tira" hidden></div>' +
        '</div>' +
        /* La leyenda es estática y va debajo del lienzo, no encima: lo primero que se busca al
           entrar es el mapa, y la leyenda se consulta cuando ya se vio un pin y no se sabe qué
           es. La forma va en el cuadrito y la letra en el texto, que es la que se lee en el pin. */
        '<p class="mapa-leyenda">' +
          '<span><i class="ganado"></i>G — vendido, sin empezar</span>' +
          '<span><i class="taller"></i>T — en el taller</span>' +
          '<span><i class="listo"></i>L — listo para instalar</span>' +
          '<span><i class="instalado"></i>I — instalado</span>' +
        '</p>' +
        '<p class="pf-nota" id="mapa-oculto"></p>' +
      '</div>' +
      '<div class="mapa-col">' +
        '<div id="mapa-ruta"></div>' +
        '<div id="mapa-faltan"></div>' +
      '</div>' +
    '</div>' +
    /* La verdad de este módulo, en letra chica y sin adornos. No es un consejo: es cómo
       funciona, y saberlo es la diferencia entre «se rompió» y «no hay señal». */
    '<p class="pf-nota">El mapa se baja de internet: sin señal se queda gris y los pines no ' +
      'tienen dónde pararse. Los datos no — los proyectos, las etapas y las fechas ya están ' +
      'en este teléfono y se leen igual sin línea. Los cuadros del mapa no se guardan a ' +
      'propósito: la política de OpenStreetMap prohíbe archivarlos, y el crédito de abajo a ' +
      'la derecha es requisito de su licencia, no adorno.</p>';
  _armado = true;
}

function refrescarPiezas() {
  const pines = pintables();
  const faltan = sinUbicar();
  const hoy = deHoy();

  const cu = $('mapa-cuentas');
  if (cu) {
    cu.innerHTML =
      '<span class="pf-cuenta"><b data-cuenta="pines">' + pines.length + '</b> en el mapa</span>' +
      '<span class="pf-cuenta' + (hoy.length ? ' urge' : '') + '"><b data-cuenta="hoy">' + hoy.length + '</b> por instalar hoy</span>' +
      '<span class="pf-cuenta' + (faltan.length ? ' urge' : '') + '"><b data-cuenta="sinubicar">' + faltan.length + '</b> sin ubicar</span>';
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
    /* El botón se arma aquí y no con `chip()` porque este lleva DOS nombres —el largo para
       la computadora y el corto para el teléfono, en el par `.lg`/`.sm` que la hoja ya
       conoce— y `chip()` escapa su etiqueta, que es exactamente lo que tiene que hacer para
       los otros veinte sitios que la llaman. Lo único que cambia es el interior; la clase, el
       estado y el `aria-pressed` son los mismos. El nombre accesible va entero en el
       `aria-label`: quien no ve la pantalla no se entera de cuál de los dos se está pintando. */
    et.innerHTML = GRUPOS.map(g => {
      const n = porGrupo.get(g.g) || 0;
      const etiq = g.marca + ' · ' + g.palabra + ' (' + n + ')';
      const on = GRUPOS_ON.has(g.g);
      return '<button type="button" class="chip' + (on ? ' on' : '') + (n ? '' : ' cero') + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '" data-g="' + g.g + '"' +
        ' title="' + esc(etiq) + '" aria-label="' + esc(etiq) + '">' +
        '<span class="lg">' + esc(g.marca + ' · ' + g.palabra) + '</span>' +
        '<span class="sm">' + esc(g.marca + ' · ' + g.corta) + '</span>' +
        ' (' + n + ')</button>';
    }).join('');
  }

  const ra = $('mapa-rango');
  if (ra) {
    ra.innerHTML = rangosDelRol()
      .map(r => chip(r.t, RANGO === r.v, 'data-rango="' + esc(r.v) + '"')).join('');
  }

  const ac = $('mapa-acc');
  if (ac) {
    ac.innerHTML =
      (hoy.length
        ? '<button type="button" class="btn btn-gho pf-btn-corto" data-ruta="' +
            (RUTA ? 'quitar' : 'calcular') + '">' + ico('i-camion') +
            (RUTA ? 'Quitar el orden' : 'Ordenar la ruta de hoy') + '</button>'
        : '') +
      '<button type="button" class="btn btn-gho pf-btn-corto" data-encuadrar>' +
        ico('i-ajustar') + 'Encuadrar</button>';
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
}

/* ----- Las cuentas de arriba ruedan cuando cambian (F23) -----
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
  for (const b of raiz.querySelectorAll('.pf-cuenta b[data-cuenta]')) {
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
  mapa = null; capaPines = null; capaRuta = null;
  MARCAS = new Map(); FIRMAS = new Map();
  _linea = null; _lineaClave = ''; _globoAlLlegar = null;
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
      '<p class="vacio-d">Falta el archivo de Leaflet de la carpeta vendor. La lista de abajo ' +
      'sigue funcionando; el dibujo del mapa, no.</p></div>';
    return;
  }

  try {
    mapa = L.map(div, { zoomControl: true, attributionControl: true });
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
  if (!mapa) return;
  /* Girar el teléfono dispara resize varias veces seguidas y cada `invalidateSize` puede
     pedir cuadros nuevos. Se espera a que pare. */
  clearTimeout(_redimT);
  _redimT = setTimeout(() => { try { mapa && mapa.invalidateSize(); } catch (_) {} }, 180);
}

/* ============================================================================
   Los pines
   ============================================================================ */

/* El icono de un pin: su forma, su letra o su número. `iconSize` va en el icono porque Leaflet lo
   escribe como estilo en línea y le REEMPLAZA la clase por la que se le pase. */
function iconoDe(gr, n) {
  return L.divIcon({
    className: 'mapa-pin ' + gr.g + (n ? ' ruta' : ''),
    html: esc(n ? String(n) : gr.marca),
    iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -15],
  });
}

/* El título es lo que oye quien navega con teclado y lo que ve quien deja el cursor encima: la
   letra del pin sola no es un nombre. */
const tituloDe = (p, gr) => (p.nombre || p.folio_local || 'Proyecto') + ' — ' + gr.palabra;

/* Con más cambios que estos, el filtro es otra pantalla y no una lista que se acomoda: cuarenta
   pines creciendo a la vez en un teléfono de gama media es el único momento en que esta
   animación cuesta, y ahí nadie sigue a cada uno con los ojos. */
const TOPE_PINES_ANIMADOS = 40;

/* ----- Los pines entran y salen al filtrar (F33) -----
   Apagar una etapa hacía desaparecer sus pines de golpe, y quien lo hizo no veía CUÁLES se
   habían ido: el mapa quedaba distinto y había que adivinar la diferencia. Antes se vaciaba la
   capa entera con `clearLayers()` y se volvía a armar, y eso tiraba también a los que no
   cambiaron. Ahora se compara por `proyecto_id`: el que se queda no se toca (su nodo es el
   mismo, y con él su globo abierto y su foco), el que se va se encoge y el que llega crece, en
   160 ms.

   La animación va sobre el elemento del pin con la API de animaciones y NO con una clase de CSS:
   Leaflet coloca cada pin con `transform: translate3d(...)` en línea, y una regla `transform`
   —o una animación que la reemplace— lo mandaría a la esquina del mapa mientras dura. Se
   conserva el traslado que ya trae y se le añade el `scale` detrás.

   `animar` solo lo pide quien filtró (un toque en un chip). El primer pintado, el que sigue a
   guardar un pin o el de una sincronización no animan: ahí los pines no «llegan», ya estaban.
   MARCAS se mantiene al día en el acto, aunque el pin todavía se esté encogiendo, porque
   `volarA()` lo consulta. */
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
    const icono = gr.g + '|' + n + '|' + tituloDe(p, gr);
    const contenido = globo(p, gr, real);
    let m = MARCAS.get(p.id);

    if (!m) {
      m = L.marker([Number(p.lat), Number(p.lng)], {
        icon: iconoDe(gr, n), title: tituloDe(p, gr), riseOnHover: true,
      });
      /* El oyente del clic se pone ANTES de enlazar el globo: Leaflet corre los oyentes en el
         orden en que se registran, y este tiene que ajustar el margen del globo (por la tira de
         abajo) antes de que el globo se abra y calcule hacia dónde correrse. */
      m.on('click', () => alTocarPin(p.id));
      m.bindPopup(contenido, { maxWidth: 280, autoPanPadding: [24, 24] });
      m.addTo(capaPines);
      MARCAS.set(p.id, m);
      FIRMAS.set(p.id, { icono, globo: contenido });
      if (animar) animarPin(m.getElement(), 'entra');
      continue;
    }

    const f = FIRMAS.get(p.id) || {};
    const ll = m.getLatLng();
    if (ll.lat !== Number(p.lat) || ll.lng !== Number(p.lng)) m.setLatLng([Number(p.lat), Number(p.lng)]);
    if (f.icono !== icono) {
      m.options.title = tituloDe(p, gr);
      m.setIcon(iconoDe(gr, n));
    }
    if (f.globo !== contenido) m.setPopupContent(contenido);
    FIRMAS.set(p.id, { icono, globo: contenido });
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
 *  para que nadie abra el globo de algo que se está yendo. */
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

function globo(p, gr, n) {
  const f = INST.get(p.id);
  const nombre = p.nombre || p.folio_local || 'Proyecto sin nombre';

  let fecha;
  if (f && f.viva) {
    fecha = 'Instala ' + cuando(f.fecha) + ' · ' + fmtFechaDia(f.fecha) +
            (f.hora ? ' a las ' + fmtHora(f.hora) : ' (sin hora)');
  } else if (f) {
    fecha = 'Se instaló el ' + fmtFechaDia(f.fecha);
  } else {
    fecha = 'Sin fecha de instalación · se ganó el ' + fmtFecha(p.fecha_ganado);
  }

  /* Con el rol de fabricación el importe NO SE PINTA. No se difumina ni se tacha: el
     elemento no existe, que es la única forma de que no se lea de reojo. */
  let dinero = '';
  if (Prefs.veDinero()) {
    const total = Cot.totalVendido(p.origen);
    if (total > 0) dinero = '<div>' + esc(money(total)) + '</div>';
  }

  return '<b>' + esc(nombre) + '</b>' +
    '<div><span class="pf-etapa ' + esc(claseEtapa(p.etapa)) + '">' +
      esc(nombreEtapa(p.etapa)) + '</span>' +
      (n ? ' <span class="pf-cuando">parada ' + n + '</span>' : '') + '</div>' +
    '<div>' + esc(fecha) + '</div>' +
    dinero +
    '<a class="btn btn-pri" target="_blank" rel="noopener" href="' + urlMaps(p) + '">' +
      ico('i-camion') + 'Abrir en Google Maps</a>';
}

/** El enlace a Google Maps de una obra: el mismo en el globo y en la tarjeta de la tira. */
function urlMaps(p) {
  return 'https://www.google.com/maps/dir/?api=1&destination=' +
    encodeURIComponent(Number(p.lat) + ',' + Number(p.lng));
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
  m.setIcon(iconoDe(gr, n));
  FIRMAS.set(id, Object.assign(FIRMAS.get(id) || {}, { icono: gr.g + '|' + n + '|' + tituloDe(p, gr) }));
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

/* ----- Lo que tapa la tira de paradas -----
   En el teléfono la tira de paradas (F12) se pega al borde de abajo del mapa. Todo lo que el mapa
   hace con "el centro" —volar a una parada, encuadrar la ruta, abrir un globo— tiene que contar
   con que ese pedazo no se ve, o el pin al que se fue queda justo debajo de la tarjeta que lo
   nombra. Devuelve cuántos píxeles del mapa ocupa la tira, o 0 si no se ve (en la computadora la
   hoja de estilos la esconde). */
function alturaTira() {
  const t = $('mapa-tira'), l = $('mapa-lienzo');
  if (!t || !l || t.hidden || !t.offsetParent) return 0;
  return Math.max(0, Math.round(l.getBoundingClientRect().bottom - t.getBoundingClientRect().top));
}

/** Mueve el mapa para que (lat, lng) quede en el centro de lo que SÍ se ve: sobre la tira, no
 *  detrás de ella. Vuela en vez de saltar, salvo con menos movimiento. */
function moverA(lat, lng, zoom) {
  const tapa = alturaTira();
  let destino = L.latLng(lat, lng);
  if (tapa) destino = mapa.unproject(mapa.project(destino, zoom).add([0, tapa / 2]), zoom);
  if (quieto()) mapa.setView(destino, zoom);
  else mapa.flyTo(destino, zoom, { duration: .6 });
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
    const tapa = alturaTira();
    if (!tapa) { mapa.setView([Number(lista[0].lat), Number(lista[0].lng)], 15, op); return; }
    mapa.setView(mapa.unproject(mapa.project([Number(lista[0].lat), Number(lista[0].lng)], 15).add([0, tapa / 2]), 15), 15, op);
    return;
  }
  try {
    mapa.fitBounds(L.latLngBounds(lista.map(p => [Number(p.lat), Number(p.lng)])),
      { paddingTopLeft: [28, 28], paddingBottomRight: [28, 28 + alturaTira()], maxZoom: 16, animate: op.animate });
  } catch (e) { console.warn('no se pudo encuadrar', e); }
}

/** Ir al pin que se acaba de guardar y abrir su globo. Guardar un pin sin ver dónde cayó es
 *  guardar a ciegas, y un pin en la colonia de al lado se ve igual de convincente. */
function volarA(id) {
  const p = PROYS.find(x => x.id === id);
  if (!mapa || !tienePin(p)) return;
  /* En el teléfono la ruta va DEBAJO del mapa: «Ver en el mapa» movía el mapa fuera de la
     vista y no llevaba a él. Si no está a la vista, se baja; y el mapa vuela en vez de saltar
     (Leaflet salta sin animar con más de 4 niveles de zoom de diferencia). */
  const lienzo = $('mapa-lienzo');
  const suave = scrollSuave();
  if (lienzo) {
    const r = lienzo.getBoundingClientRect();
    if (r.bottom < 80 || r.top > innerHeight - 80) lienzo.scrollIntoView({ block: 'center', behavior: suave });
  }
  const m = MARCAS.get(id);
  /* El globo se abre cuando el mapa LLEGA, no al salir: abrirlo con el vuelo a medias hacía que
     su corrimiento automático (para caber en pantalla) peleara con el vuelo, y el mapa terminaba
     a medio camino. */
  if (m) _globoAlLlegar = id;
  moverA(Number(p.lat), Number(p.lng), 16);
  if (m) return;
  /* El pin se guardó pero el filtro de arriba no lo pinta —lo más común: no tiene fecha de
     instalación y el rango son 15 días—. Sin este aviso el mapa se va a un lugar vacío y
     parece que no se guardó nada. */
  toast('El pin quedó guardado. Este filtro no lo pinta: cambia el rango de fechas o las etapas para verlo', '', 5200);
}

/** El mapa terminó de moverse: lo que estaba esperando a que llegara. */
function alTerminarDeMoverse() {
  alMoverseConMano();
  if (!_globoAlLlegar) return;
  const id = _globoAlLlegar;
  _globoAlLlegar = null;
  const m = MARCAS.get(id);
  if (!m) return;
  afinarGlobo(m);
  try { m.openPopup(); } catch (_) {}
}

/** El globo se corre solo para caber en pantalla, y «pantalla» no incluye lo que tapa la tira de
 *  paradas: sin este margen el pin se quedaba bajo la tarjeta que acababa de nombrarlo. */
function afinarGlobo(m) {
  const po = m && m.getPopup && m.getPopup();
  if (!po) return;
  po.options.autoPanPaddingBottomRight = [24, 24 + alturaTira()];
}

/* ============================================================================
   La ruta del día — un heurístico, y la pantalla lo dice
   ============================================================================ */

function calcularRuta() {
  const puntos = deHoy();
  if (!puntos.length) {
    toast('Hoy no hay instalaciones con pin. Si hay obra hoy, ubícala en la lista de abajo y vuelve a darle', '', 4600);
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
  refrescarPiezas();
  /* El orden de las cuatro líneas de abajo importa (F25). Primero se arma el trazo, que deja los
     pines con su letra y la línea sin dibujar; luego se pintan los pines; y recién después se
     encuadra, porque el trazo arranca cuando el mapa termina de moverse y tiene que estar
     escuchando antes de que empiece a hacerlo. */
  prepararTraza();
  refrescarPines();
  encuadrar();
  pintarMbar();
  /* La ruta ordenada agranda el mapa y pone la tira de paradas encima (en el teléfono): que se
     vean las dos cosas completas, sin tener que bajar a buscarlas. */
  const lienzo = $('mapa-lienzo');
  if (lienzo && alturaTira()) lienzo.scrollIntoView({ block: 'nearest', behavior: scrollSuave() });
}

function pintarRuta() {
  const caja = $('mapa-ruta');
  if (!caja) return;
  /* Sin ruta la tarjeta NO desaparece: se queda chica y dice por qué. Vacía, en el monitor la
     columna de la derecha medía 0 px cuando además nada estaba sin pin, y el 40 % de la
     pantalla al lado del mapa quedaba en blanco: parecía una pantalla rota. En el teléfono va
     debajo del mapa, así que una tarjeta corta no estorba. Dos casos, porque se arreglan
     distinto: hay paradas y falta ordenarlas —el botón está arriba del mapa—, o no hay. */
  if (!RUTA) {
    const n = deHoy().length;
    caja.innerHTML = '<div class="card"><div class="card-h"><h2>' + ico('i-camion') +
      'La ruta de hoy</h2></div><div class="card-b"><p class="pf-fila-d">' + (n
        ? (n === 1 ? 'Hoy hay 1 parada con pin.' : 'Hoy hay ' + n + ' paradas con pin.') +
          ' «Ordenar la ruta de hoy», arriba del mapa, las pone en orden para no cruzar la ciudad tres veces.'
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
   de tarjetas se pega al borde de abajo del mapa: deslizar a la siguiente lleva el mapa a esa
   parada y abre su globo; tocar un pin lleva la tira a su tarjeta. Deslizar ES recorrer la ruta.

   El deslizamiento es el de siempre —scroll-snap, que el pulgar ya conoce— y lo que la pieza
   `Piezas.paginas()` pone encima es lo que el scroll-snap no trae: saber en qué tarjeta se quedó,
   anunciarla («Parada 2 de 4») cuando se asienta, y las flechas del teclado con la tira enfocada.
   Sin puntos: la tarjeta siguiente asoma por el borde, y los números van dentro de cada tarjeta.

   Tres cuidados que son de esta pantalla:
     · La tira NO tapa el crédito de OpenStreetMap, que exige su licencia: la hoja de estilos la
       sube sobre él (`--mapa-cred`) y las pruebas miden que sus cajas no se toquen.
     · La lista de abajo se esconde en el teléfono mientras la tira existe, y se queda en la
       computadora, donde la tira no se ve. No es la tira la que queda sin lector de pantalla: es
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
      '<a class="btn btn-pri pf-btn-corto mapa-parada-ir" target="_blank" rel="noopener" href="' + urlMaps(x) + '">' +
        ico('i-camion') + 'Abrir en Google Maps</a>' +
    '</article>';
  }).join('');
  tira.hidden = false;
  /* Se agranda el lienzo (en el teléfono) ANTES de pedirle a Leaflet que mida: con la tira encima,
     los 45 vh de antes dejaban casi nada de mapa a la vista. */
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

/** El mapa vuela a una parada y, al llegar, abre su globo. */
function irAParada(id) {
  const x = PROYS.find(q => q.id === id);
  if (!mapa || !tienePin(x)) return;
  if (MARCAS.get(id)) _globoAlLlegar = id;
  moverA(Number(x.lat), Number(x.lng), 16);
}

/** Tocar una tarjeta: la tira la centra (si estaba asomando) y el mapa vuela a su pin. */
function alTocarTarjeta(id) {
  const i = RUTA ? RUTA.orden.findIndex(x => x.id === id) : -1;
  if (i < 0) return;
  _parada = id;
  clearTimeout(_tParada);
  _ignorarTiraHasta = Date.now() + (quieto() ? 250 : 900);
  if (_tira) _tira.ir(i);
  irAParada(id);
}

/** Tocar un pin de la ruta lleva la tira a su tarjeta. El mapa ya está donde el dedo lo dejó y el
 *  globo lo abre Leaflet: la tira solo se corre, y mientras lo hace no manda al mapa de vuelta
 *  (de lo contrario, la tarjeta por la que pasa de camino se lo llevaría). */
function alTocarPin(id) {
  const m = MARCAS.get(id);
  if (m) afinarGlobo(m);
  if (!_tira || !RUTA || !alturaTira()) return;
  const i = RUTA.orden.findIndex(x => x.id === id);
  if (i < 0) return;
  _parada = id;
  clearTimeout(_tParada);
  _ignorarTiraHasta = Date.now() + (quieto() ? 250 : 900);
  _tira.ir(i);
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
   La barra fija del teléfono

   Una sola acción, y la de esta pantalla en la calle es una: en qué orden salgo hoy.
   Cuando no hay nada de hoy con pin, la barra no existe: un botón que no lleva a ningún
   lado ocupa el lugar donde el pulgar espera encontrar algo.
   ============================================================================ */

function pintarMbar() {
  const b = $('pf-mbar');
  if (!b) return;
  const hoy = deHoy();
  if (!hoy.length || RUTA) {
    b.hidden = true; b.innerHTML = ''; b.onclick = null; b.classList.remove('mapa-mbar'); ajustarAltoBarra(); return;
  }
  const rotulo = ico('i-camion') + esc('Ordenar la ruta de hoy (' + hoy.length + ')');
  const P = piezas();
  const btn = b.hidden ? null : b.querySelector('[data-ruta]');
  /* La barra ya está a la vista con su botón (se repinta después de cada pin que se guarda y de
     cada filtro, y casi siempre dice lo mismo): el botón NO se reescribe. Si el rótulo cambió
     —«(2)» a «(3)» porque el pin que se acaba de poner era de una instalación de hoy—, el nuevo
     se cruza con el viejo en su sitio (F29) en vez de aparecer de golpe; si es el mismo,
     `cambiarRotulo` no toca nada. Reescribir con innerHTML era lo que hacía que el cambio no se
     notara y, con un dedo encima, que el botón se cayera de debajo de él. */
  if (btn && P.cambiarRotulo) P.cambiarRotulo(btn, { html: rotulo });
  else if (btn) btn.innerHTML = rotulo;
  else {
    b.innerHTML = '<button type="button" class="btn btn-pri" data-ruta="calcular">' + rotulo + '</button>';
    b.hidden = false;
  }
  /* La entrada (sube 12 px con un fundido de 180 ms) es CSS de esta pantalla, y se cuelga de esta
     clase y no de `.pf-mbar` a secas: la barra es de todo el documento y la usan otros módulos
     con sus propias acciones. */
  b.classList.add('mapa-mbar');
  b.onclick = ev => { if (ev.target.closest('[data-ruta]')) calcularRuta(); };
  /* Mide el alto de la barra ya puesta y publica `--mbar-h`. Medir con la entrada a medias no
     engaña: la barra solo se TRASLADA (translateY) mientras entra, y un traslado no cambia su
     alto —a diferencia de escalarla, que sí lo cambiaría—. Es el mismo problema que ya resolvió
     `alTerminarDeEntrar` para el marco del cotizador, y aquí se evita por construcción en vez
     de esperar a que termine la animación. */
  ajustarAltoBarra();
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
  ponerReticula();
  pintarModo();
  /* El mapa se sube a la vista solo: el botón que se acaba de tocar está en la lista de
     abajo, y la instrucción «mueve el mapa» sin el mapa enfrente es una instrucción a
     ciegas. */
  const div = $('mapa-lienzo');
  if (div) {
    div.scrollIntoView({ block: 'center', behavior: scrollSuave() });
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

/** Tocar el mapa en este modo salta cerca: el punto tocado pasa a quedar bajo la cruz. */
function alTocarMapa(ev) {
  if (!MANO || !ev || !ev.latlng || !mapa) return;
  mapa.panTo(ev.latlng, { animate: !quieto() });
}

/** El mapa terminó de moverse con el modo puesto: su centro es donde está la cruz. Redimensionar o
 *  abrir un globo también mueven el mapa; mientras el centro sea el mismo de cuando se abrió el
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
function copiarDireccion(dir, boton) {
  const msg = 'Dirección copiada — búscala en Google Maps y regresa con el link';
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
    refrescarPiezas(); refrescarPines({ animar: true }); encuadrar(); pintarMbar();
    return;
  }

  const ru = t.closest('[data-ruta]');
  if (ru) {
    if (ru.dataset.ruta === 'quitar') {
      soltarRuta();
      refrescarPiezas(); refrescarPines(); pintarMbar();
    } else calcularRuta();
    return;
  }

  if (t.closest('[data-encuadrar]')) { encuadrar(); return; }

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
}

/** El foco llegó a una tarjeta de la tira. Solo si llegó por teclado (`:focus-visible`): tocar el
 *  enlace de «Abrir en Google Maps» con ratón también lo enfoca, y eso no es pedir el mapa. */
function alEnfocar(ev) {
  const t = ev.target;
  if (!t || !t.closest) return;
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
