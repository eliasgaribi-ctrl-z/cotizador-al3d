/* Prueba de preciosCliente(): cómo se reparte entre las partidas un precio autorizado que
   va POR ENCIMA del calculado.

   El PDF imprimía «Ajuste + $646.90» debajo del subtotal cada vez que el autorizador subía
   el precio, y ese renglón le pedía al cliente que preguntara por qué. Ahora el aumento se
   reparte entre las partidas en proporción a lo que vale cada una, y el renglón desaparece.
   Es aritmética con redondeos —unitarios al centavo, centavos sobrantes a la partida más
   cara— y ahí un error no se ve: sale una tabla plausible que suma un centavo distinto del
   total, o una partida barata que carga con todo el aumento. Solo se detecta sumando.

   js/cotizador/nucleo.js es un guion clásico —no un módulo— y al cargar cuelga oyentes del
   documento, así que se corre dentro de un vm con un documento de mentiras: lo único que
   hace falta que exista es que las llamadas no truenen. Las funciones de precio no tocan el
   DOM, que es justo lo que las hace probables.

   Uso: node pruebas/precios-cliente.mjs   (o pruebas/correr.sh, que corre todas)                */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- El documento de mentiras ---- */
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
  IntersectionObserver: Observador, Intl, URL, performance, structuredClone,
  Blob: class {}, FileReader: class {}, Image: class {}, CustomEvent: class {}, Event: class {},
});
for (const f of ['js/cotizador/catalogo.js', 'js/cotizador/nucleo.js']) {
  vm.runInContext(readFileSync(join(RAIZ, f), 'utf8'), ctx, { filename: f });
}
/* Los `const` de arriba del guion (Q, money) no son propiedades del contexto; se piden
   por su nombre. Las `function` sí lo son, pero se piden igual, por uniformidad. */
const ev = code => vm.runInContext(code, ctx);
const Q = ev('Q');
const F = {};
for (const n of ['lineTotal', 'totals', 'sellarAuth', 'authVigente', 'precioFinal', 'subAjustado',
  'netoAjustado', 'ajusteAuth', 'desgloseFinal', 'itemPrecio', 'itemPrecioCliente', 'itemAjustada',
  'preciosCliente', 'hayAumentoAuth', 'piezasDe', 'ltHTML']) F[n] = ev(n);

let fallas = 0;
const cierto = (cond, que) => {
  console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que);
  if (!cond) fallas++;
};
const cerca = (a, b, tol = 0.005) => Math.abs(a - b) < tol;
const suma = pc => Object.values(pc).reduce((s, v) => s + v, 0);
const centavos = v => Math.round(v * 100);

/* Deja a Q como una cotización autorizada sobre estas partidas, con este precio final. */
function autorizada({ items, iva = true, precioAuth = 0, itemsAuth = {}, estado = 'autorizada' }) {
  Q.items = items; Q.iva = iva; Q.itemsAuth = itemsAuth; Q.precioAuth = precioAuth;
  Q.estado = estado; Q.editMode = false;
  F.sellarAuth();
}
const manual = (id, pz, pu, extra = {}) => ({ id, tipo: 'manual', pz, pu, desc: 'x', ...extra });

/* ---- 1. El caso de la captura: 5 letras a $1,000 y 2 puntos a $280, redondeado a $7,200 ---- */
console.log('\nEL CASO DE LA CAPTURA · $5,560 + IVA = $6,449.60, autorizado en $7,200');
autorizada({ items: [manual(1, 5, 1000), manual(2, 2, 280)], precioAuth: 7200 });
cierto(cerca(F.totals().neto, 6449.60), 'el calculado con IVA es $6,449.60');
cierto(cerca(F.precioFinal(), 7200), 'el precio final es el autorizado, $7,200');
cierto(cerca(F.ajusteAuth(), -750.40), 'el ajuste global es un aumento de $750.40 con IVA');
cierto(F.hayAumentoAuth(), 'y se reconoce como aumento a repartir');
let pc = F.preciosCliente();
const subFinal = F.desgloseFinal().sub;
cierto(cerca(subFinal, 6206.90), 'el subtotal que corresponde a $7,200 es $6,206.90');
cierto(cerca(suma(pc), subFinal), `las partidas suman exactamente ese subtotal (${suma(pc).toFixed(2)})`);
cierto(pc[1] > 5000 && pc[2] > 560, 'las dos partidas subieron');
cierto(pc[2] - 560 < 100, `la barata NO cargó con todo el aumento: subió ${(pc[2] - 560).toFixed(2)}, no $646.90`);
cierto(cerca(pc[1] / 5000, pc[2] / 560, 0.001), `subieron en la misma proporción (${(pc[1] / 5000).toFixed(4)} y ${(pc[2] / 560).toFixed(4)})`);
cierto(centavos(pc[2]) % 2 === 0 && centavos(pc[1]) % 5 === 0, `los dos unitarios multiplican limpio: ${pc[2]} entre 2 y ${pc[1]} entre 5, sin asterisco en el PDF`);
cierto(cerca(pc[1], 5581.70) && cerca(pc[2], 625.20), `los importes son $5,581.70 y $625.20 (salieron ${pc[1]} y ${pc[2]})`);
cierto(cerca(F.itemPrecioCliente(Q.items[0]), pc[1]), 'itemPrecioCliente dice lo mismo que el reparto');
cierto(F.itemAjustada(Q.items[1]), 'y la pantalla marca la partida como ajustada, para no leer un número distinto del impreso');
cierto(F.ltHTML(Q.items[1]).includes('$625.20') && F.ltHTML(Q.items[1]).includes('$560.00'), 'ltHTML enseña el calculado tachado y el del cliente');

