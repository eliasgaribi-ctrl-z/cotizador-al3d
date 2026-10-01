/* MATERIAL CON LAS PIEZAS COMPARTIDAS, EN UN NAVEGADOR DE VERDAD.
 *
 * Lo que se defiende, y por qué (cada punto trae el ID de su ficha del paquete de UI):
 *
 *   · LA SILUETA (F16). El primer pintado es la silueta del módulo, con `aria-busy` y su texto de
 *     estado, y nunca el reloj fijo de «Sumando el libro del almacén…». Y las recargas que siguen
 *     a una acción NO vuelven a vaciar la lista: el cuerpo no se queda sin hijos ni una vez.
 *   · EL MEDIDOR (F3). Una barra quieta, `aria-hidden`, sin texto encima y con la frase de siempre
 *     al lado; con el libro en negativo sale vacía con la marca roja; en papel se esconde la de la
 *     lista de compra. Solo hay barra donde hay contra qué medir (un mínimo o un pedido).
 *   · LAS CUENTAS RUEDAN (F23). La cifra que cambia rueda UNA vez; la primera pintura, un cambio
 *     de pestaña y la cifra que no cambió no ruedan. El texto es el final desde el primer cuadro.
 *   · LA DIFERENCIA SE VE MIENTRAS SE TECLEA (F4). En «Corregir»: «El libro dice … → +0.6 láminas»;
 *     en «Ajustar»: «Se usó 124 % de lo calculado». A tres veces o más pasa a ámbar CON palabras
 *     y NO bloquea el guardado.
 *   · EL CONTEO SE PALOMEA SIN PERDER EL SITIO (F6). «Así está» y «Corregir» rehacen SOLO el renglón
 *     tocado: el resto de la lista conserva sus nodos, el scroll no se mueve, el foco vuelve al
 *     mismo botón, «Contados hoy» avanza y el sello dice «contado hoy por …».
 *   · «DESHACER» EN EL MISMO BOTÓN (F13). «Recibí lo de la lista» y «Actualizar» no escriben al
 *     tocar: ofrecen «Deshacer» ocho segundos y escriben al apagarse la mecha. Deshacer no deja
 *     rastro en el libro; salir de la pestaña confirma; un segundo toque no mete el material dos
 *     veces. Con ratón, con dedo y con teclado.
 *   · LA BARRA DEL TELÉFONO (F29). Sube al aparecer, cambia de rótulo SIN reescribirse el botón y
 *     su alto publicado (`--mbar-h`) es el de la barra puesta, no el de media animación.
 *   · EL BOTÓN QUE SE ENCIENDE (F20). «Guardar» nace fantasma y se llena con la cuenta («Guardar 2
 *     cambios»); cada campo cambiado lleva su filete y el valor de antes; el valor de ahora se
 *     queda a contraste completo.
 *   · LOS BORDES QUE SE DESVANECEN (F30) en `.mat-formula`, y fuera en papel.
 *   · LOS DOS AVISOS DE «CORREGIR» (F1). Con movimientos posteriores al conteo salen dos avisos y
 *     los DOS se quedan en la pila: el importante («Ojo…») trae su botón y no cede su sitio.
 *
 * Cada ronda corre a 360 o 420 px (y una a 1280, con ratón y teclado), con y sin movimiento
 * reducido, en claro y en oscuro; siempre sin errores de página, sin desborde de lado y sin nada
 * moviéndose en reposo. El contraste de lo nuevo se mide contra el render: los fondos de esta
 * pantalla son tarjetas lisas, así que color de texto contra el primer fondo opaco es una medida
 * honesta (no hay degradados debajo de estos textos).
 *
 * Necesita navegador y servidor:  PUERTO=8814 node pruebas/navegador/pf-material.mjs
 * (o pruebas/correr.sh --navegador).
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const PUERTO = process.env.PUERTO || '8814';
const B = 'http://127.0.0.1:' + PUERTO;
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const cierto = (cond, que, extra) => cond ? bien(que) : mal(que, extra);
const dormir = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------------------------------
   Abrir la plataforma en Material. Un contexto por ronda, con el tema, el rol y el movimiento
   pedidos. Un vigilante del DOM, puesto ANTES de que corra la página, anota lo que pasa en el
   cuerpo de Material aunque dure un cuadro: la silueta, el reloj viejo, y si el cuerpo se
   quedó sin hijos después de la primera carga.
   ------------------------------------------------------------------------------------------ */
async function abrir({ ancho = 360, alto = 740, tema = 'claro', reducido = false, tactil = true } = {}) {
  const movil = ancho < 760;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, hasTouch: tactil, isMobile: movil && tactil, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block', reducedMotion: reducido ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript(t => {
    try {
      localStorage.setItem('al3d_tema', t);
      localStorage.setItem('al3d_pf_rol', 'direccion');
      localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
    } catch (_) {}
    window.__mt = { esq: false, busy: false, esqTexto: '', sumando: false, cargado: false, vacio: 0, rotuloSale: 0 };
    const mirar = () => {
      const c = document.getElementById('mt-cuerpo');
      if (c) {
        const e = c.querySelector('.pf-esqueleto');
        if (e) { __mt.esq = true; __mt.busy = e.getAttribute('aria-busy') === 'true'; __mt.esqTexto = e.textContent; }
        if (/Sumando el libro/.test(c.textContent)) __mt.sumando = true;
        if (__mt.cargado && !c.childElementCount) __mt.vacio++;
        if (!__mt.cargado && c.childElementCount && !e) __mt.cargado = true;
      }
      if (document.querySelector('#pf-mbar .rotulo-sale')) __mt.rotuloSale++;
    };
    const arrancar = () => new MutationObserver(mirar).observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) arrancar();
    else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); arrancar(); } }).observe(document, { childList: true });
  }, tema);
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await p.goto(B + '/#/material', { waitUntil: 'load' });
  await cargado(p);
  return { ctx, p, errores };
}

const cargado = p => p.waitForFunction(() => {
  const c = document.getElementById('mt-cuerpo');
  return c && c.childElementCount && !c.querySelector('.pf-esqueleto') && !document.getElementById('pf-arranque');
}, null, { timeout: 30000 }).then(() => p.waitForTimeout(500));

/* Lo que Material necesita para tener algo que mostrar: cinco correcciones que dicen que el
   acrílico rinde 50 % menos (la calibración propone una constante), un proyecto ganado con su
   material derivado, dos materiales contados HOY, un libro en negativo, y un movimiento con
   fecha de mañana para que un conteo traiga «movimientos posteriores». Todo por la capa de
   datos, que es lo que usa la pantalla. */
