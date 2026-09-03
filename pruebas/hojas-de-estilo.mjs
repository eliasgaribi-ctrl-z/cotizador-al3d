/* Un solo sistema de diseño, en una sola hoja.
 *
 * El sistema vive en css/sistema.css y las tres superficies —el cotizador, la plataforma y el
 * anidador— la enlazan. Hasta septiembre de 2026 vivía en el <style> de cotizador.html y la
 * hoja era una COPIA generada que había que regenerar a mano; una copia que nadie comprueba es
 * una copia que se queda atrás, y el fallo no se veía porque cada superficie seguía funcionando
 * con SU versión. Lo que esta prueba vigila ahora es que nadie vuelva a meter un <style> con
 * tokens en cotizador.html: el día que eso pase habrá otra vez dos verdades.
 *
 * Aquí también viven las dos reglas de color que el sistema declara y no cumplía: que el azul de
 * la marca sea UNO, y que ningún token se use sin estar definido —una var() sin definir y sin
 * valor de reserva invalida la declaración entera y la superficie se queda sin fondo, en
 * silencio, que es justo lo que le pasaba a dos piezas de la pantalla de Ajustes.
 *
 * Corre en node y nada más.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let fallas = 0;
const cierto = (cond, que) => {
  console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que);
  if (!cond) fallas++;
};

const html = leer('cotizador.html');
const sistema = leer('css/sistema.css');
const plataforma = leer('css/plataforma.css');

console.log('\nUNA SOLA HOJA, ENLAZADA DESDE LAS TRES SUPERFICIES');
for (const [f, href] of [['cotizador.html', 'css/sistema.css'], ['index.html', 'css/sistema.css'],
                         ['anidador-vectores/index.html', '../css/sistema.css']]) {
  cierto(leer(f).includes('<link rel="stylesheet" href="' + href + '">'), f + ' enlaza ' + href);
}
cierto(!/^<style>$/m.test(html), 'cotizador.html ya no trae un bloque <style> propio: el sistema vive en la hoja');
cierto(/^:root\{/m.test(sistema) && !/^:root\{/m.test(html.replace(/<!--[\s\S]*?-->/g, '')),
  'los tokens se declaran en css/sistema.css y en ningún HTML');
/* El tema se decide antes del primer pintado, así que el guion va en el <head> y antes de la
   hoja; si fuera después, cada apertura en oscuro parpadearía en claro un cuadro. */
for (const [f, src] of [['cotizador.html', 'js/tema.js'], ['index.html', 'js/tema.js'],
                        ['anidador-vectores/index.html', '../js/tema.js']]) {
  const t = leer(f);
  const iTema = t.indexOf('<script src="' + src + '"></script>');
  const iHoja = t.indexOf('rel="stylesheet" href="' + (src.startsWith('../') ? '../' : '') + 'css/sistema.css"');
  cierto(iTema > -1 && iHoja > iTema, f + ' carga js/tema.js antes que la hoja del sistema');
}

console.log('\nNINGÚN TOKEN SE USA SIN EXISTIR');
const definidos = new Set([...sistema.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1])
  .concat([...plataforma.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1])));
/* Los que publica el JS en caliente —el alto de la barra fija, el de los dos acordeones— no
   están en ninguna hoja Y NO PASA NADA, porque los tres se usan con valor de reserva. Lo que no
   puede haber es una var() sin definir Y sin reserva. */
/* Sin comentarios: el del bloque de matices de partida EXPLICA esta misma regla con un `--x` de
   ejemplo, y buscarlo en el texto crudo haría fallar la prueba por su propia explicación. */
for (const [archivo, css] of [['css/sistema.css', sistema], ['css/plataforma.css', plataforma]]) {
  const huerfanos = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/var\((--[a-z0-9-]+)\s*\)/g)]
    .map(m => m[1]).filter(t => !definidos.has(t));
  cierto(huerfanos.length === 0,
    `${archivo} no usa ningún token inexistente sin reserva${huerfanos.length ? ': ' + [...new Set(huerfanos)].join(', ') : ''}`);
}

