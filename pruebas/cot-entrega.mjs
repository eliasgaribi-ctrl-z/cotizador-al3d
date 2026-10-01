/* LA ENTREGA DE LA COTIZACIÓN, SIN PANTALLA: WhatsApp, el folio del papel y la cuenta de cobro.

   Tres cuentas que un error vuelve plausibles —nada truena, sale un dato que parece bueno— y
   que llevan al cliente a la mano:

     1. A QUÉ NÚMERO VA EL CHAT. Hasta ahora el número se conocía DESPUÉS de tocar: el aviso de
        «no parece válido» se pintaba después de `window.open`, en la pestaña que el vendedor
        acababa de abandonar, y el hito decía «Chat abierto» de un chat que nunca abrió (falla 5
        del brief). Ahora la pista del paso lo dice antes, y tiene que decir el MISMO número que
        va a marcar el botón: una pista que redondea, que agrupa mal o que pone un dígito de
        menos es peor que no decir nada, porque el vendedor le cree. Se prueba con miles de
        teléfonos generados, contra la regla de siempre (`telWhatsApp`), y se prueba el ORDEN
        de lo que pasa al tocar: avisar antes de abrir, y no marcar un hito que no ocurrió.

     2. EL FOLIO DEL PAPEL. El formulario de verificar.html pide el folio COMPLETO, el que lleva
        la «@» y el aparato, y el PDF solo imprimía el corto: quien tecleaba desde el papel
        recibía «No auténtica» de una cotización buena (falla 1). Se prueba contra la función
        de la hoja, `folioValido()`, leída del .gs y no copiada: lo que sale impreso tiene que
        pasar por SU puerta.

     3. LA CUENTA DE COBRO Y EL IVA. La hoja realinea el IVA del renglón según la cuenta y no
        avisa. La tabla que usa el modal para avisar es una copia de `ivaDeCuenta()` del .gs; se
        prueba contra la función misma, con las cinco cuentas y con basura, para que si un día
        allá cambia la regla y aquí no, el aviso no salga al revés.

   Corre los guiones del cotizador en un vm con un documento de mentiras (mismo método que
   pruebas/precios-cliente.mjs). Las piezas compartidas se sustituyen por dobles, salvo la regla
   de teléfono, que es la de verdad: se extrae de js/piezas.js (sección 3) igual que lo hace
   pruebas/piezas-numeros.mjs.

   Uso: node pruebas/cot-entrega.mjs   (o pruebas/correr.sh, que corre todas) */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => readFileSync(join(RAIZ, f), 'utf8');
let fallas = 0;
const cierto = (cond, que) => { console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que); if (!cond) fallas++; };
const eq = (que, dio, esp) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esp);
  cierto(a === b, que + (a === b ? '' : '\n           dio: ' + a + '\n           esp: ' + b));
};

/* ---- La regla de teléfono de verdad, sacada de piezas.js ---- */
const fuente = leer('js/piezas.js');
const ini = fuente.indexOf('3 · NÚMEROS, MEDIDAS Y CAMPOS');
const fin = fuente.indexOf('/* ── fin de 3 ── */');
const seccion = fuente.slice(fuente.indexOf('*/', ini) + 2, fin);
const P = {
  sinMovimiento: () => true, punteroFino: () => false,
  esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
};
new Function('g', 'd', 'P', '"use strict";' + seccion)({ matchMedia: () => ({ matches: false }) }, new Proxy({}, { get() { throw new Error('tocó el documento'); } }), P);

/* ---- El documento de mentiras ---- */
const noop = () => {};
const elemento = () => ({
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  style: {}, setAttribute: noop, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], textContent: '', innerHTML: '',
});
/* nucleo.js se carga sin marcado (no encuentra nada), pero entrega.js cuelga oyentes de campos del
   marcado al cargarse (`$('logoin').addEventListener(...)`), y sin marcado no hay a quién
   colgárselos: antes de cargarlo, cualquier id devuelve una caja cualquiera. Lo que se prueba
   aquí no lee el DOM. */
