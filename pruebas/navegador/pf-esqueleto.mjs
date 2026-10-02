/* EL ESQUELETO DE LA PLATAFORMA, EN UN NAVEGADOR DE VERDAD.
 *
 * Lo que se defiende, y por qué:
 *
 *   · LA BARRA DE ABAJO DEL TELÉFONO (P5, P19, P20, P24, P31). Son cinco botones —el quinto es
 *     «Más» y abre lo demás— y se pintan UNA vez: el nodo del Tablero es el mismo antes y después
 *     de ir al Calendario, que es lo que deja a la marca deslizarse en vez de aparecer. El globo
 *     salta solo cuando la cuenta SUBE y «Más» suma los de lo que esconde. La pantalla entra por el
 *     lado en que está en la barra, y con las teclas 1-9 no entra por ninguno.
 *   · LA BÚSQUEDA DESDE CUALQUIER PANTALLA (P6): la lupa y «/», la coincidencia resaltada sin
 *     acentos, flechas y Enter, y que un resultado abra SU ficha. Fabricación no ve un solo peso.
 *   · EL MENÚ DE LA CUENTA (F28), que sale de su botón, se cierra con Escape y tocando fuera, y
 *     devuelve el foco.
 *   · EL INDICADOR DE SINCRONIZACIÓN (P15): una nube quieta, el arco solo si la vuelta pasa de un
 *     segundo, la palomita solo si bajó algo, la nube tachada sin señal y la cruz si falló.
 *   · LA BANDA DE AVISO (P26): entra sin empujar lo que se está leyendo.
 *   · EL ARRANQUE EN PASOS (P22) y su aviso de lentitud, que tiene que verse encima de la barra.
 *   · LA PUERTA (F10) con un Google de mentira: el botón que dice cuánto lleva, los dos pasos
 *     con su reloj, la cruz donde se quedó, el mismo aviso otra vez que se sacude, y el foco que
 *     no se pierde.
 *   · INSTALAR EN iPHONE (A18) y el aviso de «se actualizó» (A22).
 *
 * Cada ronda del teléfono corre a 360 y 420 px, con y sin movimiento reducido, en claro y en
 * oscuro; siempre sin errores de página, sin desborde de lado y sin nada moviéndose en reposo.
 *
 * Los medidores se comprueban contra el render, no contra lo que dice la hoja de estilos: el
 * globo de la barra llegó a ser café sobre café (2,6:1) porque nadie lo midió.
 *
 * Necesita navegador y servidor:  PUERTO=8814 node pruebas/navegador/pf-esqueleto.mjs
 * (o pruebas/correr.sh --navegador).
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const PUERTO = process.env.PUERTO || '8814';
const B = 'http://127.0.0.1:' + PUERTO;
const PUBLICO = 'http://al3d.prueba:' + PUERTO;
/* `--host-resolver-rules` y `--no-proxy-server` son los de pruebas/navegador/puerta.mjs: la puerta
   solo sale en un dominio que no sea el de las pruebas, y Chromium en Linux le manda el nombre al
   proxy del entorno si no se le quita. */
const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--host-resolver-rules=MAP al3d.prueba 127.0.0.1', '--no-proxy-server'],
});

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = (m, extra) => { console.log('  ✗ ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); fallos++; };
const cierto = (cond, que, extra) => cond ? bien(que) : mal(que, extra);
const dormir = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------------------------------
   Abrir la plataforma. Un contexto por ronda, con el tema, el rol y el movimiento pedidos.
   ------------------------------------------------------------------------------------------ */
const CORS = { 'access-control-allow-origin': '*' };
/* La hoja de mentira: lo que contesta el Apps Script, con el modo y la demora que la prueba quiera. */
const hoja = { modo: 'normal', demora: 0, n: 0, llamadas: 0 };
async function contestarHoja(r) {
  let cuerpo = {};
  try { cuerpo = JSON.parse(r.request().postData() || '{}'); } catch (_) {}
  const ruta = String(cuerpo.ruta || '').replace(/^\/+/, '');
  hoja.llamadas++;
  /* La demora es de la VUELTA, y por eso solo la paga `jalar`: desde que el almacén viaja a la
     hoja, cada vuelta pide `jalar` y después `jalar_almacen`, en serie, y con la demora en las dos
     una vuelta «de 2.3 s» duraba 4.6 s y el arco seguía girando cuando la prueba lo miraba. */
  if (hoja.demora && ruta === 'jalar') await dormir(hoja.demora);
  let json;
  if (ruta === 'salud') json = { ok: true, rol: 'direccion', version: 'falso-1', via: 'token', escribibles: [], correo: '' };
  else if (ruta === 'jalar') {
    if (hoja.modo === 'error') json = { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'Token desconocido' };
    else if (hoja.modo === 'nuevos') {
      hoja.n++;
      json = { ok: true, hay_mas: false, cursor: null, registros: [{ almacen: 'proyectos', datos: { Proyecto: 'Venta de la hoja ' + hoja.n, id_notion: 'V-' + hoja.n } }] };
    } else json = { ok: true, hay_mas: false, cursor: null, registros: [] };
  } else json = { ok: true };
  await r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(json) });
}

async function abrir({ ancho = 360, alto = 740, tema = 'claro', reducido = false, tactil = true, rol = 'direccion',
  base = B, inicio = '#/hoy', puente = false, extra = null, agente = null } = {}) {
  const movil = ancho < 760;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto }, hasTouch: tactil, isMobile: movil && tactil, locale: 'es-MX',
    timezoneId: 'America/Mexico_City', serviceWorkers: 'block', reducedMotion: reducido ? 'reduce' : 'no-preference',
    userAgent: agente || undefined,
  });
  await ctx.addInitScript(([t, r, pu, ex]) => {
    try {
      localStorage.setItem('al3d_tema', t);
      localStorage.setItem('al3d_pf_rol', r);
      localStorage.setItem('al3d_pf_nombre', 'Beto');
      localStorage.setItem('al3d_pf_ult_export', new Date().toISOString());
      if (pu) localStorage.setItem('al3d_pf_puente', JSON.stringify({ token: 'token-de-prueba' }));
      if (ex) for (const [k, v] of Object.entries(ex)) sessionStorage.setItem(k, v);
    } catch (_) {}
  }, [tema, rol, puente, extra]);
  await ctx.route(/^https?:\/\/(?!al3d\.prueba|127\.0\.0\.1)/, r => {
    if (puente && r.request().url().includes('script.google.com')) return contestarHoja(r);
    return r.abort();
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await p.goto(base + '/' + inicio, { waitUntil: 'load' });
  await p.waitForFunction(() => [...document.querySelectorAll('.pf-mod')].some(s => !s.hidden && s.childNodes.length) && !document.getElementById('pf-arranque'),
    null, { timeout: 30000 });
  await p.waitForTimeout(500);
  return { ctx, p, errores };
}

/* Unos proyectos de verdad en la base, para que la búsqueda tenga qué encontrar. */
const sembrar = p => p.evaluate(async () => {
  const DB = await import('/js/datos/db.js');
  const mk = (id, nombre, folio, etapa, fecha, tel) => ({ id, nombre, folio_local: folio, folio_global: folio + '@X', etapa,
    fecha_ganado: fecha, tel, creado_en: Date.parse(fecha + 'T12:00:00'), contacto: '', negocio: '', notas: '' });
  await DB.poner('proyectos', mk('p1', 'Farmacia Guadalupe — letras 3D', 'COT-0042', 'armado', '2026-09-20', '33 1234 5678'));
  await DB.poner('proyectos', mk('p2', 'Panadería La Espiga', 'COT-0038', 'listo', '2026-09-18', '33 3321 9087'));
  await DB.poner('proyectos', mk('p3', 'Gym Titanio', 'COT-0053', 'ganado', '2026-09-27', '33 2045 6671'));
  await DB.poner('proyectos', mk('p4', 'Café Barrio de Guadalupe', 'COT-0056', 'garantia', '2026-08-01', '33 3812 5590'));
});

const sinDesborde = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/* Animaciones que no acaban, EN REPOSO. Solo cuentan las de lo que esta zona pinta: el botón de la
   IA es la única pieza que se mueve sola y no es de aquí. */
const infinitas = p => p.evaluate(() => document.getAnimations()
  .filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity)
  /* «Cotizar con IA» es la única pieza que se mueve sola, y el fondo de la puerta la única
     excepción aprobada (F10 v2): ni uno ni otro cuentan aquí. */
  .filter(a => { const t = a.effect.target; return !(t && t.closest && t.closest('.pf-ia-btn,.puerta-fondo')); })
  .map(a => (a.animationName || a.transitionProperty || '?') + ' en ' + ((a.effect.target && (a.effect.target.id || a.effect.target.className && a.effect.target.className.baseVal === undefined ? a.effect.target.className : '')) || '?')));
const enPantalla = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const toque = (p, sel) => p.tap(sel);
/* Lo mismo para el aviso de la puerta: durante `ms` anota si el aviso llevó alguna vez la clase de
   la sacudida y con qué animación. La clase se quita sola al terminar la sacudida
   (`animationend`), así que mirarla tiempo después de sucedida no encuentra nada. */
const vigilarAviso = (p, ms) => p.evaluate(m => new Promise(res => {
  const v = { clase: false, anim: '', nodos: 0, ultimo: null };
  const t0 = performance.now();
  const paso = () => {
    const a = document.querySelector('.puerta-aviso');
    if (a && a !== v.ultimo) { v.ultimo = a; v.nodos++; }
    if (a && a.classList.contains('otra-vez')) { v.clase = true; v.anim = getComputedStyle(a).animationName; }
    if (performance.now() - t0 < m) requestAnimationFrame(paso); else { v.ultimo = null; res(v); }
  };
  requestAnimationFrame(paso);
}), ms);
/* Anota, cuadro a cuadro durante un segundo, lo que pasa en un viaje de pantalla: si la ficha
   de la marca existió alguna vez, qué dirección tuvo `html` y con qué animación entró la
   sección. Se arranca ANTES del toque y se lee después. Mirar a los 40 ms con un reloj fijo era
   frágil: la ficha nace en el cuadro siguiente al cambio de pestaña, y con la máquina ocupada
   ese cuadro llega tarde. */
const vigilarViaje = p => p.evaluate(() => new Promise(res => {
  const v = { ficha: false, clases: '', anims: [] };
  const t0 = performance.now();
  const paso = () => {
    if (document.querySelector('.ficha-viaja')) v.ficha = true;
    const c = document.documentElement.className;
    if (/va-(adelante|atras)/.test(c)) {
      v.clases = v.clases || c;
      for (const s of document.querySelectorAll('.pf-mod:not([hidden])')) {
        const a = getComputedStyle(s).animationName;
        if (!v.anims.includes(a)) v.anims.push(a);
      }
    }
    if (performance.now() - t0 < 1000) requestAnimationFrame(paso); else res(v);
  };
  requestAnimationFrame(paso);
}));

/* Contraste medido sobre el render: el fondo es lo que de verdad hay debajo, con las capas semi
   transparentes mezcladas de abajo hacia arriba. */
