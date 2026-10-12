/* EL CAPTCHA DE LA PUERTA — js/nucleo/captcha.js, con un doble de Turnstile.
 *
 * Lo que se vigila es lo que no se ve desde fuera:
 *   · que SIN clave no haya captcha y la puerta sea la de siempre;
 *   · que con clave se pida el recuadro como se debe (solo se ve si Cloudflare duda, en español);
 *   · que FALLE ABIERTO: guion que no baja, recuadro que da error o que no contesta, y la puerta
 *     se abre y lo dice. Una puerta que solo abre cuando un tercero contesta bien deja a un
 *     instalador sin plataforma en mitad de una obra por un bloqueador de anuncios;
 *   · que un visto bueno tardío cierre el aviso en vez de dejarlo puesto;
 *   · que el reloj no corra mientras una persona resuelve un desafío;
 *   · y que la puerta lo use como está escrito: el toque que llega antes del visto bueno NO abre
 *     la ventana de Google, y nada se espera dentro del clic.
 *
 * No toca Cloudflare. Se corre con pruebas/correr.sh, como todas. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const espera = ms => new Promise(r => setTimeout(r, ms));

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ----- El doble de Turnstile ----- */
const T = { renders: [], quitados: [] };
function instalarTurnstile() {
  T.renders = []; T.quitados = [];
  globalThis.window = globalThis;
  globalThis.turnstile = {
    render(el, op) { T.renders.push({ el, op }); return 'w' + T.renders.length; },
    remove(id) { T.quitados.push(id); },
  };
}
const ultimo = () => T.renders[T.renders.length - 1].op;

globalThis.window = globalThis;
const C = await import('../js/nucleo/captcha.js');

console.log('\nSIN CLAVE NO HAY CAPTCHA');
{
  cierto('la clave de sitio viene del código y no es una cadena con espacios', C.SITE_KEY === C.SITE_KEY.trim());
  eq('sin clave, no está configurado', [C.configurado(''), C.configurado('   ')], [false, false]);
  eq('y con la del código pasa lo mismo que con su valor', C.configurado(), C.SITE_KEY.length > 0);
  eq('con una clave, sí', C.configurado('0x4AAAAAAAexample'), true);
  instalarTurnstile();
  const cambios = [];
  const v = C.vigilar({}, { clave: '', alCambiar: (e, m) => cambios.push([e, m]) });
  eq('vigilar sin clave abre en el acto y dice por qué', cambios, [['espera', ''], ['abierto', 'sin clave']]);
  eq('  y no pinta ningún recuadro', T.renders.length, 0);
  eq('  ni guarda un token', v.token(), '');
}

console.log('\nCON CLAVE SE PIDE EL RECUADRO COMO SE DEBE');
{
  instalarTurnstile();
  const cambios = [];
  const el = { id: 'caja' };
  const v = C.vigilar(el, { clave: 'CLAVE-SITIO', tema: 'dark', limite: 5000, alCambiar: (e, m) => cambios.push([e, m]) });
  await espera(5);
  eq('arranca en espera: la puerta no deja tocar «Entrar»', cambios, [['espera', '']]);
  eq('dibuja UN recuadro en el contenedor', [T.renders.length, T.renders[0].el === el], [1, true]);
  const op = ultimo();
  eq('con la clave de sitio que se le dio', op.sitekey, 'CLAVE-SITIO');
  eq('solo se ve cuando Cloudflare duda (la persona casi nunca ve nada)', op.appearance, 'interaction-only');
  eq('en español, con el tema de la puerta y a lo ancho', [op.language, op.theme, op.size], ['es', 'dark', 'flexible']);
  eq('y atiende lo que Cloudflare puede contestar', ['callback', 'expired-callback', 'error-callback', 'unsupported-callback',
     'before-interactive-callback', 'after-interactive-callback'].filter(k => typeof op[k] !== 'function'), []);

  op.callback('token-bueno');
  eq('el visto bueno pasa a «listo» y guarda el token', [v.estado(), v.token()], ['listo', 'token-bueno']);
  op['expired-callback']();
  eq('un visto bueno caducado vuelve a pedir paciencia', [v.estado(), v.token()], ['espera', '']);
  op.callback('token-nuevo');
  eq('y el que Cloudflare renueva solo lo deja listo otra vez', [v.estado(), v.token()], ['listo', 'token-nuevo']);
  eq('sin avisos repetidos: cada cambio de estado se dice una vez', cambios.map(c => c[0]), ['espera', 'listo', 'espera', 'listo']);
  v.quitar();
}

