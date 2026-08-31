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
import { $, esc, ico, money, toast, avisarResultado, vacio, chip, hoyISO, fechaLocal,
         fmtFecha, fmtFechaDia, fmtHora, cuando, diasHasta, abrirCapa, cerrarCapa,
         copiarTexto, ajustarAltoBarra } from '../nucleo/ui.js';

/* ============================================================================
   Estado del módulo. Todo aquí, y todo se suelta en desmontar().
   ============================================================================ */

let cont = null;
let CTX = null;

let mapa = null;            // la instancia de Leaflet
let capaPines = null;       // LayerGroup de los marcadores
let capaRuta = null;        // LayerGroup de la línea de la ruta
let MARCAS = new Map();     // proyecto_id -> marcador, para volar a uno recién ubicado

let PROYS = [];             // proyectos vivos
let INST = new Map();       // proyecto_id -> {fecha, hora, estado, viva}
let HOY = hoyISO();

let GRUPOS_ON = new Set(['ganado', 'taller', 'listo', 'instalado']);
let RANGO = null;           // lo fija el primer montar() según el rol, y luego manda el usuario
let RUTA = null;            // {orden:[proyecto], km:number}
let MANO = null;            // {id, nombre, lat, lng, marcador} — el modo «pin a mano»
let PIDE = null;            // {id, nombre, aviso} — el panel de pegar el link

let _armado = false;        // el armazón ya está pintado (y el lienzo existe)
let _redimT = 0;
const _oyentes = [];        // [[elemento, tipo, fn]]

function on(el, tipo, fn) {
  if (!el) return;
  el.addEventListener(tipo, fn);
  _oyentes.push([el, tipo, fn]);
}

/* ============================================================================
   Vocabulario de pantalla

   Las ocho etapas se agrupan en cuatro cosas que se leen de un vistazo desde la banqueta.
   `garantia` va con `instalado` porque en el mapa son lo mismo —el letrero ya está
   puesto—; su palabra completa sí aparece en el globo. `cancelado` no llega aquí: se pide
   `vivos:true` y un proyecto que no se dio no es un lugar a donde ir.
   ============================================================================ */