const contraste = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s); if (!el) return null;
  const num = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const v = m[1].split(',').map(x => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const capas = []; for (let e = el; e; e = e.parentElement) { const c = num(getComputedStyle(e).backgroundColor); if (c && c.a > 0) capas.push(c); if (c && c.a === 1) break; }
  let f = capas.length && capas[capas.length - 1].a === 1 ? capas.pop() : { r: 255, g: 255, b: 255, a: 1 };
  while (capas.length) { const c = capas.pop(); f = { r: c.r * c.a + f.r * (1 - c.a), g: c.g * c.a + f.g * (1 - c.a), b: c.b * c.a + f.b * (1 - c.a), a: 1 }; }
  const t = num(getComputedStyle(el).color);
  const L = ({ r, g, b }) => { const q = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * q(r) + .7152 * q(g) + .0722 * q(b); };
  const a = L(f), b = L(t), hi = Math.max(a, b), lo = Math.min(a, b);
  return { ratio: Math.round(((hi + .05) / (lo + .05)) * 100) / 100, texto: getComputedStyle(el).color, fondo: `rgb(${Math.round(f.r)},${Math.round(f.g)},${Math.round(f.b)})` };
}, sel);

/* ==========================================================================================
   LAS RONDAS DEL TELÉFONO
   ========================================================================================== */
