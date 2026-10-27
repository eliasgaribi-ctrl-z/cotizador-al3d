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
 * Lo demás que se prueba aquí tampoco se ve mirando la pantalla: que el Tablero despejado
 * (octubre de 2026) pinte las cinco estaciones con una ficha por trabajo, que cada rol vea lo
 * suyo, que la mesa de corte empotrada cargue su motor, y que estar en una ruta oculta deje
 * encendida la pestaña de su madre —el defecto que dejaba la tira entera apagada y la pantalla
 * sin decir dónde estás—. Lo del Tablero con más detalle está en pf-tablero.mjs.
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
  return {
    resumen: ((s.querySelector('.tb-res-total') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    estaciones: [...s.querySelectorAll('.tb-est')].map(e => e.dataset.etapa),
    fichas: s.querySelectorAll('.tb-ficha').length,
    tarde: [...s.querySelectorAll('.tb-ficha.mal')].map(f => f.textContent),
    columnas: getComputedStyle(s.querySelector('.tb-limpio')).gridTemplateColumns.split(' ').length,
  };
});
/^3 trabajos en el taller/.test(pintado.resumen)
  ? bien('el resumen dice cuántos trabajos hay: «' + pintado.resumen + '»')
  : mal('el resumen dice «' + pintado.resumen + '»');
/* Auditoría 2026-10-26, T1-9: las cinco estaciones y, al final, «Instalado, por cobrar» (`por_cobrar`). */
pintado.estaciones.length === 6 && pintado.estaciones[5] === 'por_cobrar'
  ? bien('el taller pinta las cinco estaciones y «Instalado, por cobrar»: ' + pintado.estaciones.join(', '))
  : mal('el taller pintó ' + pintado.estaciones.length + ' columnas: ' + pintado.estaciones.join(', '));
pintado.fichas === 3
  ? bien('una ficha por trabajo: 3')
  : mal('el taller pintó ' + pintado.fichas + ' fichas para 3 trabajos');
/* Con una instalación a 4 días y un plazo de dos semanas, el trabajo tiene que salir atrasado. */
pintado.tarde.some(t => /Healthylicious/.test(t))
  ? bien('Healthylicious va en rojo: con su instalación a 4 días, va tarde')
  : mal('Healthylicious no salió en rojo: ' + JSON.stringify(pintado.tarde));
pintado.columnas === 2
  ? bien('en monitor, dos columnas: lo pendiente a la izquierda y el taller a la derecha')
  : mal('en monitor el Tablero tiene ' + pintado.columnas + ' columna(s)');

// ── 6. El tope por rol enseña la razón, no un botón apagado ────────────────
console.log('\nEL TOPE POR ROL SE EXPLICA');
await p.evaluate(() => localStorage.setItem('al3d_pf_rol', 'fabricacion'));
await irA('#/hoy');
const comoFabrica = await p.evaluate(() => {
  const s = document.getElementById('mod-tablero');
  return {
    dinero: s.textContent.includes('$'),
    apagados: s.querySelectorAll('button[disabled]').length,
    fichas: s.querySelectorAll('.tb-ficha').length,
    titulo: (s.querySelector('#tb-nec-t') || {}).textContent || '',
  };
});
comoFabrica.dinero === false
  ? bien('con rol fabricación no se pinta ni un importe: el elemento no existe, no se difumina')
  : mal('con rol fabricación aparece un importe en el tablero');
comoFabrica.apagados === 0
  ? bien('y no hay ni un botón apagado: cuando el rol no puede, se escribe la razón')
  : mal('hay ' + comoFabrica.apagados + ' botones deshabilitados');
comoFabrica.fichas > 0 && comoFabrica.titulo === 'Pendientes'
  ? bien('fabricación ve el taller con sus ' + comoFabrica.fichas + ' fichas y sus «Pendientes»')
  : mal('fabricación no ve el taller como se espera: ' + JSON.stringify(comoFabrica));

await p.evaluate(() => localStorage.setItem('al3d_pf_rol', 'direccion'));

