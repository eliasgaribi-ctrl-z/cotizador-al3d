/* Prueba de parseGmaps con URLs reales de Google Maps, una por formato del inventario
   de la sección 3 del documento de investigación. Cero red: si esta prueba necesita
   señal, el módulo está mal. Se corre con: node /tmp/probar-geo.mjs */
import { parseGmaps, esAcortado, distanciaKm, rutaVecinoMasCercano, centroGDL, TILES, capaBase }
  from '../js/datos/geo.js';

const cerca = (a, b) => Math.abs(a - b) < 0.0002;

const CASOS = [
  { n: '1  place con @ y zoom',
    u: 'https://www.google.com/maps/place/Av.+Vallarta+1300,+Guadalajara/@20.6736,-103.3440,17z/',
    esp: { lat: 20.6736, lng: -103.3440, fuente: 'maps_camara', exacta: false } },

  { n: '2  data= con !3d!4d (el pin real, gana sobre la arroba)',
    u: 'https://www.google.com/maps/place/Expo+Guadalajara/@20.6543,-103.3901,17z/data=!3m1!4b1!4m6!3m5!1s0x8428b18e1e0a1b1f:0x0!8m2!3d20.6551!4d-103.3925',
    esp: { lat: 20.6551, lng: -103.3925, fuente: 'maps_pin', exacta: true } },

  { n: '3  ?q=lat,lng',
    u: 'https://www.google.com/maps?q=20.5230,-103.4470',
    esp: { lat: 20.5230, lng: -103.4470, fuente: 'maps_query', exacta: true } },

  { n: '4  ?q= con la coma percent-encoded (%2C), como llega por WhatsApp',
    u: 'https://maps.google.com/?q=20.7214%2C-103.3918',
    esp: { lat: 20.7214, lng: -103.3918, fuente: 'maps_query', exacta: true } },

  { n: '5  /maps/search/lat,+lng',
    u: 'https://www.google.com/maps/search/20.6134,+-103.4370',
    esp: { lat: 20.6134, lng: -103.4370, fuente: 'maps_search', exacta: true } },

  { n: '6  /maps/@lat,lng,z (solo cámara)',
    u: 'https://www.google.com/maps/@20.6597,-103.3496,15z',
    esp: { lat: 20.6597, lng: -103.3496, fuente: 'maps_camara', exacta: false } },

  { n: '7  parámetro ll=',
    u: 'https://maps.google.com/maps?ll=20.6768,-103.3475&z=16&t=m',
    esp: { lat: 20.6768, lng: -103.3475, fuente: 'maps_query', exacta: true } },

  { n: '8  /maps/dir/ con !1d lng !2d lat (INVERTIDO en dir)',
    u: 'https://www.google.com/maps/dir/Guadalajara/Zapopan/data=!4m8!4m7!1m5!1m1!1s0x0:0x0!2m2!1d-103.3918!2d20.7214!1m0',
    esp: { lat: 20.7214, lng: -103.3918, fuente: 'maps_dir', exacta: false } },

  { n: '9  /maps/dir/?api=1&destination= (cae en la regla de query)',
    u: 'https://www.google.com/maps/dir/?api=1&destination=20.5881,-103.4230&travelmode=driving',
    esp: { lat: 20.5881, lng: -103.4230, fuente: 'maps_query', exacta: true } },

  { n: '10 coordenada negativa en las DOS (Chile: fuera de México, sospechoso)',
    u: 'https://www.google.com/maps/place/Santiago/@-33.4489,-70.6693,12z',
    esp: { lat: -33.4489, lng: -70.6693, fuente: 'maps_camara', sospechoso: true } },

  { n: '11 lat/lng INVERTIDOS a mano (lng primero): se salva volteándolo',
    u: 'https://www.google.com/maps?q=-103.4470,20.5230',
    esp: { lat: 20.5230, lng: -103.4470, fuente: 'maps_query', invertida: true } },

  { n: '12 válido pero fuera de México (Nueva York): sospechoso, NO corregido',
    u: 'https://www.google.com/maps/place/Times+Square/@40.7580,-73.9855,17z',
    esp: { lat: 40.7580, lng: -73.9855, sospechoso: true } },

  { n: '13 link corto de maps.app.goo.gl: no se expande, se explica',
    u: 'https://maps.app.goo.gl/xY7bQm4TfZ2kL9aA',
    esp: { corto: true } },

  { n: '14 goo.gl/maps, el corto viejo',
    u: 'https://goo.gl/maps/abcdEFGH1234',
    esp: { corto: true } },

  { n: '15 basura: no es un link ni tiene coordenadas',
    u: 'oye mandame la ubicacion de la casa porfa',
    esp: null },

  { n: '16 link de Maps sin coordenada (solo place_id opaco)',
    u: 'https://www.google.com/maps/place/?q=place_id:ChIJm2VqQ8CvKIQRnaGSU5T9mHc',
    esp: null },

  { n: '17 (0,0) de relleno: la Isla Nula no es un pin',
    u: 'https://www.google.com/maps?q=0,0',
    esp: null },

  { n: '18 vacío',
    u: '',
    esp: null },
];

