/* EL TABLERO ES LA PUERTA, y las rutas que ya están grabadas siguen llegando.
 *
 * Esta prueba existe por un fallo que no se ve y que no da error: `rutaDelHash()` cae a la
 * primera ruta del rol cuando el hash no casa con NINGUNA, y `montarDeVerdad` nunca reescribe
 * `location.hash`. O sea que una ruta renombrada no revienta: abre otra pantalla, en silencio,
 * y la barra de direcciones sigue diciendo lo que ya no es. Y `./#/hoy` está grabado en cosas
 * que no controlamos —el start_url y el atajo del manifiesto YA INSTALADO, y el icono de la
 * pantalla de inicio del iPhone, que guarda la URL con la que se agregó—, así que si eso se
 * rompe nadie se entera hasta que el dueño abre su icono de siempre y ve otra cosa.
 *
 * Por eso el caso 2 es el más importante del archivo, aunque parezca el más tonto.
 *
 * Lo demás que se prueba aquí tampoco se ve mirando la pantalla: que el filtro de la línea de
 * estaciones cambie la lista Y el `aria-pressed`, que el tope por rol enseñe la razón en vez de
 * un botón apagado, y que estar en una ruta oculta deje encendida la pestaña de su madre —el
 * defecto que dejaba la tira entera apagada y la pantalla sin decir dónde estás—.
 *
 * Uso:  PUERTO=8814 node pruebas/navegador/tablero.mjs
 */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
/* En monitor, que es donde el tablero enseña las dos columnas. El teléfono tiene su propio
   caso al final. */
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX',
  timezoneId: 'America/Mexico_City', serviceWorkers: 'allow' });
const p = await ctx.newPage();
let fallos = 0;
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const bien = m => console.log('  ✓ ' + m);
const errs = []; p.on('pageerror', e => errs.push(e.message));

/** Qué sección está montada. Es la pregunta de casi todos los casos. */
const montada = () => p.evaluate(() => {
  const s = [...document.querySelectorAll('.pf-mod')].find(x => !x.hidden);
  return s ? s.id : null;
});

/** El nombre de la pestaña encendida. */
const pestana = () => p.evaluate(() => {
  const t = document.querySelector('.pf-tab.on .tx');
  return t ? t.textContent.trim() : null;
});

/* `goto` a la MISMA url con hash es una navegación del mismo documento: el navegador no
   recarga y el router no vuelve a montar. Costó un rato porque el síntoma —un tablero con
   ceros después de sembrar tres proyectos— no se parece en nada a su causa. Se compara y se
   recarga a la fuerza cuando hace falta. */
const irA = async (hash, pag = p) => {
  const destino = B + '/' + hash;
  if (pag.url() === destino) await pag.reload({ waitUntil: 'load' });
  else await pag.goto(destino, { waitUntil: 'load' });
  await pag.waitForTimeout(1100);
};

// ── 1. La puerta ───────────────────────────────────────────────────────────
console.log('\nLA PUERTA');
await irA('');
(await montada()) === 'mod-tablero'
  ? bien('./ sin hash monta el Tablero')
  : mal('./ montó ' + (await montada()) + ' en vez de mod-tablero');
(await pestana()) === 'Tablero'
  ? bien('y la primera pestaña está encendida')
  : mal('la pestaña encendida dice «' + (await pestana()) + '»');

// ── 2. EL CASO QUE PROTEGE EL ICONO YA INSTALADO ───────────────────────────
console.log('\nLAS RUTAS QUE YA ESTÁN GRABADAS EN TELÉFONOS AJENOS');
await irA('#/hoy');
(await montada()) === 'mod-tablero'
  ? bien('#/hoy monta el TABLERO — el icono del iPhone y el atajo del manifiesto siguen llegando a donde deben')
  : mal('#/hoy montó ' + (await montada()) + ': el icono ya instalado abre otra pantalla');

