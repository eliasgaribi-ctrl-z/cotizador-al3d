/* LAS PIEZAS DE LA SECCIÓN 2 DE js/piezas.js —HOJAS, LISTAS Y TRANSICIONES—, CON LA MANO.
 *
 * Estas piezas las van a usar una veintena de pantallas, y lo que se rompe en ellas no da error:
 * una hoja que se cierra mientras alguien baja por el historial, un renglón que se abre en vez de
 * dejar desplazar la página, una lista que marca «nueva» para siempre porque cada tecla la
 * reinicia, un velo que se aclara llevándose la ficha entera al 35 %. Nada de eso aparece en la
 * consola; aparece en el teléfono de quien cotiza. Así que aquí se ejercita cada pieza con
 * ratón, con el dedo (toques de verdad por el protocolo de Chrome) y con el teclado, a 360 y a
 * 420 px, con y sin menos movimiento, de día y de noche, y en cada combinación se exige:
 *
 *   · cero errores de página y cero desborde horizontal;
 *   · ninguna animación infinita en reposo;
 *   · que cada pieza haga lo suyo por los tres caminos, y que con menos movimiento se vaya el
 *     adorno pero no lo que informa (la hoja se sigue cerrando, la marca «nueva» se queda).
 *
 * Al final se comprueba en las dos apps de verdad lo que la vitrina no puede: que el cotizador y
 * la plataforma cuelgan la MISMA hoja (se cierra con el dedo, consume su entrada de historial y
 * la hoja no se desvanece con el velo), que el botón del tema abre en círculo, y que las franjas
 * de desenfoque están debajo de sus barras sin tapar un solo toque.
 *
 * La vitrina es pruebas/navegador/piezas-hojas.html (carga sistema.css, vidrio.css, tema.js y
 * piezas.js, nada de la app).
 *
 * Uso:  PUERTO=8814 node pruebas/navegador/piezas-hojas.mjs
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const CAPTURAS = process.env.CAPTURAS || '';      // carpeta donde dejar capturas, si se pide
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const ok = (c, m, det) => (c ? bien(m) : mal(m + (det !== undefined ? ' — ' + JSON.stringify(det) : '')));
const espera = ms => new Promise(r => setTimeout(r, ms));

/* Un arrastre con el dedo, por el protocolo: touchstart, N touchmove y touchend, con su tiempo
   entre cada uno (la hoja y el renglón miden la velocidad del último tramo). `alMedio` corre con
   el dedo todavía abajo, para mirar el estado a mitad de gesto. */
async function dedo(p, cdp, x0, y0, x1, y1, { pasos = 12, ms = 16, alMedio = null } = {}) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= pasos; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / pasos, y: y0 + (y1 - y0) * i / pasos, id: 1 }] });
    await espera(ms);
  }
  const medio = alMedio ? await alMedio() : null;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return medio;
}
async function raton(p, x0, y0, x1, y1, { pasos = 12, ms = 0, alMedio = null } = {}) {
  await p.mouse.move(x0, y0); await p.mouse.down();
  for (let i = 1; i <= pasos; i++) { await p.mouse.move(x0 + (x1 - x0) * i / pasos, y0 + (y1 - y0) * i / pasos); if (ms) await espera(ms); }
  const medio = alMedio ? await alMedio() : null;
  await p.mouse.up();
  return medio;
}
const centro = async (p, sel) => {
  const r = await p.locator(sel).first().boundingBox();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, r } : null;
};
const alVista = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); e.scrollIntoView({ block: 'center' }); }, sel);
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => a.playState !== 'finished' && a.effect && a.effect.getComputedTiming().iterations === Infinity)
  .map(a => (a.animationName || 'waapi') + ' @ ' + ((a.effect.target && (a.effect.target.id || a.effect.target.className)) || '?')));
const desborde = p => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);

