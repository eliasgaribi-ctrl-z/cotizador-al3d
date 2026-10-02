/* LA CUENTA DE LA VIGENCIA Y LOS FILTROS DEL HISTORIAL, SIN PANTALLA.

   Dos cosas del historial son aritmética pura y se pueden equivocar sin que se vea —sale un número
   plausible—, así que se prueban aquí y no solo en el navegador:

   · LA VIGENCIA DE 10 DÍAS (función 33). Son días NATURALES entre medianoches LOCALES: autorizada
     el 22, el día 22 quedan 10, el 2 queda 0 («vence hoy») y el 3 está vencida. Se resta con
     `Math.round` y no con `floor`, porque un cambio de horario hace días de 23 y de 25 horas: con
     `floor` una cotización autorizada el 28 de octubre en Nueva York «vencía» un día antes. Se
     prueba en México (donde hoy no hay cambio de horario) y en Nueva York (donde sí). La cuenta
     sale de `e.ts`, que es un número, y de `e.reenviada` si es más nueva: el reenvío con fecha
     nueva NO mueve `ts`, que es la autorización y la lee también la plataforma.
   · LAS FICHAS DE «LO QUE FALTA» (H8): qué cuenta cada una —Sin PDF, Sin enviar, Sin venta, Este
     mes— y cuántas hay de cada tipo.

   Las funciones se leen del TEXTO de js/cotizador/historial.js y se evalúan en un contexto
   aparte, como hace pruebas/replicas.mjs: ese archivo es un guion clásico que engancha la pantalla
   al cargarse y no se puede importar.

   Uso:  node pruebas/cot-historial.mjs */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) bien(que); else mal(que + '\n      dio: ' + a + '\n      esp: ' + b);
};

const fuente = readFileSync(new URL('../js/cotizador/historial.js', import.meta.url), 'utf8');

/* `function nombre(...){...}` completo, contando llaves y saltándose cadenas, plantillas y
   comentarios (los guiones traen llaves dentro de textos). */
function funcion(nombre) {
  const ini = fuente.indexOf('function ' + nombre + '(');
  if (ini < 0) throw new Error('no está function ' + nombre);
  let i = fuente.indexOf('{', ini), prof = 0;
  for (; i < fuente.length; i++) {
    const c = fuente[i], s = fuente[i + 1];
    if (c === '/' && s === '/') { i = fuente.indexOf('\n', i); continue; }
    if (c === '/' && s === '*') { i = fuente.indexOf('*/', i) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      for (i++; i < fuente.length && fuente[i] !== c; i++) if (fuente[i] === '\\') i++;
      continue;
    }
    if (c === '{') prof++;
    if (c === '}' && --prof === 0) return fuente.slice(ini, i + 1);
  }
  throw new Error('function ' + nombre + ' no cierra');
}
const linea = re => { const m = re.exec(fuente); if (!m) throw new Error('no está ' + re); return m[0]; };
/* La constante HIST_FILTROS: de `const HIST_FILTROS=[` al primer `];` que la cierra. */
const filtros = (() => {
  const a = fuente.indexOf('const HIST_FILTROS=[');
  if (a < 0) throw new Error('no está HIST_FILTROS');
  return fuente.slice(a, fuente.indexOf('\n];', a) + 3);
})();

const codigo = [
  linea(/const VIG_DIAS=[^;]+;/),
  funcion('medianocheLocal'), funcion('vigenciaDe'), funcion('vigFecha'), funcion('vigenciaTexto'),
  funcion('enEsteMes'), funcion('histCuentas'), filtros,
].join('\n');
const ctx = vm.createContext({ Date, Math, JSON, String, Number, isFinite });
vm.runInContext(codigo, ctx);
const correr = (expr) => vm.runInContext(expr, ctx);

const DIA = 864e5;

