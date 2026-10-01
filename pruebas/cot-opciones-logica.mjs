/* LA PROPUESTA CON OPCIONES (pieza 76), SIN PANTALLA: lo que decide qué cuenta y qué no.
 *
 * El vendedor puede proponer el mismo trabajo en dos o tres materiales o tipos, y la que el cliente
 * elige pasa a ser la partida. Lo que importa de verdad no se ve en la pantalla —sale un número
 * plausible—: que NUNCA cuente más de una opción en el total ni en el material a comprar, que cada
 * opción cobre con las tarifas y la misma lineTotal() que el resto (sin una aritmética paralela),
 * que elegir deje una partida de las de siempre (sin rastro de las otras) y que un respaldo con la
 * propuesta mal formada no truene ni cobre de más.
 *
 * Decisión de diseño que esta prueba defiende: la propuesta NO es un tipo de partida nuevo ni varias
 * partidas marcadas como alternativas. La partida sigue siendo una, con los campos de la opción
 * abierta; las otras viven en `it.opciones`, donde nadie suma. Por eso aquí se comprueba que el
 * total, la huella del trabajo y el material a comprar salen de la partida y solo de ella.
 *
 * Uso: node pruebas/cot-opciones-logica.mjs   (o pruebas/correr.sh, que corre todas) */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivar } from '../js/datos/material.js';
import { catalogos } from '../js/datos/catalogo-precios.js';

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
/* Las que solo dibujan o guardan se callan; el candado de captura vive en proceso.js, que engancha
   la pantalla entera al cargarse, y aquí se declara abierto (es el estado en el que se captura). */
vm.runInContext(`renderItems=()=>{};toast=()=>{};saveState=()=>{};updProg=()=>{};
                 sincronizarPlegado=()=>{};voz=()=>{};renderSummary=()=>{};updDirRaw=()=>{};
                 function capturaBloqueada(){return false;}
                 function faltanDatosCliente(){return false;}`, ctx);
const ev = code => vm.runInContext(code, ctx);
const Q = ev('Q');
const F = {};
for (const n of ['lineTotal', 'totals', 'huellaTrabajo', 'faltantesDe', 'opcionesDe', 'opcionesVivas',
  'opcionesParaPdf', 'normalizarItems', 'resumenPartida', 'formulaFor', '_opProponer', '_opAgregar',
  '_opIr', '_opQuitar', '_opElegir', '_opFirma', '_opRotulo', 'piezasDe']) F[n] = ev(n);
const MAX = ev('OPC_MAX');

let fallas = 0;
const cierto = (cond, que) => {
  console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que);
  if (!cond) fallas++;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* Una partida como la que nace de addItem, ya capturada: 9 letras de 40 cm en aluminio pintado. */
const partida = (extra = {}) => ({
  id: 1, tipo: 'letras', material: 'al-paint', matAuto: false, comp: 'recta', luz: true, ilumTipo: 'fria',
  altura: 40, n: 9, tarifa: 0, ancho: 0, alto: 0, acab: '', recComp: false, bas: '', desc: 'Letrero FARMACIA',
  descAi: false, pz: 1, pu: 0, textoAuto: '', showInPdf: true, ...extra,
});
/* Lo que hace el editor de la partida al elegir otro material: escribir en la partida abierta. */
const conMaterial = (it, m) => { it.material = m; return it; };
const importes = it => (F.opcionesVivas(it) || []).map(x => F.lineTotal(x.d));

console.log('\nPROPONER: la partida se vuelve una propuesta de dos y sigue costando lo mismo');
let it = partida();
const antes = F.lineTotal(it);
cierto(F.opcionesDe(it) === null, 'una partida normal no tiene propuesta');
cierto(F._opProponer(it) === true, 'proponer crea la propuesta');
cierto(F.opcionesDe(it).lista.length === 2 && F.opcionesDe(it).activa === 2, 'son dos opciones y queda abierta la segunda');
cierto(F.lineTotal(it) === antes, 'la copia es IGUAL a la original: elegir otro material por la persona sería decidir un precio');
cierto(F._opProponer(it) === false, 'proponer otra vez no hace nada (no se duplica ni se pisa)');
cierto(importes(it).every(v => v === antes), 'las dos opciones valen lo mismo mientras nadie las cambie');

