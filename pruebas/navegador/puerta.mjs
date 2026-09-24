/* LA PUERTA, EN UN NAVEGADOR DE VERDAD — y en un dominio que no es el de las pruebas.
 *
 * Las demás pruebas de navegador corren contra 127.0.0.1, y ahí la puerta se hace a un lado a
 * propósito (ver `esCopiaLocal()` en js/nucleo/puerta.js): sin esa exención no se podía abrir
 * la plataforma en local, y las diecisiete se quedaban paradas en «Entrar con Google». Pero eso
 * deja sin probar en un navegador la pantalla que ve TODO el equipo antes que ninguna otra. Así
 * que aquí se le da a Chromium otro nombre para el mismo servidor —`al3d.prueba`, resuelto a
 * 127.0.0.1 con --host-resolver-rules— y la app se abre como se abre en el dominio publicado.
 *
 * Lo que se vigila:
 *   · que la puerta SALGA y que detrás no se haya montado ni un módulo: la promesa de la puerta
 *     es que no se enseña una sola fila del taller sin saber quién entró;
 *   · que lo de detrás esté inerte y el foco caiga en «Entrar con Google»;
 *   · que el pie enlace las tres páginas públicas, que es donde Google las pide;
 *   · que el logotipo sea el del tema: de noche iba el de tinta y el «AL» se perdía en el marino;
 *   · que con un pase vivo se entre directo, sin puerta — el camino de todas las mañanas;
 *   · y que la copia local siga entrando sin puerta, que es de lo que viven las demás pruebas.
 *
 * Necesita navegador y servidor:  pruebas/correr.sh --navegador
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const PUERTO = process.env.PUERTO || '8814';
const PUBLICO = 'http://al3d.prueba:' + PUERTO;
const LOCAL = 'http://127.0.0.1:' + PUERTO;
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--host-resolver-rules=MAP al3d.prueba 127.0.0.1'],
});

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const cierto = (cond, que) => cond ? bien(que) : mal(que);

async function abrir(base, { tema = 'claro', pase = null } = {}) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
    colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
  /* Google no se alcanza desde aquí, y no hace falta: la puerta se pinta antes de preguntarle
     nada. Cortar lo de fuera en el acto evita esperar a que venza. */
  await ctx.route(/^https?:\/\/(?!al3d\.prueba|127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(([tema, pase]) => {
    try {
      localStorage.setItem('al3d_tema', tema);
      if (pase) localStorage.setItem('al3d_pf_pase', JSON.stringify(pase));
    } catch (_) {}
  }, [tema, pase]);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await p.goto(base + '/', { waitUntil: 'load' });
  await p.waitForTimeout(1800);
  return { ctx, p, errores };
}

const estado = p => p.evaluate(() => {
  const caja = document.getElementById('pf-puerta');
  const logo = caja && caja.querySelector('.puerta-logo');
  const inertes = [...document.body.children].filter(h => h !== caja && h.hasAttribute('inert')).length;
  return {
    puerta: !!caja && !caja.hidden,
    montados: [...document.querySelectorAll('.pf-mod')].filter(s => !s.hidden).map(s => s.id),
    foco: (document.activeElement && document.activeElement.textContent || '').trim(),
    enlaces: caja ? [...caja.querySelectorAll('a')].map(a => a.getAttribute('href')) : [],
    logo: logo ? logo.getAttribute('src') : null,
    inertes, hijos: document.body.children.length,
  };
});

console.log('\nEN EL DOMINIO PÚBLICO, SIN PASE');
{
  const { ctx, p, errores } = await abrir(PUBLICO);
  const e = await estado(p);
  cierto(e.puerta, 'la puerta sale');
  cierto(e.montados.length === 0, 'y detrás no se montó ningún módulo' + (e.montados.length ? ': ' + e.montados.join(', ') : ''));
  cierto(e.inertes === e.hijos - 1, 'todo lo demás del documento queda inerte (' + e.inertes + ' de ' + (e.hijos - 1) + ')');
  cierto(/Entrar con Google/.test(e.foco), 'el foco cae en «Entrar con Google»');
  for (const pag of ['acerca.html', 'privacidad.html', 'condiciones.html']) {
    cierto(e.enlaces.includes(pag), 'el pie enlaza ' + pag);
  }
  cierto(e.logo === 'logo-al3d.svg', 'de día, el logotipo de tinta');
  cierto(!errores.length, 'cero errores de página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

console.log('\nDE NOCHE');
{
  const { ctx, p } = await abrir(PUBLICO, { tema: 'oscuro' });
  const e = await estado(p);
  cierto(e.puerta, 'la puerta sale');
  cierto(e.logo === 'logo-al3d-oscuro.svg',
    'el logotipo es el de fondo oscuro (' + e.logo + '): con el de tinta, el «AL» se perdía en el marino');
  await ctx.close();
}

console.log('\nCON UN PASE VIVO');
{
  const pase = { correo: 'elias@al3d.mx', rol: 'direccion', hasta: Date.now() + 5 * 864e5, visto: Date.now() };
  const { ctx, p, errores } = await abrir(PUBLICO, { pase });
  const e = await estado(p);
  cierto(!e.puerta, 'se entra directo, sin puerta: el pase existe para no esperar a la red');
  cierto(e.montados.includes('mod-tablero'), 'y abre el Tablero');
  cierto(!errores.length, 'cero errores de página' + (errores.length ? ': ' + errores.join(' | ') : ''));
  await ctx.close();
}

console.log('\nLA COPIA LOCAL');
{
  const { ctx, p } = await abrir(LOCAL);
  const e = await estado(p);
  cierto(!e.puerta && e.montados.includes('mod-tablero'),
    'en 127.0.0.1 se entra sin puerta: de eso viven las demás pruebas de navegador');
  await ctx.close();
}

await nav.close();
console.log('\n' + (fallos ? fallos + ' fallo(s).' : 'La puerta se cierra donde debe y se abre donde debe.'));
process.exit(fallos ? 1 : 0);
