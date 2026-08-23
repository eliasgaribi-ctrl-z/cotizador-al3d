/* ============================================================================
   Agenda — el calendario de instalaciones, y la única captura humana del sistema.

   Todo lo demás en la plataforma se deriva de algo que ya existía. Aquí no: el día que se
   instala lo sabe una persona y nadie más. Por eso esta pantalla se escribió con una sola
   obsesión, que es no pedir un segundo dato, y con tres decisiones que se ven en todo el
   archivo:

   1. AGENDAR ES UN TOQUE Y MEDIO. Se toca un día libre de la rejilla —o el botón de la
      barra— y la fecha ya viene puesta; el proyecto se elige de la lista de los que no
      tienen día; la duración viene derivada del tipo de trabajo. La hora es OPCIONAL y la
      pantalla lo dice con palabras: sin hora es un evento de todo el día, y eso es normal
      porque casi siempre depende de que el cliente o la plaza confirmen el acceso. Si
      volverla obligatoria tuviera algún efecto medible, sería que alguien inventara
      «10:00» para poder guardar, y a partir de ahí la agenda diría cosas que nadie prometió.

   2. EL .ics NO ES UNA EXPORTACIÓN, ES LA AUTOMATIZACIÓN. Es lo único de la fase 1 que
      llega a un teléfono sin que nadie abra la app: las alarmas de −3 días, −1 día y −30
      minutos las dispara el calendario del sistema. Por eso el botón se vuelve a ofrecer
      justo después de agendar, en el mismo panel: si ese archivo no se importa, la fecha
      quedó guardada y nadie se va a acordar de ella.

   3. ESTA PANTALLA NO CALCULA NADA. El semáforo sale de `Agenda.delMes`/`delDia`, la
      duración de `Agenda.duracionSugerida`, los textos de WhatsApp de `Reglas.mensajeWa`,
      el archivo de `Ics`. Si aquí se decidiera cuándo falta material habría dos respuestas
      a la misma pregunta, y la que se pinta sería la que nadie probó.
   ============================================================================ */

import * as DB from '../datos/db.js';
import * as Prefs from '../datos/prefs.js';
import * as Agenda from '../datos/agenda.js';
import * as Proyectos from '../datos/proyectos.js';
import * as Reglas from '../datos/reglas.js';
import * as Ics from '../nucleo/ics.js';
import * as Gcal from '../nucleo/gcal.js';
import { $, esc, ico, money, toast, avisarResultado, vacio, hoyISO, partesISO, fechaLocal,
         fmtFecha, fmtFechaDia, fmtHora, cuando, diasHasta, segmento, chip, abrirCapa,
         cerrarCapa, compartirArchivo, copiarTexto, linkWa, ajustarAltoBarra }
  from '../nucleo/ui.js';

/* ----- Estado del módulo -----
   Vive aquí y no en el DOM: la rejilla se rehace completa en cada toque, y un estado
   guardado en atributos se iría con el nodo que lo llevaba. */
let _cont = null;
let _ctx = null;
let _vista = 'mes';          // mes|semana|lista
let _ancla = hoyISO();       // el mes o la semana que se está viendo
let _dia = null;             // el día abierto debajo de la rejilla
let _d = null;               // lo último que se leyó
let _hoja = null;            // estado del panel de agendar
let _pide = null;            // estado del panel de preguntar
let _soloCobro = false;      // el filtro de PAGOS
let _pasadas = false;        // en la vista de lista, incluir lo que ya pasó
let _oyendo = false;

const MIME_ICS = 'text/calendar;charset=utf-8';

/* Los mismos tres estados que Inicio cuenta como «ya pasó y nadie la marcó». Se escribe
   igual en las dos pantallas para que el globito de la pestaña no cambie de valor solo
   porque se cambió de módulo. */
const VIVAS_SIN_MARCAR = ['propuesta', 'confirmada', 'reagendada'];

/* ============================================================================
   Montar y desmontar
   ============================================================================ */

export async function montar(contenedor, ctx) {
  _cont = contenedor;
  _ctx = ctx;

  /* Un oyente delegado por contenedor y uno por capa. La rejilla del mes son cuarenta y dos
     botones que se rehacen cada vez que se toca uno: un oyente por celda serían cuarenta y
     dos oyentes tirados a la basura en cada repintado, y los del repintado anterior siguen
     enganchados a nodos que ya nadie ve. */
  _cont.addEventListener('click', alTocar);
  const hoja = $('pf-hoja');
  if (hoja) { hoja.addEventListener('click', alTocarHoja); hoja.addEventListener('input', alEscribirHoja); }
  const pide = $('pf-pide');
  if (pide) pide.addEventListener('click', alTocarPide);
  _oyendo = true;

  /* La base cerrada no se pinta como un calendario vacío. «No tienes instalaciones» y «la
     base no abrió» son la misma pantalla en blanco, y la diferencia entre las dos es la
     diferencia entre estar tranquilo y perder una tarde buscando datos que están enteros. */
  if (!DB.estado().ok) {
    _cont.innerHTML = vacio('No se pudo abrir la base de este dispositivo',
      DB.motivoTexto(),
      '<button type="button" class="btn btn-pri" data-recargar>Recargar</button>');
    return;
  }

  _cont.innerHTML = '<div class="vacio">' + ico('i-reloj') +
    '<p class="vacio-t">Leyendo la agenda…</p></div>';
  await recargar();
}

export function desmontar() {
  if (_cont && _oyendo) _cont.removeEventListener('click', alTocar);
  const hoja = $('pf-hoja');
  if (hoja) { hoja.removeEventListener('click', alTocarHoja); hoja.removeEventListener('input', alEscribirHoja); }
  const pide = $('pf-pide');
  if (pide) pide.removeEventListener('click', alTocarPide);
  /* La barra fija se limpia aquí y no en el módulo que sigue: si el siguiente no tiene
     acción principal, el botón de agendar se quedaría flotando encima de su pantalla y el
     primer dedo del día lo apretaría creyendo que es de lo que está viendo. */
  const b = $('pf-mbar');
  if (b) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); }
  /* Las capas son del documento, no de este módulo. Si se cambió de rol con el panel de
     agendar enfrente, dejarlo puesto bloquea la pantalla nueva con un velo que nadie sabe
     de dónde salió. */
  if (_hoja) cerrarHoja();
  if (_pide) cerrarPide();
  _cont = null; _ctx = null; _d = null; _dia = null; _oyendo = false;
}

/* ============================================================================
   Fechas — sobre los campos, nunca con new Date(iso)
   ============================================================================ */

const p2 = n => String(n).padStart(2, '0');
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                   'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/* La semana empieza en LUNES. Un sábado y un domingo son el mismo fin de semana, y con la
   semana empezando en domingo quedan en los dos extremos opuestos de la rejilla: la del
   domingo es la que nadie ve. */
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Sumar días con `fechaLocal`, que ancla a mediodía. `new Date('2026-08-23')` se lee como
 *  UTC y en México devuelve el día anterior: ese error cuesta un día de instalación. */
function masDias(iso, n) {
  const f = fechaLocal(iso);
  if (!f) return iso;
  f.setDate(f.getDate() + n);
  return f.getFullYear() + '-' + p2(f.getMonth() + 1) + '-' + p2(f.getDate());
}

/** Sumar meses cayendo siempre en el día 1. Sin eso, del 31 de enero un mes es el 3 de
 *  marzo, y avanzar mes por mes desde una fecha alta se salta febrero entero. */
function masMeses(iso, n) {
  const p = partesISO(iso);
  if (!p) return iso;
  let m = p.m - 1 + n;
  const a = p.a + Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return a + '-' + p2(m + 1) + '-01';
}

const ultimoDia = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/** El lunes de la semana que contiene `iso`. */
function iniSemana(iso) {
  const f = fechaLocal(iso);
  return f ? masDias(iso, -((f.getDay() + 6) % 7)) : iso;
}

const etiquetaMes = iso => {
  const p = partesISO(iso);
  return p ? MES_LARGO[p.m - 1] + ' ' + p.a : '';
};

/* ============================================================================
   Leer
   ============================================================================ */