console.log('\nCADA OPCIÓN, SU CUENTA, CON LAS TARIFAS DE SIEMPRE');
conMaterial(it, 'acr-vol');                       // la opción B se vuelve acrílico + aluminio
const [a, b] = F.opcionesVivas(it);
cierto(a.letra === 'A' && b.letra === 'B', 'las letras salen de la posición: A, B');
cierto(F.lineTotal(a.d) === 30 * 40 * 9, 'A: aluminio pintado $30 × 40 cm × 9 = $10,800');
cierto(F.lineTotal(b.d) === 40 * 40 * 9, 'B: acrílico + aluminio $40 × 40 cm × 9 = $14,400');
cierto(a.abierta === false && b.abierta === true, 'solo la B está abierta');
cierto(F.lineTotal(a.d) === F.lineTotal({ ...partida(), material: 'al-paint' }),
  'el importe de una opción es el mismo lineTotal() de una partida suelta (no hay aritmética paralela)');
Q.items = [it];
const foto2 = JSON.stringify(Q.items);
F.opcionesVivas(it); F.opcionesParaPdf(it); importes(it);
cierto(JSON.stringify(Q.items) === foto2, 'calcular las opciones no escribe en Q');

console.log('\nEL TOTAL: UNA SOLA OPCIÓN CUENTA, LA ABIERTA');
cierto(F.totals().sub === 14400, 'con la B abierta el subtotal es el de la B ($14,400), no la suma de las dos');
const huellaB = F.huellaTrabajo();
cierto(F._opIr(it, 1) === true, 'abrir la A');
cierto(F.totals().sub === 10800, 'con la A abierta el subtotal es $10,800');
cierto(F.huellaTrabajo() !== huellaB, 'la huella del trabajo cambia: otro material es otro trabajo (suelta la autorización)');
cierto(F._opIr(it, 1) === false, 'abrir la que ya está abierta no hace nada');
cierto(F._opIr(it, 2) === true && F.huellaTrabajo() === huellaB, 'volver a la B deja la huella exactamente como estaba');
cierto(F._opIr(it, 99) === false, 'una opción que no existe no se abre');
cierto(!JSON.stringify(F.huellaTrabajo()).includes('opciones'), 'la huella no lleva las opciones: describe el trabajo, no la propuesta');

console.log('\nLA TERCERA, DE OTRO TIPO: CAJA DE LUZ');
cierto(F._opAgregar(it) === true && F.opcionesDe(it).lista.length === 3, 'se agrega la tercera');
cierto(F.opcionesDe(it).activa === 3, 'y queda abierta');
Object.assign(it, { tipo: 'caja', tarifa: 3900, ancho: 240, alto: 60 });   // lo que hace el editor
cierto(Math.abs(F.lineTotal(F.opcionesVivas(it)[2].d) - 1.44 * 3900) < 0.005, 'C: caja de 2.4 × 0.6 m = 1.44 m² × $3,900 = $5,616');
cierto(F.totals().sub === 5616, 'con la C abierta el subtotal es el de la C');
cierto(F._opAgregar(it) === false, `el máximo son ${MAX} opciones`);
cierto(MAX === 3, 'y son tres');
cierto(importes(it).join() === '10800,14400,5616', 'las tres cuentas a la vez: 10,800 · 14,400 · 5,616');
cierto(F.faltantesDe(it).includes('elegir la opción'), 'mientras no se elige, la partida lo dice: falta elegir la opción (frena el autorizar)');
cierto(!F.formulaFor(it).includes('Falta'), 'pero la fórmula sigue siendo la cuenta de la opción abierta, no un «Falta:»');
const rotulos = F.opcionesVivas(it).map(x => F._opRotulo(x.d).titulo);
cierto(rotulos[0] === 'Aluminio Blanco/Negro/Pintado' && rotulos[1] === 'Acrílico + Aluminio (Volumen)' && rotulos[2].startsWith('Caja de luz'),
  'los títulos salen del catálogo: ' + rotulos.join(' | '));

