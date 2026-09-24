/* LA CAPA DE VIDRIO HACE LO QUE DICE, Y SE APAGA CUANDO SE LE PIDE.
 *
 * css/vidrio.css es la única hoja que se lee DESPUÉS de todas las demás, y casi todo lo que
 * escribe son selectores de UNA clase: `.topbar`, `.card`, `.btn`, `.pf-cab`. O sea que su
 * efecto no depende de nada más que del orden de carga, y el orden de carga es justo lo que no
 * se ve al mirar la página. `pruebas/hojas-de-estilo.mjs` vigila ese orden en el HTML; lo que
 * falta —y es lo que se comprueba aquí— es que el navegador acabe pintando lo que la hoja dice.
 *
 * Las chispas de los botones de IA se miden aparte porque son lo ÚNICO que esta capa estrena
 * de verdad —el degradado y el barrido ya existían, medidos, en sistema.css— y porque nacieron
 * con un fallo que no se ve a ojo: un `@media` NO suma especificidad, así que la regla de
 * `prefers-reduced-motion` perdía contra la de `:hover` y las chispas saltaban igual con la
 * preferencia puesta. Se ve con getComputedStyle y no se ve mirando.
 *
 * Al final, dos piezas del cromado de la plataforma que tienen el mismo tipo de fallo: la hoja
 * promete que son iguales —los dos botones del encabezado del teléfono, las cifras de una fila
 * de Control— y salen iguales en el caso que uno mira y distintas en el de al lado.
 *
 * Necesita navegador y servidor, así que va en pruebas/navegador/:
 *
 *   pruebas/correr.sh --navegador
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const B = 'http://127.0.0.1:' + (process.env.PUERTO || '8814');
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let fallos = 0;
const bien = m => console.log('  ✓ ' + m);
const mal = m => { console.log('  ✗ ' + m); fallos++; };
const cierto = (cond, que) => cond ? bien(que) : mal(que);

/* Deja el cotizador en el paso 2, que es donde vive «Cotizar con IA». */
async function enPartidas(p) {
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await p.goto(B + '/cotizador.html?solo=1', { waitUntil: 'load' });
  await p.waitForTimeout(1300);
  await p.fill('#f-cli', 'Farmacia San Juan');
  await p.fill('#f-tel', '33 1234 5678');
  await p.fill('#f-proy', 'Letrero de fachada');
  await p.evaluate(() => irAPaso(2));
  await p.waitForTimeout(700);
}

const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX' });
const p = await ctx.newPage();
await enPartidas(p);

console.log('\nLA HOJA LLEGA, Y LLEGA LA ÚLTIMA');
const tokens = await p.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return { cifra: cs.getPropertyValue('--f-cifra').trim(), texto: cs.getPropertyValue('--f-texto').trim(),
           accion: cs.getPropertyValue('--cv-accion').trim() };
});
cierto(/^'?Sora'?/.test(tokens.cifra), '--f-cifra empieza por Sora (' + tokens.cifra.slice(0, 24) + '…)');
cierto(/^'?Manrope'?/.test(tokens.texto), '--f-texto empieza por Manrope (' + tokens.texto.slice(0, 24) + '…)');
/* La reserva de emoji y símbolos es lo que la entrega se dejaba por el camino. */
cierto(/Noto Color Emoji/.test(tokens.texto) && /Noto Sans Symbols 2/.test(tokens.texto),
  'y conserva la reserva de emoji y símbolos del sistema');
cierto(tokens.accion !== '', 'el degradado de acción existe como token');

/* El radio es la prueba más barata de que la hoja GANÓ: son pastillas de 999 px contra los
   4-12 px de sistema.css, y si la hoja se leyera antes no habría ninguna. */
