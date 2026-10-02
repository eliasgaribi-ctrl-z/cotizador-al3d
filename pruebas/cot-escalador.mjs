/* LAS CUENTAS DEL ESCALADOR QUE NO SE VEN MIRANDO LA PANTALLA.
 *
 * Cuatro cosas del escalador salen «plausibles» aunque estén mal, y por eso están aquí y no en
 * la auditoría a mano ni en la prueba de navegador:
 *
 *   1. EL PRECIO DEL LETRERO SOBRE LA FOTO (función 32). Es la herramienta que se le enseña al
 *      cliente en su fachada, con una cifra debajo. Si esa cifra la calculara el letrero por su
 *      cuenta —una tarifa copiada, un redondeo propio, un descuento olvidado— diría un número
 *      creíble y distinto del que después imprime el PDF, y nadie lo notaría hasta que el
 *      cliente compare. Aquí se comprueba que sale de lineTotal(), la MISMA función que cobra
 *      la partida, y que respeta sus dos reglas caras: la luz apagada baja un 20 % y por debajo
 *      de 10 cm ya no es letra 3D (ver ALTURA_MIN_LETRAS en catalogo.js).
 *
 *   2. EN QUÉ PASO VA LA CALIBRACIÓN. Se DERIVA de SC (la línea trazada y los píxeles por
 *      centímetro). Si algún día se guardara aparte, «Re-calibrar» y cargar otra foto dejarían
 *      el riel diciendo «ya calibraste» sobre una foto sin escala: el error se descubre
 *      midiendo, cuando ya hay cinco medidas hechas contra nada.
 *
 *   3. LA PUERTA DE REFERENCIA. Son 200 cm y tienen que vivir en UNA constante compartida por
 *      el botón rápido y por el letrero. Dos copias se separan en cuanto alguien cambia una, y
 *      el síntoma —«la escala da distinto según por dónde se calibre»— no se parece a la causa.
 *
 *   4. DE QUÉ LADO SALE LA LUZ DEL LETRERO Y QUÉ DICE SU RENGLÓN DE PRECIO. La regla —aluminio y
 *      acero, LED por detrás; acrílico, LED al frente— no se invierte nunca, y se lee del
 *      catálogo (`ilum`) y no del nombre de la clave: un `/^acr/` dejaba al acero, que también
 *      lleva la luz atrás, pintado bien solo por casualidad. Y el renglón nunca enseña un
 *      «$0» que parezca un precio: cuando falta el material, las letras o mide menos de 10 cm,
 *      dice qué falta y no pone cifra.
 *
 * Uso: node pruebas/cot-escalador.mjs   (o pruebas/correr.sh, que corre todas)               */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- El documento de mentiras: lo único que hace falta es que nada truene ---- */
const noop = () => {};
const elemento = () => ({
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  style: { setProperty: noop, removeProperty: noop }, dataset: {},
  setAttribute: noop, getAttribute: () => null, removeAttribute: noop, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], textContent: '', innerHTML: '', value: '',
  focus: noop, closest: () => null, appendChild: noop, insertAdjacentHTML: noop,
  getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
  getContext: () => null, remove: noop, hidden: false,
});
const document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop, readyState: 'complete',
  documentElement: elemento(), body: elemento(), createElement: elemento, activeElement: null,
  head: elemento(),
};
class Observador { observe() {} disconnect() {} unobserve() {} }
const window = {
  addEventListener: noop, removeEventListener: noop, innerWidth: 1200, innerHeight: 800,
  matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
  history: { pushState: noop, replaceState: noop, back: noop },
  location: { hash: '', search: '', pathname: '/' }, scrollTo: noop,
  setTimeout, clearTimeout, requestAnimationFrame: f => setTimeout(f, 0),
  cancelAnimationFrame: clearTimeout, devicePixelRatio: 2, ResizeObserver: Observador,
  screen: { width: 1280 },
};
window.window = window; window.parent = window; window.self = window;
const ctx = vm.createContext({
  window, document, self: window, location: window.location, history: window.history,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  navigator: { userAgent: 'node', vibrate: noop }, console, setTimeout, clearTimeout,
  requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: clearTimeout,
  getComputedStyle: () => ({ top: '0', getPropertyValue: () => '', fontFamily: 'sans-serif', fontSize: '16px' }),
  matchMedia: window.matchMedia, MutationObserver: Observador, ResizeObserver: Observador,
  IntersectionObserver: Observador, Intl, URL, performance, structuredClone,
  Blob: class {}, FileReader: class {}, Image: class {}, CustomEvent: class {}, Event: class {},
  CSS: { escape: s => s, supports: () => true },
});
for (const f of ['js/cotizador/catalogo.js', 'js/cotizador/nucleo.js', 'js/cotizador/partidas.js',
                 'js/cotizador/escalador.js']) {
  vm.runInContext(readFileSync(join(RAIZ, f), 'utf8'), ctx, { filename: f });
}
/* Lo que solo pinta o guarda se calla: aquí no hay pantalla, y lo que se prueba son las
   cuentas. `capturaBloqueada` vive en proceso.js, que engancha la pantalla entera al cargarse. */
