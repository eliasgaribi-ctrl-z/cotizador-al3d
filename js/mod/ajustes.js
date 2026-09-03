/* ============================================================================
   Ajustes — donde se dice la verdad del sistema.

   No está en la barra: se llega por el engrane de arriba. Es la única pantalla que no
   sirve para trabajar, y por eso es la única que puede permitirse párrafos. Aquí vive lo
   que no cabe en ninguna otra:

     · quién es este dispositivo, y que el rol no es una cerradura;
     · el respaldo, que es la única defensa real contra que Safari desaloje el sitio;
     · las dos llaves de las fases que todavía no existen, con los pasos completos para
       sacarlas, para que nadie tenga que buscar un tutorial de OAuth de Google —los
       tutoriales de OAuth envejecen en meses y mandan a pantallas que ya no existen—;
     · las cuatro cosas que la plataforma NO hace, dichas antes de que alguien las
       descubra el día que le importan;
     · y el cordón: borrar todo, con respaldo obligatorio antes.

   Tres decisiones que se ven en todo el archivo:

   1. Aquí no se calcula nada ni se guarda nada a mano. Las nueve claves pasan por
      `Prefs`, los diez almacenes por `DB`, y el respaldo por `ctx.respaldar()`, que es el
      mismo que aprieta la banda de arriba. Dos caminos para bajar un respaldo son dos
      caminos que se desincronizan.
   2. Nada de tonos. Esta pantalla dice «esto no funciona todavía y esto es lo que le
      falta», no «próximamente». Fase 1 sin puente y sin Calendar no es una app a medias:
      es la app, y lo que sí funciona hoy —el .ics, el mapa, el almacén— se dice que
      funciona hoy.
   3. El cordón de borrar no se ejecuta si la descarga del respaldo falló. Es exactamente
      la lección que el cotizador ya aprendió a golpes: prometer un respaldo, no darlo, y
      borrar igual. Por eso este módulo baja el archivo él mismo en vez de llamar a
      `ctx.respaldar()`: necesita el booleano de si la descarga salió, y `ctx.respaldar()`
      no lo devuelve.
   ============================================================================ */

import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Sync from '../datos/sync.js';
import * as Geo from '../datos/geo.js';
import * as Gcal from '../nucleo/gcal.js';
import * as Puente from '../datos/puente.js';
import {
  $, esc, ico, toast, avisarResultado, abrirCapa, cerrarCapa,
  descargarArchivo, fmtFechaDia, cuando, ajustarAltoBarra, copiarTexto, voz,
} from '../nucleo/ui.js';

/* ============================================================================
   Estado del módulo. Todo aquí, y todo se suelta en desmontar().
   ============================================================================ */

let cont = null;
let CTX = null;

let ESPACIO = null;      // DB.espacio() o null si el navegador no lo dice
let PEND = 0;            // operaciones en la bandeja de salida
let APARTADAS = 0;       // las que este puente no sabe llevar. Ni se mandan ni se pierden

/* Lo que el puente contestó la última vez que se apretó un botón. Vive en memoria y muere
   al salir de la pantalla, a propósito: es el estado de una prueba, no una preferencia, y
   guardarlo haría que mañana la pantalla dijera «en verde» sin haber preguntado. */
let SALUD = null;        // {ok, mensaje, rol, escribibles}
let ESQ = null;          // {ok, faltan, nota}
let TOKS = null;         // los tres tokens recién generados, hasta salir de la pantalla

/* El rol elegido en la presentación, todavía sin guardar. Existe porque aplicar el rol al
   instante ahí remontaría la pantalla y se llevaría el nombre a medio escribir. */
let ROL_GATE = null;

const _oyentes = [];     // [[elemento, tipo, fn]]
let _t = 0;              // el temporizador de la recarga posterior al borrado

function on(el, tipo, fn) {
  if (!el) return;
  el.addEventListener(tipo, fn);
  _oyentes.push([el, tipo, fn]);
}

const REPO = 'https://github.com/eliasgaribi-ctrl-z/cotizador-al3d/blob/main/docs/ARQUITECTURA.md';

/* ============================================================================
   Montar
   ============================================================================ */

export async function montar(c, ctx) {
  cont = c;
  CTX = ctx || {};

  /* La presentación es lo primero y lo único. Sin nombre, los movimientos del almacén se
     sellan con un rol pelón y «Fabricación contó 3 láminas» no dice quién, que es la mitad
     del sello. Se pregunta una vez en la vida del dispositivo. */
  if (Prefs.sinPresentar()) {
    ROL_GATE = Prefs.rol();
    pintarGate();
    on(cont, 'click', clicGate);
    on($('pf-mbar'), 'click', clicGate);
    return;
  }

  /* Las dos lecturas que tocan la base van antes de pintar y en paralelo: son las únicas
     asíncronas de la pantalla y esperarlas en serie se nota en un celular viejo. Ninguna
     lanza: `espacio()` devuelve null y `pendientes()` devuelve [] si la base no abrió. */
  const [esp, cola, sinDest] = await Promise.all([
    DB.espacio(), Sync.pendientes(), Sync.sinDestino()]);
  ESPACIO = esp;
  PEND = cola.length;
  APARTADAS = sinDest.length;

  pintar();
  on(cont, 'click', clic);
  on(cont, 'change', cambio);
  on($('pf-mbar'), 'click', clic);
  on($('pf-pide'), 'click', clicPide);
}

export function desmontar() {
  for (const [el, tipo, fn] of _oyentes) {
    try { el.removeEventListener(tipo, fn); } catch (_) {}
  }
  _oyentes.length = 0;

  clearTimeout(_t); _t = 0;

  /* La barra fija es del documento, no de este módulo. Salir de Ajustes con «Respaldar»
     puesto lo deja abajo en la Agenda, y el primer dedo del día lo aprieta creyendo que es
     de la pantalla que está viendo. */
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }

  /* La capa también es del documento: salir con el cordón abierto dejaba el velo rojo
     encima de Proyectos. */
  const capa = $('pf-pide');
  if (capa) {
    if (capa.classList.contains('show')) cerrarCapa('pf-pide');
    capa.innerHTML = '';
  }

  ESPACIO = null; PEND = 0; APARTADAS = 0; ROL_GATE = null;
  SALUD = null; ESQ = null; TOKS = null;
  cont = null; CTX = null;
}

/* ============================================================================
   Herramientas de texto

   Lo que vive aquí es lo que es TEXTO: cómo se lee un sello de tiempo y cómo se leen unos
   bytes. Ni un número de negocio se calcula en este archivo.
   ============================================================================ */

/**
 * Día local de un sello ISO completo. Recortar los diez primeros caracteres de un
 * `toISOString()` da el día en UTC: a las siete de la noche en Guadalajara eso ya es
 * mañana, y el respaldo de hoy se leería con fecha de mañana. Aquí se convierte el
 * instante a día local y de ahí en adelante manda `ui.js`.
 */