async function rondaTelefono({ ancho, tema, reducido }) {
  const nombre = ancho + ' px · ' + tema + ' · ' + (reducido ? 'menos movimiento' : 'con movimiento');
  console.log('\n══ EL TELÉFONO A ' + nombre.toUpperCase() + ' ══');
  const { ctx, p, errores } = await abrir({ ancho, tema, reducido });
  const ev = (f, a) => p.evaluate(f, a);
  await sembrar(p);

  /* ---------------- el encabezado ---------------- */
  console.log('\nEL ENCABEZADO: LUPA, SINCRONIZACIÓN Y CUENTA');
  {
    const lupa = await enPantalla(p, '#pf-cab-buscar');
    cierto(lupa && lupa.w >= 44 && lupa.h >= 44, 'la lupa mide 44 px con el dedo', lupa);
    const t = await ev(() => { const e = document.getElementById('pf-sub'); return { corta: e.scrollWidth > e.clientWidth, txt: e.textContent }; });
    cierto(!t.corta, 'el título «' + t.txt + '» se lee entero junto a la lupa', t);
    cierto(await sinDesborde(p), 'sin desborde de lado');
    const largos = await ev(() => {
      const e = document.getElementById('pf-sub'), fuera = [];
      for (const n of ['Calendario', 'Proyectos', 'Cotizador', 'Material']) { e.textContent = n; if (e.scrollWidth > e.clientWidth) fuera.push(n); }
      e.textContent = 'Tablero';
      return fuera;
    });
    cierto(!largos.length, 'y los nombres largos de la barra tampoco se cortan: Calendario, Proyectos, Cotizador, Material', largos);
    const hijos = await ev(() => [...document.querySelectorAll('.pf-cab > button')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect()).map(r => ({ w: Math.round(r.width), h: Math.round(r.height) })));
    cierto(hijos.every(h => h.w >= 44 && h.h >= 44), 'todos los botones del encabezado miden 44 px con el dedo', hijos);
  }

  /* ---------------- la barra ---------------- */
  console.log('\nLA BARRA DE ABAJO: CINCO BOTONES, Y LA QUINTA ES «MÁS»');
  const app = () => p.evaluate(() => import('/js/app.js').then(() => true));
  await app();
  {
    const b = await ev(() => [...document.querySelectorAll('#pf-abajo > button')].map(x => ({ t: x.textContent.trim().replace(/[0-9]/g, ''), mas: x.hasAttribute('data-mas'), on: x.classList.contains('on'), w: Math.round(x.getBoundingClientRect().width), h: Math.round(x.getBoundingClientRect().height) })));
    cierto(b.length === 5, 'son cinco botones: ' + b.map(x => x.t).join(' · '), b);
    cierto(b[4] && b[4].mas && b[4].t === 'Más', 'el quinto es «Más»');
    cierto(b.every(x => x.h >= 44 && x.w >= 60), 'ninguno baja de 44 px de alto ni de 60 de ancho (a 360 px la barra reparte lo que hay)', b);
    cierto(b[0].on && b.filter(x => x.on).length === 1, 'solo el Tablero está encendido');
    const nombres = await ev(() => [...document.querySelectorAll('#pf-abajo > button:not([data-mas])')].map(x => x.textContent.trim().replace(/[0-9]/g, '')));
    cierto(nombres.join() === 'Tablero,Calendario,Proyectos,Cotizador', 'los nombres son los de RUTAS —Tablero, no «Hoy»—', nombres);
    cierto(await sinDesborde(p), 'sin desborde de lado');
  }

  /* ---- los globos: «Más» suma, y salta solo si sube ---- */
  console.log('\nLOS GLOBOS DE LA BARRA');
  {
    await ev(async () => { const a = await import('/js/app.js'); a.ponerCuenta('material', 3); a.ponerCuenta('mapa', 2); });
    await p.waitForTimeout(700);
    const g = await ev(() => {
      const mas = document.querySelector('#pf-abajo [data-cta-mas]');
      return { mas: mas.textContent, visible: !mas.hidden, etiqueta: document.querySelector('#pf-abajo [data-mas]').getAttribute('aria-label'), ariaOculto: mas.getAttribute('aria-hidden') };
    });
    cierto(g.visible && g.mas === '5', '«Más» suma lo que esconde: Material 3 + Mapa 2 = 5', g);
    cierto(/5 cosas que atender/.test(g.etiqueta) && g.ariaOculto === 'true', '  y el botón lo dice con palabras, porque el globo es adorno', g);
    await ev(async () => { const a = await import('/js/app.js'); a.ponerCuenta('material', 4); });
    await p.waitForTimeout(60);
    const sube = await ev(() => { const e = document.querySelector('#pf-abajo [data-cta-mas]'); return { clase: e.classList.contains('sube'), anim: getComputedStyle(e).animationName, txt: e.textContent }; });
    cierto(sube.txt === '6', 'al subir, la suma sigue: 6', sube);
    if (reducido) cierto(sube.anim === 'none', 'con menos movimiento el globo no salta', sube);
    else cierto(sube.clase && /globo-sube/.test(sube.anim), 'y el globo salta una vez (' + sube.anim + ')', sube);
    await p.waitForTimeout(700);
    cierto(await ev(() => !document.querySelector('.cta.sube')), 'y el salto se quita solo: la clase no se queda pegada');
    await ev(async () => { const a = await import('/js/app.js'); a.ponerCuenta('material', 1); });
    await p.waitForTimeout(60);
    cierto(await ev(() => !document.querySelector('.cta.sube')), 'cuando la cuenta BAJA no salta nada');
    const cont = await contraste(p, '#pf-abajo [data-cta-mas]');
    cierto(cont && cont.ratio >= 4.5, 'el número del globo lee a ' + (cont && cont.ratio) + ':1 (mínimo 4,5)', cont);
    await ev(async () => { const a = await import('/js/app.js'); a.ponerCuenta('material', 0); a.ponerCuenta('mapa', 0); });
  }

  /* ---- la marca se desliza: la barra se pinta UNA vez ---- */
  console.log('\nLA MARCA SE DESLIZA Y LA PANTALLA ENTRA POR SU LADO');
  {
    await ev(() => { window.__tablero = document.querySelector('#pf-abajo [data-ruta="hoy"]'); window.__cal = document.querySelector('#pf-abajo [data-ruta="agenda"]'); });
    const viajeIda = vigilarViaje(p);
    await toque(p, '#pf-abajo [data-ruta="agenda"]');
    const v = await viajeIda;
    if (reducido) {
      cierto(!v.ficha, 'con menos movimiento no viaja ninguna ficha', v);
      cierto(!v.anims.some(a => /entra-(der|izq)/.test(a)), 'y la pantalla no se desplaza al entrar (a lo más el fundido de siempre: ' + (v.anims.join() || 'nada') + ')', v);
    } else {
      cierto(v.ficha, 'la píldora del icono VIAJA de Tablero a Calendario', v);
      cierto(/va-adelante/.test(v.clases) && v.anims.includes('pf-entra-der'), 'Calendario está después: entra desde la derecha (' + v.anims.join() + ')', v);
    }
    await p.waitForTimeout(300);
    const d = await ev(() => ({
      mismo: document.querySelector('#pf-abajo [data-ruta="hoy"]') === window.__tablero && document.querySelector('#pf-abajo [data-ruta="agenda"]') === window.__cal,
      on: [...document.querySelectorAll('#pf-abajo > button.on')].map(b => b.dataset.ruta || 'mas'),
      actual: [...document.querySelectorAll('#pf-abajo [aria-current="page"]')].map(b => b.dataset.ruta),
      restos: document.querySelectorAll('.ficha-viaja,.ficha-destino').length,
      clases: document.documentElement.className,
    }));
    cierto(d.mismo, 'la barra NO se reescribió: son los mismos nodos de antes (por eso la marca puede deslizarse)', d);
    cierto(d.on.join() === 'agenda' && d.actual.join() === 'agenda', 'y solo Calendario queda encendido, con aria-current', d);
    cierto(d.restos === 0, 'al llegar no queda nada de la ficha', d);
    cierto(!/va-(adelante|atras)/.test(d.clases), 'la dirección se quita al terminar la entrada: la siguiente sincronización no la hereda', d);
    /* De vuelta, del otro lado. */
    const viajeVuelta = vigilarViaje(p);
    await toque(p, '#pf-abajo [data-ruta="hoy"]');
    const a = await viajeVuelta;
    if (!reducido) cierto(/va-atras/.test(a.clases) && a.anims.includes('pf-entra-izq'), 'de vuelta a Tablero entra desde la izquierda (' + a.anims.join() + ')', a);
    else cierto(!a.anims.some(x => /entra-(der|izq)/.test(x)), 'y de vuelta tampoco se desplaza', a);
    /* Una pantalla oculta —Ajustes— no tiene lado. */
    await toque(p, '#pf-cab-ajustes');
    await p.waitForTimeout(40);
    const o = await ev(() => document.documentElement.className);
    cierto(!/va-(adelante|atras)/.test(o), 'Ajustes es «de adentro»: no entra de lado', o);
    await p.waitForTimeout(700);
    await toque(p, '#pf-abajo [data-ruta="hoy"]');
    await p.waitForTimeout(500);
    cierto(await sinDesborde(p), 'sin desborde de lado durante y después del viaje');
  }

  /* ---------------- «Más» ---------------- */
  console.log('\n«MÁS»: LA HOJA CON LO DEMÁS');
  {
    await ev(async () => { const a = await import('/js/app.js'); a.ponerCuenta('material', 3); });
    await toque(p, '#pf-abajo [data-mas]');
    await p.waitForTimeout(600);
    const h = await ev(() => {
      const capa = document.getElementById('pf-mas');
      return { abierta: capa.classList.contains('show'), expandido: document.querySelector('#pf-abajo [data-mas]').getAttribute('aria-expanded'),
        rotulo: capa.getAttribute('aria-labelledby'), titulo: document.getElementById('pf-mas-t') && document.getElementById('pf-mas-t').textContent,
        filas: [...capa.querySelectorAll('.pf-mas-op')].map(b => ({ ruta: b.dataset.ruta, n: b.querySelector('.pf-mas-n').textContent, cta: (b.querySelector('.cta') || {}).textContent || '', h: Math.round(b.getBoundingClientRect().height) })),
        foco: document.activeElement && document.activeElement.closest('#pf-mas') ? 'dentro' : 'fuera' };
    });
    cierto(h.abierta && h.expandido === 'true', 'tocar «Más» abre la hoja, con aria-expanded', h);
    cierto(h.filas.map(f => f.n).join() === 'Material,Mapa,Mesa de corte,Vectorizador,Publicaciones,Control', 'lleva las rutas del rol que NO están abajo, con los nombres de RUTAS: ' + h.filas.map(f => f.n).join(' · '), h.filas);
    cierto(h.filas.every(f => f.h >= 44), 'cada fila mide al menos 44 px', h.filas.map(f => f.h));
    cierto(h.filas[0].cta === '3', 'Material trae su globo: 3', h.filas[0]);
    cierto(h.foco === 'dentro' && /Más módulos/.test(h.titulo || ''), 'el foco entra a la hoja, que se llama «Más módulos»', h);
    cierto(await sinDesborde(p), 'sin desborde de lado con la hoja abierta');
    const c1 = await contraste(p, '.pf-mas-op .cta'), c2 = await contraste(p, '.pf-mas-d');
    cierto(c1 && c1.ratio >= 4.5, 'el globo de la fila lee a ' + (c1 && c1.ratio) + ':1', c1);
    cierto(c2 && c2.ratio >= 4.5, 'y la línea de cada fila a ' + (c2 && c2.ratio) + ':1', c2);
    /* El cerco del tabulador: da la vuelta dentro de la hoja. */
    await p.keyboard.press('Shift+Tab');
    cierto(await ev(() => !!document.activeElement.closest('#pf-mas')), 'con el teclado, el tabulador no se escapa de la hoja');
    /* Escape. */
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    const e = await ev(() => ({ abierta: document.getElementById('pf-mas').classList.contains('show'), foco: document.activeElement && document.activeElement.hasAttribute('data-mas'), expandido: document.querySelector('#pf-abajo [data-mas]').getAttribute('aria-expanded'), inerte: document.getElementById('pf-abajo').inert }));
    cierto(!e.abierta && e.expandido === 'false' && !e.inerte, 'Escape la cierra y devuelve la barra', e);
    cierto(e.foco, 'y el foco vuelve a «Más»', e);
    /* El atrás del teléfono. */
    await toque(p, '#pf-abajo [data-mas]');
    await p.waitForTimeout(500);
    await p.goBack();
    await p.waitForTimeout(600);
    const at = await ev(() => ({ abierta: document.getElementById('pf-mas').classList.contains('show'), hash: location.hash }));
    cierto(!at.abierta && /hoy|^$/.test(at.hash.replace('#/', '')), 'el atrás del teléfono la cierra y no saca de la pantalla', at);
    /* Elegir una. */
    await toque(p, '#pf-abajo [data-mas]');
    await p.waitForTimeout(500);
    await toque(p, '#pf-mas [data-ruta="mapa"]');
    await p.waitForTimeout(1200);
    const el = await ev(() => ({ hash: location.hash, abierta: document.getElementById('pf-mas').classList.contains('show'),
      mapa: !document.getElementById('mod-mapa').hidden, masOn: document.querySelector('#pf-abajo [data-mas]').classList.contains('on'),
      masActual: document.querySelector('#pf-abajo [data-mas]').getAttribute('aria-current'), otros: document.querySelectorAll('#pf-abajo > button.on:not([data-mas])').length,
      titulo: document.getElementById('pf-sub').textContent }));
    cierto(el.hash === '#/mapa' && el.mapa && !el.abierta, 'elegir «Mapa» cierra la hoja y navega a #/mapa: la navegación no se pierde', el);
    cierto(el.masOn && el.masActual === 'true' && el.otros === 0, 'y «Más» queda encendido, porque el Mapa vive ahí: la barra no se queda entera apagada', el);
    /* Elegir la que ya estás mirando solo cierra. */
    await toque(p, '#pf-abajo [data-mas]');
    await p.waitForTimeout(500);
    const antes = await ev(() => document.getElementById('mod-mapa').childNodes.length);
    await ev(() => { window.__mapaNodo = document.getElementById('mod-mapa').firstElementChild; });
    await toque(p, '#pf-mas [data-ruta="mapa"]');
    await p.waitForTimeout(900);
    cierto(await ev(() => !document.getElementById('pf-mas').classList.contains('show') && document.getElementById('mod-mapa').firstElementChild === window.__mapaNodo),
      'elegir la pantalla en que ya estás solo cierra la hoja: no la vuelve a montar');
    await toque(p, '#pf-abajo [data-ruta="hoy"]');
    await p.waitForTimeout(800);
    cierto(await ev(() => !document.querySelector('#pf-abajo [data-mas]').classList.contains('on')), 'al volver al Tablero «Más» se apaga');
    await ev(async () => { const a = await import('/js/app.js'); a.ponerCuenta('material', 0); });
  }

  /* ---------------- la búsqueda ---------------- */
  console.log('\nBUSCAR UN PROYECTO DESDE CUALQUIER PANTALLA');
  {
    await toque(p, '#pf-cab-buscar');
    await p.waitForTimeout(600);
    const a = await ev(() => { const c = document.getElementById('pf-buscar'), q = document.getElementById('pf-buscar-q');
      return { abierta: c.classList.contains('show'), foco: document.activeElement === q, rol: q.getAttribute('role'), etiqueta: q.getAttribute('aria-label'),
        cuenta: document.getElementById('pf-buscar-cuenta').textContent, n: document.querySelectorAll('.pf-buscar-op').length,
        primero: (document.querySelector('.pf-buscar-op') || {}).textContent, sel: document.querySelector('.pf-buscar-op[aria-selected="true"]') !== null,
        cabeza: !!c.querySelector('.pf-panel-h .pf-buscar-q'), alto: Math.round(c.querySelector('.pf-panel').getBoundingClientRect().height), vis: window.innerHeight }; });
    cierto(a.abierta && a.foco && a.rol === 'combobox', 'la lupa abre la paleta, con el foco en el campo', a);
    cierto(a.cuenta === 'Los últimos que se ganaron' && a.n === 4 && a.sel, 'sin escribir muestra lo último que se ganó (4), con el primero elegido', a);
    cierto(/Gym Titanio/.test(a.primero || '') && /COT-0053/.test(a.primero), '  y el más reciente va primero, con su folio', a.primero);
    cierto(a.cabeza, 'el campo vive en la cabeza de la hoja: se baja con el dedo desde su asa como las demás', a);
    cierto(ancho > 560 || a.alto >= a.vis - 60, 'en el teléfono la hoja es alta, para que el campo no quede detrás del teclado (' + a.alto + ' de ' + a.vis + ')', a);
    cierto(await sinDesborde(p), 'sin desborde de lado');
    /* escribir */
    await p.keyboard.type('guada');
    await p.waitForTimeout(450);
    const g = await ev(() => ({ cuenta: document.getElementById('pf-buscar-cuenta').textContent, ops: [...document.querySelectorAll('.pf-buscar-op')].map(o => o.querySelector('.pf-buscar-n').textContent),
      marcas: [...document.querySelectorAll('.pf-buscar-op mark.coincide')].map(m => m.textContent) }));
    cierto(g.ops.length === 2 && g.cuenta === '2 proyectos', '«guada» encuentra dos proyectos: ' + g.ops.join(' | '), g);
    cierto(g.marcas.length >= 2 && g.marcas.every(m => m.toLowerCase() === 'guada'), 'y marca la coincidencia en cada uno', g.marcas);
    const cm = await contraste(p, '.pf-buscar-op[aria-selected="true"] mark.coincide');
    cierto(cm && cm.ratio >= 4.5, 'la marca sobre el renglón elegido lee a ' + (cm && cm.ratio) + ':1', cm);
    const cs = await contraste(p, '.pf-buscar-op .pf-buscar-m');
    cierto(cs && cs.ratio >= 4.5, 'el folio y la fecha leen a ' + (cs && cs.ratio) + ':1', cs);
    /* sin acentos */
    await p.fill('#pf-buscar-q', 'panaderia');
    await p.waitForTimeout(450);
    const s = await ev(() => ({ n: document.querySelectorAll('.pf-buscar-op').length, marca: (document.querySelector('.pf-buscar-op mark.coincide') || {}).textContent }));
    cierto(s.n === 1 && s.marca === 'Panadería', '«panaderia» sin acento encuentra y marca «Panadería» entera', s);
    /* folio */
    await p.fill('#pf-buscar-q', '0042');
    await p.waitForTimeout(450);
    const f = await ev(() => ({ ops: [...document.querySelectorAll('.pf-buscar-op')].map(o => o.querySelector('.pf-buscar-n').textContent), marca: [...document.querySelectorAll('.pf-buscar-op mark.coincide')].map(m => m.textContent) }));
    cierto(f.ops.length === 1 && /Farmacia/.test(f.ops[0]) && f.marca.includes('0042'), 'el folio «0042» encuentra su proyecto y marca los dígitos', f);
    /* nada */
    await p.fill('#pf-buscar-q', 'zzzz');
    await p.waitForTimeout(450);
    const n = await ev(() => ({ cuenta: document.getElementById('pf-buscar-cuenta').textContent, ops: document.querySelectorAll('.pf-buscar-op').length, activo: document.getElementById('pf-buscar-q').hasAttribute('aria-activedescendant') }));
    cierto(n.ops === 0 && /Nada con «zzzz»/.test(n.cuenta) && !n.activo, 'sin resultados lo dice, y ofrece por dónde probar', n);
    /* flechas y Enter */
    await p.fill('#pf-buscar-q', 'guada');
    await p.waitForTimeout(450);
    await p.keyboard.press('ArrowDown');
    const w = await ev(() => ({ sel: [...document.querySelectorAll('.pf-buscar-op')].findIndex(o => o.getAttribute('aria-selected') === 'true'), ad: document.getElementById('pf-buscar-q').getAttribute('aria-activedescendant') }));
    cierto(w.sel === 1 && w.ad === 'pf-buscar-o1', 'la flecha abajo elige el segundo y lo dice con aria-activedescendant', w);
    await p.keyboard.press('ArrowDown');
    cierto(await ev(() => document.querySelector('.pf-buscar-op[aria-selected="true"]').dataset.i === '0'), 'y da la vuelta al llegar al final');
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(1500);
    const ab = await ev(() => ({ hash: location.hash, ficha: document.getElementById('pf-ficha').classList.contains('show'), buscar: document.getElementById('pf-buscar').classList.contains('show'),
      titulo: (document.querySelector('#pf-ficha .pf-panel-h h2') || {}).textContent }));
    cierto(ab.hash === '#/proyectos' && ab.ficha && !ab.buscar, 'Enter abre la ficha del elegido en Proyectos: la navegación no se pierde', ab);
    cierto(/Café Barrio de Guadalupe/.test(ab.titulo || ''), '  y es la del proyecto que estaba elegido (el segundo, tras subir de vuelta): «' + ab.titulo + '»', ab);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    /* un toque en un resultado */
    await toque(p, '#pf-cab-buscar');
    await p.waitForTimeout(500);
    await p.fill('#pf-buscar-q', 'gym');
    await p.waitForTimeout(450);
    await p.tap('.pf-buscar-op');
    await p.waitForTimeout(1500);
    cierto(await ev(() => document.getElementById('pf-ficha').classList.contains('show') && /Gym Titanio/.test(document.querySelector('#pf-ficha .pf-panel-h h2').textContent)), 'tocar un resultado abre esa ficha');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    /* Escape y foco */
    await toque(p, '#pf-cab-buscar');
    await p.waitForTimeout(500);
    await p.keyboard.type('algo');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    const es = await ev(() => ({ abierta: document.getElementById('pf-buscar').classList.contains('show'), foco: document.activeElement && document.activeElement.id }));
    cierto(!es.abierta && es.foco === 'pf-cab-buscar', 'Escape cierra AUNQUE haya texto (el navegador solo vaciaba el campo) y devuelve el foco a la lupa', es);
    /* el atrás */
    await toque(p, '#pf-cab-buscar');
    await p.waitForTimeout(500);
    await p.goBack();
    await p.waitForTimeout(600);
    cierto(await ev(() => !document.getElementById('pf-buscar').classList.contains('show')), 'el atrás del teléfono cierra la paleta');
    cierto(!(await infinitas(p)).length, 'nada se mueve en reposo', await infinitas(p));
  }

  /* ---------------- la cuenta ---------------- */
  console.log('\nEL MENÚ DE LA CUENTA SALE DE SU BOTÓN');
  {
    await toque(p, '#pf-sesion');
    await p.waitForTimeout(500);
    const m = await ev(() => { const pop = document.querySelector('.pf-sesion-vz'); const r = pop && pop.getBoundingClientRect();
      return { abierto: !!pop && pop.matches(':popover-open'), rol: pop && pop.getAttribute('role'), etiqueta: pop && pop.getAttribute('aria-label'), expandido: document.getElementById('pf-sesion').getAttribute('aria-expanded'),
        dentro: r ? r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight : null,
        botones: pop ? [...pop.querySelectorAll('button')].map(b => ({ t: b.textContent, h: Math.round(b.getBoundingClientRect().height), rol: b.getAttribute('role') })) : [],
        foco: pop && pop.contains(document.activeElement), viejo: !!document.getElementById('pf-sesion-menu') }; });
    cierto(m.abierto && m.expandido === 'true' && m.rol === 'dialog' && m.etiqueta === 'Tu cuenta', 'tocar el disco abre su globo, con rol de diálogo y nombre', m);
    cierto(m.dentro, 'y cabe en la pantalla, sin salirse por ningún lado', m);
    cierto(m.botones.length === 2 && m.botones.every(b => b.h >= 44 && !b.rol), 'lleva sus dos botones, de 44 px, sin fingirse elementos de menú', m.botones);
    cierto(m.foco && !m.viejo, 'el foco entra al globo, y el <div role=menu> de antes ya no existe', m);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    const e = await ev(() => ({ abierto: document.querySelector('.pf-sesion-vz').matches(':popover-open'), foco: document.activeElement.id, expandido: document.getElementById('pf-sesion').getAttribute('aria-expanded') }));
    cierto(!e.abierto && e.foco === 'pf-sesion' && e.expandido === 'false', 'Escape lo cierra y devuelve el foco al disco', e);
    await toque(p, '#pf-sesion');
    await p.waitForTimeout(400);
    await p.tap('#pf-contenido', { position: { x: 20, y: 300 }, force: true });
    await p.waitForTimeout(400);
    cierto(await ev(() => !document.querySelector('.pf-sesion-vz').matches(':popover-open')), 'tocar fuera lo cierra');
    /* Cerrar sesión pasa por la pregunta de siempre, con el globo ya cerrado. */
    await toque(p, '#pf-sesion');
    await p.waitForTimeout(400);
    await p.tap('.pf-sesion-vz [data-cuenta="salir"]');
    await p.waitForTimeout(600);
    const q = await ev(() => ({ globo: document.querySelector('.pf-sesion-vz').matches(':popover-open'), pregunta: document.getElementById('pf-confirma') && document.getElementById('pf-confirma').classList.contains('show') }));
    cierto(!q.globo && q.pregunta, '«Cerrar sesión» cierra el globo y pregunta con confirmarPf', q);
    await p.tap('#pf-confirma-no');
    await p.waitForTimeout(500);
    /* Ajustes */
    await toque(p, '#pf-sesion');
    await p.waitForTimeout(400);
    await p.tap('.pf-sesion-vz [data-cuenta="ajustes"]');
    await p.waitForTimeout(1000);
    cierto(await ev(() => location.hash === '#/ajustes'), '«Ajustes» lleva a #/ajustes');
    await toque(p, '#pf-abajo [data-ruta="hoy"]');
    await p.waitForTimeout(800);
    cierto(await sinDesborde(p), 'sin desborde de lado');
  }

  /* ---------------- la banda ---------------- */
  console.log('\nLA BANDA DE AVISO ENTRA SIN EMPUJAR');
  {
    /* Una pantalla lo bastante alta para poder bajar, con una marca a la que mirarle el lugar. */
    await ev(() => {
      const r = document.createElement('div'); r.id = 'pf-sonda'; r.style.cssText = 'height:2600px;pointer-events:none';
      const m = document.createElement('div'); m.id = 'pf-marca-sonda'; m.style.cssText = 'height:24px;background:transparent';
      document.getElementById('pf-contenido').append(m, r);
      window.scrollTo(0, 400);
    });
    await p.waitForTimeout(300);
    const y0 = await ev(() => document.getElementById('pf-marca-sonda').getBoundingClientRect().top);
    const muestrear = () => ev(() => new Promise(res => {
      const ini = document.getElementById('pf-marca-sonda').getBoundingClientRect().top, xs = [];
      const t0 = performance.now();
      /* Además del desvío se anota el scroll y la altura de la caja: cuando esto falle, la
         diferencia entre «Chrome compensó y yo también» y «nadie compensó» se lee en esas dos. */
      const paso = () => { xs.push(document.getElementById('pf-marca-sonda').getBoundingClientRect().top - ini); (window.__rastro = window.__rastro || []).push([Math.round(performance.now() - t0), Math.round(scrollY), Math.round(document.getElementById('pf-banda-caja').getBoundingClientRect().height)]); if (performance.now() - t0 < 520) requestAnimationFrame(paso); else res(xs); };
      window.__rastro = [];
      requestAnimationFrame(paso);
    }));
    /* Se abre. */
    const abriendo = muestrear();
    await ev(async () => { const a = await import('/js/app.js'); a.pintarBanda({ texto: 'Hay una versión nueva de la app. Se pone sola en cuanto cambies de pantalla, o ahora:', accion: { label: 'Recargar', fn: () => {} } }); });
    const xs = await abriendo;
    const desvio = Math.max(...xs.map(Math.abs));
    cierto(desvio <= 3, 'lo que se estaba leyendo NO se mueve mientras la banda se despliega (desvío máximo ' + desvio.toFixed(1) + ' px en ' + xs.length + ' cuadros)', await ev(() => window.__rastro.filter((_, i) => i % 4 === 0)));
    const b = await ev(() => { const c = document.getElementById('pf-banda-caja'), b = document.getElementById('pf-banda'); return { abierta: c.classList.contains('abierta'), alto: Math.round(c.getBoundingClientRect().height), hidden: b.hidden, tx: b.textContent.slice(0, 20), dur: getComputedStyle(c).transitionDuration, ariaVivo: b.getAttribute('aria-live'), rol: b.getAttribute('role') }; });
    cierto(b.abierta && b.alto > 40 && !b.hidden, 'la banda quedó desplegada (' + b.alto + ' px)', b);
    cierto(reducido ? b.dur === '0s' : b.dur !== '0s', reducido ? 'con menos movimiento aparece sin desplegarse' : 'y se desplegó con transición (' + b.dur + ')', b);
    cierto(b.ariaVivo === 'polite' && b.rol === 'status', 'sigue siendo una región viva, cortés', b);
    cierto(await sinDesborde(p), 'sin desborde de lado con la banda puesta');
    const cb = await contraste(p, '#pf-banda span');
    cierto(cb && cb.ratio >= 4.5, 'el texto de la banda lee a ' + (cb && cb.ratio) + ':1', cb);
    /* Cambiar el texto de una banda que ya estaba no la vuelve a mover. */
    const cambiando = muestrear();
    await ev(async () => { const a = await import('/js/app.js'); a.pintarBanda({ texto: 'Otra cosa que decir, más corta.' }); });
    const ys = await cambiando;
    cierto(Math.max(...ys.map(Math.abs)) <= 3, 'decir otra cosa en una banda ya puesta no mueve la pantalla');
    /* Se recoge. */
    const recogiendo = muestrear();
    await ev(async () => { const a = await import('/js/app.js'); a.pintarBanda(null); });
    const zs = await recogiendo;
    cierto(Math.max(...zs.map(Math.abs)) <= 3, 'y al recogerse tampoco: el contenido se queda bajo el mismo dedo (desvío ' + Math.max(...zs.map(Math.abs)).toFixed(1) + ' px)', zs.slice(0, 30));
    await p.waitForTimeout(400);
    const r = await ev(() => ({ alto: document.getElementById('pf-banda-caja').getBoundingClientRect().height, tx: document.getElementById('pf-banda').innerHTML, y: document.getElementById('pf-marca-sonda').getBoundingClientRect().top }));
    cierto(r.alto === 0 && r.tx === '', 'recogida no mide ni un píxel y su texto ya se vació', r);
    await ev(() => { document.getElementById('pf-sonda').remove(); document.getElementById('pf-marca-sonda').remove(); window.scrollTo(0, 0); });
    /* Arriba del todo no hay nada que compensar, y no debe haber scroll de más. */
    await ev(async () => { const a = await import('/js/app.js'); a.pintarBanda({ texto: 'Un aviso.' }); });
    await p.waitForTimeout(400);
    cierto(await ev(() => window.scrollY === 0), 'arriba del todo la banda crece hacia abajo y el scroll no se toca');
    await ev(async () => { const a = await import('/js/app.js'); a.pintarBanda(null); });
    await p.waitForTimeout(400);
    cierto(!(await infinitas(p)).length, 'nada se mueve en reposo', await infinitas(p));
  }

  cierto(errores.length === 0, 'cero errores de página a ' + nombre, errores);
  await ctx.close();
}

