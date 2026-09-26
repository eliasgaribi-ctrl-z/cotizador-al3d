/* LO QUE HACE QUE SE SIENTA COMO APP SIN QUE SE LLEVE EL TRABAJO DE NADIE.
 *
 * Una auditoría de septiembre de 2026 encontró diecisiete defectos en la plataforma, y casi
 * todos tenían la misma forma: algo que la app hacía SOLA —recargarse por una versión nueva,
 * sincronizar cada 30 s, renovar el permiso de Google en el siguiente clic, podar un marco al
 * cambiar de pantalla— y que, en el caso que nadie miró, tiraba lo que la persona estaba
 * haciendo o se quedaba colgado para siempre. Ninguno da error: dan una pantalla que se
 * recarga en seco, un botón deshabilitado que no vuelve, una puerta que se cierra a los 30
 * días a alguien que tuvo señal todo el mes.
 *
 * Lo que se puede probar corriendo, se prueba corriendo: la ventana de Google (con un doble
 * de su biblioteca) y la revisión del respaldo. Lo que vive en app.js —que se arranca solo al
 * importarlo— se amarra por su texto, como ya hacen pruebas/puerta.mjs y pruebas/csp.mjs.
 *
 * Se corre con pruebas/correr.sh, como todas.
 */

import { readFileSync, readdirSync } from 'node:fs';
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
/* Los saltos de línea se normalizan: en un clon de Windows los archivos llegan en CRLF. */
const leer = r => readFileSync(join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ----- El entorno: un localStorage de mentira y un doble de Google Identity Services ----- */
globalThis.localStorage = {
  _d: {},
  getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
/* Cada `initTokenClient` deja su cliente aquí, y `requestAccessToken` hace lo que diga
   `GOOGLE.hace` —contestar con token, cerrar la ventana, bloquearla o no contestar nunca—. */
const GOOGLE = { clientes: [], hace: () => {} };
globalThis.window = globalThis;
globalThis.google = { accounts: { oauth2: { initTokenClient(cfg) {
  const cli = { cfg, callback: cfg.callback, pedidas: 0,
    requestAccessToken(op) { this.pedidas++; GOOGLE.hace(this, op); } };
  GOOGLE.clientes.push(cli);
  return cli;
} } } };
globalThis.fetch = async () => ({ ok: true, json: async () => ({ email: 'beto@al3d.mx', email_verified: true }) });

const Prefs = await import('../js/datos/prefs.js');
const Gcal = await import('../js/nucleo/gcal.js');
const Ingreso = await import('../js/nucleo/ingreso.js');
const de = scope => GOOGLE.clientes.filter(c => c.cfg.scope === scope);
const CAL = 'https://www.googleapis.com/auth/calendar.events';

console.log('\nLA VENTANA DE GOOGLE CALENDAR SIEMPRE CONTESTA');
{
  /* Sin `error_callback`, la ventana que el navegador bloquea y la que la persona cierra no
     llegaban por ningún lado: el botón «Crearla en Google Calendar» del Calendario se quedaba
     deshabilitado para siempre y «Conectar» de Ajustes colgado. */
  Prefs.setGcal({ clientId: 'cliente-A.apps.googleusercontent.com' });
  GOOGLE.hace = cli => cli.cfg.error_callback({ type: 'popup_closed' });
  let r = await Gcal.pedirToken(false);
  eq('ventana cerrada: contesta que no, en vez de quedarse esperando', r.ok, false);
  cierto('  y dice que se cerró la ventana', /cerró la ventana/.test(r.mensaje));
  GOOGLE.hace = cli => cli.cfg.error_callback({ type: 'popup_failed_to_open' });
  r = await Gcal.pedirToken(false);
  cierto('ventana bloqueada: contesta, y dice dónde se arregla', !r.ok && /bloqueó la ventana/.test(r.mensaje));
  GOOGLE.hace = cli => cli.cfg.error_callback({ type: 'otra_cosa' });
  r = await Gcal.pedirToken(false);
  eq('cualquier otro fallo de Google también contesta', r.ok, false);
  eq('  y todo eso con UN solo cliente: el Client ID no cambió', de(CAL).length, 1);

  /* El cliente se creaba UNA vez con el Client ID de ese momento: corregirlo en Ajustes no
     servía hasta recargar. */
  Prefs.setGcal({ clientId: 'cliente-B.apps.googleusercontent.com' });
  GOOGLE.hace = cli => cli.callback({ access_token: 'tok-cal', expires_in: 3600 });
  r = await Gcal.pedirToken(false);
  eq('con el Client ID cambiado en Ajustes, la ventana sale con el NUEVO', de(CAL).map(c => c.cfg.client_id).slice(-1), ['cliente-B.apps.googleusercontent.com']);
  cierto('  y el token llega', r.ok && r.valor.token === 'tok-cal' && Gcal.conectado());
  eq('  sin crear un cliente por petición: dos, uno por Client ID', de(CAL).length, 2);
  Gcal.desconectar();

  const src = sinComentarios(leer('js/nucleo/gcal.js'));
  cierto('y hay tope de espera para la ventana que no avisa por ningún camino',
         /const MS_VENTANA = \d+/.test(src) && /setTimeout\(\(\) => fin\(mal\('SIN_RED', MSG\.SIN_RESPUESTA\)\), MS_VENTANA\)/.test(src));
  const ms = Number((src.match(/const MS_VENTANA = (\d+)/) || [])[1]);
  cierto('  largo, porque detrás hay una persona leyendo la pantalla de permisos', ms >= 60000);
}

console.log('\nENTRAR CON GOOGLE TAMBIÉN VE EL IDENTIFICADOR NUEVO');
{
  const ID = 'openid email';
  Prefs.setIngreso({ clientId: 'ingreso-X.apps.googleusercontent.com' });
  GOOGLE.hace = cli => cli.callback({ access_token: 'tok-1', expires_in: 3600 });
  let r = await Ingreso.entrar(false);
  cierto('entra con el identificador pegado en Ajustes', r.ok && de(ID).slice(-1)[0].cfg.client_id === 'ingreso-X.apps.googleusercontent.com');
  Ingreso.salir();
  Prefs.setIngreso({ clientId: 'ingreso-Y.apps.googleusercontent.com' });
  r = await Ingreso.entrar(false);
  cierto('y al cambiarlo, la siguiente ventana sale con el nuevo sin recargar',
         r.ok && de(ID).slice(-1)[0].cfg.client_id === 'ingreso-Y.apps.googleusercontent.com' && de(ID).length === 2);
  Ingreso.salir();
  /* app.js deja de insistir un rato cuando la persona cerró la ventana: lo reconoce por este
     código. */
  GOOGLE.hace = cli => cli.cfg.error_callback({ type: 'popup_closed' });
  r = await Ingreso.entrar(false);
  eq('cerrar la ventana de entrar contesta DATO_INVALIDO, que es lo que app.js oye para no insistir', r.codigo, 'DATO_INVALIDO');
}

console.log('\nLA MITAD DEL COTIZADOR DE UN RESPALDO SE REVISA ANTES DE GUARDARLA');
{
  const { revisarMitadCotizador: rev } = await import('../js/mod/ajustes.js');
  const bueno = { app: 'cotizador-al3d', formato: 1, fecha: '2026-09-01T10:00:00Z',
    datos: { al3d_historial: '[{"folio":"COT-0001"}]', al3d_queue: '[]', al3d_folio: '12',
             al3d_q: '{"items":[]}', al3d_cuadernos: '{"tel:333":"paga en efectivo"}' } };
  eq('un respaldo sano pasa', rev(bueno), '');
  eq('uno con solo el historial también', rev({ app: 'cotizador-al3d', datos: { al3d_historial: '[]' } }), '');
  /* El caso de la auditoría: la tarjeta del cotizador metía `.length` en un innerHTML. */
  cierto('un historial que es un objeto con length de marcado NO pasa',
         rev({ ...bueno, datos: { ...bueno.datos, al3d_historial: '{"length":"<img src=x onerror=alert(1)>"}' } }) !== '');
  cierto('ni una cola que no es arreglo', rev({ ...bueno, datos: { ...bueno.datos, al3d_queue: '{"0":1}' } }) !== '');
  cierto('ni una cotización en curso sin items', rev({ ...bueno, datos: { ...bueno.datos, al3d_q: '{"cliente":"x"}' } }) !== '');
  cierto('ni unos cuadernos que son un arreglo', rev({ ...bueno, datos: { ...bueno.datos, al3d_cuadernos: '[]' } }) !== '');
  cierto('ni JSON roto', rev({ ...bueno, datos: { ...bueno.datos, al3d_historial: '[{' } }) !== '');
  cierto('ni datos que no son texto', rev({ ...bueno, datos: { al3d_historial: [] } }) !== '');
  cierto('ni un arreglo en vez de los datos', rev({ app: 'cotizador-al3d', datos: ['a'] }) !== '');
  cierto('ni datos que no son del cotizador', rev({ app: 'cotizador-al3d', datos: { otra_cosa: '1' } }) !== '');
  cierto('ni otra app', rev({ app: 'al3d-completo', datos: bueno.datos }) !== '');
  cierto('ni nada', rev(null) !== '' && rev('texto') !== '' && rev([]) !== '');
  const aj = leer('js/mod/ajustes.js');
  cierto('y Ajustes lo revisa ANTES de restaurar y de dejarlo esperando',
         aj.indexOf('revisarMitadCotizador(paquete.cotizador)') > 0 &&
         aj.indexOf('revisarMitadCotizador(paquete.cotizador)') < aj.indexOf('await DB.importar(textoPlataforma)') &&
         !/mitadCotizador = JSON\.stringify\(paquete\.cotizador\);[^\n]*\n?[^\n]*typeof paquete\.cotizador === 'object'/.test(aj));
}

console.log('\nLA VERSIÓN NUEVA NO SE LLEVA EL TRABAJO');
{
  const app = sinComentarios(leer('js/app.js'));
  const sw = (app.match(/function registrarSW\(\) \{[\s\S]*?\n\}/) || [''])[0];
  const estorba = (app.match(/function estorbaRecargar\(\) \{[\s\S]*?\n\}/) || [''])[0];
  /* El foco dentro de un marco deja `activeElement` en el <iframe>, no en el campo. */
  cierto('recargar estorba con el foco en un campo O dentro de un marco', /INPUT\|TEXTAREA\|SELECT\|IFRAME/.test(estorba));
  cierto('  y con una capa abierta', estorba.includes('hayCapaAbierta()'));
  cierto('  y con un marco vivo que diga tener algo sin guardar', estorba.includes('marcoConPendiente'));
  cierto('con una pantalla de marco delante también espera', /const deMarco = [\s\S]{0,80}\.conservar/.test(sw) && sw.includes('if (!deMarco && !estorbaRecargar()) { recargar(); return; }'));
  cierto('aplazada, se pone en la siguiente navegación o al irse a segundo plano',
         sw.includes("window.addEventListener('hashchange', enLaPausa)") && /visibilityState === 'hidden'\) enLaPausa\(\)/.test(sw));
  cierto('  solo si en ese momento ya no estorba', /const enLaPausa = \(\) => \{ if \(!recargado && !estorbaRecargar\(\)\) recargar\(\); \};/.test(sw));
  cierto('  y mientras tanto la banda lo dice, con «Recargar»', sw.includes('_versionNueva = true') &&
         /if \(_versionNueva\) \{\s*pintarBanda\(\{[\s\S]{0,200}label: 'Recargar'/.test(app));
  /* `habia` se calculaba una vez: una página abierta sin controlador ignoraba TODAS las
     versiones nuevas de su vida. */
  cierto('sin controlador al abrir se ignora UN cambio, no todos',
         sw.includes('let ignorarUno = !navigator.serviceWorker.controller;') &&
         sw.includes('if (ignorarUno) { ignorarUno = false; return; }') && !/const habia/.test(sw));
}

console.log('\nLO QUE ESTE TELÉFONO SUBIÓ NO REMONTA SU PROPIA PANTALLA');
{
  const app = sinComentarios(leer('js/app.js'));
  const sinc = (app.match(/async function sincronizarDeVerdad\(\) \{[\s\S]*?\n\}/) || [''])[0];
  cierto('bombear no suma a `movio`', /try \{ await Sync\.bombear\(\); \} catch/.test(sinc) && !/subidas/.test(sinc));
  cierto('  lo que baja sí', /movio \+= \(Number\(r\.valor\.nuevos\)/.test(sinc));
}

console.log('\nEL PERMISO DE GOOGLE, CON FRENO, Y CON EL PASE DETRÁS');
{
  const app = sinComentarios(leer('js/app.js'));
  const clic = (app.match(/document\.addEventListener\('click', async \(\) => \{[\s\S]*?\}, true\);/) || [''])[0];
  cierto('un intento por minuto como mucho, el mismo tope que puente.js',
         /const MS_ENTRE_RENOVACIONES = 60000;/.test(app) && clic.includes('ahora - _renovadoEn < MS_ENTRE_RENOVACIONES') &&
         /const MS_ENTRE_RENOVACIONES = 60000;/.test(leer('js/datos/puente.js')));
  cierto('  y tras cerrar la ventana, un buen rato sin insistir', clic.includes("r.codigo === 'DATO_INVALIDO'") && clic.includes('_renovarDesde = Date.now() + MS_TRAS_NEGARSE'));
  cierto('  apuntando el intento ANTES de abrir la ventana', clic.indexOf('_renovadoEn = Date.now()') < clic.indexOf('await Ingreso.renovar()'));
  cierto('renovado, se da la vuelta a la hoja sin esperarla', /import\('\.\/nucleo\/puerta\.js'\)\.then\(P => P\.reconfirmar\(\)\)/.test(clic) && !/await import\('\.\/nucleo\/puerta\.js'\)/.test(clic));

  const pu = sinComentarios(leer('js/nucleo/puerta.js'));
  const rec = (pu.match(/export async function reconfirmar\(\) \{[\s\S]*?\n\}/) || [''])[0];
  cierto('reconfirmar() existe y hace la comprobación de siempre, con su segunda opinión', rec.includes('await confirmarDeVerdad(false)'));
  cierto('  solo con token vivo: sin él la hoja no sabría quién pregunta', rec.includes('if (!Ingreso.dentro()) return;'));
  cierto('  a quien quitaron de «Accesos» lo echa', /r\.estado === 'fuera'[\s\S]{0,80}Prefs\.borrarPase\(\);[\s\S]{0,40}pedirEntrada\(MSG\.FUERA\([^)]*\)\), null, true\)/.test(rec));
  cierto('  si le cambiaron el rol, recarga', /r\.rol !== rolAntes\) \{ location\.reload\(\)/.test(rec));
  cierto('  y si todo bien, borra el «Llevas días sin señal»', rec.includes("_avisar('')") && pu.includes('_avisar = typeof avisar'));
}

console.log('\nANTES DE PODAR UN MARCO SE LE PREGUNTA');
{
  const app = sinComentarios(leer('js/app.js'));
  const montar = (app.match(/async function montarDeVerdad\(ruta, opts = \{\}\) \{[\s\S]*?\n\}/) || [''])[0];
  cierto('lo que se va a vaciar se le pregunta a su beforeunload', montar.includes('plan.vaciar.filter(marcoConPendiente)'));
  cierto('  y se pide confirmación con la capa de la app, no con confirm()', /await confirmarPf\(\{/.test(montar) && !/\bconfirm\(/.test(montar));
  cierto('  ANTES de soltar nada', montar.indexOf('confirmarPf') < montar.indexOf('for (const x of plan.soltar) soltar('));
  cierto('  y quedarse deja la dirección como estaba', /if \(!si\) \{[\s\S]{0,200}history\.replaceState\(null, '', '#\/' \+ _actual\)/.test(montar));
  const mc = (app.match(/function marcoConPendiente\(ruta\) \{[\s\S]*?\n\}/) || [''])[0];
  cierto('la pregunta es un beforeunload cancelable dentro del marco', /new w\.Event\('beforeunload', \{ cancelable: true \}\)/.test(mc) && mc.includes('return ev.defaultPrevented'));
  /* Y la condición que contesta es la del cotizador: si un día se quita de ahí, esto deja de
     proteger nada sin dar error. */
  cierto('  y el cotizador sigue contestándola en su beforeunload', /addEventListener\('beforeunload',\s*e\s*=>/.test(leer('js/cotizador/arranque.js')));
}

console.log('\nINSTALAR, TAMBIÉN EN EL TELÉFONO');
{
  const html = leer('index.html');
  const cab = (html.match(/<header class="pf-cab">[\s\S]*?<\/header>/) || [''])[0];
  cierto('el encabezado lleva su botón de instalar, que es lo que se ve en el teléfono', /id="pf-cab-instalar" hidden/.test(cab));
  cierto('  y se apaga donde manda el de la barra lateral', /@media\(min-width:760px\)\{ \.pf-cab-instalar\{display:none\} \}/.test(leer('css/plataforma.css')));
  const app = sinComentarios(leer('js/app.js'));
  const bip = (app.match(/window\.addEventListener\('beforeinstallprompt', ev => \{[\s\S]*?\}\);/) || [''])[0];
  cierto('el aviso del navegador solo se aparta si hay un botón que lo use', bip.indexOf('if (!botonDeInstalar()) return;') >= 0 && bip.indexOf('if (!botonDeInstalar()) return;') < bip.indexOf('ev.preventDefault()'));
  cierto('  y los dos botones se pintan y se oyen igual', app.includes("const BOTONES_INSTALAR = ['pf-instalar', 'pf-cab-instalar'];") &&
         /for \(const id of BOTONES_INSTALAR\) \{ const ins = \$\(id\); if \(ins\) ins\.onclick = instalarApp; \}/.test(app));
}

console.log('\nLA MESA DE CORTE, SOLO PARA QUIEN LA TIENE, Y SIN PERDER EL TRAZO');
{
  const tb = sinComentarios(leer('js/mod/tablero.js'));
  cierto('el segmento de la mesa no se pinta sin la ruta `anidador`', /function segLente\(\) \{\s*if \(!conMesa\(\)\) return '';/.test(tb));
  cierto('  ni el pase lo abre', tb.includes("_vista = (pase.vista === 'anidador' && conMesa()) ? 'anidador' : 'tablero';"));
  cierto('  ni se queda puesto si el rol cambió', tb.includes("if (_vista === 'anidador' && !conMesa()) _vista = 'tablero';"));
  cierto('  ni el toque en el segmento', tb.includes("(lente.dataset.vista === 'anidador' && conMesa()) ? 'anidador' : 'tablero'"));
  cierto('y conMesa pregunta a la lista de rutas', /function conMesa\(\) \{\s*if \(_ctx && typeof _ctx\.tieneRuta === 'function'\) return _ctx\.tieneRuta\('anidador'\);/.test(tb));
  cierto('el trazo del vectorizador sigue de largo a la ruta `anidador`, que sí se conserva',
         /const aLaMesa = !!\(pase && pase\.vista === 'anidador' && !pase\.proyecto_id && conMesa\(\)[\s\S]{0,80}if \(aLaMesa\) \{ _vista = 'tablero'; ctx\.ir\('anidador'\); \}/.test(tb) &&
         tb.includes('if (pase && pase.vista && !aLaMesa) _vista'));
  const an = leer('anidador-vectores/js/app.js');
  const carga = (an.match(/function cargarTexto\(texto, nombre, opts\) \{[\s\S]*?\n  \}/) || [''])[0];
  cierto('la banda de «Trazo recibido…» se quita al cargar un archivo que no viene del cotizador',
         /if \(opts\.origen !== 'cotizador'\) \{[\s\S]{0,120}banda\.hidden = true;/.test(carga));
}

console.log('\nLO DEMÁS');
{
  const mods = ['tablero', 'inicio', 'mapa', 'fabricacion'].map(m => 'js/mod/' + m + '.js');
  eq('ningún scrollIntoView con «smooth» a secas: preguntan por prefers-reduced-motion',
     mods.filter(r => /behavior:\s*'smooth'/.test(sinComentarios(leer(r)))), []);
  cierto('  con una sola pregunta, en ui.js', /export function scrollSuave\(\) \{[\s\S]{0,200}prefers-reduced-motion: reduce/.test(leer('js/nucleo/ui.js')) &&
         mods.every(r => /behavior: scrollSuave\(\)/.test(leer(r))));

  const sw = leer('sw.js');
  const PAGINAS = new RegExp((sw.match(/const PAGINAS = \/(.+)\/;/) || [, '$^'])[1]);
  cierto('sw.js: /verificar y /verificar.html van con la plataforma, que es donde están guardadas',
         PAGINAS.test('/verificar') && PAGINAS.test('/verificar.html') && PAGINAS.test('/cotizador'));
  const guiones = readdirSync(join(RAIZ, 'js', 'cotizador')).filter(n => n.endsWith('.js')).length;
  const N = { 10: 'diez', 11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce' };
  /* Las dos frases que hablan del cotizador; los «diez guiones» del anidador son otros. */
  const dice = [...sw.matchAll(/cotizador\.html más (\S+) guiones|la página y sus (\S+) guiones/g)].map(m => m[1] || m[2]);
  eq('sw.js cuenta bien los guiones del cotizador: son ' + guiones, dice, [N[guiones], N[guiones]]);
}

console.log('\n' + bien + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