/* ======================================================================================== */
async function vitrina(ancho, tema, mov) {
  const nombre = ancho + ' px · ' + tema + ' · ' + (mov === 'reduce' ? 'menos movimiento' : 'con movimiento');
  console.log('\n── LA VITRINA · ' + nombre + ' ──');
  const quieto = mov === 'reduce';
  const ctx = await nav.newContext({ viewport: { width: ancho, height: 780 }, hasTouch: true, locale: 'es-MX',
    reducedMotion: mov, serviceWorkers: 'block' });
  await ctx.addInitScript(t => { try { if (!sessionStorage.getItem('__t')) { localStorage.setItem('al3d_tema', t); sessionStorage.setItem('__t', '1'); } } catch (_) {} }, tema);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/pruebas/navegador/piezas-hojas.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  ok(await p.evaluate(t => document.documentElement.dataset.tema === t, tema), 'la vitrina está en tema ' + tema);
  const infIni = await infinitas(p);
  ok(!infIni.length, 'nada se mueve solo al cargar', infIni);
  ok(await desborde(p) <= 0, 'sin desborde horizontal al cargar');

  /* ---------- 13 · La hoja ---------- */
  const abrir = async () => { await p.evaluate(() => { document.getElementById('abrir-hoja').click(); }); await p.waitForTimeout(380); };
  const abierta = () => p.evaluate(() => document.getElementById('hoja-bg').classList.contains('show'));
  const cerradas = () => p.evaluate(() => window.__v.cerradas);
  {
    await abrir();
    const cab = await centro(p, '#hoja-bg .modal-h b');
    const c0 = await cerradas();
    const medio = await raton(p, cab.x, cab.y, cab.x, cab.y + 220, { pasos: 10, alMedio: () => p.evaluate(() => {
      const bg = document.getElementById('hoja-bg'), m = bg.querySelector('.modal');
      const a = (getComputedStyle(bg).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      return { sigue: bg.classList.contains('hoja-velo-sigue'), arr: +bg.style.getPropertyValue('--arrastre'),
        opVelo: getComputedStyle(bg).opacity, opHoja: getComputedStyle(m).opacity, alfa: a.length > 3 ? a[3] : 1,
        tf: getComputedStyle(m).transform };
    }) });
    ok(medio.sigue && medio.arr > 0.1, 'con el ratón, la hoja se arrastra desde el encabezado y el velo sigue al dedo', medio);
    ok(medio.opVelo === '1' && medio.opHoja === '1', 'el velo se aclara en su color, no en su opacidad: la hoja no se desvanece', medio);
    ok(medio.alfa < 0.5, 'el tinte del velo baja con lo que bajó la hoja (' + medio.alfa + ')');
    ok(quieto ? medio.tf === 'none' : /matrix\(1, 0, 0, 1, 0, (1\d\d|2\d\d)/.test(medio.tf),
      quieto ? 'con menos movimiento la hoja no se desplaza con el dedo' : 'y la hoja baja con él', medio.tf);
    await p.waitForTimeout(420);
    ok(!(await abierta()) && (await cerradas()) === c0 + 1, 'soltar lejos la cierra, por la función de su capa');
    ok(await p.evaluate(() => !document.getElementById('hoja-bg').classList.contains('hoja-velo-sigue')), 'y el velo vuelve a su estado de siempre');
  }
  {
    await abrir();
    const cab = await centro(p, '#hoja-bg .modal-h b');
    await raton(p, cab.x, cab.y, cab.x, cab.y + 24, { pasos: 8, ms: 45 });
    await p.waitForTimeout(420);
    ok(await abierta(), 'un arrastre corto y lento no la cierra: regresa');
    ok(await p.evaluate(() => { const m = document.querySelector('#hoja-bg .modal'); return m.style.transform === '' && !document.getElementById('hoja-bg').style.getPropertyValue('--arrastre'); }),
      'y no deja nada escrito en la hoja ni en el velo');
    /* Con el dedo: desde el encabezado cierra; hacia arriba cede y no cierra. */
    const arriba = await dedo(p, cdp, cab.x, cab.y, cab.x, cab.y - 120, { pasos: 10, alMedio: () => p.evaluate(() => getComputedStyle(document.querySelector('#hoja-bg .modal')).transform) });
    const dyArriba = arriba === 'none' ? 0 : +arriba.split(',')[5].replace(')', '');
    ok(dyArriba <= 0 && dyArriba >= -12.5, 'con el dedo hacia arriba cede como mucho 12 px (' + dyArriba + ')');
    await p.waitForTimeout(400);
    ok(await abierta(), 'y no se cierra');
    /* De lado no es de la hoja. */
    await dedo(p, cdp, cab.x - 60, cab.y, cab.x + 80, cab.y + 10, { pasos: 10 });
    await p.waitForTimeout(300);
    ok(await abierta(), 'un deslizamiento de lado no la mueve');
    /* El cuerpo con scroll: bajar con el cuerpo a media lectura desplaza el cuerpo, no cierra. */
    await p.evaluate(() => { document.getElementById('hoja-b').scrollTop = 300; });
    const cu = await centro(p, '#hoja-b');
    await dedo(p, cdp, cu.x, cu.y - 100, cu.x, cu.y + 150, { pasos: 10 });
    await p.waitForTimeout(400);
    ok(await abierta(), 'con el cuerpo a media lectura, arrastrar hacia abajo desplaza el cuerpo y NO cierra la hoja');
    await p.evaluate(() => { document.getElementById('hoja-b').scrollTop = 0; });
    await p.waitForTimeout(50);
    const c1 = await cerradas();
    await dedo(p, cdp, cu.x, cu.y - 100, cu.x, cu.y + 160, { pasos: 10 });
    await p.waitForTimeout(420);
    ok(!(await abierta()) && (await cerradas()) === c1 + 1, 'con el cuerpo arriba del todo, el dedo la cierra desde el cuerpo');
    /* Latigazo corto: pocos px, pero rápido. */
    await abrir();
    const c2 = await cerradas();
    await dedo(p, cdp, cab.x, cab.y, cab.x, cab.y + 60, { pasos: 4, ms: 8 });
    await p.waitForTimeout(420);
    ok(!(await abierta()) && (await cerradas()) === c2 + 1, 'un latigazo de 60 px también la cierra: cuenta la velocidad del último tramo');
    /* Teclado: se abre con Enter y Escape la cierra (lo de la app sigue igual). */
    await p.focus('#abrir-hoja'); await p.keyboard.press('Enter'); await p.waitForTimeout(380);
    ok(await abierta(), 'con el teclado se abre');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    ok(!(await abierta()) && await p.evaluate(() => document.activeElement.id === 'abrir-hoja'), 'Escape la cierra y el foco vuelve al botón');
  }

  /* ---------- 22 · La tarjeta viaja ---------- */
  {
    await alVista(p, '#cols');
    const hayVT = await p.evaluate(() => typeof document.startViewTransition === 'function');
    const avanzar = async (como, id) => {
      const sel = '[data-avanza="' + id + '"]';
      if (como === 'raton') await p.click(sel);
      else if (como === 'dedo') { const c = await centro(p, sel); await p.touchscreen.tap(c.x, c.y); }
      else { await p.focus(sel); await p.keyboard.press('Enter'); }
      const durante = await p.evaluate(() => document.documentElement.classList.contains('vt-pieza'));
      await p.evaluate(() => window.__v.viaje);
      await p.waitForTimeout(60);
      return durante;
    };
    const col = id => p.evaluate(i => { const t = document.getElementById('tj' + i); return t ? t.parentElement.querySelector('h3').textContent : null; }, id);
    const durante = await avanzar('raton', 1);
    ok((await col(1)) === 'En taller 2', 'con el ratón, la tarjeta cambia de columna y la cuenta con ella');
    ok(quieto ? !durante : (hayVT ? durante : true), quieto ? 'con menos movimiento no hay transición: solo el repintado' : 'con una transición de vista mientras viaja');
    ok(await p.evaluate(() => !document.documentElement.classList.contains('vt-pieza') && ![...document.querySelectorAll('*')].some(e => e.style.viewTransitionName)),
      'y al terminar no queda ningún nombre de transición puesto');
    await avanzar('dedo', 2);
    ok((await col(2)) === 'En taller 3', 'con el dedo, igual');
    await avanzar('teclado', 3);
    ok((await col(3)) === 'Listo 1', 'con el teclado, igual');
    /* Las pantallas entran según su lugar. */
    await p.click('#tabs [data-i="1"]');
    const va = await p.evaluate(() => document.documentElement.dataset.va || '');
    await p.evaluate(() => window.__v.pantalla); await p.waitForTimeout(40);
    ok((await p.textContent('#pantalla')) === 'Pantalla dos' && (quieto ? va === '' : va === 'adelante'),
      quieto ? 'la pantalla cambia sin dirección con menos movimiento' : 'la pantalla siguiente entra desde la derecha (data-va="adelante")', va);
    ok(await p.evaluate(() => !document.documentElement.dataset.va), 'y la dirección se quita al terminar');
    /* Sin View Transitions, el FLIP de respaldo. */
    if (!quieto) {
      await p.evaluate(() => { window.__vt = document.startViewTransition; document.startViewTransition = undefined; window.__v.tr = [{ id: 9 }]; });
      await p.evaluate(() => { document.getElementById('tj1').parentElement.parentElement; });
      const huboFlip = await p.evaluate(async () => {
        const antes = document.getElementById('tj1').getBoundingClientRect().left;
        document.querySelector('#tabs [data-i="0"]').click();
        await window.__v.pantalla;
        const P = window.Piezas, col = document.getElementById('cols');
        const html = col.innerHTML.replace('id="tj1"', 'id="tjX"');
        let anim = 0;
        const pr = P.transicion(() => { col.innerHTML = col.innerHTML; }, { nombres: { t1: '#tj1' } });
        anim += document.getAnimations().length;
        await pr;
        const pr2 = P.transicion(() => { document.getElementById('pantalla').textContent = 'Pantalla una'; }, { contenedor: '#pantalla', direccion: 'atras' });
        const a2 = document.getElementById('pantalla').getAnimations().length;
        await pr2;
        document.startViewTransition = window.__vt;
        return { a2, antes, html: html.length > 0 };
      });
      ok(huboFlip.a2 > 0, 'sin View Transitions, la pantalla entra con su animación de respaldo (Web Animations)', huboFlip);
    }
    /* P.flip, para muchas piezas (las del anidador): viajan las que se movieron, de matriz a
       matriz si son de SVG —su transform es translate() y rotate()—, y las demás se quedan quietas. */
    const fl = await p.evaluate(async () => {
      const caja = document.createElement('div');
      caja.innerHTML = '<svg id="mesa" width="200" height="100" viewBox="0 0 200 100"><g id="pz1" transform="translate(10 10)"><rect width="20" height="20"/></g><g id="pz2" transform="translate(60 10)"><rect width="20" height="20"/></g></svg>';
      document.body.appendChild(caja);
      const svg = caja.querySelector('svg');
      const r = await window.Piezas.flip('#mesa g[id]', () => {
        svg.innerHTML = '<g id="pz1" transform="translate(120 40) rotate(90)"><rect width="20" height="20"/></g><g id="pz2" transform="translate(60 10)"><rect width="20" height="20"/></g>';
        window.__flipAnims = [...svg.querySelectorAll('g')].map(g => g.getAnimations().length);
      }, { clase: 'se-movio' });
      const tras = [...svg.querySelectorAll('g')].map(g => g.getAnimations().length);
      caja.remove();
      return { movidos: r.map(e => e.id), tras };
    });
    ok(quieto ? fl.movidos.length === 0 : fl.movidos.join() === 'pz1', quieto ? 'P.flip no mueve nada con menos movimiento' : 'P.flip mueve la pieza que cambió de lugar y de giro, y deja quieta la otra', fl);
    ok(fl.tras.every(n => n === 0), 'y al terminar no le queda ninguna animación puesta');
  }

  /* ---------- 21 · El tema en círculo ---------- */
  {
    const temaDe = () => p.evaluate(() => document.documentElement.dataset.tema);
    const t0 = await temaDe();
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.click('#b-tema');
    const revela = await p.evaluate(() => document.documentElement.classList.contains('tema-revela'));
    await p.waitForTimeout(520);
    const t1 = await temaDe();
    ok(t1 !== t0, 'con el ratón, el botón cambia el tema (' + t0 + ' → ' + t1 + ')');
    ok(quieto ? !revela : revela, quieto ? 'con menos movimiento cambia de golpe, sin revelado' : 'con el revelado en círculo mientras cambia');
    ok(await p.evaluate(() => !document.documentElement.classList.contains('tema-revela')), 'y la marca del revelado se quita al terminar');
    const c = await centro(p, '#b-tema');
    await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(520);
    ok((await temaDe()) === t0, 'con el dedo, vuelve');
    await p.focus('#b-tema'); await p.keyboard.press('Enter'); await p.waitForTimeout(520);
    ok((await temaDe()) === t1, 'con el teclado, también (el círculo sale del centro del botón)');
    await p.keyboard.press('Enter'); await p.waitForTimeout(520);
    ok((await temaDe()) === t0, 'y se deja como estaba');
  }

  /* ---------- 10 · Bordes que se desvanecen ---------- */
  {
    await alVista(p, '#chips');
    const clases = sel => p.evaluate(s => { const e = document.querySelector(s); return { antes: e.classList.contains('hay-antes'), despues: e.classList.contains('hay-despues'), mask: getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage }; }, sel);
    let k = await clases('#chips');
    ok(!k.antes && k.despues && /gradient/.test(k.mask), 'la fila de fichas se funde solo por la derecha, donde queda más', k);
    const ch = await centro(p, '#chips');
    await p.mouse.move(ch.x, ch.y); await p.mouse.wheel(900, 0); await p.waitForTimeout(250);
    k = await clases('#chips');
    ok(k.antes && !k.despues, 'con la rueda del ratón hasta el final: se funde por la izquierda y la derecha se apaga', k);
    await p.evaluate(() => { document.getElementById('chips').scrollLeft = 0; }); await p.waitForTimeout(120);
    await dedo(p, cdp, ch.r.x + ch.r.width - 20, ch.y, ch.r.x + 30, ch.y, { pasos: 10 });
    await p.waitForTimeout(400);
    k = await clases('#chips');
    ok(k.antes, 'con el dedo también: al salir del principio aparece el borde de la izquierda', k);
    await p.evaluate(() => { document.getElementById('chips').scrollLeft = 0; }); await p.waitForTimeout(120);
    await p.focus('#chip-ult'); await p.waitForTimeout(200);
    /* Fuera del borde fundido: o le queda el margen de la máscara, o la máscara de su lado ya se
       apagó porque es la última. */
    const vis = await p.evaluate(() => {
      const f = document.getElementById('chips'), c = f.getBoundingClientRect(), r = document.getElementById('chip-ult').getBoundingClientRect();
      return { dentro: r.left >= c.left - 0.5 && r.right <= c.right + 0.5, margen: c.right - r.right, despues: f.classList.contains('hay-despues') };
    });
    ok(vis.dentro && (vis.margen >= 31 || !vis.despues), 'con el teclado, la ficha enfocada se corre fuera del borde fundido: se lee entera', vis);
    await p.evaluate(() => { document.getElementById('chips').scrollLeft = 0; }); await p.waitForTimeout(120);
    await p.focus('#chips .chip:nth-child(4)'); await p.waitForTimeout(200);
    const vis4 = await p.evaluate(() => {
      const f = document.getElementById('chips'), c = f.getBoundingClientRect(), r = document.querySelector('#chips .chip:nth-child(4)').getBoundingClientRect();
      return { izq: r.left - c.left, der: c.right - r.right };
    });
    ok(vis4.izq >= 31 && vis4.der >= 31, 'y una de en medio queda con el margen de la máscara de los dos lados', vis4);
    let v = await clases('#lista-v');
    ok(!v.antes && v.despues, 'la lista vertical se funde abajo', v);
    await p.evaluate(() => { const l = document.getElementById('lista-v'); l.scrollTop = l.scrollHeight; }); await p.waitForTimeout(150);
    v = await clases('#lista-v');
    ok(v.antes && !v.despues, 'y al llegar al final, solo arriba', v);
  }

  /* ---------- 11 · Desenfoque progresivo ---------- */
  {
    await p.evaluate(() => window.scrollTo(0, 300)); await p.waitForTimeout(250);
    const b = await p.evaluate(() => {
      const [arr, aba] = ['arriba', 'abajo'].map(l => document.querySelector('.desenfoque-borde.' + l));
      const m = document.getElementById('mbar').getBoundingClientRect();
      const r = aba.getBoundingClientRect();
      const x = innerWidth / 2, y = m.top - 12;
      const debajo = document.elementFromPoint(x, y);
      return { hay: !!aba && !aba.hidden, activa: aba.classList.contains('activa'), z: getComputedStyle(aba).zIndex,
        zBarra: getComputedStyle(document.getElementById('mbar')).zIndex, pe: getComputedStyle(aba).pointerEvents,
        tope: Math.round(r.top), esperado: Math.round(m.top - 28), tapa: debajo === aba || aba.contains(debajo),
        arriba: !!arr && arr.classList.contains('activa'), mask: getComputedStyle(aba).maskImage || getComputedStyle(aba).webkitMaskImage };
    });
    ok(b.hay && b.activa, 'la franja de abajo está encendida con la página a medio camino', b);
    ok(+b.z === +b.zBarra - 1, 'una capa por debajo del dock (' + b.z + ' bajo ' + b.zBarra + ')');
    ok(Math.abs(b.tope - b.esperado) <= 2, 'y empieza 28 px arriba de su canto (' + b.tope + ' ≈ ' + b.esperado + ')');
    ok(b.pe === 'none' && !b.tapa, 'no tapa toques: lo que está debajo sigue siendo lo que se toca');
    ok(/gradient/.test(b.mask), 'fundida con su máscara');
    ok(b.arriba, 'la de arriba también, porque la página ya no está en su tope');
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(250);
    ok(await p.evaluate(() => !document.querySelector('.desenfoque-borde.abajo').classList.contains('activa')), 'al llegar al final ya no hay nada que fundir abajo: se apaga');
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(250);
    ok(await p.evaluate(() => !document.querySelector('.desenfoque-borde.arriba').classList.contains('activa')), 'y en el tope de la página se apaga la de arriba');
    await p.evaluate(() => { document.getElementById('mbar').hidden = true; }); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.querySelector('.desenfoque-borde.abajo').hidden), 'se esconde con su barra');
    await p.evaluate(() => { document.getElementById('mbar').hidden = false; }); await p.waitForTimeout(200);
    ok(await p.evaluate(() => !document.querySelector('.desenfoque-borde.abajo').hidden), 'y vuelve con ella');
  }

  /* ---------- 9 · El renglón que se desliza ---------- */
  {
    await alVista(p, '#filas');
    const est = id => p.evaluate(i => { const f = document.getElementById(i); const c = f.querySelector('.desliza-cara'); return { abierta: f.classList.contains('abierta'), tf: getComputedStyle(c).transform, x: c.style.transform }; }, id);
    const acciones = () => p.evaluate(() => window.__v.acciones.slice());
    let f1 = await centro(p, '#f1 .desliza-cara');
    await raton(p, f1.x + 60, f1.y, f1.x - 140, f1.y, { pasos: 10 });
    await p.waitForTimeout(350);
    let e = await est('f1');
    ok(e.abierta && /translateX\(-\d+/.test(e.x), 'con el ratón, arrastrar a la izquierda descubre sus acciones', e);
    const bor = await centro(p, '#f1 [data-acc="bor"]');
    await p.mouse.click(bor.x, bor.y); await p.waitForTimeout(100);
    ok((await acciones()).includes('bor'), 'y su botón corre el código de la pantalla');
    await p.waitForTimeout(300);
    ok(!(await est('f1')).abierta, 'el renglón se cierra después de la acción');
    const f2 = await centro(p, '#f2 .desliza-cara span');
    const antesP = await p.evaluate(() => window.__v.principal);
    const lista = await raton(p, f2.x - 40, f2.y, f2.x + 200, f2.y, { pasos: 12, alMedio: () => p.evaluate(() => document.getElementById('f2').classList.contains('lista')) });
    await p.waitForTimeout(120);
    ok(lista, 'pasado el umbral, el renglón avisa que soltar hará la acción principal');
    ok((await p.evaluate(() => window.__v.principal)) === antesP + 1, 'y al soltar, la corre (una vez)');
    await p.waitForTimeout(300);
    ok(!(await est('f2')).abierta && (await est('f2')).x === '', 'y la cara vuelve a su sitio');
    await raton(p, f2.x - 40, f2.y, f2.x - 10, f2.y, { pasos: 6, ms: 40 });
    await p.waitForTimeout(300);
    ok((await p.evaluate(() => window.__v.principal)) === antesP + 1, 'un poco a la derecha no dispara nada');
    /* El clic que sigue a un arrastre no es un toque: el «Abrir» visible de la cara no se corre. */
    const ab = await centro(p, '#f2 [data-acc="abrir-visible"]');
    const n0 = (await acciones()).filter(x => x === 'abrir-visible').length;
    await raton(p, ab.x, ab.y, ab.x - 150, ab.y, { pasos: 10 });
    await p.waitForTimeout(250);
    ok((await acciones()).filter(x => x === 'abrir-visible').length === n0, 'arrastrar empezando sobre un botón de la cara no lo pulsa');
    ok((await est('f2')).abierta, 'y abre el renglón');
    /* Con el dedo. Tocar fuera cierra el que estaba abierto. */
    await p.touchscreen.tap(10, 10); await p.waitForTimeout(350);
    ok(!(await est('f2')).abierta, 'tocar fuera cierra el renglón abierto');
    f1 = await centro(p, '#f1 .desliza-cara');
    await dedo(p, cdp, f1.x + 60, f1.y, f1.x - 140, f1.y, { pasos: 10 });
    await p.waitForTimeout(350);
    ok((await est('f1')).abierta, 'con el dedo, deslizar a la izquierda descubre las acciones');
    await p.touchscreen.tap(10, 10); await p.waitForTimeout(350);
    const y0 = await p.evaluate(() => scrollY);
    f1 = await centro(p, '#f1 .desliza-cara');
    await dedo(p, cdp, f1.x, f1.y + 20, f1.x + 6, f1.y - 160, { pasos: 10 });
    await p.waitForTimeout(400);
    e = await est('f1');
    ok((await p.evaluate(() => scrollY)) > y0 + 40 && !e.abierta && e.x === '', 'un dedo que va hacia arriba desplaza la página y no toca el renglón', { y0, e });
    /* Teclado: lo que el gesto descubre va fuera del tabulador salvo `soloAqui`. */
    const tab = await p.evaluate(() => ({
      f1: [...document.querySelectorAll('#f1 .desliza-acc')].every(b => b.tabIndex === -1) && document.querySelector('#f1 .desliza-acciones').getAttribute('aria-hidden') === 'true',
      f3: [...document.querySelectorAll('#f3 .desliza-acc')].every(b => b.tabIndex === 0) && !document.querySelector('#f3 .desliza-acciones').hasAttribute('aria-hidden'),
    }));
    ok(tab.f1 && tab.f3, 'las acciones que ya están a la vista en otro lado van mudas y fuera del Tab; las de `soloAqui`, no', tab);
    await p.focus('#f3 [data-acc="bor-medida"]'); await p.waitForTimeout(350);
    ok((await est('f3')).abierta, 'con el teclado, enfocar su acción abre el renglón');
    await p.keyboard.press('Escape'); await p.waitForTimeout(350);
    ok(!(await est('f3')).abierta, 'y Escape lo cierra');
    await p.evaluate(() => { localStorage.removeItem('vitrina-pista'); window.__v.filas.pista(); });
    const pista = await p.evaluate(() => ({ marca: localStorage.getItem('vitrina-pista'), anim: document.querySelector('#f1 .desliza-cara').getAnimations().length }));
    ok(quieto ? pista.anim === 0 : (pista.marca === '1' && pista.anim === 1), quieto ? 'la pista del gesto no corre con menos movimiento' : 'la pista del gesto asoma una vez y queda anotada', pista);
    await p.evaluate(() => window.__v.filas.pista());
    ok(await p.evaluate(() => document.querySelector('#f1 .desliza-cara').getAnimations().length) <= 1, 'y no se repite');
  }

  /* ---------- Entra lo nuevo, sale lo quitado ---------- */
  {
    await alVista(p, '#s-lista');
    await p.click('#lista-mas'); await p.waitForTimeout(60);
    const c = await centro(p, '#lista-mas'); await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(60);
    let r = await p.evaluate(() => ({ n: window.__v.ultimo.nuevos.length, h: [...document.querySelectorAll('#cola>div')].map(d => d.dataset.clave + ':' + d.className) }));
    ok(r.n === 1 && r.h[0].startsWith('S2:') && /lista-nueva/.test(r.h[0]), 'lo que llega entra marcado «nuevo», y solo eso', r);
    ok(quieto ? !/lista-entra/.test(r.h[0]) : /lista-entra/.test(r.h[0]), quieto ? 'sin entrada animada con menos movimiento' : 'con su entrada');
    const edad0 = await p.evaluate(() => parseFloat(document.querySelector('#cola>[data-clave="S2"]').style.getPropertyValue('--lista-edad')));
    await p.waitForTimeout(300);
    await p.focus('#lista-tecla'); await p.keyboard.press('Enter'); await p.waitForTimeout(40);
    r = await p.evaluate(() => { const s2 = document.querySelector('#cola>[data-clave="S2"]'); return { n: window.__v.ultimo.nuevos.length, cls: s2.className, edad: parseFloat(s2.style.getPropertyValue('--lista-edad')) }; });
    ok(r.n === 0 && /lista-nueva/.test(r.cls) && !/lista-entra/.test(r.cls), 'repintar (una tecla) no vuelve a hacer entrar a nadie', r);
    ok(r.edad < edad0 - 250, 'y la marca no se reinicia: el nodo nuevo hereda su edad (' + edad0 + ' → ' + r.edad + ' ms)');
    ok(await p.evaluate(() => /Llegó la Solicitud S2/.test(document.getElementById('vozStatus').textContent)), 'lo nuevo se anuncia al lector de pantalla');
    await p.click('#lista-menos');
    const fant = await p.evaluate(() => ({ q: window.__v.ultimo.quitados, g: document.querySelectorAll('#cola>.lista-se-va').length }));
    ok(fant.q.join() === 'S2', 'quitar la primera la reporta quitada', fant);
    ok(quieto ? fant.g === 0 : fant.g === 1, quieto ? 'y se va en seco con menos movimiento' : 'y se desvanece en su sitio mientras lo demás sube');
    await p.waitForTimeout(320);
    ok(await p.evaluate(() => document.querySelectorAll('#cola>.lista-se-va').length === 0 && document.querySelectorAll('#cola>div').length === 1), 'el fantasma se va al terminar');
    const vence = await p.evaluate(async () => {
      const div = document.createElement('div'); div.innerHTML = '<p data-clave="a">a</p>'; document.body.appendChild(div);
      const L = window.Piezas.listaViva(div, { marca: 250 });
      L.repintar(() => { div.insertAdjacentHTML('beforeend', '<p data-clave="b">b</p>'); });
      const antes = div.querySelector('[data-clave="b"]').classList.contains('lista-nueva');
      await new Promise(r => setTimeout(r, 420));
      const despues = div.querySelector('[data-clave="b"]').classList.contains('lista-nueva');
      L.destruir(); div.remove();
      return { antes, despues, igual: window.Piezas.listaViva(document.getElementById('cola')) === window.__v.lista };
    });
    ok(vence.antes && !vence.despues, 'la marca «nuevo» se va sola al vencer', vence);
    ok(vence.igual, 'y llamar otra vez sobre la misma lista devuelve el mismo control');
  }

  /* ---------- El pliegue ---------- */
  {
    await alVista(p, '#s-pliegue');
    const det = () => p.evaluate(() => { const d = document.getElementById('det'); return { open: d.open, alto: parseFloat(getComputedStyle(d, '::details-content').blockSize) || 0, fl: getComputedStyle(d.querySelector('.pliegue-flecha')).transform }; });
    await p.click('#det summary');
    await p.waitForTimeout(60);
    const medio = await det();
    await p.waitForTimeout(260);
    const fin = await det();
    ok(fin.open && fin.alto > 60, 'con el ratón, el pliegue abre', fin);
    ok(quieto ? medio.alto === fin.alto : (medio.alto > 0 && medio.alto < fin.alto), quieto ? 'en seco con menos movimiento' : 'con su altura: a los 60 ms va a medio camino (' + medio.alto + ' de ' + fin.alto + ')');
    ok(/matrix\(-1/.test(fin.fl), 'y la flecha giró', fin.fl);
    await p.focus('#det summary'); await p.keyboard.press('Enter'); await p.waitForTimeout(280);
    ok(!(await det()).open, 'con el teclado se cierra');
    const s = await centro(p, '#det summary'); await p.touchscreen.tap(s.x, s.y); await p.waitForTimeout(280);
    ok((await det()).open, 'con el dedo se abre');
    await p.evaluate(() => { document.getElementById('det').open = false; window.Piezas.abrirSinAnimar('#det'); });
    const quietoAbre = await det();
    ok(quietoAbre.open && quietoAbre.alto > 60, 'abrirSinAnimar reabre en el acto, sin la animación (lo que hace renderAuth)', quietoAbre);
    const pl = () => p.evaluate(() => { const e = document.getElementById('pleg'), b = document.getElementById('pleg-b'), c = document.getElementById('pleg-campo'); return { ab: e.classList.contains('abierto'), exp: b.getAttribute('aria-expanded'), vis: getComputedStyle(c).visibility, alto: e.getBoundingClientRect().height }; });
    await p.click('#pleg-b'); await p.waitForTimeout(280);
    let q = await pl();
    ok(q.ab && q.exp === 'true' && q.vis === 'visible' && q.alto > 30, 'el plegable de clases abre, con aria-expanded', q);
    await p.focus('#pleg-b'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    q = await pl();
    ok(!q.ab && q.exp === 'false' && q.vis === 'hidden' && q.alto < 1, 'con el teclado se cierra, y lo de dentro sale del tabulador', q);
    const b2 = await centro(p, '#pleg-b'); await p.touchscreen.tap(b2.x, b2.y); await p.waitForTimeout(280);
    ok((await pl()).ab, 'con el dedo se abre');
  }

  /* ---------- Páginas con scroll-snap ---------- */
  {
    await alVista(p, '#paginas');
    const pg = () => p.evaluate(() => ({ i: window.__v.paginas.actual(), cur: [...document.querySelectorAll('.paginas-punto')].findIndex(b => b.getAttribute('aria-current') === 'true'),
      voz: document.getElementById('vozStatus').textContent, rot: [...document.querySelectorAll('#paginas>*')].map(x => x.getAttribute('aria-label')) }));
    let g = await pg();
    ok(g.i === 0 && g.cur === 0 && g.rot[1] === 'Hoja 2 de 4', 'la tira sabe en qué hoja está y cada hoja dice «Hoja n de 4»', g);
    ok(await p.evaluate(() => document.querySelectorAll('.paginas-punto').length === 4 && document.querySelector('.paginas-flecha').disabled), 'cuatro puntos, y la flecha de atrás apagada en la primera');
    await p.click('.paginas-flecha[data-pag="1"]'); await p.waitForTimeout(900);
    g = await pg();
    ok(g.i === 1 && g.cur === 1, 'con el ratón, la flecha lleva a la siguiente', g);
    ok(/Hoja 2 de 4/.test(g.voz), 'y se anuncia «Hoja 2 de 4» al asentarse', g.voz);
    await p.focus('#paginas'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
    ok((await pg()).i === 2, 'con el teclado, la flecha derecha avanza');
    await p.keyboard.press('Home'); await p.waitForTimeout(900);
    ok((await pg()).i === 0, 'e Inicio regresa a la primera');
    const t = await centro(p, '#paginas');
    await dedo(p, cdp, t.x + 110, t.y, t.x - 110, t.y, { pasos: 10, ms: 16 });
    await p.waitForTimeout(1000);
    ok((await pg()).i === 1, 'con el dedo, deslizar cambia de hoja', await pg());
    const pt = await centro(p, '.paginas-punto[data-pag-ir="3"]'); await p.touchscreen.tap(pt.x, pt.y); await p.waitForTimeout(900);
    ok((await pg()).i === 3, 'y tocar un punto lleva a su hoja');
  }

  /* ---------- La silueta ---------- */
  {
    await alVista(p, '#s-silueta');
    await p.focus('#cargar'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
    const s = await p.evaluate(() => {
      const sil = document.querySelector('#sil>.silueta'), b = sil && sil.querySelector('.esq-b');
      const a = b ? b.getAnimations({ subtree: true }).filter(x => x.effect.pseudoElement === '::after' || x.effect.target !== b) : [];
      return { hay: !!sil, busy: sil && sil.getAttribute('aria-busy'), status: !!(sil && sil.querySelector('[role=status]')),
        texto: sil && sil.textContent.trim(), vueltas: a.map(x => x.effect.getComputedTiming().iterations), mudo: sil && sil.querySelector('.silueta-dibujo').getAttribute('aria-hidden') };
    });
    ok(s.hay && s.busy === 'true' && s.status && s.mudo === 'true' && s.texto === 'Leyendo el taller…', 'la silueta ocupa el lugar, muda, con su texto de estado', s);
    ok(quieto ? s.vueltas.every(v => v === 0) || !s.vueltas.length : s.vueltas.length > 0 && s.vueltas.every(v => v === 1),
      quieto ? 'sin brillo con menos movimiento' : 'con un brillo que pasa UNA vez, no en bucle', s.vueltas);
    await p.evaluate(() => window.__v.silueta.quitar('<p>Listo</p>'));
    ok(await p.evaluate(() => document.getElementById('sil').textContent === 'Listo' && !document.getElementById('sil').hasAttribute('aria-busy')), 'y se quita al llegar lo de verdad');
    const c = await centro(p, '#cargar'); await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(50);
    ok(await p.evaluate(() => !!document.querySelector('#sil>.silueta')), 'con el dedo, igual');
    await p.evaluate(() => window.__v.silueta.quitar('<p>Listo</p>'));
  }

  /* ---------- Lo que se rompía y no daba error ----------
     Cada uno de estos salió de intentar romper la pieza a mano, y ninguno avisaba: la acción se
     repetía sin que se viera, el foco se quedaba en un botón invisible, el gesto se moría, los
     puntos de 44 px se encogían o desaparecían. Se quedan aquí porque son justo los que vuelven
     al primer descuido. */
  {
    /* Páginas. Ningún botón de la barra se encoge, así que la barra tiene que decidir qué cabe:
       primero suelta las flechas ‹ › —los puntos son de todos, las flechas son del ratón— y solo
       si tampoco así caben dice «n / 7». Las fichas P28 (cinco columnas) y A12 (hasta tres hojas)
       piden PUNTOS, uno por página y de 44 px. */
    await alVista(p, '#paginas');
    const barra = n => p.evaluate(async k => {
      const t = document.getElementById('paginas');
      t.innerHTML = Array.from({ length: k }, (_, i) => '<div class="pag">Etapa ' + (i + 1) + '</div>').join('');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = document.querySelector('.paginas-barra');
      return { puntos: b.querySelectorAll('.paginas-punto').length, flechas: b.querySelectorAll('.paginas-flecha').length,
        cuenta: (b.querySelector('.paginas-cuenta') || {}).textContent || '',
        chico: [...b.querySelectorAll('button')].some(x => x.getBoundingClientRect().width < 43.5 || x.getBoundingClientRect().height < 43.5) };
    }, n);
    const b5 = await barra(5);
    ok(b5.puntos === 5 && !b5.chico, 'con cinco páginas hay cinco puntos, y ninguno baja de 44 px', b5);
    ok(await desborde(p) <= 0, 'sin que la barra se salga a lo ancho', await desborde(p));
    const b7 = await barra(7);
    ok(b7.puntos === 0 && /^\d+ \/ 7$/.test(b7.cuenta) && b7.flechas === 2 && !b7.chico, 'con siete, la barra dice «n / 7» entre sus flechas', b7);
    const ciclo = await p.evaluate(async () => {
      window.__v.cambios.length = 0;
      const t = document.getElementById('paginas');
      t.innerHTML = t.innerHTML;                       // un repintado como el de las pantallas
      await new Promise(r => setTimeout(r, 200));
      return window.__v.cambios.slice();
    });
    ok(ciclo.length === 0, 'y repintar las páginas sin cambiar de página no vuelve a avisar a la pantalla (una que repinte desde ahí entraría en ciclo)', ciclo);
    await barra(4);

    /* El renglón. Los 260 ms en que la cara vuelve a su sitio dejaban las acciones a la
       intemperie: el segundo toque en el mismo punto caía sobre «Ya se armó» y lo corría otra
       vez; y un segundo latigazo seguido se perdía porque el gesto se anclaba a la cara. */
    await alVista(p, '#filas');
    const cara2 = await centro(p, '#f2 .desliza-cara');
    const dosVeces = await p.evaluate(() => { window.__v.principal = 0; return 0; });
    await dedo(p, cdp, cara2.r.x + 20, cara2.y, cara2.r.x + 260, cara2.y, { pasos: 8, ms: 8 });
    await p.waitForTimeout(60);
    await p.touchscreen.tap(cara2.r.x + 20, cara2.y);   // con la cara todavía volviendo
    await p.waitForTimeout(500);
    ok((await p.evaluate(() => window.__v.principal)) === 1, 'un latigazo y un toque en el hueco que deja la cara: la acción principal corre UNA vez', dosVeces);
    await p.evaluate(() => { window.__v.principal = 0; });
    for (let i = 0; i < 2; i++) {
      await dedo(p, cdp, cara2.r.x + 20, cara2.y, cara2.r.x + 260, cara2.y, { pasos: 8, ms: 8 });
      await p.waitForTimeout(60);
    }
    await p.waitForTimeout(500);
    ok((await p.evaluate(() => window.__v.principal)) === 2, 'y dos latigazos seguidos cuentan los dos: el segundo ya no se pierde');

    /* El foco después de una acción. La cara de un renglón `soloAqui` no tiene nada enfocable
       —se usa `soloAqui` PORQUE no hay otro botón—, así que el foco se quedaba en la acción
       invisible, o se caía al <body> y el Tab siguiente empezaba desde arriba de la página. */
    await p.focus('#f3 [data-acc="bor-medida"]'); await p.waitForTimeout(300);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const foco = await p.evaluate(() => { const a = document.activeElement; return { cara: a.classList.contains('desliza-cara'), enF3: document.getElementById('f3').contains(a), tab: a.tabIndex, mudo: !!(a.closest && a.closest('[aria-hidden="true"]')) }; });
    ok(foco.cara && foco.enF3 && foco.tab === -1 && !foco.mudo, 'Escape cierra el renglón y devuelve el foco a su cara, fuera del tabulador y no a algo invisible', foco);

    /* La lista. Un renglón que se está yendo es transparente, pero sus botones seguían encima de
       la lista hasta que llegara el repintado; y si el repintado no llega (falló el borrado), se
       quedaba así para siempre. */
    const yendo = await p.evaluate(async () => {
      const div = document.createElement('div'); div.innerHTML = '<p data-clave="a"><button>x</button></p>';
      document.body.appendChild(div);
      const L = window.Piezas.listaViva(div);
      const el = div.firstElementChild;
      L.quitar(el);
      const r = { aria: el.getAttribute('aria-hidden'), inerte: el.inert === true, pe: el.style.pointerEvents };
      await new Promise(x => setTimeout(x, 260));
      L.repintar(() => {});                            // el borrado falló: el renglón sigue
      r.vuelve = { aria: el.getAttribute('aria-hidden'), inerte: el.inert === true, op: getComputedStyle(el).opacity };
      L.destruir(); div.remove();
      return r;
    });
    ok(yendo.aria === 'true' && yendo.inerte && yendo.pe === 'none', 'el renglón que se va deja de tocarse y de oírse en el acto, no al terminar el fundido', yendo);
    ok(yendo.vuelve.aria === null && !yendo.vuelve.inerte && +yendo.vuelve.op === 1, 'y si el repintado lo deja vivo, vuelve entero', yendo.vuelve);

    /* mostrar(): lo que llega se ve moviendo SOLO su caja con scroll. Un scrollIntoView movía la
       página debajo del dedo mientras el escalador mide sobre la foto (H24). */
    const most = await p.evaluate(async () => {
      const caja = document.createElement('div');
      caja.style.cssText = 'height:80px;overflow-y:auto';
      caja.innerHTML = Array.from({ length: 12 }, (_, i) => '<p data-clave="m' + i + '" style="margin:0;height:30px">m' + i + '</p>').join('');
      document.body.appendChild(caja);
      const L = window.Piezas.listaViva(caja);
      const y0 = scrollY, s0 = caja.scrollTop;
      L.mostrar(caja.lastElementChild);
      await new Promise(r => setTimeout(r, 400));
      const r = { pagina: scrollY - y0, caja: caja.scrollTop - s0 };
      L.destruir(); caja.remove();
      return r;
    });
    ok(most.caja > 100 && most.pagina === 0, 'mostrar() mueve la caja con scroll y deja la página quieta', most);

    /* Los bordes, con un SELECTOR: casi todas sus filas se rehacen con innerHTML (la fórmula de
       material viene en cada renglón, F30), y con un control por elemento cada repintado dejaba
       colgados sus observadores sobre un nodo muerto y solo se atendía la primera fila. */
    const sel = await p.evaluate(async () => {
      const caja = document.createElement('div'); caja.id = 'sel-caja';
      const pintar = n => { caja.innerHTML = Array.from({ length: n }, () => '<div class="mat-f" style="display:flex;overflow-x:auto;width:120px"><span style="flex:none;width:90px">uno</span><span style="flex:none;width:90px">dos</span></div>').join(''); };
      document.body.appendChild(caja); pintar(2);
      const c = window.Piezas.bordesDesvanecidos('.mat-f', { eje: 'x' });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const antes = document.querySelectorAll('.mat-f.bordes.hay-despues').length;
      pintar(3);                                       // la pantalla repinta y no vuelve a llamar
      await new Promise(r => setTimeout(r, 200));
      const despues = document.querySelectorAll('.mat-f.bordes.hay-despues').length;
      c.destruir(); caja.remove();
      await new Promise(r => setTimeout(r, 60));
      return { antes, despues, sueltas: document.querySelectorAll('.bordes.mat-f').length };
    });
    ok(sel.antes === 2 && sel.despues === 3 && sel.sueltas === 0, 'con un selector, los bordes se ponen en TODAS las filas y siguen ahí después de un repintado, sin que nadie vuelva a llamar', sel);

    /* La hoja que la pantalla rehace a medio gesto (repintarEnSitio de la plataforma). Un
       touchmove va SIEMPRE al nodo donde empezó el toque, y si ese nodo ya no está en el
       documento no sube hasta `document`: con los oyentes solo ahí, el gesto se quedaba vivo
       para siempre y no se podía volver a arrastrar nada. */
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    await abrir();
    const cabR = await centro(p, '#hoja-bg .modal-h b');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cabR.x, y: cabR.y, id: 1 }] });
    for (let i = 1; i <= 5; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cabR.x, y: cabR.y + i * 8, id: 1 }] }); await espera(16); }
    await p.evaluate(() => { const bg = document.getElementById('hoja-bg'); bg.innerHTML = bg.innerHTML.replace(/ style="[^"]*"/g, ''); });
    for (let i = 6; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cabR.x, y: cabR.y + i * 8, id: 1 }] }); await espera(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(500);
    const tras = await p.evaluate(() => { const bg = document.getElementById('hoja-bg'); return { sigue: bg.classList.contains('hoja-velo-sigue'), arr: bg.style.getPropertyValue('--arrastre'), abierta: bg.classList.contains('show') }; });
    ok(tras.abierta && !tras.sigue && !tras.arr, 'si la pantalla rehace la hoja a medio gesto, el arrastre se suelta y el velo vuelve a su tinte', tras);
    const cab2 = await centro(p, '#hoja-bg .modal-h b');
    const cAntes = await cerradas();
    await dedo(p, cdp, cab2.x, cab2.y, cab2.x, cab2.y + 200, { pasos: 10 });
    await p.waitForTimeout(500);
    ok(!(await abierta()) && (await cerradas()) === cAntes + 1, 'y el gesto siguiente vuelve a cerrar la hoja: no se quedó colgado', cAntes);

    /* Una capa puede negarse a cerrar (algo sin guardar). La hoja regresa sola con su transición
       y el velo tiene que regresar con ella, no quedarse aclarado hasta que venza el reloj. */
    await abrir();
    await p.evaluate(() => { window.__v.niega = true; });
    const cabN = await centro(p, '#hoja-bg .modal-h b');
    await dedo(p, cdp, cabN.x, cabN.y, cabN.x, cabN.y + 200, { pasos: 10 });
    await p.waitForTimeout(120);
    const niega = await p.evaluate(() => { const bg = document.getElementById('hoja-bg'); const a = (getComputedStyle(bg).backgroundColor.match(/[\d.]+/g) || []).map(Number); return { abierta: bg.classList.contains('show'), negadas: window.__v.negadas, arr: bg.style.getPropertyValue('--arrastre'), alfa: a.length > 3 ? a[3] : 1 }; });
    ok(niega.abierta && niega.negadas >= 1 && niega.arr === '0', 'con una capa que se niega a cerrar, el velo vuelve con la hoja en vez de quedarse a medias', niega);
    /* Con Escape y no con la ×: el rehecho de arriba cambió el nodo de la × y la vitrina se la
       tenía colgada al viejo (la plataforma de verdad reparte sus clics por delegación). */
    await p.evaluate(() => { window.__v.niega = false; });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    ok(!(await abierta()), 'y Escape la cierra después');

    /* El toque que se traga una transición de vista. Mientras dura el viaje, Chrome manda TODO
       toque al <html> —la página se ve viva y no recibe nada—, así que dos toques seguidos en
       «Avanzar» avanzaban uno. */
    if (!quieto && await p.evaluate(() => typeof document.startViewTransition === 'function')) {
      await alVista(p, '#s-hoja');
      await p.evaluate(() => { window.__tr = []; document.addEventListener('pointerdown', e => window.__tr.push(e.target.tagName + '#' + (e.target.id || '')), true); });
      await p.evaluate(() => { window.Piezas.transicion(() => { document.getElementById('pantalla').textContent = 'tragado'; }, { contenedor: '#pantalla', direccion: 'adelante', duracion: 1200 }); });
      await p.waitForTimeout(120);
      const bt = await centro(p, '#abrir-hoja');
      await p.mouse.click(bt.x, bt.y);
      await p.waitForTimeout(900);
      ok(await abierta(), 'un toque que se traga una transición de vista llega a su botón igual',
        await p.evaluate(() => ({ tr: window.__tr, vt: document.documentElement.classList.contains('vt-pieza'), show: document.getElementById('hoja-bg').className })));
      await p.evaluate(() => { document.getElementById('cerrar-hoja').click(); });
      await p.waitForTimeout(400);
    }
  }

  /* ---------- Idempotencia ---------- */
  ok(await p.evaluate(() => {
    const P = window.Piezas;
    return P.bordesDesvanecidos('#chips') === window.__v.bordes && P.paginas('#paginas') === window.__v.paginas &&
      P.filasDeslizables('#filas') === window.__v.filas && P.plegables(document) === window.__v.plegables &&
      P.desenfoqueProgresivo('#mbar', { lado: 'abajo' }) === window.__v.banda && document.querySelectorAll('.desenfoque-borde').length === 2 &&
      P.hojasDeslizables({ hoja: '.modal-bg.show>.modal', cierre: () => null }) === window.__v.hoja && document.querySelectorAll('.paginas-barra').length === 1;
  }), 'cada pieza, llamada dos veces sobre lo mismo, devuelve el mismo control y no duplica nada');

  /* ---------- Al final: nada se mueve solo, nada se sale, nada tronó ---------- */
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(1200);
  const infFin = await infinitas(p);
  ok(!infFin.length, 'en reposo, ninguna animación infinita', infFin);
  ok(await desborde(p) <= 0, 'sin desborde horizontal después de todo');
  ok(!errs.length, 'cero errores de página', errs);
  if (CAPTURAS && ancho === 360 && mov !== 'reduce') {
    await p.screenshot({ path: CAPTURAS + '/vitrina-' + tema + '.png', fullPage: true });
    await p.evaluate(() => { document.getElementById('abrir-hoja').click(); }); await p.waitForTimeout(400);
    await p.screenshot({ path: CAPTURAS + '/vitrina-hoja-' + tema + '.png' });
  }
  await ctx.close();
}

