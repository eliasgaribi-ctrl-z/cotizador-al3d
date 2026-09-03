/* ============================================================================
   Inicio — «qué se rompe primero», sin que nadie busque nada.

   Es la pantalla que se abre, y su único trabajo es contestar esa pregunta. No es un
   resumen ni un tablero: es una lista de cosas que hay que hacer hoy, ordenada por lo que
   truena antes y no por fecha, con el botón que las hace al lado del renglón que las
   nombra. Si algo de aquí necesita que el usuario abra otra pantalla para entenderlo,
   está mal escrito.

   Tres decisiones que se ven en todo el archivo:

   1. Esta pantalla no calcula nada. Los avisos salen de `Reglas.refrescar()`, las
      cantidades de `Stock`, la frescura de `Sync`. Si aquí se decidiera cuándo un material
      falta, habría dos respuestas a la misma pregunta y la que se pinta sería la que
      nadie probó.
   2. La tarjeta de A6 —«se ganó» / «no se dio»— es lo único de la plataforma que late.
      Es el eslabón que hoy no existe en ningún sistema: sin ese toque no hay proyecto, ni
      agenda, ni material, ni mapa, y todo lo demás de esta pantalla está vacío. Por eso
      va con `.cand-partidas`, la misma forma que el cotizador usa para lo que pide una
      decisión antes de seguir, y por eso NADA MÁS la lleva: dos cosas latiendo son cero
      cosas latiendo.
   3. Al final se dice la verdad de cómo funcionan los avisos. Es información que el
      usuario necesita para confiar en el sistema, y esconderla sería venderle una
      automatización que no existe.
   ============================================================================ */

import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Cot from '../datos/cotizador.js';
import * as Reglas from '../datos/reglas.js';
import * as Sync from '../datos/sync.js';
import * as Proyectos from '../datos/proyectos.js';
import * as Agenda from '../datos/agenda.js';
import * as Stock from '../datos/stock.js';
import * as Material from '../datos/material.js';
import { masDias } from '../nucleo/fechas.js';
import { $, esc, ico, money, toast, avisarResultado, vacio, hoyISO,
         fmtFecha, fmtFechaDia, abrirCapa, cerrarCapa, copiarTexto, ajustarAltoBarra,
         bandaFrescura }
  from '../nucleo/ui.js';

/* ----- Estado del módulo -----
   Vive aquí y no en el DOM. Las acciones de un aviso traen arrays adentro —los faltantes
   de A8 son objetos completos— y serializarlos a un atributo obligaría a escapar JSON
   dentro de HTML dentro de una comilla. Un índice a este arreglo no se puede escapar mal. */
let _cont = null;
let _ctx = null;
let _acciones = [];
let _pide = null;         // qué está preguntando el modal, si está abierto
let _datos = null;        // lo último que se leyó, para repintar sin volver a leer
let _oyendo = false;

/* ============================================================================
   Montar y desmontar
   ============================================================================ */

export async function montar(contenedor, ctx) {
  _cont = contenedor;
  _ctx = ctx;

  /* La base cerrada NO se pinta como una plataforma vacía. La diferencia entre «todavía no
     tienes proyectos» y «la base no abrió» es la diferencia entre estar tranquilo y perder
     una tarde buscando datos que están enteros. */
  _cont.addEventListener('click', alTocar);
  const capa = $('pf-pide');
  if (capa) capa.addEventListener('click', alTocarPide);
  _oyendo = true;

  if (!DB.estado().ok) {
    _cont.innerHTML = vacio('No se pudo abrir la base de este dispositivo',
      DB.motivoTexto(),
      '<button type="button" class="btn btn-pri" data-recargar>Recargar</button>');
    return;
  }

  _cont.innerHTML = '<div class="vacio">' + ico('i-reloj') +
    '<p class="vacio-t">Calculando qué se rompe primero…</p></div>';

  await recargar();
}

export function desmontar() {
  if (_cont && _oyendo) _cont.removeEventListener('click', alTocar);
  const capa = $('pf-pide');
  if (capa) capa.removeEventListener('click', alTocarPide);
  /* La barra fija se limpia aquí y no en el que sigue: si el módulo siguiente no tiene
     acción principal, el botón de esta pantalla se quedaría flotando encima de la suya y
     el primer dedo del día lo apretaría creyendo que es de lo que está viendo. */
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }
  /* Si el modal quedó abierto —se cambió de rol con la pregunta enfrente— se cierra: la
     capa es del documento, no de este módulo, y dejarla puesta bloquea la pantalla nueva. */
  if (_pide) cerrarPide();
  _cont = null; _ctx = null; _acciones = []; _datos = null; _oyendo = false;
}