/* Para depurar una sola ronda:  SOLO=360-claro-n  (n = con movimiento, r = reducido). Con SOLO
   puesto solo corren las rondas del teléfono que coincidan. */
const SOLO = (process.env.SOLO || '').split(',').filter(Boolean);
for (const tema of ['claro', 'oscuro']) {
  for (const ancho of [360, 420]) {
    for (const reducido of [false, true]) {
      if (SOLO.length && !SOLO.includes(ancho + '-' + tema + '-' + (reducido ? 'r' : 'n'))) continue;
      await rondaTelefono({ ancho, tema, reducido });
    }
  }
}
if (SOLO.length) { await nav.close(); console.log('\n' + (fallos ? fallos + ' fallo(s) en las rondas pedidas.' : 'Las rondas pedidas, sin fallos.')); process.exit(fallos ? 1 : 0); }

/* ==========================================================================================
   EL ROL DE PAGOS Y EL DE FABRICACIÓN
   ========================================================================================== */
console.log('\n══ LA BARRA SEGÚN EL ROL ══');
{
  const pa = await abrir({ rol: 'pagos' });
  const a = await pa.p.evaluate(() => ({ botones: [...document.querySelectorAll('#pf-abajo > button')].map(b => b.textContent.trim().replace(/[0-9]/g, '')), mas: !!document.querySelector('#pf-abajo [data-mas]') }));
  cierto(a.botones.join() === 'Tablero,Calendario,Proyectos,Cotizador,Control' && !a.mas, 'pagos: cinco botones y Control entre ellos —es SU pantalla—, sin «Más»', a);
  cierto(pa.errores.length === 0, 'cero errores de página', pa.errores);
  await pa.ctx.close();

  const fa = await abrir({ rol: 'fabricacion' });
  await sembrar(fa.p);
  await fa.p.tap('#pf-abajo [data-mas]');
  await fa.p.waitForTimeout(500);
  const f = await fa.p.evaluate(() => [...document.querySelectorAll('#pf-mas .pf-mas-n')].map(x => x.textContent));
  cierto(f.join() === 'Material,Mapa,Mesa de corte,Vectorizador', 'fabricación: «Más» no trae Control, que no ve importes: ' + f.join(' · '), f);
  await fa.p.keyboard.press('Escape');
  await fa.p.waitForTimeout(400);
  await fa.p.tap('#pf-cab-buscar');
  await fa.p.waitForTimeout(500);
  await fa.p.keyboard.type('farmacia');
  await fa.p.waitForTimeout(450);
  const txt = await fa.p.evaluate(() => document.getElementById('pf-buscar-lista').textContent);
  cierto(/Farmacia Guadalupe/.test(txt) && !/\$/.test(txt) && !/\d,\d{3}/.test(txt), 'la búsqueda de fabricación no enseña un solo importe', txt);
  cierto(fa.errores.length === 0, 'cero errores de página', fa.errores);
  await fa.ctx.close();
}

