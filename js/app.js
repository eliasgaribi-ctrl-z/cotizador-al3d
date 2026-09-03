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
import * as Sync from './datos/sync.js';
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
/* El TABLERO va PRIMERO porque es la pantalla que abre: `rutaDelHash()` cae en la primera
   ruta del rol cuando el hash no dice nada, así que el orden de esta lista ES el default, y
   `cambiarRol()` reenvía al mismo sitio.

   La ruta se sigue llamando «hoy» aunque la pestaña diga «Tablero» y el archivo tablero.js.
   No es descuido: `./#/hoy` es la única dirección de la plataforma grabada en cosas que no
   controlamos —el start_url y el atajo del manifiesto YA INSTALADO, el icono de la pantalla
   de inicio del iPhone (que guarda la URL con la que se agregó, no la que diga el manifiesto
   de hoy; ver plataforma.html), cotizador.html y anidador-vectores/index.html—. Renombrarla
   no daría error: abriría otra pantalla, en silencio, y la barra de direcciones seguiría
   diciendo lo que ya no es. Es la misma decisión que ya se tomó con «agenda»/«Calendario».

   La lista de avisos —lo que antes era «Hoy»— sigue existiendo entera como ruta `atender`,
   con el mismo módulo inicio.js. Es un nombre de ruta NUEVO, así que ninguna URL publicada
   depende de él, y va oculta: se entra por la puerta que el Tablero pone al pie.

   `padre` es para las ocultas: `pintarNav()` prende la pestaña de la madre, así que estar en
   «Qué atender» deja «Tablero» encendido en vez de dejar la tira entera apagada.

   `roles` no es seguridad —en fase 1 no hay servidor y cualquiera cambia su rol— es modo de
   trabajo: que fabricación no tenga enfrente la pantalla de cobranza y que pagos no mueva el
   almacén sin querer. El mapa sigue sin aparecerle a pagos. */
const RUTAS = [
  { ruta: 'hoy',       mod: 'tablero',     seccion: 'mod-tablero',     icono: 'i-taller',    nombre: 'Tablero',     roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'agenda',    mod: 'fabricacion', seccion: 'mod-fabricacion', icono: 'i-agenda',    nombre: 'Calendario',  roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'proyectos', mod: 'proyectos',   seccion: 'mod-proyectos',   icono: 'i-proyectos', nombre: 'Proyectos',   roles: ['direccion', 'fabricacion', 'pagos'] },
  { ruta: 'material',  mod: 'material',    seccion: 'mod-material',    icono: 'i-material',  nombre: 'Material',    roles: ['direccion', 'fabricacion'] },
  { ruta: 'mapa',      mod: 'mapa',        seccion: 'mod-mapa',        icono: 'i-mapa',      nombre: 'Mapa',        roles: ['direccion', 'fabricacion'] },
  { ruta: 'atender',   mod: 'inicio',      seccion: 'mod-atender',     icono: 'i-aviso',     nombre: 'Qué atender', roles: ['direccion', 'fabricacion', 'pagos'], oculto: true, padre: 'hoy' },
  { ruta: 'ajustes',   mod: 'ajustes',     seccion: 'mod-ajustes',     icono: 'i-ajustes',   nombre: 'Ajustes',     roles: ['direccion', 'fabricacion', 'pagos'], oculto: true },
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
  /* Navegar DEJÁNDOLE algo al de allá. `recibir()` devuelve el dato una sola vez y solo si
     el pase era para la ruta que está montando: un pase que quedó suelto porque alguien se
     fue a otro lado no puede aparecer tres pantallas después. */
  pasar: (ruta, dato) => { _pase = { ruta, dato }; ir(ruta); },
  recibir: () => { const p = (_pase && _pase.ruta === _actual) ? _pase.dato : null; _pase = null; return p; },
  sinRemonte: v => { _sinRemonte = !!v; },
};

let _actual = null;      // nombre de ruta
let _vivo = null;        // el módulo montado, para desmontarlo

/* ----- El buzón de un solo uso -----
   Lo que un módulo le deja al siguiente: «abre la ficha de ESTE proyecto», «abre la hoja de
   agendar con ESTE ya elegido». Va en memoria y NO por el hash, y eso es una decisión con
   evidencia: `rutaDelHash()` corta en '?' y `rutaPorNombre()` exige igualdad exacta de un
   solo segmento, así que `#/proyectos?id=x` no casa con nada, cae al default Y ADEMÁS deja
   la barra de direcciones mintiendo, porque `montarDeVerdad` nunca reescribe location.hash.
   Es el mismo idioma que `al3d_anidar`, que ya funciona entre el cotizador y el anidador:
   se escribe, se lee UNA vez y se borra.

   Es lo que quita los saltos: sin esto, «Abrir» te deja en una lista donde hay que volver a
   buscar lo que ya estabas mirando. */