const GRUPOS = [
  { g: 'ganado',    marca: 'G', palabra: 'Vendido, sin empezar', etapas: ['ganado'] },
  { g: 'taller',    marca: 'T', palabra: 'En el taller',         etapas: ['en_diseno', 'cortado', 'armado'] },
  { g: 'listo',     marca: 'L', palabra: 'Listo para instalar',  etapas: ['listo'] },
  { g: 'instalado', marca: 'I', palabra: 'Instalado',            etapas: ['instalado', 'garantia'] },
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
   Fechas — siempre sobre los campos, nunca con new Date(iso)
   ============================================================================ */

const p2 = n => String(n).padStart(2, '0');

/** `new Date('2026-08-23')` se lee como UTC y en México devuelve el día anterior: ese
 *  error cuesta un día de instalación. Se suma con `fechaLocal`, que ancla a mediodía. */
function masDias(iso, n) {
  const f = fechaLocal(iso);
  if (!f) return iso;
  f.setDate(f.getDate() + n);
  return f.getFullYear() + '-' + p2(f.getMonth() + 1) + '-' + p2(f.getDate());
}

/* ============================================================================
   Montar y desmontar
   ============================================================================ */

export async function montar(contenedor, ctx) {
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

  cont.innerHTML = '<div class="vacio">' + ico('i-reloj') +
    '<p class="vacio-t">Leyendo las obras…</p></div>';
  await cargar();
}

export function desmontar() {
  for (const [el, tipo, fn] of _oyentes) {
    try { el.removeEventListener(tipo, fn); } catch (_) {}
  }
  _oyentes.length = 0;
  clearTimeout(_redimT); _redimT = 0;

  /* `map.remove()` no es opcional. Un Leaflet que no se destruye deja vivos su contenedor,
     sus oyentes de rueda y arrastre y sus peticiones de cuadros a medio camino: a la sexta
     ida y vuelta a esta pantalla el teléfono va a tirones y nadie sabe por qué. */
  destruirMapa();

  /* La barra fija es del documento, no de este módulo: si se sale con «Ordenar la ruta de
     hoy» puesto, el primer dedo del día lo aprieta creyendo que es de la pantalla que está
     viendo. Se limpia aquí y no en la que sigue. */
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }

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

/* ============================================================================
   Leer — todo por la capa de datos, cero cuentas propias
   ============================================================================ */

async function cargar() {
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

  /* Una ruta calculada con los proyectos de antes apuntaría a pines que ya se movieron. */
  RUTA = null;
  pintar();
}

/* ============================================================================
   Filtros — puros sobre lo que ya se leyó
   ============================================================================ */

/* `Number(null)` es 0, así que `isFinite(Number(p.lat))` decía «sí tiene pin» de un
   proyecto sin ubicar y lo mandaba a 0,0 —la Isla Nula, en el Atlántico frente a Ghana—.
   Ahí es donde nace el pin en medio del océano que esta pantalla existe para no pintar. El
   cero explícito también se rechaza: es el resultado típico de parsear dos ceros de
   relleno, y un dato equivocado se usa. */
const coord = v => (v === null || v === undefined || v === '') ? NaN : Number(v);
const tienePin = p => {
  if (!p) return false;
  const la = coord(p.lat), ln = coord(p.lng);
  return Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0);
};

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
  cont.innerHTML =
    '<div class="pf-cuentas" id="mapa-cuentas"></div>' +
    '<div class="chips" id="mapa-etapas" role="group" aria-label="Etapas que se pintan"></div>' +
    '<div class="chips" id="mapa-rango" role="group" aria-label="Hasta cuándo se pinta"></div>' +
    '<div class="btn-fila" id="mapa-acc"></div>' +
    '<div id="mapa-modo"></div>' +
    '<div id="mapa-lienzo"></div>' +
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
    '<div id="mapa-ruta"></div>' +
    '<div id="mapa-faltan"></div>' +
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
      '<span class="pf-cuenta"><b>' + pines.length + '</b> en el mapa</span>' +
      '<span class="pf-cuenta' + (hoy.length ? ' urge' : '') + '"><b>' + hoy.length + '</b> por instalar hoy</span>' +
      '<span class="pf-cuenta' + (faltan.length ? ' urge' : '') + '"><b>' + faltan.length + '</b> sin ubicar</span>';
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
    et.innerHTML = GRUPOS.map(g =>
      chip(g.marca + ' · ' + g.palabra + ' (' + (porGrupo.get(g.g) || 0) + ')',
        GRUPOS_ON.has(g.g), 'data-g="' + g.g + '"')).join('');
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
  pintarFaltan(faltan);
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
  if (mapa) {
    try { mapa.off(); mapa.remove(); } catch (e) { console.warn('el mapa no se pudo destruir', e); }
  }
  mapa = null; capaPines = null; capaRuta = null;
  MARCAS = new Map();
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

function refrescarPines() {
  if (!mapa || !capaPines) return;
  capaPines.clearLayers();
  MARCAS = new Map();

  const lista = pintables();
  const orden = new Map();
  if (RUTA) RUTA.orden.forEach((p, i) => orden.set(p.id, i + 1));

  for (const p of lista) {
    const gr = grupoDe(p.etapa);
    const n = orden.get(p.id) || 0;
    const icono = L.divIcon({
      className: 'mapa-pin ' + gr.g + (n ? ' ruta' : ''),
      html: esc(n ? String(n) : gr.marca),
      iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -15],
    });
    const m = L.marker([Number(p.lat), Number(p.lng)], {
      icon: icono,
      /* El título es lo que oye quien navega con teclado y lo que ve quien deja el cursor
         encima: la letra del pin sola no es un nombre. */
      title: (p.nombre || p.folio_local || 'Proyecto') + ' — ' + gr.palabra,
      riseOnHover: true,
    });
    m.bindPopup(globo(p, gr, n), { maxWidth: 280, autoPanPadding: [24, 24] });
    m.addTo(capaPines);
    MARCAS.set(p.id, m);
  }

  dibujarLinea();
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

  const destino = Number(p.lat) + ',' + Number(p.lng);
  return '<b>' + esc(nombre) + '</b>' +
    '<div><span class="pf-etapa ' + esc(claseEtapa(p.etapa)) + '">' +
      esc(nombreEtapa(p.etapa)) + '</span>' +
      (n ? ' <span class="pf-cuando">parada ' + n + '</span>' : '') + '</div>' +
    '<div>' + esc(fecha) + '</div>' +
    dinero +
    '<a class="btn btn-pri" target="_blank" rel="noopener"' +
      ' href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destino) + '">' +
      ico('i-camion') + 'Abrir en Google Maps</a>';
}