const document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop, readyState: 'complete',
  documentElement: elemento(), body: elemento(), createElement: elemento, activeElement: null,
};
const bitacora = [];                       // en qué orden pasaron las cosas al tocar «Enviar por WhatsApp»
const avisos = [];
const ventana = { abrirDevuelve: {}, abiertas: [] };
const window = {
  addEventListener: noop, removeEventListener: noop, innerWidth: 400, innerHeight: 800,
  matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
  history: { pushState: noop, replaceState: noop, back: noop },
  location: { hash: '', search: '', pathname: '/', href: 'https://al3d.example/cotizador.html' }, scrollTo: noop,
  setTimeout, clearTimeout, requestAnimationFrame: f => setTimeout(f, 0),
  open: (url) => { bitacora.push('abrir'); ventana.abiertas.push(url); return ventana.abrirDevuelve; },
};
window.window = window; window.parent = window; window.self = window;
class Observador { observe() {} disconnect() {} }
const Piezas = Object.assign({}, P, {
  voz: noop, rodarCifra: noop, fichaQueViaja: () => ({ destruir: noop }), palomitaHTML: () => '',
  rielHTML: () => '', riel: () => null, vistazoHTML: () => '', vistazo: () => ({ cerrar: noop }),
  opcionesDeslizantesHTML: () => '', opcionesDeslizantes: () => ({ destruir: noop }),
  estadoBoton: () => ({ reiniciar: noop }), trabajando: () => Promise.resolve({ ok: true }),
});
window.Piezas = Piezas;
const ctx = vm.createContext({
  Piezas, window, document, self: window, location: window.location, history: window.history,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  navigator: { userAgent: 'node' }, console, setTimeout, clearTimeout,
  requestAnimationFrame: window.requestAnimationFrame, getComputedStyle: () => ({ top: '0' }),
  matchMedia: window.matchMedia, MutationObserver: Observador, ResizeObserver: Observador,
  IntersectionObserver: Observador, Intl, URL, performance, structuredClone,
  Blob: class {}, FileReader: class {}, Image: class {}, CustomEvent: class {}, Event: class {},
  encodeURIComponent,
});
for (const f of ['js/cotizador/catalogo.js', 'js/cotizador/nucleo.js']) vm.runInContext(leer(f), ctx, { filename: f });
document.getElementById = () => elemento();
for (const f of ['js/cotizador/entrega.js', 'js/cotizador/venta.js']) vm.runInContext(leer(f), ctx, { filename: f });
const ev = code => vm.runInContext(code, ctx);
const Q = ev('Q');
/* `toast` y `marcarHito` se sustituyen DESPUÉS de cargar: son declaraciones de función del
   guion, y el guion las llama por su nombre global, así que reemplazarlas en el contexto cambia
   a quién llaman `enviarPorWhatsApp` y compañía. */
ctx.toast = (msg, tipo) => { bitacora.push('aviso'); avisos.push({ msg, tipo }); };
ctx.marcarHito = k => { bitacora.push('hito:' + k); };

/* ===================================================================================== */
console.log('\n1 · A QUÉ NÚMERO VA EL CHAT, DICHO ANTES DE TOCAR');
const decir = tel => { Q.tel = tel; return ev('pistaWhatsApp()'); };

let p = decir('33 2813 0092');
cierto(p.ok && p.num === '523328130092' && p.destino === 'a +52 33 2813 0092' && p.aviso === '', 'un celular de diez dígitos dice «a +52 33 2813 0092»');
p = decir('+52 33 2813 0092');
cierto(p.ok && p.destino === 'a +52 33 2813 0092', 'con «+52» y espacios, lo mismo');
p = decir('(33) 2813-0092');
cierto(p.ok && p.destino === 'a +52 33 2813 0092', 'con paréntesis y guion, lo mismo');
p = decir('01 33 2813 0092');
cierto(p.ok && p.destino === 'a +52 33 2813 0092', 'con el «01» de antes de 2019, que la regla de siempre quita: lo mismo');
p = decir('044 33 2813 0092');
cierto(p.ok && p.destino === 'a +52 33 2813 0092', 'y con el «044»');
p = decir('521 33 2813 0092');
cierto(p.ok && p.num === '5213328130092' && p.destino === 'a +52 1 33 2813 0092', 'el formato viejo con el «1» se dice como es: «+52 1 33 2813 0092»');
p = decir('+1 415 555 2671');
cierto(p.ok && p.destino === 'a +14155552671', 'un número de otro país va con su «+» y sin agrupar de dos en cuatro, que solo es cierto para México');

p = decir('331234');
cierto(!p.ok && p.num === '' && /no parece válido/.test(p.destino) && /abrirá sin chat/.test(p.destino),
  'un teléfono a medias dice, antes de tocar, que no parece válido y que WhatsApp abrirá sin chat: «' + p.destino + '»');
cierto(/no parece un número válido/.test(p.aviso), 'y trae la frase del aviso que ya existía: «' + p.aviso + '»');
p = decir('');
cierto(!p.ok && /sin teléfono/.test(p.destino) && /Sin teléfono capturado/.test(p.aviso), 'sin teléfono también lo dice: «' + p.destino + '»');
p = decir('   ');
cierto(!p.ok && /sin teléfono/.test(p.destino), 'y unos espacios no son un teléfono');
p = decir('0248 0602 12');
cierto(!p.ok, 'ningún número de WhatsApp empieza con 0: «0248 0602 12» no promete un chat');

