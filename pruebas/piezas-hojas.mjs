/* LA SECCIÓN 2 DE js/piezas.js, EN LO QUE SE PUEDE PROBAR SIN PANTALLA.
 *
 * Las piezas de hojas, listas y transiciones deciden cosas con números antes de mover nada, y
 * esas decisiones son justo las que no se ven cuando fallan: si una hoja de 200 px necesita 90
 * para cerrarse, nadie la cierra nunca y nadie sabe por qué; si «hacia arriba» no tiene tope, la
 * hoja se despega de su borde; si la fila deslizable confunde el umbral, cada deslizón de más
 * avanza un proyecto de etapa. Aquí se prueban esas cuentas, el HTML que generan las piezas para
 * las pantallas que pintan con innerHTML (escapado, mudo donde tiene que serlo), y tres cosas de
 * forma que se rompen en silencio:
 *
 *   · que js/piezas.js se carga en node SIN window y no truena —lo leen otras pruebas—;
 *   · que la hoja que se baja con el dedo vive UNA vez: las dos apps la cuelgan y ya no traen
 *     su copia (eran dos, con el mismo defecto del velo);
 *   · que el estilo de la sección vive en su bloque de sistema.css, y su apagado para menos
 *     movimiento en el suyo, con ::details-content por su nombre (el comodín no lo alcanza).
 *
 * Las piezas en sí, con ratón, dedo y teclado, están en pruebas/navegador/piezas-hojas.mjs.
 *
 * Uso: node pruebas/piezas-hojas.mjs   (o pruebas/correr.sh, que corre todas)
 */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => readFileSync(join(RAIZ, f), 'utf8');
let fallas = 0;
const cierto = (cond, que) => { console.log((cond ? '  ok   ' : '  FALLA') + ' · ' + que); if (!cond) fallas++; };
const igual = (dio, esp, que) => cierto(JSON.stringify(dio) === JSON.stringify(esp), que + (JSON.stringify(dio) === JSON.stringify(esp) ? '' : ' — dio ' + JSON.stringify(dio) + ', se esperaba ' + JSON.stringify(esp)));

const fuente = leer('js/piezas.js');

console.log('\nSE CARGA EN NODE SIN window');
{
  const ctx = vm.createContext({ console });
  let error = null;
  try { vm.runInContext(fuente, ctx, { filename: 'js/piezas.js' }); } catch (e) { error = e; }
  cierto(!error, 'js/piezas.js corre en un contexto sin window ni document' + (error ? ': ' + error.message : ''));
  cierto(vm.runInContext('typeof Piezas', ctx) === 'undefined', 'y no deja nada colgado: sin documento no hay piezas');
}

/* Un documento que dice que sí a todo: cualquier propiedad es otra vez él, y llamarlo también.
   Basta para que las cuatro secciones corran su arranque sin pantalla —cada una cuelga oyentes y
   pregunta por medios—, y así las funciones puras de la sección 2 quedan a mano. */