console.log('\nFALLA ABIERTO');
{
  /* Un error del recuadro. */
  instalarTurnstile();
  let cambios = [];
  let v = C.vigilar({}, { clave: 'K', limite: 5000, alCambiar: (e, m) => cambios.push([e, m]) });
  await espera(5);
  const r1 = ultimo()['error-callback']('300030');
  eq('un error de Cloudflare abre la puerta y dice el código', cambios.slice(-1)[0], ['abierto', 'error 300030']);
  eq('  y le contesta `true`, que es «ya lo atendí»', r1, true);
  ultimo().callback('llego-tarde');
  eq('si el visto bueno llega tarde, pasa a «listo» y el aviso se quita', [v.estado(), cambios.slice(-1)[0][0]], ['listo', 'listo']);
  v.quitar();

  /* Navegador que no puede correrlo. */
  instalarTurnstile(); cambios = [];
  v = C.vigilar({}, { clave: 'K', limite: 5000, alCambiar: (e, m) => cambios.push([e, m]) });
  await espera(5);
  ultimo()['unsupported-callback']();
  eq('un navegador sin soporte abre la puerta', v.estado(), 'abierto');
  v.quitar();

  /* Que no conteste en el plazo. */
  instalarTurnstile(); cambios = [];
  v = C.vigilar({}, { clave: 'K', limite: 40, alCambiar: (e, m) => cambios.push([e, m]) });
  await espera(90);
  eq('si no contesta en el plazo, abre y lo dice', cambios.slice(-1)[0], ['abierto', 'no contestó']);
  v.quitar();

  /* El reloj no corre mientras una persona resuelve un desafío. */
  const visibles = [];
  instalarTurnstile(); cambios = [];
  v = C.vigilar({}, { clave: 'K', limite: 40, alCambiar: (e, m) => cambios.push([e, m]), alInteractivo: x => visibles.push(x) });
  await espera(5);
  ultimo()['before-interactive-callback']();
  await espera(90);
  eq('con un desafío a la vista, la espera es de una persona: el reloj no abre la puerta', v.estado(), 'espera');
  eq('  y la puerta se entera de que el recuadro está visible', visibles, [true]);
  ultimo()['after-interactive-callback']();
  eq('  al terminar, avisa que ya no lo está', visibles, [true, false]);
  await espera(90);
  eq('  y si después de resolverlo no llega el visto bueno, el reloj vuelve a correr', v.estado(), 'abierto');
  v.quitar();

  /* quitar() deja de avisar y quita el recuadro. */
  instalarTurnstile(); cambios = [];
  v = C.vigilar({}, { clave: 'K', limite: 5000, alCambiar: (e, m) => cambios.push([e, m]) });
  await espera(5);
  const op = ultimo();
  v.quitar();
  op.callback('tarde');
  eq('quitar() quita el recuadro de Cloudflare', T.quitados, ['w1']);
  eq('  y lo que conteste después ya no mueve nada', cambios.map(c => c[0]), ['espera']);
}