const radios = await p.evaluate(() => {
  const r = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).borderRadius : null; };
  return { pasos: r('.pasos'), chip: r('#items .chip'), aibtn: r('#aibtn'), card: r('.card') };
});
cierto(parseFloat(radios.pasos) >= 100, 'el riel de los cuatro pasos es una pastilla (' + radios.pasos + ')');
cierto(parseFloat(radios.chip) >= 100, 'un chip de partida es una pastilla (' + radios.chip + ')');
cierto(parseFloat(radios.aibtn) >= 100, '«Cotizar con IA» es una pastilla (' + radios.aibtn + ')');
cierto(parseFloat(radios.card) >= 20, 'y una tarjeta va a 20 px (' + radios.card + ')');

console.log('\nEL VIDRIO ESTÁ EN EL CROMADO Y NO EN LAS PARTIDAS');
/* Veinte tarjetas traslúcidas seguidas cansan la vista y cuestan batería: es una decisión
   escrita en la hoja, así que se vigila que siga siendo verdad. */
const desenfoque = await p.evaluate(() => {
  const b = s => { const e = document.querySelector(s); if (!e) return null;
    const c = getComputedStyle(e); return (c.backdropFilter || c.webkitBackdropFilter || 'none'); };
  return { topbar: b('.topbar'), pasos: b('.pasos'), sum: b('.side>.sum'), partida: b('#items .partida') };
});
cierto(/blur/.test(desenfoque.topbar || ''), 'la barra de arriba lleva vidrio');
cierto(/blur/.test(desenfoque.pasos || ''), 'el riel de pasos lleva vidrio');
cierto(/blur/.test(desenfoque.sum || ''), 'la columna del dinero lleva vidrio');
cierto(desenfoque.partida === null || !/blur/.test(desenfoque.partida),
  'y una partida NO lo lleva, que es a propósito (' + desenfoque.partida + ')');

console.log('\nLAS CHISPAS DEL BOTÓN DE IA');
const chispas = () => p.evaluate(() => {
  const s = getComputedStyle(document.querySelector('#aibtn > span'), '::after');
  return { anim: s.animationName, op: s.opacity };
});
cierto((await chispas()).anim === 'none', 'en reposo no animan');
await p.hover('#aibtn');
await p.waitForTimeout(250);
cierto((await chispas()).anim === 'vid-chispas', 'al pasar el cursor saltan');
await ctx.close();

console.log('\nY CON prefers-reduced-motion NO SALTAN');
/* El caso que se coló: la regla de `:hover` tiene una pseudoclase más que la del `@media`, y
   como un `@media` no suma especificidad, ganaba la del hover. */
const ctxR = await nav.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-MX',
                                    reducedMotion: 'reduce' });
const pr = await ctxR.newPage();
await enPartidas(pr);
await pr.hover('#aibtn');
await pr.waitForTimeout(250);
const quieto = await pr.evaluate(() => {
  const s = getComputedStyle(document.querySelector('#aibtn > span'), '::after');
  return { anim: s.animationName, op: s.opacity };
});
cierto(quieto.anim === 'none', 'con el cursor encima siguen sin animar (' + quieto.anim + ')');
cierto(quieto.op === '0', 'y siguen invisibles (opacidad ' + quieto.op + ')');
await ctxR.close();

/* ---------- La plataforma ----------
   Dos piezas del cromado de index.html que la hoja promete iguales y que el navegador pintaba
   distintas sin que nada avisara: salen bien en el caso que uno mira —el teléfono con dedo, la
   computadora— y mal en el de al lado. Se miden con getBoundingClientRect y getComputedStyle en
   todos los casos, no en uno. */
console.log('\nEL ENCABEZADO DEL TELÉFONO: TEMA Y AJUSTES, GEMELOS');
/* Los dos comparten `.pf-cab-tema`, pero el de tema es además `.btn-tema`, y sistema.css le da a
   esa clase 44 px de alto mínimo. Con el dedo no se notaba —los dos suben a 44×44—; con ratón,
   en una ventana angosta o media pantalla de una laptop, salían de 36×44 y de 36×36. El tema lo
   pone js/tema.js siguiendo al sistema, que es lo que emulateMedia le cambia. */