/* ---- 2. Un descuento no se reparte: se imprime como renglón ---- */
console.log('\nUN DESCUENTO NO SE REPARTE');
autorizada({ items: [manual(1, 5, 1000), manual(2, 2, 280)], precioAuth: 6000 });
cierto(F.ajusteAuth() > 0, 'el ajuste es un descuento');
cierto(!F.hayAumentoAuth(), 'no hay aumento que repartir');
pc = F.preciosCliente();
cierto(cerca(pc[1], 5000) && cerca(pc[2], 560), 'las partidas conservan su precio: el descuento sale abajo, en su renglón');

/* ---- 3. Solo cuenta una autorización vigente ---- */
console.log('\nSOLO CUENTA UNA AUTORIZACIÓN VIGENTE');
autorizada({ items: [manual(1, 5, 1000), manual(2, 2, 280)], precioAuth: 7200, estado: 'pendiente' });
pc = F.preciosCliente();
cierto(cerca(pc[1], 5000) && cerca(pc[2], 560), 'pendiente de autorizar: nada se reparte, aunque haya un precio tecleado');
autorizada({ items: [manual(1, 5, 1000), manual(2, 2, 280)], precioAuth: 7200 });
Q.items[1].pu = 300;   // se editó una partida después de autorizar
cierto(!F.authVigente(), 'al cambiar una partida la autorización deja de valer');
pc = F.preciosCliente();
cierto(cerca(pc[1], 5000) && cerca(pc[2], 600), 'y las partidas vuelven al calculado, sin reparto');

/* ---- 4. Los ajustes por partida son la base del reparto, no lo repartido ---- */
console.log('\nLOS AJUSTES POR PARTIDA SE RESPETAN');
autorizada({ items: [manual(1, 5, 1000), manual(2, 2, 280)], itemsAuth: { 1: 4500 }, precioAuth: 6500 });
cierto(cerca(F.subAjustado(), 5060), 'la base es $4,500 + $560 = $5,060, con el ajuste por partida puesto');
pc = F.preciosCliente();
cierto(cerca(suma(pc), F.desgloseFinal().sub), `las partidas suman el subtotal de $6,500 (${suma(pc).toFixed(2)} contra ${F.desgloseFinal().sub})`);
cierto(cerca(pc[1] / 4500, pc[2] / 560, 0.001), 'y el reparto es proporcional a la base ajustada, no a la calculada');

/* ---- 5. Sin IVA el subtotal que se reparte es el precio autorizado tal cual ---- */
console.log('\nSIN IVA');
autorizada({ items: [manual(1, 5, 1000), manual(2, 2, 280)], iva: false, precioAuth: 6000 });
pc = F.preciosCliente();
cierto(cerca(suma(pc), 6000), `las partidas suman los $6,000 autorizados (${suma(pc).toFixed(2)})`);

/* ---- 6. Los centavos sobrantes: el trueque entre dos partidas ---- */
console.log('\nLOS CENTAVOS SOBRANTES');
/* Dos partidas de 3 y 2 piezas ($4,400) autorizadas en $4,501: al truncar los unitarios
   queda UN centavo que no cabe en ninguno de los dos. El trueque —un centavo menos en el
   unitario de una, dos más en el de la otra— lo cierra sin ensuciar ninguna. */
autorizada({ items: [manual(1, 3, 1000), manual(2, 2, 700)], iva: false, precioAuth: 4501 });
pc = F.preciosCliente();
cierto(cerca(suma(pc), 4501), `suman los $4,501 autorizados (${suma(pc).toFixed(2)})`);
cierto(centavos(pc[1]) % 3 === 0 && centavos(pc[2]) % 2 === 0, `y las dos quedan limpias con el trueque: ${pc[1]} entre 3 y ${pc[2]} entre 2`);
autorizada({ items: [manual(1, 3, 1000), manual(2, 1, 500)], iva: false, precioAuth: 3700 });
pc = F.preciosCliente();
cierto(cerca(suma(pc), 3700), `suman $3,700 (${suma(pc).toFixed(2)})`);
cierto(centavos(pc[1]) % 3 === 0, `la de 3 piezas multiplica limpio (${pc[1]} = 3 × ${(pc[1] / 3).toFixed(2)}): sin asterisco`);
cierto(cerca(pc[1], 3171.42) && cerca(pc[2], 528.58), `el centavo sobrante cayó en la de una pieza (${pc[1]} y ${pc[2]})`);
/* Sin ninguna de una pieza, cae en la más cara y no en la más barata. */
autorizada({ items: [manual(1, 3, 1000), manual(2, 7, 30)], iva: false, precioAuth: 3300 });
pc = F.preciosCliente();
cierto(cerca(suma(pc), 3300), `sin partidas de una pieza también suman (${suma(pc).toFixed(2)})`);
cierto(centavos(pc[2]) % 7 === 0, `y la barata quedó limpia (${pc[2]} entre 7): el sobrante fue a la cara`);