/* ============================================================================
   Leer
   ============================================================================ */

const VIVAS_SIN_MARCAR = ['propuesta', 'confirmada', 'reagendada'];

async function leer() {
  const hoy = hoyISO();

  /* Todo en paralelo y todo local: esta pantalla abre sin señal, y son diez lecturas de
     IndexedDB. En serie se notaría en un celular viejo justo en el arranque, que es el
     único momento en que alguien está esperando a que la app aparezca. */
  const [avisos, fres, instHoy, instSemana, sinFecha, vencidas, compra, bajo, conSaldo] =
    await Promise.all([
      Reglas.refrescar({ hoy }),
      Sync.frescura(),
      Agenda.listar({ desde: hoy, hasta: hoy, vivas: true, conProyecto: true }),
      Agenda.listar({ desde: hoy, hasta: masDias(hoy, 6), vivas: true }),
      Proyectos.listar({ sinFecha: true, vivos: true }),
      Agenda.listar({ hasta: masDias(hoy, -1), estados: VIVAS_SIN_MARCAR }),
      Stock.listaCompra({}),
      Stock.bajoMinimo(),
      Proyectos.listar({ etapa: 'instalado', conPendiente: true }),
    ]);

  /* «Por comprar» es lo que hay que ir a pedir, y un renglón con `requiere_dato` cuenta:
     no saber cuánto falta no es que no falte. Es el sesgo declarado del sistema —preferimos
     el falso positivo— aplicado a la cuenta de arriba y no solo a los avisos. */
  const porComprar = (compra || []).filter(f => Number(f.comprar) > 0 || f.confianza === 'requiere_dato');

  return { hoy, avisos: avisos || [], fres: fres || null,
           instHoy: instHoy || [], instSemana: instSemana || [],
           sinFecha: sinFecha || [], vencidas: vencidas || [],
           compra: compra || [], porComprar, bajo: bajo || [], conSaldo: conSaldo || [] };
}

async function recargar() {
  if (!_cont) return;
  _datos = await leer();
  if (!_cont) return;      // se cambió de módulo mientras se leía
  pintar();
}

/* ============================================================================
   Pintar
   ============================================================================ */

function pintar() {
  const d = _datos;
  if (!_cont || !d) return;
  const rol = Prefs.rol();
  const veDinero = Prefs.veDinero();

  _acciones = [];

  /* Los avisos de A6 salen de la lista y se van a su propia tarjeta. En la lista serían dos
     renglones más entre nueve; ahí arriba son la única cosa de la pantalla que nadie más
     puede contestar. */
  const idA6 = Reglas.REGLAS.A6.id;
  const decidir = d.avisos.filter(a => a.regla === idA6);
  const resto = d.avisos.filter(a => a.regla !== idA6);

  const partes = [];
  partes.push(bandaFrescura(d.fres, Sync.disponible()));
  partes.push(cuentas(d, rol, veDinero));
  if (decidir.length) partes.push(tarjetaDecidir(decidir));
  partes.push(tarjetaAvisos(resto, decidir.length));
  if (rol === 'direccion') {
    partes.push(tarjetaCola(veDinero));
    partes.push(tarjetaDispositivo(d));
  }
  partes.push(laVerdad());

  _cont.innerHTML = partes.filter(Boolean).join('');

  publicarCuentas(d);
  pintarMbar(decidir.length);
}

/* `bandaFrescura()` vive en nucleo/ui.js: la pinta también el Tablero. */

/* ----- Las cuentas -----
   Los números que importan, grandes y arriba. Cuáles son depende del rol, y no por
   esconder: a Pagos la cuenta de instalaciones de hoy no le dice nada que pueda hacer, y
   un número que no lleva a una acción es un número que se aprende a saltar. Para
   Fabricación no aparece ninguno de dinero —§8.1—: el elemento no existe, no se difumina. */
function cuentas(d, rol, veDinero) {
  const c = [];
  if (rol === 'direccion' || rol === 'fabricacion') {
    c.push(unaCuenta(d.instHoy.length, 'Se instalan hoy', d.instHoy.length > 0));
    c.push(unaCuenta(d.instSemana.length, 'Esta semana', false));
  }
  if (rol === 'direccion') {
    c.push(unaCuenta(d.sinFecha.length, 'Ganados sin fecha', d.sinFecha.length > 0));
  }
  if (rol === 'direccion' || rol === 'fabricacion') {
    c.push(unaCuenta(d.porComprar.length, 'Materiales por comprar', d.porComprar.length > 0));
  }
  if (rol === 'pagos') {
    /* Pagos ve cobranza y ve la compra «solo costos» (§8.1). El costo puede ser null en
       todas las filas —`costo_compra` es opcional y es el default de las 19 de la semilla—
       y ahí NO se pinta un $0 que se leería como «no cuesta nada»: se pinta la cuenta de
       materiales, que es el dato que sí existe. */
    c.push(unaCuenta(d.conSaldo.length, 'Proyectos con saldo', d.conSaldo.length > 0));
    const costo = d.compra.reduce((s, f) => s + (Number(f.costo) || 0), 0);
    if (veDinero && costo > 0) {
      c.push('<p class="pf-cuenta"><b>' + esc(money(costo)) + '</b>Costo de lo que hay que comprar</p>');
    } else {
      c.push(unaCuenta(d.porComprar.length, 'Materiales por comprar', false));
    }
  }
  return '<div class="pf-cuentas">' + c.join('') + '</div>';
}

