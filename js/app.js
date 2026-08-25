/* ============================================================================
   Arranque y router de la plataforma.

   Un solo documento con rutas por hash, no seis HTML. Cuatro razones, y ninguna es de
   gusto: navegar entre módulos sin señal no toca la red; el service worker cachea un solo
   documento de navegación en vez de seis; el registro de capas —Escape, cerco de
   tabulador, botón atrás— vive en un lugar; y GitHub Pages no necesita el truco del
   404.html para que una ruta profunda no dé 404.

   Este archivo no sabe de proyectos, de material ni de fechas. Sabe de arrancar, de qué
   módulo toca y de decir en voz alta cuando algo del dispositivo no está bien.
   ============================================================================ */

import * as DB from './datos/db.js';
import * as Prefs from './datos/prefs.js';
import * as Cot from './datos/cotizador.js';
import { $, ico, esc, toast, voz, vigilarCapas, registrarCapa, cerrarCapa, ajustarAltoBarra }
  from './nucleo/ui.js';

/* ----- Los módulos -----
   `rutas` es la única lista: de aquí sale la barra, el router y qué ve cada rol. Añadir un
   módulo es añadir un renglón.

   `roles` no es seguridad —en fase 1 no hay servidor y cualquiera cambia su rol— es modo de
   trabajo: que fabricación no tenga enfrente la pantalla de cobranza y que pagos no mueva
   el almacén sin querer. Y el mapa no le aparece a pagos porque un módulo que un rol no
   necesita no debe estar en su barra: cada pestaña de más es una decisión de más cada vez
   que se abre la app. */
const RUTAS = [
  { ruta: 'hoy',       mod: 'inicio',    seccion: 'mod-hoy',       icono: 'i-hoy',        nombre: 'Hoy',       roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'proyectos', mod: 'proyectos', seccion: 'mod-proyectos', icono: 'i-proyectos',  nombre: 'Proyectos', roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'agenda',    mod: 'agenda',    seccion: 'mod-agenda',    icono: 'i-agenda',     nombre: 'Agenda',    roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'material',  mod: 'material',  seccion: 'mod-material',  icono: 'i-material',   nombre: 'Material',  roles: ['direccion', 'fabricacion'] },
  { ruta: 'mapa',      mod: 'mapa',      seccion: 'mod-mapa',      icono: 'i-mapa',       nombre: 'Mapa',      roles: ['direccion', 'fabricacion'] },
  { ruta: 'ajustes',   mod: 'ajustes',   seccion: 'mod-ajustes',   icono: 'i-ajustes',    nombre: 'Ajustes',   roles: ['direccion', 'fabricacion', 'pagos'], oculto: true },
];

const rutasDeRol = () => RUTAS.filter(r => r.roles.includes(Prefs.rol()));
const rutaPorNombre = n => RUTAS.find(r => r.ruta === n) || null;

/* El contexto que reciben los módulos. Es explícito a propósito: un módulo que necesite
   algo que no esté aquí no lo saca de una variable global, se añade a esta lista y se ve
   en el diff quién empezó a depender de qué. */
const ctx = {
  ir,                       // navegar a otro módulo
  refrescar: () => montar(_actual, { forzar: true }),
  cuentas: pintarCuentasNav, // un módulo puede pedir que se repinten las cuentas de la barra
  banda: pintarBanda,
};

let _actual = null;      // nombre de ruta
let _vivo = null;        // el módulo montado, para desmontarlo

/* ============================================================================
   Router
   ============================================================================ */

