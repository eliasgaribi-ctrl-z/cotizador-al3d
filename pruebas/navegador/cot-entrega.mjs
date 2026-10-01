/* LA ENTREGA Y «REGISTRAR VENTA», CON EL DEDO, EL RATÓN Y EL TECLADO.

   Lo que se defiende, y por qué se mide en un navegador y no se lee en el código:

   · WHATSAPP DICE A QUÉ NÚMERO VA ANTES DE TOCAR (H2, falla 5). La pista del paso, el aviso ámbar
     del teléfono que no vale y «Ver mensaje» —el texto EXACTO que se va a mandar, en un globo que
     en el teléfono sube como hoja— son marcado que se repinta en cada tecla del anticipo: si el
     globo sobrevive o no al repintado, si «Copiar» devuelve el foco, si el aviso sale antes de
     abrir la ventana, solo se ve corriendo.
   · LOS TRES HITOS, COMO UN RIEL (H3). El conector se llena en verde SOLO cuando alguien marcó el
     hito: el panel se rehace desde una cadena en cada tecla, y si el conector se llenara al nacer
     la columna entera se animaría mientras se teclea. Y volver a tocar un paso ya hecho no
     vuelve a llenarlo. En el historial, los cuatro puntos con su palomita.
   · REGISTRAR VENTA (C4, C5, C23). La cuenta de cobro como fichas que avisan —sin cambiarlo— que
     la hoja va a mover el IVA; el botón que dice que está trabajando, no acepta un segundo toque
     y ofrece «Reintentar» si la hoja no contestó; las cifras que ruedan; la ficha del plazo que
     viaja; la palomita que se dibuja al registrar.
   · LA VISTA PREVIA DEL PDF (H23, A1). «Hoja 3 de 5» con su línea, tocar una hoja para verla al
     ancho, y —lo que no puede fallar— que NADA de eso toque el papel: ni una hoja física de más
     (un <script> después de la última hoja se la habría regalado) ni la barra al imprimir. Y el
     folio completo, el que lleva la «@», impreso junto al QR.
   · Copiar para Canva y Gemini confirman en su propio botón (H18).

   Cada ronda es un teléfono distinto (360 y 420 px) en claro u oscuro, con o sin menos movimiento,
   con dedo (tap), ratón y teclado; sin errores de página, sin desborde horizontal, sin nada que
   se mueva solo en reposo dentro de lo que esta zona pinta, y con el contraste medido sobre lo
   que se ve.

   Uso:  PUERTO=8814 node pruebas/navegador/cot-entrega.mjs
         RONDA=1,3       para correr solo esas rondas, numeradas desde 1
         CAPTURAS=/ruta  para guardar capturas a 360 px (por omisión /tmp/cot-entrega-capturas) */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const CAP = process.env.CAPTURAS || join(tmpdir(), 'cot-entrega-capturas');
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
  { W: 360, tema: 'claro', red: true }, { W: 360, tema: 'oscuro', red: false },
  { W: 420, tema: 'claro', red: false }, { W: 420, tema: 'oscuro', red: true },
];
const RESPUESTA_OK = { ok: true, resultados: [{ ok: true, creada: true, remoto: { id_notion: 'V-042' }, rechazadas: [] }] };

/* ---------- Las medidas que se repiten, hechas dentro de la página ---------- */
const enPagina = {
  /* Contraste real de un elemento con texto: color de la letra contra el fondo EFECTIVO —los
     fondos translúcidos de los ancestros se componen de abajo hacia arriba—. Solo sirve sobre
     fondos planos; lo que va sobre un degradado (los botones de marca) lo mide contraste.mjs
     rasterizando. */
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
    const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const a = L(letra), b = L(fondo);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  },
};

