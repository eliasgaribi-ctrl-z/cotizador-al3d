/* LAS DEFENSAS DEL COTIZADOR QUE UNA AUDITORÍA ENCONTRÓ ABIERTAS, UNA POR UNA.
 *
 * Ninguna de éstas se ve mirando la pantalla. Un sello viejo que cierra una solicitud nueva
 * deja la cotización «autorizada» con un precio que dirección no vio; un rechazo que llega con
 * la cotización en la cola no se dice y se pregunta por él para siempre; un respaldo con un
 * `length` que es texto corre código cada vez que se abre el cotizador; el atrás del código de
 * una pregunta cierra el escalador que estaba debajo. Todas salen «plausibles».
 *
 * Aquí se evalúa el código de verdad —notario.js entero, y las funciones sueltas de los demás
 * guiones— en un contexto de node:vm con lo mínimo alrededor, como pruebas/replicas.mjs.
 *
 * Uso: node pruebas/defensas-del-cotizador.mjs   (o pruebas/correr.sh, que corre todas)      */

import vm from 'node:vm';
import { readFileSync } from 'node:fs';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, v) => eq(que, !!v, true);
const leer = ruta => readFileSync(new URL('../' + ruta, import.meta.url), 'utf8');
const COT = Object.fromEntries(['nucleo', 'notario', 'historial', 'entrega', 'proceso', 'escalador', 'vectorizador', 'partidas', 'arranque', 'ia']
  .map(n => [n, leer('js/cotizador/' + n + '.js')]));
const esperar = ms => new Promise(r => setTimeout(r, ms));

/* ----- Sacar un pedazo de código del texto -----
   `cerrar` avanza desde la primera llave a partir de `ini` hasta la que la cierra, saltándose
   cadenas, plantillas y comentarios: los guiones traen llaves dentro de textos. */
function cerrar(texto, ini) {
  let i = texto.indexOf('{', ini), prof = 0;
  for (; i < texto.length; i++) {
    const c = texto[i], s = texto[i + 1];
    if (c === '/' && s === '/') { i = texto.indexOf('\n', i); continue; }
    if (c === '/' && s === '*') { i = texto.indexOf('*/', i) + 1; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      for (i++; i < texto.length && texto[i] !== c; i++) if (texto[i] === '\\') i++;
      continue;
    }
    if (c === '{') prof++;
    if (c === '}' && --prof === 0) return i + 1;
  }
  throw new Error('no cierra lo que empieza en ' + ini);
}
function fuente(texto, nombre) {
  let ini = texto.indexOf('async function ' + nombre + '(');
  if (ini < 0) ini = texto.indexOf('function ' + nombre + '(');
  if (ini < 0) throw new Error('no está function ' + nombre);
  return texto.slice(ini, cerrar(texto, ini));
}
/* El n-ésimo `window.addEventListener('popstate',…)` de un guion, entero. Solo los de nivel
   superior —al principio del renglón—: trasElAtrasDelCodigo registra uno de un disparo dentro. */
function oyente(texto, n = 0) {
  let ini = -1;
  for (let k = 0; k <= n; k++) ini = texto.indexOf("\nwindow.addEventListener('popstate'", ini + 1);
  if (ini < 0) throw new Error('no está el oyente de popstate #' + n);
  ini++;
  const fin = cerrar(texto, ini);
  return texto.slice(ini, texto.indexOf(';', fin) + 1);
}
const linea = (texto, re) => { const m = re.exec(texto); if (!m) throw new Error('no está ' + re); return m[0]; };