for (const [hash, esperada] of [['#/agenda', 'mod-fabricacion'], ['#/proyectos', 'mod-proyectos'],
                                 ['#/material', 'mod-material'], ['#/mapa', 'mod-mapa']]) {
  await irA(hash);
  (await montada()) === esperada
    ? bien(hash + ' sigue montando ' + esperada)
    : mal(hash + ' montó ' + (await montada()) + ' en vez de ' + esperada);
}

// ── 3. La ruta oculta deja encendida a su madre ────────────────────────────
console.log('\nLA RUTA OCULTA NO APAGA LA TIRA');
await irA('#/atender');
(await montada()) === 'mod-atender'
  ? bien('#/atender monta la lista de avisos, que no se perdió')
  : mal('#/atender montó ' + (await montada()));
(await pestana()) === 'Tablero'
  ? bien('y «Tablero» sigue encendido: la pantalla dice dónde estás')
  : mal('con #/atender la pestaña encendida es «' + (await pestana()) + '» (esperado Tablero)');

// ── 4. Con datos: el tablero pinta el taller ───────────────────────────────
console.log('\nCON UN TALLER DE VERDAD');
await irA('#/hoy');

/* Se siembra por la CAPA DE DATOS, no metiendo filas a mano en IndexedDB: así la prueba
   recorre `ganar()` y `agendar()`, que son las que de verdad crean un proyecto, y si su
   contrato cambia esta prueba se cae en vez de seguir verde sobre datos inventados.
   La fecha de instalación va a 4 días para que la ventana de taller esté ABIERTA hoy y el
   proyecto salga atrasado: en 4 días no cabe un plazo de dos semanas. */
const sembrado = await p.evaluate(async () => {
  const Proy = await import('./js/datos/proyectos.js');
  const Agenda = await import('./js/datos/agenda.js');
  const { masDias, hoyISO } = await import('./js/nucleo/fechas.js');
  const hoy = hoyISO();

  const cot = (folio, cliente, items) => ({
    folio, cliente, proy: cliente + ' — anuncio', ts: Date.now(),
    estado: 'autorizada', items, neto: 40000, itemsAuth: { 1: 40000 },
    maps: 'https://www.google.com/maps/place/X/@20.7108,-103.4192,17z',
  });
  const letras = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true,
                   ilumTipo: 'fria', altura: 40, n: 8 };

  const out = { creados: [], errores: [] };
  for (const [folio, cliente] of [['COT-9001', 'Healthylicious'], ['COT-9002', 'Parentesis'],
                                   ['COT-9003', 'La Perla']]) {
    const r = await Proy.ganar(cot(folio, cliente, [letras]), {});
    if (r.ok) out.creados.push(r.valor.id); else out.errores.push(folio + ': ' + r.mensaje);
  }
  /* Al primero se le pone fecha cerca: su ventana está abierta y va tarde. Al segundo se le
     mueve la etapa para que la línea de estaciones tenga más de una columna con algo. */
  if (out.creados[0]) {
    const r = await Agenda.agendar(out.creados[0], { fecha: masDias(hoy, 4) });
    if (!r.ok) out.errores.push('agendar: ' + r.mensaje);
  }
  if (out.creados[1]) {
    const r = await Proy.avanzarEtapa(out.creados[1], 'en_diseno');
    if (!r.ok) out.errores.push('avanzar: ' + r.mensaje);
  }
  return out;
});
if (sembrado.errores.length) mal('la siembra dio errores: ' + sembrado.errores.join(' | '));
sembrado.creados.length === 3
  ? bien('tres proyectos ganados por la capa de datos de verdad')
  : mal('se crearon ' + sembrado.creados.length + ' de 3');

await irA('#/hoy');