function dibujarLinea() {
  if (!capaRuta) return;
  capaRuta.clearLayers();
  if (!RUTA || RUTA.orden.length < 2) return;
  const pts = RUTA.orden.filter(tienePin).map(p => [Number(p.lat), Number(p.lng)]);
  if (pts.length < 2) return;
  /* El color va por CSS con `className` y no por la opción `color`: Leaflet pinta el trazo
     con un atributo de presentación, que cualquier regla de hoja de estilos le gana, y así
     la línea usa el mismo acento del sistema en vez de un azul suelto de la librería. */
  try {
    L.polyline(pts, { className: 'mapa-ruta-linea', interactive: false }).addTo(capaRuta);
  } catch (e) { console.warn('la línea de la ruta no se pudo dibujar', e); }
}

function encuadrar() {
  if (!mapa) return;
  const lista = (RUTA ? RUTA.orden : pintables()).filter(tienePin);
  if (!lista.length) { mapa.setView([Geo.centroGDL.lat, Geo.centroGDL.lng], 11); return; }
  if (lista.length === 1) { mapa.setView([Number(lista[0].lat), Number(lista[0].lng)], 15); return; }
  try {
    mapa.fitBounds(L.latLngBounds(lista.map(p => [Number(p.lat), Number(p.lng)])),
      { padding: [28, 28], maxZoom: 16 });
  } catch (e) { console.warn('no se pudo encuadrar', e); }
}

/** Ir al pin que se acaba de guardar y abrir su globo. Guardar un pin sin ver dónde cayó es
 *  guardar a ciegas, y un pin en la colonia de al lado se ve igual de convincente. */
function volarA(id) {
  const p = PROYS.find(x => x.id === id);
  if (!mapa || !tienePin(p)) return;
  mapa.setView([Number(p.lat), Number(p.lng)], 16);
  const m = MARCAS.get(id);
  if (m) { try { m.openPopup(); } catch (_) {} return; }
  /* El pin se guardó pero el filtro de arriba no lo pinta —lo más común: no tiene fecha de
     instalación y el rango son 15 días—. Sin este aviso el mapa se va a un lugar vacío y
     parece que no se guardó nada. */
  toast('El pin quedó guardado. Este filtro no lo pinta: cambia el rango de fechas o las etapas para verlo', '', 5200);
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
  refrescarPines();
  encuadrar();
  pintarMbar();
}

function pintarRuta() {
  const caja = $('mapa-ruta');
  if (!caja) return;
  if (!RUTA) { caja.innerHTML = ''; return; }

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
    '<p class="hintnote nota-av">Son ' + RUTA.orden.length + ' paradas y unos ' +
      esc(String(RUTA.km)) + ' km en línea recta, empezando desde el centro de Guadalajara ' +
      '—el taller no tiene pin guardado, así que si sales de otro lado, lee el orden y ' +
      'empieza por la que te quede—. Van también las instalaciones atrasadas que nadie ' +
      'marcó, porque siguen debiendo una visita. No es la ruta óptima y no pretende serlo: ' +
      'es «no cruces la ciudad tres veces». Por calle sale entre 20 % y 40 % más largo, y ' +
      'el orden casi nunca cambia por eso.</p>' +
    filas +
    '</div></div>';
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
    b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); return;
  }
  b.innerHTML = '<button type="button" class="btn btn-pri" data-ruta="calcular">' +
    ico('i-camion') + 'Ordenar la ruta de hoy (' + hoy.length + ')</button>';
  b.hidden = false;
  b.onclick = ev => { if (ev.target.closest('[data-ruta]')) calcularRuta(); };
  ajustarAltoBarra();
}

/* ============================================================================
   Poner el pin a mano — un toque, cero teclado
   ============================================================================ */