function unaCuenta(n, etiqueta, urge) {
  return '<p class="pf-cuenta' + (urge ? ' urge' : '') + '"><b>' + Number(n || 0) + '</b>' +
    esc(etiqueta) + '</p>';
}

/* ----- LA tarjeta -----
   Dos botones por cotización y nada en medio. «Se gano» abre el flujo de ganar, que pide
   una sola fecha ya prellenada; «No se dio» deja constancia para que la pregunta no
   vuelva mañana. El texto de cada renglón lo escribió la regla: si lo reescribiera aquí,
   la tarjeta y el aviso dirían lo mismo con dos palabras distintas. */
function tarjetaDecidir(lista) {
  const n = lista.length;
  const h = ['<div class="cand-partidas pf-decidir">',
    '<p class="cp-txt">' + ico('i-venta') + ' <b>' +
    (n === 1 ? 'Una cotización autorizada' : n + ' cotizaciones autorizadas') +
    '</b> sin decidir. Sin este toque no hay proyecto, ni agenda, ni material, ni mapa: es lo único de esta pantalla que nadie más puede contestar.</p>'];
  for (const a of lista) {
    const folio = (a.acciones.find(x => x.tipo === 'ganar') || { datos: {} }).datos.folio || a.entidad_id;
    h.push('<div class="pf-fila">' +
      '<span class="pf-fila-ico">' + ico('i-doc') + '</span>' +
      '<div class="pf-fila-tx">' +
        '<p class="pf-fila-t">' + esc(a.titulo) + '</p>' +
        (a.detalle ? '<p class="pf-fila-d">' + esc(a.detalle) + '</p>' : '') +
      '</div>' +
      '<div class="pf-fila-acc">' +
        boton('Se ganó', 'btn btn-ok', { rid: a.rid, tipo: 'ganar', datos: { folio } }) +
        boton('No se dio', 'btn btn-gho', { rid: a.rid, tipo: 'descartar', datos: { folio } }) +
      '</div>' +
    '</div>');
  }
  h.push('</div>');
  return h.join('');
}

/* ----- La lista de avisos -----
   Ordenada por lo que se rompe primero, que es el orden en que `Reglas` los devuelve. Aquí
   NO se reordena: si esta pantalla decidiera su propio orden, el aviso más urgente
   dependería de qué módulo lo pinta. */
function tarjetaAvisos(lista, hayDecision) {
  const cuerpo = lista.length
    ? lista.map(filaAviso).join('')
    : vacio(hayDecision ? 'Fuera de eso, nada se está rompiendo' : 'Nada se está rompiendo hoy',
        'No hay instalaciones sin material, ni proyectos sin fecha, ni nada vencido. Cuando algo lo esté, aparece aquí en cuanto abras la plataforma.');
  return '<div class="card"><div class="card-h"><h2>' + ico('i-aviso') + ' Qué atender' +
    (lista.length ? ' <span class="folio">' + lista.length + '</span>' : '') +
    '</h2></div><div class="card-b">' + cuerpo + '</div></div>';
}

/* Un icono por regla, para que el ojo reconozca de qué se trata antes de leer. El color
   nunca va solo: el renglón siempre lleva la ficha de cuándo con su palabra. */
const ICONO = {
  A6_sin_decidir: 'i-doc', A7_sin_fecha: 'i-agenda', A8_material: 'i-material',
  A9_minimo: 'i-material', A10_paso: 'i-camion', A11_cobro: 'i-venta',
  A12_huella: 'i-historial', A13_constante: 'i-recalibrar', A14_respaldo: 'i-bajar',
};