/** El semáforo de cada día de un rango, pidiéndolo por meses completos.
 *
 *  `Agenda.delMes` lee el almacén UNA vez para los treinta días; preguntar día por día
 *  llamaría a la lista de compra treinta veces seguidas, y eso es lo que convierte un
 *  calendario en un celular en una pantalla que tarda. El tope de doce meses es por si
 *  alguien agenda a dos años: más allá el punto no se pinta, y como el punto nunca es la
 *  única forma de saberlo, lo único que se pierde es el adorno. */
async function mapaSemaforo(desde, hasta) {
  const mapa = new Map();
  if (!partesISO(desde) || !partesISO(hasta) || hasta < desde) return mapa;
  let cursor = desde.slice(0, 8) + '01';
  for (let i = 0; i < 12 && cursor <= hasta; i++) {
    const p = partesISO(cursor);
    const mes = await Agenda.delMes(p.a, p.m);
    for (const dia of (mes.dias || [])) mapa.set(dia.fecha, dia.semaforo);
    cursor = masMeses(cursor, 1);
  }
  return mapa;
}

async function leer() {
  const hoy = hoyISO();

  /* Las dos cuentas de arriba se leen en las tres vistas. «Cuántos ganados no tienen día»
     es la razón por la que alguien entra a esta pantalla, y enseñarla solo en la vista de
     mes obligaría a cambiar de vista para enterarse. */
  const [sinFecha, vencidas] = await Promise.all([
    Proyectos.listar({ sinFecha: true, vivos: true }),
    Agenda.listar({ hasta: masDias(hoy, -1), estados: VIVAS_SIN_MARCAR, conProyecto: true }),
  ]);

  const d = { hoy, sinFecha: sinFecha || [], vencidas: vencidas || [],
              mes: null, filas: [], sem: new Map(), rango: null, dia: [] };

  if (_vista === 'mes') {
    const p = partesISO(_ancla) || partesISO(hoy);
    d.mes = await Agenda.delMes(p.a, p.m);
    for (const x of (d.mes.dias || [])) d.sem.set(x.fecha, x.semaforo);

  } else if (_vista === 'semana') {
    const ini = iniSemana(_ancla), fin = masDias(ini, 6);
    d.rango = { ini, fin };
    d.filas = await Agenda.listar({ desde: ini, hasta: fin, conProyecto: true });
    d.sem = await mapaSemaforo(ini, fin);

  } else {
    /* La lista arranca hoy. Una agenda que abre enseñando las instalaciones de marzo obliga
       a desplazarse para llegar a lo que viene, que es lo único que se venía a ver. */
    d.filas = await Agenda.listar(_pasadas ? { conProyecto: true }
                                           : { desde: hoy, conProyecto: true });
    if (d.filas.length) {
      d.sem = await mapaSemaforo(d.filas[0].fecha, d.filas[d.filas.length - 1].fecha);
    }
  }

  if (_dia) d.dia = await Agenda.delDia(_dia, { incluirCanceladas: true });
  return d;
}

async function recargar() {
  if (!_cont) return;
  const d = await leer();
  if (!_cont) return;        // se cambió de módulo mientras se leía
  _d = d;
  pintar();
}

/* ============================================================================
   Quién puede qué (§8.3)
   ============================================================================ */

/* Dirección agenda y es la única que agenda. Fabricación PROPONE: la capa de datos le
   guarda la instalación en `propuesta`, y esta pantalla se lo dice ANTES de que le dé al
   botón, no después. Pagos no toca la agenda: no es su trabajo y un movimiento accidental
   aquí cuesta un día de camioneta. */
const puedeAgendar = () => Prefs.rol() !== 'pagos';
const soloPropone  = () => Prefs.rol() === 'fabricacion';
/* El semáforo es la pregunta de fabricación mirando el mes: ¿llego o no llego? Pagos no la
   tiene, porque para él la agenda contesta «qué día entra dinero», y un punto de color que
   no puede accionar es ruido. */
const veSemaforo   = () => Prefs.rol() !== 'pagos';
const veWa         = () => Prefs.rol() !== 'pagos';

/** El filtro de PAGOS: solo los días con cobro. */
function visibles(insts) {
  const l = (insts || []).filter(Boolean);
  if (!_soloCobro) return l;
  return l.filter(i => i.proyecto && Number(i.proyecto.pago_pendiente) > 0);
}

const CLASE_ICO = { ok: ' bien', falta: ' urge', grave: ' mal' };
const PALABRA_SEM = { ok: 'Material listo', falta: 'Falta material', grave: 'Falta y es ya' };

/* ============================================================================
   Pintar
   ============================================================================ */

function pintar() {
  if (!_cont || !_d) return;
  const d = _d;

  _cont.innerHTML =
    pintarCuentas(d) +
    segmento([{ v: 'mes', t: 'Mes' }, { v: 'semana', t: 'Semana' }, { v: 'lista', t: 'Lista' }],
             _vista, 'data-vista') +
    pintarFiltros() +
    '<div class="card"><div class="card-b">' +
      (_vista === 'mes' ? pintarMes(d) : _vista === 'semana' ? pintarSemana(d) : pintarLista(d)) +
    '</div></div>' +
    pintarExportar(d);

  pintarMbar(d);
  publicarCuentas(d);
}

/* ----- Las cuentas de arriba -----
   Lo primero que se lee al entrar: «6 por instalar · 2 sin fecha» contesta la pantalla
   entera antes de mirar la rejilla. */
function pintarCuentas(d) {
  const hoy = d.hoy;
  const todas = d.mes ? (d.mes.dias || []).flatMap(x => x.instalaciones || []) : d.filas;
  const porVenir = visibles(todas).filter(i => i.fecha >= hoy && i.estado !== 'cancelada').length;

  const c = [unaCuenta(porVenir, _vista === 'mes' ? 'Por instalar este mes' : 'Por instalar', false),
             unaCuenta(d.sinFecha.length, 'Ganados sin fecha', d.sinFecha.length > 0)];
  if (d.vencidas.length) c.push(unaCuenta(d.vencidas.length, 'Ya pasaron y nadie las marcó', true));
  return '<div class="pf-cuentas">' + c.join('') + '</div>';
}

const unaCuenta = (n, txt, urge) =>
  '<p class="pf-cuenta' + (urge ? ' urge' : '') + '"><b>' + n + '</b>' + esc(txt) + '</p>';

function pintarFiltros() {
  const c = [];
  /* El filtro de cobro solo existe para PAGOS, y arranca APAGADO. `pago_pendiente` es una
     fórmula de Notion y en fase 1 está en null en todas las filas: encendido por default,
     pagos abriría la agenda, vería un calendario en blanco y sacaría la conclusión obvia
     —«no hay nada agendado»— que además es falsa. */
  if (Prefs.rol() === 'pagos') c.push(chip('Solo los días con cobro', _soloCobro, 'data-cobro="1"'));
  if (_vista === 'lista') c.push(chip('Incluir lo que ya pasó', _pasadas, 'data-pasadas="1"'));
  return c.length ? '<div class="ag-filtros">' + c.join('') + '</div>' : '';
}

/* ----- Vista de mes -----
   La rejilla contesta de un barrido dos cosas y nada más: qué días hay camioneta, y en
   cuáles no va a llegar el material. El detalle está a un toque, en la lista del día. */