let _pase = null;

/* ----- La guarda del remonte -----
   Un módulo que sostiene un <iframe> vivo pide que no se le remonte por debajo. El oyente de
   'storage' remonta el módulo actual cuando el cotizador guarda, y eso es correcto para los
   módulos que pintan DOM… y catastrófico para uno que pinta un marco: `montarDeVerdad` hace
   `cont.innerHTML = ''`, el iframe muere y vuelve a cargar 933 KB justo después de que
   alguien apretó Guardar. Y con el cotizador empotrado el evento SÍ llega, porque 'storage'
   dispara en todos los documentos del mismo origen menos el que escribió.

   Se apaga en cada montaje, así que no puede quedarse pegada. */
let _sinRemonte = false;

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

/* ----- Los montajes van en fila -----
   `montar` es async y ninguno de sus llamadores la esperaba: ni el clic de la barra, ni el
   `hashchange`, ni el botón de ajustes. Dos toques seguidos —que en una barra que se
   desliza es lo normal— se solapaban, porque la única guarda que hay arriba deduplica la
   MISMA ruta y no dos rutas distintas.

   Lo que se rompe no son oyentes duplicados: los cuatro manejadores de cada módulo son
   funciones de nivel de módulo, así que `addEventListener` con la misma referencia es un
   no-op y no se acumulan. Lo que se rompe es `_vivo`. El prefijo síncrono de `montar` lo
   pone en null antes del primer `await`, así que el segundo toque entra y NO desmonta a
   nadie; después gana la asignación del montaje que acabe último. El resultado reproducible
   es `_vivo` apuntando a un módulo que no está en pantalla, y el otro montado para siempre
   sin nadie que lo desmonte.

   Y eso tiene una cara concreta: `agenda.desmontar()` es lo único que limpia `#pf-mbar`, y
   su propio comentario dice para qué —«el botón de agendar se quedaría flotando encima de
   su pantalla y el primer dedo del día lo apretaría creyendo que es de lo que está
   viendo»—. Con Material de huérfano el botón que se queda pegado es «Recibí lo de la
   lista», que escribe en el libro del almacén. Con Mapa, no corre `destruirMapa()` y queda
   un Leaflet vivo con sus oyentes.

   La fila lo cierra: mientras uno monta, el siguiente espera. Y si mientras esperaba turno
   se pidió otra pantalla, el suyo ya no sirve y se descarta —salvo un refresco forzado, que
   siempre pasa. */
let _cola = Promise.resolve();
let _pedida = null;

function montar(ruta, opts = {}) {
  _pedida = ruta;
  _cola = _cola
    .then(() => (_pedida !== ruta && !opts.forzar) ? undefined : montarDeVerdad(ruta, opts))
    .catch(e => { console.error('montar falló', e); });
  return _cola;
}

/* Dónde se había quedado cada pestaña. El router desmonta y vuelve a montar entera la que se
   abandona, así que nada del DOM sobrevive —ni el scroll—: volver a Proyectos desde Agenda
   aterrizaba arriba del todo aunque se estuviera mirando el proyecto número doce. Se guarda al
   salir y se repone SOLO al volver por el botón de atrás o por la barra, no al entrar por un
   enlace, que es una llegada nueva y empieza donde empiezan las llegadas nuevas. */
const _scrollPorRuta = new Map();

async function montarDeVerdad(ruta, opts = {}) {
  const r = rutaPorNombre(ruta);
  if (!r) return;
  if (_actual === ruta && !opts.forzar) return;
  if (_actual) _scrollPorRuta.set(_actual, window.scrollY);
  /* En el prefijo síncrono, antes del primer await: la guarda es de quien está montado, y
     el que se va ya no manda. Si se apagara en `desmontar()` y un módulo reventara a mitad,
     se quedaría pegada para siempre. */
  _sinRemonte = false;

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
    /* ANTES de montar, no después. Si `mod.montar` revienta a mitad, el módulo ya dejó
       oyentes puestos y su barra escrita; con la asignación después, `_vivo` se quedaba en
       null y ese módulo no se desmontaba nunca. Los seis toleran que les llamen a
       `desmontar()` sin haber terminado de montar: los tres que guardan oyentes iteran una
       lista que puede estar vacía y los demás hacen `$(id)` con guarda. */
    _vivo = mod;
    await mod.montar(cont, ctx);
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
  window.scrollTo({ top: _scrollPorRuta.get(ruta) || 0, behavior: 'auto' });
  /* La miga del encabezado. Es lo único que dice dónde estás cuando la pestaña de la barra
     no puede decirlo —las rutas ocultas— y de paso deja de mentir: decía «Obra, material y
     agenda» en las seis pantallas. */
  const sub = $('pf-sub');
  if (sub) sub.textContent = r.nombre;
  voz(r.nombre);
  pintarCuentasNav();
  ajustarAltoBarra();
}

