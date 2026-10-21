/* ============================================================================
   EL MAPA DE CALLES — el estilo «liberty» de OpenFreeMap, repintado con los colores de
   Google Maps.

   Por qué existe (Elías, 21 de octubre de 2026, con una captura de Google Maps al lado: «el
   mapa con relieve no me gusta y está más difícil de entender»). Los cuadros de OpenStreetMap
   son un mapa de cartógrafo: cada edificio con su borde, cada parque en verde fuerte, las
   avenidas en naranja; el filtro de la hoja de estilos los apagaba pero seguían leyéndose como
   textura. Quien usa esta pantalla para ir a la obra lee Google Maps: fondo gris claro, calles
   blancas, parques verde menta, agua azul, los edificios solo de cerca y los nombres en gris.

   De dónde sale. OpenFreeMap (openfreemap.org) sirve el mapa de OpenStreetMap en VECTORES, gratis,
   sin llave, sin registro y con uso comercial permitido —lo que ya no da CARTO (pide llave) ni
   Google (pide facturación)—. El estilo se baja de ellos y aquí solo se repinta: así sus fuentes,
   sus iconos y sus cuadros siempre van de la mano, y si un día renombran una capa, esa capa sale
   con su color original en vez de romper el mapa.

   Puro: recibe el JSON del estilo y devuelve uno nuevo. Lo prueba pruebas/mapa-estilo.mjs.
   ============================================================================ */

/* La paleta. Sacada a ojo de Google Maps (la de 2024, la de las calles blancas sobre gris) y no
   de una lista oficial, que no la hay. */
const C = {
  tierra:    '#eef0f3',
  parque:    '#c6e6bd',
  bosque:    '#cde8c3',
  pasto:     '#d3ebcb',
  agua:      '#9cc6f2',
  hospital:  '#fbe3e1',
  escuela:   '#f1ece0',
  arena:     '#f5eed8',
  pista:     '#e3e6ea',
  calle:     '#ffffff',
  bordeCalle:'#dde1e6',
  bordeAv:   '#cdd3da',
  bordeVia:  '#b7c2ce',
  via:       '#c3c8ce',
  edificio:  '#e3e6ea',
  bordeEdif: '#d6dadf',
  texto:     '#5f6368',
  textoSuave:'#80868b',
  textoBarrio:'#70757a',
  textoFuerte:'#202124',
  textoAgua: '#3b6fb6',
  halo:      '#ffffff',
};

/* Lo que se quita entero:
   · natural_earth — el sombreado del relieve de las montañas. Es justo lo que no se quería.
   · building-3d   — los edificios levantados en 3D. Vistos desde arriba son una mancha más.
   · park_outline  — la orilla punteada de los parques. Google no la pinta.
   · landuse_residential — el tono beige de las colonias: con él la ciudad entera era un parche. */
const QUITAR = new Set(['natural_earth', 'building-3d', 'park_outline', 'landuse_residential']);

/* Pintura por capa. Las calles se agrupan por la forma del nombre, no una por una: liberty tiene
   tres juegos (tunnel_, road_, bridge_) con los mismos tipos de calle. */
const PINTURA = {
  background:        { 'background-color': C.tierra },
  park:              { 'fill-color': C.parque, 'fill-outline-color': C.parque, 'fill-opacity': 1 },
  landcover_wood:    { 'fill-color': C.bosque, 'fill-opacity': .8 },
  landcover_grass:   { 'fill-color': C.pasto, 'fill-opacity': 1 },
  landuse_pitch:     { 'fill-color': C.pasto },
  landuse_track:     { 'fill-color': C.pasto },
  landuse_cemetery:  { 'fill-color': C.pasto },
  landuse_hospital:  { 'fill-color': C.hospital },
  landuse_school:    { 'fill-color': C.escuela },
  landcover_sand:    { 'fill-color': C.arena },
  water:             { 'fill-color': C.agua },
  waterway_tunnel:   { 'line-color': C.agua },
  waterway_river:    { 'line-color': C.agua },
  waterway_other:    { 'line-color': C.agua },
  aeroway_fill:      { 'fill-color': C.pista },
  aeroway_runway:    { 'line-color': C.calle },
  aeroway_taxiway:   { 'line-color': C.calle },
  building:          { 'fill-color': C.edificio, 'fill-outline-color': C.bordeEdif },
};