// ── 6b. La mesa de corte, empotrada ────────────────────────────────────────
/* El caso que caza el fallo MUDO. `svgnest.js` arranca sus Web Workers con
   `evalPath:'js/lib/eval.js'`, un literal relativo, y `new Worker(url)` resuelve contra la
   URL base del DOCUMENTO. Servido desde la raíz de la plataforma sería `/js/lib/eval.js`,
   que no existe — y no lanza excepción: deja un cálculo que nunca termina. Comprobar que el
   motor «está» no basta: hay que comprobar contra qué resuelve su ruta. */
console.log('\nLA MESA DE CORTE, DENTRO DEL TALLER');
/* Se entra como entra el taller desde el despeje: «Acomodar en la lámina» en la ficha de un
   trabajo en diseño. */
await irA('#/proyectos'); await p.waitForTimeout(400);
await p.evaluate(id => { const b = document.querySelector('[data-abrir="' + id + '"]'); if (b) b.click(); }, sembrado.creados[1]);
await p.waitForTimeout(800);
await p.click('#pf-ficha [data-anidar]');
await p.waitForTimeout(2600);

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

/* Y al salir de la mesa de corte —«Volver» al proyecto—, el marco se va: si la guarda se quedara
   puesta, un proyecto ganado en el cotizador ya no repintaría este tablero nunca más. */
await p.click('#mod-tablero .tb-volver .btn');
await p.waitForTimeout(1000);
(await p.evaluate(() => !document.getElementById('pf-anid-marco')))
  ? bien('al volver al proyecto, el marco se destruye — y con él sus Web Workers')
  : mal('el marco sigue en el DOM después de salir de la mesa de corte');
await p.evaluate(() => { const c = document.querySelector('#pf-ficha [data-cerrar-ficha]'); if (c) c.click(); });
await p.waitForTimeout(500);

// ── 6c. El Cotizador, empotrado ────────────────────────────────────────────
/* Los cuatro casos que importan, y ninguno se ve mirando la pantalla:
   · que el marco cargue y su script corra (157 manejadores en línea dependen de que el
     ámbito superior siga siendo el global; pruebas/publicacion.mjs los cuenta);
   · que se apaguen SOLO el logotipo y el enlace de vuelta, y que Historial —la única puerta
     a al3d_historial, el dato irrecuperable— siga visible y tocable;
   · que un `storage` de al3d_historial NO remonte la ruta, porque eso mataría el marco y
     recargaría 933 KB justo después de apretar Guardar;
   · y que el alto lo mida el padre, porque dentro del marco 100dvh describe el iframe. */
let dentro_hist = null;
console.log('\nEL COTIZADOR, COMO APARTADO');
await irA('#/cotizador');
(await montada()) === 'mod-cotizador'
  ? bien('#/cotizador monta su sección')
  : mal('#/cotizador montó ' + (await montada()));
(await pestana()) === 'Cotizador'
  ? bien('y su pestaña está encendida')
  : mal('la pestaña encendida dice «' + (await pestana()) + '»');

