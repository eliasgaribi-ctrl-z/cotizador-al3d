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

// ── 6b-bis. El vectorizador, la otra mitad de la faena ─────────────────────
/* Vectorizar y anidar son un trabajo partido en dos, y el vectorizador solo se alcanzaba
   desde el paso 2 del cotizador: quien corta tenía que salirse de Fabricación. Se empotra el
   MISMO cotizador.html con `?abrir=vector` porque el aparato lee `SC` —la calibración del
   escalador—, `Q.aiFile` y `addItem()`, y fuera de ese documento las tres se caen en
   silencio. Lo que se prueba aquí es lo que no se ve mirando la pantalla. */
console.log('\nEL VECTORIZADOR, AL LADO DE LA MESA DE CORTE');
const lentes = await p.$$eval('[data-vista]', ns => ns.map(n => n.dataset.vista));
lentes.join(',') === 'tablero,vector,anidador'
  ? bien('tres lentes, en el orden en que se trabaja: ' + lentes.join(' · '))
  : mal('el segmento tiene ' + JSON.stringify(lentes));

await p.click('[data-vista="vector"]');
await p.waitForTimeout(3800);
const mv = p.frames().find(x => x.url().includes('cotizador.html'));
if (!mv) mal('la sub-vista Vectorizador no cargó su marco');
else {
  bien('el marco carga ' + mv.url().replace(B, ''));
  /* El caso que caza el fallo mudo de ESTA lente: `?abrir=vector` corre al final de init(),
     cuando loadState() ya dejó Q y SC en pie. Si se adelantara, el modal abriría sin saber
     qué botones de origen enseñar y nadie lo notaría hasta usarlo. */
  const dentro = await mv.evaluate(() => ({
    abierto: document.getElementById('vectormodal').classList.contains('show'),
    empotrado: document.documentElement.classList.contains('empotrado'),
    tieneSC: typeof SC !== 'undefined' && !!SC,
    tieneQ: typeof Q !== 'undefined' && !!Q && typeof Q.folio === 'string',
    puedePartida: typeof addItem === 'function',
  }));
  dentro.abierto ? bien('el Vectorizador Pro abre puesto, sin un clic más')
                 : mal('el modal no quedó abierto: ' + JSON.stringify(dentro));
  dentro.empotrado ? bien('el cotizador se sabe empotrado') : mal('no puso la clase .empotrado');
  dentro.tieneSC && dentro.tieneQ && dentro.puedePartida
    ? bien('y llega ENTERO: SC (la calibración del escalador), Q y addItem() están en pie')
    : mal('el aparato llegó incompleto: ' + JSON.stringify(dentro));

  /* Y AUN LLEGANDO ENTERO, NO ENSEÑA TODO. El escalador y la IA son herramientas de
     COTIZACIÓN —no existen en ningún otro sitio de la app— y una partida, por definición,
     también. Las cinco salidas que el vectorizador comparte con la cotización no son de quien
     corta, y «Agregar como partida» es la peor: escribiría un renglón en la cotización que
     estuviera abierta, desde la pestaña de Fabricación.
     Se comprueba el ALTO y no el `display`: varias funciones del aparato vuelven a encender
     esos nodos solas, y lo que los mantiene apagados es `hidden` con el `!important` de la
     hoja. Si alguien cambia el `hidden` por un `style.display`, esto lo dice. */
  const soloCotizando = ['vt-use-ai-btn', 'vt-use-sc-btn', 'vt-esc-usar-sc',
                         'vt-btn-partidas', 'vt-btn-scaler'];
  const visibles = await mv.evaluate(ids => {
    if (typeof vtPintarEscalaSc === 'function') vtPintarEscalaSc();
    return ids.filter(id => {
      const n = document.getElementById(id);
      return n && n.getBoundingClientRect().height > 0;
    });
  }, soloCotizando);
  visibles.length === 0
    ? bien('y las cinco salidas de cotización quedan apagadas, incluso tras repintar el panel')
    : mal('desde el Taller siguen a la vista: ' + visibles.join(', '));

  const etiqueta = await mv.evaluate(() =>
    (document.querySelector('#vectormodal .sp-close') || {}).getAttribute?.('aria-label'));
  etiqueta === 'Volver al taller'
    ? bien('y la salida dice «Volver al taller», no «al cotizador»')
    : mal('la salida sigue diciendo ' + JSON.stringify(etiqueta));

  const altoV = await p.evaluate(() => {
    const m = document.getElementById('pf-vect-marco');
    return m ? Math.round(m.getBoundingClientRect().height) : null;
  });
  altoV > 400 ? bien('el marco mide ' + altoV + ' px: alRedimensionar mide el marco que está puesto')
              : mal('el marco quedó en ' + altoV + ' px — ¿se midió el del anidador?');

  /* «Acomodar en hoja» avisaba al padre para que abriera otra pestaña. Con las dos lentes
     juntas, es pasar al segmento de al lado. */
  await mv.evaluate(() => parent.postMessage({ al3d: 'anidar' }, location.origin));
  await p.waitForTimeout(1400);
  const tras = await p.evaluate(() => ({
    lente: (document.querySelector('[data-vista].on') || {}).dataset?.vista || null,
    anid: !!document.getElementById('pf-anid-marco'),
    vect: !!document.getElementById('pf-vect-marco'),
  }));
  tras.lente === 'anidador' && tras.anid && !tras.vect
    ? bien('«Acomodar en hoja» pasa a la Mesa de corte y se lleva su marco')
    : mal('tras el aviso quedó ' + JSON.stringify(tras));
}