/* La pista y el botón no pueden tener dos criterios: 6 000 teléfonos generados, de buenos y de
   basura, y en todos la pista dice lo que `telWhatsApp` va a marcar. Y lo que dice se puede
   leer: quitados los signos, son EXACTAMENTE los dígitos del número, sin uno de más ni de menos. */
{
  let sem = 7;
  const azar = n => { sem = (sem * 1103515245 + 12345) & 0x7fffffff; return sem % n; };
  const dig = n => Array.from({ length: n }, () => azar(10)).join('');
  const prefijos = ['', '+52', '52', '521', '+521', '01', '044', '045', '00', '+1', '0', '+', '(33)', '33 '];
  let distintos = 0, invento = 0, sinAviso = 0, total = 0;
  for (let i = 0; i < 6000; i++) {
    const t = prefijos[azar(prefijos.length)] + (azar(4) ? ' ' : '') + dig(azar(16)) + (azar(5) ? '' : ' ext 12');
    Q.tel = t;
    const w = ev('pistaWhatsApp()'), num = ev('telWhatsApp')(t);
    total++;
    if (w.ok !== !!num || w.num !== num) distintos++;
    if (w.ok && w.destino.replace(/\D/g, '') !== num) invento++;
    if (!w.ok && (!w.aviso || !w.destino)) sinAviso++;
  }
  cierto(distintos === 0, `en ${total} teléfonos generados la pista y el botón nunca discrepan (${distintos} distintos)`);
  cierto(invento === 0, `y el número que se lee es el que se marca: ni un dígito de más ni de menos (${invento} inventados)`);
  cierto(sinAviso === 0, `y cuando no hay chat siempre hay frase, antes y después (${sinAviso} mudos)`);
}

console.log('\n1b · AL TOCAR «ENVIAR POR WHATSAPP»: AVISAR ANTES DE ABRIR, Y NO MARCAR LO QUE NO PASÓ');
const tocar = (tel, devuelve) => {
  bitacora.length = 0; avisos.length = 0; ventana.abiertas.length = 0;
  ventana.abrirDevuelve = devuelve;
  Q.tel = tel; Q.folio = 'COT-0042'; Q.proy = 'Letrero'; Q.items = []; Q.iva = true;
  ev('enviarPorWhatsApp()');
  return bitacora.slice();
};
eq('con número y la pestaña abierta: abre y marca «chat abierto», sin avisos', tocar('33 2813 0092', {}), ['abrir', 'hito:wa']);
cierto(/^https:\/\/wa\.me\/523328130092\?text=/.test(ventana.abiertas[0]), 'y abre el chat de ESE número: ' + ventana.abiertas[0].slice(0, 36) + '…');
eq('con el teléfono a medias: el aviso sale ANTES de abrir, y el hito NO se marca (no hay chat)', tocar('331234', {}), ['aviso', 'abrir']);
cierto(/no parece un número válido/.test(avisos[0].msg) && avisos[0].tipo === 'err', 'con el aviso de error de siempre: «' + avisos[0].msg + '»');
cierto(/^https:\/\/wa\.me\/\?text=/.test(ventana.abiertas[0]), 'y abre WhatsApp sin número, para elegir el chat a mano');
eq('sin teléfono, igual: avisa antes y no marca', tocar('', {}), ['aviso', 'abrir']);
cierto(/Sin teléfono capturado/.test(avisos[0].msg), 'con su frase: «' + avisos[0].msg + '»');
eq('si el navegador bloquea la ventana no hay chat ni hito, solo el aviso de permitirla', tocar('33 2813 0092', null), ['abrir', 'aviso']);
cierto(/ventanas emergentes/.test(avisos[0].msg), '«' + avisos[0].msg + '»');