/* ======================================================================================== */
async function apps() {
  console.log('\n── LAS DOS APPS CUELGAN LA MISMA HOJA ──');
  const ctx = await nav.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__ph')) {
        localStorage.setItem('al3d_pf_rol', 'direccion');
        localStorage.setItem('al3d_pf_nombre', 'Beto');
        localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
        localStorage.setItem('al3d_tema', 'claro');
        sessionStorage.setItem('__ph', '1');
      }
    } catch (_) {}
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  /* El cotizador suelto (?solo=1: sin él se va a la plataforma). La pregunta de confirmar() es
     una hoja pegada abajo en el teléfono, con su encabezado, su cuerpo y su entrada de historial. */
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const piezas = await p.evaluate(() => ({ hoja: typeof window.Piezas.hojasDeslizables,
    franjas: [...document.querySelectorAll('.desenfoque-borde')].map(b => b.className + ' z' + getComputedStyle(b).zIndex) }));
  ok(piezas.hoja === 'function' && piezas.franjas.some(c => /abajo.* z44/.test(c)) && piezas.franjas.some(c => /arriba.* z29/.test(c)),
    'el cotizador carga la pieza y las franjas de su dock y de su barra de arriba, una capa por debajo de cada una', piezas);
  await p.evaluate(() => { window.__conf = confirmar({ titulo: '¿Seguro?', texto: 'Prueba de la hoja' }); });
  await p.waitForTimeout(500);
  const ia = () => p.evaluate(() => document.getElementById('confmodal').classList.contains('show'));
  ok(await ia(), 'la pregunta del cotizador abre como hoja');
  const estado0 = await p.evaluate(() => JSON.stringify(history.state));
  const cab = await p.evaluate(() => { const r = document.querySelector('#confmodal .modal-h b').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const medio = await dedo(p, cdp, cab.x, cab.y, cab.x, cab.y + 260, { pasos: 12, alMedio: () => p.evaluate(() => {
    const bg = document.getElementById('confmodal'), m = bg.querySelector('.modal');
    const a = (getComputedStyle(bg).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    return { op: getComputedStyle(bg).opacity, opM: getComputedStyle(m).opacity, sigue: bg.classList.contains('hoja-velo-sigue'), tf: getComputedStyle(m).transform, alfa: a.length > 3 ? a[3] : 1 };
  }) });
  ok(medio.sigue && medio.op === '1' && medio.opM === '1' && /matrix/.test(medio.tf) && medio.alfa < 0.5, 'con el dedo, la hoja del cotizador baja y el velo se aclara en su tinte sin llevársela', medio);
  await p.waitForTimeout(600);
  ok(!(await ia()), 'y la hoja se cierra por la función de su capa');
  ok(await p.evaluate(async () => (await window.__conf) === false), 'contestando «no», como la ×');
  const estado1 = await p.evaluate(() => JSON.stringify(history.state));
  ok(!/"capa":"confmodal"/.test(estado1), 'y consumió su entrada de historial', { estado0, estado1 });
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
  const tema0 = await p.evaluate(() => document.documentElement.dataset.tema);
  const botonTema = await p.evaluate(() => { const b = [...document.querySelectorAll('[data-tema-btn]')].find(x => x.getClientRects().length); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (botonTema) {
    await p.touchscreen.tap(botonTema.x, botonTema.y);
    const revela = await p.evaluate(() => document.documentElement.classList.contains('tema-revela'));
    await p.waitForTimeout(600);
    ok(revela && (await p.evaluate(() => document.documentElement.dataset.tema)) !== tema0, 'el botón del tema del cotizador abre el tema nuevo en círculo');
    await p.touchscreen.tap(botonTema.x, botonTema.y); await p.waitForTimeout(600);
  } else mal('no se encontró el botón del tema en el cotizador');

  /* La plataforma: la pregunta de confirmarPf() es una capa con entrada de historial. */
  await p.goto(B + '/#/hoy', { waitUntil: 'load' });
  await p.waitForTimeout(1800);
  const franja = await p.evaluate(() => { const b = document.querySelector('.desenfoque-borde.abajo'); const d = document.getElementById('pf-abajo'); return b && { z: getComputedStyle(b).zIndex, zD: getComputedStyle(d).zIndex, oculta: b.hidden }; });
  ok(franja && !franja.oculta && +franja.z === +franja.zD - 1, 'la plataforma pone su franja debajo de la barra de módulos', franja);
  await p.evaluate(() => { window.__conf = import('./js/nucleo/ui.js').then(m => m.confirmarPf({ titulo: '¿Seguro?', texto: 'Prueba de la hoja' })); });
  await p.waitForTimeout(600);
  const conf = () => p.evaluate(() => { const c = document.getElementById('pf-confirma'); return !!c && c.classList.contains('show'); });
  ok(await conf(), 'la pregunta de la plataforma abre como hoja');
  const h = await p.evaluate(() => { const r = document.querySelector('#pf-confirma .pf-panel-h').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const medioPf = await dedo(p, cdp, h.x, h.y, h.x, h.y + 200, { pasos: 12, alMedio: () => p.evaluate(() => {
    const bg = document.getElementById('pf-confirma'), m = bg.querySelector('.pf-panel');
    const a = (getComputedStyle(bg).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    return { op: getComputedStyle(bg).opacity, opM: getComputedStyle(m).opacity, sigue: bg.classList.contains('hoja-velo-sigue'), tf: getComputedStyle(m).transform, alfa: a.length > 3 ? a[3] : 1 };
  }) });
  ok(medioPf.sigue && medioPf.op === '1' && medioPf.opM === '1' && /matrix/.test(medioPf.tf) && medioPf.alfa < 0.5,
    'con el dedo, la hoja de la plataforma baja y el velo se aclara en su tinte (le gana a plataforma.css) sin llevársela', medioPf);
  await p.waitForTimeout(700);
  ok(!(await conf()), 'y la hoja se cierra por su capa');
  ok(await p.evaluate(async () => (await window.__conf) === false), 'contestando «no», como la × y el atrás');
  ok(await p.evaluate(() => !(history.state && history.state.capa)), 'sin dejar una entrada de historial muerta');
  ok(!errs.length, 'cero errores de página en las dos apps', errs);
  await ctx.close();
}

/* SOLO=vitrina o SOLO=apps corre una de las dos mitades, para trabajar sin esperar la otra. */
const SOLO = process.env.SOLO || '';
if (SOLO !== 'apps')
  for (const ancho of [360, 420])
    for (const tema of ['claro', 'oscuro'])
      for (const mov of ['no-preference', 'reduce'])
        await vitrina(ancho, tema, mov);
if (SOLO !== 'vitrina') await apps();
await nav.close();
console.log(fallos ? '\n' + fallos + ' fallo(s).' : '\nLas hojas, las listas y las transiciones hacen lo suyo con la mano, el dedo y el teclado.');
process.exit(fallos ? 1 : 0);
