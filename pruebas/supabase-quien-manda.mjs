/* ¿SABE ESTE APARATO A DÓNDE GUARDAR? — auditoría 2026-10-26, T1-3.
 *
 * El 26-oct el Chrome de escritorio de Dirección tenía el interruptor de Supabase encendido, una sesión válida en la base
 * (activo, una sola empresa, la base en 'base') y token de dispositivo, y NO tenía el modo guardado (`al3d_pf_supa_modo`):
 * la bandeja corrió en modo hoja y nada lo dijo. Lo que se vigila aquí, con supa.js de verdad, el Supabase de mentiras y
 * el aparato COMO ES (el escritorio con su token de dispositivo; el teléfono sin él, entrando con Google):
 *   · el escritorio del 26-oct, con sesión y sin modo, lo guarda al arrancar —aunque la sesión tarde las primeras veces
 *     (el candado de pestañas de supabase-js) o la primera pregunta se cuelgue— y la bandeja se enchufa a la base;
 *   · el aviso de que cambió el modo que llega ANTES de que el arranque enchufe no enchufa a destiempo (MB-15), y el que
 *     llega después sí vuelve a enchufar;
 *   · el teléfono sin sesión: banda roja («no sabe a dónde guardar») con su botón para entrar con la cuenta de la puerta;
 *   · la hoja dice que la base manda (`al3d-la-base-manda`): con sesión, se le pregunta a la base y se vuelve a enchufar; sin
 *     sesión, la entrada de siempre una vez; apagado, la banda roja y su botón lo enciende (nada lo enciende solo);
 *   · dos pestañas: el modo que oyó una le llega a la otra por `storage`;
 *   · la puerta del escritorio le pregunta a la base cuando no sabe el modo, sin ir a la hoja;
 *   · el orden del arranque en js/app.js (los oyentes antes de las preguntas, la pregunta en cuanto hay puerta).
 *
 * app.js no se puede importar en node —arranca la plataforma al cargarse—, así que `crearQuienManda` se saca de su texto y se
 * corre aquí con lo que necesita pasado por `d`. No toca Supabase ni Google ni la hoja: los tres son de mentiras. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let bien = 0, mal = 0;
const eq = (que, dio, esperado) => {
  const a = JSON.stringify(dio), b = JSON.stringify(esperado);
  if (a === b) { bien++; console.log('  ok   ' + que); }
  else { mal++; console.log('  FALLA ' + que + '\n         dio: ' + a + '\n         esp: ' + b); }
};
const cierto = (que, x) => eq(que, !!x, true);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------------------
   El navegador de mentiras: almacenamiento, ventana (con sus avisos) y documento.
   --------------------------------------------------------------------------- */
const almacen = new Map();
globalThis.localStorage = {
  getItem: k => (almacen.has(k) ? almacen.get(k) : null), setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: k => almacen.delete(k), clear: () => almacen.clear(),
};
/* Cada «carga» de la app tiene su ventana (montarApp pone una nueva): así los oyentes de una carga de antes no reaccionan a
   los avisos de la siguiente, como en el navegador. Los avisos que da supa.js (o la prueba) van a la ventana de ahora, y se
   apuntan. */
const avisos = [];
let ventanaActual = new EventTarget();
globalThis.addEventListener = (...a) => ventanaActual.addEventListener(...a);
globalThis.removeEventListener = (...a) => ventanaActual.removeEventListener(...a);
globalThis.dispatchEvent = ev => { avisos.push(ev.type + ':' + JSON.stringify(ev.detail || {})); return ventanaActual.dispatchEvent(ev); };
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, visibilityState: 'hidden', getElementById: () => null, querySelector: () => null,
  head: { appendChild() {} }, body: { children: [] }, createElement: () => ({ dataset: {}, addEventListener() {} }) };