const pintado = await p.evaluate(() => {
  const s = document.getElementById('mod-tablero');
  const cuentas = [...s.querySelectorAll('.pf-cuentas:not(.tb-linea) .pf-cuenta')]
    .map(e => e.textContent.trim());
  const estaciones = [...s.querySelectorAll('.tb-etapa')].map(e => ({
    etapa: e.dataset.etapa, txt: e.textContent.trim(), atras: !!e.querySelector('em'),
  }));
  return {
    cuentas, estaciones,
    filas: s.querySelectorAll('.pf-fila.tal-fila').length,
    pistas: s.querySelectorAll('.tal-pista').length,
    dosColumnas: !!s.querySelector('.tb-cuerpo'),
    nota: !!s.querySelector('.pf-nota'),
  };
});
pintado.cuentas.length >= 4
  ? bien('la cinta de cuentas pinta ' + pintado.cuentas.length + ': ' + pintado.cuentas.join(' · '))
  : mal('la cinta pintó ' + pintado.cuentas.length + ' cuentas');
pintado.estaciones.length === 5
  ? bien('la línea de estaciones pinta las cinco: ' + pintado.estaciones.map(e => e.etapa).join(', '))
  : mal('la línea pintó ' + pintado.estaciones.length + ' estaciones');
pintado.filas >= 3
  ? bien('la lista del taller pinta ' + pintado.filas + ' renglones, con ' + pintado.pistas + ' pistas')
  : mal('la lista pintó ' + pintado.filas + ' renglones');
pintado.dosColumnas ? bien('el cuerpo de dos columnas usa .tb-cuerpo, no un clon de la agenda')
                    : mal('no hay .tb-cuerpo');
pintado.nota ? bien('y al pie está la nota que dice cómo se calcula la ventana')
             : mal('falta la nota del pie: sin ella nadie sabe de dónde salen las fechas');

/* «N atrasados» es EL indicador que no existía en ninguna pantalla. Con una instalación a 4
   días y un plazo de dos semanas, el trabajo tiene que salir atrasado. */
const hayAtraso = pintado.estaciones.some(e => e.atras);
hayAtraso
  ? bien('un bloque de estación dice cuántos van atrasados — el dato que no existía')
  : mal('ningún bloque marcó atrasados, y con instalación a 4 días tendría que haberlo');

// ── 5. El filtro de la línea ───────────────────────────────────────────────
console.log('\nEL FILTRO NO ES NAVEGACIÓN');
const hashAntes = await p.evaluate(() => location.hash);
await p.click('.tb-etapa[data-etapa="en_diseno"]');
await p.waitForTimeout(350);
const trasFiltro = await p.evaluate(() => ({
  presionado: document.querySelector('.tb-etapa[data-etapa="en_diseno"]').getAttribute('aria-pressed'),
  filas: document.querySelectorAll('#mod-tablero .pf-fila.tal-fila').length,
  hash: location.hash,
  verTodos: [...document.querySelectorAll('#mod-tablero button')].some(b => b.textContent.includes('Ver todos')),
}));
trasFiltro.presionado === 'true' ? bien('aria-pressed pasa a true')
                                 : mal('aria-pressed quedó en ' + trasFiltro.presionado);
trasFiltro.filas === 1 ? bien('la lista queda en el único que está en diseño')
                       : mal('con el filtro puesto quedaron ' + trasFiltro.filas + ' renglones (esperado 1)');
trasFiltro.hash === hashAntes ? bien('y el hash NO cambió: filtrar no ensucia el botón de atrás')
                              : mal('el filtro cambió el hash a ' + trasFiltro.hash);
trasFiltro.verTodos ? bien('con el filtro puesto se ofrece «Ver todos» — el control enseña el filtro')
                    : mal('el filtro está puesto y no hay cómo soltarlo a la vista');

await p.click('.tb-etapa[data-etapa="en_diseno"]');
await p.waitForTimeout(350);
(await p.evaluate(() => document.querySelectorAll('#mod-tablero .pf-fila.tal-fila').length)) >= 3
  ? bien('el segundo toque suelta el filtro')
  : mal('el segundo toque no soltó el filtro');

