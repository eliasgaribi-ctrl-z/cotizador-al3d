/* Las dos reglas que deciden QUÉ es una partida, no cuánto cuesta.
 *
 * 1. Menos de 10 cm no son letras 3D. A esa altura no hay canto que doblar ni LED que
 *    quepa: el taller lo corta plano en acrílico. Si la app deja pasar unas «letras» de
 *    6 cm, la cotización sale al catálogo equivocado —$40 el centímetro en vez de $20— y
 *    prometiendo algo que el taller no puede fabricar. Se descubre en producción.
 *
 * 2. Un bastidor y una caja de luz se cobran por ÁREA, así que llevan dos cotas: el ancho
 *    y el alto del mismo letrero. La IA tiene una instrucción de hierro que dice «cada
 *    corchete es una partida» y con ella una caja de 2 × 1 m volvía partida en dos, cada
 *    mitad sin la otra medida y las dos en $0. El prompt ya pide que vayan juntas; esto
 *    prueba lo que las junta pase lo que pase, que es lo único que no depende de que un
 *    modelo tenga un buen día.
 *
 * Ninguna de las dos se ve mirando la pantalla: las dos salen «plausibles». Por eso están
 * aquí y no en la auditoría a mano.
 *
 * Uso: node pruebas/reglas-de-partida.mjs   (o pruebas/correr.sh, que corre todas)          */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- El documento de mentiras: lo único que hace falta es que nada truene ---- */
const noop = () => {};
const elemento = () => ({
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  style: {}, setAttribute: noop, getAttribute: () => null, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], textContent: '', innerHTML: '',
  focus: noop, closest: () => null, appendChild: noop, getBoundingClientRect: () => ({ top: 0 }),
});
const document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop, readyState: 'complete',
  documentElement: elemento(), body: elemento(), createElement: elemento, activeElement: null,
};
const window = {
  addEventListener: noop, removeEventListener: noop, innerWidth: 1200, innerHeight: 800,
  matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
  history: { pushState: noop, replaceState: noop, back: noop },
  location: { hash: '', search: '', pathname: '/' }, scrollTo: noop,
  setTimeout, clearTimeout, requestAnimationFrame: f => setTimeout(f, 0),
};
window.window = window; window.parent = window; window.self = window;
class Observador { observe() {} disconnect() {} }
const ctx = vm.createContext({
  window, document, self: window, location: window.location, history: window.history,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  navigator: { userAgent: 'node' }, console, setTimeout, clearTimeout,
  requestAnimationFrame: window.requestAnimationFrame, getComputedStyle: () => ({ top: '0' }),
  matchMedia: window.matchMedia, MutationObserver: Observador, ResizeObserver: Observador,
  IntersectionObserver: Observador, Intl, URL, performance, structuredClone,
  Blob: class {}, FileReader: class {}, Image: class {}, CustomEvent: class {}, Event: class {},
  CSS: { escape: s => s, supports: () => true },
});
for (const f of ['js/cotizador/catalogo.js', 'js/cotizador/nucleo.js', 'js/cotizador/partidas.js',
                 'js/cotizador/ia.js']) {
  vm.runInContext(readFileSync(join(RAIZ, f), 'utf8'), ctx, { filename: f });
}
/* applyAi y setTipo pintan la pantalla al terminar y aquí no hay pantalla. Se callan las
   que solo dibujan o guardan: lo que se prueba es lo que dejan escrito en Q.items.

   `capturaBloqueada` es el candado de captura y vive en proceso.js, que no se carga aquí:
   ese archivo engancha la pantalla entera al cargarse —`$('f-anti').addEventListener(…)`—
   y sin pantalla truena en la primera línea. Se declara abierto, que es el estado en el que
   se captura: el candado tiene sus propias pruebas de navegador. */
vm.runInContext(`renderItems=()=>{};toast=()=>{};saveState=()=>{};updProg=()=>{};
                 sincronizarPlegado=()=>{};voz=()=>{};renderSummary=()=>{};updDirRaw=()=>{};
                 function capturaBloqueada(){return false;}
                 function faltanDatosCliente(){return false;}`, ctx);
const ev = code => vm.runInContext(code, ctx);
const Q = ev('Q');
const F = {};
for (const n of ['alturaDeRecorte', 'forzarRecortePorAltura', 'fusionarParesDeArea',
  'medidasCubiertas', 'applyAi', 'lineTotal', 'setTipo', 'faltantesDe']) F[n] = ev(n);