function rutaDelHash() {
  const h = String(location.hash || '').replace(/^#\/?/, '').split('?')[0].trim();
  const r = rutaPorNombre(h);
  if (r && r.roles.includes(Prefs.rol())) return r.ruta;
  /* Una ruta que este rol no tiene no es un error del usuario: es un enlace viejo o un rol
     que cambió. Se va a la primera que sí tenga, sin regañar. */
  return (rutasDeRol()[0] || RUTAS[0]).ruta;
}

export function ir(ruta) {
  const r = rutaPorNombre(ruta);
  if (!r) return;
  if (location.hash === '#/' + r.ruta) { montar(r.ruta, { forzar: true }); return; }
  location.hash = '#/' + r.ruta;
}

async function montar(ruta, opts = {}) {
  const r = rutaPorNombre(ruta);
  if (!r) return;
  if (_actual === ruta && !opts.forzar) return;

  /* Desmontar antes de montar. Los módulos que se cuelgan de algo global —el mapa se
     suscribe a resize, la agenda a un temporizador— tienen que soltarlo o se acumulan: seis
     idas y venidas al mapa son seis oyentes de resize repintando seis mapas muertos. */
  if (_vivo && typeof _vivo.desmontar === 'function') {
    try { _vivo.desmontar(); } catch (e) { console.warn('desmontar falló', e); }
  }
  _vivo = null;

  for (const x of RUTAS) { const s = $(x.seccion); if (s) s.hidden = x.ruta !== ruta; }
  _actual = ruta;
  pintarNav();

  const cont = $(r.seccion);
  if (!cont) return;
  cont.innerHTML = '<div class="vacio">' + ico('i-reloj') + '<p class="vacio-t">Cargando…</p></div>';

  let mod;
  try {
    mod = await import('./mod/' + r.mod + '.js');
  } catch (e) {
    /* Un import que falla con el service worker a medio actualizar es el modo de falla real
       de esto: llega app.js de la red y material.js de la caché vieja. No se deja una
       pantalla en blanco: se dice qué pasó y se ofrece lo único que lo arregla. */
    console.error('no se pudo cargar el módulo ' + r.mod, e);
    cont.innerHTML = '<div class="vacio">' + ico('i-aviso') +
      '<p class="vacio-t">No se pudo cargar «' + esc(r.nombre) + '»</p>' +
      '<p class="vacio-d">Puede ser que la app se haya actualizado a medias. Recargar la deja completa.</p>' +
      '<button class="btn btn-pri" id="pf-recargar">Recargar</button></div>';
    const b = $('pf-recargar'); if (b) b.onclick = () => location.reload();
    return;
  }

  try {
    cont.innerHTML = '';
    await mod.montar(cont, ctx);
    _vivo = mod;
  } catch (e) {
    console.error('el módulo ' + r.mod + ' falló al montar', e);
    cont.innerHTML = '<div class="vacio">' + ico('i-aviso') +
      '<p class="vacio-t">«' + esc(r.nombre) + '» no se pudo pintar</p>' +
      '<p class="vacio-d">' + esc(e && e.message ? e.message : 'Error desconocido') + '</p></div>';
  }

  /* El foco al contenido y no al principio del documento: cambiar de módulo con teclado
     dejaba al usuario recorriendo otra vez las seis pestañas. */
  const main = $('pf-contenido');
  if (main && opts.foco !== false) { try { main.focus({ preventScroll: true }); } catch (_) {} }
  window.scrollTo({ top: 0, behavior: 'auto' });
  voz(r.nombre);
  pintarCuentasNav();
  ajustarAltoBarra();
}

/* ============================================================================
   La barra de módulos y el segmento de rol
   ============================================================================ */

function pintarNav() {
  const nav = $('pf-nav'); if (!nav) return;
  nav.innerHTML = rutasDeRol().filter(r => !r.oculto).map(r =>
    '<button type="button" class="pf-tab' + (r.ruta === _actual ? ' on' : '') + '"' +
    ' data-ruta="' + r.ruta + '" aria-current="' + (r.ruta === _actual ? 'page' : 'false') + '">' +
    ico(r.icono) + '<span class="tx">' + esc(r.nombre) + '</span>' +
    '<span class="cta" data-cta="' + r.ruta + '" hidden></span></button>'
  ).join('');
}

/** Las cuentas de atención de la barra. Las publica cada módulo en este mapa. */
const _cuentas = new Map();
export function ponerCuenta(ruta, n) {
  _cuentas.set(ruta, Number(n) || 0);
  pintarCuentasNav();
}
function pintarCuentasNav() {
  for (const r of RUTAS) {
    const el = document.querySelector('[data-cta="' + r.ruta + '"]');
    if (!el) continue;
    const n = _cuentas.get(r.ruta) || 0;
    el.hidden = n <= 0;
    el.textContent = n > 99 ? '99+' : String(n);
    if (n > 0) el.setAttribute('aria-label', n + ' cosas que atender en ' + r.nombre);
  }
}
ctx.ponerCuenta = ponerCuenta;

function pintarRolSeg() {
  const seg = $('pf-rolseg'); if (!seg) return;
  const actual = Prefs.rol();
  seg.innerHTML = Prefs.ROLES.map(r =>
    '<button class="' + (r === actual ? 'on' : '') + '" aria-pressed="' + (r === actual) + '"' +
    ' data-rol="' + r + '" title="' + esc(Prefs.ROL_DESC[r]) + '">' +
    esc(Prefs.ROL_NOMBRE[r]) + '</button>').join('');
}

function cambiarRol(r) {
  if (r === Prefs.rol()) return;
  if (!Prefs.setRol(r)) { toast('No se pudo guardar el rol en este dispositivo', 'err'); return; }
  pintarRolSeg();
  /* Cambiar de rol cambia qué módulos existen. Si el que estaba abierto no le toca al rol
     nuevo, se va al primero que sí; si le toca, se repinta, porque lo que ve adentro
     también cambia —los importes, sobre todo—. */
  const sigue = rutaPorNombre(_actual);
  if (sigue && sigue.roles.includes(r)) montar(_actual, { forzar: true });
  else ir(rutasDeRol()[0].ruta);
  toast('Ahora ves la plataforma como ' + Prefs.ROL_NOMBRE[r], '', 3400);
}

/* ============================================================================
   La banda de degradación
   ============================================================================ */

/** @param {{tono?:'av'|'mal', texto:string, accion?:{label:string,fn:Function}}|null} msg */
export function pintarBanda(msg) {
  const b = $('pf-banda'); if (!b) return;
  if (!msg || !msg.texto) { b.hidden = true; b.innerHTML = ''; return; }
  b.className = 'pf-banda' + (msg.tono === 'mal' ? ' mal' : '');
  b.innerHTML = ico('i-aviso') + '<span>' + msg.texto + '</span>' +
    (msg.accion ? '<button type="button" id="pf-banda-acc">' + esc(msg.accion.label) + '</button>' : '');
  b.hidden = false;
  if (msg.accion) { const x = $('pf-banda-acc'); if (x) x.onclick = msg.accion.fn; }
}

/** Lo que la plataforma tiene que decir de este dispositivo antes de que se le pregunte. */
function revisarDispositivo() {
  const e = DB.estado();
  if (!e.ok) {
    pintarBanda({ tono: 'mal', texto: '<b>' + esc(DB.motivoTexto()) + '</b>',
      accion: { label: 'Recargar', fn: () => location.reload() } });
    return;
  }
  const d = Prefs.diasSinRespaldo();
  /* Safari desaloja el almacenamiento de sitios que llevan semanas sin abrirse, y iOS es
     donde esto se usa. Un respaldo es la única defensa, y el aviso es lo único que hace que
     alguien se acuerde de bajarlo. */
  if (d === null) {
    pintarBanda({ texto: 'Nunca has respaldado la plataforma. Si el navegador limpia este sitio, se va todo lo del almacén y la agenda.',
      accion: { label: 'Respaldar', fn: respaldar } });
  } else if (d >= 9) {
    pintarBanda({ texto: 'Van <b>' + d + ' días</b> sin respaldo de la plataforma.',
      accion: { label: 'Respaldar', fn: respaldar } });
  } else {
    pintarBanda(null);
  }
}

export async function respaldar() {
  const txt = await DB.exportar();
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const sello = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' +
                p(d.getHours()) + p(d.getMinutes());
  const { descargarArchivo } = await import('./nucleo/ui.js');
  if (descargarArchivo(txt, 'plataforma-al3d-respaldo-' + sello + '.json', 'application/json')) {
    Prefs.marcarExport();
    toast('Respaldo de la plataforma descargado', 'ok', 3600);
    revisarDispositivo();
  }
}
ctx.respaldar = respaldar;

/* ============================================================================
   Arranque
   ============================================================================ */

async function arrancar() {
  pintarRolSeg();
  pintarNav();
  vigilarCapas();
  registrarCapa('pf-ficha', () => cerrarCapa('pf-ficha'));
  registrarCapa('pf-hoja',  () => cerrarCapa('pf-hoja'));
  registrarCapa('pf-pide',  () => cerrarCapa('pf-pide'));

  const seg = $('pf-rolseg');
  if (seg) seg.addEventListener('click', ev => {
    const b = ev.target.closest('[data-rol]'); if (b) cambiarRol(b.dataset.rol);
  });
  const nav = $('pf-nav');
  if (nav) nav.addEventListener('click', ev => {
    const b = ev.target.closest('[data-ruta]'); if (b) ir(b.dataset.ruta);
  });
  const aj = $('pf-ajustes-btn');
  if (aj) aj.onclick = () => ir('ajustes');

  await DB.abrir();
  revisarDispositivo();

  /* Sembrar el catálogo y las constantes. Idempotente: no pisa lo que ya se editó. Va antes
     de montar cualquier módulo porque el de material sin catálogo es una pantalla vacía que
     no dice por qué está vacía. */
  if (DB.estado().ok) {
    try {
      const Mat = await import('./datos/material.js');
      await Mat.sembrar();
    } catch (e) { console.warn('no se pudo sembrar el catálogo', e); }

    /* Drenar el buzón: lo que index.html marcó como ganado se convierte en proyecto. Va en
       el arranque y en cada evento 'storage', que es cuando el cotizador acaba de escribir
       en otra pestaña. */
    try {
      const r = await Cot.drenarBuzon();
      if (r.creados) toast(r.creados === 1 ? 'Se agregó 1 proyecto ganado' : 'Se agregaron ' + r.creados + ' proyectos ganados', 'ok', 4200);
      if (r.fallidos) toast('Hay ' + r.fallidos + ' registros de venta que no se pudieron convertir en proyecto', 'err', 5200);
    } catch (e) { console.warn('no se pudo drenar el buzón', e); }
  }

  window.addEventListener('hashchange', () => montar(rutaDelHash()));
  await montar(rutaDelHash());

  /* El cotizador acaba de guardar en otra pestaña. Aquí no se avisa de conflicto como hace
     el cotizador —la plataforma solo LEE su almacenamiento, así que no hay nada que pisar—:
     se recoge lo nuevo y se repinta. */
  window.addEventListener('storage', async ev => {
    if (!ev.key) return;
    if (ev.key === Prefs.CLAVES.GANADAS) {
      const r = await Cot.drenarBuzon();
      if (r.creados) { toast('Llegó ' + (r.creados === 1 ? 'un proyecto ganado' : r.creados + ' proyectos ganados') + ' del cotizador', 'ok', 4200); montar(_actual, { forzar: true }); }
      return;
    }
    if (['al3d_historial', 'al3d_queue'].includes(ev.key)) montar(_actual, { forzar: true });
  });

  window.addEventListener('resize', ajustarAltoBarra);
  registrarSW();
}

/* El service worker guarda una copia de la app para que abra sin señal. Va al final del
   arranque y en su propio try: si el navegador no lo soporta —o el sitio se abrió como
   file:// para probarlo— no puede estorbar a nada de lo de arriba. */
function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (_) {}
}

/* ----- Arrancar, y arrancar de todas formas -----
   Un <script type="module"> es diferido, así que normalmente esto corre con el documento ya
   parseado y `arrancar()` se llama de inmediato. Pero el arranque llegó a no ocurrir NUNCA
   por una razón que no se ve: una hoja de estilos pendiente bloquea la ejecución de los
   scripts, y con la petición de las fuentes de Google colgada el módulo no se evaluaba y la
   plataforma se quedaba en blanco, sin un solo error en la consola.

   Eso ya se arregló donde tocaba —en plataforma.html las fuentes se cargan sin bloquear—,
   pero la lección se queda escrita en código: arrancar no depende de UNA señal. Se intenta
   en la que llegue primero y `_arranco` garantiza que solo pase una vez. */
let _arranco = false;
function arrancarUnaVez() {
  if (_arranco) return;
  _arranco = true;
  arrancar();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arrancarUnaVez, { once: true });
  /* Y si por lo que sea DOMContentLoaded ya pasó de largo, `load` lo recoge. */
  window.addEventListener('load', arrancarUnaVez, { once: true });
} else {
  arrancarUnaVez();
}