vm.runInContext(`renderItems=()=>{};toast=()=>{};saveState=()=>{};updProg=()=>{};
                 sincronizarPlegado=()=>{};voz=()=>{};renderSummary=()=>{};updDirRaw=()=>{};
                 function capturaBloqueada(){return false;}
                 function faltanDatosCliente(){return false;}`, ctx);
const ev = code => vm.runInContext(code, ctx);

let fallas = 0;
const cierto = (cond, que) => {
  console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que);
  if (!cond) fallas++;
};
const SC = ev('SC');
const cuenta = ev('scLetreroCuenta');
const paso = ev('scPasoCalib');
const lineTotal = ev('lineTotal');
const ALTURA_MIN = ev('ALTURA_MIN_LETRAS');
/* Una partida de letras como la que crea addItem, sin depender del DOM. */
const letras = (extra = {}) => ({
  id: 1, tipo: 'letras', material: 'acr-vol', comp: 'recta', luz: true, ilumTipo: 'fria',
  altura: 45, n: 9, tarifa: 0, ancho: 0, alto: 0, acab: '', recComp: false, bas: '',
  desc: 'PANADERÍA', textoAuto: 'PANADERÍA', pz: 1, pu: 0, showInPdf: true, ...extra,
});

console.log('\nEL PRECIO DEL LETRERO ES EL DE LA PARTIDA, NO UNO PARECIDO');
const ej = cuenta(letras(), 45);
cierto(ej.total === 16200, 'el ejemplo del brief cuadra: acrílico $40 × 45 cm × 9 letras = $16,200');
cierto(ej.total === lineTotal({ ...letras(), altura: 45 }),
  'y es exactamente lo que devuelve lineTotal(), que es lo que imprime el PDF');
cierto(ej.porCm === 40, 'el precio por centímetro sale del catálogo ($40 el acrílico), no de una copia');
cierto(cuenta(letras({ comp: 'compleja' }), 45).porCm === 50,
  'la complejidad entra en la cuenta como en cualquier otra partida: cursiva y compleja suben el centímetro');
cierto(cuenta(letras({ luz: false }), 45).total === 16200 * 0.8,
  'y sin luz baja el 20 % que baja siempre — el letrero no se inventa su propio descuento');
cierto(cuenta(letras({ material: 'acero' }), 40).total === lineTotal({ ...letras({ material: 'acero' }), altura: 40 }),
  'con acero a $55 el centímetro, lo mismo: una sola fuente para el importe');

