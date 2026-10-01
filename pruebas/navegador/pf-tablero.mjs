/* HOY Y TABLERO: LAS CUENTAS QUE LLEVAN A ALGO, EL DESHACER, EL DESLIZADOR DEL CORTE Y LOS RENGLONES
 * QUE SE DESLIZAN.
 *
 * Estas dos pantallas son lo primero que se abre en la mañana, con el teléfono en una mano y el
 * cliente enfrente. Lo que defiende este archivo es que cada gesto nuevo tenga SU alternativa —el
 * toque simple, el teclado— y que ninguno escriba sin que alguien lo haya querido. Se prueba con
 * las tres manos que usan la app (ratón, dedo con eventos táctiles de verdad, y teclado):
 *
 *   · P3  · cada cuenta con algo que contar es un botón que baja a su tarjeta (y la enciende una
 *           vez con las esquinas) o abre la pantalla donde se atiende; con 0 no lleva a ningún
 *           lado; la línea de estaciones sigue FILTRANDO y no se confunde con ellas;
 *   · P4  · «Ya se armó» se vuelve «Deshacer» con su mecha, NO escribe hasta que se apaga, el
 *           renglón no salta de grupo mientras dura, sobrevive a un repintado y NUNCA se ofrece
 *           en el cruce de corte ni en «Ya se instaló»;
 *   · P11 · la tarjeta de «sin decidir» late tres veces al aparecer, se calla al repintarse y
 *           vuelve a latir solo cuando la cuenta sube;
 *   · P13 · en «Qué atender» lo atendido se palomea, se tacha y se pliega en su sitio ANTES de
 *           repintar; si la acción falla no se tacha; con menos movimiento no hay pliegue;
 *   · P14 · fechas rápidas al ganar y al agendar: radios nativos que escriben en el campo, con
 *           teclado y 44 px; «Sin fecha» solo donde la fecha es opcional;
 *   · P18 · las cuentas ruedan cuando algo cambió frente a ti y NUNCA al entrar;
 *   · P21 · «Sí, ya se cortó» es un deslizador: arrastrar hasta el final confirma, soltar antes
 *           regresa, un toque corto enseña cómo se usa, Enter confirma, se abre en «Salieron N
 *           materiales», y si falla regresa con el motivo;
 *   · P25 · la línea de estaciones es una tubería: conectores entre estaciones y, en el teléfono,
 *           una sola tira que se recorre de lado sin perder dónde iba al filtrar;
 *   · P29 · deslizar un renglón a la derecha avanza (con su Deshacer) y a la izquierda descubre
 *           «Abrir» y «Mover la fecha»; nunca en el cruce de corte ni sin permiso del rol;
 *   y en todas las medidas: 360 y 420 px, claro y oscuro, con y sin movimiento reducido, sin
 *   errores de página, sin desborde horizontal, con contraste de 4.5:1 en lo nuevo y sin nada
 *   animándose en bucle en reposo.
 *
 * Uso:  PUERTO=8935 node pruebas/navegador/pf-tablero.mjs
 *       SOLO=p4,p21 PUERTO=8935 node pruebas/navegador/pf-tablero.mjs   (solo esas secciones)
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const que = (ok, msg, alRevés) => (ok ? bien(msg) : mal(alRevés || msg));
const esp = (p, ms) => p.waitForTimeout(ms);
const SOLO = (process.env.SOLO || '').split(',').map(x => x.trim()).filter(Boolean);
const activa = id => !SOLO.length || SOLO.includes(id);
const titulo = (id, t) => { if (activa(id)) console.log('\n' + t); };

/* Dirección con nombre: es el rol que ve el dinero y puede ganar, agendar e instalar. */
async function abrir({ ancho = 360, alto = 780, tema = 'claro', rm = false, rol = 'direccion', touch = false } = {}) {
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block',
    deviceScaleFactor: 2,
    ...(touch ? { hasTouch: true } : {}),
    ...(rm ? { reducedMotion: 'reduce' } : {}),
  });
  await ctx.addInitScript(([r, t]) => {
    try {
      localStorage.setItem('al3d_pf_rol', sessionStorage.getItem('__pf_rol') || r);
      localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
      localStorage.setItem('al3d_tema', t);
    } catch (_) {}
  }, [rol, tema]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  return { ctx, p, errs };
}

const irA = async (p, hash, espera = 1300) => {
  const destino = B + '/' + hash;
  if (p.url() === destino) await p.reload({ waitUntil: 'load' });
  else await p.goto(destino, { waitUntil: 'load' });
  await esp(p, espera);
};

/* El taller de la prueba, sembrado por la CAPA DE DATOS (`ganar()` es lo que de verdad crea un
   proyecto, con su material derivado). Cada uno cuenta una cosa distinta:
     tarde    en diseño con la instalación a 4 días: «Va tarde»
     vencido  ganado con la instalación hace 3 días: «No llega» (y A10: «sigue sin marcarse»)
     armar    cortado, a tiempo: su botón es «Ya se armar», con mecha
     armar2   cortado, a tiempo: para dos mechas a la vez
     listo    armado, a tiempo: «Ya está listo», con mecha
     instalar listo, a tiempo: «Ya se instaló», que NO se ofrece a deshacer
     sinfecha ganado sin fecha: «Ganado sin fecha», y la cuenta que abre el Calendario */
async function sembrar(p) {
  return p.evaluate(async () => {
    const Proy = await import('./js/datos/proyectos.js');
    const Agenda = await import('./js/datos/agenda.js');
    const { masDias, hoyISO } = await import('./js/nucleo/fechas.js');
    const hoy = hoyISO();
    const letras = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8 };
    const filas = [
      ['tarde', 'COT-9101', 'Healthylicious', 'en_diseno', 4],
      ['vencido', 'COT-9102', 'Parentesis', 'ganado', -3],
      ['armar', 'COT-9103', 'La Perla', 'cortado', 25],
      ['armar2', 'COT-9104', 'Gym Titanio', 'cortado', 27],
      ['listo', 'COT-9105', 'Farmacia Guadalupe', 'armado', 22],
      ['instalar', 'COT-9106', 'Dental Sonrisa', 'listo', 20],
      ['sinfecha', 'COT-9107', 'Café Barrio', 'ganado', null],
    ];
    const out = {};
    for (const [clave, folio, cliente, etapa, dias] of filas) {
      const r = await Proy.ganar({ folio, cliente, proy: cliente + ' — anuncio', ts: Date.now(), estado: 'autorizada',
        items: [letras], neto: 40000, itemsAuth: { 1: 40000 } }, {});
      if (!r.ok) continue;
      const id = r.valor.id;
      if (etapa !== 'ganado') await Proy.avanzarEtapa(id, etapa);
      if (dias !== null) await Agenda.agendar(id, { fecha: masDias(hoy, dias) });
      out[clave] = { id, cliente, folio };
    }
    return out;
  });
}

/* Cotizaciones autorizadas que llevan días sin decidir: las que pinta la tarjeta que late. */
const sinDecidir = (p, n) => p.evaluate(k => {
  const fila = i => ({ folio: 'COT-71' + String(i).padStart(2, '0'), cliente: 'Cliente pendiente ' + i, proy: 'Letrero',
    ts: Date.now() - 9 * 86400000, estado: 'autorizada', neto: 5000 + i, itemsAuth: { 1: 5000 + i },
    items: [{ id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8 }] });
  localStorage.setItem('al3d_historial', JSON.stringify(Array.from({ length: k }, (_, i) => fila(i + 1))));
}, n);

const remontar = async p => {
  await p.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'al3d_historial' })));
  await esp(p, 1500);
};

/* Entrar al Tablero con datos. */
async function entrar(o = {}) {
  const c = await abrir(o);
  await irA(c.p, '#/hoy', 900);
  c.h = await sembrar(c.p);
  if (o.decidir) await sinDecidir(c.p, o.decidir);
  await irA(c.p, '#/hoy', 1500);
  return c;
}

const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => { try { return a.effect.getComputedTiming().iterations === Infinity; } catch (_) { return false; } })
  .map(a => { const t = a.effect && a.effect.target; return (t && (t.id || t.className)) || a.animationName || '?'; }));
const desborde = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const etapaDe = (p, id) => p.evaluate(async i => (await (await import('./js/datos/db.js')).obtener('proyectos', i) || {}).etapa, id);
const esperarEtapa = async (p, id, etapa, ms = 9000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await etapaDe(p, id)) === etapa) return true; await esp(p, 150); }
  return false;
};
const caja = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; });
/* Un renglón del taller por el nombre del cliente. */
const filaDe = (p, cliente) => p.locator('.tb-renglon', { hasText: cliente });
const grupoDe = (p, cliente) => p.evaluate(c => {
  const fila = [...document.querySelectorAll('.tb-renglon')].find(x => x.textContent.includes(c));
  let e = fila && fila.previousElementSibling;
  while (e && !e.classList.contains('ag-grupo')) e = e.previousElementSibling;
  return e ? e.textContent.replace(/\d+$/, '').trim() : null;
}, cliente);

/* Un dedo de verdad: eventos táctiles por el protocolo, que el navegador convierte en eventos de
   puntero con `pointerType: 'touch'`. `page.touchscreen` solo sabe tocar. */
