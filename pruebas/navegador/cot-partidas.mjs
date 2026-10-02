/* LAS PARTIDAS Y LA BARRA DE COMPLETITUD, CON EL DEDO, EL RATÓN Y EL TECLADO.

   Lo que se defiende, y por qué se mide en un navegador y no se lee en el código:

   · SOLO SE MUEVE LO QUE SE TOCÓ (C1). Un chip, una tecla y un importe NO fotografían la
     pantalla ni hacen entrar a ninguna partida; agregar, plegar, duplicar, borrar, reordenar y
     cambiar de tipo SÍ viajan (View Transitions con movimiento, en seco sin él). Se mide con un
     espía sobre `document.startViewTransition`: cuántas veces corrió y por qué acción.
   · SEÑALAR DÓNDE ESTÁ LO QUE FALTA (C7). Las cuatro esquinas (`.mira`) se cierran sobre el campo
     del cliente, sobre el GRUPO de chips en ámbar de la partida y sobre la ficha del candado, y
     las fichas del candado y de «esto ya estaba en pantalla» laten UNA vez, no en bucle.
   · EL OJO DEL PDF CONFIRMA EN EL MISMO BOTÓN (C11). El botón que se toca es el mismo nodo, cambia
     de icono, dice su estado con aria-pressed y apagado mide 4.5:1.
   · COMPARAR MATERIALES SIN ELEGIR (C13). Pasar el cursor, o mantener el dedo 350 ms, enseña el
     importe fantasma SIN escribir en Q (ni el material, ni la marca de «heredado», ni la
     preferencia guardada); soltar no elige; tocar sí.
   · EL LETRERO MIENTRAS SE ESCRIBE (C14). Aluminio = LED posterior, acrílico = LED frontal, leído
     del catálogo; el tono sigue la ficha cálida o fría; sin material no se inventa uno.
   · REORDENAR CON EL DEDO (C15). Mantener el número 300 ms levanta la partida, arrastrar aparta
     a las vecinas, soltar la deja en su sitio; una pulsación corta no levanta nada; y la
     alternativa sin gesto —flechas sobre el número, «subir» y «bajar»— llega al mismo resultado.
   · LA BARRA DE COMPLETITUD (C19, C23 #1). El destello pasa una vez cuando el porcentaje SUBE y
     nunca cuando baja; el renglón de lo que sigue solo cruza si cambió; el porcentaje rueda.
   · EL ESTADO VACÍO EMPIEZA EL TRABAJO (C27). Cinco mosaicos con tarifas del catálogo que crean la
     partida del tipo elegido.
   · BORRAR PIDE SOSTENER (C23 #5) y DESLIZAR DESCUBRE DUPLICAR Y BORRAR (pieza 9) y ARRASTRAR LA
     ETIQUETA MUEVE LA MEDIDA (pieza 3).

   Cada ronda es un teléfono distinto (360 y 420 px) en claro u oscuro, con o sin menos movimiento,
   con dedo (CDP: touchStart/touchMove/touchEnd), ratón y teclado; sin errores de página, sin
   desborde horizontal, sin nada que se mueva solo en reposo dentro de lo que esta zona pinta y con
   el contraste medido sobre lo que se ve.

   Uso:  PUERTO=8814 node pruebas/navegador/cot-partidas.mjs
         RONDA=1,3       para correr solo esas rondas, numeradas desde 1
         CAPTURAS=/ruta  para guardar capturas a 360 px (por omisión /tmp/cot-partidas-capturas) */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const CAP = process.env.CAPTURAS || join(tmpdir(), 'cot-partidas-capturas');
mkdirSync(CAP, { recursive: true });
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const cierto = (c, m, extra = '') => (c ? bien(m) : mal(m + (extra ? ' — ' + extra : '')));
const espera = ms => new Promise(r => setTimeout(r, ms));

const RONDAS = [
  { W: 360, tema: 'claro', red: false }, { W: 360, tema: 'oscuro', red: true },
  { W: 420, tema: 'claro', red: true }, { W: 420, tema: 'oscuro', red: false },
];
const SOLO = (process.env.RONDA || '').split(',').filter(Boolean).map(Number);

/* Una partida de letras como la guarda addItem(), con el material ya elegido a mano (matAuto
   apagado: no es el «heredado» y no sale la nota). */
const L = (id, extra = {}) => ({ id, tipo: 'letras', material: 'al-paint', matAuto: false, comp: 'recta', luz: true,
  ilumTipo: 'fria', altura: 40, n: 8, tarifa: 0, ancho: 0, alto: 0, acab: '', recComp: false, bas: '', desc: '',
  descAi: false, pz: 1, pu: 0, textoAuto: '', showInPdf: true, ...extra });

/* ---------- Las medidas que se repiten, hechas dentro de la página ---------- */
const enPagina = {
  /* Contraste real de un elemento con texto: color de la letra contra el fondo EFECTIVO —los
     fondos translúcidos de los ancestros se componen de abajo hacia arriba—. */
  contraste: sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const canales = c => (c.match(/[\d.]+/g) || [0, 0, 0, 1]).map(Number);
    const mezcla = (arriba, abajo) => { const a = arriba[3] == null ? 1 : arriba[3]; return [0, 1, 2].map(i => arriba[i] * a + abajo[i] * (1 - a)); };
    const capas = [];
    for (let e = el; e; e = e.parentElement) {
      const c = canales(getComputedStyle(e).backgroundColor);
      const a = c[3] == null ? 1 : c[3];
      if (a > 0) capas.push(c);
      if (a >= 1) break;
    }
    let fondo = [255, 255, 255];
    for (let i = capas.length - 1; i >= 0; i--) fondo = mezcla(capas[i], fondo);
    const letra = mezcla(canales(getComputedStyle(el).color), fondo);
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const Lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const a = Lum(letra), b = Lum(fondo);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  },
};