console.log('\nUN SOLO AZUL DE MARCA');
/* #3a4ad8 era un cuarto azul: ni --a (#4060f8) ni --a-fuerte (#3018f8) ni el del logotipo. Vivía
   en 16 sitios de index.html, en 24 rgba() escritos a mano, en los dos webmanifest y en el
   theme-color de las dos apps — o sea que el color que se veía no era el que el sistema
   declaraba. Se comprueba fuera de los comentarios, que sí lo nombran para contar la historia. */
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
for (const [archivo, t] of [['cotizador.html', html], ['index.html', leer('index.html')],
                            ['css/sistema.css', sistema], ['css/plataforma.css', plataforma]]) {
  const n = (sinComentarios(t).match(/#3a4ad8/gi) || []).length;
  cierto(n === 0, `${archivo} ya no escribe #3a4ad8 (${n})`);
  const r = (sinComentarios(t).match(/rgba\(\s*58\s*,\s*74\s*,\s*216/g) || []).length;
  cierto(r === 0, `${archivo} ya no escribe ese azul como rgba a mano (${r})`);
}
cierto(/--a-rgb:\s*64,96,248/.test(sistema), 'el triplete del azul vive una sola vez, en --a-rgb');
cierto(/--pc-rgb:\s*var\(--a-rgb\)/.test(sistema), 'y --pc-rgb sale de él en vez de repetirlo');

/* Un <meta> y un .webmanifest no entienden var(), así que ahí el número se repite a la fuerza.
   Lo que sí se puede exigir es que repita el número BUENO. */
const a = (sistema.match(/--a:\s*(#[0-9a-f]{6})/i) || [])[1];
cierto(!!a, 'el sistema declara --a');
for (const f of ['cotizador.html', 'index.html', 'anidador-vectores/index.html', 'manifest.webmanifest', 'manifest-plataforma.webmanifest']) {
  const t = leer(f);
  const m = [...t.matchAll(/theme[-_]color"?[^#]*(#[0-9a-f]{6})/gi)].map(x => x[1].toLowerCase());
  cierto(m.length > 0 && m.every(v => v === a), `${f} declara el color de tema igual que --a (${m.join(', ') || 'ninguno'})`);
}
/* js/tema.js reescribe ese <meta> al cambiar de tema: en claro tiene que volver a --a, y en
   oscuro al fondo oscuro del sistema, que es lo que pinta la barra del navegador. */
const tema = leer('js/tema.js');
cierto(tema.includes("claro: '" + a + "'"), 'js/tema.js pone el mismo azul de tema en claro');
const fondoOscuro = (sistema.match(/html\[data-tema="oscuro"\]\s*\{[^}]*--n1:\s*(#[0-9a-f]{6})/i) || [])[1];
cierto(!!fondoOscuro && tema.includes("oscuro: '" + fondoOscuro + "'"),
  'y en oscuro el color de tema es el fondo --n1 del tema oscuro (' + (fondoOscuro || '¿?') + ')');
const manifiestos = ['manifest.webmanifest', 'manifest-plataforma.webmanifest'].map(f => JSON.parse(leer(f)));
cierto(manifiestos[0].id === manifiestos[1].id && manifiestos[0].start_url === manifiestos[1].start_url,
  'los dos manifiestos describen la MISMA app (mismo id, mismo start_url): una sola PWA, una sola puerta');
cierto(manifiestos[0].start_url === './#/hoy', 'y la app instalada abre en el Tablero, no en el cotizador');

console.log('\nEL DOCUMENTO DEL CLIENTE HABLA EL MISMO IDIOMA');
/* El <style> del documento generado vive en el generador de PDF, js/cotizador/entrega.js. */
const doc = leer('js/cotizador/entrega.js');
cierto(/--brand:#3018f8/.test(doc), 'su azul de marca es --a-fuerte, no un cuarto azul');
cierto(/color-scheme:only light/.test(doc),
  'declara color-scheme:only light, o el auto-oscuro de Android invierte a medias lo que ve el cliente');
cierto(doc.includes("font-family:'Inter','Segoe UI',Roboto,Helvetica,Arial"),
  'y se pone en la misma tipografía que la app, con la misma reserva');

console.log('\nLOS FINALES DE LA PLATAFORMA TAMBIÉN SON PAPEL DE AL3D');
cierto(/@page\{size:letter portrait/.test(plataforma), 'la plataforma imprime en carta vertical');
cierto(/@page\{size:letter portrait\}/.test(sistema), 'y el Ctrl+P sobre la app, también');
cierto(/\.imp-marca\{display:flex!important/.test(plataforma), 'sus impresos llevan encabezado de marca');
cierto(/\.imp-pie\{display:flex!important/.test(plataforma), 'y pie');
cierto(leer('index.html').includes('class="imp-logo" src="logo-al3d.svg"'),
  'con el MISMO archivo de logotipo que la barra de las dos apps');

console.log(`\n${fallas === 0 ? 'Un solo sistema de diseño, en las tres superficies.' : fallas + ' fallo(s).'}`);
process.exit(fallas ? 1 : 0);