/* ---------------------------------------------------------------------------
   Supabase de mentiras. `sesion` es la de este aparato; `mi_acceso` contesta con `estado`, `modo` y `area`. `colgarSesion` y
   `colgarAcceso` cuentan cuántas preguntas no contestan NUNCA (el candado de pestañas, la red que se queda a medias).
   --------------------------------------------------------------------------- */
const B = { sesion: null, correo: 'eliasgaribi@gmail.com', estado: 'activo', modo: 'base', area: 'direccion',
  colgarSesion: 0, colgarAcceso: 0, demoraMs: 0, getSession: 0, miAcceso: 0 };
const cliente = {
  auth: {
    getSession: () => {
      B.getSession++;
      if (B.colgarSesion > 0) { B.colgarSesion--; return new Promise(() => {}); }
      return Promise.resolve({ data: { session: B.sesion } });
    },
    signOut: async () => { B.sesion = null; return { error: null }; },
  },
  rpc: nombre => {
    if (nombre !== 'mi_acceso') return Promise.resolve({ data: { ok: true }, error: null });
    B.miAcceso++;
    if (B.colgarAcceso > 0) { B.colgarAcceso--; return new Promise(() => {}); }
    const data = B.sesion
      ? { ok: true, estado: B.estado, usuario: { id: 'u1', correo: B.correo },
          empresas: B.estado === 'activo' ? [{ empresa_id: 'al3d', area: B.area, estado: 'activo', modo: B.modo }] : [],
          modo: B.estado === 'activo' ? B.modo : null }
      : { ok: false, codigo: 'SIN_SESION', mensaje: 'No hay sesión.' };
    return B.demoraMs ? new Promise(r => setTimeout(() => r({ data, error: null }), B.demoraMs)) : Promise.resolve({ data, error: null });
  },
};
globalThis.supabase = { createClient: () => cliente };

/* La hoja de mentiras: solo cuenta cuántas veces se le preguntó. */
const H = { pedidas: 0 };
globalThis.fetch = async () => {
  H.pedidas++;
  return { ok: true, status: 200, json: async () => ({ ok: true, via: 'google', correo: B.correo, rol: 'direccion', escribibles: [] }) };
};

/* ---------------------------------------------------------------------------
   Los aparatos, como son. El escritorio de Dirección del 26-oct: interruptor encendido, sesión de la base guardada, token de
   dispositivo pegado en Ajustes, entró con Google (su correo y su permiso de la hoja vivo) y un pase de la hoja; SIN modo.
   El teléfono: entró con Google por el botón de la puerta (correo, sin permiso de la hoja y SIN token de dispositivo).
   --------------------------------------------------------------------------- */
const ON = JSON.stringify({ encendido: true, desde: 1 });
const EN_UN_MES = Date.now() + 30 * 24 * 3600 * 1000;
function aparato(cual, extra = {}) {
  almacen.clear();
  if (cual === 'escritorio') {
    almacen.set('al3d_pf_supa', ON);
    almacen.set('al3d_pf_supa_sesion', JSON.stringify({ access_token: 'jwt-de-la-base', user: { email: B.correo } }));
    almacen.set('al3d_pf_puente', JSON.stringify({ url: 'https://hoja.test/exec', token: 'tok-de-dispositivo' }));
    almacen.set('al3d_pf_ingreso', JSON.stringify({ correo: B.correo }));
    almacen.set('al3d_pf_gtok', JSON.stringify({ token: 'tok-de-acceso-de-la-hoja', expira: Date.now() + 3600 * 1000 }));
    almacen.set('al3d_pf_pase', JSON.stringify({ correo: B.correo, rol: 'direccion', hasta: EN_UN_MES, visto: Date.now() }));
    B.sesion = { access_token: 'jwt-de-la-base', user: { email: B.correo } };
  } else if (cual === 'telefono') {
    almacen.set('al3d_pf_puente', JSON.stringify({ url: 'https://hoja.test/exec' }));     // sin token de dispositivo
    almacen.set('al3d_pf_ingreso', JSON.stringify({ correo: 'beto@al3d.test' }));
    almacen.set('al3d_pf_pase', JSON.stringify({ correo: 'beto@al3d.test', rol: 'fabricacion', hasta: EN_UN_MES, visto: Date.now(), de: 'base' }));
    if (extra.encendido !== false) almacen.set('al3d_pf_supa', ON);
    B.sesion = null;
  }
  for (const [k, v] of Object.entries(extra.claves || {})) { if (v === null) almacen.delete(k); else almacen.set(k, v); }
  B.estado = 'activo'; B.modo = 'base'; B.area = cual === 'telefono' ? 'fabricacion' : 'direccion';
  B.colgarSesion = 0; B.colgarAcceso = 0; B.demoraMs = 0; B.getSession = 0; B.miAcceso = 0;
  avisos.length = 0; H.pedidas = 0;
}
const modoAqui = () => { try { return (JSON.parse(almacen.get('al3d_pf_supa_modo') || 'null') || {}).modo || ''; } catch (_) { return 'dañado'; } };