const ALTURA_MIN = ev('ALTURA_MIN_LETRAS');

let fallas = 0;
const cierto = (cond, que) => {
  console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que);
  if (!cond) fallas++;
};
/* Una partida como la que nace de addItem, para no depender del DOM */
const partida = (extra = {}) => ({
  id: extra.id || 1, tipo: 'letras', material: '', comp: 'recta', luz: true, altura: 0, n: 0,
  tarifa: 0, ancho: 0, alto: 0, acab: '', recComp: false, bas: '', desc: '', pz: 1, pu: 0,
  showInPdf: true, ...extra,
});

console.log('\nLA FRONTERA DE LOS ' + ALTURA_MIN + ' cm');
cierto(ALTURA_MIN === 10, 'la regla vive en un solo número y son 10 cm');
cierto(F.alturaDeRecorte(9.5), '9.5 cm es recorte');
cierto(F.alturaDeRecorte(9.99), '9.99 cm también: la frontera no se redondea hacia arriba');
cierto(!F.alturaDeRecorte(10), '10 cm justos NO: la regla es «menos de 10»');
cierto(!F.alturaDeRecorte(40), '40 cm son letras');
cierto(!F.alturaDeRecorte(0), 'sin altura no se decide nada — la partida recién creada sigue siendo letras');
cierto(!F.alturaDeRecorte(-5), 'un negativo tampoco convierte');
cierto(!F.alturaDeRecorte(''), 'ni un campo vacío');

console.log('\nLAS LETRAS QUE NO SE PUEDEN FABRICAR PASAN A RECORTE');
let it = partida({ tipo: 'letras', altura: 6, n: 7, material: 'acero', comp: 'cursiva' });
cierto(F.forzarRecortePorAltura(it) === true, 'unas «letras» de 6 cm se convierten');
cierto(it.tipo === 'recorte', 'y quedan como recorte de acrílico');
cierto(it.acab === '', 'sin acabado elegido: $20, $25 o $55 el cm es dinero y lo decide una persona');
cierto(F.lineTotal(it) === 0, 'así que todavía no vale nada — entra en ámbar, no en el PDF a $40/cm');
cierto(F.faltantesDe(it).includes('acabado'), 'y la partida dice que le falta el acabado');
cierto(it.material === 'acero' && it.comp === 'cursiva' && it.n === 7,
  'material, complejidad y piezas se conservan: subir la altura y volver a letras devuelve lo que había');

it = partida({ tipo: 'letras', altura: 6, acab: 'vinil' });
F.forzarRecortePorAltura(it);
cierto(it.acab === 'vinil', 'un acabado que ya estaba elegido no se pisa');

cierto(F.forzarRecortePorAltura(partida({ tipo: 'letras', altura: 10 })) === false,
  'a 10 cm exactos no se toca nada');
cierto(F.forzarRecortePorAltura(partida({ tipo: 'letras', altura: 0 })) === false,
  'una partida sin altura todavía no es nada: no se convierte al nacer');
cierto(F.forzarRecortePorAltura(partida({ tipo: 'caja', altura: 4, ancho: 30, alto: 20 })) === false,
  'una caja de luz no se convierte: la regla es sobre las letras');
cierto(F.forzarRecortePorAltura(partida({ tipo: 'manual', altura: 4 })) === false, 'una manual tampoco');
cierto(F.forzarRecortePorAltura(null) === false, 'y sin partida no truena');

console.log('\nEL PRECIO DESPUÉS DE CONVERTIR ES EL DEL CATÁLOGO DE RECORTES');
it = partida({ tipo: 'letras', altura: 8, n: 5, material: 'acr-vol' });
cierto(F.lineTotal(it) === 40 * 8 * 5, 'antes de la regla, 5 «letras» de 8 cm en acrílico son $1,600');
F.forzarRecortePorAltura(it); it.acab = 'sencillo';
cierto(F.lineTotal(it) === 20 * 8 * 5, 'ya como recorte sencillo son $800: otro producto, otro catálogo');

console.log('\n«LETRAS 3D» SE NIEGA MIENTRAS LA PARTIDA MIDA MENOS');
Q.estado = 'borrador'; Q.editMode = false; Q.cliente = 'x'; Q.tel = '3312345678'; Q.proy = 'x';
Q.items = [partida({ id: 91, tipo: 'recorte', altura: 6, acab: 'sencillo' })];
F.setTipo(91, 'letras');
cierto(Q.items[0].tipo === 'recorte', 'tocar «Letras 3D» en una partida de 6 cm no la cambia');
Q.items[0].altura = 25;
F.setTipo(91, 'letras');
cierto(Q.items[0].tipo === 'letras', 'con 25 cm sí: la puerta se abre subiendo la altura');

