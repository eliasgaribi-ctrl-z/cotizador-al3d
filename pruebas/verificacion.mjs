/* Lo que alguien teclea desde el papel en verificar.html, y lo que le llega a la hoja.

   El fallo que esto cuida no hace ruido: una cotización BUENA contestando «No auténtica»
   porque el papel decía COT-0042, el campo pedía COT-0042@K7QM, o porque en la letra del PDF
   un 0 y una O son el mismo dibujo. Para quien la recibe es una acusación de falsificación.

   También se comprueba que la regla del código es la MISMA en la página y en el .gs: si una
   convierte la O y la otra no, la página enseña un código «listo» que la hoja rechaza.

   Se corre con pruebas/correr.sh, como todas.
*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V from '../js/datos/verificacion.js';

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + nombre + (ok ? '' : '  → dio ' + JSON.stringify(real) + ', esperaba ' + JSON.stringify(esperado)));
  if (!ok) fallos++;
};

console.log('\nnormalizarFolio — como lo escribió el cotizador');
eq('el completo pasa igual', V.normalizarFolio('COT-0042@K7QM'), 'COT-0042@K7QM');
eq('en minúsculas y con espacios', V.normalizarFolio('  cot-0042 @ k7qm '), 'COT-0042@K7QM');
eq('el guion largo del autocorrector', V.normalizarFolio('COT–0042@K7QM'), 'COT-0042@K7QM');
eq('sin guion, se lo pone', V.normalizarFolio('cot0042'), 'COT-0042');
eq('el corto pasa como corto', V.normalizarFolio('COT-0042'), 'COT-0042');
eq('la parte del aparato no se adivina (0 no se vuelve O)', V.normalizarFolio('COT-0042@D0123'), 'COT-0042@D0123');
eq('vacío da vacío', V.normalizarFolio(null), '');

console.log('\nnormalizarCodigo — doce hexadecimales');
eq('con guiones', V.normalizarCodigo('A1B2-C3D4-E5F6'), 'A1B2C3D4E5F6');
eq('en minúsculas y con espacios', V.normalizarCodigo(' a1b2 c3d4 e5f6 '), 'A1B2C3D4E5F6');
eq('O por 0', V.normalizarCodigo('A1B2-C3D4-E5FO'), 'A1B2C3D4E5F0');
eq('I y L por 1', V.normalizarCodigo('AIB2-C3D4-E5Fl'), 'A1B2C3D4E5F1');
eq('lo que no es hexadecimal se tira', V.normalizarCodigo('A1B2-C3D4-E5F6-ZZ'), 'A1B2C3D4E5F6');
eq('y nunca pasa de doce', V.normalizarCodigo('A1B2C3D4E5F6A1B2'), 'A1B2C3D4E5F6');
eq('codigoLegible lo agrupa como en el papel', V.codigoLegible('a1b2c3d4e5fo'), 'A1B2-C3D4-E5F0');
eq('  incompleto lo deja sin guiones', V.codigoLegible('A1B2C3'), 'A1B2C3');

console.log('\nfaltaParaVerificar — se dice antes de preguntar');
eq('completo: listo', V.faltaParaVerificar('COT-0042@K7QM', 'A1B2-C3D4-E5F6'), null);
eq('el corto también está listo', V.faltaParaVerificar('cot-0042', 'a1b2c3d4e5f6'), null);
eq('sin folio lo dice', typeof V.faltaParaVerificar('', 'A1B2-C3D4-E5F6'), 'string');
eq('sin código lo dice', typeof V.faltaParaVerificar('COT-0042', ''), 'string');
eq('un código corto dice cuántos faltan', V.faltaParaVerificar('COT-0042', 'A1B2-C3D4-E5'), 'Al código le faltan 2 de sus doce caracteres.');
eq('un folio con basura no', typeof V.faltaParaVerificar('COT/0042', 'A1B2-C3D4-E5F6'), 'string');
eq('esFolioCorto: el corto sí', V.esFolioCorto('cot-0042'), true);
eq('esFolioCorto: el completo no', V.esFolioCorto('COT-0042@K7QM'), false);

console.log('\nla página y la hoja normalizan el código igual');
{
  const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
  const gs = readFileSync(join(RAIZ, 'puente', 'hoja-apps-script.gs'), 'utf8');
  const m = /function normalizarCodigo\(c\) \{[\s\S]*?\n\}/.exec(gs);
  eq('el .gs tiene normalizarCodigo', !!m, true);
  if (m) {
    const deLaHoja = new Function(m[0] + '; return normalizarCodigo;')();
    for (const x of ['A1B2-C3D4-E5F6', 'aibz-c3d4-e5fo', ' O0Il-LLLL-ffff ', 'XYZ', '', 'A1B2C3D4E5F6A1B2'])
      eq('  «' + x + '»', V.normalizarCodigo(x), deLaHoja(x));
  }
}

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nLo que se teclea del papel llega como lo escribió el cotizador.');
process.exit(fallos ? 1 : 0);