/* ===================== notario.js, entero ===================== */
function montarNotario() {
  const avisos = [], llamadas = [], cola = [];
  const ctx = vm.createContext({
    console, JSON, Date, Math, Number, String, Object, Array, Set, Map, Promise, isNaN, isFinite,
    /* El vigilante de quince segundos no corre aquí: se reprogramaría solo para siempre y la
       prueba no terminaría nunca. Lo que se prueba es qué hace cada respuesta, no el reloj. */
    setTimeout: (f, ms) => (ms >= 1000 ? 0 : setTimeout(f, ms)), clearTimeout: t => { if (t) clearTimeout(t); },
    document: { addEventListener() {}, querySelector: () => null, visibilityState: 'visible' },
    navigator: { onLine: true },
    Q: { folio: 'COT-0005', estado: 'pendiente', solicitud: null, reauth: null, items: [], proy: 'Farmacia', rol: 'vendedor' },
    toast: (msg, tipo, dur, accion) => avisos.push({ msg, tipo, accion: accion ? accion.label : null }),
    getQueue: () => JSON.parse(JSON.stringify(cola)),
    updateQueueEntry: (folio, cambios) => { const e = cola.find(x => x.folio === folio); if (e) Object.assign(e, JSON.parse(JSON.stringify(cambios))); },
    removeFromQueue: folio => { const i = cola.findIndex(x => x.folio === folio); if (i >= 0) cola.splice(i, 1); },
    saveState() {}, renderItems() {}, renderAuth() {}, pintarPasos() {},
    huellaTrabajo: () => 'H1', money: n => '$' + n, dispositivo: () => 'AAA',
    loadQueueEntry: async folio => { llamadas.push('abrir ' + folio); },
    puenteCfg: () => null, totals: () => ({ sub: 0 }), _CAMPOS_PRECIO: [], addEventListener() {},
  });
  ctx.window = ctx; ctx.parent = ctx;
  vm.runInContext(COT.notario, ctx, { filename: 'notario.js' });
  /* Lo que un sello le hace a la pantalla ya lo cubren las pruebas de flujo: aquí solo importa
     SI se aplicó. Y la hoja es de mentiras: se anota lo que se le pidió. */
  vm.runInContext(`aplicarSello=function(s){ Q.estado='autorizada'; Q.sello={codigo:s.codigo,total:s.total}; __aplicados.push(s.codigo); };
    hablarHoja=async function(ruta,cuerpo){ __hoja.push(ruta+' '+(cuerpo.folio||'')); return __resp[ruta]?__resp[ruta]():{ok:true}; };`,
    Object.assign(ctx, { __aplicados: [], __hoja: [], __resp: {} }));
  return { ctx, avisos, llamadas, cola, correr: s => vm.runInContext(s, ctx) };
}

console.log('\n1. UN SELLO DE ANTES DE PEDIR NO CIERRA LA SOLICITUD');
{
  const { ctx, correr } = montarNotario();
  const ahora = Date.now();
  /* «Volver a autorizar el precio»: el sello que se está revisando es el AAAA, de hace un
     minuto. /estado lo devuelve porque sigue vigente, y su huella cuadra. */
  ctx.Q.solicitud = { enviada: true, ts: ahora, error: '' };
  ctx.Q.reauth = { folio: 'COT-0005', sello: { codigo: 'AAAA' } };
  correr(`atenderRespuesta('COT-0005',{estado:'autorizada',sello:{codigo:'AAAA',ts:new Date(${ahora - 60000}).toISOString(),huella:'H1',correo:'dir@x',total:10}})`);
  eq('el sello que se vuelve a autorizar no se aplica, aunque sea de hace un minuto', ctx.__aplicados, []);
  eq('  y la cotización sigue esperando', ctx.Q.estado, 'pendiente');
  /* Sin «Volver a autorizar»: el sello viejo se reconoce por la hora. */
  ctx.Q.reauth = null;
  correr(`atenderRespuesta('COT-0005',{estado:'autorizada',sello:{codigo:'BBBB',ts:new Date(${ahora - 10 * 60000}).toISOString(),huella:'H1',correo:'dir@x',total:10}})`);
  eq('un sello de diez minutos antes de pedir no se aplica', ctx.__aplicados, []);
  correr(`atenderRespuesta('COT-0005',{estado:'autorizada',sello:{codigo:'CCCC',ts:new Date(${ahora - 60000}).toISOString(),huella:'H1',correo:'dir@x',total:10}})`);
  eq('  uno de un minuto «antes» sí: es la holgura del reloj del teléfono', ctx.__aplicados, ['CCCC']);
  ctx.Q.estado = 'pendiente'; ctx.Q.solicitud = { enviada: true, ts: ahora, error: '' };
  correr(`atenderRespuesta('COT-0005',{estado:'autorizada',sello:{codigo:'DDDD',ts:new Date(${ahora + 5000}).toISOString(),huella:'H1',correo:'dir@x',total:10}})`);
  eq('  y el que se emitió después de pedir, por supuesto', ctx.__aplicados, ['CCCC', 'DDDD']);
  eq('la holgura es de dos minutos', correr('SELLO_HOLGURA_MS'), 120000);
}
{
  const { ctx, avisos, cola, correr } = montarNotario();
  const ahora = Date.now();
  ctx.Q.folio = 'COT-0009'; ctx.Q.estado = 'borrador';
  cola.push({ folio: 'COT-0005', estado: 'pendiente', q: { solicitud: { enviada: true, ts: ahora }, reauth: { folio: 'COT-0005', sello: { codigo: 'AAAA' } } } });
  correr(`atenderRespuesta('COT-0005',{estado:'autorizada',sello:{codigo:'AAAA',ts:new Date(${ahora - 60000}).toISOString(),huella:'H1',correo:'dir@x'}})`);
  eq('en la cola tampoco: no se avisa «ya está autorizada» por el sello viejo', avisos, []);
}