/* ==========================================================================================
   EL ESCRITORIO: RATÓN Y TECLADO
   ========================================================================================== */
for (const tema of ['claro', 'oscuro']) {
  console.log('\n══ EL ESCRITORIO A 1280 PX · ' + tema.toUpperCase() + ' · RATÓN Y TECLADO ══');
  const { ctx, p, errores } = await abrir({ ancho: 1280, alto: 800, tema, tactil: false });
  const ev = (f, a) => p.evaluate(f, a);
  await sembrar(p);
  cierto(!(await ev(() => !!document.querySelector('#pf-abajo') && getComputedStyle(document.getElementById('pf-abajo')).display !== 'none')), 'la barra de abajo no existe con ratón: manda la lateral');
  const lat = await ev(() => ({ n: document.querySelectorAll('#pf-nav .pf-tab').length, teclas: [...document.querySelectorAll('#pf-nav .pf-tab')].map(t => t.dataset.tecla).join('') }));
  cierto(lat.n === 10 && lat.teclas === '123456789', 'la barra lateral lleva las diez pestañas, las nueve primeras con su tecla (Publicaciones, la décima, no tiene)', lat);
  cierto(await sinDesborde(p), 'sin desborde de lado');
  /* P31: el nombre con su tecla. */
  await p.hover('#pf-nav .pf-tab[data-ruta="agenda"]');
  await p.waitForTimeout(700);
  const tip = await ev(() => { const t = document.querySelector('.nombre-tip'); return t ? { abierto: t.matches(':popover-open'), txt: t.textContent, kbd: (t.querySelector('kbd') || {}).textContent, oculto: t.getAttribute('aria-hidden') } : null; });
  cierto(tip && tip.abierto && tip.kbd === '2' && /Calendario/.test(tip.txt), 'el ratón sobre «Calendario» enseña su nombre con la tecla 2 en <kbd>', tip);
  cierto(tip && tip.oculto === 'true', 'y el globo es adorno para el lector: el nombre ya está en el botón', tip);
  const titulo = await ev(() => document.querySelector('#pf-nav .pf-tab[data-ruta="agenda"]').hasAttribute('title'));
  cierto(!titulo, 'mientras el globo está, el `title` nativo se aparta para que no se encimen', titulo);
  await p.hover('#pf-nav .pf-tab[data-ruta="proyectos"]');
  await p.waitForTimeout(60);
  const caliente = await ev(() => { const t = document.querySelector('.nombre-tip'); return { abierto: t.matches(':popover-open'), txt: t.textContent }; });
  cierto(caliente.abierto && /Proyectos/.test(caliente.txt), 'el siguiente sale al instante mientras el grupo sigue caliente (a los 60 ms)', caliente);
  await p.mouse.move(700, 500);
  await p.waitForTimeout(300);
  const devuelto = await ev(() => document.querySelector('#pf-nav .pf-tab[data-ruta="agenda"]').getAttribute('title'));
  cierto(/tecla 2/.test(devuelto || ''), 'y al irse el ratón el `title` vuelve a su sitio', devuelto);
  /* Teclado: Tab hasta una pestaña enseña la tecla. */
  await ev(() => document.querySelector('#pf-nav .pf-tab[data-ruta="hoy"]').focus());
  await p.keyboard.press('Tab');
  await p.waitForTimeout(500);
  const tab = await ev(() => { const t = document.querySelector('.nombre-tip'); return { abierto: t && t.matches(':popover-open'), txt: t && t.textContent, foco: document.activeElement.dataset.ruta }; });
  cierto(tab.abierto && tab.foco === 'agenda' && /Calendario/.test(tab.txt), 'con el teclado, llegar a una pestaña enseña su nombre y su tecla', tab);
  await p.keyboard.press('Escape');
  /* Los números siguen cambiando de pantalla, y no dan lado. */
  await p.mouse.move(700, 500);
  await ev(() => document.activeElement.blur());
  await p.keyboard.press('3');
  await p.waitForTimeout(40);
  const num = await ev(() => ({ hash: location.hash, clases: document.documentElement.className, nav: document.documentElement.dataset.nav }));
  cierto(num.nav === 'teclado' && !/va-(adelante|atras)/.test(num.clases), 'con la tecla 3 no entra por ningún lado: lo que dispara el teclado no se anima', num);
  await p.waitForTimeout(800);
  cierto(await ev(() => location.hash === '#/proyectos'), 'y sí cambia a Proyectos');
  /* Con el ratón sí. */
  await p.click('#pf-nav .pf-tab[data-ruta="hoy"]');
  await p.waitForTimeout(40);
  cierto(await ev(() => /va-atras/.test(document.documentElement.className)), 'con el ratón, volver a Tablero entra desde la izquierda');
  await p.waitForTimeout(800);
  /* La barra lateral no se reescribió, y la ficha con su filete viajó. */
  await ev(() => { window.__t = document.querySelector('#pf-nav .pf-tab[data-ruta="hoy"]'); });
  await p.click('#pf-nav .pf-tab[data-ruta="material"]');
  await p.waitForTimeout(40);
  const vuelo = await ev(() => ({ ficha: !!document.querySelector('#pf-nav .ficha-viaja'), mismo: document.querySelector('#pf-nav .pf-tab[data-ruta="hoy"]') === window.__t }));
  cierto(vuelo.ficha && vuelo.mismo, 'el filete de la barra lateral VIAJA al módulo nuevo, sin que la barra se reescriba', vuelo);
  await p.waitForTimeout(800);
  await p.click('#pf-nav .pf-tab[data-ruta="hoy"]');
  await p.waitForTimeout(700);
  /* «/» abre la búsqueda. */
  await p.mouse.move(700, 500);
  await p.keyboard.press('/');
  await p.waitForTimeout(500);
  const sl = await ev(() => ({ abierta: document.getElementById('pf-buscar').classList.contains('show'), foco: document.activeElement.id, valor: document.getElementById('pf-buscar-q').value }));
  cierto(sl.abierta && sl.foco === 'pf-buscar-q' && sl.valor === '', '«/» abre la búsqueda desde cualquier pantalla, y la diagonal no se escribe', sl);
  const cab = await enPantalla(p, '.pf-buscar-op');
  cierto(!!cab, 'la lista de recientes está ahí');
  await p.keyboard.type('a/b');
  const dentro = await ev(() => document.getElementById('pf-buscar-q').value);
  cierto(dentro === 'a/b', 'dentro del campo una diagonal es una diagonal: «/» no vuelve a abrir nada', dentro);
  /* El ratón elige lo que señala. */
  await p.fill('#pf-buscar-q', 'guada');
  await p.waitForTimeout(450);
  await p.hover('.pf-buscar-op[data-i="1"]');
  cierto(await ev(() => document.querySelector('.pf-buscar-op[aria-selected="true"]').dataset.i === '1'), 'el ratón elige lo que señala, y Enter abre eso');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  cierto(await ev(() => !document.getElementById('pf-buscar').classList.contains('show')), 'Escape la cierra');
  /* En Ajustes, con nada escribiéndose, «/» también abre la búsqueda: es de la plataforma, no de
     una pantalla. */
  await ev(() => document.querySelector('.pf-lat-item#pf-ajustes-btn').click());
  await p.waitForTimeout(800);
  await p.mouse.move(700, 500);
  await ev(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('/');
  await p.waitForTimeout(500);
  cierto(await ev(() => document.getElementById('pf-buscar').classList.contains('show')), 'en Ajustes, sin campo enfocado, «/» también abre la búsqueda');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  cierto(await ev(() => !document.getElementById('pf-buscar').classList.contains('show')), '  y Escape la cierra otra vez');
  /* La cuenta con ratón. */
  await p.click('#pf-sesion');
  await p.waitForTimeout(400);
  const cu = await ev(() => ({ abierto: document.querySelector('.pf-sesion-vz').matches(':popover-open'), x: Math.round(document.querySelector('.pf-sesion-vz').getBoundingClientRect().right), w: window.innerWidth }));
  cierto(cu.abierto && cu.x <= cu.w - 12, 'el menú de la cuenta sale de su botón, sin salirse por la derecha', cu);
  await p.mouse.click(600, 400);
  await p.waitForTimeout(300);
  cierto(await ev(() => !document.querySelector('.pf-sesion-vz').matches(':popover-open')), 'un clic fuera lo cierra');
  await p.click('#pf-sesion');
  await p.waitForTimeout(300);
  await p.keyboard.press('Tab');
  await p.keyboard.press('Tab');
  await p.keyboard.press('Tab');
  await p.waitForTimeout(300);
  cierto(await ev(() => !document.querySelector('.pf-sesion-vz').matches(':popover-open')), 'y el tabulador que sale de su último botón lo cierra');
  cierto(await sinDesborde(p), 'sin desborde de lado');
  cierto(!(await infinitas(p)).length, 'nada se mueve en reposo', await infinitas(p));
  /* Cambiar de rol reescribe la barra, y el globo no salta por eso. */
  await ev(async () => { const a = await import('/js/app.js'); a.ponerCuenta('material', 2); });
  await p.waitForTimeout(600);
  await p.click('#pf-rolseg [data-rol="fabricacion"]');
  await p.waitForTimeout(1200);
  const rol = await ev(() => ({ n: document.querySelectorAll('#pf-nav .pf-tab').length, sube: !!document.querySelector('.cta.sube'), mat: (document.querySelector('#pf-nav [data-cta="material"]') || {}).textContent }));
  cierto(rol.n === 8 && !rol.sube, 'al cambiar de rol la barra se reescribe (8 pestañas) y ningún globo salta como si hubiera subido', rol);
  cierto(errores.length === 0, 'cero errores de página', errores);
  await ctx.close();
}

/* ==========================================================================================
   EL INDICADOR DE SINCRONIZACIÓN
   ========================================================================================== */
for (const [tema, reducido] of [['claro', false], ['oscuro', true]]) {
  console.log('\n══ LA SINCRONIZACIÓN · 360 PX · ' + tema.toUpperCase() + ' · ' + (reducido ? 'MENOS MOVIMIENTO' : 'CON MOVIMIENTO') + ' ══');
  hoja.modo = 'normal'; hoja.demora = 0; hoja.n = 0;
  const { ctx, p, errores } = await abrir({ tema, reducido, puente: true });
  const ev = (f, a) => p.evaluate(f, a);
  await p.waitForTimeout(800);
  await ev(() => {
    window.__estados = [];
    new MutationObserver(() => window.__estados.push(document.getElementById('pf-sync').dataset.sync)).observe(document.getElementById('pf-sync'), { attributes: true, attributeFilter: ['data-sync'] });
  });
  const vuelta = () => ev(() => document.dispatchEvent(new Event('visibilitychange')));
  const estado = () => ev(() => { const e = document.getElementById('pf-sync'), m = e.querySelector('.marca-estado'); return { s: e.dataset.sync, oculto: e.hidden, etiqueta: e.getAttribute('aria-label'), titulo: e.title, rol: e.getAttribute('role'),
    /* Lo que se VE, no lo que dice `display` del svg: el svg de la nube conserva su `display` aunque
       el contenedor que lo lleva esté quitado. */
    nube: e.querySelector('.nube').getClientRects().length > 0, nubeOff: e.querySelector('.nube-off').getClientRects().length > 0, marca: m ? m.getClientRects().length > 0 : false, mEstado: m && m.dataset.estado }; });
  const q = await estado();
  cierto(!q.oculto && q.s === 'quieto' && q.nube && !q.nubeOff && !q.marca && q.rol === 'img', 'en reposo: la nube quieta, sin marca, y el glifo es una imagen con nombre', q);
  cierto(q.etiqueta === 'Sincronización: al día' && q.titulo === q.etiqueta, 'dice «al día» en su aria-label y en su title', q);
  cierto(!(await infinitas(p)).length, 'y nada se mueve', await infinitas(p));
  const cq = await contraste(p, '#pf-sync');
  cierto(cq && cq.ratio >= 3, 'la nube se separa del encabezado a ' + (cq && cq.ratio) + ':1 (un glifo pide 3:1)', cq);

  /* Una vuelta corta nunca lo enciende. */
  await ev(() => { window.__estados.length = 0; });
  hoja.demora = 150;
  await vuelta();
  await p.waitForTimeout(900);
  const corta = await ev(() => window.__estados.slice());
  cierto(!corta.includes('trabaja'), 'una vuelta de 150 ms no enciende el arco: nada se mueve en las vueltas cortas', corta);

  /* Una lenta, sí, y se apaga al terminar. */
  await ev(() => { window.__estados.length = 0; });
  hoja.demora = 2300;
  await vuelta();
  await p.waitForTimeout(1500);
  const lenta = await estado();
  cierto(lenta.s === 'trabaja' && lenta.marca && !lenta.nube && lenta.mEstado === 'trabaja', 'pasado el segundo, el arco: estado «trabaja» con la marca a la vista', lenta);
  cierto(/buscando lo que cambió/.test(lenta.etiqueta), '  y lo dice con palabras: «' + lenta.etiqueta + '»', lenta);
  const arco = await ev(() => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#pf-sync')).map(a => ({ n: a.animationName, it: a.effect.getComputedTiming().iterations })));
  if (reducido) cierto(arco.every(a => a.it !== Infinity), 'con menos movimiento el arco no gira', arco);
  else cierto(arco.some(a => a.it === Infinity), 'con movimiento el arco gira —es una espera real—', arco);
  const ca = await contraste(p, '#pf-sync');
  cierto(await sinDesborde(p), 'sin desborde de lado con el arco');
  await p.waitForTimeout(1800);
  const fin = await estado();
  cierto(fin.s === 'quieto' && fin.nube && !fin.marca, 'al terminar la vuelta vuelve a la nube: el arco no se queda girando', fin);
  cierto(!(await infinitas(p)).length, 'y otra vez nada se mueve', await infinitas(p));

  /* Bajó algo: la palomita, y sola se va. */
  hoja.demora = 0; hoja.modo = 'nuevos';
  await ev(() => { window.__estados.length = 0; });
  await vuelta();
  await p.waitForTimeout(900);
  const ok = await estado();
  cierto(ok.s === 'ok' && ok.marca && ok.mEstado === 'ok' && /llegó lo nuevo/.test(ok.etiqueta), 'si bajó algo: la palomita, «' + ok.etiqueta + '»', ok);
  await p.waitForTimeout(3000);
  const ok2 = await estado();
  cierto(ok2.s === 'quieto' && !ok2.marca, 'y a los pocos segundos vuelve a la nube', ok2);

  /* Falló: la cruz con su motivo. */
  hoja.modo = 'error';
  await vuelta();
  await p.waitForTimeout(900);
  const err = await estado();
  cierto(err.s === 'mal' && err.marca && err.mEstado === 'mal', 'si falló: la cruz', err);
  cierto(/token desconocido/.test(err.titulo), '  con el motivo en el title y en minúscula tras los dos puntos: «' + err.titulo + '»', err);
  const voz = await ev(() => document.getElementById('vozAlert').textContent);
  cierto(/Sincronización: token desconocido/.test(voz), '  y es lo único que se dice por voz asertiva', voz);
  await ev(() => { document.getElementById('vozAlert').textContent = ''; });
  await p.waitForTimeout(150);
  await vuelta();
  await p.waitForTimeout(900);
  const repite = await ev(() => document.getElementById('vozAlert').textContent);
  cierto(repite === '', 'fallar otra vez seguida NO lo vuelve a decir: diez fallos no son diez avisos', repite);
  cierto((await estado()).s === 'mal', '  y la cruz se queda hasta la siguiente vuelta buena');
  cierto(await sinDesborde(p), 'sin desborde de lado con la cruz');

  /* Vuelta buena: la cruz se va. */
  hoja.modo = 'normal';
  await vuelta();
  await p.waitForTimeout(900);
  cierto((await estado()).s === 'quieto', 'la siguiente vuelta buena la quita');

  /* Sin señal. */
  await ctx.setOffline(true);
  await vuelta();
  await p.waitForTimeout(600);
  const sin = await estado();
  cierto(sin.s === 'sin-senal' && sin.nubeOff && !sin.nube && !sin.marca, 'sin señal: la nube tachada, quieta —no una cruz—', sin);
  cierto(/Sin señal: lo que hagas se guarda aquí/.test(sin.etiqueta), '  y dice qué pasa con lo que se hace: «' + sin.etiqueta + '»', sin);
  cierto(!(await infinitas(p)).length, '  y no se mueve', await infinitas(p));
  const voz2 = await ev(() => document.getElementById('vozAlert').textContent);
  cierto(voz2 === '', '  ni se anuncia: no es algo que haya que hacer', voz2);
  await ctx.setOffline(false);
  await vuelta();
  await p.waitForTimeout(900);
  cierto((await estado()).s === 'quieto', 'al volver la señal, vuelve a la nube');
  cierto(errores.length === 0, 'cero errores de página', errores);
  await ctx.close();
}

/* ==========================================================================================
   EL ARRANQUE EN PASOS
   ========================================================================================== */
console.log('\n══ EL ARRANQUE EN PASOS ══');
{
  const ctx = await nav.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, locale: 'es-MX', serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('al3d_tema', 'claro'); localStorage.setItem('al3d_pf_rol', 'direccion'); localStorage.setItem('al3d_pf_ult_export', new Date().toISOString()); } catch (_) {} });
  await ctx.route(/^https?:\/\/(?!al3d\.prueba|127\.0\.0\.1)/, r => r.abort());
  /* El catálogo tarda 10 s en llegar: el arranque se queda ahí, y es lo que se quiere ver. */
  await ctx.route('**/js/datos/material.js', async r => { await dormir(10500); r.continue(); });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(e.message));
  await p.goto(B + '/#/hoy', { waitUntil: 'commit' });
  await p.waitForFunction(() => document.querySelector('#pf-arranque-traza [data-clave="catalogo"][data-estado="trabaja"]'), null, { timeout: 15000 });
  const pasos = () => p.evaluate(() => [...document.querySelectorAll('#pf-arranque-traza .traza-paso')].map(l => l.dataset.clave + ':' + l.dataset.estado));
  const a = await pasos();
  cierto(a.join() === 'puerta:ok,base:ok,catalogo:trabaja,pantalla:espera', 'los pasos van por donde va el arranque de verdad: ' + a.join(' '), a);
  const t = await p.evaluate(() => [...document.querySelectorAll('#pf-arranque-traza .traza-paso .traza-t')].map(x => x.textContent));
  cierto(t.join('|') === 'Quién entra|La base de este aparato|El catálogo de material|La primera pantalla', 'con sus rótulos: ' + t.join(' · '), t);
  await p.waitForTimeout(3200);
  const reloj = await p.evaluate(() => document.querySelector('#pf-arranque-traza [data-clave="catalogo"] .traza-reloj').textContent);
  cierto(/^\d+ s$/.test(reloj), 'el renglón que trabaja lleva su reloj corriendo: «' + reloj + '»', reloj);
  const g = await p.evaluate(() => { const l = document.querySelector('#pf-arranque-traza [data-clave="catalogo"] .traza-marca'); return getComputedStyle(l).animationName; });
  cierto(/gira/.test(g), 'y solo ese gira (' + g + ')', g);
  cierto(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'sin desborde de lado');
  /* Los ocho segundos. */
  await p.waitForFunction(() => { const t = document.getElementById('pf-arranque-tx'); return t && t.textContent.includes('tarda más de lo normal'); }, null, { timeout: 15000 });
  const n = await p.evaluate(() => { const t = document.getElementById('pf-arranque-tx'), r = t.getBoundingClientRect(), d = document.getElementById('pf-abajo').getBoundingClientRect();
    return { txt: t.textContent, rol: t.getAttribute('role'), boton: !!t.querySelector('[data-recargar]'), abajo: Math.round(r.bottom), arribaDelDock: Math.round(d.top), alto: window.innerHeight }; });
  cierto(/en «El catálogo de material»/.test(n.txt), 'el aviso dice EN QUÉ se atoró: «' + n.txt.trim().slice(0, 90) + '…»', n);
  cierto(n.rol === 'alert' && n.boton, '  con role=alert y su botón de recargar', n);
  cierto(n.abajo <= n.arribaDelDock, 'y se ve ENCIMA de la barra de abajo (termina en ' + n.abajo + ', la barra empieza en ' + n.arribaDelDock + ')', n);
  await p.waitForFunction(() => !document.getElementById('pf-arranque'), null, { timeout: 30000 });
  cierto(await p.evaluate(() => !document.querySelector('#pf-arranque-traza') && !document.querySelector('.pf-esqueleto')), 'y cuando por fin llega el catálogo, el esqueleto entero se va');
  cierto(errores.length === 0, 'cero errores de página', errores);
  await ctx.close();
}