async function ronda(R, indice) {
  const { W, tema, red } = R;
  console.log(`\n══ RONDA ${indice + 1} · ${W} px · ${tema} · ${red ? 'menos movimiento' : 'con movimiento'} ══`);
  const H = 740;
  const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block', reducedMotion: red ? 'reduce' : 'no-preference' });
  await ctx.addInitScript({ path: fileURLToPath(new URL('./hoja-de-mentiras.js', import.meta.url)) });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|Failed to load resource/.test(m.text())) errs.push('consola: ' + m.text()); });
  const ev = (f, a) => p.evaluate(f, a);
  /* Captura a 360 px con lo que se quiere ver a media pantalla y sin avisos de pruebas anteriores
     tapando el dock. Se guardan en el scratchpad, nunca en el repo. */
  const captura = async (nombre, sel) => {
    if (W !== 360) return;
    await ev(sel => { try { Piezas.aviso.limpiar(); } catch (_) {} const el = sel && document.querySelector(sel); if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' }); }, sel || null);
    await p.waitForTimeout(150);
    await p.screenshot({ path: join(CAP, `${nombre}-${tema}${red ? '-rm' : ''}.png`) });
  };

  /* El dedo de verdad: eventos táctiles por el protocolo, que llegan como Pointer Events con
     pointerType «touch» (un `tap` de Playwright no deja mantener ni arrastrar). */
  const dedo = {
    abajo: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }),
    mueve: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }),
    arriba: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  };
  /* Trae el elemento a la vista, a media pantalla, y devuelve su centro. */
  const centro = async sel => ev(sel => {
    const el = document.querySelector(sel); if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }, sel);
  const sinDesborde = async (donde, sel) => {
    const r = await ev(({ sel, W }) => {
      const de = document.documentElement;
      const raiz = sel ? document.querySelector(sel) : document.body;
      const fuera = [...(raiz ? raiz.querySelectorAll('*') : [])].filter(e => {
        const b = e.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(e).position === 'fixed') return false;
        if (e.closest('.mira,.toast,.vistazo,.desenfoque-borde,[hidden],.rueda-vista,.solo-voz,.desliza-acciones,.desliza-principal,.del-pista')) return false;
        return b.right > W + 1 || b.left < -1;
      }).slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 30));
      return { pagina: de.scrollWidth - de.clientWidth, fuera };
    }, { sel, W });
    cierto(r.pagina <= 1 && !r.fuera.length, `sin desborde horizontal ${donde}`, JSON.stringify(r));
  };
  /* Lo que se mueve solo en reposo, dentro de la zona: nada. El botón de «Cotizar con IA» es la
     única pieza con derecho a moverse. */
  const sinBucles = async donde => {
    const r = await ev(() => document.getAnimations().filter(a => {
      const t = a.effect && a.effect.target;
      return a.effect && a.effect.getComputedTiming().iterations === Infinity && t && t.closest
        && t.closest('#card-partidas,#sidebox,#items,.sum') && !t.closest('.ai-btn');
    }).map(a => (a.effect.target.className || a.effect.target.tagName) + ':' + (a.animationName || a.transitionProperty)));
    cierto(!r.length, `nada gira ni late solo en reposo ${donde}`, JSON.stringify(r));
  };
  const contraste = async (sel, donde, min = 4.5) => {
    const c = await ev(enPagina.contraste, sel);
    cierto(c !== null && c >= min, `contraste de ${donde} ≥ ${min}:1`, c === null ? 'no existe' : c.toFixed(2));
  };
  /* Arma la pantalla de partidas con las que se pidan, sin pasar por el teclado. */
  const armar = async (items, extra = {}) => {
    await ev(({ items, extra }) => {
      Q.cliente = 'Farmacia San Juan'; Q.proy = 'Letrero fachada'; Q.tel = '33 2813 0092'; Q.dirRaw = 'Av. Vallarta 1234, Guadalajara';
      Object.assign(Q, extra);
      Q.items = items; pid = Math.max(0, ...items.map(i => i.id));
      _plegadas.clear(); _idsPintados = null;
      saveState(); renderItems(); renderSummary(); irAPantalla('partidas', { forzar: true });
      window.scrollTo(0, 0);
    }, { items, extra });
    await p.waitForTimeout(450);
  };
  /* Cuántas veces corrió `document.startViewTransition` desde que se instaló el espía. */
  const espiarVT = () => ev(() => {
    window.__vt = 0;
    if (!window.__vtOrig) {
      window.__vtOrig = document.startViewTransition ? document.startViewTransition.bind(document) : null;
      if (window.__vtOrig) document.startViewTransition = fn => { window.__vt++; return window.__vtOrig(fn); };
    }
  });
  const vts = () => ev(() => window.__vt || 0);

  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof Q !== 'undefined' && typeof Piezas !== 'undefined' && typeof renderItems === 'function');
  await p.waitForTimeout(900);
  await espiarVT();

  /* ============================== 1 · SOLO SE MUEVE LO QUE SE TOCÓ (C1) ============================== */
  console.log('\n  — solo se mueve lo que se tocó —');
  await armar([L(1, { desc: 'Uno' }), L(2, { desc: 'Dos' }), L(3, { desc: 'Tres' })]);
  await ev(() => { _plegadas.clear(); _plegadas.add(2); _plegadas.add(3); renderItems(); });
  await p.waitForTimeout(300);
  await ev(() => { window.__vt = 0; });
  /* Un chip: el contenido cambia, nada entra ni viaja. */
  await p.click('#p-1 .chip[data-peek-v="al-brush"]');
  await p.waitForTimeout(450);
  const trasChip = await ev(() => ({ vt: window.__vt || 0, mat: Q.items[0].material,
    entradas: document.getAnimations().filter(a => a.animationName === 'entra' || a.animationName === 'aparece').length,
    nace: document.querySelectorAll('.partida.nace').length }));
  cierto(trasChip.mat === 'al-brush', 'tocar el chip lo elige, como siempre');
  cierto(trasChip.vt === 0, 'un chip no fotografía la pantalla (cero transiciones de vista)', JSON.stringify(trasChip));
  cierto(trasChip.nace === 0 && trasChip.entradas === 0, 'y ninguna partida vuelve a entrar con fundido por un chip', JSON.stringify(trasChip));
  /* Teclear: nunca. */
  await p.focus('#h-1');
  await p.keyboard.type('5');
  await p.waitForTimeout(250);
  cierto((await vts()) === 0, 'teclear en un campo no fotografía la pantalla');
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  /* Agregar. */
  await ev(() => { window.__vt = 0; });
  await p.click('#addbtn');
  await p.waitForTimeout(700);
  const trasAgregar = await ev(() => ({ n: Q.items.length, vt: window.__vt || 0,
    sobran: [...document.querySelectorAll('#items>.partida')].filter(e => e.style.viewTransitionName).length,
    clase: document.documentElement.classList.contains('vt-pieza') }));
  cierto(trasAgregar.n === 4 && (await ev(() => !!document.getElementById('p-4'))), '«+ Agregar partida» crea la cuarta y la pinta');
  cierto(red ? trasAgregar.vt === 0 : trasAgregar.vt >= 1, red ? 'con menos movimiento agregar no viaja' : 'agregar viaja (View Transition de las partidas)', JSON.stringify(trasAgregar));
  cierto(!trasAgregar.sobran && !trasAgregar.clase, 'al terminar el viaje no queda ningún nombre de transición puesto', JSON.stringify(trasAgregar));
  /* Plegar y abrir. */
  await ev(() => { window.__vt = 0; });
  await p.click('#p-2 .pfold');
  await p.waitForTimeout(650);
  const abierta = await ev(() => ({ exp: document.querySelector('#p-2 .pfold').getAttribute('aria-expanded'),
    otras: [...document.querySelectorAll('#items>.partida')].filter(e => e.id !== 'p-2' && !e.classList.contains('folded')).length,
    vt: window.__vt || 0 }));
  cierto(abierta.exp === 'true' && abierta.otras === 0, 'abrir una partida pliega las demás (como antes)', JSON.stringify(abierta));
  cierto(red ? abierta.vt === 0 : abierta.vt >= 1, 'y el viaje solo corre con movimiento', JSON.stringify(abierta));
  const foco = await ev(() => document.activeElement && document.activeElement.className);
  cierto(/pfold/.test(String(foco)), 'el foco vuelve al ▾ de la misma partida tras el repintado', String(foco));
  /* Cambiar de tipo, duplicar y borrar. */
  await ev(() => { window.__vt = 0; });
  await p.click('#p-2 .tipo-seg button:has-text("Bastidor")', { force: true });
  await p.waitForTimeout(600);
  cierto(await ev(() => Q.items[1].tipo === 'bastidor'), 'cambiar el tipo funciona');
  cierto(red ? (await vts()) === 0 : (await vts()) >= 1, 'y es una acción de estructura: viaja con movimiento');
  await ev(() => { window.__vt = 0; });
  await ev(() => dupItem(2));
  await p.waitForTimeout(600);
  cierto(await ev(() => Q.items.length === 5 && Q.items[2].tipo === 'bastidor'), 'duplicar deja la copia justo debajo de su original');
  await ev(() => delItem(Q.items[2].id));
  await p.waitForTimeout(600);
  cierto(await ev(() => Q.items.length === 4), 'borrar quita la partida');
  cierto(!!(await ev(() => document.querySelector('#toast .toast-act, .toast .toast-act'))), 'y ofrece «Deshacer»');
  await ev(() => deshacerBorrado());
  await p.waitForTimeout(500);
  cierto(await ev(() => Q.items.length === 5), '«Deshacer» la devuelve');
  /* Entre una acción de estructura y la siguiente no se quedan fotos a medias. */
  await sinBucles('tras las acciones de estructura');
  await sinDesborde('en las partidas', '#card-partidas');

  /* ============================== 2 · SEÑALAR DÓNDE ESTÁ LO QUE FALTA (C7) ============================== */
  console.log('\n  — señalar dónde está lo que falta —');
  /* Esperar a que las esquinas se hayan cerrado sobre su destino y devolver dónde quedaron. */
  const miraSobre = async (sel, tono) => {
    await p.waitForFunction(() => { const m = document.querySelector('.mira.ve'); return !!m; }, null, { timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(red ? 250 : 650);
    return ev(({ sel, tono }) => {
      const m = document.querySelector('.mira'); if (!m) return { hay: false };
      const dest = document.querySelector(sel); if (!dest) return { hay: true, sinDestino: true };
      const r = dest.getBoundingClientRect();
      const e = [...m.children].map(i => i.getBoundingClientRect());
      const arr = Math.min(...e.map(x => x.top)), izq = Math.min(...e.map(x => x.left));
      const aba = Math.max(...e.map(x => x.bottom)), der = Math.max(...e.map(x => x.right));
      return { hay: true, tono: m.dataset.tono, visible: m.classList.contains('ve'),
        dIzq: Math.round(izq - r.left), dArr: Math.round(arr - r.top), dDer: Math.round(der - r.right), dAba: Math.round(aba - r.bottom) };
    }, { sel, tono });
  };
  const rodea = m => m.hay && m.visible && Math.abs(m.dIzq) <= 14 && Math.abs(m.dArr) <= 14 && Math.abs(m.dDer) <= 14 && Math.abs(m.dAba) <= 14;
  /* 2a · el campo del cliente: sin teléfono, llevar al campo y señalarlo en ámbar. */
  await ev(() => { Q.tel = ''; saveState(); renderItems(); irAPantalla('cliente', { subir: false }); });
  await p.waitForTimeout(300);
  await ev(() => irACampoProy('f-tel'));
  const mCampo = await miraSobre('#f-tel');
  cierto(rodea(mCampo) && mCampo.tono === 'av', 'llevar al campo que falta lo enmarca con las cuatro esquinas, en ámbar', JSON.stringify(mCampo));
  cierto(await ev(() => document.activeElement && document.activeElement.id === 'f-tel'), 'y le pone el cursor, como antes');
  await p.waitForFunction(() => !document.querySelector('.mira.ve'), null, { timeout: 4000 }).catch(() => {});
  cierto(!(await ev(() => !!document.querySelector('.mira.ve'))), 'las esquinas se van solas');
  /* 2b · el grupo en ámbar de una partida incompleta. */
  await armar([L(1, { material: '', desc: 'Sin material' }), L(2, { desc: 'Completa' })]);
  await ev(() => { _plegadas.add(1); renderItems(); });
  await ev(() => llevarAPartida(1));
  const mGrupo = await miraSobre('#p-1 .optgrp.falta');
  cierto(rodea(mGrupo) && mGrupo.tono === 'av', 'llevar a una partida enmarca el GRUPO de chips que falta, no un chip suelto', JSON.stringify(mGrupo));
  cierto(await ev(() => document.activeElement && document.activeElement.classList.contains('chip')), 'y el cursor cae en su primera opción');
  await p.waitForFunction(() => !document.querySelector('.mira.ve'), null, { timeout: 4000 }).catch(() => {});
  /* 2c · un campo de medidas vacío. */
  await armar([L(1, { altura: 0, desc: 'Sin altura' })]);
  await ev(() => llevarAPartida(1));
  const mMedida = await miraSobre('#h-1');
  cierto(rodea(mMedida), 'si lo que falta es la altura, enmarca el campo de la altura', JSON.stringify(mMedida));
  await p.waitForFunction(() => !document.querySelector('.mira.ve'), null, { timeout: 4000 }).catch(() => {});
  /* 2d · tocar una partida congelada: late la ficha y se señala SI ya está a la vista. */
  await ev(() => { Q.tel = ''; saveState(); renderItems(); irAPantalla('partidas', { forzar: true }); window.scrollTo(0, 0); });
  await p.waitForTimeout(500);
  const ficha = await ev(() => { const b = document.getElementById('cand-partidas'); return b && !b.hidden; });
  cierto(ficha, 'sin los datos del cliente la ficha del candado aparece sobre las partidas');
  const ani0 = await ev(() => { const b = document.getElementById('cand-partidas'); return b ? b.getAnimations().map(a => ({ n: a.animationName, it: a.effect.getComputedTiming().iterations })) : []; });
  cierto(red ? true : ani0.every(a => a.it === 1), 'la ficha late una sola vez (no hay bucle ni tres)', JSON.stringify(ani0));
  await p.waitForTimeout(red ? 100 : 3000);
  await ev(() => { document.querySelectorAll('.mira').forEach(m => m.remove()); });
  /* El clic va por dentro de la página: el de Playwright desplaza la ficha fuera de la pantalla antes
     de tocar, y la señal solo se pinta si ya estaba a la vista. */
  await ev(() => document.querySelector('.partida .chip').click());
  await p.waitForTimeout(300);
  const trasToque = await ev(() => { const b = document.getElementById('cand-partidas');
    return { anim: b ? b.getAnimations().length : -1, mira: !!document.querySelector('.mira') }; });
  cierto(red ? true : trasToque.anim >= 1, 'tocar algo bloqueado vuelve a latir la ficha, una vez', JSON.stringify(trasToque));
  cierto(trasToque.mira, 'y la señala con las esquinas porque ya estaba a la vista', JSON.stringify(trasToque));
  await p.waitForFunction(() => !document.querySelector('.mira.ve'), null, { timeout: 4000 }).catch(() => {});
  /* 2e · el aviso de «esto ya estaba en pantalla» ya no late en bucle. */
  const bucleAntes = await ev(() => {
    const a = document.getElementById('cot-antes'); a.hidden = false;
    return a.getAnimations().map(x => x.effect.getComputedTiming().iterations);
  });
  cierto(bucleAntes.every(n => n === 1), '«esto ya estaba en pantalla» late una vez, no en bucle', JSON.stringify(bucleAntes));
  await ev(() => { document.getElementById('cot-antes').hidden = true; Q.tel = '33 2813 0092'; saveState(); renderItems(); });
  await sinBucles('con las fichas del candado a la vista');

  /* 2f · las pestañas de los pasos: el bloque del paso se señala. */
  await armar([L(1)]);
  await ev(() => { document.querySelectorAll('.mira').forEach(m => m.remove()); irAPaso(3); });
  const mPaso = await miraSobre('#sidebox .sum');
  cierto(rodea(mPaso) && !mPaso.tono, 'llegar al paso 3 enmarca la tarjeta del total, en azul', JSON.stringify(mPaso));
  await p.waitForFunction(() => !document.querySelector('.mira.ve'), null, { timeout: 4000 }).catch(() => {});
  await ev(() => { Q.items = []; renderItems(); irAPantalla('partidas', { forzar: true }); window.scrollTo(0, 0); });
  await p.waitForTimeout(300);
  await ev(() => { document.querySelectorAll('.mira').forEach(m => m.remove()); irAPaso(3); });
  const mSinTrabajo = await miraSobre('#addbtn');
  cierto(rodea(mSinTrabajo) && mSinTrabajo.tono === 'av', 'si aún no hay trabajo con precio, el paso 3 manda al botón de agregar y lo señala en ámbar', JSON.stringify(mSinTrabajo));
  await p.waitForFunction(() => !document.querySelector('.mira.ve'), null, { timeout: 4000 }).catch(() => {});

  /* ============================== 3 · EL OJO DEL PDF (C11) ============================== */
  console.log('\n  — el ojo del PDF confirma en su botón —');
  await armar([L(1, { desc: 'Uno' }), L(2, { desc: 'Dos' })]);
  await ev(() => { document.querySelector('#p-1 .pdf-vis')._mio = true; });
  cierto((await ev(() => document.querySelector('#p-1 .pdf-vis').getAttribute('aria-pressed'))) === 'true', 'abierto, el ojo dice aria-pressed=true (sale en el PDF)');
  await contraste('#p-1 .pdf-vis', 'el ojo abierto');
  await p.click('#p-1 .pdf-vis');
  await p.waitForTimeout(450);
  const ojo = await ev(() => {
    const b = document.querySelector('#p-1 .pdf-vis');
    return { mismo: !!b._mio, pressed: b.getAttribute('aria-pressed'), off: b.classList.contains('off'),
      oculta: document.getElementById('p-1').classList.contains('hidden-pdf'), dato: Q.items[0].showInPdf,
      a: +getComputedStyle(b.querySelector('.ojo-a')).opacity, bb: +getComputedStyle(b.querySelector('.ojo-b')).opacity,
      conteo: document.getElementById('pcount').textContent, voz: (document.getElementById('vozStatus') || {}).textContent || '' };
  });
  cierto(ojo.mismo, 'el botón que se tocó es EL MISMO nodo: el cambio se ve donde está el dedo', JSON.stringify(ojo));
  cierto(ojo.pressed === 'false' && ojo.off && ojo.oculta && ojo.dato === false, 'ocultar la deja oculta (aria-pressed=false, clase, dato)', JSON.stringify(ojo));
  cierto(ojo.a < 0.1 && ojo.bb > 0.9, 'el ojo se tacha: el icono abierto se va y entra `i-ojo-off`', JSON.stringify(ojo));
  cierto(/1 oculta del PDF/.test(ojo.conteo), 'el conteo de arriba lo sigue diciendo', ojo.conteo);
  cierto(/oculta del PDF/.test(ojo.voz), 'y se dice en voz alta, que es lo único que oye quien no ve el ojo', ojo.voz);
  await contraste('#p-1 .pdf-vis', 'el ojo apagado (el estado no se dice con opacidad)');
  cierto(await ev(() => +getComputedStyle(document.querySelector('#p-1 .pdf-vis')).opacity === 1), 'y el botón ya no baja al 40 % de opacidad');
  await captura('ojo-apagado', '#p-1');
  await p.click('#p-1 .pdf-vis');
  await p.waitForTimeout(300);
  cierto(await ev(() => Q.items[0].showInPdf === true && document.querySelector('#p-1 .pdf-vis').getAttribute('aria-pressed') === 'true'), 'volver a tocarlo la devuelve al PDF');

  /* ============================== 4 · COMPARAR MATERIALES SIN ELEGIR (C13) ============================== */
  console.log('\n  — comparar materiales sin cambiar la partida —');
  await armar([L(1, { material: 'al-paint', matAuto: true, desc: 'Letrero' })]);
  await ev(() => { try { localStorage.removeItem('al3d_ult_material'); } catch (_) {} });
  const esperado = await ev(() => ({ brush: lineTotal({ ...Q.items[0], material: 'al-brush' }), actual: lineTotal(Q.items[0]) }));
  const marcaPreferencia = () => ev(() => { try { return String(localStorage.getItem('al3d_ult_material')); } catch (_) { return ''; } });
  const prefAntes = await marcaPreferencia();
  const ltTexto = () => ev(() => document.getElementById('lt-1').textContent.replace(/\s/g, ''));
  const ltAntes = await ltTexto();
  if (!red || true) {
    /* Ratón: pasar el cursor. */
    const c = await centro('#p-1 .chip[data-peek-v="al-brush"]');
    await p.mouse.move(c.x, c.y);
    await p.waitForTimeout(200);
    const ghost = await ev(() => ({ cls: document.getElementById('lt-1').className, lt: document.getElementById('lt-1').textContent.replace(/\s/g, ''),
      fila: document.getElementById('peek-1').textContent, chip: document.querySelector('.chip.espiado') && document.querySelector('.chip.espiado').dataset.peekV,
      mat: Q.items[0].material, auto: Q.items[0].matAuto }));
    cierto(/lt-fantasma/.test(ghost.cls), 'pasar el cursor por un material pone el total en tinta fantasma', JSON.stringify(ghost));
    cierto(ghost.lt.includes(String(esperado.brush.toLocaleString('en-US', { minimumFractionDigits: 2 }))), 'con el importe que quedaría en brush', `${ghost.lt} vs ${esperado.brush}`);
    cierto(/Con Aluminio Brush/.test(ghost.fila) && ghost.chip === 'al-brush', 'y una línea junto a las fichas dice con qué material y cuánto cambia', ghost.fila);
    cierto(ghost.mat === 'al-paint' && ghost.auto === true, 'sin escribir en la partida: el material y la marca de «heredado» siguen como estaban');
    cierto((await marcaPreferencia()) === prefAntes, 'ni en la preferencia guardada del dispositivo');
    await contraste('#peek-1', 'la línea del material espiado');
    await captura('material-espiado', '#p-1 .chip.espiado');
    await p.mouse.move(2, 2);
    await p.waitForTimeout(200);
    cierto((await ltTexto()) === ltAntes && !(await ev(() => /lt-fantasma/.test(document.getElementById('lt-1').className))), 'quitar el cursor devuelve el importe de verdad');
    cierto(await ev(() => document.getElementById('peek-1').textContent === ''), 'y borra la línea');
  }
  /* Dedo: 350 ms quieto. Soltar no elige. */
  {
    const c = await centro('#p-1 .chip[data-peek-v="al-brush"]');
    await dedo.abajo(c.x, c.y);
    await p.waitForTimeout(150);
    cierto(!(await ev(() => /lt-fantasma/.test(document.getElementById('lt-1').className))), 'con el dedo, antes de 350 ms todavía no se asoma nada');
    await p.waitForTimeout(450);
    cierto(await ev(() => /lt-fantasma/.test(document.getElementById('lt-1').className)), 'mantener el dedo 350 ms enseña el importe fantasma');
    await dedo.arriba();
    await p.waitForTimeout(450);
    const trasSoltar = await ev(() => ({ mat: Q.items[0].material, fantasma: /lt-fantasma/.test(document.getElementById('lt-1').className) }));
    cierto(trasSoltar.mat === 'al-paint' && !trasSoltar.fantasma, 'soltar después de asomarse NO elige (el clic se traga) y devuelve el importe', JSON.stringify(trasSoltar));
    /* Un toque corto sí elige, como hoy. */
    const c2 = await centro('#p-1 .chip[data-peek-v="al-brush"]');
    await dedo.abajo(c2.x, c2.y); await p.waitForTimeout(60); await dedo.arriba();
    await p.waitForTimeout(450);
    cierto(await ev(() => Q.items[0].material === 'al-brush' && Q.items[0].matAuto === false), 'tocar, como siempre, elige — y ahí sí se quita la marca de «heredado»');
    /* Un dedo que se mueve es scroll: no se asoma. */
    const c3 = await centro('#p-1 .chip[data-peek-v="acero"]');
    await dedo.abajo(c3.x, c3.y); await dedo.mueve(c3.x, c3.y - 30); await p.waitForTimeout(500);
    cierto(!(await ev(() => /lt-fantasma/.test(document.getElementById('lt-1').className))), 'un dedo que se mueve antes es scroll y no asoma nada');
    await dedo.arriba();
    await p.waitForTimeout(300);
  }
  /* Teclado: el foco visible hace de cursor. */
  {
    await p.keyboard.press('Shift');
    await p.focus('#p-1 .chip[data-peek-v="acero"]');
    await p.waitForTimeout(250);
    const k = await ev(() => ({ vis: document.activeElement.matches(':focus-visible'), fant: /lt-fantasma/.test(document.getElementById('lt-1').className) }));
    cierto(!k.vis || k.fant, 'con el teclado, el foco visible asoma el importe', JSON.stringify(k));
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await p.waitForTimeout(200);
    cierto(!(await ev(() => /lt-fantasma/.test(document.getElementById('lt-1').className))), 'y al salir del chip se devuelve');
  }
  /* Con la cotización bloqueada no aplica. */
  await ev(() => { Q.tel = ''; saveState(); renderItems(); });
  cierto((await ev(() => document.querySelectorAll('#items .chip[data-peek]').length)) === 0, 'con el candado puesto los chips no llevan el gesto de espiar');
  await ev(() => { Q.tel = '33 2813 0092'; saveState(); renderItems(); });

  /* ============================== 5 · EL LETRERO MIENTRAS SE ESCRIBE (C14) ============================== */
  console.log('\n  — el letrero mientras se escribe el texto —');
  await armar([L(1, { material: '', desc: '' })]);
  cierto(await ev(() => document.getElementById('letrero-caja-1').hidden), 'sin texto no hay letrero');
  await p.focus('#p-1 .autoctr input');
  await p.keyboard.type('FARMACIA');
  await p.waitForTimeout(250);
  const sinMat = await ev(() => ({ caja: !document.getElementById('letrero-caja-1').hidden, pared: !document.querySelector('#letrero-caja-1 .letrero-pared').hidden,
    pie: document.getElementById('letrero-pie-1').textContent }));
  cierto(sinMat.caja && !sinMat.pared && /material/.test(sinMat.pie), 'con texto pero sin material no se inventa uno: pide el material', JSON.stringify(sinMat));
  const letrero = () => ev(() => { const l = document.getElementById('letrero-1'); return { cls: l.className, txt: l.textContent, lab: l.getAttribute('aria-label'),
    pie: document.getElementById('letrero-pie-1').textContent, vis: !document.querySelector('#letrero-caja-1 .letrero-pared').hidden }; });
  await p.click('#p-1 .chip[data-peek-v="al-paint"]');
  await p.waitForTimeout(300);
  let l = await letrero();
  cierto(l.vis && /letrero-aluminio/.test(l.cls) && /luz-fria/.test(l.cls) && l.txt === 'FARMACIA', 'aluminio: letrero de aluminio, luz fría, con el texto tecleado', JSON.stringify(l));
  cierto(/posterior/.test(l.lab) && /posterior/.test(l.pie), 'y dice LED posterior (cara opaca, halo en la pared)', l.lab);
  await p.click('#p-1 .chip[data-peek-v="acr-vol"]');
  await p.waitForTimeout(300);
  l = await letrero();
  cierto(/letrero-acrilico/.test(l.cls) && /frontal/.test(l.lab) && /frontal/.test(l.pie), 'acrílico: la luz es FRONTAL, no se invierte', JSON.stringify(l));
  await p.click('#p-1 .chip:has-text("Cálida")');
  await p.waitForTimeout(300);
  l = await letrero();
  cierto(/luz-calida/.test(l.cls) && /cálida/.test(l.lab), 'la ficha de luz cálida cambia el tono', JSON.stringify(l));
  await p.click('#p-1 button.switch[role="switch"]');
  await p.waitForTimeout(300);
  l = await letrero();
  cierto(/sin-luz/.test(l.cls) && /Sin iluminación/.test(l.pie), 'sin iluminación se apaga el halo', JSON.stringify(l));
  await p.click('#p-1 button.switch[role="switch"]');
  await p.waitForTimeout(200);
  await p.focus('#p-1 .autoctr input');
  await p.keyboard.press('End');
  await p.keyboard.type(' GDL');
  await p.waitForTimeout(250);
  l = await letrero();
  cierto(l.txt === 'FARMACIA GDL', 'cada tecla actualiza el letrero sin repintar la lista (el campo conserva el foco)', l.txt);
  cierto(await ev(() => document.activeElement && document.activeElement.closest('.autoctr') !== null), 'el foco sigue en el campo de texto');
  await contraste('#letrero-pie-1', 'la nota «ilustrativo»');
  cierto(/no es la tipografía del cliente/.test((await letrero()).pie), 'dice que no es la tipografía del cliente');
  await sinDesborde('con el letrero puesto', '#card-partidas');
  await captura('letrero', '#letrero-caja-1');

  /* ============================== 6 · REORDENAR CON EL DEDO (C15) ============================== */
  console.log('\n  — reordenar con el dedo, y sin él —');
  const orden = () => ev(() => Q.items.map(x => x.desc).join(''));
  const plegarTodas = () => ev(() => { Q.items.forEach(i => _plegadas.add(i.id)); renderItems(); });
  await armar([L(1, { desc: 'A' }), L(2, { desc: 'B' }), L(3, { desc: 'C' })]);
  await plegarTodas();
  await p.waitForTimeout(300);
  cierto(await ev(() => document.querySelectorAll('#items>.partida[draggable]').length === 0), 'en reposo ninguna partida es `draggable`: el arrastre del ratón se arma al presionar');
  /* Las tres plegadas a la vista y por debajo de la barra fija: el dedo tiene que caer en el número,
     no en la barra que lo tapa. */
  const asas = () => ev(() => {
    const t = document.getElementById('p-1').getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: Math.max(0, t - 170), behavior: 'instant' });
    return [1, 2, 3].map(i => { const r = document.querySelector('#p-' + i + ' .pmover').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
  });
  let [h1, h2, h3] = await asas();
  cierto(h1.w >= 20 && h1.h >= 18, 'el número es un botón tocable');
  const zona = await ev(() => { const b = document.querySelector('#p-1 .pmover'); const cs = getComputedStyle(b, '::before'); return { h: b.getBoundingClientRect().height + parseFloat(cs.top) * -2, ta: getComputedStyle(b).touchAction }; });
  cierto(zona.ta === 'none', '`touch-action:none` va solo en el número', zona.ta);
  /* Una pulsación corta no levanta nada. */
  await dedo.abajo(h2.x, h2.y);
  await p.waitForTimeout(120);
  cierto(await ev(() => document.getElementById('p-2').classList.contains('armando')), 'mientras se sostiene, el borde se recorre (se está contando)');
  await dedo.arriba();
  await p.waitForTimeout(450);
  cierto((await orden()) === 'ABC' && await ev(() => !document.querySelector('.partida.levantada,.partida.armando')), 'una pulsación corta no levanta ni mueve nada');
  /* Un dedo que pasa es scroll. */
  [h1, h2, h3] = await asas();
  await dedo.abajo(h1.x, h1.y);
  await dedo.mueve(h1.x, h1.y + 25);
  await p.waitForTimeout(450);
  cierto(await ev(() => !document.querySelector('.partida.levantada')), 'moverse antes de los 300 ms cancela: no se levanta');
  await dedo.arriba();
  await p.waitForTimeout(250);
  /* Levantar y arrastrar la A hasta debajo de la C. */
  [h1, h2, h3] = await asas();
  await dedo.abajo(h1.x, h1.y);
  await p.waitForTimeout(430);
  const alzada = await ev(() => ({ lev: document.getElementById('p-1').classList.contains('levantada'), arr: document.getElementById('items').classList.contains('arrastrando') }));
  cierto(alzada.lev && alzada.arr, 'mantener el número 300 ms levanta la partida', JSON.stringify(alzada));
  const y0 = h1.y, y1 = h3.y + 14;
  for (let k = 1; k <= 8; k++) { await dedo.mueve(h1.x, y0 + (y1 - y0) * k / 8); await p.waitForTimeout(40); }
  await p.waitForTimeout(260);
  const aparte = await ev(() => ({ b: document.getElementById('p-2').style.transform, c: document.getElementById('p-3').style.transform,
    a: document.getElementById('p-1').style.transform }));
  cierto(/translateY\(-/.test(aparte.b) && /translateY\(-/.test(aparte.c), 'al arrastrar, las vecinas se apartan para hacerle hueco', JSON.stringify(aparte));
  cierto(/translateY\(/.test(aparte.a), 'y la levantada sigue al dedo', JSON.stringify(aparte));
  await captura('reordenar', '#p-2');
  await dedo.arriba();
  await p.waitForTimeout(600);
  cierto((await orden()) === 'BCA', 'soltar la deja en su sitio: A pasó al final (BCA)', await orden());
  cierto(await ev(() => !document.querySelector('.partida.levantada') && !document.getElementById('items').classList.contains('arrastrando') && ![...document.querySelectorAll('#items>.partida')].some(e => e.style.transform)), 'y no queda ninguna partida con transform ni levantada');
  cierto(/posición 3 de 3/.test(await ev(() => document.getElementById('vozStatus').textContent)), 'se anuncia dónde quedó (lector de pantalla)');
  cierto(await ev(() => [...document.querySelectorAll('#items .pmover')].map(b => b.textContent).join('') === '123'), 'los números se renumeran 1, 2, 3');
  /* Teclado: flechas sobre el número. */
  await ev(() => { Q.items.sort((a, b) => a.desc.localeCompare(b.desc)); renderItems(); });
  await plegarTodas();
  await p.focus('#p-1 .pmover');
  await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(600);
  cierto((await orden()) === 'BAC', 'ArrowDown sobre el número baja la partida una posición', await orden());
  cierto(await ev(() => document.activeElement && document.activeElement.getAttribute('data-foco') === 'mover-1'), 'y el foco se queda en el número de la misma partida');
  await p.keyboard.press('ArrowUp');
  await p.waitForTimeout(600);
  cierto((await orden()) === 'ABC', 'ArrowUp la devuelve');
  await p.keyboard.press('ArrowUp');
  await p.waitForTimeout(300);
  cierto((await orden()) === 'ABC' && /primera/.test(await ev(() => document.getElementById('vozStatus').textContent)), 'en el borde no pasa nada y se dice «ya es la primera»');
  /* Los dos botones de la fórmula, visibles (la fórmula solo se ve con la partida abierta; plegada,
     el número con sus flechas sigue siendo el camino). */
  await ev(() => { _plegadas.delete(2); renderItems(); document.getElementById('p-2').scrollIntoView({ block: 'center', behavior: 'instant' }); });
  await p.waitForTimeout(200);
  const bot = await ev(() => { const b = document.querySelector('#p-2 .pmover-b[data-foco="baja-2"]'); const r = b.getBoundingClientRect();
    return { w: r.width, h: r.height, lab: b.getAttribute('aria-label'), up1: document.querySelector('#p-1 .pmover-b[data-foco="sube-1"]').getAttribute('aria-disabled') }; });
  cierto(bot.h >= 36 && /Bajar la partida 2/.test(bot.lab) && bot.up1 === 'true', '«Subir» y «Bajar» están en cada partida, con su nombre; el de arriba de la primera está inerte', JSON.stringify(bot));
  await p.focus('#p-2 .pmover-b[data-foco="baja-2"]');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  cierto((await orden()) === 'ACB' && await ev(() => document.activeElement && document.activeElement.getAttribute('data-foco') === 'baja-2'), '«Bajar» con el teclado mueve la partida y conserva el foco en el mismo botón', await orden());
  await contraste('#p-1 .pmover-b[data-foco="baja-1"]', 'el botón «Bajar»');
  /* El ratón arma el arrastre nativo solo al presionar. */
  const caja2 = await centro('#p-2 .psum');
  await p.mouse.move(caja2.x, caja2.y);
  await p.mouse.down();
  cierto(await ev(() => document.getElementById('p-2').getAttribute('draggable') === 'true'), 'con el ratón, presionar sobre la partida arma el arrastre de siempre');
  await p.mouse.up();
  await p.waitForTimeout(100);
  cierto(await ev(() => document.getElementById('p-2').getAttribute('draggable') === null), 'y al soltar se desarma');
  await sinDesborde('con la partida levantada y las flechas', '#card-partidas');

  /* ============================== 7 · LA BARRA DE COMPLETITUD (C19, C23 #1) ============================== */
  console.log('\n  — la barra de completitud avanza y destella una vez —');
  /* Sin dirección el 100 % no llega aunque la partida quede completa: la barra puede SUBIR. */
  await armar([L(1, { altura: 0, desc: 'Falta altura' })], { dirRaw: '', maps: '', direccion: '' });
  await p.waitForTimeout(300);
  cierto(await ev(() => document.getElementById('prog-pct').classList.contains('rueda-cifra')), 'el porcentaje es una cifra que rueda (pieza 1)');
  const pct = () => ev(() => document.getElementById('prog-pct').textContent);
  const sweeps = () => ev(() => document.getAnimations().filter(a => a.animationName === 'brillo-una').length);
  const infin = () => ev(() => document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity && a.effect.target && a.effect.target.closest && a.effect.target.closest('.prog-box')).length);
  cierto((await sweeps()) === 0 && (await infin()) === 0, 'en reposo la barra no brilla ni se mueve sola');
  const pct0 = await pct();
  await p.focus('#h-1');
  await p.keyboard.type('4');
  await p.waitForTimeout(120);
  const pct1 = await pct();
  const sube = await ev(() => ({ cls: document.getElementById('prog-bar').classList.contains('sube'), rod: document.getElementById('prog-pct').classList.contains('rueda-rodando') }));
  cierto(parseInt(pct1) > parseInt(pct0), 'completar la altura sube el porcentaje', `${pct0} → ${pct1}`);
  if (red) {
    cierto(!sube.cls && (await sweeps()) === 0, 'con menos movimiento no hay destello (el avance se ve en el relleno)', JSON.stringify(sube));
  } else {
    cierto(sube.cls && (await sweeps()) === 1, 'cuando SUBE, el destello pasa una vez', JSON.stringify(sube));
    cierto((await ev(() => document.getAnimations().find(a => a.animationName === 'brillo-una').effect.getComputedTiming().iterations)) === 1, 'una sola iteración, no en bucle');
    cierto(sube.rod, 'y el porcentaje rueda dígito por dígito');
    await p.waitForTimeout(1100);
    cierto(!(await ev(() => document.getElementById('prog-bar').classList.contains('sube'))) && (await sweeps()) === 0, 'al terminar el barrido no queda ni la clase ni la animación');
  }
  cierto((await ev(() => document.getElementById('prog-pct').textContent)) === pct1, 'el texto del porcentaje es el final desde el primer cuadro (lector de pantalla)');
  /* Bajar no destella. */
  await p.keyboard.press('Backspace');
  await p.waitForTimeout(150);
  const baja = await ev(() => ({ cls: document.getElementById('prog-bar').classList.contains('sube') }));
  cierto(parseInt(await pct()) < parseInt(pct1) && !baja.cls && (await sweeps()) === 0, 'cuando BAJA no destella', JSON.stringify(baja));
  /* Teclear sin que cambie nada tampoco. */
  await p.keyboard.type('45');
  await p.waitForTimeout(80);
  await p.waitForTimeout(red ? 100 : 1100);
  const igual = await ev(() => document.getElementById('prog-next').innerHTML);
  await ev(() => { updProg(); updProg(); updProg(); });
  cierto((await ev(() => document.getElementById('prog-next').innerHTML)) === igual && (await ev(() => !document.querySelector('#prog-next .rotulo-sale'))), 'repintar sin que cambie nada no hace respirar el renglón de «lo que sigue»');
  /* El renglón solo cruza si cambió. */
  const antes = await ev(() => document.getElementById('prog-next').textContent.trim());
  await ev(() => { Q.items[0].n = 0; updProg(); });
  await p.waitForTimeout(60);
  const cruza = await ev(() => ({ sale: !!document.querySelector('#prog-next .rotulo-sale'), txt: document.getElementById('prog-next').textContent.replace(/\s+/g, ' ').trim() }));
  cierto(cruza.txt !== antes, 'cuando lo que falta cambia, el renglón dice lo nuevo', `${antes} → ${cruza.txt}`);
  cierto(red ? !cruza.sale : cruza.sale, red ? 'con menos movimiento cambia sin cruce' : 'y cruza con un fundido vertical (el viejo sale, el nuevo entra)', JSON.stringify(cruza));
  await p.waitForTimeout(400);
  cierto(await ev(() => !document.querySelector('#prog-next .rotulo-sale') && document.querySelectorAll('#prog-next .rotulo-a').length === 1), 'y al terminar queda un solo texto');
  await contraste('#prog-next', 'el renglón de lo que sigue');
  await sinBucles('con la barra de completitud');
  await captura('completitud', '.prog-box');

  /* ============================== 8 · EL ESTADO VACÍO EMPIEZA EL TRABAJO (C27) ============================== */
  console.log('\n  — el estado vacío empieza el trabajo —');
  await armar([]);
  const mos = await ev(() => [...document.querySelectorAll('.mosaicos .mos')].map(b => ({ t: b.dataset.tipo, txt: b.textContent.replace(/\s+/g, ' ').trim(), h: b.getBoundingClientRect().height })));
  cierto(mos.length === 5, 'sin partidas salen cinco mosaicos, uno por tipo', JSON.stringify(mos.map(m => m.t)));
  const tarifas = await ev(() => ({ l: Math.min(...MATERIALES.map(m => m.precio)), r: Math.min(...RECORTES.map(m => m.precio)), b: Math.min(...BASTIDORES.map(m => m.tarifa)), c: Math.min(...CAJAS.map(m => m.tarifa)) }));
  const txt = k => (mos.find(m => m.t === k) || {}).txt || '';
  cierto(txt('letras').includes('$' + tarifas.l + '/cm') && txt('recorte').includes('$' + tarifas.r + '/cm') && txt('bastidor').includes('$' + tarifas.b.toLocaleString('es-MX') + '/m²') && txt('caja').includes('$' + tarifas.c.toLocaleString('es-MX') + '/m²'),
    'cada mosaico trae SU tarifa mínima, leída del catálogo', JSON.stringify(mos.map(m => m.txt)));
  cierto(!/\$/.test(txt('manual')), 'la partida manual no inventa una tarifa', txt('manual'));
  cierto(mos.every(m => m.h >= 44), 'cada mosaico mide al menos 44 px de alto');
  cierto(await ev(() => !!document.querySelector('.vacio-ia-b')), 'y hay una línea hacia «Cotizar con IA»');
  await contraste('.vacio-t', 'el texto del estado vacío');
  await contraste('.mos small', 'la tarifa de un mosaico');
  await contraste('.vacio-ia-b', 'el enlace a «Cotizar con IA»');
  await captura('estado-vacio', '.mosaicos');
  /* Ratón: un solo resaltado que se mueve. */
  const m1 = await centro('.mos[data-tipo="recorte"]');
  await p.mouse.move(m1.x, m1.y);
  await p.waitForTimeout(350);
  const res = await ev(() => { const r = document.querySelector('.resalte-mos'), b = document.querySelector('.mos[data-tipo="recorte"]');
    return { ve: r.classList.contains('ve'), tr: r.style.transform, esperado: `translate(${b.offsetLeft}px, ${b.offsetTop}px)`, uno: document.querySelectorAll('.resalte-mos').length }; });
  cierto(res.ve && res.tr === res.esperado && res.uno === 1, 'pasar el cursor mueve UN resaltado al mosaico, con transform', JSON.stringify(res));
  await p.mouse.move(2, 2);
  /* Dedo: tocar «Caja de luz» crea la partida ya del tipo elegido. */
  const mc = await centro('.mos[data-tipo="caja"]');
  await p.touchscreen.tap(mc.x, mc.y);
  await p.waitForTimeout(700);
  const caja = await ev(() => ({ n: Q.items.length, tipo: Q.items[0] && Q.items[0].tipo, grupo: (document.querySelector('#items .optgrp-t') || {}).textContent, mosaicos: document.querySelectorAll('.mosaicos').length, mat: Q.items[0] && Q.items[0].material }));
  cierto(caja.n === 1 && caja.tipo === 'caja' && /Tipo de caja/.test(caja.grupo) && caja.mosaicos === 0, 'tocar «Caja de luz» crea la partida ya como caja y quita el estado vacío', JSON.stringify(caja));
  /* Teclado: Enter sobre «Letras 3D». */
  await ev(() => { Q.items = []; renderItems(); });
  await p.keyboard.press('Shift');
  await p.focus('.mos[data-tipo="letras"]');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  cierto(await ev(() => Q.items.length === 1 && Q.items[0].tipo === 'letras'), 'con el teclado, Enter sobre un mosaico crea la partida');
  /* Sin los datos del cliente no se ofrece. */
  await ev(() => { Q.items = []; Q.tel = ''; renderItems(); });
  cierto(await ev(() => !document.querySelector('.mosaicos') && !document.querySelector('#items .empty')), 'sin los datos del cliente no hay mosaicos (el candado ya lo explica)');
  await ev(() => { Q.tel = '33 2813 0092'; renderItems(); });

  /* ============================== 9 · BORRAR, DESLIZAR Y ARRASTRAR LA ETIQUETA ============================== */
  console.log('\n  — borrar pide sostener; deslizar descubre; arrastrar la etiqueta mueve la medida —');
  await armar([L(1, { desc: 'Uno' }), L(2, { desc: 'Dos' }), L(3, { desc: '', material: '', altura: 0, n: 0 })]);
  await ev(() => { _plegadas.clear(); _plegadas.add(2); _plegadas.add(3); renderItems(); window.scrollTo(0, 0); });
  await p.waitForTimeout(300);
  cierto(await ev(() => document.querySelector('#p-1 .del').classList.contains('mantener') && !document.querySelector('#p-3 .del').classList.contains('mantener')),
    'la × de una partida con datos pide sostener; la de una vacía se borra con un toque');
  let x = await centro('#p-1 .del');
  await dedo.abajo(x.x, x.y); await p.waitForTimeout(80); await dedo.arriba();
  await p.waitForTimeout(350);
  const toque = await ev(() => ({ n: Q.items.length, pista: (document.querySelector('.del-pista') || {}).textContent || '' }));
  cierto(toque.n === 3 && /Mantén presionado/i.test(toque.pista), 'un toque corto no borra y dice cómo se confirma', JSON.stringify(toque));
  await contraste('.del-pista', 'el aviso de «mantén presionado»');
  await captura('borrar-pista', '#p-1');
  x = await centro('#p-1 .del');
  await dedo.abajo(x.x, x.y);
  await p.waitForTimeout(450);
  cierto((await ev(() => Q.items.length)) === 3, 'a medio camino todavía no se borra');
  await p.waitForTimeout(650);
  await dedo.arriba();
  await p.waitForTimeout(600);
  cierto(await ev(() => Q.items.length === 2 && !document.getElementById('p-1')), 'sostener la × hasta llenarla borra la partida');
  cierto(!!(await ev(() => document.querySelector('.toast .toast-act'))), 'y el «Deshacer» sigue ahí');
  await ev(() => deshacerBorrado());
  await p.waitForTimeout(500);
  /* Teclado: Enter sostenido. */
  await p.focus('#p-1 .del');
  await p.keyboard.down('Enter');
  await p.waitForTimeout(1100);
  await p.keyboard.up('Enter');
  await p.waitForTimeout(500);
  cierto(await ev(() => Q.items.length === 2 && !document.getElementById('p-1')), 'con el teclado, Enter sostenido también borra');
  await ev(() => deshacerBorrado());
  await p.waitForTimeout(500);
  /* La vacía: un toque. */
  x = await centro('#p-3 .del');
  await p.touchscreen.tap(x.x, x.y);
  await p.waitForTimeout(600);
  cierto(await ev(() => !document.getElementById('p-3') && Q.items.length === 2), 'la partida completamente vacía se borra con un toque');

  /* Pieza 9: la plegada se desliza. */
  await armar([L(1, { desc: 'Uno' }), L(2, { desc: 'Dos' })]);
  await ev(() => { _plegadas.add(1); _plegadas.add(2); renderItems(); window.scrollTo(0, 0); });
  await p.waitForTimeout(300);
  cierto(await ev(() => document.querySelectorAll('#items .desliza-partida').length === 2), 'cada partida plegada es una fila deslizable');
  const visibles = await ev(() => { const v = s => { const r = document.querySelector(s).getBoundingClientRect(); return r.width > 0 && r.height > 0; }; return v('#p-1 .dup') && v('#p-1 .del'); });
  cierto(visibles, 'y Duplicar y Borrar siguen a la vista en su encabezado: deslizar es un atajo, no el único camino');
  cierto(await ev(() => !!document.querySelector('#p-1 .desliza-acciones[aria-hidden="true"]') && document.querySelector('#p-1 .desliza-acc').tabIndex === -1), 'las acciones del gesto no se duplican para el lector de pantalla ni el tabulador');
  const f1 = await centro('#p-1 .desliza-cara');
  await dedo.abajo(f1.x + 70, f1.y);
  for (let k = 1; k <= 6; k++) { await dedo.mueve(f1.x + 70 - k * 28, f1.y + 1); await p.waitForTimeout(25); }
  await dedo.arriba();
  await p.waitForTimeout(450);
  cierto(await ev(() => document.querySelector('#p-1 .desliza').classList.contains('abierta')), 'deslizar a la izquierda descubre las acciones');
  await captura('deslizar', '#p-1');
  const dup = await centro('#p-1 .desliza-acciones .desliza-acc');
  await p.touchscreen.tap(dup.x, dup.y);
  await p.waitForTimeout(700);
  cierto(await ev(() => Q.items.length === 3 && Q.items[1].desc === 'Uno'), '«Duplicar» del gesto duplica la partida (el mismo dupItem)');
  const f2 = await centro('#p-2 .desliza-cara');
  await dedo.abajo(f2.x + 70, f2.y);
  for (let k = 1; k <= 6; k++) { await dedo.mueve(f2.x + 70 - k * 28, f2.y + 1); await p.waitForTimeout(25); }
  await dedo.arriba();
  await p.waitForTimeout(450);
  const bor = await ev(() => { const b = [...document.querySelectorAll('.desliza.abierta .desliza-acc')].find(a => /Borrar/.test(a.textContent)); if (!b) return null; b.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  cierto(!!bor, 'el gesto también descubre «Borrar»');
  if (bor) { await p.touchscreen.tap(bor.x, bor.y); await p.waitForTimeout(700); }
  cierto(await ev(() => Q.items.length === 2), '«Borrar» del gesto quita la partida (con su Deshacer)');
  /* Una partida ABIERTA no es una fila: tiene campos. */
  await ev(() => { _plegadas.clear(); renderItems(); });
  cierto(await ev(() => document.querySelectorAll('#items .desliza').length === 0), 'la partida abierta no se desliza: arrastrar el dedo dentro de un campo no abre una fila');

  /* Pieza 3: la etiqueta es el asa de su campo. */
  await armar([L(1, { desc: 'Medida', altura: 40, n: 8 })]);
  const et = await centro('#p-1 label.arrastrable[for="h-1"]');
  cierto(!!et, 'la etiqueta «Altura» es arrastrable');
  const cuantas = await ev(() => document.querySelectorAll('#items label.arrastrable').length);
  cierto(cuantas === 2, 'y la de «# Letras» también', String(cuantas));
  await p.mouse.move(et.x, et.y);
  await p.mouse.down();
  for (let k = 1; k <= 8; k++) { await p.mouse.move(et.x + k * 6, et.y); await p.waitForTimeout(16); }
  await p.mouse.up();
  await p.waitForTimeout(250);
  const alt = await ev(() => ({ v: Q.items[0].altura, campo: document.getElementById('h-1').value, lt: document.getElementById('lt-1').textContent.replace(/\s/g, '') }));
  cierto(alt.v > 40 && String(alt.v) === alt.campo, 'arrastrar la etiqueta hacia la derecha sube la altura, y la partida lo recibe como si se tecleara', JSON.stringify(alt));
  await ev(() => { Q.items = [{ ...Q.items[0], id: 1, tipo: 'bastidor', bas: 'lamina', ancho: 100, alto: 100, material: '' }]; renderItems(); });
  cierto(await ev(() => document.querySelectorAll('#items label.arrastrable').length === 2), 'en un bastidor, «Ancho» y «Alto» (los m²) también son asas');

  await sinBucles('al final de la ronda');
  await sinDesborde('en toda la pantalla de partidas');
  await ctx.close();
  return errs;
}

for (const [i, R] of RONDAS.entries()) {
  if (SOLO.length && !SOLO.includes(i + 1)) continue;
  const errs = await ronda(R, i);
  cierto(!errs.length, 'cero errores de página en la ronda', errs.slice(0, 3).join(' | '));
}
await nav.close();
if (fallos) { console.log(`\n${fallos} comprobaciones fallaron.`); process.exit(1); }
console.log('\nLas partidas se mueven solo cuando se tocan, y todo se alcanza con dedo, ratón y teclado.');