console.log('\n2. EL RECHAZO DE UNA QUE ESTÁ EN LA COLA SE DICE, Y SALE DE LA ESPERA');
{
  const { ctx, avisos, llamadas, cola, correr } = montarNotario();
  ctx.Q.folio = 'COT-0009'; ctx.Q.estado = 'borrador';
  cola.push({ folio: 'COT-0005', estado: 'pendiente', q: { folio: 'COT-0005', estado: 'pendiente', solicitud: { enviada: true, ts: 1 } } });
  eq('antes de la respuesta se pregunta por ella', correr('_foliosEsperando()'), ['COT-0005']);
  correr(`atenderRespuesta('COT-0005',{estado:'rechazada',resolvio:'dir@x',nota:'muy caro'})`);
  eq('se avisa, con «Abrir»', avisos, [{ msg: 'Dirección rechazó COT-0005 — muy caro', tipo: 'err', accion: 'Abrir' }]);
  eq('la respuesta queda guardada en su solicitud', cola[0].q.solicitud.rechazo, { resolvio: 'dir@x', nota: 'muy caro' });
  eq('  y la cola NO pierde la cotización: es la única copia', cola.length, 1);
  eq('ya no se pregunta por ella cada quince segundos', correr('_foliosEsperando()'), []);
  correr(`atenderRespuesta('COT-0005',{estado:'rechazada',resolvio:'dir@x',nota:'muy caro'})`);
  eq('  ni se vuelve a avisar', avisos.length, 1);
  /* Al abrirla desde la cola, el rechazo guardado se aplica. */
  Object.assign(ctx.Q, JSON.parse(JSON.stringify(cola[0].q)));
  correr('aplicarRechazoGuardado()');
  eq('al abrirla queda rechazada, con quién y por qué', [ctx.Q.estado, ctx.Q.autorizador, ctx.Q.nota], ['rechazada', 'dir@x', 'muy caro']);
  eq('  y se va de la cola, como la que se rechaza en pantalla', cola.length, 0);
  void llamadas;
}
{
  const { ctx, cola, correr } = montarNotario();
  ctx.Q.solicitud = { enviada: false, ts: 1, error: 'catálogo', definitivo: true };
  cola.push({ folio: 'COT-0007', estado: 'pendiente', q: { solicitud: { enviada: false, definitivo: true } } });
  eq('una solicitud que la hoja no aceptó por el catálogo no se sondea, ni en pantalla ni en la cola', correr('_foliosEsperando()'), []);
}