/* ==========================================================================================
   LA PUERTA, CON UN GOOGLE DE MENTIRA
   ========================================================================================== */
async function puerta({ tema, reducido }) {
  console.log('\n══ LA PUERTA · 360 PX · ' + tema.toUpperCase() + ' · ' + (reducido ? 'MENOS MOVIMIENTO' : 'CON MOVIMIENTO') + ' ══');
  const ctx = await nav.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, locale: 'es-MX', serviceWorkers: 'block', reducedMotion: reducido ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([t]) => { try { localStorage.setItem('al3d_tema', t); localStorage.setItem('al3d_pf_ingreso', JSON.stringify({ clientId: 'cliente-de-prueba' })); } catch (_) {} }, [tema]);
  let veredicto = 'fuera', demoraHoja = 2000;
  await ctx.route(/^https?:\/\/(?!al3d\.prueba|127\.0\.0\.1)/, async r => {
    const u = r.request().url();
    if (u.includes('accounts.google.com/gsi/client')) {
      return r.fulfill({ status: 200, contentType: 'text/javascript', headers: CORS, body:
        "window.google={accounts:{oauth2:{initTokenClient:function(o){var c={callback:o.callback,requestAccessToken:function(){setTimeout(function(){c.callback({access_token:'tok-falso',expires_in:3600})},1200)}};return c;}}}};" });
    }
    if (u.includes('googleapis.com/oauth2/v3/userinfo')) return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ email: 'prueba@example.com', email_verified: true }) });
    if (u.includes('script.google.com')) {
      await dormir(demoraHoja);
      const cuerpo = veredicto === 'ok' ? { ok: true, via: 'google', correo: 'prueba@example.com', rol: 'direccion', escribibles: [] }
        : veredicto === 'fuera' ? { ok: false, codigo: 'ROL_SIN_PERMISO', mensaje: 'no' } : { ok: false, codigo: 'X', mensaje: 'La hoja no contestó bien' };
      return r.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(cuerpo) });
    }
    return r.abort();
  });
  const p = await ctx.newPage();
  const errores = []; p.on('pageerror', e => errores.push(e.message));
  await p.goto(PUBLICO + '/', { waitUntil: 'load' });
  await p.waitForSelector('.puerta-btn', { timeout: 15000 });
  await p.waitForTimeout(400);
  const ev = (f, a) => p.evaluate(f, a);
  const est = () => ev(() => { const b = document.querySelector('.puerta-btn'); return {
    boton: b.textContent.trim().replace(/\s+/g, ' '), estado: b.dataset.estado || '', ariaDis: b.getAttribute('aria-disabled'), disabled: b.disabled, foco: document.activeElement === b,
    pasos: [...document.querySelectorAll('.puerta-traza .traza-paso')].map(l => l.dataset.clave + ':' + l.dataset.estado), detalles: [...document.querySelectorAll('.puerta-traza .traza-d')].map(x => x.textContent),
    relojes: [...document.querySelectorAll('.puerta-traza .traza-reloj')].map(x => x.textContent),
    pasosVisibles: !document.querySelector('.puerta-pasos').hidden, carga: (document.querySelector('.puerta-marca') || {}).dataset && document.querySelector('.puerta-marca').dataset.goo,
    cargaVisible: !!document.querySelector('.puerta-goo') && getComputedStyle(document.querySelector('.puerta-goo')).opacity !== '0',
    aviso: (document.querySelector('.puerta-aviso') || {}).textContent || null, avisoRol: (document.querySelector('.puerta-aviso') || {}).getAttribute && document.querySelector('.puerta-aviso').getAttribute('role'),
    repetido: !!document.querySelector('.puerta-aviso.otra-vez'), anim: document.querySelector('.puerta-aviso') ? getComputedStyle(document.querySelector('.puerta-aviso')).animationName : null,
    otra: !!document.querySelector('[data-puerta="otra"]'), otraOcupada: (document.querySelector('[data-puerta="otra"]') || {}).getAttribute && document.querySelector('[data-puerta="otra"]').getAttribute('aria-disabled') }; });
  const inicio = await est();
  cierto(!inicio.pasosVisibles && inicio.boton === 'Entrar con Google' && inicio.aviso === null, 'antes de tocar no hay pasos que esperar ni aviso: solo el botón', inicio);
  cierto(await sinDesborde(p), 'sin desborde de lado');
  /* F10 v2: el fondo animado, la caja de vidrio y la entrada que pasa una vez. */
  const v2 = await ev(() => {
    const f = document.querySelector('#pf-puerta > .puerta-fondo');
    const caja = document.querySelector('.puerta-caja');
    const anims = document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.puerta-fondo'));
    return { fondo: f && f.dataset.fondo, oculto: f && f.getAttribute('aria-hidden'), fija: f && getComputedStyle(f).position,
      toques: f && getComputedStyle(f).pointerEvents, anims: anims.length, entra: caja.classList.contains('entra'),
      marca: !!document.querySelector('.puerta-marca .puerta-logo') && !!document.querySelector('.puerta-marca .puerta-goo') };
  });
  cierto(v2.fondo === 'neon' && v2.oculto === 'true' && v2.fija === 'fixed' && v2.toques === 'none',
    'detrás va el fondo de la puerta («' + v2.fondo + '»), fijo, mudo para el lector y sin robar toques', v2);
  cierto(v2.marca, 'el logo y sus tres manchas comparten lugar', v2);
  if (reducido) cierto(v2.anims === 0 && !v2.entra, 'con menos movimiento el fondo se queda fijo y no hay entrada', v2);
  else cierto(v2.anims > 0, 'con movimiento el fondo se mueve (' + v2.anims + ' animaciones): la única excepción aprobada', v2);
  await p.waitForTimeout(1000);
  cierto(await ev(() => !document.querySelector('.puerta-caja.entra')), 'la entrada pasa una vez y la caja se queda quieta');
  /* El primer intento se hace con el TECLADO: el foco tiene que quedarse en el botón. */
  await ev(() => document.querySelector('.puerta-btn').focus());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  const t1 = await est();
  cierto(t1.estado === 'trabajando' && /^Entrando · \d+ s$/.test(t1.boton), 'el botón dice cuánto lleva: «' + t1.boton + '»', t1);
  cierto(t1.ariaDis === 'true' && !t1.disabled && t1.foco, 'y no está `disabled`: el foco se queda en él (aria-disabled)', t1);
  cierto(t1.pasosVisibles && t1.pasos.join() === 'google:trabaja,hoja:espera', 'salen los dos pasos: Google trabajando, la hoja esperando', t1);
  if (reducido) cierto(!t1.cargaVisible && t1.carga === 'nada', 'con menos movimiento el logo se queda puesto: no hay manchas', t1);
  else cierto(t1.carga === 'espera', 'y el logo se separa en sus tres manchas mientras tanto', t1);
  const dentro = await ev(() => document.querySelectorAll('.puerta-btn .trabajo-relleno,.puerta-btn .estado-t,.puerta-btn .trabajo-reloj').length);
  cierto(dentro === 3, 'el botón lleva su relleno, su texto y su reloj', dentro);
  const infin = await ev(() => document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity && a.effect.target && a.effect.target.closest && a.effect.target.closest('#pf-puerta') && !a.effect.target.closest('.puerta-fondo')).length);
  cierto(infin >= 1, 'lo que se mueve es una espera real: ' + infin + ' animación(es) mientras se espera', infin);
  await p.waitForTimeout(2200);
  const t2 = await est();
  cierto(t2.pasos.join() === 'google:ok,hoja:trabaja' && /prueba@example\.com/.test(t2.detalles[0]), 'Google contestó: palomita con el correo, y la hoja trabaja: ' + t2.pasos.join(' ') + ' ' + t2.detalles.join('|'), t2);
  cierto(/^\d+ s$/.test(t2.relojes[1]) || t2.relojes[1] === '', 'con su reloj', t2.relojes);
  await p.waitForTimeout(2400);
  const t3 = await est();
  cierto(t3.estado === 'mal' && /Sin acceso · Volver a intentar/.test(t3.boton), 'la hoja dijo que no: el botón se queda con «' + t3.boton + '»', t3);
  cierto(t3.pasos.join() === 'google:ok,hoja:mal' && /no está dada de alta/.test(t3.detalles[1]), 'los pasos SE QUEDAN a la vista y dicen dónde se rompió: ' + t3.pasos.join(' ') + ' · ' + t3.detalles[1], t3);
  cierto(t3.aviso && /no tiene acceso a la plataforma/.test(t3.aviso) && t3.avisoRol === 'alert', 'el aviso de siempre, con role=alert', t3);
  cierto(t3.otra && t3.foco, 'aparece «Entrar con otra cuenta», y el foco sigue en el botón', t3);
  cierto(!t3.cargaVisible, 'las manchas se van con la falla: solo los pasos hablan', t3);
  cierto(await sinDesborde(p), 'sin desborde de lado con el aviso y los pasos');
  const cbm = await contraste(p, '.puerta-btn .estado-t');
  cierto(cbm && cbm.ratio >= 4.5, 'el rótulo de la falla lee a ' + (cbm && cbm.ratio) + ':1', cbm);
  cierto(!(await infinitas(p)).length, 'y todo queda quieto', await infinitas(p));
  /* Reintento con el mismo fallo: el aviso se sacude. */
  await ev(() => { window.__nodo = document.querySelector('.puerta-aviso'); });
  const vigia = vigilarAviso(p, 3600);
  await p.tap('.puerta-btn');
  await p.waitForTimeout(300);
  const r1 = await est();
  cierto(r1.estado === 'trabajando' && r1.pasos.join() === 'google:ok,hoja:trabaja', 'volver a intentar arranca los pasos de cero, con Google ya resuelto', r1);
  cierto(r1.otraOcupada === 'true', '  y «otra cuenta» espera mientras tanto (aria-disabled)', r1);
  const visto = await vigia;
  const r2 = await est();
  const nuevo = await ev(() => document.querySelector('.puerta-aviso') !== window.__nodo);
  cierto(nuevo && visto.nodos >= 1, 'el aviso repetido es un nodo NUEVO: un role=alert con el mismo texto no se volvería a anunciar', { nuevo, visto });
  cierto(visto.clase, 'y llevó la clase de la sacudida: «lo intenté otra vez»', visto);
  if (reducido) {
    cierto(visto.anim === 'none', 'con menos movimiento no se sacude (lo dicen los relojes, que empezaron de cero)', visto);
  } else {
    cierto(/sacudida/.test(visto.anim || ''), 'con movimiento se sacude (' + visto.anim + ')', visto);
    cierto(!r2.repetido, 'y la clase se quita sola al terminar: la siguiente vez vuelve a poder disparar', r2);
  }
  /* Otro fallo distinto: sin sacudida. */
  veredicto = 'no';
  await p.tap('.puerta-btn');
  await p.waitForTimeout(3300);
  const r3 = await est();
  cierto(r3.aviso && !r3.repetido && !r3.otra, 'un fallo DISTINTO cambia el aviso sin sacudirlo, y «otra cuenta» se va (ya no es «no tienes acceso»)', r3);
  cierto(/No se pudo entrar/.test(r3.boton), '  y el botón dice «' + r3.boton + '»', r3);
  /* Y por fin entra. */
  veredicto = 'ok'; demoraHoja = 300;
  await p.tap('.puerta-btn');
  await p.waitForFunction(() => /Adentro/.test((document.querySelector('.puerta-btn') || {}).textContent || ''), null, { timeout: 15000 });
  const ad = await est();
  cierto(ad.pasos.join() === 'google:ok,hoja:ok', 'antes de irse enseña las dos palomitas y «✓ Adentro»', ad);
  await p.waitForFunction(() => document.getElementById('pf-puerta').hidden, null, { timeout: 15000 });
  await p.waitForFunction(() => [...document.querySelectorAll('.pf-mod')].some(s => !s.hidden && s.childNodes.length), null, { timeout: 15000 });
  cierto(await ev(() => !document.querySelector('[inert]') && !document.documentElement.classList.contains('con-puerta')), 'con la hoja diciendo que sí, la puerta se quita entera y lo de detrás vuelve a estar vivo');
  cierto(errores.length === 0, 'cero errores de página', errores);
  await ctx.close();
}
for (const [tema, reducido] of [['claro', false], ['oscuro', false], ['claro', true]]) await puerta({ tema, reducido });

