/* LA LETRA DEL FOLIO.
 *
 * El contador de cotizaciones es de cada teléfono: dos aparatos le daban el mismo COT-0042 a
 * dos clientes. Desde el 1 de octubre de 2026 el folio impreso lleva la letra del teléfono
 * (COT-0042-B). La regla vive dos veces —js/datos/prefs.js para la plataforma y
 * js/cotizador/entrega.js para el cotizador, que no importa módulos— y esta prueba comprueba
 * las dos: si una cambia y la otra no, Ajustes enseñaría una letra y el papel otra.
 *
 * Uso: node pruebas/letra-del-folio.mjs   (o pruebas/correr.sh, que corre todas)
 */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

const Prefs = await import('../js/datos/prefs.js');

console.log('\nLA PLATAFORMA');
mem.set('al3d_pf_disp', '7K3Q');
eq('sale de la primera LETRA del id, no del primer carácter', Prefs.letraFolio(), 'K');
eq('y se queda guardada', mem.get('al3d_pf_letra_folio'), 'K');
eq('se cambia a otra letra, en mayúscula', [Prefs.setLetraFolio('b'), Prefs.letraFolio()], [true, 'B']);
eq('un dígito no es letra de folio', [Prefs.setLetraFolio('7'), Prefs.letraFolio()], [false, 'B']);
eq('dos letras tampoco', [Prefs.setLetraFolio('AB'), Prefs.letraFolio()], [false, 'B']);
mem.clear(); mem.set('al3d_pf_disp', '2345');
eq('un id sin letras cae en la A', Prefs.letraFolio(), 'A');

console.log('\nEL COTIZADOR');
/* Lo que el cotizador necesita de entrega.js e historial.js, sacado del archivo tal cual: sin
   copiar la regla aquí, que es justo lo que se quiere vigilar. */
const src = f => readFileSync(new URL('../js/cotizador/' + f, import.meta.url), 'utf8');
const trozo = (txt, desde, hasta) => { const i = txt.indexOf(desde); return txt.slice(i, txt.indexOf(hasta, i)); };
const entrega = src('entrega.js'), historial = src('historial.js');
const codigo =
  'function prefGet(k,def=""){ const v=localStorage.getItem(k); return v===null?def:v; }\n' +
  'function prefSet(k,v){ localStorage.setItem(k,String(v)); }\n' +
  trozo(entrega, "const DISP_KEY=", '/* ===================== Los hitos de la entrega') +
  trozo(historial, "const FOLIO_PREFIJO=", 'function folioConfirmados(){') +
  'globalThis.r={letraFolio,folioFmt,folioNum};';
const caja = { localStorage, crypto: globalThis.crypto };
vm.runInNewContext(codigo, caja);
const { letraFolio, folioFmt, folioNum } = caja.r;

mem.clear(); mem.set('al3d_pf_disp', '7K3Q');
eq('la misma letra que la plataforma', letraFolio(), 'K');
eq('el folio la lleva al final', folioFmt(42), 'COT-0042-K');
mem.set('al3d_pf_letra_folio', 'B');
eq('la que se eligió en Ajustes manda', folioFmt(7), 'COT-0007-B');
eq('el número se sigue leyendo con letra', folioNum('COT-0042-B'), 42);
eq('y sin ella, los folios de antes', folioNum('COT-0041'), 41);
eq('y con el aparato pegado', folioNum('COT-0042-B@K7QM'), 42);
mem.set('al3d_pf_letra_folio', 'x9');
eq('una letra guardada rota se rehace desde el id', letraFolio(), 'K');

console.log('\n' + bien + ' bien, ' + mal + ' mal');
if (mal) process.exit(1);
console.log('La letra del folio sale igual en la plataforma y en el papel.');