console.log('\n2b. «CANCELADA» ES UNA RESPUESTA FINAL: SE DICE UNA VEZ Y SE PUEDE VOLVER A PEDIR');
{
  const { ctx, avisos, cola, correr } = montarNotario();
  ctx.Q.folio = 'COT-0009'; ctx.Q.estado = 'borrador';
  cola.push({ folio: 'COT-0005', estado: 'pendiente', q: { folio: 'COT-0005', estado: 'pendiente', solicitud: { enviada: true, ts: 1 } } });
  correr(`atenderRespuesta('COT-0005',{estado:'cancelada',resolvio:'dir@x',nota:''})`);
  eq('en la cola: se avisa una vez, con «Abrir»', avisos.map(a => [a.tipo, a.accion]), [['err', 'Abrir']]);
  eq('  sale de la espera', correr('_foliosEsperando()'), []);
  eq('  y la entrada se queda, pendiente, lista para volver a pedirse',
    [cola.length, cola[0].estado, cola[0].q.solicitud.cancelada, cola[0].q.solicitud.enviada], [1, 'pendiente', true, false]);
  correr(`atenderRespuesta('COT-0005',{estado:'cancelada'})`);
  eq('  no se vuelve a avisar', avisos.length, 1);
}
{
  const { ctx, avisos, cola, correr } = montarNotario();
  ctx.Q.solicitud = { enviada: true, ts: 1, error: '' };
  cola.push({ folio: 'COT-0005', estado: 'pendiente', q: { solicitud: { enviada: true, ts: 1 } } });
  correr(`atenderRespuesta('COT-0005',{estado:'cancelada'})`);
  eq('en pantalla: sigue pendiente, con la solicitud marcada y sin preguntar más',
    [ctx.Q.estado, ctx.Q.solicitud.cancelada, correr('_foliosEsperando()')], ['pendiente', true, []]);
  eq('  avisada, sin «Abrir» porque ya está a la vista', avisos.map(a => a.accion), [null]);
  eq('  y la foto de la cola lo sabe', cola[0].q.solicitud.cancelada, true);
  /* La vuelta siguiente no la reenvía sola: volver a pedirla es un botón. */
  await correr('consultarSolicitudes()');
  eq('la vuelta del vigilante no la reenvía sola', ctx.__hoja, []);
  await correr('enviarSolicitud()');
  eq('«Volver a pedirla» la manda y vuelve a esperar', [ctx.__hoja, ctx.Q.solicitud.cancelada, correr('_foliosEsperando()')],
    [['solicitar COT-0005@AAA'], undefined, ['COT-0005']]);
}
{
  const { ctx, avisos, correr } = montarNotario();
  ctx.Q.solicitud = { enviada: true, ts: 1, error: '', retirada: true };
  correr(`atenderRespuesta('COT-0005',{estado:'cancelada'})`);
  eq('la que retiró este mismo teléfono sale de la espera sin avisar', [avisos.length, correr('_foliosEsperando()')], [0, []]);
  ctx.Q.solicitud = { enviada: true, ts: 1, error: '' };
  correr(`atenderRespuesta('COT-0005',{estado:null})`);
  eq('`estado:null` no cambia nada: la hoja puede no tenerla todavía', [ctx.Q.solicitud.cancelada, correr('_foliosEsperando()')], [undefined, ['COT-0005']]);
}
cierto('el panel ofrece «Volver a pedirla» en una cancelada', /Q\.solicitud\.cancelada\?'Volver a pedirla':'Reintentar el envío'/.test(COT.proceso));