// ── 6. El tope por rol enseña la razón, no un botón apagado ────────────────
console.log('\nEL TOPE POR ROL SE EXPLICA');
await p.evaluate(() => localStorage.setItem('al3d_pf_rol', 'fabricacion'));
await irA('#/hoy');
const comoFabrica = await p.evaluate(() => {
  const s = document.getElementById('mod-tablero');
  return {
    dinero: s.textContent.includes('$'),
    apagados: s.querySelectorAll('.pf-fila-acc button[disabled]').length,
    hayBotones: s.querySelectorAll('.pf-fila-acc button').length,
  };
});
comoFabrica.dinero === false
  ? bien('con rol fabricación no se pinta ni un importe: el elemento no existe, no se difumina')
  : mal('con rol fabricación aparece un importe en el tablero');
comoFabrica.apagados === 0
  ? bien('y no hay ni un botón apagado: cuando el rol no puede, se escribe la razón')
  : mal('hay ' + comoFabrica.apagados + ' botones deshabilitados');
comoFabrica.hayBotones > 0
  ? bien('fabricación sí puede mover etapas hasta su tope (' + comoFabrica.hayBotones + ' acciones)')
  : mal('fabricación no tiene ni una acción en el tablero');

await p.evaluate(() => localStorage.setItem('al3d_pf_rol', 'direccion'));

// ── 6b. La mesa de corte, empotrada ────────────────────────────────────────
/* El caso que caza el fallo MUDO. `svgnest.js` arranca sus Web Workers con
   `evalPath:'js/lib/eval.js'`, un literal relativo, y `new Worker(url)` resuelve contra la
   URL base del DOCUMENTO. Servido desde la raíz de la plataforma sería `/js/lib/eval.js`,
   que no existe — y no lanza excepción: deja un cálculo que nunca termina. Comprobar que el
   motor «está» no basta: hay que comprobar contra qué resuelve su ruta. */
console.log('\nLA MESA DE CORTE, DENTRO DEL TALLER');
await irA('#/hoy');
await p.click('[data-vista="anidador"]');
await p.waitForTimeout(2400);

const marco = p.frames().find(x => x.url().includes('anidador-vectores'));
if (!marco) mal('la sub-vista Anidador no cargó su marco');
else {
  bien('el marco carga ' + marco.url().replace(B, ''));
  const dentro = await marco.evaluate(() => ({
    anidador: typeof window.Anidador !== 'undefined',
    svgnest: typeof window.SvgNest !== 'undefined',
    empotrado: document.documentElement.classList.contains('empotrado'),
    topbar: (() => { const t = document.querySelector('.topbar'); return t ? getComputedStyle(t).display : null; })(),
    evalResuelto: new URL('js/lib/eval.js', document.baseURI).href,
  }));
  dentro.anidador && dentro.svgnest
    ? bien('window.Anidador y window.SvgNest existen dentro del marco')
    : mal('el motor no cargó: ' + JSON.stringify(dentro));
  dentro.empotrado ? bien('el anidador se sabe empotrado') : mal('no puso la clase .empotrado');
  dentro.topbar === 'none'
    ? bien('su barra de arriba está apagada: un solo encabezado en pantalla')
    : mal('la topbar del anidador sigue visible (display:' + dentro.topbar + ')');
  dentro.evalResuelto.includes('/anidador-vectores/js/lib/eval.js')
    ? bien('evalPath resuelve DENTRO de su carpeta: los Web Workers encuentran eval.js')
    : mal('evalPath resolvería a ' + dentro.evalResuelto + ' — el motor fallaría en silencio');
  const codigo = await p.evaluate(async u => {
    try { return (await fetch(u)).status; } catch (e) { return 'ERR'; }
  }, dentro.evalResuelto);
  codigo === 200 ? bien('y ese archivo responde 200') : mal('eval.js responde ' + codigo);

  const alto = await p.evaluate(() => {
    const m = document.getElementById('pf-anid-marco');
    return m ? Math.round(m.getBoundingClientRect().height) : null;
  });
  alto > 400 ? bien('el marco mide ' + alto + ' px, no los 150 de la especificación')
             : mal('el marco quedó en ' + alto + ' px de alto');
}