console.log('\nLO QUE TODAVÍA NO ES UN PRECIO NO SE ENSEÑA COMO PRECIO');
const chico = cuenta(letras(), 8);
cierto(chico.recorte === true, 'a 8 cm la regla de los ' + ALTURA_MIN + ' cm dice que ya no es letra 3D');
cierto(chico.total === 0, 'y el letrero no pone cifra: el acabado del recorte —$20, $25 o $55— lo decide una persona');
cierto(cuenta(letras(), 10).recorte === false, '10 cm justos SÍ son letras: la regla es «menos de 10», sin redondear');
const sinMat = cuenta(letras({ material: '' }), 45);
cierto(sinMat.conMaterial === false && sinMat.total === 0,
  'sin material elegido tampoco hay precio, y se sabe por qué: es lo que multiplica toda la cuenta');
const sinLetras = cuenta(letras({ n: 0 }), 45);
cierto(sinLetras.n === 0 && sinLetras.total === 0, 'y sin número de letras tampoco');
cierto(cuenta(letras(), 0).alto === 0.5,
  'un alto de cero se clava en medio centímetro, igual que la altura que baja del escalador a la partida');

console.log('\nEN QUÉ PASO VA LA CALIBRACIÓN SE DERIVA DE SC');
SC.refLine = null; SC.nativePxPerCm = 0;
cierto(paso() === 0, 'sin línea de referencia va en el primero: marcar dos puntos');
SC.refLine = { nx1: .1, ny1: .1, nx2: .1, ny2: .5 };
cierto(paso() === 1, 'con la línea trazada, en el segundo: escribir cuánto mide');
SC.nativePxPerCm = 4;
cierto(paso() === 2, 'con los píxeles por centímetro puestos, en el tercero: medir');
SC.refLine = null; SC.nativePxPerCm = 0;
cierto(paso() === 0, 'y volver a cero lo devuelve al primero: no hay un estado paralelo que se quede colgado');

console.log('\nLA PUERTA DE REFERENCIA, EN UNA SOLA CONSTANTE');
const PUERTA = ev('SC_REF_PUERTA_CM');
const RAPIDOS = ev('SC_REF_RAPIDOS');
cierto(PUERTA === 200, 'son 200 cm, la medida del repo (decisión 4 del paquete), no los 210 de la muestra');
cierto(RAPIDOS.some(r => r.cm === PUERTA && /puerta/i.test(r.que)),
  'y el botón rápido de la puerta sale de esa misma constante, no de un 200 tecleado al lado');
cierto(RAPIDOS.length === 5 && RAPIDOS.every(r => r.cm > 0 && r.que),
  'las cinco medidas de siempre traen su cifra y el objeto que la explica');
cierto(!RAPIDOS.some(r => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(r.que)),
  'sin un solo emoji: cada teléfono los pinta distinto y no están en el sprite');

console.log('\nLO QUE SE PINTA SOBRE LA FOTO ES EL TEXTO QUE YA SE CAPTURÓ');
const texto = ev('scLetreroTextoDe');
cierto(texto(letras({ textoAuto: 'Panadería' })) === 'PANADERÍA', 'el texto de la partida, en mayúsculas como se fabrica');
cierto(texto(letras({ textoAuto: '', desc: 'Farmacia GDL' })) === 'FARMACIA GDL',
  'y si no se tecleó el texto, la descripción: no se le pide al vendedor que lo escriba una tercera vez');
cierto(texto(letras({ textoAuto: '', desc: '' })) === 'AL3D', 'sin nada que pintar, la marca — nunca un letrero vacío');
cierto(texto(letras({ textoAuto: 'x'.repeat(60) })).length === 24,
  'y se corta a 24: un texto larguísimo sobre la foto taparía la fachada entera');

console.log('\nLOS CENTÍMETROS POR PÍXEL SON LOS DE LA CALIBRACIÓN');
const pxPorCm = ev('scLetreroPxPorCm');
SC.nativePxPerCm = 0; SC.scaleFactor = 1;
cierto(pxPorCm() === 0, 'sin calibrar no hay escala que aplicar, y el letrero no se enseña');
/* 1200 px de foto ajustados a 300 px de lienzo (scaleFactor 4), con 2 px de foto por cm:
   medio píxel lógico por centímetro. Es la cuenta de scCommitLine leída al revés. */
