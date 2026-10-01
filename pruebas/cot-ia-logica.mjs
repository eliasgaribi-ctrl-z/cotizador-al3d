/* COTIZAR CON IA: LA LÓGICA QUE DECIDE QUÉ SE LE ENSEÑA A QUIEN REVISA EL BORRADOR.
 *
 * Lo de esta pantalla que se ve (la carpeta que se abre, la banda que recorre la miniatura, el
 * tachado) se prueba en el navegador: pruebas/navegador/cot-ia.mjs. Aquí va lo que no se ve
 * mirando y que, si sale mal, sale «plausible»:
 *
 *  · H1 · el resumen dice, partida por partida, si YA COTIZA o le FALTA algo, y a qué medida del
 *    escalador se quedó sin partida. Una partida de caja con el ancho y sin el alto vale $0 y NO
 *    es una que cotiza; unas letras sin material tampoco. Si esta cuenta se equivoca, el «✓»
 *    verde le miente a quien ya no va a revisar esa partida.
 *  · El cruce medida↔partida compara centímetros con la tolerancia del escalador (±0,05 cm): con
 *    igualdad exacta, 40 contra 40.0000001 salía «sin partida»; con una tolerancia de más, una
 *    medida de 85 se daba por explicada por una partida de 85,4.
 *  · H13 · la lista de lo que se reemplaza es CORTA: con doce partidas capturadas, doce renglones
 *    empujan el botón fuera de la pantalla del teléfono.
 *  · Lo que no puede volver: el cierre automático a 1,5 s del modal (H1), el latido en bucle del
 *    icono de la zona de arrastre (falla 3 del brief) y un tachado que baje la opacidad del texto
 *    (§4.3 del sistema de diseño). Los tres son de una línea, y volver a ponerlos no da ningún
 *    error: se ve mal, o peor, se ve bien pero mueve algo que la regla dice que no.
 *
 * Uso: node pruebas/cot-ia-logica.mjs   (o pruebas/correr.sh, que corre todas)                 */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => readFileSync(join(RAIZ, f), 'utf8');

/* ---- El mismo documento de mentiras que pruebas/reglas-de-partida.mjs ---- */
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
  vm.runInContext(leer(f), ctx, { filename: f });
}
/* La pantalla no existe: lo que solo dibuja se calla. `Piezas` se sustituye por lo mínimo —la
   marca de estado va como una etiqueta con su estado—, porque js/piezas.js espera un documento de
   verdad. `histDsc` es de historial.js, que engancha la pantalla al cargarse; aquí solo importa
   que devuelva algo distinto por partida. */
vm.runInContext(`renderItems=()=>{};toast=()=>{};saveState=()=>{};updProg=()=>{};
                 sincronizarPlegado=()=>{};voz=()=>{};renderSummary=()=>{};updDirRaw=()=>{};
                 function capturaBloqueada(){return false;}
                 function faltanDatosCliente(){return false;}
                 function histDsc(it){return it.desc||('Partida '+it.id);}
                 var Piezas={marcaEstadoHTML:(e)=>'<i data-estado="'+e+'"></i>',sinMovimiento:()=>false};`, ctx);
const ev = code => vm.runInContext(code, ctx);
const F = {};
for (const n of ['aiMideIgual', 'aiCotaCubierta', 'aiMedidaDe', 'aiPiezasDe', 'aiMaterialDe', 'aiYaCotiza',
  'aiRenglonesReemplazo', 'aiSubResumen', 'aiPartidaFoco', 'aiResumenFilaHTML']) F[n] = ev(n);

let fallas = 0;
const cierto = (cond, que) => {
  console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que);
  if (!cond) fallas++;
};
const partida = (extra = {}) => ({
  id: extra.id || 1, tipo: 'letras', material: '', comp: 'recta', luz: true, altura: 0, n: 0,
  tarifa: 0, ancho: 0, alto: 0, acab: '', recComp: false, bas: '', desc: '', pz: 1, pu: 0,
  showInPdf: true, ...extra,
});

console.log('\nEL CRUCE MEDIDA ↔ PARTIDA (±0,05 cm, como el escalador)');
const letras40 = partida({ tipo: 'letras', altura: 40, n: 9, material: 'acr-vinil' });
cierto(F.aiMideIgual(letras40, 40), 'la misma cifra es la misma medida');
cierto(F.aiMideIgual(letras40, 40.05), 'a cinco centésimas todavía');
cierto(F.aiMideIgual(letras40, 39.95), 'y hacia abajo también');
cierto(!F.aiMideIgual(letras40, 40.1), 'a una décima ya no: son dos medidas distintas');
cierto(!F.aiMideIgual(letras40, 0), 'el cero nunca explica nada: una partida vacía no cubre una medida vacía');
cierto(!F.aiMideIgual(partida(), 40), 'y una partida sin cifras no explica ninguna');
cierto(F.aiMideIgual(letras40, '40'), 'la cifra llega a veces como texto y sigue contando');
const caja = partida({ tipo: 'caja', ancho: 120, alto: 80, tarifa: 4600 });
cierto(F.aiMideIgual(caja, 120) && F.aiMideIgual(caja, 80), 'una caja explica su ancho Y su alto');
cierto(F.aiCotaCubierta([letras40, caja], 80), 'la cota de 80 la explica la caja');
cierto(!F.aiCotaCubierta([letras40, caja], 85), 'la de 85 se queda sin partida — y es la que se nombra');
cierto(!F.aiCotaCubierta([], 40) && !F.aiCotaCubierta(null, 40), 'sin partidas no hay cota cubierta, y no truena');

