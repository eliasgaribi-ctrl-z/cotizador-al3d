/* PROYECTOS: LA FICHA, LA ETAPA COMO PASOS, EL MODO CLIENTE, LA GARANTÍA Y EL TABLERO QUE SE ARRASTRA.
 *
 * Esta pantalla es la que se abre delante del cliente, en un teléfono de gama media, a las
 * siete de la tarde. Lo que defiende este archivo es exactamente eso, y lo defiende con las
 * tres manos que la usan —ratón, dedo y teclado—:
 *
 *   · P1  · los cinco confirm() del aviso de la hoja son la pregunta de la app, y «Quitar del
 *           tablero» solo se confirma manteniendo presionado (con el dedo, con la tecla y por
 *           la vía del lector de pantalla);
 *   · P2  · guardar una cuenta no tira el panel arriba ni pierde el foco, y el chip lo dice; si
 *           el guardado falla, el chip vuelve;
 *   · P7  · la etapa se lee como pasos —qué pasó, en qué va— con la de hoy a la vista, el botón
 *           dice lo que sigue y los pasos de adelante no se saltan tocándolos;
 *   · P8  · la tarjeta VIAJA: la pieza se llama con la tarjeta todavía en su columna de antes
 *           (lo que la primera versión no hacía) y, en la ficha, después de cerrarla;
 *   · P9  · una tarjeta se arrastra de columna con el ratón, con el dedo y con Alt+→/←; un toque
 *           corto sigue abriendo la ficha; pagos no levanta nada; Escape suelta;
 *   · P10 · la ficha del teléfono sube desde abajo y se baja con el dedo (la pieza 13);
 *   · P11 · la tarjeta de «sin decidir» da UN latido y se calla, y solo vuelve a latir si sube;
 *   · P12 + 31 · el modo cliente tapa la comisión y NO el total del proyecto, destapa SOLO el
 *           renglón que se sostiene, y se maneja con el dedo, con el ratón y con el teclado;
 *   · P18 · las cuentas no ruedan al ENTRAR a la pantalla y sí cuando algo cambia frente a ti;
 *   · P23 · la tira de etapas y el tablero del Fold dicen que hay más con su borde desvanecido;
 *   · P28 · en el teléfono las columnas son páginas que de verdad se deslizan (se mide el ancho
 *           del carrusel: una regla de plataforma.css las apilaba y las pruebas de «tiene la
 *           clase» no lo veían), sincronizadas con la tira y sin volver a la primera al repintar;
 *   · 53  · la ficha de un instalado dice cuántos días hábiles quedan para liquidar y hasta
 *           cuándo va cada garantía, con palabra además de color;
 *   y en todas las medidas: 360 y 420 px, claro y oscuro, con y sin movimiento reducido, sin
 *   errores de página, sin desborde horizontal, con contraste de 4.5:1 en lo nuevo y sin nada
 *   animándose en bucle en reposo.
 *
 * Uso:  PUERTO=8923 node pruebas/navegador/pf-proyectos.mjs
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const que = (ok, msg, alRevés) => (ok ? bien(msg) : mal(alRevés || msg));
const esp = (p, ms) => p.waitForTimeout(ms);
/* SOLO=p28,p9 corre solo esas secciones (para depurar una sin esperar a las demás). */
const SOLO = (process.env.SOLO || '').split(',').map(x => x.trim()).filter(Boolean);
const activa = id => !SOLO.length || SOLO.includes(id);
const titulo = (id, t) => { if (activa(id)) console.log('\n' + t); };

/* Dirección y con nombre: es el rol que ve el dinero, los estatus de la hoja y «No se dio», y
   sin nombre Ajustes pondría su presentación delante. */
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
      /* El rol de la sesión manda sobre el inicial: se siembra como Dirección (fabricación no puede
         instalar ni pagos ganar) y después `cambiarRol()` lo cambia para mirar. */
      localStorage.setItem('al3d_pf_rol', sessionStorage.getItem('__pf_rol') || r);
      localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
      localStorage.setItem('al3d_tema', t);
    } catch (_) {}
  }, [rol, tema]);
  const p = await ctx.newPage();
  const errs = [], dialogos = [];
  p.on('pageerror', e => errs.push(e.message));
  /* Un confirm() nativo es justo lo que P1 quita: si sale alguno, se anota y se descarta. */
  p.on('dialog', d => { dialogos.push(d.message()); d.dismiss().catch(() => {}); });
  return { ctx, p, errs, dialogos };
}

/* Los proyectos se crean por la CAPA DE DATOS, como en las demás pruebas de navegador: `ganar()`
   es lo que de verdad crea un proyecto, con su origen congelado y su material derivado. Cada uno
   trae su instalación (en el pasado o en el futuro según su etapa) salvo las tarjetas
   «importadas de la hoja», que son las que P1 quita. */
async function sembrar(p, copias = false) {
  return p.evaluate(async copias => {
    const Proy = await import('./js/datos/proyectos.js');
    const Agenda = await import('./js/datos/agenda.js');
    const DB = await import('./js/datos/db.js');
    const letras = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, altura: 40, n: 8 };
    const dia = n => { const d = new Date(Date.now() + n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    /* La instalación que hace que HOY sea el último día hábil para liquidar: existe solo si hoy es
       lunes a viernes (el vencimiento nunca cae en fin de semana). */
    const paraVencerHoy = () => { for (let n = 0; n >= -6; n--) if (Proy.masHabiles(dia(n), 2) === dia(0)) return dia(n); return null; };
    const filas = [
      ['ganado', 'COT-8801', 'Healthylicious', 'ganado', 17004, 7],
      ['ganado2', 'COT-8805', 'Panadería La Espiga', 'ganado', 12528, 9],
      ['diseno', 'COT-8802', 'La Perla', 'en_diseno', 24000, 8],
      ['cortado', 'COT-8803', 'Gym Titanio', 'cortado', 69400, 6],
      ['listo', 'COT-8806', 'Farmacia Guadalupe', 'listo', 13800, 3],
      ['instalado', 'COT-8804', 'Dental Sonrisa', 'instalado', 17004, -30],       // liquidación vencida
      ['instaladoHoy', 'COT-8807', 'Óptica Visión', 'instalado', 12000, 0],        // aún a tiempo
      ['grande', 'COT-8808', 'Taquería Los Primos', 'instalado', 69400, -30],      // la excepción de $60,000
      ['pagado', 'COT-8812', 'Barbería El Toro', 'instalado', 9300, -12],          // ya liquidado (la hoja dice saldo 0)
      ['venceHoy', 'COT-8813', 'Café Barrio', 'instalado', 6000, 'vence-hoy'],     // solo si hoy es día hábil
      ['copiaA', 'COT-8809', 'Copia importada A', 'ganado', 5000, null],
      ['copiaB', 'COT-8810', 'Copia importada B', 'ganado', 5000, null],
      ['copiaC', 'COT-8811', 'Copia importada C', 'ganado', 5000, null],
      ['sinFila', 'COT-8814', 'Venta sin fila', 'ganado', 5000, null],          // «Dejarla fuera de la hoja»
      ['repetida', 'COT-8815', 'Venta repetida', 'ganado', 5000, null],         // «Juntar» y «No es la misma venta»
    ];
    const hechos = {};
    for (const [clave, folio, cliente, etapa, neto, inst] of filas) {
      if ((clave.startsWith('copia') || clave === 'sinFila' || clave === 'repetida') && !copias) continue;     // solo P1 las quiere: llenan la columna de «Ganado»
      const r = await Proy.ganar({ folio, cliente, proy: cliente + ' — anuncio', ts: Date.now(),
        estado: 'autorizada', items: [letras], neto, itemsAuth: { 1: neto } }, { pct_comision: 10 });
      if (!r.ok) continue;
      const id = r.valor.id;
      if (etapa !== 'ganado') await Proy.avanzarEtapa(id, etapa);
      if (inst === 'vence-hoy') {
        const f = paraVencerHoy();
        if (!f) { await DB.borrar('proyectos', id); continue; }       // fin de semana: no hay tal día
        await Agenda.agendar(id, { fecha: f, hora: '10:00' });
      } else if (inst !== null) await Agenda.agendar(id, { fecha: dia(inst), hora: '10:00' });
      if (clave === 'pagado') { const f = await DB.obtener('proyectos', id); await DB.poner('proyectos', { ...f, pago_pendiente: 0 }); }
      if (clave === 'sinFila') {
        const fila = await DB.obtener('proyectos', id);
        await DB.poner('proyectos', { ...fila, hoja_perdida: { motivo: 'borrada', folio: 'V-098', desde: Date.now(), mensaje: '' } });
      }
      if (clave === 'repetida') {
        const fila = await DB.obtener('proyectos', id);
        const real = hechos.ganado;
        await DB.poner('proyectos', { ...fila, de_hoja: true, folio_hoja: 'V-077',
          duplicado_de: { id: real.id, nombre: 'Healthylicious', folio: 'COT-8801', folio_hoja: 'V-077', claves: ['identidad'], por: ['la fila solo coincide en el folio de la hoja'] } });
      }
      if (clave.startsWith('copia')) {
        /* La marca de «ya no está en la hoja» de una tarjeta importada: la que ofrece «Quitar». */
        const fila = await DB.obtener('proyectos', id);
        await DB.poner('proyectos', { ...fila, de_hoja: true, folio_hoja: 'V-0' + folio.slice(-2),
          hoja_perdida: { motivo: 'borrada', folio: 'V-0' + folio.slice(-2), desde: Date.now(), mensaje: '' } });
        /* Una tarjeta importada de la hoja no trae material calculado aquí: con él, `quitarDelTablero`
           se niega («si algo de este teléfono la nombra no se quita»). */
        for (const rq of await DB.listar('requerimientos')) if (rq.proyecto_id === id) await DB.borrar('requerimientos', rq.id);
      }
      hechos[clave] = { id, etapa, cliente };
    }
    return hechos;
  }, copias);
}

const irA = async (p, hash, espera = 1400) => {
  const destino = B + '/' + hash;
  if (p.url() === destino) await p.reload({ waitUntil: 'load' });
  else await p.goto(destino, { waitUntil: 'load' });
  await esp(p, espera);
};

/* Entrar a Proyectos con datos: el camino que hacen todas las secciones. */
async function entrar(o = {}) {
  const c = await abrir({ ...o, rol: 'direccion' });
  await irA(c.p, '#/hoy', 1000);
  c.h = await sembrar(c.p, !!o.copias);
  if (o.rol && o.rol !== 'direccion') {
    await c.p.evaluate(r => { sessionStorage.setItem('__pf_rol', r); localStorage.setItem('al3d_pf_rol', r); }, o.rol);
  }
  await irA(c.p, '#/proyectos', 1700);
  return c;
}

/* Lo que se comprueba en TODAS las medidas: sin desborde, sin errores y sin nada girando solo.
   El botón de «Cotizar con IA» es la única pieza que la regla del sistema deja moverse sola, y
   vive en el cotizador: en la plataforma la lista tiene que quedar vacía. */
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => { try { return a.effect.getComputedTiming().iterations === Infinity; } catch (_) { return false; } })
  .map(a => { const t = a.effect && a.effect.target; return (t && (t.id || t.className)) || a.animationName || '?'; }));