const sembrar = p => p.evaluate(async () => {
  const DB = await import('/js/datos/db.js');
  const Stock = await import('/js/datos/stock.js');
  const Proy = await import('/js/datos/proyectos.js');
  const Material = await import('/js/datos/material.js');
  const Prefs = await import('/js/datos/prefs.js');
  const s = {};
  for (let i = 0; i < 5; i++) {
    await DB.poner('requerimientos', { id: 'rq-cal-' + i, proyecto_id: 'p-cal', material_id: 'acr-3mm',
      cantidad_compra: 1, cantidad_ajustada: 1.5, estado: 'calculado' });
  }
  const letras = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, altura: 40, n: 8 };
  const g = await Proy.ganar({ folio: 'COT-9301', cliente: 'Healthylicious', proy: 'Healthylicious — anuncio',
    ts: Date.now(), estado: 'autorizada', items: [letras], neto: 40000, itemsAuth: { 1: 40000 } }, {});
  s.proyecto = !!g.ok;
  if (g.ok) { const r = await Material.recalcular(g.valor.id); s.lineas = r.ok ? r.valor.lineas.length : r.mensaje; }
  s.c1 = (await Stock.contar('acr-3mm', 2.4, 'prueba')).ok;
  s.c2 = (await Stock.contar('al-pintado', 2, 'prueba')).ok;
  s.m1 = (await Stock.mover({ material_id: 'silicon', tipo: 'salida', cantidad: 0.5, origen: 'manual', nota: 'prueba' })).ok;
  const futuro = await DB.poner('movimientos', { id: 'mov-futuro', empresa_id: Prefs.empresa(), material_id: 'led-6500', tipo: 'entrada',
    cantidad: 1, unidad_compra: 'caja', origen: 'manual', ts: Date.now() + 3600000, usuario: 'Beto', rol: 'direccion',
    dispositivo: 'prueba', sello: 'Beto', sync: 1, nota: '' });
  s.futuro = !!futuro.ok;
  return s;
});

/* Espera a que algo ASÍNCRONO se cumpla. `waitForFunction` no espera la promesa de un predicado
   `async` —la da por verdadera al instante—, y una prueba que espera así pasa sin haber esperado. */
async function hasta(p, fn, arg, ms = 6000) {
  const t0 = Date.now();
  for (;;) {
    if (await p.evaluate(fn, arg)) return true;
    if (Date.now() - t0 > ms) throw new Error('se acabó el tiempo esperando a que se cumpliera la condición');
    await dormir(80);
  }
}

const sinDesborde = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/* Animaciones que no acaban, EN REPOSO. El botón de la IA es la única pieza que se mueve sola. */
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity)
  .filter(a => { const t = a.effect.target; return !(t && t.closest && t.closest('.pf-ia-btn')); })
  .map(a => (a.animationName || a.transitionProperty || '?') + ' en ' + ((a.effect.target && (a.effect.target.className && a.effect.target.className.baseVal === undefined ? a.effect.target.className : '')) || '?')));
const texto = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const contraste = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const rgba = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const mezcla = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  let fondo = { r: 255, g: 255, b: 255, a: 1 };
  const cadena = []; for (let n = el; n; n = n.parentElement) cadena.push(n);
  for (const n of cadena.reverse()) { const c = rgba(getComputedStyle(n).backgroundColor); if (c.a > 0) fondo = mezcla(c, fondo); }
  const t = mezcla(rgba(getComputedStyle(el).color), fondo);
  const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  const lum = c => .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b);
  const a = lum(t), b = lum(fondo);
  return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100;
}, sel);

/* ------------------------------------------------------------------------------------------
   Una ronda: toda la pantalla, con el tema, el ancho, el movimiento y el dispositivo de entrada
   que se pidan. `larga` además espera de verdad los ocho segundos de la mecha.
   ------------------------------------------------------------------------------------------ */