/* ===================================================================================== */
console.log('\n2 · EL FOLIO COMPLETO EN EL PAPEL');
{
  const gs = leer('puente/hoja-apps-script.gs');
  const m = /function folioValido\(f\) \{[\s\S]*?\n\}/.exec(gs);
  cierto(!!m, 'se encontró folioValido() en la hoja');
  const folioValido = vm.runInNewContext('(' + m[0].replace(/^function folioValido/, 'function') + ')');

  const neto = () => ev('desgloseFinal()').neto;
  Q.items = [{ id: 1, tipo: 'manual', pz: 1, pu: 17400, desc: 'x' }]; Q.iva = true; Q.itemsAuth = {}; Q.precioAuth = 0;
  Q.estado = 'autorizada'; Q.editMode = false; Q.proy = 'Letrero fachada'; Q.folio = 'COT-0042';
  ev('sellarAuth()');
  /* Lo que arma `folioGlobal()` de notario.js: el folio corto y el aparato, unidos por «@». */
  const folioSello = 'COT-0042@' + ev('dispositivo()');
  Q.sello = { codigo: 'A1B2-C3D4-E5F6', folio: folioSello, total: neto(), proyecto: 'Letrero fachada', correo: 'a@b.mx', ts: '1' };
  const html = ev(`verificacionHTML(${neto()})`);
  cierto(html.length > 0, 'una cotización sellada imprime el bloque de verificación');
  const impresos = [...html.matchAll(/<b class="num">([^<]+)<\/b>/g)].map(x => x[1]);
  cierto(impresos.includes(folioSello), 'el folio impreso es el COMPLETO, el del sello: ' + JSON.stringify(impresos));
  cierto(folioSello.includes('@') && folioValido(folioSello), '«' + folioSello + '» es un folio que la hoja acepta (lleva la «@» del aparato)');
  cierto(!folioValido('COT-0042'), 'y el corto NO: es justo el que impreso solo daba «No auténtica»');
  cierto(impresos.every((x, i) => i === 0 ? folioValido(x) : x === 'A1B2-C3D4-E5F6'), 'lo primero que se puede teclear del papel pasa por folioValido(), y lo segundo es el código');
  cierto(html.indexOf(folioSello) < html.indexOf('A1B2-C3D4-E5F6'), 'en el orden en que verificar.html lo pide: folio y luego código');
  const liga = /verificar\.html\?f=([^&"]+)&c=([^&"]+)/.exec(ev('ligaDeVerificacion(Q.sello)'));
  cierto(liga && decodeURIComponent(liga[1]) === folioSello, 'y es el mismo folio que lleva el QR');

  Q.sello = { codigo: 'A1B2-C3D4-E5F6', folio: '<img src=x onerror=alert(1)>@X', total: neto(), proyecto: 'Letrero fachada' };
  cierto(!/<img/.test(ev(`verificacionHTML(${neto()})`)), 'y el folio se escapa: un respaldo restaurado no cuela marcado al papel');
  Q.sello = { codigo: 'A1B2-C3D4-E5F6', folio: folioSello, total: neto() + 5, proyecto: 'Letrero fachada' };
  eq('con otro total el bloque no se imprime: el QR no puede decir «auténtica» de un número que no se firmó', ev(`verificacionHTML(${neto()})`), '');
}

/* ===================================================================================== */
console.log('\n3 · LA CUENTA DE COBRO Y EL IVA: LA TABLA ES LA DE LA HOJA');
{
  const gs = leer('puente/hoja-apps-script.gs');
  const sinFactura = /var CUENTA_SIN_FACTURA\s*=\s*'([^']+)'/.exec(gs)[1];
  const cuentasHoja = new Function('return ' + /var CUENTAS\s*=\s*(\[[^\]]*\])/.exec(gs)[1])();
  const iva = vm.runInNewContext(`var CUENTA_SIN_FACTURA=${JSON.stringify(sinFactura)};` + /function ivaDeCuenta\(cuenta\) \{[\s\S]*?\n\}/.exec(gs)[0] + ';ivaDeCuenta');

  eq('las cinco cuentas del modal son las de la hoja, en su orden', ev('RV_CUENTAS'), cuentasHoja);
  const llevaIva = ev('cuentaLlevaIva');
  const malas = [...cuentasHoja, '  Elias BBVA  ', 'elias bbva', 'Otra', '', null, undefined, 'Constru BNT ']
    .filter(c => (iva(c) === 'Sí') !== llevaIva(c));
  eq('el modal y ivaDeCuenta() de la hoja dicen lo mismo de cada cuenta, de sus variantes y de la basura', malas, []);
  eq('solo una cuenta cobra sin factura', cuentasHoja.filter(c => !llevaIva(c)), [sinFactura]);

  const ord = ev('cuentasOrdenadas');
  eq('con IVA, primero las que llevan IVA, y las cinco siguen ahí', ord(true), ['Constru BNT', 'Moni MPago', 'Rul HSBC', 'Tatis BNT', sinFactura]);
  eq('sin IVA, primero la que cobra sin factura, y el resto en el orden de la hoja', ord(false), [sinFactura, 'Constru BNT', 'Moni MPago', 'Rul HSBC', 'Tatis BNT']);
  eq('el orden no pierde ni repite ninguna', [...ord(true)].sort(), [...cuentasHoja].sort());
  eq('y no toca la lista original', ev('RV_CUENTAS'), cuentasHoja);
  const coincide = ev('cuentaCoincide');
  cierto(coincide(sinFactura, false) && !coincide(sinFactura, true) && coincide('Moni MPago', true) && !coincide('Moni MPago', false),
    'coincide() es la misma pregunta que hace el aviso: ¿esta cuenta deja el IVA como está en el PDF?');
}

console.log(fallas ? `\n${fallas} comprobación(es) con FALLA.` : '\nTodo bien.');
process.exit(fallas ? 1 : 0);