function filaAviso(a) {
  const tono = a.tono === 'urge' ? ' mal' : (a.tono === 'av' ? ' urge' : '');
  return '<div class="pf-fila">' +
    '<span class="pf-fila-ico' + tono + '">' + ico(ICONO[a.regla] || 'i-aviso') + '</span>' +
    '<div class="pf-fila-tx">' +
      '<p class="pf-fila-t">' + esc(a.titulo) + fichaCuando(a) + '</p>' +
      (a.detalle ? '<p class="pf-fila-d">' + esc(a.detalle) + '</p>' : '') +
    '</div>' +
    accionesDe(a) +
  '</div>';
}

/* La ficha de cuándo. Siempre trae palabra: un chip ámbar sin texto no le dice nada a quien
   no distingue el ámbar del gris, y este renglón se lee para decidir el día. */
function fichaCuando(a) {
  const plazo = Number(a.plazo) || 0;
  if (a.tono === 'urge') {
    return ' <span class="pf-cuando tarde">urge' + (a.cuando ? ' · ' + esc(a.cuando) : '') + '</span>';
  }
  if (!a.cuando) return '';
  const k = plazo < 0 ? 'tarde' : (plazo <= 3 ? 'hoy' : 'lejos');
  return ' <span class="pf-cuando ' + k + '">' + esc(a.cuando) + '</span>';
}

function accionesDe(a) {
  const btns = [];
  for (const ac of (a.acciones || [])) {
    const h = botonAccion(a, ac, btns.length === 0);
    if (h) btns.push(h);
  }
  return btns.length ? '<div class="pf-fila-acc">' + btns.join('') + '</div>' : '';
}

/** Registra la acción en `_acciones` y devuelve el botón que la dispara. */
function boton(label, clase, accion) {
  const i = _acciones.push(accion) - 1;
  return '<button type="button" class="' + clase + '" data-acc="' + i + '">' +
    esc(label) + '</button>';
}

function botonAccion(a, ac, primaria) {
  const datos = ac.datos || {};

  /* WhatsApp es un `<a href>` y no un botón con JS: en el celular abre la app instalada, y
     `window.open` desde un manejador asíncrono es justo lo que el bloqueador de ventanas
     emergentes de iOS tira. Cuando no hay teléfono al que mandarlo, el mensaje sirve
     igual: se copia y se pega en la conversación que ya está abierta. */
  if (ac.tipo === 'wa') {
    const m = Reglas.mensajeWa(datos.clase, datos);
    if (!m || !m.texto) return '';
    if (m.url) {
      return '<a class="btn-wa" href="' + esc(m.url) + '" target="_blank" rel="noopener">' +
        ico('i-wa') + esc(ac.label) + '</a>';
    }
    return boton('Copiar el mensaje', 'btn btn-gho',
      { rid: a.rid, tipo: 'copiar', datos: { texto: m.texto } });
  }

  return boton(ac.label, 'btn ' + (primaria ? 'btn-pri' : 'btn-gho'),
    { rid: a.rid, tipo: ac.tipo, datos, titulo: a.titulo });
}

/* ----- La cola del cotizador -----
   `al3d_queue` son las cotizaciones que alguien mandó a autorizar y todavía no tienen
   precio bueno. No es un aviso —no hay regla que las mire— y sin este renglón se quedan
   esperando en un almacenamiento que solo el cotizador enseña. Solo la ve Dirección,
   porque es la única que pone precio. */
function tarjetaCola(veDinero) {
  const cola = Cot.cola();
  if (!cola.length) return '';
  const filas = cola.slice(0, 8).map(e => {
    const quien = [e.cliente, e.proy].filter(Boolean).join(' — ') || 'sin cliente';
    const neto = veDinero && Number(e.neto) > 0 ? ' · pidió ' + money(e.neto) : '';
    return '<div class="pf-fila">' +
      '<span class="pf-fila-ico">' + ico('i-reloj') + '</span>' +
      '<div class="pf-fila-tx">' +
        '<p class="pf-fila-t">' + esc(e.folio || 'sin folio') + '</p>' +
        '<p class="pf-fila-d">' + esc(quien) + esc(neto) + '</p>' +
      '</div></div>';
  }).join('');
  const mas = cola.length > 8
    ? '<p class="pf-fila-d">y ' + (cola.length - 8) + ' más.</p>' : '';
  return '<div class="card"><div class="card-h"><h2>' + ico('i-candado') +
    ' Esperando precio <span class="folio">' + cola.length + '</span></h2></div>' +
    '<div class="card-b">' + filas + mas +
    '<p class="pf-nota">Se autorizan en el cotizador, que es donde vive el precio. La plataforma solo lee esta cola: nunca la escribe.</p>' +
    '<a class="btn btn-pri" href="cotizador.html">Abrir el cotizador</a></div></div>';
}

/* ----- El puente y la bandeja -----
   Dirección es la única que ve esto (§8.1) y es la única que puede hacer algo al respecto.
   Se dice el estado real, incluido el de Fase 1: no hay puente, y eso no es una falla. */