async function ronda(cfg, { larga = false } = {}) {
  const nombre = cfg.ancho + ' px · ' + cfg.tema + ' · ' + (cfg.reducido ? 'menos movimiento' : 'con movimiento') +
    ' · ' + (cfg.tactil ? 'dedo' : 'ratón y teclado');
  console.log('\n' + nombre.toUpperCase());
  const { ctx, p, errores } = await abrir(cfg);
  const movil = cfg.ancho < 760;
  const toca = sel => cfg.tactil ? p.tap(sel) : p.click(sel);
  const limpiar = () => p.evaluate(() => window.Piezas && window.Piezas.aviso && window.Piezas.aviso.limpiar());
  const ir = async tab => { await limpiar(); await toca('[data-tab="' + tab + '"]'); await p.waitForTimeout(350); };
  /* Solo las entradas de COMPRA, que es lo que escribe «Recibí lo de la lista»: el libro también recibe, por
     detrás, las salidas derivadas de los proyectos, y contar todo haría depender la prueba del reloj. */
  const movs = () => p.evaluate(async () => (await (await import('/js/datos/db.js')).listar('movimientos')).filter(m => m.origen === 'compra').length);
  const constante = k => p.evaluate(async k2 => (await (await import('/js/datos/material.js')).constantes())[k2], k);
  const seccion = async (titulo, fn) => {
    console.log(' · ' + titulo);
    try { await fn(); } catch (e) {
      mal(titulo + ': la sección se rompió', String(e && e.message || e).split('\n')[0]);
      /* Una sección que se rompe con una hoja abierta no puede dejarla tapando a las que siguen. */
      for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(250); }
    }
  };

  const sembrado = await sembrar(p);
  cierto(sembrado.proyecto && sembrado.c1 && sembrado.c2 && sembrado.m1 && sembrado.futuro && typeof sembrado.lineas === 'number',
    'datos de prueba sembrados', sembrado);
  await p.reload({ waitUntil: 'load' });
  await cargado(p);

  /* ---------- F16 · la silueta ---------- */
  await seccion('F16 · la silueta en vez de «Sumando el libro…»', async () => {
    const v = await p.evaluate(() => ({ ...window.__mt }));
    cierto(v.esq && v.busy, 'el primer pintado fue la silueta del módulo, con aria-busy', v);
    cierto(/Cargando Material/.test(v.esqTexto), 'y con su texto de estado «Cargando Material…»', v.esqTexto);
    cierto(!v.sumando, 'el reloj fijo «Sumando el libro del almacén…» no aparece nunca');
    cierto(await p.evaluate(() => !document.querySelector('#mt-cuerpo .pf-esqueleto')), 'la silueta se va cuando llegan los datos');
  });

  /* ---------- F23 · las cuentas, primer pintado ---------- */
  await seccion('F23 · las cuentas no ruedan al entrar', async () => {
    const r = await p.evaluate(() => ({
      cifras: [...document.querySelectorAll('#mt-cab .pf-cuenta b[data-cuenta]')].map(b => b.dataset.cuenta),
      rodando: document.querySelectorAll('#mt-cab .rueda-rodando').length,
    }));
    cierto(r.cifras.includes('pend') && r.cifras.includes('bajos') && r.cifras.includes('viejos'),
      'las tres cuentas llevan su marca de cifra', r.cifras);
    cierto(r.rodando === 0, 'ninguna rueda en el primer pintado', r);
  });

  /* ---------- F3 · el medidor ---------- */
  await seccion('F3 · el medidor debajo de la cantidad', async () => {
    const r = await p.evaluate(() => {
      const med = [...document.querySelectorAll('#mt-cuerpo .mat-fila .mat-cant .medidor')];
      return {
        n: med.length,
        todosOcultos: med.every(m => m.getAttribute('aria-hidden') === 'true'),
        sinTexto: med.every(m => m.textContent === ''),
        conVar: med.every(m => m.style.getPropertyValue('--v') !== ''),
        falta: document.querySelectorAll('#mt-cuerpo .medidor-falta').length,
        bajoCero: document.querySelectorAll('#mt-cuerpo .medidor.bajo-cero').length,
        frase: [...document.querySelectorAll('#mt-cuerpo .mat-cant small')].some(s => /hay |piden/.test(s.textContent)),
        noPapel: med.every(m => m.classList.contains('no-papel')),
      };
    });
    cierto(r.n >= 2, 'los renglones con mínimo o con pedido traen su barra', r);
    cierto(r.todosOcultos && r.sinTexto, 'la barra es aria-hidden y no lleva texto encima', r);
    cierto(r.conVar, 'trae su medida en variables, sin estilos sueltos', r);
    cierto(r.falta >= 1, 'lo que falta hasta «piden» se pinta (el hueco ámbar)', r);
    cierto(r.bajoCero >= 1, 'con el libro en negativo la barra sale vacía con la marca del cero', r);
    cierto(r.frase, 'la frase «hay X · piden Y» se queda al lado', r);
    await p.emulateMedia({ media: 'print' });
    const imp = await p.evaluate(() => ({
      barras: [...document.querySelectorAll('#mt-cuerpo .mat-cant .medidor')].filter(m => getComputedStyle(m).display !== 'none').length,
      frase: [...document.querySelectorAll('#mt-cuerpo .mat-cant small')].filter(s => getComputedStyle(s).display !== 'none').length,
    }));
    await p.emulateMedia({ media: 'screen' });
    cierto(imp.barras === 0 && imp.frase >= 2, 'en papel la barra se esconde y la frase va', imp);
    cierto(await sinDesborde(p), 'sin desborde de lado en «Por comprar»');
    cierto((await infinitas(p)).length === 0, 'nada se mueve en reposo en «Por comprar»', await infinitas(p));
  });

  /* ---------- F13 · «Recibí lo de la lista» con su «Deshacer» ---------- */
  const RECIBI = movil ? '#pf-mbar [data-recibi]' : '.mat-recibi-cuerpo';
  await seccion('F13 · «Recibí lo de la lista»: deshacer no escribe', async () => {
    await limpiar();
    const n0 = await movs();
    const n = Number(((await texto(p, RECIBI)) || '').match(/\((\d+) material/)[1]);
    await toca(RECIBI);
    await p.waitForSelector(RECIBI + '[data-deshacer]', { timeout: 3000 });
    const v = await p.evaluate(sel => {
      const b = document.querySelector(sel);
      return { alt: b.querySelector('.rotulo.alt') !== null, b: (b.querySelector('.rotulo-b') || {}).textContent,
        mecha: !!b.querySelector('.mecha'), seg: (b.querySelector('.deshacer-seg') || {}).textContent || null };
    }, RECIBI);
    cierto(v.alt && v.b === 'Deshacer', 'el botón dice «Deshacer»', v);
    cierto(v.mecha, 'y trae su mecha');
    cierto(cfg.reducido ? /\d+ s/.test(v.seg || '') : true, 'con menos movimiento la cuenta va con letra', v.seg);
    cierto((await movs()) === n0, 'no se escribió NADA al tocar', { antes: n0, ahora: await movs() });
    await toca(RECIBI);
    await p.waitForFunction(sel => !document.querySelector(sel + '[data-deshacer]'), RECIBI, { timeout: 3000 });
    cierto((await movs()) === n0, 'deshacer no deja rastro en el libro');
    cierto(/No se registró nada/.test(await texto(p, '#toast') || ''), 'y lo dice');
    cierto(new RegExp('\\(' + n + ' material').test(await texto(p, RECIBI)), 'el botón vuelve a su rótulo de siempre', await texto(p, RECIBI));
    if (!cfg.tactil) {
      /* Teclado: Enter ofrece, Enter deshace. */
      await limpiar();
      await p.focus(RECIBI);
      await p.keyboard.press('Enter');
      await p.waitForSelector(RECIBI + '[data-deshacer]', { timeout: 3000 });
      cierto((await movs()) === n0, 'con Enter también se ofrece y no se escribe');
      await p.keyboard.press('Enter');
      await p.waitForFunction(sel => !document.querySelector(sel + '[data-deshacer]'), RECIBI, { timeout: 3000 });
      cierto((await movs()) === n0, 'y con Enter se deshace');
    }
  });

  await seccion('F13 · «Actualizar» de la calibración', async () => {
    await limpiar();
    const antes = await constante('APROV_NESTING_simple');
    cierto(await p.evaluate(() => !!document.querySelector('#mt-cab [data-calibrar]')), 'la calibración propone una constante');
    await toca('#mt-cab [data-calibrar]');
    await p.waitForSelector('#mt-cab [data-calibrar][data-deshacer]', { timeout: 3000 });
    cierto((await constante('APROV_NESTING_simple')) === antes, 'tocar «Actualizar» no cambia la constante todavía', antes);
    await toca('#mt-cab [data-calibrar]');
    await p.waitForFunction(() => !document.querySelector('#mt-cab [data-calibrar][data-deshacer]'), null, { timeout: 3000 });
    cierto((await constante('APROV_NESTING_simple')) === antes, 'deshacer deja la constante como estaba');
    cierto(/se quedó como estaba/.test(await texto(p, '#toast') || ''), 'y lo dice');
  });

  /* ---------- F29 · la barra del teléfono ---------- */
  if (movil) {
    await seccion('F29 · la barra de acción del teléfono', async () => {
      const v = await p.evaluate(() => {
        const b = document.getElementById('pf-mbar'), cs = getComputedStyle(b);
        return { visible: !b.hidden, clase: b.classList.contains('mat-mbar'), trans: cs.transitionProperty,
          h: Math.round(b.getBoundingClientRect().height), publicado: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h'), 10) };
      });
      cierto(v.visible && v.clase, 'la barra está a la vista y es la de Material', v);
      cierto(/opacity/.test(v.trans) && /transform/.test(v.trans), 'y entra con opacidad y transform, nada más', v.trans);
      cierto(Math.abs(v.h - v.publicado) <= 1, 'el alto publicado es el de la barra puesta', v);
      /* La entrada: al volver a «Por comprar» la barra pasa de oculta a visible; se muestrea la
         opacidad y el desplazamiento cuadro a cuadro desde antes del toque. */
      await ir('almacen');
      cierto(await p.evaluate(() => document.getElementById('pf-mbar').hidden), 'en «En almacén» la barra no existe');
      await p.evaluate(() => {
        window.__muestras = [];
        const b = document.getElementById('pf-mbar'), t0 = performance.now();
        const paso = () => {
          const cs = getComputedStyle(b);
          window.__muestras.push({ o: +cs.opacity, t: cs.transform, h: b.hidden, ms: performance.now() - t0,
            alto: Math.round(b.getBoundingClientRect().height),
            pub: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h'), 10) });
          if (performance.now() - t0 < 600) requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
      });
      await toca('[data-tab="comprar"]');
      await p.waitForTimeout(800);
      const m = (await p.evaluate(() => window.__muestras)).filter(x => !x.h);
      const minO = Math.min(...m.map(x => x.o));
      const movio = m.some(x => x.t && x.t !== 'none' && x.t !== 'matrix(1, 0, 0, 1, 0, 0)');
      cierto(minO < 1 || cfg.reducido && minO <= 1, 'al aparecer arranca por debajo de la opacidad plena', { minO, n: m.length });
      cierto(cfg.reducido ? !movio : movio, cfg.reducido ? 'con menos movimiento solo hay fundido, sin subir' : 'al aparecer sube (translateY)', m.slice(0, 3));
      const fin = await p.evaluate(() => ({ h: Math.round(document.getElementById('pf-mbar').getBoundingClientRect().height),
        pub: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mbar-h'), 10) }));
      cierto(Math.abs(fin.h - fin.pub) <= 1, 'y al terminar el alto publicado sigue siendo el de la barra', fin);
    });
  }

  /* ---------- F6 · el conteo en su sitio ---------- */
  await seccion('F6 · «Así está» rehace solo su renglón', async () => {
    await ir('almacen');
    const base = await texto(p, '#mt-contados .mat-contados-t');
    cierto(/Contados hoy: 2 de 19/.test(base || ''), '«Contados hoy» cuenta lo contado hoy desde el principio', base);
    cierto(await p.evaluate(() => document.querySelectorAll('.mat-fila.contado .mat-caja .palomita').length === 2),
      'los dos ya contados salen con su palomita puesta');
    cierto(await p.evaluate(() => !document.querySelector('.mat-fila.contado .palomita.dibuja')),
      'y sin dibujarse otra vez al entrar');
    await p.locator('.mat-fila[data-mat="solvente"]').scrollIntoViewIfNeeded();
    const antes = await p.evaluate(() => {
      const f = [...document.querySelectorAll('#mt-cuerpo .mat-fila')];
      f.forEach((x, i) => { x.__m = i; });
      document.querySelector('#mt-cuerpo .card').__card = 1;
      window.__sc = window.scrollY;
      return { n: f.length, y: window.scrollY };
    });
    if (!cfg.tactil) { await p.focus('.mat-fila[data-mat="solvente"] [data-asi]'); await p.keyboard.press('Enter'); }
    else await toca('.mat-fila[data-mat="solvente"] [data-asi]');
    await p.waitForSelector('.mat-fila[data-mat="solvente"].contado', { timeout: 4000 });
    await p.evaluate(() => { document.querySelector('.mat-fila[data-mat="solvente"]').__vez1 = 1; });
    await p.waitForTimeout(900);
    const d = await p.evaluate(() => {
      const f = [...document.querySelectorAll('#mt-cuerpo .mat-fila')];
      const fila = document.querySelector('.mat-fila[data-mat="solvente"]');
      window.__unaVez = fila.__vez1 === 1;
      const a = document.activeElement;
      return {
        n: f.length, y: window.scrollY,
        mismoCard: !!document.querySelector('#mt-cuerpo .card').__card,
        igualesOtros: f.filter(x => x.dataset.mat !== 'solvente').every(x => x.__m !== undefined),
        nueva: fila.__m === undefined,
        caja: !!fila.querySelector('.mat-caja .palomita'),
        sello: fila.querySelector('.mat-sello').textContent.trim(),
        contados: document.querySelector('#mt-contados .mat-contados-t').textContent.replace(/\s+/g, ' ').trim(),
        foco: a && a.getAttribute('data-asi'),
        skeleton: !!document.querySelector('#mt-cuerpo .pf-esqueleto'),
        vacio: window.__mt.vacio, sumando: window.__mt.sumando,
        barra: document.querySelector('#mt-contados .medidor').style.getPropertyValue('--v'),
      };
    });
    cierto(d.n === antes.n && d.igualesOtros && d.mismoCard, 'el resto de la lista conserva sus nodos: no se repintó', d);
    cierto(d.nueva, 'el renglón tocado es otro nodo (se rehízo en su sitio)');
    cierto(await p.evaluate(() => window.__unaVez), 'y la lectura de fondo no lo rehízo otra vez (no reinicia la palomita)');
    cierto(Math.abs(d.y - antes.y) <= 1, 'el scroll no se movió', { antes: antes.y, ahora: d.y });
    cierto(d.caja, 'la caja del icono lleva su palomita');
    cierto(/^contado hoy por Beto/.test(d.sello), 'el sello dice «contado hoy por Beto»', d.sello);
    cierto(/Contados hoy: 3 de 19/.test(d.contados), '«Contados hoy» avanzó a 3 de 19', d.contados);
    cierto(Number(d.barra) > 0.15 && Number(d.barra) < 0.17, 'y su barra con él (3/19)', d.barra);
    cierto(!cfg.tactil ? d.foco === 'solvente' : true, 'el foco vuelve al mismo botón', d.foco);
    cierto(!d.skeleton && d.vacio === 0 && !d.sumando, 'la lista no se vació ni enseñó la silueta entre toques', { vacio: d.vacio, sumando: d.sumando });
    cierto(await p.evaluate(() => document.querySelector('.mat-fila[data-mat="solvente"] .palomita').classList.contains('dibuja') &&
      document.querySelectorAll('.mat-fila.contado .palomita.dibuja').length === 1),
      'solo la palomita recién puesta se dibuja (con menos movimiento ya sale dibujada)');
    /* La cinta de arriba: «Sin contar en 30 días» pasa de 19 a 18 y esa cifra rueda. */
    const viejos = await texto(p, '#mt-cab [data-cuenta="viejos"]');
    cierto(viejos === '16', '«Sin contar» bajó (de 17 a 16 contando solo lo no contado)', viejos);
  });

  await seccion('F23 · la cifra que cambió rueda, las demás no', async () => {
    await limpiar();
    /* Se cuenta otro renglón y se observa la cinta al instante: solo «viejos» cambia. */
    await p.evaluate(() => {
      window.__ruedas = new Set();
      new MutationObserver(() => { document.querySelectorAll('#mt-cab .rueda-rodando').forEach(b => window.__ruedas.add(b.dataset.cuenta)); })
        .observe(document.getElementById('mt-cab'), { subtree: true, attributes: true, childList: true });
    });
    await toca('.mat-fila[data-mat="led-6500"] [data-asi]');
    await p.waitForSelector('.mat-fila[data-mat="led-6500"].contado', { timeout: 4000 });
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => ({ ruedas: [...window.__ruedas], viejos: document.querySelector('#mt-cab [data-cuenta="viejos"]').textContent,
      rodando: document.querySelectorAll('#mt-cab .rueda-rodando').length, capas: document.querySelectorAll('#mt-cab .rueda-vista').length }));
    cierto(r.viejos === '15', 'la cifra nueva es la de verdad desde el primer cuadro', r);
    if (cfg.reducido) cierto(r.ruedas.length === 0, 'con menos movimiento no rueda', r);
    else cierto(r.ruedas.length === 1 && r.ruedas[0] === 'viejos', 'solo rueda la que cambió', r);
    cierto(r.rodando === 0 && r.capas === 0, 'y al terminar no queda capa de rueda', r);
    await p.evaluate(() => { window.__ruedas = new Set(); });
    await ir('comprar'); await ir('almacen');
    cierto(await p.evaluate(() => window.__ruedas.size === 0), 'cambiar de pestaña no hace rodar nada');
  });

  await seccion('F6 · «Corregir» también rehace solo su renglón, y lo de arriba se pone al día', async () => {
    await limpiar();
    const pend0 = await texto(p, '#mt-cab [data-cuenta="pend"]');
    await p.evaluate(() => { [...document.querySelectorAll('#mt-cuerpo .mat-fila')].forEach((x, i) => { x.__m = i; }); });
    await toca('.mat-fila[data-mat="solvente"] [data-contar]');
    await p.waitForSelector('#mt-contar', { timeout: 3000 });
    await p.fill('#mt-contar', '5');
    await toca('[data-pide="contar"]');
    await p.waitForFunction(() => /5 litros/.test((document.querySelector('.mat-fila[data-mat="solvente"] .mat-cant') || {}).textContent || ''), null, { timeout: 5000 });
    await p.waitForTimeout(900);
    const d = await p.evaluate(() => ({
      igualesOtros: [...document.querySelectorAll('#mt-cuerpo .mat-fila')].filter(x => x.dataset.mat !== 'solvente').every(x => x.__m !== undefined),
      pend: document.querySelector('#mt-cab [data-cuenta="pend"]').textContent,
      pestana: [...document.querySelectorAll('#mt-cab [data-tab]')].map(b => b.textContent.trim()),
      sinModal: !document.getElementById('pf-pide').classList.contains('show'),
      bajo: document.querySelector('.mat-fila[data-mat="solvente"]').textContent.includes('Bajo mínimo'),
    }));
    cierto(d.igualesOtros && d.sinModal, 'el resto de la lista no se tocó y el panel se cerró', d);
    cierto(!d.bajo, 'el renglón dejó de decir «Bajo mínimo» (5 litros contra mínimo de 2)');
    cierto(Number(d.pend) === Number(pend0) - 1, 'la cuenta «por comprar» de arriba bajó uno sin recargar la lista', { antes: pend0, ahora: d.pend });
    cierto(d.pestana.some(t => t === 'Por comprar · ' + d.pend), 'y la pestaña dice lo mismo que la cuenta', { pend: d.pend, pestana: d.pestana });
  });

  /* ---------- F4 · la diferencia viva ---------- */
  await seccion('F4 · «Corregir»: la diferencia se ve mientras se teclea', async () => {
    await limpiar();
    await toca('.mat-fila[data-mat="acr-3mm"] [data-contar]');
    await p.waitForSelector('#mt-contar', { timeout: 3000 });
    const t = () => texto(p, '#mt-dif');
    const ini = await t();
    cierto(/El libro dice 2\.4 láminas · tú dices 2\.4/.test(ini || '') && /sin diferencia/.test(ini || ''), 'al abrir ya dice «sin diferencia»', ini);
    cierto(await p.evaluate(() => { const o = document.getElementById('mt-dif'); return o.tagName === 'OUTPUT' && o.getAttribute('aria-live') === 'polite'; }),
      'es un <output aria-live="polite">');
    await p.fill('#mt-contar', '3');
    await p.waitForTimeout(450);
    const tres = await t();
    cierto(/tú dices 3 →/.test(tres || '') && /\+0\.6 láminas/.test(tres || ''), '«tú dices 3 → +0.6 láminas»', tres);
    cierto(await p.evaluate(() => !document.getElementById('mt-dif').hasAttribute('data-dudoso')), 'sin ámbar en un cambio normal');
    await p.fill('#mt-contar', '30');
    await p.waitForTimeout(450);
    const treinta = await t();
    const dud = await p.evaluate(() => ({ ambar: document.getElementById('mt-dif').hasAttribute('data-dudoso'),
      aviso: !document.getElementById('mt-dif-aviso').hidden, txt: document.getElementById('mt-dif-aviso').textContent }));
    cierto(/\+27\.6 láminas/.test(treinta || ''), 'un «30» en lugar de «3.0» dice +27.6', treinta);
    cierto(dud.ambar && dud.aviso && /^¿Seguro\? Es mucho más de lo que dice el libro/.test(dud.txt), 'pasa a ámbar CON palabras', dud);
    const cAmbar = await contraste(p, '#mt-dif');
    cierto(cAmbar >= 4.5, 'el texto ámbar mide al menos 4.5:1', cAmbar);
    await p.fill('#mt-contar', '0');
    await p.waitForTimeout(350);
    cierto(/mucho menos/.test(await texto(p, '#mt-dif-aviso') || ''), 'contar 0 con el libro en 2.4 también pregunta, con «menos»');
    await p.fill('#mt-contar', '');
    await p.waitForTimeout(250);
    cierto(/escribe cuántas hay/.test(await t() || ''), 'sin número dice qué falta');
    if (!cfg.tactil) {
      await p.focus('#mt-contar');
      await p.keyboard.press('Control+A');
      await p.keyboard.type('2.5');
      await p.waitForTimeout(450);
      cierto(/\+0\.1 láminas/.test(await t() || ''), 'tecleando con el teclado también');
    }
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    cierto(await p.evaluate(() => !document.getElementById('pf-pide').classList.contains('show')), 'Escape cierra el panel');
  });

  await seccion('F4 · el ámbar NO bloquea el guardado', async () => {
    await limpiar();
    await toca('.mat-fila[data-mat="al-pintado"] [data-contar]');
    await p.waitForSelector('#mt-contar', { timeout: 3000 });
    await p.fill('#mt-contar', '20');
    await p.waitForTimeout(350);
    cierto(await p.evaluate(() => document.getElementById('mt-dif').hasAttribute('data-dudoso')), 'diez veces el libro: ámbar');
    await toca('[data-pide="contar"]');
    await p.waitForFunction(() => /20 láminas/.test((document.querySelector('.mat-fila[data-mat="al-pintado"] .mat-cant') || {}).textContent || ''), null, { timeout: 5000 });
    bien('se guardó igual: el renglón ya dice 20 láminas');
  });

  await seccion('F1 · los dos avisos de «Corregir» se quedan los dos', async () => {
    await limpiar();
    await p.evaluate(() => window.Piezas.aviso.limpiar());
    await toca('.mat-fila[data-mat="led-6500"] [data-contar]');
    await p.waitForSelector('#mt-contar', { timeout: 3000 });
    await p.fill('#mt-contar', '4');
    await toca('[data-pide="contar"]');
    await p.waitForFunction(() => window.Piezas.aviso.vivos().length >= 2, null, { timeout: 5000 });
    const v = await p.evaluate(() => ({
      vivos: window.Piezas.aviso.vivos().map(a => ({ msg: a.msg.slice(0, 40), prio: a.prio, label: a.label })),
      enPantalla: document.querySelectorAll('#toast .toast-uno').length,
    }));
    cierto(v.vivos.length === 2 && v.enPantalla === 2, 'los dos avisos están vivos y a la vista', v);
    const ojo = v.vivos.find(a => /^Ojo/.test(a.msg)), cont = v.vivos.find(a => /^Contado/.test(a.msg));
    cierto(ojo && ojo.prio === 1 && ojo.label === 'Entendido', 'el importante («Ojo») trae su botón', v);
    cierto(cont && cont.prio === 0, 'el de siempre («Contado») es informativo', v);
    cierto((await infinitas(p)).length === 0, 'nada infinito con los dos avisos a la vista', await infinitas(p));
  });

  /* ---------- F13 · confirmar por salir de la pestaña (y por reloj en la ronda larga) ---------- */
  await seccion('F13 · salir de la pestaña confirma, una sola vez', async () => {
    await ir('comprar');
    await limpiar();
    const n0 = await movs();
    const n = Number(((await texto(p, RECIBI)) || '').match(/\((\d+) material/)[1]);
    await toca(RECIBI);
    await p.waitForSelector(RECIBI + '[data-deshacer]', { timeout: 3000 });
    cierto((await movs()) === n0, 'con la ventana abierta todavía no hay nada escrito');
    await toca('[data-tab="almacen"]');
    await hasta(p, async esperado => (await (await import('/js/datos/db.js')).listar('movimientos')).filter(m => m.origen === 'compra').length >= esperado, n0 + n, 6000);
    await p.waitForTimeout(600);
    cierto((await movs()) === n0 + n, 'cambiar de pestaña la confirma: entran ' + n + ', ni uno más', { antes: n0, ahora: await movs() });
    cierto(/Entraron \d+ material/.test(await texto(p, '#toast') || ''), 'y el aviso lo dice');
    await ir('comprar');
    cierto(await p.evaluate(() => !document.querySelector('[data-recibi]') ||
      /\(\d+ material/.test(document.querySelector('[data-recibi]').textContent)), 'la pantalla se repintó con lo nuevo');
  });

  await seccion('F13 · confirmar la calibración saliendo de la pestaña', async () => {
    await limpiar();
    const antes = await constante('APROV_NESTING_simple');
    await ir('comprar');
    await toca('#mt-cab [data-calibrar]');
    await p.waitForSelector('#mt-cab [data-calibrar][data-deshacer]', { timeout: 3000 });
    await toca('[data-tab="almacen"]');
    await hasta(p, async a => (await (await import('/js/datos/material.js')).constantes()).APROV_NESTING_simple !== a, antes, 6000);
    cierto((await constante('APROV_NESTING_simple')) !== antes, 'la constante cambió al confirmar', { antes, ahora: await constante('APROV_NESTING_simple') });
  });

  if (larga) {
    await seccion('F13 · por reloj: a los ocho segundos se escribe solo', async () => {
      /* Hay que tener algo por recibir: se sube un mínimo por la capa de datos y se repinta. */
      await p.evaluate(async () => {
        const Material = await import('/js/datos/material.js');
        const m = await Material.obtenerMaterial('silicon');
        await Material.guardarMaterial({ ...m, min_stock: 3 });
      });
      await p.reload({ waitUntil: 'load' }); await cargado(p); await limpiar();
      const n0 = await movs();
      await toca(RECIBI);
      await p.waitForSelector(RECIBI + '[data-deshacer]', { timeout: 3000 });
      const t0 = Date.now();
      await hasta(p, async n => (await (await import('/js/datos/db.js')).listar('movimientos')).filter(m => m.origen === 'compra').length > n, n0, 14000);
      const dt = Date.now() - t0;
      cierto(dt >= 7000 && dt <= 10500, 'la escritura llegó a los ocho segundos, ni antes ni mucho después', dt + ' ms');
    });

    await seccion('F13 · salir de la pantalla confirma lo que está en su ventana', async () => {
      await p.evaluate(async () => {
        const Material = await import('/js/datos/material.js');
        const m = await Material.obtenerMaterial('silicon');
        await Material.guardarMaterial({ ...m, min_stock: 9 });
      });
      await p.reload({ waitUntil: 'load' }); await cargado(p); await limpiar();
      const n0 = await movs();
      await toca(RECIBI);
      await p.waitForSelector(RECIBI + '[data-deshacer]', { timeout: 3000 });
      cierto((await movs()) === n0, 'con la ventana abierta no hay nada escrito');
      await p.evaluate(() => { location.hash = '#/hoy'; });
      await hasta(p, async n => (await (await import('/js/datos/db.js')).listar('movimientos')).filter(m => m.origen === 'compra').length > n, n0, 5000);
      cierto(true, 'irse a otra pantalla la confirma: el material entra, no se pierde');
      await p.evaluate(() => { location.hash = '#/material'; });
      await cargado(p);
    });

    if (!cfg.tactil) {
      await seccion('F13 · el foco sobrevive a la escritura por reloj (teclado)', async () => {
        await limpiar();
        await p.focus('#mt-cab [data-calibrar]');
        await p.keyboard.press('Enter');
        await p.waitForSelector('#mt-cab [data-calibrar][data-deshacer]', { timeout: 3000 });
        const antes = await constante('APROV_NESTING_simple');
        await hasta(p, async a => (await (await import('/js/datos/material.js')).constantes()).APROV_NESTING_simple !== a, antes, 12000);
        await p.waitForTimeout(900);
        const foco = await p.evaluate(() => { const a = document.activeElement; return a && a.hasAttribute('data-calibrar'); });
        cierto(foco, 'tras la escritura el foco sigue en «Actualizar», no se cayó al principio de la página');
      });
    }
  }

  /* ---------- F30 · los bordes que se desvanecen ---------- */
  await seccion('F30 · bordes que se desvanecen en la fórmula', async () => {
    await ir('proyecto');
    /* En una pantalla ancha ninguna fórmula se corta. Entonces se alarga una a mano, como si el
       cálculo trajera más pasos: la pieza tiene que enterarse sin que nadie la vuelva a llamar. */
    if (await p.evaluate(() => ![...document.querySelectorAll('#mt-cuerpo .mat-formula')].some(f => f.scrollWidth > f.clientWidth + 2))) {
      await p.evaluate(() => { const f = document.querySelector('#mt-cuerpo .mat-formula'); f.textContent = f.textContent + ' + ' + '0.123456 × 1.0875 ÷ 0.80 '.repeat(30); });
      await p.waitForTimeout(400);
    }
    const r = await p.evaluate(() => {
      const fs = [...document.querySelectorAll('#mt-cuerpo .mat-formula')];
      const larga = fs.find(f => f.scrollWidth > f.clientWidth + 2);
      return { n: fs.length, todas: fs.every(f => f.classList.contains('bordes')), hayLarga: !!larga,
        despues: larga ? larga.classList.contains('hay-despues') : null,
        antes: larga ? larga.classList.contains('hay-antes') : null,
        mascara: larga ? getComputedStyle(larga).maskImage : null };
    });
    cierto(r.n >= 1 && r.todas, 'todas las fórmulas llevan la pieza', r);
    cierto(r.hayLarga && r.despues === true && r.antes === false && /gradient/.test(r.mascara || ''),
      'la que se corta por la derecha se desvanece solo de ese lado', r);
    await p.evaluate(() => { const f = [...document.querySelectorAll('#mt-cuerpo .mat-formula')].find(x => x.scrollWidth > x.clientWidth + 2); f.scrollLeft = f.scrollWidth; });
    await p.waitForTimeout(400);
    const fin = await p.evaluate(() => { const f = [...document.querySelectorAll('#mt-cuerpo .mat-formula')].find(x => x.scrollWidth > x.clientWidth + 2); return { a: f.classList.contains('hay-antes'), d: f.classList.contains('hay-despues') }; });
    cierto(fin.a && !fin.d, 'al llegar al final el desvanecido pasa al otro lado', fin);
    await p.emulateMedia({ media: 'print' });
    const imp = await p.evaluate(() => [...document.querySelectorAll('#mt-cuerpo .mat-formula')].every(f => getComputedStyle(f).maskImage === 'none'));
    await p.emulateMedia({ media: 'screen' });
    cierto(imp, 'en papel no hay máscara: la fórmula se imprime entera');
    cierto(await sinDesborde(p), 'sin desborde de lado en «Por proyecto»');
    cierto((await infinitas(p)).length === 0, 'nada se mueve en reposo en «Por proyecto»', await infinitas(p));
  });

  /* ---------- F4 · Ajustar ---------- */
  await seccion('F4 · «Ajustar»: «Se usó 124 % de lo calculado»', async () => {
    await limpiar();
    await toca('#mt-cuerpo [data-ajustar]');
    await p.waitForSelector('#mt-real', { timeout: 3000 });
    const usa = Number(await p.inputValue('#mt-real'));
    const ini = await texto(p, '#mt-dif');
    cierto(/Se usó 100 % de lo calculado/.test(ini || ''), 'al abrir dice 100 %', ini);
    await p.fill('#mt-real', String(+(usa * 1.24).toFixed(4)));
    await p.waitForTimeout(450);
    cierto(/Se usó 124 % de lo calculado/.test(await texto(p, '#mt-dif') || ''), '«Se usó 124 % de lo calculado»', await texto(p, '#mt-dif'));
    cierto(await p.evaluate(() => !document.getElementById('mt-dif').hasAttribute('data-dudoso')), 'sin ámbar en 124 %');
    await p.fill('#mt-real', String(+(usa * 3).toFixed(4)));
    await p.waitForTimeout(450);
    cierto(await p.evaluate(() => document.getElementById('mt-dif').hasAttribute('data-dudoso')), 'a 300 % pasa a ámbar');
    cierto(/¿Seguro\? Es mucho más de lo que dice el cálculo/.test(await texto(p, '#mt-dif-aviso') || ''), 'con su frase');
    await toca('#pf-pide [data-pide="cerrar"]');
    await p.waitForTimeout(400);
  });

  /* ---------- F20 · el botón que se enciende ---------- */
  await seccion('F20 · «Guardar» se enciende cuando hay cambios', async () => {
    await limpiar();
    await ir('comprar');
    await toca('#mt-pie [data-hoja="constantes"]');
    await p.waitForSelector('#pf-hoja [data-guardar-ctes]', { timeout: 3000 });
    const G = '#pf-hoja [data-guardar-ctes]';
    const est = () => p.evaluate(s => { const g = document.querySelector(s);
      return { t: g.textContent.replace(/\s+/g, ' ').trim(), pri: g.classList.contains('btn-pri'), gho: g.classList.contains('btn-gho'), aria: g.getAttribute('aria-disabled'),
        cambiados: document.querySelectorAll('#pf-hoja .fld.cambiado').length }; }, G);
    const ini = await est();
    cierto(ini.gho && !ini.pri && ini.aria === 'true' && /Guardar cambios/.test(ini.t), 'nace fantasma y dice «Guardar cambios»', ini);
    const A = '#pf-hoja [data-cte="PROF_CANTO_CM"]', Bc = '#pf-hoja [data-cte="PROF_CAJA_CM"]';
    const va = Number(await p.inputValue(A)), vb = Number(await p.inputValue(Bc));
    const cNormal = await contraste(p, A);
    await p.fill(A, String(va + 1));
    await p.waitForTimeout(250);
    cierto(/Guardar 1 cambio$/.test((await est()).t), 'con un campo tocado: «Guardar 1 cambio»', await est());
    await p.fill(Bc, String(vb + 2));
    await p.waitForTimeout(250);
    const dos = await est();
    cierto(/Guardar 2 cambios/.test(dos.t) && dos.pri && !dos.gho && dos.aria === 'false' && dos.cambiados === 2, 'con dos: «Guardar 2 cambios», lleno de color', dos);
    const antes = await p.evaluate(() => [...document.querySelectorAll('#pf-hoja .fld.cambiado .cte-antes')].map(s => ({ t: s.textContent.trim(), v: !s.hidden })));
    cierto(antes.length === 2 && antes.every(a => a.v && /^Antes: /.test(a.t)), 'cada campo cambiado dice su valor de antes', antes);
    cierto(await p.evaluate(a => getComputedStyle(document.querySelector(a).closest('.fld')).borderLeftColor !== 'rgba(0, 0, 0, 0)', A), 'y lleva su filete ámbar');
    const cCamb = await contraste(p, A);
    cierto(cCamb >= 4.5 && Math.abs(cCamb - cNormal) < 0.05, 'el valor de ahora se queda a contraste completo', { normal: cNormal, cambiado: cCamb });
    const cAntes = await contraste(p, '#pf-hoja .fld.cambiado .cte-antes');
    cierto(cAntes >= 4.5, 'y el «Antes» también (≥ 4.5:1)', cAntes);
    cierto(await sinDesborde(p), 'sin desborde de lado con la hoja de constantes abierta');
    /* Guardar la lámina de acrílico —el panel chico que se abre desde esta misma hoja— repinta la hoja
       de abajo: lo tecleado sin guardar no se pierde. */
    await toca('#pf-hoja [data-editmat="acr-3mm"]');
    await p.waitForSelector('#mt-m-factor', { timeout: 3000 });
    await toca('[data-pide="material"]');
    await p.waitForFunction(() => !document.getElementById('pf-pide').classList.contains('show'), null, { timeout: 4000 });
    await p.waitForTimeout(700);
    const sobrevive = await est();
    cierto(sobrevive.cambiados === 2 && /Guardar 2 cambios/.test(sobrevive.t) && Number(await p.inputValue(A)) === va + 1,
      'lo tecleado y sin guardar sobrevive a que se repinte la hoja', sobrevive);
    await p.fill(A, String(va));
    await p.waitForTimeout(250);
    cierto(/Guardar 1 cambio$/.test((await est()).t), 'volver a escribir el valor de antes quita el cambio', await est());
    await p.fill(Bc, String(vb));
    await p.waitForTimeout(250);
    const cero = await est();
    cierto(cero.gho && cero.aria === 'true' && cero.cambiados === 0, 'sin cambios vuelve a ser fantasma', cero);
    await limpiar();
    /* `force`: Playwright da por apagado todo lo que lleva aria-disabled, y justo ese toque es el que
       se defiende aquí —un botón fantasma que sí contesta—. */
    if (cfg.tactil) await p.tap(G, { force: true }); else await p.click(G, { force: true });
    await p.waitForTimeout(300);
    cierto(/No cambiaste ningún número/.test(await texto(p, '#toast') || ''), 'tocarlo así dice por qué no pasa nada (no es un botón mudo)');
    await p.fill(A, String(va + 1));
    await p.waitForTimeout(250);
    await toca(G);
    await hasta(p, async a => (await (await import('/js/datos/material.js')).constantes()).PROF_CANTO_CM !== a, va, 5000);
    await p.waitForTimeout(500);
    const tras = await est();
    cierto(tras.gho && tras.cambiados === 0 && /Guardar cambios/.test(tras.t), 'guardado, la hoja vuelve a «Guardar cambios» fantasma', tras);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
  });

  /* ---------- Contrastes de lo nuevo, en este tema ---------- */
  await seccion('contraste de lo nuevo en ' + cfg.tema, async () => {
    await ir('almacen');
    const hoy = await contraste(p, '.mat-fila.contado .mat-sello.hoy');
    cierto(hoy === null || hoy >= 4.5, '«contado hoy por …» mide al menos 4.5:1', hoy);
    const cont = await contraste(p, '#mt-contados .mat-contados-t');
    cierto(cont >= 4.5, '«Contados hoy: n de N» mide al menos 4.5:1', cont);
  });

  /* ---------- La barra del teléfono cambia de rótulo sin reescribirse (al final: toca el catálogo) ---------- */
  if (movil) {
    await seccion('F29 · el rótulo cambia sin reescribir el botón', async () => {
      /* Hay que tener DOS cosas por recibir: lo anterior ya se recibió. Se suben dos mínimos por la
         capa de datos y se vuelve a entrar. */
      await p.evaluate(async () => {
        const Material = await import('/js/datos/material.js');
        for (const id of ['silicon', 'solvente']) {
          const m = await Material.obtenerMaterial(id);
          await Material.guardarMaterial({ ...m, min_stock: 500 });
        }
      });
      await p.reload({ waitUntil: 'load' }); await cargado(p); await limpiar();
      const antes = await texto(p, '#pf-mbar [data-recibi]');
      const n0 = Number((antes || '').match(/\((\d+) material/)[1]);
      cierto(n0 >= 2, 'hay varios materiales por recibir en la barra', antes);
      await p.evaluate(() => { document.querySelector('#pf-mbar [data-recibi]').__marca = 1; window.__mt.rotuloSale = 0; });
      /* Se baja el mínimo del silicón a 0 desde el catálogo —como lo haría una persona— y el
         «Por comprar» pierde un renglón: «(N materiales)» pasa a «(N-1 …)». */
      await toca('#mt-pie [data-hoja="catalogo"]');
      await p.waitForSelector('#pf-hoja [data-editmat="silicon"]', { timeout: 3000 });
      await toca('#pf-hoja [data-editmat="silicon"]');
      await p.waitForSelector('#mt-m-minstock', { timeout: 3000 });
      await p.fill('#mt-m-minstock', '0');
      await toca('[data-pide="material"]');
      await p.waitForTimeout(1200);
      const d = await p.evaluate(() => { const b = document.querySelector('#pf-mbar [data-recibi]');
        return { mismo: !!(b && b.__marca), t: b ? b.textContent.replace(/\s+/g, ' ').trim() : null, cruces: window.__mt.rotuloSale }; });
      cierto(d.mismo, 'el botón es el MISMO nodo: no se reescribió', d);
      cierto(new RegExp('\\(' + (n0 - 1) + ' material').test(d.t || ''), 'el rótulo nuevo dice cuántos quedan', { antes, ahora: d.t });
      cierto(cfg.reducido ? d.cruces === 0 : d.cruces > 0, cfg.reducido ? 'con menos movimiento cambia sin cruzarse' : 'el rótulo nuevo se cruzó con el viejo', d);
      await toca('#pf-hoja [data-cerrar-hoja]');
      await p.waitForTimeout(300);
    });
  }

  /* ---------- Cierre de la ronda ---------- */
  await seccion('cierre', async () => {
    await limpiar();
    cierto(errores.length === 0, 'sin errores de página', errores);
    for (const t of ['comprar', 'almacen', 'proyecto']) {
      await ir(t);
      cierto(await sinDesborde(p), 'sin desborde de lado en «' + t + '»');
      const inf = await infinitas(p);
      cierto(inf.length === 0, 'sin animaciones infinitas en reposo en «' + t + '»', inf);
    }
    const f = await p.evaluate(() => window.__mt.vacio);
    cierto(f === 0, 'el cuerpo de Material no se quedó vacío en toda la ronda', f);
  });
  await ctx.close();
}

/* ------------------------------------------------------------------------------------------
   La silueta del router y la del módulo, sin hueco (F16). Se frena la descarga de Material 900 ms
   para que el router enseñe la suya (aparece a los 180 ms) y, cuando el módulo llega, ponga la
   propia. Cuadro a cuadro se mira que, desde que alguna silueta se vio, nunca haya un cuadro sin
   ninguna hasta que lleguen los datos: ese hueco en blanco era el parpadeo.
   ------------------------------------------------------------------------------------------ */
async function siluetaSinHueco() {
  console.log('\nLA SILUETA DEL ROUTER Y LA DEL MÓDULO, SIN HUECO');
  const ctx = await nav.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('al3d_pf_rol', 'direccion'); localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
    } catch (_) {}
    window.__sil = { vista: false, huecos: 0, cargado: false, frames: 0, sinEspera: false, ajena: false };
    const paso = () => {
      const c = document.getElementById('mt-cuerpo');
      const todas = [...document.querySelectorAll('.pf-esqueleto')];
      const op = e => parseFloat(getComputedStyle(e).opacity);
      const ajena = todas.find(e => !(c && c.contains(e))), mia = c && todas.find(e => c.contains(e));
      if (ajena && op(ajena) > .01) { __sil.vista = true; __sil.ajena = true; }
      if (mia && op(mia) > .01) __sil.vista = true;
      if (mia && mia.classList.contains('sin-espera')) __sil.sinEspera = true;
      if (c && c.childElementCount && !mia) __sil.cargado = true;
      if (__sil.vista && !__sil.cargado) {
        __sil.frames++;
        const alguna = (ajena && op(ajena) > .01) || (mia && op(mia) > .01);
        if (!alguna) __sil.huecos++;
      }
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
  await ctx.route(/\/js\/mod\/material\.js/, async r => { await dormir(900); await r.continue(); });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await p.goto(B + '/#/hoy', { waitUntil: 'load' });
  await p.waitForFunction(() => [...document.querySelectorAll('.pf-mod')].some(x => !x.hidden && x.childNodes.length) && !document.getElementById('pf-arranque'), null, { timeout: 30000 });
  await p.waitForTimeout(400);
  await p.evaluate(() => { location.hash = '#/material'; });
  await p.waitForFunction(() => window.__sil.cargado, null, { timeout: 15000 });
  await p.waitForTimeout(500);
  const v = await p.evaluate(() => ({ ...window.__sil }));
  cierto(v.ajena, 'el router enseñó su silueta mientras el módulo se descargaba', v);
  cierto(v.sinEspera, 'la del módulo nació visible (sin esperar otros 180 ms)', v);
  cierto(v.huecos === 0, 'ningún cuadro sin silueta entre las dos', v);
  cierto(errores.length === 0, 'sin errores de página', errores);
  await ctx.close();
}

/* ------------------------------------------------------------------------------------------
   Las rondas. Cuatro del teléfono (360 y 420 px, con y sin movimiento, claro y oscuro) y una de
   computadora con ratón y teclado. La primera del teléfono y la de computadora son las largas, las
   que esperan los ocho segundos de la mecha.
   ------------------------------------------------------------------------------------------ */
const RONDAS = [
  [{ ancho: 360, tema: 'claro', reducido: false, tactil: true }, { larga: true }],
  [{ ancho: 420, tema: 'oscuro', reducido: true, tactil: true }, {}],
  [{ ancho: 360, tema: 'oscuro', reducido: false, tactil: true }, {}],
  [{ ancho: 420, tema: 'claro', reducido: true, tactil: true }, {}],
  [{ ancho: 1280, alto: 860, tema: 'claro', reducido: false, tactil: false }, { larga: true }],
];
/* Para depurar: SOLO=2 corre únicamente la tercera ronda, SOLO=s la de la silueta y SOLO=s,0 las dos.
   Sin SOLO, todo. */
const solo = process.env.SOLO === undefined ? null : process.env.SOLO.split(',');
if (!solo || solo.includes('s')) await siluetaSinHueco();
for (let i = 0; i < RONDAS.length; i++) if (!solo || solo.includes(String(i))) await ronda(...RONDAS[i]);

await nav.close();
console.log('\n' + (fallos ? fallos + ' fallo(s) en pf-material.' : 'Material con las piezas: todo en verde.'));
process.exit(fallos ? 1 : 0);