/* El escritorio ANTES de cargar los módulos: ingreso.js (lo importa supa.js) lee el permiso de la hoja al cargarse, y la
   puerta de abajo lo necesita vivo, como lo tenía ese Chrome. */
aparato('escritorio');
const S = await import('../js/nucleo/supa.js');
/* Las esperas, cortas: aquí no hay red de verdad. */
Object.assign(S.TOPES, { cliente: 300, sesion: 60, acceso: 120 });
Object.assign(S.REINTENTOS_MODO, { esperaMs: 15 });

/* ---------------------------------------------------------------------------
   `crearQuienManda`, sacada del texto de app.js, con lo de alrededor de mentiras: el enchufe apunta qué bandeja habría puesto
   (la base o la hoja, con la misma regla que app.js), y la entrada y el botón de Google se apuntan.
   --------------------------------------------------------------------------- */
const app = leer('js/app.js');
function trozo(ancla, cierre) {
  const i = app.indexOf(ancla);
  if (i < 0) throw new Error('app.js ya no tiene «' + ancla + '»');
  const j = app.indexOf(cierre, i);
  if (j < 0) throw new Error('no se encontró el cierre de «' + ancla + '»');
  return app.slice(i, j + cierre.length).replace(/^export /, '');
}
const crearQuienManda = new Function(trozo('export function crearQuienManda(', '\n}') + '\nreturn crearQuienManda;')();

function montarApp(opc = {}) {
  const t = { enchufes: [], rearranques: 0, syncs: 0, repintados: 0, conexiones: 0, ofrecidos: [], reloj: opc.reloj || 1000 };
  const qm = crearQuienManda({
    ls: () => globalThis.localStorage,
    supa: async () => S,
    ingreso: async () => ({ correo: () => { try { return JSON.parse(almacen.get('al3d_pf_ingreso') || '{}').correo || ''; } catch (_) { return ''; } } }),
    rol: () => opc.rol || 'direccion',
    enchufar: async () => { t.enchufes.push(S.laBaseManda() ? 'base' : 'hoja'); },
    rearrancarEnchufe: () => { t.rearranques++; },
    sincronizar: () => { t.syncs++; },
    repintar: () => { t.repintados++; },
    conectar: () => { t.conexiones++; },
    ofrecer: (Supa, correo) => { t.ofrecidos.push(correo); },
    ahora: () => t.reloj,
  });
  /* Una carga nueva, una ventana nueva (salvo la otra pestaña, que trae la suya y no es «la de ahora»). */
  if (!opc.ventana) ventanaActual = new EventTarget();
  qm.colgar(opc.ventana || globalThis);
  return { qm, t };
}
/* Lo que hace el arranque de app.js con esto, en su orden: oyentes (ya, en montarApp), pregunta al pasar la puerta, la primera
   pantalla, esperar un momento la respuesta, listo, y el enchufe de la bandeja. */
