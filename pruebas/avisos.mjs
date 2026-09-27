/* LA PILA DE AVISOS DEL COTIZADOR: QUÉ SE QUEDA A LA VISTA CUANDO LLEGAN VARIOS.

   Había un solo #toast, y el segundo aviso reescribía al primero en el mismo tick. No da error
   ni pinta nada raro: el aviso que importaba simplemente no se ve. Dos casos reales, los dos
   de la auditoría de septiembre de 2026:

     · aplicarSello() avisa «el total no es el que selló la hoja» y en la línea siguiente
       avisoDelNotario('✓ … autorizó') lo tapaba. Es el aviso que impide mandar un PDF con un
       total y un QR con otro.
     · registrar la venta encadena «Mandando…», «Venta registrada» con «Abrir plataforma» y
       «No se escribió: …»: el botón se iba debajo del error.

   Aquí se evalúan avisosAcomodar() y avisosQuitar() tal como están en js/cotizador/nucleo.js
   —sin DOM: son la decisión, no el dibujo— en un contexto de node:vm.

   Se corre con pruebas/correr.sh, como todas. */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + nombre + (ok ? '' : '  → dio ' + JSON.stringify(real) + ', esperaba ' + JSON.stringify(esperado)));
  if (!ok) fallos++;
};

const nucleo = readFileSync(new URL('../js/cotizador/nucleo.js', import.meta.url), 'utf8');
const ini = nucleo.indexOf('const AVISOS_A_LA_VISTA'), fin = nucleo.indexOf('function _avisoProgramar(');
if (ini < 0 || fin < ini) { console.log('  ✗ no se encontró la pila de avisos en nucleo.js'); process.exit(1); }
const ctx = vm.createContext({});
vm.runInContext(nucleo.slice(ini, fin) + '\nthis.A={avisosAcomodar,avisosQuitar,avisoPrioridad,AVISOS_A_LA_VISTA};', ctx);
const { avisosAcomodar, avisosQuitar, avisoPrioridad, AVISOS_A_LA_VISTA } = ctx.A;

/* Los avisos como los arma toast(): {msg, type, dur, accion}. */
const info = msg => ({ msg, type: '', dur: 2600, accion: null });
const ok = msg => ({ msg, type: 'ok', dur: 2600, accion: null });
const err = msg => ({ msg, type: 'err', dur: 7000, accion: null });
const conBoton = (msg, label, type = 'ok') => ({ msg, type, dur: 8000, accion: { label, fn() {} } });
const msgs = l => l.map(a => a.msg);
/* Llegan en orden, como en el código: cada toast() ve lo que dejó el anterior. */
function llegan(...avisos) {
  let vis = [], espera = [], pasos = [];
  for (const a of avisos) { const r = avisosAcomodar(vis, espera, a); vis = r.vis; espera = r.espera; pasos.push(r.paso); }
  return { vis, espera, pasos };
}

console.log('\nLA PRIORIDAD — error > con botón > informativo');
eq('un error pesa más que todo', avisoPrioridad(err('x')), 3);
eq('un aviso con botón, aunque sea verde, pesa más que un informativo', avisoPrioridad(conBoton('x', 'Abrir')), 2);
eq('un ✓ sin botón es informativo', avisoPrioridad(ok('x')), 1);
eq('caben dos a la vista', AVISOS_A_LA_VISTA, 2);

console.log('\nEL SELLO — el error no se pierde debajo del «autorizó»');
{
  const r = llegan(err('El total de este teléfono no es el que selló la hoja'), ok('✓ Dirección autorizó COT-0042'));
  eq('los dos se quedan a la vista', msgs(r.vis), ['El total de este teléfono no es el que selló la hoja', '✓ Dirección autorizó COT-0042']);
  eq('  el segundo se agrega, no reemplaza', r.pasos, ['agrega', 'agrega']);
  const r2 = llegan(err('El total no es el que selló la hoja'), ok('✓ autorizó'), ok('Guardado'));
  eq('un tercer informativo reemplaza al informativo, nunca al error', msgs(r2.vis), ['El total no es el que selló la hoja', 'Guardado']);
}

