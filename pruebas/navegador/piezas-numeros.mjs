/* LAS PIEZAS DE NÚMEROS, MEDIDAS Y CAMPOS, CON RATÓN, DEDO Y TECLADO.
 *
 * js/piezas.js (sección 3) va a entrar en unas veinte pantallas: el total del cotizador y su
 * dock, las cuentas de la plataforma, la cuenta de cobro, el código de verificar, el teléfono
 * del cliente, los medidores de Material y los deslizadores del anticipo, del precio y del
 * vectorizador. Una pieza frágil se multiplica por veinte, y casi todo lo que puede salir mal
 * aquí NO da error: sale un número que parece bueno. Lo que se defiende:
 *
 *   · el total que rueda nunca cambia su texto de verdad —`textContent` es el número final
 *     desde el primer cuadro, que es lo que leen proceso.js y el lector de pantalla—, la capa
 *     cae EXACTAMENTE sobre las cifras (también bajo una escala, como a medio vuelo del total),
 *     se difumina con los precios del borrador y se va al terminar; con menos movimiento y en
 *     papel no hay capa;
 *   · la ficha que viaja existe solo mientras viaja, sale del elegido anterior —también cuando
 *     la app reescribe los botones con innerHTML, como pintarNav()— y no deja transiciones
 *     apagadas ni clases suyas al llegar;
 *   · arrastrar la etiqueta mueve la medida con los mismos eventos que teclear, un toque en la
 *     etiqueta sigue enfocando el campo, y el dedo que baja por la página NO mueve la medida;
 *   · la cuenta de cobro es un grupo de radios de verdad (flechas, Inicio, Fin, un solo tope
 *     del tabulador) con su valor en el hidden;
 *   · el código se normaliza al teclear y al pegar, rechaza lo que no es del alfabeto y lo dice;
 *     «BORRAR» habilita su botón solo completo; el teléfono queda «33 2813 0092 ✓» antes de que
 *     el oninput de la app lo lea, y el retroceso sobre un espacio borra un dígito;
 *   · los medidores dicen lleno, rayado y muesca donde deben, y no se mueven;
 *   · los deslizadores se pegan a sus imanes solo al arrastrar, escriben su campo, obedecen al
 *     campo, avisan UNA vez al soltar, y la liga se estira solo con movimiento;
 *   · y en cada ronda: cero errores, cero desborde a lo ancho y ninguna animación infinita en
 *     reposo.
 *
 * La revisión adversarial agregó lo que la vitrina sola dejaba pasar porque solo se ve en la
 * app de verdad o con la app haciendo lo suyo por otro lado:
 *   · la app escribe el total con textContent a media rueda (el número no puede quedarse
 *     transparente), y el «+1» de una cifra que llena su tarjeta cabe dentro de ella;
 *   · la ficha va al FINAL del grupo —ningún botón se mueve ni cambia de :nth-child mientras
 *     viaja—, el filete ::before de la barra lateral viaja con ella, con la pestaña escondida no
 *     sale, y fichasQueViajan() suelta lo que enganchó;
 *   · arrastrar la etiqueta dentro de algo `draggable` (como .partida) no arranca el arrastre
 *     nativo, y al soltar el campo recibe su blur (saneaNum y la regla de los 10 cm viven ahí);
 *     la zona táctil crecida no le roba el toque al chip de arriba;
 *   · lo que la app escribe en los campos SIN evento (historial, renderSummary, la cuenta
 *     recordada) llega a la pieza; destruir devuelve el `value` de fábrica;
 *   · los rótulos de las marcas no se salen de su caja y no le quitan al pulgar sus 44 px;
 *   · el contraste de cada texto de las piezas, medido sobre el render, en claro y en oscuro;
 *   · y en el cotizador y la plataforma de verdad: la regla de los 10 cm al arrastrar la
 *     altura de una partida, el teléfono del historial, el total escrito por renderSummary a
 *     media rueda, el filete de la barra lateral y un .tipo-seg de cuatro en el teléfono.
 *
 * Ocho rondas: 360 y 420 px, con y sin movimiento reducido, en claro y en oscuro. La página es
 * pruebas/navegador/piezas-numeros.html, con la política de contenido de la plataforma (sin
 * guiones en línea).
 *
 * Uso:  PUERTO=8814 node pruebas/navegador/piezas-numeros.mjs
 *       CAPTURAS=/ruta/a/una/carpeta para guardar las capturas de 360 px.
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { inflateSync } from 'zlib';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const PAGINA = B + '/pruebas/navegador/piezas-numeros.html';
const CAPTURAS = process.env.CAPTURAS || '';
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, m, detalle) => c ? bien(m) : mal(m + (detalle !== undefined ? ' — ' + JSON.stringify(detalle) : ''));
const money = n => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function ronda(ancho, reducido, tema) {
  console.log('\n── ' + ancho + ' px · ' + (reducido ? 'menos movimiento' : 'con movimiento') + ' · ' + tema + ' ──');
  const ctx = await nav.newContext({ viewport: { width: ancho, height: 800 }, hasTouch: true, locale: 'es-MX',
    reducedMotion: reducido ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  await p.goto(PAGINA, { waitUntil: 'load' });
  await p.waitForFunction(() => window.vitrina && window.vitrina.listo);
  await p.waitForTimeout(250);
  const ev = (f, a) => p.evaluate(f, a);
  const caja = async sel => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded(); return l.boundingBox(); };
  const dedo = async (puntos, espera = 16) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: puntos[0][0], y: puntos[0][1] }] });
    for (const [x, y] of puntos.slice(1)) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      await p.waitForTimeout(espera);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(60);
  };
  const linea = (x0, y0, x1, y1, n = 12) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
  const quieto = reducido ? 80 : 1000;
  const tema_ok = await ev(() => document.documentElement.getAttribute('data-tema') || 'claro');
  cierto(tema_ok === tema, 'el tema de la ronda es ' + tema, tema_ok);

  /* ================= 1 · El total que rueda ================= */
  const alineacion = () => ev(() => ['v-neto', 'v-escalado'].map(id => {
    const el = document.getElementById(id), v = el.querySelector(':scope > .rueda-vista');
    if (!v) return null;
    const t = [...el.childNodes].find(n => n.nodeType === 3), r = document.createRange();
    r.selectNodeContents(t);
    const a = r.getBoundingClientRect(), b = v.getBoundingClientRect();
    return { dx: Math.abs(a.right - b.right), dw: Math.abs(a.width - b.width), dy: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)),
      oculta: v.getAttribute('aria-hidden'), texto: el.textContent };
  }));
  let partidas = 5;
  await (await p.locator('#b-mas')).scrollIntoViewIfNeeded();
  await p.click('#b-mas'); partidas++;
  const al = await alineacion();
  const esperado = money(partidas * 2160 * 1.16);
  cierto(await ev(() => document.getElementById('v-neto').textContent) === esperado,
    'con el ratón: el texto de verdad es el total nuevo desde el primer cuadro (' + esperado + ')');
  if (reducido) cierto(al.every(x => x === null), 'con menos movimiento el número cambia sin rodar: no hay capa');
  else {
    cierto(al.every(x => x && x.oculta === 'true' && x.texto === esperado), 'la rueda es una capa aria-hidden y el texto no cambia');
    cierto(al.every(x => x.dx < 1.5 && x.dw < 1.5 && x.dy < 1.5), 'la capa cae sobre las cifras, también bajo una escala de .6', al);
    const misma = await ev(() => { const el = document.getElementById('v-neto'), v = el.querySelector('.rueda-vista');
      Piezas.rodarCifra(el, el.textContent); return el.querySelector('.rueda-vista') === v; });
    cierto(misma, 'pintar la misma cifra otra vez no reinicia la rueda que va');
  }
  await p.waitForTimeout(quieto);
  cierto(await ev(() => !document.querySelector('.rueda-vista,.rueda-rodando')), 'al terminar se va la capa y queda el texto solo');
  await p.tap('#b-menos'); partidas--;
  await p.focus('#b-mas'); await p.keyboard.press('Enter'); partidas++;
  await p.keyboard.press('Enter'); partidas++;
  cierto(await ev(() => [document.getElementById('v-neto').textContent, document.querySelectorAll('#v-neto .rueda-vista').length]).then(([t, n]) => t === money(partidas * 2160 * 1.16) && n <= 1),
    'con el dedo y con dos Enter seguidos: el total final, una sola capa');
  await p.waitForTimeout(quieto);
  await p.click('#b-precios');
  await p.click('#b-mas'); partidas++;
  const borroso = await ev(() => { const el = document.getElementById('v-dock'); return { f: getComputedStyle(el).filter, t: el.textContent, capa: !!el.querySelector('.rueda-vista') }; });
  cierto(/blur/.test(borroso.f) && borroso.t === money(partidas * 2160 * 1.16) && borroso.capa === !reducido,
    'en borrador el dock se difumina con su rueda adentro, y el número sigue siendo el de verdad', borroso);
  await p.click('#b-precios');
  await p.waitForTimeout(quieto);
  await ev(() => vitrina.masTarde());
  const delta = await ev(() => { const d = document.querySelector('#v-cuenta .rueda-delta'); return d && { d: d.getAttribute('data-d'), t: document.getElementById('v-cuenta').textContent, a: getComputedStyle(d).animationName }; });
  cierto(delta && delta.d === '+1' && delta.t === '3', 'la cuenta que sube dice «+1» junto a la cifra, sin meterlo en el texto', delta);
  cierto(delta && delta.a === (reducido ? 'rueda-delta-quieta' : 'rueda-delta'), 'y con menos movimiento el «+1» es un fundido, no sube', delta);
  await p.fill('#v-cuenta-in', '3');
  const d1 = await ev(() => [document.getElementById('v-dif').textContent, document.getElementById('v-dif').dataset.signo]);
  await p.fill('#v-cuenta-in', '2');
  const d2 = await ev(() => [document.getElementById('v-dif').textContent, document.getElementById('v-dif').dataset.signo]);
  await p.fill('#v-cuenta-in', '30');
  const dud = await ev(() => vitrina.dudosa);
  await p.fill('#v-cuenta-in', '2.4');
  const d3 = await ev(() => [document.getElementById('v-dif').textContent, document.getElementById('v-dif').dataset.signo]);
  cierto(d1[0] === '+0.6 láminas' && d1[1] === 'mas' && d2[0] === '−0.4 láminas' && d2[1] === 'menos' && d3[0] === '0 láminas' && d3[1] === 'cero',
    'la diferencia contra el libro se escribe con su signo mientras se teclea', [d1, d2, d3]);
  cierto(dud === true, 'y un «30» con el libro en 2.4 queda marcado para el aviso de la pantalla');
  await p.emulateMedia({ media: 'print' });
  await p.click('#b-mas'); partidas++;
  cierto(await ev(() => !document.querySelector('.rueda-vista')), 'en papel no rueda');
  await p.emulateMedia({ media: 'screen' });
  if (!reducido) {
    /* Otra ruta de la app escribe el total con textContent mientras rueda: la capa se va con él y
       el texto se quedaba transparente, el total invisible medio segundo. */
    const ajeno = await ev(async () => {
      const el = document.getElementById('v-neto');
      Piezas.rodarCifra(el, '$1,111.00');
      const rodaba = !!el.querySelector('.rueda-vista');
      el.textContent = '$2,222.00';
      await new Promise(r => setTimeout(r, 40));
      const cs = getComputedStyle(el);
      return { rodaba, fill: cs.webkitTextFillColor, clase: el.classList.contains('rueda-rodando'), t: el.textContent };
    });
    cierto(ajeno.rodaba && !ajeno.clase && !/rgba\(0, 0, 0, 0\)|transparent/.test(ajeno.fill) && ajeno.t === '$2,222.00',
      'si la app escribe el total por otro lado a media rueda, la rueda se detiene y el número se ve', ajeno);
    await p.waitForTimeout(40);
  }
  /* El «+$100» de una cifra que llena su tarjeta (cifraQueCabe): a la derecha no cabe, y
     .pf-cuenta recorta lo que se sale. Tiene que leerse entero, dentro de la tarjeta. */
  await (await p.locator('#v-dinero-caja')).scrollIntoViewIfNeeded();
  await ev(() => vitrina.masDinero());
  await p.waitForTimeout(250);
  const dd = await ev(() => {
    const d = document.querySelector('#v-dinero .rueda-delta'), c = document.getElementById('v-dinero-caja').getBoundingClientRect();
    const b = document.getElementById('v-dinero'), t = [...b.childNodes].find(n => n.nodeType === 3), rg = document.createRange();
    rg.selectNodeContents(t);
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return { arriba: d.classList.contains('arriba'), holgura: b.clientWidth - rg.getBoundingClientRect().width,
      dentro: r.left >= c.left - .5 && r.right <= c.right + .5 && r.top >= c.top - .5 && r.bottom <= c.bottom + .5,
      d: d.getAttribute('data-d'), t: b.textContent, ancho: r.width };
  });
  cierto(dd && dd.dentro && dd.d === '+$100' && dd.t === '$1,228,300.00' && (dd.arriba || dd.holgura > dd.ancho + 6),
    'con la cifra llenando su tarjeta, el «+$100» se lee entero y dentro de ella (encima si a la derecha no cabe)', dd);

  /* ================= 2 · La ficha que viaja ================= */
  /* Se toca por programa DENTRO de la página para medir la ficha en el mismo cuadro en que sale. */
  const salida = sel => ev(async s => {
    const g = document.querySelector(s.g), viejo = g.querySelector('.on,.active'), r0 = viejo.getBoundingClientRect();
    g.querySelector(s.b).click();
    await Promise.resolve();
    const f = g.querySelector('.ficha-viaja');
    if (!f) return { ficha: false };
    const r = f.getBoundingClientRect();
    return { ficha: true, dx: Math.abs(r.left - r0.left), dw: Math.abs(r.width - r0.width), destino: !!g.querySelector('.ficha-destino') };
  }, sel);
  await (await p.locator('#v-seg')).scrollIntoViewIfNeeded();
  const s1 = await salida({ g: '#v-seg', b: 'button:nth-child(2)' });
  if (reducido) cierto(!s1.ficha, 'con menos movimiento la ficha no viaja: el elegido cambia como siempre');
  else cierto(s1.ficha && s1.dx < 1.5 && s1.dw < 1.5 && s1.destino, 'la ficha sale del rectángulo del elegido anterior y el destino esconde su relleno', s1);
  await p.waitForTimeout(reducido ? 60 : 450);
  const limpio = () => ev(() => ({ fichas: document.querySelectorAll('.ficha-viaja').length, destinos: document.querySelectorAll('.ficha-destino').length,
    apagadas: [...document.querySelectorAll('.con-ficha > *')].filter(x => x.style.transition === 'none').length }));
  let l = await limpio();
  cierto(!l.fichas && !l.destinos && !l.apagadas, 'al llegar no queda ficha, ni clase suya, ni una transición apagada', l);
  const s2 = await salida({ g: '#v-nav', b: 'button:nth-child(3)' });
  cierto(reducido ? !s2.ficha : (s2.ficha && s2.dx < 1.5), 'con los botones reescritos por innerHTML también sale del viejo', s2);
  /* Delante de los botones, la ficha cambiaba lo que cuentan los :nth-child() —en la plataforma
     un .tipo-seg de cuatro se volvía de cinco y se rehacía en tres columnas a media ficha— y los
     children[i] de quien los recorra. */
  const orden = await ev(async () => {
    const g = document.getElementById('v-tipo'), bs = [...g.querySelectorAll('button')];
    const donde = () => bs.map(b => { const r = b.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width); }).join(' ');
    const antes = donde();
    bs.find(b => !b.classList.contains('on')).click();
    await Promise.resolve();
    const f = g.querySelector('.ficha-viaja');
    return { ficha: !!f, ultimo: !f || f === g.lastElementChild, quietos: donde() === antes, nth: g.querySelector(':scope>:nth-child(1)') === bs[0] };
  });
  cierto(orden.ficha === !reducido && orden.ultimo && orden.quietos && orden.nth,
    'la ficha va al final del grupo: ningún botón se mueve ni cambia de :nth-child mientras viaja', orden);
  /* El filete de la barra lateral es un ::before del elegido, no su fondo. */
  await (await p.locator('#v-lat')).scrollIntoViewIfNeeded();
  const filete = await ev(async () => {
    const g = document.getElementById('v-lat');
    g.children[2].click();
    await Promise.resolve();
    const f = g.querySelector('.ficha-viaja'), dest = g.querySelector('.ficha-destino'), ad = f && f.querySelector('.ficha-adorno');
    return { ficha: !!f, adorno: ad ? [ad.style.width, ad.style.left, ad.style.backgroundColor] : null,
      escondido: dest ? getComputedStyle(dest, '::before').visibility : null };
  });
  cierto(reducido ? !filete.ficha : (filete.ficha && filete.adorno && filete.adorno[0] === '3px' && filete.escondido === 'hidden'),
    reducido ? 'con menos movimiento el filete cambia de sitio sin viajar' : 'el filete (::before) viaja dentro de la ficha, y el del destino espera a que llegue', filete);
  await p.waitForTimeout(reducido ? 60 : 450);
  const filete2 = await ev(() => { const g = document.getElementById('v-lat'), on = g.querySelector('.on');
    return { clases: on.className, visible: getComputedStyle(on, '::before').visibility, fichas: g.querySelectorAll('.ficha-viaja').length, cual: on.textContent }; });
  cierto(filete2.clases === 'on' && filete2.visible === 'visible' && !filete2.fichas && filete2.cual === 'Control',
    'al llegar, el filete es el del destino y no queda nada de la ficha', filete2);
  const oculta = await ev(async () => {
    const g = document.getElementById('v-seg');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try { [...g.querySelectorAll('button')].find(b => !b.classList.contains('on')).click(); await Promise.resolve(); return !!g.querySelector('.ficha-viaja'); }
    finally { delete document.visibilityState; }
  });
  cierto(!oculta, 'con la pestaña escondida la ficha no sale: nadie la vería viajar');
  const dyn = await ev(async () => {
    const raiz = document.getElementById('v-dinamico');
    const vig = Piezas.fichasQueViajan(raiz, '.seg'), otra = Piezas.fichasQueViajan(raiz, '.seg');
    raiz.innerHTML = '<div class="seg" role="group" aria-label="Nuevo"><button type="button" class="on" aria-pressed="true">A</button><button type="button" aria-pressed="false">B</button></div>';
    await new Promise(r => setTimeout(r, 0));
    const g = raiz.firstElementChild, enganchado = g.classList.contains('con-ficha');
    vig.destruir();
    const r = { misma: vig === otra, enganchado, suelto: !g.classList.contains('con-ficha') };
    raiz.textContent = '';
    return r;
  });
  cierto(dyn.misma && dyn.enganchado && dyn.suelto, 'fichasQueViajan engancha lo que nace después, una sola vez, y al destruirlo suelta lo que enganchó', dyn);
  await p.tap('#v-tipo button:nth-child(3)');
  const toque = await ev(() => [document.querySelector('#v-tipo .on').textContent.includes('Bastidor'), !!document.querySelector('#v-tipo .ficha-viaja')]);
  cierto(toque[0] && toque[1] === !reducido, 'con el dedo: el elegido cambia y la ficha viaja solo con movimiento', toque);
  await p.focus('#v-tool button:nth-child(2)');
  await p.keyboard.press('Space');
  const tecla = await ev(() => [document.querySelector('#v-tool .active').textContent, !!document.querySelector('#v-tool .ficha-viaja')]);
  cierto(tecla[0] === 'Comparar' && tecla[1] === !reducido, 'con el teclado también', tecla);
  const chips = await ev(async () => {
    const g = document.getElementById('v-plazo'), fondo = x => getComputedStyle(x).backgroundColor;
    const antes = [...g.children].map(fondo);
    g.children[2].click();
    await Promise.resolve();
    const f = g.querySelector('.ficha-viaja');
    return { antes, ficha: !!f, fichaFondo: f && f.style.backgroundColor, borde: getComputedStyle(g.children[1]).borderTopStyle };
  });
  const transparente = c => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  cierto(!transparente(chips.antes[0]) && transparente(chips.antes[1]) && transparente(chips.antes[2]) && chips.borde === 'solid',
    'en un grupo de chips .ficha-transparente, los no elegidos pierden el fondo y no el borde', chips);
  cierto(chips.ficha === !reducido && (reducido || !transparente(chips.fichaFondo)), 'y la ficha que pasa por debajo lleva el fondo del elegido', chips);
  await p.setViewportSize({ width: ancho + 40, height: 800 });
  await p.waitForTimeout(120);
  await p.setViewportSize({ width: ancho, height: 800 });
  await p.waitForTimeout(reducido ? 120 : 500);
  l = await limpio();
  cierto(!l.fichas && !l.destinos && !l.apagadas, 'y cambiar de ancho no deja nada a medias', l);

  /* ================= 3 · Arrastrar sobre la etiqueta ================= */
  const eventos = () => ev(() => Object.assign({}, vitrina.eventos));
  let e0 = await eventos();
  let et = await caja('label[for="v-alto"]');
  await p.mouse.move(et.x + 20, et.y + et.height / 2);
  await p.mouse.down();
  await p.mouse.move(et.x + 60, et.y + et.height / 2, { steps: 8 });
  const durante = await ev(() => document.getElementById('v-alto').closest('.fld').classList.contains('arrastre-activo'));
  await p.mouse.up();
  let e1 = await eventos();
  const alto = await ev(() => [document.getElementById('v-alto').value, document.activeElement && document.activeElement.id]);
  cierto(alto[0] === '33' && durante, 'con el ratón: 40 px sobre «Altura» son seis pasos de 0.5 (30 → 33)', alto);
  cierto((e1['v-alto:input'] || 0) - (e0['v-alto:input'] || 0) >= 1 && (e1['v-alto:change'] || 0) - (e0['v-alto:change'] || 0) === 1,
    'despacha input en cada paso y un change al soltar, como teclear', [e0, e1]);
  cierto(alto[1] !== 'v-alto', 'el clic que llega al soltar no enfoca el campo (no abre el teclado)', alto[1]);
  const nativo = await ev(() => [vitrina.nativos, document.getElementById('v-medidas').classList.contains('dragging')]);
  cierto(nativo[0] === 0 && !nativo[1], 'dentro de algo draggable (como .partida) no arranca el arrastre nativo ni le deja su .dragging', nativo);
  cierto((e1['v-alto:blur'] || 0) - (e0['v-alto:blur'] || 0) === 1 && (e1['v-medidas:focusout'] || 0) - (e0['v-medidas:focusout'] || 0) === 1,
    'y al soltar el campo recibe su blur y su focusout, como al salir de él después de teclear', [e0, e1]);
  await p.click('label[for="v-alto"]');
  cierto(await ev(() => document.activeElement.id) === 'v-alto', 'un clic sin arrastrar sigue enfocando el campo');
  const misma = await ev(() => Piezas.arrastrarMedidas(document.getElementById('v-medidas')) === Piezas.arrastrarMedidas('v-medidas'));
  cierto(misma, 'llamar dos veces a arrastrarMedidas devuelve la misma pieza');
  et = await caja('label[for="v-letras"]');
  e0 = await eventos();
  await p.keyboard.down('Shift');
  await p.mouse.move(et.x + 10, et.y + et.height / 2);
  await p.mouse.down();
  await p.mouse.move(et.x + 22, et.y + et.height / 2, { steps: 4 });
  await p.mouse.up();
  await p.keyboard.up('Shift');
  e1 = await eventos();
  cierto(await ev(() => document.getElementById('v-letras').value) === '19' && (e1['v-letras:input'] || 0) - (e0['v-letras:input'] || 0) === 1,
    'con Shift, cada paso vale diez (9 → 19), con un solo input aunque se enganchó dos veces', [e0['v-letras:input'], e1['v-letras:input']]);
  await p.focus('#v-letras');
  await p.keyboard.press('Control+A');
  await p.keyboard.type('12');
  cierto(await ev(() => document.getElementById('v-letras').value) === '12', 'y el campo se sigue tecleando');
  et = await caja('label[for="v-m2"]');
  e0 = await eventos();
  await dedo(linea(et.x + 10, et.y + et.height / 2, et.x + 40, et.y + et.height / 2));
  e1 = await eventos();
  cierto(await ev(() => document.getElementById('v-m2').value) === '0.76' && (e1['v-m2:change'] || 0) - (e0['v-m2:change'] || 0) === 1,
    'con el dedo de lado: 30 px son cuatro centésimas de m² (0.72 → 0.76) y un change', await ev(() => document.getElementById('v-m2').value));
  et = await caja('label[for="v-m2"]');
  const y0 = await ev(() => scrollY);
  await dedo(linea(et.x + 10, et.y + et.height / 2, et.x + 14, et.y + et.height / 2 - 160, 10));
  await p.waitForTimeout(250);
  const vertical = await ev(y => [document.getElementById('v-m2').value, Math.round(scrollY - y)], y0);
  cierto(vertical[0] === '0.76', 'el dedo que sube por la etiqueta no mueve la medida', vertical);
  cierto(vertical[1] > 40, 'y desplaza la página, que es lo que quería', vertical);
  /* La zona táctil de la etiqueta crece 14 px hacia arriba y queda sobre la orilla del chip. */
  const vec = await ev(() => {
    const chip = document.getElementById('v-vecino'), lab = document.querySelector('label[for="v-ancho"]');
    chip.scrollIntoView({ block: 'center' });
    const c = chip.getBoundingClientRect(), l = lab.getBoundingClientRect();
    const x = Math.min(c.right, l.right) - 12, y = c.bottom - 4;
    return { x, y, encima: document.elementFromPoint(x, y) === lab, lx: l.left + 12, ly: l.top + l.height / 2 };
  });
  cierto(vec.encima, 'la zona táctil de la etiqueta de verdad queda encima de la orilla del chip (si no, esto no prueba nada)', vec);
  const a0 = await ev(() => [document.getElementById('v-ancho').value, vitrina.vecino]);
  await p.touchscreen.tap(vec.x, vec.y);
  await p.waitForTimeout(60);
  const tv = await ev(() => ({ vecino: vitrina.vecino, foco: document.activeElement && document.activeElement.id }));
  cierto(tv.vecino === a0[1] + 1 && tv.foco !== 'v-ancho', 'un toque en la orilla del chip es del chip: no enfoca la medida de abajo', tv);
  await dedo(linea(vec.x - 30, vec.y, vec.x + 10, vec.y));
  cierto(await ev(() => document.getElementById('v-ancho').value) === a0[0], 'y arrastrar de lado sobre esa orilla no mueve la medida');
  await p.touchscreen.tap(vec.lx, vec.ly);
  await p.waitForTimeout(60);
  cierto(await ev(() => document.activeElement.id) === 'v-ancho', 'un toque en la etiqueta misma sigue enfocando su campo');
  await ev(() => document.activeElement.blur());
  e0 = await eventos();
  await dedo(linea(vec.lx, vec.ly, vec.lx + 40, vec.ly));
  e1 = await eventos();
  /* Cuarenta píxeles menos los cuatro de la zona muerta son seis pasos de medio centímetro. */
  cierto(await ev(() => document.getElementById('v-ancho').value) === '123' && (e1['v-ancho:blur'] || 0) - (e0['v-ancho:blur'] || 0) === 1,
    'la etiqueta suelta (arrastrarMedida) también arrastra con el dedo: 120 → 123, y un blur al soltar', await ev(() => document.getElementById('v-ancho').value));

  /* ================= 18 · La cuenta de cobro ================= */
  await (await p.locator('#v-cuentas')).scrollIntoViewIfNeeded();
  e0 = await eventos();
  await p.click('#v-cuentas [data-v="Elias BBVA"]');
  const gl = await ev(() => ({ v: document.getElementById('v-rv-cuenta').value,
    radios: [...document.querySelectorAll('#v-cuentas [role=radio]')].map(b => b.getAttribute('aria-checked') + b.tabIndex + (b.classList.contains('on') ? 'on' : '')),
    ficha: !!document.querySelector('#v-cuentas .ficha-viaja'), cambios: vitrina.cambiosCuenta.slice() }));
  e1 = await eventos();
  cierto(gl.v === 'Elias BBVA' && gl.radios[4] === 'true0on' && gl.radios.slice(0, 4).every(x => x === 'false-1'),
    'con el ratón: el valor va al hidden, y solo la elegida está marcada y en el tabulador', gl);
  cierto((e1['v-rv-cuenta:change'] || 0) - (e0['v-rv-cuenta:change'] || 0) === 1 && gl.cambios.at(-1) === 'Elias BBVA', 'el hidden avisa un change');
  cierto(gl.ficha === !reducido, 'y la pastilla viaja solo con movimiento', gl.ficha);
  await p.focus('#v-cuentas [data-v="Elias BBVA"]');
  await p.keyboard.press('ArrowRight');
  const k1 = await ev(() => [document.activeElement.dataset.v, document.getElementById('v-rv-cuenta').value]);
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('Home');
  const k2 = await ev(() => [document.activeElement.dataset.v, document.getElementById('v-rv-cuenta').value]);
  await p.keyboard.press('End');
  const k3 = await ev(() => document.getElementById('v-rv-cuenta').value);
  cierto(k1.join() === 'Moni MPago,Moni MPago' && k2.join() === 'Moni MPago,Moni MPago' && k3 === 'Elias BBVA',
    'con el teclado: las flechas dan la vuelta, Inicio y Fin van a los extremos, y el foco va con la elección', [k1, k2, k3]);
  await p.tap('#v-cuentas [data-v="Rul HSBC"]');
  cierto(await ev(() => document.getElementById('v-rv-cuenta').value) === 'Rul HSBC', 'con el dedo también');
  /* venta.js escribe la cuenta recordada en el hidden al abrir el modal, sin evento. */
  const e18 = await eventos(), c18 = await ev(() => vitrina.cambiosCuenta.length);
  await ev(() => { document.getElementById('v-rv-cuenta').value = 'Tatis BNT'; });
  const pg = await ev(() => { const b = document.querySelector('#v-cuentas [data-v="Tatis BNT"]');
    return [b.getAttribute('aria-checked'), b.tabIndex, document.querySelectorAll('#v-cuentas [aria-checked="true"]').length, vitrina.cambiosCuenta.length]; });
  const e18b = await eventos();
  cierto(pg[0] === 'true' && pg[1] === 0 && pg[2] === 1 && pg[3] === c18 && (e18b['v-rv-cuenta:change'] || 0) === (e18['v-rv-cuenta:change'] || 0),
    'lo que la app escribe en el hidden sin evento mueve la elección, sin avisar un cambio que nadie hizo', pg);
  cierto(await ev(() => Piezas.opcionesDeslizantes('v-cuentas') === vitrina.glide), 'llamar dos veces a opcionesDeslizantes devuelve la misma pieza');

  /* ================= 19 · Casillas y teléfono ================= */
  const cod = () => ev(() => ({ v: document.getElementById('v-codigo').value,
    llenas: document.querySelectorAll('#v-codigo-caja .casilla.llena').length,
    completo: document.querySelector('#v-codigo-caja .casillas').classList.contains('completo') }));
  await (await p.locator('#v-codigo-caja')).scrollIntoViewIfNeeded();
  const fila = await caja('#v-codigo-caja .casillas');
  await p.mouse.click(fila.x + fila.width * .8, fila.y + fila.height / 2);
  cierto(await ev(() => document.activeElement.id) === 'v-codigo', 'con el ratón, la fila entera enfoca el campo');
  await p.keyboard.type('a1b2c3d4e5f6');
  let c = await cod();
  cierto(c.v === 'A1B2C3D4E5F6' && c.llenas === 12 && c.completo && (await ev(() => vitrina.completos.at(-1))) === 'A1B2-C3D4-E5F6',
    'con el teclado: doce casillas, en mayúsculas, y avisa el código agrupado', c);
  await ev(() => vitrina.codigo.vaciar());
  await p.focus('#v-codigo');
  await p.keyboard.insertText('oil0-abcd-ef12');
  c = await cod();
  cierto(c.v === '0110ABCDEF12', 'pegar normaliza: sin guiones, O→0 e I/L→1', c.v);
  await ev(() => vitrina.codigo.vaciar());
  await p.focus('#v-codigo');
  await p.keyboard.type('12G');
  await p.waitForTimeout(90);
  const rech = await ev(() => { const k = document.querySelector('#v-codigo-caja .casillas');
    return { v: document.getElementById('v-codigo').value, r: k.classList.contains('rechazo'), a: getComputedStyle(k).animationName, voz: k.querySelector('.casillas-voz').textContent }; });
  cierto(rech.v === '12' && rech.r && /«G»/.test(rech.voz), 'lo que no es del código se quita, y una región viva dice qué', rech);
  cierto(rech.a === (reducido ? 'none' : 'casillas-sacude'), 'la fila se sacude una vez, y con menos movimiento no (el borde rojo se queda)', rech.a);
  await ev(() => vitrina.codigo.vaciar());
  await p.focus('#v-codigo');
  await p.keyboard.insertText('A1B2C3D4E5F6A');
  await p.waitForTimeout(90);
  const sob = await ev(() => document.querySelector('#v-codigo-caja .casillas-voz').textContent);
  cierto(/sobra «A»/.test(sob) && !/No va/.test(sob), 'lo que sobra del largo se dice como sobra, no como «no va en el código»', sob);
  await ev(() => { vitrina.codigo.fijar('A1B2C3D4E5F6'); vitrina.codigo.marcar('ok'); });
  const ok = await ev(() => document.querySelector('#v-codigo-caja .casillas').classList.contains('acierto'));
  await ev(() => vitrina.codigo.marcar('mal'));
  await p.waitForTimeout(reducido ? 30 : 600);
  cierto(ok && (await cod()).v === '', 'al acertar se lava en verde y al fallar se vacía');
  await p.tap('#v-codigo-caja .casillas');
  cierto(await ev(() => document.activeElement.id) === 'v-codigo', 'con el dedo, un toque en la fila enfoca el campo');
  await p.focus('#v-borrar');
  await p.keyboard.type('borrax');
  const br1 = await ev(() => [document.getElementById('v-borrar-b').getAttribute('aria-disabled'), [...document.getElementById('v-borrar').closest('.casillas').querySelectorAll('.casilla.mal')].map(c => c.textContent).join('')]);
  await p.keyboard.press('Backspace');
  await p.keyboard.type('r');
  const br2 = await ev(() => [document.getElementById('v-borrar-b').getAttribute('aria-disabled'), document.getElementById('v-borrar').value]);
  cierto(br1[0] === 'true' && br1[1] === 'X' && br2[0] === 'false' && br2[1] === 'BORRAR',
    '«BORRAR» se valida al teclear: la letra que no va sale en rojo y el botón se habilita solo completo', [br1, br2]);

  await p.focus('#v-tel');
  await p.keyboard.type('3328130092');
  const t1 = await ev(() => ({ v: document.getElementById('v-tel').value, c: document.querySelector('#fld-tel .tel-cuenta').textContent,
    visto: vitrina.telVisto.at(-1), completo: document.querySelector('#fld-tel .tel-vivo').classList.contains('completo') }));
  cierto(t1.v === '33 2813 0092' && t1.c === '✓' && t1.completo, 'con el teclado: «33 2813 0092 ✓»', t1);
  cierto(t1.visto === '33 2813 0092', 'y el oninput de la app ya lo recibe con espacios', t1.visto);
  await p.fill('#v-tel', '');
  await p.focus('#v-tel');
  await p.keyboard.insertText('+52 3328130092');
  cierto(await ev(() => document.getElementById('v-tel').value) === '33 2813 0092', 'pegar «+52 3328130092» deja «33 2813 0092»');
  await p.fill('#v-tel', '');
  await p.keyboard.type('+52 33 1234 56');
  const t2 = await ev(() => ({ c: document.querySelector('#fld-tel .tel-cuenta').textContent, revisa: document.querySelector('#fld-tel .tel-vivo').classList.contains('revisa') }));
  cierto(t2.c === '8/10' && t2.revisa, 'un «+52» con ocho dígitos detrás no lleva palomita: se revisa', t2);
  await p.fill('#v-tel', '');
  await p.keyboard.type('332813');
  await ev(() => document.getElementById('v-tel').setSelectionRange(3, 3));
  await p.keyboard.press('Backspace');
  const t3 = await ev(() => { const i = document.getElementById('v-tel'), ids = i.getAttribute('aria-describedby').split(' ');
    return { v: i.value, ids, frase: document.getElementById(ids[1]).textContent }; });
  cierto(t3.v === '32 813', 'el retroceso sobre un espacio borra el dígito de antes', t3.v);
  cierto(t3.ids[0] === 'v-hint' && t3.frase === 'Faltan 5 dígitos', 'el estado va en aria-describedby, junto al que ya tenía', t3);
  await p.tap('#v-tel');
  cierto(await ev(() => document.activeElement.id) === 'v-tel', 'con el dedo se sigue escribiendo en el mismo campo');
  /* historial.js y autocompletarCliente() escriben el campo sin evento. */
  await ev(() => { document.getElementById('v-tel').value = '33 12'; });
  const pt1 = await ev(() => ({ c: document.querySelector('#fld-tel .tel-cuenta').textContent, completo: document.querySelector('#fld-tel .tel-vivo').classList.contains('completo') }));
  await ev(() => { document.getElementById('v-tel').value = '+523328130092'; });
  const pt2 = await ev(() => ({ v: document.getElementById('v-tel').value, c: document.querySelector('#fld-tel .tel-cuenta').textContent }));
  cierto(pt1.c === '4/10' && !pt1.completo && pt2.v === '33 2813 0092' && pt2.c === '✓',
    'lo que la app escribe en el teléfono sin evento (el historial, el autocompletado) también se cuenta y se acomoda', [pt1, pt2]);
  await ev(() => { document.getElementById('v-codigo').value = 'a1-b2'; });
  const pc = await ev(() => [...document.querySelectorAll('#v-codigo-caja .casilla')].slice(0, 5).map(c => c.textContent).join('|'));
  cierto(pc === 'A|1|B|2|', 'y el código que llega sin evento (del QR) se pinta en sus casillas, normalizado', pc);
  cierto(await ev(() => Piezas.telefonoVivo('v-tel') === vitrina.tel && Piezas.casillasCodigo('v-codigo') === vitrina.codigo),
    'llamar dos veces a telefonoVivo o a casillasCodigo devuelve la misma pieza');

  /* ================= 20 · Medidores quietos ================= */
  const med = await ev(() => {
    const m = document.querySelector('#v-mat-0 .medidor'), W = m.getBoundingClientRect().width, L = m.getBoundingClientRect().left;
    const f = s => { const r = m.querySelector(s).getBoundingClientRect(); return [(r.left - L) / W, r.width / W]; };
    return { lleno: f('.medidor-lleno'), rayado: f('.medidor-rayado'), falta: f('.medidor-falta'), muesca: f('.medidor-muesca')[0],
      muescaAlta: m.querySelector('.medidor-muesca').getBoundingClientRect().height > m.getBoundingClientRect().height,
      oculto: m.getAttribute('aria-hidden'), img: document.querySelector('#v-mat-1 .medidor').getAttribute('role') + '|' + document.querySelector('#v-mat-1 .medidor').getAttribute('aria-label'),
      cero: !!document.querySelector('#v-mat-3 .medidor.bajo-cero .medidor-cero'),
      anims: [...document.querySelectorAll('.medidor')].reduce((n, x) => n + x.getAnimations({ subtree: true }).length, 0) };
  });
  const cerca = (a, b) => Math.abs(a - b) < .012;
  cierto(cerca(med.lleno[1], .48) && cerca(med.rayado[1], .2) && cerca(med.falta[0], .48) && cerca(med.falta[1], .12) && cerca(med.muesca, .4) && med.muescaAlta,
    'hay 2.4 de 5: lleno al 48 %, rayado al 20 %, hueco hasta el 60 % y la muesca que sobresale', med);
  cierto(med.oculto === 'true' && med.img === 'img|Cobrado 50 %' && med.cero, 'sin frase es aria-hidden, con frase es una imagen, y el libro en rojo se marca', med);
  cierto(med.anims === 0, 'y no se mueven');
  const mp = await ev(() => { const s = document.getElementById('v-med-pintado');
    return { c: s.className, mt: s.style.marginTop, v: s.style.getPropertyValue('--v'), muesca: !!s.querySelector('.medidor-muesca'), oculto: s.getAttribute('aria-hidden') }; });
  cierto(mp.c === 'no-papel vit-mio medidor tono-ok vit-b' && mp.mt === '9px' && mp.v === '0.6' && mp.muesca && mp.oculto === 'true',
    'pintarMedidor sobre un elemento de la pantalla deja sus clases (el .no-papel) y su estilo, y cambia solo lo suyo', mp);

  /* ================= Deslizadores con imanes ================= */
  const R = sel => ev(s => { const i = document.querySelector(s); return { v: +i.value, t: i.getAttribute('aria-valuetext') }; }, sel);
  const xDe = async (sel, v) => { const b = await caja(sel); const [mn, mx] = await ev(s => [+document.querySelector(s).min, +document.querySelector(s).max], sel);
    return [b.x + 22 + (v - mn) / (mx - mn) * (b.width - 44), b.y + b.height / 2]; };
  e0 = await eventos();
  await p.focus('#v-anti-r');
  await p.keyboard.press('ArrowRight');
  const a1 = [await R('#v-anti-r'), await ev(() => document.getElementById('v-anti').value)];
  await p.keyboard.press('PageDown');
  const a2 = (await R('#v-anti-r')).v;
  await p.keyboard.press('End');
  const a3r = await R('#v-anti-r'), a3 = a3r.v;
  e1 = await eventos();
  cierto(a1[0].v === 6300 && a1[1] === '6300' && a2 === 6264 && a3 === 12528,
    'con el teclado: la flecha va de cien en cien, Av Pág al imán del 50 % y Fin al total', [a1, a2, a3]);
  cierto((e1['v-anti:input'] || 0) - (e0['v-anti:input'] || 0) >= 3 && (e1['v-anti:change'] || 0) - (e0['v-anti:change'] || 0) >= 3,
    'y escribe el campo del anticipo con sus input y change', [e0, e1]);
  cierto(a3r.t === 'Hoy $12,528.00, al instalar $0.00' && a1[0].t === 'Hoy $6,300.00, al instalar $6,228.00', 'el lector oye «Hoy $X, al instalar $Y», no el número suelto', [a1[0].t, a3r.t]);
  await p.fill('#v-anti', '20000');
  const f1 = await ev(() => [+document.getElementById('v-anti-r').value, document.getElementById('v-anti-r').closest('.desl-caja').classList.contains('fuera')]);
  await p.fill('#v-anti', '5000');
  const f2 = await ev(() => [+document.getElementById('v-anti-r').value, document.getElementById('v-anti-r').closest('.desl-caja').classList.contains('fuera')]);
  cierto(f1[0] === 12528 && f1[1] && f2[0] === 5000 && !f2[1], 'el campo manda: tecleado de más, el pulgar se queda en el tope y lo marca', [f1, f2]);
  let [x0, yy] = await xDe('#v-anti-r', 5000);
  let [x1] = await xDe('#v-anti-r', 6420);
  await p.mouse.move(x0, yy); await p.mouse.down(); await p.mouse.move(x1, yy, { steps: 10 }); await p.mouse.up();
  const im1 = (await R('#v-anti-r')).v;
  [x0, yy] = await xDe('#v-anti-r', im1);
  [x1] = await xDe('#v-anti-r', 4321);
  await p.mouse.move(x0, yy); await p.mouse.down(); await p.mouse.move(x1, yy, { steps: 10 }); await p.mouse.up();
  const im2 = (await R('#v-anti-r')).v;
  cierto(im1 === 6264 && im2 % 100 === 0 && Math.abs(im2 - 4321) <= 100, 'con el ratón se pega al 50 % exacto y, fuera de él, a cientos', [im1, im2]);

  [x0, yy] = await xDe('#v-precio-r', 10800);
  const bp = await caja('#v-precio-r');
  await p.mouse.move(x0, yy); await p.mouse.down();
  await p.mouse.move(bp.x + bp.width + 70, yy, { steps: 12 });
  const liga = await ev(() => { const i = document.getElementById('v-precio-r'); return [i.closest('.desl-caja').getAttribute('data-estira'), i.style.transform, i.value, document.getElementById('v-precio').value]; });
  await p.mouse.up();
  await p.waitForTimeout(40);
  const suelta = await ev(() => document.getElementById('v-precio-r').style.transform);
  if (reducido) cierto(!liga[0] && !liga[1], 'con menos movimiento no hay liga', liga);
  else cierto(+liga[0] > 0 && /scaleX/.test(liga[1]), 'jalar más allá del tope estira el riel como liga', liga);
  cierto(liga[2] === '11880' && liga[3] === '11880' && suelta === '', 'el valor se queda en el tope, el campo lo dice, y al soltar regresa', [liga, suelta]);
  [x0, yy] = await xDe('#v-precio-r', 11880);
  [x1] = await xDe('#v-precio-r', 10260);
  await p.mouse.move(x0, yy); await p.mouse.down(); await p.mouse.move(x1 + 5, yy, { steps: 12 }); await p.mouse.up();
  cierto((await R('#v-precio-r')).v === 10260 && await ev(() => document.getElementById('v-precio').value) === '10260',
    'el precio se pega en el −5 % del calculado', await R('#v-precio-r'));

  let r0 = await ev(() => vitrina.retrazos);
  await p.focus('#v-colores');
  await p.keyboard.press('ArrowRight');
  const pastilla = await ev(() => { const c = document.getElementById('v-colores').closest('.desl-caja'), s = c.querySelector('.desl-pastilla');
    const a = s.getBoundingClientRect(), b = c.getBoundingClientRect(); return [s.textContent, a.left >= b.left - .5 && a.right <= b.right + .5]; });
  cierto((await R('#v-colores')).v === 7 && pastilla[0] === '7' && pastilla[1] && (await ev(() => vitrina.retrazos)) === r0 + 1,
    'con el teclado: la pastilla dice 7, no se sale de la pista, y se re-traza una vez', pastilla);
  r0 = await ev(() => vitrina.retrazos);
  [x0, yy] = await xDe('#v-colores', 7);
  [x1] = await xDe('#v-colores', 15);
  await p.mouse.move(x0, yy); await p.mouse.down(); await p.mouse.move(x1, yy, { steps: 14 });
  const aMedias = await ev(() => vitrina.retrazos);
  await p.mouse.up();
  cierto(aMedias === r0 && (await ev(() => vitrina.retrazos)) === r0 + 1 && Math.abs((await R('#v-colores')).v - 15) <= 1,
    'con el ratón: no se re-traza mientras se arrastra, y sí una vez al soltar', [r0, aMedias, await R('#v-colores')]);
  r0 = await ev(() => vitrina.retrazos);
  [x0, yy] = await xDe('#v-colores', (await R('#v-colores')).v);
  [x1] = await xDe('#v-colores', 10);
  await dedo(linea(x0, yy, x1, yy, 14));
  cierto(Math.abs((await R('#v-colores')).v - 10) <= 1 && (await ev(() => vitrina.retrazos)) === r0 + 1,
    'con el dedo: el pulgar sigue al dedo y se re-traza al soltar', [await R('#v-colores'), r0]);
  const rotulos = await ev(() => ['v-colores', 'v-precio-r', 'v-detalle'].map(id => {
    const bs = [...document.getElementById(id).closest('.desl-caja').querySelectorAll('.desl-marca:not(.sin-texto) b')].map(b => b.getBoundingClientRect());
    const todas = document.getElementById(id).closest('.desl-caja').querySelectorAll('.desl-marca');
    return { n: bs.length, de: todas.length, pisan: bs.some((a, i) => i && a.left < bs[i - 1].right - .5), primeraYUltima: !todas[0].classList.contains('sin-texto') && !todas[todas.length - 1].classList.contains('sin-texto') };
  }));
  cierto(rotulos.every(r => !r.pisan && r.primeraYUltima && r.n >= 2), 'los rótulos de las marcas no se pisan y los extremos siempre se leen', rotulos);
  cierto((await R('#v-detalle')).t === 'Medio', 'el Detalle se lee «Medio», no «1»');
  const dentro = await ev(() => ['v-anti-r', 'v-precio-r', 'v-colores', 'v-detalle'].map(id => {
    const k = document.getElementById(id).closest('.desl-caja'), c = k.getBoundingClientRect();
    const fuera = [...k.querySelectorAll('.desl-marca:not(.sin-texto) b')].filter(b => { const r = b.getBoundingClientRect(); return r.left < c.left - .5 || r.right > c.right + .5; }).map(b => b.textContent);
    return { id, fuera, ultimo: k.querySelector('.desl-marca:last-child b').textContent };
  }));
  cierto(dentro.every(x => !x.fuera.length) && dentro[0].ultimo === '$12,528.00', 'ningún rótulo se sale de su caja, tampoco el del tope, que es el total entero', dentro);
  const zona = await ev(() => ['v-anti-r', 'v-colores'].map(id => {
    const i = document.getElementById(id); i.scrollIntoView({ block: 'center' });
    const r = i.getBoundingClientRect();
    return [r.top + 3, r.top + r.height / 2, r.bottom - 3].every(y => document.elementFromPoint(r.left + r.width / 2, y) === i);
  }));
  cierto(zona.every(Boolean), 'los 44 px del pulgar son del deslizador de arriba abajo: las marcas no se comen la franja de abajo', zona);
  /* renderSummary() escribe #f-anti sin evento; un preset del vectorizador escribe el rango. */
  await ev(() => { document.getElementById('v-anti').value = '3000'; document.getElementById('v-colores').value = '12'; });
  const pw = await ev(() => ({ r: +document.getElementById('v-anti-r').value, t: document.getElementById('v-anti-r').getAttribute('aria-valuetext'),
    pas: document.getElementById('v-colores').closest('.desl-caja').querySelector('.desl-pastilla').textContent }));
  cierto(pw.r === 3000 && /Hoy \$3,000\.00/.test(pw.t) && pw.pas === '12', 'lo que la app escribe sin evento en el campo o en el rango mueve el pulgar y su pastilla', pw);
  cierto(await ev(() => Piezas.deslizadorConImanes('v-anti-r') === vitrina.anti), 'llamar dos veces a deslizadorConImanes devuelve la misma pieza');

  /* ================= Destruir ================= */
  const fin = await ev(() => {
    const ids = ['v-tel', 'v-codigo', 'v-anti', 'v-anti-r', 'v-rv-cuenta', 'v-colores'];
    const antes = ids.filter(id => Object.getOwnPropertyDescriptor(document.getElementById(id), 'value')).length;
    const c0 = document.querySelector('#fld-tel .tel-cuenta').textContent;
    vitrina.tel.destruir(); vitrina.codigo.destruir(); vitrina.anti.destruir(); vitrina.glide.destruir(); vitrina.colores.destruir();
    const quedan = ids.filter(id => Object.getOwnPropertyDescriptor(document.getElementById(id), 'value'));
    document.getElementById('v-tel').value = '33 12';
    return { antes, quedan, c0, c: document.querySelector('#fld-tel .tel-cuenta').textContent, v: document.getElementById('v-tel').value };
  });
  cierto(fin.antes === 6 && !fin.quedan.length && fin.c === fin.c0 && fin.v === '33 12', 'destruir devuelve a cada campo su value de fábrica, y la pieza deja de escucharlo', fin);

  /* ================= En reposo ================= */
  await p.waitForTimeout(reducido ? 300 : 1900);
  const reposo = await ev(() => ({
    infinitas: document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity).map(a => a.animationName || (a.effect.target && a.effect.target.className)),
    corriendo: document.getAnimations().filter(a => a.playState === 'running').map(a => a.animationName || String(a.effect.target && a.effect.target.className)),
    ancho: [document.documentElement.scrollWidth, innerWidth],
    sobras: document.querySelectorAll('.rueda-vista,.rueda-delta,.ficha-viaja,.ficha-destino,.rueda-rodando,.arrastre-activo').length
  }));
  cierto(!reposo.infinitas.length, 'ninguna animación infinita en reposo', reposo.infinitas);
  cierto(!reposo.corriendo.length && !reposo.sobras, 'nada corriendo ni a medias al terminar', reposo);
  cierto(reposo.ancho[0] <= reposo.ancho[1], 'sin desborde a lo ancho', reposo.ancho);
  cierto(!errs.length, 'cero errores de página', errs);
  if (CAPTURAS && ancho === 360 && !reducido) {
    await ev(() => scrollTo(0, 0));
    await p.screenshot({ path: CAPTURAS + '/piezas-numeros-360-' + tema + '.png', fullPage: true });
  }
  await ctx.close();
}