await p.waitForTimeout(2600);
const cot = p.frames().find(x => x.url().includes('cotizador.html'));
if (!cot) mal('el marco del cotizador no cargó');
else {
  bien('el marco carga cotizador.html');
  const dentro = await cot.evaluate(() => ({
    /* `Q` es la cotización viva. Que exista prueba que el guion de 645 KB corrió Y que los
       manejadores en línea siguen resolviendo contra el global. */
    tieneQ: typeof Q !== 'undefined',
    /* Y esto documenta la razón de no portarlo a módulo: una declaración de función SÍ cuelga
       de window, un `let` de nivel superior NO. En un módulo ES ninguna de las dos lo haría. */
    funcionGlobal: typeof window.irAPaso === 'function',
    letNoGlobal: typeof window._pantalla === 'undefined',
    empotrado: document.documentElement.classList.contains('empotrado'),
    pasos: document.querySelectorAll('.paso-tab').length,
    brand: (() => { const e = document.querySelector('.brand'); return e ? getComputedStyle(e).display : null; })(),
    btnPf: (() => { const e = document.querySelector('.btn-pf'); return e ? getComputedStyle(e).display : null; })(),
    /* No se compara contra un tamaño inventado: se mide, y más abajo se compara con la
       MISMA medida de la página suelta. Un umbral absoluto aquí solo probaría lo que yo creí
       que medía el botón —28 px, no 44— y no lo que importa, que es que empotrarlo no lo
       cambió. Los 28 px son diseño de siempre del cotizador, anterior a esto. */
    historial: (() => {
      const b = [...document.querySelectorAll('.btn-hist')].find(x => (x.getAttribute('aria-label') || '').includes('Historial'));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { display: getComputedStyle(b).display, w: Math.round(r.width), h: Math.round(r.height) };
    })(),
    /* Sin `sandbox`: por window.open sale el PDF, WhatsApp y Maps. */
    puedeAbrir: typeof window.open === 'function',
  }));
  dentro.tieneQ ? bien('su script corrió dentro del marco: la cotización viva existe')
                : mal('el script del cotizador NO corrió dentro del marco');
  dentro.funcionGlobal && dentro.letNoGlobal
    ? bien('y el ámbito superior sigue siendo el global (irAPaso sí cuelga de window, _pantalla no) — que es justo lo que un módulo ES rompería en silencio')
    : mal('el ámbito no es el esperado: ' + JSON.stringify(dentro));
  dentro.empotrado ? bien('el cotizador se sabe empotrado') : mal('no puso la clase .empotrado');
  dentro.pasos >= 4 ? bien('su escalera pinta ' + dentro.pasos + ' pasos') : mal('la escalera pintó ' + dentro.pasos);
  dentro.brand === 'none' ? bien('el logotipo con su título está apagado: un solo encabezado')
                          : mal('.brand sigue visible (display:' + dentro.brand + '): dos encabezados apilados');
  dentro.btnPf === 'none' ? bien('y el enlace de vuelta también: dentro del marco navegaría el marco')
                          : mal('.btn-pf sigue visible: al tocarlo anidaría la plataforma dentro de sí misma');
  dentro.historial && dentro.historial.display !== 'none' && dentro.historial.w > 40 && dentro.historial.h > 20
    ? bien('HISTORIAL sigue visible (' + dentro.historial.w + '×' + dentro.historial.h + ') — la única puerta al dato irrecuperable no se apagó')
    : mal('el botón de Historial quedó ' + JSON.stringify(dentro.historial) + ': apagar la barra entera habría apagado el trabajo');
  dentro_hist = dentro.historial;
  dentro.puedeAbrir ? bien('window.open sigue disponible: el PDF, WhatsApp y Maps siguen saliendo')
                    : mal('window.open no está: ¿se le puso sandbox al marco?');

  const alto = await p.evaluate(() => {
    const m = document.getElementById('pf-cot-marco');
    return m ? Math.round(m.getBoundingClientRect().height) : null;
  });
  alto > 350 ? bien('el padre le midió ' + alto + ' px de alto, no los 150 de la especificación')
             : mal('el marco quedó en ' + alto + ' px');

  /* LA GUARDA. cotizador.html escribe al3d_historial en cada guardado. */
  const urlAntes = await p.evaluate(() => {
    const m = document.getElementById('pf-cot-marco');
    return m ? m.contentWindow.location.href : null;
  });
  await p.evaluate(() => window.dispatchEvent(
    new StorageEvent('storage', { key: 'al3d_historial', newValue: '[]' })));
  await p.waitForTimeout(1300);
  const trasStorage = await p.evaluate(() => {
    const m = document.getElementById('pf-cot-marco');
    return { existe: !!m, href: m ? m.contentWindow.location.href : null };
  });
  trasStorage.existe && trasStorage.href === urlAntes
    ? bien('un storage de al3d_historial NO mata el marco: nadie pierde lo que acababa de guardar')
    : mal('el marco se remontó con un storage — 933 KB recargados tras apretar Guardar: ' + JSON.stringify(trasStorage));

  /* Y la vuelta por postMessage, que es lo que reemplaza al location.href que navegaría el
     marco. Se manda como lo haría irAPlataforma() desde dentro. */
  await cot.evaluate(() => parent.postMessage({ al3d: 'ir', ruta: 'proyectos' }, location.origin));
  await p.waitForTimeout(1200);
  (await montada()) === 'mod-proyectos'
    ? bien('un postMessage {al3d:"ir"} desde dentro navega EL PADRE, no el marco')
    : mal('el postMessage de vuelta no navegó: quedó en ' + (await montada()));
}

/* La página suelta NO cambió de comportamiento: sigue siendo una URL de primera clase, y sin
   marco no se apaga nada. Es lo que mantiene verdes las cuatro pruebas del cotizador. */