async function arrancar(qm, t, { espera = 1000, montar = 0 } = {}) {
  qm.preguntar();
  if (montar) await pausa(montar);
  await qm.esperar(espera);
  qm.listo();
  t.enchufes.push(S.laBaseManda() ? 'base' : 'hoja');      // `await enchufarPuente()` del arranque
}

console.log('\nEL ESCRITORIO DEL 26-OCT: CON SESIÓN Y SIN MODO, LO GUARDA AL ARRANCAR');
{
  aparato('escritorio');
  /* Como pudo pasar ese día: la sesión no contesta las dos primeras veces (la vigilancia y la pregunta del arranque la piden
     a la vez) y la primera `mi_acceso` se queda colgada. Antes, una pregunta colgada dejaba la carga entera sin preguntar. */
  B.colgarSesion = 2; B.colgarAcceso = 1;
  eq('el aparato de verdad: interruptor encendido, sesión, token de dispositivo y SIN modo', [S.encendido(), modoAqui(), JSON.parse(almacen.get('al3d_pf_puente')).token],
     [true, '', 'tok-de-dispositivo']);
  const { qm, t } = montarApp();
  const t0 = Date.now();
  await arrancar(qm, t, { espera: 2000 });
  eq('al enchufar la bandeja ya sabe que manda la base: la bandeja va a la base, no a la hoja', [modoAqui(), t.enchufes], ['base', ['base']]);
  cierto('y no tardó más que los topes (' + (Date.now() - t0) + ' ms)', Date.now() - t0 < 1500);
  eq('se le preguntó a la base hasta que contestó (la colgada, y otra)', B.miAcceso, 2);
  eq('el aviso de que cambió el modo salió una vez, ANTES de que el arranque enchufara, y no enchufó a destiempo (MB-15)',
     [avisos.filter(a => a.startsWith('al3d-modo')).length, t.enchufes.length], [1, 1]);
  eq('sin banda: sabe a dónde guardar', [qm.noSabe(), qm.banda()], ['', null]);
  eq('lo que dijo la base queda anotado', [qm.estado().respuesta.estado, qm.estado().respuesta.modo], ['activo', 'base']);

  /* Siguiente arranque del mismo aparato: el modo ya está, se vuelve a preguntar igual (puede haber cambiado) y no avisa de nada. */
  const otra = montarApp();
  B.miAcceso = 0; avisos.length = 0;
  await arrancar(otra.qm, otra.t);
  eq('en cada arranque se vuelve a preguntar, y sin cambio no hay aviso', [B.miAcceso, avisos.length, otra.t.enchufes], [1, 0, ['base']]);
}

console.log('\nLA RESPUESTA QUE LLEGA DESPUÉS DEL ENCHUFE');
{
  aparato('escritorio');
  B.demoraMs = 80;                                     // menos que el tope de la pregunta: contesta, pero tarde para el enchufe
  const { qm, t } = montarApp();
  await arrancar(qm, t, { espera: 20 });
  eq('el arranque no espera de más: enchufa con lo que sabe (sin modo: la hoja)', t.enchufes, ['hoja']);
  await pausa(200);
  eq('cuando la base contesta, el aviso vuelve a enchufar la bandeja, ahora a la base, y sincroniza', [modoAqui(), t.enchufes, t.syncs], ['base', ['hoja', 'base'], 1]);
  eq('sin banda', qm.noSabe(), '');
}