console.log('\nDOS COTAS DE UN MISMO LETRERO SON UNA PARTIDA');
/* El caso que lo motivó: una caja de luz de 2 × 1 m devuelta en dos partidas */
let items = [
  partida({ id: 1, tipo: 'caja', tarifa: 3900, ancho: 200, alto: 0, desc: '' }),
  partida({ id: 2, tipo: 'caja', tarifa: 0, ancho: 0, alto: 100, desc: 'Caja de luz fachada' }),
];
cierto(F.fusionarParesDeArea(items) === 1, 'la de 200 de ancho y la de 100 de alto se juntan');
cierto(items.length === 1, 'y queda UNA partida');
cierto(items[0].ancho === 200 && items[0].alto === 100, 'de 200 × 100 cm');
cierto(items[0].desc === 'Caja de luz fachada', 'con la descripción de la que sí la traía');
cierto(items[0].tarifa === 3900, 'y la tarifa que ya estaba elegida');
cierto(F.lineTotal(items[0]) === 3900 * 2, 'que ya vale $7,800 y no $0: 2 m² a $3,900');

items = [
  partida({ id: 1, tipo: 'bastidor', bas: '', ancho: 0, alto: 90 }),
  partida({ id: 2, tipo: 'bastidor', bas: 'alucobond', ancho: 150, alto: 0 }),
];
F.fusionarParesDeArea(items);
cierto(items.length === 1 && items[0].ancho === 150 && items[0].alto === 90,
  'da igual cuál venga primero, el ancho o el alto');
cierto(items[0].bas === 'alucobond', 'y el material del bastidor se rescata de la segunda');

console.log('\nLO QUE NO SE FUSIONA');
items = [
  partida({ id: 1, tipo: 'caja', ancho: 200, alto: 100 }),
  partida({ id: 2, tipo: 'caja', ancho: 80, alto: 60 }),
];
cierto(F.fusionarParesDeArea(items) === 0 && items.length === 2,
  'dos cajas completas son dos cajas: nadie junta lo que ya está entero');
items = [
  partida({ id: 1, tipo: 'caja', ancho: 200, alto: 0 }),
  partida({ id: 2, tipo: 'caja', ancho: 150, alto: 0 }),
];
cierto(F.fusionarParesDeArea(items) === 0, 'dos anchos sin alto no son un par: son dos medidas del mismo lado');
items = [
  partida({ id: 1, tipo: 'bastidor', ancho: 200, alto: 0 }),
  partida({ id: 2, tipo: 'caja', ancho: 0, alto: 100 }),
];
cierto(F.fusionarParesDeArea(items) === 0, 'un bastidor y una caja son dos productos distintos');
items = [
  partida({ id: 1, tipo: 'caja', ancho: 200, alto: 0 }),
  partida({ id: 2, tipo: 'letras', altura: 40, n: 8, material: 'acero' }),
  partida({ id: 3, tipo: 'caja', ancho: 0, alto: 100 }),
];
cierto(F.fusionarParesDeArea(items) === 0 && items.length === 3,
  'con unas letras en medio no son un par: solo se juntan las partidas seguidas');
items = [
  partida({ id: 1, tipo: 'letras', altura: 40, n: 8 }),
  partida({ id: 2, tipo: 'letras', altura: 20, n: 6 }),
];
cierto(F.fusionarParesDeArea(items) === 0, 'dos alturas de letras siguen siendo dos partidas — es la regla de siempre');

console.log('\nTRES PARES SEGUIDOS');
items = [
  partida({ id: 1, tipo: 'caja', ancho: 200, alto: 0 }), partida({ id: 2, tipo: 'caja', ancho: 0, alto: 100 }),
  partida({ id: 3, tipo: 'caja', ancho: 90, alto: 0 }), partida({ id: 4, tipo: 'caja', ancho: 0, alto: 60 }),
  partida({ id: 5, tipo: 'letras', altura: 30, n: 4 }),
];
cierto(F.fusionarParesDeArea(items) === 2, 'se juntan los dos pares');
cierto(items.length === 3 && items[2].tipo === 'letras', 'y el orden se respeta: las letras siguen al final');
cierto(items[0].ancho === 200 && items[1].ancho === 90, 'cada par con sus dos medidas, sin cruzarse');