const suelto = await ctx.newPage();
await suelto.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
await suelto.waitForTimeout(1600);
const solo = await suelto.evaluate(() => ({
  empotrado: document.documentElement.classList.contains('empotrado'),
  brand: (() => { const e = document.querySelector('.brand'); return e ? getComputedStyle(e).display : null; })(),
  btnPf: (() => { const e = document.querySelector('.btn-pf'); return e ? getComputedStyle(e).display : null; })(),
  historial: (() => {
    const b = [...document.querySelectorAll('.btn-hist')].find(x => (x.getAttribute('aria-label') || '').includes('Historial'));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { display: getComputedStyle(b).display, w: Math.round(r.width), h: Math.round(r.height) };
  })(),
}));
!solo.empotrado && solo.brand !== 'none' && solo.btnPf !== 'none'
  ? bien('y la página suelta se comporta como siempre: sin clase, con logotipo y con su enlace a la plataforma')
  : mal('la página suelta cambió de comportamiento: ' + JSON.stringify(solo));
/* LA comparación que vale: el botón que abre el historial mide LO MISMO empotrado que
   suelto. Así, si alguien apaga de más en el modo empotrado, esto se cae. */
if (cot && solo.historial && dentro_hist) {
  solo.historial.w === dentro_hist.w && solo.historial.h === dentro_hist.h
    ? bien('y Historial mide exactamente lo mismo empotrado que suelto (' + solo.historial.w + '×' + solo.historial.h + '): el modo empotrado no encogió nada')
    : mal('Historial mide ' + JSON.stringify(dentro_hist) + ' empotrado y ' + JSON.stringify(solo.historial) + ' suelto');
}
await suelto.close();

// ── 6d. El aterrizaje: llegar al siguiente paso sin volver al menú ─────────
/* Es EL criterio de aceptación del reacomodo. Los botones ya navegaban antes de esto; lo que
   no hacían era aterrizar: «Abrir» te dejaba en la lista de proyectos, donde hay que volver a
   buscar el que ya estabas mirando. Eso es el salto que había que quitar, y es lo único de
   esta prueba que mide la queja original y no un detalle técnico. */
console.log('\nEL ATERRIZAJE');
await irA('#/hoy');
await p.waitForTimeout(400);

/* Tocar la ficha de un trabajo en el taller tiene que dejar SU ficha abierta, no la lista. */
const abrir = await p.evaluateHandle(() => document.querySelector('#mod-tablero .tb-ficha') || null);
if (!abrir || !(await abrir.evaluate(e => !!e))) mal('no hay ninguna ficha en el taller');
else {
  await abrir.asElement().click();
  await p.waitForTimeout(1400);
  const tras = await p.evaluate(() => ({
    montada: (() => { const s = [...document.querySelectorAll('.pf-mod')].find(x => !x.hidden); return s ? s.id : null; })(),
    fichaAbierta: !!document.querySelector('#pf-ficha.show'),
    titulo: (() => { const h = document.querySelector('#pf-ficha .pf-panel-h h2'); return h ? h.textContent.trim().slice(0, 40) : null; })(),
  }));
  tras.montada === 'mod-proyectos'
    ? bien('la ficha del taller lleva a Proyectos')
    : mal('la ficha del taller llevó a ' + tras.montada);
  tras.fichaAbierta
    ? bien('Y LA FICHA YA ESTÁ ABIERTA («' + tras.titulo + '»): no hay que volver a buscar lo que ya estabas mirando')
    : mal('llegó a la lista con la ficha CERRADA: el salto sigue ahí, que es la queja original');

  /* Y volver por la barra de pestañas SÍ da la lista: el pase es de un solo uso, y una
     llegada nueva empieza donde empiezan las llegadas nuevas. */
  await p.evaluate(() => { const c = document.querySelector('#pf-ficha .pf-cerrar'); if (c) c.click(); });
  await p.waitForTimeout(500);
  await p.click('.pf-tab[data-ruta="hoy"]');
  await p.waitForTimeout(800);
  await p.click('.pf-tab[data-ruta="proyectos"]');
  await p.waitForTimeout(1000);
  (await p.evaluate(() => !document.querySelector('#pf-ficha.show')))
    ? bien('y entrar por la pestaña da la lista, con la ficha cerrada: el pase es de un solo uso')
    : mal('el pase se quedó pegado: entrar por la pestaña reabrió una ficha vieja');
}