/* ================= Contraste, medido sobre el render =================
   El método de pruebas/navegador/contraste.mjs: se rasteriza el elemento a ×3, el color más
   frecuente es el fondo y el que más se le aleja en luminancia es el texto. */
function leerPNG(buf) {
  let i = 8, idat = [], w, h, ct;
  while (i < buf.length) {
    const ln = buf.readUInt32BE(i), tipo = buf.toString('ascii', i + 4, i + 8), dat = buf.subarray(i + 8, i + 8 + ln);
    i += 12 + ln;
    if (tipo === 'IHDR') { w = dat.readUInt32BE(0); h = dat.readUInt32BE(4); ct = dat[9]; }
    else if (tipo === 'IDAT') idat.push(dat); else if (tipo === 'IEND') break;
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct], raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[pos++], line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    line.copy(px, y * stride); prev = line;
  }
  return { w, h, bpp, px };
}
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const Lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
function medirContraste(buf) {
  const { w, h, bpp, px } = leerPNG(buf), cuenta = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * bpp;
    if (bpp === 4 && px[o + 3] < 200) continue;
    const k = (px[o] >> 2) + ',' + (px[o + 1] >> 2) + ',' + (px[o + 2] >> 2), v = cuenta.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    v.n++; v.r += px[o]; v.g += px[o + 1]; v.b += px[o + 2]; cuenta.set(k, v);
  }
  const cols = [...cuenta.values()].map(v => ({ n: v.n, c: [v.r / v.n, v.g / v.n, v.b / v.n] })).sort((a, b) => b.n - a.n);
  if (cols.length < 2) return null;
  const bg = cols[0];
  let fg = null, mejor = -1;
  for (const c of cols.slice(0, 60)) { const d = Math.abs(Lum(c.c) - Lum(bg.c)); if (d > mejor) { mejor = d; fg = c; } }
  const l1 = Lum(fg.c), l2 = Lum(bg.c);
  return { r: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), fg: fg.c.map(Math.round), bg: bg.c.map(Math.round) };
}
async function contraste(tema) {
  console.log('\n── contraste de los textos de las piezas · ' + tema + ' ──');
  const ctx = await nav.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 3, reducedMotion: 'reduce', locale: 'es-MX', serviceWorkers: 'block' });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  const p = await ctx.newPage();
  await p.goto(PAGINA, { waitUntil: 'load' });
  await p.waitForFunction(() => window.vitrina && window.vitrina.listo);
  const med = async (nombre, sel) => {
    const el = await p.$(sel);
    if (!el) { mal(nombre + ': «' + sel + '» no encontró nada'); return; }
    await el.scrollIntoViewIfNeeded();
    const m = medirContraste(await el.screenshot());
    if (!m) { mal(nombre + ': un solo color, nada que medir'); return; }
    cierto(m.r >= 4.5, nombre + ': ' + m.r.toFixed(2) + ':1  rgb(' + m.fg + ') / rgb(' + m.bg + ')');
  };
  await p.focus('#v-tel'); await p.keyboard.type('332813');
  await med('el contador del teléfono', '#fld-tel .tel-cuenta');
  await p.fill('#v-tel', ''); await p.keyboard.type('+52 33 1234 56');
  await med('el contador en ámbar («revisa»)', '#fld-tel .tel-cuenta');
  await med('un rótulo de las marcas', '#v-colores ~ .desl-marcas .desl-marca:not(.en):not(.sin-texto) b');
  await med('el rótulo de la marca en la que está', '.desl-marca.en b');
  await med('la pastilla del deslizador', '#v-colores ~ .desl-pastilla, .con-pastilla .desl-pastilla');
  await p.focus('#v-borrar'); await p.keyboard.type('borrax');
  await med('la letra que no va, en rojo', '.casilla.mal');
  await med('una casilla llena', '.casilla.llena:not(.mal)');
  await med('una opción sin elegir', '#v-cuentas .chip:not(.on)');
  await med('su línea de abajo', '#v-cuentas .chip:not(.on):not(.tono-av) small');
  await med('el «sin IVA» en ámbar', '#v-cuentas .chip.tono-av small');
  await med('la opción elegida', '#v-cuentas .chip.on');
  await med('su línea de abajo, elegida', '#v-cuentas .chip.on small');
  await p.click('#v-cuentas [data-v="Elias BBVA"]');
  await med('el «sin IVA» en ámbar, elegido', '#v-cuentas .chip.on.tono-av small');
  await ctx.close();
}

