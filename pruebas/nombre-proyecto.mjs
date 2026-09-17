/* «CONTACTO - NEGOCIO», SIN REPETIR A NADIE — Y LAS DOS RÉPLICAS DICEN LO MISMO.

   Así se llaman las cotizaciones en Canva («Deyanira - Abajeño Tlaquepaque»), los proyectos de la
   base de Notion y los renglones de la hoja de Ventas. El cotizador guarda las dos mitades en
   Cliente y Proyecto, y las pegaba con un guion en tres sitios a ciegas: cuando el proyecto ya venía
   escrito a la manera de Canva, con el negocio dentro, la venta salía «Abajeño - Deyanira - Abajeño»
   y el cliente aparecía dos veces en la hoja, en la plataforma y en el historial.

   La regla vive en js/datos/cotizador.js (módulo ES, la plataforma) y replicada letra por letra en
   js/cotizador/nucleo.js (guion clásico, el cotizador). Aquí se corre la MISMA tabla contra las dos
   y se comprueba que coincidan: una réplica que nadie compara es la que se separa sin que nadie lo
   note, y el mismo proyecto acabaría con dos nombres según desde dónde se mire.

   Uso: node pruebas/nombre-proyecto.mjs */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nombreContactoNegocio as plataforma, nombreContiene as contienePf } from '../js/datos/cotizador.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const elemento = () => ({ classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, style: {}, setAttribute: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], textContent: '', innerHTML: '' });
const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop, readyState: 'complete', documentElement: elemento(), body: elemento(), createElement: elemento, activeElement: null };
const window = { addEventListener: noop, removeEventListener: noop, innerWidth: 1200, innerHeight: 800, matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), history: { pushState: noop, replaceState: noop, back: noop }, location: { hash: '', search: '', pathname: '/' }, scrollTo: noop, setTimeout, clearTimeout, requestAnimationFrame: f => setTimeout(f, 0) };
window.window = window; window.parent = window; window.self = window;
class Observador { observe() {} disconnect() {} }
const ctx = vm.createContext({ window, document, self: window, location: window.location, history: window.history, localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, navigator: { userAgent: 'node' }, console, setTimeout, clearTimeout, requestAnimationFrame: window.requestAnimationFrame, getComputedStyle: () => ({ top: '0' }), matchMedia: window.matchMedia, MutationObserver: Observador, ResizeObserver: Observador, IntersectionObserver: Observador, Intl, URL, performance, structuredClone, Date, Blob: class {}, FileReader: class {}, Image: class {}, CustomEvent: class {}, Event: class {} });
for (const f of ['js/cotizador/catalogo.js', 'js/cotizador/nucleo.js']) vm.runInContext(readFileSync(join(RAIZ, f), 'utf8'), ctx, { filename: f });
const cotizador = vm.runInContext('nombreContactoNegocio', ctx);
const contieneCot = vm.runInContext('nombreContiene', ctx);

let fallas = 0;
const cierto = (cond, que) => { console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que); if (!cond) fallas++; };

/* [cliente, proyecto, lo que debe salir, por qué] */
const TABLA = [
  ['Deyanira', 'Abajeño Tlaquepaque', 'Deyanira - Abajeño Tlaquepaque', 'contacto y negocio sueltos → «Contacto - Negocio», como en Canva'],
  ['Abajeño Tlaquepaque', 'Deyanira - Abajeño Tlaquepaque', 'Deyanira - Abajeño Tlaquepaque', 'el proyecto ya trae al cliente → se queda el proyecto, sin anteponerlo otra vez'],
  ['Farmacia San Juan', 'Farmacia San Juan – Letrero fachada', 'Farmacia San Juan – Letrero fachada', 'con guion largo también, y el texto sale tal como se escribió'],
  ['farmacia san juan', 'FARMACIA SAN JUAN - fachada', 'FARMACIA SAN JUAN - fachada', 'sin importar mayúsculas'],
  ['Tortas Toño', 'tortas tono - anuncio', 'tortas tono - anuncio', 'ni acentos'],
  ['Deyanira - Abajeño', 'Abajeño', 'Deyanira - Abajeño', 'al revés: el cliente ya trae al negocio → se queda el cliente'],
  ['Luis', 'Luisa Café', 'Luis - Luisa Café', 'solo palabras completas: «Luis» no está dentro de «Luisa»'],
  ['Ana', 'Panadería Ana Banana', 'Panadería Ana Banana', 'pero «Ana» sí está en «Panadería Ana Banana» como palabra'],
  ['', 'Abajeño', 'Abajeño', 'sin cliente, el proyecto'],
  ['Deyanira', '', 'Deyanira', 'sin proyecto, el cliente'],
  ['', '', '', 'sin nada, nada: quien lo use pone el folio'],
  ['  Deyanira  ', ' Abajeño ', 'Deyanira - Abajeño', 'los espacios de los bordes no cuentan'],
  ['Héctor', 'Héctor - TATA Consultores', 'Héctor - TATA Consultores', 'un título real de Canva entra tal cual'],
];
console.log('\nLA REGLA, EN EL COTIZADOR Y EN LA PLATAFORMA');
for (const [c, p, esp, por] of TABLA) {
  const a = cotizador(c, p), b = plataforma(c, p);
  cierto(a === esp, `cotizador: («${c}», «${p}») → «${a}» — ${por}`);
  cierto(b === a, `plataforma dice lo mismo («${b}»)`);
}
console.log('\n«CONTIENE», COMO PALABRAS');
for (const [todo, parte, esp] of [['Deyanira - Abajeño', 'abajeño', true], ['Luisa Café', 'Luis', false], ['Panadería Ana Banana', 'ana', true], ['Tortas Toño', 'tono', true], ['x', '', false], ['', 'x', false]]) {
  cierto(contieneCot(todo, parte) === esp && contienePf(todo, parte) === esp, `«${todo}» contiene «${parte}»: ${esp}, en las dos`);
}
console.log('');
if (fallas) { console.log(`${fallas} falla(s).`); process.exit(1); }
console.log('Nombre del proyecto: una regla, dos réplicas iguales.');