function diaLocalDe(sello) {
  const t = Date.parse(String(sello || ''));
  if (!t) return '';
  const d = new Date(t), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* Megabytes con un decimal. El espacio es una cifra de orientación, no una medición: dos
   decimales invitan a comparar dos lecturas seguidas y a sacar conclusiones de la
   diferencia, que es ruido del navegador. */
const mb = n => (Number(n || 0) / 1048576).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' MB';

const tarjeta = (icono, titulo, cuerpo) =>
  '<div class="card"><div class="card-h"><h2>' + ico(icono) + esc(titulo) + '</h2></div>' +
  '<div class="card-b">' + cuerpo + '</div></div>';

const nota = (txt, tono) =>
  '<p class="hintnote aj-nota' + (tono ? ' nota-' + tono : '') + '">' + txt + '</p>';

/* El segmento de opciones, con la posibilidad de que una esté apagada. `segmento()` de
   ui.js no sabe apagar botones y no debe: el único caso del sistema es Google Maps sin
   llave, y un botón que se puede elegir para no hacer nada es peor que un botón apagado. */
function seg(opciones, actual, atributo, lab) {
  return '<div class="tipo-seg" role="group"' + (lab ? ' aria-labelledby="' + lab + '"' : '') +
    '>' + opciones.map(o =>
    '<button type="button" class="' + (o.v === actual ? 'on' : '') + '"' +
    (o.off ? ' disabled aria-disabled="true"' : '') +
    ' aria-pressed="' + (o.v === actual ? 'true' : 'false') + '"' +
    ' ' + atributo + '="' + esc(o.v) + '">' + esc(o.t) + '</button>').join('') + '</div>';
}

/* ============================================================================
   La presentación — lo primero y lo único, una vez en la vida del dispositivo
   ============================================================================ */

function pintarGate() {
  cont.innerHTML = tarjeta('i-ajustes', '¿Quién usa este teléfono?',
    '<p class="aj-p">Dos datos y ya. El nombre es para que cada movimiento del almacén diga ' +
    'quién lo hizo, y el rol decide qué pantallas ves.</p>' +

    '<div class="fld aj-bloque"><label for="aj-nombre">Tu nombre</label>' +
    '<input type="text" id="aj-nombre" maxlength="40" autocomplete="name" ' +
    'placeholder="Como te dicen: Beto, Moni, Tatis…"></div>' +

    '<div class="fld"><div class="fld-lab" id="aj-rol-lab">Con qué rol trabajas</div>' +
    '<div id="aj-rol-gate" role="group" aria-labelledby="aj-rol-lab">' + rolesGate() + '</div></div>' +

    nota(esc(Prefs.ROL_NO_ES_SEGURIDAD)) +

    '<div class="pf-acciones">' +
    '<button type="button" class="btn btn-pri" data-act="gate">Empezar</button></div>');

  const b = $('pf-mbar');
  if (b) {
    b.innerHTML = '<button type="button" class="btn btn-pri" data-act="gate">Empezar</button>';
    b.hidden = false;
    ajustarAltoBarra();
  }
  /* No se enfoca el campo solo: en el teléfono el teclado sube tapando justo los tres
     roles con su descripción, que es la mitad de lo que hay que leer antes de decidir. */
}

/* Las tres descripciones completas, no un segmento de tres palabras: elegir un rol sin
   saber qué te va a esconder es elegir a ciegas, y el que se equivoca aquí cree que la
   plataforma no tiene la pantalla de cobranza. */
function rolesGate() {
  return Prefs.ROLES.map(r =>
    '<button type="button" class="aj-rol' + (r === ROL_GATE ? ' on' : '') +
    '" data-rol-gate="' + r + '" aria-pressed="' + (r === ROL_GATE ? 'true' : 'false') + '">' +
    ico(r === ROL_GATE ? 'i-check' : 'i-ojo') +
    '<span><b>' + esc(Prefs.ROL_NOMBRE[r]) + '</b>' + esc(Prefs.ROL_DESC[r]) + '</span>' +
    '</button>').join('');
}

function clicGate(ev) {
  const t = ev.target;

  const r = t.closest('[data-rol-gate]');
  if (r) {
    /* Se guarda en una variable y no en la preferencia: aplicar el rol al instante
       remonta la pantalla —app.js saca los módulos que el rol nuevo no tiene— y el nombre
       a medio escribir se iba en blanco sin que nadie entendiera por qué. */
    ROL_GATE = r.dataset.rolGate;
    const caja = $('aj-rol-gate');
    if (caja) caja.innerHTML = rolesGate();
    return;
  }

  if (!t.closest('[data-act="gate"]')) return;

  const n = ($('aj-nombre') && $('aj-nombre').value || '').trim();
  if (!n) {
    toast('Falta tu nombre: es lo que va a decir cada movimiento del almacén', 'err', 4200);
    const c = $('aj-nombre'); if (c) { try { c.focus(); } catch (_) {} }
    return;
  }
  if (!Prefs.setNombre(n)) {
    toast('Este navegador no dejó guardar el nombre. ¿Estás en una ventana privada?', 'err', 4600);
    return;
  }
  toast('Listo, ' + n + '. Bienvenido.', 'ok', 3400);
  aplicarRol(ROL_GATE);
}

/* ============================================================================
   La pantalla
   ============================================================================ */

function pintar() {
  const e = DB.estado();

  cont.innerHTML =
    /* La base cerrada se dice aquí arriba y no se esconde: Ajustes es justo la pantalla a
       la que se llega cuando algo no funciona, así que se pinta completa —el rol, el mapa
       y las llaves son localStorage y siguen sirviendo— y lo único que se apaga es lo que
       de verdad no puede correr. */
    (e.ok ? '' : '<div class="card"><div class="card-b">' +
      nota(ico('i-aviso') + ' ' + esc(DB.motivoTexto()), 'av') +
      '<p class="vacio-d">Mientras la base no abra, el respaldo y el restaurar están ' +
      'apagados: un respaldo hecho ahora saldría vacío y se llevaría por delante la fecha ' +
      'del último de verdad.</p>' +
      '<button type="button" class="btn btn-pri" data-act="recargar">Recargar</button>' +
      '</div></div>') +

    cardQuienEres() +
    cardRespaldo(e.ok) +
    cardMapa() +
    cardGcal() +
    cardPuente() +
    cardVerdades() +
    cardDocumento() +
    cardCordon(e.ok);

  const b = $('pf-mbar');
  if (b) {
    /* La acción principal de esta pantalla en el teléfono es una y no hay discusión: el
       respaldo. Es lo único de aquí que, si no se hace, se pierde algo. */
    b.innerHTML = '<button type="button" class="btn btn-pri" data-act="respaldar"' +
      (e.ok ? '' : ' disabled') + '>' + ico('i-bajar') + ' Respaldar la plataforma</button>';
    b.hidden = false;
    ajustarAltoBarra();
  }
}

/* ----- 1. Quién eres ----- */

function cardQuienEres() {
  const r = Prefs.rol();
  return tarjeta('i-ajustes', 'Quién eres',
    '<div class="fld"><label for="aj-nombre">Tu nombre</label>' +
    '<input type="text" id="aj-nombre" maxlength="40" autocomplete="name" value="' +
    esc(Prefs.nombre()) + '"></div>' +
    '<button type="button" class="btn btn-gho pf-btn-corto" data-act="nombre">' +
    ico('i-guardar') + ' Guardar el nombre</button>' +

    '<div class="fld aj-bloque">' +
    '<div class="fld-lab" id="aj-rol-lab">Con qué rol trabajas</div>' +
    seg(Prefs.ROLES.map(x => ({ v: x, t: Prefs.ROL_NOMBRE[x] })), r, 'data-rol', 'aj-rol-lab') +
    '</div>' +
    '<p class="pf-nota">' + esc(Prefs.ROL_DESC[r]) + '</p>' +

    nota(esc(Prefs.ROL_NO_ES_SEGURIDAD)) +

    '<dl class="pf-dato aj-bloque"><dt>Así se firman tus movimientos</dt>' +
    '<dd>' + esc(Prefs.sello()) + '</dd></dl>' +
    '<dl class="pf-dato"><dt>Id de este dispositivo</dt><dd><span class="folio">' +
    esc(Prefs.dispositivo()) + '</span></dd></dl>' +
    '<p class="pf-nota">Los cuatro caracteres se generan una vez en la vida del teléfono y ' +
    'sirven para desempatar folios: el contador del cotizador es local, así que dos ' +
    'teléfonos pueden emitir COT-0042 el mismo día.</p>');
}

/* ----- 2. Respaldo ----- */

function cardRespaldo(baseOk) {
  const dias = Prefs.diasSinRespaldo();
  const dia = diaLocalDe(Prefs.ultExport());

  let ultimo;
  if (!dia) {
    ultimo = nota(ico('i-aviso') + ' <b>Nunca has respaldado la plataforma en este ' +
      'dispositivo.</b> Si el navegador limpia el sitio, se va el almacén, la agenda y los ' +
      'proyectos ganados.', 'av');
  } else {
    const viejo = dias !== null && dias >= 9;
    ultimo = '<dl class="pf-dato"><dt>Último respaldo</dt><dd>' + esc(fmtFechaDia(dia)) +
      ' · ' + esc(cuando(dia)) + '</dd></dl>' +
      (viejo ? nota('Van <b>' + dias + ' días</b> sin respaldo. Nueve son el aviso; a las ' +
        'semanas es cuando Safari empieza a desalojar sitios que nadie abre.', 'av') : '');
  }

  const esp = ESPACIO
    ? '<dl class="pf-dato"><dt>Espacio</dt><dd>' + esc(mb(ESPACIO.usado)) + ' usados de ' +
      esc(mb(ESPACIO.cuota)) + ' (' + ESPACIO.pct + '%)</dd></dl>' +
      '<p class="pf-nota">Es lo que este navegador le presta a todo el sitio, cotizador ' +
      'incluido. Es una cifra para orientarse, no un límite exacto: el navegador la mueve.</p>'
    : '<p class="pf-nota">Este navegador no dice cuánto espacio queda. No es un problema: ' +
      'se entera cuando ya no cabe algo, y para eso está el respaldo.</p>';

  return tarjeta('i-bajar', 'Respaldo',
    ultimo +

    '<div class="pf-acciones">' +
    '<button type="button" class="btn btn-pri" data-act="respaldar"' + (baseOk ? '' : ' disabled') + '>' +
    ico('i-bajar') + ' Respaldar todo: plataforma y cotizador</button>' +
    '</div>' +

    '<div class="fld aj-bloque">' +
    '<label for="aj-archivo">Restaurar desde un respaldo</label>' +
    '<input type="file" id="aj-archivo" accept="application/json,.json"' +
    (baseOk ? '' : ' disabled') + '></div>' +
    '<p class="pf-nota">Restaurar <b>fusiona</b>, no reemplaza: lo que ya está se queda y lo ' +
    'que falta entra. Un renglón del libro del almacén que ya existe se descarta en vez de ' +
    'sumarse dos veces, así que el mismo archivo se puede meter dos veces sin miedo.</p>' +

    nota('<b>Un solo archivo para mover todo a otro aparato.</b> El respaldo trae las dos ' +
      'mitades: la plataforma —proyectos, agenda, material y el libro del almacén— y el ' +
      'cotizador —cotizaciones, historial e imágenes—. Al restaurarlo aquí entra la de la ' +
      'plataforma, y la del cotizador queda esperando: al abrir el cotizador la ofrece con un ' +
      'botón, con su confirmación y su copia previa de siempre. Mándate el archivo por WhatsApp ' +
      'o correo al otro aparato, y ábrelo ahí desde esta misma pantalla. Los respaldos viejos, ' +
      'de la plataforma sola, siguen entrando igual.') +

    esp);
}

/* ----- 3. El mapa ----- */

function cardMapa() {
  const t = Prefs.tiles();
  const opciones = Object.keys(Geo.TILES).map(k => ({
    v: k, t: Geo.TILES[k].nombre, off: !Geo.TILES[k].url,
  }));

  return tarjeta('i-mapa', 'El mapa',
    '<div class="fld"><div class="fld-lab" id="aj-tiles-lab">Proveedor de los cuadros del mapa</div>' +
    seg(opciones, t, 'data-tile', 'aj-tiles-lab') + '</div>' +

    /* Cuál está en uso se dice con la palabra «En uso», no con un tono más oscuro: el
       color solo nunca dice nada en este sistema, y aquí además hay una opción apagada. */
    Object.keys(Geo.TILES).map(k =>
      '<p class="pf-nota">' + (k === t ? '<b>En uso · ' : '<b>') +
      esc(Geo.TILES[k].nombre) + '</b> — ' + esc(Geo.TILES[k].nota) + '</p>').join('') +

    nota('<b>Google Maps está en la estructura y solo le falta la llave.</b> Es una llave de ' +
      'Google Maps Platform con la Map Tiles API prendida, y eso pide tarjeta registrada y ' +
      'restricción por dominio para que nadie más la use desde otro sitio. El día que exista, ' +
      'se pega aquí y el mapa no cambia de código: los tres proveedores tienen la misma ' +
      'interfaz. Mientras, el botón está apagado y el mapa pinta ' +
      esc(Geo.proveedorActivo(t).nombre) + '.') +

    '<p class="pf-nota">Los cuadros del mapa nunca se guardan para verlos sin señal: la ' +
    'licencia de OpenStreetMap lo prohíbe y es la forma más rápida de que nos corten. El ' +
    'mapa necesita señal; los datos no.</p>');
}

/* ----- 4. Fase 2, Google Calendar ----- */

function cardGcal() {
  const ins = Gcal.instrucciones();
  const cfg = Prefs.gcal() || {};
  const esDir = Prefs.rol() === 'direccion';

  /* Los pasos y las notas se piden a `gcal.js` y no se escriben aquí, aunque sean texto de
     pantalla: si el scope o el nombre de un campo de Google Cloud cambia, tienen que
     cambiar en el mismo archivo donde está el código que los usa. Dos copias de un
     tutorial es una copia mintiendo. */
  const pasos = '<ol class="aj-pasos">' + ins.pasos.map(p => '<li>' + esc(p) + '</li>').join('') + '</ol>';
  const notas = ins.notas.map(n => '<p class="pf-nota">' + esc(n) + '</p>').join('');

  const estado = Gcal.conectado()
    ? nota(ico('i-check') + ' Conectado' + (Gcal.correo() ? ' como ' + esc(Gcal.correo()) : '') +
      '. El permiso vive alrededor de una hora y se renueva solo mientras tu sesión de ' +
      'Google esté viva.', 'ok')
    : Gcal.disponible()
      ? nota('Hay Client ID guardado pero todavía no has entrado en esta pestaña. El ' +
        'permiso de Google no se guarda entre recargas, a propósito: no hay refresh token ' +
        'que robar.')
      : nota('Sin Client ID. Los eventos no se crean solos, y el archivo .ics sigue ' +
        'funcionando igual que hoy: las alarmas de instalación no dependen de esto.');

  if (!esDir) {
    return tarjeta('i-agenda', 'Google Calendar · Fase 2',
      estado +
      nota('<b>Esto se pega solo en el teléfono de Dirección.</b> Y no es un permiso: en ' +
        'Google Calendar los recordatorios son <b>por usuario, no por evento</b>, y quien ' +
        'tiene acceso de lectura a un calendario compartido no hereda sus alarmas. Por eso ' +
        'los eventos los crea un solo dispositivo con las tres personas como invitados: la ' +
        'invitación entra a tu calendario y ahí sí suena en tu teléfono.') +
      '<p class="pf-nota">Tú no tienes que configurar nada. Cuando Dirección agende, te ' +
      'llega la invitación al correo y al calendario del teléfono.</p>');
  }

  return tarjeta('i-agenda', ins.titulo + ' · Fase 2',
    estado +

    '<p class="aj-p">Son unos ' + ins.minutos + ' minutos, una vez, con la cuenta de Google ' +
    'de Dirección. Los pasos completos van aquí para que nadie tenga que buscar un tutorial:</p>' +
    pasos +

    nota('<b>Lo que vas a ver y no es un error:</b> la primera vez, Google dice ' +
      '«Google hasn’t verified this app». Se pasa con <b>Avanzado</b> y luego <b>«Ir al ' +
      'sitio»</b>. Sale porque la app está en Testing, que es donde tiene que estar con tres ' +
      'personas, y le sale una vez a cada quien.', 'av') +

    nota('<b>El hallazgo que decidió la arquitectura:</b> en Google Calendar los ' +
      'recordatorios son <b>por usuario y no por evento</b>. Compartir un calendario NO ' +
      'reparte sus alarmas. Por eso los eventos se crean desde <b>este</b> dispositivo con ' +
      'las tres personas como invitados, y por eso solo Dirección los crea: un solo ' +
      'consentimiento que sostener y tres calendarios que suenan.') +

    '<div class="fld aj-bloque">' +
    '<label for="aj-gcal-id">ID de cliente de OAuth</label>' +
    '<input type="text" id="aj-gcal-id" autocomplete="off" spellcheck="false" ' +
    'placeholder="…apps.googleusercontent.com" value="' + esc(cfg.clientId || '') + '"></div>' +

    '<div class="fld"><label for="aj-gcal-inv">Correos que van invitados a cada evento</label>' +
    '<textarea id="aj-gcal-inv" rows="3" autocomplete="off" spellcheck="false" ' +
    'placeholder="direccion@…, fabricacion@…, pagos@…">' +
    esc((Array.isArray(cfg.invitados) ? cfg.invitados : []).join(', ')) + '</textarea></div>' +
    '<p class="pf-nota">Separados por coma. Sin ellos el evento se crea, pero solo te suena ' +
    'a ti, que es justo lo que no queremos. El «Secreto de cliente» no se usa: no lo pegues ' +
    'en ningún lado.</p>' +

    '<div class="pf-acciones">' +
    '<button type="button" class="btn btn-pri" data-act="gcal-guardar">' + ico('i-guardar') +
    ' Guardar</button>' +
    '<button type="button" class="btn btn-gho" data-act="gcal-conectar"' +
    (Gcal.disponible() ? '' : ' disabled') + '>' + ico('i-nube') + ' Conectar con Google</button>' +
    '</div>' +

    notas);
}

/* ----- 5. Fase 3, el puente a Notion ----- */

function cardPuente() {
  const p = Prefs.puente() || {};
  const s = Sync.estado();
  const ins = Puente.instrucciones();

  /* Los pasos y las notas se le piden a `puente.js` y no se escriben aquí, aunque sean
     texto de pantalla: el día que cambie el nombre de una variable del Worker tiene que
     cambiar en el mismo archivo donde está el código que la usa. */
  const pasos = '<ol class="aj-pasos">' + ins.pasos.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>';
  const notas = ins.notas.map(n => '<p class="pf-nota">' + esc(n) + '</p>').join('');

  const cuentaPend = PEND
    ? 'En la bandeja de salida hay ' + PEND + (PEND === 1 ? ' operación' : ' operaciones') + ' esperando.'
    : 'La bandeja de salida está vacía.';
  /* Lo apartado se dice aparte y con su razón. Sumarlo a los pendientes daría un contador
     que nunca baja, y un número que nunca baja se aprende a ignorar. */
  const cuentaApart = APARTADAS
    ? ' Además hay ' + APARTADAS + (APARTADAS === 1 ? ' cambio apartado' : ' cambios apartados') +
      ' que este puente no lleva: el almacén y el catálogo se quedan en este dispositivo ' +
      'hasta que existan sus bases. No se pierden.'
    : '';

  const estado = s.configurado
    ? nota(ico('i-check') + ' Puente enchufado' + (s.adaptador ? ' (' + esc(s.adaptador) + ')' : '') +
      '. ' + cuentaPend + cuentaApart, 'ok')
    : nota('<b>Sin puente.</b> La plataforma funciona completa en este dispositivo, y el ' +
      'camino manual —«Copiar fila para Notion» en el cotizador— sigue siendo el que se usa ' +
      'para pasar una venta. Ese camino no se retira nunca.' +
      (PEND ? ' Hay ' + PEND + (PEND === 1 ? ' operación guardada esperando' : ' operaciones guardadas esperando') +
        ' a que haya a dónde mandarlas.' : ''));

  /* ----- El resultado de la última prueba ----- */
  let prueba = '';
  if (SALUD) {
    prueba = SALUD.ok
      ? nota(ico('i-check') + ' El puente contesta y reconoce este teléfono' +
          (SALUD.rol ? ' como <b>' + esc(Prefs.ROL_NOMBRE[SALUD.rol] || SALUD.rol) + '</b>' : '') + '.' +
          (Array.isArray(SALUD.escribibles) && SALUD.escribibles.length
            ? ' Con ese token puede escribir en Notion: ' +
              SALUD.escribibles.map(x => '<b>' + esc(x.trim()) + '</b>').join(', ') + '.'
            : ''), 'ok')
      : nota(ico('i-aviso') + ' ' + esc(SALUD.mensaje || 'El puente no contestó.'), 'mal');
    /* Que el rol del puente y el de este teléfono no coincidan NO es un error: el rol de
       aquí decide qué pantallas ves y el del token decide qué puedes escribir. Pero si no
       se dice, el día que una escritura rebote nadie va a saber por dónde empezar. */
    if (SALUD.ok && SALUD.rol && SALUD.rol !== Prefs.rol()) {
      prueba += nota('<b>Ojo, y no está roto:</b> en este teléfono elegiste el tablero de ' +
        esc(Prefs.ROL_NOMBRE[Prefs.rol()]) + ', y el token que le pegaste es de ' +
        esc(Prefs.ROL_NOMBRE[SALUD.rol] || SALUD.rol) + '. Vas a ver las pantallas de uno y ' +
        'a poder escribir en Notion lo del otro. El que manda para escribir es el token: esa ' +
        'es la única frontera de permisos de verdad del sistema, y vive en el servidor.', 'av');
    }
  }

  /* ----- Lo que le falta a la base de Notion ----- */
  let esquema = '';
  if (ESQ) {
    if (!ESQ.ok) {
      esquema = nota(ico('i-aviso') + ' ' + esc(ESQ.mensaje || 'No se pudo leer el esquema.'), 'mal');
    } else if (!ESQ.faltan.length) {
      esquema = nota(ico('i-check') + ' La base «Ventas - AL3D» ya tiene las siete ' +
        'propiedades que la plataforma necesita.', 'ok');
    } else {
      esquema = nota('<b>A la base le faltan ' + ESQ.faltan.length +
          (ESQ.faltan.length === 1 ? ' propiedad' : ' propiedades') + ', y hay que crearlas ' +
          'a mano en Notion.</b> El puente las detecta y no las crea: es la única garantía de ' +
          'que no se rompan las siete vistas ni las cinco fórmulas de una base con tres años ' +
          'encima. Mientras falte una, dar de alta una venta va a rebotar.', 'av') +
        '<ul class="aj-faltan">' + ESQ.faltan.map(x =>
          '<li><b>' + esc(x.nombre) + '</b> · tipo <b>' + esc(x.tipo) + '</b>' +
          (x.para ? ' — ' + esc(x.para) : '') +
          (Array.isArray(x.opciones) && x.opciones.length
            ? '<br><span class="pf-nota">Opciones: ' + esc(x.opciones.join(' · ')) + '</span>'
            : '') + '</li>').join('') + '</ul>' +
        '<div class="pf-acciones"><button type="button" class="btn btn-gho" ' +
        'data-act="puente-copiar-faltan">' + ico('i-copiar') + ' Copiar la lista</button></div>';
    }
  }

  /* ----- Los tres tokens recién generados ----- */
  let tokens = '';
  if (TOKS) {
    tokens = nota('<b>Estos tres son las llaves de los tres teléfonos.</b> Pega el JSON de ' +
        'abajo en la variable <b>TOKENS</b> del Worker, como <b>Secret</b>. Después dale a ' +
        '«Usar el de …» al que le toque a ESTE teléfono, y manda los otros dos a sus dueños ' +
        'por donde se mandan las llaves, no por el chat del grupo.', 'av') +
      '<pre class="aj-tokens">' + esc(TOKS.json) + '</pre>' +
      '<div class="pf-acciones">' +
      '<button type="button" class="btn btn-gho" data-act="puente-copiar-tokens">' +
      ico('i-copiar') + ' Copiar el JSON</button>' +
      ['direccion', 'fabricacion', 'pagos'].map(r =>
        '<button type="button" class="btn btn-gho" data-act="puente-usar-token" data-rol-tok="' + r + '">' +
        'Usar el de ' + esc(Prefs.ROL_NOMBRE[r]) + '</button>').join('') +
      '</div>' +
      '<p class="pf-nota">Se ven una sola vez: al salir de esta pantalla se olvidan. No se ' +
      'guardan en ningún lado más que en la variable del Worker y en el teléfono de cada ' +
      'quien, y no entran en el respaldo.</p>';
  }

  return tarjeta('i-nube-off', ins.titulo + ' · Fase 3',
    estado +

    '<p class="aj-p"><b>Por qué hace falta un Worker y no se llama a Notion directo.</b> Uno: la API de Notion no manda cabeceras ' +
    'CORS, así que el navegador no la puede llamar y ningún truco lo cambia. Dos: su token ' +
    'da escritura total sobre el workspace, y esto es un HTML publicado en GitHub Pages, ' +
    'donde cualquiera lee el código. Tres: por eso el token vive en el Worker, como secreto ' +
    'del servidor, y este dispositivo solo guarda una URL y un token propio que el Worker ' +
    'reconoce.</p>' +

    '<p class="aj-p">Son unos ' + ins.minutos + ' minutos, una vez. Los pasos completos van ' +
    'aquí para que nadie tenga que buscarlos en otro lado:</p>' +
    pasos +

    '<div class="pf-acciones">' +
    '<button type="button" class="btn btn-gho" data-act="puente-tokens">' + ico('i-candado') +
    ' Generar los tres tokens</button></div>' +
    tokens +

    '<div class="fld aj-bloque">' +
    '<label for="aj-worker-url">URL del Worker</label>' +
    '<input type="url" id="aj-worker-url" autocomplete="off" spellcheck="false" ' +
    'placeholder="https://puente-al3d.tu-cuenta.workers.dev" value="' + esc(p.url || '') + '"></div>' +

    '<div class="fld"><label for="aj-worker-tok">Token de este dispositivo</label>' +
    /* El token guardado NO se vuelve a pintar. Es la única cosa de esta pantalla que sirve
       para entrar a algo, y Ajustes se enseña a otra persona para que copie los pasos. Se
       escribe solo cuando el campo trae algo nuevo. */
    '<input type="password" id="aj-worker-tok" autocomplete="off" spellcheck="false" ' +
    'placeholder="' + (p.token ? 'Guardado — déjalo vacío para no cambiarlo' : 'Pégalo aquí') +
    '"></div>' +
    '<p class="pf-nota">El token no se vuelve a mostrar y <b>no entra en el respaldo</b>. Un ' +
    'respaldo se manda por WhatsApp o por correo, y una llave que viaja así deja de ser ' +
    'secreta.</p>' +

    '<div class="pf-acciones">' +
    '<button type="button" class="btn btn-pri" data-act="puente-guardar">' + ico('i-guardar') +
    ' Guardar el puente</button>' +
    (p.url && p.token
      ? '<button type="button" class="btn btn-gho" data-act="puente-probar">' + ico('i-nube') +
        ' Probar</button>' +
        '<button type="button" class="btn btn-gho" data-act="puente-esquema">' + ico('i-doc') +
        ' Revisar el esquema</button>'
      : '') +
    (s.configurado
      ? '<button type="button" class="btn btn-gho" data-act="puente-bombear">' + ico('i-subir') +
        ' Mandar lo que está pendiente</button>' +
        '<button type="button" class="btn btn-gho" data-act="puente-jalar">' + ico('i-bajar') +
        ' Traer el dinero de Notion</button>'
      : '') +
    (p.url || p.token
      ? '<button type="button" class="btn btn-dgr" data-act="puente-quitar">Quitar el puente de ' +
        'este dispositivo</button>'
      : '') +
    '</div>' +

    prueba + esquema +

    '<p class="pf-nota">Notion no tiene forma de decir «solo escribe si nadie lo cambió ' +
    'antes»: no hay ETag, ni versión, ni unicidad. Lo que este puente escribe son ' +
    'propiedades que nadie teclea a mano del otro lado —la etapa, la dirección, el punto en ' +
    'el mapa, el tipo de trabajo— y un cambio de Notion es por propiedad, no por fila, así ' +
    'que no puede pisar el dinero que alguien acabe de capturar allá. Para el libro del ' +
    'almacén la garantía sí es total: el id lo pone este dispositivo y un reintento no resta ' +
    'el material dos veces.</p>' +

    notas);
}

/* ----- 6. Lo que esta pantalla tiene que decir ----- */

function cardVerdades() {
  const filas = [
    ['i-reloj', 'Los avisos se calculan al abrir la plataforma',
      'No hay servidor que despierte a nadie: una app estática no puede sonar sola. Si nadie ' +
      'abre la plataforma en cinco días, nadie ve sus avisos, y siguen aquí esperando el día ' +
      'que alguien entre.'],
    ['i-agenda', 'Las alarmas de instalación sí llegan al teléfono',
      'Y llegan porque las dispara el calendario del teléfono, no la app. Por eso el archivo ' +
      '.ics se descarga una vez por instalación: al agregarlo, las alarmas de tres días, un ' +
      'día y media hora antes quedan dentro del calendario y suenan aunque nadie abra nada.'],
    ['i-doc', 'Notion sigue siendo el libro mayor del dinero y de la venta',
      'La plataforma no lo reemplaza y no recalcula sus fórmulas: el precio neto, el pago ' +
      'pendiente y las comisiones se leen de allá y se pintan tal como están. Aquí vive lo que ' +
      'Notion no puede dar —el material derivado, el almacén, la etapa de obra y el mapa—, y ' +
      'nada más.'],
    ['i-nube-off', 'Los datos viven en ESTE dispositivo',
      'No hay copia en la nube en fase 1. Y Safari desaloja el almacenamiento de los sitios ' +
      'que llevan semanas sin abrirse, sin preguntar y sin avisar. El respaldo es la única ' +
      'defensa que existe: bájalo cuando la banda de arriba lo pida.'],
  ];

  return tarjeta('i-aviso', 'Lo que esta pantalla tiene que decir',
    filas.map(([i, t, d]) =>
      '<div class="pf-fila"><span class="pf-fila-ico">' + ico(i) + '</span>' +
      '<span class="pf-fila-tx"><span class="pf-fila-t">' + esc(t) + '</span>' +
      '<span class="pf-fila-d">' + esc(d) + '</span></span></div>').join(''));
}

/* ----- 7. El documento ----- */

function cardDocumento() {
  return tarjeta('i-historial', 'Por qué las cosas están como están',
    '<p class="aj-p">Todo lo de esta pantalla —y las ' +
    'decisiones que no se ven, como por qué el importe de un proyecto ganado no se vuelve a ' +
    'calcular nunca— está escrito y razonado en el documento de arquitectura, con la línea de ' +
    'código que lo verificó.</p>' +
    '<div class="pf-acciones">' +
    '<a class="btn btn-gho" href="' + REPO + '" target="_blank" rel="noopener">' +
    ico('i-doc') + ' Leer docs/ARQUITECTURA.md en GitHub</a>' +
    '</div>' +
    '<p class="pf-nota">Se abre en otra pestaña y necesita señal. Es el mismo archivo que ' +
    'viene en la carpeta <b>docs/</b> del proyecto.</p>');
}

/* ----- 8. El cordón ----- */

function cardCordon(baseOk) {
  return tarjeta('i-basura', 'Borrar todo lo de la plataforma',
    nota('<b>Esto no se puede deshacer.</b> Antes de borrar nada, la plataforma baja un ' +
      'respaldo, y si la descarga no sale, <b>no borra</b>. Prometer un respaldo, no darlo y ' +
      'borrar igual es un error que este proyecto ya cometió una vez.', 'mal') +
    '<p class="pf-nota">Se van los proyectos, la agenda, el libro del almacén, los ' +
    'requerimientos, los avisos y las fotos de obra de este dispositivo. También el Client ID ' +
    'de Calendar y el puente. Se quedan tu nombre, tu rol y el id del dispositivo, porque no ' +
    'son datos: son quién eres. El catálogo de material y las 18 constantes vuelven a ' +
    'sembrarse solos al abrir.</p>' +
    '<div class="pf-acciones">' +
    '<button type="button" class="btn btn-dgr" data-act="borrar"' + (baseOk ? '' : ' disabled') + '>' +
    ico('i-basura') + ' Borrar todo lo de la plataforma en este dispositivo</button>' +
    '</div>');
}

/* ============================================================================
   Los clics de la pantalla. Uno delegado, porque las tarjetas se repintan completas.
   ============================================================================ */

async function clic(ev) {
  const t = ev.target;

  if (t.closest('[data-act="recargar"]')) { location.reload(); return; }

  const rol = t.closest('[data-rol]');
  if (rol) { guardarNombreCallado(); aplicarRol(rol.dataset.rol); return; }

  const tile = t.closest('[data-tile]');
  if (tile) { elegirTiles(tile.dataset.tile); return; }

  if (t.closest('[data-act="nombre"]')) { guardarNombre(); return; }
  if (t.closest('[data-act="respaldar"]')) { respaldar(); return; }
  if (t.closest('[data-act="gcal-guardar"]')) { guardarGcal(); return; }
  if (t.closest('[data-act="gcal-conectar"]')) { conectarGcal(); return; }
  if (t.closest('[data-act="puente-guardar"]')) { guardarPuente(); return; }
  if (t.closest('[data-act="puente-quitar"]')) { quitarPuente(); return; }
  if (t.closest('[data-act="puente-bombear"]')) { bombear(); return; }
  if (t.closest('[data-act="puente-probar"]')) { probarPuente(); return; }
  if (t.closest('[data-act="puente-esquema"]')) { revisarEsquema(); return; }
  if (t.closest('[data-act="puente-jalar"]')) { jalar(); return; }
  if (t.closest('[data-act="puente-tokens"]')) { generarTokens(); return; }
  if (t.closest('[data-act="puente-copiar-tokens"]')) {
    copiarTexto((TOKS && TOKS.json) || '', 'JSON copiado — pégalo en la variable TOKENS del Worker');
    return;
  }
  if (t.closest('[data-act="puente-copiar-faltan"]')) { copiarFaltan(); return; }
  const ut = t.closest('[data-rol-tok]');
  if (ut) { usarToken(ut.dataset.rolTok); return; }
  if (t.closest('[data-act="borrar"]')) { abrirCordon(); return; }
}

function cambio(ev) {
  const inp = ev.target.closest('#aj-archivo');
  if (inp) restaurar(inp);
}

/* ----- Nombre y rol ----- */

function guardarNombre() {
  const n = ($('aj-nombre') && $('aj-nombre').value || '').trim();
  if (!n) { toast('Falta tu nombre: es lo que va a decir cada movimiento del almacén', 'err', 4200); return; }
  if (!Prefs.setNombre(n)) { toast('Este navegador no dejó guardar el nombre', 'err', 4200); return; }
  toast('Nombre guardado', 'ok', 2600);
  if (CTX.refrescar) CTX.refrescar();
}

/* Cambiar de rol repinta la pantalla completa. Si el campo del nombre traía algo sin
   guardar, se iba en blanco: se guarda antes, sin avisar, porque el aviso sobraría. */
function guardarNombreCallado() {
  const c = $('aj-nombre');
  if (!c) return;
  const n = (c.value || '').trim();
  if (n && n !== Prefs.nombre()) Prefs.setNombre(n);
}

/**
 * Aplicar un rol es apretar el segmento de la barra de arriba, no llamar a `Prefs.setRol`
 * desde aquí. `app.js` ya sabe todo lo que cambiar de rol implica —repintar su propio
 * segmento, sacar de la barra los módulos que ese rol no tiene, remontar la pantalla— y
 * dos caminos para lo mismo es cómo la barra de arriba se queda diciendo «Dirección»
 * mientras la pantalla ya es de Fabricación.
 */
function aplicarRol(r) {
  if (!Prefs.ROLES.includes(r)) return;
  if (r === Prefs.rol()) { if (CTX.refrescar) CTX.refrescar(); return; }
  const b = document.querySelector('#pf-rolseg [data-rol="' + r + '"]');
  if (b) { b.click(); return; }
  if (!Prefs.setRol(r)) { toast('No se pudo guardar el rol en este dispositivo', 'err', 4200); return; }
  if (CTX.refrescar) CTX.refrescar();
}

/* ----- Tiles ----- */

function elegirTiles(t) {
  if (!Geo.TILES[t] || t === Prefs.tiles()) return;
  if (!Prefs.setTiles(t)) { toast('No se pudo guardar la preferencia del mapa', 'err', 4200); return; }
  toast('El mapa va a usar ' + Geo.TILES[t].nombre, 'ok', 3200);
  if (CTX.refrescar) CTX.refrescar();
}

/* ----- Respaldar y restaurar ----- */

function respaldar() {
  if (!DB.estado().ok) { toast(DB.motivoTexto(), 'err', 4600); return; }
  /* El mismo respaldar de la banda de arriba: él marca la fecha, dice el aviso y apaga la
     franja. Uno propio aquí dejaría dos fechas de «último respaldo». */
  if (CTX.respaldar) CTX.respaldar();
}

async function restaurar(inp) {
  const f = inp.files && inp.files[0];
  /* El campo se vacía siempre. Sin esto, escoger el mismo archivo dos veces no dispara
     'change' y parece que el botón dejó de funcionar. */
  const limpiar = () => { try { inp.value = ''; } catch (_) {} };
  if (!f) { limpiar(); return; }

  if (!DB.estado().ok) { toast(DB.motivoTexto(), 'err', 4600); limpiar(); return; }

  const texto = await leerTexto(f);
  if (texto === null) {
    toast('No se pudo leer el archivo. Si viene de otra app, cópialo primero a este teléfono.', 'err', 4600);
    limpiar(); return;
  }

  /* El respaldo completo trae las dos mitades. La de la plataforma entra aquí; la del
     cotizador NO se escribe desde aquí —la plataforma tiene prohibido tocar sus claves— sino
     que se deja en una clave propia y el cotizador la ofrece al abrir, con su confirmación y su
     copia previa de siempre. Un respaldo viejo de la plataforma sola sigue entrando igual. */
  let paquete = null;
  try { paquete = JSON.parse(texto); } catch (_) {}
  let textoPlataforma = texto, mitadCotizador = null;
  if (paquete && paquete.app === 'al3d-completo') {
    if (!paquete.plataforma || typeof paquete.plataforma !== 'object') {
      toast('El respaldo completo viene sin la parte de la plataforma', 'err', 4600); limpiar(); return;
    }
    textoPlataforma = JSON.stringify(paquete.plataforma);
    if (paquete.cotizador && typeof paquete.cotizador === 'object') mitadCotizador = JSON.stringify(paquete.cotizador);
  }

  const r = await DB.importar(textoPlataforma);
  limpiar();
  if (!avisarResultado(r)) return;

  const v = r.valor || {};
  const n = Number(v.registros) || 0, d = Number(v.descartados) || 0;
  let msg = 'Entraron ' + n + (n === 1 ? ' registro' : ' registros') +
    (d ? ' y se descartaron ' + d + ' por estar ya en la base' : '');
  if (mitadCotizador) {
    if (Prefs.dejarRestauracion(mitadCotizador)) {
      toast(msg + '. La parte del cotizador queda esperando: ábrelo y toca «Restaurar ahora».', 'ok', 9000,
        { label: 'Abrir el cotizador', fn: () => { location.href = 'cotizador.html'; } });
    } else {
      toast(msg + '. La parte del cotizador NO cupo aquí: restáurala desde el cotizador con este mismo archivo.', 'err', 9000);
    }
  } else {
    toast(msg, 'ok', 5200);
  }
  if (CTX.refrescar) CTX.refrescar();
}

/** null si no se pudo leer. FileReader y no `Blob.text()`: `text()` pide Safari 14 y el
 *  cotizador ya lee archivos así. */
function leerTexto(f) {
  return new Promise(res => {
    try {
      const fr = new FileReader();
      fr.onload = () => res(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => res(null);
      fr.readAsText(f);
    } catch (_) { res(null); }
  });
}

/* ----- Fase 2 ----- */

function guardarGcal() {
  const id = ($('aj-gcal-id') && $('aj-gcal-id').value || '').trim();
  const inv = ($('aj-gcal-inv') && $('aj-gcal-inv').value || '')
    .split(/[,\s;]+/).map(x => x.trim()).filter(Boolean);

  if (id && !/\.apps\.googleusercontent\.com$/i.test(id)) {
    toast('Ese no parece el ID de cliente: termina en .apps.googleusercontent.com', 'err', 5200);
    return;
  }
  if (id && !inv.length) {
    toast('Faltan los correos de los invitados. Sin ellos el evento se crea, pero solo te suena a ti.', 'err', 5600);
    return;
  }

  const prev = Prefs.gcal() || {};
  const cfg = id
    ? { ...prev, clientId: id, calendarioId: prev.calendarioId || 'primary', invitados: inv }
    : null;   // sin Client ID no hay configuración: se borra en vez de guardar una a medias
  if (!Prefs.setGcal(cfg)) { toast('Este navegador no dejó guardar la configuración', 'err', 4200); return; }
  toast(id ? 'Client ID guardado. Ahora dale a Conectar.' : 'Se quitó la configuración de Calendar', 'ok', 3800);
  if (CTX.refrescar) CTX.refrescar();
}

async function conectarGcal() {
  /* Sale de un clic a propósito y no de un temporizador: `requestAccessToken` abre una
     ventana, y sin gesto del usuario el navegador la bloquea como popup. */
  const r = await Gcal.conectar();
  if (!avisarResultado(r, 'Conectado con Google Calendar')) return;
  if (CTX.refrescar) CTX.refrescar();
}

/* ----- Fase 3, el puente -----
   Las seis acciones repintan con `repintar()` y no con `CTX.refrescar()`, y la diferencia
   importa: refrescar REMONTA el módulo, y montar limpia `SALUD`, `ESQ` y `TOKS` a
   propósito —los tres tokens se ven una sola vez—. Con refrescar, apretar «Probar» habría
   borrado su propia respuesta antes de pintarla. */

/** Vuelve a leer los dos contadores de la bandeja y repinta, sin remontar. */
async function repintar() {
  const [cola, sinDest] = await Promise.all([Sync.pendientes(), Sync.sinDestino()]);
  PEND = cola.length;
  APARTADAS = sinDest.length;
  pintar();
}

/* Un solo botón del puente a la vez. Todos tocan la red y ninguno es instantáneo: sin
   esto, tres toques impacientes son tres peticiones en vuelo y la última en contestar es
   la que se pinta, que no es la última que se pidió. */
let _ocupado = false;
async function conElPuente(etiqueta, fn) {
  if (_ocupado) return;
  const rel = Puente.desdePrefs();
  if (!rel) { toast('Primero guarda la URL y el token del Worker', 'err', 4200); return; }
  _ocupado = true;
  toast(etiqueta, '', 2000);
  try { await fn(rel); } finally { _ocupado = false; }
  await repintar();
}

async function guardarPuente() {
  const url = ($('aj-worker-url') && $('aj-worker-url').value || '').trim();
  const nuevo = ($('aj-worker-tok') && $('aj-worker-tok').value || '').trim();
  const prev = Prefs.puente() || {};

  if (!url) { toast('Falta la URL del Worker', 'err', 4200); return; }
  if (!/^https:\/\//i.test(url)) {
    toast('La URL del Worker tiene que empezar con https:// — un token no viaja en claro', 'err', 5200);
    return;
  }
  const token = nuevo || prev.token || '';
  if (!token) {
    toast('Falta el token de este dispositivo. Sin él el Worker no sabe quién le habla y contesta 401.', 'err', 5600);
    return;
  }
  if (!Prefs.setPuente({ ...prev, url: Puente.normalizarUrl(url), token })) {
    toast('Este navegador no dejó guardar el puente', 'err', 4200);
    return;
  }

  /* Enchufar y probar de corrido. Guardar una URL y NO decir si sirve es cómo alguien se
     va del taller creyendo que ya sincroniza, y se entera tres días después de que el
     token traía un espacio pegado. */
  if (CTX.enchufarPuente) await CTX.enchufarPuente();
  await probarPuente();
}

async function quitarPuente() {
  if (!Prefs.setPuente(null)) { toast('No se pudo quitar el puente', 'err', 4200); return; }
  Sync.registrar(null);
  SALUD = null; ESQ = null;
  toast('Se quitó el puente de este dispositivo. Lo que estaba en la bandeja se queda esperando.', 'ok', 4600);
  await repintar();
}

/** GET /salud. Guarda el rol que el Worker reconoció, que es el que de verdad manda. */
async function probarPuente() {
  await conElPuente('Preguntándole al puente…', async rel => {
    SALUD = await rel.salud();
    if (SALUD.ok) {
      /* El rol se recuerda junto a la URL para que la pantalla pueda decir de qué es este
         token sin volver a preguntar. El token NO se vuelve a escribir aquí: ya está. */
      const prev = Prefs.puente() || {};
      Prefs.setPuente({ ...prev, rol: SALUD.rol || '', probado: Date.now() });
      toast('El puente contesta', 'ok', 3000);
    } else {
      toast(SALUD.mensaje || 'El puente no contestó', 'err', 5600);
    }
  });
}

/** GET /esquema. Detecta lo que falta en Notion; NO lo crea, y eso es a propósito. */
async function revisarEsquema() {
  await conElPuente('Leyendo el esquema de Notion…', async rel => {
    ESQ = await rel.esquema();
    if (!ESQ.ok) { toast(ESQ.mensaje || 'No se pudo leer el esquema', 'err', 5600); return; }
    toast(ESQ.faltan.length
      ? 'Le faltan ' + ESQ.faltan.length + (ESQ.faltan.length === 1 ? ' propiedad' : ' propiedades') + ' a la base'
      : 'La base ya tiene todo lo que hace falta', ESQ.faltan.length ? '' : 'ok', 4200);
  });
}

function copiarFaltan() {
  if (!ESQ || !ESQ.faltan || !ESQ.faltan.length) return;
  /* Se copia con el tipo y las opciones porque eso es justo lo que hay que teclear del
     otro lado, y una propiedad creada con el tipo equivocado es media hora de arreglar. */
  const txt = ESQ.faltan.map(x => x.nombre + '  —  tipo: ' + x.tipo +
    (Array.isArray(x.opciones) && x.opciones.length ? '  —  opciones: ' + x.opciones.join(', ') : '')).join('\n');
  copiarTexto(txt, 'Lista copiada — créalas a mano en la base Ventas - AL3D');
}

async function bombear() {
  if (_ocupado) return;
  _ocupado = true;
  let r;
  try { r = await Sync.bombear(); } finally { _ocupado = false; }
  if (!avisarResultado(r)) { await repintar(); return; }
  const v = r.valor || {};
  const n = Number(v.subidas || v.mandadas) || 0;
  const partes = [];
  if (n) partes.push('Se ' + (n === 1 ? 'mandó 1 operación' : 'mandaron ' + n + ' operaciones'));
  if (v.fallidas) partes.push(v.fallidas + (v.fallidas === 1 ? ' no se pudo' : ' no se pudieron'));
  if (v.conflictos) partes.push(v.conflictos + (v.conflictos === 1 ? ' cambió en Notion' : ' cambiaron en Notion'));
  if (v.sin_destino) partes.push(v.sin_destino + ' se apartaron: este puente no las lleva');
  /* Lo que se mandó pero no se escribió entero. El Worker devuelve qué propiedad rechazó y
     por qué; hasta ahora eso moría en un console.warn y el aviso decía «se mandó» a secas.
     Va en rojo y dura más: es la única señal de que una fila de Notion quedó a medias. */
  const rech = Array.isArray(v.rechazos) ? v.rechazos : [];
  if (rech.length) {
    const props = [...new Set(rech.flatMap(x => (x.lista || []).map(y => y.nombre)))];
    partes.push('pero Notion no aceptó ' + props.join(', '));
  }
  toast(partes.length ? partes.join(' · ') : 'No había nada que mandar',
        (v.fallidas || rech.length) ? 'err' : 'ok', rech.length ? 7000 : 4600);
  if (rech.length) {
    const detalle = rech.flatMap(x => (x.lista || []).map(y => y.nombre + ': ' + y.por));
    voz('Notion no escribió ' + detalle.length + ' propiedades. ' + detalle.join('. '), true);
  }
  await repintar();
}

/**
 * Trae el espejo del dinero. Da varias vueltas a propósito: el Worker pagina de 50 en 50 y
 * la base arrastra 199 filas anteriores a la plataforma que se miran y se descartan una por
 * una. Con una sola vuelta por toque, alguien tendría que apretar el botón cinco veces sin
 * que la pantalla le dijera por qué.
 */
async function jalar() {
  if (_ocupado) return;
  _ocupado = true;
  toast('Trayendo lo de Notion…', '', 2000);
  let nuevos = 0, actualizados = 0, vueltas = 0, error = null;
  try {
    /* Tope de veinte vueltas —mil filas— para que un cursor que no avanza no deje esto
       dando vueltas para siempre contra una API que sí cobra peticiones. */
    while (vueltas < 20) {
      const r = await Sync.jalar();
      vueltas++;
      if (!r.ok) { error = r.mensaje; break; }
      const v = r.valor || {};
      nuevos += Number(v.nuevos) || 0;
      actualizados += Number(v.actualizados) || 0;
      if (!((Number(v.nuevos) || 0) + (Number(v.actualizados) || 0) + (Number(v.descartados) || 0))) break;
    }
  } finally { _ocupado = false; }
  if (error) toast(error, 'err', 5200);
  else toast(nuevos + actualizados
    ? 'Se actualizaron ' + (nuevos + actualizados) + (nuevos + actualizados === 1 ? ' proyecto' : ' proyectos') + ' con lo que hay en Notion'
    : 'No había nada nuevo en Notion para los proyectos de este dispositivo', 'ok', 4600);
  await repintar();
}

/** Los tres tokens de dispositivo, hechos aquí para no teclear el JSON a mano. */
function generarTokens() {
  TOKS = Puente.tokensNuevos();
  pintar();
  toast('Tres tokens nuevos. Pega el JSON en la variable TOKENS del Worker.', '', 5600);
}

/** Mete en el campo el token del rol que le toca a ESTE teléfono. No lo guarda: lo escribe,
 *  y se guarda con el botón de siempre, para que el paso no ocurra sin que nadie lo vea. */
function usarToken(rol) {
  if (!TOKS || !TOKS.tokens[rol]) return;
  const c = $('aj-worker-tok');
  if (!c) return;
  c.value = TOKS.tokens[rol];
  c.focus();
  toast('Token de ' + (Prefs.ROL_NOMBRE[rol] || rol) + ' puesto en el campo. Dale a «Guardar el puente».', 'ok', 5200);
}

/* ============================================================================
   El cordón — dos confirmaciones y un respaldo que de verdad se descargó
   ============================================================================ */

function panel(html) {
  const capa = $('pf-pide');
  if (!capa) return;
  capa.innerHTML = '<div class="pf-panel">' + html + '</div>';
  if (!capa.classList.contains('show')) abrirCapa('pf-pide', { hist: true });
}

function cerrarPanel() {
  cerrarCapa('pf-pide');
  const capa = $('pf-pide');
  if (capa) capa.innerHTML = '';
}

const cabeza = titulo =>
  '<div class="pf-panel-h"><h2>' + esc(titulo) + '</h2>' +
  '<button type="button" class="pf-cerrar" data-cordon="cerrar" aria-label="Cerrar">' +
  ico('i-cerrar') + '</button></div>';

/** Primera confirmación: qué hay adentro, dicho con números, no con «todos tus datos». */
async function abrirCordon() {
  if (!DB.estado().ok) { toast(DB.motivoTexto(), 'err', 4600); return; }

  const [np, ni, nm, nb] = await Promise.all([
    DB.contar('proyectos'), DB.contar('instalaciones'),
    DB.contar('movimientos'), DB.contar('blobs'),
  ]);

  panel(cabeza('¿Borrar todo lo de la plataforma?') +
    '<div class="pf-panel-b">' +
      '<dl class="pf-dato"><dt>Proyectos</dt><dd>' + np + '</dd></dl>' +
      '<dl class="pf-dato"><dt>Instalaciones agendadas</dt><dd>' + ni + '</dd></dl>' +
      '<dl class="pf-dato"><dt>Renglones del libro del almacén</dt><dd>' + nm + '</dd></dl>' +
      '<dl class="pf-dato"><dt>Fotos de obra</dt><dd>' + nb + '</dd></dl>' +
      nota('El libro del almacén no se puede reconstruir: cada renglón es una entrada, una ' +
        'salida o un conteo que alguien hizo con las manos, y no está en ningún otro sistema.', 'mal') +
      '<p class="pf-nota">El siguiente paso baja el respaldo. Si la descarga no sale, no se ' +
      'borra nada y te lo digo.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-cordon="cerrar">Mejor no</button>' +
      '<button type="button" class="btn btn-dgr" data-cordon="respaldo">Respaldar y seguir</button>' +
    '</div>');
}

/** El respaldo, con su booleano. Si no se descargó, aquí se acaba el camino. */
function cordonRespaldo() {
  const b = document.querySelector('[data-cordon="respaldo"]');
  if (b) { b.disabled = true; b.textContent = 'Bajando el respaldo…'; }

  DB.exportar().then(txt => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const sello = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' +
                  p(d.getHours()) + p(d.getMinutes());
    /* `descargarArchivo` devuelve false cuando el navegador no dejó bajar el archivo, y ese
       false es la razón entera de que este flujo no reutilice `ctx.respaldar()`. */
    const bien = descargarArchivo(txt, 'plataforma-al3d-antes-de-borrar-' + sello + '.json',
                                  'application/json');
    if (!bien) {
      cerrarPanel();
      toast('No se pudo descargar el respaldo, así que no se borró nada', 'err', 6000);
      return;
    }
    Prefs.marcarExport();
    cordonFinal(sello);
  }).catch(() => {
    cerrarPanel();
    toast('No se pudo armar el respaldo, así que no se borró nada', 'err', 6000);
  });
}

/** Segunda confirmación, ya con el respaldo en la mano. Se escribe la palabra: este botón
 *  no se puede apretar con el dedo equivocado. */
function cordonFinal(sello) {
  panel(cabeza('El respaldo ya está en tu teléfono') +
    '<div class="pf-panel-b">' +
      nota(ico('i-check') + ' Se descargó <b>plataforma-al3d-antes-de-borrar-' + esc(sello) +
        '.json</b>. Guárdalo donde no se borre solo: con ese archivo, «Restaurar» de esta ' +
        'misma pantalla trae todo de vuelta.', 'ok') +
      '<p class="aj-p">Ahora sí, lo último. Escribe <b>BORRAR</b> con mayúsculas para ' +
      'confirmar.</p>' +
      '<div class="fld"><label for="aj-borrar">Confirmación</label>' +
      '<input type="text" id="aj-borrar" autocomplete="off" spellcheck="false" ' +
      'autocapitalize="characters" placeholder="BORRAR"></div>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-cordon="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-dgr" data-cordon="borrar">Borrar de verdad</button>' +
    '</div>');
}

async function cordonBorrar() {
  const c = $('aj-borrar');
  if (((c && c.value) || '').trim() !== 'BORRAR') {
    toast('Escribe BORRAR con mayúsculas para confirmar', 'err', 4200);
    if (c) { try { c.focus(); } catch (_) {} }
    return;
  }

  const b = document.querySelector('[data-cordon="borrar"]');
  if (b) { b.disabled = true; b.textContent = 'Borrando…'; }

  const fallos = [];
  for (const a of DB.ALMACENES) {
    const r = await DB.vaciar(a);
    if (!r.ok) fallos.push({ a, msg: r.mensaje });
  }

  if (fallos.length) {
    /* Un borrado a medias se dice a medias. No se tocan las llaves: mientras quede algo en
       la base, quitarle la configuración solo hace más difícil entender qué pasó. */
    cerrarPanel();
    toast('Se borró parte: ' + fallos[0].msg + ' Recarga y vuelve a intentar.', 'err', 6000);
    if (CTX.refrescar) CTX.refrescar();
    return;
  }

  /* El buzón se vacía también, y no por limpieza: `drenarBuzon()` corre en cada arranque,
     así que una venta que se quedó ahí volvería a nacer como proyecto en la siguiente
     recarga. Sembrar lo que nunca nació es ayudar; resucitar lo que alguien acaba de
     borrar es no hacerle caso. */
  Prefs.set(Prefs.CLAVES.GANADAS, []);
  Prefs.setPuente(null);
  Prefs.setGcal(null);

  panel(cabeza('Se borró todo') +
    '<div class="pf-panel-b">' +
      nota('Listo. El catálogo de material y las 18 constantes se siembran solas al abrir; ' +
        'los proyectos, la agenda y el libro del almacén están en el archivo que acabas de ' +
        'bajar. La plataforma se va a recargar.', 'ok') +
    '</div>');
  /* Recargar y no repintar: los otros módulos guardan sus propias listas en memoria y una
     pantalla enseñando proyectos que ya no existen es peor que un segundo de espera. */
  _t = setTimeout(() => location.reload(), 1600);
}

function clicPide(ev) {
  const b = ev.target.closest('[data-cordon]');
  if (!b) return;
  const q = b.dataset.cordon;
  if (q === 'cerrar') { cerrarPanel(); return; }
  if (q === 'respaldo') { cordonRespaldo(); return; }
  if (q === 'borrar') { cordonBorrar(); return; }
}