async function ronda(R, indice) {
  const { W, tema, red } = R;
  console.log(`\n══ RONDA ${indice + 1} · ${W} px · ${tema} · ${red ? 'menos movimiento' : 'con movimiento'} ══`);
  const H = 740;
  const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'es-MX', timezoneId: 'America/Mexico_City', serviceWorkers: 'block', reducedMotion: red ? 'reduce' : 'no-preference' });
  await ctx.addInitScript({ path: decodeURIComponent(new URL('./hoja-de-mentiras.js', import.meta.url).pathname) });
  await ctx.addInitScript(t => { try { localStorage.setItem('al3d_tema', t); } catch (_) {} }, tema);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B }).catch(() => {});
  /* El puente de mentiras: cuenta las peticiones y contesta lo que se le diga, con la demora que
     se le diga. Sin él el fetch iría a script.google.com de verdad. */
  const puente = { n: 0, modo: 'ok', demora: 1200, cuerpos: [] };
  await ctx.route('https://script.google.com/**', async r => {
    puente.n++;
    try { puente.cuerpos.push(JSON.parse(r.request().postData() || '{}')); } catch (_) {}
    await espera(puente.demora);
    const cuerpo = puente.modo === 'ok' ? RESPUESTA_OK : { ok: false, mensaje: 'El puente de mentiras dijo que no.' };
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(cuerpo) }).catch(() => {});
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|Failed to load resource/.test(m.text())) errs.push('consola: ' + m.text()); });
  const ev = (f, a) => p.evaluate(f, a);
  const libre = () => ev(() => { try { Piezas.aviso.limpiar(); } catch (_) {} });
  const sinDesborde = async (donde, sel) => {
    const r = await ev(({ sel, W }) => {
      const de = document.documentElement;
      const raiz = sel ? document.querySelector(sel) : document.body;
      const fuera = [...(raiz ? raiz.querySelectorAll('*') : [])].filter(e => {
        const b = e.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(e).position === 'fixed') return false;
        if (e.closest('.mira,.toast,.vistazo,.desenfoque-borde,[hidden],.rueda-vista,.solo-voz')) return false;
        return b.right > W + 1 || b.left < -1;
      }).slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 30));
      return { pagina: de.scrollWidth - de.clientWidth, fuera };
    }, { sel, W });
    cierto(r.pagina <= 1 && !r.fuera.length, `sin desborde horizontal ${donde}`, JSON.stringify(r));
  };
  /* Lo que se mueve solo en reposo, dentro de la zona: nada. (El botón de «Cotizar con IA» es la
     única pieza con derecho a moverse, y no vive en estas pantallas.) */
  const sinBucles = async (donde, zona) => {
    const r = await ev(zona => document.getAnimations().filter(a => {
      const t = a.effect && a.effect.target;
      return a.effect && a.effect.getComputedTiming().iterations === Infinity && t && t.closest && t.closest(zona);
    }).map(a => (a.effect.target.className || a.effect.target.tagName) + ':' + (a.animationName || a.transitionProperty)), zona);
    cierto(!r.length, `nada gira ni late solo en reposo ${donde}`, JSON.stringify(r));
  };
  const captura = async nombre => { if (W === 360) await p.screenshot({ path: join(CAP, `${nombre}-${tema}${red ? '-rm' : ''}.png`) }); };

  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof Q !== 'undefined' && typeof Piezas !== 'undefined' && typeof abrirRegistrarVenta === 'function');
  await p.waitForTimeout(900);
  await ev(() => {
    Q.cliente = 'Farmacia San Juan'; Q.proy = 'Letrero fachada'; Q.tel = '33 2813 0092'; Q.dirRaw = 'Av. Vallarta 1234, Guadalajara';
    Q.items = [{ id: 1, tipo: 'letras', material: 'al-paint', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8, _lt: 0 }];
    saveState(); renderItems(); renderSummary();
  });
  await ev(() => autorizarYoMismo()); await p.waitForTimeout(500);
  await ev(() => autorizar()); await p.waitForTimeout(1200);
  cierto(await ev(() => Q.estado) === 'autorizada', 'la cotización quedó autorizada');
  await ev(() => irAPaso(4)); await p.waitForTimeout(900);
  await libre();

  /* ============================== 1 · EL RIEL DE LA ENTREGA (H3) ============================== */
  console.log('\n  — los tres hitos, como riel —');
  const riel = await ev(() => {
    const ol = document.querySelector('#entrega ol.riel');
    if (!ol) return null;
    return { pasos: [...ol.children].map(li => ({ clave: li.dataset.clave, estado: li.dataset.estado, actual: li.getAttribute('aria-current'),
      nota: (li.querySelector('.riel-nota') || {}).textContent || '', voz: (li.querySelector('.riel-e') || {}).textContent || '' })),
      etiqueta: ol.getAttribute('aria-label'),
      botones: [...ol.querySelectorAll('button')].filter(b => !b.closest('.vistazo')).map(b => Math.round(b.getBoundingClientRect().height)) };
  });
  cierto(!!riel && riel.pasos.length === 3, 'los tres pasos cuelgan de un <ol> con nombre: «' + (riel && riel.etiqueta) + '»');
  cierto(riel && riel.pasos.map(x => x.estado).join() === 'actual,pendiente,pendiente' && riel.pasos[0].actual === 'step',
    'va en el 1 de 3: el PDF es el actual (aria-current) y los otros esperan', JSON.stringify(riel && riel.pasos.map(x => x.estado)));
  cierto(riel && riel.pasos.every(x => /actual|pendiente|hecho/.test(x.voz)), 'y el estado también va con palabras, no solo con color: «' + (riel && riel.pasos[0].voz.trim()) + '»');
  cierto(riel && riel.botones.every(h => h >= 43.5), 'los botones del riel miden 44 px con el dedo', JSON.stringify(riel && riel.botones));

  /* ============================== 2 · WHATSAPP (H2) ============================== */
  console.log('\n  — WhatsApp dice a qué número va, antes de tocar —');
  cierto(riel && /a \+52 33 2813 0092/.test(riel.pasos[1].nota), 'la nota del paso ya trae el número: «' + (riel && riel.pasos[1].nota) + '»');
  cierto(await ev(() => !document.querySelector('#entrega .hito-av')), 'y con el teléfono bueno no hay aviso ámbar');
  await sinDesborde('en la entrega', '#authbox');
  await captura('01-entrega');

  const verMsg = '#entrega .hito-ver';
  cierto(await ev(s => document.querySelector(s).getBoundingClientRect().height >= 43.5, verMsg), '«Ver mensaje» mide 44 px');
  await p.tap(verMsg); await p.waitForTimeout(600);
  const globo = await ev(() => {
    const n = document.querySelector('.vistazo:popover-open');
    const r = n.getBoundingClientRect();
    return { abierto: n.matches(':popover-open'), texto: n.querySelector('pre').textContent, esperado: mensajeWhatsApp(),
      titulo: (n.querySelector('.vistazo-t') || {}).textContent, enHoja: n.classList.contains('en-hoja'),
      dentro: r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, expandido: document.getElementById('wa-ver').getAttribute('aria-expanded') };
  });
  cierto(globo.abierto && globo.expandido === 'true', 'tocar «Ver mensaje» abre el globo y el botón dice que está expandido');
  cierto(globo.texto === globo.esperado && globo.texto.length > 40, 'el texto es EXACTAMENTE el que se va a mandar (' + globo.texto.length + ' caracteres)');
  cierto(/A \+52 33 2813 0092/.test(globo.titulo), 'y dice a quién: «' + globo.titulo + '»');
  cierto(globo.enHoja && globo.dentro, 'en el teléfono sale como hoja de abajo y cabe en la pantalla');
  await captura('02-ver-mensaje');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const trasEsc = await ev(() => ({ abierto: !!document.querySelector('.vistazo:popover-open'), foco: document.activeElement.className }));
  cierto(!trasEsc.abierto && /hito-ver/.test(trasEsc.foco), 'Escape lo cierra y el foco vuelve a «Ver mensaje»');
  cierto(await ev(() => !document.querySelector('.modal-bg.show,.rv-modal-bg.show,#histmodal.show')), 'y Escape no se llevó ninguna otra capa');
  await p.focus(verMsg); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  cierto(await ev(() => !!document.querySelector('.vistazo:popover-open')), 'con el teclado, Enter en «Ver mensaje» lo abre');
  await p.tap('.vistazo:popover-open .vistazo-acciones .btn'); await p.waitForTimeout(500);
  const copiado = await ev(async () => ({ abierto: !!document.querySelector('.vistazo:popover-open'), foco: document.activeElement.className,
    portapapeles: await navigator.clipboard.readText().catch(() => null), esperado: mensajeWhatsApp() }));
  cierto(copiado.portapapeles === copiado.esperado, '«Copiar» deja el mensaje exacto en el portapapeles');
  cierto(!copiado.abierto && /hito-ver/.test(copiado.foco), 'y cierra el globo devolviendo el foco a «Ver mensaje»');
  await libre();
  /* El texto se arma AL ABRIR: `upd()` no repinta el panel, y quien cambia el límite de
     fabricación desde la otra pantalla no debe ver un mensaje viejo en «Ver mensaje». */
  await ev(() => upd('entrega', 'VIERNES 04 DE OCTUBRE'));
  await p.tap(verMsg); await p.waitForTimeout(500);
  const fresco = await ev(() => ({ texto: document.querySelector('.vistazo:popover-open pre').textContent, esperado: mensajeWhatsApp() }));
  cierto(/VIERNES 04 DE OCTUBRE/.test(fresco.texto) && fresco.texto === fresco.esperado, '«Ver mensaje» enseña el texto de AHORA, aunque el panel no se haya repintado (cambió el límite de fabricación)');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await ev(() => upd('entrega', ''));
  await libre();

  /* El teléfono que no sirve: se dice ANTES, y tocar no marca un chat que no existe. */
  await ev(() => { Q.tel = '331234'; renderSummary(); });
  await p.waitForTimeout(300);
  const malTel = await ev(() => ({ av: (document.querySelector('#entrega .hito-av') || {}).textContent, nota: (document.querySelector('#entrega .riel-paso[data-clave="wa"] .riel-nota') || {}).textContent || '' }));
  cierto(malTel.av && /no parece válido/.test(malTel.av) && /sin chat/.test(malTel.av), 'con el teléfono a medias el paso lo dice en ámbar, sin tocar nada: «' + (malTel.av || '').trim() + '»');
  cierto(!/\+52/.test(malTel.nota), 'y la nota no promete un número que no hay');
  await sinDesborde('con el aviso ámbar', '#authbox');
  await ev(() => { window.__abiertas = []; window.open = u => { window.__abiertas.push(u); return {}; }; });
  await p.tap('#entrega .riel-paso[data-clave="wa"] button.hito');
  await p.waitForTimeout(250);
  const trasMal = await ev(() => ({ abiertas: window.__abiertas.slice(), aviso: (document.getElementById('toast') || {}).textContent || '', wa: hitosDe(Q.folio).wa }));
  cierto(trasMal.abiertas.length === 1 && /^https:\/\/wa\.me\/\?text=/.test(trasMal.abiertas[0]), 'tocar abre WhatsApp sin número, para elegir el chat a mano');
  cierto(/no parece un número válido/.test(trasMal.aviso), 'y el aviso está en pantalla en cuanto se toca: «' + trasMal.aviso.trim().slice(0, 70) + '»');
  cierto(trasMal.wa === 0, 'y el hito «chat abierto» NO se marcó: nunca hubo chat');
  await captura('03-telefono-invalido');
  await libre();
  await ev(() => { Q.tel = ''; renderSummary(); }); await p.waitForTimeout(200);
  cierto(await ev(() => /sin teléfono capturado/.test((document.querySelector('#entrega .hito-av') || {}).textContent || '')), 'sin teléfono, el paso dice «sin teléfono capturado»');
  await ev(() => { Q.tel = '33 2813 0092'; renderSummary(); }); await p.waitForTimeout(200);

  /* WhatsApp con un número bueno: abre ese chat y sí marca. */
  await ev(() => { window.__abiertas.length = 0; });
  await p.tap('#entrega .riel-paso[data-clave="wa"] button.hito'); await p.waitForTimeout(250);
  const trasBien = await ev(() => ({ abiertas: window.__abiertas.slice(), wa: hitosDe(Q.folio).wa, estados: [...document.querySelectorAll('#entrega .riel-paso')].map(l => l.dataset.estado) }));
  cierto(trasBien.abiertas.length === 1 && /^https:\/\/wa\.me\/523328130092\?text=/.test(trasBien.abiertas[0]), 'con el teléfono bueno abre el chat de 52 33 2813 0092');
  cierto(trasBien.wa > 0, 'y ahora sí queda «chat abierto»');
  cierto(trasBien.estados.join() === 'actual,hecho,pendiente', 'el riel lo refleja (WhatsApp hecho aunque el PDF siga siendo el que toca)', trasBien.estados.join());
  await libre();

  /* ============================== 3 · EL CONECTOR SE LLENA SOLO CUANDO SE MARCA (H3) ============================== */
  console.log('\n  — el conector se llena en verde solo al marcar —');
  const conector = () => ev(() => { const li = document.querySelector('#entrega .riel-paso[data-clave="pdf"]');
    const m = getComputedStyle(li, '::after').transform.match(/[-\d.]+/g); return { escala: m ? +m[3] : null, recien: li.classList.contains('recien'), estado: li.dataset.estado }; });
  const antes = await conector();
  cierto(antes.estado === 'actual' && antes.escala === 0, 'antes de marcar el PDF, su conector está vacío');
  await ev(() => marcarHito('pdf'));
  const t0 = await conector();
  await p.waitForTimeout(120);
  const t1 = await conector();
  await p.waitForTimeout(800);
  const t2 = await conector();
  if (red) {
    cierto(t0.escala === 1 && !t0.recien, 'con menos movimiento el conector ya está lleno desde el primer cuadro, sin palomita que entre', JSON.stringify(t0));
  } else {
    cierto(t0.estado === 'hecho' && t0.escala < 0.5 && t0.recien, 'al marcar, el conector arranca vacío y la palomita entra', JSON.stringify(t0));
    cierto(t1.escala > 0 && t1.escala < 1, 'se llena de verdad (no salta): ' + t1.escala.toFixed(2) + ' a los 120 ms');
  }
  cierto(t2.escala === 1 && !t2.recien, 'y a los 900 ms está lleno y no queda nada animándose', JSON.stringify(t2));
  const verde = await ev(() => { const li = document.querySelector('#entrega .riel-paso[data-clave="pdf"]'); const sonda = document.createElement('i');
    sonda.style.background = 'var(--ok-fill)'; document.body.appendChild(sonda); const ok = getComputedStyle(sonda).backgroundColor; sonda.remove();
    return { conector: getComputedStyle(li, '::after').backgroundColor, ok }; });
  cierto(verde.conector === verde.ok, 'el conector va en --ok y no en el azul de marca', JSON.stringify(verde));
  await ev(() => marcarHito('pdf')); await p.waitForTimeout(40);
  cierto(!(await conector()).recien, 'volver a tocar un paso que ya estaba hecho NO lo vuelve a animar');
  cierto(await ev(() => !document.querySelector('.entrega-quieta')), 'y no queda la clase que apaga el movimiento del riel');
  await ev(() => renderSummary()); await p.waitForTimeout(40);
  cierto(!(await conector()).recien && (await conector()).escala === 1, 'repintar el panel (una tecla del anticipo) tampoco anima nada: nace lleno y quieto');
  await sinBucles('en la entrega', '#authbox');
  await sinDesborde('con el riel puesto', '#authbox');
  await captura('04-riel-marcado');

  /* ============================== 4 · EL HISTORIAL (H3) ============================== */
  console.log('\n  — los cuatro puntos del historial —');
  await ev(() => abrirHistorial()); await p.waitForTimeout(700);
  const hist = await ev(() => { const h = document.querySelector('.hentry-hitos'); if (!h) return null; const r = h.querySelector('.riel-mini');
    return { estados: [...r.querySelectorAll('.riel-punto')].map(i => i.dataset.estado), palomitas: [...r.querySelectorAll('.riel-punto')].map(i => !!i.querySelector('svg')),
      titulos: [...r.querySelectorAll('.riel-punto')].map(i => i.title), etiqueta: r.getAttribute('aria-label'), rol: r.getAttribute('role'), ultimo: (h.querySelector('.hentry-ultimo') || {}).textContent }; });
  cierto(hist && hist.estados.length === 4, 'cada entrada lleva sus cuatro puntos: Propuesta · PDF · WhatsApp · Venta');
  cierto(hist && hist.estados.join() === 'pendiente,hecho,hecho,pendiente', 'llenos los dos hitos hechos y huecos los que faltan', hist && hist.estados.join());
  cierto(hist && hist.palomitas.join() === 'false,true,true,false', 'lo lleno lleva palomita, no solo color');
  cierto(hist && hist.rol === 'img' && /PDF: hecho/.test(hist.etiqueta) && /Venta: pendiente/.test(hist.etiqueta), 'con la lista completa en su nombre para el lector: «' + (hist && hist.etiqueta) + '»');
  cierto(hist && /PDF · \d/.test(hist.titulos[1]) && /pendiente/.test(hist.titulos[3]), 'y la fecha de cada uno en su title: «' + (hist && hist.titulos[1]) + '»');
  cierto(hist && /Chat abierto · \d/.test(hist.ultimo), 'al lado, el último hito con su fecha: «' + (hist && hist.ultimo) + '»');
  await sinDesborde('en el historial', '#histmodal');
  await captura('05-historial');
  await ev(() => cerrarHistorial()); await p.waitForTimeout(300);

  /* ============================== 5 · COPIAR PARA CANVA Y GEMINI (H18) ============================== */
  console.log('\n  — copiar confirma en el mismo botón —');
  await ev(() => { const d = document.querySelector('details.otras-salidas'); if (d) d.open = true; });
  for (const [sel, dice] of [['button[onclick="copiarParaCanva()"]', 'Canva'], ['button[onclick="copiarParaGemini()"]', 'Gemini']]) {
    const s = 'details.otras-salidas ' + sel;
    const rotuloAntes = await ev(s => document.querySelector(s).textContent.trim().replace(/\s+/g, ' '), s);
    await p.tap(s); await p.waitForTimeout(350);
    const d = await ev(s => { const b = document.querySelector(s); return { texto: b.textContent.trim(), palomita: !!b.querySelector('.palomita'), toast: (document.getElementById('toast') || {}).textContent || '' }; }, s);
    cierto(d.palomita && /Copiado/.test(d.texto), `«${dice}»: el botón dice «Copiado» con su palomita, ahí mismo donde se tocó`, JSON.stringify(d.texto));
    cierto(/copiad|Prompt/i.test(d.toast), '  y el aviso de abajo sigue diciendo dónde pegarlo: «' + d.toast.trim().slice(0, 50) + '»');
    await p.waitForTimeout(2300);
    const vuelta = await ev(s => { const r = document.querySelector(s + ' .rotulo'); return r ? { a: r.querySelector('.rotulo-a').textContent.trim().replace(/\s+/g, ' '), alterno: r.classList.contains('alt') } : null; }, s);
    cierto(vuelta && !vuelta.alterno && vuelta.a === rotuloAntes, '  y a los 2 s vuelve a su rótulo: «' + rotuloAntes + '»', JSON.stringify(vuelta));
    await libre();
  }

  /* ============================== 6 · REGISTRAR VENTA (C4, C5, C23) ============================== */
  console.log('\n  — Registrar venta: la cuenta dice si lleva IVA —');
  await ev(() => abrirRegistrarVenta()); await p.waitForTimeout(700);
  await libre();
  const cuentas = () => ev(() => { const g = document.querySelector('#rv-cuentas-caja .glide'); if (!g) return null;
    const av = document.getElementById('rv-cuenta-av');
    return { chips: [...g.querySelectorAll('[role="radio"]')].map(b => ({ v: b.dataset.v, sub: (b.querySelector('small') || {}).textContent, on: b.getAttribute('aria-checked') === 'true', av: b.classList.contains('tono-av'), h: Math.round(b.getBoundingClientRect().height) })),
      valor: document.getElementById('rv-cuenta').value, tipo: document.getElementById('rv-cuenta').type, aviso: av.hidden ? '' : av.textContent, columnas: getComputedStyle(g).gridTemplateColumns.split(' ').length,
      grupo: g.getAttribute('role'), nombre: (document.getElementById(g.getAttribute('aria-labelledby')) || {}).textContent, iva: Q.iva, enHoja: datosParaLaHoja() }; });
  let c = await cuentas();
  cierto(c && c.chips.length === 5 && c.grupo === 'radiogroup' && /Cuenta/.test(c.nombre), 'las cinco cuentas son un grupo de radios con nombre');
  cierto(c && c.chips.map(x => x.v).join() === 'Constru BNT,Moni MPago,Rul HSBC,Tatis BNT,Elias BBVA', 'con IVA, las que llevan IVA van primero y la que no, al final', c && c.chips.map(x => x.v).join());
  cierto(c && c.chips.every(x => x.sub === (x.v === 'Elias BBVA' ? 'sin IVA' : 'con IVA')), 'cada una dice con palabras si lleva IVA o no');
  cierto(c && c.chips.filter(x => x.av).map(x => x.v).join() === 'Elias BBVA', 'y en ámbar queda solo la que movería el IVA de esta cotización');
  cierto(c && c.valor === 'Constru BNT' && c.tipo === 'hidden' && c.chips[0].on, 'sin cuenta recordada abre en la primera que coincide, y el valor sigue en un <input hidden>: «' + (c && c.valor) + '»');
  cierto(c && c.aviso === '', 'con una cuenta que coincide no hay aviso');
  cierto(c && c.chips.every(x => x.h >= 47.5), 'cada ficha mide 48 px con el dedo', JSON.stringify(c && c.chips.map(x => x.h)));
  cierto(c && c.columnas === 2, 'y a ' + W + ' px caben de dos en dos, no de una en una', 'columnas: ' + (c && c.columnas));
  await sinDesborde('en el modal de venta', '#rv-modal-bg .rv-modal');
  await captura('06-venta-arriba');

  await p.tap('#rv-cuentas-caja [data-v="Elias BBVA"]'); await p.waitForTimeout(450);
  c = await cuentas();
  cierto(c.valor === 'Elias BBVA' && c.chips.find(x => x.on).v === 'Elias BBVA', 'tocar una cuenta la elige y escribe el valor');
  cierto(/lleva IVA y Elias BBVA cobra sin factura/.test(c.aviso) && /le quita el IVA/.test(c.aviso) && /\$11,136\.00/.test(c.aviso),
    'y la hoja avisa qué va a pasar con el dinero, con el neto del PDF: «' + c.aviso + '»');
  cierto(c.iva === true && c.enHoja['IVA'] === true && c.enHoja['Cuenta '] === 'Elias BBVA', 'sin cambiar el IVA de la cotización: a la hoja sigue yendo IVA:true con la cuenta elegida');
  await ev(() => { document.querySelector('#rv-modal-bg .rv-modal').scrollTop = 400; });
  const cA = await ev(enPagina.contraste, '#rv-cuenta-av');
  cierto(cA >= 4.5, 'el aviso ámbar se lee: contraste ' + (cA && cA.toFixed(2)) + ':1');
  const cS = await ev(enPagina.contraste, '#rv-cuentas-caja .chip.on small');
  cierto(cS >= 4.5, 'la etiqueta de la ficha elegida (ámbar sobre el azul tenue): ' + (cS && cS.toFixed(2)) + ':1');
  const cN = await ev(enPagina.contraste, '#rv-cuentas-caja .chip:not(.on):not(.tono-av) small');
  cierto(cN >= 4.5, 'la de una que no está elegida: ' + (cN && cN.toFixed(2)) + ':1');
  const cT = await ev(enPagina.contraste, '#rv-cuentas-caja .chip.tono-av:not(.on) small');
  cierto(cT === null || cT >= 4.5, 'y la ámbar sin elegir: ' + (cT && cT.toFixed(2)) + ':1');
  await captura('07-venta-cuenta-aviso');

  /* Con el teclado: flechas, dan la vuelta, y el aviso sigue a la elegida. */
  await p.focus('#rv-cuentas-caja [role="radio"][aria-checked="true"]');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  c = await cuentas();
  cierto(c.valor === 'Constru BNT' && c.aviso === '', 'ArrowRight desde la última da la vuelta a la primera y el aviso se va');
  await p.keyboard.press('End'); await p.waitForTimeout(150);
  cierto((await cuentas()).valor === 'Elias BBVA' && /sin factura/.test((await cuentas()).aviso), 'End va a la última y el aviso vuelve');
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150);
  cierto((await cuentas()).valor === 'Tatis BNT', 'ArrowLeft retrocede');
  cierto(await ev(() => document.activeElement.dataset.v) === 'Tatis BNT', 'y el foco viaja con la elegida');
  cierto(await ev(() => [...document.querySelectorAll('#rv-cuentas-caja [role="radio"]')].filter(b => b.tabIndex === 0).length) === 1, 'solo la elegida entra al tabulador');

  /* La cuenta recordada, y el orden con una cotización sin IVA. */
  await ev(() => { prefSet(PREF_RV_CUENTA, 'Moni MPago'); cerrarRegistrarVenta(); abrirRegistrarVenta(); }); await p.waitForTimeout(500);
  c = await cuentas();
  cierto(c.valor === 'Moni MPago' && c.chips.find(x => x.on).v === 'Moni MPago', 'la cuenta recordada en el aparato es la que abre elegida');
  await ev(() => { cerrarRegistrarVenta(); Q.iva = false; abrirRegistrarVenta(); }); await p.waitForTimeout(500);
  c = await cuentas();
  cierto(c.chips[0].v === 'Elias BBVA' && c.chips.filter(x => x.av).length === 4, 'sin IVA la primera es la que cobra sin factura, y las otras cuatro son las que sumarían el 16 %');
  cierto(/va sin IVA y Moni MPago cobra con factura/.test(c.aviso) && /suma el 16 %/.test(c.aviso), 'con la recordada (con factura) y una cotización sin IVA, avisa que la hoja suma el 16 %: «' + c.aviso + '»');
  await p.tap('#rv-cuentas-caja [data-v="Elias BBVA"]'); await p.waitForTimeout(300);
  cierto((await cuentas()).aviso === '', 'elegir la que coincide apaga el aviso');
  await ev(() => { prefSet(PREF_RV_CUENTA, ''); cerrarRegistrarVenta(); Q.iva = true; abrirRegistrarVenta(); }); await p.waitForTimeout(400);

  console.log('\n  — las cifras ruedan y la ficha del plazo viaja —');
  const pend = () => ev(() => { const e = document.getElementById('rv-pend-disp'); return { texto: e.textContent, rodando: e.classList.contains('rueda-rodando'), esperado: (() => { const t = desgloseFinal(); const a = parseFloat(document.getElementById('rv-anticipo').value) || 0; return money(Math.max(0, t.neto - a)); })() }; });
  const alAbrir = await pend();
  cierto(!alAbrir.rodando && alAbrir.texto === alAbrir.esperado, 'al abrir el modal las cifras se pintan sin rodar y ya son las de esta venta');
  await p.fill('#rv-anticipo', '1000');
  const rod0 = await pend();
  cierto(rod0.texto === rod0.esperado, 'al teclear, el texto ya es el número final desde el primer cuadro (el lector lo lee una vez): ' + rod0.texto);
  if (red) cierto(!rod0.rodando, 'con menos movimiento no rueda: cambia de golpe');
  else {
    cierto(rod0.rodando, 'con movimiento, el pago pendiente rueda dígito a dígito');
    await p.waitForTimeout(900);
    cierto(!(await pend()).rodando, 'y a los 900 ms ya no rueda: nada queda girando');
  }
  await p.fill('#rv-anticipo', '5568'); await p.waitForTimeout(900);

  const plazo = () => ev(() => ({ viaja: !!document.querySelector('#rv-plazo .ficha-viaja'), on: (document.querySelector('#rv-plazo .chip.on') || {}).textContent, k: Q.plazoK }));
  await ev(() => { document.querySelector('#rv-modal-bg .rv-modal').scrollTop = 200; });
  const chips = await ev(() => [...document.querySelectorAll('#rv-plazo .chip')].map(b => b.textContent.trim()));
  cierto(chips.length === 5, 'los cinco cubos del plazo están ahí');
  await p.tap('#rv-plazo .chip >> nth=4');
  await p.waitForTimeout(70);
  const pz1 = await plazo();
  cierto(red ? !pz1.viaja : pz1.viaja, red ? 'con menos movimiento la ficha no viaja: el elegido cambia' : 'con movimiento, la ficha viaja del cubo de antes al que se tocó');
  await p.waitForTimeout(700);
  const pz2 = await plazo();
  cierto(!pz2.viaja && /3 semanas/.test(pz2.on) && pz2.k === 5, 'y al llegar se va: queda el cubo elegido con su regla de siempre («' + (pz2.on || '').trim() + '»)', JSON.stringify(pz2));
  await p.focus('#rv-plazo .chip >> nth=1'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  cierto((await plazo()).k === 2, 'con el teclado, Enter en un cubo lo elige');

  console.log('\n  — el botón que está trabajando lo dice —');
  await ev(() => { localStorage.setItem('al3d_pf_puente', JSON.stringify({ url: 'https://script.google.com/macros/s/x/exec', token: 'tok' })); });
  const boton = () => ev(() => { const b = document.getElementById('rv-registrar'), h = document.getElementById('rv-copiar'), r = document.getElementById('rv-copied');
    return { estado: b.dataset.estado || '', texto: b.textContent.trim().replace(/\s+/g, ' '), ocupado: b.getAttribute('aria-disabled'), busy: b.getAttribute('aria-busy'), deshabilitado: b.disabled,
      copiar: h.getAttribute('aria-disabled'), recibo: r.classList.contains('show'), reciboTxt: r.textContent.trim(), palomita: !!r.querySelector('.rv-copied-ico .palomita'), ancho: Math.round(b.getBoundingClientRect().width) }; });
  const ancho0 = (await boton()).ancho;
  const antesRecibo = await boton();
  cierto(!antesRecibo.recibo && !antesRecibo.palomita, 'antes de registrar no hay recibo verde ni palomita ya dibujada');
  puente.n = 0; puente.modo = 'ok'; puente.demora = 1300;
  await p.tap('#rv-registrar'); await p.waitForTimeout(250);
  let b = await boton();
  cierto(b.estado === 'trabajando' && /Registrando/.test(b.texto), 'al tocar «Registrar venta» el botón dice que trabaja: «' + b.texto + '»');
  cierto(b.ocupado === 'true' && b.busy === 'true' && !b.deshabilitado, 'está deshabilitado para toques (aria-disabled + aria-busy) sin perder el foco (no usa `disabled`)');
  cierto(b.copiar === 'true', '«Copiar datos para la hoja» espera con él');
  await p.tap('#rv-registrar', { force: true }).catch(() => {}); await p.waitForTimeout(100);
  await p.keyboard.press('Enter').catch(() => {});
  await p.waitForTimeout(1400);
  b = await boton();
  cierto(puente.n === 1, 'un segundo toque, y un Enter, en mitad de la espera no mandan una segunda venta (' + puente.n + ' petición)');
  cierto(b.estado === 'ok' && /Registrada/.test(b.texto), 'al contestar la hoja se lava en verde: «' + b.texto + '»');
  cierto(b.recibo && /V-042/.test(b.reciboTxt) && b.palomita, 'y el recibo verde aparece con su palomita dibujada en ese momento: «' + b.reciboTxt + '»');
  cierto(b.copiar !== 'true', 'y «Copiar datos» vuelve a aceptar toques');
  cierto(b.ancho >= ancho0 - 1, 'el botón no se encogió mientras trabajaba (' + ancho0 + ' → ' + b.ancho + ' px)');
  const vivos = await ev(() => Piezas.aviso.vivos().map(a => a.msg));
  cierto(vivos.some(m => /Venta registrada en la hoja/.test(m)) && !vivos.some(m => /Mandando la venta/.test(m)), 'el aviso de abajo dice que se registró y ya no hay un «Mandando…» de 15 s ocupando la pila', JSON.stringify(vivos));
  cierto(await ev(() => hitosDe(Q.folio).venta > 0), 'el hito «venta» quedó marcado');
  const enviado = puente.cuerpos[0] && puente.cuerpos[0].ops && puente.cuerpos[0].ops[0] && puente.cuerpos[0].ops[0].datos;
  cierto(enviado && enviado['Cuenta '] === 'Constru BNT' && enviado['IVA'] === true && enviado['Anticipo'] === 5568, 'a la hoja viajó la cuenta elegida, el IVA de la cotización y el anticipo', JSON.stringify(enviado && [enviado['Cuenta '], enviado['IVA'], enviado['Anticipo']]));
  await libre(); await p.waitForTimeout(150);
  await captura('08-venta-registrada');
  await p.waitForTimeout(3800);
  b = await boton();
  cierto(!b.estado && /Registrar venta/.test(b.texto), 'a los 3.5 s el botón vuelve a su rótulo');
  await sinBucles('en el modal de venta', '#rv-modal-bg');

  /* Si la hoja no contesta bien: rojo, «Reintentar», y el mismo botón lo vuelve a intentar. */
  puente.n = 0; puente.modo = 'error'; puente.demora = 500;
  await p.tap('#rv-registrar'); await p.waitForTimeout(1000);
  b = await boton();
  cierto(b.estado === 'mal' && /No se registró/.test(b.texto) && /Reintentar/.test(b.texto), 'si la hoja dice que no, el botón lo dice: «' + b.texto + '»');
  cierto(b.copiar !== 'true' && b.ocupado !== 'true', 'y vuelve a aceptar toques, igual que «Copiar datos», que es el respaldo');
  cierto(!b.recibo, 'y el recibo verde de la venta que sí salió antes ya no está: no se contradicen dos avisos sobre la misma venta');
  await libre(); await p.waitForTimeout(150);
  await captura('09-venta-no-se-registro');
  puente.modo = 'ok'; puente.demora = 400;
  await p.tap('#rv-registrar'); await p.waitForTimeout(1000);
  b = await boton();
  cierto(puente.n === 2 && b.estado === 'ok', 'tocar «Reintentar» lo intenta otra vez, y esta vez sale (' + puente.n + ' peticiones)');
  await p.waitForTimeout(3700);

  /* Con el teclado, de punta a punta. */
  puente.n = 0; puente.demora = 300;
  await p.focus('#rv-registrar'); await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  cierto(puente.n === 1 && (await boton()).estado === 'ok', 'con el teclado, Enter en «Registrar venta» registra igual (una sola petición)');
  await p.waitForTimeout(3700);

  /* Sin puente en este aparato: no hay espera, y el modal lo dice como siempre. */
  await ev(() => { localStorage.removeItem('al3d_pf_puente'); Piezas.estadoBoton('rv-registrar').reiniciar(); });
  puente.n = 0;
  await p.tap('#rv-registrar'); await p.waitForTimeout(400);
  b = await boton();
  cierto(puente.n === 0 && b.estado !== 'trabajando', 'sin el puente configurado el botón no finge que espera nada');
  await libre();
  await ev(() => cerrarRegistrarVenta());

  /* ============================== 7 · LA VISTA PREVIA DEL PDF (H23, A1) ============================== */
  console.log('\n  — la vista previa del PDF —');
  const doc = await ev(async () => {
    let blob = null; const crear = URL.createObjectURL; const abrir = window.open;
    URL.createObjectURL = x => { blob = x; return 'blob:medido'; }; window.open = () => null; window.mostrarEnlacePDF = () => {};
    generarPDF(); URL.createObjectURL = crear; window.open = abrir;
    return { html: blob ? await blob.text() : null, folio: Q.sello && Q.sello.folio };
  });
  cierto(!!doc.html, 'se generó el documento');
  const q = await ctx.newPage();
  q.on('pageerror', e => errs.push('documento: ' + e.message));
  await q.setContent(doc.html); await q.waitForTimeout(500);
  const evq = (f, a) => q.evaluate(f, a);
  const total = await evq(() => document.querySelectorAll('.pg').length);
  const barra = () => evq(() => ({ texto: document.getElementById('visor-h').textContent.trim(), p: getComputedStyle(document.getElementById('visor-prog')).getPropertyValue('--p').trim() || document.getElementById('visor-prog').style.getPropertyValue('--p'),
    ancho: document.getElementById('visor-w').textContent.trim(), etiqueta: document.getElementById('visor-w').getAttribute('aria-label'), mostrado: !document.getElementById('visor-w').hidden }));
  let v = await barra();
  cierto(total >= 3 && new RegExp('^Hoja 1 de ' + total).test(v.texto), 'la barra dice en qué hoja va: «' + v.texto + '»');
  cierto(Math.abs(parseFloat(v.p) - 1 / total) < 0.01, 'y la línea de avance marca ' + v.p + ' (1/' + total + ')');
  cierto(v.mostrado && v.ancho === 'Al ancho', 'con su botón «Al ancho», que es la alternativa de teclado de tocar la hoja');
  const geo = await evq(() => { const bar = document.querySelector('.visor').getBoundingClientRect(); const cajas = [...document.querySelectorAll('.visor button')].map(b => b.getBoundingClientRect());
    return { barra: bar.height, alto: cajas.map(c => Math.round(c.height)), dentro: cajas.every(c => c.top >= bar.top - 0.5 && c.bottom <= bar.bottom + 0.5 && c.right <= innerWidth + 0.5 && c.left >= -0.5), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
  cierto(geo.dentro, 'los dos botones caben dentro de la barra a ' + W + ' px (antes «Imprimir / Guardar PDF» se partía en tres renglones y se salía)', JSON.stringify(geo));
  cierto(geo.alto.every(h => h >= 43.5), 'y miden 44 px con el dedo', JSON.stringify(geo.alto));
  cierto(geo.sw <= geo.cw, 'sin desborde horizontal con las hojas encogidas');
  if (W === 360) await q.screenshot({ path: join(CAP, `10-pdf-barra-${tema}${red ? '-rm' : ''}.png`) });
  const ir = async y => { await evq(y => window.scrollTo(0, y), y); await q.waitForTimeout(250); };
  await ir(99999);
  v = await barra();
  cierto(new RegExp('^Hoja ' + total + ' de ' + total).test(v.texto) && Math.abs(parseFloat(v.p) - 1) < 0.01, 'al final del documento dice la ÚLTIMA hoja, aunque sea más chica que la pantalla: «' + v.texto + '»');
  await ir(await evq(() => { const h = document.querySelectorAll('.pg')[1]; return h.getBoundingClientRect().top + scrollY - 60; }));
  v = await barra();
  cierto(/^Hoja 2 de/.test(v.texto), 'con la segunda hoja arriba dice la 2: «' + v.texto + '»');
  await ir(0);
  await q.tap('.pg >> nth=1'); await q.waitForTimeout(1300);
  let a = await evq(() => { const h = document.querySelectorAll('.pg')[1], r = h.getBoundingClientRect(); return { amp: h.classList.contains('ampliada'), ancho: Math.round(r.width), top: Math.round(r.top), izq: Math.round(r.left), bar: document.querySelector('.visor').getBoundingClientRect().bottom, otras: [...document.querySelectorAll('.pg.ampliada')].length }; });
  cierto(a.amp && a.ancho >= 810 && a.otras === 1, 'tocar una hoja la pone al ancho del papel (' + a.ancho + ' px) y solo una a la vez');
  cierto(a.top >= a.bar - 1 && a.top <= a.bar + 20, 'con su encabezado a la vista, no debajo de la barra (' + a.top + ' px, barra en ' + Math.round(a.bar) + ')');
  cierto(Math.abs(a.izq) <= 2, 'y arrancando en el borde izquierdo, para recorrerla hacia la derecha');
  v = await barra();
  cierto(/^Hoja 2 de/.test(v.texto) && v.ancho === 'Completa' && /completa/.test(v.etiqueta), 'la barra sigue en la hoja 2 y el botón ahora dice «Completa»: «' + v.etiqueta + '»');
  if (W === 360) await q.screenshot({ path: join(CAP, `11-pdf-hoja-al-ancho-${tema}${red ? '-rm' : ''}.png`) });
  await q.tap('.pg.ampliada'); await q.waitForTimeout(700);
  a = await evq(() => ({ amp: document.querySelectorAll('.pg.ampliada').length, w: Math.round(document.querySelectorAll('.pg')[1].getBoundingClientRect().width) }));
  cierto(a.amp === 0 && a.w < 500, 'tocarla otra vez la devuelve a su tamaño (' + a.w + ' px)');
  await q.focus('#visor-w'); await q.keyboard.press('Enter'); await q.waitForTimeout(700);
  cierto(await evq(() => document.querySelectorAll('.pg.ampliada').length) === 1, 'con el teclado, Enter en «Al ancho» amplía la hoja en la que se va');
  cierto(await evq(() => document.getElementById('visor-voz').textContent) !== '', 'y se dice por voz: «' + (await evq(() => document.getElementById('visor-voz').textContent)) + '»');
  await q.keyboard.press('Enter'); await q.waitForTimeout(500);
  cierto(await evq(() => document.querySelectorAll('.pg.ampliada').length) === 0, 'otro Enter la devuelve');
  /* Una selección de texto no es un toque para ampliar: se selecciona para copiar un precio. */
  await evq(() => { const n = document.querySelector('.pg .cn'); const r = document.createRange(); r.selectNodeContents(n); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await q.evaluate(() => document.querySelector('.pg').click());
  cierto(await evq(() => document.querySelectorAll('.pg.ampliada').length) === 0, 'un clic con texto seleccionado no amplía la hoja (era para copiar)');
  await evq(() => getSelection().removeAllRanges());
  const trans = await evq(() => getComputedStyle(document.querySelector('.visor-prog>i')).transitionDuration);
  cierto(red ? /^0s/.test(trans) : !/^0s/.test(trans), red ? 'con menos movimiento la línea de avance no transiciona' : 'la línea de avance transiciona en 0.18 s (transform)', trans);
  cierto(await evq(() => document.getAnimations().filter(x => x.effect && x.effect.getComputedTiming().iterations === Infinity).length) === 0, 'nada gira ni late solo en la vista previa');

  /* El papel: nada de esto llega. */
  console.log('\n  — y el papel no se entera —');
  await evq(() => document.querySelectorAll('.pg')[1].classList.add('ampliada'));
  await q.emulateMedia({ media: 'print' }); await q.waitForTimeout(300);
  const papel = await evq(() => ({ barra: getComputedStyle(document.querySelector('.visor')).display, zoom: [...document.querySelectorAll('.pg')].map(h => getComputedStyle(h).zoom), ultima: [...document.querySelectorAll('.pg')].pop().matches(':last-child'),
    outline: getComputedStyle(document.querySelectorAll('.pg')[1]).outlineStyle, scripts: document.querySelectorAll('body script').length }));
  cierto(papel.barra === 'none', 'la barra no se imprime');
  cierto(papel.zoom.every(z => z === '1'), 'ninguna hoja sale encogida ni ampliada en el papel', JSON.stringify(papel.zoom));
  cierto(papel.outline === 'none', 'y la hoja ampliada no lleva su marco');
  cierto(papel.ultima && papel.scripts === 0, 'la última hoja sigue siendo «.pg:last-child» —ningún <script> después de ella—, que es lo que le quita el salto de página');
  const pdf = await q.pdf({ preferCSSPageSize: true, printBackground: true });
  const fisicas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  cierto(fisicas === total, 'la impresora saca ' + fisicas + ' hojas físicas y el documento tiene ' + total + ' (ni una en blanco de más)');
  await q.emulateMedia({ media: 'screen' });

  /* El folio completo, junto al QR. */
  console.log('\n  — el folio completo, junto al QR —');
  const verif = await evq(() => ({ nums: [...document.querySelectorAll('.verif-t .num')].map(x => x.textContent), texto: (document.querySelector('.verif-t p') || {}).textContent || '',
    corta: (document.querySelector('.verif-t p') || {}).scrollWidth <= (document.querySelector('.verif-t p') || {}).clientWidth + 1 }));
  cierto(verif.nums[0] === doc.folio && /^[A-Za-z0-9-]+@[A-Za-z0-9_-]+$/.test(verif.nums[0]), 'el papel imprime el folio COMPLETO, con su «@»: «' + verif.nums[0] + '» (el sello dice «' + doc.folio + '»)');
  cierto(/^PRUE-BA00-\d{4}$/.test(verif.nums[1]), 'y después el código: «' + verif.nums[1] + '»');
  cierto(/con el folio .+ y el código/.test(verif.texto), 'en una frase que se puede seguir con el dedo: «' + verif.texto.trim().slice(0, 90) + '…»');
  await q.close();

  /* ============================== cierre de la ronda ============================== */
  cierto(errs.length === 0, 'sin errores de página en toda la ronda', errs.join(' | '));
  await ctx.close();
}

/* RONDA=1,3 corre solo esas (numeradas desde 1): para no esperar las ocho mientras se ajusta una. */
const SOLO = process.env.RONDA ? process.env.RONDA.split(',').map(Number) : null;
for (let i = 0; i < RONDAS.length; i++) if (!SOLO || SOLO.includes(i + 1)) await ronda(RONDAS[i], i);
await nav.close();
console.log(fallos ? `\n${fallos} comprobación(es) con FALLA.` : '\nTodo bien.');
console.log('Capturas a 360 px en ' + CAP);
process.exit(fallos ? 1 : 0);