console.log('\nEL TELÉFONO SIN SESIÓN EN LA BASE (SIN TOKEN DE DISPOSITIVO): BANDA ROJA');
{
  aparato('telefono');
  const { qm, t } = montarApp({ rol: 'fabricacion' });
  await arrancar(qm, t);
  eq('no sabe el modo: la bandeja queda en la hoja', [modoAqui(), t.enchufes], ['', ['hoja']]);
  eq('lo dice: no sabe a dónde guardar porque no ha entrado a la base', qm.noSabe(), 'sin_sesion');
  const b = qm.banda();
  eq('banda roja, con el botón para entrar con su cuenta', [b.tono, b.accion.label], ['mal', 'Entrar con tu cuenta']);
  cierto('  y lo dice con todas sus letras', /Este aparato no sabe a dónde guardar/.test(b.html) && /no sabe si manda la hoja o la base/.test(b.html));
  cierto('se repintó la banda al saberlo', t.repintados > 0);
  eq('no se le preguntó a la base sin sesión', B.miAcceso, 0);
  /* El botón: sin sesión, el botón de Google en la banda (el flujo de siempre), con la cuenta de la puerta. */
  await b.accion.fn(); await pausa(40);
  eq('el botón ofrece el de Google con la cuenta de la puerta', t.ofrecidos, ['beto@al3d.test']);
  /* Entró con el botón de Google: la base contesta y la banda se va; la bandeja se vuelve a enchufar. */
  B.sesion = { access_token: 'jwt', user: { email: 'beto@al3d.test' } }; B.correo = 'beto@al3d.test';
  await qm.preguntar();
  eq('ya dentro: guarda el modo, se vuelve a enchufar a la base y la banda se va', [modoAqui(), t.enchufes.slice(-1)[0], qm.noSabe()], ['base', 'base', '']);
  B.correo = 'eliasgaribi@gmail.com';
}

console.log('\nLA BASE CONTESTA ALGO QUE NO ES «ACTIVO»');
{
  aparato('telefono', { claves: { al3d_pf_supa_modo: JSON.stringify({ modo: 'base', area: 'fabricacion' }) } });
  B.sesion = { access_token: 'jwt', user: { email: 'beto@al3d.test' } }; B.estado = 'sin_acceso';
  const { qm, t } = montarApp({ rol: 'fabricacion' });
  await arrancar(qm, t);
  const b = qm.banda();
  eq('aunque sepa el modo de antes, la banda roja dice que la base no reconoce esta cuenta, con «Volver a preguntar»', [qm.noSabe(), b.tono, b.accion.label], ['cuenta', 'mal', 'Volver a preguntar']);
  cierto('  y dónde se arregla', /Ajustes → La base de datos → Personas/.test(b.html));
  B.estado = 'activo';
  b.accion.fn(); await pausa(30);
  eq('dada de alta, volver a preguntar quita la banda', qm.noSabe(), '');
}