console.log('\nLO QUE DICE CADA RENGLÓN');
cierto(F.aiMedidaDe(letras40) === '40 cm', 'letras: «40 cm»');
cierto(F.aiMedidaDe(caja) === '120 × 80 cm', 'caja: ancho × alto');
cierto(F.aiMedidaDe(partida({ tipo: 'caja', ancho: 120 })) === '120 × 0 cm',
  'una caja con un solo lado lo dice tal cual (0), no lo esconde');
cierto(F.aiMedidaDe(partida()) === '', 'sin medida no se escribe nada en vez de «0 cm»');
cierto(F.aiPiezasDe(partida({ n: 1 })) === '1 letra', 'una letra, en singular');
cierto(F.aiPiezasDe(partida({ n: 9 })) === '9 letras', 'nueve, en plural');
cierto(F.aiPiezasDe(partida({ tipo: 'recorte', n: 1 })) === '1 pieza', 'un recorte cuenta piezas');
cierto(F.aiPiezasDe(partida({ tipo: 'caja' })) === '', 'una caja no cuenta piezas');
cierto(F.aiMaterialDe(letras40) === 'Acrílico + Vinil', 'el material sale del catálogo, no de una lista repetida aquí');
cierto(F.aiMaterialDe(partida()) === '', 'sin material, nada');

console.log('\n¿YA COTIZA? (que no le falte nada Y que el precio salga)');
cierto(F.aiYaCotiza(letras40) === true, 'unas letras completas cotizan');
cierto(F.aiYaCotiza(partida({ tipo: 'letras', altura: 22, n: 7 })) === false,
  'unas letras sin material NO: es la «!» ámbar del resumen');
cierto(F.aiYaCotiza(partida({ tipo: 'caja', ancho: 120, tarifa: 4600 })) === false,
  'una caja con el ancho y sin el alto NO: vale $0');
cierto(F.aiYaCotiza(caja) === true, 'la caja con sus dos lados sí');
cierto(F.aiYaCotiza(partida({ tipo: 'recorte', altura: 6, n: 3 })) === false, 'un recorte sin acabado NO');

console.log('\nLA FILA DEL RESUMEN');
const filaOk = F.aiResumenFilaHTML(letras40), filaMal = F.aiResumenFilaHTML(partida({ id: 7, tipo: 'letras', altura: 22, n: 7 }));
cierto(/data-e="ok"/.test(filaOk) && /Letras 3D · 40 cm · 9 letras/.test(filaOk), 'la que cotiza: marca «ok» y su cabeza tipo · medida · piezas');
cierto(/data-e="av"/.test(filaMal) && /Falta material/.test(filaMal),
  'la que no: marca «!» Y la palabra — el color nunca va solo (§4.3)');
cierto(/no cotiza hasta completarla/.test(filaMal), 'y dice qué pasa mientras no se complete');
cierto(/class="ia-precio lt"/.test(filaOk),
  'el importe lleva la clase `lt`: en borrador el cotizador lo difumina, y el resumen no puede ser el único sitio que lo enseñe');