/* ================= En la app de verdad =================
   La vitrina prueba las piezas; esto prueba que sirven donde van a entrar. Nada de esto está
   conectado todavía —lo conectan las pantallas—, así que se engancha aquí a mano sobre el marcado
   de siempre del cotizador y de la plataforma, que es exactamente lo que hará cada pantalla. */
async function enLaApp() {
  console.log('\n── en el cotizador de verdad (1440 px, ratón) ──');
  let ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', serviceWorkers: 'block' });
  await ctx.addInitScript({ path: decodeURIComponent(new URL('./hoja-de-mentiras.js', import.meta.url).pathname) });
  let p = await ctx.newPage();
  let errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForTimeout(900);
  let ev = (f, a) => p.evaluate(f, a);
  await ev(() => { window._tel = Piezas.telefonoVivo('f-tel'); });
  await p.fill('#f-cli', 'Farmacia San Juan');
  await p.focus('#f-tel');
  await p.keyboard.type('+52 3328130092');
  const t1 = await ev(() => ({ v: $('f-tel').value, q: Q.tel, c: document.querySelector('#fld-tel .tel-cuenta').textContent, falta: telIncompleto(Q.tel) }));
  cierto(t1.v === '33 2813 0092' && t1.q === '33 2813 0092' && t1.c === '✓' && !t1.falta,
    '#f-tel: «+52 3328130092» queda «33 2813 0092 ✓», y upd() ya lo recibe así', t1);
  await p.fill('#f-proy', 'Letrero de fachada');
  await ev(() => { $('f-tel').value = '33 12'; });
  const t2 = await ev(() => document.querySelector('#fld-tel .tel-cuenta').textContent);
  await ev(() => { $('f-tel').value = Q.tel; });
  cierto(t2 === '4/10', 'lo que historial.js escribe en #f-tel sin evento se cuenta (sin llamar a repintar)', t2);
  await ev(() => irAPaso(2));
  await p.waitForTimeout(500);
  await p.click('.chip:has-text("Acero Inoxidable")');
  await p.fill('#h-1', '12'); await p.fill('#n-1', '8');
  await ev(() => document.activeElement.blur());
  await p.waitForTimeout(200);
  await ev(() => { document.querySelector('label[for="h-1"]').classList.add('arrastrable'); Piezas.arrastrarMedidas('items'); });
  await p.locator('label[for="h-1"]').scrollIntoViewIfNeeded();
  const lab = await p.locator('label[for="h-1"]').boundingBox();
  const antes = await ev(() => ({ tipo: Q.items[0].tipo, alt: Q.items[0].altura }));
  await p.mouse.move(lab.x + 6, lab.y + lab.height / 2);
  await p.mouse.down();
  await p.mouse.move(lab.x + 6 - 60, lab.y + lab.height / 2, { steps: 20 });
  await p.mouse.up();
  await p.waitForTimeout(300);
  const despues = await ev(() => ({ tipo: Q.items[0].tipo, alt: Q.items[0].altura, arrastrando: !!document.querySelector('.partida.dragging'),
    toast: (document.getElementById('toast') || {}).textContent || '' }));
  cierto(antes.tipo === 'letras' && antes.alt === 12, 'la partida arranca en letras 3D de 12 cm', antes);
  cierto(despues.alt === 7.5 && !despues.arrastrando, 'arrastrar «Altura» dentro de la .partida (que es draggable) baja la medida: 12 → 7.5, sin reordenar la partida', despues);
  cierto(despues.tipo === 'recorte' && /10 cm/.test(despues.toast), 'y al soltar corre la regla de los 10 cm, como al salir del campo: la partida pasó a recorte', despues);
  const tot = await ev(async () => {
    const el = $('s-neto');
    Piezas.rodarCifra(el, el.textContent, { animar: false });
    Piezas.rodarCifra(el, '$99,999.00');
    const rodaba = !!el.querySelector('.rueda-vista');
    renderSummary();                                    // la ruta de siempre, que escribe textContent
    await new Promise(r => setTimeout(r, 40));
    return { rodaba, fill: getComputedStyle(el).webkitTextFillColor, t: el.textContent, capa: !!el.querySelector('.rueda-vista') };
  });
  cierto(tot.rodaba && !tot.capa && !/rgba\(0, 0, 0, 0\)/.test(tot.fill) && tot.t !== '$99,999.00',
    '#s-neto: si renderSummary() lo escribe a media rueda, el total de verdad se ve', tot);
  /* El borrador: `body.precios-ocultos` difumina el TEXTO del total (filter sobre el elemento,
     no un rectángulo encima). La capa de la rueda es su hija, así que se difumina con él, y el
     dedo que espía toca el mismo elemento de siempre —_SEL_PRECIO lo encuentra con closest()
     aunque el toque caiga en la capa—. */
  const borrador = await ev(async () => {
    const el = $('s-neto');
    document.body.classList.add('precios-ocultos');
    document.body.classList.remove('precios-a-la-vista');
    Piezas.rodarCifra(el, el.textContent, { animar: false });
    Piezas.rodarCifra(el, '$77,777.00');
    await new Promise(r => setTimeout(r, 30));
    const capa = el.querySelector('.rueda-vista');
    const r = el.getBoundingClientRect();
    (capa && capa.firstChild ? capa.firstChild : el).dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    const out = { capa: !!capa, hija: !!capa && capa.parentNode === el, filtro: getComputedStyle(el).filter,
      pasa: capa ? getComputedStyle(capa).pointerEvents : null, destapado: document.body.classList.contains('precios-a-la-vista') };
    document.body.classList.remove('precios-ocultos', 'precios-a-la-vista');
    Piezas.rodarCifra.olvidar();
    return out;
  });
  cierto(borrador.capa && borrador.hija && /blur\(/.test(borrador.filtro) && borrador.pasa === 'none' && borrador.destapado,
    'en borrador el total rueda DENTRO del difuminado, y el dedo que espía sigue tocando el mismo elemento', borrador);
  /* El vuelo del total entre pasos escala por el ALTO (_medirTotal/_volarTotal): la rueda no
     puede cambiarlo. Y una cifra que empieza a rodar mientras el total va a media escala tiene
     que caer sobre los dígitos, no al lado. */
  const alto = await ev(async () => {
    const el = $('s-neto'), h0 = el.getBoundingClientRect().height, o0 = el.offsetHeight;
    Piezas.rodarCifra(el, el.textContent, { animar: false });
    Piezas.rodarCifra(el, el.textContent.replace(/\d/, d => (+d + 1) % 10));
    await new Promise(r => setTimeout(r, 30));
    const h1 = el.getBoundingClientRect().height, o1 = el.offsetHeight, comp = document.querySelector('[data-shared="total"]:not([hidden])') === el;
    /* A media escala, como cuando _volarTotal() lo está llevando de un paso al otro. */
    el.style.transformOrigin = 'left top';
    el.style.transform = 'scale(.6)';
    Piezas.rodarCifra(el, '$31,415.00');
    await new Promise(r => setTimeout(r, 30));
    const capa = el.querySelector('.rueda-vista'), t = [...el.childNodes].find(n => n.nodeType === 3);
    const rg = document.createRange();
    rg.selectNodeContents(t);
    const a = rg.getBoundingClientRect(), b = capa ? capa.getBoundingClientRect() : null;
    el.style.transform = '';
    el.style.transformOrigin = '';
    Piezas.rodarCifra.olvidar();
    return { h0, h1, o0, o1, comp, capa: !!capa, dx: b ? Math.abs(a.right - b.right) : null, dy: b ? Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) : null };
  });
  cierto(Math.abs(alto.h1 - alto.h0) < .5 && alto.o1 === alto.o0 && alto.comp,
    'la rueda no cambia el alto del total: el vuelo entre pasos escala lo mismo que siempre', alto);
  cierto(alto.capa && alto.dx < 1.5 && alto.dy < 1.5,
    'y una cifra que arranca a media escala cae sobre los dígitos, no al lado', alto);
  await ev(() => renderSummary());
  cierto(!errs.length, 'cero errores de página en el cotizador', errs);
  await ctx.close();

  console.log('\n── en la plataforma de verdad (1440 px y 360 px) ──');
  for (const ancho of [1440, 360]) {
    ctx = await nav.newContext({ viewport: { width: ancho, height: 900 }, hasTouch: ancho < 760, locale: 'es-MX', serviceWorkers: 'block' });
    p = await ctx.newPage();
    errs = [];
    p.on('pageerror', e => errs.push(e.message));
    ev = (f, a) => p.evaluate(f, a);
    await p.goto(B + '/', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const g = ancho < 760 ? 'pf-abajo' : 'pf-nav';
    const vuelo = await ev(async g => {
      const G = document.getElementById(g);
      if (g === 'pf-abajo') Piezas.fichaQueViaja(G, { medir: b => b.querySelector('.pil') }); else Piezas.fichaQueViaja(G);
      const on = G.querySelector('.on'), otro = [...G.querySelectorAll('button')].find(b => b !== on && b.offsetParent);
      otro.click();                                     // el router repinta la barra con pintarNav()
      await new Promise(r => setTimeout(r, 30));
      const f = G.querySelector('.ficha-viaja'), dest = G.querySelector('.ficha-destino');
      return { ficha: !!f, ultimo: !!f && f === G.lastElementChild, adorno: !!(f && f.querySelector('.ficha-adorno')),
        antes: dest ? getComputedStyle(dest, '::before').visibility : null };
    }, g);
    cierto(vuelo.ficha && vuelo.ultimo && (g === 'pf-abajo' || (vuelo.adorno && vuelo.antes === 'hidden')),
      g === 'pf-nav' ? '#pf-nav: la ficha viaja al módulo nuevo con el filete adentro, y el del destino espera' : '#pf-abajo: la píldora viaja al módulo nuevo', vuelo);
    await p.waitForTimeout(600);
    cierto(await ev(() => !document.querySelector('.ficha-viaja,.ficha-destino,.ficha-sin-antes')), 'y al llegar no queda nada de ella');
    if (ancho < 760) {
      await p.goto(B + '/#/control', { waitUntil: 'load' });
      await p.waitForTimeout(1200);
      const cuatro = await ev(async () => {
        const G = [...document.querySelectorAll('.tipo-seg')].find(x => x.offsetParent && x.querySelectorAll(':scope>button').length === 4);
        if (!G) return null;
        Piezas.fichaQueViaja(G);
        const bs = [...G.querySelectorAll(':scope>button')];
        const donde = () => bs.map(b => { const r = b.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width); }).join(' ');
        const antes = donde(), cols = getComputedStyle(G).gridTemplateColumns.split(' ').length;
        const destino = bs.find(b => !b.classList.contains('on') && b.getAttribute('aria-pressed') !== 'true');
        destino.click();
        await Promise.resolve();
        const G2 = [...document.querySelectorAll('.tipo-seg')].find(x => x.offsetParent && x.querySelectorAll(':scope>button').length === 4);
        return { ficha: !!(G2 && G2.querySelector('.ficha-viaja')), mismo: G2 === G, quietos: G2 !== G || donde() === antes,
          cols, colsAhora: G2 ? getComputedStyle(G2).gridTemplateColumns.split(' ').length : 0 };
      });
      cierto(cuatro && cuatro.cols === 4 && cuatro.colsAhora === 4 && cuatro.quietos,
        'el .tipo-seg de cuatro de Control sigue en cuatro columnas mientras la ficha viaja (su :nth-child no cambia)', cuatro);
    }
    cierto(!errs.length, 'cero errores de página en la plataforma a ' + ancho + ' px', errs);
    await ctx.close();
  }
}

for (const ancho of [360, 420]) for (const reducido of [false, true]) for (const tema of ['claro', 'oscuro']) {
  try { await ronda(ancho, reducido, tema); } catch (e) { mal('la ronda ' + ancho + '/' + reducido + '/' + tema + ' tronó: ' + e.message); }
}
for (const tema of ['claro', 'oscuro']) {
  try { await contraste(tema); } catch (e) { mal('el contraste en ' + tema + ' tronó: ' + e.message); }
}
try { await enLaApp(); } catch (e) { mal('la app de verdad tronó: ' + e.message); }
await nav.close();
console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nLas piezas de números, medidas y campos responden al ratón, al dedo y al teclado.');
process.exit(fallos ? 1 : 0);