const desborde = p => p.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
const filtro = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? getComputedStyle(e).filter : 'no existe'; }, sel);
const centro = (p, sel) => p.$eval(sel, e => {
  /* Un toque fuera de la pantalla no llega a nadie: si el elemento está más abajo del pliegue, se trae. */
  let r = e.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) { e.scrollIntoView({ block: 'nearest' }); r = e.getBoundingClientRect(); }
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
/* El centro de lo que se ve de un elemento alto (la tira de páginas mide más que la pantalla). */
const centroVisible = (p, sel) => p.$eval(sel, e => {
  const r = e.getBoundingClientRect();
  const t = Math.max(r.top, 0), b = Math.min(r.bottom, innerHeight - 90);
  return { x: r.x + r.width / 2, y: (t + b) / 2 };
});
const abrirFicha = async (p, id) => {
  await p.evaluate(i => document.querySelector('[data-abrir="' + i + '"]').click(), id);
  await esp(p, 950);
};
const cerrarFicha = async p => {
  await p.evaluate(() => document.querySelector('[data-cerrar-ficha]').click());
  await esp(p, 700);
};
const columnaDe = (p, id) => p.evaluate(i => {
  const t = document.querySelector('[data-abrir="' + i + '"]');
  const c = t && t.closest('[data-col]');
  return c ? c.dataset.col : null;
}, id);
const fichaAbierta = p => p.$eval('#pf-ficha', e => e.classList.contains('show')).catch(() => false);
const pregunta = p => p.$eval('#pf-confirma', e => e.classList.contains('show')).catch(() => false);
const avisos = p => p.evaluate(() => (window.Piezas && window.Piezas.aviso ? window.Piezas.aviso.vivos() : []).map(a => a.msg));

/* El dedo de verdad, por el protocolo de Chrome: `page.tap()` solo sabe tocar, y aquí hace falta
   mantener, arrastrar y deslizar. */
async function dedo(p) {
  const cdp = await p.context().newCDPSession(p);
  const punto = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: (type === 'touchEnd' || type === 'touchCancel') ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
  return {
    tocar: async (x, y) => { await punto('touchStart', x, y); await esp(p, 60); await punto('touchEnd'); },
    /* Mantener `ms`, ir hasta (x1,y1) en pasos y soltar. */
    arrastrar: async (x0, y0, x1, y1, { ms = 400, pasos = 14, suelta = true, pausa = 16 } = {}) => {
      await punto('touchStart', x0, y0);
      await esp(p, ms);
      for (let i = 1; i <= pasos; i++) { await punto('touchMove', x0 + (x1 - x0) * i / pasos, y0 + (y1 - y0) * i / pasos); await esp(p, pausa); }
      if (suelta) await punto('touchEnd');
    },
    mover: (x, y) => punto('touchMove', x, y),
    soltar: () => punto('touchEnd'),
    bajar: (x, y) => punto('touchStart', x, y),
    /* Un deslizón: sin la pausa de los 250 ms, así que es de la página y no de un arrastre. */
    deslizar: async (x, y, dx, dy, pasos = 14) => {
      await punto('touchStart', x, y);
      for (let i = 1; i <= pasos; i++) { await punto('touchMove', x + dx * i / pasos, y + dy * i / pasos); await esp(p, 16); }
      await punto('touchEnd');
    },
  };
}

/* Contraste 4.5:1 de un texto contra lo que de verdad hay debajo: se sube por los ancestros
   mezclando los fondos con transparencia hasta llegar a uno opaco. */
const contraste = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s); if (!el) return null;
  const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const mezcla = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  let fondo = { r: 255, g: 255, b: 255, a: 1 };
  const cadena = []; for (let n = el; n; n = n.parentElement) cadena.push(n);
  for (const n of cadena.reverse()) { const bg = parse(getComputedStyle(n).backgroundColor); if (bg.a > 0) fondo = mezcla(bg, fondo); }
  const t = mezcla(parse(getComputedStyle(el).color), fondo);
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const a = lum(t), b = lum(fondo);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}, sel);