cierto(!/class="ia-precio/.test(filaMal), 'la que no cotiza no enseña ningún importe');
cierto(/solo-voz">, ya cotiza/.test(filaOk), 'para el lector de pantalla la marca dice «ya cotiza» con palabras');

console.log('\nLA LÍNEA DE DEBAJO DEL TÍTULO');
const rota = partida({ id: 3, tipo: 'letras', altura: 22, n: 7 });
cierto(/^1 ya cotiza · suman <span class="lt">\$/.test(F.aiSubResumen([letras40])), 'una que cotiza: singular, con su suma difuminable');
cierto(/^2 ya cotizan/.test(F.aiSubResumen([letras40, caja])), 'dos: plural');
cierto(/1 pide lo que le falta$/.test(F.aiSubResumen([letras40, rota])), 'una que pide: «pide lo que le falta»');
cierto(/2 piden lo que les falta$/.test(F.aiSubResumen([letras40, rota, partida({ id: 4, altura: 30, n: 2 })])),
  'dos que piden: «piden lo que les falta» (concuerda)');
cierto(F.aiSubResumen([rota]) === '1 pide lo que le falta', 'si ninguna cotiza no se escribe «suman $0.00»');
cierto(F.aiPartidaFoco([letras40, rota, caja]) === rota, '«Ver partidas» lleva a la primera que pide algo, no a la primera');
cierto(F.aiPartidaFoco([letras40, caja]) === letras40, 'si todas cotizan, a la primera');
cierto(F.aiPartidaFoco([]) === null && F.aiPartidaFoco(null) === null, 'sin partidas no lleva a ninguna y no truena');

console.log('\nLA LISTA DE LO QUE SE REEMPLAZA ES CORTA');
const mias = n => Array.from({ length: n }, (_, i) => partida({ id: i + 1, desc: 'Partida ' + (i + 1) }));
cierto(F.aiRenglonesReemplazo(mias(1)).length === 1, 'una partida: un renglón');
cierto(F.aiRenglonesReemplazo(mias(4)).length === 4 && !/más$/.test(F.aiRenglonesReemplazo(mias(4))[3]),
  'cuatro caben tal cual');
const doce = F.aiRenglonesReemplazo(mias(12));
cierto(doce.length === 4 && doce[3] === 'y 9 más', 'doce: tres renglones y «y 9 más» (nunca doce renglones en un modal de teléfono)');
cierto(F.aiRenglonesReemplazo(mias(5)).slice(-1)[0] === 'y 2 más', 'cinco: tres y «y 2 más» — el último renglón cuenta las que van detrás');
cierto(F.aiRenglonesReemplazo([]).length === 0, 'ninguna: nada');

console.log('\nLOS LIENZOS DICEN QUÉ VA A PASAR AL SOLTAR');
const lienzos = ev('AI_LIENZOS');
cierto(lienzos['sp-canvas-area'] === 'Suelta para medir', 'el escalador: «Suelta para medir»');
cierto(lienzos['vt-canvas-area'] === 'Suelta para vectorizar', 'el vectorizador: «Suelta para vectorizar»');

console.log('\nLO QUE NO PUEDE VOLVER (una línea, sin error, sin que nadie lo note)');
/* Los comentarios de esta zona explican POR QUÉ se quitó cada cosa y nombran justo lo que se
   quitó («el @keyframes vid-respira se va con ella»): se miran las reglas, no la prosa. */
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
const ia = leer('js/cotizador/ia.js'), vidrio = sinComentarios(leer('css/vidrio.css')), sistema = leer('css/sistema.css');
cierto(!/aiClose\(\)\s*\}\s*,\s*1500/.test(ia), 'el modal de IA no se cierra solo a los 1,5 s: se sale por «Ver partidas»');
cierto(!/setTimeout\([^)]*aiClose/.test(ia.replace(/\/\*[\s\S]*?\*\//g, '')), 'ningún setTimeout cierra el modal');
cierto(!/animation:[^;{}]*vid-respira/.test(vidrio), 'el icono de la zona de arrastre no respira: ninguna regla usa vid-respira');
cierto(!/@keyframes\s+vid-respira/.test(vidrio), 'y el fotograma se fue con ella');
const bloqueCrudo = sistema.slice(sistema.indexOf('/* ── Cotizador · Cotizar con IA ── */'), sistema.indexOf('/* ── fin de cot-ia ── */'));
const bloque = sinComentarios(bloqueCrudo);
const tacha = (bloque.match(/\.ai-merge-lista[^{}]*\{[^{}]*\}/g) || []).join('\n');
cierto(tacha.length > 0 && !/opacity/.test(tacha), 'el tachado de lo que se reemplaza no baja la opacidad del texto (§4.3)');
cierto(!/text-decoration/.test(tacha), 'y no usa text-decoration, que no se puede animar de izquierda a derecha');
cierto(/background-size/.test(tacha), 'crece con background-size, como pide la ficha');
cierto(bloque.length > 1000, 'el CSS de la zona vive dentro de su bloque');
cierto(!/transition:\s*all/.test(bloque) && !/transition:[^;}]*\bwidth\b/.test(bloque),
  'ninguna transición de la zona anima `all` ni `width`: solo transform y opacity (regla 7)');
cierto(!/animation:[^;}]*infinite/.test(bloque.replace(/\.ai-pick\.trabajando \.ia-marco::after,\.ai-src\.trabajando \.ia-marco::after\{[^}]*\}/, '')),
  'lo único que se repite es la banda de la miniatura, y vive dentro de `.trabajando`');
cierto(!/filter\s*:\s*blur/.test(bloque), 'nada de filter:blur animado en gama media');

console.log(fallas ? '\n' + fallas + ' FALLA(S)\n' : '\nLa lógica de Cotizar con IA se sostiene.\n');
process.exit(fallas ? 1 : 0);