console.log('\n3. RETIRAR UNA SOLICITUD NO PREGUNTA SI SUBIÓ');
{
  const { ctx, correr } = montarNotario();
  ctx.Q.solicitud = { enviada: false, ts: 1, error: '' };
  /* La hoja tarda: el envío sigue en camino cuando se toca «Editar (cancela la solicitud)». */
  let soltar; ctx.__resp.solicitar = () => new Promise(r => { soltar = () => r({ ok: true }); });
  const envio = correr('enviarSolicitud()');
  await esperar(0);
  correr('retirarSolicitud(Q.folio,Q.solicitud); Q.solicitud=null; Q.estado="borrador";');
  eq('se retira aunque no conste que subió', ctx.__hoja, ['solicitar COT-0005@AAA', 'cancelar COT-0005@AAA']);
  soltar(); await envio;
  eq('y si la hoja la aceptó después del «cancelar», se vuelve a retirar', ctx.__hoja.slice(2), ['cancelar COT-0005@AAA']);
}
{
  const { ctx, cola, correr } = montarNotario();
  ctx.Q.solicitud = { enviada: false, ts: 1, error: '' };
  cola.push({ folio: 'COT-0005', estado: 'pendiente', q: { solicitud: { enviada: false, ts: 1 } } });
  ctx.__resp.solicitar = () => ({ ok: false, codigo: 'CATALOGO_DESINCRONIZADO', mensaje: 'no cuadra' });
  await correr('enviarSolicitud()');
  eq('lo que la hoja contesta llega también a la foto de la cola', cola[0].q.solicitud.definitivo, true);
  ctx.Q.solicitud = { enviada: false, ts: 1, error: '' };
  ctx.__resp.solicitar = () => ({ ok: true });
  ctx.Q.proy = '  Farmacia  ';
  await correr('enviarSolicitud()');
  eq('  y el proyecto que se mandó, que es el que el sello va a firmar', [cola[0].q.solicitud.enviada, cola[0].q.solicitud.proyecto], [true, 'Farmacia']);
}

console.log('\n4. EL AVISO DEL NOTARIO CON EL MARCO ESCONDIDO LO DA LA PLATAFORMA');
{
  const { ctx, avisos, llamadas, correr } = montarNotario();
  let visto = null;
  ctx.AL3D = { hablar() {}, avisar: (m, t, f) => { visto = { m, t, f: typeof f }; return true; } };
  correr(`avisoDelNotario('COT-0042 ya está autorizada por dir@x','ok',9000,'COT-0042')`);
  eq('escondido, la plataforma lo recibe con su «Abrir»', visto, { m: 'COT-0042 ya está autorizada por dir@x', t: 'ok', f: 'function' });
  eq('  y el marco no lo pinta donde nadie lo ve', avisos, []);
  ctx.AL3D = { hablar() {}, avisar: () => false };
  correr(`avisoDelNotario('COT-0042 ya está autorizada por dir@x','ok',9000,'COT-0042')`);
  eq('a la vista, lo da el cotizador como siempre', avisos, [{ msg: 'COT-0042 ya está autorizada por dir@x', tipo: 'ok', accion: 'Abrir' }]);
  void llamadas;
  /* El módulo de la plataforma: escondido contesta true y pinta su toast; a la vista, false. */
  const mod = leer('js/mod/cotizador.js');
  cierto('js/mod/cotizador.js presta avisar() en la ventanilla', /avisar\(msg, tipo, abrir\) \{\s*\n\s*if \(_visible \|\| !_ctx\) return false;/.test(mod));
  cierto('  y lo pinta con el toast de la plataforma, que va por textContent', /toast\(String\(msg \|\| ''\)/.test(mod));
}

console.log('\n5. EL FOLIO DE OTRO TELÉFONO VIAJA AL onclick COMO LITERAL DE JS');
{
  const { ctx, correr } = montarNotario();
  vm.runInContext(linea(COT.nucleo, /const esc=.*;/) + '\n' + linea(COT.nucleo, /const jsArg=.*;/) + '\nconst _ABRIBLE="";\nfunction lineTotal(){return 0;}', ctx);
  vm.runInContext(`_remotas=[{folio:"COT-1'); alert(1); ('@ZZZ",cotizacion:{}}]`, ctx);
  const html = correr('remotasHTML()');
  const onclick = /onclick="([^"]*)"/.exec(html)[1];
  const js = onclick.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  let pedido = null;
  new Function('abrirRevisionRemota', js)(f => { pedido = f; });
  eq('el manejador, ya descodificado, pide exactamente ese folio y no corre nada más', pedido, "COT-1'); alert(1); ('@ZZZ");
}