function tarjetaDispositivo(d) {
  const s = Sync.estado();
  const pend = Number(d.fres && d.fres.pendientes) || 0;
  const filas = [];

  filas.push('<div class="pf-fila">' +
    '<span class="pf-fila-ico' + (s.configurado ? ' bien' : '') + '">' +
      ico(s.configurado ? 'i-nube' : 'i-nube-off') + '</span>' +
    '<div class="pf-fila-tx">' +
      '<p class="pf-fila-t">' + (s.configurado
        ? 'El puente está puesto' + (s.adaptador ? ' · ' + esc(s.adaptador) : '')
        : 'Todavía no hay puente') + '</p>' +
      '<p class="pf-fila-d">' + (s.configurado
        ? (s.ultimo_error
            ? 'El último envío falló: ' + esc(s.ultimo_error)
            : 'Los cambios de este dispositivo se van solos cuando hay señal.')
        : 'Cada teléfono guarda lo suyo y no se ven entre ellos. Es lo normal en esta fase; se conecta desde Ajustes cuando exista el Worker.') +
      '</p>' +
    '</div>' +
    '<div class="pf-fila-acc">' +
      boton('Ajustes', 'btn btn-gho', { tipo: 'ir', datos: { ruta: 'ajustes' } }) +
    '</div></div>');

  if (pend > 0) {
    filas.push('<div class="pf-fila">' +
      '<span class="pf-fila-ico urge">' + ico('i-subir') + '</span>' +
      '<div class="pf-fila-tx">' +
        '<p class="pf-fila-t">' + pend + (pend === 1 ? ' cambio' : ' cambios') + ' en la bandeja de salida</p>' +
        '<p class="pf-fila-d">Están guardados aquí. Se mandan cuando haya a dónde: nada de esto se pierde por no tener puente.</p>' +
      '</div></div>');
  }

  return '<div class="card"><div class="card-h"><h2>' + ico('i-ajustes') +
    ' Este dispositivo <span class="folio">' + esc(Prefs.dispositivo()) + '</span></h2></div>' +
    '<div class="card-b">' + filas.join('') + '</div></div>';
}

/* ----- La verdad -----
   Va al final, en letra chica y sin caja, y va SIEMPRE. Un usuario que cree que la app le
   va a avisar sola deja de abrirla, y el día que se pierde una instalación por eso, el
   problema no fue el aviso que faltó: fue la promesa que nadie hizo en voz alta. */
function laVerdad() {
  return '<p class="pf-nota">Estos avisos se calculan al abrir la plataforma. ' +
    'Los de la agenda también te llegan como alarma del calendario del teléfono; ' +
    'los demás solo están aquí.</p>';
}

/* ----- Las cuentas de la barra -----
   Lo que hay que ATENDER en cada módulo, no lo que hay adentro. Una instalación de hoy ya
   agendada no necesita nada de nadie; un proyecto sin fecha y una instalación que ya pasó
   sin marcarse sí. Si la cuenta contara lo que hay, la barra tendría un número permanente
   y un número permanente deja de ser un aviso. */
function publicarCuentas(d) {
  if (!_ctx || typeof _ctx.ponerCuenta !== 'function') return;
  _ctx.ponerCuenta('agenda', d.sinFecha.length + d.vencidas.length);
  /* Se juntan por material y no se suman: un material que está bajo mínimo Y lo pide un
     proyecto es UNA cosa que comprar, y contarlo dos veces manda a fabricación a buscar un
     renglón que no existe. */
  const ids = new Set();
  for (const f of d.porComprar) if (f.material_id) ids.add(f.material_id);
  for (const b of d.bajo) if (b.material_id || b.id) ids.add(b.material_id || b.id);
  _ctx.ponerCuenta('material', ids.size);
}

/* ----- La barra fija del teléfono -----
   Solo cuando hay algo que decidir, y solo eso. En el celular la tarjeta de A6 se va para
   arriba en cuanto hay cuatro avisos, y el botón fijo la trae de vuelta con el foco puesto
   en el primer «Se ganó». Cuando no hay nada que decidir la barra no existe: un botón que
   no lleva a ningún lado ocupa el lugar donde el pulgar espera encontrar algo. */
function pintarMbar(n) {
  const b = $('pf-mbar');
  if (!b) return;
  if (!n) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); return; }
  b.innerHTML = '<button type="button" class="btn btn-ok" data-decidir>' +
    (n === 1 ? 'Decidir la cotización pendiente' : 'Decidir ' + n + ' cotizaciones') +
    '</button>';
  b.hidden = false;
  b.onclick = ev => {
    if (!ev.target.closest('[data-decidir]')) return;
    const card = _cont && _cont.querySelector('.pf-decidir');
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const primero = card.querySelector('[data-acc]');
    if (primero) { try { primero.focus({ preventScroll: true }); } catch (_) {} }
  };
  ajustarAltoBarra();
}