let bien = 0, mal = 0;
for (const c of CASOS) {
  const r = parseGmaps(c.u);
  let ok = true, detalle = '';

  if (c.esp === null) {
    ok = (r === null);
    detalle = ok ? 'null' : JSON.stringify(r);
  } else if (c.esp.corto) {
    ok = !!(r && r.corto === true && /link corto/.test(r.mensaje || ''));
    detalle = r ? 'corto:' + r.corto : 'null';
  } else {
    ok = !!r && !r.corto && cerca(r.lat, c.esp.lat) && cerca(r.lng, c.esp.lng);
    if (ok && c.esp.fuente)     ok = r.fuente === c.esp.fuente;
    if (ok && 'exacta' in c.esp) ok = r.exacta === c.esp.exacta;
    if (ok && c.esp.sospechoso) ok = r.sospechoso === true;
    if (ok && !c.esp.sospechoso && r) ok = !r.sospechoso;
    if (ok && c.esp.invertida)  ok = r.invertida === true;
    detalle = r ? `${r.lat},${r.lng} ${r.fuente}${r.exacta ? ' exacta' : ''}${r.sospechoso ? ' SOSPECHOSO' : ''}${r.invertida ? ' invertida' : ''}` : 'null';
  }

  console.log(`${ok ? 'OK  ' : 'MAL '} ${c.n.padEnd(58)} -> ${detalle}`);
  ok ? bien++ : mal++;
}

/* Lo demás del módulo, en corto */
const pruebas = [
  ['esAcortado sí',        esAcortado('https://maps.app.goo.gl/abc') === true],
  ['esAcortado no',        esAcortado('https://www.google.com/maps?q=20,-103') === false],
  ['centroGDL',            centroGDL.lat === 20.6736 && centroGDL.lng === -103.344],
  ['distanciaKm GDL-ZAP',  Math.abs(distanciaKm({lat:20.6736,lng:-103.344},{lat:20.7214,lng:-103.3918}) - 7.2) < 0.6],
  ['distanciaKm sin dato', distanciaKm(null, {lat:20,lng:-103}) === 0],
  ['TILES tres, todos con attribution', ['osm','carto','google'].every(k => TILES[k] && TILES[k].attribution && TILES[k].maxZoom)],
  ['TILES.google es stub sin url',      TILES.google.url === null],
  ['capaBase sin Leaflet devuelve null', capaBase('osm') === null],
];

/* Ruta: cuatro puntos agendados a lo tonto (cruzando la ciudad) más uno sin ubicar */
const visitas = [
  {id:'D', lat:20.7500, lng:-103.3800},
  {id:'A', lat:20.6700, lng:-103.3450},
  {id:'C', lat:20.7100, lng:-103.3900},
  {id:'B', lat:20.6800, lng:-103.3500},
  {id:'Z'},  // sin ubicar
];
const orden = rutaVecinoMasCercano(visitas, centroGDL).map(p => p.id).join('');
pruebas.push(['rutaVecinoMasCercano ordena y manda los sin pin al final: ' + orden, orden === 'ABCDZ']);
pruebas.push(['rutaVecinoMasCercano con lista vacía', rutaVecinoMasCercano([], null).length === 0]);
pruebas.push(['rutaVecinoMasCercano con basura', rutaVecinoMasCercano(null, null).length === 0]);

for (const [n, ok] of pruebas) {
  console.log(`${ok ? 'OK  ' : 'MAL '} ${n}`);
  ok ? bien++ : mal++;
}

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