console.log('\nPARA EL PDF: SOLO LO QUE SE PUEDE PONER DELANTE DEL CLIENTE');
let pdf = F.opcionesParaPdf(it);
cierto(pdf && pdf.n === 3 && pdf.opciones.length === 3, 'las tres completas salen');
cierto(pdf.opciones.filter(o => o.abierta).length === 1 && pdf.opciones.find(o => o.abierta).letra === 'C', 'una sola va marcada como la que cuenta en el total');
cierto(igual(pdf.opciones.map(o => o.total), [10800, 14400, 5616]), 'con sus importes');
const incompleta = partida(); F._opProponer(incompleta); incompleta.material = '';       // B sin material
cierto(F.opcionesParaPdf(incompleta) === null, 'una opción a medias no se imprime, y con una sola completa no hay nada que comparar');
const gemelas = partida(); F._opProponer(gemelas);
cierto(F.opcionesParaPdf(gemelas) === null, 'dos opciones idénticas no hacen una comparación');

console.log('\nELEGIR: LA ELEGIDA ES LA PARTIDA Y LAS DEMÁS SE DESCARTAN');
const id = it.id;
cierto(F._opElegir(it, 1) === true, 'elegir la A');
cierto(it.opciones === undefined, 'la propuesta desaparece: no queda rastro de las otras');
cierto(it.tipo === 'letras' && it.material === 'al-paint' && it.altura === 40 && it.n === 9, 'la partida tiene los campos de la A');
cierto(it.ancho === 0 && it.tarifa === 0, 'y ninguno de la caja que estaba abierta');
cierto(it.id === id && it.showInPdf === true, 'la identidad de la partida y su ojo del PDF no cambian');
cierto(F.totals().sub === 10800, 'el subtotal es el de la elegida');
cierto(!F.faltantesDe(it).includes('elegir la opción'), 'ya no falta nada por elegir');
cierto(!JSON.stringify(Q.items).includes('opciones'), 'ni en Q ni en lo que se guarda aparecen las otras');
cierto(F._opElegir(it, 1) === false, 'elegir sin propuesta no hace nada');

console.log('\nELEGIR UNA QUE NO ESTABA ABIERTA');
const dos = partida({ id: 7 }); F._opProponer(dos); conMaterial(dos, 'acero');   // A pintado, B acero
cierto(F._opElegir(dos, 1) === true && dos.material === 'al-paint' && dos.opciones === undefined, 'elegir la A estando la B abierta carga la A');
cierto(F.lineTotal(dos) === 30 * 40 * 9, 'y cuesta lo de la A, no lo de la B ($55)');

console.log('\nQUITAR: LAS LETRAS SIGUEN LA POSICIÓN Y CON UNA SOLA YA NO HAY PROPUESTA');
const tres = partida({ id: 8 }); F._opProponer(tres); conMaterial(tres, 'acr-vol'); F._opAgregar(tres); conMaterial(tres, 'acero');
cierto(importes(tres).join() === '10800,14400,19800', 'A, B y C: 10,800 · 14,400 · 19,800');
cierto(F._opQuitar(tres, 2) === true, 'quitar la B (que no es la abierta)');
cierto(F.opcionesVivas(tres).map(x => x.letra).join() === 'A,B' && F.opcionesVivas(tres)[1].d.material === 'acero', 'la C pasa a ser la B sin tocar sus datos');
cierto(F.lineTotal(tres) === 19800, 'y la abierta sigue siendo la misma');
cierto(F._opQuitar(tres, 3) === true, 'quitar la abierta');
cierto(tres.opciones === undefined && tres.material === 'al-paint', 'queda una sola: deja de ser propuesta y trae los datos de la que sobrevivió');
cierto(F._opQuitar(tres, 1) === false, 'quitar sin propuesta no hace nada');