/* ============================================================================
   Las acciones
   ============================================================================ */

async function alTocar(ev) {
  if (ev.target.closest('[data-recargar]')) { location.reload(); return; }
  const b = ev.target.closest('[data-acc]');
  if (!b) return;
  ev.preventDefault();
  const ac = _acciones[Number(b.dataset.acc)];
  if (!ac) return;
  b.disabled = true;
  try { await ejecutar(ac); } catch (e) {
    /* Una mutación de la capa de datos no lanza nunca; si algo llega aquí es un error de
       programación de esta pantalla, y se dice en vez de dejar el botón muerto. */
    console.error('la acción del aviso falló', e);
    toast('Algo se rompió al hacer eso. Recarga la plataforma y vuelve a intentarlo.', 'err', 4600);
  }
  if (b.isConnected) b.disabled = false;
}

async function ejecutar(ac) {
  const dd = ac.datos || {};

  switch (ac.tipo) {
    /* ----- Ir a otro módulo ----- */
    case 'ir':
      if (_ctx && dd.ruta) _ctx.ir(dd.ruta);
      return;

    /* ----- Copiar un mensaje que no tiene a quién mandarse ----- */
    case 'copiar':
      copiarTexto(dd.texto || '', 'Mensaje copiado — pégalo en la conversación');
      return;

    /* ----- Respaldar ----- */
    case 'respaldar':
      if (_ctx && typeof _ctx.respaldar === 'function') await _ctx.respaldar();
      await marcarYRecargar(ac.rid);
      return;

    /* ----- El eslabón: se ganó / no se dio ----- */
    case 'ganar':
      abrirGanar(dd.folio);
      return;
    case 'descartar':
      abrirDescartar(dd.folio);
      return;

    /* ----- Poner o mover la fecha -----
       La captura vive en esta pantalla y no manda a la agenda a buscar el proyecto: el
       aviso ya sabe de cuál habla, y hacer que el usuario lo vuelva a encontrar en otra
       lista es cómo un aviso de un toque se vuelve uno de cinco. */
    case 'agendar':
      abrirFecha({ modo: 'agendar', proyecto_id: dd.proyecto_id, rid: ac.rid, titulo: ac.titulo });
      return;
    case 'reagendar':
      abrirFecha({ modo: 'reagendar', inst_id: dd.inst_id, rid: ac.rid, titulo: ac.titulo });
      return;

    /* ----- Ya se instaló ----- */
    case 'marcar_hecha': {
      const r = await Agenda.marcar(dd.inst_id, 'hecha');
      if (avisarResultado(r, 'Marcada como instalada')) await marcarYRecargar(ac.rid);
      return;
    }

    /* ----- Material ----- */
    case 'recalcular': {
      const r = await Material.recalcular(dd.proyecto_id);
      if (avisarResultado(r, lineasDe(r) + ' de material calculadas')) await marcarYRecargar(ac.rid);
      return;
    }
    case 'resincronizar': {
      const r = await Proyectos.resincronizar(dd.proyecto_id);
      if (avisarResultado(r, 'El proyecto quedó con las partidas de hoy')) await marcarYRecargar(ac.rid);
      return;
    }

    /* ----- Aceptar la constante que propuso la calibración -----
       Un toque, sin formulario: es lo que el propio sistema calculó con cinco correcciones
       que dicen lo mismo, y pedir una justificación escrita para aceptarlo convertiría el
       bucle de calibración en un trámite que nadie hace. La nota la escribe material.js. */
    case 'constante': {
      const r = await Material.guardarConstante(dd.clave, dd.valor);
      if (avisarResultado(r, dd.clave + ' quedó en ' + dd.valor + ' — los cálculos que siguen ya la usan')) {
        await marcarYRecargar(ac.rid);
      }
      return;
    }

    /* ----- Dejar el aviso como está ----- */
    case 'descartar_aviso': {
      const r = await Reglas.descartar(ac.rid);
      if (avisarResultado(r, 'Listo, no vuelve a preguntar')) await recargar();
      return;
    }

    /* ----- La fila de 15 columnas para Notion -----
       El botón que la arma está probado en producción y vive en la ficha del proyecto
       (§8.2). Aquí NO se reimplementa: dos versiones del mismo formato divergen y la que
       se pega en la base de tres años sería la que nadie probó. Se lleva al usuario a
       donde está el botón y se le dice qué apretar. */
    case 'tsv':
      if (_ctx) _ctx.ir('proyectos');
      toast('Abre el proyecto y usa «Copiar fila para Notion»', '', 5200);
      return;

    default:
      toast('Esa acción todavía no está conectada en esta pantalla', 'err', 4200);
  }
}

