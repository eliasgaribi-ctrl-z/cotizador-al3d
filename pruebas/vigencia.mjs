/* LA VIGENCIA DE UNA COTIZACIÓN, CONTADA DESDE LA FECHA QUE LA APP ESCRIBE.

   Los términos del PDF dicen «La cotización es válida por 10 días» desde la primera versión, y
   nadie contaba esos días: ni el PDF decía hasta cuándo, ni el WhatsApp, ni el historial sabía
   cuáles ya vencieron. Q.fecha es TEXTO —«16 sep 2026»— y así viaja al historial y al respaldo,
   así que para contar hay que leerlo de vuelta. Esta prueba fija las dos cosas que no se pueden
   revisar mirando: que el texto se lee bien en las formas en que Chrome lo ha escrito («sep»,
   «sept», con punto), y que la cuenta de días es de calendario —«vence hoy» es hoy a cualquier
   hora— con la frase que corresponde a cada tramo.

   Uso: node pruebas/vigencia.mjs */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const elemento = () => ({
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  style: {}, setAttribute: noop, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], textContent: '', innerHTML: '',
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
  IntersectionObserver: Observador, Intl, URL, performance, structuredClone, Date,
  Blob: class {}, FileReader: class {}, Image: class {}, CustomEvent: class {}, Event: class {},
});
for (const f of ['js/cotizador/catalogo.js', 'js/cotizador/nucleo.js']) {
  vm.runInContext(readFileSync(join(RAIZ, f), 'utf8'), ctx, { filename: f });
}
const ev = code => vm.runInContext(code, ctx);
const F = {};
for (const n of ['fechaDeTexto', 'vigenciaDe', 'fraseVigencia', 'fechaCorta']) F[n] = ev(n);
const VIGENCIA_DIAS = ev('VIGENCIA_DIAS');

let fallas = 0;
const cierto = (cond, que) => { console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que); if (!cond) fallas++; };

/* La fecha escrita a mano, sin pasar por Intl: la prueba no puede depender de que node y Chrome
   abrevien igual el mes. */
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const escrita = d => `${String(d.getDate()).padStart(2, '0')} ${MES[d.getMonth()]} ${d.getFullYear()}`;
const hoy0 = () => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), h.getDate()); };
const hace = n => { const d = hoy0(); d.setDate(d.getDate() - n); return d; };
const mismoDia = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

console.log('\nLA REGLA');
cierto(VIGENCIA_DIAS === 10, 'la vigencia es de 10 días, como dicen los términos del PDF');

console.log('\nLEER LA FECHA QUE LA APP ESCRIBE');
const d1 = F.fechaDeTexto('16 sep 2026');
cierto(d1 && d1.getFullYear() === 2026 && d1.getMonth() === 8 && d1.getDate() === 16, '«16 sep 2026» → 16 de septiembre de 2026');
cierto(mismoDia(F.fechaDeTexto('16 sept 2026'), d1), '«16 sept 2026» —la abreviatura larga de algunas versiones de ICU— se lee igual');
cierto(mismoDia(F.fechaDeTexto('16 sep. 2026'), d1), '«16 sep. 2026», con el punto de la abreviatura, se lee igual');
cierto(mismoDia(F.fechaDeTexto('  1 ene 2027 '), new Date(2027, 0, 1)), 'un día de un dígito y espacios alrededor');
cierto(mismoDia(F.fechaDeTexto('05 DIC 2026'), new Date(2026, 11, 5)), 'las mayúsculas no importan');
cierto(F.fechaDeTexto('') === null, 'vacío → null');
cierto(F.fechaDeTexto('2026-09-16') === null, 'una fecha ISO no es lo que la app escribe → null, sin inventar');
cierto(F.fechaDeTexto('16 xyz 2026') === null, 'un mes desconocido → null');
cierto(F.fechaDeTexto('mañana') === null && F.fechaDeTexto(null) === null, 'texto suelto o null → null');
cierto(F.vigenciaDe('') === null && F.fraseVigencia('basura') === '', 'sin fecha legible no hay vigencia ni frase: se calla');

console.log('\nCONTAR LOS DÍAS, DE MEDIANOCHE A MEDIANOCHE');
let v = F.vigenciaDe(escrita(hoy0()));
cierto(v && v.dias === 10, `fechada hoy: faltan 10 días (${v && v.dias})`);
cierto(v && mismoDia(v.hasta, hace(-10)), 'y «hasta» es hoy + 10 en el calendario');
cierto(v && v.hastaTxt === F.fechaCorta(v.hasta), 'hastaTxt es la misma fecha escrita como la escribe la app');
cierto(/^Vigente hasta el .+ · faltan 10 días$/.test(F.fraseVigencia(escrita(hoy0()))), 'frase: «Vigente hasta el … · faltan 10 días»');
v = F.vigenciaDe(escrita(hace(3)));
cierto(v && v.dias === 7 && mismoDia(v.hasta, hace(-7)), 'fechada hace 3 días: faltan 7');
cierto(/faltan 2 días$/.test(F.fraseVigencia(escrita(hace(8)))), 'hace 8 días: «faltan 2 días»');
cierto(/^Vigente hasta mañana, /.test(F.fraseVigencia(escrita(hace(9)))), 'hace 9 días: «Vigente hasta mañana, …»');
cierto(/^Vence hoy, /.test(F.fraseVigencia(escrita(hace(10)))), 'hace 10 días: «Vence hoy, …» — el último día todavía vale');
cierto(F.vigenciaDe(escrita(hace(10))).dias === 0, 'y dias es 0, no −1 ni 1, sea la hora que sea');
cierto(/^Venció el .+ · hace 1 día$/.test(F.fraseVigencia(escrita(hace(11)))), 'hace 11 días: «Venció el … · hace 1 día», en singular');
cierto(/^Venció el .+ · hace 15 días$/.test(F.fraseVigencia(escrita(hace(25)))), 'hace 25 días: «Venció el … · hace 15 días»');
cierto(F.vigenciaDe(escrita(hace(25))).dias === -15, 'con dias en −15');
/* Un salto de mes y de año: la cuenta la hace Date, pero conviene fijarlo. */
v = F.vigenciaDe('28 dic 2026');
cierto(v && v.hasta.getFullYear() === 2027 && v.hasta.getMonth() === 0 && v.hasta.getDate() === 7, '«28 dic 2026» vence el 7 de enero de 2027');

console.log('');
if (fallas) { console.log(`${fallas} falla(s).`); process.exit(1); }
console.log('Vigencia: todo cuadra.');
