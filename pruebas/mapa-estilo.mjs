/* El mapa de calles con los colores de Google (js/datos/mapa-estilo.js). Sin red: el estilo de
   OpenFreeMap va copiado en pruebas/datos/openfreemap-liberty.json, tal como se bajó el 21 de
   octubre de 2026. Lo que se defiende es lo que Elías pidió y lo que rompería el mapa:
     · sin relieve: ni el sombreado de las montañas ni los edificios en 3D, y sin su fuente;
     · calles blancas, edificios solo de cerca, nombres en español;
     · los escudos de carretera siguen diciendo su número, y ninguna capa queda con una pintura
       que no es de su tipo (MapLibre rechaza el estilo ENTERO por una sola, y el mapa sale gris).
   Se corre con: node pruebas/mapa-estilo.mjs */
import { readFileSync } from 'node:fs';
import { estiloCalles } from '../js/datos/mapa-estilo.js';
import { TILES } from '../js/datos/geo.js';

const base = JSON.parse(readFileSync(new URL('./datos/openfreemap-liberty.json', import.meta.url), 'utf8'));
const copia = JSON.stringify(base);
const s = estiloCalles(base);
const capa = id => s.layers.find(l => l.id === id);
const pruebas = [];
let bien = 0, mal = 0;

pruebas.push(['no toca el estilo que recibe', JSON.stringify(base) === copia]);
pruebas.push(['sin el sombreado del relieve', !capa('natural_earth') && !(s.sources && s.sources.ne2_shaded)]);
pruebas.push(['sin edificios en 3D', !s.layers.some(l => l.type === 'fill-extrusion')]);
pruebas.push(['las mismas fuentes de vectores, letras e iconos', s.sources.openmaptiles && s.glyphs === base.glyphs && s.sprite === base.sprite]);
pruebas.push(['el fondo gris claro', capa('background').paint['background-color'] === '#eef0f3']);
pruebas.push(['las calles blancas', ['road_minor', 'road_secondary_tertiary', 'road_trunk_primary', 'road_motorway', 'bridge_street']
  .every(id => capa(id).paint['line-color'] === '#ffffff')]);
pruebas.push(['los edificios, de z16 para adentro', capa('building').minzoom >= 16]);
pruebas.push(['las paradas de camión, de z16 para adentro', capa('poi_transit').minzoom >= 16]);
pruebas.push(['los nombres en español primero', JSON.stringify(capa('highway-name-major').layout['text-field']).includes('name:es')]);
pruebas.push(['los escudos siguen con su número', !JSON.stringify(capa('road_shield_us').layout['text-field'] || '').includes('name:es')]);

/* Cada propiedad de pintura tiene que ser del tipo de su capa: `line-color` en una capa de
   símbolo es lo que tumbó el estilo entero en la primera prueba de navegador. */
const PREFIJO = { line: 'line-', fill: 'fill-', symbol: /^(text|icon)-/, background: 'background-', raster: 'raster-' };
const ajenas = [];
for (const l of s.layers) {
  const pre = PREFIJO[l.type];
  for (const k of Object.keys(l.paint || {})) {
    const ok = pre instanceof RegExp ? pre.test(k) : k.startsWith(pre);
    if (!ok) ajenas.push(l.id + '.' + k);
  }
}
pruebas.push(['ninguna pintura ajena a su capa' + (ajenas.length ? ': ' + ajenas.join(', ') : ''), ajenas.length === 0]);

pruebas.push(['un estilo vacío no revienta', Array.isArray(estiloCalles(null).layers)]);
pruebas.push(['TILES.calles apunta al estilo de OpenFreeMap', TILES.calles.estilo === 'https://tiles.openfreemap.org/styles/liberty']);
pruebas.push(['  con su crédito (la licencia lo pide)', /OpenFreeMap/.test(TILES.calles.attribution) && /OpenStreetMap/.test(TILES.calles.attribution)]);
pruebas.push(['  y cae a OSM si no se puede', TILES[TILES.calles.respaldo] && TILES[TILES.calles.respaldo].url]);

for (const [n, ok] of pruebas) {
  console.log(`${ok ? 'OK  ' : 'MAL '} ${n}`);
  ok ? bien++ : mal++;
}
console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