async function dedo(c, pts, pausa = 18) {
  const cdp = await c.ctx.newCDPSession(c.p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
  for (const [x, y] of pts.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await esp(c.p, pausa);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach().catch(() => {});
}
const pasos = (x0, y, x1, n = 14) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y]);

/* Contraste de un elemento de texto: su color contra el fondo opaco de quien lo contiene (se
   compone hacia arriba cualquier fondo con transparencia). Solo vale para fondos lisos, que es lo
   que lleva todo lo nuevo; los degradados los mide pruebas/navegador/contraste.mjs sobre el render. */
const contraste = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s); if (!el) return null;
  const num = c => (c.match(/[\d.]+/g) || []).map(Number);
  const mezcla = (arriba, abajo) => { const a = arriba[3] == null ? 1 : arriba[3]; return [0, 1, 2].map(i => arriba[i] * a + abajo[i] * (1 - a)); };
  let fondo = [255, 255, 255];
  const cadena = []; for (let e = el; e; e = e.parentElement) cadena.push(e);
  for (const e of cadena.reverse()) { const b = num(getComputedStyle(e).backgroundColor); if (b.length && (b[3] == null || b[3] > 0)) fondo = mezcla(b, fondo); }
  const t = num(getComputedStyle(el).color), tinta = mezcla(t, fondo);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const a = L(tinta), b = L(fondo);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}, sel);

/* Las esquinas de la pieza 17 esperan a que el scroll termine antes de volar: «aparecen» puede
   tardar casi un segundo con un destino lejano, y se van solas ~1 s después. Se espera con tope. */
/* Los nodos de la pieza se REUSAN (quedan en el documento, escondidos): lo que dice que las esquinas
   se ven es su clase `.ve`, no que el nodo exista. */
const aparece = p => p.waitForSelector('.mira.ve', { state: 'attached', timeout: 3500 }).then(() => true, () => false);
const seApaga = p => p.waitForFunction(() => !document.querySelector('.mira.ve'), null, { timeout: 4500 }).then(() => true, () => false);

/* Traer un elemento al centro de la pantalla, aguantando que la pantalla se repinte mientras tanto
   (una escritura que acaba de terminar rehace el DOM): el localizador se vuelve a resolver. */
const traer = async loc => {
  for (let i = 0; i < 5; i++) {
    try { await loc.evaluate(e => e.scrollIntoView({ block: 'center' }), null, { timeout: 2500 }); return; }
    catch (_) { await esp(loc.page(), 300); }
  }
};

const hoyDe = p => p.evaluate(async () => (await import('./js/nucleo/fechas.js')).hoyISO());
const masDiasDe = (p, iso, n) => p.evaluate(async ([i, k]) => (await import('./js/nucleo/fechas.js')).masDias(i, k), [iso, n]);