SC.nativePxPerCm = 2; SC.scaleFactor = 4;
cierto(pxPorCm() === 0.5, 'calibrado, es la misma cuenta que convierte una línea en centímetros, al revés');

console.log('\nLA LUZ DEL LETRERO LA DICE EL CATÁLOGO, NO EL NOMBRE DE LA CLAVE');
const materialDe = ev('scLetreroMaterialDe');
const luzDe = ev('scLetreroLuzDe');
cierto(materialDe(letras({ material: 'acr-vol' })) === 'acrilico', 'el acrílico con aluminio lleva el LED al frente: la cara ES la luz');
cierto(materialDe(letras({ material: 'acr-vinil' })) === 'acrilico', 'el acrílico con vinil también');
cierto(materialDe(letras({ material: 'acero' })) === 'aluminio',
  'el acero lleva la luz POR DETRÁS, como el aluminio: no se pinta como un acrílico por no llamarse «al-…»');
cierto(materialDe(letras({ material: 'al-paint' })) === 'aluminio' && materialDe(letras({ material: 'al-brush' })) === 'aluminio', 'el aluminio, pintado o cepillado, también');
cierto(materialDe(letras({ material: '' })) === 'aluminio', 'sin material elegido no se inventa un LED frontal: cae en el lado que no promete nada de más');
cierto(luzDe(letras({ luz: true, ilumTipo: 'calida' })) === 'calida' && luzDe(letras({ luz: true, ilumTipo: 'fria' })) === 'fria',
  'la luz sigue la ficha de la partida: cálida o fría');
cierto(luzDe(letras({ luz: false })) === 'ninguna', 'y sin iluminación el letrero se apaga, aunque la ficha diga cálida');

console.log('\nLO QUE DICE EL RENGLÓN DEL PRECIO');
const dice = ev('scLetreroPrecio');
const frase = (it, cm) => dice(it, cuenta(it, cm));
cierto(frase(letras(), 45).html === '$40 × 45 cm × 9 letras = <b>$16,200.00</b>' && frase(letras(), 45).av === false,
  'el ejemplo del brief, corto y en una línea: «$40 × 45 cm × 9 letras = $16,200.00»');
cierto(/sin luz −20 % = <b>\$12,960\.00<\/b>$/.test(frase(letras({ luz: false }), 45).html),
  'sin luz la cuenta escribe el −20 % antes del igual, para que el número sea el resultado de lo escrito');
cierto(/^\$40 × 45 cm × 1 letra = /.test(frase(letras({ n: 1 }), 45).html), 'una letra va en singular');
cierto(frase(letras(), 8).av === true && /recorte de acrílico/.test(frase(letras(), 8).html) && !/\$/.test(frase(letras(), 8).html),
  'menos de 10 cm no enseña cifra —ni un «$»— y avisa en ámbar que ya es recorte');
cierto(frase(letras({ material: '' }), 45).av === true && /Falta elegir el material/.test(frase(letras({ material: '' }), 45).html) && !/\$/.test(frase(letras({ material: '' }), 45).html),
  'sin material dice que falta, y no enseña un $0 que parezca un precio');
cierto(frase(letras({ n: 0 }), 45).av === true && /número de letras/.test(frase(letras({ n: 0 }), 45).html), 'sin letras dice cuál falta');

console.log('\nLA ESCALA SE APLICA A LO QUE SE PINTA');
SC.nativePxPerCm = 2; SC.scaleFactor = 4;
cierto(Math.abs(45 * pxPorCm() - 22.5) < 1e-9, '45 cm de letra son 22.5 px lógicos con esa escala: el alto que se le pide a la pieza sale de la calibración, no de un número de ejemplo');

console.log(fallas ? '\n' + fallas + ' falla(s).' : '\nEl letrero cobra lo que cobra la partida, la luz la dice el catálogo, y la calibración dice en qué paso va de verdad.');
process.exit(fallas ? 1 : 0);