/* ---- 7. Una partida en $0 sigue en $0, y la oculta del PDF entra al reparto ---- */
console.log('\nBORDES');
autorizada({ items: [manual(1, 5, 1000), manual(2, 1, 0), manual(3, 2, 280, { showInPdf: false })], precioAuth: 7200 });
pc = F.preciosCliente();
cierto(pc[2] === 0, 'la partida sin precio no recibe ni centavos');
cierto(pc[3] > 560, 'la oculta del PDF sube igual: se cobra aunque no se enseñe');
cierto(cerca(suma(pc), F.desgloseFinal().sub), `y todo suma el subtotal (${suma(pc).toFixed(2)})`);
/* Sin ninguna partida con precio no hay proporción que guardar: no se reparte. */
autorizada({ items: [manual(1, 1, 0), manual(2, 1, 0)], precioAuth: 1000 });
cierto(!F.hayAumentoAuth(), 'con todas las partidas en $0 no se reparte nada');
pc = F.preciosCliente();
cierto(pc[1] === 0 && pc[2] === 0, 'y se quedan en $0: el PDF vuelve al renglón de ajuste, que al menos suma');
/* piezasDe es lo que imprime la columna «Pzas.». */
cierto(F.piezasDe({ tipo: 'letras', n: 7 }) === 7 && F.piezasDe({ tipo: 'bastidor' }) === 1 && F.piezasDe({ tipo: 'manual', pz: 4 }) === 4, 'piezasDe cuenta como la columna Pzas.');

/* ---- 8. Al azar: 400 cotizaciones inventadas, y todas tienen que sumar ---- */
console.log('\nAL AZAR');
let semilla = 20260903;
const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
let malas = 0, sinAsteriscoDeMas = 0;
for (let k = 0; k < 400; k++) {
  const n = 1 + Math.floor(azar() * 8);
  const items = Array.from({ length: n }, (_, i) => manual(i + 1, 1 + Math.floor(azar() * 14), azar() < 0.1 ? 0 : Math.round(azar() * 3000) * 10 || 50));
  const iva = azar() < 0.7;
  Q.items = items; Q.iva = iva; Q.itemsAuth = {}; Q.precioAuth = 0; Q.estado = 'autorizada'; F.sellarAuth();
  const neto = F.totals().neto;
  if (neto <= 0) continue;
  Q.precioAuth = Math.ceil(neto * (1.01 + azar() * 0.5) / 100) * 100;
  const base = {}; items.forEach(it => { base[it.id] = F.itemPrecio(it); });
  const subBase = F.subAjustado();
  pc = F.preciosCliente();
  const objetivo = F.desgloseFinal().sub;
  const factor = objetivo / subBase;
  let sucios = 0, mal = '';
  if (!cerca(suma(pc), objetivo)) mal = `suma ${suma(pc).toFixed(2)} y no ${objetivo}`;
  for (const it of items) {
    if (base[it.id] === 0 && pc[it.id] !== 0) mal = `la partida ${it.id} en $0 recibió ${pc[it.id]}`;
    /* La subida de cada partida es la proporcional, salvo el redondeo del unitario
       (medio centavo por pieza) y los centavos sobrantes, que caen en una sola. */
    const esperado = base[it.id] * (factor - 1), real = pc[it.id] - base[it.id];
    if (Math.abs(real - esperado) > 0.005 * it.pz + 0.6) mal = `la partida ${it.id} subió ${real.toFixed(2)} y le tocaban ${esperado.toFixed(2)}`;
    if (it.pz > 1 && centavos(pc[it.id]) % it.pz !== 0) sucios++;
  }
  if (sucios > 1) mal = `${sucios} partidas con unitario que no multiplica limpio; a lo sumo puede haber una`;
  if (mal) { malas++; if (malas <= 3) console.log(`         · caso ${k}: ${mal}`); }
  if (sucios === 0) sinAsteriscoDeMas++;
}
cierto(malas === 0, `400 cotizaciones al azar: todas suman su subtotal al centavo, cada una sube lo proporcional y a lo sumo una partida por cotización queda con asterisco (${malas} malas)`);
/* El asterisco no se puede erradicar —con una sola partida el subtotal tendría que ser múltiplo
   de sus piezas—, pero sí tiene que ser la excepción. Si esta cuenta se desploma, el reparto
   dejó de repartir sobre el unitario y volvió a repartir sobre el total. */
cierto(sinAsteriscoDeMas > 300, `y en la gran mayoría ninguna partida necesita asterisco (${sinAsteriscoDeMas} de 400)`);

console.log('');
if (fallas) { console.log(`${fallas} falla(s).`); process.exit(1); }
console.log('El aumento se reparte bien: proporcional, al centavo y sin renglón de ajuste.');