function pintarMes(d) {
  const mes = d.mes;
  if (!mes) return '';
  const primero = mes.anio + '-' + p2(mes.mes) + '-01';
  const dias = mes.dias || [];
  const hueco = (fechaLocal(primero).getDay() + 6) % 7;      // lunes = 0
  const anterior = masMeses(primero, -1);
  const pa = partesISO(anterior);
  const largoAnterior = ultimoDia(pa.a, pa.m);

  const celdas = [];
  for (let i = hueco; i > 0; i--) celdas.push(celdaFuera(largoAnterior - i + 1));
  for (const dia of dias) celdas.push(celdaDia(dia, d));
  /* Se rellena hasta completar la última semana. Sin esto la fila final queda con celdas de
     distinto ancho —el grid las estira— y una rejilla que se ve rota es lo que hace dudar
     de si falta un día. */
  const sobran = celdas.length % 7 === 0 ? 0 : 7 - (celdas.length % 7);
  for (let i = 1; i <= sobran; i++) celdas.push(celdaFuera(i));

  return '<div class="cal-cab">' +
      '<h2 class="cal-mes">' + esc(etiquetaMes(primero)) + '</h2>' +
      '<button type="button" class="cal-nav" data-hoy aria-label="Ir al mes de hoy">' + ico('i-hoy') + '</button>' +
      '<button type="button" class="cal-nav" data-mueve="-1" aria-label="Mes anterior">' + ico('i-atras') + '</button>' +
      '<button type="button" class="cal-nav" data-mueve="1" aria-label="Mes siguiente">' + ico('i-horiz') + '</button>' +
    '</div>' +
    '<div class="cal-rej">' +
      DOW.map(x => '<div class="cal-dow" aria-hidden="true">' + x + '</div>').join('') +
      celdas.join('') +
    '</div>' +
    (mes.total ? '' : '<p class="hintnote" style="margin-top:var(--e3)">No hay nada agendado en ' +
      esc(etiquetaMes(primero)) + '. Toca un día para agendar en él.</p>') +
    pintarDiaAbierto(d);
}

const celdaFuera = n =>
  '<button type="button" class="cal-dia fuera" disabled aria-hidden="true">' +
  '<span class="cal-n">' + n + '</span></button>';

function celdaDia(dia, d) {
  const insts = visibles(dia.instalaciones);
  const vivas = insts.filter(i => i.estado !== 'cancelada');
  const sem = veSemaforo() && vivas.length ? dia.semaforo : null;
  const abierto = _dia === dia.fecha;
  const libre = !insts.length && puedeAgendar() && dia.fecha >= d.hoy;

  const evs = insts.slice(0, 3).map(i =>
    '<span class="cal-ev ' + claseEv(i) + '"><span class="tx">' +
      esc((i.hora ? i.hora + ' ' : '') + (i.titulo || '')) + '</span></span>').join('');
  const mas = insts.length > 3 ? '<span class="cal-mas">+' + (insts.length - 3) + '</span>' : '';

  /* El aria-label lleva la respuesta completa: la fecha, cuántas instalaciones y qué dice el
     semáforo. El punto de color es un refuerzo, nunca la única manera de saberlo: uno de
     cada doce hombres no distingue el verde del ámbar, y esto se lee para decidir si hay que
     ir a la vidriería hoy. */
  const etiqueta = [fmtFechaDia(dia.fecha),
    insts.length ? (vivas.length === 1 ? '1 instalación' : vivas.length + ' instalaciones')
                 : 'sin nada agendado',
    sem ? sem.texto : '',
    libre ? 'Tocar para agendar' : '',
  ].filter(Boolean).join('. ');

  return '<button type="button" class="cal-dia' + (dia.hoy ? ' hoy' : '') + '"' +
      ' data-dia="' + dia.fecha + '" aria-label="' + esc(etiqueta) + '"' +
      (abierto ? ' aria-current="date"' : '') + '>' +
      (sem ? '<span class="cal-sem ' + sem.estado + '" title="' + esc(sem.texto) +
        '" aria-hidden="true"></span>' : '') +
      '<span class="cal-n">' + dia.dia + '</span>' + evs + mas +
    '</button>';
}

/** La clase del filete de color: la etapa de obra del proyecto, y `off` si la instalación se
 *  canceló. Una cancelada pintada igual que una viva es el mes prometiendo una visita que no
 *  va a pasar, y eso se descubre el día que alguien sale a hacerla. */
function claseEv(i) {
  if (i.estado === 'cancelada') return 'off';
  return esc((i.proyecto && i.proyecto.etapa) || 'ganado');
}

/* ----- La lista del día -----
   Lo que la rejilla no puede decir: la hora, la ventana, a quién se busca, dónde es y qué
   botones hay. Se abre tocando un día y se queda abierta al repintar: cerrarla sola
   obligaría a volver a tocar el día después de cada acción. */
function pintarDiaAbierto(d) {
  if (!_dia) return '';
  const insts = visibles(d.dia);
  const sem = d.sem.get(_dia);

  let html = '<div class="dia-lista"><h3 class="dia-t">' + esc(fmtFechaDia(_dia)) +
    ' <span class="pf-cuando' + toneCuando(_dia) + '">' + esc(cuando(_dia)) + '</span></h3>';

  if (veSemaforo() && sem && insts.length) html += renglonSem(sem);

  if (!insts.length) {
    html += '<p class="pf-cuenta">Nada agendado este día.</p>' +
      (puedeAgendar()
        ? '<p><button type="button" class="btn btn-pri pf-btn-corto" data-agendar-en="' + _dia +
          '">Agendar el ' + esc(fmtFecha(_dia)) + '</button></p>'
        : '');
  } else {
    html += insts.map(i => fila(i, i.semaforo || sem)).join('');
    if (puedeAgendar()) {
      html += '<p><button type="button" class="btn btn-gho pf-btn-corto" data-agendar-en="' + _dia +
        '">Agendar otra el ' + esc(fmtFecha(_dia)) + '</button></p>';
    }
  }
  return html + '</div>';
}

const renglonSem = sem =>
  '<p class="ag-sem"><span class="pf-sem ' + sem.estado + '">' +
  esc(PALABRA_SEM[sem.estado] || sem.estado) + '</span> ' + esc(sem.texto) + '</p>';

const toneCuando = iso => {
  const n = diasHasta(iso);
  if (n === null) return '';
  if (n === 0) return ' hoy';
  if (n < 0) return ' tarde';
  return n > 14 ? ' lejos' : '';
};

/* ----- Vista de semana -----
   Siete días, uno debajo del otro. No es la rejilla con celdas más altas a propósito: en un
   teléfono, siete columnas son siete columnas de 45 px, y ahí no cabe una hora ni un nombre.
   Lo que la semana tiene que decir —a qué hora y de quién— solo cabe en renglones. */
function pintarSemana(d) {
  const { ini, fin } = d.rango;
  const porDia = new Map();
  for (const i of visibles(d.filas)) {
    if (!porDia.has(i.fecha)) porDia.set(i.fecha, []);
    porDia.get(i.fecha).push(i);
  }

  let cuerpo = '';
  for (let k = 0; k < 7; k++) {
    const iso = masDias(ini, k);
    const insts = porDia.get(iso) || [];
    const sem = d.sem.get(iso);
    cuerpo += '<div class="dia-lista"><h3 class="dia-t">' + esc(fmtFechaDia(iso)) +
      (iso === d.hoy ? ' <span class="pf-cuando hoy">hoy</span>' : '') + '</h3>';
    if (veSemaforo() && sem && insts.length && sem.estado !== 'ok') cuerpo += renglonSem(sem);
    cuerpo += insts.length
      ? insts.map(i => fila(i, sem)).join('')
      : '<p class="pf-cuenta">Libre.' + (puedeAgendar() && iso >= d.hoy
          ? ' <button type="button" class="btn btn-gho pf-btn-corto" data-agendar-en="' + iso +
            '">Agendar</button>' : '') + '</p>';
    cuerpo += '</div>';
  }

  return '<div class="cal-cab">' +
      '<h2 class="cal-mes">' + esc(fmtFecha(ini) + ' — ' + fmtFecha(fin)) + '</h2>' +
      '<button type="button" class="cal-nav" data-hoy aria-label="Ir a esta semana">' + ico('i-hoy') + '</button>' +
      '<button type="button" class="cal-nav" data-mueve="-1" aria-label="Semana anterior">' + ico('i-atras') + '</button>' +
      '<button type="button" class="cal-nav" data-mueve="1" aria-label="Semana siguiente">' + ico('i-horiz') + '</button>' +
    '</div>' + cuerpo;
}

/* ----- Vista de lista -----
   Todo lo que viene, en orden, sin tener que saber en qué mes cae. Es la que se lee cuando
   alguien pregunta «¿qué sigue?». */