console.log('\nLA HOJA DICE QUE LA BASE MANDA (`al3d-la-base-manda`)');
{
  /* Un aparato que oyó «hoja» hace días; la empresa ya pasó a la base y la hoja rechaza la escritura (LA_BASE_MANDA). */
  aparato('escritorio', { claves: { al3d_pf_supa_modo: JSON.stringify({ modo: 'hoja', area: 'direccion' }) } });
  B.modo = 'hoja';                                     // al abrir, la empresa todavía estaba en la hoja
  const { qm, t } = montarApp();
  await arrancar(qm, t);
  eq('al abrir: la hoja', [modoAqui(), t.enchufes], ['hoja', ['hoja']]);
  B.modo = 'base';                                     // Dirección la pasó a la base; la hoja ya rechaza las escrituras
  const antes = B.miAcceso;
  globalThis.dispatchEvent(new CustomEvent('al3d-la-base-manda'));
  await pausa(30);
  eq('el aviso dispara la pregunta a la base: guarda «base» y la bandeja se vuelve a enchufar', [B.miAcceso - antes, modoAqui(), t.enchufes.slice(-1)[0]], [1, 'base', 'base']);
  eq('sin banda', qm.noSabe(), '');
  globalThis.dispatchEvent(new CustomEvent('al3d-la-base-manda'));
  globalThis.dispatchEvent(new CustomEvent('al3d-la-base-manda'));
  await pausa(30);
  eq('cada vuelta de la bandeja puede traer otro: no se pregunta en cada uno (una vez cada 30 s)', B.miAcceso - antes, 1);
  /* La hoja dice «base» y la base todavía dice «hoja» (alguien la regresó, o la hoja está mal puesta): no se calla. */
  B.modo = 'hoja'; t.reloj += 31000;
  globalThis.dispatchEvent(new CustomEvent('al3d-la-base-manda'));
  await pausa(30);
  eq('la hoja y la base no se ponen de acuerdo: la base manda en el modo (vuelve a la hoja) y la banda roja lo dice',
     [modoAqui(), t.enchufes.slice(-1)[0]], ['hoja', 'hoja']);
  globalThis.dispatchEvent(new CustomEvent('al3d-la-base-manda'));
  await pausa(5);
  eq('  y si la hoja sigue diciendo «base», la banda roja dice que no se ponen de acuerdo', [qm.noSabe(), qm.banda().tono], ['desacuerdo', 'mal']);
  B.modo = 'base';
}
{
  /* El teléfono sin sesión: la entrada de siempre (sin botón si Google la da), UNA vez; y la banda roja. */
  aparato('telefono', { claves: { al3d_pf_supa_modo: JSON.stringify({ modo: 'hoja', area: 'fabricacion' }) } });
  const { qm, t } = montarApp({ rol: 'fabricacion' });
  await arrancar(qm, t);
  eq('al abrir, sin sesión pero con el modo de antes: sin banda (vale lo último que oyó)', qm.noSabe(), '');
  globalThis.dispatchEvent(new CustomEvent('al3d-la-base-manda'));
  await pausa(200);
  eq('sin sesión: intenta entrar (la entrada de siempre) y pone la banda roja', [t.conexiones, qm.noSabe(), qm.banda().tono], [1, 'sin_sesion', 'mal']);
  t.reloj += 31000;
  globalThis.dispatchEvent(new CustomEvent('al3d-la-base-manda'));
  await pausa(200);
  eq('otro aviso medio minuto después vuelve a preguntar, pero no vuelve a pedirle a Google', t.conexiones, 1);
}
{
  /* Apagado (nunca se encendió aquí): la banda roja y su botón lo enciende; nada lo enciende solo. */
  aparato('telefono', { encendido: false });
  const { qm, t } = montarApp({ rol: 'pagos' });
  await arrancar(qm, t);
  eq('apagado y sin que nadie diga nada: lo de siempre, sin banda', [qm.noSabe(), S.encendido()], ['', false]);
  globalThis.dispatchEvent(new CustomEvent('al3d-la-base-manda'));
  await pausa(10);
  const b = qm.banda();
  eq('la hoja dice que la base manda: banda roja con «Entrar con tu cuenta», sin preguntarle a la base y sin encender nada solo',
     [qm.noSabe(), b.tono, b.accion.label, B.miAcceso, S.encendido()], ['apagado', 'mal', 'Entrar con tu cuenta', 0, false]);
  await b.accion.fn(); await pausa(40);
  eq('el botón lo enciende (un toque a mano) y ofrece el de Google', [S.encendido(), S.apagadoAProposito(), t.ofrecidos], [true, false, ['beto@al3d.test']]);
}
{
  /* Dirección lo apagó aquí a propósito (Ajustes): se respeta —nada lo enciende solo— y la banda se lo dice así. */
  aparato('escritorio', { claves: { al3d_pf_supa: null, al3d_pf_supa_no: '1' } });
  const { qm, t } = montarApp({ rol: 'direccion' });
  await arrancar(qm, t);
  globalThis.dispatchEvent(new CustomEvent('al3d-la-base-manda'));
  await pausa(10);
  const b = qm.banda();
  eq('apagado a propósito por Dirección: «Encender y entrar», y sigue apagado hasta que lo toque', [qm.noSabe(), b.accion.label, S.encendido(), S.apagadoAProposito()],
     ['apagado_dir', 'Encender y entrar', false, true]);
  cierto('  la banda dice que lo apagó a propósito', /la apagaste a propósito/.test(b.html));
  await b.accion.fn(); await pausa(80);
  eq('al tocarlo: encendido, sin la marca, con sesión pregunta a la base y la bandeja se enchufa a la base', [S.encendido(), S.apagadoAProposito(), modoAqui(), qm.noSabe(), t.enchufes.slice(-1)[0]],
     [true, false, 'base', '', 'base']);
}