console.log('\nUN RESPALDO CON LA PROPUESTA MAL FORMADA NO TRUENA NI COBRA DE MÁS');
const malas = {
  'una sola opción': { lista: [{ k: 1, d: partida() }], activa: 1 },
  'más de tres': { lista: [1, 2, 3, 4].map(k => ({ k, d: partida() })), activa: 1 },
  'la abierta no existe': { lista: [{ k: 1, d: partida() }, { k: 2, d: partida() }], activa: 9 },
  'k repetida': { lista: [{ k: 1, d: partida() }, { k: 1, d: partida() }], activa: 1 },
  'sin lista': { activa: 1 },
  'tipo de partida inventado': { lista: [{ k: 1, d: partida() }, { k: 2, d: { ...partida(), tipo: 'otra' } }], activa: 1 },
  'una opción que no es objeto': { lista: [{ k: 1, d: partida() }, { k: 2, d: 'texto' }], activa: 1 },
  'no es objeto': 'hola',
};
for (const [que, o] of Object.entries(malas)) {
  const p = partida({ opciones: o });
  let ok = true;
  try { ok = F.opcionesDe(p) === null && F.opcionesVivas(p) === null && F.opcionesParaPdf(p) === null
    && !F.faltantesDe(p).includes('elegir la opción') && F.lineTotal(p) === 10800; } catch (_) { ok = false; }
  cierto(ok, `${que}: se trata como una partida sin propuesta`);
}
const sucia = partida({ opciones: { lista: [{ k: 1, d: partida({ altura: 'abc', n: '9' }) }, { k: 2, d: partida() }], activa: 2 } });
const vivas = F.opcionesVivas(sucia);
cierto(vivas && Number.isFinite(F.lineTotal(vivas[0].d)), 'una cifra ilegible en una opción guardada vale 0 y no NaN');
cierto(F.lineTotal(vivas[0].d) === 0 && F.opcionesParaPdf(sucia) === null, 'así que esa opción no se imprime ni se elige');

console.log('\nSE GUARDA Y SE VUELVE A ABRIR IGUAL');
const guardada = JSON.parse(JSON.stringify([it2()]));
function it2() { const p = partida({ id: 3 }); F._opProponer(p); conMaterial(p, 'acr-vinil'); return p; }
const vuelta = F.normalizarItems(guardada)[0];
cierto(igual(vuelta.opciones, guardada[0].opciones), 'normalizarItems conserva la propuesta tal cual');
cierto(F.opcionesDe(vuelta) !== null, 'y sigue siendo válida');
const dup = JSON.parse(JSON.stringify(vuelta)); dup.id = 4;
cierto(igual(importes(dup), importes(vuelta)), 'duplicar la partida (dupItem copia por JSON) duplica también la propuesta');

console.log('\nEL MATERIAL A COMPRAR: SOLO LA ELEGIDA, NUNCA LAS DEMÁS');
const semilla = JSON.parse(readFileSync(join(RAIZ, 'datos/semilla.json'), 'utf8'));
const cts = Object.fromEntries(semilla.constantes.map(c => [c.clave, c.valor]));
const norm = m => ({ ...m, merma_pct: m.merma_pct !== undefined ? m.merma_pct : m.merma,
                     unidad_consumo: String(m.unidad_consumo || '').replace('m²', 'm2') });
const mats = Object.fromEntries(semilla.materiales.map(m => [m.id, norm(m)]));
const conProp = partida({ id: 5 }); F._opProponer(conProp); conProp.material = 'acero';
conProp.opciones.lista[0].d.material = 'acr-vinil';
const sinProp = JSON.parse(JSON.stringify(conProp)); delete sinProp.opciones;
const dConProp = derivar([JSON.parse(JSON.stringify(conProp))], cts, catalogos(), mats);
const dSinProp = derivar([sinProp], cts, catalogos(), mats);
cierto(dConProp && dConProp.lineas.length > 0, 'derivar() calcula el material de la partida con propuesta');
cierto(igual(dConProp, dSinProp), 'es EXACTAMENTE el de la partida sola: la propuesta no suma ni un tornillo');
const elegida = JSON.parse(JSON.stringify(conProp)); F._opElegir(elegida, 1);                // la A (acrílico + vinil)
const dElegida = derivar([elegida], cts, catalogos(), mats);
cierto(!igual(dElegida, dSinProp), 'y si el cliente elige la otra, el material cambia a la de esa opción');

console.log('\nEl catálogo manda: ninguna cifra de precio vive en esta función nueva');
const fuente = readFileSync(join(RAIZ, 'js/cotizador/partidas.js'), 'utf8');
const bloque = fuente.slice(fuente.indexOf('Propuesta con opciones (pieza 76)'));
cierto(!/\*\s*(30|35|40|45|55|3900|4600|950|1500)\b/.test(bloque.replace(/\/\*[\s\S]*?\*\//g, '')),
  'el código de la propuesta no repite ninguna tarifa del catálogo');
cierto(/lineTotal\(/.test(bloque), 'los importes salen de lineTotal()');

if (fallas) { console.log('\n' + fallas + ' comprobación(es) fallaron.'); process.exit(1); }
console.log('\nLa propuesta con opciones cuenta una sola opción, cobra con las tarifas de siempre y elegir deja una partida normal.');