function pintarLista(d) {
  const insts = visibles(d.filas);
  if (!insts.length) {
    return vacio(_pasadas ? 'No hay ninguna instalación en la agenda'
                          : 'No hay nada agendado de hoy en adelante',
      d.sinFecha.length
        ? 'Tienes ' + d.sinFecha.length + (d.sinFecha.length === 1 ? ' proyecto ganado' : ' proyectos ganados') +
          ' sin día. Ponle fecha al primero y aparece aquí, con su alarma para el calendario del teléfono.'
        : 'Cuando marques una cotización como ganada en el cotizador, el proyecto aparece aquí para ponerle día. La fecha es el único dato que la plataforma te pide.',
      puedeAgendar() ? '<button type="button" class="btn btn-pri" data-agendar>Agendar una instalación</button>' : '');
  }

  let html = '', ultimo = '';
  for (const i of insts) {
    if (i.fecha !== ultimo) {
      if (ultimo) html += '</div>';
      html += '<div class="dia-lista"><h3 class="dia-t">' + esc(fmtFechaDia(i.fecha)) +
        ' <span class="pf-cuando' + toneCuando(i.fecha) + '">' + esc(cuando(i.fecha)) + '</span></h3>';
      const sem = d.sem.get(i.fecha);
      if (veSemaforo() && sem && sem.estado !== 'ok') html += renglonSem(sem);
      ultimo = i.fecha;
    }
    html += fila(i, d.sem.get(i.fecha));
  }
  return html + (ultimo ? '</div>' : '');
}

/* ----- El renglón de una instalación -----
   Tres botones y no seis. `Calendario` es la automatización de la fase 1 y va primero;
   `Instalador` es el mensaje que ES la interfaz de quien instala; `Abrir` lleva a todo lo
   demás. Seis botones en un renglón de teléfono son seis botones de 40 px de ancho con el
   texto cortado, y ahí ya nadie sabe cuál es cuál. */
function fila(i, sem) {
  const p = i.proyecto || {};
  const cancelada = i.estado === 'cancelada';
  const claseIco = cancelada ? '' : (veSemaforo() && sem ? (CLASE_ICO[sem.estado] || '') : '');

  const detalle = [];
  if (i.ventana && i.ventana !== 'dia') detalle.push(Agenda.VENTANA_NOMBRE[i.ventana] || i.ventana);
  if (i.estado !== 'confirmada') detalle.push(Agenda.ESTADO_NOMBRE[i.estado] || i.estado);
  if (p.contacto) detalle.push('Buscar a ' + p.contacto);
  const dur = Number(i.duracion_min) > 0 ? Number(i.duracion_min) : 0;
  if (dur) detalle.push(dur >= 60 ? Math.round(dur / 60 * 10) / 10 + ' h' : dur + ' min');

  const mapa = linkMapa(p);
  const dir = String(p.dir_texto || '').replace(/\s*\n\s*/g, ', ');

  /* El saldo solo para quien ve dinero. Para FABRICACIÓN no se difumina: el elemento no
     existe. El difuminado del cotizador es una mampara contra el cliente sentado enfrente,
     no un permiso, y encima es inerte para una cotización ya autorizada. */
  const saldo = Prefs.veDinero() && Number(p.pago_pendiente) > 0
    ? '<br>Saldo por cobrar: ' + esc(money(p.pago_pendiente)) : '';

  const acc = ['<button type="button" class="btn btn-gho" data-acc="ics" data-id="' +
    esc(i.id) + '">Calendario</button>'];
  if (veWa() && !cancelada) {
    acc.push('<button type="button" class="btn btn-gho" data-acc="orden" data-id="' +
      esc(i.id) + '">Instalador</button>');
  }
  acc.push('<button type="button" class="btn btn-gho" data-acc="ficha" data-id="' +
    esc(i.id) + '">Abrir</button>');

  return '<div class="pf-fila">' +
      '<div class="pf-fila-ico' + claseIco + '">' + ico(cancelada ? 'i-cerrar' : 'i-camion') + '</div>' +
      '<div class="pf-fila-tx">' +
        '<div class="pf-fila-t">' + esc(i.hora ? fmtHora(i.hora) : 'Sin hora') + ' · ' +
          esc(i.titulo || 'Proyecto que ya no está') + '</div>' +
        '<div class="pf-fila-d">' + esc(detalle.join(' · ')) +
          (dir ? '<br>' + esc(dir) : '') +
          (mapa ? ' <a href="' + esc(mapa) + '" target="_blank" rel="noopener">Ver en Maps</a>' : '') +
          saldo +
        '</div>' +
      '</div>' +
      '<div class="pf-fila-acc">' + acc.join('') + '</div>' +
    '</div>';
}

/** El link al mapa, con lo que haya: el pin real primero, la búsqueda por texto al final.
 *  Una dirección escrita a mano deja al instalador en la cuadra, y eso ya es más que nada. */
function linkMapa(p) {
  if (p.maps_url) return String(p.maps_url);
  if (p.lat !== null && p.lng !== null && isFinite(p.lat) && isFinite(p.lng)) {
    return 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng;
  }
  const dir = String(p.dir_texto || '').replace(/\s*\n\s*/g, ', ').trim();
  return dir ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(dir) : '';
}

/* ----- La tarjeta de exportar -----
   Es la automatización de la fase 1, y por eso lleva su explicación al lado y no en una
   ayuda escondida: quien no sabe que las alarmas las dispara el teléfono no entiende por qué
   tiene que bajar un archivo, y sin bajarlo la agenda no avisa de nada. */
function pintarExportar(d) {
  const hay = _vista === 'mes'
    ? !!(d.mes && d.mes.total)
    : (d.filas || []).some(i => i.estado !== 'cancelada');
  const titulo = _vista === 'mes' && d.mes ? 'Todo ' + etiquetaMes(d.mes.desde)
               : _vista === 'semana' ? 'Toda la semana' : 'Todo lo que viene';

  let gcalHtml = '';
  if (Gcal.disponible() && Prefs.rol() === 'direccion') {
    gcalHtml = '<div class="pf-fila">' +
      '<div class="pf-fila-ico">' + ico('i-nube') + '</div>' +
      '<div class="pf-fila-tx"><div class="pf-fila-t">Google Calendar está conectado</div>' +
      '<div class="pf-fila-d">Abre una instalación y créala allá: entra sola al calendario de los tres, con sus alarmas. Se crea desde este dispositivo porque las alarmas de Calendar son por persona y no por evento, así que quien no es el dueño del evento no las hereda.</div></div></div>';
  } else if (!Gcal.disponible()) {
    /* Un botón muerto es peor que no tener botón: se aprieta, no pasa nada, y a partir de
       ahí no se vuelve a confiar en ninguno. Se dice qué se puede conectar y dónde. */
    gcalHtml = '<div class="pf-fila">' +
      '<div class="pf-fila-ico">' + ico('i-nube-off') + '</div>' +
      '<div class="pf-fila-tx"><div class="pf-fila-t">Google Calendar se puede conectar</div>' +
      '<div class="pf-fila-d">Conectado, el evento entra solo al calendario de los tres. Mientras no lo esté, el archivo de aquí arriba hace lo mismo a mano y funciona sin cuentas y sin señal.</div></div>' +
      '<div class="pf-fila-acc"><button type="button" class="btn btn-gho" data-acc="ajustes">Cómo se conecta</button></div></div>';
  }

  return '<div class="card"><div class="card-h"><h2>' + ico('i-bajar') +
      'Al calendario del teléfono</h2></div><div class="card-b">' +
    '<div class="pf-fila">' +
      '<div class="pf-fila-ico">' + ico('i-agenda') + '</div>' +
      '<div class="pf-fila-tx"><div class="pf-fila-t">' + esc(titulo) + '</div>' +
      '<div class="pf-fila-d">' + (hay
        ? 'Un solo archivo con todas las instalaciones y sus alarmas. Se importa una vez.'
        : 'Aquí no hay nada agendado todavía, así que no hay archivo que bajar.') +
      '</div></div>' +
      '<div class="pf-fila-acc"><button type="button" class="btn btn-pri" data-acc="ics-mes"' +
        (hay ? '' : ' disabled') + '>Bajar</button></div>' +
    '</div>' +
    '<div class="pf-fila">' +
      '<div class="pf-fila-ico">' + ico('i-recalibrar') + '</div>' +
      '<div class="pf-fila-tx"><div class="pf-fila-t">El ritmo, que se repite solo</div>' +
      '<div class="pf-fila-d">«Comparte el día» de lunes a viernes a las 6 de la tarde, y el conteo del almacén el día 1 de cada mes. Se importa una vez y sigue sonando en 2029.</div></div>' +
      '<div class="pf-fila-acc"><button type="button" class="btn btn-gho" data-acc="ics-ritmo">Bajar</button></div>' +
    '</div>' +
    gcalHtml +
    '<p class="pf-nota">Las alarmas —3 días antes para revisar el material, 1 día antes para confirmar con el cliente y media hora antes de salir, 2 horas si la instalación es de noche— las dispara el calendario de tu teléfono, no esta plataforma. Por eso suenan aunque nadie la abra y aunque no haya señal.</p>' +
    '</div></div>';
}