const nada = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'length' ? 0 : nada),
  apply: () => nada, construct: () => nada, set: () => true,
});
const win = { document: nada, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  addEventListener() {}, removeEventListener() {}, requestAnimationFrame: f => setTimeout(f, 0), setTimeout, clearTimeout,
  getComputedStyle: () => nada, innerWidth: 360, innerHeight: 780, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const ventana = new Proxy(win, { get: (t, k) => (k in t ? t[k] : k === 'Piezas' ? undefined : nada), set: (t, k, v) => { t[k] = v; return true; } });
const ctx = vm.createContext({ window: ventana, console, setTimeout, clearTimeout });
let errCarga = null;
try { vm.runInContext(fuente, ctx, { filename: 'js/piezas.js' }); } catch (e) { errCarga = e; }
cierto(!errCarga, 'con un documento de mentiras, las cuatro secciones arrancan sin tronar' + (errCarga ? ': ' + errCarga.message : ''));
const P = win.Piezas || {};

console.log('\n13 · LA HOJA DEL TELÉFONO');
igual(P.hojaResistencia(40), 40, 'hacia abajo, la hoja va con el dedo píxel por píxel');
igual(P.hojaResistencia(-10), -2, 'hacia arriba cede 0,2 por píxel');
igual(P.hojaResistencia(-400), -12, 'y nunca más de 12 px: la hoja no se despega de su borde');
igual(P.hojaResistencia(-400, 20), -20, 'el tope se puede pedir');
igual(P.hojaVelocidad([[0, 0], [100, 22]]), 0.22, 'la velocidad es la del tramo: 22 px en 100 ms son 0,22 px/ms');
igual(P.hojaVelocidad([[5, 10]]), 0, 'con un solo punto no hay velocidad');
igual(P.hojaVelocidad([]), 0, 'ni sin puntos');
cierto(P.hojaSeCierra({ dy: 91, v: 0 }), '91 px despacio cierra (umbral de 90)');
cierto(!P.hojaSeCierra({ dy: 89, v: 0.05 }), '89 px despacio no cierra');
cierto(P.hojaSeCierra({ dy: 30, v: 0.2 }), 'un latigazo de 30 px a 0,2 px/ms cierra');
cierto(!P.hojaSeCierra({ dy: 10, v: 0.9 }), 'pero un temblor de 10 px, por rápido que sea, no');
cierto(P.hojaSeCierra({ dy: 81, v: 0, alto: 200 }), 'en una hoja de 200 px basta el 40 %: 81 px');
cierto(!P.hojaSeCierra({ dy: 79, v: 0, alto: 200 }), 'y 79 no');
cierto(!P.hojaSeCierra({ dy: 89, v: 0, alto: 800 }), 'en una hoja alta el umbral sigue siendo 90, no 320');
cierto(!P.hojaSeCierra({ dy: -12, v: 0.5 }), 'hacia arriba nunca cierra');
cierto(typeof P.hojasDeslizables === 'function' && P.hojasDeslizables({ hoja: '.x' }) === null, 'sin función de cierre, la pieza no cuelga nada');

console.log('\n10 · BORDES QUE SE DESVANECEN');
igual(P.bordesDe(0, 900, 360), { antes: false, despues: true }, 'al principio de una fila de 900 en 360: solo el borde de después');
igual(P.bordesDe(540, 900, 360), { antes: true, despues: false }, 'al final: solo el de antes');
igual(P.bordesDe(200, 900, 360), { antes: true, despues: true }, 'a medio camino: los dos');
igual(P.bordesDe(1, 900, 360), { antes: false, despues: true }, 'un píxel de redondeo no enciende el borde');
igual(P.bordesDe(0, 360, 360), { antes: false, despues: false }, 'si todo cabe, ninguno');

console.log('\n9 · EL RENGLÓN QUE SE DESLIZA');
const f = o => P.filaDecide(Object.assign({ anchoAcc: 152, anchoFila: 340, principal: true, umbral: 0.4 }, o));
igual(f({ dx: 140 }), 'principal', 'a la derecha, pasado el 40 % del renglón (136 de 340), corre la principal');
igual(f({ dx: 120 }), 'cerrada', 'antes del umbral, regresa');
igual(f({ dx: 50, v: 0.8 }), 'principal', 'o con un latigazo, habiendo recorrido 40 px');
igual(f({ dx: 30, v: 0.9 }), 'cerrada', 'pero no con un temblor');
igual(f({ dx: 100, principal: false }), 'cerrada', 'sin acción principal, a la derecha no hace nada');
igual(f({ dx: 60, anchoFila: 120 }), 'cerrada', 'en un renglón angosto el umbral no baja de 72 px');
igual(f({ dx: -80 }), 'abierta', 'a la izquierda, pasada la mitad de las acciones (76 de 152), se queda abierta');
igual(f({ dx: -70 }), 'cerrada', 'antes de la mitad, se cierra');
igual(f({ dx: -30, v: -0.8 }), 'abierta', 'o con un latigazo a la izquierda');
igual(f({ dx: -100, anchoAcc: 0 }), 'cerrada', 'sin acciones, a la izquierda no abre');
const html = P.filaDeslizableHTML({ cara: '<b>Letras</b>', acciones: [{ texto: 'Borrar <todo>', attrs: 'data-bor="3"', peligro: true }], principal: { texto: 'Ya se armó', attrs: 'data-av="3"' }, attrs: 'id="f3"' });
cierto(html.startsWith('<div class="desliza" id="f3">') && html.endsWith('<div class="desliza-cara"><b>Letras</b></div></div>'), 'el HTML envuelve la cara de la pantalla tal cual, al final');
cierto(html.includes('Borrar &lt;todo&gt;') && !html.includes('<todo>'), 'el texto de una acción se escapa');
cierto(/class="desliza-acc peligro" data-bor="3" tabindex="-1"/.test(html) && /class="desliza-acc principal" data-av="3" tabindex="-1"/.test(html),
  'los atributos de la pantalla van en el botón, y por omisión fuera del tabulador');
cierto((html.match(/aria-hidden="true"/g) || []).length === 2, 'y mudos: son atajo de algo que ya está a la vista');
const solo = P.filaDeslizableHTML({ cara: '', acciones: [{ texto: 'Borrar' }], soloAqui: true });
cierto(!/aria-hidden|tabindex/.test(solo), 'con soloAqui, las acciones se oyen y se tabulan');
cierto(!/\son[a-z]+=/i.test(html + solo), 'sin manejadores en línea: la plataforma no los dejaría correr');

console.log('\nENTRA LO NUEVO, SALE LO QUITADO');
igual(P.cambiosDeLista(['a', 'b', 'c'], ['d', 'a', 'c']), { nuevas: ['d'], quitadas: ['b'] }, 'llegó d y se fue b');
igual(P.cambiosDeLista([], ['a']), { nuevas: ['a'], quitadas: [] }, 'de nada a algo');
igual(P.cambiosDeLista(['a', 'b'], ['b', 'a']), { nuevas: [], quitadas: [] }, 'reordenar no es ni llegar ni irse');

console.log('\nPÁGINAS CON SCROLL-SNAP');
igual(P.paginaMasCercana(180, [180, 540, 900]), 0, 'con el centro en la primera, la primera');
igual(P.paginaMasCercana(700, [180, 540, 900]), 1, 'a 700, la segunda está más cerca que la tercera');
igual(P.paginaMasCercana(5000, [180, 540, 900]), 2, 'pasado el final, la última');

console.log('\nLA SILUETA');
const sil = P.silueta('lista', { texto: 'Leyendo <el taller>', filas: 2 });
cierto(/^<div class="silueta" aria-busy="true"><div class="silueta-dibujo" aria-hidden="true">/.test(sil), 'la silueta dice que está ocupada y su dibujo es mudo');
cierto((sil.match(/silueta-fila/g) || []).length === 2, 'con los renglones pedidos');
cierto(/<p class="silueta-t" role="status"><span class="esq-giro" aria-hidden="true"><\/span> <span>Leyendo &lt;el taller&gt;<\/span><\/p>/.test(sil), 'y su texto de estado, escapado, en role="status"');
cierto(!/role="status"/.test(P.silueta('cifras')), 'sin texto no hay estado que anunciar');
cierto((P.silueta('cifras', { cifras: 4 }).match(/silueta-cifra"/g) || []).length === 4, 'las cifras del asistente son cuatro');
cierto(/esq-t.*esq-d.*esq-boton/.test(P.silueta(['t', 'd', 'boton'])), 'y se arma con las barras que se pidan');
cierto(/aspect-ratio:16 \/ 9/.test(P.silueta('miniatura', { proporcion: '16 / 9' })), 'la miniatura reserva su proporción (la de la IA)');

console.log('\nUNA SOLA HOJA PARA LAS DOS APPS');
const ui = leer('js/nucleo/ui.js'), nucleo = leer('js/cotizador/nucleo.js');
const sinCom = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
cierto(!/_moverHoja|_soltarHoja|touchmove/.test(sinCom(ui)), 'js/nucleo/ui.js ya no trae su copia del gesto');
cierto(!/_moverHoja|_soltarHoja|_HOJA_CIERRA|touchmove/.test(sinCom(nucleo)), 'js/cotizador/nucleo.js tampoco');
cierto(/hojasDeslizables\(\{\s*hoja: '\.pf-modal-bg\.show>\.pf-panel'/.test(ui) && /cierre: velo =>/.test(ui), 'la plataforma cuelga la pieza, con el cierre de su capa');
cierto(/Piezas\.hojasDeslizables\(\{\s*hoja:'\.modal-bg\.show>\.modal'/.test(nucleo) && /cierre:velo=>/.test(nucleo), 'el cotizador también');
const hojaSrc = sinCom(fuente).slice(sinCom(fuente).indexOf('const _HOJA ='), sinCom(fuente).indexOf('const _VELOS'));
cierto(hojaSrc.length > 2000 && !/opacity/.test(hojaSrc),
  'y la pieza no toca la opacidad del velo: el velo se aclara en su color, la hoja no se desvanece');
const tema = leer('js/tema.js');
cierto(/revelar\(ev\.detail === 0 \? b : ev, alternar\)/.test(tema) && /revelar: revelar/.test(tema), 'el botón del tema de todas las páginas abre en círculo, y Ajustes lo tiene a mano');
cierto(/prefers-reduced-motion: reduce/.test(tema) && /sin-revelado/.test(tema), 'con menos movimiento o con html.sin-revelado, cambia de golpe');

console.log('\nEL ESTILO VIVE EN SU BLOQUE');
const css = leer('css/sistema.css');
const bloque = (ini, fin) => { const i = css.indexOf(ini), j = css.indexOf(fin); return i >= 0 && j > i ? css.slice(i, j) : ''; };
const b2 = bloque('/* ── Piezas · 2 · hojas, listas y transiciones ── */', '/* ── fin de piezas · 2 ── */');
const rm2 = bloque('/* ── rm · piezas · 2 ── */', '/* ── fin de rm · piezas · 2 ── */');
cierto(b2.length > 1000 && rm2.length > 200, 'los dos bloques de la sección existen y tienen lo suyo');
for (const cls of ['.hoja-velo-sigue', '.vt-pieza', '.tema-revela', '.bordes-x', '.desenfoque-borde', '.desliza-cara', '.lista-nueva', '::details-content', '.plegable', '.paginas-punto', '.silueta'])
  cierto(b2.includes(cls), 'el bloque trae ' + cls);
cierto(!/infinite/.test(sinCom(b2)), 'nada infinito en el bloque: todo lo mueve alguien');
cierto(!/transition:\s*all/.test(sinCom(b2)), 'ni transition:all');
cierto(/\.pliegue::details-content\{transition:none\}/.test(rm2), 'el apagado nombra ::details-content, que el comodín no alcanza');
cierto(/\.lista-nueva::after\{animation:none\}/.test(rm2) && !/\.lista-nueva\{display:none/.test(rm2), 'con menos movimiento la marca «nuevo» se queda quieta, no se va');
const fuera = css.replace(b2, '').replace(rm2, '');
cierto(!/\.desliza-cara|\.desenfoque-borde|\.lista-nueva|\.paginas-punto/.test(fuera), 'y nada de la sección se escribió fuera de sus bloques');

console.log(`\n${fallas === 0 ? 'Las cuentas de las hojas, las listas y las páginas dan lo que tienen que dar.' : fallas + ' fallo(s).'}`);
process.exit(fallas ? 1 : 0);