/** El color de una capa de calle según su nombre, o null si no es calle. */
function pinturaDeCalle(id) {
  if (!/^(tunnel|road|bridge)_/.test(id)) return null;
  if (/rail/.test(id)) return { 'line-color': C.via };
  if (/_casing$/.test(id)) {
    if (/motorway/.test(id)) return { 'line-color': C.bordeVia };
    if (/trunk|primary|secondary|tertiary|_link/.test(id)) return { 'line-color': C.bordeAv };
    return { 'line-color': C.bordeCalle };
  }
  if (/one_way|area_pattern/.test(id)) return null;
  return { 'line-color': C.calle };
}

/* El nombre en español primero: liberty pone el inglés antes («Mexico», «Guadalajara
   Metropolitan Area»), y el nombre local solo si no hay traducción. */
const NOMBRE = ['coalesce', ['get', 'name:es'], ['get', 'name']];

function rotulo(l) {
  const id = l.id, lay = l.layout || (l.layout = {}), pin = l.paint || (l.paint = {});
  /* Solo los que dicen un nombre: los escudos de carretera dicen el número («MEX 23») y se quedan. */
  if (lay['text-field'] && /"name/.test(JSON.stringify(lay['text-field']))) lay['text-field'] = NOMBRE;
  pin['text-halo-color'] = C.halo;
  if (/^highway-name/.test(id)) {
    pin['text-color'] = id === 'highway-name-path' ? C.textoSuave : C.texto;
    pin['text-halo-width'] = 1.5;
  } else if (id === 'label_other') {
    /* Colonias y barrios: en mayúsculas, separadas y en gris, como Google. Liberty las ponía en
       cursiva, que se lee como un río. */
    lay['text-font'] = ['Noto Sans Regular'];
    lay['text-transform'] = 'uppercase';
    pin['text-color'] = C.textoBarrio;
  } else if (/^label_/.test(id)) {
    pin['text-color'] = C.textoFuerte;
  } else if (/^poi_/.test(id)) {
    pin['text-color'] = C.texto;
    /* Las paradas de camión llenaban de iconos azules las avenidas desde muy lejos y competían con
       los pines de las obras, que son lo único que tiene que gritar. Se dejan para de cerca. */
    if (id === 'poi_transit') l.minzoom = Math.max(l.minzoom || 0, 16);
  } else if (/^water/.test(id)) {
    pin['text-color'] = C.textoAgua;
  }
}

/**
 * El estilo de liberty, con los colores de Google Maps.
 * @param {Object} base el JSON del estilo, tal como lo da `Geo.TILES.calles.estilo`
 * @returns {Object} un estilo nuevo; `base` no se toca
 */
export function estiloCalles(base) {
  const s = JSON.parse(JSON.stringify(base || {}));
  s.layers = (s.layers || []).filter(l => !QUITAR.has(l.id));
  /* La fuente del relieve se va con su capa: dejarla sería bajar cuadros que nadie pinta. */
  if (s.sources && s.sources.ne2_shaded && !s.layers.some(l => l.source === 'ne2_shaded')) delete s.sources.ne2_shaded;
  for (const l of s.layers) {
    /* Solo las de línea: `road_shield_us` también empieza con road_ y es un letrero. */
    const p = PINTURA[l.id] || (l.type === 'line' ? pinturaDeCalle(l.id) : null);
    if (p) l.paint = Object.assign(l.paint || {}, p);
    /* Los edificios, solo de cerca. De lejos eran el «relieve»: miles de cuadritos grises. */
    if (l.id === 'building') l.minzoom = Math.max(l.minzoom || 0, 16);
    if (l.type === 'symbol') rotulo(l);
  }
  return s;
}