function lineasDe(r) {
  const n = r && r.ok && r.valor ? Number(r.valor.lineas) : 0;
  return isFinite(n) && n > 0 ? String(n) + (n === 1 ? ' línea' : ' líneas') : 'Las líneas';
}

/* «Ya lo hice» se guarda para que el aviso no vuelva entre que se hizo y que la regla se
   entera. Casi todas las reglas dejan de producirlo solas —hay proyecto, hay fecha, hay
   material—, pero «casi» quiere decir que en el hueco el usuario vería otra vez el renglón
   que acaba de atender, y ahí es donde se aprende a desconfiar de la lista. */
async function marcarYRecargar(rid) {
  if (rid) { try { await Reglas.atender(rid); } catch (_) {} }
  await recargar();
}

/* ============================================================================
   El modal: la única captura de esta pantalla
   ============================================================================ */

function abrirPide(html, estado) {
  const capa = $('pf-pide');
  if (!capa) return;
  capa.innerHTML = '<div class="pf-panel">' + html + '</div>';
  _pide = estado;
  abrirCapa('pf-pide', { hist: true });
}

function cerrarPide() {
  _pide = null;
  cerrarCapa('pf-pide');
  const capa = $('pf-pide');
  if (capa) capa.innerHTML = '';
}

function cabeza(titulo) {
  return '<div class="pf-panel-h"><h2>' + esc(titulo) + '</h2>' +
    '<button type="button" class="pf-cerrar" data-pide="cerrar" aria-label="Cerrar">' +
    ico('i-cerrar') + '</button></div>';
}

/* ----- «Se ganó» -----
   Pide UNA fecha y nada más, prellenada, igual que el campo `rv-fecha` del modal de
   Registrar Venta del cotizador: es la misma fecha que el director teclea en Notion de
   todas formas. Y se puede dejar en blanco: el proyecto es el dato irrecuperable —«esta
   cotización se vendió» no está escrito en ningún otro sistema— y perderlo por no saber
   todavía el día sería tener las prioridades al revés. Si queda sin fecha, A7 lo nombra a
   las 48 horas. */
function abrirGanar(folio) {
  const e = Cot.porFolio(folio);
  if (!e) {
    toast('«' + folio + '» ya no está en el historial de este dispositivo. Ábrelo en el cotizador para ver qué pasó.', 'err', 5200);
    return;
  }
  const total = Prefs.veDinero() ? Cot.totalVendido(e) : 0;
  const quien = [e.cliente, e.proy].filter(Boolean).join(' — ') || 'sin cliente';

  abrirPide(
    cabeza(String(folio) + ' se ganó') +
    '<div class="pf-panel-b">' +
      '<dl class="pf-dato"><dt>De quién</dt><dd>' + esc(quien) + '</dd></dl>' +
      (total > 0 ? '<dl class="pf-dato"><dt>Lo autorizado</dt><dd>' + esc(money(total)) + '</dd></dl>' : '') +
      (e.entrega ? '<dl class="pf-dato"><dt>Lo que se le prometió</dt><dd>' + esc(e.entrega) + '</dd></dl>' : '') +
      '<div class="fld"><label for="pf-ganar-fecha">¿Qué día se instala?</label>' +
        '<input type="date" id="pf-ganar-fecha" value="' + esc(hoyISO()) + '"></div>' +
      '<p class="hintnote">Es la única fecha que la plataforma te pide. Si todavía no hay día, bórrala: el proyecto se guarda igual y te lo recuerda a las 48 horas.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-ok" data-pide="ganar">Guardar el proyecto</button>' +
    '</div>',
    { modo: 'ganar', folio: String(folio) });
}

/* ----- «No se dio» -----
   Pregunta una vez porque cierra una venta: un dedo que resbala en la lista dejaría la
   cotización marcada como perdida, y volver de ahí no es un botón. El motivo es opcional y
   sirve para lo que hoy no se puede leer en ningún lado: cuánto se dejó de vender y por
   qué. */