console.log('\nEL GUION DE CLOUDFLARE: UNA VEZ, DE SU URL, Y SIN COLGAR NADA');
{
  /* Sin Turnstile cargado, con un documento de mentira. */
  delete globalThis.turnstile;
  const tags = [];
  globalThis.document = {
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { appendChild: s => { tags.push(s); } },
  };
  const C2 = await import('../js/nucleo/captcha.js?aparte');
  const p1 = C2.cargar();
  const p2 = C2.cargar();
  eq('dos pedidos a la vez ponen UNA etiqueta', tags.length, 1);
  eq('  de la URL exacta de Cloudflare, con render explícito', tags[0].src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  tags[0].onerror();
  eq('si no baja (sin señal, un bloqueador) resuelve false y no rechaza', [await p1, await p2], [false, false]);
  const p3 = C2.cargar();
  eq('y la siguiente puerta lo intenta otra vez, no hereda el fallo', tags.length, 2);
  globalThis.turnstile = { render() {} };
  tags[1].onload();
  eq('si baja y existe `turnstile`, resuelve true', await p3, true);
  eq('con `turnstile` ya presente no pone otra etiqueta', [await C2.cargar(), tags.length], [true, 2]);

  /* Y vigilar() con el guion que no baja abre la puerta. */
  delete globalThis.turnstile; tags.length = 0;
  const C3 = await import('../js/nucleo/captcha.js?otro');
  const cambios = [];
  C3.vigilar({}, { clave: 'K', limite: 5000, alCambiar: (e, m) => cambios.push([e, m]) });
  await espera(5);
  tags[0].onerror();
  await espera(5);
  eq('con el guion bloqueado, la puerta se abre y dice que no cargó', cambios, [['espera', ''], ['abierto', 'no cargó']]);
  delete globalThis.document;
}

console.log('\nLA PUERTA LO USA COMO ESTÁ ESCRITO');
{
  const pu = sinComentarios(leer('js/nucleo/puerta.js'));
  cierto('el captcha se importa estático, como ingreso y puente', /import \* as Captcha from '\.\/captcha\.js';/.test(pu));
  cierto('se pide al pintar la puerta y no en el clic', /iniciarCaptcha\(caja, pideCaptcha\);/.test(pu) &&
         !/addEventListener\('click'[\s\S]{0,400}Captcha\.vigilar/.test(pu));
  const clic = (pu.match(/caja\.addEventListener\('click', async ev => \{[\s\S]*?\n    \}\);/) || [''])[0];
  const iEspera = clic.indexOf('captchaEnEspera(caja, btn)');
  cierto('el toque que llega antes del visto bueno no abre Google', iEspera > 0 && /if \(captchaEnEspera\(caja, btn\)\) return;/.test(clic));
  cierto('  y se frena ANTES de soltar la sesión de «Entrar con otra cuenta» y de arrancar los pasos',
         iEspera < clic.indexOf('Ingreso.salir()') && iEspera < clic.indexOf('arrancarPasos(caja)') && iEspera < clic.indexOf('pedirConGoogle('));
  cierto('  y no con `disabled`: un toque a tiempo explica qué se espera, y el foco no se mueve',
         /data-captcha="' \+ \(_captchaListo \? 'listo' : 'espera'\)/.test(pu) && !/btn\.disabled|setAttribute\('disabled'/.test(pu.slice(pu.indexOf('function iniciarCaptcha'), pu.indexOf('let _yaEntro'))));
  cierto('al entrar se quita el recuadro', /const entrar = r => \{[\s\S]{0,200}_cap\.quitar\(\)/.test(pu));
  cierto('pasado una vez, repintar la puerta no lo vuelve a pedir', /if \(!pide \|\| _captchaListo\) return;/.test(pu));
  cierto('el aviso de «no cargó» dice que se puede entrar igual', /Puedes entrar igual/.test(leer('js/nucleo/puerta.js')));

  const idx = leer('index.html');
  cierto('index.html deja cargar el guion y el recuadro de Cloudflare, y nada más de él',
         /script-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(idx) && /frame-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(idx) &&
         !/connect-src[^;]*challenges\.cloudflare\.com/.test(idx));
  cierto('y precarga el módulo junto con la puerta', idx.includes('<link rel="modulepreload" href="./js/nucleo/captcha.js">'));
  cierto('el service worker lo guarda con el resto de la plataforma', /'\.\/js\/nucleo\/captcha\.js'/.test(leer('sw.js')));
  const cap = leer('js/nucleo/captcha.js');
  cierto('la clave de sitio que trae tiene la forma de una de sitio de Turnstile (0x4… de 24 caracteres)', /^0x4[A-Za-z0-9_-]{21}$/.test(C.SITE_KEY));
  cierto('y la SECRETA (más larga) no está ni se menciona', !/secret|0x4[A-Za-z0-9_-]{30,}/i.test(sinComentarios(cap)));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