console.log('\nDOS PESTAÑAS: EL MODO QUE OYÓ UNA LE LLEGA A LA OTRA');
{
  aparato('escritorio');
  B.demoraMs = 0;
  /* La pestaña B tiene su propia ventana: el aviso `al3d-modo` de la A no le llega; `storage`, sí (así es en el navegador). */
  const ventanaB = new EventTarget();
  const a = montarApp(), b = montarApp({ ventana: ventanaB });
  b.qm.listo(); b.t.enchufes.push(S.laBaseManda() ? 'base' : 'hoja');     // B ya estaba abierta, en la hoja
  await arrancar(a.qm, a.t);
  eq('la A oyó a la base y se enchufó a la base; la B sigue como estaba', [a.t.enchufes, b.t.enchufes], [['base'], ['hoja']]);
  const ev = Object.assign(new Event('storage'), { key: 'al3d_pf_supa_modo', newValue: almacen.get('al3d_pf_supa_modo') });
  ventanaB.dispatchEvent(ev);
  await pausa(5);
  eq('el aviso `storage` de esa clave vuelve a enchufar la B, a la base, y sincroniza', [b.t.enchufes, b.t.syncs], [['hoja', 'base'], 1]);
  ventanaB.dispatchEvent(Object.assign(new Event('storage'), { key: 'al3d_historial', newValue: '[]' }));
  ventanaB.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
  await pausa(5);
  eq('otra clave (o un `clear`) no enchufa nada', b.t.enchufes.length, 2);
  /* La otra pestaña volvió a preguntar y reescribió la llave con el MISMO modo (solo cambia su `visto`): eso no es un
     cambio, y reaccionar a él hacía un bucle entre dos pestañas abiertas (revisión de la Tanda 1, 2026-10-26). */
  const igual = almacen.get('al3d_pf_supa_modo');
  const otraVez = igual.replace(/"visto":\d+/, '"visto":' + (Date.now() + 1000));
  ventanaB.dispatchEvent(Object.assign(new Event('storage'), { key: 'al3d_pf_supa_modo', oldValue: igual, newValue: otraVez }));
  await pausa(5);
  eq('el mismo modo con otro `visto` no vuelve a enchufar: no hay bucle entre pestañas', b.t.enchufes.length, 2);
  /* Y si en la otra pestaña apagan el interruptor (Ajustes), ésta vuelve a la hoja. */
  almacen.delete('al3d_pf_supa');
  ventanaB.dispatchEvent(Object.assign(new Event('storage'), { key: 'al3d_pf_supa', newValue: null }));
  await pausa(5);
  eq('el interruptor apagado en la otra pestaña: ésta vuelve a la hoja', b.t.enchufes.slice(-1)[0], 'hoja');
}

console.log('\nLA PUERTA DEL ESCRITORIO LE PREGUNTA A LA BASE CUANDO NO SABE EL MODO');
{
  aparato('escritorio');
  ventanaActual = new EventTarget();                    // una carga nueva: la puerta va antes que la app
  /* El permiso de la hoja de este Chrome lo leyó ingreso.js al cargarse (arriba, antes de importar supa.js). */
  const P = await import('../js/nucleo/puerta.js');
  const Prefs = await import('../js/datos/prefs.js');
  B.miAcceso = 0; H.pedidas = 0;
  await P.reconfirmar();
  eq('la vuelta de fondo le preguntó a la base, que dejó el modo guardado', [B.miAcceso, modoAqui()], [1, 'base']);
  eq('el pase lo da la base, con su área', [Prefs.pase().de, Prefs.pase().rol], ['base', 'direccion']);
  eq('y no se le preguntó a la hoja', H.pedidas, 0);
  /* Sin sesión en la base, la puerta sigue con la hoja como siempre (no deja a nadie fuera). */
  almacen.delete('al3d_pf_supa_modo'); B.sesion = null; B.miAcceso = 0; H.pedidas = 0;
  await P.reconfirmar();
  eq('sin sesión en la base: la hoja, como siempre, y el pase sigue', [B.miAcceso, H.pedidas > 0, Prefs.pase() && Prefs.pase().rol], [0, true, 'direccion']);
}