console.log('\n6. EL PROYECTO TAMBIÉN SE FIRMÓ: CAMBIARLO APAGA EL QR');
{
  const ctx = vm.createContext({ Q: {}, authVigente: () => true, Math, Number, String });
  vm.runInContext(fuente(COT.entrega, 'selloImprimible') + fuente(COT.entrega, 'selloDeOtroProyecto'), ctx);
  ctx.Q = { estado: 'autorizada', proy: 'Farmacia Luz ', sello: { codigo: 'C', folio: 'F', total: 100, proyecto: 'Farmacia Luz' } };
  cierto('mismo proyecto (sin contar espacios de los lados): el QR se imprime', vm.runInContext('selloImprimible(100)', ctx));
  ctx.Q.proy = 'Farmacia Sol';
  eq('otro proyecto: sin QR', vm.runInContext('selloImprimible(100)', ctx), null);
  delete ctx.Q.sello.proyecto;
  cierto('un sello de antes de guardar el proyecto se imprime como siempre', vm.runInContext('selloImprimible(100)', ctx));
  cierto('aplicarSello guarda el proyecto en Q.sello', /Q\.sello=\{[^}]*proyecto\}/.test(COT.notario));
  cierto('generarPDF avisa por qué sale sin QR', /selloDeOtroProyecto\(\)\)\{\s*\n\s*toast\('Este PDF sale sin el código de verificación/.test(COT.entrega));
}

console.log('\n7. EL RESPALDO SE REVISA ANTES DE PINTAR NADA');
{
  const tarjetas = [];
  let guardado = null;
  const ctx = vm.createContext({
    JSON, Array, Object, Number, String, Date, isNaN,
    RESPALDO_KEYS: ['al3d_historial', 'al3d_queue', 'al3d_q'], RESTAURAR_PF_KEY: 'al3d_pf_restaurar',
    localStorage: { getItem: () => guardado },
    document: { createElement: () => ({ setAttribute() {}, innerHTML: '' }) },
    $: id => id === 'contenido' ? { firstChild: null, insertBefore: c => tarjetas.push(c.innerHTML) } : null,
  });
  vm.runInContext(linea(COT.nucleo, /const esc=.*;/) + '\n' + fuente(COT.historial, 'fechaDeRespaldo')
    + fuente(COT.historial, 'revisarRespaldo') + fuente(COT.historial, 'ofrecerRestauracionPendiente'), ctx);
  const paquete = hist => JSON.stringify({ app: 'al3d-completo', cotizador: { app: 'cotizador-al3d', fecha: '2026-09-01T10:00:00Z', datos: { al3d_historial: hist } } });
  guardado = paquete(JSON.stringify({ length: '<img src=x onerror=alert(1)>' }));
  vm.runInContext('ofrecerRestauracionPendiente()', ctx);
  eq('un al3d_historial que no es arreglo no pinta tarjeta', tarjetas, []);
  eq('  y restaurarDesde lo rechaza con la misma regla', vm.runInContext(`revisarRespaldo(${JSON.stringify(guardado)}).error`, ctx), 'El respaldo está dañado: el historial o la cotización en curso no se pueden leer');
  guardado = JSON.stringify({ app: 'cotizador-al3d', fecha: '<b>', datos: { al3d_historial: 7 } });
  vm.runInContext('ofrecerRestauracionPendiente()', ctx);
  eq('datos que no son texto tampoco', tarjetas, []);
  guardado = paquete(JSON.stringify([{}, {}, {}]));
  vm.runInContext('ofrecerRestauracionPendiente()', ctx);
  eq('uno sano sí se ofrece, con sus tres cotizaciones', tarjetas.length === 1 && /con 3 cotizaciones/.test(tarjetas[0]), true);
  tarjetas.length = 0;
  guardado = JSON.stringify({ app: 'cotizador-al3d', fecha: '<img src=x onerror=1>', datos: { al3d_historial: '[]' } });
  vm.runInContext('ofrecerRestauracionPendiente()', ctx);
  eq('  y una fecha rara se pinta escapada', tarjetas.length === 1 && !tarjetas[0].includes('<img'), true);
}

console.log('\n8. EL ATRÁS DE LA PREGUNTA NO CIERRA EL ESCALADOR DE ABAJO');
{
  const capas = { confmodal: false, scalermodal: false };
  const oyentes = [];
  const el = id => ({ id, classList: { contains: c => c === 'show' && capas[id], remove: () => { capas[id] = false; } }, dataset: { hist: id === 'confmodal' ? '1' : '' } });
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, Promise,
    window: { addEventListener: (t, f) => { if (t === 'popstate') oyentes.push(f); }, removeEventListener: (t, f) => { const i = oyentes.indexOf(f); if (i >= 0) oyentes.splice(i, 1); } },
    document: { getElementById: el }, $: el, history: { back() {} },
    SC: { hist: true }, _pantalla: 'partidas', _pilaPendiente: false,
    scOcultarScaler: () => { capas.scalermodal = false; },
    irAPantalla() {}, voz() {}, sincronizarHistorial() {},
  });
  vm.runInContext(`const _CAPAS=[['confmodal',()=>{ document.getElementById('confmodal').classList.remove('show'); }],['scalermodal',()=>{}]];
    const _cerrandoPorAtras=new Set();
    let _atrasPorCodigo=false;` + fuente(COT.nucleo, '_capaDeArriba') + fuente(COT.nucleo, '_atrasDesdeElCodigo') + fuente(COT.nucleo, 'trasElAtrasDelCodigo')
    + linea(COT.nucleo, /let _popPorCodigo=false;/) + linea(COT.nucleo, /let _esteAtras=.*;/) + linea(COT.nucleo, /function atrasEsDeLaCapa\(id\)\{.*\}/)
    + oyente(COT.nucleo, 0) + oyente(COT.nucleo, 1) + oyente(COT.escalador, 0), ctx);
  const atras = () => { for (const f of [...oyentes]) f({ state: null }); };
  /* Contestar la pregunta: la capa se cierra y el código da su atrás. */
  capas.scalermodal = true; capas.confmodal = true;
  capas.confmodal = false; vm.runInContext('_atrasPorCodigo=true', ctx);
  atras();
  cierto('contestar el confirmar() de encima deja el escalador abierto', capas.scalermodal);
  eq('  y su entrada sigue siendo suya', ctx.SC.hist, true);
  /* El dedo con la pregunta arriba: se cierra la pregunta, no el escalador. */
  capas.confmodal = true;
  atras();
  eq('el atrás del dedo con la pregunta arriba cierra la pregunta y nada más', [capas.confmodal, capas.scalermodal], [false, true]);
  atras();
  eq('el atrás del dedo con el escalador arriba sí lo cierra', [capas.scalermodal, ctx.SC.hist], [false, false]);
  /* Esperar al atrás del código: con uno pendiente, espera al popstate; sin él, no espera. */
  let listo = false;
  vm.runInContext('_atrasPorCodigo=true', ctx);
  vm.runInContext('trasElAtrasDelCodigo()', ctx).then(() => { listo = true; });
  await esperar(0);
  eq('con un atrás pendiente, trasElAtrasDelCodigo espera', listo, false);
  atras(); await esperar(0);
  eq('  y termina cuando llega el popstate', listo, true);
  listo = false;
  vm.runInContext('trasElAtrasDelCodigo()', ctx).then(() => { listo = true; });
  await esperar(0);
  eq('sin atrás pendiente no espera nada', listo, true);
  cierto('el vectorizador pregunta lo mismo', /atrasEsDeLaCapa\('vectormodal'\)/.test(oyente(COT.vectorizador, 0)));
  cierto('«Abrir y editar» espera ese atrás antes de cerrar el historial', /await confirmar\([\s\S]*?await trasElAtrasDelCodigo\(\);[\s\S]*cerrarHistorial\(\)/.test(fuente(COT.historial, 'reabrirDeHistorial')));
  cierto('  y «Duplicar» también', /await trasElAtrasDelCodigo\(\);[\s\S]*cerrarHistorial\(\)/.test(fuente(COT.historial, 'usarComoBase')));
}