/* ----- La vigencia, en México ----- */
process.env.TZ = 'America/Mexico_City';
console.log('\nLA VIGENCIA DE 10 DÍAS · MÉXICO');
{
  /* «Ahora» fijo —el 30 de septiembre de 2026, 15:00 hora de México— y cada cotización a N días
     de distancia, con la hora del día cambiada a propósito para que se vea que cuenta días y no
     horas. */
  const ahora = new Date(2026, 8, 30, 15, 0).getTime();
  const haceDias = (n, h = 8) => { const d = new Date(2026, 8, 30 - n, h, 0); return d.getTime(); };
  const v = (n, extra = {}) => correr(`vigenciaDe(${JSON.stringify({ ts: haceDias(n), ...extra })},${ahora})`);
  eq('autorizada hoy: quedan 10 y está vigente', [v(0).quedan, v(0).estado], [10, 'ok']);
  eq('a los 6 días quedan 4 y sigue verde', [v(6).quedan, v(6).estado], [4, 'ok']);
  eq('a los 7 días quedan 3 y pasa a ámbar (3 o menos)', [v(7).quedan, v(7).estado], [3, 'av']);
  eq('a los 10 días queda 0: vence hoy, todavía ámbar', [v(10).quedan, v(10).estado], [0, 'av']);
  eq('a los 11 días ya está vencida, en rojo', [v(11).quedan, v(11).estado], [-1, 'mal']);
  eq('a los 30 días sigue vencida y cuenta bien', [v(30).quedan, v(30).estado], [-20, 'mal']);
  /* Contar días y no horas: autorizada a las 23:59 de ayer, hoy es el día 1, aunque solo hayan
     pasado dos minutos. */
  const casiMedianoche = new Date(2026, 8, 29, 23, 59).getTime(), pasadoMedianoche = new Date(2026, 8, 30, 0, 1).getTime();
  eq('dos minutos después de la medianoche ya es otro día', correr(`vigenciaDe({ts:${casiMedianoche}},${pasadoMedianoche}).quedan`), 9);
  eq('y a las 8 de la mañana contra las 23:59 de ese mismo día, es el mismo día',
    correr(`vigenciaDe({ts:${new Date(2026, 8, 30, 23, 59).getTime()}},${new Date(2026, 8, 30, 8, 0).getTime()}).quedan`), 10);
  /* Un reloj atrasado no regala días. */
  eq('una autorización «en el futuro» no pasa de 10', correr(`vigenciaDe({ts:${ahora + 5 * DIA}},${ahora}).quedan`), 10);
  /* La fecha de vencimiento: autorizada el 22, vence el 2. */
  const el22 = new Date(2026, 8, 22, 11, 0).getTime();
  const venc = new Date(correr(`vigenciaDe({ts:${el22}},${ahora}).vence`));
  eq('autorizada el 22 de septiembre, vence el 2 de octubre', [venc.getMonth(), venc.getDate()], [9, 2]);
  /* Lo reenviado: manda el sello más nuevo, y `ts` no se toca. */
  const e = { ts: haceDias(12), reenviada: haceDias(2) };
  eq('reenviada hace 2 días con ts de hace 12: cuenta desde el reenvío', [correr(`vigenciaDe(${JSON.stringify(e)},${ahora}).quedan`)], [8]);
  eq('una autorización nueva deja atrás un reenvío viejo', correr(`vigenciaDe(${JSON.stringify({ ts: haceDias(1), reenviada: haceDias(9) })},${ahora}).quedan`), 9);
  /* Las entradas viejas del historial no traen ni ts: no se inventa una fecha. */
  eq('sin ts ni reenviada no hay vigencia que mostrar', correr(`vigenciaDe({},${ahora})`), null);
  eq('un ts que no es número tampoco', correr(`vigenciaDe({ts:'27 ago 2026'},${ahora})`), null);
}

/* ----- La vigencia, con cambio de horario ----- */
console.log('\nLA VIGENCIA DE 10 DÍAS · NUEVA YORK (CAMBIO DE HORARIO)');
process.env.TZ = 'America/New_York';
{
  /* El domingo 1 de noviembre de 2026 los relojes se atrasan: ese día dura 25 horas. Del 28 de
     octubre al mediodía al 7 de noviembre al mediodía pasan 241 horas —10 días y una hora—, y
     dividir entre 24 y truncar daría 10 días con 1 hora de sobra en un sentido y 9 días en el otro
     según la hora del día. Contados por medianoches locales son exactamente 10. */
  const ts = new Date(2026, 9, 28, 12, 0).getTime(), ahora = new Date(2026, 10, 7, 12, 0).getTime();
  eq('atrasar el reloj no cambia el día: del 28 de oct al 7 de nov son 10 días, quedan 0',
    correr(`vigenciaDe({ts:${ts}},${ahora}).quedan`), 0);
  /* De las 00:30 del 28 de octubre a las 23:30 del 6 de noviembre hay casi 10 días de reloj, pero solo 9 de calendario. */
  const t2 = new Date(2026, 9, 28, 0, 30).getTime(), n2 = new Date(2026, 10, 6, 23, 30).getTime();
  eq('casi 10 días de reloj pero 9 de calendario: quedan 1', correr(`vigenciaDe({ts:${t2}},${n2}).quedan`), 1);
  /* El 8 de marzo de 2026 los relojes se adelantan: ese día dura 23 horas. */
  const t3 = new Date(2026, 2, 1, 12, 0).getTime(), n3 = new Date(2026, 2, 11, 12, 0).getTime();
  eq('adelantar el reloj tampoco: del 1 al 11 de marzo son 10 días, quedan 0', correr(`vigenciaDe({ts:${t3}},${n3}).quedan`), 0);
  const v = new Date(correr(`vigenciaDe({ts:${t3}},${n3}).vence`));
  eq('y el vencimiento cae en el día 11 a medianoche local aunque haya cambio de horario', [v.getMonth(), v.getDate(), v.getHours()], [2, 11, 0]);
}
process.env.TZ = 'America/Mexico_City';