// ══ 1 · La pantalla aguanta las medidas ═══════════════════════════════════
titulo('matriz', 'LA PANTALLA AGUANTA LAS OCHO COMBINACIONES (360 y 420 · claro y oscuro · con y sin movimiento)');
for (const ancho of activa('matriz') ? [360, 420] : []) {
  for (const tema of ['claro', 'oscuro']) {
    for (const rm of [false, true]) {
      const c = await entrar({ ancho, tema, rm, touch: ancho === 420 });
      const { p, errs, h } = c;
      const donde = `${ancho} px · ${tema}` + (rm ? ' · menos movimiento' : '');
      let dx = await desborde(p);
      que(dx <= 1, donde + ': sin desborde horizontal', donde + ': desborda ' + dx + ' px');
      let inf = await infinitas(p);
      que(inf.length === 0, donde + ': nada se anima en bucle en reposo', donde + ': animación infinita en ' + inf.join(', '));
      const ancha = await p.$eval('.pj-lista-movil', e => e.scrollWidth > e.clientWidth + 40).catch(() => false);
      que(ancha, donde + ': las columnas son páginas de verdad (la tira mide más de lo que se ve)');

      for (const [sel, nombre] of [['.pj-pag-h .pj-pag-t', 'el título de la página'], ['.pj-pag-h .pj-col-n', 'la cuenta de la página'],
        ['[data-cliente]', 'el rótulo del interruptor'], ['#pj-cuentas .pf-cuenta', 'las cuentas de arriba']]) {
        const r = await contraste(p, sel);
        que(r === null || r >= 4.5, donde + ': ' + nombre + ' se lee (' + (r ? r.toFixed(1) : '—') + ':1)', donde + ': ' + nombre + ' no llega a 4.5:1 (' + (r && r.toFixed(2)) + ')');
      }
      /* La ficha de un instalado, que es donde vive casi todo lo nuevo. */
      await abrirFicha(p, h.instalado.id);
      dx = await desborde(p);
      que(dx <= 1, donde + ': la ficha tampoco desborda', donde + ': la ficha desborda ' + dx + ' px');
      inf = await infinitas(p);
      que(inf.length === 0, donde + ': ni la ficha se anima en bucle', donde + ': la ficha anima en bucle ' + inf.join(', '));
      for (const [sel, nombre] of [['.pj-liq b', 'el título de la liquidación'], ['.pj-liq small', 'su detalle'],
        ['.pj-gar-t span', 'el nombre de la garantía'], ['.pj-gar-t span:last-child', 'lo consumido'], ['.pj-gar-h', 'la fecha de la garantía'],
        ['#pj-etapas .riel-t', 'el nombre de la etapa']]) {
        const r = await contraste(p, '#pf-ficha ' + sel);
        que(r === null || r >= 4.5, donde + ': ' + nombre + ' se lee (' + (r ? r.toFixed(1) : '—') + ':1)', donde + ': ' + nombre + ' no llega a 4.5:1 (' + (r && r.toFixed(2)) + ')');
      }
      /* Con el modo cliente encendido la ficha crece en un sitio y se tapa en otro: tampoco desborda. */
      await cerrarFicha(p);
      await p.click('[data-cliente]');
      await esp(p, 300);
      await abrirFicha(p, h.instalado.id);
      dx = await desborde(p);
      que(dx <= 1, donde + ': con el modo cliente encendido tampoco desborda', donde + ': desborda ' + dx + ' px con el modo cliente');
      const r = await contraste(p, '#pf-ficha .pf-tapado');
      que(r === null || r >= 4.5, donde + ': el aviso de «tapado» se lee (' + (r ? r.toFixed(1) : '—') + ':1)');
      que(errs.length === 0, donde + ': cero errores de página', donde + ': errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
      await c.ctx.close();
    }
  }
}

// ══ 2 · P28 · las columnas, páginas de verdad ═════════════════════════════
titulo('p28', 'P28 · EN EL TELÉFONO, LAS COLUMNAS SON PÁGINAS QUE SE DESLIZAN');
if (activa('p28')) {
  const c = await entrar({ ancho: 360, touch: true });
  const { p, errs, h } = c;
  const d = await dedo(p);
  const est = () => p.evaluate(() => {
    const t = document.querySelector('.pj-lista-movil');
    return { sl: Math.round(t.scrollLeft), ancho: t.clientWidth, total: t.scrollWidth,
      on: (document.querySelector('#pj-filtros .on') || {}).dataset?.etapa || null };
  });
  const pags = await p.$$eval('.pj-pag', els => els.map(e => e.dataset.col));
  que(pags.length >= 4, 'hay una página por etapa con proyectos: ' + pags.join(', '));
  const e0 = await est();
  que(e0.total > e0.ancho * 3, 'la tira mide ' + e0.total + ' px contra ' + e0.ancho + ' visibles: son páginas lado a lado, no una columna larga');
  que((await p.$$('[data-etapa="todas"]')).length === 0, '«Todas» no sale en el teléfono: las páginas ya son todas');
  que(e0.on === 'ganado', 'arranca en la primera página, con su chip encendido');

  /* Un toque en un chip pasa de página, sin rehacer la tira. */
  await p.$eval('.pj-lista-movil', e => { e.dataset.sello = 'x'; });
  await p.tap('#pj-filtros [data-etapa="cortado"]');
  await esp(p, 1000);
  const e1 = await est();
  que(e1.sl > 300 && e1.on === 'cortado', 'con un toque al chip «Cortado» la tira se fue a esa página (' + e1.sl + ' px) y el chip la sigue');
  que(await p.$eval('.pj-lista-movil', e => e.dataset.sello) === 'x', 'pasar de página no rehace la lista: es la misma tira');
  que(await p.$eval('#pj-filtros [data-etapa="cortado"]', e => e.getAttribute('aria-pressed')) === 'true', 'y el chip queda dicho a la voz (aria-pressed)');

  /* El dedo desliza: el chip sigue a la página, y nadie repinta debajo de él. */
  const cen = await centroVisible(p, '.pj-lista-movil');
  await d.deslizar(cen.x + 110, cen.y, -220, 0);
  await esp(p, 900);
  const e2 = await est();
  que(e2.sl > e1.sl && e2.on !== 'cortado', 'deslizar con el dedo pasa a la página siguiente y la tira de arriba lo sigue (' + e2.on + ')');
  await d.deslizar(cen.x - 110, cen.y, 220, 0);
  await esp(p, 900);
  const e3 = await est();
  que(e3.on === 'cortado', 'y deslizar hacia atrás la regresa (' + e3.on + ')');

  /* Teclado. */
  await p.evaluate(() => document.querySelector('.pj-lista-movil').focus());
  await p.keyboard.press('ArrowRight');
  await esp(p, 800);
  const e4 = await est();
  que(e4.on && e4.on !== 'cortado', 'con el teclado también se pasa de página, y la tira lo sigue (' + e4.on + ')');
  await p.keyboard.press('Home');
  await esp(p, 800);
  que((await est()).on === 'ganado', 'Inicio vuelve a la primera');

  /* Lo que rompió la primera versión: al repintar la lista (guardar algo desde la ficha, bajar un
     cambio de la sincronización) la tira volvía a la primera página delante de quien la miraba. */
  await p.tap('#pj-filtros [data-etapa="listo"]');
  await esp(p, 1000);
  const antes = await est();
  await abrirFicha(p, h.listo.id);
  await p.evaluate(() => document.querySelector('#pf-ficha [data-cuenta]').click());
  await esp(p, 1200);
  await cerrarFicha(p);
  const despues = await est();
  que(antes.on === 'listo' && despues.on === 'listo' && Math.abs(despues.sl - antes.sl) < 4,
    'tras guardar desde la ficha (que repinta la lista) sigue en «Listo», sin volver a la primera',
    'la lista volvió a otra página al repintar: antes ' + JSON.stringify(antes) + ' · después ' + JSON.stringify(despues));

  /* Buscar: las páginas se quedan, y una sin coincidencias lo dice. */
  await p.fill('#pj-q', 'Gym');
  await esp(p, 900);
  const vacias = await p.$$eval('.pj-col-vacia', els => els.map(e => e.textContent.trim()));
  que((await p.$$('.pj-pag')).length >= 4 && vacias.some(t => /búsqueda/i.test(t)),
    'con una búsqueda escrita las páginas se quedan, y las que no tienen coincidencias lo dicen');
  await p.fill('#pj-q', '');
  await esp(p, 600);

  /* Cruzar los 760 px (un Fold que se abre) rehace el marcado y los chips. */
  await p.setViewportSize({ width: 900, height: 780 });
  await esp(p, 900);
  que((await p.$('.pj-tablero')) && (await p.$$('.pj-pag')).length === 0, 'al abrirse a 900 px hay tablero y ya no hay páginas');
  await p.setViewportSize({ width: 360, height: 780 });
  await esp(p, 900);
  que((await p.$$('.pj-pag')).length >= 4 && (await p.$$('[data-etapa="todas"]')).length === 0,
    'y al cerrarse vuelven las páginas, sin el chip «Todas» que el tablero había dejado');

  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

// ══ 3 · P23 · el borde que dice que hay más ═══════════════════════════════
titulo('p23', 'P23 · LA TIRA DE ETAPAS Y EL TABLERO DEL FOLD DICEN QUE HAY MÁS');
if (activa('p23')) {
  const c = await entrar({ ancho: 360, touch: true });
  const { p, errs } = c;
  const tira = await p.$eval('#pj-filtros .tipo-seg', e => ({ clases: e.className, sobra: e.scrollWidth - e.clientWidth, mascara: getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage }));
  que(/\bbordes\b/.test(tira.clases) && tira.sobra > 20, 'la tira de etapas del teléfono lleva la pieza de bordes y tiene más de lo que muestra (' + tira.sobra + ' px)');
  que(/hay-despues/.test(tira.clases) && !/hay-antes/.test(tira.clases) && tira.mascara && tira.mascara !== 'none',
    'al principio solo se desvanece el lado derecho (tiene máscara: ' + tira.clases.replace(/.*(bordes[^"]*)/, '$1') + ')');
  await p.tap('#pj-filtros [data-etapa="listo"]');
  await esp(p, 1100);
  const fin = await p.$eval('#pj-filtros .tipo-seg', e => e.className);
  que(/hay-antes/.test(fin), 'al llevar el chip encendido a la vista el borde de la izquierda aparece (' + fin + ')');
  const visible = await p.evaluate(() => {
    const on = document.querySelector('#pj-filtros .on'), t = document.querySelector('#pj-filtros .tipo-seg');
    const a = on.getBoundingClientRect(), b = t.getBoundingClientRect();
    return a.left >= b.left && a.right <= b.right + 1;
  });
  que(visible, 'y el chip encendido queda entero a la vista, sin quedar bajo el borde desvanecido');
  await c.ctx.close();

  /* El Fold abierto: 880 px, cinco columnas de 200 que no caben. */
  const f = await entrar({ ancho: 880, alto: 800, touch: true });
  const tab = await f.p.$eval('.pj-tablero', e => ({ clases: e.className, sobra: e.scrollWidth - e.clientWidth }));
  que(/\bbordes\b/.test(tab.clases) && tab.sobra > 20 && /hay-despues/.test(tab.clases),
    'el tablero del Fold abierto se corta y dice que hay más a la derecha (' + tab.sobra + ' px de sobra)');
  que(f.errs.length === 0 && errs.length === 0, 'cero errores de página');
  await f.ctx.close();
}

// ══ 4 · P7 · la etapa como pasos, y P1 · las preguntas de la hoja ════════
titulo('p7', 'P7 · LA ETAPA COMO PASOS');
if (activa('p7')) {
  const c = await entrar({ ancho: 360, touch: true });
  const { p, errs, h } = c;
  await abrirFicha(p, h.diseno.id);
  que(!!(await p.$('#pj-etapas')), 'la etapa ya no son siete casillas: es un riel de pasos');
  const estados = await p.$$eval('#pj-etapas .riel-paso', els => els.map(e => e.dataset.estado));
  que(estados[0] === 'hecho' && estados[1] === 'actual' && estados.slice(2).every(e => e === 'pendiente'),
    'lo hecho lleva palomita, la de hoy va encendida y lo demás espera: ' + estados.join(' · '));
  que(await p.$eval('#pj-etapas [aria-current="step"]', e => e.dataset.clave) === 'en_diseno', 'la actual se anuncia con aria-current="step"');
  que((await p.$eval('.pj-sigue .btn', e => e.textContent.trim())) === 'Ya se cortó', 'el botón dice lo que sigue, en pasado: «Ya se cortó»');

  /* La de hoy tiene que estar a la vista SIN mover la ficha: en «Instalado», detrás de cuatro
     palomitas, era lo primero que la tira escondía. */
  await cerrarFicha(p);
  await abrirFicha(p, h.instalado.id);
  const visible = await p.evaluate(() => {
    const ol = document.querySelector('#pj-etapas'), a = ol.querySelector('[aria-current="step"]');
    const r = a.getBoundingClientRect(), o = ol.getBoundingClientRect();
    return { dentro: r.left >= o.left - 1 && r.right <= o.right + 1, y: document.querySelector('#pf-ficha .pf-panel-b').scrollTop };
  });
  que(visible.dentro, 'con la etapa de hoy lejos («Instalado», la sexta) la tira se corre y la deja a la vista');
  que(visible.y < 5, 'y sin mover la ficha de arriba (' + visible.y + ' px de scroll)');
  await cerrarFicha(p);

  /* Tocar un paso de adelante NO lo salta. */
  await abrirFicha(p, h.diseno.id);
  await p.evaluate(() => document.querySelector('#pj-etapas [data-clave="armado"]').scrollIntoView({ block: 'center', inline: 'center' }));
  await p.tap('#pj-etapas [data-clave="listo"] .riel-boton');
  await esp(p, 500);
  que((await columnaDe(p, h.diseno.id)) === 'en_diseno' && !(await pregunta(p)) &&
      (await avisos(p)).some(t => /todavía no toca/i.test(t)),
    'tocar «Listo» estando en «En diseño» no salta etapas: dice «Ese paso todavía no toca. Sigue: Ya se cortó»');
  /* Tocar la de hoy no hace nada. */
  await p.tap('#pj-etapas [data-clave="en_diseno"] .riel-boton');
  await esp(p, 400);
  que(!(await pregunta(p)), 'y tocar la etapa de hoy no pregunta ni escribe nada');

  /* El botón de lo que sigue: cruzar «Cortado» pregunta (el Tablero ya preguntaba), y se puede decir que no. */
  await p.tap('.pj-sigue .btn');
  await esp(p, 500);
  que(await pregunta(p), 'el botón «Ya se cortó» pregunta antes: saca material del almacén, y el Tablero ya preguntaba');
  await p.tap('#pf-confirma-no');
  await esp(p, 500);
  que((await p.$eval('#pj-etapas [aria-current="step"]', e => e.dataset.clave)) === 'en_diseno', 'diciendo «Todavía no» la etapa no se movió');
  await p.tap('.pj-sigue .btn');
  await esp(p, 500);
  await p.tap('#pf-confirma-si');
  await esp(p, 1300);
  que((await p.$eval('#pj-etapas [aria-current="step"]', e => e.dataset.clave)) === 'cortado', 'diciendo «Sí, ya se cortó» el riel se rehace con «Cortado» encendido');
  que((await p.$eval('.pj-sigue .btn', e => e.textContent.trim())) === 'Ya se armó', 'y el botón ya dice lo que sigue: «Ya se armó»');

  /* Regresar: tocar un paso de atrás, con la pregunta de siempre. */
  await p.tap('#pj-etapas [data-clave="ganado"] .riel-boton');
  await esp(p, 500);
  que(await pregunta(p), 'tocar un paso de atrás pregunta antes de regresar la etapa');
  await p.tap('#pf-confirma-no');
  await esp(p, 500);
  que((await p.$eval('#pj-etapas [aria-current="step"]', e => e.dataset.clave)) === 'cortado', 'y diciendo que no, la etapa se queda');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

titulo('p1', 'P1 · LAS PREGUNTAS DE LA HOJA SON LAS DE LA APP, Y «QUITAR» SE MANTIENE PRESIONADO');
if (activa('p1')) {
  const c = await entrar({ ancho: 360, touch: true, copias: true });
  const { p, errs, dialogos, h } = c;
  const ficha = async id => { await abrirFicha(p, id); };

  await ficha(h.copiaA.id);
  await p.tap('#pf-ficha [data-hoja-dejar]');
  await esp(p, 600);
  const t1 = await p.$eval('#pf-confirma-t', e => e.textContent).catch(() => '');
  que(await pregunta(p) && /Dejar/.test(t1), '«Dejarla» abre la pregunta de la app, con su título: «' + t1.slice(0, 50) + '…»');
  que(!(await p.$('#pf-confirma-si.mantener')), 'y ésa se confirma con un toque normal: solo «Quitar» pide mantener presionado');
  await p.tap('#pf-confirma-no');
  await esp(p, 500);

  await p.tap('#pf-ficha [data-hoja-quitar]');
  await esp(p, 700);
  que(await pregunta(p) && !!(await p.$('#pf-confirma-si.mantener')), '«Quitar del tablero» abre la pregunta con el botón de mantener presionado');
  que((await p.$eval('#pf-confirma-si', e => e.classList.contains('btn-dgr'))), 'y en rojo: es lo único de esta pantalla que borra algo del teléfono');
  /* Un toque corto NO confirma: dice cómo. */
  const btn = await centro(p, '#pf-confirma-si');
  const d = await dedo(p);
  await d.tocar(btn.x, btn.y);
  await esp(p, 500);
  que(await pregunta(p), 'un toque corto no confirma');
  que(/mantén presionado/i.test(await p.$eval('#pf-confirma-si', e => e.textContent)), 'y le dice al dedo qué hacer («Mantén presionado para quitarla»)');
  /* Soltar antes de tiempo tampoco. */
  await d.bajar(btn.x, btn.y); await esp(p, 600); await d.soltar();
  await esp(p, 400);
  que(await pregunta(p), 'soltar a la mitad no confirma (regresa el relleno)');
  /* Mantener 1.2 s sí. */
  await d.bajar(btn.x, btn.y); await esp(p, 1550); await d.soltar();
  await esp(p, 1500);
  que(!(await pregunta(p)), 'mantener presionado con el dedo lo confirma');
  const quitada = await p.evaluate(async id => { const DB = await import('./js/datos/db.js'); return !(await DB.obtener('proyectos', id)); }, h.copiaA.id);
  que(quitada, 'y la tarjeta se quitó de este teléfono');
  que(!(await p.$('#pf-confirma-si.mantener')), 'la pieza de mantener se soltó del botón: la siguiente pregunta de la app queda intacta');

  /* Con el teclado: Enter sostenido. */
  await irA(p, '#/proyectos', 1500);
  await ficha(h.copiaB.id);
  await p.click('#pf-ficha [data-hoja-quitar]');
  await esp(p, 700);
  await p.focus('#pf-confirma-si');
  await p.keyboard.down('Enter');
  await esp(p, 500);
  que(await pregunta(p), 'con el teclado, Enter apenas apretado no confirma');
  await esp(p, 1200);
  await p.keyboard.up('Enter');
  await esp(p, 1300);
  que(!(await pregunta(p)), 'y sostenido 1.2 s sí: la alternativa de teclado que pide la regla 10');

  /* Sin poder sostener nada (lector de pantalla, voz): la primera activación pide «otra vez». */
  await irA(p, '#/proyectos', 1500);
  await ficha(h.copiaC.id);
  await p.click('#pf-ficha [data-hoja-quitar]');
  await esp(p, 700);
  await p.evaluate(() => document.getElementById('pf-confirma-si').click());
  await esp(p, 400);
  que(await pregunta(p), 'sin poder sostener (clic sin coordenadas) la primera activación no confirma…');
  await p.evaluate(() => document.getElementById('pf-confirma-si').click());
  await esp(p, 1300);
  que(!(await pregunta(p)), '…y la segunda, dentro de 5 s, sí');
  /* Las otras tres preguntas: «fuera», «juntar» y «no es la misma venta». */
  await irA(p, '#/proyectos', 1500);
  await ficha(h.sinFila.id);
  await p.click('#pf-ficha [data-hoja-fuera]');
  await esp(p, 600);
  let cuerpo = await p.$eval('#pf-confirma-d', e => e.textContent).catch(() => '');
  que(await pregunta(p) && /Qué pasa:/.test(cuerpo) && /Qué no se toca:/.test(cuerpo) &&
      !(await p.$eval('#pf-confirma-si', e => e.classList.contains('btn-dgr'))),
    '«Dejarla fuera de la hoja»: pregunta de la app, con «Qué pasa» y «Qué no se toca», y sin rojo (no borra nada)');
  await p.click('#pf-confirma-no'); await esp(p, 500);
  await cerrarFicha(p);
  await ficha(h.repetida.id);
  await p.click('#pf-ficha [data-hoja-juntar]');
  await esp(p, 600);
  cuerpo = await p.$eval('#pf-confirma-d', e => e.textContent).catch(() => '');
  que(await pregunta(p) && /Qué pasa:/.test(cuerpo) && /Qué no se toca:/.test(cuerpo) &&
      (await p.$eval('#pf-confirma-si', e => e.classList.contains('btn-dgr'))) && !(await p.$('#pf-confirma-si.mantener')),
    '«Juntar»: pregunta de la app en rojo (quita la copia), con un toque normal');
  await p.click('#pf-confirma-no'); await esp(p, 500);
  await p.click('#pf-ficha [data-hoja-noesla]');
  await esp(p, 600);
  que(await pregunta(p) && /dos ventas distintas/.test(await p.$eval('#pf-confirma-t', e => e.textContent)), '«No es la misma venta»: también es la pregunta de la app');
  await p.click('#pf-confirma-no'); await esp(p, 500);
  que(dialogos.length === 0, 'ningún confirm() nativo salió en todo esto', 'salió un confirm() nativo: ' + dialogos.join(' | '));
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

// ══ 5 · P2 · guardar en su sitio ══════════════════════════════════════════
titulo('p2', 'P2 · GUARDAR UNA CUENTA O UN ESTATUS NO TIRA LA FICHA AL PRINCIPIO');
if (activa('p2')) {
  const c = await entrar({ ancho: 360, touch: true });
  const { p, errs, h } = c;
  await abrirFicha(p, h.diseno.id);
  await p.evaluate(() => { const b = document.querySelector('#pf-ficha .pf-panel-b'); b.scrollTop = b.scrollHeight; });
  await esp(p, 250);
  const y0 = await p.$eval('#pf-ficha .pf-panel-b', e => e.scrollTop);
  que(y0 > 40, 'con la ficha bajada (' + y0 + ' px) se toca una cuenta de cobro…');
  /* Con el dedo: el chip es el de la ficha (los botones del menú de cuenta del encabezado
     también traen `data-cuenta`, y el primero del documento no es el nuestro). */
  const sel = '#pf-ficha .chips [data-cuenta]';
  await p.locator(sel).first().tap();
  await esp(p, 1300);
  const y1 = await p.$eval('#pf-ficha .pf-panel-b', e => e.scrollTop);
  que(Math.abs(y1 - y0) <= 4, '…y el panel se queda donde estaba (antes volvía arriba del todo)', 'el panel saltó de ' + y0 + ' a ' + y1);
  que(await p.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-cuenta') && document.activeElement.closest('#pf-ficha') !== null),
    'el foco sigue en el chip que se tocó (antes caía al <body>)');
  const m = await p.evaluate(() => {
    const b = document.querySelector('#pf-ficha .chips [data-cuenta].on');
    const pal = b && b.querySelector('.palomita');
    return b ? { aria: b.getAttribute('aria-pressed'), palomita: !!pal, dibuja: !!(pal && /dibuja/.test(pal.getAttribute('class') || '')) } : null;
  });
  que(m && m.aria === 'true' && m.palomita && m.dibuja, 'el chip queda encendido, dicho a la voz y con su palomita dibujándose', 'el chip no quedó marcado: ' + JSON.stringify(m));
  const espejo = await p.$eval('#pf-ficha [data-marca="cuenta"] dd', e => e.textContent.trim());
  que(espejo && espejo !== 'Sin capturar', 'y el renglón espejo de arriba se actualiza en su sitio: «' + espejo + '»');
  /* Otro chip: la palomita se muda, no se acumula. */
  await p.locator(sel).nth(1).tap();
  await esp(p, 1100);
  que((await p.$$eval('#pf-ficha .chips [data-cuenta] .palomita', e => e.length)) === 5 &&
      (await p.$$eval('#pf-ficha .chips [data-cuenta].on', e => e.length)) === 1, 'al elegir otra, queda una sola encendida');

  /* Un estatus: mismo trato. */
  await p.evaluate(() => { const b = document.querySelector('#pf-ficha .pf-panel-b'); b.scrollTop = b.scrollHeight; });
  await esp(p, 250);
  const ye = await p.$eval('#pf-ficha .pf-panel-b', e => e.scrollTop);
  await p.locator('#pf-ficha [data-estatus]').nth(1).tap();
  await esp(p, 1200);
  const yf = await p.$eval('#pf-ficha .pf-panel-b', e => e.scrollTop);
  que(Math.abs(yf - ye) <= 4 && (await p.$$eval('#pf-ficha [data-estatus].on', e => e.length)) === 1,
    'un estatus de la hoja se guarda igual: sin volver arriba y con uno solo encendido');
  que((await p.$eval('#pf-ficha [data-marca="estatus"] dd', e => e.textContent.trim())) !== 'Sin capturar', 'y su espejo de arriba también');

  /* Si el guardado FALLA, el chip vuelve a donde estaba. Se rompe borrando el proyecto por debajo. */
  const antes = await p.$eval('#pf-ficha .chips [data-cuenta].on', e => e.dataset.cuenta);
  await p.evaluate(async id => { const DB = await import('./js/datos/db.js'); await DB.borrar('proyectos', id); }, h.diseno.id);
  await p.locator(sel).nth(3).tap();
  await esp(p, 1200);
  const despues = await p.$eval('#pf-ficha .chips [data-cuenta].on', e => e.dataset.cuenta).catch(() => null);
  que(despues === antes, 'si el guardado falla, el chip regresa a «' + antes + '» en vez de mentir con otro encendido', 'tras el fallo el chip quedó en «' + despues + '»');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

// ══ 6 · Función 53 · garantía y liquidación ═══════════════════════════════
titulo('f53', 'FUNCIÓN 53 · LA CUENTA REGRESIVA DEL COBRO Y LAS DOS GARANTÍAS');
for (const rm of activa('f53') ? [false, true] : []) {
  const c = await entrar({ ancho: 360, rm, tema: rm ? 'oscuro' : 'claro' });
  const { p, errs, h } = c;
  const donde = rm ? 'con menos movimiento y de noche' : 'de día';

  /* Cada tono de la cuenta regresiva, con su palabra: el color nunca va solo, y aun así tiene que
     leerse (4.5:1) en los dos temas. */
  const tonoSeLee = async etiqueta => {
    for (const sel of ['#pf-ficha .pj-liq b', '#pf-ficha .pj-liq small']) {
      const r = await contraste(p, sel);
      que(r !== null && r >= 4.5, donde + ': el tono «' + etiqueta + '» se lee (' + (r ? r.toFixed(1) : '—') + ':1 en ' + sel.split(' ').pop() + ')');
    }
  };
  await abrirFicha(p, h.instalado.id);
  const l = await p.$eval('#pf-ficha .pj-liq', e => ({ tono: e.dataset.tono, txt: e.textContent.replace(/\s+/g, ' ').trim(), rol: e.getAttribute('role') }));
  que(l.tono === 'mal' && /vencida hace \d+ días? hábiles?/i.test(l.txt), donde + ': un instalado de hace 30 días dice «vencida hace N días hábiles», en rojo: «' + l.txt.slice(0, 55) + '…»', donde + ': ' + JSON.stringify(l));
  que(/\$/.test(l.txt), donde + ': y dice cuánto saldo falta por cobrar');
  await tonoSeLee('vencida');
  que(l.rol === 'status' && (await p.$('#pf-ficha .pj-liq .marca-estado')), donde + ': lleva el glifo de estado, que acompaña a la palabra y no la sustituye');
  const gars = await p.$$eval('#pf-ficha .pj-gar-f', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  que(gars.length === 2 && /^Material eléctrico · 1 año/.test(gars[0]) && /^Colorimetría · 2 años/.test(gars[1]),
    donde + ': 1 año de material eléctrico y 2 de colorimetría, con ese nombre');
  que(/consumido/.test(gars[0]) && /quedan \d+ días|Venció/.test(gars[0]) && /Hasta el/.test(gars[0]), donde + ': cada una dice cuánto va, cuánto queda y hasta cuándo: «' + gars[0].slice(0, 70) + '…»');
  const barra = await p.evaluate(() => {
    const m = document.querySelector('#pf-ficha .pj-gar .medidor > .medidor-lleno');
    if (!m) return null;
    const cs = getComputedStyle(m);
    return { tr: cs.transitionDuration, an: cs.animationName, ancho: m.getBoundingClientRect().width };
  });
  que(barra && /^0s/.test(barra.tr) && barra.an === 'none' && barra.ancho > 1, donde + ': el medidor de garantía está quieto y tiene lleno: sin transición ni animación');
  const inf = await infinitas(p);
  que(inf.length === 0, donde + ': nada gira en la ficha de un instalado');
  await cerrarFicha(p);

  /* A tiempo: instalado hoy. */
  await abrirFicha(p, h.instaladoHoy.id);
  const a = await p.$eval('#pf-ficha .pj-liq', e => ({ tono: e.dataset.tono, txt: e.textContent.replace(/\s+/g, ' ').trim() }));
  await tonoSeLee('a tiempo');
  que(a.tono === 'a' && /vence en \d+ días? hábiles?/i.test(a.txt), donde + ': uno instalado hoy dice «vence en N días hábiles» (' + a.txt.slice(0, 50) + '…)', donde + ': ' + JSON.stringify(a));
  await cerrarFicha(p);

  /* Ya liquidado (la fórmula de la hoja dice saldo 0): en verde, sin cuenta. */
  await abrirFicha(p, h.pagado.id);
  const o = await p.$eval('#pf-ficha .pj-liq', e => ({ tono: e.dataset.tono, txt: e.textContent.replace(/\s+/g, ' ').trim() }));
  await tonoSeLee('liquidado');
  que(o.tono === 'ok' && /liquidado/i.test(o.txt), donde + ': con saldo 0 en la hoja dice «Ya está liquidado», en verde (' + o.txt.slice(0, 50) + '…)', donde + ': ' + JSON.stringify(o));
  await cerrarFicha(p);

  /* El último día hábil: «vence hoy», en ámbar. Solo existe si hoy es día hábil. */
  if (h.venceHoy) {
    await abrirFicha(p, h.venceHoy.id);
    const v = await p.$eval('#pf-ficha .pj-liq', e => ({ tono: e.dataset.tono, txt: e.textContent.replace(/\s+/g, ' ').trim() }));
    await tonoSeLee('vence hoy');
    que(v.tono === 'av' && /vence hoy/i.test(v.txt) && /último día hábil/i.test(v.txt), donde + ': el último día dice «La liquidación vence hoy», en ámbar (' + v.txt.slice(0, 55) + '…)', donde + ': ' + JSON.stringify(v));
    await cerrarFicha(p);
  } else console.log('  · hoy es fin de semana: el vencimiento no cae en hoy, se salta el tono «vence hoy» (lo cubre la prueba de node)');

  /* La excepción de $60,000: no cuenta nada, y lo dice. */
  await abrirFicha(p, h.grande.id);
  const g = await p.$eval('#pf-ficha .pj-liq', e => ({ tono: e.dataset.tono, txt: e.textContent.replace(/\s+/g, ' ').trim() }));
  await tonoSeLee('como se pactó');
  que(g.tono === 'nada' && /como se pactó/i.test(g.txt) && !/vencida/i.test(g.txt), donde + ': uno de más de $60,000 dice que va «como se pactó» y NO cuenta días (' + g.txt.slice(0, 60) + '…)', donde + ': ' + JSON.stringify(g));
  await cerrarFicha(p);

  /* Solo instalados y en garantía. */
  await abrirFicha(p, h.ganado.id);
  que((await p.$$('#pf-ficha .pj-liq')).length === 0 && (await p.$$('#pf-ficha .pj-gar')).length === 0, donde + ': en un proyecto que todavía no se instala no sale: no hay de dónde contar');
  await cerrarFicha(p);

  /* Sin fecha de instalación: se dice qué falta, no se inventa una cuenta. */
  await p.evaluate(async id => {
    const Agenda = await import('./js/datos/agenda.js');
    const [viva] = await Agenda.listar({ proyecto_id: id, vivas: true });
    if (viva) { const DB = await import('./js/datos/db.js'); await DB.borrar('instalaciones', viva.id); }
  }, h.instalado.id);
  await irA(p, '#/proyectos', 1500);
  await abrirFicha(p, h.instalado.id);
  que((await p.$$('#pf-ficha .pj-liq')).length === 0 && /Sin fecha de instalación/.test(await p.$eval('#pf-ficha', e => e.textContent)),
    donde + ': sin fecha de instalación dice qué falta en vez de contar desde hoy');
  que(errs.length === 0, donde + ': cero errores de página', donde + ': errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

// ══ 7 · P12 + función 31 · el modo cliente ════════════════════════════════
titulo('p12', 'P12 + 31 · EL MODO CLIENTE TAPA LO INTERNO, NO EL TOTAL, Y SE MANEJA CON LAS TRES MANOS');
if (activa('p12')) {
  const c = await entrar({ ancho: 360, touch: true });
  const { p, errs, h } = c;
  const id = h.diseno.id;

  await abrirFicha(p, id);
  que((await filtro(p, '#pf-ficha .pf-interno')) === 'none', 'apagado, la comisión se lee como cualquier otro dato');
  que(!(await p.$eval('#pf-ficha .pf-tapado', e => getComputedStyle(e).display !== 'none')), 'y no hay aviso de nada tapado');
  await cerrarFicha(p);

  const sw = await p.$eval('[data-cliente]', e => ({ role: e.getAttribute('role'), on: e.getAttribute('aria-checked'), alto: e.getBoundingClientRect().height,
    delSistema: e.classList.contains('switch') && !!e.querySelector('.tg') }));
  que(sw.role === 'switch' && sw.on === 'false' && sw.alto >= 44, 'el interruptor es un switch de 44 px, apagado');
  que(sw.delSistema, 'y es el interruptor del sistema (.switch con su .tg), no uno propio');
  que(await p.$eval('[data-ver-importes]', e => e.hidden), '«Ver importes» solo existe con el modo encendido');
  await p.tap('[data-cliente]');
  await esp(p, 400);
  que(await p.$eval('[data-cliente]', e => e.getAttribute('aria-checked')) === 'true' && !(await p.$eval('[data-ver-importes]', e => e.hidden)), 'un toque enciende el modo y saca «Ver importes»');
  que(await p.$eval('[data-cliente] .tg', e => e.classList.contains('on')) && (await p.$eval('[data-ver-importes]', e => e.getBoundingClientRect().height)) >= 44,
    'la perilla se enciende con él, y «Ver importes» mide 44 px con el dedo');
  const hd = await p.$eval('.card-h:has([data-cliente])', e => { const h2 = e.querySelector('h2').getBoundingClientRect(), s = e.querySelector('.pj-cliente').getBoundingClientRect(); return { seMontan: h2.right > s.left + 1 && h2.bottom > s.top + 1 && h2.top < s.bottom - 1 }; });
  que(!hd.seMontan, 'la cabecera baja de renglón: el interruptor ya no se le monta encima al título');

  await abrirFicha(p, id);
  que(/blur/.test(await filtro(p, '#pf-ficha .pf-interno')), 'encendido, la comisión queda tapada');
  const pintados = await p.$$eval('#pf-ficha .pf-interno', els => els.map(e => e.querySelector('dt').textContent.trim() + ' · ' + e.tabIndex));
  que(pintados.length >= 1 && /Comisión pactada/.test(pintados[0]) && pintados.every(t => /· 0$/.test(t)), 'los renglones tapados son paradas de tabulador (para destaparlos con la tecla): ' + pintados.join(' | '));
  /* La decisión escrita en proyectos.js: el importe del PROPIO proyecto no se tapa. */
  que((await filtro(p, '#pf-ficha [data-marca="total"] dd')) === 'none', 'y el total del proyecto NO se tapa: es lo que se le enseña al cliente');
  const grande = await p.evaluate(() => ({ total: parseFloat(getComputedStyle(document.querySelector('#pf-ficha [data-marca="total"] dd')).fontSize), otro: parseFloat(getComputedStyle(document.querySelector('#pf-ficha [data-marca="cuenta"] dd')).fontSize) }));
  que(grande.total > grande.otro * 1.2, 'y crece: ' + grande.total + ' px contra ' + grande.otro + ' del resto');
  que(await p.$eval('#pf-ficha .pf-tapado', e => getComputedStyle(e).display !== 'none'), 'la ficha dice que hay algo tapado y cómo verlo (fuera de la lista, para no borrarse ella también)');

  /* El dedo: mantener destapa EL renglón, y solo ése. */
  await p.evaluate(() => document.querySelector('#pf-ficha .pf-interno').scrollIntoView({ block: 'center' }));
  await esp(p, 300);
  const n = await p.$$eval('#pf-ficha .pf-interno', e => e.length);
  const r0 = await p.evaluate(() => { const e = document.querySelector('#pf-ficha .pf-interno'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const d = await dedo(p);
  await d.bajar(r0.x, r0.y);
  await esp(p, 450);
  const con = await filtro(p, '#pf-ficha .pf-interno');
  const otro = n > 1 ? await p.evaluate(() => getComputedStyle(document.querySelectorAll('#pf-ficha .pf-interno')[1]).filter) : 'none';
  await d.soltar();
  await esp(p, 350);
  const alSoltar = await filtro(p, '#pf-ficha .pf-interno');
  que(con === 'none' && /blur/.test(alSoltar), 'mantener el dedo destapa el renglón, y soltar lo vuelve a tapar (con: ' + con + ' · al soltar: ' + alSoltar + ')');
  que(n < 2 || /blur/.test(otro), 'y solo ése: el de al lado sigue tapado mientras tanto');

  /* Con el ratón, igual. */
  await p.mouse.move(r0.x, r0.y); await p.mouse.down(); await esp(p, 300);
  const cRaton = await filtro(p, '#pf-ficha .pf-interno');
  await p.mouse.up(); await esp(p, 300);
  que(cRaton === 'none' && /blur/.test(await filtro(p, '#pf-ficha .pf-interno')), 'con el ratón, lo mismo');

  /* Con el teclado: se llega con Tab, y Enter sostenido destapa. */
  await p.focus('#pf-ficha .pf-interno');
  await p.keyboard.down('Enter'); await esp(p, 300);
  const cTecla = await filtro(p, '#pf-ficha .pf-interno');
  await p.keyboard.up('Enter'); await esp(p, 300);
  que(cTecla === 'none' && /blur/.test(await filtro(p, '#pf-ficha .pf-interno')), 'con el teclado, Enter sostenido destapa y al soltarlo se vuelve a tapar');
  /* «Ver importes»: sin sostener nada. */
  await cerrarFicha(p);
  await p.tap('[data-ver-importes]');
  await esp(p, 300);
  await abrirFicha(p, id);
  que((await filtro(p, '#pf-ficha .pf-interno')) === 'none', '«Ver importes» los destapa todos de un toque: la alternativa para quien no puede sostener nada');
  /* Y tocar otra cosa NO lo vuelve a tapar (el defecto que ya tuvo el cotizador). */
  await p.mouse.click(60, 400); await esp(p, 300);
  que((await filtro(p, '#pf-ficha .pf-interno')) === 'none', 'un toque en cualquier otra parte no los vuelve a tapar: el botón no miente');
  await cerrarFicha(p);
  await p.tap('[data-ver-importes]');
  await esp(p, 250);

  /* Sigue al cambiar de pantalla: la cuenta «En el taller» del Tablero. */
  await irA(p, '#/tablero', 1700);
  que(await p.evaluate(() => document.body.classList.contains('pf-cliente')), 'el modo sobrevive al cambio de pantalla: es del que enseña, no de la pantalla');
  const taller = await filtro(p, '.pf-cuenta.dinero');
  que(taller !== 'no existe' && /blur/.test(taller), 'y en el Tablero la cuenta «En el taller» —la suma de todo lo vendido— también queda tapada (' + taller + ')');
  const tc = await centro(p, '.pf-cuenta.dinero');
  await d.bajar(tc.x, tc.y); await esp(p, 450);
  const tcCon = await filtro(p, '.pf-cuenta.dinero');
  await d.soltar(); await esp(p, 300);
  que(tcCon === 'none' && /blur/.test(await filtro(p, '.pf-cuenta.dinero')), 'y se destapa mientras dura el dedo');
  await irA(p, '#/proyectos', 1400);
  await p.tap('[data-cliente]');
  await esp(p, 300);
  await irA(p, '#/tablero', 1500);
  que((await filtro(p, '.pf-cuenta.dinero')) === 'none', 'apagado el modo, el Tablero vuelve a mostrarla');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

// ══ 8 · P9 · arrastrar entre columnas ═════════════════════════════════════
titulo('p9', 'P9 · LA TARJETA CAMBIA DE COLUMNA CON EL RATÓN, CON EL DEDO Y CON EL TECLADO');
if (activa('p9')) {
  const c = await entrar({ ancho: 1280, alto: 900 });
  const { p, errs, h } = c;
  que(!!(await p.$('.pj-tablero')), 'a 1280 px hay tablero de columnas');
  que((await columnaDe(p, h.ganado.id)) === 'ganado', 'y la tarjeta arranca en su columna');

  /* Un toque CORTO sigue abriendo la ficha: es lo primero que rompe meter un arrastre. */
  let cj = await centro(p, `[data-abrir="${h.ganado.id}"]`);
  await p.mouse.move(cj.x, cj.y); await p.mouse.down(); await esp(p, 90); await p.mouse.up();
  await esp(p, 900);
  que(await fichaAbierta(p), 'un toque corto sigue abriendo la ficha');
  await cerrarFicha(p);

  const aColumna = async col => p.evaluate(k => { const r = document.querySelector('.pj-col[data-col="' + k + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(r.height - 30, 160) }; }, col);
  cj = await centro(p, `[data-abrir="${h.ganado.id}"]`);
  let dst = await aColumna('en_diseno');
  await p.mouse.move(cj.x, cj.y); await p.mouse.down(); await esp(p, 420);
  que(!!(await p.$('.pj-fantasma')) && await p.$eval(`[data-abrir="${h.ganado.id}"]`, e => e.classList.contains('pj-levantada')), 'mantener 250 ms levanta la tarjeta: queda marcada en su hueco y su fantasma sigue al puntero');
  await p.mouse.move(dst.x, dst.y, { steps: 12 });
  await esp(p, 200);
  que(await p.$eval('.pj-col[data-col="en_diseno"]', e => e.classList.contains('sobre')), 'la columna de debajo se ilumina');
  que(!(await p.$eval('.pj-col[data-col="ganado"]', e => e.classList.contains('sobre'))), 'y la de donde salió no');
  /* Escape suelta sin mover. */
  await p.keyboard.press('Escape');
  await esp(p, 200);
  que(!(await p.$('.pj-fantasma')) && (await columnaDe(p, h.ganado.id)) === 'ganado', 'Escape suelta la tarjeta donde estaba');
  await p.mouse.up(); await esp(p, 700);
  que(!(await fichaAbierta(p)), 'y soltar después no abre la ficha ni mueve nada');

  /* Y ahora sí: arrastrar y soltar en la columna de «En diseño». La pieza 22 se espía para ver
     cuándo se llama y dónde estaba la tarjeta ENTONCES. */
  await p.evaluate(() => {
    window.__viajes = [];
    const P = window.Piezas, orig = P.transicion;
    P.transicion = function (fn, o) {
      const nombres = o && o.nombres ? Object.keys(o.nombres) : [];
      const t = document.querySelector('[data-abrir]'), tj = [...document.querySelectorAll('[data-abrir]')];
      window.__viajes.push({ nombres, columnas: Object.fromEntries(tj.map(x => [x.dataset.abrir, x.closest('[data-col]').dataset.col])) });
      return orig.call(this, fn, o);
    };
  });
  cj = await centro(p, `[data-abrir="${h.ganado.id}"]`);
  dst = await aColumna('en_diseno');
  await p.mouse.move(cj.x, cj.y); await p.mouse.down(); await esp(p, 420);
  await p.mouse.move(dst.x, dst.y, { steps: 12 }); await esp(p, 200);
  await p.mouse.up();
  await esp(p, 1500);
  que((await columnaDe(p, h.ganado.id)) === 'en_diseno', 'al soltar, la tarjeta se queda en su columna nueva');
  que(!(await p.$('.pj-fantasma')) && !(await p.$('.pj-levantada')), 'el fantasma se va y la tarjeta ya no está «levantada»');
  que(!(await fichaAbierta(p)), 'y el clic que llega después de soltar no abre la ficha del proyecto que se movió');
  const v = await p.evaluate(() => window.__viajes);
  que(v.length === 1 && v[0].nombres.length === 1 && /^pj-/.test(v[0].nombres[0]), 'P8: la tarjeta VIAJA: la pieza 22 se llamó una vez, con UNA tarjeta nombrada (' + (v[0] && v[0].nombres.join()) + ')');
  que(v.length === 1 && v[0].columnas[h.ganado.id] === 'ganado', 'P8: y se llamó con la tarjeta todavía en su columna de antes (si no, no hay de dónde viajar)');

  /* Cruzar «Cortado» PREGUNTA, igual que el Tablero: saca material del almacén. */
  await p.evaluate(i => document.querySelector('[data-abrir="' + i + '"]').focus(), h.ganado.id);
  await p.keyboard.down('Alt'); await p.keyboard.press('ArrowRight'); await p.keyboard.up('Alt');
  await esp(p, 1000);
  que(await pregunta(p), 'Alt+→ mueve con el teclado, y cruzar «Cortado» pregunta antes (como el Tablero)');
  await p.evaluate(() => document.querySelector('#pf-confirma [data-conf="si"]').click());
  await esp(p, 1400);
  que((await columnaDe(p, h.ganado.id)) === 'cortado', 'y contestando que sí, la tarjeta llega a «Cortado»');
  await p.evaluate(i => document.querySelector('[data-abrir="' + i + '"]').focus(), h.ganado.id);
  await p.keyboard.down('Alt'); await p.keyboard.press('ArrowLeft'); await p.keyboard.up('Alt');
  await esp(p, 900);
  que(await pregunta(p), 'Alt+← regresa, y regresar también pregunta');
  await p.evaluate(() => document.querySelector('#pf-confirma [data-conf="no"]').click());
  await esp(p, 600);
  que((await columnaDe(p, h.ganado.id)) === 'cortado', 'diciendo que no, se queda');

  /* Con el modo cliente encendido no se mueve obra por accidente. */
  await p.evaluate(() => document.querySelector('[data-cliente]').click());
  await esp(p, 300);
  cj = await centro(p, `[data-abrir="${h.ganado2.id}"]`);
  await p.mouse.move(cj.x, cj.y); await p.mouse.down(); await esp(p, 500);
  que(!(await p.$('.pj-fantasma')), 'con el modo cliente encendido la tarjeta no se levanta');
  await p.mouse.up(); await esp(p, 600);
  await cerrarFicha(p).catch(() => {});
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

titulo('p9dedo', 'P9 · CON EL DEDO (EL FOLD ABIERTO, 880 PX) Y CON EL TABLERO QUE CORRE SOLO POR EL BORDE');
if (activa('p9dedo')) {
  const c = await entrar({ ancho: 880, alto: 800, touch: true });
  const { p, errs, h } = c;
  const d = await dedo(p);
  que((await p.$eval('.pj-tablero', e => e.scrollWidth - e.clientWidth)) > 20, 'a 880 px las cinco columnas no caben: el tablero se desliza');

  /* Toque corto abre. */
  let cj = await centro(p, `[data-abrir="${h.ganado.id}"]`);
  await d.tocar(cj.x, cj.y);
  await esp(p, 900);
  que(await fichaAbierta(p), 'un toque corto con el dedo abre la ficha');
  await cerrarFicha(p);

  /* Deslizar antes de los 250 ms es deslizar el tablero, no arrastrar la tarjeta. */
  cj = await centro(p, `[data-abrir="${h.ganado2.id}"]`);
  const sl0 = await p.$eval('.pj-tablero', e => e.scrollLeft);
  await d.deslizar(cj.x, cj.y, -220, 0);
  await esp(p, 700);
  que((await p.$eval('.pj-tablero', e => e.scrollLeft)) > sl0 + 40 && !(await p.$('.pj-fantasma')), 'un deslizón que empieza en una tarjeta desliza el tablero, no la levanta');
  await p.$eval('.pj-tablero', e => { e.scrollLeft = 0; });
  await esp(p, 500);

  /* Levantar con el dedo y soltar en otra columna. */
  const aColumna = async col => p.evaluate(k => { const r = document.querySelector('.pj-col[data-col="' + k + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(r.height - 30, 170) }; }, col);
  cj = await centro(p, `[data-abrir="${h.ganado.id}"]`);
  const dst = await aColumna('en_diseno');
  await d.arrastrar(cj.x, cj.y, dst.x, dst.y, { ms: 450, pasos: 16 });
  await esp(p, 1500);
  que((await columnaDe(p, h.ganado.id)) === 'en_diseno', 'mantener con el dedo y soltar en otra columna la mueve (el navegador no le roba el gesto)');
  que(!(await p.$('.pj-fantasma')) && !(await fichaAbierta(p)), 'sin fantasma sobrante y sin abrir la ficha');

  /* Llevarla a una columna que está fuera de pantalla: corre solo por el borde. */
  cj = await centro(p, `[data-abrir="${h.ganado2.id}"]`);
  const ancho = 880;
  await d.bajar(cj.x, cj.y); await esp(p, 450);
  await d.mover(ancho - 20, cj.y);
  await esp(p, 1500);
  const corrio = await p.$eval('.pj-tablero', e => e.scrollLeft);
  que(corrio > 80, 'con la tarjeta en el aire y el dedo en el borde derecho el tablero corre solo (' + Math.round(corrio) + ' px)');
  const alta = await aColumna('listo');
  await d.mover(alta.x, alta.y); await esp(p, 250);
  que(await p.$eval('.pj-col[data-col="listo"]', e => e.classList.contains('sobre')), 'y la columna que estaba fuera de pantalla se ilumina al llegar');
  await d.soltar();
  await esp(p, 1500);
  const dondeQuedo = await columnaDe(p, h.ganado2.id);
  que(dondeQuedo === 'listo' || (await pregunta(p)), 'soltarla ahí la mueve a «Listo» (pasando por la pregunta del corte si toca)');
  if (await pregunta(p)) { await p.evaluate(() => document.querySelector('#pf-confirma [data-conf="si"]').click()); await esp(p, 1300); }
  que((await columnaDe(p, h.ganado2.id)) === 'listo', 'y la tarjeta llegó a «Listo»');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Pagos no mueve obra. */
  const pg = await entrar({ ancho: 1280, alto: 900, rol: 'pagos' });
  const cp = await centro(pg.p, `[data-abrir="${pg.h.ganado.id}"]`);
  await pg.p.mouse.move(cp.x, cp.y); await pg.p.mouse.down(); await esp(pg.p, 500);
  que(!(await pg.p.$('.pj-fantasma')), 'con el rol de pagos la tarjeta no se levanta: no mueve obra');
  await pg.p.mouse.up(); await esp(pg.p, 500);
  await pg.p.evaluate(i => document.querySelector('[data-abrir="' + i + '"]').focus(), pg.h.ganado.id);
  await pg.p.keyboard.down('Alt'); await pg.p.keyboard.press('ArrowRight'); await pg.p.keyboard.up('Alt');
  await esp(pg.p, 800);
  que((await columnaDe(pg.p, pg.h.ganado.id)) === 'ganado', 'y Alt+→ tampoco la mueve (dice que con su rol no se marca)');
  que(pg.errs.length === 0, 'cero errores de página');
  await pg.ctx.close();
}

// ══ 9 · P8 · la tarjeta viaja desde la ficha ══════════════════════════════
titulo('p8', 'P8 · LA TARJETA VIAJA A SU COLUMNA NUEVA, DESPUÉS DE CERRAR LA FICHA');
for (const rm of activa('p8') ? [false, true] : []) {
  const c = await entrar({ ancho: 360, touch: true, rm });
  const { p, errs, h } = c;
  const donde = rm ? 'con menos movimiento' : 'con movimiento';
  await p.evaluate(() => {
    window.__viajes = [];
    const P = window.Piezas, orig = P.transicion;
    P.transicion = function (fn, o) {
      const t = [...document.querySelectorAll('[data-abrir]')];
      window.__viajes.push({ nombres: o && o.nombres ? Object.keys(o.nombres) : [], capa: document.getElementById('pf-ficha').classList.contains('show'),
        columnas: Object.fromEntries(t.map(x => [x.dataset.abrir, x.closest('[data-col]').dataset.col])) });
      return orig.call(this, fn, o);
    };
  });
  await abrirFicha(p, h.ganado2.id);
  await p.tap('.pj-sigue .btn');           // «Ya se diseñó»
  await esp(p, 1500);
  que((await p.$eval('#pj-etapas [aria-current="step"]', e => e.dataset.clave)) === 'en_diseno', donde + ': «Ya se diseñó» mueve la etapa (la ficha se repinta en su sitio)');
  que((await p.evaluate(() => window.__viajes.length)) === 0, donde + ': con la ficha abierta el viaje espera: la pieza todavía no se llamó');
  que((await columnaDe(p, h.ganado2.id)) === 'ganado', donde + ': y la lista de abajo NO se repintó (la tarjeta sigue en su página de antes)');
  await cerrarFicha(p);
  await esp(p, 900);
  const v = await p.evaluate(() => window.__viajes);
  if (rm) {
    que((await columnaDe(p, h.ganado2.id)) === 'en_diseno', donde + ': al cerrar, la lista se pone al día sin recorrido');
  } else {
    que(v.length === 1 && v[0].nombres.length === 1 && !v[0].capa && v[0].columnas[h.ganado2.id] === 'ganado',
      donde + ': al cerrar la ficha la pieza se llama UNA vez, sin capa encima y con la tarjeta todavía en su columna de antes', donde + ': ' + JSON.stringify(v));
    que((await columnaDe(p, h.ganado2.id)) === 'en_diseno', donde + ': y la tarjeta acaba en su columna nueva');
  }
  const en = await p.evaluate(() => (document.querySelector('#pj-filtros .on') || {}).dataset.etapa);
  que(en === 'en_diseno', donde + ': en el teléfono la lista sigue a la tarjeta: queda en la página de «En diseño» (' + en + ')');
  que((await p.$eval('.pj-lista-movil', e => e.scrollLeft)) > 100, donde + ': con la tira ya puesta en esa página, sin recorrerla');
  que(errs.length === 0, donde + ': cero errores de página', donde + ': errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

// ══ 10 · P10 · la ficha sube y se baja con el dedo ═══════════════════════
titulo('p10', 'P10 · LA FICHA DEL TELÉFONO SUBE DESDE ABAJO Y SE BAJA CON EL DEDO');
for (const rm of activa('p10') ? [false, true] : []) {
  const c = await entrar({ ancho: 360, touch: true, rm });
  const { p, errs, h } = c;
  const donde = rm ? 'con menos movimiento' : 'con movimiento';
  const ty = () => p.evaluate(() => {
    const e = document.querySelector('#pf-ficha .pf-panel'); const m = getComputedStyle(e).transform;
    return m === 'none' ? 0 : new DOMMatrix(m).m42;
  });
  /* La ficha se abre y se mide en el cuadro siguiente, en pleno recorrido. */
  const medidas = await p.evaluate(async id => {
    document.querySelector('[data-abrir="' + id + '"]').click();
    const out = [];
    for (let i = 0; i < 14; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const e = document.querySelector('#pf-ficha .pf-panel'); const m = e ? getComputedStyle(e).transform : 'none';
      out.push(m === 'none' ? 0 : Math.round(new DOMMatrix(m).m42));
    }
    return out;
  }, h.diseno.id);
  await esp(p, 700);
  if (rm) que(medidas.every(y => y === 0), donde + ': la hoja no se desplaza (aparece sin recorrido)', donde + ': se movió: ' + medidas.join(','));
  else {
    const alto = await p.$eval('#pf-ficha .pf-panel', e => e.getBoundingClientRect().height);
    que(medidas.some(y => y > alto * 0.15) && medidas[medidas.length - 1] < medidas[0], donde + ': la hoja SUBE desde abajo: ' + medidas.slice(0, 8).join(', ') + '… px (ya lo hacía sistema.css; aquí solo se comprueba que abrirFicha() lo aproveche)');
  }
  que((await ty()) === 0, donde + ': y termina en su sitio');

  /* Bajarla con el dedo desde la cabeza la cierra (pieza 13, colgada en ui.js). */
  const cab = await centro(p, '#pf-ficha .pf-panel-h h2');
  const d = await dedo(p);
  await d.arrastrar(cab.x, cab.y, cab.x, cab.y + 340, { ms: 0, pasos: 12, pausa: 20 });
  await esp(p, 900);
  que(!(await fichaAbierta(p)), donde + ': arrastrar la cabecera hacia abajo cierra la ficha');
  que(await p.evaluate(() => !document.documentElement.classList.contains('modal-abierto')), donde + ': y devuelve la pantalla de atrás (sin capa colgada)');
  /* Desde el cuerpo, con la ficha bajada, NO: ahí el dedo es de su scroll. */
  await abrirFicha(p, h.diseno.id);
  await p.evaluate(() => { document.querySelector('#pf-ficha .pf-panel-b').scrollTop = 200; });
  await esp(p, 200);
  const cu = await centro(p, '#pf-ficha .pf-panel-b .pf-dato');
  await d.arrastrar(cu.x, cu.y, cu.x, cu.y + 200, { ms: 0, pasos: 10, pausa: 20 });
  await esp(p, 700);
  que(await fichaAbierta(p), donde + ': arrastrar desde el cuerpo (con scroll) no la cierra: ahí el dedo es del desplazamiento');
  que(errs.length === 0, donde + ': cero errores de página', donde + ': errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

// ══ 11 · P11 y P18 · lo que NO se mueve, y lo que rueda cuando algo cambió ═
/* Un latido, no tres: lo fija la falla 3 del brief —«hay que dejarlos en un solo disparo cuando
   algo cambia»— y la regla del sistema de diseño de que nada se mueve en bucle. La clase
   `.cand-partidas` la comparten el cotizador y Proyectos, así que el número se decide en un solo
   sitio (css/sistema.css). Esta prueba pedía tres y el CSS daba uno: se corrigió la prueba, porque
   el que estaba equivocado era el número que ella esperaba. */
titulo('p11', 'P11 · «SIN DECIDIR» DA UN LATIDO Y SE CALLA · P18 · LAS CUENTAS RUEDAN CUANDO ALGO CAMBIÓ');
if (activa('p11')) {
  const c = await abrir({ ancho: 360, touch: true });
  const { p, errs } = c;
  await irA(p, '#/hoy', 1000);
  const h = await sembrar(p);
  const sinDecidir = n => p.evaluate(k => {
    const fila = i => ({ folio: 'COT-71' + String(i).padStart(2, '0'), cliente: 'Cliente pendiente ' + i, proy: 'Letrero', ts: Date.now(), estado: 'autorizada', neto: 5000 + i });
    localStorage.setItem('al3d_historial', JSON.stringify(Array.from({ length: k }, (_, i) => fila(i + 1))));
  }, n);
  await sinDecidir(1);
  await irA(p, '#/proyectos', 1500);
  /* Entrar no es un cambio: nada rueda al montar. */
  const rodando = await p.$$eval('#pj-cuentas b', els => els.filter(e => e.classList.contains('rueda-rodando')).length);
  que(rodando === 0, 'al entrar ninguna cuenta rueda');
  que((await p.$$eval('#pj-cuentas b[data-cuenta]', e => e.length)) >= 3, 'pero las cuentas llevan su clave, así que un cambio SÍ rueda');

  const late = () => p.evaluate(() => {
    const el = document.querySelector('.cand-partidas'); if (!el) return null;
    const cs = getComputedStyle(el);
    return { quieta: el.classList.contains('quieta'), nombre: cs.animationName, veces: cs.animationIterationCount };
  });
  const l1 = await late();
  que(l1 && !l1.quieta && l1.veces === '1', 'la primera vez que aparece, la tarjeta da UN latido y no late en bucle (' + JSON.stringify(l1) + ')');
  /* Se repinta (guardar una cuenta lo hace) y NO vuelve a latir. */
  await abrirFicha(p, h.diseno.id);
  await p.locator('#pf-ficha .chips [data-cuenta]').first().tap();
  await esp(p, 1300);
  await cerrarFicha(p);
  const l2 = await late();
  que(l2 && l2.quieta && l2.nombre === 'none', 'al repintarse por cualquier otra cosa, la misma cuenta ya no late: nace quieta (' + JSON.stringify(l2) + ')');
  /* Sube la cuenta (una cotización más sin decidir) → vuelve a llamar la atención. */
  await sinDecidir(2);
  await abrirFicha(p, h.diseno.id);
  await p.locator('#pf-ficha .chips [data-cuenta]').nth(1).tap();
  await esp(p, 1300);
  await cerrarFicha(p);
  const l3 = await late();
  que(l3 && !l3.quieta && l3.veces === '1', 'pero si la cuenta SUBE (de 1 a 2), vuelve a dar su latido (' + JSON.stringify(l3) + ')');
  await sinDecidir(1);
  await abrirFicha(p, h.diseno.id);
  await p.locator('#pf-ficha .chips [data-cuenta]').nth(2).tap();
  await esp(p, 1300);
  await cerrarFicha(p);
  que((await late()).quieta, 'y si BAJA, no late');
  const inf = await infinitas(p);
  que(inf.length === 0, 'nada gira en bucle en toda la pantalla con la tarjeta puesta');

  /* Odómetro: mover una etapa cambia «en obra / instalados», y con la ficha ya cerrada rueda. */
  await p.evaluate(() => {
    window.__ruedas = [];
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && /rueda/.test(n.className || '')) window.__ruedas.push(n.className); })
      .observe(document.getElementById('pj-cuentas'), { childList: true, subtree: true });
  });
  const antes = await p.$eval('#pj-cuentas [data-cuenta="obra"]', e => e.textContent);
  await abrirFicha(p, h.listo.id);
  await p.tap('.pj-sigue .btn');         // «Ya se instaló»: sale de «en obra»
  await esp(p, 900);
  const bajoVelo = await p.$eval('#pj-cuentas [data-cuenta="obra"]', e => ({ txt: e.textContent, rueda: e.classList.contains('rueda-rodando') }));
  que(bajoVelo.txt === antes && !bajoVelo.rueda, 'con la ficha abierta la cinta de abajo espera (rodaría debajo del velo, donde nadie la ve)');
  await cerrarFicha(p);
  await esp(p, 120);
  const rodo = await p.$eval('#pj-cuentas [data-cuenta="obra"]', e => ({ txt: e.textContent, rueda: e.classList.contains('rueda-rodando') || !!e.querySelector('.rueda-vista') }));
  que(rodo.txt !== antes && rodo.rueda, 'al cerrarla, la cuenta rueda del valor de antes al de ahora (' + antes + ' → ' + rodo.txt + ')');

  /* La sincronización baja algo de otro teléfono y app.js REMONTA la pantalla (desmontar y montar
     seguidos): ahí el número cambió delante de quien mira, y rueda. Se provoca con el mismo evento
     'storage' que usa el cotizador al guardar, que pasa por `montar(..., {forzar:true})`. */
  await p.evaluate(() => {
    window.__giro = false;
    new MutationObserver(ms => { for (const m of ms) { const t = m.target; if (t.classList && t.classList.contains('rueda-rodando') && t.closest('#pj-cuentas')) window.__giro = true; } })
      .observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  await p.evaluate(async id => { const Proy = await import('./js/datos/proyectos.js'); await Proy.avanzarEtapa(id, 'instalado'); }, h.cortado.id);
  await p.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'al3d_historial' })));
  await esp(p, 1800);
  que(await p.evaluate(() => window.__giro), 'P18: si la sincronización remonta la pantalla y un número cambió delante de ti, rueda (aunque sea un montaje nuevo)');

  /* Y entrar de verdad NO: se sale, algo cambia por otro lado, y al volver —pasado el tiempo de
     un remonte— las cuentas se pintan en su sitio, sin rodar. */
  await irA(p, '#/tablero', 1200);
  await p.evaluate(async id => { const Proy = await import('./js/datos/proyectos.js'); await Proy.avanzarEtapa(id, 'instalado'); }, h.diseno.id);
  await esp(p, 4600);
  await p.evaluate(() => { window.location.hash = '#/proyectos'; });
  await p.evaluate(() => {
    window.__giro2 = false;
    new MutationObserver(ms => { for (const m of ms) { const t = m.target; if (t.classList && t.classList.contains('rueda-rodando') && t.closest('#pj-cuentas')) window.__giro2 = true; } })
      .observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  await esp(p, 1800);
  que(!(await p.evaluate(() => window.__giro2)), 'P18: al ENTRAR de nuevo con algo cambiado por otro lado, las cuentas no ruedan: entrar no es un cambio');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();
}

// ══ 12 · Fabricación no ve el dinero, ni el interruptor ══════════════════
titulo('fab', 'FABRICACIÓN NO VE NINGUNA DE ESTAS CIFRAS');
if (activa('fab')) {
  const c = await entrar({ ancho: 360, touch: true, rol: 'fabricacion' });
  const { p, errs, h } = c;
  que((await p.$$('[data-cliente]')).length === 0, 'sin dinero en pantalla, el interruptor de modo cliente no sale');
  await abrirFicha(p, h.instalado.id);
  que((await p.$$('#pf-ficha .pf-interno')).length === 0 && (await p.$$('#pf-ficha .pj-liq')).length === 0,
    'en la ficha no se pinta ni la comisión ni la liquidación: no hay nada que difuminar');
  que(!!(await p.$('#pf-ficha .pj-gar')) && (await p.$$('#pf-ficha .pj-gar-f')).length === 2, 'la garantía sí la ve: la necesita en la calle y no lleva un peso encima');
  /* Fabricación llega a «Listo», y lo dice cuando no puede seguir. */
  await cerrarFicha(p);
  await abrirFicha(p, h.listo.id);
  que((await p.$$('#pf-ficha .pj-sigue .btn')).length === 0 && /lo marca Dirección/.test(await p.$eval('#pf-ficha .pj-sigue', e => e.textContent)),
    'fabricación en «Listo» no tiene botón para seguir, y la ficha dice que lo que sigue lo marca Dirección');
  que(errs.length === 0, 'cero errores de página', 'errores de página: ' + [...new Set(errs)].slice(0, 2).join(' | '));
  await c.ctx.close();

  /* Y en el tablero de escritorio, tampoco ve el importe de las tarjetas ni la cuenta. */
  const t = await entrar({ ancho: 1280, alto: 900, rol: 'fabricacion' });
  que((await t.p.$$('.pj-tarj-monto')).length === 0, 'el tablero de fabricación no lleva importes en las tarjetas');
  que(t.errs.length === 0, 'cero errores de página');
  await t.ctx.close();
}

console.log(fallos ? '\n' + fallos + ' FALLO(S)' : '\nProyectos aguanta el dedo, el ratón y el teclado, en claro y en oscuro, sin moverse sola.');
await nav.close();
process.exit(fallos ? 1 : 0);