/* ----- La barra fija del teléfono -----
   Una sola acción, la de esta pantalla: agendar. Cuando el rol no agenda, la barra no
   existe: un botón que no lleva a ningún lado ocupa el lugar donde el pulgar espera
   encontrar algo. */
function pintarMbar(d) {
  const b = $('pf-mbar');
  if (!b) return;
  if (!puedeAgendar()) { b.hidden = true; b.innerHTML = ''; b.onclick = null; ajustarAltoBarra(); return; }
  const n = d.sinFecha.length;
  b.innerHTML = '<button type="button" class="btn btn-pri" data-abrir-agendar>' +
    (n ? (n === 1 ? 'Agendar el proyecto sin fecha' : 'Agendar (' + n + ' sin fecha)')
       : 'Agendar una instalación') + '</button>';
  b.hidden = false;
  b.onclick = ev => { if (ev.target.closest('[data-abrir-agendar]')) abrirAgendar(null); };
  ajustarAltoBarra();
}

/** La cuenta de la pestaña: los mismos dos números que publica Inicio, escritos igual, para
 *  que el globito no cambie de valor solo porque se cambió de módulo. */
function publicarCuentas(d) {
  if (!_ctx || typeof _ctx.ponerCuenta !== 'function') return;
  _ctx.ponerCuenta('agenda', d.sinFecha.length + d.vencidas.length);
}

/* ============================================================================
   Los toques de la pantalla
   ============================================================================ */

async function alTocar(ev) {
  if (ev.target.closest('[data-recargar]')) { location.reload(); return; }

  const vista = ev.target.closest('[data-vista]');
  if (vista) { _vista = vista.dataset.vista; _dia = null; await recargar(); return; }

  const mueve = ev.target.closest('[data-mueve]');
  if (mueve) {
    const n = Number(mueve.dataset.mueve) || 0;
    _ancla = _vista === 'semana' ? masDias(iniSemana(_ancla), n * 7) : masMeses(_ancla, n);
    _dia = null;
    await recargar();
    return;
  }
  if (ev.target.closest('[data-hoy]')) { _ancla = hoyISO(); _dia = null; await recargar(); return; }
  if (ev.target.closest('[data-cobro]')) { _soloCobro = !_soloCobro; await recargar(); return; }
  if (ev.target.closest('[data-pasadas]')) { _pasadas = !_pasadas; await recargar(); return; }
  if (ev.target.closest('[data-agendar]')) { abrirAgendar(null); return; }

  const enDia = ev.target.closest('[data-agendar-en]');
  if (enDia) { abrirAgendar(enDia.dataset.agendarEn); return; }

  const celda = ev.target.closest('[data-dia]');
  if (celda) {
    const iso = celda.dataset.dia;
    const dia = _d && _d.mes ? (_d.mes.dias || []).find(x => x.fecha === iso) : null;
    const libre = !visibles(dia ? dia.instalaciones : []).length;
    /* Un día libre del futuro no abre una lista vacía: abre el panel de agendar con esa
       fecha ya puesta. Ese es el medio toque del «toque y medio». */
    if (libre && puedeAgendar() && iso >= (_d ? _d.hoy : hoyISO())) { abrirAgendar(iso); return; }
    _dia = _dia === iso ? null : iso;
    await recargar();
    return;
  }

  await despachar(ev);
}

/** Los `data-acc` son los mismos en el renglón y en la ficha, así que se despachan por el
 *  mismo camino: una sola tabla de acciones, no dos que se desincronizan al mes. */
async function despachar(ev) {
  const b = ev.target.closest('[data-acc]');
  if (!b) return;
  ev.preventDefault();
  b.disabled = true;
  try { await ejecutar(b.dataset.acc, b.dataset.id || ''); }
  catch (e) {
    /* La capa de datos no lanza nunca. Si algo llega aquí es un error de programación de
       esta pantalla, y se dice en vez de dejar el botón muerto sin explicación. */
    console.error('la acción de la agenda falló', e);
    toast('Algo se rompió al hacer eso. Recarga la plataforma y vuelve a intentarlo.', 'err', 4600);
  }
  if (b.isConnected) b.disabled = false;
}

/** La instalación por id, buscándola donde esté pintada. Se busca en lo ya leído y no en la
 *  base para que un toque no cueste otra lectura: si no está, es que la pantalla se quedó
 *  vieja, y eso se dice. */
function instDe(id) {
  if (!_d) return null;
  const pozos = [_d.dia || [], _d.filas || []];
  if (_d.mes) for (const x of (_d.mes.dias || [])) pozos.push(x.instalaciones || []);
  for (const p of pozos) { const i = p.find(x => x && x.id === id); if (i) return i; }
  return null;
}

async function ejecutar(acc, id) {
  if (acc === 'ajustes') { if (_ctx) _ctx.ir('ajustes'); return; }
  if (acc === 'ics-ritmo') { await compartirIcs(Ics.ritmo(), 'al3d-ritmo.ics', 'el ritmo'); return; }
  if (acc === 'ics-mes') { await bajarVarias(); return; }

  const i = instDe(id);
  if (!i) { toast('Esa instalación ya no está en la lista. Recarga la pantalla.', 'err', 4200); return; }
  const p = i.proyecto || {};

  switch (acc) {
    case 'ics':
      await compartirIcs(Ics.evento(Agenda.paraIcs(i, p)),
        'instalacion-' + (p.folio_local || i.id) + '.ics', i.titulo);
      return;

    case 'orden':
      abrirOrden(Reglas.mensajeWa('orden_instalador', { proyecto: p, instalacion: i }).texto);
      return;

    case 'cliente': {
      const r = Reglas.mensajeWa('confirmar_cliente', { proyecto: p, instalacion: i });
      if (r.url) { window.open(r.url, '_blank', 'noopener'); return; }
      copiarTexto(r.texto, 'El proyecto no trae teléfono del cliente, así que se copió el mensaje. Pégalo en su chat.');
      return;
    }

    case 'ficha': abrirFicha(i); return;
    case 'mover': abrirMover(i); return;
    case 'cancelar': abrirCancelar(i); return;

    case 'hecha': {
      const r = await Agenda.marcar(i.id, 'hecha');
      avisarResultado(r, 'Marcada como hecha');
      if (r.ok) { cerrarPide(); await recargar(); }
      return;
    }

    case 'gcal': {
      const r = await Gcal.crearEvento(Agenda.paraIcs(i, p));
      /* No se guarda el `gcal_event_id`. El id que Calendar recibe es determinista sobre el
         UID de la instalación, así que volver a darle al botón no duplica nada; escribirlo
         desde aquí sería inventarle a §5.7 una mutación que no tiene. */
      avisarResultado(r, r.ok && r.valor && r.valor.yaEstaba
        ? 'Ese evento ya estaba en el calendario'
        : 'Evento creado. La invitación ya les llegó a los tres.');
      return;
    }
  }
}

/** Comparte el .ics y, si el teléfono no comparte archivos, lo descarga. Un archivo vacío no
 *  se ofrece: `Ics.evento` devuelve '' cuando le falta el UID o la fecha, y bajar cero bytes
 *  con un aviso de éxito es la peor manera de enterarse. */