console.log('\nLA VENTA — «Abrir plataforma» no se va debajo del aviso siguiente');
{
  const r = llegan(info('Mandando la venta a la hoja…'), conBoton('Venta registrada en la hoja — V-042', 'Abrir plataforma'),
    err('No se escribió: Anticipo — este teléfono no tiene permiso para esos campos'));
  eq('«Mandando…» cede su lugar a «Venta registrada»', r.pasos, ['agrega', 'reemplaza', 'agrega']);
  eq('se ven el botón y el error', msgs(r.vis), ['Venta registrada en la hoja — V-042', 'No se escribió: Anticipo — este teléfono no tiene permiso para esos campos']);
}

console.log('\nLOS QUE NO SE PISAN ESPERAN');
{
  const r = llegan(err('uno'), conBoton('dos', 'Deshacer', ''), err('tres'));
  eq('con dos importantes a la vista, el tercero espera', r.pasos, ['agrega', 'agrega', 'espera']);
  eq('  y los de la vista no se tocan', msgs(r.vis), ['uno', 'dos']);
  eq('  el que espera, espera', msgs(r.espera), ['tres']);
  const q = avisosQuitar(r.vis, r.espera, 0);
  eq('al irse uno, entra el que esperaba', msgs(q.vis), ['dos', 'tres']);
  eq('  y lo dice', q.entra && q.entra.msg, 'tres');
  eq('  la espera queda vacía', q.espera.length, 0);
  const r2 = llegan(err('uno'), err('dos'), ok('informativo'));
  eq('un informativo con dos importantes a la vista no se pinta (lo dice la voz)', r2.pasos[2], 'descarta');
  eq('  y no espera', r2.espera.length, 0);
  const r3 = llegan(err('a'), err('b'), conBoton('con botón', 'Abrir'), err('error después'));
  eq('en la espera, el error va antes que el botón aunque llegó después', msgs(r3.espera), ['error después', 'con botón']);
  const r4 = llegan(err('a'), err('b'), err('c'), err('d'), err('e'), err('f'), err('g'));
  eq('la espera tiene tope', r4.espera.length, 4);
  const r5 = llegan(err('a'), err('b'), err('c'), err('c'));
  eq('el mismo aviso no espera dos veces', msgs(r5.espera), ['c']);
}

console.log('\nEL MISMO AVISO OTRA VEZ — no vuelve a entrar');
{
  const r = llegan(conBoton('Partida 3 eliminada', 'Deshacer', ''), conBoton('Partida 3 eliminada', 'Deshacer', ''));
  eq('se repite en su lugar', r.pasos, ['agrega', 'repite']);
  eq('  sigue siendo uno', r.vis.length, 1);
  const r2 = llegan(info('Guardado'), info('Guardado'));
  eq('un informativo repetido tampoco se duplica', [r2.pasos, r2.vis.length], [['agrega', 'repite'], 1]);
}

console.log('\nNADA SE MUTA — la decisión devuelve listas nuevas');
{
  const vis = [err('a')], espera = [];
  avisosAcomodar(vis, espera, ok('b'));
  eq('la lista de la vista que entró no cambió', vis.length, 1);
  avisosQuitar(vis, espera, 0);
  eq('  ni al quitar', vis.length, 1);
}

console.log('\nEL CÓDIGO QUE PINTA — lo que no se ve en la decisión');
eq('voz() junta los mensajes del mismo fotograma en vez de quedarse con el último', /_vozPend\[id\]\.push\(msg\)/.test(nucleo), true);
eq('toast() sigue anunciando cada aviso, también el que espera o se descarta', /\n  voz\(msg\+\(accion&&accion\.label\?' — '\+accion\.label\+' disponible':''\),type==='err'\);\r?\n\}/.test(nucleo), true);

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nNingún aviso que importa se queda debajo de otro.');
process.exit(fallos ? 1 : 0);