console.log('\nUN NÚMERO IMPAR DE MITADES');
/* Tres cotas de área en la misma respuesta: se emparejan las dos primeras y la que sobra es
   la última, que es donde quien revisa la va a buscar —el modelo escribe ancho y luego alto
   de cada letrero, en ese orden—. */
items = [
  partida({ id: 1, tipo: 'caja', ancho: 200, alto: 0, desc: 'primera' }),
  partida({ id: 2, tipo: 'caja', ancho: 0, alto: 100, desc: 'segunda' }),
  partida({ id: 3, tipo: 'caja', ancho: 80, alto: 0, desc: 'tercera' }),
];
cierto(F.fusionarParesDeArea(items) === 1, 'de tres mitades se arma un par');
cierto(items.length === 2 && items[0].desc === 'primera' && items[1].desc === 'tercera',
  'la pareja es la de las dos primeras y la suelta es la última, no al revés');
cierto(items[0].ancho === 200 && items[0].alto === 100, 'con sus dos medidas');

console.log('\nCUÁNTAS MEDIDAS EXPLICA LO QUE VOLVIÓ');
cierto(F.medidasCubiertas([partida({ tipo: 'caja', ancho: 200, alto: 100 })]) === 2,
  'una caja con sus dos lados explica DOS de las medidas que se mandaron');
cierto(F.medidasCubiertas([partida({ tipo: 'letras', altura: 40 })]) === 1, 'unas letras explican una');
cierto(F.medidasCubiertas([partida({ tipo: 'caja', ancho: 200, alto: 0 })]) === 1,
  'y una caja a medias, solo una: no se da por cubierta la medida que falta');

console.log('\nEL CAMINO ENTERO: LO QUE DEVUELVE LA IA');
/* La respuesta real que motivó todo: la caja de luz partida en dos y unas letras de 6 cm */
Q.estado = 'borrador'; Q.items = []; Q.itemsAuth = {}; Q.precioAuth = 0;
const creadas = F.applyAi({
  proyecto: 'Farmacia', cliente: 'Cliente', partidas: [
    { tipo: 'caja', tarifa: 3900, ancho_cm: 200, alto_cm: 0, descripcion: 'Caja de luz' },
    { tipo: 'caja', tarifa: 3900, ancho_cm: 0, alto_cm: 100, descripcion: 'Alto de la caja' },
    { tipo: 'letras', material: 'acr-vol', altura_cm: 6, n_letras: 9, descripcion: 'Slogan' },
  ],
});
cierto(creadas === 2, 'de tres partidas devueltas quedan dos: la caja se armó completa');
cierto(Q.items[0].tipo === 'caja' && Q.items[0].ancho === 200 && Q.items[0].alto === 100,
  'la caja de luz mide 200 × 100 cm en UNA sola partida');
cierto(Q.items[1].tipo === 'recorte' && Q.items[1].acab === '',
  'y el «slogan» de 6 cm entró como recorte de acrílico, sin acabado elegido');
cierto(ev('_aiCubiertas') === 3, 'las tres medidas que se midieron quedan explicadas: no se avisa de ninguna faltante');

/* Y el alto que el modelo manda en altura_cm porque solo vio un corchete */
Q.items = [];
F.applyAi({ partidas: [{ tipo: 'caja', tarifa: 4600, ancho_cm: 120, alto_cm: 0, altura_cm: 80 }] });
cierto(Q.items[0].alto === 80, 'el alto que llegó en altura_cm no se pierde: una caja sin alto vale $0');
Q.items = [];
F.applyAi({ partidas: [{ tipo: 'bastidor', bastidor: 'lamina', ancho_cm: 0, alto_cm: 0, altura_cm: 110 }] });
cierto(Q.items[0].alto === 110, 'y en el bastidor igual');
Q.items = [];
F.applyAi({ partidas: [{ tipo: 'caja', tarifa: 3900, ancho_cm: 120, alto_cm: 60, altura_cm: 999 }] });
cierto(Q.items[0].alto === 60, 'pero un alto que ya venía puesto no se pisa con altura_cm');

console.log('\n' + (fallas ? fallas + ' FALLA(S)' : 'Todo bien') + '\n');
process.exit(fallas ? 1 : 0);