/* ==========================================================================================
   INSTALAR EN iPHONE, Y «SE ACTUALIZÓ»
   ========================================================================================== */
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
for (const [tema, ua, aparato, ancho] of [['claro', UA_IPHONE, 'iPhone', 360], ['oscuro', UA_IPHONE, 'iPhone', 360], ['claro', UA_IPAD, 'iPad', 700]]) {
  console.log('\n══ INSTALAR EN ' + aparato.toUpperCase() + ' · ' + tema.toUpperCase() + ' ══');
  const { ctx, p, errores } = await abrir({ ancho, tema, agente: ua });
  const ev = (f, a) => p.evaluate(f, a);
  const boton = await ev(() => { const b = document.getElementById('pf-cab-instalar'); return { oculto: b.hidden, w: Math.round(b.getBoundingClientRect().width) }; });
  cierto(!boton.oculto, 'en ' + aparato + ' el botón de instalar sale en el encabezado', boton);
  const tit = await ev(() => { const e = document.getElementById('pf-sub'); return { corta: e.scrollWidth > e.clientWidth, txt: e.textContent, logo: getComputedStyle(document.querySelector('.pf-cab-logo')).display, sync: getComputedStyle(document.getElementById('pf-sync')).display }; });
  cierto(!tit.corta, 'con cinco botones en el encabezado el título «' + tit.txt + '» sigue entero', tit);
  await p.tap('#pf-cab-instalar');
  await p.waitForTimeout(600);
  const h = await ev(() => { const c = document.getElementById('pf-ios');
    return { abierta: c.classList.contains('show'), rotulo: (document.getElementById('pf-ios-t') || {}).textContent, pasos: [...c.querySelectorAll('.riel-paso')].length, textos: [...c.querySelectorAll('.riel-t')].map(x => x.textContent),
      iconos: c.querySelectorAll('.pf-ios-ico svg').length, flecha: !!c.querySelector('.pf-ios-abajo'), lista: (c.querySelector('.riel') || {}).tagName, etiqueta: (c.querySelector('.riel') || {}).getAttribute && c.querySelector('.riel').getAttribute('aria-label'),
      nota: [...c.querySelectorAll('.riel-nota')].map(x => x.textContent), toast: !!document.querySelector('.toast-uno') }; });
  cierto(h.abierta && h.pasos === 2 && h.iconos === 2, 'una hoja con dos pasos, cada uno con su icono dibujado', h);
  cierto(h.textos.join('|') === 'Toca Compartir|Toca «Agregar a inicio»', 'los pasos: ' + h.textos.join(' → '), h);
  cierto(aparato === 'iPhone' ? h.flecha : !h.flecha, aparato === 'iPhone' ? 'en el iPhone una flecha apunta hacia la barra de Safari, que está abajo' : 'en el iPad no hay flecha hacia abajo: el botón está arriba', h);
  cierto(aparato === 'iPad' ? /arriba en Safari/.test(h.nota[0]) : /barra de abajo de Safari/.test(h.nota[0]), 'y la nota lo dice con palabras: «' + h.nota[0] + '»', h.nota);
  cierto(/iP(hone|ad)/.test(h.etiqueta || ''), 'la lista se llama «' + h.etiqueta + '»', h);
  cierto(!h.toast, 'ya no es un aviso de nueve segundos que se va solo: es una hoja que se queda hasta cerrarla');
  cierto(await sinDesborde(p), 'sin desborde de lado');
  const ci = await contraste(p, '.riel-nota');
  cierto(ci && ci.ratio >= 4.5, 'la nota de cada paso lee a ' + (ci && ci.ratio) + ':1', ci);
  await p.waitForTimeout(700);
  cierto(!(await infinitas(p)).length, 'nada se mueve en reposo', await infinitas(p));
  await p.tap('#pf-ios [data-ios-cerrar].btn');
  await p.waitForTimeout(500);
  cierto(await ev(() => !document.getElementById('pf-ios').classList.contains('show')), '«Entendido» la cierra');
  await p.tap('#pf-cab-instalar');
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  cierto(await ev(() => !document.getElementById('pf-ios').classList.contains('show') && document.activeElement.id === 'pf-cab-instalar'), 'Escape la cierra y el foco vuelve al botón');
  await p.tap('#pf-cab-instalar');
  await p.waitForTimeout(500);
  await p.goBack();
  await p.waitForTimeout(600);
  cierto(await ev(() => !document.getElementById('pf-ios').classList.contains('show')), 'el atrás del teléfono la cierra');
  cierto(errores.length === 0, 'cero errores de página', errores);
  await ctx.close();
}