async function compartirIcs(texto, nombre, quien) {
  if (!texto) {
    toast('No se pudo armar el archivo del calendario. Abre la instalación y revisa que tenga día.', 'err', 4600);
    return;
  }
  if (await compartirArchivo(texto, nombre, MIME_ICS)) {
    toast('Ábrelo para que ' + (quien ? '«' + quien + '»' : 'la instalación') +
      ' entre a tu calendario con sus alarmas.', 'ok', 5200);
  }
}

async function bajarVarias() {
  if (!_d) return;
  const todas = _vista === 'mes' && _d.mes
    ? (_d.mes.dias || []).flatMap(x => x.instalaciones || [])
    : (_d.filas || []);
  const vivas = visibles(todas).filter(i => i.estado !== 'cancelada');
  if (!vivas.length) { toast('No hay instalaciones que bajar en lo que estás viendo.', '', 3400); return; }
  const sello = _vista === 'mes' && _d.mes ? _d.mes.anio + '-' + p2(_d.mes.mes) : hoyISO();
  await compartirIcs(Ics.calendario(vivas.map(i => Agenda.paraIcs(i, i.proyecto || {}))),
    'agenda-al3d-' + sello + '.ics',
    vivas.length === 1 ? 'la instalación' : 'las ' + vivas.length + ' instalaciones');
}

/* ============================================================================
   Los paneles
   ============================================================================ */

/* `abrirCapa` con `hist:true` empuja una entrada de historial para que el botón atrás del
   teléfono cierre el modal. Llamarla otra vez sobre una capa que YA está abierta —el panel
   de agendar tiene dos pasos, y la ficha se convierte en «mover»— empuja una segunda
   entrada que nadie consume: a partir de ahí el atrás del teléfono deja de cerrar el modal
   al primer toque. Así que cuando la capa ya está abierta solo se cambia el contenido, y el
   foco se lleva a mano al panel nuevo, que es lo que hacía `abrirCapa`. */
function ponerEnCapa(id, html) {
  const capa = $(id);
  if (!capa) return;
  capa.innerHTML = '<div class="pf-panel">' + html + '</div>';
  if (!capa.classList.contains('show')) { abrirCapa(id, { hist: true }); return; }
  const f = capa.querySelector('button:not([disabled]),input,textarea,a[href]');
  if (f) requestAnimationFrame(() => { try { f.focus(); } catch (_) {} });
}

const cabeza = (titulo, cerrar) =>
  '<div class="pf-panel-h"><h2>' + esc(titulo) + '</h2>' +
  '<button type="button" class="pf-cerrar" ' + cerrar + ' aria-label="Cerrar">' +
  ico('i-cerrar') + '</button></div>';

function cerrarHoja() {
  _hoja = null;
  cerrarCapa('pf-hoja');
  const capa = $('pf-hoja'); if (capa) capa.innerHTML = '';
}
function cerrarPide() {
  _pide = null;
  cerrarCapa('pf-pide');
  const capa = $('pf-pide'); if (capa) capa.innerHTML = '';
}

/* ============================================================================
   Agendar — la única captura del sistema
   ============================================================================ */

/** Paso 1: qué proyecto. Si viene con fecha, la fecha ya está elegida y solo falta el
 *  proyecto: eso es el toque y medio. */
function abrirAgendar(fecha) {
  if (!puedeAgendar()) {
    toast('Agendar es de dirección. Si te toca a ti, cambia de rol en Ajustes.', 'err', 4600);
    return;
  }
  if (!((_d && _d.sinFecha) || []).length) {
    _hoja = { paso: 'nada' };
    ponerEnCapa('pf-hoja',
      cabeza('Agendar una instalación', 'data-h="cerrar"') +
      '<div class="pf-panel-b">' +
      vacio('Todos los proyectos ganados ya tienen día',
        'Cuando marques una cotización como ganada y la guardes sin fecha, aparece aquí para agendarla. Para mover una que ya está, ábrela desde el calendario.') +
      '</div><div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-h="cerrar">Cerrar</button></div>');
    return;
  }
  _hoja = { paso: 'elegir', fecha: fecha || null, filtro: '' };
  pintarPaso1();
}