/* ============================================================================
   La barra de módulos y el segmento de rol
   ============================================================================ */

function pintarNav() {
  const nav = $('pf-nav'); if (!nav) return;
  /* Una ruta oculta prende la pestaña de su madre. Sin esto, estar en «Qué atender» dejaba
     la tira ENTERA apagada: la pantalla no dice dónde estás y la única salida visible es
     adivinar. Es el defecto que Ajustes ya tenía y que aquí se arregla para las dos. */
  const madre = (rutaPorNombre(_actual) || {}).padre || null;
  const activa = r => r.ruta === _actual || r.ruta === madre;
  nav.innerHTML = rutasDeRol().filter(r => !r.oculto).map((r, i) =>
    '<button type="button" class="pf-tab' + (activa(r) ? ' on' : '') + '"' +
    ' data-ruta="' + r.ruta + '" aria-current="' + (activa(r) ? 'page' : 'false') + '"' +
    /* El atajo va en el title, que es lo que lee el ratón en la computadora. En el teléfono
       no hay teclado y el title no molesta. */
    ' title="' + esc(r.nombre) + ' · tecla ' + (i + 1) + '">' +
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

/* `texto` es TEXTO y se escapa; `html` es marcado y no. Antes había un solo campo,
   `texto`, y se metía crudo en el innerHTML. Hoy no se puede explotar —los cuatro que
   llaman a esto pasan literales de este archivo—, pero `ctx.banda` está en el contexto que
   reciben los seis módulos, y el día que uno pase el nombre de un proyecto o el motivo que
   escribió alguien, la banda lo interpreta como marcado. El camino por defecto tiene que
   ser el seguro; el crudo, el que hay que pedir a propósito.

   @param {{tono?:'av'|'mal', texto?:string, html?:string, accion?:{label:string,fn:Function}}|null} msg */
export function pintarBanda(msg) {
  const b = $('pf-banda'); if (!b) return;
  const cuerpo = msg ? (msg.html != null ? msg.html : (msg.texto != null ? esc(msg.texto) : '')) : '';
  if (!cuerpo) { b.hidden = true; b.innerHTML = ''; return; }
  b.className = 'pf-banda' + (msg.tono === 'mal' ? ' mal' : '');
  b.innerHTML = ico('i-aviso') + '<span>' + cuerpo + '</span>' +
    (msg.accion ? '<button type="button" id="pf-banda-acc">' + esc(msg.accion.label) + '</button>' : '');
  b.hidden = false;
  if (msg.accion) { const x = $('pf-banda-acc'); if (x) x.onclick = msg.accion.fn; }
}

/** Lo que la plataforma tiene que decir de este dispositivo antes de que se le pregunte. */
function revisarDispositivo() {
  const e = DB.estado();
  if (!e.ok) {
    pintarBanda({ tono: 'mal', html: '<b>' + esc(DB.motivoTexto()) + '</b>',
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
    pintarBanda({ html: 'Van <b>' + d + ' días</b> sin respaldo de la plataforma.',
      accion: { label: 'Respaldar', fn: respaldar } });
  } else {
    pintarBanda(null);
  }
}

/* El respaldo baja COMPLETO: la plataforma y el cotizador en un solo archivo. Antes eran dos
   archivos que no se cruzaban, y mover la app a otro aparato —que es la única forma de usarla
   en el teléfono y en la computadora mientras no haya servidor— era bajar dos cosas de dos
   pantallas y restaurarlas en otras dos. Ahora es un archivo: cada lado toma su mitad al
   restaurar, y un respaldo viejo de la plataforma sola sigue entrando igual. */
export async function respaldar() {
  const plataforma = JSON.parse(await DB.exportar());
  const cotizador = Cot.armarRespaldoCotizador();
  const txt = JSON.stringify({ app: 'al3d-completo', formato: 1, fecha: new Date().toISOString(),
    plataforma, cotizador });
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const sello = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' +
                p(d.getHours()) + p(d.getMinutes());
  const { descargarArchivo } = await import('./nucleo/ui.js');
  if (descargarArchivo(txt, 'al3d-respaldo-completo-' + sello + '.json', 'application/json')) {
    Prefs.marcarExport();
    const n = (() => { try { return JSON.parse(cotizador.datos.al3d_historial || '[]').length; } catch (_) { return 0; } })();
    toast('Respaldo completo descargado: plataforma y cotizador (' + n + (n === 1 ? ' cotización' : ' cotizaciones') + ')', 'ok', 4600);
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

  /* ----- El teclado, para la computadora -----
     Los números cambian de módulo en el orden de la barra —el mismo que enseña el title de
     cada pestaña—. Solo cuando no se está escribiendo en un campo y no hay un panel abierto:
     un «3» dentro del campo de búsqueda es un tres, no Proyectos. Esc ya lo atiende ui.js. Las
     flechas del calendario viven en su módulo, que es el único que sabe qué es «siguiente». */
  window.addEventListener('keydown', ev => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const t = ev.target;
    if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (document.querySelector('.modal-bg.show')) return;
    if (!/^[1-9]$/.test(ev.key)) return;
    const visibles = rutasDeRol().filter(r => !r.oculto);
    const r = visibles[Number(ev.key) - 1];
    if (!r) return;
    ev.preventDefault();
    ir(r.ruta);
  });

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
      if (r.creados) {
        toast('Llegó ' + (r.creados === 1 ? 'un proyecto ganado' : r.creados + ' proyectos ganados') + ' del cotizador', 'ok', 4200);
        /* Drenar el buzón SIEMPRE corre y el aviso siempre sale: lo único que se salta es el
           repintado, porque debajo puede haber un marco vivo. Al salir de esa pantalla el
           módulo monta fresco y el proyecto nuevo ya está ahí. */
        if (!_sinRemonte) montar(_actual, { forzar: true });
      }
      return;
    }
    if (['al3d_historial', 'al3d_queue'].includes(ev.key) && !_sinRemonte) montar(_actual, { forzar: true });
  });

  /* El puente va al final del arranque, después de pintar. Enchufarlo es leer una clave y
     construir un objeto —no toca la red— pero el módulo que lo construye se carga aparte, y
     esperar una descarga antes de la primera pantalla sería pagar en la calle, sin señal,
     por algo que ni siquiera hace falta para trabajar. */
  await enchufarPuente();
  sincronizarCallado();

  /* Al recuperar señal se manda lo que quedó, sin que nadie apriete nada. Es la mitad que
     le faltaba a la bandeja: guardar sin señal ya funcionaba desde fase 1, y lo que no
     existía era el momento en que eso sale solo. */
  window.addEventListener('online', () => sincronizarCallado());

  /* El resize dispara decenas de veces mientras se gira el teléfono o se abre el teclado, y
     `ajustarAltoBarra` lee geometría: leer y escribir el layout en cada evento es el camino
     corto al tirón. Un cuadro de por medio basta y se nota. */
  let _rz = 0;
  window.addEventListener('resize', () => {
    if (_rz) return;
    _rz = requestAnimationFrame(() => { _rz = 0; ajustarAltoBarra(); });
  });
  registrarSW();
}

/* ============================================================================
   El puente — fase 3
   ============================================================================ */

/** Enchufa el relevo de Notion si este dispositivo ya tiene URL y token en Ajustes. */
export async function enchufarPuente() {
  if (!Prefs.hayPuente()) { Sync.registrar(null); return false; }
  try {
    const Puente = await import('./datos/puente.js');
    Sync.registrar(Puente.desdePrefs());
    return Sync.configurado();
  } catch (e) {
    /* Un relevo que no se pudo cargar no puede llevarse por delante la plataforma: sin él
       todo sigue funcionando en este dispositivo, que es exactamente el estado de fase 1. */
    console.warn('no se pudo enchufar el puente', e);
    return false;
  }
}
ctx.enchufarPuente = enchufarPuente;

/**
 * Manda lo que quedó y trae lo que cambió, sin decir nada.
 *
 * Callado a propósito: esto corre al arrancar y cada vez que vuelve la señal, y un aviso
 * en cada una sería un aviso que se aprende a ignorar. Lo que sí se hace es repintar, y
 * SOLO si algo cambió: repintar por costumbre tira el scroll y el filtro que la persona
 * acababa de poner.
 */
async function sincronizarCallado() {
  if (!Sync.configurado()) return;
  let movio = 0;
  try { const r = await Sync.bombear(); if (r.ok) movio += Number(r.valor.subidas) || 0; } catch (_) {}
  try {
    const r = await Sync.jalar();
    if (r.ok) movio += (Number(r.valor.nuevos) || 0) + (Number(r.valor.actualizados) || 0);
  } catch (_) {}
  if (movio && _actual) montar(_actual, { forzar: true });
}
ctx.sincronizar = sincronizarCallado;

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