/* LA GUARDA DEL REMONTE. Sin ella, el oyente de 'storage' del router remonta el módulo, y
   `montarDeVerdad` hace innerHTML='' : el marco muere y recarga el motor entero. */
const urlAntes = await p.evaluate(() => {
  const m = document.getElementById('pf-anid-marco');
  return m ? m.contentWindow.location.href : null;
});
await p.evaluate(() => window.dispatchEvent(
  new StorageEvent('storage', { key: 'al3d_historial', newValue: '[]' })));
await p.waitForTimeout(1200);
const trasStorage = await p.evaluate(() => {
  const m = document.getElementById('pf-anid-marco');
  return { existe: !!m, href: m ? m.contentWindow.location.href : null };
});
trasStorage.existe && trasStorage.href === urlAntes
  ? bien('un storage de al3d_historial NO mata el marco: sigue vivo y en la misma URL')
  : mal('el marco se remontó con un storage: ' + JSON.stringify(trasStorage));

/* Y al salir de la mesa de corte, la guarda se suelta: si se quedara puesta, un proyecto
   ganado en el cotizador ya no repintaría este tablero nunca más. */
await p.click('[data-vista="tablero"]');
await p.waitForTimeout(600);
(await p.evaluate(() => !document.getElementById('pf-anid-marco')))
  ? bien('al volver a la carga, el marco se destruye — y con él sus Web Workers')
  : mal('el marco sigue en el DOM después de salir de la mesa de corte');

// ── 7. El teléfono ─────────────────────────────────────────────────────────
console.log('\nEN EL TELÉFONO');
const tel = await ctx.newPage();
const errsTel = []; tel.on('pageerror', e => errsTel.push(e.message));
await tel.setViewportSize({ width: 375, height: 812 });
await tel.goto(B + '/#/hoy', { waitUntil: 'load' });
await tel.waitForTimeout(1300);
const enTel = await tel.evaluate(() => {
  const s = document.getElementById('mod-tablero');
  const doc = document.documentElement;
  return {
    monta: !!s && !s.hidden,
    scrollH: doc.scrollWidth > doc.clientWidth,
    tabs: document.querySelectorAll('.pf-tab').length,
    /* En 375 px la columna del taller va primero: es la pregunta de la mañana. */
    primero: (() => {
      const c = s && s.querySelector('.tb-cuerpo');
      if (!c) return null;
      const hijos = [...c.children];
      return hijos.length === 2 ? getComputedStyle(hijos[1]).order : null;
    })(),
  };
});
enTel.monta ? bien('el tablero monta en 375 px') : mal('el tablero no monta en el teléfono');
enTel.scrollH === false ? bien('y no hay desplazamiento horizontal')
                        : mal('en 375 px la página se desplaza a lo ancho');
enTel.tabs <= 6 ? bien('la barra tiene ' + enTel.tabs + ' pestañas (tope de 6 en el teléfono)')
                : mal('la barra tiene ' + enTel.tabs + ' pestañas: son demasiadas para 375 px');
await tel.close();

// ── 8. Sin errores de página ───────────────────────────────────────────────
console.log('\nSIN ERRORES DE PÁGINA');
const todos = errs.concat(errsTel);
if (todos.length) todos.slice(0, 8).forEach(e => mal('error de página: ' + e));
else bien('cero errores de página en todo el recorrido');

console.log('\n' + (fallos ? fallos + ' fallo(s).' : 'El tablero es la puerta, y ninguna ruta grabada se rompió.'));
await nav.close();
process.exit(fallos ? 1 : 0);