function pintarPaso1() {
  const sinFecha = (_d && _d.sinFecha) || [];
  const q = String(_hoja.filtro || '').trim().toLowerCase();
  const lista = q
    ? sinFecha.filter(p => [p.nombre, p.contacto, p.negocio, p.folio_local].join(' ')
        .toLowerCase().includes(q))
    : sinFecha;

  /* El buscador solo aparece cuando la lista deja de caber de un barrido. Un campo de
     búsqueda encima de tres renglones es un campo que se salta y estorba. */
  const buscador = sinFecha.length > 8
    ? '<div class="fld"><label for="pf-ag-q">Buscar</label>' +
      '<input type="search" id="pf-ag-q" value="' + esc(_hoja.filtro || '') +
      '" placeholder="Cliente, negocio o folio" autocomplete="off"></div>'
    : '';

  const filas = lista.length
    ? lista.map(p => '<div class="pf-fila">' +
        '<div class="pf-fila-ico">' + ico('i-proyectos') + '</div>' +
        '<div class="pf-fila-tx"><div class="pf-fila-t">' + esc(p.nombre || p.folio_local) + '</div>' +
        '<div class="pf-fila-d">' + esc([p.folio_local, (p.tipo_trabajo || []).join(', '),
            p.compromiso_texto ? 'Se le prometió: ' + p.compromiso_texto : ''
          ].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div class="pf-fila-acc"><button type="button" class="btn btn-pri" data-h="elige" data-pid="' +
          esc(p.id) + '">Elegir</button></div></div>').join('')
    : '<p class="pf-cuenta">Ningún proyecto sin fecha coincide con eso.</p>';

  ponerEnCapa('pf-hoja',
    cabeza(_hoja.fecha ? 'Agendar el ' + fmtFecha(_hoja.fecha) : 'Agendar una instalación',
           'data-h="cerrar"') +
    '<div class="pf-panel-b">' +
      '<p class="pf-cuenta">Estos son los proyectos ganados que todavía no tienen día.</p>' +
      buscador + filas +
    '</div><div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-h="cerrar">Cancelar</button>' +
    '</div>');
}

/** Paso 2: el día. Es lo único que se pide de verdad; todo lo demás viene puesto. */
async function pintarPaso2(pid) {
  const p = await Proyectos.obtener(pid);
  if (!p) { toast('Ese proyecto ya no está en este dispositivo.', 'err', 4200); cerrarHoja(); return; }

  /* La fecha propuesta, por orden: la del día que se tocó en la rejilla; si no, la de la
     última instalación que tuvo este proyecto —una cancelada guarda la fecha que alguien ya
     había prometido—; y si no, hoy. Lo que NO se hace nunca es parsear `compromiso_texto`:
     es el texto crudo del cotizador («Viernes 15 de Agosto») y adivinar de qué año y de qué
     agosto habla es exactamente el error que §4.4 prohíbe. Se pinta al lado del campo para
     que lo lea una persona, que sí sabe. */
  const previas = await Agenda.listar({ proyecto_id: pid });
  const propuesta = (_hoja && _hoja.fecha) ||
    (previas.length ? previas[previas.length - 1].fecha : null) || hoyISO();
  const dur = Agenda.duracionSugerida(p.tipo_trabajo);
  const tipos = (p.tipo_trabajo || []).join(', ');

  const ventanas = Agenda.VENTANAS.map(v =>
    chip(Agenda.VENTANA_NOMBRE[v], v === 'dia',
      'data-h="ventana" data-v="' + v + '" title="' + esc(Agenda.VENTANA_DESC[v] || '') + '"')).join('');

  _hoja = { paso: 'fecha', pid, ventana: 'dia', proyecto: p };

  ponerEnCapa('pf-hoja',
    cabeza('¿Qué día se instala?', 'data-h="cerrar"') +
    '<div class="pf-panel-b">' +
      '<dl class="pf-dato"><dt>Proyecto</dt><dd>' + esc(p.nombre || p.folio_local) + '</dd></dl>' +
      (p.compromiso_texto
        ? '<dl class="pf-dato"><dt>Lo que se le prometió al cliente</dt><dd>' +
          esc(p.compromiso_texto) + '</dd></dl>' : '') +
      (p.dir_texto
        ? '<dl class="pf-dato"><dt>Dónde</dt><dd>' +
          esc(String(p.dir_texto).replace(/\s*\n\s*/g, ', ')) + '</dd></dl>' : '') +

      '<div class="fld"><label for="pf-ag-fecha">Día de la instalación</label>' +
        '<input type="date" id="pf-ag-fecha" value="' + esc(propuesta) + '"></div>' +

      '<div class="fld"><label for="pf-ag-hora">Hora, si ya se sabe</label>' +
        '<input type="time" id="pf-ag-hora" value=""></div>' +
      '<p class="hintnote">Déjala vacía si todavía no hay hora: se agenda como evento de todo el día y así queda en el calendario de todos. Es una respuesta, no un hueco — la hora casi siempre depende de que el cliente o la plaza confirmen el acceso.</p>' +

      '<div class="fld"><span class="fld-lab">Ventana</span>' +
        '<div class="chips" role="group" aria-label="Ventana de instalación">' + ventanas + '</div></div>' +

      '<div class="fld"><label for="pf-ag-dur">Cuánto va a durar, en minutos</label>' +
        '<input type="number" id="pf-ag-dur" min="30" max="600" step="30" value="' + dur + '"></div>' +
      '<p class="hintnote">Salieron ' + dur + ' minutos de lo que lleva el proyecto' +
        (tipos ? ' (' + esc(tipos) + ')' : '') + '. Si sabes que son otros, cámbialo.</p>' +

      '<div class="fld"><label for="pf-ag-notas">Algo que haya que saber</label>' +
        '<textarea id="pf-ag-notas" rows="2" placeholder="Hay que subir por atrás, no hay elevador…"></textarea></div>' +

      (soloPropone()
        ? '<p class="hintnote nota-av">Lo que guardes queda como <b>propuesta</b> y dirección la confirma. La fecha que el cliente escuchó la dijo una sola persona: si dos la mueven, ya no hay forma de saber cuál fue la que se prometió.</p>'
        : '') +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-h="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-ok" data-h="guardar">Agendar</button>' +
    '</div>');
}

const valor = id => { const e = $(id); return e ? e.value : ''; };

async function guardarAgenda() {
  if (!_hoja || _hoja.paso !== 'fecha') return;
  const fecha = valor('pf-ag-fecha');
  if (!fecha) { toast('Falta el día. Es el único dato que la plataforma te pide.', 'err', 4200); return; }

  const r = await Agenda.agendar(_hoja.pid, {
    fecha,
    hora: valor('pf-ag-hora'),
    ventana: _hoja.ventana,
    duracion_min: Number(valor('pf-ag-dur')) || undefined,
    notas: valor('pf-ag-notas'),
  });
  if (!r.ok) { toast(r.mensaje, 'err', 5200); return; }

  const inst = r.valor;
  const p = _hoja.proyecto || {};
  _ancla = inst.fecha;
  _dia = inst.fecha;

  /* Y aquí NO se cierra el panel: se ofrece el .ics en el mismo lugar donde acabó de
     guardar. Es el momento en que existen las alarmas de −3 días, −1 día y −30 minutos, y
     si nadie importa el archivo la fecha quedó guardada y nadie va a acordarse de ella.
     Cerrar aquí sería guardar el dato y perder la automatización completa. */
  _hoja = { paso: 'listo', inst, proyecto: p };
  ponerEnCapa('pf-hoja',
    cabeza('Ya está agendada', 'data-h="cerrar"') +
    '<div class="pf-panel-b">' +
      '<dl class="pf-dato"><dt>' + esc(p.nombre || 'La instalación') + '</dt><dd>' +
        esc(fmtFechaDia(inst.fecha) + ' · ' +
            (inst.hora ? fmtHora(inst.hora) : 'sin hora, todo el día')) + '</dd></dl>' +
      (inst.estado === 'propuesta'
        ? '<p class="hintnote nota-av">Quedó como propuesta: dirección la confirma.</p>' : '') +
      '<p class="hintnote">Falta lo que hace que suene: bájala al calendario del teléfono. Las alarmas de 3 días, 1 día y media hora antes las dispara el calendario, no esta plataforma.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-pri" data-h="ics">Al calendario</button>' +
      '<button type="button" class="btn btn-gho" data-h="cerrar">Después</button>' +
    '</div>');

  await recargar();
}

async function alTocarHoja(ev) {
  const b = ev.target.closest('[data-h]');
  if (!b) return;
  const q = b.dataset.h;
  ev.preventDefault();

  if (q === 'cerrar') { cerrarHoja(); return; }

  if (q === 'elige') { await pintarPaso2(b.dataset.pid); return; }

  if (q === 'ventana') {
    if (!_hoja) return;
    _hoja.ventana = b.dataset.v;
    /* Los tres chips se repintan a mano en vez de rearmar el panel: rearmarlo perdería la
       fecha, la hora y las notas que ya estaban escritas. */
    const capa = $('pf-hoja');
    if (capa) capa.querySelectorAll('[data-h="ventana"]').forEach(x => {
      const on = x.dataset.v === _hoja.ventana;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    return;
  }

  if (q === 'guardar') {
    b.disabled = true;
    await guardarAgenda();
    if (b.isConnected) b.disabled = false;
    return;
  }

  if (q === 'ics') {
    const h = _hoja;
    if (h && h.inst) {
      await compartirIcs(Ics.evento(Agenda.paraIcs(h.inst, h.proyecto || {})),
        'instalacion-' + ((h.proyecto || {}).folio_local || h.inst.id) + '.ics',
        (h.proyecto || {}).nombre);
    }
    cerrarHoja();
  }
}

/* El buscador del paso 1 se lee al escribir. Está en un oyente de `input` de la capa y no de
   `document` para que se vaya con `desmontar()`, y comprueba el id: sin eso, teclear la hora
   o las notas del paso 2 repintaría el panel a medio llenar. */
function alEscribirHoja(ev) {
  const t = ev.target;
  if (!_hoja || _hoja.paso !== 'elegir' || !t || t.id !== 'pf-ag-q') return;
  _hoja.filtro = t.value;
  const pos = t.selectionStart;
  pintarPaso1();
  const nuevo = $('pf-ag-q');
  if (nuevo) {
    try { nuevo.focus({ preventScroll: true }); nuevo.setSelectionRange(pos, pos); } catch (_) {}
  }
}

/* ============================================================================
   La ficha, y lo que se pregunta antes de cambiar una fecha
   ============================================================================ */

function abrirFicha(i) {
  const p = i.proyecto || {};
  const mapa = linkMapa(p);
  const cancelada = i.estado === 'cancelada';
  const sem = i.semaforo || (_d ? _d.sem.get(i.fecha) : null);

  const datos = [
    ['Cuándo', fmtFechaDia(i.fecha) + ' · ' + (i.hora ? fmtHora(i.hora) : 'sin hora, todo el día')],
    ['Ventana', Agenda.VENTANA_NOMBRE[i.ventana] || 'De día'],
    ['Cómo va', Agenda.ESTADO_NOMBRE[i.estado] || i.estado],
    ['A quién se busca', [p.contacto, p.tel].filter(Boolean).join(' · ')],
    ['Qué se instala', (p.tipo_trabajo || []).join(', ')],
    ['Dónde', String(p.dir_texto || '').replace(/\s*\n\s*/g, ', ')],
    ['Entre calles', p.entrecalles],
    ['Notas', i.notas],
  ];
  if (Prefs.veDinero() && Number(p.pago_pendiente) > 0) {
    datos.push(['Saldo por cobrar', money(p.pago_pendiente)]);
  }

  const acc = [];
  if (!cancelada && veWa()) {
    acc.push('<button type="button" class="btn-wa" data-acc="cliente" data-id="' + esc(i.id) + '">' +
      ico('i-wa') + 'Confirmar al cliente</button>');
    acc.push('<button type="button" class="btn btn-gho" data-acc="orden" data-id="' + esc(i.id) +
      '">Orden al instalador</button>');
  }
  acc.push('<button type="button" class="btn btn-gho" data-acc="ics" data-id="' + esc(i.id) +
    '">Al calendario del teléfono</button>');
  if (!cancelada && Gcal.disponible() && Prefs.rol() === 'direccion') {
    acc.push('<button type="button" class="btn btn-gho" data-acc="gcal" data-id="' + esc(i.id) +
      '">Crearla en Google Calendar</button>');
  }
  if (puedeAgendar() && !cancelada) {
    acc.push('<button type="button" class="btn btn-gho" data-acc="mover" data-id="' + esc(i.id) +
      '">Mover de día</button>');
    if (i.estado !== 'hecha') {
      acc.push('<button type="button" class="btn btn-ok" data-acc="hecha" data-id="' + esc(i.id) +
        '">Ya se instaló</button>');
    }
    acc.push('<button type="button" class="btn btn-gho" data-acc="cancelar" data-id="' + esc(i.id) +
      '">Cancelarla</button>');
  }

  _pide = { modo: 'ficha', id: i.id };
  ponerEnCapa('pf-pide',
    cabeza(p.nombre || i.titulo || 'Instalación', 'data-pide="cerrar"') +
    '<div class="pf-panel-b">' +
      (veSemaforo() && sem && !cancelada ? renglonSem(sem) : '') +
      '<div class="pf-2col">' + datos.filter(x => x[1]).map(x =>
        '<dl class="pf-dato"><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></dl>').join('') +
      '</div>' +
      (mapa ? '<p><a class="btn btn-gho pf-btn-corto" href="' + esc(mapa) +
        '" target="_blank" rel="noopener">' + ico('i-pin') + 'Ver en Maps</a></p>' : '') +
      '<div class="pf-acciones">' + acc.join('') + '</div>' +
    '</div>' +
    '<div class="pf-panel-f"><button type="button" class="btn btn-gho" data-pide="cerrar">Cerrar</button></div>');
}

/** La orden del instalador. Va en un panel y no directo a WhatsApp por una razón que muerde:
 *  el único teléfono que el sistema conoce es el del CLIENTE, y `Reglas.mensajeWa` arma su
 *  `url` con ese. Mandar la orden de trabajo por ahí sería mandarle al cliente lo que se le
 *  dice al instalador. Así que el link va SIN número: WhatsApp abre y pregunta a quién, que
 *  es justo el paso que falta. Y como el instalador no tiene acceso a la app por decisión del
 *  director, este texto ES su interfaz: se puede leer completo antes de mandarlo. */
function abrirOrden(texto) {
  _pide = { modo: 'orden', texto };
  ponerEnCapa('pf-pide',
    cabeza('Orden de trabajo', 'data-pide="cerrar"') +
    '<div class="pf-panel-b">' +
      '<p class="pf-cuenta">Esto es todo lo que el instalador necesita: dónde es, a qué hora, a quién buscar y qué se instala. No lleva ni un peso.</p>' +
      '<div class="fld"><label for="pf-orden-tx">El mensaje</label>' +
        '<textarea id="pf-orden-tx" rows="12" readonly>' + esc(texto) + '</textarea></div>' +
      '<p class="hintnote">WhatsApp abre sin destinatario y tú eliges a quién: la plataforma no guarda el teléfono del instalador, y el único número que trae el proyecto es el del cliente.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="copiar">Copiar</button>' +
      '<a class="btn-wa" href="' + esc(linkWa('', texto)) +
        '" target="_blank" rel="noopener" data-pide="ir">' + ico('i-wa') + 'Abrir WhatsApp</a>' +
    '</div>');
}

function abrirMover(i) {
  _pide = { modo: 'mover', id: i.id };
  ponerEnCapa('pf-pide',
    cabeza('Mover de día', 'data-pide="cerrar"') +
    '<div class="pf-panel-b">' +
      '<dl class="pf-dato"><dt>Está agendada</dt><dd>' +
        esc(fmtFechaDia(i.fecha) + (i.hora ? ' · ' + fmtHora(i.hora) : ' · sin hora')) + '</dd></dl>' +
      '<div class="fld"><label for="pf-mv-fecha">Día nuevo</label>' +
        '<input type="date" id="pf-mv-fecha" value="' + esc(i.fecha) + '"></div>' +
      '<div class="fld"><label for="pf-mv-hora">Hora, si ya se sabe</label>' +
        '<input type="time" id="pf-mv-hora" value="' + esc(i.hora || '') + '"></div>' +
      '<div class="fld"><label for="pf-mv-motivo">Por qué se movió</label>' +
        '<input type="text" id="pf-mv-motivo" placeholder="El cliente pidió otro día, llovió…"></div>' +
      '<p class="hintnote">El motivo se apunta junto con las dos fechas. «¿Por qué se movió?» es la pregunta que se hace tres semanas después, y para entonces nadie se acuerda.</p>' +
      '<p class="hintnote nota-av">Después de mover, vuelve a bajar el archivo del calendario: es lo que hace que el evento se corrija en el teléfono en vez de quedar duplicado.</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">Cancelar</button>' +
      '<button type="button" class="btn btn-pri" data-pide="mover">Mover</button>' +
    '</div>');
}

function abrirCancelar(i) {
  _pide = { modo: 'cancelar', id: i.id };
  ponerEnCapa('pf-pide',
    cabeza('Cancelar la instalación', 'data-pide="cerrar"') +
    '<div class="pf-panel-b">' +
      '<p class="pf-cuenta">' + esc((i.titulo || 'La instalación') + ' del ' + fmtFecha(i.fecha)) +
        '. El proyecto vuelve a quedar sin fecha y la plataforma te lo va a recordar.</p>' +
      '<div class="fld"><label for="pf-cn-motivo">Por qué</label>' +
        '<input type="text" id="pf-cn-motivo" placeholder="El cliente lo detuvo, falta obra civil…"></div>' +
      '<p class="hintnote">La cancelación se guarda y se ve. Esconderla es lo mismo que no haberla guardado, y de ahí sale la llamada de «¿entonces sí van a venir?».</p>' +
    '</div>' +
    '<div class="pf-panel-f">' +
      '<button type="button" class="btn btn-gho" data-pide="cerrar">No, déjala</button>' +
      '<button type="button" class="btn btn-pri" data-pide="cancelar">Cancelarla</button>' +
    '</div>');
}

async function alTocarPide(ev) {
  /* Los botones de la ficha son `data-acc`, los mismos del renglón, y se despachan por el
     mismo camino. */
  if (ev.target.closest('[data-acc]')) { await despachar(ev); return; }

  const b = ev.target.closest('[data-pide]');
  if (!b) return;
  const q = b.dataset.pide;
  if (q === 'ir') return;                        // es un <a> a wa.me: se deja pasar
  ev.preventDefault();

  if (q === 'cerrar') { cerrarPide(); return; }

  if (q === 'copiar') {
    copiarTexto((_pide && _pide.texto) || '', 'Orden copiada. Pégala en el chat del instalador.');
    return;
  }

  if (q === 'mover') {
    const fecha = valor('pf-mv-fecha');
    if (!fecha) { toast('Falta el día nuevo.', 'err'); return; }
    b.disabled = true;
    const r = await Agenda.reagendar(_pide.id,
      { fecha, hora: valor('pf-mv-hora'), motivo: valor('pf-mv-motivo') });
    avisarResultado(r, 'Movida al ' + fmtFecha(fecha));
    if (r.ok) { _ancla = fecha; _dia = fecha; cerrarPide(); await recargar(); }
    else if (b.isConnected) b.disabled = false;
    return;
  }

  if (q === 'cancelar') {
    b.disabled = true;
    const r = await Agenda.cancelar(_pide.id, valor('pf-cn-motivo'));
    avisarResultado(r, 'Instalación cancelada');
    if (r.ok) { cerrarPide(); await recargar(); }
    else if (b.isConnected) b.disabled = false;
  }
}