console.log('\n9. MIENTRAS LA HOJA SELLA NO SE CAMBIA DE COTIZACIÓN POR NINGUNA PUERTA');
for (const [archivo, fn] of [['historial', 'reabrirDeHistorial'], ['historial', 'usarComoBase'], ['historial', 'cuaNuevaCotizacion'],
  ['historial', 'cuaAbrirCot'], ['historial', 'cuaDuplicarCot'], ['historial', 'loadQueueEntry'], ['proceso', 'nueva'],
  ['proceso', 'nuevaConEstosDatos'], ['proceso', 'deshacerVaciado'], ['proceso', 'reabrir'], ['proceso', 'rechazar']]) {
  cierto(fn + ' se niega con selloEnVuelo()', /if\(selloEnVuelo\(\)\) return/.test(fuente(COT[archivo], fn)));
}
cierto('cuaNuevaCotizacion no sigue si nueva() se negó', /if\(nueva\(\)===false\) return;/.test(fuente(COT.historial, 'cuaNuevaCotizacion')));
cierto('reabrir retira la solicitud sin preguntar si subió', /if\(eraPendiente&&Q\.solicitud\)\{ retirarSolicitud\(Q\.folio,Q\.solicitud\);/.test(fuente(COT.proceso, 'reabrir')));
cierto('rechazar tampoco pregunta si subió', /if\(Q\.solicitud\)\{ Q\.solicitud\.retirada=true; hablarHoja\('rechazar'/.test(fuente(COT.proceso, 'rechazar')));
cierto('cambiar de cliente una pendiente retira la del folio viejo y la reenvía con el nuevo',
  /retirarSolicitud\(antes,Q\.solicitud\); Q\.solicitud=\{enviada:false[\s\S]*Q\.folio=nextFolio\(\)[\s\S]*if\(reenviar\) enviarSolicitud\(\);/.test(fuente(COT.proceso, 'cerrarEdicionCliente')));

console.log('\n10. pdf.js: CON SU HUELLA Y SIN eval');
{
  const sri = /const PDFJS_SRI='(sha384-[A-Za-z0-9+/=]{64})';/.exec(COT.escalador);
  cierto('la huella de pdf.min.js 3.11.174 está escrita una vez', sri);
  for (const [n, f] of [['escalador', 'scLoadPDF'], ['vectorizador', 'vtLoadPDF']]) {
    const t = fuente(COT[n], f);
    cierto(n + ': el <script> lleva integrity y crossOrigin', /s\.integrity=PDFJS_SRI;s\.crossOrigin='anonymous';s\.src='https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\/pdf\.min\.js'/.test(t));
    cierto(n + ': getDocument con isEvalSupported:false', /getDocument\(\{[^}]*isEvalSupported:false\}\)/.test(t));
  }
}

console.log('\n11. LO QUE YA NO EXISTE, YA NO ESTÁ');
{
  const todo = Object.values(COT).join('\n') + leer('cotizador.html');
  eq('ni toggleFoldProy ni aplicarFoldProy ni _foldProy fuera de comentarios',
    /\b(toggleFoldProy|aplicarFoldProy|_foldProy)\b/.test(todo.replace(/\/\*[\s\S]*?\*\//g, '')), false);
  eq('ni «API keys» en la cabecera de ia.js', /API keys?/.test(COT.ia.split('\n').slice(0, 12).join('\n')), false);
  eq('  ni en el pie del historial, que las nombraba como si vivieran en el teléfono',
    /API keys?/.test(fuente(COT.historial, 'pintarPieHistorial').replace(/\/\*[\s\S]*?\*\//g, '')), false);
}

console.log('\n' + (mal ? mal + ' FALLAS · ' : '') + bien + ' bien');
if (mal) process.exit(1);