console.log('\n══ «SE PUSO LA VERSIÓN NUEVA DE LA APP» ══');
{
  const dice = async (extra, quiero, que) => {
    const { ctx, p, errores } = await abrir({ extra });
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => ({ toast: [...document.querySelectorAll('.toast-uno')].map(t => t.textContent), marca: sessionStorage.getItem('al3d_pf_actualizada'), tipo: (document.querySelector('.toast-uno') || {}).className }));
    const dijo = r.toast.some(t => /Se puso la versión nueva de la app/.test(t));
    cierto(dijo === quiero, que, r);
    cierto(r.marca === null, '  y la marca se borra, se haya dicho o no: no queda para la siguiente recarga', r);
    if (quiero) cierto(/ok/.test(r.tipo), '  como aviso de los buenos (verde)', r);
    cierto(errores.length === 0, '  cero errores de página', errores);
    await ctx.close();
  };
  await dice({ al3d_pf_actualizada: String(Date.now()) }, true, 'tras la recarga por versión nueva el arranque lo dice, ya con la primera pantalla pintada');
  await dice({ al3d_pf_actualizada: String(Date.now() - 120000) }, false, 'una marca de hace dos minutos no vale: una recarga cancelada no deja el aviso esperando');
  await dice({}, false, 'sin marca —la primera instalación, o cualquier otro arranque— no dice nada');
}

/* ==========================================================================================
   LO QUE RUEDA Y LO QUE NO: «NUNCA AL ENTRAR»
   ========================================================================================== */
console.log('\n══ LAS CUENTAS RUEDAN CUANDO CAMBIAN, Y NUNCA AL ENTRAR ══');
{
  const { ctx, p, errores } = await abrir({ tactil: false, ancho: 1280, alto: 800 });
  const ev = (f, a) => p.evaluate(f, a);
  /* La pieza 1 recuerda cada cifra por su clave. Una pantalla que pinta `pf-prueba` la deja
     recordada; entrar a otra debe olvidarla, y un remonte en silencio no. */
  const rueda = valor => ev(v => { const e = document.createElement('b'); e.style.cssText = 'position:fixed;left:10px;top:10px'; document.body.append(e);
    return window.Piezas.rodarCifra(e, v, { clave: 'pf-prueba' }).then(r => { e.remove(); return r; }); }, valor);
  await ev(() => { const e = document.createElement('b'); e.style.cssText = 'position:fixed;left:10px;top:10px'; document.body.append(e); window.Piezas.rodarCifra(e, '2', { clave: 'pf-prueba' }); e.remove(); });
  /* Un remonte en silencio de la pantalla que se mira (otra pestaña guardó): NO olvida. */
  await ev(() => window.dispatchEvent(new StorageEvent('storage', { key: 'al3d_historial' })));
  await p.waitForTimeout(900);
  cierto(await rueda('3') === true, 'tras un remonte en silencio de la misma pantalla, la cuenta que cambió RUEDA desde lo que se veía');
  const remonte = await ev(async () => { const a = await import('/js/app.js'); return typeof a.ponerCuenta === 'function'; });
  cierto(remonte, 'app.js sigue exportando ponerCuenta');
  /* Entrar a otra pantalla: se olvida todo, y el primer pintado no rueda. */
  await ev(() => { const e = document.createElement('b'); e.style.cssText = 'position:fixed;left:10px;top:10px'; document.body.append(e); window.Piezas.rodarCifra(e, '5', { clave: 'pf-prueba' }); e.remove(); });
  await p.click('#pf-nav .pf-tab[data-ruta="proyectos"]');
  await p.waitForTimeout(900);
  cierto(await rueda('6') === false, 'al ENTRAR a otra pantalla se olvida lo recordado: el primer pintado no rueda desde el valor de la última visita');
  cierto(await rueda('7') === true, '  y a partir de ahí sí rueda cuando cambia');
  const ctxOk = await ev(async () => { const m = await import('/js/app.js'); return typeof m.pintarBanda === 'function'; });
  cierto(ctxOk && errores.length === 0, 'cero errores de página', errores);
  await ctx.close();
}

await nav.close();
console.log('\n' + (fallos ? fallos + ' fallo(s).' : 'El esqueleto de la plataforma se ve y se siente como se pidió.'));
process.exit(fallos ? 1 : 0);