/* ----- Lo que dicen las palabras ----- */
console.log('\nLO QUE DICE CADA ESTADO');
{
  const ahora = new Date(2026, 8, 30, 15, 0).getTime();
  const txt = n => correr(`vigenciaTexto(vigenciaDe({ts:${new Date(2026, 8, 30 - n, 9, 0).getTime()}},${ahora}))`);
  eq('vigente: la palabra y los días que quedan', txt(2).titulo + ' | ' + txt(2).detalle.split(' · ')[0], 'Vigente | Vence en 8 días');
  eq('por vencer, en plural', txt(8).titulo + ' | ' + txt(8).detalle.split(' · ')[0], 'Por vencer | Vence en 2 días');
  eq('por vencer, mañana', txt(9).titulo + ' | ' + txt(9).detalle.split(' · ')[0], 'Por vencer | Vence mañana');
  eq('el último día, «vence hoy» y sin fecha repetida', txt(10).titulo + ' | ' + txt(10).detalle, 'Por vencer | Vence hoy');
  eq('vencida hace un día, en singular', txt(11).titulo + ' | ' + txt(11).detalle.split(' · ')[0], 'Vencida | Hace 1 día');
  eq('vencida hace varios, en plural', txt(15).detalle.split(' · ')[0], 'Hace 5 días');
  eq('el color nunca va solo: los tres estados dicen una palabra distinta', new Set([txt(2).titulo, txt(8).titulo, txt(11).titulo]).size, 3);
}

/* ----- Las fichas ----- */
console.log('\nLAS FICHAS DE «LO QUE FALTA»');
{
  const ahora = new Date(2026, 8, 30, 15, 0).getTime();
  const en = (dia, mes = 8) => new Date(2026, mes, dia, 10, 0).getTime();
  /* _h son los hitos que indexarHistorial deja en cada entrada: 0 es «no se hizo». */
  const datos = [
    { folio: 'A', ts: en(29), _h: { pdf: 1, wa: 1, venta: 1 } },   // completa y de este mes
    { folio: 'B', ts: en(20), _h: { pdf: 1, wa: 0, venta: 0 } },   // PDF sí, WhatsApp no, sin venta
    { folio: 'C', ts: en(3),  _h: { pdf: 0, wa: 0, venta: 0 } },   // no se hizo nada
    { folio: 'D', ts: en(30, 7), _h: { pdf: 1, wa: 1, venta: 0 } }, // del mes pasado
    { folio: 'E', _h: { pdf: 0, wa: 0, venta: 0 } },               // vieja: sin fecha
  ];
  const cuentas = correr(`histCuentas(${JSON.stringify(datos)},${ahora})`);
  eq('Todas cuenta todo', cuentas.todas, 5);
  eq('Sin PDF: C y E', cuentas.sinpdf, 2);
  eq('Sin enviar: B, C y E (no abrió el chat de WhatsApp)', cuentas.sinenv, 3);
  eq('Sin venta: B, C, D y E', cuentas.sinventa, 4);
  eq('Este mes: A, B y C; una sin fecha no cuenta como de este mes', cuentas.mes, 3);
  /* El mes es del reloj de aquí: las once de la noche del último día no son del mes que entra. */
  const tarde = new Date(2026, 9, 31, 23, 0).getTime(), pasada = new Date(2026, 10, 1, 0, 30).getTime();
  eq('31 de octubre a las 23:00 no es «este mes» el 1 de noviembre', correr(`enEsteMes(${tarde},${pasada})`), false);
  eq('1 de noviembre a las 00:30 sí lo es el 30 de noviembre', correr(`enEsteMes(${pasada},${new Date(2026, 10, 30, 12, 0).getTime()})`), true);
  eq('un mes igual de otro año no cuenta', correr(`enEsteMes(${new Date(2025, 8, 15).getTime()},${ahora})`), false);
  eq('sin ts no hay mes', correr(`enEsteMes(undefined,${ahora})`), false);
  /* Los ids son los de las fichas: la pantalla los usa para pintar y para filtrar. */
  eq('las cinco fichas, en el orden en que se leen', correr('HIST_FILTROS.map(f=>f.id)'), ['todas', 'sinpdf', 'sinenv', 'sinventa', 'mes']);
  eq('y todas se llaman con las palabras de la pantalla', correr('HIST_FILTROS.map(f=>f.texto)'), ['Todas', 'Sin PDF', 'Sin enviar', 'Sin venta', 'Este mes']);
}

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nTodo pasa.');
process.exit(fallos ? 1 : 0);