for (const dedo of [false, true]) {
  const c = await nav.newContext({ viewport: { width: 390, height: 800 }, hasTouch: dedo, locale: 'es-MX' });
  const pg = await c.newPage();
  await pg.goto(B + '/index.html', { waitUntil: 'load' });
  await pg.waitForTimeout(900);
  for (const ancho of [390, 700]) {
    await pg.setViewportSize({ width: ancho, height: 800 });
    for (const tema of ['claro', 'oscuro']) {
      await pg.emulateMedia({ colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
      await pg.waitForTimeout(120);
      const m = await pg.evaluate(() => {
        const f = s => { const e = document.querySelector(s), r = e.getBoundingClientRect(), cs = getComputedStyle(e);
          return { w: r.width, h: r.height, top: r.top, fondo: cs.backgroundColor, radio: cs.borderRadius,
                   borde: cs.borderTopWidth + ' ' + cs.borderTopStyle }; };
        return { puesto: document.documentElement.getAttribute('data-tema'),
                 tema: f('.pf-cab [data-tema-btn]'), aj: f('#pf-cab-ajustes') };
      });
      const t = m.tema, a = m.aj;
      const que = ancho + ' px, ' + (dedo ? 'con el dedo' : 'con ratón') + ', en ' + tema;
      cierto(m.puesto === tema, que + ': la página está de verdad en ' + tema + ' (data-tema=' + m.puesto + ')');
      cierto(t.w === a.w && t.h === a.h && t.top === a.top && t.w === t.h,
        que + ': dos cuadrados del mismo tamaño y a la misma altura (' + t.w + '×' + t.h + ' y ' + a.w + '×' + a.h + ')');
      cierto(t.fondo === a.fondo && t.radio === a.radio && t.borde === a.borde,
        que + ': con el mismo fondo, radio y borde (' + t.fondo + ', ' + t.radio + ')');
    }
  }
  await c.close();
}

console.log('\nLAS CIFRAS DE UNA FILA DE CONTROL, A UN SOLO TAMAÑO');
/* filaCuentas() de js/mod/control.js le pone a todas las cifras de la fila el `--c` de la más
   larga, y la hoja saca el tamaño de 100cqi, el ancho de CADA tarjeta. Con la del dinero estirada
   al renglón entero en ≤360 px, su cifra salía a 24 px y las otras cinco a 15, con el mismo
   número de caracteres. Se siembra una venta por la capa de datos para que haya un importe largo
   junto a «$0.00» y «—», y se mide en los anchos donde cambia el reparto. */
const cc = await nav.newContext({ viewport: { width: 390, height: 900 }, locale: 'es-MX',
                                  timezoneId: 'America/Mexico_City' });
const pc = await cc.newPage();
await pc.goto(B + '/index.html#/control', { waitUntil: 'load' });
await pc.waitForTimeout(1100);
const sembro = await pc.evaluate(async () => {
  const Proy = await import('./js/datos/proyectos.js');
  const Agenda = await import('./js/datos/agenda.js');
  const { masDias, hoyISO } = await import('./js/nucleo/fechas.js');
  const r = await Proy.ganar({ folio: 'COT-9301', cliente: 'Healthylicious', proy: 'Healthylicious — anuncio',
    ts: Date.now(), estado: 'autorizada', neto: 212900, itemsAuth: { 1: 212900 },
    items: [{ id: 1, tipo: 'letras', material: 'acero', comp: 'recta', luz: true, ilumTipo: 'fria', altura: 40, n: 8 }] }, {});
  if (!r.ok) return r.mensaje;
  /* Con fecha, para que el Tablero la cuente en el taller y pinte su importe (caso de abajo). */
  const a = await Agenda.agendar(r.valor.id, { fecha: masDias(hoyISO(), 4) });
  return a.ok ? '' : a.mensaje;
});
cierto(sembro === '', 'se siembra una venta de $212,900.00, con fecha' + (sembro ? ': ' + sembro : ''));
await pc.reload({ waitUntil: 'load' });
await pc.waitForTimeout(1300);
const cifras = sel => pc.evaluate(sel => {
  const f = document.querySelector(sel);
  return f ? [...f.querySelectorAll('.pf-cuenta')].map(c => {
    const b = c.querySelector('b'), cs = getComputedStyle(c), r = document.createRange();
    r.selectNodeContents(b);
    return { t: b.textContent, px: parseFloat(getComputedStyle(b).fontSize), ancho: r.getBoundingClientRect().width,
             caja: c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
             dinero: c.classList.contains('dinero') };
  }) : [];
}, sel);
const lista = cs => cs.map(x => x.t + ' ' + x.px.toFixed(1)).join(' · ');
for (const tab of ['ventas', 'cobrar']) {
  if (tab === 'cobrar') { await pc.click('#mod-control [data-tab="cobrar"]'); await pc.waitForTimeout(500); }
  for (const ancho of [320, 360, 390, 768]) {
    await pc.setViewportSize({ width: ancho, height: 900 });
    await pc.waitForTimeout(200);
    const cs = await cifras('#mod-control .pf-cuentas');
    const px = cs.map(x => x.px);
    const que = (tab === 'ventas' ? 'Ventas' : 'Por cobrar') + ' a ' + ancho + ' px';
    cierto(cs.length >= 3 && cs.some(x => x.dinero) && cs.some(x => x.t.length >= 11),
      que + ': la fila trae ' + cs.length + ' cuentas, con el importe largo en la del dinero');
    /* La tolerancia es la del reparto de la rejilla: Chromium mide las pistas en 1/64 de px, y
       una pista 1/64 más ancha le da 0,002 px más de letra a su cifra. */
    cierto(Math.max(...px) - Math.min(...px) < 0.05, que + ': todas las cifras al mismo tamaño (' + lista(cs) + ')');
    const salen = cs.filter(x => x.ancho > x.caja + 0.5);
    cierto(!salen.length, que + ': y ninguna se sale de su tarjeta' +
      (salen.length ? ' (' + salen.map(x => x.t + ' pide ' + x.ancho.toFixed(0) + ' en ' + x.caja.toFixed(0)).join(', ') + ')' : ''));
  }
}

/* Y la otra cara: en la fila del Tablero el importe va entre conteos que no se achican, y ahí
   el renglón entero es justo lo que lo deja a su altura. Quitar el estirón para todos habría
   arreglado Control rompiendo esta. Se mide hasta 400 px, donde los conteos bajan a 24: con el
   estirón solo hasta 360, a 361, 375, 390 y 400 el importe quedaba en media fila a 18,5-20,5 px
   junto a conteos de 24 —los iPhone más comunes—. Más ancho los conteos suben a 28 y el importe
   no los alcanza; igualar eso ya es otra decisión (ver `.pf-cuenta.dinero` en plataforma.css). */
await pc.goto(B + '/index.html#/hoy', { waitUntil: 'load' });
await pc.waitForTimeout(1300);
for (const ancho of [320, 360, 361, 375, 390, 400]) {
  await pc.setViewportSize({ width: ancho, height: 900 });
  await pc.waitForTimeout(200);
  const tb = await cifras('#mod-tablero .pf-cuentas:not(.tb-linea)');
  const tbPx = tb.map(x => x.px);
  cierto(tb.some(x => x.dinero && x.t.length >= 11) && Math.max(...tbPx) - Math.min(...tbPx) < 0.05,
    'en el Tablero a ' + ancho + ' px el importe va a la altura de los conteos (' + lista(tb) + ')');
  const salen = tb.filter(x => x.ancho > x.caja + 0.5);
  cierto(!salen.length, 'en el Tablero a ' + ancho + ' px ninguna cifra se sale de su tarjeta' +
    (salen.length ? ' (' + salen.map(x => x.t + ' pide ' + x.ancho.toFixed(0) + ' en ' + x.caja.toFixed(0)).join(', ') + ')' : ''));
}
await cc.close();

console.log(fallos ? '\n' + fallos + ' fallo(s) en la capa de vidrio.'
                   : '\nLa capa de vidrio llega entera, y se apaga cuando se le pide.');
await nav.close();
process.exit(fallos ? 1 : 0);