/* La × del vectorizador no puede limitarse a esconder su modal: debajo hay un cotizador
   entero, y enseñarlo dentro de Fabricación sería una app dentro de otra. */
await p.click('[data-vista="vector"]');
await p.waitForTimeout(3800);
const mv2 = p.frames().find(x => x.url().includes('cotizador.html'));
if (!mv2) mal('el Vectorizador no volvió a cargar');
else {
  await mv2.evaluate(() => cerrarVector());
  await p.waitForTimeout(900);
  const cerrado = await p.evaluate(() => ({
    lente: (document.querySelector('[data-vista].on') || {}).dataset?.vista || null,
    vect: !!document.getElementById('pf-vect-marco'),
  }));
  cerrado.lente === 'tablero' && !cerrado.vect
    ? bien('la × devuelve a la carga del taller y destruye el marco, no deja un cotizador suelto')
    : mal('al cerrar quedó ' + JSON.stringify(cerrado));
}

// ── 6c. El Cotizador, empotrado ────────────────────────────────────────────
/* Los cuatro casos que importan, y ninguno se ve mirando la pantalla:
   · que el marco cargue y su script corra (273 manejadores en línea dependen de que el
     ámbito superior siga siendo el global);
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

/* «Abrir» de un renglón del taller tiene que dejar la FICHA abierta, no la lista. */
const abrir = await p.evaluateHandle(() => {
  const f = document.querySelector('#mod-tablero .pf-fila.tal-fila');
  if (!f) return null;
  return [...f.querySelectorAll('button')].find(b => b.textContent.trim() === 'Abrir') || null;
});
if (!abrir || !(await abrir.evaluate(e => !!e))) mal('no hay botón «Abrir» en el primer renglón del taller');
else {
  await abrir.asElement().click();
  await p.waitForTimeout(1400);
  const tras = await p.evaluate(() => ({
    montada: (() => { const s = [...document.querySelectorAll('.pf-mod')].find(x => !x.hidden); return s ? s.id : null; })(),
    fichaAbierta: !!document.querySelector('#pf-ficha.show'),
    titulo: (() => { const h = document.querySelector('#pf-ficha .pf-panel-h h2'); return h ? h.textContent.trim().slice(0, 40) : null; })(),
  }));
  tras.montada === 'mod-proyectos'
    ? bien('«Abrir» lleva a Proyectos')
    : mal('«Abrir» llevó a ' + tras.montada);
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

/* Del taller a la mesa de corte, con el proyecto puesto. */
await irA('#/agenda');
await p.waitForTimeout(600);
const hayAnidar = await p.evaluate(() => {
  const b = document.querySelector('[data-anidar]');
  return b ? { existe: true, txt: b.textContent.trim() } : { existe: false };
});
if (!hayAnidar.existe) {
  /* Puede no estar si la lente abierta no es Taller o si nada está en ganado/en_diseño. */
  await p.evaluate(() => { const b = document.querySelector('[data-lente="taller"]'); if (b) b.click(); });
  await p.waitForTimeout(900);
}
const anidarAhora = await p.evaluate(() => !!document.querySelector('[data-anidar]'));
if (!anidarAhora) mal('la lente Taller no ofrece «Acomodar en la lámina» en ningún renglón');
else {
  bien('la lente Taller ofrece «Acomodar en la lámina»');
  await p.click('[data-anidar]');
  await p.waitForTimeout(2600);
  const llegada = await p.evaluate(() => ({
    montada: (() => { const s = [...document.querySelectorAll('.pf-mod')].find(x => !x.hidden); return s ? s.id : null; })(),
    marco: !!document.getElementById('pf-anid-marco'),
    dice: (() => { const h = document.querySelector('#mod-tablero .hintnote'); return h ? h.textContent.trim().slice(0, 60) : null; })(),
  }));
  llegada.montada === 'mod-tablero' && llegada.marco
    ? bien('aterriza en la mesa de corte, sin pestaña nueva del navegador')
    : mal('no llegó a la mesa de corte: ' + JSON.stringify(llegada));
  llegada.dice && llegada.dice.includes('Vienes de')
    ? bien('y dice de dónde vienes: «' + llegada.dice + '…»')
    : mal('llegó sin decir de qué proyecto viene: ' + JSON.stringify(llegada.dice));
}

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