/* ══ 1 · P3 · LAS CUENTAS QUE LLEVAN A LO QUE CUENTAN ═══════════════════════ */
titulo('p3', 'P3 · CADA CUENTA CON ALGO QUE CONTAR ES UNA PUERTA');
if (activa('p3')) {
  const c = await entrar({ touch: true, decidir: 1 });
  const { p, errs } = c;
  const dato = await p.evaluate(() => [...document.querySelectorAll('#mod-tablero .pf-cuentas:not(.tb-linea) .pf-cuenta')].map(e => ({
    tag: e.tagName, clave: e.querySelector('b') ? e.querySelector('b').dataset.cuenta : '',
    n: e.querySelector('b') ? e.querySelector('b').textContent : '',
    flecha: e.querySelector('.pf-cuenta-t') ? getComputedStyle(e.querySelector('.pf-cuenta-t'), '::after').content : '',
    nombre: e.textContent.replace(/\s+/g, ' ').trim(),
  })));
  const de = k => dato.find(x => x.clave === k) || {};
  que(de('tarde').tag === 'BUTTON' && Number(de('tarde').n) > 0, '«Van tarde» con algo que contar es un botón (' + de('tarde').nombre + ')');
  que(de('nollega').tag === 'BUTTON', '«No llegan» también (el vencido de la siembra no llega a su fecha)');
  que(de('sinfecha').tag === 'BUTTON', '«Ganados sin fecha» abre el Calendario y por eso es botón');
  que(/›/.test(de('tarde').flecha), 'lleva la flecha de «ir» tras su etiqueta (' + de('tarde').flecha + ')');
  const ceros = dato.filter(x => x.n === '0');
  que(ceros.every(x => x.tag === 'P' && !/›/.test(x.flecha)), 'una cuenta en 0 es un párrafo sin flecha: no lleva a ningún lado (' + ceros.length + ' en 0)');
  que(/ir al primero que va tarde|ir al que va tarde/.test(de('tarde').nombre), 'el nombre que oye el lector dice A DÓNDE lleva (' + de('tarde').nombre + ')');

  const est = await p.evaluate(() => [...document.querySelectorAll('.tb-etapa')].map(e => ({
    pres: e.getAttribute('aria-pressed'), va: e.classList.contains('va'), flecha: getComputedStyle(e.querySelector('b'), '::after').content })));
  que(est.length === 5 && est.every(e => e.pres !== null && !e.va), 'las cinco estaciones siguen siendo filtros con aria-pressed y NO son cuentas con flecha');

  /* Tocar «Van tarde»: baja al primer renglón con atraso y lo enciende UNA vez. */
  await p.locator('[data-cuenta-va="tarde"]').tap();
  que(await aparece(p), '«Van tarde» enciende su destino con las esquinas de la pieza 17');
  que(await seApaga(p), 'las esquinas se van solas: se enciende UNA vez');
  const llega = await p.evaluate(() => {
    const e = document.querySelector('[data-tarde]'); const r = e.getBoundingClientRect();
    return { arriba: r.top, abajo: r.bottom, alto: innerHeight, foco: !!(document.activeElement && e.contains(document.activeElement)) || document.activeElement === e };
  });
  que(llega.abajo > 0 && llega.arriba < llega.alto, 'y lo trae a la vista (' + Math.round(llega.arriba) + '–' + Math.round(llega.abajo) + ' de ' + llega.alto + ')');
  que(llega.foco, 'con el foco puesto en él, para quien navega con teclado o lector');
  que((await infinitas(p)).length === 0, 'nada gira ni late en bucle después');

  /* Un filtro que esconde lo buscado se suelta: la cuenta cuenta TODO el taller. */
  await p.locator('.tb-etapa[data-etapa="listo"]').tap();
  await esp(p, 300);
  que((await p.locator('.tb-renglon[data-tarde]').count()) === 0, 'con el filtro en «Listo» el renglón atrasado no está en la lista');
  await p.evaluate(() => window.scrollTo(0, 0)); await esp(p, 300);
  await p.locator('[data-cuenta-va="tarde"]').tap();
  await esp(p, 600);
  que((await p.locator('[data-etapa][aria-pressed="true"]').count()) === 0 && (await p.locator('.tb-renglon[data-tarde]').count()) > 0,
    'tocar «Van tarde» suelta el filtro y llega: un toque que no hace nada porque el renglón está escondido sería peor');
  await esp(p, 1500);

  /* «Trabajos sin material» baja a «Falta material»; «En el taller hoy» a «Hoy en el taller». */
  await p.evaluate(() => window.scrollTo(0, 0)); await esp(p, 300);
  await p.locator('[data-cuenta-va="sinmat"]').tap();
  await esp(p, 1700);
  const fm = await p.evaluate(() => { const e = document.querySelector('[data-destino="faltamaterial"]'); const r = e.getBoundingClientRect(); return { t: e.textContent, dentro: r.top >= 0 && r.bottom <= innerHeight }; });
  que(/Falta material/.test(fm.t) && fm.dentro, '«Trabajos sin material» baja a «Falta material» y queda a la vista');
  await p.evaluate(() => window.scrollTo(0, 0)); await esp(p, 300);
  await p.locator('[data-cuenta-va="hoy"]').tap();
  await esp(p, 1700);
  que(await p.evaluate(() => { const r = document.querySelector('[data-destino="hoy"]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }),
    '«En el taller hoy» baja a «Hoy en el taller»');

  /* «No llegan»: con teclado (Enter) y por la barra fija del teléfono, los dos con esquinas. */
  await p.evaluate(() => window.scrollTo(0, 0)); await esp(p, 300);
  await p.locator('[data-cuenta-va="nollega"]').focus();
  await p.keyboard.press('Enter');
  que(await aparece(p), 'con teclado: Enter sobre «No llegan» baja y enciende el destino');
  await seApaga(p);
  que(await p.evaluate(() => { const d = document.querySelector('[data-destino="nollegan"]'); return d.contains(document.activeElement) || d === document.activeElement; }),
    'y el foco cae en el título de la tarjeta, no se queda en el botón de arriba');

  /* Con el ratón: un clic sobre «En el taller hoy» hace lo mismo que el dedo. */
  await p.evaluate(() => window.scrollTo(0, 0)); await esp(p, 300);
  await p.locator('[data-cuenta-va="hoy"]').click();
  que(await aparece(p), 'con el ratón: un clic en una cuenta baja y enciende su destino, igual que el dedo');
  await seApaga(p);

  /* Primero «Decidir»: con una cotización sin decidir la barra fija manda a esa tarjeta. */
  await p.evaluate(() => window.scrollTo(0, 0)); await esp(p, 300);
  const mbar = await p.$eval('#pf-mbar', e => ({ oculta: e.hidden, txt: e.textContent.trim() }));
  que(!mbar.oculta && /Decidir/.test(mbar.txt), 'la barra fija del teléfono ofrece «' + mbar.txt + '»');
  await p.locator('#pf-mbar button').tap();
  que(await aparece(p), 'y al tocarla llega con las esquinas, no en silencio');
  await seApaga(p);

  /* «Ganados sin fecha» abre el Calendario en la lente de Taller. */
  await p.evaluate(() => window.scrollTo(0, 0)); await esp(p, 300);
  await p.locator('[data-cuenta-va="sinfecha"]').tap();
  await esp(p, 1800);
  const cal = await p.evaluate(() => ({ hash: location.hash, txt: (document.getElementById('mod-fabricacion') || {}).textContent || '' }));
  que(cal.hash === '#/agenda' && /con el reloj corriendo/.test(cal.txt), '«Ganados sin fecha» abre el Calendario en su lente de Taller, donde esos proyectos tienen su grupo');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* «Qué atender»: las cuentas de Hoy también son puertas, y solo con rutas que el rol tiene. */
  const q = await entrar({ touch: true });
  await irA(q.p, '#/atender', 1500);
  const dq = await q.p.evaluate(() => [...document.querySelectorAll('#mod-atender .pf-cuenta')].map(e => ({
    tag: e.tagName, clave: e.querySelector('b').dataset.cuenta, n: e.querySelector('b').textContent })));
  que(dq.find(x => x.clave === 'sinfecha' && x.tag === 'BUTTON'), 'en «Qué atender» «Ganados sin fecha» (1) es botón');
  que(dq.filter(x => x.n === '0').every(x => x.tag === 'P'), 'y las de 0 son párrafos');
  await q.p.locator('#mod-atender [data-cuenta-va="sinfecha"]').tap();
  await esp(q.p, 1600);
  que((await q.p.evaluate(() => location.hash)) === '#/agenda', 'tocarla abre el Calendario');
  await q.ctx.close();

  /* Fabricación no tiene Control ni ve importes: nada de «$», y sus cuentas siguen siendo puertas. */
  const f = await abrir({ rol: 'fabricacion', touch: true });
  await irA(f.p, '#/hoy', 900);
  await sembrar(f.p);
  await irA(f.p, '#/hoy', 1500);
  que(!(await f.p.evaluate(() => document.getElementById('mod-tablero').textContent.includes('$'))), 'con el rol de fabricación no aparece ningún importe');
  que((await f.p.locator('#mod-tablero .pf-cuenta.va').count()) > 0, 'y sus cuentas siguen siendo puertas');
  await f.ctx.close();
}

/* ══ 2 · P4 · «YA SE ARMÓ» CON DESHACER Y MECHA ═════════════════════════════ */
titulo('p4', 'P4 · EL BOTÓN SE VUELVE «DESHACER»: LA ESCRITURA ES CUANDO SE APAGA LA MECHA');
if (activa('p4')) {
  const c = await entrar({ touch: true });
  const { p, errs } = c;
  const boton = id => p.locator('[data-avanza="' + id + '"]');
  /* El rótulo de un botón que cruza se escribe con DOS capas (la pieza 23 conserva el ancho del más
     largo), así que `textContent` dice las dos palabras siempre. La verdad de «está en mecha» es el
     atributo de la pieza 15 y su mecha, y el rótulo visible es el de la capa que no está oculta. */
  const mecha = id => boton(id).evaluate(e => {
    const vis = [...e.querySelectorAll('.rotulo-a,.rotulo-b')].find(x => !x.hasAttribute('aria-hidden')) || e;
    return { en: e.hasAttribute('data-deshacer'), mecha: !!e.querySelector('.mecha'), visible: vis.textContent.trim() };
  });
  const id = c.h.armar.id;
  que((await mecha(id)).visible === 'Ya se armó', 'el renglón de «cortado» ofrece «Ya se armó»');
  const grupo0 = await grupoDe(p, 'La Perla');
  await traer(boton(id));
  await boton(id).tap();
  await esp(p, 400);
  let m = await mecha(id);
  que(m.en && m.visible === 'Deshacer', 'tocarlo lo cruza a «Deshacer» con el atributo de la pieza 15');
  que(m.mecha, 'y le sale su mecha');
  que((await etapaDe(p, id)) === 'cortado', 'NADA se escribió todavía: la etapa de verdad sigue en «cortado»');
  que((await grupoDe(p, 'La Perla')) === grupo0, 'y el renglón sigue en su grupo («' + grupo0 + '»): no salta mientras dura la mecha');

  /* Deshacer: el botón regresa, y NO se escribe ni cuando pasaría el tiempo. */
  await esp(p, 700);
  await boton(id).tap();
  await esp(p, 500);
  m = await mecha(id);
  que(!m.en && !m.mecha && m.visible === 'Ya se armó', '«Deshacer» devuelve el botón a su rótulo y le quita la mecha');
  await esp(p, 5600);
  que((await etapaDe(p, id)) === 'cortado', 'y aunque pase el tiempo de la mecha NO se escribió nada (deshacer es no escribir)');

  /* Sobrevive a un repintado: el filtro de estaciones rehace todo el DOM. */
  await boton(id).tap();
  await esp(p, 1200);
  await p.locator('.tb-etapa[data-etapa="cortado"]').tap();
  await esp(p, 500);
  m = await mecha(id);
  que(m.en && m.mecha && m.visible === 'Deshacer', 'si el filtro repinta la pantalla con la mecha viva, el botón NUEVO sigue en «Deshacer» y con mecha');
  que(await esperarEtapa(p, id, 'armado'), 'y al apagarse la mecha la etapa SÍ se escribió: «armado»');
  await esp(p, 600);
  que(/avanz/.test(await p.locator('#toast').textContent()), 'con su aviso de que avanzó');
  await p.locator('.tb-etapa[data-etapa="cortado"]').tap();   // suelta el filtro
  await esp(p, 400);
  que((await grupoDe(p, 'La Perla')) === 'Armado', 'ahora SÍ el renglón está en su grupo nuevo («Armado»)');

  /* Dos mechas a la vez: cada una es de su renglón, y escribir una no se lleva la otra. */
  const a1 = c.h.armar2.id, b1 = c.h.listo.id;
  await traer(boton(a1)); await boton(a1).tap();
  await esp(p, 500);
  await traer(boton(b1)); await boton(b1).tap();
  await esp(p, 400);
  que((await mecha(a1)).en && (await mecha(b1)).en, 'dos renglones pueden estar en su mecha a la vez');
  que(await esperarEtapa(p, a1, 'armado') && await esperarEtapa(p, b1, 'listo'), 'las dos se escriben a su hora');
  await esp(p, 1200);

  /* Lo que NO se ofrece a deshacer: «Ya se instaló» (mueve el proyecto Y su instalación). */
  const inst = c.h.instalar.id;
  que((await mecha(inst)).visible === 'Ya se instaló', 'el renglón de «listo» ofrece «Ya se instaló»');
  await traer(boton(inst));
  await boton(inst).tap();
  que(await esperarEtapa(p, inst, 'instalado', 2500), '«Ya se instaló» escribe AL TOQUE: no tiene mecha ni Deshacer');
  que(!(await p.locator('[data-deshacer]').count()), 'y no quedó ningún botón en «Deshacer»');

  /* El cruce de corte NO se ofrece a deshacer: pregunta. */
  const cruce = c.h.tarde.id;
  await traer(boton(cruce));
  await boton(cruce).tap();
  await esp(p, 500);
  que(await p.evaluate(() => document.getElementById('pf-pide').classList.contains('show')), '«Ya se cortó» abre la pregunta del corte, no una mecha');
  que((await etapaDe(p, cruce)) === 'en_diseno', 'y no escribió nada todavía');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Con teclado: el mismo botón. */
  const k = await entrar({});
  const id2 = k.h.armar.id;
  const kb = k.p.locator('[data-avanza="' + id2 + '"]');
  await traer(kb);
  await kb.focus();
  await k.p.keyboard.press('Enter');
  await esp(k.p, 500);
  que(await kb.evaluate(e => e.hasAttribute('data-deshacer')), 'con teclado: Enter sobre «Ya se armó» lo cruza a «Deshacer»');
  await k.p.keyboard.press('Enter');
  await esp(k.p, 500);
  que(await kb.evaluate(e => !e.hasAttribute('data-deshacer')), 'y Enter otra vez lo deshace');
  que((await etapaDe(k.p, id2)) === 'cortado', 'sin escribir nada');
  /* Y si no se deshace, al apagarse la mecha el foco no se cae al <body>: pasa al botón del mismo
     trabajo, que ya ofrece el paso que sigue. */
  await kb.focus();
  await k.p.keyboard.press('Enter');
  que(await esperarEtapa(k.p, id2, 'armado', 9000), 'con teclado: sin deshacer, la etapa se escribe al apagarse la mecha');
  await esp(k.p, 900);
  que(await k.p.evaluate(id => { const a = document.activeElement; return a && a.getAttribute('data-avanza') === id; }, id2),
    'y el foco queda en el botón de ese trabajo (ahora «Ya está listo»), no se cae al principio de la página');
  await k.ctx.close();

  /* Irse de la pantalla con la mecha viva no la cancela: la escritura sigue colgada de su hora. */
  const v = await entrar({ touch: true });
  const id3 = v.h.armar.id;
  await v.p.locator('[data-avanza="' + id3 + '"]').tap();
  await esp(v.p, 500);
  await irA(v.p, '#/proyectos', 600);
  que((await etapaDe(v.p, id3)) === 'cortado', 'al salir del Tablero con la mecha viva, todavía no se escribió');
  que(await esperarEtapa(v.p, id3, 'armado', 8000), 'pero la mecha sigue sola y a su hora la etapa SÍ se escribe, aunque ya no se mire el Tablero');
  /* Y si vuelve antes de que se apague, el botón sigue en «Deshacer». */
  await irA(v.p, '#/hoy', 1300);
  const id4 = v.h.armar2.id;
  await v.p.locator('[data-avanza="' + id4 + '"]').tap();
  await esp(v.p, 400);
  await irA(v.p, '#/proyectos', 500);
  await irA(v.p, '#/hoy', 900);
  que(await v.p.locator('[data-avanza="' + id4 + '"]').evaluate(e => e.hasAttribute('data-deshacer')),
    'si se vuelve al Tablero antes de que se apague, el botón del renglón sigue en «Deshacer» con su mecha');
  /* La app pasa a segundo plano: se confirma en lugar de esperar donde el sistema puede
     descartar la pestaña. */
  await v.p.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  que(await esperarEtapa(v.p, id4, 'armado', 2500), 'al ocultarse la app con la mecha viva, la etapa se escribe de inmediato (no se queda esperando donde la pestaña puede descartarse)');
  que(v.errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(v.errs)].slice(0, 2).join(' | '));
  await v.ctx.close();
}

/* ══ 3 · P11 · EL LATIDO SE APAGA ═══════════════════════════════════════════ */
titulo('p11', 'P11 · «SIN DECIDIR» LATE TRES VECES Y SE CALLA; VUELVE A LATIR SOLO SI LA CUENTA SUBE');
if (activa('p11')) {
  const c = await entrar({ touch: true, decidir: 1 });
  const { p, errs } = c;
  const late = () => p.evaluate(() => {
    const el = document.querySelector('#mod-tablero .cand-partidas'); if (!el) return null;
    const cs = getComputedStyle(el);
    return { quieta: el.classList.contains('quieta'), nombre: cs.animationName, veces: cs.animationIterationCount };
  });
  const l1 = await late();
  que(l1 && !l1.quieta && l1.veces === '3', 'la primera vez que aparece la tarjeta late TRES veces y no en bucle (' + JSON.stringify(l1) + ')');
  await p.locator('.tb-etapa[data-etapa="armado"]').tap();      // repinta por otra cosa
  await esp(p, 500);
  const l2 = await late();
  que(l2 && l2.quieta && l2.nombre === 'none', 'repintada por cualquier otra cosa, la misma cuenta ya no late: nace quieta (' + JSON.stringify(l2) + ')');
  await sinDecidir(p, 2);
  await remontar(p);
  const l3 = await late();
  que(l3 && !l3.quieta && l3.veces === '3', 'pero si la cuenta SUBE (de 1 a 2) vuelve a latir tres veces (' + JSON.stringify(l3) + ')');
  await sinDecidir(p, 1);
  await remontar(p);
  que((await late()).quieta, 'y si BAJA no late');
  await esp(p, 300);
  que((await infinitas(p)).length === 0, 'nada gira en bucle en toda la pantalla con la tarjeta puesta');

  /* «Qué atender» tiene la misma tarjeta y la misma regla. */
  await irA(p, '#/atender', 1500);
  const lq = await p.evaluate(() => { const e = document.querySelector('#mod-atender .cand-partidas'); return e && { quieta: e.classList.contains('quieta'), veces: getComputedStyle(e).animationIterationCount }; });
  que(lq && !lq.quieta && lq.veces === '3', 'en «Qué atender» la primera vez también late tres veces (' + JSON.stringify(lq) + ')');
  await p.locator('#mod-atender [data-acc]').first().focus();
  await sinDecidir(p, 1);
  await remontar(p);
  que(await p.evaluate(() => document.querySelector('#mod-atender .cand-partidas').classList.contains('quieta')), 'y al repintarse se calla');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

/* ══ 4 · P13 · LO ATENDIDO SE PALOMEA, SE TACHA Y SE PLIEGA ═════════════════ */
titulo('p13', 'P13 · «QUÉ ATENDER»: EL AVISO ATENDIDO SE RESUELVE EN SU SITIO');
for (const rm of [false, true]) {
  if (!activa('p13')) break;
  console.log(rm ? '  — con menos movimiento —' : '  — con movimiento —');
  const c = await entrar({ touch: true, rm });
  const { p, errs } = c;
  await irA(p, '#/atender', 1600);
  const avisos = () => p.evaluate(() => [...document.querySelectorAll('#mod-atender .av-fila')].map(e => e.dataset.titulo));
  const antes = await avisos();
  que(antes.some(t => /Parentesis/.test(t)), 'hay un aviso de «sigue sin marcarse» para la instalación vencida (' + antes.length + ' avisos)');
  const fila = p.locator('#mod-atender .av-fila', { hasText: 'Parentesis' }).first();
  const ya = fila.locator('[data-acc]', { hasText: 'Ya se instaló' });
  que((await ya.count()) === 1, 'y ofrece «Ya se instaló»');
  await ya.tap();
  await esp(p, 250);
  const e1 = await fila.evaluate(e => ({
    hecho: e.classList.contains('hecho'), pliega: e.classList.contains('pliega'),
    tachado: getComputedStyle(e.querySelector('.pf-fila-t')).textDecorationLine,
    palomita: !!e.querySelector('.pf-fila-ico .palomita'), opaco: getComputedStyle(e.querySelector('.pf-fila-t')).opacity,
    inerte: e.querySelector('.pf-fila').hasAttribute('inert'),
  }));
  que(e1.hecho && /line-through/.test(e1.tachado), 'a los 250 ms el renglón ya está «hecho» y su título tachado');
  que(e1.palomita, 'la palomita ocupa el lugar de su icono');
  que(e1.opaco === '1', 'el estado no se dice con opacity: lo dicen el tachado y la tinta segunda (opacity ' + e1.opaco + ')');
  que(e1.inerte, 'y el renglón deja de recibir toques mientras se despide');
  que(!e1.pliega && (await fila.count()) === 1, 'todavía no se ha plegado ni repintado: sigue ahí a la vista, para que se vea CUÁL fue');
  if (rm) {
    await esp(p, 300);
    que(!(await fila.evaluate(e => e.classList.contains('pliega')).catch(() => false)), 'con menos movimiento NO hay pliegue');
  } else {
    await esp(p, 650);
    que(await fila.evaluate(e => e.classList.contains('pliega')).catch(() => false), 'se pliega (grid-template-rows de 1fr a 0fr) antes de repintar');
  }
  await esp(p, 900);
  const despues = await avisos();
  que(despues.length === antes.length - 1 && !despues.some(t => /Parentesis/.test(t)),
    'tras el pliegue se repinta: el renglón ya no está y los demás siguen (' + antes.length + ' → ' + despues.length + ')');
  que((await etapaDe(p, c.h.vencido.id)) === 'instalado', 'y la acción SÍ se hizo: el proyecto quedó «Instalado»');
  que((await infinitas(p)).length === 0, 'nada gira en bucle');
  que((await desborde(p)) <= 0, 'sin desborde horizontal');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}
if (activa('p13')) {
  /* Si la acción FALLA no se tacha nada: la instalación desaparece de la base entre que se pintó el
     aviso y se tocó el botón, y `Agenda.marcar` contesta que no existe. Un renglón tachado que
     sigue pendiente es peor que ninguna señal. */
  const f = await entrar({ touch: true });
  await irA(f.p, '#/atender', 1600);
  await f.p.evaluate(async id => {
    const Agenda = await import('./js/datos/agenda.js'); const DB = await import('./js/datos/db.js');
    const [i] = await Agenda.listar({ proyecto_id: id }); await DB.borrar('instalaciones', i.id);
  }, f.h.vencido.id);
  const fila = f.p.locator('#mod-atender .av-fila', { hasText: 'Parentesis' }).first();
  await fila.locator('[data-acc]', { hasText: 'Ya se instaló' }).tap();
  await esp(f.p, 1800);
  const sigue = await fila.evaluate(e => ({ hecho: e.classList.contains('hecho'), pliega: e.classList.contains('pliega'), inerte: e.querySelector('.pf-fila').hasAttribute('inert') })).catch(() => null);
  que(sigue && !sigue.hecho && !sigue.pliega && !sigue.inerte, 'si la acción falla el renglón NO se tacha, no se pliega y sigue tocable');
  que((await f.p.locator('#toast').textContent()).length > 3, 'y el aviso de error lo dice');
  await f.ctx.close();

  /* Con teclado: el foco no se cae al <body> cuando el renglón se va. */
  const k = await entrar({});
  await irA(k.p, '#/atender', 1600);
  const bk = k.p.locator('#mod-atender .av-fila', { hasText: 'Parentesis' }).first().locator('[data-acc]', { hasText: 'Ya se instaló' });
  await bk.focus();
  await k.p.keyboard.press('Enter');
  await esp(k.p, 2600);
  const foco = await k.p.evaluate(() => { const a = document.activeElement; return { cuerpo: a === document.body, dentro: !!a.closest && !!a.closest('#mod-atender') }; });
  que(!foco.cuerpo && foco.dentro, 'con teclado: al irse el renglón el foco pasa a otro control de la lista y no se cae al <body>');
  await k.ctx.close();
}

/* ══ 5 · P14 · FECHAS RÁPIDAS ═══════════════════════════════════════════════ */
titulo('p14', 'P14 · FECHAS RÁPIDAS AL GANAR Y AL AGENDAR');
if (activa('p14')) {
  const c = await entrar({ touch: true, decidir: 1 });
  const { p, errs } = c;
  await irA(p, '#/atender', 1600);
  const hoy = await hoyDe(p), man = await masDiasDe(p, hoy, 1);
  await p.locator('#mod-atender [data-acc]', { hasText: 'Se ganó' }).tap();
  await esp(p, 700);
  const fichas = () => p.$$eval('#pf-pide .pf-rapida', es => es.map(e => ({
    t: e.querySelector('.pf-rapida-t').textContent, v: e.querySelector('input').value, on: e.querySelector('input').checked,
    alto: e.getBoundingClientRect().height, clase: e.classList.contains('on') })));
  let fs = await fichas();
  que(fs.length === 5 && fs[0].t === 'Hoy' && fs[1].t === 'Mañana' && fs[4].t === 'Sin fecha',
    'al ganar hay cinco fichas: ' + fs.map(f => f.t).join(' · '));
  que(/^(lun|mar|mié|jue|vie|sáb|dom) \d+$/.test(fs[2].t) && /^(lun|mar|mié|jue|vie|sáb|dom) \d+$/.test(fs[3].t), 'los dos días de en medio son «día número» (' + fs[2].t + ', ' + fs[3].t + ')');
  que(fs[0].on && fs[0].clase && (await p.inputValue('#pf-ganar-fecha')) === hoy, '«Hoy» sale elegida porque el campo trae hoy: se VE lo que se está eligiendo');
  que(fs.every(f => f.alto >= 43.5), 'cada ficha mide al menos 44 px de alto con el dedo (' + Math.min(...fs.map(f => f.alto)).toFixed(1) + ')');
  que(fs[2].v > man && fs[3].v > fs[2].v, 'y los dos días salen DESPUÉS de mañana y en orden (' + fs[2].v + ', ' + fs[3].v + ')');
  const dsem = await p.evaluate(async iso => (await import('./js/nucleo/fechas.js')).diaSemana(iso), fs[2].v);
  const dsem2 = await p.evaluate(async iso => (await import('./js/nucleo/fechas.js')).diaSemana(iso), fs[3].v);
  que([dsem, dsem2].sort().join() === [1, 6].sort().join(), 'son el próximo sábado y el próximo lunes (' + dsem + ', ' + dsem2 + ')');

  await p.locator('#pf-pide .pf-rapida', { hasText: 'Mañana' }).tap();
  await esp(p, 200);
  que((await p.inputValue('#pf-ganar-fecha')) === man, 'tocar «Mañana» escribe en el campo de fecha (' + man + ')');
  fs = await fichas();
  que(fs[1].on && !fs[0].on, 'y solo ella queda elegida');
  await p.locator('#pf-pide .pf-rapida', { hasText: 'Sin fecha' }).tap();
  await esp(p, 200);
  que((await p.inputValue('#pf-ganar-fecha')) === '', '«Sin fecha» vacía el campo (ya está permitido)');
  await p.fill('#pf-ganar-fecha', '2031-02-03');
  await esp(p, 200);
  que(!(await fichas()).some(f => f.on), 'una fecha tecleada en el campo apaga las fichas: no coincide con ninguna');

  /* Teclado: las flechas mueven la elección dentro del grupo y escriben en el campo. */
  await p.fill('#pf-ganar-fecha', hoy);
  await esp(p, 200);
  await p.locator('#pf-pide .pf-rapida-in').first().focus();
  await p.keyboard.press('ArrowRight');
  await esp(p, 200);
  que((await p.inputValue('#pf-ganar-fecha')) === man, 'con teclado: la flecha derecha pasa de «Hoy» a «Mañana» y escribe el campo');
  que(await p.evaluate(() => { const r = document.querySelector('#pf-pide .pf-rapida:has(input:focus-visible)'); return !!r; }), 'y la ficha enfocada se ve (aro de foco)');
  await p.locator('#pf-pide [data-pide="ganar"]').tap();
  await esp(p, 1200);
  const inst = await p.evaluate(async () => {
    const Proy = await import('./js/datos/proyectos.js'); const Agenda = await import('./js/datos/agenda.js');
    const ps = await Proy.listar({}); const p = ps.find(x => x.folio_local === 'COT-7101' || (x.nombre || '').includes('Cliente pendiente'));
    if (!p) return null; const [i] = await Agenda.listar({ proyecto_id: p.id });
    return i ? i.fecha : 'sin instalación';
  });
  que(inst === man, 'guardar con «Mañana» crea el proyecto con su instalación ese día (' + inst + ')');

  /* «Mover fecha»: día y hora. Aquí NO hay «Sin fecha» (la pantalla existe para ponerla). */
  await irA(p, '#/atender', 1500);
  const mover = p.locator('#mod-atender [data-acc]', { hasText: 'Mover fecha' }).first();
  que((await mover.count()) === 1, 'hay un aviso con «Mover fecha»');
  await mover.tap();
  await esp(p, 700);
  const dias = await p.$$eval('#pf-pide input[name="pf-rapida-dia"]', es => es.map(e => e.closest('.pf-rapida').textContent.replace(/\s+/g, ' ').trim()));
  const horas = await p.$$eval('#pf-pide input[name="pf-rapida-hora"]', es => es.map(e => e.closest('.pf-rapida').textContent.replace(/\s+/g, ' ').trim()));
  que(dias.length === 4 && !dias.some(t => /Sin fecha/.test(t)), 'el día lleva cuatro fichas y ninguna es «Sin fecha» (' + dias.join(' · ') + ')');
  que(horas.length === 5 && /Sin hora/.test(horas[0]) && /9 a\.m\./.test(horas[1]) && /Noche/.test(horas[4]), 'la hora lleva «Sin hora · 9 a.m. · 12 p.m. · 4 p.m. · Noche» (' + horas.join(' · ') + ')');
  await p.locator('#pf-pide .pf-rapida', { hasText: '4 p.m.' }).tap();
  await p.locator('#pf-pide .pf-rapida', { hasText: 'Mañana' }).tap();
  await esp(p, 200);
  que((await p.inputValue('#pf-fecha-hora')) === '16:00' && (await p.inputValue('#pf-fecha-dia')) === man, 'las fichas escriben el día (' + man + ') y la hora (16:00)');
  await p.locator('#pf-pide .pf-rapida', { hasText: 'Sin hora' }).tap();
  await esp(p, 200);
  que((await p.inputValue('#pf-fecha-hora')) === '', '«Sin hora» vacía la hora');
  await p.locator('#pf-pide .pf-rapida', { hasText: '4 p.m.' }).tap();
  const fila = await p.evaluate(() => (document.querySelector('#pf-pide .pf-panel-b .pf-fila-d') || {}).textContent);
  await p.locator('#pf-pide [data-pide="fecha"]').tap();
  await esp(p, 1300);
  const hora = await p.evaluate(async fecha => {
    const Agenda = await import('./js/datos/agenda.js'); const todas = await Agenda.listar({ vivas: true });
    return todas.filter(i => i.fecha === fecha).map(i => i.hora);
  }, man);
  que(hora.includes('16:00'), 'guardar mueve la instalación a mañana a las 16:00 (' + hora.join(',') + ' · ' + (fila || '').slice(0, 40) + ')');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

/* ══ 6 · P18 · LAS CUENTAS RUEDAN CUANDO ALGO CAMBIÓ, NUNCA AL ENTRAR ═══════ */
titulo('p18', 'P18 · LAS CUENTAS RUEDAN CUANDO LA SINCRONIZACIÓN CAMBIA ALGO');
if (activa('p18')) {
  const c = await entrar({ touch: true });
  const { p, errs } = c;
  const rueda = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && (e.classList.contains('rueda-rodando') || !!e.querySelector('.rueda-vista') || !!e.querySelector('.rueda-delta')); }, sel);
  que(!(await rueda('#mod-tablero [data-cuenta="hoy"]')), 'al entrar a la pantalla ninguna cuenta rueda');
  que((await p.$$eval('#mod-tablero .pf-cuenta b[data-cuenta]', e => e.length)) >= 4, 'las cuentas llevan su clave: un cambio SÍ rueda');
  await p.evaluate(() => {
    window.__giro = { cifra: false, delta: false };
    new MutationObserver(ms => {
      for (const m of ms) {
        const t = m.target;
        if (t.classList && t.classList.contains('rueda-rodando') && t.closest('#mod-tablero .pf-cuentas')) window.__giro.cifra = true;
        for (const n of m.addedNodes || []) if (n.nodeType === 1 && n.classList.contains('rueda-delta')) window.__giro.delta = true;
      }
    }).observe(document.getElementById('mod-tablero'), { attributes: true, subtree: true, attributeFilter: ['class'], childList: true });
  });
  /* Llega «algo de otro teléfono»: un trabajo más con la instalación vencida (no llega). */
  await p.evaluate(async () => {
    const Proy = await import('./js/datos/proyectos.js'); const Agenda = await import('./js/datos/agenda.js');
    const { masDias, hoyISO } = await import('./js/nucleo/fechas.js');
    const r = await Proy.ganar({ folio: 'COT-9190', cliente: 'Llegó de otro teléfono', proy: 'anuncio', ts: Date.now(), estado: 'autorizada',
      items: [{ id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, altura: 40, n: 8 }], neto: 40000, itemsAuth: { 1: 40000 } }, {});
    await Agenda.agendar(r.valor.id, { fecha: masDias(hoyISO(), -4) });
  });
  await remontar(p);
  const g = await p.evaluate(() => window.__giro);
  que(g.cifra, 'si la sincronización remonta la pantalla y una cuenta cambió delante de ti, rueda');
  que(g.delta, 'y aparece su «+1» breve');
  que((await p.$eval('#mod-tablero [data-cuenta="nollega"]', e => e.textContent)) === '2', 'con su valor final bien escrito (textContent «2»)');
  /* Entrar de verdad NO rueda: se sale, algo cambia por otro lado y se vuelve. */
  await irA(p, '#/proyectos', 1200);
  await p.evaluate(async () => {
    const Proy = await import('./js/datos/proyectos.js'); const todos = await Proy.listar({});
    const x = todos.find(t => t.etapa === 'ganado' && (t.nombre || '').includes('Café'));
    if (x) await Proy.avanzarEtapa(x.id, 'en_diseno');
  });
  await irA(p, '#/hoy', 400);
  await p.evaluate(() => { window.__giro2 = false; });
  await esp(p, 900);
  que(!(await rueda('#mod-tablero [data-cuenta]')), 'al volver a entrar después de un cambio, el primer pintado NO rueda');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Con menos movimiento el cambio es un fundido: el número no rueda y el «+1» sí se dice. */
  const r = await entrar({ touch: true, rm: true });
  await r.p.evaluate(() => {
    window.__giro = { cifra: false, delta: false };
    new MutationObserver(ms => {
      for (const m of ms) {
        const t = m.target;
        if (t.classList && t.classList.contains('rueda-rodando') && t.closest('#mod-tablero .pf-cuentas')) window.__giro.cifra = true;
        for (const n of m.addedNodes || []) if (n.nodeType === 1 && n.classList.contains('rueda-delta')) window.__giro.delta = true;
      }
    }).observe(document.getElementById('mod-tablero'), { attributes: true, subtree: true, attributeFilter: ['class'], childList: true });
  });
  await r.p.evaluate(async () => {
    const Proy = await import('./js/datos/proyectos.js'); const Agenda = await import('./js/datos/agenda.js');
    const { masDias, hoyISO } = await import('./js/nucleo/fechas.js');
    const x = await Proy.ganar({ folio: 'COT-9191', cliente: 'Otro más', proy: 'anuncio', ts: Date.now(), estado: 'autorizada',
      items: [{ id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, altura: 40, n: 8 }], neto: 40000, itemsAuth: { 1: 40000 } }, {});
    await Agenda.agendar(x.valor.id, { fecha: masDias(hoyISO(), -4) });
  });
  await remontar(r.p);
  const gr = await r.p.evaluate(() => window.__giro);
  que(!gr.cifra, 'con menos movimiento la cifra NO rueda');
  que(gr.delta, 'pero el «+1» sí aparece (en fundido): lo que cambió es información');
  que((await r.p.$eval('#mod-tablero [data-cuenta="nollega"]', e => e.textContent)) === '2', 'y el número queda bien escrito');
  await r.ctx.close();
}

/* ══ 7 · P21 · «SÍ, YA SE CORTÓ» SE DESLIZA ═════════════════════════════════ */
titulo('p21', 'P21 · «SÍ, YA SE CORTÓ» ES UN DESLIZADOR QUE ENSEÑA EL RESULTADO');
if (activa('p21')) {
  const c = await entrar({ touch: true });
  const { p, errs } = c;
  const id = c.h.tarde.id;
  const abrirCorte = async clien => {
    const b = filaDe(p, clien).locator('[data-avanza]');
    await traer(b); await b.tap(); await esp(p, 700);
  };
  await abrirCorte('Healthylicious');
  const riel = () => p.$eval('#pf-pide-riel', e => ({ estado: e.dataset.estado, txt: e.textContent.replace(/\s+/g, ' ').trim() }));
  que((await p.locator('#pf-pide [data-si]').count()) === 1, 'la pregunta lleva el pulgar del deslizador');
  const cp = await caja(p, '#pf-pide-riel'), cu = await caja(p, '#pf-pide .pf-desliza-pulgar');
  que(cp.h >= 44 && cu.h >= 44 && cu.w >= 44, 'la pista y el pulgar miden al menos 44 px (' + cp.h + ' y ' + cu.w + '×' + cu.h + ')');
  que((await etapaDe(p, id)) === 'en_diseno', 'abrir la pregunta no escribe nada');

  /* Un toque corto NO confirma: enseña cómo se usa. */
  await p.locator('#pf-pide .pf-desliza-pulgar').tap();
  await esp(p, 400);
  que((await etapaDe(p, id)) === 'en_diseno' && /Desliza/.test(await p.$eval('#pf-pide-msg', e => e.textContent)), 'un toque corto sobre el pulgar no confirma: dice cómo se usa');

  /* A medias y se suelta: regresa, no escribe. */
  let x0 = cu.x + cu.w / 2, y0 = cu.y + cu.h / 2;
  await dedo(c, pasos(x0, y0, x0 + (cp.w - 60) * 0.5, 12));
  await esp(p, 600);
  que((await etapaDe(p, id)) === 'en_diseno' && (await riel()).estado === 'quieto', 'arrastrar a la mitad y soltar: el pulgar regresa y NO se escribe');
  que(Math.abs((await caja(p, '#pf-pide .pf-desliza-pulgar')).x - cu.x) < 3, 'y el pulgar vuelve a su lugar de salida');

  /* Con el dedo hasta el final: confirma. */
  await dedo(c, pasos(x0, y0, x0 + cp.w, 16));
  await esp(p, 200);
  que(['trabaja', 'ok'].includes((await riel()).estado), 'arrastrado hasta el final, la pista pasa a «' + (await riel()).estado + '»');
  que(await esperarEtapa(p, id, 'cortado', 4000), 'y la etapa quedó en «cortado»');
  await esp(p, 600);
  const fin = await riel();
  que(fin.estado === 'ok' && /Salieron \d+ materiales|Salió 1 material|Quedó en «Cortado»/.test(fin.txt), 'la pista se abre en una píldora con el resultado: «' + fin.txt + '»');
  const ver = await p.locator('#pf-pide [data-ver-almacen]').count();
  que(/Salier|Salió/.test(fin.txt) ? ver === 1 : ver === 0, '«Ver almacén» está si y solo si salió material (' + ver + ')');
  que((await p.$eval('#pf-pide .pf-pide-f .btn', e => e.textContent)) === 'Listo', 'y el botón de abajo pasó de «Todavía no» a «Listo»');
  que(await p.evaluate(() => !document.querySelector('.tb-renglon [data-avanza][data-deshacer]')), 'sin mecha de por medio: el corte no se deshace');
  if (ver) {
    await p.locator('#pf-pide [data-ver-almacen]').tap();
    await esp(p, 1300);
    que((await p.evaluate(() => location.hash)) === '#/material' && !(await p.evaluate(() => document.getElementById('pf-pide').classList.contains('show'))), '«Ver almacén» cierra la pregunta y abre Material');
  } else {
    await p.locator('#pf-pide .pf-pide-f .btn').tap(); await esp(p, 500);
  }
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Teclado y ratón: Enter sobre el pulgar confirma; arrastrar con el ratón también. */
  const m = await entrar({});
  const t = m.h.tarde.id;
  const bt = filaDe(m.p, 'Healthylicious').locator('[data-avanza]');
  await traer(bt); await bt.focus(); await m.p.keyboard.press('Enter'); await esp(m.p, 700);
  await m.p.locator('#pf-pide [data-si]').focus();
  que(await m.p.evaluate(() => document.getElementById('pf-pide').contains(document.activeElement)), 'el foco entra a la pregunta (cerco de tabulador)');
  await m.p.keyboard.press('Enter');
  que(await esperarEtapa(m.p, t, 'cortado', 4000), 'con teclado: Enter sobre el pulgar confirma el corte');
  await esp(m.p, 500);
  que(/Salier|Salió|Quedó/.test((await m.p.$eval('#pf-pide-riel', e => e.textContent))), 'y se abre en la píldora del resultado');
  await m.ctx.close();

  const r = await entrar({});
  const r1 = r.h.tarde.id;
  const br = filaDe(r.p, 'Healthylicious').locator('[data-avanza]');
  await traer(br); await br.click(); await esp(r.p, 700);
  const k1 = await caja(r.p, '#pf-pide .pf-desliza-pulgar'), k2 = await caja(r.p, '#pf-pide-riel');
  await r.p.mouse.move(k1.x + k1.w / 2, k1.y + k1.h / 2);
  await r.p.mouse.down();
  for (let i = 1; i <= 14; i++) { await r.p.mouse.move(k1.x + k1.w / 2 + (k2.w * i / 14), k1.y + k1.h / 2); await esp(r.p, 12); }
  await r.p.mouse.up();
  que(await esperarEtapa(r.p, r1, 'cortado', 4000), 'con el ratón: arrastrar el pulgar hasta el final confirma, y el clic que el navegador manda al soltar no confirma dos veces');
  await r.ctx.close();

  /* Si falla, regresa con el motivo y no se tacha nada: el proyecto desaparece de la base entre la
     pregunta y el deslizamiento. */
  const f = await entrar({ touch: true });
  await abrirCorteDe(f, 'Healthylicious');
  await f.p.evaluate(async id => { const DB = await import('./js/datos/db.js'); await DB.borrar('proyectos', id); }, f.h.tarde.id);
  const fb = await caja(f.p, '#pf-pide .pf-desliza-pulgar'), fr = await caja(f.p, '#pf-pide-riel');
  await dedo(f, pasos(fb.x + fb.w / 2, fb.y + fb.h / 2, fb.x + fb.w / 2 + fr.w, 16));
  await esp(f.p, 1200);
  const falla = await f.p.evaluate(() => ({ estado: document.getElementById('pf-pide-riel').dataset.estado,
    msg: document.getElementById('pf-pide-msg').textContent, visible: !document.getElementById('pf-pide-msg').hidden }));
  que(falla.estado === 'quieto' && falla.visible && falla.msg.length > 5, 'si falla, el deslizador regresa y dice por qué: «' + falla.msg + '»');
  que(Math.abs((await caja(f.p, '#pf-pide .pf-desliza-pulgar')).x - fb.x) < 3, 'con el pulgar otra vez en su lugar, listo para reintentar');
  await f.ctx.close();
}
async function abrirCorteDe(c, cliente) {
  const b = filaDe(c.p, cliente).locator('[data-avanza]');
  await traer(b); await b.tap(); await esp(c.p, 700);
}

/* ══ 8 · P25 · LA LÍNEA DE ESTACIONES COMO TUBERÍA ══════════════════════════ */
titulo('p25', 'P25 · LA LÍNEA DE ESTACIONES: CONECTORES Y, EN EL TELÉFONO, UNA TIRA QUE SE RECORRE');
if (activa('p25')) {
  for (const ancho of [360, 420]) {
    const c = await entrar({ ancho, touch: true });
    const { p, errs } = c;
    const m = await p.evaluate(() => {
      const l = document.querySelector('.tb-linea'); const es = [...l.querySelectorAll('.tb-etapa')];
      const cs = getComputedStyle(l);
      return { flex: cs.display, scroll: l.scrollWidth, ancho: l.clientWidth, snap: cs.scrollSnapType,
        tubo: es.map((e, i) => { const a = getComputedStyle(e, '::after'); return { i, ancho: a.width, contenido: a.content }; }),
        tops: new Set(es.map(e => Math.round(e.getBoundingClientRect().top))).size, grupo: l.getAttribute('aria-label') };
    });
    que(m.flex === 'flex' && m.scroll > m.ancho + 40, ancho + ' px: la línea es UNA tira que se recorre de lado (' + m.ancho + ' de ' + m.scroll + ' px)');
    que(/x/.test(m.snap), ancho + ' px: se detiene en cada estación (scroll-snap: ' + m.snap + ')');
    que(m.tops === 1, ancho + ' px: todas las estaciones en UN solo renglón');
    que(m.tubo.slice(0, 4).every(t => t.contenido !== 'none' && parseFloat(t.ancho) >= 12) && m.tubo[4].contenido === 'none', ancho + ' px: hay tubo entre estaciones y la última no lleva uno que apunte a nada');
    que(/orden del proceso/.test(m.grupo), 'el orden también se dice con palabras en el nombre del grupo («' + m.grupo + '»)');
    /* Recorrerla y filtrar no la devuelve al principio. */
    await p.evaluate(() => { document.querySelector('.tb-linea').scrollLeft = 9999; });
    await esp(p, 300);
    const x1 = await p.evaluate(() => document.querySelector('.tb-linea').scrollLeft);
    await p.locator('.tb-etapa[data-etapa="listo"]').tap();
    await esp(p, 500);
    const x2 = await p.evaluate(() => ({ x: document.querySelector('.tb-linea').scrollLeft, on: document.querySelector('.tb-etapa[data-etapa="listo"]').getAttribute('aria-pressed') }));
    que(x2.on === 'true' && Math.abs(x2.x - x1) < 4, ancho + ' px: filtrar la última estación no devuelve la tira al principio (' + x1 + ' → ' + x2.x + ')');
    que(await p.evaluate(() => document.querySelector('.tb-linea').classList.contains('bordes')), ancho + ' px: el borde desvanecido (pieza 10) avisa que hay más');
    que((await desborde(p)) <= 0, ancho + ' px: sin desborde horizontal de la página');
    que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
    await c.ctx.close();
  }
  const g = await entrar({ ancho: 1280, alto: 900 });
  const w = await g.p.evaluate(() => {
    const es = [...document.querySelectorAll('.tb-etapa')];
    return { tops: new Set(es.map(e => Math.round(e.getBoundingClientRect().top))).size, display: getComputedStyle(document.querySelector('.tb-linea')).display,
      tubos: es.slice(0, 4).every(e => getComputedStyle(e, '::after').content !== 'none') };
  });
  que(w.tops === 1 && w.display === 'grid' && w.tubos, '1280 px: cinco estaciones en una fila de rejilla, unidas por su tubo');
  await g.ctx.close();
}

/* ══ 9 · P29 · DESLIZAR UN RENGLÓN PARA AVANZARLO ═══════════════════════════ */
titulo('p29', 'P29 · DESLIZAR UN RENGLÓN DEL TABLERO');
if (activa('p29')) {
  const c = await entrar({ touch: true });
  const { p, errs } = c;
  const fila = cli => filaDe(p, cli);
  const id = c.h.armar2.id;
  que(await p.evaluate(() => !!localStorage.getItem('al3d_pista_tablero')), 'la primera vez en el aparato se enseñó la pista (se recuerda que ya se vio)');
  que((await fila('Gym Titanio').locator('.desliza-principal').count()) === 1, 'un renglón con «Ya se armó» lleva el lado de avanzar');
  que((await fila('Healthylicious').locator('.desliza-principal').count()) === 0, 'el que cruza el corte NO lo lleva (saca material)');
  que((await fila('Dental Sonrisa').locator('.desliza-principal').count()) === 0, '«Ya se instaló» tampoco (mueve dos cosas, sin Deshacer)');

  /* A la derecha: avanza, con su Deshacer en el botón visible. */
  const f = fila('Gym Titanio');
  await traer(f); await esp(p, 400);
  const r = await caja(p, '.tb-renglon:has([data-avanza="' + id + '"])');
  await dedo(c, pasos(r.x + 30, r.y + r.h / 2, r.x + r.w * 0.8, 14));
  await esp(p, 700);
  que(/Deshacer/.test(await p.locator('[data-avanza="' + id + '"]').textContent()), 'deslizar a la derecha pulsa su botón: el visible dice «Deshacer»');
  que((await etapaDe(p, id)) === 'cortado', 'y todavía NO escribió: el deslizamiento tiene la misma mecha que el botón');
  const cara = await p.evaluate(sel => document.querySelector(sel + ' .desliza-cara').style.transform, '.tb-renglon:has([data-avanza="' + id + '"])');
  que(cara === '' || cara === 'none', 'la cara del renglón regresó a su sitio (' + (cara || 'sin transform') + ')');
  await p.locator('[data-avanza="' + id + '"]').tap();
  await esp(p, 400);
  que(/Ya se armó/.test(await p.locator('[data-avanza="' + id + '"]').textContent()), 'tocar «Deshacer» lo deshace');
  /* Un segundo latigazo seguido sobre el renglón en mecha no escribe dos veces. */
  const enBitacora = () => p.evaluate(async idp => {
    const DB = await import('./js/datos/db.js'); const todo = await DB.listar('bitacora').catch(() => []);
    return todo.filter(b => b.entidad_id === idp && b.accion === 'etapa').length;
  }, id);
  const bit0 = await enBitacora();
  await dedo(c, pasos(r.x + 30, r.y + r.h / 2, r.x + r.w * 0.8, 14));
  await esp(p, 600);
  await dedo(c, pasos(r.x + 30, r.y + r.h / 2, r.x + r.w * 0.8, 14));
  await esp(p, 400);
  que(await esperarEtapa(p, id, 'armado'), 'dos latigazos seguidos escriben UNA sola vez: la etapa llegó a «armado»');
  await esp(p, 700);
  const bit = await enBitacora();
  que(bit === bit0 + 1, 'y en la bitácora entró UN solo renglón nuevo (' + bit0 + ' → ' + bit + '): deshacer no ensucia el libro');

  /* A la izquierda descubre «Abrir» y «Mover la fecha». */
  const f2 = 'Farmacia Guadalupe';
  await traer(fila(f2)); await esp(p, 400);
  const rr = await p.evaluate(n => { const e = [...document.querySelectorAll('.tb-renglon')].find(x => x.textContent.includes(n)); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, f2);
  await dedo(c, pasos(rr.x + rr.w - 30, rr.y + rr.h / 2, rr.x + 20, 14));
  await esp(p, 500);
  que(await fila(f2).evaluate(e => e.classList.contains('abierta')), 'deslizar a la izquierda abre el lado de las acciones');
  const acc = await fila(f2).locator('.desliza-acciones .desliza-acc').allTextContents();
  que(acc.join('|') === 'Abrir|Mover la fecha', 'con «Abrir» y «Mover la fecha» (' + acc.join('|') + ')');
  await fila(f2).locator('.desliza-acciones .desliza-acc', { hasText: 'Mover la fecha' }).tap();
  await esp(p, 1800);
  que((await p.evaluate(() => location.hash)) === '#/agenda', '«Mover la fecha» lleva al Calendario');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Los botones se quedan para quien no desliza (teclado, lector): están a la vista y al alcance del Tab. */
  const t = await entrar({});
  const vis = await t.p.evaluate(() => {
    const e = [...document.querySelectorAll('.tb-renglon')].find(x => x.textContent.includes('Gym Titanio'));
    const b = e.querySelector('.desliza-cara [data-avanza]');
    const ocultas = [...e.querySelectorAll('.desliza-principal, .desliza-acciones')].every(x => x.getAttribute('aria-hidden') === 'true');
    const fuera = [...e.querySelectorAll('.desliza-acc')].every(x => x.tabIndex === -1);
    return { b: !!b && b.getBoundingClientRect().height > 0, ocultas, fuera };
  });
  que(vis.b && vis.ocultas && vis.fuera, 'los botones del renglón siguen a la vista y lo que descubre el gesto no se duplica para el Tab ni el lector');
  await t.ctx.close();

  /* Con el ratón, en la computadora: arrastrar el renglón hacia la derecha también avanza (y deja el
     mismo Deshacer), y un clic normal sobre el renglón NO lo arrastra. */
  const d = await entrar({ ancho: 1280, alto: 900 });
  const idm = d.h.armar.id;
  await d.p.evaluate(id => document.querySelector('.tb-renglon:has([data-avanza="' + id + '"])').scrollIntoView({ block: 'center' }), idm);
  await esp(d.p, 400);
  const rm2 = await d.p.evaluate(id => { const r = document.querySelector('.tb-renglon:has([data-avanza="' + id + '"])').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, idm);
  await d.p.mouse.move(rm2.x + 40, rm2.y + rm2.h / 2);
  await d.p.mouse.down();
  for (let i = 1; i <= 14; i++) { await d.p.mouse.move(rm2.x + 40 + (rm2.w * 0.7 * i / 14), rm2.y + rm2.h / 2); await esp(d.p, 14); }
  await d.p.mouse.up();
  await esp(d.p, 700);
  que(await d.p.locator('[data-avanza="' + idm + '"]').evaluate(e => e.hasAttribute('data-deshacer')), 'con el ratón: arrastrar el renglón a la derecha lo avanza, con su Deshacer');
  que((await etapaDe(d.p, idm)) === 'cortado', 'y sin escribir todavía');
  que((await d.p.evaluate(() => location.hash)) !== '#/proyectos', 'el clic que sigue al arrastre no abre nada');
  await d.ctx.close();

  /* Sin permiso no hay gesto de avanzar: pagos no mueve la obra. */
  const pg = await abrir({ touch: true });
  await irA(pg.p, '#/hoy', 900);
  await sembrar(pg.p);
  /* Se siembra como dirección (pagos no gana proyectos) y se mira como pagos. */
  await pg.p.evaluate(() => { sessionStorage.setItem('__pf_rol', 'pagos'); localStorage.setItem('al3d_pf_rol', 'pagos'); });
  await irA(pg.p, '#/hoy', 1500);
  const nPrinc = await pg.p.locator('.tb-renglon .desliza-principal').count();
  const nFilas = await pg.p.locator('.tb-renglon').count();
  const rolVisto = await pg.p.evaluate(() => localStorage.getItem('al3d_pf_rol'));
  que(nPrinc === 0 && nFilas > 0, 'con el rol de pagos ningún renglón lleva el gesto de avanzar (' + nFilas + ' renglones, ' + nPrinc + ' con gesto, rol ' + rolVisto + ')');
  await pg.ctx.close();
}

/* ══ 10 · LAS MEDIDAS: 360 y 420 px × claro y oscuro × con y sin movimiento ═ */
titulo('medidas', 'EN TODAS LAS MEDIDAS · sin desborde, sin bucles, con contraste');
if (activa('medidas')) {
  for (const ancho of [360, 420]) for (const tema of ['claro', 'oscuro']) for (const rm of [false, true]) {
    const donde = ancho + ' px · ' + tema + ' · ' + (rm ? 'menos movimiento' : 'con movimiento');
    const c = await entrar({ ancho, tema, rm, touch: true, decidir: 1 });
    const { p, errs } = c;
    await esp(p, 1500);              // que termine la pista del primer renglón
    que((await desborde(p)) <= 0, donde + ': Tablero sin desborde horizontal');
    const inf = await infinitas(p);
    que(inf.length === 0, donde + ': Tablero sin animaciones en bucle en reposo' + (inf.length ? ' (' + inf.join(', ') + ')' : ''));
    const cs = await p.evaluate(() => [...document.querySelectorAll('#mod-tablero .pf-cuenta.va .pf-cuenta-t')].map(e => e.getBoundingClientRect().width));
    que(cs.length >= 3 && cs.every(w => w > 20), donde + ': las cuentas tocables caben y se leen');
    const k1 = await contraste(p, '#mod-tablero .pf-cuenta.va .pf-cuenta-t');
    que(k1 >= 4.5, donde + ': la etiqueta de una cuenta tocable pasa de 4,5:1 (' + (k1 && k1.toFixed(2)) + ')');

    /* El deslizador del corte, en reposo y ya abierto. */
    const b = filaDe(p, 'Healthylicious').locator('[data-avanza]');
    await traer(b); await b.tap(); await esp(p, 800);
    que((await desborde(p)) <= 0, donde + ': con la pregunta del corte abierta, sin desborde');
    const k2 = await contraste(p, '#pf-pide-txt');
    que(k2 >= 4.5, donde + ': el texto del deslizador pasa de 4,5:1 (' + (k2 && k2.toFixed(2)) + ')');
    que((await infinitas(p)).length === 0, donde + ': y el deslizador en reposo no se mueve solo');
    const rb = await caja(p, '#pf-pide-riel'), pb = await caja(p, '#pf-pide .pf-desliza-pulgar');
    await dedo(c, pasos(pb.x + pb.w / 2, pb.y + pb.h / 2, pb.x + rb.w, 16));
    await esp(p, 1200);
    const k3 = await contraste(p, '#pf-pide .pf-desliza-frase');
    que(k3 >= 4.5, donde + ': la píldora del resultado pasa de 4,5:1 (' + (k3 && k3.toFixed(2)) + ')');
    const k4 = await contraste(p, '#pf-pide .pf-desliza-ver');
    if (k4) que(k4 >= 4.5, donde + ': «Ver almacén» pasa de 4,5:1 (' + k4.toFixed(2) + ')');
    que((await desborde(p)) <= 0, donde + ': y con el resultado, sin desborde');
    await p.locator('#pf-pide .pf-pide-f .btn').tap(); await esp(p, 500);

    /* Qué atender con su modal de fechas. */
    await irA(p, '#/atender', 1500);
    que((await desborde(p)) <= 0, donde + ': «Qué atender» sin desborde');
    que((await infinitas(p)).length === 0, donde + ': «Qué atender» sin bucles en reposo');
    await p.locator('#mod-atender [data-acc]', { hasText: 'Se ganó' }).tap(); await esp(p, 800);
    que((await desborde(p)) <= 0, donde + ': con las fechas rápidas de «Se ganó», sin desborde');
    const k5 = await contraste(p, '#pf-pide .pf-rapida.on .pf-rapida-t');
    const k6 = await contraste(p, '#pf-pide .pf-rapida:not(.on) .pf-rapida-t');
    que(k5 >= 4.5 && k6 >= 4.5, donde + ': las fichas de fecha, la elegida y las demás, pasan de 4,5:1 (' + (k5 && k5.toFixed(2)) + ' y ' + (k6 && k6.toFixed(2)) + ')');
    que(errs.length === 0, donde + ': cero errores de página', donde + ': errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
    await c.ctx.close();
  }
}

await nav.close();
console.log(fallos ? '\n' + fallos + ' fallo(s) en Hoy y Tablero.' : '\nHoy y Tablero: las cuentas llevan a algo, el deshacer espera su mecha, el corte se desliza y nada se mueve solo.');
process.exit(fallos ? 1 : 0);