/* Del taller a la mesa de corte, con el proyecto puesto. El botón vivía en la lente Taller del
   Calendario; desde 7dabd21 el Calendario solo enseña las entregas (sin lentes), el botón se mudó
   a cada renglón del Tablero, y con el despeje de octubre de 2026 vive SOLO en la ficha del
   proyecto, junto al paso que sigue. */
console.log('\nDEL TALLER A LA MESA DE CORTE');
await irA('#/agenda');
await p.waitForTimeout(600);
const calendario = await p.evaluate(() => ({
  lentes: document.querySelectorAll('#mod-fabricacion [data-lente]').length,
  anidar: document.querySelectorAll('#mod-fabricacion [data-anidar]').length,
}));
calendario.lentes === 0 && calendario.anidar === 0
  ? bien('el Calendario solo enseña entregas: sin lentes ni «Acomodar en la lámina»')
  : mal('el Calendario volvió a tener la lente Taller: ' + JSON.stringify(calendario));

/* Uno ya armado, para que «la ficha de uno ya armado no la ofrece» mida algo: los tres de la
   siembra están antes del corte. */
const armado = await p.evaluate(async () => {
  const Proy = await import('./js/datos/proyectos.js');
  const letras = { id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8 };
  const r = await Proy.ganar({ folio: 'COT-9004', cliente: 'Gym Titanio', proy: 'Gym Titanio — anuncio', ts: Date.now(),
    estado: 'autorizada', items: [letras], neto: 40000, itemsAuth: { 1: 40000 } }, {});
  if (!r.ok) return 'ganar: ' + r.mensaje;
  for (const e of ['en_diseno', 'cortado', 'armado']) {
    const a = await Proy.avanzarEtapa(r.valor.id, e);
    if (!a.ok) return e + ': ' + a.mensaje;
  }
  return 'ok';
});
armado === 'ok' ? bien('un cuarto proyecto, ya armado') : mal('no se pudo armar el cuarto proyecto: ' + armado);

await irA('#/hoy');
(await p.evaluate(() => document.querySelectorAll('#mod-tablero [data-anidar]').length === 0))
  ? bien('el Tablero ya no ofrece «Acomodar en la lámina»: vive en la ficha del proyecto')
  : mal('el Tablero volvió a ofrecer «Acomodar en la lámina» en sus renglones');
const idParen = sembrado.creados[1];

/* La otra puerta: la ficha de Proyectos, que no depende de que el proyecto tenga renglón en el
   Tablero (sin ninguna fecha en el taller, el Tablero no pinta renglones). */
await irA('#/proyectos'); await p.waitForTimeout(400);
await p.evaluate(id => { const b = document.querySelector('[data-abrir="' + id + '"]'); if (b) b.click(); }, idParen);
await p.waitForTimeout(800);
const enFicha = await p.evaluate(() => {
  const b = document.querySelector('#pf-ficha.show [data-anidar]');
  return b ? b.textContent.replace(/\s+/g, ' ').trim() : null;
});
/Acomodar en la lámina/.test(enFicha || '')
  ? bien('la ficha del proyecto en diseño ofrece «Acomodar en la lámina»')
  : mal('la ficha no ofrece «Acomodar en la lámina»: ' + enFicha);
await p.click('#pf-ficha [data-anidar]');
await p.waitForTimeout(2600);
const deFicha = await p.evaluate(() => ({
  hash: location.hash,
  ficha: !!document.querySelector('#pf-ficha.show'),
  marco: !!document.getElementById('pf-anid-marco'),
  dice: [...document.querySelectorAll('#mod-tablero .hintnote')].map(h => h.textContent.replace(/\s+/g, ' ').trim()).join(' | '),
}));
deFicha.hash === '#/hoy' && !deFicha.ficha && deFicha.marco && /Vienes de Parentesis/.test(deFicha.dice) && /folio COT-9002/.test(deFicha.dice)
  ? bien('y lleva a la mesa de corte del Tablero, con la ficha cerrada y el aviso de dónde vienes')
  : mal('desde la ficha no llegó bien a la mesa: ' + JSON.stringify(deFicha).slice(0, 200));