function abrirMano(id) {
  const p = PROYS.find(x => x.id === id);
  if (!p) return;
  if (!mapa) { toast('El mapa no cargó, así que no hay dónde tocar. Pega el link de Google Maps', 'err', 4600); return; }
  MANO = { id, nombre: p.nombre || p.folio_local || 'la obra', lat: null, lng: null, marcador: null };
  pintarModo();
  /* El mapa se sube a la vista solo: el botón que se acaba de tocar está en la lista de
     abajo, y la instrucción «toca en el mapa» sin el mapa enfrente es una instrucción a
     ciegas. */
  const div = $('mapa-lienzo');
  if (div) div.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function cerrarMano() {
  if (MANO && MANO.marcador && mapa) {
    try { mapa.removeLayer(MANO.marcador); } catch (_) {}
  }
  MANO = null;
  pintarModo();
}

function alTocarMapa(ev) {
  if (!MANO || !ev || !ev.latlng) return;
  MANO.lat = ev.latlng.lat;
  MANO.lng = ev.latlng.lng;
  if (MANO.marcador) {
    MANO.marcador.setLatLng(ev.latlng);
  } else {
    MANO.marcador = L.marker(ev.latlng, {
      draggable: true,
      title: 'Pin de ' + MANO.nombre + ' — arrástralo para acomodarlo',
      icon: L.divIcon({ className: 'mapa-pin mano', html: ico('i-pin'),
                        iconSize: [26, 26], iconAnchor: [13, 13] }),
    });
    MANO.marcador.on('dragend', () => {
      /* El oyente vive en un marcador que se puede quitar antes de que el arrastre acabe
         —cancelar con el dedo todavía abajo—: sin la guarda, leer `MANO.marcador` de un
         MANO ya nulo tira la pantalla. */
      if (!MANO || !MANO.marcador) return;
      const c = MANO.marcador.getLatLng();
      MANO.lat = c.lat; MANO.lng = c.lng;
    });
    /* Va colgado del mapa y no de `capaPines`: esa capa se vacía completa en cada
       repintado, y un pin a medio poner que desaparece porque alguien tocó un filtro deja
       la barra pidiendo guardar algo que ya no está. */
    MANO.marcador.addTo(mapa);
  }
  pintarModo();
}

function pintarModo() {
  const caja = $('mapa-modo');
  const div = $('mapa-lienzo');
  if (div) div.classList.toggle('poniendo', !!MANO);
  if (!caja) return;
  if (!MANO) { caja.innerHTML = ''; return; }

  const puesto = MANO.lat !== null;
  caja.innerHTML = '<div class="hintnote nota-av mapa-modo" role="status">' +
    '<span>' + (puesto
      ? 'Arrástralo si quedó cerca y guarda cuando esté bien.'
      : 'Toca en el mapa donde está <b>' + esc(MANO.nombre) + '</b>.') + '</span>' +
    (puesto ? '<button type="button" class="btn btn-ok pf-btn-corto" data-mano-ok>' +
      ico('i-check') + 'Guardar aquí</button>' : '') +
    '<button type="button" class="btn btn-gho pf-btn-corto" data-mano-no>Cancelar</button>' +
    '</div>';
}

async function guardarMano() {
  if (!MANO || MANO.lat === null) return;
  const id = MANO.id;
  const r = await Proyectos.actualizar(id,
    { lat: MANO.lat, lng: MANO.lng, geo_fuente: 'manual' });
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
    refrescarPiezas(); refrescarPines(); encuadrar();
    return;
  }

  const ra = t.closest('[data-rango]');
  if (ra) {
    RANGO = ra.dataset.rango;
    /* La ruta se calculó con los pines de hoy. Cambiar el rango a mano cambia el conjunto,
       y una numeración que ya no corresponde a lo que se ve es peor que ninguna. */
    RUTA = null;
    refrescarPiezas(); refrescarPines(); encuadrar(); pintarMbar();
    return;
  }

  const ru = t.closest('[data-ruta]');
  if (ru) {
    if (ru.dataset.ruta === 'quitar') {
      RUTA = null;
      refrescarPiezas(); refrescarPines(); pintarMbar();
    } else calcularRuta();
    return;
  }

  if (t.closest('[data-encuadrar]')) { encuadrar(); return; }

  const ver = t.closest('[data-ver]');
  if (ver) { volarA(ver.dataset.ver); return; }

  const link = t.closest('[data-link]');
  if (link) { abrirLink(link.dataset.link); return; }

  const mano = t.closest('[data-mano]');
  if (mano) { abrirMano(mano.dataset.mano); return; }

  if (t.closest('[data-mano-ok]')) { guardarMano(); return; }
  if (t.closest('[data-mano-no]')) { cerrarMano(); return; }
}

function clicPide(ev) {
  const b = ev.target.closest('[data-pide]');
  if (!b) return;
  const q = b.dataset.pide;
  if (q === 'cerrar') { cerrarPide(); return; }
  if (q === 'pegar') { pegarDelPortapapeles(); return; }
  if (q === 'copiardir') {
    if (PIDE) copiarTexto(PIDE.dir, 'Dirección copiada — búscala en Google Maps y regresa con el link');
    return;
  }
  if (q === 'guardar') { guardarLink(false); return; }
  if (q === 'forzar') { guardarLink(true); return; }
}