function abrirDescartar(folio) {
  abrirPide(
    cabeza('¿' + String(folio) + ' no se dio?') +
    '<div class="pf-panel-b">' +
      '<p class="pf-fila-d">Queda la constancia con su importe y sus partidas, y la plataforma deja de preguntarte por ella. No desaparece del cotizador.</p>' +
      '<div class="fld"><label for="pf-desc-motivo">¿Por qué? (opcional)</label>' +
        '<textarea id="pf-desc-motivo" rows="2" placeholder="Se fue con otro proveedor, ya no lo va a hacer, no contestó…"></textarea></div>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Mejor no</button>' +
      '<button type="button" class="btn btn-dgr" data-pide="descartar">Sí, no se dio</button>' +
    '</div>',
    { modo: 'descartar', folio: String(folio) });
}

/* ----- Poner o mover una fecha ----- */
function abrirFecha(est) {
  const mover = est.modo === 'reagendar';
  abrirPide(
    cabeza(mover ? 'Mover la instalación' : 'Poner la fecha') +
    '<div class="pf-panel-b">' +
      '<p class="pf-fila-d">' + esc(est.titulo || '') + '</p>' +
      '<div class="fld"><label for="pf-fecha-dia">Día</label>' +
        '<input type="date" id="pf-fecha-dia" value="' + esc(hoyISO()) + '"></div>' +
      '<div class="fld"><label for="pf-fecha-hora">Hora (se puede dejar en blanco)</label>' +
        '<input type="time" id="pf-fecha-hora"></div>' +
      (mover ? '<div class="fld"><label for="pf-fecha-motivo">¿Por qué se movió? (opcional)</label>' +
        '<input type="text" id="pf-fecha-motivo" placeholder="Llovió, el local estaba cerrado…"></div>' : '') +
      '<p class="hintnote">Sin hora, el evento del calendario sale como de todo el día y la agenda dice «sin hora». Es una respuesta válida.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-pri" data-pide="fecha">' + (mover ? 'Mover' : 'Guardar la fecha') + '</button>' +
    '</div>',
    est);
}

async function alTocarPide(ev) {
  const b = ev.target.closest('[data-pide]');
  if (!b || !_pide) return;
  ev.preventDefault();
  const que = b.dataset.pide;

  if (que === 'cerrar') { cerrarPide(); return; }

  b.disabled = true;
  try {
    if (que === 'ganar') await hacerGanar();
    else if (que === 'descartar') await hacerDescartar();
    else if (que === 'fecha') await hacerFecha();
  } catch (e) {
    console.error('la captura falló', e);
    toast('Algo se rompió al guardar. Recarga la plataforma y vuelve a intentarlo.', 'err', 4600);
  }
  if (b.isConnected) b.disabled = false;
}

async function hacerGanar() {
  const folio = _pide.folio;
  const e = Cot.porFolio(folio);
  if (!e) { toast('Esa cotización ya no está en el historial de este dispositivo', 'err', 4600); return; }
  const f = $('pf-ganar-fecha');
  const fecha = f ? String(f.value || '').trim() : '';

  const r = await Proyectos.ganar(e, fecha ? { fecha_instalacion: fecha } : {});
  if (!avisarResultado(r)) return;

  cerrarPide();
  toast(fecha
    ? 'Listo. Ya es proyecto, con material calculado y con fecha del ' + fmtFecha(fecha)
    : 'Listo. Ya es proyecto, con su material calculado. Falta la fecha.', 'ok', 4600);
  await recargar();
}

async function hacerDescartar() {
  const folio = _pide.folio;
  const t = $('pf-desc-motivo');
  const r = await Proyectos.descartar(folio, t ? String(t.value || '').trim() : '');
  if (!avisarResultado(r)) return;
  /* El folio se guarda antes de cerrar: `cerrarPide` borra `_pide`, y el aviso emergente se
     arma después. Sin esto el mensaje decía «Listo» a secas justo en la acción que más
     necesita confirmar de qué cotización habla. */
  cerrarPide();
  toast(folio + ': queda la constancia y no vuelve a preguntar', 'ok', 4200);
  await recargar();
}

async function hacerFecha() {
  const d = $('pf-fecha-dia'), h = $('pf-fecha-hora'), m = $('pf-fecha-motivo');
  const fecha = d ? String(d.value || '').trim() : '';
  const hora = h ? String(h.value || '').trim() : '';
  if (!fecha) { toast('Falta el día. Es el único dato de esta pantalla.', 'err', 4200); return; }

  const r = _pide.modo === 'reagendar'
    ? await Agenda.reagendar(_pide.inst_id, { fecha, hora: hora || null, motivo: m ? String(m.value || '').trim() : '' })
    : await Agenda.agendar(_pide.proyecto_id, { fecha, hora: hora || null });
  if (!avisarResultado(r)) return;

  const rid = _pide.rid;
  cerrarPide();
  toast('Queda para el ' + fmtFechaDia(fecha) + (hora ? '' : ', sin hora'), 'ok', 4200);
  await marcarYRecargar(rid);
}