await p.goBack();
await p.waitForTimeout(1200);
(await p.evaluate(() => location.hash === '#/proyectos' && !document.querySelector('#pf-ficha.show')))
  ? bien('el atrás regresa a Proyectos, sin reabrir la ficha')
  : mal('el atrás tras ir a la mesa dejó ' + await p.evaluate(() => location.hash + (document.querySelector('#pf-ficha.show') ? ' con la ficha abierta' : '')));
/* La del proyecto armado no la ofrece. */
const idArmado = await p.evaluate(async () => {
  const Proy = await import('./js/datos/proyectos.js');
  const l = await Proy.listar({});
  const x = l.find(q => q.folio_local === 'COT-9004');
  return x ? x.id : null;
});
await irA('#/proyectos'); await p.waitForTimeout(400);
await p.evaluate(id => { const b = document.querySelector('[data-abrir="' + id + '"]'); if (b) b.click(); }, idArmado);
await p.waitForTimeout(800);
(await p.evaluate(() => !!document.querySelector('#pf-ficha.show') && !document.querySelector('#pf-ficha [data-anidar]')))
  ? bien('y la ficha de uno ya armado no la ofrece')
  : mal('la ficha de un proyecto armado ofrece «Acomodar en la lámina» (o no abrió)');
await p.evaluate(() => { const c = document.querySelector('#pf-ficha [data-cerrar-ficha]'); if (c) c.click(); });
await p.waitForTimeout(500);

/* Pagos no tiene la mesa de corte: no se le ofrece. */
await p.evaluate(() => localStorage.setItem('al3d_pf_rol', 'pagos'));
await irA('#/hoy');
(await p.evaluate(() => document.querySelectorAll('[data-anidar]').length === 0))
  ? bien('con rol pagos no aparece «Acomodar en la lámina» en el Tablero: su barra no tiene la mesa')
  : mal('a pagos se le ofrece una mesa de corte que no tiene');
await irA('#/proyectos'); await p.waitForTimeout(400);
await p.evaluate(id => { const b = document.querySelector('[data-abrir="' + id + '"]'); if (b) b.click(); }, idParen);
await p.waitForTimeout(800);
(await p.evaluate(() => !!document.querySelector('#pf-ficha.show') && !document.querySelector('#pf-ficha [data-anidar]')))
  ? bien('ni en la ficha de Proyectos')
  : mal('a pagos la ficha le ofrece la mesa de corte (o no abrió)');
await p.evaluate(() => { const c = document.querySelector('#pf-ficha [data-cerrar-ficha]'); if (c) c.click(); });
await p.waitForTimeout(500);
await p.evaluate(() => localStorage.setItem('al3d_pf_rol', 'direccion'));

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
    /* Lo que se ve en un teléfono es la barra de ABAJO: la lateral (.pf-tab) está en
       display:none a este ancho, y contar sus pestañas medía un mueble que no existe ahí.
       Con Control la lateral tiene 7 para dirección, y la de abajo sigue en 5. */
    tabs: [...document.querySelectorAll('#pf-abajo button')].filter(b => b.offsetParent !== null).length,
  };
});
enTel.monta ? bien('el tablero monta en 375 px') : mal('el tablero no monta en el teléfono');
enTel.scrollH === false ? bien('y no hay desplazamiento horizontal')
                        : mal('en 375 px la página se desplaza a lo ancho');
enTel.tabs > 0 && enTel.tabs <= 5 ? bien('la barra de abajo tiene ' + enTel.tabs + ' pestañas (tope de 5 en el teléfono)')
                : mal('la barra de abajo tiene ' + enTel.tabs + ' pestañas: son demasiadas para 375 px');
await tel.close();

// ── 8. Sin errores de página ───────────────────────────────────────────────
console.log('\nSIN ERRORES DE PÁGINA');
const todos = errs.concat(errsTel);
if (todos.length) todos.slice(0, 8).forEach(e => mal('error de página: ' + e));
else bien('cero errores de página en todo el recorrido');

console.log('\n' + (fallos ? fallos + ' fallo(s).' : 'El tablero es la puerta, y ninguna ruta grabada se rompió.'));
await nav.close();
process.exit(fallos ? 1 : 0);