console.log('\nEL ARRANQUE, EN EL TEXTO DE js/app.js Y DE LA PUERTA');
{
  const a = sinComentarios(app);
  const arr = a.slice(a.indexOf('async function arrancar('), a.indexOf('\n}', a.indexOf('async function arrancar(')));
  const pos = s => arr.indexOf(s);
  cierto('los oyentes del modo se cuelgan antes de la puerta y antes de cualquier pregunta (MB-15)',
         pos('QM.colgar(window);') > 0 && pos('QM.colgar(window);') < pos('Puerta.custodiar(') && pos('QM.colgar(window);') < pos('QM.preguntar();'));
  cierto('la pregunta sale en cuanto pasa la puerta, antes de abrir la base local y de montar la primera pantalla',
         pos('QM.preguntar();') > pos('Puerta.custodiar(') && pos('QM.preguntar();') < pos('await DB.abrir();') && pos('QM.preguntar();') < pos('await montar(rutaDelHash());'));
  cierto('el enchufe de la bandeja espera la respuesta un momento, después de la primera pantalla',
         pos('await montar(rutaDelHash());') < pos('await QM.esperar(MS_TOPE_MODO_AL_ARRANCAR);') &&
         pos('await QM.esperar(MS_TOPE_MODO_AL_ARRANCAR);') < pos('QM.listo();') && pos('QM.listo();') < pos('await enchufarPuente();'));
  eq('el aviso `al3d-modo` se oye en un solo lugar (el de `crearQuienManda`)', (a.match(/addEventListener\('al3d-modo'/g) || []).length, 1);
  cierto('la vigilancia ya no arranca suelta después de montar', !/S\.vigilar\(\)/.test(a));
  cierto('la banda la pide revisarDispositivo, roja con el botón de Google si hace falta un toque', /const noSabe = QM\.banda\(\);/.test(a) && /tono: urge \? 'mal' : ''/.test(a));
  cierto('el enchufe lleva turno: el que leyó el modo viejo no registra nada', (a.match(/if \(turno !== _enchufeTurno\) return Sync\.configurado\(\);/g) || []).length === 2);
  cierto('la entrada única que contesta «ya» pregunta si hace falta', /if \(r\.acceso\) QM\.anotar\(r\.acceso\); else QM\.preguntarSiHaceFalta\(\);/.test(a));
  const pu = sinComentarios(leer('js/nucleo/puerta.js'));
  cierto('la puerta, sin modo oído, le pregunta primero a la base (y en la vuelta de fondo sin el permiso de la hoja)',
         /if \(supaSinModo\(\)\) \{\s*const v0 = await preguntarALaBase\(\);/.test(pu) && /if \(!conPantalla && supaSinModo\(\)\) \{\s*const vb = await preguntarALaBase\(\);/.test(pu));
  cierto('y si /salud de la hoja dice «base» y este aparato no lo sabe, avisa a la app',
         /if \(s && s\.modo === 'base' && !laBaseManda\(\)\) avisarQueLaBaseManda\('salud'\);/.test(pu) && /new CustomEvent\('al3d-la-base-manda'/.test(pu));
  const su = sinComentarios(leer('js/nucleo/supa.js'));
  cierto('supa.js: la pregunta compartida y la sesión tienen tope', /conTope\(accesoDeVerdad\(\), TOPES\.acceso,/.test(su) && /conTope\(c\.auth\.getSession\(\), TOPES\.sesion, null\)/.test(su));
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);   // `vigilar()` deja su reloj puesto: sin esto node no termina
